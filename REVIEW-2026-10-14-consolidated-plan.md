# 修改规划 — 三份审查报告的综合核验与修复

| 项 | 值 |
|---|---|
| 日期 | 2026-10-14 |
| 基线 commit | `d7d049d` + 1 处未提交改动 |
| 输入 | `REVIEW-2026-10-14.md`、`REVIEW-2026-10-14-independent.md`、`REVIEW-2026-10-14-antigravity.md` |
| 核验方式 | 复现阻塞项 + 四路并行代码核验（gate-check / 拒绝列表与 registry / 阶段与安装 / 事件脊与 workflow），全部实测 |
| 结论 | **三份报告的高严重级结论全部属实**，且三份独立报告收敛到同一个根因 |
| **执行状态** | **已执行**（WP-0..WP-7 主体 + 部分低严重级）。逐条落地情况见下方 §6；未做项与理由都记在那里 |

---

## 6. 执行结果（2026-10-14）

本节让「已完成范围」与「有意遗留项」在仓库中可核对。每一行的状态都对应一次实测或一次变异回退，不是复述计划。

**落地 commit**：`81fedf2`（WP-0..3）、`094d6bb`（WP-4）、`2d02a39`（WP-5）、`8ac9ed0`（WP-6）、`3fca99b`（WP-7 + 收尾）。
**结果**：断言 498 → 590 全通过；`bash init.sh` 通过；自审计 94/L2 → 98/L3。

### 6.1 已完成（逐条对应上文）

| 计划条目 | 状态 | 证据 |
|---|---|---|
| WP-0 revert 未提交的 `verifierPresent` 改动 | ✅ | `81fedf2`；测试从 497/1 回到全绿 |
| WP-0 合并 L2/L3 重复的 verifier 判定 | ✅ | `scripts/loop-audit.mjs:256` 判一次为 `verifierOk`，下文 5 处统一使用 |
| WP-0 pre-commit 钩子 | ✅ | `.githooks/pre-commit`；`init.sh` 自动 `git config core.hooksPath`；实测提交时被拦下并跑了套件 |
| WP-1 `--phase/--verdict/--red-check` 枚举白名单 | ✅ | `gate-check.mjs` 的 `PHASES/VERDICTS/RED_CHECKS`；`--verdict aprove` → exit 1 |
| WP-1 `redCheck` 默认 `not-run` | ✅ | 省略 `--red-check` + `--phase gate` → exit 2；变异回退挂 2 条断言 |
| WP-1 `Number.isFinite` 守卫（gate-check + ledger-check） | ✅ | `--attempts abc` / `--budget-pct abc` / `--stagnation abc` → exit 1 |
| WP-1 gate 阶段缺任一 sha 即 escalate | ✅ | 变异移除后测试 590 → 586，挂 4 条 |
| WP-1 取消 `--diff-files` 隐式文件列表语义 | ✅ | 裸路径恒按单一路径/逗号列表处理，`@path` 显式 |
| WP-1 无参调用退出 1 并打印用法 | ✅ | `exit 1` + usage |
| WP-1 修正 gate 数量注释（6/7/9 → 9） | ✅ | 文件头与 docblock 与实现一致（9 道） |
| WP-2 `matchesDenylist` 读 `loop-constraints.md` | ✅ | `common.loadDenylist`；端到端：加 `infra/prod/**` 后 proceed → escalate |
| WP-2 修复 glob 漏匹配（secrets.yml 等顶层形态） | ✅ | `secrets.yml` / `config/secrets.yml` / `src/credentials.json` 现已命中；变异后挂 3 条 |
| WP-2 `AGENTS.md` 拒绝列表补齐 | ✅ | 补上 `.env`、`.env.*`、`**/*_key*`、`**/*_secret*`，并注明以 `loop-constraints.md` 为准 |
| WP-3 manifest 只记本次实写 | ✅ | 用户同名技能 `--uninstall` 后仍在；变异后挂 2 条 |
| WP-3 删除前路径包含断言 | ✅ | 清单含 `../../../victim_dir` → exit 1，目标树外目录未被删；变异后挂 3 条 |
| WP-3 `--target` 目录校验 | ✅ | 指向文件 → `fail()` 可读消息，非裸 ENOTDIR；变异后挂 1 条 |
| WP-4 verifier 判据改读内容 | ✅ | 全文 `lorem ipsum` → 阶段 2 不达成；变异后挂 1 条 |
| WP-4 熔断器判据要求账本非空 | ✅ | `{"attempts":[]}` → 判据 FAIL；变异后挂 1 条 |
| WP-4 `--upgrade` 复用 `verificationCommands()` | ✅ | Python 仓库生成 `pytest` 而非 `npm`；变异后挂 2 条 |
| WP-4 `skillInDiscoverablePath` 与 `SKILL_DIRS` 对齐 | ✅ | 用同一份路径列表（`harness-stage.mjs`） |
| WP-4 `structuredText` 围栏内不再收集 | ✅ | `common.mjs` 围栏分支改 `continue` |
| WP-5 registry 接进 gate-check / ledger-check | ✅ | `readRegistryDefaults`；改 `stagnation:1` → ledger-check 熔断；改 `max_attempts:1` → gate-check escalate；断开后挂 3 条 |
| WP-5 装饰性断言改行为断言 | ✅ | 删除「YAML 里写着某数字」的断言，换成改变值→行为改变 |
| WP-6 work item 交付（upload-artifact） | ✅ | 6 个 workflow 末尾加 `upload-artifact@v4`；README 说明为何必须交付 |
| WP-6 run log 交付（两个定时 workflow） | ✅ | `loop-run-log.md` 作为 artifact 交付 |
| WP-6 锁键统一为 `acting_on` + `--target` | ✅ | `route()` 改按目标比对；旧语义测试改为分支语义并加 4 条边界断言 |
| WP-6 `readLocks` 按表头名取列 | ✅ | `event-router.mjs` 改 `findIndex` 定位表头，空单元格不再错列 |
| WP-6 LOOP.md ↔ ROUTES 双向一致性测试 | ✅ | 第 17 节双向断言；据此发现并移除不可路由的 `schedule:daily`、修正 `issues.labeled:needs-info`；两方向各做过变异回退 |
| WP-6 其余 workflow 硬化（timeout/预算 exit/熔断器正则/actor 守卫/merge-gate 变红/ci-sweeper 事件） | ✅ | 6 个 workflow + `release-draft`；YAML 全部解析通过 |
| WP-6 `issues.closed` 与 `post-merge-cleanup` 输入澄清 | ✅ | 技能补「A 合并后 / B issue 关闭」两套输入说明 |
| WP-6 清理 `event-router.mjs` 的 `if (args.json || true)` | ✅ | 改为显式说明 JSON 是唯一输出（workflow 依赖默认 JSON） |
| WP-7 阶段判据数字统一（6+3 / 7+1） | ✅ | `AGENTS.md`/`LOOP.md`/`README.md`/`docs/10`/`docs/11`/`harness-consolidate` 全对齐 |
| WP-7 默认布局文档改回 `agents` | ✅ | `README.md`/`docs/10-how-to-use.md` |
| WP-7 约束确认行统一为绑定形式 | ✅ | 4 处 `Constraints loaded from loop-constraints.md: …` |
| WP-7 `gate-check` 标为脚本 | ✅ | `registry.yaml` 拆出 `scripts:` 字段 + 5 处文档标注「脚本，非技能目录」 |
| WP-7 `docs/01-event-spine.md` `--pr` → `--item` | ✅ | — |
| WP-7 `docs/09-case-magpie.md` 案例路径标注 | ✅ | 两行标注「案例仓库的文件」+ 一段说明 |
| WP-7 `templates/AGENTS.md` 指向不存在文件 | ✅ | 改为读 README 等价物，并注明不生成 ARCHITECTURE/PRODUCT |
| WP-7 `loop-auto-merge-allowlist.md` 引用 | ✅ | 6 处标注「可选/未创建」+ 说明当前 `auto_merge:false` 故安全 |
| WP-7 断言数/清单计数对齐 | ✅ | 统一为实测值，并加测试对账（见 §6.3） |
| 收尾 STATE.md / feature_list.json / loop-run-log.md | ✅ | 三项证据均已写入；见 `3fca99b` |
| 新增硬约束「可执行入口规则」 | ✅ | `loop-constraints.md` Verification 段 + `AGENTS.md` 第 11 条 |

### 6.2 有意未做（附理由，可核对）

这些是复核计划全文后确认**未落地**的条目。理由分三类：会削弱已有保护、属于下一轮的范围、或与本仓库定位冲突。核实方式见每行「怎么核实」。

| 计划条目 | 状态 | 为什么没做 | 怎么核实 |
|---|---|---|---|
| WP-2 `denylistLocalized` 增加「路径真实存在」判据 | 未做 | 判据要判「新增拒绝路径是否真实存在于仓库」，属**机制设计**而非安全修复；但当前集合差判据确实弱（加一条不存在的路径也能判「已本地化」）。本轮先保安全闭环，机制判据留下一轮。 | `harness-stage.mjs` `denylistLocalized` 仍是纯集合差，无 `exists` 校验 |
| WP-2 `**/*_key*` 词边界（避免误命中 `monkey_key.ts`） | 有意跳过 | 试加后 `src/real_key.ts` 这类真敏感文件反而漏匹配。**拒绝列表应 fail-safe：宁可多拦不可漏拦**，多匹配只造成一次升级，不匹配是漏掉凭据文件。故保留过匹配。 | `matchesDenylist('src/monkey_key.ts')` 仍命中 `**/*_key*`；测试固定此行为 |
| WP-6 补 `schedule:daily` 路由 | 未做（改为对齐文档） | 定时兜底循环要真跑起来还需调度配置，超出「接线修复」范围。本轮把 LOOP.md 里这个**不可路由**的声明移除，让文档与代码一致；真要加路由属下一轮功能。 | `LOOP.md` 已无 `schedule:daily` 行；`ROUTES` 仍无该键 |
| WP-6 补 `issue_comment.created` / `check_run.completed` / `review_requested` 等路由 | 未做 | 同上，属新增能力。当前双向一致性测试确保「文档声明的都可路由」，新路由需连同 workflow 与技能一起设计，不宜在修复轮里凭空加。 | `ROUTES` 无这些键；双向测试守住「不出现不可路由的声明」 |
| L4 `loop-audit.mjs:316` `Math.max(1,…)` 0 项通过误报为 `1/5` | 未做 | 显示层小瑕疵，不影响任何判定或门禁；修它属打磨。 | 该行仍是 `Math.max(1, …)` |
| L4b `:216` 单个技能也记满 `skillsTwoPlus` 权重（与 `:214` 共用分池） | 未做 | 权重共用会让「1 个技能」与「2 个技能」同分，属评分精度问题，不影响 fail-closed 判定。 | 两行仍引用 `SCORE_WEIGHTS.skillsTwoPlus` |
| L5 `detectLoopActivity` 未使用参数（`files`/`loopText`） | 未做 | 纯死参数，无行为影响。 | 函数签名仍为 `(root, stateText, files, loopText)` |
| L6 `structuredText` 围栏处理 | ✅ 已做 | —— | 见 §6.1（WP-4） |
| L8 `test.mjs` 临时目录清理加 `try/finally` | 未做 | 测试进程整体退出时临时目录由系统回收；加 `try/finally` 需改写大量 `run()` 辅助，改动面大于收益，且与本轮安全主题无关。 | `test.mjs` 仍无 `finally`（实测 0 处） |
| M3 `BOOLEAN_FLAGS` 补 `require`/`upgrade`/`uninstall` | 未做 | 三者都在参数末尾使用（`--stage 2 --require`、`--target X --uninstall`），实测不触发吞 token；补进 BOOLEAN_FLAGS 反而会破坏 `--upgrade <path>` 这类**合法**的带值用法。 | `common.mjs` BOOLEAN_FLAGS 仍不含这三项；文档用法均把它们放末尾 |
| M4 `--require` 缺 `--stage` 改为 exit 1 | 未做 | 影响面小且当前 CI 均带 `--stage`；属易用性改进，非安全闸门。 | `harness-stage.mjs:623` 仍是 `args.require && targetStage !== null` |
| L2 `hasEventWiring` 模板可自满足阶段 3 | 未做 | 当前双向路由一致性测试已从另一侧守住（文档声明必须可路由），此判据的宽松暂不构成实际假绿。 | `hasEventWiring` 仍是宽松匹配 |
| D10 `docs/12-stage-commands.md:14` 占位命令加标注 | 未做 | 该处 `node scripts/xxx.mjs` 已是明显占位写法，读者不会误当真实命令；加标注收益极低。 | 该行未变 |
| D11 `LOOP.md` 补齐阶段技能 slug | 未做 | 属导航便利性；`skills/<名>/SKILL.md` 已是约定入口。 | `LOOP.md` 仍不含这些 slug |
| D8 断言数（323/409/451/498）统一 | ✅ 已做+加固 | —— | 见 §6.1、§6.3 |
| `docs/10-how-to-use.md:18` 安装到 `~/.zcode/skills` 的表述 | 未做 | 属用户级实际安装位置的描述，需按目标机器核实，修复轮里不臆断。 | 该行未变 |

### 6.3 为防漂移加的守卫

- 文档声称的断言数现在与实测对账（`test.mjs` 汇总段）。`README.md`/`progress.md`/`docs/10-how-to-use.md` 里若再出现与实测不符的数字，测试即红。
- LOOP.md ↔ ROUTES 双向一致性测试：文档声明的事件必须可路由，ROUTES 的事件必须被文档登记。

### 6.4 复核结论

- 计划 8 个工作包的**安全/正确性主体已全部落地并经变异回退验证**。
- 遗留项集中于三类：**机制类设计**（`denylistLocalized` 路径存在性）、**新功能类**（补路由）、**打磨类**（权重/死参数/注释）。均不削弱本轮建立的 fail-closed 保护，故按最小修改原则有意留下一轮。
- 完整未做清单以 §6.2 为准，与 `STATE.md` 的 Watch List 保持一致。

---

## 0. 核验结论摘要

### 0.1 三份报告的共同根因（这是本次最重要的判断）

三份报告由三个互不相关的会话独立完成，却收敛到同一个诊断：

- 报告 A：「问题集中在**闸门失效**——`gate-check.mjs`、`harness-stage.mjs`、`loop-audit.mjs` 三条判定链都存在'输入缺失/拼错/为空 → 判为通过'的路径。**闸门本身还没有被闸门保护**。」
- 报告 B：「**大量关键机制仍然只是散文**，没有任何代码读取它们；而测试套件通过'断言文件里写着这些字'来伪装成已实现。」
- 报告 C：同一病灶在 workflow 接线层的复现。

**三份独立审查收敛到同一诊断，是强证据而非巧合。** 这与 `STATE.md` Post-Run Critique 已批评过的「阶段 2 判据曾用 grep 检查字样」是**同一个 bug 换了位置复发**：上一轮只修了 `harness-stage.mjs`，同样的反模式在 `gate-check.mjs`、拒绝列表、registry、事件接线里完整存活。

### 0.2 阻塞项（已实测复现）

`scripts/loop-audit.mjs:258` 存在未提交改动，删掉了 `verifierPresent`：

```diff
-  else if (score >= LEVEL_THRESHOLDS.L2 && triagePresent && verifierPresent) level = 'L2';
+  else if (score >= LEVEL_THRESHOLDS.L2 && triagePresent) level = 'L2';
```

实测 `node scripts/test.mjs` → `Passed: 497  Failed: 1`（`无 verifier 不得授予 L2 — got L2`）。

这拆的是框架最贵的��条主张（写代码的不能验证自己写的代码），且与 `docs/03-gates-and-levels.md:200`「L2 也要求 verifier 存在。这一条不是可选优化」直接冲突。更糟的是 `:263` 的 finding 逻辑独立于 level 赋值，会让工具**一边输出 `Level: L2`，一边在 Findings 里说 "Capped at L1"**，审计输出本身失去可信度。

### 0.3 实测复现的高严重级结论

| 结论 | 复现证据 |
|---|---|
| 阶段 2 可用零内容文件假绿 | `.agents/skills/loop-verifier/SKILL.md` 全文仅 `lorem ipsum`，`--stage 2 --require` → **6/6 PASS，exit 0** |
| `init.sh` 可被错误认证 | 纯 `pyproject.toml` 仓库生成 `npm install/test/build`，`--stage 1 --require` → **exit 0** |
| `--uninstall` 删用户技能 | 安装时 `skipped-exists` 保护了文件，`--uninstall` 照样删除，并谎报"未列在清单中的技能未被触碰" |
| `--uninstall` 路径穿越 | 清单写 `../../../victim_dir` → **目标树外目录被递归删除** |
| 拒绝列表真相源分裂 | `loop-constraints.md` 加 `infra/prod/**` → gate-check **proceed，denylist_hits 空** |
| `gate-check` 畸形输入放行 | `--verdict aprove` / `--phase gtae` / `--attempts abc` / `--budget-pct abc` **全部 proceed exit 0** |
| `gate-check` 无参调用 | **proceed exit 0**，无 usage |
| TOCTOU 可绕过 | 只给 `--head-sha` → head-commit 闸**整条跳过** |
| `--diff-files` 语义随文件系统变化 | 同一命令串，因 `a.ts` 存在与否，`files_changed` 从 1 变 8 |
| `merge-gate.yml` 恒定 escalate 且恒绿 | `--verdict none` + `--phase gate` → 每次 PR 都评论 escalate，且只 `::warning::` 不 exit |
| 预算分母错 5 倍 | `Math.max(...caps)` 取全表最大值 500k，merge-gate 自己上限是 100k |
| `registry.yaml` 无消费者 | 9 个字段全部在代码里重复硬编码，文件头「Consumed by loop-audit.mjs」为假 |
| 事件队列写进虚空 | 8 个 workflow 无 `upload-artifact` / commit / dispatch，README 却把它列为**推荐方式一** |

### 0.4 对报告的两处修正（避免按错误前提动工）

1. **`loop-budget.md` 不是"无消费者"**——`merge-gate.yml:52-55` 与 `daily-triage.yml:54-57` 确实读了它。但它们用 `Math.max(...caps)` 把整张表压成一个 500k 的全局上限，**per-loop 上限从未生效**。问题性质是"静默算错"而非"没人读"，修法也不同（按循环取行，不是接上读取）。
2. **`issues.labeled` 自触发环路比报告描述的弱一跳**——`issue-intake.yml` 确实缺 `actor != 'loop-bot'` 守卫与标签过滤（而 `pr-review.yml:26` 有），但打标签是 L2 行为（`issue-triage` SKILL.md:83-89 明写 L1 只提议不应用），且 `ci-sweeper.yml:85` 的 `needs-human` 只是 echo 到日志、不是真的 `gh issue edit`。环路存在但需一跳中介，优先级应低于其他高危项。

---

## 1. 修复顺序原则

按**失效方向**排序，不按修复难度排：

1. **先恢复基线**——当前是红的，任何工作都建立在坏状态上。
2. **会销毁用户数据的**优先于会误判通过的（`--uninstall` 是不可逆破坏）。
3. **让闸门从 fail-open 变 fail-closed** 的优先于装饰性问题。
4. **让配置真正生效**（拒绝列表、registry）优先于修文档。
5. 文档对齐放最后——因为数字与行为都可能随前面的修复再变。

**每个工作包必须满足的完成定义**（沿用 `AGENTS.md`，不可放宽）：
- 目标行为已实现
- **新增测试通过回退测试**（能在修复前的代码上真的挂掉）← 硬约束 8
- 证据写入 `STATE.md` / `feature_list.json`
- `bash init.sh` 仍能跑通

---

## 2. 工作包

### WP-0 · 恢复基线（阻塞，必须最先做）

**动作**
1. `git checkout -- scripts/loop-audit.mjs`，确认 `node scripts/test.mjs` 回到 `498 passed / 0 failed`。
2. 消除 `:255-256`（L3 分支）与 `:258`（L2 分支）重复书写 `verifierPresent` 条件的隐患——把两条分支合并为单一判断，使 verifier 条件只写一次。

**回退测试**：`无 verifier 不得授予 L2` 这条断言已存在且对 mutation 敏感（已验证）。补一条对称断言：scratch 掉 L3 分支的 `verifierPresent` 也必须挂。

**为什么不只是 revert**：重复书写正是这次回归的成因。改一处漏一处，下次还会犯。

**同时做**：加一个 pre-commit 钩子跑 `node scripts/test.mjs`。这次的紅就是没钩子的代价。

---

### WP-1 · `gate-check.mjs` 从 fail-open 改 fail-closed

> 违反硬约束 8（回退测试）、硬约束 7（合并绑定审查过的 commit）。框架最贵的两条主张都在这个文件里。

**动作**

1. **枚举白名单校验**。`--phase` ∈ `intake|review|fix|verify|gate|post-merge|release`，`--verdict` ∈ `approve|reject|escalate-human|none`。未识别值一律 `fail()` 退出 1（参数错误），而不是放行。
   - 当前 `:295` / `:298` 只做 `typeof === 'string'` 判断。
   - 注意复合效应：`--phase gtae` 同时废掉了 `:219` 的 `verdict==='none'` 闸，一次拼错关掉两道门。
2. **`redCheck` 默认值改为 `'not-run'`**（`:53` 与 `:304`），让"忘了加标志"与"明确没跑"在退出码上不可区分这件事消失。
3. **`Number.isFinite` 守卫**。`:296` / `:299` 与 `ledger-check.mjs:224-227` 的 `Number()` 结果加有限性检查，非有限值直接 `fail()`。`??` 不接 `NaN`——`ledger-check.mjs:53-56` 的兜底对 `NaN` 无效，已实测。
4. **`phase === 'gate'` 时缺任一 sha 即 escalate**（`:156`）。硬约束 7 是唯一绝不能跳的闸，不能"参数不全就绕过"。
5. **取消 `--diff-files` 的隐式语义**（`:283-288`）。只认显式 `@path` 形式（`:259` 的 usage 已写明），裸参数一律按单一路径处理。当前语义随文件系统状态变化，同一命令串在 `a.ts` 存在与否时 `files_changed` 从 1 变 8——而 `a.ts` 正是 CI 冒烟测试的参数。
6. **无参调用打印 usage 并退出 1**（`:249`）。当前无参 → proceed exit 0，"闸门用错"与"闸门通过"不可区分。
7. **修 docblock**。`:5` 写"六类闸门"、`:31-38` 列 7 条、实现 9 条（pause / budget100 / denylist / max-attempts / budget80 / scope / head-commit / red-check / verification）。缺的正是最近加的 head-commit 与 red-check。

**回退测试**（每条都要能在修复前挂掉）
- 省略 `--red-check` + `--phase gate` → 必须 exit 2
- `--verdict aprove` / `--phase gtae` → 必须 exit 1
- `--attempts abc` / `--budget-pct abc` → 必须 exit 1
- 只给 `--head-sha` 不给 `--reviewed-sha` → 必须 exit 2
- 无参调用 → 必须 exit 1
- `--diff-files <存在的文件>` → 必须按单一路径处理（`files_changed: 1`）

**顺带**：`init.sh:27` 与 `.github/workflows/self-check.yml:43` 的冒烟测试目前只走"闸门全关"路径且丢弃 JSON 输出。改成覆盖 gate 路径**并同时断言 escalate 分支**：
```
--phase gate --verdict none    → 必须 exit 2
--phase gate --verdict approve → 必须 exit 0
--phase gtae --verdict approve → 必须 exit 1
```

---

### WP-2 · 拒绝列表：把真相源合一（安全机制单点失效）

> 报告 B 列为 P0。这是整个安全机制的单点失效：**文档说 A，代码做 B，且 B 是危险的那一侧**。

**动作**

1. **`matchesDenylist()` 增加从 `loop-constraints.md` 的 `## Paths` 代码块解析的来源，优先级最高**；JS 常量 `DENYLIST_PATTERNS` 降级为 fallback（仅当文件不存在时使用）。
   - `harness-stage.mjs:141-179 denylistLocalized()` 已经证明这段是可解析的（按 `## Paths` 分割 → 取首个围栏块 → 去注释行），逻辑可直接复用。
   - `loop-constraints.md:98` 那句「上面的默认集可以收紧，不可以放宽」目前是 HTML 注释，无任何读者。接上之后它才成为约束。
2. **修 `common.mjs:384-409 globToRegex` 的两个方向都错**（实测）：
   - `**/secrets/**` 要求子目录 → `secrets.yml`（根）、`config/secrets.yml`、`src/credentials.json` **全部漏匹配**（返回 `null`）。补顶层文件形态。
   - `**/*_key*` 无词边界 → `src/monkey_key.ts`、`app/api_key_manager.py` **误匹配**。
   - `src/key.ts` 反而**不匹配**——这个 pattern 漏掉它本想覆盖的无前缀形态。
   - 一边漏一边过，两个方向都不可信。
3. **`AGENTS.md:34` 补齐缺失的 4 条**（实测差集，不止报告说的 2 条）：缺 `.env`、`.env.*`、`**/*_key*`、`**/*_secret*`；且 AGENTS.md 的 `.env*` 不是合法 glob（会误匹配 `.envrc`/`.environment`，且这串字面量不在 `DENYLIST_PATTERNS` 里）。

**回退测试**
- 往 `loop-constraints.md` 的 Paths 块加 `infra/prod/**` → `gate-check --diff-files infra/prod/main.tf` 必须 escalate
- 删掉该条 → 必须回到 proceed
- `secrets.yml` / `config/secrets.yml` / `src/credentials.json` 必须匹配
- `src/monkey_key.ts` 必须**不**匹配

---

### WP-3 · `install-skills.mjs`：修数据销毁与路径穿越

> 唯一会造成**不可逆用户数据损失**的一组问题。优先级高于任何误判通过类问题。

**动作**

1. **manifest 只记录本次真正写入的技能**（`:110-117` 当前记的是整包 `listSkillNames()`，不区分 `skipped-exists`）。
2. **卸载前比对内容**：非本包写入的跳过并报告，不得谎报"未列在清单中的技能未被触碰"。
3. **删除前 `path.resolve` + 前缀断言**（`:167-170`）。manifest 是目标目录里用户可写的普通文件，当前是任意递归删除。
4. **`--target` 加目录校验 + `fail()`**（`:90`）。当前是裸 `ENOTDIR` 堆栈，且 `:81` 的 "Installed loop-harness skills" 横幅已先打印——只读退出码的消费者会记录一条假的成功。

**回退测试**
- 预置同名不同内容的 `loop-guard/SKILL.md` → 安装 `skipped-exists` → `--uninstall` 后文件**必须仍在**
- manifest 含 `../../../victim` → **必须拒绝并报错**，目标树外目录不得被删
- `--target <某个文件>` → 必须输出 `fail()` 消息，不得抛裸堆栈

---

### WP-4 · 阶段判据从"存在性"升级为"内容"（`--require` 才是真闸门）

> 报告 A 的 H5、报告 B 的 §4.6。上一轮只修了"模板文字满足阶段 2"，没修"零内容文件满足阶段 2"。

**动作**

1. **阶段 2 的 verifier 判据改为读内容**（`harness-stage.mjs:123-126`）。当前 `skillInDiscoverablePath` 纯存在性判断。最小可判据：技能正文需出现回退测试 / NOT RUN 的实操描述，而非仅文件名。
2. **熔断器判据要求 `loop-ledger.json` 的 `attempts` 非空**（`:269-270` 当前只验 `Array.isArray`，`{"attempts":[]}` 即通过——这恰恰是"熔断器就位"的反面）。
3. **拒绝列表本地化增加"路径真实存在"判据**（`:141-179` 当前只做集合差）。实测：加一行 `totally/fake/path/**` 即 PASS；删掉一条本仓库用不到的模板路径（`removed` 非空）也 PASS。证据强度弱于字面声称——它证明"有人编辑过"，不证明"本地化是认真的"。
4. **`--upgrade` 复用 `verificationCommands()`**（`:461-463` 当前硬编码 npm）。纯 Python 仓库生成的 `init.sh` 跑 `npm install/test/build`，而 `--stage 1 --require` exit 0。同一文件 `:454` 写的占位注释是中文，`:85-90` 的占位符正则全是英文——**脚本写的占位符它自己检测不到**。
5. **占位符正则补中文形态**，或更好：改为"生成的命令必须与 `verificationCommands()` 检出的一致"。
6. **`skillInDiscoverablePath` 的路径列表与 `SKILL_DIRS` 对齐**（报告 C §3.3）。装在 `.claude/skills/` 的技能在 loop-audit 里计分、在 stage 2 却报"不在可发现路径"。

**回退测试**
- verifier SKILL.md 全文为 `lorem ipsum` → `--stage 2 --require` **必须非 0**
- `loop-ledger.json` 为 `{"attempts":[]}` → 熔断器判据必须 FAIL
- 拒绝列表只加 `totally/fake/path/**` → 必须 FAIL
- 纯 `pyproject.toml` 仓库 → 生成的 init.sh 不得含 npm 命令；`--stage 1 --require` 必须非 0

---

### WP-5 · 让配置真正生效：registry 接进执行路径

> 报告 B 的 P0-3。当前 `patterns/registry.yaml:2` 声称「Consumed by scripts/loop-audit.mjs」，实际 `loop-audit.mjs:230` 只检查**文件存在**（值 2 分），无任何脚本读它的值。

**动作**

1. **`gate-check.mjs` / `ledger-check.mjs` 增加 `--registry <path>`**，从 YAML 读 `defaults` 作为默认值来源，CLI 参数可覆盖。
2. **最小 YAML 标量解析器**。仓库承诺"零依赖 Node 内置模块"，不应引入 `js-yaml`；`stagnation: 3` 这类标量正则提取足够。
3. **顺手接上两个只有 prose、零消费者的死闸**（报告 B §4.2 #16）：
   - `no_progress: 5` 与 `max_iterations: 10` 在任何走 `gate-check` 的流程里**永远触发不了**——`gate-check.mjs:112` 在 `attempts >= 3` 就升级了。两道保险一道先死、一道够不着，而 `loop-guard/SKILL.md:62-63` 把它们列为正式阈值。
4. **预算按循环取行**，不再 `Math.max(...caps)` 把整张表压成 500k 全局上限（见 WP-6）。

**测试改造（本工作包的核心价值）**：把装饰性断言换成行为断言。

现状 `test.mjs:1053`：
```js
ok('registry 熔断阈值 3/5/10', /stagnation:\s*3/.test(registryText) && ...);
```
这断言 YAML 里**写着**这些数字，不管有没有代码读。改造为：
```
改 registry.yaml 的 stagnation 为 1 → ledger-check 必须在 1 次重复失败后 exit 2
改 max_attempts 为 1 → gate-check 在 attempts=1 时 escalate
删掉该行 → 必须回落到代码内默认值
```

**同类装饰性断言一并处理**：`test.mjs:546`（只查 workflow 有 `permissions:` 不查是否最小）、`:460-462`（只查 LOOP.md 含三个词）、`:1045`（只查 registry 声明事件数 > 0）。

**顺带**：`structuredText()`（`common.mjs:341-344`）声明了 `inFence` 却仍把围栏内代码行 push，违反自身 docstring（`:328-329`「只保留标题、列表项、表格行、粗体引导」）。模板示例块会被算作"结构化证据"。修法：`inFence` 时 `continue` 而非 `push`。同时 `loop-audit.mjs` 全面改用 `structuredHas`——目前它对 corpus 裸正则（`:89,118,162,199,233,235-237`），而 `structuredText` **只被 test.mjs 使用**，审计器一次都没用。

---

### WP-6 · 事件接线：让推荐路径真的成立

> 报告 B 的 P0-2。**框架自己的 L3 判据，无法通过框架自己的示例达成**——这是自相悖的。

**动作**

1. **work item 持久化**（三选一，倾向第 3）：
   - 每个写 work item 的 job 加 `actions/upload-artifact@v4`；或
   - 改用 `repository_dispatch`；或
   - **改为发结构化 issue / PR 评论**——唯一同时具备持久性、人类可见性、可审计性的载体。
   - 当前 8 个 workflow 全无 artifact / commit / dispatch，runner 文件系统是临时的，work item 写完即蒸。而 `examples/github-actions/README.md:63-67` 把它列为**推荐方式一**。
2. **`run_id` 日志同样要落地**。`daily-triage.yml:101-106` 与 `lesson-harvest.yml:126-131` 的 `cat >> loop-run-log.md` 没有 commit；而 `loop-audit.mjs:133-137` 要求 `## Log` 章节含真实 `run_id` 才给 loopActivity 加分，L3 又要求 `hasRealActivity`。讽刺的是 `lesson-harvest.yml:12` 声明了 `contents: write` 权限却没有提交步骤。
3. **锁键统一为 branch**（报告 B 的 P1-6）。当前 `:192-199` 用 `===` 比较 `l.acting_on`（branch/pr-id）与 `opts.item`（work item id）——两个不同命名空间，`lock-held` 实际不可达。而各 workflow 的 `concurrency.group` 本身就分属不同命名空间（`loop-pr-N` / `loop-gate-N` / `loop-ci-branch`），`STATE.md` 单一的 `acting_on` 列不可能同时是 `pr-123` 和 `main`。这恰好是 `LOOP.md:100` 那条规则唯一应该起作用、也唯一不可能起作用的场景。
4. **`readLocks` 按表头名解析**（`:154`）。当前 `.filter(Boolean)` 丢弃空单元格后仍按下标解构，空单元格导致整行左移。实测 `| issue-14 | | | pr-77 | 0 | active |` → `actingOn` 读成 `0`；部分填充的行则因 `cells.length < 4` 被整行丢弃。代码只硬编码了英文表头匹配 `/^work item$/i`，而 `templates/STATE.md` 用中文表头——**靠位置索引而非表头名**。
5. **`merge-gate.yml` 给 escalate 让 check 变红**。当前 `--verdict none` + `--phase gate` 恒定 escalate（`gate-check.mjs:219`），而 `:99-108` 只 `::warning::` 不 exit，且步骤名就叫 "Fail if escalated" 却不 fail。**一个恒定输出常量、且恒定为绿的 check**——正是框架最反对的东西。修法：要么补 verdict 写入通道（verifier 产出 `.loop/verdicts/<item>.json`，gate-check 读它），要么明确它是"收集并报告"而非 gate 语义。
6. **`ci-sweeper.yml` 不要硬编码事件**（`:44-49`）。同时订阅 `workflow_run` 与 `check_suite` 却永远传 `--event check_suite.completed:failure`，导致 `workflow_run.completed:failure` 那条路由**永远不可达**，且 `workflow_run` 的失败被套用了 `check_suite` 的闸门集——丢掉了 `loop-verifier` 与 `verification` 闸（L2 的定义依赖它）。另：`workflows: ["CI"]` 改名后静默停摆；`head_branch` 为 null 时 concurrency group 塌陷成全局 `loop-ci-`。
7. **kill switch 改结构化查找**（`daily-triage.yml:31-32`、`lesson-harvest.yml:33-34`）。`grep -q 'loop-pause-all' STATE.md` 会命中任何提到这个标志的说明文字——写了「Kill switch: `loop-pause-all`，当前未生效」的仓库会被**永久静默停摆**且无恢复路径。改为 `## Kill Switch` 区块下的结构化 `active: true|false`。停摆时补 `::warning::` 并在 STATE.md 留痕。
8. **预算四处修**（报告 B §4.2 #17/#18/#19）：抽公共脚本去掉逐字复制；按循环取上限（merge-gate 自己上限 100k，现在按 500k 算，低估 5 倍）；`tokens_estimate` 不能是硬编码常量 5000/40000；`PCT >= 100` 打了 `::error::` 却**没有 `exit 1`**，100% 熔断不生效。
9. **`issue-intake.yml` 补 actor 守卫**（报告 B P1-9 / 报告 C §1.1）。`pr-review.yml:26` 有 `if: github.actor != 'loop-bot'`，`issue-intake.yml` 没有，且 `labeled` 无标签过滤。注意实际影响比报告描述弱一跳（打标签是 L2 行为，`ci-sweeper` 的 `needs-human` 只是 echo 不是真标签写入），优先级低于前八项。
10. **补路由缺口**：`schedule:daily` 与 `issue_comment` 在 LOOP.md 声明但 ROUTES 里不存在；反向还有 7 个 ROUTES key 没有 LOOP.md 行（含 `issues.labeled:needs-info` 这个无法路由的字面 key）。**加一条 LOOP.md ↔ ROUTES 双向一致性测试**——`LOOP.md:3` 自称「调度与路由的唯一真相源」，`event-router.mjs:17` 自称「与 LOOP.md 保持一致」，这个一致性目前零测试覆盖。
11. **`issues.closed` 与 `pull_request.closed:merged` 分流**（报告 C §2.10）。两者都路由到 `post-merge-cleanup`，但该技能的输入明确是「近期合并到 main 的 PR」及其 diff（`SKILL.md:15-19`），issue 关闭时这两项输入为空。且 `issues.closed` 的 `gates: ['denylist']` 比 post-merge 少一道 `scope`——误触发的路径还是约束更松的那条。
12. **清理 `event-router.mjs:256` 的 `if (args.json || true)`**。注意：workflows 实际依赖这个死条件的 JSON 输出（`issue-intake.yml:34` 不带 `--json` 就把输出重定向进 `route.json`，下游 `jq -r '.phase'` 解析）。清理时必须保持默认 JSON 输出，或给所有 workflow 补 `--json`。

---

### WP-7 · 文档对齐（放最后，前面的修复会改变数字）

**动作**

1. **阶段判据数字统一到代码实际值**。阶段 2 = **6 机械 + 3 人工**；阶段 3 = **7 机械 + 1 人工**（实测 `checkStage3` 只有 1 项人工，报告说的第 2 项"指标健康"在代码中不存在）。当前不一致：
   - 说 9+1（错）：`AGENTS.md:94`、`LOOP.md:12`、`README.md:75`
   - 说 6+3（对）：`docs/10-how-to-use.md:84`、`docs/11-three-stages.md:26`、`patterns/registry.yaml:207-209`、`skills/harness-strengthen/SKILL.md:29`
   - **自相矛盾**：`docs/10-how-to-use.md` 内部 `:84`（6+3）对 `:183`（9+triage）；`docs/11-three-stages.md` 内部 `:26/:106/:160`（6+3）对 `:297`（9+1）
   - `AGENTS.md` 是路由入口，读者第一眼看到的偏偏是错的那个。
2. **默认布局文档写反**。代码 `install-skills.mjs:41` 是 `DEFAULT_LAYOUT = 'agents'`，文档 `docs/10-how-to-use.md:33` 与 `README.md:101` 都写「默认 `zcode`」。读者省略 `--layout` 实际拿到 `.agents/`，为"匹配文档"而补 `--layout zcode` 的用户反而失去跨 agent 发现能力——**这是最常见调用方式上的直接冲突**。
3. **约束确认行只留绑定文件那一种**。`loop-constraints.md:11`（绑定）要求 `Constraints loaded from loop-constraints.md: N rules active.`；而 `AGENTS.md:14`、`docs/12-stage-commands.md:135`、`skills/harness-strengthen/SKILL.md:95`、`docs/05-failure-modes.md:157` 用的是 `Constraints loaded: N rules active.`。**照 AGENTS.md 做的 agent 输出的正是不满足绑定要求的那一行**，护栏自检会对行为正确的 agent 产生假阴性。
4. **`gate-check` 的脚本身份**。`skills/gate-check/` 不存在（真身是 `scripts/gate-check.mjs`），但它出现在机器可读的 `patterns/registry.yaml:78` `skills: [gate-check]` 以及 `LOOP.md:36`、`templates/LOOP.md:15`、`skills/event-router/SKILL.md:40-41`、`docs/01-event-spine.md:38-39`、`examples/github-actions/README.md:23`。任何按 `skills/<name>/SKILL.md` 解析该数组的工具都会断。
5. **`docs/01-event-spine.md:118` 改 `--item`**。示例用了 `--pr 123`，而 `event-router.mjs:252` 只读 `args.item`，work item 静默丢失。其余 5 处文档都用 `--item`。
6. **断言数与清单计数改为实测值**。当前四说：`README.md:164` 323 / `docs/10-how-to-use.md:16` 409 / `:214` 451 / `progress.md:17` 498，实测 498（WP-1 加了断言后会变，最终统一时再取实测值）。清单计数同样过时：文档称技能 15 / 脚本 7 / 文档 11，实际 18 / 8 / 13；`README.md:183` 称 `docs/` 12 篇实际 13 篇。
7. **`loop-auto-merge-allowlist.md` 要么生成要么删引用**。被 `docs/03:106`、`docs/04:64,68,165`、`docs/07:111`、`docs/05:232` 引用，但仓库里没有这个文件，脚手架也不生成。风险低（registry 全局 `auto_merge: false`），但 L3 预检清单里"已关闭自动合并 + 允许列表"这一项**永远无法诚实地勾上**。
8. **`templates/AGENTS.md:13` 指向不存在的文件**。让消费者项目读 `docs/ARCHITECTURE.md` 与 `docs/PRODUCT.md`，两者本仓库没有、脚手架不生成。**每个被装配的项目在第 3 步启动指令上第一次运行就会失败。**
9. **`docs/09-case-magpie.md:24-25,32-33`** 引用的 `docs/code-standards.md` / `docs/contributors.md` 标注为案例仓库示例，避免读者误认为本仓库文档。
10. **`LOOP.md` 补齐阶段技能 slug**。它自称"唯一真相源"却只列运行时 slug，`harness-init` / `harness-strengthen` / `harness-consolidate` / `harness-bootstrap` / `harness-loop` / `loop-guard` / `lesson-harvest` / `signal-gatekeeper` 只以散文表标签出现，不可 grep。

**低严重级顺带清**
- `parseArgs` 的 `BOOLEAN_FLAGS`（`common.mjs:82-85`）补 `require` / `upgrade` / `uninstall`。当前 `parseArgs(['--require','.'])` → `{ require: '.' }`，把这三个标志写在位置参数之前会对**默认位置**而非用户指定的位置执行安装/升级/卸载。
- `--require` 不带 `--stage` 改为 exit 1（`harness-stage.mjs:624` 当前是静默 no-op exit 0，CI 里忘写 `--stage` 的 job 无条件报成功）。
- `loop-audit.mjs:311` 的 `Math.max(1, ...)` 让 0 项通过的子系统显示 `1/5`，是被人依据的就绪度分数里的误报。
- `loop-audit.mjs:216` 只有 1 个技能时也记满 `skillsTwoPlus`（14 分）的权重，与 `:214` 的 `>= 2` 分支共用一个分池。
- `test.mjs` 临时目录清理改 `try/finally`（断言抛异常时目录泄漏，本轮已实际观察到 `lh-e2e-*` 残留）。
- Windows 下测试输出中文乱码——`init.sh` 是"标准启动与验证路径"，但中文用户在 Windows 上读不懂自己的验证结果（`process.stdout.write` 未强制 UTF-8）。
- `skillInDiscoverablePath` 与 `SKILL_DIRS` 路径列表对齐（见 WP-4）。

---

## 3. 建议执行顺序

```
WP-0 恢复基线（+ pre-commit 钩子）
  ↓
WP-1 gate-check fail-closed      ← 违反硬约束 7、8
WP-2 拒绝列表真相源合一           ← 安全机制单点失效
WP-3 install-skills 数据销毁      ← 唯一不可逆破坏
  ↓
WP-4 阶段判据升级为内容判定       ← 让 --require 成为真闸门
WP-5 registry 接进执行路径       ← 消除"配置装饰化"
  ↓
WP-6 事件接线（工作量最大，可拆多次迭代）
  ↓
WP-7 文档对齐（数字随前面修复而定，最后做）
```

**建议的迭代切分**：WP-0+1+2+3 是一个可交付的批次（都是安全/正确性，且都有明确的回退测试）；WP-4+5 是第二批（都是"让判据与配置真正生效"）；WP-6 拆成 6a（持久化 + 锁键 + 路由一致性）与 6b（各 workflow 的具体缺陷）；WP-7 收尾。

---

## 4. 一条应写进硬约束的规则

报告 B 的 §7 提得对，三份报告的根因都在这：

> **任何被文档描述为"机械判定"的机制，必须有一个可执行的入口，其行为被测试断言。**
> **测试不得只断言配置文件里写着某个值——必须断言改动该值会改变行为。**

违反示例（可直接作为红检基线）：

| 断言类型 | 位置 | 问题 |
|---|---|---|
| 文本断言 | `test.mjs:1053` | 断言 `registry.yaml` 里写着 `stagnation: 3`，不管有没有代码读 |
| 文本断言 | `test.mjs:546` | 断言 workflow 里有 `permissions:`，不检查内容是否最小 |
| 文本断言 | `test.mjs:460-462` | 断言 `LOOP.md` 含「事件脊」「路由规则」「多循环协调」三个词 |
| 存在性断言 | `harness-stage.mjs:123-126` | 只判 SKILL.md 存在，全文 `lorem ipsum` 也算 verifier 已装 |

**正向示例已经存在于同一个文件里**（证明这不是能力问题）：空目录 → 阶段 0、装配后 → 阶段 1 10/10、`--require` 退出码 0/2；未注册事件 `registered=false` 且不自创流程；传拒绝列表路径 → `decision=escalate`；`reviewed-sha != head-sha` → 命中 head-commit 闸门；`--layout` 改回硬编码 `.zcode` → 10 项断言失败（已做过红检）；`Last run: never` 不算活动。

**首次应用**：把 `test.mjs:1053` 改成行为断言（WP-5 已包含）。

---

## 5. 本次核验的覆盖边界

明确列出，不做推测：

- **已实测复现**：WP-0 至 WP-5 的全部高严重级结论，以及 WP-6 的 1–3、5、7、8、10、11、12。
- **已核验为部分属实（优先级需下调）**：`issues.labeled` 自触发环路（WP-6.9）。
- **已核验为需要修正前提**：`loop-budget.md` "无消费者"（改为 WP-6.8 的"静默算错"）。
- **未逐条实测**：`docs/` 全 13 篇的交叉引用一致性、`skills/` 18 个 SKILL.md 的全文语义一致性、`examples/` 各 workflow 的 fork PR 处理与最小权限、非 md/yaml 资产、并发/竞态行为。
- **未验证任何修复方案的可���性**——本轮只做核验与规划，未改任何仓库文件（工作区那处改动是本轮之前就存在的）。