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

**`outcome` 枚举**：`no-op` | `report-only` | `fix-proposed` | `verified` | `escalated`

- `no-op` — 无待办，提前退出（常见于高节奏循环）
- `report-only` — 产出了报告，未改动代码
- `fix-proposed` — 提出了修复（PR 或 worktree），等待验证或人工
- `verified` — 修复通过独立验证，进入闸门
- `escalated` — 交给人类（触达拒绝列表、超尝试上限、需要判断）

## 人读摘要格式

每轮可选追加一行人类可读摘要，便于快速扫读：

```
2026-10-13 08:15 | pr-review-triage | 4 findings | 1 worktree opened | 0 escalations
```

## Metrics to Watch

| 指标 | 含义 | 健康信号 |
|---|---|---|
| 空转率 | `no-op` 占总运行的比例 | 高节奏循环应 > 70% |
| 误报率 | 人工判定为无效的 triage 条目比例 | < 30% |
| 升级率 | `escalated` 占比 | 稳定，不应为 0（0 意味着闸门没在工作） |
| 平均尝试次数 | 每个 work item 的尝试数 | < 2 |
| 重复失败 | 同一 job 48h 内再次失败 | 趋近 0 |
| token 效率 | 每解决一个 work item 的 token 消耗 | 稳定或下降 |

## Log

<!-- 每轮追加。最新在下方。单行 JSON。 -->

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"three-review-fail-open","level":"L2","duration_s":0,"items_found":28,"actions_taken":8,"escalations":0,"tokens_estimate":0,"outcome":"fixed","notes":"三份独立审查收敛到同一根因（闸门未被闸门保护）。修了 gate-check 的 fail-open 族、拒绝列表真相源分裂、uninstall 数据销毁与路径穿越、阶段判据的空壳假绿、registry 无消费者、事件队列写进虚空、锁键命名空间错配、文档漂移。断言 498 → 589，每条新断言做过变异回退。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"baseline-repair","level":"L2","duration_s":0,"items_found":1,"actions_taken":1,"escalations":0,"tokens_estimate":0,"outcome":"fixed","notes":"工作区 loop-audit.mjs:258 的未提交改动删掉了 L2 分支的 verifierPresent，测试红在 497/1。已 revert 并把散在 5 处的条件合并为一次判定（改一处漏一处正是这次回归的成因）。"}
