# Loop Harness Skills — 独立工程审查报告

> 审查时间：2026-10-14  
> 审查范围：`d:/harness_loop/skills/`（16 个技能）、`scripts/`（6 个脚本）、`examples/github-actions/`、`LOOP.md`、`loop-constraints.md`、`patterns/registry.yaml`  
> 方法论：完整阅读所有一手文件，不参考任何已有审查报告，独立判断

---

## 执行摘要

这是一套设计完整度相当高的 GitHub 工作流自动化框架。整体架构思路清晰，工程安全边界被认真对待。但在若干关键连接点上存在设计缺口，部分技能间的边界模糊会在真实执行中产生歧义，脚本层与文档层之间存在若干不一致需要对齐。

**优势：防错设计（而非假设）、maker/checker 分离、成本可观测性、阶段性建设约束**。  
**主要问题：事件去重、lock 语义精确性、PR comment 竞争、flake 隔离路径、post-merge-cleanup 触发冲突、release-drafter 的 verifier 角色混用**。

---

## 一、架构层审查

### 1.1 事件脊的完整性

路由表（`event-router.mjs` ↔ `LOOP.md` ↔ `patterns/registry.yaml`）三方基本对齐。机械路由 + 单一真相源的思路是对的——这防止了"各处各说各的"路由规则。

**缺口 1 — `workflow_run.completed:failure` 与 `check_suite.completed:failure` 重叠触发**

两个事件都会在 CI 失败时触发，且都路由到相同 phase（`fix`）。在同一次失败里，两个 work item 会同时进队列：
- `ci-sweeper.yml` 同时监听 `workflow_run` 和 `check_suite`
- 两者写入的 item-id 格式不同（前者从 `head_sha` 取，后者同样方式），但都针对同一 CI 失败

当前的 `acting_on` 锁机制保护的是同一 item-id，而两个触发产生的是不同 item-id。这意味着两个修复线程会并发跑，一个分支有两个 worktree 同时修同一个 CI 失败。

**建议**：`ci-sweeper.yml` 选一个事件，或在路由前先检查是否已有同 SHA + 同 branch 的在跑条目。

---

**缺口 2 — `issues.labeled` 是否每次 label 都进入 triage**

每次给 issue 打标签都会触发 intake 阶段，包括 agent 自己给 issue 打标签（L2 允许应用 `area:*` 和 `needs-repro`）。这会产生反馈环路：agent 打标签 → 触发 issue.labeled → 再次 triage。

当前没有机制排除 agent 自己的 label 操作。`pr-review.yml` 有 `if: github.actor != 'loop-bot'` 的保护，但 `issue-intake.yml` 没有等价的过滤。

**建议**：在 issue-intake 触发条件里加 `if: github.actor != 'loop-bot'`。

---

### 1.2 acting_on 锁的精确语义

`readLocks()` 实现中：
```javascript
const holder = opts.locks.find((l) => l.acting_on === opts.item && l.item !== opts.item);
```

这里的逻辑是：`l.item`（STATE.md 里某行的 work item）的 `acting_on` 列等于当前要处理的 item-id，且来自不同行。

**问题**：这个逻辑保护的是"同一目标有另一个条目在操作它"，但 `acting_on` 值是一个 branch 名或 pr-id，不是 item-id。当两个 work item 来自同一事件类型但不同目标时（两个不同 PR 各自的修复），锁不会误判——但这依赖于 STATE.md 被正确维护。

**实际问题**：STATE.md 是 Markdown 文件，解析依赖正则 + 列位置，极其脆弱。如果任何循环以非标准格式更新 STATE.md（多一列、少一列、列序不同），锁失效。这是整个多循环协调机制的单点脆弱性。

**建议**：`acting_on` 锁从 STATE.md Markdown 解析迁移到结构化格式（`.loop/locks.json`），降低解析失败导致锁穿透的风险。

---

### 1.3 三阶段建设模型的边界设计

阶段 1 → 2 → 3 的升级逻辑是整个框架最精密的工程部分。几个细节值得单独评价：

**好的设计**：
- 阶段 2 的人工判据（3项）不可被机械检查替代，且明确说明原因（"grep 分不清声明和行为"）。这是诚实的工程认知，阻止了"假绿"。
- `denylistLocalized()` 的检测方式（与模板做 diff）比"有没有那句话"精确一个层级。

**需要改进的地方**：

阶段 1 判据 8 检查 `init.sh` 是否含占位符，用的是几个正则 marker：
```javascript
/No package manifest detected/i,
/Replace this section/i,
/replace this line/i,
/No test script found/i,
```

但 `upgrade()` 函数生成的 init.sh 里实际写的是：
```
# ---- 替换为项目实际命令 ----
npm install
npm test
npm run build
```

这段内容不包含上面任何 marker，所以一个完全没有被替换的"刚生成的"init.sh 会通过判据 8。只有在用户用 `--commands` 指定命令时才会生成不同内容。**判据 8 可以被生成的模板本身通过**，这是一个假阳性路径。

**建议**：判据 8 应该额外检测 `npm install + npm test + npm run build` 这种"明显是 JS 默认命令而目标仓库不一定是 JS 项目"的组合。

---

## 二、核心工作流技能审查

### 2.1 harness-loop — 顶层编排

整体流程设计没有漏洞（8步，前置退出检查，后置强制状态写入）。

**问题 1 — "第 8 步：写状态"与"第 5 步：派发技能"之间的崩溃间隙**

如果技能派发（第 5 步）成功，但在写状态（第 8 步）之前 runner 崩溃，下一轮循环不知道上一轮做了什么，会重复派发同一个工作项。这不是技能文档的问题，而是系统假设 runner 是可靠的，但 GitHub Actions runner 并不保证。

当前没有幂等性保护——如果 `.loop/queue/{item}.json` 已存在，工作流还是会覆盖写入（实际上 issue-intake.yml 用了 `cat >` 覆盖）。

---

**问题 2 — "Post-Run Critique 必须产出一项具体调整"**

这条要求在 step 8 中，但它的产出不明确——调整写在哪里？写进 STATE.md？写进 LESSONS.md？没有指定存储目标的调整等于没有写，因为下轮循环不会读取它。

---

### 2.2 ci-triage — 分类逻辑

**最强设计之一**：flake/regression/env/config 四分类 + "env 类绝不改代码"的硬规则 + 明确解释为什么（"env 用代码修复会把随机失败变成隐藏 bug"）。理由与规则写在一起，执行者不需要靠信仰服从。

**缺口**：`flake 策略`部分说"加入 Watch，不自动修复"，但没有说 Watch 是什么，怎么进 Watch，Watch 里的条目由谁处理。技能是完整的，但 flake 的生命周期没有被封闭——进了 Watch 之后是 human 处理，还是下次同样的错误再次出现时被重新分类？

如果一个 flake 修复了（或随机消失了），Watch 里的条目不会被清理——当前清理规则只说"每轮清理已解决的失败条目"，但 flake 没有"解决"状态，只有"不再出现"。

---

### 2.3 minimal-fix — 修复执行者

**好的设计**：明确列出必须停止并升级的条件（6种），且原因有说服力。尤其是"需要改动测试来让 CI 通过 = 作弊"这条，不含糊。

**问题**：`Worktree 约定`部分：
```bash
git worktree add loop/<event>-<item>-attempt<N> -b loop/<event>-<item>-attempt<N>
```

这个命令在 Windows 下路径中的 `/` 会有问题（分支名里的 `/` 是合法的，但工作树路径里的 `/` 在 Windows 上是路径分隔符）。框架的运行脚本在 `.mjs` 里用了 `path.join`（跨平台），但这条 bash 命令直接写死了 POSIX 路径格式。这是跨平台一致性问题，对框架本身影响有限（GitHub Actions 跑在 Linux），但如果有人在 Windows 本地调试，会踩到。

---

### 2.4 loop-verifier — 独立验证者

**整体评价：最完整的技能**。结构性前提（独立实例、反向指令、不参与实现）、检查清单的三态区分（PASS/FAIL/NOT RUN）、红检（red check）流程、真机验证要求——都是实打实的工程要求，不是文档装饰。

**唯一争议点**：

> 若发现自己与执行者共享上下文 → 立即 ESCALATE_HUMAN，因为这次验证在结构上无效。

这条规则本身是对的，但谁来执行？模型发现自己与执行者共享上下文的能力依赖于上下文本身的可见性。在 sub-agent 架构中，verifier 可能根本不知道自己是否共享了上下文，因为上下文注入是平台侧做的。

这条规则要想真正有效，需要一个结构性保证（在不同 session/进程中运行），而不只是告诉 verifier"发现了就升级"。告诉 verifier 发现了就升级，但 verifier 本身可能发现不了。

**建议**：在 `harness-loop` 的派发逻辑中明确"verifier 必须在一个新的空上下文中启动"，而不只是在 verifier 的技能文档里说"发现了要升级"。这个保证应该在调用者侧，不在被调用者侧。

---

### 2.5 loop-guard — 熔断器

脚本实现（`ledger-check.mjs`）是本项目代码质量最高的部分。错误签名归一化逻辑（抹掉时间戳、地址、路径、行号）有真实工程考量，且附了具体例子说明为什么（`profile.ts:42` 和 `profile.ts:87` 应该是同一个错误）。

**小缺口**：

```javascript
let stagnationCount = 0;
let lastSignature = '';
if (attempts.length) {
  lastSignature = normalizeError(attempts[attempts.length - 1].error);
  if (lastSignature) {
    for (let i = attempts.length - 1; i >= 0; i--) {
      if (attempts[i].outcome !== 'failure') break;
      if (normalizeError(attempts[i].error) === lastSignature) stagnationCount++;
      else break;
    }
  }
}
```

这段逻辑检测的是"从最后一次失败向前数，连续出现同一签名"。但如果序列是：failure(A), success, failure(A), failure(A)，stagnationCount 会是 2（从末尾数，中间有 success 就断了）。

这可能是合理的（成功后的重复失败不算"停滞"），也可能漏掉一个模式：问题确实被暂时修了，但修的不彻底，随后又以相同方式失败。用于判断"是否应该继续重试"，这个语义是合理的；但用于判断"根因有没有被触碰"，可能会产生误判。

文档里的语义表述是"同一错误签名出现3次"，但实现是"连续出现3次"。两个语义之间存在差距，需要明确选一个并对齐。

---

### 2.6 pr-review-triage

**缺口 1 — "CI Sweeper 正在处理某分支"的判断机制**

技能文档说：
> 若 CI Sweeper 已在处理某分支，PR Review Triage 在报告中标注但不派发修复

但当前没有机制让 PR Review Triage 知道 CI Sweeper 是否正在处理某分支。`acting_on` 锁保护的是 item-id，不是分支名。如果 CI Sweeper 的 item 是 `ci-a1b2c3-main`，PR Review Triage 的 item 是 `pr-456`，两个锁不冲突，但两者可能针对同一分支的同一失败。

---

**缺口 2 — PR 空闲判断**

> PR 空闲 > 4 天 → 建议人工接手

"空闲"的定义没有说明——是没有新 commit？没有新 review comment？没有 CI 变化？不同定义会导致不同的空闲判定。对于一个依赖 `pull_request.synchronize` 事件驱动的系统，"没有 synchronize 事件"是可判定的，但"没有活动"需要读评论时间线，依赖 GitHub API，不只是事件驱动。

---

### 2.7 issue-triage

**总体质量好**。"只提议，不应用"的 L1 约束清晰。升级条件（auth/payments/security/public API/billing/infra）明确。

**缺口**：

`Possible Duplicates (human confirm)` 章节要求保守（置信度 < 70% 升级给人），但没有说如何计算置信度。对于一个语言模型来说，"70%置信度"是主观的——不同上下文、不同 issue 风格，模型对"置信度"的感知会漂移。

这条规则需要一个更可操作的替代表述，例如："如果 issue 标题相似度（基于 xxx 方法）超过阈值，或正文有 2个以上匹配的关键错误信息，才标记为可能重复"。

---

### 2.8 signal-gatekeeper

**设计最精妙的技能之一**。成本对照表（有无门卫 93% 节省）、三态判定（RELEVANT/IRRELEVANT/UNCERTAIN 默认丢弃而非默认转发）、"不转发原文"规则——都是少见的有效降噪工程设计。

**工程可执行性问题**：

> 判据要写在配置里，不要靠现场发挥。相关性判据是项目知识，应该固化下来。

这条规则是对的，但框架没有提供一个固化"相关性判据"的标准位置或格式。`patterns/registry.yaml` 里 `issue-intake` pattern 有 `human_gates` 字段，但没有相关性判据字段。用户部署时会在哪里写判据？写在 AGENTS.md？写在一个单独文件？

如果判据没有固化位置，它只能靠 prompt，靠 prompt 的判据就是"靠现场发挥"。

---

### 2.9 lesson-harvest

**整体质量高**。三场景识别（修完又返工、压根不该合、验证太糙）+机械信号（git log grep）+延迟提升（3次才转正）+成功案例（不只记失败）——这是对循环学习系统的认真设计。

**问题**：

> 没有证据的观察不记。挂不上 commit 或 issue 号的，说明你无法指出具体发生了什么——那就是猜测，不是教训。

这条规则好，但在步骤 5（转正）时，转正流程中有：
> 确认下游已读取：`loop-verifier` 与 `minimal-fix` 的检查项要包含新规则

这需要人工编辑 verifier 和 minimal-fix 的 SKILL.md（或约束文件），但这两个技能是已安装的技能，技能文件通常不由用户直接编辑。转正到 `loop-constraints.md` 是清晰的，但"确认 verifier 读到"依赖的是 loop-constraints 技能在每轮加载约束文件——这只要 loop-constraints 技能被正确调用就能自动生效，不需要手动更新 verifier 的技能文件。

这部分文档表述容易让人误解为需要手动修改 verifier SKILL.md。

---

### 2.10 post-merge-cleanup

**触发冲突**：

```yaml
# event-router.mjs
'issues.closed': {
  phase: 'close',
  skills: ['post-merge-cleanup'],
```

`post-merge-cleanup` 同时处理 `pull_request.closed:merged` 和 `issues.closed`。技能的主逻辑是扫合并 PR 的 diff，但当 issue 关闭时触发时，没有 PR diff 可扫——输入完全不同，但技能被当作同一个。

这会导致 issue 关闭时，post-merge-cleanup 运行但产出格式（针对 PR diff）与输入（issue 关闭）不匹配，浪费 token 并可能产出无意义报告。

**建议**：`issues.closed` 和 `pull_request.closed:merged` 分别路由到不同技能，或在 post-merge-cleanup 里显式处理两种输入类型。

---

### 2.11 release-drafter

`patterns/registry.yaml` 里 release-drafter 的技能列表：
```yaml
skills: [release-drafter, loop-verifier]
```

release-drafter 是"只起草不发布"的纯读技能，让 verifier 来验证它的草稿——这个设计合理。但是 `loop-verifier` 的职责是验证代码改动（scope check, tests, red check, denylist），这些检查对"发布说明草稿"没有意义。

在 release 场景里让 verifier 跑 test suite 是多余的（草稿不改代码），但 scope check 和 denylist check 也没有适用对象。实际上 release-drafter 的"验证"应该是交叉核对 PR 标题与提交，这是 release-drafter 技能文档里描述的——但这应该是 release-drafter 自己做，还是 verifier 做？

文档层面有歧义。`patterns/registry.yaml` 说"需要 verifier"，但 verifier 的检查清单为这个场景设计的。

---

## 三、脚本层审查

### 3.1 gate-check.mjs

**检查优先级顺序正确**：pause → budget100 → denylist → max-attempts → budget80 → scope → head-commit → red-check → verification。这个顺序是经过思考的（最低成本的检查先跑，最高影响的检查最后才到 proceed）。

**问题 1 — `workflow_run.completed:failure` 路由到的技能缺少 `loop-verifier`**

```javascript
'workflow_run.completed:failure': {
  skills: ['ci-triage', 'minimal-fix'],  // 没有 loop-verifier
  gates: ['denylist', 'max-attempts', 'scope'],  // 没有 verification
```

但 `check_suite.completed:failure` 有：
```javascript
skills: ['ci-triage', 'minimal-fix', 'loop-verifier'],
gates: ['denylist', 'max-attempts', 'scope', 'verification'],
```

两者处理的是同一类型的失败（CI 失败），但 `workflow_run` 路径跳过了独立验证。这是一个实质性安全缺口：通过 workflow_run 触发的修复不会被独立 verifier 验证就可以 proceed。

---

**问题 2 — `--verdict none` 在非 gate 阶段**

```javascript
if (verdict === 'none' && phase === 'gate') {
  return { decision: 'escalate', gate: 'verification', ... };
}
```

在 gate 阶段，没有 verdict 会阻止通过。但在 fix 阶段，`verdict = 'none'` 会直接通过所有检查（到最后的 `proceed`）。这意味着如果 harness-loop 忘记把 verifier verdict 传给 gate-check，fix 阶段不会被阻止。

应该在 fix 阶段（当 `diffFiles.length > 0` 时）也要求 verdict 不为 none。

---

### 3.2 event-router.mjs

一个小问题：
```javascript
if (args.json || true) {
  printJson(result);
}
```

`|| true` 使得输出永远是 JSON，`--json` 标志失去意义。这是一个遗留 debug 代码。

---

### 3.3 harness-stage.mjs 的 skillInDiscoverablePath

```javascript
function skillInDiscoverablePath(root, skillName) {
  return ['.agents/skills', '.zcode/skills'].some((d) =>
    exists(path.join(root, d, skillName, 'SKILL.md')));
}
```

但 `common.mjs` 的 `SKILL_DIRS` 包含更多路径：
```javascript
export const SKILL_DIRS = [
  '.zcode/skills', '.agents/skills',
  '.grok/skills', '.claude/skills', '.codex/skills',
  'skills',
];
```

阶段 2 的机械判据只检查前两个路径，但审计系统识别更多路径。如果用户把技能装在 `.claude/skills/`，它在 loop-audit 里会被计分（因为 `SKILL_DIRS` 包含它），但在 stage 2 判据里会显示为"不在可发现路径"（因为 `skillInDiscoverablePath` 只检查 `.agents` 和 `.zcode`）。

这两个逻辑需要使用同一个路径列表，或在阶段 2 判据的文档里明确说"只支持这两个路径"。

---

## 四、GitHub Actions 工作流审查

### 4.1 issue-intake.yml

```yaml
- name: Record work item
  run: |
    mkdir -p .loop/queue
    ITEM="issue-${{ github.event.issue.number }}"
    cat > ".loop/queue/${ITEM}.json" <<EOF
    {
      "id": "${ITEM}",
      ...
      "title": $(jq -Rs . <<'TITLE'
    ${{ github.event.issue.title }}
    TITLE
    ),
```

这里使用 heredoc + jq 的组合处理 issue title 是对的（防注入），但 `${{ github.event.issue.body }}` 没有被写入 work item。后续 agent 读 work item 时只有 title 和 url，需要再去拉 issue 正文，增加了一次 API 调用。这不是错误，但是一个效率缺口。

**关键缺口**：写入 `.loop/queue/` 目录后，没有任何 step 触发 commit 或 push，这些文件只在 runner 的临时目录里，工作流结束后消失。整个路由结果无法持久化。

这说明 `.loop/queue/` 机制假设有一个持久化层（agent 平台消费），但工作流本身没有说明这个持久化是如何发生的。如果不同步骤读写同一个队列目录，每次 workflow run 都从空目录开始。

---

### 4.2 merge-gate.yml 的预算读取

```javascript
const log = fs.readFileSync("loop-run-log.md", "utf8");
const entries = [...log.matchAll(/\{.*\}/g)]
```

`matchAll(/\{.*\}/g)` 是单行 greedy match，对 JSON 的正确性依赖于运行日志里的 JSON 对象恰好在一行里。但 `loop-budget.md` 的追加方式是 `JSON.stringify(obj, null, 2)`（两空格缩进，多行），如果有人用标准格式追加，预算计算会读取不到任何条目，认为 `used = 0`，永远不触发 budget 检查。

`loop-run-log.md` 的约定是追加单行 JSON（JSONL 格式），但这个约定只在 `loop-budget` 技能文档里有说明，不在 `loop-run-log.md` 模板里。

---

### 4.3 pr-review.yml 的 review state 映射

```bash
if [ "$STATE" = "changes_requested" ]; then
  EVENT="pull_request_review.changes_requested"
elif [ "$STATE" = "approved" ]; then
  EVENT="pull_request_review.approved"
else
  EVENT="pull_request.opened"
```

第三种情况（非 changes_requested 非 approved）映射到 `pull_request.opened`。这包括 `commented` 状态的 review——普通评论（没有明确 approve 或 request changes）会被当作 PR 打开事件处理，触发 pr-review-triage。这是一个合理的保守映射，但可能产生冗余 triage（每条 review comment 触发一次 triage）。

---

## 五、文档工程化审查

### 5.1 交叉引用一致性

以下几处交叉引用存在轻微不一致：

| 引用方 | 引用内容 | 实际情况 |
|---|---|---|
| `harness-strengthen` 判据 6 | "就绪度评分 ≥ 58" | `loop-audit.mjs` 的评分逻辑需单独确认 |
| `LOOP.md` 事件脊表格 | `issues.labeled:needs-info` | `event-router.mjs` 里只有 `issues.labeled`（无子类型区分） |
| `harness-consolidate` 判据 8 | "跑过一个完整循环周期" | 与判据 9 的"观察一周"有重叠，边界不清晰 |

`LOOP.md` 里的 `issues.labeled:needs-info` 是更精确的子事件，但路由表里的 `issues.labeled` 会处理所有 label 事件。这两个声明之间有逻辑差距。

---

### 5.2 技能描述与实现的对齐

`harness-loop` 文档说"第 3 步：检查冲突锁"，但 `event-router.mjs` 的 `route()` 函数也做冲突检测：
```javascript
// 冲突检测
if (opts.locks && opts.item) {
  const holder = opts.locks.find(...);
```

路由和冲突检测在文档层面是分开的步骤（第 2 步路由，第 3 步检查锁），但在脚本实现里合并在 `route()` 函数里。这不是错误，但是文档-实现的层次映射不对齐，会让读脚本的人感到困惑。

---

## 六、总体工程严谨度评价

| 维度 | 评价 | 得分 |
|---|---|---|
| **防错设计**（默认拒绝，显式升级，拒绝列表） | 优秀 | ⭐⭐⭐⭐⭐ |
| **maker/checker 分离** | 优秀，理由充分 | ⭐⭐⭐⭐⭐ |
| **成本可观测性** | 体系完整，有量化 | ⭐⭐⭐⭐ |
| **阶段性约束**（不跳级） | 设计严谨 | ⭐⭐⭐⭐⭐ |
| **事件去重与幂等性** | 有缺口 | ⭐⭐ |
| **多循环协调的实现健壮性** | 机制正确但实现脆弱（Markdown 解析） | ⭐⭐⭐ |
| **持久化机制的完整性** | `.loop/queue/` 的生命周期不清晰 | ⭐⭐ |
| **技能间边界的精确性** | 部分技能边界模糊（post-merge 触发混用、release verifier 语义混用） | ⭐⭐⭐ |
| **脚本代码质量** | 普遍良好，少数遗留问题 | ⭐⭐⭐⭐ |
| **文档-实现对齐** | 大体对齐，局部不一致 | ⭐⭐⭐⭐ |

---

## 七、优先级建议

### P0 — 安全与正确性

1. **`workflow_run.completed:failure` 缺少 `loop-verifier`**：修复前的代码改动不经验证就 proceed，违反 maker/checker 原则。
2. **`issue-intake.yml` 缺少 bot 过滤**：agent 打标签触发 triage 的反馈环路，轻则浪费 token，重则产生无限循环。
3. **`check_suite` + `workflow_run` 对同一失败双重触发**：两个 worktree 同时修同一个失败。

### P1 — 机制健壮性

4. **`acting_on` 锁从 Markdown 迁移到结构化存储**：整个多循环协调机制的单点脆弱性。
5. **`gate-check.mjs` 在 fix 阶段不要求 verdict**：fix 阶段也应该要求 verifier verdict 存在。
6. **`.loop/queue/` 持久化机制明确化**：文档或代码说明队列如何跨 workflow run 持久化。

### P2 — 设计精确性

7. **`post-merge-cleanup` 的 `issues.closed` 路由**：两种触发对应不同输入，需分离或显式处理。
8. **`stagnation` 的"连续"与"总计"语义对齐**：文档说"出现3次"，实现是"连续出现3次"。
9. **`skillInDiscoverablePath` 与 `SKILL_DIRS` 路径列表对齐**。
10. **`event-router.mjs` 里的 `|| true` 清理**。

### P3 — 文档精确性

11. **`lesson-harvest` 中"确认 verifier 读到"的表述**：转正到 loop-constraints.md 自动生效，不需要修改 verifier SKILL.md。
12. **`harness-init` 判据 8 的假阳性路径**：生成的默认 init.sh 应能被判据 8 检测为"可能是占位"。
13. **`LOOP.md` 的 `issues.labeled:needs-info` 与路由表的 `issues.labeled` 对齐**。

---

*审查人：Antigravity（独立于项目历史与已有审查报告）*
