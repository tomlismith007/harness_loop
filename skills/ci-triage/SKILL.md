---
name: ci-triage
description: >-
  Classify a CI failure as flake, regression, environment, or config, and decide whether
  it is actionable. Environment failures must escalate — never "fix" them with code changes.
  Use when a check_suite or workflow run fails and you need to decide whether to attempt a fix.
license: MIT
user_invocable: true
stage: 1
---

# CI Triage

对每个新失败做分类，决定是否可操作。**分类错误会导致在错误的目标上烧钱。**

## 输入

- 失败的 job 与 step
- 错误输出（1–3 行摘要）
- 相关的近期提交
- 分支与 commit SHA

## 输出格式

```markdown
### Failure — <branch> @ <sha>
- Job / step: <名称>
- Error (1-3 lines):
  <错误文本>
- Classification: flake | regression | env | config
- Actionable: yes | no
- Attempts so far: N/3
- Suggested loop action: minimal-fix | watch | escalate-human
```

## 分类标准

| 类型 | 判定 | 处理 |
|---|---|---|
| **flake** | 间歇性；无代码改动重试通过 | 加入 Watch，**不自动修复** |
| **regression** | 新失败与近期提交相关 | 可操作 → `minimal-fix` |
| **env** | runner、registry、secrets、配额问题 | **升级给人，绝不用代码"修复"** |
| **config** | workflow、依赖安装、缓存配置 | 谨慎，通常需要人工判断 |

## 硬规则

```
Env failures → escalate-human. Do not "fix" with code changes.
```

**为什么**：环境问题用代码改动"修复"会产生看似成功但掩盖真实问题的补丁。下次环境恢复后，那个补丁变成隐患。

## flake 策略

```
同一测试先失败、随后无代码改动重试通过 → 分类为 flake → 加入 Watch，不自动修复
```

隔离 flake 必须有明确工单和人工批准。不要"用代码修复间歇性故障"。

## 分支范围

只处理受监控分支的失败：

- `main`
- `release/*`
- 标记为 `loop-watch` 的活跃 PR 分支

其他分支的失败 → 记录但不处理。

## 重试前必须做的事

每次尝试前：

1. 追加账本到 `loop-ledger.json`
2. 跑 `node scripts/ledger-check.mjs --ledger loop-ledger.json`
3. 退出码 `2` → 停止，升级

同一失败重复 3 次或超上限 → **熔断，升级人工，不再循环**。

## 规则

- **分类优先于修复。** 先确定是什么类型的问题，再决定是否动手。
- **env 类失败绝不改代码。** 这是最容易被违反的规则，因为"改代码让 CI 变绿"看起来像在解决问题。
- **flake 不修复，只隔离。** 用代码修复 flake 会把随机失败变成隐藏 bug。
- main 变红时优先级最高：它阻塞所有其他工作。
- 每轮清理已解决的失败条目。

## 失败模式与对策

| 失效模式 | 对策 |
|---|---|
| 只修表象 | verifier 查根因，检查错误签名是否变化 |
| 重试对抗 flake | 分类后隔离或建 ticket，不重试 |
| main 失败时消耗 token | N 次失败后暂停循环，批量修复 |
| 选错目标分支 | 技能中设明确分支允许列表 |

## 输出后的动作

1. 更新 `STATE.md`（活跃失败、Watch、已解决）
2. 记录每次尝试到账本
3. 追加运行日志
4. 可操作的新失败 → 在 worktree 中派发 `minimal-fix`，之后必须跟 `loop-verifier`
