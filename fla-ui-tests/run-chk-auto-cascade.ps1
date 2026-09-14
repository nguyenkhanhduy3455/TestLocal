# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Kiểm lại bản đánh giá parity 「web thiếu port runChkAuto」 — bằng cách hỏi chính WinForm.

.DESCRIPTION
    Hai fixture, hai cách hỏi:

    1) ChkAutoCascadeTests — chốt 204/0 暫間固定 trên DỮ LIỆU THẬT và đọc chữ ký bốn dòng:

           暫間固定(TFix)set(簡単)              230点   ← mã gõ vào
           0.3mm結紮線＋ｽｰﾊﾟｰﾎﾞﾝﾄﾞ                0点   ← Chk_CmtAuto(204,0)  disp_no 2
           装着材料料 (接着性ﾚｼﾞﾝｾﾒﾝﾄ・標準型)     17点   ← Chk_ChkAuto  chkauto → 264/3
           ルーティングセメント                    0点   ← Chk_CmtAuto(264,3)  modMain.cs:1033

       Dòng thứ tư trả lời §1 (tầng hai CÓ chạy). Dòng thứ ba nằm DƯỚI dòng thứ hai trả
       lời §2. Dòng thứ tư bám liền dòng thứ ba trả lời §5a.

    2) ChkAutoSeededBranchTests — SỬA TẠM master để ép Chk_ChkAuto vào bốn nhánh mà dữ
       liệu thật không bao giờ chạm tới (202 / 179 / men / dấu *), rồi trả lại nguyên
       trạng. Cần cờ RIÊNG -BranchSeed.

    ĐỌC TRƯỚC: Tests\AutoSanteiChkAuto\README.md mục 7, và ..\FLA-UI-GUIDELINE.md.

.PARAMETER Case
    Lọc theo tên testcase: TCC0..TCC5 (cascade) hoặc TCB1..TCB4 (seeded branch).

    ⚠️ TCC0 CHẠY TRƯỚC TIÊN — nó chỉ hỏi DB, mất vài giây, và nói luôn ca nào đo được.

    TCC1..TCC5 dùng CHUNG một cú chốt nên phải chạy CẢ CỤM (bỏ trống -Case).
    TCB1..TCB4 mỗi ca một cú chốt ⇒ chạy TỪNG CA MỘT (F7: trần wrapper 15 phút).

.PARAMETER AllowSave
    Bật chkAutoCascade.allowSave — cho seed 部位病名行 vào TRNTRN (vùng disp_no >= 9000
    của đúng ngày test). KHÔNG bấm F9, KHÔNG đụng SIGA.

.PARAMETER BranchSeed
    Bật chkAutoCascade.allowBranchSeed — cho SỬA TẠM master DÙNG CHUNG (CHKAUTO,
    MST_CMT2). Chỉ ChkAutoSeededBranchTests cần. Fixture chụp — in ra — trả lại.

.EXAMPLE
    .\run-chk-auto-cascade.ps1 -Case TCC0                        # 1. re, chi hoi DB
    .\run-chk-auto-cascade.ps1 -AllowSave                        # 2. ca cum TCC0..TCC5
    .\run-chk-auto-cascade.ps1 -AllowSave -BranchSeed -Case TCB1 # 3. tung ca mot
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$AllowSave,
    [switch]$BranchSeed,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($AllowSave)    { $env:OCHA_CHK_AUTO_CASCADE_ALLOW_SAVE = "1" }
if ($BranchSeed)   { $env:OCHA_CHK_AUTO_BRANCH_SEED = "1" }

$ns = "OchaCom.FlaUiTests.Tests.AutoSanteiChkAuto"

if ($Filter -ne "") {
    $parts = $Filter -split '\|' | ForEach-Object { "FullyQualifiedName~$ns&FullyQualifiedName~$($_.Trim())" }
    $filter = $parts -join '|'
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    # Mac dinh: CHI cum cascade tren du lieu that. Cum seeded branch phai goi ten
    # tuong minh vi no sua master dung chung.
    $filter = "FullyQualifiedName~$ns.ChkAutoCascadeTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=chk-auto-cascade.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. chk-auto-cascade-KQ.txt                          - cac dong === KQ-n ==="
Write-Host "2. TestResults\chk-auto-cascade.trx                 - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "3. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "4. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"
Write-Host ""
Write-Host "NGUYEN TRANG MASTER truoc luot chay duoc in trong khoi 'NGUYEN TRANG' cua stdout." -ForegroundColor Yellow
Write-Host "Bi Ctrl+C giua chung thi dung khoi do de tra CHKAUTO / MST_CMT2 ve bang tay." -ForegroundColor Yellow

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "chk-auto-cascade.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "chk-auto-cascade-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
