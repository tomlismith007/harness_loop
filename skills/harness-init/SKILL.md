---
name: harness-init
description: >-
  Stage 1 of harness building: create the foundation files so a project has a complete,
  restartable harness structure — AGENTS.md, feature_list.json, STATE.md, LESSONS.md,
  harness-constraints.md, verifier-report.md, plus a generated init.sh. Use when starting
  harness work on a new or un-harnessed project. Deliberately does NOT install the loop
  mechanism (ledger, run log, loop-constraints.md); that is stage 2, harness-loop-init.
  Do not use this skill to add a verifier or a circuit breaker.
license: MIT
---

# Stage 1 · 初始化（Init）

**目标**：创建 7 个文件（6 个模板 + 生成的 init.sh），让 harness 结构完整、**下一会话可重启**。

对应等级 **L1**：只报告，不改代码，不合并。

## 前置检查

装配器随技能一起安装。直接用**本技能目录**里的那一份——它在任何安装布局下都在：

```bash
node .claude/skills/harness-init/scripts/harness-stage.mjs <target>
```

技能装在 `.agents/skills/` 或用户级 `~/.claude/skills/` 时，把前缀换成对应目录。

`<target>` 是**要装配的仓库根**，不是技能目录。从技能目录运行没问题：
装配器只从自己的位置读 `scripts/` 与 `templates/`，写入的是 `<target>`。

无前缀的 `node harness-stage.mjs` 在任何布局下都不成立，不要照抄。

看报告里阶段 1 的判据，确认缺什么。**不要凭印象判断缺什么。**

## 判据（7 项，全机械判定）

| # | 判据 | 为什么 |
|---|---|---|
| 1 | `AGENTS.md` 或 `CLAUDE.md` | 启动路径、工作规则、完成定义 |
| 2 | `feature_list.json` 每条 feature 有**可判定的完成标准** | 占位 feature 不算 |
| 3 | `STATE.md` | 跨轮记忆；没有它循环每轮失忆 |
| 4 | **`init.sh` 真的能跑通**（实际执行，退出码 0） | 格式对但命令跑不通的脚本不算 |
| 5 | 指令文件声明了**工作规则**（一次一个 item / 不验证不宣称完成 / 完成定义） | 行为约束必须写在 `AGENTS.md` 里 |
| 6 | `harness-constraints.md` | 拒绝列表与闸门。阶段 1 就要有底线（loop 规则在阶段 2 的 `loop-constraints.md`） |
| 7 | `LESSONS.md` | 经验→规则的载体；没有它返工不会被记录 |

## 执行

```bash
node .claude/skills/harness-init/scripts/harness-stage.mjs <target> --upgrade --stage 1
```

生成 **6 个模板文件 + 1 个生成的 init.sh（共 7 个）**：

| 文件 | 作用 | 必须改什么 |
|---|---|---|
| `AGENTS.md` | 入口：启动路径、工作规则、完成定义 | 项目名与验证命令 |
| `feature_list.json` | 功能清单 + 证据 | 3 条占位 feature 换成真实功能 |
| `STATE.md` | 活状态：收件箱、当前活动、观察列表 | 一般不用改 |
| `init.sh` | 标准启动与验证路径 | 把 `npm install && npm test` 换成项目真实命令 |
| `harness-constraints.md` | 拒绝列表、合并规则、kill switch | 按本仓库实际情况增删路径 |
| `LESSONS.md` | 错题本 | 一般不用改 |
| `verifier-report.md` | 验证者报告的格式模板（闸门按它校验 Author / sha / 输出片段） | 一般不用改 |

同时把 4 个技能（`harness-init`、`harness-loop-init`、`harness-loop`、`harness-loop-issue`）
装到 `.claude/skills/` 与 `.agents/skills/`。运行时脚本随技能目录安装，**不再复制到项目根**；
所有技能命令走 `.claude/skills/<name>/scripts/...`。
已存在的文件与技能目录一律跳过（`SKIPPED (exists)`），不覆盖；要用出厂模板重置须显式加
`--force`（先删再复制，整体替换）。

**手工改两处**（脚本改不了）：

1. `init.sh`：判据 4 会**实际执行**它。占位符留着或命令跑不通，harness 形同虚设。
2. `feature_list.json`：判据 2 会拦住占位。粒度标准：一条能在一个 session 内完成。

## 验证

```bash
bash init.sh
node .claude/skills/harness-init/scripts/harness-stage.mjs <target> --stage 1 --require   # 退出码 0 = 达成
```

注意：出厂模板的 3 条 feature 带 `占位：` 标记，替换前 `--require` 必须退出 2。
若退出 0，说明判据被削弱了，不要继续。
`--require` 退出 1 是参数或路径错误（目标不存在、`--stage` 值非法）——修命令重跑，与达成
与否无关。

## 常见错误

| 错误 | 后果 |
|---|---|
| `init.sh` 留着占位命令 | 判据 4 失败；新会话的启动路径是坏的 |
| feature 留着模板占位 | 判据 2 失败；"做什么"无法判定 |
| 跳过阶段 1 直接装 loop 机制 | 没有状态文件，验证者无法判断改动范围 |
| 拒绝列表照抄模板不本地化 | 真实高危路径没被保护 |

## 下一步

阶段 2 属于 `/harness-loop-init`：本技能只带阶段 1 的模板与脚本，**不要**在这里跑
`--upgrade --stage 2`（缺阶段 2 的模板，装配器会报错退出）。直接调用 `/harness-loop-init`。
本技能输出的报告里，阶段 2 一栏固定为 NOT RUN——阶段 2 判据未随本技能安装，不是失败；
按其 evidence 的指引转去 `/harness-loop-init`。
