<#
.SYNOPSIS
    来患一覧 (frm204008) — do dap an WinForm cua cot レセプト種別 de doi chieu parity voi ban web.

.DESCRIPTION
    Nua WinForm cua web-tenant-tests/tests/patient-visit-list-rcp-type.spec.ts.

    ─── Dang do cai gi ────────────────────────────────────────────────────────
    Ban web bi bao "レセプト種別 luon null", va khi soat lai lo ra bug KHAC o dung cot do:
    buiPrice.getReceiptType ghi 単独 NGUOC vao patInfoData.ins.combi_kbn (buiPrice.cs:1563).
    WinForm lay lai patInfo cho TUNG dong (frm204008.cs:711) nen ghi de khong lan; ban web
    dung lai mot instance Insurance xuyen cac ngay.

    Luong nay do DAP AN WinForm cho cung mot 診療年月 (mac dinh 200601, dung thang ma spec
    Playwright dung) roi so voi mot oracle dung tu insurance/medinsinf.

    ─── CHI DOC ───────────────────────────────────────────────────────────────
    Khong seed, khong bam F9, khong ghi DB. Thu duy nhat ghi ra dia la file CSV do
    F4 CSV出力 sinh, nam trong thu muc artifacts cua chinh bo test.

    ─── Duong vao ─────────────────────────────────────────────────────────────
    メインメニュー → 日常業務 → 窓口精算 (frm204001) → F3 「来患一覧」 → frm204008.

.PARAMETER Diagnostics
    Chay Tc0a..Tc0d (PROBE): do 9 cau hoi, KHONG assert, khong bao gio nem.

.PARAMETER Case
    Loc theo ten testcase, vd "Tc0b".

.PARAMETER SinryoYm
    診療年月 yyyyMM. De trong thi dung visitList.sinryoYm trong testsettings(.local).json.

    ⚠️ Dung tro vao thang co hang tram benh nhan: frm204008 goi getBuiPrice2 cho TUNG
    (benh nhan x ngay). Thang 600 benh nhan cua dataset demo chay hang chuc phut, vuot
    tran TimeoutMinutes cua wrapper va lam TREO ca may Windows chu khong chi do.

.EXAMPLE
    .\run-patient-visit-list.ps1 -Diagnostics
    .\run-patient-visit-list.ps1
    .\run-patient-visit-list.ps1 -SinryoYm 200602
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [string]$SinryoYm = "",
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($SinryoYm -ne "") { $env:OCHA_SINRYO_YM = $SinryoYm }

# Fixture assert co nhieu testcase noi tiep nhau tren cung mot phien app va cung mot lan
# 集計 (mot lan 集計 ton hang phut). killOnFail giet app ngay o TearDown cua testcase do
# dau tien, nen moi testcase sau chay tren app DA CHET va do voi ly do gia. Da vap that
# 2026-09-04 tren luong PerioKensaOrder.
$env:OCHA_KILL_ON_FAIL = "0"

$ns = "OchaCom.FlaUiTests.Tests.PatientVisitList"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~PatientVisitListProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~PatientVisitListTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=patient-visit-list.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "CHI DOC: mo 来患一覧, bam 集計, doc luoi, F4 xuat CSV. Khong ghi DB." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "patient-visit-list.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console bi giai ma theo console codepage nen tieng Nhat thanh rac va KHONG khoi
    # phuc duoc (PROBE-GUIDELINE 3.7). .trx la UTF-8 chuan => loc tu do.
    $kq = Join-Path $PSScriptRoot "patient-visit-list-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' (hoac file patient-visit-list-KQ.txt)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"
Write-Host "3. $artifacts\visit-list-*.csv  - dap an tho cua WinForm"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
