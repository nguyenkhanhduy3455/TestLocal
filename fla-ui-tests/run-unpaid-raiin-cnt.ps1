<#
.SYNOPSIS
    UNPAID.TRT_CNT (当日来院回数) — do xem F8 会計 chia diem/tien theo LUOT hay theo CA NGAY.

.DESCRIPTION
    Nua WinForm cua web-tenant-tests/tests/unpaid-raiin-cnt-parity.spec.ts (ISSUE-14).

    ─── Bug dang doi chieu ────────────────────────────────────────────────────
    Ban port bo qua intSelectRaiin o CA 5 CHO: InsertUnpaidHandler de trtCnt = 1
    cung, BuiPriceCalcInput.VisitsNo = 0, AccUnitCalculator khong co tham so
    来院回数, va UnpaidDayRows.ForDay loc cung trt_cnt IN (1, 101).

    => benh nhan den 2 lan/ngay: luot 2 XOA MEM roi GHI DE dong cua luot 1 (cung
       trt_cnt = 1), va MOI luot mang diem cua CA NGAY => 窓口精算 thu sai.

    Luong nay do dap an WinForm:
      · seed 3 dong vao ngay test => ngay co HAI luot kham
      · F8 tu dong LUOT 1  -> doc UNPAID
      · F8 tu dong LUOT 2  -> doc UNPAID, xem dong luot 1 con khong

    ⚠️⚠️ LUONG NAY GHI DB — HAI CHO
      1. TRNTRN: seed 3 dong (disp_no 9101-9103). Go o OneTimeTearDown, va buoc
         seed cung tu don dai do truoc khi chen nen chay lai khong cong don.
      2. UNPAID: phai de LetAccData2 chay QUA deleteTrtDtUnPaid + insert thi moi
         doc duoc trt_cnt. modAcc.cs khong co transaction nao de lui.

    Fixture chup anh UNPAID cua NGAY TEST truoc, khoi phuc sau. Nhung do la DUONG
    LUI, khong phai giay phep: TRO patient.patNo VAO BENH NHAN TEST truoc khi chay.

    Nam sau parity.allowSave. Chua bat thi fixture tu bo qua ngay, truoc khi mo app.

.PARAMETER Diagnostics
    Chay Tc0 (PROBE): do bay cau hoi, KHONG assert, khong bao gio nem.

.PARAMETER Case
    Loc theo ten testcase, vd "Tc1".

.PARAMETER TrtDate
    Ngay mo man hinh (yyyy-MM-dd) = NGAY TEST. De trong thi dung patient.trtDate
    trong testsettings(.local).json.

    KHONG mac dinh ve HOM NAY — khac han run-unpaid-syosin-flag.ps1. Ngay test o
    day phai la ngay CO SAN 処置 va co dung MOT dong mo luot (初診/再診), vi seed
    chi THEM luot thu hai chu khong dung ca ngay tu dau. Tro vao mot ngay trong
    thi fixture tu Ignore kem ly do.

.EXAMPLE
    .\run-unpaid-raiin-cnt.ps1 -Diagnostics
    .\run-unpaid-raiin-cnt.ps1
    .\run-unpaid-raiin-cnt.ps1 -TrtDate 2026-08-03
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
if ($TrtDate -ne "") { $env:OCHA_TRT_DT = $TrtDate }

# Fixture assert co BA testcase noi tiep nhau tren cung mot phien app. killOnFail
# giet app ngay o TearDown cua testcase do dau tien, nen moi testcase sau do chay
# tren app DA CHET va do voi ly do gia ("khong thay grdRegi"). Da vap that
# 2026-09-04 tren luong PerioKensaOrder.
$env:OCHA_KILL_ON_FAIL = "0"

$ns = "OchaCom.FlaUiTests.Tests.UnpaidRaiinCnt"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~UnpaidRaiinCntProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~UnpaidRaiinCntTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=unpaid-raiin-cnt.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "GHI DB: seed TRNTRN (disp_no 9101-9103) + F8 ghi UNPAID cua ngay test." -ForegroundColor Yellow

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "unpaid-raiin-cnt.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console bi giai ma theo console codepage nen tieng Nhat thanh rac va KHONG
    # khoi phuc duoc (PROBE-GUIDELINE 3.7). .trx la UTF-8 chuan => loc tu do.
    $kq = Join-Path $PSScriptRoot "unpaid-raiin-cnt-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' (hoac file unpaid-raiin-cnt-KQ.txt)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
