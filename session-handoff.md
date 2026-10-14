# Session Handoff

> 本文件是**会话边界快照**：这次会话做了什么、下次从哪里接上。
> 与 `STATE.md` 的分工：`STATE.md` 是循环的活状态（人类收件箱、Active 表、Watch List），
> 每轮都改；本文件只在会话结束时写一次，记录"交接点"。
>
> 出厂模板带占位符是有意的（新项目必须自己填），但**本仓库自己**也必须填——
> 一份全是 `[待填]` 的 handoff 等于没有 handoff，而它的存在还会让阶段 2 判据通过。

## Current Objective

- **Goal:** 按 `REVIEW-2026-10-14-remediation-spec.md` 落地 28 个工作包，修复三份审查发现的缺陷
- **Current status:** 第一阶段（核心缺陷）与第二阶段（可靠性）主体已落地，见下方证据
- **Branch:** `main`
- **Commit:** 本轮改动尚未提交（见 `STATE.md` 的 Active 表）

## Completed This Session

- [x] WP-01 编排命令加 `@` 前缀 + 通用 flag 断言（覆盖 HL-01/07/16 三类问题）
- [x] WP-02 运行层脚本随装配进入消费者项目（`copyRuntimeScripts`）
- [x] WP-03 `PHASES` 增加 `close`（3 个已注册事件此前无法执行）
- [x] WP-04 事件字段经 `env:` 传入 + 字符消毒（消除 shell 注入面）
- [x] WP-05 未知标志 fail-closed（三个脚本）
- [x] WP-06 verdict 词汇归一化（`ESCALATE_HUMAN` 不再变成参数错误）
- [x] WP-07 merge-gate 补齐 `--reviewed-sha/--head-sha/--red-check`
- [x] WP-08 证据闸门（`--evidence-file`）：verdict 是断言，不是证据
- [x] WP-09 `budget-check.mjs`：暂停与预算的唯一入口（per-loop 上限真正生效）
- [x] WP-10 `--upgrade` 跳级保护
- [x] WP-11 锁键 `--target` 进编排技能
- [x] WP-12 接线判据读 workflow 内容而非文件名
- [x] WP-13 漂移扫描覆盖 `LOOP.md` + 脚本数
- [x] WP-14 `LOOP.md` 的事件 phase 与 `ROUTES` 逐条比对
- [x] WP-15 `outcome` 枚举统一 + 校验
- [x] WP-16 占位账本与真实历史区分（`placeholder-ledger`）
- [x] WP-17 错误签名归一化收窄（不再把不同错误码折叠成一个签名）
- [x] WP-18 拒绝列表大小写不敏感
- [x] WP-19 `install-skills --check`（宿主跑的是已安装副本）
- [x] WP-20 `worktree.mjs`（隔离要求首次有代码入口）
- [x] WP-21 `registry.yaml` 的 `stages:` 块加消费者
- [x] WP-22 `docs/03` 补齐闸门清单 + 标注机械/人工判定
- [x] WP-23 `queue-read.mjs`（第 0 步第 3 条的读取契约）
- [x] WP-24 删除不存在的 `--inject` 指示
- [x] WP-25 布尔标志严格化（`--pause false` 报错而非静默取真）
- [x] WP-26 填写本文件（此前 12 处占位符）
- [x] WP-27 手动调用边界统一（技能与文档一致）
- [x] WP-28 复核：`skills/.mimosa/` 已被 `.gitignore` 覆盖（原判为误报）

## Verification Evidence

| Check | Command | Result | Notes |
|---|---|---|---|
| Tests | `node scripts/test.mjs` | pass | 见 `STATE.md` 记录的实际条数 |
| 标准启动路径 | `bash init.sh` | pass | 退出码 0 |
| 变异回退 | 逐 WP 手动变异 | pass | 每个 WP 的断言都确认过"改回错误写法会变红" |
| 真实 runner | — | **NOT RUN** | 无 GitHub 仓库与网络；注入探针为本地模拟 |
| 真实 agent 宿主触发 | — | **NOT RUN** | 无法观测宿主内部 |

## Files Changed

- `scripts/gate-check.mjs` — 证据闸门、verdict 归一化、`close` 阶段、未知标志校验、`boolArg`
- `scripts/ledger-check.mjs` — 占位账本判定、归一化收窄
- `scripts/lib/common.mjs` — `rejectUnknownFlags`、`boolArg`、`readRegistryStages`、接线判据读内容、大小写不敏感
- `scripts/budget-check.mjs` — 新增：预算与 kill switch 的唯一入口
- `scripts/queue-read.mjs` — 新增：待办队列读取契约
- `scripts/worktree.mjs` — 新增：隔离 worktree 的创建与丢弃
- `scripts/harness-stage.mjs` — 运行层脚本部署、跳级保护
- `scripts/install-skills.mjs` — `--check` 模式
- `scripts/event-router.mjs`、`scripts/test.mjs` — 未知标志校验、新断言
- `examples/github-actions/*.yml` — 去注入、merge-gate 参数补齐、budget-check 接入
- `skills/harness-loop/SKILL.md`、`skills/loop-guard/SKILL.md` — 命令补齐、边界统一
- `LOOP.md`、`docs/03`、`docs/10`、`loop-run-log.md`、`patterns/registry.yaml` — 漂移修正

## Decisions Made

- **闸门要求证据文件而非只读 `--verdict`**：verdict 是调用方的断言；不读证据时"独立验证"
  与"声称独立验证"在退出码上不可区分。证据格式复用 `loop-verifier` 既有输出，无需改技能。
- **运行层脚本随装配复制，装配工具不复制**：`test.mjs` 依赖 pack 内的 `templates/` 与 `skills/`，
  消费者跑不了；`harness-stage.mjs` 缺 templates 会"报告成功但什么都没写"，同样不复制。
- **`session-handoff.md` 保留并填写，不删除**：它是阶段 2 的产出之一，被 4 篇文档引用；
  删除会改动"5 个 loop 机制文档"这个在多处写死的数量。原问题是本仓库那份没填，不是文件多余。
- **布尔标志只拦布尔字面量**：`--pause false` 是陷阱（用户以为在传值），
  但 `--json positional` 是合法用法（位置参数跟在布尔标志后）。区别就在那个字面量上。

## Blockers / Risks

- **WP-04 的注入修复未在真实 runner 上验证**：本地模拟已证明注入可行，
  修复后的 workflow 也未在真实 GitHub 上跑过。合并进任何项目前必须先在一个测试仓库验证。
- **WP-02 改变了装配产物的形态**（消费者项目多出 `scripts/`）：
  已在临时目录端到端验证，但未在真实消费者项目上验证过完整流程。
- **`--force` 仍是跳级的逃生门**：有意保留（`--upgrade --stage 3 --force`），
  因为测试与特殊场景需要它。它不再能"意外"发生。

## Next Session Startup

1. 读 `AGENTS.md`
2. 读 `STATE.md` 与 `REVIEW-2026-10-14-remediation-spec.md` 的状态表
3. 复审本 handoff
4. 编辑前先跑 `bash init.sh`

## Recommended Next Step

- **Highest-priority unfinished feature:** 把本仓库的装配产物在**真实消费者项目**上验证一次
- **Why it is next:** WP-02/WP-04/WP-07 都改变了装配与接线的形态，
  而这三处的验证目前都只到"本地临时目录"为止。硬约束 10 说改了厂商接入必须真机验证——
  事件接线与 workflow 属于同类。
- **What counts as passing:** 在一个测试仓库上装配 → 触发一次真实事件 → workflow 成功执行
  `event-router` 并把 work item 交付出来 → 全程无 `ERR_MODULE_NOT_FOUND`、无注入。
- **What must not change during that step:** 不要为了让它跑通而放宽任何闸门或跳过断言。
  跑不通就记 NOT RUN 并升级。
