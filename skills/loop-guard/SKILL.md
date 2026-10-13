---
name: loop-guard
description: >-
  Circuit breaker for loop retry storms. Maintains loop-ledger.json, detects stagnation
  (same error repeated), no-progress (consecutive failures), token-budget overrun, and
  max-iterations. Returns exit code 2 to force escalation to a human instead of another
  retry. Use before every retry attempt in a fix loop.
license: MIT
user_invocable: true
---

# Loop Guard — 熔断器

**升级是功能，不是失败。** 这个技能的职责是在循环变成无效重试之前把它停住。

## 账本结构

`loop-ledger.json`：

```json
{
  "goal": "<本循环要达成什么>",
  "pattern": "<pattern-id>",
  "level": "<L1|L2|L3>",
  "attempts": [
    {
      "iteration": 1,
      "item": "<work-item-id>",
      "action": "<做了什么>",
      "outcome": "failure | success | noop",
      "error": "<失败时必填>",
      "tokensUsed": 1800,
      "at": "<ISO8601>"
    }
  ]
}
```

**失败时 `error` 必填** —— 熔断器靠它检测重复失败。没有 `error` 的失败记录会让 stagnation 检测失效。

## 每次迭代前

1. 把上一次尝试追加到 `loop-ledger.json`。
2. 跑熔断检查：

```bash
node scripts/ledger-check.mjs --ledger loop-ledger.json
```

3. 按退出码行动：

| 退出码 | 含义 | 动作 |
|---|---|---|
| `0` | 继续 | 可以重试，必要时用 `--inject` 裁剪下一轮提示词 |
| `2` | 停止 | **不再重试**，写升级条目，退出循环 |

## 阈值

| 类型 | 默认 | 说明 |
|---|---|---|
| `stagnation` | 3 | 同一错误签名出现 3 次 |
| `no-progress` | 5 | 连续失败 5 次 |
| `max-iterations` | 10 | 总迭代上限 |
| `token-budget` | 显式传入或从 pattern 推导 | 超预算 |

检查顺序（先报最具体可行动的）：stagnation → no-progress → token-budget → max-iterations。

可用参数覆盖：

```bash
node scripts/ledger-check.mjs --ledger loop-ledger.json \
  --stagnation 3 --no-progress 5 --max-iterations 10 --token-budget 50000
```

## 错误签名归一化

比较前抹掉：ISO 时间戳、十六进制地址、路径（折叠为 basename）、行列号、其余数字。

这样以下两条会被识别为**同一个错误**：

```
TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:42
TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:87
```

**为什么重要**：如果第 2、3 次尝试的错误文本与第 1 次归一化后相同，说明根本没有触及根因。此时继续重试是纯浪费。

## 升级时的动作

```bash
# 生成升级说明
node scripts/ledger-check.mjs --ledger loop-ledger.json --escalation > escalation.md
```

然后：

1. 写入 `STATE.md` 的 `## High Priority (loop is acting or waiting on human)`
2. 通过连接器通知人工（Slack / issue 评论）
3. 退出循环

**升级必须走推送通道。** 只写进状态文件而没人读，等于没升级。

## 规则

- **绝不为了继续循环而放宽阈值。** 这是最容易被违反、后果最严重的一条。
- **绝不编辑账本来隐藏重复错误。**
- 达到上限时，把**完整上下文**写进升级条目：目标、尝试过的方案、每次的错误、建议人工看什么。
- 熔断触发后，同一 work item 在本轮不得再次尝试。人工处理后才重置。

## 与其他技能的交互

| 技能 | 关系 |
|---|---|
| `harness-loop` | 在流程第 7 步调用本技能 |
| `minimal-fix` | 每次尝试后必须追加账本 |
| `loop-verifier` | verifier REJECT 也计为一次失败尝试 |
| `loop-budget` | token-budget 阈值与日上限联动 |
