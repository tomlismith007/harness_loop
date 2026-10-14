#!/usr/bin/env node
/**
 * worktree.mjs — 隔离工作区的创建与丢弃
 *
 * 用法：
 *   node scripts/worktree.mjs create --event <event> --item <item> --attempt <n>
 *   node scripts/worktree.mjs discard --event <event> --item <item> --attempt <n>
 *   node scripts/worktree.mjs list
 *
 * 为什么需要这个脚本：
 *
 * `loop-constraints.md` 的 Worktrees 节写着"无人值守的代码改动必须在独立 git
 * worktree 中进行""verifier REJECT 或升级后丢弃，不留残留分支"，
 * `minimal-fix/SKILL.md` 也给了命名约定 `loop/<event>-<item>-attempt<N>`。
 * 但全仓库没有任何代码创建或清理 worktree——审计脚本只用
 * `/worktree/i.test(corpus)` 给文档打分。于是这条硬要求在落地时全靠 agent 自觉，
 * 而"不留残留分支"这种清理动作恰恰是最容易被忘掉的一类。
 *
 * 退出码：0 成功；1 参数错误或 git 失败。
 */

import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs, exists, printJson, fail, rejectUnknownFlags } from './lib/common.mjs';

/** 分支/目录命名：与 minimal-fix/SKILL.md 的约定一致。 */
export function worktreeName(event, item, attempt) {
  // 消毒：这些值会进目录名与分支名，`../` 或 `;` 会逃出预期位置。
  // 关键是把 `.` 也排除掉——只把非法字符换成 '-' 时，`../../etc` 会变成
  // `..-..-etc`，那个名字里仍含 `..`，落在 path.join 里依然可能被解析成上级目录。
  const safe = (s) => String(s).trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  const e = safe(event) || 'event';
  const i = safe(item) || 'item';
  return `loop/${e}-${i}-attempt${Number(attempt) || 1}`;
}

function git(args, cwd, opts = {}) {
  // 剥掉调用方可能带进来的 git 环境变量。
  //
  // 具体场景：本脚本在 git hook 里被调用时（例如 pre-commit），git 会设
  // GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE 指向**外层仓库**。子进程继承它们后，
  // 即使 cwd 已经是另一个仓库，git 仍会去操作外层仓库的索引——
  // 表现为 "Unable to create '.../loop/xxx/.git/index.lock': No such file or directory"。
  // 我们要的是"在 cwd 这个仓库里干活"，所以这些变量必须清掉。
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR']) {
    delete env[k];
  }
  try {
    return { ok: true, out: execFileSync('git', args, { encoding: 'utf8', cwd, env, ...opts }) };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || ''), code: e.status };
  }
}

export function createWorktree(root, name) {
  const dir = path.join(root, name);
  if (exists(dir)) return { status: 'exists', dir };
  const r = git(['worktree', 'add', dir, '-b', name], root);
  if (!r.ok) return { status: 'error', dir, reason: r.out.trim() };
  return { status: 'created', dir, branch: name };
}

export function discardWorktree(root, name) {
  const dir = path.join(root, name);
  const removed = [];
  // 先摘 worktree，再删分支。顺序反了会让 git 拒绝删"仍被 worktree 占用"的分支。
  if (exists(dir)) {
    const r = git(['worktree', 'remove', '--force', dir], root);
    removed.push(r.ok ? 'worktree' : `worktree(${r.out.trim()})`);
  }
  const b = git(['branch', '--list', name], root);
  if (b.ok && b.out.trim()) {
    const d = git(['branch', '-D', name], root);
    removed.push(d.ok ? 'branch' : `branch(${d.out.trim()})`);
  }
  // 清理 git 的 worktree 元数据（目录被手工删掉时残留）
  git(['worktree', 'prune'], root);
  return { status: removed.length ? 'discarded' : 'absent', dir, removed };
}

export function listWorktrees(root) {
  const r = git(['worktree', 'list', '--porcelain'], root);
  if (!r.ok) return [];
  const out = [];
  let cur = null;
  for (const line of r.out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (cur) out.push(cur);
      cur = { path: line.slice('worktree '.length).trim(), branch: null };
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
    }
  }
  if (cur) out.push(cur);
  // 只报本约定下的 worktree，主工作区不列
  return out.filter((w) => (w.branch || '').startsWith('loop/'));
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['event', 'item', 'attempt', 'root', 'json', 'help'], 'worktree');

  const action = args._[0];
  if (args.help || !action) {
    process.stdout.write(`worktree — isolated workspace per fix attempt

Usage:
  node scripts/worktree.mjs create  --event <e> --item <i> [--attempt <n>]
  node scripts/worktree.mjs discard --event <e> --item <i> [--attempt <n>]
  node scripts/worktree.mjs list

Options:
  --event <e>     Event name (e.g. ci, pr-review)
  --item <i>      Work item id (e.g. ci-a1b2-main, pr-123)
  --attempt <n>   Attempt number (default: 1)
  --root <dir>    Repo root (default: cwd)
  --json          Emit JSON
  --help          Show this help

Naming follows minimal-fix/SKILL.md: loop/<event>-<item>-attempt<N>
Discard removes BOTH the worktree and the branch — "no leftover branches".

Exit codes:
  0  ok
  1  bad arguments or git failure
`);
    if (!action) process.exit(1);
    return;
  }

  const root = typeof args.root === 'string' ? args.root : process.cwd();
  const json = Boolean(args.json);

  if (action === 'list') {
    const list = listWorktrees(root);
    if (json) printJson({ worktrees: list });
    else if (!list.length) process.stdout.write('No loop/ worktrees.\n');
    else for (const w of list) process.stdout.write(`  ${w.branch}\t${w.path}\n`);
    return;
  }

  if (action !== 'create' && action !== 'discard') {
    fail(`unknown action: ${action} (expected create | discard | list)`);
  }
  if (typeof args.event !== 'string' || typeof args.item !== 'string') {
    fail(`${action} requires --event and --item`);
  }
  const name = worktreeName(args.event, args.item, args.attempt ?? 1);

  const result = action === 'create'
    ? createWorktree(root, name)
    : discardWorktree(root, name);

  if (json) printJson(result);
  else if (result.status === 'created') process.stdout.write(`Created worktree ${name}\n  ${result.dir}\n`);
  else if (result.status === 'discarded') process.stdout.write(`Discarded ${name} (${result.removed.join(', ')})\n`);
  else if (result.status === 'exists') process.stdout.write(`Worktree already exists: ${result.dir}\n`);
  else if (result.status === 'absent') process.stdout.write(`Nothing to discard for ${name}\n`);
  else process.stdout.write(`Failed: ${result.reason}\n`);

  process.exit(result.status === 'error' ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
