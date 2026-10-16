#!/usr/bin/env node
/**
 * queue-read.mjs — 待办队列的读取入口
 *
 * 用法：
 *   node scripts/queue-read.mjs                 # 列出待办
 *   node scripts/queue-read.mjs --show pr-123   # 看某一条
 *   node scripts/queue-read.mjs --json
 *
 * 为什么需要这个脚本：
 *
 * `harness-loop` 第 0 步第 4 条要求判断"本事件对应的队列为空"（空则 <5k token 退出，
 * 记 outcome=no-op）。但此前**没有任何东西定义过"队列"是什么**——
 * workflow 写 `.loop/queue/<item>.json` 然后用 upload-artifact 交付，
 * 而仓库内没有任何消费者读它。事件脊的最后一跳在代码上是空的，
 * 第 0 步的第 4 条因此无法执行。
 *
 * 这个脚本给出读取契约：
 *   1. 优先读 `.loop/queue/`（workflow 写的位置，本地同步下来后可读）
 *   2. 该目录不存在或为空时，回落到 `STATE.md` 的 High Priority 区
 *      （本地手动用法下没有 workflow，待办记在那里）
 * 输出里显式说明读的是哪个来源，避免"读到了空"和"没读"被混为一谈。
 *
 * 退出码：0 = 有内容（或明确报告为空）；1 = 参数错误。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, readText, printJson, fail, rejectUnknownFlags } from './lib/common.mjs';

export const QUEUE_DIR = path.join('.loop', 'queue');

/** 读 .loop/queue/ 下的 work item。返回按 created_at 排序的数组。 */
export function readQueueDir(root) {
  const dir = path.join(root, QUEUE_DIR);
  if (!fs.existsSync(dir)) return null;
  let entries = [];
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  const items = [];
  for (const f of entries) {
    try {
      const j = JSON.parse(readText(path.join(dir, f)));
      if (j && typeof j === 'object') items.push({ ...j, _file: path.join(QUEUE_DIR, f).split(path.sep).join('/') });
    } catch {
      // 坏文件不能静默丢掉——它是"有东西但读不了"，与"没有东西"不同
      items.push({ id: f.replace(/\.json$/, ''), _file: `${QUEUE_DIR}/${f}`.replace(/\\/g, '/'), _malformed: true });
    }
  }
  return items.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
}

/**
 * 从 STATE.md 的 High Priority 区读未完成条目。
 *
 * 这是本地手动用法下的待办载体——没有 workflow 时，人把待办记在那里。
 * 只认 `- [ ]` 未勾选的条目；`- [x]` 是已完成，不算待办。
 */
export function readStateHighPriority(root) {
  const text = readText(path.join(root, 'STATE.md'));
  if (!text) return null;
  const section = text.split(/^##\s*High Priority[^\n]*$/m)[1];
  if (section === undefined) return null;
  const body = section.split(/^##\s+/m)[0];
  const items = [];
  for (const line of body.split('\n')) {
    // 收尾用 `(.+?)\s*$` 而不是 `(.+)$`：readText 已经归一化过换行，
    // 这里再兜一层，防止将来有人绕过 readText 直接喂进带 \r 的行。
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/);
    if (!m) continue;
    if (m[1].toLowerCase() === 'x') continue; // 已完成
    const text2 = m[2].trim();
    if (!text2 || text2 === '（空）') continue;
    items.push({ id: text2.slice(0, 60), source: 'STATE.md#High Priority', title: text2 });
  }
  return items;
}

export function readQueue(root) {
  const fromDir = readQueueDir(root);
  if (fromDir && fromDir.length) {
    return { source: QUEUE_DIR.split(path.sep).join('/'), items: fromDir, fell_back: false };
  }
  const fromState = readStateHighPriority(root);
  if (fromState && fromState.length) {
    return {
      source: 'STATE.md#High Priority',
      items: fromState,
      fell_back: true,
      note: `${QUEUE_DIR.split(path.sep).join('/')} 为空或不存在，已回落到 STATE.md`,
    };
  }
  // 两处都没有：明确说清读了哪些来源，避免"空"被读成"没读"
  return {
    source: fromDir ? QUEUE_DIR.split(path.sep).join('/') : 'none',
    items: [],
    fell_back: false,
    note: fromDir
      ? `${QUEUE_DIR.split(path.sep).join('/')} 存在但为空`
      : `既无 ${QUEUE_DIR.split(path.sep).join('/')} 也无 STATE.md 待办`,
  };
}

function main() {
  const args = parseArgs();
  rejectUnknownFlags(args, ['root', 'show', 'json', 'help'], 'queue-read');
  if (args.help) {
    process.stdout.write(`queue-read — read the pending work item queue

Usage:
  node scripts/queue-read.mjs [--root <dir>] [--show <item-id>] [--json]

Options:
  --root <dir>    Repo root (default: cwd)
  --show <id>     Show one item by id
  --json          Emit JSON
  --help          Show this help

Sources, in order:
  1. ${QUEUE_DIR.split(path.sep).join('/')}/<item>.json — written by the event wiring
  2. STATE.md "## High Priority" unchecked items — used when there is no wiring

The output always names which source was read, so "the queue is empty" and
"nothing was read" cannot be confused.

Exit codes:
  0  read succeeded (including an empty queue)
  1  bad arguments or item not found
`);
    return;
  }

  const root = typeof args.root === 'string' ? args.root : process.cwd();
  const result = readQueue(root);

  if (typeof args.show === 'string') {
    const item = result.items.find((i) => String(i.id) === args.show);
    if (!item) fail(`item not found in ${result.source}: ${args.show}`, 1);
    if (args.json) printJson(item);
    else process.stdout.write(JSON.stringify(item, null, 2) + '\n');
    return;
  }

  if (args.json) {
    printJson(result);
  } else {
    process.stdout.write(`Queue source: ${result.source}\n`);
    if (result.note) process.stdout.write(`Note: ${result.note}\n`);
    if (!result.items.length) {
      process.stdout.write('\nNo pending items. (outcome would be "no-op")\n');
    } else {
      process.stdout.write(`\n${result.items.length} pending item(s):\n`);
      for (const i of result.items) {
        const mark = i._malformed ? ' [MALFORMED]' : '';
        process.stdout.write(`  ${i.id}${mark}  ${i.event || i.title || ''}\n`);
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
