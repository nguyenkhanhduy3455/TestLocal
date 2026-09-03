# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Chạy luồng MenInput — 面入力 (frm203035), nửa WinForm của
    ..\web-tenant-tests\tests\men-input-dialog.spec.ts.

.DESCRIPTION
    Phím → hàm WinForm mà runner này lái:
        chốt 枝番 có men=1 trong 処置選択 → frm203016.cs:1573 showDialog(ID203035)
        → F9 確定 trong 面入力 → frm203035.fixProc (面文字列作成 + ghi cột 2 và cột 72)

    KHÔNG bấm F9 登録 ⇒ KHÔNG ghi DB. Kết quả (cột 72 = FREEWD) đọc thẳng từ lưới
    sau khi bật cột ẩn bằng cửa hậu có sẵn của app — xem MenInputFlow. Bên Playwright
    phải bấm 登録 rồi query trn_trn.freewd (TC-M8, sau cờ TEST_ALLOW_SAVE); ở đây không.

    Tiền đề mà bộ test KHÔNG tự dựng được:
      1. INPCONFIG.MENINPUT_FLG = 1. Cờ tắt thì 面入力 không bao giờ mở và mọi
         testcase đỏ trông y hệt "WinForm hỏng". TC-M0 hỏi DB rồi Ignore kèm lý do.
      2. Bệnh nhân + ngày đang mở phải có ít nhất MỘT dòng mang 部位 (BUI1..32 khác 0).
         frm203035_Activated đóng ngay khi _buiCnt == 0.
      3. Master của ngày đó phải có một trt_cd chứa CẢ 枝番 men=1 LẪN men=0 —
         không hard-code, MenInputDb.FindMenPair đi hỏi.

    ĐỌC TRƯỚC: Tests\MenInput\README.md và ..\PROBE-GUIDELINE.md.

.PARAMETER Diagnostics
    Chỉ chạy PROBE (MenInputProbeTests.Tc0): đi trọn một vòng, chụp ảnh từng bước,
    đổ cây UIA của frm203035, KHÔNG assert. Chạy cái này TRƯỚC khi đi sửa một
    testcase đỏ — sai locator thì log trông y hệt "WinForm sai".
    Đáp án nằm ở các dòng "=== KQ-n ===", runner lọc sẵn ra men-input-KQ.txt.

.PARAMETER Case
    Lọc theo tên testcase, vd "TcM4".

.EXAMPLE
    .\run-input-tooth-surfaces.ps1                 # ca bo testcase
    .\run-input-tooth-surfaces.ps1 -Diagnostics    # chi PROBE
    .\run-input-tooth-surfaces.ps1 -Case TcM4
    .\run-input-tooth-surfaces.ps1 -StepMs 1200    # cham lai de nhin
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

$ns = "OchaCom.FlaUiTests.Tests.MenInput"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.MenInputProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.MenInputTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=men-input.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. $artifacts\screenshots\<ten test>\_trace.log   - nhat ky TUNG BUOC"
Write-Host "2. $artifacts\screenshots\<ten test>\*.png        - anh SAU TUNG BUOC"
Write-Host "3. men-input-KQ.txt                                - cac dong === KQ-n === (chi -Diagnostics)"
Write-Host "4. $artifacts\men-input-frm203035.uia.txt          - cay UIA cua 面入力"

# Loc san cac dong KQ- ra mot file cho de doc.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "men-input.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "men-input-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
