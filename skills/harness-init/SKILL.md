---
name: harness-init
description: >-
  Stage 1 of harness building: create the 7 foundation files so a project has a complete,
  restartable harness structure — AGENTS.md, feature_list.json, STATE.md, progress.md,
  the startup script, loop-constraints.md and LESSONS.md. Use when starting harness work
  on a new or un-harnessed project. Stage 1 deliberately does NOT produce the loop
  mechanism documents (LOOP.md, loop-budget.md, loop-run-log.md, session-handoff.md,
  loop-ledger.json) — those belong to stage 2, harness-loop-init. Do not use this skill
  to strengthen constraints or add a verifier; that is stage 2.
license: MIT
user_invocable: true
stage: 1
---

# Stage 1 · 初始化（Init）

> **运行位置：本技能只在 harness 包仓库运行。** 它第一步调用 `scripts/harness-stage.mjs`，
> 而装配不会把该脚本复制进消费者仓库。消费者仓库只安装运行/控制技能；阶段推进由包仓库
> （或用户级安装）执行。

**目标**：创建必要的 md 文件，让 harness 结构完整、**下一会话可重启**。

对应等级 **L1**：只报告，不改代码，不合并。

## 前置检查

```bash
node scripts/harness-stage.mjs <target>
```

看报告里阶段 1 的 8 项判据，确认缺什么。**不要凭印象判断缺什么。**

## 判据（8 项，全机械判定）

| # | 判据 | 为什么 |
|---|---|---|
| 1 | `AGENTS.md` 或 `CLAUDE.md` | 启动路径、工作规则、完成定义 |
| 2 | `feature_list.json` 每条 feature 有**可判定的完成标准** | 占位 feature 不算。判据只查非空数组时，"替换占位 feature"这件真正的活被判据完全放过 |
| 3 | `STATE.md` | 跨轮记忆；没有它循环每轮失忆 |
| 4 | `progress.md` | 会话连续性 |
| 5 | **`init.sh` 真的能跑通**（实际执行，退出码 0） | 它是新会话的启动路径。只读文本的话，一个格式对但命令跑不通的脚本照样拿 PASS |
| 6 | 指令文件声明了**工作规则**（一次一个 item / 不验证不宣称完成 / 完成定义） | 阶段 1 不产出 `LOOP.md`，所以行为约束必须写在 `AGENTS.md` 里 |
| 7 | `loop-constraints.md` | 拒绝列表与闸门。**阶段 1 就要有底线**：没有拒绝列表意味着 agent 可以编辑 `.env` |
| 8 | 核心子系统有最小工件 **且** 就绪度评分 ≥ 40 | 合并判定——两者都是"整体够不够"，拆成两项只会让报告看起来比实际更细 |

**阶段 1 不产出 loop 机制文档。** `LOOP.md`、`loop-budget.md`、`loop-run-log.md`、`session-handoff.md`、`loop-ledger.json` 属于阶段 2。它们曾经也在阶段 1 被创建，于是阶段 1 项目在没有 verifier、没有闸门执行力的状态下就把就绪度评分推到 56——而 `loop-audit` 在没有 verifier 时把等级封顶在 L1，所以分数高不等于阶段到了。

## 执行

```bash
# 补齐阶段 1 缺失的文件
node scripts/harness-stage.mjs <target> --upgrade --stage 1

# 自动检测猜错时（混合栈、CI 环境），显式指定验证命令
node scripts/harness-stage.mjs <target> --upgrade --stage 1 --commands "make check && pytest"
node scripts/harness-stage.mjs <target> --upgrade --stage 1 --package-manager pnpm
```

自动检测在纯 Node 或纯 Python 仓库上好用，在混合栈里会猜错——而猜错的代价是**判据 5 发假 PASS**：启动脚本生成了，但跑不通。发现判据 5 的证据里写着退出码时，用 `--commands` 覆盖。

生成 **7 个文件**：

| 文件 | 作用 | 必须改什么 |
|---|---|---|
| `AGENTS.md` | 路由器 | 替换占位符；确认验证命令真实；确认「工作规则」三条在（判据 6） |
| `feature_list.json` | 功能清单 | 把 3 个占位 feature 换成真实的，**判据 2 会拦住占位** |
| `STATE.md` | 活状态 | 填项目名 |
| `progress.md` | 进度日志 | 无 |
| `init.sh` | 启动脚本 | **替换安装/测试/构建命令，直到 `bash init.sh` 退出 0** |
| `loop-constraints.md` | 约束 | 阶段 1 是模板原文；本地化是阶段 2 判据 5 的事 |
| `LESSONS.md` | 错题本 | 无（等夜审写入） |

## 三个必须人工做的动作

脚本能生成文件，但这三件事必须人做：

### 1. 把 `init.sh` 换成真实命令

```bash
# 打开 init.sh，找到命令块，替换成项目实际的：
#   npm install && npm test && npm run build
# 或
#   pip install -e . && pytest && mypy src/
```

**判据 5 专门检查这个，而且是真的执行它。** 占位符留在那里，下一会话跑 `init.sh` 会失败或什么都不做——harness 形同虚设。判据会实际跑一次脚本并检查退出码，所以"格式写对但命令跑不通"也拦得住。

验证：

```bash
bash init.sh   # 必须真实通过，退出码 0
```

### 2. 把拒绝列表改成真实路径（阶段 2 的活）

模板里的 `.env`、`auth/`、`payments/` 是通用示例。按本仓库实际情况调整：

- 加本仓库的高危路径（数据库迁移、生产配置、密钥目录）
- 删掉本仓库不存在的（没有支付模块就不用留 `payments/`）

**阶段 1 保持模板原文就行**——本地化是阶段 2 的判据 5。阶段 1 只要求这个文件存在，因为阶段 1 的 agent 已经在写文件，没有底线就意味着它可以编辑 `.env`。

### 3. 把占位 feature 换成真实的

`feature_list.json` 里的 3 条是占位。替换成真实功能，每条要有：

- `user_visible_behavior`：从用户视角描述可观察行为
- `verification`：逐步可执行指令（不是 shell 命令，是操作步骤）

粒度标准：**一条 feature 应能在一个 session 内完成**。太粗（"实现购物车"）会导致 overreach；太细（"创建 name 字段"）会让列表变成噪声。

## 依据

| 来源 | 内容 |
|---|---|
| **LHE** 五子系统 | 每个子系统有最小工件；缺任何一个，agent 用起来都会别扭 |
| **LHE** 给地图不给手册 | `AGENTS.md` 是路由器，约 100 行；装不下就拆进 `docs/` |
| **LHE** 初始化独立成阶段 | 初始化产出基础设施而非业务代码 |
| **LEC** 脚手架产物 | `STATE.md` / `feature_list.json` / `progress.md` / `LESSONS.md` |
| **LEC** 第一周只报告 | 阶段 1 对应 L1 |

## 退出条件

8 项判据全过：

```bash
node scripts/harness-stage.mjs <target> --stage 1 --require
# 退出码 0 = 达成
```

## 常见错误

| 错误 | 后果 |
|---|---|
| 文件都建了，`init.sh` 还是占位符 | harness 形同虚设——这是最隐蔽的失败 |
| `AGENTS.md` 写成百科全书 | 违反"给地图不给手册"，agent 抓不住重点，且必然腐化 |
| 直接复制模板的拒绝列表 | 真实高危路径没被保护 |
| 跳过阶段 1 进阶段 2 | 没有状态文件，verifier 无法判断改动 scope |

## 下一步

阶段 1 完成后**先跑一周 L1**，每天读 `STATE.md` 判断 triage 准不准。准确率 > 70% 再进阶段 2（阶段 2 有三项人工判据，见 `harness-loop-init`）。

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 2
```

读 `docs/11-three-stages.md` 的阶段 2 章节。
