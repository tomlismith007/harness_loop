# 审计整改 Spec v2 — harness-loop（2026-10-24）

> **性质**：实施计划（spec），基于同日 Part A 审计报告（19 项发现 F-01…F-19，含 1 项 P0）。
> **基线**：`node scripts/test.mjs` → **Passed: 757 Failed: 0**；`bash init.sh` 全绿（2026-10-24 实测）。
> **状态**：`执行中`——决策已落定，批次 1（B1-01）与批次 2（B2-01…B2-06）完成于 2026-10-24；批次 3–4 待执行。全部完成后把状态改为 `已完成`，本文件归档到 `docs/archive/` 或删除。
> **本文件不是技能产物**，不随 `npx skills add` 分发，不受 `test.mjs` 的模板/路径断言约束。
> **行号均为 2026-10-24 基线**，编辑后会漂移；执行时以引用的**原文片段**定位，不要盲搜行号。
> **接替** `spec-plan/audit-remediation-spec.md`（v1，其批次已实施完毕，见 git log；处置见 E-02）。

---

## 0. 使用方式

1. 先回答 §1 的 5 个决策点（在「决定」行填写或勾选）。
2. 按 §2–§5 顺序逐项实施。**一次一项，一项一个 commit**（AGENTS.md 工作规则）。
3. 每做完一个方法就勾选它下面的 `- [ ]`；然后跑该项的「验收」。
4. 验收不过 → 停在该项，不要叠加下一项。
5. 每完成一个批次跑一次 `bash init.sh` 确认无回归；**未跑的检查在 commit message 里写 NOT RUN**。
6. 涉及脚本行为的项（B3-11、D-01、D-02）必须**先加断言、再改实现**，断言在改动前的代码上要红（回退测试）。
7. 不推送、不合并 main；`gate-check.mjs` / `ledger-check.mjs` / `stage-*.mjs` / `lib/common.mjs` 有双副本，**改一份后复制到另一份**（`test.mjs` 的逐字节断言会拦漂移）。

**范围外**：重写脚本实现、新增机制、调整技能间职责划分、改 `harness-stage` 装配逻辑。

---

## 1. 决策点（先定再做）

### D-01 · `drill-record.mjs`（162 行）是否合并进 `drill-check.mjs`

其拆分注释声称「harness-init 也要读它」，但 `harness-init` 并不 import 它——两个文件同住 `harness-loop-init`，拆分理由已消失。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 合并（推荐）** | 函数移入 `drill-check.mjs`，`stage2.mjs` 改 import，删文件 | 改 3 处 import 映射；行为无变化，现有 U-05 断言全绿即可 |
| B 保留 | 只改 `drill-record.mjs` 头部的过时注释 | 1 行；多维持一个文件 |

**决定**：`☑ A 合并（按推荐，2026-10-24）`

- [x] D-01 已决定

### D-02 · 根 `scripts/lib/common.mjs` 与技能内副本统一

现状根副本多 4 行（`TEMPLATE_DIR` 指向技能模板目录 + `LOOP_TEMPLATE_DIR`），且**不在** test.mjs 的逐字节比对覆盖内——这是唯一无机械检查的漂移点。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 统一（推荐）** | 把两个 TEMPLATE 常量挪进 `scripts/test.mjs` 本地，根 lib 变成与技能副本逐字节一致，并把根 lib 纳入字节比对断言 | 前置确认 `install-skills.mjs` 不引用 TEMPLATE_DIR；断言在统一前红（有效的回退测试） |
| B 保留差异 | 只把根 lib 纳入比对白名单（排除那 4 行） | 断言变弱；差异永存 |

**决定**：`☑ A 统一（按推荐，2026-10-24）`

- [x] D-02 已决定

### D-03 · README 的「硬约束」摘要节去留（F-15）

README 自称「给用户看」，但含开发本仓库的 7 条约束摘要（有显式区分说明，条数被 test.mjs:1232 断言）。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 保持（推荐）** | 不动。区分说明已存在，条数断言防漂移 | 0 |
| B 移除 | 只留指向 AGENTS.md 的链接，删条目列表，改 test.mjs:1232 断言 | 边界更干净；改 2 处 |

**决定**：`☑ A 保持（按推荐，2026-10-24）`

- [x] D-03 已决定

### D-04 · 「kill switch 必须至少演练一次」（docs/04:157）怎么落地（F-16）

drill-check 只有 gate / breaker / verifier 三组，无 pause 组；kill switch 本身有 `isPaused` 实现 + 测试。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 改文字（推荐）** | docs/04 该句改为「kill switch 的机械检查由 `test.mjs` 的 isPaused 断言与 `/harness-loop` 第 0 步实测覆盖」 | 1 行 |
| B 加演练组 | `drill-check.mjs` 增加 pause 组（注入 loop-pause-all → 断言 exit 3 → 移除），`drill-record` 必检清单同步 | 行为变化，需回退测试；更强 |

**决定**：`☑ A 改文字（按推荐，2026-10-24）`

- [x] D-04 已决定

### D-05 · token 预算无计量的说明（F-19）

`--tokens` 默认 0，靠 agent 手填估算；不说明则读者以为预算自动生效。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 文档声明（推荐）** | `/harness-loop` SKILL 第 3 步预算句后补一句「tokensUsed 无自动计量，靠 --tokens 手填；不填则预算永不触发」 | 1 行 |
| B 保持 | 现状 | 误导继续存在 |

**决定**：`☑ A 文档声明（按推荐，2026-10-24）`

- [x] D-05 已决定

---

## 2. 批次 1 · P0（最先做）

### B1-01 · [P0] `/harness-loop` 第 6 步写明工作目录（F-01）

**问题**：第 0 步明说「从主检出目录运行」，此后全文没说何时切目录。gate-check 的 dirty-tree 读 `process.cwd()`、head-sha 默认读当前仓库 HEAD（gate-check.mjs:944 / :935-938）——在主检出跑第 6 步会得到**空 diff 清单**（denylist/scope 空转），两个 sha 若同取主检出 HEAD 还会假 `proceed`。

**方法 1**：`skills/harness-loop/SKILL.md` 第 6 步开头（「先确认工作区干净」段之前）加：

> 本步所有命令（`git status` / `git diff` / `gate-check.mjs`）都在**本次尝试的 worktree 目录**内执行；`--state` 与第 7 步的写状态命令传**主检出**的绝对路径。在主检出执行本步会得到空清单与错误的 head sha，两道安全闸同时失效。

- [x] B1-01a：SKILL.md 第 6 步已加入上述说明

**方法 2**：`skills/harness-loop/SKILL.md` 第 6 步 gate 命令块中 `--state <主检出绝对路径>` 行下补一行注释「命令本身仍在 worktree 内运行」（或并入方法 1 的句子，二选一即可）。

- [x] B1-01b：命令块处已消除「--state 指主检出 = 在主检出运行」的误读

**方法 3**：`scripts/test.mjs` 第 10 节（技能完整性，约 :1146-1151 区域）加一条断言：`ok('harness-loop 写明 gate 命令在 worktree 内执行', /worktree 目录.*内执行|在.*worktree.*内/.test(loop))`。改前该断言红（回退测试成立）。

- [x] B1-01c：断言已加入且改前验证过会红（2026-10-24 实测：FAIL 后改 SKILL 转 PASS，758/0）

**验收**：
- 只读 SKILL.md 的 agent 能回答「gate 命令在哪个目录跑、--state 传什么」；
- `node scripts/test.mjs` 全绿（757+1）。

---

## 3. 批次 2 · P1

### B2-01 · [P1] README 流程图与 SKILL 对齐：熔断预检在执行之前（F-02）

**问题**：README:18 与 :26-27 把 ledger-check 画在 gate-check 之后；SKILL:15 是「熔断预检 → 执行 → …」，REJECT 回第 3 步。按事实优先级 SKILL 正确。

**方法 1**：`README.md` 四个命令表 `/harness-loop` 行（:18）改为「约束 → 选一项 → **熔断预检** → 执行 → 独立验证 → 闸门 → 写状态」。

- [x] B2-01a：命令表行已改（860e2a4）

**方法 2**：`README.md` :26-27 的流程代码块改为：

```
kill switch → 加载约束 → 选定唯一一项 → 熔断预检（ledger-check）
→ 执行者（独立 worktree）→ 验证者（新实例，只拿 diff 与验证命令）→ gate-check
→ 写状态（REJECT → 回熔断预检，达上限即停）
```

- [x] B2-01b：流程图已改，且与 SKILL:15 一致（860e2a4）

**验收**：README 两处与 `skills/harness-loop/SKILL.md:15` 三方能对上；`bash init.sh` 全绿（此项无测试断言，人工比对）。

### B2-02 · [P1] docs/03 的 gate 示例命令补 `--implementer`（F-03）

**问题**：docs/03:158-168 示例在当前代码下**实测退出 1**（缺 `--implementer`），而 :207 声称示例输出「是上面那条命令实际产生的」。

**方法 1**：`docs/03-gates-and-levels.md` 示例命令块中 `--evidence-file verifier-report.md` 之前加一行：`--implementer implementer-1 \`。

- [x] B2-02a：示例命令已补参数（a945ae7）

**方法 2**：在临时目录实测补全后的命令（STATE.md + changed.txt 含 `auth/session.ts`），确认输出仍为文档所贴的 denylist escalate JSON；若有出入，用实测输出替换文档中的 JSON 块。

- [x] B2-02b：命令已实测且输出与文档一致（denylist escalate JSON 逐字段相同，exit 2）

**方法 3**：`scripts/test.mjs` 文档完整性节（第 12 节）加断言：docs/03 的 gate 示例命令含 `--implementer`（如 `ok('docs/03 gate 示例带 --implementer', /--implementer/.test(doc03ExampleBlock))`）。改前红。

- [x] B2-02c：断言已加入且改前验证过会红（758/1 → 759/0）

**验收**：`node scripts/test.mjs` 全绿；手动重跑示例命令退出 2（denylist escalate），不再是退出 1。

### B2-03 · [P1] 阶段 1 产物计数统一为「6 模板 + 生成的 init.sh = 7 个文件」（F-04）

**问题**：harness-init SKILL 正文「创建 6 个文件」的表格把 init.sh 算进 6、漏了 verifier-report.md；代码 `STAGE1_FILES` 是 6 个模板 + init.sh = 7（stage1.mjs:208-218）；test.mjs:1128 把「6 个文件」字样锁进断言。README:16 与 AGENTS.md:86 的「6 个地基文件 + 生成的 init.sh」口径本来就对，不改。

**方法 1**：`skills/harness-init/SKILL.md` :15「创建 6 个文件」→「创建 7 个文件（6 个模板 + 生成的 init.sh）」。

- [x] B2-03a：:15 已改（3043b59）

**方法 2**：同文件 :54「生成 **6 个文件**」→「生成 **6 个模板文件 + 1 个生成的 init.sh（共 7 个）**」，表格补一行 `verifier-report.md | 验证者报告格式模板（闸门按它校验 Author/sha/输出片段）| 一般不用改`。

- [x] B2-03b：表格与标题行已改（补 verifier-report.md 行）

**方法 3**：`skills/harness-init/scripts/stage-core.mjs` :27 的 STAGES[0].goal「创建 6 个地基文件」→「创建 6 个模板文件与生成的 init.sh」；**同步另一份副本** `skills/harness-loop-init/scripts/stage-core.mjs`（逐字节一致）。

- [x] B2-03c：两份 stage-core.mjs 已同步修改（另同步了 harness-stage 头注释 ×2 与 stage2 注释）

**方法 4**：`scripts/test.mjs` :1128 的断言 `/6 个文件/.test(init)` 改为机械校验：`stage1.mjs` 导出 `STAGE1_FILES`，断言 `SKILL 中的数字 === STAGE1_FILES.length + 1`（两份 stage1.mjs 副本同步加 export）。改前：新断言读出 SKILL 写 6 vs 代码 7 → 红（回退测试成立）。

- [x] B2-03d：test.mjs 断言已改为对着代码数（STAGE1_FILES 导出 + eq 校验；改前红 759/1：SKILL 6 vs 代码 7；产出清单也改为由 STAGE1_FILES 派生）

**验收**：`node scripts/test.mjs` 全绿；`grep -rn "6 个文件\|6 个地基" skills/ docs/03-gates-and-levels.md AGENTS.md README.md` 只剩「6 个模板 / 6 个地基文件 + init.sh」这类与 7 对得上的表述。

### B2-04 · [P1] docs/09 对照表更新到当前实现（F-05）

**问题**：docs/09:317-331 声称回退测试 / 未跑必须写明 / TOCTOU 是「弱化版 / 无 commit 绑定」——三者均已是硬闸门（red-check / Checks-not-run / head-commit）；:329 引用不存在的 `post-merge-cleanup`，:331 引用 v1 的「每日 triage」。

**方法 1**：重写第 7 节对照表的这些行——

| 机制 | magpie | harness-loop 现状（改后） |
|---|---|---|
| 回退测试 | … | ✅ 已实现：gate 8 `red-check`，behavior 类强制 `pass` |
| 未跑必须写明 | … | ✅ 已实现：`### Checks not run` 节强制，声明 NOT RUN 的检查必须列入 |
| TOCTOU 防护 | … | ✅ 已实现：gate 7 `head-commit` 绑定 reviewed/head sha |
| 清理循环 | … | ❌ 无对应机制（删去 post-merge-cleanup 的具体引用） |
| 夜审循环 | … | ❌ 无（v1 事件驱动已归档，删去「每日 triage」引用） |

其余行（Seen N× / Done right / 成本分层 / 真实使用验证 / 黑名单）维持现状标记。

- [x] B2-04a：对照表已重写（ef82dba；真实使用验证行也修正为「有约束无闸门」）

**方法 2**：同文件「三个最值得补的缺口」（:333-349）重写——回退测试与「未跑写明」已不是缺口，替换为现存缺口：成本分层（廉价门卫）、夜审 + `Seen N×` 机械棘轮、真机/agent 行为层验证。

- [x] B2-04b：缺口清单已更新（同批更新第 8 节最小复制版本第 5/6 步）

**验收**：`grep -n "弱化版\|post-merge-cleanup\|每日 triage" docs/09-case-magpie.md` 输出为空（或仅剩与已实现机制无关的行，逐条核对）；`bash init.sh` 全绿。

### B2-05 · [P1] docs/04 连接器表与本框架现状对齐（F-06）

**问题**：docs/04:93 允许 GitHub「comment、label」写入，与 harness-loop-issue 的「对 GitHub 只读」硬规则冲突。

**方法 1**：`docs/04-safety.md` 连接器节（:89-104）表格上方加现状说明：

> **本框架现状**：唯一的外部连接是 `/harness-loop-issue` 的 `gh` **只读**访问（不评论、不打标签、不关闭、不合并、不推送）。下表描述的是上游 loop-engineering 的参考做法，供将来接入连接器时对照，**不代表本框架当前能力**。

- [x] B2-05a：现状说明已加（5e3c3c1）

**方法 2**：同表 GitHub 行的「写入」列改为「（参考）comment、label——本框架未启用」。

- [x] B2-05b：表格行已限定

**验收**：docs/04 该节与 `skills/harness-loop-issue/SKILL.md` 的只读规则不再冲突（人工比对）；`bash init.sh` 全绿。

### B2-06 · [P1] 阶段 2 产物口径统一为「4 个文件 + 1 份演练记录」（F-07）

**问题**：README:17 只列 2 个产物；SKILL-loopinit:53 说「3 个文件」、:62 又说「4 个文件 + 1 份演练记录」；实际是 3 个必产物 + 条件生成的 docs/04-safety.md + 手工生成的 loop-drill.json。

**方法 1**：`skills/harness-loop-init/SKILL.md` :53 改为「产出 **4 个文件**（`docs/04-safety.md` 已存在时跳过它，剩 3 个）+ 手工生成的 `loop-drill.json`（判据 7）」，:62 保持「完整产物是 4 个文件 + 1 份演练记录」并在两处之间不再出现第三种数字。

- [x] B2-06a：SKILL 两处口径已统一（53 行 4 文件 + 63 行 4+1）

**方法 2**：`README.md` :17 四个命令表 `/harness-loop-init` 行改为「`loop-ledger.json`、`loop-run-log.md`、`loop-constraints.md`（+ 条件生成的 `docs/04-safety.md` 与演练记录）」。

- [x] B2-06b：README 行已改（列全 3 必产物 + 条件产物与演练记录）

**验收**：README:17、SKILL:53、SKILL:62 三处数字互相咬合（4 文件 + 1 记录，docs/04 条件生成）；`bash init.sh` 全绿。

---

## 4. 批次 3 · P2（按序做，每项一个 commit）

### B3-08 · verdict=none 的闸门行为说明（F-08）

**方法**：`skills/harness-loop/SKILL.md` 第 6 步「先声明改动类型」段前加一句：

> `--verdict` 必须在本步之前取得：`none` 在 gate 阶段一律 escalate（`awaiting-verification`）；且默认 `behavior` + `not-run` 会先被 `red-check` 以「回退测试未跑」拦下——那是误导性原因，真正缺的是验证。

- [ ] B3-08 已完成

**验收**：SKILL 含该说明；`bash init.sh` 全绿。

### B3-09 · 非 behavior 类自动跳过重放的说明（F-09）

**方法**：`skills/harness-loop/SKILL.md` 第 6 步重放段（:218-221「确实无法重跑时用 `--no-replay`」后）补：「`docs`/`config`/`refactor` 类改动**自动**跳过重放并记为 NOT RUN——不必为文档改动硬凑可重放的命令。」

- [ ] B3-09 已完成

**验收**：SKILL 含该说明且与 gate-check.mjs:631-635 行为一致；`bash init.sh` 全绿。

### B3-10 · gate-check.mjs 注释的步骤号纠偏（F-10）

**方法**：`skills/harness-loop/scripts/gate-check.mjs` :407「/harness-loop 第 4 步」与 :439「step 4」改为「第 5 步 / step 5」（验证者输出格式在 SKILL 第 5 步）；**同步另一份副本** `skills/harness-loop-init/scripts/gate-check.mjs`。

- [ ] B3-10 已完成（两份副本都已改）

**验收**：`grep -n "第 4 步\|step 4" skills/*/scripts/gate-check.mjs` 输出为空；逐字节断言全绿。

### B3-11 · [行为变化] gate-check 的 reject 建议补上 attempt 上限分支（F-11）

**问题**：`checkGates` 用 `cfg.maxAttempts`（gate-check.mjs:671），但 DEFAULTS（:30-33）与 main() 的 cfg（:953-957）都没定义它 → 「attempts exhausted — escalate」文案永不出现；SKILL 第 6 步命令也没传 `--attempts`。

**方法 1（先加断言）**：`scripts/test.mjs` 第 5 节（闸门判定）加：`checkGates({ item:'x', phase:'gate', diffFiles:['a.ts'], verdict:'reject', attempts:2 }, {})` 的 `next` 含 `escalate to human|exhausted`。改前红（cfg.maxAttempts 为 undefined）。

- [ ] B3-11a：断言已加入且改前验证过会红

**方法 2（再改实现）**：`gate-check.mjs` 顶部 `import { DEFAULT_BREAKER } from './ledger-check.mjs'`（同技能目录内引用，自包含成立）；main() 的 cfg 增加 `maxAttempts: limits.maxAttempts ?? DEFAULT_BREAKER.maxAttempts`。**同步两份副本**。

- [ ] B3-11b：实现已改（两份副本）

**方法 3**：`skills/harness-loop/SKILL.md` 第 6 步 gate 命令块补 `--attempts <第 3 步输出的 item attempts> \`（使建议文案的输入真实存在）。

- [ ] B3-11c：SKILL 命令已补 --attempts

**验收**：`node scripts/test.mjs` 全绿；手动构造 attempts=2 + reject 的调用，`next` 出现上限升级文案。

### B3-12 · 退出码表补全（F-12 + 补充）

**方法 1**：`README.md` :133 drill-check 行退出码补「1 记录过期（stale）」；:127 harness-stage 行补「2 `--require` 未达成**或跳级保护拒绝**」。

- [ ] B3-12a：README 两行已补

**方法 2**：`docs/02-state-model.md` :198「退出码：`0` = 继续；`2` = 停止」补「`1` = 参数错误（命令写错，不是通过）」（审计补充项，与 docs/05:209-215 对齐）。

- [ ] B3-12b：docs/02 已补

**验收**：三处退出码表述与各脚本 `--help` 的 Exit codes 段一致；`bash init.sh` 全绿。

### B3-13 · CI 凭据扫描删掉已不存在的 `templates/`（F-13）

**方法**：`.github/workflows/self-check.yml` :61 的 grep 目录列表删去 `templates/`。

- [ ] B3-13 已完成

**验收**：本地重跑该 grep（不带 templates/）退出码为 1（无匹配、无错误）：`grep -rEn "(ghp_[A-Za-z0-9]{20,})" --include="*.mjs" scripts/ skills/ docs/; echo $?` → `1`。

### B3-14 · docs/04 kill switch 删「标签」（F-14）

**方法**：`docs/04-safety.md` :149「`loop-pause-all` 标签或 `STATE.md` 标志」→「`STATE.md` / `harness-constraints.md` / `loop-constraints.md` 里独占一行的 `loop-pause-all`（GitHub label **不**触发，本框架无 label 入口——上游原文是 label or flag，此处只实现了文件标志）」。

- [ ] B3-14 已完成

**验收**：docs/04 该行与 gate-check.mjs `stateFiles`（读三个文件）一致；`bash init.sh` 全绿。

### B3-15 · 命令块内的 `#` 注释移出（F-17）

**方法**：`skills/harness-loop/SKILL.md` :210 `--implementer <执行者标识> \   # 必填：…` 的注释移到命令块下方正文（`\` 续行后跟 `#` 会断命令）。

- [ ] B3-15 已完成

**验收**：命令块内无 `#` 注释；`bash init.sh` 全绿。

### B3-16 · worktree 处置改为总是 cleanup（F-18）

**方法**：`skills/harness-loop/SKILL.md` 第 7 步第 4 点改为：

> 处置 worktree：先 `mark --status merged|rejected|escalated`，**然后总是** `cleanup`。已合并进 base 的 merged 与全部 rejected/escalated 会被回收；人工尚未合并的 merged 会被安全跳过（改标 escalated 并提示原因），留待下轮或人工处理——cleanup 从不带 `--force`，不会销毁未提交改动（exit 2 时如实报告）。

- [ ] B3-16 已完成

**验收**：SKILL 表述与 `worktree.mjs` 的 `CLEANUP_STATUSES`（含 merged）及「refusing to delete」分支一致；`bash init.sh` 全绿。

### B3-17 · 预算计量限制声明（F-19，依赖 D-05）

**方法**（若 D-05=A）：`skills/harness-loop/SKILL.md` 第 3 步「预算从 `loop-constraints.md` 的 `## Budget` 段读取；`0` 表示不启用」后补：「预算的 `tokensUsed` 无自动计量——每次 `--append` 时用 `--tokens` 手填估算，不填则恒为 0，预算与 report-only 永不触发。」

- [ ] B3-17 已完成（或 D-05 选 B：勾选此处并写明理由）

**验收**：SKILL 含该声明；`bash init.sh` 全绿。

### B3-18 · kill switch 演练表述（F-16，依赖 D-04）

**方法**（若 D-04=A）：`docs/04-safety.md` :157「kill switch 必须至少演练一次，确认真的能停住」→「kill switch 的行为由 `test.mjs` 的 `isPaused` 断言与 `/harness-loop` 第 0 步的实测覆盖（gate-check 退出 3）」。同文件 `docs/08-glossary.md` 关键数字速查删去「15 | 全局硬约束上限条数」与「5k | 空转退出的 token 上限」两行（无代码入口）。

- [ ] B3-18a：docs/04 已改（或 D-04 选 B：在此实施演练组并勾选）
- [ ] B3-18b：docs/08 两行无入口数字已删

**验收**：`grep -n "15 条\|5k" docs/08-glossary.md` 输出为空；`bash init.sh` 全绿。

---

## 5. 批次 4 · 决策依赖项（§1 决定后执行）

### B4-01 · drill-record 合并进 drill-check（D-01=A 时）

**方法 1（先加断言）**：现有 U-05 演练断言不动（重构无行为变化，全绿即证）。

- [ ] B4-01a：确认现有 U-05 断言覆盖 readRecord/writeRecord/recordStatus 的行为

**方法 2**：`drill-record.mjs` 全部导出移入 `drill-check.mjs`（`RECORD_FILE`/`RECORD_SCHEMA`/`fingerprint`/`readRecord`/`writeRecord`/`recordStatus`）；`stage2.mjs` 的 `import { recordStatus } from './drill-record.mjs'` 改指 `./drill-check.mjs`；删除 `drill-record.mjs`；`scripts/test.mjs` 的 `skillScript` 映射删去 `drill-record.mjs` 条目。

- [ ] B4-01b：合并与引用更新已完成

**验收**：`node scripts/test.mjs` 全绿；`ls skills/harness-loop-init/scripts/` 无 drill-record.mjs；`bash init.sh` 全绿。

### B4-02 · 根 lib 与技能副本逐字节统一（D-02=A 时）

**方法 1（前置）**：`grep -n "TEMPLATE_DIR" scripts/install-skills.mjs` 确认为空（只有 test.mjs 用）。

- [ ] B4-02a：前置确认完成

**方法 2（先加断言）**：`scripts/test.mjs` 的逐字节比对（:1087-1116）把 `scripts/lib/common.mjs` 纳入比对范围。改前红（当前 4 行差异）。

- [ ] B4-02b：断言已加入且改前验证过会红

**方法 3**：`scripts/lib/common.mjs` 删去 `TEMPLATE_DIR`/`LOOP_TEMPLATE_DIR` 两常量（含注释，:14-17），与技能副本一致；`scripts/test.mjs` 顶部改为本地定义 `const TEMPLATE_DIR = path.join(SKILLS_DIR,'harness-init','templates'); const LOOP_TEMPLATE_DIR = path.join(SKILLS_DIR,'harness-loop-init','templates');` 并从 import 列表移除。

- [ ] B4-02c：统一完成

**验收**：`md5sum scripts/lib/common.mjs skills/*/scripts/lib/common.mjs` 五个哈希一致；`node scripts/test.mjs` 全绿。

---

## 6. 收尾（全部批次后）

### E-01 · 全量回归

**方法**：`bash init.sh` 完整跑一遍，记录 Passed 数（应 ≥ 757 + 新增断言数）；`node skills/harness-loop-issue/scripts/state-write.mjs --self-test` 通过。

- [ ] E-01 已跑，输出已记录：Passed = ___

### E-02 · 归档 v1 spec

**方法**：确认 `spec-plan/audit-remediation-spec.md`（v1）所有条目已实施（对照其 §2 批次与 git log），然后 `git rm` 或移入 `docs/archive/`；本文件状态行改为 `已完成`。

- [ ] E-02 已处置（方式：___）

### E-03 · 最终提交

**方法**：工作区干净后用描述性 message 提交本 spec 的最终状态（勾选进度即验收记录）。不推送。

- [ ] E-03 已提交（commit: ___）

---

## 附录 · 验收命令速查

```bash
node scripts/test.mjs                 # 断言套件（基线 757 全绿）
bash init.sh                          # 测试 + pre-commit 安装
md5sum skills/*/scripts/gate-check.mjs skills/*/scripts/ledger-check.mjs \
       skills/*/scripts/stage-core.mjs skills/*/scripts/lib/common.mjs   # 副本一致性（两两相同）
grep -rn "弱化版\|post-merge-cleanup\|每日 triage" docs/09-case-magpie.md # B2-04 后应为空
grep -n "第 4 步\|step 4" skills/*/scripts/gate-check.mjs                 # B3-10 后应为空
```
