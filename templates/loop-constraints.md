# Loop Constraints

> `/harness-loop` 在**每一轮开始时**读取本文件，并在任何动作之前加载全部规则。
> 本文件中的约束是**绑定的**——agent 必须遵守。冲突时本文件优先于任何其他指令。

## 加载确认

每轮开始必须输出一行：

```
Constraints loaded from loop-constraints.md: N rules active.
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
loop-constraints.md
scripts/gate-check.mjs
scripts/ledger-check.mjs
scripts/lib/common.mjs
.github/workflows/**
package.json
package-lock.json
templates/**
```

- 命中任一模式的路径：**停止编辑，写升级条目，交给人**。不做"顺便的小改动"。
- 拒绝列表由 `scripts/gate-check.mjs` 强制执行；改这里就会真的改变行为。

## Code

- 提议修复前必须跑测试。
- 绝不禁用测试、跳过断言或注释掉检查来让 CI 变绿。
- 绝不重构无关代码 —— 一轮一个修复。
- 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级。
- 每个 work item 最多 3 次修复尝试；之后升级。
- 每次尝试追加到 `loop-ledger.json`，重试前跑 `node scripts/ledger-check.mjs`。

## Verification

- 执行者**不得**标记自己的 work item 为完成。独立验证者判定。
- 验证者必须实际运行测试并报告输出片段，不得只凭 diff 判断。
- 验证者无法运行测试（环境问题）→ `ESCALATE_HUMAN`，不要放行。
- **回退测试（Red check）**：新增的测试必须能在修复前的代码上真的挂掉，且失败信息要指出
  是哪个行为错了。编译不过、测试被跳过、测试通过——都不算通过。
- **未跑必须写明**：`A check that wasn't run is listed as not run, never left out.`
  报告必须区分 PASS / FAIL / **NOT RUN** 三态，不允许"没提"。
- **真实使用验证**：改了哪家厂商的接入，就得拿真账号、真配置、真接口验。没实测过的功能，
  不许在上面接着开发，也不许跟用户说能用。

## Kill Switch

- `loop-pause-all` **独占一行**写在 `STATE.md` 或本文件里 → `/harness-loop` 立即退出。
- 散文里提到不算；清除标记后人工重启。
- `gate-check.mjs --state <dir>` 会真的读它并返回退出码 3。

## Budget

- 日 token 上限：0        # 0 = 不启用；>0 时 ledger-check 读取

## Lessons

- 本轮发生**返工**（修了又改、验证被拒）→ 在 `LESSONS.md` 追加一行。
- 同一条教训在 **3 个不同日期**出现 → 转正进本文件，从经验变成硬规则。
- 转正后，验证者的检查项必须包含它。规则进了约束文件但验证者没读，等于没转正。

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

## Repo-Specific

- （在此添加本仓库特有的拒绝路径、必需命令、命名约定。）
