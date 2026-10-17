---
name: harness-consolidate
description: >-
  Stage 3 of harness building: consolidate loop + harness by wiring events, running cycles,
  accumulating lessons, and promoting them into hard rules. Use when a project has a working
  verifier and enforced constraints and now needs to run unattended, learn from its own
  mistakes, and turn experience into rules. Produces event wiring, real run records, and
  promoted lessons.
license: MIT
user_invocable: true
stage: 3
---

# Stage 3 · 巩固（Consolidate）

> **运行位置：本技能只在 harness 包仓库运行。** 它第一步调用 `scripts/harness-stage.mjs`，
> 而装配不会把该脚本复制进消费者仓库。消费者仓库只安装运行/控制技能；阶段推进由包仓库
> （或用户级安装）执行。

**目标**：loop + harness 强化-巩固——**事件接上、循环跑起来、经验自己积累并转正为规则**。

前两个阶段让人机协作可靠；阶段 3 让系统在你不在时也可靠。

对应等级 **L3**：明确边界内无人值守。

## 前置检查

```bash
node scripts/harness-stage.mjs <target>
```

阶段 2 必须是 COMPLETE，**且人工确认过 triage 准确率 > 70%**。

## 判据（8 项，7 机械 + 1 人工）

| # | 判据 | 检查方式 |
|---|---|---|
| 1 | **事件脊已接线** | `.github/workflows/` 有 loop 类 workflow，或 `LOOP.md` 声明调度 |
| 2 | **LESSONS.md 有真实条目** | 含 `Seen N× (日期)` 形式 |
| 3 | **运行日志有真实记录** | `## Log` 章节有含 `run_id` 的 JSON |
| 4 | 成本可观测性齐备 | 预算文档 + 运行日志 + `LOOP.md` 预算章节 |
| 5 | 多循环协调已声明 | `acting_on` 锁 + 优先级表 |
| 6 | **有教训已转正为硬规则** | Promoted 表有记录 |
| 7 | 就绪度评分 ≥ 78 | `loop-audit.mjs` |
| 8 | 跑过一个完整循环周期 | **人工** |

## 执行

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 3
```

补齐：

- 技能：`lesson-harvest`、`signal-gatekeeper`、`post-merge-cleanup`、`release-drafter`
- 事件接线：复制 `examples/github-actions/*.yml` 到 `.github/workflows/`

## 判据 6 是阶段 3 的验收核心

**「有教训已转正为硬规则」比「循环跑起来了」更能说明系统在工作。**

循环跑起来只是机械动作。教训转正说明系统完成了这个闭环：

```
发现返工 → 记进 LESSONS.md → 再次出现 → 第三次出现
    → 转正为硬规则 → 下游强制执行 → 下次不再犯
```

**没有这个闭环，循环只是重复劳动，不会变好。**

这个闭环跑通一次，才证明"经验→规则"的棘轮真的在转。

### 棘轮机制

```
Seen 1×  → 只记录（可能是一次性偶发）
Seen 2×  → 继续观察
Seen 3×  → 转正进 loop-constraints.md → 之后每个 PR 审查逐条对
```

**延迟提升是关键。** 一条经验第一次出现时不够格成为规则。这避免了两种错误：

- 过早立规矩 → 一次偶发变成制度，规则库被噪声污染
- 从不立规矩 → 经验永远停在笔记里，没人执行

`Seen N×` 是让这个判定可机械执行的支点。

### 转正后的必做检查

规则进了约束文件但 verifier 没读，**等于没转正**。

转正后确认：

1. `loop-verifier` 的检查项包含新规则
2. `minimal-fix` 的约束包含新规则
3. 在 `LESSONS.md` 的 Promoted 表记录：规则、日期、曾出现次数、证据、现在的位置

## 事件接线

**workflow 不执行 agent 逻辑。** 它只做两件事：

1. 调用 `event-router.mjs` 确定阶段、技能、闸门
2. 把结果写进 `.loop/queue/`

真正的 agent 执行由 agent 平台消费这些产物完成。

**为什么这样设计**：路由逻辑与执行平台解耦。换平台（Claude Code → Codex → 本地调度器）时事件脊不用重写。

### 必须配置

| 项 | 值 |
|---|---|
| Secret | `LOOP_BOT_TOKEN`（独立机器人账号） |
| 权限 | `issues: write`、`pull_requests: write`（仅 comment/label）、`contents: read` |
| **禁止** | **不授予 merge 相关权限** |

### 非 GitHub 平台

`LOOP.md` 里声明调度也算接线：

```yaml
issue_intake:        on: [issues, issue_comment]
ci_sweeper:          on: [check_suite, workflow_run]
daily_triage:        cron: "0 8 * * 1-5"
lesson_harvest:      cron: "0 3 * * *"
```

## 多循环协调

判据 5 要求声明 `acting_on` 锁与优先级表。

### 优先级（冲突时高优先级先执行）

| 优先级 | 循环 | 理由 |
|---|---|---|
| 1 | CI Sweeper | main 红色阻塞所有工作 |
| 2 | Merge Gate | 合并闸门有时效性 |
| 3 | PR Review Triage | 活跃 PR 需要及时反馈 |
| 4 | Post-Merge Cleanup | 非高峰运行，紧迫性最低 |
| 5 | Release Drafter | 只读为主，可安全并发 |

### 冲突避免

1. 每个循环在 `STATE.md` 的 Active 表写入 `acting_on: <branch|pr-id>`
2. 派发前读 `STATE.md`，若冲突则跳过并记录 `outcome: "no-op"`
3. **同一分支每小时最多一个循环修改**

## 两个必须人工确认的动作

### 1. 确认跑过一个完整循环周期

脚本能检测"有真实活动"，但无法判断这个周期是否**完整**（从事件触发到验证到状态写入，全链路走通）。

**完整周期 = 事件 → 路由 → 派发 → 验证 → 闸门 → 状态写入。**

### 2. 观察一周，确认指标健康

指标健康不是阶段判据项，但它是人工确认完整周期后的常规观察项——下面的表是观察参考，不是第 9 项判据。

| 指标 | 健康信号 | 告警线 |
|---|---|---|
| 空转率（`no-op` 占比） | 高节奏循环 > 70% | < 50% 说明 cadence 太密 |
| 误报率 | < 30% | > 30% 回阶段 2 收紧 triage |
| **升级率** | 稳定，**不应为 0** | 0 意味着闸门没在工作 |
| 平均尝试次数 | < 2 | ≥ 3 频繁出现说明 triage 有问题 |
| token 效率 | 稳定或下降 | 上升说明上下文管理失效 |

**升级率为 0 是警告信号，不是好消息。** 它意味着要么闸门条件太松，要么升级没有真正触达人类。

## 依据

| 来源 | 内容 |
|---|---|
| **LHE** 六原语 | automations / worktrees / skills / connectors / sub-agents / external state |
| **LHE** 图工程 | 多循环在规模化下必然长出结构性问题（Goodhart / 向上盲区 / 循环冲突） |
| **LEC** 事件驱动 | 最省钱——没有事件就没有运行，空转成本接近零 |
| **LEC** 多循环优先级 | CI Sweeper → Merge Gate → PR Review → Post-Merge → Release |
| **LEC** 成本可观测 | 80% 降级，100% 退出；高节奏必须提前退出 |
| **magpie** 夜审 | 每晚扫当天 commit，写 LESSONS.md |
| **magpie** 棘轮 | 3 个不同日期 → 转正为硬规则 |
| **magpie** 成本分层 | 廉价模型门卫，不相关信号直接丢弃 |

## 退出条件

```bash
node scripts/harness-stage.mjs <target> --stage 3 --require
# 退出码 0 = 7 项机械判据全过
```

**加上人工确认跑过一个完整循环周期。**

## 阶段 3 之后的维护

三阶段完成不是结束，是进入维护循环：

| 周期 | 动作 |
|---|---|
| 每天 | 夜审自动跑，写 `LESSONS.md` |
| 每周 | 读运行日志指标表；确认升级率非 0 |
| 每月 | 检查有没有教训该转正但没转正 |
| **每季度** | **做一次消融测试** |

### 季度消融是必须的

每个 harness 组件都编码了"模型做不到什么"的假设。模型变强后假设会过期。

流程：

1. 取质量快照
2. 移除一个 harness 组件
3. 跑基准任务集
4. 再取快照
5. 对比：**分数没掉说明该组件冗余**，可以删；掉了就恢复

不检查就会积累冗余约束——它们不提升可靠性，只消耗上下文。

## 常见错误

| 错误 | 后果 |
|---|---|
| 未跑通转正闭环就宣称完成 | 循环只是重复劳动，经验不积累 |
| 转正后没同步 verifier | 规则进了约束文件但没人读，等于没转正 |
| 授予 bot merge 权限 | 未经审查的代码自动进 main |
| 高节奏循环没有提前退出 | 15 分钟 cadence 一天 96 次，每次空转 5k 就是 480k 纯浪费 |
| 升级率为 0 却不检查 | 闸门可能没在工作 |
| 从不做季度消融 | 冗余约束累积，只耗上下文不提升可靠性 |

## 下一步

三阶段完成后进入维护。持续动作：

- 夜审每天写 `LESSONS.md`
- 每月检查转正
- 每季度做消融测试

若要新增循环，在 `LOOP.md` 注册并在 `patterns/registry.yaml` 登记。
