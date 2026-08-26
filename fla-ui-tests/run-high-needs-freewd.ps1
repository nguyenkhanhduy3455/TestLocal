<#
.SYNOPSIS
    Chạy luồng HighNeedsFreewd — câu hỏi 歯科診療困難者加算 và ô ẩn hFG1[72]
    (= TRNTRN.FREEWD) của 診療入力.

.DESCRIPTION
    Runner RIÊNG. KHÔNG dùng run-all-tests.ps1.

    Đây là nửa WinForm của ..\web-tenant-tests\tests\auto-santei-high-needs-freewd.spec.ts.
    Bảng tương ứng từng testcase nằm ở
    src\OchaCom.FlaUiTests\Tests\HighNeedsFreewd\README.md muc 4.

    ⚠️ CHẠY -Diagnostics TRƯỚC TIÊN. Luồng này chưa chạy lần nào trên máy thật;
       PROBE-GUIDELINE muc 2 la luat: chua biet app hanh xu ra sao thi do truoc,
       dung viet assert theo phong doan roi chay ca fixture de xem no do o dau.

    ─── GHI DB ────────────────────────────────────────────────────────────────
    Câu hỏi chỉ bung ra khi insurance.dis_flg = 3, mà DB đo ngày 2026-08-26
    KHÔNG có bệnh nhân nào như vậy (chỉ 0/1/2). Nên nhóm testcase đó phải VÁ TẠM
    insurance.dis_flg rồi trả lại nguyên trạng — bật bằng -AllowDisFlgPatch.
    Không bật thì nhóm đó tự Ignore, nhóm đo 「KHÔNG được hỏi」 vẫn chạy.

    -AllowSave chỉ cần khi muốn kiểm cả đường xuống DB (F9 登録 → TRNTRN.FREEWD).
    Mặc định TẮT: cột ẩn đọc thẳng được trên lưới nên phần lớn testcase không
    cần lưu gì cả.

.PARAMETER Diagnostics
    Chạy Tc0 (PROBE): đo sáu câu hỏi, KHÔNG assert, không bao giờ ném.

.PARAMETER AllowDisFlgPatch
    Cho phép vá tạm insurance.dis_flg = 3 rồi khôi phục.

.PARAMETER AllowSave
    Cho phép bấm F9 登録 (ghi thật TRNTRN của cả tháng).

.PARAMETER PatNo
    Bệnh nhân đem mượn để vá dis_flg. Mặc định = patient.patNo.

.EXAMPLE
    .\run-high-needs-freewd.ps1 -Diagnostics
    .\run-high-needs-freewd.ps1
    .\run-high-needs-freewd.ps1 -AllowDisFlgPatch
    .\run-high-needs-freewd.ps1 -Case Tc3
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [switch]$AllowDisFlgPatch,
    [switch]$AllowSave,
    [string]$PatNo = "",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0)      { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowDisFlgPatch)  { $env:OCHA_HIGH_NEEDS_PATCH = "1" }
if ($AllowSave)         { $env:OCHA_HIGH_NEEDS_SAVE = "1" }
if ($PatNo -ne "")      { $env:OCHA_HIGH_NEEDS_PAT_NO = $PatNo }

$ns = "OchaCom.FlaUiTests.Tests.HighNeedsFreewd"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nên lượt chạy đủ không gọi tới; lọc đích danh thì chạy.
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~Tc0"
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
    "--logger", "trx;LogFileName=high-needs-freewd.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if ($AllowDisFlgPatch) {
    Write-Host "CANH BAO: se VA TAM insurance.dis_flg = 3 roi khoi phuc." -ForegroundColor Yellow
}
if ($AllowSave) {
    Write-Host "CANH BAO: se bam F9 登録 => GHI THAT toan bo 処置行 cua thang." -ForegroundColor Red
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "high-needs-freewd.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "high-needs-freewd-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' trong log tren"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
