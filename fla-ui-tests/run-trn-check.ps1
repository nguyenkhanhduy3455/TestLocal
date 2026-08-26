<#
.SYNOPSIS
    Chạy luồng TrnCheck — 診療チェック của 診療入力, cả hai cửa:
      · 一括  (F3)  → frm203002.TrnChk → panel 処置データチェック (grdChek / lbChk)
      · 行単位      → INP/Lib/SingleChk.cs → một MessageBox W00100 cho MỖI câu

.DESCRIPTION
    Runner RIÊNG. KHÔNG dùng run-all-tests.ps1.

    Đây là nửa WinForm của hai spec Playwright:
      ..\web-tenant-tests\tests\trn-chk-sweep.spec.ts         (TC-BASE/ROL999/BUIDIS)
      ..\web-tenant-tests\tests\single-check-w00100.spec.ts   (WinForm parity 1..6)
    Bảng tương ứng từng testcase nằm ở
    src\OchaCom.FlaUiTests\Tests\TrnCheck\README.md muc 3.

    ⚠️ CHẠY -Diagnostics TRƯỚC TIÊN. Luồng này chưa chạy lần nào trên máy thật;
       PROBE-GUIDELINE muc 2 la luat: chua biet app hanh xu ra sao thi do truoc,
       dung viet assert theo phong doan roi chay ca fixture de xem no do o dau.

    ─── KHÔNG GHI DB ──────────────────────────────────────────────────────────
    Bộ này chèn dòng 処置 vào LƯỚI nhưng KHÔNG bấm F9 登録, nên không có dòng nào
    xuống DB — đóng màn hình mà không lưu là sạch. Đúng cùng tính chất với spec
    web («Spec KHÔNG bấm F9 nên KHÔNG cần TEST_ALLOW_SAVE»).

    Lý do WinForm phải chèn qua giao diện thay vì seed DB như bên web: TrnChk đọc
    `(DataTable)grdRegi.DataSource` (frm203002.cs:5184) — tức lưới đang mở trong
    RAM. Seed DB xong mà không mở lại màn hình thì check không thấy gì.

.PARAMETER Case
    Nhom hoac ten testcase le:
      Sweep / Bulk   -> TrnCheckSweepTests     (一括 F3, TC-BASE/ROL999/BUIDIS)
      Single / W00100-> SingleChkW00100Tests   (行単位, WinForm parity 1..6)
      con lai        -> loc theo ten method, vd "TcBase"

    ⚠️ CHAY TUNG NHOM MOT. app.attachIfRunning = true nen nhom thu hai bam vao
       app ma nhom thu nhat da mo, va luoi cua no da bi chen day dong スケーリング
       tu luot truoc — moc cua TC-BASE khong con sach.
       Giua hai luot: dong 診療入力 KHONG luu, hoac tat han MENU.exe.

.PARAMETER Diagnostics
    Chạy Tc0 (PROBE): đo chín câu hỏi, KHÔNG assert, không bao giờ ném.

.EXAMPLE
    .\run-trn-check.ps1 -Diagnostics
    .\run-trn-check.ps1 -Case Sweep
    .\run-trn-check.ps1 -Case Single
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

$ns = "OchaCom.FlaUiTests.Tests.TrnCheck"

# LOC THEO TEN LOP DAY DU — `--filter FullyQualifiedName~<chuoi>` la so KHOP CHUOI
# CON, nen ten ngan long vao nhau. Bai hoc da tra gia o run-high-needs-freewd.ps1
# (dong 82-87): -Case Asked vot ca fixture NotAsked.
$groups = @{
    'Sweep'   = 'TrnCheckSweepTests'
    'Bulk'    = 'TrnCheckSweepTests'
    'Single'  = 'SingleChkW00100Tests'
    'W00100'  = 'SingleChkW00100Tests'
    'ProbeTree'   = 'TrnCheckProbe2Tests.Tc1_ProbePanelTree'
    'ProbeInsert' = 'TrnCheckProbe2Tests.Tc2_ProbeInsert'
    'ProbeW00100' = 'TrnCheckProbe2Tests.Tc3_ProbeW00100'
}

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nên lượt chạy đủ không gọi tới; lọc đích danh thì chạy.
    $filter = "FullyQualifiedName~TrnCheckProbeTests"
} elseif ($groups.ContainsKey($Case)) {
    $filter = "FullyQualifiedName~$($groups[$Case])"
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
    "--logger", "trx;LogFileName=trn-check.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG bam F9 登録 => KHONG ghi DB. Luoi bi chen them dong スケーリング, dong man hinh khong luu la sach." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "trn-check.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Doc tu .trx chu KHONG tu stdout: PowerShell giai ma stdout theo console codepage
    # nen 「診療入力」 ra 「診療�E劁E」 va khong khoi phuc duoc (PROBE-GUIDELINE 3.7).
    $kq = Join-Path $PSScriptRoot "trn-check-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. trn-check-KQ.txt  - cac dong KQ-1..KQ-9 (UTF-8 sach, doc tu .trx)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
