#!/usr/bin/env node
/**
 * drill-record.mjs — `loop-drill.json` 的读写与有效性判定
 *
 * 从 drill-check.mjs 里拆出来，因为 `harness-init`（只做阶段 1）也要读它：
 * 阶段 2 判据 7 要问"演练记录是否还对当前约束有效"。把这几个函数留在
 * drill-check 里，阶段 1 的技能就被迫带上 ledger-check + gate-check 两个
 * 运行时脚本（1822 行它永远不会执行的代码）。
 *
 * 本文件只依赖 lib/common.mjs。真正的演练（注入故障、断言护栏会响）在
 * drill-check.mjs；这里只处理"记录说了什么、还作不作数"。
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readText, parseDenylistFrom, parseBudgetFrom } from './lib/common.mjs';

export const RECORD_FILE = 'loop-drill.json';
export const RECORD_SCHEMA = 1;

export function fingerprint(text) {
  return crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

export function readRecord(root) {
  const p = path.join(root, RECORD_FILE);
  try { return JSON.parse(readText(p)); } catch { return null; }
}

export function writeRecord(root, groups) {
  const p = path.join(root, RECORD_FILE);
  const existing = readRecord(root);
  const kept = existing && existing.schema === RECORD_SCHEMA ? existing.guardrails || {} : {};
  const merged = { ...kept, ...groups };
  const sorted = {};
  for (const k of Object.keys(merged).sort()) sorted[k] = merged[k];
  fs.writeFileSync(p, `${JSON.stringify({
    schema: RECORD_SCHEMA, tool: 'harness-loop drill-check', guardrails: sorted,
  }, null, 2)}\n`, 'utf8');
  return p;
}

/**
 * 记录是否仍对当前策略有效。
 *
 * 策略文件改了，旧记录就不再证明任何东西——这与"测试通过"不能证明改过之后的
 * 代码仍然正确是同一个道理。所以记录里存 sha256，比对时重算。
 */
export function recordStatus(root) {
  const rec = readRecord(root);
  const empty = { present: false, stale: false, failed: [], skipped: [], reason: null };
  if (!rec || rec.schema !== RECORD_SCHEMA) {
    return { ...empty, reason: 'loop-drill.json 不存在或 schema 不符' };
  }

  const gate = rec.guardrails && rec.guardrails.gate;
  const breaker = rec.guardrails && rec.guardrails.breaker;

  // 记录必须同时覆盖 gate 与 breaker。只有 breaker 的记录证明不了拒绝列表会拦，
  // 而拒绝列表是安全边界的第一道。
  if (!gate || !Array.isArray(gate.results)) {
    return { ...empty, present: false, reason: '记录缺少 gate 组——拒绝列表是否命中没有证据' };
  }
  if (!breaker || !Array.isArray(breaker.results)) {
    return { ...empty, present: false, reason: '记录缺少 breaker 组——熔断器是否触发没有证据' };
  }
  // 验证者 canary：没有它，"独立验证"这条硬约束只有形状证据。
  const verifier = rec.guardrails && rec.guardrails.verifier;
  if (!verifier || !Array.isArray(verifier.results)) {
    return { ...empty, present: false, reason: '记录缺少 verifier 组——伪造的 APPROVE 是否会被拒没有证据' };
  }
  // 没有指纹的 gate 记录无法绑定当前策略：手写一份全 PASS 的结果就能过。
  if (!gate.input || !gate.input.sha256) {
    return { ...empty, present: false, reason: 'gate 记录缺少 input.sha256——无法证明它对应当前约束文件' };
  }

  // 记录绑定的是含 ## Paths 的那份文件；拆文件后是 harness-constraints.md。
  const constraintsPath = [path.join(root, 'harness-constraints.md'), path.join(root, 'loop-constraints.md')]
    .find((p) => fs.existsSync(p));
  if (!constraintsPath) {
    return { ...empty, present: false, reason: 'harness-constraints.md 不存在，无法核对记录' };
  }
  const now = fingerprint(readText(constraintsPath));
  if (now !== gate.input.sha256) {
    return { present: false, stale: true, failed: [], skipped: [], reason: 'loop-constraints.md 已改动，gate 记录过期' };
  }

  // 元素必须是对象：`results: [null]` 曾经让 stage driver 抛栈而不是判失败。
  const badElement = [...gate.results, ...breaker.results, ...verifier.results].find((r) => !r || typeof r !== 'object');
  if (badElement !== undefined) {
    return { ...empty, present: false, reason: '记录里有非对象的结果项' };
  }

  // 记录里的 gate 结果必须覆盖当前拒绝列表的每一条。少一条就意味着
  // 那条路径从未被演练过，而它可能正是新增的那条。
  const denylist = parseDenylistFrom(readText(constraintsPath));
  const recorded = new Set(gate.results.map((r) => r.id));
  const missing = denylist.filter((g) => !recorded.has(`gate.denylist[${g}]`));
  if (missing.length) {
    return {
      ...empty,
      present: false,
      reason: `记录缺少 ${missing.length} 条拒绝列表的演练：${missing.slice(0, 3).join(', ')}`,
    };
  }
  if (!recorded.has('gate.benign')) {
    return { ...empty, present: false, reason: '记录缺少 gate.benign——没有证明护栏会放行良性改动' };
  }

  // 熔断器的三条规则都必须真的演练过。只写一条 `healthy` 不能证明它会停。
  const verifierIds = new Set(verifier.results.map((r) => r.id));
  const requiredVerifier = ['verifier.control', 'verifier.forged-no-snippet',
    'verifier.self-authored', 'verifier.wrong-commit'];
  const missingVerifier = requiredVerifier.filter((id) => !verifierIds.has(id));
  if (missingVerifier.length) {
    return { ...empty, present: false, reason: `记录缺少验证者 canary：${missingVerifier.join(', ')}` };
  }

  const breakerIds = new Set(breaker.results.map((r) => r.id));
  const requiredBreaker = ['breaker.stagnation', 'breaker.no-progress', 'breaker.healthy'];
  const budget = parseBudgetFrom(readText(constraintsPath)).tokenBudget;
  if (budget !== null) requiredBreaker.push('breaker.token-budget');
  const missingBreaker = requiredBreaker.filter((id) => !breakerIds.has(id));
  if (missingBreaker.length) {
    return {
      ...empty,
      present: false,
      reason: `记录缺少熔断器演练：${missingBreaker.join(', ')}`,
    };
  }

  // outcome 只认三个字面量。手写记录里写 'PASSED' / 'passed ' / 缺字段，
  // 都会被"只拒绝 failed"的逻辑当成通过——未知状态不能读成成功。
  const OUTCOMES = new Set(['passed', 'failed', 'skipped']);
  const badOutcome = [...gate.results, ...breaker.results, ...verifier.results].find((r) => !OUTCOMES.has(r.outcome));
  if (badOutcome !== undefined) {
    return { ...empty, present: false, reason: `结果项 outcome 非法：${JSON.stringify(badOutcome.outcome)}` };
  }

  const failed = [];
  const skipped = [];
  for (const group of [gate, breaker, verifier]) {
    for (const r of group.results) {
      if (r.outcome === 'failed') failed.push(r.id);
      if (r.outcome === 'skipped') skipped.push(r.id);
    }
  }
  // gate 演练不存在"跳过"这种合法结局：拒绝列表就在那里，要么命中要么没命中。
  // 把 skipped 当通过，等于允许一份"每条都没跑"的记录证明护栏有效。
  const skippedGate = gate.results.filter((r) => r.outcome === 'skipped').map((r) => r.id);
  if (skippedGate.length) {
    return {
      present: false,
      stale: false,
      failed,
      skipped,
      reason: `gate 演练有 ${skippedGate.length} 项被跳过：${skippedGate.slice(0, 3).join(', ')}`,
    };
  }
  return { present: true, stale: false, failed, skipped, reason: null };
}
