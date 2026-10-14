---
name: release-drafter
description: >-
  Scan merged PRs and commits since the last release, categorize them, and draft release
  notes or CHANGELOG entries for human review. Never publishes, never tags, never writes
  to CHANGELOG without approval. Use on tag events or before release prep.
license: MIT
user_invocable: true
stage: 3
---

# Release Drafter

从已合并的 PR 起草发布说明。**只起草，不发布。**

## 输入

- 上次发布以来的已合并 PR
- main 上的直接提交
- 标签与里程碑
- 项目已有的发布语气（`AGENTS.md` 的 "Release voice" 章节，若有）

## 输出格式

```markdown
# Release Notes Draft — <版本或日期范围>

## Features
- <用户可见的新功能> (#123)

## Bug Fixes
- <修复了什么> (#124)

## Performance
- <性能改进> (#125)

## Breaking Changes
- <破坏性变更 + 迁移说明> (#126)

## Security
- <安全修复> (#127)

## Documentation
- <文档更新> (#128)

## Internal / Chores
- <内部改动> (#129)

---
Generated from: <N> merged PRs, <M> direct commits
Window: <起始 SHA>..<结束 SHA>
Reviewer: <待填>
```

## 章节标准

固定使用以上七类。**不要自创章节**——一致性比灵活性重要，因为它让人能快速扫描。

## Post-Run Critique（写入状态文件）

每轮记录五项：

- **Missed items** — 有没有遗漏的合并
- **False positives** — 有没有不该出现的条目
- **Grouping issues** — 分类是否恰当
- **Retries** — 是否需要重跑
- **Prompt/policy adjustments** — 1–2 项具体调整

## 规则

- **绝不发布、绝不打标签、绝不写 CHANGELOG** —— 除非有明确的人工批准。
- **交叉核对** PR 标题与提交信息，避免虚构功能或归属错误。
- **同时扫 PR 和 main 上的直接提交**，只扫 PR 会遗漏。
- 严格分类 + "只写面向用户的内容"，避免草稿过长嘈杂。
- 语气按项目约定；若 `AGENTS.md` 有 "Release voice" 章节，遵循它。

## 升级到人类（始终）

- 主版本升级
- 破坏性变更
- 安全相关条目
- 重大功能
- 市场/公关敏感内容
- 草稿超过 N 天未审（建议 3 天）
- 扫描窗口内条目超过 ~50 条

## 失败模式与对策

| 失效模式 | 对策 |
|---|---|
| 虚构功能 / 归属错误 | verifier 对照 PR 标题与提交交叉核对 |
| 遗漏条目 | 同时扫 PR 和 main 直接提交 |
| 过长嘈杂 | 严格分类 + "user-facing only" |
| 语气不符 | `AGENTS.md` 提供 "Release voice" 章节 |
| 意外发布 | 无明确人工关卡和 PR，绝不授予 tag/CHANGELOG 写权限 |
| 复盘过时 | 未解决条目累积超 3 次运行 → 增加人工交接 |

## 成功指标

- 从最后合并到发布说明的时间（patch release 目标 < 1 天）
- 首次发布即含说明的 release 百分比
- 每 release 的人工审核时间
- 用户发现的"意外"遗漏条目数（目标趋近零）

## 与其他循环的关系

- 以读取为主，**可安全并发**运行
- 不应自动发布
- 是 Post-Merge Cleanup 的低风险搭档

## 输出后的动作

1. 产出 `RELEASE_NOTES_DRAFT.md`（或 GitHub release 的草稿章节）
2. 更新 `STATE.md`，标记"等待人工批准"
3. 追加运行日志（`outcome: "report-only"`）
4. **不触碰** tag 或 CHANGELOG
