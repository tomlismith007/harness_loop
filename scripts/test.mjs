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
import { fileURLToPath } from 'node:url';

import { parseArgs, matchesDenylist, structuredText, textHas, structuredHas, detectProject, verificationCommands, initScriptFromCommands, PACK_ROOT, TEMPLATE_DIR, SKILLS_DIR, listFiles, readText } from './lib/common.mjs';
import { checkLedger, normalizeError } from './ledger-check.mjs';
import { route, ROUTES, readLocks } from './event-router.mjs';
import { checkGates } from './gate-check.mjs';
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
}

// ---------------------------------------------------------------- 4. 熔断器

section('4. 熔断器判定');
{
  const mk = (n, outcome, error) => Array.from({ length: n }, (_, i) => ({
    iteration: i + 1, item: 'x', action: 'a', outcome, error, tokensUsed: 100, at: '2026-01-01T00:00:00Z',
  }));

  eq('空账本 → ok', checkLedger({ attempts: [] }).verdict, 'ok');
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

  // 冲突检测
  const r7 = route('check_suite.completed:failure', {
    item: 'pr-123',
    locks: [{ item: 'pr-review-triage', acting_on: 'pr-123' }],
  });
  eq('锁冲突检测', r7.conflict, 'lock-held');

  const r8 = route('check_suite.completed:failure', { item: 'pr-999', locks: [{ item: 'x', acting_on: 'pr-123' }] });
  eq('无冲突时不报 conflict', r8.conflict, undefined);

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
  eq('干净通过', checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', budgetPct: 10 }).decision, 'proceed');
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
  const t1 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', reviewedSha: 'abc123', headSha: 'abc123' });
  eq('sha 一致 → proceed', t1.decision, 'proceed');
  const t2 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', reviewedSha: 'abc123', headSha: 'def456' });
  eq('sha 不一致 → escalate', t2.decision, 'escalate');
  eq('sha 不一致闸门名', t2.gate, 'head-commit');
  ok('sha 不一致提示 --match-head-commit', /match-head-commit/.test(t2.next));
  const t3 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve' });
  eq('未提供 sha 时不阻断', t3.decision, 'proceed');

  // ---- 回退测试（Red check）----
  const r1 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'pass' });
  eq('red check 通过 → proceed', r1.decision, 'proceed');
  const r2 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'fail' });
  eq('red check 失败 → escalate', r2.decision, 'escalate');
  eq('red check 闸门名', r2.gate, 'red-check');
  const r3 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'not-run' });
  eq('gate 阶段未跑 red check → escalate', r3.decision, 'escalate');
  const r4 = checkGates({ item: 'p', phase: 'fix', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', redCheck: 'not-run' });
  eq('fix 阶段未跑 red check 不阻断', r4.decision, 'proceed');

  // ---- NOT RUN 声明 ----
  const n1 = checkGates({ item: 'p', phase: 'gate', attempts: 1, diffFiles: ['a.ts'], verdict: 'approve', notRun: ['real-device', 'load-test'] });
  eq('有未跑项仍可 proceed', n1.decision, 'proceed');
  ok('未跑项出现在输出', Array.isArray(n1.checks_not_run) && n1.checks_not_run.length === 2);
  ok('未跑项在 next 中被提示列出', /NOT RUN/.test(n1.next));

  // 优先级：pause 覆盖一切
  const p1 = checkGates({ item: 'p', pause: true, diffFiles: ['auth/x.ts'], attempts: 9 });
  eq('pause 优先于 denylist 与 attempts', p1.gate, 'pause');
  // 优先级：denylist 优先于 attempts
  const p2 = checkGates({ item: 'p', attempts: 9, diffFiles: ['auth/x.ts'] });
  eq('denylist 优先于 attempts', p2.gate, 'denylist');
  // 优先级：budget 100 优先于 denylist
  const p3 = checkGates({ item: 'p', budgetPct: 100, diffFiles: ['auth/x.ts'] });
  eq('预算 100% 优先于 denylist', p3.gate, 'budget');
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
    'harness-loop', 'harness-bootstrap',
    'loop-constraints', 'loop-budget', 'loop-guard', 'event-router', 'signal-gatekeeper',
    'issue-triage', 'pr-review-triage', 'ci-triage',
    'minimal-fix', 'loop-verifier', 'post-merge-cleanup', 'release-drafter',
    'lesson-harvest',
    'harness-init', 'harness-strengthen', 'harness-consolidate',
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

  // LESSONS.md 模板含棘轮机制
  const lessons = fs.readFileSync(path.join(PACK_ROOT, 'templates', 'LESSONS.md'), 'utf8');
  ok('LESSONS 模板含 Seen N× 格式说明', /Seen N×/.test(lessons));
  ok('LESSONS 模板含转正规则', /3 个不同日期/.test(lessons));
  ok('LESSONS 模板有 Rules 区', /## Rules/.test(lessons));
  ok('LESSONS 模板有 Done right 区', /## Done right/.test(lessons));
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
    'AGENTS.md', 'feature_list.json', 'progress.md', 'session-handoff.md',
    'init.sh', 'loop-constraints.md', 'loop-budget.md', 'loop-run-log.md',
    'LOOP.md', 'STATE.md', 'LESSONS.md', 'loop-ledger.json',
    'skills/harness-loop/SKILL.md', 'skills/loop-constraints/SKILL.md',
    'skills/minimal-fix/SKILL.md', 'skills/loop-verifier/SKILL.md',
    'skills/issue-triage/SKILL.md', 'skills/ci-triage/SKILL.md',
    'skills/lesson-harvest/SKILL.md', 'skills/signal-gatekeeper/SKILL.md',
  ];
  for (const f of expectCreated) {
    ok(`装配生成: ${f}`, fs.existsSync(path.join(tmp, f)));
  }

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
      return { code: 0, out };
    } catch (e) {
      return { code: e.status, out: e.stdout || '' };
    }
  };

  const r1 = run(['--item', 'p', '--diff-files', listPath, '--verdict', 'approve']);
  ok('裸文件路径按列表读取', r1.out.includes('"files_changed": 2'), r1.out.slice(0, 120));

  const r2 = run(['--item', 'p', '--diff-files', '@' + denyList, '--verdict', 'approve']);
  ok('@前缀文件列表命中拒绝列表', r2.out.includes('"gate": "denylist"'), r2.out.slice(0, 160));
  eq('@前缀命中时退出码 2', r2.code, 2);

  const r3 = run(['--item', 'p', '--diff-files', 'a.ts,b.ts,c.ts', '--verdict', 'approve']);
  ok('逗号列表解析', r3.out.includes('"files_changed": 3'), r3.out.slice(0, 120));

  const r4 = run(['--item', 'p', '--diff-files', '@' + path.join(tmp, 'nope.txt')]);
  eq('缺失的 @文件报错退出 1', r4.code, 1);

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

  const dest = path.join(tmp, '.zcode', 'skills');
  ok('默认布局为 <repo>/.zcode/skills', fs.existsSync(dest));
  ok('技能文件已写入', fs.existsSync(path.join(dest, 'harness-loop', 'SKILL.md')));
  ok('manifest 已写入', fs.existsSync(path.join(dest, '.loop-harness-install.json')));

  // 装到 ZCode 实际会扫描的路径才算有效
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

  // uninstall
  const r4 = run(['--target', tmp, '--uninstall']);
  eq('卸载退出码 0', r4.code, 0);
  ok('卸载后技能目录消失', !fs.existsSync(path.join(dest, 'harness-loop')));
  ok('卸载后 manifest 消失', !fs.existsSync(path.join(dest, '.loop-harness-install.json')));

  // 无 manifest 时卸载应报错
  const r5 = run(['--target', tmp, '--uninstall']);
  eq('无 manifest 卸载报错退出 1', r5.code, 1);

  fs.rmSync(tmp, { recursive: true, force: true });

  // ---- 布局选择：.agents 是跨 agent 的共享路径 ----
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
  const r1 = runStage(empty, ['--json']);
  const j1 = JSON.parse(r1.out);
  eq('装配后达成阶段 1', j1.current_stage, 1);
  ok('阶段 1 complete', j1.stages[0].complete === true);
  eq('--stage 1 --require 退出 0', runStage(empty, ['--stage', '1', '--require']).code, 0);
  eq('--stage 2 --require 仍退出 2', runStage(empty, ['--stage', '2', '--require']).code, 2);

  // 阶段 1 的关键文件都生成了
  for (const f of ['AGENTS.md', 'feature_list.json', 'STATE.md', 'progress.md', 'init.sh', 'LOOP.md', 'loop-constraints.md', 'LESSONS.md']) {
    ok(`阶段 1 生成 ${f}`, fs.existsSync(path.join(empty, f)));
  }

  // 升级到阶段 2 应补上 verifier
  runStage(empty, ['--upgrade', '--stage', '2']);
  ok('阶段 2 补上 loop-verifier', fs.existsSync(path.join(empty, 'skills', 'loop-verifier', 'SKILL.md')));
  ok('阶段 2 补上 minimal-fix', fs.existsSync(path.join(empty, 'skills', 'minimal-fix', 'SKILL.md')));
  ok('阶段 2 补上 loop-guard', fs.existsSync(path.join(empty, 'skills', 'loop-guard', 'SKILL.md')));

  // 升级到阶段 3 应补上事件接线
  runStage(empty, ['--upgrade', '--stage', '3']);
  const wfDir = path.join(empty, '.github', 'workflows');
  ok('阶段 3 补上事件接线目录', fs.existsSync(wfDir));
  ok('阶段 3 补上 lesson-harvest workflow', fs.existsSync(path.join(wfDir, 'lesson-harvest.yml')));
  ok('阶段 3 补上 signal-gatekeeper', fs.existsSync(path.join(empty, 'skills', 'signal-gatekeeper', 'SKILL.md')));

  // 三阶段都定义且各有判据
  ok('三个阶段都有判据', j1.stages.length === 3 && j1.stages.every((s) => s.checks.length > 0));
  ok('每个阶段都有依据', j1.stages.every((s) => s.goal && s.level));

  // 阶段技能必须在各自的升级列表里（否则 workspace 安装拿不到）
  const stageSrc = fs.readFileSync(path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'), 'utf8');
  ok('阶段1 升级列表含 harness-init', /STAGE1_SKILLS[\s\S]{0,240}harness-init/.test(stageSrc));
  ok('阶段2 升级列表含 harness-strengthen', /STAGE2_SKILLS[\s\S]{0,240}harness-strengthen/.test(stageSrc));
  ok('阶段3 升级列表含 harness-consolidate', /STAGE3_SKILLS[\s\S]{0,240}harness-consolidate/.test(stageSrc));

  // 旧技能名不得残留（目录、frontmatter、文档引用）。
  // 拼接构造，避免测试文件自身命中这个检查。
  const staleNames = ['init', 'strengthen', 'consolidate'].map((s) => 'stage' + '-' + s);
  const scanFiles = [];
  (function walk(d, depth) {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', '.mimosa', 'node_modules'].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f, depth + 1);
      else if (/\.(md|mjs|yaml|yml|json)$/.test(e.name)) scanFiles.push(f);
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
    && /skill:\s*harness-strengthen/.test(registrySrc)
    && /skill:\s*harness-consolidate/.test(registrySrc));

  fs.rmSync(empty, { recursive: true, force: true });

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
    rph.stages[0].checks.some((c) => /非占位/.test(c.label) && !c.ok));
  fs.rmSync(ph, { recursive: true, force: true });

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
  // 全局默认值存在
  ok('registry 有 defaults 段', /^defaults:/m.test(registryText));
  ok('registry auto_merge 为 false', /auto_merge:\s*false/.test(registryText));
  ok('registry 有优先级表', /^priority:/m.test(registryText));
  ok('registry 熔断阈值 3/5/10', /stagnation:\s*3/.test(registryText) && /no_progress:\s*5/.test(registryText) && /max_iterations:\s*10/.test(registryText));
  // magpie 引入的四条默认值
  ok('registry 声明 merge_binding', /merge_binding:\s*match-head-commit/.test(registryText));
  ok('registry 声明 red_check_required', /red_check_required:\s*true/.test(registryText));
  ok('registry 声明 not_run_must_be_listed', /not_run_must_be_listed:\s*true/.test(registryText));
  ok('registry 声明 lesson_promotion_threshold=3', /lesson_promotion_threshold:\s*3/.test(registryText));
  // 非事件驱动循环已登记
  ok('registry 登记 lesson-harvest', /id:\s*lesson-harvest/.test(registryText));
  ok('registry 登记 signal-gatekeeper', /id:\s*signal-gatekeeper/.test(registryText));
}

// ---------------------------------------------------------------- 汇总

process.stdout.write(`\n${'='.repeat(60)}\n`);
process.stdout.write(`Passed: ${passed}   Failed: ${failed}\n`);
if (failed) {
  process.stdout.write('\nFailures:\n');
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
}
process.stdout.write(`${'='.repeat(60)}\n`);
process.exit(failed ? 1 : 0);
