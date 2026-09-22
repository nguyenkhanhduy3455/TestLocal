# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF) — dung xoa BOM.
<#
.SYNOPSIS
    Ma 999 (未装着) va hop thoai E00100 — §B cua fla-ui-todo-inp-legacy-sync-20260921.md

.DESCRIPTION
    E00100 can HAI dieu kien, khong phai mot (modMain.cs:1800-1830):
      (1) quet luoi hFG1 khong thay 印象 240/247/325-5/325-8/530-2
      (2) VA getInpTrnImpDt cung khong tim ra ngay nao (CA lich su, toi cuoi thang,
          KHONG loc DEL_FLG)
    Ghi chu goc §B1 chi noi toi buoc (1). Mot benh nhan khong co 印象 tren luoi VAN
    co the khong ra E00100 neu DB con dong cu.

    A. MisoutyakuMasterTests (TCM_0..TCM_2) — CHI HOI DB, vai giay, khong mo app.
       CHAY TRUOC.
    B. MisoutyakuUiTests     (TCM_10)       — SO DO tren giao dien.

    CHI DOC: khong seed, khong bam F9 登録. O 点 bi app xoa trang chi nam trong luoi
    dang mo, mat khi kill MENU.exe.

    Benh nhan: can CHUA TUNG co 印象 toi cuoi thang (vd 4 / 9 / 3948 tren SIM2000
    cong 1434). Benh nhan 14788 co 印象 tu 2023 — dung lam DOI CHUNG (TCM_2).

.EXAMPLE
    .\run-misoutyaku-e00100.ps1              # 3 ca DB, khong mo app
    .\run-misoutyaku-e00100.ps1 -Ui          # ca do tren giao dien
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [switch]$Ui,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

$ns = "OchaCom.FlaUiTests.Tests.MisoutyakuE00100"
$fixture = if ($Ui) { "MisoutyakuUiTests" } else { "MisoutyakuMasterTests" }

$filter = if ($Case -ne "") { "FullyQualifiedName~$ns.$fixture&FullyQualifiedName~$Case" }
          else              { "FullyQualifiedName~$ns.$fixture" }

$testArgs = @(
    "test", $project, "-c", $Configuration, "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=misoutyaku-e00100.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

Write-Host ""
Write-Host "Doc ket qua o TestResults\misoutyaku-e00100.trx (UTF-8) — log console MAT dau tieng Nhat." -ForegroundColor Yellow
exit $exit
