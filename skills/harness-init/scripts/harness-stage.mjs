#!/usr/bin/env node
/**
 * harness-stage.mjs — 两阶段 harness 驱动器（CLI 与分派）
 *
 * 阶段 1 初始化：创建 6 个模板文件与生成的 init.sh，让 harness 结构完整、下一会话可重启
 * 阶段 2 装配 loop 机制：装账本、运行日志、熔断与独立验证的入口
 *
 * 判据与补齐逻辑按阶段拆开，本文件只做参数解析、缓存与分派：
 *   stage1.mjs        阶段 1 判据 + 补齐
 *   stage2.mjs        阶段 2 判据 + 补齐
 *   stage-core.mjs    共享原语、报告渲染、技能安装
 *
 * 用法：
 *   node scripts/harness-stage.mjs /path/to/repo              # 检测当前阶段 + 报告差距
 *   node scripts/harness-stage.mjs . --stage 2 --require      # 校验阶段 2 是否达成（CI 用）
 *   node scripts/harness-stage.mjs . --upgrade                # 补齐下一阶段缺失的文件
 *   node scripts/harness-stage.mjs . --json
 *
 * 退出码：
 *   0  报告模式，或 --require 且目标阶段已达成
 *   1  参数错误 / 补齐时有文件写不出来
 *   2  --require 但目标阶段未达成，或跳级保护拒绝写入
 */

import path from 'node:path';
import { parseArgs, exists, printJson, PACK_ROOT, fail, samePath, isEntryPoint } from './lib/common.mjs';
import {
  STAGES, stageComplete, detectStage, renderReport, unmetStages,
} from './stage-core.mjs';
import { checkStage1, detectSelfReference, upgradeStage1 } from './stage1.mjs';

/**
 * 阶段 2 的模块按需加载。
 *
 * `harness-init` 只做阶段 1，它的技能目录里没有 stage2.mjs——静态 import 会让
 * 一个只做阶段 1 的技能必须带上阶段 2 的全部判据与模板。缺这个文件不是错误：
 * 报告里如实写"阶段 2 未随此技能安装"，并要求用 /harness-loop-init。
 */
async function loadStage2() {
  try {
    return await import('./stage2.mjs');
  } catch (e) {
    if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND')) return null;
    throw e;
  }
}

// 兼容旧的导出位置：外部曾从 harness-stage 取这些符号。
export { STAGES, stageComplete, detectStage, detectSelfReference };

/**
 * 阶段判据缓存。
 *
 * 阶段 1 的判据会真的执行 init.sh；报告、JSON 输出、跳级保护各调一次
 * 就是执行三遍（实测一个挂起的脚本因此耗时 6 分钟）。同一进程内算一次就够。
 */
function memoStageChecks(checks, root, opts = {}) {
  const cache = {};
  return {
    get(id) {
      if (!cache[id]) cache[id] = checks[id](root, opts);
      return cache[id];
    },
  };
}

/**
 * 阶段 2 未随此技能安装时的占位判据。
 *
 * 不能静默当成"通过"，也不能让整个命令崩掉：它是一个明确的 NOT RUN，
 * evidence 直接告诉调用方下一步该跑哪个技能。
 */
function stage2Unavailable() {
  return [{
    label: '阶段 2 判据（需 harness-loop-init 技能）',
    ok: null,
    notRun: true,
    evidence: '本技能目录没有 stage2.mjs——阶段 2 属于 /harness-loop-init',
    action: '运行 /harness-loop-init，或 npx skills add <repo> --skill harness-loop-init',
  }];
}

async function main() {
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
  1  bad arguments, or --upgrade could not write a file
  2  --require and the stage is not met; or the upgrade was refused
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

  // 判据只算一次：阶段 1 会真的执行 init.sh，重复计算 = 重复执行。
  const s2 = await loadStage2();
  const checks = { 1: checkStage1, 2: s2 ? s2.checkStage2 : stage2Unavailable };
  const memo = memoStageChecks(checks, root, { self: selfMode });
  const checksByStage = {};
  for (const s of STAGES) checksByStage[s.id] = memo.get(s.id);
  const current = detectStage(checksByStage);

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

    if (to >= 2 && !s2) {
      process.stderr.write('error: stage 2 is not installed with this skill (no stage2.mjs).\n'
        + '       Run /harness-loop-init, or: npx skills add <repo> --skill harness-loop-init\n');
      process.exit(1);
    }

    // 阶段前置条件与覆盖开关相互独立；force 不能绕过跳级保护。
    if (to > 1) {
      const unmet = unmetStages(checksByStage, to);
      if (unmet.length) {
        // 用**正在运行的这个脚本**的路径，不要写死 `node scripts/harness-stage.mjs`：
        // 消费方仓库里没有那个路径，从技能目录运行时它也不存在。
        process.stderr.write(
          `error: cannot upgrade to stage ${to}: stage ${unmet.join(', ')} not complete.\n`
          + `       Run: node ${process.argv[1]} ${root} --upgrade --stage ${unmet[0]}\n`);
        process.exit(2);
      }
    }

    const results = [];
    // 阶段是累积的：装阶段 2 之前先把阶段 1 补齐（阶段 1 已达成时全部 SKIPPED）。
    if (to >= 1) {
      upgradeStage1(root, to === 1 && Boolean(args.force), results,
        { commands: explicitCommands, packageManager: explicitPm });
    }
    if (to >= 2) {
      s2.upgradeStage2(root, Boolean(args.force), results);
    }

    const written = results.filter((r) => r.status === 'written').length;
    const errors = results.filter((r) => r.status === 'error');
    process.stdout.write(`Upgraded harness to stage ${to} in ${root}\n`);
    process.stdout.write(`  written: ${written}, skipped: ${results.length - written - errors.length}, errors: ${errors.length}\n\n`);
    const MARK = { written: 'WRITTEN', skipped: 'SKIPPED (exists)', error: 'ERROR' };
    for (const r of results) {
      const mark = r.optionalMissing ? 'SKIPPED (not installed)' : (MARK[r.status] || r.status);
      const line = `  ${mark}  ${path.relative(root, r.path).split(path.sep).join('/')}`;
      process.stdout.write(`${line}${r.reason ? `  — ${r.reason}` : ''}\n`);
    }
    // error 不能被渲染成 SKIPPED：缺模板 / 缺技能目录时退出 0 等于报了一个假的成功。
    if (errors.length) {
      process.stderr.write(`\nerror: ${errors.length} file(s) could not be written (see ERROR above)\n`);
      process.exit(1);
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
        complete: stageComplete(checksByStage[s.id]),
        checks: checksByStage[s.id],
      })),
    });
  } else {
    process.stdout.write(renderReport(root, current, checksByStage));
  }

  if (args.require && targetStage !== null) {
    process.exit(stageComplete(checksByStage[targetStage]) ? 0 : 2);
  }
  process.exit(0);
}

if (isEntryPoint(import.meta.url)) {
  // main 是 async 的（阶段 2 模块按需 import）。未捕获的拒绝必须变成非零退出，
  // 否则 Node 的默认行为只是打印一行警告、退出码仍是 0。
  main().catch((e) => {
    process.stderr.write(`error: ${e && e.stack ? e.stack : e}\n`);
    process.exit(1);
  });
}
