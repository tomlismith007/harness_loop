---
name: harness-init
description: >-
  Stage 1 of harness building: create the necessary markdown files so a project has a
  complete, restartable harness structure. Use when starting harness work on a new or
  un-harnessed project, or when a project has files but init.sh is still a placeholder.
  Produces AGENTS.md, feature_list.json, STATE.md, progress.md, init.sh, LOOP.md,
  loop-constraints.md and the L1 skill set.
license: MIT
user_invocable: true
---

# Stage 1 · 初始化（Init）

**目标**：创建必要的 md 文件，让 harness 结构完整、**下一会话可重启**。

对应等级 **L1**：只报告，不改代码，不合并。

## 前置检查

```bash
node scripts/harness-stage.mjs <target>
```

看报告里阶段 1 的 10 项判据，确认缺什么。**不要凭印象判断缺什么。**

## 判据（10 项，全机械判定）

| # | 判据 | 为什么 |
|---|---|---|
| 1 | `AGENTS.md` 或 `CLAUDE.md` | 启动路径、工作规则、完成定义 |
| 2 | `feature_list.json` 有非空 features | 范围约束的唯一真相源 |
| 3 | `STATE.md` | 跨轮记忆；没有它循环每轮失忆 |
| 4 | `progress.md` | 会话连续性 |
| 5 | `init.sh` | 标准启动与验证路径 |
| 6 | `LOOP.md` | 循环注册表与事件路由 |
| 7 | `loop-constraints.md` | 拒绝列表与闸门 |
| 8 | **`init.sh` 非占位** | 含真实命令 + `set -e` |
| 9 | 五子系统都有最小工件 | instructions / state / verification / scope / lifecycle |
| 10 | 就绪度评分 ≥ 40 | `loop-audit.mjs` |

## 执行

```bash
# 补齐阶段 1 缺失的文件
node scripts/harness-stage.mjs <target> --upgrade --stage 1
```

生成：

| 文件 | 作用 | 必须改什么 |
|---|---|---|
| `AGENTS.md` | 路由器 | 替换占位符；确认验证命令是真实的 |
| `feature_list.json` | 功能清单 | 把 3 个占位 feature 换成真实的 |
| `STATE.md` | 活状态 | 填项目名 |
| `progress.md` | 进度日志 | 无 |
| `session-handoff.md` | 交接模板 | 无 |
| `init.sh` | 启动脚本 | **替换安装/测试/构建命令** |
| `LOOP.md` | 循环注册表 | 按需删减未使用的循环 |
| `loop-constraints.md` | 约束 | **按本仓库调整拒绝列表** |
| `loop-budget.md` | 预算 | 按实际预算调整日上限 |
| `loop-run-log.md` | 运行日志 | 无 |
| `LESSONS.md` | 错题本 | 无（等夜审写入） |
| `loop-ledger.json` | 熔断账本 | 无 |

## 三个必须人工做的动作

脚本能生成文件，但这三件事必须人做：

### 1. 把 `init.sh` 换成真实命令

```bash
# 打开 init.sh，找到命令块，替换成项目实际的：
#   npm install && npm test && npm run build
# 或
#   pip install -e . && pytest && mypy src/
```

**判据 8 专门检查这个。** 占位符留在那里，下一会话跑 `init.sh` 会失败或什么都不做——harness 形同虚设。

验证：

```bash
bash init.sh   # 必须真实通过
```

### 2. 把拒绝列表改成真实路径

模板里的 `.env`、`auth/`、`payments/` 是通用示例。按本仓库实际情况调整：

- 加本仓库的高危路径（数据库迁移、生产配置、密钥目录）
- 删掉本仓库不存在的（没有支付模块就不用留 `payments/`）

**拒绝列表不真实 = 没有约束。**

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
| **LEC** 脚手架产物 | `STATE.md` / `LOOP.md` / `loop-budget.md` / `loop-run-log.md` |
| **LEC** 第一周只报告 | 阶段 1 对应 L1 |

## 退出条件

10 项判据全过：

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

阶段 1 完成后**先跑一周 L1**，每天读 `STATE.md` 判断 triage 准不准。准确率 > 70% 再进阶段 2。

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 2
```

读 `docs/11-three-stages.md` 的阶段 2 章节。
