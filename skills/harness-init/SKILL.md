---
name: harness-init
description: >-
  Stage 1 of harness building: create the 6 foundation files so a project has a complete,
  restartable harness structure — AGENTS.md, feature_list.json, STATE.md, init.sh,
  loop-constraints.md and LESSONS.md. Use when starting harness work on a new or
  un-harnessed project. Deliberately does NOT install the loop mechanism (ledger, run log);
  that is stage 2, harness-loop-init. Do not use this skill to add a verifier or a circuit
  breaker.
license: MIT
user_invocable: true
stage: 1
---

# Stage 1 · 初始化（Init）

**目标**：创建 6 个文件，让 harness 结构完整、**下一会话可重启**。

对应等级 **L1**：只报告，不改代码，不合并。

## 前置检查

```bash
node scripts/harness-stage.mjs <target>
```

看报告里阶段 1 的判据，确认缺什么。**不要凭印象判断缺什么。**

## 判据（7 项，全机械判定）

| # | 判据 | 为什么 |
|---|---|---|
| 1 | `AGENTS.md` 或 `CLAUDE.md` | 启动路径、工作规则、完成定义 |
| 2 | `feature_list.json` 每条 feature 有**可判定的完成标准** | 占位 feature 不算 |
| 3 | `STATE.md` | 跨轮记忆；没有它循环每轮失忆 |
| 4 | **`init.sh` 真的能跑通**（实际执行，退出码 0） | 格式对但命令跑不通的脚本不算 |
| 5 | 指令文件声明了**工作规则**（一次一个 item / 不验证不宣称完成 / 完成定义） | 行为约束必须写在 `AGENTS.md` 里 |
| 6 | `loop-constraints.md` | 拒绝列表与闸门。阶段 1 就要有底线 |
| 7 | `LESSONS.md` | 经验→规则的载体；没有它返工不会被记录 |

## 执行

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 1
```

生成 **6 个文件**：

| 文件 | 作用 | 必须改什么 |
|---|---|---|
| `AGENTS.md` | 入口：启动路径、工作规则、完成定义 | 项目名与验证命令 |
| `feature_list.json` | 功能清单 + 证据 | 3 条占位 feature 换成真实功能 |
| `STATE.md` | 活状态：收件箱、当前活动、观察列表 | 一般不用改 |
| `init.sh` | 标准启动与验证路径 | 把 `npm install && npm test` 换成项目真实命令 |
| `loop-constraints.md` | 拒绝列表、合并规则、预算与尝试上限 | 按本仓库实际情况增删路径 |
| `LESSONS.md` | 错题本 | 一般不用改 |

同时把 `harness-loop`、`harness-init`、`harness-loop-init` 装到 `.claude/skills/` 与
`.agents/skills/`，并复制运行层脚本（`gate-check.mjs`、`ledger-check.mjs`、`lib/common.mjs`）。

**手工改两处**（脚本改不了）：

1. `init.sh`：判据 4 会**实际执行**它。占位符留着或命令跑不通，harness 形同虚设。
2. `feature_list.json`：判据 2 会拦住占位。粒度标准：一条能在一个 session 内完成。

## 验证

```bash
bash init.sh
node scripts/harness-stage.mjs <target> --stage 1 --require   # 退出码 0 = 达成
```

## 常见错误

| 错误 | 后果 |
|---|---|
| `init.sh` 留着占位命令 | 判据 4 失败；新会话的启动路径是坏的 |
| feature 留着模板占位 | 判据 2 失败；"做什么"无法判定 |
| 跳过阶段 1 直接装 loop 机制 | 没有状态文件，验证者无法判断改动范围 |
| 拒绝列表照抄模板不本地化 | 真实高危路径没被保护 |

## 下一步

```bash
node scripts/harness-stage.mjs <target> --upgrade --stage 2
```

或直接对话：`/harness-loop-init`。
