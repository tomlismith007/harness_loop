#!/usr/bin/env node
/**
 * ledger-check.mjs — 熔断器
 *
 * 读取 loop-ledger.json，检测停滞 / 无进展 / 超预算 / 超迭代上限。
 * 退出码 0 = 继续，2 = 停止并升级。
 *
 * 用法：
 *   node scripts/ledger-check.mjs --ledger loop-ledger.json
 *   node scripts/ledger-check.mjs --ledger loop-ledger.json --stagnation 3 --no-progress 5
 *   node scripts/ledger-check.mjs --ledger loop-ledger.json --escalation
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, printJson, fail, rejectUnknownFlags, loadBudget, loadLimits, isEntryPoint } from './lib/common.mjs';

export const DEFAULT_BREAKER = {
  maxIterations: 10,
  stagnationThreshold: 3,
  noProgressThreshold: 5,
  maxAttempts: 3,
};

/**
 * 错误签名归一化：抹掉时间戳、十六进制、路径、行列号、其余数字。
 * 使"同一个错误"能被识别。
 */
export function normalizeError(raw) {
  if (!raw) return '';
  let s = String(raw);
  // ISO 时间戳
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>');
  // 十六进制地址
  s = s.replace(/0x[0-9a-fA-F]+/g, '<hex>');
  // 路径 → basename
  s = s.replace(/(?:[A-Za-z]:)?(?:[\\/][\w.\-@]+)+\.[A-Za-z0-9]+/g, (m) => {
    const parts = m.split(/[\\/]/);
    return '<path>/' + parts[parts.length - 1];
  });
  // 行列号
  s = s.replace(/:\d+:\d+/g, ':<line>:<col>');
  s = s.replace(/:\d+\b/g, ':<line>');
  // 只归一化"明确是位置或时长"的裸数字。
  //
  // 这里曾经是 `\b\d+\b → <n>`，把退出码、HTTP 状态码、断言期望值全抹平了：
  //   "exit code 1" vs "exit code 2"          → 同一签名
  //   "HTTP 500" vs "HTTP 404"                → 同一签名
  //   "expected 5 to equal 6" vs "...7 to 8"  → 同一签名
  // 于是 agent 依次遇到"500 服务端错误"→"404 路由缺失"→"超时"三种根因完全不同的
  // 失败时，会在第 3 次被判 stagnation 并熔断。失效方向是安全的（提前停止），
  // 但会过早熔断本可自愈的循环——而"该停才停"正是这套框架的经济性来源。
  s = s.replace(/\b(line|offset|column|col|char|pos)\s*[:=]?\s*\d+/gi, '$1 <n>');
  s = s.replace(/\b\d+(ms|s)\b/g, '<duration>');
  // 空白折叠
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

/**
 * 账本不可读时的判定：停下并升级。
 *
 * exit 2 与其他熔断触发一致——不是新的一类失败，而是熔断器在说
 * "我不知道当前状态"，而"不知道"绝不能被读成"一切正常"。
 */
function unreadableLedger(why, thresholds) {
  return {
    iterations: 0,
    consecutive_failures: 0,
    tokens_used: 0,
    last_error_signature: null,
    thresholds: {
      max_iterations: thresholds.maxIterations,
      stagnation: thresholds.stagnationThreshold,
      no_progress: thresholds.noProgressThreshold,
      token_budget: thresholds.tokenBudget,
    },
    verdict: 'no-ledger',
    exit_code: 2,
    unreadable_reason: why,
    next: 'STOP — the ledger is missing or malformed, so there is no readable state to judge. '
      + 'Fix or create loop-ledger.json (stage 2 produces it), then re-run. Do not retry blind.',
  };
}

/**
 * 判定熔断状态。
 *
 * 账本不可读时**必须**停在 no-ledger，而不是回落到"没有尝试记录所以一切正常"。
 * 曾经 `Array.isArray(ledger?.attempts) ? ledger.attempts : []` 把一个缺字段、
 * 字段类型错、甚至 ledger 本身是 null 的输入都变成空数组，于是 verdict=ok、
 * exit 0——熔断器在它最需要说话的时候静默放行。一个永远生效不了的闸门，
 * 和一个不存在的闸门，在退出码上不可区分（硬约束 11）。
 *
 * 空 attempts 数组仍然是 ok：那是"还没开始跑"，不是"读不到"。
 */
export function checkLedger(ledger, opts = {}) {
  const maxIterations = opts.maxIterations ?? DEFAULT_BREAKER.maxIterations;
  const stagnationThreshold = opts.stagnationThreshold ?? DEFAULT_BREAKER.stagnationThreshold;
  const noProgressThreshold = opts.noProgressThreshold ?? DEFAULT_BREAKER.noProgressThreshold;
  const tokenBudget = opts.tokenBudget ?? null;

  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    return unreadableLedger(null, { maxIterations, stagnationThreshold, noProgressThreshold, tokenBudget });
  }
  if (!Array.isArray(ledger.attempts)) {
    return unreadableLedger(
      ledger.attempts === undefined ? 'attempts 字段缺失' : `attempts 不是数组（${typeof ledger.attempts}）`,
      { maxIterations, stagnationThreshold, noProgressThreshold, tokenBudget });
  }

  const all = ledger.attempts;
  // per-pattern 切片。
  //
  // 共享账本里，A 循环的失败会把 B 循环的熔断器顶爆——一个循环还没跑，
  // 却因为另一个循环的 5 次失败被判 no-progress。
  //
  // 切片后为空时显式报 no-pattern-records，而不是回落到"没有记录所以一切正常"：
  // "这个循环还没跑过"与"账本里根本没有它的记录"必须可区分。
  const attempts = opts.pattern
    ? all.filter((a) => a.pattern === opts.pattern || a.item === opts.pattern)
    : all;

  // 尝试上限：数**这个 item** 的尝试，来源是账本而不是命令行参数。
  // 此前这条判定在 gate-check 里读 `--attempts`，调用方写 0 就能在账本已有
  // 5 次失败时继续——两个状态源之间没有唯一真相，等于没有上限。
  const maxAttempts = opts.maxAttempts ?? DEFAULT_BREAKER.maxAttempts;
  if (opts.item) {
    const itemAttempts = all.filter((a) => a.item === opts.item).length;
    if (itemAttempts >= maxAttempts) {
      return {
        iterations: itemAttempts,
        consecutive_failures: 0,
        tokens_used: 0,
        last_error_signature: null,
        thresholds: {
          max_iterations: maxIterations,
          stagnation: stagnationThreshold,
          no_progress: noProgressThreshold,
          token_budget: tokenBudget,
          max_attempts: maxAttempts,
        },
        verdict: 'attempt-limit',
        exit_code: 2,
        next: `STOP — ${opts.item} 已在账本里尝试 ${itemAttempts} 次（上限 ${maxAttempts}）。升级给人，不要再试。`,
      };
    }
  }
  if (opts.pattern && all.length && attempts.length === 0) {
    return {
      ...unreadableLedger(`账本有 ${all.length} 条记录，但没有一条属于 pattern '${opts.pattern}'`,
        { maxIterations, stagnationThreshold, noProgressThreshold, tokenBudget }),
      verdict: 'no-pattern-records',
    };
  }

  // 出厂账本与真实历史的区分。装配生成的账本 goal 写着 "Replace with the current
  // loop goal"，模板示例写着 "Example loop ledger"——两者都不是本循环的真实目标，
  // 但旧实现不看 goal，于是一个刚装配的项目和一个跑过 2 次尝试的项目
  // 在熔断器眼里只差"有没有记录"，示例数据会被当成真实历史。
  const goal = typeof ledger.goal === 'string' ? ledger.goal : '';
  if (attempts.length && /^\s*(example\b|replace with)/i.test(goal)) {
    return {
      iterations: attempts.length,
      consecutive_failures: 0,
      tokens_used: 0,
      last_error_signature: null,
      thresholds: {
        max_iterations: maxIterations,
        stagnation: stagnationThreshold,
        no_progress: noProgressThreshold,
        token_budget: tokenBudget,
      },
      verdict: 'placeholder-ledger',
      exit_code: 2,
      next: 'STOP — loop-ledger.json still carries the shipped placeholder goal. '
        + 'Replace `goal` with this loop\'s real objective and clear the example attempts '
        + 'before trusting any breaker verdict.',
    };
  }

  const iterations = attempts.length;
  const tokensUsed = attempts.reduce((sum, a) => sum + (Number(a.tokensUsed) || 0), 0);

  // 连续失败。
  //
  // 只数尾部连续 `failure` 会让 `noop` 洗掉计数：`noop` 是账本 schema 的合法
  // outcome（被锁跳过时的结局），实测 `[f,f,noop,f,f]` 被判 ok / 2-of-5，
  // 而 `[f,f,f,f,f]` 判 no-progress / 5-of-5——同样是"5 次里 5 次失败、中间
  // 没有任何一次成功"，只因插入一次被锁跳过的 noop 就熔断不了。
  // 所以数的是"尾部非 success 段"：failure 与 noop 都算没进展，success 才重置。
  let consecutiveFailures = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].outcome === 'success') break;
    consecutiveFailures++;
  }

  // 同一错误签名重复次数（连续）
  let stagnationCount = 0;
  let lastSignature = '';
  if (attempts.length) {
    lastSignature = normalizeError(attempts[attempts.length - 1].error);
    if (lastSignature) {
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].outcome !== 'failure') break;
        if (normalizeError(attempts[i].error) === lastSignature) stagnationCount++;
        else break;
      }
    }
  }

  const base = {
    iterations,
    consecutive_failures: consecutiveFailures,
    tokens_used: tokensUsed,
    last_error_signature: lastSignature || null,
    thresholds: {
      max_iterations: maxIterations,
      stagnation: stagnationThreshold,
      no_progress: noProgressThreshold,
      token_budget: tokenBudget,
    },
  };

  // 检查顺序：先报最具体可行动的
  if (stagnationCount >= stagnationThreshold) {
    return {
      ...base,
      verdict: 'stagnation',
      stagnation_count: stagnationCount,
      exit_code: 2,
      next: 'STOP — same error repeated. Do not retry. Write escalation to STATE.md and exit the loop.',
    };
  }
  if (consecutiveFailures >= noProgressThreshold) {
    return {
      ...base,
      verdict: 'no-progress',
      exit_code: 2,
      next: 'STOP — consecutive failures without progress. Escalate to human.',
    };
  }
  // 预算比例始终输出（未配置时为 null）。80% 不是停止，是降级：
  // 不派执行者、只报告——继续跑完整子智能体链正是要防的 token 燃烧。
  const budgetRatio = tokenBudget !== null && tokenBudget > 0
    ? Number((tokensUsed / tokenBudget).toFixed(4))
    : null;
  const withRatio = (r) => ({ ...r, budget_ratio: budgetRatio });

  if (tokenBudget !== null && tokensUsed >= tokenBudget) {
    return withRatio({
      ...base,
      verdict: 'token-budget',
      exit_code: 2,
      next: 'STOP — token budget exceeded. Escalate to human.',
    });
  }
  // 迭代上限是硬停止，必须排在"预算降级"之前。否则一旦配置预算，
  // 跑到 10 次迭代的循环会以 report-only exit 0 继续，熔断器被静默关掉。
  if (iterations >= maxIterations) {
    return withRatio({
      ...base,
      verdict: 'max-iterations',
      exit_code: 2,
      next: 'STOP — max iterations reached. Escalate to human.',
    });
  }
  if (budgetRatio !== null && budgetRatio >= 0.8) {
    return withRatio({
      ...base,
      verdict: 'report-only',
      exit_code: 0,
      next: 'token spend is at 80%+ of the daily cap — report only, do not dispatch an implementer.',
    });
  }
  return withRatio({
    ...base,
    verdict: 'ok',
    exit_code: 0,
    next: 'Continue. Append this attempt to the ledger before retrying.',
  });
}

/** 生成升级说明 */
export function renderEscalation(ledger, result) {
  const lines = [];
  lines.push('# Escalation — Loop Guard Triggered');
  lines.push('');
  lines.push(`**Verdict:** \`${result.verdict}\``);
  lines.push(`**Goal:** ${ledger?.goal || '(unspecified)'}`);
  lines.push(`**Pattern:** ${ledger?.pattern || '(unspecified)'} · **Level:** ${ledger?.level || '(unspecified)'}`);
  lines.push('');
  lines.push('## Why the loop stopped');
  lines.push('');
  switch (result.verdict) {
    case 'stagnation':
      lines.push(`Same error signature repeated ${result.stagnation_count} times (threshold ${result.thresholds.stagnation}).`);
      lines.push('The root cause was not touched by any retry. Continuing would burn tokens without progress.');
      break;
    case 'no-progress':
      lines.push(`${result.consecutive_failures} consecutive failures (threshold ${result.thresholds.no_progress}).`);
      break;
    case 'token-budget':
      lines.push(`Token usage ${result.tokens_used} reached budget ${result.thresholds.token_budget}.`);
      break;
    case 'max-iterations':
      lines.push(`${result.iterations} iterations reached the limit of ${result.thresholds.max_iterations}.`);
      break;
    case 'attempt-limit':
      lines.push(`${result.iterations} attempts recorded for this item (limit ${result.thresholds.max_attempts}).`);
      lines.push('The attempt count comes from the ledger, so it cannot be reset by passing a smaller number.');
      break;
    case 'no-ledger':
      lines.push(`The ledger could not be read: ${result.unreadable_reason}.`);
      lines.push('A circuit breaker with no readable state cannot judge whether the loop is stuck,');
      lines.push('so it stops rather than assuming progress. Do not retry blind — create or repair the');
      lines.push('ledger first (stage 2, `harness-loop-init`, produces it).');
      break;
    case 'placeholder-ledger':
      lines.push('The ledger still carries the shipped placeholder goal, so its attempts are example');
      lines.push('data rather than this loop\'s history. A breaker reading example data would report');
      lines.push('progress that never happened. Replace `goal` with the real objective and clear the');
      lines.push('example attempts, then re-run.');
      break;
    default:
      lines.push('(no blocking condition)');
  }
  lines.push('');
  lines.push('## Attempts');
  lines.push('');
  lines.push('| # | Action | Outcome | Error | Tokens |');
  lines.push('|---|---|---|---|---|');
  for (const a of ledger?.attempts || []) {
    const err = (a.error || '').split('\n')[0].slice(0, 80).replace(/\|/g, '\\|');
    lines.push(`| ${a.iteration} | ${String(a.action || '').slice(0, 60).replace(/\|/g, '\\|')} | ${a.outcome} | ${err || '—'} | ${a.tokensUsed ?? '—'} |`);
  }
  lines.push('');
  lines.push('## What the human needs to decide');
  lines.push('');
  lines.push('- Is the target itself correct (is this the right problem to fix)?');
  lines.push('- Is the root cause something an agent can address, or is it environmental?');
  lines.push('- Should the scope be narrowed, or the work item closed?');
  lines.push('');
  lines.push('## Do not');
  lines.push('');
  lines.push('- Do not widen the thresholds to keep looping. Escalation is a feature, not a failure.');
  lines.push('- Do not edit the ledger to hide the repeated error.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, [
    'ledger', 'stagnation', 'noProgress', 'maxIterations', 'maxAttempts', 'tokenBudget',
    'item', 'pattern', 'escalation', 'constraintsRoot', 'json', 'help',
  ], 'ledger-check');
  if (args.help) {
    process.stdout.write(`ledger-check — loop circuit breaker

Usage:
  node scripts/ledger-check.mjs --ledger <path> [options]

Options:
  --ledger <path>        Path to loop-ledger.json (default: loop-ledger.json)
  --stagnation <n>       Same-error threshold (default: 3)
  --no-progress <n>      Consecutive-failure threshold (default: 5)
  --max-iterations <n>   Total iteration limit (default: 10)
  --token-budget <n>     Token budget for this loop
  --item <id>            Enforce the per-item attempt limit from the ledger
                         (default 3; override with --max-attempts). The count comes
                         from loop-ledger.json, not from a caller-supplied number.
  --max-attempts <n>     Per-item attempt limit (default: 3, or "最多 N 次" in
                         loop-constraints.md ## Code)
  --pattern <id>         Only judge attempts belonging to this loop. A shared ledger
                         would otherwise let one loop's failures trip another's breaker.
  --escalation           Emit an escalation markdown document
  --json                 Emit JSON result
  --help                 Show this help

Exit codes:
  0  continue
  2  stop and escalate to human
`);
    return;
  }

  const ledgerPath = typeof args.ledger === 'string' ? args.ledger : 'loop-ledger.json';
  // 账本不可读统一走 no-ledger / exit 2。此前走 fail() 退出 1，而文档与
  // /harness-loop 只定义 0（继续）/ 2（停止）两态——路径写错会被读成"未知"继续跑。
  let ledger = null;
  let unreadable = null;
  if (!fs.existsSync(ledgerPath)) {
    unreadable = `ledger not found: ${ledgerPath}`;
  } else {
    ledger = readJson(ledgerPath);
    if (!ledger) unreadable = `ledger is not valid JSON: ${ledgerPath}`;
  }
  if (unreadable) {
    const result = unreadableLedger(unreadable, DEFAULT_BREAKER);
    if (args.escalation) process.stdout.write(renderEscalation(null, result));
    else printJson(result);
    process.exit(2);
  }

  // Number('abc') 是 NaN，而 checkLedger 里的 ?? 只接 null/undefined——NaN 会原样
  // 穿过去，让所有阈值比较恒为 false，等于把所有熔断器关掉。必须 fail-closed。
  const numArg = (value, flag) => {
    const n = Number(value);
    if (!Number.isFinite(n)) fail(`${flag} must be a finite number (got: ${value})`);
    return n;
  };

  // 阈值来自内置默认值，CLI 参数覆盖单项。
  const opts = {};
  // 未显式传 --token-budget 时读 loop-constraints.md 的 ## Budget 段。
  // 预算写在策略文件里，账本只负责记录用量。
  if (args.tokenBudget === undefined) {
    const b = loadBudget(typeof args.constraintsRoot === 'string' ? args.constraintsRoot : process.cwd());
    if (b.tokenBudget !== null) opts.tokenBudget = b.tokenBudget;
  }
  if (args.stagnation !== undefined) opts.stagnationThreshold = numArg(args.stagnation, '--stagnation');
  if (args.noProgress !== undefined) opts.noProgressThreshold = numArg(args.noProgress, '--no-progress');
  if (args.maxIterations !== undefined) opts.maxIterations = numArg(args.maxIterations, '--max-iterations');
  if (args.tokenBudget !== undefined) opts.tokenBudget = numArg(args.tokenBudget, '--token-budget');
  if (args.pattern !== undefined) opts.pattern = String(args.pattern);
  if (args.item !== undefined) opts.item = String(args.item);
  if (args.maxAttempts !== undefined) {
    opts.maxAttempts = numArg(args.maxAttempts, '--max-attempts');
  } else if (opts.item !== undefined) {
    // 阈值同样来自策略文件：改了 loop-constraints.md 的"最多 N 次"要真的生效。
    const limits = loadLimits(typeof args.constraintsRoot === 'string' ? args.constraintsRoot : process.cwd());
    if (limits.maxAttempts !== null) opts.maxAttempts = limits.maxAttempts;
  }

  const result = checkLedger(ledger, opts);

  if (args.escalation) {
    process.stdout.write(renderEscalation(ledger, result));
  } else if (args.json) {
    printJson(result);
  } else {
    process.stdout.write(`Loop guard — verdict: ${result.verdict}\n`);
    process.stdout.write(`  iterations:           ${result.iterations} / ${result.thresholds.max_iterations}\n`);
    process.stdout.write(`  consecutive failures: ${result.consecutive_failures} / ${result.thresholds.no_progress}\n`);
    process.stdout.write(`  tokens used:          ${result.tokens_used}${result.thresholds.token_budget ? ' / ' + result.thresholds.token_budget : ''}\n`);
    if (result.last_error_signature) {
      process.stdout.write(`  last error:           ${result.last_error_signature.slice(0, 100)}\n`);
    }
    process.stdout.write(`\n${result.next}\n`);
  }

  process.exit(result.exit_code);
}

// 仅在直接执行时运行，被 import 时不运行
if (isEntryPoint(import.meta.url)) {
  main();
}
