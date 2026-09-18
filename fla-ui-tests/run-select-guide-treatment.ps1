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

.PARAMETER Reset
    Chay fixture GuideResetProbeTests — nut 「リセット」 co bung Q00100 khi con tro
    dung o dong KHONG co 病名 khong, va cu OK o do de lai gi.

      TcR0   dump grdRegi kem cot an 40 (DIS_CD1) / 51 (linekbn) + TRTSTATE.
             CHAY CAI NAY TRUOC — no cho biet dong nao la kich ban A, dong nao la B.
      TcR1A  moc doi chieu: dong CO 病名. KHONG BAO GIO bam OK o ca nay.
      TcR1B  cau hoi chinh: dong KHONG co 病名.

    Mac dinh ca TcR1B cung chi DOC cau hoi roi tra loi キャンセル. Muon bam OK thi
    them -AllowOk (no dat OCHA_GUIDE_RESET_ALLOW_OK=1 cho tien trinh con).

    Co nam o BIEN MOI TRUONG chu khong o testsettings.json co chu y: may Windows
    dang co ban TestSettings.cs sua do cua luong khac, them muc moi vao do la keo
    theo mot lan tron file khong lien quan gi toi phep do nay.

    Nhanh OK chi ghi vao TRTSTATE, va GuideResetDb chup / in / tra lai quanh cu
    bam (F20). Voi dong KHONG co 病名 thi setResetData roi vao `default: break;`
    nen cau UPDATE ghi lai dung gia tri vua doc — day la thu can CHUNG MINH bang
    so do, khong phai suy tu source.

.EXAMPLE
    .\run-select-guide-treatment.ps1 -Diagnostics
    .\run-select-guide-treatment.ps1 -Case Tc0_ProbeOpenGuideTab -StepMs 1200
    .\run-select-guide-treatment.ps1 -Reset -Case TcR0
    .\run-select-guide-treatment.ps1 -Reset -Case TcR1A
    .\run-select-guide-treatment.ps1 -Reset -Case TcR1B
    .\run-select-guide-treatment.ps1 -Reset -Case TcR1B -AllowOk   # cau 1.4: bam OK
    .\run-select-guide-treatment.ps1
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [switch]$Reset,
    [switch]$AllowOk,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

# -AllowOk => dat bien moi truong cho TIEN TRINH CON (dotnet test).
#
# PHAI di qua runner, khong the "set bien roi ssh chay task": schtasks khoi dong
# task trong mot moi truong RIENG, bien dat o phien SSH khong bao gio toi duoc no.
if ($AllowOk) { $env:OCHA_GUIDE_RESET_ALLOW_OK = "1" }

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.GuideSidePanel"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI CON,
# nen loc "GuideSidePanelTests" ma khong can than se vot ca GuideSidePanelProbeTests.
if ($Reset -or $Case -like "TcR*") {
    # Fixture rieng cho nut 「リセット」. Loc theo TEN LOP DAY DU: "GuideReset" khong
    # long vao "GuideSidePanel", nhung -Case rong thi phai ghim ca lop lai.
    $filter =
        if ($Case -ne "") { "FullyQualifiedName~$ns.GuideResetProbeTests.$Case" }
        else              { "FullyQualifiedName~$ns.GuideResetProbeTests" }
} elseif ($Diagnostics -and $Case -eq "") {
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
if ($Reset -or $Case -like "TcR*") {
    if ($env:OCHA_GUIDE_RESET_ALLOW_OK -in @("1", "true", "True")) {
        Write-Host "OCHA_GUIDE_RESET_ALLOW_OK = BAT: TcR1B se bam OK va GHI vao TRTSTATE." -ForegroundColor Red
        Write-Host "  Chi kich ban B (dong KHONG co 病名) moi bam; TcR1A khong bao gio bam." -ForegroundColor Red
        Write-Host "  GuideResetDb chup dau luot, in ra stdout, va tra lai o OneTimeTearDown." -ForegroundColor Red
    } else {
        Write-Host "OCHA_GUIDE_RESET_ALLOW_OK = tat => chi DOC cau hoi roi tra loi キャンセル. KHONG ghi DB." -ForegroundColor Green
    }
} else {
    Write-Host "KHONG bam F9 登録; 「リセット」 luon tra loi キャンセル => KHONG ghi DB." -ForegroundColor Green
    if (-not $Diagnostics) {
        Write-Host "Chua chay -Diagnostics lan nao? Chay no TRUOC (PROBE-GUIDELINE muc 2)." -ForegroundColor Yellow
    }
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
