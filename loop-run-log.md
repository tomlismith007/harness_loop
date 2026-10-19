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

{"run_id": "2026-10-17T12:00:00Z", "item": "sandbox-verification", "duration_s": 0, "files_changed": 0, "attempts": 1, "outcome": "verified", "notes": "在 /d/loop-harness-test 跑完一轮：装配、回退测试、独立子智能体验证、闸门、熔断、状态写入。抓出 gate-check 证据正则的行尾锚定 bug。"}
{"run_id": "2026-10-19T09:30:00Z", "item": "repair-spec", "duration_s": 0, "files_changed": 17, "attempts": 1, "outcome": "verified", "notes": "按 REPAIR-SPEC 修复 9 项。证据：test.mjs 357/0、init.sh 0、gate 阶段五条路径（proceed/evidence/red-check/head-commit/awaiting-verification）实跑、占位 feature 替换前 exit 2 替换后 0、安装清单 packRoot 可用、账本缺失/坏 JSON exit 2、run-log 空文件 FAIL。"}
