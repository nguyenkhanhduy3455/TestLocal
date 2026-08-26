<#
.SYNOPSIS
    UNPAID.SFLG (初診フラグ) — do xem F8 会計 ghi ra 1 / 2 / 3 nhu the nao.

.DESCRIPTION
    Runner RIENG.

    ─── Bug dang dieu tra ─────────────────────────────────────────────────────
    Tester: "he thong cu 2 ngay ra 2 va 3, nhung web ra 2 va 2".
    Anh chup UNPAID he cu: benh nhan 100 ngay 25 -> SFLG 3, ngay 26 -> SFLG 2.

    He ma cua modAcc: 1=初診 / 2=再診 / 3=再初診 (modAcc.cs:465-476).
    KHONG phai he ma cua buiPrice (1/2/4) — modAcc tu tinh intSyosin roi ghi
    thang vao UNPAID (modAcc.cs:639/686/710/751), tham chi de nguoc len buiPrice.

    ⚠️⚠️ LUONG NAY GHI DB — khac han run-accounting-focused-day.ps1
    Luong kia DUNG o cong ngay nen khong ghi gi. O day phai de LetAccData2 chay
    QUA deleteTrtDtUnPaid va insert thi moi doc duoc UNPAID.SFLG. modAcc.cs
    khong co transaction nao de lui.

    Fixture tu chup anh UNPAID cua benh nhan TRUOC, chay, doc, roi khoi phuc o
    OneTimeTearDown. Nhung do la DUONG LUI, khong phai giay phep:
    TRO patient.patNo VAO BENH NHAN TEST truoc khi chay.

    Nam sau parity.allowSave. Chua bat thi fixture tu bo qua ngay.

.PARAMETER Diagnostics
    Chay Tc0 (PROBE): do nam cau hoi, KHONG assert, khong bao gio nem.

.PARAMETER Case
    Loc theo ten testcase, vd "TcDate2".

.PARAMETER TrtDate
    Ngay mo man hinh (yyyy-MM-dd). MAC DINH = HOM NAY, va do la CO Y: bug chi lo
    ra khi ngay mo man hinh = hom nay con con tro o ngay cu. Tro vao ngay cu thi
    testcase van xanh nhung mat kha nang phan biet.

.EXAMPLE
    .\run-unpaid-syosin-flag.ps1 -Diagnostics
    .\run-unpaid-syosin-flag.ps1
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [string]$TrtDate = "",
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

# ── MO MAN HINH O NGAY HOM NAY — day la TIEN DE CUA CHINH CAI BUG ──────────────
#
# Bug chi lo ra khi NGAY MO MAN HINH = hom nay con CON TRO o ngay cu. Va do cung
# la thu lam cho phep do PHAN BIET DUOC hai gia thuyet:
#
#   mo man hinh o HOM NAY, con tro o dong ngay 3
#     · neu 会計対象日 lay theo DONG CON TRO  -> 3 != hom nay -> CO hoi
#     · neu lay theo NGAY MAN HINH           -> = hom nay    -> KHONG hoi
#
# Neu de patient.trtDate tro vao mot ngay cu (vd 2026-08-03) thi CA HAI gia thuyet
# deu du doan "co hoi", va testcase mat het kha nang phan biet — van xanh nhung
# khong chung minh duoc gi.
#
# grdRegi giu CA THANG nen mo o hom nay van con day du cac dong ngay cu de dat
# con tro vao.
if ($TrtDate -ne "") {
    $env:OCHA_TRT_DT = $TrtDate
} else {
    $env:OCHA_TRT_DT = (Get-Date -Format "yyyy-MM-dd")
}
Write-Host "Mo man hinh o ngay: $($env:OCHA_TRT_DT)  (hom nay = $(Get-Date -Format 'yyyy-MM-dd'))" -ForegroundColor Cyan

$ns = "OchaCom.FlaUiTests.Tests.UnpaidSyosinFlag"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~UnpaidSyosinProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=unpaid-syosin-flag.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "F8 会計: luong DUNG o cong ngay, khong di sau vao so tien." -ForegroundColor Yellow

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "unpaid-syosin-flag.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "unpaid-syosin-flag-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' trong log tren"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
