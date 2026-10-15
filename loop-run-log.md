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

- `no-op` — 无待办，提前退出（常见于高节奏循环）
- `report-only` — 产出了报告，未改动代码
- `fix-proposed` — 提出了修复（PR 或 worktree），等待验证或人工
- `verified` — 修复通过独立验证，进入闸门
- `escalated` — 交给人类（触达拒绝列表、超尝试上限、需要判断）
- `no-wiring` — 项目未接事件脊，第 0 步退出（**不是问题**，是"还没到阶段 3"）
- `manual` — 非事件驱动的手工运行（`manual.audit` / `manual.design` 等）。
  **不计入循环统计**——它的存在是为了让"这套循环到底有没有在工作"这个问题
  能靠 `no-op` / `escalated` / `verified` 的比例回答，而不是被手工运行的噪声淹没。

**为什么枚举必须被校验**：这张表里的值会被 Metrics to Watch 用来算空转率、升级率、
平均尝试次数。曾经实际写入的值是 `fixed`，不在任何声明的枚举里，也没有任何东西校验——
于是所有统计口径静默失效。`test.mjs` 现在断言每一条记录的 `outcome` 都在枚举内。

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

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"three-review-fail-open","level":"L2","duration_s":0,"items_found":28,"actions_taken":8,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"三份独立审查收敛到同一根因（闸门未被闸门保护）。修了 gate-check 的 fail-open 族、拒绝列表真相源分裂、uninstall 数据销毁与路径穿越、阶段判据的空壳假绿、registry 无消费者、事件队列写进虚空、锁键命名空间错配、文档漂移。断言 498 → 589，每条新断言做过变异回退。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"baseline-repair","level":"L2","duration_s":0,"items_found":1,"actions_taken":1,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"工作区 loop-audit.mjs:258 的未提交改动删掉了 L2 分支的 verifierPresent，测试红在 497/1。已 revert 并把散在 5 处的条件合并为一次判定（改一处漏一处正是这次回归的成因）。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"stage1-harness-foundation","level":"L2","duration_s":0,"items_found":4,"actions_taken":11,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"阶段边界重构第一批。阶段 1 产出 12→7 个文件，loop 机制文档移到阶段 2；判据 10→8 项，#2 查占位 feature、#5 实际执行启动脚本、#6 改读 AGENTS.md。修两个真 bug：subsystem 映射让阶段 1 必然缺 instructions/lifecycle；init.sh 判据把脚本内 command not found 误报成 bash 不可用。断言 603→624，新增 21 条，其中 4 条第一版无牙齿（变异后仍全绿），经变异回退补强为双向断言。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"stage2-rename-and-skill-ownership","level":"L2","duration_s":0,"items_found":2,"actions_taken":18,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"阶段 2 改名 harness-loop-init（14 处引用）；删重复装配技能并把 --commands/--package-manager 并入 harness-init；17 个技能全部加 frontmatter stage:，并加测试锁住它与 STAGE*_SKILLS 一致。挖出第三个越界源：init-loop-harness.mjs --level L1 仍写 12 个文件、技能分级另有一套，且 loop-audit/README/docs/07 都推荐这条无闸门路径——全部改指 harness-stage.mjs --require。4 轮变异回退，2 条新断言第一版无牙齿。新断言当场抓到我自己引入的矛盾（harness-loop 标 runtime 却在 STAGE1_SKILLS）。断言 624 → 686。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"stage-boundary","event":"manual.design","item":"circuit-breaker-fail-closed-and-wiring-check","level":"L2","duration_s":0,"items_found":2,"actions_taken":6,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"第三批。修 checkLedger 的 fail-open：ledger-check.mjs:72 的 Array.isArray(...)?...:[] 让 6 种畸形输入（{} / attempts 非数组 / attempts:null / null / undefined / [] 数组）全部返回 verdict=ok exit=0，熔断器在最需要说话时静默放行。现在一律 no-ledger + 退出码 2，空 attempts 数组仍是 ok。hasEventWiring 提到 lib/common.mjs 供阶段 3 判据与 harness-loop 第 0 步共用；harness-loop 新增 no-wiring outcome。4 轮变异回退全部被捕获；其中一次是变异没落地导致的假绿灯，已记入教训。断言 686 → 721。三批到此收尾。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"doc-drift","event":"manual.audit","item":"docs-vs-code-consistency","level":"L2","duration_s":0,"items_found":5,"actions_taken":7,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"推送后自查发现 README 三阶段表、目录树注释、docs/10 的阶段表与技能表共 5 处还写着 10 项判据与 18 个技能——三批重构改了代码但漏了这些表述，而没有任何东西在校验它们。新增漂移检测测试：抽取文档里的判据数与技能总数，与代码实测比对。这条测试自己写的时候犯了两版错（先写成禁数字，把正确的 17 也判成漂移；正则要求「10 项判据」紧邻，漏掉表格里的「10 项（全机械）」），都靠变异回退发现。断言 721 → 724。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"remediation-spec-wp01-wp28","level":"L2","duration_s":0,"items_found":31,"actions_taken":28,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"按 REVIEW-2026-10-14-remediation-spec.md 落地全部 28 个工作包，修掉审查报告的 31 项缺陷（HL-01…HL-31）。P0：编排命令缺 @ 导致拒绝列表闸门静默失效、scripts/ 不部署到消费者、close 阶段不在 PHASES 枚举里、workflow 事件字段直接插值进 shell。P1：闸门接受自证（加 --evidence-file）、merge-gate 永远 escalate、verdict 词汇不兼容、预算与 kill switch 无代码入口、--upgrade 可跳级、锁键 --target 未进编排。新增三个脚本：budget-check（per-loop 上限真正生效）、queue-read（第 0 步的队列读取契约）、worktree（隔离要求首次有代码入口）。断言 724 → 923；10 次变异回退，其中 2 次暴露无牙齿断言、1 次变异未落地被自查发现。两处审查结论被修正：skills/.mimosa 未被跟踪（.gitignore 已覆盖）、session-handoff 应填不应删。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"loop-audit-activity-false-positive","level":"L2","duration_s":0,"items_found":1,"actions_taken":1,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"审计的活动检测有三个假阳性：数所有含 run_id 的记录（于是 manual.* 开发记录算循环活动）、Last run 接受开发会话标签（带日期就认）、Active 表扫描整个 STATE.md（Post-Run Critique 的数据表被算成 25 个活跃 work item）。三条合起来让一个从未跑过事件驱动循环的仓库拿到 activity 分，而 STATE.md 自己写着尚未跑过任何真实事件。修法：manual 只进 notes、会话标签不算、Active 限定在 ## Active 章节。审计从 98/L3 变为 94/L2（理由：no real loop activity recorded yet）——分数下降是唯一正确的退步。断言 923 → 923，3 处变异全部被捕获。"}

{"run_id":"2026-10-14T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"worktree-git-hook-env","level":"L2","duration_s":0,"items_found":1,"actions_taken":1,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"pre-commit 钩子当场抓出 worktree.mjs 的一个真 bug：git 在 hook 里会设 GIT_DIR/GIT_INDEX_FILE 指向外层仓库，子进程继承后即使 cwd 是另一个仓库也会去操作外层索引，报 Unable to create index.lock。修法是调用 git 前剥掉这 6 个 GIT_* 变量。加了回归断言（带 hook 环境变量跑 create）。这条只有在真的 commit 时才会暴露——单元测试直接跑 git init 不经过 hook，所以此前全绿。断言 921 → 923。"}

{"run_id": "2026-10-15T00:00:00Z", "pattern": "review-remediation", "event": "manual.audit", "item": "loop-budget-per-loop-caps", "level": "L2", "duration_s": 0, "items_found": 2, "actions_taken": 3, "escalations": 0, "tokens_estimate": 0, "outcome": "manual", "notes": "WP-09 的 A 类缺口第一半（独立复核后重做，未照原方案）。原方案的修法是「给 8 个 workflow 加 budget-check 调用」——实测那样做会立刻炸：daily-triage 与 lesson-harvest 在 loop-budget.md 里根本没有行，budget-check 对无上限返回 cap:null → mode:exit，两个 workflow 会在自己的预算检查里直接死掉。所以先做前置：补 3 个循环的预算行。顺带发现 signal-gatekeeper 同样注册为循环却没有预算行（registry.yaml 有 suggested_daily_cap: 30000，无消费者）。同时修 parseBudgetCaps 的静默回退（新增 slug 索引，自然写法与循环 id 直接对上）与别名表过宽（/issue/ 会命中任何含 issue 的 id），新增 resolveCap 暴露解析路径 exact / alias:<表名> / null，让「借来的上限」可见。断言从「单文件」改成「规则」：遍历 LOOP.md 注册的每个循环核对预算行，双向（注册循环报 exact / 非注册 id 报 alias）。断言 923 → 931，3 次变异全部确认落地并变红。workflow 侧接线（8 个 yml）仍未做，已记入 STATE.md High Priority。"}

{"run_id": "2026-10-15T00:00:00Z", "pattern": "review-remediation", "event": "manual.audit", "item": "acting-on-lock-wiring", "level": "L2", "duration_s": 0, "items_found": 3, "actions_taken": 5, "escalations": 0, "tokens_estimate": 0, "outcome": "manual", "notes": "LOOP.md 的『同一分支每小时最多一个循环修改』是多循环协调的唯一机制，而它在生产路径上从未生效：8 个 workflow 全都没传 --target（实测传了得到 conflict=lock-held，不传则字段不存在）。但只加 --target 是半个修复——grep 确认没有任何 workflow 读 .conflict，锁结果被直接丢弃，传了等于没传。按『传锁键 + 消费锁结果』两个条件一起修：pr-review / ci-sweeper / issue-intake / post-merge 四个落盘 work item 的循环传 --target 并在 lock-held 时跳过落盘；release-draft 有意不传（LOOP.md 列为『只读为主，可安全并发』，且它不写队列）。断言按规则而非按文件，双向。断言 931 → 945。4 次变异全部确认落地后变红，其中 2 次暴露了我自己写的无牙齿断言（/\\.conflict/ 被注释骗过；按文件搜 if: 条件被同文件其它步骤骗过），都改为锚定真实调用形态与具体步骤。另修一条既有断言的假阳性：通用 flag 扫描跨行捕获，把文档里相邻两条命令算成同一条。过程事故：本轮全部未提交改动曾被外部进程一次性还原（文件 mtime 同一秒），重做后立即提交。这恰好是 acting_on 锁该防的场景——两个 agent 在同一工作区并发修改，锁没生效。"}
