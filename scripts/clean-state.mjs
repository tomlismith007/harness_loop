#!/usr/bin/env node
/**
 * clean-state.mjs — 清洁交接检查
 *
 * 一轮循环结束时，仓库必须处于"下一个会话能直接接手"的状态。
 * 这不是代码风格问题：上一轮留下的调试文件、没更新的 Last run、
 * 跑不通的 init.sh，都会让下一轮花时间猜"哪些是故意的、哪些是临时的"。
 *
 * 三项检查，全部机械可判：
 *   1. init.sh 无占位符（复用 harness-stage 的判据）
 *   2. 没有未跟踪的调试残留（*.log / debug-* / tmp-*）
 *   3. STATE.md 的 Last run 是今天
 *
 * 用法：
 *   node scripts/clean-state.mjs [--state <dir>] [--json]
 *
 * 退出码：0 干净；1 参数错误（不在 git 仓库等）；2 有未清理项。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags, isEntryPoint } from './lib/common.mjs';

/** 调试残留的判定。按**文件名模式**，不按后缀——合法的 `.log` 资产很常见。 */
export const DEBUG_PATTERNS = [
  { re: /\.log$/i, why: '日志文件' },
  { re: /^debug[-_.]/i, why: 'debug- 前缀' },
  { re: /^tmp[-_.]/i, why: 'tmp- 前缀' },
  { re: /^\.DS_Store$/, why: 'macOS 残留' },
];

export function isDebugArtifact(relPath) {
  const base = path.basename(relPath);
  return DEBUG_PATTERNS.find((p) => p.re.test(base)) || null;
}

/** init.sh 的占位符判据，与 harness-stage 保持一致。 */
export function initScriptPlaceholder(text) {
  if (!text) return 'init.sh 不存在';
  const markers = [
    /No package manifest detected/i,
    /Replace this section/i,
    /replace this line/i,
    /No test script found/i,
  ];
  for (const m of markers) if (m.test(text)) return `init.sh 含占位符：${m.source}`;
  if (!/set -e/.test(text)) return 'init.sh 缺少 set -e（失败不会中断）';
  return null;
}

/** 本地日期 YYYY-MM-DD。`toISOString()` 是 UTC——在 UTC+8 的凌晨会把"今天"算成昨天。 */
export function localToday(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** STATE.md 的 `Last run` 是否为今天（本地日期）。 */
export function lastRunStatus(stateText, today = localToday()) {
  const m = stateText.match(/^Last run:\s*(\S+)/m);
  if (!m) return { ok: false, reason: 'STATE.md 没有 Last run 行' };
  const value = m[1].trim();
  if (value === 'never') return { ok: false, reason: 'Last run 仍是 never——本轮没有写状态' };
  // 接受 ISO 日期前缀（`2026-10-19` 或 `2026-10-19T08:00:00Z`）。
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, reason: `Last run 不是日期：${value}` };
  if (date !== today) return { ok: false, reason: `Last run 是 ${date}，今天是 ${today}` };
  return { ok: true, reason: null };
}

/**
 * 未跟踪文件列表。
 *
 * 用 `-z`：默认的 porcelain 输出会把含空格/非 ASCII 的路径 C-quote 成
 * `"my folder/x.log"`，去掉前缀后 basename 仍带引号，`.log` 匹配不上——
 * 一个带空格的调试文件就能让整个检查静默放行。
 */
export function untrackedPaths(root) {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];
  const out = execFileSync('git', ['status', '--porcelain', '-z', '--untracked-files=all'], {
    cwd: root, encoding: 'utf8', env, maxBuffer: 16 * 1024 * 1024,
  });
  return out.split('\0')
    .filter((e) => e.startsWith('?? '))
    .map((e) => e.slice(3));
}

function main() {
  const args = parseArgs();
  // 两个模式互斥；同时给等于没说清要哪种语义。
  if (args.check !== undefined && args.assertFresh !== undefined) {
    fail('--check and --assert-fresh are mutually exclusive', 1);
  }
  rejectUnknownFlags(args, ['state', 'json', 'help', 'check', 'assertFresh'], 'clean-state');
  if (args.help) {
    process.stdout.write(`clean-state — verify the repo is ready for the next session

Usage:
  node scripts/clean-state.mjs [--state <dir>] [--json]

Checks:
  1. init.sh has no placeholder commands
  2. no untracked debug artifacts (*.log, debug-*, tmp-*, .DS_Store)
  3. STATE.md's "Last run" is well-formed (--assert-fresh: must be today)

Options:
  --check          Repository health. Safe for CI: a stale date is fine. (default)
  --assert-fresh   Runtime assertion after a loop run: "Last run" must be today.

Exit codes: 0 clean · 1 not a git repo / bad arguments · 2 not clean
`);
    return;
  }

  // --state 必须带值；`--state --json` 会被解析成 state=true，静默回落到 cwd。
  if (args.state !== undefined && typeof args.state !== 'string') {
    fail('--state requires a directory path', 1);
  }
  // 位置参数也接受，与 harness-stage 的 `node scripts/xxx.mjs <target>` 一致。
  const root = path.resolve(typeof args.state === 'string' ? args.state
    : typeof args._[0] === 'string' ? args._[0] : '.');
  const checks = [];
  const add = (name, ok, reason) => checks.push({ name, ok, reason });

  // 1. init.sh
  const initText = readText(path.join(root, 'init.sh'));
  const ph = initScriptPlaceholder(initText);
  add('init.sh 无占位符', !ph, ph);

  // 2. 调试残留
  let untracked;
  try {
    untracked = untrackedPaths(root);
  } catch {
    fail(`${root} is not a git repository — cannot tell which files are untracked`, 1);
  }
  const artifacts = untracked
    .map((p) => ({ path: p, hit: isDebugArtifact(p) }))
    .filter((x) => x.hit);
  add('无未跟踪的调试残留', artifacts.length === 0,
    artifacts.length ? artifacts.map((a) => `${a.path}（${a.hit.why}）`).join('、') : null);

  // 3. Last run
  //
  // 两种语义必须分开，否则同一个脚本既不能进 CI 也不能做本轮断言：
  //   --check（默认）        仓库健康：格式合法即可，跨天不该红
  //   --assert-fresh         运行时断言：本轮刚写完状态，必须是今天
  // 把"本轮刚跑过"当成"仓库健康"，会让 CI 每次 push 都红，检查随即被忽略。
  const stateText = readText(path.join(root, 'STATE.md'));
  const lr = lastRunStatus(stateText);
  if (args.assertFresh) {
    add('STATE.md 的 Last run 是今天', lr.ok, lr.reason);
  } else {
    const m = stateText.match(/^Last run:\s*(\S+)/m);
    const value = m ? m[1] : null;
    const wellFormed = value !== null
      && (value === 'never' || /^\d{4}-\d{2}-\d{2}/.test(value));
    add('STATE.md 的 Last run 格式合法', wellFormed,
      wellFormed ? null : (value === null ? 'STATE.md 没有 Last run 行' : `Last run 不是日期：${value}`));
  }

  const failed = checks.filter((c) => !c.ok);

  if (args.json) {
    printJson({ root, checks, clean: failed.length === 0 });
  } else {
    process.stdout.write(`Clean state — ${root}\n`);
    for (const c of checks) {
      process.stdout.write(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.reason ? ` — ${c.reason}` : ''}\n`);
    }
    if (failed.length) process.stdout.write('\nClean the above before claiming this round is done.\n');
  }

  process.exit(failed.length ? 2 : 0);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
