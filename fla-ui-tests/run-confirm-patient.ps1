<#
.SYNOPSIS
    Chạy luồng PatientSelectAssign — 患者確定 của 診療入力（患者選択）:
      frm203001.defData → chốt 担当医 / 衛生士 rồi mới mở 処置入力 frm203002

.DESCRIPTION
    Runner RIÊNG. KHÔNG dùng run-all-tests.ps1.

    Đây là nửa WinForm của hai spec Playwright:
      ..\web-tenant-tests\tests\patient-select-dr-staff-required.spec.ts
      ..\web-tenant-tests\tests\patient-select-assign-parity.spec.ts   (spec đối chiếu)
    Bảng tương ứng từng testcase nằm ở
    src\OchaCom.FlaUiTests\Tests\PatientSelectAssign\README.md muc 3.

    ⚠️ CHẠY -Diagnostics TRƯỚC TIÊN. Luồng này chưa chạy lần nào trên máy thật;
       PROBE-GUIDELINE muc 2 la luat: chua biet app hanh xu ra sao thi do truoc,
       dung viet assert theo phong doan roi chay ca fixture de xem no do o dau.

       Ba cau chi DO moi biet:
         1. Nguyen van E00005 / E00027 trong bang MSGTBL (source KHONG co).
         2. Header 処置入力 lay Ｄｒ．tu nguon nao khi combo chon != att_dr.
         3. Double-click tren luoi 受付一覧 co mo man khong (source noi KHONG).

    ─── KHÔNG GHI DB ──────────────────────────────────────────────────────────
    KHONG bam F9 登録, KHONG seed dong `wait`. Day la cho KHAC ban Playwright:
    ben do ensureWaitRow chen roi xoa mot dong 受付, con DB ben nay la DB THAT
    cua phong kham (SIM2000) va `wait` la hang doi tiep nhan dang chay — nhanh
    nao can dong 受付 ma may khong co san thi testcase tu Ignore.

    Moi hop thoai 「保存しますか？」 gap phai deu tra loi いいえ.

    ─── TIEN DE ───────────────────────────────────────────────────────────────
    · db.enabled = true (moi 患者番号 / Ｄｒ．deu DO TU DB luc chay, khong hard-code)
    · App dang o メインメニュー hoac 患者選択. Neu app dang dung o 診療入力 thi
      luong nay BAO LOI thay vi bam F10 mo — F10 co the bung 「保存しますか？」.
      Dong 診療入力 (khong luu) hoac tat han MENU.exe roi chay lai.

.PARAMETER Case
    Ten testcase le. Ten bat dau bang Tc0/Tc1_Probe duoc hieu la testcase cua
    fixture PROBE (vd Tc1_ProbeWaitList); con lai la cua fixture assert (vd Tc3).
    Bo trong = ca fixture assert.

.PARAMETER Diagnostics
    Chay Tc0 (PROBE): do muoi cau hoi, KHONG assert, khong bao gio nem.

.EXAMPLE
    .\run-confirm-patient.ps1 -Diagnostics
    .\run-confirm-patient.ps1
    .\run-confirm-patient.ps1 -Case Tc4 -StepMs 1200
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

$ns = "OchaCom.FlaUiTests.Tests.PatientSelectAssign"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI
# CON, nen ten ngan long vao nhau: loc "PatientSelectAssignTests" ma khong can than
# se vot ca PatientSelectAssignProbeTests. Bai hoc da tra gia o run-high-needs-freewd.ps1.
if ($Diagnostics -and $Case -eq "") {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~$ns.PatientSelectAssignProbeTests"
} elseif ($Case -like "Tc0*" -or $Case -like "Tc1_Probe*" -or $Diagnostics) {
    # Testcase le NAM TRONG fixture PROBE — vd Tc1_ProbeWaitList. Phai loc theo lop
    # PROBE, khong phai lop assert, neu khong `dotnet test` bao "No test matches".
    $filter = "FullyQualifiedName~$ns.PatientSelectAssignProbeTests.$Case"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.PatientSelectAssignTests&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.PatientSelectAssignTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=confirm-patient.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG bam F9 登録, KHONG seed bang wait => KHONG ghi DB." -ForegroundColor Green
if (-not $Diagnostics) {
    Write-Host "Chua chay -Diagnostics lan nao? Chay no TRUOC (PROBE-GUIDELINE muc 2)." -ForegroundColor Yellow
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "confirm-patient.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage
    # nen 「診療入力」 ra 「診療�E劁E」 va khong khoi phuc duoc (PROBE-GUIDELINE 3.7).
    $kq = Join-Path $PSScriptRoot "confirm-patient-KQ.txt"
    # PHAI doc .trx bang UTF8 TUONG MINH. Select-String / Get-Content khong co -Encoding
    # thi PowerShell 5.1 doan theo ANSI (console codepage 932 tren may nay) va moi dong
    # tieng Nhat ra rac — dung cai bay PROBE-GUIDELINE 3.7, chi khac cho doc.
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
Write-Host "1. confirm-patient-KQ.txt   - cac dong KQ (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots    - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
