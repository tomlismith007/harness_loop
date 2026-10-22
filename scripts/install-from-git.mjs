#!/usr/bin/env node
/**
 * install-from-git.mjs — 从 git 远端取 pack 并装配，不依赖本地仓库位置
 *
 * 问题：`harness-stage.mjs` 是 pack 级工具，消费方仓库里没有它。技能要靠
 * `.claude/skills/.harness-loop-install.json` 的 packRoot 找 pack——而这份清单
 * 只有装配跑完之后才存在。首次运行是鸡生蛋：要装配，先得有 pack 的位置。
 *
 * 做法：把 pack clone 到一个固定缓存目录，再从那里跑 harness-stage。
 * 缓存路径就是 packRoot，装配写进清单，下一次技能直接用。
 *
 * 只做两件事：取 pack、转交。装配逻辑不在这里复制一份——两份实现必然漂移。
 *
 * 用法：
 *   node scripts/install-from-git.mjs --target .              # 取 pack + 装配阶段 1
 *   node scripts/install-from-git.mjs --target . --stage 2
 *   node scripts/install-from-git.mjs --print                 # 只打印 pack 路径
 *   node scripts/install-from-git.mjs --offline               # 用缓存，不联网
 *   node scripts/install-from-git.mjs --self-test             # 离线自检
 *
 * 退出码：0 成功；1 参数错误 / 不在 git 仓库；2 取 pack 或装配失败。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs, printJson, fail, rejectUnknownFlags, isEntryPoint } from './lib/common.mjs';

export const DEFAULT_REMOTE = 'https://github.com/tomlismith007/harness_loop.git';

/**
 * 远端写法归一化。
 *
 * `owner/repo` 是 GitHub shorthand——与 `npx skills add` 同一套约定，人不用记 URL。
 * 其他形态（https/ssh/file）原样返回：私有部署与本地测试都靠这条。
 */
export function parseRemote(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) && !s.includes('://')) {
    return `https://github.com/${s}.git`;
  }
  return s;
}

/** 缓存目录。环境变量优先，便于测试与多 pack 并存。 */
export function packCacheDir(env = process.env) {
  return env.HARNESS_LOOP_PACK_DIR || path.join(os.homedir(), '.harness-loop', 'pack');
}

/** 清掉继承的 GIT_*：pre-commit hook 里跑时会指向外层仓库。 */
function gitEnv() {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];
  return env;
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', env: gitEnv(), maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** pack 是否完整：判定标准是装配器存在，不是目录存在。 */
export function packLooksValid(dir) {
  return fs.existsSync(path.join(dir, 'scripts', 'harness-stage.mjs'));
}

/**
 * 取 pack，返回 { packRoot, commit, source }。
 *
 * 先 clone 到临时目录再 rename：clone 中途失败不会留下一个"看起来存在但缺文件"
 * 的缓存——那会让下一次运行在更晚、更难查的地方失败。
 */
export function fetchPack({ remote, ref, cacheDir, offline = false, force = false }) {
  const cache = path.resolve(cacheDir);
  const hasCache = packLooksValid(cache);

  if (offline) {
    if (!hasCache) throw new Error(`--offline 但缓存里没有可用的 pack：${cache}`);
    return { packRoot: cache, commit: tryCommit(cache), source: 'cache' };
  }

  if (!hasCache) {
    const tmp = `${cache}.tmp-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    try {
      git(['clone', '--depth', '1', ...(ref ? ['--branch', ref] : []), remote, tmp], path.dirname(cache));
      if (!packLooksValid(tmp)) throw new Error(`clone 成功但 ${tmp} 里没有 scripts/harness-stage.mjs`);
      fs.rmSync(cache, { recursive: true, force: true });
      fs.renameSync(tmp, cache);
    } catch (e) {
      fs.rmSync(tmp, { recursive: true, force: true });
      throw new Error(`clone 失败：${String(e.stderr || e.message).trim()}`);
    }
    return { packRoot: cache, commit: tryCommit(cache), source: 'cloned' };
  }

  // 已有缓存：fetch + reset。失败就停下——静默用旧 pack 等于"以为装的是新版"。
  try {
    git(['fetch', '--depth', '1', 'origin', ref || 'HEAD'], cache);
    git(['reset', '--hard', 'FETCH_HEAD'], cache);
  } catch (e) {
    throw new Error(`更新缓存失败：${String(e.stderr || e.message).trim()}。`
      + `离线环境请显式传 --offline（会用现有缓存 ${cache}）`);
  }
  return { packRoot: cache, commit: tryCommit(cache), source: 'updated' };
}

function tryCommit(dir) {
  try { return git(['rev-parse', '--short', 'HEAD'], dir); } catch { return 'unknown'; }
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['target', 'stage', 'remote', 'ref', 'cache', 'offline',
    'force', 'print', 'selfTest', 'json', 'help'], 'install-from-git');
  if (args.help) {
    process.stdout.write(`install-from-git — fetch the pack from git, then scaffold a project

Usage:
  node scripts/install-from-git.mjs --target <dir> [--stage 1|2]
  node scripts/install-from-git.mjs --print          # print the pack path only
  node scripts/install-from-git.mjs --offline        # use the cache, no network

Options:
  --target <dir>   Project to scaffold (default: .)
  --stage <n>      Stage to upgrade to (default: 1)
  --remote <url>   Git remote; "owner/repo" shorthand works (default: ${DEFAULT_REMOTE})
  --ref <ref>      Branch or tag to fetch
  --cache <dir>    Pack cache (default: ~/.harness-loop/pack, or $HARNESS_LOOP_PACK_DIR)
  --offline        Do not touch the network; fail if the cache is unusable
  --print          Print the pack path and exit (no scaffolding)
  --self-test      Run offline checks and exit
  --json           JSON output

Exit codes: 0 ok · 1 bad arguments · 2 fetch or scaffold failed
`);
    return;
  }

  if (args.selfTest) {
    const bad = [];
    const eq = (name, actual, expected) => {
      if (actual !== expected) bad.push(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    };
    eq('shorthand → https', parseRemote('owner/repo'), 'https://github.com/owner/repo.git');
    eq('https 原样', parseRemote('https://x.y/z.git'), 'https://x.y/z.git');
    eq('file 原样', parseRemote('file:///tmp/p'), 'file:///tmp/p');
    eq('空 → null', parseRemote(''), null);
    eq('env 覆盖缓存', packCacheDir({ HARNESS_LOOP_PACK_DIR: '/tmp/p' }), '/tmp/p');
    if (!packCacheDir({}).includes('harness-loop')) bad.push('默认缓存路径不含 harness-loop');
    // packLooksValid 必须看文件而不是看目录：一个空的 pack 目录会让装配在更晚处失败。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-ifg-'));
    eq('空目录不是有效 pack', packLooksValid(tmp), false);
    fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
    eq('有目录无脚本仍无效', packLooksValid(tmp), false);
    fs.writeFileSync(path.join(tmp, 'scripts', 'harness-stage.mjs'), '//x\n');
    eq('有装配器才算有效', packLooksValid(tmp), true);
    fs.rmSync(tmp, { recursive: true, force: true });

    for (const b of bad) process.stdout.write(`FAIL ${b}\n`);
    process.stdout.write(bad.length ? `self-test FAILED ${bad.length}\n` : 'self-test PASS\n');
    process.exit(bad.length ? 2 : 0);
  }

  const stage = args.stage === undefined ? 1 : Number(args.stage);
  if (![1, 2].includes(stage)) fail(`--stage must be 1 or 2 (got: ${args.stage})`, 1);
  const remote = parseRemote(args.remote === undefined ? DEFAULT_REMOTE : args.remote);
  if (!remote) fail('--remote is empty', 1);
  if (args.cache !== undefined && typeof args.cache !== 'string') fail('--cache requires a directory path', 1);
  if (args.ref !== undefined && typeof args.ref !== 'string') fail('--ref requires a value', 1);
  if (args.target !== undefined && typeof args.target !== 'string') fail('--target requires a directory path', 1);

  const cacheDir = typeof args.cache === 'string' ? args.cache : packCacheDir();
  let pack;
  try {
    pack = fetchPack({ remote, ref: args.ref, cacheDir, offline: Boolean(args.offline) });
  } catch (e) {
    fail(e.message, 2);
  }

  if (args.print) {
    if (args.json) printJson(pack);
    else process.stdout.write(`${pack.packRoot}\n`);
    return;
  }

  const target = path.resolve(typeof args.target === 'string' ? args.target : '.');
  if (!fs.existsSync(target)) fail(`target not found: ${target}`, 1);

  const stageScript = path.join(pack.packRoot, 'scripts', 'harness-stage.mjs');
  const run = spawnSync(process.execPath, [stageScript, target, '--upgrade', '--stage', String(stage)],
    { encoding: 'utf8', cwd: pack.packRoot, stdio: ['ignore', 'pipe', 'pipe'] });

  if (run.status !== 0) {
    process.stderr.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    fail(`harness-stage --upgrade --stage ${stage} failed (exit ${run.status})`, 2);
  }

  if (args.json) printJson({ ...pack, target, stage });
  else {
    process.stdout.write(`pack:   ${pack.packRoot} (${pack.source}, ${pack.commit})\n`);
    process.stdout.write(`target: ${target} (stage ${stage})\n`);
    process.stdout.write(run.stdout || '');
  }
}

if (isEntryPoint(import.meta.url)) {
  main();
}
