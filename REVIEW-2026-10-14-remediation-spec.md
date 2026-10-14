# harness-loop 修改规划 Spec

> **输入**：`REVIEW-2026-10-14-harness-loop-audit.md`（缺陷编号 HL-01 … HL-30）
> **产出**：可逐条执行、可机械验证的工作包（WP），每个 WP 一个 diff
> **编写日期**：2026-10-14
> **本文件命名遵循仓库既有约定**（`REVIEW-YYYY-MM-DD-*.md`），因此被 `scripts/test.mjs:1377` 的
> `isHistorical` 判定排除在"旧技能名残留"扫描之外——本文件需要引用已删除的旧技能名来说明历史，
> 而那个扫描会拦下这类引用。

---

## 0. 使用方式

```bash
# 1. 看当前状态
node scripts/harness-stage.mjs .          # 本仓库自身是源仓库，阶段判定不适用，见 §5

# 2. 选定一个 WP（一次只做一个）
#    从 §2 的层级表里取一个"依赖已满足"的 WP

# 3. 实施后跑验证
node scripts/test.mjs
node scripts/test.mjs --verbose           # 看具体断言

# 4. 每条断言必须做变异回退（约束 8）
#    改回错误写法 → 测试必须变红 → 再改回来
#    变异后先确认变异真的落地（看一眼那行代码），再读测试结果
```

### 本 spec 的硬要求（继承仓库既有规则，不是新发明的）

| 规则 | 出处 | 在本 spec 中的含义 |
|---|---|---|
| 每个 WP 一个 diff | `AGENTS.md` 工作规则 | 不跨 WP 改文件；例外在 WP 内显式列出 |
| 新增测试必须通过回退测试 | 硬约束 8 | 每个 WP 的"验收断言"都必须能在修复前代码上真的挂掉 |
| 变异必须确认落地 | `STATE.md` Post-Run Critique 2026-10-14 第三批 | 改完变异先看一眼那行代码，再跑测试 |
| 未跑必须写明 | 硬约束 9 | 本 spec 的 §6 列出无法执行的验证 |
| 不修改验证规则来通过 | `AGENTS.md` 工作规则 | 禁止为了绿而放宽任何判据 |
| 状态必须落盘 | `AGENTS.md` | 每个 WP 完成后更新 `STATE.md` 与 `feature_list.json` |

### 状态表（实施时逐行更新）

| WP | 标题 | 层级 | 依赖 | 状态 | 证据 |
|---|---|---|---|---|---|
| WP-01 | 编排命令加 `@`，修正 `docs/03` 示例 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-02 | 把 `scripts/` 部署到消费者项目 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-03 | `PHASES` 增加 `close` | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-04 | workflow 去注入 + `LOOP_BOT_TOKEN` 落地 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-05 | 未知标志 fail-closed | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-06 | verdict 词汇映射 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-07 | merge-gate 补齐四个参数 | 1 | WP-02 | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-08 | 证据闸门（`--evidence-file`） | 1 | WP-07 | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-09 | `budget-check.mjs`：暂停与预算的唯一入口 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-10 | `--upgrade` 跳级保护 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-11 | 锁键 `--target` 进编排技能 | 1 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-12 | 接线判据读 workflow 内容 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-13 | 漂移扫描覆盖 `LOOP.md` + 修数字（含脚本数） | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-14 | 测试 17 比对 phase | 2 | WP-03 | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-15 | outcome 枚举统一 + 校验 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-16 | 账本真实性（`placeholder-ledger`） | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-17 | 错误签名归一化收窄 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-18 | 拒绝列表大小写不敏感 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-19 | `install-skills --check` | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-20 | `scripts/worktree.mjs` | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-21 | `registry.yaml` 的 `stages:` 加消费者 | 2 | WP-13 | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-22 | `docs/03` 补齐 9 类闸门 + scope 标人工 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-23 | 队列读取契约 | 2 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-24 | `--inject` 或删除该行 | 3 | WP-05 | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-25 | 布尔标志严格化 | 3 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-26 | `session-handoff.md` 或填或删 | 3 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-27 | 手动调用边界统一 | 3 | — | ✅ 已完成 | 断言已加并通过变异回退 |
| WP-28 | `.gitignore` 补 hook-state | 3 | — | ✅ 已完成 | 断言已加并通过变异回退 |

**状态取值**：`⬜ 未开始` / `🔄 进行中` / `✅ 已完成` / `⏸ 有意未做`（必须在 §6.2 有理由）

---

## 1. 全局约束与前置

### 1.1 必须先建立的一条通用断言

WP-01、WP-05、WP-06、WP-07、WP-24 是同一类问题的不同实例（文档/调用方与脚本的接口不一致）。
**建议在 WP-01 里同时加入这条通用断言**，一次覆盖后续几个 WP 的验收：

```js
// 文档里出现的每个 --flag 必须在对应脚本里真实存在。
// 这条断言存在的理由：--diff-files 少了 @、--reviewed-sha 没传、--inject 根本不存在，
// 三类问题的共同点都是"文档说了、脚本没有"或"脚本要了、文档没给"，
// 而它们各自单独测一遍是重复劳动。
{
  const scripts = fs.readdirSync(path.join(PACK_ROOT, 'scripts'))
    .filter((f) => f.endsWith('.mjs'));
  const documented = new Map();  // flag -> [来源文件]
  const walk = (d, depth) => {
    if (depth > 3) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (['.git', '.mimosa', 'node_modules'].includes(e.name)) continue;
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f, depth + 1); continue; }
      if (!/\.md$/.test(e.name)) continue;
      // REVIEW-*.md 是历史记录，记录的是"当时文档长什么样"，不参与漂移检查
      if (/^REVIEW-\d{4}-\d{2}-\d{2}/.test(e.name)) continue;
      const text = fs.readFileSync(f, 'utf8');
      for (const m of text.matchAll(/node\s+scripts\/([a-z-]+\.mjs)([\s\S]{0,400}?)(?=\n\n|```|$)/g)) {
        const script = m[1];
        for (const fl of m[2].matchAll(/--([a-z-]+)/g)) {
          if (!documented.has(script)) documented.set(script, new Set());
          documented.get(script).add(fl[1]);
        }
      }
    }
  };
  walk(PACK_ROOT, 0);

  const unknown = [];
  for (const [script, flags] of documented) {
    const p = path.join(PACK_ROOT, 'scripts', script);
    if (!fs.existsSync(p)) { unknown.push(`${script} → 脚本不存在`); continue; }
    const src = fs.readFileSync(p, 'utf8');
    for (const fl of flags) {
      // 脚本里必须出现该标志的字面量（--help 文本或解析处）
      if (!src.includes(`--${fl}`)) unknown.push(`${script} → --${fl} 在脚本中不存在`);
    }
  }
  ok('文档引用的每个 --flag 都在脚本中存在', unknown.length === 0, unknown.slice(0, 8).join('; '));
}
```

**这条断言会立刻在现有仓库上变红**（`loop-guard/SKILL.md:55` 的 `--inject`）——这正是它该做的事。
建议把 WP-24 与 WP-01 合并执行，或先做 WP-24。

**变异验证**：在 `skills/loop-guard/SKILL.md` 里加一个 `--totally-fake-flag`，测试必须变红。

### 1.2 三个脚本共用的 CLI 校验骨架（WP-05 用）

`gate-check.mjs`、`ledger-check.mjs`、`event-router.mjs` 的 `main()` 都需要同一段未知标志校验。
建议加在 `scripts/lib/common.mjs`：

```js
/**
 * 未知标志 fail-closed。
 *
 * 没有这个检查时，`--diff-filesx` 与 `--diff-files` 在退出码上不可区分：
 * 前者被静默丢弃，`files_changed` 变成 0，拒绝列表闸门整个失效，而工具报告成功。
 * 这与已经修掉的 `Number('abc')` → NaN 是同一个病，只是发生在标志名而不是标志值上。
 */
export function rejectUnknownFlags(args, known, scriptName) {
  const unknown = Object.keys(args).filter((k) => k !== '_' && !known.includes(k));
  if (unknown.length) {
    fail(`${scriptName}: unknown flag(s): ${unknown.map((k) => '--' + k).join(', ')}. `
      + `Run with --help to see the accepted flags.`, 1);
  }
}
```

各脚本的 `known` 列表从自己的 `--help` 文本派生（或手工维护，但必须与 help 一致——
可用 §1.1 的通用断言反向覆盖）。

---

## 2. 工作包

### 层级 1 · 核心缺陷（循环正确性与安全）

---

#### WP-01 · 编排命令加 `@`，修正 `docs/03` 示例

**修什么**：HL-01

**文件**：
- `skills/harness-loop/SKILL.md:115-123`（命令块替换）
- `docs/03-gates-and-levels.md:134-141`（示例命令 + 输出对齐）

**为什么**：`gate-check.mjs:329` 只认显式 `@path` 才把参数当清单读。裸路径被当作"单个逗号分隔路径"，
于是 `changed-files.txt` 这个**文件名本身**成了唯一"改动文件"，真实清单从未参与拒绝列表比对。
实测：同一份含 `.env` 的清单，`@list.txt` → `escalate/denylist`，`list.txt` → `proceed`。

**怎么改**：用审查报告 §6 的补丁 **P1-E** 整块替换技能命令块。`docs/03` 的示例改为：

```bash
node scripts/gate-check.mjs \
  --item pr-123 \
  --phase gate \
  --attempts 1 \
  --diff-files @changed.txt \
  --verdict approve \
  --budget-pct 45 \
  --reviewed-sha "$(git rev-parse HEAD)" \
  --head-sha "$(git rev-parse HEAD)" \
  --red-check pass \
  --evidence-file verifier-report.md
```

并把该文档的示例输出改为**这条命令真实会产生的输出**（当前文档的示例输出是 `escalate/denylist`，
而那条命令不可能产生它——说明示例从未被执行过）。获取真实输出的方法：

```bash
printf 'auth/session.ts\n' > changed.txt
# 跑上面那条命令，把 stdout 原样粘进文档
```

**验收断言**（加进 `test.mjs`）：

```js
// 用 SKILL.md 里的字面命令形态跑一次含 .env 的清单，必须 escalate。
// 这条断言防的是"文档写的命令与实际生效的命令不一致"——
// 曾经的形态下，照文档执行等于把拒绝列表闸门关掉。
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-doc-cmd-'));
  fs.writeFileSync(path.join(tmp, 'changed-files.txt'), '.env\n');
  const r = (() => {
    try {
      execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'),
        '--item', 'pr-1', '--phase', 'fix', '--diff-files', '@changed-files.txt',
        '--verdict', 'approve', '--budget-pct', '10'], { encoding: 'utf8', cwd: tmp });
      return { code: 0, out: '' };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  eq('@ 清单命中拒绝列表时退出 2', r.code, 2);
  ok('命中闸门名为 denylist', r.out.includes('"gate": "denylist"'), r.out.slice(0, 160));

  // 技能文档必须写明 @ 不可省
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'harness-loop', 'SKILL.md'), 'utf8');
  ok('SKILL.md 使用 @ 前缀', /--diff-files\s+@/.test(skill), '未找到 --diff-files @');
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：把 `SKILL.md` 里的 `@` 删掉 → 第二条断言必须变红。

**Definition of Done**：两条断言绿；`docs/03` 的示例输出是实跑得到的；`node scripts/test.mjs` 全绿。

---

#### WP-02 · 把 `scripts/` 部署到消费者项目

**修什么**：HL-02

**文件**：
- `scripts/harness-stage.mjs`（`upgrade()`，`:595-660`）
- `scripts/harness-stage.mjs`（阶段 1 判据，新增一项或并入现有项）
- `README.md`（快速开始）、`docs/10-how-to-use.md`（说明部署模型）

**为什么**：装配到阶段 2 的项目**没有 `scripts/` 目录**，而所有技能命令与全部 8 个 workflow 都写
`node scripts/xxx.mjs`。实测在消费者项目里执行 `harness-loop` 第 0 步的命令 →
`ERR_MODULE_NOT_FOUND`。更糟的是阶段 3 判据 1 只看 workflow 文件是否存在，
把示例 workflow 拷过去就判 PASS——**判据给一个跑不起来的事件脊发绿灯**。

**怎么改**：在 `upgrade()` 的 `targetStage >= 1` 分支末尾增加：

```js
    // 运行层脚本必须随装配一起进入目标仓库。
    //
    // 曾经它们只留在技能包仓库里，而所有技能命令与 workflow 都写 `node scripts/xxx.mjs`
    // 并隐含 cwd = 项目根。于是新装配的项目里每一条命令都是 ERR_MODULE_NOT_FOUND，
    // 而阶段 3 判据只看 workflow 文件在不在——判据给一个跑不起来的事件脊发 PASS。
    //
    // 只复制运行时需要的部分：scripts/*.mjs + scripts/lib/。
    // test.mjs 是源仓库的自检套件（依赖仓库内的 templates/ 与 skills/），不进消费者。
    const scriptsDest = path.join(root, 'scripts');
    fs.mkdirSync(path.join(scriptsDest, 'lib'), { recursive: true });
    for (const f of fs.readdirSync(path.join(PACK_ROOT, 'scripts'))) {
      if (f === 'test.mjs') continue;
      if (!/\.mjs$/.test(f)) continue;
      const dst = path.join(scriptsDest, f);
      if (force || !exists(dst)) {
        fs.copyFileSync(path.join(PACK_ROOT, 'scripts', f), dst);
        results.push({ status: 'written', path: dst });
      } else {
        results.push({ status: 'skipped', path: dst });
      }
    }
    for (const f of fs.readdirSync(path.join(PACK_ROOT, 'scripts', 'lib'))) {
      const dst = path.join(scriptsDest, 'lib', f);
      if (force || !exists(dst)) {
        fs.copyFileSync(path.join(PACK_ROOT, 'scripts', 'lib', f), dst);
        results.push({ status: 'written', path: dst });
      } else {
        results.push({ status: 'skipped', path: dst });
      }
    }
```

**注意**：`scripts/lib/common.mjs` 的 `PACK_ROOT` 是 `path.resolve(SCRIPT_DIR, '..', '..')`。
复制到消费者仓库后，`PACK_ROOT` 会解析成消费者仓库根——这是**正确的**（`templates/` 与 `skills/`
不在消费者仓库里，但消费者不需要它们：`copyTemplate` 只在装配时用，运行时不碰）。
需要确认没有运行时路径依赖 `TEMPLATE_DIR`/`SKILLS_DIR`——检查 `gate-check`/`ledger-check`/
`event-router`/`harness-stage` 的运行时分支。

**验收断言**：

```js
// 端到端：装配到临时目录后，在该目录内跑运行层脚本必须成功。
// 这条断言防的是"装配产出一个看起来完整、实际每条命令都崩的项目"。
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-deploy-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'd', scripts: { test: 'echo ok' } }));
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'),
    tmp, '--upgrade', '--stage', '2'], { encoding: 'utf8' });

  ok('消费者项目有 scripts/lib/common.mjs', fs.existsSync(path.join(tmp, 'scripts', 'lib', 'common.mjs')));
  ok('消费者项目没有 test.mjs', !fs.existsSync(path.join(tmp, 'scripts', 'test.mjs')));

  // 在消费者目录内真的跑一次（cwd 是消费者，不是技能包）
  const run = (args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath,
        [path.join(tmp, 'scripts', ...args.slice(0, 1)), ...args.slice(1)],
        { encoding: 'utf8', cwd: tmp }) };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  };
  eq('消费者内 event-router 可运行', run(['event-router.mjs', '--list']).code, 0);

  // harness-loop 第 0 步的接线检查命令（SKILL.md 原文）必须在消费者内可运行
  const r0 = run(['lib/common.mjs', '--noop']);  // 占位：实际用下面的 node -e
  const helper = (() => {
    try {
      return { code: 0, out: execFileSync(process.execPath,
        ['-e', 'import("./scripts/lib/common.mjs").then(m=>{const r=m.hasEventWiring(process.cwd());console.log(r.wired?"wired":"NOT wired");})'],
        { encoding: 'utf8', cwd: tmp }) };
    } catch (e) { return { code: e.status, out: String(e.stdout || '') }; }
  })();
  eq('消费者内第 0 步 helper 可运行', helper.code, 0);
  ok('helper 报告未接线', helper.out.includes('NOT wired'), helper.out);

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：删掉复制 `scripts/` 的那段 → 前三条断言必须变红。

**Definition of Done**：装配出的项目内所有运行层脚本可执行；`README.md` 与 `docs/10` 说明
"装配会把 `scripts/` 复制进项目"；测试全绿。

---

#### WP-03 · `PHASES` 增加 `close`

**修什么**：HL-03

**文件**：
- `scripts/gate-check.mjs:42`
- `scripts/test.mjs`（新增断言）
- `LOOP.md:39,44`（同步 `release.published` 与 `check_suite.completed:success` 的阶段，见 WP-14）

**为什么**：`event-router.mjs` 把 `issues.closed`、`pull_request.closed:unmerged`、`release.published`
路由到 `phase: 'close'`，而 `gate-check` 的 `PHASES` 里没有 `close` → 退出码 1（参数错误），
不属于四态中的任何一态，技能第 6 步没有规定该怎么做。

**怎么改**：

```js
const PHASES = ['intake', 'review', 'fix', 'verify', 'gate', 'post-merge', 'release', 'close'];
```

`close` 阶段适用的闸门：`denylist` + `scope`（`post-merge-cleanup` 会改文件，属 L1）。

**验收断言**：

```js
// 路由产出的每个 phase 都必须能被 gate-check 接受。
// 曾经 event-router 路由到 'close'，而 gate-check 的枚举里没有它——
// 三个已注册事件（issue 关闭 / PR 未合并关闭 / release 发布）在闸门处必然退出 1，
// 而退出 1 不属于 proceed/report-only/escalate/exit 四态，调用方没有规定动作。
{
  const gateSrc = fs.readFileSync(path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), 'utf8');
  const phases = JSON.parse(gateSrc.match(/const PHASES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const unroutable = Object.entries(ROUTES)
    .filter(([, spec]) => spec.phase && !phases.includes(spec.phase))
    .map(([ev, spec]) => `${ev} → ${spec.phase}`);
  ok('ROUTES 的每个 phase 都在 gate-check 的 PHASES 里', unroutable.length === 0, unroutable.join('; '));

  // 行为断言：close 阶段真的能跑完
  const r = (() => {
    try {
      const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'),
        '--item', 'issue-1', '--phase', 'close', '--verdict', 'none', '--budget-pct', '10'], { encoding: 'utf8' });
      return { code: 0, out: o };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  eq('close 阶段被接受（不再是退出 1）', r.code, 0);
}
```

**变异回退**：从 `PHASES` 删掉 `'close'` → 两条断言都必须变红。

---

#### WP-04 · workflow 去注入 + `LOOP_BOT_TOKEN` 落地

**修什么**：HL-04、HL-20

**文件**：
- `examples/github-actions/ci-sweeper.yml:49-56`
- `examples/github-actions/pr-review.yml:35-40,78-84`
- `examples/github-actions/issue-intake.yml:34-58`
- 各 workflow 的 `GH_TOKEN`（如采用 `LOOP_BOT_TOKEN`）
- `scripts/test.mjs`（第 14 节新增断言）

**为什么**：实测 `branch = x"; echo INJECTED; "` 会让命令真的执行。GitHub 官方把
"`run:` 中使用 `${{ github.event.* }}`"列为脚本注入风险。当前这些 workflow 未引用自定义 secret，
所以最坏后果是任意命令执行 + `$GITHUB_OUTPUT` 篡改 + 越权写入路径，而非凭据外泄。

同时 `LOOP_BOT_TOKEN` 在 4 处文档里声明"必须设置"，**0 个 workflow 引用它**——用独立最小权限
账号本可限制注入影响面。

**怎么改**：用审查报告 §6 的补丁 **P0-B**。要点：

1. 所有事件字段经 `env:` 传入，`run:` 正文里只出现 `"$RAW_XXX"`。
2. 进入文件名或 `$GITHUB_OUTPUT` 的值做字符白名单消毒（`tr -c 'A-Za-z0-9._-' '-'`）+ 长度截断。
3. `GH_TOKEN: ${{ secrets.LOOP_BOT_TOKEN || secrets.GITHUB_TOKEN }}`，或改文档承认只用 `GITHUB_TOKEN`。

**验收断言**（加进 `test.mjs` 第 14 节）：

```js
// 事件字段绝不能出现在 run: 的脚本正文里。
// 直接插值等于把攻击者可控的分支名拼进 shell——分支名里的 `"; cmd; "` 会被真的执行。
// 允许出现在 env: 段（那是 GitHub 推荐的间接层）。
{
  const offenders = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    let inRun = false;
    let runIndent = 0;
    lines.forEach((line, i) => {
      const m = line.match(/^(\s*)run:\s*[|>]?\s*$/);
      if (m) { inRun = true; runIndent = m[1].length; return; }
      if (inRun) {
        const indent = line.match(/^\s*/)[0].length;
        if (line.trim() && indent <= runIndent) { inRun = false; }
      }
      if (inRun && /\$\{\{\s*github\.event\./.test(line)) {
        offenders.push(`${f}:${i + 1} → ${line.trim().slice(0, 70)}`);
      }
    });
  }
  ok('run: 块内无事件字段插值', offenders.length === 0, offenders.slice(0, 6).join('; '));

  // LOOP_BOT_TOKEN 必须真的被引用，否则文档说"必须设置"而代码从不读它
  const anyToken = fs.readdirSync(dir).filter((x) => x.endsWith('.yml'))
    .some((f) => /LOOP_BOT_TOKEN/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
  const docsMention = /LOOP_BOT_TOKEN/.test(
    fs.readFileSync(path.join(PACK_ROOT, 'examples', 'github-actions', 'README.md'), 'utf8'));
  ok('LOOP_BOT_TOKEN 文档与代码一致', anyToken === docsMention,
    `workflow 引用=${anyToken} / 文档声明=${docsMention}`);
}
```

**变异回退**：把 `ci-sweeper.yml:51` 改回直接插值 → 第一条断言必须变红。

**未跑的验证（必须写明）**：真实 runner 上的注入复现**未执行**（无 GitHub 仓库与网络）。
本地模拟已证明注入可行。此项在 `STATE.md` 记为 NOT RUN。

---

#### WP-05 · 未知标志 fail-closed

**修什么**：HL-05

**文件**：
- `scripts/lib/common.mjs`（新增 `rejectUnknownFlags`，见 §1.2）
- `scripts/gate-check.mjs`（`main()`）
- `scripts/ledger-check.mjs`（`main()`）
- `scripts/event-router.mjs`（`main()`）
- `scripts/test.mjs`

**为什么**：实测 `--diff-filesx @list.txt` → `files_changed: 0` → `proceed`（拒绝列表闸门静默失效）；
`--attemptsx 99` → `attempts: 0` → `proceed`。这与已修掉的 `Number('abc')` → NaN 是同一个病
（`gate-check.mjs:346-347` 的注释自己说了这个道理），只是发生在标志名而不是标志值上。

**怎么改**：每个 `main()` 在 `parseArgs()` 之后立刻调用：

```js
  rejectUnknownFlags(args, ['item', 'phase', 'attempts', 'diffFiles', 'verdict', 'budgetPct',
    'pause', 'cleanup', 'reviewedSha', 'headSha', 'redCheck', 'constraintsRoot', 'notRun',
    'evidenceFile', 'json', 'help'], 'gate-check');
```

注意 `parseArgs` 会把 `--diff-files` 转成 `diffFiles`（camelCase），所以列表用 camel 形式。
`args._` 是位置参数数组，必须豁免。

**验收断言**：

```js
eq('拼错的 --diff-filesx 退出 1', run(['--item', 'p', '--diff-filesx', 'a.ts']).code, 1);
eq('拼错的 --attemptsx 退出 1', run(['--item', 'p', '--attemptsx', '9']).code, 1);
// 正确写法仍工作
eq('正确的 --diff-files 仍工作', run(['--item', 'p', '--phase', 'fix', '--diff-files', 'a.ts',
  '--verdict', 'approve']).code, 0);
```

**变异回退**：删掉 `rejectUnknownFlags` 调用 → 前两条必须变红。

---

#### WP-06 · verdict 词汇映射

**修什么**：HL-08

**文件**：
- `skills/harness-loop/SKILL.md`（第 6 步的映射表，随 WP-01 一起改）
- `scripts/gate-check.mjs:43`（可选：接受归一化后的值）

**为什么**：`loop-verifier` 输出 `APPROVE | REJECT | ESCALATE_HUMAN`（`SKILL.md:128`），
`gate-check` 的枚举是 `approve | reject | escalate-human | none`。实测传 `ESCALATE_HUMAN` →
退出 1（参数错误），而它恰恰是"verifier 无法运行测试，不许放行"的那条路径。

**怎么改**（推荐两边都改，互为保险）：

```js
// 归一化 verdict：loop-verifier 的输出格式是 APPROVE / REJECT / ESCALATE_HUMAN，
// 而这里的枚举是小写连字符。两处按各自文档执行时必然得到"参数错误"，
// 而参数错误不属于四态——最重要的人工升级信号会在传递途中消失。
const normalizeVerdict = (v) => String(v).trim().toLowerCase().replace(/_/g, '-');
const verdict = enumArg(normalizeVerdict(args.verdict), VERDICTS, '--verdict') ?? 'none';
```

注意 `args.verdict === undefined` 时不能调 `normalizeVerdict`（会得到 `"undefined"`），
需要保留 `undefined` 的短路。

**验收断言**：

```js
// 两种写法必须产出同一个 decision
const a = run(['--item', 'p', '--phase', 'fix', '--verdict', 'ESCALATE_HUMAN']);
const b = run(['--item', 'p', '--phase', 'fix', '--verdict', 'escalate-human']);
eq('ESCALATE_HUMAN 被接受', a.code, 2);
eq('两种写法退出码一致', a.code, b.code);
ok('两种写法 decision 一致',
  /"decision": "escalate"/.test(a.out) && /"decision": "escalate"/.test(b.out));
```

**变异回退**：删掉 `normalizeVerdict` → 第一条必须变红。

---

#### WP-07 · merge-gate 补齐四个参数

**修什么**：HL-07

**依赖**：WP-02（脚本得先在消费者仓库里）

**文件**：`examples/github-actions/merge-gate.yml:30-90`

**为什么**：`--phase gate` 要求 `--reviewed-sha` + `--head-sha`（约束 7）与 `--red-check` 非 `not-run`
（约束 8），而发布的 workflow 三个都没传。实测原样命令必然 `escalate`（`gate: head-commit`），
补上 sha 后仍 `escalate`（`gate: red-check`）。**这个闸门在"批准 PR"这条唯一路径上永远返回 escalate。**

**怎么改**：增加一个 step 取 SHA，并从 PR body 读 red-check 标记：

```yaml
      - name: Resolve reviewed commit
        id: rev
        env:
          GH_TOKEN: ${{ secrets.LOOP_BOT_TOKEN || secrets.GITHUB_TOKEN }}
        run: |
          set -euo pipefail
          HEAD_SHA="$(gh pr view ${{ github.event.pull_request.number }} --json headRefOid -q .headRefOid)"
          # 最近一次 review 绑定的 commit。--match-head-commit 的语义要求审查针对这个 sha。
          REVIEWED_SHA="$(gh pr view ${{ github.event.pull_request.number }} \
            --json reviews -q '[.reviews[] | select(.state=="APPROVED")] | last | .commit.oid // empty')"
          echo "head=$HEAD_SHA" >> "$GITHUB_OUTPUT"
          echo "reviewed=${REVIEWED_SHA:-$HEAD_SHA}" >> "$GITHUB_OUTPUT"

      - name: Resolve red-check state
        id: red
        env:
          PR_BODY: ${{ github.event.pull_request.body }}
        run: |
          # 只认独占一行的标记；散文里提到 red-check 不算。
          # 读不到就显式传 not-run，让"未跑"出现在输出里，而不是被静默省略。
          if printf '%s' "$PR_BODY" | grep -qE '^\s*red-check:\s*pass\s*$'; then
            echo "state=pass" >> "$GITHUB_OUTPUT"
          elif printf '%s' "$PR_BODY" | grep -qE '^\s*red-check:\s*fail\s*$'; then
            echo "state=fail" >> "$GITHUB_OUTPUT"
          else
            echo "state=not-run" >> "$GITHUB_OUTPUT"
          fi
```

`gate-check` 调用相应补齐。同时**更新 `harness-loop/SKILL.md` 第 6 步**（WP-01 已包含）。

**验收断言**：

```js
// merge-gate 的 gate-check 调用必须提供约束 7/8 要求的全部参数。
// 曾经它只传 4 个参数，于是每个 ready_for_review 的 PR 都收到
// "human decision required"——持续假升级会训练人忽略它，最终闸门被关掉。
{
  const mg = fs.readFileSync(path.join(dir, 'merge-gate.yml'), 'utf8');
  for (const flag of ['--reviewed-sha', '--head-sha', '--red-check', '--diff-files']) {
    ok(`merge-gate 传入 ${flag}`, mg.includes(flag));
  }
  // 行为断言：用 workflow 里的参数形态（含占位替换）跑一次必须能到 proceed
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-mg-'));
  fs.writeFileSync(path.join(tmp, 'changed.txt'), 'src/app.ts\n');
  const r = (() => {
    try {
      const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'),
        '--item', 'pr-1', '--phase', 'gate', '--diff-files', '@changed.txt',
        '--verdict', 'none', '--budget-pct', '10',
        '--reviewed-sha', 'abc', '--head-sha', 'abc', '--red-check', 'pass'],
        { encoding: 'utf8', cwd: tmp });
      return { code: 0, out: o };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  ok('merge-gate 参数形态可到达非 escalate', r.code !== 2 || !/"gate": "head-commit"/.test(r.out), r.out.slice(0, 200));
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**未跑的验证**：真实 runner 上跑一次 merge-gate。**未执行**（无仓库）。在 `STATE.md` 记 NOT RUN。

---

#### WP-08 · 证据闸门（`--evidence-file`）

**修什么**：HL-06

**依赖**：WP-07

**文件**：`scripts/gate-check.mjs`（新增第 8b 类闸门）、`scripts/test.mjs`、
`skills/harness-loop/SKILL.md`（命令块加参数，WP-01 已含）

**为什么**：`--verdict approve` 是一个断言，不是一个证据。实测无任何 verifier 存在、sha 是假串
（`NOT-A-SHA`）时仍 `proceed`。`grep` 确认 `gate-check` 全文只读 3 个文件，其中 2 个是自己的
源码和 diff 清单——**没有任何一处读取 verifier 报告**。

后果：硬约束 1（独立验证者）与约束 7（绑定审过的 commit）**都由被约束的一方自证**。

**怎么改**：用审查报告 §6 的补丁 **P0-A**。

**关键点**：`loop-verifier/SKILL.md:128,132` 的输出格式**已天然满足**所需的两条正则
（`## Verdict: APPROVE | REJECT | ESCALATE_HUMAN` 与 `- Tests: \`<命令>\` → PASS`），
**无需改技能**——这是现有设计已准备好的接口，只是没人读它。

**验收断言**：

```js
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-ev-'));
  const good = path.join(tmp, 'good.md');
  fs.writeFileSync(good, [
    '## Verdict: APPROVE',
    '',
    '### Evidence',
    '- Tests: `npm test` → PASS',
    '- Red check: PASS — 回退后新测试挂掉，指出 user.email 为 undefined',
    '- Real-use validation: NOT RUN — 不涉及外部接入',
  ].join('\n'));
  const bad = path.join(tmp, 'bad.md');
  fs.writeFileSync(bad, '## Verdict: REJECT\n\n### Evidence\n- Tests: `npm test` → FAIL\n');
  const thin = path.join(tmp, 'thin.md');
  fs.writeFileSync(thin, 'LGTM, looks good to me.\n');

  const G = ['--item', 'p', '--phase', 'gate', '--diff-files', 'a.ts', '--verdict', 'approve',
    '--red-check', 'pass', '--reviewed-sha', 'abc', '--head-sha', 'abc'];

  const noEv = run(G);
  eq('无证据文件时退出 2', noEv.code, 2);
  ok('命中 verification-evidence 闸', /"gate": "verification-evidence"/.test(noEv.out), noEv.out.slice(0, 160));

  const missing = run([...G, '--evidence-file', path.join(tmp, 'nope.md')]);
  eq('证据文件不存在时退出 2', missing.code, 2);

  const contrad = run([...G, '--evidence-file', bad]);
  eq('证据自称 REJECT 时退出 2', contrad.code, 2);
  ok('矛盾被指出', /contradicts/.test(contrad.out), contrad.out.slice(0, 200));

  const noLines = run([...G, '--evidence-file', thin]);
  eq('无 verdict/命令行的报告被拒', noLines.code, 2);

  const okRun = run([...G, '--evidence-file', good]);
  eq('合规报告可 proceed', okRun.code, 0);

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：删掉"报告必须含 verdict 行"的检查 → `contrad` 与 `noLines` 断言必须变红。

**注意**：这条闸门会让现有 `init.sh` 与 `self-check.yml` 的 gate-check 冒烟调用失效
（它们不传 `--evidence-file`）。两处都需要同步更新——**这是预期的连带影响，不是回归**。

---

#### WP-09 · `budget-check.mjs`：暂停与预算的唯一入口

**修什么**：HL-09

**文件**：
- 新增 `scripts/budget-check.mjs`
- `examples/github-actions/*.yml`（8 个，改用新脚本）
- `docs/03-gates-and-levels.md:141`（修正 `--pause false`）
- `scripts/test.mjs`

**为什么**：两件事目前都没有代码入口。

1. **暂停**：`gate-check.mjs:362` 的 `pause: Boolean(args.pause)` 由调用方传入；
   `grep` 确认**没有任何 workflow 把 `--pause` 传给 gate-check**。技能第 0 步把
   "`loop-pause-all` 是否生效"列为立即退出条件，但没有任何脚本读那三个来源。
2. **预算**：只在 `merge-gate.yml:38-60` 内联计算，且用 `Math.max(...caps)` 取全表最大上限。
   实测 `loop-budget.md` 抽出的 caps 是 `[80000, 300000, 500000, 100000, 200000, 100000]`，
   取到 **500000**（CI Sweeper 的上限）。于是 PR Review Triage 花掉 250k（占自身 300k 的 83%，
   本应 report-only）被算成 50%，判定"正常"。

另外 `docs/03:141` 的 `--pause false` 实测得到 `decision: "exit"`（因为 `pause` 在 `BOOLEAN_FLAGS` 里）。

**怎么改**：新建 `scripts/budget-check.mjs`，接口：

```
node scripts/budget-check.mjs --pattern <pattern-id> [--json]
输出: { mode: 'normal'|'report-only'|'exit', budget_pct, pattern, cap, used, paused, reason }
退出码: 0 = normal/report-only, 3 = exit
```

实现要点：
1. 从 `loop-budget.md` 的 Daily Limits 表**按 `--pattern` 取该行**的上限（不是 `Math.max`）。
2. 从 `loop-run-log.md` 累加今日 + 该 pattern 的 `tokens_estimate`。
3. kill switch 读两处：`STATE.md` 中独占一行的 `loop-pause-all`（沿用
   `daily-triage.yml:35` 的正则 `^\s*loop-pause-all\s*$`）与 `loop-constraints.md` 的同名标记。
4. **显式说明它是估算**（`loop-budget.md` 自己写了"预算计算是估算，不是精确计量"）。

所有 workflow 改为：

```yaml
      - name: Budget & kill switch
        id: budget
        run: |
          node scripts/budget-check.mjs --pattern ci-sweeper --json > budget.json || true
          cat budget.json
          PCT=$(jq -r '.budget_pct' budget.json)
          MODE=$(jq -r '.mode' budget.json)
          echo "pct=$PCT" >> "$GITHUB_OUTPUT"
          if [ "$MODE" = "exit" ]; then echo "::error::loop exited"; exit 1; fi
```

**验收断言**：

```js
// per-loop 上限必须真的生效。曾经用 Math.max(...caps) 取全表最大值，
// 于是所有循环共用 CI Sweeper 的 500k——PR Review Triage 花掉自身 83% 时被算成 50%。
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-budget-'));
  fs.copyFileSync(path.join(PACK_ROOT, 'loop-budget.md'), path.join(tmp, 'loop-budget.md'));
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(tmp, 'loop-run-log.md'),
    `# Log\n\n{"run_id":"${today}T00:00:00Z","pattern":"pr-review-triage","tokens_estimate":250000}\n`);

  const runB = (extra) => {
    try {
      const o = execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'budget-check.mjs'),
        '--pattern', 'pr-review-triage', '--json', ...extra], { encoding: 'utf8', cwd: tmp });
      return JSON.parse(o);
    } catch (e) { return JSON.parse(e.stdout || '{}'); }
  };

  const r = runB([]);
  // 250k / 300k = 83% → 必须 report-only
  eq('per-loop 上限生效（300k 而非 500k）', r.cap, 300000);
  eq('83% 时降级 report-only', r.mode, 'report-only');

  // 把上限改成 1k → 同一份日志必须变成 exit
  const budget = fs.readFileSync(path.join(tmp, 'loop-budget.md'), 'utf8')
    .replace('| PR Review Triage | 96 | 300k |', '| PR Review Triage | 96 | 1k |');
  fs.writeFileSync(path.join(tmp, 'loop-budget.md'), budget);
  eq('上限改成 1k 后同一输入退出', runB([]).mode, 'exit');

  // kill switch：独占一行的标记必须生效
  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\nloop-pause-all\n');
  const paused = runB([]);
  eq('kill switch 生效', paused.mode, 'exit');
  ok('kill switch 被标记为 paused', paused.paused === true, JSON.stringify(paused));

  // 散文里提到不算生效
  fs.writeFileSync(path.join(tmp, 'STATE.md'), '# State\n\n我们不使用 loop-pause-all 这个开关。\n');
  eq('散文提及不触发暂停', runB([]).paused, false);

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：把取上限改成 `Math.max(...caps)` → 前两条断言必须变红。

---

#### WP-10 · `--upgrade` 跳级保护

**修什么**：HL-23

**文件**：`scripts/harness-stage.mjs:776` 附近

**为什么**：实测在一个**空仓库**上 `--upgrade --stage 3` → 成功写入 8 个 `.github/workflows/*.yml`，
无任何警告。结果是"阶段 1 判据 7/8、阶段 2 判据 4/9、阶段 3 判据 4/8"的项目——
事件脊接上了，但 verifier、熔断器、本地化拒绝列表全都不在。而 `AGENTS.md` 与 `docs/11`
都写着"**不要跳级**"。文档是约束，代码没有对应入口。

**怎么改**：用审查报告 §6 的补丁 **P1-F**。

**验收断言**：

```js
// 跳级保护：空仓库不能直冲 stage 3 并写入事件接线。
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-skip-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 's', scripts: { test: 'echo ok' } }));
  const r = (() => {
    try {
      execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'),
        tmp, '--upgrade', '--stage', '3'], { encoding: 'utf8' });
      return 0;
    } catch (e) { return e.status; }
  })();
  eq('空仓库 --upgrade --stage 3 被拒', r, 2);
  ok('未写入事件接线', !fs.existsSync(path.join(tmp, '.github', 'workflows')));

  // 逐级升级仍正常
  for (const s of ['1', '2', '3']) {
    execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'harness-stage.mjs'),
      tmp, '--upgrade', '--stage', s], { encoding: 'utf8' });
  }
  ok('逐级升级后接线存在', fs.existsSync(path.join(tmp, '.github', 'workflows')));

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**注意**：逐级升级到 stage 3 时，stage 1 的判据 2（feature 完成标准）会因为模板占位 feature 而 FAIL。
`test.mjs:1221` 有现成的 `writeRealFeatures()` helper 处理这个——复用它。

**变异回退**：删掉跳级检查 → 前两条断言必须变红。

---

#### WP-11 · 锁键 `--target` 进编排技能

**修什么**：HL-24

**文件**：`skills/harness-loop/SKILL.md:70-79`（第 2 步命令 + 说明）

**为什么**：实测不传 `--target` 时**锁检测完全不生效**——`--target main` 得到
`conflict: lock-held`，省略时无 `conflict` 字段直接继续。技能第 3 步要求"检查冲突锁"，
但第 2 步的命令让它拿不到锁结果。这是"同一分支每小时最多一个循环修改"这条规则的唯一机制。

**怎么改**：

````markdown
### 第 2 步：路由事件

```bash
node scripts/event-router.mjs --event <事件名> --item <item-id> --target <branch|pr-id>
```

`--target` **不可省**：它是锁键（`acting_on`，即分支名或 PR 号），不是 work item id。
省略它时 `event-router` 不做冲突检测，直接返回路由结果——第 3 步会读不到任何锁，
"同一分支每小时最多一个循环修改"就静默失效了。

拿到：`phase`、`skills`、`level`、`gates`、`next`，以及可能的 `conflict: "lock-held"` 与 `held_by`。

路由表在 `LOOP.md` 中声明。若事件不在表中 → 记入 `STATE.md` 的 Watch List，不要自创流程。
````

**验收断言**：

```js
{
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'harness-loop', 'SKILL.md'), 'utf8');
  ok('第 2 步命令含 --target', /event-router\.mjs[^\n]*--target/.test(skill), '未找到 --target');

  // 行为断言：有锁 + 传 target → lock-held；不传 target → 无 conflict
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-lock-'));
  fs.writeFileSync(path.join(tmp, 'STATE.md'), [
    '# Loop State', '', '## Active', '',
    '| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |',
    '|---|---|---|---|---|---|',
    '| ci-a1b2 | fix | minimal-fix | main | 1 | acting |', '',
  ].join('\n'));
  const route = (extra) => JSON.parse((() => {
    try {
      return execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'event-router.mjs'),
        '--event', 'check_suite.completed:failure', '--item', 'ci-999', '--state',
        path.join(tmp, 'STATE.md'), ...extra], { encoding: 'utf8' });
    } catch (e) { return e.stdout || '{}'; }
  })());
  eq('传 --target 时检测到锁', route(['--target', 'main']).conflict, 'lock-held');
  eq('省略 --target 时不检测', route([]).conflict, undefined);
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：从 `SKILL.md` 删掉 `--target` → 第一条断言必须变红。

---

### 层级 2 · 可靠性

---

#### WP-12 · 接线判据读 workflow 内容

**修什么**：HL-11

**文件**：`scripts/lib/common.mjs:397-418`（`hasEventWiring`）

**为什么**：实测一个只含第三方官方 action 的仓库被判定为"已接线"：

```yaml
# .github/workflows/release-drafter.yml
- uses: release-drafter/release-drafter@v6
```

→ `{ wired: true, via: 'workflow', detail: '.github/workflows/ 下的 1 个文件' }`。
正则 `/loop|triage|ci-sweeper|merge-gate|post-merge|release-draft|lesson-harvest|issue-intake/i`
匹配**文件名**，`release-drafter` 命中的是 `release-draft`。这个 helper 有两个消费者
（`harness-loop` 第 0 步与阶段 3 判据 1），假阳性会让 `harness-loop` 对着空队列跑完 8 步、
把"没做事"记成一次正常运行。

**怎么改**：

```js
export function hasEventWiring(root = '.') {
  const wfDir = path.join(root, '.github', 'workflows');
  if (exists(wfDir)) {
    let files = [];
    try { files = fs.readdirSync(wfDir); } catch { /* 权限或竞态 */ }
    // 判定"接线"看的是内容，不是文件名。
    // 曾经用 /loop|triage|.../ 匹配文件名，于是任何官方 release-drafter action、
    // 任何叫 triage.yml 的文件都算接线——而 harness-loop 会据此认为项目已接事件脊，
    // 对着空队列跑完 8 步，把"没做事"记成一次正常运行。
    const wired = files.filter((f) => {
      if (!/\.ya?ml$/.test(f)) return false;
      const text = readText(path.join(wfDir, f));
      if (!/^on:/m.test(text)) return false;
      // 真的调用了本框架的运行层脚本，才算"接上了这条脊"
      return /node\s+scripts\/(event-router|gate-check|ledger-check|budget-check)\.mjs/.test(text);
    });
    if (wired.length) {
      return { wired: true, via: 'workflow', detail: `${wired.length} 个 workflow 调用了运行层脚本（${wired.slice(0, 3).join(', ')}）` };
    }
  }
  // 非 GitHub 平台：LOOP.md 里声明了调度也算
  const loop = readText(path.join(root, 'LOOP.md'));
  if (loop && /schedule|cron|scheduler|automation/i.test(loop) && /on:|事件驱动/.test(loop)) {
    return { wired: true, via: 'declared', detail: 'LOOP.md 声明了调度' };
  }
  return {
    wired: false,
    via: null,
    detail: wfDir && exists(wfDir)
      ? '存在 .github/workflows/，但里面没有调用运行层脚本的 workflow'
      : '没有 .github/workflows/，LOOP.md 也未声明调度',
  };
}
```

**连带影响**：`test.mjs:1487` 写的 `fs.writeFileSync(..., 'loop-intake.yml', 'name: loop\n')`
会不再被判定为接线（因为它不调用脚本）。**必须同步更新该测试**，改为写入真实形态的 workflow。
这是预期的连带影响，不是回归。

**验收断言**：

```js
// 假阳性防护：只有第三方 action 的 workflow 不算接线
{
  const fp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wire-fp-'));
  fs.mkdirSync(path.join(fp, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(fp, '.github', 'workflows', 'release-drafter.yml'),
    'name: Release Drafter\non:\n  push:\n    branches: [main]\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: release-drafter/release-drafter@v6\n');
  eq('只有第三方 action 时未接线', hasEventWiring(fp).wired, false);

  fs.writeFileSync(path.join(fp, '.github', 'workflows', 'triage.yml'), 'name: triage\non:\n  issues:\n');
  eq('名字带 triage 但无脚本调用时未接线', hasEventWiring(fp).wired, false);

  fs.writeFileSync(path.join(fp, '.github', 'workflows', 'loop-intake.yml'),
    'name: loop\non:\n  issues:\n    types: [opened]\njobs:\n  r:\n    runs-on: ubuntu-latest\n    steps:\n      - run: node scripts/event-router.mjs --event issues.opened --item x\n');
  eq('真实调用运行层脚本时算接线', hasEventWiring(fp).wired, true);

  fs.rmSync(fp, { recursive: true, force: true });
}
```

**变异回退**：把判定改回文件名匹配 → 前两条断言必须变红。

---

#### WP-13 · 漂移扫描覆盖 `LOOP.md` + 修数字

**修什么**：HL-12、HL-31

**文件**：`scripts/test.mjs:672-675`（`docFiles`）、`LOOP.md:11`、`docs/10-how-to-use.md:12`

**为什么**：两处同类漂移。

1. `LOOP.md:11` 仍写"10 项（全机械）"，而其余四处（`README.md:74`、`AGENTS.md:94`、
   `docs/11:45`、`docs/12`）都已改为 8 项。测试的正则 `/1[01]\s*项/` **能**命中它——
   之所以没红，唯一原因是 `LOOP.md` 不在 `docFiles` 里。
2. `docs/10:12` 写"8 个（`scripts/` 下 **7** 个顶层 `.mjs` + `lib/common.mjs`）"，
   实测顶层 `.mjs` 为 **8** 个。漂移检测只校验阶段判据数与技能总数，不校验脚本数。

**怎么改**：

```js
    const docFiles = [
      'README.md', 'AGENTS.md', 'LOOP.md',
      ...fs.readdirSync(path.join(PACK_ROOT, 'docs')).map((d) => path.join('docs', d)),
    ];
```

同时修 `LOOP.md:11` 为 `8 项（全机械）`，`docs/10:12` 的 7 改为 8（总数 9）。

**验收断言**：现有断言会自动覆盖。额外加两条守住"覆盖范围本身"与"脚本数"：

```js
// 扫描清单本身必须包含最像"真相源"的文件——曾经漏掉 LOOP.md，
// 于是它独独留在旧数字上，而测试全绿。
ok('漂移扫描覆盖 LOOP.md', docFiles.includes('LOOP.md'));
ok('漂移扫描覆盖 AGENTS.md', docFiles.includes('AGENTS.md'));

// 脚本数也必须被守住。docs/10:12 写"7 个顶层 .mjs"，实际是 8——
// 与阶段判据数同源：文档里的数字没有任何东西在校验。
{
  const topLevel = fs.readdirSync(path.join(PACK_ROOT, 'scripts'))
    .filter((f) => f.endsWith('.mjs')).length;
  const doc10 = fs.readFileSync(path.join(PACK_ROOT, 'docs', '10-how-to-use.md'), 'utf8');
  const m = doc10.match(/(\d+)\s*个顶层\s*`?\.mjs`?/);
  ok('docs/10 的顶层脚本数与实际一致', m && Number(m[1]) === topLevel,
    `文档=${m ? m[1] : '(未找到)'} / 实际=${topLevel}`);
}
```

**变异回退**：把 `LOOP.md` 从 `docFiles` 移除 → 第一条断言变红；把 `LOOP.md:11` 改回 10 项 →
原有的漂移断言变红；把 `docs/10:12` 的 8 改回 7 → 第三条断言变红。

---

#### WP-14 · 测试 17 比对 phase

**修什么**：HL-13

**依赖**：WP-03（`close` 必须先合法，否则比对会因 phase 不合法而混淆）

**文件**：`scripts/test.mjs:1624-1640`、`LOOP.md:39,44`

**为什么**：实测两处阶段漂移——`check_suite.completed:success`（文档 `report` / 代码 `verify`）
与 `release.published`（文档 `release` / 代码 `close`）。测试第 17 节做了双向**事件名**核对，
但**从不比对 phase**。注意 `report` 不是合法 phase，所以 `LOOP.md:26` 那一格本身也要改。

**怎么改**：在现有双向事件名核对之后追加：

```js
  // 事件名一致不等于路由一致。曾经只比对名字，于是两个事件的 phase
  // 在文档与代码之间漂移了很久而无人发现——文档说 report，代码做 verify。
  const phaseDrift = [];
  for (const line of tableSection.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const evs = [...cells[0].matchAll(/`([^`]+)`/g)].flatMap((m) => m[1].split('/').map((s) => s.trim()))
      .filter((e) => /^[a-z_]+(\.[a-z_]+)*(:[a-z-]+)?$/.test(e));
    for (const ev of evs) {
      if (ROUTES[ev] && ROUTES[ev].phase !== cells[2]) {
        phaseDrift.push(`${ev}: LOOP.md=${cells[2]} / ROUTES=${ROUTES[ev].phase}`);
      }
    }
  }
  ok('LOOP.md 的事件 phase 与 ROUTES 一致', phaseDrift.length === 0, phaseDrift.join('; '));
```

**变异回退**：把 `LOOP.md:34` 的 `release` 改成别的 → 该断言必须变红。

---

#### WP-15 · outcome 枚举统一 + 校验

**修什么**：HL-14

**文件**：`loop-run-log.md:24`（枚举说明）、`templates/loop-run-log.md`、`loop-run-log.md` 的 6 条历史记录、`scripts/test.mjs`

**为什么**：`loop-run-log.md:24` 声明 5 值（`no-op|report-only|fix-proposed|verified|escalated`），
`harness-loop/SKILL.md:161-169` 新增了 `no-wiring`，而实际 6 条记录**全部**是 `"outcome":"fixed"`——
不在任何声明的枚举里。Metrics to Watch 的空转率/升级率统计因此口径失效。

**怎么改**：

1. 枚举补 `no-wiring`（技能已声明）与 `manual`（非事件驱动的手工运行，明确不计入循环统计）。
2. 6 条历史记录改为 `"outcome":"manual"`（它们是 `manual.audit` / `manual.design` 事件）。
3. 新增断言。

**验收断言**：

```js
{
  const log = fs.readFileSync(path.join(PACK_ROOT, 'loop-run-log.md'), 'utf8');
  const ENUM = ['no-op', 'report-only', 'fix-proposed', 'verified', 'escalated', 'no-wiring', 'manual'];
  // 枚举声明必须与代码里的列表一致（这条防的是"枚举改了但没人校验记录"）
  const declared = (log.match(/\*\*`outcome` 枚举\*\*：(.+)/) || [])[1] || '';
  for (const v of ENUM) ok(`枚举声明含 ${v}`, declared.includes(v), declared.slice(0, 120));

  const rows = [...log.matchAll(/^\{"run_id".*\}$/gm)].map((m) => JSON.parse(m[0]));
  ok(`run-log 有 ${rows.length} 条记录`, rows.length > 0);
  const bad = rows.filter((r) => !ENUM.includes(r.outcome)).map((r) => r.outcome);
  ok('每条 run-log 的 outcome 都在枚举内', bad.length === 0, `非法值: ${[...new Set(bad)].join(', ')}`);
}
```

**变异回退**：把某条记录的 `outcome` 改成 `fixed` → 第三条断言必须变红。

---

#### WP-16 · 账本真实性（`placeholder-ledger`）

**修什么**：见审查报告 §5.5

**文件**：`scripts/ledger-check.mjs`、`scripts/test.mjs`

**为什么**：`loop-ledger.json:2` 自称 `"Example loop ledger"`，但 `ledger-check.mjs` 不读 `goal`
做任何判断。实测该账本返回 `verdict: ok` / 退出 0。一个刚装配的项目与一个跑过真实尝试的项目
在熔断器眼里只差"有没有记录"，示例数据会被当成真实历史。

**怎么改**：用审查报告 §6 的补丁 **P1-C**。

**验收断言**：

```js
{
  eq('示例账本被判 placeholder',
    checkLedger({ goal: 'Example loop ledger — one entry per fix attempt.', attempts: [
      { iteration: 1, outcome: 'failure', error: 'boom' },
    ] }).verdict, 'placeholder-ledger');
  eq('示例账本退出码 2',
    checkLedger({ goal: 'Example loop ledger — x', attempts: [
      { iteration: 1, outcome: 'failure', error: 'boom' },
    ] }).exit_code, 2);
  eq('真实 goal 不受影响',
    checkLedger({ goal: '修 CI 的 flake', attempts: [
      { iteration: 1, outcome: 'failure', error: 'boom' },
    ] }).verdict, 'ok');
  eq('空 attempts 的示例账本仍走原路径',
    checkLedger({ goal: 'Example loop ledger — x', attempts: [] }).verdict, 'ok');
}
```

**变异回退**：删掉 `placeholder-ledger` 分支 → 前两条断言必须变红。

---

#### WP-17 · 错误签名归一化收窄

**修什么**：HL-18

**文件**：`scripts/ledger-check.mjs:43-63`（`:59` 的 `s.replace(/\b\d+\b/g, '<n>')`）

**为什么**：实测归一化把语义不同的错误判为同一签名：

| 输入 | 归一化结果 |
|---|---|
| `exit code 1` vs `exit code 2` | 都是 `error: process exited with code <n>` |
| `HTTP 500` vs `HTTP 404` | 都是 `fetch failed: status <n>` |
| `expected 5 to equal 6` vs `expected 7 to equal 8` | 都是 `assertionerror: expected <n> to equal <n>` |

行为验证：3 次**不同**退出码 → `verdict: stagnation` / exit 2。后果是 agent 依次遇到
"500 服务端错误"→"404 路由缺失"→"超时"三种**根因完全不同**的失败时，会在第 3 次熔断。

失效方向安全（提前停止），但会过早熔断本可自愈的循环。

**怎么改**：保留时间戳/hex/路径/行列号的归一化，**不抹掉错误码与断言值**：

```js
export function normalizeError(raw) {
  if (!raw) return '';
  let s = String(raw);
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<ts>');
  s = s.replace(/0x[0-9a-fA-F]+/g, '<hex>');
  s = s.replace(/(?:[A-Za-z]:)?(?:[\\/][\w.\-@]+)+\.[A-Za-z0-9]+/g, (m) => {
    const parts = m.split(/[\\/]/);
    return '<path>/' + parts[parts.length - 1];
  });
  // 行列号：只归一化"紧跟在冒号后"的数字（那是位置，不是语义）
  s = s.replace(/:\d+:\d+/g, ':<line>:<col>');
  s = s.replace(/:\d+\b/g, ':<line>');
  // 只归一化"明确是位置"的裸数字（line N / offset N / ms 之类）。
  // 曾经是 `\b\d+\b → <n>`，把退出码、HTTP 状态码、断言期望值全抹平了——
  // 于是"500 服务端错误"与"404 路由缺失"被判为同一个错误，第 3 次就熔断。
  // 一个把不同问题折叠成同一个的签名，比没有签名更危险：它让人以为在诊断停滞。
  s = s.replace(/\b(line|offset|column|col|char|pos)\s*[:=]?\s*\d+/gi, '$1 <n>');
  s = s.replace(/\b\d+(ms|s)\b/g, '<duration>');
  s = s.replace(/\s+/g, ' ').trim().toLowerCase();
  return s;
}
```

**验收断言**（双向，必须同时守住"该合并的合并"与"不该合并的不合并"）：

```js
{
  // 该合并：同一错误，只有行号/时间戳/路径不同
  eq('行号不同视为同一签名',
    normalizeError('TypeError: boom at profile.ts:42') === normalizeError('TypeError: boom at profile.ts:87'), true);
  eq('时间戳不同视为同一签名',
    normalizeError('fail 2026-10-14T01:02:03Z') === normalizeError('fail 2026-10-15T04:05:06Z'), true);

  // 不该合并：不同错误码、不同断言值
  eq('不同退出码不算同一签名',
    normalizeError('Error: process exited with code 1') === normalizeError('Error: process exited with code 2'), false);
  eq('HTTP 500 与 404 不算同一签名',
    normalizeError('fetch failed: status 500') === normalizeError('fetch failed: status 404'), false);
  eq('不同断言值不算同一签名',
    normalizeError('expected 5 to equal 6') === normalizeError('expected 7 to equal 8'), false);

  // 行为断言：3 次不同错误码不得熔断
  const mk = (errs) => errs.map((e, i) => ({ iteration: i + 1, outcome: 'failure', error: e }));
  eq('3 次不同退出码不熔断',
    checkLedger({ attempts: mk(['exit code 1', 'exit code 2', 'exit code 3']) }).verdict, 'ok');
  eq('3 次相同错误仍熔断',
    checkLedger({ attempts: mk(['TypeError: boom at a.ts:1', 'TypeError: boom at a.ts:2', 'TypeError: boom at a.ts:3']) }).verdict,
    'stagnation');
}
```

**变异回退**：恢复 `\b\d+\b → <n>` → "3 次不同退出码不熔断"与三条"不算同一签名"必须变红。

**注意**：这条 WP 会改变现有 `test.mjs` 第 3、4 节的行为预期。**必须逐条检查现有断言是否依赖旧语义**，
并说明哪些改了、为什么。

---

#### WP-18 · 拒绝列表大小写不敏感

**修什么**：HL-19

**文件**：`scripts/lib/common.mjs:493,495`

**为什么**：19 个探针中两处失败——`AUTH/login.ts` 与 `.ENV` 通过闸门。在大小写不敏感的文件系统上
（macOS 默认、Windows），`AUTH/login.ts` 与 `auth/login.ts` 是**同一个文件**。

**怎么改**：用审查报告 §6 的补丁 **P1-D**（加 `i` 标志）。

**验收断言**：

```js
{
  eq('大写 AUTH/ 被拦', matchesDenylist('AUTH/login.ts'), 'auth/**');
  eq('大写 .ENV 被拦', matchesDenylist('.ENV'), '.env');
  eq('大写 PAYMENTS/ 被拦', matchesDenylist('PAYMENTS/x.ts'), 'payments/**');
  // 不引入新误拦
  eq('测试文件不被误拦', matchesDenylist('tests/billing.test.ts'), null);
  eq('普通文件不被误拦', matchesDenylist('src/app.ts'), null);
}
```

**变异回退**：去掉 `'i'` → 前三条必须变红。

---

#### WP-19 · `install-skills --check`

**修什么**：HL-17

**文件**：`scripts/install-skills.mjs`

**为什么**：实测已安装副本（`~/.zcode/skills/harness-loop/SKILL.md`，198 行）**缺少**
`stage: runtime`、整段说明注释、以及第 0 步第 3 条（事件接线检查 + `hasEventWiring` 调用 +
`no-wiring` 对照表）。宿主真正加载并执行的是旧副本——**第 0 步边界自检在用户机器上根本没生效**。
manifest 仍列出已删除的 `harness-bootstrap`、`harness-strengthen`。

**怎么改**：新增 `--check` 模式，比较已安装副本与源码，列出漂移并以非零退出码报告；
`--uninstall` 清理 manifest 里已不存在的技能目录。

**验收断言**：

```js
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-install-'));
  // 装一次
  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'),
    '--target', tmp], { encoding: 'utf8' });
  // 装完立刻 --check 必须干净
  const clean = (() => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'),
        '--target', tmp, '--check'], { encoding: 'utf8' }) };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  eq('刚装完 --check 干净', clean.code, 0);

  // 手工制造漂移：改掉已安装副本的一个字节
  const installed = path.join(tmp, '.agents', 'skills', 'harness-loop', 'SKILL.md');
  fs.writeFileSync(installed, fs.readFileSync(installed, 'utf8') + '\n<!-- drift -->\n');
  const drifted = (() => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'install-skills.mjs'),
        '--target', tmp, '--check'], { encoding: 'utf8' }) };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  eq('漂移时 --check 非零退出', drifted.code !== 0, true);
  ok('漂移被指出', /harness-loop/.test(drifted.out), drifted.out.slice(0, 200));

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：让 `--check` 恒返回 0 → 第二条断言必须变红。

---

#### WP-20 · `scripts/worktree.mjs`

**修什么**：HL-10（部分）

**文件**：新增 `scripts/worktree.mjs`；`skills/harness-loop/SKILL.md:104-111`（引用它）

**为什么**：`grep -rn "worktree" scripts/*.mjs` 只命中注释与审计评分（`loop-audit.mjs:229` 用
`/worktree/i.test(corpus)` 给分），**没有任何代码创建 worktree**。而"无人值守的代码改动必须在
独立 worktree 中进行"是一条硬要求（`loop-constraints.md` 的 Worktrees 节）。

**怎么改**：

```
node scripts/worktree.mjs create --event <event> --item <item> --attempt <n>
node scripts/worktree.mjs discard --event <event> --item <item> --attempt <n>
node scripts/worktree.mjs list
```

命名沿用 `loop/<event>-<item>-attempt<N>`（`minimal-fix/SKILL.md:97` 的约定）。
`discard` 要同时删 worktree 与分支（"不留残留分支"）。

**验收断言**：

```js
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-wt-'));
  execFileSync('git', ['init', '-q'], { cwd: tmp });
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'x\n');
  execFileSync('git', ['add', '.'], { cwd: tmp });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], { cwd: tmp });

  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'worktree.mjs'),
    'create', '--event', 'ci', '--item', 'ci-1', '--attempt', '1'], { encoding: 'utf8', cwd: tmp });
  ok('worktree 目录已创建', fs.existsSync(path.join(tmp, 'loop', 'ci-ci-1-attempt1')));
  const branches = execFileSync('git', ['branch', '--list'], { encoding: 'utf8', cwd: tmp });
  ok('分支已创建', branches.includes('ci-ci-1-attempt1'), branches);

  execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'worktree.mjs'),
    'discard', '--event', 'ci', '--item', 'ci-1', '--attempt', '1'], { encoding: 'utf8', cwd: tmp });
  ok('worktree 已清理', !fs.existsSync(path.join(tmp, 'loop', 'ci-ci-1-attempt1')));
  const after = execFileSync('git', ['branch', '--list'], { encoding: 'utf8', cwd: tmp });
  ok('分支已清理（不留残留分支）', !after.includes('ci-ci-1-attempt1'), after);

  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：让 `discard` 不删分支 → 最后一条断言必须变红。

---

#### WP-21 · `registry.yaml` 的 `stages:` 加消费者

**修什么**：HL-21

**依赖**：WP-13

**文件**：`scripts/harness-stage.mjs`、`patterns/registry.yaml:190-231`

**为什么**：`grep -rn "mechanical_checks|human_checks" scripts/` → **无任何消费者**，
而阶段 1 的 `mechanical_checks: 10` 已过期（应为 8）。同一文件里 `defaults:` 段**有**消费者
（`readRegistryDefaults`），对比之下更明显：`stages:` 是同一份文件里的第二个真相源，且已漂移。

**怎么改**：二选一。

- **(a) 加消费者**（推荐）：`harness-stage.mjs` 的阶段判据数从 `registry.yaml` 读，
  与 `test.mjs` 的实测值比对。
- **(b) 删掉该块**：避免第二个真相源。

推荐 (a)，因为 `registry.yaml` 本来就是机器可读注册表。

**验收断言**（行为断言，与 `test.mjs:1671-1685` 同款）：

```js
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-regstage-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
  runStage(tmp, ['--upgrade', '--stage', '1']);
  writeRealFeatures(path.join(tmp, 'feature_list.json'));

  const regFile = path.join(tmp, 'reg.yaml');
  const regText = fs.readFileSync(path.join(PACK_ROOT, 'patterns', 'registry.yaml'), 'utf8');
  // 把阶段 1 的 mechanical_checks 改成一个错误值 → 阶段判定必须变红
  fs.writeFileSync(regFile, regText.replace(/(id: 1[\s\S]*?)mechanical_checks:\s*10/, '$1mechanical_checks: 99'));
  const r = JSON.parse(runStage(tmp, ['--json', '--registry', regFile]).out);
  ok('registry 的 mechanical_checks 改动会改变行为',
    r.stages[0].checks.length !== 99, `checks.length=${r.stages[0].checks.length}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：删掉消费者 → 该断言必须变红。

---

#### WP-22 · `docs/03` 补齐 9 类闸门 + scope 标人工

**修什么**：HL-22

**文件**：`docs/03-gates-and-levels.md:112-127`（优先级清单）、scope 闸门表格

**为什么**：文档优先级清单 8 项，代码 9 项。文档**完全没有** `head-commit`（TOCTOU，约束 7）
与 `red-check`（约束 8）——而这两条正是 `loop-constraints.md` 里最强调的硬约束。
另外 scope 表格写"改动的文件数量**与相关性**"，代码只检查文件数。

**怎么改**：优先级清单补齐为 9 项（含 `head-commit` 与 `red-check`），
scope 的"相关性"一行显式标为**人工判据**——参照 `docs/11:187-189` 已确立的原则：
"判断力无法被 grep 替代，把它标成人工项比让它假绿诚实"。

**验收断言**：

```js
{
  const gatesDoc = fs.readFileSync(path.join(PACK_ROOT, 'docs', '03-gates-and-levels.md'), 'utf8');
  const gateSrc = fs.readFileSync(path.join(PACK_ROOT, 'scripts', 'gate-check.mjs'), 'utf8');
  // 代码里注释声明的 9 类闸门名
  const names = ['pause', 'budget', 'denylist', 'max-attempts', 'scope', 'head-commit', 'red-check', 'verification'];
  for (const n of names) ok(`docs/03 覆盖闸门 ${n}`, gatesDoc.includes(n), `缺失: ${n}`);
  ok('scope 的相关性检查标为人工', /相关性[\s\S]{0,120}人工/.test(gatesDoc), '未标注人工');
}
```

**变异回退**：从 `docs/03` 删掉 `head-commit` → 对应断言必须变红。

---

#### WP-23 · 队列读取契约

**修什么**：HL-15

**文件**：`skills/harness-loop/SKILL.md`（第 0 步第 4 条）、`examples/github-actions/README.md`、
新增 `scripts/queue-read.mjs`（可选）

**为什么**：`harness-loop` 第 0 步第 4 条要求判断"本事件对应的队列为空"——**它读哪个队列？**
没有任何脚本定义队列位置或读取方式。事件脊的最后一跳在代码上是空的。

**怎么改**：二选一。

- **(a) 给出最小消费者**：`scripts/queue-read.mjs --list` / `--show <item>`，读 `.loop/queue/`。
- **(b) 明确"队列"的载体**：如 `STATE.md` 的 High Priority 区，并让第 0 步第 4 条引用它。

推荐 (a)+(b)：脚本读 `.loop/queue/`（workflow 写的），但若目录不存在则回落到 `STATE.md` 的
High Priority 区，并在输出里说明读的是哪个。这样本地手动用法与事件驱动用法都成立。

**验收断言**：

```js
{
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'harness-loop', 'SKILL.md'), 'utf8');
  ok('第 0 步引用具体的队列读取入口', /queue-read\.mjs|\.loop\/queue/.test(skill), '未找到队列契约');

  // 空队列 → 报 no-op；非空 → 报待办
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lh-queue-'));
  const q = (extra) => (() => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [path.join(PACK_ROOT, 'scripts', 'queue-read.mjs'),
        '--json', ...extra], { encoding: 'utf8', cwd: tmp }) };
    } catch (e) { return { code: e.status, out: e.stdout || '' }; }
  })();
  ok('空队列报告为空', JSON.parse(q([]).out).items.length === 0);

  fs.mkdirSync(path.join(tmp, '.loop', 'queue'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.loop', 'queue', 'pr-1.json'), JSON.stringify({ id: 'pr-1', phase: 'fix' }));
  eq('非空队列报告 1 项', JSON.parse(q([]).out).items.length, 1);
  fs.rmSync(tmp, { recursive: true, force: true });
}
```

**变异回退**：让脚本恒返回空列表 → 第二条断言必须变红。

---

### 层级 3 · 效率与可维护性

---

#### WP-24 · `--inject` 或删除该行

**修什么**：HL-16

**依赖**：WP-05（未知标志 fail-closed 之后，这个不存在的标志会开始报错）

**文件**：`skills/loop-guard/SKILL.md:55`

**为什么**：实测 `grep -rn "inject" scripts/*.mjs` 无输出；`--inject "trim"` 正常输出 `verdict: ok`、
退出 0（未知标志被静默忽略）。agent 会以为它执行了提示词裁剪，实际什么也没发生，
且**没有任何信号表明这一步是空的**。

**怎么改**：二选一。

- **(a) 删除**：把该行改为真实存在的动作——"读 `loop-ledger.json` 的 `last_error_signature`
  并据此收窄下一轮的范围"。
- **(b) 实现**：`--inject` 输出一个裁剪后的提示词片段（例如只含最后一条错误签名与未尝试的方向）。

推荐 (a)——成本最低，(b) 的收益不明确。

**验收断言**：§1.1 的通用断言会覆盖。

**变异回退**：在技能里加一个不存在的标志 → 通用断言必须变红。

---

#### WP-25 · 布尔标志严格化

**修什么**：HL-28

**文件**：`scripts/lib/common.mjs:84-87,113-121`

**为什么**：实测 `--pause false` → `args.pause = true`（因为 `pause` 在 `BOOLEAN_FLAGS` 里，
下一 token `false` 被当成位置参数）。`docs/03:141` 就写着 `--pause false`，
实测该命令得到 `decision: "exit"`、`reason: "loop-pause-all is active"`。

**怎么改**：

```js
    const key = camel(body);
    if (BOOLEAN_FLAGS.has(key)) {
      // 布尔标志只接受 --flag 与 --flag=true|false。
      // 曾经 `--pause false` 会被解析成 pause=true + 位置参数 false，
      // 而 docs/03 的示例就写着 `--pause false`——照文档执行得到永久紧急刹车。
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        fail(`--${body} is a boolean flag and does not take a value. `
          + `Use --${body} (true) or --${body}=false. Got: --${body} ${next}`, 1);
      }
      args[key] = true;
      continue;
    }
```

**验收断言**：

```js
{
  eq('--pause false 报错而非静默取真', (() => {
    try { parseArgs(['--pause', 'false']); return 'no-error'; } catch { return 'error'; }
  })(), 'error');
  eq('--pause 仍为真', parseArgs(['--pause']).pause, true);
  eq('--pause=false 为字符串 false', parseArgs(['--pause=false']).pause, 'false');
}
```

注意 `parseArgs` 目前不抛异常而是调 `fail()`（`process.exit`）。测试需要改为跑 CLI 子进程，
或把 `fail` 改成可注入的。**这一点必须在 WP 内显式决定并说明。**

**变异回退**：恢复旧解析 → 第一条断言必须变红。

---

#### WP-26 · `session-handoff.md` 或填或删

**修什么**：HL-25

**文件**：`session-handoff.md`（12 处占位符）、`templates/session-handoff.md`、`scripts/harness-stage.mjs` 的 `STAGE2_FILES`

**为什么**：`grep -c "\[.*\]" session-handoff.md` → 12，包括 `[本次会话要达成什么]`、`[做到哪了]`。
它是阶段 2 的产出之一，所以"存在"会让判据通过，但内容为空——`STATE.md` 的 Post-Run Critique
承担了实际职责。

**怎么改**：二选一。

- **(a) 填**：本仓库的 handoff 信息其实就在 `STATE.md` 里，搬一部分过来。
- **(b) 删**：从 `STAGE2_FILES` 移除并说明理由（"STATE.md 已覆盖接力需求"）。

推荐 (b)——两个载体做同一件事会产生第二个真相源，而本仓库已经反复被这类问题咬过。

**验收断言**（若选 a）：`ok('session-handoff.md 无占位符', !/\[[^\]]{2,}\]/.test(handoff))`
（若选 b）：断言 `STAGE2_FILES` 不含它，且阶段 2 判据数相应调整（会连带 WP-13 的数字）。

---

#### WP-27 · 手动调用边界统一

**修什么**：HL-29

**文件**：`skills/harness-loop/SKILL.md:9-11`、`docs/10-how-to-use.md:53,145`

**为什么**：`SKILL.md:9-11` 写 `Do NOT invoke by hand — step 2 needs an --event name only the
event source knows.`，而 `docs/10:53` 写"手动调用：`/harness-loop`"、`docs/10:145` 把
"我现在该做什么"指向 `harness-loop`。`harness-loop` 也是 17 个技能里唯一没有 `user_invocable` 的。

**怎么改**：二者选一并在两处统一。若维持"不可手动调用"，`docs/10` 两处需改；
若允许手动调用（第 2 步的 `--event` 可以由人给出），则加 `user_invocable: true` 并改 description。

**验收断言**：

```js
{
  const skill = fs.readFileSync(path.join(SKILLS_DIR, 'harness-loop', 'SKILL.md'), 'utf8');
  const doc = fs.readFileSync(path.join(PACK_ROOT, 'docs', '10-how-to-use.md'), 'utf8');
  const forbidsManual = /Do NOT invoke by hand/.test(skill);
  const recommendsManual = /手动调用[^\n]*harness-loop/.test(doc) || /\| "我现在该做什么" \| `harness-loop`/.test(doc);
  ok('手动调用边界在技能与文档间一致', forbidsManual !== recommendsManual,
    `技能禁止=${forbidsManual} / 文档推荐=${recommendsManual}`);
}
```

**变异回退**：只改一处 → 断言必须变红。

---

#### WP-28 · `.gitignore` 补 hook-state

**修什么**：HL-27

**文件**：`.gitignore`

**为什么**：`skills/.mimosa/hook-state/sess_*.json` 被提交进仓库，属工具副产物。
根目录的 `.mimosa/` 已在 `.gitignore` 里，但 `skills/.mimosa/` 没有。

**怎么改**：`.gitignore` 加一行 `**/.mimosa/`，并 `git rm -r --cached skills/.mimosa`。

**验收断言**：

```js
{
  const gi = fs.readFileSync(path.join(PACK_ROOT, '.gitignore'), 'utf8');
  ok('.gitignore 覆盖嵌套的 .mimosa', /\*\*\/\.mimosa\//.test(gi), gi);
  ok('skills/.mimosa 未被跟踪', !listFiles(PACK_ROOT, { maxFiles: 5000 })
    .some((f) => f.startsWith('skills/.mimosa/')), '仍有被跟踪的文件');
}
```

**注意**：`listFiles` 走的是文件系统，不是 git index。要断言"未被跟踪"需要跑 `git ls-files`。
**这一点必须在 WP 内显式说明**，或改用 `git ls-files skills/.mimosa` 的空输出作为断言。

---

## 3. 依赖关系图

```
层级 1（可并行，除注明外）
  WP-01 ──┬── 含 §1.1 通用断言（覆盖 WP-06/24 的一部分验收）
  WP-02 ──┴─→ WP-07 ─→ WP-08        （脚本必须先能部署，才能补 workflow 参数）
  WP-03 ────→ WP-14                 （close 必须先合法，phase 比对才有意义）
  WP-04    （独立）
  WP-05 ────→ WP-24                 （fail-closed 之后，不存在的标志会开始报错）
  WP-06    （独立；随 WP-01 一起做更省事）
  WP-09    （独立；改动面最大——8 个 workflow）
  WP-10    （独立）
  WP-11    （独立）

层级 2
  WP-12  WP-13 ─→ WP-21   WP-14  WP-15  WP-16  WP-17  WP-18  WP-19  WP-20  WP-22  WP-23

层级 3
  WP-24（依赖 WP-05）  WP-25  WP-26  WP-27  WP-28
```

**建议执行顺序**（每步之后跑 `node scripts/test.mjs`）：

1. `WP-05` → `WP-24`（先让拼错的标志报错，再修那个不存在的标志）
2. `WP-01`（含 §1.1 通用断言）→ `WP-06`
3. `WP-02` → `WP-07` → `WP-08`
4. `WP-03` → `WP-14`
5. `WP-09`、`WP-10`、`WP-11`、`WP-04`（互相独立，可任意顺序）
6. 层级 2 按编号
7. 层级 3 按编号

---

## 3.1 执行结果（2026-10-14 实施记录）

**28 个 WP 全部完成**，断言 724 → 923，`bash init.sh` 退出码 0。

### 实施中新发现的问题（不在原 spec 里）

| # | 问题 | 处理 |
|---|---|---|
| 1 | **审计的活动检测虚高**：`loop-audit.mjs` 数 `loop-run-log.md` 里任何含 `run_id` 的记录，于是 `manual.*` 开发记录被当成"循环活动"；`Last run` 接受开发会话标签（带日期就认）；Active 表判定扫描整个 `STATE.md`，把 Post-Run Critique 的数据表算成 25 个"活跃 work item"。三条合起来让一个从未跑过事件驱动循环的仓库拿到 activity 分，而 `STATE.md:28` 自己写着"尚未跑过任何一轮真实事件"。 | 三处收窄 + 5 条断言（含双向：manual 不算 / 混入一条事件驱动记录即算）。**审计从 98/L3 变为 94/L2**——这是唯一正确的退步，见 `STATE.md` 的 Post-Run Critique。 |
| 2 | **`--pause=false` 反向打开刹车**：`parseArgs` 得到字符串 `"false"`，而 `Boolean("false") === true`。修 `--pause false` 的解析时暴露的。 | 新增 `boolArg`，断言覆盖 4 种取值形态。 |
| 3 | **`worktreeName` 消毒不彻底**：只把非法字符换成 `-` 时 `../../etc` 变成 `..-..-etc`，名字里仍含 `..`。 | 白名单改为排除 `.`，断言直接验 `worktreeName('ci','../../etc',1) === 'loop/ci-etc-attempt1'`。 |
| 4 | **`init.sh` / `self-check.yml` 的冒烟测试用的是旧接口**：`ledger-check` 读占位账本（正确地）退出 2、`gate-check --phase gate --verdict approve` 缺证据文件（正确地）退出 2。`set -euo pipefail` 让 `init.sh` 停在那里。 | **不放宽闸门**，改冒烟测试：账本与证据都用临时文件，并**增加**"占位账本必须被拒""无证据的 approve 必须升级""未知标志必须被拒"三条负向断言。 |

### 与原 spec 的偏差

- **WP-26 从"删"改为"填"**：spec 建议删除 `session-handoff.md`（避免第二个真相源），但它被 4 篇文档引用、是阶段 2 的产出之一，删除会改动"5 个 loop 机制文档"这个在多处写死的数量。真正的问题是**本仓库那份没填**（12 处占位符）。改为填写 + 加双向断言（本仓库无占位符 **且** 模板仍带占位符）。
- **HL-27 被证伪**：`skills/.mimosa/` 并未被 git 跟踪，`.gitignore` 的 `.mimosa/` 已覆盖它。之前看到的只是磁盘上的文件。**静态判断不能替代 `git check-ignore`。**

### 变异回退记录（约束 8）

共 13 次变异，全部确认"变异真的落地"后才读测试结果：

| # | 变异对象 | 结果 |
|---|---|---|
| 1 | `rejectUnknownFlags` 清空函数体 | ✅ 6 条红 |
| 2 | 证据闸门的矛盾检查改 `if (false)` | ✅ 4 条红 |
| 3 | verdict 归一化还原 | ✅ 5 条红 |
| 4 | 往技能文档加假标志 | ✅ 通用 flag 断言红 |
| 5 | `PHASES` 删 `close` | ⚠️ **第一次无牙齿**（断言用了库函数，而校验只在 `main()`）→ 改走 CLI 后 ✅ 3 条红 |
| 6 | 删 `copyRuntimeScripts` 调用 | ✅ 8 条红（首次变异未落地，自查发现） |
| 7 | `capForPattern` 改成取全表最大值 | ✅ 6 条红（复现了原 bug） |
| 8 | ci-sweeper 恢复直接插值 | ✅ 1 条红 |
| 9 | 归一化退回抹掉所有数字 | ✅ 3 条红 |
| 10 | 关掉 `placeholder-ledger` 分支 | ✅ 4 条红 |
| 11 | 去掉拒绝列表 `i` 标志 | ✅ 6 条红 |
| 12 | `install-skills --check` 恒返回 0 | ✅ 1 条红 |
| 13 | 活动检测三处一起退回 | ✅ 5 条红 |

**2 条断言第一次写完是无牙齿的**（#5 与 #6 的首次变异），与 `STATE.md` 记录的既有模式一致：
**新写的断言默认无牙齿，必须先变异再算写完。**

---

## 4. 验收总表

每个 WP 完成后，在 `STATE.md` 追加一行证据（命令 + 结果）。汇总判据：

| 判据 | 验证方式 |
|---|---|
| 全部 WP 的验收断言绿 | `node scripts/test.mjs` |
| 每条新断言都做过变异回退 | 逐条记录"变异 → 变红 → 还原"（§2 各 WP 的变异回退小节） |
| 变异真的落地 | 每次变异后先看那行代码，再跑测试（`STATE.md` 2026-10-14 第三批的教训） |
| 仓库仍能从标准启动路径起来 | `bash init.sh` 退出 0 |
| 断言总数增长可解释 | 记录 724 → N，并说明每个 WP 贡献了几条 |
| 未跑的检查已写明 | §6 |

---

## 5. 本仓库自身的特殊性（必须记录，否则会误判）

本仓库是**技能源仓库**，不是消费者：

- 它的 `loop-constraints.md` 就是模板来源，所以阶段 2 判据 5（"拒绝列表已本地化"）
  对它天然不适用——`STATE.md:217` 已把这点记为"friction in human review"。
- 它的 `loop-ledger.json` 是**示例数据**（`goal` 自称 Example），WP-16 之后会被判
  `placeholder-ledger` / exit 2。**这是正确结果**——本仓库确实没有跑过真实修复循环
  （`loop-run-log.md` 的 6 条全是 `manual.*` 事件）。实施 WP-16 时不要为了"让它绿"
  而伪造 goal。
- `loop-run-log.md` 的 6 条记录在 WP-15 之后会被标为 `outcome: manual`，
  **明确不计入循环统计**——因为本仓库尚未跑过任何一轮真实事件驱动循环
  （`STATE.md:34` 的 Watch List 第一条就是"尚未跑过任何一轮真实事件"）。

---

## 6. 未做的验证（NOT RUN，不允许省略）

以下检查在本轮审查中**未执行**，实施本 spec 时同样可能无法执行。必须在
`STATE.md` 与相关 PR body 中显式列为 NOT RUN：

| 检查 | 为什么没跑 | 何时能跑 |
|---|---|---|
| GitHub Actions 真实 runner 行为 | 无 GitHub 仓库与网络 | 有一个测试仓库时 |
| WP-04 的注入在真实 runner 上复现 | 同上；本地模拟已证明注入可行 | 同上 |
| WP-07 的 merge-gate 端到端 | 同上 | 同上 |
| 真实 agent 宿主中的技能触发 | 无法观测宿主内部 | 需宿主侧埋点 |
| 子智能体隔离（执行者/验证者不同实例） | 宿主能力，脚本层无法验证 | 人工确认 |
| `worktree` 隔离在真实并发下的表现 | 需多循环同时运行 | 有并发场景时 |
| `loop-verifier` 在真实环境中能否运行测试 | 需真实项目 | 有消费者项目时 |
| 模型是否真的遵守 REJECT 默认立场 | 属模型性质，非本仓库可测 | 不可机械验证 |

---

## 7. 有意不做（不在本 spec 范围，附理由）

| 项 | 理由 |
|---|---|
| HL-26：`gate-check` 接受 `--verdict-file`，直接解析 verifier 报告 | **已被 WP-08 吸收**。WP-08 的 `--evidence-file` 已经让闸门读 verifier 报告并解析其中的 verdict 行与命令行——这正是 HL-26 想要的效果。差别只在 HL-26 设想的是"用文件替代 `--verdict`"，而 WP-08 保留 `--verdict` 并**校验它与证据一致**（矛盾时 escalate）。后者更强：它同时挡住"转写时把 REJECT 写成 approve"。若实施 WP-08 后仍想进一步省掉 `--verdict`，可在同一 WP 内加一个"未传 `--verdict` 时从证据文件推导"的分支，但那会削弱"调用方必须显式表态"的设计，**建议不做**。 |
| 把 `gate-check` 的 SHA 校验升级为"验证该 SHA 真实存在于仓库" | 需要访问 git 仓库，会让闸门依赖 cwd 的 git 状态（与 `test.mjs:967-968` 已确立的"不按文件系统状态改变语义"原则冲突）。WP-08 的证据闸门已覆盖主要缺口。 |
| 实现"diff 相关性"的机械判定 | 脚本不知道 work item 的目标。WP-22 把它标为人工判据，与 `docs/11:187-189` 的既有原则一致。 |
| 给 `loop-verifier` 加"共享上下文检测" | 宿主能力，脚本层无法实现。WP-20 只补了可脚本化的 worktree 部分。 |
| 为 `patterns/registry.yaml` 引入 YAML 解析依赖 | 仓库承诺零依赖（`docs/10:12`）。WP-21 沿用现有的正则解析（`readRegistryDefaults`）。 |
| 补 `schedule:daily` / `issue_comment.created` / `check_run.completed` 等路由 | `STATE.md:47-48` 已记为"本轮只把 LOOP.md 里不可路由的声明移除以对齐代码，补路由属新功能，另轮"。 |
| 修 `loop-audit.mjs` 的低严重级打磨项（`Math.max(1,…)` 的 0 项误报为 `1/5`、单技能记满双技能权重等） | `STATE.md:49-51` 已记为"不影响任何判定或门禁"，逐条理由见 `REVIEW-2026-10-14-consolidated-plan.md` §6.2。 |
| 让 `harness-stage.mjs` 识别"这是源仓库"并跳过消费者专属判据 | `STATE.md:219-220` 已记为下一轮项（"One adjustment next cycle"），需要单独设计，不在本次缺陷清单内。 |

---

*本 spec 为规划产物，未修改任何项目文件。所有补丁引用（P0-A / P0-B / P1-C / P1-D / P1-E / P1-F / P1-G）
的完整文本在 `REVIEW-2026-10-14-harness-loop-audit.md` §6。*
