---
name: harness-loop
description: >-
  Orchestrate the full issue/PR event spine: route an incoming repository event to its
  phase, load constraints, check budget, dispatch the right skill, enforce gates, and
  persist state. Use this as the top-level entry when an event arrives (issue opened,
  PR review requested changes, CI failed, PR merged, tag pushed) and something needs to
  happen. Reach for it whenever you need to decide "what should happen next" rather than
  executing one specific action. Can be invoked by hand, but then the caller must supply
  the event name and target (e.g. --event pull_request_review.changes_requested
  --target pr-123) — step 2 has nothing to route without them. Requires event wiring
  (.github/workflows/ with a script call, or a schedule declared in LOOP.md); without it,
  step 0 exits with outcome "no-wiring" and asks for stage 3.
license: MIT
stage: runtime
user_invocable: true
---

<!-- stage: runtime = 不属于任何建设阶段，任何阶段都安装。
     但它需要阶段 3 的事件接线才跑得起来——所以第 0 步会检查并直接退出。
     这条边界是本技能自己执行的，不依赖任何人记住阶段。 -->

# Harness Loop — 顶层编排

把一条事件跑完：路由 → 约束 → 预算 → 派发 → 闸门 → 状态。这是所有循环的入口。

**不是**用来执行具体动作的——具体动作由 `issue-triage`、`minimal-fix`、`loop-verifier` 等技能完成。这个技能负责**决定派发谁、什么时候停、什么时候交给人**。

## 一次运行的完整流程

### 第 0 步：退出检查（先做，成本最低）

按顺序检查，任一命中即退出，不继续：

1. **暂停与预算**（一个命令给出两个答案）→ 任一命中即 **立即退出**：

   ```bash
   node scripts/budget-check.mjs --pattern <pattern-id> --json
   ```

   退出码 `3` = 立即退出（`loop-pause-all` 生效，或预算 ≥ 100%）；`report-only` = 不派发执行子智能体。
   kill switch 只认 `STATE.md` / `loop-constraints.md` 里**独占一行**的 `loop-pause-all`——
   散文里提到不算，否则一次说明性文字就把循环永久停死。
   预算按**该循环自己的上限**算，不是全表最大值。

2. **事件接线是否存在** → **未接线即退出**，记 `outcome: "no-wiring"`，提示"本项目未接事件，请先跑阶段 3（`/harness-consolidate`）"
3. **是否有待办** → 无待办则 **在 <5k token 内退出**，记 `outcome: "no-op"`：

   ```bash
   node scripts/queue-read.mjs --json
   ```

   它按顺序读 `.loop/queue/`（事件接线写的位置），为空则回落到 `STATE.md` 的
   High Priority 区（本地手动用法）。输出里始终写明读的是哪个来源——
   **"队列为空"与"没读到"必须可区分**，否则空转会伪装成"跑过了"。

第 2 条是本技能**自己执行的边界**，不依赖任何人记住项目到了哪个阶段：

```bash
node -e "import('./scripts/lib/common.mjs').then(m=>{
  const r = m.hasEventWiring(process.cwd());
  console.log(r.wired ? 'wired: ' + r.detail : 'NOT wired: ' + r.detail);
})"
```

未接线说明**没有任何来源会派发事件**——继续走完 8 步只会对着空队列空转，然后把"没做事"记成一次正常运行。与判据 3 的区别要分清：

| 情况 | 结论 | 记什么 |
|---|---|---|
| 没有 `.github/workflows/` 且 `LOOP.md` 未声明调度 | 未初始化 | `outcome: "no-wiring"`，退出 |
| 接线存在，但队列为空 | 正常空转 | `outcome: "no-op"`，<5k token 退出 |

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
node scripts/event-router.mjs --event <事件名> --item <item-id> --target <branch|pr-id>
```

`--target` **不可省**：它是锁键（`acting_on`，即分支名或 PR 号），不是 work item id。
省略它时 `event-router` 不做冲突检测，直接返回路由结果——第 3 步会读不到任何锁，
"同一分支每小时最多一个循环修改"就静默失效了。

拿到：`phase`、`skills`、`level`、`gates`、`next`，以及可能的 `conflict: "lock-held"` 与 `held_by`。

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
  --diff-files @changed-files.txt \
  --verdict <approve|reject|escalate-human|none> \
  --budget-pct <n>
```

六个**不可省**的参数，省掉会让对应闸门失效或必然升级：

| 参数 | 何时必须 | 省掉的后果 |
|---|---|---|
| `@` 前缀 | 永远 | 裸路径被当成"单个改动文件"，**拒绝列表闸门静默失效**（`.env` 会被判为"无命中"） |
| `--reviewed-sha` + `--head-sha` | `--phase gate` | 必然 `escalate`（约束 7：合并绑定审过的 commit） |
| `--red-check <pass\|fail\|not-run>` | `--phase gate` | `not-run` 时必然 `escalate`（约束 8：回退测试） |
| `--evidence-file <path>` | `--phase gate` 且 verdict 为 `approve` | 必然 `escalate`（verdict 是断言，不是证据） |
| `--not-run <list>` | 有未跑的检查时 | 未跑项不出现在输出里（约束 9） |
| `--constraints-root <dir>` | 目标不在 cwd 时 | 拒绝列表读错文件 |

verdict 词汇映射（`loop-verifier` 的输出 → 本脚本的枚举）：

| loop-verifier | gate-check |
|---|---|
| `APPROVE` | `approve` |
| `REJECT` | `reject` |
| `ESCALATE_HUMAN` | `escalate-human` |

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
| 未接事件脊，第 0 步退出 | `no-wiring` |
| 无待办，提前退出 | `no-op` |
| 产出报告，未改代码 | `report-only` |
| 提出修复，等待验证 | `fix-proposed` |
| 修复通过独立验证 | `verified` |
| 交给人类 | `escalated` |

`no-wiring` 与 `escalated` 都指向人，但含义不同：`no-wiring` 是**项目还没到阶段 3**，不是出了问题；`escalated` 是有问题需要人处理。别把前者记成后者，否则阶段推进的信号会丢在噪声里。

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
