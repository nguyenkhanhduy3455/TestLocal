<#
.SYNOPSIS
    Chạy luồng StepsEdit — xác minh frm203050 「Ｓｔｅｐ編集」 mở được từ menu Step.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-tests.ps1 và cũng KHÔNG dùng
    run-parity-savedata.ps1 / run-parity-accounting.ps1.

    Lý do tách: mục 「Step」 trong menu của frm203002 là menu item VB6 ([24])
    chuyển qua Form strips của WinForm — locator không giống nút thanh F mà
    các luồng khác đã biết. Đường tới dialog đi qua menu bar, không phải
    nút btnF*. Gộp chung runner thì mỗi lần chạy lại phải nhớ filter.

    ⚠️ Testcase KHÔNG ghi DB (chỉ mở + đọc cấu trúc + đóng bằng F10).
    Để dialog nạp được dữ liệu (cboKind mục từ cod_mst kind=70, panel từ
    TrtState), bệnh nhân test cần có row TrtState — tự test phát hiện và
    Ignore nếu DB tắt hoặc bệnh nhân không có TrtState.

    Tiền đề:
      - App đang chạy ở màn 診療入力 (UiTestBase đã dựng sẵn)
      - DB bật + trỏ vào SQL Server có dữ liệu. Code 70 trong cod_mst, ít nhất
        một dòng TrtState của bệnh nhân test.

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá
    máy, không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    Chạy công cụ chẩn đoán thay vì testcase: mở menu Step, đổ cây UIA của menu
    item 「Step」 và của dialog frm203050 đang mở ra file. Cần chạy cái này
    trước khi viết được StepsEditFlow.OpenStepsDialog trên máy lạ.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc1".

.EXAMPLE
    .\run-steps-edit.ps1
    .\run-steps-edit.ps1 -Case Tc1_OpenDialog
    .\run-steps-edit.ps1 -StepMs 1500
    .\run-steps-edit.ps1 -Diagnostics
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

# Cả luồng nằm trong một namespace ⇒ lọc theo namespace là đủ.
$ns = "OchaCom.FlaUiTests.Tests.StepsEdit"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.StepsEditDiagnosticsTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.StepsEditTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=steps-edit.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. $artifacts   - nhat ky tung buoc + anh man hinh phia test"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
