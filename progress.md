# Session Progress Log

## Current State

- **Last Updated:** 2026-10-14 01:00
- **Active Feature:** stage-2 — 强化 harness 机制
- **当前阶段：** 2 强化（阶段 1 已完成 10/10）

## Status

### What's Done

- [x] 蒸馏两个参考仓库（LHE harness engineering + LEC loop engineering）
- [x] 15 → 18 个技能（新增三阶段技能 harness-init / harness-strengthen / harness-consolidate）
- [x] 8 个脚本（新增 harness-stage.mjs 三阶段驱动器、install-skills.mjs）
- [x] 12 篇文档（新增 09-case-magpie、10-how-to-use、11-three-stages）
- [x] 13 个模板、8 个事件接线 workflow
- [x] 477 项测试断言全通过
- [x] **阶段 1 判据 10/10 全过**（补齐 feature_list.json / progress.md / init.sh）
- [x] 修复审计 bug：verification 子系统只计 verifier，导致阶段 1 永远无法达成
- [x] 修复假阳性：Promoted 表占位符被误判为已转正
- [x] **修复 install-skills 只写 `.zcode` 的缺陷** — 新增 `--layout zcode|agents|both`，
      默认仍 `zcode`；`agents` 写入跨 agent 的 `.agents/skills/`；非法 layout 报错而非静默回落
- [x] **修复审计盲区** — `SKILL_DIRS` 补上 `.zcode/skills` 与 `.agents/skills`，
      否则安装成功也报 `0 found`，且 `level=L2` 要求 `verifierPresent`，导致 L2 永远不可达

### What's In Progress

- [ ] **阶段 2 强化** — 9 项机械判据已过 8 项，剩「验证命令非占位符」已修复待复验
  - **Details:** 阶段 2 的核心是让验证真的有效、约束真的被强制执行
  - **Blockers:** 判据 10（triage 准确率 > 70%）需要真实使用一周才能确认

### What's Next

1. 完成阶段 2 的机械判据复验
2. 在真实项目上跑一周 L1，校准 triage 准确率
3. 准确率达标后进阶段 3：接事件、跑夜审、验证经验转正闭环

## Blockers / Risks

- [ ] **风险：本仓库不是真实软件项目** — 它的"产品"是文档与脚本，没有业务代码。
      `feature_list.json` 里放的是框架自身的能力项，不是用户可见功能。
      这会让阶段 3 的"完整循环周期"缺少真实事件源。

- [ ] **风险：阶段 2 判据 10 无法在本仓库验证** — 本仓库没有真实 issue/PR 流，
      triage 准确率只能在使用本框架的真实项目里测。

## Decisions Made

**决策 1：三阶段模型用机械判据而非模糊描述**
- **Context:** "做得更好"无法判定完成，也无法在 CI 里关卡
- **Alternatives considered:** 用检查清单让人自评（主观、不可关卡）

**决策 2：verification 子系统拆成两个检查项**
- **Context:** LHE 定义 verification 的最小工件是 `init.sh` 或文档化命令（阶段 1），
  而独立 verifier 是阶段 2 的产物。原来只计 verifier，导致阶段 1 永远无法达成
- **Alternatives considered:** 放宽阶段 1 判据（会掩盖真实缺口）

**决策 3：阶段 1 判据含"非占位符"检查**
- **Context:** 文件都存在但 init.sh 是占位符，是最隐蔽的失败——harness 形同虚设
- **Alternatives considered:** 只检查文件存在（会漏掉这类失败）

## Files Modified This Session

- `scripts/install-skills.mjs` — 新增 `--layout`（zcode|agents|both），支持跨 agent 的 `.agents/skills/`
- `scripts/lib/common.mjs` — `SKILL_DIRS` 补 `.zcode/skills`、`.agents/skills`
- `scripts/harness-stage.mjs` — verifier 缺失时的提示改为指向 install-skills.mjs
- `scripts/test.mjs` — 第 19 节新增 16 项布局断言（含非法 layout、both、manifest 字段）
- `README.md`、`docs/10-how-to-use.md` — 同步安装路径说明
- `feature_list.json` — 新增 setup-002（跨 agent 技能安装）
- `progress.md`、`STATE.md` — 本轮记录

## Evidence of Completion

- [x] Tests pass
      ```
      node scripts/test.mjs → Passed: 477   Failed: 0
      ```
- [x] 回退测试（红检）真的会挂
      ```
      把 --layout 改回硬编码 .zcode 后：
      Passed: 467   Failed: 10
      含「--layout agents 写入 <repo>/.agents/skills」「非法 --layout 退出码 1」
      失败信息指出的都是具体行为错误，不是编译错误
      ```
- [x] Stage detection works
      ```
      node scripts/harness-stage.mjs . → Current stage: 2 强化
      阶段 1 [COMPLETE] 10/10
      ```
- [x] Self audit
      ```
      node scripts/loop-audit.mjs . → Score: 94/100 · level L2
      ```
- [x] 审计盲区已修（对安装后的目标仓库）
      ```
      node scripts/loop-audit.mjs <personal-agent> → 7/100 → 43/100
      PASS  Loop skills present (13 found)
      PASS  Independent verifier present (maker/checker split)
      ```
- [x] 安装产物与源逐字节一致
      ```
      cmp skills/<n>/SKILL.md <target>/.agents/skills/<n>/SKILL.md → 18/18 IDENTICAL
      ```

## Notes for Next Session

**先读 `docs/11-three-stages.md`**，它定义了三阶段与判据。

本仓库当前在阶段 2。阶段 3 需要真实事件源，本仓库作为框架仓库缺少这一条件——
若要验证阶段 3，应在使用本框架的真实软件项目上跑，而不是在框架自身。

`LESSONS.md` 目前是空的（无真实夜审运行）。这是诚实的：框架自己还没跑过真实循环。

**本轮刻意没有写 `loop-run-log.md`**：审计把「`STATE.md` 有真实 Last run 时间戳」或
「`loop-run-log.md` 有含 `run_id` 的条目」当作循环真的跑过的证据。本轮是人工维护，
不是循环运行；写进去会把审计从 94/L2 抬到 98/L3，属于伪造活动证据。
实测：仅把 `Last run: never` 改成日期即触发，仅加一条 `run_id` 也能触发（即使目录几乎为空）。
循环活动记录应留给第一次真实事件驱动运行。
