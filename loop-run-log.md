# Loop Run Log

只追加的运行历史。每轮结束追加一条 JSON。**清理超过 30 天的条目。**

## Format

```json
{
  "run_id": "2026-10-17T08:15:00Z",
  "item": "fix-login-test",
  "duration_s": 45,
  "files_changed": 2,
  "attempts": 1,
  "outcome": "verified"
}
```

**`outcome` 枚举**：`no-op` | `report-only` | `fix-proposed` | `verified` | `escalated`

| 值 | 含义 |
|---|---|
| `no-op` | 没有可做的唯一一项，提前退出 |
| `report-only` | 产出报告，未改代码 |
| `fix-proposed` | 提出修复，等待验证或人工 |
| `verified` | 修复通过独立验证 |
| `escalated` | 交给人类（拒绝列表、尝试上限、熔断、环境问题） |

## Metrics to Watch

| 指标 | 健康信号 |
|---|---|
| 升级率 | 稳定且非 0 |
| 平均尝试次数 | < 2 |
| 重复失败率 | 趋近 0 |

## Log

<!-- 每轮追加。最新在下方。 -->

{"run_id": "2026-10-17T12:00:00Z", "item": "sandbox-verification", "duration_s": 0, "files_changed": 0, "attempts": 1, "outcome": "verified", "notes": "在 /d/loop-harness-test 跑完一轮：装配、回退测试、独立子智能体验证、闸门、熔断、状态写入。抓出 gate-check 证据正则的行尾锚定 bug。"}
{"run_id": "2026-10-18T02:00:00Z", "item": "skill-upgrade-audit", "duration_s": 0, "files_changed": 0, "attempts": 1, "outcome": "report-only", "notes": "只读审计 A@38ddcd2 / B@54f8c56 / CN@c5e9ef0，产出 5 份 audits/ 文档；未改现有文件。发现 kill switch 调用形式与 --phase fix 两个真 bug，见 audits/audit-2026-10-18.md D-01/D-02。"}
{"run_id": "2026-10-18T03:30:00Z", "item": "upgrade-batch-0", "duration_s": 0, "files_changed": 8, "attempts": 4, "outcome": "verified", "notes": "docs 事实修正：死链、闸门数 8→9、L3 表述、归一化描述、原语数法。独立子智能体 4 轮验证（REJECT×3 → APPROVE）；init.sh 335/0。commit a181285。"}
{"run_id": "2026-10-18T05:10:00Z", "item": "upgrade-batch-1", "duration_s": 0, "files_changed": 8, "attempts": 3, "outcome": "verified", "notes": "U-01/02/07/09/11：kill switch fail-closed、--phase gate、WIP=1、空文件与 frontmatter、宿主漂移（含收窄 --layout 的绕过）。独立验证 3 轮（REJECT→REJECT→APPROVE）；354/0。commit 0d88b94。"}
{"run_id": "2026-10-19T01:40:00Z", "item": "upgrade-batch-2", "duration_s": 0, "files_changed": 14, "attempts": 4, "outcome": "verified", "notes": "U-03/04/06/08/10：证据命令重放、sha 格式与 head 自取、策略面拒绝列表与漂移检测、预算接线（80% report-only，迭代上限优先）、不可信输入段。独立验证 4 轮（REJECT×3 → APPROVE）；391/0。commit 9232620。验证中抓出两个真回归：重放可被带引号命令绕过、配置预算会关掉迭代上限熔断。"}
{"run_id": "2026-10-19T03:20:00Z", "item": "upgrade-U05", "duration_s": 0, "files_changed": 12, "attempts": 3, "outcome": "verified", "notes": "护栏演练：drill-check 逐条命中拒绝列表 + 熔断器具体触发，记录绑定约束 sha256；阶段 2 判据 6→7。独立验证 3 轮（REJECT→REJECT→APPROVE）；416/0。commit 9b0b4aa。验证抓出：空记录/缺 sha/只跑 breaker 都能过阶段 2，以及被宽模式遮住的归因错误。"}
{"run_id": "2026-10-19T06:10:00Z", "item": "upgrade-U12", "duration_s": 0, "files_changed": 7, "attempts": 3, "outcome": "verified", "notes": "清洁交接：init.sh 占位、未跟踪调试残留、Last run 是今天。独立验证 3 轮（REJECT→REJECT→APPROVE）；433/0。commit fb1ff93。验证抓出两个真缺陷：git porcelain 对含空格/中文路径加引号导致漏检；UTC 与本地日期在时区边界误判（测试自己也中招，每天坏 8 小时）。"}
{"run_id": "2026-10-19T08:40:00Z", "item": "upgrade-U13", "duration_s": 0, "files_changed": 6, "attempts": 3, "outcome": "verified", "notes": "worktree manifest：create/mark/cleanup/list，cleanup 只扫终态且不带 --force。独立验证 3 轮（REJECT→REJECT→APPROVE）；463/0。commit 527bfdd。验证抓出：分支删不掉时条目被静默丢弃、worktree 已消失时条目永远卡死、测试在旧代码上崩而不是红。"}
{"run_id": "2026-10-19T09:30:00Z", "item": "repair-spec", "duration_s": 0, "files_changed": 17, "attempts": 1, "outcome": "verified", "notes": "按 REPAIR-SPEC 修复：占位 feature 判据、run-log 章节、安装清单 packRoot、账本不可读 exit 2、模板约束两节、--verify 承诺、docs 漂移。与 main 的升级批次合并后保留 main 的 kill switch/gate 阶段实现。证据：test.mjs 全绿、init.sh 0。"}
{"run_id": "2026-10-21T16:30:00Z", "item": "remediation-2026-10-21", "duration_s": 0, "files_changed": 21, "attempts": 1, "outcome": "verified", "notes": "按 2026-10-21 整改方案修 P0/P1：change-class、dotfile denylist、attempt-limit 读账本、验证者模板与证据片段/署名、--self 与 CI 三平台、用户级技能路径、manifest 累积、worktree 回收、untrusted 清洗与形状闸门、阈值读约束、文档同步断言、kill switch 双向修复、clean-state 双模式、NOT RUN 不算通过。复现确认 16 条发现，4 条已被上一轮修复。证据：test.mjs 569/0（原生 Windows PATH 同样）、init.sh 0、harness-stage --stage 1 --require --self 0；每条新机制做过回退测试。未做：R-14/R-16/R-18/R-19/R-21/R-25（推迟，触发条件见方案 §4）。"}
{"run_id": "2026-10-21T18:10:00Z", "item": "remediation-batch-2", "duration_s": 0, "files_changed": 28, "attempts": 1, "outcome": "verified", "notes": "补齐整改方案剩余项：R-14 版本/备份/回滚、R-16 验证者 canary（离线 4 用例）、R-18 轻量档、R-19 约束分层（harness/loop 双文件，兼容回落）、R-21 死链断言、R-25 state-commit 原子写。证据：test.mjs 611/0（原生 Windows PATH 同样）、init.sh 0、--stage 1 --require --self 0、drill 0。每项都有回退测试。未验证：agent 行为层（canary 是离线的）。"}
{"run_id":"2026-10-22T16:00:00Z","item":"skills-install-p0-p1","duration_s":0,"files_changed":8,"attempts":1,"outcome":"fix-proposed","notes":"按 docs/audit/2026-10-22-skills-audit.md 修 P0/P1：装完首条命令读不存在的 packRoot 清单、离线路径装 0 个技能、harness-loop-init 模板缺 6 个导致静默半装且渲染器把 error 打成 SKIPPED、三处死路提示、源即目标 + --force 的 ENOENT。证据：test.mjs 657/0、init.sh 0、临时目录 npx 实装后阶段 1 出 7 文件阶段 2 出 3 文件、8 条新断言回退旧实现后全红。outcome 记 fix-proposed 而非 verified：本次是执行者自验，独立验证者尚未跑（AGENTS.md 硬约束 1）。越界已声明：触及 scripts/sync-skills.mjs 与 skills/*/scripts/**（拒绝列表）、8 文件 > scope 阈值 5，需人工合并。"}
