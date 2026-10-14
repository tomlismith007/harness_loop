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

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"stage1-harness-foundation","level":"L2","duration_s":0,"items_found":4,"actions_taken":11,"escalations":0,"tokens_estimate":0,"outcome":"fixed","notes":"阶段边界重构第一批。阶段 1 产出 12→7 个文件，loop 机制文档移到阶段 2；判据 10→8 项，#2 查占位 feature、#5 实际执行启动脚本、#6 改读 AGENTS.md。修两个真 bug：subsystem 映射让阶段 1 必然缺 instructions/lifecycle；init.sh 判据把脚本内 command not found 误报成 bash 不可用。断言 603→624，新增 21 条，其中 4 条第一版无牙齿（变异后仍全绿），经变异回退补强为双向断言。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"stage2-rename-and-skill-ownership","level":"L2","duration_s":0,"items_found":2,"actions_taken":18,"escalations":0,"tokens_estimate":0,"outcome":"fixed","notes":"阶段 2 改名 harness-loop-init（14 处引用）；删重复装配技能并把 --commands/--package-manager 并入 harness-init；17 个技能全部加 frontmatter stage:，并加测试锁住它与 STAGE*_SKILLS 一致。挖出第三个越界源：init-loop-harness.mjs --level L1 仍写 12 个文件、技能分级另有一套，且 loop-audit/README/docs/07 都推荐这条无闸门路径——全部改指 harness-stage.mjs --require。4 轮变异回退，2 条新断言第一版无牙齿。新断言当场抓到我自己引入的矛盾（harness-loop 标 runtime 却在 STAGE1_SKILLS）。断言 624 → 686。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"circuit-breaker-fail-closed-and-wiring-check","level":"L2","duration_s":0,"items_found":2,"actions_taken":6,"escalations":0,"tokens_estimate":0,"outcome":"fixed","notes":"第三批。修 checkLedger 的 fail-open：ledger-check.mjs:72 的 Array.isArray(...)?...:[] 让 6 种畸形输入（{} / attempts 非数组 / attempts:null / null / undefined / [] 数组）全部返回 verdict=ok exit=0，熔断器在最需要说话时静默放行。现在一律 no-ledger + 退出码 2，空 attempts 数组仍是 ok。hasEventWiring 提到 lib/common.mjs 供阶段 3 判据与 harness-loop 第 0 步共用；harness-loop 新增 no-wiring outcome。4 轮变异回退全部被捕获；其中一次是变异没落地导致的假绿灯，已记入教训。断言 686 → 721。三批到此收尾。"}
