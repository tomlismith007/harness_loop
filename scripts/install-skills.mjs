#!/usr/bin/env node
/**
 * install-skills.mjs — 把 harness-loop 技能安装到 agent 能发现的位置
 *
 * 两个发现路径（默认都装）：
 *   .claude/skills/  Claude Code 扫描的路径
 *   .agents/skills/  跨编码智能体的共享约定
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
import { parseArgs, exists, readText, writeText, printJson, PACK_ROOT, PACK_VERSION, INSTALL_MANIFEST, fail } from './lib/common.mjs';

const MANIFEST_NAME = INSTALL_MANIFEST;
// 旧清单名：v2 早期版本用过。安装/卸载时一并清理，避免两个清单并存。
const LEGACY_MANIFEST_NAME = '.loop-harness-install.json';

/**
 * 布局 → 点目录。
 *
 * 默认 `both`：`.claude/skills/` 是 Claude Code 扫描的路径，
 * `.agents/skills/` 是跨 agent 的共享约定。两处都装，任何宿主都能发现。
 */
const LAYOUTS = {
  claude: ['.claude'],
  agents: ['.agents'],
  both: ['.claude', '.agents'],
};

/** 默认布局：两个宿主路径都装 */
const DEFAULT_LAYOUT = 'both';

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
    // 目标是已存在的文件时，mkdirSync 会抛裸 ENOTDIR 堆栈（而且 "Installed" 横幅
    // 已经打印过了）。这里给仓库统一的 fail() 消息。
    if (exists(root) && !fs.statSync(root).isDirectory()) {
      fail(`--target must be a directory (got a file): ${root}`);
    }
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

export const BACKUP_DIR = '.harness-loop-backup';
const MAX_BACKUPS = 5;

/** 覆盖前备份旧副本，只保留最近 MAX_BACKUPS 份。 */
function backupSkill(dir, name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, BACKUP_DIR, stamp, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(path.join(dir, name), dest, { recursive: true });
  const root = path.join(dir, BACKUP_DIR);
  const keep = fs.readdirSync(root).sort().slice(-MAX_BACKUPS);
  for (const entry of fs.readdirSync(root)) {
    if (!keep.includes(entry)) fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  }
}

/** 从最近一份备份恢复。 */
function rollback(args) {
  const dest = resolveDestinations(args);
  let restored = 0;
  for (const target of dest.dirs) {
    const root = path.join(target.dir, BACKUP_DIR);
    if (!exists(root)) continue;
    const stamps = fs.readdirSync(root).sort();
    if (!stamps.length) continue;
    const latest = path.join(root, stamps[stamps.length - 1]);
    for (const name of fs.readdirSync(latest)) {
      const src = path.join(latest, name);
      if (!exists(path.join(src, 'SKILL.md'))) continue;
      fs.cpSync(src, path.join(target.dir, name), { recursive: true });
      restored++;
    }
    // 恢复过的备份不再保留：连续 rollback 应该逐版回退，而不是重复恢复同一份。
    fs.rmSync(latest, { recursive: true, force: true });
    process.stdout.write(`restored ${target.dot}/skills from ${stamps[stamps.length - 1]}
`);
  }
  if (!restored) fail(`no backup found under ${dest.dirs.map((d) => path.join(d.dir, BACKUP_DIR)).join(', ')}`, 1);
  process.stdout.write(`Rolled back ${restored} skill(s) to the previous version.
`);
}

function install(args) {
  const dest = resolveDestinations(args);
  const skills = listSkillNames();
  if (!skills.length) fail('no skills found in the pack');

  process.stdout.write(`Installed harness-loop skills\n`);
  process.stdout.write(`  scope:       ${dest.scope}\n`);
  process.stdout.write(`  layout:      ${dest.layout}\n`);

  let totalInstalled = 0;
  let totalUnchanged = 0;
  let totalSkipped = 0;

  for (const target of dest.dirs) {
    fs.mkdirSync(target.dir, { recursive: true });

    const results = [];
    const written = [];
    for (const name of skills) {
      const src = path.join(PACK_ROOT, 'skills', name, 'SKILL.md');
      const targetDir = path.join(target.dir, name);
      const targetFile = path.join(targetDir, 'SKILL.md');

      if (exists(targetFile) && !args.force) {
        // 已存在：检查是否同一个包的内容
        const same = readText(src) === readText(targetFile);
        results.push({ name, status: same ? 'unchanged' : 'skipped-exists' });
        // unchanged 是本包写的，可以卸载；skipped-exists 是用户自己的内容，绝不能删。
        if (same) written.push(name);
        continue;
      }
      // --force 覆盖前把旧副本存一份：装了坏版本要能退回去。
      if (exists(targetFile) && args.force) backupSkill(target.dir, name);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(src, targetFile);
      results.push({ name, status: 'installed' });
      written.push(name);
    }

    // 清单记"本包在宿主上管理了哪些技能"，不是"本轮写了哪些"。
    //
    // 只记本轮写入项时，漂移状态（skipped-exists）下重跑会把清单清空，
    // `--uninstall` 随即永久失效。但也不能把目录里的同名技能全算进来——
    // 用户自己写的同名技能被卸载器删掉更糟。所以取并集：上一轮清单里
    // 仍在磁盘上的 + 本轮确认属于本包的（写入 / 内容相同）。
    const manifestPath = path.join(target.dir, MANIFEST_NAME);
    const previous = (() => {
      try { return JSON.parse(readText(manifestPath)).skills || []; } catch { return []; }
    })();
    const managed = [...new Set([
      ...previous.filter((n) => exists(path.join(target.dir, n))),
      ...written,
      // skipped-exists 的内容属于用户（可能被改过），但技能名是本包的；
      // 记进清单才能卸载。uninstall 只删清单里列出的目录，不碰其他。
      ...results.filter((r) => r.status === 'skipped-exists').map((r) => r.name),
    ])].sort();
    writeText(manifestPath, JSON.stringify({
      installedAt: new Date().toISOString(),
      packRoot: PACK_ROOT,
      packVersion: PACK_VERSION,
      scope: dest.scope,
      layout: dest.layout,
      dotDir: target.dot,
      skills: managed,
      lastRun: {
        installed: results.filter((r) => r.status === 'installed').map((r) => r.name),
        skippedExists: results.filter((r) => r.status === 'skipped-exists').map((r) => r.name),
        unchanged: results.filter((r) => r.status === 'unchanged').map((r) => r.name),
      },
    }, null, 2) + '\n');
    // 旧清单名一并清掉：两个清单并存时，uninstall 会按新清单删一次、
    // 旧清单留在原地，下一次 `--list` 又显示“已安装过”。
    fs.rmSync(path.join(target.dir, LEGACY_MANIFEST_NAME), { force: true });

    const installed = results.filter((r) => r.status === 'installed').length;
    const unchanged = results.filter((r) => r.status === 'unchanged').length;
    const skipped = results.filter((r) => r.status === 'skipped-exists').length;
    totalInstalled += installed;
    totalUnchanged += unchanged;
    totalSkipped += skipped;

    process.stdout.write(`\n  destination: ${target.dir}\n`);
    process.stdout.write(`  installed:   ${installed}\n`);
    if (unchanged) process.stdout.write(`  unchanged:   ${unchanged}\n`);
    if (skipped) {
      process.stdout.write(`  skipped:     ${skipped} (already present, different content)\n`);
      process.stdout.write(`               re-run with --force to update: `
        + `node scripts/install-skills.mjs ${typeof args.target === 'string' ? `--target ${args.target}` : '--scope user'} --force\n`);
    }
    process.stdout.write(`\nSkills:\n`);
    for (const r of results) process.stdout.write(`  ${r.status.padEnd(16)} ${r.name}\n`);
  }

  process.stdout.write(`
Next steps:
  1. Restart the session (or reload) so skills are discovered
  2. Verify:  /harness-init   or   /harness-loop
  3. The pack itself stays at ${PACK_ROOT} — skills there are the source of truth
     Re-run this script after editing a skill to push updates.

Layout: ${dest.layout} — ${dest.dirs.map((d) => `${d.dot}/skills`).join(' + ')}.
`);

  return { totalInstalled, totalUnchanged, totalSkipped };
}

function uninstall(args) {
  const dest = resolveDestinations(args);
  const removed = [];
  const missing = [];

  for (const target of dest.dirs) {
    // 新清单优先；只有旧清单时也能卸载（升级路径）。
    const newPath = path.join(target.dir, MANIFEST_NAME);
    const legacyPath = path.join(target.dir, LEGACY_MANIFEST_NAME);
    const manifestPath = exists(newPath) ? newPath : (exists(legacyPath) ? legacyPath : newPath);
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

    // 清单是目标目录里用户可写的普通文件，name 不做校验就是任意递归删除。
    // 解析后断言仍在目标目录内，越界一律拒绝并报错。
    const rootDir = path.resolve(target.dir);
    for (const name of manifest.skills || []) {
      const targetDir = path.resolve(rootDir, name);
      if (targetDir !== rootDir && !targetDir.startsWith(rootDir + path.sep)) {
        fail(`refusing to delete outside the install directory: ${name} (resolved to ${targetDir})`);
      }
      if (exists(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        removed.push(`${target.dot}/${name}`);
      }
    }
    fs.rmSync(newPath, { force: true });
    fs.rmSync(legacyPath, { force: true });
  }

  if (!removed.length && missing.length === dest.dirs.length) {
    fail(`no install manifest at ${missing.join(', ')} — nothing to uninstall from this location`);
  }

  process.stdout.write(`Uninstalled ${removed.length} harness-loop skill(s)\n`);
  for (const r of removed) process.stdout.write(`  removed  ${r}\n`);
  if (missing.length) {
    process.stdout.write(`\nNo manifest at: ${missing.join(', ')}\n`);
  }
  process.stdout.write(`\nSkills not listed in the manifest were left untouched.\n`);
}

/**
 * --check：比较已安装副本与源码，列出漂移并以非零退出码报告。
 *
 * 存在原因：宿主加载的是已安装副本，而所有测试都跑在源仓库内。
 * 实测宿主里的 harness-loop 比源码旧一版（缺 stage: runtime 与第 0 步的接线检查），
 * 于是"文档/测试描述的能力"与"agent 实际行为"静默不一致。
 * docs/10 自己写着"改完技能要重跑安装脚本推送更新"——但那是纪律，不是机制。
 */
/** 读清单里声明的布局（`both` / `claude` / `agents`），读不到返回 null。 */
function readManifestLayout(dir) {
  for (const n of [MANIFEST_NAME, LEGACY_MANIFEST_NAME]) {
    const p = path.join(dir, n);
    if (!exists(p)) continue;
    try {
      const v = JSON.parse(readText(p)).layout;
      // 清单是用户可写文件。未知布局不能让期望集合变空——那等于把检查关掉。
      return Object.hasOwn(LAYOUTS, v) ? v : null;
    } catch { return null; }
  }
  return null;
}

/**
 * --check 的期望宿主集合。
 *
 * 以**清单里声明的布局**为准，--layout 只在没有任何清单时兜底。
 * 反过来做（以 --layout 为准）会留下一个绕过：装过两个宿主之后，
 * 用 `--check --layout claude` 就能让被删掉的 .agents 从结果里消失。
 * 检查范围不能由调用方临时收窄。
 */
function expectedDotsForCheck(dest, args) {
  const declared = new Set();
  let anyManifest = false;
  for (const dot of Object.values(LAYOUTS).flat()) {
    const dir = path.join(dest.root, dot, 'skills');
    const layout = readManifestLayout(dir);
    if (!layout) continue;
    anyManifest = true;
    for (const d of LAYOUTS[layout] || []) declared.add(d);
  }
  if (anyManifest) return [...declared];
  const layout = typeof args.layout === 'string' ? args.layout : DEFAULT_LAYOUT;
  return LAYOUTS[layout] || [];
}

function checkInstalled(args) {
  const dest = resolveDestinations(args);
  const srcDir = path.join(PACK_ROOT, 'skills');
  const drifted = [];
  let checked = 0;

  const expectedDots = expectedDotsForCheck(dest, args);
  const targets = expectedDots.map((dot) => ({ dot, dir: path.join(dest.root, dot, 'skills') }));
  // 期望之外的宿主目录存在也不算错（可能是别的方式装的），只是不在检查范围。

  for (const target of targets) {
    if (!exists(target.dir)) {
      // 期望的宿主目录整个不见了。有清单说它装过 → 漂移，不是"用户本来就没装"。
      drifted.push(`${target.dot}/skills — 宿主目录不存在（清单声明过该布局）`);
      continue;
    }
    const manifestPath = [MANIFEST_NAME, LEGACY_MANIFEST_NAME]
      .map((n) => path.join(target.dir, n))
      .find((p) => exists(p)) || path.join(target.dir, MANIFEST_NAME);
    let manifest = null;
    if (exists(manifestPath)) {
      try { manifest = JSON.parse(readText(manifestPath)); } catch { manifest = null; }
    }
    // 已安装副本 = 清单里记的 + 目录里存在、且**本包源码里也有**的。
    // 不能把目录里所有技能都算进来：`~/.claude/skills` 还装着别家的技能，
    // 它们会被误报成"源码里已不存在（清单残留）"并让 --check 退出 1。
    const present = fs.readdirSync(target.dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && exists(path.join(target.dir, e.name, 'SKILL.md')))
      .map((e) => e.name)
      .filter((n) => exists(path.join(srcDir, n, 'SKILL.md')));
    const installed = [...new Set([...(manifest?.skills || []), ...present])];

    // 清单说这个技能装过，目录里却没有 → 整个副本缺失。
    // 只比内容发现不了它：内容比较的对象已经不存在了，循环直接跳过。
    for (const name of manifest?.skills || []) {
      if (!present.includes(name)) {
        drifted.push(`${target.dot}/skills/${name} — 清单记着已安装，但副本缺失`);
      }
    }

    for (const name of installed) {
      const src = path.join(srcDir, name, 'SKILL.md');
      const dst = path.join(target.dir, name, 'SKILL.md');
      // 标签用相对路径，方便直接 cd 过去看——只写 dot 会丢掉 /skills 那一层。
      const label = path.relative(process.cwd(), dst).split(path.sep).join('/');
      if (!exists(src)) {
        drifted.push(`${label} — 源码里已不存在（清单残留）`);
        continue;
      }
      if (!exists(dst)) continue;
      checked++;
      if (readText(src) !== readText(dst)) {
        drifted.push(`${label} — 已安装副本与源码不同`);
      }
    }
  }

  // 版本：宿主装的是哪一版、源码是哪一版。没有版本号时只能回答"漂移了"，
  // 不能回答"漂移到哪个方向"。
  const installedVersions = new Set();
  for (const target of targets) {
    const mp = [MANIFEST_NAME, LEGACY_MANIFEST_NAME]
      .map((n) => path.join(target.dir, n)).find((p) => exists(p));
    if (!mp) continue;
    try { installedVersions.add(JSON.parse(readText(mp)).packVersion || 'unknown'); } catch { /* 坏清单已计入漂移 */ }
  }

  if (args.json) {
    printJson({ checked, drifted, in_sync: drifted.length === 0,
      installed_version: [...installedVersions].join(',') || null, source_version: PACK_VERSION });
  } else {
    process.stdout.write(`Checked ${checked} installed skill(s)\n`);
    process.stdout.write(`  installed: ${[...installedVersions].join(',') || 'unknown'} / source: ${PACK_VERSION}\n`);
    if (drifted.length) {
      process.stdout.write(`\nDRIFT — the host runs the installed copy, not the source:\n`);
      for (const d of drifted) process.stdout.write(`  ${d}\n`);
      process.stdout.write(`\nRe-run without --check to push updates:\n`
        + `  node scripts/install-skills.mjs --force\n`);
    } else if (checked) {
      process.stdout.write(`\nAll installed skills match the source.\n`);
    }
  }

  // 单宿主安装（--layout claude）不该因为另一个宿主没装而失败；只有
  // "清单声明过、副本却不在"才算漂移。missing 只在没有任何清单时才出现。
  // 期望的宿主都查过了：drifted 非空就是漂移。missing 现在只在
  // "没有任何清单、也没指定布局"时才会出现，此时不判失败。
  process.exit(drifted.length ? 1 : 0);
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
    const manifestPath = [MANIFEST_NAME, LEGACY_MANIFEST_NAME]
      .map((n) => path.join(target.dir, n))
      .find((p) => exists(p)) || path.join(target.dir, MANIFEST_NAME);
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
    if (d.installed_by_this_pack) process.stdout.write(`\n(* = installed by harness-loop)\n`);
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`install-skills — make harness-loop skills discoverable by agents

Discovery paths (both installed by default):
  .claude/skills/  Claude Code
  .agents/skills/  shared convention — other agents that read it

The pack's own skills/ directory is NOT discovered, so skills must be installed
to one of those locations before they can be triggered.

Usage:
  node scripts/install-skills.mjs --scope user
  node scripts/install-skills.mjs --scope user --layout both
  node scripts/install-skills.mjs --target /path/to/repo
  node scripts/install-skills.mjs --target /path/to/repo --layout both
  node scripts/install-skills.mjs --target /path/to/repo --list
  node scripts/install-skills.mjs --target /path/to/repo --check
  node scripts/install-skills.mjs --target /path/to/repo --uninstall

Options:
  --scope user          Install to ~/<layout>/skills/ (available in every project)
  --target DIR          Install to <DIR>/<layout>/skills/ (workspace scope)
  --layout WHICH        both (default) | claude | agents
                          both    → .claude/skills + .agents/skills
                          claude  → .claude/skills only
                          agents  → .agents/skills only
  --list                Show what is installed at the destination
  --check               Compare installed copies against the source; exit 1 on drift.
                        The host loads the INSTALLED copy, so a stale install means the
                        skill the agent runs is not the skill this repo tests.
  --uninstall           Remove skills listed in the install manifest
  --rollback            Restore the most recent backup (made by --force)
  --force               Overwrite existing skills of the same name
                        (the previous copy is backed up under .harness-loop-backup/)
  --json                JSON output (with --list / --check)
  --help                Show this help

Exit codes:
  0  ok (or --check found no drift)
  1  --check found drift, or invalid arguments

Note: user scope outranks workspace scope. A workspace install of a name that
also exists at user scope is discovered but shadowed by the user-level copy.
`);
    return;
  }

  if (args.rollback) return rollback(args);
  if (args.uninstall) return uninstall(args);
  if (args.check) return checkInstalled(args);
  if (args.list) return listInstalled(args);
  return install(args);
}

main();
