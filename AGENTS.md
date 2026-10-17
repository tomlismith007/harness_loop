# AGENTS.md

harness-loop 的入口文件。这是一个**路由器，不是手册**——这里只放启动路径、工作规则、完成定义和去向链接。

## 项目概览

harness-loop 是一套让编码智能体围绕**一个明确的 work item** 持续、可靠工作的工程框架。
它由两部分组成：harness 五子系统（地基）与 loop 机制（运行层）。
**输入是本地待办**：人写进 `STATE.md`，或直接给 `/harness-loop` 一个参数。
GitHub issue/PR 是可选模块（`/harness-loop-issue`），不属于核心。

## 启动工作流

写任何代码之前，按顺序执行：

1. `pwd` 确认工作目录是仓库根。
2. 读 `loop-constraints.md` —— **约束是绑定的，必须在任何动作之前加载**。输出一行确认：`Constraints loaded from loop-constraints.md: N rules active.`
3. 读 `STATE.md` 了解当前活动、人类收件箱、上次运行时间。
4. 读 `LESSONS.md`，避免重复已记录的返工。
5. 跑 `bash init.sh` 确认环境健康。基线失败先修基线，不要在坏状态上叠新工作。
6. 一次只做一个 work item，从 `STATE.md` 的 `## High Priority` 选第一条未勾选。
   `feature_list.json` 只用于查"这项是否已完成、证据是什么"，不是工作队列。

## 工作规则

- **一次只做一个 work item。** 直到它被验证或被显式标记为阻塞。
- **不跑验证命令，不得宣称完成。** 完成由证据判定，不由代码写完判定。
- **不修改与当前 work item 无关的文件。** 一个修复一个 diff。
- **实现过程中不得静默修改验证规则。** 放宽闸门以让检查通过，等同于作弊。
- **状态必须落盘。** 结束前更新 `STATE.md`；有代码改动时更新 `feature_list.json`。
- **执行者不得标记自己的 work item 为完成。**
- **不推送前先说明。** 未经明确批准不自动合并到 main。

## 硬约束（不可协商）

1. 执行者与验证者必须是不同的智能体实例、不同的指令。同一会话自我验证无效。
2. 同一事项最多 3 次自动尝试，之后升级给人。
3. 拒绝列表路径（`.env`、`auth/**` 等）未经人工批准绝不自动编辑。完整清单以 `loop-constraints.md` 的 `## Paths` 代码块为准——`gate-check.mjs` 从那里读取。
4. 没有显式允许列表时，绝不自动合并。
5. 绝不为了让 CI 变绿而禁用测试、跳过断言或注释掉检查。
6. `loop-pause-all` 生效时立即退出，不做任何动作。
7. **合并必须绑定审查过的 commit**（`--match-head-commit <sha>`）。
8. **新增测试必须通过回退测试**：能在修复前的代码上真的挂掉，且失败信息指出是哪个行为错了。
9. **未跑的检查必须显式列为 NOT RUN**，不允许省略不写。
10. **改了厂商接入必须真机验证**。没实测过的功能，不许在上面接着开发，也不许跟用户说能用。
11. **"机械判定"的机制必须有真正读它的代码入口**，且其行为被测试断言。改配置而测试仍绿，说明这个配置是装饰品。

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
4. 发生返工时在 `LESSONS.md` 追加一行。
5. 工作处于安全状态后用描述性 message 提交。

## 去向索引

| 你需要什么 | 读哪里 |
|---|---|
| 四个命令各自做什么 | `README.md` |
| 理解 harness × loop 的心智模型 | `docs/00-mind-model.md` |
| work item 的状态机与字段 | `docs/02-state-model.md` |
| 闸门规则与等级 | `docs/03-gates-and-levels.md` |
| 安全护栏与拒绝列表 | `docs/04-safety.md` |
| 循环出错时怎么诊断 | `docs/05-failure-modes.md` |
| 术语表 | `docs/08-glossary.md` |
| 真实生产案例（全自动 loop） | `docs/09-case-magpie.md` |
| v1 结构（已归档，仅参考） | `docs/archive/` |
| 具体动作怎么做 | `skills/<技能名>/SKILL.md` |
| 装配新项目 | `templates/` + `node scripts/harness-stage.mjs <repo> --upgrade --stage 1` |

## 两个建设阶段

| 阶段 | 目标 | 判据 | 技能 |
|---|---|---|---|
| **1 初始化** | 创建 6 个文件，让结构完整、下一会话可重启 | 7 项（全机械） | `harness-init` |
| **2 装配 loop 机制** | 装账本、运行日志、熔断与独立验证入口 | 5 机械 + 2 人工 | `harness-loop-init` |

**不要跳级。** 补齐某一阶段缺失的产物：

```bash
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 2
```

## 升级路径

- 架构决策、需求不清 → 查 `docs/`，查不到就问用户，不要猜。
- 反复测试失败 → 更新 `STATE.md`，标记人工复核，停止重试。
- 范围含糊 → 重读 work item 的完成定义。
- 触及拒绝列表路径 → 立即停止，写升级条目，等人。
