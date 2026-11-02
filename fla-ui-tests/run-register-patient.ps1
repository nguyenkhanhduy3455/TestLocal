<#
.SYNOPSIS
    患者登録 (frm201001) — PROBE phia WinForm cho cap parity
    web-tenant-tests/tests/patient-select/patient-registration-*.spec.ts.

.DESCRIPTION
    Ba lo, moi lo mot luot (tran 15 phut, F7):
      -Case PrA   編集: Shift+F6/F9 chua sua, Shift+F6 da sua, F12, F10 -> はい
      -Case PrB   編集: 削除 1 tab, Q00200, nhan tab, hoi copy, 削除 tab da luu, 担当医 trong, F8
      -Case PrC   新規: F10 chua sua, lop Shift, F7 -> F10, F1 コピー

    GHI DB: mot benh nhan test (PAT_NO >= 990000, clone tu 11515), xoa cuoi luot.

.EXAMPLE
    .\run-register-patient.ps1 -Case PrA
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Case,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

$env:OCHA_TEST_PATIENT_ALLOW_SEED = "1"
$env:OCHA_TEST_PATIENT_TEMPLATE = "11515"
$env:OCHA_KILL_ON_FAIL = "0"

$ns = "OchaCom.FlaUiTests.Tests.PatientRegistration"
$filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=register-patient.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "register-patient.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "register-patient-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc cac dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
