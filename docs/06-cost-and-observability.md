# 06 · 成本与可观测性

循环跑起来后，成本是隐蔽的，可观测性是必需的。本文档给出估算模型、日志规格和熔断实现。

---

## 成本模型

### 三个乘数

单轮成本 × 每日轮次 × 子智能体数量 = 日成本

| 因素 | 影响 | 说明 |
|---|---|---|
| **节奏** | 线性倍增 | 5 分钟 = 288 次/天；1 天 = 1 次/天 |
| **子智能体数** | 线性倍增 | 执行者 + 验证者 ≈ 单轮的 3–5 倍 |
| **验证器模型** | 质量与成本权衡 | 无人值守循环值得给 verifier 用更强模型 |
| **上下文大小** | 近似二次增长 | 每轮累积，不做管理会爆炸 |

### 空转成本参考

| 场景 | token 量级 |
|---|---|
| 空转退出（无待办） | ~3–5k |
| 只报告一轮 | ~30–80k |
| 含执行者 + 验证者一轮 | ~150–300k |

### 节奏决策表

| 循环 | 节奏 | 每日轮次 | 若每轮都完整运行 | 实际（含提前退出） |
|---|---|---|---|---|
| 每日分诊（仅报告） | 1d | 1 | ~50k | ~50k |
| CI Sweeper | 15m | 96 | ~19M（**灾难**） | ~500k（95% 空转退出） |
| PR Review Triage | 5m | 288 | 极高 | 需提前退出 |

**结论**：高节奏循环的经济性完全依赖提前退出。没有提前退出，15 分钟 cadence 一天就能烧掉一个月的预算。

### 提前退出的实现要点

提示词里的原句：

> If no high-priority items, exit immediately. Do not spawn sub-agents.

并且要**机械可验证**：先跑低成本 triage，只有产出可操作条目时才启动子智能体链。

---

## 预算配置

### `loop-budget.md` 结构

```markdown
| 循环 | 最大运行/天 | 最大 token/天 | 最大子智能体/轮 |
|---|---|---|---|
| Issue Intake | 12 | 80k | 0 (L1) / 1 (L2) |
| PR Review Triage | 96 | 300k | 0 (L1) / 2 (L2) |
| CI Sweeper | 96 | 500k | 3 |
```

### 阈值行为

| 花费 | 动作 |
|---|---|
| < 80% | 正常运行 |
| ≥ 80% | report-only（不派发执行子智能体） |
| ≥ 100% | 立即退出 |
| `loop-pause-all` | 立即退出 |

### 超预算三步

1. 暂停调度器 / 禁用高节奏 workflow
2. 在 `loop-run-log.md` 追加事件记录
3. 在 `STATE.md` 的 High Priority 写一条，通知人工

**不要通过放宽阈值来继续跑。**

---

## 运行日志规格

### 每轮追加一条 JSON

```json
{
  "run_id": "2026-10-13T08:15:00Z",
  "pattern": "pr-review-triage",
  "event": "pull_request_review.changes_requested",
  "item": "pr-123",
  "level": "L2",
  "duration_s": 45,
  "items_found": 4,
  "actions_taken": 1,
  "escalations": 0,
  "tokens_estimate": 52000,
  "worktree": "loop/pr-123-fix-1",
  "outcome": "fix-proposed"
}
```

### `outcome` 枚举

| 值 | 含义 |
|---|---|
| `no-op` | 无待办，提前退出 |
| `report-only` | 产出报告，未改代码 |
| `verified` | 修复通过独立验证 |
| `fix-proposed` | 提出修复，等待验证或人工 |
| `escalated` | 交给人类 |

### 人读摘要

```
2026-10-13 08:15 | pr-review-triage | 4 findings | 1 worktree opened | 0 escalations
```

---

## 指标

| 指标 | 定义 | 健康信号 | 告警线 |
|---|---|---|---|
| 空转率 | `no-op` 占比 | 高节奏循环 > 70% | < 50% 说明 cadence 太密 |
| 误报率 | 人工判定无效的 triage 条目占比 | < 30% | > 30% 停止升级到 L2 |
| 升级率 | `escalated` 占比 | 稳定，**不应为 0** | 0 意味着闸门没在工作 |
| 平均尝试次数 | 每 work item 的尝试数 | < 2 | ≥ 3 频繁出现说明 triage 有问题 |
| 重复失败率 | 同一 job 48h 内再失败 | 趋近 0 | 上升说明修复没触及根因 |
| token 效率 | 每解决一个 work item 的消耗 | 稳定或下降 | 上升说明上下文管理失效 |

**升级率为 0 是一个警告信号，不是好消息。** 它意味着要么闸门条件太松，要么升级没有真正触达人类。

---

## 熔断器

### 三个默认阈值

| 类型 | 默认值 | 含义 |
|---|---|---|
| `stagnation` | 3 | 同一错误签名出现 3 次 |
| `no-progress` | 5 | 连续失败 5 次 |
| `max-iterations` | 10 | 总迭代上限 |

### 账本

`loop-ledger.json`：

```json
{
  "goal": "修复 PR #123 的 CI 失败",
  "pattern": "ci-sweeper",
  "level": "L2",
  "attempts": [
    {
      "iteration": 1,
      "item": "pr-123",
      "action": "minimal-fix: 加 null guard",
      "outcome": "failure",
      "error": "TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:42",
      "tokensUsed": 1800,
      "at": "2026-10-13T08:16:00Z"
    }
  ]
}
```

**失败时 `error` 必填** —— 熔断器靠它检测重复失败。

### 错误签名归一化

抹掉后比较：ISO 时间戳、十六进制地址、路径（折叠为 basename）、行列号、其余数字。

这样 `TypeError at profile.ts:42` 与 `TypeError at profile.ts:87` 会被识别为同一个错误。

### 用法

```bash
node scripts/ledger-check.mjs --ledger loop-ledger.json
node scripts/ledger-check.mjs --ledger loop-ledger.json --stagnation 3 --no-progress 5 --max-iterations 10
```

输出：

```json
{
  "verdict": "stagnation",
  "iterations": 3,
  "consecutive_failures": 3,
  "tokens_used": 5200,
  "exit_code": 2,
  "next": "STOP — do not retry. Write escalation to STATE.md and exit the loop."
}
```

`verdict` 枚举：`ok` | `stagnation` | `no-progress` | `token-budget` | `max-iterations`

**退出码**：`0` = 继续；`2` = 停止。

### 升级时的动作

```bash
# 生成升级说明（含账本摘要）
node scripts/ledger-check.mjs --ledger loop-ledger.json --escalation > escalation.md
```

然后：
1. 写入 `STATE.md` 的 High Priority 区
2. 通过连接器通知人工
3. 退出循环

---

## 可观测性的两个层次

| 层次 | 回答 | 实现 |
|---|---|---|
| **运行时可观测性** | 这次运行发生了什么？ | 运行日志、账本、worktree 路径 |
| **过程可观测性** | 这套系统整体在变好还是变坏？ | 指标趋势、Post-Run Critique、就绪度评分 |

### 运行时

- 每轮追加 JSON 到 `loop-run-log.md`
- 每次尝试追加到 `loop-ledger.json`
- worktree 命名可追溯：`loop/<event>-<item>-attempt<N>`

### 过程

- 每轮 `STATE.md` 的 Post-Run Critique 必须产出一项具体调整
- 定期跑 `node scripts/loop-audit.mjs .` 看就绪度趋势
- 每周读一次运行日志的指标表

---

## 何时降速、暂停、终止

### 降速

- 周中 token 预算 > 80%
- triage 误报率 > 30%
- 同一事项 48h 内升级 2 次以上
- 重大版本发布周（暂停自动修复，切换只报告）

### 暂停

- 正在处理生产事故
- 正在做破坏性数据库模式迁移
- 关键审核者不在岗，同时又启用了自动合并（**不要这样做**）

### 终止

- 持续出现 S2 级失效
- 连续 2 周成本 > 价值
- 团队将所有通知静音
- 模式已被更好的方案替代（例如直接用 CI Action）

终止清单：
1. 删除调度器 / 禁用 automation / 移除 workflow
2. 用 `status: retired` 归档状态文件
3. 在 `stories/` 复盘（可选，但推荐）

---

## 下一步

- 从哪一级开始 → [07-adoption-ladder.md](07-adoption-ladder.md)
- 失效模式 → [05-failure-modes.md](05-failure-modes.md)
- 预算模板 → `loop-budget.md`
