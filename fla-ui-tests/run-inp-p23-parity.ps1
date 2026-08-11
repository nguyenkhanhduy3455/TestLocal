<#
.SYNOPSIS
    Chạy luồng InpP23Parity — ĐIỀU TRA parity của cặp 2 (自動算定, frm203038/039)
    và cặp 3 (必要病名, frm203036/037) để đối chiếu với bản web vừa port.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-all-tests.ps1, KHÔNG sửa
    run-karte-auto-calc.ps1 hay run-inp-p1-dialog.ps1.

    ⚠️ ĐÂY LÀ LUỒNG ĐIỀU TRA, KHÔNG PHẢI HỒI QUY.
    Phần lớn testcase GHI LOG rồi Pass, không assert. Chạy xong lấy TOÀN BỘ các
    dòng chứa "=== KQ-" gửi lại; mỗi khối trả lời đúng một câu.

    Bảy câu — và CHỈ bảy, vì mọi thứ khác đã đọc thẳng ra từ source rồi:

      KQ-1  ESC / Enter trên form 登録 làm gì?   ← quan trọng nhất
      KQ-2  Rời ô 枝番 có tra tên NGAY không?
      KQ-3  Rời ô コード với mã < 100 có xoá trắng 3 ô không?
      KQ-4  Click NHÃN コード có mở popup tìm kiếm (frm902011 / frm902010) không?
      KQ-5  Đóng dialog xong 一覧 có giữ dòng đang chọn không?
      KQ-6  一覧 hiện đủ 5 算定処置 / 20 病名 chứ? (source nói 12 và 42 cột)
      KQ-7  Lưu 処置 có tham chiếu chết thì nó biến mất thật chứ? (GHI DB)

    Vì sao KQ-1 quan trọng nhất: repo có luật 「ESC = phím End (登録/確定), KHÔNG
    phải cancel」, nhưng frm203039/frm203037 kế thừa OchaFramework.Forms.BaseDialog
    — DLL ngoài, không có source trong repo nên KHÔNG đọc ra được. Nếu ESC thật sự
    là 登録 mà dialog bên web đang ĐÓNG thì người dùng bấm ESC là mất dữ liệu.

    ⚠️ GHI DB: chỉ Tc7 ghi, và chỉ khi bật inpP1.allowSave. Nó bấm F9 trên 処置
    100-0 — master TOÀN PHÒNG KHÁM. Câu khôi phục in sẵn trong log:
        UPDATE chkauto SET cd_2=108, sb_2=15 WHERE trt_cd=100 AND trt_sb=0;
    Tc0..Tc6 chỉ đọc (Tc3/Tc4 có gõ vào ô nhưng KHÔNG bấm F9, và đóng bằng F10).

    Tiền đề:
      - App đang chạy ở màn 診療入力 (UiTestBase tự dựng).
      - PHẢI chạy trên Windows, phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá máy,
        không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    CHẠY CÁI NÀY TRƯỚC TIÊN. Chỉ chạy Tc0: mở cả 4 form rồi đổ cây UIA ra artifact.
    Tên control trong InpP23Dialog.cs (txtCd1 / txtSb1 / lblDisCd1…) mới là SUY ĐOÁN
    từ INP.Lib.GetControl — phải xem cây thật rồi sửa lại, nếu không Tc2..Tc7 sẽ
    báo "khong thay o" chứ không phải WinForm sai.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc4".

.EXAMPLE
    .\run-inp-p23-parity.ps1 -Diagnostics
    .\run-inp-p23-parity.ps1
    .\run-inp-p23-parity.ps1 -Case Tc2
    .\run-inp-p23-parity.ps1 -StepMs 1500
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

$ns = "OchaCom.FlaUiTests.Tests.InpP23Parity"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~Tc0"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.InpP23Tests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=inp-p23-parity.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' trong log tren  <- QUAN TRONG NHAT"
Write-Host "2. $artifacts\p23-*.uia.txt   (cay UIA cua 4 form)"
Write-Host "3. $artifacts   - nhat ky tung buoc + anh man hinh"

# Lọc sẵn các dòng KQ- ra một file cho dễ copy.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "inp-p23-parity.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "inp-p23-parity-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
