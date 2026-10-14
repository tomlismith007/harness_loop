#!/usr/bin/env node
/**
 * gate-check.mjs — 闸门判定
 *
 * 按优先级检查九类闸门，输出 decision: proceed | report-only | escalate | exit。
 * 退出码：0 = proceed/report-only，1 = 参数错误，2 = escalate，3 = exit。
 *
 * 用法：
 *   node scripts/gate-check.mjs --item pr-123 --phase gate --attempts 1 \
 *     --diff-files @changed.txt --verdict approve --budget-pct 45
 *
 *   node scripts/gate-check.mjs --item pr-123 --diff-files a.ts,b.ts --verdict approve
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, matchesDenylist, loadDenylist, DENYLIST_PATTERNS, fail } from './lib/common.mjs';

export const DEFAULTS = {
  maxFilesPerFix: 5,
  maxFilesPerCleanup: 10,
  maxAttempts: 3,
  budgetReportOnly: 80,
  budgetExit: 100,
};

// 白名单。未识别的值一律参数错误退出，绝不放行——
// 拼错的 --verdict 等价于"批准"是这个闸门曾经最大的漏洞。
const PHASES = ['intake', 'review', 'fix', 'verify', 'gate', 'post-merge', 'release'];
const VERDICTS = ['approve', 'reject', 'escalate-human', 'none'];
const RED_CHECKS = ['pass', 'fail', 'not-run'];

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
 *   7. head-commit (TOCTOU)
 *   8. red-check
 *   9. verification
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
    redCheck = 'not-run',
    notRun = [],
    // 拒绝列表由调用方从 loop-constraints.md 读入；不给则用 JS 常量兜底。
    denylist = DENYLIST_PATTERNS,
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
    const pattern = matchesDenylist(f, denylist);
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
  // 缺 sha 也要拦：这条是唯一绝不能跳的闸，"参数不全就绕过"等于没有闸。
  if (phase === 'gate') {
    if (!reviewedSha || !headSha) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'head-commit',
        reason: `gate phase requires both --reviewed-sha and --head-sha (reviewed: ${reviewedSha || 'missing'}, head: ${headSha || 'missing'})`,
        allowed_actions: ['supply both SHAs so the merge can be bound to the reviewed commit'],
        exit_code: 2,
        next: 'a merge must be bound to a reviewed commit; pass --reviewed-sha and --head-sha, then merge with --match-head-commit <sha>',
      };
    }
    if (reviewedSha !== headSha) {
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
  }

  // 8. 回退测试：新增测试必须能在修复前的代码上真的挂掉
  // 默认值是 'not-run' 不是 'none'：忘了传参数与明确没跑，在退出码上必须不可区分。
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
  --diff-files <list>    A changed path, or @path to a file with one path per line
  --verdict <v>          approve | reject | escalate-human | none (default: none)
  --budget-pct <n>       Today's token spend as % of daily cap (default: 0)
  --pause                Set if loop-pause-all is active
  --cleanup              Treat as a cleanup change (higher file limit)
  --reviewed-sha <sha>   Commit SHA that was reviewed (required at --phase gate)
  --head-sha <sha>       Current head SHA of the branch (required at --phase gate)
  --red-check <state>    pass | fail | not-run — does the new test fail on pre-fix code? (default: not-run)
  --constraints-root <d> Directory holding loop-constraints.md (default: cwd). The denylist is
                         read from it so repo-specific paths are actually enforced.
  --not-run <list>       Comma-separated checks that were NOT run (listed, never omitted)
  --json                 Emit JSON (default)
  --help                 Show this help

Exit codes:
  0  proceed or report-only
  1  invalid argument (unknown phase/verdict/red-check, or non-numeric threshold)
  2  escalate to human
  3  exit immediately
`);
    return;
  }

  // 无参调用曾经返回 proceed exit 0，让"闸门用错"和"闸门通过"在退出码上不可区分。
  if (!args.help && args._.length === 0 && !args.item) {
    process.stdout.write(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
    fail('no arguments — nothing to check. See usage above.', 1);
  }

  let diffFiles = [];
  if (typeof args.diffFiles === 'string') {
    // 只认显式的 @path。裸参数一律按单一路径处理——曾经"路径存在就按文件列表读"，
    // 同一命令串因文件系统状态不同而含义不同，是最隐蔽的一类假绿/假红。
    if (args.diffFiles.startsWith('@')) {
      const p = args.diffFiles.slice(1);
      if (!fs.existsSync(p)) fail(`diff-files file not found: ${p}`);
      diffFiles = readText(p).split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      // 逗号分隔是显式约定（usage 里写着的），保留。去掉的是"文件存在就当清单读"——
      // 那让同一命令串因文件系统状态不同而含义不同。
      diffFiles = args.diffFiles.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  const enumArg = (value, allowed, flag) => {
    if (value === undefined) return undefined;
    if (!allowed.includes(value)) fail(`${flag} must be one of: ${allowed.join(', ')} (got: ${value})`);
    return value;
  };

  // Number('abc') 是 NaN，而 NaN >= n 恒为 false —— 一个拼错的阈值会把所有熔断器关掉，
  // 同时工具报告成功。必须在进 checkGates 之前拦住。
  const numArg = (value, flag, fallback) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) fail(`${flag} must be a finite number (got: ${value})`);
    return n;
  };

  const result = checkGates({
    item: typeof args.item === 'string' ? args.item : null,
    phase: enumArg(args.phase, PHASES, '--phase') ?? null,
    attempts: numArg(args.attempts, '--attempts', 0),
    diffFiles,
    verdict: enumArg(args.verdict, VERDICTS, '--verdict') ?? 'none',
    budgetPct: numArg(args.budgetPct, '--budget-pct', 0),
    pause: Boolean(args.pause),
    isCleanup: Boolean(args.cleanup),
    // 拒绝列表的真相源是本仓库的 loop-constraints.md，不是脚本里的常量。
    // 维护者按文档在 ## Repo-Specific 加的路径必须真的被强制执行。
    denylist: loadDenylist(typeof args.constraintsRoot === 'string' ? args.constraintsRoot : process.cwd()),
    reviewedSha: typeof args.reviewedSha === 'string' ? args.reviewedSha : null,
    headSha: typeof args.headSha === 'string' ? args.headSha : null,
    redCheck: enumArg(args.redCheck, RED_CHECKS, '--red-check') ?? 'not-run',
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
