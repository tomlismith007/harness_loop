# Loop State

Last run: 2026-10-17 (v2 简化：17 技能 → 4，11 脚本 → 5)

本文件是循环的活状态：人类收件箱、当前活动、观察列表。
**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [ ] **在真实项目上跑一次 `/harness-loop`**（完成标准：一个 work item 走完 7 步，`loop-run-log.md` 有记录，验证者与执行者不同实例）。
- [ ] **真机验证（硬约束 10）**：`harness-loop-issue` 的 `gh` 读取未在任何真实 GitHub 仓库上跑过（完成标准：对一个测试仓库运行，`STATE.md` 出现带完成标准的条目）。
- [ ] 把技能重新安装到 `~/.claude/skills` 与 `~/.agents/skills`：`node scripts/install-skills.mjs --scope user`（本机 `~/.zcode/skills` 仍是 v1 的陈旧副本，含已删除技能）。
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
