# Loop Budget

> `loop-budget` 技能在**每轮开始和结束**检查本文件与 `loop-run-log.md` 的实际花费。

## Daily Limits

| 循环 | 最大运行/天 | 最大 token/天 | 最大子智能体/轮 |
|---|---|---|---|
| Issue Intake | 12 | 80k | 0 (L1) / 1 (L2) |
| PR Review Triage | 96 | 300k | 0 (L1) / 2 (L2) |
| CI Sweeper | 96 | 500k | 3 |
| Merge Gate | 48 | 100k | 1 |
| Post-Merge Cleanup | 1 | 200k | 2 |
| Release Drafter | 1 | 100k | 1 |
| daily-triage | 1 | 50k | 0 |
| lesson-harvest | 1 | 60k | 0 |
| signal-gatekeeper | — | 30k | 0 |

**阶段 3 的定时 workflow 会按 `daily-triage` / `lesson-harvest` 查上限。**
缺行时 `budget-check` 返回 `cap: null` → `mode: exit`，workflow 的 fail-closed 守卫
会让它每天在自己的预算检查里失败。

## Thresholds

| 花费 | 动作 |
|---|---|
| < 80% 日上限 | 正常运行 |
| ≥ 80% 日上限 | **report-only**：不派发执行子智能体 |
| ≥ 100% 日上限 | **立即退出** |
| `loop-pause-all` 生效 | **立即退出** |
| 无待办事项 | **<5k token 内退出** |

## 空转成本参考

| 场景 | token 量级 |
|---|---|
| 空转退出 | ~3–5k |
| 只报告一轮 | ~30–80k |
| 含执行者 + 验证者一轮 | ~150–300k |

## On Budget Exceed

1. 暂停调度器 / 禁用高节奏 workflow
2. 在 `loop-run-log.md` 追加事件记录
3. 在 `STATE.md` 的 High Priority 写一条，通知人工
4. **不要通过放宽阈值来继续跑**

## Kill Switch

- 标志：`loop-pause-all`（issue 标签，或 `STATE.md` 中的标志）
- 恢复：仅在 `STATE.md` 中清除标志后，人工重启调度器

## Alerts This Period

<!-- 自我限流时在此追加一行：日期 + 原因 + 采取的动作 -->

—
