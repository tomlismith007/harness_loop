# 独立审查报告 — loop-harness / skills 工程化能力

- **审查日期**：2026-10-14
- **审查对象**：仓库 `harness_loop`（loop-harness 技能包源仓库），HEAD = `d7d049d` + 1 处未提交改动
- **审查重点**：GitHub issue/PR 真实工作流、技能的工程化能力、各阶段边界设计、工程严谨化
- **审查人**：独立会话，未参与本仓库开发

---

## 0. 方法与声明

### 0.1 独立性声明

本次审查**刻意未阅读 `REVIEW-2026-10-14.md`**（仓库中已存在的审查报告），以避免锚定与确认偏误。

执行过程中一次全仓 `grep` 的结果意外带出了该报告的一行（内容涉及 `structuredText` 的围栏处理）。该行已被丢弃，未用于任何判断，后续检索已排除该文件。

本报告中所有结论均由以下方式独立得出：

- 通读全部 `scripts/`、`skills/`、`examples/`、`templates/`、`docs/`、根级配置文件
- 实际执行 `node scripts/test.mjs`、`node scripts/loop-audit.mjs`
- 交叉比对代码实际行为与文档声明
- 对安全机制做威胁建模（失效方向是否朝安全侧）

### 0.2 验证命令与输出

```
$ node scripts/test.mjs
Passed: 497   Failed: 1

Failures:
  - 无 verifier 不得授予 L2 — got L2
============================================================
Exited with code 1
```

```
$ git status --short
 M scripts/loop-audit.mjs
?? REVIEW-2026-10-14.md
```

---

## 1. 总评

### 1.1 结论

**思想层成熟，执行层存在系统性裂缝。**

框架的核心主张是"能机械判定的就机械判定，不能的显式降级为人工"。这个方法论是对的，且在 `harness-stage.mjs` 中被正确执行了。

但审查发现一个贯穿全仓库的病症：

> **大量关键机制仍然只是散文（prose），没有任何代码读取它们；而测试套件通过"断言文件里写着这些字"来伪装成已实现。**

这与框架自己在 `STATE.md` Post-Run Critique 中批评的"阶段 2 判据曾用 grep 检查字样，导致永远自动变绿"是**同一个 bug 换了位置复发**。修复工作停在了 `harness-stage.mjs`，同样的反模式在 `patterns/registry.yaml`、`loop-constraints.md`、`loop-budget.md`、阶段判据计数上完整存活。

### 1.2 分项评级

| 维度 | 评级 | 依据 |
|---|---|---|
| 概念设计（事件脊、等级、阶段） | **强** | 真实生产教训支撑，非空想 |
| 安全边界设计 | **中** | 意图正确，但真相源分裂导致收紧能力失效 |
| 机制工程化（prose → executable） | **弱** | 见 P0-3 / P0-4，多处配置无消费者 |
| GitHub 接线可运行性 | **弱** | 见 P0-2，端到端链路在 runner 边界断裂 |
| 文档一致性 | **中** | 阶段判据计数在 7 个文件中不一致 |
| 验证严谨性 | **中** | 测试有 497 项断言，但存在文本断言冒充行为断言 |
| 失效方向设计 | **中** | 多数 fail-closed，但 `gate-check` 的 `--phase` 是 fail-open |

---

## 2. P0 — 阻断级

### P0-1｜未提交的改动正在拆掉框架核心不变量，且当前测试为红

**位置**：`scripts/loop-audit.mjs:258`（工作区未提交）

```diff
-  else if (score >= LEVEL_THRESHOLDS.L2 && triagePresent && verifierPresent) level = 'L2';
+  else if (score >= LEVEL_THRESHOLDS.L2 && triagePresent) level = 'L2';
```

两行之上的注释（`:255-256`）仍然写着：

> `// L2 的定义是"由独立 verifier 验证的辅助修复"——没有 verifier 就不成立。`
> `// 没有 verifier 却给 L2，等于批准自我验证，与 docs/03 的规则冲突。`

**实测结果**：

```
Passed: 497   Failed: 1
Failures:
  - 无 verifier 不得授予 L2 — got L2
```

**冲突清单**（四处独立声明被违反）：

| 来源 | 声明 |
|---|---|
| `docs/03-gates-and-levels.md:195` | `L2: score >= 58 且 triage 技能存在 且 verifier 存在` |
| `docs/03-gates-and-levels.md:200` | 「**L2 也要求 verifier 存在。这一条不是可选优化**」 |
| `feature_list.json` → `setup-002`.notes | 「L2 永远不可达（level=L2 要求 verifierPresent）」 |
| commit `d7d049d` 标题 | `fix: ... close the stage-2 false green` |

**额外问题：制造了自相矛盾的报告。**

`loop-audit.mjs:263` 的 finding 逻辑独立于 level 赋值：

```js
if (score >= LEVEL_THRESHOLDS.L2 && triagePresent && !verifierPresent) {
  findings.push('Capped at L1: no verifier. ...');
}
```

改动后，工具会**一边输出 `Level: L2`，一边在 Findings 里说 "Capped at L1"**。这比单纯放水更糟——它让审计输出本身失去可信度。

**建议**：

```bash
git checkout scripts/loop-audit.mjs
```

若确为有意变更，则 `docs/03`、`feature_list.json`、`docs/12-stage-commands.md` 必须同步，且需先回答：框架最贵的一条主张（写代码的不能验证自己写的代码）是否放弃？**不建议放弃。**

**衍生流程问题**：该改动未被 `init.sh` 拦下。说明当前无 pre-commit / pre-push 钩子，唯一防线是"记得手动跑一次"。

---

### P0-2｜GitHub 接线：work item 写进了虚空

**位置**：全部 6 个事件 workflow

```bash
mkdir -p .loop/queue
cat > ".loop/queue/${ITEM}.json" <<EOF
{ "id": "${ITEM}", "event": "...", "phase": "...", ... }
EOF
```

job 结束，文件消失。

**GitHub Actions 的 runner 文件系统是临时的。** 全部 workflow 中：

- ❌ 无 `actions/upload-artifact`
- ❌ 无 commit / push
- ❌ 无 `repository_dispatch`
- ❌ 无 issue / PR 评论（仅 `merge-gate.yml` 发评论）

而 `examples/github-actions/README.md:63` 把这个列为**推荐的第一种对接方式**：

> | **Work item 文件** | workflow 写 `.loop/queue/<id>.json`，agent 平台轮询该目录 |
>
> **推荐从方式一开始**：最简单、可离线调试、不依赖平台特性。

**推荐路径是断的。** 事件来了 → 路由跑了 → work item 蒸发了 → agent 平台永远轮询不到东西。整个"事件脊"在 runner 边界处终止。

**下游连锁**：

1. `daily-triage.yml:104` 与 `lesson-harvest.yml:129` 执行 `cat >> loop-run-log.md`，同样写进虚空 → 运行日志永远为空。
2. `loop-audit.mjs:114-168 detectLoopActivity()` 要求 `## Log` 章节含真实 `run_id` 才给 `loopActivity` 加分。
3. `LEVEL_THRESHOLDS.L3 = 78`，而 L3 还额外要求 `l3Ready = costReady && hasRealActivity`。

**结论：框架自己的 L3 判据，无法通过框架自己的示例达成。** 这是自相悖的，也意味着 `STATE.md` Watch List 里"第一周目标：只报告，积累可靠的 triage 记录"永远无法达成。

**建议**（三选一，倾向第 3 个）：

1. 每个写 work item 的 job 加 `actions/upload-artifact@v4` + 合理保留天数；
2. 改用 `repository_dispatch` 推给 agent 平台；
3. **改为发结构化 issue / PR 评论**——这是唯一同时具备持久性、人类可见性、可审计性的载体，且正好是 README 里列的方式二。

---

### P0-3｜`patterns/registry.yaml` 没有任何代码消费

**文件头声明**（`patterns/registry.yaml:2`）：

> `# Consumed by scripts/loop-audit.mjs, docs, and tooling.`

**实际情况**（全仓 grep `registry.yaml`）：

| 位置 | 行为 |
|---|---|
| `loop-audit.mjs:230` | `has('patterns/registry.yaml')` — 仅检查**文件存在**，值 2 分 |
| `loop-audit.mjs:326` | SUGGESTIONS 文案 |
| `test.mjs:447, 920, 1041` | 正则读文本做断言 |

**没有任何脚本读取它的内容。**

### 具体后果

| registry 字段 | 实际来源 | 是否读 registry |
|---|---|---|
| `defaults.breaker.stagnation: 3` | `ledger-check.mjs:21 DEFAULT_BREAKER` | ❌ |
| `defaults.breaker.no_progress: 5` | `ledger-check.mjs:22` | ❌ |
| `defaults.breaker.max_iterations: 10` | `ledger-check.mjs:23` | ❌ |
| `defaults.max_attempts: 3` | `gate-check.mjs:23 DEFAULTS` | ❌ |
| `defaults.max_files_per_fix: 5` | `gate-check.mjs:21` | ❌ |
| `defaults.budget_report_only_pct: 80` | `gate-check.mjs:24` | ❌ |
| `patterns[].cost.suggested_daily_cap` | 无 | ❌ |
| `patterns[].human_gates` | 无 | ❌ |
| `priority:` 优先级表 | 无 | ❌ |

`ledger-check.mjs` 的阈值只能从 CLI 参数传入（`:224-227`），**没有任何代码从 registry 推导**。

### 测试如何"验证"它

`test.mjs:1053`：

```js
ok('registry 熔断阈值 3/5/10',
  /stagnation:\s*3/.test(registryText) && /no_progress:\s*5/.test(registryText) && /max_iterations:\s*10/.test(registryText));
```

**这个测试断言 YAML 里写着这些数字——不管有没有任何代码读它们。** 它证明"文字被抄下来了"，不证明"机制生效了"。

这与 `harness-stage.mjs` 刚刚修掉的"grep 判据假阳性"是同一个 bug，出现在另一个文件，且**未被 STATE.md 的 Post-Run Critique 识别为复发**。

**建议**：

1. `gate-check.mjs` / `ledger-check.mjs` 增加 `--registry <path>`，从 YAML 读 `defaults` 作为默认值来源，CLI 参数可覆盖；
2. 增加最小 YAML 解析器（仓库承诺"零依赖 Node 内置模块"，不应引入 `js-yaml`；`stagnation: 3` 这类标量用正则提取足够）；
3. **测试改为行为断言**：

   ```
   改 registry.yaml 的 stagnation 为 1 → ledger-check 必须在 1 次重复后退出码 2
   改 max_attempts 为 1 → gate-check 在 attempts=1 时 escalate
   ```

---

### P0-4｜拒绝列表：真相源分裂，仓库自定义规则被静默忽略

**这是整个安全机制的单点失效。**

三处相关定义：

| 位置 | 角色 |
|---|---|
| `loop-constraints.md:26-41` | 人类读的拒绝列表 + 明确的收紧规则 |
| `loop-constraints.md:98-102` | `## Repo-Specific（在此添加本仓库特有的拒绝路径）` |
| `scripts/lib/common.mjs:18-31` | 代码里硬编码的 13 条 `DENYLIST_PATTERNS` |

`loop-constraints.md:26-41` 明文规定：

> ```
> ## Paths（拒绝列表 — 触及即升级，绝不编辑）
> ...
> ```
> 命中任一模式的路径：**停止编辑，写升级条目，交给人**。

`loop-constraints.md:98` 规定：

> `<!-- 仓库特定规则写在下方。上面的默认集可以收紧，不可以放宽。 -->`

**但 `gate-check.mjs:95` 只调用 `matchesDenylist()`，后者只读 `DENYLIST_PATTERNS` 常量（`common.mjs:365`）。**

### 后果

一位维护者严格按文档指引，在 `## Repo-Specific` 加了 `infra/prod/**`：

- `loop-constraints.md` 生效 → agent 读文档时会避开
- `gate-check.mjs` → **不认这条路径**
- `minimal-fix` 会修改 `infra/prod/*`
- `gate-check` 报告 `denylist_hits: []`，`decision: proceed`

**文档说 A，代码做 B，且 B 是危险的那一侧。**

### 同类问题（散文配置 vs 可执行配置）

`loop-constraints.md:52` 「每个 work item 最多 3 次修复尝试」→ 实际是 `gate-check.mjs:23` 的 `maxAttempts: 3`。
`loop-budget.md` 的每日上限 → 无任何代码读取（见 P2-17）。

**建议**：

1. `matchesDenylist()` 增加一个从 `loop-constraints.md` 的 `## Paths` 代码块解析来源，作为**第一优先级**；JS 常量降级为 fallback（当文件不存在时）。
2. `harness-stage.mjs:141-179 denylistLocalized()` 已经证明这段是可解析的（按 `## Paths` 分割 → 取首个 ``` 代码块 → 去注释行 → 与模板做集合差集），逻辑可直接复用。
3. **回退测试**（红检）：

   ```
   往 loop-constraints.md 的 Paths 块加一条 `infra/prod/**`
   → gate-check --diff-files infra/prod/main.tf 必须返回 escalate
   → 把该条删掉 → 必须返回 proceed
   ```

---

## 3. P1 — 高危

### P1-5｜`gate-check.mjs` 在关键参数缺失时失败放行（fail-open）

**位置**：`scripts/gate-check.mjs`

四个最强的闸门全部条件于 `phase === 'gate'`：

| 行 | 闸门 | 条件 |
|---|---|---|
| `:156` | head-commit TOCTOU | `phase === 'gate' && reviewedSha && headSha && reviewedSha !== headSha` |
| `:182` | red-check not-run | `redCheck === 'not-run' && phase === 'gate'` |
| `:219` | verdict 必须存在 | `verdict === 'none' && phase === 'gate'` |

同时：

- `gate-check.mjs:45` → `phase = null`（默认值）
- `gate-check.mjs:257` → `--phase` 列出 `intake|review|fix|verify|gate|post-merge|release`
- **但代码从不校验 `phase` 是否在该枚举内**

**后果**：`--phase gtae`（拼错）或干脆遗漏 `--phase`，会**一次性关闭** TOCTOU 绑定、red-check、verdict-必需三道闸门，直接返回 `proceed`。

在一个原则是「失效方向必须朝安全侧」的系统里，这是标准 fail-open。

### 冒烟测试恰好走在这条路径上

`init.sh:27`：

```bash
node scripts/gate-check.mjs --item pr-1 --diff-files a.ts --verdict approve > /dev/null && echo "  gate-check    OK"
```

`.github/workflows/self-check.yml:43`：同样一行。

**两者都没有 `--phase`，都断言退出码 0。** 唯一的 CLI 冒烟测试验证的是"闸门全关时能通过"。

**建议**：

1. `phase` 为 `null` 或不在枚举内 → `fail()` 退出 1，报明确错误；
2. `init.sh` 与 `self-check.yml` 的冒烟测试改为覆盖 gate 路径，并**同时断言 escalate 分支**：
   ```
   --phase gate --verdict none          → 必须 exit 2
   --phase gate --verdict approve       → 必须 exit 0
   --phase gtae --verdict approve       → 必须 exit 1（参数错误）
   ```

---

### P1-6｜多循环互斥锁的键不在同一命名空间 → 永不触发

**位置**：`scripts/event-router.mjs:192-199`

```js
if (opts.locks && opts.item) {
  const holder = opts.locks.find((l) => l.acting_on === opts.item && l.item !== opts.item);
  ...
}
```

**两个不同语义的标识符用 `===` 比较：**

| 标识符 | 定义 | 来源 |
|---|---|---|
| `l.acting_on` | `<branch\|pr-id>` | `STATE.md` Active 表第 4 列（`LOOP.md:99`） |
| `opts.item` | work item id | CLI `--item`，示例传 `pr-123` |

**更关键的是各 workflow 传给 `concurrency.group` 的键本身就不同：**

| workflow | concurrency group |
|---|---|
| `pr-review.yml:19` | `loop-pr-<PR 号>` |
| `merge-gate.yml:16` | `loop-gate-<PR 号>` |
| `ci-sweeper.yml:19` | `loop-ci-<branch 名>` |

`STATE.md` 的**单一** `acting_on` 列不可能同时是 `pr-123` 和 `main`。

### 后果

`LOOP.md:100` 与 `skills/pr-review-triage/SKILL.md:69` 白纸黑字写着的这条规则——

> 「若 CI Sweeper 已在处理某分支，PR Review Triage 在报告中标注但不派发修复」
> 「不在同一小时内再修 CI Sweeper 正在修的分支」

——**恰好是这个锁唯一应该起作用、也唯一不可能起作用的场景。**

### 附带的脆弱性

`event-router.mjs:148-158` 按**列下标**取值（`cells[3]`），无表头名校验。任何调整表头顺序都会静默失效。

**建议**：

1. 锁键统一为 **branch name**（唯一的全局标识空间）；
2. CLI 拆成 `--item`（work item id）与 `--target`（锁键 = branch）；
3. `readLocks` 按**表头名**匹配列，而不是下标；
4. 保留 `concurrency` group 作为第一道互斥，但 key 也统一到 branch。

---

### P1-7｜CI Sweeper 把 `workflow_run` 失败错标成 `check_suite` 失败

**位置**：`examples/github-actions/ci-sweeper.yml:46-49`

```yaml
- name: Route
  run: |
    node scripts/event-router.mjs \
      --event check_suite.completed:failure \   # ← 硬编码，不管来的是哪个事件
      --item "${{ steps.item.outputs.item }}" \
      --state STATE.md > route.json
```

workflow 同时订阅了两个事件（`:7-11`）：`workflow_run` 与 `check_suite`。

**而两条路由的闸门集不同**（`event-router.mjs:103-123`）：

```js
'check_suite.completed:failure': gates: ['denylist','max-attempts','scope','verification']
'workflow_run.completed:failure': gates: ['denylist','max-attempts','scope']   // 无 verification
```

**后果**：

1. `workflow_run.completed:failure` 这条路由**永远不可达**；
2. `workflow_run` 的失败被套用了 `check_suite` 的闸门集（多一个 `verification`，少一个正确的分类）。

适配层消灭了路由器本来具备的区分能力。

### 附带的两个静默失效

**(a) `workflows: ["CI"]` 字符串过滤**

```yaml
workflow_run:
  workflows: ["CI"]
```

CI workflow 一旦改名，**CI Sweeper 静默停摆，零告警**。`loop-audit` 的"真实活动"检测也发现不了（只会显示活动变少，不会定位原因）。

**(b) concurrency group 塌陷**

```yaml
group: loop-ci-${{ github.event.workflow_run.head_branch || github.event.check_suite.head_branch }}
```

`head_branch` 为 `null` 时（PR 触发的 workflow_run 常见），group 退化为 `loop-ci-`，**所有这类运行被压进同一条全局队列**，形成不必要的串行瓶颈。

---

### P1-8｜Merge Gate 的产物是常量，且该 check 永远为绿

**位置**：`examples/github-actions/merge-gate.yml`

```yaml
node scripts/gate-check.mjs \
  --item pr-${{ github.event.pull_request.number }} \
  --phase gate \
  --diff-files @changed.txt \
  --verdict none \            # ← 永远不会有 verifier 产出 verdict
  --budget-pct "..." > gate.json || true
```

`gate-check.mjs:219-229`：`verdict === 'none' && phase === 'gate'` → **恒定 escalate**。

**所以这个 workflow 在每一次 `ready_for_review` 事件上都会给 PR 留一条评论：**

> | Decision | `escalate` |
> | Gate | `verification` |
>
> **Reason:** no verifier verdict present at the gate phase

**而最后一步 `:99-108`：**

```bash
if [ "$DECISION" = "escalate" ]; then
  echo "::warning::Gate escalated — human decision required"   # 仅 warning，不 exit
fi
if [ "$DECISION" = "exit" ]; then
  exit 1
fi
```

**综合后果**：

1. 没有 verifier 能写入 verdict → 这个闸门没有"通过"这个状态，产物是常量；
2. escalate 也不让 check 变红 → **一个恒定输出常量、且恒定为绿的 check**。

这正是框架最反对的东西（"结构齐备 ≠ 跑过"、"假阳性防护"），它自己身上就有了。

**建议**：

1. 明确 merge-gate 的定位：要么它只做**收集并报告**（那就别叫 gate-check 语义），要么补上 verdict 写入通道（verifier 产出一份 `.loop/verdicts/<item>.json`，gate-check 读它）；
2. escalate 时应让 check **变红**或至少产生 `::error::`，否则它在 CI 里的信号价值为零。

---

### P1-9｜`issues.labeled` 无标签过滤 → 机器人自触发环路

**位置**：`examples/github-actions/issue-intake.yml:6-8`、`scripts/event-router.mjs:36-42`

```yaml
on:
  issues:
    types: [opened, reopened, labeled]
```

路由 `issues.labeled` → `next: 're-evaluate priority and proposed labels'`。

### 闭环路径

```
agent 打标签（needs-info / needs-repro / needs-human）
    → issues.labeled 事件触发
        → issue-triage 重新评估
            → 可能再打标签
                → ...
```

仓库内至少三处会打标签：

| 位置 | 标签 |
|---|---|
| `skills/issue-triage/SKILL.md:86-90` | `area:*`、`needs-repro`、`needs-info` |
| `examples/github-actions/ci-sweeper.yml:85` | `needs-human` |

**没有任何守卫**：无 `if: github.event.label.name != 'loop-bot'`，无幂等键，无已处理集合。

### 同类：kill switch 的字符串匹配过于脆弱

`daily-triage.yml:32` 与 `lesson-harvest.yml:34`：

```bash
if grep -q 'loop-pause-all' STATE.md 2>/dev/null; then
```

**这会命中任何提到这个标志的说明文字。** 一个在 STATE.md 里写了「Kill switch: `loop-pause-all`，当前未生效」的仓库，会被**永久静默停摆**。

方向上是 fail-closed（不会误动作），但代价是：loop 不跑，且没有任何地方告诉人为什么。

**建议**：

1. `issues` 事件加标签过滤：`if: github.event.label.name != 'loop-bot'`（约定机器人统一前缀）；
2. kill switch 改为结构化标志查找，例如 STATE.md 中 `## Kill Switch` 区块下的一行 `active: true|false`，而不是全文 grep；
3. 停摆时写一条 `::warning::` 并在 STATE.md 留痕，让人能发现。

---

## 4. P2 — 工程严谨性

### 4.1 文档与代码漂移

#### 阶段判据计数在 7 个文件中不一致

| 文件 | 行 | 声明 | 实际代码 |
|---|---|---|---|
| `AGENTS.md` | 94 | 阶段 2 = **9 机械 + 1 人工** | `checkStage2` = **6 机械 + 3 人工** |
| `LOOP.md` | 12 | 9 机械 + 1 人工 | 同上 |
| `README.md` | 75 | 9 机械 + 1 人工 | 同上 |
| `docs/10-how-to-use.md` | 84 | **6 机械 + 3 人工** ✅ | 同上 |
| `docs/10-how-to-use.md` | 183 | **9 机械 + triage 准确率** ❌ 内部矛盾 | 同上 |
| `docs/11-three-stages.md` | 26 | 6 机械 + 3 人工 ✅ | 同上 |
| `patterns/registry.yaml` | 207-209 | `mechanical_checks: 6, human_checks: 3` ✅ | 同上 |
| `skills/harness-strengthen/SKILL.md` | 29 | 6 项机械 + 3 项人工 ✅ | 同上 |

**`docs/10-how-to-use.md` 在同一文件内自相矛盾**（`:84` vs `:183`）。

#### 阶段 3 计数也不一致

| 来源 | 声明 | 实际 |
|---|---|---|
| `AGENTS.md:95` / `LOOP.md:13` / `README.md:76` | 7 机械 + 2 人工 | `checkStage3` (`harness-stage.mjs:310-362`) = **7 机械 + 1 人工** |
| `skills/harness-consolidate/SKILL.md:29` | **9 项，7 机械 + 2 人工** | 同上（8 项，7+1） |

`checkStage3` 的机械项：`hasEventWiring`、`lessonsHasEntries`、runLog records、`costReady`、`hasMultiLoopCoordination`、`promoted`、score>=78 = 7 项。
人工项：完整周期确认 = 1 项。**缺失的第 2 项人工确认（"指标健康"）在代码中不存在。**

#### gate-check 文档注释失准

`gate-check.mjs:5` 写「按优先级检查**六类**闸门」，`:31-39` 的 docblock 列出 **7** 条，实际实现 **9** 条（pause / budget100 / denylist / max-attempts / budget80 / scope / head-commit / red-check / verification）。

`feature_list.json` → `loop-001`.notes 里记的是正确的 9 条顺序。**只有代码注释没跟上。**

### 4.2 死代码与失效机制

| # | 位置 | 问题 |
|---|---|---|
| 14 | `event-router.mjs:256` | `if (args.json \|\| true)` —— `--json` 标志是死的，永远走 JSON 分支 |
| 15 | `loop-audit.mjs:235-237` | `toolScope` / `stallDetection` / `escalation` 对 `corpus` 做**裸正则**。`common.mjs:331 structuredText()` 这个专治"关键词刷分"的工具**只被 `test.mjs` 使用，审计器完全没用**。往 STATE.md 段落里撒关键词就能拿分 |
| 16 | `ledger-check.mjs:106,122` | `no_progress: 5` 与 `max_iterations: 10` 在任何走 `gate-check` 的流程里**永远触发不了**——`gate-check.mjs:112` 在 `attempts >= 3` 就升级了。两道保险，一道先死，另一道够不着。`loop-guard/SKILL.md:62-63` 把它们列为正式阈值 |
| 17 | `merge-gate.yml:41-58`、`daily-triage.yml:43-60` | 预算解析脚本**逐字复制两份**；且 `Math.max(...caps)` 取**所有循环里的最大值**（500k）而非当前循环上限。Merge Gate 自己的上限是 100k，它会永远报告 ~0%，**低估 5 倍** |
| 18 | `daily-triage.yml:105`、`lesson-harvest.yml:130` | `tokens_estimate` 是**硬编码常量** 5000 / 40000。没有任何地方测真实 token 用量 → **预算系统从结构上就不可能发现超支** |
| 19 | `daily-triage.yml:62-67` | `PCT >= 100` 只打 `::error::`，**没有 `exit 1`**，后续步骤也不看它。100% 熔断不生效。`lesson-harvest.yml` 干脆没有预算检查 |

### 4.3 GitHub 接线工程缺陷

| # | 位置 | 问题 |
|---|---|---|
| 20 | `post-merge.yml:41-44` | 注释写「用 API 的合并列表而不是仅本地 git log，避免遗漏」，**代码用的就是本地 `git diff`**。且 `pull_request.base.sha` 对已合并 PR 不是可靠的 merge base；`pull_request: closed` 事件的默认 checkout ref 也不是 merge commit。这段 diff 很可能算出空结果 |
| 21 | `post-merge.yml:13`、`release-draft.yml:14` | 声明 `issues: write` 但从不写 issue。与 `README.md:36` 「每个 workflow 显式声明 permissions，不用默认值」的最小权限意图相悖 |
| 22 | 全部 workflow | 无 `timeout-minutes`（挂死会烧 Actions 配额）；无 fork PR 处理（来自 fork 的 `pull_request` 事件中 `secrets.GITHUB_TOKEN` 只读，`gh pr comment` 会失败，而 `pr-review.yml:26` 只挡了 `github.actor != 'loop-bot'`）；无 `issue_comment` 触发（但 `LOOP.md:108` 的调度配置写了 `on: [issues, issue_comment]`）；无 `@loop-bot` mention 入口 |
| 23 | `.gitignore` | 不含 `.loop/`。P0-2 修复后若改为 commit 方式，需明确 `.loop/` 的提交策略 |

### 4.4 测试套件自身的严谨性

| # | 位置 | 问题 |
|---|---|---|
| 24 | `test.mjs:535-553` | 章节 14「GitHub Actions 接线」只做结构检查：`on:` 存在、`permissions:` 存在、`concurrency:` 存在、不含 `gh pr merge`、无硬编码凭据。**不检查 yml 里调用的 route 是否在 `ROUTES` 中、不检查 work item 是否被持久化、不检查权限是否最小** |
| 25 | `test.mjs` | 章节顺序错乱：16 → 16b → 18 → 19 → 20 → **17**。`16` 与 `17` 之间插了 `16b` |
| 26 | `test.mjs:1043-1048` | 章节 17 只检查 **registry → ROUTES 单向**。**不检查 LOOP.md → ROUTES**——而 `LOOP.md:3` 自称「调度与路由的**唯一真相源**」，`event-router.mjs:17` 自称「与 LOOP.md 保持一致」。这个"一致性"没有任何测试 |
| 27 | `common.mjs:331-351` | `structuredText()` 的 `inFence` 分支（`:341-343`）把围栏内代码行**照 push**，而它正是文档里的反作弊工具——模板里的示例代码块会被算作"结构化证据" |
| 28 | 运行时 | Windows 下测试输出中文**全部乱码**（`拒绝列表匹配` → `�?`）。`init.sh` 是"标准启动与验证路径"，但中文用户在 Windows 上读不懂自己的验证结果。`process.stdout.write` 未强制 UTF-8 |

### 4.5 事件表覆盖度

| 缺口 | 影响 |
|---|---|
| `schedule:daily` | `LOOP.md:39` 声明了该事件 → `issue-triage` + `pr-review-triage`。`ROUTES` 中**不存在**。每日兜底循环无法被路由 |
| `issues.labeled:needs-info` vs `issues.labeled` | `LOOP.md:31` 声明带标签过滤，`event-router.mjs:36` 是无过滤的泛化版。命名漂移 |
| `issue_comment.created` | `LOOP.md:108` 的调度配置引用了 `issue_comment`，`ROUTES` 中无。`@loop-bot` mention 是最常见的触发方式，完全缺失 |
| `check_run.completed` | GitHub Actions 的主流 webhook 是 `check_run` 与 `workflow_run`，`ROUTES` 只有 `check_suite` |
| `pull_request.review_requested` | 审查请求是重要的分诊信号，未覆盖 |
| `pull_request.edited` | draft → ready 的转换有专门事件，但 `pr-review.yml:8` 未订阅 |

### 4.6 阶段判据的设计弱点

`harness-stage.mjs:166-171` 的 `denylistLocalized()` 判据是"拒绝列表必须与模板有实质差异（增删了路径）"。

- **优点**：它确实排除了"只复制模板"的情况，是全仓库最高明的一段判据设计（`harness-stage.mjs:135-139` 的注释解释了为什么不能 grep 字样）。
- **弱点**：一条维护者**删掉一条本仓库用不到、但无害的模板路径**（例如没有 k8s 就删 `k8s/production/**`）就能通过。**证据强度弱于它的字面声称**——它证明的是"有人编辑过"，不是"本地化是认真的"。
- **已知豁免**：`STATE.md:37-38` 自己承认「本仓库是技能**源仓库**而非消费者，阶段判据（尤其"拒绝列表已本地化"）对它天然不适用」，并建议「阶段判据在源仓库上运行时，应识别'这是源仓库'并跳过消费者专属判据」。**该建议尚未实现。**

---

## 5. 做得好的地方

以下设计应当保留，重构中不要弄丢：

1. **`skills/loop-verifier/SKILL.md` 的 red check 与 NOT RUN 三态**

   尤其 `:73`：

   > 「一个永远通过的测试和一个有效的测试，在外观上无法区分。回退测试是唯一能机械区分二者的手段。」

   这是真正的工程洞察，不是口号。它把"测试质量"这个通常无法自动化的判断，转化成了一个可执行的机械步骤。

2. **`harness-stage.mjs:141-179 denylistLocalized()`**

   不再 grep「有没有 .env」，而是**与模板原文做集合差集**来判断是否真的本地化过。注释（`:135-139`）解释了为什么 naive grep 不行。这是全仓库判据设计的范本。

3. **无法机械判定的项显式降级为人工确认**

   `harness-stage.mjs:293,298,302`（阶段 2）与 `:359`（阶段 3）传入 `ok = null`，配合 `:371-374 stageComplete()` 的 `filter(c => !c.human)`，人工项**不参与**阶段达成的计算。方向完全正确——宁可让用户自己确认，也不给一个能自动绿的代理指标。

4. **`loop-audit.mjs:114-168 detectLoopActivity()`**

   显式区分"结构性就绪"与"真跑过"，并针对 `Last run: never`、围栏内的格式示例 JSON、占位符表格行做了假阳性防护（`test.mjs:663-685` 有对应测试）。这是"结构性检查 ≠ 行为证据"这一原则的正确落地。

5. **`gate-check.mjs:154-192` 的 head-commit TOCTOU 绑定**

   注释（`:155`）写清了威胁模型：

   > 「审查期间若有人又 push，head 变了，合并必须失败——否则未审查的代码会进 main。」
   > 「这比'策略上要求重新审查'强——策略靠自觉，`--match-head-commit` 靠 git 本身拒绝。」

   这是正确的工程直觉：**用机制而非纪律来保证约束**。

6. **`skills/loop-verifier/SKILL.md:165-171` 对自我验证失效的解释**

   > 「写代码的模型给自己打分系统性偏高。这不是诚实问题，是生成模型的性质。」
   > 「模型是自己输出的最佳辩护律师。」

   对 LLM 场景下的验证失效做了准确的根因分析，并由此推出对抗式验证、`/goal` 独立会话等具体机制。**这是整个框架区别于通用 CI 框架的地方。**

7. **`patterns/registry.yaml` 的 `defaults` 设计本身是对的**

   问题只在于没有接上（见 P0-3），设计意图无需推翻。

---

## 6. 建议的修复顺序

| 序 | 动作 | 理由 |
|---|---|---|
| **0** | `git checkout scripts/loop-audit.mjs` | 当前红，且拆的是核心不变量 |
| **0** | 加 pre-commit 钩子跑 `node scripts/test.mjs` | 这次的红就是没钩子的代价 |
| **1** | work item 持久化（改用 issue / PR 评论） | 不修则整个事件脊不成立 |
| **1** | `matchesDenylist()` 读 `loop-constraints.md` | 安全机制单点失效 |
| **1** | `registry.yaml` 接进 `gate-check` / `ledger-check`，测试改行为断言 | 消除"配置看起来被强制、实际是装饰" |
| **2** | `gate-check` 校验 `phase` + fail-closed；修 `init.sh` / CI 冒烟测试路径 | 消除 fail-open |
| **2** | 锁键统一为 branch；`readLocks` 按表头取值 | 互斥机制目前不存在 |
| **2** | 修 merge-gate 恒定 escalate、ci-sweeper 事件错标、`issues.labeled` 守卫 | 消除环路与常量产物 |
| **3** | 统一阶段判据计数（6+3 / 7+1）到全部文件；修 gate-check docblock | 消除漂移 |
| **3** | `loop-audit` 改用 `structuredHas`；修 `structuredText` 围栏处理 | 消除关键词刷分 |
| **3** | 预算：抽公共脚本、按循环取上限、真实 token 计量、`>=100%` 真正 `exit 1` | 消除静默失效 |
| **4** | 补 `schedule:daily` / `issue_comment` / `check_run` 路由；LOOP.md↔ROUTES 双向一致性测试 | 覆盖真实 GitHub 工作流 |
| **4** | fork PR 处理、`timeout-minutes`、最小权限、`upload-artifact` 或评论投递 | 接线可运行性 |

---

## 7. 一条应写进硬约束的规则

P0-2 / P0-3 / P0-4 是**同一类病**，建议固化为规则：

> **任何被文档描述为"机械判定"的机制，必须有一个可执行的入口，其行为被测试断言。**
> **测试不得只断言配置文件里写着某个值——必须断言改动该值会改变行为。**

**当前违反示例**（可直接作为红检基线）：

| 断言类型 | 位置 | 问题 |
|---|---|---|
| 文本断言 | `test.mjs:1053` | 断言 `registry.yaml` 里写着 `stagnation: 3`，不管有没有代码读 |
| 文本断言 | `test.mjs:546` | 断言 workflow 里有 `permissions:`，不检查内容是否最小 |
| 文本断言 | `test.mjs:460-462` | 断言 `LOOP.md` 含「事件脊」「路由规则」「多循环协调」三个词 |
| 文本断言 | `test.mjs:1045` | 断言 registry 声明了事件数量 > 0 |

**正向示例**（同一个文件里已经存在，证明这不是能力问题）：

| 行为断言 | 位置 |
|---|---|
| 空目录 → 阶段 0；装配后 → 阶段 1 10/10；`--require` 退出码 0/2 | `test.mjs` 第 20 节 |
| 未注册事件 `registered=false` 且不自创流程 | 第 5 节 |
| 传拒绝列表路径 → `decision=escalate` | 第 6 节 |
| `reviewed-sha != head-sha` → 命中 head-commit 闸门 | 第 6 节 |
| `--layout` 改回硬编码 `.zcode` → 10 项断言失败 | 第 19 节（已做过红检） |
| `Last run: never` 不算活动 | 第 16b 节 |

**首次应用**：把 `test.mjs:1053` 改成行为断言——改 `registry.yaml` 的 `stagnation` 为 1，断言 `ledger-check` 在 1 次重复错误后即退出码 2。

---

## 8. 审查覆盖范围

| 已完整通读 | 仅结构性检查 |
|---|---|
| `AGENTS.md`、`LOOP.md`、`loop-constraints.md`、`loop-budget.md`、`STATE.md`、`feature_list.json`、`init.sh`、`.gitignore` | `docs/00-12`（按需查阅相关章节） |
| `scripts/` 全部 8 个 .mjs + `lib/common.mjs` | `README.md`、`progress.md`、`LESSONS.md`、`session-handoff.md` |
| `skills/` 全部 13 个 SKILL.md 中的 7 个 | 其余 6 个（triage/cleanup/draft/budget/constraints/gatekeeper） |
| `examples/github-actions/` 全部 8 个 yml + README | `patterns/registry.yaml` 全文已读 |
| `templates/` 目录结构 | `templates/` 各文件内容 |

**未执行**：任何真实项目上的接入验证（需接入软件项目后进行，对应 `feature_list.json` 中 `learn-002`、`loop-002` 两项 `not_started`）。