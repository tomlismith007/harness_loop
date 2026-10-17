# LOOP.md — 循环注册表与事件路由

本文件声明这个仓库注册了哪些循环、它们由什么事件触发、以及事件如何路由到阶段与技能。它是**调度与路由的唯一真相源**。

## 建设阶段

一个项目接入本框架分三步，由 `scripts/harness-stage.mjs` 机械判定：

| 阶段 | 目标 | 判据 | 等级 |
|---|---|---|---|
| 1 初始化 | 创建必要的 md 文件 | 8 项（全机械） | L1 |
| 2 强化 | 验证真的有效、约束真的被强制执行 | 6 机械 + 3 人工 | L2 |
| 3 巩固 | 事件接上、经验积累、规则转正 | 7 机械 + 1 人工 | L3 |

```bash
node scripts/harness-stage.mjs .              # 当前阶段 + 差距
node scripts/harness-stage.mjs . --upgrade    # 补齐下一阶段
```

**事件脊在阶段 3 才接线。** 阶段 1–2 是人机协作（人在场，agent 按规则干活）；阶段 3 才让事件自动触发。

完整判据见 `docs/11-three-stages.md`。

## 事件脊（Event Spine）

所有循环挂在同一条脊上。事件是输入，阶段是处理，闸门是出口。

| 事件 | 来源 | 阶段 | 技能 | 等级 | 人工闸门 |
|---|---|---|---|---|---|
| `issues.opened` | issue | intake | `issue-triage` | L1 | 无（只提议） |
| `issues.reopened` | issue | intake | `issue-triage` | L1 | 无 |
| `issues.labeled` | issue | intake | `issue-triage` | L1 | 无 |
| `issues.closed` | issue | close | `post-merge-cleanup` | L1 | 关闭需人工确认 |
| `pull_request.opened` | PR | review | `pr-review-triage` | L1 | 无 |
| `pull_request.synchronize` | PR | review | `pr-review-triage` | L1 | 无 |
| `pull_request_review.changes_requested` | PR | fix | `minimal-fix` → `loop-verifier` | L2 | 拒绝列表路径 |
| `pull_request_review.approved` | PR | gate | `gate-check`（脚本，非技能目录） | L2 | **合并始终人工** |
| `check_suite.completed:failure` | PR/main | fix | `ci-triage` → `minimal-fix` → `loop-verifier` | L2 | infra/env 失败；3 次上限 |
| `check_suite.completed:success` | PR/main | verify | — | L1 | 无 |
| `workflow_run.completed:failure` | PR/main | fix | `ci-triage` → `minimal-fix` | L2 | infra/env 失败；3 次上限 |
| `pull_request.ready_for_review` | PR | gate | `gate-check`（脚本，非技能目录） | L2 | **合并始终人工** |
| `pull_request.closed:merged` | main | post-merge | `post-merge-cleanup` | L1 | 大范围清理 |
| `pull_request.closed:unmerged` | PR | close | — | L1 | 只记录结果，不派发技能 |
| `push:tags` | main | release | `release-drafter` | L1 | 发布始终人工 |
| `release.published` | main | close | — | L1 | 归档相关 work item |

> 这张表与 `scripts/event-router.mjs` 的 `ROUTES` 由测试双向核对（`test.mjs` 第 17 节：
> 事件名、phase、**技能数组**）。加事件时两处一起改，否则断言会挂。

**路由规则**（由 `scripts/event-router.mjs` 机械执行）：

```
verify 阶段判定为 fail  → 回到 fix 阶段（同一 work item，尝试次数 +1）
verify 阶段判定为 pass  → 进入 gate 阶段
gate 阶段判定为 blocked → 进入 escalated（人类收件箱）
尝试次数 >= 3           → 强制进入 escalated，不再回到 fix
事件触及拒绝列表路径    → 强制进入 escalated，不做任何编辑
预算 >= 80% 日上限      → 降级为 report-only（不派发执行子智能体）
预算 >= 100% 或暂停标志 → 立即退出
```

## 已注册循环

| 循环 | 事件 | 节奏 | 等级 | 状态文件 | 最大尝试 | 每日 token 上限 |
|---|---|---|---|---|---|---|
| Issue Intake | `issues.*` | 2h 或事件驱动 | L1 报告 | `STATE.md` | — | 见 `loop-budget.md` |
| PR Review Triage | `pull_request.*` | 10–15m 或事件驱动 | L1→L2 | `STATE.md` | 3 | 见 `loop-budget.md` |
| CI Sweeper | `check_suite.*` | 15m 或事件驱动 | L2 辅助 | `STATE.md` | 3 | 见 `loop-budget.md` |
| Merge Gate | `pull_request.ready_for_review` | 事件驱动 | L2 | `STATE.md` | 3 | 见 `loop-budget.md` |
| Post-Merge Cleanup | `pull_request.closed:merged` | 1d（非高峰） | L1→L2 | `STATE.md` | 2 | 见 `loop-budget.md` |
| Release Drafter | `push:tags` | 1d 或事件驱动 | L1 草稿 | `STATE.md` | 1 | 见 `loop-budget.md` |

### 非事件驱动循环

| 循环 | 触发 | 节奏 | 等级 | 产物 |
|---|---|---|---|---|
| Lesson Harvest（夜审） | 定时 | 每天凌晨 | L1 | `LESSONS.md` |
| Signal Gatekeeper（门卫） | 持续 | 每条信号 | L1 | 判断结果（丢弃或放行） |

**Lesson Harvest 不在事件脊上**——它需要看到完整的一天，而不是单个事件。

**Signal Gatekeeper 在所有循环之前**——它是第 -1 步，用廉价模型挡掉不相关信号，不转发原文。适用于高噪声源（社交平台、社区频道、大型仓库 issue 流）。

## 经验 → 规则棘轮

```
夜审发现返工  → 记进 LESSONS.md（Seen 1×）
再次出现      → Seen 2×
第三次出现    → 转正进 loop-constraints.md → 之后每个 PR 审查逐条对
```

**延迟提升**是这套机制的精髓：一条经验第一次出现时不够格成为规则（可能是一次性偶发），出现 3 次才说明它是系统性的。这避免了两种错误——过早立规矩（噪声变成制度），以及从不立规矩（经验永远停在笔记里没人执行）。

`Seen N×` 是升级判定的支点。没有它就无法机械判定何时该提升。

## 多循环协调

**优先级**（冲突时高优先级先执行，低优先级让路）：

1. **CI Sweeper** — main 变红阻塞所有其他工作
2. **Merge Gate** — 合并闸门有时效性
3. **PR Review Triage** — 活跃 PR 需要及时反馈
4. **Post-Merge Cleanup** — 非高峰运行，紧迫性最低
5. **Release Drafter** — 只读为主，可安全并发

**冲突避免机制**：

- 每个循环在 `STATE.md` 的对应条目写入 `acting_on: <branch|pr-id>`。
- 派发新任务前，先读 `STATE.md`，若另一循环的 `acting_on` 与本次目标相同 → 跳过并在 `loop-run-log.md` 记录 `outcome: "no-op"`（原因：`lock-held`）。
- **同一分支每小时最多一个循环修改。**
- 所有循环共享同一份拒绝列表（`loop-constraints.md`），不存在"某个循环的例外"。

## 调度配置

```yaml
# 事件驱动（首选，零空转成本）
issue_intake:        on: [issues, issue_comment]
pr_review_triage:    on: [pull_request, pull_request_review]
ci_sweeper:          on: [check_suite, workflow_run]
merge_gate:          on: [pull_request: ready_for_review]
post_merge_cleanup:  on: [pull_request: closed]
release_drafter:     on: [push: tags, release]

# 定时兜底（事件丢失或需要每日概览时）
daily_triage:        cron: "0 8 * * 1-5"     # 工作日 08:00
pr_watch:            cron: "*/15 * * * *"    # 仅活跃时段
post_merge_sweep:    cron: "0 22 * * *"      # 非高峰
```

具体接线见 `examples/github-actions/`。

## Worktrees

- 任何无人值守的代码改动实验，在**独立的 git worktree** 中运行。
- 一个修复一个 worktree；verifier 判定 REJECT 或升级给人之后立即丢弃。
- 命名约定：`loop/<event>-<item-id>-attempt<N>`。

## 连接器（MCP）

- **L1 只用只读连接器**：读 issue、读 PR、读 CI 状态。
- **L2 允许 `comment` 与 `label`**，默认不允许 `merge`。
- 范围扩大必须在 `STATE.md` 记录，并经过至少两周的可靠运行记录。
- 使用独立机器人账号与最小权限 token。绝不在调度提示词里粘贴 API key。

## 预算与可观测性

- 上限：`loop-budget.md`
- 运行历史：`loop-run-log.md`（每轮追加一条 JSON）
- 熔断账本：`loop-ledger.json`（每次尝试追加，`scripts/ledger-check.mjs` 读取）
- 就绪度：`node scripts/loop-audit.mjs . --suggest`
- 紧急停止：`loop-pause-all`（`STATE.md` / `loop-constraints.md` 里独占一行；没有标签通道）

## 安全与闸门

- 未经明确人工批准，不合并到 main。
- 拒绝列表见 `loop-constraints.md`；触及即升级，不做编辑。
- 单次改动超过 10 个文件 → 人工审批。
- 同一事项第 3 次尝试失败 → 强制升级。

---

*本文件既是文档，也是维护这套循环的种子。新增循环必须在此注册，并在 `patterns/registry.yaml` 登记机器可读条目。*
