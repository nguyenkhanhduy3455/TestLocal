# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac —
# lan chay 18:35 in ra "蜃ｦ鄂ｮ" thay vi "処置". Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Chạy luồng InpP23Parity — ĐIỀU TRA parity của cặp 2 (自動算定, frm203038/039)
    và cặp 3 (必要病名, frm203036/037) để đối chiếu với bản web vừa port.

.DESCRIPTION
    Runner RIÊNG của luồng này. KHÔNG dùng run-all-tests.ps1, KHÔNG sửa
    run-karte-auto-calc.ps1 hay run-inp-p1-dialog.ps1.

    ĐÂY LÀ LUỒNG HỒI QUY. Bản đầu là luồng ĐIỀU TRA — ghi log rồi Pass, để người
    đọc tự luận. Bảy câu đó đã có đáp án (đo 2026-08-11) nên giờ mỗi testcase
    ASSERT đúng con số đã đo: WinForm đổi, hoặc ai đó sửa harness làm phép đo
    lệch đi, thì test đỏ ngay.

    Đã ghim:
      Tc1  一覧 có 12 cột (自動算定) và 42 cột (必要病名)
      Tc2  ESC và Enter KHÔNG làm gì trên form 登録
      Tc3  Rời ô với mã < 100 → xoá trắng cả ba ô, im lặng
      Tc4  Rời ô mã hợp lệ → 算定処置名 hiện NGAY; mã không có → xoá trắng
      Tc5  Click NHÃN コード mở 処置検索 / 病名検索
      Tc6  Đóng dialog → con trỏ 一覧 về dòng đầu
      Tc7  Tham chiếu chết mở ra TRẮNG (chỉ đọc)

    Còn mở — testcase duy nhất còn ở chế độ đo, không assert:
      Tc8  Lưới 42 cột cuộn ngang thế nào? Có ghim cột 処置コード không?

    Tc0 (đổ cây UIA) mang [Explicit] nên lần chạy đủ KHÔNG gọi tới — nó tốn 2 phút
    mà không assert gì. Chỉ chạy qua -Diagnostics.

    KHÔNG CÒN TESTCASE NÀO GHI DB. Bản trước có Tc7 bấm F9 để xem tham chiếu chết
    có mất khi lưu không — đã đo xong (chkauto 100-0 còn (108-7, 0-0)), giữ lại
    chỉ là phá dữ liệu thêm lần nữa cho cùng một đáp án. Vì thế cờ allowSave và
    tham số -ReadOnly đã bỏ.

    Chỉ nên THÊM testcase vào đây khi hành vi nằm trong DLL không có source
    (phím, focus, thứ tự Tab), khi source có nhánh bị comment-out, hoặc khi cần
    nhìn tận mắt trước một thay đổi phá dữ liệu. Đếm cả đợt: 14 câu hỏi thì 13
    câu đọc source hoặc query DB là ra.

    Tiền đề:
      - App đang chạy ở màn 診療入力 (UiTestBase tự dựng).
      - PHẢI chạy trên Windows, phiên đăng nhập CÓ MÀN HÌNH THẬT (không khoá máy,
        không RDP thu nhỏ). Đừng đụng chuột/bàn phím trong lúc chạy.

.PARAMETER Diagnostics
    Chỉ chạy Tc0: mở cả 4 form rồi đổ cây UIA ra artifact. KHÔNG cần chạy trước
    nữa — tên control đã chốt (txtCd01 / txtSb01 / txtDisCd01, đệm 0 hai chữ số
    theo INP.Lib.GetControl; nhãn thì lblCd1 / lblDisCd1, không đệm).

    Dùng khi một testcase đỏ với 「khong thay o …」: nghĩa là Designer đã đổi, và
    cây UIA thật là thứ duy nhất nói được tên mới.

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc4".

.EXAMPLE
    .\run-inp-p23-parity.ps1                 # chay du 9 testcase
    .\run-inp-p23-parity.ps1 -Case Tc8       # chi cau con mo
    .\run-inp-p23-parity.ps1 -Diagnostics    # chi Tc0, khi mot Tc khac do
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
Write-Host "1. Testcase nao DO — thong bao assert noi ro cho lech"
Write-Host "2. Cac dong '=== KQ-8' — cau con mo (cuon ngang)"
Write-Host "3. $artifacts\p23-*.uia.txt   (cay UIA cua 4 form, chi khi chay -Diagnostics)"
Write-Host "4. $artifacts   - nhat ky tung buoc + anh man hinh"

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
