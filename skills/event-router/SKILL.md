---
name: event-router
description: >-
  Map an incoming repository event (issue opened, PR review changes requested, CI failure,
  merge, tag) to its processing phase, skills, gates, and next action. Use when you need to
  decide what should happen in response to an event rather than executing a specific action.
  Also detects multi-loop conflicts via the acting_on lock.
license: MIT
user_invocable: true
stage: 1
---

# Event Router

把事件映射到阶段、技能、闸门和下一步动作。它是 `LOOP.md` 路由表的机械执行者。

## 用法

```bash
node scripts/event-router.mjs --event <事件名> --item <item-id> --target <branch|pr-id>
```

## 路由表

**可执行真相源是 `scripts/event-router.mjs` 的 `ROUTES`。** 对外登记表在 `LOOP.md`，
两处由 `test.mjs` 第 17 节双向核对（事件名、phase、技能数组）。

本技能不再手抄第三份表——手抄表曾与 `ROUTES` 漂移而测试全绿：
`workflow_run.completed:failure` 少列了 `minimal-fix`，`pull_request.closed:unmerged`
的技能列与代码相反。改路由时改 `ROUTES` 与 `LOOP.md`，不要在这里加表。

## 输出

```json
{
  "event": "pull_request_review.changes_requested",
  "item": "pr-123",
  "phase": "fix",
  "skills": ["minimal-fix", "loop-verifier"],
  "level": "L2",
  "gates": ["denylist", "max-attempts", "scope", "verification"],
  "next": "spawn implementer in isolated worktree, then spawn verifier with fresh context"
}
```

## 冲突检测

路由前检查 `STATE.md` 的 Active 表：

- 若另一循环的 `acting_on` 与本次目标相同 → 输出 `"conflict": "lock-held"`，**跳过本次任务**
- 冲突时在 `loop-run-log.md` 记录 `outcome: "no-op"`

```json
{
  "event": "check_suite.completed:failure",
  "item": "ci-a1b2c3-test",
  "conflict": "lock-held",
  "held_by": "pr-review-triage",
  "next": "skip this run, log outcome=no-op"
}
```

## 未注册事件

若事件不在表中：

1. **不要自创流程。**
2. 记入 `STATE.md` 的 Watch List。
3. 在 `LOOP.md` 中补充路由表条目（需人工确认）。

## 规则

- 路由是**机械的**。相同事件永远映射到相同阶段与技能。
- 路由表是唯一真相源（`LOOP.md`），脚本只是执行者。修改路由要改 `LOOP.md`。
- 冲突检测在派发前，不在派发后。
- 事件未注册 → 报告，不自创。

## 与其他技能的交互

| 技能 | 关系 |
|---|---|
| `harness-loop` | 在流程第 2 步调用本技能 |
| `issue-triage` / `pr-review-triage` / `ci-triage` | 由本技能按 phase 指定 |
| `loop-budget` | 冲突跳过时也要记录运行日志 |
