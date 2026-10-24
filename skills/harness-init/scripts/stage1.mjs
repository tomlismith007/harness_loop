#!/usr/bin/env node
/**
 * stage1.mjs — 阶段 1（初始化）的判据与补齐
 *
 * 只做阶段 1 的技能（`harness-init`）只带这个文件。阶段 2 的东西一律不进：
 * 按 import 图分发时，"被 import 的文件"就是分发单位。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  exists, readText, readJson, PACK_ROOT, detectProject,
  verificationCommands, initScriptFromCommands, samePath, runWithTreeKill,
} from './lib/common.mjs';
import {
  hasFile, stripHtmlComments, copyStageTemplate, initScriptHasPlaceholder,
  copySkillDir, writeInstallManifest,
} from './stage-core.mjs';

/**
 * 判据 4 执行 init.sh 的超时（毫秒）。
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
 * 判据 4 要执行的 init.sh，是否正是**当前这次运行所处的**那一个。
 *
 * 判据会执行被审计仓库的 init.sh。若该 init.sh 的内容又会拉起 harness-stage
 * 审计自己（源仓库的 init.sh 就是这么写的），判据就变成了自引用：
 * 执行 → 递归 → 执行 → …… 实测套到 9 层、69 次 120s 超时。
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

/** 阶段 1 判据。`opts.self` 见 detectSelfReference。 */
export function checkStage1(root, opts = {}) {
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

// ---------------------------------------------------------------- 升级

/**
 * 阶段 1 产出 harness 地基。loop 机制（账本、运行日志）属于阶段 2。
 */
export const STAGE1_FILES = [
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

/** 阶段 1 的技能：装齐四个，loop 技能在阶段 2 才被检查。 */
const STAGE1_SKILLS = ['harness-init', 'harness-loop-init', 'harness-loop', 'harness-loop-issue'];

/**
 * 补齐阶段 1。
 *
 * `opts.commands` / `opts.packageManager` 覆盖自动探测：混合技术栈上探测会猜错，
 * 而猜错的代价是"真的执行 init.sh"那条判据因为错误的原因失败。
 */
export function upgradeStage1(root, force, results, opts = {}) {
  const commands = Array.isArray(opts.commands) && opts.commands.length
    ? opts.commands
    : verificationCommands(detectProject(root), opts.packageManager ?? null);

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
    copyStageTemplate(tpl, out, root, replacements, force, results);
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

  for (const s of STAGE1_SKILLS) copySkillDir(s, root, force, results);
  writeInstallManifest(root, results);
}

