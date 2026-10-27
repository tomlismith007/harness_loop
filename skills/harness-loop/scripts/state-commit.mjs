#!/usr/bin/env node
/**
 * state-commit.mjs — 一轮结束时原子地更新状态文件
 *
 * 问题：第 7 步要求依次更新 STATE.md、loop-run-log.md，再跑 clean-state。
 * 七个写操作没有事务：任何一步崩溃都留下"STATE 说做完了、run-log 里没有"
 * 或相反的状态，而下一轮读的正是这些文件。实测本仓库自己就有过一次
 * `Last run` 落后两天、`loop-run-log.md` 却记了 8 轮的现场。
 *
 * 做法：先读三个文件 → 计算新内容 → 全部写临时文件 → 逐个 rename 替换。
 * rename 在同一文件系统上是原子的；任何一步失败，已经替换的文件从备份恢复。
 * 备份留在 `.harness-loop-backup/state/<timestamp>/`，可人工比对。
 *
 * 用法：
 *   node scripts/state-commit.mjs --state . --item fix-login --outcome verified \
 *     --attempts 1 --files 2 --last-run 2026-10-21 --next "下一个 item" [--dry-run]
 *
 * 退出码：0 写入（或 dry-run 成功）；1 参数错误；2 写入失败且已回滚。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags, isEntryPoint } from './lib/common.mjs';
import { localToday } from './clean-state.mjs';
import { activeItems } from './gate-check.mjs';

export const OUTCOMES = ['no-op', 'report-only', 'fix-proposed', 'verified', 'escalated'];
export const BACKUP_DIR = '.harness-loop-backup/state';

/** 把 `## Active` 表的数据行换成一行（或占位行）。结构不符时抛错而不是猜。 */
export function setActive(text, item, outcome) {
  const heading = /^##\s+Active\s*$/m;
  const m = text.match(heading);
  if (!m) throw new Error('STATE.md 没有 ## Active 节');
  const start = m.index + m[0].length;
  const rest = text.slice(start);
  const nextHeading = rest.search(/^##\s/m);
  const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  const tail = nextHeading === -1 ? '' : rest.slice(nextHeading);

  const lines = body.split('\n');
  const rowIdx = lines.findIndex((l) => l.trim().startsWith('|') && !/^\|[\s|:-]+\|?\s*$/.test(l.trim()));
  const sepIdx = lines.findIndex((l) => /^\|[\s|:-]+\|?\s*$/.test(l.trim()));
  if (rowIdx === -1 || sepIdx === -1 || sepIdx < rowIdx) {
    throw new Error('STATE.md 的 ## Active 表结构损坏（缺表头或分隔行）');
  }
  // 保留表头与分隔行，替换其余表格行。
  const tableRows = [];
  for (let i = sepIdx + 1; i < lines.length && lines[i].trim().startsWith('|'); i++) tableRows.push(i);
  const status = outcome === 'claimed' ? 'active' : outcome === 'fix-proposed' ? '等待独立验证' : outcome === 'escalated' ? 'escalated（等人工）' : null;
  const newRow = status ? `| ${item} | — | ${status} |` : '| — | — | — |';
  if (tableRows.length) {
    lines.splice(tableRows[0], tableRows.length, newRow);
  } else {
    lines.splice(sepIdx + 1, 0, newRow);
  }
  return text.slice(0, start) + lines.join('\n') + tail;
}

/** 替换 `Last run: ...` 行；没有就插到第一个标题之后。 */
export function setLastRun(text, value) {
  if (/^Last run:.*$/m.test(text)) return text.replace(/^Last run:.*$/m, `Last run: ${value}`);
  const m = text.match(/^#\s+.*$/m);
  if (!m) throw new Error('STATE.md 没有一级标题');
  const at = m.index + m[0].length;
  return `${text.slice(0, at)}\n\nLast run: ${value}${text.slice(at)}`;
}

export function runLogEntry(o) {
  return JSON.stringify({
    run_id: o.runId || new Date().toISOString(),
    item: o.item,
    duration_s: o.duration ?? 0,
    files_changed: o.files ?? 0,
    attempts: o.attempts,
    outcome: o.outcome,
    ...(o.next ? { next: o.next } : {}),
  });
}

/** 原子替换：写 tmp → rename。Windows 上 rename 覆盖已存在文件会失败，先删目标。 */
function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch {
    fs.rmSync(file, { force: true });
    fs.renameSync(tmp, file);
  }
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['state', 'item', 'outcome', 'attempts', 'files', 'duration',
    'lastRun', 'next', 'dryRun', 'json', 'help', 'claim', 'release', 'runId'], 'state-commit');
  if (args.help) {
    process.stdout.write(`state-commit — update STATE.md + loop-run-log.md atomically

Usage:
  node scripts/state-commit.mjs --state <dir> --claim --item <id> --run-id <run-id>
  node scripts/state-commit.mjs --state <dir> --release --item <id> --run-id <run-id>
  node scripts/state-commit.mjs --state <dir> --item <id> --outcome <outcome> \\
    [--run-id <run-id>] [--attempts N] [--files N] [--duration S] [--last-run YYYY-MM-DD] [--next TEXT] [--dry-run]

Outcomes: ${OUTCOMES.join(' | ')}

Claim creates an exclusive persistent active lock. The same item and run ID must
record a terminal outcome and explicitly release it after the queue handoff;
fix-proposed retains the lock while awaiting independent verification.
no-op and report-only may be recorded without a lock only when Active is empty.
An incomplete lock requires human inspection; do not remove it automatically.

Both files are written to temp files first, then renamed. On failure the already
replaced files are restored from .harness-loop-backup/state/<timestamp>/.

Exit codes: 0 written / dry-run ok · 1 bad arguments · 2 write failed (rolled back)
`);
    return;
  }

  const root = path.resolve(typeof args.state === 'string' ? args.state : '.');
  if (typeof args.item !== 'string' || !args.item.trim()) fail('--item is required', 1);
  if (/[|\r\n]/.test(args.item)) fail('--item cannot contain table separators or newlines', 1);

  const outcomeFlags = ['outcome', 'attempts', 'files', 'duration', 'lastRun', 'next'];
  if (args.claim && args.release) fail('--claim and --release are mutually exclusive', 1);
  if ((args.claim || args.release) && args.dryRun) fail('--dry-run cannot be combined with --claim or --release', 1);
  if ((args.claim || args.release) && outcomeFlags.some((flag) => args[flag] !== undefined)) {
    fail('--claim/--release cannot be combined with outcome-writing flags', 1);
  }

  const statePath = path.join(root, 'STATE.md');
  const lockDir = path.join(root, '.harness-loop-active');
  const ownerFile = path.join(lockDir, 'owner.json');
  if (!fs.existsSync(statePath)) fail(`STATE.md not found in ${root}`, 1);
  if (args.claim) {
    if (typeof args.runId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(args.runId) || args.runId === '.' || args.runId === '..') {
      fail('--claim requires a safe --run-id', 1);
    }
    try { fs.mkdirSync(lockDir); } catch (e) { fail(`cannot claim active item: ${e.message}`, 2); }
    try {
      const state = readText(statePath);
      const active = activeItems(state);
      if (active.malformed || active.count === null || active.count > 0) {
        fs.rmdirSync(lockDir);
        fail('cannot claim: STATE.md Active is missing, malformed, or already occupied', 2);
      }
      fs.writeFileSync(ownerFile, JSON.stringify({ item: args.item, runId: args.runId }) + '\n', { flag: 'wx' });
      atomicWrite(statePath, setActive(state, args.item, 'claimed'));
    } catch (e) { fail(`claim failed; inspect ${lockDir} before recovery: ${e.message}`, 2); }
    process.stdout.write(`claimed ${args.item} for ${args.runId}\n`);
    return;
  }
  let locked = false;
  let owner;
  if (fs.existsSync(lockDir)) {
    try {
      owner = JSON.parse(readText(ownerFile));
      if (!owner || typeof owner !== 'object' || Array.isArray(owner)
        || typeof owner.item !== 'string' || !owner.item.trim()
        || /[|\r\n]/.test(owner.item)
        || typeof owner.runId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(owner.runId)
        || owner.runId === '.' || owner.runId === '..'
        || (owner.outcome !== undefined && !OUTCOMES.includes(owner.outcome))) {
        throw new Error('invalid owner schema');
      }
    } catch { fail(`active lock is unreadable or malformed: ${lockDir}`, 2); }
    if (owner.item !== args.item || !args.runId || owner.runId !== args.runId) fail('active lock belongs to a different item or run', 2);
    locked = true;
  } else if (args.runId !== undefined) {
    fail('no active claim for --run-id', 2);
  }
  if (args.release) {
    if (!locked || !owner.outcome || owner.outcome === 'fix-proposed') fail('active claim has no recorded terminal outcome', 2);
    let entries;
    try { entries = fs.readdirSync(lockDir); }
    catch (e) { fail(`active lock could not be inspected: ${e.message}`, 2); }
    if (entries.length !== 1 || entries[0] !== 'owner.json') {
      fail(`active lock contains additional evidence; inspect before releasing: ${lockDir}`, 2);
    }
    try { fs.unlinkSync(ownerFile); fs.rmdirSync(lockDir); }
    catch (e) { fail(`active lock could not be released: ${e.message}`, 2); }
    process.stdout.write(`released ${args.item} for ${args.runId}\n`);
    return;
  }
  if (!OUTCOMES.includes(args.outcome)) {
    fail(`--outcome must be one of: ${OUTCOMES.join(', ')} (got: ${args.outcome})`, 1);
  }
  if (locked && owner.outcome && !args.dryRun) {
    fail(`active claim already recorded terminal outcome '${owner.outcome}'; release it before another round`, 2);
  }
  const num = (v, flag, fallback) => {
    if (v === undefined) return fallback;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) fail(`${flag} must be a non-negative number (got: ${v})`, 1);
    return n;
  };
  const attempts = num(args.attempts, '--attempts', 1);
  const files = num(args.files, '--files', 0);
  const duration = num(args.duration, '--duration', 0);
  const lastRun = typeof args.lastRun === 'string' ? args.lastRun : localToday();
  if (!/^\d{4}-\d{2}-\d{2}/.test(lastRun)) fail(`--last-run must be a date (got: ${lastRun})`, 1);
  if (!locked && !args.dryRun && !['no-op', 'report-only'].includes(args.outcome)) {
    fail('--outcome requires an active claim except no-op/report-only', 2);
  }
  if (!locked && !args.dryRun) {
    const active = activeItems(readText(statePath));
    if (active.malformed || active.count === null || active.count > 0) {
      fail('unclaimed no-op/report-only requires an empty, well-formed Active table', 2);
    }
  }

  const logPath = path.join(root, 'loop-run-log.md');
  if (!fs.existsSync(logPath)) fail(`loop-run-log.md not found in ${root} (stage 2 produces it)`, 1);

  let nextState;
  try {
    nextState = setLastRun(setActive(readText(statePath), args.item, args.outcome), lastRun);
  } catch (e) {
    fail(`cannot update STATE.md: ${e.message}`, 1);
  }
  const logText = readText(logPath);
  const nextLog = `${logText}${logText.endsWith('\n') || !logText ? '' : '\n'}${runLogEntry({
    item: args.item, runId: args.runId, outcome: args.outcome, attempts, files, duration, next: args.next,
  })}\n`;

  if (args.dryRun) {
    if (args.json) printJson({ dry_run: true, state: nextState, log_line: nextLog.split('\n').slice(-2)[0] });
    else {
      process.stdout.write(`Would write:\n  ${statePath}\n  ${logPath}\n`);
      process.stdout.write(`Would append: ${nextLog.split('\n').slice(-2)[0]}\n`);
    }
    return;
  }

  // 备份 → 写 tmp → rename。备份是回滚的唯一依据，必须在任何替换之前完成。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(root, BACKUP_DIR, stamp);
  try {
    fs.mkdirSync(backup, { recursive: true });
    fs.copyFileSync(statePath, path.join(backup, 'STATE.md'));
    fs.copyFileSync(logPath, path.join(backup, 'loop-run-log.md'));
  } catch (e) {
    // 备份失败时还没动任何文件——干净退出，不进入半写状态。
    fail(`cannot back up state files before writing: ${e.message}`, 2);
  }

  const done = [];
  try {
    atomicWrite(statePath, nextState);
    done.push(statePath);
    // 测试钩子：让第二次写入失败，用来断言回滚真的把第一个文件恢复了。
    // 只认显式的环境变量，正常路径永不设置它。
    if (process.env.STATE_COMMIT_FAIL_AFTER === '1') throw new Error('injected failure after first write');
    atomicWrite(logPath, nextLog);
    done.push(logPath);
  } catch (e) {
    // 回滚已替换的文件。回滚本身失败时如实报告——不要假装成功。
    const rollbackErrors = [];
    for (const f of done) {
      try { fs.copyFileSync(path.join(backup, path.basename(f)), f); } catch (re) { rollbackErrors.push(`${f}: ${re.message}`); }
    }
    const detail = rollbackErrors.length ? `; rollback failed: ${rollbackErrors.join('; ')}` : '; rolled back';
    fail(`state write failed: ${e.message}${detail}`, 2);
  }

  if (locked && args.outcome !== 'fix-proposed') {
    try { atomicWrite(ownerFile, JSON.stringify({ ...owner, outcome: args.outcome }) + '\n'); }
    catch (e) { fail(`state written but active lock could not be finalized: ${e.message}`, 2); }
  }

  if (args.json) printJson({ written: [statePath, logPath], backup });
  else {
    process.stdout.write(`Committed state for ${args.item} (${args.outcome})\n`);
    process.stdout.write(`  ${statePath}\n  ${logPath}\n  backup: ${backup}\n`);
  }
}

if (isEntryPoint(import.meta.url)) {
  main();
}
