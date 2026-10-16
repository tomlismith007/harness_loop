# 事件接线（GitHub Actions）

把 GitHub 仓库事件变成循环触发。

## 设计原则

**workflow 不执行 agent 逻辑。** 它只做两件事：

1. 调用 `scripts/event-router.mjs` 确定阶段、技能、闸门
2. 把结果写进 `STATE.md`，或创建 work item 文件

真正的 agent 执行由 agent 平台（Claude Code / Codex / 本地调度器）消费这些产物完成。

**没有 agent 运行器时，本目录的 workflow 只能完成"感知 + 判定 + 记账"，不能完成"修改 + 验证"。**
这不是缺陷，是边界：在 workflow 里造一个 agent 调度器需要另一套授权、沙箱与凭据管理，
超出本包职责。未接运行器时循环止于 `fix-proposed`——**合法结局，不是失败**。

**为什么这样设计**：让路由逻辑与执行平台解耦。换平台时事件脊不用重写，`LOOP.md` 的路由表继续有效。

## 文件清单

| 文件 | 触发 | 路由到 |
|---|---|---|
| `issue-intake.yml` | `issues` | `issue-triage` (intake) |
| `pr-review.yml` | `pull_request`, `pull_request_review` | `pr-review-triage` (review) / `minimal-fix` (fix) |
| `ci-sweeper.yml` | `workflow_run`, `check_suite` | `ci-triage` (fix) |
| `merge-gate.yml` | `pull_request: ready_for_review` | `scripts/gate-check.mjs` (gate) |
| `post-merge.yml` | `pull_request: closed` | `post-merge-cleanup` (post-merge) |
| `release-draft.yml` | `push: tags`, `release` | `release-drafter` (release) |
| `daily-triage.yml` | `schedule` | 每日兜底概览 |
| `lesson-harvest.yml` | `schedule`（凌晨 3 点） | `lesson-harvest`（夜审，**不在事件脊上**） |

## 前置设置

1. **仓库 Secret**：`LOOP_BOT_TOKEN`（独立机器人账号，最小权限）
   - 绝不用 `GITHUB_TOKEN` 做写操作以外的越权行为
   - 权限范围：`issues: write`、`pull_requests: write`（仅 comment/label）、`contents: read`
   - **不授予 `merge` 相关权限**

2. **权限声明**：每个 workflow 显式声明 `permissions:`，不用默认值。

3. **并发控制**：用 `concurrency` 避免同一 PR 被重复触发。

## 关键约束（写进 workflow）

- **不自动合并。** 所有 workflow 只做 comment / label / 创建 work item。
- **不在 workflow 里粘贴任何凭据到输出。** 日志可能被公开。
- **拒绝列表路径**的改动由 workflow 标记 `needs-human`，不触发修复。
- **同一分支每小时最多一个循环修改** —— 用 `concurrency.group` 实现。

## 本地验证

workflow 里的路由调用可以直接本地跑：

```bash
node scripts/event-router.mjs --event pull_request_review.changes_requested --item pr-123
```

若输出不符合预期，先修 `LOOP.md` 的路由表，再改 workflow。

## 与 agent 平台的对接

三种常见方式：

| 方式 | 说明 | 适用 |
|---|---|---|
| **Work item 文件** | workflow 写 `.loop/queue/<id>.json` 并用 `upload-artifact` 交付 | 本地调度器、自定义运行框架 |
| **Issue 评论** | workflow 在 PR/issue 上发一条结构化评论，agent 平台监听评论事件 | Claude Code / Codex 的事件触发 |
| **Repository dispatch** | workflow 发 `repository_dispatch`，agent 平台订阅 | 云端调度、跨仓库编排 |

推荐从**方式一**开始：最简单、可离线调试、不依赖平台特性。

> **文件必须交付出去。** GitHub Actions 的 runner 文件系统是临时的——job 一结束，
> 写进 `.loop/queue/` 的文件就没了，轮询该目录的 agent 平台永远看不到任何东西。
> 所以本目录下每个产生 work item 的 workflow 末尾都有 `actions/upload-artifact@v4`。
>
> 若需要跨 run 持久化并让仓库里的 agent 读得到（例如 `loop-run-log.md` 里的真实
> 运行记录——L3 就要求这个），改用方式二（评论）或方式三（dispatch），或者直接
> commit。artifact 有保留期，也不是 agent 默认会读的位置。

## 示例 workflow

见同目录下的 `.yml` 文件。每个都包含：

- 显式 `permissions`
- `concurrency` 防重复
- 路由调用
- work item 写入
- 失败时的升级路径
