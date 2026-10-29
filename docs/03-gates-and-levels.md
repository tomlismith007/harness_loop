# 03 · 闸门与等级：什么条件下允许做什么

本文档定义 L1–L2 两个阶段等级、闸门规则和判定逻辑。它是闸门脚本的规格说明（消费方运行 `.claude/skills/harness-loop/scripts/gate-check.mjs`）。

---

## 就绪度等级

等级决定**循环被允许做什么**，不是"配置复杂度"。

| 等级 | 名称 | 允许 |
|---|---|---|
| **L1** | 报告 | 分析、报告、更新状态。**不改代码，不合并** |
| **L2** | 辅助 | 在 worktree 中提出修复，由 verifier 验证。**合并仍需人工** |

本框架不授予 L3。无人值守需要事件接线与长期运行记录，不由文档或分数授予（见文末"等级与阶段"）。

### 为什么必须从 L1 开始

L1 的唯一目的是**校准 triage 的准确度**。如果 triage 有一半是误报，L2 的自动修复会在错误的目标上浪费 token，而且会消耗人对系统的信任。第一周只看报告，人工判断哪些是真的、哪些是噪声，然后调整技能规则。

**在生产仓库中绝不跳过 L1。**

---

## 闸门

闸门是"允许继续"的条件。任一不通过，work item 进入 `escalated`。代码里的 gate 名共 11 个
（顺序即判定顺序，由 `gate-check.mjs` 的 `GATE_ORDER` 定义，测试断言本文与它一致）：
`pause`、`wip-limit`、`dirty-tree`、`denylist`、`untrusted-shape`、`scope`、`head-commit`、`red-check`、
`verification-evidence`、`verification`、`awaiting-verification`。

「该不该继续试」不在这里判：尝试次数是账本的事实，归 `ledger-check.mjs --item <id>` 的
`attempt-limit`（默认 3）。闸门只看这次改动本身。

### 1. 拒绝列表闸门（Denylist Gate）

**判定**：diff 中是否有文件命中 `harness-constraints.md` 的 `## Paths`（缺省回落 `loop-constraints.md`）。

```
.env, .env.*, **/secrets/**, **/credentials/**, **/*_key*, **/*_secret*,
.terraform/**, k8s/production/**, **/migrations/**, auth/**, payments/**, billing/**
```

**动作**：命中即 `escalated`，**且不执行任何编辑**。不做"顺便的小改动"。

**为什么**：这些路径的改动代价不对称。改错一个测试文件，回滚即可；改错一个支付逻辑或生产配置，代价可能是资金或数据。循环不值得在这类路径上冒险。

### 2. 范围闸门（Scope Gate）

**判定**：改动的文件数量与相关性。

| 条件 | 动作 |
|---|---|
| 单个修复改动 > 5 个文件 | `escalated`（可能需要设计变更） |
| 改动包含与 work item 无关的文件 | `escalated`（范围蔓延） |
| 清理类 PR 改动 > 10 个文件 | 人工审批（不自动合并） |

阈值来源：`harness-constraints.md` 的 `## Code`（5）与 `loop-constraints.md` 的 `## Cleanup`（10）。

**为什么**：范围蔓延是 agent 的典型失败模式。表现为改了 12 个文件、800 行代码，却没有一条端到端可用的路径。小 diff 是可靠性的前提。

### 3. 尝试上限（Attempt Limit）—— 由熔断器判定，不是闸门

**判定**：`loop-ledger.json` 里该 item 的尝试数 ≥ 3（`ledger-check.mjs --item <id>`）。

**动作**：强制 `escalated`，**覆盖其他所有规则**。

**为什么**：三次尝试不成功说明问题不在实现细节，而在理解层面——可能是根因判断错了、需求不清楚、或者是环境问题。继续重试只会烧 token 并污染状态。
计数必须来自账本：曾经这条判定读的是命令行参数 `--attempts`，传 0 就能在账本已有 5 次失败时继续。
阈值来源：`loop-constraints.md` 的 `## Attempts & Ledger`；旧布局回退 `harness-constraints.md` 的 `## Code`。

熔断器的三个阈值（见 `docs/05-failure-modes.md` 第六节）：

| 类型 | 默认阈值 |
|---|---|
| 同一错误重复 | 3 次 |
| 连续失败 | 5 次 |
| 当前 item 的迭代 | 10 次（传 `--item`） |

### 4. 验证闸门（Verification Gate）

**判定**：独立验证者是否实际运行了测试并给出 `APPROVE`。

| 条件 | 动作 |
|---|---|
| verifier 未实际运行测试 | 不通过（不得只凭 diff 判断） |
| verifier 无法运行测试（环境问题） | `ESCALATE_HUMAN`，不放行 |
| verifier 与执行者是同一会话 | 不通过（结构性无效） |
| 发现测试被禁用/跳过/注释 | `REJECT` + 记录为作弊 |

**为什么**：写代码的模型给自己打分系统性偏高。这不是诚实问题，是生成模型的性质——它在生成过程中说服了自己。

### 6. 合并闸门（Merge Gate）—— 默认关闭

**默认：不自动合并。** 只有以下情况例外：

| 允许自动合并 | 不允许 |
|---|---|
| 修正注释/文档中的拼写错误 | 行为变更 |
| 仅自动修复测试文件中的 lint 问题 | 依赖版本升级 |
| 调整导入顺序 | 锁文件变更 |
| 允许列表内 `docs/` 路径的配置 | 任何拒绝列表路径 |

允许列表必须写入 `loop-auto-merge-allowlist.md`，且**必须逐条列出路径**，不接受模式化的宽松规则。

> **该文件目前不存在，也不在脚手架里生成。** 它只在真的要开启自动合并时才需要创建。当前没有任何代码路径会执行自动合并，所以缺失是安全的；也正因为如此，"允许列表"这一项在升级检查里不适用。

---

## 判定优先级

闸门按以下顺序检查，**先命中者决定结果**：

```
1.  loop-pause-all 生效？          → exit 3（gate-check 读 --state 目录）
2.  `## Active` 多于一项 / 表损坏？  → escalate（wip-limit）
3.  gate 阶段工作区有未提交改动？    → escalate（dirty-tree）
4.  触及拒绝列表？                  → escalate（不执行编辑）
5.  第三方条目未包成 code span？     → escalate（untrusted-shape）
6.  改动超过约束文件的文件数阈值？    → escalate（scope）
7.  gate 阶段 sha 缺失 / 不一致？    → escalate（约束 7）
8.  回退测试 fail；behavior 类 not-run？ → escalate（约束 8）
9.  approve 但证据缺失 / 自相矛盾 / 缺 Checks not run / 无输出片段？ → escalate
10. verifier reject / escalate-human？ → escalate
11. gate 阶段无 verdict？            → escalate（awaiting-verification）
```

预算（`## Budget`）与尝试上限由 `ledger-check.mjs` 判定，不属于闸门：
`report-only` 是它的 verdict，不是闸门的 decision。

顺序有讲究：**退出类判定在最前**（避免在应该停的时候还在分析），**WIP 与拒绝列表在内容检查之前**（前置条件与安全优先于效率）。

第 5、6 条对应 `loop-constraints.md` 的两条硬约束，此前本文档完全没有列出——
读者按这份清单理解闸门会漏掉它们。第 7 条在 `--phase gate` 且 verdict 为 `approve` 时
还要求提供 `--evidence-file`：**verdict 是断言，不是证据**，闸门会读那份报告并核对
它是否带有 verdict 行与命令行证据。

### 机械判定 vs 人工判定

本文档描述的部分判定**无法机械执行**，应当标为人工项而不是假装能自动检查——
这与 `docs/archive/11-three-stages.md` 处理阶段 2 判据的原则一致（"判断力无法被 grep 替代，
把它标成人工项比让它假绿诚实"）。

| 判定 | 类型 | 说明 |
|---|---|---|
| 拒绝列表命中 | **机械** | `gate-check.mjs` 先读 `harness-constraints.md` 的 `## Paths`，缺省回落 `loop-constraints.md` |
| 文件数超限 | **机械** | `gate-check.mjs` 数 diff 清单 |
| head-commit 一致 | **机械** | 所有改动类型都要求 reviewed/head 相等；CLI 还要求显式 head 等于 Git 实际 HEAD，证据重放结束后再次核对 HEAD 与工作区 |
| 回退测试结论 | **机械** | 读 `--red-check` 的值；`behavior` 类强制，其余三类要求报告里写理由 |
| kill switch | **机械** | `gate-check.mjs --state` 读 `STATE.md` / `harness-constraints.md` / `loop-constraints.md` 里独占一行的 `loop-pause-all` |
| **改动是否与 work item 相关** | **人工** | 脚本不知道 work item 的目标，无法判定"范围蔓延" |
| **verdict 是否诚实** | **半机械** | 闸门会重放证据里的命令并比对退出码；能抓"报告说 PASS、命令实际失败"，抓不到"命令覆盖不到这次改动" |
| 证据命令重放 | **机械** | `gate-check.mjs` 在 `--evidence-cwd` 下执行报告中的 `Tests: <command> → PASS` 命令；`--no-replay` 或非行为类自动跳过并记 NOT RUN；重放后仍须保持已审 HEAD 与干净工作区 |

---

## `.claude/skills/harness-loop/scripts/gate-check.mjs` 用法

```bash
node .claude/skills/harness-loop/scripts/gate-check.mjs \
  --item pr-123 \
  --phase gate \
  --attempts 1 \
  --diff-files @changed.txt \
  --verdict approve \
  --state . \
  --reviewed-sha "$(git rev-parse HEAD)" \
  --head-sha "$(git rev-parse HEAD)" \
  --red-check pass \
  --implementer implementer-1 \
  --evidence-file verifier-report.md
```

三个容易写错的地方：

| 写法 | 后果 |
|---|---|
| `--diff-files changed.txt`（少了 `@`） | 脚本发现内容是路径清单 → **参数错误退出 1**。此前单行清单会被当成单一路径，拒绝列表静默失效 |
| `--pause false` | `--pause` 是布尔标志，`false` 会被当成位置参数 → `pause=true` → **永久紧急刹车**。要显式传假用 `--pause=false`，或干脆省略（省略即假） |
| `--verdict ESCALATE_HUMAN` | 大小写与连字符会被归一化，两种写法都接受（验证者的输出格式是大写下划线） |

kill switch 由 `gate-check.mjs` 自己读取（`--state` 指向的目录下查 `STATE.md`、`harness-constraints.md` 与 `loop-constraints.md`）：

```bash
node .claude/skills/harness-loop/scripts/gate-check.mjs --item pr-1 --phase fix --diff-files a.ts --state .
# exit 0 = proceed；exit 3 = 立即退出（kill switch 生效）
```

输出：

```json
{
  "item": "pr-123",
  "phase": "gate",
  "attempts": 1,
  "files_changed": 1,
  "verdict": "approve",
  "decision": "escalate",
  "gate": "denylist",
  "reason": "changed file 'auth/session.ts' matches denylist pattern 'auth/**'",
  "denylist_hits": [
    { "file": "auth/session.ts", "pattern": "auth/**" }
  ],
  "allowed_actions": [],
  "exit_code": 2,
  "next": "write escalation entry to STATE.md, notify human, do not edit"
}
```

上面这段输出是上面那条命令**实际产生**的（`changed.txt` 含 `auth/session.ts`）。
此前文档里的示例输出不可能由文档里的命令产生——说明那个示例从未被执行过，
而这正是"文档说 A、代码做 B"这类漂移最容易藏身的地方。

`decision` 枚举：`proceed` | `escalate` | `exit`。

**退出码**：`0` = `proceed`；`2` = `escalate`；`3` = `exit`。
**参数错误（未知标志、非法枚举值、非数字阈值）退出 `1`**——它不属于上面四态，
所以调用方必须把它当"我没问对问题"处理，而不是当"闸门通过了"。

---

## 等级与阶段

v2 移除了 0–100 的就绪度评分（它被技能存在性抬高，分数高不等于机制在跑）。
等级改由 `harness-stage.mjs` 的机械判据直接给出：

| 等级 | 判据 |
|---|---|
| L1 | 阶段 1 的 7 项全过：6 个地基文件 + `init.sh` 真的能跑通 |
| L2 | 阶段 2 的机械判据全过：账本、运行日志、验证入口、真实命令、本地化拒绝列表、两份拒绝列表一致、护栏演练记录。`NOT RUN` 不算通过 |

没有 L3。无人值守不是靠分数授予的——它需要事件接线与长期运行记录，本框架不再假装能机械判定。

---

## 危险信号（出现即停止修复后再继续）

- 同一 PR 已自动尝试修复超过 3 次却没有进展
- verifier 与执行者使用同一个智能体会话
- 没有状态文件——循环每轮都失去记忆
- 无论是否有新发现，每轮都发送通知
- 未设置路径允许列表，却启用了自动合并
- 升级只写进状态文件，但没人会读那个文件

---

## 下一步

- 安全护栏的完整规则 → [04-safety.md](04-safety.md)
- 循环出错时的诊断 → [05-failure-modes.md](05-failure-modes.md)
- 从哪一级开始 → [archive/07-adoption-ladder.md](archive/07-adoption-ladder.md)
