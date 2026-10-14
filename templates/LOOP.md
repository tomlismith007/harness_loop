# LOOP.md — 循环注册表与事件路由

本文件声明这个仓库注册了哪些循环、它们由什么事件触发、以及事件如何路由到阶段与技能。
它是**调度与路由的唯一真相源**。

## 事件脊

| 事件 | 阶段 | 技能 | 等级 | 人工闸门 |
|---|---|---|---|---|
| `issues.opened` | intake | `issue-triage` | L1 | 无（只提议） |
| `issues.closed` | close | `post-merge-cleanup` | L1 | 关闭需人工确认 |
| `pull_request.opened` | review | `pr-review-triage` | L1 | 无 |
| `pull_request_review.changes_requested` | fix | `minimal-fix` → `loop-verifier` | L2 | 拒绝列表路径 |
| `check_suite.completed:failure` | fix | `ci-triage` → `minimal-fix` | L2 | infra/env；3 次上限 |
| `pull_request.ready_for_review` | gate | `gate-check`（脚本 `scripts/gate-check.mjs`） | L2 | **合并始终人工** |
| `pull_request.closed:merged` | post-merge | `post-merge-cleanup` | L1 | 大范围清理 |
| `push:tags` | release | `release-drafter` | L1 | 发布始终人工 |

**路由规则**：

```
verify == fail      → fix        （attempts += 1）
verify == approve   → gate
gate == blocked     → escalated
attempts >= 3       → escalated  （强制）
touches denylist    → escalated  （强制，不执行编辑）
budget >= 80%       → report-only
budget >= 100%      → exit
loop-pause-all      → exit
```

## 已注册循环

| 循环 | 事件 | 节奏 | 等级 | 最大尝试 | 每日 token |
|---|---|---|---|---|---|
| Issue Intake | `issues.*` | 2h 或事件 | L1 | — | 80k |
| PR Review Triage | `pull_request.*` | 10–15m 或事件 | L1→L2 | 3 | 300k |
| CI Sweeper | `check_suite.*` | 15m 或事件 | L2 | 3 | 500k |
| Merge Gate | `pull_request.ready_for_review` | 事件 | L2 | 3 | 100k |
| Post-Merge Cleanup | `pull_request.closed:merged` | 1d（非高峰） | L1→L2 | 2 | 200k |
| Release Drafter | `push:tags` | 1d 或事件 | L1 | 1 | 100k |

## 多循环协调

**优先级**：CI Sweeper → Merge Gate → PR Review Triage → Post-Merge Cleanup → Release Drafter

**冲突避免**：

- 每个循环在 `STATE.md` 的 Active 表写入 `acting_on: <branch|pr-id>`
- 派发前读 `STATE.md`，若冲突则跳过并记录 `outcome: "no-op"`（原因 `lock-held`）
- 同一分支每小时最多一个循环修改
- 所有循环共享同一份 `loop-constraints.md`

## Worktrees

- 无人值守的代码改动在独立 git worktree 中运行
- 命名：`loop/<event>-<item>-attempt<N>`
- 一个修复一个 worktree；REJECT 或升级后立即丢弃

## 连接器（MCP）

- L1 只用只读连接器
- L2 允许 `comment` 与 `label`，默认不允许 `merge`
- 权限扩大必须记录在 `STATE.md`，且有至少两周可靠运行记录
- 使用独立机器人账号与最小权限 token

## 预算与可观测性

- 上限：`loop-budget.md`
- 运行历史：`loop-run-log.md`
- 熔断账本：`loop-ledger.json`
- 就绪度：`node scripts/loop-audit.mjs . --suggest`
- 紧急停止：`loop-pause-all`

## 安全与闸门

- 未经人工批准，不合并到 main
- 拒绝列表见 `loop-constraints.md`；触及即升级
- 单次改动超过 10 个文件 → 人工审批
- 同一事项第 3 次尝试失败 → 强制升级
