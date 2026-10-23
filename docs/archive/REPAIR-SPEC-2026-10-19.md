# harness-loop 修复规格（2026-10-19）

> 状态：审计结论已逐条复现。本文只定义修复，不含实现。
> 复现环境：Windows 11 / Git Bash / Node 20；仓库 `D:\harness_loop\.claude\worktrees\funny-carson-c5753c`。
> 基线：`node scripts/test.mjs` → `Passed: 335  Failed: 0`。
>
> 证据约定：每条给出**实际执行的命令**与**实际观察到的输出**。未复现的结论不进入修复清单。

---

## 0. 结论摘要

| ID | 级别 | 状态 | 一句话 |
|---|---|---|---|
| P1-1 | 高 | 已复现 | 技能里的 `--state STATE.md` 让 kill switch 完全失效 |
| P1-2 | 高 | 已复现 | `/harness-loop` 只跑 `--phase fix`，证据 / sha / 回退测试三道闸永不触发 |
| P1-3 | 高 | 已复现 | 消费方项目没有 `harness-stage.mjs`，技能里的装配/验证命令直接报错 |
| P1-4 | 高 | 已复现（新） | 出厂模板的占位 feature 能通过阶段 1，`--upgrade --stage 2` 直接放行 |
| P2-1 | 中 | 已复现 | `/harness-loop --verify` 不存在，技能与 README 承诺了未实现的行为 |
| P2-2 | 中 | 已复现 | 阶段 2 的 run-log 判据只查文件存在，空文件也算通过 |
| P2-3 | 中 | 已复现 | 账本缺失/坏 JSON 退出 1，不在文档定义的 0/2 三态内 |
| P2-4 | 中 | 已复现 | 模板约束缺 `可执行入口规则` 与 `## Worktrees` 两节 |
| P2-5 | 中 | 已复现 | user-scope 安装不被阶段 2 的 repo 内判据认可 |
| P2-6 | 中 | 已复现 | docs 漂移：预算闸门、悬空文件引用、decision 枚举 |
| P3-1 | 低 | 已复现 | `STATE.md` 自相矛盾（已跑两轮 vs 尚未跑过） |
| P3-2 | 低 | 已复现 | `templates/init.sh` 不被装配器使用，且缺少自引用标记 |
| P3-3 | 低 | 已复现 | 拒绝列表“删一条”即算本地化（已知限制，建议只改文档） |
| P3-4 | 低 | 已复现 | `--attempts` 与 ledger 不交叉校验，可绕过 3 次上限 |

**修复顺序建议**：P1-1 → P1-2 → P1-4 → P1-3 → P2-3 → P2-2 → P2-4 → P2-1 → P2-5 → P2-6 → P3。

---

## 1. 复现证据

### P1-1 · kill switch 路径错误

**位置**：[skills/harness-loop/SKILL.md:28](skills/harness-loop/SKILL.md:28)、[:122](skills/harness-loop/SKILL.md:122)

**复现**（在含 `loop-pause-all` 的目录中运行）：

```bash
TMP=$(mktemp -d); printf 'loop-pause-all\n' > "$TMP/STATE.md"
cd "$TMP"
node <pack>/scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state STATE.md --json
```

实际输出：

```json
{ "decision": "proceed", "gate": null, "reason": "all gates passed", "exit_code": 0 }
```

对照组：

```bash
node <pack>/scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state . --json
# → { "decision": "exit", "gate": "pause", "exit_code": 3 }

node <pack>/scripts/gate-check.mjs --item probe --phase fix --diff-files "" --json
# → { "decision": "exit", "gate": "pause", "exit_code": 3 }
```

**根因**：`isPaused(stateRoot)` 把入参当**目录**，拼接 `path.join(stateRoot, 'STATE.md')`（[gate-check.mjs:41](scripts/gate-check.mjs:41)）。传 `STATE.md` 后实际查找 `STATE.md/STATE.md`，永远读不到。`--phase gate` 下同样失效（实测暂停闸未触发，流程直接走到 `verification-evidence`）。

**影响**：硬约束 6 的唯一机械入口在文档命令里不可用。agent 按技能执行时会认为“没有暂停”。

---

### P1-2 · 证据 / sha / 回退测试闸在 loop 中不可达

**位置**：[skills/harness-loop/SKILL.md:117](skills/harness-loop/SKILL.md:117)；闸门条件在 [gate-check.mjs:153](scripts/gate-check.mjs:153)、[:193](scripts/gate-check.mjs:193)、[:210](scripts/gate-check.mjs:210)

**复现**：

```bash
# fix 阶段：approve + 回退测试未跑 + 无证据文件
node scripts/gate-check.mjs --item p --phase fix --verdict approve --red-check not-run --diff-files a.ts --json
# → proceed, exit 0

# gate 阶段：同样输入
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check not-run \
  --reviewed-sha abc --head-sha abc --diff-files a.ts --json
# → escalate, gate=red-check, exit 2

# gate 阶段：缺 sha
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass --diff-files a.ts --json
# → escalate, gate=head-commit, exit 2

# gate 阶段：完整证据
node scripts/gate-check.mjs --item p --phase gate --verdict approve --red-check pass \
  --reviewed-sha abc --head-sha abc --diff-files a.ts --evidence-file report.md --json
# → proceed, exit 0
```

**根因**：三道闸都以 `phase === 'gate'` 为前置条件，而技能第 5 步只传 `--phase fix`。`/harness-loop` 是唯一编排入口，因此这三条硬约束在框架自身的运行路径上没有机械入口。

---

### P1-3 · 消费方项目缺少 `harness-stage.mjs`

**位置**：[harness-stage.mjs:446](scripts/harness-stage.mjs:446)（只复制两个运行脚本）；技能命令见 [harness-init/SKILL.md:24](skills/harness-init/SKILL.md:24)、[harness-loop-init/SKILL.md:24](skills/harness-loop-init/SKILL.md:24)

**复现**：

```bash
TMP=$(mktemp -d)
node scripts/harness-stage.mjs "$TMP" --upgrade --stage 1 --commands "true"
cd "$TMP"
node scripts/harness-stage.mjs .
```

实际输出：

```
node:internal/modules/cjs/loader:... throw err;
EXIT=1
```

消费方 `scripts/` 实际只有：

```
scripts/gate-check.mjs
scripts/ledger-check.mjs
scripts/lib/common.mjs
```

**根因**：`harness-stage.mjs`、`templates/`、`skills/` 源目录都留在 pack 内，未随装配进入消费方；技能却用相对路径 `node scripts/harness-stage.mjs` 调用。

**设计意图确认**：`test.mjs:841-843` 明确断言消费方**不得**含 `harness-stage.mjs`。因此修复方向不是“把它复制进去”，而是让技能能定位 pack。

---

### P1-4 · 模板占位 feature 通过阶段 1（新发现）

**位置**：[templates/feature_list.json:29](templates/feature_list.json:29)；判据在 [harness-stage.mjs:207](scripts/harness-stage.mjs:207)

**复现**：

```bash
TMP=$(mktemp -d)
node scripts/harness-stage.mjs "$TMP" --upgrade --stage 1 --commands "true"
node scripts/harness-stage.mjs "$TMP" --stage 1 --require
# → EXIT=0

node scripts/harness-stage.mjs "$TMP" --upgrade --stage 2
# → Upgraded harness to stage 2; EXIT=0
```

阶段 1 报告：`[COMPLETE] 7/7`，其中“功能清单存在且每条 feature 有可判定的完成标准”为 PASS。

**根因**：判据只认 `notes` **以** `占位` 或 `placeholder` **开头**（正则带 `^`）。出厂模板第一条 notes 是“替换为你的真实 feature。此条目是占位符。”——不以“占位”开头；第二、三条 notes 是 `dependencies: ...`，完全没有占位标记。于是模板自带的占位内容绕过了自己的判据。

**影响**：技能文档说“手工改 `feature_list.json`”是阶段 1 的两处手工修改之一，但没有任何机械判定强制它。跳级保护也因此失效：阶段 2 可以直接装上。

---

### P2-1 · `--verify` 不存在

**复现**：

```bash
grep -rn -- "--verify" scripts/ skills/ | grep -v docs/
# → skills/harness-loop/SKILL.md:82（仅此一处，无实现）
```

**根因**：技能与 [README.md:30](README.md:30) 都承诺“另开会话跑 `/harness-loop --verify <item>`”，但技能没有定义该模式，也没有脚本入口。

---

### P2-2 · run-log 判据过弱

**位置**：[harness-stage.mjs:331](scripts/harness-stage.mjs:331)

**复现**：空 `loop-run-log.md` → 阶段 2 报告 `PASS 运行日志存在（loop-run-log.md）`。

**根因**：代码只 `hasFile`；技能 [harness-loop-init/SKILL.md:34](skills/harness-loop-init/SKILL.md:34) 写的是“文件存在且有 `## Log` 章节”。

---

### P2-3 · 账本错误退出码不在三态内

**位置**：[ledger-check.mjs:337](scripts/ledger-check.mjs:337)

**复现**：

```bash
node scripts/ledger-check.mjs --ledger /tmp/missing.json
# → error: ledger not found... ; EXIT=1

printf '{not json' > /tmp/bad.json
node scripts/ledger-check.mjs --ledger /tmp/bad.json
# → error: ledger is not valid JSON... ; EXIT=1
```

**根因**：走 `fail()` 默认退出 1。docs/05 只定义 `0`/`2`，`/harness-loop` 第 6 步也只处理 `2`。账本路径写错时，agent 可能把 1 当成“未知”继续跑。

**注意**：`test.mjs:860-861` 当前断言退出 1。这条断言编码的是错误行为，修复时**必须同步改测试**，并在提交信息里说明这是纠正而非放宽。

---

### P2-4 · 模板约束缺两节

**复现**：

```bash
grep -c "可执行入口规则" loop-constraints.md templates/loop-constraints.md
# → 1 / 0
grep -c "## Worktrees" loop-constraints.md templates/loop-constraints.md
# → 1 / 0
grep -c "真实使用验证" loop-constraints.md templates/loop-constraints.md
# → 1 / 1   ← 审计时误报，模板其实有这一节
```

---

### P2-5 · user-scope 安装不被 repo 判据认可

**复现**（覆盖 HOME 模拟 user-scope 安装，项目内不安装）：

```
阶段 2 报告：
FAIL  harness-loop 已装到可发现路径且写明 kill switch 与独立验证
      evidence: 未找到 harness-loop 技能...
```

**根因**：`skillInDiscoverablePath` 只查 `<repo>/.claude/skills` 与 `<repo>/.agents/skills`（[harness-stage.mjs:127](scripts/harness-stage.mjs:127)），不查 `~`。README 快速开始却让用户先做 `--scope user`。

---

### P2-6 · 文档漂移

**复现**：

```bash
grep -n "预算\|report-only\|五类闸门" docs/03-gates-and-levels.md
# → 3: 五类闸门（实际列了 6 节）
# → 84-93: 预算闸门（代码已删除）
# → 118,121: 判定优先级里仍有预算
# → 210-212: decision 枚举含 report-only（代码从不产生）
```

悬空引用（文件不存在）：

| 引用位置 | 目标 |
|---|---|
| docs/03:63 | `docs/06-cost-and-observability.md`（已归档） |
| docs/03:108、docs/04:66 | `patterns/registry.yaml`（不存在） |
| docs/03:139 | `docs/11-three-stages.md`（已归档） |
| docs/02:255 | `templates/session-handoff.md`、`templates/progress.md`（不存在） |
| LESSONS.md:9 | `skills/lesson-harvest/SKILL.md`（不存在） |

---

### P3-1 · STATE.md 自相矛盾

```
STATE.md:3   Last run: 2026-10-17 (v2 简化 + 两轮真机验证 + PR 合并)
STATE.md:23  - 尚未跑过任何一轮真实 loop。第一周目标：只报告，不改代码。
```

---

### P3-2 · `templates/init.sh` 与生成器分叉

**复现**：

```bash
grep -c "LOOP_HARNESS_ACTIVE_INIT" templates/init.sh
# → 0
grep -n "initScriptFromCommands" scripts/harness-stage.mjs
# → 497: 装配时用生成器，不复制模板
```

**影响**：手工复制模板得到的 `init.sh` 没有自引用标记，在 pack 自身上运行 `harness-stage` 会递归。

---

### P3-3 · 拒绝列表本地化可被“删一条”满足

**复现**：从模板 12 条中只删掉 `payments/**`，其余照抄 → `--stage 2 --require` 退出 0。

**判断**：这是判据的已知局限，不一定是缺陷——仓库确实可能没有 payments 目录。建议只改文档措辞，不收紧判据。

---

### P3-4 · `--attempts` 与 ledger 不交叉校验

**复现**：`gate-check` 只读 `--attempts` 入参；`grep -n "ledger" scripts/gate-check.mjs` 只命中一条提示文案。传 `--attempts 0` 即可在账本已有 5 次失败时继续。

---

## 2. 修复规格

### FIX-01（P1-1）kill switch 路径

**改动**：`skills/harness-loop/SKILL.md`

1. 第 0 步（:28）：
   ```diff
   - node scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state STATE.md --json
   + node scripts/gate-check.mjs --item probe --phase fix --diff-files "" --state . --json
   ```
2. 第 5 步（:122）：
   ```diff
   -   --state STATE.md
   +   --state .
   ```
3. 第 5 步命令上方加一行说明：
   > `--state` 接受**目录**，不是文件路径。第 5 步从主检出目录运行；若在 worktree 内运行，显式传主检出的绝对路径。

**回归断言**（`scripts/test.mjs` 第 10 节）：

```js
for (const s of expectedSkills) {
  const c = readText(path.join(SKILLS_DIR, s, 'SKILL.md'));
  ok(`${s} 不使用错误的 --state 文件路径`, !/--state\s+STATE\.md/.test(c));
}
```

**验收**：用改后的第 0 步命令，在含 `loop-pause-all` 的目录运行 → `exit 3`。

---

### FIX-02（P1-2）第 5 步切到 gate 阶段

**改动**：`skills/harness-loop/SKILL.md` 第 5 步

```bash
node scripts/gate-check.mjs \
  --item <item-id> \
  --phase gate \
  --attempts <n> \
  --diff-files @changed-files.txt \
  --verdict <approve|reject|escalate-human|none> \
  --red-check <pass|fail|not-run> \
  --reviewed-sha <验证者审过的 sha> \
  --head-sha "$(git rev-parse HEAD)" \
  --evidence-file <verifier-report.md> \
  --state .
```

**配套改动**：

1. 在命令前加生成清单的步骤（当前技能用了 `@changed-files.txt` 却没让 agent 创建）：
   ```bash
   git diff --name-only main...HEAD > changed-files.txt   # 分支基名按项目实际替换
   ```
   并注明“提交前删除 `changed-files.txt`”。
2. 明确 `--phase fix` 仍用于派发前的预检（拒绝列表/范围/暂停）；第 5 步是**合并前**的 gate 检查。
3. `reject` 时不要求 `--evidence-file`，但验证者报告存在就传，便于追溯。

**回归断言**（`scripts/test.mjs` 第 10 节）：

```js
ok('harness-loop 第 5 步使用 gate 阶段', /--phase gate/.test(loop));
ok('harness-loop gate 命令带证据', /--evidence-file/.test(loop));
ok('harness-loop gate 命令绑定 sha', /--reviewed-sha/.test(loop) && /--head-sha/.test(loop));
```

**验收**（逐条实跑）：

| 输入 | 期望 |
|---|---|
| 完整证据 + pass + 相同 sha | `proceed`，exit 0 |
| 缺 `--evidence-file` | `escalate / verification-evidence`，exit 2 |
| `--red-check not-run` | `escalate / red-check`，exit 2 |
| `--reviewed-sha != --head-sha` | `escalate / head-commit`，exit 2 |
| `--verdict none` | `escalate / awaiting-verification`，exit 2 |

---

### FIX-03（P1-3）让技能能定位 pack

**方案**：复用已有的安装清单 `.harness-loop-install.json`（`install-skills.mjs` 已写 `packRoot`），让 `harness-stage --upgrade` 也写一份。

**代码改动**：

1. `scripts/lib/common.mjs` 增加：
   ```js
   export const INSTALL_MANIFEST = '.harness-loop-install.json';
   ```
2. `scripts/install-skills.mjs` 改为 import 该常量（删除本地同名常量）。
3. `scripts/harness-stage.mjs` 的 `copySkillDir`（:422）在每个目标目录写清单：
   ```js
   fs.writeFileSync(path.join(target, destDir, INSTALL_MANIFEST), JSON.stringify({
     installedAt: new Date().toISOString(),
     packRoot: PACK_ROOT,
     scope: 'workspace',
     layout: 'both',
     skills: ['harness-init', 'harness-loop-init', 'harness-loop', 'harness-loop-issue'],
   }, null, 2) + '\n', 'utf8');
   ```
   注意：目标目录已存在时也要写（清单是定位信息，不是技能副本）。

**文档改动**：`skills/harness-init/SKILL.md` 与 `skills/harness-loop-init/SKILL.md` 的前置检查处统一加：

> `harness-stage.mjs` 是 **pack 级工具**，不在消费方仓库的 `scripts/` 里。
> 从 `.claude/skills/.harness-loop-install.json`（或 `.agents/skills/`、用户级同名清单）读取 `packRoot`，
> 运行 `node <packRoot>/scripts/harness-stage.mjs <target>`。清单不存在或路径失效 → 问用户 pack 在哪，不要猜。

**回归断言**：

```js
const manifest = JSON.parse(fs.readFileSync(path.join(empty, '.claude/skills', '.harness-loop-install.json'), 'utf8'));
eq('装配写入 packRoot 清单', manifest.packRoot, PACK_ROOT);
```

**验收**：装配临时项目 → 从清单读 `packRoot` → `node <packRoot>/scripts/harness-stage.mjs <tmp>` 退出 0。

---

### FIX-04（P1-4）占位 feature 必须被阶段 1 拦住

**改动**：`templates/feature_list.json` 三条 notes 统一加前缀：

```diff
- "notes": "替换为你的真实 feature。此条目是占位符。"
+ "notes": "占位：替换为你的真实 feature。此条目是占位符。"

- "notes": "dependencies: setup-001"
+ "notes": "占位：dependencies: setup-001"

- "notes": "dependencies: core-001"
+ "notes": "占位：dependencies: core-001"
```

**为什么不改判据正则**：`metaDirective` 已包含 `替换`，把它套到 notes 上会误伤“替换了旧 API”这类真实说明。让模板使用明确的 `占位：` 标记，判据保持严格。

**测试改动**（`scripts/test.mjs:827-828`）：

当前顺序是先 `writeRealFeatures` 再断言，正好掩盖了这个缺陷。改为：

```js
runStage(empty, ['--upgrade', '--stage', '1']);
eq('模板占位 feature → 阶段 1 未达成',
  runStage(empty, ['--stage', '1', '--require']).code, 2);
writeRealFeatures(path.join(empty, 'feature_list.json'));
eq('替换占位 feature 后阶段 1 达成',
  runStage(empty, ['--stage', '1', '--require']).code, 0);
```

同时加一条：占位 feature 未替换时 `--upgrade --stage 2` 必须退出 2（跳级保护）。

**验收**：全新装配 → `--stage 1 --require` exit 2；替换三条 feature → exit 0；替换前 `--upgrade --stage 2` exit 2。

---

### FIX-05（P2-3）账本不可读统一退出 2

**改动**：`scripts/ledger-check.mjs` 的 `main()`

```diff
- if (!fs.existsSync(ledgerPath)) {
-   fail(`ledger not found: ${ledgerPath}`);
- }
- const ledger = readJson(ledgerPath);
- if (!ledger) fail(`ledger is not valid JSON: ${ledgerPath}`);
+ if (!fs.existsSync(ledgerPath)) {
+   printJson({ verdict: 'no-ledger', exit_code: 2, unreadable_reason: `ledger not found: ${ledgerPath}` });
+   process.exit(2);
+ }
+ const ledger = readJson(ledgerPath);
+ if (!ledger) {
+   printJson({ verdict: 'no-ledger', exit_code: 2, unreadable_reason: `ledger is not valid JSON: ${ledgerPath}` });
+   process.exit(2);
+ }
```

保留 `--escalation` 分支：账本不可读时输出 `renderEscalation` 的 `no-ledger` 文案。

**测试改动**：`scripts/test.mjs:860-861` 的期望值 `1` → `2`；断言名同步改为“缺账本时 ledger-check 停止并升级”。

**文档改动**：`docs/05-failure-modes.md` 退出码表补一行 `1 = 参数错误`；`skills/harness-loop/SKILL.md` 第 6 步注明“1 = 命令写错，不是通过；2 = 停止”。

**验收**：缺失/坏 JSON → exit 2 且输出 `verdict: no-ledger`；非法 `--stagnation abc` → exit 1。

---

### FIX-06（P2-2）run-log 必须有 `## Log`

**改动**：`scripts/harness-stage.mjs` 增加：

```js
function runLogHasSection(root) {
  const p = path.join(root, 'loop-run-log.md');
  if (!exists(p)) return { ok: false, reason: 'loop-run-log.md 不存在' };
  return /^##\s+Log\s*$/m.test(readText(p))
    ? { ok: true, reason: null }
    : { ok: false, reason: 'loop-run-log.md 缺少 ## Log 章节' };
}
```

`checkStage2` 中替换现有 `hasFile` 判据。

**回归断言**：空文件 → FAIL；模板内容 → PASS。

---

### FIX-07（P2-4）补齐模板约束

**改动**：`templates/loop-constraints.md`

1. `## Verification` 节末追加：
   ```
   - **可执行入口规则**：任何被文档描述为"机械判定"的机制，必须有一个真正读它的代码入口，
     且其行为被测试断言。改配置而测试仍绿，说明这个配置是装饰品。
   ```
2. 在 `## Data` 前新增：
   ```
   ## Worktrees

   - 无人值守的代码改动必须在独立 git worktree 中进行。
   - 一个修复一个 worktree；验证者 REJECT 或升级后丢弃，不留残留分支。
   ```

**回归断言**（`test.mjs` 第 9 节）：模板含 `可执行入口规则` 与 `## Worktrees`。

**注意**：这两节不进入 `## Paths` 代码块，不影响拒绝列表解析与本地化判定。

---

### FIX-08（P2-1）删除不存在的 `--verify`

**改动**：`skills/harness-loop/SKILL.md:82` 与 `README.md:30`

```diff
- 要求人另开会话运行 `/harness-loop --verify <item>`
+ 要求人另开会话运行 `/harness-loop <item>`，并在指令中写明“只执行第 4 步独立验证，不得修改代码”
```

不新增模式、不加脚本。验证者报告格式已在第 4 步定义，新会话按同一格式产出即可。

---

### FIX-09（P2-5）说明 user-scope 不计入阶段 2

**改动**：`skills/harness-loop-init/SKILL.md` 判据 3 旁与 `README.md` 快速开始处各加一句：

> 阶段 2 的“技能已装到可发现路径”判据只检查**项目内**的 `.claude/skills` / `.agents/skills`；
> user-scope 安装（`~/.claude/skills`）不计入。用 `--upgrade` 或 `install-skills --target .`。

不改代码：CI 上的 `--require` 不应依赖运行机器的 home 目录。

---

### FIX-10（P2-6）文档漂移

**`docs/03-gates-and-levels.md`**

1. `:3` “五类闸门规则” → “闸门规则”。
2. 删除 `### 5. 预算闸门（Budget Gate）` 整节（:84-93）。代码已移除预算，`report-only` 从不产生。
3. 判定优先级（:118、:121）删除两行预算判定，重新编号。
4. `decision` 枚举（:210-212）改为 `proceed | escalate | exit`；退出码说明删掉 `report-only`。
5. 悬空引用：`:63` → `docs/archive/06-cost-and-observability.md`；`:108` 删除 `patterns/registry.yaml` 的说法，改为“本框架默认不自动合并，且不生成允许列表”；`:139` → `docs/archive/11-three-stages.md`。

**其他**

| 文件 | 改动 |
|---|---|
| `docs/02-state-model.md:255` | 删除 `templates/session-handoff.md` / `templates/progress.md` 引用，或改指 `STATE.md` 的交接章节 |
| `docs/04-safety.md:66` | 删除 `patterns/registry.yaml` 的断言，改为“默认不自动合并；允许列表按需手工创建” |
| `LESSONS.md:9` | 删除 `skills/lesson-harvest/SKILL.md` 引用 |
| `README.md:144` | 模板数量与实际一致（见 FIX-12 决策） |
| `AGENTS.md:78` | 注明 `harness-stage.mjs` 是 pack 级工具，需从 pack 运行 |

**回归断言**：在 `test.mjs` 第 12 节加一条“文档内不出现已知悬空路径”：

```js
const dangling = ['docs/06-cost-and-observability.md', 'docs/11-three-stages.md',
  'templates/progress.md', 'templates/session-handoff.md', 'skills/lesson-harvest'];
for (const p of dangling) {
  ok(`README/AGENTS/docs 不引用悬空路径 ${p}`,
    ![readText('README.md'), readText('AGENTS.md'),
      ...docs.map(d => readText(path.join(PACK_ROOT, 'docs', d)))].some(t => t.includes(p)));
}
```

---

### FIX-11（P3-1）修正 STATE.md 矛盾

**改动**：删除 [STATE.md:23](STATE.md:23) 的“尚未跑过任何一轮真实 loop”，改为指向 High Priority 中已记录的两轮真机验证。保留“第一周只报告”的目标说明，但改成过去时/已完成。

---

### FIX-12（P3-2）`templates/init.sh` 去留（需决策）

**推荐：删除**。理由：装配器从不使用它，生成器是唯一真相源；保留两份形态会持续分叉，且模板缺少递归保护标记。

改动：

1. 删除 `templates/init.sh`。
2. `test.mjs:605-608` 的 `requiredTemplates` 移除 `init.sh`。
3. `README.md:144` “7 个模板” → “6 个模板”。

**替代方案（若想保留手工模板）**：在模板中加入与生成器一致的 `LOOP_HARNESS_ACTIVE_INIT` 标记，并在文件头注明“装配器默认使用生成器；仅手工复制时使用本文件”。二选一，不要两份都留而不加说明。

---

### FIX-13（P3-3）拒绝列表本地化：只改文档

**改动**：`skills/harness-loop-init/SKILL.md` 判据 5 的说明补一句：

> 判据只证明“与模板有实质差异”（增、删均可），不证明列表正确。删掉仓库不存在的路径是合法本地化。

不收紧判据：无法区分“合理删除”与“敷衍删除”，收紧会制造假红。

---

### FIX-14（P3-4）`--attempts` 与 ledger 交叉校验（可选，建议排后）

**方案**：`gate-check.mjs` 增加可选 `--ledger <path>`。提供时：

```js
const ledgerCount = attempts.filter(a => a.item === item).length;
const effectiveAttempts = Math.max(attempts, ledgerCount);
```

用 `effectiveAttempts` 参与 `max-attempts` 判定，并在输出中带 `attempts_from_ledger`。

**测试**：账本 3 条失败 + `--attempts 0` → `escalate / max-attempts`。

**注意**：这会改变现有 CLI 契约，非 P1 必需。若本次不做，应在 `loop-constraints.md` 明确“`--attempts` 必须等于账本中该 item 的尝试数，验证者复核”，否则规则仍是装饰品。

---

## 3. 明确不改的行为（防止过度修复）

| 行为 | 为什么保留 |
|---|---|
| `--diff-files` 指向路径清单但缺 `@` → 参数错误 exit 1 | 防止 N 个文件塌缩成 1 个，拒绝列表与范围闸同时失效 |
| `--pause false` → 参数错误 | 防止“显式传假”变成永久刹车 |
| pack 自身 `init.sh` 判据为 NOT RUN | 有意避免无限递归；不是缺陷 |
| `--phase gate` + `verdict none` → `awaiting-verification` | 区分“没验”与“验失败” |
| 账本 `goal` 为占位 → `placeholder-ledger` exit 2 | 区分示例数据与真实历史 |
| 拒绝列表“删一条也算本地化” | 无法机械区分合理删除与敷衍，收紧会假红 |

---

## 4. 上一轮审计的勘误

| 上轮说法 | 实际情况 |
|---|---|
| 模板缺“真实使用验证” | **错**。`templates/loop-constraints.md:60` 有这一节；缺的是“可执行入口规则”与 `## Worktrees` |
| 技能说装“3 个技能” | **表述不准**。技能列了 3 个技能名，漏了 `harness-loop-issue`；没有写数字“3” |
| `--diff-files @missing` 是缺陷 | **错**。exit 1 是正确行为；缺陷是技能没让 agent 生成 `changed-files.txt` |
| docs/03 写“五类”却列 6 类 | 正确；删除预算闸后自然变为 5 类 |
| pack 报 stage 0 是异常 | **错**。这是自引用保护的预期结果 |

---

## 5. 实施顺序与验收

| 步骤 | 内容 | 验收命令 |
|---|---|---|
| 1 | FIX-01 | 暂停目录内第 0 步命令 → exit 3 |
| 2 | FIX-02 + FIX-13（清单生成） | 五条 gate 阶段输入全部符合期望 |
| 3 | FIX-04 | 全新装配 → 阶段 1 `--require` exit 2；替换后 exit 0 |
| 4 | FIX-03 | 消费方从清单定位 pack → `harness-stage` exit 0 |
| 5 | FIX-05 | 缺失/坏账本 → exit 2；坏参数 → exit 1 |
| 6 | FIX-06 + FIX-07 | 空 run-log → FAIL；模板含两节 |
| 7 | FIX-08 ~ FIX-12 | 文档无悬空引用；STATE.md 无矛盾 |
| 8 | FIX-14（可选） | 账本 3 次 + `--attempts 0` → escalate |
| 9 | 全量回归 | `node scripts/test.mjs` 全绿；`bash init.sh` 退出 0 |

**完成定义**（对齐 AGENTS.md）：每一步的验证命令**实际跑过**、输出记录进 `feature_list.json` 或 `STATE.md`；仓库仍能从 `init.sh` 重新起来。

---

## 6. 本次未处理

- `docs/archive/` 内的 v1 文档未逐篇校对（仅确认不在主引用路径上）。
- `test.mjs` 其余 335 条断言未逐条审阅；本次只新增与修复直接相关的断言。
- 未实现 `--verify` 独立模式；采用文档澄清而非新增代码。
- 未处理“多个 loop 共用 ledger 时的 pattern 切片”在 `/harness-loop` 文档中的缺失（代码支持 `--pattern`，技能未提）。若需要，另开一项。
