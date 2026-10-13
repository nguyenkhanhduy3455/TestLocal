<#
  .SYNOPSIS
    Nhom C — dialog so do rang / anh mo tu 診療入力 (歯周情報, 治療情報, 補綴管理, 画像, PCR). Do dap an WinForm.

.DESCRIPTION
    KHONG ghi DB: F8 luon tra loi Cancel, khong bam F9 (in). Dong man bang F10.

.PARAMETER Diagnostics
    Chay PROBE Tc5a..Tc5e (khong assert).

.PARAMETER Case
    Loc theo ten testcase, vd "Tc5a".

.EXAMPLE
    .\run-edit-tooth-info.ps1 -Diagnostics -Case Tc5a
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
    $filter = "FullyQualifiedName~ToothInfoProbeTests"
} else {
    $filter = "FullyQualifiedName~ToothInfoTests"
}
if ($Case -ne "") { $filter += "&FullyQualifiedName~$Case" }

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=tooth-info.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG ghi DB: chi mo man hinh, doc, dong bang F10." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "tooth-info.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console hong tieng Nhat (PROBE-GUIDELINE 3.7) — loc tu .trx (UTF-8 chuan).
    $kq = Join-Path $PSScriptRoot "tooth-info-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
