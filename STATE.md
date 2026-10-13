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

- **High-noise items**：本轮确认两处路径缺陷 —— ① `install-skills.mjs` 默认写 `.zcode`（ZCode 专属），标准应是跨 agent 的 `.agents`；② `harness-stage.mjs` / `init-loop-harness.mjs` 把技能写进 `<repo>/skills/`，而没有任何 agent 扫描该路径（文件到位但从未被加载）。两者都已修。
- **False positives**：阶段 2 判据曾用 grep 检查 `loop-constraints.md` 里有没有"回退测试""NOT RUN"字样。阶段 1 的模板出厂就带这些文字 → 阶段 2 永远自动变绿，闸门形同虚设。已改为检查"技能在可发现路径"+"拒绝列表已本地化"，无法机械判定的三项降级为人工确认。
- **Should deprioritize**：无。
- **Friction in human review**：本仓库是技能**源仓库**而非消费者，阶段判据（尤其"拒绝列表已本地化"）对它天然不适用——它的 `loop-constraints.md` 就是模板来源。自报阶段 1 是正确结果，不是缺陷。
- **One adjustment next cycle**：阶段判据在源仓库上运行时，应识别"这是源仓库"并跳过消费者专属判据，而不是逐条报 FAIL。

---

Run log: `loop-run-log.md` · 预算：`loop-budget.md` · 约束：`loop-constraints.md`
