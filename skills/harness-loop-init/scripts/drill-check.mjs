#!/usr/bin/env node
/**
 * drill-check.mjs — 护栏演练
 *
 * 问题：`test.mjs` 证明了**源仓库**的护栏会响；没有任何东西证明**装配后的仓库**
 * 的护栏会响。一个永远生效不了的闸门，和一个不存在的闸门，在退出码上不可区分。
 *
 * 做法：注入已知故障，断言护栏拒绝；再喂一个良性输入，断言它放行。
 * 两个方向都要过——只拦不放的护栏会通过所有敏感性检查，同时让循环不可用。
 *
 * 用法：
 *   node scripts/drill-check.mjs --record          # 跑全部离线演练并写 loop-drill.json
 *   node scripts/drill-check.mjs --only gate       # 只跑拒绝列表演练
 *   node scripts/drill-check.mjs --only breaker    # 只跑熔断器演练
 *   node scripts/drill-check.mjs --only verifier   # 只跑验证者报告 canary
 *   node scripts/drill-check.mjs                   # 跑一遍但不写记录（CI 用）
 *
 * 退出码：0 全过（未配置的护栏记 skipped 不算失败）；1 记录过期；2 护栏没响。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  parseArgs, readText, printJson, fail, rejectUnknownFlags,
  parseDenylistFrom, matchesDenylist, parseBudgetFrom, isEntryPoint } from './lib/common.mjs';
import { checkLedger, DEFAULT_BREAKER } from './ledger-check.mjs';
import { checkGates } from './gate-check.mjs';

/** 把拒绝列表的 glob 变成一条具体路径，用来验证真实 matcher 会命中它。 */
export function samplePathFor(glob) {
  const concrete = glob.split('/').map((seg) => {
    if (seg === '**') return 'src';
    if (seg === '*') return 'sample';
    return seg.replace(/\*/g, (m, off) => (off === 0 ? 'drill' : 'sample'));
  }).join('/');
  return /(^|\/)src$/.test(concrete) ? `${concrete}/drill-file.txt` : concrete;
}

/** 拒绝列表演练：每条模式必须命中，且一个普通源码路径必须放行。 */
export function runGateDrills(denylist, benign = 'src/app.ts') {
  const results = [];
  for (const glob of denylist) {
    const sample = samplePathFor(glob);
    // 畸形 glob（如 `[unclosed`）会让 matcher 抛异常。那是"这条模式根本生效不了"，
    // 记 failed 而不是让整个演练崩掉——护栏没响和演练跑不完，是同一件事。
    let hit;
    try {
      // 只拿**这条**模式去匹配。拿整个列表匹配会让被其它模式遮住的死条目
      // 也算通过——`auth/logn.ts` 这种永远生效不了的拼写错误必须被点名。
      hit = matchesDenylist(sample, [glob]);
    } catch (e) {
      results.push({
        id: `gate.denylist[${glob}]`,
        direction: 'sensitivity',
        outcome: 'failed',
        expected: `commit touching ${sample} is blocked by ${glob}`,
        actual: `matcher threw: ${e.message}`,
      });
      continue;
    }
    results.push({
      id: `gate.denylist[${glob}]`,
      direction: 'sensitivity',
      outcome: hit ? 'passed' : 'failed',
      expected: `commit touching ${sample} is blocked by ${glob}`,
      actual: hit ? `blocked by ${hit}` : 'allowed',
    });
  }
  let benignHit;
  try { benignHit = matchesDenylist(benign, denylist); } catch { benignHit = null; }
  results.push({
    id: 'gate.benign',
    direction: 'specificity',
    outcome: benignHit ? 'failed' : 'passed',
    expected: `${benign} is allowed`,
    actual: benignHit ? `blocked by ${benignHit}` : 'allowed',
  });
  return results;
}

/**
 * 熔断器演练：每个规则必须以**自己的**触发原因响。
 * 只断言"升级了"不够——被另一条规则拦下时，被测规则仍未证明。
 */
export function runBreakerDrills(opts = {}) {
  const cfg = { ...DEFAULT_BREAKER, ...opts };
  const results = [];
  const attempts = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1));
  const check = (list) => checkLedger({ goal: 'drill', attempts: list }, cfg);

  {
    const r = check(attempts(cfg.stagnationThreshold, (i) => ({
      iteration: i, action: 'retry', outcome: 'failure',
      error: "TypeError: Cannot read properties of undefined (reading 'id')",
    })));
    results.push({
      id: 'breaker.stagnation', direction: 'sensitivity',
      outcome: r.verdict === 'stagnation' ? 'passed' : 'failed',
      expected: 'stagnation', actual: r.verdict,
    });
  }
  {
    const distinct = [
      'TypeError: undefined is not a function',
      'ECONNREFUSED connecting to the database',
      'SyntaxError: unexpected token in JSON',
      'AssertionError: expected ok but got null',
      'Permission denied while writing the artifact',
      'OutOfMemoryError during the bundle step',
      'Segmentation fault in the native addon',
    ];
    const r = check(attempts(cfg.noProgressThreshold, (i) => ({
      iteration: i, action: `strategy ${i}`, outcome: 'failure',
      error: distinct[i % distinct.length],
    })));
    results.push({
      id: 'breaker.no-progress', direction: 'sensitivity',
      outcome: r.verdict === 'no-progress' ? 'passed' : 'failed',
      expected: 'no-progress', actual: r.verdict,
    });
  }
  if (cfg.tokenBudget) {
    const r = check([{ iteration: 1, action: 'expensive', outcome: 'success', tokensUsed: cfg.tokenBudget + 1 }]);
    results.push({
      id: 'breaker.token-budget', direction: 'sensitivity',
      outcome: r.verdict === 'token-budget' ? 'passed' : 'failed',
      expected: 'token-budget', actual: r.verdict,
    });
  } else {
    results.push({
      id: 'breaker.token-budget', direction: 'sensitivity', outcome: 'skipped',
      expected: 'token-budget', actual: 'no tokenBudget configured',
    });
  }
  {
    const r = check([
      { iteration: 1, action: 'read the failing test', outcome: 'success' },
      { iteration: 2, action: 'apply a minimal fix', outcome: 'success' },
    ]);
    results.push({
      id: 'breaker.healthy', direction: 'specificity',
      outcome: r.verdict === 'ok' ? 'passed' : 'failed',
      expected: 'ok', actual: r.verdict,
    });
  }
  return results;
}

/**
 * 验证者 canary（离线版）：证明**闸门会拒绝伪造的 APPROVE**。
 *
 * 这不是"验证者会不会偷懒"的测试——那需要一个模型，只能人工跑。
 * 它测的是另一半：当执行者自己编一份看起来合规的报告时，闸门能不能拦。
 * 三个 mutant 对应三种最常见的伪造方式；control 必须放行，否则一个
 * 见谁拒谁的闸门会通过所有敏感性检查，同时让循环不可用。
 */
export function runVerifierDrills(opts = {}) {
  const sha = 'a'.repeat(40);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-canary-'));
  const write = (name, lines) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, lines.join(String.fromCharCode(10)));
    return p;
  };
  const base = {
    item: 'canary', phase: 'gate', diffFiles: ['src/app.ts'], verdict: 'approve',
    redCheck: 'pass', reviewedSha: sha, headSha: sha, noReplay: true,
  };
  const evidence = (extra = {}) => [
    '## Verdict: APPROVE', '',
    `Author: ${extra.author || 'verifier-2'}`,
    `Reviewed commit: ${extra.commit || sha}`,
    'Change class confirmed: behavior',
    '', '### Evidence',
    '- Tests: `node scripts/test.mjs` → PASS',
    ...(extra.snippet === false ? [] : ['  ```', '  Passed: 10  Failed: 0', '  ```']),
    '', '### Checks not run', '- —',
  ];
  const cases = [
    {
      id: 'verifier.control', direction: 'specificity', expect: 'proceed',
      input: { ...base, evidenceFile: write('control.md', evidence()) },
    },
    {
      id: 'verifier.forged-no-snippet', direction: 'sensitivity', expect: 'escalate',
      input: { ...base, evidenceFile: write('no-snippet.md', evidence({ snippet: false })) },
    },
    {
      id: 'verifier.self-authored', direction: 'sensitivity', expect: 'escalate',
      input: { ...base, implementer: 'verifier-2', evidenceFile: write('self.md', evidence()) },
    },
    {
      id: 'verifier.wrong-commit', direction: 'sensitivity', expect: 'escalate',
      input: { ...base, evidenceFile: write('wrong.md', evidence({ commit: 'b'.repeat(40) })) },
    },
  ];
  const results = cases.map((c) => {
    const r = checkGates(c.input);
    return {
      id: c.id,
      direction: c.direction,
      outcome: r.decision === c.expect ? 'passed' : 'failed',
      expected: c.expect,
      actual: `${r.decision}${r.gate ? ` (${r.gate})` : ''}`,
    };
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return results;
}

// ---------------------------------------------------------------- loop-drill.json 读写与有效性
// 曾单独住在 drill-record.mjs；拆分的原始理由（harness-init 也要读它）已不成立——
// 两个文件同住本技能目录，合并少一份分发物（D-01=A，2026-10-24）。
// stage2 判据从这里 import recordStatus：判据只读记录，不跑演练。

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


function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['record', 'only', 'state', 'constraintsRoot', 'json', 'help'], 'drill-check');
  if (args.help) {
    process.stdout.write(`drill-check — prove the guardrails actually fire

Usage:
  node scripts/drill-check.mjs [--record] [--only gate|breaker|verifier] [--state <dir>]

Options:
  --record           Write results to loop-drill.json (bound to the constraints sha256)
  --only <groups>    Comma-separated: gate, breaker, verifier (default: all three)
                     verifier = offline canary: the gate must reject a forged
                     APPROVE report and accept a clean one. It does NOT test
                     whether a live model would verify honestly.
  --state <dir>      Directory holding loop-constraints.md (default: cwd)
  --constraints-root <d>  Same as --state, kept for symmetry with gate-check
  --json             JSON output
  --help             Show this help

Exit codes:
  0  every drill passed (an unconfigured guardrail is reported, not failed)
  1  the recorded proof is stale for the current constraints
  2  a guardrail did not fire
`);
    return;
  }

  const root = path.resolve(typeof args.state === 'string' ? args.state
    : typeof args.constraintsRoot === 'string' ? args.constraintsRoot : '.');
  const only = typeof args.only === 'string'
    ? args.only.split(',').map((s) => s.trim()).filter(Boolean)
    : ['gate', 'breaker', 'verifier'];
  const GROUPS = ['gate', 'breaker', 'verifier'];
  const unknown = only.filter((g) => !GROUPS.includes(g));
  if (unknown.length) fail(`--only accepts ${GROUPS.join(', ')} (got: ${unknown.join(', ')})`, 1);

  // 拆文件后拒绝列表在 harness-constraints.md；回落 loop-constraints.md 兼容旧仓库。
  const constraintsPath = [path.join(root, 'harness-constraints.md'), path.join(root, 'loop-constraints.md')]
    .find((p) => fs.existsSync(p) && parseDenylistFrom(readText(p)).length);
  if (!constraintsPath) fail(`no harness-constraints.md / loop-constraints.md with a ## Paths block in ${root}`, 1);
  const constraintsText = readText(constraintsPath);
  const denylist = parseDenylistFrom(constraintsText);

  const groups = {};
  const all = [];

  if (only.includes('gate')) {
    const results = runGateDrills(denylist);
    groups.gate = {
      recordedAt: new Date().toISOString(),
      input: { file: path.basename(constraintsPath), sha256: fingerprint(constraintsText) },
      results,
    };
    all.push(...results);
  }
  if (only.includes('verifier')) {
    const results = runVerifierDrills();
    groups.verifier = {
      recordedAt: new Date().toISOString(),
      mode: 'offline',
      results,
    };
    all.push(...results);
  }
  if (only.includes('breaker')) {
    // 预算若已配置，一并演练 token-budget；未配置时记 skipped 而不是假装通过。
    // 用真正的解析器，不自己再写一份正则：两份实现必然漂移，
    // 而漂移的方向是"演练证明了一个熔断器根本不会用的预算"。
    const tokenBudget = parseBudgetFrom(constraintsText).tokenBudget;
    const results = runBreakerDrills(tokenBudget ? { tokenBudget } : {});
    groups.breaker = { recordedAt: new Date().toISOString(), results };
    all.push(...results);
  }

  const failed = all.filter((r) => r.outcome === 'failed');
  const skipped = all.filter((r) => r.outcome === 'skipped');

  // 不带 --record 时，除了跑一遍，还要报告"现有记录是否还对当前策略有效"。
  // 改了约束文件却沿用旧记录，等于拿旧证据担保新策略。
  const status = recordStatus(root);
  if (!args.record && status.stale) {
    process.stdout.write(`STALE  ${RECORD_FILE}: ${status.reason}\n`);
    process.exit(1);
  }

  if (args.record) writeRecord(root, groups);

  if (args.json) {
    printJson({ root, results: all, failed: failed.length, skipped: skipped.length });
  } else {
    process.stdout.write(`Drill — ${root}\n`);
    for (const r of all) {
      const mark = r.outcome === 'passed' ? 'PASS' : r.outcome === 'failed' ? 'FAIL' : 'SKIP';
      process.stdout.write(`  ${mark}  ${r.id}  (${r.expected} → ${r.actual})\n`);
    }
    if (args.record) process.stdout.write(`\nRecorded to ${RECORD_FILE}\n`);
  }

  // 只有"配了却没过"才算失败。未配置的护栏记 skipped 但不算错误——
  // 否则每个没设预算的仓库都会永远 exit 1，而 exit 1 会变成噪音。
  if (failed.length) process.exit(2);
  process.exit(0);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
