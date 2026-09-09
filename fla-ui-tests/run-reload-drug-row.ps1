<#
.SYNOPSIS
    Chay luong DrugRowReload - G3: DUNG LAI dong thuoc khi LOAD luoi 診療入力.

.DESCRIPTION
    Runner RIENG. KHONG dung run-all-tests.ps1.

    Moi lan nap 診療入力, dong co trt_cd 600-699 KHONG hien trn_trn.dsp_trt da luu.
    No DUNG LAI tu master + freewd roi khoa o:

      modSave.cs:2627-2637  GetTrnRs — luoi THANG HIEN HANH
          if (isCodeRange(drug, trt_cd)) {
              drugInfStr = getDrugName(..., dsp_trt, freewd, true);
              hFG1[2] = drugInfStr.combineDrugNmsStr;      <- dsp_trt bi BO QUA
              if (drugInfStr.drugRxData != null)
                  hFG1[2].ReadOnly = true;                 <- CHI khi path A
          } else {
              hFG1[2] = REGIRYO_PADLEFT + dsp_trt;         <- ma khac hien nguyen van
          }

      modSave.cs:4961-4974  luoi QUA KHU — y het, nhung ReadOnly VO DIEU KIEN

    Ban web doc thang dspTrt (treatment-table-mapper.ts:160,234), khong co nhanh
    isDrugCode nao o luong load => lech khi master doi hoac freewd khac mac dinh.

    ⚠️ CHAY -Probe TRUOC TIEN (luat F1). Tam cau chi DO moi biet:
      KQ-1  Seed da vao TRNTRN chua; master cua ma dem thu ra sao.
      KQ-2  CHUOI BIA trong dsp_trt CO HIEN RA KHONG — cau quyet dinh (web TC-1).
      KQ-3  Hai dong CUNG ma chi khac freewd co ra hai chuoi KHAC nhau khong (web TC-2).
      KQ-4  O 療法・処置 co KHOA khong (thu mo editor, khong doc thuoc tinh).
      KQ-5  点 / 回 co dung bang gia tri da luu khong (app KHONG tinh lai).
      KQ-6  DOI CHUNG ngoai dai 600-699 phai hien NGUYEN VAN dsp_trt va KHONG khoa.
      KQ-7  O nguyen van co may dong, co hau to 用量 khong.
      KQ-8  Dong PATH B khi LOAD: 処置名称 + 用法, KHONG hau to 用量, KHONG khoa (web TC-3).

    ─── BON DONG SEED (ba dong dau DUNG BANG ve Playwright) ───────────────────
      点 771  602/0  freewd ""   dsp_trt ｽﾃｰﾙ…1   path A, master nguyen ban
      点 772  602/0  freewd "2"  dsp_trt ｽﾃｰﾙ…2   path A, freewd khac mac dinh
      点 773  694/0  freewd ""   dsp_trt ｽﾃｰﾙ…3   path B (ma SEED, khong co RX)
      点 774  110/0  freewd ""   dsp_trt ｽﾃｰﾙ…4   DOI CHUNG (ve web chua co)

    ─── GHI DB ────────────────────────────────────────────────────────────────
    ⚠️ NANG NHAT CUA CA BO: chen dong vao TRNTRN — 処置行 THAT cua benh nhan.

    Khong co duong nao khac: thu dang do la duong LOAD, nen du lieu phai nam san
    trong DB TRUOC khi man hinh mo. Va de phan biet 「hien dsp_trt da luu」 voi
    「dung lai tu master」 thi dsp_trt phai duoc dat KHAC HAN — tuc mot chuoi bia.

    Ba hang rao:
      1. Co RIENG drugRowReload.allowSeed (mac dinh TAT).
      2. CHI CHEN dong mang DISP_NO rieng (9201-9204) va MOT ma master moi (694) —
         khong bao gio sua/xoa dong co san. Don la DELETE dung khoa vua tao.
      3. Chen bang CLONE mot dong co san cua chinh benh nhan test roi ghi de vai cot,
         nen moi cot NOT NULL (枝番, 保険, DrNo, 32 cot BUI...) deu dung boi canh.

    KHONG bam F9 登録 => khong co gi khac bi ghi de.

.PARAMETER Case
    Ten testcase le (Tc0_ProbeSeededData, Tc1_ProbeDrugRowOnLoad,
    Tc2_ProbeFreeWdChangesAmount, Tc3_ProbePathBRowOnLoad,
    Tc4_ProbeNonDrugRowShowsDspTrt). Bo trong = ca fixture (chi 1 vong giao dien).

.PARAMETER Probe
    Chay fixture PROBE (DrugRowReloadProbeTests): 8 cau hoi, KHONG assert.

.PARAMETER Seed
    Bat drugRowReload.allowSeed = true cho luot chay nay.

.EXAMPLE
    # ⚠️ GHIM 診療日 dung bang ve Playwright (OTHER_DAY = 01 neu hom nay >= 15, con lai 28)
    .\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-01
    .\run-reload-drug-row.ps1 -Probe -Seed -TrtDate 2026-09-01 -Case Tc3_ProbePathBRowOnLoad
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Probe,
    [switch]$Seed,
    [int]$TrtCd = 0,
    [int]$DispNo = 0,
    [int]$PathBTrtCd = 0,
    # Ghim 診療日 (yyyy-MM-dd). BAT BUOC khi doi chieu voi ban web: dong seed phai nam
    # dung ngay ma ca hai ben cung mo.
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
if ($TrtCd -gt 0)  { $env:OCHA_DRUG_RELOAD_TRT_CD = "$TrtCd" }
if ($DispNo -gt 0) { $env:OCHA_DRUG_RELOAD_DISP_NO = "$DispNo" }
if ($PathBTrtCd -gt 0) { $env:OCHA_DRUG_RELOAD_PATH_B_TRT_CD = "$PathBTrtCd" }

if ($Seed) {
    $env:OCHA_DRUG_RELOAD_ALLOW_SEED = "1"
    Write-Host ""
    Write-Host "⚠️  SEED BAT — luot nay CHEN DONG VAO TRNTRN (処置行 THAT cua benh nhan)." -ForegroundColor Red
    Write-Host "   Chi chen DISP_NO rieng (mac dinh 9201-9204) + ma master 694, khong sua/xoa dong co san." -ForegroundColor Yellow
    Write-Host "   Fixture in ra TRNTRN truoc khi seed va tu DELETE o OneTimeTearDown." -ForegroundColor Yellow
    Write-Host ""
} else {
    Write-Host "drugRowReload.allowSeed TAT => fixture tu Ignore TRUOC khi mo app." -ForegroundColor Yellow
    Write-Host "Them -Seed de thuc su do duoc gi do." -ForegroundColor Yellow
}
Write-Host "KHONG bam F9 登録." -ForegroundColor Green

$ns = "OchaCom.FlaUiTests.Tests.DrugRowReload"

$class = if ($Probe) { "DrugRowReloadProbeTests" } else { "DrugRowReloadTests" }
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
    "--logger", "trx;LogFileName=reload-drug-row.trx"
)

Write-Host ""
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if (-not $Probe) {
    Write-Host "Chua chay -Probe lan nao? Chay no TRUOC (luat F1)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "reload-drug-row.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage nen
    # 「path B」 ra chuoi hong va khong khoi phuc duoc (luat F9).
    $kq = Join-Path $PSScriptRoot "reload-drug-row-KQ.txt"
    $text = [System.IO.File]::ReadAllText($trx.FullName, [System.Text.Encoding]::UTF8)
    $text = [System.Net.WebUtility]::HtmlDecode($text)
    $lines = $text -split "`r?`n" |
        Where-Object { $_ -match '=== KQ-' -or $_ -match 'TRNTRN cua benh nhan|TRNTRN của bệnh nhân' -or
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
Write-Host "1. reload-drug-row-KQ.txt - cac dong KQ + anh chup TRNTRN (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots    - nhat ky tung buoc + anh man hinh"
Write-Host ""
Write-Host "KIEM LAI TRUOC KHI DONG MAY:" -ForegroundColor Yellow
Write-Host "   SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO BETWEEN 9201 AND 9204   -- phai la 0"
Write-Host "   SELECT COUNT(*) FROM MST_TRT266 WHERE TRT_CD = 694                -- phai la 0"
Write-Host "   SELECT COUNT(*) FROM MST_MED    WHERE TRT_CD = 694                -- phai la 0"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
