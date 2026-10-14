#!/usr/bin/env node
/**
 * budget-check.mjs — 预算与 kill switch 的唯一入口
 *
 * 用法：
 *   node scripts/budget-check.mjs --pattern ci-sweeper
 *   node scripts/budget-check.mjs --pattern pr-review-triage --json
 *   node scripts/budget-check.mjs --pattern ci-sweeper --root /path/to/repo
 *
 * 退出码：0 = normal 或 report-only；3 = 立即退出（超预算或 kill switch）
 *
 * 为什么需要这个脚本：
 *
 * 这两件事此前都没有代码入口。
 *   - 预算百分比只存在于 merge-gate.yml 的一段内联 node -e 里，而且用
 *     `Math.max(...caps)` 取全表最大上限——于是所有循环共用 CI Sweeper 的 500k，
 *     PR Review Triage 花掉自身 83% 时被算成 50%，判定"正常"。per-loop 上限
 *     在 loop-budget.md 里写着，但没有任何东西读它。
 *   - kill switch 由调用方用 --pause 传入 gate-check，而没有任何 workflow 传它。
 *
 * 约束 11 说："任何被文档描述为'机械判定'的机制，必须有一个真正读它的代码入口。"
 * 预算是这套框架唯一的经济性来源，不能停在"文档写了阈值"。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags } from './lib/common.mjs';

export const DEFAULT_THRESHOLDS = { reportOnly: 80, exit: 100 };

/**
 * 从 loop-budget.md 的 Daily Limits 表读出每个循环的 token 上限。
 *
 * 表格形态（列：循环 | 最大运行/天 | 最大 token/天 | 最大子智能体/轮）：
 *   | CI Sweeper | 96 | 500k | 3 |
 *
 * 返回 { '<循环名小写>' : 上限数字 }。按名取行，不是取全表最大值——
 * 后者会让 per-loop 上限变成装饰品。
 */
export function parseBudgetCaps(text) {
  const caps = {};
  for (const line of (text || '').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const [name, , tokenCap] = cells;
    // 跳过表头与分隔行
    if (/^[-: ]+$/.test(name) || /循环|loop/i.test(name) && /token/i.test(tokenCap)) continue;
    const m = String(tokenCap).match(/^(\d+(?:\.\d+)?)\s*k$/i);
    if (!m) continue;
    caps[name.toLowerCase()] = Math.round(Number(m[1]) * 1000);
  }
  return caps;
}

/** 把 pattern id 映射到 loop-budget.md 的循环名。 */
export function capForPattern(caps, pattern) {
  const p = String(pattern || '').toLowerCase();
  const direct = caps[p];
  if (direct !== undefined) return direct;
  // pattern id 与中文/英文表名不同名，做一次包含匹配。
  const aliases = [
    [/intake|issue/, 'issue intake'],
    [/pr-review|review-triage|babysitter/, 'pr review triage'],
    [/ci-sweeper|ci-triage|ci-/, 'ci sweeper'],
    [/merge-gate|gate/, 'merge gate'],
    [/post-merge|cleanup/, 'post-merge cleanup'],
    [/release|changelog|drafter/, 'release drafter'],
  ];
  for (const [re, name] of aliases) {
    if (re.test(p) && caps[name] !== undefined) return caps[name];
  }
  return null;
}

/**
 * 汇总今日已花费的 token。
 *
 * 只算 run_id 前缀是今天、且 pattern 匹配的条目。
 * pattern 不匹配时返回全部 pattern 的总和——那时调用方要的是全局预算。
 */
export function sumTodaySpend(runLogText, pattern, today) {
  let used = 0;
  let matched = 0;
  for (const m of (runLogText || '').matchAll(/\{[^\n]*\}/g)) {
    let e;
    try { e = JSON.parse(m[0]); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (!String(e.run_id || '').startsWith(today)) continue;
    if (pattern && e.pattern && String(e.pattern) !== String(pattern)) continue;
    used += Number(e.tokens_estimate) || 0;
    matched++;
  }
  return { used, entries: matched };
}

/**
 * kill switch：只认独占一行的标记。
 *
 * STATE.md 里任何对 loop-pause-all 的散文提及都不算生效——
 * 否则一次说明性文字就把循环永久停死。这与 daily-triage.yml 的判定一致。
 */
export function isPaused(root) {
  const stateText = readText(path.join(root, 'STATE.md'));
  if (/^\s*loop-pause-all\s*$/m.test(stateText)) return { paused: true, where: 'STATE.md' };
  const constraintsText = readText(path.join(root, 'loop-constraints.md'));
  if (/^\s*loop-pause-all\s*$/m.test(constraintsText)) return { paused: true, where: 'loop-constraints.md' };
  return { paused: false, where: null };
}

/** 判定模式。顺序：kill switch → 100% → 80% → normal。 */
export function decide(used, cap, paused, thresholds = DEFAULT_THRESHOLDS) {
  if (paused) {
    return { mode: 'exit', reason: 'loop-pause-all is active', budget_pct: cap ? Math.round((used / cap) * 100) : 0 };
  }
  if (!cap || cap <= 0) {
    // 没有上限就没有刹车——这不是"正常"，是配置缺失。报出来，不要静默放行。
    return { mode: 'exit', reason: 'no per-loop token cap found in loop-budget.md', budget_pct: 0 };
  }
  const pct = Math.round((used / cap) * 100);
  if (pct >= thresholds.exit) return { mode: 'exit', reason: `spend ${pct}% reached the cap (${thresholds.exit}%)`, budget_pct: pct };
  if (pct >= thresholds.reportOnly) return { mode: 'report-only', reason: `spend ${pct}% reached report-only (${thresholds.reportOnly}%)`, budget_pct: pct };
  return { mode: 'normal', reason: `spend ${pct}% is under the report-only threshold`, budget_pct: pct };
}

export function checkBudget(root, pattern, today = new Date().toISOString().slice(0, 10)) {
  const caps = parseBudgetCaps(readText(path.join(root, 'loop-budget.md')));
  const cap = capForPattern(caps, pattern);
  const { used, entries } = sumTodaySpend(readText(path.join(root, 'loop-run-log.md')), pattern, today);
  const { paused, where } = isPaused(root);
  const d = decide(used, cap, paused);
  return {
    pattern: pattern ?? null,
    cap,
    used,
    entries,
    paused,
    paused_where: where,
    ...d,
    // 预算是估算，不是精确计量——loop-budget.md 自己这么写的。留出余量。
    estimate: true,
  };
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['pattern', 'root', 'json', 'help'], 'budget-check');
  if (args.help) {
    process.stdout.write(`budget-check — per-loop token budget and the kill switch

Usage:
  node scripts/budget-check.mjs --pattern <pattern-id> [--root <dir>] [--json]

Options:
  --pattern <id>   Loop pattern id (e.g. ci-sweeper, pr-review-triage). The token cap is
                   read from that loop's row in loop-budget.md — not the max across all rows.
  --root <dir>     Repo root holding loop-budget.md / loop-run-log.md / STATE.md (default: cwd)
  --json           Emit JSON
  --help           Show this help

Exit codes:
  0  normal or report-only
  3  exit immediately (kill switch, over cap, or no cap configured)
`);
    return;
  }

  const root = typeof args.root === 'string' ? args.root : process.cwd();
  const result = checkBudget(root, typeof args.pattern === 'string' ? args.pattern : null);

  if (args.json) {
    printJson(result);
  } else {
    process.stdout.write(`budget-check — ${result.mode}\n`);
    process.stdout.write(`  pattern:      ${result.pattern ?? '(all)'}\n`);
    process.stdout.write(`  spend:        ${result.used} / ${result.cap ?? '(no cap)'} (${result.budget_pct}%)\n`);
    process.stdout.write(`  entries:      ${result.entries} today\n`);
    if (result.paused) process.stdout.write(`  paused:       yes (${result.paused_where})\n`);
    process.stdout.write(`\n${result.reason}\n`);
  }

  process.exit(result.mode === 'exit' ? 3 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
