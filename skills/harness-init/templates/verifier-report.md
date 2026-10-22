# Verifier Report

> 由**独立验证者**填写（与执行者不同的实例/会话）。执行者不得自己填这份报告。
> 保存为 `verifier-report.md`，用 `--evidence-file verifier-report.md` 交给闸门。
> 闸门会：校验 `Author` ≠ `Executed by`、`Reviewed commit` 等于 `--reviewed-sha`、
> 每个 PASS 后面贴了真实输出片段、并**重放**每条带命令的检查行。

## Verdict: APPROVE

<!-- APPROVE | REJECT | ESCALATE_HUMAN —— 只能有一个 -->

Author: <验证者标识，例如 sub-agent-2 或 human:alice>
Executed by: <实际跑命令的实例。与 Author 相同会被闸门拒绝>
Reviewed commit: <40 位 sha，必须等于 --reviewed-sha>
Change class confirmed: <behavior | docs | config | refactor —— 与执行者声明一致？yes/no>

### Evidence

<!-- 每条：`- <检查名>: `<命令>` → PASS|FAIL|NOT RUN`
     声明 PASS 的检查后面必须贴一段真实输出（围栏块或 > 引用），否则闸门拒绝。 -->

- Tests: `node scripts/test.mjs` → PASS
  ```
  Passed: 484   Failed: 0
  ```
- Red check: `node scripts/test.mjs` → PASS
  ```
  修复前：1 failing — sum([]) returned undefined, expected 0
  ```
- Scope check: PASS — 2 files, within the limit
- Denylist check: PASS

### Checks not run

<!-- 没跑的检查必须列在这里，每条带理由。为空也要写 `—`。
     change-class 不是 behavior 时，Red check 的理由至少 20 个字符。 -->

- —
