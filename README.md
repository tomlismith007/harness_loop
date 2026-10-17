# harness-loop

**让编码智能体围绕一个明确的 work item 持续、可靠工作的工程框架。** 把 harness engineering（让单次运行可靠）与 loop engineering（让连续运行自主）缝成一套可复制、可审计、可暂停的系统。

> 你不再逐步写提示词。你设计一套系统：它加载约束、选中一项工作、派发执行者、独立验证、把需要你判断的事放进收件箱。

**输入是本地待办**：人写进 `STATE.md`，或直接给 `/harness-loop` 一个参数。
GitHub issue/PR 是**可选模块**（`/harness-loop-issue`），不属于核心。

---

## 四个命令

| 命令 | 做什么 | 产出 |
|---|---|---|
| `/harness-init` | 阶段 1：建地基 | 6 个文件：`AGENTS.md`、`feature_list.json`、`STATE.md`、`init.sh`、`loop-constraints.md`、`LESSONS.md` |
| `/harness-loop-init` | 阶段 2：装 loop 机制 | `loop-ledger.json`、`loop-run-log.md`，并确认验证入口就位 |
| `/harness-loop` | 顶层编排：跑完一个 work item | 约束 → 选一项 → 执行 → 独立验证 → 闸门 → 熔断 → 写状态 |
| `/harness-loop-issue` | GitHub 发现（只读） | 用 `gh` 读 issue/PR/CI，把 Top 5 写进 `STATE.md`，然后停 |

**`/harness-loop-issue` 是可选模块**：不装它，框架照样完整工作——本地仓库直接把待办写进 `STATE.md`。

一次 `/harness-loop` 的流程：

```
kill switch → 加载约束 → 选定唯一一项 → 执行者（独立 worktree）
→ 验证者（新实例，只拿 diff 与验证命令）→ gate-check → ledger-check → 写状态
```

验证者的独立性：有子智能体就派新实例；没有就要求人另开会话跑 `/harness-loop --verify <item>`，未经验证不得标记完成。

---

## 这个仓库解决什么问题

1. **可靠性**：同一个模型，harness 不同，成功率能从 20% 到接近 100%——差别在指令、工具、环境、状态、反馈。
2. **持续性**：会话结束即失忆。没有仓库内的持久状态，每一轮都要重新推导项目是什么、做到哪了。
3. **自主性**：没人按"开始"键。`/harness-loop` 负责把选定的一项做完、做对、留下证据。

---

## 快速开始

```bash
# 1. 安装技能到两个宿主路径（.claude/skills + .agents/skills）
node scripts/install-skills.mjs --scope user

# 2. 重启会话，然后在一个项目里：
/harness-init            # 建 6 个地基文件
/harness-loop-init       # 装账本与运行日志
/harness-loop 修复登录测试   # 跑一个 work item
```

**装完重启会话**，否则 `/harness-init` 不会出现。

也可以直接用脚本：

```bash
node scripts/harness-stage.mjs /path/to/repo            # 看当前阶段与差距
node scripts/harness-stage.mjs /path/to/repo --upgrade --stage 1
node scripts/harness-stage.mjs /path/to/repo --stage 2 --require   # CI 闸门，未达成退出 2
```

---

## 两阶段建设

| 阶段 | 目标 | 判据 | 等级 |
|---|---|---|---|
| **1 初始化** | 6 个地基文件，下一会话可重启 | 7 项，全机械 | L1 |
| **2 装配 loop 机制** | 账本、运行日志、熔断、独立验证入口 | 5 机械 + 2 人工 | L2 |

**不要跳级。** 阶段 1 让文件存在，阶段 2 让机制**起作用**。`--upgrade` 有跳级保护，前一阶段未达成时拒绝写入。

---

## 脚本（5 个）

| 脚本 | 用途 | 退出码 |
|---|---|---|
| `harness-stage.mjs` | 两阶段检测 / 补齐 / 校验 | 0 报告或已达成；2 `--require` 未达成 |
| `gate-check.mjs` | 闸门判定 + kill switch | 0 通过；1 参数错误；2 升级；3 退出 |
| `ledger-check.mjs` | 熔断检查 | 0 继续；2 停止并升级 |
| `install-skills.mjs` | 安装 / `--list` / `--check` / `--uninstall` | 0 成功；1 错误或漂移 |
| `test.mjs` | 自检（330 项断言） | 0 全通过 |

装配时复制进目标仓库的只有 `gate-check.mjs`、`ledger-check.mjs` 与 `lib/common.mjs`。

---

## 闸门

`gate-check.mjs` 按优先级检查，先命中者决定结果：

| # | 闸门 | 触发 | 决策 |
|---|---|---|---|
| 1 | `pause` | `loop-pause-all` 独占一行，或 `--pause` | exit 3 |
| 2 | `denylist` | 改动命中拒绝列表 | escalate |
| 3 | `max-attempts` | `--attempts ≥ 3` | escalate |
| 4 | `scope` | 文件数 > 5（cleanup 为 10） | escalate |
| 5 | `head-commit` | gate 阶段 sha 缺失或不一致 | escalate |
| 6 | `red-check` | 回退测试 `fail` / `not-run` | escalate |
| 7 | `verification-evidence` | `approve` 无证据、证据自相矛盾、缺 `Checks not run` 节 | escalate |
| 8 | `verification` | 验证者 `reject` / `escalate-human` | escalate |

---

## 硬约束

1. **写代码的人不能验证自己的代码。** 执行者与验证者必须是不同实例、不同指令。
2. **同一事项最多尝试 3 次。** 之后升级给人，而不是继续循环。
3. **没有机器可判定的停止条件，就不算一个循环。**
4. **合并必须绑定审查过的 commit。** `--match-head-commit <sha>`——策略靠自觉，这个靠 git 拒绝。
5. **新增测试必须通过回退测试。** 能在修复前的代码上真的挂掉，并指出是哪个行为错了。
6. **未跑的检查必须显式列为 NOT RUN。**
7. **触及拒绝列表路径立即升级**，不做任何编辑。
8. **`loop-pause-all` 生效时立即退出。**

---

## 经验 → 规则棘轮

```
本轮发生返工  → 在 LESSONS.md 记一行（Seen 1×）
再次出现      → Seen 2×
第三次出现    → 转正进 loop-constraints.md → 之后每轮逐条对
```

**延迟提升**是关键：一条经验第一次出现时不够格成为规则（可能是一次性偶发），出现 3 次才说明它是系统性的。

---

## 目录结构

```
.
├── AGENTS.md                  # harness 入口（路由器，不是百科）
├── STATE.md                   # 活状态：人类收件箱 + 当前活动
├── LESSONS.md                 # 错题本：返工记录，经验→规则棘轮的载体
├── loop-constraints.md        # 机器可读约束（拒绝列表/kill switch/闸门），每轮必读
├── loop-run-log.md            # 只追加运行日志
├── docs/                      # 方法论（7 篇）+ archive/（v1 结构，仅参考）
├── skills/                    # 4 个技能：两个建设阶段 + 顶层编排 + GitHub 发现
├── templates/                 # 可直接复制进项目的 7 个模板
├── scripts/                   # 5 个零依赖 Node 脚本
└── .github/workflows/         # self-check：测试 + CLI 冒烟 + 凭据扫描
```

---

## 自检

```bash
node scripts/test.mjs           # 330 项断言
node scripts/test.mjs --verbose # 显示每一项
bash init.sh                    # 测试 + CLI 冒烟（含 kill switch 与拒绝列表）
```

CI 在每次 push 时运行测试套件、CLI 冒烟与一条凭据字面量检查。见 `.github/workflows/self-check.yml`。

---

## 已验证到什么程度

| 验证 | 方式 | 结果 |
|---|---|---|
| 两阶段装配 | 临时项目端到端 | 阶段 1 出 6 文件、阶段 2 出 2 文件，`--require` 退出 0 |
| 完整一轮 `/harness-loop` | 靶场 `/d/loop-harness-test`：`sum([])` bug | 回退测试失败 → 修复 → 独立子智能体 APPROVE → 闸门 `proceed` → 账本与 run-log 落盘 |
| `/harness-loop-issue` 发现 | 沙箱仓库 `harness-loop-sandbox` | 写入带完成标准的待办；确认只读 |
| `/harness-loop-issue` CI 分类 | 沙箱里造的真实红 PR | `TypeError` 由该 PR 引入 → 判 **regression**，未误判为 env/flake |

真机验证抓出并修掉了两个框架 bug：闸门证据正则不接受技能文档里的报告格式；`install-skills --check` 把别家技能误报成清单残留。

---

## 来源与致谢

- **Harness Engineering** — [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)（五子系统、feature list 原语、终止校验）。
- **Loop Engineering** — [LibraScorpion/loop-engineering-cn](https://github.com/LibraScorpion/loop-engineering-cn)（六原语、模式库、熔断器、L0–L3 就绪度）。

harness-loop 的增量在于**把两者焊在同一条工作流上**：harness 提供单次运行的可靠性，loop 提供连续运行的自主性，人给的待办（或可选的 GitHub 事件）保证两者作用于同一批真实工作。

MIT License.
