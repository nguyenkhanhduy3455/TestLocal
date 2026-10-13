<#
.SYNOPSIS
    Nhom B — 3 man BaseForm mo tu hang nut duoi luoi 診療入力: 歯管 (frm203021), 指導文書 (frm203022),
    補管・義歯 (frm203023). Do dap an WinForm de doi chieu parity voi ban web.

.DESCRIPTION
    KHONG ghi DB: F8 luon tra loi Cancel, khong bam F9 (in). Dong man bang F10.

.PARAMETER Diagnostics
    Chay PROBE Tc1a..Tc1c (khong assert).

.PARAMETER Case
    Loc theo ten testcase, vd "Tc1a".

.EXAMPLE
    .\run-edit-patient-guidance.ps1 -Diagnostics -Case Tc1a
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
# Cac testcase noi tiep nhau tren cung mot phien app; killOnFail se giet app o testcase do dau tien.
$env:OCHA_KILL_ON_FAIL = "0"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~PatientGuidanceProbeTests"
} else {
    $filter = "FullyQualifiedName~PatientGuidanceTests"
}
if ($Case -ne "") { $filter += "&FullyQualifiedName~$Case" }

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=patient-guidance.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG ghi DB: chi mo man hinh, doc, dong bang F10." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "patient-guidance.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console hong tieng Nhat (PROBE-GUIDELINE 3.7) — loc tu .trx (UTF-8 chuan).
    $kq = Join-Path $PSScriptRoot "patient-guidance-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
