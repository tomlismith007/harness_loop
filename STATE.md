# Loop State

Last run: 2026-10-16 (第三轮独立复核：修正审查报告两处，升格一处)

本文件是循环的活状态：人类收件箱、当前活动、观察列表、本轮噪声。**每轮开始读，每轮结束写。** 已关闭/已合并的条目在每轮清理时移除。

## High Priority (loop is acting or waiting on human)

- [ ] **`REVIEW-2026-10-16-*` 两处表述已修正，实施前必读**：第三轮独立复核逐条重跑关键探针后，22 条问题里 **20 条原样成立，1 条表述错误，1 条触发条件错误，1 条从"存疑"升格为"已确认"**。
  - **P1-07（MP-01）表述错误**：原文"裸路径 `--diff-files auth/login.ts` → `proceed`"**复现不出**——四种参数排列（含文件真实存在）全部 `escalate / denylist`。真实缺陷是**对多行清单忘记 `@`**：`--diff-files big.txt`（20 条）→ `proceed, files_changed: 1`；`@big.txt` → `escalate / scope, 20`。危害相同（拒绝列表 + 范围闸门**同时**失效），但 fixture 必须按"忘记 `@`"写。
  - **P2-08（MP-10）判据错误**：原文"原生 Windows → 978/1"不成立——原生 `powershell.exe` 直接跑是 **979/0**（Git 的 `timeout` 在 PATH 上）。只有 `system32` 排到 Git 之前才复现 978/1。**分叉判据必须是 `hasGnuTimeout()` 的返回值，不能是 `process.platform`**，否则写出在开发机上恒绿的假断言。
  - **P1-04 的 `noop` 升格**：原标"静态分析，存疑"，实测确认——`[f,f,noop,f,f]` → `ok, 2/5, exit 0`，而 `[f,f,f,f,f]` → `no-progress, 5/5, exit 2`。一次被锁跳过的 `noop` 就能洗掉"5 次都没进展"。MP-05 的补充项从"先实测"改为"直接修"。
  - 详见 `REVIEW-2026-10-16-harness-loop-audit.md` §7.4 / §9.4 与 `REVIEW-2026-10-16-modification-spec.md` 头部修正表。

- [x] **本轮已完成（2026-10-15 第四批）**：修复验证路径的自递归与孤儿进程。`init.sh` 从 **10m06s → 45.4s**（13 倍），`test.mjs` 从 64.7s → 43.7s。核心是三处：① 判据 5 的自引用防护（源仓库的 `init.sh` 调 `harness-stage`，而判据 5 又执行被审计仓库的 `init.sh` → 无限递归，实测 9 层、69 次 120s 超时）；② `runWithTreeKill`（Node 的 timeout 只杀直接子进程，实测超时后孙进程全存活 → 换 GNU `timeout -k`，实测整棵树全灭）；③ 判据 memoization（同一次运行里判据 5 被算 3 遍 = init.sh 执行 3 次）。断言 954 → 979，4 次变异全部确认落地后变红。
- [ ] **预算百分比目前对 5 个 workflow 恒为 0（已知限制，不是 bug）**：`budget-check` 从 `loop-run-log.md` 累加当日花费，而只有 `daily-triage` / `lesson-harvest` 在写它。新接线的 5 个（`ci-sweeper` / `issue-intake` / `post-merge` / `pr-review` / `release-draft`）不写 run-log，所以 `used` 恒为 0。**本次接线立即生效的是 kill switch**；预算百分比要等 agent 平台把真实花费写进 run-log 才有意义。让 workflow 自己写 run-log 有风险（runner 文件系统是临时的，写入不会持久化到仓库——见 `examples/github-actions/README.md` 的说明），需要先决定持久化方式（评论 / dispatch / 直接 commit）。
- [ ] **`loop-constraints.md` 与 `LOOP.md` 的文件数阈值自相矛盾**：前者写"超过 5 个文件 → 停止并升级"，后者写"超过 10 个文件 → 人工审批"。本仓库的实际改动面经常超过 5（本轮 10 个文件，其中 3 个是被测试强制的文档数字同步）。需要先统一阈值，或明确"同步类改动不计入"。
- [ ] **真机验证（硬约束 10）**：`WP-04` 的注入修复、`WP-02`/`WP-07` 的装配形态、锁接线与预算接线，全部只验证到"本地临时目录 + 本地模拟 + YAML 解析"。**8 个 workflow 从未在任何真实 GitHub 仓库上跑过。** 合并进任何项目前，必须在一个测试仓库上跑一次真实事件，确认 workflow 能执行 `event-router`、把 work item 交付出来、且 `budget-check` 在 runner 上真的读得到文件。
- [ ] 确认 `loop-constraints.md` 的拒绝列表已按本仓库实际情况调整（本仓库是技能源仓库，见 Post-Run Critique）。
- [ ] 把三份审查里**未纳入本轮范围**的项排进下一轮（见下方「Watch List」）。
- [ ] **快慢分离（本轮的 4 号提议，主动跳过）**：给 `test.mjs` 加 `--quick` 子集。**跳过理由**：修完自递归后 `init.sh` 已是 45 秒，快速子集的边际收益不再支撑它的复杂度（多一条"哪些断言属于快集"的真相源，而本仓库的教训正是"没人读的配置会漂移"）。若将来断言数再翻倍，重开此项。

## Active

| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

`acting_on` 用于多循环冲突检测：派发新任务前检查此列，避免两个循环改同一分支。

**锁键约定**：`acting_on` 填**分支名或 PR 号**（唯一全局命名空间），不是 work item id。
`event-router` 现在按 `acting_on` 比对，CLI 侧用 `--target` 传锁键、`--item` 传 work item id。
两者混用会让锁永远不触发。

**生产路径已接线（2026-10-15）**：4 个落盘 work item 的循环传 `--target` 并消费 `.conflict`。
`release-draft` 有意不传（可安全并发）。改这两个面向时看 `test.mjs` 第 14 节：
断言会检查"传了锁键"与"写队列那一步被 `if:` 守卫"两件事，且双向
（不落盘的 workflow 不得传 `--target`）。

## Watch List

- 尚未跑过任何一轮真实事件。第一周目标：只报告，积累可靠的 triage 记录。
- **第三轮复核暴露的方法论问题（值得进 LESSONS）**：轮 2 把 P1-07 从"设计取舍"升格为"问题"时，**依据的是一次没有对照的观测**——它记录了"裸路径 → proceed"，但没有同时跑"同一路径加 `@`"来确认差异真的来自 `@`。这与已记录的 D3（"两个对照结果相同却是噪声"）是同一个病的两种形态：**只跑了一个对照就归因**。对照实验的另一半必须真的跑，不能推理。
- **`hasGnuTimeout` 是 `common.mjs` 的模块私有函数**，`test.mjs` 只能通过 `treeKill` 标记间接验证它。MP-10 要按它分叉，需要先导出（或导出 `capabilities()`）。这是 MP-10 的一个前置，不是可选项。
- **`feature_list.json` 有一个重复 id（`stage-001` 出现两次，索引 1 与 7）**：
  "三阶段检测与升级可用" 与 "阶段 1 只产出 harness 地基" 共用同一 id。
  本轮发现但未修（与验证路径无关，一轮一个修复）。重复 id 会让"按 id 查 feature"
  这类消费方拿到不确定的结果，且没有任何断言守住唯一性——加断言前先决定改哪个 id。
- **本轮修复只在本机验证（Windows/MSYS）**：GNU `timeout` 是 MSYS 提供的；
  Linux CI 上 coreutils timeout 必然存在，但 `samePath` 的路径规范化与
  `pwd -W` 回退分支未在真机跑过。这是硬约束 10 的一个子项，随真机验证一并做。
- `examples/github-actions/` 的 workflow 只做了静态修复，**未在真实 GitHub 仓库上跑过一次**。
  合并进任何项目之前必须先在一个测试仓库上验证（硬约束 10）。
- 本轮未处理的审查结论：
  - `denylistLocalized()` 仍只做与模板的集合差，加一条不存在的路径（`totally/fake/path/**`）
    也能判"已本地化"。需要"路径真实存在"判据。
  - `loop-audit.mjs` 的 `hasVerifier` / triage 检测仍是裸子串匹配，写一句"我们是 maker/checker"
    即可满足。
  - `detectLoopActivity` 的 git 历史分支匹配 commit message 子串，在本仓库几乎必然命中。
  - `**/*_key*` 会误命中 `src/monkey_key.ts`。**有意保留**：拒绝列表宁可多拦不可漏拦。
  - ~~`loop-budget.md` 的 per-loop 上限没被真正使用（`Math.max(...caps)` 取全表最大值 500k）。~~
    **2026-10-15 更新**：脚本侧已修完（`budget-check.mjs` 按 pattern 取该循环自己的上限，
    并新增 `resolveCap` 暴露解析路径；`loop-budget.md` 补齐 3 个缺失的循环行）。
    **剩下的纯是接线**：8 个 workflow 里只有 `merge-gate` 调用它。见 High Priority。
  - **`loop-budget.md` 与 `LOOP.md` 是两份各说各话的上限真相源**：`LOOP.md` 的"已注册循环"
    表也有"每日 token 上限"列（80k/300k/500k/100k/200k/100k），值目前与 `loop-budget.md`
    一致，但**没有任何东西在校验两者相等**。`budget-check` 只读 `loop-budget.md`。
    改一处不改另一处会静默产生两个不同的上限。要么让 `LOOP.md` 那列指向 `loop-budget.md`，
    要么加一条双向断言。`patterns/registry.yaml` 的 `suggested_daily_cap` 是**第三份**
    （8 个循环，无任何消费者）——三个真相源。
  - **`patterns/registry.yaml` 的 `patterns:` 段整段没有消费者**：`suggested_daily_cap`
    被 `grep` 确认无任何脚本读取；`readRegistryDefaults` 只读 `defaults:` 段，
    `readRegistryStages` 只读 `stages:` 段。`patterns:` 段（8 个循环的机器可读定义）
    目前是纯文档。与 WP-21 修掉的 `stages:` 是同一类病，只是还没轮到它。
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

### 2026-10-16 · 第三轮独立复核：修正审查报告两处，升格一处（本轮）

- **本轮做了什么**：对 `REVIEW-2026-10-16-harness-loop-audit.md` 与配套 spec 做了**对抗性复核**——不是重读代码，而是**逐条重跑关键探针**。目标是回答：这份报告里哪些结论是真的，哪些是推理出来的。产出为审查报告新增 §9、§7.4，spec 头部修正表与 MP-01/MP-05/MP-10 三处改写。**未改任何代码**（本轮是文档轮）。

- **结论：报告骨架经得起复核，但两处"结论对、证据错"**。22 条问题里 20 条原样成立（P0-01/P0-02 尤其扎实——手写 4 份证据文件实跑，前三份全部 `proceed, exit 0`）；1 条表述错误（P1-07）；1 条触发条件错误（P2-08）；1 条从"存疑"升格为"已确认"（P1-04 的 `noop`）。**没有发现凭空捏造的结论，也没有发现"读了代码就说验证过"的条目。**

- **P1-07 复现不出，这是本轮最重要的发现**。报告声称裸路径 `--diff-files auth/login.ts` → `proceed, files_changed: 1`。我跑了这个字符串、三种参数排列、以及让文件真实存在于磁盘上——**全部 `escalate / denylist`**。真正的缺陷更窄：**对多行清单文件忘记 `@`，N 个文件塌缩成 1 个**。实测 `--diff-files big.txt`（20 条路径）→ `proceed, files_changed: 1`；`@big.txt` → `escalate / scope, 20`。**拒绝列表闸门与范围闸门同时失效**——首行无害的清单能藏住后面的 `auth/**`。同一个根因（`split(',')` 把文件路径当单一路径），不同的触发条件。

- **为什么轮 2 会写错，这个模式值得记**：轮 2 升格 P1-07 时**只跑了一个对照**——记录了"裸路径 → proceed"，但**没有同时跑"同一路径加 `@`"**来确认差异真的来自 `@`。这与仓库已记录的 D3 是同一个病的两种形态：D3 是"两个对照结果相同，实为噪声"；这次是"**只跑了一个对照就归因**"。**对照实验的另一半必须真的跑，不能推理。** 已记入 Watch List，建议进 `LESSONS.md`。

- **P2-08 的 978/1 是环境相关，不是平台决定**。报告写"原生 Windows → 978/1"。实测：原生 `powershell.exe` 直接跑 `test.mjs` → **979/0**——因为 Git 的 `/usr/bin` 在 PATH 上，解析到 GNU coreutils 的 `timeout`，`hasGnuTimeout()` 为真。只有把 `C:\Windows\system32` 排到 Git 之前才复现 978/1（并确认降级路径 `treeKill: false` **确实**泄漏孙进程，`sleep.exe` 存活）。**这直接改变 MP-10 的实现**：分叉判据必须是 `hasGnuTimeout()` 的返回值，**不能是 `process.platform`**——按平台名写会得到一个在开发机上恒绿的假断言。

- **`noop` 从"存疑"升格为"已确认"，且我构造的账本直接推翻了报告自己的谨慎**。报告标"静态分析得出，未实测"。实测：`[f,f,noop,f,f]` → `ok, 2/5, exit 0`；`[f,f,f,f,f]` → `no-progress, 5/5, exit 2`。同样是"5 次里 5 次失败、中间没有任何一次成功"，只因插入一次 `noop`（被锁跳过的**合法**结局）就从"熔断"变成"继续跑"。**报告在这里低估了自己的发现。**

- **P2-07 比报告说的更严重**。我读了宿主 `pi-coding-agent` 的 `package-manager.js` 与 `config.js`：宿主读 `~/.agents/skills`、`<cwd>/.pi/skills`、`~/.pi/agent/skills`。**`.zcode` 在宿主源码里零命中**——装在 `~/.zcode/skills` 的 18 个技能没有任何东西在读。报告只说了"`.pi` 缺席三方不一致"，实际是"主力安装目录整个不被宿主读取"。

- **我自己的失误（记下来）**：第一次跑 `loop-audit --json` 时我报告"无 FAIL"，一度看起来像 P2-04 报错了。那是**我的解析 bug**——`checks` 是扁平数组（`{key,label,ok,weight}`），不嵌在 `subsystems` 下；我按 `subsystems[k].checks` 去取，得到空数组。改用 `j.checks.filter(c => !c.ok)` 后立刻看到 `toolScope` 与 `loopActivity` 均 FAIL。**P2-04 属实。** 症状与本仓库反复记录的模式一样：**探针的范围一旦错位，绿色的输出就指向不存在的结论**——只不过这次错的是我的探针，不是被测代码。

- **本轮的可检验产出**（全部实跑，非推理）：
  | 命令 | 结果 |
  |---|---|
  | `gate-check` + `APPROVE`/`Tests→FAIL` 证据 | `proceed, exit 0`（缺陷确认） |
  | `gate-check --diff-files big.txt`（无 `@`） | `proceed, files_changed: 1`（缺陷确认） |
  | `gate-check --diff-files @big.txt` | `escalate / scope, 20`（对照） |
  | `ledger-check --ledger led-noop.json` | `ok, 2/5, exit 0`（noop 洗计数确认） |
  | `ledger-check --ledger led-tail.json` | `no-progress, 5/5, exit 2`（对照） |
  | `queue-read --json`（本仓库） | `items: []`，note 谎称无待办（缺陷确认） |
  | `hasEventWiring('D:/harness_loop')` | `wired: true`（假阳性确认） |
  | `test.mjs`（git bash） | `Passed: 979 Failed: 0` |
  | `test.mjs`（PowerShell + system32 优先） | `Passed: 978 Failed: 1`（唯一失败＝孙进程断言） |

- **清理**：本轮跑测试泄漏了 `sleep.exe` 孤儿进程（正是 P2-08 描述的现象），已 `Stop-Process` 清理；探针临时文件已删。`git status --porcelain` 仅剩两份 review 文档为未跟踪。

- **未做**：未改任何代码；未验证 Linux/GNU-timeout 路径、8 个 workflow 在真实仓库的行为、`harness-loop` 的触发行为、`harness-stage --upgrade` 的写入路径——与审查报告 §8 声明的缺口一致，复核**没有缩小**它们。

### 2026-10-15 · 验证路径自递归 + 孤儿进程（本轮）

- **本轮做了什么**：修掉"跑一次验证要等 10 分钟"的根因。`init.sh` 10m06s → **45.4s**，
  `test.mjs` 64.7s → **43.7s**（且断言从 954 涨到 979）。三处修复 + 4 次变异回退。

- **病灶是自引用环，不是"测试多"**。`init.sh:72` 是 `node scripts/harness-stage.mjs .`
  （用 harness-stage 审计本仓库），而阶段 1 判据 5 要求"目标的 init.sh 真的能跑通"——
  于是 `harness-stage.mjs` 真的去执行目标的 init.sh，目标就是自己。探针实测：
  **69 次执行仓库自身的 init.sh，全部 120,00x 毫秒超时，嵌套深度 0–6 层，
  总计 10,753 次进程 spawn、最深 9 层**。这不是"慢"，是判据在这种输入下
  **无法给出任何结论**——它每次都在超时后返回一个假的失败。

- **Node 的 `timeout` 只杀直接子进程，这是孤儿的来源**。实测（心跳文件 + 精确 winpid）：
  `execFileSync(..., {timeout})` 超时后**三个层级的孙进程全部 ALIVE，心跳继续增长**；
  换成 GNU `timeout -k` 后同一场景**整棵树全灭、心跳停止**。
  后果不是"清理不干净"：孤儿继续烧 CPU 并互相拖慢，让后续每次 spawn 都更慢——
  实测一轮跑完后探针日志又长了 9,800 行，21:00 时机器上有 **83 个进程、21 棵孤儿树**。

- **判据被算 3 遍 = init.sh 被执行 3 遍**。`checksByStage`、`detectStage`、JSON 输出
  各调一次 `STAGE_CHECKS`。基线实测：一个 `sleep 297` 的 init.sh 让判据 5 耗时
  **恰好 6m00s**（120s × 3）。判据是 `(root, audit)` 的纯函数，加 memo 即可。
  变异 4（去掉 memo）红在"expected 1, got 3"——这个数字直接指认了病因。

- **超时被报成"bash 不可用"，证据指向错误的原因**。基线证据原文：
  `无法执行 init.sh（bash 不可用或脚本不存在）：spawnSync bash ETIMEDOUT`——
  init.sh 明明存在，bash 也明明可用。这违反三态约定：超时是"**没跑完**"，
  与"跑不通"是两件事。现在超时记 **NOT RUN**（`notRun: true`），报告里显示为
  `NOT RUN` 而非 `FAIL`。

- **自引用防护做了两条判据，各覆盖一种入口**（两条都有独立测试）：
  1. 环境变量标记 `LOOP_HARNESS_ACTIVE_INIT`——`init.sh`（生成的与手写的）导出自身
     绝对路径，下一层凭它认出递归。覆盖"消费方手写递归脚本"。
  2. `root == PACK_ROOT`——兜底。覆盖"标记被绕过/不存在"的情况。
  只做判据 1 时，任何手写递归 init.sh 就能重新引爆；只做判据 2 时，消费方的递归
  脚本（root 不是 PACK_ROOT）拦不住。**两条都是必需的**，测试分别断言。
  `pwd -W` 给出 `D:/repo/init.sh`（正斜杠）而 Node 给 `D:\repo\init.sh`，
  所以配了 `samePath()` 做规范化——否则判定永远为假。

- **4 次变异，全部确认落地后读结果**：

  | 变异 | 结果 |
  |---|---|
  | 1. `detectSelfReference` 恒返回 false | ✅ **7 条红**，含"未在 25s 内返回——判据 5 很可能又递归进 init.sh 了" |
  | 2. 禁用 GNU timeout（退回 Node timeout） | ✅ **3 条红**，含"pid 1151 仍存活——孤儿进程会继续烧 CPU" |
  | 3. 生成的 init.sh 去掉标记 | ✅ **2 条红** |
  | 4. 去掉 memoization | ✅ **1 条红**：`expected 1, got 3` |

- **变异 2 当场抓出我自己引入的一个真 bug**：降级路径里 `timedOut` 与 `spawnFailed`
  可以同时为 true（Node 的 timeout 也让 `status === null`），于是调用方按
  `spawnFailed` 分支走，又把超时报成"bash 不可用"——正是本轮要修的那个误报。
  修法：`spawnFailed = !timedOut && (...)`。**这就是变异回退的价值**：
  这条路径在正常平台上永远不会走到（有 GNU timeout），只有变异才会暴露它。

- **测试设计的一个改进**：自引用断言改用 `runWithTreeKill`（25s 上限）而不是裸
  `execFileSync`。因为变异 1 会让测试**真的递归**——第一次跑就是 15 分钟没返回，
  我不得不中途掐掉。**断言失效时必须快速变红，而不是把整个套件拖进被测代码的病里。**

- **第 4 项提议（`--quick` 快慢分离）主动跳过**。修完自递归后 `init.sh` 已 45 秒，
  快速子集的边际收益不再支撑它的复杂度——多一条"哪些断言属于快集"的真相源，
  而本仓库的教训恰恰是"没人读的配置会漂移"。若断言数再翻倍，重开此项。

- **`loop-audit.mjs` 的 `git log` 加了进程内缓存**。实测整个套件曾出现 2,343 次
  `git log --oneline -25`（累计 173s），是递归树的副产品；但 `scoreHarness` 本身
  也是热路径（测试套件调它十几次）。按 root 分键缓存——审计不写仓库，同进程内
  历史不变。已确认测试套件不会中途 `git init`/`commit`，缓存安全。

### 2026-10-15 · workflow 预算接线 + LOOP_BOT_TOKEN（WP-09/WP-04 第二半）

- **本轮做了什么**：8 个 workflow 全部接上 `budget-check.mjs`（此前只有 1 个），
  修掉 `merge-gate` 自身的 fail-open，`LOOP_BOT_TOKEN` 落地到全部 3 个调用 `gh`
  的 workflow。断言 945 → 954。提交 `7fc0fe0`。

- **两个"有保护"的 workflow 其实保护是坏的**。`daily-triage` / `lesson-harvest`
  的内联预算有两个真问题，合起来让它们等于没有预算：
  1. `Math.max(...caps)` 取全表最大上限（自身 83% 被算成 50%）；
  2. 数 run-log 的正则是 `/\{.*\}/g`，**不带 `s`/`m` 标志**，而 run-log 的记录是
     跨多行的 JSON——一条都匹配不上，`used` 恒为 0。
  这两个恰好是**唯二在写 `loop-run-log.md`** 的 workflow，而 run-log 是
  `budget-check` 的唯一数据源。**真正活跃的循环贡献的花费，在"今天花了多少"里是隐形的。**
  内联版还只查 `STATE.md` 的 kill switch，`budget-check` 同时查两处。

- **`merge-gate` 的接线本身是 fail-open**，且这是本轮最有代表性的一处：
  `budget-check ... || true` 吞掉退出码 → 脚本崩溃时 `budget.json` 为空 →
  `jq` 得到 `"null"` → `"null" != "exit"` → **闸门在没有预算检查的情况下继续跑，
  而输出看起来完全正常**。一个失效的闸门和一个不存在的闸门在退出码上不可区分
  （硬约束 11 的原文）。修法是显式守卫：`jq -e '.mode'` 读不到就 `exit 1`。

- **`.some()` 型断言的又一次失效**。`LOOP_BOT_TOKEN` 的原断言是
  "至少一个 workflow 引用它"——1/8 也算通过。它声称守住的是"用独立最小权限账号
  限制注入影响面"，而 7/8 是裸 `GITHUB_TOKEN` 时它依然全绿。
  **断言的范围必须等于它声称守护的范围**，这与上一轮 `/\.conflict/` 被注释骗过、
  按文件搜 `if:` 被同文件其它步骤骗过是同一个病。

- **修复面比报告的窄，这是好事**。报告说"8 个 workflow 的 token 问题"，
  实测只有 3 个真的调用 `gh`（`daily-triage` 读 / `merge-gate` 读+写 /
  `release-draft` 读），另 5 个的权限只来自 `permissions:` 声明。
  断言因此是双向的：**调 `gh` 的必须用 `LOOP_BOT_TOKEN`，不调 `gh` 的不得引用它**。
  反向那半守住了"规则只适用于该适用的地方"。

- **一个必须说清楚的限制，不能让它看起来比实际更好**：新接线的 5 个 workflow
  不写 `loop-run-log.md`，所以它们的 `used` 恒为 0——**预算百分比在结构上还算不出来**。
  本次接线立即生效的部分是 **kill switch**。让 workflow 自己写 run-log 有风险：
  runner 文件系统是临时的，写入不会持久化到仓库（`examples/github-actions/README.md`
  已说明），需要先决定持久化方式。这一点写进了 workflow 注释、`STATE.md` 与提交信息。

- **变异回退 3 次，全部确认落地后读结果**，其中一次又遇到"变异未落地导致的假绿灯"：
  第一次删 fail-closed 守卫时，我的 Python 断言在改文件**之前**就拦下了
  （块是 4 行不是 3 行），测试全绿——差点据此宣布"抓住了"。仓库已记录过这条教训
  （2026-10-14 第三批、2026-10-15 第二批各一次）。**流程固定为：改完先 grep 那行代码，
  再跑测试。**

- **本轮新增的 4 条规则断言都是"防漏改"型**（每个 workflow 都要接线 / 传的 pattern
  要能解析到上限 / fail-closed / 调 gh 必须用 bot token）。它们的价值不在当前状态，
  而在**第九个 workflow 加进来时**：漏接线会立刻变红，而不是像这次一样要靠人工审计发现。

### 2026-10-15 · acting_on 锁键接线（多循环协调唯一机制首次生效）

- **本轮做了什么**：让 `LOOP.md` 的"同一分支每小时最多一个循环修改"在生产路径上真正生效。
  4 个落盘 work item 的循环传 `--target` 并消费冲突结果；`release-draft` 有意排除。
  断言 931 → 945。提交 `f36301b`。

- **只加 `--target` 是半个修复，这是本轮最重要的发现**。原报告说"8/8 未传 `--target`"——
  属实，但 `grep -rn "conflict" examples/github-actions/*.yml` 返回**空**：
  没有任何 workflow 读锁结果。于是即使补上 `--target`，锁也只会被算出来然后丢掉——
  work item 照样落盘，没人看到冲突。**"算出来"与"因此改变行为"是两件事**，
  与 WP-09 的"接线与配置是两件事"、硬约束 11 的"可执行入口"同源。
  所以断言是双向的：**传了锁键** 且 **消费了锁结果** 且 **写队列那一步被守卫**。

- **两次无牙齿断言，都是变异回退抓出来的**（本轮 4 次变异，2 次暴露问题）：
  | 变异 | 第一版断言 | 补强 |
  |---|---|---|
  | 把 `jq -r '.conflict'` 换成常量 | ❌ 全绿——断言是 `/\.conflict/`，注释里写一句就骗过 | 锚定 `jq -r '\.conflict'` 真实调用形态 |
  | 删掉写队列步骤的 `if:` 守卫 | ❌ 全绿——断言按**文件**搜 `if:.*conflict != 'lock-held'`，而同文件 `Upload work item` / `Flag fix phase` 的 `if:` 也含它 | 按步骤切分，定位到 `mkdir -p .loop/queue` 那一步再查它自己的 `if:` |

  **第二次尤其值得记**：断言从"整个文件有没有这个字符串"退化成"整个文件有没有这个字符串"——
  它测的是**文件里出现过**，不是**那一步被守卫**。这与仓库反复记录的模式一致：
  **断言的范围一旦比被守护的对象大，它就会在对象失效后继续绿。**

- **一次"变异未落地导致的假绿灯"**：第一次做变异 1 时 Python 的转义没匹配上，
  文件没改，测试全绿——我差点据此宣布"变异被抓住"。仓库 `STATE.md` 早就记过这条
  （2026-10-14 第三批：`cp` 还原导致变异没落地）。**流程是：改完先看那行代码，
  再跑测试。** 这次靠 `grep -c -- "--target"` 返回 4 才发现。

- **顺带修了一条既有断言的假阳性**：通用 flag 扫描用 `[\s\S]{0,300}?` 一直捕获到下一个
  空行/围栏，于是文档里**相邻的两条命令**被算成同一条——`gate-check` 那行被算上了下一行
  `budget-check` 的 `--pattern`。相邻命令是文档常态（枚举探针时尤其常见），
  这个假阳性必然出现。改为只在反斜杠续行时跨行。

- **本轮发生了一起真实事故，且正是 `acting_on` 锁该防的场景**：
  本轮全部未提交改动（5 个 workflow + `test.mjs`）被**外部进程一次性还原**
  （所有文件 mtime 落在同一秒 `17:11:33`），另一个 agent 留在仓库里的
  `.audit-notes-mechanisms.md` 也一并消失。我的 commit 完好，重做后立即提交。
  **两个 agent 在同一工作区并发修改，而锁此前从未生效**——这不是比喻，是当场演示。
  教训：**在多 agent 环境下，未提交的工作不算完成。改完立刻提交。**
  （那个 agent 的审计笔记独立得出 C7："equality lock exists, hourly rule has no code,
  no caller passes `--target`"——与我的诊断一致，属独立佐证。）

- **一处需要更正的记录**：spec 状态表声称 WP-11"断言已加并通过变异回退"，
  但 `grep -c "第 2 步" scripts/test.mjs` = 0，`test.mjs` 里**不存在**针对
  `harness-loop/SKILL.md` 的 `--target` 断言。原断言只覆盖了"文档写了 `--target`"，
  没覆盖任何生产路径。这与 WP-09/WP-04 是同一个病换位置——**断言写在文档上，
  而问题在代码里**。

### 2026-10-15 · per-loop 预算上限（WP-09 缺口第一半）

- **本轮做了什么**：独立复核上一轮 agent 的自报缺口后，重做了 WP-09 的前置部分。
  补 `loop-budget.md` 的 3 个缺失循环行、修 `parseBudgetCaps` 的静默回退与过宽别名、
  新增 `resolveCap` 暴露解析路径、把断言从"单文件"改成"规则"。断言 923 → 931。

- **原方案照做会当场炸，这是本轮最重要的一条**。上一轮 agent 提的修法是
  "给 8 个 workflow 加 `budget-check` 调用"。实测：`daily-triage` 与 `lesson-harvest`
  在 `loop-budget.md` 里**根本没有行**，而 `budget-check` 对无上限返回
  `cap:null` → `mode:exit`（这是**正确**行为：没有上限就没有刹车）。于是按它的
  workflow 模板（`if MODE = exit; then exit 1`），这两个 workflow 会在自己的预算
  检查里直接死掉。**"给所有 workflow 接线"和"所有循环都有上限"是两件事，
  必须分别守住**——前者是接线，后者是配置。只做前者会把一个静默失效换成硬崩溃。

- **规则断言 vs 单文件断言**：原断言是 `/budget-check\.mjs/.test(merge-gate.yml)`——
  写在单个文件上，所以"另外 7 个没接线"永远测不出来。新断言遍历 `LOOP.md` 注册的
  每个循环，逐一核对预算行，并且**双向**：注册循环报 `exact`、非注册 id 报 `alias:`。
  只测一个方向不够——全报 `exact` 说明别名表死了，注册循环报 `alias` 说明它借的是别人的上限。
  这条断言当场抓到了 `signal-gatekeeper`：它注册为循环（`registry.yaml` 有
  `suggested_daily_cap: 30000`）却没有任何预算行。

- **静默回退是"配置存在却无人读取"的第二种形态**。上一轮修的是"没人读配置"；
  这一轮发现的是"读了，但读错了地方还不出声"：`parseBudgetCaps` 只按表名原样建索引，
  于是 `| Issue Intake |` 这行对 `--pattern issue-intake` 不可见，只能靠别名表兜底，
  而兜底是启发式的——`/issue/` 会命中**任何**含 `issue` 的 id。
  修法是让表名与循环 id 直接对上（slug 索引），别名表退回真正的兜底，
  并新增 `resolveCap` 返回 `source`，让"借来的上限"在输出里可见。

- **三份真相源**：`loop-budget.md`、`LOOP.md` 的"每日 token 上限"列、
  `registry.yaml` 的 `suggested_daily_cap`——三者值目前一致，但没有任何东西校验。
  `budget-check` 只读第一份。已记入 Watch List。

- **变异回退 3 次，全部确认落地后读结果**：删预算行 → 断言指名 `signal-gatekeeper`；
  去掉 slug 索引 → 断言报 `alias:ci sweeper`；让未知循环 fail-open →
  3 条断言同时红（含既有的"没有 per-loop 上限时退出"）。
  **我自己的第一条新断言写错了方向**（断言注册循环报 `alias`，而修复后正确行为是 `exact`），
  被测试当场抓住——这与既有模式一致：新写的断言默认要验证方向。

### 2026-10-14 · remediation spec 全量落地（WP-01 … WP-28）

- **本轮做了什么**：把 `REVIEW-2026-10-14-remediation-spec.md` 的 28 个工作包全部落地，
  修掉审查报告里的 31 项缺陷。断言 724 → 923。

- **三个 P0 都是同一类病**：文档写的命令与脚本实际接受的接口不一致。
  `--diff-files changed-files.txt`（少 `@`）让拒绝列表闸门静默失效；
  `--phase gate` 要求两个 sha 而 merge-gate 一个都没传（永远 escalate）；
  `event-router` 路由到 `close` 而 `gate-check` 的枚举里没有它（必然退出 1）。
  **共同的修法**：加一条通用断言——扫描所有文档里的 `node scripts/X.mjs --flag`，
  逐一核对 `X` 是否认识 `flag`。这一条覆盖了 WP-01/06/07/16 四类问题。

- **最重的一项不是 bug，是设计前提**：`--verdict approve` 此前不需要任何证据。
  实测无 verifier、sha 是假串时仍 `proceed`，而 `gate-check` 全文只读 3 个文件
  （其中 2 个是自己的源码与 diff 清单）。于是硬约束 1（独立验证者）与约束 7
  （绑定审过的 commit）**都由被约束的一方自证**。WP-08 加了 `--evidence-file`，
  格式复用 `loop-verifier` 既有的输出——那份格式早就是现成的接口，只是没人读它。

- **两个"配置存在却无人读取"的实例**（约束 11 的同一类）：
  `registry.yaml` 的 `stages:` 块写着 `mechanical_checks: 10` 而阶段 1 判据早已是 8 项，
  没有任何消费者；`docs/10` 写"7 个顶层 .mjs"而实际是 8。**都在本轮加了断言后当场变红**
  （WP-21 加消费者、WP-13 加脚本数比对），说明这类漂移只要没人读就会持续发生。

- **归一化的双向失效**：`normalizeError` 的 `\b\d+\b → <n>` 把退出码、HTTP 状态码、
  断言期望值全抹平了，于是"500 服务端错误"→"404 路由缺失"→"超时"三种根因完全不同的
  失败会在第 3 次被判 `stagnation`。修法是只归一化"明确是位置或时长"的数字（WP-17）。
  **断言必须双向**：既验"该合并的合并"（行号差异仍算同一签名），也验"不该合并的不合并"。

- **变异回退发现了两条无牙齿的断言**（本轮共 10 次变异，2 次暴露问题）：
  1. `close` 阶段的两条行为断言用 `checkGates()`（库函数），而 `PHASES` 只在 `main()`
     里校验——变异删掉 `'close'` 后仍然全绿。改为走 CLI 子进程后当场变红。
  2. `rejectUnknownFlags` 的第一次变异**没有落地**（多行正则没匹配上），
     我却据此以为"验证过了"。这与 2026-10-14 第三批记的教训是同一个：
     **变异之后必须确认变异真的落地（看一眼那行代码），再读测试结果。**

- **一个自己引入的 bug 被断言当场抓住**：`--pause=false` 传进来是字符串 `"false"`，
  而 `Boolean("false") === true`——"显式传假"反而打开了紧急刹车。
  修法是加 `boolArg`。这条如果没写断言，会在真实运行里表现为"暂停开关自己打开"。

- **两处审查结论被本轮证伪/修正**：
  1. `skills/.mimosa/` 并未被 git 跟踪（HL-27）——`.gitignore` 的 `.mimosa/` 已覆盖它，
     之前看到的只是磁盘上的文件。**静态判断不能替代 `git check-ignore`。**
  2. `session-handoff.md` 不该删（spec 原建议是删）——它是阶段 2 的产出之一，
     被 4 篇文档引用，删除会改动"5 个 loop 机制文档"这个在多处写死的数量。
     真正的问题是**本仓库那份没填**，改为填写 + 加"模板必须仍带占位符"的双向断言。

- **必须产出的具体调整**：本轮新增 6 类断言（通用 flag 一致性、事件 phase 双向比对、
  registry 判据数比对、脚本数比对、文档断言数比对、handoff 无占位符）。
  加上既有的四类（判据 2 双向断言、判据 5 真跑、子系统入口数、frontmatter↔清单一致），
  共十类。**结论：这个仓库的漂移是"没人读就会发生"，所以每新增一个写进文档的数字，
  都要配一条读它的断言——本轮 6 条里有 3 条第一次跑就抓到了真实漂移。**

- **本轮最后发现的一个真问题（不是本轮引入的）**：`loop-audit.mjs` 的活动检测
  一直把"手工开发记录"当成"循环活动"。它数 `loop-run-log.md` 里**任何**含 `run_id`
  的 JSON，于是 6 条 `manual.*` 记录让审计认为"循环在跑"；同时 `Last run` 的判定
  接受"2026-10-14 (stage-boundary rework)"这类**开发会话标签**（带日期就认），
  而 Active 表的判定扫描**整个 STATE.md 的表格行**，把 Post-Run Critique 里的
  数据表（"输入 | 修前 | 修后"）算成 25 个"活跃 work item"。

  三条加起来的效果：**一个从未跑过任何事件驱动循环的仓库拿到 activity 分**，
  而 `STATE.md:28` 自己写着"尚未跑过任何一轮真实事件"。这与硬约束 11 是同一类病
  ——只不过这次的"装饰品"是审计自己。

  修法是三处收窄：`manual` 记录只进 notes 不算证据；会话标签不算 Last run；
  Active 表只在 `## Active` 章节内统计。**修完审计从 98/L3 变成 94/L2**，
  理由行写着 "no real loop activity recorded yet. Structural readiness is not
  the same as having run."

  **这个分数下降是本轮唯一正确的"退步"**：它把一直虚高的就绪度还原成真实状态。
  不要为了让它回到 L3 而放宽这三处判定——那正是这条检查要防的事。

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