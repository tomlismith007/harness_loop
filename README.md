# Loop Harness

**围绕 issue/PR 事件运转的编码智能体工程框架。** 把 harness engineering（让单次运行可靠）与 loop engineering（让连续运行自主）缝成一套可复制、可审计、可暂停的系统，并让 issue 与 PR 成为全部工作的唯一事件来源。

> 你不再逐步写提示词。你设计一套系统：它监听仓库事件、发现工作、派发子智能体、独立验证、并把需要你判断的事放进收件箱。

---

## 这个仓库解决什么问题

单次会话已经能写代码了。真正的瓶颈转移到了三件事上：

1. **可靠性**：同一个模型，harness 不同，成功率能从 20% 到接近 100%——差别不在权重，在模型之外的一切（指令、工具、环境、状态、反馈）。
2. **持续性**：会话结束即失忆。没有仓库内的持久状态，每一轮都要重新推导项目是什么、做到哪了。
3. **自主性**：没人按"开始"键。事件在仓库里持续发生（issue 开了、CI 红了、PR 被要求改、main 合了），但没人把它们变成动作。

Loop Harness 把这三件事收敛到一条脊上：**事件 → 阶段 → 技能 → 闸门 → 状态**。

---

## 核心模型

### 地基：harness 五子系统（每次运行都要可靠）

| 子系统 | 最小工件 | 职责 |
|---|---|---|
| Instructions | `AGENTS.md` | 启动路径、工作规则、完成定义 |
| Tools | 权限与连接器范围 | 最小权限、审计留痕 |
| Environment | `init.sh` | 可复现的启动与验证路径 |
| State | `feature_list.json`、`STATE.md` | 当前工作、证据、下一步 |
| Feedback | 验证命令、`loop-verifier` | 机器可判定"做完了" |

缺任何一个，agent 用起来都会别扭。

### 运行层：loop 六原语（让运行连续）

1. **Automations** — 心跳。没有调度，循环只是你手动跑的一次性运行。
2. **Worktrees** — 隔离。每个改动尝试一个独立 git worktree，物理上不可能互相踩。
3. **Skills** — 意图。把约定、构建命令、"我们为什么不那样做"一次写清，每轮读取。
4. **Connectors** — 触达。MCP 让循环能读 issue、开 PR、更新工单。
5. **Sub-agents** — 执行者/检查者分离。写代码的人不能给自己打分。
6. **External State** — 跨轮记忆。模型会忘，仓库不会。

### 脊柱：issue/PR 事件

所有循环都挂在同一条事件脊上，而不是各自轮询各自的信号：

```
issue.opened ──▶ intake ──▶ triaged ──┐
                                      ▼
PR.opened ──▶ review ──▶ changes-requested ──▶ fix ──▶ verify ──▶ approved
                                      ▲                             │
CI.failure ──▶ classify ──────────────┘                             ▼
                                                                  merge gate
                                                                     │
PR.merged ──▶ post-merge ──▶ cleanup/debt ──▶ release draft ──▶ publish
```

一次事件产生一个 **work item**，work item 有明确的状态机、证据链与升级路径。详见 [docs/01-event-spine.md](docs/01-event-spine.md)。

---

## 三阶段建设（主线）

一个项目接入 loop-harness 分三步走。每阶段有**明确的判据**——不是"做得更好"，而是"这几项检查全过才算完成"。

```bash
node scripts/harness-stage.mjs /path/to/repo          # 我现在在哪一阶段？
node scripts/harness-stage.mjs /path/to/repo --upgrade # 补齐下一阶段缺失的产物
```

装配会把**运行层脚本**（`event-router.mjs`、`gate-check.mjs`、`ledger-check.mjs`、`loop-audit.mjs`
+ `lib/common.mjs`）一起复制进目标仓库的 `scripts/`。技能命令与事件接线都写
`node scripts/xxx.mjs` 并隐含 cwd = 项目根，所以这一步不是可选的——少了它，新项目里每条命令
都是 `ERR_MODULE_NOT_FOUND`，而阶段 3 的接线判据仍会发 PASS。

`test.mjs`（源仓库自检套件）与三个装配工具不复制：它们依赖 pack 内的 `templates/` 与 `skills/`，
在消费者仓库里跑不起来。装配动作本身仍由 pack 仓库里的 `harness-stage.mjs` 执行。

| 阶段 | 目标 | 判据 | 等级 | 技能 |
|---|---|---|---|---|
| **1 初始化** | 创建 7 个文件（**不含 loop 机制文档**），让结构完整、下一会话可重启 | 8 项（全机械） | L1 | `harness-init` |
| **2 装配 loop 机制** | 装配阶段 1 不产出的 5 个 loop 文档，让**验证真的有效、约束真的被强制执行** | 6 机械 + 3 人工 | L2 | `harness-loop-init` |
| **3 巩固** | 事件接上、循环跑起来、**经验自己积累并转正为规则** | 7 机械 + 1 人工 | L3 | `harness-consolidate` |

**关键区别**：

- 阶段 1 是**结构完整**——文件都在，但可能只是占位
- 阶段 2 是**机制有效**——验证真的能失败、约束真的被加载、熔断真的会触发
- 阶段 3 是**系统自转**——事件自动触发、教训自动积累、规则自动转正

**不要跳级。** 每阶段的目的是让下一层的效果可观测、可归因。跳级的后果：无法判断哪一层出问题、跳过 triage 校准（误报高时自动修复在错误目标上烧钱）、无法量化每层贡献。

完整判据、依据映射与常见错误见 [docs/11-three-stages.md](docs/11-three-stages.md)。

---

## 快速开始

### 第 0 步：安装技能（必须先做）

技能放在本仓库的 `skills/` 下，但 agent **不会扫描这个路径**。可用的安装位置有两类：

```
.agents/skills/   跨 agent 的共享约定（ZCode 读，别的 agent 也读）
.zcode/skills/    ZCode 专属
```

**默认布局就是 `agents`**（跨 agent 共享），ZCode 专属路径用 `--layout zcode`：

```bash
# 用户级：所有项目都能用
node scripts/install-skills.mjs --scope user --layout agents

# 工作区级：只在某个项目生效（推荐跨 agent 场景）
node scripts/install-skills.mjs --target /path/to/repo --layout agents

# 两边都装
node scripts/install-skills.mjs --target /path/to/repo --layout both

# 查看 / 卸载
node scripts/install-skills.mjs --target /path/to/repo --layout agents --list
node scripts/install-skills.mjs --target /path/to/repo --layout agents --uninstall
```

装完**重启会话**（或重新加载），然后 `/harness-loop` 应该能调用。改动技能后重跑一次安装即可推送更新。

> 用户级优先于工作区级。同名技能若在用户级也存在，工作区那份会被遮蔽。

### 第 1–5 步：使用

```bash
# 1. 看当前在哪一阶段 + 差距（只读）
node scripts/harness-stage.mjs /path/to/repo

# 2. 按阶段装配（阶段 1 初始化）
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 1

# 3. 审计就绪度（只读，给出改进清单）
node scripts/loop-audit.mjs /path/to/repo --suggest

# 4. 让路由告诉你这条事件该做什么
node scripts/event-router.mjs --event pull_request_review.changes_requested --item pr-123

# 5. 合并前的闸门判定（--diff-files 接受逗号列表，或每行一个路径的文件）
node scripts/gate-check.mjs --item pr-123 --phase gate --attempts 1 \
  --diff-files changed-files.txt --verdict approve --budget-pct 45

# 6. 重试前的熔断检查（退出码 2 = 停止并升级给人）
node scripts/ledger-check.mjs --ledger loop-ledger.json
```

**第一周只做 L1：只报告，不自动改代码、不自动合并。** 见 [docs/07-adoption-ladder.md](docs/07-adoption-ladder.md)。

## 五种用法

| 用法 | 怎么做 | 适合 |
|---|---|---|
| **① 单次审计** | `node scripts/loop-audit.mjs . --suggest` | 想知道现有仓库离"agent 可靠工作"还差什么 |
| **② 装配新项目** | `node scripts/harness-stage.mjs . --upgrade --stage 1` | 从零建立阶段 1 地基（7 个文件）。想直接装配到 L2/L3 用 `init-loop-harness.mjs --level L2`，但它没有闸门 |
| **③ 技能对话式调用** | 装完技能后说"帮我把这个 PR 验证一下" | 人在场，让 agent 按框架的规则干活 |
| **④ 事件驱动自动化** | 接 `examples/github-actions/` 的 workflow | 想让 issue/PR/CI 事件自动触发循环 |
| **⑤ 定时循环** | 夜审 `lesson-harvest.yml` + 每日 triage | 想让系统自己积累经验、自己发现问题 |

**③ 是最容易上手的**——不需要接 CI，只要装了技能，agent 就会按框架的约束干活（加载约束、独立验证、拒绝列表、NOT RUN 声明）。

## 自检

框架自带测试套件，覆盖闸门判定、熔断逻辑、拒绝列表匹配、事件路由、模板与技能完整性、端到端装配：

```bash
node scripts/test.mjs           # 923 项断言
node scripts/test.mjs --verbose # 显示每一项
```

CI 在每次 push 时运行测试套件、自审计、CLI 入口检查，以及两条安全断言（事件接线不得包含自动合并；源码与示例中不得出现凭据字面量）。见 `.github/workflows/self-check.yml`。

---

## 目录结构

```
.
├── AGENTS.md                  # harness 入口（路由器，不是百科）
├── LOOP.md                    # 循环注册表 + 事件路由表 + 调度
├── STATE.md                   # 活状态：人类收件箱 + 当前活动
├── LESSONS.md                 # 错题本：夜审循环写入，经验→规则棘轮的载体
├── loop-constraints.md        # 机器可读约束（拒绝列表/闸门/预算），每轮必读
├── loop-budget.md             # 每日 token/运行/子智能体上限
├── loop-run-log.md            # 只追加运行日志（可观测性）
├── docs/                      # 方法论 + 三阶段路线（13 篇）
├── skills/                    # 17 个技能：三阶段 + 运行时 / 控制 / 感知 / 执行 / 验证 / 学习
├── templates/                 # 可直接复制进项目的模板
├── scripts/                   # 可执行工具（零依赖 Node）
├── patterns/registry.yaml     # 机器可读的循环注册表 + 三阶段定义
└── examples/github-actions/   # 事件接线：把 GitHub 事件变成循环触发
```

---

## 技能地图

| 面 | 技能 | 职责 |
|---|---|---|
| **阶段** | `harness-init` | **阶段 1 初始化**：创建 7 个文件，8 项判据（**不产出 loop 文档**） |
| **阶段** | `harness-loop-init` | **阶段 2 装配 loop 机制**：补上 5 个 loop 文档，让验证真的有效、约束真的被强制执行 |
| **阶段** | `harness-consolidate` | **阶段 3 巩固**：事件接上、经验积累、规则转正 |
| 控制 | `loop-constraints` | 每轮开始加载约束，拒绝列表与闸门是绑定的 |
| 控制 | `loop-budget` | 开始/结束检查花费；80% 降级为只报告，100% 立即退出 |
| 控制 | `loop-guard` | 熔断器：账本 + 停滞检测，退出码 2 = 交给人类 |
| 控制 | `signal-gatekeeper` | 成本分层门卫：廉价模型先判断相关性，不相关直接丢弃，不转发 |
| 感知 | `event-router` | 事件 → 阶段 → 技能 → 闸门 |
| 感知 | `issue-triage` | 去重、定级、提议标签（L1 不自动应用） |
| 感知 | `pr-review-triage` | 每个 PR 的 CI/审查/阻塞项汇总 |
| 感知 | `ci-triage` | 失败分类：flake / regression / env / config |
| 执行 | `minimal-fix` | 最小 diff 修复单一明确问题 |
| 执行 | `release-drafter` | 从已合并 PR 起草发布说明 |
| 执行 | `post-merge-cleanup` | 合并后扫描技术债与文档缺口 |
| 验证 | `loop-verifier` | 独立检查者，默认立场 REJECT；含回退测试与 NOT RUN 声明 |
| 学习 | `lesson-harvest` | **夜审循环**：扫当天 commit 的教训写进 LESSONS.md，3 次出现转正为硬规则 |
| 编排 | `harness-loop` | 顶层：把事件脊跑起来的完整编排（**运行时**，不属于任何建设阶段） |

> **三个 `/` 命令就是三个建设阶段**：`/harness-init`（阶段 1）、`/harness-loop-init`（阶段 2）、
> `/harness-consolidate`（阶段 3）。其余技能由 agent 按上下文自动调用，不是人敲的入口。
>
> 技能安装永远是**全量**的（17 个都在菜单里）——边界不靠裁剪安装，而是靠每个技能
> frontmatter 的 `stage:` 字段和 description 里的前置阶段声明，让 agent 在被触发的
> 瞬间知道自己该不该用它。这两条都是**软约束**：agent 可能读了仍然越界。
> 唯一由代码强制的一条是 `harness-loop` 第 0 步的事件接线检查——没接线它自己退出。

---

## 六条不可协商的规则

1. **写代码的人不能验证自己的代码。** 执行者与检查者必须是不同的智能体、不同的指令，最好不同的模型。
2. **同一事项最多尝试 3 次。** 之后必须升级给人，而不是继续循环。升级是功能，不是失败。
3. **没有机器可判定的停止条件，就不算一个循环。** "看起来差不多"不是停止条件。
4. **合并必须绑定审查过的 commit。** `--match-head-commit <sha>`——审查后被 push 的代码进不来。策略靠自觉，这个靠 git 本身拒绝。
5. **新增测试必须通过回退测试。** 能在修复前的代码上真的挂掉，并指出是哪个行为错了。永远通过的测试是装饰品。
6. **未跑的检查必须显式列为 NOT RUN。** 省略会让读者以为它通过了。

---

## 经验 → 规则棘轮

这套框架里最不显眼、但可能是最重要的一环：

```
夜审发现返工  → 记进 LESSONS.md（Seen 1×）
再次出现      → Seen 2×
第三次出现    → 转正进 loop-constraints.md → 之后每个 PR 审查逐条对
```

**延迟提升**是关键：一条经验第一次出现时不够格成为规则（可能是一次性偶发），出现 3 次才说明它是系统性的。这避免了两种错误——过早立规矩（噪声变成制度），以及从不立规矩（经验永远停在笔记里没人执行）。

`Seen N×` 是升级判定的支点。没有它就无法机械判定何时该提升。

真实生产案例与完整分析见 [docs/09-case-magpie.md](docs/09-case-magpie.md)。

---

## 来源与致谢

本框架是对以下两条公开脉络的蒸馏与重新组合：

- **Harness Engineering** — [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)（五子系统、feature list 原语、终止校验、图工程），以及其引用的 OpenAI / Anthropic 实践。
- **Loop Engineering** — [LibraScorpion/loop-engineering-cn](https://github.com/LibraScorpion/loop-engineering-cn)（原项目 cobusgreyling/loop-engineering；六原语、模式库、熔断器、L0–L3 就绪度），以及 Addy Osmani 的概念命名。

Loop Harness 的增量在于**把两者焊在同一条 issue/PR 事件脊上**：harness 提供单次运行的可靠性，loop 提供连续运行的自主性，事件脊保证两者作用于同一批真实工作，而不是各自漂移。

MIT License.
