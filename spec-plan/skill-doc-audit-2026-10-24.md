# 技能文档审计报告 —— 三份 SKILL.md（2026-10-24）

> **性质**：审计报告（含可直接 `git apply` 的修改清单）。同日 Part A 审计（19 项发现，见
> `audit-remediation-spec-2026-10-24.md`）针对机制层；本报告针对**文档层**——三份 SKILL.md
> 与脚本实际行为的一致性。
> **范围**：`skills/harness-init/SKILL.md`、`skills/harness-loop-init/SKILL.md`、
> `skills/harness-loop/SKILL.md`；事实源为三技能目录下的 `scripts/*.mjs`、`lib/`、`templates/*`、
> `VERSION`。不含 `harness-loop-issue`、README、脚本重写。
> **状态**：审计完成；18 条修改已于 2026-10-25 整批应用（§6 为实际应用的 `git diff` 输出）。
> 报告自身的 3 处不符（§6 diff 可应用性、附录 B 文件数、个别行号引用）同日勘误，见文末修订记录。
> **事实优先级**：脚本实际行为 > templates > 现有 SKILL.md；冲突时以脚本为准并记为缺陷。
> **行号均为 2026-10-24 基线**，编辑后会漂移；执行时以引用的**原文片段**定位，不要盲搜行号。
> **本文件不是技能产物**，不随 `npx skills add` 分发，不受 `test.mjs` 断言约束。

---

## 0. 执行摘要

- 共记录 **18 项缺陷**：**P0 × 1**、P1 × 6、P2 × 11。唯一 P0 在 `harness-loop-init` 判据表：
  判据 1 的检查方式写成「`ledger-check.mjs` 返回非 `placeholder-ledger`」，而实际判据由
  `stage2.mjs` 内置的 `ledgerIsReal` 直接读 JSON；两者在**刚装配的账本**（占位 goal + 空
  attempts）上给出**相反结论**（ledger-check 判 ok 退出 0，判据 1 判 FAIL）。
- 脚本层健康：**副本零漂移**（8 组同名脚本/模板 `diff` 逐字节一致）、三技能自包含（无跨技能
  路径引用）、产物交接链（init → loop-init → loop）10 个交接点格式全部对得上。
- 修改方案共 18 条，全部为最小改动（补充/修正），总改动量：harness-init ≈6%、
  harness-loop-init ≈12%、harness-loop ≈2%，均远低于 30% 预算；每条可独立采纳。
- 配套改动（脚本侧，本轮不实施）2 项：CP1 报告「下一步」提示自相矛盾、CP2 过期文案硬编码。
- **验证记录**：本报告全部结论来自源码核对与实跑的 `diff`/`grep`/`find`（清单见附录 B）。
  审计阶段（只读）`bash init.sh`、`node scripts/test.mjs` **NOT RUN**；2026-10-25 应用修改后
  补跑：应用前基线与应用后验证各一次，均 **760 通过 / 0 失败**（见附录 B）。

| 技能 | P0 | P1 | P2 | 合计 | 改动量 |
|---|---|---|---|---|---|
| harness-init | 0 | 1 | 2 | 3 | +6 行 / 97 行 ≈ 6% |
| harness-loop-init | 1 | 3 | 4 | 8 | 17 行 / 138 行 ≈ 12% |
| harness-loop | 0 | 2 | 5 | 7 | 8 行 / 344 行 ≈ 2% |
| **合计** | **1** | **6** | **11** | **18** | — |

---

## 1. 审计方法

1. **S0 跨技能核对**（一次）：产物交接表、验证报告契约三方对照、副本一致性 `diff`、脚本归属。
2. **S1 事实表**（逐技能）：通读每个脚本的 CLI 参数、读写文件、副作用、退出码，及每个模板
   的必填字段与占位符；命令、参数、退出码一律取自 `--help` 文本与源码，不抄 README。
3. **S2 缺陷检查**（逐技能）：按 D1–D12 分类逐段核对现有 SKILL.md。
4. **S3/S4**：对每个缺陷给出一处最小修改，逐条回扣自检；文档中每条命令核对能否在当前脚本下运行。

每条结论附 `文件:行号` 与原文片段（≤2 行）；数量/一致性结论用命令实测；无法核实的事实标
「未核实」并列 §8 决策问题，不猜。

---

## 2. S0 跨技能核对结果

### 2.1 产物交接表（init → loop-init → loop）

| # | 生产者 | 文件 | 关键字段/格式 | 消费者 | 消费者如何校验 | 判定 |
|---|---|---|---|---|---|---|
| 1 | `upgradeStage1`（模板）+ `state-commit.mjs setActive`（`state-commit.mjs:30-58`，每轮替换数据行） | `STATE.md` `## Active` | 表头+分隔行+数据行；占位 `\| — \| — \| — \|` | `gate-check.mjs activeItems`（`gate-check.mjs:131-147`） | 数据行>1 → wip-limit；仅 1 行 → malformed | ✅ |
| 2 | 人/agent 手工；harness-loop-issue `state-write.mjs` | `STATE.md` `## High Priority` | `- [ ]` 未勾选条目；`src:untrusted` 须包 code span | loop 第 2 步；`gate-check.mjs:277` untrusted-shape 闸 | 前缀切分 `/^##\s+High Priority\b/m`，与 state-write 同规则 | ✅ |
| 3 | `upgradeStage1`（`stage1.mjs:194-218`） | `harness-constraints.md` | `## Paths` 20 条 glob；`## Code`「超过 N 个文件」「最多 N 次」；kill switch 独占行 | gate-check / ledger-check / drill-check / stage2 | `common.mjs:439-449,455-462,517-532` 正则与模板句式逐字对得上 | ✅ |
| 4 | `upgradeStage2`（`stage2.mjs:234-252`） | `loop-constraints.md` | `## Cleanup`「最多 N 个文件」、`## Budget`「日 token 上限：N」 | 同上（`loadBudget`/`parseLimitsFrom`，harness→loop 回落） | 正则匹配模板原文（0 = 不启用） | ✅ |
| 5 | `upgradeStage2`（占位 goal）+ `ledger-check --append` | `loop-ledger.json` | `{goal, attempts:[{iteration,item,action,outcome,error?,tokensUsed,at}]}` | `checkLedger`；stage2 `ledgerIsReal`（`stage2.mjs:114-124`） | append 与判定共用 schema | ✅（SKILL 描述错位 → 缺陷 B1） |
| 6 | `state-commit.mjs runLogEntry`（`state-commit.mjs:69-79`） | `loop-run-log.md` | `## Log` 节下每轮一条 JSON | stage2 `runLogHasSection`（`stage2.mjs:127-133`） | 只验 `## Log` 节存在；JSON 字段与模板 Format 示例相同 | ✅ |
| 7 | `drill-check.mjs --record` | `loop-drill.json` | `{schema:1, guardrails:{gate,breaker,verifier}}`，gate.input.sha256 | stage2 `recordStatus`（同模块） | 同模块读写，sha256 重算比对 | ✅ |
| 8 | 独立验证者按模板填写 | `verifier-report.md` | 见 2.2 | `gate-check.mjs:383-661` | 逐字段正则 + 命令重放 | ✅（小缺口 → C3） |
| 9 | `upgradeStage2` 生成（`stage2.mjs:257-279`）或人工 | `docs/04-safety.md` | `## 拒绝列表` 节 + 代码块 | stage2 `denylistDrift`（`stage2.mjs:141-167`） | 标题切分取首个代码块，与 `## Paths` 逐条比对 | ✅ |
| 10 | `initScriptFromCommands`（`common.mjs:353-390`，含自引用标记） | `init.sh` | `set -euo pipefail` + 命令块 | stage1 判据 4（实际执行）、stage2 判据 4、clean-state | 4 个占位标记 + `set -e` | ✅ |

### 2.2 验证报告契约三方对照（模板 / gate-check / loop SKILL 第 5 步）

| 字段/规则 | 模板 | gate-check 实际校验 | SKILL 第 5 步 | 一致 |
|---|---|---|---|---|
| `## Verdict:` 行 | 有 | `:410` 正则；报告非 APPROVE 而 `--verdict approve` → 拒（`:593-603`） | 有 | ✅ |
| `Author:` | 有 | 必填；= `--implementer` → 拒（`:546-556`） | 有 | ✅ |
| `Reviewed commit:` | 有，注明 40 位 | 必填；≠ `--reviewed-sha` → 拒（`:533-543`） | 有，**未注明长度** | ⚠️ → C3 |
| `Change class confirmed:` | 有 | 必填；不一致 → 拒（`:512-531`） | 有 | ✅ |
| 证据行 `- <名>: \`<cmd>\` → PASS\|FAIL\|NOT RUN` | 有 | ≥1 条（`:426-432`）；APPROVE+FAIL 矛盾 → 拒（`:444-456`） | 有 | ✅ |
| PASS 贴输出片段 | 有 | 后 8 行内非空围栏或 `>` 引用（`:557-579`） | 有 | ✅ |
| `### Checks not run` | 有（空写 `—`，≥20 字理由） | 节必在；NOT RUN 项须列出（`:459-483`）；非 behavior 理由 ≥20 字（`:486-501`） | 有 | ✅ |
| 命令重放 | 模板头部声明 | behavior 重放；非 behavior 与 `--no-replay` 记 NOT RUN（`:607-661`） | 第 6 步描述 | ✅ |

### 2.3 副本一致性（实测，无 D12）

8 组 `diff` 全部无输出（逐字节一致）：`harness-stage.mjs`、`stage-core.mjs`、`stage1.mjs`、
`lib/common.mjs`（init ↔ loop-init；`lib/common.mjs` 另与 harness-loop、harness-loop-issue 一致）、
`gate-check.mjs`、`ledger-check.mjs`（loop-init ↔ loop）、6 个共享模板（init ↔ loop-init）。
命令清单见附录 B。
任务书提到的「根目录 `templates/`」**不存在**（`find` 报 No such file or directory）——技能内
`templates/` 是唯一副本，与 AGENTS.md「唯一的一份」一致，不构成缺陷。

### 2.4 脚本归属（自包含）

| 技能 | SKILL.md 提到的脚本 | 在本技能目录 | 跨技能引用 |
|---|---|---|---|
| harness-init | `harness-stage.mjs` | ✅ | 无（stage2 按需 import，缺失记 NOT RUN，`harness-stage.mjs:39-46`） |
| harness-loop-init | `harness-stage` / `drill-check`（命令），`ledger-check` / `gate-check`（提及） | ✅ 全在 | 无 |
| harness-loop | `gate-check` / `ledger-check` / `worktree` / `state-commit` / `clean-state` | ✅ 全在 | 无（仅指名 `/harness-loop-issue` 职责分工，无路径依赖） |

import 图亦全部同目录（`gate-check → ledger-check`、`state-commit → clean-state`、
`drill-check → ledger-check + gate-check` 等）。

---

## 3. harness-init —— 发现与修改

### 3.1 事实表（摘要）

- `harness-stage.mjs`（唯一入口）：`[target] --stage <1|2> --require --upgrade --force
  --commands --package-manager --self --json`。报告模式**会实际执行 target 的 init.sh**
  （判据 4，超时 120s，`LOOP_HARNESS_INIT_TIMEOUT_MS` 可调）。`--upgrade` 写 6 模板 + init.sh +
  4 技能 × 2 目录 + 2 份 `.harness-loop-install.json`。既有文件非 `--force` 一律
  `SKIPPED (exists)`；`--force` 先删再复制。退出码 0 / 1（参数错误、写失败）/ 2（未达成、跳级拒绝）。
  阶段 2 未随附 → 报告固定 NOT RUN（`harness-stage.mjs:73-81`）；`--upgrade --stage 2` 退出 1。
- `stage1.mjs`：7 条判据，顺序与 SKILL 判据表逐条一致；占位 feature 判据 = notes 以「占位」
  开头 / 元指令 verification / 缺 `user_visible_behavior`（`stage1.mjs:87-122`）。
- 模板占位符：AGENTS.md 三个 `{{…}}`、feature_list.json 两个 + 3 条占位 feature；其余无占位符。
- 全部 VERSION = 1.1.0（含根）。

### 3.2 缺陷表

| ID | 严重度 | 位置 | 类别 | 现状原文（片段） | 问题 |
|---|---|---|---|---|---|
| A1 | P1 | SKILL.md:50-68 | D4/D1 | `--upgrade --stage 1`（执行段） | 未声明既有文件策略；脚本事实是跳过（`common.mjs:237-240`、`stage-core.mjs:164-179`）。agent 无从判断重跑是否安全 |
| A2 | P2 | SKILL.md:94-97 | D1 | `阶段 2 属于 /harness-loop-init：…` | 未说明本技能报告中阶段 2 固定 NOT RUN 的含义，转述时易当失败 |
| A3 | P2 | SKILL.md:79-83 | D2 | `# 退出码 0 = 达成`（另述退出 2） | `--require` 退出 1（target 不存在 / `--stage` 非法，`harness-stage.mjs:122,141`）无对应动作 |

核对无误项：7 条判据表与 `checkStage1` 顺序与语义一一对应；「替换前 `--require` 必须退出 2」
与 `featuresHaveAcceptance` 一致；「不要在这里跑 `--upgrade --stage 2`」与 exit 1 行为一致。

### 3.3 修改清单

| 编号 | 缺陷 | 位置 | 改法 | 类型 | 依赖 |
|---|---|---|---|---|---|
| M-I1 | A1 | :68 后 | 增补：「已存在的文件与技能目录一律跳过（`SKIPPED (exists)`），不覆盖；要用出厂模板重置须显式加 `--force`（先删再复制，整体替换）。」 | 补充 | 无 |
| M-I2 | A2 | :97 后 | 增补：「本技能输出的报告里，阶段 2 一栏固定为 NOT RUN——阶段 2 判据未随本技能安装，不是失败；按其 evidence 的指引转去 `/harness-loop-init`。」 | 补充 | 无 |
| M-I3 | A3 | :83 后 | 增补：「`--require` 退出 1 是参数或路径错误（目标不存在、`--stage` 值非法）——修命令重跑，与达成与否无关。」 | 补充 | 无 |

---

## 4. harness-loop-init —— 发现与修改

### 4.1 事实表（摘要）

- `stage2.mjs`：判据 7 机械 + 2 人工，顺序 = 账本→运行日志→技能可发现→init.sh→拒绝列表本地化→
  两份一致→演练→回退测试（人工）→NOT RUN（人工）。关键实现：
  - 判据 1 = `ledgerIsReal` 直接读 JSON（`stage2.mjs:114-124`），**不调 ledger-check**；
  - 判据 3 = 项目内优先 + frontmatter + 正文含「kill switch」「验证」（`:43-62,183`）；
  - 判据 5 = 列表须含 `loop-constraints.md`（`:84-88`）+ 相对模板 ≥2 条新增（`:90-111`）；
  - 判据 6 = `docs/04-safety.md` 不存在 → NOT RUN（`:141-152`）。
  补齐写 4 文件（存在的跳过），**不装技能**；跳级保护：阶段 1 未达成 → exit 2。
- `drill-check.mjs`：`--record --only gate,breaker,verifier --state --json`；记录绑定约束文件
  sha256；退出码 0 全过 / 1 记录过期（**不带 `--record` 运行时才判**，`:445-448`）/ 2 护栏没响
  （`:465`）。记录有效性要求三组齐全、覆盖每条拒绝列表、verifier 四 canary 等（`:249-361`）。
- 出厂账本 goal = `Replace with the current loop goal`（`:247`）——判据 1 的必改项。

### 4.2 缺陷表

| ID | 严重度 | 位置 | 类别 | 现状原文（片段） | 问题 |
|---|---|---|---|---|---|
| B1 | **P0** | SKILL.md:35 | D3 | `` `ledger-check.mjs` 返回非 `placeholder-ledger` `` | 实际是 `ledgerIsReal` 直读 JSON（`stage2.mjs:114-124`）。且语义相反：刚装配账本在 ledger-check 下 `verdict: ok` 退出 0（placeholder-ledger 要求 `attempts.length>0`，`ledger-check.mjs:202`），判据 1 却 FAIL——照文档自检得出「已达成」的错误结论 |
| B2 | P1 | SKILL.md:39 | D3 | `含 harness-constraints.md 自身` | 实际要求列表含 **`loop-constraints.md`**（`stage2.mjs:84-88`）；无 harness-constraints.md 的包含检查 |
| B3 | P1 | SKILL.md:67-81 | D4/D1 | `**手工改两处**：` | 漏第三处必做：`loop-ledger.json` goal 替换（判据 1 的 action，`stage2.mjs:177`）；照做两处后 `--require` 仍红 |
| B4 | P1 | SKILL.md:74-80 | D2 | drill 命令块后无退出码说明 | drill-check 0/1/2 无对应动作；退出 2（护栏没响）该修什么未写 |
| B5 | P2 | SKILL.md:38 | D3 | `不含 replace this line / No test script` | 实际 4 个标记（另有 `No package manifest detected`、`Replace this section`）且要求 `set -e`（`stage-core.mjs:75-85`） |
| B6 | P2 | SKILL.md:37 | D3 | 路径列举（`.claude`/`.agents` + 用户级两个） | 漏 `.zcode/.grok/.codex` 项目级与 `~/.codex/skills`（`common.mjs:95-105`）；未提正文须含 kill switch / 独立验证关键词（`stage2.mjs:183`，任一命中即可）——技能在但内容不符也判不过 |
| B7 | P2 | SKILL.md:98-103 | D4 | 熔断器表 3 行 | 漏第 4 种 `attempt-limit`（默认 3，`ledger-check.mjs:24`；属本技能装配的机制） |
| B8 | P2 | SKILL.md:53,63 | D6 | `docs/04-safety.md 已存在时跳过它，实际写 3 个` | 误导性特指：所有产物存在即跳过（`copyStageTemplate` / `upgradeStage2` exists 分支） |

### 4.3 修改清单

| 编号 | 缺陷 | 位置 | 改法 | 类型 | 依赖 |
|---|---|---|---|---|---|
| M-L1 | B1 | :35 | 检查方式改为「装配器判据直接读 JSON：`attempts` 是数组、`goal` 非出厂占位（不是调 ledger-check）」 | 修正 | 无 |
| M-L2 | B2 | :39 | 改为「列表含 `loop-constraints.md` 自身（策略自我保护），且至少 2 条模板外路径」 | 修正 | 无 |
| M-L3 | B3 | :67-72 | 「两处」→「三处」；插入新 2.「`loop-ledger.json` 的 `goal` 换成本循环的真实目标（判据 1；出厂值是 `Replace with the current loop goal`，不改它判据 1 永远红）」；原 2 改 3 | 补充+修正 | 无 |
| M-L4 | B4 | :80 后 | 增补演练退出码 0/1/2 与各自动作（2 = 按输出点名的条目修约束文件后重跑，不得带着失败项提交记录） | 补充 | 无 |
| M-L5 | B5 | :38 | 改为「不含占位标记（`replace this line` 等 4 个）且带 `set -e`」 | 修正 | 无 |
| M-L6 | B6 | :37 | 补 `.zcode/.grok/.codex`、`~/.codex/skills`；句尾加「且 SKILL.md 正文含 kill switch / 独立验证的实操描述（关键词任一命中）」 | 修正 | 无 |
| M-L7 | B7 | :102 后 | 熔断器表加行 `` `attempt-limit` | 3 | 同一 item 的尝试上限（`ledger-check --item`，读账本计数） `` | 补充 | 无 |
| M-L8 | B8 | :53,:63 | 改为「已存在的一律跳过不覆盖，`--force` 才整体替换」/「（有文件被跳过时相应减少）」 | 修正 | 无 |

---

## 5. harness-loop —— 发现与修改

### 5.1 事实表（摘要）

| 脚本 | 关键 CLI | 副作用 | 退出码 |
|---|---|---|---|
| `gate-check.mjs` | `--phase fix\|gate`、`--diff-files <p\|@file\|a,b>`、`--verdict`、`--change-class`、`--red-check`、`--reviewed-sha/--head-sha`（40/64 位 hex）、`--implementer`、`--evidence-file`、`--no-replay`、`--state <dir\|file>` | 重放证据命令；读 git status（**仅 gate 阶段**，`:942-946`） | 0 proceed / 1 参数错误（含 state 不可读、gate 缺 head、approve 缺 --implementer）/ 2 escalate / 3 kill switch |
| `ledger-check.mjs` | `--item`（attempt-limit）、`--append --item --outcome --action [--error] [--tokens]`、`--max-attempts`、`--escalation` | `--append` 原子写账本；**必带 `--action`**（`:464`） | 0 ok/report-only/追加成功 / 1 参数错误 / 2 停止（no-ledger、attempt-limit、stagnation、no-progress、token-budget、max-iterations、placeholder-ledger、账本不可写） |
| `worktree.mjs` | `create --run-id`（`[A-Za-z0-9._-]`，默认 base main）、`mark --status`、`cleanup`、`list` | 建删 worktree/分支 + manifest；cleanup 不 `--force` | 0 / 1 / 2 cleanup 有跳过项（条目留 manifest 待人工） |
| `state-commit.mjs` | `--outcome <五枚举>`、`--attempts --files --last-run --next --dry-run` | 备份 → tmp → rename；只改 `## Active` 数据行与 `Last run`，追加日志 JSON | 0 / 1 参数错误、文件缺失、表损坏 / 2 写入失败且**已回滚**（`:177-185`） |
| `clean-state.mjs` | `--check`（默认，CI 用）/ `--assert-fresh`（须今天） | 只读 | 0 / 1 不在 git 仓库 / 2 有未清理项 |

### 5.2 缺陷表

| ID | 严重度 | 位置 | 类别 | 现状原文（片段） | 问题 |
|---|---|---|---|---|---|
| C1 | P1 | SKILL.md:228 | D3 | `--phase fix 只做派发前的预检（拒绝列表/范围/暂停/脏工作区）` | 脏工作区**只在 gate 阶段判**（`gate-check.mjs:942-946`：非 gate 时 dirty=[]）。文档与脚本相反 |
| C2 | P1 | SKILL.md:90,171,247（字面 3 处；另 :295 等 escalated 相关行） | D1 | `写升级条目` | 全文未定义写到哪、写什么；STATE 模板有 `## Human Inbox` 节、`ledger-check --escalation` 可生成升级文档，均未被指到 |
| C3 | P2 | SKILL.md:153 | D3 | `Reviewed commit: <审过的 sha——必须 = --reviewed-sha>` | 未注明 40 位完整 sha（模板 ：14 已注明）；贴短 sha 时闸门以 mismatch 拒（`gate-check.mjs:533-543`），报错原因难懂 |
| C4 | P2 | SKILL.md:104 | D3 | `验证通过时用 --outcome success 追加一条。` | `--append` 必带 `--action`（`ledger-check.mjs:464`），照字面执行 exit 1 |
| C5 | P2 | SKILL.md:212 | D6 | `--attempts <第 3 步 …输出的 item attempts>` | 未说明取值时点（入账前/后），与 ：260「本轮结束时的值」存在两读 |
| C6 | P2 | SKILL.md:262 | D2 | `…恢复（exit 2）。` | 回滚后的下一步（重跑同一条命令，不要手工补写）未写 |
| C7 | P2 | SKILL.md:19 | D5/D1 | `**前置**：…已跑过 /harness-init（需要 STATE.md / harness-constraints.md / init.sh）。` | 完整循环另需阶段 2 产物：缺账本第 3 步 no-ledger 停止；`state-commit` 缺 loop-run-log.md exit 1（`state-commit.mjs:134`） |

专项核对**无缺陷**项（留档）：attempt-limit 在执行前判定（第 3 步先于派发、失败路径回到第 3
步），第 N+1 次尝试不会先执行再被拒；gate-check / ledger-check 退出码动作表与脚本一致；无子
智能体降级路径可闭环（新会话验证者署名，Author ≠ --implementer 机械可查）；kill switch 在第 0
步与第 6 步（gate-check 经 `--state`）各查一次；「不合并」有机械执行点（`forbidden_actions`）。

### 5.3 修改清单

| 编号 | 缺陷 | 位置 | 改法 | 类型 | 依赖 |
|---|---|---|---|---|---|
| M-H1 | C1 | :228 | 「（拒绝列表/范围/暂停；脏工作区只在 gate 阶段判）」 | 修正 | 无 |
| M-H2 | C2 | :304 后 | 规则区增补：「升级条目统一写在 `STATE.md` 的 `## Human Inbox`：一行记 item、命中的闸门或熔断原因、证据位置；需要完整交代时用 `ledger-check --escalation` 生成升级文档。」 | 补充 | 无 |
| M-H3 | C3 | :153 | 「<审过的 sha，40 位完整值——必须 = --reviewed-sha>」 | 修正 | 无 |
| M-H4 | C4 | :104 | 「验证通过时同样用 `--append` 记一笔（`--outcome success --action "<做了什么>"`）。」 | 修正 | 无 |
| M-H5 | C5 | :212 | 「本轮尝试入账后 ledger-check --item 输出的 item attempts」 | 修正 | 无 |
| M-H6 | C6 | :262 | 句尾补「（exit 2，两个文件都回到写入前——修好原因后重跑同一条命令，不要手工补写）」 | 补充 | 无 |
| M-H7 | C7 | :19 | 句尾补「；完整循环另需阶段 2 的 `loop-ledger.json` 与 `loop-run-log.md`——缺账本时第 3 步以 no-ledger 停止」 | 补充 | 无 |

---

## 6. Unified diff（已于 2026-10-25 整批应用；以下为 `git diff` 实际输出）

> 工作区为 CRLF（`git ls-files --eol` → `i/lf w/crlf`），在别处重放时建议
> `git apply --ignore-whitespace`。hunk 头由 git 计算，可直接应用；与修改编号的对应
> 见各小节标题。原手写版本（6/16 个 hunk 头部计数错误、M-H6 缺一行上下文）已废弃，
> 见文末修订记录。

### 6.1 harness-init（hunk 顺序 = M-I1 / M-I3 / M-I2）

````diff
diff --git a/skills/harness-init/SKILL.md b/skills/harness-init/SKILL.md
index 4723871..2830ba5 100644
--- a/skills/harness-init/SKILL.md
+++ b/skills/harness-init/SKILL.md
@@ -66,6 +66,8 @@ node .claude/skills/harness-init/scripts/harness-stage.mjs <target> --upgrade --
 同时把 4 个技能（`harness-init`、`harness-loop-init`、`harness-loop`、`harness-loop-issue`）
 装到 `.claude/skills/` 与 `.agents/skills/`。运行时脚本随技能目录安装，**不再复制到项目根**；
 所有技能命令走 `.claude/skills/<name>/scripts/...`。
+已存在的文件与技能目录一律跳过（`SKIPPED (exists)`），不覆盖；要用出厂模板重置须显式加
+`--force`（先删再复制，整体替换）。
 
 **手工改两处**（脚本改不了）：
 
@@ -81,6 +83,8 @@ node .claude/skills/harness-init/scripts/harness-stage.mjs <target> --stage 1 --
 
 注意：出厂模板的 3 条 feature 带 `占位：` 标记，替换前 `--require` 必须退出 2。
 若退出 0，说明判据被削弱了，不要继续。
+`--require` 退出 1 是参数或路径错误（目标不存在、`--stage` 值非法）——修命令重跑，与达成
+与否无关。
 
 ## 常见错误
 
@@ -95,3 +99,5 @@ node .claude/skills/harness-init/scripts/harness-stage.mjs <target> --stage 1 --
 
 阶段 2 属于 `/harness-loop-init`：本技能只带阶段 1 的模板与脚本，**不要**在这里跑
 `--upgrade --stage 2`（缺阶段 2 的模板，装配器会报错退出）。直接调用 `/harness-loop-init`。
+本技能输出的报告里，阶段 2 一栏固定为 NOT RUN——阶段 2 判据未随本技能安装，不是失败；
+按其 evidence 的指引转去 `/harness-loop-init`。
````

### 6.2 harness-loop-init（hunk 顺序 = M-L1+M-L6+M-L5+M-L2 / M-L8 / M-L8+M-L3 / M-L4 / M-L7）

````diff
diff --git a/skills/harness-loop-init/SKILL.md b/skills/harness-loop-init/SKILL.md
index 26e81ac..2b9ac92 100644
--- a/skills/harness-loop-init/SKILL.md
+++ b/skills/harness-loop-init/SKILL.md
@@ -32,11 +32,11 @@ node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target>
 
 | # | 判据 | 类型 | 检查方式 |
 |---|---|---|---|
-| 1 | `loop-ledger.json` 存在且不是占位账本 | 机械 | `ledger-check.mjs` 返回非 `placeholder-ledger` |
+| 1 | `loop-ledger.json` 存在且不是占位账本 | 机械 | 装配器判据直接读 JSON：`attempts` 是数组、`goal` 非出厂占位（不是调 ledger-check） |
 | 2 | `loop-run-log.md` 存在 | 机械 | 文件存在且有 `## Log` 章节 |
-| 3 | `harness-loop` 已装到可发现路径 | 机械 | 查项目内 `.claude/skills/`、`.agents/skills/` 与用户级 `~/.claude/skills`、`~/.agents/skills`；项目内优先 |
-| 4 | `init.sh` 无占位符 | 机械 | 不含 `replace this line` / `No test script` |
-| 5 | **拒绝列表已本地化** | 机械 | 含 `harness-constraints.md` 自身，且至少 2 条模板外路径 |
+| 3 | `harness-loop` 已装到可发现路径 | 机械 | 查项目内 `.claude/skills/`、`.agents/skills/`（及 `.zcode`/`.grok`/`.codex`）与用户级 `~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`；项目内优先；且 SKILL.md 正文含 kill switch / 独立验证的实操描述（关键词任一命中） |
+| 4 | `init.sh` 无占位符 | 机械 | 不含占位标记（`replace this line` 等 4 个）且带 `set -e` |
+| 5 | **拒绝列表已本地化** | 机械 | 列表含 `loop-constraints.md` 自身（策略自我保护），且至少 2 条模板外路径 |
 | 6 | **两份拒绝列表一致** | 机械 | `harness-constraints.md` ↔ `docs/04-safety.md` 逐条比对 |
 | 7 | **护栏演练通过** | 机械 | `loop-drill.json` 存在、sha256 与当前约束一致、无失败项 |
 | 8 | **回退测试被实际执行过** | **人工** | 有命令与输出为证，记进 `STATE.md` |
@@ -50,7 +50,7 @@ node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target>
 node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --upgrade --stage 2
 ```
 
-产出 **4 个文件**（`docs/04-safety.md` 已存在时跳过它，实际写 3 个）+ 手工生成的
+产出 **4 个文件**（已存在的一律跳过不覆盖，`--force` 才整体替换）+ 手工生成的
 `loop-drill.json`（判据 7，下一节）：
 
 | 文件 | 作用 |
@@ -60,16 +60,18 @@ node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --upgra
 | `loop-constraints.md` | loop 规则（验证 / 预算 / 教训 / 清理） |
 | `docs/04-safety.md` | 拒绝列表的文档副本；判据 6 与 `harness-constraints.md` 逐条比对。已存在则**不覆盖**，只在输出里报告漂移 |
 
-完整产物 = **4 个文件 + 1 份演练记录**（`docs/04-safety.md` 被跳过时是 3 个文件 + 1 份记录）。
+完整产物 = **4 个文件 + 1 份演练记录**（有文件被跳过时相应减少）。
 
 同时确认 `harness-loop` 技能已装到 agent 能扫描的路径。
 
-**手工改两处**：
+**手工改三处**：
 
 1. `harness-constraints.md` 的拒绝列表按本仓库实际路径增删（判据 5）。
    `gate-check.mjs` 会真的读它——它必须是真的。
    **改完同步 `docs/04-safety.md` 的代码块**，否则判据 6 会红（两处必须逐条一致）。
-2. 生成护栏演练记录（判据 7）：
+2. `loop-ledger.json` 的 `goal` 换成本循环的真实目标（判据 1；出厂值是
+   `Replace with the current loop goal`，不改它判据 1 永远红）。
+3. 生成护栏演练记录（判据 7）：
 
    ```bash
    node .claude/skills/harness-loop-init/scripts/drill-check.mjs --record
@@ -79,6 +81,10 @@ node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --upgra
    记录绑定 `harness-constraints.md` 的 sha256。**改了拒绝列表就要重跑**，否则记录过期，
    阶段 2 判据 7 会失败——旧记录不能为新策略担保。
 
+   演练退出码：`0` 全过；`1` 既有记录对当前约束已过期（不带 `--record` 运行时才判）——
+   重跑 `--record` 刷新；`2` 有护栏没响——按输出点名的条目修约束文件（如永不命中的
+   glob）后重跑，不得带着失败项提交记录。
+
 ## 核心：验证者为什么是阶段 2 的关键
 
 阶段 1 的文件让 agent **知道**该怎么做；验证者让 agent **不能**糊弄过去。
@@ -100,6 +106,7 @@ node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --upgra
 | `stagnation` | 3 | 同一错误签名出现 3 次 |
 | `no-progress` | 5 | 连续失败 5 次 |
 | `max-iterations` | 10 | 总迭代上限 |
+| `attempt-limit` | 3 | 同一 item 的尝试上限（`ledger-check --item`，读账本计数） |
 
 错误签名归一化：抹掉时间戳、十六进制地址、路径（折叠为 basename）、行列号。
 `TypeError at profile.ts:42` 与 `TypeError at profile.ts:87` 是同一个错误。
````

### 6.3 harness-loop（hunk 顺序 = M-H7 / M-H4 / M-H3 / M-H5 / M-H1 / M-H6 / M-H2）

````diff
diff --git a/skills/harness-loop/SKILL.md b/skills/harness-loop/SKILL.md
index 76303ca..6f7675c 100644
--- a/skills/harness-loop/SKILL.md
+++ b/skills/harness-loop/SKILL.md
@@ -16,7 +16,8 @@ license: MIT
 
 **不是**用来发现工作的。发现由人（或 `/harness-loop-issue`）完成，本技能只负责把选定的一项做对。
 
-**前置**：目标仓库已跑过 `/harness-init`（需要 `STATE.md` / `harness-constraints.md` / `init.sh`）。
+**前置**：目标仓库已跑过 `/harness-init`（需要 `STATE.md` / `harness-constraints.md` / `init.sh`）；
+完整循环另需阶段 2 的 `loop-ledger.json` 与 `loop-run-log.md`——缺账本时第 3 步以 no-ledger 停止。
 本技能自带脚本，下面命令都走技能目录内的 `.claude/skills/harness-loop/scripts/`；
 若技能装在 `.agents/skills/` 或用户级 `~/.claude/skills/`，把前缀换成对应目录。
 在 worktree 内运行时，用主检出的绝对路径。
@@ -101,7 +102,7 @@ node .claude/skills/harness-loop/scripts/ledger-check.mjs --ledger loop-ledger.j
 ```
 
 `--outcome` 取 `success | failure | noop`；`failure` 必须带 `--error`（熔断器靠错误签名判停滞）。
-验证通过时用 `--outcome success` 追加一条。账本不可读时 `--append` 退出 2——先修账本，不要重试。
+验证通过时同样用 `--append` 记一笔（`--outcome success --action "<做了什么>"`）。账本不可读时 `--append` 退出 2——先修账本，不要重试。
 
 ### 第 4 步：执行者
 
@@ -150,7 +151,7 @@ node .claude/skills/harness-loop/scripts/worktree.mjs create --run-id <slug>-att
 ## Verdict: APPROVE | REJECT | ESCALATE_HUMAN
 
 Author: <验证者标识——必须 ≠ --implementer>
-Reviewed commit: <审过的 sha——必须 = --reviewed-sha>
+Reviewed commit: <审过的 sha，40 位完整值——必须 = --reviewed-sha>
 Change class confirmed: <behavior|docs|config|refactor——必须 = --change-class>
 
 ### Evidence
@@ -209,7 +210,7 @@ git diff --name-only main...HEAD > changed-files.txt   # 基分支按项目实
 node .claude/skills/harness-loop/scripts/gate-check.mjs \
   --item <item-id> \
   --phase gate \
-  --attempts <第 3 步 ledger-check --item 输出的 item attempts> \
+  --attempts <本轮尝试入账后 ledger-check --item 输出的 item attempts> \
   --change-class <behavior|docs|config|refactor> \
   --diff-files @changed-files.txt \
   --verdict <approve|reject|escalate-human|none> \
@@ -225,7 +226,7 @@ node .claude/skills/harness-loop/scripts/gate-check.mjs \
 
 **必须用 `--phase gate`**：证据、head-commit、回退测试"未跑"三道闸只在 gate 阶段生效。
 用 `--phase fix` + `--verdict approve` 会得到 `proceed` 加一条 warning，但那是中间检查，
-不是合并许可。`--phase fix` 只做派发前的预检（拒绝列表/范围/暂停/脏工作区）。
+不是合并许可。`--phase fix` 只做派发前的预检（拒绝列表/范围/暂停；脏工作区只在 gate 阶段判）。
 
 **证据里的命令会被重放**：闸门把 `- Tests: \`<cmd>\` → PASS` 里的命令真的跑一遍，
 退出码与 PASS/FAIL 对不上就拒绝。所以验证者报告里的命令必须是可重入的，
@@ -259,7 +260,7 @@ node .claude/skills/harness-loop/scripts/state-commit.mjs --state <主检出绝
 
 `--attempts` 取第 3 步 `ledger-check --item` 输出的 `item attempts`（本轮结束时的值）。
 
-它先备份、再写临时文件、最后 rename；任一步失败会把已替换的文件恢复（exit 2）。
+它先备份、再写临时文件、最后 rename；任一步失败会把已替换的文件恢复（exit 2，两个文件都回到写入前——修好原因后重跑同一条命令，不要手工补写）。
 `--outcome` 取 `no-op | report-only | fix-proposed | verified | escalated`。
 `--dry-run` 只打印将写入的内容。表结构损坏时它**报错而不是猜**（exit 1）。
 
@@ -302,6 +303,7 @@ node .claude/skills/harness-loop/scripts/state-commit.mjs --state <主检出绝
 - 执行者**不得**标记自己的 work item 为完成。
 - 触及拒绝列表 → 立即 `escalated`，**不执行任何编辑**。
 - 账本里同一 item 的尝试 ≥ 3 → 强制 `escalated`，覆盖其他所有规则（`ledger-check --item`）。
+- 升级条目统一写在 `STATE.md` 的 `## Human Inbox`：一行记 item、命中的闸门或熔断原因、证据位置；需要完整交代时用 `ledger-check --escalation` 生成升级文档。
 - 合并永远由人工执行。
 - 每轮结束必须写状态。不写状态的运行等于没跑。
 
````

---

## 7. 配套改动（脚本侧，本轮登记不实施）

| 编号 | 位置 | 问题 | 建议 | 影响 |
|---|---|---|---|---|
| CP1 | `stage-core.mjs:279-283` | `renderReport` 的「下一步」无条件提示 `--upgrade --stage 2`；从 harness-init 副本运行时照做必 exit 1（`harness-stage.mjs:179-183`），报告自带矛盾提示 | `loadStage2()` 返回 null 时改提示「用 /harness-loop-init 技能目录里的装配器」 | 仅报告文案，退出码不变；M-I2 已按现状覆盖，不依赖此项 |
| CP2 | `drill-check.mjs:285` | 过期原因硬编码 `loop-constraints.md 已改动`，实际绑定文件可能是 `harness-constraints.md` | 用 `constraintsPath` 实际文件名 | 文案修正，判定不变 |

---

## 8. 待决策问题（≤5）

1. **升级条目落点（M-H2）**：A. 写 `STATE.md` 的 `## Human Inbox`（推荐——模板出厂即有该节，
   与 state-commit 的 escalated 行同页衔接）；B. 单独 `ESCALATION.md`（多一份文件，无消费者）；
   C. 不定落点，只靠 `ledger-check --escalation` 输出（保存位置仍无约定）。
2. **B1 修法**：A. 按现状改文档（推荐，M-L1）；B. 反向改脚本让判据 1 真调 `ledger-check.mjs`
   （需统一 placeholder 语义，波及 stage2 判据与测试，影响面大）。
3. **CP1 是否立项**：不修则报告文案与 SKILL「下一步」节长期并存两种说法（SKILL 是对的）。
4. **P2 组是否整批采纳**：M-I2/M-I3、M-L5–L8、M-H3–H7 均为完备性修补，可整体采纳或分批；
   推荐**整批采纳**（总量小、无风险、无依赖）。

---

## 9. 采纳顺序

- 18 条修改**相互独立**，均可单独采纳；三份文档之间无依赖。
- 建议同批：**M-L1 + M-L3**（同属判据 1 链条——一个修「怎么判」，一个补「要做什么」，只采其一会
  留半截）；**M-L2 与 M-L3** 同在手工步骤语义里，同批避免「两处/三处」反复。
- P0（M-L1）先行；P1（M-L2/L3/L4、M-H1/H2、M-I1）次之；P2 组最后或整批。

---

## 附录 A：自检记录（S4）

- 18 个缺陷 → 18 条修改，一一对应，全部「已解决」；每条修改均为纯增补或单点改写，未引入
  新的不一致（逐一核对：M-H5 与 ：260 唯一读法一致；M-H1 与 ：186-188 的 gate 阶段语境一致；
  M-L8 与 ：61 行 docs/04 行为描述不再矛盾；M-H7 与第 1 步「loop-constraints 不存在就跳过」
  不冲突——约束文件与账本是两个依赖）。
- 三份文档中全部命令（15 条 `node .claude/skills/...`）逐一核对：旗标名、枚举值、路径在当前
  脚本下均存在且拼写一致。
- 新增文字全部来自脚本源码（`SKIPPED (exists)`、NOT RUN 占位、退出码、默认值、路径清单），
  无凭记忆写入的内容。

## 附录 B：实测命令与结果

| 命令 | 结果 |
|---|---|
| `diff` 8 组同名脚本/模板（见 §2.3） | 全部无输出（逐字节一致） |
| `find /d/harness_loop/templates -type f` | No such file or directory（根目录无 templates/） |
| `find /d/harness_loop/skills -type f \| sort` | 42 个文件，与三技能/issue 目录结构一致 |
| `grep -n` 定位缺陷原文（判据表、手工步骤、fix 预检、attempts、exit 2 等关键行） | 行号与引用片段逐一确认 |
| `git ls-files --eol skills/*/SKILL.md` | `i/lf w/crlf`（应用 diff 需 `--ignore-whitespace`） |
| `wc -l skills/*/SKILL.md` | 97 / 138 / 344 |

**已补跑（2026-10-25）**：`bash init.sh`（内含 `node scripts/test.mjs` 与技能副本一致性检查）
在应用前基线与应用后各跑一次，均 **Passed: 760 / Failed: 0**。输出中的
`error: --run-id may contain only letters…` 行是 worktree 非法 run-id 用例的预期输出，非失败。

---

## 修订记录

- **2026-10-25 · 应用与自勘误**（验证会话复核本报告后执行）：
  1. **18 条修改整批应用**于三份 SKILL.md（§8 问 4 的推荐项）；§6 替换为应用后
     `git diff` 的原样输出。原手写版本经实测**不可直接 `git apply`**：16 个 hunk 中
     6 个头部计数错误（patch 0/1 加 `--recount` 后可应用），M-H6 另漏掉
     「`--attempts` 取第 3 步…」一行上下文，`--recount` 亦无法应用。外层围栏同步改为
     四反引号，避免 diff 内的 ``` 上下文行提前闭合代码块。
  2. **附录 B 文件数勘误**：`find skills -type f` 实为 **42** 个文件，原文误写 44。
  3. **行号引用勘误**：C2 的「:171,247,296 等 5 处」→「:90,171,247（字面 3 处；另 :295
     等 escalated 相关行）」；C5 与附录 A 的「:261」→「:260」。
  4. **M-L6/B6 措辞精确化**：判据 3 的正文内容检查实现为 `textHas(...).some()`
     （`common.mjs:395-398`），kill switch / 验证关键词**任一命中**即过（OR），原稿与
     stage2 判据 label 均写作「与」（AND），比代码实际更严；应用进 SKILL.md 的文案
     已按「关键词任一命中」措辞。
  5. §3–§5 的行号仍为 2026-10-24 **应用前**基线（正文开头的提醒继续适用）。
