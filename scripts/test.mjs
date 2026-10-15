#!/usr/bin/env node
/**
 * test.mjs — loop-harness 自检
 *
 * 零依赖测试：验证脚本行为、闸门判定、熔断逻辑、拒绝列表匹配、模板完整性。
 *
 * 用法：
 *   node scripts/test.mjs
 *   node scripts/test.mjs --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseArgs, boolArg, readRegistryStages, matchesDenylist, loadDenylist, parseDenylistFrom, readRegistryDefaults, structuredText, textHas, structuredHas, detectProject, verificationCommands, initScriptFromCommands, PACK_ROOT, TEMPLATE_DIR, SKILLS_DIR, listFiles, readText, hasEventWiring, runWithTreeKill } from './lib/common.mjs';
import { checkLedger, normalizeError } from './ledger-check.mjs';
import { route, ROUTES, readLocks } from './event-router.mjs';
import { checkGates } from './gate-check.mjs';
import { parseBudgetCaps, capForPattern, resolveCap } from './budget-check.mjs';
import { worktreeName } from './worktree.mjs';
import { scoreHarness } from './loop-audit.mjs';

const VERBOSE = process.argv.includes('--verbose');
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    if (VERBOSE) process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    process.stdout.write(`  FAIL  ${name}${detail ? ' — ' + detail : ''}\n`);
  }
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function section(title) {
  process.stdout.write(`\n${title}\n`);
}

/**
 * 把 feature_list.json 的占位 feature 换成真实条目。
 *
 * 阶段 1 判据 2 要求每条 feature 有可判定的完成标准——模板出厂的 3 条占位
 * feature 自称"占位符"，会被判据拒绝。任何断言"阶段 1 达成"的用例都必须先
 * 跑这个，否则测的是判据没生效而不是阶段达成了。
 */
function writeRealFeatures(fp) {
  const fl = JSON.parse(fs.readFileSync(fp, 'utf8'));
  fl.features.forEach((f, i) => {
    f.title = `真实功能 ${i + 1}`;
    f.user_visible_behavior = '用户执行 X 能看到 Y';
    f.verification = ['运行 npm test', '确认全部通过'];
    f.notes = '';
  });
  fs.writeFileSync(fp, JSON.stringify(fl, null, 2), 'utf8');
}

// ---------------------------------------------------------------- 1. 参数解析

section('1. CLI 参数解析');
{
  const saved = process.argv;
  process.argv = ['node', 'x', '--foo=bar', '--baz', 'qux', '--json', 'positional'];
  const a = parseArgs();
  process.argv = saved;
  eq('--foo=bar 内联值', a.foo, 'bar');
  eq('--baz qux 空格值', a.baz, 'qux');
  eq('--json 已知布尔标志 → true', a.json, true);
  ok('已知布尔标志不吞位置参数', Array.isArray(a._) && a._.includes('positional'), JSON.stringify(a._));

  process.argv = ['node', 'x', '--target', '/tmp/x', '--force'];
  const b = parseArgs();
  process.argv = saved;
  eq('--target 取值', b.target, '/tmp/x');
  eq('--force → true', b.force, true);

  process.argv = ['node', 'x', '--stagnation', '3'];
  const c = parseArgs();
  process.argv = saved;
  eq('数值参数取值', c.stagnation, '3');

  // ---- 布尔标志不得吞掉后随的裸值 ----
  // `--pause false` 曾经被解析成 pause=true + 位置参数 false，而 docs/03 的示例
  // 就写着 `--pause false`——照文档执行会得到永久紧急刹车。
  {
    const bad = parseArgs(['--pause', 'false']);
    ok('--pause false 被拒绝', typeof bad._error === 'string' && bad._error.includes('--pause'),
      JSON.stringify(bad));
    ok('--pause false 的报错给出正确写法', /--pause=false/.test(bad._error || ''), bad._error);

    const bare = parseArgs(['--pause']);
    eq('--pause（裸）→ true', bare.pause, true);
    eq('--pause（裸）无错误', bare._error, undefined);

    const explicit = parseArgs(['--pause=false']);
    eq('--pause=false 保留字符串值', explicit.pause, 'false');
    eq('--pause=false 无错误', explicit._error, undefined);

    // boolArg 才是把字符串转成布尔的正确方式（Boolean("false") === true 是陷阱）
    eq('boolArg("false") → false', boolArg('false'), false);
    eq('boolArg("true") → true', boolArg('true'), true);
    eq('boolArg(undefined) → false', boolArg(undefined), false);
    eq('boolArg(true) → true', boolArg(true), true);
    // 非布尔标志仍正常取值
    eq('非布尔标志仍取值', parseArgs(['--item', 'pr-1']).item, 'pr-1');
  }
}

// ---------------------------------------------------------------- 2. 拒绝列表

section('2. 拒绝列表匹配');
const denyCases = [
  ['.env', true],
  ['.env.local', true],
  ['.env.production', true],
  ['auth/session.ts', true],
  ['src/auth/login.ts', true],
  ['payments/charge.ts', true],
  ['billing/invoice.ts', true],
  ['config/secrets/db.yml', true],
  ['app/credentials/aws.json', true],
  ['certs/server_key.pem', true],
  ['certs/api_secret.txt', true],
  ['.terraform/state.tf', true],
  ['k8s/production/deploy.yml', true],
  ['db/migrations/001_init.sql', true],
  // 同名的配置文件形态：旧实现要求 x 是目录且后面有内容，这几个全部漏匹配
  ['secrets.yml', true],
  ['config/secrets.yml', true],
  ['secrets/', true],
  ['src/credentials.json', true],
  // 不应命中
  ['src/api/handler.ts', false],
  ['README.md', false],
  ['docs/authentication-guide.md', false],
  ['src/environment.ts', false],
  ['tests/billing.test.ts', false],
  ['src/payment.ts', false],
];
for (const [file, shouldMatch] of denyCases) {
  const hit = matchesDenylist(file) !== null;
  eq(`denylist ${file} → ${shouldMatch}`, hit, shouldMatch);
}

// ---- 大小写变体必须同样被拦 ----
// macOS/Windows 的文件系统大小写不敏感：AUTH/login.ts 与 auth/login.ts 是同一个文件。
// 拒绝列表若区分大小写，把目录改名成大写就能绕过它。
{
  const caseCases = [
    ['AUTH/login.ts', 'auth/**'],
    ['AUTH/LOGIN.TS', 'auth/**'],
    ['Payments/x.ts', 'payments/**'],
    ['Billing/y.ts', 'billing/**'],
    ['.ENV', '.env'],
    ['.Env.Local', '.env.*'],
    ['CONFIG/SECRETS/x.json', '**/secrets/**'],
    ['SRC/MONKEY_KEY.TS', '**/*_key*'],
  ];
  for (const [file, expect] of caseCases) {
    eq(`大小写变体 ${file} → ${expect}`, matchesDenylist(file), expect);
  }
  // 不引入新的误拦
  eq('大写不误拦测试文件', matchesDenylist('tests/AUTH.test.ts'), null);
  eq('大写不误拦普通源码', matchesDenylist('SRC/APP.TS'), null);
}

// 拒绝列表的真相源是 loop-constraints.md，不是脚本里的常量。
// 维护者按文档在 ## Paths 加的仓库特定路径必须真的被强制执行。
{
  eq('无 loop-constraints.md 时回落到常量', matchesDenylist('auth/x.ts', loadDenylist('/nonexistent-dir-xyz')) !== null, true);

  const parsed = parseDenylistFrom(fs.readFileSync(path.join(PACK_ROOT, 'loop-constraints.md'), 'utf8'));
  ok('能从 loop-constraints.md 解析出拒绝列表', parsed.length >= 10);
  ok('解析结果含 auth/**', parsed.includes('auth/**'));
  ok('解析时忽略行尾注释', parsed.every((p) => !p.includes('#') && !p.includes(' ')));

  // 用一个真实存在的文件当 repo 根：加一条自定义路径 → 必须命中
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-deny-'));
  const base = fs.readFileSync(path.join(PACK_ROOT, 'loop-constraints.md'), 'utf8');
  fs.writeFileSync(path.join(tmp, 'loop-constraints.md'),
    base.replace('auth/**', 'auth/**\ninfra/prod/**'));
  const loaded = loadDenylist(tmp);
  ok('自定义路径进入生效列表', loaded.includes('infra/prod/**'));
  eq('自定义路径被强制执行', matchesDenylist('infra/prod/main.tf', loaded), 'infra/prod/**');
  eq('自定义路径不影响既有规则', matchesDenylist('auth/x.ts', loaded), 'auth/**');

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 3. 错误签名归一化

section('3. 错误签名归一化');
{
  const a = normalizeError("TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:42");
  const b = normalizeError("TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:87");
  eq('不同行号归一化后相同', a, b);

  const c = normalizeError('Error at 2026-10-13T08:16:00Z in src/a/b.ts:12:5');
  const d = normalizeError('Error at 2026-10-14T09:20:00Z in src/a/b.ts:99:1');
  eq('不同时间戳/行列归一化后相同', c, d);

  const e = normalizeError('Cannot find module lodash');
  const f = normalizeError('Cannot find module axios');
  ok('不同模块归一化后不同', e !== f);

  // ---- 归一化不得把语义不同的错误折叠成同一个签名 ----
  // 曾经是 `\b\d+\b → <n>`，把退出码、HTTP 状态码、断言期望值全抹平了。
  // 后果：agent 依次遇到"500 服务端错误"→"404 路由缺失"→"超时"三种根因完全
  // 不同的失败时，会在第 3 次被判 stagnation 并熔断。
  eq('不同退出码不算同一签名',
    normalizeError('Error: process exited with code 1') === normalizeError('Error: process exited with code 2'),
    false);
  eq('HTTP 500 与 404 不算同一签名',
    normalizeError('fetch failed: status 500') === normalizeError('fetch failed: status 404'),
    false);
  eq('不同断言值不算同一签名',
    normalizeError('AssertionError: expected 5 to equal 6') === normalizeError('AssertionError: expected 7 to equal 8'),
    false);
  // 但真正的位置噪声仍要折叠
  eq('行号差异仍算同一签名',
    normalizeError('TypeError: boom at profile.ts:42') === normalizeError('TypeError: boom at profile.ts:87'),
    true);
  eq('line N 形式的位置仍折叠',
    normalizeError('error at line 42') === normalizeError('error at line 87'), true);
}

// ---------------------------------------------------------------- 4. 熔断器

section('4. 熔断器判定');
{
  const mk = (n, outcome, error) => Array.from({ length: n }, (_, i) => ({
    iteration: i + 1, item: 'x', action: 'a', outcome, error, tokensUsed: 100, at: '2026-01-01T00:00:00Z',
  }));

  eq('空账本 → ok', checkLedger({ attempts: [] }).verdict, 'ok');

  // ---- 账本不可读时必须停下，而不是回落到"一切正常" ----
  // 曾经 `Array.isArray(ledger?.attempts) ? ledger.attempts : []` 把缺字段、
  // 类型错、甚至 ledger 为 null 的输入全变成空数组 → verdict ok / exit 0。
  // 熔断器在它最需要说话的时候静默放行——而"永远生效不了的闸门"和
  // "不存在的闸门"在退出码上不可区分（硬约束 11）。
  for (const [label, bad] of [
    ['attempts 字段缺失', {}],
    ['attempts 不是数组（字符串）', { attempts: 'nope' }],
    ['attempts 为 null', { attempts: null }],
    ['attempts 为对象', { attempts: { a: 1 } }],
    ['ledger 为 null', null],
    ['ledger 为 undefined', undefined],
    ['ledger 为数组', []],
  ]) {
    const r = checkLedger(bad);
    eq(`${label} → no-ledger`, r.verdict, 'no-ledger');
    eq(`${label} → 退出码 2`, r.exit_code, 2);
  }
  ok('no-ledger 给出可行动的 next', /ledger/i.test(checkLedger({}).next),
    checkLedger({}).next);
  ok('no-ledger 说明为什么不可读', typeof checkLedger({}).unreadable_reason === 'string'
    && checkLedger({}).unreadable_reason.length > 0);
  // 边界：空 attempts 仍是 ok（"还没开始跑" ≠ "读不到"）
  eq('attempts 空数组仍是 ok', checkLedger({ attempts: [] }).verdict, 'ok');
  eq('attempts 空数组退出码 0', checkLedger({ attempts: [] }).exit_code, 0);

  // ---- 出厂账本必须与真实历史区分开 ----
  // 装配生成的 goal 是 "Replace with the current loop goal"，模板示例是
  // "Example loop ledger"。旧实现不看 goal，于是示例数据会被当成真实历史。
  {
    const shipped = { goal: 'Replace with the current loop goal', pattern: 'pr-review-triage', level: 'L2', attempts: mk(2, 'failure', 'E1') };
    eq('装配出的占位账本 → placeholder-ledger', checkLedger(shipped).verdict, 'placeholder-ledger');
    eq('占位账本退出码 2', checkLedger(shipped).exit_code, 2);
    const example = { goal: 'Example loop ledger — one entry per fix attempt.', attempts: mk(1, 'failure', 'E1') };
    eq('模板示例账本 → placeholder-ledger', checkLedger(example).verdict, 'placeholder-ledger');
    // 真实 goal 不受影响
    eq('真实 goal 的账本正常判定', checkLedger({ goal: '修 CI 的 flake', attempts: mk(3, 'failure', 'E1') }).verdict, 'stagnation');
    // 空 attempts 的占位账本仍走原路径（那是"还没开始跑"）
    eq('占位账本 + 空 attempts 仍是 ok',
      checkLedger({ goal: 'Replace with the current loop goal', attempts: [] }).verdict, 'ok');
    ok('placeholder-ledger 给出可行动的 next', /Replace `goal`/.test(checkLedger(shipped).next),
      checkLedger(shipped).next);
  }

  // 真实账本不受影响
  eq('3 次同错仍停滞', checkLedger({ attempts: mk(3, 'failure', 'E1') }).verdict, 'stagnation');
  eq('1 次失败 → ok', checkLedger({ attempts: mk(1, 'failure', 'E1') }).verdict, 'ok');
  eq('2 次同错 → ok', checkLedger({ attempts: mk(2, 'failure', 'E1') }).verdict, 'ok');
  eq('3 次同错 → stagnation', checkLedger({ attempts: mk(3, 'failure', 'E1') }).verdict, 'stagnation');
  eq('stagnation 退出码 2', checkLedger({ attempts: mk(3, 'failure', 'E1') }).exit_code, 2);

  // 不同错误 → 不算 stagnation，但 5 次连续失败 → no-progress
  const diffErrors = ['E1', 'E2', 'E3', 'E4', 'E5'].map((e, i) => ({
    iteration: i + 1, item: 'x', action: 'a', outcome: 'failure', error: e, tokensUsed: 100, at: 'x',
  }));
  eq('5 次不同错误 → no-progress', checkLedger({ attempts: diffErrors }).verdict, 'no-progress');

  // 成功后重置连续失败计数
  const withSuccess = [
    ...mk(4, 'failure', 'E1'),
    { iteration: 5, item: 'x', action: 'a', outcome: 'success', tokensUsed: 100, at: 'x' },
  ];
  eq('失败后成功 → 连续计数归零', checkLedger({ attempts: withSuccess }).consecutive_failures, 0);

  // 迭代上限
  const many = Array.from({ length: 10 }, (_, i) => ({
    iteration: i + 1, item: 'x', action: 'a', outcome: i % 2 === 0 ? 'success' : 'failure', error: 'E' + i, tokensUsed: 10, at: 'x',
  }));
  eq('10 次迭代 → max-iterations', checkLedger({ attempts: many }).verdict, 'max-iterations');

  // token 预算
  eq('超 token 预算', checkLedger({ attempts: mk(2, 'failure', 'E1') }, { tokenBudget: 100 }).verdict, 'token-budget');

  // 自定义阈值
  eq('自定义 stagnation=2', checkLedger({ attempts: mk(2, 'failure', 'E1') }, { stagnationThreshold: 2 }).verdict, 'stagnation');
}

// CLI 层：拼错的阈值必须 fail-closed（NaN 会让所有比较恒为 false）
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-ledcli-'));
  const lp = path.join(tmp, 'l.json');
  fs.writeFileSync(lp, JSON.stringify({ attempts: [] }));
  const run = (args) => {
    try {
      execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'ledger-check.mjs'), '--ledger', lp, ...args], { encoding: 'utf8', cwd: tmp });
      return 0;
    } catch (e) { return e.status; }
  };
  eq('非数字 --stagnation 退出 1', run(['--stagnation', 'abc']), 1);
  eq('非数字 --max-iterations 退出 1', run(['--max-iterations', 'abc']), 1);
  eq('非数字 --no-progress 退出 1', run(['--no-progress', 'abc']), 1);
  eq('非数字 --token-budget 退出 1', run(['--token-budget', 'abc']), 1);
  eq('合法数字阈值退出 0', run(['--stagnation', '3']), 0);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 5. 事件路由

section('5. 事件路由');
{
  const r1 = route('pull_request_review.changes_requested', { item: 'pr-123' });
  eq('changes_requested → fix', r1.phase, 'fix');
  ok('changes_requested 含 minimal-fix', r1.skills.includes('minimal-fix'));
  ok('changes_requested 含 loop-verifier', r1.skills.includes('loop-verifier'));
  ok('changes_requested 含 max-attempts 闸门', r1.gates.includes('max-attempts'));

  const r2 = route('issues.opened');
  eq('issues.opened → intake', r2.phase, 'intake');
  eq('issues.opened → L1', r2.level, 'L1');

  const r3 = route('check_suite.completed:failure');
  eq('CI failure → fix', r3.phase, 'fix');
  ok('CI failure 含 ci-triage', r3.skills.includes('ci-triage'));

  const r4 = route('pull_request.closed:merged');
  eq('merged → post-merge', r4.phase, 'post-merge');

  const r5 = route('push:tags');
  eq('tags → release', r5.phase, 'release');

  const r6 = route('totally.unknown.event');
  eq('未注册事件 registered=false', r6.registered, false);
  ok('未注册事件不自创流程', /not registered/i.test(r6.next));

  // 冲突检测：锁键是 acting_on（branch/PR），不是 work item id。
  // 曾经拿 item（pr-123 / ci-a1b2-main）与 acting_on 比 ===——两个不同命名空间，
  // 永远不相等，lock-held 触发不了；而"CI Sweeper 已在修某分支时 PR Review 不重复修"
  // 正是这条锁唯一该起作用的场景。
  const r7 = route('check_suite.completed:failure', {
    item: 'ci-a1b2c3-main',
    target: 'main',
    locks: [{ item: 'pr-review-triage', acting_on: 'main' }],
  });
  eq('锁冲突检测（同一 branch）', r7.conflict, 'lock-held');
  eq('锁冲突时记录持有者', r7.held_by, 'pr-review-triage');

  const r8 = route('check_suite.completed:failure', { item: 'pr-999', target: 'other', locks: [{ item: 'x', acting_on: 'pr-123' }] });
  eq('无冲突时不报 conflict', r8.conflict, undefined);

  eq('不同 branch 不算冲突',
    route('check_suite.completed:failure', { item: 'ci-1-main2', target: 'main2', locks: [{ item: 'x', acting_on: 'main' }] }).conflict,
    undefined);
  eq('同一条目自己的锁不算冲突',
    route('check_suite.completed:failure', { item: 'pr-review-triage', target: 'main', locks: [{ item: 'pr-review-triage', acting_on: 'main' }] }).conflict,
    undefined);
  eq('未给 target 时不误判',
    route('check_suite.completed:failure', { item: 'ci-a1b2c3-main', locks: [{ item: 'x', acting_on: 'main' }] }).conflict,
    undefined);

  // 所有注册事件都结构完整
  let allValid = true;
  for (const [ev, spec] of Object.entries(ROUTES)) {
    if (!spec.phase || !spec.level || !Array.isArray(spec.skills) || !Array.isArray(spec.gates) || !spec.next) {
      allValid = false;
      process.stdout.write(`    malformed route: ${ev}\n`);
    }
  }
  ok('所有路由条目结构完整', allValid);

  // readLocks 解析
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-locks-'));
  fs.writeFileSync(path.join(tmp, 'STATE.md'), [
    '# State', '', '## Active', '',
    '| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |',
    '|---|---|---|---|---|---|',
    '| pr-123 | fix | minimal-fix | loop/pr-123-fix-1 | 1/3 | wip |',
    '| pr-999 | review | x | — | 0 | idle |',
    '', '## Watch List', '', '- nothing',
  ].join('\n'));
  const locks = readLocks(path.join(tmp, 'STATE.md'));
  eq('readLocks 提取 1 个锁', locks.length, 1);
  eq('readLocks 正确 item', locks[0]?.item, 'pr-123');
  eq('readLocks 正确 acting_on', locks[0]?.acting_on, 'loop/pr-123-fix-1');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 6. 闸门判定

section('6. 闸门判定');
{
  // gate 阶段要求 redCheck 明确通过 + 两个 sha 都给 + approve 必须带证据文件，
  // 否则一律 escalate（fail-closed）。
  // 证据闸门的存在理由：verdict 是断言，不是证据。没有它时调用方填
  // --verdict approve 即可通过，而"独立验证"与"审查过的版本"两条硬约束
  // 都由调用方自证——一个接受自证的闸门和一个不存在的闸门，在退出码上不可区分。
  const evTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-gate-ev-'));
  const EV = path.join(evTmp, 'report.md');
  fs.writeFileSync(EV, [
    '## Verdict: APPROVE', '',
    '### Evidence',
    '- Tests: `npm test` → PASS',
    '- Red check: PASS — 回退后新测试挂掉',
  ].join('\n'));
  const GATE = { phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'pass', reviewedSha: 'abc123', headSha: 'abc123', evidenceFile: EV };
  eq('干净通过', checkGates({ item: 'p', ...GATE, budgetPct: 10 }).decision, 'proceed');
  eq('pause → exit', checkGates({ item: 'p', pause: true }).decision, 'exit');
  eq('pause 退出码 3', checkGates({ item: 'p', pause: true }).exit_code, 3);
  eq('预算 100% → exit', checkGates({ item: 'p', budgetPct: 100 }).decision, 'exit');
  eq('预算 85% → report-only', checkGates({ item: 'p', budgetPct: 85 }).decision, 'report-only');
  eq('预算 79% → proceed', checkGates({ item: 'p', phase: 'fix', diffFiles: ['a.ts'], verdict: 'approve', budgetPct: 79 }).decision, 'proceed');
  eq('拒绝列表 → escalate', checkGates({ item: 'p', diffFiles: ['auth/x.ts'] }).decision, 'escalate');
  eq('拒绝列表闸门名', checkGates({ item: 'p', diffFiles: ['auth/x.ts'] }).gate, 'denylist');
  eq('尝试 3 次 → escalate', checkGates({ item: 'p', attempts: 3, diffFiles: ['a.ts'] }).decision, 'escalate');
  eq('尝试上限闸门名', checkGates({ item: 'p', attempts: 3, diffFiles: ['a.ts'] }).gate, 'max-attempts');
  eq('6 文件 → scope escalate', checkGates({ item: 'p', attempts: 1, diffFiles: ['a', 'b', 'c', 'd', 'e', 'f'], verdict: 'approve' }).decision, 'escalate');
  eq('清理 8 文件 → 允许', checkGates({ item: 'p', attempts: 1, diffFiles: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], verdict: 'approve', isCleanup: true }).decision, 'proceed');
  eq('清理 11 文件 → escalate', checkGates({ item: 'p', attempts: 1, diffFiles: Array.from({ length: 11 }, (_, i) => `f${i}.ts`), verdict: 'approve', isCleanup: true }).decision, 'escalate');
  eq('verdict reject → escalate', checkGates({ item: 'p', attempts: 1, diffFiles: ['a.ts'], verdict: 'reject' }).decision, 'escalate');
  eq('verdict escalate-human → escalate', checkGates({ item: 'p', attempts: 1, diffFiles: ['a.ts'], verdict: 'escalate-human' }).decision, 'escalate');
  eq('gate 阶段无 verdict → escalate', checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'none' }).decision, 'escalate');

  // ---- TOCTOU：合并绑定审查过的 commit ----
  const t1 = checkGates({ item: 'p', ...GATE });
  eq('sha 一致 → proceed', t1.decision, 'proceed');
  const t2 = checkGates({ item: 'p', ...GATE, headSha: 'def456' });
  eq('sha 不一致 → escalate', t2.decision, 'escalate');
  eq('sha 不一致闸门名', t2.gate, 'head-commit');
  ok('sha 不一致提示 --match-head-commit', /match-head-commit/.test(t2.next));
  const t3 = checkGates({ item: 'p', ...GATE, reviewedSha: null, headSha: null });
  eq('gate 阶段缺 sha → escalate', t3.decision, 'escalate');
  eq('gate 阶段缺 sha 闸门名', t3.gate, 'head-commit');
  eq('只给 head-sha 也要拦', checkGates({ item: 'p', ...GATE, reviewedSha: null }).decision, 'escalate');
  eq('只给 reviewed-sha 也要拦', checkGates({ item: 'p', ...GATE, headSha: null }).decision, 'escalate');
  eq('非 gate 阶段不要求 sha', checkGates({ item: 'p', phase: 'fix', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'pass' }).decision, 'proceed');

  // ---- 回退测试（Red check）----
  const r1 = checkGates({ item: 'p', ...GATE });
  eq('red check 通过 → proceed', r1.decision, 'proceed');
  const r2 = checkGates({ item: 'p', ...GATE, redCheck: 'fail' });
  eq('red check 失败 → escalate', r2.decision, 'escalate');
  eq('red check 闸门名', r2.gate, 'red-check');
  const r3 = checkGates({ item: 'p', ...GATE, redCheck: 'not-run' });
  eq('gate 阶段未跑 red check → escalate', r3.decision, 'escalate');
  const r4 = checkGates({ item: 'p', phase: 'fix', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'not-run' });
  eq('fix 阶段未跑 red check 不阻断', r4.decision, 'proceed');
  const r5 = checkGates({ item: 'p', ...GATE, redCheck: undefined });
  eq('省略 redCheck 等同 not-run（忘传参数不得放行）', r5.decision, 'escalate');
  eq('省略 redCheck 时闸门名', r5.gate, 'red-check');

  // ---- 证据闸门（approve 必须带可核对的 verifier 报告）----
  {
    const noEv = checkGates({ item: 'p', ...GATE, evidenceFile: null });
    eq('gate+approve 无证据 → escalate', noEv.decision, 'escalate');
    eq('证据闸门名', noEv.gate, 'verification-evidence');

    eq('证据文件不存在 → escalate',
      checkGates({ item: 'p', ...GATE, evidenceFile: path.join(evTmp, 'nope.md') }).decision, 'escalate');

    const thinFile = path.join(evTmp, 'thin.md');
    fs.writeFileSync(thinFile, 'LGTM\n');
    eq('只有一句话的报告 → escalate',
      checkGates({ item: 'p', ...GATE, evidenceFile: thinFile }).decision, 'escalate');

    // 报告自称 REJECT 时，命令行说 approve 不成立
    const rejFile = path.join(evTmp, 'rej.md');
    fs.writeFileSync(rejFile, '## Verdict: REJECT\n\n### Evidence\n- Tests: `npm test` → FAIL\n');
    const contrad = checkGates({ item: 'p', ...GATE, evidenceFile: rejFile });
    eq('证据自称 REJECT → escalate', contrad.decision, 'escalate');
    ok('矛盾被指出来', /contradicts/.test(contrad.reason), contrad.reason);

    // 有 verdict 行但没有命令行证据 → 仍不算
    const noCmd = path.join(evTmp, 'nocmd.md');
    fs.writeFileSync(noCmd, '## Verdict: APPROVE\n\nLooks fine to me.\n');
    eq('缺命令输出行 → escalate',
      checkGates({ item: 'p', ...GATE, evidenceFile: noCmd }).decision, 'escalate');

    // 非 gate 阶段不强制证据，否则 fix 阶段无法工作
    eq('fix 阶段 approve 不需要证据',
      checkGates({ item: 'p', phase: 'fix', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve' }).decision, 'proceed');
    // reject 本来就在阻止，不需要证据
    eq('gate 阶段 reject 不需要证据',
      checkGates({ item: 'p', ...GATE, verdict: 'reject', evidenceFile: null }).decision, 'escalate');
    eq('gate 阶段 reject 命中 verification 闸（而非 evidence 闸）',
      checkGates({ item: 'p', ...GATE, verdict: 'reject', evidenceFile: null }).gate, 'verification');
  }

  // ---- NOT RUN 声明 ----
  const n1 = checkGates({ item: 'p', ...GATE, notRun: ['real-device', 'load-test'] });
  eq('有未跑项仍可 proceed', n1.decision, 'proceed');
  ok('未跑项出现在输出', Array.isArray(n1.checks_not_run) && n1.checks_not_run.length === 2);
  ok('未跑项在 next 中被提示列出', /NOT RUN/.test(n1.next));

  // 优先级：pause 覆盖一切
  const p1 = checkGates({ item: 'p', pause: true, diffFiles: ['auth/x.ts'], attempts: 9 });
  eq('pause 优先于 denylist 与 attempts', p1.gate, 'pause');

  // ---- 路由产出的每个 phase 都必须被闸门接受 ----
  // event-router 把 issues.closed / pull_request.closed:unmerged / release.published
  // 路由到 phase='close'，而 PHASES 里曾经没有它——三个已注册事件在闸门处必然退出 1，
  // 而退出 1（参数错误）不属于 proceed/report-only/escalate/exit 四态，调用方没有规定动作。
  {
    const gateSrc = fs.readFileSync(path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), 'utf8');
    const phases = JSON.parse(gateSrc.match(/const PHASES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
    const unroutable = Object.entries(ROUTES)
      .filter(([, spec]) => spec.phase && !phases.includes(spec.phase))
      .map(([ev, spec]) => `${ev} → ${spec.phase}`);
    ok('ROUTES 的每个 phase 都在 gate-check 的 PHASES 里', unroutable.length === 0, unroutable.join('; '));

    // 行为断言必须走 CLI——PHASES 只在 main() 里被校验，checkGates() 库函数不查它。
    // 第一次写这条断言时用的是 checkGates()，变异测试立刻暴露它无牙齿：
    // 把 'close' 从 PHASES 删掉后它仍然全绿。
    const runGate = (args) => {
      try {
        const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), ...args],
          { encoding: 'utf8' });
        return { code: 0, out: o };
      } catch (e) { return { code: e.status, out: e.stdout || '' }; }
    };
    eq('close 阶段被 CLI 接受',
      runGate(['--item', 'issue-1', '--phase', 'close', '--verdict', 'none', '--diff-files', 'a.ts']).code, 0);
    eq('close 阶段仍执行拒绝列表检查',
      runGate(['--item', 'issue-1', '--phase', 'close', '--verdict', 'none', '--diff-files', 'auth/x.ts']).code, 2);
  }
  // 优先级：denylist 优先于 attempts
  const p2 = checkGates({ item: 'p', attempts: 9, diffFiles: ['auth/x.ts'] });
  eq('denylist 优先于 attempts', p2.gate, 'denylist');
  // 优先级：budget 100 优先于 denylist
  const p3 = checkGates({ item: 'p', budgetPct: 100, diffFiles: ['auth/x.ts'] });
  eq('预算 100% 优先于 denylist', p3.gate, 'budget');

  fs.rmSync(evTmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 7. 文本匹配

section('7. 结构化文本匹配');
{
  const doc = [
    '# Title',
    'Startup Workflow is documented here',
    '',
    '- **Definition of Done**: all four must hold',
    '',
    '> a blockquote mentioning startup workflow but not in structured form',
  ].join('\n');
  const st = structuredText(doc);
  ok('structuredText 保留标题', st.includes('# Title'));
  ok('structuredText 保留列表项', st.includes('Definition of Done'));
  ok('structuredText 保留粗体引导', /Definition of Done/.test(st));
  ok('textHas 命中段落内文本', textHas(doc, ['startup workflow']));
  ok('structuredHas 命中列表项', structuredHas(doc, ['Definition of Done']));
  // 段落中的关键词不应被 structuredHas 命中
  const paraOnly = 'This paragraph mentions verification commands casually.';
  ok('structuredHas 不命中纯段落', !structuredHas(paraOnly, ['Verification Commands']));
  ok('textHas 命中纯段落', textHas(paraOnly, ['verification commands']));
}

// ---------------------------------------------------------------- 8. 项目检测

section('8. 项目检测与验证命令');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-detect-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'x', scripts: { check: 'tsc', test: 'vitest run', build: 'vite build', lint: 'eslint .' },
  }));
  const proj = detectProject(tmp);
  eq('检测 node 项目', proj.stack, 'node');
  const cmds = verificationCommands({ ...proj, root: tmp });
  ok('包含 install', cmds.some((c) => c.includes('install')));
  ok('包含 test', cmds.some((c) => c.includes('test')));
  ok('包含 build', cmds.some((c) => c.includes('build')));
  ok('包含 lint', cmds.some((c) => c.includes('lint')));
  fs.rmSync(tmp, { recursive: true, force: true });

  // Python 项目
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-py-'));
  fs.writeFileSync(path.join(tmp2, 'pyproject.toml'), '[project]\nname = "x"\n');
  const pyProj = detectProject(tmp2);
  eq('检测 python 项目', pyProj.stack, 'python');
  ok('python 命令含 pytest', verificationCommands(pyProj).some((c) => c.includes('pytest')));
  fs.rmSync(tmp2, { recursive: true, force: true });

  // 空目录
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-empty-'));
  eq('空目录 → generic', detectProject(tmp3).stack, 'generic');
  ok('generic 提示替换命令', verificationCommands(detectProject(tmp3)).some((c) => /replace this line/i.test(c)));
  fs.rmSync(tmp3, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 9. init 脚本生成

section('9. init.sh 生成');
{
  const script = initScriptFromCommands(['npm install', 'npm test']);
  ok('含 shebang', script.startsWith('#!/usr/bin/env bash'));
  ok('含 set -euo pipefail', script.includes('set -euo pipefail'));
  ok('含 npm install', script.includes('npm install'));
  ok('含 npm test', script.includes('npm test'));
  ok('含 Next steps', script.includes('Next steps'));
  // 自我识别标记：判据 5 凭它认出「要跑的正是正在运行的这份 init.sh」。
  // 生成的脚本若不带标记，判据 5 在自引用场景下会退化成无限递归。
  ok('含自我识别标记 LOOP_HARNESS_ACTIVE_INIT', /export LOOP_HARNESS_ACTIVE_INIT=/.test(script),
    script.split('\n').slice(0, 16).join('\n'));
  ok('标记的值是该脚本自身的绝对路径', /LOOP_HARNESS_ACTIVE_INIT="\$ROOT_WIN\/init\.sh"/.test(script));
}

// ---------------------------------------------------------------- 10. 模板完整性

section('10. 模板完整性');
{
  const requiredTemplates = [
    'AGENTS.md', 'feature_list.json', 'feature-list.schema.json', 'init.sh',
    'progress.md', 'session-handoff.md', 'loop-constraints.md', 'loop-budget.md',
    'loop-run-log.md', 'STATE.md', 'LOOP.md', 'pattern-template.md', 'LESSONS.md',
  ];
  for (const t of requiredTemplates) {
    ok(`模板存在: ${t}`, fs.existsSync(path.join(TEMPLATE_DIR, t)));
  }

  // feature_list 模板是合法 JSON 且符合 schema 结构
  const fl = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'feature_list.json'), 'utf8'));
  ok('feature_list 有 features 数组', Array.isArray(fl.features));
  ok('feature_list 每条含必需字段', fl.features.every((f) =>
    f.id && f.priority !== undefined && f.title && f.user_visible_behavior && f.status && Array.isArray(f.verification)));
  ok('feature_list 状态值合法', fl.features.every((f) =>
    ['not_started', 'in_progress', 'blocked', 'passing'].includes(f.status)));

  const schema = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'feature-list.schema.json'), 'utf8'));
  ok('schema 有 features required', schema.required?.includes('features'));
  ok('schema 定义 status 枚举', Array.isArray(schema.properties.features.items.properties.status.enum));

  // 模板占位符可替换
  const agentsTpl = fs.readFileSync(path.join(TEMPLATE_DIR, 'AGENTS.md'), 'utf8');
  ok('AGENTS 模板含占位符', /\{\{[A-Z_]+\}\}/.test(agentsTpl));
}

// ---------------------------------------------------------------- 11. 技能完整性

section('11. 技能完整性');
{
  const expectedSkills = [
    'harness-loop',
    'loop-constraints', 'loop-budget', 'loop-guard', 'event-router', 'signal-gatekeeper',
    'issue-triage', 'pr-review-triage', 'ci-triage',
    'minimal-fix', 'loop-verifier', 'post-merge-cleanup', 'release-drafter',
    'lesson-harvest',
    'harness-init', 'harness-loop-init', 'harness-consolidate',
  ];
  for (const s of expectedSkills) {
    const p = path.join(SKILLS_DIR, s, 'SKILL.md');
    ok(`技能存在: ${s}`, fs.existsSync(p));
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      ok(`技能 ${s} 有 frontmatter name`, /^---[\s\S]*?name:\s*\S+/m.test(content));
      ok(`技能 ${s} 有 description`, /description:/.test(content));
      ok(`技能 ${s} frontmatter 闭合`, (content.match(/^---$/gm) || []).length >= 2);
    }
  }

  // 关键技能必须含关键规则
  const minimalFix = fs.readFileSync(path.join(SKILLS_DIR, 'minimal-fix', 'SKILL.md'), 'utf8');
  ok('minimal-fix 含拒绝列表原句', /Do not modify files matching the denylist/i.test(minimalFix));
  ok('minimal-fix 声明不得自标完成', /不得标记自己的工作为完成|verifier.*决定/i.test(minimalFix));

  const verifier = fs.readFileSync(path.join(SKILLS_DIR, 'loop-verifier', 'SKILL.md'), 'utf8');
  ok('loop-verifier 默认立场 REJECT', /默认立场.*REJECT|REJECT.*默认/i.test(verifier));
  ok('loop-verifier 要求实际跑测试', /实际运行了测试|自己跑/.test(verifier));
  ok('loop-verifier 有独立性前提', /独立.*实例|同一会话/.test(verifier));
  ok('loop-verifier 含回退测试', /Red check|回退测试/.test(verifier));
  ok('loop-verifier 含 NOT RUN 规则', /NOT RUN/.test(verifier));
  ok('loop-verifier 含真机验证规则', /真实使用验证|真账号/.test(verifier));
  ok('loop-verifier 有 Checks not run 章节', /Checks not run/.test(verifier));

  const lessonHarvest = fs.readFileSync(path.join(SKILLS_DIR, 'lesson-harvest', 'SKILL.md'), 'utf8');
  ok('lesson-harvest 有 Seen N× 机制', /Seen N×|Seen N/.test(lessonHarvest));
  ok('lesson-harvest 有 3 次转正规则', /3 个不同日期|3 次/.test(lessonHarvest));
  ok('lesson-harvest 有三个扫描目标', /返工/.test(lessonHarvest) && /不该合/.test(lessonHarvest) && /验证/.test(lessonHarvest));
  ok('lesson-harvest 要求 Done right', /Done right/.test(lessonHarvest));
  ok('lesson-harvest 要求证据', /Evidence|证据/.test(lessonHarvest));

  const gatekeeper = fs.readFileSync(path.join(SKILLS_DIR, 'signal-gatekeeper', 'SKILL.md'), 'utf8');
  ok('gatekeeper 要求廉价模型', /廉价模型/.test(gatekeeper));
  ok('gatekeeper 默认丢弃', /默认丢弃/.test(gatekeeper));
  ok('gatekeeper 不转发原文', /不转发原文/.test(gatekeeper));

  const ciTriage = fs.readFileSync(path.join(SKILLS_DIR, 'ci-triage', 'SKILL.md'), 'utf8');
  ok('ci-triage 含 env 不修规则', /env.*escalate|环境问题.*代码/i.test(ciTriage));
  ok('ci-triage 有 flake 策略', /flake/i.test(ciTriage));

  const constraints = fs.readFileSync(path.join(SKILLS_DIR, 'loop-constraints', 'SKILL.md'), 'utf8');
  ok('loop-constraints 有加载确认输出', /Constraints loaded/.test(constraints));
}

// ---------------------------------------------------------------- 12. 根 harness 文件

section('12. 根 harness 文件');
{
  const required = [
    'README.md', 'AGENTS.md', 'LOOP.md', 'STATE.md', 'LESSONS.md',
    'loop-constraints.md', 'loop-budget.md', 'loop-run-log.md', 'loop-ledger.json',
    'patterns/registry.yaml',
  ];
  for (const f of required) {
    ok(`根文件存在: ${f}`, fs.existsSync(path.join(PACK_ROOT, f)));
  }

  const agents = fs.readFileSync(path.join(PACK_ROOT, 'AGENTS.md'), 'utf8');
  ok('AGENTS.md 有启动工作流', /启动工作流/i.test(agents));
  ok('AGENTS.md 有硬约束', /硬约束/.test(agents));
  ok('AGENTS.md 有完成定义', /完成定义/.test(agents));
  ok('AGENTS.md 有去向索引', /去向索引/.test(agents));

  const loop = fs.readFileSync(path.join(PACK_ROOT, 'LOOP.md'), 'utf8');
  ok('LOOP.md 有事件脊表', /事件脊/.test(loop));
  ok('LOOP.md 有路由规则', /路由规则/.test(loop));
  ok('LOOP.md 有多循环协调', /多循环协调/.test(loop));

  const constraints = fs.readFileSync(path.join(PACK_ROOT, 'loop-constraints.md'), 'utf8');
  ok('constraints 有拒绝列表', /拒绝列表/.test(constraints));
  ok('constraints 有 80% 预算规则', /80%/.test(constraints));
  ok('constraints 有尝试上限 3', /3 次/.test(constraints));

  const budget = fs.readFileSync(path.join(PACK_ROOT, 'loop-budget.md'), 'utf8');
  ok('budget 有阈值表', /Thresholds/.test(budget));
  ok('budget 有 kill switch', /Kill Switch/i.test(budget));

  // ledger 是合法 JSON
  const ledger = JSON.parse(fs.readFileSync(path.join(PACK_ROOT, 'loop-ledger.json'), 'utf8'));
  ok('ledger 有 attempts 数组', Array.isArray(ledger.attempts));

  // ---- run-log 的 outcome 必须在声明的枚举内 ----
  // 这张表里的值会被 Metrics to Watch 用来算空转率、升级率、平均尝试次数。
  // 曾经实际写入的值是 `fixed`，不在任何声明的枚举里，也没有任何东西校验——
  // 于是所有统计口径静默失效。声明与实现脱节正是这个仓库反复出的同一类病。
  {
    const runLog = fs.readFileSync(path.join(PACK_ROOT, 'loop-run-log.md'), 'utf8');
    const ENUM = ['no-op', 'report-only', 'fix-proposed', 'verified', 'escalated', 'no-wiring', 'manual'];
    const declared = (runLog.match(/\*\*`outcome` 枚举\*\*：(.+)/) || [])[1] || '';
    for (const v of ENUM) {
      ok(`outcome 枚举声明含 ${v}`, declared.includes('`' + v + '`'), declared.slice(0, 140));
    }
    const rows = [...runLog.matchAll(/^\{"run_id".*\}$/gm)]
      .map((m) => { try { return JSON.parse(m[0]); } catch { return null; } })
      .filter(Boolean);
    ok(`run-log 有可解析的记录（${rows.length} 条）`, rows.length > 0);
    const bad = [...new Set(rows.filter((r) => !ENUM.includes(r.outcome)).map((r) => r.outcome))];
    ok('每条 run-log 的 outcome 都在枚举内', bad.length === 0, `非法值: ${bad.join(', ')}`);
    // 模板里的枚举必须与仓库这份一致，否则新项目继承一个错的枚举
    const tplLog = fs.readFileSync(path.join(TEMPLATE_DIR, 'loop-run-log.md'), 'utf8');
    const tplDeclared = (tplLog.match(/\*\*`outcome` 枚举\*\*：(.+)/) || [])[1] || '';
    for (const v of ENUM) {
      ok(`模板 outcome 枚举含 ${v}`, tplDeclared.includes('`' + v + '`'), tplDeclared.slice(0, 140));
    }
  }

  // LESSONS.md 模板含棘轮机制
  const lessons = fs.readFileSync(path.join(PACK_ROOT, 'templates', 'LESSONS.md'), 'utf8');
  ok('LESSONS 模板含 Seen N× 格式说明', /Seen N×/.test(lessons));
  ok('LESSONS 模板含转正规则', /3 个不同日期/.test(lessons));
  ok('LESSONS 模板有 Rules 区', /## Rules/.test(lessons));
  ok('LESSONS 模板有 Done right 区', /## Done right/.test(lessons));

  // ---- 本仓库自己的 session-handoff.md 必须已填写 ----
  // 它是阶段 2 的产出之一，所以"文件存在"会让判据通过——但一份全是 [待填] 的
  // handoff 等于没有 handoff。出厂模板带占位符是对的（新项目必须自己填），
  // 源仓库这份不该留着占位。
  {
    const handoff = fs.readFileSync(path.join(PACK_ROOT, 'session-handoff.md'), 'utf8');
    const placeholders = ['[本次会话要达成什么]', '[做到哪了]', '[分支名]', '[commit hash]',
      '[完成项]', '[决策]', '[理由]', '[阻塞/风险]', '[描述与影响]', '[feature id 与名称]'];
    const found = placeholders.filter((p) => handoff.includes(p));
    ok('session-handoff.md 无模板占位符', found.length === 0, found.join(', '));
    ok('session-handoff.md 记录了当前目标', /\*\*Goal:\*\*\s*\S/.test(handoff));
    ok('session-handoff.md 有验证证据表', /## Verification Evidence/.test(handoff));
    // 模板本身必须仍然带占位符——否则新项目会继承一份"看起来已填"的空文件
    const tplHandoff = fs.readFileSync(path.join(TEMPLATE_DIR, 'session-handoff.md'), 'utf8');
    ok('模板 session-handoff.md 仍带占位符（新项目必须自己填）',
      tplHandoff.includes('[本次会话要达成什么]'));
  }
  ok('LESSONS 模板有转正记录表', /## Promoted to hard rules/.test(lessons));
  ok('LESSONS 模板有夜审日志', /## Nightly review log/.test(lessons));

  // 根 constraints 含 magpie 引入的四条机制
  const rootConstraints = fs.readFileSync(path.join(PACK_ROOT, 'loop-constraints.md'), 'utf8');
  ok('constraints 含 match-head-commit', /match-head-commit/.test(rootConstraints));
  ok('constraints 含回退测试', /回退测试/.test(rootConstraints));
  ok('constraints 含 NOT RUN 规则', /NOT RUN/.test(rootConstraints));
  ok('constraints 含真实使用验证', /真实使用验证/.test(rootConstraints));
  ok('constraints 有 Lessons 章节', /## Lessons/.test(rootConstraints));

  // AGENTS.md 硬约束扩展到 10 条
  ok('AGENTS.md 含 match-head-commit 约束', /match-head-commit/.test(agents));
  ok('AGENTS.md 含回退测试约束', /回退测试/.test(agents));
  ok('AGENTS.md 含 NOT RUN 约束', /NOT RUN/.test(agents));
  ok('AGENTS.md 索引含 LESSONS.md', /LESSONS\.md/.test(agents));
  ok('AGENTS.md 索引含案例文档', /09-case-magpie/.test(agents));
}

// ---------------------------------------------------------------- 13. 文档完整性

section('13. 文档完整性');
{
  const docs = [
    '00-mind-model.md', '01-event-spine.md', '02-state-model.md',
    '03-gates-and-levels.md', '04-safety.md', '05-failure-modes.md',
    '06-cost-and-observability.md', '07-adoption-ladder.md', '08-glossary.md',
    '09-case-magpie.md', '10-how-to-use.md', '11-three-stages.md',
    '12-stage-commands.md',
  ];
  for (const d of docs) {
    ok(`文档存在: docs/${d}`, fs.existsSync(path.join(PACK_ROOT, 'docs', d)));
  }

  // AGENTS.md 索引指向的文档都要存在
  const agents = fs.readFileSync(path.join(PACK_ROOT, 'AGENTS.md'), 'utf8');
  const refs = [...agents.matchAll(/docs\/([0-9]{2}-[a-z-]+\.md)/g)].map((m) => m[1]);
  ok('AGENTS.md 引用了文档', refs.length >= 8);
  for (const r of [...new Set(refs)]) {
    ok(`AGENTS.md 引用有效: docs/${r}`, fs.existsSync(path.join(PACK_ROOT, 'docs', r)));
  }

  // README 链接的文档都要存在
  const readme = fs.readFileSync(path.join(PACK_ROOT, 'README.md'), 'utf8');
  const rrefs = [...readme.matchAll(/docs\/([0-9]{2}-[a-z-]+\.md)/g)].map((m) => m[1]);
  for (const r of [...new Set(rrefs)]) {
    ok(`README 引用有效: docs/${r}`, fs.existsSync(path.join(PACK_ROOT, 'docs', r)));
  }

  // ---- 文档里关于"阶段 1 有几项判据 / 几个技能"的说法必须与代码一致 ----
  // 这次重构把阶段 1 从 10 项判据 12 个文件改成 8 项 7 个文件，技能从 18 减到 17。
  // 改完代码才发现 README 和 docs/10 的三处表格还写着旧数字——因为没有任何东西
  // 在校验它们。声明与实现脱节就是这个仓库反复出的同一类病，所以把它测出来。
  {
    const skillsOnDisk = fs.readdirSync(SKILLS_DIR)
      .filter((d) => fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))).length;
    const stage1Checks = JSON.parse((() => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-doc-crit-'));
      fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
      execFileSync(process.execPath, [
        path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), tmp, '--upgrade', '--stage', '1',
      ], { encoding: 'utf8' });
      writeRealFeatures(path.join(tmp, 'feature_list.json'));
      const j = JSON.parse(execFileSync(process.execPath, [
        path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), tmp, '--json',
      ], { encoding: 'utf8' }));
      fs.rmSync(tmp, { recursive: true, force: true });
      return JSON.stringify(j.stages[0].checks.length);
    })());
    eq('阶段 1 判据数（供文档比对）', stage1Checks, 8);

    // 扫描全部对外文档：出现旧数字就是漂移
    // LOOP.md 必须在清单里——它自称"调度与路由的唯一真相源"，
    // 却曾经独独留在"10 项（全机械）"上，而扫描清单漏了它，测试全绿。
    const docFiles = [
      'README.md', 'AGENTS.md', 'LOOP.md',
      ...fs.readdirSync(path.join(PACK_ROOT, 'docs')).map((d) => path.join('docs', d)),
    ];
    ok('漂移扫描覆盖 LOOP.md', docFiles.includes('LOOP.md'));
    ok('漂移扫描覆盖 AGENTS.md', docFiles.includes('AGENTS.md'));

    // 脚本数也必须被守住。docs/10 曾写"7 个顶层 .mjs"，实际是 8——
    // 与阶段判据数同源：文档里的数字没有任何东西在校验。
    {
      const topLevel = fs.readdirSync(path.join(PACK_ROOT, 'scripts'))
        .filter((f) => f.endsWith('.mjs')).length;
      const doc10 = fs.readFileSync(path.join(PACK_ROOT, 'docs', '10-how-to-use.md'), 'utf8');
      const m = doc10.match(/(\d+)\s*个顶层\s*`?\.mjs`?/);
      ok('docs/10 的顶层脚本数与实际一致', m && Number(m[1]) === topLevel,
        `文档=${m ? m[1] : '(未找到)'} / 实际=${topLevel}`);
    }

    const drift = [];
    for (const rel of docFiles) {
      const f = path.join(PACK_ROOT, rel);
      if (!fs.existsSync(f) || !/\.(md)$/.test(rel)) continue;
      const text = fs.readFileSync(f, 'utf8');
      // 「阶段 1 … 10 项」是已知的历史说法
      if (/1[01]\s*项/.test(text)) drift.push(`${rel} → 阶段判据数仍写成 10/11 项`);
      // 技能总数：只认目录树注释与带「共/一共/全部/总计」的措辞。
      // 「补上 4 个技能」是某阶段的增量，正确且不该判漂移。
      for (const m of text.matchAll(/skills?\/\s*#\s*(\d+)\s*个技能|(?:共|一共|全部|总计)\s*(\d+)\s*个技能/g)) {
        const n = Number(m[1] ?? m[2]);
        if (n !== skillsOnDisk) drift.push(`${rel} → 总数 ${n} 个技能（实际 ${skillsOnDisk}）`);
      }
      // 旧技能名不得出现在对外文档里。
      // 字面量拆开构造，否则本行会命中第 20 节的残留扫描。
      const OLD_NAMES = ['harness' + '-strengthen', 'harness' + '-bootstrap'];
      for (const rel of docFiles) {
        const f = path.join(PACK_ROOT, rel);
        if (!fs.existsSync(f) || !/\.(md)$/.test(rel)) continue;
        if (OLD_NAMES.some((n) => fs.readFileSync(f, 'utf8').includes(n))) {
          drift.push(`${rel} → 旧技能名`);
        }
      }
    }
    ok('文档里的阶段判据数与技能数与代码一致', drift.length === 0, drift.join('; '));
    ok(`技能数实测 ${skillsOnDisk}（供文档比对）`, skillsOnDisk === 17, String(skillsOnDisk));
  }

  // ---- 文档引用的每个 --flag 必须在脚本里真实存在 ----
  // 这条断言一次覆盖三类问题：--diff-files 少了 @、--reviewed-sha 没传、
  // --inject 根本不存在。它们的共同点是"文档说了、脚本没有"或"脚本要了、文档没给"，
  // 而 agent 按文档执行时会静默走进一条不生效的路径。
  {
    const knownByScript = {
      'gate-check.mjs': ['item', 'phase', 'attempts', 'diff-files', 'verdict', 'budget-pct', 'pause',
        'cleanup', 'reviewed-sha', 'head-sha', 'red-check', 'constraints-root', 'not-run', 'registry',
        'evidence-file', 'json', 'help'],
      'ledger-check.mjs': ['ledger', 'stagnation', 'no-progress', 'max-iterations', 'token-budget',
        'escalation', 'json', 'registry', 'help'],
      'event-router.mjs': ['event', 'item', 'target', 'state', 'list', 'json', 'help'],
    };
    const unknown = [];
    const scan = (d, depth) => {
      if (depth > 3) return;
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (['.git', '.mimosa', 'node_modules'].includes(e.name)) continue;
        const f = path.join(d, e.name);
        if (e.isDirectory()) { scan(f, depth + 1); continue; }
        if (!/\.md$/.test(e.name)) continue;
        // REVIEW-*.md 是历史记录，记录的是"当时文档长什么样"，不参与漂移检查
        if (/^REVIEW-\d{4}-\d{2}-\d{2}/.test(e.name)) continue;
        const text = fs.readFileSync(f, 'utf8');
        // 命令可以反斜杠续行，所以捕获必须能跨行；但**只在反斜杠续行时**跨行。
        // 曾经用 [\s\S]{0,300}? 一直捕获到下一个空行或围栏，于是文档里两条相邻的
        // 命令被算成同一条：`node scripts/gate-check.mjs ...` 下一行的
        // `--pattern` 被归给 gate-check，而它其实属于那行的 budget-check。
        // 相邻命令是文档的常态（枚举探针时尤其常见），这个假阳性必然出现——
        // 它报的是"gate-check 不认识 --pattern"，而真正的问题不存在。
        for (const m of text.matchAll(/node\s+scripts\/([a-z-]+\.mjs)((?:[^\n]*\\\n)*[^\n]*)/g)) {
          const script = m[1];
          const known = knownByScript[script];
          if (!known) continue;
          for (const fl of m[2].matchAll(/--([a-z][a-z-]+)/g)) {
            // 允许 <占位符> 形态的取值，但不允许不存在的标志名
            if (!known.includes(fl[1])) {
              unknown.push(`${path.relative(PACK_ROOT, f)} → ${script} --${fl[1]}`);
            }
          }
        }
      }
    };
    scan(PACK_ROOT, 0);
    ok('文档引用的每个 --flag 都在脚本中存在', unknown.length === 0, unknown.slice(0, 8).join('; '));

    // 这条断言必须真的能抓到问题——用一个不存在的标志验证扫描逻辑本身。
    // （若扫描正则写坏，unknown 会恒为空，断言就变成装饰品。）
    const probe = 'node scripts/gate-check.mjs --item x --totally-fake-flag y';
    const probeHits = [...probe.matchAll(/--([a-z][a-z-]+)/g)]
      .map((x) => x[1]).filter((fl) => !knownByScript['gate-check.mjs'].includes(fl));
    ok('扫描逻辑本身能识别未知标志', probeHits.includes('totally-fake-flag'), probeHits.join(','));
  }
}

// ---------------------------------------------------------------- 14. 事件接线

section('14. GitHub Actions 接线');
{
  const dir = path.join(PACK_ROOT, 'examples', 'github-actions');
  const expected = ['README.md', 'issue-intake.yml', 'pr-review.yml', 'ci-sweeper.yml', 'merge-gate.yml', 'post-merge.yml', 'release-draft.yml', 'daily-triage.yml', 'lesson-harvest.yml'];
  for (const f of expected) {
    ok(`workflow 存在: ${f}`, fs.existsSync(path.join(dir, f)));
  }

  for (const f of expected.filter((x) => x.endsWith('.yml'))) {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    ok(`${f} 声明 on:`, /^on:/m.test(content));
    ok(`${f} 声明 permissions:`, /permissions:/.test(content));
    ok(`${f} 有 concurrency 控制`, /concurrency:/.test(content));
    // 关键：没有 workflow 自动合并
    ok(`${f} 不含自动合并`, !/gh pr merge/.test(content));
    // 没有硬编码凭据
    ok(`${f} 无硬编码凭据`, !/(ghp_|github_pat_|sk-)[A-Za-z0-9]{10,}/.test(content));
  }

  // ---- run: 块内不得出现事件字段插值 ----
  // 直接插值等于把攻击者可控的分支名拼进 shell——分支名里的 `"; cmd; "` 会被真的执行
  // （本地模拟已复现）。允许出现在 env: 段（那是 GitHub 推荐的间接层）。
  {
    const offenders = [];
    for (const f of expected.filter((x) => x.endsWith('.yml'))) {
      const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
      let inRun = false;
      let runIndent = 0;
      lines.forEach((line, i) => {
        const m = line.match(/^(\s*)run:\s*[|>]?\s*$/);
        if (m) { inRun = true; runIndent = m[1].length; return; }
        if (inRun) {
          const indent = line.match(/^\s*/)[0].length;
          if (line.trim() && indent <= runIndent) inRun = false;
        }
        if (inRun && /\$\{\{\s*github\.event\./.test(line)) {
          offenders.push(`${f}:${i + 1} → ${line.trim().slice(0, 70)}`);
        }
      });
    }
    ok('run: 块内无事件字段插值', offenders.length === 0, offenders.slice(0, 6).join('; '));
  }

  // ---- merge-gate 必须提供约束 7/8/9 要求的参数 ----
  // 曾经它只传 4 个参数（缺 reviewed-sha / head-sha / red-check），
  // 于是每个 ready_for_review 的 PR 都收到 "human decision required"——
  // 持续假升级会训练人忽略它，最终闸门被关掉。
  {
    const mg = fs.readFileSync(path.join(dir, 'merge-gate.yml'), 'utf8');
    for (const flag of ['--reviewed-sha', '--head-sha', '--red-check', '--diff-files', '--budget-pct']) {
      ok(`merge-gate 传入 ${flag}`, mg.includes(flag));
    }
    ok('merge-gate 用 @ 前缀传清单（否则拒绝列表闸门失效）', /--diff-files\s+@/.test(mg), '未找到 --diff-files @');
    ok('merge-gate 调用 budget-check 而不是内联算预算', /budget-check\.mjs/.test(mg));
    // 调用必须 fail-closed。`budget-check ... || true` 吞掉一切：脚本崩溃时
    // budget.json 是空的，jq 得到 "null"，而 "null" != "exit" ——
    // 循环会在**没有预算检查**的情况下继续跑，且输出看起来完全正常。
    // 一个失效的闸门和一个不存在的闸门在退出码上不可区分（硬约束 11）。
    ok('merge-gate 的预算检查是 fail-closed（不得 || true 后直接继续）',
      !/budget-check\.mjs[^\n]*\|\|\s*true\s*$[\s\S]{0,400}?if \[ "\$MODE" = "exit" \]/.test(mg)
      || /jq -e '\.mode'/.test(mg),
      'budget-check 失败时没有拒绝运行的守卫');
    // 注释里提到旧逻辑不算问题——要抓的是活的代码行。
    const mgCode = mg.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    ok('merge-gate 不再有 Math.max 取全表上限的旧逻辑', !/Math\.max\(\.\.\.caps\)/.test(mgCode));

    // 行为断言：用 workflow 里的参数形态（占位替换成具体值）必须能到非 escalate
    const tmpMg = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-mg-'));
    fs.writeFileSync(path.join(tmpMg, 'changed.txt'), 'src/app.ts\n');
    const runMg = (extra) => {
      try {
        const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'),
          '--item', 'pr-1', '--phase', 'gate', '--diff-files', '@changed.txt',
          '--verdict', 'none', '--budget-pct', '10',
          '--reviewed-sha', 'abc', '--head-sha', 'abc', '--red-check', 'pass', ...extra],
          { encoding: 'utf8', cwd: tmpMg });
        return { code: 0, out: o };
      } catch (e) { return { code: e.status, out: e.stdout || '' }; }
    };
    const mgOk = runMg([]);
    ok('merge-gate 参数形态不再必然 escalate',
      !/"gate": "head-commit"/.test(mgOk.out), mgOk.out.slice(0, 200));
    // sha 不一致必须被拦住（审查后又 push）
    ok('sha 不一致时命中 head-commit',
      /"gate": "head-commit"/.test(runMg(['--head-sha', 'def']).out), '未拦住');
    // red-check 未跑必须被拦住
    ok('red-check 未跑时命中 red-check',
      /"gate": "red-check"/.test(runMg(['--red-check', 'not-run']).out), '未拦住');
    fs.rmSync(tmpMg, { recursive: true, force: true });
  }

  // ---- LOOP_BOT_TOKEN：文档声明与代码引用必须一致 ----
  //
  // 原断言是 `.some()`——1/8 个 workflow 引用它就算通过。那证明不了它
  // 声称守住的东西："用独立最小权限账号限制注入影响面"。修复前只有
  // merge-gate 用，另 7 个裸 GITHUB_TOKEN，断言依然全绿。
  //
  // 规则按"是否调用 gh"划：不用 gh 的 workflow 不需要这个 token
  // （它们的权限只来自 permissions: 声明），调 gh 的必须用。
  {
    const ymls = expected.filter((x) => x.endsWith('.yml'));
    const textOf = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

    const ghUsers = ymls.filter((f) => /(^|[^a-zA-Z_/-])gh\s+[a-z]/.test(textOf(f)));
    ok('识别出调用 gh 的 workflow', ghUsers.length === 3, ghUsers.join(', '));

    const bare = ghUsers.filter((f) => {
      const t = textOf(f);
      // 有 GH_TOKEN 的地方必须都是 LOOP_BOT_TOKEN || GITHUB_TOKEN
      const all = t.match(/GH_TOKEN:\s*\$\{\{[^}]*\}\}/g) || [];
      if (all.length === 0) return true;
      return all.some((line) => !/LOOP_BOT_TOKEN/.test(line));
    });
    ok('每个调用 gh 的 workflow 都用 LOOP_BOT_TOKEN（独立机器人账号）',
      bare.length === 0, bare.join('; '));

    // 不调 gh 的 workflow 不应引用该 token——它们的权限只来自 permissions:。
    // 反向守住"规则只适用于该适用的地方"。
    const nonGhWithToken = ymls
      .filter((f) => !ghUsers.includes(f) && /LOOP_BOT_TOKEN/.test(textOf(f)));
    ok('不调 gh 的 workflow 不引用 LOOP_BOT_TOKEN',
      nonGhWithToken.length === 0, nonGhWithToken.join('; '));

    const docsMention = /LOOP_BOT_TOKEN/.test(
      fs.readFileSync(path.join(dir, 'README.md'), 'utf8'));
    ok('LOOP_BOT_TOKEN 文档声明与代码引用一致（否则文档说"必须设置"而没人读它）',
      docsMention && ghUsers.length > 0, `文档声明=${docsMention}`);
  }

  // ---- 规则断言：每个 workflow 都必须有预算与 kill switch 入口 ----
  //
  // 原断言写在单个文件上（`/budget-check\.mjs/.test(merge-gate.yml)`），
  // 于是"另外 7 个没接线"永远测不出来。这是 WP-09 的实际失效形态。
  //
  // 为什么每个 workflow 都要：预算是这套框架唯一的经济性来源，而
  // `loop-budget.md` 的阈值表对"哪个循环"没有意义——每个循环有自己的上限。
  // 内联算预算必然要挑一个上限，而挑全表最大值会让 per-loop 上限变成装饰品
  // （实测：PR Review Triage 花掉自身 83% 时被算成 50%）。
  {
    const ymls = expected.filter((x) => x.endsWith('.yml'));
    const textOf = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

    const noBudget = ymls.filter((f) => !/budget-check\.mjs/.test(textOf(f)));
    ok('每个 workflow 都调用 budget-check（预算与 kill switch 的唯一入口）',
      noBudget.length === 0, noBudget.join('; '));

    // 不得再有内联的取全表最大值逻辑——那是 per-loop 上限失效的根源。
    const inlineMax = ymls.filter((f) => /Math\.max\(\.\.\.caps\)/.test(textOf(f)));
    ok('没有 workflow 再用 Math.max(...caps) 取全表上限',
      inlineMax.length === 0, inlineMax.join('; '));

    // 每个 workflow 必须传自己的 pattern id，否则会解析不到上限。
    // 从 budget-check 的调用行里抽出 --pattern 值，逐一验证能解析到 cap。
    const caps = parseBudgetCaps(fs.readFileSync(path.join(PACK_ROOT, 'loop-budget.md'), 'utf8'));
    const badPattern = [];
    for (const f of ymls) {
      const m = textOf(f).match(/budget-check\.mjs\s+--pattern\s+([A-Za-z0-9_-]+)/);
      if (!m) { badPattern.push(`${f}（未传 --pattern）`); continue; }
      if (resolveCap(caps, m[1]).cap === null) badPattern.push(`${f} → --pattern ${m[1]} 无对应上限`);
    }
    ok('每个 workflow 的 --pattern 都能解析到该循环自己的上限',
      badPattern.length === 0, badPattern.join('; '));

    // fail-closed：`|| true` 吞掉退出码之后必须有显式的"读不到就拒绝"守卫，
    // 否则脚本崩溃会被静默当成"预算正常"。
    const failOpen = ymls.filter((f) => {
      const t = textOf(f);
      if (!/\|\|\s*true/.test(t)) return false;
      return !/jq -e '\.mode'/.test(t);
    });
    ok('budget-check 失败时 fail-closed（不得静默继续）',
      failOpen.length === 0, failOpen.join('; '));

    // 每个 workflow 的预算模式必须真的影响行为（report-only / exit 有对应动作），
    // 而不是只把值写进 output 就完事。
    const noAction = ymls.filter((f) => {
      const t = textOf(f);
      return !/MODE.*=.*"exit"|mode.*=.*exit/.test(t);
    });
    ok('每个 workflow 都对 exit 模式有动作', noAction.length === 0, noAction.join('; '));
  }

  // ---- 规则断言：落盘 work item 的 workflow 必须参与 acting_on 锁 ----
  //
  // 这条断言防的是一整类漏改，而不是某个文件。此前的形态是断言
  // "harness-loop 的 SKILL.md 里写了 --target"——那只证明文档写了，
  // 不证明任何生产路径传了它。实测：8 个 workflow 全都没传 --target，
  // 而"同一分支每小时最多一个循环修改"是 LOOP.md 的多循环协调**唯一机制**。
  //
  // 更根本的一层：只加 --target 也不够。锁结果要有人读才有意义——
  // 修之前没有任何 workflow 读 .conflict，加了 --target 也只是把结果丢掉。
  // 所以这条断言是双向的：**传了锁键** 且 **消费了锁结果**。
  {
    const ymls = expected.filter((x) => x.endsWith('.yml'));
    // 剥掉整行注释再匹配。注释里提到某个路径不等于真的写了它——
    // 这条断言第一版就被自己的注释骗过：release-draft.yml 的说明文字里
    // 写了 ".loop/queue" 来解释它为什么不参与锁，于是它被算成"落盘 workflow"。
    // merge-gate 的断言早就用同样的手法剥注释（见上文 `mgCode`），这里是同一课。
    const textOf = (f) => fs.readFileSync(path.join(dir, f), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

    // 判据是"是否落盘 work item"，不是"是否调 event-router"。
    // release-draft 会调 event-router 但不写队列，LOOP.md 明确把它列为
    // "只读为主，可安全并发"——它不该被锁挡住。merge-gate / daily-triage /
    // lesson-harvest 根本不路由事件。
    const queueWriters = ymls.filter((f) => /\.loop\/queue/.test(textOf(f)));
    eq('落盘 work item 的 workflow 恰好 4 个', queueWriters.length, 4);
    ok('落盘名单符合预期',
      ['ci-sweeper.yml', 'issue-intake.yml', 'post-merge.yml', 'pr-review.yml']
        .every((f) => queueWriters.includes(f)),
      queueWriters.join(', '));

    const noTarget = queueWriters.filter((f) => !/--target/.test(textOf(f)));
    ok('每个落盘 work item 的 workflow 都传 --target（否则锁静默失效）',
      noTarget.length === 0, noTarget.join('; '));

    // 必须**真的从 route.json 读** conflict，而不是文本里出现 ".conflict" 就算数。
    // 这条断言的第一版是 /\.conflict/ ——注释里写一句 ".conflict" 就能骗过它，
    // 变异回退当场证明了这点：把 jq 调用换成 CONFLICT="none" 后测试仍然全绿。
    // 断言必须锚在真实调用形态上。
    const noConflict = queueWriters.filter((f) => !/jq\s+-r\s+'\.conflict/.test(textOf(f)));
    ok('每个落盘 workflow 都真的从 route.json 读 conflict',
      noConflict.length === 0, noConflict.join('; '));

    // lock-held 必须真的改变行为：光读 .conflict 而不据此跳过，
    // 等于"读了个寂寞"——work item 照样落盘。
    //
    // 断言必须锚在**写队列那个步骤**上，不能只搜整个文件里有没有
    // "conflict != 'lock-held'"。变异回退抓出过两版无牙齿的写法：
    //   1. /\.conflict/ ——注释里写一句就骗过；
    //   2. 按文件搜 `if:.*conflict != 'lock-held'` ——同一个文件里
    //      `Upload work item` 与 `Flag fix phase` 的 if: 也含这个条件，
    //      于是删掉 `Record work item` 的守卫仍然全绿。
    // 只有"定位到写队列的那一步、再检查它自己的 if:"才是真的在测行为。
    const unwatched = queueWriters.filter((f) => {
      // 按步骤切分：每段从 `- name:` 或 `- uses:` 开始
      const steps = textOf(f).split(/\n(?=\s*- (?:name|uses):)/);
      const writer = steps.find((s) => /mkdir -p \.loop\/queue/.test(s));
      if (!writer) return true;                       // 找不到写队列的步骤 → 失败
      return !/^\s*if:.*conflict\s*!=\s*'lock-held'/m.test(writer);
    });
    ok('lock-held 时写队列的那一步被跳过（锁必须改变行为）',
      unwatched.length === 0, unwatched.join('; '));

    // 不落盘的 workflow 不得传 --target：它们不该参与锁。
    // 反向守住"规则只适用于该适用的地方"。
    const nonWriters = ymls.filter((f) => !queueWriters.includes(f) && /event-router\.mjs/.test(textOf(f)));
    const wronglyLocked = nonWriters.filter((f) => /--target/.test(textOf(f)));
    ok('不落盘的 workflow 不参与锁（release-draft 可安全并发）',
      wronglyLocked.length === 0, wronglyLocked.join('; '));

    // 锁键命名空间必须与 STATE.md 的 acting_on 一致：分支名或 PR 号。
    // 曾经用 item（pr-45 / ci-a1b2-main）与 acting_on 比 ===，两个命名空间
    // 永不相等，lock-held 触发不了。这里守住"锁键取自目标资源"这一形态。
    ok('pr-review 的锁键是 PR 号', /ROUTE_TARGET:\s*pr-\$\{\{\s*github\.event\.pull_request\.number/.test(textOf('pr-review.yml')));
    ok('post-merge 的锁键是 PR 号', /--target\s+"pr-\$\{PR_NUMBER\}"/.test(textOf('post-merge.yml')));
    ok('ci-sweeper 的锁键是分支名', /ROUTE_TARGET:\s*\$\{\{\s*steps\.item\.outputs\.branch/.test(textOf('ci-sweeper.yml')));
  }

  // ---- 规则断言：LOOP.md 声明的锁约定必须有代码消费 ----
  // LOOP.md 写着"派发前检查 acting_on，相同则跳过"——这是声明。
  // 声明要成立，必须有人真的读 STATE.md 的 Active 表并产出 lock-held。
  {
    const loopMd = fs.readFileSync(path.join(PACK_ROOT, 'LOOP.md'), 'utf8');
    ok('LOOP.md 声明了 acting_on 锁', /acting_on/.test(loopMd));
    ok('LOOP.md 声明了跳过动作', /跳过/.test(loopMd));

    // 行为断言：有锁 + 同目标 → lock-held（真跑 CLI，不走库函数）
    const tmpLock = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-lock-wf-'));
    fs.writeFileSync(path.join(tmpLock, 'STATE.md'), [
      '# Loop State', '', '## Active', '',
      '| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |',
      '|---|---|---|---|---|---|',
      '| pr-42 | fix | minimal-fix | pr-42 | 1/3 | acting |', '',
    ].join('\n'));
    const routeWith = (extra) => (() => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          [path.join(PACK_ROOT, 'scripts', 'event-router.mjs'),
            '--event', 'pull_request.opened', '--item', 'pr-99',
            '--state', path.join(tmpLock, 'STATE.md'), ...extra], { encoding: 'utf8' }) };
      } catch (e) { return { code: e.status, out: e.stdout || '' }; }
    })();
    const held = routeWith(['--target', 'pr-42']);
    ok('传 --target 时产出 lock-held', /"conflict":\s*"lock-held"/.test(held.out), held.out.slice(0, 160));
    ok('lock-held 时给出持有者', /"held_by":\s*"pr-42"/.test(held.out), held.out.slice(0, 160));
    const free = routeWith(['--target', 'pr-99']);
    ok('目标不同时不报冲突', !/"conflict"/.test(free.out), free.out.slice(0, 160));
    fs.rmSync(tmpLock, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- 15. 端到端：装配到空仓库

section('15. 端到端装配');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-e2e-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
    name: 'e2e', scripts: { test: 'echo ok', build: 'echo build' },
  }));

  let out = '';
  try {
    out = execFileSync(process.execPath, [
      path.join(PACK_ROOT, 'scripts', 'init-loop-harness.mjs'),
      '--target', tmp, '--level', 'L2',
    ], { encoding: 'utf8' });
  } catch (e) {
    ok('init-loop-harness 执行成功', false, e.message);
  }

  const expectCreated = [
    // L2 = 阶段 1 地基 + 阶段 2 的 loop 机制文档
    'AGENTS.md', 'feature_list.json', 'progress.md', 'STATE.md', 'LESSONS.md',
    'init.sh', 'loop-constraints.md',
    'session-handoff.md', 'loop-budget.md', 'loop-run-log.md', 'LOOP.md',
    'loop-ledger.json',
    // 技能必须落在 agent 会扫描的路径下，不是裸 skills/
    '.agents/skills/harness-loop/SKILL.md',
    '.agents/skills/loop-constraints/SKILL.md',
    '.agents/skills/minimal-fix/SKILL.md',
    '.agents/skills/loop-verifier/SKILL.md',
    '.agents/skills/issue-triage/SKILL.md',
    '.agents/skills/ci-triage/SKILL.md',
    '.agents/skills/harness-loop-init/SKILL.md',
  ];
  for (const f of expectCreated) {
    ok(`装配生成: ${f}`, fs.existsSync(path.join(tmp, f)));
  }
  // L2 不得装阶段 3 的技能——曾经 L1 就装了 signal-gatekeeper 与 lesson-harvest，
  // 于是「装了多少技能」根本反映不出项目到了哪个阶段。
  for (const s of ['lesson-harvest', 'signal-gatekeeper', 'post-merge-cleanup', 'release-drafter']) {
    ok(`L2 不装阶段 3 技能 ${s}`,
      !fs.existsSync(path.join(tmp, '.agents', 'skills', s, 'SKILL.md')));
  }

  // ---- L1 不得产出 loop 机制文档 ----
  // 曾经 init-loop-harness --level L1 写全部 12 个文件（含 5 个 loop 机制文档），
  // 而 harness-stage --upgrade --stage 1 写 7 个。同一件事两个脚本两套结果。
  // L2 的断言抓不到这个：L2 本来就该有这些文件。
  const tmpL1 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-e2e-l1-'));
  fs.writeFileSync(path.join(tmpL1, 'package.json'), JSON.stringify({
    name: 'e2e-l1', scripts: { test: 'echo ok' },
  }));
  try {
    execFileSync(process.execPath, [
      path.join(PACK_ROOT, 'scripts', 'init-loop-harness.mjs'),
      '--target', tmpL1, '--level', 'L1',
    ], { encoding: 'utf8' });
    ok('init-loop-harness --level L1 执行成功', true);
  } catch (e) {
    ok('init-loop-harness --level L1 执行成功', false, e.message);
  }
  for (const f of ['LOOP.md', 'loop-budget.md', 'loop-run-log.md', 'session-handoff.md', 'loop-ledger.json']) {
    ok(`L1 不产出 ${f}（loop 机制属阶段 2）`, !fs.existsSync(path.join(tmpL1, f)));
  }
  for (const f of ['AGENTS.md', 'feature_list.json', 'progress.md', 'STATE.md', 'LESSONS.md', 'loop-constraints.md']) {
    ok(`L1 产出 ${f}`, fs.existsSync(path.join(tmpL1, f)));
  }
  for (const s of ['loop-guard', 'minimal-fix', 'loop-verifier', 'harness-loop-init']) {
    ok(`L1 不装阶段 2 技能 ${s}`,
      !fs.existsSync(path.join(tmpL1, '.agents', 'skills', s, 'SKILL.md')));
  }
  for (const s of ['signal-gatekeeper', 'lesson-harvest']) {
    ok(`L1 不装阶段 3 技能 ${s}`,
      !fs.existsSync(path.join(tmpL1, '.agents', 'skills', s, 'SKILL.md')));
  }
  // 运行时编排任何阶段都装
  ok('L1 装运行时编排 harness-loop',
    fs.existsSync(path.join(tmpL1, '.agents', 'skills', 'harness-loop', 'SKILL.md')));
  fs.rmSync(tmpL1, { recursive: true, force: true });
  // 不得写进没有任何 agent 会扫描的裸 skills/
  ok('不写裸 <repo>/skills/（无人扫描的路径）', !fs.existsSync(path.join(tmp, 'skills')));

  // AGENTS.md 占位符已替换
  const agents = fs.readFileSync(path.join(tmp, 'AGENTS.md'), 'utf8');
  ok('占位符 PROJECT_PURPOSE 已替换', !agents.includes('{{PROJECT_PURPOSE}}'));
  ok('占位符 VERIFICATION_COMMANDS 已替换', !agents.includes('{{VERIFICATION_COMMANDS}}'));
  ok('AGENTS.md 含实际验证命令', agents.includes('npm test'), 'expected "npm test" in generated AGENTS.md');

  // init.sh 可执行且内容正确
  const initPath = path.join(tmp, 'init.sh');
  ok('init.sh 已生成', fs.existsSync(initPath));
  const initContent = fs.readFileSync(initPath, 'utf8');
  ok('init.sh 含 npm test', initContent.includes('npm test'));
  ok('init.sh 含 set -euo pipefail', initContent.includes('set -euo pipefail'));

  // 幂等：再跑一次不应覆盖
  const out2 = execFileSync(process.execPath, [
    path.join(PACK_ROOT, 'scripts', 'init-loop-harness.mjs'),
    '--target', tmp, '--level', 'L2',
  ], { encoding: 'utf8' });
  ok('重复运行报告 SKIPPED', /SKIPPED/.test(out2));

  // 审计该仓库
  const audit = scoreHarness(tmp);
  ok(`装配后可审计（score=${audit.score}）`, audit.score > 0);
  ok('装配后至少 L1', ['L1', 'L2', 'L3'].includes(audit.level), `got ${audit.level}`);
  ok('审计识别出 verifier', audit.checks.find((c) => c.key === 'verifier')?.ok === true);
  ok('审计识别出状态文件', audit.checks.find((c) => c.key === 'stateFile')?.ok === true);

  // ---- 子系统映射必须匹配阶段 1 的实际产物 ----
  // 曾经 instructions 依赖 loopConfig（LOOP.md，阶段 2 才建）、lifecycle 依赖
  // budgetDoc/budgetSkill/stallDetection/escalation（全在阶段 2）。于是阶段 1
  // 项目明明有 AGENTS.md + STATE.md + progress.md，子系统却报缺口，
  // 判据 #9「五子系统都有最小工件」永远 FAIL。
  // 这条断言的意义：改动 summarizeSubsystems 的映射必须让阶段 1 变红。
  {
    const s1 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-sub-s1-'));
    fs.writeFileSync(path.join(s1, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    execFileSync(process.execPath, [
      path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), s1, '--upgrade', '--stage', '1',
    ], { encoding: 'utf8' });
    writeRealFeatures(path.join(s1, 'feature_list.json'));
    const s1a = scoreHarness(s1);
    // 断言全部检查项，而非只判 passed > 0。
    // 曾经这里只判 lifecycle.passed > 0：映射改回
    // budgetDoc/budgetSkill/stallDetection/escalation 之后，budgetSkill 与
    // escalation 仍然通过（技能装上了、AGENTS.md 写着升级路径），passed 照样 > 0，
    // 断言全绿——映射错了却测不出来。判 total 才能锁住"这个子系统有几个入口"。
    for (const k of ['instructions', 'state', 'verification', 'scope', 'lifecycle']) {
      const s = s1a.subsystems[k] || {};
      ok(`阶段 1 项目 ${k} 子系统有工件`, s.passed > 0, `${k}: ${JSON.stringify(s)}`);
    }
    // 子系统的入口不能依赖阶段 2 才创建的文件
    ok('阶段 1 无 loopConfig 但 instructions 仍成立',
      s1a.checks.find((c) => c.key === 'loopConfig')?.ok === false
      && (s1a.subsystems.instructions.passed > 0));
    ok('阶段 1 无 budgetDoc 但 lifecycle 仍成立',
      s1a.checks.find((c) => c.key === 'budgetDoc')?.ok === false
      && (s1a.subsystems.lifecycle.passed > 0));
    // lifecycle 的入口必须是阶段 1 就有的状态文件，而不是阶段 2 的预算文档。
    // budgetSkill/escalation 在阶段 1 会因为"技能装上了"而通过——
    // 技能存在 ≠ 机制生效，正是这条断言要防的事。
    eq('lifecycle 子系统入口数（阶段 1 靠 STATE.md + run-log）',
      s1a.subsystems.lifecycle.total, 2);
    eq('instructions 子系统入口数（阶段 1 只有指令文件）',
      s1a.subsystems.instructions.total, 1);
    ok('lifecycle 全靠阶段 2 才建的 loop 文档时不成立',
      s1a.subsystems.lifecycle.passed > 0
      && s1a.subsystems.lifecycle.total < 4,
      `lifecycle: ${JSON.stringify(s1a.subsystems.lifecycle)}——映射可能改回了阶段 2 入口`);
    fs.rmSync(s1, { recursive: true, force: true });
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 16. 审计自身

section('16. 审计 loop-harness 自身');
{
  const audit = scoreHarness(PACK_ROOT);
  ok(`自身审计通过（score=${audit.score}, level=${audit.level}）`, audit.score >= 40);
  ok('自身有 verifier 检查通过', audit.checks.find((c) => c.key === 'verifier')?.ok === true);
  ok('自身有 constraints 文件', audit.checks.find((c) => c.key === 'constraintsFile')?.ok === true);
  ok('自身有 budget 文档', audit.checks.find((c) => c.key === 'budgetDoc')?.ok === true);
  ok('自身有 run log', audit.checks.find((c) => c.key === 'runLog')?.ok === true);
  ok('自身有 registry', audit.checks.find((c) => c.key === 'registry')?.ok === true);
  // 未跑过真实循环时不得授予 L3——结构性就绪 ≠ 跑过
  if (!audit.activity.present) {
    ok('无真实活动时封顶在 L2', audit.level !== 'L3', `got ${audit.level}`);
    ok('封顶时给出说明', audit.findings.some((f) => /no real loop activity/i.test(f)));
  }
  ok('分数不超过 100', audit.score <= 100);

  // L2 必须要求 verifier：没有 verifier 的仓库只能是 L1
  const tmpNoVerifier = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-noverify-'));
  fs.writeFileSync(path.join(tmpNoVerifier, 'STATE.md'), '# State\n\nLast run: 2026-10-13T08:00:00Z\n');
  fs.mkdirSync(path.join(tmpNoVerifier, 'skills', 'issue-triage'), { recursive: true });
  fs.writeFileSync(path.join(tmpNoVerifier, 'skills', 'issue-triage', 'SKILL.md'),
    '---\nname: issue-triage\ndescription: triage\n---\n\n# Triage\n');
  fs.writeFileSync(path.join(tmpNoVerifier, 'loop-constraints.md'), '## Paths\n');
  fs.writeFileSync(path.join(tmpNoVerifier, 'loop-budget.md'), 'budget\n');
  fs.writeFileSync(path.join(tmpNoVerifier, 'loop-run-log.md'), '## Log\n');
  fs.writeFileSync(path.join(tmpNoVerifier, 'LOOP.md'), '# Loop\n\nbudget gates denylist\n');
  fs.writeFileSync(path.join(tmpNoVerifier, 'AGENTS.md'), '# Agents\n');
  const noVerifierAudit = scoreHarness(tmpNoVerifier);
  ok('无 verifier 不得授予 L2', noVerifierAudit.level !== 'L2' && noVerifierAudit.level !== 'L3',
    `got ${noVerifierAudit.level}`);
  ok('无 verifier 时给出封顶说明',
    noVerifierAudit.findings.some((f) => /Capped at L1: no verifier/i.test(f)));
  fs.rmSync(tmpNoVerifier, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 16b. 活动检测的假阳性防护

section('16b. 活动检测假阳性防护');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-activity-'));
  // 一个只有模板、没有真实运行的仓库
  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\nLast run: never\n\n## Active\n\n| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |\n|---|---|---|---|---|---|\n| — | — | — | — | — | — |\n');
  fs.writeFileSync(path.join(tmp, 'loop-run-log.md'), [
    '# Run Log', '', '## Format', '',
    '```json', '{"run_id":"2026-01-01T00:00:00Z","pattern":"example"}', '```', '',
    '## Log', '', '<!-- empty -->', '',
  ].join('\n'));

  const a = scoreHarness(tmp);
  ok('"Last run: never" 不算活动', !/Last run timestamp/.test(a.activity.evidence.join(' ')));
  ok('格式示例 JSON 不算运行记录', !a.activity.present, `evidence: ${JSON.stringify(a.activity.evidence)}`);

  // 加入一条真实运行记录后应被识别
  fs.appendFileSync(path.join(tmp, 'loop-run-log.md'),
    '{"run_id":"2026-10-13T08:15:00Z","pattern":"pr-review-triage","item":"pr-1","outcome":"report-only"}\n');
  const b = scoreHarness(tmp);
  ok('真实运行记录被识别', b.activity.present, `evidence: ${JSON.stringify(b.activity.evidence)}`);

  // ---- 手工开发记录不得算作循环活动 ----
  // `manual` 的语义是"不计入循环统计"（loop-run-log.md 的 outcome 枚举）。
  // 审计若把它算成活动，就是在给"从没跑过循环"发绿灯——
  // 而"一个从没跑过循环的仓库拿到 activity 分"正是这个检查存在的反面。
  {
    const m = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-activity-manual-'));
    fs.writeFileSync(path.join(m, 'STATE.md'), '# State\n\nLast run: never\n\n## Active\n\n| Work item | 阶段 | acting_on |\n|---|---|---|\n| — | — | — |\n');
    fs.writeFileSync(path.join(m, 'loop-run-log.md'), [
      '# Run Log', '', '## Log', '',
      '{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"x","outcome":"manual"}',
      '{"run_id":"2026-10-14T00:00:00Z","pattern":"doc-drift","event":"manual.design","item":"y","outcome":"manual"}',
      '',
    ].join('\n'));
    const ma = scoreHarness(m);
    ok('只有 manual 记录时不算循环活动', !ma.activity.present,
      `evidence: ${JSON.stringify(ma.activity.evidence)}`);
    ok('manual 记录被记进 notes（可见但不计分）',
      ma.activity.notes.some((n) => /manual/.test(n)), JSON.stringify(ma.activity.notes));

    // 同一份日志里加一条事件驱动记录 → 立即算活动
    fs.appendFileSync(path.join(m, 'loop-run-log.md'),
      '{"run_id":"2026-10-14T01:00:00Z","pattern":"ci-sweeper","event":"check_suite.completed:failure","item":"ci-1","outcome":"escalated"}\n');
    ok('混入一条事件驱动记录后算活动', scoreHarness(m).activity.present);

    // ---- 开发会话标签不得算作 Last run ----
    // "Last run: 2026-10-14 (stage-boundary rework)" 描述的是"我们改了什么"，
    // 不是"循环跑过"。它带日期，所以旧判定会把它当证据。
    fs.rmSync(path.join(m, 'loop-run-log.md'));
    fs.writeFileSync(path.join(m, 'STATE.md'),
      '# State\n\nLast run: 2026-10-14 (stage-boundary rework)\n\n## Active\n\n| Work item | 阶段 | acting_on |\n|---|---|---|\n| — | — | — |\n');
    const sess = scoreHarness(m);
    ok('会话标签不算 Last run 证据', !sess.activity.present,
      `evidence: ${JSON.stringify(sess.activity.evidence)}`);
    ok('会话标签被记进 notes', sess.activity.notes.some((n) => /session label/.test(n)),
      JSON.stringify(sess.activity.notes));

    // ---- 非 Active 章节的表格不得算作活跃 work item ----
    // 旧实现扫描整个 STATE.md 的表格行，于是 Post-Run Critique 里的数据表
    // 被当成 25 个"活跃 work item"，审计因此认为循环正在处理工作。
    fs.writeFileSync(path.join(m, 'STATE.md'), [
      '# State', '', 'Last run: never', '',
      '## Active', '', '| Work item | 阶段 | acting_on |', '|---|---|---|', '| — | — | — |', '',
      '## Post-Run Critique', '',
      '| 输入 | 修前 | 修后 |', '|---|---|---|',
      '| `{}` | ok / 0 | no-ledger / 2 |',
      '| `{attempts: "nope"}` | ok / 0 | no-ledger / 2 |', '',
    ].join('\n'));
    const tbl = scoreHarness(m);
    ok('非 Active 章节的表格不算活跃 work item', !tbl.activity.present,
      `evidence: ${JSON.stringify(tbl.activity.evidence)}`);

    // 真的往 Active 表里放一行 → 算活动
    fs.writeFileSync(path.join(m, 'STATE.md'), [
      '# State', '', 'Last run: never', '',
      '## Active', '', '| Work item | 阶段 | acting_on |', '|---|---|---|',
      '| ci-a1b2 | fix | main |', '',
    ].join('\n'));
    ok('Active 表里的真实 work item 算活动', scoreHarness(m).activity.present);

    fs.rmSync(m, { recursive: true, force: true });
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 18. gate-check CLI 文件列表

section('18. gate-check CLI 文件列表');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-cli-'));
  const listPath = path.join(tmp, 'changed.txt');
  fs.writeFileSync(listPath, 'src/a.ts\nsrc/b.ts\n');
  const denyList = path.join(tmp, 'deny.txt');
  fs.writeFileSync(denyList, 'src/a.ts\nauth/x.ts\n');

  const run = (args) => {
    try {
      const out = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), ...args], {
        encoding: 'utf8', cwd: tmp,
      });
      return { code: 0, out, err: '' };
    } catch (e) {
      return { code: e.status, out: e.stdout || '', err: e.stderr || '' };
    }
  };

  // 裸路径一律按单一路径处理——曾经"文件存在就当清单读"，同一命令串因
  // 文件系统状态不同而含义不同。要传清单必须写 @ 前缀。
  const r1 = run(['--item', 'p', '--diff-files', listPath, '--verdict', 'approve']);
  ok('裸文件路径按单一路径处理', r1.out.includes('"files_changed": 1'), r1.out.slice(0, 120));

  const r2 = run(['--item', 'p', '--diff-files', '@' + denyList, '--verdict', 'approve']);
  ok('@前缀文件列表命中拒绝列表', r2.out.includes('"gate": "denylist"'), r2.out.slice(0, 160));
  eq('@前缀命中时退出码 2', r2.code, 2);

  const r3 = run(['--item', 'p', '--diff-files', 'a.ts,b.ts,c.ts', '--verdict', 'approve']);
  ok('逗号列表解析', r3.out.includes('"files_changed": 3'), r3.out.slice(0, 120));

  const r4 = run(['--item', 'p', '--diff-files', '@' + path.join(tmp, 'nope.txt')]);
  eq('缺失的 @文件报错退出 1', r4.code, 1);

  // ---- 参数校验：畸形输入必须 fail-closed ----
  eq('拼错的 verdict 退出 1', run(['--item', 'p', '--phase', 'gate', '--verdict', 'aprove']).code, 1);
  eq('未知 verdict 值退出 1', run(['--item', 'p', '--phase', 'gate', '--verdict', 'xyzzy']).code, 1);
  eq('拼错的 phase 退出 1', run(['--item', 'p', '--phase', 'gtae', '--verdict', 'approve']).code, 1);
  eq('未知 red-check 退出 1', run(['--item', 'p', '--phase', 'gate', '--red-check', 'maybe', '--verdict', 'approve']).code, 1);
  eq('非数字 attempts 退出 1', run(['--item', 'p', '--phase', 'fix', '--attempts', 'abc']).code, 1);
  eq('非数字 budget-pct 退出 1', run(['--item', 'p', '--phase', 'fix', '--budget-pct', 'abc']).code, 1);
  eq('无参调用退出 1', run([]).code, 1);

  // ---- 未知标志必须 fail-closed ----
  // 标志名层面的静默丢弃与已经修掉的 NaN 阈值是同一个病：
  // `--diff-filesx` 被 parseArgs 收进 args 后无人消费，files_changed 变成 0，
  // 拒绝列表闸门整个失效，而工具照常输出 JSON、照常退出 0。
  // 一个拼错的标志和一个不存在的闸门，在退出码上不可区分。
  eq('拼错的 --diff-filesx 退出 1', run(['--item', 'p', '--phase', 'fix', '--diff-filesx', 'a.ts']).code, 1);
  eq('拼错的 --attemptsx 退出 1', run(['--item', 'p', '--phase', 'fix', '--attemptsx', '9']).code, 1);
  eq('拼错的 --reviewed-sh 退出 1', run(['--item', 'p', '--phase', 'gate', '--reviewed-sh', 'a']).code, 1);
  {
    const u = run(['--item', 'p', '--phase', 'fix', '--diff-filesx', 'a.ts']);
    ok('未知标志的报错点名了那个标志', /diff-filesx/.test(u.err || ''), (u.err || '').slice(0, 120));
  }
  // 正确的写法仍工作——这条防的是"把校验写成一律拒绝"
  eq('正确的 --diff-files 仍工作', run(['--item', 'p', '--phase', 'fix', '--diff-files', 'a.ts',
    '--verdict', 'approve']).code, 0);
  eq('正确的 --attempts 仍工作', run(['--item', 'p', '--phase', 'fix', '--diff-files', 'a.ts',
    '--verdict', 'approve', '--attempts', '1']).code, 0);

  // 同样的校验必须覆盖另外两个脚本
  {
    const runScript = (script, args) => {
      try {
        const out = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', script), ...args],
          { encoding: 'utf8', cwd: tmp });
        return { code: 0, out, err: '' };
      } catch (e) {
        return { code: e.status, out: e.stdout || '', err: e.stderr || '' };
      }
    };
    eq('ledger-check 拒绝未知标志',
      runScript('ledger-check.mjs', ['--ledger', path.join(PACK_ROOT, 'loop-ledger.json'), '--inject', 'x']).code, 1);
    eq('event-router 拒绝未知标志',
      runScript('event-router.mjs', ['--event', 'issues.opened', '--targt', 'main']).code, 1);
    eq('event-router 接受 --target',
      runScript('event-router.mjs', ['--event', 'issues.opened', '--target', 'main']).code, 0);
  }

  // 省略 --red-check 且处于 gate → 必须 escalate（忘传参数不得放行）
  const g1 = run(['--item', 'p', '--phase', 'gate', '--verdict', 'approve',
    '--reviewed-sha', 'abc123', '--head-sha', 'abc123']);
  eq('gate 省略 red-check 时退出 2', g1.code, 2);
  ok('gate 省略 red-check 命中 red-check 闸', g1.out.includes('"gate": "red-check"'), g1.out.slice(0, 160));

  // gate 缺 sha → 必须 escalate（TOCTOU 不可绕过）
  const g2 = run(['--item', 'p', '--phase', 'gate', '--verdict', 'approve', '--red-check', 'pass']);
  eq('gate 缺 sha 时退出 2', g2.code, 2);
  ok('gate 缺 sha 命中 head-commit 闸', g2.out.includes('"gate": "head-commit"'), g2.out.slice(0, 160));

  // 完整合法调用 → proceed（gate 阶段还要证据文件，见证据闸门）
  const evFile = path.join(tmp, 'verifier-report.md');
  fs.writeFileSync(evFile, [
    '## Verdict: APPROVE', '',
    '### Evidence',
    '- Tests: `npm test` → PASS',
    '- Red check: PASS — 回退后新测试挂掉',
  ].join('\n'));
  const g3 = run(['--item', 'p', '--phase', 'gate', '--verdict', 'approve', '--red-check', 'pass',
    '--reviewed-sha', 'abc123', '--head-sha', 'abc123', '--diff-files', 'a.ts',
    '--evidence-file', evFile]);
  eq('完整 gate 调用退出 0', g3.code, 0);
  ok('完整 gate 调用 proceed', g3.out.includes('"decision": "proceed"'), g3.out.slice(0, 120));

  // ---- verdict 词汇归一化 ----
  // loop-verifier 的输出格式是 APPROVE / REJECT / ESCALATE_HUMAN，而这里的枚举是
  // 小写连字符。两处各按自己的文档执行时必然得到"参数错误"，而参数错误不属于
  // proceed/report-only/escalate/exit 四态——最重要的人工升级信号会在传递途中消失。
  {
    const upper = run(['--item', 'p', '--phase', 'fix', '--verdict', 'ESCALATE_HUMAN', '--diff-files', 'a.ts']);
    const lower = run(['--item', 'p', '--phase', 'fix', '--verdict', 'escalate-human', '--diff-files', 'a.ts']);
    eq('ESCALATE_HUMAN 被接受（不再是参数错误）', upper.code, 2);
    eq('两种写法退出码一致', upper.code, lower.code);
    ok('两种写法 decision 一致',
      upper.out.includes('"decision": "escalate"') && lower.out.includes('"decision": "escalate"'),
      upper.out.slice(0, 120));
    eq('REJECT 大写也被接受',
      run(['--item', 'p', '--phase', 'fix', '--verdict', 'REJECT', '--diff-files', 'a.ts']).code, 2);
    eq('APPROVE 大写被接受',
      run(['--item', 'p', '--phase', 'fix', '--verdict', 'APPROVE', '--diff-files', 'a.ts']).code, 0);
    // 归一化不能把垃圾值也放进来
    eq('仍然拒绝真正的垃圾 verdict',
      run(['--item', 'p', '--phase', 'fix', '--verdict', 'LGTM', '--diff-files', 'a.ts']).code, 1);
  }

  // ---- 证据闸门：verdict 是断言，不是证据 ----
  // 没有这一步时，调用方填 --verdict approve 即可通过，而"独立验证"与
  // "审查过的 commit"两条硬约束都由调用方自证——一个接受自证的闸门，
  // 和一个不存在的闸门，在退出码上不可区分。
  {
    const bad = path.join(tmp, 'bad.md');
    fs.writeFileSync(bad, '## Verdict: REJECT\n\n### Evidence\n- Tests: `npm test` → FAIL\n');
    const thin = path.join(tmp, 'thin.md');
    fs.writeFileSync(thin, 'LGTM, looks good to me.\n');

    const G = ['--item', 'p', '--phase', 'gate', '--diff-files', 'a.ts', '--verdict', 'approve',
      '--red-check', 'pass', '--reviewed-sha', 'abc', '--head-sha', 'abc'];

    const noEv = run(G);
    eq('gate+approve 无证据文件时退出 2', noEv.code, 2);
    ok('命中 verification-evidence 闸',
      noEv.out.includes('"gate": "verification-evidence"'), noEv.out.slice(0, 160));

    eq('证据文件不存在时退出 2', run([...G, '--evidence-file', path.join(tmp, 'nope.md')]).code, 2);

    const contrad = run([...G, '--evidence-file', bad]);
    eq('证据自称 REJECT 时退出 2', contrad.code, 2);
    ok('矛盾被明确指出来', /contradicts/.test(contrad.out), contrad.out.slice(0, 200));

    eq('只有一句话的报告被拒', run([...G, '--evidence-file', thin]).code, 2);

    const pass = run([...G, '--evidence-file', evFile]);
    eq('合规报告可 proceed', pass.code, 0);
    ok('合规报告时 decision=proceed', pass.out.includes('"decision": "proceed"'), pass.out.slice(0, 120));

    // 非 gate 阶段不强制证据（否则每次 fix 都要先有 verifier 报告，无法工作）
    eq('fix 阶段 approve 不需要证据',
      run(['--item', 'p', '--phase', 'fix', '--diff-files', 'a.ts', '--verdict', 'approve']).code, 0);
  }

  // 端到端：loop-constraints.md 里声明的仓库特定路径必须真的被 gate-check 强制执行。
  // 曾经只读脚本常量，文档说 A、代码做 B（且 B 是危险的那一侧）。
  const root2 = path.join(tmp, 'repo');
  fs.mkdirSync(root2, { recursive: true });
  const lc = path.join(root2, 'loop-constraints.md');
  const baseText = fs.readFileSync(path.join(PACK_ROOT, 'loop-constraints.md'), 'utf8');
  fs.writeFileSync(lc, baseText);
  const run2 = (args) => {
    try {
      execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), '--constraints-root', root2, ...args],
        { encoding: 'utf8', cwd: tmp });
      return { code: 0, out: '' };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  };
  const before = run2(['--item', 'p', '--phase', 'fix', '--diff-files', 'infra/prod/main.tf', '--verdict', 'approve']);
  eq('未声明的自定义路径不拦', before.code, 0);
  fs.writeFileSync(lc, baseText.replace('payments/**', 'payments/**\ninfra/prod/**'));
  const after = run2(['--item', 'p', '--phase', 'fix', '--diff-files', 'infra/prod/main.tf', '--verdict', 'approve']);
  eq('loop-constraints.md 里声明的路径被强制执行', after.code, 2);
  ok('命中时闸门名为 denylist', after.out.includes('"gate": "denylist"'), after.out.slice(0, 160));

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 19. 技能安装

section('19. 技能安装（ZCode 发现路径）');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-'));
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath,
        [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'), ...args], { encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };

  // 装到工作区级（临时目录，不污染用户环境）
  const r1 = run(['--target', tmp]);
  eq('安装退出码 0', r1.code, 0);

  // 技能数量不写死——技能会持续增加。改为与 skills/ 目录实际数量比对
  const packSkills = fs.readdirSync(path.join(PACK_ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PACK_ROOT, 'skills', e.name, 'SKILL.md')))
    .map((e) => e.name);
  ok(`报告安装数量（${packSkills.length}）`, new RegExp(`installed:\\s*${packSkills.length}`).test(r1.out), r1.out.slice(0, 200));

  const dest = path.join(tmp, '.agents', 'skills');
  ok('默认布局为 <repo>/.agents/skills（跨 agent 共享约定）', fs.existsSync(dest));
  ok('技能文件已写入', fs.existsSync(path.join(dest, 'harness-loop', 'SKILL.md')));
  ok('manifest 已写入', fs.existsSync(path.join(dest, '.loop-harness-install.json')));
  ok('默认不写 .zcode（那是 ZCode 专属覆盖路径）',
    !fs.existsSync(path.join(tmp, '.zcode')));

  // 装到 agent 实际会扫描的路径才算有效
  const installed = fs.readdirSync(dest, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dest, e.name, 'SKILL.md')))
    .map((e) => e.name);
  eq('全部技能可被发现', installed.length, packSkills.length);

  // 幂等
  const r2 = run(['--target', tmp]);
  ok('重复安装为 unchanged', new RegExp(`unchanged:\\s*${packSkills.length}`).test(r2.out), r2.out.slice(0, 200));

  // list
  const r3 = run(['--target', tmp, '--list']);
  ok('--list 报告已安装', new RegExp(`Installed by this pack: ${packSkills.length}`).test(r3.out), r3.out.slice(0, 200));

  // ---- --check：宿主跑的是已安装副本，不是源码 ----
  // 实测宿主里的 harness-loop 比源码旧一版（缺 stage: runtime 与第 0 步接线检查），
  // 而所有断言都跑在源仓库内，测不到这件事。
  {
    const c1 = run(['--target', tmp, '--check']);
    eq('刚装完 --check 干净（退出 0）', c1.code, 0);
    ok('--check 报告比对数量', /Checked \d+ installed skill/.test(c1.out), c1.out.slice(0, 160));

    // 制造漂移：改掉已安装副本的一个字节
    const inst = path.join(dest, 'harness-loop', 'SKILL.md');
    fs.appendFileSync(inst, '\n<!-- drift -->\n');
    const c2 = run(['--target', tmp, '--check']);
    eq('漂移时 --check 退出 1', c2.code, 1);
    ok('漂移被点名（含完整路径）', /harness-loop\/SKILL\.md/.test(c2.out), c2.out.slice(0, 200));
    // JSON 形式也要给出可机读的结论
    const c3 = run(['--target', tmp, '--check', '--json']);
    const cj = JSON.parse(c3.out);
    eq('--json 报告 in_sync=false', cj.in_sync, false);
    ok('--json 列出漂移项', Array.isArray(cj.drifted) && cj.drifted.length > 0, JSON.stringify(cj.drifted));
    // 还原：重装后应恢复干净
    run(['--target', tmp, '--force']);
    eq('重装后 --check 恢复干净', run(['--target', tmp, '--check']).code, 0);
  }

  // uninstall
  const r4 = run(['--target', tmp, '--uninstall']);
  eq('卸载退出码 0', r4.code, 0);
  ok('卸载后技能目录消失', !fs.existsSync(path.join(dest, 'harness-loop')));
  ok('卸载后 manifest 消失', !fs.existsSync(path.join(dest, '.loop-harness-install.json')));

  // 无 manifest 时卸载应报错
  const r5 = run(['--target', tmp, '--uninstall']);
  eq('无 manifest 卸载报错退出 1', r5.code, 1);

  // ---- 卸载不得销毁用户自己的技能 ----
  // 曾经安装时 skipped-exists 保护了文件，清单却记整包列表，卸载时照样删掉。
  const tmpUser = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-user-'));
  const mine = path.join(tmpUser, '.agents', 'skills', 'loop-guard', 'SKILL.md');
  fs.mkdirSync(path.dirname(mine), { recursive: true });
  fs.writeFileSync(mine, '# MY OWN loop-guard - do not delete\n');
  run(['--target', tmpUser]);
  const manifestFile = path.join(tmpUser, '.agents', 'skills', '.loop-harness-install.json');
  const listed = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).skills;
  ok('清单不含被跳过的用户技能', !listed.includes('loop-guard'), JSON.stringify(listed.slice(0, 3)));
  const u1 = run(['--target', tmpUser, '--uninstall']);
  eq('卸载用户目录退出码 0', u1.code, 0);
  ok('用户的同名技能未被删除', fs.existsSync(mine));
  ok('包写入的技能被清理', !fs.existsSync(path.join(tmpUser, '.agents', 'skills', 'harness-loop')));
  fs.rmSync(tmpUser, { recursive: true, force: true });

  // ---- 清单里的路径穿越必须被拒绝 ----
  const tmpTrav = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-trav-'));
  fs.mkdirSync(path.join(tmpTrav, 'proj', '.agents', 'skills'), { recursive: true });
  const victim = path.join(tmpTrav, 'victim_dir');
  fs.mkdirSync(victim, { recursive: true });
  fs.writeFileSync(path.join(victim, 'precious.txt'), 'IMPORTANT VICTIM DATA\n');
  fs.writeFileSync(path.join(tmpTrav, 'proj', '.agents', 'skills', '.loop-harness-install.json'),
    JSON.stringify({ skills: ['../../../victim_dir'] }));
  const u2 = run(['--target', path.join(tmpTrav, 'proj'), '--uninstall']);
  eq('路径穿越被拒绝退出 1', u2.code, 1);
  ok('目标树外的目录未被删除', fs.existsSync(victim));
  ok('受害文件仍在', fs.existsSync(path.join(victim, 'precious.txt')));
  fs.rmSync(tmpTrav, { recursive: true, force: true });

  // ---- --target 指向文件 ----
  const tmpFile = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-file-'));
  const notDir = path.join(tmpFile, 'notadir.txt');
  fs.writeFileSync(notDir, 'i am a file\n');
  const t1 = run(['--target', notDir]);
  eq('--target 指向文件退出 1', t1.code, 1);
  ok('--target 指向文件给出可读消息', /must be a directory/.test(t1.out), t1.out.slice(0, 160));
  fs.rmSync(tmpFile, { recursive: true, force: true });

  fs.rmSync(tmp, { recursive: true, force: true });

  // ---- 布局选择：.agents 是默认的跨 agent 共享路径 ----
  // 回归保护：修好之前 `--layout` 不被识别，参数被静默忽略，
  // 技能全部落到 .zcode，退出码仍是 0（静默失败）。
  const tmpAgents = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-agents-'));
  const a1 = run(['--target', tmpAgents, '--layout', 'agents']);
  eq('--layout agents 退出码 0', a1.code, 0);

  const agentsDest = path.join(tmpAgents, '.agents', 'skills');
  ok('--layout agents 写入 <repo>/.agents/skills', fs.existsSync(agentsDest));
  ok('--layout agents 不再写入 <repo>/.zcode',
    !fs.existsSync(path.join(tmpAgents, '.zcode')));
  ok('--layout agents 写入技能文件', fs.existsSync(path.join(agentsDest, 'harness-loop', 'SKILL.md')));
  ok('--layout agents 写入 manifest', fs.existsSync(path.join(agentsDest, '.loop-harness-install.json')));

  const agentsManifestPath = path.join(agentsDest, '.loop-harness-install.json');
  const agentsManifest = fs.existsSync(agentsManifestPath)
    ? JSON.parse(readText(agentsManifestPath)) : {};
  eq('manifest 记录 layout', agentsManifest.layout, 'agents');
  eq('manifest 记录 dotDir', agentsManifest.dotDir, '.agents');

  // 显式 --layout zcode 仍然可用（覆盖同名技能的场景）
  const tmpZ = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-z-'));
  const z1 = run(['--target', tmpZ, '--layout', 'zcode']);
  eq('--layout zcode 退出码 0', z1.code, 0);
  ok('--layout zcode 写入 <repo>/.zcode/skills',
    fs.existsSync(path.join(tmpZ, '.zcode', 'skills', 'harness-loop', 'SKILL.md')));
  ok('--layout zcode 不写 .agents', !fs.existsSync(path.join(tmpZ, '.agents')));
  fs.rmSync(tmpZ, { recursive: true, force: true });

  const a2 = run(['--target', tmpAgents, '--layout', 'agents', '--list']);
  ok('--layout agents --list 能找到已安装技能',
    new RegExp(`Installed by this pack: ${packSkills.length}`).test(a2.out), a2.out.slice(0, 200));

  const a3 = run(['--target', tmpAgents, '--layout', 'agents', '--uninstall']);
  eq('--layout agents 卸载退出码 0', a3.code, 0);
  ok('--layout agents 卸载后技能目录消失', !fs.existsSync(path.join(agentsDest, 'harness-loop')));
  fs.rmSync(tmpAgents, { recursive: true, force: true });

  // ---- both：两边都装 ----
  const tmpBoth = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-both-'));
  const b1 = run(['--target', tmpBoth, '--layout', 'both']);
  eq('--layout both 退出码 0', b1.code, 0);
  ok('--layout both 写入 .zcode', fs.existsSync(path.join(tmpBoth, '.zcode', 'skills', 'harness-loop', 'SKILL.md')));
  ok('--layout both 写入 .agents', fs.existsSync(path.join(tmpBoth, '.agents', 'skills', 'harness-loop', 'SKILL.md')));
  fs.rmSync(tmpBoth, { recursive: true, force: true });

  // ---- 非法 layout 必须报错，不得静默回落 ----
  const tmpBad = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-bad-'));
  const c1 = run(['--target', tmpBad, '--layout', 'nonsense']);
  eq('非法 --layout 退出码 1', c1.code, 1);
  ok('非法 --layout 明确报错', /--layout must be one of/.test(c1.out), c1.out.slice(0, 200));
  ok('非法 --layout 不写入任何目录',
    !fs.existsSync(path.join(tmpBad, '.zcode')) && !fs.existsSync(path.join(tmpBad, '.agents')));
  fs.rmSync(tmpBad, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 20. 三阶段驱动器

section('20. 三阶段驱动器');
{
  const runStage = (target, extra = []) => {
    try {
      return { code: 0, out: execFileSync(process.execPath,
        [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), target, ...extra], { encoding: 'utf8' }) };
    } catch (e) {
      return { code: e.status, out: (e.stdout || '') + (e.stderr || '') };
    }
  };

  // 空目录 → 阶段 0
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-empty-'));
  const r0 = runStage(empty, ['--json']);
  const j0 = JSON.parse(r0.out);
  eq('空目录为阶段 0', j0.current_stage, 0);
  ok('空目录阶段 1 未达成', j0.stages[0].complete === false);
  ok('空目录阶段 1 有失败判据', j0.stages[0].checks.some((c) => !c.ok));
  eq('空目录 --stage 1 --require 退出 2', runStage(empty, ['--stage', '1', '--require']).code, 2);

  // 装配后应达成阶段 1
  fs.writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(empty, ['--upgrade', '--stage', '1']);
  // 模板出厂带的是占位 feature（notes 自称"占位符"），判据 2 会拒绝它。
  // 这里换成真实 feature——这正是判据 2 存在的意义：逼人真的替换。
  writeRealFeatures(path.join(empty, 'feature_list.json'));

  // ---- 运行层脚本必须随装配进入目标仓库 ----
  // 曾经它们只留在技能包仓库里，而所有技能命令与 workflow 都写
  // `node scripts/xxx.mjs` 并隐含 cwd = 项目根。于是新装配的项目里每条命令都是
  // ERR_MODULE_NOT_FOUND，而阶段 3 判据只看 workflow 文件在不在——
  // 判据会给一个跑不起来的事件脊发 PASS。
  {
    const scriptsDir = path.join(empty, 'scripts');
    for (const f of ['event-router.mjs', 'gate-check.mjs', 'ledger-check.mjs', 'loop-audit.mjs',
      'lib/common.mjs']) {
      ok(`消费者项目有 scripts/${f}`, fs.existsSync(path.join(scriptsDir, f)));
    }
    // 源仓库自检套件与装配工具不复制：它们依赖 pack 内的 templates/ 与 skills/，
    // 在消费者里跑不了（harness-stage 缺 templates 会"报告成功但什么都没写"）。
    for (const f of ['test.mjs', 'harness-stage.mjs', 'install-skills.mjs', 'init-loop-harness.mjs']) {
      ok(`消费者项目不含 scripts/${f}`, !fs.existsSync(path.join(scriptsDir, f)));
    }

    // 行为断言：在消费者目录内真的跑一次（cwd 是消费者，不是技能包）
    const runInConsumer = (rel, args) => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          [path.join(scriptsDir, rel), ...args], { encoding: 'utf8', cwd: empty }) };
      } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
    };
    eq('消费者内 event-router 可运行', runInConsumer('event-router.mjs', ['--list']).code, 0);
    // 阶段 1 项目没有 loop-ledger.json（那是阶段 2 的产物），所以这里现造一个：
    // 要验的是"脚本能在消费者里跑"，不是"阶段 1 有账本"。
    const consumerLedger = path.join(empty, 'ledger-probe.json');
    fs.writeFileSync(consumerLedger, JSON.stringify({ goal: 'probe', pattern: 'x', level: 'L1', attempts: [] }));
    eq('消费者内 ledger-check 可运行',
      runInConsumer('ledger-check.mjs', ['--ledger', consumerLedger]).code, 0);
    // 缺账本时必须报错退出 1，而不是静默通过——这与库层的 no-ledger fail-closed 一致
    eq('消费者内缺账本时 ledger-check 报错',
      runInConsumer('ledger-check.mjs', ['--ledger', path.join(empty, 'nope.json')]).code, 1);
    eq('消费者内 gate-check 可运行',
      runInConsumer('gate-check.mjs', ['--item', 'x', '--phase', 'fix',
        '--diff-files', 'a.ts', '--verdict', 'approve']).code, 0);

    // harness-loop 第 0 步的接线检查命令（SKILL.md 原文形态）必须在消费者内可运行
    const helper = (() => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          ['-e', 'import("./scripts/lib/common.mjs").then(m=>{const r=m.hasEventWiring(process.cwd());console.log(r.wired?"wired":"NOT wired");})'],
          { encoding: 'utf8', cwd: empty }) };
      } catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
    })();
    eq('消费者内第 0 步 helper 可运行', helper.code, 0);
    ok('helper 报告未接线（阶段 1 项目没有 workflow）', helper.out.includes('NOT wired'), helper.out);
  }
  const r1 = runStage(empty, ['--json']);
  const j1 = JSON.parse(r1.out);
  eq('装配后达成阶段 1', j1.current_stage, 1);
  ok('阶段 1 complete', j1.stages[0].complete === true);
  eq('--stage 1 --require 退出 0', runStage(empty, ['--stage', '1', '--require']).code, 0);
  eq('--stage 2 --require 仍退出 2', runStage(empty, ['--stage', '2', '--require']).code, 2);

  // 阶段 1 的关键文件都生成了。注意：loop 机制文档（LOOP.md / loop-budget.md /
  // loop-run-log.md / session-handoff.md / loop-ledger.json）属于阶段 2——
  // 曾经它们在阶段 1 就被创建，于是阶段 1 项目看起来已经有循环机制。
  for (const f of ['AGENTS.md', 'feature_list.json', 'STATE.md', 'progress.md', 'init.sh', 'loop-constraints.md', 'LESSONS.md']) {
    ok(`阶段 1 生成 ${f}`, fs.existsSync(path.join(empty, f)));
  }
  for (const f of ['LOOP.md', 'loop-budget.md', 'loop-run-log.md', 'session-handoff.md', 'loop-ledger.json']) {
    ok(`阶段 1 不生成 ${f}（loop 机制属阶段 2）`, !fs.existsSync(path.join(empty, f)));
  }

  // 升级到阶段 2 应补上 verifier
  runStage(empty, ['--upgrade', '--stage', '2']);
  ok('阶段 2 补上 loop-verifier', fs.existsSync(path.join(empty, '.agents', 'skills', 'loop-verifier', 'SKILL.md')));
  ok('阶段 2 补上 minimal-fix', fs.existsSync(path.join(empty, '.agents', 'skills', 'minimal-fix', 'SKILL.md')));
  ok('阶段 2 补上 loop-guard', fs.existsSync(path.join(empty, '.agents', 'skills', 'loop-guard', 'SKILL.md')));

  // ---- 跳级保护 ----
  // AGENTS.md 与 docs/11 都写"不要跳级"，但 --upgrade 曾经允许空仓库直冲 --stage 3
  // 并写入事件接线——结果是"阶段 1 判据 7/8、阶段 2 判据 4/9、阶段 3 判据 4/8"的项目：
  // 事件脊接上了，但 verifier、熔断器、本地化拒绝列表全都不在。
  {
    const jump = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-skip-'));
    fs.writeFileSync(path.join(jump, 'package.json'), JSON.stringify({ name: 's', scripts: { test: 'echo ok' } }));
    const r = runStage(jump, ['--upgrade', '--stage', '3']);
    eq('空仓库 --upgrade --stage 3 被拒', r.code, 2);
    ok('拒绝时未写入事件接线', !fs.existsSync(path.join(jump, '.github', 'workflows')));
    ok('拒绝时给出可执行的下一步', /--upgrade --stage 1/.test(r.out), r.out.slice(0, 200));
    // --force 是显式覆盖，仍然允许
    eq('--force 可显式覆盖', runStage(jump, ['--upgrade', '--stage', '3', '--force']).code, 0);
    fs.rmSync(jump, { recursive: true, force: true });
  }

  // 升级到阶段 3 应补上事件接线。
  // 用 --force：阶段 2 的两项判据（拒绝列表已本地化、账本有真实记录）需要人工动作，
  // 测试无法替用户完成。这里验的是"阶段 3 该产出什么"，不是"阶段 2 是否达成"——
  // 后者由上面那组判据断言覆盖。跳级保护本身另有一组断言（见"跳级保护"）。
  runStage(empty, ['--upgrade', '--stage', '3', '--force']);
  const wfDir = path.join(empty, '.github', 'workflows');
  ok('阶段 3 补上事件接线目录', fs.existsSync(wfDir));
  ok('阶段 3 补上 lesson-harvest workflow', fs.existsSync(path.join(wfDir, 'lesson-harvest.yml')));
  ok('阶段 3 补上 signal-gatekeeper', fs.existsSync(path.join(empty, '.agents', 'skills', 'signal-gatekeeper', 'SKILL.md')));

  // ---- 空壳技能不得满足阶段 2 ----
  // 曾经 verifier / breaker 只判文件存在，于是全文 lorem ipsum + 空 attempts
  // 也能让 `--stage 2 --require` 退出 0。
  const shell = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-shell-'));
  runStage(shell, ['--upgrade', '--stage', '1']);
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'), '--target', shell], { encoding: 'utf8' });
  for (const s of ['loop-verifier', 'loop-guard']) {
    fs.writeFileSync(path.join(shell, '.agents', 'skills', s, 'SKILL.md'), 'lorem ipsum\n');
  }
  fs.writeFileSync(path.join(shell, 'loop-ledger.json'), JSON.stringify({ attempts: [] }));
  const sh = runStage(shell, ['--json']);
  const shj = JSON.parse(sh.out);
  const stage2 = shj.stages[1];
  ok('空壳 verifier 不满足阶段 2', stage2.checks.some((c) => !c.ok && /verifier/.test(c.label)));
  ok('空壳 breaker 不满足阶段 2', stage2.checks.some((c) => !c.ok && /熔断器/.test(c.label)));
  ok('熔断器判据的证据提到账本无记录', stage2.checks.some((c) => !c.ok && /attempts|账本|熔断/.test(c.evidence || '')));
  ok('阶段 2 未达成', stage2.complete === false);
  eq('空壳技能的仓库 --stage 2 --require 退出 2', runStage(shell, ['--stage', '2', '--require']).code, 2);
  fs.rmSync(shell, { recursive: true, force: true });

  // 只把账本清空（技能是真实内容）→ 熔断器判据仍必须不通过。
  // 上面那个用例里技能也是空壳，判据被两处同时拦下，单测其中一处没有意义。
  const emptyLedger = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-ledger-'));
  runStage(emptyLedger, ['--upgrade', '--stage', '1']);
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'), '--target', emptyLedger], { encoding: 'utf8' });
  fs.writeFileSync(path.join(emptyLedger, 'loop-ledger.json'), JSON.stringify({ attempts: [] }));
  const el = JSON.parse(runStage(emptyLedger, ['--json']).out);
  ok('attempts 为空的账本不满足熔断器判据',
    el.stages[1].checks.some((c) => !c.ok && /熔断器/.test(c.label)));
  fs.rmSync(emptyLedger, { recursive: true, force: true });

  // ---- --upgrade 生成的 init.sh 必须匹配检测到的项目栈 ----
  // 曾经硬编码 npm install/test/build，给纯 Python 仓库发了一条跑不起来的启动路径，
  // 阶段 1 判据还给了 PASS。
  const py = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-py-'));
  fs.writeFileSync(path.join(py, 'pyproject.toml'), '[project]\nname = "x"\n');
  runStage(py, ['--upgrade', '--stage', '1']);
  const pyInit = fs.readFileSync(path.join(py, 'init.sh'), 'utf8');
  ok('Python 仓库的 init.sh 不含 npm 命令', !/\bnpm\b/.test(pyInit), pyInit.slice(0, 200));
  ok('Python 仓库的 init.sh 使用 pytest', /pytest/.test(pyInit), pyInit.slice(0, 200));
  fs.rmSync(py, { recursive: true, force: true });

  // ---- --commands 覆盖自动检测 ----
  // 自动检测在混合栈或 CI 里会猜错，猜错的代价是判据 5 发假 PASS：
  // 启动脚本生成了但跑不通，而判据当时只读文本。
  // 所以这条覆盖必须真的改变生成的脚本，而不只是被接受。
  const cm = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-cmds-'));
  fs.writeFileSync(path.join(cm, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(cm, ['--upgrade', '--stage', '1', '--commands', 'echo custom-verify && true']);
  const cmInit = fs.readFileSync(path.join(cm, 'init.sh'), 'utf8');
  ok('--commands 写入启动脚本', /custom-verify/.test(cmInit), cmInit.slice(0, 200));
  ok('--commands 覆盖掉自动检测的 npm', !/\bnpm\b/.test(cmInit), cmInit.slice(0, 200));
  // 判据 5 真的执行它 → 自定义命令可跑通时阶段 1 达成
  writeRealFeatures(path.join(cm, 'feature_list.json'));
  const cmj = JSON.parse(runStage(cm, ['--json']).out);
  ok('--commands 覆盖后启动脚本仍能跑通',
    cmj.stages[0].checks.find((x) => /能跑通/.test(x.label))?.ok === true);

  // 非法输入必须被拒，而不是静默回落
  const badPm = runStage(cm, ['--upgrade', '--stage', '1', '--package-manager', 'cargo']);
  eq('非法 --package-manager 退出 1', badPm.code, 1);
  ok('非法 --package-manager 给出可读错误', /package-manager must be/.test(badPm.out),
    badPm.out.slice(0, 200));
  const badCmds = runStage(cm, ['--upgrade', '--stage', '1', '--commands', ' , , ']);
  eq('空 --commands 退出 1', badCmds.code, 1);
  fs.rmSync(cm, { recursive: true, force: true });

  // 三阶段都定义且各有判据
  ok('三个阶段都有判据', j1.stages.length === 3 && j1.stages.every((s) => s.checks.length > 0));
  ok('每个阶段都有依据', j1.stages.every((s) => s.goal && s.level));

  // 阶段技能必须在各自的升级列表里（否则 workspace 安装拿不到）
  const stageSrc = fs.readFileSync(path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), 'utf8');
  ok('阶段1 升级列表含 harness-init', /STAGE1_SKILLS[\s\S]{0,240}harness-init/.test(stageSrc));
  ok('阶段2 升级列表含 harness-loop-init', /STAGE2_SKILLS[\s\S]{0,240}harness-loop-init/.test(stageSrc));
  ok('阶段3 升级列表含 harness-consolidate', /STAGE3_SKILLS[\s\S]{0,240}harness-consolidate/.test(stageSrc));

  // ---- frontmatter 的 stage: 必须与升级列表一致 ----
  // stage: 字段是"这个技能属于哪个建设阶段"的唯一声明。如果它和
  // STAGE*_SKILLS 各说各的，那它就是装饰品——而装饰性的配置比没有更糟，
  // 因为人会以为边界存在。所以这里断言两者互相吻合，并且每个技能都有声明。
  {
    const readStage = (skill) => {
      const f = path.join(SKILLS_DIR, skill, 'SKILL.md');
      if (!fs.existsSync(f)) return null;
      const fm = fs.readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const m = fm && fm[1].match(/^stage:\s*(\S+)/m);
      return m ? m[1] : null;
    };
    const listFrom = (constName) => {
      const m = stageSrc.match(new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\];`));
      if (!m) return [];
      return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    };
    const s1 = listFrom('STAGE1_SKILLS');
    const s2 = listFrom('STAGE2_SKILLS');
    const s3 = listFrom('STAGE3_SKILLS');

    ok('阶段1 升级列表非空', s1.length > 0);
    ok('阶段2 升级列表非空', s2.length > 0);
    ok('阶段3 升级列表非空', s3.length > 0);

    for (const [label, list, want] of [['1', s1, '1'], ['2', s2, '2'], ['3', s3, '3']]) {
      for (const s of list) {
        eq(`${s} 的 frontmatter stage 与阶段${label}升级列表一致`, readStage(s), want);
      }
    }
    // harness-loop 是运行时：任何阶段都装，但不属于任何建设阶段
    eq('harness-loop 标为 runtime', readStage('harness-loop'), 'runtime');
    ok('运行时技能不在任何建设阶段的升级列表里',
      ![...s1, ...s2, ...s3].includes('harness-loop'));
    // 每个技能都必须声明，且声明合法
    for (const d of fs.readdirSync(SKILLS_DIR)) {
      if (d.startsWith('.')) continue;
      if (!fs.existsSync(path.join(SKILLS_DIR, d, 'SKILL.md'))) continue;
      const st = readStage(d);
      ok(`${d} 声明了 stage`,
        st !== null && ['1', '2', '3', 'runtime'].includes(st), `got ${st}`);
    }
  }

  // 旧技能名不得残留（目录、frontmatter、文档引用）。
  // 拼接构造，避免测试文件自身命中这个检查。
  // 阶段 2 的旧名与已删技能的名字也在这张表里：改名前它只查 stage-* 前缀那
  // 三个 slug，真实旧名根本不在扫描范围内——于是改名可以漏掉 14 处引用
  // 而测试全绿。
  const staleNames = [
    ...['init', 'strengthen', 'consolidate'].map((s) => 'stage' + '-' + s),
    // 拆分构造，避免本文件命中自身的检查
    'harness' + '-strengthen',
    'harness' + '-bootstrap',
  ];
  const scanFiles = [];
  // REVIEW-*.md 是带日期的审查记录，记录的是"当时发现了什么"。改写它们等于伪造历史
  // ——审查报告的价值就在于它没被后来的改动擦掉。所以它们不进这个扫描。
  const isHistorical = (name) => /^REVIEW-\d{4}-\d{2}-\d{2}/.test(name);
  (function walk(d, depth) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', '.mimosa', 'node_modules'].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (/\.(md|mjs|yaml|yml|json)$/.test(e.name) && !isHistorical(e.name)) scanFiles.push(f);
    }
  })(PACK_ROOT, 0);
  const stale = [];
  for (const f of scanFiles) {
    const text = fs.readFileSync(f, 'utf8');
    for (const n of staleNames) {
      if (text.includes(n)) stale.push(`${path.relative(PACK_ROOT, f)} → ${n}`);
    }
  }
  ok('无旧技能名残留', stale.length === 0, stale.slice(0, 5).join('; '));

  // registry 的阶段定义含 skill 字段
  const registrySrc = fs.readFileSync(path.join(PACK_ROOT, 'patterns', 'registry.yaml'), 'utf8');
  ok('registry 阶段定义含 skill 字段',
    /skill:\s*harness-init/.test(registrySrc)
    && /skill:\s*harness-loop-init/.test(registrySrc)
    && /skill:\s*harness-consolidate/.test(registrySrc));

  fs.rmSync(empty, { recursive: true, force: true });

  // ---- 假阳性防护：占位 feature 不得让判据 2 通过 ----
  // 判据 2 若退回「features 是非空数组」，模板原样就能过——而模板出厂带的就是占位。
  // 这条断言必须存在：曾经判据 2 只查非空数组，替换占位 feature 这件真正的活
  // 被判据完全放过。
  const pf = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-feat-'));
  fs.writeFileSync(path.join(pf, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(pf, ['--upgrade', '--stage', '1']);
  const rpf = JSON.parse(runStage(pf, ['--json']).out);
  const featCheck = rpf.stages[0].checks.find((c) => /完成标准/.test(c.label));
  ok('模板占位 feature 不满足判据 2', featCheck && featCheck.ok === false,
    featCheck ? '判据 2 放过了模板占位 feature' : '找不到判据 2');
  ok('占位 feature 时阶段 1 不达成', rpf.stages[0].complete === false);
  ok('判据 2 的证据点明占位', featCheck && /占位/.test(featCheck.evidence || ''),
    featCheck ? featCheck.evidence : '');
  // 换成真实 feature 后必须通过（证明判据不是无条件 FAIL）
  writeRealFeatures(path.join(pf, 'feature_list.json'));
  const rpf2 = JSON.parse(runStage(pf, ['--json']).out);
  ok('真实 feature 满足判据 2',
    rpf2.stages[0].checks.find((c) => /完成标准/.test(c.label))?.ok === true);
  fs.rmSync(pf, { recursive: true, force: true });

  // ---- 假阳性防护：格式对但跑不通的启动脚本不得通过 ----
  // 判据 5 若退回「只读文本」，一个写对了 set -e 却指向不存在命令的启动脚本
  // 照样拿 PASS——而它正是新会话的启动路径，判据 8 的原意是拦住这种情况。
  const nr = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-nonrun-'));
  fs.writeFileSync(path.join(nr, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(nr, ['--upgrade', '--stage', '1']);
  // 格式合法（set -e 在），但命令不存在 → 退出码非 0
  fs.writeFileSync(path.join(nr, 'init.sh'),
    '#!/usr/bin/env bash\nset -e\nthis-command-definitely-does-not-exist --x\n', 'utf8');
  const rnr = JSON.parse(runStage(nr, ['--json']).out);
  const runCheck = rnr.stages[0].checks.find((c) => /能跑通/.test(c.label));
  ok('跑不通的启动脚本不满足判据 5', runCheck && runCheck.ok === false,
    runCheck ? '判据只看文本，放过了跑不通的脚本' : '找不到判据 5');
  ok('跑不通的脚本时阶段 1 不达成', rnr.stages[0].complete === false);
  ok('判据 5 的证据含退出码', runCheck && /退出码/.test(runCheck.evidence || ''),
    runCheck ? runCheck.evidence : '');
  fs.rmSync(nr, { recursive: true, force: true });

  // 假阳性防护：占位符 init.sh 不得让阶段 1 通过
  const ph = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-ph-'));
  fs.writeFileSync(path.join(ph, 'package.json'), JSON.stringify({ name: 'x' }));
  runStage(ph, ['--upgrade', '--stage', '1']);
  // 把 init.sh 换回占位符版本
  fs.writeFileSync(path.join(ph, 'init.sh'),
    '#!/usr/bin/env bash\nset -e\nnpm install\nnpm test\n# No package manifest detected\n', 'utf8');
  const rph = JSON.parse(runStage(ph, ['--json']).out);
  ok('占位符 init.sh 使阶段 1 不达成', rph.stages[0].complete === false, `stage=${rph.current_stage}`);
  ok('占位符 init.sh 被明确标出',
    rph.stages[0].checks.some((c) => /能跑通/.test(c.label) && !c.ok));
  fs.rmSync(ph, { recursive: true, force: true });

  // ---- 事件接线判据：阶段 3 与 harness-loop 第 0 步读同一份逻辑 ----
  // 曾经这段逻辑只存在于 harness-stage.mjs 里，harness-loop 的技能文档让 agent
  // "自己判断有没有接线"——两份判断会漂移。现在提在 common.hasEventWiring，
  // 下面这些断言锁住它，并锁住阶段 3 判据确实读它。
  {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wire-0-'));
    const r0 = hasEventWiring(empty);
    eq('空仓库未接线', r0.wired, false);
    ok('未接线时给出原因', typeof r0.detail === 'string' && r0.detail.length > 0, r0.detail);
    fs.rmSync(empty, { recursive: true, force: true });

    // 阶段 3 判据读的是同一份答案
    const w0 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wire-1-'));
    fs.writeFileSync(path.join(w0, 'package.json'), JSON.stringify({ name: 'x' }));
    runStage(w0, ['--upgrade', '--stage', '1']);
    const wj = JSON.parse(runStage(w0, ['--json']).out);
    const wiringCheck = wj.stages[2].checks.find((c) => /事件脊/.test(c.label));
    eq('阶段 1 项目：判据说未接线', wiringCheck?.ok, false);
    eq('阶段 1 项目：helper 也说未接线', hasEventWiring(w0).wired, false);
    ok('判据的证据用 helper 的 detail', wiringCheck?.evidence === hasEventWiring(w0).detail,
      `判据=${wiringCheck?.evidence} / helper=${hasEventWiring(w0).detail}`);

    // 存在 workflow 目录但没有 loop 类文件 → 仍未接线，且理由要说清楚
    fs.mkdirSync(path.join(w0, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(w0, '.github', 'workflows', 'ci.yml'), 'name: ci\n');
    const w1 = hasEventWiring(w0);
    eq('只有非 loop workflow 时仍未接线', w1.wired, false);
    ok('区分"没目录"与"目录里没有 loop 文件"', /没有调用运行层脚本/.test(w1.detail), w1.detail);

    // ---- 假阳性防护：只有第三方 action 的 workflow 不算接线 ----
    // 曾经判定的是文件名（/loop|triage|release-draft|.../），于是官方
    // release-drafter action 或任何叫 triage.yml 的文件都算接线——
    // harness-loop 会据此对着空队列跑完 8 步，把"没做事"记成一次正常运行。
    {
      const fp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wire-fp-'));
      fs.mkdirSync(path.join(fp, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(fp, '.github', 'workflows', 'release-drafter.yml'),
        'name: Release Drafter\non:\n  push:\n    branches: [main]\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: release-drafter/release-drafter@v6\n');
      eq('只有第三方 action 时未接线', hasEventWiring(fp).wired, false);

      fs.writeFileSync(path.join(fp, '.github', 'workflows', 'triage.yml'), 'name: triage\non:\n  issues:\n');
      eq('名字带 triage 但无脚本调用时未接线', hasEventWiring(fp).wired, false);

      fs.writeFileSync(path.join(fp, '.github', 'workflows', 'loop-intake.yml'),
        'name: loop\non:\n  issues:\n    types: [opened]\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/event-router.mjs --event issues.opened --item x\n');
      eq('真实调用运行层脚本时算接线', hasEventWiring(fp).wired, true);
      fs.rmSync(fp, { recursive: true, force: true });
    }

    // 放一个真实调用运行层脚本的 workflow → 接线
    fs.writeFileSync(path.join(w0, '.github', 'workflows', 'loop-intake.yml'),
      'name: loop\non:\n  issues:\n    types: [opened]\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/event-router.mjs --event issues.opened --item x\n');
    const w2 = hasEventWiring(w0);
    eq('有 loop workflow 时已接线', w2.wired, true);
    eq('接线方式标为 workflow', w2.via, 'workflow');
    const wj2 = JSON.parse(runStage(w0, ['--json']).out);
    eq('阶段 3 判据同步转为 PASS',
      wj2.stages[2].checks.find((c) => /事件脊/.test(c.label))?.ok, true);

    // 非 GitHub 平台：LOOP.md 声明调度也算
    const w3 = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wire-2-'));
    fs.writeFileSync(path.join(w3, 'LOOP.md'), '## 调度\n\n- schedule: daily\n- 事件驱动\n');
    eq('LOOP.md 声明调度时算接线', hasEventWiring(w3).wired, true);
    eq('声明式接线的 via', hasEventWiring(w3).via, 'declared');
    // 只写 schedule 不写事件驱动 → 不算
    fs.writeFileSync(path.join(w3, 'LOOP.md'), '## 调度\n\n- schedule: daily\n');
    eq('只有 schedule 没有事件驱动时不算接线', hasEventWiring(w3).wired, false);
    fs.rmSync(w3, { recursive: true, force: true });
    fs.rmSync(w0, { recursive: true, force: true });

    // harness-loop 的技能文档必须真的提到这一步——它是技能，不是脚本，
    // 没有代码入口，只能断言文档写了它。
    const loopSkill = fs.readFileSync(path.join(SKILLS_DIR, 'harness-loop', 'SKILL.md'), 'utf8');
    ok('harness-loop 第 0 步包含事件接线检查', /事件接线/.test(loopSkill));
    ok('harness-loop 声明 no-wiring 这个 outcome', /no-wiring/.test(loopSkill));
    ok('harness-loop 指向共用的 helper', /hasEventWiring/.test(loopSkill));

    // ---- 手动调用边界必须在技能与文档之间一致 ----
    // 曾经技能写 "Do NOT invoke by hand"，而 docs/10 两处推荐手动调用 `/harness-loop`，
    // 且它是 17 个技能里唯一没有 user_invocable 的。文档与技能各说各话。
    {
      const doc10 = fs.readFileSync(path.join(PACK_ROOT, 'docs', '10-how-to-use.md'), 'utf8');
      const forbids = /Do NOT invoke by hand/.test(loopSkill);
      const recommends = /手动调用[^\n]*harness-loop/.test(doc10)
        || /"我现在该做什么" \| `harness-loop`/.test(doc10);
      ok('手动调用边界在技能与文档间一致', forbids !== recommends,
        `技能禁止=${forbids} / 文档推荐=${recommends}`);
      // 允许手动调用时必须真的可被调用，且 description 说明要带什么参数
      if (!forbids) {
        ok('harness-loop 可被手动调用（user_invocable）', /user_invocable:\s*true/.test(loopSkill));
        ok('description 说明手动调用需要 --event', /--event/.test(loopSkill));
      }
    }
  }

  // 假阳性防护：Promoted 表只有占位符时不算转正
  const pr = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-promo-'));
  fs.writeFileSync(path.join(pr, 'package.json'), JSON.stringify({ name: 'x' }));
  runStage(pr, ['--upgrade', '--stage', '1']);
  const rpr = JSON.parse(runStage(pr, ['--json']).out);
  const promotedCheck = rpr.stages[2].checks.find((c) => /转正/.test(c.label));
  ok('空 Promoted 表不算已转正', promotedCheck && promotedCheck.ok === false);

  // 写入真实转正记录后应识别
  const lessonsPath = path.join(pr, 'LESSONS.md');
  let lessons = fs.readFileSync(lessonsPath, 'utf8');
  lessons = lessons.replace(
    '| 规则 | 转正日期 | 曾出现次数 | 证据 | 现在的位置 |\n|---|---|---|---|---|',
    '| 规则 | 转正日期 | 曾出现次数 | 证据 | 现在的位置 |\n|---|---|---|---|---|\n| 合并前绑定审过的 sha | 2026-10-10 | 3 | #834 | loop-constraints.md |'
  );
  fs.writeFileSync(lessonsPath, lessons, 'utf8');
  const rpr2 = JSON.parse(runStage(pr, ['--json']).out);
  const promotedCheck2 = rpr2.stages[2].checks.find((c) => /转正/.test(c.label));
  ok('真实转正记录被识别', promotedCheck2 && promotedCheck2.ok === true);
  fs.rmSync(pr, { recursive: true, force: true });

  // ---- 核心回归：阶段 1 的产出不得满足阶段 2 ----
  // 这是用户实际遇到的 bug：只跑 /harness-init，阶段 2 却报 COMPLETE。
  // 根因是阶段 2 判据在 grep 声明文本，而阶段 1 的模板本身就带那些文字。
  const gate = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-gate-'));
  fs.writeFileSync(path.join(gate, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(gate, ['--upgrade', '--stage', '1']);
  writeRealFeatures(path.join(gate, 'feature_list.json'));

  const g1 = JSON.parse(runStage(gate, ['--json']).out);
  eq('只做阶段1 后，阶段1 达成', g1.stages[0].complete, true);
  ok('只做阶段1 后，阶段2 不达成', g1.stages[1].complete === false,
    `stage2 complete=${g1.stages[1].complete} —— 阶段闸门没有拦住`);
  eq('只做阶段1 后，current_stage 仍为 1', g1.current_stage, 1);
  eq('阶段2 --require 退出 2', runStage(gate, ['--stage', '2', '--require']).code, 2);

  // 阶段 1 的模板不能自动满足阶段 2 的**核心**判据。
  // 少数几项确实是阶段 1 的合理前提（装技能、真实 init.sh、评分），
  // 但「机制就位/被执行」的那些必须仍为红。
  const s2mech = g1.stages[1].checks.filter((c) => !c.human);
  const mustStillFail = [
    /verifier/,          // 独立检查者：阶段 2 的核心
    /熔断器/,            // 熔断器就位
    /拒绝列表/,          // 拒绝列表本地化
  ];
  for (const re of mustStillFail) {
    const chk = s2mech.find((c) => re.test(c.label));
    ok(`阶段1 后「${chk ? chk.label : re}」仍为红`, chk && chk.ok === false);
  }

  // 阶段 2 的人工判据（机制被执行过）必须存在且不可机械通过
  const humanChecks = g1.stages[1].checks.filter((c) => c.human);
  ok('阶段2 含人工判据（回退测试/NOT RUN/triage 准确率）', humanChecks.length >= 3,
    `当前 ${humanChecks.length} 项`);
  ok('回退测试是人工判据（grep 无法冒充行为）',
    humanChecks.some((c) => /回退测试/.test(c.label)));
  ok('NOT RUN 是人工判据',
    humanChecks.some((c) => /NOT RUN/.test(c.label)));

  // 机械判据中不得有「仅 grep 声明文本」的项
  ok('阶段2 机械判据不含纯声明项（回退测试/NOT RUN 已转为人工确认）',
    !s2mech.some((c) => /已声明/.test(c.label)));

  // 技能必须装在可发现路径，否则阶段 2 的 verifier 判据不得通过
  const verifierCheck = s2mech.find((c) => /verifier/.test(c.label));
  ok('阶段1 后 verifier 判据不通过（技能未装到可发现路径）',
    verifierCheck && verifierCheck.ok === false);
  ok('阶段1 后技能确实没落在裸 skills/',
    !fs.existsSync(path.join(gate, 'skills')));

  // 拒绝列表未本地化时不得通过
  const dlCheck = s2mech.find((c) => /拒绝列表/.test(c.label));
  ok('模板拒绝列表被判为未本地化', dlCheck && dlCheck.ok === false);

  // 本地化拒绝列表后该项才通过
  const cPath = path.join(gate, 'loop-constraints.md');
  let cText = fs.readFileSync(cPath, 'utf8');
  cText = cText.replace(
    '```\n.env\n',
    '```\ninternal/admin/**\ndb/prod-dumps/**\n.env\n'
  );
  fs.writeFileSync(cPath, cText, 'utf8');
  const g2 = JSON.parse(runStage(gate, ['--json']).out);
  const dlCheck2 = g2.stages[1].checks.filter((c) => !c.human).find((c) => /拒绝列表/.test(c.label));
  ok('本地化拒绝列表后被识别', dlCheck2 && dlCheck2.ok === true);

  fs.rmSync(gate, { recursive: true, force: true });

  // ---- 核心回归：模板里的注释示例不得算作真实条目 ----
  const tpl = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-stage-tpl-'));
  fs.writeFileSync(path.join(tpl, 'package.json'), JSON.stringify({ name: 'x' }));
  // 用 --force：阶段 2 的判据需要人工动作（本地化拒绝列表、账本有记录），
  // 测试要验的是"阶段 3 产出什么"，跳级保护本身另有断言覆盖。
  runStage(tpl, ['--upgrade', '--stage', '3', '--force']);
  const tplJson = JSON.parse(runStage(tpl, ['--json']).out);
  const lessonCheck = tplJson.stages[2].checks.filter((c) => !c.human)
    .find((c) => /LESSONS/.test(c.label));
  ok('模板注释里的示例不算真实教训条目', lessonCheck && lessonCheck.ok === false,
    'LESSONS.md 模板自带 <!-- 示例：Seen 1× --> 被误判为真实条目');
  fs.rmSync(tpl, { recursive: true, force: true });

  // ---- 自引用防护：判据 5 不得重入正在运行的 init.sh ----
  // 源仓库的 init.sh 第 72 行是 `harness-stage.mjs .`，而判据 5 会执行被审计
  // 仓库的 init.sh——目标是源仓库时二者互为因果，无限递归。实测：9 层、69 次
  // 120s 超时、上万次 spawn，每次超时都留孤儿。三条断言分别锁住：
  //   1. 行为：源仓库自审必须秒回，且判据 5 是 NOT RUN（不是假 PASS 也不是假 FAIL）
  //   2. 判据 1（环境变量标记）单独生效——消费方手写递归 init.sh 的入口
  //   3. 判据 2（root == PACK_ROOT）单独生效
  {
    // 用 runWithTreeKill 而不是裸 execFileSync：万一自引用防护失效，这一条必须
    // **快速变红**，而不是把整个套件拖进 15 分钟的递归里。超时即判失败，
    // 同时整棵树被杀——测试自己也不留孤儿。
    const t0 = Date.now();
    const selfRun = runWithTreeKill(process.execPath,
      [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), PACK_ROOT, '--json'],
      { timeoutMs: 25000 });
    const elapsed = Date.now() - t0;
    ok('源仓库自审在 25s 内返回（不重入 init.sh）', selfRun.ok,
      selfRun.ok ? `${elapsed}ms`
        : `未在 25s 内返回（${elapsed}ms）——判据 5 很可能又递归进 init.sh 了。`
          + `stderr: ${(selfRun.stderr || '').slice(0, 160)}`);
    if (!selfRun.ok) {
      // 后续断言依赖这份 JSON；拿不到就显式记 FAIL，不要静默跳过
      ok('自引用时判据 5 记为 NOT RUN', false, '上一条已失败：拿不到阶段报告');
      ok('自引用时判据 5 不是 PASS（没跑不能算通过）', false, '上一条已失败：拿不到阶段报告');
      ok('自引用时证据说明原因', false, '上一条已失败：拿不到阶段报告');
    } else {
      const self = JSON.parse(selfRun.stdout);
      const c5 = self.stages[0].checks.find((c) => /能跑通/.test(c.label));
      ok('自引用时判据 5 记为 NOT RUN', c5 && c5.notRun === true,
        c5 ? JSON.stringify(c5) : '找不到判据 5');
      ok('自引用时判据 5 不是 PASS（没跑不能算通过）', c5 && c5.ok === false);
      ok('自引用时证据说明原因', c5 && /自引用/.test(c5.evidence || ''), c5 && c5.evidence);
    }

    // 判据 1：正在运行的 init.sh 会把自身路径传下去。模拟"消费方手写递归脚本"：
    // 目标不是 PACK_ROOT，但 LOOP_HARNESS_ACTIVE_INIT 指向它的 init.sh。
    const recur = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-selfref-env-'));
    fs.writeFileSync(path.join(recur, 'package.json'), JSON.stringify({ name: 'x' }));
    runStage(recur, ['--upgrade', '--stage', '1']);
    const envProbe = execFileSync(process.execPath, [
      '-e', `process.env.LOOP_HARNESS_ACTIVE_INIT=${JSON.stringify(path.join(recur, 'init.sh'))};`
        + `import(${JSON.stringify(pathToFileURL(path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs')).href)})`
        + `.then(m => { const r = m.detectSelfReference(${JSON.stringify(recur)});`
        + `process.stdout.write(JSON.stringify(r)); });`,
    ], { encoding: 'utf8' });
    const envRes = JSON.parse(envProbe);
    ok('判据 1：环境变量标记命中时判为自引用', envRes.self === true, envProbe);
    ok('判据 1 的证据点明是标记', /LOOP_HARNESS_ACTIVE_INIT/.test(envRes.reason || ''), envRes.reason);

    // 反向：标记指向**别的**仓库时不得误报（否则任何子进程都会让它 NOT RUN）
    const other = execFileSync(process.execPath, [
      '-e', `process.env.LOOP_HARNESS_ACTIVE_INIT=${JSON.stringify(path.join(PACK_ROOT, 'init.sh'))};`
        + `import(${JSON.stringify(pathToFileURL(path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs')).href)})`
        + `.then(m => { const r = m.detectSelfReference(${JSON.stringify(recur)});`
        + `process.stdout.write(JSON.stringify(r)); });`,
    ], { encoding: 'utf8' });
    ok('判据 1 不误报别的仓库', JSON.parse(other).self === false, other);

    // 判据 2：目标是 PACK_ROOT 即自引用，不依赖任何环境变量
    const p2 = execFileSync(process.execPath, [
      '-e', `delete process.env.LOOP_HARNESS_ACTIVE_INIT;`
        + `import(${JSON.stringify(pathToFileURL(path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs')).href)})`
        + `.then(m => { const r = m.detectSelfReference(${JSON.stringify(PACK_ROOT)});`
        + `process.stdout.write(JSON.stringify(r)); });`,
    ], { encoding: 'utf8' });
    ok('判据 2：目标为 pack 根时判为自引用', JSON.parse(p2).self === true, p2);

    // 消费方仓库的正常路径不受影响：判据 5 仍然真的执行 init.sh 并给 PASS
    const normal = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-selfref-ok-'));
    // 必须有 test 脚本，否则生成的 init.sh 含 "No test script found" 占位符，
    // 判据 5 会因占位符（而非自引用防护）失败——那样测的就不是这条路径了。
    fs.writeFileSync(path.join(normal, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    runStage(normal, ['--upgrade', '--stage', '1']);
    const nc = JSON.parse(runStage(normal, ['--json']).out).stages[0].checks
      .find((c) => /能跑通/.test(c.label));
    ok('消费方仓库判据 5 仍为 PASS（防护没有误伤正常路径）',
      nc && nc.ok === true && !nc.notRun, JSON.stringify(nc));
    fs.rmSync(recur, { recursive: true, force: true });
    fs.rmSync(normal, { recursive: true, force: true });
  }

  // ---- 超时必须记为 NOT RUN，且整棵树被杀 ----
  // 原实现把超时误报成「bash 不可用或脚本不存在」——证据指向错误的原因。
  // 超时是"没跑完"，与"跑不通"是两件事，硬约束要求未跑必须显式列出。
  {
    const hang = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-timeout-'));
    fs.writeFileSync(path.join(hang, 'package.json'), JSON.stringify({ name: 'x' }));
    runStage(hang, ['--upgrade', '--stage', '1']);
    // 写一个会挂住的 init.sh，并记录它拉起的孙进程 pid（用于验证整棵树被杀）。
    // 路径用正斜杠写进脚本：bash 里未加引号的反斜杠会被当转义符吃掉。
    const pidFile = path.join(hang, 'grand.pid');
    const pidFileSh = pidFile.replace(/\\/g, '/');
    fs.writeFileSync(path.join(hang, 'init.sh'),
      `#!/usr/bin/env bash\nset -e\nsleep 611 &\necho $! > "${pidFileSh}"\nwait\n`, 'utf8');

    const t1 = Date.now();
    const r = execFileSync(process.execPath,
      [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), hang, '--json'],
      { encoding: 'utf8', env: { ...process.env, LOOP_HARNESS_INIT_TIMEOUT_MS: '1500' } });
    const hung = Date.now() - t1;
    const hc = JSON.parse(r).stages[0].checks.find((c) => /能跑通/.test(c.label));
    ok('超时后判据 5 记为 NOT RUN（不是 FAIL）', hc && hc.notRun === true, JSON.stringify(hc));
    ok('超时的证据说明是超时，不是"bash 不可用"',
      hc && /超过 \d+s 未结束/.test(hc.evidence || '') && !/bash 不可用/.test(hc.evidence || ''),
      hc && hc.evidence);
    ok(`超时真的生效（${hung}ms < 20s，未等满 120s）`, hung < 20000, `${hung}ms`);

    // 整棵树被杀：孙进程不能存活。用 kill -0 判定，不用计数。
    const grand = (() => { try { return fs.readFileSync(pidFile, 'utf8').trim(); } catch { return null; } })();
    ok('挂起的 init.sh 确实拉起了孙进程（前置条件）', Boolean(grand), `pidFile=${pidFile}`);
    if (grand) {
      let alive = true;
      try { execFileSync('bash', ['-c', `kill -0 ${grand}`], { stdio: 'ignore' }); } catch { alive = false; }
      ok('超时后孙进程已被回收（整棵树被杀，不留孤儿）', !alive,
        `pid ${grand} 仍存活——孤儿进程会继续烧 CPU 并拖慢后续每一次 spawn`);
    }
    fs.rmSync(hang, { recursive: true, force: true });
  }

  // ---- 判据 5 每次运行只执行 init.sh 一次（memoization）----
  // 曾经 checksByStage / detectStage / JSON 输出各算一遍判据，于是 init.sh 被真的
  // 执行三次——一个挂起的脚本因此耗时 6 分钟（120s × 3）。这不是"慢一点"：
  // 判据是 (root, audit) 的纯函数，重复执行纯属浪费，且每一次都可能留孤儿。
  // 断言方式：让 init.sh 自报执行次数，数它到底跑了几遍。
  {
    const once = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-memo-'));
    fs.writeFileSync(path.join(once, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    runStage(once, ['--upgrade', '--stage', '1']);
    const counter = path.join(once, 'runs.txt');
    const counterSh = counter.replace(/\\/g, '/');
    fs.writeFileSync(path.join(once, 'init.sh'),
      `#!/usr/bin/env bash\nset -euo pipefail\necho run >> "${counterSh}"\necho ok\n`, 'utf8');

    runStage(once, ['--json']);
    const runs = fs.existsSync(counter)
      ? fs.readFileSync(counter, 'utf8').trim().split('\n').filter(Boolean).length
      : 0;
    eq('一次 --json 运行只执行 init.sh 一次', runs, 1);
    fs.rmSync(once, { recursive: true, force: true });
  }

  // ---- runWithTreeKill：超时语义与退出码区分 ----
  // 这是判据 5 的底座，单独测它比"通过判据 5 间接测"更快定位。
  {
    const okRun = runWithTreeKill('bash', ['-c', 'exit 0']);
    ok('成功命令 ok=true 且 status=0', okRun.ok === true && okRun.status === 0, JSON.stringify(okRun).slice(0, 120));

    const failRun = runWithTreeKill('bash', ['-c', 'exit 7']);
    ok('非零退出 ok=false 且 status 透传（7）', failRun.ok === false && failRun.status === 7,
      JSON.stringify(failRun).slice(0, 120));
    ok('非零退出不算 timedOut 也不算 spawnFailed',
      failRun.timedOut === false && failRun.spawnFailed === false, JSON.stringify(failRun).slice(0, 120));

    const toRun = runWithTreeKill('bash', ['-c', 'sleep 30'], { timeoutMs: 1200 });
    ok('超时 ok=false 且 timedOut=true', toRun.ok === false && toRun.timedOut === true,
      JSON.stringify(toRun).slice(0, 120));
    ok('超时不算 spawnFailed（否则会被报成"bash 不可用"）', toRun.spawnFailed === false,
      JSON.stringify(toRun).slice(0, 120));

    const missRun = runWithTreeKill('this-command-does-not-exist-xyz', []);
    ok('命令不存在 → spawnFailed=true', missRun.spawnFailed === true,
      JSON.stringify(missRun).slice(0, 120));
    ok('命令不存在不算 timedOut', missRun.timedOut === false, JSON.stringify(missRun).slice(0, 120));

    // 平台能力必须可见：有 GNU timeout 时 treeKill=true。没有它时降级路径
    // 会把 treeKill 标成 false——能力缺失不能静默。
    const probe = (() => {
      try { return execFileSync('timeout', ['--version'], { encoding: 'utf8' }); } catch { return ''; }
    })();
    const hasGnu = /GNU coreutils/i.test(probe);
    eq('treeKill 标记与平台能力一致', okRun.treeKill, hasGnu);
  }
}

// ---------------------------------------------------------------- 21. 预算与 kill switch

section('21. 预算与 kill switch（budget-check）');
{
  // 这两件事此前都没有代码入口：预算百分比只存在于 merge-gate.yml 的内联片段
  // （且用 Math.max 取全表最大上限），kill switch 由调用方用 --pause 传入而没人传。
  // 约束 11：被文档描述为"机械判定"的机制必须有真正读它的代码入口。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-budget-'));
  fs.copyFileSync(path.join(PACK_ROOT, 'loop-budget.md'), path.join(tmp, 'loop-budget.md'));
  const today = new Date().toISOString().slice(0, 10);

  // ---- 按 pattern 取上限，不是取全表最大值 ----
  {
    const caps = parseBudgetCaps(fs.readFileSync(path.join(PACK_ROOT, 'loop-budget.md'), 'utf8'));
    eq('CI Sweeper 上限 500k', capForPattern(caps, 'ci-sweeper'), 500000);
    eq('PR Review Triage 上限 300k（不是全表最大值）', capForPattern(caps, 'pr-review-triage'), 300000);
    eq('Merge Gate 上限 100k', capForPattern(caps, 'merge-gate'), 100000);
    eq('Post-Merge Cleanup 上限 200k', capForPattern(caps, 'post-merge-cleanup'), 200000);
    ok('每个循环的上限互不相同（否则 per-loop 上限是装饰品）',
      new Set(Object.values(caps)).size >= 4, JSON.stringify(caps));
  }

  // ---- 行为断言：250k 花在 pr-review-triage 上是 83% ----
  fs.writeFileSync(path.join(tmp, 'loop-run-log.md'),
    `# Log\n\n{"run_id":"${today}T00:00:00Z","pattern":"pr-review-triage","tokens_estimate":250000}\n`);
  const runB = (extra) => {
    try {
      const o = execFileSync(process.execPath,
        [path.join(PACK_ROOT, 'scripts', 'budget-check.mjs'), '--pattern', 'pr-review-triage', '--json', ...extra],
        { encoding: 'utf8', cwd: tmp });
      return { code: 0, json: JSON.parse(o) };
    } catch (e) { return { code: e.status, json: JSON.parse(e.stdout || '{}') }; }
  };
  const r = runB([]);
  eq('per-loop 上限生效（300k 而非 500k）', r.json.cap, 300000);
  eq('83% 时降级 report-only', r.json.mode, 'report-only');
  eq('report-only 不退出（退出码 0）', r.code, 0);

  // ---- 上限改动必须改变行为 ----
  const budgetPath = path.join(tmp, 'loop-budget.md');
  fs.writeFileSync(budgetPath, fs.readFileSync(budgetPath, 'utf8')
    .replace('| PR Review Triage | 96 | 300k |', '| PR Review Triage | 96 | 1k |'));
  const r2 = runB([]);
  eq('上限改成 1k 后同一输入退出', r2.json.mode, 'exit');
  eq('退出模式退出码 3', r2.code, 3);

  // ---- kill switch：独占一行的标记生效，散文提及不生效 ----
  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\nloop-pause-all\n');
  const paused = runB([]);
  eq('kill switch 生效（mode=exit）', paused.json.mode, 'exit');
  eq('kill switch 被标记为 paused', paused.json.paused, true);
  ok('kill switch 指明来源文件', /STATE\.md/.test(String(paused.json.paused_where)), paused.json.paused_where);

  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\n我们不使用 loop-pause-all 这个开关。\n');
  eq('散文提及不触发暂停', runB([]).json.paused, false);

  // 只在 loop-constraints.md 里声明也要生效
  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\n—\n');
  fs.writeFileSync(path.join(tmp, 'loop-constraints.md'), '# C\n\nloop-pause-all\n');
  const fromConstraints = runB([]);
  eq('loop-constraints.md 的标记同样生效', fromConstraints.json.paused, true);
  ok('来源指向 loop-constraints.md', /loop-constraints/.test(String(fromConstraints.json.paused_where)));

  // ---- 没有上限时必须退出，不能静默放行 ----
  fs.writeFileSync(path.join(tmp, 'loop-constraints.md'), '# C\n');
  fs.writeFileSync(budgetPath, '# Budget\n\n（没有 Daily Limits 表）\n');
  const noCap = runB([]);
  eq('没有 per-loop 上限时退出', noCap.json.mode, 'exit');
  eq('没有上限时退出码 3', noCap.code, 3);

  // ---- 未知标志 fail-closed（与其它脚本一致）----
  {
    const bad = (() => {
      try {
        execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'budget-check.mjs'),
          '--pattern', 'x', '--bogus', 'y'], { encoding: 'utf8', cwd: tmp });
        return 0;
      } catch (e) { return e.status; }
    })();
    eq('budget-check 拒绝未知标志', bad, 1);
  }

  // ---- 规则断言：LOOP.md 注册的每个循环都必须有自己的预算行 ----
  //
  // 这条断言防的是一整类漏改，而不是某个文件。此前的形态是
  // `/budget-check\.mjs/.test(merge-gate.yml)`——断言写在单个文件上，
  // 于是"另外 7 个 workflow 没接线"永远测不出来（WP-09 的实际失效）。
  //
  // 更根本的一层：即使 8 个 workflow 都调用了 budget-check，只要某个循环在
  // loop-budget.md 里没有自己的行，它就会拿到 cap:null → mode:exit。
  // 也就是说"接线"和"有上限"是两件事，必须分别守住。
  {
    // 从 LOOP.md 抽出注册的循环名。表格第一列是循环名（可能带中文括号注释）。
    const loopMd = fs.readFileSync(path.join(PACK_ROOT, 'LOOP.md'), 'utf8');
    const loopIds = [];
    for (const line of loopMd.split('\n')) {
      if (!line.trim().startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 4) continue;
      const name = cells[0];
      if (/^[-: ]+$/.test(name) || name === '循环') continue;
      const id = name.replace(/（[^）]*）|\([^)]*\)/g, '').trim().toLowerCase().replace(/\s+/g, '-');
      if (/^[a-z][a-z0-9-]*$/.test(id)) loopIds.push(id);
    }
    ok('LOOP.md 能抽出注册的循环', loopIds.length >= 8, `抽出 ${loopIds.length} 个: ${loopIds.join(', ')}`);

    const caps = parseBudgetCaps(fs.readFileSync(path.join(PACK_ROOT, 'loop-budget.md'), 'utf8'));
    const uncapped = loopIds
      .filter((id) => resolveCap(caps, id).cap === null)
      .map((id) => `${id}（loop-budget.md 里没有对应行）`);
    ok('每个注册循环都有预算上限（否则它一接线就 mode=exit）',
      uncapped.length === 0, uncapped.join('; '));

    // 双向：新加一个循环但忘了配预算 → 必须变红。
    // 只测"现有 8 个都有"是不够的——那证明不了这条规则会拦住第九个。
    const probe = resolveCap(caps, 'brand-new-loop-nobody-capped');
    eq('未登记的循环解析不到上限（规则真的生效）', probe.cap, null);
    ok('未登记时来源为 null（调用方据此区分"借来的上限"）', probe.source === null, JSON.stringify(probe));

    // 解析路径必须可区分，且**双向**：
    //   - 注册的循环各有自己的行 → exact
    //   - 表里没有的历史/别名 id → alias（而不是 null，也不是 exact）
    // 只测一个方向是不够的：若全部报 exact，就说明别名表已经死掉；
    // 若注册循环报 alias，就说明它有借来的上限而不是自己的。
    eq('注册循环报 exact（有自己的行）', resolveCap(caps, 'ci-sweeper').source, 'exact');
    eq('daily-triage 报 exact', resolveCap(caps, 'daily-triage').source, 'exact');
    ok('非注册的历史 id 靠别名兜底',
      String(resolveCap(caps, 'ci-triage').source).startsWith('alias:'),
      String(resolveCap(caps, 'ci-triage').source));
    eq('别名兜底与自成一行的循环解析到同一个上限',
      resolveCap(caps, 'ci-triage').cap, resolveCap(caps, 'ci-sweeper').cap);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 22. worktree 与队列

section('22. worktree 隔离与队列读取');
{
  // ---- worktree：隔离要求的代码入口 ----
  // loop-constraints.md 写着"无人值守的代码改动必须在独立 worktree 中进行"
  // "verifier REJECT 后丢弃，不留残留分支"，但此前没有任何代码创建或清理它。
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wt-'));
    const runWt = (args) => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          [path.join(PACK_ROOT, 'scripts', 'worktree.mjs'), ...args], { encoding: 'utf8', cwd: tmp }) };
      } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
    };
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: tmp });

    const c = runWt(['create', '--event', 'ci', '--item', 'ci-1', '--attempt', '1']);
    eq('worktree create 退出 0', c.code, 0);
    ok('worktree 目录已创建', fs.existsSync(path.join(tmp, 'loop', 'ci-ci-1-attempt1')));
    const branches = execFileSync('git', ['branch', '--list'], { encoding: 'utf8', cwd: tmp });
    ok('分支名遵循 minimal-fix 约定', branches.includes('ci-ci-1-attempt1'), branches);

    ok('list 报告该 worktree', runWt(['list']).out.includes('loop/ci-ci-1-attempt1'));

    const d = runWt(['discard', '--event', 'ci', '--item', 'ci-1', '--attempt', '1']);
    eq('worktree discard 退出 0', d.code, 0);
    ok('worktree 目录已清理', !fs.existsSync(path.join(tmp, 'loop', 'ci-ci-1-attempt1')));
    const after = execFileSync('git', ['branch', '--list'], { encoding: 'utf8', cwd: tmp });
    ok('分支已清理（不留残留分支）', !after.includes('ci-ci-1-attempt1'), after);

    // 命名消毒：item 里的路径字符不得逃出预期位置
    eq('worktreeName 消毒路径穿越', worktreeName('ci', '../../etc', 1), 'loop/ci-etc-attempt1');
    // 参数缺失必须报错
    eq('缺 --item 时报错', runWt(['create', '--event', 'ci']).code, 1);
    eq('未知 action 报错', runWt(['frobnicate']).code, 1);

    // ---- git hook 环境下也必须能工作 ----
    // pre-commit 钩子里 git 会设 GIT_DIR / GIT_INDEX_FILE 指向**外层仓库**，
    // 子进程继承后即使 cwd 是另一个仓库也会去操作外层索引，表现为
    // "Unable to create '.../.git/index.lock': No such file or directory"。
    // 这条断言是在 commit 时被 pre-commit 钩子当场抓出来的。
    {
      const h = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wt-hook-'));
      execFileSync('git', ['init', '-q'], { cwd: h });
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: h });
      const hookEnv = { ...process.env, GIT_DIR: path.join(PACK_ROOT, '.git'), GIT_INDEX_FILE: path.join(PACK_ROOT, '.git', 'index') };
      const r = (() => {
        try {
          return { code: 0, out: execFileSync(process.execPath,
            [path.join(PACK_ROOT, 'scripts', 'worktree.mjs'), 'create', '--event', 'ci', '--item', 'ci-h', '--attempt', '1'],
            { encoding: 'utf8', cwd: h, env: hookEnv }) };
        } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
      })();
      eq('git hook 环境下 worktree create 成功', r.code, 0);
      ok('git hook 环境下 worktree 目录已创建', fs.existsSync(path.join(h, 'loop', 'ci-ci-h-attempt1')), r.out.slice(0, 200));
      fs.rmSync(h, { recursive: true, force: true });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ---- queue-read：第 0 步第 3 条的读取契约 ----
  // harness-loop 第 0 步要求判断"队列为空"，但此前没有任何东西定义过队列是什么。
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-qr-'));
    const runQ = (args) => {
      try {
        const o = execFileSync(process.execPath,
          [path.join(PACK_ROOT, 'scripts', 'queue-read.mjs'), ...args], { encoding: 'utf8', cwd: tmp });
        return { code: 0, out: o, json: (() => { try { return JSON.parse(o); } catch { return null; } })() };
      } catch (e) { return { code: e.status, out: (e.stdout || ''), json: null }; }
    };

    // 空仓库：必须明确说"读了哪些来源都没东西"，而不是静默空
    const empty = runQ(['--json']);
    eq('空仓库 items 为空', empty.json.items.length, 0);
    ok('空仓库说明读了哪些来源', typeof empty.json.note === 'string' && empty.json.note.length > 0, empty.json.note);

    // .loop/queue/ 优先
    fs.mkdirSync(path.join(tmp, '.loop', 'queue'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.loop', 'queue', 'pr-1.json'),
      JSON.stringify({ id: 'pr-1', event: 'pull_request.opened', phase: 'review' }));
    const q1 = runQ(['--json']);
    eq('读到 1 条', q1.json.items.length, 1);
    eq('来源标为 .loop/queue', q1.json.source, '.loop/queue');
    eq('未回落', q1.json.fell_back, false);
    eq('--show 取到该条', runQ(['--show', 'pr-1', '--json']).json.id, 'pr-1');
    eq('--show 不存在的 id 退出 1', runQ(['--show', 'nope']).code, 1);

    // 坏 JSON 必须报出来，不能静默丢掉（"有东西但读不了" ≠ "没有东西"）
    fs.writeFileSync(path.join(tmp, '.loop', 'queue', 'broken.json'), '{not json');
    const q2 = runQ(['--json']);
    ok('坏文件被标为 malformed 而不是丢弃',
      q2.json.items.some((i) => i._malformed === true), JSON.stringify(q2.json.items));

    // 队列不存在时回落到 STATE.md 的未勾选条目
    fs.rmSync(path.join(tmp, '.loop'), { recursive: true, force: true });
    fs.writeFileSync(path.join(tmp, 'STATE.md'),
      '# State\n\n## High Priority (loop is acting)\n\n- [ ] 修 CI 的 flake\n- [x] 已完成\n\n## Active\n\n—\n');
    const q3 = runQ(['--json']);
    eq('回落到 STATE.md', q3.json.source, 'STATE.md#High Priority');
    eq('回落被标记', q3.json.fell_back, true);
    eq('只取未勾选的条目', q3.json.items.length, 1);
    ok('未勾选条目的标题正确', /修 CI 的 flake/.test(q3.json.items[0].title), JSON.stringify(q3.json.items));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

section('17. registry 与路由一致性');
{
  const registryText = fs.readFileSync(path.join(PACK_ROOT, 'patterns', 'registry.yaml'), 'utf8');
  // 每个 registry pattern 的 events 都应该在路由表中注册
  const eventsInRegistry = [...registryText.matchAll(/events:\s*\[([^\]]+)\]/g)]
    .flatMap((m) => m[1].split(',').map((s) => s.trim()));
  ok(`registry 声明了事件（${eventsInRegistry.length} 个）`, eventsInRegistry.length > 0);
  for (const ev of eventsInRegistry) {
    ok(`registry 事件已注册路由: ${ev}`, Boolean(ROUTES[ev]));
  }

  // ---- LOOP.md ↔ ROUTES 双向一致 ----
  // LOOP.md 自称"调度与路由的唯一真相源"，event-router 也自称"与 LOOP.md 保持一致"，
  // 但这个一致性过去没有任何测试。方向很重要：只查 registry→ROUTES 会漏掉
  // "LOOP.md 声明了一个无法路由的事件"。
  const loopText = fs.readFileSync(path.join(PACK_ROOT, 'LOOP.md'), 'utf8');
  const tableSection = loopText.split(/^\|\s*事件\s*\|/m)[1]?.split(/\n\s*\n/)[0] || '';
  // 只取反引号包裹、且首段是小写的路径式标识——`push:tags` / `release.published`
  // 这种合并写法要拆开，技能名（issue-triage）不含点所以天然被排除。
  const splitLoopEvents = [...tableSection.matchAll(/`([^`]+)`/g)]
    .flatMap((m) => m[1].split('/').map((s) => s.trim()))
    .filter((e) => /^[a-z_]+(\.[a-z_]+)*(:[a-z-]+)?$/.test(e));
  for (const ev of new Set(splitLoopEvents)) {
    ok(`LOOP.md 声明的事件可路由: ${ev}`, Boolean(ROUTES[ev]));
  }

  // ---- 事件名一致不等于路由一致 ----
  // 曾经只比对名字，于是两个事件的 phase 在文档与代码之间漂移了很久而无人发现：
  // check_suite.completed:success 文档写 report、代码做 verify；
  // release.published 文档写 release、代码做 close。
  {
    const phaseDrift = [];
    for (const line of tableSection.split('\n')) {
      if (!line.trim().startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length < 3) continue;
      const evs = [...cells[0].matchAll(/`([^`]+)`/g)]
        .flatMap((m) => m[1].split('/').map((s) => s.trim()))
        .filter((e) => /^[a-z_]+(\.[a-z_]+)*(:[a-z-]+)?$/.test(e));
      for (const ev of evs) {
        if (ROUTES[ev] && ROUTES[ev].phase !== cells[2]) {
          phaseDrift.push(`${ev}: LOOP.md=${cells[2]} / ROUTES=${ROUTES[ev].phase}`);
        }
      }
    }
    ok('LOOP.md 的事件 phase 与 ROUTES 一致', phaseDrift.length === 0, phaseDrift.join('; '));
  }
  for (const ev of Object.keys(ROUTES)) {
    ok(`ROUTES 中的事件在 LOOP.md 有登记: ${ev}`, splitLoopEvents.includes(ev));
  }
  // 全局默认值存在
  ok('registry 有 defaults 段', /^defaults:/m.test(registryText));
  ok('registry auto_merge 为 false', /auto_merge:\s*false/.test(registryText));
  ok('registry 有优先级表', /^priority:/m.test(registryText));
  // 非事件驱动循环已登记
  ok('registry 登记 lesson-harvest', /id:\s*lesson-harvest/.test(registryText));
  ok('registry 登记 signal-gatekeeper', /id:\s*signal-gatekeeper/.test(registryText));

  // ---- registry 的 stages: 块必须与代码的判据数一致 ----
  // 这个块此前没有任何消费者，于是"mechanical_checks: 10"在阶段 1 判据
  // 改成 8 项之后继续留着——同一份文件里的第二个真相源静默漂移。
  // 约束 11：写着值却没人读的配置是装饰品；改它必须改变行为（或至少被发现）。
  {
    const regStages = readRegistryStages(path.join(PACK_ROOT, 'patterns', 'registry.yaml'));
    ok('能从 registry 解析出 stages', Array.isArray(regStages) && regStages.length === 3,
      JSON.stringify(regStages));

    const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-regstage-'));
    fs.writeFileSync(path.join(emptyRepo, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    // 本节的 runStage 定义在另一段作用域里，这里自带一个
    const runStageHere = (target, extra = []) => {
      try {
        return { code: 0, out: execFileSync(process.execPath,
          [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), target, ...extra], { encoding: 'utf8' }) };
      } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
    };
    const sj = JSON.parse(runStageHere(emptyRepo, ['--json']).out);
    for (const st of regStages) {
      const actual = sj.stages[st.id - 1];
      const mech = actual.checks.filter((c) => !c.human).length;
      const human = actual.checks.filter((c) => c.human).length;
      eq(`registry 阶段 ${st.id} 的 mechanical_checks 与代码一致`, st.mechanical, mech);
      eq(`registry 阶段 ${st.id} 的 human_checks 与代码一致`, st.human, human);
    }
    fs.rmSync(emptyRepo, { recursive: true, force: true });
  }

  // ---- registry 的值必须真的改变行为 ----
  // 过去只断言 YAML 里写着某个数字，不管有没有代码读它——那证明"文字被抄下来了"，
  // 不证明"机制生效了"。这里改成行为断言。
  const parsed = readRegistryDefaults(path.join(PACK_ROOT, 'patterns', 'registry.yaml'));
  ok('能从 registry 解析出阈值', parsed && parsed.stagnation === 3 && parsed.maxAttempts === 3);

  const rtmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-registry-'));
  const regFile = path.join(rtmp, 'reg.yaml');
  const ledFile = path.join(rtmp, 'loop-ledger.json');
  fs.writeFileSync(ledFile, JSON.stringify({ attempts: [
    { n: 1, outcome: 'failure', error: 'TypeError: boom' },
    { n: 2, outcome: 'failure', error: 'TypeError: boom' },
  ] }));
  const runLed = (extra) => {
    try {
      execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'ledger-check.mjs'), '--ledger', ledFile, '--json', ...extra],
        { encoding: 'utf8' });
      return 'ok';
    } catch (e) { return JSON.parse(e.stdout || '{}').verdict || 'unknown'; }
  };

  eq('默认阈值下 2 次相同失败不熔断', runLed([]), 'ok');
  fs.writeFileSync(regFile, registryText.replace(/stagnation:\s*\d+/, 'stagnation: 1'));
  eq('registry 把 stagnation 改成 1 后同样输入熔断', runLed(['--registry', regFile]), 'stagnation');

  // gate-check 同理
  const runGate = (extra) => {
    try {
      const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'),
        '--item', 'p', '--phase', 'fix', '--attempts', '1', '--diff-files', 'a.ts', '--verdict', 'approve', ...extra],
        { encoding: 'utf8' });
      return JSON.parse(o).decision;
    } catch (e) { return JSON.parse(e.stdout || '{}').decision || 'unknown'; }
  };
  eq('默认 max_attempts=3 时 attempts=1 可通过', runGate([]), 'proceed');
  fs.writeFileSync(regFile, registryText.replace(/max_attempts:\s*\d+/, 'max_attempts: 1'));
  eq('registry 把 max_attempts 改成 1 后同一输入被拦', runGate(['--registry', regFile]), 'escalate');
  fs.rmSync(rtmp, { recursive: true, force: true });

  // ---- 修复计划的落地状态必须可核对 ----
  // 计划里列了条目、但没人记录哪些真的做了，"已完成"就不可验证——
  // 这正是硬约束 11 的同一个毛病：配置存在却不产生行为差异。
  // 因此每个 WP 都必须在计划文件的状态表里有一行，且状态是已做或有意未做之一。
  const planPath = path.join(PACK_ROOT, 'REVIEW-2026-10-14-consolidated-plan.md');
  if (fs.existsSync(planPath)) {
    const plan = fs.readFileSync(planPath, 'utf8');
    const wps = [...new Set([...plan.matchAll(/^### (WP-\d)/gm)].map((m) => m[1]))];
    ok(`计划里有 ${wps.length} 个工作包`, wps.length >= 8);
    for (const wp of wps) {
      ok(`${wp} 在状态表中有落地记录`,
        new RegExp(`\\|\\s*${wp}[^\\n]*\\|\\s*(✅|未做|有意跳过)`).test(plan));
    }
    ok('计划标注了执行状态', /\*\*执行状态\*\*/.test(plan));
    ok('计划有「有意未做」清单', /### 6\.2 有意未做/.test(plan));
    // 每个未做项都必须说明理由——只有状态没有理由的条目无法复核
    const skippedRows = (plan.split('### 6.2')[1] || '').split('\n').filter((l) => /^\|\s*[^|]*\|/.test(l) && /未做|有意跳过/.test(l));
    ok(`有意未做清单非空（${skippedRows.length} 项）`, skippedRows.length > 0);
    const noReason = skippedRows.filter((l) => l.split('|').filter((c) => c.trim()).length < 4);
    ok('每个未做项都写了理由', noReason.length === 0, `${noReason.length} 项缺理由`);
  }
}

// ---------------------------------------------------------------- 汇总

// 文档里声称的断言数必须与实测一致，否则"验证已完成"这句话本身就是不可信的。
// 本仓库曾有四个互相矛盾的数字（323 / 409 / 451 / 498），实测是第三个值。
// 断言总数依赖配置（如 registry 的事件数），所以用固定偏移量而不是硬编码。
const DOC_OFFSET = 3; // 本节自身的三条断言尚未计入，故补 3
const docChecks = [
  ['README.md', /\b(\d{3})\s*项断言/],
  ['progress.md', /\b(\d{3})\s*项测试断言/],
  ['docs/10-how-to-use.md', /\b(\d{3})\s*项断言/],
];
const expectedTotal = passed + failed + DOC_OFFSET;
for (const [file, re] of docChecks) {
  const m = fs.readFileSync(path.join(PACK_ROOT, file), 'utf8').match(re);
  if (!m) {
    ok(`${file} 声称了断言数`, false, '未找到断言数声明');
    continue;
  }
  ok(`${file} 声称的断言数与实测一致`, Number(m[1]) === expectedTotal, `文档写 ${m[1]}，实测 ${expectedTotal}`);
}

process.stdout.write(`\n${'='.repeat(60)}\n`);
process.stdout.write(`Passed: ${passed}   Failed: ${failed}\n`);
if (failed) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
}
process.stdout.write(`${'='.repeat(60)}\n`);
process.exit(failed ? 1 : 0);
