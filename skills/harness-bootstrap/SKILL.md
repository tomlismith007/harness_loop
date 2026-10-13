---
name: harness-bootstrap
description: >-
  Scaffold and audit a complete coding-agent harness in a target repository: instruction
  file, feature list, progress log, session handoff, init script, loop constraints, budget,
  run log, and the loop skills. Use when adopting loop-harness in a new project, or when
  auditing an existing harness for the five subsystems (instructions, tools, environment,
  state, feedback) and the loop primitives.
license: MIT
---

# Harness Bootstrap

在一个目标仓库里装配完整 harness，或审计已有 harness。

**不是**模型选择、孤立提示词调优、聊天界面设计或通用应用架构。

## 五子系统模型

| 子系统 | 最小工件 | 职责 |
|---|---|---|
| Instructions | `AGENTS.md` / `CLAUDE.md` | 启动路径、工作规则、完成定义 |
| State | `feature_list.json`、`progress.md` | 当前 feature、状态、证据、下一步 |
| Verification | `init.sh`、文档化命令 | 声称完成前必须跑的检查 |
| Scope | feature 依赖与完成标准 | 防止越界与半成品 |
| Lifecycle | `session-handoff.md`、结束例程 | 让下一会话可重启 |

Loop 层在其上叠加：constraints、budget、run log、ledger、skills、事件接线。

## 第一动作

1. **盘点已有物**：instruction 文件、feature/state 文件、验证命令、文档、包清单。
2. **只问无法安全推断的**：目标 agent、期望文件名、对结构的容忍度、是否允许覆盖。
3. **先给最小 harness**。只有当用户问题确实需要时才加 memory、tool safety、multi-agent、benchmark 细节。

## 任务一：装配 harness

```bash
node scripts/init-loop-harness.mjs --target /path/to/project --level L1
```

选项：

| 选项 | 作用 |
|---|---|
| `--agent-file CLAUDE.md` | 面向 Claude 的项目 |
| `--package-manager npm\|pnpm\|yarn\|bun` | 自动检测错误时使用 |
| `--commands "cmd one,cmd two"` | 自定义验证命令 |
| `--level L1\|L2\|L3` | 装配到哪一级（默认 L1） |
| `--force` | 仅在确认可覆盖后使用 |

生成的文件：

| 文件 | 来源 |
|---|---|
| `<agent-file>` | `templates/AGENTS.md` + 替换变量 |
| `feature_list.json` | `templates/feature_list.json` |
| `progress.md` | `templates/progress.md` |
| `session-handoff.md` | `templates/session-handoff.md` |
| `init.sh` | 由检测到的验证命令程序化生成（chmod 755） |
| `loop-constraints.md` | `templates/loop-constraints.md` |
| `loop-budget.md` | `templates/loop-budget.md` |
| `loop-run-log.md` | `templates/loop-run-log.md` |
| `loop-ledger.json` | 空账本 |
| `LOOP.md` | `templates/LOOP.md` |
| `STATE.md` | `templates/STATE.md` |

L2 额外生成：`loop-verifier`、`minimal-fix` 技能目录。

**完成后必须向用户解释**：创建了什么、如何替换占位 feature 条目、下一步该做什么。

## 任务二：审计已有 harness

```bash
node scripts/loop-audit.mjs /path/to/project
```

报告五子系统分数、最低分领域、最先能提升可靠性的 2–3 项改动。

**关键警告**：把最低分当作**候选瓶颈**，不要直接声称因果。要确认瓶颈，必须结合失败记录、日志或任务结果。

## 任务三：产出评估报告

```bash
node scripts/loop-audit.mjs /path/to/project --json > assessment.json
```

必须说明这是**结构性审计**：它检查工件是否存在、字段是否合法、约束是否声明，但**不**证明 agent 在这个仓库里会变可靠。真实有效性需要代表性任务上的 before/after 会话对比。

## Design Rules（不可协商）

- **根指令文件保持简短**：路由和不变式，不是完整手册。约 100 行。
- **项目事实放项目文档**，不放技能里。
- **验证命令必须显式且可运行。**
- **标记 feature 完成前必须有证据。**
- **一次一个 active feature**，除非 harness 有显式的多 agent 所有权边界。
- **优先用追加/更新的状态文件**，而不是依赖聊天历史。
- **绝不在脚本里隐藏破坏性行为**；覆盖需要显式用户批准。

## Deliverable Checklist

一个可用的最小 harness 应留下：

- [ ] `AGENTS.md` 或 `CLAUDE.md`
- [ ] `feature_list.json`
- [ ] `progress.md`
- [ ] `init.sh`
- [ ] `loop-constraints.md`
- [ ] `loop-budget.md`
- [ ] `loop-run-log.md`
- [ ] `LOOP.md`
- [ ] `STATE.md`
- [ ] 可选的 `session-handoff.md`（多会话工作时）
- [ ] 文档化的验证证据或下一步动作

**若无法创建文件，提供精确的文件内容与命令。**

## 常见问题诊断

| 症状 | 检查 |
|---|---|
| agent 选错包管理器 | `AGENTS.md` 是否写明？`init.sh` 是否锁定了 PM？ |
| 每会话重新发现项目结构 | `AGENTS.md` 是否有 Startup Workflow？ |
| 宣称完成但测试红着 | 是否有 Definition of Done？验证命令是否可运行？ |
| 改了无关文件 | 是否有 "Stay in scope" 规则？verifier 是否检查 scope？ |
| 会话间失忆 | `progress.md` 是否每轮更新？`STATE.md` 的 Last run 是否在变？ |
| 循环自我验证 | 是否存在独立 verifier？是否同会话？ |

## 与其他技能的交互

| 技能 | 关系 |
|---|---|
| `loop-audit`（脚本） | 审计工具，本技能调用它 |
| `harness-loop` | 装配完成后的运行时入口 |
| `loop-constraints` | 装配出的约束文件由它加载 |
| 全部循环技能 | 由 `--level` 决定装配哪些 |
