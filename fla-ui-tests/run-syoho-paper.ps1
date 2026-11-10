<#
.SYNOPSIS
    診療入力 Shift+F5 -> 処方箋 (frm503002): doc luoi thuoc + tieu de cua ngay do (KHONG in).
    Seed 2 dong thuoc vao dai disp_no 9100+ (can cmtPack.allowSeed) roi don. Khong in. Xem SyohoPaperProbeTests.
.EXAMPLE
    Set-Content logs\command.txt "run-syoho-paper.ps1 -PatNo 10"
#>
[CmdletBinding()]
param(
    [string]$PatNo = "10",
    [string]$TrtDt = (Get-Date -Format "yyyy-MM-dd"),
    [string]$Fixture = "SyohoPaperProbeTests",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$env:OCHA_PAT_NO = $PatNo
$env:OCHA_TRT_DT = $TrtDt
$env:OCHA_KILL_ON_FAIL = "0"

$testArgs = @("test", $project, "-c", $Configuration, "--filter", "FullyQualifiedName~$Fixture",
    "--logger", "console;verbosity=detailed", "--logger", "trx;LogFileName=syoho-paper.trx")
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "syoho-paper.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "syoho-paper-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
