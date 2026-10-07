#!/usr/bin/env bash
# Phase B — một kịch bản GHI DB: nhân bản lại bệnh nhân → chạy hai vế (run-case.sh) → so DB.
#
#   tools/parity-snapshot/run-write-case.sh SaveCodeEntry            # 3948 → 993948, ngày 2026-06-28
#
# Mỗi lượt nhân bản LẠI từ đầu, nên các kịch bản không dính nhau. Lệch DB nền (có sẵn trước
# thao tác) nằm ở capture-results/parity-snapshot/db-baseline-<pat>.txt — chỉ phần KHÁC nền
# mới do thao tác.
set -uo pipefail
CASE=${1:?usage: run-write-case.sh <Case> [src] [dst] [trtDt]}
SRC=${2:-3948}; DST=${3:-993948}; DT=${4:-2026-06-28}
HERE=$(cd "$(dirname "$0")" && pwd)
OUT="$HERE/../../capture-results/parity-snapshot"
KEBAB=$(printf '%s' "$CASE" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')

"$HERE/clone-patient.sh" "$SRC" "$DST" || exit 1
"$HERE/run-case.sh" "$CASE" "$DST" "$DT"
echo "▶ [$CASE] DB"
node "$HERE/db-diff.mjs" "$DST" --save "$KEBAB" | tee "$OUT/db-$KEBAB-$DST.txt"
echo "▶ [$CASE] DB — khác với nền:"
diff <(grep -v '^$' "$OUT/db-baseline-$DST.txt") <(grep -v '^$' "$OUT/db-$KEBAB-$DST.txt") || true
