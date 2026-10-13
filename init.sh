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

echo "=== CLI entry points ==="
node scripts/event-router.mjs --list > /dev/null && echo "  event-router  OK"
node scripts/ledger-check.mjs --ledger loop-ledger.json > /dev/null && echo "  ledger-check  OK"
node scripts/gate-check.mjs --item pr-1 --diff-files a.ts --verdict approve > /dev/null && echo "  gate-check    OK"
node scripts/loop-audit.mjs . > /dev/null && echo "  loop-audit    OK"
node scripts/harness-stage.mjs . > /dev/null && echo "  harness-stage OK"

echo "=== Verification Complete ==="
echo
echo "=== Next steps ==="
echo "1. Read STATE.md for current activity and the human inbox"
echo "2. Read LESSONS.md before changing any loop mechanism"
echo "3. Run: node scripts/harness-stage.mjs .   (to see which stage this repo is at)"
echo "4. Re-run this script before claiming any change is complete"
