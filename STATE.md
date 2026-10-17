# Loop State

Last run: 2026-10-17 (按 lean spec 实施 M0 收口 + M1 安全闭环)

本文件是循环的**活状态**：当前活动、等待人工的决策、仍需行动的观察项。**每轮开始读，每轮结束写。**
历史记录在 `loop-run-log.md`；长期教训在 `LESSONS.md`；历次审查在 `REVIEW-*.md`。不要把历史堆回本文件。

## High Priority (loop is acting or waiting on human)

- [ ] **减量 spec 实施中（2026-10-17）**：`REVIEW-2026-10-17-lean-spec.md` 的 M0 与 M1 已落地，
  见该文件「落地状态」。M2（真实 GitHub 演练、Linux/消费者烟测）**NOT RUN**。
- [ ] **消费者 L2/L3 继续禁用**：真实 GitHub 测试仓库未跑过（硬约束 10）。M2 完成前，
  README 与 docs/10 标 L2 实验、L3 不宣称。
- [ ] **需作者决策（阻塞后续）**：见 spec §9 六项——`signal-gatekeeper` 定位、
  `progress.md`/`session-handoff.md` 去留、`init-loop-harness.mjs` 是否删除、
  run-log 持久化方式、`attempts` 闸门是否接线、kill switch 标签（已按"删除标签承诺"实施）。
- [ ] **预算 `used` 仍恒为 0（已知限制）**：没有运行器写 `loop-run-log.md` 的真实花费。
  立即生效的是 kill switch 与"无上限即退出"；百分比要等持久化方式定下来。
- [ ] **`loop-constraints.md` 的拒绝列表未本地化**：本仓库是技能源仓库，该文件就是模板来源。
  在消费者仓库上运行时必须按实际路径增删（阶段 2 判据 5）。
- [ ] **硬约束 10（真机验证）**：8 个 workflow 仍未在任何真实 GitHub 仓库上跑过。

## Active

| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`acting_on` 填**分支名或 PR 号**（唯一全局命名空间），不是 work item id。
`event-router` 用 `--target` 传锁键、`--item` 传 work item id；两者混用会让锁永远不触发。

## Watch List

- **尚未跑过任何一轮真实事件。** 第一周目标：只报告，积累可靠的 triage 记录。
- **`loop-audit` 的 `toolScope` 仍 FAIL**：本包确实不提供工具级隔离，这是设计边界而非缺陷；
  是否把它移出计分待决策（spec §9 未列，可并入后续）。
- **`denylistLocalized()` 只做与模板的集合差**：加一条不存在的路径也能判"已本地化"。
- **`loop-audit.mjs` 的 `hasVerifier` / triage 检测仍是裸子串匹配**。
- **`**/*_key*` 会误命中 `src/monkey_key.ts`。有意保留**：拒绝列表宁可多拦不可漏拦。
- **`feature_list.json` 与 `progress.md` 的断言数在每次改测试后都要同步**——已有断言守着，
  忘了会红。这是刻意保留的摩擦：数字写进文档就必须有人读。
- **低严重级打磨项**（`loop-audit.mjs` 的 0 项误报为 `1/5`、单技能记满双技能权重、
  `test.mjs` 临时目录 `try/finally`）未做，不影响任何判定。
- 有意遗留项的权威清单：`REVIEW-2026-10-14-consolidated-plan.md` §6.2。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Recent Noise (ignored this run)

—

## Post-Run Critique (last run)

### 2026-10-17 · 按 lean spec 实施 M0 + M1（本轮）

- **本轮做了什么**：按 `REVIEW-2026-10-17-lean-spec.md` 落地 M0 收口与 M1 安全闭环。
  未做 M2（真实演练）与 spec §9 的待决策项。
- **M0**：
  - 阶段驱动技能（`harness-init` / `harness-loop-init` / `harness-consolidate`）不再装进消费者，
    正文声明"只在包仓库运行"；`init-loop-harness.mjs` 同步。
  - `event-router/SKILL.md` 删除手抄路由表，指向 `ROUTES` 与 `LOOP.md`；测试新增
    "LOOP.md 技能数组与 ROUTES 一致"（此前只比 phase）。
  - 删除 `registry.yaml` 的 `patterns:` / `priority:` / 6 个无消费者 defaults 键；
    预算阈值只留 `budget-check` 常量。
  - `install-skills --check` 在无 manifest 目录上不再把用户技能报成漂移（退出 0）。
  - 修正文档数字（阶段 1 判据 8、脚本数、断言数）、`@` 前缀与 `--target` 示例；
    新增"文档示例可照抄执行"断言。
  - `feature_list.json` 的重复 id `stage-001` → `stage-002`，加唯一性断言。
  - `loop-constraints.md` 每条规则标 `[机制]` / `[约定]`，加断言。
- **M1**：
  - `ledger-check` 账本缺失/坏 JSON → `no-ledger` exit 2（此前 exit 1，调用方只拦 2 会放行）；
    `ci-sweeper` 改为拦所有非 0，并在 lock-held 时跳过熔断。
  - `gate-check` 证据契约：接受 verifier 模板的无命令状态行；全 NOT RUN → escalate；
    报告带 `Commit:` 时与 head 比对。
  - `merge-gate`：无 APPROVED 不再回退成 head；要求最后一条 review 就是 APPROVED；
    只接受 bot 账号的报告；`LOOP_BOT_LOGIN` 可配置。
  - `templates/loop-budget.md` 补 `daily-triage` / `lesson-harvest` / `signal-gatekeeper` 三行，
    并加"模板覆盖全部 workflow pattern"断言。
  - 报告型 workflow 全部交付到 `$GITHUB_STEP_SUMMARY`；`release-draft` 不再订阅
    `release.published`（路由按 `push:tags` 处理会错）。
  - kill switch 删除"issue 标签"承诺（代码只读文件）；`docs/03` 明确 `attempts` 闸门
    **未接线**（无写入者），按 NOT RUN 对待。
- **验证**：`node scripts/test.mjs` 与 `bash init.sh` 均通过；断言数见本轮 run-log。
  新增断言全部先确认在旧行为上会红，再改实现。
- **NOT RUN**：真实 GitHub Actions、Linux/GNU-timeout、agent 平台消费、真实 token 计费。
- **下一步**：作者决策 spec §9；然后 M2（测试仓库演练 + Linux/消费者烟测）。
