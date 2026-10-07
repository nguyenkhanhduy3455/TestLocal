# -*- coding: utf-8 -*-
# File nay LUU KEM BOM UTF-8 (EF BB BF) — xem run-move-perio-exam-cursor.ps1.
<#
.SYNOPSIS
    Probe PageUp / PageDown trên lưới 処置 (grdRegi) — TreatmentGridPageKeyProbeTests.
    KHÔNG ghi DB. Bệnh nhân / ngày truyền vào vì testsettings.local.json của máy này
    trỏ bệnh nhân 10 (8 dòng 処置 — không đủ một trang để đo).
.EXAMPLE
    Set-Content logs\command.txt "run-page-key-probe.ps1 -PatNo 3948 -TrtDt 2026-06-28"
    schtasks /run /tn "FlaUI-Tests-Run"
#>
param(
    [string]$PatNo = "3948",
    [string]$TrtDt = "2026-06-28"
)
$env:OCHA_PAT_NO = $PatNo
$env:OCHA_TRT_DT = $TrtDt
& (Join-Path $PSScriptRoot 'run-all-tests.ps1') -Filter 'TreatmentGridPageKeyProbeTests'
exit $LASTEXITCODE
