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
```

- 命中任一模式的路径：**停止编辑，写升级条目，交给人**。不做"顺便的小改动"。
- 拒绝列表路径的改动由人工合并，即使 verifier 通过。

## Code

- 提议修复前必须跑测试（`npm test` 或项目等价命令）。
- 绝不禁用测试、跳过断言或注释掉检查来让 CI 变绿。
- 绝不重构无关代码 —— 一轮一个修复。
- 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级。
- 每个 work item 最多 3 次修复尝试；之后升级。
- 机械执行尝试上限：每次尝试追加到 `loop-ledger.json`，重试前跑 `node scripts/ledger-check.mjs`。

## Verification

- 执行者**不得**标记自己的 work item 为完成。`loop-verifier` 判定。
- verifier 必须实际运行测试并报告输出片段，不得只凭 diff 判断。
- verifier 无法运行测试（环境问题）→ `ESCALATE_HUMAN`，不要放行。
- **回退测试（Red check）**：新增的测试必须能在修复前的代码上真的挂掉，且失败信息要指出
  是哪个行为错了。编译不过、测试被跳过、测试通过——都不算通过。
- **未跑必须写明**：`A check that wasn't run is listed as not run, never left out.`
  报告必须区分 PASS / FAIL / **NOT RUN** 三态，不允许"没提"。
- **真实使用验证**：改了哪家厂商的接入，就得拿真账号、真配置、真接口验。没实测过的功能，
  不许在上面接着开发，也不许跟用户说能用。
- **可执行入口规则**：任何被文档描述为"机械判定"的机制，必须有一个真正读它的代码入口，
  且其行为被测试断言。测试**不得**只断言配置文件里写着某个值——必须断言**改动该值会改变行为**。
  判别方法：把配置改掉，如果测试还是绿的，这个配置就是装饰品。
  一个永远生效不了的闸门，和一个不存在的闸门，在退出码上不可区分。
  正面例子见 `test.mjs` 第 17 节：改 `registry.yaml` 的 `stagnation` 为 1 →
  `ledger-check` 必须在 1 次重复失败后熔断；改 `max_attempts` 为 1 → `gate-check` 必须 escalate。

## Lessons

- 夜审循环（`lesson-harvest`）每天扫当天 commit，把教训写进 `LESSONS.md`。
- 同一条教训在 **3 个不同日期**出现 → 转正进本文件，从经验变成硬规则。
- 转正后，`loop-verifier` 的检查项必须包含它。规则进了约束文件但 verifier 没读，等于没转正。

## Communication

- 做之前先说明将要做什么。
- 未经批准不关闭 issue 或 PR。
- 只在需要人工决策时通知，不做状态播报。

## Budget

- token 花费达到日上限 **80%** → 切换到 report-only 模式（不派发执行子智能体）。
- token 花费达到 **100%**，或 `loop-pause-all` 生效 → **立即退出**，在 `STATE.md` 写一行说明。
- 不超过 `loop-budget.md` 中每个循环的 `max sub-agent spawns/run`。

## Worktrees

- 无人值守的代码改动必须在独立 git worktree 中进行。
- 一个修复一个 worktree；verifier REJECT 或升级后丢弃，不留残留分支。

## Data

- 绝不把 API key、token、凭据粘贴进调度提示词或状态文件。
- CI 日志可能含机密；写入状态文件前必须脱敏。
- `STATE.md` 会被提交，**不得包含任何凭据**。

---

<!-- 仓库特定规则写在下方。上面的默认集可以收紧，不可以放宽。 -->

## Repo-Specific

- （在此添加本仓库特有的拒绝路径、必需命令、命名约定。）
