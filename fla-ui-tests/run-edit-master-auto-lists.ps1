<#
.SYNOPSIS
    Nhom A — 3 man 一覧 master (frm203036 / frm203038 / frm203040) mo tu menu F11 「9 オプション」
    va dialog 日付変更 (frm203051): do dap an WinForm de doi chieu parity voi ban web.

.DESCRIPTION
    Nua WinForm cua web-tenant-tests/tests/dialogs-management/procedure-auto-input-dialog.spec.ts,
    master-search-dialogs.spec.ts va fkey-menu/treatment-end-esc-datechg-menu.spec.ts.

    KHONG ghi DB: khong bam F9 cua dialog dang ky, khong tra loi "はい" o Q00100, F1 出力 luon Cancel.
    Dong moi dialog bang F10 (ESC/End = F9 = GHI).

.PARAMETER Diagnostics
    Chay PROBE Tc0a..Tc0d (khong assert).

.PARAMETER Case
    Loc theo ten testcase, vd "Tc0a".

.EXAMPLE
    .\run-edit-master-auto-lists.ps1 -Diagnostics
    .\run-edit-master-auto-lists.ps1 -Diagnostics -Case Tc0d
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
    $filter = "FullyQualifiedName~MasterAutoListsProbeTests"
} else {
    $filter = "FullyQualifiedName~MasterAutoListsTests"
}
if ($Case -ne "") { $filter += "&FullyQualifiedName~$Case" }

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=master-auto-lists.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "KHONG ghi DB: chi mo man hinh, doc, dong bang F10." -ForegroundColor Green

& dotnet @testArgs
$exit = $LASTEXITCODE

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "master-auto-lists.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console hong tieng Nhat (PROBE-GUIDELINE 3.7) — loc tu .trx (UTF-8 chuan).
    $kq = Join-Path $PSScriptRoot "master-auto-lists-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green
}

exit $exit
