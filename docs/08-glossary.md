# 08 · 术语表

本框架中反复出现的概念。按主题分组。

---

## 基础概念

**Harness（运行框架）**
模型权重之外的所有工程基础设施。由五个子系统构成：Instructions、Tools、Environment、State、Feedback。harness 决定模型能力有多少能被真正兑现。

**Harness Engineering（运行框架工程）**
设计单个智能体的运行环境：工具、上下文、权限、规则、验证。目标是让**单次运行可靠**。

**Loop Engineering（循环工程）**
设计一个自动给智能体下达任务的系统，取代人工逐步提示。目标是让**连续运行自主**。

**Loop（循环）**
一个能自我触发的系统：发现任务、派发任务、验证结果、持久化状态。最小形式是「目标 + 验证方法 + 停止条件」。

**Loop Harness**
本框架。harness 五子系统提供单次运行的可靠性，loop 六原语提供连续运行的自主性，issue/PR 事件脊保证两者作用于同一批真实工作。

---

## 五子系统（Harness 层）

| 术语 | 含义 | 最小工件 |
|---|---|---|
| **Instructions** | 项目概览、启动路径、硬约束、完成定义 | `AGENTS.md` |
| **Tools** | agent 能做什么、不能做什么 | 权限配置 + 拒绝列表 |
| **Environment** | 可复现的运行环境 | `init.sh`、锁文件 |
| **State** | 当前进度、证据、下一步 | `feature_list.json`、`STATE.md` |
| **Feedback** | 怎么知道做对了 | 验证命令、`loop-verifier` |

**Repository as System of Record（仓库即真相源）**
所有必要上下文必须落在仓库里。agent 看不到的东西，实际上不存在。

**Entry File（入口文件）**
`AGENTS.md` 的角色：路由器，不是百科。约 100 行，装不下就拆进 `docs/` 按需读取。

**Instruction Bloat（指令膨胀）**
单个巨型指令文件的问题。不是"太长"，而是**无法机械检查覆盖度、新鲜度、归属和交叉引用**，所以必然腐化。

**Reveal on Demand（按需揭示）**
渐进披露：入口只放路由和不变式，细节在主题文档里，agent 按需读取。

**Progressive Disclosure（渐进披露）**
三层结构：Tier 1 元数据（永远在场）→ Tier 2 指令（激活时加载）→ Tier 3 资源（按需）。

**Controlled Variable Exclusion Test（受控消融测试）**
固定模型和任务，一次移除一个子系统，看哪个移除造成的性能下降最大。**只能回答"哪个组件最有价值"，不能回答"瓶颈在哪"。**

---

## 六原语（Loop 层）

**Automation（自动化/调度）**
循环的心跳。没有调度，循环只是你手动跑的一次性运行。形式：`/loop`、cron、GitHub Actions、事件触发器。

**Worktree（工作树）**
`git worktree` 创建的独立检出。每个 agent 一个，物理上无法互相踩。并行隔离的基础设施前提。

**Skill（技能）**
关于**意图**的持久记忆。编码项目约定、构建命令、"我们为什么不那样做"。没有技能，循环每轮都要从头推导一切。

**Connector（连接器）**
基于 MCP 的外部系统访问。让循环能读 issue tracker、开 PR、更新工单，而不只是看文件系统。

**Sub-agent（子智能体）**
被派发的独立智能体实例。关键用途是 maker/checker 分离：执行者与验证者必须是不同实例。

**External State（外部状态）**
跨轮记忆。模型会忘，仓库不会。形式：markdown 文件、issue tracker、看板。

---

## 事件与状态

**Event Spine（事件脊）**
所有循环挂载的单一事件流。issue / PR / CI / merge / release 事件产生 work item，work item 沿状态机流动。

**Work Item（工作项）**
事件产生的处理单元。有 id、阶段、尝试次数、证据链、升级原因。

**Phase（阶段）**
work item 的处理步骤：`intake` / `review` / `fix` / `verify` / `gate` / `post-merge` / `release` / `escalated`。

**acting_on**
多循环冲突避免的锁。每个循环声明正在操作的分支或 PR；派发新任务前检查是否冲突。

**WIP Limit（在制品上限）**
默认 WIP=1。一次只做一个 feature 是安全配置，不是保守。

**VCR（Verified Completion Rate）**
已验证完成率 = passing features / activated features。低于 1.0 说明有未完成的活动项。

**Pass Gate**
从 `in_progress` 到 `passing` 的判定条件：预期工作流已执行、证据已记录、无阻塞错误、未使应用处于损坏或歧义状态。

**State Rot（状态腐化）**
状态文件引用已合并 PR、已关闭工单、陈旧分支。原因是运行结束没清理、运行开始不读状态、多循环无规范写同一文件。

---

## 闸门与等级

**Gate（闸门）**
"允许继续"的条件。六类：拒绝列表、范围、尝试上限、验证、预算、合并。

**Denylist（拒绝列表）**
未经人工批准绝不自动编辑的路径：`.env*`、`secrets/`、`credentials/`、`auth/`、`payments/`、`billing/`、`.terraform/`、`k8s/production/`、`migrations/`。

**Maker/Checker Split（执行者/检查者分离）**
写代码的智能体与验证代码的智能体必须是不同实例、不同指令，最好不同模型。

**Generator/Evaluator Separation（生成者/评估者分离）**
同上，强调这是**循环设计中最重要的一条可靠性保证**。

**Escalation（升级）**
把决策交给人类。**升级是功能，不是失败。** 触发条件：触及拒绝列表、尝试超上限、需要判断。

**Readiness Level（就绪度等级）**
L0 草案 / L1 报告 / L2 辅助 / L3 无人值守。决定循环被允许做什么。

**Kill Switch（紧急停止）**
`loop-pause-all` 标志或标签。每轮开始必须检查。恢复需要人工清除。

---

## 成本与可观测性

**Circuit Breaker（熔断器）**
检测循环陷入无效重试并强制停止。三个阈值：同一错误 3 次、连续失败 5 次、总迭代 10 次。退出码 2 = 停止。

**Ledger（账本）**
`loop-ledger.json`。每次尝试追加一条，失败时必须含 `error`。熔断器靠它检测重复失败。

**Error Signature（错误签名）**
归一化后的错误文本：抹掉时间戳、十六进制地址、路径（折叠为 basename）、行列号、其余数字。使"同一个错误"能被识别。

**Early Exit（提前退出）**
无待办时在 <5k token 内退出。高节奏循环的经济性完全依赖它。

**Run Log（运行日志）**
`loop-run-log.md`。只追加，每轮一条 JSON。`outcome` 枚举：`no-op` / `report-only` / `fix-proposed` / `verified` / `escalated`。

**Outcome**
单轮运行的结果分类。空转率、升级率等指标都从它统计。

---

## 债务与成本

**Intent Debt（意图债务）**
每次会话开始时 agent 都没有先前上下文，缺失的意图会被自信的猜测填补。**技能是偿还意图债务的方式。**

**Comprehension Debt（理解债务）**
仓库中实际存在的内容与你真正理解的内容之间的差距。循环越快，交付的非你亲手编写的代码越多，这个差距越大。

**Verification Debt（验证债）**
"看起来没问题"取代了"确认正确"。停止条件必须机器可判定。

**Cognitive Surrender（认知让渡）**
让循环持续运行，自己却不再作判断。用循环放大思考 vs 用循环逃避思考——循环分不清，你分得清。

**Token Blowout（token 爆炸）**
每轮累积上下文，prompt 规模近似二次增长。从第一个循环就要做上下文管理。

**Orchestration Tax（编排税）**
协调并行智能体的人力成本：审查能力、合并冲突、上下文切换。**review 带宽是天花板，判断力是串行资源。**

---

## 结构性概念

**Anchor（锚）**
把循环钉回现实世界的机制：真实业务结果、ground-truth 数据集、人工抽检。图设计中最容易被跳过、又最不能省的一环。

**Goodhart 失效**
指标被推爆后不再度量原意。对策：加 anchor。

**Blindness Upward（向上盲区）**
循环内参考值神圣不可质疑。**单循环结构中不存在能提出这个问题的位置。**

**Graph Engineering（图工程）**
单循环在规模化下长出为图：节点、边、共享状态、路由规则。判据：至少满足 3 条才值得建图——任务可拆成独立单元、存在分支或回滚、中间状态值得保存、结果可显式验证、协调收益 > 协调成本。

**Four-Layer Stack（四层栈）**
Prompt Engineering（指令）→ Context Engineering（信息）→ Loop Engineering（运行时）→ Graph Engineering（系统）。

---

## 关键数字速查

| 数字 | 含义 |
|---|---|
| 3 | 同一事项最大自动尝试次数 |
| 5 | 单次修复最大改动文件数 |
| 10 | 清理类 PR 需人工审批的文件数阈值 |
| 80% | 预算降级为 report-only 的阈值 |
| 100% | 预算立即退出的阈值 |
| 3 / 5 / 10 | 熔断阈值：同一错误 / 连续失败 / 总迭代 |
| 100 | `AGENTS.md` 建议行数 |
| 50–150 | 主题文档建议行数 |
| 15 | 全局硬约束上限条数 |
| 38 / 58 / 78 | 就绪度评分阈值：L1 / L2 / L3 |
| 5k | 空转退出的 token 上限 |

---

## 相关阅读

- 心智模型 → [00-mind-model.md](00-mind-model.md)
- 事件脊 → [01-event-spine.md](01-event-spine.md)
- 状态模型 → [02-state-model.md](02-state-model.md)
