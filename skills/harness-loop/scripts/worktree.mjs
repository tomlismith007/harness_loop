#!/usr/bin/env node
/**
 * worktree.mjs — 一次尝试一个 worktree，带 manifest
 *
 * 问题：技能让人手敲 `git worktree add/remove`。手敲意味着
 *   - REJECT 之后是否丢弃，靠自觉；
 *   - 残留的 worktree 与分支没人对账；
 *   - 有未提交改动时 `--force` 会静默销毁。
 *
 * 做法：把 worktree 生命周期记进 `.loop-worktrees/manifest.json`，
 * cleanup 只碰已并入 base 的 rejected / escalated / merged，且**不带 --force**——
 * git 会拒绝删除有未提交改动的 worktree，这里把这个拒绝如实报告出来。
 *
 * 用法：
 *   node scripts/worktree.mjs create --run-id <id> [--base main] [--state <dir>]
 *   node scripts/worktree.mjs mark --run-id <id> --status rejected|escalated|merged
 *   node scripts/worktree.mjs cleanup [--state <dir>]
 *   node scripts/worktree.mjs list [--json]
 *
 * 退出码：0 成功；1 参数错误；2 有 worktree 因未提交改动未被清理。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags, isEntryPoint } from './lib/common.mjs';

export const MANIFEST_DIR = '.loop-worktrees';
export const MANIFEST_FILE = `${MANIFEST_DIR}/manifest.json`;
export const STATUSES = ['active', 'rejected', 'escalated', 'merged'];
/** 所有终态在删除前都须确认已并入 base；未合并的记录保留原状态供重试。 */
export const CLEANUP_STATUSES = ['rejected', 'escalated', 'merged'];

/** 清掉继承的 GIT_*：pre-commit hook 里跑时会指向外层仓库。 */
function gitEnv() {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];
  return env;
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', env: gitEnv(), maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isGitRepo(root) {
  try { return git(['rev-parse', '--is-inside-work-tree'], root) === 'true'; } catch { return false; }
}

/** run-id 会成为目录名与分支名：只允许安全字符。 */
export function validRunId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9._-]+$/.test(id) && id !== '.' && id !== '..';
}

export function readManifest(root) {
  const p = path.join(root, MANIFEST_FILE);
  if (!fs.existsSync(p)) return { version: 1, worktrees: [] };
  let parsed;
  try { parsed = JSON.parse(readText(p)); } catch { fail(`${MANIFEST_FILE} is not valid JSON`, 1); }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.worktrees)) {
    fail(`${MANIFEST_FILE}: expected { version: 1, worktrees: [] }`, 1);
  }
  return parsed;
}

function writeManifest(root, manifest) {
  fs.mkdirSync(path.join(root, MANIFEST_DIR), { recursive: true });
  const p = path.join(root, MANIFEST_FILE);
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, p);
}

function create(root, runId, base) {
  if (!isGitRepo(root)) fail(`${root} is not a git repository`, 1);
  if (!validRunId(runId)) fail(`--run-id may contain only letters, digits, ".", "_", "-" (got: ${runId})`, 1);

  const manifest = readManifest(root);
  const existing = manifest.worktrees.find((w) => w.id === runId);
  if (existing && existing.status === 'active') {
    fail(`run id "${runId}" already has an active worktree at ${existing.path}`, 1);
  }

  // 运行设施是本地状态，不应改主检出的受版本控制文件。
  // Git 的本地 exclude 同样适用于新建的 worktree，并保留已有规则。
  const ignore = path.resolve(root, git(['rev-parse', '--git-path', 'info/exclude'], root));
  const ignoreText = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
  if (!/^\/?\.loop-worktrees\/?\s*$/m.test(ignoreText)) {
    fs.mkdirSync(path.dirname(ignore), { recursive: true });
    fs.writeFileSync(ignore, `${ignoreText}${ignoreText.endsWith('\n') || !ignoreText ? '' : '\n'}/${MANIFEST_DIR}/\n`, 'utf8');
    process.stdout.write(`added /${MANIFEST_DIR}/ to Git local exclude\n`);
  }

  const rel = `${MANIFEST_DIR}/${runId}`;
  const branch = `loop/${runId}`;
  try {
    git(['worktree', 'add', '-b', branch, rel, base], root);
  } catch (e) {
    fail(`git worktree add failed: ${(e.stderr || e.message || '').trim()}`, 1);
  }

  const entry = {
    id: runId, path: rel, branch, baseBranch: base,
    createdAt: new Date().toISOString(), status: 'active',
  };
  manifest.worktrees = manifest.worktrees.filter((w) => w.id !== runId);
  manifest.worktrees.push(entry);
  writeManifest(root, manifest);
  process.stdout.write(`created ${rel} on ${branch} (status: active)\n`);
}

function mark(root, runId, status) {
  if (!STATUSES.includes(status)) {
    fail(`--status must be one of: ${STATUSES.join(', ')} (got: ${status})`, 1);
  }
  const manifest = readManifest(root);
  const entry = manifest.worktrees.find((w) => w.id === runId);
  if (!entry) fail(`no worktree with run id "${runId}" in ${MANIFEST_FILE}`, 1);
  entry.status = status;
  writeManifest(root, manifest);
  process.stdout.write(`${runId} → ${status}\n`);
}

function cleanup(root) {
  if (!isGitRepo(root)) fail(`${root} is not a git repository`, 1);
  const manifest = readManifest(root);
  const removed = [];
  const skipped = [];

  for (const entry of manifest.worktrees) {
    if (!CLEANUP_STATUSES.includes(entry.status)) continue;
    // 所有终态都可能含未合并的提交，必须在删除目录或分支之前保护它们。
    {
      const base = entry.baseBranch || entry.base || 'HEAD';
      let mergedIntoBase = false;
      try {
        if (entry.branch) {
          git(['merge-base', '--is-ancestor', entry.branch, base], root);
          mergedIntoBase = true;
        }
      } catch { /* 无法证明已合并时保留目录与分支 */ }
      if (!mergedIntoBase) {
        skipped.push({ entry, reason: `marked ${entry.status} but ${entry.branch} is not merged into ${base} — refusing to delete it` });
        continue;
      }
    }
    let removeError = null;
    try {
      // 不带 --force：有未提交改动时 git 会拒绝，这里如实报告而不是销毁。
      git(['worktree', 'remove', entry.path], root);
    } catch (e) {
      removeError = (e.stderr || e.message || '').trim().split('\n')[0];
      // worktree 已经不在了（上一轮删了目录但分支没删掉）：这不是失败，
      // 继续去删分支。否则条目会永远卡在 manifest 里，没有任何出路。
      // shortcut: 靠 git 的报错文案区分"目录已消失"与"删不掉"，
      // git 改措辞时这里会退化成永久跳过——升级时先跑 U-13 的恢复测试。
      if (!/not a working tree|is not a working tree|no such file/i.test(removeError)) {
        skipped.push({ entry, reason: removeError });
        continue;
      }
    }
    // worktree 删掉了，但分支可能删不掉（被锁、被别处检出）。这时不能把条目
    // 从 manifest 里抹掉：分支还在，同一个 run-id 之后会永远 create 失败，
    // 而 manifest 说"已经清理过"——那是最难查的一类残留。
    let branchError = null;
    try {
      git(['branch', '-D', entry.branch], root);
    } catch (e) {
      const msg = (e.stderr || e.message || '').trim().split('\n')[0];
      // 分支本来就不存在不是错误。
      if (!/not found|no such branch/i.test(msg)) branchError = msg;
    }
    if (branchError) {
      if (entry.status !== 'merged') entry.status = 'escalated';
      entry.branchError = branchError;
      skipped.push({ entry, reason: `worktree removed but branch ${entry.branch} remains: ${branchError}` });
      continue;
    }
    if (removeError) {
      // 目录本来就不在，分支已删：条目可以安全移除。
      process.stdout.write(`pruned ${entry.path} (worktree already gone, branch removed)\n`);
    }
    removed.push(entry);
  }

  const removedIds = new Set(removed.map((e) => e.id));
  manifest.worktrees = manifest.worktrees.filter((w) => !removedIds.has(w.id));
  writeManifest(root, manifest);

  for (const e of removed) process.stdout.write(`removed ${e.path} (${e.status})\n`);
  for (const s of skipped) {
    process.stdout.write(`skipped ${s.entry.path} (${s.entry.status}) — ${s.reason}\n`);
  }
  // skipped 的条目留在 manifest 里，包括 worktree 已删但分支还在的情况——
  // 下一次 cleanup 会再次报告它，直到人处理掉那个分支。
  if (!removed.length && !skipped.length) process.stdout.write('nothing to clean up\n');
  if (skipped.length) process.exit(2);
}

function list(root, json) {
  const manifest = readManifest(root);
  if (json) { printJson({ worktrees: manifest.worktrees }); return; }
  if (!manifest.worktrees.length) { process.stdout.write('no worktrees\n'); return; }
  for (const w of manifest.worktrees) {
    process.stdout.write(`${w.id}\t${w.status}\t${w.path}\t${w.branch}\n`);
  }
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args,
    ['runId', 'status', 'base', 'state', 'json', 'help'], 'worktree');
  if (args.help) {
    process.stdout.write(`worktree — one attempt per worktree, tracked in a manifest

Usage:
  node scripts/worktree.mjs create --run-id <id> [--base main] [--state <dir>]
  node scripts/worktree.mjs mark --run-id <id> --status rejected|escalated|merged
  node scripts/worktree.mjs cleanup [--state <dir>]
  node scripts/worktree.mjs list [--json]

cleanup removes terminal worktrees only when their branch is merged into its base, never with --force.
Unmerged entries keep their worktree, branch and status for the next check.
A worktree with uncommitted changes is reported, not destroyed.
Exit codes: 0 ok · 1 bad arguments · 2 something was skipped during cleanup
`);
    return;
  }

  const command = args._[0];
  if (!command) fail('missing command: create | mark | cleanup | list', 1);
  if (args.state !== undefined && typeof args.state !== 'string') fail('--state requires a directory path', 1);
  const root = path.resolve(typeof args.state === 'string' ? args.state : '.');
  if (args.runId !== undefined && typeof args.runId !== 'string') fail('--run-id requires a value', 1);

  switch (command) {
    case 'create':
      if (!args.runId) fail('create requires --run-id', 1);
      create(root, args.runId, typeof args.base === 'string' ? args.base : 'main');
      return;
    case 'mark':
      if (!args.runId) fail('mark requires --run-id', 1);
      if (!args.status) fail('mark requires --status', 1);
      mark(root, args.runId, args.status);
      return;
    case 'cleanup':
      cleanup(root);
      return;
    case 'list':
      list(root, Boolean(args.json));
      return;
    default:
      fail(`unknown command "${command}". Use create | mark | cleanup | list.`, 1);
  }
}

if (isEntryPoint(import.meta.url)) {
  main();
}
