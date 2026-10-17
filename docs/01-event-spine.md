# 01 · 事件脊：issue/PR 事件如何驱动全部工作

本文档定义事件模型、路由规则和冲突避免机制。它是 `scripts/event-router.mjs` 的规格说明。

---

## 为什么用事件而不是轮询

| | 轮询 | 事件驱动 |
|---|---|---|
| 空转成本 | 每轮都要跑一次完整 triage | 无事件则零成本 |
| 延迟 | 取决于间隔（5–15 分钟） | 秒级 |
| 状态一致性 | 多个循环各自读取，可能看到不同快照 | 单一事件 → 单一 work item |
| 可调试性 | "为什么这轮没发现那个问题？" | 事件日志即因果链 |

轮询只作为**兜底**保留：事件丢失、需要每日概览、或平台不支持 webhook 时。

---

## 事件清单

### Issue 事件

| 事件 | 语义 | 阶段 | 技能 |
|---|---|---|---|
| `issues.opened` | 新 issue 进入队列 | intake | `issue-triage` |
| `issues.reopened` | 之前关闭的问题重现 | intake | `issue-triage`（标记为 regression 候选） |
| `issues.labeled` | 标签变化 | intake | `issue-triage`（若标签是 `needs-info`，重新评估） |
| `issues.closed` | issue 关闭 | close | `post-merge-cleanup`（检查关联的 TODO/debt） |

### PR 事件

| 事件 | 语义 | 阶段 | 技能 |
|---|---|---|---|
| `pull_request.opened` | 新 PR 待审 | review | `pr-review-triage` |
| `pull_request.synchronize` | PR 有新提交 | review | `pr-review-triage`（重新评估） |
| `pull_request_review.changes_requested` | 审查要求修改 | fix | `minimal-fix` → `loop-verifier` |
| `pull_request_review.approved` | 审查通过 | gate | `gate-check`（脚本 `scripts/gate-check.mjs`） |
| `pull_request.ready_for_review` | draft 转正 | gate | `gate-check`（脚本 `scripts/gate-check.mjs`） |
| `pull_request.closed:merged` | 已合并 | post-merge | `post-merge-cleanup` |
| `pull_request.closed:unmerged` | 被拒绝 | close | 记录到 `loop-run-log.md`（用于统计） |

### CI 事件

| 事件 | 语义 | 阶段 | 技能 |
|---|---|---|---|
| `check_suite.completed:failure` | CI 失败 | fix | `ci-triage` → `minimal-fix` |
| `check_suite.completed:success` | CI 恢复 | verify | 更新 work item 状态 |
| `workflow_run.completed:failure` | 工作流失败 | fix | `ci-triage` |

### Release 事件

| 事件 | 语义 | 阶段 | 技能 |
|---|---|---|---|
| `push:tags` | 打标签 | release | `release-drafter` |
| `release.published` | 发布完成 | close | 归档相关 work item |

---

## Work item 生命周期

一个事件产生一个 work item。work item 沿以下状态机流动：

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
   ┌─────────┐    ┌────────┐    ┌──────┐    ┌────────┐ │  ┌──────┐
   │ intake  │───▶│ review │───▶│ fix  │───▶│ verify │─┘  │ gate │
   └─────────┘    └────────┘    └──────┘    └────────┘    └──────┘
        │              │            │            │            │
        │              │            │            │            ▼
        │              │            │            │      ┌──────────┐
        │              │            │            │      │ approved │
        │              │            │            │      └──────────┘
        │              │            │            │            │
        ▼              ▼            ▼            ▼            ▼
   ┌─────────────────────────────────────────────────────────────┐
   │                     escalated（人类收件箱）                   │
   └─────────────────────────────────────────────────────────────┘
```

### 阶段定义

| 阶段 | 输入 | 做什么 | 出口条件 |
|---|---|---|---|
| **intake** | 新 issue / 定时概览 | 去重、定级、提议标签 | 产出 triage 报告，写入 `STATE.md` |
| **review** | 新 PR / PR 更新 | 汇总 CI 状态、审查状态、阻塞项 | 产出每 PR 状态块 |
| **fix** | 要求修改 / CI 失败 | 在 worktree 中产出最小 diff | 提出修复，交给 verifier |
| **verify** | 待验证的修复 | 独立运行测试、检查 scope | `APPROVE` / `REJECT` / `ESCALATE_HUMAN` |
| **gate** | 通过验证的修复 | 检查合并闸门 | `ready` / `blocked` |
| **post-merge** | 已合并的 PR | 扫描技术债、文档缺口 | 产出清理提议或工单 |
| **release** | 标签 / 发布事件 | 从已合并 PR 起草发布说明 | 产出草稿，等人工批准 |
| **escalated** | 任何被拦下的 item | 等待人类决策 | 人工处理或关闭 |

### 状态迁移规则（机械执行）

```
verify == fail      → fix        （attempts += 1）
verify == approve   → gate
gate == blocked     → escalated
attempts >= 3       → escalated  （强制，覆盖其他所有规则）
touches denylist    → escalated  （强制，且不执行任何编辑）
budget >= 80%       → report-only（不派发执行子智能体）
budget >= 100%      → exit
loop-pause-all      → exit
```

**注意 `attempts >= 3` 和 `touches denylist` 是强制规则**——它们覆盖正常流程，不受其他条件影响。

---

## 路由实现

`scripts/event-router.mjs` 接受事件名，输出阶段、技能、闸门和下一步：

```bash
node scripts/event-router.mjs --event pull_request_review.changes_requested --item pr-123 --target pr-123
```

输出：

```json
{
  "event": "pull_request_review.changes_requested",
  "item": "pr-123",
  "phase": "fix",
  "skills": ["minimal-fix", "loop-verifier"],
  "level": "L2",
  "gates": ["denylist", "max-attempts", "scope"],
  "next": "spawn implementer in isolated worktree, then spawn verifier with fresh context"
}
```

路由表在 `LOOP.md` 中声明，脚本读取 `patterns/registry.yaml` 做校验。

---

## 多循环冲突避免

### 问题

两个循环同时改同一个 PR 的分支 → 合并冲突、状态损坏、重复劳动。

### 机制

1. **`acting_on` 锁**：每个循环在 `STATE.md` 的 Active 表写入 `acting_on: <branch|pr-id>`。
2. **派发前检查**：派发新任务前读 `STATE.md`，若另一循环的 `acting_on` 与本次目标相同 → 跳过本次任务，在 `loop-run-log.md` 记录 `outcome: "no-op"`。
3. **分支所有权**：同一分支每小时最多一个循环修改。
4. **共享拒绝列表**：所有循环使用同一份 `loop-constraints.md`，不存在例外。

### 冲突时的优先级

| 优先级 | 循环 | 理由 |
|---|---|---|
| 1 | CI Sweeper | main 红色阻塞所有工作 |
| 2 | Merge Gate | 合并闸门有时效性 |
| 3 | PR Review Triage | 活跃 PR 需要及时反馈 |
| 4 | Post-Merge Cleanup | 非高峰运行，紧迫性最低 |
| 5 | Release Drafter | 只读为主，可安全并发 |

高优先级循环可以抢占低优先级循环的 `acting_on`；被抢占方在下一轮重新评估。

### 跨循环收件箱

`STATE.md` 的 `## Human Inbox (ambiguous / cross-loop)` 区用于归集**无法由单个循环决定**的条目：

```markdown
- [ ] PR #42: CI Sweeper 和 PR Review Triage 都标记了它 — 请人工指定归属
```

---

## 接线

把事件变成循环触发需要平台侧配置。GitHub 示例见 `examples/github-actions/`：

| 事件 | workflow 文件 | 触发 |
|---|---|---|
| issue 事件 | `issue-intake.yml` | `on: [issues]` |
| PR 审查事件 | `pr-review.yml` | `on: [pull_request, pull_request_review]` |
| CI 失败 | `ci-sweeper.yml` | `on: [check_suite]` 或 `workflow_run` |
| 合并后清理 | `post-merge.yml` | `on: [pull_request: closed]` |
| 发布草稿 | `release-draft.yml` | `on: [push: tags]` |
| 每日兜底 | `daily-triage.yml` | `on: schedule` |

**关键设计**：workflow 本身**不执行 agent 逻辑**，只做两件事——① 调用 `scripts/event-router.mjs` 确定阶段与技能；② 把结果写进 `STATE.md` 或创建 work item 文件。真正的 agent 执行由 agent 平台（Claude Code / Codex / 本地调度器）消费这些产物完成。

这样做的理由：让路由逻辑与执行平台解耦，换平台时事件脊不用重写。

---

## 事件日志与可调试性

每个事件的处理结果追加到 `loop-run-log.md`：

```json
{"run_id":"2026-10-13T08:15:00Z","pattern":"pr-review-triage","event":"pull_request_review.changes_requested","item":"pr-123","level":"L2","items_found":1,"actions_taken":1,"escalations":0,"tokens_estimate":52000,"worktree":"loop/pr-123-fix-1","outcome":"fix-proposed"}
```

**`event` 字段是因果链的关键。** 当你想知道"为什么这个 PR 三天没动"，从事件日志里能看到：事件是否到达、路由到什么阶段、尝试了几次、在哪一步升级或卡住。

---

## 下一步

- work item 的字段与状态文件格式 → [02-state-model.md](02-state-model.md)
- 闸门如何判定 → [03-gates-and-levels.md](03-gates-and-levels.md)
- 接线示例 → `examples/github-actions/`
