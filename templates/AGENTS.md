# AGENTS.md

<!-- 由 loop-harness 生成。替换所有 {{...}} 占位符。 -->

{{PROJECT_PURPOSE}}

## 启动工作流

写任何代码之前，按顺序执行：

1. `pwd` 确认工作目录是仓库根。
2. 完整读本文件。
3. 读项目文档（README 或等价物；本脚手架**不生成** `docs/ARCHITECTURE.md`、`docs/PRODUCT.md`，若项目有就在这里补读，没有就跳过）。
4. 读 `progress.md` 拿最新已核实状态与下一步。
5. 读 `feature_list.json`，选**一个**最高优先级未完成 feature。
6. 跑 `./init.sh` 验证环境健康。
7. `git log --oneline -5` 看最近提交。

**若基线验证失败，先修基线。不要在坏状态上叠新工作。**

## 工作规则

- **One feature at a time** — 从 `feature_list.json` 选恰好一个未完成 feature，直到它被验证或被显式标记为阻塞。
- **Verification required** — 没跑验证命令不得宣称完成。
- **Update artifacts** — 结束前更新 `progress.md` 与 `feature_list.json`。
- **Stay in scope** — 不改与当前 feature 无关的文件。
- **Leave clean state** — 下一会话必须能立刻 `./init.sh`。
- **不得在实现过程中静默修改验证规则。**

## 必需工件

| 文件 | 作用 |
|---|---|
| `feature_list.json` | feature 状态追踪，唯一真相源 |
| `progress.md` | 会话连续性日志 |
| `init.sh` | 标准启动与验证路径 |
| `session-handoff.md` | 可选，大型会话的紧凑交接 |

## 完成定义

以下四条**全部为真**才算完成：

- [ ] 目标行为已实现
- [ ] 要求的验证**确实跑过**（tests / lint / type-check）
- [ ] 证据记录在 `feature_list.json` 或 `progress.md`
- [ ] 仓库仍能从标准启动路径重启

## 结束会话

1. 更新 `progress.md`
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
| 反复测试失败 | 更新 progress，标记人工复核 |
| 范围含糊 | 重读 `feature_list.json` 的完成标准 |
