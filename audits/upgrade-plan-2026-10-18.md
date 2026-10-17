# 升级修改规划（修订版）— 2026-10-18

> 取代 `audits/upgrade-spec-2026-10-18.md` 的批次划分。规格里的出处与理由仍然有效；本文件只覆盖**范围、设计细节、验收与顺序**。
> 本轮只出规划，不改实现。实现另起一轮，按批次逐项做。

---

## 0. 已澄清的决策（Q1–Q15）

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 本轮范围 | 10 项：U-01/02/03/04/06/07/08/09/10/11。U-05（drill）、U-12（clean-state）、U-13（worktree）推迟到下一轮 |
| Q2 | 交付物 | 只出规划；实现另起一轮 |
| Q3 | skill 边界 | `skills/` + `scripts/` + `loop-constraints.md` + `templates/`；`docs/` 仅修事实错误 |
| Q4 | 验证者 | 独立子智能体（新实例、REJECT-first、只拿 diff 与验证命令）+ 人合并 |
| Q5 | docs 事实修正 | 先单独落一个 commit，不与机制改动混在一起 |
| Q6 | 新检查位置 | 不新增顶层脚本；并入 `harness-stage` 或 `gate-check` |
| Q7 | U-01 | `--state` 接受文件或目录；目录里两个文件都读不到 → exit 1 |
| Q8 | U-02 | `--phase fix` + `approve` 加非阻断 warning；退出码不变 |
| Q9 | U-03 | gate 阶段重放证据命令并比对退出码；`--no-replay` 显式跳过并记 NOT RUN |
| Q10 | U-06 | 模板同步加策略面路径；判据 5 改为"含自身 + 至少 2 条额外路径" |
| Q11 | U-08 | `## Budget` 段 + `parseBudgetFrom()`；`ledger-check` 输出 `budget_ratio`；`gate-check` 不碰预算 |
| Q12 | 验收位置 | `test.mjs` 新增第 16 节 + "从 SKILL.md 提取命令并执行"的断言 |
| Q13 | U-04 | sha 格式校验 + `--head-sha` 缺省时脚本自己取；同步修 `init.sh`/CI 的假 sha |
| Q14 | U-07 | WIP=1 放进 `gate-check --state`（运行时约束） |
| Q15 | 批次状态 | `STATE.md` 为三个批次各写一条待办，完成标准引用本文件的验收命令 |

---

## 1. 范围

### 1.1 本轮做（10 项）

| ID | 一句话 | 入口 | 批次 |
|---|---|---|---|
| U-01 | kill switch 调用与 fail-closed | `gate-check` + `skills/harness-loop` | 1 |
| U-02 | 技能第 5 步改用 `--phase gate` | `skills/harness-loop` | 1 |
| U-09 | 空文件与技能 frontmatter 检查 | `harness-stage` | 1 |
| U-11 | 双宿主缺失检测 | `install-skills` | 1 |
| U-07 | 状态源收敛 + WIP=1 | `docs/02`、`AGENTS.md`、`gate-check` | 1（文档）/ 2（检查） |
| U-03 | 证据命令重放 | `gate-check` | 2 |
| U-04 | sha 格式与 head 自取 | `gate-check` + `init.sh` + CI | 2 |
| U-06 | 策略面路径 + 漂移检测 | `loop-constraints.md`、`templates/`、`harness-stage` | 2 |
| U-08 | 预算接线 | `loop-constraints.md`、`ledger-check` | 2 |
| U-10 | 不可信输入段落 | 两个技能 | 2 |

### 1.2 推迟（下一轮，理由）

| ID | 推迟理由 |
|---|---|
| U-05 drill-check | 本轮正在改闸门；先改闸门再录 drill，记录会因策略 sha 变化立刻失效。应在批次 2 完成后单独做 |
| U-12 clean-state | 体验改善，不是承诺缺口；依赖 U-05 的"结束前检查"时机 |
| U-13 worktree manifest | 同上；且需要先在靶场跑一轮验证 manifest 生命周期 |

### 1.3 明确不做（不变）

0–100 评分 / L3 授予、`loop-cost` 估算、多循环协调、pattern registry、完整 canary、`loop-sandbox`/`loop-swarm`、图工程、MCP、quality document、定时/事件触发。理由见 `upgrade-spec-2026-10-18.md` §4。

---

## 2. 逐项设计

格式：**改哪里 / 改前 → 改后 / 验收 / 风险**。所有验收命令都在仓库根执行。

### U-01 kill switch：接受文件或目录，且读不到就失败

**改哪里**：`scripts/gate-check.mjs` 的 `isPaused()` 与 `main()`；`skills/harness-loop/SKILL.md` 第 0 步。

**改前**：`--state` 一律当目录；传文件名时 `path.join('STATE.md', 'STATE.md')` 读不到，静默 `proceed`。

**改后**：
1. `--state <path>`：
   - 是**文件** → 只读该文件；
   - 是**目录** → 读 `STATE.md` 与 `loop-constraints.md`；
   - 两者都读不到（文件不存在，或目录里两个文件都没有）→ `exit 1`，stderr 写 `--state <path> contains neither STATE.md nor loop-constraints.md`。
2. 技能第 0 步改为 `--state .`。
3. `--pause` 仍可显式覆盖（现有行为不变）。

**验收**：
```bash
# 暂停生效（文件形式）
T=$(mktemp -d); printf 'loop-pause-all\n' > "$T/STATE.md"
node scripts/gate-check.mjs --item p --phase fix --diff-files a.ts --state "$T/STATE.md"; echo $?  # 3
# 暂停生效（目录形式）
node scripts/gate-check.mjs --item p --phase fix --diff-files a.ts --state "$T"; echo $?           # 3
# 读不到 → 参数错误，不得 proceed
mkdir "$T/empty"; node scripts/gate-check.mjs --item p --phase fix --diff-files a.ts --state "$T/empty"; echo $?  # 1
```
`test.mjs` 第 16 节新增 3 条断言；第 5 节现有 kill-switch 断言保持绿。

**风险**：现有调用方若依赖"读不到就放行"，会开始报错——这正是要修的行为。回滚：把 exit 1 降级为 warning + proceed，但**不建议**。

---

### U-02 技能第 5 步：`--phase gate` + 非阻断 warning

**改哪里**：`skills/harness-loop/SKILL.md` 第 5 步；`scripts/gate-check.mjs` 的 proceed 分支。

**改前**：技能用 `--phase fix` + `--verdict approve`，证据与 head-commit 闸门永不触发。

**改后**：
1. 技能第 5 步改为：
   ```bash
   node scripts/gate-check.mjs \
     --item <item-id> --phase gate --attempts <n> \
     --diff-files @changed-files.txt \
     --verdict <approve|reject|escalate-human|none> \
     --red-check <pass|fail|not-run> \
     --reviewed-sha <审查时的 commit> \
     --head-sha "$(git rev-parse HEAD)" \
     --evidence-file <verifier-report.md> \
     --state .
   ```
2. `--phase fix` + `--verdict approve` 时，proceed 输出增加字段：
   ```json
   "warning": "approve at fix phase is not a gate; merge requires --phase gate"
   ```
   **退出码不变（仍为 0）**。

**验收**：
```bash
# 按技能第 5 步原样执行、无证据 → 2
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
  --reviewed-sha "$(git rev-parse HEAD)" --head-sha "$(git rev-parse HEAD)" --diff-files a.ts; echo $?  # 2
# fix + approve → 0 且带 warning
node scripts/gate-check.mjs --item p --phase fix --verdict approve --diff-files a.ts | grep -c warning  # 1
```
`test.mjs` 第 16 节新增 2 条。

**风险**：`init.sh:51` 与 CI 的 fix+approve 冒烟仍走 proceed，不受影响。

---

### U-09 空文件与可加载技能

**改哪里**：`scripts/harness-stage.mjs` 的 `hasFile()` 与 `skillInDiscoverablePath()`。

**改前**：只查 `exists()`；技能只查两个子串。

**改后**：
1. 6 个地基文件的判据改为"存在且去 HTML 注释后非空"。
2. `skillInDiscoverablePath()` 要求 `SKILL.md` 有 `name:` 与 `description:` frontmatter，且正文含 `kill switch` 与 `验证`。

**验收**：
```bash
T=$(mktemp -d); node scripts/harness-stage.mjs "$T" --upgrade --stage 1 >/dev/null
: > "$T/STATE.md"
node scripts/harness-stage.mjs "$T" --json | grep -A2 '状态文件存在'   # ok:false
```

**风险**：合法空文件（`.gitkeep`）不受影响——只对这 6 个文件生效。

---

### U-11 双宿主缺失检测

**改哪里**：`scripts/install-skills.mjs` 的 `checkInstalled()`。

**改前**：缺一整个宿主副本时 exit 0。

**改后**：
1. 读取清单里的 `layout` 字段（已存在，`install-skills.mjs:122-129`），只检查**声明的**宿主；无清单时按 `--layout` 参数。
2. 声明的宿主目录不存在或副本缺失 → 计入 `drifted`，exit 1；`--json` 的 `in_sync` 同时要求 `missing.length === 0`。

**验收**：
```bash
T=$(mktemp -d); node scripts/install-skills.mjs --target "$T" >/dev/null
rm -rf "$T/.agents/skills/harness-loop"
node scripts/install-skills.mjs --target "$T" --check; echo $?   # 1
```

**风险**：只装单宿主（`--layout claude`）的用户不受影响，因为按清单 `layout` 判断。

---

### U-07 状态源收敛 + WIP=1

**改哪里**：`AGENTS.md` 启动流程；`docs/02-state-model.md`；`scripts/gate-check.mjs` 的 `isPaused` 旁边新增 `activeItems()`。

**改前**：`AGENTS.md` 说从 `feature_list.json` 选，技能说从 `STATE.md` 选；`STATE.md` 的 `## Active` 与 ledger 都记 attempts。

**改后**：
1. 文档：工作队列唯一来源 = `STATE.md` 的 `## High Priority`；`feature_list.json` 只记"已完成 + 证据"；`## Active` 只记 `item id + acting_on`。
2. `gate-check --state <dir>` 解析 `STATE.md` 的 `## Active` 表：
   - 表头之后的数据行，排除 `| — |` / `| - |` 占位行；
   - 数据行 > 1 → `exit 2`，`gate: "wip-limit"`；
   - 文件不存在或无 `## Active` 节 → 跳过（不阻断）。

**验收**：
```bash
T=$(mktemp -d); cp loop-constraints.md "$T/"
printf '## Active\n\n| Work item | acting_on | 状态 |\n|---|---|---|\n| a | x | 进行中 |\n| b | y | 进行中 |\n' > "$T/STATE.md"
node scripts/gate-check.mjs --item p --phase fix --diff-files a.ts --state "$T"; echo $?   # 2
```

**风险**：`STATE.md` 格式写错（例如用列表而非表）会绕过检查——接受这个限制，因为它是"格式合法才检查"，不是"格式非法就放行"（后者才是 D-01 的病）。**实现时必须让"表头存在但解析出 0 行"与"没有表"可区分**：前者按 0 行处理，后者跳过。

---

### U-03 证据命令重放

**改哪里**：`scripts/gate-check.mjs` 的 `verification-evidence` 分支。

**改前**：证据只做正则形状校验。

**改后**：
1. 证据文件必须含 `### Evidence commands` 节，节内每行格式：
   ```
   - `<command>` → `<exit code>`
   ```
2. `--phase gate` 时，`gate-check` 在 `--evidence-cwd`（默认 cwd）下逐条执行，超时 120s，比对退出码；任一不符 → `escalate`，`gate: "verification-evidence"`，`reason` 列出不符的命令。
3. `--no-replay`：跳过执行，结果里 `checks_not_run` 追加 `Evidence replay`，并在输出 `warning` 里写明"证据未重放"。
4. 执行环境继承当前环境；命令不含 shell 元字符时用 `execFile`，否则用 `shell: true`。

**验收**：
```bash
T=$(mktemp -d); cd "$T"
printf '## Verdict: APPROVE\n\n### Evidence\n- Tests: `true` → PASS\n\n### Evidence commands\n- `true` → `0`\n\n### Checks not run\n- —\n' > ev.md
node <repo>/scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
  --reviewed-sha <sha> --head-sha <sha> --diff-files a.ts --evidence-file ev.md --evidence-cwd .; echo $?  # 0
printf '## Verdict: APPROVE\n\n### Evidence\n- Tests: `true` → PASS\n\n### Evidence commands\n- `false` → `0`\n\n### Checks not run\n- —\n' > ev2.md
node <repo>/scripts/gate-check.mjs ... --evidence-file ev2.md; echo $?   # 2（实际退出码 1 ≠ 声称 0）
```

**风险**：闸门变慢；命令必须可重入。`--no-replay` 是逃生口，但会记 NOT RUN。回滚：把不符降级为 warning。

---

### U-04 sha 格式与 head 自取

**改哪里**：`scripts/gate-check.mjs`；`init.sh`；`.github/workflows/self-check.yml`。

**改前**：两个 sha 都由调用方传，假 sha 对假 sha 即通过。

**改后**：
1. `--reviewed-sha` 必须是 40 或 64 位 hex（`^[0-9a-f]{40}([0-9a-f]{24})?$`，大小写不敏感）；否则 `exit 1`。
2. `--phase gate` 时 `--head-sha` 缺省 → 脚本执行 `git rev-parse HEAD`；不在 git 仓库 → `exit 1` 并提示显式传参。
3. `init.sh` 与 CI 里的 `abc123` 改为 `$(git rev-parse HEAD)`（CI 里在 checkout 之后）。
4. 仍保留"两个 sha 必须相等"的现有比较；不引入 `git merge-base` 可达性检查（Q13 选 b）。

**验收**：
```bash
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
  --reviewed-sha deadbeef --head-sha deadbeef --diff-files a.ts --evidence-file ev.md; echo $?  # 1
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
  --reviewed-sha "$(git rev-parse HEAD)" --diff-files a.ts --evidence-file ev.md; echo $?        # 0（head 自取）
```
`test.mjs` 现有 `GATE` 常量里的 `abc123` 改为 `'a'.repeat(40)`；第 5 节两条 null sha 断言保持绿。

**风险**：`init.sh`/CI 必须同步改，否则红。回滚：只保留格式校验，去掉 head 自取。

---

### U-06 策略面路径 + 漂移检测

**改哪里**：`loop-constraints.md`、`templates/loop-constraints.md`、`scripts/harness-stage.mjs`、`docs/04-safety.md`。

**改前**：改约束文件、闸门脚本、CI、依赖都不升级；`docs/04-safety.md` 的拒绝列表副本无人比对。

**改后**：
1. 根与模板的 `## Paths` 同时追加：
   ```
   loop-constraints.md
   scripts/gate-check.mjs
   scripts/ledger-check.mjs
   scripts/lib/common.mjs
   .github/workflows/**
   package.json
   package-lock.json
   templates/**
   ```
2. 阶段 2 判据 5 改为：拒绝列表必须**包含 `loop-constraints.md` 自身**，且**至少 2 条模板之外的路径**。
3. 新增漂移检测（并入 `harness-stage`，不新增脚本）：解析 `loop-constraints.md` 的 `## Paths` 与 `docs/04-safety.md` 的拒绝列表代码块，逐条精确比较；不一致 → 阶段 2 新增判据 FAIL（`--require` 时 exit 2）。
4. `docs/04-safety.md` 的代码块同步加同样路径，并加一行说明"本块与 `loop-constraints.md` 必须逐条一致"。

**验收**：
```bash
node scripts/gate-check.mjs --item p --phase fix --diff-files loop-constraints.md; echo $?        # 2
node scripts/gate-check.mjs --item p --phase fix --diff-files scripts/gate-check.mjs; echo $?     # 2
# 漂移：删掉 docs/04 一条 → 阶段 2 FAIL
```

**风险**：拒绝列表变长会增加升级频率；两份列表必须同步改。回滚：移除新增路径，保留漂移检测。

---

### U-08 预算接线

**改哪里**：`loop-constraints.md`、`templates/loop-constraints.md`、`scripts/lib/common.mjs`、`scripts/ledger-check.mjs`、`skills/harness-loop/SKILL.md`。

**改前**：`--token-budget` 存在但无人传；`tokensUsed` 无人写；无日累计。

**改后**：
1. 约束文件新增 `## Budget` 段：
   ```markdown
   ## Budget

   - 日 token 上限：0        # 0 = 不启用
   ```
2. `common.mjs` 新增 `parseBudgetFrom(text)`，返回 `{ tokenBudget }`；`ledger-check` 在未显式传 `--token-budget` 时读取当前目录的 `loop-constraints.md`。
3. `ledger-check` 输出新增 `budget_ratio`（`tokensUsed / tokenBudget`，未启用时为 `null`）：
   - `>= 1.0` → `verdict: "token-budget"`，exit 2（现有行为）；
   - `>= 0.8` → `verdict: "report-only"`，exit 0，`next` 写明"不派执行者"。
4. 技能第 6 步调用 `ledger-check` 后，若 `verdict == "report-only"`，本轮不派执行者，outcome 记 `report-only`。
5. `gate-check` **不读预算**（Q11）。

**验收**：
```bash
T=$(mktemp -d); printf '{"goal":"g","attempts":[{"iteration":1,"action":"a","outcome":"success","tokensUsed":85}]}\n' > "$T/l.json"
printf '## Budget\n\n- 日 token 上限：100\n' > "$T/loop-constraints.md"
(cd "$T" && node <repo>/scripts/ledger-check.mjs --ledger l.json) | grep budget_ratio   # 0.85
(cd "$T" && node <repo>/scripts/ledger-check.mjs --ledger l.json); echo $?               # 0
printf '{"goal":"g","attempts":[{"iteration":1,"action":"a","outcome":"success","tokensUsed":100}]}\n' > "$T/l.json"
(cd "$T" && node <repo>/scripts/ledger-check.mjs --ledger l.json); echo $?               # 2
```

**风险**：`tokensUsed` 仍是估算；不引入日累计（需要跨进程状态与锁，B 的实现约 100 行，收益不抵成本）。回滚：删 `## Budget` 段即回到不启用。

---

### U-10 不可信输入段落

**改哪里**：`skills/harness-loop/SKILL.md`、`skills/harness-loop-issue/SKILL.md` 末尾。

**改前**：两个技能都读第三方文本，都没有该段落。

**改后**：追加同一段（逐字相同，带 `<!-- untrusted-input:start -->` / `end` 标记），内容见 `docs-patches-2026-10-18.md` P-11。

**验收**：
```bash
grep -c 'untrusted-input:start' skills/harness-loop/SKILL.md skills/harness-loop-issue/SKILL.md  # 各 1
# 两段逐字相同
```
`test.mjs` 第 16 节新增 2 条。

**风险**：每次运行多读约 150 token。

---

## 3. 批次与完成定义

### 批次 0 — docs 事实修正（Q5a）

一个 commit，不改行为：
- P-01 来源段 + 闸门表第 9 行
- P-04 状态源职责（文档部分）
- P-05 闸门数、L3 表述、预算"未接线"标注、死链
- P-06 死链 + 回退测试节
- P-07 归一化描述 + 死链
- P-08 原语数法 + 闸门数
- P-09 magpie 对照表
- P-12 心智模型

**完成定义**：`grep` 不再命中 4 个死链；`docs/03` 的闸门表与代码的 9 个 gate 名一一对应；`init.sh` 绿。

### 批次 1 — 修坏掉的机制

U-01、U-02、U-09、U-11、U-07（文档部分）。

**完成定义**：
1. `test.mjs` 第 16 节新增断言全绿，且这些断言在批次 1 之前的代码上**会红**（逐条验证）。
2. 从 `skills/harness-loop/SKILL.md` 提取第 0 步命令，在暂停的临时目录执行 → exit 3。
3. 从同一技能提取第 5 步命令，无证据执行 → exit 2。
4. `bash init.sh` 绿。

### 批次 2 — 收紧闸门与状态

U-03、U-04、U-06、U-07（检查部分）、U-08、U-10。

**完成定义**：
1. 批次 1 的完成定义仍成立。
2. 证据重放：`true → 0` 通过，`false → 0` 被拒。
3. 假 sha（`deadbeef`）→ exit 1；真实 sha + 缺省 head → exit 0。
4. 改 `loop-constraints.md` / `scripts/gate-check.mjs` → exit 2。
5. 两行 Active → exit 2。
6. 预算 85% → `report-only` exit 0；100% → exit 2。
7. 两个技能含逐字相同的 untrusted 段落。
8. `bash init.sh` 绿；`node scripts/test.mjs` 全绿。

---

## 4. 验证协议（Q4b）

1. 实现者（我）完成一个批次，写报告：改了什么、跑了什么、NOT RUN 有哪些。
2. 派**独立子智能体**（新实例），提示词只含：目标、diff、验证命令、报告格式；不含实现者推理。
3. 验证者立场 REJECT-first，逐项检查：
   - 每条验收命令**实际执行**并报告输出片段；
   - 新增断言在旧代码上会红（红检）；
   - 没有禁用测试、跳过断言；
   - NOT RUN 项列全。
4. 验证通过后，我把结果写入 `STATE.md` 与 `loop-run-log.md`，**由你合并**。
5. 验证者 REJECT → 回到实现，尝试 +1；3 次后升级给你。

---

## 5. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| U-03 重放命令在 CI 里不可执行 | `--no-replay` + NOT RUN | 降级为 warning |
| U-04 改 sha 规则破坏现有冒烟 | 同步改 `init.sh`/CI 的 3 处假 sha | 只保留格式校验 |
| U-06 拒绝列表变长导致升级频繁 | 只在策略面路径上增加，不扩大业务路径 | 移除新增路径 |
| U-07 表格式解析误报 | `—` 占位行排除；无 `## Active` 节跳过 | 关闭 WIP 检查 |
| U-08 `tokensUsed` 仍是估算 | 明确写"估算"，不做日累计 | 删 `## Budget` 段 |
| 批次 2 改动面大 | 每项独立 commit；每项先红后绿 | 按项 revert |

---

## 6. 下一步

你确认本规划后：
1. 我按批次 0 → 1 → 2 逐项实现，每批一个 commit。
2. 每批完成后派独立子智能体验证，再交你合并。
3. U-05/U-12/U-13 在批次 2 合并后另起一轮规划。
