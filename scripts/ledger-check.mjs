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
import { pathToFileURL } from 'node:url';
import { parseArgs, readJson, printJson, readRegistryDefaults, fail } from './lib/common.mjs';

export const DEFAULT_BREAKER = {
  maxIterations: 10,
  stagnationThreshold: 3,
  noProgressThreshold: 5,
};

/**
 * registry.yaml 的 breaker 阈值覆盖内置默认值。
 * 配置文件写着某个值却没有任何代码读它，等于"看起来被强制、实际是装饰"。
 */
export function breakerDefaults(registryPath) {
  const r = readRegistryDefaults(registryPath);
  if (!r) return {};
  const out = {};
  if (Number.isFinite(r.stagnation)) out.stagnationThreshold = r.stagnation;
  if (Number.isFinite(r.noProgress)) out.noProgressThreshold = r.noProgress;
  if (Number.isFinite(r.maxIterations)) out.maxIterations = r.maxIterations;
  return out;
}

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
  // 其余数字
  s = s.replace(/\b\d+\b/g, '<n>');
  // 空白折叠
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}

/** 判定熔断状态 */
export function checkLedger(ledger, opts = {}) {
  const maxIterations = opts.maxIterations ?? DEFAULT_BREAKER.maxIterations;
  const stagnationThreshold = opts.stagnationThreshold ?? DEFAULT_BREAKER.stagnationThreshold;
  const noProgressThreshold = opts.noProgressThreshold ?? DEFAULT_BREAKER.noProgressThreshold;
  const tokenBudget = opts.tokenBudget ?? null;

  const attempts = Array.isArray(ledger?.attempts) ? ledger.attempts : [];
  const iterations = attempts.length;
  const tokensUsed = attempts.reduce((sum, a) => sum + (Number(a.tokensUsed) || 0), 0);

  // 连续失败
  let consecutiveFailures = 0;
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].outcome === 'failure') consecutiveFailures++;
    else break;
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
  if (tokenBudget !== null && tokensUsed >= tokenBudget) {
    return {
      ...base,
      verdict: 'token-budget',
      exit_code: 2,
      next: 'STOP — token budget exceeded. Escalate to human.',
    };
  }
  if (iterations >= maxIterations) {
    return {
      ...base,
      verdict: 'max-iterations',
      exit_code: 2,
      next: 'STOP — max iterations reached. Escalate to human.',
    };
  }

  return {
    ...base,
    verdict: 'ok',
    exit_code: 0,
    next: 'Continue. Append this attempt to the ledger before retrying.',
  };
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
  if (!fs.existsSync(ledgerPath)) {
    fail(`ledger not found: ${ledgerPath}`);
  }
  const ledger = readJson(ledgerPath);
  if (!ledger) fail(`ledger is not valid JSON: ${ledgerPath}`);

  // Number('abc') 是 NaN，而 checkLedger 里的 ?? 只接 null/undefined——NaN 会原样
  // 穿过去，让所有阈值比较恒为 false，等于把所有熔断器关掉。必须 fail-closed。
  const numArg = (value, flag) => {
    const n = Number(value);
    if (!Number.isFinite(n)) fail(`${flag} must be a finite number (got: ${value})`);
    return n;
  };

  // registry.yaml 作为阈值来源，CLI 参数覆盖单项。
  const fromRegistry = breakerDefaults(typeof args.registry === 'string' ? args.registry : undefined);
  const opts = { ...fromRegistry };
  if (args.stagnation !== undefined) opts.stagnationThreshold = numArg(args.stagnation, '--stagnation');
  if (args.noProgress !== undefined) opts.noProgressThreshold = numArg(args.noProgress, '--no-progress');
  if (args.maxIterations !== undefined) opts.maxIterations = numArg(args.maxIterations, '--max-iterations');
  if (args.tokenBudget !== undefined) opts.tokenBudget = numArg(args.tokenBudget, '--token-budget');

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
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
