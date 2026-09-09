<#
.SYNOPSIS
    Chay luong DrugPathB - G2: PATH B cua EditControl.editDrugName, nhanh chay khi
    KHONG tim thay dong MST_DRUG_RX.

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Hai nhanh cua editDrugName (EditControl.cs:1048 / :1137):
      PATH A (da port)  ten thuoc + 数量 + 単位 + 用法 + 用量   <- MST_DRUG_RX x MST_DRUG
      PATH B (CHUA port) trt_nm                                <- MstTrt.getMstTrtDataYaku
                         用法                                   <- SyoPac.getMstMed (MST_MED)

    Ban web KHONG co path B: ResolveDrugHandler tra found = false, roi commitDrugPick
    dung o alertDialog(「この薬剤コードは現在未対応です。」) — treatment-entry-detail.tsx:5077.
    KHONG dong nao roi xuong luoi, trong khi WinForm van chen dong. Do la diem parity G2.

    ⚠️ CHAY -Probe TRUOC TIEN (luat F1). Du lieu dev KHONG co ca nao roi vao path B
    (63/63 ma 600-699 deu co 処置変換 phu ngay test) nen CHUA AI nhin thay nhanh nay
    chay. Sau cau chi DO moi biet:
      KQ-1  Hang rao: bao nhieu ma dang o path B truoc seed; MST_MED co gi.
      KQ-2  Oracle: path B le ra in ra may dong, la nhung dong nao.
      KQ-3  DONG CO ROI XUONG LUOI KHONG — cau quyet dinh cua ca cap parity.
      KQ-4  O 療法・処置 NGUYEN VAN: may dong, dau dem, co hau to 用量 khong.
      KQ-5  点 va 回 co phai score1 va g_cnt khong.
      KQ-6  DOI CHUNG khong co MST_MED => mat dong 用法?
      KQ-7  Hai che do seed co cho cung ket qua khong.
      KQ-8  Bo seed => path A khac han? (doi chung cua CHINH phep seed)
      KQ-9  Path B co dung toi free_wd / o 回 khong.

    ─── GHI DB ────────────────────────────────────────────────────────────────
    ⚠️ CO GHI, va ghi vao BANG 処置変換 DUNG CHUNG CA PHONG KHAM (MST_DRUG_RX).
    Hai che do:
      HideByDate  doi app_st_dt/app_ed_dt cua dong phu ngay test ra 29990101-29991231
                  => getMstDrugRXListJoinMstDrug tra NULL  (hinh dang THAT cua path B)
      BlankDgCd   bo trong dg_cd1..3 => dg_nm[0] rong      (cua thu hai vao path B)

    Fixture chup MOI dong rx cua cac ma dung toi TRUOC khi ghi, IN RA STDOUT, go seed
    sau MOI testcase, va tra lai o OneTimeTearDown. Chet giua chung? Tim dong
    「ANH CHUP MST_DRUG_RX」 trong .trx roi UPDATE tay ve.

    Nam sau co RIENG drugPathB.allowSeed (mac dinh false => tu Ignore TRUOC khi mo app).
    KHONG dung chung drugAmount.allowSeed: ben do sua mst_trt.F2, bang khac, rui ro khac.

    KHONG bam F9 登録 => TRNTRN khong bi dung.

.PARAMETER Case
    Ten testcase le. Bo trong = ca fixture. ⚠️ Luat F7: chay TUNG -Case mot.

.PARAMETER Probe
    Chay fixture PROBE (DrugPathBProbeTests): 9 cau hoi, KHONG assert.

.PARAMETER Seed
    Bat drugPathB.allowSeed = true cho luot chay nay.

.PARAMETER TrtCd
    Ma dem thu. Mac dinh 605 (CO dong MST_MED — do duoc CA HAI dong cua path B).

.PARAMETER ControlTrtCd
    Ma DOI CHUNG, KHONG co dong MST_MED. Mac dinh 630 「ムコスタ錠１００ｍｇ」.

.EXAMPLE
    .\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc0_ProbeMasterData
    .\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc1_ProbePathBRow
    .\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc2_ProbeControlWithoutUsage
    .\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc3_ProbeSeedModesAndPathA
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Probe,
    [switch]$Seed,
    [int]$TrtCd = 0,
    [int]$TrtSb = -1,
    [int]$ControlTrtCd = 0,
    # Ghim 診療日 (yyyy-MM-dd). BAT BUOC khi doi chieu voi ban web: bang master ap dung
    # chon theo ngay, va chinh 「co dong 処置変換 phu ngay nay khong」 la dieu kien re nhanh.
    [string]$TrtDate = "",
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
    $env:OCHA_DRUG_PATH_B_TRT_CD = "$TrtCd"
    Write-Host "OCHA_DRUG_PATH_B_TRT_CD = $TrtCd" -ForegroundColor Cyan
}
if ($TrtSb -ge 0) { $env:OCHA_DRUG_PATH_B_TRT_SB = "$TrtSb" }
if ($ControlTrtCd -gt 0) {
    $env:OCHA_DRUG_PATH_B_CONTROL_TRT_CD = "$ControlTrtCd"
    Write-Host "OCHA_DRUG_PATH_B_CONTROL_TRT_CD = $ControlTrtCd" -ForegroundColor Cyan
}

if ($Seed) {
    $env:OCHA_DRUG_PATH_B_ALLOW_SEED = "1"
    Write-Host ""
    Write-Host "⚠️  SEED BAT — luot nay se GIAU TAM dong MST_DRUG_RX (bang 処置変換 dung chung)." -ForegroundColor Yellow
    Write-Host "   Fixture chup moi dong rx truoc khi ghi, go seed sau MOI testcase," -ForegroundColor Yellow
    Write-Host "   va tra lai o OneTimeTearDown." -ForegroundColor Yellow
    Write-Host "   Chet giua chung? Tim 「ANH CHUP MST_DRUG_RX」 trong .trx roi UPDATE tay ve." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "drugPathB.allowSeed TAT => fixture tu Ignore TRUOC khi mo app." -ForegroundColor Yellow
    Write-Host "Them -Seed de thuc su do duoc gi do." -ForegroundColor Yellow
}
Write-Host "KHONG bam F9 登録 => KHONG co gi roi xuong TRNTRN." -ForegroundColor Green

$ns = "OchaCom.FlaUiTests.Tests.DrugPathB"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI CON.
$class = if ($Probe) { "DrugPathBProbeTests" } else { "DrugPathBTests" }
if ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.$class.$Case"
} else {
    $filter = "FullyQualifiedName~$ns.$class"
    Write-Host ""
    Write-Host "⚠️  Dang chay CA fixture. Luat F7 noi chay tung -Case mot." -ForegroundColor Yellow
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=resolve-drug-path-b.trx"
)

Write-Host ""
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if (-not $Probe) {
    Write-Host "Chua chay -Probe lan nao? Chay no TRUOC (luat F1)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "resolve-drug-path-b.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage nen
    # 「path B」 ra chuoi hong va khong khoi phuc duoc (luat F9).
    $kq = Join-Path $PSScriptRoot "resolve-drug-path-b-KQ.txt"
    $text = [System.IO.File]::ReadAllText($trx.FullName, [System.Text.Encoding]::UTF8)
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $lines = $text -split "`r?`n" |
        Where-Object { $_ -match '=== KQ-' -or $_ -match 'ANH CHUP MST_DRUG_RX|ẢNH CHỤP MST_DRUG_RX' -or
                       $_ -match 'SEED|ĐÃ TRẢ LẠI|KHÔNG TRẢ LẠI|HÀNG RÀO|gỡ seed' -or
                       $_ -match '^\s+\d+/\d+ \d{8}–\d{8}' -or
                       $_ -match '!! buoc|!! bước' -or $_ -match 'IGNORE' } |
        ForEach-Object { $_.Trim() } |
        Select-Object -Unique
    [System.IO.File]::WriteAllLines($kq, $lines, (New-Object System.Text.UTF8Encoding $true))
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. resolve-drug-path-b-KQ.txt - cac dong KQ + ANH CHUP MST_DRUG_RX (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots    - nhat ky tung buoc + anh man hinh"
Write-Host ""
Write-Host "KIEM LAI TRUOC KHI DONG MAY:" -ForegroundColor Yellow
Write-Host "   SELECT COUNT(*) FROM MST_DRUG_RX WHERE app_st_dt = '29990101'   -- phai la 0"
Write-Host "   SELECT trt_cd,trt_sb,app_st_dt,app_ed_dt,dg_cd1 FROM MST_DRUG_RX WHERE trt_cd IN (605,630)"
Write-Host "   -- dg_cd1 phai khac rong (che do BlankDgCd bo trong no)"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
