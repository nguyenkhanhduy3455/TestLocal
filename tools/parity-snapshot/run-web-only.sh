#!/usr/bin/env bash
# Chạy LẠI riêng vế web của một kịch bản (vế WinForm đã có JSON) rồi diff màn + (Phase B) DB.
#   tools/parity-snapshot/run-web-only.sh SaveCodeEntry 993948 2026-06-28
set -uo pipefail
export LC_ALL=C
CASE=${1:?}; PAT=${2:-3948}; DT=${3:-2026-06-28}
HERE=$(cd "$(dirname "$0")" && pwd); ROOT="$HERE/../.."; OUT="$ROOT/capture-results/parity-snapshot"
KEBAB=$(printf '%s' "$CASE" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')
(cd "$ROOT/web-tenant-tests" && TEST_PAT_NO=$PAT TEST_TRT_DT=$DT npx playwright test tests/parity-snapshot/ -g "case:$KEBAB\$" \
    --workers=1 --retries=0 --reporter=line 2>&1 | grep -E "SNAPSHOT|Error|passed|failed" | sed 's/^/    /')
node "$HERE/diff.mjs" "$OUT/winform-$KEBAB-$PAT-$DT.json" "$OUT/web-$KEBAB-$PAT-$DT.json"
if (( PAT >= 990000 )); then
    node "$HERE/db-diff.mjs" "$PAT" --save "$KEBAB" > "$OUT/db-$KEBAB-$PAT.txt"
    echo "▶ DB — khác với nền:"
    diff <(grep -v '^$' "$OUT/db-baseline-$PAT.txt") <(grep -v '^$' "$OUT/db-$KEBAB-$PAT.txt") && echo "(không khác nền)"
fi
