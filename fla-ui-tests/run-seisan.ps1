<#
.SYNOPSIS
    窓口精算 (SEISAN, frm204001..204009) — do WinForm de doi chieu ban web.

.DESCRIPTION
    G0 (-Diagnostics): PROBE, khong assert. Di qua 8/9 form cua SEISAN, do ra cho
    moi trang thai mot bang control (.controls.tsv), cay UIA (.uia.txt) va anh.

    GHI DB: dung MOT benh nhan test (PAT_NO >= 990000) + 2 dong UNPAID cho no;
    SeededPatientTestBase xoa sach cuoi luot. Probe KHONG bam F9 tren frm204002
    va KHONG gui ESC/End (= 登録 that, frm204002.cs:1102).

.PARAMETER Diagnostics
    Chay probe G0 (SeisanProbeTests).

.PARAMETER TrtDate
    Ngay cua dong UNPAID seed (yyyy-MM-dd). De trong = patient.trtDate.

.EXAMPLE
    .\run-seisan.ps1 -Diagnostics
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [string]$TrtDate = "",
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($TrtDate -ne "") { $env:OCHA_TRT_DT = $TrtDate }

# Benh nhan test rieng cho luong nay - khong bam vao patient.patNo co san.
$env:OCHA_TEST_PATIENT_ALLOW_SEED = "1"
# Probe chay nhieu testcase noi tiep tren mot phien app; giet app o testcase do
# dau tien thi moi testcase sau do tren app da chet.
$env:OCHA_KILL_ON_FAIL = "0"

$ns = "OchaCom.FlaUiTests.Tests.Seisan"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~SeisanProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName!~Probe"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=seisan.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
Write-Host "GHI DB: benh nhan test 990000+ va UNPAID cua no (xoa cuoi luot)." -ForegroundColor Yellow

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "seisan.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console hong tieng Nhat (F9) - .trx la UTF-8 chuan => loc tu do.
    $kq = Join-Path $PSScriptRoot "seisan-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc cac dong KQ vao: $kq" -ForegroundColor Green
}

Write-Host "Bang control + cay UIA: $artifacts\screenshots\Seisan_uia" -ForegroundColor Green
exit $exit
