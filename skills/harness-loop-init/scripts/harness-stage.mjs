#!/usr/bin/env node
/**
 * harness-stage.mjs — 两阶段 harness 驱动器
 *
 * 阶段 1 初始化：创建 6 个地基文件，让 harness 结构完整、下一会话可重启
 * 阶段 2 装配 loop 机制：装账本、运行日志、熔断与独立验证的入口
 *
 * 用法：
 *   node scripts/harness-stage.mjs /path/to/repo              # 检测当前阶段 + 报告差距
 *   node scripts/harness-stage.mjs . --stage 2 --require      # 校验阶段 2 是否达成（CI 用）
 *   node scripts/harness-stage.mjs . --upgrade                # 补齐下一阶段缺失的文件
 *   node scripts/harness-stage.mjs . --json
 *
 * 退出码：
 *   0  报告模式，或 --require 且目标阶段已达成
 *   2  --require 但目标阶段未达成
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, exists, readText, readJson, printJson, copyTemplate,
  PACK_ROOT, PACK_VERSION, SKILLS_DIR, SKILL_DIRS, USER_SKILL_DIRS, INSTALL_MANIFEST, parseDenylistFrom, detectProject,
  verificationCommands, initScriptFromCommands, textHas, structuredText, fail,
  samePath, runWithTreeKill, isEntryPoint } from './lib/common.mjs';
import { recordStatus } from './drill-check.mjs';

// ---------------------------------------------------------------- 阶段定义

export const STAGES = [
  {
    id: 1,
    name: '初始化',
    en: 'Init',
    goal: '创建 6 个地基文件，让 harness 结构完整、下一会话可重启',
    level: 'L1',
    grounding: [
      'LHE 五子系统最小工件：AGENTS.md / feature_list.json / STATE.md / init.sh',
      'LHE「给地图不给手册」：AGENTS.md 是路由表，不是百科',
      'LEC：第一周只报告，不自动修复',
    ],
  },
  {
    id: 2,
    name: '装配 loop 机制',
    en: 'Loop Init',
    goal: '装账本、运行日志、熔断与独立验证的入口，让验证真的有效',
    level: 'L2',
    grounding: [
      'LEC maker/checker 分离 + denylist + 熔断器（3 / 5 / 10）',
      'magpie：回退测试、未跑必须写明、真机验证',
    ],
  },
];

// ---------------------------------------------------------------- 判据检查

/**
 * 文件"存在"必须是有内容的。空文件、只有空白、只有 HTML 注释，都不算——
 * `touch` 不是装配。模板自带注释，所以先剥注释再判空。
 */
function hasFile(root, name) {
  const p = path.join(root, name);
  if (!exists(p)) return false;
  return stripHtmlComments(readText(p)).trim().length > 0;
}

/** init.sh 里是否还有占位符（未替换为真实命令） */
function initScriptHasPlaceholder(root) {
  const p = path.join(root, 'init.sh');
  if (!exists(p)) return { placeholder: true, reason: 'init.sh 不存在' };
  const text = readText(p);
  const markers = [
    /No package manifest detected/i,
    /Replace this section/i,
    /replace this line/i,
    /No test script found/i,
  ];
  for (const m of markers) {
    if (m.test(text)) return { placeholder: true, reason: `init.sh 含占位符：${m.source}` };
  }
  if (!/set -e/.test(text)) return { placeholder: true, reason: 'init.sh 缺少 set -e（失败不会中断）' };
  return { placeholder: false, reason: null };
}

/**
 * 判据 5 执行 init.sh 的超时（毫秒）。
 *
 * 默认 120s。测试要覆盖"超时 → NOT RUN 而不是假 FAIL"这条路径，等 120 秒不可行，
 * 所以留一个环境变量旋钮——它必须真的改变行为。
 */
const INIT_TIMEOUT_MS = (() => {
  const raw = process.env.LOOP_HARNESS_INIT_TIMEOUT_MS;
  if (!raw) return 120000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 120000;
})();

/**
 * 判据 5 要执行的 init.sh，是否正是**当前这次运行所处的**那一个。
 *
 * 判据 5 会执行被审计仓库的 init.sh。若该 init.sh 的内容又会拉起
 * harness-stage 审计自己（源仓库的 init.sh 就是这么写的），判据就变成了
 * 自引用：执行 → 递归 → 执行 → …… 实测套到 9 层、69 次 120s 超时。
 *
 * 两个独立的判据，命中任一即视为自引用：
 *   1. 正在执行的 init.sh 在本次运行开始时导出了 LOOP_HARNESS_ACTIVE_INIT；
 *   2. 目标 root 就是本脚本所在的 pack 根目录 —— 即便 init.sh 是手写的。
 */
export function detectSelfReference(root) {
  const selfInit = path.join(root, 'init.sh');
  const active = process.env.LOOP_HARNESS_ACTIVE_INIT;
  if (active && samePath(active, selfInit)) {
    return { self: true, reason: `自引用：判据要执行的正是当前正在运行的 ${path.basename(active)}（由 LOOP_HARNESS_ACTIVE_INIT 标记）——记为 NOT RUN 以避免无限递归` };
  }
  if (samePath(root, PACK_ROOT)) {
    return { self: true, reason: '自引用：目标就是 harness 包自身的仓库，其 init.sh 会再次调用 harness-stage.mjs——记为 NOT RUN 以避免无限递归' };
  }
  return { self: false, reason: null };
}

/** 去掉 HTML 注释，避免把模板里的示例当成真实内容 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

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
 * 模板里预置的拒绝列表路径（用于判断用户是否本地化过）。
 * 必须与 templates/loop-constraints.md 逐条一致——否则模板自己会被判成"已本地化"。
 * 测试断言模板是仓库列表的子集，且仓库至少多 2 条。
 */
const TEMPLATE_DENYLIST = [
  '.env', '.env.*', '**/secrets/**', '**/credentials/**',
  '**/*_key*', '**/*_secret*', '.terraform/**', 'k8s/production/**',
  '**/migrations/**', 'auth/**', 'payments/**', 'billing/**',
  'harness-constraints.md', 'loop-constraints.md',
  'scripts/gate-check.mjs', 'scripts/ledger-check.mjs',
  'scripts/lib/common.mjs', '.github/workflows/**', 'package.json',
  'package-lock.json', 'templates/**',
];

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

/**
 * AGENTS.md 是否声明了工作规则。
 *
 * 判据读的是正文里那几条不变式，而不是文件是否存在。
 */
function agentsDeclaresWorkRules(root) {
  const text = readText(path.join(root, 'AGENTS.md')) || readText(path.join(root, 'CLAUDE.md'));
  if (!text) return { declared: false, reason: 'AGENTS.md / CLAUDE.md 都不存在' };

  const body = stripHtmlComments(text);
  const rules = [
    { re: /一次只做一个|one (work )?item at a time|恰好一个/i, label: '一次只做一个 work item' },
    { re: /不得宣称完成|不跑验证|before claim|verification.*required|must run.*(test|verification)/i, label: '不跑验证不得宣称完成' },
    { re: /完成定义|definition of done|DoD/i, label: '完成定义' },
  ];
  const missing = rules.filter((r) => !r.re.test(body)).map((r) => r.label);
  if (missing.length) {
    return { declared: false, reason: `AGENTS.md 正文缺少工作规则：${missing.join('、')}` };
  }
  return { declared: true, reason: null };
}

/**
 * feature_list.json 的每条 feature 是否有可判定的完成标准。
 *
 * 占位特征的判法：
 *   1. 没有 verification 字段，或它不是非空数组
 *   2. verification 步骤是元指令（"替换为…"/"描述…"）而不是可执行的检查
 *   3. notes 里自称占位符
 * 注意 notes 用"以占位开头"而不是子串匹配：一句"非占位符"的说明不该触发它。
 */
function featuresHaveAcceptance(root) {
  const fl = readJson(path.join(root, 'feature_list.json'));
  if (!fl || !Array.isArray(fl.features) || !fl.features.length) {
    return { ok: false, reason: 'feature_list.json 不存在或 features 为空' };
  }

  const metaDirective = /^\s*(replace|描述|填写|待补|todo|tbd|placeholder|替换|xxx)/i;
  const loose = fl.features.filter((f) => {
    const title = String(f?.title || f?.name || '');
    const ver = f?.verification;
    const notes = String(f?.notes || '');

    if (/^\s*(占位|placeholder)/i.test(notes)) return true;
    if (metaDirective.test(title)) return true;

    if (!Array.isArray(ver) || !ver.length) return true;

    const steps = ver.map((s) => String(s).trim()).filter(Boolean);
    if (!steps.length) return true;
    if (steps.every((s) => metaDirective.test(s))) return true;

    if (!String(f?.user_visible_behavior || '').trim()) return true;

    return false;
  });

  if (loose.length) {
    const names = loose.slice(0, 2).map((f) => f?.title || f?.name || '(无名)').join('、');
    return {
      ok: false,
      reason: `${loose.length}/${fl.features.length} 条 feature 的完成标准不可判定`
        + `（如：${names}）——占位 feature 不算"有完成标准"`,
    };
  }
  return { ok: true, reason: null };
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

/** 阶段 1 判据。`opts.self` 见 detectSelfReference。 */
function checkStage1(root, opts = {}) {
  const c = [];
  const add = (label, ok, evidence, action, extra = {}) =>
    c.push({ label, ok: ok === null ? null : Boolean(ok), evidence, action, ...(extra.notRun ? { notRun: true } : {}) });

  const instr = hasFile(root, 'AGENTS.md') || hasFile(root, 'CLAUDE.md');
  add('指令文件存在（AGENTS.md / CLAUDE.md）', instr,
    instr ? null : '两者都不存在',
    '复制 templates/AGENTS.md，替换占位符');

  const fa = featuresHaveAcceptance(root);
  add('功能清单存在且每条 feature 有可判定的完成标准', fa.ok, fa.reason,
    '编辑 feature_list.json：把占位 feature 换成真实功能，写明怎么算完成');

  add('状态文件存在（STATE.md）', hasFile(root, 'STATE.md'),
    hasFile(root, 'STATE.md') ? null : 'STATE.md 不存在',
    '复制 templates/STATE.md');

  const selfRef = opts.self ? { self: true, reason: 'SELF-MODE：init.sh 会回调 harness-stage，不执行（递归）' }
    : detectSelfReference(root);
  const ph = initScriptHasPlaceholder(root);
  // 自引用时不能执行 init.sh（会递归），但"语法正确"仍是机械可判的：
  // 从"NOT RUN"升级成 `bash -n`，让包自身也有一条真正跑过的判据。
  const syntaxOk = (() => {
    const r = runWithTreeKill('bash', ['-n', path.join(root, 'init.sh')], { cwd: root, timeoutMs: 30000 });
    if (r.ok) return { ok: true, reason: null };
    // 没有 bash 是环境缺失，不是脚本错误：记为 NOT RUN，不伪装成失败。
    if (r.spawnFailed) return { ok: null, notRun: true, reason: `无法执行 bash -n：${(r.stderr || '').trim().slice(0, 160)}` };
    return { ok: false, reason: `bash -n init.sh 失败：${(r.stderr || '').trim().slice(0, 200)}` };
  })();
  const runnable = ph.placeholder
    ? { ok: false, reason: ph.reason }
    : selfRef.self
      // 自动识别到自引用时（没有 --self）保持三态里的 NOT RUN：执行者没有要求
      // 走 self 模式，不能替它把一条没跑的判据升级成 PASS。
      ? (opts.self ? { ...syntaxOk, notRun: false, selfMode: true }
        : { ok: null, notRun: true, reason: selfRef.reason })
      : (() => {
        const initPath = path.join(root, 'init.sh');
        const r = runWithTreeKill('bash', [initPath], {
          cwd: root, timeoutMs: INIT_TIMEOUT_MS,
          env: { LOOP_HARNESS_ACTIVE_INIT: initPath },
        });
        if (r.ok) return { ok: true, reason: null };

        const out = `${r.stdout}${r.stderr}`;
        if (r.timedOut) {
          const secs = Math.round(INIT_TIMEOUT_MS / 1000);
          return { ok: false, notRun: true, reason: `init.sh 超过 ${secs}s 未结束（超时被杀，整棵树）——未跑完，不判定通过或失败` };
        }
        if (r.spawnFailed) {
          return { ok: false, notRun: true, reason: `无法执行 init.sh（bash 不可用或脚本不存在）：${(r.stderr || out || '').trim().slice(0, 160)}` };
        }
        const treeNote = r.treeKill ? '' : '（注意：本平台无 GNU timeout，孙进程可能未被回收）';
        return { ok: false, reason: `init.sh 退出码 ${r.status}——启动路径跑不通：${out.trim().slice(0, 200)}${treeNote}` };
      })();
  add(runnable.selfMode ? 'init.sh 存在且语法正确（SELF-MODE：不执行，避免递归）' : 'init.sh 存在、可执行且真的能跑通',
    !ph.placeholder && runnable.ok,
    runnable.ok ? null : runnable.reason,
    runnable.notRun
      ? '这一项没跑完（见 evidence）。在消费方仓库上重跑，或修掉自引用后重试'
      : '运行 bash init.sh 直到退出码 0；脚本是会话启动路径，跑不通等于没有验证',
    { notRun: Boolean(runnable.notRun) });

  const wr = agentsDeclaresWorkRules(root);
  add('指令文件声明了工作规则（一次一个 item / 不验证不宣称完成 / 完成定义）', wr.declared,
    wr.declared ? null : wr.reason,
    '在 AGENTS.md 的「工作规则」章节写明这三条不变式');

  add('约束文件存在（harness-constraints.md：拒绝列表与闸门）', hasFile(root, 'harness-constraints.md'), null,
    '复制 templates/harness-constraints.md。阶段 1 就要有底线：没有拒绝列表意味着 agent 可以编辑 .env');

  add('错题本存在（LESSONS.md）', hasFile(root, 'LESSONS.md'), null,
    '复制 templates/LESSONS.md。没有它，返工不会被记录，经验无法转正');

  return c;
}

/** 阶段 2 判据。`opts.self` 见 detectSelfReference。 */
function checkStage2(root, opts = {}) {
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
    '运行 node scripts/install-skills.mjs --target .');

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
    '运行 node scripts/drill-check.mjs --record，然后提交 loop-drill.json');

  add('回退测试被实际执行过（需人工确认）', null,
    '至少有一次：新测试在修复前的代码上真的挂掉，且失败信息指出了错误的行为。'
    + '把那次运行的命令与输出记进 STATE.md，作为证据',
    '没做过 → 找一次真实修复，补做回退测试并记录输出', true);

  add('NOT RUN 声明被实际使用过（需人工确认）', null,
    '至少有一份验证报告把没跑的检查列为 NOT RUN（而不是省略）。把该报告记进 STATE.md',
    '没做过 → 下一次验证时明确列出未跑的检查', true);

  return c;
}

/** 判据函数接受 (root, opts)；opts.self 表示目标就是 pack 自身。 */
export const STAGE_CHECKS = { 1: checkStage1, 2: checkStage2 };

// ---------------------------------------------------------------- 阶段检测

/**
 * 返回某阶段是否达成。
 *
 * 人工项不参与（它们不是机械判据），NOT RUN（ok === null）也**不**算达成：
 * "没跑"与"通过"必须可区分，否则跳过的判据会静默变成绿灯。
 */
export function stageComplete(stageId, root, memo, opts = {}) {
  const checks = memo ? memo.get(stageId) : STAGE_CHECKS[stageId](root, opts);
  return checks.filter((c) => !c.human && !c.na).every((c) => c.ok === true);
}

/** 检测当前处于哪个阶段（已完成的最高阶段） */
export function detectStage(root, memo) {
  let current = 0;
  for (const s of STAGES) {
    if (stageComplete(s.id, root, memo)) current = s.id;
    else break;
  }
  return current;
}

/**
 * 阶段判据缓存。
 *
 * 判据 4 会真的执行 init.sh；checksByStage、detectStage、JSON 输出各调一次
 * 就是执行三遍（实测一个挂起的脚本因此耗时 6 分钟）。同一进程内算一次就够。
 */
function memoStageChecks(root, opts = {}) {
  const cache = {};
  return {
    get(id) {
      if (!cache[id]) cache[id] = STAGE_CHECKS[id](root, opts);
      return cache[id];
    },
  };
}

// ---------------------------------------------------------------- 升级（补齐文件）

/**
 * 阶段 1 产出 harness 地基。loop 机制（账本、运行日志）属于阶段 2。
 *
 * `loop-constraints.md` 在阶段 1 就要有：它是 agent 的行为底线（拒绝列表 +
 * loop-pause-all 紧急刹车），不是 loop 运行机制。阶段 2 判据才要求它本地化。
 */
const STAGE1_FILES = [
  ['AGENTS.md', 'AGENTS.md'],
  ['feature_list.json', 'feature_list.json'],
  ['STATE.md', 'STATE.md'],
  ['LESSONS.md', 'LESSONS.md'],
  // 约束拆两层：阶段 1 只有 harness 底线，阶段 2 追加 loop 规则。
  ['harness-constraints.md', 'harness-constraints.md'],
  // 验证者报告的格式模板：没有它，独立验证只能靠人即兴发挥，
  // 而闸门要求的 Author / Reviewed commit / 输出片段就无从对齐。
  ['verifier-report.md', 'verifier-report.md'],
];

/** 阶段 2 产出 loop 机制文档。账本在 upgrade() 里单独创建。 */
const STAGE2_FILES = [
  ['loop-run-log.md', 'loop-run-log.md'],
  ['loop-constraints.md', 'loop-constraints.md'],
];

/** 技能安装目录：两个宿主路径都装（Claude Code 与跨 agent 约定）。 */
const SKILL_DEST_DIRS = [path.join('.claude', 'skills'), path.join('.agents', 'skills')];

/**
 * 复制**整个技能目录**，不只是 SKILL.md。
 *
 * 技能目录现在自带 scripts/ 与 templates/（由 sync-skills.mjs 生成），
 * 这样 `npx skills add` 只复制目录也能得到可运行的技能。只复制 SKILL.md
 * 时，装好的技能每条 `node scripts/x.mjs` 都指向不存在的路径。
 *
 * 覆盖规则只有两条，且都由 `--force` 决定：
 *   目标不存在            → 写入
 *   目标已存在 + --force  → 整体替换（先删再复制，避免旧版本残留的死文件）
 *   目标已存在 + 无 force → 跳过
 *
 * 旧实现只看 `SKILL.md` 是否存在：`--force` 对它完全无效（用户改了已装技能
 * 想刷新刷不动），而目录部分存在时 `cpSync` 又会把文件混进用户的目录里
 * （没带 --force 却覆盖了用户的 scripts/）。两个方向都反了。
 */
function copySkillDir(name, target, force, results) {
  const src = path.join(SKILLS_DIR, name);
  if (!exists(path.join(src, 'SKILL.md'))) return;
  for (const destDir of SKILL_DEST_DIRS) {
    const dest = path.join(target, destDir, name);
    if (exists(dest)) {
      if (!force) {
        results.push({ status: 'skipped', path: dest });
        continue;
      }
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.cpSync(src, dest, { recursive: true });
    results.push({ status: 'written', path: dest });
  }
}

/**
 * 写安装清单。
 *
 * 消费方仓库不复制 harness-stage.mjs（它是 pack 级工具），而技能要用它做
 * 前置检查与验证。技能从这份清单读 packRoot。清单是定位信息，不是技能副本，
 * 所以即使技能已存在（skipped）也要写。
 */
function writeInstallManifest(target, results) {
  for (const destDir of SKILL_DEST_DIRS) {
    const dest = path.join(target, destDir, INSTALL_MANIFEST);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify({
      installedAt: new Date().toISOString(),
      packRoot: PACK_ROOT,
      packVersion: PACK_VERSION,
      scope: 'workspace',
      layout: 'both',
      skills: ['harness-init', 'harness-loop-init', 'harness-loop', 'harness-loop-issue'],
    }, null, 2) + '\n', 'utf8');
    results.push({ status: 'written', path: dest });
  }
}

/**
 * 把运行层脚本复制进目标仓库。
 *
 * 技能命令都写 `node scripts/xxx.mjs` 并隐含 cwd = 项目根，少了这一步，
 * 新项目里每条命令都是 ERR_MODULE_NOT_FOUND。
 *
 * 不复制：`test.mjs`（源仓库自检套件）、`install-skills.mjs` 与
 * `harness-stage.mjs`（装配工具，依赖 pack 内的 templates/ 与 skills/）。
 */
const RUNTIME_SCRIPTS = ['gate-check.mjs', 'ledger-check.mjs', 'drill-check.mjs', 'clean-state.mjs', 'worktree.mjs', 'state-write.mjs', 'state-commit.mjs'];

function copyRuntimeScripts(root, force, results) {
  const packScripts = path.join(PACK_ROOT, 'scripts');
  const destDir = path.join(root, 'scripts');
  const libDest = path.join(destDir, 'lib');
  fs.mkdirSync(libDest, { recursive: true });
  for (const f of RUNTIME_SCRIPTS) {
    const src = path.join(packScripts, f);
    if (!exists(src)) continue;
    const dest = path.join(destDir, f);
    if (!force && exists(dest)) {
      results.push({ status: 'skipped', path: dest });
      continue;
    }
    fs.copyFileSync(src, dest);
    results.push({ status: 'written', path: dest });
  }
  const libSrc = path.join(packScripts, 'lib', 'common.mjs');
  if (exists(libSrc)) {
    const dest = path.join(libDest, 'common.mjs');
    if (force || !exists(dest)) {
      fs.copyFileSync(libSrc, dest);
      results.push({ status: 'written', path: dest });
    } else {
      results.push({ status: 'skipped', path: dest });
    }
  }
}

function upgrade(root, targetStage, force, results, opts = {}) {
  const commands = Array.isArray(opts.commands) && opts.commands.length
    ? opts.commands
    : verificationCommands(detectProject(root), opts.packageManager ?? null);

  if (targetStage >= 1) {
    for (const [tpl, out] of STAGE1_FILES) {
      const replacements = out === 'AGENTS.md'
        ? {
            PROJECT_PURPOSE: 'Project harness for reliable agent-assisted development.',
            PRIMARY_VERIFICATION_COMMAND: './init.sh',
            VERIFICATION_COMMANDS: commands.map((c) => `- \`${c}\``).join('\n'),
          }
        : out === 'feature_list.json'
          ? { PROJECT_NAME: path.basename(root), DATE: new Date().toISOString().slice(0, 10) }
          : {};
      results.push(copyTemplate(tpl, path.join(root, out), replacements, { force }));
    }
    // 启动脚本由脚本生成
    const initPath = path.join(root, 'init.sh');
    if (force || !exists(initPath)) {
      const script = initScriptFromCommands(commands);
      fs.writeFileSync(initPath, script, 'utf8');
      try { fs.chmodSync(initPath, 0o755); } catch { /* Windows */ }
      results.push({ status: 'written', path: initPath });
    } else {
      results.push({ status: 'skipped', path: initPath });
    }

    for (const s of ['harness-init', 'harness-loop-init', 'harness-loop', 'harness-loop-issue']) {
      copySkillDir(s, root, force, results);
    }
    writeInstallManifest(root, results);
    copyRuntimeScripts(root, force, results);
  }

  if (targetStage >= 2) {
    for (const tpl of STAGE2_FILES) {
      results.push(copyTemplate(tpl[0], path.join(root, tpl[1]), {}, { force }));
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
}

// ---------------------------------------------------------------- 输出

function renderReport(root, current, checksByStage, memo) {
  const lines = [];
  const next = STAGES.find((s) => s.id === current + 1);
  lines.push(`harness-loop v${PACK_VERSION} — Harness Stage Report — ${root}`);
  lines.push('');
  lines.push(`Current stage: ${current === 0 ? '0（尚无 harness）' : `${current} ${STAGES[current - 1].name}`}`);
  lines.push(`Next stage:    ${next ? `${next.id} ${next.name}（${next.en}）` : '— 已完成全部两个阶段'}`);
  lines.push('');

  for (const stage of STAGES) {
    const checks = checksByStage[stage.id];
    const mechanical = checks.filter((c) => !c.human && !c.na);
    const done = mechanical.filter((c) => c.ok === true).length;
    const state = stageComplete(stage.id, root, memo) ? 'COMPLETE' : (current + 1 === stage.id ? 'IN PROGRESS' : 'NOT STARTED');
    lines.push(`── 阶段 ${stage.id} · ${stage.name}（${stage.en}） [${state}] ${done}/${mechanical.length}`);
    lines.push(`   目标：${stage.goal}`);
    lines.push(`   对应等级：${stage.level}`);
    for (const c of checks) {
      // 三态：PASS / FAIL / NOT RUN。没跑的检查必须显式列出来。
      // 三态：PASS / FAIL / NOT RUN。ok === null 是 NOT RUN，不是 PASS。
      const mark = c.human ? 'HUMAN' : c.na ? 'N/A  ' : (c.ok === true ? 'PASS ' : (c.ok === null || c.notRun ? 'NOT RUN' : 'FAIL '));
      lines.push(`   ${mark}  ${c.label}`);
      if (!c.human && !c.ok) {
        if (c.evidence) lines.push(`          evidence: ${c.evidence}`);
        if (c.action) lines.push(`          action:   ${c.action}`);
      }
      if (c.human) lines.push(`          how: ${c.evidence}`);
    }
    lines.push(`   依据：${stage.grounding[0]}`);
    lines.push('');
  }

  if (next) {
    lines.push('下一步：');
    lines.push(`  node scripts/harness-stage.mjs ${root} --upgrade --stage ${next.id}`);
    lines.push(`  然后运行 /${next.id === 1 ? 'harness-init' : 'harness-loop-init'}`);
  } else {
    lines.push('两个阶段全部达成。后续维护：跑 /harness-loop，返工时在 LESSONS.md 记一行。');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`harness-stage — drive a project through the two harness stages

Stage 1 初始化 (Init)        create the 6 foundation files
Stage 2 装配 loop 机制 (Loop Init)  install the ledger, run log, and verifier entry

Usage:
  node scripts/harness-stage.mjs [target]                 detect stage + report gaps
  node scripts/harness-stage.mjs . --stage 2 --require    validate stage 2 (CI gate)
  node scripts/harness-stage.mjs . --upgrade --stage 2    scaffold what stage 2 needs
  node scripts/harness-stage.mjs . --json

Options:
  --stage <n>     Target stage for --require / --upgrade (1|2)
  --require       Exit 2 if the target stage is not met
  --upgrade       Scaffold files and skills the target stage needs
  --force         Overwrite existing files during --upgrade
  --commands "a,b"  Override the verification commands (comma separated).
                    Auto-detection guesses wrong on mixed stacks; a wrong guess
                    means the stage-1 criterion that actually runs the startup
                    script fails for the wrong reason.
  --package-manager PM   Force npm|pnpm|yarn|bun instead of auto-detecting
  --self          Target is the harness pack itself: init.sh is syntax-checked
                  instead of run (it would recurse), and the denylist-localization
                  criterion is N/A because the pack is the template source.
  --json          JSON output
  --help          Show this help

Exit codes:
  0  report mode, or --require and the stage is met
  2  --require and the stage is not met
`);
    return;
  }

  const root = path.resolve(typeof args._[0] === 'string' ? args._[0] : '.');
  if (!exists(root)) fail(`target not found: ${root}`);

  // --self 只在目标确实是 pack 自身时生效：否则它会变成"跳过判据"的开关。
  const selfMode = Boolean(args.self);
  if (selfMode && !exists(path.join(root, 'scripts', 'harness-stage.mjs'))
    && !samePath(root, PACK_ROOT)) {
    fail('--self only applies to the harness pack itself (no scripts/harness-stage.mjs here)', 1);
  }

  // 判据只算一次：判据 4 会真的执行 init.sh，重复计算 = 重复执行。
  const memo = memoStageChecks(root, { self: selfMode });
  const checksByStage = {};
  for (const s of STAGES) checksByStage[s.id] = memo.get(s.id);
  const current = detectStage(root, memo);

  const targetStage = args.stage !== undefined ? Number(args.stage) : null;
  if (targetStage !== null && ![1, 2].includes(targetStage)) {
    fail(`--stage must be 1 or 2 (got: ${args.stage})`);
  }

  const explicitCommands = typeof args.commands === 'string'
    ? args.commands.split(',').map((s) => s.trim()).filter(Boolean)
    : null;
  const explicitPm = typeof args.packageManager === 'string' ? args.packageManager : null;
  if (explicitPm && !['npm', 'pnpm', 'yarn', 'bun'].includes(explicitPm)) {
    fail(`--package-manager must be npm, pnpm, yarn, or bun (got: ${explicitPm})`);
  }
  if (args.commands !== undefined && explicitCommands && !explicitCommands.length) {
    fail('--commands was given but contains no usable command');
  }

  if (args.upgrade) {
    const to = targetStage ?? Math.min(2, current + 1);

    // 跳级保护：前一阶段未达成时拒绝写入，除非 --force。
    if (to > 1 && !args.force) {
      const unmet = [];
      for (let s = 1; s < to; s++) {
        const checks = checksByStage[s] || [];
        // NOT RUN 不算达成：跳级保护的输入必须是"确实跑过且通过"。
        if (!checks.every((c) => c.ok === true || c.human || c.na)) unmet.push(s);
      }
      if (unmet.length) {
        process.stderr.write(
          `error: cannot upgrade to stage ${to}: stage ${unmet.join(', ')} not complete.\n`
          + `       Run: node scripts/harness-stage.mjs ${root} --upgrade --stage ${unmet[0]}\n`
          + `       Override (not recommended): add --force\n`);
        process.exit(2);
      }
    }

    const results = [];
    upgrade(root, to, Boolean(args.force), results,
      { commands: explicitCommands, packageManager: explicitPm });
    const written = results.filter((r) => r.status === 'written').length;
    process.stdout.write(`Upgraded harness to stage ${to} in ${root}\n`);
    process.stdout.write(`  written: ${written}, skipped: ${results.length - written}\n\n`);
    for (const r of results) {
      process.stdout.write(`  ${r.status === 'written' ? 'WRITTEN' : 'SKIPPED (exists)'}  ${path.relative(root, r.path).split(path.sep).join('/')}\n`);
    }
    process.stdout.write(`\nRe-run without --upgrade to see the updated stage report.\n`);
    return;
  }

  if (args.json) {
    printJson({
      root,
      current_stage: current,
      stages: STAGES.map((s) => ({
        id: s.id, name: s.name, en: s.en, goal: s.goal, level: s.level,
        complete: stageComplete(s.id, root, memo),
        checks: checksByStage[s.id],
      })),
    });
  } else {
    process.stdout.write(renderReport(root, current, checksByStage, memo));
  }

  if (args.require && targetStage !== null) {
    process.exit(stageComplete(targetStage, root, memo) ? 0 : 2);
  }
  process.exit(0);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
