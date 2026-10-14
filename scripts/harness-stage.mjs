#!/usr/bin/env node
/**
 * harness-stage.mjs — 三阶段 harness 驱动器
 *
 * 阶段 1 初始化：创建必要的 md 文件，让 harness 结构完整
 * 阶段 2 强化：梳理并强化 harness 文件与机制，让验证真的有效
 * 阶段 3 巩固：loop + harness 强化-巩固，让系统自己跑起来并积累经验
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
import { execFileSync } from 'node:child_process';
import {
  parseArgs, exists, readText, readJson, printJson, copyTemplate,
  PACK_ROOT, SKILLS_DIR, SKILL_DIRS, parseDenylistFrom, detectProject, verificationCommands,
  initScriptFromCommands, textHas, structuredText, fail, hasEventWiring,
} from './lib/common.mjs';
import { scoreHarness } from './loop-audit.mjs';

// ---------------------------------------------------------------- 阶段定义

/**
 * 阶段 1 的就绪度下限。
 *
 * 保持 40（与拆分前同值）。实测：空目录跑 --upgrade --stage 1 后得分 56，
 * 留 16 分余量；删掉 loop-constraints.md 会掉到 52，仍在阈值内——但那是判据 7
 * 的职责，评分只是粗筛。
 *
 * 注意这个分数被技能存在性抬高了不少：triage(14) + skills(14) + budgetSkill(2)
 * 共 30 分来自「技能装上了」而非「机制在跑」。阶段 1 与阶段 2 的评分因此高度重叠
 * （阶段 1 已达 56，阶段 2 阈值 58），真正区分两阶段的是 verifier(14)——
 * loop-audit 在没有 verifier 时把 level 封顶在 L1，所以越不过去。
 * 「技能存在 ≠ 机制生效」这条账记在 STATE.md 的 Watch List，另轮处理。
 */
const STAGE1_MIN_SCORE = 40;

export const STAGES = [
  {
    id: 1,
    name: '初始化',
    en: 'Init',
    goal: '创建必要的 md 文件，让 harness 结构完整、下一会话可重启',
    level: 'L1',
    grounding: [
      'LHE 五子系统最小工件：AGENTS.md / feature_list.json / progress.md / STATE.md / init.sh',
      'LHE「给地图不给手册」：AGENTS.md 是路由表，约 100 行',
      'LEC 脚手架产物：STATE.md / feature_list.json / progress.md / LESSONS.md',
      'LEC：第一周只报告，不自动修复',
    ],
  },
  {
    id: 2,
    name: '强化',
    en: 'Strengthen',
    goal: '梳理并强化 harness 文件与机制，让验证真的有效、约束真的被强制执行',
    level: 'L2',
    grounding: [
      'LHE 受控消融测试：一次移除一个子系统，量化哪个最有价值',
      'LHE 完成定义 / 三层终止校验（语法 → 运行时 → 系统级）',
      'LHE 架构规则可执行化 + 面向 agent 的错误信息（what / why / fix）',
      'LEC maker/checker 分离 + denylist + 熔断器（3 / 5 / 10）',
      'magpie：回退测试、未跑必须写明、真机验证',
    ],
  },
  {
    id: 3,
    name: '巩固',
    en: 'Consolidate',
    goal: 'loop + harness 强化-巩固：事件接上、循环跑起来、经验自己积累并转正为规则',
    level: 'L3',
    grounding: [
      'LHE 六原语：automations / worktrees / skills / connectors / sub-agents / external state',
      'LHE 图工程：多循环协调、优先级、共享状态、回滚边',
      'LEC 事件驱动循环 + 多循环优先级表 + acting_on 锁',
      'LEC 成本可观测与预算闸门',
      'magpie 夜审 + LESSONS.md 经验→规则棘轮 + 成本分层门卫',
    ],
  },
];

// ---------------------------------------------------------------- 判据检查

function hasFile(root, name) {
  return exists(path.join(root, name));
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
 * LESSONS.md 是否有真实条目（不是空模板）。
 *
 * 必须排除 HTML 注释里的示例——模板自带 `<!-- 示例：... Seen 1× (2026-10-05) -->`，
 * 直接 grep 会被自己的示例骗过。
 */
function lessonsHasEntries(root) {
  const p = path.join(root, 'LESSONS.md');
  if (!exists(p)) return false;
  const stripped = stripHtmlComments(readText(p));
  // 真实条目含 "Seen N× (日期)"
  return /Seen\s+\d+\s*[×x]\s*\([^)]*\d{4}-\d{2}-\d{2}/.test(stripped);
}

/** 去掉 HTML 注释，避免把模板里的示例当成真实内容 */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * 技能是否装在 agent 实际会扫描的路径下。
 *
 * 只看 `.agents/skills/` 与 `.zcode/skills/` —— `<repo>/skills/` 虽然常被
 * 写成安装目标，但没有任何 agent 会扫描它，装在那里等于没装。
 */
/**
 * 技能是否装在 agent 真的会扫描的路径，且内容不是空壳。
 *
 * 曾经只判断文件存在，于是 verifier 的 SKILL.md 全文写 `lorem ipsum` 也能让
 * `--stage 2 --require` 退出 0。"结构齐备"不等于"跑过"——这里要求正文里
 * 真的写了该技能的核心行为。
 */
function skillInDiscoverablePath(root, skillName, requiredText) {
  // 与 loop-audit 用同一份路径列表（SKILL_DIRS），否则装在 .claude/skills 的技能
  // 在审计里计分、在阶段判据里却报"不在可发现路径"。裸 skills/ 是明知不可发现的。
  const dirs = SKILL_DIRS.filter((d) => d !== 'skills');
  const file = dirs
    .map((d) => path.join(root, d, skillName, 'SKILL.md'))
    .find((p) => exists(p));
  if (!file) return false;
  if (!requiredText) return true;
  // 结构化匹配：模板示例块里的字样不算数
  return textHas(structuredText(readText(file)), requiredText);
}

/** 模板里预置的拒绝列表路径（用于判断用户是否本地化过） */
const TEMPLATE_DENYLIST = [
  '.env', '.env.*', '**/secrets/**', '**/credentials/**',
  '**/*_key*', '**/*_secret*', '.terraform/**', 'k8s/production/**',
  '**/migrations/**', 'auth/**', 'payments/**', 'billing/**',
];

/**
 * 拒绝列表是否已本地化。
 *
 * 单纯 grep「有没有 .env」分不清「确实会保护这个路径」和「抄了模板里那句话」。
 * 判据：与模板原文有实质差异（增删了路径），才说明有人按本仓库调整过。
 */
function denylistLocalized(root) {
  const p = path.join(root, 'loop-constraints.md');
  if (!exists(p)) return { localized: false, reason: 'loop-constraints.md 不存在' };

  // 解析逻辑与 gate-check 的强制执行共用 common.parseDenylistFrom——
  // 曾经这里和强制执行各有一份，是"文档说 A、代码做 B"的来源之一。
  const lines = parseDenylistFrom(readText(p));
  if (!lines.length) {
    return { localized: false, reason: 'Paths 章节没有代码块（拒绝列表为空）' };
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

  return {
    localized: true,
    reason: null,
    added: added.length,
    removed: removed.length,
  };
}

/** 是否接了事件脊（判据复用 scripts/lib/common.mjs 的 hasEventWiring，
 *  与 harness-loop 第 0 步的退出检查读同一份逻辑） */
function eventWiringPresent(root) {
  return hasEventWiring(root).wired;
}

/** 是否声明了多循环协调 */
function hasMultiLoopCoordination(root) {
  const corpus = [
    readText(path.join(root, 'LOOP.md')),
    readText(path.join(root, 'STATE.md')),
    readText(path.join(root, 'docs', '01-event-spine.md')),
  ].join('\n');
  return /acting_on/.test(corpus) && /优先级|priority/i.test(corpus);
}

/**
 * AGENTS.md 是否声明了工作规则。
 *
 * 阶段 1 不产出 LOOP.md（那是阶段 2 的循环注册表），但"agent 该怎么干活"
 * 必须在阶段 1 就写下来——否则新会话启动时读不到任何行为约束。
 * 判据读的是 AGENTS.md 正文里那几条不变式，而不是文件是否存在。
 */
function agentsDeclaresWorkRules(root) {
  const text = readText(path.join(root, 'AGENTS.md')) || readText(path.join(root, 'CLAUDE.md'));
  if (!text) return { declared: false, reason: 'AGENTS.md / CLAUDE.md 都不存在' };

  // 只看正文：模板占位符区块不算数
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
 * 曾经判据只检查"features 是非空数组"——模板出厂就带 3 条占位 feature，
 * 于是"替换占位 feature"这条真正该做的活被判据放过了。
 *
 * 完成的判据字段是 `verification`（模板 schema 用的名字），内容是「怎么验证它
 * 做完了」的步骤。占位特征的判法：
 *   1. 没有 verification 字段，或它不是非空数组
 *   2. verification 步骤是元指令（"替换为…"/"描述…"）而不是可执行的检查
 *   3. notes 里自称占位符
 * 只查"非空数组"会把模板原样放过——那正是这个判据要抓的东西。
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

    // 自称占位符
    if (/占位|placeholder/i.test(notes)) return true;
    if (metaDirective.test(title)) return true;

    // verification 缺失或不是非空数组
    if (!Array.isArray(ver) || !ver.length) return true;

    // verification 步骤全是元指令
    const steps = ver.map((s) => String(s).trim()).filter(Boolean);
    if (!steps.length) return true;
    if (steps.every((s) => metaDirective.test(s))) return true;

    // 缺 user_visible_behavior：说不清用户能观察到什么
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

/** 阶段 1 判据 */
function checkStage1(root, audit) {
  const c = [];
  const add = (label, ok, evidence, action) => c.push({ label, ok: Boolean(ok), evidence, action });

  const instr = hasFile(root, 'AGENTS.md') || hasFile(root, 'CLAUDE.md');
  add('指令文件存在（AGENTS.md / CLAUDE.md）', instr,
    instr ? null : '两者都不存在',
    '复制 templates/AGENTS.md，替换占位符');

  const fa = featuresHaveAcceptance(root);
  add('功能清单存在且每条 feature 有可判定的完成标准', fa.ok,
    fa.ok ? null : fa.reason,
    '编辑 feature_list.json：把占位 feature 换成真实功能，写明怎么算完成');

  add('状态文件存在（STATE.md）', hasFile(root, 'STATE.md'), null, '复制 templates/STATE.md');

  add('会话进度日志存在（progress.md）', hasFile(root, 'progress.md'), null, '复制 templates/progress.md');

  // init.sh 从"非占位符"升级为"真的能跑"：原判据只读文本，
  // 一个写对了格式但命令跑不通的 init.sh 照样拿 PASS——而它是新会话的启动路径。
  const ph = initScriptHasPlaceholder(root);
  const runnable = ph.placeholder ? { ok: false, reason: ph.reason } : (() => {
    const initPath = path.join(root, 'init.sh');
    try {
      execFileSync('bash', [initPath], { cwd: root, encoding: 'utf8', timeout: 120000 });
      return { ok: true, reason: null };
    } catch (e) {
      const out = `${e.stdout || ''}${e.stderr || ''}`;
      // 区分两种失败：bash 本身跑不起来（spawn 层失败），vs bash 起来了但脚本非零退出。
      // 早期版本按 /not found/ 匹配输出，把脚本里的 "command not found"
      // 误报成「bash 不可用」——证据指向了错误的原因。
      const spawnFailed = e.status === null
        || e.code === 'ENOENT'
        || e.code === 'EACCES'
        || /^Error: spawn/i.test(String(e.message || ''));
      if (spawnFailed) {
        return { ok: false, reason: `无法执行 init.sh（bash 不可用或脚本不存在）：${(e.message || out).trim().slice(0, 160)}` };
      }
      return { ok: false, reason: `init.sh 退出码 ${e.status}——启动路径跑不通：${out.trim().slice(0, 200)}` };
    }
  })();
  add('init.sh 存在、可执行且真的能跑通', !ph.placeholder && runnable.ok,
    runnable.ok ? null : runnable.reason,
    '运行 bash init.sh 直到退出码 0；脚本是会话启动路径，跑不通等于没有验证');

  const wr = agentsDeclaresWorkRules(root);
  add('指令文件声明了工作规则（一次一个 item / 不验证不宣称完成 / 完成定义）', wr.declared,
    wr.declared ? null : wr.reason,
    '在 AGENTS.md 的「工作规则」章节写明这三条不变式');

  add('约束文件存在（loop-constraints.md：拒绝列表与闸门）', hasFile(root, 'loop-constraints.md'), null,
    '复制 templates/loop-constraints.md。阶段 1 就要有底线：没有拒绝列表意味着 agent 可以编辑 .env');

  // 就绪度阈值与核心子系统合为一条判据：两者都是"整体够不够"，
  // 拆成两项会让报告看起来比实际更细，实际是同一个判断。
  const subsystems = audit.subsystems || {};
  const coreSub = ['instructions', 'state', 'verification', 'scope'].every((k) => {
    const entries = (subsystems[k] || {}).passed ?? 0;
    const total = (subsystems[k] || {}).total ?? 0;
    return total === 0 ? false : entries > 0;
  });
  const scoreOk = audit.score >= STAGE1_MIN_SCORE;
  add(`核心子系统有最小工件且就绪度评分 ≥ ${STAGE1_MIN_SCORE}（当前 ${audit.score}）`,
    coreSub && scoreOk,
    scoreOk ? (coreSub ? null : `缺失：${Object.entries(subsystems)
      .filter(([k]) => ['instructions', 'state', 'verification', 'scope'].includes(k) && (subsystems[k] || {}).passed === 0)
      .map(([k]) => k).join('、') || '多个'}`) : '先补齐上面失败的项',
    '补齐缺失工件；lifecycle 子系统在阶段 2 才建立入口（loop-budget.md）');

  return c;
}

/** 阶段 2 判据 */
function checkStage2(root, audit) {
  const c = [];
  const add = (label, ok, evidence, action, human = false) =>
    c.push({ label, ok: Boolean(ok), evidence, action, human });

  // ---- 机制就位（机械可判定）----

  const verifier = audit.checks.find((x) => x.key === 'verifier');
  // 要求正文真的写了回退测试与 NOT RUN 三态，否则一个 lorem ipsum 空壳也能算数。
  const verifierDiscoverable = skillInDiscoverablePath(root, 'loop-verifier', ['NOT RUN', '回退测试']);
  add('独立 verifier 已装到可发现路径且写明回退测试', verifier?.ok && verifierDiscoverable,
    verifierDiscoverable ? null
      : exists(path.join(root, 'skills', 'loop-verifier', 'SKILL.md'))
        ? '技能在 <repo>/skills/ —— 没有任何 agent 会扫描这个路径'
        : '未找到 verifier 技能，或其正文没有回退测试 / NOT RUN 的实操描述',
    '运行 node scripts/install-skills.mjs --target . （默认装到 .agents/skills/）');

  const constraintsSkillDiscoverable = skillInDiscoverablePath(root, 'loop-constraints');
  add('约束技能已装到可发现路径（约束被执行）', constraintsSkillDiscoverable,
    constraintsSkillDiscoverable ? null : '约束技能不在 agent 会扫描的目录里，约束只是文档',
    '运行 node scripts/install-skills.mjs --target .');

  const guardDiscoverable = skillInDiscoverablePath(root, 'loop-guard', ['stagnation', 'attempts']);
  const ledger = readJson(path.join(root, 'loop-ledger.json'));
  // 空 attempts 数组 = 从没记过任何一次尝试，正是"熔断器就位"的反面。
  const hasLedger = Boolean(ledger && Array.isArray(ledger.attempts) && ledger.attempts.length > 0);
  add('熔断器就位（loop-guard 技能 + 账本有记录）', guardDiscoverable && hasLedger,
    guardDiscoverable && hasLedger ? null
      : !guardDiscoverable ? 'loop-guard 技能不在可发现路径，或正文没有熔断阈值说明'
        : ledger && Array.isArray(ledger.attempts) && !ledger.attempts.length
          ? 'loop-ledger.json 的 attempts 是空的——熔断器没有任何记录可读'
          : '缺少 loop-ledger.json（熔断器没有账本可读）',
    '运行 node scripts/install-skills.mjs --target . 并在 loop-ledger.json 记录尝试');

  const ph = initScriptHasPlaceholder(root);
  add('验证命令是真实的（无占位符）', !ph.placeholder, ph.reason,
    '编辑 init.sh，把占位命令换成项目实际命令');

  // 拒绝列表必须与模板不同 —— 否则说明只是抄了模板，没有按本仓库调整。
  // 单纯 grep「有没有 .env」分不清「确实会保护」和「有人抄过这句话」。
  const dl = denylistLocalized(root);
  add('拒绝列表已本地化（非模板原文）', dl.localized, dl.reason,
    '按本仓库实际情况增删拒绝路径：加上真实的高危目录，删掉不存在的');

  add(`就绪度评分 ≥ 58（当前 ${audit.score}）`, audit.score >= 58, null, '先补齐上面失败的项');

  // ---- 机制被执行过（无法机械判定，必须人工确认）----
  // 以下三项都是 grep 无法区分「确实会这么做」和「抄过这句话」的，
  // 因此不给机械判定，避免用声明文本冒充行为证据。

  add('回退测试被实际执行过（需人工确认）', null,
    '至少有一次：新测试在修复前的代码上真的挂掉，且失败信息指出了错误的行为。'
    + '把那次运行的命令与输出记进 STATE.md，作为证据',
    '没做过 → 找一次真实修复，补做回退测试并记录输出', true);

  add('NOT RUN 声明被实际使用过（需人工确认）', null,
    '至少有一份验证报告把没跑的检查列为 NOT RUN（而不是省略）。把该报告记进 STATE.md',
    '没做过 → 下一次验证时明确列出未跑的检查', true);

  add('triage 准确率 > 70%（需人工确认）', null,
    '跑满一周 L1 后，把 STATE.md 的判定与你的判断逐条对比，算同意比例',
    '准确率不达标 → 收紧 triage 技能规则，不要进入 L2', true);

  return c;
}

/** 阶段 3 判据 */
function checkStage3(root, audit) {
  const c = [];
  const add = (label, ok, evidence, action, human = false) =>
    c.push({ label, ok: Boolean(ok), evidence, action, human });

  const wiring = hasEventWiring(root);
  add('事件脊已接线', wiring.wired,
    wiring.wired ? null : wiring.detail,
    '复制 examples/github-actions/*.yml，或在平台上配置事件触发');

  const lessons = lessonsHasEntries(root);
  add('LESSONS.md 有真实条目', lessons,
    lessons ? null : '文件存在但没有 Seen N× (日期) 形式的条目',
    '跑一次夜审（lesson-harvest），把当天 commit 的教训写进去');

  const runLog = readText(path.join(root, 'loop-run-log.md'));
  const logSection = runLog.split(/^##\s+Log\s*$/m)[1] ?? '';
  const runs = [...logSection.matchAll(/\{[^{}]*"run_id"[^{}]*\}/g)].length;
  add(`运行日志有真实记录（${runs} 条）`, runs > 0, null,
    '跑完一个完整循环周期，把运行记录追加到 loop-run-log.md');

  add('成本可观测性齐备（预算 + 运行日志 + LOOP.md 预算章节）', audit.costReady,
    audit.costReady ? null : '缺 loop-budget.md 或 loop-run-log.md 或 LOOP.md 的预算章节',
    '补齐预算文档并在 LOOP.md 声明 kill switch');

  add('多循环协调已声明（acting_on + 优先级）', hasMultiLoopCoordination(root), null,
    '在 LOOP.md 加优先级表，在 STATE.md 的 Active 表加 acting_on 列');

  const promoted = (() => {
    const text = stripHtmlComments(readText(path.join(root, 'LESSONS.md')));
    if (!/## Promoted to hard rules/.test(text)) return false;
    // 只看 Promoted 表的数据行，忽略表头与分隔行，也忽略占位符 —
    const section = (text.split('## Promoted to hard rules')[1] || '').split(/^##\s/m)[0];
    return section.split('\n').some((line) => {
      const t = line.trim();
      if (!t.startsWith('|')) return false;
      const cells = t.split('|').map((c) => c.trim()).filter(Boolean);
      if (!cells.length) return false;
      if (/^-+$/.test(cells[0])) return false;
      if (/^规则$|^rule$/i.test(cells[0])) return false;
      if (/^(—|-|none|n\/a)$/i.test(cells[0])) return false;
      return true;
    });
  })();
  add('有教训已转正为硬规则', promoted,
    promoted ? null : '尚无转正记录（Promoted 表只有占位符）',
    '同一条教训在 3 个不同日期出现后，转正进 loop-constraints.md 并在 LESSONS.md 记录');

  add(`就绪度评分 ≥ 78（当前 ${audit.score}）`, audit.score >= 78, null, '先补齐上面失败的项');

  add('至少跑过一个完整循环周期（需人工确认）', null,
    '审计已确认有真实活动；请确认该周期是你认可的完整周期，而非一次试验',
    '观察一周：升级率应稳定且非 0，空转率应 > 70%', true);

  return c;
}

export const STAGE_CHECKS = { 1: checkStage1, 2: checkStage2, 3: checkStage3 };

// ---------------------------------------------------------------- 阶段检测

/** 返回某阶段是否达成（忽略人工确认项） */
export function stageComplete(stageId, root, audit) {
  const checks = STAGE_CHECKS[stageId](root, audit);
  return checks.filter((c) => !c.human).every((c) => c.ok);
}

/** 检测当前处于哪个阶段（已完成的最高阶段） */
export function detectStage(root, audit) {
  let current = 0;
  for (const s of STAGES) {
    if (stageComplete(s.id, root, audit)) current = s.id;
    else break;
  }
  return current;
}

// ---------------------------------------------------------------- 升级（补齐文件）

/**
 * 阶段 1 只产出 harness 地基，不产出 loop 机制文档。
 *
 * loop 机制（LOOP.md / loop-budget.md / loop-run-log.md / session-handoff.md /
 * loop-ledger.json）属于阶段 2 `harness-loop-init`。曾经它们在阶段 1 就被创建，
 * 于是阶段 1 项目在没有 verifier、没有闸门执行力的状态下也能把就绪度评分推高——
 * 声明 ≠ 生效，而这里连声明都还没有就先给了分。
 *
 * `loop-constraints.md` 是唯一例外：它是 agent 的行为底线（拒绝列表 +
 * loop-pause-all 紧急刹车），不是 loop 运行机制。阶段 1 的 agent 已经在写文件，
 * 没有拒绝列表就意味着它可以编辑 .env。阶段 2 判据才要求它按本仓库本地化。
 */
const STAGE1_FILES = [
  ['AGENTS.md', 'AGENTS.md'],
  ['feature_list.json', 'feature_list.json'],
  ['progress.md', 'progress.md'],
  ['STATE.md', 'STATE.md'],
  ['LESSONS.md', 'LESSONS.md'],
  ['loop-constraints.md', 'loop-constraints.md'],
];

/**
 * 阶段 2 产出的 loop 机制文档。
 *
 * 这五个文件是"循环怎么跑"的答案：路由表（LOOP.md）、钱（loop-budget.md）、
 * 跑过的记录（loop-run-log.md）、跨会话接力（session-handoff.md），
 * 外加 upgrade() 里单独创建的账本（loop-ledger.json）。
 */
const STAGE2_FILES = [
  ['LOOP.md', 'LOOP.md'],
  ['loop-budget.md', 'loop-budget.md'],
  ['loop-run-log.md', 'loop-run-log.md'],
  ['session-handoff.md', 'session-handoff.md'],
];

/**
 * 每个阶段的技能。
 *
 * `harness-loop` 不在这里——它是运行时编排，任何阶段都装。它的边界由自己
 * 第 0 步的事件接线检查执行，不靠"到阶段几才装"来实现。
 */
const STAGE1_SKILLS = [
  'harness-init',
  'loop-constraints', 'loop-budget',
  'event-router', 'issue-triage', 'pr-review-triage', 'ci-triage',
];

const STAGE2_SKILLS = ['harness-loop-init', 'loop-guard', 'minimal-fix', 'loop-verifier'];

const STAGE3_SKILLS = [
  'harness-consolidate',
  'lesson-harvest', 'signal-gatekeeper', 'post-merge-cleanup', 'release-drafter',
];

/**
 * 技能安装目录。
 *
 * 必须写进 agent 实际会扫描的路径——`.agents/skills/`（跨 agent 的共享约定）。
 * 写进 `<repo>/skills/` 是个陷阱：文件看起来到位了，但没有任何 agent 会发现它。
 */
const SKILL_DEST_DIR = path.join('.agents', 'skills');

function copySkillDir(name, target, results) {
  const src = path.join(SKILLS_DIR, name, 'SKILL.md');
  if (!exists(src)) return;
  const dest = path.join(target, SKILL_DEST_DIR, name, 'SKILL.md');
  if (exists(dest)) {
    results.push({ status: 'skipped', path: dest });
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  results.push({ status: 'written', path: dest });
}

function upgrade(root, targetStage, force, results, opts = {}) {
  const today = new Date().toISOString().slice(0, 10);
  // 显式覆盖优先于自动检测。自动检测在混合栈或 CI 环境里会猜错，
  // 而猜错的代价是判据 5 发假 PASS——它生成了启动脚本但跑不通。
  const commands = Array.isArray(opts.commands) && opts.commands.length
    ? opts.commands
    : verificationCommands(detectProject(root), opts.packageManager ?? null);

  if (targetStage >= 1) {
    for (const [tpl, out] of STAGE1_FILES) {
      const replacements = out === 'AGENTS.md'
        ? {
            PROJECT_PURPOSE: `Project harness for reliable agent-assisted development.`,
            PRIMARY_VERIFICATION_COMMAND: './init.sh',
            VERIFICATION_COMMANDS: commands.map((c) => `- \`${c}\``).join('\n'),
          }
        : out === 'feature_list.json'
          ? { PROJECT_NAME: path.basename(root), DATE: today }
          : out === 'progress.md'
            ? { DATE: today, TIME: new Date().toISOString().slice(11, 16) }
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

    for (const s of STAGE1_SKILLS) copySkillDir(s, root, results);
    // 运行时编排：任何阶段都装。它的第 0 步会检查事件接线，
    // 没接线就退出并提示先跑阶段 3——所以"装了但跑不了"是有意状态。
    copySkillDir('harness-loop', root, results);
  }

  if (targetStage >= 2) {
    for (const tpl of STAGE2_FILES) {
      results.push(copyTemplate(tpl[0], path.join(root, tpl[1]), {}, { force }));
    }
    // 账本是熔断器的运行时状态，熔断器是阶段 2 机制——阶段 1 不该创建它。
    // 曾经它在阶段 1 就被建出来，于是"阶段 1 装了什么"看起来像有熔断能力。
    const ledgerPath = path.join(root, 'loop-ledger.json');
    if (force || !exists(ledgerPath)) {
      fs.writeFileSync(ledgerPath, JSON.stringify({
        goal: 'Replace with the current loop goal', pattern: 'pr-review-triage', level: 'L2', attempts: [],
      }, null, 2) + '\n', 'utf8');
      results.push({ status: 'written', path: ledgerPath });
    } else {
      results.push({ status: 'skipped', path: ledgerPath });
    }

    for (const s of STAGE2_SKILLS) copySkillDir(s, root, results);
  }

  if (targetStage >= 3) {
    for (const s of STAGE3_SKILLS) copySkillDir(s, root, results);
    // 事件接线
    const wfSrc = path.join(PACK_ROOT, 'examples', 'github-actions');
    const wfDest = path.join(root, '.github', 'workflows');
    if (exists(wfSrc)) {
      fs.mkdirSync(wfDest, { recursive: true });
      for (const f of fs.readdirSync(wfSrc)) {
        if (!f.endsWith('.yml')) continue;
        const dest = path.join(wfDest, f);
        if (!force && exists(dest)) { results.push({ status: 'skipped', path: dest }); continue; }
        fs.copyFileSync(path.join(wfSrc, f), dest);
        results.push({ status: 'written', path: dest });
      }
    }
  }
}

// ---------------------------------------------------------------- 输出

function renderReport(root, audit, current, checksByStage) {
  const lines = [];
  const next = STAGES.find((s) => s.id === current + 1);
  lines.push(`Harness Stage Report — ${root}`);
  lines.push('');
  lines.push(`Current stage: ${current === 0 ? '0（尚无 harness）' : `${current} ${STAGES[current - 1].name}`}`);
  lines.push(`Next stage:    ${next ? `${next.id} ${next.name}（${next.en}）` : '— 已完成全部三阶段'}`);
  lines.push(`Readiness:     ${audit.score}/100 · level ${audit.level}`);
  lines.push('');

  for (const stage of STAGES) {
    const checks = checksByStage[stage.id];
    const mechanical = checks.filter((c) => !c.human);
    const done = mechanical.filter((c) => c.ok).length;
    const state = stageComplete(stage.id, root, audit) ? 'COMPLETE' : (current + 1 === stage.id ? 'IN PROGRESS' : 'NOT STARTED');
    lines.push(`── 阶段 ${stage.id} · ${stage.name}（${stage.en}） [${state}] ${done}/${mechanical.length}`);
    lines.push(`   目标：${stage.goal}`);
    lines.push(`   对应等级：${stage.level}`);
    for (const c of checks) {
      const mark = c.human ? 'HUMAN' : (c.ok ? 'PASS ' : 'FAIL ');
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
    lines.push(`  然后读 docs/11-three-stages.md 的阶段 ${next.id} 章节`);
  } else {
    lines.push('三阶段全部达成。后续维护：夜审持续转正教训，季度做一次消融测试确认组件仍有价值。');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`harness-stage — drive a project through the three harness stages

Stage 1 初始化 (Init)          create the necessary markdown files
Stage 2 强化   (Strengthen)    audit and strengthen the files and mechanisms
Stage 3 巩固   (Consolidate)   wire loops, accumulate lessons, promote rules

Usage:
  node scripts/harness-stage.mjs [target]                 detect stage + report gaps
  node scripts/harness-stage.mjs . --stage 2 --require    validate stage 2 (CI gate)
  node scripts/harness-stage.mjs . --upgrade --stage 2    scaffold what stage 2 needs
  node scripts/harness-stage.mjs . --json

Options:
  --stage <n>     Target stage for --require / --upgrade (1|2|3)
  --require       Exit 2 if the target stage is not met
  --upgrade       Scaffold files and skills the target stage needs
  --force         Overwrite existing files during --upgrade
  --commands "a,b"  Override the verification commands (comma separated).
                    Auto-detection guesses wrong on mixed stacks; a wrong guess
                    means the stage-1 criterion that actually runs the startup
                    script fails for the wrong reason.
  --package-manager PM   Force npm|pnpm|yarn|bun instead of auto-detecting
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

  const audit = scoreHarness(root);
  const checksByStage = {};
  for (const s of STAGES) checksByStage[s.id] = STAGE_CHECKS[s.id](root, audit);
  const current = detectStage(root, audit);

  const targetStage = args.stage !== undefined ? Number(args.stage) : null;
  if (targetStage !== null && ![1, 2, 3].includes(targetStage)) {
    fail(`--stage must be 1, 2, or 3 (got: ${args.stage})`);
  }

  // 验证命令覆盖。自动检测在混合栈/CI 里会猜错，猜错的代价是判据 5 发假 PASS。
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
    const to = targetStage ?? Math.min(3, current + 1);
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
      root, score: audit.score, level: audit.level,
      current_stage: current,
      stages: STAGES.map((s) => ({
        id: s.id, name: s.name, en: s.en, goal: s.goal, level: s.level,
        complete: stageComplete(s.id, root, audit),
        checks: checksByStage[s.id],
      })),
    });
  } else {
    process.stdout.write(renderReport(root, audit, current, checksByStage));
  }

  if (args.require && targetStage !== null) {
    process.exit(stageComplete(targetStage, root, audit) ? 0 : 2);
  }
  process.exit(0);
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
