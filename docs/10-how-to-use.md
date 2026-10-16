# 10 · 怎么用：五种用法与技能对照

本文档回答三个问题：**现在做到什么程度、技能怎么装、每种用法具体怎么操作。**

---

## 一、当前状态

| 项 | 状态 |
|---|---|
| 技能 | 17 个，全部带 frontmatter（含 `stage:`）与触发描述 |
| 脚本 | 12 个（`scripts/` 下 11 个顶层 `.mjs` + `lib/common.mjs`），零依赖 Node |
| 文档 | 13 篇 |
| 模板 | 13 个 |
| 事件接线 | 8 个 GitHub Actions workflow |
| 测试 | 1042 项断言全通过 |
| 自审计 | 94/100，L2 |
| 技能已安装 | ✅ `~/.zcode/skills/` + `~/.agents/skills/` |

**为什么自审计是 L2 而不是 L3**：因为这套框架**自己还没跑过一个真实循环**。审计刻意区分"结构性就绪"和"真的跑过"——配置齐全不等于验证过。这是设计使然，不是缺陷。

---

## 二、技能怎么装（必须先做）

技能文件在本仓库的 `skills/` 下，但 agent **不会扫描这个路径**。可用的安装位置有两类：

```
.agents/skills/    跨 agent 的共享约定（ZCode 读，别的 agent 也读）
.zcode/skills/     ZCode 专属
```

两类都可以装在用户级（`~/`）或工作区级（`<repo>/`）。**默认布局就是 `agents`（跨 agent 共享）**，ZCode 专属路径用 `--layout zcode`：

```bash
# 用户级：所有项目都能用
node scripts/install-skills.mjs --scope user --layout agents

# 工作区级：只在某个项目生效
node scripts/install-skills.mjs --target /path/to/repo --layout agents

# 两边都装
node scripts/install-skills.mjs --target /path/to/repo --layout both

# 查看 / 卸载
node scripts/install-skills.mjs --target /path/to/repo --layout agents --list
node scripts/install-skills.mjs --target /path/to/repo --layout agents --uninstall
```

装完**重启会话**，然后：

- 自动触发：说"帮我验证这个 PR" → `loop-verifier` 被触发
- 手动调用：`/harness-loop`、`/loop-verifier` 等

**注意**：`skills/` 目录仍是唯一真相源。改完技能要重跑安装脚本推送更新，否则装的还是旧版。

**注意**：用户级优先于工作区级。同名技能若在用户级也存在，工作区那份会被发现但被遮蔽。

---

## 三、五种用法

### 用法 ⓪ 三阶段推进（主线，建议从这里开始）

**做什么**：按 **初始化 → 强化 → 巩固** 三步走，每步有明确判据。

```bash
# 我现在在哪一阶段？差什么？
node scripts/harness-stage.mjs /path/to/repo

# 补齐下一阶段缺失的产物
node scripts/harness-stage.mjs /path/to/repo --upgrade

# 补齐指定阶段
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 2

# CI 关卡：阶段 2 未达成则失败
node scripts/harness-stage.mjs /path/to/repo --stage 2 --require
```

| 阶段 | 目标 | 判据 | 等级 |
|---|---|---|---|
| 1 初始化 | 创建 7 个文件（不含 loop 机制文档） | 8 项（全机械） | L1 |
| 2 装配 loop 机制 | 补上 5 个 loop 文档，让验证真的有效、约束真的被强制执行 | 6 机械 + 3 人工 | L2 |
| 3 巩固 | 事件接上、经验积累、规则转正 | 7 机械 + 1 人工 | L3 |

**对应的技能**：`harness-init`、`harness-loop-init`、`harness-consolidate`。

完整判据与依据映射见 [docs/11-three-stages.md](11-three-stages.md)。

### 用法 ① 单次审计（最快见效，零风险）

**做什么**：检查一个仓库离"agent 能可靠工作"还差什么。

```bash
node scripts/loop-audit.mjs /path/to/repo --suggest
```

**输出**：0–100 分、L0–L3 等级、五子系统各自得分、每项检查的通过情况、改进建议。

**适合**：你已经在用 agent 写代码，但感觉不稳定——忘上下文、改错文件、声称完成但测试红着。审计会指出是 harness 的哪个子系统缺失。

**只读，不改任何文件。**

### 用法 ② 装配新项目

**做什么**：在目标仓库生成阶段 1 地基，或一次装配到指定等级。

```bash
# 阶段 1（推荐）：生成 7 个文件，有闸门可用
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 1
node scripts/harness-stage.mjs /path/to/repo --stage 1 --require   # 退出码 0 = 达成

# 一次装配到 L2/L3（无闸门，只报告写了什么）
node scripts/init-loop-harness.mjs --target /path/to/repo --level L2
```

**阶段 1 生成**：`AGENTS.md`、`feature_list.json`、`progress.md`、`init.sh`、`STATE.md`、`LESSONS.md`、`loop-constraints.md`。

**不生成**：`LOOP.md`、`loop-budget.md`、`loop-run-log.md`、`session-handoff.md`、`loop-ledger.json` —— 这 5 个是 loop 机制文档，属于阶段 2。阶段 1 的 agent 已经在写文件，所以它需要 `loop-constraints.md`（拒绝列表 = 行为底线），但不需要循环机制。

**`--level` 的差别**：

| 等级 | 生成什么 | 允许做什么 |
|---|---|---|
| L1 | 阶段 1 的 7 个文件 + `harness-loop`、`loop-constraints`、`loop-budget`、`event-router`、三个 triage | 只报告，不改代码 |
| L2 | 追加 5 个 loop 机制文档 + `harness-loop-init`、`loop-guard`、`minimal-fix`、`loop-verifier` | 在 worktree 中提出修复，独立验证；合并仍需人工 |
| L3 | 追加 `signal-gatekeeper`、`lesson-harvest`、`post-merge-cleanup`、`release-drafter` | 明确边界内无人值守 |

**默认从 L1 开始。** 第一周只看报告，确认 triage 准确后再升级。

`harness-loop`（运行时编排）任何等级都装——它的边界由自己第 0 步的事件接线检查执行，不靠"到阶段几才装"来实现。

### 用法 ③ 技能对话式调用（最容易上手）

**做什么**：不接任何 CI，人在场，让 agent 按框架的规则干活。

装完技能后直接说：

| 你说 | 触发的技能 | 它会做什么 |
|---|---|---|
| "帮我审这个 PR" / "验证这个修复" | `loop-verifier` | 实际跑测试、检查 scope、回退测试、列出 NOT RUN |
| "修一下这个 CI 失败" | `ci-triage` → `minimal-fix` | 先分类（flake/regression/env），只有 regression 才动手 |
| "这个 issue 值得修吗" | `issue-triage` | 定级、去重、提议标签，不自动应用 |
| "我现在该做什么" | `harness-loop` | 走完整流程：加载约束→查预算→路由→派发→闸门→写状态 |
| "给这个项目配一套 harness" | `harness-init` | 走完阶段 1 的 8 项判据，装配 7 个文件 |
| "总结一下昨天的 commit 有什么教训" | `lesson-harvest` | 扫返工/不该合/验证太糙，写进 LESSONS.md |
| "这条推文跟我们的项目有关吗" | `signal-gatekeeper` | 廉价判断相关性，不相关直接丢弃 |

**为什么这个用法价值高**：技能里固化了框架的硬规则。你不说，agent 也会加载约束、跑独立验证、检查拒绝列表、声明未跑的检查。**这些约束在对话里同样生效**，不需要先接 CI。

**前提**：目标仓库要有 `loop-constraints.md`（拒绝列表）和 `STATE.md`。没有就先跑用法 ②。

### 用法 ④ 事件驱动自动化

**做什么**：让 GitHub 事件自动触发循环。

```bash
cp examples/github-actions/*.yml /path/to/repo/.github/workflows/
```

**关键设计**：workflow **不执行 agent 逻辑**，只做两件事——调用 `event-router.mjs` 确定阶段与技能，把结果写进 `.loop/queue/`。真正的 agent 执行由你的 agent 平台消费这些产物完成。

**为什么这样设计**：路由逻辑与执行平台解耦。换平台（Claude Code → Codex → 本地调度器）时事件脊不用重写。

**必须设置的**：`LOOP_BOT_TOKEN`（独立机器人账号，最小权限，**不授予 merge**）。

### 用法 ⑤ 定时循环

**做什么**：让系统自己发现问题、自己积累经验。

| 循环 | 节奏 | 作用 |
|---|---|---|
| `daily-triage.yml` | 工作日 08:00 | 每日概览，事件丢失时的兜底 |
| `lesson-harvest.yml` | 每天凌晨 3:00 | **夜审**：扫当天 commit，把教训写进 LESSONS.md |

**夜审是这套框架里最独特的一环。** 它让经验从"笔记"变成"规则"，但只在确实是系统性问题时才转正：

```
夜审发现返工  → 记进 LESSONS.md（Seen 1×）
再次出现      → Seen 2×
第三次出现    → 转正进 loop-constraints.md → 之后每个 PR 审查逐条对
```

---

## 四、技能全表

| 技能 | 什么时候用 | 关键约束 |
|---|---|---|
| `harness-init` | 阶段 1：新项目还没有 harness | 8 项判据；启动脚本必须真的能跑通（退出码 0） |
| `harness-loop-init` | 阶段 2：文件在但机制没生效 | 6 机械 + 3 人工（回退测试执行过 / NOT RUN 用过 / triage 准确率 > 70%） |
| `harness-consolidate` | 阶段 3：要接事件、要积累经验 | 7 机械 + 1 人工（跑过完整循环周期） |
| `harness-loop` | 有事件进来，要决定"接下来做什么" | 顶层编排：退出检查→约束→路由→预算→派发→闸门→写状态。**运行时**，不属于任何建设阶段 |
| `loop-constraints` | 每轮开始（其他技能的前置） | 加载拒绝列表与闸门；命中即升级，不编辑 |
| `loop-budget` | 每轮开始和结束 | 80% 降级 report-only，100% 立即退出 |
| `loop-guard` | 每次重试前 | 熔断：同一错误 3 次 / 连续失败 5 次 / 总迭代 10 次 |
| `signal-gatekeeper` | 高噪声信号源之前 | 廉价模型判断相关性，不相关丢弃，不转发原文 |
| `event-router` | 收到事件 | 事件→阶段→技能→闸门；检测 `acting_on` 冲突 |
| `issue-triage` | issue 事件 / 每日概览 | L1 只提议标签，不应用、不评论、不关闭 |
| `pr-review-triage` | PR 事件 | 汇总 CI/审查/阻塞项；空闲 >4 天建议人工接手 |
| `ci-triage` | CI 失败 | 分类 flake/regression/env/config；**env 绝不改代码** |
| `minimal-fix` | 修复目标明确时 | 一个 diff 一个问题；>5 文件升级；不得自标完成 |
| `loop-verifier` | 每次修复之后 | 独立实例；回退测试；NOT RUN 声明；真机验证；默认 REJECT |
| `post-merge-cleanup` | 合并之后 | 不改变行为；>10 文件需人工批准 |
| `release-drafter` | 打标签 / 发布前 | 只起草，绝不发布、打标签、写 CHANGELOG |
| `lesson-harvest` | 每天夜里 | 三个扫描目标；Seen 3× 才转正 |

---

## 五、脚本全表

| 脚本 | 用途 | 退出码 |
|---|---|---|
| `harness-stage.mjs` | **三阶段检测 / 补齐 / 校验** | 0 = 报告或已达成；2 = `--require` 未达成 |
| `loop-audit.mjs` | 就绪度审计 | 0 = ≥40 分；2 = <40 分 |
| `init-loop-harness.mjs` | 装配脚手架（等价于 `harness-stage --upgrade --stage 1`，但只做文件） | 0 = 成功 |
| `event-router.mjs` | 事件路由 | 0 = 已注册；1 = 未注册 |
| `gate-check.mjs` | 闸门判定 | 0 = 通过；2 = 升级；3 = 退出 |
| `ledger-check.mjs` | 熔断检查 | 0 = 继续；2 = 停止并升级（**含账本缺失或畸形**） |
| `install-skills.mjs` | 安装技能到 ZCode 发现路径 | 0 = 成功；1 = 错误 |
| `test.mjs` | 自检（724 断言） | 0 = 全通过 |

**退出码是给自动化用的。** 在 CI 里可以直接 `node scripts/gate-check.mjs ... || exit 1`。

---

## 六、从哪开始

**如果你只想试一下**：装技能（第 0 步），然后说"帮我审这个 PR"。

**如果你想在一个真实项目上用**：

1. `node scripts/harness-stage.mjs /path/to/repo` —— 看当前阶段与差距
2. `node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 1` —— 补齐阶段 1
3. 改 `AGENTS.md` 的验证命令、`loop-constraints.md` 的拒绝列表
4. 装技能：`node scripts/install-skills.mjs --target /path/to/repo`
5. **第一周只跑 L1 报告**，每天读 `STATE.md`，判断 triage 准不准
6. 准确率 > 70% 后进阶段 2：`--upgrade --stage 2`
7. 阶段 2 全过再进阶段 3：`--upgrade --stage 3`

**如果你要接自动化**：先完成上面的 1–5，再加 `examples/github-actions/` 的接线。

**不要跳级。** L1 的唯一目的是校准 triage 的准确度。如果 triage 有一半是误报，L2 的自动修复会在错误目标上烧钱，并消耗人对系统的信任——信任一旦消耗，团队会静音机器人，那是所有升级机制失效的终点。

---

## 七、常见问题

**问：技能装在哪一级？**

- 用户级（`~/.agents/skills/` 或 `~/.zcode/skills/`）：所有项目可用，适合你常用的工作方式
- 工作区级（`<repo>/.agents/skills/` 或 `<repo>/.zcode/skills/`）：只在特定项目生效，适合团队共享
- 要跨 agent 通用选 `.agents/`（`--layout agents`）；只在 ZCode 内生效选 `.zcode/`

**问：装了但 `/harness-loop` 调不出来？**

重启会话。ZCode 在会话启动时扫描技能目录。

**问：技能和脚手架的技能目录重复吗？**

不重复，作用不同：

- `~/.agents/skills/`、`~/.zcode/skills/` 或 `<repo>/` 下的对应目录 —— agent 发现并执行
- `<repo>/skills/`（脚手架生成的）—— 随仓库走，供人工阅读与版本控制

**问：能只用一部分技能吗？**

能。装的时候只复制需要的目录即可，或装完全部再删掉不用的。

**问：这套框架和 superpowers / 其他 skill pack 冲突吗？**

不冲突。但如果存在同名技能，**发现顺序在前的会遮蔽后面的**（用户级优先于工作区级）。用 `--list` 检查。

**问：为什么自审计只有 L2？**

因为它还没跑过真实循环。审计刻意不把"文件存在"当作活动证据——那是结构性就绪，不是验证过。等你在某个项目里跑完一个完整周期并提交运行日志，那个项目的评分会到 L3。
