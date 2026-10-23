#!/usr/bin/env node
/**
 * stage2.mjs — 阶段 2（装配 loop 机制）的判据与补齐
 *
 * 只有阶段 2 的技能（`harness-loop-init`）带它。阶段 1 的东西（6 个地基文件、
 * 工作规则、feature 完成标准）不在这里重复实现——那是 stage1 的职责。
 *
 * 依赖：stage-core（共享原语）+ drill-record（演练记录是否有效）。
 * 不 import stage1，也不 import drill-check / ledger-check / gate-check：
 * 判据只读记录，不跑演练。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  exists, readText, readJson, parseDenylistFrom, textHas, structuredText,
  SKILL_DIRS, USER_SKILL_DIRS,
} from './lib/common.mjs';
import { initScriptHasPlaceholder, copyStageTemplate } from './stage-core.mjs';
import { recordStatus } from './drill-record.mjs';

/**
 * 模板里预置的拒绝列表路径（用于判断用户是否本地化过）。
 * 必须与 templates/harness-constraints.md 逐条一致——否则模板自己会被判成"已本地化"。
 * 测试断言模板是仓库列表的子集，且仓库至少多 2 条。
 */
const TEMPLATE_DENYLIST = [
  '.env', '.env.*', '**/secrets/**', '**/credentials/**',
  '**/*_key*', '**/*_secret*', '.terraform/**', 'k8s/production/**',
  '**/migrations/**', 'auth/**', 'payments/**', 'billing/**',
  'harness-constraints.md', 'loop-constraints.md',
  'skills/*/scripts/**', 'skills/*/templates/**',
  '.github/workflows/**', 'package.json',
  'package-lock.json', 'templates/**',
];

/**
 * 技能是否装在 agent 真的会扫描的路径，且内容不是空壳。
 *
 * `.claude/skills` 与 `.agents/skills` 是本包实际安装的两个位置；
 * 裸 `<repo>/skills/` 是明知不可发现的，不算。
 */
function skillInDiscoverablePath(root, skillName, requiredText) {
  const dirs = SKILL_DIRS.filter((d) => d !== 'skills');
  // 项目内优先；README 的快速开始是 `--scope user`，那条路径同样算"可发现"。
  // 只认项目内会让主推路径永远到不了阶段 2。
  const candidates = [
    ...dirs.map((d) => path.join(root, d, skillName, 'SKILL.md')),
    ...USER_SKILL_DIRS.map((d) => path.join(d, skillName, 'SKILL.md')),
  ];
  const file = candidates.find((p) => exists(p));
  if (!file) return false;
  const text = readText(file);
  // 没有 name + description frontmatter 的 SKILL.md 宿主不会加载——
  // 文件在、内容对，但永远不会被触发，等于没装。
  // 只认文件开头的 frontmatter 块；正文里的 `name:` 或分隔线不算。
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fm) return false;
  if (!/^name:\s*\S/m.test(fm[1]) || !/^description:\s*\S/m.test(fm[1])) return false;
  if (!requiredText) return true;
  return textHas(structuredText(text), requiredText);
}

/**
 * 拒绝列表是否已本地化。
 *
 * 单纯 grep「有没有 .env」分不清「确实会保护这个路径」和「抄了模板里那句话」。
 * 判据：与模板原文有实质差异（增删了路径），才说明有人按本仓库调整过。
 */
function denylistLocalized(root) {
  // 拒绝列表在 harness-constraints.md；旧仓库可能还只有 loop-constraints.md。
  const p = ['harness-constraints.md', 'loop-constraints.md']
    .map((n) => path.join(root, n)).find((f) => exists(f));
  if (!p) return { localized: false, reason: 'harness-constraints.md 不存在' };

  // 解析逻辑与 gate-check 的强制执行共用 common.parseDenylistFrom。
  const lines = parseDenylistFrom(readText(p));
  if (!lines.length) {
    return { localized: false, reason: 'Paths 章节没有代码块（拒绝列表为空）' };
  }

  // 策略面路径必须在列表里：拒绝列表不保护自己，就等于可以被循环改掉。
  if (!lines.includes('loop-constraints.md')) {
    return {
      localized: false,
      reason: '拒绝列表没有包含 loop-constraints.md 自身——策略文件必须自我保护',
    };
  }

  const templateSet = new Set(TEMPLATE_DENYLIST);
  const currentSet = new Set(lines);

  const added = lines.filter((l) => !templateSet.has(l));
  const removed = TEMPLATE_DENYLIST.filter((t) => !currentSet.has(t));

  if (added.length === 0 && removed.length === 0) {
    return {
      localized: false,
      reason: `拒绝列表与模板完全一致（${lines.length} 条）——说明只复制了模板，没有按本仓库调整`,
    };
  }
  // "与模板不同"太弱：只写一条 loop-constraints.md 也算不同。
  // 判据要能回答"这个仓库真的想过自己的高危路径吗"——至少两条模板之外的路径。
  if (added.length < 2) {
    return {
      localized: false,
      reason: `拒绝列表只比模板多 ${added.length} 条——至少要有 2 条本仓库特有的高危路径`,
    };
  }

  return { localized: true, reason: null, added: added.length, removed: removed.length };
}

/** 账本是否已从占位内容替换成真实目标 */
function ledgerIsReal(root) {
  const ledger = readJson(path.join(root, 'loop-ledger.json'));
  if (!ledger || !Array.isArray(ledger.attempts)) {
    return { ok: false, reason: 'loop-ledger.json 不存在或 attempts 不是数组' };
  }
  if (/^\s*(example\b|replace with)/i.test(String(ledger.goal || ''))) {
    return { ok: false, reason: 'loop-ledger.json 仍是出厂占位 goal（Replace with…）' };
  }
  return { ok: true, reason: null };
}

/** 运行日志是否存在且带 `## Log` 章节（技能文档的判据是章节，不是文件存在） */
function runLogHasSection(root) {
  const p = path.join(root, 'loop-run-log.md');
  if (!exists(p)) return { ok: false, reason: 'loop-run-log.md 不存在' };
  return /^##\s+Log\s*$/m.test(readText(p))
    ? { ok: true, reason: null }
    : { ok: false, reason: 'loop-run-log.md 缺少 ## Log 章节' };
}

/**
 * 拒绝列表的第二个副本：`docs/04-safety.md` 的代码块。
 *
 * 两份列表逐条比较。文档说禁止、机器放行是危险方向，所以它必须是判据而不是建议。
 * 没有 docs/04 时跳过（不是所有仓库都有 docs 目录）。
 */
function denylistDrift(root) {
  const docs = path.join(root, 'docs', '04-safety.md');
  // 没有第二份列表 → NOT RUN，不是 PASS。"不存在的文件被判一致"是 7 项机械
  // 判据里的一项空转，而空转的判据比没有判据更糟：它看起来像通过。
  if (!exists(docs)) return { ok: null, reason: 'docs/04-safety.md 不存在', skipped: true };
  const md = readText(docs);
  const heading = md.split(/^##\s*拒绝列表/m)[1];
  if (heading === undefined) return { ok: null, reason: 'docs/04-safety.md 没有「## 拒绝列表」节', skipped: true };
  const block = (heading.split('```')[1] || '')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+#/)[0].trim()).filter(Boolean);
  if (!block.length) return { ok: null, reason: 'docs/04-safety.md 的拒绝列表代码块为空', skipped: true };

  const constraints = parseDenylistFrom(readText(path.join(root, 'harness-constraints.md')));
  const a = new Set(constraints);
  const b = new Set(block);
  const missingInConstraints = block.filter((p) => !a.has(p));
  const missingInDocs = constraints.filter((p) => !b.has(p));
  if (missingInConstraints.length || missingInDocs.length) {
    return {
      ok: false,
      reason: `拒绝列表漂移：docs/04 有而约束文件没有 [${missingInConstraints.join(', ')}]；`
        + `约束文件有而 docs/04 没有 [${missingInDocs.join(', ')}]`,
    };
  }
  return { ok: true, reason: null };
}

/** 阶段 2 判据。`opts.self` 见 stage1.detectSelfReference。 */
export function checkStage2(root, opts = {}) {
  const c = [];
  const add = (label, ok, evidence, action, human = false, extra = {}) =>
    c.push({ label, ok: ok === null ? null : Boolean(ok), evidence, action, human, ...extra });

  const ledger = ledgerIsReal(root);
  add('熔断账本就位（loop-ledger.json，goal 已替换）', ledger.ok, ledger.reason,
    '编辑 loop-ledger.json：把 goal 换成当前循环的真实目标');

  const runLog = runLogHasSection(root);
  add('运行日志存在且含 ## Log 章节（loop-run-log.md）', runLog.ok, runLog.reason,
    '复制 templates/loop-run-log.md');

  const loopSkill = skillInDiscoverablePath(root, 'harness-loop', ['kill switch', '验证']);
  add('harness-loop 已装到可发现路径且写明 kill switch 与独立验证', loopSkill,
    loopSkill ? null
      : exists(path.join(root, 'skills', 'harness-loop', 'SKILL.md'))
        ? '技能在 <repo>/skills/ —— 没有任何 agent 会扫描这个路径'
        : '未找到 harness-loop 技能，或其正文没有 kill switch / 独立验证的实操描述',
    // install-skills.mjs 不随技能分发——按旧提示执行必得 MODULE_NOT_FOUND。
    // 装技能只有一条对外路径。
    '运行 npx skills add <repo> --skill harness-loop，或把技能目录复制到 .claude/skills/');

  const ph = initScriptHasPlaceholder(root);
  add('验证命令是真实的（无占位符）', !ph.placeholder, ph.reason,
    '编辑 init.sh，把占位命令换成项目实际命令');

  // 包自身就是模板的源头：它的拒绝列表必然与模板相同，这条判据在这里
  // 永远不可能通过。标 N/A 而不是 FAIL——永久红会让整个报告失去参考价值。
  const dl = opts.self
    ? { localized: null, na: true, reason: 'N/A：pack 是模板源头，拒绝列表与模板相同是预期' }
    : denylistLocalized(root);
  add('拒绝列表已本地化（非模板原文）', dl.localized, dl.reason,
    '按本仓库实际情况增删拒绝路径：加上真实的高危目录，删掉不存在的', false, { na: dl.na });

  const drift = denylistDrift(root);
  add('两份拒绝列表一致（harness-constraints.md ↔ docs/04-safety.md）', drift.ok, drift.reason,
    '两边逐条对齐：文档说禁止的路径，机器必须也禁止');

  // 护栏必须被证明会响，而不只是存在。记录绑定约束文件的 sha256：
  // 改了策略而没重跑 drill，旧记录不再证明任何东西。
  const drill = recordStatus(root);
  const drillOk = drill.present && !drill.stale && drill.failed.length === 0;
  add('护栏演练通过（拒绝列表/熔断器/验证者 canary，记录与当前约束一致）', drillOk,
    drillOk ? null
      : drill.reason
        || `演练有 ${drill.failed.length} 项失败：${drill.failed.join(', ')}`,
    `运行 node ${path.join(path.dirname(process.argv[1]), 'drill-check.mjs')} --record，然后提交 loop-drill.json`);

  add('回退测试被实际执行过（需人工确认）', null,
    '至少有一次：新测试在修复前的代码上真的挂掉，且失败信息指出了错误的行为。'
    + '把那次运行的命令与输出记进 STATE.md，作为证据',
    '没做过 → 找一次真实修复，补做回退测试并记录输出', true);

  add('NOT RUN 声明被实际使用过（需人工确认）', null,
    '至少有一份验证报告把没跑的检查列为 NOT RUN（而不是省略）。把该报告记进 STATE.md',
    '没做过 → 下一次验证时明确列出未跑的检查', true);

  return c;
}

// ---------------------------------------------------------------- 升级

/** 阶段 2 产出 loop 机制文档。账本在 upgradeStage2 里单独创建。 */
const STAGE2_FILES = [
  ['loop-run-log.md', 'loop-run-log.md'],
  ['loop-constraints.md', 'loop-constraints.md'],
];

export function upgradeStage2(root, force, results) {
  for (const [tpl, out] of STAGE2_FILES) {
    copyStageTemplate(tpl, out, root, {}, force, results);
  }
  // 账本是熔断器的运行时状态，阶段 2 才建。
  const ledgerPath = path.join(root, 'loop-ledger.json');
  if (force || !exists(ledgerPath)) {
    fs.writeFileSync(ledgerPath, JSON.stringify({
      goal: 'Replace with the current loop goal', attempts: [],
    }, null, 2) + '\n', 'utf8');
    results.push({ status: 'written', path: ledgerPath });
  } else {
    results.push({ status: 'skipped', path: ledgerPath });
  }
}
