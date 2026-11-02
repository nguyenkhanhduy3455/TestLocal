<#
.SYNOPSIS
    医薬品使用状況 (frm506011) — do dap an WinForm cho nhieu 届出年月 de doi chieu voi ban web.

.DESCRIPTION
    Nua WinForm cua web-tenant-tests/tests/dialogs-management/drug-usage-status.spec.ts.
    CHI DOC: frm506011 khong ghi DB. Du lieu ca bien (benh nhan 990900) seed/don tu phia Mac.

    Duong vao: メインメニュー → その他業務 → 初期設定 → 施設基準届出設定 → double-click 後発使１.

.PARAMETER Months
    Danh sach 届出年月 yyyyMM, phay ngan cach. Vd "202605,202404".

.EXAMPLE
    .\run-sum-drug-usage.ps1 -Months 202605,202404
#>
[CmdletBinding()]
param(
    [string]$Months = "202605",
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

$env:OCHA_DUS_MONTHS = $Months
$env:OCHA_KILL_ON_FAIL = "0"

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", "FullyQualifiedName~DrugUsageStatusProbeTests",
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=drug-usage-status.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "drug-usage-status.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console hong tieng Nhat (F9) => loc tu .trx (UTF-8).
    $kq = Join-Path $PSScriptRoot "drug-usage-status-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "KQ: $kq" -ForegroundColor Green
}

exit $exit
