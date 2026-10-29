# Spec：收敛 harness-init 的三处重复

- **状态**：DRAFT — 等待批准；批准前不改实现代码
- **日期**：2026-10-29
- **作用域**：`skills/harness-init`、`skills/harness-loop-init`、`skills/harness-loop`、`skills/harness-loop-issue` 的模板与共享脚本，以及相关 docs/tests
- **依据**：本会话的 grilling 决策（Q1–Q23）+ 静态核查报告（file:line 见各节）

---

## 1. 问题

三处高严重度重复，已经造成“人和机器各按一份数据工作”的风险：

### 1.1 队列/状态双轨

- `AGENTS.md` 说 `STATE.md` 的 `## High Priority` 是唯一工作队列，`feature_list.json` 只记录完成状态与证据。
- 但 `feature_list.json` 同时带 `priority`、`status: in_progress`、`rules.single_active_feature`，看起来也是队列。
- **运行时只有 `STATE.md` 被读取**：`gate-check.mjs` 解析 `## Active` 做 WIP=1、解析 `## High Priority` 做 untrusted 标记；没有任何 loop/gate/ledger/state 脚本读 `feature_list.json` 的 `status` / `priority` / `rules`。
- 生成的 `init.sh` 末尾仍然教 agent “Read feature_list.json to see feature status / Select ONE unfinished feature”，与 AGENTS 的 STATE 队列相反（`common.mjs:384`）。

### 1.2 阶段 1 约束混入阶段 2 机制

- `harness-constraints.md`（阶段 1）包含 `loop-ledger.json` 追加、`ledger-check.mjs` 调用、3 次尝试上限、`loop-pause-all` kill switch、Worktrees。
- 阶段 1 不创建 `loop-ledger.json` / `loop-run-log.md`；`/harness-loop` 在第 3 步（派发之前）缺账本就退出 2，第 7 步缺运行日志硬失败——阶段 2 之前无法派发执行者，也无法完成一轮。
- 这些内容与 `loop-constraints.md` 的职责声明直接冲突。

### 1.3 工作规则三份副本

| 位置 | 规则 |
|---|---|
| `AGENTS.md` 工作规则 | 一次一个 item / 不跑验证不宣称完成 / 不碰无关文件 / 不得静默改验证规则 |
| `harness-constraints.md` `## Code` | 修复前跑测试 / 绝不禁用测试 / 绝不重构无关代码 / 一轮一个修复 |
| `feature_list.json` `rules` | `single_active_feature` / `passing_requires_evidence` / `do_not_skip_verification` |

`feature_list.rules` 没有任何代码读取，是第三份无执行入口的规则副本。

---

## 2. 目标与非目标

### 目标

1. **每个事实只有一个规范来源**，其余位置只做指针。
2. **阶段 1 的约束文件不再包含阶段 2 的运行机制**；阶段 2 的机制只在 `loop-constraints.md`。
3. **旧项目不迁移也能继续运行**：脚本优先读新位置，回退读旧位置，并给出弃用提示。

### 非目标（Deferred，另开 spec）

- 证据三个落点（`feature_list.evidence` / `STATE` / `verifier-report.md`）的职责收敛。
- 返工记录三处（`STATE` Post-Run Critique / `LESSONS` Rules / `LESSONS` Run log）的收敛。
- `verifier-report.md` 创建但不判据、不路由的孤儿问题。
- 拒绝列表两份（`harness-constraints.md` ↔ `docs/04-safety.md`）的收敛。
- 新增“双轨一致性”机械判据（Q8 = 不加）。
- 双宿主（`.claude/skills` 与 `.agents/skills`）副本的漂移检测。
- `docs/archive/` 一律不动（Q11）。

---

## 3. 已定决策摘要

| # | 决策 | 结果 |
|---|---|---|
| Q1 | 范围 | 三处高严重度 + `init.sh` 文案；中低项 deferred |
| Q2 | 队列来源 | `STATE.md` 唯一队列；`feature_list` 只做记录 |
| Q3 | feature_list 字段 | 删除 `rules` 与 `priority` |
| Q4 | 工作规则规范位置 | `AGENTS.md`；constraints 只留可执行细则 + 指针 |
| Q5 | 阶段切分 | 账本/尝试上限/Worktrees 移到 `loop-constraints.md`；denylist/push/comm/data/5 文件上限留在阶段 1 |
| Q6 | 兼容 | 新位置优先，旧位置回退；不自动改写已有文件 |
| Q7 | 交付 | 三阶段，每阶段一个 commit、独立跑绿 |
| Q8 | 一致性判据 | 不新增 |
| Q9 | loop-constraints 结构 | `## Attempts & Ledger` + `## Worktrees` + `## Kill Switch` |
| Q10 | 迁移说明 | `harness-loop-init/SKILL.md` 完整说明 + README；`harness-init/SKILL.md` 一行指针 |
| Q11 | 归档 | 不动 `docs/archive/` |
| Q12/Q17 | kill switch | 移到 `loop-constraints.md`；`gate-check` 继续扫描三个位置 |
| Q13 | 断言强度 | 每阶段 2 条（正向 + 负向）；阶段 C 加行为测试 |
| Q14 | 回退策略 | 新位置赢；旧位置生效时 stderr 弃用提示；2.0.0 移除回退 |
| Q15 | 版本 | 四个技能 `1.1.0` → `1.2.0` |
| Q16 | 文案 | 合并 AGENTS 第 4/5 步；feature_list 标明“记录，不是队列” |
| Q18 | 限制优先级 | 新位置赢——**实现细化为按 key 决定**，见 §7.3 |
| Q19 | 解析入口 | attempt 上限接受 `## Code` 与 `## Attempts & Ledger` |
| Q20 | 文档漂移 | 一并修正（README/docs/03/help text/docs/02） |
| Q21 | spec 位置 | `docs/specs/2026-10-29-converge-duplication.md` |
| Q22 | 提交边界 | 先提交 spec 一个 commit；代码等批准后按阶段做 |
| Q23 | 精确度 | 意图 + 精确文件清单 + 验收断言；不写逐行 diff |

---

## 4. 目标状态：文件职责

| 文件 | 唯一职责 | 谁读它 |
|---|---|---|
| `AGENTS.md` | 路由 + 工作规则 + 完成定义 | agent（启动时） |
| `STATE.md` | **唯一工作队列** + Active + 收件箱 | agent + `gate-check.mjs` |
| `feature_list.json` | 完成状态与证据**记录** | agent（只写/查记录），无运行时脚本 |
| `harness-constraints.md` | 阶段 1 安全细则：拒绝列表、push/merge、communication、data、5 文件 scope 上限 | agent + `gate-check.mjs` / `loadLimits` |
| `loop-constraints.md` | 阶段 2 运行规则：验证、账本/尝试上限、kill switch、worktrees、预算、教训 | agent + `gate-check.mjs` / `ledger-check.mjs` / `loadLimits` |
| `LESSONS.md` | 返工经验 → 硬规则的转正路径 | agent（人工） |
| `verifier-report.md` | 独立验证者的证据格式契约 | `gate-check.mjs`（闸门） |
| `init.sh` | 标准启动与验证路径 | agent + stage1 判据（实际执行） |

---

## 5. 阶段 A：单队列 + feature_list 字段收敛

### 5.1 改动文件

| 文件 | 改动 |
|---|---|
| `skills/harness-init/templates/AGENTS.md` | 合并启动流程第 4/5 步；工件表描述改为“记录，不承担队列” |
| `skills/harness-loop-init/templates/AGENTS.md` | 同上（副本，必须逐字节一致） |
| `skills/harness-init/templates/feature_list.json` | 删除 `rules` 与每条的 `priority`；增加顶层 `note`；调整 `status_legend.in_progress` 文案 |
| `skills/harness-loop-init/templates/feature_list.json` | 同上（副本） |
| `skills/harness-init/scripts/lib/common.mjs` | `initScriptFromCommands` 的 Next steps 文案 |
| `skills/harness-loop-init/scripts/lib/common.mjs` | 同上（副本） |
| `skills/harness-loop/scripts/lib/common.mjs` | 同上（副本） |
| `skills/harness-loop-issue/scripts/lib/common.mjs` | 同上（副本） |
| `scripts/lib/common.mjs` | 同上（副本，根目录维护者工具） |
| `docs/02-state-model.md` | 删除 `rules` / `priority`；状态规则改为“记录语义” |
| `scripts/test.mjs` | 新增阶段 A 断言 |

### 5.2 目标文本

AGENTS 启动流程（第 4/5 步合并；后续步骤重新编号为 5、6）：

```md
4. 读 `STATE.md`：`## High Priority` 第一条未勾选的 `- [ ]` 是**唯一**工作队列；
   同时看 `## Active` 与 `## Human Inbox`。
   `feature_list.json` 只记录完成状态与证据，不是队列。
```

工件表：

```md
| `feature_list.json` | 完成状态与证据记录（**不承担队列**；队列见 `STATE.md`） |
```

`feature_list.json` 顶层新增（放在 `last_updated` 之后）：

```json
"note": "本文件只记录完成状态与证据，不用于选择下一个任务；工作队列见 STATE.md 的 ## High Priority。",
```

删除：

```json
"rules": { ... },
```

每条 feature 删除 `"priority": N,`。`status_legend.in_progress` 改为：

```json
"in_progress": "当前活动任务的记录；选活见 STATE.md 的 High Priority"
```

`initScriptFromCommands` 的 Next steps：

```js
lines.push('echo "1. Read STATE.md and take the first unchecked item under ## High Priority"');
lines.push('echo "2. That item is the only work item for this session"');
lines.push('echo "3. feature_list.json records completion and evidence; it is not the queue"');
lines.push('echo "4. Implement only that item"');
lines.push('echo "5. Re-run verification before claiming completion"');
```

> 说明：Q16 说“status_legend 增加一句”。实现时把这句话放在顶层 `note`，因为 `status_legend` 的每个键都是状态码；混入非状态键会破坏它的机器可读性。语义不变。

### 5.3 断言（改动前会红）

- **A1 正向**：`feature_list.json` 模板含顶层 `note`，且 `status_legend.in_progress` 提到 `STATE.md`。
- **A2 负向**：`feature_list.json` 模板不含 `"rules"`、不含 `"priority"`。
- **A3 正向**：`initScriptFromCommands(['echo ok'])` 的输出含 `STATE.md` 与 `High Priority`。
- **A4 负向**：同一输出不含 `Select ONE unfinished feature`、不含 `Read feature_list.json to see feature status`。
- **A5 正向**：AGENTS 模板的启动流程只有一个 `STATE.md` 读取步骤，且工件表描述含“不承担队列”。

### 5.4 验收

```bash
bash init.sh
```

手动冒烟：

```bash
TMP="$(mktemp -d)" && git -C "$TMP" init -q
node skills/harness-init/scripts/harness-stage.mjs "$TMP" --upgrade --stage 1
node skills/harness-init/scripts/harness-stage.mjs "$TMP" --stage 1 --require
# 预期退出 2：模板 feature 仍是占位
```

---

## 6. 阶段 B：工作规则单一来源

### 6.1 改动文件

| 文件 | 改动 |
|---|---|
| `skills/harness-init/templates/harness-constraints.md` | 删除重复的三句工作规则；加一行指向 AGENTS |
| `skills/harness-loop-init/templates/harness-constraints.md` | 同上（副本） |
| `scripts/test.mjs` | 新增负向断言与 AGENTS 不变式保护 |

### 6.2 目标文本

`## Code` 保留/修改为：

```md
## Code

- 工作规则（一次一个 work item / 不验证不宣称完成 / 完成定义）见 `AGENTS.md` 的「工作规则」；
  本节只列可被脚本解析的阈值。
- 单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级。
  <!-- 阈值来源：gate-check.mjs 的 loadLimits 解析本行；改数字即改变 scope 闸门的行为 -->
- 每个 work item 最多 3 次修复尝试；之后升级。   <!-- 阶段 C 移到 loop-constraints.md -->
```

删除：

```md
- 提议修复前必须跑测试。
- 绝不禁用测试、跳过断言或注释掉检查来让 CI 变绿。
- 绝不重构无关代码 —— 一轮一个修复。
```

### 6.3 断言（改动前会红）

- **B1 负向**：`harness-constraints.md` 模板不含 `提议修复前必须跑测试`、`绝不禁用测试`、`绝不重构无关代码`。
- **B2 正向**：constraints 模板含 `见 \`AGENTS.md\` 的「工作规则」`。
- **B3 保护**：AGENTS 模板仍含三条不变式（一次一个 item / 不验证不宣称完成 / 完成定义）——防止删过头。

### 6.4 验收

```bash
bash init.sh
```

---

## 7. 阶段 C：阶段边界 + 解析器 + 兼容

### 7.1 模板改动

| 文件 | 改动 |
|---|---|
| `skills/harness-init/templates/harness-constraints.md` | 删除账本指令、3 次上限、Kill Switch、Worktrees；末尾加一行指向 `loop-constraints.md` |
| `skills/harness-loop-init/templates/harness-constraints.md` | 同上（副本） |
| `skills/harness-loop-init/templates/loop-constraints.md` | 新增 `## Attempts & Ledger`、`## Kill Switch`、`## Worktrees` |
| `skills/harness-loop/scripts/lib/common.mjs` | `parseLimitsFrom` / `loadLimits`：按 key 决定优先级 + 弃用提示 |
| `skills/harness-loop-init/scripts/lib/common.mjs` | 同上（副本） |
| `skills/harness-init/scripts/lib/common.mjs` | 同上（副本） |
| `skills/harness-loop-issue/scripts/lib/common.mjs` | 同上（副本） |
| `scripts/lib/common.mjs` | 同上（副本） |
| `skills/harness-loop/scripts/ledger-check.mjs` | 帮助文本修正 |
| `skills/harness-loop-init/scripts/ledger-check.mjs` | 同上（副本） |
| `skills/harness-loop/scripts/gate-check.mjs` | 注释修正（扫描三文件的说明）；无逻辑改动 |
| `skills/harness-loop-init/scripts/gate-check.mjs` | 同上（副本） |
| `docs/02-state-model.md`、`docs/03-gates-and-levels.md`、`docs/04-safety.md`、`README.md` | 文档漂移修正（§7.5） |
| `skills/harness-init/SKILL.md`、`skills/harness-loop-init/SKILL.md`、`skills/harness-loop/SKILL.md` | 迁移说明与阈值来源 |
| `skills/*/VERSION`（4 个） | `1.1.0` → `1.2.0` |
| `scripts/test.mjs` | 阶段 C 行为测试 + 模板负向断言 |

### 7.2 `loop-constraints.md` 新增章节

```md
## Attempts & Ledger

- 每个 work item 最多 3 次修复尝试；之后升级。
  <!-- 阈值来源：loadLimits 读取本行；计数来自 loop-ledger.json，不是命令行参数 -->
- 每次尝试追加到 `loop-ledger.json`——用脚本，不要手改 JSON：
  `node .claude/skills/harness-loop/scripts/ledger-check.mjs --append --item <id> --outcome <success|failure|noop> --action <text> [--error <text>]`
- 重试前跑 `node .claude/skills/harness-loop/scripts/ledger-check.mjs --item <id>`；退出码 2 即停止并升级。

## Kill Switch

- `loop-pause-all` **独占一行**写在 `STATE.md` 或任一约束文件里 → `/harness-loop` 立即退出。
- 散文里提到不算；清除标记后人工重启。
- `gate-check.mjs --state <dir>` 会真的读它并返回退出码 3。

## Worktrees

- 无人值守的代码改动必须在独立 git worktree 中进行。
- 一个修复一个 worktree；REJECT 或升级后保留未合并的提交和现场，供人工处理。
  只清理已并入基准分支且无未提交改动的 worktree。
```

`loop-constraints.md` 头部说明改为：

```md
> 连续运行的规则：验证、账本/尝试上限、kill switch、worktrees、预算、教训。
> 拒绝列表与通用代码规则在 `harness-constraints.md`——两层分开，"只用 harness 不用 loop"才成立。
```

`harness-constraints.md` 末尾新增：

```md
> loop 运行规则（账本、尝试上限、kill switch、worktrees）见 `loop-constraints.md`（阶段 2 安装）。
```

降级读取布局：

| 键 | 新位置 | 回退位置 |
|---|---|---|
| `maxFilesPerFix`（5 文件 scope） | `harness-constraints.md ## Code` | `loop-constraints.md ## Code`（保持现状） |
| `maxFilesPerCleanup`（10 文件） | `loop-constraints.md ## Cleanup` | `harness-constraints.md ## Cleanup`（保持现状） |
| `maxAttempts`（3 次） | `loop-constraints.md ## Attempts & Ledger` | `harness-constraints.md ## Code`（新增） |

### 7.3 解析器改动（Q18 的实现细化）

Q18 批准的是“新位置优先”。核查发现 `constraintsFiles()` 同时服务 `loadDenylist()`：
如果全局改成 `[loop, harness]`，拒绝列表的优先级也会翻转，违反“denylist 是阶段 1 规则”。
因此 **`constraintsFiles()` 保持 `[harness, loop]` 不变**，只在 `loadLimits()` 内按 key 决定顺序：

- `maxFilesPerFix`：harness → loop（不变）
- `maxFilesPerCleanup`：loop → harness（不变）
- `maxAttempts`：loop → harness（变化）

`parseLimitsFrom()`：

- `maxFilesPerFix` 仍只从 `## Code` 读；
- `maxAttempts` 从 `## Code` **或** `## Attempts & Ledger` 读（两个段落的文本拼接后匹配）；
- `maxFilesPerCleanup` 仍只从 `## Cleanup` 读。

弃用提示：

- `maxAttempts` 最终来自 `harness-constraints.md` 时，向 **stderr** 打一行：
  `[harness-loop] maxAttempts read from harness-constraints.md (deprecated; move to loop-constraints.md §Attempts & Ledger; fallback removed in 2.0.0)`
- 两个文件都定义 `maxAttempts` 且值不同：loop 胜出，并打一行冲突提示。
- 每个进程最多打一次，避免刷屏。

回退代码处加注释：

```js
// shortcut: harness-constraints fallback for maxAttempts, remove in 2.0.0
```

### 7.4 断言（改动前会红）

- **C1 正向**：`parseLimitsFrom` 能从 `## Attempts & Ledger` 的 `最多 4 次` 读出 `maxAttempts: 4`。
- **C2 行为**：两个文件都有 `最多 N 次` 且值不同 → loop 的值胜出，stderr 有冲突提示。
- **C3 行为**：只有旧 `harness-constraints.md ## Code` 有 `最多 N 次` → 回退生效，stderr 有弃用提示。
- **C4 保护**：`loadDenylist` 仍然 harness 优先（两文件都有 `## Paths` 时取 harness）。
- **C5 负向**：`harness-constraints.md` 模板不含 `## Worktrees`、`loop-pause-all`、`loop-ledger.json`、`最多 3 次`。
- **C6 正向**：`loop-constraints.md` 模板含上述四项。
- **C7 行为**：kill switch 在 `loop-constraints.md` 中也能被 `gate-check` 识别（exit 3）；旧位置 `harness-constraints.md` 仍能识别。

### 7.5 文档修正（Q20）

| 位置 | 现状 | 修正 |
|---|---|---|
| `README.md:167` | 说 scope 阈值来自 `loop-constraints.md` | 改为 `harness-constraints.md` 的 `## Code` |
| `README.md:174` | 尝试上限只说“约束文件” | 指明 `loop-constraints.md ## Attempts & Ledger`，旧位置为回退 |
| `README.md:184-186` | 把 3 次上限列在 harness-constraints 那套里 | 拆开：拒绝列表/scope 在 harness；尝试上限/账本/验证在 loop |
| `docs/03-gates-and-levels.md:55-57` | scope 阈值来源未点名 | 点名 `harness-constraints.md ## Code` |
| `docs/03-gates-and-levels.md:61-68` | 尝试上限来源未点名 | 点名 `loop-constraints.md ## Attempts & Ledger`（回退 harness） |
| `docs/03-gates-and-levels.md:148` | kill switch 文件列表漏 `harness-constraints.md` | 补上三个文件 |
| `docs/02-state-model.md:67-150` | schema 含 `rules`、`priority` 必填 | 删除两者；状态规则改为“记录语义，选活见 STATE” |
| `docs/04-safety.md:119-120` | 人工审批阈值来源未点名 | 5 文件 → harness；第 3 次 → loop |
| `ledger-check.mjs:431-432` | 帮助说读 `loop-constraints.md ## Code` | 改为 `loop-constraints.md ## Attempts & Ledger`，harness 为回退 |
| `skills/harness-loop/SKILL.md:81-92` | “约束文件的「最多 N 次」” | 指明新位置与回退 |

### 7.6 迁移说明

- `harness-loop-init/SKILL.md`：新增「从旧布局升级」小节：
  - 旧项目不需要改写文件也能继续运行；脚本会回退读取并给出弃用提示。
  - 想消除提示：把 `harness-constraints.md` 的 `## Code` 中 `最多 N 次`、账本指令、`## Kill Switch`、`## Worktrees` 移到 `loop-constraints.md` 的对应章节。
  - 不自动改写用户文件。
- `harness-init/SKILL.md`：一行指针到上面的小节。
- `README.md`：「两阶段建设」一节补一句“旧布局兼容与迁移”。

### 7.7 验收

```bash
bash init.sh
```

以及阶段 1 冒烟（同 §5.4），确认移动后阶段 1 仍生成 7 个文件、`--require` 仍因占位退出 2。

---

## 8. 跨阶段事项

### 8.1 重复副本必须同步

仓库的 `test.mjs:1132-1163` 逐字节比对同名脚本/模板。每个阶段改共享文件时，必须在同一个阶段内同步所有副本：

| 文件 | 副本 |
|---|---|
| `common.mjs` | 根 `scripts/lib/` + 四个技能各一份（共 5） |
| `AGENTS.md` / `feature_list.json` / `STATE.md` / `LESSONS.md` / `harness-constraints.md` / `verifier-report.md` | `harness-init/templates/` 与 `harness-loop-init/templates/`（各 2） |
| `stage1.mjs` | `harness-init/scripts/` 与 `harness-loop-init/scripts/` |
| `gate-check.mjs` / `ledger-check.mjs` | `harness-loop/scripts/` 与 `harness-loop-init/scripts/` |
| `loop-constraints.md` | 仅 `harness-loop-init/templates/` |

### 8.2 版本

四个 `skills/*/VERSION` 在阶段 C 统一升到 `1.2.0`。不许只升一个。

### 8.3 回滚

三个阶段各自一个 commit，可独立 revert。回滚顺序：C → B → A。  
阶段 C 回滚后，旧布局仍可运行（脚本回退逻辑在 C 中引入，回滚即回到 harness 优先）。

### 8.4 不推送

只提交本地 commit；未经明确批准不推送、不合并。

---

## 9. 验证矩阵

| 阶段 | 测试位置 | 断言 | 改动前预期 |
|---|---|---|---|
| A | `test.mjs:1005-1010` 附近 | feature 模板含 `note`、不含 `rules`/`priority` | 红 |
| A | `test.mjs:970-984` 附近 | 生成的 `init.sh` 指向 STATE、不指向 feature_list 选活 | 红 |
| A | 模板检查 | AGENTS 工件表写“不承担队列” | 红 |
| B | `test.mjs:1245-1255` 附近 | constraints 不含三句重复规则、含 AGENTS 指针 | 红 |
| B | 模板检查 | AGENTS 仍含三条不变式 | 绿（保护） |
| C | `test.mjs:196-204` | attempts 两文件冲突时 loop 胜；denylist 仍 harness 胜 | 红 |
| C | `test.mjs:660-690` 附近 | `## Attempts & Ledger` 的 `最多 4 次` 可解析 | 红 |
| C | `test.mjs:1034-1038` | harness 模板无 Worktrees/loop-pause-all/loop-ledger；loop 模板有 | 红 |
| C | `test.mjs:818-859` 附近 | kill switch 在 loop 位置生效；旧位置仍生效 | 部分红 |
| C | `test.mjs:1132-1163` | 所有副本逐字节一致 | 绿（保护） |

每条新断言必须先在**改动前**运行并记录失败输出，再实现到绿。记录方式：阶段 commit message 里贴失败断言名与输出首行；或本 spec 末尾附「Red check 记录」小节。

---

## 10. 延迟项（Deferred）

1. **证据三处**：`feature_list.evidence` / `STATE` / `verifier-report.md` 谁写什么、谁是权威，尚未定义。
2. **返工三处**：`STATE` Post-Run Critique 与 `LESSONS` Rules / Run log 的分工。
3. **verifier-report 孤儿**：创建但不判据、不在 AGENTS 工件表、不在 STATE 指针。
4. **拒绝列表两份**：`harness-constraints.md` 与 `docs/04-safety.md`，已有 stage2 drift 检查，但只覆盖两者都存在时。
5. **低项**：装配任务在 STATE 与 feature_list 各写一遍；约束加载确认的 `N rules` 无人计算；双宿主技能副本漂移。

---

## 11. 完成定义

- [ ] 三处重复各自只剩一个规范来源；其余位置是指针。
- [ ] 阶段 1 的 `harness-constraints.md` 不再出现 `loop-ledger` / `loop-pause-all` / `## Worktrees` / `最多 N 次`。
- [ ] 旧布局项目无需改写即可运行；使用旧位置时有 stderr 弃用提示。
- [ ] 每个阶段有改动前会红的断言，`bash init.sh` 在改动后全绿。
- [ ] 所有同名副本逐字节一致。
- [ ] 四个技能版本统一为 `1.2.0`。
- [ ] 文档不再把阈值归到错误的文件。
- [ ] 未跑项显式列为 NOT RUN，不省略。

---

## 12. 风险与注意事项

- **优先级细化**：Q18 的“loop 优先”按 key 实现，不是全局翻转；否则会误伤 denylist 与 scope（见 §7.3）。这是对已批准决策的实现细化，不是方向变更。
- **stderr 提示**：`loadLimits` 是库函数，提示必须写 stderr，不能污染 `--json` 输出。
- **旧项目**：不自动改写用户文件；回退逻辑在 2.0.0 才移除，期间保留 `shortcut:` 注释。
- **行号漂移**：本 spec 的行号是 2026-10-29 工作树快照；实现前用 `grep` 重新定位，不要按行号盲改。
- **副本同步**：任何共享文件改动漏掉一份副本，`test.mjs:1163` 会红；这是有意的保护，不要放宽断言。
