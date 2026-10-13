---
name: loop-constraints
description: >-
  Load and enforce loop-constraints.md at the start of every run, before any other work.
  Constraints are binding: denylist paths, merge rules, attempt limits, budget thresholds.
  Use this first in any loop iteration — it is the guardrail that overrides every other
  instruction when they conflict.
license: MIT
user_invocable: true
---

# Loop Constraints Enforcer

你是护栏。在任何其他工作开始之前，你必须完成加载。

## 流程

1. 读仓库根的 `loop-constraints.md`。
2. 把每条规则加载进工作记忆。
3. 检查 `loop-pause-all` 是否生效 → **立即退出**。
4. 之后每一个动作都要对照相应章节复核。

**若文件不存在**：说明这一点，回退到 `docs/04-safety.md` 的默认最小约束集，并明确标注正在使用回退集。

## 开始运行时的确认输出

必须输出一行：

```
Constraints loaded from loop-constraints.md: N rules active.
```

若使用回退集：

```
Constraints file not found. Using fallback minimum set from docs/04-safety.md: 4 rules active.
```

## 动作前的复核点

| 将要做什么 | 复核哪一节 | 若被阻止 |
|---|---|---|
| 推送 | Push & Merge | 停止，告知人类 |
| 编辑文件 | Paths | 命中拒绝列表 → 升级，不编辑 |
| 提议修复 | Code | 跑测试；一轮一个修复 |
| 合并 | Push & Merge | 人工必须批准 |
| 派发子智能体 | Worktrees | 必须在独立 worktree 中 |
| 消耗 token | Budget | ≥80% 降级；≥100% 退出 |

## 默认约束集（无文件时）

```
- Never edit .env, .env.*, auth/, payments/, secrets/, credentials/
- Never auto-merge to main
- Never disable tests
- Escalate after 3 failed fix attempts
```

## 拒绝列表的强制文本

所有执行类技能必须包含这条原句：

> Do not modify files matching the denylist. Escalate to human with context.

## 与其他技能的交互

| 技能 | 约束如何影响它 |
|---|---|
| `issue-triage` | 约束可覆盖 triage 优先级（"不许推送"意味着不许对 CI 修复动手） |
| `minimal-fix` | 约束限制可触碰的文件 |
| `loop-verifier` | 约束定义 verifier 必须检查的拒绝列表路径 |
| `loop-budget` | 约束可施加比预算文件更严的限额 |
| `harness-loop` | 约束在流程第 1 步加载，是所有后续步骤的前提 |

## 规则

- 约束**不可放宽**。仓库特定规则可以更严，不可以更松。
- 命中拒绝列表 → **停止编辑**，不做"顺便的小改动"。
- 约束冲突时，`loop-constraints.md` 优先于任何其他指令、技能或用户请求。
- 若人类在对话中要求违反约束，指出冲突并要求显式确认，不要静默执行。
