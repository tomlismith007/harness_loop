# Loop State

Last run: 2026-10-14 (three-review remediation pass)

本文件是循环的活状态：人类收件箱、当前活动、观察列表、本轮噪声。**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整（本仓库是技能源仓库，见 Post-Run Critique）。
- [ ] 把三份审查里**未纳入本轮范围**的项排进下一轮（见下方「Watch List」）。

## Active

| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`acting_on` 用于多循环冲突检测：派发新任务前检查此列，避免两个循环改同一分支。

**锁键约定**：`acting_on` 填**分支名或 PR 号**（唯一全局命名空间），不是 work item id。
`event-router` 现在按 `acting_on` 比对，CLI 侧用 `--target` 传锁键、`--item` 传 work item id。
两者混用会让锁永远不触发。

## Watch List

- 尚未跑过任何一轮真实事件。第一周目标：只报告，积累可靠的 triage 记录。
- `examples/github-actions/` 的 workflow 只做了静态修复，**未在真实 GitHub 仓库上跑过一次**。
  合并进任何项目之前必须先在一个测试仓库上验证（硬约束 10）。
- 本轮未处理的审查结论：
  - `denylistLocalized()` 仍只做与模板的集合差，加一条不存在的路径（`totally/fake/path/**`）
    也能判"已本地化"。需要"路径真实存在"判据。
  - `loop-audit.mjs` 的 `hasVerifier` / triage 检测仍是裸子串匹配，写一句"我们是 maker/checker"
    即可满足。
  - `detectLoopActivity` 的 git 历史分支匹配 commit message 子串，在本仓库几乎必然命中。
  - `**/*_key*` 会误命中 `src/monkey_key.ts`。**有意保留**：拒绝列表宁可多拦不可漏拦。
  - `loop-budget.md` 的 per-loop 上限没被真正使用（`Math.max(...caps)` 取全表最大值 500k）。
  - `loop-verifier` 判据里"verifier 与执行者共享上下文则升级"依赖模型自觉，建议改成结构性保证
    （在调用者侧强制新上下文）。
  - `schedule:daily` / `issue_comment.created` / `check_run.completed` 等路由仍缺。本轮只把
    LOOP.md 里**不可路由**的声明移除以对齐代码，补路由属新功能，另轮。
  - 低严重级打磨项（`loop-audit.mjs:316` 的 `Math.max(1,…)` 0 项误报为 `1/5`、`:216`
    单技能记满双技能权重、`detectLoopActivity` 死参数、`test.mjs` 临时目录 `try/finally`）
    均未做——不影响任何判定或门禁。逐条理由见 `REVIEW-2026-10-14-consolidated-plan.md` §6.2。

**有意遗留项的权威清单是 `REVIEW-2026-10-14-consolidated-plan.md` §6.2**，本节只作摘要。
两者不一致时以 plan 为准——它有测试守着（每个 WP 必须有状态行、每个未做项必须有理由）。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Recent Noise (ignored this run)

—

## Post-Run Critique (from last run)

- **本轮做了什么**：三份独立审查（主审 / independent / antigravity）都指向同一个根因——
  **闸门本身没有被闸门保护**。三份互不相关的会话收敛到同一诊断，这本身就是强证据。
  按"失效方向"排序修了 8 个工作包（详见 `REVIEW-2026-10-14-consolidated-plan.md`）。
- **High-noise items**：① `gate-check` 的 fail-open 族（枚举不校验、NaN 阈值、sha 可省、
  `--diff-files` 语义随文件系统漂移）；② 拒绝列表真相源分裂（文档写 A、代码做 B，且 B 是危险那侧）；
  ③ `install-skills --uninstall` 会删用户自己的技能，并可被构造的清单带出目标目录；④ 事件队列写进虚空
  （推荐的第一种对接方式其实是断的）；⑤ `registry.yaml` 无任何代码消费者。
- **False positives**：本轮修掉的"假绿"同上一轮是同一个病换位置——上一轮修了阶段判据的模板自满足，
  同样的反模式在 `gate-check`、拒绝列表、registry 里完整存活。新的通用判据已写进
  `loop-constraints.md` 的 **可执行入口规则**（硬约束 11）：任何"机械判定"的机制必须有真正读它的
  代码入口，且测试必须断言"改这个值会改变行为"。
- **Should deprioritize**：`issues.labeled` 自触发环路。真实存在但比审查描述的弱一跳——
  打标签是 L2 行为（`issue-triage` 明写 L1 只提议不应用），`ci-sweeper` 的 `needs-human`
  只是 echo 到日志不是真的 `gh issue edit`。已加 actor 守卫，但不急。
- **Friction in human review**：本仓库是技能**源仓库**而非消费者，阶段判据（尤其"拒绝列表已本地化"）
  对它天然不适用——它的 `loop-constraints.md` 就是模板来源。自报阶段 1 是正确结果，不是缺陷。
- **One adjustment next cycle**：阶段判据在源仓库上运行时，应识别"这是源仓库"并跳过消费者专属判据，
  而不是逐条报 FAIL。
- **本轮的一个教训**：新增判据不等于有牙齿。加完断言必须逐条做变异回退——
  本轮有 3 条断言第一次写完是"无牙齿"的（变异后测试仍然全绿），
  说明断言写错了方向或根本没触达被测代码。**没有回退测试的断言等于装饰品**，与硬约束 8 同源。

---

Run log: `loop-run-log.md` · 预算：`loop-budget.md` · 约束：`loop-constraints.md`