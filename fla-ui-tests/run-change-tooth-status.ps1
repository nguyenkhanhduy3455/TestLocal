# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Chạy luồng SigaToothStatus — 自歯状況変更 (SIGA) và 根数変更 (KON), nửa WinForm của ba spec:
        ..\web-tenant-tests\tests\tooth-extraction-siga-restore.spec.ts
        ..\web-tenant-tests\tests\siga-kon-remaining-gaps.spec.ts
        ..\web-tenant-tests\tests\p-mode-kesson-siga.spec.ts

.DESCRIPTION
    Phím → hàm WinForm mà runner này lái (BỐN đường ghi 歯式, ba trong số đó chạy TRƯỚC F9):

        chốt 処置 trong 処置選択  → frm203016.IregCodChk → SigaChg       → update Siga/Kon NGAY
        Delete trên lưới 処置    → frm203002.DeleteRow   → DelExtRec     → update Siga NGAY
        病検 → Ｐ変更 → はい      → ChkBuiDisChg          → Chk_PModeKesson → update Siga NGAY
        F9 登録                  → modSave.Save_Data     → SigaChg_Save  → dựng lại từ tập 処置

    ⚠️ GHI DB THẬT vào hai bảng SIGA và KON, và ghi NGAY LÚC NHẬP — không có cách nào
       "chỉ nhìn" ba đường đầu. Vì thế mọi fixture ở đây nằm sau cờ RIÊNG
       `sigaTooth.allowSave` (mặc định false ⇒ tự Ignore trước khi mở app).
       Fixture chụp SIGA/KON ở OneTimeSetUp, IN RA STDOUT, và trả lại ở OneTimeTearDown.

    Tiền đề mà bộ test KHÔNG tự dựng được:
      1. Bệnh nhân test phải có dòng trong SIGA và KON (app tự tạo khi mở màn — modKonSiga.cs:70-84).
      2. Tháng của patient.trtDate phải CÓ ÍT NHẤT MỘT dòng 処置 để đứng lên gõ mã;
         tháng trống thì không có dòng nào mở được 部位選択.
      3. Master của tháng đó phải có 179 (抜歯), 122 枝番 3 (ＥＭＲ４根), 185 (歯根嚢胞摘出手術).
         Probe hỏi thẳng DB và in ra ở dòng "=== KQ-1 ===".

    ĐỌC TRƯỚC: Tests\SigaToothStatus\README.md và ..\PROBE-GUIDELINE.md.

.PARAMETER Diagnostics
    Chỉ chạy PROBE (SigaToothProbeTests, [Explicit]): đi trọn từng đường ghi, chụp ảnh
    từng bước, KHÔNG assert. Chạy cái này TRƯỚC khi đi sửa một testcase đỏ.
    Đáp án nằm ở các dòng "=== KQ-n ===", runner lọc sẵn ra siga-tooth-KQ.txt.

    ⚠️ CHAY TUNG CASE MOT, dung chay ca fixture. Wrapper cat o 15 phut, ma MOT vong
    「Insert → 部位選択 → 病名選択 → go ma → 処置選択」 ton 2-3 phut. Ngay 2026-09-03 mot
    probe gop 4 vong da vuot tran: wrapper khong kip ghi ca dong TIMEOUT, MENU.exe va
    dotnet o lai, may Windows phai khoi dong lai.

    Probe co SAU testcase, moi cai TOI DA hai vong:
        -Case Tc0    179 抜歯: SigaChg luc nhap + DelExtRec luc xoa
        -Case Tc1a   乳歯 179/0: sn = 9 luc nhap, sn = 5 luc xoa
        -Case Tc1b   ＥＭＲ 122/3 → KON
        -Case Tc1c   185 → hop thoai 抜歯同時
        -Case Tc2    病検 Ｐ変更 (Chk_PModeKesson) + dirty gate cua F10 戻る
        -Case Tc3    F9 登録 → SigaChg_Save

.PARAMETER Case
    Lọc theo tên testcase, vd "Tc0" hoặc "TcDEL1".

.EXAMPLE
    .\run-change-tooth-status.ps1 -Diagnostics -Case Tc0    # CHAY CAI NAY TRUOC TIEN
    .\run-change-tooth-status.ps1                            # ca bo testcase
    .\run-change-tooth-status.ps1 -Case TcDEL                # chi nhom DelExtRec
    .\run-change-tooth-status.ps1 -StepMs 1200               # cham lai de nhin
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [switch]$Diagnostics,
    [switch]$AllowSave,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowSave)    { $env:OCHA_SIGA_ALLOW_SAVE = "1" }

$ns = "OchaCom.FlaUiTests.Tests.SigaToothStatus"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.SigaToothProbeTests"
    if ($Case -ne "") { $filter = "$filter&FullyQualifiedName~$Case" }
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    # Ba fixture assert; probe mang [Explicit] nen khong bi keo vao.
    $filter = "FullyQualifiedName~$ns"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=siga-tooth.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. siga-tooth-KQ.txt                                - cac dong === KQ-n === (chi -Diagnostics)"
Write-Host "2. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "3. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"
Write-Host "4. TestResults\siga-tooth.trx                       - ket qua (UTF-8 chuan, doc tieng Nhat duoc)"
Write-Host ""
Write-Host "NGUYEN TRANG SIGA/KON truoc luot chay duoc in trong khoi 'NGUYEN TRANG' cua stdout." -ForegroundColor Yellow
Write-Host "Bi Ctrl+C giua chung thi dung khoi do de dung lai bang tay." -ForegroundColor Yellow

# Loc san cac dong KQ- ra mot file cho de doc.
$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "siga-tooth.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "siga-tooth-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
