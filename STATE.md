# Loop State

Last run: 2026-10-14 (stage-boundary rework, batch 1 of 3)

本文件是循环的活状态：人类收件箱、当前活动、观察列表、本轮噪声。**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [x] **第二批已完成**：阶段 2 改名 `harness-loop-init`（14 处引用 + `test.mjs` 正向断言 + `staleNames` 扩词，REVIEW-*.md 属审查记录不改）；删掉重复装配技能、优点并入 `harness-init`（新增 `--commands` / `--package-manager`）；`init-loop-harness.mjs` 的 L1 文件清单改为 7 个、技能分级与 `harness-stage.mjs` 对齐；frontmatter 全部加 `stage:`（`harness-loop` 标 `runtime` 并改为任何阶段都装）。断言 624 → 686。
- [x] **第三批已完成**：`checkLedger` 的 fail-open 修掉——账本缺失 / `attempts` 字段缺失 / 类型不是数组 / `ledger` 为 null，一律 `verdict: no-ledger` + 退出码 2（空 `attempts` 数组仍是 ok，那是"还没开始跑"）；`hasEventWiring` 提到 `lib/common.mjs` 共用，`harness-loop` 第 0 步加事件接线检查（第 4 条，未接线记 `no-wiring` 而非 `no-op`）。断言 686 → 721。
- [ ] 仍未做（跟"越界"反方向，是"该触发没触发"）：`harness-loop` 技能第 6 步的命令示例仍缺 4 个硬约束入口（`--reviewed-sha`/`--head-sha`/`--red-check`/`--not-run`/`--constraints-root`）；`event-router` 把 3 个事件路由到 `phase: close` 但 `gate-check --phase` 枚举里没有 `close`。
- [ ] `harness-loop` 的 4 个命令 bug（跟"越界"反方向，是"该触发没触发"）：
  - `event-router` 把 `issues.closed` / `pull_request.closed:unmerged` / `release.published` 路由到 `phase: close`，但 `gate-check --phase` 枚举里**没有 `close`** → 照技能走必然 `exit 1`
  - `--phase gate` 强制要求 `--reviewed-sha` + `--head-sha`（约束 7），但 `harness-loop/SKILL.md` 第 6 步的命令两个都没写 → merge-gate 循环必然 `exit 1`
  - `--red-check`（约束 8 回退测试）与 `--not-run`（约束 9）这两个硬约束入口，编排层完全没提
  - `--constraints-root` 没进编排 → 多项目/子目录场景拒绝列表读错文件
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

### 2026-10-14 · 阶段边界重构 第三批（收尾）

- **本轮做了什么**：修 `checkLedger` 的 fail-open，并把事件接线判据提成两处共用的
  一份逻辑。

- **熔断器曾经在最需要说话的时候静默放行**。`scripts/ledger-check.mjs:72` 写着
  `Array.isArray(ledger?.attempts) ? ledger.attempts : []`——于是下面 7 种输入
  **全部**返回 `verdict: ok` / 退出码 0：

  | 输入 | 修前 | 修后 |
  |---|---|---|
  | `{}`（attempts 缺失） | ok / 0 | **no-ledger / 2** |
  | `{attempts: 'nope'}` | ok / 0 | **no-ledger / 2** |
  | `{attempts: null}` | ok / 0 | **no-ledger / 2** |
  | `null` / `undefined` / `[]` | ok / 0 | **no-ledger / 2** |
  | `{attempts: []}` | ok / 0 | ok / 0（"还没开始跑" ≠ "读不到"） |

  这正是硬约束 11 说的情况：**一个永远生效不了的闸门，和一个不存在的闸门，
  在退出码上不可区分**。CLI 层早就在账本文件不存在时报错，但库函数被直接调用时
  （测试、以及将来任何编排代码）会静默放行。修在库函数上。

- **`hasEventWiring` 从 `harness-stage.mjs` 提到 `lib/common.mjs`**。同一件事判两遍
  就有两遍可能漂移——阶段 3 的判据 1 和 `harness-loop` 第 0 步现在读同一个答案。
  顺带补上它以前完全没有的证据：`detail` 说明是"没有目录"还是"目录里没有 loop 文件"，
  而不是一个笼统的"未找到"。

- **变异回退 4 轮，其中 2 轮第一次就暴露了断言的问题**：
  | 变异 | 结果 |
  |---|---|
  | 删掉 `no-ledger` 的 exit_code 改 0 | ✅ 7 条断言红 |
  | 删掉 ledger 本体检查（只留 attempts 检查） | ✅ 崩溃——测试确实被触达 |
  | `LOOP.md` 声明式接线条件改永假 | ✅ 2 条断言红 |
  | workflow 匹配放宽成"有文件就算" | ✅ 2 条断言红 |

  第三次变异**第一次跑没有落地**（我以为落地了就去跑测试，其实文件已被前一条命令
  里的 `cp` 还原）。这类"变异没落地就宣布验证通过"的假绿灯，比无牙齿断言更危险——
  它让人以为验证过了。

- **过程中的一个真实事故**：用 Edit 把 `hasEventWiring` 插进 `common.mjs` 时，
  `old_string` 匹配到了 `loadDenylist` 的结尾，替换后**把 `loadDenylist` 的函数体
  吃掉了**，测试直接报 `does not provide an export named 'loadDenylist'`。
  靠 `test.mjs` 第一屏就崩才发现。**函数插入的 diff 要紧邻着插入点，不要跨过
  另一个函数的头部。**

- **必须产出的具体调整**：本仓库现在有六类"防装饰性配置"的测试：
  判据 2 双向断言、判据 5 真跑、子系统入口数、frontmatter↔清单一致、
  熔断器 fail-closed、接线判据共用。加上这次的经验，第五条要写成流程：
  **变异之后必须确认变异真的落地（看一眼那行代码），再读测试结果。**

- **三批到此收尾**。剩下的是 `harness-loop` 技能文档的命令示例不全，以及
  `close` 不在 gate-check 枚举里——两者都不是边界问题，是"该触发没触发"，
  记在 High Priority，另轮处理。

### 2026-10-14 · 阶段边界重构 第二批

- **本轮做了什么**：阶段 2 改名 `harness-loop-init`；删掉那个重复装配的技能、把它的
  `--commands` / `--package-manager` 能力并入 `harness-init`；给全部 17 个技能的
  frontmatter 加 `stage:` 字段并加测试锁住它与升级列表的一致性。

- **挖出第三个越界源，不在原计划里**：`init-loop-harness.mjs` 的 `--level L1`
  **仍然写全部 12 个文件**（含 5 个 loop 机制文档），技能分级也另有一套——L1 装
  `loop-guard`（阶段 2）、`signal-gatekeeper` 与 `lesson-harvest`（阶段 3），却不装
  `harness-init`。第一批只改了 `harness-stage.mjs`，这个脚本原样留着，于是修完之后
  **仍然有第二条路径能造出越界的项目**。同一个 "L1" 在两个脚本里是两套不同的东西。

  同理 `loop-audit.mjs:399` 的 "Scaffold everything missing" 直接推荐这条无闸门路径，
  README 与 `docs/07` 也推荐它。全部改指带 `--require` 的 `harness-stage.mjs`。

- **4 轮变异回退，2 条第一版无牙齿**：
  | 断言 | 第一次变异 | 补强 |
  |---|---|---|
  | 阶段 1 不装 `harness-loop`（它属于 runtime） | ❌ 变异后全绿 | 加"运行时技能不在任何建设阶段列表里" |
  | `init-loop-harness --level L1` 不产出 loop 文档 | ❌ 变异后全绿 | 加整套 L1 断言（5 文件 + 6 技能） |
  | frontmatter `stage:` 与升级列表一致 | ✅ 当场变红 | — |
  | `--commands` 真的改变生成的脚本 | ✅ 当场变红 | — |

- **新断言抓到了一个我自己引入的矛盾**：我把 `harness-loop` 标成 `stage: runtime`
  却忘了把它从 `STAGE1_SKILLS` 移出。测试立刻报"frontmatter 说 runtime，列表说阶段 1"。
  **这正是这条断言存在的意义**——声明和清单各说各话时它会响。

- **过程中出的两个自己的错**（记下来，别重复）：
  1. 用脚本批量给 frontmatter 加字段时，正则匹配多写了一个 `\n`，给 **11 个技能**
     各造了一个重复的 `---` 围栏。批量改结构化文件前先在一个文件上验证。
  2. `git checkout scripts/init-loop-harness.mjs` 想撤销一个变异，**把该文件整个
     重置回 HEAD**，抹掉了本轮已经写好的改动。恢复变异的正确做法是从改动前的副本
     拷回（`/tmp/*.bak`），不是 `git checkout`。

- **必须产出的具体调整**：本仓库已经有三条"避免装饰性配置"的测试
  （判据 2 双向断言、判据 5 真跑、子系统入口数），现在加上 frontmatter↔清单一致性，
  共四类。**新增声明类配置时，默认写一条断言它与执行路径一致的测试**，
  不要等变异时才发现它只是装饰品。

- **下一批**：第三批是纯运行时改动（`harness-loop` 第 0 步事件接线检查 +
  `ledger-check` 账本缺失报错），与前两批无耦合，可以独立验证。

### 2026-10-14 · 阶段边界重构 第一批

- **本轮做了什么**：把阶段 1 的职责收窄成「harness 地基」。它原来产出 12 个文件，
  包含 5 个 loop 机制文档（`LOOP.md` / `loop-budget.md` / `loop-run-log.md` /
  `session-handoff.md` / `loop-ledger.json`），于是阶段 1 项目在没有 verifier、
  没有闸门执行力的状态下就把就绪度评分推到 56。现在阶段 1 产出 **7 个文件**、
  **8 项判据**，那 5 个文件移到阶段 2。

- **三处判据从"存在"升级为"真的"**：
  | 判据 | 从 | 到 |
  |---|---|---|
  | 2 | features 是非空数组 | 每条 feature 有可判定的完成标准（占位被拦） |
  | 5 | init.sh 非占位（只读文本） | **实际执行**，退出码必须 0 |
  | 6 | LOOP.md 存在 | AGENTS.md 声明工作规则 |

- **两个真 bug**（不是语义调整，是判据与代码自相矛盾）：
  1. `summarizeSubsystems` 里 `instructions` 依赖 `loopConfig`（LOOP.md，阶段 2 才建）、
     `lifecycle` 依赖 `budgetDoc`/`budgetSkill`/`stallDetection`/`escalation`（全在阶段 2）。
     阶段 1 明明有 AGENTS.md + STATE.md，子系统却报缺口 → 判据「五子系统都有最小工件」
     永远 FAIL。改后 `instructions` 只认指令文件，`lifecycle` 认 STATE.md + run-log。
  2. `harness-stage.mjs` 的 init.sh 判据把脚本内 `command not found` 误报成
     「bash 不可用」——证据指向了错误的原因。改为区分 spawn 层失败与脚本非零退出。

- **本轮有 4 条新断言第一次写完是"无牙齿"的**，全部靠变异回退发现并补强：
  | 断言 | 第一次变异 | 补强手段 |
  |---|---|---|
  | 阶段 1 不生成 loop 文件 | ✅ 当场变红 | — |
  | 判据 2 拦占位 feature | ❌ 变异后全绿（把 `if (loose.length)` 改 `if (false)` 测不出来） | 加「模板占位 FAIL + 真实 feature PASS」双向断言 |
  | 判据 5 真跑脚本 | ❌ 变异后全绿 | 加「格式对但命令跑不通 → FAIL，证据含退出码」 |
  | 子系统映射 | ❌ 变异后全绿（只判 `passed > 0`，但 `budgetSkill`/`escalation` 仍会通过） | 改判 `total`，锁住入口数 |

  **这与上一轮同一个病**：断言写错了方向或根本没触达被测代码。**没有回退测试的
  断言等于装饰品**，与硬约束 8 同源。

- **必须产出的具体调整**：本仓库的 `test.mjs` 已经能抓住这些，但**新写的断言默认
  是无牙齿的**——四次里有四次第一版就掉进这个坑。以后加判据类断言，固定流程是
  先写变异、确认变红，再算写完。

- **下一批的前置已清**：阶段 2 的判据表现在能写它真实的 5 个产出清单了。

### 2026-10-14 · 三份审查的 fail-open 修复

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