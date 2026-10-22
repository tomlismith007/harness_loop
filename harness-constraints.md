# Harness Constraints

> 单次运行的底线：拒绝列表、代码规则、沟通与紧急刹车。
> **阶段 1 就有这份文件**——它不依赖 loop 机制（账本、熔断、运行日志）。
> `/harness-loop` 每轮开始读它；`loop-constraints.md`（若存在）随后读。

## 加载确认

每轮开始必须输出一行：

```
Constraints loaded from loop-constraints.md: N rules active.
```

若本文件不存在，回退到 `docs/04-safety.md` 的默认最小约束集，并明确说明正在使用回退集。

## Push & Merge

- 推送前必须先说明将要推送什么。
- 未经人工批准，绝不自动合并到 main。
- 始终先创建 draft PR；由人 review 后再标记 ready。
- 合并由人工执行。循环只提议。
- **合并必须绑定审查过的 commit**：`gh pr merge --match-head-commit <审过的 sha>`。
  审查期间若有人又 push，head commit 变了，合并直接失败。这比"策略上要求重新审查"强——
  策略靠自觉，`--match-head-commit` 靠 git 本身拒绝。

## Paths（拒绝列表 — 触及即升级，绝不编辑）

```
.env
.env.*
**/secrets/**
**/credentials/**
**/*_key*
**/*_secret*
.terraform/**
k8s/production/**
**/migrations/**        # 除非有明确的迁移循环
auth/**
payments/**
billing/**
harness-constraints.md
loop-constraints.md
scripts/gate-check.mjs
scripts/ledger-check.mjs
scripts/lib/common.mjs
.github/workflows/**
package.json
package-lock.json
templates/**
.githooks/**
scripts/test.mjs
scripts/state-write.mjs
scripts/state-commit.mjs
scripts/sync-skills.mjs
# 技能目录里的副本：与源同权。改副本再跑 sync-skills 会覆盖受保护的源，
# 所以副本必须和源一样拦。`scripts/*.mjs` 这些逐条模式对副本不生效。
skills/*/scripts/**
skills/*/templates/**
audits/**
```

- 命中任一模式的路径：**停止编辑，写升级条目，交给人**。不做"顺便的小改动"。
- 拒绝列表路径的改动由人工合并，即使 verifier 通过。

## Code

- 提议修复前必须跑测试（`npm test` 或项目等价命令）。
- 绝不禁用测试、跳过断言或注释掉检查来让 CI 变绿。
- 绝不重构无关代码 —— 一轮一个修复。
- 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级。
  <!-- 阈值来源：本行由 gate-check.mjs 的 loadLimits 解析；改数字即改变 scope 闸门的行为 -->
- 每个 work item 最多 3 次修复尝试；之后升级。
  <!-- 阈值来源：ledger-check.mjs 的 attempt-limit 从本行读取；计数来自 loop-ledger.json，不是命令行参数 -->
- 机械执行尝试上限：每次尝试追加到 `loop-ledger.json`，重试前跑 `node scripts/ledger-check.mjs --item <id>`。
- change-class 由执行者在 gate 前声明（`--change-class`），验证者必须在报告里复核；
  错报 change-class 等同伪造证据。

## Communication

- 做之前先说明将要做什么。
- 未经批准不关闭 issue 或 PR。
- 只在需要人工决策时通知，不做状态播报。

## Kill Switch

- `loop-pause-all` **独占一行**写在 `STATE.md` 或本文件里 → 立即退出，在 `STATE.md` 写一行说明。
- 散文里提到不算；清除标记后人工重启。
- `gate-check.mjs --state <dir>` 会真的读它并返回退出码 3。

## Worktrees

- 无人值守的代码改动必须在独立 git worktree 中进行。
- 一个修复一个 worktree；验证者 REJECT 或升级后丢弃，不留残留分支。

## Data

- 绝不把 API key、token、凭据粘贴进调度提示词或状态文件。
- CI 日志可能含机密；写入状态文件前必须脱敏。
- `STATE.md` 会被提交，**不得包含任何凭据**。

---

<!-- 仓库特定规则写在下方。上面的默认集可以收紧，不可以放宽。 -->

