<#
.SYNOPSIS
    Chay luong DrugAmountSelect - G1: hop thoai 「薬剤使用量選択」 frm203020, cai bung ra
    khi chot mot ma thuoc co mst_trt.F2 = 1 (数量変更可).

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Day la nua WinForm cua phan CHUA PORT ben ochacom-saas:
      · ResolveDrugHandler.cs:33  lay diem thang tu mst_trt.score1
      · DrugNameEditor.cs:25      「The 数量変更 (free_wd) override is not wired」
    Bang tuong ung tung testcase nam o
    src\OchaCom.FlaUiTests\Tests\DrugAmountSelect\README.md muc 4.

    ⚠️ CHAY -Probe TRUOC TIEN (luat F1). Chua ai mo duoc hop thoai nay tren may that,
    nen moi assert viet bay gio deu la phong doan. Sau cau chi DO moi biet:
      KQ-3   Go ma mot 枝番 thi 処置選択 co hien khong (source noi KHONG).
      KQ-4   Luoi hop thoai co may cot ra toi UIA, va CellFormatting chen dau cach o dau.
      KQ-5   薬価合計 / 点数 luc vua mo - co bang oracle, co bang score1.
      KQ-6   Nut that ten gi.
      KQ-7   Click MOT lan vao o 薬剤名称 co lam 使用量 +1 khong.
      KQ-8   Go thang so vao o 使用量 roi roi o - CellValidating an khong.
      KQ-9   確定 xong, o 療法・処置 in ra 数量 MOI hay CU.
      KQ-10  Mo lai lan HAI trong cung phien app - con duoc khong (bay dataLineSource).
      KQ-11  Ma DOI CHUNG F2 = 0 - hop thoai KHONG mo, dung khong.

    ─── GHI DB ────────────────────────────────────────────────────────────────
    ⚠️ CO GHI, va ghi vao BANG MASTER DUNG CHUNG CA PHONG KHAM:

        UPDATE MST_TRT<nnn> SET F2 = 1 WHERE TRT_CD = <trtCd> AND TRT_SB = <trtSb>

    Bat buoc vi du lieu dev co 0 dong F2 = 1 (do 2026-09-09 tren MST_TRT266) - khong
    seed thi hop thoai KHONG BAO GIO mo va moi testcase deu xanh vi chang do gi.

    Fixture chup F2 TRUOC khi ghi, IN RA STDOUT, va tra lai o OneTimeTearDown. Neu mot
    luot chay chet giua chung: tim dong 「ANH CHUP F2」 trong .trx roi UPDATE tay ve.

    Nam sau co RIENG drugAmount.allowSeed (mac dinh false => fixture tu Ignore TRUOC khi
    mo app). KHONG dung chung parity.allowSave.

    F9 登録 nam sau mot co KHAC nua - drugAmount.allowSave. Khong bat thi khong co gi
    roi xuong TRNTRN.

    ─── AN TOAN ───────────────────────────────────────────────────────────────
    TUYET DOI KHONG dong frm203020 bang Escape: formBase_KeyDown anh xa Escape ->
    btnF9_Click, tuc 確定 (frm203020.cs:153-155). Phim End cung vay (:150-152).
    Luon dong bang nut 「F10 戻る」.

.PARAMETER Case
    Ten testcase le (vd Tc0_ProbeMasterData, Tc1_ProbeOpenAndShape). Bo trong = ca fixture.
    ⚠️ Luat F7: chay TUNG -Case mot, dung chay ca fixture trong mot luot.

.PARAMETER Probe
    Chay fixture PROBE (DrugAmountProbeTests): 11 cau hoi, KHONG assert.

.PARAMETER Seed
    Bat drugAmount.allowSeed = true cho luot chay nay (OCHA_DRUG_AMOUNT_ALLOW_SEED=1).

.PARAMETER TrtCd
    Ghim ma thuoc dem thu. Mac dinh 605 (「ｵｾﾞｯｸｽ150ｍｇ３T」, 28.60 x 3 = 85.80 => 9 diem).

.EXAMPLE
    .\run-select-drug-amount.ps1 -Probe -Seed -Case Tc0_ProbeMasterData
    .\run-select-drug-amount.ps1 -Probe -Seed -Case Tc1_ProbeOpenAndShape
    .\run-select-drug-amount.ps1 -Probe -Seed -Case Tc2_ProbeChangeAmount
    .\run-select-drug-amount.ps1 -Probe -Seed -Case Tc3_ProbeReopenAndControl
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Probe,
    [switch]$Seed,
    # Cho phep bam F9 登録 => GHI THAT xuong TRNTRN. Mac dinh tat.
    [switch]$AllowSave,
    [int]$TrtCd = 0,
    [int]$TrtSb = -1,
    # Ma DOI CHUNG (F2 giu 0). Dat 690 de do nhanh 回数 khi g_cnt = 0 tren duong
    # KHONG qua hop thoai — chinh cho ma diem lech 回数 da di lot.
    [int]$ControlTrtCd = 0,
    # Ghim 診療日 (yyyy-MM-dd). BAT BUOC khi doi chieu voi ban web: bang master ap dung
    # (MST_TRT266...) chon theo ngay, ma 薬価 va 使用量 mac dinh deu doc tu ban do.
    [string]$TrtDate = "",
    # Ghim benh nhan. May Windows dang de patNo=10 trong testsettings.local.json.
    [string]$PatNo = "",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($TrtDate -ne "") {
    $env:OCHA_TRT_DT = $TrtDate
    Write-Host "OCHA_TRT_DT = $TrtDate" -ForegroundColor Cyan
}
if ($PatNo -ne "") {
    $env:OCHA_PAT_NO = $PatNo
    Write-Host "OCHA_PAT_NO = $PatNo" -ForegroundColor Cyan
}
if ($TrtCd -gt 0) {
    $env:OCHA_DRUG_AMOUNT_TRT_CD = "$TrtCd"
    Write-Host "OCHA_DRUG_AMOUNT_TRT_CD = $TrtCd" -ForegroundColor Cyan
}
if ($TrtSb -ge 0) { $env:OCHA_DRUG_AMOUNT_TRT_SB = "$TrtSb" }
if ($ControlTrtCd -gt 0) {
    $env:OCHA_DRUG_AMOUNT_CONTROL_TRT_CD = "$ControlTrtCd"
    Write-Host "OCHA_DRUG_AMOUNT_CONTROL_TRT_CD = $ControlTrtCd" -ForegroundColor Cyan
}

if ($Seed) {
    $env:OCHA_DRUG_AMOUNT_ALLOW_SEED = "1"
    Write-Host ""
    Write-Host "⚠️  SEED BAT — luot nay se UPDATE mst_trt.F2 = 1 tren BANG MASTER." -ForegroundColor Yellow
    Write-Host "   Fixture chup F2 truoc khi ghi va tra lai o OneTimeTearDown." -ForegroundColor Yellow
    Write-Host "   Chet giua chung? Tim dong 「ANH CHUP F2」 trong .trx roi UPDATE tay ve." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "drugAmount.allowSeed TAT => fixture tu Ignore TRUOC khi mo app." -ForegroundColor Yellow
    Write-Host "Them -Seed de thuc su do duoc gi do." -ForegroundColor Yellow
}

if ($AllowSave) {
    $env:OCHA_DRUG_AMOUNT_ALLOW_SAVE = "1"
    Write-Host "⚠️  F9 登録 BAT — se GHI THAT xuong TRNTRN (xoa + chen lai ca thang)." -ForegroundColor Red
} else {
    Write-Host "F9 登録 TAT => KHONG co gi roi xuong TRNTRN." -ForegroundColor Green
}

$ns = "OchaCom.FlaUiTests.Tests.DrugAmountSelect"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI CON,
# nen loc "DrugAmountTests" ma khong can than se vot ca DrugAmountProbeTests.
$class = if ($Probe) { "DrugAmountProbeTests" } else { "DrugAmountTests" }
if ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.$class.$Case"
} else {
    $filter = "FullyQualifiedName~$ns.$class"
    Write-Host ""
    Write-Host "⚠️  Dang chay CA fixture. Luat F7 noi chay tung -Case mot:" -ForegroundColor Yellow
    Write-Host "    moi vong giao dien ton 2-3 phut, tran wrapper la 15 phut." -ForegroundColor Yellow
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=select-drug-amount.trx"
)

Write-Host ""
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if (-not $Probe) {
    Write-Host "Chua chay -Probe lan nao? Chay no TRUOC (luat F1)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "select-drug-amount.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage nen
    # 「薬剤使用量選択」 ra chuoi hong va khong khoi phuc duoc (luat F9).
    $kq = Join-Path $PSScriptRoot "select-drug-amount-KQ.txt"
    $text = [System.IO.File]::ReadAllText($trx.FullName, [System.Text.Encoding]::UTF8)
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $lines = $text -split "`r?`n" |
        Where-Object { $_ -match '=== KQ-' -or $_ -match 'ANH CHUP F2|ẢNH CHỤP F2' -or
                       $_ -match 'SEED —|ĐÃ TRẢ LẠI|KHÔNG TRẢ LẠI|HÀNG RÀO' -or
                       $_ -match '!! buoc|!! bước' -or $_ -match 'IGNORE' } |
        ForEach-Object { $_.Trim() } |
        Select-Object -Unique
    [System.IO.File]::WriteAllLines($kq, $lines, (New-Object System.Text.UTF8Encoding $true))
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. select-drug-amount-KQ.txt - cac dong KQ + ANH CHUP F2 (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots    - nhat ky tung buoc + anh man hinh"
Write-Host ""
Write-Host "KIEM LAI TRUOC KHI DONG MAY:" -ForegroundColor Yellow
Write-Host "   SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1    -- phai ve dung so ban dau (0)"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
