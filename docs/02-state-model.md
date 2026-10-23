# 02 · 状态模型：work item、feature list、状态文件

循环没有记忆，除非你把它写在磁盘上。本文档定义三类持久状态工件及其字段。

---

## 五个状态源，各司其职

| 工件 | 作用域 | 更新者 | 机械读者 | 回答的问题 |
|---|---|---|---|---|
| `STATE.md` | 仓库级 | 每轮 | `gate-check`（kill switch、WIP=1） | 现在做什么？什么在等人？ |
| `feature_list.json` | 功能级 | 有证据时 | `harness-stage` 阶段 1 | 哪些功能完成了？证据是什么？ |
| `loop-ledger.json` | 尝试级 | 每次尝试 | `ledger-check` | 试了几次？什么错误？是否停滞？ |
| `loop-run-log.md` | 运行级 | 每轮 | `harness-stage`（存在性） | 这一轮的结果与成本？ |
| `LESSONS.md` | 返工级 | 发生返工时 | 无（模型读） | 哪些错犯过第二次？ |

**工作队列唯一来源 = `STATE.md` 的 `## High Priority`。** 其余四个文件不产生待办；
`feature_list.json` 只回答"这项做完没有、证据是什么"。

**不要合并它们。** 五者粒度和更新频率不同：`STATE.md` 每轮都变，`feature_list.json`
只在有验证证据时变，`loop-ledger.json` 每次尝试都追加，`loop-run-log.md` 只追加，
`LESSONS.md` 只在返工时写。

`## Active` 表同时只能有一行非占位数据——`gate-check` 会读它，多于一行直接升级（WIP=1）。

---

## Work item 模型

一个 work item 是一次 `/harness-loop` 运行处理的单元。

### 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | `pr-123`、`issue-456`、`ci-<sha>-<job>` |
| `event` | string | 产生它的事件名 |
| `phase` | enum | `intake` / `review` / `fix` / `verify` / `gate` / `post-merge` / `release` / `escalated` |
| `level` | enum | `L1` / `L2`（由 `harness-stage` 判据给出；本框架不授予 L3） |
| `attempts` | number | 已尝试次数（上限 3） |
| `acting_on` | string | 锁：正在操作的分支或 PR |
| `skills` | string[] | 本阶段要用的技能 |
| `gates` | string[] | 需要通过的闸门 |
| `evidence` | string[] | 命令 + 结果片段 |
| `escalation_reason` | string | 若 `phase == escalated`，为什么 |
| `first_seen` | ISO8601 | 首次出现时间 |
| `last_action` | ISO8601 | 上次动作时间 |

### 在 `STATE.md` 中的表示

```markdown
## Active

| Work item | 阶段 | 技能 | acting_on | 尝试 | 状态 |
|---|---|---|---|---|---|
| pr-123 | 1 | 修复已提出，待验证 |
| ci-a1b2c3-test | fix | ci-triage | loop/ci-a1b2c3-fix-1 | 2/3 | 第 2 次尝试中 |
```

**清理规则**：每轮结束时移除已合并、已关闭、已升级超过 7 天的条目。状态腐化（引用不存在的 PR）是失效模式之一。

---

## `feature_list.json` 规格

功能列表是 harness 原语，不是备忘录。它的三元结构是：**(行为描述, 验证方法, 当前状态)**。缺任何一个都不完整。

### 完整 schema

```json
{
  "project": "my-project",
  "last_updated": "2026-10-13",
  "rules": {
    "single_active_feature": true,
    "passing_requires_evidence": true,
    "do_not_skip_verification": true
  },
  "status_legend": {
    "not_started": "工作未开始",
    "in_progress": "当前唯一活动任务",
    "blocked": "有记录的阻塞未解决",
    "passing": "要求的验证已通过且证据已记录"
  },
  "features": [
    {
      "id": "chat-001",
      "priority": 1,
      "area": "chat",
      "title": "创建新会话",
      "user_visible_behavior": "用户打开应用，点击 New Chat，侧栏出现新会话，主面板显示空会话态",
      "status": "not_started",
      "verification": [
        "打开应用",
        "点击 New Chat",
        "确认侧栏出现新会话",
        "确认主面板显示空会话态"
      ],
      "evidence": [],
      "notes": ""
    }
  ]
}
```

### 字段约束

| 字段 | 必填 | 约束 |
|---|---|---|
| `id` | ✅ | 唯一，格式 `<area>-<序号>` |
| `priority` | ✅ | 整数，**越小越优先** |
| `area` | ✅ | 功能域 |
| `title` | ✅ | 短名 |
| `user_visible_behavior` | ✅ | 一句话，从用户视角描述可观察行为 |
| `status` | ✅ | `not_started` / `in_progress` / `blocked` / `passing` |
| `verification` | ✅ | **逐步可执行指令数组**（不是 shell 命令，是操作步骤） |
| `evidence` | ✅ | 数组，agent 在验证通过后填入（命令 + 结果） |
| `notes` | ❌ | 自由文本 |

### 状态规则（不可协商）

1. **任何时刻只能有一个 feature 处于 `in_progress`。** 这是 WIP=1，默认安全配置。
2. **`passing` 需要验证通过且证据已记录。** 只有代码写完不算。
3. **绝不删除 feature 条目。** 阻塞时置为 `blocked` 并附原因。
4. **绝不为了让状态好看而改写 verification 步骤。** 那等同于篡改评分标准。

### Pass Gate（从 `not_started`/`in_progress` → `passing` 的判定）

只有以下四条**全部为真**才允许迁移：

- 预期工作流**已被实际执行过**
- 成功证据**已记录**
- 被测路径中**没有阻塞性错误**
- 实现**没有让应用处于损坏或歧义状态**

### 粒度校准

每条 feature 应"可在一个 session 内完成"。

| 判定 | 示例 |
|---|---|
| ❌ 太粗 | "实现购物车" |
| ✅ 合适 | "用户可以把商品加入购物车" |
| ❌ 太细 | "在 Cart 模型上创建 name 字段" |

太粗会导致 overreach（改了 12 个文件、800 行，没有一条端到端可用）；太细会让列表变成噪声。

---

## `loop-ledger.json` 规格

熔断器的账本。**每次修复尝试追加一条**，失败时**必须**含 `error`（熔断器靠它检测重复失败）。

```json
{
  "goal": "修复 PR #123 的 CI 失败",
  "pattern": "ci-sweeper",
  "level": "L2",
  "attempts": [
    {
      "iteration": 1,
      "item": "pr-123",
      "action": "在 profile handler 中加 null guard",
      "outcome": "failure",
      "error": "TypeError: Cannot read properties of undefined (reading 'email') at profile.ts:42",
      "tokensUsed": 1800,
      "at": "2026-10-13T08:16:00Z"
    }
  ]
}
```

### 字段

| 字段 | 必填 | 说明 |
|---|---|---|
| `iteration` | ✅ | 递增整数 |
| `item` | ✅ | work item id |
| `action` | ✅ | 做了什么 |
| `outcome` | ✅ | `success` / `failure` / `noop` |
| `error` | 失败时必填 | 错误文本（用于签名归一化） |
| `tokensUsed` | ✅ | 本次尝试的 token 估算 |
| `at` | ✅ | ISO8601 |

### 熔断判定（`.claude/skills/harness-loop/scripts/ledger-check.mjs`）

检查顺序（先报最具体可行动的）：

| 触发类型 | 默认阈值 | 含义 |
|---|---|---|
| `stagnation` | 3 × 同一错误 | 错误签名相同出现 3 次 |
| `no-progress` | 5 次连续失败 | 连续失败无成功 |
| `token-budget` | 显式传入 `--token-budget`，或从 `loop-constraints.md` 的 `## Budget` 读取 | 超预算；≥80% 降级为 `report-only` |
| `max-iterations` | 10 | 总迭代数上限 |

**错误签名归一化**：抹掉 ISO 时间戳、十六进制地址、路径（折叠为 basename）、行列号、位置/时长类数字。退出码、HTTP 状态码、断言期望值等裸数字**保留**——否则根因不同的失败会被误判为同一错误。细节见 `docs/05-failure-modes.md` 第六节。

**退出码**：`0` = 继续；`2` = 停止，交给人类。

### 不可协商的账本规则

- **绝不为了继续循环而放宽阈值。** 升级是功能，不是失败。
- **绝不编辑账本来隐藏重复错误。** 那等于拆掉熔断器。

---

## `STATE.md` 规格

### 必需章节

| 章节 | 作用 |
|---|---|
| `Last run` | 头部时间戳，用于检测状态腐化与循环活动 |
| `## High Priority` | 循环正在处理，或正在等人 |
| `## Active` | 当前 work item 表（含 `acting_on` 锁） |
| `## Watch List` | 监控中，暂不行动 |
| `## Human Inbox` | 模糊/跨循环条目，归集给人 |
| `## Recent Noise` | 本轮看过但不值得行动的 |
| `## Post-Run Critique` | 上一轮复盘 |

### Post-Run Critique 字段（每轮填写）

- **High-noise items** — 哪些是噪声
- **False positives** — 哪些是误报
- **Should deprioritize** — 哪些优先级定错了
- **Friction in human review** — 人工审查时卡在哪
- **One adjustment next cycle** — 下轮一项具体调整

最后一项是关键：**每轮必须产出一项具体调整**，否则复盘会退化成走过场。

### 写入规则

- **每轮开始读**，不读状态就开始工作是失效模式。
- **每轮结束写**：结果、时间戳、上次动作。
- **每轮清理**已解决条目。
- **记录人工介入产生的变更**，否则循环会重复提议人已经拒绝过的事。
- **`STATE.md` 不得含任何凭据**（它会被提交）。

---

## 状态腐化的预防

状态腐化（引用已合并 PR、已关闭工单、陈旧分支）的原因通常是：运行结束没有清理步骤、运行开始不读状态、多循环无结构规范地写同一文件。

| 症状 | 对策 |
|---|---|
| 状态引用不存在的 PR | 每轮清理已关闭/已合并条目 |
| 多循环互相覆盖 | 每模式独立状态文件，或清晰分区 |
| 时间戳不更新 | 把 `Last run` 写入列进 `/harness-loop` 第 7 步（写状态） |
| ID 过期 | 用实时 API 验证 ID，不信任缓存 |

---

## 跨会话连续性

状态文件是跨会话连续性的唯一载体。会话结束时的 handoff 必须让下一个会话能**仅凭仓库内容**回答：

- 这仓库做什么？
- 怎么启动？
- 怎么验证？
- 什么没完成？
- 下一步最好做什么？

具体字段见本文件的 `STATE.md` 规格与 `feature_list.json` 规格。

---

## 下一步

- 闸门规则 → [03-gates-and-levels.md](03-gates-and-levels.md)
- 模板 → `templates/`
- 脚本实现 → `.claude/skills/harness-loop/scripts/ledger-check.mjs`（源文件 `scripts/ledger-check.mjs`）
