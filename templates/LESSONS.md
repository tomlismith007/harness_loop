# LESSONS.md

> 错题本。**由 `/harness-loop` 在本轮发生返工时写入，由之后干活的 agent 读取。**
> 每一条都必须能执行、有证据。写不进证据的观察不记。
>
> 升级规则：同一条教训在 **3 个不同日期**的复盘里出现 → 转正进 `loop-constraints.md`
> 或 `AGENTS.md` 的硬约束区，从「经验」变成「硬规则」，之后每个 PR 审查逐条对。

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

<!-- 示例（装配后删除）：
Reproduce the reporter's exact case, on the surface they use, before you call it fixed.
834 came back 4 times (v0.1.920 → .925 → .931 → .938). Each round fixed only the agent in the screenshot.
Seen 1× (2026-10-05).
Evidence: #834, v0.1.920/.925/.931/.938
-->

---

## Done right

<!-- 做对的事情也记。agent 读到的除了"别这样"，还有"照这个来"。 -->

<!-- 示例（装配后删除）：
Refused to merge the PR that added a third-party relay into the product surface, and replied with the standard template instead.
The product boundary held; no rework needed.
Seen 1× (2026-10-07).
Evidence: #1204
-->

---

## Promoted to hard rules

<!-- 已转正进 loop-constraints.md / AGENTS.md 的教训。保留在此作为出处记录。 -->

| 规则 | 转正日期 | 曾出现次数 | 证据 | 现在的位置 |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Run log

<!-- 每次返工追加一行：哪一轮、发生了什么、记了哪条教训。 -->

| 日期 | Work item | 返工原因 | 记了哪条 |
|---|---|---|---|
| — | — | — | — |
