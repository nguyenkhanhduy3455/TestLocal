# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    摘要コメントパック 歯管-有床義歯 (pack B000-4) — 欠損病名 va 現存歯, cai nao thang?

.DESCRIPTION
    Tra loi §C1/§C2/§C3 cua userapp\fla-ui-todo-inp-legacy-sync-20260921.md.
    Nguon chan ly: src_20260921\OCHACOM\INP\Lib\CmtAuto.cs:190-236.

    Logic MOI cua WinForm chi con HAI BUOC:
      1. Co 欠損系 病名 tren dong kich hoat  -> HIEN, het chuyen.
      2. Khong co -> mac dinh HIEN, chi AN khi 歯周病検査 gan nhat con ghi nhan 現存歯.

    Ba nua tach han nhau:

      A. CmtPackDentureMasterTests (TCD_0..TCD_5) — CHI HOI DB, khong mo app, vai giay.
         Khoa TIEN DE cua moi ca UI: 116/7 kich hoat DUNG 1 pack (B000-4), pack co DUNG
         1 候補 (=> frm203018 tu chon tu dong, phep do la DONG LUOI chu khong phai hop
         thoai), chuoi 候補 dung nguyen van, ca 51..60 deu co 病名 that, va benh nhan test
         chua co 歯周病検査 nao. CHAY CAI NAY TRUOC MOI THU.

      B. CmtPackDentureProbeTests (TcDP0) — PROBE, [Explicit], KHONG assert.
         Chup anh xem app that lam gi truoc khi tin bat cu assert nao (F1).

      C. Hai fixture SO DO tren giao dien:
         CmtPackDentureNoExamTests  (TCD_10..TCD_12) — §C3, KHONG seed.
         CmtPackDenturePlaqueTests  (TCD_20..TCD_24) — §C2 + §C1, CO seed.

    GHI DB: chi fixture -Plaque ghi, va chi MOT dong 歯周病検査 trong dai disp_no
    9200..9299 (tach khoi 9100..9199 cua CmtPackExitFlg va dong 再初診 o 9001).
    Can cmtPackDenture.allowSeed = true; khong bat thi fixture tu Ignore TRUOC khi mo app.
    Khong ca nao bam F9 登録 — dong do testcase go chi nam trong luoi dang mo.

    Kiem sau moi buoi:
      SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO BETWEEN 9200 AND 9299   -- phai ra 0

    ⚠️ BA BAY, doc truoc khi sua assert:
      1. B000-4 co DUNG 1 候補 => frm203018 goi thang defData() roi dong
         (frm203018.cs:322-324). Hop thoai chi loe qua; dung doi no trong OpenDialogs().
      2. 病名 toi duoc dong 歯管 la nho ModMain.AutoBui chep tu DUNG 1 DONG NGAY TREN
         (modMain.cs:139-156). Vi the phai di tron duong 部位選択 -> 病名選択 -> go ma;
         seed thang DB la vo hieu (F21).
      3. Seed 部位 phai tranh rang bi SIGA danh 欠損 (se = 4): UpdMissingTooth xoa trang
         o do TRUOC vong 「co 現存歯」, nen seed vao rang 欠損 la dung ra ca DOI LAP.

    DOC TRUOC: Tests\CmtPackDenture\README.md va ..\FLA-UI-GUIDELINE.md.

.PARAMETER Case
    Loc theo ten testcase: TCD_0..TCD_5 (DB), TCD_10..TCD_12 (UI khong seed),
    TCD_20..TCD_24 (UI CO seed), TcDP0 (probe).

.PARAMETER NoExam
    Chay fixture §C3 KHONG seed (CmtPackDentureNoExamTests).

.PARAMETER Plaque
    Chay fixture §C2 + §C1 CO seed (CmtPackDenturePlaqueTests).

.PARAMETER Probe
    Chay fixture PROBE thay vi fixture master.

.EXAMPLE
    .\run-cmt-pack-denture.ps1                          # 1. 6 ca DB, vai giay, khong mo app
    .\run-cmt-pack-denture.ps1 -Probe                   # 2. PROBE — nhin app truoc (F1)
    .\run-cmt-pack-denture.ps1 -NoExam -Case TCD_11     # 3. §C3 Ｃ khong 検査   -> HIEN
    .\run-cmt-pack-denture.ps1 -NoExam -Case TCD_12     # 4. §C3 MT khong 検査  -> HIEN
    .\run-cmt-pack-denture.ps1 -Plaque -Case TCD_20     # 5. DOI CHUNG Ｃ + 現存歯 -> AN
    .\run-cmt-pack-denture.ps1 -Plaque -Case TCD_21     # 6. §C2 MT + 現存歯      -> HIEN
    .\run-cmt-pack-denture.ps1 -Plaque -Case TCD_22     # 7. §C1 dis_kbn 53       -> AN
    .\run-cmt-pack-denture.ps1 -Plaque -Case TCD_23     # 8. §C1 dis_kbn 54       -> AN
    .\run-cmt-pack-denture.ps1 -Plaque -Case TCD_24     # 9. §C1 dis_kbn 60       -> AN
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$NoExam,
    [switch]$Plaque,
    [switch]$Probe,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.CmtPackDenture"
$fixture =
    if     ($Probe)  { "CmtPackDentureProbeTests" }
    elseif ($Plaque) { "CmtPackDenturePlaqueTests" }
    elseif ($NoExam) { "CmtPackDentureNoExamTests" }
    else             { "CmtPackDentureMasterTests" }

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
    "--logger", "trx;LogFileName=cmt-pack-denture.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. cmt-pack-denture-KQ.txt                          - cac dong === KQ-n ==="
Write-Host "2. TestResults\cmt-pack-denture.trx                 - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "   Log console MAT dau tieng Nhat -> doc .trx, dung doc console (F9)."
Write-Host "3. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "4. $artifacts\screenshots\<ten test>\*.png          - anh TUNG buoc"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "cmt-pack-denture.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "cmt-pack-denture-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
