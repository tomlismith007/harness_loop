# Loop Budget

> `loop-budget` 技能在**每轮开始和结束**检查本文件与 `loop-run-log.md` 的实际花费。
> 超预算不是"再试一次"的理由，是降级或退出的触发条件。

## Daily Limits

| 循环 | 最大运行/天 | 最大 token/天 | 最大子智能体/轮 |
|---|---|---|---|
| Issue Intake | 12 | 80k | 0 (L1) / 1 (L2) |
| PR Review Triage | 96 | 300k | 0 (L1) / 2 (L2) |
| CI Sweeper | 96 | 500k | 3 |
| Merge Gate | 48 | 100k | 1 |
| Post-Merge Cleanup | 1 | 200k | 2 |
| Release Drafter | 1 | 100k | 1 |
| daily-triage | 1 | 50k | 0 |
| lesson-harvest | 1 | 60k | 0 |
| signal-gatekeeper | — | 30k | 0 |

**行名的第一列是被代码消费的，不是给人看的标签。** `scripts/budget-check.mjs` 的
`--pattern <id>` 按这一列查上限；查不到时返回 `cap: null`，而 `decide()` 对无上限的
行为是**退出**（没有上限就没有刹车，不能静默放行）。

- 自然写法（`Issue Intake`）与连字符写法（`issue-intake`）都认：`parseBudgetCaps`
  同时按两种形态建索引，所以**表里每一行都必须能对上 `LOOP.md` 注册的一个循环**。
- `test.mjs` 第 21 节有一条断言逐行核对这件事：在 `LOOP.md` 注册了循环却没有
  对应预算行 → 测试变红。这是"新增循环忘了配预算"的机械防线。
- `daily-triage` / `lesson-harvest` / `signal-gatekeeper` 不在事件脊上
  （见 `LOOP.md` 的"非事件驱动循环"），但同样消耗 token，所以同样需要上限——
  在此之前它们没有任何预算入口。

上限值以 `patterns/registry.yaml` 的 `suggested_daily_cap` 为准，两处不一致时
按本节的值执行（本节是 `budget-check.mjs` 实际读的那份）。

## Thresholds

| 花费 | 动作 |
|---|---|
| < 80% 日上限 | 正常运行 |
| ≥ 80% 日上限 | **report-only 模式**：不派发执行子智能体，不自动修复，只写报告 |
| ≥ 100% 日上限 | **立即退出**：不派发任何子智能体，在 `STATE.md` 写一行 |
| `loop-pause-all` 生效 | **立即退出**，不做任何动作 |
| 无待办事项 | **<5k token 内退出**，不生成子智能体 |

## 空转成本参考

用于判断某个节奏是否值得：

| 场景 | token 量级 |
|---|---|
| 空转退出（无待办） | ~3–5k |
| 只报告一轮 | ~30–80k |
| 含执行者 + 验证者一轮 | ~150–300k |

高节奏循环（CI Sweeper、PR Review Triage）**必须**在无待办时提前退出，否则 15 分钟一次的空转一天就是 96 次 × 5k = 480k 纯浪费。

## On Budget Exceed

1. 暂停调度器 / 禁用高节奏 workflow。
2. 在 `loop-run-log.md` 追加一条事件记录。
3. 在 `STATE.md` 的 High Priority 写一条，通知人工。
4. 不要通过放宽阈值来"继续跑"。

## Kill Switch

- 标志：`loop-pause-all`（issue 标签，或 `STATE.md` 中的标志）
- 恢复：仅在 `STATE.md` 中清除该标志后，人工重启调度器。

## Estimate

```bash
# 估算某模式的成本（若已安装参考工具）
npx @cobusgreyling/loop-cost --pattern ci-sweeper --level L2

# 本地查账本与运行日志
node scripts/ledger-check.mjs --ledger loop-ledger.json
node scripts/loop-audit.mjs . --json
```

## Alerts This Period

<!-- 自我限流时在此追加一行：日期 + 原因 + 采取的动作 -->

—
