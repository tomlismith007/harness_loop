---
name: harness-loop
description: >-
  Orchestrate the full issue/PR event spine: route an incoming repository event to its
  phase, load constraints, check budget, dispatch the right skill, enforce gates, and
  persist state. Use this as the top-level entry when an event arrives (issue opened,
  PR review requested changes, CI failed, PR merged, tag pushed) and something needs to
  happen. Reach for it whenever you need to decide "what should happen next" rather than
  executing one specific action.
license: MIT
---

# Harness Loop — 顶层编排

把一条事件跑完：路由 → 约束 → 预算 → 派发 → 闸门 → 状态。这是所有循环的入口。

**不是**用来执行具体动作的——具体动作由 `issue-triage`、`minimal-fix`、`loop-verifier` 等技能完成。这个技能负责**决定派发谁、什么时候停、什么时候交给人**。

## 一次运行的完整流程

### 第 0 步：退出检查（先做，成本最低）

按顺序检查，任一命中即退出，不继续：

1. `loop-pause-all` 是否生效（`loop-constraints.md`、`STATE.md`、issue 标签）→ **立即退出**
2. 预算是否 ≥ 100% 日上限（读 `loop-budget.md` + `loop-run-log.md` 近 24h）→ **立即退出**
3. 是否无待办（本事件对应的队列为空）→ **在 <5k token 内退出**，记录 `outcome: "no-op"`

**为什么退出检查放最前面**：避免在应该停的时候还在分析。这是高节奏循环唯一的经济性来源。

### 第 1 步：加载约束

读 `loop-constraints.md`，输出确认：

```
Constraints loaded from loop-constraints.md: N rules active.
```

约束是绑定的，必须在这一步加载完毕，而不是"用到时再看"。后续每个动作前都要对照相应章节复核：

- 推送前 → 复核 Push & Merge
- 编辑文件前 → 复核 Paths
- 提议修复前 → 复核 Code
- 合并前 → 复核 Push & Merge

### 第 2 步：路由事件

```bash
node scripts/event-router.mjs --event <事件名> --item <item-id>
```

拿到：`phase`、`skills`、`level`、`gates`、`next`。

路由表在 `LOOP.md` 中声明。若事件不在表中 → 记入 `STATE.md` 的 Watch List，不要自创流程。

### 第 3 步：检查冲突锁

读 `STATE.md` 的 Active 表，检查 `acting_on`：

- 若另一循环的 `acting_on` 与本次目标相同 → **跳过本次任务**，记录 `outcome: "no-op"`（原因 `lock-held`）
- 否则在 Active 表写入本轮的 `acting_on`

**同一分支每小时最多一个循环修改。**

### 第 4 步：预算分级

| 花费 | 模式 |
|---|---|
| < 80% | 正常：可派发执行子智能体 |
| ≥ 80% | **report-only**：不派发执行子智能体，只产出报告 |

### 第 5 步：派发技能

按路由结果派发。派发原则：

- **感知类技能**（triage）先跑，成本低
- **只有产出可操作条目时**才派发执行类技能（`minimal-fix`）
- **执行类技能之后必须跟验证类技能**（`loop-verifier`），且是**独立实例**

派发子智能体时的硬要求：

```
- 执行者与验证者必须是不同的智能体实例
- 验证者的指令必须是"找出拒绝的理由"，不是"确认它是对的"
- 代码改动必须在独立 git worktree 中进行
- 每个修复一个 worktree，命名 loop/<event>-<item>-attempt<N>
```

### 第 6 步：执行闸门

```bash
node scripts/gate-check.mjs \
  --item <item-id> \
  --phase <phase> \
  --attempts <n> \
  --diff-files <changed-files.txt> \
  --verdict <approve|reject|none> \
  --budget-pct <n>
```

`decision` 为 `proceed` 才继续；`escalate` → 写升级条目；`exit` → 立即停止。

### 第 7 步：熔断检查（有代码改动时）

每次尝试追加到 `loop-ledger.json`，重试前：

```bash
node scripts/ledger-check.mjs --ledger loop-ledger.json
```

退出码 `2` → **停止，不再重试**，写升级条目。

### 第 8 步：写状态

1. 更新 `STATE.md`：Active 表、High Priority、Watch List、Last run
2. 有代码改动时更新 `feature_list.json`（状态 + 证据）
3. 追加一条 JSON 到 `loop-run-log.md`
4. 清理已关闭/已合并/已升级超 7 天的条目
5. 填写 Post-Run Critique，**必须产出一项具体调整**

## 阶段与技能的对应

| phase | 技能 | 产物 |
|---|---|---|
| intake | `issue-triage` | triage 报告 → `STATE.md` |
| review | `pr-review-triage` | 每 PR 状态块 |
| fix | `ci-triage` → `minimal-fix` | worktree 中的最小 diff |
| verify | `loop-verifier` | APPROVE / REJECT / ESCALATE_HUMAN |
| gate | `gate-check`（脚本） | proceed / escalate / exit |
| post-merge | `post-merge-cleanup` | 清理提议或工单 |
| release | `release-drafter` | 发布说明草稿 |

## 停止条件（机器可判定）

一次运行在以下任一条件成立时结束：

| 条件 | outcome |
|---|---|
| 无待办，提前退出 | `no-op` |
| 产出报告，未改代码 | `report-only` |
| 提出修复，等待验证 | `fix-proposed` |
| 修复通过独立验证 | `verified` |
| 交给人类 | `escalated` |

**不允许**的结束方式："做了一些工作，感觉差不多了。"

## 规则

- 一次运行只处理**一个** work item。多个事件 → 多次运行。
- 不派发执行子智能体之前，必须先跑完退出检查与约束加载。
- 执行者**不得**标记自己的 work item 为完成。
- 触及拒绝列表 → 立即 `escalated`，**不执行任何编辑**。
- 尝试 ≥ 3 → 强制 `escalated`，覆盖其他所有规则。
- 合并永远由人工执行（除非命中逐条允许列表）。
- 每轮结束必须写状态。不写状态的运行等于没跑。

## 输出格式

```markdown
## Loop Run — <run_id>

### 事件与路由
- Event: <事件名>
- Item: <item-id>
- Phase: <phase> · Level: <level>
- Skills: <技能列表>

### 执行前检查
- Constraints: N rules active
- Budget: X% (mode: normal | report-only)
- Lock: acquired | skipped (held by <循环>)

### 动作
- <做了什么>

### 验证
- Verifier verdict: APPROVE | REJECT | ESCALATE_HUMAN
- Evidence: <命令 + 结果片段>

### 闸门
- Decision: proceed | escalate | exit
- Gate: <命中的闸门>

### 状态写入
- STATE.md: <更新了什么>
- loop-run-log.md: outcome=<outcome>, tokens_estimate=<n>

### 下一轮
- <下一步或"等待人工">
```

## 与其他技能的关系

- `loop-constraints` — 本技能在第 1 步调用它
- `loop-budget` — 本技能在第 0/4 步调用它
- `loop-guard` — 本技能在第 7 步调用它
- `event-router` — 本技能在第 2 步调用它（或直接跑脚本）
- 其余技能由本技能按 phase 派发
