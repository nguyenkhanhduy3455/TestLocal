<#
.SYNOPSIS
    E00100 一部負担金計算失敗 — do xem WinForm bat hop thoai roi CHAY TIEP the nao.

.DESCRIPTION
    Nua WinForm cua
    web-tenant-tests/tests/accounting-unpaid/bui-price-e00100-parity.spec.ts.

    Phim -> ham WinForm:
      mo 診療入力  -> ModSave.GetTrnRs -> modAcc.Calc_BuiPriceData2s -> buiPrice.getBuiPrice2
      F4 当日来患  -> frm203001.getTodayViewData -> buiPrice.getBuiPrice2 (tung dong)

    ─── Cai dang do ───────────────────────────────────────────────────────────
    getBuiPrice2 TU BAT ngoai le, bat E00100 roi tra buiPriceData2 toan 0 cho noi
    goi (buiPrice.cs:196-203). Ca 8 noi goi deu chay tiep voi so 0 — KHONG noi nao
    bo do man hinh hay job in. Ban web truoc day nem lai thanh 500 => mot benh nhan
    du lieu loi lam chet ca danh sach.

    Con mot nhanh THU HAI, khac han va bang web KHONG co: khi PUBEXPINF.LFLG tro
    vao ma khong ton tai trong LOCALFLG, buiPrice.cs:1734 bat E00100 voi cau
    「福祉医療設定データが存在しません」 roi va localFlg mac dinh va chay tiep.
    BuiPriceService.cs:936 cua ban web ghi ro "no UI here" — tuc la CO Y bo.

    ─── Vi sao phai seed ──────────────────────────────────────────────────────
    Ben Playwright chen `warnings` vao response bang page.route. Ben nay khong gia
    lap duoc: getBuiPrice2 doc thang SQL Server trong tien trinh app. Da do het cac
    cot co the pha, BA trong BON y tuong chet vi KIEU COT (do tren SIM2000 that):
      buiPrice.cs:1652  PUBEXPINF.QualificationDate      = date     => khong nhet rac duoc
      buiPrice.cs:976   MEDINSINF...ValidStartDate       = date     => nhu tren
      buiPrice.cs:921   CARE_INSURANCE.bur_rate_1        = tinyint  => nhu tren
      buiPrice.cs:1734  PUBEXPINF.LFLG                   = varchar(8) => DUONG DUY NHAT

.PARAMETER Seed
    Chay nhom CO SEED nhanh (B) 「福祉医療設定データが存在しません」. Bat luon
    buiPrice.allowSeed.

    ⚠️ GHI DB — hai cho, deu cua RIENG benh nhan test:
       1. INSURANCE.PUBEXPINF_NO cua 枝番 nho nhat  (dang 0 => moi dong 公費 bi bo qua,
          PatInfoList.cs:678 — chi INSERT PUBEXPINF thoi la seed KHONG co tac dung)
       2. mot dong PUBEXPINF mang LFLG khong co trong LOCALFLG
    Fixture chup anh ca hai o PrepareDataBeforeApp va tra lai o OneTimeTearDown.
    TRO patient.patNo VAO BENH NHAN TEST truoc khi chay.

.PARAMETER Exception
    Chay nhom nhanh (A) 「患者登録データを確認してください」 — dung hop thoai ma spec
    Playwright mo phong, kem 内容[] va 場所[stack trace].

    Nhanh nay chi toi duoc voi benh nhan 70歳以上 医保 (buiPrice.cs:990-998) nen seed
    doi THEM INSURANCE.INS_KBN -> 2 va OLD_FLG -> 4, va no con chay CHUOI F8 会計 nen
    dung toi UNPAID cua ngay test (deleteTrtDtUnPaid o modAcc.cs:427 chay TRUOC moi
    cong hop thoai). Ca ba deu duoc chup anh va tra lai.

    Bat luon buiPrice.allowSeed, giong -Seed.

.PARAMETER Control
    Dung VOI -Exception. Chay seed DOI CHUNG: doi DUNG hai cot ma nhanh (A) buoc
    phai doi (INS_KBN -> 2, OLD_FLG -> 4) va KHONG chen dong 公費 nao => guard
    pubexpInfs.Count > 0 (buiPrice.cs:997) chan ngay, KHONG co E00100 nao.

    De tra loi: luot -Exception ket thuc bang 「システムエラーです。」 va khong sang
    窓口精算 — do E00100, hay chi vi benh nhan test bi doi thanh 国保 前期高齢者?
    So chuoi F8 hai luot: giong nhau => thu pham la INS_KBN, khac nhau => la E00100.

.PARAMETER Diagnostics
    Chay fixture PROBE ([Explicit]): do, KHONG assert, khong bao gio nem.
    Dap an nam o cac dong "=== KQ-n ===", runner loc san ra calc-bui-price-KQ.txt.

.PARAMETER Case
    Loc theo ten testcase, vd "TcClean1".

.PARAMETER TrtDate
    Ngay mo man hinh (yyyy-MM-dd). De trong thi dung patient.trtDate.

    KHONG mac dinh ve HOM NAY: ngay test phai CO SAN 処置, neu khong thi 日計 toan 0
    va F4 当日来患 khong co dong nao — probe chay xong ma khong do duoc gi.

.EXAMPLE
    .\run-calc-bui-price.ps1 -Diagnostics
    .\run-calc-bui-price.ps1 -Diagnostics -Seed
    .\run-calc-bui-price.ps1 -Diagnostics -Exception
    .\run-calc-bui-price.ps1 -Diagnostics -Exception -Control
    .\run-calc-bui-price.ps1 -TrtDate 2026-08-03
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [string]$TrtDate = "",
    [switch]$Seed,
    [switch]$Exception,
    [switch]$Control,
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($TrtDate -ne "") { $env:OCHA_TRT_DT = $TrtDate }

# Fixture assert co nhieu testcase NOI TIEP tren cung mot phien app. killOnFail giet
# app ngay o TearDown cua testcase do dau tien, nen moi testcase sau do chay tren app
# DA CHET va do voi ly do gia ("khong thay grdRegi"). Da vap that 2026-09-04 o
# luong PerioKensaOrder.
$env:OCHA_KILL_ON_FAIL = "0"

# Co bat TU DONG khi -Seed, va TAT HAN khi khong -Seed. Tat la co chu y: bo nay co hai
# nhom testcase trong CUNG mot namespace, va de co bat sot tu lan chay truoc thi nhom
# "sach" se chay tren du lieu DA HONG — no do E00100 that va bao "du lieu that hong".
$env:OCHA_BUI_PRICE_ALLOW_SEED = if ($Seed -or $Exception) { "1" } else { "0" }
$env:OCHA_BUI_PRICE_CONTROL     = if ($Control) { "1" } else { "0" }

$ns = "OchaCom.FlaUiTests.Tests.BuiPriceE00100"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = if ($Exception) { "FullyQualifiedName~BuiPriceE00100ExceptionProbeTests" }
              elseif ($Seed)   { "FullyQualifiedName~BuiPriceE00100SeedProbeTests" }
              else             { "FullyQualifiedName~BuiPriceE00100CleanProbeTests" }
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} elseif ($Exception) {
    $filter = "FullyQualifiedName~BuiPriceE00100ExceptionTests"
} elseif ($Seed) {
    $filter = "FullyQualifiedName~BuiPriceE00100SeedTests"
} else {
    $filter = "FullyQualifiedName~BuiPriceE00100CleanTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=calc-bui-price.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if ($Exception) {
    Write-Host "GHI DB: INSURANCE (PUBEXPINF_NO + INS_KBN + OLD_FLG) + 1 dong PUBEXPINF + UNPAID cua ngay test (co khoi phuc)." -ForegroundColor Yellow
} elseif ($Seed) {
    Write-Host "GHI DB: INSURANCE.PUBEXPINF_NO + 1 dong PUBEXPINF cua benh nhan test (co khoi phuc)." -ForegroundColor Yellow
} else {
    Write-Host "CHI DOC: nhom nay khang dinh du lieu THAT khong sinh E00100 nao." -ForegroundColor Green
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "calc-bui-price.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console bi giai ma theo console codepage nen tieng Nhat thanh rac va KHONG
    # khoi phuc duoc (PROBE-GUIDELINE 3.7). .trx la UTF-8 chuan => loc tu do.
    $kq = Join-Path $PSScriptRoot "calc-bui-price-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' (hoac file calc-bui-price-KQ.txt)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
