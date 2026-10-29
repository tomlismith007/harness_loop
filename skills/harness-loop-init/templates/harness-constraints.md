# Harness Constraints

> 单次运行的底线：拒绝列表、代码规则、沟通与紧急刹车。
> **阶段 1 就有这份文件**——它不依赖 loop 机制（账本、熔断、运行日志）。
> `/harness-loop` 每轮开始读它；`loop-constraints.md`（若存在）随后读。

## 加载确认

每轮开始必须输出一行：

```
Constraints loaded from harness-constraints.md (+ loop-constraints.md): N rules active.
```

## Push & Merge

- 推送前必须先说明将要推送什么。
- 未经人工批准，绝不自动合并到 main。
- 合并由人工执行。循环只提议。
- **合并必须绑定审查过的 commit**：`gh pr merge --match-head-commit <审过的 sha>`。
  审查期间若有人又 push，head commit 变了，合并直接失败。

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
skills/*/scripts/**
skills/*/templates/**
.github/workflows/**
package.json
package-lock.json
templates/**
```

- 命中任一模式的路径：**停止编辑，写升级条目，交给人**。不做"顺便的小改动"。
- 拒绝列表由技能目录内的 `gate-check.mjs` 强制执行（`.claude/skills/harness-loop/scripts/gate-check.mjs`）；改这里就会真的改变行为。

## Code

- 工作规则（一次一个 work item / 不验证不宣称完成 / 完成定义）见 `AGENTS.md` 的「工作规则」；
  本节只列可被脚本解析的阈值。
- 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级。
  <!-- 阈值来源：本行由 gate-check.mjs 的 loadLimits 解析；改数字即改变 scope 闸门的行为 -->

## Communication

- 做之前先说明将要做什么。
- 未经批准不关闭 issue 或 PR。
- 只在需要人工决策时通知，不做状态播报。

## Data

- 绝不把 API key、token、凭据粘贴进提示词或状态文件。
- CI 日志可能含机密；写入状态文件前必须脱敏。
- `STATE.md` 会被提交，**不得包含任何凭据**。

---

<!-- 仓库特定规则写在下方。上面的默认集可以收紧，不可以放宽。 -->

> loop 运行规则（账本、尝试上限、kill switch、worktrees）见 `loop-constraints.md`（阶段 2 安装）。

