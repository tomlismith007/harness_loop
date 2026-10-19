# Loop State

Last run: 2026-10-19 (REPAIR-SPEC 合并进 main 的升级批次)

本文件是循环的活状态：人类收件箱、当前活动、观察列表。
**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [x] **在靶场 `/d/loop-harness-test` 跑过一轮 `/harness-loop`**：`sum([])` bug，回退测试失败→修复→独立子智能体验证 APPROVE→闸门 proceed→账本与 run-log 落盘。真机验证抓出一个闸门 bug（证据正则不接受技能文档里的格式），已修并加断言。
- [x] **`/harness-loop-issue` 真机验证（两轮）**：沙箱上第一轮验 issue 发现，第二轮造了一个真实的红 PR（#4）验 CI 分类——`TypeError` 在 `src/math.mjs:2`、由该 PR 引入 → 判 regression，未误判为 env。两轮均确认只读。
- [x] 技能已装到 `~/.claude/skills` 与 `~/.agents/skills`（各 4 个）；`~/.zcode/skills` 的 v1 陈旧副本已删除。
- [x] **按 `REPAIR-SPEC.md` 修复审计缺陷（2026-10-19）**：P1-1 kill switch 路径、P1-2 第 5 步切 gate 阶段、P1-3 安装清单定位 pack、P1-4 占位 feature 通过阶段 1、P2-2 run-log 章节、P2-3 账本退出码、P2-4 模板约束、P2-6 文档漂移、P3-1 STATE 矛盾。验证：`node scripts/test.mjs` 357/0；`bash init.sh` 退出 0；五条 gate 阶段路径与四项阶段判据逐条实跑。
- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整。
- [x] **批次 0：docs 事实修正**（完成标准：4 个死链清零；`docs/03` 闸门表与代码 9 个 gate 名一致；`init.sh` 绿）— commit `a181285`，独立验证 4 轮后 APPROVE
- [x] **批次 1：修坏掉的机制**（U-01/02/09/11 + U-07；完成标准见 `audits/upgrade-plan-2026-10-18.md` §3）— commit `0d88b94`，独立验证 3 轮后 APPROVE
- [x] **批次 2：收紧闸门与状态**（U-03/04/06/07检查/08/10；完成标准见同上 §3）— commit `9232620`，独立验证 4 轮后 APPROVE
- [x] **U-05 护栏演练**（drill-check + 阶段 2 判据；完成标准见 `audits/upgrade-plan-2026-10-18.md` §2 U-05）— commit `9b0b4aa`，独立验证 3 轮后 APPROVE
- [ ] **已知未达成**：本仓库 `harness-stage . --stage 2 --require` 仍退出 2（占位账本按设计保留；技能在 `<repo>/skills/`，worktree 未安装）。CI 不跑 `--require`，故不阻断。
- [x] **U-12 清洁交接**（clean-state；完成标准见 `audits/upgrade-spec-2026-10-18.md` U-12）— commit `fb1ff93`，独立验证 3 轮后 APPROVE
- [x] **U-13 worktree manifest**（create/mark/cleanup/list；完成标准见 `audits/upgrade-spec-2026-10-18.md` U-13）— commit `527bfdd`，独立验证 3 轮后 APPROVE
- [ ] **已知限制**：`worktree.mjs` 的 run-id 只接受 ASCII（中文 item 名无法直接用作 run-id）；`.loop-worktrees/` 未加入 `.gitignore`。
- [x] `templates/init.sh` 已删除（FIX-12）：装配器用 `initScriptFromCommands` 生成，模板是分叉源。
- [ ] FIX-14：`--attempts` 与 ledger 交叉校验（可选，未做）。

## Active

| Work item | 尝试 | 状态 |
|---|---|---|
| — | — | — |

## Watch List

- 已完成两轮真机验证（见上方 High Priority）。后续目标：修复框架自身缺陷时仍保持“只报告、先复现”的节奏。
- `harness-stage` 在本仓库上自引用，判据 4（`init.sh`）记为 NOT RUN——这是有意的，不是缺陷。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Post-Run Critique (from last run)

- **返工**：本轮重构中，`test.mjs` 的三处断言先后因期望值错误而失败（技能排序、kill switch 残留标记、阶段 2 本地化前提）。都是测试写错，不是实现错。
- **误报**：无。
- **一项下轮调整**：新增断言前先手工跑一遍被测命令，确认期望值来自实际输出而不是推断。

### 2026-10-18 审计（只读，产出在 `audits/`）

- 三仓库真实读取：A `38ddcd2`、B `54f8c56`、CN `c5e9ef0`（CN 是 B 的 fork，2026-07-15 快照）。
- 基线：`bash init.sh` 335/0；README 的 5 脚本 / 335 断言 / 4 命令属实；闸门实际 9 个（README 写 8）。
- 抓到的真 bug：技能第 0 步 `--state STATE.md` 使 kill switch 静默失效；第 5 步 `--phase fix` 使证据与 head-commit 闸门永不触发；`feature_list.json` 的 `rules` 无人读；预算闸门无接线。
- 产出：`audits/{knowledge-A,knowledge-B,audit,upgrade-spec,docs-patches}-2026-10-18.md`。**未改任何现有文件**（`git status` 仅 `?? audits/`）。docs 补丁待确认后应用。

---

Run log: `loop-run-log.md` · 约束：`loop-constraints.md` · 教训：`LESSONS.md`
