#!/usr/bin/env node
/**
 * install-skills.mjs — 把 loop-harness 技能安装到 agent 能发现的位置
 *
 * 两类发现路径：
 *   .agents/skills/  跨编码智能体的通用约定（ZCode 也读；别的 agent 也读）—— **默认**
 *   .zcode/skills/   只有 ZCode 发现；用于覆盖 ZCode 内的同名技能
 *
 * 本仓库的 skills/ 不在上述任何路径下，因此不会被发现。
 * 这个脚本把技能复制过去。
 *
 * 用法：
 *   node scripts/install-skills.mjs --scope user                       # ~/.agents/skills/
 *   node scripts/install-skills.mjs --scope user --layout both         # 两边都装
 *   node scripts/install-skills.mjs --target /path/to/repo             # <repo>/.agents/skills/
 *   node scripts/install-skills.mjs --target /path/to/repo --layout both
 *   node scripts/install-skills.mjs --target /path/to/repo --list
 *   node scripts/install-skills.mjs --target /path/to/repo --uninstall
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs, exists, readText, writeText, printJson, PACK_ROOT, fail } from './lib/common.mjs';

const MANIFEST_NAME = '.loop-harness-install.json';

/**
 * 布局 → 点目录。
 *
 * 默认 `agents`：`.agents/skills/` 是跨编码智能体的共享约定，ZCode 也读它。
 * 只在需要"仅覆盖 ZCode 内的同名技能"时才用 `zcode`。
 */
const LAYOUTS = {
  agents: ['.agents'],
  zcode: ['.zcode'],
  both: ['.agents', '.zcode'],
};

/** 默认布局。跨 agent 通用优先，避免技能只在单一工具里可用 */
const DEFAULT_LAYOUT = 'agents';

/** 所有技能目录名 */
function listSkillNames() {
  const dir = path.join(PACK_ROOT, 'skills');
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && exists(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** 解析安装目标目录（可能多个） */
function resolveDestinations(args) {
  const layout = typeof args.layout === 'string' ? args.layout : DEFAULT_LAYOUT;
  const dots = LAYOUTS[layout];
  if (!dots) fail(`--layout must be one of: ${Object.keys(LAYOUTS).join(', ')} (got: ${layout})`);

  if (typeof args.target === 'string') {
    const root = path.resolve(args.target);
    return {
      layout, scope: 'workspace', root,
      dirs: dots.map((dot) => ({ dot, dir: path.join(root, dot, 'skills') })),
    };
  }

  const scope = typeof args.scope === 'string' ? args.scope : 'user';
  if (scope !== 'user') fail(`--scope must be "user" (got: ${scope}); use --target for workspace installs`);
  const home = os.homedir();
  return {
    layout, scope: 'user', root: home,
    dirs: dots.map((dot) => ({ dot, dir: path.join(home, dot, 'skills') })),
  };
}

function install(args) {
  const dest = resolveDestinations(args);
  const skills = listSkillNames();
  if (!skills.length) fail('no skills found in the pack');

  process.stdout.write(`Installed loop-harness skills\n`);
  process.stdout.write(`  scope:       ${dest.scope}\n`);
  process.stdout.write(`  layout:      ${dest.layout}\n`);

  let totalInstalled = 0;
  let totalUnchanged = 0;
  let totalSkipped = 0;

  for (const target of dest.dirs) {
    fs.mkdirSync(target.dir, { recursive: true });

    const results = [];
    for (const name of skills) {
      const src = path.join(PACK_ROOT, 'skills', name, 'SKILL.md');
      const targetDir = path.join(target.dir, name);
      const targetFile = path.join(targetDir, 'SKILL.md');

      if (exists(targetFile) && !args.force) {
        // 已存在：检查是否同一个包的内容
        const same = readText(src) === readText(targetFile);
        results.push({ name, status: same ? 'unchanged' : 'skipped-exists' });
        continue;
      }
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(src, targetFile);
      results.push({ name, status: 'installed' });
    }

    // 写清单，供 uninstall 使用
    writeText(path.join(target.dir, MANIFEST_NAME), JSON.stringify({
      installedAt: new Date().toISOString(),
      packRoot: PACK_ROOT,
      scope: dest.scope,
      layout: dest.layout,
      dotDir: target.dot,
      skills,
    }, null, 2) + '\n');

    const installed = results.filter((r) => r.status === 'installed').length;
    const unchanged = results.filter((r) => r.status === 'unchanged').length;
    const skipped = results.filter((r) => r.status === 'skipped-exists').length;
    totalInstalled += installed;
    totalUnchanged += unchanged;
    totalSkipped += skipped;

    process.stdout.write(`\n  destination: ${target.dir}\n`);
    process.stdout.write(`  installed:   ${installed}\n`);
    if (unchanged) process.stdout.write(`  unchanged:   ${unchanged}\n`);
    if (skipped) process.stdout.write(`  skipped:     ${skipped} (already present, different content — use --force to overwrite)\n`);
    process.stdout.write(`\nSkills:\n`);
    for (const r of results) process.stdout.write(`  ${r.status.padEnd(16)} ${r.name}\n`);
  }

  const shared = dest.layout === 'agents' || dest.layout === 'both';
  process.stdout.write(`
Next steps:
  1. Restart the session (or reload) so skills are discovered
  2. Verify:  /harness-loop   or   /loop-constraints
  3. The pack itself stays at ${PACK_ROOT} — skills there are the source of truth
     Re-run this script after editing a skill to push updates.
${shared
    ? `\nLayout: .agents/skills — the shared convention. ZCode reads it, and so do other\n        agents that follow the same convention.`
    : `\nLayout: .zcode/skills — discovered by ZCode only. Skills here shadow same-named\n        skills from .agents/ for ZCode. Re-run with --layout agents for the shared path.`}
`);

  return { totalInstalled, totalUnchanged, totalSkipped };
}

function uninstall(args) {
  const dest = resolveDestinations(args);
  const removed = [];
  const missing = [];

  for (const target of dest.dirs) {
    const manifestPath = path.join(target.dir, MANIFEST_NAME);
    if (!exists(manifestPath)) {
      missing.push(target.dir);
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(readText(manifestPath));
    } catch {
      fail(`manifest is not valid JSON: ${manifestPath}`);
    }

    for (const name of manifest.skills || []) {
      const targetDir = path.join(target.dir, name);
      if (exists(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        removed.push(`${target.dot}/${name}`);
      }
    }
    fs.rmSync(manifestPath, { force: true });
  }

  if (!removed.length && missing.length === dest.dirs.length) {
    fail(`no install manifest at ${missing.join(', ')} — nothing to uninstall from this location`);
  }

  process.stdout.write(`Uninstalled ${removed.length} loop-harness skill(s)\n`);
  for (const r of removed) process.stdout.write(`  removed  ${r}\n`);
  if (missing.length) {
    process.stdout.write(`\nNo manifest at: ${missing.join(', ')}\n`);
  }
  process.stdout.write(`\nSkills not listed in the manifest were left untouched.\n`);
}

function listInstalled(args) {
  const dest = resolveDestinations(args);
  const out = {
    scope: dest.scope,
    layout: dest.layout,
    pack_source: path.join(PACK_ROOT, 'skills'),
    destinations: [],
  };

  for (const target of dest.dirs) {
    const manifestPath = path.join(target.dir, MANIFEST_NAME);
    let manifest = null;
    if (exists(manifestPath)) {
      try { manifest = JSON.parse(readText(manifestPath)); } catch { manifest = null; }
    }

    const present = exists(target.dir)
      ? fs.readdirSync(target.dir, { withFileTypes: true })
          .filter((e) => e.isDirectory() && exists(path.join(target.dir, e.name, 'SKILL.md')))
          .map((e) => e.name)
          .sort()
      : [];

    out.destinations.push({
      dotDir: target.dot,
      destination: target.dir,
      installed_by_this_pack: manifest ? manifest.skills : null,
      installed_at: manifest ? manifest.installedAt : null,
      present_in_destination: present,
    });
  }

  if (args.json) {
    printJson(out);
    return;
  }

  process.stdout.write(`Scope:  ${dest.scope}\n`);
  process.stdout.write(`Layout: ${dest.layout}\n`);
  for (const d of out.destinations) {
    process.stdout.write(`\nDestination: ${d.destination}\n`);
    if (d.installed_by_this_pack) {
      process.stdout.write(`Installed by this pack: ${d.installed_by_this_pack.length} skill(s) at ${d.installed_at}\n`);
    } else {
      process.stdout.write(`Not installed by this pack (no manifest).\n`);
    }
    process.stdout.write(`\nPresent in destination (${d.present_in_destination.length}):\n`);
    for (const p of d.present_in_destination) {
      const mine = d.installed_by_this_pack && d.installed_by_this_pack.includes(p) ? '*' : ' ';
      process.stdout.write(`  ${mine} ${p}\n`);
    }
    if (d.installed_by_this_pack) process.stdout.write(`\n(* = installed by loop-harness)\n`);
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`install-skills — make loop-harness skills discoverable by agents

Discovery paths:
  .zcode/skills/   ZCode only
  .agents/skills/  shared convention — ZCode and other agents that read it

The pack's own skills/ directory is NOT discovered, so skills must be installed
to one of those locations before they can be triggered.

Usage:
  node scripts/install-skills.mjs --scope user
  node scripts/install-skills.mjs --scope user --layout both
  node scripts/install-skills.mjs --target /path/to/repo
  node scripts/install-skills.mjs --target /path/to/repo --layout both
  node scripts/install-skills.mjs --target /path/to/repo --list
  node scripts/install-skills.mjs --target /path/to/repo --uninstall

Options:
  --scope user          Install to ~/<layout>/skills/ (available in every project)
  --target DIR          Install to <DIR>/<layout>/skills/ (workspace scope)
  --layout WHICH        agents (default) | zcode | both
                          agents  → .agents/skills  (shared with other agents; ZCode reads it too)
                          zcode   → .zcode/skills   (ZCode only — to shadow a same-named skill)
                          both    → install to both
  --list                Show what is installed at the destination
  --uninstall           Remove skills listed in the install manifest
  --force               Overwrite existing skills of the same name
  --json                JSON output (with --list)
  --help                Show this help

Note: user scope outranks workspace scope. A workspace install of a name that
also exists at user scope is discovered but shadowed by the user-level copy.
`);
    return;
  }

  if (args.uninstall) return uninstall(args);
  if (args.list) return listInstalled(args);
  return install(args);
}

main();
