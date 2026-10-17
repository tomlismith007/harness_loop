# Loop Constraints

> `loop-constraints` 技能在**每一轮开始时**读取本文件，并在任何动作之前加载全部规则。
> 本文件中的约束是**绑定的**——agent 必须遵守。冲突时本文件优先于任何其他指令。

## 加载确认

每轮开始必须输出一行：

```
Constraints loaded from loop-constraints.md: N rules active.
```

若本文件不存在，回退到 `docs/04-safety.md` 的默认最小约束集，并明确说明正在使用回退集。

## Push & Merge

- **[约定]** 推送前必须先说明将要推送什么。
- **[机制]** 未经人工批准，绝不自动合并到 main（`registry.yaml` 的 `auto_merge: false`；
  所有示例 workflow 都断言不含 `gh pr merge`）。
- **[约定]** 始终先创建 draft PR；由人 review 后再标记 ready。
- **[约定]** 合并由人工执行。循环只提议。
- **[机制]** 合并必须绑定审查过的 commit：`gh pr merge --match-head-commit <审过的 sha>`。
  `gate-check` 比对 `--reviewed-sha` 与 `--head-sha`，不一致即 escalate；
  `merge-gate.yml` 只在最后一条 review 是 APPROVED 时取它的 commit，无批准不回退成 head。

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
```

- **[机制]** 命中任一模式的路径：**停止编辑，写升级条目，交给人**。不做"顺便的小改动"。
  （`gate-check` 读本文件的 `## Paths` 块，命中即 escalate；`merge-gate` 用 `@` 传清单。）
- **[约定]** 拒绝列表路径的改动由人工合并，即使 verifier 通过。

## Code

- **[约定]** 提议修复前必须跑测试（`npm test` 或项目等价命令）。
- **[机制]** 绝不禁用测试、跳过断言或注释掉检查来让 CI 变绿（`loop-verifier` 的
  No Cheating 清单 + `gate-check` 的 red-check 闸门；示例 workflow 断言不含 `gh pr merge`，
  但"没有禁用测试"本身靠 verifier 读取）。
- **[约定]** 绝不重构无关代码 —— 一轮一个修复。
- **[机制]** 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级
  （`gate-check` 的 scope 闸门：`max_files_per_fix: 5`，清理类 10）。
- **[约定]** 每个 work item 最多 3 次修复尝试；之后升级。
- **[机制，未接线]** 尝试上限的代码入口是 `ledger-check.mjs`（`stagnation` 3 /
  `no-progress` 5 / `max-iterations` 10）。但**本包不含写账本的运行器**，
  `merge-gate` 也不传 `--attempts`——没有外部平台写 `loop-ledger.json` 时，
  这条闸门在生产路径上不生效。按 NOT RUN 对待。

## Verification

- **[约定]** 执行者**不得**标记自己的 work item 为完成。`loop-verifier` 判定。
- **[约定]** verifier 必须实际运行测试并报告输出片段，不得只凭 diff 判断。
- **[机制]** verifier 无法运行测试（环境问题）→ `ESCALATE_HUMAN`，不要放行
  （`gate-check`：`--verdict escalate-human` 或证据缺失都 escalate）。
- **[机制]** **回退测试（Red check）**：新增的测试必须能在修复前的代码上真的挂掉，且失败信息要指出
  是哪个行为错了。编译不过、测试被跳过、测试通过——都不算通过。
  `gate-check --red-check fail|not-run` 在 gate 阶段一律 escalate。
- **[机制]** **未跑必须写明**：`A check that wasn't run is listed as not run, never left out.`
  报告必须区分 PASS / FAIL / **NOT RUN** 三态，不允许"没提"。
  `gate-check` 要求 `### Checks not run` 节存在，且证据里的 NOT RUN 必须列进该节；
  全 NOT RUN 的 APPROVE 直接 escalate。
- **[约定]** **真实使用验证**：改了哪家厂商的接入，就得拿真账号、真配置、真接口验。没实测过的功能，
  不许在上面接着开发，也不许跟用户说能用。
- **[机制]** **可执行入口规则**：任何被文档描述为"机械判定"的机制，必须有一个真正读它的代码入口，
  且其行为被测试断言。测试**不得**只断言配置文件里写着某个值——必须断言**改动该值会改变行为**。
  判别方法：把配置改掉，如果测试还是绿的，这个配置就是装饰品。
  一个永远生效不了的闸门，和一个不存在的闸门，在退出码上不可区分。
  正面例子见 `test.mjs` 第 17 节：改 `registry.yaml` 的 `stagnation` 为 1 →
  `ledger-check` 必须在 1 次重复失败后熔断；改 `max_attempts` 为 1 → `gate-check` 必须 escalate。

## Lessons

- **[约定]** 夜审循环（`lesson-harvest`）每天扫当天 commit，把教训写进 `LESSONS.md`。
- **[约定]** 同一条教训在 **3 个不同日期**出现 → 转正进本文件，从经验变成硬规则。
- **[约定]** 转正后，`loop-verifier` 的检查项必须包含它。规则进了约束文件但 verifier 没读，等于没转正。

## Communication

- **[约定]** 做之前先说明将要做什么。
- **[约定]** 未经批准不关闭 issue 或 PR。
- **[约定]** 只在需要人工决策时通知，不做状态播报。

## Budget

- **[机制]** token 花费达到日上限 **80%** → 切换到 report-only 模式（不派发执行子智能体）。
- **[机制]** token 花费达到 **100%**，或 `loop-pause-all` 生效 → **立即退出**，在 `STATE.md` 写一行说明。
  （`budget-check.mjs` 读 `loop-budget.md` 与 run-log；没有 per-loop 上限时同样退出。）
- **[约定，未接线]** 不超过 `loop-budget.md` 中每个循环的 `max sub-agent spawns/run`——
  该列没有代码消费者；本包也不派发子智能体。

## Worktrees

- **[约定]** 无人值守的代码改动必须在独立 git worktree 中进行。
- **[机制]** 一个修复一个 worktree；verifier REJECT 或升级后丢弃，不留残留分支
  （`worktree.mjs create|discard|list`；是否真的被调用取决于运行器）。

## Data

- **[约定]** 绝不把 API key、token、凭据粘贴进调度提示词或状态文件。
- **[约定]** CI 日志可能含机密；写入状态文件前必须脱敏。
- **[约定]** `STATE.md` 会被提交，**不得包含任何凭据**。

---

<!-- 仓库特定规则写在下方。上面的默认集可以收紧，不可以放宽。 -->

## Repo-Specific

- **[约定]** （在此添加本仓库特有的拒绝路径、必需命令、命名约定。）
