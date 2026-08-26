<#
.SYNOPSIS
    Chay luong TreatmentHeaderStaff — vung 「Ｄｒ」 tren header 処置入力:
      lblDrLabel (caption) click = 一括変更 ca ngay  (frm203002.cs:8105-8130)
      lbDr       (TextBox) = 担当医 CUA DONG con tro (Chg_DrName, modMain.cs:2125)
      cboDr      (ComboBox)= 担当医 cho DONG THEM MOI (Visible=false, :2478)

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Nua WinForm cua ..\web-tenant-tests\tests\treatment-header-staff.spec.ts,
    cung so hieu TC. Bang tuong ung o
    src\OchaCom.FlaUiTests\Tests\TreatmentHeaderStaff\README.md muc 3.

    ⚠️ CHAY -Diagnostics TRUOC TIEN (PROBE-GUIDELINE muc 2).

    ─── KHONG GHI DB ──────────────────────────────────────────────────────────
    KHONG bam F9 登録. 一括変更 chi sua LUOI TRONG BO NHO, roi man hinh la mat —
    dung nhu ban Playwright («KHONG can TEST_ALLOW_SAVE»). PROBE chi bam 「いいえ」.

.PARAMETER Case
    Ten testcase le, vd "TcLbl1". Bo trong = ca fixture assert.

.PARAMETER Diagnostics
    Chay Tc0 (PROBE): do tam cau hoi, KHONG assert.

.EXAMPLE
    .\run-bulk-change-dr.ps1 -Diagnostics
    .\run-bulk-change-dr.ps1
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

$ns = "OchaCom.FlaUiTests.Tests.TreatmentHeaderStaff"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` so KHOP CHUOI CON,
# nen ten ngan long vao nhau (loc "...StaffTests" se vot ca "...StaffProbeTests").
if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.TreatmentHeaderStaffProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.TreatmentHeaderStaffTests&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.TreatmentHeaderStaffTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=bulk-change-dr.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG bam F9 => 一括変更 chi sua luoi trong bo nho, dong man hinh khong luu la sach." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "bulk-change-dr.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # PHAI doc .trx bang UTF8 TUONG MINH — PowerShell 5.1 doan theo console codepage
    # (932 tren may nay) va moi dong tieng Nhat ra rac (PROBE-GUIDELINE 3.7).
    $kq = Join-Path $PSScriptRoot "bulk-change-dr-KQ.txt"
    $text = [System.IO.File]::ReadAllText($trx.FullName, [System.Text.Encoding]::UTF8)
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $lines = $text -split "`r?`n" |
        Where-Object { $_ -match '=== KQ-' -or $_ -match '!! buoc|!! bước' -or $_ -match 'IGNORE' } |
        ForEach-Object { $_.Trim() } |
        Select-Object -Unique
    [System.IO.File]::WriteAllLines($kq, $lines, (New-Object System.Text.UTF8Encoding $true))
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. bulk-change-dr-KQ.txt   - cac dong KQ (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

exit $exit
