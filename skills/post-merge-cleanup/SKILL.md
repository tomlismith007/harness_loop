---
name: post-merge-cleanup
description: >-
  After a merge to main, scan for follow-up work: stale TODOs, deprecated code paths,
  documentation gaps, tech debt, orphaned feature flags. Propose small fixes in worktrees
  and file tickets for large items. Does not block the merge itself.
license: MIT
user_invocable: true
stage: 3
---

# Post-Merge Cleanup

合并之后扫描跟进项。**不阻塞合并本身** —— 这是合并后的清理，不是合并前的关卡。

本技能被两类事件触发，输入完全不同：**先判断本次是哪一种**。

## 输入

**A. `pull_request.closed:merged` —— 合并后清理**

- 近期合并到 main 的 PR（用 GitHub API 的合并列表，不只是本地 `git log`）
- 合并 PR 的 diff
- 现有 TODO / FIXME / HACK 标记
- 技术债工单

**B. `issues.closed` —— issue 关闭**

- 被关闭 issue 的编号、标题、关闭原因
- 该 issue 关联的 PR 与分支（若有）
- **没有合并 diff**：不要去找"最近合并的 PR"——那会扫到与本 issue 无关的代码，
  产出一份看起来合理、实则无关的报告

两种触发都只扫描、只提议，不阻塞任何流程。

## 输出格式

```markdown
## Post-Merge Scan — <日期范围>

### Scanned
- PR #123 <标题> (merged <时间>)
- PR #124 <标题>

### Small Fixes Proposed (worktree)
| Item | File | Change | Risk |
|---|---|---|---|
| 移除已失效的 feature flag | `src/config.ts` | 删除 `LEGACY_MODE` 分支 | low |

### Tickets Filed (large items)
| Item | Reason for ticket |
|---|---|
| 拆分 `handler.ts`（现 800 行） | 超出单次清理范围，需设计 |

### Deprecations to Announce
- `oldApiV1()` 现在无调用者，建议标记 deprecated

### Documentation Gaps
- 新增的 `retryPolicy` 配置未写入 README

### Deferred (next scan)
- <条目> — 原因
```

## 优先级规则

| 类型 | 处理 |
|---|---|
| 小型 + 低风险 | 在 worktree 中提议修复 |
| 大型 / 需要设计 | 建工单 + 提醒人工 |
| 涉及外部 API 消费者的弃用 | **升级给人** |
| 已尝试两次仍未通过测试的清理 | **升级给人** |

## 清理的验证要求

- **清理不得改变行为**（除非明确移除无效代码路径）。
- verifier 跑**完整测试套件**；出现回归立即交人工。
- 清理 PR 涉及 **> 10 个文件**时，未经人工批准不得合并。

## 规则

- **不改变行为。** 清理是删除死代码和补文档，不是重构。
- **不过度激进删除。** 不确定某段代码是否还在用 → 建工单，不删。
- 用 GitHub API 的合并列表，不只本地 `git log`（避免遗漏）。
- 只处理**有合并上下文或关联工单**的 TODO，否则噪声太大。
- 非高峰运行；限制每天自动 PR 数（建议 ≤ 2）。

## 失败模式与对策

| 失效模式 | 对策 |
|---|---|
| 过度激进删除 | verifier + "不改变行为"规则 |
| 遗漏合并 | 用 API 合并列表 |
| 每个 TODO 都产生噪声 | 只处理有上下文或工单的 |
| 与功能开发争用 | 非高峰运行，限制每日自动 PR 数 |

## 与其他循环的关系

| 组合 | 规则 |
|---|---|
| Post-Merge + PR Review Triage | Post-Merge 仅在非高峰运行 |
| Post-Merge + Release Drafter | 是 Release Drafter 的低风险搭档，都产出文档类改动 |

## 输出后的动作

1. 更新 `STATE.md`（提议的修复、建的工单）
2. 追加运行日志
3. 小型修复 → worktree + `minimal-fix` + `loop-verifier`
4. 大型项 → 工单，进入 Watch List
