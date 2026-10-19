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
{"run_id": "2026-10-18T02:00:00Z", "item": "skill-upgrade-audit", "duration_s": 0, "files_changed": 0, "attempts": 1, "outcome": "report-only", "notes": "只读审计 A@38ddcd2 / B@54f8c56 / CN@c5e9ef0，产出 5 份 audits/ 文档；未改现有文件。发现 kill switch 调用形式与 --phase fix 两个真 bug，见 audits/audit-2026-10-18.md D-01/D-02。"}
{"run_id": "2026-10-18T03:30:00Z", "item": "upgrade-batch-0", "duration_s": 0, "files_changed": 8, "attempts": 4, "outcome": "verified", "notes": "docs 事实修正：死链、闸门数 8→9、L3 表述、归一化描述、原语数法。独立子智能体 4 轮验证（REJECT×3 → APPROVE）；init.sh 335/0。commit a181285。"}
{"run_id": "2026-10-18T05:10:00Z", "item": "upgrade-batch-1", "duration_s": 0, "files_changed": 8, "attempts": 3, "outcome": "verified", "notes": "U-01/02/07/09/11：kill switch fail-closed、--phase gate、WIP=1、空文件与 frontmatter、宿主漂移（含收窄 --layout 的绕过）。独立验证 3 轮（REJECT→REJECT→APPROVE）；354/0。commit 0d88b94。"}
{"run_id": "2026-10-19T01:40:00Z", "item": "upgrade-batch-2", "duration_s": 0, "files_changed": 14, "attempts": 4, "outcome": "verified", "notes": "U-03/04/06/08/10：证据命令重放、sha 格式与 head 自取、策略面拒绝列表与漂移检测、预算接线（80% report-only，迭代上限优先）、不可信输入段。独立验证 4 轮（REJECT×3 → APPROVE）；391/0。commit 9232620。验证中抓出两个真回归：重放可被带引号命令绕过、配置预算会关掉迭代上限熔断。"}
{"run_id": "2026-10-19T03:20:00Z", "item": "upgrade-U05", "duration_s": 0, "files_changed": 12, "attempts": 3, "outcome": "verified", "notes": "护栏演练：drill-check 逐条命中拒绝列表 + 熔断器具体触发，记录绑定约束 sha256；阶段 2 判据 6→7。独立验证 3 轮（REJECT→REJECT→APPROVE）；416/0。commit 9b0b4aa。验证抓出：空记录/缺 sha/只跑 breaker 都能过阶段 2，以及被宽模式遮住的归因错误。"}
