---
name: signal-gatekeeper
description: >-
  Cheap pre-filter that decides whether an incoming signal (social post, issue, PR, CI
  failure) is relevant and worth entering an expensive loop. Runs on a low-cost model
  before the expensive loop sees anything. Use in front of any high-noise source so
  irrelevant items are dropped without being forwarded.
license: MIT
user_invocable: true
stage: 3
---

# Signal Gatekeeper — 成本分层门卫

在昂贵循环**之前**放一层廉价判断。不相关的信号直接丢弃，不转发。

**为什么需要**：这是唯一能大规模降低 token 成本的架构手段。比调阈值、降频率、缩短提示词都有效——因为它减少的是**进入昂贵流程的条目数**，而不只是每条的成本。

## 核心原则

```
廉价模型判断相关性  →  不相关：丢弃，不转发
                    →  相关：才送进昂贵循环
```

**「不要把内容转发给你」** —— 门卫的输出必须是**判断结果 + 摘要**，不是原始内容。转发原文等于没省钱。

## 输入

- 原始信号（推文、issue 正文、PR diff、CI 日志）
- 相关性判据（什么算「与本项目相关」）
- 价值判据（什么算「值得行动」）

## 输出格式

```markdown
## Gatekeeper Verdict: RELEVANT | IRRELEVANT | UNCERTAIN

### Signal
- Source: <twitter | github | discord | ci>
- Ref: <url 或 id>
- One-line: <不超过 20 字的摘要>

### Why
<一句话说明判断依据>

### If RELEVANT
- Category: bug-report | feature-request | question | noise
- Reproducible: yes | no | unknown
- Suggested loop: <issue-triage | ci-triage | none>
- Payload for the expensive loop: <提炼后的最小信息，不含原文全文>
```

## 三态判定

| 判定 | 含义 | 动作 |
|---|---|---|
| `RELEVANT` | 与本项目相关且可能有价值 | 提炼后送进循环 |
| `IRRELEVANT` | 不相关，或明确无价值 | **丢弃，不转发** |
| `UNCERTAIN` | 判断不了 | 默认丢弃；只有高价值来源才升级给人 |

**默认丢弃，不是默认转发。** 门卫的价值在于挡住噪声；宁可漏掉一条低价值信号，也不要让噪声淹没昂贵循环。

## 相关性判据（按项目定制）

判断「是否与本项目相关」时，注意区分：

| 相关 | 不相关 |
|---|---|
| 提到项目名且有实质内容 | 只是恰好同名的词 |
| 报告具体行为或错误 | 泛泛的行业评论 |
| 提问具体用法 | 纯转发/宣传 |
| 提供可复现步骤 | 只有情绪没有信息 |
| 第三方集成请求（需判断边界） | 广告/引流 |

**特别处理**：第三方中转站、代理商、推广类内容。这类不进入修复循环，用统一话术回复。**不要因为对方热情就把第三方服务直接加进产品**——这是产品边界问题，不是技术问题。

## 价值判据

即使是相关的信号，也不都要行动：

| 值得 | 不值得 |
|---|---|
| 真实可复现的 bug | 无法复现的猜测 |
| 明确的功能请求且符合产品方向 | 与产品方向冲突的请求 |
| 安全问题 | 风格偏好 |
| 影响多用户的缺陷 | 单用户环境问题 |

## 成本对照

用于判断门卫是否值得：

| 场景 | 无门卫 | 有门卫 |
|---|---|---|
| 100 条信号，5 条相关 | 100 条全进昂贵循环 | 100 条过廉价判断，5 条进昂贵循环 |
| 假设每条昂贵处理 50k token | 5,000k | 100×1k（判断）+ 5×50k = 350k |
| 节省 | — | **约 93%** |

**门卫本身的成本必须远低于它挡下的成本。** 若门卫判断一条信号要 10k token，它就失去了意义。目标是每条判断在 1k token 量级。

## 规则

- **门卫只用廉价模型。** 用昂贵模型做门卫等于没做成本分层。
- **不转发原文。** 只输出判断结果与提炼后的最小信息。
- **默认丢弃。** `UNCERTAIN` 不等于「送进去看看」。
- **判据要写在配置里，不要靠现场发挥。** 相关性判据是项目知识，应该固化下来。
- **记录丢弃数量。** 用于判断门卫是否过严（丢掉了本该处理的）或过松（没挡住噪声）。

## 与其他技能的关系

| 技能 | 关系 |
|---|---|
| `issue-triage` | 门卫通过后的下游 |
| `ci-triage` | 门卫通过后的下游（CI 失败通常无需门卫——信号本身已结构化） |
| `harness-loop` | 门卫是循环的第 -1 步，在退出检查之前 |
| `loop-budget` | 门卫降低的是进入循环的条目数，预算控制的是每轮花费；两者互补 |

## 适用的信号源

| 源 | 噪声水平 | 是否建议门卫 |
|---|---|---|
| 社交平台（Twitter/X） | 极高 | ✅ 必需 |
| Discord / 社区频道 | 高 | ✅ 建议 |
| 大型仓库的 issue 流 | 中高 | ✅ 建议 |
| 自有仓库的 PR | 低 | ❌ 不需要 |
| CI 失败（已结构化） | 低 | ❌ 不需要 |
