# Session Handoff

> 本文件是**会话边界快照**：这次会话做了什么、下次从哪里接上。
> 与 `STATE.md` 的分工：`STATE.md` 是循环的活状态（人类收件箱、Active 表、Watch List），
> 每轮都改；本文件只在会话结束时写一次，记录"交接点"。
>
> 出厂模板带占位符是有意的（新项目必须自己填），但**本仓库自己**也必须填——
> 一份全是 `[待填]` 的 handoff 等于没有 handoff，而它的存在还会让阶段 2 判据通过。

## Current Objective

- **Goal:** 按 `REVIEW-2026-10-17-lean-spec.md` 完成减量与边界收敛；M0/M1 已落地，M2 进行中
- **Current status:** M0 收口与 M1 安全闭环已提交；真实 GitHub 事件演练已验证五条链路
- **Branch:** `claude/jolly-tu-86fc0d`（draft PR #1，不合并）
- **Commit:** 见 `git log -1`；工作区在提交后应为干净

## Completed This Session

- [x] M0：阶段驱动技能不装进消费者；删除重复路由/预算/registry 配置；状态瘦身
- [x] M0：`install-skills --check` 无 manifest 不再误报；文档示例加可照抄断言
- [x] M1：合并闸门审查绑定、verifier 证据契约、熔断 fail-closed、预算模板、产物交付
- [x] 修 pre-commit 钩子下测试崩溃（`GIT_DIR` 未剥，且会污染主仓库 `.git/config`）
- [x] 修 merge-gate 未接住 gate-check 判定退出码（真实演练发现）
- [x] LP-13：私有测试仓库 `tomlismith007/harness-loop-sandbox` 跑通 issue / PR / CI / 定时 / 发布五条链路
- [x] LP-14：GitHub ubuntu runner 上 `Self-check` 通过（1063/0，自审计 94/L2）
- [x] `init-loop-harness --help` 与实现对齐，文档不再称其等价于 `harness-stage`

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| 本地套件 | `node scripts/test.mjs` | pass | 1067/0 |
| 标准启动路径 | `bash init.sh` | pass | 自审计 94/100 L2 |
| hook 环境 | `GIT_DIR=... GIT_INDEX_FILE=... node scripts/test.mjs` | pass | 1063/0（当时断言数） |
| Linux runner | GitHub Actions `Self-check`（PR #1） | pass | ubuntu-latest，1063/0 |
| 真实事件：issue | `harness-loop-sandbox` issue #1 | pass | 路由 intake，work item 落盘 + artifact |
| 真实事件：PR | sandbox PR #2 | pass | 路由 review，work item 落盘 + artifact |
| 真实事件：merge-gate | sandbox PR #2 ready_for_review | pass | 无批准 → `head-commit` escalate，PR 评论可见 |
| 真实事件：CI | sandbox 故意失败的 CI | pass | ci-sweeper 路由 fix，熔断 `ok`，work item 落盘 |
| 定时 workflow | daily-triage / lesson-harvest（workflow_dispatch） | pass | 报告生成并写入 step summary |
| 发布 workflow | tag `v0.0.1-sandbox` | pass | 路由 release，草稿生成并写入 step summary |
| 真实 APPROVED 通过路径 | — | **NOT RUN** | 单账号仓库不能批准自己的 PR |
| agent 平台消费队列 | — | **NOT RUN** | 无运行器 |

## Files Changed

- `scripts/gate-check.mjs`、`scripts/ledger-check.mjs`、`scripts/install-skills.mjs`
- `scripts/harness-stage.mjs`、`scripts/init-loop-harness.mjs`、`scripts/lib/common.mjs`
- `scripts/test.mjs`（+25 条断言）
- `examples/github-actions/*.yml`（merge-gate、ci-sweeper、release-draft、daily-triage、lesson-harvest）
- `templates/loop-budget.md`、`patterns/registry.yaml`
- `AGENTS.md`、`LOOP.md`、`README.md`、`STATE.md`、`loop-constraints.md`、`loop-budget.md`
- `docs/01,03,04,05,06,10,11,12`
- `skills/event-router`、`harness-init`、`harness-loop-init`、`harness-consolidate`、`loop-budget`、`loop-verifier`
- `REVIEW-2026-10-17-lean-spec.md`（计划与落地状态）

## Decisions Made

- **阶段驱动技能只在包仓库运行**：它们第一步调用 `harness-stage.mjs`，而该脚本不复制进消费者。
- **预算阈值单一来源**：只留 `budget-check.mjs` 的常量，删除 registry 副本。
- **kill switch 没有标签通道**：代码只读 `STATE.md` / `loop-constraints.md`，文档不再声称标签可用。
- **`attempts` 闸门标为未接线**：没有运行器写账本时，它在生产路径上不生效，按 NOT RUN 对待。

## Blockers / Risks

- **真实 APPROVED 通过路径未验证**：需要第二个账号或组织成员在沙箱里批准。
- **agent 平台消费队列未验证**：work item 已交付为 artifact，但没有平台消费它。
- **run-log 持久化未决策**：workflow 写 run-log 只上传 artifact，预算 `used` 仍恒为 0。
- **沙箱仓库是临时资源**：`tomlismith007/harness-loop-sandbox` 可在验证后删除。

## Next Session Startup

1. 读 `AGENTS.md`
2. 读 `STATE.md` 与 `REVIEW-2026-10-17-lean-spec.md` 的落地状态
3. 复审本 handoff
4. 编辑前先跑 `bash init.sh`

## Recommended Next Step

- **Highest-priority unfinished feature:** 用第二个 GitHub 账号在沙箱 PR 上完成一次
  APPROVED + commit 匹配的通过路径验证，然后决定 run-log 持久化方式。
- **Why it is next:** 这两项决定消费者能否从 L1 升到 L2；其余 M1 收紧项已在真实事件上验证。
- **What counts as passing:** 沙箱 PR 收到 bot verifier 报告 → merge-gate 判定 `proceed`
  （仍不自动合并）；run-log 的真实花费能被 `budget-check` 读到。
- **What must not change during that step:** 不放宽闸门、不伪造账本、不启用自动合并。
