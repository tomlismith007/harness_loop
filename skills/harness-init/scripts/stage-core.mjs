#!/usr/bin/env node
/**
 * stage-core.mjs — 两阶段驱动器的共享底座
 *
 * 这里只放**与阶段无关**的东西：阶段元数据、判据结果的判定规则、报告渲染、
 * 技能目录复制。任何只属于某个阶段的检查或补齐逻辑都不在这里——否则
 * 按 import 图分发时，那个阶段又会被拖进另一个阶段的技能。
 *
 * 依赖方向：harness-stage → stage1 / stage2 → stage-core → lib/common。
 * 反向依赖一律不允许。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  exists, readText, copyTemplate, PACK_ROOT, PACK_VERSION,
  SKILLS_DIR, INSTALL_MANIFEST, samePath,
} from './lib/common.mjs';

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

// ---------------------------------------------------------------- 判据原语

/**
 * 文件"存在"必须是有内容的。空文件、只有空白、只有 HTML 注释，都不算——
 * `touch` 不是装配。模板自带注释，所以先剥注释再判空。
 */
export function hasFile(root, name) {
  const p = path.join(root, name);
  if (!exists(p)) return false;
  return stripHtmlComments(readText(p)).trim().length > 0;
}

/** 去掉 HTML 注释，避免把模板里的示例当成真实内容 */
export function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * init.sh 里是否还有占位符（未替换为真实命令）。
 *
 * 两个阶段都判它：阶段 1 判"启动路径能跑"，阶段 2 判"命令是真的"。
 * 放在这里而不是复制两份——两份实现必然漂移。
 */
export function initScriptHasPlaceholder(root) {
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
 * 判据是否达成。人工项与 N/A 不参与；NOT RUN（ok === null）也**不**算达成：
 * "没跑"与"通过"必须可区分，否则跳过的判据会静默变成绿灯。
 */
export function stageComplete(checks) {
  return checks.filter((c) => !c.human && !c.na).every((c) => c.ok === true);
}

/** 检测当前处于哪个阶段（已完成的最高阶段） */
export function detectStage(checksByStage) {
  let current = 0;
  for (const s of STAGES) {
    if (stageComplete(checksByStage[s.id])) current = s.id;
    else break;
  }
  return current;
}

// ---------------------------------------------------------------- 技能安装

/** 技能安装目录：两个宿主路径都装（Claude Code 与跨 agent 约定）。 */
const SKILL_DEST_DIRS = [path.join('.claude', 'skills'), path.join('.agents', 'skills')];

/**
 * 技能源目录。
 *
 * 两种布局都要支持：
 *   pack 仓库       <PACK_ROOT>/skills/<name>
 *   装好的技能      <宿主>/skills/<name>——此时 PACK_ROOT 就是某一个技能目录，
 *                   兄弟技能在它的上一层。
 * 从技能目录跑装配器是 SKILL.md 的首选路径，所以兄弟查找不是可选优化。
 */
function skillSourceDir(name) {
  const inPack = path.join(SKILLS_DIR, name);
  if (exists(path.join(inPack, 'SKILL.md'))) return inPack;
  const sibling = path.join(path.dirname(PACK_ROOT), name);
  if (exists(path.join(sibling, 'SKILL.md'))) return sibling;
  return null;
}

/**
 * 复制**整个技能目录**，不只是 SKILL.md。
 *
 * 技能目录自带 scripts/ 与 templates/，这样
 * `npx skills add` 只复制目录也能得到可运行的技能。
 *
 * 覆盖规则只有两条，且都由 `--force` 决定：
 *   目标不存在或没有 SKILL.md → 写入（空目录 / 半装目录不算"已安装"）
 *   目标已装 + --force        → 整体替换（先删再复制，避免旧版本残留的死文件）
 *   目标已装 + 无 force        → 跳过
 *
 * 判据是 `SKILL.md` 而不是目录存在：只判目录时，一个空的 `.claude/skills/<name>/`
 * 会让安装静默跳过并报成功，而那个宿主上其实什么都没有。
 */
export function copySkillDir(name, target, force, results) {
  const src = skillSourceDir(name);
  // 静默 return 会让「装配器不在 pack 布局里」报成功却一个技能都没装：
  // 清单写 skills: []，用户以为好了。必须报错，由调用方汇总成非零退出。
  if (!src) {
    results.push({
      status: 'error',
      path: path.join(SKILLS_DIR, name),
      reason: `找不到技能 ${name}。装配器需要同目录下的兄弟技能——`
        + `只装了部分技能时，用 npx skills add <repo> --skill '*' 装齐；`
        + `或在 pack 仓库里运行`,
    });
    return;
  }
  for (const destDir of SKILL_DEST_DIRS) {
    const dest = path.join(target, destDir, name);
    // 源就是目标：从已安装的技能目录装配、且 target 就是该宿主时会发生。
    // `--force` 下先 rmSync 再 cpSync 会把源自己删掉（ENOENT）。
    if (samePath(src, dest)) {
      results.push({ status: 'skipped', path: dest, reason: '源即目标，无需复制' });
      continue;
    }
    if (exists(path.join(dest, 'SKILL.md'))) {
      if (!force) {
        results.push({ status: 'skipped', path: dest });
        continue;
      }
      fs.rmSync(dest, { recursive: true, force: true });
    } else if (exists(dest) && fs.readdirSync(dest).length > 0 && !force) {
      // 目标非空但没有 SKILL.md：可能是用户的目录，恰好放了同名脚本。
      // 直接 cpSync 会静默覆盖——旧实现就是这么把用户的 gate-check.mjs 换掉的。
      results.push({
        status: 'skipped',
        path: dest,
        reason: '非空目录且没有 SKILL.md——疑似用户自己的目录；确认后加 --force',
      });
      continue;
    }
    fs.cpSync(src, dest, { recursive: true });
    results.push({ status: 'written', path: dest });
  }
}

/**
 * 写安装清单。
 *
 * 清单是定位信息，不是技能副本，所以即使技能已存在（skipped）也要写。
 *
 * **不写 `packRoot`**：装配器现在住在技能目录里，它算出的"包根"就是自己所在的
 * 技能目录，而不是用户 clone 的那个仓库。写一个错的路径比不写更糟——没有任何
 * 代码读它（技能靠同目录的兄弟技能定位，不靠清单）。
 *
 * `skills` 记的是**该宿主上实际存在的**技能，不是"本包有哪四个"。写死全部
 * 名字时，只装了一个技能的项目会被 install-skills --check 报成"清单记着
 * 已安装，但副本缺失"——一份过度声称的清单比没有清单更难查。
 */
export function writeInstallManifest(target, results) {
  for (const destDir of SKILL_DEST_DIRS) {
    const dir = path.join(target, destDir);
    const dest = path.join(dir, INSTALL_MANIFEST);
    const present = exists(dir)
      ? fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && exists(path.join(dir, e.name, 'SKILL.md')))
        .map((e) => e.name).sort()
      : [];
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify({
      installedAt: new Date().toISOString(),
      packVersion: PACK_VERSION,
      scope: 'workspace',
      layout: 'both',
      skills: present,
    }, null, 2) + '\n', 'utf8');
    results.push({ status: 'written', path: dest });
  }
}

/** 阶段补齐共用的模板复制：占位符替换由调用方给。 */
export function copyStageTemplate(tpl, out, root, replacements, force, results) {
  results.push(copyTemplate(tpl, path.join(root, out), replacements, { force }));
}

/**
 * 跳级保护：`to` 之前的每个阶段都必须**确实跑过且通过**。
 *
 * NOT RUN（ok === null）不算达成——跳级保护的输入必须是"确实跑过且通过"。
 * 返回未达成的阶段号数组。
 */
export function unmetStages(checksByStage, to) {
  const unmet = [];
  for (let s = 1; s < to; s++) {
    const checks = checksByStage[s] || [];
    if (!checks.every((c) => c.ok === true || c.human || c.na)) unmet.push(s);
  }
  return unmet;
}

// ---------------------------------------------------------------- 输出

/** 三态标记：PASS / FAIL / NOT RUN。没跑的检查必须显式列出来。 */
function markOf(c) {
  if (c.human) return 'HUMAN';
  if (c.na) return 'N/A  ';
  if (c.ok === true) return 'PASS ';
  return (c.ok === null || c.notRun) ? 'NOT RUN' : 'FAIL ';
}

export function renderReport(root, current, checksByStage) {
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
    const state = stageComplete(checks) ? 'COMPLETE' : (current + 1 === stage.id ? 'IN PROGRESS' : 'NOT STARTED');
    lines.push(`── 阶段 ${stage.id} · ${stage.name}（${stage.en}） [${state}] ${done}/${mechanical.length}`);
    lines.push(`   目标：${stage.goal}`);
    lines.push(`   对应等级：${stage.level}`);
    for (const c of checks) {
      lines.push(`   ${markOf(c)}  ${c.label}`);
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
    // 用正在运行的这个脚本的路径，消费方仓库里没有 scripts/harness-stage.mjs。
    lines.push(`  node ${process.argv[1]} ${root} --upgrade --stage ${next.id}`);
    lines.push(`  然后运行 /${next.id === 1 ? 'harness-init' : 'harness-loop-init'}`);
  } else {
    lines.push('两个阶段全部达成。后续维护：跑 /harness-loop，返工时在 LESSONS.md 记一行。');
  }
  return lines.join('\n');
}
