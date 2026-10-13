<#
.SYNOPSIS
    診療入力 F5 「処方」 -> frm210002: do WinForm co nhan doi dong thuoc khi mo don tu 診療入力 khong.
    Chi doc (khong ghi DB). Xem RxFromTreatmentProbeTests.
.EXAMPLE
    Set-Content logs\command.txt "run-rx-from-treatment.ps1 -PatNo 4031 -TrtDt 2025-10-08"
#>
[CmdletBinding()]
param(
    [string]$PatNo = "4031",
    [string]$TrtDt = "2025-10-08",
    [string]$Fixture = "RxFromTreatmentProbeTests",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$env:OCHA_PAT_NO = $PatNo
$env:OCHA_TRT_DT = $TrtDt
$env:OCHA_KILL_ON_FAIL = "0"

$testArgs = @("test", $project, "-c", $Configuration, "--filter", "FullyQualifiedName~$Fixture",
    "--logger", "console;verbosity=detailed", "--logger", "trx;LogFileName=rx-from-treatment.trx")
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "rx-from-treatment.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "rx-from-treatment-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
