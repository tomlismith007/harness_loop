---
name: harness-loop-init
description: >-
  Stage 2 of harness building: install the loop mechanism — a circuit breaker with a
  ledger, a run log, and a verifier role inside harness-loop. Use when a project has
  passed stage 1 but verification is still self-assessed. Requires stage 1 COMPLETE.
  Produces loop-ledger.json and loop-run-log.md, and checks that the verifier role is
  installed where the agent can find it.
license: MIT
---

# Stage 2 · 装配 loop 机制（Loop Init）

**目标**：让**验证真的有效、熔断真的会触发**。

阶段 1 让文件存在，阶段 2 让机制**起作用**。

## 前置检查

装配器随技能一起安装。直接用**本技能目录**里的那一份——它在任何安装布局下都在：

```bash
node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target>
```

技能装在 `.agents/skills/` 或用户级 `~/.claude/skills/` 时，把前缀换成对应目录。

阶段 1 必须 COMPLETE。没到就别进阶段 2——没有状态文件，验证者无法判断改动范围。
阶段 1 未达成时装配器会拒绝跳级；按它给的提示先跑 `--stage 1`（本技能自带阶段 1 的模板）。

## 判据（7 项机械 + 2 项人工）

| # | 判据 | 类型 | 检查方式 |
|---|---|---|---|
| 1 | `loop-ledger.json` 存在且不是占位账本 | 机械 | 装配器判据直接读 JSON：`attempts` 是数组、`goal` 非出厂占位（不是调 ledger-check） |
| 2 | `loop-run-log.md` 存在 | 机械 | 文件存在且有 `## Log` 章节 |
| 3 | `harness-loop` 已装到可发现路径 | 机械 | 查项目内 `.claude/skills/`、`.agents/skills/`（及 `.zcode`/`.grok`/`.codex`）与用户级 `~/.claude/skills`、`~/.agents/skills`、`~/.codex/skills`；项目内优先；且 SKILL.md 正文含 kill switch / 独立验证的实操描述（关键词任一命中） |
| 4 | `init.sh` 无占位符 | 机械 | 不含占位标记（`replace this line` 等 4 个）且带 `set -e` |
| 5 | **拒绝列表已本地化** | 机械 | 列表含 `loop-constraints.md` 自身（策略自我保护），且至少 2 条模板外路径 |
| 6 | **两份拒绝列表一致** | 机械 | `harness-constraints.md` ↔ `docs/04-safety.md` 逐条比对 |
| 7 | **护栏演练通过** | 机械 | `loop-drill.json` 存在、sha256 与当前约束一致、无失败项 |
| 8 | **回退测试被实际执行过** | **人工** | 有命令与输出为证，记进 `STATE.md` |
| 9 | **NOT RUN 声明被实际使用过** | **人工** | 有一份报告把没跑的检查列为 NOT RUN |

**为什么保留人工判据**：grep 分不清「我们确实会这么做」和「有人抄过这句话」。模板出厂就带着"回退测试""NOT RUN"这些字样——拿它们当机械判据，阶段 2 会永远自动变绿。

## 执行

```bash
node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --upgrade --stage 2
```

产出 **4 个文件**（已存在的一律跳过不覆盖，`--force` 才整体替换）+ 手工生成的
`loop-drill.json`（判据 7，下一节）：

| 文件 | 作用 |
|---|---|
| `loop-ledger.json` | 熔断器的运行时状态：每次尝试一行 |
| `loop-run-log.md` | 只追加的运行历史：每轮一条 JSON |
| `loop-constraints.md` | loop 规则（验证 / 预算 / 教训 / 清理） |
| `docs/04-safety.md` | 拒绝列表的文档副本；判据 6 与 `harness-constraints.md` 逐条比对。已存在则**不覆盖**，只在输出里报告漂移 |

完整产物 = **4 个文件 + 1 份演练记录**（有文件被跳过时相应减少）。

同时确认 `harness-loop` 技能已装到 agent 能扫描的路径。

**手工改三处**：

1. `harness-constraints.md` 的拒绝列表按本仓库实际路径增删（判据 5）。
   `gate-check.mjs` 会真的读它——它必须是真的。
   **改完同步 `docs/04-safety.md` 的代码块**，否则判据 6 会红（两处必须逐条一致）。
2. `loop-ledger.json` 的 `goal` 换成本循环的真实目标（判据 1；出厂值是
   `Replace with the current loop goal`，不改它判据 1 永远红）。
3. 生成护栏演练记录（判据 7）：

   ```bash
   node .claude/skills/harness-loop-init/scripts/drill-check.mjs --record
   git add loop-drill.json
   ```

   记录绑定 `harness-constraints.md` 的 sha256。**改了拒绝列表就要重跑**，否则记录过期，
   阶段 2 判据 7 会失败——旧记录不能为新策略担保。

   演练退出码：`0` 全过；`1` 既有记录对当前约束已过期（不带 `--record` 运行时才判）——
   重跑 `--record` 刷新；`2` 有护栏没响——按输出点名的条目修约束文件（如永不命中的
   glob）后重跑，不得带着失败项提交记录。

## 核心：验证者为什么是阶段 2 的关键

阶段 1 的文件让 agent **知道**该怎么做；验证者让 agent **不能**糊弄过去。

写代码的模型给自己打分系统性偏高。这不是诚实问题，是生成模型的性质：它在生成过程中说服了自己这条路径正确。

三条结构性前提（缺一不可）：

1. **独立实例**——不是执行者的同一会话
2. **反向指令**——"找出拒绝的理由"，不是"确认它是对的"
3. **不参与实现**——验证者不得写代码

违反任一条，这次验证在结构上无效。

## 熔断器

| 类型 | 默认 | 含义 |
|---|---|---|
| `stagnation` | 3 | 同一错误签名出现 3 次 |
| `no-progress` | 5 | 连续失败 5 次 |
| `max-iterations` | 10 | 总迭代上限 |
| `attempt-limit` | 3 | 同一 item 的尝试上限（`ledger-check --item`，读账本计数） |

错误签名归一化：抹掉时间戳、十六进制地址、路径（折叠为 basename）、行列号。
`TypeError at profile.ts:42` 与 `TypeError at profile.ts:87` 是同一个错误。

**如果第 2、3 次尝试的错误归一化后与第 1 次相同，说明根本没触及根因。**

## 两项必须人工确认的动作

### 1. 回退测试被实际执行过

至少一次真实修复里：把修复代码临时回退，跑新增的测试，**它必须失败，且失败信息指出是哪个行为错了**。

不算：编译不过、被跳过、测试通过。

### 2. NOT RUN 声明被实际使用过

至少一份验证报告把没跑的检查**列为 NOT RUN**，而不是省略不写。

## 退出条件

```bash
node .claude/skills/harness-loop-init/scripts/harness-stage.mjs <target> --stage 2 --require
# 退出码 0 = 7 项机械判据全过
```

加上两项人工确认。

## 常见错误

| 错误 | 后果 |
|---|---|
| 验证者与执行者同会话 | 结构性无效 |
| 验证者指令是"确认它是对的" | 系统性放行问题 |
| 拒绝列表还是模板内容 | 真实高危路径没被保护 |
| 只声明回退测试但从不执行 | 装饰性测试混进来 |
| 熔断阈值被临时放宽 | 拆掉熔断器；升级是功能，不是失败 |
