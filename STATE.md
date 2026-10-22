# Loop State

Last run: 2026-10-22

本文件是循环的活状态：人类收件箱、当前活动、观察列表。
**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [x] **技能装完即可用（P0/P1，2026-10-22）**：P0-1 首条命令读不存在的 packRoot 清单 → 改用技能目录内的装配器；P0-2 离线路径装 0 个技能 → 上一层找兄弟技能 + 找不到时报错；P1-1 harness-loop-init 模板只有 2 个导致静默半装 → 补全 + 渲染器三态 + error 计入退出码；P1-3 三处死路提示（install-skills、写死的 scripts/harness-stage.mjs ×2）→ 改用 process.argv[1]；顺带修源即目标 + --force 的 ENOENT。证据：`node scripts/test.mjs` **657/0**；`bash init.sh` 退出 0；临时目录 npx 实装后文档首条命令跑通，阶段 1 出 7 文件、阶段 2 出 3 文件；8 条新断言回退旧实现后全红。commit 5ed2c6f。审计与 spec 见 `docs/audit/2026-10-22-skills-audit.md`、`docs/audit/2026-10-22-cleanup-spec.md`。
- [ ] **待人工**：本次改动触及拒绝列表路径 `scripts/sync-skills.mjs` 与 `skills/*/scripts/**`（生成副本），且文件数 8 > 5 的 scope 阈值。按 harness-constraints.md 需人工合并，循环不得自动合入 main。分支 `fix/skills-install-p0-p1`，commit 5ed2c6f。
- [ ] **待决策（审计 spec §8）**：Q2 是否合并两个装配技能（B5，约省 197 KB）；Q3 两个未合并分支；Q4 `audits/` 与 `REPAIR-SPEC.md`；Q5 `docs/harness-loop-guide.html`。

- [x] **按 `audits/harness-loop-remediation-spec-2026-10-21.md` 修复 P0/P1 批次（2026-10-21）**：
  R-01 change-class、R-02 隐藏目录 denylist、R-03 尝试次数读账本、R-04 验证者模板、R-05 `--self` 与 CI 真跑、
  R-06 用户级技能路径、R-08 manifest 累积、R-09 worktree 回收、R-10 证据片段与署名、R-11 untrusted 清洗、
  R-12 阈值读约束、R-13 文档同步断言、R-15 跨平台测试、R-17/R-20/R-22/R-23 文档诚实化、R-24 kill switch、
  R-26 NOT RUN 不算通过、R-27 clean-state 双模式。
  证据：`node scripts/test.mjs` **569/0**（原生 Windows PATH 下同样 569/0）；`bash init.sh` 退出 0；
  `harness-stage . --stage 1 --require --self` 退出 0；每条新机制都做过回退测试（改回旧实现 → 断言变红）。
- [ ] **待人工**：本轮改动的 `scripts/gate-check.mjs`、`scripts/lib/common.mjs`、`scripts/test.mjs`、`templates/**`、
  `.github/workflows/**` 都在本仓库拒绝列表里——按 loop-constraints.md 需人工合并。
- [x] **第二批：补齐剩余整改项（2026-10-21 晚）**：
  R-14 `VERSION` + `packVersion` + `--force` 备份 + `--rollback`；R-16 验证者 canary（离线，4 用例，
  阶段 2 判据要求它存在）；R-18 轻量档（docs/config/refactor 跳过 sha 绑定与重放，跳过项记 NOT RUN）；
  R-19 约束拆两层（`harness-constraints.md` 阶段 1 / `loop-constraints.md` 阶段 2，读取函数双文件回落）；
  R-21 死链断言 + STATE 历史段移出；R-25 `state-commit.mjs` 原子写（备份 → tmp → rename，失败回滚）。
  证据：`node scripts/test.mjs` **611/0**（原生 Windows PATH 同样）；`bash init.sh` 0；
  `harness-stage . --stage 1 --require --self` 0；每项都做过回退测试。
- [ ] **仍未验证**：agent 行为层（验证者会不会偷懒、输出片段会不会被编造）。闸门能抓形状与自审，
  抓不到"输出片段是编的"；`drill-check --only verifier` 是**离线** canary，不调模型。

- [x] **在靶场 `/d/loop-harness-test` 跑过一轮 `/harness-loop`**：`sum([])` bug，回退测试失败→修复→独立子智能体验证 APPROVE→闸门 proceed→账本与 run-log 落盘。真机验证抓出一个闸门 bug（证据正则不接受技能文档里的格式），已修并加断言。
- [x] **`/harness-loop-issue` 真机验证（两轮）**：沙箱上第一轮验 issue 发现，第二轮造了一个真实的红 PR（#4）验 CI 分类——`TypeError` 在 `src/math.mjs:2`、由该 PR 引入 → 判 regression，未误判为 env。两轮均确认只读。
- [x] 技能已装到 `~/.claude/skills` 与 `~/.agents/skills`（各 4 个）；`~/.zcode/skills` 的 v1 陈旧副本已删除。
- [x] **按 `REPAIR-SPEC.md` 修复审计缺陷（2026-10-19）**：P1-1 kill switch 路径、P1-2 第 5 步切 gate 阶段、P1-3 安装清单定位 pack、P1-4 占位 feature 通过阶段 1、P2-2 run-log 章节、P2-3 账本退出码、P2-4 模板约束、P2-6 文档漂移、P3-1 STATE 矛盾。验证：`node scripts/test.mjs` 357/0；`bash init.sh` 退出 0；五条 gate 阶段路径与四项阶段判据逐条实跑。
- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整。
- [x] **批次 0：docs 事实修正**（完成标准：4 个死链清零；`docs/03` 闸门表与代码 9 个 gate 名一致；`init.sh` 绿）— commit `a181285`，独立验证 4 轮后 APPROVE
- [x] **批次 1：修坏掉的机制**（U-01/02/09/11 + U-07；完成标准见 `audits/upgrade-plan-2026-10-18.md` §3）— commit `0d88b94`，独立验证 3 轮后 APPROVE
- [x] **批次 2：收紧闸门与状态**（U-03/04/06/07检查/08/10；完成标准见同上 §3）— commit `9232620`，独立验证 4 轮后 APPROVE
- [x] **U-05 护栏演练**（drill-check + 阶段 2 判据；完成标准见 `audits/upgrade-plan-2026-10-18.md` §2 U-05）— commit `9b0b4aa`，独立验证 3 轮后 APPROVE
- [ ] **已知未达成**：本仓库 `harness-stage . --stage 2 --require --self` 仍退出 2（占位账本按设计保留）。CI 现在跑 `--stage 1 --require --self`（阶段 1 已绿），阶段 2 不跑，因为占位账本是有意保留的。
- [x] **U-12 清洁交接**（clean-state；完成标准见 `audits/upgrade-spec-2026-10-18.md` U-12）— commit `fb1ff93`，独立验证 3 轮后 APPROVE
- [x] **U-13 worktree manifest**（create/mark/cleanup/list；完成标准见 `audits/upgrade-spec-2026-10-18.md` U-13）— commit `527bfdd`，独立验证 3 轮后 APPROVE
- [ ] **已知限制**：`worktree.mjs` 的 run-id 只接受 ASCII（中文 item 名无法直接用作 run-id）。`.loop-worktrees/` 现在由 `create` 自动写进 `.gitignore`。
- [x] `templates/init.sh` 已删除（FIX-12）：装配器用 `initScriptFromCommands` 生成，模板是分叉源。
- [x] FIX-14 / R-03：`--attempts` 与 ledger 交叉校验——改为 `ledger-check --item` 的 `attempt-limit` 直接读账本，`gate-check` 不再有 max-attempts 闸门。

## Active

| Work item | 尝试 | 状态 |
|---|---|---|
| — | — | — |

## Watch List

- 已完成两轮真机验证（见上方 High Priority）。本轮整改先逐条复现再修复，复现结果见下。
- 本轮复现确认：H-01/H-02/H-03/H-05/H-08/H-09/H-10/H-13/H-14/H-15/H-17/H-22/H-24/H-26/H-28/H-29 均真实存在；
  H-04/H-23/H-30/H-33 在当前 HEAD 已被上一轮修复（无 `--verify`、无死引用、本地化判据已通过）。
- `harness-stage` 在本仓库上自引用，判据 4（`init.sh`）记为 NOT RUN——这是有意的，不是缺陷。

## Human Inbox (ambiguous / cross-loop)

- [ ] （空）

## Post-Run Critique (from last run)

- **返工**：新增断言前先手工跑一遍被测命令，确认期望值来自实际输出而不是推断。
  （历史：`test.mjs` 曾有三处断言因期望值写错而失败——技能排序、kill switch 残留标记、阶段 2 本地化前提。）
- **误报**：无。
- **本轮教训**：审计报告里的"已证实"可能已经过期——先复现再修，4 条发现已被上一轮修掉。

---

Run log: `loop-run-log.md` · 约束：`loop-constraints.md` · 教训：`LESSONS.md`
