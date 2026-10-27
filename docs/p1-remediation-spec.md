# 四项 P1 修复规格

日期：2026-10-27。范围：本轮审查确认的四项 P1；不处理带引号命令生成、阶段 2 下一步报告等 P2，不拆分或合并技能。

## 修改前的验证与定位

启动基线：`bash init.sh`，退出 0，输出 `Passed: 760   Failed: 0`。以下行为已在系统临时目录中的独立 Git / Node 项目复现：

| 编号 | 复现与影响 | 根因位置 |
|---|---|---|
| P1-01 | 未合并分支标为 merged 后，首次 cleanup 退出 2、删除 worktree 并把记录改为 escalated；再次 cleanup 退出 0 并删除分支 | `skills/harness-loop/scripts/worktree.mjs`：合并检查晚于 worktree 删除；失败时改标到允许强制清理的状态 |
| P1-02 | 主检出新增拒绝路径后，在旧 worktree 运行正文的 gate 命令返回 proceed；显式指定主检出的 constraints-root 才命中 denylist | 两份 `gate-check.mjs` 的 CLI：state 与 constraintsRoot 分别默认到不同位置 |
| P1-03 | state-write 正常写入第三方待办退出 0，随后 gate 以 untrusted-shape 退出 2 | `skills/harness-loop-issue/scripts/state-write.mjs`：buildLine 只清洗，没有调用已有的 untrusted 包装函数 |
| P1-04 | 仅复制 harness-init 后运行阶段 1 装配退出 1，缺少三个兄弟技能；安装全套后成功 | 两份 `stage-core.mjs` 的 copySkillDir：缺少任意兄弟技能都记为 error；阶段 1 遍历四个技能 |

复现原始记录位于系统临时目录：`harness-review-HM0EGR/results.json`、`harness-policy-review-l7256I/gate-review-evidence.json`、`harness-init-forward-0cdb97630b534e83b8c6950749642265/`。最终以入库的行为断言和本轮红绿验证为准。

## P1-01：重复清理不得丢弃待合并成果

### 目标行为

- 对 merged 记录，必须在删除 worktree 或分支前用 Git 提交祖先关系确认分支已并入记录的 base。
- 未合并、base 不存在或无法确认时：退出 2，保留 worktree、分支及 merged 状态；不得转为 escalated 后绕过合并检查。
- 重复 cleanup 继续保持上述结果；人工实际合并后，下一次 cleanup 可以回收。
- 已被人工移除的 worktree 仍须保护未合并分支；分支删除失败时保留 merged 状态，重试仍检查合并关系。
- 保持 manifest 版本与四种已有状态，不增加状态迁移负担。显式 rejected / escalated 的既有清理行为、脏工作区保护继续有效。

### 验收

真实临时 Git 仓库中的未合并提交连续清理两次仍有分支、worktree 和相同状态；人工合并后清理成功。补充 worktree 已不存在、base 无法解析、分支删除失败后重试场景。既有 rejected / escalated、active、脏工作区测试继续通过。

## P1-02：状态与默认策略使用同一个主检出

### 目标行为

- 未显式传 constraints-root：策略目录取 state 的绝对路径；state 为文件时取其父目录；两者都不传仍取当前目录。
- 显式 constraints-root 继续具有优先级。拒绝列表与范围阈值使用同一目录。
- 显式 state / constraints-root 缺值或 constraints-root 不是目录时返回参数错误，避免拼错参数后静默回落。
- Git HEAD、工作区脏状态和证据命令仍在本次 worktree 读取或执行。
- 同步 `harness-loop`、`harness-loop-init` 中相同的 gate 脚本，保留副本逐字节一致性检查。

### 验收

临时主检出与 worktree 含不同策略：正文命令只给主检出的 state，必须命中新加拒绝路径；主检出的更严文件数限制必须生效；state 文件路径同样有效；显式策略覆盖可用；无参数目录布局保持兼容。gate 阶段也验证主检出的策略生效。

## P1-03：发现结果可以直接进入后续闸门

### 目标行为

- source=untrusted 时使用已有 untrusted 函数包裹正文，保留来源标记和 origin 必填规则。
- 继续保证单行、长度限制、去不可见字符和反引号处理；本地条目的现有输出不变。
- self-test 检查实际 buildLine 输出，避免仅验证未被写入路径调用的工具函数。
- 不降低 untrusted-shape 的检查标准。

### 验收

用 CLI 向真实 STATE 模板写入普通第三方条目及含换行、零宽字符、反引号的条目；读取实际结果交给 gate，必须通过形状检查。未包装的第三方条目仍被拒绝；缺 origin、本地写入、未知 section 的既有验证保留。

## P1-04：阶段 1 不强制安装可选兄弟技能

### 目标行为

- 装配器始终使用当前技能自带资源。缺少当前技能自身的 SKILL.md / 模板仍是错误。
- 四个已知技能中，当前可找到的完整技能继续复制到两个宿主路径；未安装的兄弟技能明确记为 skipped 并说明按需安装，不当作初始化失败。
- 完整包布局继续安装四个技能；不自动联网安装、不为单技能捆绑其他技能的资源。
- 两份 stage-core 保持一致；更新阶段 1 正文，说明完整包与单技能布局的差别，发现技能仍为可选。
- 安装清单继续仅列磁盘实际存在的技能，保留 force / 源即目标 / 非空用户目录保护。

### 验收

分别只复制 harness-init、只复制 harness-loop-init，在隔离项目执行阶段 1，必须退出 0、产出完整地基文件、只记录实际安装的技能。真实 feature 和有效 init.sh 本地化后，独立 harness-init 的阶段 1 require 必须成功。删除本技能模板或 SKILL.md 后仍应非零退出。完整包与覆盖保护的既有测试继续通过。

## 实施顺序与验证规则

1. 本规格先于运行时修改入库。
2. 顺序修复 P1-01、P1-02、P1-03、P1-04；同名交付副本作为同一逻辑修复同步修改。
3. 每项先补行为断言，在未修复代码上运行，记录行为失败；再修运行时，重跑相同断言。
4. 现有两项断言需要按规格纠正：未合并记录不再改标 escalated；缺可选兄弟技能不再预期失败。替换成更强的成果保留、初始化产物与清单断言，不能删除验证覆盖。
5. 每项提交前运行完整测试；最后运行 `bash init.sh` 与技能格式校验，记录 PASS / FAIL / NOT RUN。
6. 不推送、不合并。真实 GitHub 工作流、Linux/macOS 和完整线上多实例 loop 不在本轮执行范围，标记为 NOT RUN。

## 实施记录

### P1-01

- 合并祖先关系检查移到任何删除之前；未合并和分支删除失败时保留 merged 状态，同步技能正文与 CLI 帮助。
- 同一组真实 Git 回归：旧代码 `Passed: 39 / Failed: 14`，修复后 `Passed: 55 / Failed: 0`。覆盖重复清理、实际合并后回收、base 无法解析、worktree 已移除、分支锁恢复及原有清理保护。
- 原始输出：本轮临时证据目录中的 `worktree-red.log`、`worktree-green.log`；完整套件由本项提交的 pre-commit hook 执行。

### P1-02

- 两份 gate CLI 的默认策略目录绑定 state（文件则取父目录），同时校验路径参数；显式覆盖保留，Git 与证据执行目录不变。
- 同一组真实主检出 / worktree 回归：旧代码 `Passed: 4 / Failed: 24`，修复后 `Passed: 28 / Failed: 0`。两份脚本均覆盖拒绝列表、范围阈值、state 文件、显式覆盖、错误参数和正式 gate。
- 原始输出：`policy-red.log`、`policy-green.log`。P1-01 的提交全套测试为 `Passed: 784 / Failed: 0`。
