#!/usr/bin/env node
/**
 * 共享工具库。所有脚本仅依赖 Node 内置模块。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

export const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PACK_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
export const TEMPLATE_DIR = path.join(PACK_ROOT, 'templates');
export const SKILLS_DIR = path.join(PACK_ROOT, 'skills');

/**
 * 安装清单文件名。技能靠它记录 packRoot：消费方仓库不含 harness-stage.mjs，
 * 装配工具是 pack 级工具，技能必须能从清单找到 pack 再调用。
 */
export const INSTALL_MANIFEST = '.harness-loop-install.json';

/** pack 版本。安装清单与 --check 都读它，回答"宿主上装的是哪一版"。 */
export const PACK_VERSION = (() => {
  const p = path.join(PACK_ROOT, 'VERSION');
  try {
    return fs.readFileSync(p, 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
})();

/**
 * 本模块是否是"被直接执行"的入口脚本。
 *
 * 不能用 `import.meta.url === pathToFileURL(process.argv[1]).href`：Node 会把
 * import.meta.url 解析成 **realpath**，而 argv[1] 保留调用方给的路径。macOS 上
 * /var 是指向 /private/var 的符号链接，于是 tmpdir 里的一切脚本都"不是入口"，
 * main() 从不执行、进程静默 exit 0——一个连输出都没有的"成功"。
 *
 * 两边都取 realpath 再比；取不到时退回字符串比较。
 */
export function isEntryPoint(importMetaUrl, argvPath = process.argv[1]) {
  if (!argvPath) return false;
  try {
    return fs.realpathSync(fileURLToPath(importMetaUrl)) === fs.realpathSync(argvPath);
  } catch {
    return importMetaUrl === pathToFileURL(argvPath).href;
  }
}

/**
 * 两个路径是否指向同一个文件/目录。
 *
 * 用于"自引用"判定：init.sh 里 `pwd -W` 给出 `D:/repo/init.sh`（正斜杠），
 * Node 的 path.resolve 给出 `D:\repo\init.sh`（反斜杠），字符串比较必然不等。
 * Windows 下路径大小写不敏感，统一小写再比；其他平台保持大小写敏感。
 *
 * 必须过 realpath：macOS 的 tmpdir 是 `/var/folders/...`，而它是
 * `/private/var/folders/...` 的符号链接。只做字符串归一化时，同一个目录的两种
 * 写法会被判成不同路径——`--force` 分支于是先删掉"目标"，也就是删掉了源，
 * 再复制时 ENOENT。Linux/Windows 上 tmpdir 没有这层链接，所以只在 macOS 红。
 */
export function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (p) => {
    let abs = path.resolve(String(p));
    try { abs = fs.realpathSync.native(abs); } catch { /* 不存在时用原路径比 */ }
    let s = abs.replace(/[\\/]+$/, '').replace(/\\/g, '/');
    if (process.platform === 'win32') s = s.toLowerCase();
    return s;
  };
  return norm(a) === norm(b);
}

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

/** 技能扫描目录。
 *  `.claude/skills` 与 `.agents/skills` 是本包安装的两个位置；
 *  其余是其他 agent 的约定。裸 `skills/` 是源目录，任何 agent 都不会扫描它。 */
export const SKILL_DIRS = [
  '.claude/skills', '.agents/skills',
  '.zcode/skills', '.grok/skills', '.codex/skills',
];

/** 用户级技能目录。`install-skills --scope user` 装到这里，跨项目复用。 */
export const USER_SKILL_DIRS = [
  path.join(os.homedir(), '.claude', 'skills'),
  path.join(os.homedir(), '.agents', 'skills'),
  path.join(os.homedir(), '.codex', 'skills'),
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
  'list', 'verbose', 'quiet', 'fix', 'md', 'badge', 'check',
]);

/** 布尔字面量：跟在布尔标志后面时说明用户以为在传值（`--pause false`）。 */
const BOOLEAN_LITERALS = new Set(['true', 'false', '0', '1', 'yes', 'no']);

/**
 * 解析 CLI 参数。
 * --foo=bar → args.foo = 'bar'
 * --foo bar → args.foo = 'bar'（下一 token 不以 -- 开头且 foo 不是布尔标志时）
 * --foo     → args.foo = true
 * 非 -- 开头 → args._ 数组
 *
 * 布尔标志后跟一个布尔字面量时**报错**而不是静默吞掉：
 * `--pause false` 曾经被解析成 pause=true + 位置参数 false，而 docs/03 的示例
 * 就写着 `--pause false`——照文档执行会得到永久紧急刹车。
 *
 * 只拦布尔字面量（true/false/0/1/yes/no），不拦任意裸值——因为
 * `--json positional` 是合法用法（位置参数跟在布尔标志后面），
 * 而 `--pause false` 是"用户以为在传值"。二者的区别就在这个字面量上。
 *
 * 出错时写入 args._error（不直接 process.exit），让调用方与测试都能处理。
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
    if (BOOLEAN_FLAGS.has(key)) {
      if (next !== undefined && BOOLEAN_LITERALS.has(next.trim().toLowerCase())) {
        args._error = `--${body} is a boolean flag and does not take a value. `
          + `Use --${body} (true) or --${body}=${next.trim().toLowerCase()}. Got: --${body} ${next}`;
        return args;
      }
      args[key] = true;
      continue;
    }
    const takesValue = next !== undefined && !next.startsWith('--');
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

/**
 * 读文本并归一化换行。
 *
 * Windows 检出（core.autocrlf=true，本仓库没有 .gitattributes）里每个文件都是 CRLF，
 * 而逐行解析的正则带 `$` 锚定——`.` 与 `$` 都不吃 `\r`，于是 `- [ ] 待办\r` 匹配不上，
 * 6 条待办被读成"没有待办"。逐处给正则加 `\r?` 会漏（漏一处就是一个静默缺陷），
 * 所以归一化放在唯一的读入口。
 */
export function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
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
    '# 标准启动与验证路径（由 harness-loop 生成）',
    '# 若命令不正确，直接编辑下方的命令块。',
    '',
    'set -euo pipefail',
    '',
    'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'cd "$ROOT_DIR"',
    '',
    // 自我识别标记：harness-stage 的判据 5 看到它就知道「要跑的正是正在执行的这份
    // init.sh」，记为 NOT RUN 而不是重入——重入会 init.sh → harness-stage → init.sh
    // 无限递归（实测套到 9 层、69 次 120s 超时、上万次进程 spawn，且每次超时都留孤儿）。
    // pwd -W 在 MSYS 下给出 Windows 形式路径（D:/…），与 Node 的 path.resolve 对得上；
    // 没有 -W 的平台（Linux/macOS）回退到 pwd。
    'ROOT_WIN="$(cd "$ROOT_DIR" && pwd -W 2>/dev/null || pwd)"',
    'export LOOP_HARNESS_ACTIVE_INIT="$ROOT_WIN/init.sh"',
    '',
    'echo "==> Working directory: $PWD"',
    '',
  ];
  for (const cmd of commands) {
    lines.push(`printf '%s\n' '=== ${cmd.replace(/'/g, "'\\''")} ==='`);
    lines.push(cmd);
    lines.push('');
  }
  lines.push('echo "=== Verification Complete ==="');
  lines.push('echo');
  lines.push('echo "=== Next steps ==="');
  lines.push('echo "1. Read STATE.md and take the first unchecked item under ## High Priority"');
  lines.push('echo "2. That item is the only work item for this session"');
  lines.push('echo "3. feature_list.json records completion and evidence; it is not the queue"');
  lines.push('echo "4. Implement only that item"');
  lines.push('echo "5. Re-run verification before claiming completion"');
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
    // 围栏内的行跳过不收集。围栏里通常是"格式示例"——把示例块算成结构化证据，
    // 等于让模板自带的话满足判据，而这个函数本来就是文档里的反作弊工具。
    if (inFence) continue;
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

/**
 * 解析 loop-constraints.md 的 `## Paths` 代码块，取出拒绝列表。
 *
 * 这是拒绝列表的人类真相源。文档写 A、代码做 B（且 B 是危险的那一侧）曾经是
 * 这个安全机制的单点失效，所以强制执行必须读它，而不是只读下面的 JS 常量。
 * 放这里而不是 harness-stage，因为 gate-check 与阶段判据要共用同一个实现。
 */
export function parseDenylistFrom(text) {
  const section = text.split(/^##\s*Paths/m)[1] ?? '';
  const block = section.split('```')[1] ?? '';
  if (!block.trim()) return [];
  return block.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    // 去掉行尾注释，只保留路径本身
    .map((l) => l.split(/\s+#/)[0].trim())
    .filter(Boolean);
}

/**
 * 解析 `## Budget` 段的 `- 日 token 上限：<N>`。
 * 0 或缺失 = 不启用。预算是策略，和拒绝列表放在同一个文件、同一次人工编辑。
 */
export function parseBudgetFrom(text) {
  const section = (text || '').split(/^##\s*Budget\s*$/m)[1] ?? '';
  const body = section.split(/^##\s/m)[0];
  const m = body.match(/^\s*-\s*日\s*token\s*上限\s*[：:]\s*(\d+)/im)
    || body.match(/^\s*-\s*daily\s*token\s*cap\s*[：:]\s*(\d+)/im);
  const n = m ? Number(m[1]) : 0;
  return { tokenBudget: Number.isFinite(n) && n > 0 ? n : null };
}

/** 读项目的预算；读不到返回 null（不启用）。 */
export function loadBudget(root = '.') {
  for (const p of constraintsFiles(root)) {
    const v = parseBudgetFrom(readText(p));
    if (v.tokenBudget !== null) return v;
  }
  return { tokenBudget: null };
}

/**
 * 约束文件的读取顺序（拒绝列表专用）。
 *
 * harness 与 loop 是两层：阶段 1 只有 harness-constraints.md（拒绝列表、
 * 代码规则、沟通），阶段 2 追加 loop-constraints.md（验证、账本、预算、教训）。
 * 拆开后"只用 harness 不用 loop"才成立。
 *
 * 拒绝列表是阶段 1 规则，所以这里保持 harness 优先。阈值不共用这个顺序：
 * loadLimits 按 key 决定（scope 仍 harness 优先，attempts 新位置 loop 优先）。
 *
 * 兼容：拆之前的仓库只有 loop-constraints.md，两个读取函数都回落它。
 */
export const HARNESS_CONSTRAINTS = 'harness-constraints.md';
export const LOOP_CONSTRAINTS = 'loop-constraints.md';

export function constraintsFiles(root = '.') {
  return [HARNESS_CONSTRAINTS, LOOP_CONSTRAINTS]
    .map((n) => path.join(root, n))
    .filter((p) => exists(p));
}

/** 依次读多个约束文件，取第一个非空结果。 */
function firstParsed(files, parse) {
  for (const p of files) {
    const v = parse(readText(p));
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** 读项目的拒绝列表；两个文件都没有或都为空时回落到 JS 常量。 */
export function loadDenylist(root = '.') {
  const parsed = firstParsed(constraintsFiles(root), (t) => {
    const v = parseDenylistFrom(t);
    return v.length ? v : null;
  });
  return parsed || DENYLIST_PATTERNS;
}

/**
 * 从约束文件读阈值：
 *   `## Code` 的「超过 N 个文件」
 *   `## Cleanup` 的「N 个文件」
 *   `## Attempts & Ledger` 的「最多 N 次」（旧布局在 `## Code`，保留回退）
 *
 * 阈值是策略，和拒绝列表放在同一个文件。此前 maxFilesPerFix: 5 是脚本里的常量，
 * 改约束文件对闸门毫无影响——文档说"5 是约束"，实现说"5 是常量"。
 * 读不到时返回 null，由调用方回落到 DEFAULTS 并在输出里标出来源。
 */
export function parseLimitsFrom(text) {
  const section = (name) => ((text || '').split(new RegExp(`^##\\s*${name}\\s*$`, 'm'))[1] ?? '').split(/^##\s/m)[0];
  const code = section('Code');
  const cleanup = section('Cleanup');
  const attempts = `${section('Attempts & Ledger')}\n${code}`;
  const num = (body, re) => {
    const m = body.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    maxFilesPerFix: num(code, /超过\s*(\d+)\s*个文件/),
    maxFilesPerCleanup: num(cleanup, /(\d+)\s*个文件/),
    maxAttempts: num(attempts, /最多\s*(\d+)\s*次/),
  };
}

const warned = new Set();
function warnOnce(message) {
  if (warned.has(message)) return;
  warned.add(message);
  process.stderr.write(`[harness-loop] ${message}\n`);
}

/**
 * 读项目的约束阈值；缺失项为 null。
 *
 * 优先级按 key 决定，而不是整文件：
 *   maxFilesPerFix     harness → loop   （scope 是阶段 1 规则）
 *   maxFilesPerCleanup loop → harness   （清理是 loop 规则）
 *   maxAttempts        loop → harness   （阶段 2 移到 ## Attempts & Ledger）
 *
 * 兼容：旧项目把 maxAttempts 留在 harness-constraints.md，仍可读，但会在 stderr
 * 打一行弃用提示；两个文件都定义且值不同时，loop 胜出并提示冲突。
 */
export function loadLimits(root = '.') {
  const harnessPath = path.join(root, HARNESS_CONSTRAINTS);
  const loopPath = path.join(root, LOOP_CONSTRAINTS);
  const h = exists(harnessPath) ? parseLimitsFrom(readText(harnessPath)) : null;
  const l = exists(loopPath) ? parseLimitsFrom(readText(loopPath)) : null;

  const pick = (key, order) => {
    for (const v of order) if (v && v[key] !== null) return v;
    return null;
  };

  // shortcut: harness-constraints fallback for maxAttempts, remove in 2.0.0
  const attempts = pick('maxAttempts', [l, h]);
  if (attempts && attempts === h) {
    warnOnce('maxAttempts read from harness-constraints.md (deprecated; move to loop-constraints.md §Attempts & Ledger; fallback removed in 2.0.0)');
  }
  if (h && l && h.maxAttempts !== null && l.maxAttempts !== null && h.maxAttempts !== l.maxAttempts) {
    warnOnce(`maxAttempts defined in both constraint files (harness=${h.maxAttempts}, loop=${l.maxAttempts}); using loop-constraints.md`);
  }

  return {
    maxFilesPerFix: pick('maxFilesPerFix', [h, l])?.maxFilesPerFix ?? null,
    maxFilesPerCleanup: pick('maxFilesPerCleanup', [l, h])?.maxFilesPerCleanup ?? null,
    maxAttempts: attempts?.maxAttempts ?? null,
  };
}

/** 判断路径是否命中拒绝列表 */
export function matchesDenylist(filePath, patterns = DENYLIST_PATTERNS) {
  const p = filePath.split(path.sep).join('/').replace(/^\.\//, '');
  const base = path.basename(p);

  for (const pattern of patterns) {
    if (globMatch(p, pattern, base)) return pattern;
  }
  return null;
}

function globMatch(p, pattern, base) {
  // .env 与 .env.* —— 匹配任意层级的 .env 文件。
  // 比较用 lower：在大小写不敏感的文件系统上 .ENV 与 .env 是同一个文件，
  // 若这里区分大小写，把文件重命名成 .ENV 就能绕过拒绝列表。
  const lowerBase = base.toLowerCase();
  if (pattern === '.env') {
    return lowerBase === '.env';
  }
  if (pattern === '.env.*') {
    return lowerBase.startsWith('.env.') && lowerBase !== '.env';
  }

  return globToRegex(pattern).test(p);
}

function globToRegex(pattern) {
  // 语义（改自旧实现，旧实现两个方向都错）：
  //   **/x/** → 任意层级的 x 目录、其内容，**以及同名的配置文件**。
  //     旧版要求 x 是"目录段且后面有内容"，于是 secrets.yml、config/secrets.yml、
  //     src/credentials.json 全部漏匹配——而它们显然是敏感的。
  //   x/**（无 **/ 前缀）→ 任意层级的 x 目录，不含同名文件。
  //     auth/** 要命中 src/auth/login.ts（嵌套 auth 同样敏感），
  //     但不能命中 tests/billing.test.ts（那是测试文件，不是 billing 目录）。
  //   * → 段内任意字符。
  //   隐藏变体：字面量段允许前导点，`.secrets/` 与 `secrets/` 同等对待。
  //     敏感目录最常见的形态恰恰是隐藏目录，而 `.` 不是 `/`，旧的段匹配
  //     要求整段等于 `secrets`，于是 `.secrets/prod.json` 被静默放行。
  const dirTail = pattern.endsWith('/**');
  const core = dirTail ? pattern.slice(0, -3) : pattern;
  const anyDepth = core.startsWith('**/');
  const body = (anyDepth ? core.slice(3) : core)
    .split('/')
    .map((seg) => (seg.includes('*') || seg.startsWith('.') ? seg : `\\.?${seg}`))
    .join('/')
    .replace(/\*/g, '[^/]*');

  if (dirTail) {
    const fileForm = anyDepth ? '(?:\\.[A-Za-z0-9]+)?' : '';
    // i 标志：macOS/Windows 的文件系统大小写不敏感，AUTH/login.ts 与 auth/login.ts
    // 是同一个文件。拒绝列表若区分大小写，一个改名的目录就能绕过它。
    return new RegExp(`^(?:.*/)?${body}(?:$|/|${fileForm}$)`, 'i');
  }
  return new RegExp(`^(?:.*/)?${body}$`, 'i');
}

// ---------------------------------------------------------------- 子进程

let _gnuTimeout = null;
/**
 * GNU timeout 是否可用。探测一次缓存——每次调用都探测会给每次执行加一次 spawn。
 *
 * 导出是为了让断言能按**能力**分叉，而不是按平台名。实测：原生 PowerShell 下
 * 直接跑 test.mjs 也是 979/0——Git 的 /usr/bin 在 PATH 上时解析到 GNU coreutils，
 * 这里为真。只有把 system32 排到 Git 之前才落到降级路径。
 * 按 `process.platform === 'win32'` 分叉会写出一个在开发机上恒绿的假断言。
 */
export function hasGnuTimeout() {
  if (_gnuTimeout !== null) return _gnuTimeout;
  try {
    const p = spawnSync('timeout', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    _gnuTimeout = p.status === 0 && /GNU coreutils/i.test(p.stdout || '');
  } catch { _gnuTimeout = false; }
  return _gnuTimeout;
}

/**
 * 执行一个会拉起子进程树的命令，超时后**整棵树**被杀掉。
 *
 * 为什么不能用 `execFileSync(..., { timeout })`：Node 的 timeout 只对直接子进程
 * 发 kill。在 Windows/MSYS 上，被杀的 bash 下面的 node/npm 全部存活成孤儿——
 * 实测：树深 3 层时，超时之后 3 个进程全 ALIVE（心跳文件继续增长）。
 * 而 GNU coreutils 的 `timeout` 用进程组语义，实测同一场景整棵树全灭。
 *
 * 这不是"清理不干净"的小事：孤儿进程会继续烧 CPU 并互相拖慢，让后续每一次
 * spawn 都更慢，形成正反馈。本仓库曾因此积累 21 棵孤儿树、上万次 spawn。
 *
 * 返回 { ok, status, stdout, stderr, timedOut, spawnFailed, treeKill }，不抛异常——
 * 调用方需要区分「脚本退出码非 0」与「脚本没跑起来」，前者是判据失败，
 * 后者是环境问题（硬约束：未跑必须显式记为 NOT RUN，不能伪装成失败）。
 */
export function runWithTreeKill(cmd, args, opts = {}) {
  const { cwd, timeoutMs = 120000, env, killGraceMs = 2000 } = opts;
  const spawnOpts = {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 32 * 1024 * 1024,
    env: env ? { ...process.env, ...env } : process.env,
  };

  // 优先用 GNU timeout（进程组语义）。没有它时退回 Node 的 timeout，并在返回值里
  // 明确标注 treeKill:false —— 能力缺失要可见，不能静默降级成一半的语义。
  if (hasGnuTimeout()) {
    const secs = String(Math.max(1, Math.ceil(timeoutMs / 1000)));
    const grace = String(Math.max(1, Math.ceil(killGraceMs / 1000)));
    try {
      const out = execFileSync('timeout', ['-k', grace, secs, cmd, ...args],
        { ...spawnOpts, timeout: timeoutMs + killGraceMs + 5000 });
      return { ok: true, status: 0, stdout: out, stderr: '', timedOut: false, spawnFailed: false, treeKill: true };
    } catch (e) {
      const status = e.status;
      const out = `${e.stdout || ''}`;
      const err = `${e.stderr || ''}`;
      // GNU timeout 的退出码语义：
      //   124 = 超时（TERM 生效）；137 = TERM 无效、KILL 兜底（超时的另一种形态）
      //   125 = timeout 自身失败；126 = 命令找到但无法执行；127 = 命令不存在
      //   其他 = 原样透传子进程的退出码（127 也可能是脚本自己的 command not found，
      //          用 stderr 区分——timeout 的报错以 "timeout: failed to run command" 开头）
      // ETIMEDOUT 是 Node 侧兜底超时（GNU timeout 自己卡住时才会发生）——仍是超时。
      const timedOut = status === 124 || status === 137 || e.code === 'ETIMEDOUT';
      const spawnFailed = !timedOut && (status === 125 || status === 126 || status === null
        || e.code === 'ENOENT' || e.code === 'EACCES'
        || /timeout: failed to run command/i.test(err));
      return { ok: false, status, stdout: out, stderr: err, timedOut, spawnFailed, treeKill: true };
    }
  }

  // 降级路径：Node 自带 timeout。语义弱一半（孙进程可能存活），显式标出。
  try {
    const out = execFileSync(cmd, args, spawnOpts);
    return { ok: true, status: 0, stdout: out, stderr: '', timedOut: false, spawnFailed: false, treeKill: false };
  } catch (e) {
    const status = e.status;
    const timedOut = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM';
    // 超时在 Node 的降级路径下 status 也是 null —— 若不加 !timedOut，
    // spawnFailed 会同时为 true，调用方按 spawnFailed 分支就会把超时
    // 报成「bash 不可用」，正是这次要修的那个误报。
    const spawnFailed = !timedOut && (status === null || e.code === 'ENOENT' || e.code === 'EACCES');
    return {
      ok: false, status, stdout: `${e.stdout || ''}`, stderr: `${e.stderr || ''}`,
      timedOut, spawnFailed, treeKill: false,
    };
  }
}

// ---------------------------------------------------------------- 不可信输入

const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
export const MAX_UNTRUSTED_LENGTH = 160;

/**
 * 清洗第三方文本：去不可见字符、折叠空白、截断。
 *
 * issue 标题、review 评论、CI 日志会被抄进 STATE.md，而 STATE.md 是下一轮
 * 第一个加载的输入——"洗过一遍再存"是这条通道上唯一可机械检查的动作。
 * 清洗不等于信任：它只保证形状（单行、无控制字符、有长度上限），
 * 语义上的"这是数据不是指令"仍靠阅读者。
 */
export function sanitizeUntrusted(value, max = MAX_UNTRUSTED_LENGTH) {
  const s = String(value ?? '').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

/** 包成惰性 code span：即使被读进上下文，也不会被当成 Markdown 结构或指令。 */
export function untrusted(value) {
  return `\`${sanitizeUntrusted(value).replace(/`/g, "'")}\``;
}

// ---------------------------------------------------------------- 输出

export function printJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

export function fail(msg, code = 1) {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(code);
}

/**
 * 把 CLI 布尔值转成真正的布尔。
 *
 * `--pause=false` 的值是字符串 "false"，而 `Boolean("false") === true`——
 * 于是"显式传假"反而打开了紧急刹车。`--flag` 得到 true，`--flag=true|false`
 * 得到对应布尔，其他字符串按 true（未知值不放行，由调用方决定是否校验）。
 */
export function boolArg(value) {
  if (value === undefined) return false;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  return true;
}

/**
 * 未知标志 fail-closed。
 *
 * 没有这个检查时，`--diff-filesx` 与 `--diff-files` 在退出码上不可区分：
 * 前者被静默丢弃，`files_changed` 变成 0，拒绝列表闸门整个失效，而工具报告成功。
 * 这与已经修掉的 `Number('abc')` → NaN 是同一个病，只是发生在标志名而不是标志值上。
 *
 * known 用 camelCase（parseArgs 转换后的形态）；`_` 是位置参数数组，必须豁免。
 */
export function rejectUnknownFlags(args, known, scriptName) {
  // parseArgs 在布尔标志被喂了值时把原因放在 _error 里（不直接退出，
  // 否则测试无法覆盖这条路径）。
  if (args._error) fail(`${scriptName}: ${args._error}`, 1);
  // parseArgs 已把 --diff-files 转成 diffFiles；报错必须还原成用户敲的形态，
  // 否则 "unknown flag: --diffFilesx" 指的不是命令行里的那个字符串。
  const toFlag = (k) => '--' + k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const unknown = Object.keys(args).filter((k) => k !== '_' && k !== '_error' && !known.includes(k));
  if (unknown.length) {
    fail(`${scriptName}: unknown flag(s): ${unknown.map(toFlag).join(', ')}. `
      + `Run with --help to see the accepted flags.`, 1);
  }
}
