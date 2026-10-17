#!/usr/bin/env bash
#
# 标准启动与验证路径。
# 由 loop-harness 的 harness-stage.mjs 程序化生成，或手工替换下方命令。
#
# 若无法自动生成，手工设置 INSTALL_CMD / VERIFY_CMD / START_CMD 三个数组。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "==> Working directory: $PWD"

# ---- 替换以下三个数组为项目实际命令 ----
INSTALL_CMD=(npm install)
VERIFY_CMD=(npm test)
START_CMD=(npm run dev)
# ----------------------------------------

echo "==> Installing dependencies"
"${INSTALL_CMD[@]}"

echo "==> Running baseline verification"
"${VERIFY_CMD[@]}"

echo "==> Verification complete"
echo "==> Start command (not executed):"
printf '    %q' "${START_CMD[@]}"
echo
echo "    Set RUN_START_COMMAND=1 if you want init.sh to launch the app directly."

if [ "${RUN_START_COMMAND:-0}" = "1" ]; then
  echo "==> Launching application"
  exec "${START_CMD[@]}"
fi

echo
echo "=== Next steps ==="
echo "1. Read feature_list.json to see feature status"
echo "2. Select ONE unfinished feature"
echo "3. Implement only that feature"
echo "4. Re-run verification before claiming completion"
