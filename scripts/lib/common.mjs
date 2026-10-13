#!/usr/bin/env node
/**
 * 共享工具库。所有脚本仅依赖 Node 内置模块。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const TEMPLATE_DIR = path.join(PACK_ROOT, 'templates');
export const SKILLS_DIR = path.join(PACK_ROOT, 'skills');

export const SUBSYSTEMS = ['instructions', 'state', 'verification', 'scope', 'lifecycle'];

/** 拒绝列表模式（与 loop-constraints.md 保持一致） */
export const DENYLIST_PATTERNS = [
  '.env',
  '.env.*',
  '**/secrets/**',
  '**/credentials/**',
  '**/*_key*',
  '**/*_secret*',
  '.terraform/**',
  'k8s/production/**',
  '**/migrations/**',
  'auth/**',
  'payments/**',
  'billing/**',
];

/** 状态文件候选名 */
export const STATE_FILES = [
  'STATE.md',
  'pr-babysitter-state.md',
  'ci-sweeper-state.md',
  'post-merge-state.md',
  'dependency-sweeper-state.md',
  'changelog-drafter-state.md',
  'issue-triage-state.md',
];

/** 循环技能名（用于审计识别） */
export const LOOP_SKILL_NAMES = [
  'harness-loop',
  'loop-constraints',
  'loop-budget',
  'loop-guard',
  'loop-verifier',
  'event-router',
  'issue-triage',
  'pr-review-triage',
  'ci-triage',
  'minimal-fix',
  'post-merge-cleanup',
  'release-drafter',
  'harness-bootstrap',
];

/** 技能扫描目录
 *  .zcode/.agents 是 install-skills.mjs 实际写入的路径；
 *  其余是其他 agent 的约定与仓库内裸 skills/。 */
export const SKILL_DIRS = [
  '.zcode/skills', '.agents/skills',
  '.grok/skills', '.claude/skills', '.codex/skills',
  'skills',
];

/** 忽略的目录 */
const IGNORE_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.venv', 'venv',
  '__pycache__', 'coverage', '.cache', 'target', 'out',
]);

// ---------------------------------------------------------------- CLI 解析

/**
 * 已知的布尔标志：这些标志不消费后续 token。
 * 没有这个集合时，`--force positional` 会把 positional 当成 force 的值。
 */
const BOOLEAN_FLAGS = new Set([
  'help', 'json', 'suggest', 'force', 'pause', 'cleanup', 'escalation',
  'list', 'verbose', 'quiet', 'fix', 'md', 'badge',
]);

/**
 * 解析 CLI 参数。
 * --foo=bar → args.foo = 'bar'
 * --foo bar → args.foo = 'bar'（下一 token 不以 -- 开头且 foo 不是布尔标志时）
 * --foo     → args.foo = true
 * 非 -- 开头 → args._ 数组
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      const key = camel(body.slice(0, eq));
      args[key] = body.slice(eq + 1);
      continue;
    }
    const key = camel(body);
    const next = argv[i + 1];
    const takesValue = !BOOLEAN_FLAGS.has(key)
      && next !== undefined
      && !next.startsWith('--');
    if (takesValue) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function camel(s) {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// ---------------------------------------------------------------- 文件操作

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

export function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

export function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

export function chmodExec(p) {
  try {
    fs.chmodSync(p, 0o755);
  } catch {
    /* Windows 上可能失败，忽略 */
  }
}

/**
 * 从模板生成文件。非 force 且目标存在时跳过。
 * 替换 {{KEY}} 占位符（全量替换）。
 */
export function copyTemplate(templateName, targetPath, replacements = {}, opts = {}) {
  if (!opts.force && exists(targetPath)) {
    return { status: 'skipped', reason: 'exists', path: targetPath };
  }
  const src = path.join(TEMPLATE_DIR, templateName);
  let content = readText(src);
  if (!content) {
    return { status: 'error', reason: `template not found: ${templateName}`, path: targetPath };
  }
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(`{{${key}}}`).join(String(value));
  }
  writeText(targetPath, content);
  if (templateName.endsWith('.sh')) chmodExec(targetPath);
  return { status: 'written', path: targetPath };
}

/** 递归列文件（相对路径），跳过忽略目录 */
export function listFiles(root, opts = {}) {
  const maxFiles = opts.maxFiles ?? 1000;
  const out = [];
  const walk = (dir, depth) => {
    if (out.length >= maxFiles || depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.isFile()) {
        out.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  };
  walk(root, 0);
  return out.sort();
}

// ---------------------------------------------------------------- 项目检测

export function detectPackageManager(root, explicit) {
  if (explicit) return explicit;
  if (exists(path.join(root, 'bun.lockb')) || exists(path.join(root, 'bun.lock'))) return 'bun';
  if (exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export function detectProject(root) {
  const files = listFiles(root, { maxFiles: 800 });
  const has = (n) => files.includes(n);
  const pkg = readJson(path.join(root, 'package.json'));
  const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};

  if (pkg) {
    const hasRenderer = files.some((f) => f.startsWith('src/renderer'));
    if (deps.react || hasRenderer) return { stack: 'typescript-react', pkg, files };
    if (deps.typescript || has('tsconfig.json')) return { stack: 'typescript', pkg, files };
    return { stack: 'node', pkg, files };
  }
  if (has('pyproject.toml') || has('requirements.txt')) return { stack: 'python', pkg: null, files };
  if (has('go.mod')) return { stack: 'go', pkg: null, files };
  if (has('Cargo.toml')) return { stack: 'rust', pkg: null, files };
  if (has('pom.xml')) return { stack: 'java-maven', pkg: null, files };
  if (has('build.gradle') || has('build.gradle.kts')) return { stack: 'java-gradle', pkg: null, files };
  if (files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
    return { stack: 'dotnet', pkg: null, files };
  }
  return { stack: 'generic', pkg: null, files };
}

/** 依据项目类型推导验证命令 */
export function verificationCommands(project, explicitPM) {
  const { stack, pkg } = project;
  const cmds = [];

  if (stack === 'python') {
    cmds.push('python3 -m pytest || [ $? -eq 5 ]');
    cmds.push("python3 -m compileall -q .");
    return cmds;
  }
  if (stack === 'go') return ['go test ./...'];
  if (stack === 'rust') return ['cargo test'];
  if (stack === 'java-maven') return ['mvn test'];
  if (stack === 'java-gradle') return ['./gradlew test'];
  if (stack === 'dotnet') return ['dotnet test'];

  if (!pkg) {
    return ['echo "No package manifest detected; replace this line with your project verification command."'];
  }

  const pm = detectPackageManager(project.root || '.', explicitPM);
  const scripts = pkg.scripts || {};
  const run = (name) => {
    if (pm === 'npm') return name === 'test' ? 'npm test' : `npm run ${name}`;
    if (pm === 'yarn') return `yarn ${name}`;
    return `${pm} run ${name}`;
  };

  cmds.push(`${pm} install`);
  for (const candidate of ['check', 'typecheck', 'type-check', 'lint', 'test', 'build']) {
    if (scripts[candidate]) cmds.push(run(candidate));
  }
  if (!scripts.test && !scripts.check) {
    cmds.push('echo "No test script found; add one to package.json"');
  }
  return [...new Set(cmds)];
}

/** 由命令数组生成 init.sh */
export function initScriptFromCommands(commands) {
  const lines = [
    '#!/usr/bin/env bash',
    '#',
    '# 标准启动与验证路径（由 loop-harness 生成）',
    '# 若命令不正确，直接编辑下方的命令块。',
    '',
    'set -euo pipefail',
    '',
    'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'cd "$ROOT_DIR"',
    '',
    'echo "==> Working directory: $PWD"',
    '',
  ];
  for (const cmd of commands) {
    lines.push(`echo "=== ${cmd} ==="`);
    lines.push(cmd);
    lines.push('');
  }
  lines.push('echo "=== Verification Complete ==="');
  lines.push('echo');
  lines.push('echo "=== Next steps ==="');
  lines.push('echo "1. Read feature_list.json to see feature status"');
  lines.push('echo "2. Select ONE unfinished feature"');
  lines.push('echo "3. Implement only that feature"');
  lines.push('echo "4. Re-run verification before claiming completion"');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------- 文本匹配

/** 原文小写子串命中（needle 任一命中即 true） */
export function textHas(haystack, needles) {
  const h = (haystack || '').toLowerCase();
  return needles.some((n) => h.includes(n.toLowerCase()));
}

/**
 * 结构化文本匹配：只保留标题、列表项、表格行、粗体引导。
 * 防止"把关键词撒在段落里刷分"。
 */
export function structuredText(src) {
  const out = [];
  let inFence = false;
  for (const raw of (src || '').split('\n')) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!line) continue;
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^#{1,6}\s/.test(line)) { out.push(line); continue; }
    if (/^([-*+]|\d+\.)\s/.test(line)) { out.push(line); continue; }
    if (line.startsWith('|')) { out.push(line); continue; }
    if (/^\*\*[^*]+\*\*/.test(line)) { out.push(line); continue; }
    if (/^- \[[ x]\]/.test(line)) { out.push(line); continue; }
  }
  return out.join('\n');
}

export function structuredHas(src, needles) {
  return textHas(structuredText(src), needles);
}

// ---------------------------------------------------------------- 拒绝列表

/** 判断路径是否命中拒绝列表 */
export function matchesDenylist(filePath) {
  const p = filePath.split(path.sep).join('/').replace(/^\.\//, '');
  const base = path.basename(p);

  for (const pattern of DENYLIST_PATTERNS) {
    if (globMatch(p, pattern, base)) return pattern;
  }
  return null;
}

function globMatch(p, pattern, base) {
  // .env 与 .env.* —— 匹配任意层级的 .env 文件
  if (pattern === '.env') {
    return base === '.env';
  }
  if (pattern === '.env.*') {
    return base.startsWith('.env.') && base !== '.env';
  }

  const regex = globToRegex(pattern);
  return regex.test(p);
}

function globToRegex(pattern) {
  // **/x/** → 任意层级含 x 目录
  let out = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i += 2;
      if (pattern[i] === '/') i++;
      continue;
    }
    if (c === '*') {
      out += '[^/]*';
      i++;
      continue;
    }
    if ('.+?^${}()|[]\\'.includes(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
    i++;
  }
  return new RegExp(`(^|/)${out}($|/)`);
}

// ---------------------------------------------------------------- 输出

export function printJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

export function fail(msg, code = 1) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}
