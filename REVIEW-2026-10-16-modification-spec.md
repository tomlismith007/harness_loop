# 修改计划 Spec：harness-loop

> 配套《审查报告》见 `REVIEW-2026-10-16-harness-loop-audit.md`（问题编号 P0-01…P3-03 均引自此文）。
> 本文件是**计划**，不是已实施的改动。实施前请先读 `LESSONS.md`（`init.sh` 的收尾提示要求如此）。

> **⚠️ 第 3 轮修正（2026-10-16）**：审查报告经独立复核后修正了两处，**两处都直接改变本 Spec 的实施动作**。实施前必须先读审查报告 §7.4 与 §9.4，再读下面的 MP：
>
> | 项 | 原写法 | 修正后 | 影响 |
> |---|---|---|---|
> | **MP-01** | "裸路径显式报错" | "**多行清单忘记 `@`** 时显式报错" | 按原文写 fixture 会断言一个不存在的缺陷（§3.2） |
> | **MP-10** | "平台感知的 tree-kill 断言" | "**能力感知**（按 `hasGnuTimeout()`）" | 按平台名分叉会写出在开发机上恒绿的假断言（§3.11） |
> | **MP-05** | `noop` 疑点"先实测" | `noop` **已实测确认**，直接修 | 见 §3.6 修改内容第 4 条与验收标准 4 |
>
> 其余 19 条问题与 16 个 MP 的表述经复核**原样成立**，无需改动。

---

## 1. 背景与目标

### 1.1 背景

对 `harness-loop`（`D:\harness_loop`，HEAD `0a5ce0c`）做了两轮只读审查，结论是：**循环骨架完整，但"执行""记忆""验证"三处缺口使它在生产路径上跑不起来**。

- **执行**：8 个 workflow 里没有任何 agent 调用；`.loop/queue` 无人消费（P1-03）。
- **记忆**：没有任何脚本写 `STATE.md` / `loop-run-log.md` / `feature_list.json`；预算 `used` 恒为 0；账本仍是出厂占位符；事件驱动运行记录为零（P1-02、P1-04）。
- **验证**：`gate-check` 的证据检查只匹配文本形状，实测用一份写着 `Tests → FAIL` 的 "APPROVE 报告"拿到了 `proceed, exit 0`（P0-01）；唯一被生产调用的合并闸门因硬编码 `--verdict none` 而恒定 escalate（P0-02）。

同时确认了**五项确实工作**的机制（`acting_on` 冲突锁、per-loop 预算上限解析、拒绝列表闸门、`@` 前缀语义、`harness-stage` 的阶段判据），以及一条值得保留的自我约束——"机制必须有代码入口，且测试要断言改配置会改行为"（`loop-constraints.md` 硬约束 11，`test.mjs` §17 用变异测试真实执行过）。

### 1.2 目标

按优先级修掉 22 条问题中的核心缺陷，使项目达到：

| 目标 | 判据 |
|---|---|
| G1 验证闸门不可被形状欺骗 | 含 `FAIL` / 全 `NOT RUN` / 缺 `### Checks not run` 的证据一律 escalate（MP-01） |
| G2 合并闸门在生产路径上可区分"没验"与"验失败" | 无 verifier 产出时的 decision ≠ 有 APPROVE 产出时的 decision（MP-02） |
| G3 本地 Windows 检出与 Linux 检出行为一致 | 同一套件在 **`hasGnu === true` 与 `hasGnu === false` 两种环境**下均 0 失败（第 3 轮修正：判据是能力不是平台名）；CRLF fixture 覆盖（MP-03、MP-10） |
| G4 "未接线"能被正确识别 | 只含冒烟测试的 CI 仓库 → `wired: false`（MP-04） |
| G5 熔断器在生产路径上有真实调用点 | 至少一个 workflow 的 `run:` 执行 `ledger-check.mjs`（MP-05） |
| G6 状态可落盘 | 存在写 run-log 的代码入口，且被至少一个 workflow 调用（MP-06） |
| G7 文档不再宣称未实现的机制 | 三条无实现的硬约束被标注为约定，或补上实现（MP-07、MP-11） |

### 1.3 成功定义

沿用 `AGENTS.md` 的四条完成定义：目标行为已实现 / 要求的验证确实跑过且输出被记录 / 证据写入 `feature_list.json` 或 `STATE.md` / 仓库仍能从 `bash init.sh` 重新起来。

**本 Spec 的任何一项完成时，`bash init.sh` 必须仍然通过。**

---

## 2. 范围

### 2.1 做什么

1. 修掉 **2 条 P0**（验证闸门语义、合并闸门 verdict 来源）。
2. 修掉 **7 条 P1** 中可在代码层解决的部分（CRLF、接线判定、熔断调用点、状态写入、独立性检查、**清单塌缩**、无进展计数）。
3. 修掉 **10 条 P2** 中收益明确的 8 条（安装漂移检测、平台感知断言、阈值统一、宿主路径、死配置、工具范围、文档边界、枚举统一）。
4. 清理 **3 条 P3** 中成本最低的 2 条（重复 id、无效字段断言）。
5. 为上述每一项补 `test.mjs` 断言，并遵守仓库既有约定（见 §6.1）。

### 2.2 明确不做什么

| 不做 | 理由 |
|---|---|
| **不加外部数据库 / 状态服务** | `docs/02-state-model.md` 的设计就是文件即状态；引入外部存储会把"可直接 `git diff` 审查状态"这个优点换成运维负担 |
| **不加第二个评审模型** | 现有验证方法（独立实例 + 对抗指令 + 回退测试）在**证据语义正确**之后已足够；`loop-verifier` 的问题不是"评审者不够强"，而是"闸门不读评审内容" |
| **不新增架构层 / 插件系统 / 配置项** | 本仓库自己的教训是"无人读的配置会漂移"（`loop-budget.md` 第 4 列、`registry.yaml` 的 `suggested_daily_cap`）。新增配置的默认成本是被删掉 |
| **不实现 agent 运行器** | P1-03 的修法是**把边界说清楚**（MP-11），不是在本包内造一个 agent 调度器——那需要另一套授权、沙箱、凭据管理，超出本包职责 |
| **不做 `--quick` 快慢分离** | 仓库已明确主动跳过（`STATE.md` High Priority 第 7 条）：自递归修掉后 `init.sh` 已是 45s，收益不足以再引入一个"哪些断言算快"的真相源 |
| **不动 `docs/` 的正文结构** | 除 §2.1 提到的具体句子外，不重写文档 |
| **不改 `loop-constraints.md` 的拒绝列表** | 12 条已实测既不漏也不误伤（含大小写变体）；P2-04 的问题是"读侧无隔离"，不是"列表不全" |
| **不为了绿而放宽任何阈值** | 硬约束 5；本 Spec 的所有修改项都只允许**收紧**或**明确标注** |

---

## 3. 修改项清单

### 3.1 索引表

| 编号 | 对应问题 | 修改内容 | 优先级 | 依赖 |
|---|---|---|---|---|
| MP-01 | P0-01 + P1-07 | 证据闸门解析状态值、要求 `### Checks not run`、兼容 ASCII 箭头；**多行清单忘记 `@` 时显式报错**（原写"裸路径报错"，第 3 轮修正） | **P0** | — |
| MP-02 | P0-02 | merge-gate 的 verdict 与证据改由 verifier 产出驱动，不再硬编码 `none` | **P0** | MP-01 |
| MP-03 | P1-01（~~P2-01~~ 已证伪） | 读文件统一换行归一；`queue-read` 复选框正则收尾；补 CRLF fixture | **P1** | — |
| MP-04 | P1-06 | `hasEventWiring` 收窄到"真事件 + 真路由调用" | **P1** | — |
| MP-05 | P1-04 | `ledger-check` 按 pattern 切片；`ci-sweeper` 的 heredoc 改成真步骤；账本占位符独立状态 | **P1** | — |
| MP-06 | P1-02 | 新增 `run-log-append.mjs`；决定持久化方式（见 §8 待决 1） | **P1** | MP-05 |
| MP-07 | P1-05 | 独立性 / worktree 的**声明一致性**检查（明确标注不是身份认证） | **P1** | MP-01 |
| MP-08 | P2-09 | 占位符账本与熔断触发分离退出码 | **P1** | MP-05 |
| MP-09 | P2-02 | `install-skills --check` 修默认目录、清单补 `layout`/`dotDir`、接入 `init.sh` | **P2** | — |
| MP-10 | P2-08 | **能力感知**（按 `hasGnuTimeout()`，非 `process.platform`）的 tree-kill 断言；无 CRLF fixture 一并补 | **P2** | MP-03 |
| MP-11 | P1-03 | 文档层显式声明"本包不含 agent 运行器" | **P2** | — |
| MP-12 | P2-03 + P2-10 | 文件数阈值与 outcome 枚举各收敛到单一真相源 | **P2** | — |
| MP-13 | P2-06 | 触发描述加否定式边界 | **P2** | — |
| MP-14 | P2-07 | `LAYOUTS` 与 `SKILL_DIRS` 收敛到单一列表；补 `.pi` | **P2** | MP-09 |
| MP-15 | P2-05 | 无消费者的两处声明：接入或删除 | **P2** | — |
| MP-16 | P2-04 | 工具范围声明，或明确声明"无工具级隔离" | **P2** | — |
| MP-17 | P3-01 | 三条打磨项 | **P2** | — |
| MP-18 | P3-02 | `user_invocable` 接到行为或从断言移除 | **P2** | — |
| MP-19 | P3-03 | 修重复 id 并加唯一性断言 | **P2** | — |

**覆盖检查**：P0-01→MP-01；P0-02→MP-02；P1-01→MP-03；P1-02→MP-06；P1-03→MP-11；P1-04→MP-05；P1-05→MP-07；P1-06→MP-04；P1-07→MP-01；P2-01→MP-03；P2-02→MP-09；P2-03→MP-12；P2-04→MP-16；P2-05→MP-15；P2-06→MP-13；P2-07→MP-14；P2-08→MP-10；P2-09→MP-08；P2-10→MP-12；P3-01→MP-17；P3-02→MP-18；P3-03→MP-19。**22/22 全覆盖。**

---

### 3.2 MP-01 证据闸门：解析状态值 + 强制检查清单 + 清单塌缩报错

> **⚠️ 第 3 轮修正（2026-10-16）**：本项对应的 P1-07 原表述（"裸路径 `auth/login.ts` → proceed"）**复现不出**。真正可复现的缺陷是**对多行清单文件忘记 `@`，N 个文件塌缩成 1 个**，使拒绝列表与范围闸门同时失效。下面的"修改内容"第 6 条与验收标准第 2 条已按此改写——**按原文写 fixture 会断言错对象**。详见审查报告 §7.4 / §9.4。

- **对应问题**：P0-01（证据只匹配形状）、P1-07（忘记 `@` 使清单塌缩为 1 个文件）
- **优先级**：**P0**
- **依赖**：无（但 MP-02 依赖它）
- **修改内容**：
  1. 证据行解析出**状态值**，`FAIL` 一律 escalate；
  2. `### Checks not run` 节必须存在；
  3. 证据中出现的 `NOT RUN` 必须全部出现在该节里（反向校验）；
  4. 箭头同时接受 U+2192 与 ASCII `->`；
  5. `--not-run` 不再作为唯一来源，与证据交叉；
  6. `--diff-files` 指向一个**多行文件**但没加 `@` 时**报错**（拒绝静默把 N 个文件当成 1 个路径）。单行文件仍按单路径处理。

- **具体做法**

  `scripts/gate-check.mjs` 规则 8b，替换证据检查段：

  ```js
  // 证据行：接受 U+2192 与 ASCII ->，解析出检查名与状态值
  const EVIDENCE_LINE =
    /^\s*-\s*(Tests|Red check|Real-use validation|Lint|Scope check|Denylist check|Files changed):\s*`([^`]+)`\s*(?:→|->)\s*(PASS|FAIL|NOT RUN)\s*$/gm;

  const checks = [...report.matchAll(EVIDENCE_LINE)].map((m) => ({
    name: m[1],
    cmd: m[2],
    status: m[3],
  }));

  const missing = [];
  if (!verdictLine) missing.push('a "## Verdict: ..." line');
  if (checks.length === 0) {
    missing.push('at least one "- <check>: `<cmd>` → PASS|FAIL|NOT RUN" line (→ or ->)');
  }

  // 自相矛盾：报告说 APPROVE，但有一项检查失败
  const failed = checks.filter((c) => c.status === 'FAIL');
  if (!missing.length && verdictLine && failed.length) {
    return {
      decision: 'escalate',
      gate: 'verification-evidence',
      reason: `evidence says APPROVE but ${failed.length} check(s) report FAIL: ${failed
        .map((c) => c.name)
        .join(', ')}`,
      exit_code: 2,
      next: 'a verdict that contradicts its own evidence is worse than no verdict. Return to fix.',
    };
  }

  // Checks not run 节必须存在
  const notRunSection = report
    .split(/^###\s+Checks not run\s*$/m)[1]
    ?.split(/^#{2,3}\s/m)[0];
  if (!missing.length && notRunSection === undefined) {
    missing.push('a "### Checks not run" section (write `—` when empty)');
  }

  // 证据里声明的 NOT RUN 必须出现在该节里
  const evidenceNotRun = checks.filter((c) => c.status === 'NOT RUN').map((c) => c.name);
  if (!missing.length && evidenceNotRun.length) {
    const declared = notRunSection ?? '';
    const undeclared = evidenceNotRun.filter((n) => !new RegExp(`\\b${n}\\b`, 'i').test(declared));
    if (undeclared.length) {
      missing.push(
        `NOT RUN checks missing from "### Checks not run": ${undeclared.join(', ')}`
      );
    }
  }

  if (missing.length) {
    return {
      decision: 'escalate',
      gate: 'verification-evidence',
      reason: `evidence file ${evidencePath} is missing: ${missing.join('; ')}`,
      allowed_actions: ['run loop-verifier', 'save its report', 'pass the path via --evidence-file'],
      exit_code: 2,
      next: 'a verdict without evidence is a claim. Save the verifier report to a file and pass --evidence-file <path>.',
    };
  }

  // checks_not_run 由证据 + 显式声明合并，而不是只回显 --not-run
  const mergedNotRun = [...new Set([...evidenceNotRun, ...notRun])];
  ```

  并把 `checks_not_run: notRun` 改为 `checks_not_run: mergedNotRun`。

  清单塌缩防护（`main()` 内，`--diff-files` 解析处）：

  ```js
  if (typeof args.diffFiles === 'string') {
    if (args.diffFiles.startsWith('@')) {
      const listPath = args.diffFiles.slice(1);
      diffFiles = readText(listPath).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } else if (args.diffFiles.includes('\n') || args.diffFiles.includes('\r')) {
      fail('--diff-files looks like a file LIST. Prefix it with "@" to pass a list, or pass a single path.');
    } else if (exists(args.diffFiles) && readText(args.diffFiles).trim().split(/\r?\n/).length > 1) {
      // 文件存在且是多行 → 几乎必然是忘记 @，不要静默塌缩成"1 个文件"
      fail(`--diff-files points at ${args.diffFiles}, which contains multiple lines. Prefix with "@" to treat it as a list.`);
    } else {
      diffFiles = [args.diffFiles];
    }
  }
  ```

  > 注：第三条只对"指向多行文件"这一情形报错，`gate-check.mjs:403` 原本担心的"同一条命令字符串不该因为文件系统状态改变含义"依然成立——单行文件仍被当作单一路径，不存在的路径仍是单一路径。
  >
  > **为什么这条是必需的（复核实测）**：`--diff-files big.txt`（20 条路径，无 `@`）→ `proceed, files_changed: 1`；`@big.txt` → `escalate / scope, 20`。同一份清单，一个字符之差，**拒绝列表闸门与范围闸门同时失效**——首行无害的清单能藏住后面的 `auth/**`。

- **可检验验收标准**
  1. `test.mjs` §18 新增 5 条断言：合格证据 → `proceed`；`APPROVE` + `Tests → FAIL` → exit 2 且 reason 含 `FAIL` 与该项名；缺 `### Checks not run` → exit 2；ASCII `->` 与 U+2192 结果相同；证据含 `NOT RUN` 但未列入该节 → exit 2。
  2. 新增 3 条清单断言（**第 3 轮改写**）：
     - `--diff-files <多行文件>`（无 `@`）→ **exit 1** 且 stderr 含 `Prefix with "@"`；
     - `--diff-files <单行文件>`（无 `@`）→ 仍按单路径处理（`files_changed: 1`）；
     - **行为断言**：多行清单的**第二行**是 `auth/login.ts` 时，修复前必须得到 `proceed`（证明塌缩真的让拒绝列表失效），修复后必须 `escalate / denylist`。
  3. **反向断言（防装饰品）**：把 `EVIDENCE_LINE` 的状态值分组从 `(PASS|FAIL|NOT RUN)` 改成 `(PASS)`，上面第 2 条断言必须变红。

---

### 3.3 MP-02 合并闸门的 verdict 与证据来源

- **对应问题**：P0-02
- **优先级**：**P0**
- **依赖**：MP-01（否则改完来源仍然会被形状欺骗）
- **修改内容**：`merge-gate.yml` 不再硬编码 `--verdict none`；verdict 从 `loop-verifier` 的产出（带标记的 PR 评论）读取；无产出时输出 `escalate` 但标注为 `awaiting-verification`；证据不取自检出目录。

- **具体做法**

  `examples/github-actions/merge-gate.yml` 在 "Run gate check" 之前插入：

  ```yaml
      - name: Fetch verifier report
        id: verifier
        env:
          GH_TOKEN: ${{ secrets.LOOP_BOT_TOKEN || secrets.GITHUB_TOKEN }}
          PR: ${{ github.event.pull_request.number }}
        run: |
          set -euo pipefail
          # verifier 产出以带标记的 PR 评论形式存在，绝不从检出目录读取——
          # 实现者能提交 workspace 里的任何文件，但只有 bot 账号能发这条评论。
          REPORT="$RUNNER_TEMP/verifier-report.md"
          gh pr view "$PR" --json comments \
            | jq -r '[.comments[] | select(.body | startswith("<!-- loop-verifier-report -->"))] | last | .body // ""' \
            > "$REPORT.raw"
          if [ ! -s "$REPORT.raw" ] || [ "$(cat "$REPORT.raw")" = "null" ]; then
            echo "verdict=awaiting" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          sed '1d' "$REPORT.raw" > "$REPORT"
          VERDICT="$(grep -m1 -oE 'APPROVE|REJECT|ESCALATE_HUMAN' "$REPORT" || echo awaiting)"
          echo "verdict=$VERDICT" >> "$GITHUB_OUTPUT"
          echo "evidence=$REPORT" >> "$GITHUB_OUTPUT"
  ```

  "Run gate check" 步骤改为：

  ```yaml
        VERDICT="${{ steps.verifier.outputs.verdict }}"
        EVIDENCE=""
        if [ -n "${{ steps.verifier.outputs.evidence }}" ]; then
          EVIDENCE="--evidence-file ${{ steps.verifier.outputs.evidence }}"
        fi
        if [ "$VERDICT" = "awaiting" ]; then
          # 区分"没验"与"验失败"：前者是待办，后者是阻断
          echo "::warning::No verifier report on this PR yet — merge is blocked pending verification."
          node scripts/gate-check.mjs --item "pr-$PR" --phase gate \
            --diff-files @changed.txt --verdict none \
            --budget-pct "$PCT" --reviewed-sha "$REVIEWED_SHA" --head-sha "$HEAD_SHA" \
            --red-check "$RED" --json > gate.json
          jq -e '.decision' gate.json >/dev/null
          jq -n --arg d "$(jq -r '.decision' gate.json)" --arg g "$(jq -r '.gate // "awaiting-verification"' gate.json)" \
            '{decision:$d, gate:$g}' > gate.json   # 标注为待验证，不是验证失败
        else
          node scripts/gate-check.mjs ... --verdict "$VERDICT" $EVIDENCE ...
        fi
  ```

- **可检验验收标准**
  1. `test.mjs` §14 新增 2 条断言：merge-gate.yml 内**不得**出现字面量 `--verdict none`（正则 `--verdict\s+none` 零命中）；证据文件路径必须落在 `$RUNNER_TEMP`（不得出现 `--evidence-file verifier-report.md` 这种相对检出路径）。
  2. 行为断言：用"无 verifier 产出"与"有 APPROVE 产出"两种输入跑 `gate-check`，断言两者的 `gate` 字段不同（`awaiting-verification` vs `null`）——**这条断言在 MP-01 之前必然失败**（两者都会 escalate 到 `verification`）。
  3. 硬约束 10 附加项：改动后必须在**一个真实测试仓库**上跑一次 `ready_for_review`，记录输出到 `STATE.md`；未跑则标 NOT RUN（见 §6.3）。

---

### 3.4 MP-03 换行归一与 CRLF fixture

- **对应问题**：P1-01、P2-01
- **优先级**：**P1**
- **依赖**：无
- **修改内容**：
  1. `common.mjs` 的 `readText()` 统一 `\r\n` → `\n`（一处修，全脚本受益）；
  2. `queue-read.mjs:71` 的正则收尾改 `(.+?)\s*$`（双保险，防未来有人绕过 `readText`）；
  3. `loop-audit.mjs:131` 的占位符守卫随 `readText` 归一后自然恢复；
  4. 新增 `.gitattributes`（可选，见 §4.1）；
  5. `test.mjs` 补 CRLF fixture。

- **具体做法**

  ```js
  // scripts/lib/common.mjs
  export function readText(p) {
    return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  }
  ```

  ```js
  // scripts/queue-read.mjs:71
  const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+?)\s*$/);
  ```

  `test.mjs` §22 增加：

  ```js
  // CRLF 检出：Windows 默认 core.autocrlf=true，正则里的 $ 不会跳过 \r
  const crlfState = ['# STATE', '', '## High Priority (loop is acting or waiting on human)', '',
    '- [ ] 修 CI flake', '- [x] 已完成', '', '## Active', '', '| — | — | — | — | — | — |'].join('\r\n');
  fs.writeFileSync(path.join(tmp, 'STATE.md'), crlfState);
  const crlfQ = JSON.parse(run(['scripts/queue-read.mjs', '--json'], tmp).stdout);
  eq('CRLF 下仍读到未勾选待办', crlfQ.items.length, 1);
  ok('CRLF 下 note 不谎称没有待办', !/既无/.test(crlfQ.note ?? ''), crlfQ.note);
  ```

- **可检验验收标准**
  1. 上述 2 条新断言通过。
  2. 真实仓库自检：`node scripts/queue-read.mjs --json` 在 `D:\harness_loop` 返回 **6** 条（当前返回 0 条）——这是**已复现的对照**，改完必须翻过来。
  3. `test.mjs` §16 新增：CRLF 版 STATE.md（`Last run: never`）→ `activity.present === false`。
  4. 全仓 grep `\r\n` 从 0 命中变为 ≥3 命中（证明防护真的写进去了）。

---

### 3.5 MP-04 接线判定收窄

- **对应问题**：P1-06
- **优先级**：**P1**
- **依赖**：无
- **修改内容**：`hasEventWiring()` 从"有 `on:` 且调用了运行层脚本"改为"有**仓库事件**且调用了 **`event-router.mjs`** 且**消费了路由产物**"。

- **具体做法**

  ```js
  // scripts/lib/common.mjs
  const REPO_EVENT = /^\s*(issues|pull_request_review|check_suite|check_run|workflow_run|release|repository_dispatch)\s*:|^\s*push\s*:\s*\n\s*tags\s*:/m;

  export function hasEventWiring(root) {
    const dir = path.join(root, '.github', 'workflows');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
        const text = readText(path.join(dir, f));
        if (!REPO_EVENT.test(text)) continue;                    // 纯 CI（push/pull_request/workflow_dispatch）不算
        if (!/node\s+scripts\/event-router\.mjs/.test(text)) continue;
        // 必须真的用上路由结果：读 .conflict 或落盘 work item
        if (!/\.conflict|\.loop\/queue|--target/.test(text)) continue;
        return { wired: true, via: 'workflow', detail: `${f} 是仓库事件驱动且消费了路由结果` };
      }
    }
    // 保留 LOOP.md 的 schedule 声明回退（不变）
    ...
  }
  ```

- **可检验验收标准**
  1. **负例断言**：把本仓库自身的 `.github/workflows/self-check.yml`（只含冒烟测试）作为 fixture，断言 `hasEventWiring` 返回 `wired: false`。**这条断言在改动前必然失败**（当前返回 `wired: true`）。
  2. **正例断言**：用 `examples/github-actions/issue-intake.yml` 作为 fixture，断言 `wired: true`。
  3. 端到端断言：改动后 `node scripts/harness-stage.mjs .` 的 Stage 3 判据 1（事件脊已接线）状态发生变化，或 `harness-stage.mjs` 明确说明本包自身不适用该判据。**当前它 PASS，而 `STATE.md` 自己写着"尚未跑过任何一轮真实事件"**——两者不可能同时正确。
  4. 回归：`examples/github-actions/*.yml` 在真实项目里的判定不受影响（用 8 个 workflow 逐个跑 `hasEventWiring` 的临时 fixture 断言）。

---

### 3.6 MP-05 熔断器接进生产路径 + per-pattern 切片 + `noop` 不再洗计数

- **对应问题**：P1-04（含第 3 轮实测确认的 `noop` 缺陷）
- **优先级**：**P1**
- **依赖**：无（MP-06、MP-08 依赖它）
- **修改内容**：
  1. `ci-sweeper.yml:131-141` 的 heredoc 改成真实执行步骤；
  2. `ledger-check.mjs` 增加 `--pattern` 切片与 `no-pattern-records` verdict；
  3. `'pattern'` 加入 `rejectUnknownFlags` 白名单；
  4. **`consecutiveFailures` 改为统计尾部非 `success` 段**（第 3 轮实测确认的缺陷，见验收标准 4）。

- **具体做法**

  ```yaml
  # examples/github-actions/ci-sweeper.yml —— 替换原 "Classify guidance" 里的 heredoc
      - name: Circuit breaker
        id: breaker
        run: |
          set +e
          node scripts/ledger-check.mjs --ledger loop-ledger.json --pattern ci-sweeper --json > breaker.json
          CODE=$?
          set -e
          if [ "$CODE" = "2" ]; then
            echo "::error::Circuit breaker tripped — no further attempts on this item."
            node scripts/ledger-check.mjs --ledger loop-ledger.json --pattern ci-sweeper \
              --escalation > escalation.md
            gh issue create --title "Loop escalated: ci-sweeper" --body-file escalation.md
            exit 1
          fi
  ```

  ```js
  // scripts/ledger-check.mjs —— checkLedger 内，切片后再判定
  const all = Array.isArray(ledger.attempts) ? ledger.attempts : [];
  const attempts = opts.pattern ? all.filter((a) => a.pattern === opts.pattern || a.item === opts.pattern) : all;
  if (opts.pattern && all.length && attempts.length === 0) {
    return { verdict: 'no-pattern-records', exit_code: 2, reason: `ledger has ${all.length} attempt(s) but none for pattern '${opts.pattern}'` };
  }
  // 其余判定（iterations / tokensUsed / consecutiveFailures / stagnationCount）改用 attempts
  ```

- **可检验验收标准**
  1. `test.mjs` §14 的 heredoc 感知扫描器加一条断言：至少一个 workflow 的**可执行** `run:` 内容里出现 `ledger-check.mjs`（当前只出现在 heredoc 文本里，断言必须失败）。
  2. `test.mjs` §4 新增 2 条：账本含 3 条 `ci-sweeper` 失败 + 3 条 `pr-review` 失败，`--pattern ci-sweeper` 的 verdict 不得是 `no-progress`（per-pattern 切片生效）；`--pattern nosuch` → `no-pattern-records` exit 2。
  3. 反向断言：把 `opts.pattern` 过滤删掉，第 2 条必须变红。
  4. **补充项（P1-04 的 `noop`，第 3 轮已实测确认，直接修）**：账本 `[f,f,noop,f,f]` → `ok, 2/5, exit 0`，而 `[f,f,f,f,f]` → `no-progress, 5/5, exit 2`。**一次被锁跳过的 `noop`（合法结局）就能把"5 次都没进展"洗成"2 次"。** 修法：`consecutiveFailures` 改为统计**尾部非 success 段**（`noop` 与 `failure` 都算"没进展"），而不是尾部连续 `failure` 段。断言要**双向**：既验"插入 `noop` 不重置计数"，也验"一次 `success` 确实重置计数"。

---

### 3.7 MP-06 状态写入入口

- **对应问题**：P1-02
- **优先级**：**P1**
- **依赖**：MP-05（账本写入与 run-log 写入共享同一批 workflow 接线）
- **修改内容**：新增 `scripts/run-log-append.mjs`；持久化方式见 §8 待决 1。

- **具体做法**

  新脚本（fail-closed：枚举非法则**不写任何东西**并 exit 2）：

  ```js
  #!/usr/bin/env node
  // 追加一条循环运行记录到 loop-run-log.md 的 ## Log 区。
  // 这是 budget-check 计算 used 的唯一数据源——没有它，per-loop 预算上限是装饰品。
  import fs from 'node:fs';
  import path from 'node:path';
  import { parseArgs, readText, rejectUnknownFlags, printJson, fail } from './lib/common.mjs';

  const OUTCOMES = ['no-op', 'report-only', 'fix-proposed', 'verified', 'escalated', 'no-wiring', 'manual'];
  const LOG_SECTION = /^##\s+Log\s*$/m;

  const args = parseArgs(process.argv.slice(2));
  rejectUnknownFlags(args, ['pattern','event','item','level','outcome','tokens','duration','itemsFound','actionsTaken','escalations','worktree','root','json','help']);

  const pattern = args.pattern;
  const outcome = args.outcome;
  if (!pattern) fail('--pattern is required (it is the budget key)');
  if (!outcome) fail('--outcome is required');
  if (!OUTCOMES.includes(outcome)) {
    fail(`--outcome '${outcome}' is not a valid outcome. Valid: ${OUTCOMES.join(' | ')}`, 2);
  }

  const root = args.root || process.cwd();
  const logPath = path.join(root, 'loop-run-log.md');
  const text = readText(logPath);
  const m = text.match(LOG_SECTION);
  if (!m) fail('loop-run-log.md has no "## Log" section');

  const record = {
    run_id: `${new Date().toISOString().slice(0, 10)}-${pattern}`,
    pattern,
    event: args.event ?? null,
    item: args.item ?? null,
    level: args.level ?? null,
    duration_s: Number(args.duration ?? 0),
    items_found: Number(args.itemsFound ?? 0),
    actions_taken: Number(args.actionsTaken ?? 0),
    escalations: Number(args.escalations ?? 0),
    tokens_estimate: Number(args.tokens ?? 0),
    worktree: args.worktree ?? null,
    outcome,
    at: new Date().toISOString(),
  };

  const at = m.index + m[0].length;
  const updated = text.slice(0, at) + '\n' + JSON.stringify(record) + '\n' + text.slice(at).replace(/^\n+/, '\n');
  fs.writeFileSync(logPath, updated);
  if (args.json) printJson(record);
  else console.log(`appended: ${record.run_id} (${outcome})`);
  ```

  workflow 接线（**取决于 §8 待决 1**）：

  ```yaml
      - name: Append run record
        if: always()
        run: |
          node scripts/run-log-append.mjs --pattern issue-intake --event "$EVENT" \
            --item "$ITEM" --level L1 --outcome no-op --tokens 4200
          # runner FS 是临时的：必须提交或评论出去才真的持久化
          git checkout -B loop-state
          git add loop-run-log.md && git commit -m "loop: run record" && git push -f origin loop-state
  ```

- **可检验验收标准**
  1. `test.mjs` 新增 3 条：合法 outcome → 文件多一行且能 `JSON.parse`；非法 outcome → exit 2 且**文件字节不变**；缺 `## Log` 区 → exit 1。
  2. 新增断言：`loop-run-log.md` 的 outcome 枚举集合 == `run-log-append.mjs` 的 `OUTCOMES` == `test.mjs` §12 的校验集合（三处同源，取代 MP-12 的枚举部分）。
  3. **端到端断言（G6）**：至少一个 workflow 的 `run:` 调用 `run-log-append.mjs`，且该 workflow 的产物能被 `budget-check` 读到（即 `used` 会随运行增长）——**这是"预算百分比恒为 0"的验收条件**。
  4. 在真实仓库上跑一次，记录 `budget-check --pattern issue-intake` 的 `used` 从 0 变为非 0（硬约束 10）。

---

### 3.8 MP-07 独立性 / worktree 的声明一致性检查

- **对应问题**：P1-05
- **优先级**：**P1**
- **依赖**：MP-01（复用同一 escalate 通道）
- **修改内容**：`gate-check` 新增规则 10。**必须显式标注这不是身份认证。**
- **具体做法**

  ```js
  // 规则 10：声明一致性（不是身份认证）
  if (opts.verifierId && opts.implementerId && opts.verifierId === opts.implementerId) {
    return { decision:'escalate', gate:'verifier-independence',
      reason:`--verifier-id and --implementer-id are identical ('${opts.verifierId}'). Verification must be a different agent instance.`,
      exit_code:2 };
  }
  if (opts.worktree && !/(^|[\\/])loop[\\/]/.test(opts.worktree)) {
    return { decision:'escalate', gate:'worktree-isolation',
      reason:`--worktree '${opts.worktree}' is not an isolated loop/<event>-<item>-attempt<N> worktree.`,
      exit_code:2 };
  }
  ```

  白名单加入 `verifierId` / `implementerId` / `worktree`。

  文档同步（`skills/harness-loop/SKILL.md` 第 6 步表格新增两行，并在表下加一句）：

  > `--verifier-id` / `--implementer-id` / `--worktree` 是**声明一致性检查**：它只能发现调用方自报值互相矛盾，**不能证明验证者是不同实例**。真正的隔离由宿主平台提供。

- **可检验验收标准**
  1. `test.mjs` §18 新增 2 条：`--verifier-id a --implementer-id a` → exit 2 且 `gate: verifier-independence`；`--worktree /tmp/x` → exit 2 且 `gate: worktree-isolation`。
  2. 新增 1 条：`--worktree loop/ci-1-attempt1 --verifier-id v --implementer-id i` → `proceed`。
  3. 文档断言：SKILL.md 必须含"不能证明验证者是不同实例"这句（防止后续把声明检查写成"已强制"）。

---

### 3.9 MP-08 占位符账本与熔断触发分离退出码

- **对应问题**：P2-09
- **优先级**：**P1**（低成本、消除一类持续误报）
- **依赖**：MP-05
- **修改内容**：`placeholder-ledger` 与 `no-pattern-records` 从 exit 2 改为 exit 4；`init.sh` 的负向断言相应更新。

- **具体做法**：`ledger-check.mjs` 的 `placeholder-ledger` / `no-ledger` / `no-pattern-records` 统一 `exit_code: 4`（语义："未初始化/不适用"，与"该停了"的 2 分离）；`init.sh` 的断言从"必须不 exit 0"改为"必须 exit 4"。

- **可检验验收标准**
  1. `test.mjs` §4 新增：占位账本 → exit 4 且 verdict `placeholder-ledger`；真熔断账本 → exit 2 且 verdict ∈ {stagnation, no-progress, max-iterations, token-budget}。
  2. `init.sh` 的负向断言改成 `code=4` 且仍然通过。
  3. 反向断言：把占位符检测的 `exit_code` 改回 2，第 1 条必须变红。

---

### 3.10 MP-09 安装漂移检测

- **对应问题**：P2-02
- **优先级**：**P2**
- **依赖**：无（MP-14 依赖它）
- **修改内容**：
  1. 清单写入时记录 `layout` 与 `dotDir`；
  2. `--check` 缺字段时按 `packRoot` 反查，并在输出里说明用的是哪个 layout；
  3. `--check` 只比较**清单登记过**的技能名，不把目标目录里所有同名文件当自己的；
  4. 把 `--check` 接进 `init.sh` 与 `self-check.yml`。

- **具体做法**

  ```js
  // install-skills.mjs —— 写清单
  const manifest = { installedAt: new Date().toISOString(), packRoot, scope, layout, dotDir, skills_count: written.length, skills: written };
  ```

  ```js
  // checkInstalled —— 缺 layout 时按清单里的技能名反查目标目录
  const names = new Set(Object.keys(manifest.skills ?? {}));
  // 只对清单登记过的技能做漂移比较；目录里的其他技能不属于本包，忽略
  for (const name of names) { ... }
  ```

  ```yaml
  # .github/workflows/self-check.yml 新增步骤
      - name: Verify installed skills are not stale
        run: node scripts/install-skills.mjs --scope user --layout agents --check
  ```

- **可检验验收标准**
  1. `test.mjs` §19 新增 3 条：装到 layout A 后用 layout B 调 `--check` → 报 layout 不匹配（exit 1，reason 含 layout 名），**不得**报无关技能漂移；清单缺 `layout` 字段时能按 `packRoot` 反查成功；`--check` 输出不得包含目标目录里非本包的技能名。
  2. 真实环境验收：在本机跑 `--layout zcode --scope user --check`，输出应只含 18 个 loop-harness 技能（当前会把 16 个无关技能报成残留，并漏掉 `harness-loop-init` 未安装这一事实）。
  3. `init.sh` 新增该检查后，若本机技能过期则 `init.sh` 必须红——即"装的是旧版"不能再被忽略。

---

### 3.11 MP-10 能力感知断言（**不是**平台感知）

> **⚠️ 第 3 轮修正（2026-10-16）**：本项原称"平台感知"。若实现成 `process.platform === 'win32'` 就**错了**——复核实测：原生 `powershell.exe` 下直接跑 `test.mjs` 得到 **979/0**，因为 Git 的 `/usr/bin` 在 PATH 上，解析到 GNU coreutils 的 `timeout`，`hasGnuTimeout()` 为真。只有把 `C:\Windows\system32` 排到 Git 之前才复现 978/1。
>
> **分叉判据必须是 `hasGnuTimeout()` 的实际返回值，不能是平台名。** 否则会写出一个在开发机上恒绿的假断言。详见审查报告 §7.4 / §9.4。

- **对应问题**：P2-08
- **优先级**：**P2**
- **依赖**：MP-03（CRLF fixture 一并补）
- **修改内容**：tree-kill 断言按 **`hasGnuTimeout()`** 分叉；同时确保降级可见。

- **具体做法**

  ```js
  // scripts/test.mjs:2576-2585 附近
  // 注意：hasGnu 来自 common.mjs 的能力探测，不是 process.platform —— Windows 上
  // Git 在 PATH 里时同样能拿到 GNU timeout（实测原生 PowerShell 下也是 979/0）。
  if (hasGnu) {
    eq('超时后孙进程已被回收（整棵树被杀，不留孤儿）', grandchildAlive, false);
  } else {
    // 本环境无 GNU timeout：断言"降级必须可见"，而不是断言一个做不到的行为
    eq('无 GNU timeout 时 runWithTreeKill 明确标记 treeKill=false', probe.treeKill, false);
    ok('harness-stage 在 NOT RUN 说明里点出平台降级', /本平台无 GNU timeout/.test(stageOut));
    try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  }
  ```

  `hasGnuTimeout` 目前是 `common.mjs:600` 的模块私有函数。要按它分叉，需**导出**它（或导出 `capabilities()` 返回 `{ gnuTimeout }`）。`test.mjs:2641` 已用 `treeKill` 标记间接验证过同一件事（`eq('treeKill 标记与平台能力一致', okRun.treeKill, hasGnu)`），导出后可直接按能力分叉。

- **可检验验收标准**
  1. **两种环境都必须 0 失败，且两种环境要真的都跑过**：
     - git bash（Git 在 PATH 前部，`hasGnu === true`）→ `Failed: 0`；
     - 原生 PowerShell **且** `system32` 排在 Git 之前（`hasGnu === false`）→ `Failed: 0`。
     > 不能只跑其中一个就宣布完成——这正是原表述出错的原因。
  2. **不降低强度**：`hasGnu === true` 分支仍断言孙进程已死。
  3. 反向断言：强制 `hasGnu = false` 时，`hasGnu === true` 分支的断言不得被执行（用计数或 `--verbose` 输出核对）。
  4. 清理：测试结束时不得残留 `sleep` 进程（`Get-CimInstance Win32_Process` 复查为空）。
  5. **断言分叉的是能力不是平台**：该测试块内 `process.platform` 零命中（防止后续把它"简化"成平台判断而重新变绿）。

---

### 3.12 MP-11 文档边界声明

- **对应问题**：P1-03
- **优先级**：**P2**（但**必须在任何 L2 使用之前**完成）
- **依赖**：无
- **修改内容**：在 `examples/github-actions/README.md` 与 `skills/harness-loop/SKILL.md` 顶部各加显式边界声明。

- **具体做法**

  `skills/harness-loop/SKILL.md` 第 5 步之前插入：

  > **本包不含 agent 运行器。** 第 5 步的"派发"由外部平台消费第 2/3 步的产物（`.loop/queue/<item>.json` 或路由 JSON）完成。未接线时循环止于 `fix-proposed`——**这是合法结局，不是失败**。若你正在手动执行本技能，你自己就是那个执行者。

  `examples/github-actions/README.md` 现有那句"workflow 不执行 agent 逻辑"保留，并在其上补一行：

  > **没有 agent 运行器时，本目录的 workflow 只能完成"感知 + 判定 + 记账"，不能完成"修改 + 验证"。**

- **可检验验收标准**
  1. `test.mjs` §11/§14 新增断言：`harness-loop/SKILL.md` 必须含"本包不含 agent 运行器"；`examples/github-actions/README.md` 必须含"只能完成"或等义句子。
  2. 文档一致性：`test.mjs` §12 的 README 断言扩展为"README 必须声明本包不含 agent 运行器"。

---

### 3.13 MP-12 阈值与枚举各收敛到单一真相源

- **对应问题**：P2-03（5 vs 10）、P2-10（outcome 5 值 vs 7 值）
- **优先级**：**P2**
- **依赖**：无（枚举部分与 MP-06 共享，建议一起做）
- **修改内容**：
  1. `LOOP.md:157` 的"超过 10 个文件"改为指向 `gate-check` 的 `maxFilesPerFix`；
  2. `skills/loop-budget/SKILL.md` 的 outcome 枚举改为 7 值并注明"以 `loop-run-log.md` 为准"。

- **具体做法**

  ```diff
  - - 单次改动超过 10 个文件 → 人工审批
  + - 单次改动超过 `scripts/gate-check.mjs` 的 `maxFilesPerFix`（默认 5；清理类走 `maxFilesPerCleanup`，默认 10）→ 人工审批
  ```

  ```diff
  - outcome: no-op | report-only | fix-proposed | verified | escalated
  + outcome: no-op | report-only | fix-proposed | verified | escalated | no-wiring | manual
  + （完整定义与语义见 loop-run-log.md 的表头，此处不另立一份）
  ```

- **可检验验收标准**
  1. `test.mjs` §17 新增 1 条：扫 `LOOP.md` 与 `skills/*/SKILL.md` 中出现的"超过 N 个文件"模式，断言其中的 N 与 `gate-check` 的 DEFAULTS 一致（当前 5 vs 10 会让它红）。
  2. 新增 1 条：扫全部技能文件里的 outcome 枚举集合，断言都等于 `test.mjs` §12 的校验集合（当前 5 值会让它红）。
  3. 反向断言：把 `LOOP.md` 的数字改回 10，第 1 条必须变红。

---

### 3.14 MP-13 触发描述加否定式边界

- **对应问题**：P2-06
- **优先级**：**P2**
- **依赖**：无
- **修改内容**：`description` 首句改为能力 + 否定边界，把必需参数提到第二句。

- **具体做法**

  ```yaml
  description: >-
    Run ONE issue/PR event through the loop (route → constraints → budget → gate → state).
    Do NOT use this to create or edit harness skills, to explain the design, or to audit a repo —
    those are different jobs. Use it when an event arrived (issue opened, PR review requested
    changes, CI failed, PR merged, tag pushed) and something must happen next. Requires event
    wiring (.github/workflows/ with a script call, or a schedule declared in LOOP.md); without it
    step 0 exits with outcome "no-wiring". Invoked by hand it requires --event and --target
    (e.g. --event pull_request_review.changes_requested --target pr-123) — step 2 has nothing to
    route without them.
  ```

- **可检验验收标准**
  1. `test.mjs` §11 新增 2 条：description 必须含 `Do NOT use` 或等义否定式；必须含 `--target`。
  2. 长度断言：折叠后字符数 ≤ 1024（当前 821，改后需复核）。
  3. 无法在目标 agent 中实测触发行为，**在报告中标注为"基于文本的预测"**，不做"已验证"声明。

---

### 3.15 MP-14 宿主路径单一真相源

- **对应问题**：P2-07
- **优先级**：**P2**
- **依赖**：MP-09
- **修改内容**：`LAYOUTS` 与 `SKILL_DIRS` 收敛到一处；补 `.pi`；文档改中性表述。

- **具体做法**

  ```js
  // scripts/lib/common.mjs —— 单一真相源
  export const SKILL_DOT_DIRS = ['.agents', '.pi', '.zcode', '.grok', '.claude', '.codex'];
  export const SKILL_DIRS = SKILL_DOT_DIRS.map((d) => `${d}/skills`).concat(['skills']);
  ```

  ```js
  // install-skills.mjs
  import { SKILL_DOT_DIRS } from './lib/common.mjs';
  export const LAYOUTS = {
    ...Object.fromEntries(SKILL_DOT_DIRS.map((d) => [d.slice(1), [d]])),
    both: ['.agents', '.pi'],
  };
  ```

  `README.md:105-106` 与 `docs/12-stage-commands.md:25` 改为"装到你的 agent 能发现的位置（`--layout` 见 `--help`）"。

- **可检验验收标准**
  1. `test.mjs` §19 新增 1 条：`LAYOUTS` 覆盖的 dot-dir 集合 == `SKILL_DIRS` 里的 dot-dir 集合（差异即红）。
  2. 新增 1 条：`--list` 输出必须列出 `.pi`。
  3. 文档断言：`README.md` 不得再出现"ZCode 读"这类把某宿主写死的表述（正则 `ZCode 读` 零命中）。

---

### 3.16 MP-15 无消费者的两处声明

- **对应问题**：P2-05
- **优先级**：**P2**
- **依赖**：无
- **修改内容**：`loop-budget.md` 第 4 列（最大子智能体/轮）与 `registry.yaml` 的 `suggested_daily_cap`，各自"接入或删除"。

- **具体做法**（两条路径，二选一，见 §4.3）
  - **路径 A（接入）**：`budget-check.mjs` 的 `parseBudgetCaps` 一并解析第 4 列，输出 `max_subagents_per_run`；`harness-loop` 第 5 步在派发前读取并据此限制派发数量。
  - **路径 B（降级）**：把第 4 列移出表格，改为正文说明"当前未接线"；`registry.yaml` 删除 `suggested_daily_cap`（或加 `# unused:` 前缀并加注释）。

- **可检验验收标准**
  1. 若选路径 A：变异测试——把某循环的 `max sub-agent spawns/run` 从 3 改成 1，断言 `budget-check --json` 的输出字段随之变化（沿用 `test.mjs` §17 的手法）。
  2. 若选路径 B：断言 `budget-check --json` 的输出里**不出现**该字段，且 `registry.yaml` 不再含 `suggested_daily_cap`。
  3. 两种路径都不允许"字段还在、无人读、也没有注释说明"的中间状态。

---

### 3.17 MP-16 工具范围声明

- **对应问题**：P2-04
- **优先级**：**P2**
- **依赖**：无
- **修改内容**：`harness-loop` 与 `minimal-fix` 声明允许的工具集（若目标平台支持），或明确声明"本包无工具级隔离"。

- **具体做法**
  - **路径 A**：在技能 frontmatter 加 `allowed-tools`（宿主是否识别需先确认——本机 pi 不识别，故仅对支持它的平台有意义），并让 `loop-audit.mjs:290` 的 `toolScope` 判据指向该声明。
  - **路径 B（推荐）**：在 `loop-constraints.md` 的 Data 节与 `docs/04-safety.md` 加一句明确边界：

    > 拒绝列表只覆盖**自动编辑路径**（`gate-check` 的 denylist 闸门）。本项目**不含工具级权限隔离**：读取、写非代码文件、网络访问的边界由宿主平台与 workflow 的 `permissions:` 提供，不由本包提供。

  并让 `loop-audit.mjs:290` 的判据接受这句声明（或把该项从计分改为"信息项"，因为当前它必然 FAIL 且没有可行的修复动作）。

- **可检验验收标准**
  1. 路径 B：`loop-audit.mjs .` 的 `toolScope` 不再 FAIL（或该项被移出计分并在输出里标注为 informational）。
  2. 断言 `loop-constraints.md` 含"不含工具级权限隔离"这句。
  3. 断言 `loop-audit` 的判据正则与该句真的匹配（**变异测试**：删掉那句 → 该项重新 FAIL）。

---

### 3.18 MP-17 三条打磨项

- **对应问题**：P3-01
- **优先级**：**P2**（成本极低，顺手做）
- **依赖**：无
- **修改内容**：
  1. `loop-audit.mjs:316` 的 `Math.max(1, …)` → 0 项应报 0/5 而非 1/5；
  2. `loop-audit.mjs:216` 单技能记满双技能权重 → 按实际技能数计权；
  3. `test.mjs` 的临时目录清理改 `try/finally`。

- **可检验验收标准**
  1. 断言 `loop-audit` 在"0 项"输入下输出 `0/5`。
  2. 断言单技能仓库的 verifier 相关分数低于双技能仓库。
  3. 断言测试抛异常后临时目录仍被清理（构造一个会 throw 的 fixture，检查 `%TEMP%` 无新增 `lh-*`）。

---

### 3.19 MP-18 无效字段断言

- **对应问题**：P3-02
- **优先级**：**P2**
- **依赖**：无
- **修改内容**：`user_invocable` 接到行为，或从断言移除。

- **具体做法**：二选一——
  - **A**：`install-skills.mjs` 读取 `user_invocable`，为 false 的技能不装进可调用位置（并在 `--list` 里标注）；`test.mjs:2356` 的断言指向该行为。
  - **B**：删除 `test.mjs:2166` 对 `stage` 之外字段的断言（`stage` 保留——`harness-stage.mjs` 真的读它），并在 `test.mjs` 注释里写明"`user_invocable` / `license` 仅供目标平台使用，本包不读"。

- **可检验验收标准**：断言要么指向可观察行为（A），要么不存在（B）。不允许保留"断言某个不被读取的字段的值"这种形式（硬约束 11）。

---

### 3.20 MP-19 重复 id

- **对应问题**：P3-03
- **优先级**：**P2**
- **依赖**：无
- **修改内容**：`feature_list.json` 中 `stage-001` 的两条（索引 1 与 7）改成不同 id（如 `stage-001` 与 `stage-004`）。

- **可检验验收标准**
  1. 新增断言：`feature_list.json` 的 id 集合大小 == 条目数（唯一性）。
  2. `harness-stage.mjs .` 的 Stage 1 判据 1 由 FAIL 转 PASS。

---

## 4. 针对难点的专项方案

审查过程中遇到 6 个难点（D1–D6，见审查报告 §6）。它们不只是"审查时不好查"，其中 4 个会在**实施**阶段再次出现，需要专门的方案。

### 4.1 D1 —— 区分"文档声称的能力"与"实际存在的机制"

**问题**：同一个词（"强制""必须""机械判定"）既描述真实代码，也描述提示词自律。实施者改完代码后，同样容易在文档里留下新的落差。

**备选方案**

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 命名约定 | 文档里凡涉及机制处一律标注 `[机制]`（有代码入口 + 有断言）或 `[约定]`（靠自律） | ✅ 成本极低、可 grep、可断言<br>❌ 需要人真的写标签；历史文档不会自动获得标签 |
| B 机制清单文件 | 新增 `mechanisms.json` 列出每个"机械判定"的代码入口与断言位置，`test.mjs` 校验每个入口真实存在 | ✅ 机器可校验，最严格<br>❌ 又引入一个"无人读的配置"风险（本仓库已有两处这种教训） |
| C 逐条审计脚本 | `loop-audit.mjs` 增加"机制可追溯性"检查：对文档里出现 `机械`/`强制` 的句子要求可定位到代码 | ✅ 复用既有审计入口<br>❌ 自然语言到代码的映射不可靠，容易变成关键词匹配（本仓库已批评过裸子串匹配） |

**推荐：A**（并限定只对**新增或修改**的句子生效，不追溯历史文档）。理由：本仓库最贵的教训就是"无人读的配置会漂移"（`loop-budget.md` 第 4 列、`suggested_daily_cap`），方案 B/C 都会新增一份需要维护的映射。A 的成本是"多打一个方括号"，收益是可 `grep '\[机制\]'` 出全部真实机制——足以支撑 MP-07/MP-11/MP-16 里那些"明确标注不是认证/不是隔离"的要求。

**验收**：MP-01/MP-07/MP-11/MP-16 引入的新句子必须带标签；`test.mjs` 断言这些句子里出现 `[机制]` 或 `[约定]`。

### 4.2 D2 + D3 + D4 —— 测试方法论（平台差异、fixture 完整性、对抗输入）

**问题**：三个难点指向同一件事——**测试本身可能给出错误的安全感**。
- D2：同一断言在两平台结果相反（`978/1` vs `979/0`），而 CI 只跑其中一平台。
- D3：fixture 不完整时，"两个对照结果相同"是噪声而非结论（CRLF 爆炸半径一度被误判）。
- D4：只读代码会认为闸门成立，必须喂对抗输入才暴露形状匹配。

**专项方案（三部分，缺一不可）**

1. **能力矩阵（第 3 轮修正：不是"平台"矩阵）**：把 `self-check.yml` 改为矩阵（`ubuntu-latest` + `windows-latest`），或至少把断言按 `hasGnuTimeout()` 分叉（MP-10）。**取舍**：Windows runner 更慢、更贵；但本仓库的开发环境就是 Windows，不覆盖它等于让"本机红、CI 绿"长期存在。推荐**先做 MP-10 的分叉**（成本低），矩阵作为后续可选增强。
   > **注意**：分叉的判据是**能力**（`hasGnuTimeout()` 的返回值），不是平台名。复核实测：原生 PowerShell 下 Git 在 PATH 里时 `hasGnu === true`，`test.mjs` 是 **979/0** 而非 978/1。按 `process.platform === 'win32'` 分叉会得到一个在开发机上恒绿的假断言。

2. **fixture 完整性规则**（把 D3 的教训变成规则，写进 `test.mjs` 顶部注释）：

   > 对照实验必须**先归因**再比变量：若两个对照结果完全相同，先确认失败原因来自被测变量，而不是 fixture 缺失。用不完整 fixture 得到的"相同"是噪声。

   并补一条断言：`test.mjs` §16/§22 的 fixture 必须包含被测脚本**实际读取的全部文件**（用一个 fixture 清单常量 + 断言清单完整）。

3. **对抗 fixture 制度化**：MP-01 的 5 条新断言就是 D4 的产物。规定：**任何闸门类修改必须同时提交"应当被拒绝"的输入**，且该输入必须让断言在修改前变红（fail-first）。这条已写进 MP-01/MP-02/MP-04/MP-05/MP-07 的验收标准。

### 4.3 D6 —— 判断"配置是否装饰品"的机制

**问题**：grep 只能证明"没有直接引用"，不能证明"改了它行为不变"；间接消费者（agent 读配置自行判断）静态分析无法排除。

**备选方案**

| 方案 | 做法 | 取舍 |
|---|---|---|
| A 变异测试 | 沿用 `test.mjs` §17 已有手法：改配置值 → 断言脚本输出变化 | ✅ 已在本仓库验证有效（`stagnation: 1` → `'stagnation'`；`max_attempts: 1` → `'escalate'`）<br>❌ 只能覆盖"有代码消费者"的配置；对"agent 自行读"的配置无效 |
| B 声明式"未接线"标记 | 未被代码消费的配置必须加显式注释 `# unused:`，`test.mjs` 断言"要么有消费者，要么有 unused 标记" | ✅ 消除"看起来在生效"的错觉；成本极低<br>❌ 不解决"agent 可能真的在读它"的存疑 |
| C 删除 | 无消费者的配置直接删 | ✅ 最彻底<br>❌ 若真有间接消费者（如 agent 读 `registry.yaml` 决定调度），删掉会静默降级行为 |

**推荐：A + B 组合**。
- 有代码消费者的（`defaults:` 的阈值、`maxFilesPerFix`）→ 变异测试（A）。
- 无法排除间接消费者的（`suggested_daily_cap`、`max sub-agent spawns/run`）→ 显式 `unused:` 标记（B），**并在 `STATE.md` 的 Watch List 记录"疑似间接消费者，待确认"**。这样既不让它假装生效，也不冒险删除。

**验收**：`test.mjs` 新增断言——`registry.yaml` 与 `loop-budget.md` 里每一个数值型配置项，必须至少满足其一：(a) 存在变异测试；(b) 带 `unused:` 标记或正文注明未接线。

### 4.4 D5 —— 真机 / Linux / 触发行为无法验证

**问题**：硬约束 10 要求"改了厂商接入必须真机验证"，8 个 workflow 从未在任何真实 GitHub 仓库跑过；Linux 路径未验证；触发行为无法在目标 agent 实测。

**专项方案**：**分层验证，每层显式标注覆盖范围**

| 层 | 手段 | 覆盖 | 不覆盖 |
|---|---|---|---|
| L1 单元 | `test.mjs` 断言 | 脚本逻辑、解析、闸门判定 | 平台差异、真实事件 |
| L2 双平台 | `hasGnuTimeout()` 分叉 + 本地两 shell 各跑一次 | 平台相关退化路径 | 真实 GitHub |
| L3 真实仓库 | 一个专用测试仓库跑 `issues.opened` 与 `ready_for_review` 各一次 | workflow 语法、`gh` 调用、artifact 投递、token 回退 | 长周期行为 |
| L4 长周期 | 一周运行 + 指标 | 误报率、升级率、成本 | — |

**实施要求**：
- **MP-02 / MP-06 / MP-09 完成后必须做 L3**（它们改的是 workflow 与跨文件写入），结果写入 `STATE.md`；未做则标 NOT RUN，且**不得**在真实项目上启用 L2。
- **L4 不是本 Spec 的范围**（需要一周），但 `loop-budget.md` 的"Alerts This Period"与 `loop-run-log.md` 的 Metrics to Watch 已为它准备好容器。
- 触发行为（P2-06）**只能**标注为"基于文本的预测"——本 Spec 不假装能验证它。

---

## 5. 实施顺序与里程碑

### 阶段 1：核心缺陷（M1）

**目标**：G1、G2、G3、G4、G5 —— 修完才允许在真实项目上开 L2。

| 顺序 | 项 | 理由 |
|---|---|---|
| 1.1 | **MP-01** | 证据语义是其他一切验证的前提；且 MP-02、MP-07 依赖它的 escalate 通道 |
| 1.2 | **MP-02** | 依赖 1.1；不修则唯一的生产闸门恒定 escalate |
| 1.3 | **MP-03** | 独立；但越早做越好——CRLF 缺陷让本地自检直接失真（`queue-read` 返回 0 条） |
| 1.4 | **MP-04** | 独立；不修则 Stage 3 判据 1 是假 PASS |
| 1.5 | **MP-05** | 独立；不修则熔断器（硬约束 2）在生产路径上不存在 |

**M1 出口条件（全部为真）**：
- `node scripts/test.mjs` 在 **`hasGnu === true` 与 `hasGnu === false` 两种环境**下均 `Failed: 0`（第 3 轮修正：判据是能力不是平台名——git bash 通常 `true`，原生 PowerShell 把 `system32` 排到 Git 之前则 `false`；两处都要**真的跑过**）；
- `bash init.sh` 通过；
- `node scripts/queue-read.mjs --json` 在 `D:\harness_loop` 返回 6 条（不是 0 条）；
- 用"APPROVE + `Tests → FAIL`"的证据跑 `gate-check` 必须 exit 2（当前 exit 0）；
- **`--diff-files <多行清单>`（无 `@`）必须报错**，不得静默塌缩为 `files_changed: 1`（第 3 轮新增，替代原"裸路径"判据）；
- `hasEventWiring('.')` 在本仓库返回 `wired: false`（当前 `true`）；
- 至少一个 workflow 的可执行 `run:` 里出现 `ledger-check.mjs`；
- 上述七条命令与输出写入 `STATE.md`。

**M1 之后**：项目可安全用于真实项目的 **L1（只读报告）**。

### 阶段 2：可靠性（M2）

**目标**：G6、G7 + 消除误报类缺陷。

| 顺序 | 项 | 理由 |
|---|---|---|
| 2.1 | **MP-06**（需先定 §8 待决 1） | 状态能落盘是"循环记得住"的唯一前提 |
| 2.2 | **MP-07** | 依赖 1.1；把三条"硬约束"变成可检查的声明一致性 |
| 2.3 | **MP-08** | 依赖 1.5；消除"占位符 = 熔断"的持续误报 |
| 2.4 | **MP-09** + **MP-14** | 一起做（后者依赖前者）；修完才能在多宿主环境正确安装 |
| 2.5 | **MP-10** | 依赖 1.3；让两平台都能 0 失败 |
| 2.6 | **MP-11** | 依赖无；但**必须在 L2 之前**完成（文档边界） |
| 2.7 | **MP-12** | 收敛阈值与枚举真相源 |

**M2 出口条件**：
- `budget-check --pattern <loop>` 的 `used` 在跑过一次 workflow 后**不再恒为 0**；
- `install-skills --check` 在本机输出只含本包技能，且能报出 `harness-loop-init` 未安装；
- 三条无实现的硬约束在文档里带 `[约定]` 标签，或已有实现；
- `LOOP.md` 的文件数阈值与 `gate-check` DEFAULTS 一致（新增断言绿）；
- 全部技能的 outcome 枚举集合唯一。

**M2 之后**：可在真实项目上做 **L2 受控试验**（人工在环，worktree 隔离，合并仍人工）。

### 阶段 3：效率与可维护性（M3）

| 顺序 | 项 |
|---|---|
| 3.1 | **MP-13**（触发描述） |
| 3.2 | **MP-15**（死配置接入或降级） |
| 3.3 | **MP-16**（工具范围声明） |
| 3.4 | **MP-17**、**MP-19**（打磨项） |
| 3.5 | **MP-18**（无效字段断言） |

**M3 出口条件**：`loop-audit.mjs .` 的 `toolScope` 不再 FAIL（或已移出计分并标注 informational）；`harness-stage .` 的 Stage 1 判据 1 转 PASS。

### 5.4 依赖链（实施时不可打乱）

```
MP-01 ──┬─→ MP-02
        └─→ MP-07
MP-05 ──┬─→ MP-06 ──→ （M2 出口：used 非 0）
        └─→ MP-08
MP-03 ──→ MP-10
MP-09 ──→ MP-14
MP-06 ↔ MP-12（枚举同源）
```

---

## 6. 验证与回归方案

### 6.1 仓库既有约定（必须遵守，否则会破坏套件）

1. **断言计数三处同步**：`scripts/test.mjs` 尾部有一个 `DOC_OFFSET = 3` 的自检——`passed + failed + 3` 必须等于 `README.md`、`progress.md`、`docs/10-how-to-use.md` 三处声明的三位数断言总数。**每次新增断言都必须同步改这三个文件**，否则套件尾部会红。（历史事故：仓库曾有四个互相矛盾的计数 323/409/451/498。）
2. **新增断言必须 fail-first**：先在未修改的代码上跑，确认它红，再改代码让它绿。
3. **临时目录必须 `try/finally` 清理**（MP-17 会顺手补上；新写的测试直接用 finally）。
4. **不为了让套件变绿而放宽任何断言**（硬约束 5）。
5. **`pre-commit` 钩子会跑整套 `test.mjs`**（`.githooks/pre-commit`，`core.hooksPath` 已装），所以提交即验证。

### 6.2 每项 MP 的验证归属

| MP | 单元断言 | 变异/反向断言 | 端到端 | 真实仓库 |
|---|---|---|---|---|
| MP-01 | 5 条（§18） | 1 条（收紧状态值分组） | — | — |
| MP-02 | 2 条（§14） | 1 条（awaiting vs APPROVE 的 gate 不同） | ✅ 必须 | ✅ **必须** |
| MP-03 | 2 条（§22）+ 1 条（§16） | — | ✅ 真实仓库 6 条 | — |
| MP-04 | 1 条负例 + 1 条正例 | — | ✅ `harness-stage` | — |
| MP-05 | 1 条（§14）+ 2 条（§4） | 1 条（删 pattern 过滤） | — | — |
| MP-06 | 3 条 + 1 条同源 | — | ✅ 必须 | ✅ **必须** |
| MP-07 | 3 条（§18）+ 1 条文档 | — | — | — |
| MP-08 | 1 条（§4） | 1 条（改回 2） | ✅ `init.sh` | — |
| MP-09 | 3 条（§19） | — | ✅ `init.sh` | ✅ 本机即可 |
| MP-10 | 2 条分叉 | 1 条（强制 hasGnu=false） | ✅ 两 shell | — |
| MP-11 | 2 条文档断言 | — | — | — |
| MP-12 | 2 条（§17） | 1 条（改回 10） | — | — |
| MP-13 | 2 条（§11）+ 长度 | — | — | — |
| MP-14 | 2 条（§19）+ 1 条文档 | — | — | — |
| MP-15 | 1 条（按所选路径） | 1 条 | — | — |
| MP-16 | 1 条（`loop-audit`） | 1 条（删句子 → 重新 FAIL） | — | — |
| MP-17 | 3 条 | — | — | — |
| MP-18 | 1 条 | — | — | — |
| MP-19 | 1 条 | — | — | — |

### 6.3 硬约束 10 的落地要求

MP-02、MP-06 改的是**厂商接入**（GitHub Actions + `gh` + token 回退）。按硬约束 10，这两项完成后必须在**一个真实测试仓库**上跑通对应事件，并把命令与输出写进 `STATE.md`。**未跑则标 NOT RUN，且不得在真实项目上启用 L2。**

### 6.4 回归保护

- **每次提交**：`.githooks/pre-commit` 跑整套 `test.mjs`。
- **CI**：`self-check.yml` 跑 `test.mjs` + `loop-audit` + CLI 冒烟 + 无自动合并检查 + 凭据字面量检查。
- **新增 CI 检查**（本 Spec 引入）：`install-skills --check`（MP-09）。
- **手动回归清单**（写入 `STATE.md`，每阶段出口跑一次）：
  1. `bash init.sh`
  2. `node scripts/test.mjs`（原生 Windows）
  3. `node scripts/test.mjs`（git bash）
  4. `node scripts/harness-stage.mjs .`
  5. `node scripts/loop-audit.mjs .`
  6. `node scripts/queue-read.mjs --json`
  7. `node scripts/budget-check.mjs --pattern issue-intake --json`
  8. `node scripts/install-skills.mjs --scope user --layout zcode --check`

---

## 7. 风险与回滚

### 7.1 实施风险

| 风险 | 触发条件 | 影响 | 缓解 |
|---|---|---|---|
| **MP-01 让现有流程变红** | 任何现存调用方传的证据文件缺 `### Checks not run` 或用 ASCII 箭头 | 闸门从"静默放行"变"escalate"，看起来像回归 | 这是**预期行为**（原本是缺陷）；但需在 `CHANGELOG`/`STATE.md` 说明"收紧后可能出现新的 escalate"；ASCII 箭头兼容已降低误伤 |
| **MP-02 需要 PR 评论标记约定** | verifier 未按 `<!-- loop-verifier-report -->` 发评论 | 所有 PR 落入 `awaiting-verification` | 标记写进 `loop-verifier/SKILL.md` 的输出格式；`test.mjs` 断言技能文件含该标记 |
| **MP-03 加 `.gitattributes` 引发大规模换行重写** | 加 `* text=auto eol=lf` 后执行 `git add --renormalize .` | 一次提交触碰全部 CRLF 文件（本仓库 32 个），diff 巨大且掩盖真实改动 | **推荐先只做代码侧修复（`readText` 归一），`.gitattributes` 作为独立提交且**不**执行 renormalize**；详见 §8 待决 2 |
| **MP-06 持久化方式选错** | 选了 `--commit` 模式但仓库分支保护不允许 bot 推送 | run-log 写入失败，预算仍恒 0 | 三种模式见 §8 待决 1；先做"能落盘就算成功"的最小版本，持久化方式可后换 |
| **MP-05/MP-06 在 runner 上写文件但被丢弃** | 沿用现有 5 个 workflow 的模式（`|| true` + artifact） | 看起来接线了，实际 `used` 仍为 0 | M2 出口条件明确要求"`used` 不再恒为 0"——**必须实测**，不接受"代码写了" |
| **MP-13 改描述导致漏触发** | 否定式边界写得太强 | 该触发时不触发 | 描述里保留原有关键词（issue/PR review/CI failed/PR merged/tag pushed）；§11 断言关键词仍在 |
| **断言计数三处不同步** | 新增断言后忘记改 `README.md`/`progress.md`/`docs/10` | 套件尾部自检红，阻塞提交 | §6.1 第 1 条已列为强制约定；把计数同步写进每个 MP 的 checklist |
| **平台分叉让断言强度下降** | MP-10 的 Windows 分支不再断言孙进程已死 | 失去对该行为的保护 | Linux 分支保持强断言；Windows 分支新增"降级必须可见"的断言（`treeKill: false` + NOT RUN 说明） |

### 7.2 回滚

- **粒度**：每个 MP 一个提交（或一个提交序列），互不耦合。依赖关系已在 §5.4 标明，回滚需按逆序（如回滚 MP-01 必须同时回滚 MP-02、MP-07）。
- **回滚方式**：`git revert <sha>`；本 Spec 不涉及数据库迁移或不可逆的外部状态变更。
- **回滚后必须**：重跑 `bash init.sh`；确认断言计数三处仍一致；确认 `test.mjs` 回到 `Failed: 0`。
- **不可回滚的部分**：真实仓库上已跑的 workflow（会产生 issue/comment）。测试仓库的副作用需手动清理，或**用专用测试仓库**（推荐）。
- **状态文件**：`STATE.md`、`loop-run-log.md`、`loop-ledger.json` 的改动是**追加式**，回滚代码不会回滚数据。若某次实验污染了 run-log，需手动删行并说明（`loop-run-log.md` 自称 append-only，删除应留注释）。

---

## 8. 待决问题

| # | 待决问题 | 选项 | 影响范围 | 建议 |
|---|---|---|---|---|
| **1** | **MP-06 的持久化方式** | **(a) 提交到 `loop-state` 分支**：`git push -f origin loop-state`，本地 `git pull` 即可读。简单、无需新服务；但需要 bot 有写权限，且分支会不断被 force-push 覆盖历史<br>**(b) PR 评论**：把 run 记录作为 PR 评论（沿用 verifier 报告的模式）。无需写权限；但只对 PR 相关循环适用（issue intake 没有 PR）<br>**(c) 由 agent 平台写**：workflow 只产出 artifact，由消费 artifact 的平台负责追加。最符合"workflow 不做 agent 逻辑"的既有设计；但要求用户自备平台 | MP-06、M2 出口条件 | **推荐 (a) 作为最小可用实现**（能立刻让 `used` 非 0），同时保留 (c) 作为长期方案。(b) 只作为 PR 类循环的补充。**注意 (a) 需要仓库允许 bot 推送分支** |
| **2** | **是否新增 `.gitattributes`** | **(a) 加 `* text=auto eol=lf` 但不 renormalize**：新检出为 LF，旧检出不变。风险低，但已存在的 CRLF 工作树不受影响（代码侧修复仍是主力）<br>**(b) 加并 `git add --renormalize .`**：一次提交触碰 32 个文件。彻底，但 diff 巨大、审查困难、且可能影响其他人的工作树<br>**(c) 不加**：只做代码侧修复（`readText` 归一 + 正则收尾） | MP-03、MP-10 | **推荐 (a)**。理由：代码侧修复已能覆盖"任何来源的 CRLF"（包括他人提交的 CRLF 文件），`.gitattributes` 只是防止未来产生 CRLF；(b) 的收益不抵 diff 风险 |
| **3** | **MP-07 的声明检查是否值得存在** | **(a) 实现**（`--verifier-id` / `--implementer-id` / `--worktree` 一致性检查）<br>**(b) 不实现**，把三条硬约束明确降级为 `[约定]` | MP-07、P1-05 | **倾向 (a)**：它能拦住"调用方把同一个 id 填两遍"这类真实疏忽，成本约 15 行；但**必须**在文档里写明它不是身份认证（已在 MP-07 的验收标准里强制）。若作者认为"声明式检查会给人虚假的安全感"，则选 (b)，并把 P1-05 从"问题"改为"设计选择" |
| **4** | **三条硬约束（每小时一改 / 验证者独立 / worktree 强制）是"约定"还是"待实现的机制"** | **(a) 待实现** → 需新增写入型脚本记录"上次修改时间"（当前没有任何东西记录时间戳）<br>**(b) 约定** → 文档加 `[约定]` 标签，不新增代码 | P1-05、MP-07 | **推荐 (b) + MP-07 的声明检查**。"每小时一改"要真实现需要一个跨运行的持久化时间源，而那正是 §8 待决 1 尚未解决的问题——**不要在待决 1 解决前叠加新的持久化需求** |
| **5** | **`self-check.yml` 是否加 Windows runner** | **(a) 加矩阵**（ubuntu + windows）<br>**(b) 只做 MP-10 的平台分叉**<br>**(c) 现状**（只 Linux） | P2-08、MP-10 | **推荐 (b)**。理由：本仓库的开发环境是 Windows，MP-10 的分叉能让本机与 CI 都 0 失败；加 Windows runner 成本更高（时长、缓存、MSYS 行为差异），且 CI 只跑 Linux 与本机只跑 Windows 的错位**在 MP-10 之后不再产生假红/假绿**（因为两边都覆盖了自己平台的真实行为）。(a) 可作为后续增强 |
| **6** | **MP-15 选接入还是删除** | **(a) 接入** `max sub-agent spawns/run` 与 `suggested_daily_cap`<br>**(b) 降级/删除** | MP-15、P2-05 | **倾向 (b)**：接入需要先解决"谁在派发子智能体"（P1-03：本包不含运行器），在运行器缺位时接入等于给空气设上限。删除或标 `unused:` 更诚实 |
| **7** | **MP-16 的 `toolScope` 计分项如何处理** | **(a) 让声明去满足它**<br>**(b) 移出计分，标 informational** | MP-16、P2-04 | **推荐 (b)**：本包确实不提供工具级隔离，让它持续 FAIL 等于把"设计边界"当成"缺陷"计分，会压低所有使用者的 readiness 分数 |
| **8** | **是否把 `hasEventWiring` 的 schedule 回退也一并收紧** | 当前 `LOOP.md` 声明 `schedule:`/`cron` 且含 `on:`/`事件驱动` 也算 wired（`via: 'declared'`） | MP-04 | **建议一并收紧**：`declared` 应要求该 schedule 有对应的 workflow 文件（而不是只有文档声明）。否则"在 LOOP.md 里写一句 cron"就能通过接线判据——与 P1-06 是同一形状的问题 |

---

## 落地状态（每次实施后更新）

> 沿用 `REVIEW-2026-10-14-consolidated-plan.md` §6.2 的约定：**列了条目却没人记录哪些真的做了，
> "已完成"就不可验证**。每个 MP 必须有状态，每个未做项必须写理由与核实方式。
> 核实方式给的是**可执行的检查**，不是"我说做了"。

### M1 状态表（2026-10-17 完成）

| MP | 状态 | 证据 |
|---|---|---|
| MP-01 证据闸门 + 清单塌缩 | ✅ 已做 | 6 组对抗输入逐条翻正：`APPROVE`+`FAIL` → escalate 且指名项；缺节 → escalate；ASCII `->` 与 U+2192 等价；证据的 NOT RUN 推导进 `checks_not_run`；多行清单无 `@` → exit 1。5 条变异断言红 |
| MP-02 合并闸门 verdict 来源 | ✅ 已做 | verdict 取自带标记 PR 评论；`--verdict none` 不再硬编码；证据路径在 `$RUNNER_TEMP`；`awaiting-verification` 为独立闸门名。3 条变异断言红 |
| MP-03 换行归一 + CRLF fixture | ✅ 已做（P2-01 部分撤销） | `readText` 归一；真实仓库 `queue-read` 0 → 7 条；CRLF fixture 已确认 fail-first（`expected 1, got 0`）。**P2-01 证伪，不修** |
| MP-04 接线判定收窄 | ✅ 已做 | 本仓库 `wired: true → false`；阶段 3 判据 1 同步转 FAIL；正例/负例/declared 回退三向断言。变异断言红 |
| MP-05 熔断器接线 + per-pattern + noop | ✅ 已做 | ci-sweeper 的 `run:` 真执行 `ledger-check --pattern`；`[f,f,noop,f,f]` 从 `ok/2` → `no-progress/5`；切片证明：4+4 混合 → 不切片 `no-progress`、切片 `ok`。变异断言红 |
| MP-06 … MP-19 | ⬜ **未做** | 见下方"有意未做" |

**M1 出口条件（spec §5）实测**：`test.mjs` 在 `hasGnu` true/false **两环境均 `Failed: 0`**（1018 条）；
`bash init.sh` 通过；`queue-read --json` 返回 **7** 条；`APPROVE`+`FAIL` 证据 **exit 2**；
多行清单无 `@` **exit 1**；`hasEventWiring('.')` **false**；ci-sweeper 真执行 `ledger-check`。

### 有意未做（附理由，可核对）

| 项 | 状态 | 为什么没做 | 怎么核实 |
|---|---|---|---|
| MP-06 `run-log-append.mjs` | 未做 | **被 spec §8 待决 1 阻塞**：runner 文件系统是临时的，写入不持久化到仓库；三种持久化方式（提交分支 / PR 评论 / 由 agent 平台写）各有取舍，需先决策。在决策前实现等于给空气记账——`used` 仍会是 0。 | `scripts/run-log-append.mjs` 不存在；`budget-check --pattern issue-intake` 仍 `used: 0` |
| MP-07 独立性声明一致性检查 | 未做（M2） | 依赖 MP-01 的 escalate 通道（已完成），但它属 M2 的可靠性批次。**注意**：spec §8 待决 3/4 尚未由作者确认"实现 vs 降级为约定"，实现前需先定。 | `gate-check --help` 无 `--verifier-id` / `--implementer-id` / `--worktree` |
| MP-08 占位符账本独立退出码 | 未做（M2） | 依赖 MP-05（已完成）。属 M2 批次；当前 `placeholder-ledger` 仍与熔断同为 exit 2。 | `ledger-check --ledger loop-ledger.json` 仍 exit 2 |
| MP-09 安装漂移检测 | 未做（M2） | M2 批次。当前 `--check` 默认仍走错目录（报 17 个无关技能为残留）。 | `install-skills.mjs --scope user --check` 仍报 `Checked 0` |
| MP-10 能力感知断言 | ✅ **已做（提前）** | 原列 M2，但它是 **M1 出口条件的一部分**——"两环境 0 失败"要求 `hasGnu=false` 分支不再假红。故随 M1 落地。 | `hasGnuTimeout` 已导出；两环境均 `Failed: 0`；断言按能力分叉（`process.platform` 在该测试块零命中） |
| MP-11 文档边界声明 | ✅ **已做（提前）** | 原列 M2 且要求"必须在任何 L2 使用之前完成"。本轮顺手做了（2 句声明 + 3 条断言），因为它是纯文档且零风险。 | `harness-loop/SKILL.md` 含"本包不含 agent 运行器"；`examples/github-actions/README.md` 含"只能完成" |
| MP-12 阈值与枚举收敛 | 未做（M2） | M2 批次，与 M1 无耦合。文件数阈值（`loop-constraints.md` 的 5 vs `LOOP.md` 的 10）仍是两份真相源，已在 `STATE.md` High Priority 登记。 | `LOOP.md:157` 仍写"超过 10 个文件"；`loop-budget/SKILL.md` 仍是 5 值枚举 |
| MP-13 触发描述加否定式边界 | 未做（M3） | M3 批次。且其验收标准本身标注为"基于文本的预测"——无法在目标 agent 中实测。 | `skills/harness-loop/SKILL.md` 的 `description` 首句仍非否定式 |
| MP-14 宿主路径单一真相源 | 未做（M2） | 依赖 MP-09。`LAYOUTS` 与 `SKILL_DIRS` 仍是两份列表，`.pi` 仍缺席。 | `grep -n LAYOUTS scripts/install-skills.mjs` 仍只有 agents/zcode/both |
| MP-15 无消费者的两处声明 | 未做（M3） | 需先定 spec §8 待决 6（接入 vs 降级）。接入要求先有 agent 运行器（P1-03），在运行器缺位时接入等于给空气设上限。 | `loop-budget.md` 第 4 列仍无消费者；`registry.yaml` 的 `suggested_daily_cap` 同 |
| MP-16 工具范围声明 | 未做（M3） | 需先定 spec §8 待决 7（让声明满足它 vs 移出计分）。本包确实不提供工具级隔离。 | `loop-audit .` 的 `toolScope` 仍 FAIL |
| MP-17 三条打磨项 | 未做（M3） | M3 批次，不影响任何判定或门禁。 | `loop-audit.mjs:380` 仍是 `Math.max(1, …)`；`test.mjs` 临时目录仍无 `try/finally` |
| MP-18 无效字段断言 | 未做（M3） | M3 批次。需二选一：让 `user_invocable` 接到行为，或从断言移除。 | `test.mjs` 仍断言 `user_invocable`，而宿主不读该字段 |
| MP-19 重复 id | 未做（M3） | M3 批次。`feature_list.json` 的 `stage-001` 仍出现两次（索引 1 与 7），导致阶段 1 判据 1 失败。 | `node -e` 读 `feature_list.json`：16 条、15 个唯一 id |
| **真机验证（硬约束 10）** | **NOT RUN** | MP-02 改的是**厂商接入**（GitHub Actions + `gh` + token 回退），而 8 个 workflow 从未在任何真实 GitHub 仓库上跑过。按 spec §6.3，**未跑则不得在真实项目上启用 L2**。 | 无真实仓库运行记录写入 `STATE.md` |
| Linux 真机验证 | **NOT RUN** | 本机两环境是 **PATH 顺序差异**（Git 的 `timeout` vs `C:\Windows\system32\timeout.exe`），不是真 Linux。`samePath` 的路径规范化与 `pwd -W` 回退分支未在 Linux 跑过。 | CI 是 `ubuntu-latest`，但本地从未复现过 Linux 行为 |
| `harness-stage --upgrade` 写入路径 | 未验证 | 审查范围外（只读边界），本轮未执行。 | 无 |

### 与审查报告的偏离记录

| 项 | 报告结论 | 实施时实测 | 处理 |
|---|---|---|---|
| **P2-01** `loop-audit` 占位符守卫在 CRLF 下失效 | 已确认（"死代码"） | ❌ **证伪**：`loop-audit.mjs:130` 对捕获值调了 `.trim()`，而 `.` 本就不吃 `\r`——守卫一直有效 | 报告已标注撤销；MP-03 不含该项 |
| P1-07 触发条件 | "裸路径 → proceed" | 第三轮已更正为"多行清单忘记 `@`" | 已按更正后实施 |

---

## 自检

### 1. 问题是否全覆盖

| 检查 | 结果 |
|---|---|
| 审查报告的 22 条问题是否都有对应 MP | ✅ 22/22（映射见 §3.1 的覆盖检查行） |
| 是否有 MP 没有对应问题（凭空新增） | ✅ 无。每个 MP 的"对应问题"字段都指向 P 编号 |
| 轮 2 新增的 P1-07 是否被覆盖 | ✅ MP-01 |
| 文档写作时补编号的 P2-10 是否被覆盖 | ✅ MP-12（与 P2-03 同类，合并处理） |
| 6 个难点（D1–D6）是否有专项方案 | ✅ D1→§4.1；D2+D3+D4→§4.2；D6→§4.3；D5→§4.4 |

### 2. 编号是否对应

| 检查 | 结果 |
|---|---|
| P → MP 方向：每个 P 都能找到 MP | ✅（§3.1 覆盖检查行） |
| MP → P 方向：每个 MP 都能找到 P | ✅（各 MP 的"对应问题"字段） |
| 是否有编号空洞或重复 | ✅ P0-01…P0-02、P1-01…P1-07、P2-01…P2-10、P3-01…P3-03 连续无空洞；MP-01…MP-19 连续无空洞 |
| 与审查报告编号是否一致 | ✅ 本文件所有 P 编号与 `REVIEW-2026-10-16-harness-loop-audit.md` 一致 |
| 对已交付材料的偏离是否标注 | ✅ 两处：P2-10 为文档写作时补编号（已在审查报告 §7.1 说明）；MP-12 合并覆盖 P2-03+P2-10（本节说明） |

### 3. 验收标准是否可检验

| 检查 | 结果 |
|---|---|
| 每个 MP 是否都有"可检验验收标准"字段 | ✅ 19/19 |
| 验收标准是否可机械判定（有明确命令/断言/正则） | ✅ 全部给出具体断言（`test.mjs` 段号或具体命令） |
| 是否包含"反向断言/变异测试"（防装饰品） | ⚠️ **部分**：MP-01/04/05/08/10/12/15/16 有明确反向断言；MP-02/03/06/07/09/11/13/14/17/18/19 主要靠正向断言 + 真实仓库验收。理由：反向断言要求"改一处即变红"的窄接口，对文档类与安装类修改不总是自然。**已如实标注，未夸大** |
| 是否有"未验证即标 NOT RUN"的要求 | ✅ §6.3（MP-02/MP-06 的真实仓库验证）；§4.4 的分层表 |
| 是否有无法检验的验收标准（需自评） | ✅ 仅 MP-13 的触发行为——已明确标注为"基于文本的预测"，不做已验证声明 |

### 4. 事实边界

- 本文件的所有问题描述与证据均来自审查过程中**实际执行过的命令**与**实际打开过的文件**；未新增任何未取证的断言。
- 存疑项在 §3 与 §8 中均标注为**存疑**或**待决**，未当作已确认结论。**第 3 轮更新**：P1-04 的 `noop` 已实测确认（升格）；P2-05 的间接消费者、P2-06 的触发预测、P1-05 的规则性质仍存疑。
- **第 3 轮修正**：P1-07 的触发条件（MP-01）与 P2-08 的分叉判据（MP-10）经独立复核后更正。两处均为**"结论对、证据/判据错"**——缺陷真实存在，但按原文实施会断言错对象。修正已落到 §3.2 / §3.6 / §3.11 与本文件头部的修正表。
- 未修改任何既有项目文件；本文件与配套审查报告是新增交付物。
