<#
.SYNOPSIS
    Lái 診療入力 F9 登録 → modSave.SaveData (処置データ登録) trên WinForm thật,
    để xác minh các bug parity của hàm đó.

    Mã nguồn: Tests/ParitySaveData/

.DESCRIPTION
    Runner RIÊNG của luồng này, không dùng chung với run-all-tests.ps1.

    Lý do tách: đây là luồng DUY NHẤT bấm F9 登録 nên GHI THẬT xuống DB, có tiền đề
    riêng (parity.allowSave, bệnh nhân test) và có cả công cụ chẩn đoán riêng. Gộp vào
    runner chung thì mỗi lần muốn chạy nó lại phải nhớ đúng chuỗi -Filter, và chạy nhầm
    cả bộ sẽ tốn vài phút cho những fixture không liên quan.

    ⚠️ F9 登録 ghi lại TOÀN BỘ 処置行 của tháng đó (xoá + chèn lại, disp_no đánh số lại
    từ 1). Phải trỏ patient.patNo vào BỆNH NHÂN TEST.

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá máy,
    không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    Chạy công cụ chẩn đoán thay vì testcase: đổ cây UIA của dialog 部位選択 và của hộp
    thoại F9. Cần chạy cái này trước khi viết được testcase cho BUG-2a/2b/2c.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc2d1".

.EXAMPLE
    .\run-save-treatment-data.ps1
    .\run-save-treatment-data.ps1 -Case Tc2d1
    .\run-save-treatment-data.ps1 -StepMs 1200      # chạy chậm để ngồi nhìn
    .\run-save-treatment-data.ps1 -Diagnostics      # đổ cây UIA dialog 部位選択
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

# Cả luồng nằm trong một namespace ⇒ lọc theo namespace là đủ, không cần liệt kê tên lớp.
$ns = "OchaCom.FlaUiTests.Tests.ParitySaveData"

if ($Diagnostics) {
    # Công cụ chẩn đoán có [Explicit] nên phải gọi đích danh mới chạy.
    $filter = "FullyQualifiedName~$ns.BuiDialogDiagnosticsTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.Bug2d"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=save-treatment-data.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Gui lai HAI thu nay ===" -ForegroundColor Yellow
Write-Host "1. C:\OCHACOM_Logs\investigation.log   (findstr SONTEST1)  - log tu BEN TRONG WinForm"
Write-Host "2. $artifacts   - nhat ky tung buoc + anh man hinh phia test"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
