#!/usr/bin/env node
/**
 * loop-audit.mjs — 就绪度审计
 *
 * 检查 harness 五子系统与 loop 六原语的落地情况，给出 0–100 分与 L0–L3 等级。
 *
 * 用法：
 *   node scripts/loop-audit.mjs .
 *   node scripts/loop-audit.mjs /path/to/repo --json
 *   node scripts/loop-audit.mjs . --suggest
 *
 * 退出码：0 = score >= 40；2 = score < 40。
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  parseArgs, exists, readText, readJson, listFiles, printJson,
  STATE_FILES, LOOP_SKILL_NAMES, SKILL_DIRS,
} from './lib/common.mjs';

/** 评分权重 */
export const SCORE_WEIGHTS = {
  base: 10,
  stateFile: 18,
  triage: 14,
  loopConfig: 9,
  agentsMd: 9,
  skillsTwoPlus: 14,
  skillsOne: 7,
  verifier: 14,
  safetyLoopMd: 4,
  safetyDoc: 4,
  github: 6,
  githubWorkflows: 4,
  mcp: 3,
  worktree: 3,
  registry: 2,
  budgetDoc: 3,
  runLog: 3,
  loopMdBudget: 2,
  budgetSkill: 2,
  toolScope: 3,
  stallDetection: 3,
  escalation: 3,
  constraintsFile: 4,
  constraintsSkill: 2,
  loopActivity: 6,
  // 验证子系统的入口工件。LHE 的定义是「init.sh 或文档化命令」——
  // 这是阶段 1 的工件，与 verifier（阶段 2 的独立检查者）是两件事。
  verificationEntry: 6,
};

export const LEVEL_THRESHOLDS = { L1: 38, L2: 58, L3: 78 };

const TRIAGE_SKILLS = [
  'issue-triage', 'pr-review-triage', 'ci-triage', 'loop-triage',
  'dependency-triage', 'post-merge-scan', 'changelog-scan', 'pr-review-triage',
];

/** 收集仓库中的技能 */
function collectSkills(root) {
  const found = new Map();
  for (const dir of SKILL_DIRS) {
    const full = path.join(root, dir);
    if (!exists(full)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(full, { withFileTypes: true });
    } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillMd = path.join(full, e.name, 'SKILL.md');
      if (exists(skillMd)) {
        found.set(e.name, { name: e.name, dir: path.join(dir, e.name), content: readText(skillMd) });
      }
    }
  }
  return found;
}

/** 判断是否存在 verifier（技能、agent 定义或 TOML） */
function hasVerifier(root, skills) {
  if (skills.has('loop-verifier')) return true;
  for (const [name, s] of skills) {
    if (name.includes('verifier')) return true;
    if (/independent\s+(checker|verifier)|maker\/checker/i.test(s.content)) return true;
  }
  const agentPaths = [
    '.claude/agents', '.codex/agents', '.grok/agents',
  ];
  for (const dir of agentPaths) {
    const full = path.join(root, dir);
    if (!exists(full)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(full);
    } catch { continue; }
    for (const f of entries) {
      if (/verifier/i.test(f)) return true;
    }
  }
  return false;
}

/**
 * 循环活动动态证据。
 *
 * 只认**真实运行痕迹**，不认"文件存在"——文件存在是结构性就绪，
 * 已由其他检查项计分。这里的目的是回答"它真的跑过吗"。
 */
function detectLoopActivity(root, stateText, files, loopText) {
  const evidence = [];

  // 1. 状态文件里有真实的 Last run 时间戳（占位符不算）
  const lastRunMatch = stateText && stateText.match(/last\s*run\s*[:：]\s*(.+)/i);
  if (lastRunMatch) {
    const value = lastRunMatch[1].trim();
    const isPlaceholder = /^(never|—|-|none|n\/a|tbd|todo)$/i.test(value);
    const looksLikeTime = /\d{4}-\d{2}-\d{2}|\d{2}:\d{2}/.test(value);
    if (!isPlaceholder && looksLikeTime) {
      evidence.push('state file records a real Last run timestamp');
    }
  }

  // 2. 运行日志里有真实的运行条目（JSON 对象含 run_id），不只是模板
  for (const name of ['loop-run-log.md', 'run-log.md']) {
    const p = path.join(root, name);
    if (!exists(p)) continue;
    const text = readText(p);
    // 只看 "## Log" 章节——格式说明里的示例 JSON 不是真实运行
    const logSection = text.split(/^##\s+Log\s*$/m)[1] ?? '';
    const entries = [...logSection.matchAll(/\{[^{}]*"run_id"[^{}]*\}/g)];
    if (entries.length > 0) {
      evidence.push(`${name} contains ${entries.length} run record(s)`);
      break;
    }
  }

  // 3. 状态文件的 Active 表里有真实 work item（不是占位行）
  if (stateText) {
    const activeRows = stateText
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .map((l) => l.split('|').map((c) => c.trim()).filter(Boolean))
      .filter((cells) => cells.length >= 2
        && !/^-+$/.test(cells[0])
        && !/^work item$/i.test(cells[0])
        && !/^(—|-|none)$/i.test(cells[0]));
    if (activeRows.length > 0) {
      evidence.push(`state file tracks ${activeRows.length} active work item(s)`);
    }
  }

  // 4. git 历史里有真实的循环提交
  try {
    const out = execSync('git log --oneline -25', {
      cwd: root, stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500,
    }).toString();
    if (/loop|triage|changelog-drafter|post-merge|daily triage|loop-run-log/i.test(out)) {
      evidence.push('recent git history references loop artifacts');
    }
  } catch { /* 非 git 仓库或超时，忽略 */ }

  return { present: evidence.length > 0, evidence: [...new Set(evidence)].slice(0, 4) };
}

/** 主评分函数 */
export function scoreHarness(root, opts = {}) {
  const files = listFiles(root, { maxFiles: 2000 });
  const has = (n) => exists(path.join(root, n));
  const hasAny = (names) => names.some((n) => has(n));

  const agentsText = has('AGENTS.md') ? readText(path.join(root, 'AGENTS.md'))
    : has('CLAUDE.md') ? readText(path.join(root, 'CLAUDE.md')) : '';
  const loopText = has('LOOP.md') ? readText(path.join(root, 'LOOP.md')) : '';
  const statePath = STATE_FILES.map((f) => path.join(root, f)).find((p) => exists(p)) || null;
  const stateText = statePath ? readText(statePath) : '';
  const allSkillText = SKILL_DIRS
    .map((d) => path.join(root, d))
    .filter((p) => exists(p))
    .map((p) => {
      try {
        return fs.readdirSync(p).map((n) => {
          const md = path.join(p, n, 'SKILL.md');
          return exists(md) ? readText(md) : '';
        }).join('\n');
      } catch { return ''; }
    })
    .join('\n');
  const corpus = [agentsText, loopText, stateText, allSkillText].join('\n');

  const skills = collectSkills(root);
  const skillNames = [...skills.keys()];
  const loopSkillCount = skillNames.filter((n) => LOOP_SKILL_NAMES.includes(n)).length;
  const triagePresent = skillNames.some((n) => TRIAGE_SKILLS.includes(n))
    || /triage/i.test(allSkillText);
  const verifierPresent = hasVerifier(root, skills);

  const checks = [];
  const add = (key, label, ok, weight) => {
    checks.push({ key, label, ok: Boolean(ok), weight });
    return ok ? weight : 0;
  };

  let score = SCORE_WEIGHTS.base;
  score += add('stateFile', 'State file exists (STATE.md or pattern state)', Boolean(statePath), SCORE_WEIGHTS.stateFile);
  score += add('triage', 'A triage skill exists', triagePresent, SCORE_WEIGHTS.triage);
  score += add('loopConfig', 'LOOP.md exists', has('LOOP.md'), SCORE_WEIGHTS.loopConfig);
  score += add('agentsMd', 'AGENTS.md or CLAUDE.md exists', has('AGENTS.md') || has('CLAUDE.md'), SCORE_WEIGHTS.agentsMd);

  if (loopSkillCount >= 2) score += SCORE_WEIGHTS.skillsTwoPlus;
  else if (loopSkillCount === 1) score += SCORE_WEIGHTS.skillsOne;
  add('skills', `Loop skills present (${loopSkillCount} found)`, loopSkillCount >= 1, SCORE_WEIGHTS.skillsTwoPlus);

  score += add('verifier', 'Independent verifier present (maker/checker split)', verifierPresent, SCORE_WEIGHTS.verifier);
  // 验证入口：init.sh 或指令文件里写明的验证命令。
  // 与 verifier 分开计分——阶段 1 只需要入口，阶段 2 才需要独立检查者。
  const verificationEntry = has('init.sh')
    || /verification commands|验证命令|npm test|pytest|cargo test|go test/i.test(agentsText);
  score += add('verificationEntry', 'Verification entrypoint exists (init.sh or documented commands)', verificationEntry, SCORE_WEIGHTS.verificationEntry);
  score += add('safetyLoopMd', 'LOOP.md documents gates/denylist/auto-merge', /gate|denylist|auto-merge|safety/i.test(loopText), SCORE_WEIGHTS.safetyLoopMd);
  score += add('safetyDoc', 'Safety documentation exists', hasAny(['docs/04-safety.md', 'docs/safety.md', 'SECURITY.md']), SCORE_WEIGHTS.safetyDoc);
  score += add('github', '.github directory present', exists(path.join(root, '.github')), SCORE_WEIGHTS.github);
  score += add('githubWorkflows', '.github/workflows present', exists(path.join(root, '.github/workflows')), SCORE_WEIGHTS.githubWorkflows);
  score += add('mcp', 'MCP/connector config or mention', hasAny(['.mcp.json', 'mcp.json']) || /mcp/i.test(loopText), SCORE_WEIGHTS.mcp);
  score += add('worktree', 'Worktree isolation documented', /worktree/i.test(corpus), SCORE_WEIGHTS.worktree);
  score += add('registry', 'patterns/registry.yaml present', has('patterns/registry.yaml'), SCORE_WEIGHTS.registry);
  score += add('budgetDoc', 'loop-budget.md present', has('loop-budget.md'), SCORE_WEIGHTS.budgetDoc);
  score += add('runLog', 'loop-run-log.md present', has('loop-run-log.md'), SCORE_WEIGHTS.runLog);
  score += add('loopMdBudget', 'LOOP.md documents budget/kill switch', /budget|max tokens|token cap|kill switch|loop-pause-all/i.test(loopText), SCORE_WEIGHTS.loopMdBudget);
  score += add('budgetSkill', 'loop-budget skill present', skills.has('loop-budget'), SCORE_WEIGHTS.budgetSkill);
  score += add('toolScope', 'Least-privilege / tool scope declared', /least[- ]privilege|tool scope|scoped tools?|allow-?list|read-only tools?|permission scope/i.test(corpus), SCORE_WEIGHTS.toolScope);
  score += add('stallDetection', 'Stall detection / circuit breaker present', skills.has('loop-guard') || /circuit breaker|max attempts|no[- ]progress|stagnation|same error/i.test(corpus), SCORE_WEIGHTS.stallDetection);
  score += add('escalation', 'Escalation path documented', /escalat|hand[- ]?off|human[- ]in[- ]the[- ]loop|\bHITL\b|human review|needs? human|stop and ask|exit code 2/i.test(corpus), SCORE_WEIGHTS.escalation);
  score += add('constraintsFile', 'loop-constraints.md present', has('loop-constraints.md'), SCORE_WEIGHTS.constraintsFile);
  score += add('constraintsSkill', 'loop-constraints skill present', skills.has('loop-constraints'), SCORE_WEIGHTS.constraintsSkill);

  const activity = detectLoopActivity(root, stateText, files, loopText);
  score += add('loopActivity', 'Real loop activity evidence', activity.present, SCORE_WEIGHTS.loopActivity);

  // 按权重总和归一化，使 100 分严格等于"所有检查通过"。
  // 不归一化时权重总和大于 100，失败若干项仍会显示满分。
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) + SCORE_WEIGHTS.base;
  score = Math.min(100, Math.max(0, Math.round((score / totalWeight) * 100)));

  const costReady = has('loop-budget.md') && has('loop-run-log.md')
    && /budget/i.test(loopText);
  const hasRealActivity = activity.present;
  const l3Ready = costReady && hasRealActivity;

  // verifier 条件只在这里判一次。之前它散在 L2/L3/三条 findings 里，
  // 改一处漏一处就会静默放水（d7d049d 之后真的发生过一次）。
  const verifierOk = Boolean(verifierPresent);
  const stateOk = Boolean(statePath);

  let level = 'L0';
  // L2 的定义是"由独立 verifier 验证的辅助修复"——没有 verifier 就不成立。
  // 没有 verifier 却给 L2，等于批准自我验证，与 docs/03 的规则冲突。
  if (verifierOk && score >= LEVEL_THRESHOLDS.L3 && stateOk && l3Ready) level = 'L3';
  else if (verifierOk && score >= LEVEL_THRESHOLDS.L2 && triagePresent) level = 'L2';
  else if (score >= LEVEL_THRESHOLDS.L1 && stateOk) level = 'L1';

  // 封顶告警
  const findings = [];
  if (score >= LEVEL_THRESHOLDS.L2 && triagePresent && !verifierOk) {
    findings.push('Capped at L1: no verifier. L2 means "fixes verified by an independent checker" — without one, the loop would self-verify.');
  }
  if (verifierOk && score >= LEVEL_THRESHOLDS.L3 && stateOk && !costReady) {
    findings.push('Capped at L2: cost observability incomplete (need loop-budget.md + loop-run-log.md + a budget section in LOOP.md).');
  }
  if (verifierOk && score >= LEVEL_THRESHOLDS.L3 && stateOk && costReady && !hasRealActivity) {
    findings.push('Capped at L2: no real loop activity recorded yet. Structural readiness is not the same as having run.');
  }
  if (!statePath) findings.push('FAIL: no state file. The loop loses memory every run.');
  if (!triagePresent) findings.push('No triage skill: the loop cannot decide what is worth acting on.');
  if (!verifierPresent) findings.push('No verifier: maker/checker split incomplete. A model grading its own work is untrustworthy.');

  let assessment;
  if (score >= 82 && l3Ready) assessment = 'Strong loop readiness — good candidate for L3 with explicit gates.';
  else if (score >= 82 && !costReady) assessment = 'Structurally strong, but cost observability is missing. Add budget docs and a run log before L3.';
  else if (score >= 82 && !hasRealActivity) assessment = 'Structurally strong but no evidence of real runs. Run one full cycle and commit the log.';
  else if (score >= 62) assessment = 'Good foundation — add the missing verifier and safety docs for L3.';
  else if (score >= 42) assessment = 'Early loop setup — focus on L1 state and triage before enabling any actions.';
  else assessment = 'Not loop-ready — start with a starter harness and L1 report-only.';

  return {
    root,
    score,
    level,
    assessment,
    findings,
    checks,
    subsystems: summarizeSubsystems(checks),
    activity,
    costReady,
    l3Ready,
  };
}

function summarizeSubsystems(checks) {
  const map = {
    instructions: ['agentsMd', 'loopConfig'],
    state: ['stateFile', 'runLog'],
    // 验证子系统含两个层次：入口（阶段 1）与独立检查者（阶段 2）
    verification: ['verificationEntry', 'verifier'],
    scope: ['constraintsFile', 'constraintsSkill', 'toolScope'],
    lifecycle: ['budgetDoc', 'budgetSkill', 'stallDetection', 'escalation'],
  };
  const out = {};
  for (const [name, keys] of Object.entries(map)) {
    const items = checks.filter((c) => keys.includes(c.key));
    const passed = items.filter((c) => c.ok).length;
    out[name] = { passed, total: items.length, score: items.length ? Math.max(1, Math.round(passed / items.length * 5)) : 0 };
  }
  return out;
}

const SUGGESTIONS = {
  stateFile: 'Create STATE.md from templates/STATE.md',
  triage: 'Add a triage skill (issue-triage / pr-review-triage / ci-triage)',
  loopConfig: 'Create LOOP.md from templates/LOOP.md',
  agentsMd: 'Create AGENTS.md from templates/AGENTS.md',
  verifier: 'Add the loop-verifier skill and run it as a separate agent instance',
  constraintsFile: 'Create loop-constraints.md from templates/loop-constraints.md',
  budgetDoc: 'Create loop-budget.md from templates/loop-budget.md',
  runLog: 'Create loop-run-log.md from templates/loop-run-log.md',
  githubWorkflows: 'Wire events in .github/workflows/ — see examples/github-actions/',
  registry: 'Register patterns in patterns/registry.yaml',
  stallDetection: 'Add the loop-guard skill and a loop-ledger.json',
  escalation: 'Document the escalation path in LOOP.md and AGENTS.md',
};

function main() {
  const args = parseArgs();
  if (args.help) {
    process.stdout.write(`loop-audit — score loop-harness readiness

Usage:
  node scripts/loop-audit.mjs [target] [options]

Options:
  --json        Emit JSON
  --suggest     Include remediation suggestions
  --help        Show this help

Exit codes:
  0  score >= 40
  2  score < 40
`);
    return;
  }

  const target = path.resolve(typeof args._[0] === 'string' ? args._[0] : '.');
  if (!exists(target)) {
    process.stderr.write(`error: target not found: ${target}\n`);
    process.exit(1);
  }

  const result = scoreHarness(target);

  if (args.json) {
    printJson(result);
  } else {
    process.stdout.write(`Loop harness audit — ${result.root}\n\n`);
    process.stdout.write(`Score: ${result.score}/100   Level: ${result.level}\n`);
    process.stdout.write(`${result.assessment}\n\n`);

    process.stdout.write('Subsystems:\n');
    for (const [name, s] of Object.entries(result.subsystems)) {
      process.stdout.write(`  ${name.padEnd(14)} ${s.score}/5  (${s.passed}/${s.total} checks)\n`);
    }
    process.stdout.write('\nChecks:\n');
    for (const c of result.checks) {
      process.stdout.write(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.label}  [${c.weight}]\n`);
    }
    if (result.findings.length) {
      process.stdout.write('\nFindings:\n');
      for (const f of result.findings) process.stdout.write(`  - ${f}\n`);
    }
    if (args.suggest) {
      const failing = result.checks.filter((c) => !c.ok && SUGGESTIONS[c.key]);
      if (failing.length) {
        process.stdout.write('\nSuggestions:\n');
        for (const c of failing) process.stdout.write(`  - ${SUGGESTIONS[c.key]}\n`);
      }
      process.stdout.write('\nScaffold everything missing:\n');
      process.stdout.write('  node scripts/init-loop-harness.mjs --target . --level L1\n');
    }
  }

  process.exit(result.score >= 40 ? 0 : 2);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
