# Loop Run Log

只追加的运行历史。每轮结束追加一条 JSON。**清理超过 30 天的条目。**

## Format

```json
{
  "run_id": "2026-10-13T08:15:00Z",
  "pattern": "pr-review-triage",
  "event": "pull_request_review.changes_requested",
  "item": "pr-123",
  "level": "L2",
  "duration_s": 45,
  "items_found": 4,
  "actions_taken": 1,
  "escalations": 0,
  "tokens_estimate": 52000,
  "worktree": "loop/pr-123-fix-1",
  "outcome": "fix-proposed"
}
```

**`outcome` 枚举**：`no-op` | `report-only` | `fix-proposed` | `verified` | `escalated` | `no-wiring` | `manual`

`no-wiring` = 项目未接事件脊（不是问题，是还没到阶段 3）。
`manual` = 非事件驱动的手工运行，**不计入循环统计**。

## Metrics to Watch

| 指标 | 健康信号 |
|---|---|
| 空转率（no-op 占比） | 高节奏循环 > 70% |
| 误报率 | < 30% |
| 升级率 | 稳定且非 0 |
| 平均尝试次数 | < 2 |
| 重复失败率 | 趋近 0 |
| token 效率 | 稳定或下降 |

## Log

<!-- 每轮追加。最新在下方。 -->
