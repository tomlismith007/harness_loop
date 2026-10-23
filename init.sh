#!/usr/bin/env bash
#
# harness-loop 技能仓库的标准验证路径。
#
# 这个仓库是 skills 的开发源：脚本 + 模板 + 文档，没有构建步骤。
# 验证 = 跑测试套件（它覆盖闸门/熔断器/装配器/技能闭包的行为）。
#
# 本仓库不是 harness 消费方：不跑 /harness-loop，不维护 STATE.md 与账本。
# 那些文件属于用技能装配出来的项目。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Working directory: $PWD"

echo "=== Node version ==="
node --version

echo "=== Test suite ==="
node scripts/test.mjs

echo "=== Pre-commit hook ==="
# 装一次就常驻。断言套件是唯一能拦住"删掉验证条件"这类改动的机制。
if [ "$(git config core.hooksPath || true)" = ".githooks" ]; then
  echo "  hooks path    OK (.githooks)"
else
  git config core.hooksPath .githooks
  echo "  hooks path    installed (.githooks)"
fi

echo "=== Verification Complete ==="
echo
echo "=== Next steps ==="
echo "1. 直接改 skills/<name>/SKILL.md 或 skills/<name>/scripts/*.mjs——那里就是唯一的一份"
echo "2. 改了行为就补断言，再跑一遍本脚本"
echo "3. test.mjs 会检查每个技能的 import 是否自包含、命令路径是否存在"
