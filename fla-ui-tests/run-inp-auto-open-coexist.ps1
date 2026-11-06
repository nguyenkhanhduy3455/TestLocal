# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF). Dung xoa BOM khi sua file nay.
<#
.SYNOPSIS
    PROBE legacy: 治療情報 (Dcond) / 歯周情報 (PCond) tu mo cung luc voi hop 初診 khi vao 診療入力.

.DESCRIPTION
    Va C:\NEW_SIM2000\Ocha.xml (PCond/Dcond), TAT MENU.exe dang chay, mo 診療入力 o che do Insert,
    do z-order / rect / foreground cua 治療情報, 歯周情報 va hop 「〜を算定しますか？」, tra loi Cancel.
    Tra lai Ocha.xml nguyen byte o cuoi. KHONG bam F9, KHONG ghi DB.

    MOI SCENARIO MOT LUOT CHAY (OchaXml chi nap luc app khoi dong):
        .\run-inp-auto-open-coexist.ps1 -Pcond 9 -Dcond 1
        .\run-inp-auto-open-coexist.ps1 -Pcond 1 -Dcond 9
        .\run-inp-auto-open-coexist.ps1 -Pcond 1 -Dcond 1

.PARAMETER Pcond / Dcond   1 = bat, 9 = tat (quy uoc legacy).
.PARAMETER Answer         Cancel (mac dinh) hoac Yes: Yes tinh 初診 vao luoi (bo nho, khong F9) de do hop comment.
.PARAMETER PickIndex      Chon benh nhan thu n trong danh sach ung vien (0 = dau tien).
.PARAMETER PatNo           Ep benh nhan; mac dinh tu chon benh nhan CO 歯周病検査 va chua co dong o ngay test.
#>
[CmdletBinding()]
param(
    [ValidateSet("1", "9")][string]$Pcond = "9",
    [ValidateSet("1", "9")][string]$Dcond = "9",
    [string]$PatNo = "",
    [ValidateSet("Cancel", "Yes")][string]$Answer = "Cancel",
    [int]$PickIndex = 0,
    [ValidateSet("Debug", "Release")][string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

$env:OCHA_INP_AUTO_OPEN_ALLOW_XML_PATCH = "1"
$env:OCHA_PCOND = $Pcond
$env:OCHA_DCOND = $Dcond
if ($PatNo -ne "") { $env:OCHA_PROBE_PAT_NO = $PatNo }
$env:OCHA_PROBE_ANSWER = $Answer
$env:OCHA_PROBE_PICK_INDEX = "$PickIndex"

$ns = "OchaCom.FlaUiTests.Tests.InpAutoOpenCoexist"
$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", "FullyQualifiedName~$ns.InpAutoOpenCoexistProbeTests",
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=inp-auto-open-coexist.trx"
)

Write-Host "PCond=$Pcond Dcond=$Dcond" -ForegroundColor Cyan
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

# Phong khi test chet giua chung: bao cho nguoi chay biet Ocha.xml co the dang bi va.
Write-Host ""
Write-Host "Kiem tra Ocha.xml sau luot chay:" -ForegroundColor Yellow
Select-String -Path "C:\NEW_SIM2000\Ocha.xml" -Pattern "<PCond>|<Dcond>" | ForEach-Object { $_.Line.Trim() }
Write-Host "(Neu khac gia tri ban dau: chep lai tu artifacts\Ocha.xml.bak-*)" -ForegroundColor Yellow

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "inp-auto-open-coexist.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "inp-auto-open-coexist-KQ-P$Pcond-D$Dcond-$Answer-i$PickIndex.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-|^\s+z\d|---\s+t=" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc ket qua vao: $kq" -ForegroundColor Green
}
exit $exit
