# Loop State

Last run: never

本文件是循环的活状态：人类收件箱、当前活动、观察列表、本轮噪声。**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [ ] 首次装配：运行 `node scripts/loop-audit.mjs . --suggest` 获取就绪度评分与改进清单。
- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整。

## Active

| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`acting_on` 用于多循环冲突检测：派发新任务前检查此列，避免两个循环改同一分支。

## Watch List

- 尚未跑过任何一轮真实事件。第一周目标：只报告，积累可靠的 triage 记录。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Recent Noise (ignored this run)

—

## Post-Run Critique (from last run)

- **High-noise items**：本轮发现 `install-skills.mjs` 只写 `.zcode`，而 `SKILL_DIRS` 不含 `.zcode`/`.agents` —— 安装与审计对"技能装在哪"的认知不一致，导致装成功也报 `0 found`，且 L2 永远不可达。
- **False positives**：—
- **Should deprioritize**：—
- **Friction in human review**：—
- **One adjustment next cycle**：凡涉及"路径/落盘位置"的脚本，测试必须断言实际写入的目录，而不只是退出码——本次静默失败正是因为退出码一直是 0。

---

Run log: `loop-run-log.md` · 预算：`loop-budget.md` · 约束：`loop-constraints.md`
