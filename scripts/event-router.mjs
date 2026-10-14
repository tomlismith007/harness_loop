#!/usr/bin/env node
/**
 * event-router.mjs — 事件 → 阶段 → 技能 → 闸门
 *
 * 用法：
 *   node scripts/event-router.mjs --event pull_request_review.changes_requested --item pr-123
 *   node scripts/event-router.mjs --list
 *   node scripts/event-router.mjs --event issues.opened --state STATE.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, fail } from './lib/common.mjs';

/**
 * 路由表。与 LOOP.md 保持一致——LOOP.md 是人类可读版本，这里是机械执行版本。
 * 修改路由时两处都要改。
 */
export const ROUTES = {
  // ---- Issue ----
  'issues.opened': {
    phase: 'intake',
    skills: ['issue-triage'],
    level: 'L1',
    gates: ['denylist'],
    next: 'produce triage report into STATE.md; propose labels only, do not apply',
  },
  'issues.reopened': {
    phase: 'intake',
    skills: ['issue-triage'],
    level: 'L1',
    gates: ['denylist'],
    next: 'triage as regression candidate; check if a prior fix was reverted',
  },
  'issues.labeled': {
    phase: 'intake',
    skills: ['issue-triage'],
    level: 'L1',
    gates: ['denylist'],
    next: 're-evaluate priority and proposed labels',
  },
  'issues.closed': {
    phase: 'close',
    skills: ['post-merge-cleanup'],
    level: 'L1',
    gates: ['denylist'],
    next: 'scan for related TODOs and debt left behind',
  },

  // ---- Pull request ----
  'pull_request.opened': {
    phase: 'review',
    skills: ['pr-review-triage'],
    level: 'L1',
    gates: ['denylist'],
    next: 'summarize CI, reviews, blocking comments; suggest loop action per PR',
  },
  'pull_request.synchronize': {
    phase: 'review',
    skills: ['pr-review-triage'],
    level: 'L1',
    gates: ['denylist'],
    next: 're-evaluate PR state after new commits',
  },
  'pull_request_review.changes_requested': {
    phase: 'fix',
    skills: ['minimal-fix', 'loop-verifier'],
    level: 'L2',
    gates: ['denylist', 'max-attempts', 'scope', 'verification'],
    next: 'spawn implementer in isolated worktree, then spawn verifier with fresh context',
  },
  'pull_request_review.approved': {
    phase: 'gate',
    skills: ['gate-check'],
    level: 'L2',
    gates: ['denylist', 'scope', 'verification', 'budget'],
    next: 'run gate-check; merge remains human unless allowlisted',
  },
  'pull_request.ready_for_review': {
    phase: 'gate',
    skills: ['gate-check'],
    level: 'L2',
    gates: ['denylist', 'scope', 'verification', 'budget'],
    next: 'run gate-check; report readiness; do not merge',
  },
  'pull_request.closed:merged': {
    phase: 'post-merge',
    skills: ['post-merge-cleanup'],
    level: 'L1',
    gates: ['denylist', 'scope'],
    next: 'scan merged diff for follow-up work; propose small fixes, file tickets for large',
  },
  'pull_request.closed:unmerged': {
    phase: 'close',
    skills: [],
    level: 'L1',
    gates: [],
    next: 'log outcome to loop-run-log.md for statistics; no action',
  },

  // ---- CI ----
  'check_suite.completed:failure': {
    phase: 'fix',
    skills: ['ci-triage', 'minimal-fix', 'loop-verifier'],
    level: 'L2',
    gates: ['denylist', 'max-attempts', 'scope', 'verification'],
    next: 'classify (flake/regression/env/config); only regression is actionable; env escalates',
  },
  'check_suite.completed:success': {
    phase: 'verify',
    skills: [],
    level: 'L1',
    gates: [],
    next: 'update work item state; clear resolved failures from STATE.md',
  },
  'workflow_run.completed:failure': {
    phase: 'fix',
    skills: ['ci-triage', 'minimal-fix'],
    level: 'L2',
    gates: ['denylist', 'max-attempts', 'scope'],
    next: 'classify failure; escalate environment and infra failures',
  },

  // ---- Release ----
  'push:tags': {
    phase: 'release',
    skills: ['release-drafter'],
    level: 'L1',
    gates: ['denylist'],
    next: 'draft release notes from merged PRs; never publish or tag',
  },
  'release.published': {
    phase: 'close',
    skills: [],
    level: 'L1',
    gates: [],
    next: 'archive related work items in STATE.md',
  },
};

/** 从 STATE.md 的 Active 表提取 acting_on 锁 */
export function readLocks(statePath) {
  const text = readText(statePath);
  if (!text) return [];
  const locks = [];
  const lines = text.split('\n');
  let inActive = false;
  // 按表头名定位列，不按固定下标。旧实现先 filter(Boolean) 丢掉空单元格再按下标取值，
  // 空单元格会把后面的列整体左移（acting_on 读成别的列）；部分填充的行则因长度不足被丢弃。
  let colItem = 0;
  let colActingOn = 3;
  for (const line of lines) {
    if (/^##\s+Active\b/i.test(line.trim())) { inActive = true; continue; }
    if (/^##\s+/.test(line) && inActive) { inActive = false; continue; }
    if (!inActive) continue;
    if (!line.trim().startsWith('|')) continue;
    // 保留空单元格，只去掉首尾管道产生的空串
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-*$/.test(c))) continue;

    // 表头行（可能是中文）——按名取列，之后都按名字而不是位置
    const header = cells.map((c) => c.toLowerCase());
    const iItem = header.findIndex((c) => /work\s*item|工作项|^item$/.test(c));
    const iActing = header.findIndex((c) => /acting_on|作用对象/.test(c));
    if (iItem >= 0 || iActing >= 0) {
      if (iItem >= 0) colItem = iItem;
      if (iActing >= 0) colActingOn = iActing;
      continue;
    }

    const item = cells[colItem];
    const actingOn = cells[colActingOn];
    if (item && actingOn && actingOn !== '—' && actingOn !== '-') {
      locks.push({ item, acting_on: actingOn });
    }
  }
  return locks;
}

/** 路由一个事件 */
export function route(event, opts = {}) {
  const spec = ROUTES[event];
  if (!spec) {
    return {
      event,
      registered: false,
      phase: null,
      skills: [],
      level: null,
      gates: [],
      next: 'event is not registered — add it to LOOP.md and scripts/event-router.mjs, or record it in the Watch List. Do not invent a flow.',
    };
  }
  const result = {
    event,
    registered: true,
    item: opts.item || null,
    phase: spec.phase,
    skills: spec.skills,
    level: spec.level,
    gates: spec.gates,
    next: spec.next,
  };

  // 冲突检测
  // 锁键必须是同一个命名空间。acting_on 是 branch/PR，item 是 work item id
  // （pr-45 / ci-a1b2-main），两者用 === 比较意味着 lock-held 永远不会触发——
  // 而"CI Sweeper 已在修某分支时 PR Review 不重复修"正是这条锁唯一该起作用的场景。
  // 因此锁键统一为 acting_on（目标资源），调用方须传 --target；item 仅用于"同一条目"排除。
  if (opts.locks) {
    const target = opts.target || opts.actingOn || null;
    if (target) {
      const holder = opts.locks.find((l) => l.acting_on === target && l.item !== opts.item);
      if (holder) {
        result.conflict = 'lock-held';
        result.held_by = holder.item;
        result.next = 'skip this run, log outcome=no-op (reason: lock-held)';
      }
    }
  }
  return result;
}

function main() {
  const args = parseArgs();

  if (args.help || (!args.event && !args.list)) {
    process.stdout.write(`event-router — map repository events to phase, skills, and gates

Usage:
  node scripts/event-router.mjs --event <event> [--item <id>] [--state STATE.md]
  node scripts/event-router.mjs --list

Examples:
  node scripts/event-router.mjs --event pull_request_review.changes_requested --item pr-123
  node scripts/event-router.mjs --event check_suite.completed:failure --item ci-a1b2c3-test

Exit codes:
  0  routed successfully
  1  event not registered
`);
    if (!args.event && !args.list && !args.help) process.exit(1);
    return;
  }

  if (args.list) {
    const rows = Object.entries(ROUTES).map(([event, spec]) => ({
      event,
      phase: spec.phase,
      level: spec.level,
      skills: spec.skills.join(', ') || '—',
      gates: spec.gates.join(', ') || '—',
    }));
    if (args.json) {
      printJson(rows);
    } else {
      process.stdout.write('Registered events:\n\n');
      for (const r of rows) {
        process.stdout.write(`  ${r.event}\n`);
        process.stdout.write(`    phase: ${r.phase} · level: ${r.level}\n`);
        process.stdout.write(`    skills: ${r.skills}\n`);
        process.stdout.write(`    gates: ${r.gates}\n\n`);
      }
    }
    return;
  }

  const event = String(args.event);
  const statePath = typeof args.state === 'string' ? args.state : path.join(process.cwd(), 'STATE.md');
  const locks = fs.existsSync(statePath) ? readLocks(statePath) : [];

  const result = route(event, {
    item: typeof args.item === 'string' ? args.item : null,
    // 锁键 = 作用目标（branch / PR）。必须与 STATE.md 的 acting_on 列同一命名空间。
    target: typeof args.target === 'string' ? args.target : null,
    locks,
  });

  // 输出恒为 JSON：workflow 直接把 stdout 重定向进 route.json 再用 jq 解析。
  // 原来写的是 `if (args.json || true)`——恒真，--json 标志形同虚设。
  // 现在显式说明：JSON 是唯一输出格式，--json 只是为了兼容既有调用。
  printJson(result);

  process.exit(result.registered ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
