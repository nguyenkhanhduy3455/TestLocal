# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    摘要コメントパック exit_flg — mot 候補 co exit_flg co CAT duoc cac pack phia sau khong,
    va cat theo DUNG dong nguoi dung chon?

.DESCRIPTION
    Ba nua tach han nhau:

      A. CmtPackExitFlgMasterTests (TCX_0..TCX_4) — CHI HOI DB, khong mo app, vai giay.
         Khoa lai TIEN DE cua moi ca UI: I017 co 12 候補 voi exit_flg TRON (8 t / 4 f),
         B014-2 co 2 候補 (1 t), cum 歯清 bi cat o 歯清-特, va ＳＰＴ 初回 mang exit_flg.
         CHAY CAI NAY TRUOC MOI THU.

      B. CmtPackExitFlgProbeTests  (TcXP0..TcXP3) — PROBE, [Explicit], KHONG assert.
         TcXP1 la ca QUAN TRONG NHAT: no chup hop thoai 摘要選択 cua I017 de biet 12 候補
         co nam tron trong khung nhin khong. Neu 番号 10/11/12 nam ngoai khung nhin thi
         cu click roi vao hu khong (F10) va TCX_7 se "xanh sai".
         TcXP3 tra loi §C1 (thu tu dong 摘要 mau magenta).

      C. CmtPackExitFlgUiTests     (TCX_5..TCX_10) — SO DO tren giao dien, CO assert.
         CHAY RIENG TUNG CA (F7). Chay chung mot luot thi ca thu hai go lai cung mot ma
         trong cung mot ngay, once_day/once_month co the bo qua pack va ca do ket luan
         NGUOC ma van xanh.

    KHONG GHI DB: khong ca nao bam F9 登録, khong ca nao seed. Dong da go chi nam trong
    luoi dang mo. Dong man hinh thi tra loi 「いいえ」 cho 「保存しますか」.

    ⚠️ BA BAY, doc truoc khi sua assert:

      1. Tren frm203018/frm203019/frm203048, nut 「戻る」 = HUY. SigaToothFlow.DismissAll
         bam dung nut do khi khong tim thay いいえ/No/OK — nen luong nay TU cam lai tu
         EnterCodeOnRow tro di, khong dung EnterTreatment.
      2. O 番号 tren frm203018 la MST_CMT_PACK_DETAIL.seq_no, KHONG phai chi so dong.
         Thu tu dong theo dsp_seq_no nen hai con so nay lech nhau o nhieu pack.
      3. Hop thoai co DUNG 1 dong thi frm203018 tu chon va tu dong (frm203018.cs:313-315)
         — khong kip nhin thay gi.

    DOC TRUOC: Tests\CmtPackExitFlg\README.md va ..\FLA-UI-GUIDELINE.md.

.PARAMETER Case
    Loc theo ten testcase: TCX_0..TCX_4 (DB), TCX_5..TCX_10 (UI khong seed),
    TCX_11..TCX_19 (UI CO seed), TcXP0..TcXP4 (probe).

.PARAMETER Ui
    Chay fixture SO DO tren giao dien (CmtPackExitFlgUiTests) thay vi fixture master.

.PARAMETER Probe
    Chay fixture PROBE thay vi fixture master.

.PARAMETER Seed
    Chay fixture CO SEED lich su 口管強 (CmtPackKonCSeedTests) — §B1 + §B3.
    Can cmtPack.allowSeed = true; khong bat thi fixture tu Ignore TRUOC khi mo app.

.PARAMETER SeedCe
    Chay fixture DOI CHUNG chi seed 116/20 (CmtPackCeOnlySeedTests) — TCX_14.

.PARAMETER PrevDate
    Chay fixture §B2 KHONG seed (CmtPackPrevDateTests) — TCX_15, TCX_16.

.PARAMETER PrevDateLatest
    Chay fixture §B2 co seed (CmtPackPrevDateLatestTests) — TCX_17.

.PARAMETER Spt
    Chay fixture §B4 seed lich su ＳＰＴ (CmtPackSptTests) — TCX_18.

.PARAMETER SptP
    Chay fixture §B4 seed lich su Ｐ重防 (CmtPackSptJyubouTests) — TCX_19.

.EXAMPLE
    .\run-cmt-pack-exit-flg.ps1                       # 1. 5 ca DB, vai giay, khong mo app
    .\run-cmt-pack-exit-flg.ps1 -Probe -Case TcXP1    # 2. PROBE hinh dang hop thoai I017
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_5       # 3. 195/0 chon 番号 1  → PHAI dung
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_6       # 4. 195/0 chon 番号 7  → chay tiep
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_7       # 5. 195/0 chon 番号 10 → chay tiep
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_8       # 6. 195/0 bam 戻る     → chay tiep
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_9       # 7. 108/5 chon 番号 1  → PHAI dung
    .\run-cmt-pack-exit-flg.ps1 -Ui -Case TCX_10      # 8. 108/5 bam 戻る     → chay tiep

    # --- can cmtPack.allowSeed = true ---
    .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_11    # 9.  §B3 huy frm203019 ma VAN bi cat
    .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_12    # 10. §B3 xac nhan frm203019, van bi cat
    .\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_13    # 11. §B1 歯清-特 cat sach seq 4..7
    .\run-cmt-pack-exit-flg.ps1 -SeedCe -Case TCX_14  # 12. DOI CHUNG cho TCX_11
    .\run-cmt-pack-exit-flg.ps1 -PrevDate -Case TCX_15       # 13. §B2 ngay 3 → ngay 14
    .\run-cmt-pack-exit-flg.ps1 -PrevDate -Case TCX_16       # 14. §B2 dao thu tu
    .\run-cmt-pack-exit-flg.ps1 -PrevDateLatest -Case TCX_17 # 15. §B2 ung vien nao thang
    .\run-cmt-pack-exit-flg.ps1 -Spt  -Case TCX_18           # 16. §B4 前回実施年月 DU NGAY
    .\run-cmt-pack-exit-flg.ps1 -SptP -Case TCX_19           # 17. §B4 Ｐ重防 tinh la lan truoc
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$Ui,
    [switch]$Probe,
    [switch]$Seed,
    [switch]$SeedCe,
    [switch]$PrevDate,
    [switch]$PrevDateLatest,
    [switch]$Spt,
    [switch]$SptP,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }

$ns = "OchaCom.FlaUiTests.Tests.CmtPackExitFlg"
$fixture =
    if     ($Probe)          { "CmtPackExitFlgProbeTests" }
    elseif ($Ui)             { "CmtPackExitFlgUiTests" }
    elseif ($Seed)           { "CmtPackKonCSeedTests" }
    elseif ($SeedCe)         { "CmtPackCeOnlySeedTests" }
    elseif ($PrevDateLatest) { "CmtPackPrevDateLatestTests" }
    elseif ($PrevDate)       { "CmtPackPrevDateTests" }
    elseif ($SptP)           { "CmtPackSptJyubouTests" }
    elseif ($Spt)            { "CmtPackSptTests" }
    else                     { "CmtPackExitFlgMasterTests" }

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
    "--logger", "trx;LogFileName=cmt-pack-exit-flg.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. cmt-pack-exit-flg-KQ.txt                         - cac dong === KQ-n ==="
Write-Host "2. TestResults\cmt-pack-exit-flg.trx                - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "   Log console MAT dau tieng Nhat -> doc .trx, dung doc console (F9)."
Write-Host "3. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "4. $artifacts\screenshots\<ten test>\hop-thoai-*.png - anh TUNG hop thoai"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "cmt-pack-exit-flg.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "cmt-pack-exit-flg-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
