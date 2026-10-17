#!/usr/bin/env node
/**
 * gate-check.mjs — 闸门判定
 *
 * 按优先级检查闸门，输出 decision: proceed | escalate | exit。
 * 退出码：0 = proceed，1 = 参数错误，2 = escalate，3 = exit（kill switch）。
 *
 * 预算百分比已移除：本地 loop 没有真实的 token 计量，百分比是虚构的。
 * kill switch 保留，并且现在由本脚本自己读文件（--state），不再依赖调用方传参。
 *
 * 用法：
 *   node scripts/gate-check.mjs --item pr-123 --phase gate --attempts 1 \
 *     --diff-files @changed.txt --verdict approve --state STATE.md
 *
 *   node scripts/gate-check.mjs --item pr-123 --diff-files a.ts,b.ts --verdict approve
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, matchesDenylist, loadDenylist, DENYLIST_PATTERNS, fail, rejectUnknownFlags, boolArg } from './lib/common.mjs';

export const DEFAULTS = {
  maxFilesPerFix: 5,
  maxFilesPerCleanup: 10,
  maxAttempts: 3,
};

// 白名单。未识别的值一律参数错误退出，绝不放行——
// 拼错的 --verdict 等价于"批准"是这个闸门曾经最大的漏洞。
const PHASES = ['fix', 'gate'];
const VERDICTS = ['approve', 'reject', 'escalate-human', 'none'];
const RED_CHECKS = ['pass', 'fail', 'not-run'];

/**
 * kill switch：只认独占一行的标记。
 *
 * STATE.md 或 loop-constraints.md 里任何对 loop-pause-all 的散文提及都不算生效——
 * 否则一次说明性文字就把循环永久停死。`--state` 指向的目录下读这两个文件。
 */
export function isPaused(stateRoot) {
  for (const name of ['STATE.md', 'loop-constraints.md']) {
    const text = readText(path.join(stateRoot, name));
    if (/^\s*loop-pause-all\s*$/m.test(text)) return { paused: true, where: name };
  }
  return { paused: false, where: null };
}

/**
 * 判定闸门。
 *
 * 检查顺序（先命中者决定结果）：
 *   1. pause
 *   2. denylist
 *   3. attempts >= max
 *   4. scope (files > max)
 *   5. head-commit (TOCTOU)
 *   6. red-check
 *   7. verification-evidence (approve 必须带可核对的 verifier 报告)
 *   8. verification
 */
export function checkGates(input, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const {
    item = null,
    phase = null,
    attempts = 0,
    diffFiles = [],
    verdict = 'none',
    pause = false,
    isCleanup = false,
    reviewedSha = null,
    headSha = null,
    redCheck = 'not-run',
    evidenceFile = null,
    notRun = [],
    // 拒绝列表由调用方从 loop-constraints.md 读入；不给则用 JS 常量兜底。
    denylist = DENYLIST_PATTERNS,
  } = input;

  const base = {
    item,
    phase,
    attempts,
    files_changed: diffFiles.length,
    verdict,
  };

  // 1. 暂停
  if (pause) {
    return {
      ...base,
      decision: 'exit',
      gate: 'pause',
      reason: 'loop-pause-all is active',
      allowed_actions: [],
      exit_code: 3,
      next: 'exit immediately; do not dispatch any sub-agent; note the pause in STATE.md',
    };
  }

  // 2. 拒绝列表
  const hits = [];
  for (const f of diffFiles) {
    const pattern = matchesDenylist(f, denylist);
    if (pattern) hits.push({ file: f, pattern });
  }
  if (hits.length) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'denylist',
      reason: `changed file '${hits[0].file}' matches denylist pattern '${hits[0].pattern}'`,
      denylist_hits: hits,
      allowed_actions: [],
      exit_code: 2,
      next: 'write escalation entry to STATE.md, notify human, do not edit',
    };
  }

  // 3. 尝试上限
  if (attempts >= cfg.maxAttempts) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'max-attempts',
      reason: `attempts ${attempts} reached the limit (${cfg.maxAttempts})`,
      allowed_actions: [],
      exit_code: 2,
      next: 'STOP — escalate with full context. Do not retry. See docs/05-failure-modes.md',
    };
  }

  // 4. 范围
  const fileLimit = isCleanup ? cfg.maxFilesPerCleanup : cfg.maxFilesPerFix;
  if (diffFiles.length > fileLimit) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'scope',
      reason: `diff touches ${diffFiles.length} files, over the limit of ${fileLimit}`,
      allowed_actions: [],
      exit_code: 2,
      next: isCleanup
        ? 'cleanup change too large — request human approval before merging'
        : 'escalate — a change this large likely needs a design decision, not a loop fix',
    };
  }

  // 5. TOCTOU：合并必须绑定审查过的 commit
  // 审查期间若有人又 push，head 变了，合并必须失败——否则未审查的代码会进 main。
  // 缺 sha 也要拦：这条是唯一绝不能跳的闸，"参数不全就绕过"等于没有闸。
  if (phase === 'gate') {
    if (!reviewedSha || !headSha) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'head-commit',
        reason: `gate phase requires both --reviewed-sha and --head-sha (reviewed: ${reviewedSha || 'missing'}, head: ${headSha || 'missing'})`,
        allowed_actions: ['supply both SHAs so the merge can be bound to the reviewed commit'],
        exit_code: 2,
        next: 'a merge must be bound to a reviewed commit; pass --reviewed-sha and --head-sha, then merge with --match-head-commit <sha>',
      };
    }
    if (reviewedSha !== headSha) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'head-commit',
        reason: `head moved after review: reviewed ${String(reviewedSha).slice(0, 7)}, now ${String(headSha).slice(0, 7)}`,
        reviewed_sha: reviewedSha,
        head_sha: headSha,
        allowed_actions: ['re-run verification on the new head'],
        exit_code: 2,
        next: 're-verify the new head; merge with --match-head-commit <sha> so git itself refuses a moved head',
      };
    }
  }

  // 8. 回退测试：新增测试必须能在修复前的代码上真的挂掉
  // 默认值是 'not-run' 不是 'none'：忘了传参数与明确没跑，在退出码上必须不可区分。
  if (redCheck === 'fail') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'red-check',
      reason: 'red check failed — the new test does not fail on the pre-fix code (or its failure is not diagnostic)',
      allowed_actions: ['return to fix phase and write a test that actually catches the bug'],
      exit_code: 2,
      next: 'a test that passes on the broken code is decorative. Rewrite it so it fails on the pre-fix code and names the wrong behavior.',
    };
  }
  if (redCheck === 'not-run' && phase === 'gate') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'red-check',
      reason: 'red check was not run and this change alters behavior',
      allowed_actions: ['run the red check', 'escalate to human if the change genuinely needs no test'],
      exit_code: 2,
      next: 'run the red check, or escalate with a reason why this change needs no test',
    };
  }

  // 8b. 证据：verdict 是断言，不是证据。
  //     没有这一步时，调用方填 --verdict approve 即可通过，而"独立验证"与
  //     "审查过的 commit"两条硬约束都由调用方自证——一个接受自证的闸门，
  //     和一个不存在的闸门，在退出码上不可区分。
  let evidenceNotRun = [];
  if (phase === 'gate' && verdict === 'approve') {
    if (!evidenceFile) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: 'approve at the gate phase requires --evidence-file pointing at the verifier report',
        allowed_actions: ['run the independent verifier, save its report, pass the path via --evidence-file'],
        exit_code: 2,
        next: 'a verdict without evidence is a claim. Save the verifier report to a file and pass --evidence-file <path>.',
      };
    }
    if (!fs.existsSync(evidenceFile)) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence file not found: ${evidenceFile}`,
        allowed_actions: [],
        exit_code: 2,
        next: 'the named evidence file does not exist — do not approve on a missing report',
      };
    }
    const report = readText(evidenceFile);
    // 报告必须自带可核对的要素：verdict 行 + 至少一条命令输出行。
    // 这两条正则与 /harness-loop 第 4 步的验证者输出格式一致——那份格式早就是现成的接口，
    // 只是此前没有任何东西读它。
    const verdictLine = report.match(/^##\s*Verdict:\s*(APPROVE|REJECT|ESCALATE_HUMAN)/m);
    // 解析出**状态值**，而不只是匹配形状。
    //
    // 曾经这条只问"有没有一行长得像证据"，于是：
    //   - `## Verdict: APPROVE` + `- Tests: `npm test` → FAIL` 通过（自相矛盾）
    //   - 全部 NOT RUN 通过
    //   - 缺 `### Checks not run` 整节也通过
    // 一份自相矛盾的报告比没有报告更容易过——没有报告会 escalate，而
    // "APPROVE + 全 FAIL" 会 proceed。闸门是"独立验证"承诺的唯一机械执行点，
    // 只匹配形状等于它不存在（硬约束 11）。
    //
    // 箭头同时接受 U+2192 与 ASCII `->`：同一份报告在两种输入法下必须等价，
    // 否则一个字符的差异会静默改变闸门结果。
    const EVIDENCE_LINE = /^\s*-\s*(Tests|Red check|Real-use validation|Lint|Scope check|Denylist check):\s*`[^`]+`\s*(?:→|->)\s*(PASS|FAIL|NOT RUN)\s*$/gm;
    const checks = [...report.matchAll(EVIDENCE_LINE)].map((m) => ({ name: m[1], status: m[2] }));
    const missing = [];
    if (!verdictLine) missing.push('a "## Verdict: APPROVE|REJECT|ESCALATE_HUMAN" line');
    if (checks.length === 0) {
      missing.push('at least one "- <check>: `<cmd>` → PASS|FAIL|NOT RUN" line (→ or ->)');
    }
    if (missing.length) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence file ${evidenceFile} is missing: ${missing.join('; ')}`,
        allowed_actions: ['re-run the independent verifier and save its full report'],
        exit_code: 2,
        next: 'the report exists but carries no verifiable verdict/command lines. See the verifier output format in /harness-loop step 4.',
      };
    }
    // 自相矛盾：报告说 APPROVE，但有一项检查 FAIL。
    const failed = checks.filter((c) => c.status === 'FAIL').map((c) => c.name);
    if (failed.length) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence says APPROVE but ${failed.length} check(s) report FAIL: ${failed.join(', ')}`,
        allowed_actions: [],
        exit_code: 2,
        next: 'a verdict that contradicts its own evidence is worse than no verdict. Return to the fix phase.',
      };
    }
    // `### Checks not run` 节必须存在。验证者把"没跑的检查必须列在这里、
    // 不允许省略"定为硬规则（即使为空也要写 `—`），而此前闸门完全不读这条规则。
    const notRunSection = report.split(/^###\s+Checks not run\s*$/m)[1]?.split(/^#{2,3}\s/m)[0];
    if (notRunSection === undefined) {
      missing.push('a "### Checks not run" section (write `—` when empty)');
    } else {
      // 证据里声明 NOT RUN 的项必须出现在该节里（反向校验）。
      // 否则"没跑"可以只写在证据行里、却不进缺口清单——那正是这条规则要防的省略。
      const undeclared = checks
        .filter((c) => c.status === 'NOT RUN')
        .map((c) => c.name)
        .filter((n) => !new RegExp(`\\b${n}\\b`, 'i').test(notRunSection));
      if (undeclared.length) {
        missing.push(`NOT RUN checks missing from "### Checks not run": ${undeclared.join(', ')}`);
      }
    }
    if (missing.length) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence file ${evidenceFile} is missing: ${missing.join('; ')}`,
        allowed_actions: ['re-run the independent verifier and save its full report'],
        exit_code: 2,
        next: 'the report exists but does not account for what was not run. See the verifier output format in /harness-loop step 4.',
      };
    }
    // 报告自称 REJECT / ESCALATE_HUMAN 时，命令行说 approve 不成立。
    if (verdictLine[1] !== 'APPROVE') {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `--verdict approve contradicts the evidence file, which states ${verdictLine[1]}`,
        allowed_actions: [],
        exit_code: 2,
        next: 'the report is the authoritative verdict; pass --verdict matching it',
      };
    }
    // 证据里声明的 NOT RUN 必须进入输出，而不是只回显 --not-run 入参。
    evidenceNotRun = checks.filter((c) => c.status === 'NOT RUN').map((c) => c.name);
  }

  // 9. 验证
  if (verdict === 'reject') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'verification',
      reason: 'verifier rejected the change',
      allowed_actions: ['return to fix phase with attempt+1', 'escalate if attempts exhausted'],
      exit_code: 2,
      next: attempts + 1 >= cfg.maxAttempts
        ? 'attempts exhausted — escalate to human'
        : 'return to fix phase; append attempt to ledger first',
    };
  }
  if (verdict === 'escalate-human') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'verification',
      reason: 'verifier escalated to human (could not run tests, or risk too high)',
      allowed_actions: [],
      exit_code: 2,
      next: 'write escalation entry; a verifier that cannot run tests must not approve',
    };
  }
  // 闸门名区分"没验"与"验失败"。
  //
  // 两者都是 escalate，但人要做的事完全不同：前者是"等 verifier 出报告"（待办），
  // 后者是"实现有问题，回去改"（阻断）。此前两者共用 gate: "verification"，
  // 于是 merge-gate 的每次输出都长得一样——而持续假升级会训练人忽略它。
  if (verdict === 'none' && phase === 'gate') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'awaiting-verification',
      reason: 'no verifier verdict present at the gate phase',
      allowed_actions: ['wait for the verifier report', 'run the independent verifier if none is scheduled'],
      exit_code: 2,
      next: 'this is not a failure — nothing has been verified yet. Wait for the verifier, then re-run.',
    };
  }

  // 通过
  // checks_not_run 由证据里声明的 NOT RUN 与 --not-run 入参合并。
  // 只回显入参时，报告里写着的"没跑"会在输出里消失——而"未跑必须写明"
  // 是 loop-constraints.md 的三态约定，输出是它的下游。
  const allNotRun = [...new Set([...evidenceNotRun, ...notRun])];
  return {
    ...base,
    decision: 'proceed',
    gate: null,
    reason: 'all gates passed',
    checks_not_run: allNotRun,
    allowed_actions: ['propose PR', 'update state', 'request human merge'],
    forbidden_actions: ['auto-merge to main'],
    exit_code: 0,
    next: allNotRun.length
      ? `propose the change, but list these as NOT RUN in the PR body: ${allNotRun.join(', ')}`
      : 'propose the change; merge remains human unless the path is explicitly allowlisted',
  };
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, [
    'item', 'phase', 'attempts', 'diffFiles', 'verdict', 'pause', 'cleanup',
    'reviewedSha', 'headSha', 'redCheck', 'constraintsRoot', 'notRun',
    'evidenceFile', 'state', 'json', 'help',
  ], 'gate-check');
  if (args.help) {
    process.stdout.write(`gate-check — enforce loop gates before acting

Usage:
  node scripts/gate-check.mjs --item <id> --phase <phase> [options]

Options:
  --item <id>            Work item id (e.g. pr-123)
  --phase <phase>        fix | gate
  --attempts <n>         Attempts so far (default: 0)
  --diff-files <list>    A changed path, or @path to a file with one path per line
  --verdict <v>          approve | reject | escalate-human | none (default: none)
  --state <dir>          Read loop-pause-all from STATE.md / loop-constraints.md there
                         (default: cwd). The kill switch is a real gate, not a doc.
  --pause                Set if loop-pause-all is active
  --cleanup              Treat as a cleanup change (higher file limit)
  --reviewed-sha <sha>   Commit SHA that was reviewed (required at --phase gate)
  --head-sha <sha>       Current head SHA of the branch (required at --phase gate)
  --red-check <state>    pass | fail | not-run — does the new test fail on pre-fix code? (default: not-run)
  --evidence-file <p>    Verifier report. Required with --verdict approve at --phase gate:
                         the gate reads it and checks it carries a verdict line and at
                         least one command-output line. A verdict without evidence is a claim.
  --constraints-root <d> Directory holding loop-constraints.md (default: cwd). The denylist is
                         read from it so repo-specific paths are actually enforced.
  --not-run <list>       Comma-separated checks that were NOT run (listed, never omitted)
  --json                 Emit JSON (default)
  --help                 Show this help

Exit codes:
  0  proceed
  1  invalid argument (unknown phase/verdict/red-check, or non-numeric threshold)
  2  escalate to human
  3  exit immediately (kill switch)
`);
    return;
  }

  // 无参调用曾经返回 proceed exit 0，让"闸门用错"和"闸门通过"在退出码上不可区分。
  if (!args.help && args._.length === 0 && !args.item) {
    process.stdout.write(fs.readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
    fail('no arguments — nothing to check. See usage above.', 1);
  }

  let diffFiles = [];
  if (typeof args.diffFiles === 'string') {
    // 只认显式的 @path。裸参数一律按单一路径处理——曾经"路径存在就按文件列表读"，
    // 同一命令串因文件系统状态不同而含义不同，是最隐蔽的一类假绿/假红。
    if (args.diffFiles.startsWith('@')) {
      const p = args.diffFiles.slice(1);
      if (!fs.existsSync(p)) fail(`diff-files file not found: ${p}`);
      diffFiles = readText(p).split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      // 逗号分隔是显式约定（usage 里写着的），保留。去掉的是"文件存在就当清单读"——
      // 那让同一命令串因文件系统状态不同而含义不同。
      diffFiles = args.diffFiles.split(',').map((s) => s.trim()).filter(Boolean);
      // 但"指向一个清单文件却漏了 @"是另一个情形。静默按单一路径处理会把 N 个
      // 文件塌缩成 1 个（`files_changed: 1`），于是拒绝列表与范围**两个**闸门
      // 同时失效——首行无害的清单能藏住后面的 `auth/**`。
      //
      // 判据是"内容像路径清单"，不是"行数 > 1"：单文件 PR 的
      // `git diff --name-only` 输出恰好只有一行，而 `--diff-files one.txt`
      // （内容 `auth/login.ts`）此前被判为单一路径 → proceed，拒绝列表静默失效。
      // 直接检查文件内容是否为路径形态；源码文件（含空格/符号）不会命中。
      if (diffFiles.length === 1 && fs.existsSync(diffFiles[0])) {
        const lines = readText(diffFiles[0]).split('\n').map((s) => s.trim()).filter(Boolean);
        // 路径形态：只含路径字符，且带 / 或 .。源码行里的引号、括号、等号、空格
        // 都会让它落选，所以不会把"恰好单行的源文件"误判成清单。
        // 双条件：所有行都像路径，**且**至少一行看起来不是那个文件自身。
        // 否则 `--diff-files src/app.ts`（文件内容恰好是 `const x = 1` 之外的
        // 单行路径）会被自己的内容判成清单——gate-check 曾经把自己的输入当成清单。
        const looksLikePath = (s) => /^[A-Za-z0-9_.@/-]+$/.test(s) && /[/.]/.test(s);
        const selfPath = diffFiles[0].split(path.sep).join('/');
        if (lines.length && lines.every(looksLikePath)
          && !lines.every((l) => l === selfPath || selfPath.endsWith('/' + l))) {
          fail(`--diff-files points at ${diffFiles[0]}, which looks like a path list `
            + `(${lines.length} path(s), first: ${lines[0]}). Prefix it with "@" to treat it as a list.`);
        }
      }
    }
  }

  const enumArg = (value, allowed, flag) => {
    if (value === undefined) return undefined;
    if (!allowed.includes(value)) fail(`${flag} must be one of: ${allowed.join(', ')} (got: ${value})`);
    return value;
  };

  // Number('abc') 是 NaN，而 NaN >= n 恒为 false —— 一个拼错的阈值会把所有熔断器关掉，
  // 同时工具报告成功。必须在进 checkGates 之前拦住。
  const numArg = (value, flag, fallback) => {
    if (value === undefined) return fallback;
    const n = Number(value);
    if (!Number.isFinite(n)) fail(`${flag} must be a finite number (got: ${value})`);
    return n;
  };

  // 验证者的输出格式是 APPROVE / REJECT / ESCALATE_HUMAN，而这里的枚举是
  // 小写连字符。两处各按自己的文档执行时必然得到"参数错误"，而参数错误不属于
  // proceed/escalate/exit 三态——最重要的人工升级信号会在传递途中消失。
  const normalizeVerdict = (v) => String(v).trim().toLowerCase().replace(/_/g, '-');

  const input = {
    item: typeof args.item === 'string' ? args.item : null,
    phase: enumArg(args.phase, PHASES, '--phase') ?? null,
    attempts: numArg(args.attempts, '--attempts', 0),
    diffFiles,
    verdict: enumArg(
      args.verdict === undefined ? undefined : normalizeVerdict(args.verdict),
      VERDICTS, '--verdict') ?? 'none',
    // kill switch：--state 给了就自己读文件；否则只认 --pause。
    // 两者都必须真的改变退出码——文档里写着"暂停即退出"，代码里就得有入口。
    pause: boolArg(args.pause)
      || isPaused(typeof args.state === 'string' ? args.state : process.cwd()).paused,
    isCleanup: boolArg(args.cleanup),
    // 拒绝列表的真相源是本仓库的 loop-constraints.md，不是脚本里的常量。
    // 维护者按文档在 ## Repo-Specific 加的路径必须真的被强制执行。
    denylist: loadDenylist(typeof args.constraintsRoot === 'string' ? args.constraintsRoot : process.cwd()),
    reviewedSha: typeof args.reviewedSha === 'string' ? args.reviewedSha : null,
    headSha: typeof args.headSha === 'string' ? args.headSha : null,
    redCheck: enumArg(args.redCheck, RED_CHECKS, '--red-check') ?? 'not-run',
    evidenceFile: typeof args.evidenceFile === 'string' ? args.evidenceFile : null,
    notRun: typeof args.notRun === 'string'
      ? args.notRun.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  };

  const result = checkGates(input);

  printJson(result);
  process.exit(result.exit_code);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
