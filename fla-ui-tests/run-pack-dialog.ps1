# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    Tab パック (tab 3) cua side panel 診療入力 — chot mot pack phai bung frm203014
    パック処置選択 voi dung cac item, va o cac ca bien phai hien dung THONG BAO.

.DESCRIPTION
    Duong di:

        grdPack_CellDoubleClick (frm203002.cs:6771)
          ├─ hFG1[51,Y] == "99" → MsgBox「当月以外の操作はできません」/「操作不可」 roi RETURN
          ├─ e.RowIndex < 0    → return, KHONG mo gi
          └─ showDialog(ID203014)
               frm203014_Load (:110) → initProc → getViewData (:373)
                 └─ Rows.Count == 0 → this.Close() TRUOC roi MsgBox
                                      「算定可能な処置はありません。」/「処置パック」 (:122-124)

    ⚠️ BA BAY, doc truoc khi sua bat cu assert nao:

      1. F9 / End / Escape tren frm203014 DEU la 確定 (frm203014.cs:148-156) — KHONG co
         phim huy. Gui Escape de 「dong cho xong」 la CHOT du lieu xuong luoi 処置.
      2. Luoi rong => form TU DONG roi MOI hien thong bao. Di tim 「form con mo khong」
         de ket luan la sai duong.
      3. So thu tu dong tren grdPack KHONG on dinh: sap theo USE_CNT DESC khi Ocha.xml
         bat IntelliPac, ma USE_CNT tang moi lan dung. Tim pack theo MA hoac TEN.

    Luong nay KHONG chot item nao xuong luoi 処置 va KHONG bam F9 登録 => khong dung
    TRNTRN. Chi TCP5 ghi SIGA (co RIENG -AllowSigaSetup), co chup — in ra — tra lai.

    DOC TRUOC: Tests\PackDialog\README.md va ..\FLA-UI-GUIDELINE.md.

.PARAMETER Case
    Loc theo ten testcase: TCP0..TCP8.

    ⚠️ TCP0 CHAY TRUOC TIEN — chi hoi DB, mat vai giay, va noi luon ca nao do duoc.

    TCP1..TCP8 dung CHUNG mot lan mo dialog (TCP1 mo, cac TC sau doc lai) => chay ca cum.
    TCP5 mo LAI man hinh 診療入力 nen ton them mot vong; chay rieng no khi can.

.PARAMETER AllowSeed
    Bat testPatient.allowSeed — luong DUNG MOT BENH NHAN TEST MOI (PAT_NO >= 990000),
    clone tu mot benh nhan that co du ho so, roi XOA SACH sau luot chay. Khong bat thi
    ca fixture tu Ignore TRUOC khi mo app.

    ⚠️ Benh nhan moi co lich su 処置 TRONG, nen ca nao can du lieu thang truoc
    (vi du TCP4 「dong thang khac」) se tu Ignore kem ly do.

.PARAMETER AllowSigaSetup
    Bat packDialog.allowSigaSetup — cho TCP5 dat SIGA ve 欠損歯 de ep chkSiga loai het
    item, roi tra lai nguyen trang.

.EXAMPLE
    .\run-pack-dialog.ps1 -Case TCP0                                 # 1. re, chi hoi DB
    .\run-pack-dialog.ps1 -AllowSeed                                 # 2. ca cum (tru TCP5)
    .\run-pack-dialog.ps1 -AllowSeed -AllowSigaSetup -Case TCP5      # 3. ca 「pack rong」
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [string]$Filter = "",
    [int]$StepMs = -1,
    [switch]$AllowSeed,
    [switch]$AllowSigaSetup,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0)    { $env:OCHA_STEP_MS = "$StepMs" }
# ⚠️ Bien moi truong dat trong phien SSH KHONG truyen sang Scheduled Task — moi co
#    phai di qua tham so cua runner nay (da vap 2026-09-14).
if ($AllowSeed)      { $env:OCHA_TEST_PATIENT_ALLOW_SEED = "1" }
if ($AllowSigaSetup) { $env:OCHA_PACK_ALLOW_SIGA_SETUP = "1" }

$ns = "OchaCom.FlaUiTests.Tests.PackDialog"

if ($Filter -ne "") {
    $parts = $Filter -split '\|' | ForEach-Object { "FullyQualifiedName~$ns&FullyQualifiedName~$($_.Trim())" }
    $filter = $parts -join '|'
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=pack-dialog.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. pack-dialog-KQ.txt                               - cac dong === KQ-n ==="
Write-Host "2. TestResults\pack-dialog.trx                      - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "3. $artifacts\screenshots\<ten test>\_trace.log     - nhat ky TUNG BUOC"
Write-Host "4. $artifacts\screenshots\<ten test>\*.png          - anh SAU TUNG BUOC"
Write-Host ""
Write-Host "NGUYEN TRANG SIGA (neu chay TCP5) duoc in trong stdout. Ctrl+C giua chung thi" -ForegroundColor Yellow
Write-Host "dung khoi do de tra SIGA ve bang tay." -ForegroundColor Yellow

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "pack-dialog.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "pack-dialog-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
