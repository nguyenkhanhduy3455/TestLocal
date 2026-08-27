<#
.SYNOPSIS
    Chay luong GuideSidePanel — tab 「ガイド」 cua 診療入力 (frm203002):
      hfgGuid1_CellDoubleClick → frm203017 「ガイド処置選択」

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Day la nua WinForm cua spec Playwright
      ..\web-tenant-tests\tests\guide-sidepanel-handler.spec.ts
    Bang tuong ung tung testcase nam o
    src\OchaCom.FlaUiTests\Tests\GuideSidePanel\README.md muc 3.

    ⚠️ CHAY -Diagnostics TRUOC TIEN. PROBE-GUIDELINE muc 2 la luat: chua biet app
       hanh xu ra sao thi DO truoc, dung viet assert theo phong doan roi chay ca
       fixture de xem no do o dau.

       Nam cau chi DO moi biet:
         1. Header luoi doc ra 「№」 hay 「No.」 (Designer noi 「№」).
         2. 「Shift+F4」 di duoc duong nao — giu Shift + F4, hay lat lop phim
            btnShift roi bam btnF4_S. WinForm re theo ShiftFlg chu khong theo
            phim bo tro cua lan bam do (BaseForm.cs:613 / frm203002.cs:775).
         3. O 選択№ co loc ky tu khong.
         4. Nguyen van cau hoi Q00100 cua 「リセット」.
         5. ガイド nao khong co 処置 => dialog tu dong kem cau gi.

    ─── GHI DB ────────────────────────────────────────────────────────────────
    KHONG bam F9 登録 cua frm203002 => khong co gi roi xuong DB.
    Nut 「リセット」 CO ghi (StepReset → UPDATE TRTSTATE) nen moi cho bam no deu
    tra loi キャンセル/いいえ. F9 確定 cua frm203017 chi day 処置 vao luoi tren bo
    nho — nam sau co guideSidePanel.allowCommit, mac dinh tat.

    ─── AN TOAN ───────────────────────────────────────────────────────────────
    TUYET DOI KHONG dong frm203017 bang Escape: Escape o dialog do goi
    btnF9_Click, tuc 確定 (frm203017.cs:180-182). Luon dong bang F10.

.PARAMETER Case
    Ten testcase le. Ten bat dau bang Tc0/Tc1/Tc2 duoc hieu la testcase cua
    fixture PROBE; con lai la cua fixture assert. Bo trong = ca fixture assert.

.PARAMETER Diagnostics
    Chay ca ba testcase PROBE: 18 cau hoi, KHONG assert, khong bao gio nem.

.EXAMPLE
    .\run-select-guide-treatment.ps1 -Diagnostics
    .\run-select-guide-treatment.ps1 -Case Tc0_ProbeOpenGuideTab -StepMs 1200
    .\run-select-guide-treatment.ps1
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

$ns = "OchaCom.FlaUiTests.Tests.GuideSidePanel"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI CON,
# nen loc "GuideSidePanelTests" ma khong can than se vot ca GuideSidePanelProbeTests.
if ($Diagnostics -and $Case -eq "") {
    $filter = "FullyQualifiedName~$ns.GuideSidePanelProbeTests"
} elseif ($Case -like "Tc0*" -or $Case -like "Tc1_Probe*" -or $Case -like "Tc2_Probe*" -or $Diagnostics) {
    $filter = "FullyQualifiedName~$ns.GuideSidePanelProbeTests.$Case"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.GuideSidePanelTests&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.GuideSidePanelTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=select-guide-treatment.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG bam F9 登録; 「リセット」 luon tra loi キャンセル => KHONG ghi DB." -ForegroundColor Green
if (-not $Diagnostics) {
    Write-Host "Chua chay -Diagnostics lan nao? Chay no TRUOC (PROBE-GUIDELINE muc 2)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "select-guide-treatment.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage nen
    # 「診療入力」 ra 「診療?E??E」 va khong khoi phuc duoc (PROBE-GUIDELINE 3.7).
    $kq = Join-Path $PSScriptRoot "select-guide-treatment-KQ.txt"
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
Write-Host "1. select-guide-treatment-KQ.txt - cac dong KQ (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots        - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
