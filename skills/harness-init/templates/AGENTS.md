# AGENTS.md

<!-- 由 harness-loop 生成。替换所有 {{...}} 占位符。 -->

{{PROJECT_PURPOSE}}

## 启动工作流

写任何代码之前，按顺序执行：

1. `pwd` 确认工作目录是仓库根。
2. 完整读本文件。
3. 读项目文档（README 或等价物）。
4. 读 `STATE.md`：`## High Priority` 第一条未勾选的 `- [ ]` 是**唯一**的工作队列；同时看 `## Active` 与 `## Human Inbox`。
   `feature_list.json` 只记录完成状态与证据，不是队列。
5. 跑 `./init.sh` 验证环境健康。
6. `git log --oneline -5` 看最近提交。

**若基线验证失败，先修基线。不要在坏状态上叠新工作。**

## 工作规则

- **一次只做一个 work item** —— 选恰好一个，直到它被验证或被显式标记为阻塞。
- **不跑验证不得宣称完成。**
- **状态必须落盘** —— 结束前更新 `STATE.md`；有代码改动时更新 `feature_list.json`。
- **不修改与当前 work item 无关的文件。** 一个修复一个 diff。
- **不得在实现过程中静默修改验证规则。**
- **执行者不得标记自己的 work item 为完成。**

## 必需工件

| 文件 | 作用 |
|---|---|
| `STATE.md` | **工作队列**（High Priority）+ 收件箱 + 当前活动 |
| `feature_list.json` | 完成状态与证据记录（**不承担队列**；队列见 `STATE.md`） |
| `init.sh` | 标准启动与验证路径 |
| `harness-constraints.md` | 拒绝列表与闸门（阶段 2 另加 `loop-constraints.md`） |
| `LESSONS.md` | 错题本：返工记录，经验转正为规则 |

## 完成定义

以下四条**全部为真**才算完成：

- [ ] 目标行为已实现
- [ ] 要求的验证**确实跑过**（tests / lint / type-check）
- [ ] 证据记录在 `feature_list.json` 或 `STATE.md`
- [ ] 仓库仍能从标准启动路径重启

## 结束会话

1. 更新 `STATE.md`
2. 更新 `feature_list.json`
3. 记录未解决的风险或 blocker
4. 工作处于安全状态后用描述性 message 提交
5. 让仓库干净到下一会话能立刻 `./init.sh`

## 验证命令

```bash
{{PRIMARY_VERIFICATION_COMMAND}}   # 完整验证（推荐）
```

必需检查：

{{VERIFICATION_COMMANDS}}

## 升级

| 情况 | 动作 |
|---|---|
| 架构决策 | 查架构文档，查不到问用户 |
| 需求不清 | 查产品/需求文档，查不到问用户 |
| 反复测试失败 | 更新 STATE.md，标记人工复核 |
| 范围含糊 | 重读 `feature_list.json` 的完成标准 |
| 触及拒绝列表 | 立即停止，写升级条目 |
