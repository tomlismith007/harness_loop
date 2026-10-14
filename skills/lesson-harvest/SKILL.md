---
name: lesson-harvest
description: >-
  Nightly review loop that reads the day's commits and harvests lessons into LESSONS.md:
  what was fixed then reworked, what should never have merged, what verification was too
  thin. Counts recurrence with Seen N× and promotes lessons seen 3 times into hard rules.
  Use on a nightly schedule, not per-event.
license: MIT
user_invocable: true
stage: 3
---

# Lesson Harvest — 夜审循环

**这套机制的目的**：让经验从「笔记」变成「规则」，但只在它确实是系统性问题时才转正。

没有这个循环，每一轮的复盘都是覆盖式的——填完就没了，同一个错误下周再犯一次，没人记得。

## 为什么需要「延迟提升」

一条教训第一次出现时不够格成为规则——可能是一次性的偶发。出现 3 次才说明它是系统性的。

这个设计同时避免两种错误：

- **过早立规矩**：一次偶发变成制度，规则库被噪声污染
- **从不立规矩**：经验永远停在笔记里，没人执行

**`Seen N×` 这一行是机制的支点。** 没有它，就无法机械判定何时该提升。

## 触发

定时，每天一次，非高峰时段。**不是事件驱动**——它需要看到完整的一天。

```yaml
on:
  schedule:
    - cron: '0 3 * * *'   # 每天凌晨 3 点
```

## 流程

### 第 1 步：取当天全部 commit

```bash
# 昨天的 commit（不要只看 PR——直接提交也要看）
git log --since="24 hours ago" --pretty=format:"%h %ad %s" --date=short
```

同时取当天的 PR 合并记录与 issue 关闭记录。

### 第 2 步：扫三个场景

只关注这三类，不要试图总结一切：

| 场景 | 怎么识别 |
|---|---|
| **修完又返工** | 同一个 issue 被多次修复（多个 commit 引用同一编号）；同一文件在短期内被反复改；issue 被 reopen |
| **压根不该合** | 合并后又被 revert；合并后立刻被后续 commit 修正；触发了回滚 |
| **验证太糙** | PR 评论里出现 "not run"；测试在合并后才被发现挂掉；没有证据就宣称完成 |

**识别返工的机械信号**：

```bash
# 同一 issue 号在多个 commit 里出现 = 返工信号
git log --since="7 days ago" --pretty=format:"%s" | grep -oE '#[0-9]+' | sort | uniq -c | sort -rn | head -20
```

出现次数 ≥ 2 的 issue 编号，逐个查：是不是同一问题被修了多次？

### 第 3 步：写进 LESSONS.md

每条四个部分，缺一不可：

```
<一句可执行的规则>
<为什么——具体发生了什么>
Seen N× (日期列表)
Evidence: <commit / issue / PR>
```

**规则必须是操作级指令。** 对照：

| ❌ 不可执行 | ✅ 可执行 |
|---|---|
| 要注意测试 | 用报告者那个界面复现他的具体案例 |
| 代码质量要提高 | 同类 bug 必须一起修掉，不要分多次 PR |
| 验证要充分 | 改厂商接入必须用真账号真配置实测 |
| 及时修复 | main 上挂掉的测试就是马上要修的 bug |

**没有证据的观察不记。** 挂不上 commit 或 issue 号的，说明你无法指出具体发生了什么——那就是猜测，不是教训。

### 第 4 步：更新 `Seen N×`

对每条已有教训，检查今天是否又出现：

- 出现 → `Seen N+1×`，追加今天的日期
- 没出现 → 不动

### 第 5 步：判定转正

**同一条教训在 3 个不同日期的复盘里出现 → 转正。**

转正动作：

1. 把规则写进 `loop-constraints.md` 的对应章节（或 `AGENTS.md` 的硬约束区）
2. 在 `LESSONS.md` 的 `## Promoted to hard rules` 表里记录：规则、转正日期、曾出现次数、证据、现在的位置
3. 从 `## Rules` 区移除（避免重复维护）
4. 确认下游已读取：`loop-verifier` 与 `minimal-fix` 的检查项要包含新规则

**转正后，每个 PR 审查都要逐条对。** 这是「经验」和「硬规则」的分界。

### 第 6 步：记录 Done right

**只记录失败会训练出回避行为**——agent 变得不敢做决定。同时记录成功案例，给出正例锚点。

做对的事也标 `Seen N×`，同样可以转正。

### 第 7 步：写夜审日志

在 `LESSONS.md` 的 `## Nightly review log` 追加一行：扫了多少 commit、新增几条、转正几条、跳过了什么。

然后追加 `loop-run-log.md`：

```json
{"run_id":"<ISO8601>","pattern":"lesson-harvest","event":"schedule","item":"nightly","level":"L1","items_found":3,"actions_taken":1,"escalations":0,"tokens_estimate":40000,"outcome":"report-only"}
```

## 输出格式

```markdown
## Nightly Review — <日期>

### Scanned
- Commits: <n>
- Merged PRs: <n>
- Closed issues: <n>

### Rework detected
| Issue | Times fixed | Versions/commits | Pattern |
|---|---|---|---|
| #834 | 4 | v0.1.920→.925→.931→.938 | each round fixed only the agent in the screenshot |

### Should not have merged
| PR | What happened |
|---|---|
| #1204 | reverted 6h later — added third-party relay to product surface |

### Thin verification
| PR | Signal |
|---|---|
| #1339 | "Not run" on real-device check |

### Lessons added
1. `<规则>` — Seen 1× (<日期>) — Evidence: #834

### Promoted this run
- `<规则>` → loop-constraints.md (Seen 3×: 10-05, 10-06, 10-07)

### Done right
- `<做对的事>` — Seen 1×

### Skipped
- <看过但判断不值得记的，一句话原因>
```

## 规则

- **只记有证据的。** 挂不上 commit/issue 号的不记。
- **规则必须可执行。** 「要注意 X」不是规则，「在做 Y 之前先做 Z」才是。
- **不要一次记太多。** 一晚超过 5 条通常意味着扫描目标太宽——回到三个场景，不要总结一切。
- **不要提前转正。** `Seen 1×` 就是 `Seen 1×`。凑数转正会污染硬规则库。
- **不要跳过 Done right。** 只记失败会让 agent 变得保守。
- **转正后必须同步下游。** 规则进了约束文件但 verifier 没读，等于没转正。

## 与其他技能的关系

| 技能 | 关系 |
|---|---|
| `post-merge-cleanup` | 也产出教训素材——它发现的技术债往往是「不该合」的证据 |
| `loop-verifier` | 转正后的规则成为它的检查项 |
| `minimal-fix` | 转正后的规则约束它的实现方式 |
| `loop-constraints` | 转正的目标位置；每轮加载，因此新规则立即生效 |
| `harness-loop` | 夜审是独立循环，不在事件脊上（它需要完整的一天，不是单个事件） |
