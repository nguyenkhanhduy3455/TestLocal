<#
.SYNOPSIS
    機能設定 (frm506008) tab 患者登録 + 予約: doc man hinh + do hang so TIME khi F9.
    Doc DB + UI; KQ-2 ghi YOYAKUCONFIG sau co OCHA_FUNCTION_SETTINGS_ALLOW_WRITE=1, chup-in-tra lai. Xem FunctionSettingsProbeTests.
.EXAMPLE
    Set-Content logs\command.txt "run-function-settings.ps1"
#>
[CmdletBinding()]
param(
    [string]$PatNo = "10",
    [string]$TrtDt = (Get-Date -Format "yyyy-MM-dd"),
    [switch]$AllowWrite,
    [string]$Fixture = "FunctionSettingsProbeTests",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$env:OCHA_PAT_NO = $PatNo
$env:OCHA_TRT_DT = $TrtDt
$env:OCHA_KILL_ON_FAIL = "0"
if ($AllowWrite) { $env:OCHA_FUNCTION_SETTINGS_ALLOW_WRITE = "1" } else { Remove-Item Env:OCHA_FUNCTION_SETTINGS_ALLOW_WRITE -ErrorAction SilentlyContinue }

$testArgs = @("test", $project, "-c", $Configuration, "--filter", "FullyQualifiedName~$Fixture",
    "--logger", "console;verbosity=detailed", "--logger", "trx;LogFileName=function-settings.trx")
Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "function-settings.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "function-settings-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
