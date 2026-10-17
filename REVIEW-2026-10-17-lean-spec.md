# 修改计划 Spec：Loop Harness 减量与边界收敛

> **状态：计划，未实施。** 本文件只定义要做什么、改哪些文件、验收证据是什么，以及明确不做什么。
> 基线：HEAD `cc09068`，`bash init.sh` → **Passed: 1042 / Failed: 0**，自审计 **94/100 L2**。
> 本仓库是**技能源仓库**，`harness-stage.mjs .` 报 `current_stage: 0` 是消费者判据不适用于源仓库，不是缺陷。
> 配套审计记录见 `STATE.md` 的「2026-10-17 技能包减量审计」与 `loop-run-log.md` 同日条目。

---

## 1. 背景与结论

上一轮审计的结论不是“再补几个机制”，而是三件事：

1. **产品边界没有说清。** 本包是**装配工具 + 事件桥**，不含 agent 运行器；但 README、技能和 workflow 的措辞让人以为事件会自己完成修改、验证和落盘。
2. **安全闭环仍有失效路径。** 合并闸门对“没有批准”“批准后被拒”“伪造 verifier 评论”没有可靠处理；证据闸门读不懂 verifier 自己模板里的失败行；熔断器在账本缺失时退出 1，而调用方只拦 2。
3. **维护面大于运行面。** 同一事实有多份手抄（路由、预算、断言数、技能清单）；活状态文件混入了历史；一些配置没有任何消费者。它们让“改一处、漏一处”成为常态。

**因此本轮的主线是减量、收口、补安全边界，不是继续加功能。**

### 1.1 产品定位（本 Spec 的前提）

| 层 | 本包提供 | 本包不提供 |
|---|---|---|
| 装配 | `harness-stage.mjs` 创建文件、复制运行脚本、安装技能 | 消费者项目的 agent 调度器 |
| 感知 | `event-router.mjs` 把事件映射到阶段/技能/闸门 | 真正启动执行者的运行器 |
| 判定 | `gate-check.mjs`、`ledger-check.mjs`、`budget-check.mjs` | 工具级沙箱、凭据托管、自动合并 |
| 记录 | 文件即状态：`STATE.md`、run-log、ledger | 外部数据库或状态服务 |

**默认承诺：L1 只读分诊。** L2（worktree 中提出修复）仍为实验能力；L3（无人值守）在真实运行器与真实 GitHub 演练完成前**不得宣称可用**。

---

## 2. 目标

| 编号 | 目标 | 可检验的判据 |
|---|---|---|
| G1 | 边界清楚 | 对外文档不再声称本包含 agent 运行器；每条“机制”有代码入口，或明确标为 `[约定]` |
| G2 | 单一入口 | 装配只指向 `harness-stage.mjs`；阶段驱动技能只在包仓库运行；消费者只得到能独立运行的技能 |
| G3 | 单一真相源 | 路由、预算上限、阶段判据数、技能清单各只有一处被代码读取；其余位置是链接 |
| G4 | 合并闸门不可被空批准/伪造评论绕过 | 无有效 APPROVED、批准后被 CHANGES_REQUESTED、非 bot 评论、报告 commit 不匹配 → 一律 escalate |
| G5 | 证据契约一致 | verifier 按自己的模板写 FAIL，闸门必须读到；全 NOT RUN 一律 escalate |
| G6 | 熔断与预算 fail-closed | 账本缺失/损坏 → 停止并升级；阶段 3 装配后每个 workflow 的 `--pattern` 都能查到上限 |
| G7 | 状态可读 | `STATE.md` 只保留活状态；历史可追溯到 run-log / REVIEW / LESSONS |
| G8 | 真实证据 | 真实 GitHub 测试仓库跑通至少一条事件；未跑项显式 **NOT RUN** |

**完成定义沿用 `AGENTS.md` 四条**：行为已实现 / 验证真的跑过且输出被记录 / 证据写入 `feature_list.json` 或 `STATE.md` / 仓库仍能从 `bash init.sh` 起来。

---

## 3. 范围

### 3.1 做什么

1. **M0 收口**：定位与边界声明、单一装配入口、删除重复真相源、收敛活状态、清理无消费者配置、修安装检查。
2. **M1 补安全边界**：合并闸门的审查绑定、verifier 报告契约、熔断 fail-closed、预算模板与 kill switch、workflow 产物交付、路由技能漂移。
3. **M2 真实验证**：真实 GitHub 测试仓库跑一条完整事件链；Linux/GNU-timeout 路径；消费者装配烟测。
4. 每个行为改动配**失败先行**测试（fail-first），并记录变异回退结果。

### 3.2 明确不做

| 不做 | 理由 |
|---|---|
| **不实现 agent 运行器 / 调度器 / 沙箱 / 凭据托管** | 超出本包职责；需要另一套授权与运维模型。本包只交付事件与判定。 |
| **不新增外部状态服务、数据库、第二个评审模型** | 文件即状态是本包的可审查优势；verifier 的问题不是模型不够强，而是闸门不读证据。 |
| **不新增配置项 / 插件层 / 抽象** | 本仓库的教训是“没人读的配置会漂移”。新增配置的默认成本是被删掉。 |
| **不删除或放宽安全机制** | 保留：独立 verifier、拒绝列表、3 次尝试上限、回退测试、NOT RUN、人工合并、kill switch、预算退出。 |
| **不启用自动合并，不创建 allowlist** | `auto_merge: false` 是默认且正确；本轮不碰。 |
| **不宣称 L2/L3 可用** | 在 M2 真实演练完成前，L2 仍标实验，L3 不宣称。 |
| **不整篇重写 `docs/`** | 只改与事实/入口/数字有关的句子；方法论正文不动。 |
| **不做全仓 CRLF renormalize** | 只做代码侧换行归一（已完成）；不制造巨大 diff。 |
| **不删除 `progress.md` / `session-handoff.md` 模板** | 消费者阶段判据仍在用；先瘦身本仓库副本，删除另立决策。 |
| **不修改历史 REVIEW 文件** | 保留审计链；偏离记录写进本 Spec 的落地状态。 |
| **不为让测试变绿而改期望值** | 新增/修改断言必须先证明旧行为会红；禁止放宽闸门。 |
| **不在本轮实现 MP-06 的 run-log 持久化** | 持久化方式（分支/评论/平台写）未决策；在决策前实现等于给空气记账。 |

### 3.3 边界表：包仓库 vs 消费者仓库

| 能力 | 包仓库（本仓库） | 消费者仓库 |
|---|---|---|
| `harness-stage.mjs` / `init-loop-harness.mjs` / `install-skills.mjs` / `test.mjs` | ✅ 运行 | ❌ 不复制 |
| 运行脚本 `event-router` / `gate-check` / `ledger-check` / `budget-check` / `queue-read` / `worktree` / `loop-audit` | ✅ 运行 | ✅ 装配时复制 |
| 阶段驱动技能 `harness-init` / `harness-loop-init` / `harness-consolidate` | ✅ 包内运行 | ❌ 不作为工作区技能安装（由用户级技能或包仓库调用） |
| 运行/控制技能 `loop-constraints` / `loop-budget` / `loop-verifier` / `loop-guard` / triage 等 | ✅ | ✅ 安装到 `.agents/skills/` |
| `docs/`、`templates/`、`patterns/`、`examples/` | ✅ 真相源 | 只复制模板与 workflow（按阶段） |

**判定规则**：任何技能正文若引用 `harness-stage.mjs`、`docs/`、`patterns/`，必须显式写“仅在本包仓库运行”；否则不得安装进消费者工作区。

---

## 4. 修改项总表

| 编号 | 里程碑 | 修改内容 | 主要文件 | 依赖 |
|---|---|---|---|---|
| LP-01 | M0 | 定位、边界、`[机制]`/`[约定]` 标注 | README、AGENTS、docs/10-12、examples README | — |
| LP-02 | M0 | 单一装配入口；阶段技能不装进消费者 | harness-stage、三个阶段技能、docs/10、test | LP-01 |
| LP-03 | M0 | 删除重复路由/预算/数字表，改链接；修 `@` 与 `--target` 示例 | event-router SKILL、LOOP、docs/10-12、README | — |
| LP-04 | M0 | `STATE.md` 瘦身；progress/handoff 去陈旧；feature id 唯一 | STATE、progress、session-handoff、feature_list、test | — |
| LP-05 | M0 | 配置去装饰：阈值单一来源、删除无消费者键/段、run-log 单行格式 | registry、budget-check、gate-check、loop-budget、docs/06 | LP-03 |
| LP-06 | M0 | `install-skills --check` 无 manifest 误报；文档补 `--check` | install-skills、docs/12、test | LP-02 |
| LP-07 | M1 | 合并闸门：无批准不回退 head、取最后一条 review、bot 作者、报告绑定 commit | merge-gate.yml、loop-verifier SKILL、test | LP-01 |
| LP-08 | M1 | verifier 报告契约：状态行兼容、全 NOT RUN escalate | gate-check、loop-verifier SKILL、test | LP-07 |
| LP-09 | M1 | 熔断 fail-closed；锁持有时不跑熔断 | ledger-check、ci-sweeper.yml、test | — |
| LP-10 | M1 | 阶段 3 预算模板补行；kill switch 标签承诺删除或实现 | templates/loop-budget、loop-budget、docs/04、budget-check、test | LP-05 |
| LP-11 | M1 | workflow 产物必须交付；release 触发与路由一致 | daily-triage、lesson-harvest、release-draft、test | — |
| LP-12 | M1 | 路由技能数组对齐；`attempts` 死路径显式标注 | LOOP、event-router SKILL、ROUTES、merge-gate、test | LP-03 |
| LP-13 | M2 | 真实 GitHub 测试仓库端到端演练 | 无代码；STATE/run-log 记录 | LP-07…LP-11 |
| LP-14 | M2 | Linux/GNU-timeout + 消费者装配烟测 | test、CI、STATE/run-log | LP-02、LP-06 |

---

## 5. 分项说明

### LP-01 定位、边界、机制标注

**问题**：README 的“五种用法”和 workflow 说明容易被读成“事件会自动完成修改”；`AGENTS.md` 的硬约束里混有未实现的机制；`docs/11` 同时存在“10 项”和“8 项”。

**改什么**：
- 在 `README.md` 顶部与 `docs/10` 的用法 ④ 明确：**本包不含 agent 运行器；workflow 只做感知、判定、记账；未接运行器时止于 `fix-proposed`。**
- 在 `AGENTS.md` 的硬约束与 `loop-constraints.md` 中，对每条规则标 `[机制]`（有代码入口且测试断言改值会改行为）或 `[约定]`（靠人或 agent 自觉）。
- `docs/11` 的阶段 1 总表与判据表统一为 **8 项**；`docs/12` 的 `10/10`、`9 个阶段 1 技能目录` 一并修正。
- 在 `docs/12` 增加“消费者仓库能跑什么 / 不能跑什么”的边界表（复用 §3.3）。

**不改什么**：不重写 `docs/00`–`09` 的方法论；不删除任何安全规则。

**验收**：
- `grep` 不再出现“10 项（全机械）”“10/10”“9 个阶段 1 技能目录”。
- 新增测试：每个硬约束必须带 `[机制]` 或 `[约定]`；带 `[机制]` 的条目必须在 `test.mjs` 中有对应行为断言。
- `bash init.sh` 通过。

**失败先行**：先让测试在当前文档上红（缺标注/数字不符），再改文档。

---

### LP-02 单一装配入口；阶段技能不装进消费者

**问题**：`harness-init/SKILL.md:25`、`harness-loop-init/SKILL.md:28`、`harness-consolidate/SKILL.md:25` 都要求运行 `scripts/harness-stage.mjs`；但 `harness-stage.mjs:690-701` 明确不复制该脚本，却在 `:766-771` 把这三个阶段技能复制进消费者 `.agents/skills/`。在消费者里调用 `/harness-init` 第一步就是 `ERR_MODULE_NOT_FOUND`。

**改什么**：
- 在 `harness-stage.mjs` 增加 `PACK_ONLY_SKILLS = ['harness-init','harness-loop-init','harness-consolidate']`；`copySkillDir` 跳过它们。阶段驱动技能仍保留在包仓库与用户级安装中。
- 三个阶段技能正文顶部加一行：**“运行位置：本技能只在 harness 包仓库运行；消费者仓库不安装本技能。”**
- `docs/10` 的“技能全表”与 `docs/12` 的准备步骤明确：阶段驱动技能用用户级安装，消费者工作区只装运行/控制技能。
- `init-loop-harness.mjs` 标为 **legacy**：`--help` 改成与实现一致（它不复制运行脚本、不复制 workflow），文档不再推荐；保留脚本与测试，删除另立决策（见 §9）。

**不改什么**：不删除 `init-loop-harness.mjs`；不改变 `STAGE1_SKILLS` 中运行/控制技能的安装。

**验收**：
- 临时消费者目录跑 `--upgrade --stage 1/2/3`：`.agents/skills/` 中**没有**三个阶段驱动技能；有 `loop-verifier`、`loop-guard`、triage 等。
- 包仓库自身 `harness-stage . --json` 行为不变。
- 新增测试：阶段驱动技能不在消费者技能目录；三个技能正文含“只在包仓库运行”。

**失败先行**：先在当前代码上断言“消费者不含 `harness-init`”，测试应红。

**风险**：用户级未安装阶段技能时，消费者里无法调用 `/harness-init`。文档必须把“先安装用户级技能”写成前置；这是有意的边界。

---

### LP-03 删除重复真相源

**问题**：
- `skills/event-router/SKILL.md:23-59` 手抄了一份路由表，且与 `ROUTES` 不一致：`workflow_run.completed:failure` 少了 `minimal-fix`；`pull_request.closed:unmerged` 写“记录到运行日志”，而 `ROUTES` 的 `skills: []`。
- `LOOP.md:64-71` 的“每日 token 上限”列与 `loop-budget.md` 是两份手抄；`budget-check` 只读后者。
- `docs/10:222` 写 724 断言，同文件 `:16` 写 1042；`docs/12:127` 写 10/10；`docs/12:70` 写 9 个阶段 1 技能目录。
- `README.md:145-147` 的 `--diff-files changed-files.txt` 少了 `@`；`docs/12:271,341` 的 `event-router` 命令没带 `--target`，而 `harness-loop/SKILL.md:96` 明确说不可省。

**改什么**：
- 删除 `skills/event-router/SKILL.md` 的路由表，改为：“可执行真相源是 `scripts/event-router.mjs` 的 `ROUTES`；`LOOP.md` 是对外登记表；两处由 `test.mjs` 第 17 节双向核对。”
- `LOOP.md` 的“每日 token 上限”列改为“见 `loop-budget.md`”，不再抄数字。
- 修正上述数字与命令示例；`README` 的示例改成 `--diff-files @changed-files.txt`。
- 测试扩展：
  - `ROUTES` 的 `skills` 数组与 `LOOP.md` 技能列一致（不只比 phase）。
  - 文档中的 `event-router` 示例必须带 `--target`。
  - 文档中的 `gate-check --diff-files` 示例必须带 `@` 或逗号列表。

**不改什么**：不改 `ROUTES` 的实际路由行为（除非 LP-12 单独决定）。

**验收**：上述测试在旧文档上红；改后绿；`bash init.sh` 通过。

---

### LP-04 活状态收敛

**问题**：`STATE.md` 已 657 行，启动必读；`progress.md:3-7` 停在旧会话；`session-handoff.md:14-15` 仍写 `main` 与“本轮改动尚未提交”；`feature_list.json` 的 `stage-001` 出现两次（索引 1 与 7），阶段 1 判据因此失败。

**改什么**：
- `STATE.md` 只保留：Last run、High Priority（当前阻塞/待决策）、Active、Watch List（只留仍需行动的）、Human Inbox、Post-Run Critique 的**最近一轮**。
- 历史条目移到 `loop-run-log.md` 已有记录或 `LESSONS.md`；在 `STATE.md` 末尾加一行“历史见 `loop-run-log.md` 与 `REVIEW-*`”，不新建文件。
- `progress.md` 改为 10 行以内的当前快照（Last Updated、Active Feature、Next、Blockers），不再保留已完成的流水账。
- `session-handoff.md` 更新为当前分支/commit/下一步；或改成“本仓库的 handoff 由 STATE.md 承担”的短说明（保留模板供消费者）。
- 修正 `feature_list.json` 的重复 id（把第二个改为 `stage-002` 或更具体 id），并加唯一性断言。

**不改什么**：不删除 `progress.md` / `session-handoff.md` 模板；不改阶段 1 判据对这两个文件的要求（另立决策）。

**验收**：
- `STATE.md` ≤ 150 行（或明确记录为何仍超）。
- `feature_list.json` 的 id 唯一；新增断言 `new Set(ids).size === ids.length`。
- 启动工作流仍能只读 `STATE.md` 得到当前事项与下一步。

**失败先行**：唯一性断言在当前文件上红。

---

### LP-05 配置去装饰

**问题**：
- 预算阈值有两份：`budget-check.mjs:30` 的常量 80/100，与 `registry.yaml` 的 `budget_report_only_pct` / `budget_exit_pct`（被 `gate-check` 读取）。同一输入可能得到不同判定。
- `registry.yaml` 的 `patterns:` 段、`priority:` 段、`merge_binding` / `red_check_required` / `not_run_must_be_listed` / `lesson_promotion_threshold` / `stage2_requires_triage_accuracy` / `ablation_interval` 没有脚本消费者（`test.mjs` 只断言文字存在）。
- `loop-budget.md:32-33` 说“以 `registry.yaml` 的 `suggested_daily_cap` 为准”，但没有任何代码读它。
- `budget-check.mjs:115` 只解析单行 JSON；`loop-run-log.md:7-22`、`docs/06:82-99`、`skills/loop-budget/SKILL.md:31-47` 的格式示例是多行 pretty JSON，照文档写会被静默算成 0。

**改什么**：
- **阈值单一来源**：保留 `budget-check.mjs` 的 80/100 常量；删除 `registry.yaml` 的两个预算键与 `readRegistryDefaults` 的对应读取（`common.mjs:542-543`）。`gate-check` 的预算判定改为接收 `--budget-pct`，阈值由调用方从 `budget-check` 结果传入，或使用同一常量。
- **删除无消费者配置**：`patterns:` 整段、`priority:` 整段、上述 6 个 defaults 键。若某个键在 LP-10/LP-12 中确定要接消费者，则保留并加行为断言；否则删除。同步更新 `test.mjs` 中“文字存在”型断言。
- **run-log 格式统一为单行**：把三处文档示例改成一行 JSON，并注明“一条记录一行”；保留 `budget-check` 的单行解析。历史多行记录不删除，但标注为旧格式。
- `loop-budget.md` 删除“以 registry 为准”的句子，明确“本文件是唯一被 `budget-check` 读取的上限来源”。

**不改什么**：不引入 YAML 依赖；不新增配置文件；不改变 80/100 的实际行为。

**验收**：
- 修改 `budget-check` 常量后，`gate-check` 与 `budget-check` 对同一输入给出一致模式（新增行为断言）。
- `registry.yaml` 中不存在无消费者的键；若保留，测试必须证明改值会改行为。
- 按文档写的单行 run-log 能被 `sumTodaySpend` 计入；多行旧格式明确标为不计入。

**失败先行**：当前用多行格式写一条 400k 记录，`budget-check` 报 `used: 0`；测试应先红。

---

### LP-06 安装检查与默认安装面

**问题**：`install-skills.mjs:231-234` 把 manifest 与目录实际内容取并集；没有 manifest 时，目录里所有技能都被当成“本包安装的”，`:241-248` 把它们全报成“清单残留”并退出 1。`docs/10:18` 声称已安装两个目录，实际 `.agents/skills` 没有本包技能；`--check` 在 docs/12 中完全没出现。

**改什么**：
- 无 manifest 时只报告“该目录不是本包安装的”，退出 0（与 `--list` 一致）；有 manifest 时才做漂移比对。
- `docs/12` 的一次性准备加入 `install-skills --check`，并说明“用户级优先于工作区级”。
- `docs/10:18` 的状态改为“以 `--check` 的实际输出为准”，不写死 ✅。

**不改什么**：不改变安装/卸载的路径安全校验；不新增布局。

**验收**：
- 在无 manifest 的临时目录跑 `--check` → 退出 0，且不把用户技能报成残留。
- 有 manifest 且副本被改动 → 退出 1，列出漂移项。
- 新增测试覆盖这两个分支。

**失败先行**：当前在无 manifest 目录上 `--check` 退出 1；测试先红。

---

### LP-07 合并闸门：审查绑定与证据来源

**问题**：
- `merge-gate.yml:51-54` 在没有任何 APPROVED review 时，`REVIEWED_SHA` 为空，`${REVIEWED_SHA:-$HEAD_SHA}` 回退成 head；`gate-check` 的 `reviewedSha !== headSha` 必然通过。
- 先 APPROVED、后 CHANGES_REQUESTED 时，`last APPROVED` 仍取旧批准。
- `merge-gate.yml:110-112` 只按评论标记取最后一条，不校验作者；PR 作者可以伪造；报告也没有绑定 commit。

**改什么**：
- 删除 `:-$HEAD_SHA` 回退；没有 APPROVED 就传空，让 `gate-check` 按既有 fail-closed 升级。
- 取“最后一条 review”并要求其 state 为 `APPROVED`；或用 `reviewDecision == APPROVED` 且最后一条 review 不是 CHANGES_REQUESTED。二者取更严格者。
- jq 增加作者过滤：只接受 `LOOP_BOT_TOKEN` 对应账号（可配置 `LOOP_BOT_LOGIN`，默认 `loop-bot`）。
- verifier 报告格式增加 `Commit: <sha>` 与标记 `<!-- loop-verifier-report -->`；merge-gate 比对报告 commit 与当前 head，不一致则 escalate。
- 新增 fixture：无批准、批准后拒绝、批准后 push、非 bot 评论、报告 commit 不匹配。

**不改什么**：不在 workflow 里自动合并；不把审查逻辑搬进 workflow（仍由 `gate-check` 判定）。

**验收**：
- 五类对抗输入全部 `escalate`，且 reason 指名是哪一项。
- 正常 APPROVED + 匹配 commit → `proceed`（在本地 fixture 中）。
- 变异回退：删掉作者过滤或 commit 比对，测试必须红。

**风险**：收紧后所有未批准的 ready_for_review PR 都会升级；这是正确行为，但会改变现有观察结果。

---

### LP-08 verifier 报告契约

**问题**：`gate-check.mjs:281` 的 `EVIDENCE_LINE` 要求每项都带反引号命令；`loop-verifier/SKILL.md:132,135,136` 的 `Red check` / `Scope check` / `Denylist check` 是“状态 + 说明”，没有命令。按技能模板写的 `APPROVE` + `Red check: FAIL` 会被忽略，仍可能 `proceed`。全 NOT RUN 也未被拒绝。

**改什么**：
- 二选一，推荐 **A**：
  - **A（改闸门）**：为 `Red check|Scope check|Denylist check` 增加“无命令、仅状态”的正则；`Tests|Lint|Real-use validation` 仍要求命令。合并后统一做“APPROVE 但任一 FAIL → escalate”。
  - **B（改模板）**：给这三行也加一个可核对的命令/证据字段。
- 增加规则：`APPROVE` 且所有检查都是 `NOT RUN` → escalate（除非报告明确说明为何仍批准，并列入 `### Checks not run`）。
- 新增 fixture：状态行无命令的 FAIL、全 NOT RUN、缺 `### Checks not run`、ASCII `->` 与 U+2192。

**不改什么**：不删除“命令 + 状态”的严格格式；不放松 `Tests` 的证据要求。

**验收**：上述 fixture 在旧实现上红；改后绿；`bash init.sh` 通过。

---

### LP-09 熔断 fail-closed 与锁守卫

**问题**：`ledger-check.mjs:352-357` 在账本缺失/坏 JSON 时 `fail()` 退出 1；`ci-sweeper.yml:150-155` 只在 `CODE = "2"` 时停。于是账本缺失时熔断器静默放行。`ci-sweeper.yml:142-160` 的熔断步骤没有 `if: steps.route.outputs.conflict != 'lock-held'`，锁被持有时仍可能因熔断把 job 变红。

**改什么**：
- CLI 层：账本缺失/坏 JSON 输出 `no-ledger` 结果并 `process.exit(2)`；帮助文本与 `docs/10:220` 对齐。
- `ci-sweeper.yml`：熔断步骤加锁守卫；对非 0 且非 `placeholder-ledger` / `no-pattern-records` 的退出码一律停。
- 更新 `test.mjs:2198-2200` 的期望（从 1 改为 2），并新增“坏 JSON”分支。

**不改什么**：不改变“空 attempts 数组 = 还没开始跑”的语义。

**验收**：缺账本、坏 JSON、正常账本三组 fixture 的退出码与 verdict 正确；锁持有时熔断不运行。

---

### LP-10 预算模板与 kill switch

**问题**：
- `templates/loop-budget.md:7-14` 只有 6 行；阶段 3 装配后 `daily-triage.yml:42`、`lesson-harvest.yml:44` 请求 `daily-triage` / `lesson-harvest`，`budget-check` 查不到上限即 `mode:exit`，workflow 的 fail-closed 守卫直接失败。
- `loop-budget.md:64-66` 与 `docs/04:136` 说 `loop-pause-all` 可用 issue 标签；`budget-check.mjs:133-139` 只读 `STATE.md` / `loop-constraints.md`，workflow 也不查标签。

**改什么**：
- 把根仓库 `loop-budget.md:16-18` 的三行（`daily-triage` / `lesson-harvest` / `signal-gatekeeper`）补进 `templates/loop-budget.md`。
- kill switch：二选一，推荐 **删除标签承诺**（保留 `STATE.md` / `loop-constraints.md` 标志），因为 runner 里没有可靠的标签读取路径；若保留标签，则必须在 workflow 增加 `gh issue list --label loop-pause-all` 并加测试。
- 新增测试：阶段 3 装配后的临时仓库，对每个 workflow 的 `--pattern` 跑 `budget-check`，不得返回 `exit`。

**不改什么**：不改变 80/100 阈值；不新增预算配置。

**验收**：模板补齐后，阶段 3 的 8 个 workflow 模式都能解析到上限；kill switch 文档与代码一致。

---

### LP-11 workflow 产物交付与 release 触发

**问题**：
- `daily-triage.yml:75-93` 写 `.loop/daily/TRIAGE.md`，`:102-108` 只上传 run-log；报告随 job 消失。
- `lesson-harvest.yml:3` 声明“写进 LESSONS.md”、`:12` 给了 `contents: write`，但只生成 `.loop/nightly/REVIEW.md`，没有提交或上传报告。
- `release-draft.yml:101-132` 写 `RELEASE_NOTES_DRAFT.md` 后没有任何交付。
- `release-draft.yml:6-9` 同时订阅 `release: published`，`:71` 却无条件 `--event push:tags`，release 事件被路由成 tag 事件。

**改什么**：
- 三个报告各加一行 `cat <报告> >> "$GITHUB_STEP_SUMMARY"`（保留 90 天、无需 artifact）；若需要文件，改用 `upload-artifact`（3 行）。
- `lesson-harvest`：要么补提交步骤并保留 `contents: write`，要么删除 `contents: write` 与“写进 LESSONS.md”的注释。推荐先删除权限与声明，避免“看起来会写”。
- `release-draft`：删除 `release: published` 触发器（或按 `github.event_name` 路由到 `release.published`）；两者选一，并与 `LOOP.md` 一致。

**不改什么**：不在 workflow 里执行 agent 逻辑；不自动发布/打标签/合并。

**验收**：每个产生报告的 workflow 都有可核对的交付步骤；`release` 触发与路由一致；新增静态断言。

---

### LP-12 路由技能数组与 `attempts` 死路径

**问题**：
- `LOOP.md:40` 写 `workflow_run.completed:failure` 只到 `ci-triage`，`ROUTES` 是 `ci-triage, minimal-fix`；`LOOP.md:43` 写 `pull_request.closed:unmerged` → `post-merge-cleanup`，`ROUTES` 是空技能。
- `merge-gate.yml:152-161` 不传 `--attempts`，`max-attempts` 永不触发；`pr-review.yml:164` 的“追加账本”只是 echo，全仓没有脚本写 `loop-ledger.json`。

**改什么**：
- 以 `ROUTES` 为准修正 `LOOP.md` 与 `event-router/SKILL.md`（LP-03 已删除重复表，这里只改 `LOOP.md`）。
- `attempts`：二选一，推荐 **显式标注限制**——在 `merge-gate` 的注释与 `docs/03` 写明“attempts 仅当外部平台写账本时有效；本包不含写入器”，并删掉“合并路径会执行 max-attempts”的暗示。若要真接线，需先实现账本写入（另立决策，不在本轮）。
- 新增测试：`LOOP.md` 技能列与 `ROUTES.skills` 一致（双向）。

**不改什么**：不为了 `attempts` 新增写入型脚本；不伪造账本记录。

**验收**：路由技能数组一致；`docs/03` 不再宣称合并路径会执行 attempts 闸门（或明确标为 NOT RUN）。

---

### LP-13 真实 GitHub 测试仓库演练

**问题**：8 个 workflow 从未在真实 GitHub 仓库上跑过；硬约束 10 未满足。

**做什么**：
- 在一个**测试仓库**（非生产）安装阶段 3 产物，配置 `LOOP_BOT_TOKEN`（最小权限）。
- 跑三条事件：
  1. 无 APPROVED 的 `ready_for_review` → merge-gate 必须 escalate，并说明缺批准。
  2. APPROVED 且 commit 匹配 → merge-gate 必须 `proceed`（本地 fixture 或真实闸门），不自动合并。
  3. CI 失败 → ci-sweeper 必须路由、写 work item、上传 artifact，且预算检查可读。
- 记录：workflow 运行 URL、关键日志、`event-router` 输出、artifact 名称、失败原因（若有）。

**不改什么**：不在生产仓库启用 L2/L3；不为了跑通放宽闸门。

**验收**：命令与输出写入 `STATE.md` 与 `loop-run-log.md`；未跑项标 **NOT RUN**。**未完成前，消费者 L2/L3 继续禁用。**

---

### LP-14 Linux/GNU-timeout 与消费者装配烟测

**问题**：本机验证只在 Windows/MSYS；`samePath`、`pwd -W`、GNU timeout 路径未在 Linux 跑过；`--upgrade` 写入路径未在消费者完整验证。

**做什么**：
- 在 `ubuntu-latest` CI 或 WSL 跑 `bash init.sh` 与 `node scripts/test.mjs`；记录 `hasGnuTimeout()` 分支。
- 在临时消费者目录跑 `--upgrade --stage 1/2/3`，执行复制后的 `event-router`、`gate-check`、`ledger-check`、`budget-check`、`queue-read`、`worktree`，确认无 `ERR_MODULE_NOT_FOUND`。
- 跑 `install-skills --target <consumer>` 与 `--check`。

**不改什么**：不为 Linux 特判业务逻辑；不引入新依赖。

**验收**：CI 绿；消费者烟测输出记录；未跑项标 NOT RUN。

---

## 6. 实施顺序与里程碑

### M0 · 收口（文档与配置，行为不变）

顺序：LP-01 → LP-03 → LP-04 → LP-05 → LP-06 → LP-02。

**出口条件**：
- 对外文档不再声称本包含运行器；每条硬约束有 `[机制]`/`[约定]` 标注。
- 装配入口只剩 `harness-stage.mjs` 一条被推荐；消费者工作区不含阶段驱动技能。
- 重复路由/预算/数字表已删除或改为链接；`STATE.md` ≤ 150 行；feature id 唯一。
- 无消费者的配置已删除或接上消费者；run-log 格式单行。
- `bash init.sh` 通过；断言数变化记录在 `feature_list.json`。

### M1 · 安全闭环（行为改动，全部 fail-first）

顺序：LP-09 → LP-08 → LP-07 → LP-10 → LP-11 → LP-12。

**出口条件**：
- 无批准/批准后拒绝/伪造评论/报告 commit 不匹配 → 全部 escalate。
- verifier 模板里的 FAIL 行能被闸门读到；全 NOT RUN → escalate。
- 账本缺失/坏 JSON → 停止并升级；锁持有时熔断不运行。
- 阶段 3 装配后每个 workflow 的预算 pattern 都能解析到上限。
- 每个报告型 workflow 有交付步骤；release 触发与路由一致。
- 所有新增断言都做过变异回退（改回旧行为必红）。
- `bash init.sh` 通过。

### M2 · 真实证据

顺序：LP-13 → LP-14。

**出口条件**：
- 真实 GitHub 测试仓库至少一条完整事件链有 URL + 日志 + 结论。
- Linux 与消费者烟测通过，或明确 NOT RUN。
- 未完成前：README 与 `docs/10` 继续标 L2 实验、L3 不宣称。

---

## 7. 验证与回归

### 7.1 每项必须跑的检查

| 检查 | 命令 | 期望 |
|---|---|---|
| 本地套件 | `bash init.sh` | `Failed: 0`；自审计不下降（分数可因删除虚高项下降，但需解释） |
| 断言套件 | `node scripts/test.mjs` | 全绿；新增断言数写入 `feature_list.json` |
| 变异回退 | 手动改回旧行为 | 对应断言必须红；记录改前/改后输出 |
| 消费者烟测 | 临时目录 `--upgrade --stage 1/2/3` | 运行脚本可执行；无 `ERR_MODULE_NOT_FOUND` |
| 预算模式 | 对每个 workflow 的 `--pattern` 跑 `budget-check` | 不返回 `exit`（除真实超限/暂停） |
| 真实 GitHub | 测试仓库事件 | 记录 URL、日志、artifact；未跑标 NOT RUN |

### 7.2 测试规则

- 新增/修改断言必须先证明**旧行为会红**；不接受“写完就是绿的”。
- 断言范围必须等于被守护的对象：不能只查“文件里有这句话”，要查“调用形态/行为”。
- 删除配置时，同步删除“文字存在”型断言；改为行为断言或删除。
- 禁止为了绿而放宽阈值、跳过用例、注释检查。

### 7.3 文档规则

- 数字只写一处；其他位置给链接或“见脚本”。
- 命令示例必须能被复制执行；`--diff-files` 带 `@`，`event-router` 带 `--target`。
- 机制与约定必须标注；未实现的能力写 **NOT RUN**，不写成“已支持”。

---

## 8. 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 收紧合并闸门导致更多升级 | 人工审查量上升 | 这是正确行为；在 `STATE.md` 记录升级原因，先跑 L1 |
| 阶段驱动技能不再装进消费者 | 用户找不到 `/harness-init` | 文档把用户级安装写成前置；保留包内调用 |
| 删除 registry 配置导致测试红 | 需要同步改测试 | 先改测试为行为断言，再删配置；一项一提交 |
| `STATE.md` 瘦身丢失历史 | 追溯困难 | 先把独有教训移入 `LESSONS.md`；历史保留在 run-log/REVIEW |
| run-log 改单行格式 | 旧多行记录不被计入 | 明确标注旧格式；不删除历史数据 |
| 真实 GitHub 演练失败 | L2 仍不可用 | 记录 NOT RUN 与失败原因；不放宽闸门 |

**回滚粒度**：每个 LP 一个提交；文档项可单独回滚；代码项回滚时同步回滚对应测试。状态文件改动是追加式，回滚代码不回滚数据。

---

## 9. 待作者决策

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| 1 | `signal-gatekeeper` 的定位 | (a) 保留为可选对话技能，删除 registry/预算/阶段 3 安装；(b) 维持现状 | **(a)**：它没有事件触发消费者，继续登记为循环会误导。保留 `SKILL.md` 供对话使用。 |
| 2 | `progress.md` / `session-handoff.md` | (a) 保留模板，本仓库副本瘦身；(b) 从阶段 1 删除，统一用 `STATE.md` | **(a)**：先瘦身，删除需要改阶段判据与多篇文档，另立 spec。 |
| 3 | `init-loop-harness.mjs` | (a) 标 legacy 并停止推荐；(b) 删除脚本与测试 | **(a)**：先停止推荐；确认无消费者后再删。 |
| 4 | run-log 持久化 | (a) 提交分支；(b) PR 评论；(c) agent 平台写 | **暂不实现**。在决策前，预算百分比标为“估算/未接线”，不把 `used: 0` 当受控。 |
| 5 | `attempts` 闸门 | (a) 显式标注“仅外部平台写账本时有效”；(b) 实现写入器 | **(a)**：本轮不新增写入型脚本；避免给空气设上限。 |
| 6 | kill switch 标签 | (a) 删除标签承诺；(b) workflow 查标签 | **(a)**：runner 里没有可靠读取路径；保留文件标志。 |

---

## 10. 落地状态（实施后更新）

> 约定：每个 LP 必须有状态；每个未做项必须写理由与核实方式。只写“未做”不写为什么，等于把工作丢给下一个读的人。

### 状态表

| LP | 状态 | 证据 |
|---|---|---|
| LP-01 定位与标注 | ✅ 已做 | README 顶部边界声明；`loop-constraints.md` 每条规则带 `[机制]`/`[约定]`，测试断言无遗漏；`docs/11` 阶段 1 统一 8 项；`docs/03` 标注 attempts 未接线 |
| LP-02 单一入口 | ✅ 已做 | `harness-stage.mjs` 的 `PACK_ONLY_SKILLS` 跳过三个阶段驱动技能；`init-loop-harness.mjs` 同步；三份 SKILL.md 声明"只在包仓库运行"；测试断言消费者不含它们 |
| LP-03 删除重复真相源 | ✅ 已做 | `event-router/SKILL.md` 删表改为链接；`LOOP.md` 预算列改为"见 loop-budget.md"；修正 `@`/`--target`/数字；新增"LOOP.md 技能数组与 ROUTES 一致"与"文档示例可照抄执行"断言 |
| LP-04 活状态收敛 | ✅ 已做 | `STATE.md` 657 → 约 75 行；`feature_list.json` 重复 id 修正；新增 id 唯一性断言。`progress.md`/`session-handoff.md` 去留待决策（§9） |
| LP-05 配置去装饰 | ✅ 已做 | 删除 `registry.yaml` 的 `patterns:`/`priority:`/6 个无消费者键；预算阈值只留 `budget-check` 常量；run-log 单行格式待文档同步（见下） |
| LP-06 安装检查 | ✅ 已做 | 无 manifest 目录 `--check` 退出 0 并说明"不是本包装的"；新增用户技能不被误报的测试 |
| LP-07 合并闸门 | ✅ 已做 | 删除 head 回退；取最后一条 review 且要求 APPROVED；只接受 bot 评论（`LOOP_BOT_LOGIN`）；报告 `Commit:` 与 head 比对。测试覆盖无批准/后续拒绝/伪造作者/过期报告 |
| LP-08 证据契约 | ✅ 已做 | 接受 verifier 模板的无命令状态行；全 NOT RUN → escalate；新增模板格式 FAIL 与全 NOT RUN fixture |
| LP-09 熔断 fail-closed | ✅ 已做 | 账本缺失/坏 JSON → no-ledger exit 2；ci-sweeper 拦所有非 0；熔断步骤加 lock-held 守卫；测试断言 |
| LP-10 预算模板与 kill switch | ✅ 已做 | 模板补三行定时循环；新增"模板覆盖全部 workflow pattern"断言；删除 issue 标签承诺（代码只读文件） |
| LP-11 workflow 交付与 release | ✅ 已做 | 三个报告型 workflow 写 `$GITHUB_STEP_SUMMARY`；release-draft 删除 `release.published` 触发；测试断言 |
| LP-12 路由与 attempts | ✅ 已做 | `LOOP.md` 技能列与 ROUTES 对齐；`docs/03` 与 `loop-constraints.md` 明确 attempts **未接线**、按 NOT RUN 对待 |
| LP-13 真实 GitHub 演练 | ⬜ 未做 | **NOT RUN**：无测试仓库/网络凭据；未跑前消费者 L2/L3 继续禁用 |
| LP-14 Linux/消费者烟测 | ⬜ 未做 | **NOT RUN**：仅本机 Windows/MSYS；消费者装配烟测已有部分覆盖（运行脚本可执行），未在 Linux 跑 |

**本轮验证**：`node scripts/test.mjs` → Passed: 1058 / Failed: 0；`bash init.sh` → 通过，自审计 94/100 L2。
新增断言均先确认在旧行为上会红（例：无 manifest 目录 `--check` 曾退出 1、账本缺失曾退出 1、
merge-gate 曾回退 head、全 NOT RUN 曾 proceed）。

### 有意未做（附理由，可核对）

| 项 | 状态 | 为什么没做 | 怎么核实 |
|---|---|---|---|
| MP-06 run-log 持久化 | 未做 | 持久化方式未决策；在决策前实现 `used` 仍为 0 | `scripts/run-log-append.mjs` 不存在；`budget-check` 的 `used` 仍来自现有 run-log |
| MP-07 独立性声明检查 | 未做 | 需先决定“实现检查”还是“降级为约定”；本轮只标注 | `gate-check --help` 无 `--verifier-id` |
| 自动合并 allowlist | 未做 | 默认关闭且正确；无需求 | `patterns/registry.yaml` 的 `auto_merge: false` |
| 工具级沙箱 | 未做 | 本包不提供运行器；属于平台职责 | 文档标注 `[约定]` 或设计边界 |

---

## 11. 自检

- **覆盖**：审计的 8 条高优先级发现分别落到 LP-01（边界）、LP-02（技能入口）、LP-07/08（合并与证据）、LP-09（熔断）、LP-10（预算模板）、LP-11（产物/触发）、LP-03/04/05（重复与状态）、LP-06（安装）。
- **边界**：§3.2 列出 12 项不做；§3.3 给出包仓库/消费者边界；§9 把 6 项未决交回作者。
- **可检验**：每个 LP 都有文件、验收、失败先行测试；每个里程碑有出口条件。
- **未跑即写**：真实 GitHub、Linux、agent 平台消费均标 NOT RUN；本轮只写计划，未实施。
- **不制造新真相源**：本 Spec 不复制路由表、预算数字或断言数；只引用现有文件。
