---
name: issue-triage
description: >-
  Discover, deduplicate, prioritize, and propose labels for incoming issues. Produces a
  concise actionable queue for other loops and humans. In L1 proposes only — never applies
  labels, comments, or closes issues. Use when issue events arrive or for the daily overview.
license: MIT
user_invocable: true
stage: 1
---

# Issue Triage

产出一份干净的、按优先级排序的可操作队列。

**L1（第一周）只提议，绝不应用标签、评论或关闭 issue。**

## 输入

- 近期新开的 issue / discussion
- 已标记 `needs-info` 但可能有新信息的
- 当前状态文件（循环已经知道什么）
- 去重参考：现有 issue 标题与正文

## 输出格式

```markdown
Last run: <ISO timestamp>
Open actionable: N (was M)
New since last run: K
Needs human: H

## Top 5 (by priority)

1. **#456** — <单行描述>
   - Priority: P1
   - Why: <影响 / 风险 / 客户痛点>
   - Proposed labels: `area:api`, `needs-repro`
   - Suggested loop action: none | minimal-fix | escalate-human
   - Effort: <小时/天量级>

## Proposed Labels (not applied in L1)

| Issue | Proposed | Reason |
|---|---|---|
| #456 | area:api, needs-repro | 涉及 API 层，缺复现步骤 |

## Possible Duplicates (human confirm)

- #456 可能重复于 #321 — 标题与正文高度重叠，但环境描述不同

## Noise / Ignored

- #460 — 已标记 wontfix，无需处理
- #461 — 纯提问，无行动项

## State Updates

- PR #1234 现在有 2 个批准
- #456 的优先级从 P2 升到 P1（客户报告）
```

## 优先级判定

| 级别 | 判定标准 |
|---|---|
| **P0** | 安全漏洞、生产中断、数据丢失 |
| **P1** | 高影响 + 清晰复现 或 明确的客户痛点 |
| **P2** | 有效的功能/缺陷，不紧急 |
| **P3** | 锦上添花、文档、打磨 |
| **needs-info** | 规格不清、缺复现步骤 |
| **duplicate?** | 标题/正文与现有 issue 重叠 |

## 升级到人类（始终）

- 涉及 auth、payments、security、public API、billing、infra
- P0/P1 的分配（最初几周）
- 以 stale 为由关闭 issue
- 重复检测的置信度 < 70%

## 标签规则

**L1**：只提议，不应用。

**L2**（经 verifier 检查后）仅允许应用以下允许列表：

```
area:*
needs-repro
needs-info
```

**绝不自动应用**：`P0`、`P1`、`breaking-change`、`security`

## 规则

- **极度简洁。** 循环和读状态的人会感谢你。
- 只有"一个理性工程师今天会想知道"的才进 Top 5。存疑就放进 Watch 或 Noise。
- **triage 期间绝不提议架构改造** —— 这个技能是找信号，不是发明。
- 重复检测保守：只说 `possible duplicate of #NNN`，**绝不自动关闭**。
- 每轮清理已关闭的 issue。
- 在高节奏仓库（2h 一次）运行时，尤其要注意简洁。

## 与其他循环的配合

Issue Triage 是 **feeder**：它把 Top 5 写进 `STATE.md` 的 High Priority，供其他循环消费。

- 不重复 issue 正文，只引用编号
- Daily Triage 读本文件并把 Top 5 合并进 `STATE.md`
- 不在同一轮既 triage 又修复

## 输出后的动作

1. 把 Top 5 合并进 `STATE.md` 的 High Priority 区
2. 更新 `STATE.md` 的 `Last run`
3. 追加运行日志（`outcome: "report-only"`）
4. 填写 Post-Run Critique：高噪声项、误报、应降优先级的、人工审查阻碍、一项下轮调整
