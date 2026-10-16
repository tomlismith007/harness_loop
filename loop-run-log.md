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

{"run_id": "2026-10-15T00:00:00Z", "pattern": "review-remediation", "event": "manual.audit", "item": "workflow-budget-and-token-wiring", "level": "L2", "duration_s": 0, "items_found": 2, "actions_taken": 8, "escalations": 0, "tokens_estimate": 0, "outcome": "manual", "notes": "WP-09 第二半 + WP-04 第二半，两个都做。预算：8 个 workflow 里此前只有 merge-gate 调 budget-check，其余 7 个裸奔。daily-triage / lesson-harvest 的内联逻辑有两个真问题——Math.max(...caps) 取全表最大上限（自身 83% 被算成 50%），且数 run-log 的正则 /\\{.*\\}/g 不带 s/m 标志，跨多行 JSON 一条都匹配不上（预算恒为 0%）；这两个恰好是唯二在写 run-log 的。其余 5 个补上调用，各传自己的 pattern id。另修 merge-gate 自身的 fail-open：`budget-check ... || true` 吞掉退出码，脚本崩溃时 jq 得到 null，而 null != exit —— 闸门在没有预算检查的情况下继续跑。所有 8 个现在都有 `jq -e '.mode'` 守卫，读不到就拒绝运行。token：LOOP_BOT_TOKEN 落地到全部 3 个调用 gh 的 workflow；原断言用 .some()，1/8 也算通过。断言全部从单文件改成规则（双向）。断言 945 → 954，3 次变异全部确认落地后变红。诚实的限制：5 个新接线的 workflow 不写 loop-run-log.md，而那是 budget-check 的唯一数据源，所以它们的 used 恒为 0——本次接线立即生效的部分是 kill switch，预算百分比要等 agent 平台把真实花费写进 run-log 才有意义。"}

{"run_id":"2026-10-15T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"verify-path-recursion-and-orphans","level":"L2","duration_s":0,"items_found":4,"actions_taken":3,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"修掉\"跑一次验证要等 10 分钟\"的根因。用户直接问了\"为什么 init.sh 这么慢\"，插桩测量后发现是自引用环：init.sh 第 72 行 `harness-stage.mjs .`（用 harness-stage 审计本仓库），而阶段 1 判据 5 要求\"目标的 init.sh 真的能跑通\"——于是 harness-stage 真的执行目标的 init.sh，目标就是自己。探针实测：69 次执行仓库自身的 init.sh，全部 120,00x 毫秒超时，嵌套深度 0-6 层，总计 10,753 次 spawn、最深 9 层；跑完后机器上残留 83 个进程、21 棵孤儿树。第二层病灶：Node 的 execFileSync timeout 只杀直接子进程。对照实验（心跳文件 + 精确 winpid）：timeout 后三层孙进程全 ALIVE 且心跳继续；GNU timeout -k 后整棵树全灭、心跳停止。第三层：判据 5 在同一次运行里被算 3 遍（checksByStage / detectStage / JSON 输出各一次），基线实测一个 sleep 297 的 init.sh 让判据耗时恰好 6m00s = 120s x 3。修复：① 自引用防护两条判据（LOOP_HARNESS_ACTIVE_INIT 环境变量标记 + root==PACK_ROOT 兜底），命中记 NOT RUN 而非 PASS/FAIL；② runWithTreeKill 用 GNU timeout 杀整棵树，无 GNU timeout 时降级并在返回值里标 treeKill:false（能力缺失要可见）；③ 判据 memoization。顺带修：超时原本被报成\"bash 不可用\"（证据指向错误原因），现在超时记 NOT RUN——超时是\"没跑完\"不是\"跑不通\"；loop-audit 的 git log 加进程内缓存。结果：init.sh 10m06s → 45.4s，test.mjs 64.7s → 43.7s，harness-stage . 6m00s → 0.31s。断言 954 → 979。4 次变异全部确认落地后变红（7/3/2/1 条 FAIL）。变异 2 当场抓出我自己引入的 bug：降级路径 timedOut 与 spawnFailed 可同时为 true，会把超时又报成\"bash 不可用\"。第 4 项提议（--quick 快慢分离）主动跳过：45 秒已可接受，边际收益不支撑多一条\"哪些断言属于快集\"的真相源。诚实限制：全部验证都在本机（Windows/MSYS）完成，GNU timeout 是 MSYS 提供的；Linux CI 上行为需另验（那里 coreutils timeout 必然存在，但路径分隔与 samePath 的大小写分支未在真机跑过）。"}

{"run_id":"2026-10-16T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"round3-independent-verification","level":"L2","duration_s":0,"items_found":22,"actions_taken":4,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"对 REVIEW-2026-10-16-harness-loop-audit.md 与配套 spec 做对抗性复核：不重读代码，逐条重跑关键探针。结果 22 条里 20 条原样成立（P0-01/P0-02 最扎实——手写 4 份证据文件实跑，APPROVE+Tests->FAIL、全 NOT RUN、缺 Checks not run 三份全部 proceed exit 0），1 条表述错误（P1-07），1 条触发条件错误（P2-08），1 条从存疑升格为已确认（P1-04 的 noop）。三处修正：① P1-07 原写『裸路径 auth/login.ts -> proceed』复现不出——四种参数排列（含文件真实存在）全部 escalate/denylist；真实缺陷是『对多行清单忘记 @』，--diff-files big.txt(20 条) -> proceed files_changed:1，@big.txt -> escalate/scope 20，拒绝列表与范围闸门同时失效。根因相同（split(',') 把文件路径当单一路径）但触发条件不同，MP-01 的 fixture 与描述已按此改写。轮 2 写错的原因值得记：它只跑了一个对照就归因，没同时跑『同一路径加 @』——与已记录的 D3 是同一个病的两种形态（D3 是两个对照相同实为噪声，这次是只跑一半对照），已进 LESSONS.md。② P2-08 原写『原生 Windows -> 978/1』不成立——原生 powershell.exe 直接跑是 979/0（Git 的 /usr/bin 在 PATH 上，hasGnuTimeout 为真）；只有 system32 排到 Git 之前才复现 978/1（并确认降级路径 treeKill:false 确实泄漏 sleep.exe 孙进程）。这直接改变 MP-10：分叉判据必须是 hasGnuTimeout() 的返回值，不能是 process.platform，否则写出在开发机上恒绿的假断言。③ noop 实测确认（报告标为存疑、低估了自己的发现）：[f,f,noop,f,f] -> ok 2/5 exit 0，而 [f,f,f,f,f] -> no-progress 5/5 exit 2——一次被锁跳过的合法 noop 就能洗掉『5 次都没进展』，MP-05 的补充项从『先实测』改为『直接修』。另：P2-07 比报告说的更严重——读宿主 pi-coding-agent 源码，它读 ~/.agents/skills、<cwd>/.pi/skills、~/.pi/agent/skills，而 .zcode 在宿主源码里零命中，装在 ~/.zcode/skills 的 18 个技能没有任何东西在读。我自己的失误：第一次跑 loop-audit --json 报『无 FAIL』是我的解析 bug（checks 是扁平数组不嵌在 subsystems 下），改用 j.checks.filter(c=>!c.ok) 后看到 toolScope 与 loopActivity 均 FAIL，P2-04 属实。本轮为文档轮，未改任何代码。清理：测试泄漏的 sleep.exe 孤儿已 Stop-Process，探针临时文件已删。"}

{"run_id":"2026-10-17T00:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"m1-evidence-gate-merge-gate-crlf-wiring-breaker","level":"L2","duration_s":0,"items_found":5,"actions_taken":13,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"按 spec 的 M1 阶段落地 MP-01…MP-05，断言 979 → 1018（+39），两环境 hasGnu true/false 均 Failed:0。四条 M1 出口条件全部实测翻正：queue-read 从 0 条变 7 条（note 不再谎称无待办）；APPROVE+Tests->FAIL 的证据从 proceed exit 0 变 escalate exit 2；hasEventWiring('.') 从 true 变 false；ci-sweeper 的 run: 真的执行 ledger-check（原只在 heredoc 说明文本里）。MP-01 六组对抗输入逐条翻正，ASCII -> 与 U+2192 现在等价，证据里的 NOT RUN 被推导进 checks_not_run 而不再只回显入参。MP-02 修两处：verdict 不再硬编码（原 --verdict none 导致从未放行过任何 PR），证据不再从检出目录读（实现者能提交任何文件进 PR）——改为 verifier 的带标记 PR 评论；并给 gate-check 加 awaiting-verification 独立闸门名，区分'没验'（待办）与'验失败'（阻断），调用方不重写闸门结果。MP-03 用 readText 一处归一化代替逐处打补丁。MP-04 收窄后暴露第二层假阳性：本仓库仍返回 wired:true，因为判定落到 LOOP.md 的 declared 回退（含 cron: 与'事件驱动'两个词）——与 P1-06 同一形状换一层，修法是 declared 只在没有 .github/workflows 时认；修完阶段 3 判据 1 转为 FAIL，与 STATE.md 自述'尚未跑过任何一轮真实事件'终于一致。MP-05 的 noop 修法：consecutiveFailures 改为统计尾部非 success 段。5 次变异全部确认落地，其中 2 次抓出我自己的无牙齿断言：(4) 我的'纯 CI'fixture 压根没调 event-router，失败原因错了所以去掉 REPO_EVENT 判断仍全绿——改成 self-check 的真实形态后立刻变红；(5) --pattern 断言用跨行通配匹配到了熔断分支的 --escalation 调用而非判定调用，改成锚定 --pattern 与 --json 同行后变红。另修：test.mjs 文档断言数正则写死三位数字，计数跨 1000 后匹配不上。对审查报告的修正：P2-01 不成立——loop-audit.mjs:130 对捕获值调了 .trim() 而 . 本就不吃 \r，报告与我第三轮的复核都在孤立地测正则、没走代码路径，又是只测一半就归因。未做：MP-06 起全部；真机验证（硬约束 10，MP-02 改的是厂商接入）；Linux 真机未验。"}

{"run_id":"2026-10-17T12:00:00Z","pattern":"review-remediation","event":"manual.audit","item":"m1-status-tracking","level":"L2","duration_s":0,"items_found":14,"actions_taken":3,"escalations":0,"tokens_estimate":0,"outcome":"manual","notes":"记录 M1 的未做项并提交。沿用 REVIEW-2026-10-14-consolidated-plan.md 6.2 的既有约定（列了条目却没人记录哪些真的做了，已完成就不可验证），给新 spec 加了落地状态章节：M1 状态表（MP-01 至 MP-05 已做，逐项附证据）+ 有意未做表（每项写为什么没做与怎么核实）+ 与审查报告的偏离记录。未做项共 14 条：MP-06 至 MP-09、MP-12 至 MP-19（其中 MP-10/MP-11 已提前做——MP-10 是 M1 出口条件的一部分，MP-11 是纯文档零风险）；真机验证 NOT RUN（MP-02 改的是厂商接入，8 个 workflow 从未在真实 GitHub 仓库跑过，按 spec 6.3 未跑则不得启用 L2）；Linux 真机未验（本机两环境是 PATH 顺序差异不是真 Linux）；harness-stage --upgrade 写入路径未验。另记录 3 项需作者决策才能继续的（MP-06 持久化方式、MP-07 实现还是降级为约定、MP-15 接入还是删除）。加了一条测试守这个状态表：每个 MP 必须有状态行、每个未做项必须有理由与核实方式（变异回退确认有牙齿——把 MP-19 那行的理由与核实方式清空后断言变红）。断言 1018 → 1042，两环境均 Failed: 0。"}
