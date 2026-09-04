# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Chạy luồng PerioKensaOrder — 検査順 chi phối hướng quét con trỏ của
    歯周基本検査 (frm203028) và 歯周精密検査 (frm203029). Nửa WinForm của spec:
        ..\web-tenant-tests\tests\perio-kensa-order.spec.ts

.DESCRIPTION
    Phím → hàm WinForm mà runner này lái:

        mở màn kiểm tra   F6 コメント        → frm203002.KeyFunc(F6) → frm203011 カルテ記載選択
                          F1 / F2 (frm203011) → frm203028 / frm203029
        con trỏ VÀO màn   フォーカス設定      → frm203028.cs:488 / frm203029_Activated_Method
        Enter             txtXxx_KeyPress    → getMoveIndex   (rẽ theo ModCommon.pInpOpt[36])
        ← →               txtXxx_KeyDown     → getMoveIndexArrow (KHÔNG rẽ theo pInpOpt[36])
        đổi 検査順        F11 選択 → ９ オプション → ２ 処置入力設定 → F9 登録
                                             → XmlControl.setOchaXml() + ModCommon.pGetInpOpt()

    ⚠️ KHÔNG ghi DB. Nhưng -AllowSettingChange thì GHI **C:\NEW_SIM2000\Ocha.xml**
       (cấu hình CỦA MÁY, không phải của phòng khám). Fixture chụp giá trị cũ ở
       OneTimeSetUp và trả lại ở OneTimeTearDown, kể cả khi đỏ giữa chừng — nếu lượt chạy
       bị Ctrl+C thì đọc dòng "ĐÃ TRẢ LẠI 検査順" trong stdout để biết còn phải sửa tay không.

    Tiền đề mà bộ test KHÔNG tự dựng được:
      1. Tháng của patient.trtDate phải CÓ ÍT NHẤT MỘT dòng 処置 thật để đứng lên mở
         部位選択 (dòng 日計/合計 có BuiDispFlg = 99, không mở được).
      2. mst_cod cd_type 68 phải có đủ hai dòng 左上から / 右上から — TcREAD khoá điều này.
      3. 4点法/6点法 (pInpOpt[32]) KHÔNG đổi được giữa phiên: pGetInpOpt chỉ nạp lại XML,
         còn _inpConfigData (bảng INPCONFIG) chỉ nạp MỘT LẦN lúc app khởi động
         (modCommon.cs:299). Một lượt chạy vì thế chỉ phủ được MỘT chế độ:
             6点法 ⇒ Tc5 / Tc6 / Tc7 chạy, Tc7b tự Ignore
             4点法 ⇒ Tc7b chạy, Tc5 / Tc6 / Tc7 tự Ignore
         Muốn phủ nốt: đổi ở màn 初期設定 (frm506008), khởi động lại app, chạy lại.

    ĐỌC TRƯỚC: Tests\PerioKensaOrder\README.md và ..\PROBE-GUIDELINE.md.

.PARAMETER Diagnostics
    Chỉ chạy PROBE (PerioKensaOrderProbeTests.Tc0, [Explicit]): đi trọn một vòng, chụp ảnh
    từng bước, KHÔNG assert. Chạy cái này TRƯỚC khi đi sửa một testcase đỏ.
    Đáp án nằm ở các dòng "=== KQ-n ===", runner lọc sẵn ra perio-kensa-KQ.txt.

.PARAMETER AllowSettingChange
    Cho phép fixture ĐỔI 検査順 qua 処置入力設定 (ghi Ocha.xml của máy) rồi trả lại.
    KHÔNG bật thì fixture chỉ chạy nhóm testcase khớp nhánh mà máy ĐANG chạy — nhánh đó
    được ĐO từ chỗ con trỏ rơi vào, không phải đọc từ combo (combo nói dối khi
    KensaOrder = 0; xem README của luồng).

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc2". ⚠️ "Tc7" khớp CẢ Tc7b — dùng -Filter nếu cần tách.

.EXAMPLE
    .\run-move-perio-exam-cursor.ps1 -Diagnostics              # CHAY CAI NAY TRUOC TIEN
    .\run-move-perio-exam-cursor.ps1                            # nhom khop nhanh may dang chay
    .\run-move-perio-exam-cursor.ps1 -AllowSettingChange        # ca 9 testcase (ghi Ocha.xml)
    .\run-move-perio-exam-cursor.ps1 -Filter "Tc1|Tc2" -AllowSettingChange
    .\run-move-perio-exam-cursor.ps1 -StepMs 1200               # cham lai de nhin
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    # Bo loc vstest THO, de chay NHIEU testcase roi rac trong mot luot:
    #   -Filter "Tc1|Tc2"
    # Can vi -Case chi so KHOP CHUOI (mot manh), khong OR duoc.
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [switch]$AllowSettingChange,
    # Cho CA 9 testcase cung chay du mot cai do — mac dinh run.stopOnFirstFailure BAT nen
    # mot testcase do la 8 cai sau bi Ignore, khong biet chung xanh hay do.
    [switch]$NoStopOnFirstFailure,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0)        { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowSettingChange)  { $env:OCHA_PERIO_ALLOW_SETTING_CHANGE = "1" }
if ($NoStopOnFirstFailure) {
    $env:OCHA_STOP_ON_FIRST_FAILURE = "0"
    # BAT BUOC di kem: killOnFail giet app ngay o TearDown cua testcase do dau tien, nen
    # moi testcase sau do chay tren app DA CHET va do voi ly do gia. Do that 2026-09-04:
    # Tc1 do that su, 8 cai sau do vi 「khong thay btnF11」 — app khong con nua.
    $env:OCHA_KILL_ON_FAIL = "0"
}

$ns = "OchaCom.FlaUiTests.Tests.PerioKensaOrder"

if ($Filter -ne "") {
    $parts = $Filter -split '\|' | ForEach-Object { "FullyQualifiedName~$ns&FullyQualifiedName~$($_.Trim())" }
    $filter = $parts -join '|'
} elseif ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.PerioKensaOrderProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    # Fixture assert; probe mang [Explicit] nen khong bi keo vao.
    $filter = "FullyQualifiedName~$ns.PerioKensaOrderTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=perio-kensa.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if ($AllowSettingChange) {
    Write-Host "AllowSettingChange BAT — luot chay nay se GHI C:\NEW_SIM2000\Ocha.xml (KensaOrder) va tra lai o cuoi." -ForegroundColor Yellow
}
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. perio-kensa-KQ.txt                               - cac dong === KQ-n === (chi -Diagnostics)"
Write-Host "2. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "3. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"
Write-Host "4. TestResults\perio-kensa.trx                      - ket qua (UTF-8 chuan, doc tieng Nhat duoc)"
Write-Host ""
Write-Host "Dong '検査順 ĐANG CHẠY = ...' trong stdout cho biet may dang o nhanh nao." -ForegroundColor Yellow
Write-Host "Bi Ctrl+C giua chung khi -AllowSettingChange thi kiem dong 'ĐÃ TRẢ LẠI 検査順'." -ForegroundColor Yellow

# Loc san cac dong KQ- ra mot file cho de doc.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "perio-kensa.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "perio-kensa-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
