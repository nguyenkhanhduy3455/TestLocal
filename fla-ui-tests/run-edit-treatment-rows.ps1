<#
.SYNOPSIS
    Chạy luồng TreatmentGrid — THAO TÁC CƠ BẢN trên lưới 処置 của 診療入力
    (grdRegi / hFG1): 行追加 (Insert), 行削除 (Delete), Enter, Tab, gõ số vào ô 点,
    và chèn một 処置 từ tab 個別.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-all-tests.ps1.

    KHÔNG GHI DB. Không testcase nào bấm F9 登録 nên mọi thay đổi chỉ nằm trong
    DataTable trên bộ nhớ; app đóng lại là sạch. Không cần cờ allowSave, không
    cần DB, chạy được ngay trên máy có dữ liệu thật.

    Bảy testcase NỐI TIẾP nhau: TC-2 chèn dòng 処置 mà TC-3..TC-6 dùng làm chỗ
    đứng, TC-7 xoá chính dòng đó. Lọc một TC lẻ thì nó tự Ignore kèm lý do.

    Đây là bên ĐO ĐÁP ÁN cho spec Playwright
    ..\web-tenant-tests\tests\treatment-grid-basic.spec.ts — cùng số hiệu TC,
    cùng thứ tự. Bảng tương ứng nằm ở
    src\OchaCom.FlaUiTests\Tests\TreatmentGrid\README.md muc 4.

    Tiền đề:
      - App đang chạy được tới màn 診療入力 (UiTestBase tự dựng).
      - patient.patNo + patient.trtDate trong testsettings trỏ vào tháng HIỆN HÀNH
        (dòng của tháng cũ mang linekbn 99, mọi thao tác đều bị từ chối).

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá
    máy, không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy — luồng này
    click chuột VẬT LÝ vào từng ô lưới.

.PARAMETER Diagnostics
    CHẠY CÁI NÀY TRƯỚC TIÊN. Chỉ chạy Tc0: đổ cây UIA của grdRegi ra artifact và
    in tiêu đề cột + 30 dòng đầu + lbAllPoint/lbDays. Tên control mới chỉ đọc từ
    Designer, chưa đối chiếu máy thật — sai locator thì log trông y hệt
    "WinForm sai".

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc6".

.EXAMPLE
    .\run-edit-treatment-rows.ps1 -Diagnostics
    .\run-edit-treatment-rows.ps1
    .\run-edit-treatment-rows.ps1 -Case Tc6
    .\run-edit-treatment-rows.ps1 -StepMs 1500
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

$ns = "OchaCom.FlaUiTests.Tests.TreatmentGrid"

if ($Diagnostics) {
    # Tc0 mang [Explicit] nên lần chạy đủ không gọi tới; lọc đích danh thì vẫn chạy.
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~Tc0"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    # Ca hai fixture: TreatmentGridBasicTests (TC-1..TC-7) + TreatmentGridAdvancedTests
    # (TC-A1..TC-A5). Cac fixture Probe mang [Explicit] nen KHONG chay o day — muon chay
    # thi goi dich danh: -Case Probe_GridKeyBehaviour / -Case Probe_AdvancedGridRules.
    $filter = "FullyQualifiedName~$ns"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=treatment-grid.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

# Lọc sẵn các dòng KQ ra một file cho dễ copy — cùng quy ước với
# run-karte-auto-calc.ps1 và run-inp-p1-dialog.ps1.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "treatment-grid.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "treatment-grid-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' trong log tren"
Write-Host "2. $artifacts\treatment-grid.uia.txt   (chi co khi chay -Diagnostics)"
Write-Host "3. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
