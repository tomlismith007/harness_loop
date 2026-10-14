#!/usr/bin/env bash
#
# loop-harness 自身的标准启动与验证路径。
#
# 这个仓库是文档 + 零依赖 Node 脚本，没有构建步骤。
# 验证 = 跑测试套件 + 自审计 + CLI 入口可用性。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Working directory: $PWD"

echo "=== Node version ==="
node --version

echo "=== Test suite ==="
node scripts/test.mjs

echo "=== Self audit ==="
node scripts/loop-audit.mjs .

echo "=== Pre-commit hook ==="
# 装一次就常驻。断言套件是唯一能拦住"删掉 verifier 条件"这类改动的机制，
# 手动跑是纪律，钩子是机制。
if [ "$(git config core.hooksPath || true)" = ".githooks" ]; then
  echo "  hooks path    OK (.githooks)"
else
  git config core.hooksPath .githooks
  echo "  hooks path    installed (.githooks)"
fi

echo "=== CLI entry points ==="
node scripts/event-router.mjs --list > /dev/null && echo "  event-router  OK"
node scripts/ledger-check.mjs --ledger loop-ledger.json > /dev/null && echo "  ledger-check  OK"
node scripts/gate-check.mjs --item pr-1 --phase gate --verdict approve --red-check pass \
  --reviewed-sha abc123 --head-sha abc123 --diff-files a.ts > /dev/null \
  && echo "  gate-check    OK (proceed path)"
node scripts/gate-check.mjs --item pr-1 --phase gate --verdict none --diff-files a.ts > /dev/null \
  && echo "  gate-check    BROKEN (gate+no-verdict should escalate)" \
  || echo "  gate-check    OK (escalate path)"
node scripts/gate-check.mjs --item pr-1 --phase gtae --verdict approve > /dev/null 2>&1 \
  && echo "  gate-check    BROKEN (bad phase should be rejected)" \
  || echo "  gate-check    OK (bad phase rejected)"
node scripts/loop-audit.mjs . > /dev/null && echo "  loop-audit    OK"
node scripts/harness-stage.mjs . > /dev/null && echo "  harness-stage OK"

echo "=== Verification Complete ==="
echo
echo "=== Next steps ==="
echo "1. Read STATE.md for current activity and the human inbox"
echo "2. Read LESSONS.md before changing any loop mechanism"
echo "3. Run: node scripts/harness-stage.mjs .   (to see which stage this repo is at)"
echo "4. Re-run this script before claiming any change is complete"
