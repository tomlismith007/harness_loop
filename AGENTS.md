# AGENTS.md

Loop Harness 的入口文件。这是一个**路由器，不是手册**——这里只放启动路径、工作规则、完成定义和去向链接。细节在 `docs/` 与 `skills/` 里按需读取。

## 项目概览

Loop Harness 是一套让编码智能体围绕 issue/PR 事件持续、可靠工作的工程框架。它由三层组成：harness 五子系统（地基）、loop 六原语（运行层）、issue/PR 事件脊（脊柱）。产物是可复制的技能包 + 模板 + 脚本。

## 启动工作流

写任何代码之前，按顺序执行：

1. `pwd` 确认工作目录是仓库根。
2. 读 `loop-constraints.md` —— **约束是绑定的，必须在任何动作之前加载**。输出一行确认：`Constraints loaded: N rules active.`
3. 读 `STATE.md` 了解当前活动、人类收件箱、上次运行时间。
4. 读 `LOOP.md` 了解本仓库注册了哪些循环、事件如何路由。
5. 读 `loop-budget.md` 与 `loop-run-log.md` 近 24h 条目，确认没有超预算、没有 `loop-pause-all`。
6. 跑 `bash init.sh`（若目标项目有）确认环境健康。基线失败先修基线，不要在坏状态上叠新工作。
7. 若本轮是响应某个事件：跑 `node scripts/event-router.mjs --event <事件名>` 拿到阶段与技能。

## 工作规则

- **一次只做一个 work item。** 从事件路由结果或 `STATE.md` 高优先级区选恰好一个，直到它被验证或被显式标记为阻塞。
- **不跑验证命令，不得宣称完成。** 完成由证据判定，不由代码写完判定。
- **不修改与当前 work item 无关的文件。** 一个修复一个 diff。范围蔓延是失效模式，不是勤奋。
- **实现过程中不得静默修改验证规则。** 放宽闸门以让检查通过，等同于作弊。
- **状态必须落盘。** 结束前更新 `STATE.md`；有代码改动时更新 `feature_list.json`。不要依赖聊天历史。
- **不推送前先说明。** 未经明确批准不自动合并到 main。

## 硬约束（不可协商）

1. 执行者与验证者必须是不同的智能体、不同的指令。同一会话自我验证无效。
2. 同一事项最多 3 次自动尝试，之后升级给人。
3. 拒绝列表路径（`.env`、`.env.*`、`**/secrets/**`、`**/credentials/**`、`**/*_key*`、`**/*_secret*`、`auth/**`、`payments/**`、`billing/**`、`.terraform/**`、`k8s/production/**`、`**/migrations/**`）未经人工批准绝不自动编辑。完整清单以 `loop-constraints.md` 的 `## Paths` 代码块为准——`gate-check.mjs` 从那里读取，仓库特定路径加在那里就真的会被强制执行。
4. 没有显式允许列表时，绝不自动合并。
5. 绝不为了让 CI 变绿而禁用测试、跳过断言或注释掉检查。
6. `loop-pause-all` 生效时立即退出，不做任何动作。
7. **合并必须绑定审查过的 commit**（`--match-head-commit <sha>`）。审查后被 push 的代码进不来。
8. **新增测试必须通过回退测试**：能在修复前的代码上真的挂掉，且失败信息指出是哪个行为错了。
9. **未跑的检查必须显式列为 NOT RUN**，不允许省略不写。
10. **改了厂商接入必须真机验证**。没实测过的功能，不许在上面接着开发，也不许跟用户说能用。

完整清单与判定逻辑见 `loop-constraints.md`。规则 7–10 的出处与案例见 `docs/09-case-magpie.md`。

## 完成定义

一个 work item 只有在以下四条**全部为真**时才算完成：

- [ ] 目标行为已实现（不是"代码写了"）
- [ ] 要求的验证**确实跑过**，且输出被记录
- [ ] 证据写入 `feature_list.json` 或 `STATE.md`（命令 + 结果）
- [ ] 仓库仍能从标准启动路径（`init.sh`）重新起来

## 结束会话前

1. 更新 `STATE.md`：本轮做了什么、验证结果、阻塞、下一步。
2. 有代码改动时更新 `feature_list.json` 的状态与证据。
3. 在 `loop-run-log.md` 追加一条 JSON 运行记录。
4. 工作处于安全状态后用描述性 message 提交。
5. 让仓库干净到下一轮能立刻跑 `bash init.sh`。

## 去向索引

| 你需要什么 | 读哪里 |
|---|---|
| **三阶段建设路线（先看这个）** | `docs/11-three-stages.md` |
| **每阶段的技能与命令对照** | `docs/12-stage-commands.md` |
| **怎么用：五种用法与技能对照** | `docs/10-how-to-use.md` |
| 理解 harness × loop 的心智模型 | `docs/00-mind-model.md` |
| 事件如何路由到阶段与技能 | `docs/01-event-spine.md` |
| work item 的状态机与字段 | `docs/02-state-model.md` |
| 闸门规则与 L0–L3 等级 | `docs/03-gates-and-levels.md` |
| 安全护栏与拒绝列表 | `docs/04-safety.md` |
| 循环出错时怎么诊断 | `docs/05-failure-modes.md` |
| 成本估算与可观测性 | `docs/06-cost-and-observability.md` |
| 从哪一级开始、怎么升级 | `docs/07-adoption-ladder.md` |
| 术语表 | `docs/08-glossary.md` |
| 真实生产案例（全自动 loop） | `docs/09-case-magpie.md` |
| 错题本（agent 夜审写入） | `LESSONS.md` |
| 具体动作怎么做 | `skills/<技能名>/SKILL.md` |
| 装配新项目 | `templates/` + `scripts/init-loop-harness.mjs` |

## 三阶段建设

一个项目接入 loop-harness 分三步走。**先看当前在哪一步：**

```bash
node scripts/harness-stage.mjs /path/to/repo
```

| 阶段 | 目标 | 判据 | 对应等级 | 技能 |
|---|---|---|---|---|
| **1 初始化** | 创建必要的 md 文件，让结构完整、下一会话可重启 | 10 项（全机械） | L1 | `harness-init` |
| **2 强化** | 梳理并强化文件与机制，让验证真的有效、约束真的被强制执行 | 9 机械 + 1 人工 | L2 | `harness-strengthen` |
| **3 巩固** | 事件接上、循环跑起来、经验自己积累并转正为规则 | 7 机械 + 2 人工 | L3 | `harness-consolidate` |

**不要跳级。** 每一阶段的目的是让下一层的效果可观测、可归因。跳级会导致：无法判断哪一层出问题、跳过 triage 校准、无法量化每层贡献。

补齐某一阶段缺失的产物：

```bash
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 2
```

**每个阶段该用哪些技能、该敲哪些命令**，见 `docs/12-stage-commands.md`。

## 升级路径

- 架构决策、需求不清 → 查 `docs/`，查不到就问用户，不要猜。
- 反复测试失败 → 更新 `STATE.md`，标记人工复核，停止重试。
- 范围含糊 → 重读事件路由结果与 work item 的完成定义。
- 触及拒绝列表路径 → 立即停止，写升级条目，等人。
