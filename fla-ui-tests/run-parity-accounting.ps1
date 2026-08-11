<#
.SYNOPSIS
    Chay luong ParityAccountingCorrection — xac minh 会計データ修正 (ChgAccData, lo 8).

.DESCRIPTION
    Runner RIENG cua luong nay. KHONG dung run-tests.ps1 va cung khong dung
    run-parity-savedata.ps1 — moi luong co tien de rieng, rui ro rieng va cong cu
    chan doan rieng.

    ⚠️ Luong nay GHI VAO SO TIEN: sua ACCDAT (会計 da chot) va PERSON_EXP
    (預り金残 / 未収金残). Nang hon ParitySaveData von chi ghi lai 処置行.
    Teardown khoi phuc theo anh chup dau lo, nhung do la duong lui chu khong phai
    giay phep — hay tro patient.patNo vao BENH NHAN TEST.

    TIEN DE khong dung duoc tu test:
      - Benh nhan da 窓口精算 xong ngay test (co dong ACCDAT)
      - 会計設定.tre_acc_link = 1
    Thieu thi testcase tu Ignore kem ly do, khong do mo ho.

    PHAI chay tren Windows, trong phien dang nhap CO MAN HINH THAT.
    Dung dung chuot/ban phim trong luc chay.

.PARAMETER Diagnostics
    Chay cong cu chan doan: bam F8 va do TOAN BO chuoi hop thoai gap phai
    (noi dung + nut), khong tra loi hop thoai dich. Chay cai nay truoc neu
    chuoi F8 tren may ban khac voi gia dinh.

.PARAMETER Case
    Loc theo ten testcase, vd "Tc8_2".

.EXAMPLE
    .\run-parity-accounting.ps1
    .\run-parity-accounting.ps1 -Case Tc8_2
    .\run-parity-accounting.ps1 -StepMs 1200
    .\run-parity-accounting.ps1 -Diagnostics
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

$ns = "OchaCom.FlaUiTests.Tests.ParityAccountingCorrection"

if ($Diagnostics) {
    $filter = "FullyQualifiedName~$ns.AccountingFlowDiagnosticsTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~$ns.ChgAccDataTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=parity-accounting.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

Write-Host ""
Write-Host "=== Gui lai HAI thu nay ===" -ForegroundColor Yellow
Write-Host "1. C:\OCHACOM_Logs\investigation.log   (findstr SONTEST1)  - log tu BEN TRONG WinForm"
Write-Host "   Luong nay quan tam cac dong [LO8] va [ISSUE-1]."
Write-Host "2. $artifacts   - nhat ky tung buoc + anh man hinh phia test"

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
