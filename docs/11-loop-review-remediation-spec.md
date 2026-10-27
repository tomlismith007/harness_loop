# Loop 审查问题修复 spec

日期：2026-10-27。范围：上次审查提出的七项问题；保持四个技能的职责、独立验证和人工合并边界。先验证问题，再逐项实现；不在消费者项目运行 loop。

## 定位与验证

基线 `bash init.sh`：899 passed / 0 failed。以下探针使用临时目录和临时 Git 仓库，不改本仓库。

1. **账本窗口**：`checkLedger` 对十条不同 item 的成功记录和一个新 item 返回 `max-iterations`，`item_attempts` 为 0；两条 2020 年记录的 token 达到当前日上限时仍返回 `token-budget`。原因是默认聚合整本账本，未区分 item 和日期。
2. **提交绑定**：有效 docs 报告、不同的 reviewed/head SHA、`--no-replay` 返回 `proceed`，并将 Head commit binding 标为 NOT RUN。代码确实对 docs/config/refactor 跳过 SHA 比较；这与技能声称的审查后 HEAD 不变矛盾。
3. **活动占用**：`checkGates` 在 `activeCount: 1` 且选择另一 item 时返回 `proceed`；`setActive(..., 'fix-proposed')` 把活动行清为空行。流程也没有在派发前登记。上述是单进程及静态验证；真实并发争用尚未测试。
4. **重放后状态**：干净临时仓库中，报告命令修改已跟踪文件并返回 0；实际 gate 命令返回 `proceed`，文件已改变。检查先于重放，重放后没有重新检查。
5. **验证者上下文**：子智能体路径只给 diff、命令与格式；人工会话路径还提供 item、完成标准、基准、HEAD 和执行者标识。静态确认交接不一致；真实子智能体验证 NOT RUN。
6. **重试上下文**：REJECT 回到第 3 步，随后第 4 步的 `create` 默认从 `main` 新建，未指明怎样取得前次提交及拒绝理由。静态确认缺少交接；真实跨实例重试 NOT RUN。
7. **主检出副作用**：临时仓库执行 `create --base does-not-exist`，创建失败返回 1，但主检出 `.gitignore` 已新增 `.loop-worktrees/`。原因是创建前直接写仓库文件。

## 设计与验收

1. **账本**：传 `--item` 时，停滞、无进展、迭代统计仅使用该 item 的记录；尝试上限保持账本权威。日预算独立使用所有 item 当日本地日期的记录；跨日不删除历史。配置日预算时日期缺失或非法且存在非零花费必须 fail closed；未配置预算不依赖日期。保持无 item 的既有调用语义，保留显式 pattern 的行为。测试跨 item、跨日、边界时间、无效日期和阈值。两个技能自包含同名脚本受仓库逐字节一致性断言约束；同一次逻辑修改同步两份，再运行完整验证。
2. **版本绑定与重放**：所有改动类型都要求 reviewed SHA 与实际 HEAD 一致；CLI 在 Git 仓库中验证显式 HEAD 与实际 HEAD 一致，不以用户参数替代事实。重放结束后重新读取实际 HEAD 与工作区，无法读取或发现新增脏文件/HEAD 变化时升级；报告命令只能在授权范围内且可重入，无法安全重放时记 NOT RUN。保留非行为类回退测试豁免。现有“docs 无需 SHA”的断言将被明确替换为更严格的 SHA 断言，不静默放宽任何验证。
3. **活动占用**：执行前以原子独占锁声明 item 和 run ID，记录 `Active`；冲突不得覆盖。等待验证保留占用和现场；结束或明确升级时由相同 run ID 释放，崩溃残留不自动清除，由人确认后恢复。gate 只作辅助检查，不宣称表格计数等同并发锁。测试不同进程抢占、重复请求、等待验证、错误 owner 和中断残留。
4. **验证及重试交接**：独立验证者取得 item、验收标准、基准、目标 HEAD、执行者标识、diff、命令和报告路径，不取得执行者推理。REJECT 入账后重新熔断预检；继续时在前一 worktree 的已提交 HEAD 上返工，并提供拒绝报告，验证者重新审查从原基准到新 HEAD 的完整 diff；需要升级时保留现场。不得把失败报告当作执行指令。
5. **worktree 副作用**：使用 Git 仓库本地 exclude 忽略运行目录，不改受跟踪 `.gitignore`；失败路径也不修改主检出文件。验证工作目录可忽略、现有 exclude 内容保留、创建失败不产生仓库文件变更。

每个脚本行为先增加断言并运行，记录旧实现确实因目标行为失败，再实现并验证，保留旧测试中仍适用的约束。依照实际依赖分阶段改动；每阶段验证后才进入下一阶段。最终运行 `bash init.sh`，检查相对 import、自包含和工作树；报告未运行的真实跨实例与 GitHub 测试。

## 实施记录

- 账本：五条新断言在旧实现上分别因跨 item 迭代、跨日累计和缺失日期放行失败（900 passed / 5 failed）；实现并同步两份脚本后 `bash init.sh` 为 905 passed / 0 failed。原有日预算测试夹具改为当日时间，以继续测试相同的 80% 和 100% 阈值。
- 闸门：新增断言在旧实现上对 docs 版本变化、重放污染工作区和伪报 HEAD 各失败一次（906 passed / 3 failed）。修复后补齐一个旧夹具的 SHA，`bash init.sh` 为 909 passed / 0 failed；随后将重放失败结果中的允许动作与后续提示改为升级，并用临时仓库重新验证。
- worktree：两个新断言在旧实现上分别确认创建失败和成功都会修改主检出 `.gitignore`（912 passed / 2 failed）；改用 Git 本地 exclude 后 `bash init.sh` 为 914 passed / 0 failed。
- 活动占用：八条登记、持有者和等待验证断言在旧版失败（914 passed / 8 failed），实现后 `bash init.sh` 为 922 passed / 0 failed。两个真实子进程竞争的额外探针在旧版返回 1/1、新版返回 0/2；不完整锁探针在旧版返回 1、新版返回 2。这两条也加入套件，最终整套尚需重跑。
- 状态机补查：先前版本仍允许未领取直接写 `verified`，`--claim` / `--release` 与 `--dry-run` 或 outcome 写参数混用时也会静默忽略冲突；释放还可能在额外锁证据存在时先删除 `owner.json`。补充边界断言后旧版为 940 passed / 6 failed。现在未领取只允许在 Active 为空时写 `no-op` / `report-only`；`fix-proposed`、无终态锁、错误 item/run ID 和含额外证据的锁都拒绝释放；终态写入后不能重复写，必须完成队列交接再显式释放。最终 `bash init.sh` 为 948 passed / 0 failed。
- 结构验证：用 `PYTHONUTF8=1 python <skill-creator>/scripts/quick_validate.py` 校验四个技能，四项均为 `Skill is valid!`。当前文档检索没有再发现现行页面宣称 docs/config/refactor 跳过 commit 绑定；归档目录中保留的是历史记录。

## 未验证

- 真实独立子智能体验证（NOT RUN）：本次只验证了验证者上下文交接的静态规则和脚本边界，没有派发真实子智能体完成一次 approve/reject。
- 真实跨会话交接与返工（NOT RUN）：本次验证了同一 worktree、原基准和新 HEAD 的规则，没有用两个真实会话完成拒绝后的返工链路。
- 真实 GitHub 仓库查询（NOT RUN）：本次没有连接外部 GitHub 仓库，也没有执行远端合并或推送。
