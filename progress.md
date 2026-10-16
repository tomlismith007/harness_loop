# Session Progress Log

## Current State

- **Last Updated:** 2026-10-14 02:10
- **Active Feature:** 修复安装路径与阶段闸门假绿
- **当前阶段：** 1 初始化（本仓库是技能**源仓库**，非消费者；见 Blockers）

## Status

### What's Done

- [x] 蒸馏两个参考仓库（LHE harness engineering + LEC loop engineering）
- [x] 17 个技能（`harness-init` / `harness-loop-init` / `harness-consolidate` 三阶段 + `harness-loop` 运行时 + 控制/感知/执行/验证/学习）
- [x] 8 个脚本（7 个顶层 `.mjs` + `lib/common.mjs`），含 `harness-stage.mjs` 三阶段驱动器、`install-skills.mjs`
- [x] 13 篇文档、13 个模板、8 个事件接线 workflow
- [x] 1018 项测试断言全通过
- [x] 修复审计盲区 — `SKILL_DIRS` 补 `.zcode/skills` 与 `.agents/skills`
- [x] 修复审计 bug：verification 子系统只计 verifier，导致阶段 1 永远无法达成
- [x] 修复假阳性：Promoted 表占位符被误判为已转正
- [x] **修复默认安装布局** — `install-skills` 默认从 `.zcode` 改为 `.agents`
      （`.zcode` 保留为"覆盖同名技能"的显式选项）
- [x] **修复技能安装目标** — `harness-stage` / `init-loop-harness` 不再把技能写进
      无人扫描的 `<repo>/skills/`，统一写 `.agents/skills/`
- [x] **修复阶段闸门假绿** — 阶段 2 判据不再 grep 声明文本（阶段 1 模板自带那些字），
      改为检查"技能在可发现路径"+"拒绝列表已本地化"；无法机械判定的三项降级为人工确认
- [x] 修复 LESSONS.md 模板注释示例被误判为真实条目

### What's In Progress

- [ ] 无

### What's Next

1. 在真实软件项目上跑阶段 1 → 一周 L1 → 阶段 2
2. 阶段 2 的三项人工确认需要真实修复产生的证据（回退测试输出、NOT RUN 报告）

## Blockers / Risks

- [ ] **本仓库是技能源仓库，不是消费者** — 阶段判据是为消费者仓库写的。
      本仓库的 `skills/` 是技能的**规范来源**（不是安装目标），`loop-constraints.md`
      是模板的**来源**（因此与模板必然一致）。
      所以本仓库自报阶段 1 是正确的：它确实没在自己的仓库里"安装"过技能。
      要验证阶段 2/3，必须在真实软件项目上做。

- [ ] **阶段 2 的三项人工判据无法在本仓库验证** — 没有真实修复流，产生不了
      回退测试输出与 NOT RUN 报告。

## Decisions Made

**决策 1：阶段闸门只检查能被机械验证的事**
- **Context:** 早期用 grep 检查 `loop-constraints.md` 里有没有"回退测试""NOT RUN"字样。
  但阶段 1 的模板出厂就带这些文字 → 阶段 2 永远自动变绿，闸门形同虚设
- **Alternatives considered:** 继续 grep 但换更精确的模式（治标，仍无法区分"写过"和"做过"）
- **选择：** 无法机械判定的降级为人工确认。判断力无法被 grep 替代，标成人工项比让它假绿诚实

**决策 2：默认安装布局改为 `.agents`**
- **Context:** `.zcode` 是 ZCode 专属；`.agents` 是跨 agent 的共享约定，ZCode 也读
- **选择：** 默认共享路径，`.zcode` 保留为显式选项

**决策 3：技能安装目标必须是 agent 会扫描的路径**
- **Context:** `harness-stage` / `init-loop-harness` 原本写 `<repo>/skills/`，
  没有任何 agent 扫描该路径——文件到位了但从未被加载
- **选择：** 统一写 `.agents/skills/`

**决策 4：三阶段模型用机械判据而非模糊描述**
- **Context:** "做得更好"无法判定完成，也无法在 CI 里关卡
- **选择：** 每阶段有明确判据；无法机械判定的显式标为人工项

**决策 5：verification 子系统拆成两个检查项**
- **Context:** LHE 定义 verification 的最小工件是 `init.sh`（阶段 1），
  而独立 verifier 是阶段 2 的产物。原来只计 verifier，导致阶段 1 永远无法达成
- **选择：** 拆成 `verificationEntry` 与 `verifier`

## Files Modified This Session

- `scripts/install-skills.mjs` — 默认 layout 改 `agents`；帮助文本与提示更新
- `scripts/harness-stage.mjs` — 技能写入 `.agents/skills/`；阶段 2 判据重写；
  新增 `skillInDiscoverablePath` / `denylistLocalized` / `stripHtmlComments`
- `scripts/init-loop-harness.mjs` — 技能写入 `.agents/skills/`
- `scripts/test.mjs` — 路径断言更新；新增阶段闸门回归测试
- `skills/harness-loop-init/SKILL.md`（本轮从阶段 2 的旧名改来）— 判据表与人工确认章节重写
- `skills/harness-init/SKILL.md` — 阶段 2 提示更新
- `docs/11-three-stages.md`、`docs/12-stage-commands.md`、`docs/10-how-to-use.md` — 判据数同步
- `patterns/registry.yaml` — `mechanical_checks` / `human_checks` 更新

## Evidence of Completion

- [x] Tests pass
      ```
      node scripts/test.mjs → Passed: 498   Failed: 0
      ```
- [x] 用户场景复现：只跑阶段 1
      ```
      node scripts/harness-stage.mjs . --upgrade --stage 1
      → Current stage: 1 初始化        （修复前会假报 2）
      → 技能落在 .agents/skills/       （修复前落在无人扫描的 skills/）
      → 无裸 skills/ 目录
      ```
- [x] 阶段 2 报告不再假绿
      ```
      阶段 2 [IN PROGRESS] 3/6
      FAIL 独立 verifier 已装到可发现路径
      FAIL 熔断器就位（loop-guard 技能 + 账本）
      FAIL 拒绝列表已本地化（非模板原文）
      HUMAN 回退测试被实际执行过
      HUMAN NOT RUN 声明被实际使用过
      HUMAN triage 准确率 > 70%
      ```
- [x] 回退测试（红检）真的会挂
      ```
      把 --layout 改回硬编码 .zcode 后：Passed 467 / Failed 10
      失败信息指出的都是具体行为错误
      ```
- [x] 安装产物与源逐字节一致
      ```
      cmp skills/<n>/SKILL.md <target>/.agents/skills/<n>/SKILL.md → 18/18 IDENTICAL
      ```

## Notes for Next Session

**先读 `docs/11-three-stages.md`**，阶段 2 的判据已改（6 机械 + 3 人工）。

本仓库是源仓库，自报阶段 1 是正常的。要推进阶段，请在真实软件项目上做。

**本轮刻意没有写 `loop-run-log.md`**：审计把「`STATE.md` 有真实 Last run 时间戳」或
「`loop-run-log.md` 有含 `run_id` 的条目」当作循环真的跑过的证据。本轮是人工维护，
不是循环运行；写进去会把审计抬到 L3，属于伪造活动证据。
循环活动记录应留给第一次真实事件驱动运行。

