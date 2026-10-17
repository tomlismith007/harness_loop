# 机制与流程全景图（2026-10-17）

> 目的：把仓库里"有哪些机制、从哪进入、谁读谁、哪些只是文档"一次说清。
> 全部结论均在本机实跑核对过；未跑的项目显式标 **NOT RUN**。
> 基线：`node scripts/test.mjs` → **Passed 1042 / Failed 0**（本轮实跑）。

---

## 一、三层结构（先记住这张图）

```
        ┌─────────────────────────────────────────────┐
        │  脊柱：issue / PR 事件                        │
        │  LOOP.md（人读） ⇄ event-router.mjs（机读）    │
        └───────────────┬─────────────────────────────┘
                        │ 16 个事件 → phase → skills → gates
        ┌───────────────▼─────────────────────────────┐
        │  运行层：loop 六原语 + harness-loop 8 步       │
        │  budget / constraints / route / lock /        │
        │  dispatch / gate / ledger / state             │
        └───────────────┬─────────────────────────────┘
                        │
        ┌───────────────▼─────────────────────────────┐
        │  地基：harness 五子系统 + 三阶段建设            │
        │  harness-stage.mjs 机械判定 8 / 6+3 / 7+1     │
        └─────────────────────────────────────────────┘
```

一句话：**事件进 → 路由出阶段 → 技能干活 → 脚本判闸门 → 状态落盘**。
三个建设阶段只是"把这条链路逐层装起来"，不是三种用法。

---

## 二、入口：`/` 命令到底有哪些

### 2.1 技能（17 个，`skills/*/SKILL.md`）

| 类别 | 技能 | frontmatter `stage` | 谁调用 |
|---|---|---|---|
| **阶段主技能（人会敲的 `/`）** | `harness-init` | 1 | 人 |
| | `harness-loop-init` | 2 | 人 |
| | `harness-consolidate` | 3 | 人 |
| **运行时编排** | `harness-loop` | `runtime` | 事件 / 人 |
| 控制 | `loop-constraints`、`loop-budget`、`loop-guard`、`signal-gatekeeper` | 1/1/2/3 | 被编排调用 |
| 感知 | `event-router`、`issue-triage`、`pr-review-triage`、`ci-triage` | 1 | 被编排调用 |
| 执行 | `minimal-fix`、`post-merge-cleanup`、`release-drafter` | 2/3/3 | 被编排调用 |
| 验证 | `loop-verifier` | 2 | 被编排调用 |
| 学习 | `lesson-harvest` | 3 | 定时 |

**只有前三个是给人敲的入口**，其余由 `harness-loop` 按 phase 派发（`README.md:223`）。

### 2.2 技能"装在哪"——本机现状（重要）

`install-skills.mjs` 只支持两种布局（`scripts/install-skills.mjs:34-38`）：

```
agents → .agents/skills/      （默认）
zcode  → .zcode/skills/
```

而 `SKILL_DIRS`（`scripts/lib/common.mjs:84-88`）里还有 `.claude/skills`、`.codex/skills` 等。
**安装工具装不到 Claude Code 会扫描的路径。**

本机实测：

| 位置 | 内容 | 结论 |
|---|---|---|
| `~/.zcode/skills/` | 18 个目录，其中 `harness-bootstrap`、`harness-strengthen` 已不存在于仓库；**缺 `harness-loop-init`**；16 个现存技能全部与仓库版本不同 | **陈旧安装** |
| `~/.agents/skills/` | 无 loop-harness 技能 | 未装 |
| `~/.claude/skills/` | 无 loop-harness 技能 | **Claude Code 看不到** |

所以：**在 Claude Code 里现在敲 `/harness-init` 不会触发本仓库的技能。**
要用，需要手工装到 `~/.claude/skills/` 或项目 `.claude/skills/`（工具暂不支持该布局），
或改用 ZCode 并把 `~/.zcode/skills` 重新同步。

### 2.3 命令 vs 脚本

| 类型 | 形态 | 特点 |
|---|---|---|
| 技能 | `/harness-init` 或自然语言 | 给 agent 的流程指令，有判断 |
| 脚本 | `node scripts/xxx.mjs` | 确定性、有退出码，可进 CI |

---

## 三、脚本（11 个顶层 + 1 个共享库）

| 脚本 | 作用 | 退出码 | 被谁调用 |
|---|---|---|---|
| `harness-stage.mjs` | 三阶段检测 / `--upgrade` 装配 / `--require` 校验 | 0 / 2 | 人、`init.sh`、CI、技能 |
| `loop-audit.mjs` | 就绪度评分 0–100 + L0–L3 | 0 / 2 | 人、`init.sh`、CI、harness-stage |
| `event-router.mjs` | 事件 → phase/skills/gates/锁 | 0 已注册 / 1 未注册 | 5 个 workflow、技能 |
| `gate-check.mjs` | 11 类闸门判定 | 0 proceed / 1 参数错 / 2 escalate / 3 exit | `merge-gate.yml`、人 |
| `ledger-check.mjs` | 熔断（stagnation / no-progress / 预算 / 迭代） | 0 继续 / 2 停 | `ci-sweeper.yml`、人 |
| `budget-check.mjs` | 预算百分比 + kill switch | 0 normal/report-only / 3 exit | **8 个 workflow 全部** |
| `queue-read.mjs` | 读待办（`.loop/queue/` → 回落 `STATE.md`） | 0 / 1 | 技能；**无 workflow 调用** |
| `worktree.mjs` | create / discard / list 隔离工作区 | 0 / 1 | **无任何调用方**（只有文档提） |
| `install-skills.mjs` | 安装 / `--list` / `--check` / `--uninstall` | 0 / 1 | 人 |
| `init-loop-harness.mjs` | 旧装配器（按 L1/L2/L3 写文件） | 0 / 1 | 人；**不复制运行层脚本** |
| `test.mjs` | 自检 1042 条断言 | 0 / 1 | `init.sh`、pre-commit、CI |
| `lib/common.mjs` | 解析、拒绝列表、registry、tree-kill 等 | — | 全部脚本 |

**装配时复制进消费者仓库的运行层脚本**只有 7 个（`harness-stage.mjs:698`）：
`event-router / gate-check / ledger-check / loop-audit / budget-check / queue-read / worktree`
+ `lib/common.mjs`。`test.mjs` 与三个装配工具不复制（依赖 pack 内的 templates/skills）。

---

## 四、事件脊：16 个事件

`scripts/event-router.mjs` 的 `ROUTES` 与 `LOOP.md` 的路由表由测试双向核对。

| 事件 | phase | 技能 | 等级 |
|---|---|---|---|
| `issues.opened` / `.reopened` / `.labeled` | intake | `issue-triage` | L1 |
| `issues.closed` | close | `post-merge-cleanup` | L1 |
| `pull_request.opened` / `.synchronize` | review | `pr-review-triage` | L1 |
| `pull_request_review.changes_requested` | fix | `minimal-fix` → `loop-verifier` | L2 |
| `pull_request_review.approved` / `pull_request.ready_for_review` | gate | `gate-check.mjs` | L2 |
| `check_suite.completed:failure` / `workflow_run.completed:failure` | fix | `ci-triage` → `minimal-fix` | L2 |
| `check_suite.completed:success` | verify | — | L1 |
| `pull_request.closed:merged` | post-merge | `post-merge-cleanup` | L1 |
| `pull_request.closed:unmerged` | close | `post-merge-cleanup` | L1 |
| `push:tags` | release | `release-drafter` | L1 |
| `release.published` | close | — | L1 |

**路由结果字段**：`phase / skills / level / gates / next / conflict / held_by`。
锁键是 `--target`（分支名或 PR 号），与 `STATE.md` Active 表的 `acting_on` 逐字比较；
`--item` 只用于"同一条目不算冲突"。（本轮实测：Active 表写入 `acting_on=pr-1` 后，
另一 item 以 `--target pr-1` 路由 → `conflict: lock-held, held_by: pr-1`，锁生效。）

---

## 五、`harness-loop` 的 8 步（运行时的真实顺序）

| 步 | 动作 | 代码入口 | 不满足时 |
|---|---|---|---|
| 0 | 暂停 + 预算 | `budget-check.mjs --pattern <id>` | exit 3 / report-only |
| 0 | 事件接线检查 | `hasEventWiring()` | `outcome: no-wiring`，退出 |
| 0 | 有无待办 | `queue-read.mjs --json` | `outcome: no-op`，<5k token 退出 |
| 1 | 加载约束 | 读 `loop-constraints.md` | 无回退即用默认最小集 |
| 2 | 路由 | `event-router.mjs --event --item --target` | 未注册事件 → 记 Watch List |
| 3 | 冲突锁 | 读 `STATE.md` Active 的 `acting_on` | `lock-held` → no-op |
| 4 | 预算分级 | 同第 0 步结果 | ≥80% report-only |
| 5 | 派发技能 | 外部 agent 平台 | **本包不含运行器** |
| 6 | 闸门 | `gate-check.mjs` | escalate / exit |
| 7 | 熔断 | `ledger-check.mjs` | exit 2 → 升级 |
| 8 | 写状态 | `STATE.md` / `feature_list.json` / `loop-run-log.md` | 不写 = 没跑 |

停止状态机：`no-wiring | no-op | report-only | fix-proposed | verified | escalated`。

---

## 六、闸门（`gate-check.mjs`，按优先级先命中者决定）

| # | 闸门 | 触发条件 | 决策 |
|---|---|---|---|
| 1 | `pause` | `--pause` | exit 3 |
| 2 | `budget` | `--budget-pct ≥ 100` | exit 3 |
| 3 | `denylist` | `--diff-files` 命中拒绝列表 | escalate |
| 4 | `max-attempts` | `--attempts ≥ 3`（registry 可覆盖） | escalate |
| 5 | `budget` | `≥ 80` | report-only |
| 6 | `scope` | 文件数 > 5（cleanup 为 10） | escalate |
| 7 | `head-commit` | `--reviewed-sha ≠ --head-sha` 或缺失 | escalate |
| 8 | `red-check` | `not-run` / `fail` | escalate |
| 8b | `verification-evidence` | `approve` 但无 `--evidence-file`，或证据自相矛盾 | escalate |
| 9 | `verification` | `reject` / `escalate-human` | escalate |
| 9b | `awaiting-verification` | `verdict none` + gate 阶段 | escalate（"没验"≠"验失败"） |

阈值来源：`patterns/registry.yaml` 的 `defaults:` → `readRegistryDefaults()`（改数字会真的改行为）。

---

## 七、状态文件：哪个是哪个的真相源

| 文件 | 内容 | 写入者 | 读取者 |
|---|---|---|---|
| `STATE.md` | 人类收件箱、Active 表、Watch List | 每轮循环 | `event-router`（锁）、`queue-read`、`loop-audit` |
| `LOOP.md` | 路由表、循环注册、调度、优先级 | 人 | 测试与 `event-router` 双向核对 |
| `loop-constraints.md` | 拒绝列表（代码块）、合并/预算规则 | 人 / 夜审转正 | `gate-check`（解析代码块）、`budget-check`（kill switch） |
| `loop-budget.md` | 每个循环的 token 上限 | 人 | **`budget-check` 唯一读取的预算源** |
| `loop-run-log.md` | 每轮一条 JSON | 循环 | `budget-check` 累加当日花费 |
| `loop-ledger.json` | 每次尝试 + 错误签名 | 执行循环 | `ledger-check` |
| `feature_list.json` | 功能项 + 证据 | 人 / 循环 | `harness-stage` 判据 2 |
| `LESSONS.md` | 教训 + `Seen N×` | `lesson-harvest` | 人；转正进 constraints |
| `patterns/registry.yaml` | 机器可读循环定义 + 默认阈值 | 人 | `gate-check` / `ledger-check` 读 `defaults:` |

**已知的多真相源**（同一件事写在多处，无一致性校验）：
- 每日上限：`loop-budget.md`（唯一被读）、`LOOP.md` 表格列、`registry.yaml` 的 `suggested_daily_cap`。
- 阶段名：`LOOP.md`/代码叫「2 强化」，`AGENTS.md`/`README.md`/registry 叫「2 装配 loop 机制」。
- 文件数阈值：constraints 写 5，`LOOP.md` 写 10（已记在 `STATE.md`）。

---

## 八、三阶段建设：机械判据

| 阶段 | 判据 | 代码 | 产物 |
|---|---|---|---|
| 1 初始化 | **8 项全机械** | `checkStage1` | 6 个模板 + 生成的 `init.sh` = **7 文件**；8 个技能目录（7 + `harness-loop`）；7 个运行层脚本 |
| 2 装配 loop 机制 | **6 机械 + 3 人工** | `checkStage2` | 4 个模板 + `loop-ledger.json`；4 个技能 |
| 3 巩固 | **7 机械 + 1 人工** | `checkStage3` | 5 个技能 + 8 个 workflow |

- 人工项：回退测试执行过 / NOT RUN 用过 / triage 准确率 > 70%；阶段 3 是"跑过完整周期"。
- `--upgrade` 有**跳级保护**：目标阶段的前一阶段未达成时拒绝写入（除非 `--force`）。
- `--require` 未达成退出 2，可直接当 CI 闸门。
- 本仓库自报：**Current stage 0，Readiness 94/100 · L2**；阶段 1 `6/8`（判据 2 与 5 未过）、阶段 2 `2/6`、阶段 3 `5/7`。

---

## 九、事件接线（8 个 workflow）

| 文件 | 触发 | 路由事件 | 锁 |
|---|---|---|---|
| `issue-intake.yml` | `issues: opened/reopened/labeled` | `issues.*` | ✅ |
| `pr-review.yml` | `pull_request`（含 closed）+ `pull_request_review` | PR 七种 | ✅ |
| `ci-sweeper.yml` | `workflow_run` + `check_suite`（仅 failure） | `*.completed:failure` | ✅ |
| `merge-gate.yml` | `pull_request: ready_for_review` | 直接调 `gate-check` | — |
| `post-merge.yml` | `pull_request: closed` + `merged == true` | `pull_request.closed:merged` | ✅ |
| `release-draft.yml` | `push: tags v*` + `release: published` | `push:tags` | 有意不传 |
| `daily-triage.yml` | `schedule 0 8 * * 1-5` | **不走路由** | — |
| `lesson-harvest.yml` | `schedule 0 3 * * *` | **不走路由** | — |

共同形态：`budget-check`（fail-closed）→ 事件映射 → `event-router` → 消费 `.conflict` → 写 `.loop/queue/<item>.json` → `upload-artifact`。
**workflow 不做 agent 逻辑**；未接运行器时循环止于 `fix-proposed`（合法结局）。

---

## 十、审计发现（按严重度排序，均实测）

### A. 单行清单漏 `@` 仍可绕过拒绝列表（高）

`gate-check.mjs:479-491` 的多行守卫只在**文件行数 > 1** 时报错。
一个**只有一行**的清单文件（这正是 `git diff --name-only` 在单文件 PR 上的输出）会被当成"单个路径"，拒绝列表不匹配：

```
$ node scripts/gate-check.mjs --item pr-1 --phase fix --diff-files /tmp/oneauth.txt
decision: proceed   files_changed: 1          # 文件内容: auth/login.ts

$ node scripts/gate-check.mjs ... --diff-files @/tmp/oneauth.txt
decision: escalate  gate: denylist            # 同一份清单，加了 @
```

代码注释明确写了"单行文件仍按单一路径处理"，**这是有意选择，但它让单文件 PR 的拒绝列表闸门失效**。
同理，`docs/03:175` 说"裸路径…拒绝列表闸门静默失效"，实际现在会报错（多行）或误判（单行）——描述与行为都不精确。

### B. 文档里的闸门示例现在跑不通（中）

| 位置 | 写法 | 实跑结果 |
|---|---|---|
| `README.md:147` | `--diff-files changed-files.txt` | **exit 1**："contains N paths. Prefix it with @" |
| `docs/12-stage-commands.md:171-178` | gate 阶段 + `approve`，无 `--evidence-file` | **escalate**：`verification-evidence` |
| `docs/12:344`、`:371` | 同样缺证据文件 / 缺 sha | 必 escalate |

`init.sh` 的冒烟测试只测脚本自身的分支，**不执行文档里的示例**，所以这条漂移测试套件看不见。

### C. `queue-read` 的回落把散文当待办（中）

`queue-read.mjs:87-95` 在 `.loop/queue/` 不存在时回落 `STATE.md` High Priority。
本仓库实测返回 **9 条**，其中多数是说明性段落（"预算百分比恒为 0（已知限制）"），不是可执行的 work item。
同时 workflow 的队列产物走 **artifact**，不会出现在仓库工作区，所以 `queue-read` 永远读不到它。
→ **`.loop/queue/` 这条契约目前在生产路径上没有任何消费者**（除非有人手工下载 artifact）。

### D. `init-loop-harness.mjs` 与文档承诺不一致（中）

- 它**不复制** 7 个运行层脚本，但 `README.md:160` 推荐"想直接装配到 L2/L3 用 `init-loop-harness --level L2`"，
  `docs/10:217` 称其"等价于 `harness-stage --upgrade --stage 1`"。
- 用它装配出的项目里，所有 `node scripts/xxx.mjs` 都是 `ERR_MODULE_NOT_FOUND`。
- 它自带的技能清单（`init-loop-harness.mjs:162-167`）也与 `harness-stage` 的 `STAGE*_SKILLS` 各自维护，已有一处不同（stage1 少了 `harness-init`，多了 `harness-loop`）。

### E. registry 里有 7 个"装饰性配置"（中，违反硬约束 11）

`patterns/registry.yaml:240-263` 的 `defaults:` 中，**只有 5 个键**被 `readRegistryDefaults()` 读取
（`common.mjs:538-547`）：`max_attempts / max_files_per_fix / max_files_per_cleanup / budget_*_pct / breaker.*`。

以下 **无任何代码读取**（grep 全仓库确认）：
`auto_merge`、`merge_binding`、`red_check_required`、`not_run_must_be_listed`、
`lesson_promotion_threshold`、`stage2_requires_triage_accuracy`、`ablation_interval`。
`priority:` 段同样无消费者（测试只断言"这一段存在"）。

### F. 技能安装路径与 Claude Code 不兼容（中，对当前用户最实际）

见 §2.2。`install-skills` 无法装到 `.claude/skills` / `~/.claude/skills`，
而 `SKILL_DIRS` 又把 `.claude/skills` 算作"可发现路径"——**判据与安装器不一致**。
本机 `~/.zcode/skills` 是陈旧副本（缺 `harness-loop-init`，含两个已删除技能）。

### G. 本仓库自身的阶段判据误报（低）

- `feature_list.json:34` 的 notes 写"**非占位符**"，`harness-stage.mjs:319` 用 `/占位|placeholder/` 子串匹配 → 判据 2 FAIL。
  一个"我不是占位符"的说明反而触发了占位符判定。→ 否定语境没有被处理。
- `feature_list.json:37` 与 `:168` 两个 feature 共用 `id: stage-001`（已记在 `STATE.md`）。
- 阶段报告头部写 "Current stage: 0（尚无 harness）"，而同一份报告显示 94 分 / L2 / 阶段 1 6/8——措辞误导。

### H. 文档数字漂移（低，但已有守门测试却没抓住）

| 位置 | 写的 | 实际 |
|---|---|---|
| `docs/12:70` | 阶段 1 生成 **9 个**技能目录 | **8 个**（7 + `harness-loop`） |
| `docs/12:127` | 阶段 1 应为 `[COMPLETE] 10/10` | 8 项判据 |
| `docs/10:222` | `test.mjs` 自检（**724** 断言） | 1042 |
| `README.md:191` | docs **13 篇** | 13 ✅ |

`test.mjs:3356-3359` 的断言数守门只匹配 `\d{3,4}\s*项断言`，而 `docs/10:222` 写的是"724 断言"（无"项"），
**因此这条漂移永远不会被抓住**——与仓库自己反复记录的"断言范围比被守护对象大/小"同源。

### I. 事件覆盖缺口（低）

- `pull_request_review.approved` 被 `pr-review.yml` 订阅并路由（`on: pull_request_review: submitted`），
  但**合并闸门 `merge-gate.yml` 只在 `ready_for_review` 触发**——"审查通过"这一刻不会自动跑闸门，
  除非 PR 同时被标记 ready（已 ready 的 PR 收到 approve 时不会触发）。
- `pr-review.yml` 订阅 `closed` 并写队列，`post-merge.yml` 也在 `closed + merged` 写队列——同一 PR 会被两个循环各写一份 item（文件名相同，但分属两个 artifact）。
- `daily-triage` 有预算行、有 workflow，但**不在 `LOOP.md` 注册表、不在 `registry.yaml`、没有路由**，绕过事件脊。
- `loop-constraints.md` 的加载确认行要求输出 "N rules active"，但**没有任何脚本计算 N**（实测 35 条 bullet）。N 由 agent 自己数。

### J. 未被任何调用方使用的机制（低）

- `worktree.mjs`：只有文档提到，无 workflow / 技能 / 脚本调用。隔离要求仍靠 agent 自觉。
- `queue-read.mjs`：无 workflow 调用（见 C）。
- `suggested_daily_cap`：三份预算真相源之一，无消费者。

---

## 十一、NOT RUN（显式列出，不省略）

- **8 个 workflow 从未在任何真实 GitHub 仓库上跑过**（`STATE.md` 已记，硬约束 10）。
- Linux/GNU-timeout 路径未在真 Linux 上验证（本机是 MSYS 的 `timeout`）。
- 技能在 ZCode / Claude Code 中的实际触发行为未验证（本机安装是陈旧副本）。
- `harness-stage --upgrade` 对真实混合栈仓库的写入结果未验证（只在临时目录跑过）。

---

## 十二、如果只记三件事

1. **入口只有 3 个 `/` 命令**（`harness-init` → `harness-loop-init` → `harness-consolidate`），
   其余 14 个技能是给 `harness-loop` 调度的，不是给人敲的。
2. **真正会改变行为的代码入口只有 7 个脚本**：stage / audit / router / gate / ledger / budget / queue。
   文档里其他"机制"若没有这 7 个之一读它，就是装饰品。
3. **这个仓库的反复失效模式是"声明与执行脱节"**，而本轮找到的 A/B/C/E/F/H 全是同一类。
   修法不是再加文档，而是让每个数字/路径都有一个会因它改变而变红的断言。
