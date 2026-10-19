#!/usr/bin/env bash
#
# loop-harness 自身的标准启动与验证路径。
#
# 这个仓库是文档 + 零依赖 Node 脚本，没有构建步骤。
# 验证 = 跑测试套件 + CLI 入口可用性。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# 自我识别标记：harness-stage 的判据会执行被审计仓库的 init.sh，而本脚本又回头
# 调用 harness-stage 审计本仓库——二者互为因果，会无限递归。harness-stage 凭这个
# 标记认出「要跑的正是正在运行的这份 init.sh」，记为 NOT RUN 而不是重入。
ROOT_WIN="$(cd "$ROOT_DIR" && pwd -W 2>/dev/null || pwd)"
export LOOP_HARNESS_ACTIVE_INIT="$ROOT_WIN/init.sh"

echo "==> Working directory: $PWD"

echo "=== Node version ==="
node --version

echo "=== Test suite ==="
node scripts/test.mjs

echo "=== Pre-commit hook ==="
# 装一次就常驻。断言套件是唯一能拦住"删掉验证者条件"这类改动的机制。
if [ "$(git config core.hooksPath || true)" = ".githooks" ]; then
  echo "  hooks path    OK (.githooks)"
else
  git config core.hooksPath .githooks
  echo "  hooks path    installed (.githooks)"
fi

echo "=== CLI entry points ==="
node scripts/harness-stage.mjs . > /dev/null && echo "  harness-stage OK"
# 账本用临时的一份：出厂的 loop-ledger.json 带示例 goal，熔断器会（正确地）判
# placeholder-ledger 并退出 2。用仓库里那份测会得到一个与"脚本坏了"无法区分的失败。
LEDGER_PROBE="$(mktemp)"
printf '{"goal":"probe","attempts":[]}\n' > "$LEDGER_PROBE"
node scripts/ledger-check.mjs --ledger "$LEDGER_PROBE" > /dev/null && echo "  ledger-check  OK"
rm -f "$LEDGER_PROBE"
# 占位账本必须被拦下——这是熔断器"区分示例数据与真实历史"的那条判据。
node scripts/ledger-check.mjs --ledger loop-ledger.json > /dev/null 2>&1 \
  && echo "  ledger-check  BROKEN (placeholder ledger should stop)" \
  || echo "  ledger-check  OK (placeholder ledger rejected)"
# gate 阶段的 approve 需要证据文件（verdict 是断言，不是证据）。
EVIDENCE_PROBE="$(mktemp)"
printf '## Verdict: APPROVE\n\n### Evidence\n- Tests: `true` → PASS\n\n### Checks not run\n- —\n' > "$EVIDENCE_PROBE"
node scripts/gate-check.mjs --item pr-1 --phase gate --verdict approve --red-check pass \
  --reviewed-sha "$(git rev-parse HEAD)" --diff-files a.ts \
  --evidence-file "$EVIDENCE_PROBE" > /dev/null \
  && echo "  gate-check    OK (proceed path)"
rm -f "$EVIDENCE_PROBE"
# 无证据的 approve 必须被拦下
node scripts/gate-check.mjs --item pr-1 --phase gate --verdict approve --red-check pass \
  --reviewed-sha "$(git rev-parse HEAD)" --diff-files a.ts > /dev/null 2>&1 \
  && echo "  gate-check    BROKEN (approve without evidence should escalate)" \
  || echo "  gate-check    OK (evidence required)"
node scripts/gate-check.mjs --item pr-1 --phase gate --verdict none --diff-files a.ts > /dev/null \
  && echo "  gate-check    BROKEN (gate+no-verdict should escalate)" \
  || echo "  gate-check    OK (escalate path)"
node scripts/gate-check.mjs --item pr-1 --phase gtae --verdict approve > /dev/null 2>&1 \
  && echo "  gate-check    BROKEN (bad phase should be rejected)" \
  || echo "  gate-check    OK (bad phase rejected)"
# 未知标志必须被拒绝（拼错的标志曾经等价于"该闸门没启用"）
node scripts/gate-check.mjs --item pr-1 --phase fix --diff-filesx a.ts > /dev/null 2>&1 \
  && echo "  gate-check    BROKEN (unknown flag should be rejected)" \
  || echo "  gate-check    OK (unknown flag rejected)"
# kill switch 必须由脚本自己读文件
PAUSE_PROBE="$(mktemp -d)"
printf 'loop-pause-all\n' > "$PAUSE_PROBE/STATE.md"
node scripts/gate-check.mjs --item pr-1 --phase fix --diff-files a.ts --state "$PAUSE_PROBE" > /dev/null 2>&1 \
  && echo "  gate-check    BROKEN (loop-pause-all should exit 3)" \
  || echo "  gate-check    OK (kill switch enforced)"
rm -rf "$PAUSE_PROBE"
node scripts/install-skills.mjs --target . --list > /dev/null && echo "  install-skills OK"

echo "=== Verification Complete ==="
echo
echo "=== Next steps ==="
echo "1. Read STATE.md for current activity and the human inbox"
echo "2. Read LESSONS.md before changing any loop mechanism"
echo "3. Run: node scripts/harness-stage.mjs .   (to see which stage this repo is at)"
echo "4. Re-run this script before claiming any change is complete"
