#!/usr/bin/env node
/**
 * sync-skills.mjs — 把运行时脚本与模板复制进每个技能目录
 *
 * 问题：`npx skills add` 复制的是**整个技能目录**。技能目录里只有 SKILL.md 时，
 * 装完的技能每条 `node scripts/x.mjs` 都指向不存在的路径。
 *
 * 做法：每个技能声明自己的闭包（它真正会调用的脚本 + 模板），本脚本从仓库根的
 * `scripts/` 与 `templates/` 生成副本。根目录是唯一真相源，技能目录是产物。
 *
 * 为什么不是手维护四份：`lib/common.mjs` 会分裂成四个版本，改一处漏三处。
 * `--check` 把"产物与源不一致"变成可机械判定的失败。
 *
 * 用法：
 *   node scripts/sync-skills.mjs            # 生成 / 更新技能目录里的副本
 *   node scripts/sync-skills.mjs --check    # 只校验，不一致退出 1
 *
 * 退出码：0 已同步（或 --check 一致）；1 --check 发现漂移；2 参数错误。
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags, isEntryPoint, PACK_ROOT } from './lib/common.mjs';

const ALL_TEMPLATES = [
  'AGENTS.md', 'feature_list.json', 'STATE.md', 'LESSONS.md',
  'harness-constraints.md', 'verifier-report.md',
  'loop-constraints.md', 'loop-run-log.md',
];

/**
 * `harness-stage` 装配时会把 RUNTIME_SCRIPTS 全部复制进目标仓库，
 * 所以任何**带装配器**的技能都必须自带全套运行时脚本——否则从技能目录
 * 跑 `--upgrade` 时，`copyRuntimeScripts` 只能复制到它自己有的那几个。
 * 这条依赖不是 import 图能推出来的，是 harness-stage 的复制清单决定的。
 */
const SCAFFOLDER_SCRIPTS = [
  'harness-stage.mjs', 'gate-check.mjs', 'ledger-check.mjs', 'drill-check.mjs',
  'clean-state.mjs', 'worktree.mjs', 'state-write.mjs', 'state-commit.mjs',
];

/**
 * 每个技能的闭包。脚本依赖来自 import 图，模板依赖来自该技能实际会跑到的阶段。
 *
 * 两个建设技能都带装配器，所以都拿全套：`/harness-loop-init` 可能被直接
 * 用在阶段 1 的项目上，那一刻它也要能把运行时脚本铺好。
 */
export const SKILL_BUNDLES = {
  'harness-init': {
    scripts: SCAFFOLDER_SCRIPTS,
    templates: ALL_TEMPLATES,
  },
  'harness-loop-init': {
    scripts: SCAFFOLDER_SCRIPTS,
    // 带装配器 = 必须能跑阶段 1：`--upgrade --stage 2` 会在阶段 1 未达成时
    // 让人先跑 `--stage 1`，而阶段 1 要 6 个模板。只带阶段 2 的两个模板时，
    // 缺的那 6 个复制失败、AGENTS.md 根本不会生成。
    templates: ALL_TEMPLATES,
  },
  'harness-loop': {
    scripts: ['gate-check.mjs', 'ledger-check.mjs', 'state-commit.mjs', 'clean-state.mjs', 'worktree.mjs'],
    // 验证者报告的格式写在 SKILL.md 里：这个技能不跑装配器，没有任何代码读模板，
    // 带一份副本只会让"改源忘了同步"多一个可能。
    templates: [],
  },
  'harness-loop-issue': {
    scripts: ['state-write.mjs'],
    templates: [],
  },
};

/** 每个技能都带一份共享库——没有它，任何脚本都 import 不到。 */
const SHARED = [['lib/common.mjs', 'scripts/lib/common.mjs']];

/**
 * 源 → 目标。
 *
 * 目标固定在 `scripts/` 下，与仓库根同名：技能里的 `node scripts/x.mjs` 不用改，
 * 且 `common.mjs` 的 `../..` 在两种布局里都落在"包根"（仓库根 / 技能根）。
 */
function bundleFiles(bundle) {
  return [
    ...bundle.scripts.map((f) => [f, `scripts/${f}`]),
    ...bundle.templates.map((f) => [`../templates/${f}`, `templates/${f}`]),
    ...SHARED,
    ['../VERSION', 'VERSION'],
  ];
}

function syncSkill(skill, bundle, { check }) {
  const srcRoot = path.join(PACK_ROOT, 'scripts');
  const dstRoot = path.join(PACK_ROOT, 'skills', skill);
  const diffs = [];
  const removed = [];
  let written = 0;

  if (!fs.existsSync(dstRoot)) {
    diffs.push(`${skill}: 技能目录不存在`);
    return { diffs, written, removed };
  }

  for (const [srcRel, dstRel] of bundleFiles(bundle)) {
    const src = path.resolve(srcRoot, srcRel);
    const dst = path.join(dstRoot, dstRel);
    const srcText = readText(src);
    if (!srcText) {
      diffs.push(`${skill}: 源文件缺失 ${path.relative(PACK_ROOT, src)}`);
      continue;
    }
    if (check) {
      // 比较用归一化文本：跨平台的 CRLF/LF 差异不该算漂移。
      if (readText(dst) !== srcText) diffs.push(`${skill}: ${dstRel} 与源不一致`);
      continue;
    }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    // 字节复制而不是写回 readText 的结果：后者会把 CRLF 归一成 LF，
    // 副本与源在磁盘上不再一致（git diff 会显示整文件重写）。
    fs.copyFileSync(src, dst);
    written++;
  }

  // 反向：技能目录里多出来的文件也是漂移（删掉的依赖会留下死文件）。
  // 只看 scripts/ 与 templates/——SKILL.md 是手写的，不属于产物。
  //
  // 这些目录是**产物目录**：里面的一切都由本脚本生成。手放进去的文件会被删，
  // 所以删除必须逐条打印——静默删除一个别人的草稿比报错更糟。
  for (const [sub, expected] of [
    ['scripts', new Set(bundle.scripts.concat(['lib/common.mjs']))],
    ['templates', new Set(bundle.templates)],
  ]) {
    const dir = path.join(dstRoot, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of listRel(dir)) {
      if (expected.has(f)) continue;
      if (check) {
        diffs.push(`${skill}: 多余的副本 ${sub}/${f}`);
      } else {
        fs.rmSync(path.join(dir, f), { force: true });
        removed.push(`${skill}: ${sub}/${f}`);
        pruneEmpty(dir);
      }
    }
  }
  return { diffs, written, removed };
}

/** 删掉清空后的目录——一个空的 templates/ 会让"这个技能要模板吗"读不出来。 */
function pruneEmpty(dir) {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch { /* 已经不在 */ }
}

function listRel(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listRel(full, base));
    else if (e.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['check', 'json', 'help'], 'sync-skills');
  if (args.help) {
    process.stdout.write(`sync-skills — copy runtime scripts and templates into each skill directory

Usage:
  node scripts/sync-skills.mjs            # write the copies
  node scripts/sync-skills.mjs --check    # verify, exit 1 on drift

Skills: ${Object.keys(SKILL_BUNDLES).join(', ')}

Exit codes: 0 in sync · 1 drift (--check) · 2 bad arguments
`);
    return;
  }

  const check = Boolean(args.check);
  const diffs = [];
  const removed = [];
  let written = 0;
  for (const [skill, bundle] of Object.entries(SKILL_BUNDLES)) {
    const r = syncSkill(skill, bundle, { check });
    diffs.push(...r.diffs);
    removed.push(...r.removed);
    written += r.written;
  }

  if (args.json) {
    printJson({ check, written, removed, diffs, in_sync: diffs.length === 0 });
  } else if (check) {
    for (const d of diffs) process.stdout.write(`DRIFT  ${d}\n`);
    process.stdout.write(diffs.length
      ? `\n${diffs.length} 处漂移。运行 node scripts/sync-skills.mjs 重新生成。\n`
      : 'All skill bundles match the source.\n');
  } else {
    for (const d of diffs) process.stdout.write(`WARN  ${d}\n`);
    // 产物目录里的意外文件会被删——逐条打印，不静默。
    for (const r of removed) process.stdout.write(`REMOVED  ${r}（不在闭包里，产物目录只放生成物）\n`);
    process.stdout.write(`Synced ${written} file(s) into ${Object.keys(SKILL_BUNDLES).length} skill(s).\n`);
  }

  process.exit(check && diffs.length ? 1 : 0);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
