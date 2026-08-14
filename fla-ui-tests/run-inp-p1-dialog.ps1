<#
.SYNOPSIS
    Chạy luồng InpP1Dialogs — đo ĐÁP ÁN trên WinForm thật cho ba dialog vừa port sang web:

        A. Ｓｔｅｐ編集       frm203050   F11 → 「９ オプション」 → 「Step」
        B. チェック項目設定  frm203044   F11 → 「９ オプション」 → 「１ チェック項目設定」
        C. Ｂｒサンプル      frm203049   部位選択 (frm902003) → F9 「Br例」

    Mã nguồn: Tests/InpP1Dialogs/   —   đọc README trong đó TRƯỚC khi chạy.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-all-tests.ps1 và cũng KHÔNG gộp vào các
    runner sẵn có.

    ⚠️ LUỒNG NÀY CHƯA CHẠY LẦN NÀO TRÊN WINDOWS.
    Khác hẳn run-karte-auto-calc.ps1 (đã chạy pass): ở đây mọi tên control mới chỉ được
    ĐỌC RA TỪ Designer chứ chưa từng đối chiếu với cây UIA thật. Ba giả định còn treo:

      1. mục menu IDM_Step / IDM_ChkPrm có lộ AutomationId qua cầu MSAA→UIA không;
      2. sau khi mở 部位選択, tiêu điểm có nằm trong buiInfo1 không — không thì Delete /
         mũi tên / phím số rơi vào hư không và ô răng không đổi;
      3. lưới đăng ký của patient.patNo có dòng nào mở được 部位選択 không (cột ẩn 51
         BuiDispFlg khác 99).

    Sai một trong ba thì testcase đỏ vì KHÔNG TÌM THẤY CONTROL, chứ không phải vì WinForm
    sai — hai chuyện đó nhìn giống hệt nhau trong log. Nên: chạy -Diagnostics TRƯỚC.

    Bộ này đo đáp án cho spec Playwright của bản web:
        ../web-tenant-tests/tests/step-edit-dialog.spec.ts        (TC-STEP-*)
        ../web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts   (TC-CHK-* / TC-BR-*)
    Mỗi testcase ghi rõ nó ứng với TC nào bên kia. Bảng tương ứng: README.md mục 2.

    Chạy xong hãy lấy TOÀN BỘ các dòng chứa "=== KQ-" trong log và gửi lại — script đã
    lọc sẵn ra inp-p1-dialog-KQ.txt. Bảy nhóm câu trả lời:

      KQ-0  cây UIA + tên control thật (chỉ có ở -Diagnostics)
      KQ-1  combo 種別 của CODMST 70 hiện theo THỨ TỰ nào
      KQ-2  32 ô STEP so với TRTSTATE
      KQ-3  giá trị > 30000 bị LỚP NÀO chặn (txtEpp_Leave hay saveData)
      KQ-4  19 nhãn チェック項目設定 — hợp đồng cho BE bản web
      KQ-5  giá trị chkprm + các mục CODMST 62/63/64
      KQ-6  Ｂｒサンプル: răng chọn được, số mẫu khớp, câu lỗi

    ⚠️ GHI DB (chỉ khi -AllowSave):
         StepEditTests.Tc8   → TRTSTATE của ĐÚNG bệnh nhân patient.patNo
         CheckItemTests.Tc6  → chkprm, master TOÀN PHÒNG KHÁM (đổi luật check của MỌI
                               bệnh nhân)
       Cả hai tự trả lại giá trị cũ QUA GIAO DIỆN và in CẢNH BÁO nếu trả không xong.
       Không bật cờ thì hai testcase đó tự Ignore, phần chỉ-đọc vẫn chạy đủ.
       Ｂｒサンプル KHÔNG ghi gì (chỉ đọc bảng BrSample; đóng 部位選択 bằng F12 戻る).

    Tiền đề:
      - App đang chạy ở màn 診療入力 (UiTestBase tự dựng).
      - DB bật + trỏ vào SQL Server có dữ liệu (db.* trong testsettings) — CODMST phải có
        cd_type 62/63/64/70. Không có DB thì phần đối chiếu tự Ignore kèm lý do.

    PHẢI chạy trên Windows, trong phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá máy, không
    RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    CHẠY CÁI NÀY TRƯỚC TIÊN. Đổ cây UIA của menu F11, của cả ba dialog, sơ đồ răng của
    部位選択 và danh sách mục CODMST 62/63/64/70 ra artifact. Không bấm F9, không ghi DB.

.PARAMETER Dialog
    Chạy một nhóm: step | check | br. Bỏ trống = cả ba (ba lượt dotnet test nối tiếp).

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc3".

.PARAMETER AllowSave
    Bật inpP1.allowSave cho lượt chạy này (đặt OCHA_INP_P1_ALLOW_SAVE=1).

.EXAMPLE
    .\run-inp-p1-dialog.ps1 -Diagnostics
    .\run-inp-p1-dialog.ps1
    .\run-inp-p1-dialog.ps1 -Dialog step
    .\run-inp-p1-dialog.ps1 -Case Tc3
    .\run-inp-p1-dialog.ps1 -StepMs 1500
    .\run-inp-p1-dialog.ps1 -AllowSave
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
    Write-Host "  patient.patNo phai la BENH NHAN TEST; chkprm la cau hinh TOAN PHONG KHAM." -ForegroundColor Red
}

$ns = "OchaCom.FlaUiTests.Tests.InpP1Dialogs"

# Mỗi lượt chạy = MỘT fixture, lọc theo dạng "~<namespace>.<TenLop>" — đúng dạng mà
# run-karte-auto-calc.ps1 đã chạy được. KHÔNG gộp ba fixture vào một filter "A|B|C":
# dạng đó chưa từng chạy thật, và lọc cả namespace thì NUnit sẽ kéo theo cả
# InpP1DiagnosticsTests ([Explicit], chậm, không phải testcase).
$runs = @()

if ($Diagnostics) {
    $runs += @{ Name = "diagnostics"; Filter = "FullyQualifiedName~$ns.InpP1DiagnosticsTests" }
} elseif ($Case -ne "") {
    $runs += @{ Name = "case-$Case"; Filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case" }
} else {
    $all = @(
        @{ Key = "step";  Name = "step-edit";  Filter = "FullyQualifiedName~$ns.StepEditTests" }
        @{ Key = "check"; Name = "check-item"; Filter = "FullyQualifiedName~$ns.CheckItemTests" }
        @{ Key = "br";    Name = "br-sample";  Filter = "FullyQualifiedName~$ns.BrSampleTests" }
    )
    $runs = if ($Dialog -ne "") { $all | Where-Object { $_.Key -eq $Dialog } } else { $all }
}

# Build MỘT lần rồi mọi lượt test đều --no-build: ba lượt nối tiếp mà lượt nào cũng
# build lại thì vừa chậm vừa có nguy cơ đổi binary giữa chừng.
Write-Host "dotnet build $project -c $Configuration" -ForegroundColor Cyan
& dotnet build $project -c $Configuration --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD HONG — dung lai." -ForegroundColor Red
    exit $LASTEXITCODE
}

$exit = 0
foreach ($run in $runs) {
    $testArgs = @(
        "test", $project,
        "-c", $Configuration,
        "--no-build",
        "--filter", $run.Filter,
        "--logger", "console;verbosity=detailed",
        "--logger", "trx;LogFileName=inp-p1-$($run.Name).trx"
    )

    Write-Host ""
    Write-Host "=== $($run.Name) ===" -ForegroundColor Cyan
    Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
    & dotnet @testArgs

    # KHÔNG dừng khi một fixture đỏ: ba dialog độc lập với nhau, và lượt chạy đầu tiên
    # cần biết CẢ BA cái nào chạy được chứ không chỉ cái đầu.
    if ($LASTEXITCODE -ne 0) { $exit = $LASTEXITCODE }
}

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

# Lọc sẵn đáp án + mọi dòng Ignore/cảnh báo ra một file cho dễ copy. Dòng IGNORE quan
# trọng ngang KQ ở lượt chạy ĐẦU TIÊN: nó nói chính xác dữ liệu của máy đang thiếu gì.
$results = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") `
                         -Filter "inp-p1-*.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
if ($results) {
    $kq = Join-Path $PSScriptRoot "inp-p1-dialog-KQ.txt"
    Select-String -Path $results.FullName -Pattern "=== KQ-|IGNORE —|CANH BAO" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san dap an + ly do Ignore vao: $kq" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. $(Join-Path $PSScriptRoot 'inp-p1-dialog-KQ.txt')   <- QUAN TRONG NHAT"
Write-Host "2. $artifacts\inp-p1-*.txt   (cay UIA cua menu + 4 form + so do rang)"
Write-Host "3. $artifacts   - nhat ky tung buoc + anh man hinh"

if (-not $Diagnostics) {
    Write-Host ""
    Write-Host "Neu co testcase do vi 'khong thay control' thi chay:" -ForegroundColor Yellow
    Write-Host "    .\run-inp-p1-dialog.ps1 -Diagnostics" -ForegroundColor Yellow
    Write-Host "  roi doi chieu ten control that voi Tests/InpP1Dialogs/*Dialog.cs." -ForegroundColor Yellow
}

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
