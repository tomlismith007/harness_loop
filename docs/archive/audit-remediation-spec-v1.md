# 审计整改 Spec — harness-loop v1.1.0 → v1.2.0

> **归档说明（2026-10-24，v2 收尾 E-02 追加）**：本 spec 由 `spec-plan/` 归档于此，接替者为
> `spec-plan/audit-remediation-spec-2026-10-24.md`（v2）。逐项核对结果：
> **已实施**（有 ID 标注提交）：D-01→adff111、D-02→17bf6d8、C-01→2fc097a、C-02→f9dc5c1、
> C-03→adff111、C-04→e173da9、C-05→0f872ef、C-06→d0c4c92、C-07/08→06d217e、C-09→091dce7、
> C-12…C-16→0b9a61f、C-17→17bf6d8；**已实施**（无 ID 标注提交，按现状核对）：C-10、C-11。
> **另行解决**：C-18（死分支）当日未处理，2026-10-24 由 v2 的 B3-11 以"修复分支并断言"解决
> （优于本文的"删分支"方案，`cfg.maxAttempts` 现有真实默认值）。
> **未按原文实施**：C-19（L2/worktree 标注为建议做法）、C-20（合并闸门节压缩为两行）——
> 现状措辞经 v2 审计未再列为发现；如需恢复执行，从这两项接手。
> **§10 验收清单的 9 个勾选框未勾**：属当时的跟踪遗漏；其中端到端与手工冒烟两项
> 对应 README「已验证到什么程度」表的一次性记录（不可重跑）。

> **性质**：实施计划（spec），不是审计报告。审计结论压缩在 [附录 A](#附录-a发现索引)。
> **基线**：`bash init.sh` → `Passed: 707  Failed: 0`（2026-10-23，本机）。
> **状态**：`待决策`（见 §1）。未开始实施。
> **本文件**：`spec-plan/audit-remediation-spec.md`。实施完成后删除，或归档到 `docs/archive/`。
> **本文件不是技能产物**，不随 `npx skills add` 分发，不受 `test.mjs` 的模板/路径断言约束。

---

## 0. 使用方式

1. 先回答 §1 的 3 个阻塞决策，把结果写回本文件的决策表。
2. 按 §2 的批次顺序逐项实施。**一次一项，一项一个 diff**（AGENTS.md 工作规则）。
3. 每项实施后跑它自己的「验收」，再跑 `bash init.sh` 确认没有回归。
4. 全部 P0 完成前不碰 P1/P2。
5. 任何一项的验收失败 → 停在该项，不要叠加下一项。

**记号**

| 记号 | 含义 |
|---|---|
| `[P0]` | agent 会做错或无法继续 |
| `[P1]` | 有歧义或自相矛盾 |
| `[P2]` | 冗余或风格 |
| 「回退测试」 | 只回退被改的实现文件、保留新断言，跑 `test.mjs` 必须红 |

---

## 1. 决策点（阻塞）

### D-01 · 阶段 2 判据 6（`docs/04-safety.md` 一致）怎么办？

现状：判据要求两份拒绝列表逐条一致，但装配器从不生成 `docs/04-safety.md`，技能也没说要手工建。实测其余判据全过时 `--require` 仍 exit 2。出厂即不可达。

| 选项 | 做法 | 代价 | 保留的保障 |
|---|---|---|---|
| **A 删除判据** | 删 `denylistDrift`、判据 6、U-06 漂移测试；阶段 2 变 6 机械 + 2 人工 | 少约 35 行代码 + 1 条测试；同步 3 处计数 | **丢失**「文档说禁止、机器放行」方向的检查 |
| **B 生成骨架**（推荐） | `upgradeStage2` 在文件不存在时写 `docs/04-safety.md`，拒绝列表与 `## Paths` 同源 | 多约 15 行；阶段 2 产物 +1 | 保留判据 6，且出厂可达 |

**推荐 B**：这是审计报告里唯一改动推荐的一项，理由有两条——
上游 `cobusgreyling/loop-engineering` 的 `gate.yaml` 就是 `docs/safety.md` 的机器孪生，并靠"keep in sync"维持（`gate.yaml:1-4`），本项目的判据 6 是同一思路；而删掉它，`docs/04` 与机器策略的漂移就再无任何检查。
选 B 时判据数不变（7 机械 + 2 人工），文档计数改动最小。

**决定**：`☑ B`（2026-10-23 确认）

---

### D-02 · 根 `templates/`（8 个文件）怎么办？

现状：根 `templates/` 与 `skills/*/templates/` 是两份手工同步的副本；实测改任一份都不红。AGENTS.md 说「根是源、技能里是副本」，README 说「技能里就是唯一的一份」——两句话互相矛盾。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 删除根 `templates/`**（推荐） | 测试的 `TEMPLATE_DIR` 改指向 `skills/harness-init/templates`，loop 两个模板另加解析；删 8 文件 | 改 `scripts/lib/common.mjs`、`scripts/test.mjs`、README 目录树、AGENTS.md 表格 |
| **B 保留 + sha256 断言** | 加一条断言：根模板与技能模板逐字节相同 | 断言约 15 行；两份副本长期存在 |

**推荐 A**：单一真相源，且与 README:149 和 AGENTS.md:12 的既有表述一致。B 只是把矛盾锁死。

**决定**：`☑ A`（2026-10-23 确认）

---

### D-03 · 熔断检查放在哪一步？

现状：第 4 步 `REJECT` 直接回第 3 步，跳过第 5 步熔断；失败尝试也从不入账（账本无写入入口）。结果是 `stagnation` / `attempt-limit` 在真实失败路径上永不触发。

| 选项 | 做法 | 代价 |
|---|---|---|
| **A 派发前熔断**（推荐） | 第 3 步改为「熔断预检」，第 4 步执行，`REJECT` → 追加失败记录 → 回第 3 步 | 步骤顺序调整，7 步不变 |
| **B 保留第 5 步** | 只把 `REJECT` 回路改成 4 → 5 → 3 | 顺序更绕；「先执行再被拒」的疑点仍在 |

**推荐 A**：语义最准（"还该不该继续"必须在动手前问），且修掉疑点 1 的根因。

**决定**：`☑ A`（2026-10-23 确认）

---

### D-04 · 账本写入入口（非阻塞，取推荐即可）

| 选项 | 做法 | 取舍 |
|---|---|---|
| **A `ledger-check --append`**（推荐） | 在现有脚本加子命令 | 写入器与校验器同文件，schema 只有一份定义；diff 最小 |
| B 新脚本 `ledger-append.mjs` | 单一职责 | 多一个文件、多一份 import、schema 两处引用 |

**决定**：`☑ A`（如需改为 B，在实施 C-02 前说明）

---

## 2. 批次与顺序

**进度（2026-10-24）**：B1 全部完成 —— C-02 `f9dc5c1`、C-01 `2fc097a`、C-04 `e173da9`、C-05 `0f872ef`、C-03 `adff111`。断言 707 → 741，每项都有回退测试。

**B2 进度（2026-10-24）**：C-06 `d0c4c92`、C-07/C-08 `06d217e`、C-09 `091dce7`、C-12…C-16 `0b9a61f`。断言 741 → 754。C-11 已随 C-02 完成。

**未做**：C-10（run-id slug 说明——C-02 已在 SKILL.md 第 4 步写明 ASCII slug，但没加测试断言）、C-17…C-20（B3 瘦身批次）。


| 批次 | 目标 | 变更项 | 完成标志 |
|---|---|---|---|
| **B1** | 让机械保障真的生效 | C-02 → C-01 → C-04 → C-05 → C-03 | 5 项验收全过 + `bash init.sh` 全绿 |
| **B2** | 消除歧义与过度承诺 | C-06 … C-16 | 同上 |
| **B3** | 瘦身与去重 | C-17 → C-18 → C-19 → C-20 | 同上 + 断言数下降被记录 |

**顺序约束**

- **C-02 先于 C-01**：两者都重写 `skills/harness-loop/SKILL.md` 的流程段；先做结构重排（C-02 重编号），再做提交与 dirty-tree（C-01），避免同一段改两遍。
- **C-17 依赖 D-02**：选 A 时先删根模板再写副本一致性断言。
- **C-03 依赖 D-01**：选 A 删判据，选 B 加骨架。
- 每项完成后 `bash init.sh` 必须全绿；红则停。

---

## 3. 变更项

### C-01 `[P0]` 改动清单必须来自已提交的 diff

**对应发现**：F-01（拒绝列表闸门空转）、F-15（状态写入落错仓库）、F-15b（kill switch 在 worktree 内不可见）

**问题**：技能从不要求执行者提交；第 6 步 `git diff main...HEAD` 在未提交时输出为空，`files_changed: 0`，denylist 与 scope 两闸同时失效。实测：worktree 里放未提交的 `templates/evil.txt`，闸门返回 `proceed`。同一原因让 `--reviewed-sha=--head-sha=HEAD` 也能通过（head 没动）。

**改动**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop/scripts/gate-check.mjs` | 新增闸门 `dirty-tree`，插在 `wip-limit` 之后、`denylist` 之前；`GATE_ORDER` 变 11 项。`checkGates` 新增入参 `dirtyFiles = []`，非空 → `escalate`。`main()` 在 `--phase gate` 时用 `git status --porcelain` 取值（cwd），解析 `XY path` 与 `R old -> new`，剔除 `LOOP_ARTIFACTS = ['changed-files.txt', 'verifier-report.md']` |
| 同上 | 读不到 git（非仓库）不在此闸处理：`--phase gate` 已因 head-sha 解析失败 exit 1（`gate-check.mjs:843`） |
| `skills/harness-loop/scripts/state-commit.mjs` | 创建 `.harness-loop-backup/` 前，确保它已在 `.gitignore` 里（与 `worktree.mjs` 对 `.loop-worktrees/` 的做法一致） |
| `skills/harness-loop/SKILL.md` | 第 3 步（C-02 后为第 4 步）新增硬步骤「提交到 `loop/<id>` 分支」；第 6 步生成清单前先断言工作区干净；**第 6 步的 `--state` 改为主检出绝对路径**（否则 worktree 内的 STATE.md 是旧副本，kill switch 与 WIP 判定都看不到主检出的最新值） |
| `README.md`、`docs/03`、`docs/08` | 闸门表加 `dirty-tree`，计数 10 → 11 |

**验收**

```bash
# 1) 单元：脏清单 → escalate
node scripts/test.mjs --verbose 2>&1 | grep "脏工作区在 gate 阶段"
# 预期：一行 PASS

# 2) 集成：临时仓库改一个已跟踪文件后跑 gate
#    预期 exit 2，输出 "gate": "dirty-tree"

# 3) 豁免：只留 changed-files.txt / verifier-report.md → exit 0

# 4) 文档一致
node scripts/test.mjs 2>&1 | tail -3
# 预期 Passed 全绿（docs/08 的 gate 计数断言会自动校验 11）
```

**回退测试**：只回退 `gate-check.mjs`，保留新断言 → 「脏工作区」断言必须红（改前 `gate` 为 `null`）。

**风险**：已有用户的手工流程会被 `dirty-tree` 拦住。缓解：SKILL.md 明确写「本轮改动必须先提交，闸门绑定 commit」；豁免清单写进 `--help`。

---

### C-02 `[P0]` 熔断前置 + 账本写入入口

**对应发现**：F-04（账本无写入入口）、F-05（REJECT 回路绕过熔断）、F-22 相关（`attempts` 死分支）

**问题**：`loop-ledger.json` 只能手改，而 SKILL.md 不含 schema；第 4 步 `REJECT` 直接回第 3 步，永不经过第 5 步熔断。失败尝试不进账本 → `attempt-limit` / `stagnation` / `no-progress` 在真实失败路径上全部失效。

**改动**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop/scripts/ledger-check.mjs` | 新增 `--append` 模式：`--item`（必填）、`--outcome success\|failure\|noop`（必填）、`--action`（必填）、`--error`（`failure` 时必填）、`--tokens`（默认 0）。`iteration = max(已有)+1`；`at` 取当前 ISO 时间；tmp → rename 原子写（Windows 先删后改名，同 `state-commit.mjs:82-91`）。账本不存在/非法 JSON → exit 2（与 check 的 fail-closed 一致）；参数非法 → exit 1 |
| 同上 | check 模式在 `--item` 下额外输出 `item_attempts`（当前 `iterations` 统计的是全账本条数，见 `ledger-check.mjs:182`，不能直接当该 item 的尝试次数用） |
| `skills/harness-loop/SKILL.md` | 流程重排为：0 退出检查 → 1 加载约束 → 2 选定唯一一项 → **3 熔断预检** → 4 执行者 → 5 独立验证 → 6 闸门 → 7 写状态。`REJECT` 分支改为「追加失败记录 → 回第 3 步」；第 7 步追加成功记录后 `--attempts` 取 `item_attempts` |
| `templates/harness-constraints.md` | 「每次尝试追加到 `loop-ledger.json`」改为给出可运行命令（模板与技能副本两处） |

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep -E "append 写入|append 缺 --error|append 账本不可读|item_attempts"
# 预期：4 行 PASS

# 手工冒烟（临时仓库）
node .claude/skills/harness-loop/scripts/ledger-check.mjs --ledger loop-ledger.json \
  --append --item x --outcome failure --error "boom" --action "tried A" --tokens 10
# 预期：appended attempt 1 for x (failure)，exit 0
node .claude/skills/harness-loop/scripts/ledger-check.mjs --ledger loop-ledger.json --item x
# 预期：item_attempts: 1，verdict: ok
```

**回退测试**：只回退 `ledger-check.mjs` → `--append` 变成未知参数（exit 1），4 条断言全红。

**风险**：流程重编号会让按旧编号阅读的用户困惑。SKILL.md 顶部加一行「v1.2 起熔断在派发前（第 3 步）」。

---

### C-03 `[P0]` 阶段 2 可达（依赖 D-01）

**对应发现**：F-02（判据 6 出厂不可达）、F-17（产物数写错）

**问题**：实测其余判据全过、人工项 HUMAN 时 `--require` 仍 exit 2，卡在 `NOT RUN docs/04-safety.md 不存在`。新 agent 按 SKILL.md 字面操作无法完成阶段 2。

**改动（选 B）**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop-init/scripts/stage2.mjs` | `upgradeStage2` 在 `docs/04-safety.md` 不存在时生成骨架：`# 04 · 安全护栏` + `## 拒绝列表` + 与 `harness-constraints.md` 的 `## Paths` 同源的代码块。已存在则 `skipped`，不覆盖 |
| `skills/harness-loop-init/SKILL.md` | 判据表保留 7+2；「产出 **2 个文件**」改为「最多 4 个文件 + 1 份演练记录」并列出清单；「手工改两处」补一句「改了拒绝列表要同步 `docs/04-safety.md`，判据 6 会红」 |
| `README.md:17`、`README.md:245` | 阶段 2 产物与「已验证」表同步为 4 + 1 |

**改动（选 A）**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop-init/scripts/stage2.mjs` | 删 `denylistDrift`（约 35 行）与判据 6 |
| `skills/harness-loop-init/SKILL.md`、`README.md:100`、`docs/03:226` | 判据数改 6 机械 + 2 人工 |
| `scripts/test.mjs:2108-2122` | 删 U-06 漂移断言（这是**删除测试**，需在变更说明里写明理由） |

**验收（选 B）**

```bash
T=$(mktemp -d); printf '{"name":"x","scripts":{"test":"echo ok"}}\n' > "$T/package.json"
node skills/harness-loop-init/scripts/harness-stage.mjs "$T" --upgrade --stage 1 >/dev/null
# 手工补齐 stage1 判据后：
node skills/harness-loop-init/scripts/harness-stage.mjs "$T" --upgrade --stage 2 >/dev/null
test -f "$T/docs/04-safety.md" && echo "skeleton OK"
node skills/harness-loop-init/scripts/harness-stage.mjs "$T" --stage 2 --require
# 预期：判据 6 PASS（其余仍 FAIL，因为拒绝列表未本地化——这是正确行为）
```

**回退测试**：只回退 `stage2.mjs` → `test -f docs/04-safety.md` 失败。

**风险**：生成的文件会进入用户仓库；仅在不存在时写入，不覆盖既有文档。

---

### C-04 `[P0]` `untrusted-shape` 闸门在出厂模板下永不触发

**对应发现**：F-03

**问题**：代码按精确标题 `^##\s+High Priority\s*$` 切分（`gate-check.mjs:245`），出厂模板标题带括号（`templates/STATE.md:8`），于是切不出 section，闸门静默放行。测试夹具用的是裸标题，所以测试全绿。

**改动**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop/scripts/gate-check.mjs` | 改为 `^##\s+High Priority\b`（与 `state-write.mjs:37` 的前缀匹配一致） |
| `scripts/test.mjs` | 现有夹具（`test.mjs:1681`）改为模板原样标题；再加一条「裸标题与模板标题结果相同」 |

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep "模板标题下的第三方条目"
# 预期：PASS
# 集成：用装配出的 STATE.md（带括号标题）写入一条未包 code span 的 src:untrusted 条目 → gate exit 2 (untrusted-shape)
```

**回退测试**：只回退 `gate-check.mjs` → 模板标题断言红（`proceed` 而非 `escalate`）。

**风险**：无。切分更宽松，不会误伤本地条目。

---

### C-05 `[P0]` `AGENTS.md` 与文档里的命令必须能跑

**对应发现**：F-06（`scripts/harness-stage.mjs` 不存在）、F-14（`scripts/drill-check.mjs` 不存在）、F-18（708）、F-19（死条目）、硬约束 6

**问题**：`test.mjs:1129` 只校验反引号里的路径，`node ...` 命令不在覆盖内；AGENTS.md 两条装配命令与 README 一条演练命令都指向不存在的文件。

**改动**

| 文件 | 改动 |
|---|---|
| `AGENTS.md` | `:84`、`:96` 改为 `node skills/harness-init/scripts/harness-stage.mjs` / `node skills/harness-loop-init/scripts/harness-stage.mjs`；删 `:83` 的 `SKILL_BUNDLES` 行；删 `:65` 的 `node skills/*/SKILL.md`；`:103` 改为「直接改技能目录里的文件」；`:64` 去掉硬编码数字 |
| `README.md` | `:244` 改为 `node skills/harness-loop-init/scripts/drill-check.mjs`；`:143`、`:230`、`:243` 去掉硬编码断言数 |
| `scripts/test.mjs` | 新增断言：扫描 `README.md`、`AGENTS.md`、`docs/*.md`、`skills/*/SKILL.md` 里的 `node <path>.mjs`，文件必须存在；`.claude/skills/<name>/scripts/x` 映射到 `skills/<name>/scripts/x`；含 `<`、`*` 的占位路径跳过 |

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep "node 命令都指向真实文件"
# 预期：PASS
node scripts/test.mjs 2>&1 | tail -3   # 全绿
```

**回退测试**：先只加断言、不改文档 → 必须红（至少 3 条：AGENTS.md ×2、README ×1）。

**风险**：断言会约束未来所有文档命令；这正是硬约束 6 想要的。

---

### C-06 `[P1]` 验证者报告契约与独立性

**对应发现**：F-09（模板承诺闸门不读的字段）、F-10（`--implementer` 可省）

**问题**：模板说「校验 `Author` ≠ `Executed by`」「`Change class confirmed`」，代码两者都不读；`--implementer` 不传则独立性完全不判。

**改动**

| 文件 | 改动 |
|---|---|
| `templates/verifier-report.md`（及技能副本） | 删 `Executed by` 行；`Change class confirmed` 改为必填枚举 `behavior\|docs\|config\|refactor` |
| `skills/harness-loop/scripts/gate-check.mjs` | `--phase gate --verdict approve` 缺 `--implementer` → 参数错误 exit 1；报告里的 change class 与 `--change-class` 不一致 → `verification-evidence` escalate |
| `skills/harness-loop/SKILL.md` | 第 6 步命令标注 `--implementer` 必填；第 4 步报告格式同步 |

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep -E "implementer 必填|change class 不一致"
# 预期：2 行 PASS
```

**回退测试**：只回退 `gate-check.mjs` → 两条断言红（缺 implementer 会 proceed；class 不一致会 proceed）。

**风险**：已有的验证者报告没有该字段 → 首次运行会被拒。SKILL.md 注明「报告格式随 v1.2 变更」。

---

### C-07 `[P1]` 判据 3 的安装范围

**对应发现**：F-07

**改动**：`skills/harness-loop-init/SKILL.md:37` 改为「查项目内 `.claude/skills/`、`.agents/skills/` 与用户级 `~/.claude/skills`、`~/.agents/skills`；项目内优先」。与 `stage2.mjs:43-50` 一致。

**验收**：`grep -n "user-scope 安装不计入" skills/harness-loop-init/SKILL.md` 无输出。

---

### C-08 `[P1]` 工作队列单一真相源

**对应发现**：F-08、F-26

**问题**：模板 AGENTS.md 让 agent 从 `feature_list.json` 选工作，`/harness-loop` 让 agent 从 `STATE.md` High Priority 选。两条规则同时注入，agent 必选其一。

**改动**

| 文件 | 改动 |
|---|---|
| `templates/AGENTS.md`（及副本） | 启动工作流第 5 步改为「读 `STATE.md` 的 High Priority，取第一条未勾选」；必需工件表：`STATE.md` = 工作队列，`feature_list.json` = 完成状态与证据；删 `loop-constraints.md` 行（阶段 1 不生成），改为注「阶段 2 才有」 |
| `templates/STATE.md`（及副本） | `:11` 的 `loop-constraints.md` 改为 `harness-constraints.md`（阶段 1 只有这份） |

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep -E "AGENTS 模板.*工作队列|STATE 模板.*harness-constraints"
# 预期：2 行 PASS（新增断言）
```

---

### C-09 `[P1]` `harness-loop-issue` 的只读边界与两条做不到的指令

**对应发现**：F-11

**改动**

| 文件 | 改动 |
|---|---|
| `skills/harness-loop-issue/SKILL.md:40` | 「只读。本技能**不执行**任何写操作」→「对 GitHub 只读；本地只写 `STATE.md`，且只经 `state-write.mjs`」 |
| 同上 `:94-95` | 删「更新 `Last run`」与「追加一条 `loop-run-log.md`」——`state-write.mjs` 不含这两个能力，`state-commit.mjs` 在别的技能里（跨技能引用会断） |

**验收**

```bash
grep -n "Last run\|loop-run-log" skills/harness-loop-issue/SKILL.md   # 无输出
```

**备选**：给 `state-write.mjs` 加 `--last-run`（约 10 行 + 测试）。仅在确实需要发现轮次留痕时采用。

---

### C-10 `[P1]` `--run-id` 与中文 item 名冲突

**对应发现**：F-12

**问题**：`worktree.mjs:56` 只接受 `[A-Za-z0-9._-]`，而第 2 步允许 `/harness-loop 修复登录测试`；实测 `--run-id 修复登录测试-attempt1` 直接失败。

**改动**：`skills/harness-loop/SKILL.md` 第 3/4 步写明「run-id 用 ASCII slug：`<kebab-item>-attempt<N>`，如 `fix-login-attempt1`；work item 的人类可读名只出现在 `--item` 与状态文件」。

**验收**：新增断言——从 SKILL.md 代码块提取 `--run-id <...>` 示例，用 `validRunId` 校验（新增约 8 行测试）。

---

### C-11 `[P1]` 第 0 步的退出码表

**对应发现**：F-16

**改动**：`skills/harness-loop/SKILL.md` 第 0 步补 `exit 2`（`wip-limit` / 表损坏 → 修 `## Active` 后重跑，不得继续），并把 exit 码写成表格：`0 继续 / 1 参数错 / 2 升级 / 3 立即退出`。

**验收**：`grep -n "exit 2" skills/harness-loop/SKILL.md` 在第 0 步段内命中。

---

### C-12 `[P1]` README 与事实对齐

**对应发现**：F-24（自主性声明）、F-14、F-17

**改动**

| 位置 | 改动 |
|---|---|
| `README.md:3` | 「让连续运行自主」→「让 agent 围绕一个 work item 可靠地反复跑，直到升级给人」 |
| `README.md:244` | 演练命令改路径（C-05 已含） |
| `README.md:245` | 「阶段 1 出 7 文件、阶段 2 出 2 文件」→ 按 D-01 结果改为「阶段 1 出 7 文件、阶段 2 出 4 文件 + 1 份演练记录」 |

---

### C-13 `[P1]` 拒绝列表的真相源表述

**对应发现**：F-20

**改动**：`docs/03:38`、`docs/03:143` 的「`loop-constraints.md` 的拒绝列表」→「`harness-constraints.md` 的 `## Paths`（缺省回落 `loop-constraints.md`）」，与 `common.mjs:485-507` 一致。

---

### C-14 `[P1]` `docs/02` 的 `## Active` 表

**对应发现**：F-21

**改动**：`docs/02:52-57` 的表头与数据行改为三列（`Work item | 尝试 | 状态`），与模板一致。

---

### C-15 `[P1]` 约束加载确认语

**对应发现**：F-23

**改动**：`templates/harness-constraints.md:12`（及副本）改为 `Constraints loaded from harness-constraints.md (+ loop-constraints.md): N rules active.`；`docs/05:157` 同步。

---

### C-16 `[P2]` 上游引用更正

**对应发现**：F-27

**改动**：`README.md:39` 的 `lecture-02:100` → `lecture-04:100`（ETH Zurich 那段在 `docs/en/lectures/lecture-04-why-one-giant-instruction-file-fails/index.md:100`，已核实）。

---

### C-17 `[P2]` 副本漂移的机械检查（依赖 D-02）

**对应发现**：F-13

**问题**：实测给技能模板、技能脚本、根模板各加一行，707 条断言全绿——三处漂移都没有检查。

**改动**

| 选项 | 改动 |
|---|---|
| D-02 = A | 删根 `templates/`；`scripts/lib/common.mjs` 的 `TEMPLATE_DIR` 指向 `skills/harness-init/templates`，新增 `LOOP_TEMPLATE_DIR` 指向 `skills/harness-loop-init/templates`；`test.mjs:55`、`:206`、`:1117` 改用新路径 |
| D-02 = B | 保留根模板，新增断言：8 个模板文件与技能副本逐字节相同 |

**两种选项都加**：同名脚本副本一致性断言——对 `lib/common.mjs`（5 份）、`gate-check.mjs`（2 份）、`ledger-check.mjs`（2 份）、`harness-stage.mjs`（2 份）、`stage1.mjs`（2 份）、`stage-core.mjs`（2 份）做 sha256 相等校验。`common.mjs` 的 `PACK_ROOT` 是位置相对的（`SCRIPT_DIR/../..`），同一份代码在不同目录语义不同，这是设计而非漂移。

**验收**

```bash
node scripts/test.mjs --verbose 2>&1 | grep "副本逐字节一致"
# 预期：PASS
# 反向：给任一副本追加一行 → 该断言必须红
```

**回退测试**：先只加断言 → 当前全绿（副本当前一致），所以回退测试用「追加一行」的方式证明它有效，并在变更说明里记录。

---

### C-18 `[P2]` 删除 `gate-check` 的死分支

**对应发现**：F-22

**改动**：`gate-check.mjs:622` 的 `attempts + 1 >= cfg.maxAttempts` 恒为 false（`DEFAULTS` 无该键）→ 改为固定字符串 `'return to fix phase; append attempt to ledger first'`。`--attempts` 参数保留（输出兼容），但文档注明「尝试上限由 `ledger-check --item` 判定」。

**验收**：`node scripts/test.mjs 2>&1 | tail -3` 全绿；`grep -n "cfg.maxAttempts" skills/harness-loop/scripts/gate-check.mjs` 无输出。

---

### C-19 `[P2]` L2 与 worktree 的措辞

**对应发现**：F-25

**改动**：`docs/03:14` 的「在 worktree 中提出修复」标注为**建议做法**（无闸门强制），并说明 `worktree.mjs` 只负责生命周期与清理，不构成闸门。

---

### C-20 `[P2]` 合并闸门整节降级

**对应发现**：审计瘦身清单

**改动**：`docs/03:91-104` 的「6. 合并闸门」压缩为两行：默认不自动合并；允许列表文件不存在、无代码路径，启用前需另行设计。

---

## 4. 测试与断言变更总表

| 变更项 | 新增/修改断言 | 位置建议 |
|---|---|---|
| C-01 | 脏工作区 → `dirty-tree`；仅临时产物 → proceed；干净 → proceed | 闸门段（`test.mjs` §5 附近） |
| C-02 | `--append` 正常/缺 `--error`/账本不可读/`item_attempts` | 熔断段（§8 附近） |
| C-03 | 阶段 2 生成 `docs/04-safety.md` 且判据 6 可 PASS | 阶段 2 段（§17 附近） |
| C-04 | 模板标题下未包 code span → escalate | `state-write` / 形状闸段 |
| C-05 | 文档 `node` 命令指向真实文件 | 文档段（§12） |
| C-06 | 缺 `--implementer` → exit 1；change class 不一致 → escalate | 闸门证据段 |
| C-08 | 模板声明工作队列 = STATE.md | 模板完整性段（§9） |
| C-10 | SKILL.md 示例 run-id 通过 `validRunId` | 技能段（§10） |
| C-17 | 同名副本 sha256 一致 | 技能完整性段（§10） |
| C-03(选 A) | **删除** U-06 漂移断言（`test.mjs:2108-2122`） | 需在变更说明中写明理由 |

**计数**：新增约 15 条断言、删除 1 条（仅 D-01=A）。断言总数不再写进任何文档（C-05）。

---

## 5. 文档同步矩阵（改一处必须看另一处）

| 事实 | 唯一真相源 | 必须同步的位置 |
|---|---|---|
| 闸门名与顺序 | `gate-check.mjs` 的 `GATE_ORDER` | `README.md` 闸门表、`docs/03` 列表与优先级、`docs/08` 计数、`docs/09`（若引用） |
| 阶段 1 产物 | `stage1.mjs` 的 `STAGE1_FILES` + 生成的 `init.sh` | `harness-init/SKILL.md`、`README.md:16/99`、`templates/AGENTS.md` |
| 阶段 2 产物 | `stage2.mjs` 的 `STAGE2_FILES` + `upgradeStage2` | `harness-loop-init/SKILL.md`、`README.md:17/100/245`、`docs/03:226` |
| 拒绝列表 | `templates/harness-constraints.md` 的 `## Paths` | `docs/04-safety.md`（消费方）、`stage2.mjs` 的 `TEMPLATE_DENYLIST`（20 条，需加断言） |
| 验证者报告格式 | `templates/verifier-report.md` | `harness-loop/SKILL.md` 第 4 步、`gate-check.mjs` 的正则、`drill-check.mjs` 的 canary 夹具 |
| 约束加载确认语 | `harness-loop/SKILL.md` | `templates/harness-constraints.md`、`docs/05` |
| 断言数 | **不写** | 删除所有硬编码数字 |

**新增断言（建议并入 C-17）**：`stage2.mjs` 的 `TEMPLATE_DENYLIST` 必须与 `templates/harness-constraints.md` 的 `## Paths` 逐条一致——目前是两份手抄清单，实测漂移不会红。

---

## 6. 完成定义（整批）

- [ ] §1 三个决策已填。
- [ ] B1 的 5 项全部验收通过，且每项的回退测试都验证过（记录命令与输出）。
- [ ] `bash init.sh` 全绿，输出贴进变更说明。
- [ ] 技能内相对 import 仍自解析（现有断言）。
- [ ] 文档里每条 `node ...` 命令都有对应文件（C-05 断言）。
- [ ] 临时仓库端到端：阶段 1 `--require` exit 2（占位 feature 未换）→ 换掉后 exit 0；阶段 2 补齐后 exit 0。
- [ ] 临时仓库跑一轮 `/harness-loop` 的手工冒烟：提交 → 验证 → gate → 账本出现 1 条 → `clean-state` exit 0。
- [ ] 未跑的检查在变更说明里显式列为 NOT RUN。
- [ ] 删除或归档 `spec-plan/`。

---

## 7. 风险与回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 流程变更（必须先提交、熔断前置） | 已有用户按旧流程会被拦 | SKILL.md 顶部加版本说明；`dirty-tree` 的 `next` 字段给出可直接照抄的命令 |
| R2 闸门数 10 → 11 | 外部引用者与 `docs/08` 计数断言 | 一次提交内同步四处；测试会拦住漏改 |
| R3 `--implementer` 变必填 | 旧调用方 exit 1 | 帮助文本与 SKILL.md 同步；错误信息给出完整命令 |
| R4 阶段 2 生成 `docs/04-safety.md` | 用户仓库多一个文件 | 仅缺失时写；已存在则 skipped |
| R5 删根 `templates/`（D-02=A） | `TEMPLATE_DIR` 语义变化 | 单独提交；`test.mjs` 的模板断言是安全网 |
| R6 断言数变化 | 文档数字再次漂移 | C-05 删除所有硬编码数字，从根上消除 |

**整体回退**：每项一个独立 commit，按 `git revert <sha>` 回退；C-02 的流程重排与 C-01 的提交要求互相独立，可分别回退。

---

## 8. 不在范围

- 不新增调度器、事件接线、cron、守护进程。
- 不实现 L3 / 无人值守。
- 不实现自动合并（含 `loop-auto-merge-allowlist.md`）。
- 不重写 `gate-check` 的判定逻辑（仅 C-01/C-04/C-06/C-18 列出的改动）。
- 不改 worktree 生命周期语义。
- 不改 `docs/09-case-magpie.md`。
- 不实现 LESSONS 自动棘轮（README 已声明靠人工）。
- 不改变技能的目录结构与自包含规则。
- 不处理 `docs/archive/` 下的历史文档。

---

## 附录 A：发现索引

| ID | 级别 | 一句话 | 证据 |
|---|---|---|---|
| F-01 | P0 | 未提交时 diff 清单为空，denylist/scope 空转 | `harness-loop/SKILL.md:151`；实测 proceed |
| F-02 | P0 | 判据 6 依赖装配器不生成的文件，阶段 2 不可达 | `harness-loop-init/SKILL.md:40`；`stage2.mjs:142`；实测 exit 2 |
| F-03 | P0 | `untrusted-shape` 按精确标题切分，出厂模板带括号 | `gate-check.mjs:245`；`templates/STATE.md:8`；实测 proceed |
| F-04 | P0 | 账本无写入入口 | `harness-loop/SKILL.md:132`；全仓无写函数 |
| F-05 | P0 | `REJECT` 回第 3 步，绕过第 5 步熔断 | `harness-loop/SKILL.md:128` |
| F-06 | P0 | AGENTS.md 两条装配命令指向不存在的文件 | `AGENTS.md:84/96`；实测 MODULE_NOT_FOUND |
| F-07 | P1 | 判据 3 声称只查项目内，脚本也查用户级 | `harness-loop-init/SKILL.md:37` vs `stage2.mjs:49` |
| F-08 | P1 | 工作队列两套规则（feature_list vs STATE.md） | `templates/AGENTS.md:15` vs `harness-loop/SKILL.md:63` |
| F-09 | P1 | 报告模板承诺闸门不读的字段 | `templates/verifier-report.md:5/13/15` |
| F-10 | P1 | `--implementer` 可省，独立性不判 | `gate-check.mjs:495` |
| F-11 | P1 | 「只读」与本地写入矛盾；两条指令无脚本支持 | `harness-loop-issue/SKILL.md:40/94/95` |
| F-12 | P1 | `--run-id` 拒绝中文，item 名允许中文 | `worktree.mjs:56`；实测报错 |
| F-13 | P1 | 多副本漂移无机械检查；708 与实测 707 | `AGENTS.md:14/64`；实测三处漂移不红 |
| F-14 | P1 | README 演练命令不可运行 | `README.md:244`；实测 MODULE_NOT_FOUND |
| F-15 | P1 | 第 7 步在 worktree 内写状态；第 6 步 `--state` 读 worktree 旧副本 | `harness-loop/SKILL.md:227`、`:36` |
| F-16 | P1 | 第 0 步未定义 exit 2 | `harness-loop/SKILL.md:38`；实测 wip-limit exit 2 |
| F-17 | P2 | 阶段 2 产物数写成 2，实测 3+1 | `harness-loop-init/SKILL.md:53` |
| F-18 | P2 | 断言数 708 vs 707 | `AGENTS.md:64` |
| F-19 | P2 | 死条目：`SKILL_BUNDLES`、`node skills/*/SKILL.md`、产物表述矛盾 | `AGENTS.md:65/83/103` |
| F-20 | P2 | docs/03 说拒绝列表在 loop-constraints.md | `docs/03:38/143` |
| F-21 | P2 | docs/02 的 Active 表与模板列数不同 | `docs/02:54` |
| F-22 | P2 | `attempts + 1 >= cfg.maxAttempts` 恒 false | `gate-check.mjs:622` |
| F-23 | P2 | 约束加载确认语三种写法 | `harness-loop/SKILL.md:49`、`templates/harness-constraints.md:12`、`docs/05:157` |
| F-24 | P2 | README 首句「连续运行自主」超出能力 | `README.md:3` vs `:43` |
| F-25 | P2 | L2 宣称 worktree，无闸门强制 | `docs/03:14` |
| F-26 | P2 | 阶段 1 模板引用阶段 2 才有的文件 | `templates/AGENTS.md:37`、`templates/STATE.md:11` |
| F-27 | P2 | ETH Zurich 引用行号错位 | `README.md:39` → 应为 `lecture-04:100` |

**F-15b（审计后补充，推断）**：第 6 步 `--state .` 在 worktree 内执行时读的是 worktree 的 `STATE.md`（`gate-check.mjs:103-118`），主检出里新写的 `loop-pause-all` 不会出现在 worktree 副本中，kill switch 在该阶段不可见。随 C-01 一并修。

---

## 附录 B：术语（本 spec 内）

| 词 | 含义 |
|---|---|
| 闸门 / gate | `gate-check.mjs` 的 11 个判定点之一，先命中者决定结果 |
| 熔断 / breaker | `ledger-check.mjs` 基于账本的判定，与闸门分开 |
| 尝试 / attempt | 账本里该 item 的一条记录；上限 3 由 `--item` 判定 |
| 回退测试 / backtest | 只回退实现、保留断言，断言必须红 |
| 临时产物 | `changed-files.txt`、`verifier-report.md`，不入库、被 `dirty-tree` 豁免 |
