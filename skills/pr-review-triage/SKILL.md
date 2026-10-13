---
name: pr-review-triage
description: >-
  Summarize each open PR's CI status, review state, and blocking comments into a compact
  per-PR status block with a suggested loop action. Use when PR events arrive or for
  periodic PR watching. Does not fix anything — it decides what needs fixing.
license: MIT
user_invocable: true
---

# PR Review Triage

为每个 PR 产出一个紧凑的状态块，决定下一步该做什么。

## 输入

- 开放 PR 列表（含 draft 状态）
- 每个 PR 的 CI 检查结果
- 审查状态（approved / changes requested / pending）
- 阻塞性评论
- 当前状态文件（避免重复处理已处理的）

## 输出格式

```markdown
### PR #123 — <标题>
- CI: green | red (失败 job: <名称>)
- Reviews: approved 2 | changes requested 1 | none
- Blocking comments:
  - `src/api/handler.ts:42` — 要求处理空值情况
- Ready to merge: yes | no — <原因>
- Idle: 3d
- Suggested loop action: none | minimal-fix | rebase | escalate-human
```

## 判定规则

**"Ready to merge" 必须同时满足**：

- 所有必需检查通过
- 达到项目策略要求的批准数
- 没有未解决的阻塞性评论

**动作映射**：

| 情况 | 建议动作 |
|---|---|
| CI 红且可定位 | `minimal-fix` |
| CI 红但分类为 flake / infra | `escalate-human` |
| 有可操作的审查意见 | `minimal-fix` |
| 分支落后于 main | `rebase` |
| 非阻塞性小意见 | 记录，**不派发修复** |
| 空闲 > 4 天 | 建议人工接手 |
| 高风险标签（security、breaking） | **始终** `escalate-human` |

## 规则

- **`Ready to merge` 需要所有必需检查和批准，按项目策略。** 不凭印象判断。
- **非可操作的小意见 → 记录但不派发修复。** 避免制造无价值的工作。
- **PR 空闲 > 4 天 → 建议人工接手。**
- **高风险标签 → 始终升级。** 无论 CI 是否绿。
- 绝不合并。这个技能只提议。

## 与 CI Sweeper 的分工

| | CI Sweeper | PR Review Triage |
|---|---|---|
| 负责 | 失败的检查 | PR 的整体推进状态 |
| 冲突避免 | — | 不在同一小时内再修 CI Sweeper 正在修的分支 |

两者都看 CI 状态，但只有 CI Sweeper 动手改。若 CI Sweeper 已在处理某分支，PR Review Triage 在报告中标注但不派发修复。

## 输出后的动作

1. 更新 `STATE.md` 的 Active 表与 Watch List
2. 有可操作条目时在 High Priority 区列出
3. 追加运行日志
4. 清理已合并/已关闭的 PR 条目
