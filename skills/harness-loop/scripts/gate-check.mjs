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
import { execFileSync } from 'node:child_process';
import {
  parseArgs, readText, printJson, matchesDenylist, loadDenylist, loadLimits,
  DENYLIST_PATTERNS, fail, rejectUnknownFlags, boolArg, isEntryPoint } from './lib/common.mjs';
// 上限默认与熔断器同源（同一技能内一份阈值），CLI 侧再由约束文件覆盖。
import { DEFAULT_BREAKER } from './ledger-check.mjs';

/**
 * 兜底阈值。只在本目录没有 loop-constraints.md（或解析不出该行）时使用，
 * 且输出里会标 `limits_source: defaults`——一个静默接管的第二真相源
 * 比没有真相源更难查。
 */
export const DEFAULTS = {
  maxFilesPerFix: 5,
  maxFilesPerCleanup: 10,
};

// 白名单。未识别的值一律参数错误退出，绝不放行——
// 拼错的 --verdict 等价于"批准"是这个闸门曾经最大的漏洞。
const PHASES = ['fix', 'gate'];
const VERDICTS = ['approve', 'reject', 'escalate-human', 'none'];
const RED_CHECKS = ['pass', 'fail', 'not-run'];
const CHANGE_CLASSES = ['behavior', 'docs', 'config', 'refactor'];

/** 闸门判定顺序。README 与 docs/03 的表格由它驱动，测试断言三者一致。 */
export const GATE_ORDER = [
  'pause', 'wip-limit', 'dirty-tree', 'denylist', 'untrusted-shape', 'scope', 'head-commit',
  'red-check', 'verification-evidence', 'verification', 'awaiting-verification',
];

/** 本轮临时产物：它们本来就该留在工作区，不该触发 dirty-tree。 */
export const LOOP_ARTIFACTS = ['changed-files.txt', 'verifier-report.md'];

/**
 * kill switch：只认独占一行的标记。
 *
 * STATE.md 或 loop-constraints.md 里任何对 loop-pause-all 的散文提及都不算生效——
 * 否则一次说明性文字就把循环永久停死。`--state` 指向的目录下读这两个文件。
 */
/**
 * 执行证据里声明的一条命令，返回真实退出码。
 *
 * 含 shell 元字符的命令走 shell（调用方写的就是 shell 语法），否则用 execFile
 * 避免多一层解析。超时按失败处理——挂住的验证和没跑过的验证一样不可信。
 */
export function runEvidenceCommand(command, cwd, timeoutMs = 120000) {
  // 一律走 shell，且把命令原样交给它。曾经按元字符分叉、无元字符时自己 split：
  // 带引号的参数会被拆掉引号（`node --eval "process.exitCode=1"` 变成两个参数，
  // node 把它当无效的 --eval 值，退出 0），于是一条必失败的命令被读成 PASS。
  // 重放的语义是"报告里写的命令，在 shell 里跑一遍"，不能由我们重新解释引号。
  try {
    execFileSync(command, [], { cwd, timeout: timeoutMs, stdio: 'ignore', shell: true });
    return { exitCode: 0, timedOut: false };
  } catch (e) {
    if (e.killed === true || e.code === 'ETIMEDOUT') return { exitCode: null, timedOut: true };
    return { exitCode: typeof e.status === 'number' ? e.status : 1, timedOut: false };
  }
}

/**
 * 剥离围栏代码块，再做行匹配。
 *
 * 不剥围栏时，一份"教人怎么暂停"的文档会把循环停死（实测：模板里的示例
 * 直接触发 exit 3）；不归一化时，行尾一个零宽字符就能绕过刹车。
 * 两个方向都是真的，所以两个方向都要处理。
 */
export function stripFences(text) {
  return text.replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*$/gm, '');
}

export function isPaused(statePath) {
  const { files, readable } = stateFiles(statePath);
  for (const { name, text } of files) {
    const clean = stripFences(String(text || '').normalize('NFC'))
      // Zero-width / format chars (U+200B etc.) defeat the line anchor and silently disable the brake.
      .replace(/\p{Cf}/gu, '');
    if (/^\s*loop-pause-all\s*$/m.test(clean)) return { paused: true, where: name, readable };
  }
  return { paused: false, where: null, readable };
}

/**
 * --state 接受文件或目录。
 *
 * 传文件名曾经被当成目录，path.join('STATE.md','STATE.md') 读不到 → 静默 proceed。
 * 读不到 ≠ 没暂停：一个永远生效不了的 kill switch 和一个不存在的 kill switch
 * 在退出码上不可区分。所以两个文件都读不到时调用方必须 fail-closed。
 */
export function stateFiles(statePath) {
  const target = statePath || process.cwd();
  let st = null;
  try { st = fs.statSync(target); } catch { /* 不存在 */ }
  if (st && st.isFile()) {
    const text = readText(target);
    return { files: [{ name: path.basename(target), text }], readable: true };
  }
  // readable 看文件是否存在，不看内容：空 STATE.md 是合法的新装配状态，
  // 只有"路径指错了"才是参数错误。
  // 拆文件后 kill switch 可能写在 harness-constraints.md 里；两个都读，
  // 否则"暂停标记换个文件放"就静默失效。
  const names = ['STATE.md', 'harness-constraints.md', 'loop-constraints.md'];
  const files = names.map((name) => ({ name, text: readText(path.join(target, name)) }));
  return { files, readable: names.some((name) => fs.existsSync(path.join(target, name))) };
}

/**
 * STATE.md 的 `## Active` 表里真正在进行的 work item 数（WIP=1 的机械入口）。
 *
 * 占位行 `| — |` / `| - |` 不算。没有 `## Active` 节 → null（不适用，不阻断）；
 * 有表头但零数据行 → 0。两者必须可区分，否则"没写表"会被读成"没有活动项"。
 */
export function activeItems(text) {
  if (!text) return { count: null, malformed: null };
  const section = text.split(/^##\s+Active\s*$/m)[1];
  if (section === undefined) return { count: null, malformed: null };
  const body = section.split(/^#{1,2}\s/m)[0];
  const rows = body.split('\n').filter((l) => l.trim().startsWith('|'));
  // 有表但缺分隔行：表格结构已损坏，按 0 项读会把"读不懂"读成"没有活动项"。
  if (rows.length === 1) {
    return { count: null, malformed: '## Active 表只有一行（缺表头或分隔行）' };
  }
  // 前两行是表头与分隔行
  const data = rows.slice(2).filter((l) => {
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    return cells.length > 0 && cells.some((c) => c && c !== '—' && c !== '-');
  });
  return { count: data.length, malformed: null };
}

/**
 * 判定闸门。
 *
 * 检查顺序由 GATE_ORDER 定义（先命中者决定结果）。
 * 「该不该继续试」不在这里判：尝试次数是账本的事实，归 ledger-check 的
 * attempt-limit。闸门只看这次改动本身。
 */
export function checkGates(input, opts = {}) {
  const cfg = { maxAttempts: DEFAULT_BREAKER.maxAttempts, ...DEFAULTS, ...opts };
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
    changeClass = 'behavior',
    implementer = null,
    evidenceFile = null,
    evidenceCwd = null,
    noReplay = false,
    notRun = [],
    // 拒绝列表由调用方从 loop-constraints.md 读入；不给则用 JS 常量兜底。
    denylist = DENYLIST_PATTERNS,
    stateText = null,
    // 未提交的改动路径。空数组 = 工作区干净（或调用方不判，如 fix 阶段的预检）。
    dirtyFiles = [],
  } = input;

  const base = {
    item,
    phase,
    attempts,
    files_changed: diffFiles.length,
    verdict,
    change_class: changeClass,
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

  // 1a. 表格结构损坏：读不懂 ≠ 没有活动项。静默返回 0 会让 WIP=1 失效。
  if (input.activeMalformed) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'wip-limit',
      reason: `STATE.md 的 ## Active 表结构损坏：${input.activeMalformed}`,
      allowed_actions: ['repair the table to header + separator + data rows'],
      exit_code: 2,
      next: '修好 ## Active 表（表头、分隔行、数据行），否则无法判定 WIP',
    };
  }

  // 1b. WIP=1：两个活动项同时存在 → 升级。只有 STATE.md 里真有 `## Active` 表时才判。
  if (typeof input.activeCount === 'number' && input.activeCount > 1) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'wip-limit',
      reason: `STATE.md 的 ## Active 有 ${input.activeCount} 项在进行；一次只做一个 work item`,
      allowed_actions: ['finish or explicitly block one item first'],
      exit_code: 2,
      next: '把多余的项移回 High Priority 或标记阻塞，只留一项在 ## Active',
    };
  }

  // 1c. 脏工作区：改动清单来自已提交的 diff，未提交的改动根本不在清单里。
  //
  // 这是 denylist 与 scope 两道闸的**前提**：清单为空时它们都"通过"，
  // 而一个未提交的 `templates/evil.txt` 会静默穿过两个闸（实测过）。
  // 只豁免本轮临时产物——它们本来就该在工作区里出现。
  const dirty = (input.dirtyFiles || []).filter((f) => !LOOP_ARTIFACTS.includes(f));
  if (dirty.length) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'dirty-tree',
      reason: `working tree has ${dirty.length} uncommitted change(s): ${dirty.slice(0, 3).join(', ')}`
        + (dirty.length > 3 ? ', …' : ''),
      dirty_files: dirty,
      allowed_actions: ['commit the change to the loop branch', 'stash or discard unrelated edits'],
      exit_code: 2,
      next: 'the gate judges the committed diff. Commit first: git add -A && git commit, '
        + 'then re-run. Only changed-files.txt / verifier-report.md may stay uncommitted.',
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

  // 2b. 不可信输入的形状：带 src:untrusted 标记的条目，正文必须已经包成
  //     code span。裸文本来自第三方，下一轮会被当成自身笔记读进去。
  if (input.stateText) {
    // 按标题前缀切分，不要求逐字相等：出厂模板写的是
    // `## High Priority (loop is acting or waiting on human)`，
    // 精确匹配切不出 section，闸门就在默认模板上永远不触发（实测过）。
    // 与 state-write.mjs 的 appendItem 用同一个前缀规则。
    const section = String(input.stateText).split(/^##\s+High Priority\b.*$/m)[1];
    if (section !== undefined) {
      const body = section.split(/^##\s/m)[0];
      const bad = body.split(String.fromCharCode(10)).filter((l) => /src:untrusted/.test(l))
        .filter((l) => !/`[^`]+`/.test(l.replace(/<!--[\s\S]*?-->/g, '')));
      if (bad.length) {
        return {
          ...base,
          decision: 'escalate',
          gate: 'untrusted-shape',
          reason: `${bad.length} STATE.md item(s) carry src:untrusted but are not wrapped in a code span`,
          allowed_actions: ['rewrite the item with scripts/state-write.mjs'],
          exit_code: 2,
          next: 'third-party text must be written through state-write.mjs (code span + origin marker)',
        };
      }
    }
  }

  // 3. 范围
  const fileLimit = isCleanup ? cfg.maxFilesPerCleanup : cfg.maxFilesPerFix;
  if (diffFiles.length > fileLimit) {
    return {
      ...base,
      decision: 'escalate',
      gate: 'scope',
      reason: `diff touches ${diffFiles.length} files, over the limit of ${fileLimit}`,
      limits_source: cfg.limitsSource || 'defaults',
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
  // 所有改动都必须绑定验证者审过的提交；类型只影响回退测试。
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

  // 6. 回退测试：**行为类**改动的新增测试必须能在修复前的代码上真的挂掉。
  //
  // 硬约束的原文是"新增测试必须通过回退测试"，限定词是"新增测试"。此前对任何
  // 改动都要求 red-check pass，于是改一个错别字只有两条路：escalate，或谎报
  // pass（而闸门接受谎报）——一个逼人撒谎的闸门，训练出来的习惯会迁移到代码改动上。
  // 非行为类放行 not-run，但必须在验证者报告里写下理由；没写理由仍然拦。
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
  if (redCheck === 'not-run' && phase === 'gate' && changeClass === 'behavior') {
    return {
      ...base,
      decision: 'escalate',
      gate: 'red-check',
      reason: 'red check was not run and this change alters behavior',
      allowed_actions: ['run the red check', 'declare --change-class docs|config|refactor with a written reason in the verifier report'],
      exit_code: 2,
      next: 'run the red check, or re-declare the change class and justify it under "### Checks not run" in the verifier report',
    };
  }

  // 8b. 证据：verdict 是断言，不是证据。
  //     没有这一步时，调用方填 --verdict approve 即可通过，而"独立验证"与
  //     "审查过的 commit"两条硬约束都由调用方自证——一个接受自证的闸门，
  //     和一个不存在的闸门，在退出码上不可区分。
  let evidenceNotRun = [];
  let replaySkipped = false;
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
    // 这两条正则与 /harness-loop 第 5 步的验证者输出格式一致——那份格式早就是现成的接口，
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
    // 状态值后面允许跟说明文字（`— 2 tests, 2 pass`）。技能文档里的格式就是这样写的，
    // 行尾锚定会让真实报告全部匹配不上——沙箱真机验证时一份合规报告被拒。
    // 命令部分可选：`Red check: PASS — …` 没有命令，也是文档里的写法。
    const EVIDENCE_LINE = /^\s*-\s*(Tests|Red check|Real-use validation|Lint|Scope check|Denylist check):\s*(?:`[^`]+`\s*(?:→|->)\s*)?(PASS|FAIL|NOT RUN)\b/gm;
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
        next: 'the report exists but carries no verifiable verdict/command lines. See the verifier output format in /harness-loop step 5.',
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
        next: 'the report exists but does not account for what was not run. See the verifier output format in /harness-loop step 5.',
      };
    }
    // 非行为类改动跳过回退测试，但"为什么不需要"必须写进报告。
    // 只放行不要求理由，等于把 change-class 变成一个新的谎报入口。
    if (redCheck === 'not-run' && phase === 'gate' && changeClass !== 'behavior') {
      const entry = (notRunSection || '').split('\n')
        .find((l) => /Red check/i.test(l));
      const why = entry ? entry.replace(/^.*?Red check[^—–-]*[—–-]?\s*/i, '').trim() : '';
      if (why.length < 20) {
        return {
          ...base,
          decision: 'escalate',
          gate: 'red-check',
          reason: `change class ${changeClass} skips the red check, so "### Checks not run" must state why in >= 20 chars (got ${why.length})`,
          allowed_actions: ['write the reason under "### Checks not run"'],
          exit_code: 2,
          next: 'a skipped red check is allowed for docs/config/refactor, but only with a written reason',
        };
      }
    }
    // 8b-2. 输出片段与作者身份。
    //
    // 只校验"命令能重放"证明的是命令跑成功了，不是验证者看过结果：一份手写报告
    // 配 `node -e "process.exit(0)"` 曾经直接 proceed。要区分"跑了"与"说跑了"，
    // 报告必须贴出真实输出；要区分"独立验证"与"自己批自己"，报告必须署名，
    // 且执行者不能同时是作者。
    const AUTHOR_LINE = /^\s*Author:\s*(\S.*)$/m;
    const REVIEWED_LINE = /^\s*Reviewed commit:\s*(\S+)\s*$/m;
    // 验证者必须**复述**执行者声明的改动类型。只让执行者自己填 --change-class，
    // 等于让被检查的人决定要不要跑回退测试。
    const CLASS_LINE = /^\s*Change class confirmed:\s*(\S+)/m;
    const author = report.match(AUTHOR_LINE);
    const reviewedCommit = report.match(REVIEWED_LINE);
    const confirmedClass = report.match(CLASS_LINE);
    if (!author) missing.push('an "Author: <verifier>" line (the implementer cannot author the report)');
    if (!reviewedCommit) missing.push('a "Reviewed commit: <sha>" line');
    if (!confirmedClass) {
      missing.push('a "Change class confirmed: <behavior|docs|config|refactor>" line');
    } else if (confirmedClass[1].toLowerCase() !== String(changeClass).toLowerCase()) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `report confirms change class '${confirmedClass[1]}' but --change-class is '${changeClass}'`,
        allowed_actions: ['re-declare the change class and have the verifier confirm it'],
        exit_code: 2,
        next: 'the verifier must confirm the same change class the implementer declared. '
          + 'A mismatch means the red-check requirement was decided by the wrong party.',
      };
    }
    // 独立的一条 if：缺 Reviewed commit 已经在 missing 里记过，这里只比对其值。
    if (reviewedCommit && reviewedSha && reviewedCommit[1].toLowerCase() !== String(reviewedSha).toLowerCase()) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `report reviews ${reviewedCommit[1].slice(0, 12)} but --reviewed-sha is ${String(reviewedSha).slice(0, 12)}`,
        allowed_actions: ['re-run verification on the reviewed commit'],
        exit_code: 2,
        next: 'the report must name the commit it actually reviewed; a mismatch means it reviewed something else',
      };
    }
    // 独立性：作者不能是执行者本人。执行者身份由 --implementer 传入
    // （没传就不判——无从比较时不能假装判过）。
    if (author && implementer && author[1].trim().toLowerCase() === String(implementer).trim().toLowerCase()) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `report Author is the implementer (${author[1].trim()}) — the implementer cannot verify their own change`,
        allowed_actions: ['have a different instance write the report'],
        exit_code: 2,
        next: 'independent verification means a different instance. Author must differ from --implementer.',
      };
    }
    // 声明 PASS 的检查必须贴出输出片段：其后 8 行内有一个非空的围栏块或引用块。
    const lines = report.split('\n');
    const noSnippet = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*-\s*(Tests|Red check|Real-use validation|Lint|Scope check|Denylist check):\s*`[^`]+`\s*(?:→|->)\s*(PASS)\b/);
      if (!m) continue;
      const window = lines.slice(i + 1, i + 9).join('\n');
      const fence = window.match(/^\s*(```|~~~)[^\n]*\n([\s\S]*?)^\s*\1\s*$/m);
      const quote = window.match(/^\s*>\s*\S/m);
      const hasSnippet = (fence && fence[2].trim().length > 0) || quote;
      if (!hasSnippet) noSnippet.push(m[1]);
    }
    if (noSnippet.length) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence claims PASS for ${noSnippet.join(', ')} but carries no output snippet — paste at least one line of real output under the check`,
        allowed_actions: ['re-run the check and paste its output'],
        exit_code: 2,
        next: 'a claim without output is a claim. Put a fenced block or a `>` line with the real output under each PASS.',
      };
    }
    if (missing.length) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: `evidence file ${evidenceFile} is missing: ${missing.join('; ')}`,
        allowed_actions: ['add the missing fields to the verifier report'],
        exit_code: 2,
        next: 'the report must name its author and the commit it reviewed. See templates/verifier-report.md.',
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

    // 8c. 重放证据里的命令。
    //
    // 只校验格式时，一份写得漂亮的报告和一次真的验证在闸门眼里没有区别——
    // 而"独立验证"是整套框架唯一无法自证的承诺。重放是让它可自证的最小手段：
    // 报告说 `cmd → PASS`，闸门就真的跑一遍，退出码与 PASS/FAIL 对不上就拒绝。
    //
    // 命令直接从已有的证据行取（`- Tests: `<cmd>` → PASS`），不再要求第二个格式：
    // 一个概念一个定义。没有命令的检查行（`Red check: PASS — …`）无法重放，
    // 只能算作未重放。
    const replayable = [...report.matchAll(EVIDENCE_LINE)]
      .map((m) => ({ name: m[1], command: (m[0].match(/`([^`]+)`/) || [])[1], status: m[2] }))
      .filter((c) => c.command);
    if (replayable.length === 0) {
      return {
        ...base,
        decision: 'escalate',
        gate: 'verification-evidence',
        reason: 'evidence carries no replayable command (every check line lacks a `<command>`)',
        allowed_actions: ['write the command next to each check so it can be re-run'],
        exit_code: 2,
        next: 'a check without its command cannot be verified. Use `- Tests: `<cmd>` → PASS`.',
      };
    }
    if (noReplay) {
      evidenceNotRun = [...evidenceNotRun, 'Evidence replay'];
      replaySkipped = true;
    } else if (changeClass !== 'behavior') {
      // docs/config/refactor 的证据命令常常不可重入（改文档没有"跑一遍"）。
      // 片段与署名仍然校验——那是防伪造的部分，重放是防"命令没跑"的部分。
      evidenceNotRun = [...evidenceNotRun, 'Evidence replay'];
      replaySkipped = true;
    } else {
      const cwd = evidenceCwd || process.cwd();
      const mismatched = [];
      for (const { command, status, name } of replayable) {
        const r = runEvidenceCommand(command, cwd, 120000);
        const wantPass = status === 'PASS';
        const gotPass = r.exitCode === 0;
        if (r.timedOut) mismatched.push(`${name}: ${command} (timed out)`);
        else if (gotPass !== wantPass) {
          mismatched.push(`${name}: ${command} (claimed ${status}, command exited ${r.exitCode})`);
        }
      }
      if (mismatched.length) {
        return {
          ...base,
          decision: 'escalate',
          gate: 'verification-evidence',
          reason: `evidence replay failed: ${mismatched.join('; ')}`,
          allowed_actions: ['re-run the verification and record the real result'],
          exit_code: 2,
          next: 'the report claims results the commands do not reproduce. Re-run them and fix the report.',
        };
      }
    }
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
  const allNotRun = [...new Set([
    ...evidenceNotRun,
    ...notRun,
  ])];
  return {
    ...base,
    decision: 'proceed',
    gate: null,
    reason: 'all gates passed',
    // fix 阶段的 approve 是中间检查，不是合并许可。不改变退出码（现有冒烟依赖 proceed），
    // 但必须说出来，否则"闸门过了"会被读成"可以合并"。
    ...(phase === 'fix' && verdict === 'approve'
      ? { warning: 'approve at fix phase is not a gate; merge requires --phase gate' }
      : {}),
    ...(replaySkipped ? { warning: `evidence commands were not replayed (${noReplay ? '--no-replay' : `change class ${changeClass}`}); recorded as NOT RUN` } : {}),
    checks_not_run: allNotRun,
    allowed_actions: ['propose PR', 'update state', 'request human merge'],
    forbidden_actions: ['auto-merge to main'],
    exit_code: 0,
    next: allNotRun.length
      ? `propose the change, but list these as NOT RUN in the PR body: ${allNotRun.join(', ')}`
      : 'propose the change; merge remains human unless the path is explicitly allowlisted',
  };
}

/**
 * --head-sha 缺省时自己取。调用方填的 head 只是自证；
 * 让脚本读 git，至少把"当前 HEAD 是什么"从断言变成事实。
 * 不在 git 仓库里就返回 null，由 head-commit 闸门升级（要求显式传参）。
 */
function resolveHeadSha() {
  // 必须清掉继承来的 GIT_DIR / GIT_WORK_TREE。pre-commit hook 里跑时它们指向
  // 外层仓库，于是临时目录里的 `git rev-parse HEAD` 会解析到外层 HEAD，
  // "不在 git 仓库里"这一分支永远走不到。
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 工作区里未提交的改动（含未跟踪文件）。
 *
 * 不在 git 仓库里返回 null——那是调用环境问题，由 head-sha 那条路径报参数错误；
 * 这里不能把"读不到"读成"干净"。
 */
export function dirtyFiles(cwd) {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR']) delete env[k];
  let out;
  try {
    // -uall：未跟踪目录默认折叠成 `templates/`，那个名字匹配不上 `templates/**`，
    // 于是"新增了一整个被禁目录"在输出里看起来像一件小事。逐个文件报。
    out = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env, cwd,
    });
  } catch {
    return null;
  }
  return out.split('\n').filter(Boolean).map((line) => {
    // `R  old -> new` 取新路径；其余 `XY path` 从第 4 个字符起。
    const rest = line.slice(3).trim();
    const arrow = rest.indexOf(' -> ');
    return (arrow === -1 ? rest : rest.slice(arrow + 4)).replace(/^"|"$/g, '');
  });
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, [
    'item', 'phase', 'attempts', 'diffFiles', 'verdict', 'pause', 'cleanup',
    'reviewedSha', 'headSha', 'redCheck', 'changeClass', 'implementer', 'constraintsRoot', 'notRun',
    'evidenceFile', 'evidenceCwd', 'noReplay', 'state', 'json', 'help', 'dirtyFiles',
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
  --state <dir|file>     Read state and default policy from this directory, or the
                         parent of this state file (default: cwd).
  --pause                Set if loop-pause-all is active
  --cleanup              Treat as a cleanup change (higher file limit)
  --reviewed-sha <sha>   Commit SHA that was reviewed (40/64 hex; required at --phase gate)
  --head-sha <sha>       Current head SHA. Omitted -> read from git rev-parse HEAD
                         (required at --phase gate; fails if neither is available)
  --red-check <state>    pass | fail | not-run — does the new test fail on pre-fix code? (default: not-run)
  --change-class <c>     behavior | docs | config | refactor (default: behavior, fail-closed).
                         Only behavior requires the red check at the gate phase; the others
                         must justify the skipped red check in "### Checks not run".
  --implementer <id>     Who wrote the change. Required with --verdict approve at
                         --phase gate (exit 1 without it: independence cannot be
                         judged without knowing the implementer). If the report's
                         Author matches this, the gate refuses.
  --evidence-file <p>    Verifier report. Required with --verdict approve at --phase gate:
                         the gate reads it, checks the verdict/evidence lines, requires
                         Author: / Reviewed commit: / Change class confirmed: (must match
                         --change-class) / an output snippet per PASS, and re-runs the
                         command in each evidence line (the <cmd> after the check name).
  --evidence-cwd <dir>   Directory the evidence commands run in (default: cwd)
  --no-replay            Skip re-running evidence commands; the result is listed as NOT RUN
  --constraints-root <d> Override the policy directory (default: --state directory,
                         or its parent for a state file). Denylist and limits use it.
  --not-run <list>       Comma-separated checks that were NOT run (listed, never omitted)
  --dirty-files <list>   Override the uncommitted-change list. Omitted -> read from
                         git status --porcelain. Non-empty at --phase gate -> escalate
                         (dirty-tree): the diff list is built from committed changes,
                         so uncommitted edits would slip past denylist and scope.
                         changed-files.txt / verifier-report.md are exempt.
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

  // sha 必须是真实的 commit id。假 sha 对假 sha 曾经也能过闸——
  // 调用方自己填两个字符串，闸门只比较它们是否相等。
  const SHA_RE = /^[0-9a-f]{40}([0-9a-f]{24})?$/i;
  const checkSha = (v, flag) => {
    if (v === undefined) return;
    if (!SHA_RE.test(String(v))) fail(`${flag} must be a 40- or 64-char hex commit id (got: ${v})`, 1);
  };
  checkSha(args.reviewedSha, '--reviewed-sha');
  checkSha(args.headSha, '--head-sha');

  // 独立性是唯一无法自证的承诺：缺 --implementer 时闸门根本无从比较，
  // "没传就不判"让省略参数变成绕过方式。gate 阶段的 approve 必须给。
  if (args.phase === 'gate'
    && normalizeVerdict(args.verdict ?? 'none') === 'approve'
    && (typeof args.implementer !== 'string' || !args.implementer.trim())) {
    fail('--phase gate --verdict approve requires --implementer <id> '
      + '(the gate cannot check independence without knowing who implemented)', 1);
  }

  for (const [key, flag] of [['state', '--state'], ['constraintsRoot', '--constraints-root']]) {
    if (args[key] !== undefined && (typeof args[key] !== 'string' || !args[key].trim())) {
      fail(`${flag} requires a directory path${key === 'state' ? ' or state file' : ''}`, 1);
    }
  }
  const statePath = path.resolve(args.state ?? process.cwd());
  const state = stateFiles(statePath);
  // 读不到状态文件 ≠ 没有暂停。fail-closed：让调用方修正参数，而不是让闸门放行。
  if (!state.readable) {
    fail(`--state ${statePath}: no STATE.md, harness-constraints.md or loop-constraints.md found `
      + `(pass a directory that contains them, or the file itself)`, 1);
  }
  // gate 阶段拿不到 head 是调用环境的问题，不是"验证失败"：报参数错误，
  // 别让它伪装成一次正常升级。checkGates 自身仍把缺 sha 当 escalate。
  const actualHead = resolveHeadSha();
  const resolvedHead = actualHead || (typeof args.headSha === 'string' ? args.headSha : null);
  if (args.phase === 'gate' && !resolvedHead) {
    fail('--phase gate needs --head-sha, or a git repository to read HEAD from', 1);
  }
  if (args.phase === 'gate' && actualHead && typeof args.headSha === 'string' && args.headSha !== actualHead) {
    printJson({ decision: 'escalate', gate: 'head-commit', reason: 'supplied --head-sha differs from actual HEAD', exit_code: 2 });
    process.exit(2);
  }

  // 脏工作区只在 gate 阶段判：fix 阶段是派发前的预检，那时改动本来就还没提交。
  // 显式传 --dirty-files 时以调用方为准（测试与特殊布局需要）。
  const dirty = args.dirtyFiles !== undefined
    ? String(args.dirtyFiles).split(',').map((s) => s.trim()).filter(Boolean)
    : (args.phase === 'gate' ? (dirtyFiles(process.cwd()) ?? []) : []);

  const activeFile = state.files.find((f) => f.name === 'STATE.md');
  const active = activeFile ? activeItems(activeFile.text) : { count: null, malformed: null };

  // 阈值来自约束文件；缺失的项回落到 DEFAULTS，并在输出里标出来源。
  // 只读 denylist 不读阈值，等于把"可配置的策略"做成了"写死的常量"。
  const constraintsRoot = path.resolve(args.constraintsRoot
    ?? (fs.statSync(statePath).isFile() ? path.dirname(statePath) : statePath));
  let policyDirectory = false;
  try { policyDirectory = fs.statSync(constraintsRoot).isDirectory(); } catch { /* 参数检查 */ }
  if (!policyDirectory) fail(`--constraints-root ${constraintsRoot}: expected an existing directory`, 1);
  const limits = loadLimits(constraintsRoot);
  const cfg = {
    maxAttempts: limits.maxAttempts ?? DEFAULT_BREAKER.maxAttempts,
    maxFilesPerFix: limits.maxFilesPerFix ?? DEFAULTS.maxFilesPerFix,
    maxFilesPerCleanup: limits.maxFilesPerCleanup ?? DEFAULTS.maxFilesPerCleanup,
    limitsSource: limits.maxFilesPerFix !== null ? 'constraints' : 'defaults',
  };

  const input = {
    item: typeof args.item === 'string' ? args.item : null,
    activeCount: active.count,
    activeMalformed: active.malformed,
    phase: enumArg(args.phase, PHASES, '--phase') ?? null,
    attempts: numArg(args.attempts, '--attempts', 0),
    diffFiles,
    verdict: enumArg(
      args.verdict === undefined ? undefined : normalizeVerdict(args.verdict),
      VERDICTS, '--verdict') ?? 'none',
    // kill switch：--state 给了就自己读文件；否则只认 --pause。
    // 两者都必须真的改变退出码——文档里写着"暂停即退出"，代码里就得有入口。
    pause: boolArg(args.pause) || isPaused(statePath).paused,
    isCleanup: boolArg(args.cleanup),
    // 拒绝列表的真相源是本仓库的 loop-constraints.md，不是脚本里的常量。
    // 维护者按文档在 ## Repo-Specific 加的路径必须真的被强制执行。
    denylist: loadDenylist(constraintsRoot),
    stateText: activeFile ? activeFile.text : null,
    dirtyFiles: dirty,
    reviewedSha: typeof args.reviewedSha === 'string' ? args.reviewedSha : null,
    headSha: resolvedHead,
    redCheck: enumArg(args.redCheck, RED_CHECKS, '--red-check') ?? 'not-run',
    changeClass: enumArg(args.changeClass, CHANGE_CLASSES, '--change-class') ?? 'behavior',
    implementer: typeof args.implementer === 'string' ? args.implementer : null,
    evidenceFile: typeof args.evidenceFile === 'string' ? args.evidenceFile : null,
    evidenceCwd: typeof args.evidenceCwd === 'string' ? args.evidenceCwd : null,
    noReplay: boolArg(args.noReplay),
    notRun: typeof args.notRun === 'string'
      ? args.notRun.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  };

  let result = checkGates(input, cfg);
  // 证据命令可能改变工作区或 HEAD；只检查重放之前的状态不能证明最终状态。
  if (result.decision === 'proceed' && args.phase === 'gate' && input.changeClass === 'behavior' && !input.noReplay) {
    const afterHead = resolveHeadSha();
    const afterDirty = dirtyFiles(process.cwd());
    const unexpected = afterDirty?.filter((f) => !LOOP_ARTIFACTS.includes(f));
    if (!afterHead || !actualHead || afterHead !== actualHead || !afterDirty || unexpected.length) {
      result = { ...result, decision: 'escalate', gate: afterHead !== actualHead ? 'head-commit' : 'dirty-tree',
        reason: 'cannot verify clean reviewed HEAD after evidence replay, or replay changed it',
        allowed_actions: ['inspect the evidence command and re-verify the reviewed commit'],
        forbidden_actions: ['request merge on this gate result'],
        next: 'inspect the replay effects and re-run independent verification before requesting a merge', exit_code: 2 };
    }
  }

  printJson(result);
  process.exit(result.exit_code);
}

if (isEntryPoint(import.meta.url)) {
  main();
}
