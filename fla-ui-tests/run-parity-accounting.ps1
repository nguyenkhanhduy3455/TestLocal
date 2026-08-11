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

    TIEN DE (modAcc.cs:598 — hai dieu kien de vao duoc nhanh 会計データ修正):
      - Ngay test co dong ACCDAT 医療保険 => TEST TU SEED, teardown tu xoa
      - accconfig.tre_acc_link = 1        => TEST TU BAT, nhung cai nay chi
        duoc doc LUC APP KHOI DONG, nen phai DONG WinForm roi chay lai.
    Thieu thi testcase tu Ignore kem ly do, khong do mo ho.

    PHAI chay tren Windows, trong phien dang nhap CO MAN HINH THAT.
    Dung dung chuot/ban phim trong luc chay.

.PARAMETER Diagnostics
    Chay cong cu chan doan: bam F8 va do TOAN BO chuoi hop thoai gap phai
    (noi dung + nut), khong tra loi hop thoai dich. Chay cai nay truoc neu
    chuoi F8 tren may ban khac voi gia dinh.

    No dung CUNG tien de voi testcase that (nen cung can parity.allowSave, va
    tu xoa dong 会計 da seed khi xong). Ban dau no khong dung gi ca — nghe thi
    "trung lap" nhung hoa ra la hong: no khao sat nhanh F trong khi testcase
    chay nhanh G, moi luat rut ra deu lech dia chi.

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
