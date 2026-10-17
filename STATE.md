# Loop State

Last run: 2026-10-17 (v2 简化 + 两轮真机验证 + PR 合并)

本文件是循环的活状态：人类收件箱、当前活动、观察列表。
**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [x] **在靶场 `/d/loop-harness-test` 跑过一轮 `/harness-loop`**：`sum([])` bug，回退测试失败→修复→独立子智能体验证 APPROVE→闸门 proceed→账本与 run-log 落盘。真机验证抓出一个闸门 bug（证据正则不接受技能文档里的格式），已修并加断言。
- [x] **`/harness-loop-issue` 真机验证（两轮）**：沙箱上第一轮验 issue 发现，第二轮造了一个真实的红 PR（#4）验 CI 分类——`TypeError` 在 `src/math.mjs:2`、由该 PR 引入 → 判 regression，未误判为 env。两轮均确认只读。
- [x] 技能已装到 `~/.claude/skills` 与 `~/.agents/skills`（各 4 个）；`~/.zcode/skills` 的 v1 陈旧副本已删除。
- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整。

## Active

| Work item | 尝试 | 状态 |
|---|---|---|
| — | — | — |

## Watch List

- 尚未跑过任何一轮真实 loop。第一周目标：只报告，不改代码。
- `harness-stage` 在本仓库上自引用，判据 4（`init.sh`）记为 NOT RUN——这是有意的，不是缺陷。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Post-Run Critique (from last run)

- **返工**：本轮重构中，`test.mjs` 的三处断言先后因期望值错误而失败（技能排序、kill switch 残留标记、阶段 2 本地化前提）。都是测试写错，不是实现错。
- **误报**：无。
- **一项下轮调整**：新增断言前先手工跑一遍被测命令，确认期望值来自实际输出而不是推断。

---

Run log: `loop-run-log.md` · 约束：`loop-constraints.md` · 教训：`LESSONS.md`
