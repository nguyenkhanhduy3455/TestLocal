# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    摘要コメントパック type 10（自動選択）— do xem trong 21 condition chua port, cai nao
    CON CHAY DUOC, va WinForm co tinh ca dong CHUA F9 hay khong.

.DESCRIPTION
    Hai nua tach han nhau:

      A. CmtPackMasterTests  (TC10_0..TC10_3) — CHI HOI DB, khong mo app, vai giay.
         Tra loi cau dat nhat: pack nao da het hieu luc => handler la CODE CHET.
         Do duoc 2026-09-16: 12/30 pack chua port da chet (歯CAD 8, Denture 2, SPT2 1,
         歯清-特導 1). Chay cai nay TRUOC MOI THU.

      B. CmtPackType10UiTests (TC10_4, TC10_5) — SO DO tren giao dien, CO assert.
         TC10_4 la ca DOI CHUNG (go 歯清 mot minh), TC10_5 la phep do (go 105/2 CHUA F9
         roi go 歯清). Chay RIENG tung ca: chay chung thi TC10_5 go 歯清 lan hai trong
         cung ngay va tien de co the khong thanh.

      C. CmtPackProbeTests   (TcCP0..TcCP2) — PROBE giao dien, [Explicit], khong assert.
         Go 歯清 108/2 roi doc cac dong 摘要コメント roi xuong luoi; go them 116/23 roi go
         歯清 lan nua de xem dong CHUA LUU co duoc tinh khong.

    KHONG GHI DB: khong ca nao bam F9 登録, khong ca nao seed. Dong da go chi nam trong
    luoi dang mo. Dong man hinh thi tra loi 「いいえ」 cho 「保存しますか」.

    ⚠️ BA BAY, doc truoc khi sua assert:

      1. Pack co CUA SO NGAY o CA HAI bang (MST_CMT_PACK va MST_CMT_PACK_DEF). Het han
         mot trong hai la handler khong bao gio chay — do truoc khi port.
      2. Mot cu go 歯清 kich hoat 6 pack, trong do I030-2-2 la type 90 (mo frm203019) va
         I030-3 la type 1 (mo frm203018). Hop thoai bung ra la BINH THUONG o luong nay.
      3. 歯清-口管強(根C) dung CHUNG mot handler o CA type 10 LAN type 90 — port thieu mot
         trong hai la lech.

    DOC TRUOC: Tests\CmtPackType10\README.md va ..\FLA-UI-GUIDELINE.md.

.PARAMETER Case
    Loc theo ten testcase: TC10_0..TC10_3 (DB) hoac TcCP0..TcCP2 (probe).

.PARAMETER Ui
    Chay fixture SO DO tren giao dien (CmtPackType10UiTests) thay vi fixture master.

.PARAMETER Probe
    Chay fixture PROBE thay vi fixture master. Probe mang [Explicit] nen phai loc dich
    danh — runner tu them dieu do.

.EXAMPLE
    .\run-cmt-pack-type10.ps1                      # 1. ca 4 ca DB, vai giay, khong mo app
    .\run-cmt-pack-type10.ps1 -Case TC10_0         # 2. rieng bang tra
    .\run-cmt-pack-type10.ps1 -Ui -Case TC10_4     # 3. doi chung: 歯清 mot minh
    .\run-cmt-pack-type10.ps1 -Ui -Case TC10_5     # 4. phep do: dong CHUA F9 co duoc tinh
    .\run-cmt-pack-type10.ps1 -Probe -Case TcCP0   # 5. moc: master + luoi luc mo man
    .\run-cmt-pack-type10.ps1 -Probe -Case TcCP1   # 6. probe: go 歯清 mot minh
    .\run-cmt-pack-type10.ps1 -Probe -Case TcCP2   # 7. probe: dong CHUA LUU
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$Ui,
    [switch]$Probe,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.CmtPackType10"
$fixture = if ($Probe) { "CmtPackProbeTests" } elseif ($Ui) { "CmtPackType10UiTests" } else { "CmtPackMasterTests" }

if ($Filter -ne "") {
    $parts = $Filter -split '\|' | ForEach-Object { "FullyQualifiedName~$ns&FullyQualifiedName~$($_.Trim())" }
    $filter = $parts -join '|'
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns.$fixture&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.$fixture"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=cmt-pack-type10.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. cmt-pack-type10-KQ.txt                           - cac dong === KQ-n ==="
Write-Host "2. TestResults\cmt-pack-type10.trx                  - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "   Log console MAT dau tieng Nhat -> doc .trx, dung doc console (F9)."
Write-Host "3. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "4. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "cmt-pack-type10.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "cmt-pack-type10-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
