# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Chạy luồng AutoSanteiChkAuto — 自動算定 (bảng chkauto), nửa WinForm của lệch parity
    「chk_auto chưa được port ở runtime」.

.DESCRIPTION
    Phím → hàm WinForm mà runner này lái:

        Enter ô 回 (回数 >= 1)  → frm203002.cs:5738-5752 gọi BA hàm liên tiếp:
            ModMain.Chk_CmtAuto(...)            コメント自動入力   ← web CÓ (runCmtAutoCascade)
            ModMain.Chk_ChkAuto_soutyaku(...)   装着料自動算定
            ModMain.Chk_ChkAuto(...)            自動算定           ← ĐANG ĐO (modMain.cs:812)

    Chk_ChkAuto đọc bảng chkauto, lấy TỐI ĐA 5 mã đi kèm, cho từng mã qua 診療チェック rồi
    chèn xuống lưới bằng frm203016_Hide_Let_Trt_Data.

        chkauto(179,2) → cd1 = 310 / sb1 = 2      抜歯手術(臼歯) 270点 → OA+ｵｰﾗ注 1.8mL 11点

    KHÔNG bấm F9 ⇒ TRNTRN KHÔNG bị đụng, mọi dòng chỉ nằm trong bộ nhớ lưới.
    NHƯNG 179 đi qua frm203016.SigaChg nên nó GHI THẲNG vào SIGA lúc chốt, và răng phải là
    現存 thì ChkSiga mới cho 抜歯 đi qua. Vì thế fixture nằm sau cờ RIÊNG
    `autoSantei.allowSave` (mặc định false ⇒ tự Ignore TRƯỚC khi mở app); nó chụp SIGA ở
    PrepareDataBeforeApp, IN RA STDOUT, và trả lại ở OneTimeTearDown.

    Tiền đề mà bộ test KHÔNG tự dựng được:
      1. Tháng của patient.trtDate phải CÓ ÍT NHẤT MỘT dòng 処置 để đứng lên gõ mã.
      2. Master của tháng phải có cả 179/2 lẫn 310/2 (mã đi kèm) và 171/0 (đối chứng).
      3. Tháng test KHÔNG nên có sẵn mã đi kèm — 診療チェック loại mã đã đạt giới hạn, và
         khi đó TcAUTO2 đỏ vì DỮ LIỆU chứ không vì app. TcAUTO1 hỏi thẳng DB và in ra.

    ĐỌC TRƯỚC: Tests\AutoSanteiChkAuto\README.md và ..\FLA-UI-GUIDELINE.md.

.PARAMETER Diagnostics
    Chỉ chạy PROBE (AutoSanteiProbeTests, [Explicit]): đi trọn đường, chụp ảnh từng bước,
    KHÔNG assert. Chạy cái này TRƯỚC khi đi sửa một testcase đỏ.
    Đáp án nằm ở các dòng "=== KQ-n ===", runner lọc sẵn ra auto-santei-KQ.txt.

    ⚠️ CHAY TUNG CASE MOT (F7). Mot vong 「Insert → 部位選択 → 病名選択 → go ma → 処置選択」
    ton 2-3 phut tren may that, ma wrapper cat o 15 phut.

        -Case Tc0    chi hoi DB: chkauto co gi, master co gi (RE, chay truoc tien)
        -Case Tc1    179/2 抜歯 — dung ca trong bao cao lech parity
        -Case Tc2    171/0 感根処 — DOI CHUNG, ma KHONG co trong chkauto
        -Case Tc3    110/0 再診  — o co HAI ma di kem, khong can 部位

.PARAMETER Case
    Lọc theo tên testcase, vd "TcAUTO2" hoặc "Tc0".

.PARAMETER Filter
    Bộ lọc vstest THÔ, để chạy NHIỀU testcase rời rạc trong một lượt:
        -Filter "TcAUTO1|TcAUTO2"

.EXAMPLE
    .\run-insert-auto-santei-rows.ps1 -Diagnostics -Case Tc0     # CHAY CAI NAY TRUOC TIEN
    .\run-insert-auto-santei-rows.ps1 -Case TcAUTO1              # moc, chi hoi DB
    .\run-insert-auto-santei-rows.ps1 -AllowSave -Case TcAUTO2   # lech chinh
    .\run-insert-auto-santei-rows.ps1 -AllowSave -Case TcAUTO3   # doi chung
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [switch]$AllowSave,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowSave)    { $env:OCHA_AUTO_SANTEI_ALLOW_SAVE = "1" }

$ns = "OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto"

if ($Filter -ne "") {
    $parts = $Filter -split '\|' | ForEach-Object { "FullyQualifiedName~$ns&FullyQualifiedName~$($_.Trim())" }
    $filter = $parts -join '|'
} elseif ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.AutoSanteiProbeTests"
    if ($Case -ne "") { $filter = "$filter&FullyQualifiedName~$Case" }
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    # Probe mang [Explicit] nen khong bi keo vao.
    $filter = "FullyQualifiedName~$ns"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=auto-santei.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. auto-santei-KQ.txt                               - cac dong === KQ-n === (chi -Diagnostics)"
Write-Host "2. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "3. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"
Write-Host "4. TestResults\auto-santei.trx                      - ket qua (UTF-8 chuan, doc tieng Nhat duoc)"
Write-Host ""
Write-Host "NGUYEN TRANG SIGA truoc luot chay duoc in trong khoi 'NGUYEN TRANG' cua stdout." -ForegroundColor Yellow
Write-Host "Bi Ctrl+C giua chung thi dung khoi do de dung lai bang tay." -ForegroundColor Yellow

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "auto-santei.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "auto-santei-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
