# 事件接线（GitHub Actions）

把 GitHub 仓库事件变成循环触发。

## 设计原则

**workflow 不执行 agent 逻辑。** 它只做两件事：

1. 调用 `scripts/event-router.mjs` 确定阶段、技能、闸门
2. 把结果写进 `STATE.md`，或创建 work item 文件

真正的 agent 执行由 agent 平台（Claude Code / Codex / 本地调度器）消费这些产物完成。

**为什么这样设计**：让路由逻辑与执行平台解耦。换平台时事件脊不用重写，`LOOP.md` 的路由表继续有效。

## 文件清单

| 文件 | 触发 | 路由到 |
|---|---|---|
| `issue-intake.yml` | `issues` | `issue-triage` (intake) |
| `pr-review.yml` | `pull_request`, `pull_request_review` | `pr-review-triage` (review) / `minimal-fix` (fix) |
| `ci-sweeper.yml` | `workflow_run`, `check_suite` | `ci-triage` (fix) |
| `merge-gate.yml` | `pull_request: ready_for_review` | `gate-check` (gate) |
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
| **Work item 文件** | workflow 写 `.loop/queue/<id>.json`，agent 平台轮询该目录 | 本地调度器、自定义运行框架 |
| **Issue 评论** | workflow 在 PR/issue 上发一条结构化评论，agent 平台监听评论事件 | Claude Code / Codex 的事件触发 |
| **Repository dispatch** | workflow 发 `repository_dispatch`，agent 平台订阅 | 云端调度、跨仓库编排 |

推荐从**方式一**开始：最简单、可离线调试、不依赖平台特性。

## 示例 workflow

见同目录下的 `.yml` 文件。每个都包含：

- 显式 `permissions`
- `concurrency` 防重复
- 路由调用
- work item 写入
- 失败时的升级路径
