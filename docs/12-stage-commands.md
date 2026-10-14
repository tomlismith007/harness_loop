# 12 · 每个阶段用什么技能、敲什么命令

本文档是操作手册。按阶段列出：**该用哪些技能、该敲哪些命令、什么时候敲、敲完看什么。**

---

## 两种调用方式

先分清这两个，否则会敲错：

| 类型 | 怎么调用 | 例子 |
|---|---|---|
| **技能** | 对话里说人话，或敲 `/技能名` | "帮我装配这个项目" 或 `/harness-init` |
| **脚本** | 终端敲 `node scripts/xxx.mjs` | `node scripts/harness-stage.mjs .` |

**技能是给 agent 的指令集**，它按技能里的流程干活。**脚本是确定性工具**，输入参数、输出结果、有退出码。

两者配合：脚本做机械判定（缺什么文件、闸门是否通过），技能做需要判断的事（怎么改、要不要升级）。

---

## 一次性准备

```bash
# 把技能装到 ZCode 能发现的位置（只需一次，全局生效）
node scripts/install-skills.mjs --scope user

# 验证
node scripts/install-skills.mjs --scope user --list
```

**装完重启会话。** 之后 `/harness-init` 这类命令才能用。

若只想在某个项目生效：

```bash
node scripts/install-skills.mjs --target /path/to/repo
```

---

## 阶段 1 · 初始化

### 目标

创建必要的 md 文件，让结构完整、下一会话可重启。对应等级 **L1：只报告**。

### 该用哪些技能

| 技能 | 什么时候用 | 它做什么 |
|---|---|---|
| `harness-init` | **主技能**，一开始就用 | 走完 10 项判据，补齐文件，提醒你改哪三处 |
| `harness-bootstrap` | 想先盘点现状 | 检查五子系统各缺什么 |

### 该敲哪些命令

**第 1 步：看现状**（只读，不改任何东西）

```bash
node scripts/harness-stage.mjs /path/to/repo
```

输出：当前阶段、阶段 1 的 10 项判据逐条 PASS/FAIL、失败项的具体补齐动作。

**第 2 步：补齐缺失文件**

```bash
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 1
```

生成 10 个文件 + 8 个 L1 技能目录。

**第 3 步：手工改三处**（脚本改不了，必须人做）

| 文件 | 改什么 | 为什么 |
|---|---|---|
| `init.sh` | 把 `npm install && npm test` 换成项目真实命令 | 判据 8 专门检查这个——占位符留着，harness 形同虚设 |
| `loop-constraints.md` | 拒绝列表换成真实路径 | 模板里的 `auth/`、`payments/` 是示例，不真实等于没约束 |
| `feature_list.json` | 3 条占位 feature 换成真实功能 | 粒度标准：一条能在一个 session 内完成 |

**第 4 步：验证**

```bash
bash init.sh                                    # 必须真实通过
node scripts/harness-stage.mjs /path/to/repo --stage 1 --require   # 退出码 0 = 达成
```

**第 5 步：装技能到项目（可选，团队共享时用）**

```bash
node scripts/install-skills.mjs --target /path/to/repo
```

### 也可以全程用对话

装好技能后，直接说：

```
帮我把这个项目配一套 harness
```

`harness-init` 会触发，按上面的流程走。它同样会跑那些脚本，但会替你判断哪些要改。

### 阶段 1 之后

**先跑一周 L1，不要急着升级。** 每天读 `STATE.md`，判断 triage 准不准。

```bash
# 每天看一眼
node scripts/event-router.mjs --list          # 确认事件路由表
cat STATE.md                                   # 看 High Priority 与 Watch List
```

---

## 阶段 2 · 强化

### 目标

让**验证真的有效、约束真的被强制执行**。对应等级 **L2：辅助修复**。

### 前置

阶段 1 必须完成：

```bash
node scripts/harness-stage.mjs /path/to/repo   # 阶段 1 应为 [COMPLETE] 10/10
```

### 该用哪些技能

| 技能 | 什么时候用 | 它做什么 |
|---|---|---|
| `harness-strengthen` | **主技能** | 走完 6 项机械判据 + 提醒你做 3 项人工确认 |
| `loop-constraints` | 每轮开始 | 加载约束，输出 `Constraints loaded from loop-constraints.md: N rules active.` |
| `loop-verifier` | 每次修复后 | 独立验证：跑测试、回退测试、NOT RUN 声明 |
| `minimal-fix` | 修复目标明确时 | 产出最小 diff，不得自标完成 |
| `loop-guard` | 每次重试前 | 熔断：同一错误 3 次 / 连续失败 5 次 |

### 该敲哪些命令

**第 1 步：补齐阶段 2 产物**

```bash
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 2
```

补上 `loop-verifier`、`minimal-fix`、`loop-guard` 三个技能目录。

**第 2 步：看还剩哪些判据没过**

```bash
node scripts/harness-stage.mjs /path/to/repo
```

阶段 2 有 9 项：6 项机械 + 3 项人工（回退测试执行过、NOT RUN 用过、triage 准确率）。

**第 3 步：跑一次完整的修复流程（演练）**

这是阶段 2 的核心动作——走一遍 maker/checker 分离：

```bash
# ① 执行者：在独立 worktree 里做最小修复
git worktree add loop/pr-1-fix-1 -b loop/pr-1-fix-1

# ② 验证者：独立实例，实际跑测试
#    在对话里说："验证这个修复，默认立场是拒绝"
#    → 触发 loop-verifier

# ③ 闸门判定
node scripts/gate-check.mjs \
  --item pr-1 --phase gate --attempts 1 \
  --diff-files "src/a.ts,src/b.ts" \
  --verdict approve \
  --red-check pass \
  --reviewed-sha $(git rev-parse HEAD) \
  --head-sha $(git rev-parse HEAD)
```

**第 4 步：记录尝试，检查熔断**

```bash
# 每次尝试追加到账本后，重试前检查
node scripts/ledger-check.mjs --ledger loop-ledger.json
# 退出码 0 = 继续；2 = 停止并升级给人
```

**第 5 步：三项人工确认**（脚本不判定）

1. **回退测试被实际执行过** —— 至少一次：新测试在修复前的代码上真的挂掉，且失败信息指出了错误的行为
2. **NOT RUN 声明被实际使用过** —— 至少一份验证报告把没跑的检查列为 NOT RUN（而不是省略）
3. **triage 准确率 > 70%** —— 见下

跑满一周 L1 后：

1. 打开 `STATE.md` 的 High Priority
2. 逐条问自己：我同意这个判定吗？
3. 算准确率 = 同意条数 / 总条数
4. **> 70% 才允许进阶段 3**

不达标 → 收紧 `skills/issue-triage/SKILL.md` 的规则（把噪声加进 `Noise / Ignore`），重跑一周。

**第 6 步：校验**

```bash
node scripts/harness-stage.mjs /path/to/repo --stage 2 --require
# 退出码 0 = 6 项机械判据全过
```

### 也可以全程用对话

```
帮我把这个修复验证一下
```
→ 触发 `loop-verifier`：实际跑测试、做回退测试、列出 NOT RUN。

```
这个 CI 失败该修吗
```
→ 触发 `ci-triage`：先分类，只有 regression 才动手，env 类绝不改代码。

---

## 阶段 3 · 巩固

### 目标

事件接上、循环跑起来、**经验自己积累并转正为规则**。对应等级 **L3：无人值守**。

### 前置

阶段 2 必须完成，**且人工确认过 triage 准确率 > 70%**。

### 该用哪些技能

| 技能 | 什么时候用 | 它做什么 |
|---|---|---|
| `harness-consolidate` | **主技能** | 走完 7 项机械判据 + 提醒人工确认 |
| `harness-loop` | 有事件进来时 | 顶层编排：退出检查→约束→路由→预算→派发→闸门→写状态 |
| `lesson-harvest` | 每天夜里 | 扫当天 commit，把教训写进 LESSONS.md |
| `event-router` | 收到事件 | 事件 → 阶段 → 技能 → 闸门 |
| `signal-gatekeeper` | 高噪声信号源前 | 廉价模型判断相关性，不相关直接丢弃 |
| `loop-budget` | 每轮开始和结束 | 80% 降级 report-only，100% 立即退出 |
| `post-merge-cleanup` | 合并之后 | 扫技术债，不改变行为 |
| `release-drafter` | 打标签/发布前 | 只起草，绝不发布 |

### 该敲哪些命令

**第 1 步：补齐阶段 3 产物**

```bash
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 3
```

补上 4 个技能 + 8 个事件接线 workflow 到 `.github/workflows/`。

**第 2 步：配置事件接线**（人工）

| 项 | 值 |
|---|---|
| Secret | `LOOP_BOT_TOKEN`（独立机器人账号） |
| 权限 | `issues: write`、`pull_requests: write`（仅 comment/label）、`contents: read` |
| **禁止** | **不授予 merge** |

**第 3 步：路由验证**（改完 workflow 先本地测）

```bash
node scripts/event-router.mjs --list
node scripts/event-router.mjs --event check_suite.completed:failure --item pr-7
```

**第 4 步：跑通一个完整周期**

这是阶段 3 的核心动作：**事件 → 路由 → 派发 → 验证 → 闸门 → 状态写入**，全链路走一遍。

**第 5 步：确认运行记录落盘**

```bash
grep -c '"run_id"' loop-run-log.md   # 应 > 0
```

**第 6 步：跑夜审，看教训是否入库**

```bash
# 手动触发一次（或等凌晨 3 点的定时）
# 在对话里说："总结一下昨天的 commit 有什么教训"
# → 触发 lesson-harvest
```

检查 `LESSONS.md` 是否出现 `Seen N× (日期)` 形式的条目。

**第 7 步：验证经验→规则棘轮**

同一条教训在 **3 个不同日期**出现后：

1. 转正进 `loop-constraints.md`
2. 在 `LESSONS.md` 的 `## Promoted to hard rules` 表记录：规则、日期、曾出现次数、证据、现在的位置
3. 确认 `loop-verifier` 的检查项包含它

**第 8 步：校验**

```bash
node scripts/harness-stage.mjs /path/to/repo --stage 3 --require
# 退出码 0 = 7 项机械判据全过
```

### 日常运行（阶段 3 之后）

| 周期 | 命令/动作 |
|---|---|
| 每天 | 夜审自动跑（`lesson-harvest.yml` 凌晨 3 点）；读 `STATE.md` |
| 每周 | 读 `loop-run-log.md` 的指标表；确认**升级率非 0** |
| 每月 | 检查有没有教训该转正但没转正 |
| 每季度 | **做一次消融测试**：移除一个 harness 组件，跑基准任务，看分数是否下降 |

季度消融：

```bash
# 1. 取质量快照（记下当前指标）
# 2. 移除一个组件（例如临时禁用某个技能）
# 3. 跑基准任务
# 4. 对比：分数没掉说明该组件冗余，可以删；掉了就恢复
```

**为什么必须做**：每个 harness 组件都编码了"模型做不到什么"的假设，模型变强后假设会过期。不检查就会积累冗余约束——只消耗上下文，不提升可靠性。

---

## 全阶段通用：出问题时怎么诊断

```bash
# 1. 现在哪一阶段、差什么
node scripts/harness-stage.mjs /path/to/repo

# 2. 就绪度评分与改进建议
node scripts/loop-audit.mjs /path/to/repo --suggest

# 3. 事件该路由到哪
node scripts/event-router.mjs --event <事件名> --item <id>

# 4. 这次改动能不能过闸门
node scripts/gate-check.mjs --item <id> --phase gate --diff-files <文件> --verdict approve

# 5. 还能重试吗
node scripts/ledger-check.mjs --ledger loop-ledger.json

# 6. 框架自身是否正常
node scripts/test.mjs
```

---

## 一页速查

### 命令

```bash
# 准备（一次）
node scripts/install-skills.mjs --scope user

# 阶段 1
node scripts/harness-stage.mjs <repo>
node scripts/harness-stage.mjs <repo> --upgrade --stage 1
bash init.sh
node scripts/harness-stage.mjs <repo> --stage 1 --require

# 阶段 2
node scripts/harness-stage.mjs <repo> --upgrade --stage 2
node scripts/gate-check.mjs --item <id> --phase gate --diff-files <f> --verdict approve --red-check pass
node scripts/ledger-check.mjs --ledger loop-ledger.json
node scripts/harness-stage.mjs <repo> --stage 2 --require

# 阶段 3
node scripts/harness-stage.mjs <repo> --upgrade --stage 3
node scripts/event-router.mjs --list
node scripts/harness-stage.mjs <repo> --stage 3 --require
```

### 技能

| 阶段 | 主技能 | 配套技能 |
|---|---|---|
| 1 | `/harness-init` | `harness-bootstrap` |
| 2 | `/harness-strengthen` | `loop-constraints`、`loop-verifier`、`minimal-fix`、`loop-guard` |
| 3 | `/harness-consolidate` | `harness-loop`、`lesson-harvest`、`event-router`、`signal-gatekeeper`、`loop-budget`、`post-merge-cleanup`、`release-drafter` |
| 诊断 | — | `ci-triage`、`issue-triage`、`pr-review-triage` |

### 退出码速查

| 码 | 含义 |
|---|---|
| `0` | 成功 / 已达成 / 可继续 |
| `1` | 参数错误或文件不存在 |
| `2` | 需升级给人 / 阶段未达成 / 熔断触发 |
| `3` | 立即退出（kill switch 或预算超限） |

---

## 三个最容易踩的坑

**1. 装完技能没重启会话。** 技能在会话启动时扫描，不重启 `/harness-init` 调不出来。

**2. 阶段 1 只看文件存在，不看内容。** `init.sh` 留着占位符、拒绝列表留着模板——文件都在但 harness 不起作用。判据 8 专门抓这个，`--require` 会失败。

**3. 跳过阶段 2 的三项人工确认直接进阶段 3。** 回退测试执行、NOT RUN 使用、triage 准确率都是人工确认项，脚本不判定，容易被跳过。但误报率高时，自动修复会在错误目标上烧钱，并消耗人对系统的信任——信任一旦消耗，团队会静音机器人，那是所有升级机制失效的终点。
