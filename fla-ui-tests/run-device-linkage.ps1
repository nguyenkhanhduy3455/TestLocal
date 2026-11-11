<#
.SYNOPSIS
    機器連携 (達人プラス / Kintone) khi F9 患者登録 — PROBE phia WinForm cho agent web
    (apps/agent KintoneConnector / TatsujinPlusCsvConnector).

.DESCRIPTION
    Moi lo mot luot (tran 15 phut, F7):
      -Case L1   達人プラス: {patNo}.csv da co -> co hoi ghi de khong?
      -Case L2   Kintone: upload.csv da co -> Q00100?
      -Case L3   Kintone: khong co ex.bat -> MsgBox gi?

    CAU HINH MAY: sua C:\NEW_SIM2000\Ocha.xml (PicLink=24, MedicalSupportLink=25, hai DirPath,
    tat DentMapPlus/Teraoka de khong ghi vao thu muc cua nguoi khac) TRUOC khi app mo,
    tra lai NGUYEN BYTE o finally.

    GHI DB: mot benh nhan test (PAT_NO >= 990000, clone tu 11515), xoa cuoi luot.

.EXAMPLE
    .\run-device-linkage.ps1 -Case L1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("L1", "L2", "L3")]
    [string]$Case,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"
$ochaXml = "C:\NEW_SIM2000\Ocha.xml"
$root = "C:\TCG\TestLocal\winform-link"
$backup = Join-Path $root ("Ocha.xml.bak-" + (Get-Date -Format "yyyyMMdd-HHmmss"))

New-Item -ItemType Directory -Force $root | Out-Null
foreach ($p in Get-Process MENU -ErrorAction SilentlyContinue) { $p.Kill() }
Copy-Item $ochaXml $backup -Force
Write-Host "Ocha.xml backup: $backup" -ForegroundColor Yellow

function Set-Node([xml]$x, [string]$parent, [string]$name, [string]$value) {
    $p = $x.XmlData.SelectSingleNode($parent)
    if ($null -eq $p) { $p = $x.XmlData.AppendChild($x.CreateElement($parent)) }
    $n = $p.SelectSingleNode($name)
    if ($null -eq $n) { $n = $p.AppendChild($x.CreateElement($name)) }
    $n.InnerText = $value
}

$exit = 1
try {
    [xml]$x = [IO.File]::ReadAllText($ochaXml, [Text.Encoding]::UTF8)
    Set-Node $x "InpInfo" "PicLink" "24"
    Set-Node $x "InpInfo" "MedicalSupportLink" "25"
    Set-Node $x "NeoInfo" "DirPath" "$root\tatsujin"
    Set-Node $x "DentalXInfo" "DirPath" "$root\kintone"
    $x.XmlData.DentMapPlusPath = ""
    $x.XmlData.TeraokaAdjustmentPath = ""
    $x.Save($ochaXml)
    Write-Host "Ocha.xml: PicLink=24 MedicalSupportLink=25, DentMapPlus/Teraoka tat" -ForegroundColor Cyan

    $env:OCHA_TEST_PATIENT_ALLOW_SEED = "1"
    $env:OCHA_TEST_PATIENT_TEMPLATE = "11515"
    $env:OCHA_KILL_ON_FAIL = "0"
    $env:OCHA_LINK_ROOT = $root

    $ns = "OchaCom.FlaUiTests.Tests.DeviceLinkage"
    $testArgs = @(
        "test", $project,
        "-c", $Configuration,
        "--filter", "FullyQualifiedName~$ns&FullyQualifiedName~$Case",
        "--logger", "console;verbosity=detailed",
        "--logger", "trx;LogFileName=device-linkage.trx"
    )
    Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
    & dotnet @testArgs
    $exit = $LASTEXITCODE
}
finally {
    foreach ($p in Get-Process MENU -ErrorAction SilentlyContinue) { $p.Kill() }
    Start-Sleep -Seconds 2
    Copy-Item $backup $ochaXml -Force
    $same = (Get-FileHash $backup).Hash -eq (Get-FileHash $ochaXml).Hash
    Write-Host "Ocha.xml da tra lai nguyen byte: $same" -ForegroundColor Yellow
}

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "device-linkage.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    $kq = Join-Path $PSScriptRoot "device-linkage-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host "Da loc cac dong KQ vao: $kq" -ForegroundColor Green
}
exit $exit
