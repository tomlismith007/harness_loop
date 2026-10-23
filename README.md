# harness-loop

**让编码智能体围绕一个明确的 work item 持续、可靠工作的工程框架。** 把 harness engineering（让单次运行可靠）与 loop engineering（让连续运行自主）缝成一套可复制、可审计、可暂停的系统。

> 你不再逐步写提示词。你设计一套系统：它加载约束、选中一项工作、派发执行者、独立验证、把需要你判断的事放进收件箱。

**输入是本地待办**：人写进 `STATE.md`，或直接给 `/harness-loop` 一个参数。
GitHub issue/PR 是**可选模块**（`/harness-loop-issue`），不属于核心。

---

## 四个命令

| 命令 | 做什么 | 产出 |
|---|---|---|
| `/harness-init` | 阶段 1：建地基 | 6 个地基文件（`AGENTS.md`、`feature_list.json`、`STATE.md`、`LESSONS.md`、`harness-constraints.md`、`verifier-report.md`）+ 生成的 `init.sh` |
| `/harness-loop-init` | 阶段 2：装 loop 机制 | `loop-ledger.json`、`loop-run-log.md`，并确认验证入口就位 |
| `/harness-loop` | 顶层编排：跑完一个 work item | 约束 → 选一项 → 执行 → 独立验证 → 闸门 → 熔断 → 写状态 |
| `/harness-loop-issue` | GitHub 发现（只读） | 用 `gh` 读 issue/PR/CI，把 Top 5 写进 `STATE.md`，然后停 |

**`/harness-loop-issue` 是可选模块**：不装它，框架照样完整工作——本地仓库直接把待办写进 `STATE.md`。

一次 `/harness-loop` 的流程：

```
kill switch → 加载约束 → 选定唯一一项 → 执行者（独立 worktree）
→ 验证者（新实例，只拿 diff 与验证命令）→ gate-check → ledger-check → 写状态
```

验证者的独立性：有子智能体就派新实例；没有就要求人另开会话跑 `/harness-loop <item>`，并在指令中写明"只执行独立验证，不得修改代码"，未经验证不得标记完成。

---

## 这个仓库解决什么问题

1. **可靠性**：上游课程报告，在它的四次迭代里成功率从 20% 提升到 80–100%
   （`learn-harness-engineering` lecture-02:77-85，通过逐步补齐五个子系统）。
   同一课程也引用了 ETH Zurich 的研究指出仓库上下文文件并非普遍提升成功率，
   且增加 20%+ 推理成本（lecture-02:100）。
   **本仓库没有复现这个实验。本仓库验证的是闸门与脚本行为（见「已验证到什么程度」）。**
2. **持续性**：会话结束即失忆。没有仓库内的持久状态，每一轮都要重新推导项目是什么、做到哪了。
3. **可重复性**：同一套流程可以反复跑，每次留下的状态能被下一轮读懂。
   **本包不含调度器**——`/harness-loop` 由人触发，一次处理一个 work item。

---

## 这不是什么

- **不是调度器。** 没有 cron、没有 `schedule:`、没有守护进程。循环由人开始。
- **不是自动合并。** 没有任何代码路径执行 merge；合并永远由人做。
- **不是 CI 的替代品。** 闸门检查的是"这一轮改动能不能继续"，不是"这个仓库长期健康"。
- **不是 agent 行为评测。** 断言套件测的是脚本与闸门的形状，不是模型会不会绕过它们。
  唯一的例外是护栏演练（`drill-check.mjs`），它证明拒绝列表与熔断器会响。

---

## 快速开始

```bash
# 1. 安装技能（非交互：4 个技能 → Claude Code）
npx skills add tomlismith007/harness_loop --skill '*' -a claude-code -y

# 2. 重启会话，然后在一个项目里：
/harness-init            # 建地基文件
/harness-loop-init       # 装账本与运行日志
/harness-loop 修复登录测试   # 跑一个 work item
```

**装完重启会话**，否则 `/harness-init` 不会出现。

没有 `npx`（离线环境）时，把本仓库 clone 到本地，直接跑技能目录里自带的那份装配器：

```bash
node <clone>/skills/harness-init/scripts/harness-stage.mjs . --upgrade --stage 1
```

装配技能（`harness-init` / `harness-loop-init`）自带 `scripts/` 与 `templates/`，所以装配器不需要再从别处找 pack。

也可以从本仓库直接跑装配器（不复制进消费方）：

```bash
node skills/harness-init/scripts/harness-stage.mjs /path/to/repo            # 阶段 1：看差距 / 补齐
node skills/harness-loop-init/scripts/harness-stage.mjs /path/to/repo --upgrade --stage 2
node skills/harness-init/scripts/harness-stage.mjs /path/to/repo --stage 1 --require   # CI 闸门，未达成退出 2
```

阶段 2 要用 `harness-loop-init` 目录里的那份：它带 `stage2.mjs` 与 loop 模板，
`harness-init` 的那份不带（缺阶段 2 模块时报告会如实写 NOT RUN）。

阶段 2 的“技能已装到可发现路径”判据查项目内 `.claude/skills` / `.agents/skills`
与用户级 `~/.claude/skills` / `~/.agents/skills`；项目内优先。

---

## 两阶段建设

| 阶段 | 目标 | 判据 | 等级 |
|---|---|---|---|
| **1 初始化** | 6 个地基文件 + 生成的 `init.sh`，下一会话可重启 | 7 项，全机械 | L1 |
| **2 装配 loop 机制** | 账本、运行日志、熔断、独立验证入口、护栏演练、`loop-constraints.md` | 7 机械 + 2 人工 | L2 |

**不要跳级。** 阶段 1 让文件存在，阶段 2 让机制**起作用**。`--upgrade` 有跳级保护，前一阶段未达成时拒绝写入。

**两层可以分开用**：阶段 1 的产物不依赖任何 loop 机制——`gate-check.mjs` 在只有
`harness-constraints.md` 的仓库里照样拦拒绝列表、读 kill switch。想要 loop 再加阶段 2。

---

## 脚本

运行时脚本住在**技能目录里**，每个技能只带自己任务用得到的那些。根目录的 `scripts/`
只剩三个维护者工具。

### 技能里的运行时脚本

| 技能 | 脚本 |
|---|---|
| `harness-init` | `harness-stage`（CLI 与分派）/ `stage-core`（共享原语）/ `stage1`（阶段 1 判据与补齐） |
| `harness-loop-init` | 上面三个 + `stage2`（阶段 2）/ `drill-record` / `drill-check` / `ledger-check` / `gate-check` |
| `harness-loop` | `gate-check` / `ledger-check` / `state-commit` / `clean-state` / `worktree` |
| `harness-loop-issue` | `state-write` |

每个技能另带一份 `lib/common.mjs`（共享库）。

| 脚本 | 用途 | 退出码 |
|---|---|---|
| `harness-stage.mjs` | 两阶段检测 / 补齐 / 校验 | 0 报告或已达成；1 参数错误或写不出文件；2 `--require` 未达成 |
| `stage1.mjs` / `stage2.mjs` | 各阶段的判据与补齐 | 无 CLI，由 `harness-stage` 调用 |
| `stage-core.mjs` | 阶段元数据、三态判定、报告渲染、技能目录复制 | 无 CLI |
| `gate-check.mjs` | 闸门判定 + kill switch | 0 通过；1 参数错误；2 升级；3 退出 |
| `ledger-check.mjs` | 熔断检查 | 0 继续；2 停止并升级 |
| `drill-check.mjs` | 护栏演练（`--record` 写 `loop-drill.json`） | 0 全过；2 护栏没响 |
| `drill-record.mjs` | `loop-drill.json` 的读写与有效性判定 | 无 CLI |
| `clean-state.mjs` | 结束前检查：init.sh 无占位、无调试残留、Last run 是今天 | 0 干净；2 有未清理项 |
| `worktree.mjs` | 一次尝试一个 worktree：`create` / `mark` / `cleanup` / `list` | 0 成功；2 有未提交改动未清理 |
| `state-write.mjs` | 往 `STATE.md` 追加待办；第三方文本强制清洗 | 0 写入；2 自检失败 |
| `state-commit.mjs` | 原子更新 `STATE.md` + `loop-run-log.md`（tmp → rename，失败回滚） | 0 写入；2 已回滚 |

### 根目录的维护者工具

| 脚本 | 用途 |
|---|---|
| `test.mjs` | 自检（707 项断言）。直接测技能目录里要交付的那份脚本 |
| `install-skills.mjs` | 把技能推到本机宿主并比对已装副本（`--check`）。终端用户用 `npx skills add` |
| `lib/common.mjs` | 上面两个工具共用的库 |

`harness-stage` 按需 import `stage2.mjs`：只装 `harness-init` 的项目里它不存在，报告会把它写成一条 **NOT RUN**（"阶段 2 属于 /harness-loop-init"），而不是崩溃或假装通过。

`skills/<name>/scripts/` 与 `templates/` 里的文件**就是唯一的那一份**，没有根目录副本。
`test.mjs` 断言每个技能的相对 import 都能在自己目录里解析——跨技能引用在用户机器上必然断。

---

## 闸门

`gate-check.mjs` 按优先级检查，先命中者决定结果：

| # | 闸门 | 触发 | 决策 |
|---|---|---|---|
| 1 | `pause` | `loop-pause-all` 独占一行，或 `--pause` | exit 3 |
| 2 | `wip-limit` | `STATE.md` 的 `## Active` 有多于一项，或表结构损坏 | escalate |
| 3 | `denylist` | 改动命中拒绝列表（含 `.secrets/` 等隐藏目录） | escalate |
| 4 | `untrusted-shape` | `STATE.md` 里带 `src:untrusted` 的条目没有包成 code span | escalate |
| 5 | `scope` | 文件数超过 `loop-constraints.md` 的阈值（默认 5，cleanup 10） | escalate |
| 6 | `head-commit` | gate 阶段 sha 缺失或不一致 | escalate |
| 7 | `red-check` | 回退测试 `fail`；`behavior` 类改动的 `not-run` | escalate |
| 8 | `verification-evidence` | `approve` 无证据、证据自相矛盾、缺 `Checks not run`、缺 `Author`/`Reviewed commit`、PASS 无输出片段 | escalate |
| 9 | `verification` | 验证者 `reject` / `escalate-human` | escalate |
| 10 | `awaiting-verification` | gate 阶段没有 verdict | escalate（与"验失败"区分） |

「该不该继续试」不在这里判：尝试次数是账本的事实，由 `ledger-check.mjs --item <id>` 的 `attempt-limit` 判定（默认 3，可用 `--max-attempts` 或约束文件的「最多 N 次」覆盖）。

---

## 硬约束

**唯一真相源是 [`AGENTS.md`](AGENTS.md#硬约束不可协商) 的 7 条。** 这里只列摘要，不复制正文——
两份清单各自演进过一次，结果 README 写 8 条、AGENTS.md 写 11 条且内容不同，
而实际被注入生效的是 AGENTS.md。测试断言两边的条数一致。

**注意区分两类约束**：这里列的是**开发这个技能仓库**的规则。技能发给用户后，
用户项目里生效的是 `templates/harness-constraints.md` 与 `templates/loop-constraints.md`
里的那套（独立验证、3 次上限、拒绝列表、回退测试、NOT RUN、真机验证、机械判定）。

1. 技能目录是产物，源在根目录
2. 技能必须自包含
3. 技能只带自己任务用得到的文件
4. 改了脚本行为必须有断言（含回退测试）
5. 绝不为让 CI 变绿而禁用测试
6. 未跑的检查必须显式列为 NOT RUN
7. 文档里写的命令必须能跑

---

## 经验 → 规则（人工，无机械棘轮）

`LESSONS.md` 是**人读的错题本**：本轮发生返工时记一行，写清原因与证据。
把一条经验转正进 `loop-constraints.md` 是**人的判断**，不是脚本判定。

**当前没有任何代码统计 `Seen N×` 或自动提示转正。** 此前 README 用一整节把它描述成
自动棘轮，而实现为零——一条只存在于文档里的机制比没有更糟。等真的需要时再实现
（触发条件：`LESSONS.md` 里出现 ≥ 3 条 `Seen 2×`）。

---

## 目录结构

```
.
├── AGENTS.md                  # 本仓库的入口（怎么开发这些技能）
├── README.md                  # 给用户看的：四个命令与两阶段
├── init.sh                    # 验证路径：test.mjs
├── docs/                      # 方法论（7 篇）+ archive/（v1 结构，仅参考）
├── skills/                    # 4 个技能，各自自包含：SKILL.md + scripts/ + VERSION；
│                              # 装配技能另有 templates/
├── templates/                 # 8 个模板的源（技能里的副本由手工同步）
├── scripts/                   # 2 个零依赖 Node 脚本 + lib/（维护者工具）
└── .github/workflows/         # self-check：测试 + CLI 冒烟 + 凭据扫描
```

**本仓库不是 harness 消费方。** 根目录没有 `STATE.md` / `LESSONS.md` / `harness-constraints.md`
/ 账本 / 运行日志——那些是 `/harness-init` 与 `/harness-loop-init` 写进**用户项目**的文件。
`test.mjs` 断言根目录不出现它们：出现了说明身份混了。

---

## 自检

```bash
node scripts/test.mjs           # 707 项断言
node scripts/test.mjs --verbose # 显示每一项
bash init.sh                    # 测试 + 技能副本一致性
```

CI 在每次 push 时运行测试套件、副本一致性、CLI 冒烟与一条凭据字面量检查。见 `.github/workflows/self-check.yml`。

---

## 已验证到什么程度

| 验证 | 方式 | 结果 | 可重跑？ |
|---|---|---|---|
| 闸门与脚本行为 | `node scripts/test.mjs`（CI 三平台） | 707 项断言全绿 | **是** |
| 拒绝列表与熔断器会响 | `node scripts/drill-check.mjs` | 每条模式命中，良性路径放行 | **是** |
| 两阶段装配 | 临时项目端到端 | 阶段 1 出 7 文件、阶段 2 出 2 文件，`--require` 退出 0 | 否（手工一次性） |
| 完整一轮 `/harness-loop` | 靶场 `/d/loop-harness-test`：`sum([])` bug | 回退测试失败 → 修复 → 独立子智能体 APPROVE → 闸门 `proceed` → 账本与 run-log 落盘 | 否（手工一次性） |
| `/harness-loop-issue` 发现 | 沙箱仓库 `harness-loop-sandbox` | 写入带完成标准的待办；确认只读 | 否（手工一次性） |
| `/harness-loop-issue` CI 分类 | 沙箱里造的真实红 PR | `TypeError` 由该 PR 引入 → 判 **regression**，未误判为 env/flake | 否（手工一次性） |
| **agent 行为层**（验证者会不会偷懒、执行者会不会伪造证据） | — | **未验证**。闸门能抓"报告说 PASS、命令实际失败"与"PASS 无输出片段"，抓不到"输出片段本身是编的" | — |

真机验证抓出并修掉了两个框架 bug：闸门证据正则不接受技能文档里的报告格式；`install-skills --check` 把别家技能误报成清单残留。

---

## 来源与致谢

- **Harness Engineering** — [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)（五子系统、feature list 原语、三层终止校验；这些是课程理念，仓库内另有 `harness-creator` 技能与审计脚本，但理念本身没有机械执行点）。
- **Loop Engineering** — [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering)（五构件 + 记忆层、模式库、熔断器、L0–L3 就绪度、护栏演练）。
  中文翻译快照：[LibraScorpion/loop-engineering-cn](https://github.com/LibraScorpion/loop-engineering-cn)（上游的中文 fork，2026-07-15 快照，不含 `loop-gate` / `loop-drill` / untrusted-input）。

harness-loop 的增量在于**把两者焊在同一条工作流上**：harness 提供单次运行的可靠性，loop 提供连续运行的自主性，人给的待办（或可选的 GitHub 事件）保证两者作用于同一批真实工作。

MIT License.
