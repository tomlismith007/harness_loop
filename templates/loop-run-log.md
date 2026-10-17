# Loop Run Log

只追加的运行历史。每轮结束追加一条 JSON。**清理超过 30 天的条目。**

## Format

```json
{
  "run_id": "2026-10-17T08:15:00Z",
  "item": "fix-login-test",
  "duration_s": 45,
  "files_changed": 2,
  "attempts": 1,
  "outcome": "verified"
}
```

**`outcome` 枚举**：`no-op` | `report-only` | `fix-proposed` | `verified` | `escalated`

| 值 | 含义 |
|---|---|
| `no-op` | 没有可做的唯一一项，提前退出 |
| `report-only` | 产出报告，未改代码 |
| `fix-proposed` | 提出修复，等待验证或人工 |
| `verified` | 修复通过独立验证 |
| `escalated` | 交给人类（拒绝列表、尝试上限、熔断、环境问题） |

## Metrics to Watch

| 指标 | 健康信号 |
|---|---|
| 升级率 | 稳定且非 0 |
| 平均尝试次数 | < 2 |
| 重复失败率 | 趋近 0 |

## Log

<!-- 每轮追加。最新在下方。 -->
