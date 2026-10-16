# 审查报告：harness-loop

> 只读审查。全程未修改、未删除、未格式化任何既有项目文件；`git status --porcelain` 在审查期间保持为空，HEAD 为 `0a5ce0c`。

---

## 1. 报告元信息

| 项 | 值 |
|---|---|
| 审查对象 | `harness-loop` —— 编排技能 `skills/harness-loop/SKILL.md`（10617 B / 268 行）及其所属技能包 `D:\harness_loop` |
| 对象版本 | HEAD `0a5ce0cc2d2f3e39bae28503cb79bb20a016c479`（`0a5ce0c`，提交日期 2026-10-15，"fix: 断掉验证路径的自递归，超时杀整棵树，判据只算一次"）；工作树干净 |
| 包规模 | 87 个受控文件；17 个 `skills/*/SKILL.md`；12 个 `scripts/*.mjs`（含 `scripts/lib/common.mjs`）；13 篇 `docs/`；13 个 `templates/`；`examples/github-actions/` 9 个文件（8 个 workflow + README）；`patterns/registry.yaml` |
| 审查会话时间窗 | 2026-10-15 23:51 → 2026-10-16 00:47（+08:00），跨午夜 |
| **第 1 轮审查日期** | **2026-10-16**（交付第 1–4 节） |
| **第 2 轮审查日期** | **2026-10-16**（交付第 5–8 节） |
| **第 3 轮复核日期** | **2026-10-16**（独立复核，交付第 9 节；修正 2 处、升格 1 处） |
| 报告生成日期 | 2026-10-16 |
| 运行方式 | 方式 A：可访问完整工作区 |
| 审查范围 | `SKILL.md` 与 frontmatter、全部 17 个技能、12 个脚本源码、`examples/github-actions/*.yml`、`.github/workflows/self-check.yml`、根 harness 文件（`AGENTS.md`/`LOOP.md`/`STATE.md`/`LESSONS.md`/`loop-constraints.md`/`loop-budget.md`/`loop-run-log.md`/`loop-ledger.json`/`feature_list.json`/`init.sh`）、`patterns/registry.yaml`、`docs/` 关键篇章、宿主（pi）技能加载语义、已安装技能副本 |
| 只读边界 | 不修改/删除/覆盖/格式化任何项目文件；不修改 Git 历史；不推送；不部署；未执行 `harness-stage --upgrade`、`install-skills --force` 等写操作 |
| 证据基线 | 20+ 次实际命令执行（含 6 组对抗性闸门探测、4 组 merge-gate 参数形状复现、CRLF/LF 对照实验、真实进程树泄漏现场）、17 个技能全文阅读、12 个脚本源码阅读、宿主加载器源码阅读 |

---

## 2. 审查概览

**目标**：判断 `harness-loop` 是否构建了一个**可执行、可验证、能从失败中恢复并在适当条件下终止**的自主开发闭环，而不是仅指示 Agent 重复执行任务；并严格区分四个层次——提示词声称的能力 / 有明确可执行流程 / 有实际机制支撑 / 已通过测试验证。

**方法**：
1. 先建立项目认知（读 `AGENTS.md` → `loop-constraints.md` → `STATE.md` → `LOOP.md` 的启动路径），再读源码。
2. 对每一项"机械判定"声称做**双向追踪**：谁读它（`grep` 全仓引用）、谁写它（是否有写入代码）、谁在真实路径上调用它（workflow 的 `run:` 是否真执行）。
3. 对闸门类机制构造**对抗输入**实跑，而不是只读代码判断"有检查"。
4. 复用仓库自带的**变异测试**手法（`scripts/test.mjs` §17）验证"配置是否装饰品"。
5. 交叉验证文档与代码：`LOOP.md` ↔ `event-router.mjs ROUTES`、`loop-budget.md` ↔ `budget-check.mjs`、`registry.yaml` ↔ 消费者。

**总体结论（5 句）**：
1. 最值得保留的是**"机制必须有代码入口、且测试要断言改配置会改行为"这条自我约束**（`loop-constraints.md` 硬约束 11），它在本仓库被真实执行过（`test.mjs` §17 用变异测试证明改 `registry.yaml` 的阈值会改脚本行为）；路由、`acting_on` 冲突锁、per-loop 预算上限、拒绝列表闸门、`@` 前缀警告这五项经实测确实工作。
2. 最大的结构性风险是**验证闸门的语义空洞**：`scripts/gate-check.mjs` 的证据检查只匹配文本形状，不判定状态值，也不检查证据与 `## Verdict` 是否矛盾——实测用一份写着 `Tests → FAIL` 的 "APPROVE 报告" 拿到了 `decision: proceed, exit_code: 0`。
3. 核心循环**结构完整、运行不完整**：七个环节（路由→锁→预算→派发→闸门→熔断→写状态）都有对应文件，但"派发执行者"在交付物中没有可执行入口（8 个 workflow 里没有一行 agent 调用），"写状态"没有任何写入代码，熔断器没有任何生产调用者，事件驱动运行记录为零。
4. **当前不适合直接用于真实项目**；适合作为"受控试验 + 只读报告模式（L1）"使用，L2 自动修复路径在修掉 P0-01/P0-02 之前不建议开启。
5. 信心**中等偏高**：结论基于实际命令执行与逐文件阅读；限制是全部验证只在本机 Windows/MSYS 完成，Linux 行为（GNU timeout 路径）与真实 GitHub 仓库行为未能验证，目标 agent 的触发行为是基于文本的预测。

**问题分布**：P0 × 2，P1 × 7，P2 × 10，P3 × 3，合计 22 条。

**第 3 轮复核结论（2026-10-16）**：逐条重跑关键探针后，**20 条原样成立，1 条表述错误（P1-07），1 条触发条件错误（P2-08），1 条从"存疑"升格为"已确认"（P1-04 的 `noop`）**。没有发现凭空捏造的结论。两处错误都**直接改变实施动作**——见 §7.4 与 §9.4，实施前必读。

---

## 3. 第 1 轮审查

**日期**：2026-10-16
**关注点**：Skill 规范与触发准确性；指令质量与可执行性；harness 与循环机制（任务定义/执行观察/验证/失败诊断/退出条件/状态恢复）；失败场景与安全边界。

**取证方式**：全部脚本逐份阅读；关键判定实际运行；对闸门构造对抗输入。

### 3.1 P0 级

#### P0-01 证据闸门只做形状匹配：接受自相矛盾、全部失败、缺节的证据

- **位置**：`scripts/gate-check.mjs:265-280`（规则 8b，`--phase gate` + `--verdict approve` 分支）
- **证据原文**：
  ```js
  const verdictLine = report.match(/^##\s*Verdict:\s*(APPROVE|REJECT|ESCALATE_HUMAN)/m);
  const hasCommandEvidence = /^\s*-\s*(Tests|Red check|Real-use validation|Lint|Scope check|Denylist check):\s*`[^`]+`\s*→\s*(PASS|FAIL|NOT RUN)/m.test(report);
  const missing = [];
  if (!verdictLine) missing.push('a "## Verdict: ..." line');
  if (!hasCommandEvidence) missing.push('at least one "- ...: `<cmd>` → PASS|FAIL|NOT RUN" line');
  ```
  判定只要求"存在一行形如 `- <检查名>: \`<cmd>\` → <状态>`"，**不解析状态值**，**不检查与 verdict 的一致性**，**不读 `### Checks not run` 节**。
- **问题与影响**：这条闸门是"独立验证"承诺的唯一机械执行点。实测 6 组（全部执行）：

  | 证据文件内容 | 期望 | 实际 |
  |---|---|---|
  | `## Verdict: APPROVE` + `- Tests: \`npm test\` → FAIL` + `- Red check: PASS` | 拒绝 | **`proceed`, exit 0** |
  | `## Verdict: APPROVE` + 全 `NOT RUN`/`FAIL` + `### Checks not run` | 拒绝 | **`proceed`, exit 0**，`checks_not_run: {}` |
  | `## Verdict: APPROVE` + 缺 `### Checks not run` 整节 | 拒绝 | **`proceed`, exit 0** |
  | 手写完整形状（`Tests: npm test → PASS`） | 无法判定 | **`proceed`, exit 0** |
  | 同上但用 ASCII `->` 替代 U+2192 `→` | 应等价 | **`escalate`, gate `verification-evidence`** |
  | `--not-run e2e,真机` | 应从证据推导 | **回显入参**，`checks_not_run: ["e2e","真机"]` |

  第三组尤其危险：**自相矛盾的报告比没有报告更容易通过**（无报告 → escalate；`APPROVE` + `FAIL` → proceed）。`loop-verifier/SKILL.md` 把 `### Checks not run` 定为必填（即使为空也写 `—`），闸门完全不读这条规则。
- **触发条件**：任何调用方（或任何 agent）写一个形状正确的 markdown 文件。
- **修改建议**：解析每项检查的状态并断言——(1) 至少一行；(2) 不存在 `FAIL`；(3) 存在的 `NOT RUN` 必须全部出现在 `### Checks not run` 里；(4) 该节必须存在；(5) 箭头同时接受 U+2192 与 `->`。`--not-run` 改为由证据推导并与声明交叉校验。
- **验收方法**：把上述 6 组做成 `test.mjs` §18 fixture，断言含 `FAIL` → exit 2 且 reason 指名该项；缺节 → exit 2；ASCII 箭头等价。
- **证据状态**：**已验证**（6 组实际运行）。

#### P0-02 合并闸门在生产路径上恒定 escalate，且证据取自实现者可写的文件

- **位置**：`examples/github-actions/merge-gate.yml:110-119`
- **证据原文**：
  ```yaml
  #   --evidence-file           → verdict 是断言，不是证据
  # "human decision required"——持续假升级会训练人忽略它。
  if [ -f verifier-report.md ]; then EVIDENCE="--evidence-file verifier-report.md"; fi
  ...
    --verdict none \
  ```
- **问题与影响**：两个独立缺陷叠加。
  - (a) 该 workflow 硬编码 `--verdict none`，而 `gate-check` 规则 9 是 `verdict === 'none' && phase === 'gate' → escalate`。实测用与 workflow 完全相同的参数形状调用 → `{"decision":"escalate","gate":"verification","reason":"no verifier verdict present at the gate phase","exit_code":2}`。**它从未放行过任何 PR**。文件 :112 的注释声称上一版"4 个参数"的问题已修，实际只是 `reason` 字符串从 `human decision required` 换成 `no verifier verdict present`，`decision` 未变——**持续假升级会训练人忽略它**，正是注释自己警告的失效模式。
  - (b) 证据文件 `verifier-report.md` 从**被检出的工作区**读取，实现者可以把它提交进 PR，闸门照收。结合 P0-01，实现者可自行提交一份"APPROVE + Tests → PASS"通过闸门。
  - 该 workflow 也是**唯一**被生产路径调用的 `gate-check` 调用点。
- **修改建议**：merge-gate 不应自行传 `--verdict`；verdict 与证据应由 `loop-verifier` 的产出驱动（PR 评论 / check run / 签名 artifact），而非检出目录内的文件。无 verifier 产出时应输出 `escalate` 但**标注为 `awaiting-verification` 而非 `verification-failed`**，让"没验"与"验失败"可区分。短期无法接线时，应把该 workflow 明确标注为"骨架，未接线"。
- **验收方法**：断言"无 verifier 产出时的 decision 不得与有 APPROVE 产出时相同"；断言"证据文件来源不是 `${{ github.workspace }}` 内的文件"。
- **证据状态**：**已验证**（参数形状实测 + 文件阅读）。

### 3.2 P1 级

#### P1-01 CRLF 检出下"有待办"被读成"无待办"

- **位置**：`scripts/queue-read.mjs:71`
- **证据原文**：`const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/);`
- **问题与影响**：JS 中 `.` 不匹配 `\r`，`$`（无 `m` 标志）只匹配串尾。本仓库 32 个受控文件是 `w/crlf`（`git ls-files --eol STATE.md` → `i/lf w/crlf`；`git config core.autocrlf` = `true`；**无 `.gitattributes`**）。实测：
  - `node scripts/queue-read.mjs --json` → `{"source":"none","items":[],"fell_back":false,"note":"既无 .loop/queue 也无 STATE.md 待办"}`，而 `STATE.md` 的 High Priority 区有 **6 条未勾选** `- [ ]`。
  - 直接调用 `readStateHighPriority('D:/harness_loop')` → `[]`；同内容改为 LF → 6 条。
  - 逐字复现：`'- [ ] 修 CI flake\r'.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/)` → `false`。
  - 区段切分本身没问题（`text.split(/^##\s*High Priority[^\n]*$/m)` 用了 `[^\n]*`），失败点纯粹在逐行复选框正则。

  `harness-loop` 第 0 步第 3 条用该脚本决定"无待办 → <5k token 退出，记 `outcome: no-op`"。在 Windows 检出上，**本地手动路径会带着真实待办直接空转退出，并写一条误导性 note**（声称"没有待办"，真相是"没读到"）——违反 SKILL.md 自己那句"队列为空与没读到必须可区分"。
- **修改建议**：`(.+)$` → `(.+?)\s*$`；更彻底的做法是在读文件处统一 `replace(/\r\n/g, '\n')`（见 P2-01）。另建议新增 `.gitattributes` 固定 `*.md text eol=lf`。
- **验收方法**：`test.mjs` §22 增加 CRLF fixture 断言仍读到同样条目数。**当前 `test.mjs` 全文 grep `\r\n` 零命中**，故该缺陷在 CI 上永不可见。
- **证据状态**：**已验证**（真实仓库 + 合成 fixture 双向复现）。

#### P1-02 "写状态"没有任何代码入口，连带预算百分比恒为 0

- **位置**：全仓库；`skills/harness-loop/SKILL.md:180`（第 8 步）
- **证据**：grep 全部 `scripts/*.mjs`，**没有任何脚本写入** `STATE.md`、`loop-run-log.md`、`feature_list.json`。只有读者：`budget-check.mjs:134`（kill switch）、`event-router.mjs:142/:271`（Active 表）、`queue-read.mjs:64`（High Priority）。`loop-run-log.md` 是 `budget-check` 计算 `used` 的**唯一**数据源，而 5 个 workflow 的文件注释自认："本 workflow 不写 loop-run-log.md，而那是 budget-check 的唯一数据源，所以 used 目前恒为 0"（`ci-sweeper.yml:45-46`、`issue-intake.yml:42-43`、`post-merge.yml:42`、`pr-review.yml:44`、`release-draft.yml:42`）。`daily-triage.yml:97` / `lesson-harvest.yml:148` 确实 `cat >> loop-run-log.md`，但随即 upload artifact——注释自认 runner 文件系统是临时的，追加不会持久化。
- **问题与影响**：`budget-check` 是第 0 步的退出判据，也是"80% report-only / 100% 立即退出"的唯一执行点。`used` 恒为 0 意味着**除 kill switch 外，整个预算机制在生产路径上空转**——`loop-budget.md` 里每循环 80k–500k 的上限从未被任何东西计数过。同理第 8 步的"清理 7 天前条目""填写 Post-Run Critique"没有任何强制。
- **修改建议**：把"追加一条 run 记录"做成脚本（接收 JSON、校验 outcome 枚举、追加到 `## Log`），并让 workflow 在评论/commit 模式下调用；或明确降级——在 `loop-budget.md` 与 `SKILL.md` 里标注"需要外部运行器提供计量；未接线时 used 恒为 0，仅 kill switch 有效"。
- **验收方法**：断言"若 `loop-budget.md` 声明了 per-loop 上限，则必须存在写 `loop-run-log.md` 的代码入口，且该入口被至少一个 workflow 调用"。
- **证据状态**：**已验证**（grep + workflow 逐行阅读 + 实跑 `budget-check` 得 `used: 0`）。

#### P1-03 事件脊不含任何 agent 执行入口，`.loop/queue` 无人消费

- **位置**：`examples/github-actions/*.yml`（8 个）、`.github/workflows/self-check.yml`
- **证据**：grep 全部 workflow 找 `claude|codex|cursor|anthropic|openai|pi |agent`，**只命中注释与 inert 的 echo 字符串**；每个 `uses:` 都是 `actions/checkout@v4` / `setup-node@v4` / `upload-artifact@v4`。`pr-review.yml:162` 是 `echo "FIX PHASE — implementer and verifier must be separate agent instances."` —— 一句打印。`examples/github-actions/README.md` 自述设计："**workflow 不执行 agent 逻辑。** 它只做两件事：1. 调用 `event-router.mjs` 确定阶段、技能、闸门 2. 把结果写进 `STATE.md`，或创建 work item 文件。真正的 agent 执行由 agent 平台消费这些产物完成。" `.loop/queue/` 在本仓库不存在，唯一读它的是 `queue-read.mjs` 自己。
- **问题与影响**：第 5 步"派发技能"是整条循环里唯一真正"做事"的环节，而它在交付物中**没有可执行路径**——workflow 把 work item 上传成 artifact（保留 7 天），期待某个轮询平台来取。交付的是**前半条**（感知 + 判定 + 记账）与**后半条**（模板 + 脚本），中间的"执行者被真正启动"依赖用户自备平台。这本身可作为设计选择，但 SKILL.md 与 LOOP.md 的措辞（"派发""执行者与验证者必须是不同的智能体实例"）读起来像已实现的能力。
- **修改建议**：在 `examples/github-actions/README.md` 与 `skills/harness-loop/SKILL.md` 顶部各加显式边界声明："本包不含 agent 运行器；第 5 步由外部平台消费 `.loop/queue/` 产物完成，未接线时循环止于 `fix-proposed`。" 若要真闭环，最小可行方案是加一个 `repository_dispatch` 触发步骤并附调用方契约。
- **验收方法**：文档断言（"README 必须声明无内置 agent 运行器"）；若接线，则须有一个 workflow 真的发起外部调用且被断言。
- **证据状态**：**已验证**（grep + 逐 workflow 阅读）。**未在真实仓库验证**执行端行为。

#### P1-04 熔断器零生产调用者；账本仍是出厂占位符；无 per-pattern 作用域

- **位置**：`examples/github-actions/ci-sweeper.yml:131-141`、`loop-ledger.json`、`scripts/ledger-check.mjs:150-190`
- **证据**：grep 全部 workflow，`ledger-check` 只出现在 `ci-sweeper.yml:138`——而那一行在 `cat <<'EOF'` heredoc **内部**：
  ```yaml
  - name: Classify guidance
    run: |
      cat <<'EOF'
      Before each retry:
        node scripts/ledger-check.mjs --ledger loop-ledger.json
        exit code 2 → STOP, escalate to human
      EOF
  ```
  这是**打印给人看的说明文本，不是执行的命令**。实跑 `node scripts/ledger-check.mjs --ledger loop-ledger.json` → `verdict: placeholder-ledger`，exit 2（账本仍是出厂示例：假 goal、两条假 attempt、假的 `TypeError at profile.ts:42`）。`checkLedger` 对 `ledger.attempts` **整个数组**计算 `iterations`/`consecutiveFailures`/`stagnationCount`，**没有 per-pattern 作用域**（对比 `budget-check` 有 `resolveCap` 的 per-pattern 解析）。
- **问题与影响**：硬约束 2"同一事项最多 3 次自动尝试，之后升级给人"与 `loop-constraints.md` 的"尝试上限由 `loop-ledger.json` + `ledger-check.mjs` 机械强制"——**在生产路径上没有执行点**。共享账本会让 A 循环的失败把 B 循环的熔断器顶爆。`harness-stage` 自己的 Stage 2 判据也 FAIL："熔断器就位（loop-guard 技能 + 账本有记录）"。
- **补充观察（第 2 轮，第 3 轮已实测确认）**：`checkLedger` 的 `consecutiveFailures` 只看**尾部连续段**，而 `noop` 是账本 schema 的合法 outcome——一次被锁跳过的 `noop` 会重置计数，使"5 次都没进展"被洗掉。**第 3 轮构造账本实测，确认成立**：

  | 账本 attempts | verdict | consecutiveFailures | exit |
  |---|---|---|---|
  | `[f,f,noop,f,f]` | **ok** | 2 / 5 | **0** |
  | `[f,f,f,f,f]` | **no-progress** | 5 / 5 | 2 |

  同样是"5 次里 5 次失败、中间没有任何一次成功"，只因插入一次 `noop`（被锁跳过的合法结局）就从"熔断"变成"继续跑"。**这一条从"存疑"升格为"已确认"**，不再是静态分析。
- **修改建议**：把 heredoc 里那行移出到真正的 `run:` 步骤；`checkLedger` 增加 `--pattern` 过滤（按 pattern 切片后再判停滞，并对"切片后为空"显式报告）；给 `loop-ledger.json` 一个"未使用"的显式状态而不是出厂示例。
- **验收方法**：断言"至少一个 workflow 的 `run:` 真的执行 `ledger-check.mjs`"（可复用 `test.mjs` §14 已有的 heredoc 感知扫描器）；断言"账本里混入另一 pattern 的失败不改变本 pattern 的 verdict"。
- **证据状态**：**已验证**（文件阅读 + 实跑）；noop 重置为**存疑**（静态分析）。

#### P1-05 三条硬约束无运行时实现：每小时一改、验证者独立实例、worktree 强制

- **位置**：`LOOP.md`（多循环协调）、`skills/loop-verifier/SKILL.md`（独立性前置条件）、`skills/minimal-fix/SKILL.md`（worktree 约定）
- **证据**：grep `per hour|每小时|3600000|60 * 60|hour` 在 `scripts/` 下**只命中一处注释**（`test.mjs:1182` 解释锁键约定），无任何时间窗代码。grep `verifier|independent|implementer` 在 `scripts/` 下只命中文档字符串与 `gate-check` 自己的提示语，**没有"验证者是不同实例"的运行检查**。`worktree.mjs` 只是工具（`create/discard/list`），没有任何东西强制执行者使用它；`gate-check` 不接收 worktree 路径，也不检查 diff 来自哪个分支。`loop-verifier/SKILL.md` 对"共享上下文"的处理是"**如果**你检测到与实现者共享上下文 → 立即 ESCALATE_HUMAN"——依赖模型自觉。
- **问题与影响**：这三条是项目自己列的硬约束（`AGENTS.md` 硬约束 1、`LOOP.md` 多循环协调），写法让读者容易当成机制。`STATE.md` 的 Watch List 也承认"`loop-verifier` 的'共享上下文则升级'依赖模型自觉"。对比之下 **`acting_on` 锁键是真机制**（我用临时 STATE.md 实测出 `conflict: lock-held, held_by: pr-99`），这个对比正好说明差距。
- **修改建议**：最少可行是让 `gate-check` 接收 `--worktree <path>`（要求 `loop/` 前缀的独立 worktree）与 `--verifier-id` / `--implementer-id`（要求不相等），否则 escalate。时间窗规则若要真做，需要一个写入型脚本记录上次修改时间（当前没有任何东西记录）。**若决定不做，应把这四条从"硬约束"降级为"约定"**，保持"约束"与"机制"的区分。
- **验收方法**：断言"`--verifier-id` 等于 `--implementer-id` 时 escalate"；或断言文档明确标注该规则为约定。
- **证据状态**：**已验证**（grep 无实现）。规则本身是否为设计意图，**待验证**。

#### P1-06 `hasEventWiring` 假阳性：本包自己的 CI 被判定为"事件接线"

- **位置**：`scripts/lib/common.mjs` `hasEventWiring()`
- **证据**：实测 `hasEventWiring(process.cwd())` 在 `D:/harness_loop` → `{"wired":true,"via":"workflow","detail":"1 个 workflow 调用了运行层脚本（self-check.yml）"}`。探针条件是 `/^on:/m` **且** `/node\s+scripts\/(event-router|gate-check|ledger-check|budget-check)\.mjs/`；`self-check.yml` 因为它的 CLI 冒烟测试（`event-router --list`、`gate-check` 探测等）同时满足两条。而 `STATE.md` 的 Watch List 写着"尚未跑过任何一轮真实事件"。
- **问题与影响**：`harness-loop` 第 0 步第 2 条说"未接线即退出，记 `no-wiring`"——这道边界因此**对本仓库（以及任何 CI 里冒烟测试这些脚本的仓库）永不触发**。更严重的是 `harness-stage.mjs` 的 Stage 3 判据 1 用同一个 helper，于是"阶段 3 事件脊已接线"这个 PASS 是假的，阶段推进信号被污染。
- **修改建议**：接线判定应要求 workflow 的触发事件与 `LOOP.md` 声明的事件脊**有交集**，或要求存在 `.loop/queue` 写入者/锁消费者（`test.mjs` §14 已有"落盘 work item 的 workflow 必须参与锁"的扫描器，可复用）。最小改动：收窄为"该 workflow 的 `run:` 调用了 `event-router.mjs` **且** 其 `on:` 不是纯 CI 事件（`push`/`pull_request`/`workflow_dispatch` 之外还有仓库事件类型）"。
- **验收方法**：把 `self-check.yml` 作为负例写进测试：断言 `hasEventWiring` 对只含冒烟测试的仓库返回 `wired: false`。
- **证据状态**：**已验证**（实跑 + 源码）。

### 3.3 P2 级

#### P2-01 `loop-audit` 的占位符守卫在 CRLF 下静默失效

- **位置**：`scripts/loop-audit.mjs:131` `const isPlaceholder = /^(never|—|-|none|n\/a|tbd|todo)$/i.test(value);`
- **证据**：`value` 来自 `stateText.match(/last\s*run\s*[:：]\s*(.+)/i)[1].trim()`，而 `.` 不匹配 `\r`，所以 CRLF 下 `value === "never\r"` → `isPlaceholder === false`。逐字验证：`'never\r'` 不匹配该正则，`'never'` 匹配。
- **问题与影响**：`loop-audit.mjs:120-128` 的注释明确写"一个从没跑过循环的仓库不该因为改了一天代码就拿到 activity 分"，这条守卫在 Windows 检出上是**死代码**。实际后果受限（`looksLikeTime` 与 `isSessionLabel` 随后也都失败，该分支被跳过而非误计分），所以是"守卫失效"而非"误发绿灯"。
- **同类排查（第 2 轮完成）**：逐个验证 8 个 EOL 敏感点——**1 个破坏行为**（`queue-read.mjs:71`，即 P1-01）、**1 个禁用守卫**（本条）、**6 个安全**（`loop-audit.mjs:185` 与 `harness-stage.mjs:552` 走 `.split('|').map(trim)`；`loop-audit.mjs:177` 的 Active 区段切分；`loop-audit.mjs:153` 与 `harness-stage.mjs:528` 的 `## Log` 切分；`budget-check.mjs:135/:137` 用 `\s*$` 而 `\s` 含 `\r`；`common.mjs:415/:494/:529` 无 `$` 锚定；`event-router.mjs readLocks` 端到端 CRLF 实测得到同样的 `lock-held`；`harness-stage.mjs lessonsHasEntries` 实测一致）。全仓**无** `normalizeEol` 或 `\r\n` 处理。
- **修改建议**：与 P1-01 一并修——在读文件处统一 `replace(/\r\n/g, '\n')`，比逐个正则加 `\r?` 更彻底（漏一处就是一个静默缺陷）。
- **验收方法**：`test.mjs` §16 用 CRLF 版 STATE.md（`Last run: never`）断言 `activity.present === false`。
- **证据状态**：**已验证**（正则逐字验证 + 8 个敏感点逐一排查）。

#### P2-02 技能安装漂移检测默认走错目录，且真实漂移已发生

- **位置**：`scripts/install-skills.mjs:206-269`（`checkInstalled`）、`C:\Users\tom\.zcode\skills\.loop-harness-install.json`
- **证据（全部实测）**：
  - `node scripts/install-skills.mjs --scope user --check`（默认 layout `agents`）→ `Checked 0 installed skill(s)`，并把 `C:/Users/tom/.agents/skills/` 下 **16 个无关第三方技能**（brandkit、context7-mcp、design-taste-frontend、harness-creator…）逐个报成"源码里已不存在（清单残留）"，exit 1。
  - `--layout zcode --scope user --check` → `Checked 16 installed skill(s)`，16 个**全部**"已安装副本与源码不同"，另报 `harness-bootstrap`/`harness-strengthen` 为残留，exit 1。
  - 清单文件里 `layout: ""` 与 `dotDir: ""` **都是空**（旧写入者未记录），所以 `--check` 无法判断清单属于哪个 dot-dir。
  - 实际漂移：源 `skills/harness-loop/SKILL.md` mtime `2026-10-15 00:10:47`、10617 B；已安装副本 `2026-10-13 22:31:43`、6649 B。逐字节比较：**16 个可比技能全部不同**，`harness-loop-init` **两处都没装**。
  - 部署版 `harness-loop` 缺 `stage: runtime`/`user_invocable`、用的是**短描述**（无 `--target` 与接线那两句）、第 0 步只有 3 条（**无接线检查**）、第 2 步命令**没有 `--target`**、第 6 步表格缺 `@` 前缀 / `--reviewed-sha` / `--red-check` / `--evidence-file` 四行。
  - `--check` **未接入** `self-check.yml`、`init.sh` 或 `test.mjs`；`README.md:113-123` 与 `docs/10-how-to-use.md:37-47` 从未文档化 `--check`。
- **问题与影响**：`install-skills.mjs` 自己的注释写着它存在的理由——"主机加载的是已安装副本，而所有测试都在源码仓库里跑"，观测到主机版落后一个版本后"文档化能力"与"agent 实际行为"静默分叉，并留下"`docs/10` 自己写着'改完技能要重跑安装脚本推送更新'——但那是纪律，不是机制"。现在这个"机制"存在却默认查错目录、无法定位清单、且没人跑它——**问题仍在原地，只是多了一个会误报的工具**。
- **修改建议**：清单写入时记录 `layout`/`dotDir`（容忍旧清单：缺字段时按 `packRoot` 反查）；`--check` 只对清单里登记过的技能做漂移比较（不要把目录里所有同名文件都当自己的）；把 `--check` 接进 `init.sh` 与 `self-check.yml`。
- **验收方法**：`test.mjs` §19 增加断言"安装到 layout A 后，`--check` 用 layout B 调用必须报 layout 不匹配，而不是报 16 个无关技能漂移"。
- **证据状态**：**已验证**（实跑 + 逐文件哈希/大小比较 + 清单内容阅读）。

#### P2-03 文件数阈值有两份互相矛盾的真相源

- **位置**：`loop-constraints.md:51`（"单个修复触及超过 5 个文件，或需要设计变更 → 停止并升级"）、`skills/minimal-fix/SKILL.md:26`（"若修复需要 > 5 个文件，或需要设计变更 → 停止并升级"）**vs** `LOOP.md:157`（"单次改动超过 10 个文件 → 人工审批"）
- **证据**：`scripts/gate-check.mjs:20` `DEFAULTS = { maxFilesPerFix: 5, maxFilesCleanup: 10, ... }`——代码里是"修复 5 / 清理 10"，`LOOP.md` 写的是无条件的 10。`STATE.md` High Priority 自己列了这一条。
- **问题与影响**：`gate-check` 的 scope 闸门（实测：20 文件 → `escalate, gate: scope, "diff touches 20 files, over the limit of 5"`）按 5 执行；按 `LOOP.md` 的 10 准备改动会在闸门处被拦下。`LOOP.md` 自称"路由与调度的单一真相源"，此处不一致。
- **修改建议**：`LOOP.md:157` 改为"单次改动超过 `gate-check` 的 `maxFilesPerFix`（默认 5，清理类 10）→ 人工审批"，或删除该行并指向 `loop-constraints.md`。
- **验收方法**：`test.mjs` §17 已有"文档 ↔ 代码"一致性检查先例，加一条"`LOOP.md` 中出现的文件数阈值必须与 `gate-check` DEFAULTS 一致"。
- **证据状态**：**已验证**（三处原文 + 实跑 scope 闸门）。

#### P2-04 没有任何技能声明工具范围；"不要执行危险命令"只是提示词

- **位置**：`skills/*/SKILL.md`（17 个）
- **证据**：grep `allowed-tools` 全部技能 → **0 命中**。`scripts/loop-audit.mjs:290` 的 `toolScope` 检查（正则 `least[- ]privilege|tool scope|scoped tools?|allow-?list|read-only tools?|permission scope`）在本仓库 **FAIL**，是 23 项里仅有的两个 FAIL 之一。`scripts/lib/common.mjs` 的 `SKILL_DIRS` 里没有任何工具范围概念。
- **问题与影响**：`loop-constraints.md` 的 Data 节、`LOOP.md` 的"连接器（MCP）"节都写了最小权限、独立 bot 账号、绝不粘贴 API key——这些都是**行为约束**。它们不能阻止一个被提示注入的 agent 读取 `.env` 并写进 `STATE.md`（而 `STATE.md` 是被提交的）。拒绝列表路径的自动**编辑**有 `gate-check` 拦（实测 `auth/login.ts` → escalate），但**读**没有拦，写非代码文件也没有拦。
- **修改建议**：区分"能做的"与"说不要做的"。最小改动是让 `harness-loop` 与 `minimal-fix` 在派发执行者时显式声明允许的工具集（若目标平台支持），并把 `loop-audit` 的 `toolScope` 判据指向该声明；否则应在文档里明确"本项目不含工具级权限隔离，拒绝列表只覆盖自动编辑路径"。
- **验收方法**：断言"若 `loop-audit` 给 `toolScope` 打分，则必须存在被扫描到的工具范围声明"（当前它打分而没人声明，等于该项永远 FAIL）。
- **证据状态**：**已验证**（grep + 实跑 `loop-audit`）。

#### P2-05 两条声明无任何消费者

- **位置**：`loop-budget.md`（第 4 列"最大子智能体/轮"）、`patterns/registry.yaml`（`suggested_daily_cap`）
- **证据**：grep `maxSubAgents|spawns|subAgent|sub_agent` 在 `scripts/` 下只命中 `child_process` 的 import 与注释。`loop-budget/SKILL.md` 说"绝不超过 `loop-budget.md` 的 `max sub-agent spawns/run`"——但没有任何代码读这一列（`parseBudgetCaps` 只取第 3 列 token 上限）。`suggested_daily_cap` 同样无直接消费者（`signal-gatekeeper` 里声明了 30000）。
- **问题与影响**：这正是硬约束 11 要防的"装饰品配置"，只不过没被测试断言覆盖。`budget-check.mjs:35` 的注释自己写着"按名取行，不是取全表最大值——后者会让 per-loop 上限变成装饰品"，说明作者清楚这个失效模式；第 4 列恰恰落在这个模式里。
- **修改建议**：要么让 `budget-check` 一并解析并在输出里反映 spawn 上限，要么把该列从表格移到说明文字并注明"未接线"。`suggested_daily_cap` 同理：接入或删除。
- **验收方法**：沿用 §17 的变异测试手法——把 `max sub-agent spawns/run` 从 3 改成 1，断言某个脚本输出会变；不变则删掉该列。
- **证据状态**：**已验证**（grep + 源码）。`suggested_daily_cap` 是否存在**间接**消费者（例如 agent 读 `registry.yaml` 决定调度）**存疑**——无法在只读审查中排除。

#### P2-06 触发准确性：描述与实际能力有落差

- **位置**：`skills/harness-loop/SKILL.md:2-13`（`description`，821 字符，未超宿主 1024 上限）
- **判定（基于文本的预测，未在目标 agent 中实测）**：

  | # | 用户请求 | 应触发？ | 理由 |
  |---|---|---|---|
  | 1 | "PR #123 的 review 要求改动了，按循环流程处理" | ✅ | 命中 "PR review requested changes" |
  | 2 | "CI 在 main 上挂了，走一遍修复循环" | ✅ | 命中 "CI failed" |
  | 3 | "现在该做什么？" | ✅ | 命中 "decide what should happen next" |
  | 4 | "帮我写个 harness-loop 技能" | ❌ | 是**创建**技能，不是**运行**循环；但技能名字面命中，误触发风险高 |
  | 5 | "解释一下事件脊是怎么路由的" | ❌ | 是提问；但 "route an incoming repository event" 字面命中 |
  | 6 | "跑一下 loop-audit 看看这个仓库到哪一级了" | ❌ | 是审计，不是事件驱动循环；但 "top-level entry" 措辞宽泛 |
  | 7 | "把 STATE.md 里的待办清一下" | ⚠️ | 歧义：手动整理文件（不该触发）vs 跑循环消化队列（该触发） |
  | 8 | "我本地手动跑一轮" | ⚠️ | 描述说 "Can be invoked by hand"，但同句要求 `--event`/`--target`；缺参数会卡在第 2 步 |

- **问题与影响**：三个负面词（技能名、"top-level entry"、"route … event"）会让解释类与创建类请求命中；真正的边界条件（必须有 `--event` 和 `--target`、必须已接线）写在描述中段，长描述里靠后的约束容易被忽略。更实质的是 P1-06：`no-wiring` 这道"该不该跑"的自检在本仓库是假阳性，即便触发正确，第 0 步也不会把它挡回去。
- **修改建议**：描述首句改为否定式边界开头，例如 "Run one issue/PR event through the loop (route → gate → state). Do NOT use to create or edit harness skills, or to explain the design."；把 `--event`/`--target` 的必需性提到描述第二句。
- **验收方法**：无法在目标 agent 中实测时，至少断言描述首句包含否定式边界（当前 §11 只断言 `事件接线`/`no-wiring`/`hasEventWiring` 等关键词存在）。
- **证据状态**：**静态判断**（描述文本 + 宿主只读 `name`/`description` 的加载语义已验证）；**触发行为本身待验证**。

#### P2-07 宿主发现路径与安装路径三方不一致，`.pi` 完全缺席

- **位置**：`scripts/lib/common.mjs` `SKILL_DIRS`、`scripts/install-skills.mjs` `LAYOUTS`、`README.md:105-109`
- **证据**：`SKILL_DIRS = ['.zcode/skills','.agents/skills','.grok/skills','.claude/skills','.codex/skills','skills']`；`LAYOUTS = {agents:['.agents'], zcode:['.zcode'], both:[...]}`，`DEFAULT_LAYOUT='agents'`。而本机实际加载技能的宿主（pi）从 `~/.agents/skills` 与 `<cwd>/.pi/skills` 读取——`.pi/skills` **既不在 `SKILL_DIRS` 也不在 `LAYOUTS`**。本机 `~/.agents/skills` 里是 16 个无关技能、**零个** loop-harness 技能；18 个 loop-harness 技能全在 `~/.zcode/skills`（26 小时前的旧版）。`D:\harness_loop` 下既无 `.pi/` 也无 `.agents/`。`README.md:105-106` 只文档化 `.agents/skills/`（ZCode 读）与 `.zcode/skills/`。
- **问题与影响**：`install-skills.mjs` 的注释把这类问题称为"文档化能力与 agent 实际行为静默分叉"，并引用了历史事故（`SKILL_DIRS` 只扫 `.claude/.codex/.grok`，装成功也报 `0 found`，L2 永远不可达，目标仓库审计 7/100 → 43/100）。现在同一形状的问题换了个宿主再次出现。
- **修改建议**：把 `LAYOUTS`/`SKILL_DIRS` 抽成单一列表（新增布局只改一处），补 `.pi`；`README` 与 `docs/12-stage-commands.md:25`（"把技能装到 ZCode 能发现的位置"）改成中性表述"装到你的 agent 能发现的位置（见 `--layout`）"。
- **验收方法**：`test.mjs` §19 增加断言"`LAYOUTS` 与 `SKILL_DIRS` 的 dot-dir 集合一致"（`docs/10` 里"安装路径与审计扫描路径必须来自同一个真相源"这条教训已写进 `LESSONS.md`，但**没有变成断言**）。
- **证据状态**：**已验证**（本机三个目录实际内容 + 源码 + 文档）。

#### P2-08 CI 只跑 Linux，本机发现的孤儿进程缺陷永远进不了 CI；无 CRLF fixture

- **位置**：`.github/workflows/self-check.yml`（`runs-on: ubuntu-latest`）、`scripts/test.mjs`
- **证据**：本机 `node scripts/test.mjs` → `Passed: 978  Failed: 1`，唯一失败是 `scripts/test.mjs:2584` 的 `超时后孙进程已被回收（整棵树被杀，不留孤儿） — pid 1042 仍存活`；同一套件在 git bash 下 → `Passed: 979  Failed: 0`。根因是 `scripts/lib/common.mjs:598` 的 `hasGnuTimeout()`：Windows 自带的 `timeout.exe` 拒绝 `--version`（stderr 出现 `ERROR: Invalid value for timeout (/T) specified. Valid range is -1 to 99999.`），于是退化到 Node 的 `execFileSync` 超时（`common.mjs:661-671`），返回 `treeKill: false`。**两次运行各泄漏了一棵进程树**（`bash.exe` 跑临时 `init.sh` + `sleep 611`），需手动 `Stop-Process`。CI 是 Linux-only，所以这条断言在 CI 上恒绿。grep `test.mjs` 全文找 `\r\n` → **零命中**（P1-01/P2-01 在 CI 上也不可见）。

> **第 3 轮修正（2026-10-16）**：原表述为"原生 Windows → 978/1"，这**不成立**。复核时在原生 `powershell.exe` 下直接跑得到 **979/0**——因为 Git 的 `/usr/bin` 在 PATH 上，解析到的是 GNU coreutils 的 `timeout`，`hasGnuTimeout()` 为真。只有把 `C:\Windows\system32` 排到 Git 之前，才复现 978/1（并且确认降级路径 `treeKill: false` 确实泄漏孙进程，`sleep.exe` 存活）。
>
> 准确的触发条件是：**原生 Windows 且 Git 的 binutils 不在 PATH 前部**，不是"原生 Windows"本身。这直接决定 MP-10 的分叉判据——必须按 `hasGnuTimeout()` 的实际取值分叉，**不能按 `process.platform`**，否则会写出一个在开发机上恒绿的假断言。
- **问题与影响**：本仓库的开发环境就是 Windows/MSYS（`STATE.md` 承认"本轮修复只在本机验证（Windows/MSYS）"），而 CI 与开发环境不一致，导致"本机红、CI 绿"的分叉——开发者会在本机看到假失败（或忽略它），而平台特有的退化路径没有任何自动化覆盖。
- **修改建议**：把 tree-kill 断言改为**平台感知**：`hasGnuTimeout()` 为 false 时断言"返回 `treeKill: false` 且 `harness-stage` 的 NOT RUN 说明里带'本平台无 GNU timeout'"（`harness-stage.mjs:407` 已实现该提示），而不是断言孙进程已死。这样 Linux 上仍锁住真行为，Windows 上锁住"降级必须可见"。另加 `.gitattributes` 并补 CRLF fixture。
- **验收方法**：同一套件在 Windows 与 Linux 都必须 0 失败，且 Windows 上仍断言降级可见。
- **证据状态**：**已验证**（两种 shell 实跑 + 泄漏进程现场 + 根因源码）。

#### P2-09 出厂占位符让"未接线"伪装成"熔断触发"

- **位置**：`loop-ledger.json`、`LESSONS.md`
- **证据**：`loop-ledger.json` 是出厂示例（假 goal、假 attempt、假时间戳），`ledger-check` 对它返回 `placeholder-ledger`/exit 2——所以 `init.sh` 必须专门断言"这个调用**必须不** exit 0"（否则它会跟"脚本坏了"混淆）。`LESSONS.md` 的 `## Promoted to hard rules` 与 `## Nightly review log` 都是单行占位符；`harness-stage` Stage 3 因此 FAIL"有教训已转正为硬规则"。3 条 lesson 全是 `Seen 1×`——**棘轮一次都没转过**，没有任何 lesson 到过 `Seen 2×`，夜审日志一次都没写过。
- **问题与影响**：`placeholder-ledger` 与"熔断器真的触发了"在**退出码上都是 2**。任何把 `ledger-check` 接进流程的人会得到持续 exit 2，无法区分"未初始化"与"该停了"。（`harness-stage` 与 `init.sh` 知道这个区别并绕开了它，但那是因为作者记得，不是机制。）同理，占位符 lesson 让"棘轮没转过"和"没有教训"看起来一样。
- **修改建议**：给未使用状态一个独立退出码或独立 verdict（如 `uninitialized`），并在 `harness-stage` 里把"账本未初始化"与"熔断触发"分开计分。
- **验收方法**：断言 `ledger-check` 对占位账本返回的 verdict 不等于任何熔断 verdict，且退出码与熔断退出码不同。
- **证据状态**：**已验证**（实跑 + 文件阅读）。

#### P2-10 outcome 枚举有两份不一致的真相源（轮 1 取证，本次补编号）

- **位置**：`skills/loop-budget/SKILL.md`（第 6 步）vs `loop-run-log.md`（枚举声明）vs `scripts/test.mjs` §12（校验器）
- **证据**：`loop-budget/SKILL.md` 要求 end step 追加的 JSON 其 `outcome` 取值域是 `no-op | report-only | fix-proposed | verified | escalated`（**5 个**）；`loop-run-log.md` 声明 `no-op | report-only | fix-proposed | verified | escalated | no-wiring | manual`（**7 个**）；`test.mjs` §12 按 7 个值校验。而 `harness-loop/SKILL.md` 的停止条件表把 `no-wiring` 列为**合法结局**。
- **问题与影响**：按 `loop-budget/SKILL.md` 字面执行的 agent 遇到"未接线"结局时**没有合法取值可写**——只能选一个语义错误的（例如 `escalated`），从而污染指标。这是与 P2-03 同类的"两份真相源"问题，但后果落在数据质量上。
- **修改建议**：`loop-budget/SKILL.md` 的枚举改为引用 `loop-run-log.md` 的 7 值枚举（或在两处都注明"以 `loop-run-log.md` 为准"）。
- **验收方法**：断言"所有技能文件里出现的 outcome 枚举集合都等于 `test.mjs` §12 的校验集合"（可复用现有的"技能关键规则子串"扫描手法）。
- **证据状态**：**已验证**（三处原文比对）。

### 3.4 P3 级

#### P3-01 三条已登记的打磨项（无新增风险，仅确认仍存在）

`STATE.md` Watch List 已登记，逐条确认仍然存在：`loop-audit.mjs:316` 的 `Math.max(1, …)` 让 0 项被报成 1/5；`loop-audit.mjs:216` 单技能记满双技能权重；`loop-audit.mjs` 的 `hasVerifier`/triage 检测仍是裸子串匹配；`test.mjs` 临时目录清理缺 `try/finally`（本次运行留下了 `lh-*` 目录）。
**证据状态**：**已验证**。

#### P3-02 `user_invocable` / `stage` / `license` 在宿主上不生效

- **证据**：宿主（pi）加载技能时只读 frontmatter 的 `name` 与 `description`（`description` 必须非空），其余字段被忽略（源码 `dist/core/skills.js`：`MAX_NAME_LENGTH = 64`、`MAX_DESCRIPTION_LENGTH = 1024`、`validateName` 要求 `/^[a-z0-9-]+$/`）。而 `test.mjs:2166` 断言 `harness-loop` 的 `stage` 是 `runtime`、`:2356` 断言 `docs/10` 推荐手动调用时技能必须 `user_invocable: true`——这两条断言锁的是一个**不被读取**的字段。
- **问题与影响**：无害，但"断言配置文件里写着某个值"正是硬约束 11 明确禁止的断言形式。`stage` 在 `harness-stage.mjs` 里确实被读（阶段判据），所以它对本包内部有意义；`user_invocable` 与 `license` 无任何消费者。
- **修改建议**：`user_invocable` 要么接到某处（例如 `install-skills` 据此决定是否装进可调用位置），要么从测试断言里去掉并注明"仅供目标平台使用"。
- **验收方法**：断言要么指向行为，要么不存在。
- **证据状态**：**已验证**（宿主源码 + grep）。

#### P3-03 `feature_list.json` 有重复 id

`stage-001` 出现两次（索引 1 与 7），`STATE.md` Watch List 已登记未修。`harness-stage` 的 Stage 1 判据 1 因此 FAIL（"1/16 条 feature 的完成标准不可判定"）。
**证据状态**：**已验证**。

---

## 4. 第 2 轮审查

**日期**：2026-10-16
**关注点**：把第 1 轮的静态结论转成**可执行的失效场景与测试用例**（7 个场景，含 2 个对抗用例）；给出 P0/P1 的可直接使用补丁草案；排定修复路线图；给出最终结论与使用建议。

### 4.1 七个失效场景的实测结果

| 场景 | 判定 | 关键缺口 |
|---|---|---|
| 1 正常完成 | ⚠️ 分步可跑通，端到端缺执行端 | P1-03、P1-02 |
| 2 持续失败 | ✅ 熔断逻辑正确，❌ 无生产调用者 | P1-04 |
| 3 假成功（对抗） | ❌ **闸门被绕过** | P0-01 |
| 4 无进展循环 | ✅ 主路径正确，⚠️ `noop` 会洗掉计数 | P1-04 补充（存疑） |
| 5 上下文中断 | ❌ 四处状态无写入代码 | P1-02 |
| 6 安全边界（对抗） | ⚠️ 拒绝列表对单路径有效，但**多行清单忘记 `@` 时静默失效**（第 3 轮修正）；读侧无隔离 | P1-07、P2-04 |
| 7 验证不可用/不确定 | ✅ 红检与超时处理正确；❌ 证据里的 `NOT RUN` 不妨碍放行 | P0-01、P2-08 |

**场景 6 的关键实测（新增 P1-07）**：

| 探测 | 结果 |
|---|---|
| `@` 前缀 + `auth/login.ts` | ✅ `escalate`, `gate: "denylist"`, `pattern: "auth/**"` |
| **裸单路径** `auth/login.ts`（无 `@`） | ✅ `escalate`, `gate: "denylist"` —— **第 3 轮修正：此处原写"静默失效"，复现不出** |
| **忘记 `@` 的多行清单** `--diff-files big.txt`（20 条路径） | ❌ **`proceed`, `files_changed: 1`** —— 拒绝列表与范围闸门**同时**静默失效 |
| 同上但加 `@` | ✅ `escalate`, `gate: "scope"`, `"over the limit of 5"` |
| 20 文件 + `@` | ✅ `escalate`, `gate: "scope"`, `"over the limit of 5"` |
| 12 条拒绝列表逐条匹配 | ✅ 全部命中（含大小写变体 `src/Auth/Login.ts`） |
| 不误伤 `docs/auth-guide.md` / `author.ts` / `terraform/main.tf` | ✅ 全部放行 |
| workflow 中 `${{ github.event.* }}` 插值进 `run:` | ✅ 零命中（用 `env:` 传递 + `tr -c 'A-Za-z0-9._-' '-'` 消毒 + `jq -Rn --arg` 编码） |
| `gh pr merge` / `git push origin main` | ✅ 零命中 |

`gate-check.mjs:403` 的设计注释解释了为什么不做猜测（"同一条命令字符串不该因为文件系统状态改变含义"），理由正当；但结果是**忘记一个 `@` 就等于两个闸门同时不存在**。SKILL.md 第 6 步表格已经警告了这个坑，却没有代码阻止它。

> **第 3 轮修正（2026-10-16）**：原表述为"裸路径 `auth/login.ts` → `proceed`"。独立复核逐条重跑后**复现不出**——该字符串在四种参数排列下（含文件真实存在于磁盘）全部返回 `escalate / denylist`。真正可复现的触发条件是**对多行清单文件忘记 `@`**：`readText` 不参与，`split(',')` 把它当单一路径，于是 N 个文件塌缩成 1 个，`files_changed: 1`。危害相同（拒绝列表 + 范围闸门同时失效），但**触发条件与修法描述必须按此更正**——按原表述写 fixture 会断言错对象。

**场景 7 的补充实测**：证据文件里写 `- Real-use validation: \`staging api\` → NOT RUN` → **`proceed`, exit 0**；`--not-run` 是回显入参而非从证据推导（两项均归入 P0-01）。

### 4.2 对第 1 轮的复核与修正

- **20 条问题全部维持**，无撤销。
- **新增 1 条**：P1-07（清单塌缩使拒绝列表静默失效）——第 1 轮曾作为"设计取舍"记录，第 2 轮升格为独立问题。**第 3 轮更正了它的触发条件**（原写"裸路径"，实为"多行清单忘记 `@`"），详见 §7.4。
- **补充 2 处**：P1-04 的 `noop` 重置计数（存疑）；P0-01 的 `Real-use validation → NOT RUN` 不妨碍放行、`--not-run` 为回显。
- **改判 1 处**（见第 7 节）。
- **补编号 1 条**：P2-10（outcome 枚举不一致）——第 1 轮已取证（三处原文比对）但当时未编号，本次文档写作时补上，不影响任何既有结论。

---

## 5. 问题汇总表

严重度映射：P0 与 P1 → **高**；P2 → **中**；P3 → **低**。`P` 编号承载更细的层级。

| 编号 | 问题描述 | 位置 / 证据 | 严重度 | 发现轮次 | 当前状态 |
|---|---|---|---|---|---|
| P0-01 | 证据闸门只做形状匹配，接受 `Tests → FAIL` / 全 `NOT RUN` / 缺 `### Checks not run` 的证据 | `scripts/gate-check.mjs:265-280`；6 组对抗探测 | 高 | 1（轮 2 补充） | 已确认 |
| P0-02 | merge-gate 硬编码 `--verdict none` → 恒定 escalate；证据取自实现者可写的检出目录 | `examples/github-actions/merge-gate.yml:110-119`；4 组参数形状复现 | 高 | 1（轮 2 补充） | 已确认 |
| P1-01 | CRLF 检出下 `queue-read` 把 6 条待办读成空，并写误导性 note | `scripts/queue-read.mjs:71`；真实仓库 + LF/CRLF 对照 | 高 | 1 | 已确认 |
| P1-02 | 无任何脚本写入 `STATE.md`/`loop-run-log.md`/`feature_list.json`；预算 `used` 恒为 0 | 全仓 grep；5 个 workflow 注释；实跑 `budget-check` | 高 | 1 | 已确认 |
| P1-03 | 事件脊无 agent 执行入口；`.loop/queue` 无人消费 | 8 个 workflow grep；`pr-review.yml:162` 为 echo | 高 | 1 | 已确认 |
| P1-04 | 熔断器零生产调用者（唯一提及在 heredoc 内）；无 per-pattern 作用域；账本为出厂占位符；`noop` 洗掉连续失败计数 | `ci-sweeper.yml:131-141`；`scripts/ledger-check.mjs:150-190`；实跑 | 高 | 1（轮 2 补充 noop，轮 3 实测确认） | 已确认（含 noop） |
| P1-05 | 每小时一改 / 验证者独立实例 / worktree 强制三条硬约束无运行时实现 | `scripts/` grep 无实现；`loop-verifier/SKILL.md` | 高 | 1 | 已确认 |
| P1-06 | `hasEventWiring` 假阳性：本包 CI 被判为已接线，`no-wiring` 永不触发，污染 Stage 3 判据 | `scripts/lib/common.mjs`；实跑 `hasEventWiring('.')` | 高 | 1 | 已确认 |
| P1-07 | 对**多行清单**忘记 `@` 使拒绝列表 + 范围两个闸门同时静默失效（**第 3 轮已修正触发条件**） | `scripts/gate-check.mjs:399-410`；`--diff-files big.txt` vs `@big.txt` 对照 | 高 | 2（轮 3 修正） | 已确认（表述已更正） |
| P2-01 | `loop-audit` 占位符守卫在 CRLF 下失效（死代码） | `scripts/loop-audit.mjs:131`；正则逐字验证 | 中 | 1 | 已确认 |
| P2-02 | 安装漂移检测默认走错目录、清单缺 layout/dotDir、真实漂移已发生且无人发现 | `scripts/install-skills.mjs:206-269`；实跑 `--check` × 3 | 中 | 1 | 已确认 |
| P2-03 | 文件数阈值 5 vs 10 两份真相源 | `loop-constraints.md:51` / `minimal-fix/SKILL.md:26` vs `LOOP.md:157` | 中 | 1 | 已确认 |
| P2-04 | 无任何工具范围声明；读侧无权限隔离 | 17 个技能 grep `allowed-tools` = 0；`loop-audit.mjs:290` FAIL | 中 | 1 | 已确认 |
| P2-05 | `max sub-agent spawns/run` 与 `suggested_daily_cap` 无消费者 | `loop-budget.md` 第 4 列；`patterns/registry.yaml` | 中 | 1 | 已确认（间接消费者**存疑**） |
| P2-06 | 触发描述落差：技能名/"top-level entry"/"route event" 导致误触发，必需参数写在描述中段 | `skills/harness-loop/SKILL.md:2-13`；3/3/2 触发预测表 | 中 | 1 | 已确认（触发行为**待验证**） |
| P2-07 | 宿主发现路径（`.pi`）与 `SKILL_DIRS`/`LAYOUTS` 三方不一致 | `scripts/lib/common.mjs`；本机三目录实测 | 中 | 1 | 已确认 |
| P2-08 | CI 只跑 Linux → 本机孤儿进程缺陷永不可见；无 CRLF fixture | `.github/workflows/self-check.yml`；两 shell 实跑 978/1 vs 979/0 | 中 | 1 | 已确认 |
| P2-09 | 占位符账本与熔断触发同为 exit 2，无法区分 | `loop-ledger.json`；实跑 `ledger-check` | 中 | 1 | 已确认 |
| P2-10 | outcome 枚举两份真相源（技能 5 值 vs 日志/校验器 7 值） | `loop-budget/SKILL.md` vs `loop-run-log.md` vs `test.mjs` §12 | 中 | 1（本次补编号） | 已确认 |
| P3-01 | 三条已登记打磨项 | `loop-audit.mjs:216/:316`；`test.mjs` 临时目录 | 低 | 1 | 遗留（已知未修） |
| P3-02 | `user_invocable`/`license` 断言不生效字段 | `test.mjs:2166/:2356`；宿主源码 | 低 | 1 | 已确认 |
| P3-03 | `feature_list.json` 重复 id `stage-001` | `feature_list.json` 索引 1 与 7 | 低 | 1 | 遗留（已知未修） |

---

## 6. 审查过程中遇到的难点

### D1 区分"文档声称的能力"与"实际存在的机制"

- **是什么**：同一个词（"强制""必须""机械判定"）既用于描述真实代码，也用于描述提示词里的自律要求，读文档无法区分。
- **为什么难**：两者措辞完全一致。`loop-constraints.md` 写"尝试上限由 `loop-ledger.json` + `ledger-check.mjs` 机械强制"——这句话在文档层是真的（脚本存在且逻辑正确），在运行层是假的（没有调用者）。只读文档会得出相反结论。
- **是否已解决**：已解决。
- **如何解决**：对每一项"机械判定"声称做**双向追踪**——(a) 谁读它（全仓 `grep` 引用）；(b) 谁写它（是否有写入代码）；(c) 谁在真实路径上调用它（workflow 的 `run:` 是否真执行，而不是在 heredoc 或 echo 里）。P1-02/P1-04/P1-05/P1-06 四条问题全部由这套方法产出。

### D2 同一条断言在两种 shell 下得到相反结果

- **是什么**：`node scripts/test.mjs` 在原生 Windows PowerShell 下 `978/1`，在 git bash 下 `979/0`。
- **为什么难**：失败信息只报"pid 仍存活"，看不出平台相关；而 CI 只跑 Linux，永远不会暴露它。
- **是否已解决**：已解决。
- **如何解决**：先在两种 shell 下各跑一次确认差异；读 `common.mjs:598` 找到 `hasGnuTimeout()` 的探测方式（要求 `timeout --version` 输出含 "GNU coreutils"）；用 `Get-Command timeout` 确认原生 Windows 解析到 `C:\Windows\system32\timeout.exe`；对照 `runWithTreeKill` 的两条分支与返回值 `treeKill`；用 `Get-CimInstance Win32_Process` 确认真实泄漏了 `bash.exe` + `sleep.exe` 两棵进程树并手动清理。

### D3 爆炸半径测量一度被自己的 fixture 误导

- **是什么**：第 1 轮早期我曾判断"CRLF 也会让 `loop-audit` 与 `harness-stage` 的评分失真"。用一个只复制了 4 个 md 文件的临时目录做对照，LF 与 CRLF 都得 25/100、FAIL 列表相同——看起来"确认了"。
- **为什么难**：fixture 不完整时，失败原因无法归因到被测变量；两个对照都得同样的低分，反而像"EOL 无关"的证据，实际是"缺文件"掩盖了一切。
- **是否已解决**：已解决，且**结论被推翻**。
- **如何解决**：先做归因实验——LF 与 CRLF 在同一缺文件 fixture 上得分**完全相同**，说明变量不是 EOL；再用完整 fixture 重测（`harness-stage --json` + `loop-audit` 的 `ok` 字段），确认两者对 EOL 不敏感。最终逐个正则做逐字验证，得到"8 个 EOL 敏感点中 1 个破坏行为、1 个禁用守卫、6 个安全"的精确结论（P1-01 + P2-01）。

### D4 判断闸门是否可绕过必须构造对抗输入

- **是什么**：只读 `gate-check.mjs` 会看到"有 `--evidence-file` 检查""缺文件会 escalate"，从而认为闸门成立。
- **为什么难**：形状匹配类缺陷在代码上看起来完全正常；必须实际喂进"形状对但内容不成立"的输入才会暴露。
- **是否已解决**：已解决。
- **如何解决**：手写 6 份证据文件实跑（含 `Verdict: APPROVE` + `Tests → FAIL`、全 `NOT RUN`、缺 `### Checks not run`、ASCII 箭头），并把它们设计成可复用 fixture 交给 `test.mjs`。

### D5 真机 / Linux / 目标 agent 触发无法在只读边界内验证

- **是什么**：硬约束 10 要求"改了厂商接入必须真机验证"，8 个 workflow 从未在任何真实 GitHub 仓库跑过；Linux 上的 GNU timeout 路径未验证；`harness-loop` 的触发行为无法在目标 agent 里实测。
- **为什么难**：需要真实仓库 + 真实事件 + 目标 agent 环境，超出本次只读审查的授权与资源。
- **是否已解决**：**未解决**，如实标注。
- **为何未解决**：见第 8 节"未决事项与风险"。相关结论已在 P2-06（触发预测）、P2-08（Linux 路径）中标注为"待验证"。

### D6 "配置是否装饰品"需要变异测试而非 grep

- **是什么**：`patterns/registry.yaml`、`loop-budget.md` 的若干列有声明无消费者，但 grep 只能证明"没有直接引用"，不能证明"改了它行为不变"。
- **为什么难**：可能存在间接消费者（agent 读配置文件自行判断），静态分析无法排除。
- **是否已解决**：**部分解决**。
- **如何解决**：复用了仓库自带的变异测试手法（`test.mjs` §17：把 `stagnation` 改成 1 会让 `ledger-check` 真的返回 `stagnation`；把 `max_attempts` 改成 1 会让 `gate-check` 真的 `escalate`），并把"变异测试"写进修复项的验收标准。对无法排除间接消费者的 `suggested_daily_cap`，明确标注为**存疑**而不是断言"无消费者"。

---

## 7. 两轮之间的差异

### 7.1 新增

| 编号 | 内容 | 来源 | 原因 |
|---|---|---|---|
| P1-07 | 对**多行清单**忘记 `@` 使拒绝列表 + 范围闸门同时静默失效（轮 3 已更正表述） | 轮 2 场景 6 对抗探测；轮 3 复核修正 | 轮 1 把它当作"设计取舍"记录（`gate-check.mjs:403` 有正当理由的注释），轮 2 把它升格为"可静默触发的绕过"。**轮 3 复现发现轮 2 给的触发条件写错了**（详见 §7.4） |
| P0-01 补充 | 证据里的 `Real-use validation → NOT RUN` 不影响放行；`--not-run` 是回显而非推导 | 轮 2 场景 7 | 轮 1 只测了 `Tests/Red check` 两类检查与缺失节，未测"真实使用验证"这一类与 `--not-run` 的来源 |
| P1-04 补充 | `noop` 会重置 `consecutiveFailures`，使"5 次都没进展"被洗掉 | 轮 2 场景 4 推演；轮 3 实测确认 | 轮 1 只验证了主路径（`test.mjs` §4 覆盖），未考虑中间插入 `noop` 的变体。**轮 3 构造账本实测确认成立，已从"存疑"升格为"已确认"** |
| P2-10 | outcome 枚举两份真相源（技能 5 值 vs 日志/校验器 7 值） | 轮 1 取证、本次补编号 | 轮 1 已做三处原文比对但当时未编号；本次文档写作时补上。**不影响任何既有结论** |

### 7.2 撤销

无。轮 1 的 20 条问题在第 2 轮全部维持。

### 7.3 改判

| 项 | 轮 1 初判 | 轮 2 终判 | 原因 |
|---|---|---|---|
| CRLF 的爆炸半径 | "`loop-audit` 与 `harness-stage` 的评分也会因 CRLF 失真"（早期假设） | 证伪：两者的评分对 EOL **不敏感**；仅 `queue-read.mjs:71` **破坏行为**（P1-01），`loop-audit.mjs:131` **禁用一条守卫**（P2-01），其余 6 个 EOL 敏感点安全 | 见 D3：早期测量被不完整的 fixture 误导（LF 与 CRLF 都得 25/100 且 FAIL 列表相同，实为缺文件所致）。重做归因实验 + 逐正则逐字验证后推翻 |
| P1-07 的性质 | "设计取舍（`gate-check.mjs:403` 注释有正当理由）" | "可静默触发的安全绕过" | 见 7.1 |

**改判的方法论意义**：D3 是本次审查唯一一次**推翻自己的中间结论**。记录在此，是因为它说明一个边界——**在 fixture 不完整时，"两个对照结果相同"可能只是掩盖变量的噪声**；可靠的做法是先把失败原因归因清楚，再比较变量。

### 7.4 第 3 轮复核的修正（2026-10-16）

独立复核逐条重跑了本报告的关键探针，结论是 **22 条问题中 20 条原样成立，1 条表述错误，1 条触发条件错误，另有 1 条从"存疑"升格为"已确认"**。全部细节见 §9。三处修正如下：

| 编号 | 原表述 | 复核结果 | 影响 |
|---|---|---|---|
| **P1-07** | 裸路径 `--diff-files auth/login.ts` → `proceed, files_changed: 1` | ❌ **复现不出**。四种参数排列（含文件真实存在）全部 `escalate / denylist`。真实触发条件是**对多行清单文件忘记 `@`**：`--diff-files big.txt`（20 条）→ `proceed, files_changed: 1`；`@big.txt` → `escalate / scope, 20` | 危害相同，但 **MP-01 的 fixture 与描述必须按"忘记 `@`"写**，否则断言错对象 |
| **P2-08** | 原生 Windows → `978/1` | ⚠️ **环境相关，非平台决定**。原生 `powershell.exe` 直接跑得 `979/0`（Git 的 `timeout` 在 PATH 上）。只有 `system32` 排在 Git 前才复现 `978/1` | **MP-10 必须按 `hasGnuTimeout()` 分叉，不能按 `process.platform`**——否则写出在开发机上恒绿的假断言 |
| **P1-04** | `noop` 重置计数：**静态分析，存疑** | ✅ **实测确认**。`[f,f,noop,f,f]` → `ok, 2/5, exit 0`；`[f,f,f,f,f]` → `no-progress, 5/5, exit 2` | 从"存疑"升格为"已确认"；MP-05 的补充项从"先实测"改为"直接修" |

**这次复核暴露的方法论问题**：轮 2 把 P1-07 从"取舍"升格为"问题"时，**依据的是一次没有对照的观测**——它记录了"裸路径 → proceed"，但没有同时跑"同一路径加 `@`"来确认差异确实来自 `@`。这与 D3 是同一个病的两种形态：D3 是"两个对照结果相同却是噪声"，这次是"**只跑了一个对照就归因**"。**对照实验的另一半必须真的跑，不能推理。**

## 8. 未决事项与风险

### 8.1 未覆盖区域（本次审查范围之外）

| 区域 | 覆盖程度 |
|---|---|
| `examples/github-actions/` 的 4 个 workflow | 只做 grep 级检查（`daily-triage.yml`、`lesson-harvest.yml`、`release-draft.yml`、`post-merge.yml` 的完整步骤未逐行阅读）；`issue-intake.yml`、`pr-review.yml`、`merge-gate.yml`、`ci-sweeper.yml` 已读关键段 |
| `docs/` 13 篇 | 只读关键篇章与关键段落（`03-gates-and-levels.md` 的等级表与阈值、`04-safety.md` 的引用、`10-how-to-use.md` 的安装段、`12-stage-commands.md` 的命令段）；未逐篇全文阅读 |
| `templates/` 13 个文件 | 只做存在性与大小清点，未逐篇比对与根文件的差异 |
| `patterns/registry.yaml` | 只读结构与 `defaults:`/`stages:` 块的消费者追踪；8 个 pattern 的 `phases`/`skills`/`cost` 字段未逐个验证 |
| `.mimosa/` | 未审（gitignored 的 agent 运行遥测，非循环产物） |
| `scripts/worktree.mjs`、`scripts/init-loop-harness.mjs`、`scripts/harness-stage.mjs` 的 `--upgrade` 写入路径 | 未执行（只读边界） |

### 8.2 未验证事项

| 事项 | 为什么未验证 | 影响的结论 |
|---|---|---|
| 8 个 workflow 在真实 GitHub 仓库的行为（硬约束 10） | 需要真实仓库 + 真实事件 | P1-03 的"执行端不存在"是**代码级**结论（已确认）；workflow 的 `gh`/`jq` 调用、artifact 投递、`LOOP_BOT_TOKEN` 回退分支的实际行为未验证 |
| Linux 上的测试套件与 GNU timeout 路径 | 本机只有 Windows/MSYS 与原生 Windows | P2-08 的"Linux 上孙进程被回收"未实测（CI 上恒绿，未见过失败） |
| `harness-loop` 在目标 agent 中的触发行为 | 无法在目标 agent 里实测 | P2-06 的 3/3/2 触发预测是**基于文本的预测** |
| `harness-stage --upgrade --stage N` 的写入行为 | 只读边界 | 未列为问题（未观察到，不等于无问题） |

### 8.3 存疑项

| 编号 | 存疑内容 | 为何存疑 | 第 3 轮状态 |
|---|---|---|---|
| P1-04 | `noop` 重置 `consecutiveFailures` 导致漏报 | 静态分析得出；未构造账本实测 | ✅ **已实测确认**（见 §3.2 P1-04 补充观察） |
| P2-05 | `suggested_daily_cap` 是否存在**间接**消费者 | 静态分析无法排除"agent 读 registry.yaml 自行判断" | 仍存疑（`grep` 确认无脚本消费者；间接消费无法证伪） |
| P2-06 | 触发预测表中的 3 个"应触发"与 3 个"不应触发" | 基于描述文本的推理，未在目标 agent 中实测 | 仍存疑（复核未改变） |
| P1-05 | 三条硬约束是"设计意图的约定"还是"打算做但没做的机制" | 需要作者确认；两种情况下修改建议不同（降级为约定 vs 补上实现） | 仍待作者确认 |

### 8.4 残留风险（本次审查自身产生的）

- 两次测试运行各泄漏一棵进程树（`bash.exe` + `sleep.exe`），已手动 `Stop-Process` 清理；清理后复查无残留。
- 审查期间创建了多个临时目录与 fixture（`%TEMP%\lh-*`、`lh-crlf-probe.mjs` 等），未清理（它们是只读探测的产物，不在仓库内）。
- **未修改任何仓库文件**：`git status --porcelain` 在审查期间保持为空，HEAD 为 `0a5ce0c`。（本报告文件本身是审查结束后由使用者要求新增的交付物。）

---

## 9. 第 3 轮：独立复核

**日期**：2026-10-16
**性质**：不是新审查，是**对前两轮结论的对抗性复核**——逐条重跑关键探针，而不是重读代码。目标是回答一个问题：**这份报告里哪些结论是真的，哪些是推理出来的。**

**方法**：对报告声称"已验证"的每一条，用独立构造的输入重新触发；对报告声称"存疑"的，直接构造输入实测；对报告给出具体命令与输出的，原样重跑并比对。

### 9.1 复核结果总览

| 判定 | 条数 | 编号 |
|---|---|---|
| **原样成立**（重跑得到相同结果） | 19 | P0-01、P0-02、P1-01、P1-02、P1-03、P1-04（除 noop）、P1-05、P1-06、P2-01、P2-02、P2-03、P2-04、P2-05、P2-07、P2-09、P2-10、P3-01、P3-02、P3-03 |
| **表述错误**（结论对、证据错） | 1 | P1-07 |
| **触发条件错误** | 1 | P2-08 |
| **升格**（存疑 → 已确认） | 1 | P1-04 的 `noop` |

**结论**：报告的骨架、2 条 P0、以及绝大多数 P1/P2 都经得起实跑复核。没有发现凭空捏造的结论，也没有发现"读了代码就说验证过"的条目。

### 9.2 逐条复核证据（关键项）

| 编号 | 复核动作 | 结果 |
|---|---|---|
| P0-01 | 手写 4 份证据文件实跑：`APPROVE`+`Tests→FAIL`、全 `NOT RUN`+有节、缺 `### Checks not run`、ASCII `->` | ✅ 前三者全部 `proceed, exit 0`；ASCII 箭头 `escalate`。**闸门确实不解析状态值、不读该节** |
| P0-01 | 证据含 `NOT RUN` 但不传 `--not-run` | ✅ `checks_not_run: []` —— 闸门从不读证据自己声明的 NOT RUN |
| P0-01 | 传 `--not-run e2e,真机` | ✅ 原样回显 `["e2e","真机"]`，与证据无关 |
| P0-02 | 用 merge-gate 的**完全相同参数形状**调用 | ✅ `escalate / verification / "no verifier verdict present at the gate phase"` |
| P1-01 | 在真实仓库跑 `queue-read --json` | ✅ `items: []`，note 谎称"既无待办"，而 High Priority 区有 6 条未勾选；`git ls-files --eol` 确认 `w/crlf`，无 `.gitattributes` |
| P1-02 | grep 全仓 `writeFileSync\|appendFileSync` 找三个状态文件的写入者 | ✅ **全部在 `test.mjs` 内**。`budget-check --pattern issue-intake` → `used: 0, entries: 0` |
| P1-03 | grep 8 个 workflow 找 agent 调用 | ✅ 唯一命中 `pr-review.yml:162`，是 `echo` |
| P1-04 | 实跑 `ledger-check --ledger loop-ledger.json` | ✅ `placeholder-ledger`, exit 2；`--help` 确认**不存在 `--pattern`** |
| P1-04 | **构造账本测 noop**（报告标为存疑） | ✅ **确认**：`[f,f,noop,f,f]` → `ok, 2/5, exit 0`；`[f,f,f,f,f]` → `no-progress, 5/5, exit 2` |
| P1-06 | 实跑 `hasEventWiring('D:/harness_loop')` | ✅ `{"wired":true,"via":"workflow","detail":"1 个 workflow 调用了运行层脚本（self-check.yml）"}` |
| P2-01 | 逐字正则验证 | ✅ `'never\r'` 不匹配，`'never'` 匹配 |
| P2-02 | 跑 `--check`（默认 layout）与 `--layout zcode --check` | ✅ 默认 → `Checked 0` + 17 个无关技能报残留 + exit 1；zcode → `Checked 16` + 16 条漂移。清单确认**无 `layout`/`dotDir` 字段**。源 10617 B vs 已安装 6649 B |
| P2-04 | 跑 `loop-audit . --json` 并正确解析 `checks` 数组 | ✅ `toolScope` 与 `loopActivity` 均 `FAIL`（见 9.3 我的解析失误） |
| P2-07 | 读宿主 `pi-coding-agent` 的 `package-manager.js` 与 `config.js` | ✅ 宿主读 `~/.agents/skills`、`<cwd>/.pi/skills`、`~/.pi/agent/skills`；**`.zcode` 在宿主源码里零命中**——装在 `~/.zcode/skills` 的 18 个技能没有任何东西在读。比原报告更严重 |
| P3-03 | 解析 `feature_list.json` | ✅ 16 条、15 个唯一 id、重复 `stage-001` |
| 报告的"确实工作"五项 | 复跑锁键、per-loop 上限、带 `@` 的拒绝列表、`harness-stage` 判据 | ✅ 全部成立 |

### 9.3 复核过程中我自己的失误（记下来，别重复）

**第一次跑 `loop-audit` 时我报告"无 FAIL"，一度看起来像 P2-04 报错了。那是我的解析 bug。**

`loop-audit --json` 的输出结构是 `{ checks: [{key, label, ok, weight}], subsystems: {...} }`——`checks` 是**扁平数组**，不嵌在 `subsystems` 下。我按 `subsystems[k].checks` 去取，得到空数组，于是"无 FAIL"。改用 `j.checks.filter(c => !c.ok)` 后立刻看到 `toolScope` 与 `loopActivity`。**P2-04 属实。**

这与本仓库反复记录的模式同源：**断言/探针的范围一旦比被检查的对象错位，它就会给出错误的安全感**。这里是我自己的探针错了，不是被测代码错了——但症状一样：**绿色的输出，指向了不存在的结论**。

### 9.4 复核对实施的影响

三处修正中，两处**直接改变实施动作**：

1. **MP-01 的 fixture 必须重写**。原 spec 写"裸路径 → exit 1 且 stderr 含 `Prefix with "@"`"——按此写会断言一个不存在的缺陷。正确形态是：**`--diff-files <多行文件>`（无 `@`）必须报错，而不是静默塌缩成 1 个文件**；单行文件仍按单路径处理（`files_changed: 1`）。spec 的第三条守卫（"文件存在且是多行 → 报错"）**方向是对的**，但理由要改成"防止清单塌缩"而不是"防止裸路径绕过"。

2. **MP-10 的分叉判据必须改**。原 spec 写"平台感知的 tree-kill 断言"，若实现成 `process.platform === 'win32'` 就错了——Git 在 PATH 上时 Windows 也能拿到 GNU timeout，断言会恒绿。**必须用 `hasGnuTimeout()` 的实际返回值分叉。**

3. **MP-05 的 `noop` 补充项从"先实测"改为"直接修"**。`consecutiveFailures` 应统计**尾部非 success 段**，而不是尾部连续 failure 段——否则一次被锁跳过的 `noop` 就能把"5 次都没进展"洗成"2 次"。

### 9.5 复核的边界（未做的事）

- **仍未验证**：Linux/GNU-timeout 路径、8 个 workflow 在真实 GitHub 仓库的行为、`harness-loop` 在目标 agent 中的触发行为、`harness-stage --upgrade` 的写入路径。与 §8 声明的范围一致，复核**没有缩小这些缺口**。
- **复核只在 Windows/MSYS 完成**——这恰好也是 P2-08 那条"环境相关"结论的由来，两者互为印证。
- **未复核**：`templates/` 逐篇比对、`docs/` 全文、4 个 workflow 的完整正文（`daily-triage`、`lesson-harvest`、`release-draft`、`post-merge`）。

---

**报告结束。** 配套的《修改计划 Spec》见 `REVIEW-2026-10-16-modification-spec.md`（MP-01 与 MP-10 已按 §7.4/§9.4 修正）。
