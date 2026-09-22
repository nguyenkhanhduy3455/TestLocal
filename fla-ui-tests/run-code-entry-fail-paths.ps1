# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF) — dung xoa BOM.
<#
.SYNOPSIS
    Hai nhanh THAT BAI cua GetTrtmasCod — o 点 giu so hay bi xoa trang?

.DESCRIPTION
    Caller xu ly ret == false bang: grdRegi.EndEdit(); hFG1.CurrentCell.Value = "";
    (frm203002.cs:5605-5607). Hai nhanh chua sua cua §B2:

      ① ma 50 (笑気/IS) — modMain.cs:542-552 mo frm203016 roi return
         functionReturnValue ma CHUA BAO GIO gan => luon false => caller luon xoa.
         Nhung frm203016 o che do _flg50 lam AddRow() -> ghi 点 -> DOI con tro XUONG
         (frm203016.cs:831-884), nen luc caller xoa thi CurrentCell da khong con la
         o dialog vua ghi. TCF_20 do xem o nao cuoi cung bi trong.

      ② huy 処置選択 — modMain.cs:688-690 kiem hFG1[6] (TRT_CD) cua dong dang dung:
           dong DA CO 処置 -> khac rong -> ret TRUE  -> KHONG xoa (giu so cu)
           dong TRONG      -> rong      -> ret FALSE -> XOA
         TCF_10 / TCF_11 la CAP: cung thao tac, khac nhau o chо dong da co 処置 chua.

    CHI DOC: khong seed, khong bam F9 登録.

.EXAMPLE
    .\run-code-entry-fail-paths.ps1 -Case TCF_10   # huy picker, dong DA CO 処置
    .\run-code-entry-fail-paths.ps1 -Case TCF_11   # huy picker, dong TRONG
    .\run-code-entry-fail-paths.ps1 -Case TCF_20   # ma 50 (IS), IS_AUTO_FLG = 1
    .\run-code-entry-fail-paths.ps1 -IsAutoOff     # ma 50 voi IS_AUTO_FLG = 0
                                                   #   can codeEntryFail.allowConfigChange = true
                                                   #   DOI CAU HINH PHONG KHAM roi tra lai
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [switch]$IsAutoOff,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$ns = if ($IsAutoOff) { "OchaCom.FlaUiTests.Tests.CodeEntryFailPaths.IsAutoOffTests" }
      else              { "OchaCom.FlaUiTests.Tests.CodeEntryFailPaths.CodeEntryFailTests" }

$filter = if ($Case -ne "") { "FullyQualifiedName~$ns&FullyQualifiedName~$Case" }
          else              { "FullyQualifiedName~$ns" }

$testArgs = @(
    "test", $project, "-c", $Configuration, "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=code-entry-fail-paths.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
& dotnet @testArgs
$exit = $LASTEXITCODE

Write-Host ""
Write-Host "Doc TestResults\code-entry-fail-paths.trx (UTF-8) — log console MAT dau tieng Nhat." -ForegroundColor Yellow
exit $exit
