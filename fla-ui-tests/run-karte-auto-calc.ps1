<#
.SYNOPSIS
    Chạy luồng KarteAutoCalc — ĐIỀU TRA frm203042「カルテ自動算定一覧」/
    frm203043「カルテ自動算定登録」 để đối chiếu với bản web vừa port.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-all-tests.ps1 và cũng KHÔNG gộp
    vào các runner sẵn có.

    ⚠️ ĐÂY LÀ LUỒNG ĐIỀU TRA, KHÔNG PHẢI HỒI QUY.
    Phần lớn testcase GHI LOG rồi Pass, không assert. Mục đích là trả lời sáu
    câu hỏi mà đọc source WinForm không kết luận chắc được — xem doc-comment
    đầu KarteAutoCalcTests.cs. Chạy xong hãy lấy TOÀN BỘ các dòng chứa
    "=== KQ-" trong log và gửi lại; mỗi khối trả lời đúng một câu.

      KQ-1  一覧 có liệt kê 処置 CHƯA cấu hình không (LEFT JOIN)?
      KQ-2  該当件数 thật là bao nhiêu (bản web sau khi lọc version cho 1.764)?
      KQ-3  確認画面不要 tick theo quy tắc nào (3 ca)?
      KQ-4  F9 登録 có giữ nguyên use_cnt không?
      KQ-5  Lưới rỗng + F9 có xoá sạch cấu hình không?
      KQ-6  cmt_nm bị cắt theo BYTE (Shift-JIS) hay KÝ TỰ?

    ⚠️ GHI DB: Tc4 / Tc5 / Tc6 bấm F9 → ghi thật vào cmtauto, và đây là master
    TOÀN PHÒNG KHÁM (đổi nó là đổi comment tự động của MỌI bệnh nhân). Ba
    testcase đó chỉ chạy khi bật inpP1.allowSave, và in sẵn câu INSERT khôi phục
    ra log trước khi sửa. NÊN CHẠY TRÊN MÁY CÓ DB SAO LƯU ĐƯỢC.
    Tc0..Tc3 chỉ đọc, chạy được ngay.

    Tiền đề:
      - App đang chạy ở màn 診療入力 (UiTestBase tự dựng).
      - DB bật + trỏ vào SQL Server có dữ liệu (db.* trong testsettings).

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá
    máy, không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    CHẠY CÁI NÀY TRƯỚC TIÊN. Chỉ chạy Tc0: mở cả hai form rồi đổ cây UIA ra
    artifact. Tên control trong KarteAutoCalcDialog.cs mới chỉ là SUY ĐOÁN từ
    các form anh em (dgvView / txtTrtCd / lblCount / chkNoChk…) — phải xem cây
    thật rồi sửa lại, nếu không các Tc sau sẽ đỏ vì không tìm thấy control chứ
    không phải vì WinForm sai.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc3".

.EXAMPLE
    .\run-karte-auto-calc.ps1 -Diagnostics
    .\run-karte-auto-calc.ps1
    .\run-karte-auto-calc.ps1 -Case Tc3
    .\run-karte-auto-calc.ps1 -StepMs 1500
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

$ns = "OchaCom.FlaUiTests.Tests.KarteAutoCalc"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~Tc0"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.KarteAutoCalcTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=karte-auto-calc.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' trong log tren  <- QUAN TRONG NHAT"
Write-Host "2. $artifacts\karte-auto-calc-*.uia.txt   (cay UIA cua 2 form)"
Write-Host "3. $artifacts   - nhat ky tung buoc + anh man hinh"

# Lọc sẵn các dòng KQ- ra một file cho dễ copy.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "karte-auto-calc.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "karte-auto-calc-KQ.txt"
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
