# Pattern Template

<!-- 新增循环模式时复制本文件。所有章节必填。 -->

# {{PATTERN_NAME}} Loop

## Goal

[一句话说明这个循环要完成什么]

## Trigger

| 平台 | 配置 |
|---|---|
| Grok | `/loop <间隔> <指令>` |
| Claude Code | `/loop <间隔> <指令>` 或 Desktop scheduled task |
| Codex | Standalone automation / thread automation |
| GitHub Actions | `on: [<事件>]` 或 `on: schedule` |

## Required Skills

- `<skill-1>` — [职责]
- `<skill-2>` — [职责]

## State

状态文件：`<pattern>-state.md`

```markdown
# <Pattern> State

Last run: <ISO8601>

## Active
| Item | Status | Attempts | Last action |
|---|---|---|---|

## Watch (monitor, do not act)
| Item | Reason |
|---|---|

## Resolved (last 7d)
| Item | Resolution |
|---|---|

## Escalated (human required)
| Item | Reason | Since |
|---|---|---|

Run log: —
```

## How the Loop Runs (Typical Cycle)

1. [第一步]
2. [第二步]
3. [第三步]

## Verification Strategy

- [如何验证本循环的产出]
- [谁验证，用什么命令]
- [什么情况下不得宣称完成]

## Human Handoff Points

| 触发条件 | 动作 |
|---|---|
| [条件] | [升级方式] |

## Tool-Specific Notes

| 工具 | 注意事项 |
|---|---|
| Grok | [worktree 语法、子智能体隔离] |
| Claude Code | [hooks、子 agent 定义位置] |
| Codex | [automation 类型、verifier TOML] |
| GitHub Actions | [事件接线、token 范围] |

## Failure Modes & Mitigations

| 失效模式 | 症状 | 缓解措施 |
|---|---|---|
| [模式] | [症状] | [对策] |

## Success Metrics

| 指标 | 目标 |
|---|---|
| [指标] | [目标值] |

## Cost

| 场景 | token 量级 |
|---|---|
| 空转退出 | |
| 只报告 | |
| 含执行 + 验证 | |

建议日上限：`<n>k`
提前退出必需：`yes | no`
