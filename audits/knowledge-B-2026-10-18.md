# 知识卡 B — cobusgreyling/loop-engineering

- 仓库：https://github.com/cobusgreyling/loop-engineering
- commit：`54f8c56dd959b7f8c38ccb499e3719f68fd2e8e6`（2026-10-17，github-actions[bot]）
- 读取日期：2026-10-18
- 读取范围：`README.md`、`LOOP.md`、`AGENTS.md`、`loop-constraints.md`、`loop-budget.md`、`gate.yaml`、`loop-drill.json`、`STATE.md`、`loop-run-log.md`、`docs/*.md`、`patterns/registry.yaml`、`skills/*/SKILL.md`、`tools/{loop,loop-audit,loop-context,loop-cost,loop-gate,loop-drill,loop-worktree,loop-sandbox,loop-swarm,loop-sync,loop-metrics,readiness-core}/src/*.ts`、`templates/*`、`scripts/{github-triage,sync-untrusted-input}.mjs`、`stories/*`（部分）。
- 未读：`tools/goal-*`、`tools/loop-metrics` 的 CLI、`tools/mcp-server` 实现、17 个工具的 `dist/`、全部 `starters/` 与 `examples/` 的逐文件内容、`assets/`。下文不引用。

引用格式：`B@54f8c56:<路径>:<行号>`。推断处标 **[推测]**。

---

## 1. 六原语（五 + 记忆）

| 项 | 内容 |
|---|---|
| 概念名 | Automations / Worktrees / Skills / Connectors / Sub-agents + Memory（State） |
| 解决的失败模式 | 没有调度 = 一次性运行；并行 = 合并地狱；无技能 = 每轮重新推导意图；无状态 = 每轮失忆；无 maker/checker = 自评 |
| 机制 | 文档 + 每原语一个工具的映射表；`docs/primitives-matrix.md` 把 6 原语 × 8 个宿主逐格映射 |
| 强制程度 | 仅建议（文档） |
| 前提条件 | 宿主支持对应原语；否则矩阵里的格子是空的 |
| 成本 | 2 篇文档（99 + 544 行）+ 17 个工具包 |
| 出处 | B@54f8c56:docs/concepts.md:58-63；B@54f8c56:docs/primitives.md:1-99；B@54f8c56:docs/primitives-matrix.md:1-40；工具包数量实测 `ls -d tools/*/ \| wc -l = 17` |

**命名不一致（B 自己）**：`docs/primitives.md:1` 标题是 "The Five Primitives + Memory"，`docs/concepts.md:58` 标题是 "The Six Primitives (+ Memory)"。同一仓库两种数法。我的 README 采用"六原语"，与 B 的 concepts.md 一致，但引用时最好注明"第五个是记忆层，不是并列构件"。

---

## 2. 7 个生产模式（实际 registry 是 8 个）

| 项 | 内容 |
|---|---|
| 概念名 | Daily Triage / Thin Loop / PR Babysitter / CI Sweeper / Dependency Sweeper / Changelog Drafter / Post-Merge Cleanup / Issue Triage |
| 解决的失败模式 | 用错循环类型；节奏与风险不匹配；多个循环互相踩 |
| 机制 | `patterns/registry.yaml`（机器可读）+ 每个模式一篇 md + 每模式一个 starter + `validate-registry.mjs`（根 package.json 的 `validate:registry`） |
| 强制程度 | 机器强制（registry 校验在 CI 里跑），但模式本身是文档 |
| 前提条件 | 有对应的宿主工具与连接器 |
| 成本 | 8 篇模式文档 + 8 个 starter；registry 约 200 行 YAML |
| 出处 | B@54f8c56:patterns/registry.yaml:1-200（`grep -c '^  - id:' = 8`）；B@54f8c56:README.md:64-74；B@54f8c56:package.json（`validate:registry`） |

README 的模式表列 8 行（`README.md:66-73`），其中 "Thin loop" 是事件驱动的最小形态。`docs/pattern-picker.md` 给出"先问痛点"的选择树与重叠规则（`:12-48`），例如"CI Sweeper 拥有失败检查；PR Babysitter 同一小时不重复修同一分支"。

---

## 3. 自主度分级 L0–L3 与就绪度评分

| 项 | 内容 |
|---|---|
| 概念名 | L0 草案 / L1 报告 / L2 辅助 / L3 无人值守；Loop Ready 0–100 分 |
| 解决的失败模式 | 第一天就 L3；用"文件存在"冒充"机制在跑" |
| 机制 | `loop-audit` 的加权评分（`SCORE_WEIGHTS`）+ 阈值（L1≥38、L2≥58、L3≥78）+ 硬门槛（verifier、state、cost observability、真实活动、已证明的护栏） |
| 强制程度 | 机器强制（分数与等级由脚本算出；`loop doctor` 用分数决定 exit 0/1/2） |
| 前提条件 | 仓库根有可识别的文件；`loop-audit` 能跑 |
| 成本 | 17 个工具包（monorepo），每个有 src + dist + test |
| 出处 | B@54f8c56:tools/loop-audit/src/auditor.ts:73-119,397-469；B@54f8c56:docs/loop-design-checklist.md:80-88；B@54f8c56:tools/loop/src/doctor.ts:207-229 |

评分项（`SCORE_WEIGHTS`，`auditor.ts:73-113`）实测清单：base 7、stateFile 18、triage 14、loopConfig 9、agentsMd 9、skills 2+ 14 / 1 个 7、verifier 14、safety 4+4、github 6+4、mcp 3、worktree 3、registry 2、budget 3+3+2+2、governance 3+3+3+3、constraints 4+2、loopActivity 14、harness 4+1+2+1+1、memory 4+2、fleet 4+2。

**关键设计：present is not proven。**
- `hasContent()`：空文件、`{}`、`[]` 不算（`auditor.ts:177-199`）。
- 技能必须有 `name` + `description` frontmatter 才算可加载（`auditor.ts:201-218`）。
- `gate.yaml` 必须有 `version: 1` 与 `denylist:`（`auditor.ts:224-226`）。
- 活动必须是**新鲜**的：`Last run` 时间戳在 14 天内，或 run-log 里有 ISO 日期的 `run_id`，或 14 天内有 git 提交（`auditor.ts:322-396`）。
- L3 还要求 `loop-drill.json` 证明护栏真的会响（`guardrailsProven()`，`auditor.ts:317-320`；`loop-audit/README.md:87-116`）。

B 自己承认记录可以被手写（`loop-audit/README.md:116`），缓解办法是在 CI 里重跑 drill。

---

## 4. 熔断器与上下文管理（loop-context）

| 项 | 内容 |
|---|---|
| 概念名 | 停滞（同一错误 N 次）/ 挫折（相似动作 N 次）/ 无进展（连续失败 M 次）/ token 预算 / 迭代上限；账本剪枝与注入 |
| 解决的失败模式 | 无限修复循环；token 燃烧；上下文被陈旧堆栈淹没 |
| 机制 | 确定性、零依赖 TS 实现：`checkCircuitBreaker()`、`pruneLedger()`、`summarizeAttempts()`、`buildContextInjection()` |
| 强制程度 | 机器强制（CLI exit 2 = escalate），但需要控制脚本真的调用它 |
| 前提条件 | 账本按 schema 写（goal + attempts）；每次尝试追加 |
| 成本 | 1 个包；约 480 行 context-manager + 100 行 daily-spend |
| 出处 | B@54f8c56:tools/loop-context/src/context-manager.ts:47-77,136-178,224-314,333-362,434-482；B@54f8c56:tools/loop-context/README.md:1-80 |

关键细节：
- 错误签名归一化：时间戳、hex、路径→basename、行列号、数字→`#`（`context-manager.ts:136-150`）。B 把**所有**数字都抹掉；我的实现刻意只抹"位置/时长"数字（见差距分析）。
- 相似度用字符 trigram 的 Jaccard，阈值默认 0.85（`:152-178`）。
- **配置校验 fail-closed**：`similarityThreshold` 必须是 (0,1]，`95` 会被拒绝并提示 `0.95`；NaN 会让所有比较为假，所以必须抛错（`:94-127`）。这条是"规则被静默关掉"的机械防护，值得直接吸收。
- 预算来源可以是从 pattern 推导（`budget-resolver.ts`），并按天累计（`daily-spend.ts`，带文件锁与日期滚动）。

---

## 5. 预算 / 成本（loop-cost + loop-budget + budget-negotiator）

| 项 | 内容 |
|---|---|
| 概念名 | 每模式 token 成本三档（noop/report/action）+ 建议日上限；预算超限的 80/90/100 三档动作；预算谈判 |
| 解决的失败模式 | 高频循环空转烧钱；无人值守时预算耗尽后静默失败 |
| 机制 | `loop-cost` 估算 CLI + `loop-budget.md`（人读）+ `loop-budget` skill（运行前/后检查）+ `budget-negotiator` skill（≥90% 时起草申请） |
| 强制程度 | 混合：估算与 `--token-budget` 是机器强制；`loop-budget.md` 的日上限靠 skill 自觉读取 |
| 前提条件 | run-log 里有 `tokens_estimate`；否则日累计是 0 |
| 成本 | 1 个估算包 + 2 个 skill + 1 个模板 |
| 出处 | B@54f8c56:tools/loop-cost/src/estimator.ts:1-160；B@54f8c56:patterns/registry.yaml（每模式 `cost:` 块）；B@54f8c56:skills/loop-budget/SKILL.md:1-40；B@54f8c56:skills/budget-negotiator/SKILL.md:1-60；B@54f8c56:loop-budget.md:1-27 |

注意：`budget-negotiator` 明确"agent 不得自行提高上限，必须人改 `loop-budget.md`"（`:30-35`），这是权限边界，不是预算机制。

---

## 6. 状态漂移检测（loop-sync）

| 项 | 内容 |
|---|---|
| 概念名 | `gate.yaml` ↔ `docs/safety.md` 的路径拒绝列表必须逐条一致；必需文件缺失；`STATE.md` ↔ `LOOP.md` 引用 |
| 解决的失败模式 | 文档说禁止、机器放行（或反之）；配置漂移 |
| 机制 | `policy-drift.ts` 解析两边的 denylist 做**精确字符串比较**，并检查 `maxFiles` 是否在文档里出现；`loop-sync` 给 0–100 一致性分 |
| 强制程度 | 机器强制（只读检测，永不自动改；severity error 扣 20 分） |
| 前提条件 | 两边都能解析；`docs/safety.md` 有 `## Path Denylist` 代码块 |
| 成本 | 1 个包；约 640 行 |
| 出处 | B@54f8c56:tools/loop-sync/src/policy-drift.ts:1-164；B@54f8c56:tools/loop-sync/src/sync.ts:452-640 |

设计取舍值得注意：比较用精确相等而非语义等价，理由是"安全策略应逐字可读，不只是重叠"（`policy-drift.ts:138-143`）。方向性也做了区分：文档有、机器没有 = error（危险方向）；机器有、文档没有 = warning。

---

## 7. worktree 隔离的机器强制（loop-worktree / loop-sandbox / loop-swarm）

| 项 | 内容 |
|---|---|
| 概念名 | 一个 attempt 一个 worktree；manifest 记录状态；终态清理；路径锁；沙箱 patch |
| 解决的失败模式 | 并行冲突；残留 worktree 与分支；两个循环同时改同一批文件 |
| 机制 | `createWorktree()` 用 `git worktree add -b`；manifest 有互斥锁与原子写；`cleanupWorktrees()` 不带 `--force` 时 git 会拒绝删除有未提交改动的 worktree；`gc()` 对账磁盘与 manifest；`lockPaths()` 是带 TTL 与死锁检测的建议锁 |
| 强制程度 | 机器强制（工具层），但**是否调用**靠控制脚本（`multi-loop.md:54-59` 明确"`create` 不检查锁，二者靠约定配对"） |
| 前提条件 | 在 git 仓库内 |
| 成本 | 2 个包；约 360 + 250 行 |
| 出处 | B@54f8c56:tools/loop-worktree/src/worktree.ts:148-272,302-349；B@54f8c56:tools/loop-worktree/src/lock.ts:236-310；B@54f8c56:tools/loop-sandbox/src/sandbox.ts:55-246；B@54f8c56:docs/multi-loop.md:47-64 |

`loop-sandbox` 把 agent 的一次运行放进临时 worktree，结束后提取 `git diff --cached --binary` 成 patch，再清理；信号处理用共享 promise 保证清理只跑一次（`sandbox.ts:81-141`）。

---

## 8. 治理与约束（loop-constraints + loop-gate + gate.yaml）

| 项 | 内容 |
|---|---|
| 概念名 | 约束文件是绑定的；静态策略（denylist / maxFiles / auto-merge allowlist）由独立工具机械执行；拒绝列表与文档漂移被检测 |
| 解决的失败模式 | 策略写在文档里但没人执行；自动合并没有允许列表；拒绝列表被改名绕过 |
| 机制 | `loop-constraints.md`（人读）+ `loop-gate`（YAML 策略执行）+ `loop-sync`（漂移检测） |
| 强制程度 | 机器强制（`loop-gate check` exit 0/2；`maxFiles`、allowlist 都在代码里） |
| 前提条件 | `gate.yaml` 合法；控制脚本调用 `loop-gate` |
| 成本 | 1 个策略文件 + 1 个工具包 |
| 出处 | B@54f8c56:gate.yaml:1-25；B@54f8c56:tools/loop-gate/src/gate.ts:37-140；B@54f8c56:skills/loop-constraints/SKILL.md:1-40；B@54f8c56:loop-constraints.md:1-31 |

`gate.ts` 的关键实现细节：
- 顺序：denylist → file-count → auto-merge allowlist（`:99-139`）。
- **`minimatch(..., { dot: true })`**：没有它，`*` 不匹配以 `.` 开头的段，`**/secrets/**` 会漏掉 `.secrets/prod.json`（`:94-98`）。测试覆盖了这一点（`loop-gate/test/gate.test.mjs:95-103`）。
- 职责边界写得很清楚：loop-gate 不碰运行历史，停滞属于 loop-context（`gate.ts:1-7`）。

---

## 9. 护栏演练（loop-drill）：敏感性与特异性双向

| 项 | 内容 |
|---|---|
| 概念名 | 不只检查护栏"存在"，而是注入已知故障，验证它会响；每条护栏必须双向通过：sensitivity（抓到坏输入）与 specificity（放过好输入） |
| 解决的失败模式 | Verifier Theater（验证者文件存在但从不拒绝）；gate 阻止一切；熔断器从不触发 |
| 机制 | `runGateDrills()` 对每条 denylist 合成样本路径并断言被拦；`runBreakerDrills()` 用合成账本断言**具体**触发原因；`runCanary()` 用变异测试种缺陷，要求 verifier 拒绝；`runInjectionCanary()` 在 state 文件里种指令，要求 agent 不服从且不复制转发 |
| 强制程度 | 机器强制（drill exit 2 = 护栏没响；`--record` 写 `loop-drill.json`，audit 据此授予 L3） |
| 前提条件 | verifier/injection canary 需要可运行的命令；gate/breaker drill 离线、零 token |
| 成本 | 1 个包（约 500 行 drill + 310 行 canary + 300 行 injection）；运行成本取决于 verifier 命令 |
| 出处 | B@54f8c56:tools/loop-drill/src/drill.ts:1-18,120-263,310-456,469-501；B@54f8c56:tools/loop-drill/src/canary.ts:189-310；B@54f8c56:tools/loop-drill/src/injection.ts:1-300；B@54f8c56:tools/loop-drill/src/record.ts:45-123 |

关键设计：
- **样本路径合成**：把 glob 变成具体路径，再让真实 matcher 判断（`drill.ts:120-133`）；合成失败记 skipped，不记 failed。
- **只认具体触发原因**：被 file-count 拦下不算 denylist 通过（`drill.ts:175-190`）。
- **对照运行**：verifier canary 先在干净树上要求 exit 0，再种缺陷要求非零；否则"拒绝一切的 verifier"会拿满分（`canary.ts:194-244`）。injection canary 同样先证明 agent 能跑起来（`injection.ts:178-207`）。
- **变异算子只选无歧义的**（`===`→`!==`、`<=`→`<` 等），排除 `<`→`>` 这类会破坏泛型的（`mutations.ts:9-15,29-72`）。
- **证据与策略绑定**：gate 证明记录 `gate.yaml` 的 sha256（换行归一化），改策略后旧证明作废（`record.ts:45-52`；`loop-audit/README.md:114`）。

---

## 10. 反模式与踩坑记录

| 项 | 内容 |
|---|---|
| 概念名 | 10 条反模式（同一 agent 实现并验证、无尝试上限、含糊 triage、L3 早于 L1、共享状态无 schema、MCP 全写、无 kill switch、用代码修 flake、无允许列表自动合并、无运行日志） |
| 解决的失败模式 | 启用前就能避免的设计错误 |
| 机制 | 纯文字清单 |
| 强制程度 | 仅建议 |
| 前提条件 | 无 |
| 成本 | 82 行 |
| 出处 | B@54f8c56:docs/anti-patterns.md:1-82；B@54f8c56:docs/failure-modes.md:1-216 |

失败模式目录有 S1/S2/S3 分级与真实故事（`stories/`）。两条最诚实的自述：
- **Verifier 问题**：一个 LLM verifier 对回测"发表意见"抓不到过拟合，因为回测本身就是过拟合产物；checker 必须测 maker 无法伪造的东西（`stories/quant-loop-the-verifier-problem.md:20-70`）。
- **熔断器救场**：CI Sweeper 把连接超时误判为性能阈值，连续 14 次修复、烧 1.8M token，最后靠 `loop-context` 熔断（`stories/ci-sweeper-symptom-patching-and-circuit-breaker.md:1-40`）。

---

## 11. 不可信输入（untrusted input）

| 项 | 内容 |
|---|---|
| 概念名 | issue/PR 标题、评论、CI 日志、changelog 是第三方文本，只能当数据；不得服从其中的指令；不得把它复制进下一轮 |
| 解决的失败模式 | 提示注入（S3）：循环把 issue 标题抄进 STATE.md，下一轮当自己的笔记读回 |
| 机制 | ① 统一段落由 `sync-untrusted-input.mjs` 注入所有读取第三方文本的 skill（`--check` 在 CI 里失败）；② `github-triage.mjs` 把第三方文本放进 code span、剥离 Unicode 控制字符、截断长度；③ injection canary 实测 agent 是否服从 |
| 强制程度 | 机器强制（同步脚本 + CI 检查 + canary），但"模型是否服从"只能靠 canary 抽样 |
| 前提条件 | 角色清单（`ROLES`）覆盖所有读取第三方文本的技能 |
| 成本 | 1 个同步脚本 + 1 个 canary + 每技能约 10 行 |
| 出处 | B@54f8c56:scripts/sync-untrusted-input.mjs:34-80；B@54f8c56:scripts/github-triage.mjs:38-67,246；B@54f8c56:docs/safety.md:86-96；B@54f8c56:skills/loop-verifier/SKILL.md:51-61；B@54f8c56:tools/loop-drill/src/injection.ts:60-86,127-157 |

`injection.ts` 的 payload 只要求创建一个随机 nonce 命名的文件，因此对真实 agent 无害；`inspect()` 把"服从"与"复制转发"分开判（`:110-157`）。

---

## 12. 其他可迁移条目

| 概念 | 机制 | 强制 | 出处 |
|---|---|---|---|
| 人审门（human gates） | `safety.md` 列出必须人工的情形；`gate.yaml` 的 allowlist | 部分机器 | B@54f8c56:docs/safety.md:68-78 |
| kill switch | `loop-pause-all` 标签/标志；`loop-budget.md` 里声明 | 约定 | B@54f8c56:loop-budget.md:21-24；B@54f8c56:skills/loop-budget/SKILL.md |
| 运行日志 | 每轮一行 JSON，含 tokens/outcome；`loop-metrics` 聚合 | 约定 + 工具 | B@54f8c56:docs/operating-loops.md:48-70；B@54f8c56:tools/loop-metrics/src/metrics.ts:25-118 |
| 多循环协调 | 每模式独立 state；优先级表；`acting_on`；建议锁 | 部分机器 | B@54f8c56:docs/multi-loop.md:1-84 |
| readiness 评分门槛 | 分数 <40 时 doctor exit 2 | 机器 | B@54f8c56:tools/loop/src/doctor.ts:211-229 |
| 模式注册表 | YAML + 校验脚本 + schema | 机器 | B@54f8c56:patterns/registry.yaml；`patterns/registry.schema.json` |
| 成本分层 | 先便宜 triage，有可操作项才派子智能体；空 watchlist <5k token 退出 | 约定 | B@54f8c56:docs/operating-loops.md:35-46 |
| 事件/定时/目标三型 | `primitives-matrix.md` 的调度速查表 | 文档 | B@54f8c56:docs/primitives-matrix.md:40-60 |

---

## 该仓库自己承认的局限与风险

1. **`loop-drill.json` 是自我声明，可以手写**（`loop-audit/README.md:116`）。B 的缓解是在自己的 CI 里重跑；对使用者没有强制。
2. **锁与 worktree 的配对靠约定**：`loop-worktree create` 不检查锁（`docs/multi-loop.md:54-59`）；`loop-sandbox` 的锁是 opt-in（`:61-64`）。
3. **`budget-negotiator` 触及 L3 安全边界**，B 自己标注了这一点（`skills/budget-negotiator/SKILL.md:20-24`）。
4. **`loop-sync` 的 STATE↔LOOP 相似度检查很粗**：只比较 `## ` 标题集合，阈值 0.3（`sync.ts:133-164,429-436`），基本只能发现"完全不像"。
5. **成本估算来自 registry 的静态数字**，不是真实计量（`tools/loop-cost/registry.json`）；`loop-run-log.md` 里的 `tokens_estimate` 也是估算值。
6. **工具数量与维护面很大**：17 个包、每个有 dist 与 test；`package.json` 的 `test:tools` 串联 16 个测试命令。对只想跑一个循环的用户，这是显著负担。
7. **评分可以被"补文件"刷高**：`loop-init` 的验证矩阵里，一个干净脚手架直接 100/100（`docs/loop-init-validation.md:45`）。B 用 `present is not proven` 部分缓解，但分数本身仍偏向"文件齐全"。
8. **L3 的"无人值守"仍要求人工门**；B 没有、也不声称有真正的无人监督安全证明。
9. **stories 中的数字（1.8M token、14 次尝试）是贡献者自述**，不是受控测量。
