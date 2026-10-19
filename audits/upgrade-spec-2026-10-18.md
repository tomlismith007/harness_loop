# 升级规格 — harness-loop（2026-10-18）

- 输入：`audits/knowledge-A-2026-10-18.md`、`audits/knowledge-B-2026-10-18.md`、`audits/audit-2026-10-18.md`
- 约束：只采纳**机制**（脚本/模板/校验），理念最多进 docs；每个升级项必须有可执行验收；不新增功能，除非替换现有部件或补有证据的缺口。
- 默认取舍规则：机器强制 > 约定 > 建议；状态源唯一；一个概念一个定义；能删部件优先于加部件。

---

## 0. 执行者须知

1. 先读 `loop-constraints.md`，输出 `Constraints loaded from loop-constraints.md: N rules active.`
2. 每个升级项独立成一次 work item；一次只做一个。
3. 每项都先写**会失败的测试**（红），再改实现（绿）。红检必须能在改动前的代码上挂掉，且失败信息指出行为。
4. 每项完成后跑 `bash init.sh`；未跑的检查在报告里列 NOT RUN。
5. 不修改与当前升级项无关的文件。
6. 触及 `audits/` 之外的文件前，确认该文件在本规格的"改动面"里。

---

## 1. 合并矩阵（A × B）

| 主题 | A 的做法 | B 的做法 | 重叠/互补/冲突 | 取舍 |
|---|---|---|---|---|
| 五子系统 | 文档 + 评分脚本 | 无（B 用六原语） | 互补 | 保留我的 `docs/00` 五子系统；不引入 B 的评分 |
| 六原语 | L13 六原语 | concepts 六 / primitives 五+记忆 | 冲突（数法） | 采用"五构件 + 记忆层"，README 注明；不改成"六并列" |
| 就绪度 | 无 | L0–L3 + 0–100 分 | 冲突（我已移除 L3/评分） | **不引入分数**；只引入"证明"（drill） |
| feature list | 三元组 + 状态机 | 无 | 互补 | 保留我的 schema；补 `evidence` 与 `in_progress` 唯一性检查 |
| 验证者 | 文字要求 | verifier canary | B 的机制更强 | 移植 canary 的**思想**（种缺陷 + 双向），但实现为最小版 |
| 证据 | evaluator rubric | drill record | 互补 | 我的证据闸门已有；补"证据必须引用可复现命令"的机械检查 |
| 拒绝列表 | 一份（skills 里） | 两份（gate.yaml + safety.md）+ 漂移检测 | B 的漂移检测解决我的 G-27 | 移植 `policy-drift` 的**最小版**：比对 `loop-constraints.md` 与 `docs/04-safety.md` |
| 预算 | 无 | loop-cost + 日累计 + 三档 | 互补 | 只移植"接线"：账本 `tokensUsed` + `--token-budget` + 80% 报告模式 |
| worktree | 文字要求 | manifest + 清理 + 锁 | B 的机制更强 | 移植最小 manifest（create/mark/cleanup），不移植锁 |
| 不可信输入 | 无 | 同步脚本 + canary | B 独有 | 移植**段落**到两个技能；canary 留到批次 3 |
| 状态源 | STATE/feature/ledger/run-log/LESSONS | 每模式独立 state | 冲突（多循环 vs 单循环） | 保持单队列 `STATE.md`；明确各文件职责（H1） |
| 护栏演练 | 无 | loop-drill 双向 | B 独有 | 移植最小版：gate drill + breaker drill（离线、零 token） |
| 反模式 | 散落在 docs | 独立清单 | 互补 | docs 合并，不进机制 |
| 图工程 | L14 | 无 | 不适用 | 只借"verify 节点全新上下文"进 docs |

---

## 2. 升级项

每项格式：**借鉴自 / 替换或补足 / 改前 → 改后 / 验收（可执行）/ 风险与回滚 / 批次**。

### U-01 修复 kill switch 调用形式（P0，批次 1）

- 借鉴自：无（自发现 D-01）。B 的 kill switch 由 `loop-budget` skill 读取（`B@54f8c56:skills/loop-budget/SKILL.md:1-12`），但同样是约定；我的实现本来更好，只是调用写错。
- 替换/补足：替换 `skills/harness-loop/SKILL.md` 第 0 步的命令。
- 改前：`--state STATE.md` → 脚本把它当目录，读不到，返回 `proceed`。
- 改后：`--state .`（目录），或让 `gate-check` 接受文件路径（二选一；**推荐改技能**，因为脚本语义"目录"已在 help 里写明）。
- 验收：
  ```bash
  # 在临时目录放 STATE.md 含独占一行 loop-pause-all，按技能第 0 步原样执行
  node scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state . --json   # 期望 exit 3
  node scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state STATE.md --json  # 期望 exit 0（记录现状）
  ```
  并在 `test.mjs` 第 5 节加一条断言：`--state <文件>` 不得被当作目录使用（要么 exit 1 参数错误，要么按目录解析后正确暂停；**不允许静默 proceed**）。
- 风险：改脚本语义可能影响现有调用方。回滚：只改技能，不动脚本。
- 批次：1。

### U-02 技能第 5 步改用 `--phase gate`，并补 gate 阶段必填项（P0，批次 1）

- 借鉴自：无（自发现 D-02）。B 的 `loop-gate` 只有一种检查、没有阶段概念，不适用。
- 替换/补足：替换 `skills/harness-loop/SKILL.md` 第 5 步命令。
- 改前：`--phase fix` + `--verdict approve`，证据闸门与 head-commit 闸门都不触发。
- 改后：验证通过后使用 `--phase gate`，并显式传 `--reviewed-sha`、`--head-sha`（脚本自己 `git rev-parse` 取 head 更好，见 U-04）、`--evidence-file`。
- 验收：
  ```bash
  # 技能文档里的命令必须能被复制执行，且 approve 无证据时 exit 2
  ```
  在 `test.mjs` 第 5 节加断言：技能 SKILL.md 的第 5 步命令串包含 `--phase gate`；并加一条"从 SKILL.md 提取命令 → 执行 → 无证据时 exit 2"的冒烟测试。
- 风险：多一次闸门调用；循环变慢。回滚：保留 fix 阶段用于中间检查，gate 阶段用于最终批准。
- 批次：1。

### U-03 证据闸门绑定可复现命令（P1，批次 2）

- 借鉴自：B 的 drill record 思想（`B@54f8c56:tools/loop-drill/src/record.ts:45-52`：证据绑定被证明对象的 sha256）。
- 替换/补足：补足 `gate-check.mjs` 的 `verification-evidence` 闸门。
- 改前：证据文件只要格式对就通过；模型可以虚构。
- 改后：`--evidence-file` 里的每条 `- Tests: \`<cmd>\` → PASS` 必须满足：
  1. 命令非空；
  2. 报告里带一行 `<!-- evidence-sha256: <sha256(cmd)> -->` 或在报告末尾附 `### Replay` 节列出命令原文；
  3. 闸门**不执行**命令（避免在闸门里跑任意命令），但要求报告同时给出该命令的 `--evidence-run-log` 文件路径，且该文件 mtime 在报告 mtime 之前 10 分钟内。
- 说明：这是"提高伪造成本"，不是"证明真跑过"。真正的证明只能靠 U-05 的 drill。
- 验收：
  ```bash
  # 无 replay 节的报告 → exit 2；带 replay 节但 run-log 不存在 → exit 2；两者都有 → exit 0
  ```
  `test.mjs` 第 5 节新增 3 条断言。
- 风险：增加一次文件写入；模型可能仍伪造 run-log。回滚：把新检查降级为 warning（不改变退出码）。
- 批次：2。

### U-04 head-commit 由脚本自己取（P1，批次 2）

- 借鉴自：无（自发现 D-04）。B 的 gate 不处理 commit 绑定；A 的 `--match-head-commit` 是 git 层，但我的闸门应至少自己读 git。
- 替换/补足：补足 `head-commit` 闸门。
- 改前：两个 sha 都由调用方传，传同一个假 sha 即通过。
- 改后：`--phase gate` 时，`head-sha` 若缺省，脚本执行 `git rev-parse HEAD`；`reviewed-sha` 仍由调用方给（它代表"审查时看到的那个 commit"）。若 `reviewed-sha` 不是 40/64 位 hex → exit 1（参数错误）。
- 验收：
  ```bash
  node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
    --reviewed-sha deadbeef --diff-files a.ts --evidence-file ev.md   # 期望 exit 1（不是合法 sha）
  node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
    --reviewed-sha "$(git rev-parse HEAD)" --diff-files a.ts --evidence-file ev.md  # 期望 exit 0
  ```
- 风险：在非 git 目录调用会失败；需回落到"要求显式传 head-sha"。回滚：保留显式传参路径。
- 批次：2。

### U-05 最小护栏演练 `drill-check.mjs`（P1，批次 3）

- 借鉴自：B 的 `loop-drill`（`B@54f8c56:tools/loop-drill/src/drill.ts:148-263,310-456`；`record.ts:45-123`）。
- 替换/补足：补足"机制有代码入口且行为被测试断言"（硬约束 11）在**消费方仓库**的落地。我的 `test.mjs` 证明了源仓库的护栏会响；没有工具证明**装配后的仓库**的护栏会响。
- 改前：装配完就认为护栏有效。
- 改后：新增 `scripts/drill-check.mjs`，两个离线 drill：
  1. **gate drill**：读 `loop-constraints.md` 的拒绝列表，为每条合成一个样本路径，调 `matchesDenylist` 断言命中；再断言一个良性路径（`src/app.ts`）不命中（特异性）。
  2. **breaker drill**：用合成账本断言 `stagnation`、`no-progress`、`token-budget`（若配置）各自以**具体** trigger 触发；再断言健康账本不触发。
  3. `--record` 写 `loop-drill.json`，含 `loop-constraints.md` 的 sha256；`harness-stage` 阶段 2 判据新增一项：`loop-drill.json` 存在、sha256 与当前约束文件一致、`failed === 0`。
- 验收：
  ```bash
  node scripts/drill-check.mjs . --record      # 期望 exit 0，生成 loop-drill.json
  # 改一条拒绝列表后不重跑 drill → harness-stage 阶段 2 该项 FAIL
  node scripts/harness-stage.mjs . --stage 2 --require   # 期望 exit 2
  ```
  `test.mjs` 新增一节：drill 对每条拒绝列表都命中；良性路径不命中；篡改 `loop-constraints.md` 后 record 失效。
- 风险：新增 1 个脚本（约 200 行）；样本路径合成可能对某些 glob 不成立，需记 skipped 而非 failed（照 B 的做法）。回滚：删除脚本与阶段判据项。
- 批次：3。

### U-06 拒绝列表补"策略面"路径 + 漂移检测（P1，批次 2）

- 借鉴自：B 的 `gate.yaml` 自保护条目（`B@54f8c56:loop-constraints.md:13`）与 `policy-drift.ts`（`B@54f8c56:tools/loop-sync/src/policy-drift.ts:1-164`）。
- 替换/补足：补足 D-05/D-06/G-27/G-30。
- 改前：`loop-constraints.md`、`scripts/gate-check.mjs`、`.github/workflows/**`、`package.json` 不在拒绝列表；`docs/04-safety.md` 的拒绝列表副本无人比对。
- 改后：
  1. `loop-constraints.md` 的 `## Paths` 增加：`loop-constraints.md`、`scripts/gate-check.mjs`、`scripts/ledger-check.mjs`、`scripts/lib/common.mjs`、`.github/workflows/**`、`package.json`、`package-lock.json`、`templates/**`。
  2. `harness-stage` 阶段 2 判据 5 的"本地化"判定改为：拒绝列表必须包含至少 2 条模板之外的路径（现状已满足），且必须包含 `loop-constraints.md` 自身。
  3. 新增 `scripts/policy-drift.mjs`（或并入 `harness-stage`）：解析 `loop-constraints.md` 的 `## Paths` 与 `docs/04-safety.md` 的拒绝列表代码块，逐条精确比较；不一致 → exit 2。
- 验收：
  ```bash
  node scripts/gate-check.mjs --item p --phase fix --diff-files loop-constraints.md   # 期望 exit 2（denylist）
  node scripts/gate-check.mjs --item p --phase fix --diff-files scripts/gate-check.mjs # 期望 exit 2
  node scripts/policy-drift.mjs .   # 两边一致 exit 0；删掉 safety.md 一条 → exit 2
  ```
- 风险：拒绝列表变长会增加升级频率；`docs/04-safety.md` 与约束文件必须同步改。回滚：移除新增路径，保留漂移检测。
- 批次：2（路径）与 2（漂移检测）。

### U-07 状态源职责收敛（P2，批次 1，主要是文档 + 一条检查）

- 借鉴自：无（自发现 H1）。B 的 `multi-loop.md:7-22` 有"每模式一个状态文件"的规则，但我是单循环，不适用。
- 替换/补足：替换 `docs/02-state-model.md` 的"三类状态"与 `AGENTS.md` 的选项目规则。
- 改前：`AGENTS.md:14` 说从 `feature_list.json` 选；技能第 2 步说从 `STATE.md` 选；`STATE.md` 的 `## Active` 与 `loop-ledger.json` 都记 attempts。
- 改后：
  - **工作队列唯一来源 = `STATE.md` 的 `## High Priority`**。`feature_list.json` 只记录"已选中并验证过的项"。
  - `STATE.md` 的 `## Active` 只记"当前 item id + acting_on"，**不记 attempts**（attempts 只在 ledger）。
  - `## Post-Run Critique` 只记"下轮一项调整"，不记 outcome（outcome 只在 run-log）。
  - `AGENTS.md` 的启动流程改为"读 `STATE.md` 选一项；`feature_list.json` 用于查该项是否已完成"。
  - 新增机械检查（`gate-check` 或 `harness-stage`）：`STATE.md` 的 `## Active` 表数据行 > 1 → exit 2（WIP=1）。
- 验收：
  ```bash
  # 构造两行 Active 的 STATE.md → harness-stage 阶段 2 新判据 FAIL 或 gate-check exit 2
  ```
  `test.mjs` 新增一条：两行 Active → 非零。
- 风险：文档改动多，容易漏。回滚：文档单独提交。
- 批次：1（文档）+ 2（检查）。

### U-08 预算接线（P2，批次 2）

- 借鉴自：B 的 `loop-budget` skill 三档（80/90/100）与 `loop-context --token-budget`（`B@54f8c56:skills/loop-budget/SKILL.md:1-40`）。**不引入** `loop-cost` 估算与 `budget-negotiator`（L3 才需要，我明确不做 L3）。
- 替换/补足：补足 D-07。
- 改前：`--token-budget` 存在但无人传；`tokensUsed` 无人写。
- 改后：
  1. 技能第 6 步的 `ledger-check` 命令加 `--token-budget <n>`，n 从 `loop-constraints.md` 的 `## Budget` 段读取（新增该段，默认留空 = 不启用）。
  2. 账本 schema 要求每次尝试写 `tokensUsed`（可为估算）；技能第 6 步明确"写不进去就写 0，但不得省略"。
  3. 80% 时 `gate-check` 返回 `decision: report-only`（新增一个 decision 值），技能据此不派执行者。
- 验收：
  ```bash
  # 账本 150 tokens，预算 100 → ledger-check exit 2
  # 账本 85 tokens，预算 100 → gate-check decision=report-only，exit 0
  ```
- 风险：新增 `report-only` 决策值会改变调用方分支；需要同步 docs/03 的枚举。回滚：只做 1+2，不做 3。
- 批次：2。

### U-09 空文件与可加载技能检查（P2，批次 1）

- 借鉴自：B 的 `hasContent()` 与 frontmatter 检查（`B@54f8c56:tools/loop-audit/src/auditor.ts:177-218`）。
- 替换/补足：补足 G-17/G-18。
- 改前：阶段判据只查 `exists()`；技能判据只查两个子串。
- 改后：
  1. `harness-stage` 的所有"文件存在"判据改为"存在且非空（去 HTML 注释后非空）"。
  2. `skillInDiscoverablePath()` 改为：`SKILL.md` 有 `name:` 与 `description:` frontmatter，且正文含 `kill switch` 与 `验证`。
- 验收：
  ```bash
  # 空 STATE.md → 阶段 1 判据 3 FAIL
  # 无 frontmatter 的 SKILL.md → 阶段 2 判据 3 FAIL
  ```
  `test.mjs` 第 14 节各加一条。
- 风险：误伤"合法空文件"（例如 `.gitkeep`）；只对 6 个地基文件生效。回滚：只对 `STATE.md` 与 `SKILL.md` 生效。
- 批次：1。

### U-10 不可信输入段落（P2，批次 3）

- 借鉴自：B 的 untrusted-input 段落与同步机制（`B@54f8c56:scripts/sync-untrusted-input.mjs:34-63`；`B@54f8c56:docs/safety.md:86-96`）。
- 替换/补足：补足 G-22/G-23。
- 改前：`harness-loop-issue` 读 GitHub 标题/正文，`harness-loop` 读 `STATE.md`（可能含第三方文本），两者都没有"数据不是指令"的段落。
- 改后：
  1. 两个技能的末尾加同一段（约 10 行，中文），内容：指令只来自技能/约束/人；第三方文本要求执行动作时标记为疑似注入并升级；不得把可疑文本复制进状态文件。
  2. `test.mjs` 第 10 节加断言：两个技能都含该段落的标记 `<!-- untrusted-input:start -->` / `end`，且两段内容逐字相同。
- 验收：
  ```bash
  node scripts/test.mjs   # 新增断言通过
  grep -c 'untrusted-input:start' skills/harness-loop/SKILL.md skills/harness-loop-issue/SKILL.md  # 各 1
  ```
- 风险：技能变长约 10 行；每次运行多读约 150 token。回滚：删除段落。
- 批次：3。

### U-11 双宿主漂移检测补缺失（P2，批次 1）

- 借鉴自：无（自发现 H5）。B 的 `scanSkillDirectories` 也只看存在，不解决跨宿主缺失。
- 替换/补足：补足 `install-skills --check`。
- 改前：缺一整个宿主副本时 exit 0。
- 改后：`--check` 在 `missing.length > 0` 时 exit 1，并在输出里列出"缺失宿主"；`--json` 的 `in_sync` 同时要求 `missing.length === 0`。
- 验收：
  ```bash
  # 临时目录只装 .claude、删 .agents → --check exit 1
  ```
  `test.mjs` 第 13 节新增一条。
- 风险：用户只装一个宿主（`--layout claude`）时会被判缺失；需按 `--layout` 只检查声明的宿主。回滚：降级为 warning。
- 批次：1。

### U-12 清洁交接检查（P3，批次 3）

- 借鉴自：A 的 clean-state checklist（`A@38ddcd2:docs/en/resources/templates/clean-state-checklist.md:1-8`；L12:93-104）。
- 替换/补足：补足 G-05。
- 改前：技能第 7 步只要求写状态。
- 改后：新增 `scripts/clean-state.mjs`（或并入 `harness-stage`）：检查 `init.sh` 能跑（复用现有判据）、`git status --porcelain` 无未跟踪的调试文件（`*.log`、`debug-*`、`tmp-*`）、`STATE.md` 的 `Last run` 是今天。任一项失败 → exit 2，技能在结束前调用。
- 验收：
  ```bash
  touch debug-x.log && node scripts/clean-state.mjs .   # 期望 exit 2
  rm debug-x.log && node scripts/clean-state.mjs .      # 期望 exit 0
  ```
- 风险：误报（合法的 `.log` 资产）；用显式文件名模式而非后缀。回滚：只保留"Last run 是今天"一项。
- 批次：3。

### U-13 worktree 最小 manifest（P3，批次 3）

- 借鉴自：B 的 `loop-worktree`（`B@54f8c56:tools/loop-worktree/src/worktree.ts:148-272`）。**不移植**锁、gc、sandbox。
- 替换/补足：补足 G-28。
- 改前：技能手敲 `git worktree add/remove`，REJECT 后是否丢弃靠自觉。
- 改后：新增 `scripts/worktree.mjs`：`create --run-id <id>`、`mark --run-id <id> --status rejected|escalated|merged`、`cleanup`（只删 rejected/escalated，不带 `--force`，有未提交改动时报告而不是删除）。manifest 写 `.loop-worktrees/manifest.json`。
- 验收：
  ```bash
  node scripts/worktree.mjs create --run-id t1 && node scripts/worktree.mjs mark --run-id t1 --status rejected
  node scripts/worktree.mjs cleanup   # 期望删除 t1，且不留分支
  ```
- 风险：新增 1 个脚本；Windows 路径。回滚：技能继续手敲 git。
- 批次：3。

---

## 3. 减重项

| 动作 | 对象 | 目标 |
|---|---|---|
| 下沉 | `LESSONS.md:1-31` 的格式说明 | 移到 `templates/LESSONS.md`；运行时只读 `## Rules` 之后。预计省 ~500 token/轮 |
| 下沉 | `loop-constraints.md` 的解释性长注释（第 60–78 行） | 移到 `docs/04-safety.md` 的"为什么"节；约束文件只留规则。预计省 ~300 token/轮 |
| 合并 | `docs/03` 的"五类闸门"与"判定优先级" | 合成一张表（9 个 gate 名 × 触发 × 决策），删掉重复的 L0–L3 表（与 `:228` 的"没有 L3"冲突） |
| 改脚本 | `harness-stage` 的"文件存在"判据 | 改为"存在且非空"（U-09），不新增文件 |
| 删除 | `docs/archive/**` 的 7 个 v1 文件（约 2,300 行） | 已归档且与 v2 冲突；移到 git 历史或单独分支。**需人确认**，本规格只建议 |
| 保留 | `docs/00/02/03/04/05/08/09` | 7 篇是方法论主体，按需加载，不动 |
| 目标 | 必读 token 从 ≈6,921 降到 ≈6,100；文件数不增（除 U-05/U-13 两个新脚本） | 批次 1–2 完成后复核 |

---

## 4. 明确不做

| 不做 | 理由 | 出处 |
|---|---|---|
| 0–100 就绪度评分 / L3 授予 | 分数被"文件存在"抬高；我已移除，B 的 `present is not proven` 只是部分缓解 | `docs/03:220`；`B@54f8c56:tools/loop-audit/src/auditor.ts:397-469` |
| `loop-cost` 成本估算与 `budget-negotiator` | 需要 registry 与真实 token 计量；我连 token 计量都没有。只做接线（U-08） | `B@54f8c56:tools/loop-cost/src/estimator.ts` |
| 多循环协调 / 每模式独立 state | 单队列单 item 是当前设计；引入会破坏"状态源唯一" | H1；`B@54f8c56:docs/multi-loop.md` |
| pattern registry / starter 矩阵 | 我没有模式库；`/harness-loop-issue` 已覆盖发现侧 | `B@54f8c56:patterns/registry.yaml` |
| verifier canary / injection canary（完整版） | 需要可运行的 agent 命令与 worktree 隔离；成本高于收益。只做 U-05 的离线 drill | `B@54f8c56:tools/loop-drill/src/canary.ts` |
| `loop-sandbox` / `loop-swarm` / 共识 | 单 agent 循环用不上 | `B@54f8c56:tools/loop-sandbox` |
| 图工程（nodes/edges/checkpoint） | 单节点 maker-checker，按 L14 五准则不需要图 | `A@38ddcd2:docs/en/lectures/lecture-14-graph-engineering/index.md:288-296` |
| MCP 连接器 | 本地循环不需要；`/harness-loop-issue` 用 `gh` 已够 | `docs/00-mind-model.md:105-115` |
| quality document / evaluator rubric | 多模块产品才需要；我的"模块"是 4 个技能与 6 个脚本 | `A@38ddcd2:docs/en/resources/templates/quality-document.md` |
| 定时/事件触发 | 明确是人的决定；框架不替人按开始键 | `docs/00-mind-model.md:105-115` |

---

## 5. 分批路线

每批独立可验收；先做"能删部件/修 bug"的，再做"加机制"的。

### 批次 1 — 修坏掉的机制（不新增文件，只改技能与检查）

| 项 | 验收 |
|---|---|
| U-01 kill switch 调用 | 技能命令在暂停时 exit 3 |
| U-02 `--phase gate` | 技能命令在 approve 无证据时 exit 2 |
| U-09 空文件/frontmatter | `test.mjs` 新增断言全绿 |
| U-11 缺失宿主 | 临时目录场景 exit 1 |
| U-07（文档部分） | `AGENTS.md` 与技能第 2 步一致 |

退出条件：`bash init.sh` 全绿；4 条新断言能在改动前代码上挂掉。

### 批次 2 — 收紧闸门与状态

| 项 | 验收 |
|---|---|
| U-03 证据绑定命令 | 3 条新断言 |
| U-04 脚本自己取 head | 假 sha exit 1 |
| U-06 策略面路径 + 漂移检测 | 改约束文件 exit 2；漂移 exit 2 |
| U-07（检查部分） | 两行 Active → 非零 |
| U-08 预算接线 | 预算超限 exit 2；80% report-only |

退出条件：`init.sh` 全绿；`docs/03` 的 gate 表与代码一致（9 个）。

### 批次 3 — 补"证明"与隔离

| 项 | 验收 |
|---|---|
| U-05 drill-check | `--record` 生成记录；篡改约束后阶段 2 FAIL |
| U-10 untrusted 段落 | 两技能段落逐字相同 |
| U-12 clean-state | 调试文件 → exit 2 |
| U-13 worktree manifest | create/mark/cleanup 闭环 |

退出条件：`init.sh` 全绿；在靶场仓库上跑一次完整循环，drill 记录与 clean-state 都通过。

---

## 6. 回滚策略

- 每批一个 commit；批次 1 的改动全部在 `skills/` 与 `test.mjs`，回滚 = `git revert`。
- 批次 2/3 新增脚本独立成文件；删除文件即回滚，不影响既有脚本。
- 任何一项导致 `init.sh` 连续 3 次失败 → 停止，写升级条目，不再重试（熔断规则）。
