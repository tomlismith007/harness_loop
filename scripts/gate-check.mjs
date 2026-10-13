#!/usr/bin/env node
/**
 * gate-check.mjs — 闸门判定
 *
 * 按优先级检查六类闸门，输出 decision: proceed | report-only | escalate | exit。
 * 退出码：0 = proceed/report-only，2 = escalate，3 = exit。
 *
 * 用法：
 *   node scripts/gate-check.mjs --item pr-123 --phase gate --attempts 1 \
 *     --diff-files changed.txt --verdict approve --budget-pct 45
 *
 *   node scripts/gate-check.mjs --item pr-123 --diff-files a.ts,b.ts --verdict approve
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, matchesDenylist, fail } from './lib/common.mjs';

export const DEFAULTS = {
  maxFilesPerFix: 5,
  maxFilesPerCleanup: 10,
  maxAttempts: 3,
  budgetReportOnly: 80,
  budgetExit: 100,
};

/**
 * 判定闸门。
 *
 * 检查顺序（先命中者决定结果）：
 *   1. pause
 *   2. budget >= 100
 *   3. denylist
 *   4. attempts >= max
 *   5. budget >= 80
 *   6. scope (files > max)
 *   7. verification
 */
export function checkGates(input, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const {
    item = null,
    phase = null,
    attempts = 0,
    diffFiles = [],
    verdict = 'none',
    budgetPct = 0,
    pause = false,
    isCleanup = false,
    reviewedSha = null,
    headSha = null,
    redCheck = 'none',
    notRun = [],
  } = input;

  const base = {
    item,
    phase,
    attempts,
    files_changed: diffFiles.length,
    budget_pct: budgetPct,
    verdict,
  };

  // 1. 暂停
  if (pause) {
    return {
      ...base,
      decision: 'exit',
      gate: 'pause',
      reason: 'loop-pause-all is active',
      allowed_actions: [],
      exit_code: 3,
      next: 'exit immediately; do not dispatch any sub-agent; note the pause in STATE.md',
    };
  }

  // 2. 预算 100%
  if (budgetPct >= cfg.budgetExit) {
    return {
      ...base,
      decision: 'exit',
      gate: 'budget',
      reason: `token spend ${budgetPct}% reached the daily cap (${cfg.budgetExit}%)`,
      allowed_actions: [],
      exit_code: 3,
      next: 'exit immediately; write one line to STATE.md; pause schedulers',
    };
  }

  // 3. 拒绝列表
  const hits = [];
  for (const f of diffFiles) {
    const pattern = matchesDenylist(f);
    if (pattern) hits.push({ file: f, pattern });
  }
  if (hits.length) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'denylist',
      reason: `changed file '${hits[0].file}' matches denylist pattern '${hits[0].pattern}'`,
      denylist_hits: hits,
      allowed_actions: [],
      exit_code: 2,
      next: 'write escalation entry to STATE.md, notify human, do not edit',
    };
  }

  // 4. 尝试上限
  if (attempts >= cfg.maxAttempts) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'max-attempts',
      reason: `attempts ${attempts} reached the limit (${cfg.maxAttempts})`,
      allowed_actions: [],
      exit_code: 2,
      next: 'STOP — escalate with full context. Do not retry. See docs/05-failure-modes.md',
    };
  }

  // 5. 预算 80%
  if (budgetPct >= cfg.budgetReportOnly) {
    return {
      ...base,
      decision: 'report-only',
      gate: 'budget',
      reason: `token spend ${budgetPct}% reached report-only threshold (${cfg.budgetReportOnly}%)`,
      allowed_actions: ['read', 'analyze', 'write report', 'update STATE.md'],
      forbidden_actions: ['spawn implementer', 'edit code', 'open PR'],
      exit_code: 0,
      next: 'produce report only; do not dispatch execution sub-agents',
    };
  }

  // 6. 范围
  const fileLimit = isCleanup ? cfg.maxFilesPerCleanup : cfg.maxFilesPerFix;
  if (diffFiles.length > fileLimit) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'scope',
      reason: `diff touches ${diffFiles.length} files, over the limit of ${fileLimit}`,
      allowed_actions: [],
      exit_code: 2,
      next: isCleanup
        ? 'cleanup change too large — request human approval before merging'
        : 'escalate — a change this large likely needs a design decision, not a loop fix',
    };
  }

  // 7. TOCTOU：合并必须绑定审查过的 commit
  // 审查期间若有人又 push，head 变了，合并必须失败——否则未审查的代码会进 main。
  if (phase === 'gate' && reviewedSha && headSha && reviewedSha !== headSha) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'head-commit',
      reason: `head moved after review: reviewed ${String(reviewedSha).slice(0, 7)}, now ${String(headSha).slice(0, 7)}`,
      reviewed_sha: reviewedSha,
      head_sha: headSha,
      allowed_actions: ['re-run verification on the new head'],
      exit_code: 2,
      next: 're-verify the new head; merge with --match-head-commit <sha> so git itself refuses a moved head',
    };
  }

  // 8. 回退测试：新增测试必须能在修复前的代码上真的挂掉
  if (redCheck === 'fail') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'red-check',
      reason: 'red check failed — the new test does not fail on the pre-fix code (or its failure is not diagnostic)',
      allowed_actions: ['return to fix phase and write a test that actually catches the bug'],
      exit_code: 2,
      next: 'a test that passes on the broken code is decorative. Rewrite it so it fails on the pre-fix code and names the wrong behavior.',
    };
  }
  if (redCheck === 'not-run' && phase === 'gate') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'red-check',
      reason: 'red check was not run and this change alters behavior',
      allowed_actions: ['run the red check', 'escalate to human if the change genuinely needs no test'],
      exit_code: 2,
      next: 'run the red check, or escalate with a reason why this change needs no test',
    };
  }

  // 9. 验证
  if (verdict === 'reject') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'verification',
      reason: 'verifier rejected the change',
      allowed_actions: ['return to fix phase with attempt+1', 'escalate if attempts exhausted'],
      exit_code: 2,
      next: attempts + 1 >= cfg.maxAttempts
        ? 'attempts exhausted — escalate to human'
        : 'return to fix phase; append attempt to ledger first',
    };
  }
  if (verdict === 'escalate-human') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'verification',
      reason: 'verifier escalated to human (could not run tests, or risk too high)',
      allowed_actions: [],
      exit_code: 2,
      next: 'write escalation entry; a verifier that cannot run tests must not approve',
    };
  }
  if (verdict === 'none' && phase === 'gate') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'verification',
      reason: 'no verifier verdict present at the gate phase',
      allowed_actions: [],
      exit_code: 2,
      next: 'a change cannot pass the gate without an independent verifier verdict',
    };
  }

  // 通过
  return {
    ...base,
    decision: 'proceed',
    gate: null,
    reason: 'all gates passed',
    checks_not_run: notRun,
    allowed_actions: ['propose PR', 'update state', 'request human merge'],
    forbidden_actions: ['auto-merge to main'],
    exit_code: 0,
    next: notRun.length
      ? `propose the change, but list these as NOT RUN in the PR body: ${notRun.join(', ')}`
      : 'propose the change; merge remains human unless the path is explicitly allowlisted',
  };
}

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`gate-check — enforce loop gates before acting

Usage:
  node scripts/gate-check.mjs --item <id> --phase <phase> [options]

Options:
  --item <id>            Work item id (e.g. pr-123)
  --phase <phase>        intake|review|fix|verify|gate|post-merge|release
  --attempts <n>         Attempts so far (default: 0)
  --diff-files <list>    Comma-separated file list, or @path to a file with one path per line
  --verdict <v>          approve | reject | escalate-human | none (default: none)
  --budget-pct <n>       Today's token spend as % of daily cap (default: 0)
  --pause                Set if loop-pause-all is active
  --cleanup              Treat as a cleanup change (higher file limit)
  --reviewed-sha <sha>   Commit SHA that was reviewed (for TOCTOU binding)
  --head-sha <sha>       Current head SHA of the branch
  --red-check <state>    pass | fail | not-run | none — does the new test fail on pre-fix code?
  --not-run <list>       Comma-separated checks that were NOT run (listed, never omitted)
  --json                 Emit JSON (default)
  --help                 Show this help

Exit codes:
  0  proceed or report-only
  2  escalate to human
  3  exit immediately
`);
    return;
  }

  let diffFiles = [];
  if (typeof args.diffFiles === 'string') {
    if (args.diffFiles.startsWith('@')) {
      const p = args.diffFiles.slice(1);
      if (!fs.existsSync(p)) fail(`diff-files file not found: ${p}`);
      diffFiles = readText(p).split('\n').map((s) => s.trim()).filter(Boolean);
    } else if (fs.existsSync(args.diffFiles) && fs.statSync(args.diffFiles).isFile()) {
      // 裸路径且文件存在 → 按文件列表读取（每行一个路径）
      diffFiles = readText(args.diffFiles).split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      diffFiles = args.diffFiles.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  const result = checkGates({
    item: typeof args.item === 'string' ? args.item : null,
    phase: typeof args.phase === 'string' ? args.phase : null,
    attempts: args.attempts !== undefined ? Number(args.attempts) : 0,
    diffFiles,
    verdict: typeof args.verdict === 'string' ? args.verdict : 'none',
    budgetPct: args.budgetPct !== undefined ? Number(args.budgetPct) : 0,
    pause: Boolean(args.pause),
    isCleanup: Boolean(args.cleanup),
    reviewedSha: typeof args.reviewedSha === 'string' ? args.reviewedSha : null,
    headSha: typeof args.headSha === 'string' ? args.headSha : null,
    redCheck: typeof args.redCheck === 'string' ? args.redCheck : 'none',
    notRun: typeof args.notRun === 'string'
      ? args.notRun.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  });

  printJson(result);
  process.exit(result.exit_code);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
