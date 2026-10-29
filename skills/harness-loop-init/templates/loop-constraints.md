# Loop Constraints

> 连续运行的规则：验证、账本/尝试上限、kill switch、worktrees、预算、教训、清理。**阶段 2 才有这份文件。**
> 拒绝列表与通用代码规则在 `harness-constraints.md`——两层分开，"只用 harness 不用 loop"才成立。

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
- **可执行入口规则**：任何被文档描述为"机械判定"的机制，必须有一个真正读它的代码入口，
  且其行为被测试断言。改配置而测试仍绿，说明这个配置是装饰品。

## Attempts & Ledger

- 每个 work item 最多 3 次修复尝试；之后升级。
  <!-- 阈值来源：loadLimits 读取本行；计数来自 loop-ledger.json，不是命令行参数 -->
- 每次尝试追加到 `loop-ledger.json`——用脚本，不要手改 JSON：
  `node .claude/skills/harness-loop/scripts/ledger-check.mjs --append --item <id> --outcome <success|failure|noop> --action <text> [--error <text>]`
- 重试前跑 `node .claude/skills/harness-loop/scripts/ledger-check.mjs --item <id>`；退出码 2 即停止并升级。

## Kill Switch

- `loop-pause-all` **独占一行**写在 `STATE.md` 或任一约束文件里 → `/harness-loop` 立即退出。
- 散文里提到不算；清除标记后人工重启。
- `gate-check.mjs --state <dir>` 会真的读它并返回退出码 3。

## Cleanup

- 清理类改动最多 10 个文件；超过需要人工审批。
  <!-- 阈值来源：gate-check.mjs 的 loadLimits 解析本行（--cleanup） -->

## Budget

- 日 token 上限：0        # 0 = 不启用；>0 时 ledger-check 读取

## Lessons

- 本轮发生**返工**（修了又改、验证被拒）→ 在 `LESSONS.md` 追加一行。
- 同一条教训在 **3 个不同日期**出现 → 转正进本文件，从经验变成硬规则。
- 转正后，验证者的检查项必须包含它。规则进了约束文件但验证者没读，等于没转正。

## Worktrees

- 无人值守的代码改动必须在独立 git worktree 中进行。
- 一个修复一个 worktree；REJECT 或升级后保留未合并的提交和现场，供人工处理。只清理已并入基准分支且无未提交改动的 worktree。

## Repo-Specific

- （在此添加本仓库特有的拒绝路径、必需命令、命名约定。）
