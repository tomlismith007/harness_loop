---
name: minimal-fix
description: >-
  Produce the smallest possible code change that fixes one specific, well-scoped problem
  (CI failure, reviewer comment, typo). Use only when the fix target is explicit. Never
  refactor unrelated code, never touch denylist paths, never mark your own work done.
license: MIT
user_invocable: true
---

# Minimal Fix

用**最小的 diff** 修**一个具体问题**。

## 前置条件

以下全部具备才可开始：

- 精确的失败信息、审查意见或 issue 描述
- 涉及的文件（若已知）
- 项目的构建/测试命令
- 路径拒绝列表（来自 `loop-constraints.md`）
- 预算未达 80%（否则 report-only，不得调用本技能）

**若修复需要 > 5 个文件，或需要设计变更 → 停止并升级。**

## 流程

1. 尽可能在本地复现或确认失败。
2. 定位**最小根因** —— 不是远端文件里的症状。
3. 只改必需的部分。**不做顺手重构。**
4. 跑与改动相关的测试和 lint。
5. 总结：改了什么、为什么、跑了什么。

## 输出格式

```markdown
## Minimal Fix Proposal

### Target
<一句话>

### Diff summary
- `src/api/handler.ts` — 在解析前加空值检查
- （文件 + 改动说明）

### Files changed
3 files, +12 −4

### Verification run
- `npm test` — 42 passed, 0 failed
- `npm run lint` — clean

### Denylist check
- 无命中 ✓

### Risks / human review needed?
no | yes — <为什么>
```

## 规则

- **一次调用一个问题。** 多个失败 → 先 triage 或升级。
- **尊重拒绝列表。** 命中即升级，不编辑。原句：
  > Do not modify files matching the denylist. Escalate to human with context.
- **绝不禁用测试、跳过断言、注释掉检查。**
- **绝不重构无关代码** —— 一轮一个修复。
- **不得标记自己的工作为完成** —— `loop-verifier` 决定。
- 无人值守运行时**必须**在独立 worktree 中操作。
- 每次尝试后追加到 `loop-ledger.json`。

## 何时必须停止并升级

| 条件 | 原因 |
|---|---|
| 需要 > 5 个文件 | 可能需要设计变更 |
| 触及拒绝列表路径 | 安全边界 |
| 需要改动测试来"让 CI 通过" | 作弊 |
| 第 3 次尝试仍失败 | 问题不在实现细节 |
| 发现根因是环境问题 | 不是代码问题 |
| 需求本身含糊 | 需要澄清而非猜测 |

## 与其他技能的交互

| 技能 | 关系 |
|---|---|
| `ci-triage` / `pr-review-triage` | 上游，决定"修什么" |
| `loop-verifier` | 下游，独立验证本技能产出的 diff |
| `loop-guard` | 每次尝试后追加账本并检查熔断 |
| `loop-constraints` | 拒绝列表来源 |
| `loop-budget` | report-only 模式下不得调用 |

## Worktree 约定

```bash
git worktree add loop/<event>-<item>-attempt<N> -b loop/<event>-<item>-attempt<N>
```

一个修复一个 worktree。verifier REJECT 或升级给人后**立即丢弃**，不留残留分支。
