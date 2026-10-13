# LESSONS.md

> 错题本。**由 agent 在夜审循环中自己写入，由白天干活的 agent 读取。**
> 每一条都必须能执行、有证据。写不进证据的观察不记。
>
> 升级规则：同一条教训在 **3 个不同日期**的复盘里出现 → 转正进 `loop-constraints.md`
> 或 `AGENTS.md` 的硬约束区，从「经验」变成「硬规则」，之后每个 PR 审查逐条对。
>
> 机制说明见 `docs/09-case-magpie.md` 与 `skills/lesson-harvest/SKILL.md`。

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
