---
name: loop-budget
description: >-
  Check token budget and run-log spend at the start and end of every loop iteration.
  Enforces early exit when over budget, when the kill switch is active, or when there is
  no actionable work. Use before dispatching any sub-agent and after finishing work to
  append a run record.
license: MIT
user_invocable: true
stage: 1
---

# Loop Budget Guard

在**每一轮循环的开始和结束**运行。

## 开始运行

1. 读 `loop-budget.md` 拿日上限与 kill switch 标志。
2. 读 `loop-run-log.md` 近 24h 的条目。
3. 汇总当前 pattern 今日的 `tokens_estimate` 之和。
4. 判定：

| 条件 | 动作 |
|---|---|
| 花费 ≥ 100% 日上限 | **立即退出**，在 `STATE.md` 写一行 |
| `loop-pause-all` 生效 | **立即退出** |
| 花费 ≥ 80% 日上限 | **report-only 模式**（不派发子智能体，不自动修复） |
| 无待办事项 | **<5k token 内退出**，不生成子智能体 |
| 否则 | 正常运行 |

5. 检查本轮计划派发的子智能体数是否超过 `max sub-agent spawns/run`。

## 结束运行

向 `loop-run-log.md` 追加**一行** JSON（`budget-check.mjs` 只解析单行记录；
多行格式会被静默算成 0 花费）：

```json
{"run_id":"<ISO8601>","pattern":"<pattern-id>","event":"<事件名>","item":"<item-id>","level":"<L0-L3>","duration_s":0,"items_found":0,"actions_taken":0,"escalations":0,"tokens_estimate":0,"worktree":"<path 或 null>","outcome":"no-op | report-only | fix-proposed | verified | escalated"}
```

## 成本参考（用于估算）

| 场景 | token 量级 |
|---|---|
| 空转退出 | ~3–5k |
| 只报告一轮 | ~30–80k |
| 含执行者 + 验证者一轮 | ~150–300k |

## 规则

- 绝不超过 `loop-budget.md` 的 `max sub-agent spawns/run`。
- 高节奏循环（CI Sweeper、PR Review Triage）**必须**在无待办时提前退出。15 分钟 cadence 一天 96 次，每次空转 5k 就是 480k 纯浪费。
- 自我限流时在 `loop-budget.md` 的 **Alerts This Period** 追加一行：日期 + 原因 + 采取的动作。
- **不通过放宽阈值来继续跑。** 超预算是降级或退出的触发条件，不是"再试一次"的理由。
- 预算计算是估算，不是精确计量。留出余量。

## 与其他技能的交互

| 技能 | 关系 |
|---|---|
| `loop-constraints` | 约束可施加比预算文件更严的限额，此时以更严者为准 |
| `harness-loop` | 在流程第 0 步（退出检查）与第 4 步（预算分级）调用本技能 |
| `loop-guard` | 熔断器的 token-budget 阈值可与本技能的日上限联动 |
| `minimal-fix` | report-only 模式下不得调用 |
