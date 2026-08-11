<#
.SYNOPSIS
    Lái ba dialog của 診療入力 vừa được port sang web, trên WinForm thật:

        A. Ｓｔｅｐ編集       frm203050   F11 → 「９ オプション」 → 「Step」
        B. チェック項目設定  frm203044   F11 → 「９ オプション」 → 「１ チェック項目設定」
        C. Ｂｒサンプル      frm203049   部位選択 (frm902003) → F9 「Br例」

    Mã nguồn: Tests/InpP1Dialogs/   —   đọc README trong đó TRƯỚC khi chạy.

.DESCRIPTION
    Bộ này đo ĐÁP ÁN cho spec Playwright của bản web:
        ../web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts   (TC-STEP-* / TC-CHK-* / TC-BR-*)
    Mỗi testcase ghi rõ nó ứng với TC nào bên kia, để hai bên còn đối chiếu được.

    Runner RIÊNG, không đi qua run-all-tests.ps1. Lý do tách:
      · đường tới hai dialog đầu đi qua MENU (ToolStripMenuItem IDM_Step / IDM_ChkPrm),
        locator khác hẳn nút btnF* mà các luồng khác quen;
      · có nhánh GHI DB nằm sau cờ riêng inpP1.allowSave;
      · nhánh Ｂｒサンプル phụ thuộc dữ liệu bảng BrSample của từng máy nên hay Ignore —
        gộp vào runner chung thì lẫn với kết quả của các luồng khác.

    ⚠️ GHI DB (chỉ khi -AllowSave):
         Tc8 của Ｓｔｅｐ編集    → TRTSTATE của ĐÚNG bệnh nhân patient.patNo
         Tc6 của チェック項目設定 → chkprm, là cấu hình TOÀN PHÒNG KHÁM (đổi luật check
                                   của MỌI bệnh nhân)
       Cả hai tự trả lại giá trị cũ và in CẢNH BÁO nếu trả không xong. Không bật cờ thì
       hai testcase đó tự Ignore, phần chỉ-đọc vẫn chạy đủ.
       Ｂｒサンプル KHÔNG ghi gì (nó chỉ đọc bảng BrSample; luồng đóng 部位選択 bằng F12 戻る).

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá máy,
    không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Dialog
    Chạy một nhóm: step | check | br. Bỏ trống = cả ba.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc3".

.PARAMETER AllowSave
    Bật inpP1.allowSave cho lượt chạy này (đặt OCHA_INP_P1_ALLOW_SAVE=1).

.PARAMETER Diagnostics
    Chạy công cụ chẩn đoán thay vì testcase: đổ cây UIA của menu, của cả ba dialog,
    sơ đồ răng của 部位選択, và danh sách mục CODMST 62/63/64/70.
    Chạy cái này TRƯỚC khi đi sửa locator trên một máy lạ.

.EXAMPLE
    .\run-inp-p1-dialog.ps1
    .\run-inp-p1-dialog.ps1 -Dialog step
    .\run-inp-p1-dialog.ps1 -Case Tc3
    .\run-inp-p1-dialog.ps1 -StepMs 1200        # chạy chậm để ngồi nhìn
    .\run-inp-p1-dialog.ps1 -AllowSave          # bật nhánh GHI DB
    .\run-inp-p1-dialog.ps1 -Diagnostics
#>
[CmdletBinding()]
param(
    [ValidateSet("", "step", "check", "br")]
    [string]$Dialog = "",

    [string]$Case = "",

    [int]$StepMs = -1,

    [switch]$AllowSave,

    [switch]$Diagnostics,

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowSave) {
    $env:OCHA_INP_P1_ALLOW_SAVE = "1"
    Write-Host "OCHA_INP_P1_ALLOW_SAVE=1 — luot chay nay SE GHI vao TRTSTATE va chkprm." -ForegroundColor Red
    Write-Host "  patient.patNo phai la BENH NHAN TEST, va chkprm la cau hinh TOAN PHONG KHAM." -ForegroundColor Red
}

# Cả luồng nằm trong một namespace.
$ns = "OchaCom.FlaUiTests.Tests.InpP1Dialogs"

$fixtures = @{
    "step"  = "$ns.StepEditTests"
    "check" = "$ns.CheckItemTests"
    "br"    = "$ns.BrSampleTests"
}

if ($Diagnostics) {
    # Công cụ chẩn đoán có [Explicit] nên phải gọi ĐÍCH DANH mới chạy.
    $filter = "FullyQualifiedName~$ns.InpP1DiagnosticsTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} elseif ($Dialog -ne "") {
    $filter = "FullyQualifiedName~$($fixtures[$Dialog])"
} else {
    # Liệt kê ĐÍCH DANH ba fixture thay vì lọc cả namespace: lọc cả namespace sẽ kéo
    # theo InpP1DiagnosticsTests (đổ cây UIA, chậm và không phải testcase).
    $filter = ($fixtures.Values | ForEach-Object { "FullyQualifiedName~$_" }) -join "|"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=inp-p1-dialog.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. $artifacts   - nhat ky tung buoc + anh man hinh + cay UIA"
Write-Host "2. Cac dong 「IGNORE — ...」 tren console: chung noi ro du lieu may thieu gi"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
