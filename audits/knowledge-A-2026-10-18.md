# 知识卡 A — walkinglabs/learn-harness-engineering

- 仓库：https://github.com/walkinglabs/learn-harness-engineering
- commit：`38ddcd2bf8d65271f668b94e7c875ca1d629d622`（2026-10-01，Sanbu 散步）
- 读取日期：2026-10-18
- 读取范围：`README.md`、`CLAUDE.md`、`docs/en/lectures/lecture-01..14/index.md`、`docs/en/projects/project-07`、`docs/en/resources/{reference,templates}`、`skills/harness-creator/**`、`tools/audit-harness.sh`、`scripts/validate-*`（见来源清单）。
- 未读：`projects/project-01..06` 的 Electron 应用代码（374 个 ts/tsx 文件）、15 种语言的译文、`docs-readme/**`、PDF 构建脚本。这些与机制无关，下文不引用。

引用格式：`A@38ddcd2:<路径>:<行号>`。所有结论只来自实际读到的文件；推断处标 **[推测]**。

---

## 1. 五子系统 harness 模型

| 项 | 内容 |
|---|---|
| 概念名 | Harness 五子系统：Instructions / Tools / Environment / State / Feedback |
| 解决的失败模式 | 把"prompt 文件"误当成 harness；模型能力足够但执行不可靠 |
| 机制 | 纯文字 + 模板。`harness-creator/SKILL.md` 给出"子系统 → 最小工件"映射；`templates/agents.md` 落地 Instructions/State/Verification；`validate-harness.mjs` 按五个子系统各 5 条检查打分 |
| 强制程度 | 约定（文档模型）+ 仅建议（评分脚本，默认 `--min-score 70` 才非零退出） |
| 前提条件 | 无。任何仓库都能套 |
| 成本 | 5 个模板文件；评分脚本约 430 行（`harness-utils.mjs`） |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-02-what-a-harness-actually-is/index.md:38-71；A@38ddcd2:skills/harness-creator/SKILL.md:20-30；A@38ddcd2:skills/harness-creator/scripts/validate-harness.mjs:15-43 |

关键细节：五子系统在课程里是 **instructions / tools / environment / state / feedback**（L02），而 `harness-creator` 的评分维度是 **instructions / state / verification / scope / lifecycle**（`harness-utils.mjs:8`）。两套划分不同名，不能混用。我的仓库 `docs/00-mind-model.md:36-45` 用的是第一套；`README.md:178` 说 A 提供"五子系统"，成立。

---

## 2. 渐进式披露 / 路由式 AGENTS.md

| 项 | 内容 |
|---|---|
| 概念名 | 入口文件是路由器，不是百科；50–200 行；主题文档按需读 |
| 解决的失败模式 | 巨型指令文件：上下文预算被吃、关键约束落在中段被忽略（Lost in the Middle）、优先级冲突、维护腐化、规则互相矛盾 |
| 机制 | 纯文字 + 模板 + 审计正则。`audit-harness.sh` 检查入口文件行数 50–200、是否链接 `docs/`、是否标注 `source:`/`why:` |
| 强制程度 | 仅建议（审计项是 RECOMMENDED，不影响退出码） |
| 前提条件 | 主题文档真的存在，否则路由指向空 |
| 成本 | 入口 50–200 行 + 每主题 50–150 行 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-04-why-one-giant-instruction-file-fails/index.md:30-37,60-96；A@38ddcd2:tools/audit-harness.sh:140-149 |

A 自己引用的反证：ETH Zurich 的研究称仓库级上下文文件在其评测设置中**没有普遍提升成功率**，反而让推理成本上升 20%+；另一项 124 任务的配对研究只测到运行时间 −28.64%、输出 token −16.58%，且明确"功能正确性不在研究范围内"（`lecture-04:102-104`）。这是"短文件更好"这一主张的重要限定。

---

## 3. feature_list.json：三元组 + 状态机 + pass-state gating

| 项 | 内容 |
|---|---|
| 概念名 | 每条 feature = (行为描述, 验证方法, 当前状态)；四态 `not_started/active/blocked/passing`；状态迁移由 harness 控制，agent 不能自己置 passing |
| 解决的失败模式 | agent 不知道"done"是什么意思；过早宣称完成；范围蔓延；跨会话状态丢失 |
| 机制 | 模板 + JSON Schema + 审计 grep + 课程示例脚本（`scripts/verify-feature.sh` 在外部模板仓库，不在本仓库） |
| 强制程度 | 约定。`feature-list.schema.json` 只定义形状，仓库内没有任何脚本执行 schema 校验；`audit-harness.sh` 用 `grep '"id"' && grep '"behavior"' ...` 判断字段存在 |
| 前提条件 | 有一条真正可执行的验证命令；否则 passing 仍是自评 |
| 成本 | 1 个模板 + 1 个 schema；每条 feature 4 个字段 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-08-why-feature-lists-are-harness-primitives/index.md:32-55,59-77,81-107；A@38ddcd2:skills/harness-creator/templates/feature-list.schema.json:1-50；A@38ddcd2:tools/audit-harness.sh:213-226,349-371 |

**理念 vs 机制**：L08 说 feature list 是"primitives，agent 无法绕过"（`:68-70`），但仓库里能强制它的只有审计脚本的 grep。`verify-feature.sh` 在 README 里被引用为外部链接（`audit-harness.sh:353-355`），本仓库没有实现。所以"pass-state gating"在 A 是**理念 + 检查清单**，不是机器强制。

---

## 4. init.sh：标准启动 / 验证入口

| 项 | 内容 |
|---|---|
| 概念名 | 初始化是独立阶段；`init.sh` 是唯一启动与验证路径；多栈自动检测 |
| 解决的失败模式 | 每会话重新发现环境；基线坏着还叠新工作；初始化与实现混在一起导致基础设施不牢 |
| 机制 | 脚本生成 + 模板。`create-harness.mjs` 按 `package.json`/`pyproject.toml`/`go.mod`/`Cargo.toml`/`pom.xml`/`build.gradle`/`.csproj` 生成命令；模板 `init.sh` 打印启动命令，`RUN_START_COMMAND=1` 才真的启动 |
| 强制程度 | 约定（AGENTS.md 要求每次会话先跑）；生成脚本会 `chmod +x` |
| 前提条件 | 项目有可检测的清单文件；否则生成 `echo "No package manifest detected..."` 占位 |
| 成本 | 1 个脚本；模板 28 行 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-06-why-initialization-needs-its-own-phase/index.md:22-39,65-127；A@38ddcd2:skills/harness-creator/scripts/create-harness.mjs:36-64；A@38ddcd2:skills/harness-creator/scripts/lib/harness-utils.mjs:143-210；A@38ddcd2:docs/en/resources/templates/init.sh:1-28 |

注意：`create-harness.mjs` 生成的是**命令清单**，不保证命令真的能跑；课程用"初始化验收清单"（`make setup` 成功、至少一个测试通过、新会话能回答怎么跑/怎么测、任务清单存在、已提交）来验收（`lecture-06:120-127`）。验收是人工的。

---

## 5. 清洁交接：progress / handoff / clean-state checklist

| 项 | 内容 |
|---|---|
| 概念名 | 会话结束必须留下可仅凭仓库恢复的状态：进度日志、交接单、干净状态五维检查 |
| 解决的失败模式 | 熵增；下一会话前 30 分钟用于猜上一会话做了什么；未验证代码被当成已完成 |
| 机制 | 模板（`progress.md`、`session-handoff.md`、`clean-state-checklist.md`）+ AGENTS.md 的 End of Session 段 |
| 强制程度 | 仅建议/约定。没有脚本检查这些文件的内容；`validate-harness.mjs` 只在评分里给"文件存在 + 结构化标题"分 |
| 前提条件 | agent 真的在结束时写；没有机制保证 |
| 成本 | 3 个模板文件 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md:30-46,93-104；A@38ddcd2:docs/en/resources/templates/clean-state-checklist.md:1-8；A@38ddcd2:docs/en/resources/templates/session-handoff.md:1-30；A@38ddcd2:skills/harness-creator/scripts/lib/harness-utils.mjs:258-264 |

清洁状态五维（L12）：build 通过、tests 通过、feature list 已更新、无调试残留、启动路径可用。A 的"clean state is a necessary condition for completion"是纯文字规则。

---

## 6. 端到端验证与三层终止校验

| 项 | 内容 |
|---|---|
| 概念名 | 只有完整流水线跑过才算验证；三层：静态/语法 → 运行时行为 → 系统级 E2E；错误信息要给修复指令 |
| 解决的失败模式 | 单元测试全绿但组件边界缺陷；agent 过早宣称完成；重试变成盲猜 |
| 机制 | 纯文字 + 模板 + 示例 grep 规则。`evaluator-rubric.md` 给 6 维 0–2 分；`audit-harness.sh` 检查 Makefile 是否有 `e2e`/`check-arch` target、是否有 `.harness/arch-rules.json` |
| 强制程度 | 仅建议。没有任何脚本执行三层校验；审计只检查文件/target 是否存在 |
| 前提条件 | 项目真的有 E2E 套件；否则第 3 层无法执行 |
| 成本 | 每层一条命令；rubric 1 个文件 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-09-why-agents-declare-victory-too-early/index.md:20-35,98-106；A@38ddcd2:docs/en/lectures/lecture-10-why-end-to-end-testing-changes-results/index.md:84-117；A@38ddcd2:tools/audit-harness.sh:408-443；A@38ddcd2:docs/en/resources/templates/evaluator-rubric.md:1-24 |

L09 还给出"错误信息必须含 what/why/fix"的格式（`:107-113`），这是 OpenAI 实践的直接引用，不是 A 的实测。

---

## 7. 可观测性：运行时信号 + 过程工件

| 项 | 内容 |
|---|---|
| 概念名 | 两层可观测性：runtime（日志/trace/健康检查）与 process（sprint contract、evaluator rubric） |
| 解决的失败模式 | 无法区分"正确"与"看起来正确"；评价变成玄学；重试盲目 |
| 机制 | 纯文字 + 模板。sprint contract 与 rubric 是文档模板；OpenTelemetry 只是建议 |
| 强制程度 | 仅建议 |
| 前提条件 | 有评分维度可定义；主观任务上 rubric 仍需人工校准（A 自己说"plan for 3-5 tuning rounds"，`resources/templates/index.md` evaluator-rubric 段） |
| 成本 | 每任务一份 contract；rubric 1 个文件 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-11-why-observability-belongs-inside-the-harness/index.md:38-63,85-119；A@38ddcd2:docs/en/resources/templates/evaluator-rubric.md:1-24 |

A 明确承认 evaluator 会"identify reasonable issues, then talk themselves into dismissing them"（L11:144），修复办法是读 evaluator 日志、按分歧点改 prompt，迭代数轮。这与我仓库"验证者作秀"的失效模式同源。

---

## 8. audit-harness.sh 的检查项

| 项 | 内容 |
|---|---|
| 概念名 | 零依赖 shell 审计：五子系统 + L03/L05/L07/L08/L09/L10/L11/L12 的 75 项检查 |
| 解决的失败模式 | 仓库"看起来有 harness"但缺关键件 |
| 机制 | bash 脚本，7 项 CRITICAL + 68 项 RECOMMENDED（`grep -c` 实测：`check_critical` 7 次、`check_recommended` 68 次）。CRITICAL 失败 → exit 1 |
| 强制程度 | 机器强制（退出码），但检查内容是**文件存在 + 正则命中**，不是行为 |
| 前提条件 | 无 Node；bash + grep + find |
| 成本 | 1 个 545 行脚本；无依赖 |
| 出处 | A@38ddcd2:tools/audit-harness.sh:111-509；命令输出：`grep -c 'check_critical ' = 7`、`grep -c 'check_recommended ' = 68` |

检查项分组（实测 `grep '^header'`）：Instructions、Tools、Environment、State、Feedback、L05 Continuity、L03 System of Record、L07 WIP=1/VCR、L08 Feature List、L09 Premature Completion、L10 E2E/Arch、L11 Observability、L12 Clean State。

**关键局限**：VCR 用 `grep -c '"state": "active"'` 数 JSON 文本（`:316-331`）；feature_list 字段检查是 `grep '"id"'` 等（`:223-225`）。任何包含这些字符串的文件都会通过，包括注释或示例。这是"形状检查"，不是 schema 校验。

---

## 9. harness-creator 的校验脚本

| 项 | 内容 |
|---|---|
| 概念名 | 五子系统各 5 条检查，总分 0–100，bottleneck = 最低子系统 |
| 解决的失败模式 | 没有量化手段判断 harness 哪个子系统最弱 |
| 机制 | `validate-harness.mjs` → `scoreHarness()`；`structuredText()` 只保留标题/列表/表格/粗体行，防止"把关键词撒在段落里刷分"；`jsonFeatureList()` 真的 JSON.parse 并检查字段 |
| 强制程度 | 机器强制（`--min-score` 默认 70，低于则 exit 1），但只读 7 个根文件，不执行任何验证命令 |
| 前提条件 | 文件在仓库根；`AGENTS.md` 或 `CLAUDE.md` |
| 成本 | 4 个脚本 + 7 个 reference + 5 个模板；约 900 行 JS |
| 出处 | A@38ddcd2:skills/harness-creator/scripts/lib/harness-utils.mjs:220-334；A@38ddcd2:skills/harness-creator/scripts/validate-harness.mjs:15-43 |

`structuredText` 的反作弊设计值得借鉴：它把围栏内的行**排除**（`:305`），避免模板自带的示例满足判据。我的 `common.mjs:354-374` 做了同样的事（围栏内跳过），说明这条已经吸收过。

`jsonFeatureList` 只检查 `id/name/description/status` 四个字段（`:321-334`），**不检查 `evidence`**；而 `audit-harness.sh` 检查 `evidence` 字段存在（`:349-351`）。两个工具的口径不一致。

---

## 10. L13：从手动提示到自治循环

| 项 | 内容 |
|---|---|
| 概念名 | `/goal` = 目标 + 验证方法 + 停止条件；六原语（automations/worktrees/skills/connectors/sub-agents/external state）；maker/checker 分离；四沉默成本；五级成熟度阶梯 |
| 解决的失败模式 | 人始终在循环内；agent 自评；循环规模化后验证债/理解腐化/认知让渡/token 爆炸 |
| 机制 | 纯文字（课程）。给出的"loop"实现是宿主命令（`/goal`、`/loop`、cron、Actions），仓库本身不提供调度器 |
| 强制程度 | 仅建议 |
| 前提条件 | 宿主支持调度；有可机器判定的停止条件 |
| 成本 | 507 行课程 + 1 个项目 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-13-loop-engineering/index.md:16-87,151-257,282-300,401-419,459-469 |

关键论述：
- 四种循环类型：turn-based / goal-based / time-based / event-driven（`:57-64`）。
- `/goal` vs `/loop` 的判别："这件事有终点吗？"（`:81-84`）。
- maker/checker："模型是自己输出的最佳辩护律师"（`:290-300`）。
- 成熟度阶梯 L1 Goal Runner → L5 Fleet Orchestration（`:459-469`）。
- 四沉默成本：verification debt / comprehension rot / cognitive surrender / token blowout（`:401-419`）。

A 的六原语与 B 的"五原语 + 记忆"是同一个来源（Addy Osmani），但 A 把它数成六个（`:160-176`），B 的 `docs/primitives.md` 标题写成"Five Primitives + Memory"、`docs/concepts.md` 写成"Six Primitives"（见知识卡 B）。**两个参考仓库自己都不一致**；我的 README 采用"六原语"，需要注明是哪一种数法。

---

## 11. L14：从单循环到图工程

| 项 | 内容 |
|---|---|
| 概念名 | 四层栈 prompt → context → loop → graph；图的四部件（nodes/edges/shared state/routing）；单循环三种结构失败（Goodhart / 向上盲区 / 冲突）；anchors；五条"是否值得画图"准则；orchestration tax |
| 解决的失败模式 | 单循环在规模化后指标失真、无法质疑目标、多循环互斗 |
| 机制 | 纯文字 + 一个 LangGraph 参考实现（`code/maker_checker_graph.py`，未读） |
| 强制程度 | 仅建议 |
| 前提条件 | 任务可分解、有分支/回滚、中间状态值得保存、结果可验证、协调收益 > 成本（五准则，至少满足三条） |
| 成本 | 349 行课程；一个图引擎依赖 |
| 出处 | A@38ddcd2:docs/en/lectures/lecture-14-graph-engineering/index.md:20-43,45-82,106-139,270-296 |

关键论述：
- "A loop is a graph with one node"；图的节点可以是完整 agent，边可以动态路由（`:141-167`）。
- 单循环的三个结构失败来自 eigent 的博客，不是 A 的实测（`:106-139`）。
- "Anchors"：把循环钉回真实结果（人工抽检、ground-truth），最容易跳过（`:137-139`）。
- Orchestration tax：并行 agent 变多，但人的判断是串行资源（`:278-284`）。
- 五准则：独立分解 / 有分支或回滚 / 中间状态值得保存 / 结果可验证 / 协调收益 > 成本（`:288-296`）。

**对我的 skill 的直接含义**：我的循环是单节点 maker-checker，按 L14 的准则不需要图。L14 里真正可借的是"verify 节点必须有全新上下文"（`:210-213`）和"checkpoint after every step"（`:243-248`），而不是节点/边编排。

---

## 12. 其他可迁移条目

| 概念 | 机制 | 强制 | 出处 |
|---|---|---|---|
| ACID 状态管理（Atomicity/Consistency/Isolation/Durability） | 纯文字 | 仅建议 | A@38ddcd2:docs/en/lectures/lecture-03-why-the-repository-must-become-the-system-of-record/index.md:94-101 |
| WIP=1 + VCR（passing/activated） | 纯文字 + 审计 grep 数 JSON 文本 | 仅建议 | A@38ddcd2:docs/en/lectures/lecture-07-why-agents-overreach-and-under-finish/index.md:74-101；A@38ddcd2:tools/audit-harness.sh:301-331 |
| quality document（按模块 A–D 打分） | 模板 | 仅建议 | A@38ddcd2:docs/en/resources/templates/quality-document.md:1-43；lecture-12:114-136 |
| harness 简化（每月关一个组件跑基准） | 纯文字 | 仅建议 | A@38ddcd2:docs/en/lectures/lecture-12-why-every-session-must-leave-a-clean-state/index.md:138-148 |
| context anxiety / compaction vs reset | 纯文字 | 仅建议 | A@38ddcd2:docs/en/lectures/lecture-05-why-long-running-tasks-lose-continuity/index.md:14-20,134-146 |
| gotchas（15 条非显然失败模式） | reference 文档 | 仅建议 | A@38ddcd2:skills/harness-creator/references/gotchas.md:1-220 |
| 四类上下文操作 SELECT/WRITE/COMPRESS/ISOLATE | reference 文档 | 仅建议 | A@38ddcd2:skills/harness-creator/references/context-engineering-pattern.md:14-60 |
| 失败模式 → 首选工件映射 | 表格 | 仅建议 | A@38ddcd2:docs/en/resources/reference/method-map.md:6-13 |

---

## 该仓库自己承认的局限与风险

1. **教学数字不是实测**。多篇课程在示例前明确标注 "Teaching illustration: this scenario and its numerical values are assumed for explanation, not observations from a published experiment"（L07:105、L09:118、L12:77、L13:91、L14:370）。引用这些数字时必须带这条限定。
2. **A 自己没有熔断器、账本、就绪度评分**。`grep -rn 'circuit.?breaker|loop-ledger|readiness score'` 在 `.mjs/.sh` 中无命中；唯一的 "circuit breaker" 出现在讲 Claude Code compaction 的 harness-design 文章里。所以我的 README 把这些归给 B 是对的，归给 A 就是错的。
3. **审计是形状检查**。`audit-harness.sh` 与 `validate-harness.mjs` 都只读文件内容，不执行项目验证命令；一个把关键词写进注释的空壳仓库可以通过大部分 RECOMMENDED 项。
4. **两套五子系统命名不一致**（L02 vs harness-creator 评分维度），课程没有解释差异。
5. **证据是混合的**。L04 自己引用 ETH Zurich 的反证（上下文文件没有普遍提升成功率、成本 +20%）和一项只测效率不测正确性的配对研究；L09/L11 引用的 Anthropic 数据是"reported application comparison, not an equal-budget experiment"。
6. **`verify-feature.sh` / `check-arch.sh` / `session-trace.sh` 不在本仓库**，审计脚本却把它们列为 RECOMMENDED 检查项，并给外部模板仓库链接（`audit-harness.sh:353-355,421-424,458-461`）。"检查项存在"不等于"机制在本仓库里"。
7. **L13/L14 是二手综述**。其中的事实性主张（三人同周、+18%/−85% 假数字、LangGraph 65M 下载）都来自外部链接；L14 自己做了事实核查并否定了部分营销数字（`:14,274`）。
