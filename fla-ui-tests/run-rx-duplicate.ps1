<#
.SYNOPSIS
    処方箋 (frm210001/frm210002) - do WinForm co nhan doi dong thuoc khi don bi huy roi phat hanh lai khong.
    Chi doc. Xem RxDuplicateProbeTests.
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$env:OCHA_KILL_ON_FAIL = "0"

$filter = "FullyQualifiedName~RxDuplicateProbeTests"
if ($Case -ne "") { $filter += "&FullyQualifiedName~$Case" }

$testArgs = @("test", $project, "-c", $Configuration, "--filter", $filter,
    "--logger", "console;verbosity=detailed", "--logger", "trx;LogFileName=rx-duplicate.trx")
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "rx-duplicate.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "rx-duplicate-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
