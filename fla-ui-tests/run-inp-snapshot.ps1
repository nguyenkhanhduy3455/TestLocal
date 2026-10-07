<#
.SYNOPSIS
    Parity 診療入力 — vế WinForm: chạy MỘT kịch bản rồi ghi snapshot JSON.

.DESCRIPTION
    Kịch bản = tên method trong Tests\ParitySnapshot\InpSnapshotTests.cs (vd Open).
    Không kịch bản nào bấm F9 => không ghi DB. JSON ra
    capture-results\parity-snapshot\winform-<case>-<PatNo>-<TrtDt>.json.

    Chạy từ xa (FLA-UI-GUIDELINE F5): ghi dòng lệnh vào logs\command.txt rồi
    schtasks /run /tn FlaUI-Tests-Run — tools/parity-snapshot/run-case.sh làm sẵn.

.EXAMPLE
    .\run-inp-snapshot.ps1 -PatNo 3948 -TrtDt 2026-06-28 -Case Open
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$PatNo,
    [Parameter(Mandatory = $true)][string]$TrtDt,
    [Parameter(Mandatory = $true)][string]$Case,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$outDir = Join-Path $PSScriptRoot "..\capture-results\parity-snapshot"

$env:OCHA_PAT_NO = $PatNo
$env:OCHA_TRT_DT = $TrtDt
$env:OCHA_SNAPSHOT_DIR = (New-Item -ItemType Directory -Force -Path $outDir).FullName

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", "FullyQualifiedName=OchaCom.FlaUiTests.Tests.ParitySnapshot.InpSnapshotTests.$Case",
    "--logger", "console;verbosity=normal",
    "--logger", "trx;LogFileName=inp-snapshot-$Case.trx"
)
Write-Host "dotnet $($testArgs -join ' ')"
& dotnet @testArgs
exit $LASTEXITCODE
