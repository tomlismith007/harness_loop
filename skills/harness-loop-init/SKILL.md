---
name: harness-loop-init
description: >-
  Stage 2 of harness building: install the loop mechanism — constraints that are actually
  enforced, an independent verifier, and a circuit breaker with a ledger. Assembles the
  loop documents stage 1 deliberately does not produce (LOOP.md, loop-budget.md,
  loop-run-log.md, session-handoff.md, loop-ledger.json). Use when a project has passed
  stage 1 but its constraints are still just documentation and verification is still
  self-assessed. Requires stage 1 COMPLETE; do not run it on a project that has not.
  Produces enforced constraints, a working verifier, and a circuit breaker.
license: MIT
user_invocable: true
stage: 2
requires_stage: 1
---

# Stage 2 · 装配 loop 机制（Loop Init）

**目标**：梳理并强化 harness 文件与机制，让**验证真的有效、约束真的被强制执行**。

阶段 1 让文件存在，阶段 2 让文件**起作用**。

对应等级 **L2**：在 worktree 中提出修复，独立 verifier 验证；合并仍需人工。

## 前置检查

```bash
node scripts/harness-stage.mjs <target>
```

阶段 1 必须是 COMPLETE。**没到就别进阶段 2**——没有状态文件，verifier 无法判断改动 scope。

## 判据（6 项机械 + 3 项人工）

| # | 判据 | 类型 | 检查方式 |
|---|---|---|---|
| 1 | 独立 verifier 已装到**可发现路径** | 机械 | 技能在 `.agents/skills/` 或 `.zcode/skills/` |
| 2 | 约束技能已装到可发现路径 | 机械 | 同上——约束技能没被加载，约束就只是文档 |
| 3 | 熔断器就位 | 机械 | `loop-guard` 技能**且** `loop-ledger.json` 存在 |
| 4 | 验证命令是真实的 | 机械 | `init.sh` 无占位符 |
| 5 | **拒绝列表已本地化** | 机械 | 与模板原文**有实质差异**（增删过路径） |
| 6 | 就绪度评分 ≥ 58 | 机械 | `loop-audit.mjs` |
| 7 | **回退测试被实际执行过** | **人工** | 有命令与输出为证 |
| 8 | **NOT RUN 声明被实际使用过** | **人工** | 有报告为证 |
| 9 | triage 准确率 > 70% | **人工** | 逐条对比 |

**为什么人工判据占一半**：grep 分不清「我们确实会这么做」和「有人抄过这句话」。阶段 1 的模板出厂时就带着"回退测试""NOT RUN"这些字样——拿它们当机械判据，阶段 2 会永远自动变绿。判断力无法被 grep 替代，标成人工项比让它假绿诚实。

**判据 1–3 检查"技能在不在 agent 会扫描的路径下"**，不是"文件在不在"。`<repo>/skills/` 是个陷阱：文件看起来到位了，但没有任何 agent 会发现它。

## 执行

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 2
```

补齐两类产物。

**loop 机制文档**（阶段 1 刻意不产出的那 5 个）：`LOOP.md`、`loop-budget.md`、`loop-run-log.md`、`session-handoff.md`、`loop-ledger.json`。

**技能**（4 个，全部装到 `.agents/skills/`）：`harness-loop-init`（自己）、`loop-guard`、`minimal-fix`、`loop-verifier`。

**手工改一处**：`loop-constraints.md` 的拒绝列表要按本仓库实际路径增删（判据 5）。阶段 1 留下的是模板原文，`gate-check` 会真的读它——它必须是真的。

## 核心：为什么 verifier 是阶段 2 的关键

阶段 1 的文件让 agent **知道**该怎么做；verifier 让 agent **不能**糊弄过去。

没有 verifier，`AGENTS.md` 里的"完成定义"只是一句话——agent 可以声称自己完成了。有了独立 verifier，"完成"由外部证据判定。

**这不是可选项。** 写代码的模型给自己打分系统性偏高，这不是诚实问题，是生成模型的性质：它在生成过程中说服了自己这条路径正确，回头看时看到的是自己的推理过程，不是错误。

### 三条结构性前提（缺一不可）

1. **独立实例**——不是执行者的同一会话
2. **反向指令**——"找出拒绝的理由"，不是"确认它是对的"
3. **不参与实现**——verifier 不得写代码

违反任一条，这次验证在结构上无效。

### 强化 verifier 的检查项

基础版（阶段 2 最低要求）：

- Scope：只改相关文件，无拒绝列表路径
- Intent：针对声明的问题，不是别的
- Tests：**实际运行**，报告输出片段
- No cheating：没有禁用的测试、跳过的断言
- Risk：中等以上风险建议人工审查

强化版（magpie 引入的三项）：

| 检查 | 要求 |
|---|---|
| **回退测试** | 新增测试必须能在修复前的代码上真的挂掉，失败信息要指出是哪个行为错了。编译不过、被跳过、测试通过——都不算 |
| **NOT RUN 声明** | 报告必须区分 PASS / FAIL / NOT RUN 三态，不允许"没提" |
| **真机验证** | 改了厂商接入必须真账号真配置实测；没实测过的功能不许在上面开发，也不许跟用户说能用 |

## 强化约束的执行力

**约束文件存在 ≠ 约束被执行。** 判据 3 专门检查这一点。

机制：

1. `loop-constraints` 技能在每轮开始加载，输出确认行 `Constraints loaded from loop-constraints.md: N rules active.`
2. 每个动作前复核对应章节（推送前复核 Push & Merge，编辑前复核 Paths）
3. 命中拒绝列表 → 立即升级，**不执行任何编辑**

**若约束只是文档、没有技能加载它，agent 不会主动读。** 这就是判据 3 存在的理由。

## 强化熔断

判据 4 要求熔断机制存在。三个阈值：

| 类型 | 默认 | 含义 |
|---|---|---|
| `stagnation` | 3 | 同一错误签名出现 3 次 |
| `no-progress` | 5 | 连续失败 5 次 |
| `max-iterations` | 10 | 总迭代上限 |

**错误签名归一化**是关键：抹掉时间戳、十六进制地址、路径（折叠为 basename）、行列号、其余数字。这样 `TypeError at profile.ts:42` 与 `TypeError at profile.ts:87` 会被识别为同一个错误。

**如果第 2、3 次尝试的错误归一化后与第 1 次相同，说明根本没触及根因。** 此时继续重试是纯浪费。

## 三项必须人工确认的动作

脚本只能检查结构，判断不了行为。以下三项无法机械判定——**它们检查的是"做过"，不是"写过"**。

### 1. 确认回退测试被实际执行过

至少一次真实修复里：把修复代码临时回退，跑新增的测试，**它必须失败，且失败信息指出是哪个行为错了**。

证据：把那次运行的命令与输出记进 `STATE.md`。

以下不算：测试编译不过、测试被跳过、测试通过（说明它抓不到这个 bug）。

### 2. 确认 NOT RUN 声明被实际使用过

至少一份验证报告把没跑的检查**列为 NOT RUN**，而不是省略不写。

证据：该报告记进 `STATE.md`。

**为什么这条重要**：省略会让读者以为检查通过了，写明则把决定权交还给读者。成本极低，但防止一整类沉默的失职。

### 3. 把拒绝列表改成真实路径

检查模板内容是否还留着：

```bash
grep -E "auth/|payments/|billing/" loop-constraints.md
```

若这些路径在本仓库不存在，删掉；若存在本仓库特有的高危路径，加上。

**判据 5 检查的是"与模板有实质差异"**，不是"有没有那句话"。直接复制模板不算本地化。

### 4. 跑满一周 L1，逐条对比 triage 判定

做法：

1. 每天读 `STATE.md` 的 High Priority
2. 逐条问自己：我同意这个判定吗？
3. 记录：同意 / 不同意（噪声）/ 漏了（它没发现但重要）
4. 一周后算准确率

**准确率 = 同意条数 / 总条数。**

不达 70% → 收紧 triage 技能规则（把噪声类加进 `Noise / Ignore`，把漏掉的信号加进检查项），重跑一周。

**不要带着不达标的 triage 进阶段 3。** 误报率高时，自动修复会在错误目标上烧钱，并消耗人对系统的信任——信任一旦消耗，团队会静音机器人，那是所有升级机制失效的终点。

## 依据

| 来源 | 内容 |
|---|---|
| **LHE** 受控消融 | 一次移除一个子系统，量化哪个最有价值。**只能回答"哪个组件最有价值"，不能回答"瓶颈在哪"**——瓶颈靠失败归因 |
| **LHE** 三层终止校验 | 语法静态 → 运行时行为 → 系统级；前一层失败不进下一层 |
| **LHE** 架构规则可执行化 | 重复的 review 意见提升为机械规则；错误信息含 what / why / fix |
| **LEC** maker/checker | 模型是自己输出的最佳辩护律师 |
| **LEC** 熔断 | 3 / 5 / 10 |
| **magpie** | 回退测试、NOT RUN、真机验证 |

## 退出条件

```bash
node scripts/harness-stage.mjs <target> --stage 2 --require
# 退出码 0 = 6 项机械判据全过
```

**加上三项人工确认**：回退测试执行过、NOT RUN 用过、triage 准确率 > 70%。

## 常见错误

| 错误 | 后果 |
|---|---|
| verifier 与执行者同会话 | 结构性无效 |
| verifier 指令是"确认它是对的" | 系统性放行问题 |
| 拒绝列表还是模板内容 | 真实高危路径没被保护 |
| 只声明回退测试但从不执行 | 装饰性测试混进来 |
| 跳过人工确认直接进阶段 3 | 误报导致烧钱与失去信任 |
| 熔断阈值被临时放宽 | 拆掉熔断器；升级是功能，不是失败 |

## 下一步

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 3
```

读 `docs/11-three-stages.md` 的阶段 3 章节。
