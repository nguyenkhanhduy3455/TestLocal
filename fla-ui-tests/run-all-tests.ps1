<#
.SYNOPSIS
    Chạy TOÀN BỘ test FlaUI của app WinForm お茶コン.

    Các luồng có tiền đề riêng và rủi ro riêng thì có runner riêng, đặt tên theo
    HÀM WinForm mà chúng lái:
      .\run-save-treatment-data.ps1   F9 登録  → modSave.SaveData   (処置データ登録)
      .\run-fix-accounting-data.ps1   F8 会計  → modAcc.ChgAccData  (会計データ修正)
      .\run-inp-p1-dialog.ps1         F11 オプション → Step / チェック項目設定,
                                      部位選択 → F9 Br例  (3 dialog vua port sang web)

.DESCRIPTION
    PHẢI chạy trên Windows, trong một phiên đăng nhập CÓ MÀN HÌNH THẬT (không RDP thu
    nhỏ, không khoá máy): UIAutomation gửi phím/chuột vào desktop đang hoạt động, màn
    hình khoá là mọi thao tác rơi vào hư không.

    Đừng đụng chuột/bàn phím trong lúc test chạy — cửa sổ bị mất focus là hỏng kết quả.

.EXAMPLE
    .\run-all-tests.ps1
    .\run-all-tests.ps1 -Filter "Tc1"
    .\run-all-tests.ps1 -StepMs 1500          # chạy chậm lại để ngồi nhìn
    .\run-all-tests.ps1 -Diagnostics          # đổ cây UIA để dò locator
#>
[CmdletBinding()]
param(
    # Lọc theo tên testcase, vd "Tc1" / "Tc2_HomeVisitDay".
    [string]$Filter = "",

    # Nhịp quan sát giữa các thao tác (ms). 0 = nhanh nhất.
    [int]$StepMs = -1,

    # Chạy công cụ chẩn đoán locator thay vì bộ test.
    [switch]$Diagnostics,

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=all-tests.trx"
)

if ($Diagnostics) {
    $testArgs += @("--filter", "TestCategory=diagnostics")
} elseif ($Filter -ne "") {
    $testArgs += @("--filter", "FullyQualifiedName~$Filter")
}

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$shots = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts\screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Ảnh màn hình từng testcase: $shots" -ForegroundColor Green
    Get-ChildItem $shots -Filter *.png | Sort-Object LastWriteTime -Descending |
        Select-Object -First 10 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
