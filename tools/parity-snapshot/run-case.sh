#!/usr/bin/env bash
# Parity 診療入力 — chạy MỘT kịch bản trên cả hai vế rồi diff.
#
#   tools/parity-snapshot/run-case.sh Open                 # bệnh nhân/ngày mặc định 3948 / 2026-06-28
#   tools/parity-snapshot/run-case.sh Open 3948 2026-06-28
#
# Kịch bản = tên method trong fla-ui-tests/.../Tests/ParitySnapshot/InpSnapshotTests.cs
# (PascalCase); vế web là test `case:<kebab-case>` trong web-tenant-tests/tests/parity-snapshot/.
#
# Vế WinForm đi đúng FLA-UI-GUIDELINE: kiểm máy sống (F25), không trigger khi lượt trước chưa
# END (F8), chạy qua Scheduled Task FlaUI-Tests-Run + logs\command.txt (F5), poll ngắn (F6).
set -euo pipefail
# Log của runner có byte tiếng Nhật hỏng codepage (F9) — tr/grep ở locale UTF-8 sẽ báo
# 「Illegal byte sequence」 và nuốt mất dòng END. So khớp theo byte.
export LC_ALL=C

CASE=${1:?usage: run-case.sh <Case> [patNo] [trtDt]}
PAT=${2:-3948}
DT=${3:-2026-06-28}
KEBAB=$(printf '%s' "$CASE" | sed -E 's/([a-z0-9])([A-Z])/\1-\2/g' | tr '[:upper:]' '[:lower:]')

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT="$ROOT/capture-results/parity-snapshot"
WIN_ROOT='C:/TCG/TestLocal'
SNAP_SRC="fla-ui-tests/src/OchaCom.FlaUiTests/Tests/ParitySnapshot"
TIMEOUT_S=${PARITY_WIN_TIMEOUT_S:-900}
mkdir -p "$OUT"

win() { ssh -o BatchMode=yes -o ConnectTimeout=10 ochacom-win "$@"; }

echo "▶ [$CASE] kiểm máy Windows"
win 'hostname' >/dev/null || { echo "✘ ochacom-win không phản hồi (xem tailscale status)"; exit 2; }
last=$(win "Get-Content $WIN_ROOT/fla-ui-tests/logs/runner.log -Tail 1" | tr -d '\r')
if [[ "$last" != *"runner-task END"* ]]; then
    echo "✘ lượt trước chưa END: $last"; exit 2
fi

echo "▶ [$CASE] đồng bộ file kịch bản sang Windows"
win "New-Item -ItemType Directory -Force -Path $WIN_ROOT/$SNAP_SRC | Out-Null"
scp -q "$ROOT/$SNAP_SRC"/*.cs "ochacom-win:$WIN_ROOT/$SNAP_SRC/"
scp -q "$ROOT/fla-ui-tests/run-inp-snapshot.ps1" "ochacom-win:$WIN_ROOT/fla-ui-tests/run-inp-snapshot.ps1"
# Phase B dùng chung luồng tạo 未精算 (WalkCreateUnpaid).
UNPAID=fla-ui-tests/src/OchaCom.FlaUiTests/Tests/UnpaidSyosinFlag/UnpaidCreationFlow.cs
scp -q "$ROOT/$UNPAID" "ochacom-win:$WIN_ROOT/$UNPAID"

echo "▶ [$CASE] WinForm: trigger FlaUI-Tests-Run"
before=$(win "(Get-Content $WIN_ROOT/fla-ui-tests/logs/runner.log).Count" | tr -d '\r')
win "Set-Content $WIN_ROOT/fla-ui-tests/logs/command.txt 'run-inp-snapshot.ps1 -PatNo $PAT -TrtDt $DT -Case $CASE'; schtasks /run /tn FlaUI-Tests-Run | Out-Null"

start=$(date +%s)
while :; do
    sleep 10
    tail_lines=$(win "Get-Content $WIN_ROOT/fla-ui-tests/logs/runner.log | Select-Object -Skip $before" | tr -d '\r' || true)
    if grep -q "runner-task END" <<<"$tail_lines"; then break; fi
    if (( $(date +%s) - start > TIMEOUT_S )); then
        echo "✘ WinForm quá ${TIMEOUT_S}s — xem ảnh mới nhất trong logs\\ (FLA-UI-GUIDELINE F2)"; exit 3
    fi
done
grep -E "SNAPSHOT|Passed|Failed|error|rc " <<<"$tail_lines" | sed 's/^/    /' || true

WIN_JSON="winform-$KEBAB-$PAT-$DT.json"
scp -q "ochacom-win:$WIN_ROOT/capture-results/parity-snapshot/$WIN_JSON" "$OUT/" ||
    { echo "✘ WinForm không ghi ra $WIN_JSON"; exit 4; }

echo "▶ [$CASE] web"
(cd "$ROOT/web-tenant-tests" &&
    TEST_PAT_NO=$PAT TEST_TRT_DT=$DT npx playwright test tests/parity-snapshot/ -g "case:$KEBAB\$" \
        --workers=1 --retries=0 --reporter=line 2>&1 | grep -E "SNAPSHOT|Error|passed|failed" | sed 's/^/    /')

echo "▶ [$CASE] diff"
node "$ROOT/tools/parity-snapshot/diff.mjs" "$OUT/$WIN_JSON" "$OUT/web-$KEBAB-$PAT-$DT.json"
