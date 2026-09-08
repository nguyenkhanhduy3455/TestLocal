<#
.SYNOPSIS
    Chay luong GuideDialog - dialog 「ガイド処置選択」 frm203017, cai mo ra khi click
    mot dong o tab ガイド cua 診療入力 (frm203002).

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Day la nua WinForm cua spec Playwright
      ..\web-tenant-tests\tests\side-panel\guide-selection-dialog-format.spec.ts
    Bang tuong ung tung testcase nam o
    src\OchaCom.FlaUiTests\Tests\GuideSidePanel\GUIDE-DIALOG-README.md muc 3.

    Cau hoi cua luong nay KHAC luong run-select-guide-treatment.ps1: ben do do
    TAB ガイド (list, o 選択№, ba nut), ben nay do CHINH DIALOG - dinh dang
    (tieu de, header cot, be rong cot, dau cach cua CellFormatting, mau nen/mau
    chu) va cac items hien thi.

    ⚠️ CHAY -Probe TRUOC TIEN (luat F1). Sau cau chi DO moi biet:
      1. Header cot 1 doc ra 「 ｺｰﾄﾞ」 (nua chieu rong + dau cach) hay 「コード」.
      2. CellFormatting co chen dau cach vao MOI o khong.
      3. Vua mo dialog thi con tro nam o cot nao, dong nao.
      4. Click DON co lam 回数 +1 khong, va vuot tran thi ve 0 o dau.
      5. Cot 「回数」 co that su khong sort duoc khong.
      6. Dong bang 戻る roi mo lai thi 回数 vua sua con khong.

    ─── GHI DB ────────────────────────────────────────────────────────────────
    KHONG bam F9 cua frm203017 va KHONG bam F9 登録 cua frm203002 => khong co gi
    roi xuong DB. Sua 回数 trong dialog roi dong bang 戻る la vo hai: setPacData
    chi chay o nhanh F9.

    ─── AN TOAN ───────────────────────────────────────────────────────────────
    TUYET DOI KHONG dong frm203017 bang Escape: Escape o dialog do goi
    btnF9_Click, tuc 確定 (frm203017.cs:180-182). Luon dong bang nut 「F10 戻る」.

.PARAMETER Case
    Ten testcase le (vd TcD1_ProbeDialogBehaviour, TcD3). Bo trong = ca fixture.

.PARAMETER Probe
    Chay fixture PROBE (GuideDialogProbeTests): 16 cau hoi, KHONG assert.

.EXAMPLE
    .\run-open-guide-dialog.ps1 -Probe
    .\run-open-guide-dialog.ps1 -Probe -Case TcD0_ProbeDialogFormat
    .\run-open-guide-dialog.ps1
    .\run-open-guide-dialog.ps1 -Case TcD5
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Probe,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.GuideSidePanel"

# LOC THEO TEN LOP DAY DU - `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI CON,
# nen loc "GuideDialogTests" ma khong can than se vot ca GuideDialogProbeTests.
$class = if ($Probe) { "GuideDialogProbeTests" } else { "GuideDialogTests" }
if ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.$class.$Case"
} else {
    $filter = "FullyQualifiedName~$ns.$class"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=open-guide-dialog.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG bam F9 => KHONG ghi DB." -ForegroundColor Green
if (-not $Probe) {
    Write-Host "Chua chay -Probe lan nao? Chay no TRUOC (luat F1)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "open-guide-dialog.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage nen
    # 「診療入力」 ra 「診療?E??E」 va khong khoi phuc duoc (luat F9).
    $kq = Join-Path $PSScriptRoot "open-guide-dialog-KQ.txt"
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
Write-Host "1. open-guide-dialog-KQ.txt - cac dong KQ (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots    - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
