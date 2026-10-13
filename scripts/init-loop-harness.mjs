#!/usr/bin/env node
/**
 * init-loop-harness.mjs — 在目标仓库装配 loop-harness
 *
 * 用法：
 *   node scripts/init-loop-harness.mjs --target /path/to/repo --level L1
 *   node scripts/init-loop-harness.mjs --target . --agent-file CLAUDE.md --force
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs, exists, readText, writeText, chmodExec,
  copyTemplate, detectProject, detectPackageManager, verificationCommands,
  initScriptFromCommands, PACK_ROOT, fail,
} from './lib/common.mjs';

function copySkill(skillName, targetRoot, level, results) {
  const src = path.join(PACK_ROOT, 'skills', skillName, 'SKILL.md');
  if (!exists(src)) return;
  const dest = path.join(targetRoot, 'skills', skillName, 'SKILL.md');
  if (exists(dest)) {
    results.push({ status: 'skipped', path: dest });
    return;
  }
  writeText(dest, readText(src));
  results.push({ status: 'written', path: dest });
}

function main() {
  const args = parseArgs();

  if (args.help) {
    process.stdout.write(`init-loop-harness — scaffold a loop harness in a target repository

Usage:
  node scripts/init-loop-harness.mjs [--target DIR] [options]

Options:
  --target DIR              Target repository (default: current directory)
  --agent-file NAME         AGENTS.md (default) or CLAUDE.md
  --package-manager PM      npm | pnpm | yarn | bun (auto-detected by default)
  --commands "a,b"          Custom verification commands (comma separated)
  --level L1|L2|L3          How much to scaffold (default: L1)
  --force                   Overwrite existing files
  --help                    Show this help

What gets created:
  L1  AGENTS.md, feature_list.json, progress.md, session-handoff.md, init.sh,
      loop-constraints.md, loop-budget.md, loop-run-log.md, LOOP.md, STATE.md,
      LESSONS.md, loop-ledger.json,
      control-plane + perception + lesson-harvest + gatekeeper skills
  L2  adds minimal-fix, loop-verifier, post-merge-cleanup, release-drafter
`);
    return;
  }

  const target = path.resolve(typeof args.target === 'string' ? args.target
    : typeof args._[0] === 'string' ? args._[0] : '.');
  const agentFile = typeof args.agentFile === 'string' ? args.agentFile : 'AGENTS.md';
  const level = typeof args.level === 'string' ? args.level.toUpperCase() : 'L1';
  const force = Boolean(args.force);

  if (!exists(target)) fail(`target does not exist: ${target}`);
  if (!['AGENTS.md', 'CLAUDE.md'].includes(agentFile)) {
    fail(`--agent-file must be AGENTS.md or CLAUDE.md (got: ${agentFile})`);
  }
  if (!['L1', 'L2', 'L3'].includes(level)) {
    fail(`--level must be L1, L2, or L3 (got: ${level})`);
  }

  const project = detectProject(target);
  project.root = target;
  const pm = detectPackageManager(target, typeof args.packageManager === 'string' ? args.packageManager : null);

  let commands;
  if (typeof args.commands === 'string') {
    commands = args.commands.split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    commands = verificationCommands(project, pm);
  }

  const results = [];
  const today = new Date().toISOString().slice(0, 10);

  // ---- 指令文件 ----
  const purpose = project.stack === 'generic'
    ? 'Project harness for reliable agent-assisted development.'
    : `Project harness for reliable agent-assisted development in a ${project.stack} codebase.`;

  results.push(copyTemplate('AGENTS.md', path.join(target, agentFile), {
    PROJECT_PURPOSE: purpose,
    PRIMARY_VERIFICATION_COMMAND: './init.sh',
    VERIFICATION_COMMANDS: commands.map((c) => `- \`${c}\``).join('\n'),
  }, { force }));

  // ---- 状态与生命周期 ----
  results.push(copyTemplate('feature_list.json', path.join(target, 'feature_list.json'), {
    PROJECT_NAME: path.basename(target),
    DATE: today,
  }, { force }));

  results.push(copyTemplate('progress.md', path.join(target, 'progress.md'), {
    DATE: today,
    TIME: new Date().toISOString().slice(11, 16),
  }, { force }));

  results.push(copyTemplate('session-handoff.md', path.join(target, 'session-handoff.md'), {}, { force }));

  // ---- init.sh（程序化生成） ----
  const initPath = path.join(target, 'init.sh');
  if (force || !exists(initPath)) {
    writeText(initPath, initScriptFromCommands(commands));
    chmodExec(initPath);
    results.push({ status: 'written', path: initPath });
  } else {
    results.push({ status: 'skipped', path: initPath });
  }

  // ---- 循环控制面 ----
  results.push(copyTemplate('loop-constraints.md', path.join(target, 'loop-constraints.md'), {}, { force }));
  results.push(copyTemplate('loop-budget.md', path.join(target, 'loop-budget.md'), {}, { force }));
  results.push(copyTemplate('loop-run-log.md', path.join(target, 'loop-run-log.md'), {}, { force }));
  results.push(copyTemplate('LOOP.md', path.join(target, 'LOOP.md'), {}, { force }));
  results.push(copyTemplate('STATE.md', path.join(target, 'STATE.md'), {}, { force }));
  results.push(copyTemplate('LESSONS.md', path.join(target, 'LESSONS.md'), {}, { force }));

  // ---- 账本 ----
  const ledgerPath = path.join(target, 'loop-ledger.json');
  if (force || !exists(ledgerPath)) {
    writeText(ledgerPath, JSON.stringify({
      goal: 'Replace with the current loop goal',
      pattern: 'pr-review-triage',
      level,
      attempts: [],
    }, null, 2) + '\n');
    results.push({ status: 'written', path: ledgerPath });
  } else {
    results.push({ status: 'skipped', path: ledgerPath });
  }

  // ---- 技能 ----
  const controlSkills = ['loop-constraints', 'loop-budget', 'loop-guard', 'event-router', 'signal-gatekeeper'];
  const perceptionSkills = ['issue-triage', 'pr-review-triage', 'ci-triage'];
  const l2Skills = ['minimal-fix', 'loop-verifier'];
  const alwaysSkills = ['harness-loop', 'harness-bootstrap', 'lesson-harvest'];

  for (const s of [...alwaysSkills, ...controlSkills, ...perceptionSkills]) {
    copySkill(s, target, level, results);
  }
  if (level === 'L2' || level === 'L3') {
    for (const s of [...l2Skills, 'post-merge-cleanup', 'release-drafter']) {
      copySkill(s, target, level, results);
    }
  }

  // ---- 输出 ----
  process.stdout.write(`Created loop harness for ${target}\n`);
  process.stdout.write(`Detected stack: ${project.stack}\n`);
  process.stdout.write(`Package manager: ${pm}\n`);
  process.stdout.write(`Level: ${level}\n`);
  process.stdout.write(`\nVerification commands:\n`);
  for (const c of commands) process.stdout.write(`  - ${c}\n`);
  process.stdout.write(`\nFiles:\n`);
  for (const r of results) {
    const rel = path.relative(target, r.path).split(path.sep).join('/');
    process.stdout.write(`  ${r.status === 'written' ? 'WRITTEN' : 'SKIPPED (exists)'}  ${rel}\n`);
  }

  process.stdout.write(`
Next steps:
  1. Edit ${agentFile} — replace placeholders and confirm the verification commands
  2. Edit loop-constraints.md — adjust the denylist for this repository
  3. Edit feature_list.json — replace the three placeholder features with real ones
  4. Read LESSONS.md — the nightly review loop writes here; nothing is recorded yet
  5. Run: bash init.sh
  6. Run: node ${path.relative(target, path.join(PACK_ROOT, 'scripts', 'loop-audit.mjs')).split(path.sep).join('/')} ${target} --suggest
  7. Read docs/07-adoption-ladder.md — week one is report-only
`);
}

main();
