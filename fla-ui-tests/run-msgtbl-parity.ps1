# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Windows PowerShell 5.1 doc .ps1 khong co
# BOM theo bang ma ANSI, nen moi ky tu Nhat/Viet trong file deu bien thanh rac.
# Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    MSGTBL <-> ja-msgtbl.ts — 40 ma thong bao ban web dung lai, doi chieu voi bang
    MSGTBL THAT cua SIM2000 (140 row).

.DESCRIPTION
    Tra loi dung mot cau: may cau thong bao ma audit noi la sai — co sai that khong?

    Mac dinh chi chay 5 ca CHI DB (TCM0..TCM4): vai giay, KHONG mo app, khong ton
    luot dang nhap nao. Do la phan tra loi duoc nhieu nhat voi gia re nhat.

        TCM0  MSGTBL co dung 140 row; in bang doi chieu day du 40 ma
        TCM1  DOI CHUNG — 24 ma web dang khop thi phai khop TUNG KY TU
        TCM2  16 ma dang lech — lech DUNG nhu da do
        TCM3  E00007 = body cua E00100@frm201045; E00101 KHONG co row
        TCM4  bat bien: row co {0} <=> ham web nhan tham so; Q00039 ngoai le

    -WithUi them hai ca mo app that:

        TCM5  DOI CHUNG GIAO DIEN — E00002 tren tab 個別: hop thoai == row DB == web
        TCM6  E00003 tren frm203042: hop thoai == row DB, KHAC literal web
        TCC1  Q00049 frm203001 F7 会計作成 — canh bao GHI DE + mac dinh Cancel
        TCC2  Q00039 来患集計 F1 印刷 — 「プリンタに」 + co nhan tham so

    TCM5 la seed doi chung. Khong co no thi 「web khac DB」 con co the do cach doc
    hop thoai cua test sai; co no roi thi con so cua TCM6 moi co nghia.

    DOC TRUOC: Tests\MsgTblParity\README.md va ..\FLA-UI-GUIDELINE.md.

.PARAMETER WithUi
    Chay ca TCM5/TCM6 — can MENU.exe mo duoc va dang nhap duoc.
    KHONG ghi DB: TCM5 bi InputCheckKobe chan truoc khi search, TCM6 chi 検索 roi
    dong bang F10 戻る. Khong ca nao bam F9 登録.

.PARAMETER CallSite
    Chi chay MsgTblCallSiteTests — TCC1/TCC2, ve WinForm cua spec Playwright
    fkey-menu\msgtbl-treatment-list-parity.spec.ts (Q00049 va Q00039).
    KHONG ghi gi: ca hai hop thoai deu la cong xac nhan dung TRUOC hanh dong va
    fixture luon tra loi 「キャンセル」.

.PARAMETER AllowSave
    Bat referral.allowSave — cho TCR4 GHI THAT mot dong SHOUKAI_TMP (ten
    ZZ-PARITY-TEST) roi xoa bang chinh F3 cua app, va vet lai bang SQL o
    OneTimeTearDown. Khong bat thi TCR4 tu Ignore, TCR1..TCR3 van chay.

.PARAMETER Referral
    Chay TCR0 — PROBE man 紹介状 (frm203053, Shift+F3). Chup E00001 va E00022.
    KHONG ghi gi: E00001 dung truoc khi cham DB, con E00022 bung TU chkInputData —
    ham nay chay TRUOC insertTemplatedata nen hong kiem tra la khong co dong nao duoc ghi.

.PARAMETER Probe
    Chay TCM9 — PROBE [Explicit] mo man 患者登録 (frm201001) va do ra o/nut/cay UIA.
    CHI DOC, khong bam 登録. Day la buoc chuan bi cho 14 ma con lai nam o man do.

.PARAMETER Case
    Loc theo ten testcase: TCM0..TCM6, TCM9.

.EXAMPLE
    .\run-msgtbl-parity.ps1                  # 1. chi DB, vai giay
    .\run-msgtbl-parity.ps1 -WithUi          # 2. them hai ca hop thoai that
    .\run-msgtbl-parity.ps1 -CallSite        # 3. TCC1/TCC2 — Q00049 + Q00039
    .\run-msgtbl-parity.ps1 -Probe           # 4. PROBE 患者登録 + hai call-site tren
    .\run-msgtbl-parity.ps1 -Case TCM2       # 4. rieng bang 16 ma lech
#>
[CmdletBinding()]
param(
    [switch]$WithUi,
    [switch]$CallSite,
    [switch]$Probe,
    [switch]$Referral,
    [switch]$PatientEntry,
    [switch]$Wizard,
    [switch]$AllowSave,
    [string]$Case = "",
    [int]$StepMs = -1,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
# Bien moi truong dat trong phien SSH KHONG truyen sang Scheduled Task — phai di qua day.
if ($AllowSave) { $env:OCHA_REFERRAL_ALLOW_SAVE = "1" }

$ns = "OchaCom.FlaUiTests.Tests.MsgTblParity"

if ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} elseif ($Wizard) {
    $filter = "FullyQualifiedName~$ns.MsgTblWizardProbeTests"
} elseif ($PatientEntry) {
    $filter = "FullyQualifiedName~$ns.MsgTblPatientEntryTests"
} elseif ($Referral) {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~Referral"
} elseif ($Probe) {
    $filter = "FullyQualifiedName~$ns.MsgTblProbeTests"
} elseif ($CallSite) {
    $filter = "FullyQualifiedName~$ns.MsgTblCallSiteTests"
} elseif ($WithUi) {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName!~MsgTblProbeTests"
} else {
    $filter = "FullyQualifiedName~$ns.MsgTblParityTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=msgtbl-parity.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

Write-Host ""
Write-Host "=== Sau khi chay, doc theo thu tu nay ===" -ForegroundColor Yellow
Write-Host "1. msgtbl-parity-KQ.txt                        - cac dong === KQ-n === (bang doi chieu)"
Write-Host "2. TestResults\msgtbl-parity.trx               - ket qua (UTF-8, doc tieng Nhat duoc)"
Write-Host "   Log console MAT dau tieng Nhat — doc .trx, dung doc console (F9)."
if ($WithUi -or $Probe -or $CallSite -or $Referral -or $PatientEntry -or $Wizard) {
    $artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"
    Write-Host "3. $artifacts\screenshots\<ten test>\*.png     - anh SAU TUNG BUOC"
}

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "msgtbl-parity.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "msgtbl-parity-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
