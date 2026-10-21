# LESSONS.md

> 错题本。**由 agent 在夜审循环中自己写入，由白天干活的 agent 读取。**
> 每一条都必须能执行、有证据。写不进证据的观察不记。
>
> 升级规则：同一条教训在 **3 个不同日期**的复盘里出现 → 转正进 `loop-constraints.md`
> 或 `AGENTS.md` 的硬约束区，从「经验」变成「硬规则」，之后每个 PR 审查逐条对。
>
> 机制说明见 `docs/09-case-magpie.md`。

---

## 格式

每条记录四个部分，缺一不可：

```
<一句可执行的规则>
<为什么——具体发生了什么，避免泛泛而谈>
Seen N× (日期, 日期, 日期)
Evidence: <commit / issue / PR 号>
```

- **规则**必须是操作级指令，不是原则。反例：「要注意测试」；正例：「用报告者那个界面复现」。
- **原因**要写出具体的返工模式，让人理解为什么需要这条。
- **`Seen N×`** 是升级判定的支点。第一次出现只记，第三次出现才转正。
- **Evidence** 挂 commit 或 issue 号。没有证据的观察不记。

---

## Rules

<!-- 尚未转正的经验。每条挂证据与出现次数。 -->

**改「路径 / 落盘位置」的脚本，测试必须断言实际写入的目录，不能只看退出码。**
原因：`install-skills.mjs` 只写 `.zcode`，`--layout agents` 被静默忽略——退出码 0、
输出像成功，技能全落到错的地方。只断言退出码的测试一直是绿的。
Seen 1× (2026-10-14)
Evidence: `scripts/install-skills.mjs` 的 `--layout` 修复；红检 10 项断言失败

**安装路径与审计扫描路径必须来自同一个真相源。**
原因：安装写 `.zcode/skills`，审计的 `SKILL_DIRS` 只扫 `.claude/.codex/.grok`，
两边认知不一致 → 装成功也报 `0 found`；且 `level=L2` 依赖 `verifierPresent`，
导致 L2 永远不可达。绿色安装看起来像失败安装。
Seen 1× (2026-10-14)
Evidence: `scripts/lib/common.mjs` 的 `SKILL_DIRS`；目标仓库审计 7/100 → 43/100

**不要用「写状态」代替「跑过」。审计把 `Last run` 时间戳与 `run_id` 条目当作循环运行过的证据。**
原因：本轮人工维护后把 `STATE.md` 的 `Last run: never` 改成日期，审计从 94/L2 跳到 98/L3，
但没有任何循环运行。这属于伪造活动证据——框架刻意区分「结构性就绪」与「真的跑过」，
写进去等于绕过这个区分。
Seen 1× (2026-10-14)
Evidence: 实测 `Last run: never` → 日期即触发；仅加一条 `run_id` 也触发（目录几乎为空仍 PASS）

**归因一个差异之前，必须把对照的另一半也真的跑掉；只跑一半的观测不能用来定位原因。**
原因：审查报告把 P1-07 从「设计取舍」升格为「安全绕过」时，只跑了「裸路径 `--diff-files auth/login.ts` → proceed」，
**没有同时跑「同一路径加 `@`」**。第三轮复核重跑四种参数排列，全部 `escalate / denylist`——原结论复现不出。
真正的触发条件是「对多行清单文件忘记 `@`」（`--diff-files big.txt` → `proceed, files_changed: 1`），
同一个根因、不同触发条件。**差异必须来自被测变量，而"只跑一个对照"无法排除其它变量。**
这与已记录的 D3（两个对照结果相同、实为 fixture 缺失造成的噪声）是同一个病的两种形态。
Seen 1× (2026-10-16)
Evidence: `gate-check` 四种参数排列实跑（2026-10-16；原始审查报告已删除）

**文档里的示例命令必须被至少一条断言覆盖，否则它和代码的漂移没有任何东西能发现。**
原因：`/harness-loop` 第 0 步写着 `--state STATE.md`，而脚本把该参数当目录——kill switch 在文档命令里静默失效；第 5 步只跑 `--phase fix`，证据/sha/回退测试三道闸永不触发。两处都不是实现错，是文档与代码各按自己的理解写，335 条断言没有一条读它们。
Seen 1× (2026-10-19)
Evidence: REPAIR-SPEC.md P1-1、P1-2；test.mjs 新增 `--state STATE.md` 与 `--phase gate` 断言

**断言的分叉判据要绑能力，不要绑平台名。**
原因：`test.mjs` 的孙进程断言依赖 GNU `timeout`，报告写「原生 Windows → 978/1」。
实测原生 `powershell.exe` 下是 **979/0**——Git 的 `/usr/bin` 在 PATH 上时解析到 GNU coreutils，
`hasGnuTimeout()` 为真。只有把 `system32` 排到 Git 之前才复现 978/1。
按 `process.platform === 'win32'` 分叉会得到一个**在开发机上恒绿的假断言**。
判据要绑 `hasGnuTimeout()` 的返回值。
Seen 1× (2026-10-16)
Evidence: 两种 PATH 顺序实跑对照（2026-10-16；原始审查报告已删除）

**"修复"之前先复现；审计报告里的"已证实"也可能已经过期。**
原因：2026-10-21 的审查报告列了 33 条发现，逐条复现后发现 H-04（`--verify`）、H-23（死引用）、
H-30（本地化判据）、H-33（STATE 矛盾）在当前 HEAD 已被上一轮修掉——报告基于 `3211d09`，
而 main 已合并了 REPAIR-SPEC 批次。直接按报告改会重复劳动，甚至改坏已修好的地方。
Seen 1× (2026-10-21)
Evidence: 逐条复现记录见 STATE.md「Watch List」；`grep -rn -- '--verify'` 在当前 HEAD 零命中

**要求"所有人"的证据的闸门，会训练出伪造证据的习惯。**
原因：`red-check` 对任何改动都要求 `--red-check pass`，于是改一个错别字只有两条路：
escalate，或谎报 pass（而闸门接受）。闸门越严，绕过越多，而绕过的习惯会迁移到代码改动上。
正确的做法是给"不需要测试"一条**有成本但诚实**的路（声明 change-class + 书面理由），
而不是假装它不存在。
Seen 1× (2026-10-21)
Evidence: REPAIR 前的 gate-check `red-check` 分支；修复后 `--change-class docs` 需 ≥20 字理由

**状态源有两个时，闸门读的必须是那个"别人不能改"的。**
原因：尝试次数同时存在于 `loop-ledger.json` 与 `--attempts` 参数。闸门读参数，
于是账本 5 次失败 + `--attempts 1` → proceed，熔断器与闸门对同一事实给出相反结论。
把判定移进 `ledger-check --item`（唯一读账本的地方）后，两个脚本各管一类事实。
Seen 1× (2026-10-21)
Evidence: 修复前实测 `ledger-check → stagnation EXIT=2` 同时 `gate-check → proceed EXIT=0`

**做回退测试时不要用 `git checkout <file>` 还原——它会连本轮所有改动一起丢掉。**
原因：为验证"断言会在旧代码上变红"，我临时改了 README/AGENTS 再 `git checkout` 还原，
结果把本轮尚未提交的全部改动一起回滚了（README 的闸门表、硬约束、声明全部退回旧版），
只能手工重建。正确做法是 `cp` 到 /tmp 备份、改、跑测试、`cp` 回来。
Seen 1× (2026-10-21)
Evidence: 本轮 README/AGENTS 被整体回滚后重建；test.mjs 从 604 掉回 569 又恢复

---

## Done right

<!-- 做对的事情也记。agent 读到的除了"别这样"，还有"照这个来"。 -->

—

---

## Promoted to hard rules

<!-- 已转正进 loop-constraints.md / AGENTS.md 的教训。保留在此作为出处记录。 -->

| 规则 | 转正日期 | 曾出现次数 | 证据 | 现在的位置 |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Nightly review log

<!-- 每次夜审追加一行：扫了多少 commit、发现几条、转正几条、跳过什么。 -->

| 日期 | Commits 扫描 | 新增教训 | 转正 | 备注 |
|---|---|---|---|---|
| — | — | — | — | — |
