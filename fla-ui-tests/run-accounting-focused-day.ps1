<#
.SYNOPSIS
    F8 会計 — do xem WinForm lay NGAY tu DONG DANG FOCUS hay tu NGAY MO MAN HINH.

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1, cung KHONG dung
    run-fix-accounting-data.ps1 (luong do di THANG qua cong ngay de toi
    会計データ修正 va CO GHI so tien; luong nay DUNG LAI o cong ngay).

    ─── Bug dang dieu tra ─────────────────────────────────────────────────────
    Tester bao: focus ngay 25 nhung van lay du lieu ngay 26 de thanh toan.

    Doc source thi WinForm lay ngay tu DONG FOCUS:
      frm203002.cs:7719  intRo = hFG1.CurrentCellAddress.Y
                         modAcc.LetAccData2(con, intRo)     <- truyen DONG
      modAcc.cs:377      strDate = 年月(man hinh) + hFG1[0, intRow]  <- NGAY cua dong
      modAcc.cs:386      khac hom nay -> MsgBox 「本日でありません」 (OkCancel)
      frm203002.cs:7741  formParam.TrtDt = getTrtDt(hFG1[0, CurrentCellAddress.Y])
                         <- ban giao sang 窓口精算 CUNG theo dong focus

    Luong nay DO lai tren may that de bo test doi chieu win-web co moc.

    ─── CO GHI DB KHONG? KHONG ────────────────────────────────────────────────
    Cong ngay (modAcc.cs:379/386) nam TRUOC moi dong ghi, va modAcc.cs KHONG co
    transaction nao (ghi la commit ngay, khong lui duoc). Nen luong cham cong
    ngay roi DUNG:
      「本日でありません」  -> キャンセル  (LetAccData2 tra true, thoat ngay)
      「カーソルを…」      -> OK          (tra false)
      hop thoai la          -> phu dinh + DUNG

    CO Y KHONG do dong co ngay = HOM NAY: o dong do cong ngay im lang va
    LetAccData2 di thang vao deleteTrtDtUnPaid — xoa 未精算 that.

    Van nam sau parity.allowSave: F8 la cua vao so tien, va mot probe "duoc
    thiet ke de khong ghi" van la probe chay tren duong do.

    ⚠️ Cancel o cong ngay lam 診療入力 DONG va 窓口精算 MO (frm203002.cs:7742-7743).
       Probe tu lui ve bang 「F10 戻る」 roi mo lai man hinh.

.PARAMETER Diagnostics
    Chay Tc0 (PROBE): do nam cau hoi, KHONG assert, khong bao gio nem.

.PARAMETER Case
    Loc theo ten testcase, vd "Tc1".

.EXAMPLE
    .\run-accounting-focused-day.ps1 -Diagnostics
    .\run-accounting-focused-day.ps1
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.AccountingFocusedDay"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~AccountingFocusedDayProbeTests"
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
    "--logger", "trx;LogFileName=accounting-focused-day.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "F8 会計: luong DUNG o cong ngay, khong di sau vao so tien." -ForegroundColor Yellow

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "accounting-focused-day.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "accounting-focused-day-KQ.txt"
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
