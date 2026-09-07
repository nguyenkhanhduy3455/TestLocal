<#
.SYNOPSIS
    frm203012.btnF1_Click — chen 省略表示 部位 vao o テキスト cua カルテ記載選択.
    Do xem WinForm dat con tro o dau sau khi chen, va hau qua len CHUOI DAU RA.

.DESCRIPTION
    Nua WinForm cua
    web-tenant-tests/tests/dialogs-selection/bui-caret-newline-branch.spec.ts (bao cao #3b).

    Phim -> ham WinForm:
      F6 コメント (frm203002)   -> frm203011  luoi nut group          (frm203002.cs:4716)
      click nut group           -> frm203012  luoi comment + txtValue (frm203011.cs:249)
      F1 部位   (frm203012)     -> frm902003 部位選択 -> btnF1_Click   (frm203012.cs:187-215)

    ─── Cai dang do ───────────────────────────────────────────────────────────
    btnF1_Click co HAI nhanh chen nhung CHUNG mot dong tinh con tro:

        int idx = txtValue.SelectionStart;
        if (idx == txtValue.Text.Length - 2 && msg.Substring(idx, 2) == NewLine)
            msg = msg.Substring(0, idx + 2) + strBui1 + msg.Substring(idx + 2);   // +2
        else
            msg = msg.Substring(0, idx) + strBui1 + msg.Substring(idx);
        txtValue.SelectionStart = idx + strBui1.Length;                            // KHONG bu 2

    Nhanh tren doi DIEM CHEN di 2 ky tu (CRLF) ma dong con tro khong cong bu.
    SUY RA: con tro lui dung 2 ky tu, nam GIUA cum glyph 部位. Nhung do la SUY RA —
    ca hai ky vong trong spec Playwright deu do TypeScript dung tu cong thuc doc
    trong C#, chua do lan nao tren app that. Luot chay nay do.

    Ket qua ra duoi dang "khop cong thuc nao", khong phai "xanh/do":
      === KQ-VERDICT === TC-4 …: WINFORM   => khac biet la THAT (khac biet OUTPUT)
                                               => co can cu cho de xuat A (port bug sang web)
      === KQ-VERDICT === TC-4 …: WEB       => WinForm giong web => #3b sai tien de, KHONG port
      === KQ-VERDICT === TC-4 …: KHONG KHOP => mo hinh suy luan sai, chua port gi ca

    ─── Vi sao KHONG ghi DB ───────────────────────────────────────────────────
    Vi bo test TRANH DUNG bon phim. Tat ca deu dan toi fixProc -> fixCmt2() cap nhat
    mst_cmt2.use_cnt roi dong form:

        F9      formBase_KeyDown -> btnF9_Click -> fixProc   frm203012.cs:164-166
        End     nhu tren  (KHONG phai "ve cuoi dong")        :167-169
        Escape  nhu tren  (KHONG phai "huy")                 :170-172
        Enter   txtValue_KeyDown -> fixProc (khi het dau *)  :339-342

    Ba phim dau do formBase_KeyDown bat o tang FORM (KeyPreview=true) nen an BAT KE
    control nao dang giu tieu diem, va switch khong nhin phim bo tro => Ctrl+End cung
    la 確定. Vi vay:
      · dung trang thai bang ValuePattern.SetValue  (khong sinh phim nao)
      · doi con tro bang Ctrl+Home + mui ten        (khong bao gio End)
      · dong man bang F10 戻る

.PARAMETER Diagnostics
    Chay fixture PROBE ([Explicit]): do, KHONG assert, khong bao gio nem. 11 cau hoi,
    dap an o cac dong "=== KQ-n ===", runner loc san ra insert-bui-into-karte-cmt-KQ.txt.

    CHAY CAI NAY TRUOC neu chua ai do luong nay tren may hien tai.

.PARAMETER AllowConfirm
    Bat karteCmt.allowConfirm => probe do them cau hoi KQ-11: bam Enter TRONG o テキスト
    thi chuyen gi xay ra.

    ⚠️ CO THE GHI DB. AcceptButton = btnDummy chen xuong dong (frm203012.cs:369-377,
    :399), con txtValue_KeyDown goi fixProc = 確定 + ghi mst_cmt2.use_cnt (:339-342).
    Cai nao thang phu thuoc AcceptsReturn cua CustomTextBox va thu tu dialog-key cua
    WinForms — doc source khong ket luan duoc, nen no nam sau co rieng.

    Cac testcase assert KHONG dung toi co nay.

.PARAMETER GroupNo
    Nut group thu may tren frm203011 (1..30). Mac dinh lay karteCmt.groupNo.
    Nut vuot qua so dong mst_cmt2_grp bi Visible=false nen KHONG co trong cay UIA —
    khong thay nut thi doi so nay chu dung sua code.

.PARAMETER Case
    Loc theo ten testcase, vd "Tc4".

.PARAMETER TrtDate
    Ngay mo man hinh (yyyy-MM-dd). De trong thi dung patient.trtDate.
    Ngay do phai CO SAN dong 処置 trong luoi: F6 doc grdRegi.CurrentCellAddress.Y nen
    luoi rong thi khong dat duoc con tro len dong nao.

.EXAMPLE
    .\run-insert-bui-into-karte-cmt.ps1 -Diagnostics
    .\run-insert-bui-into-karte-cmt.ps1
    .\run-insert-bui-into-karte-cmt.ps1 -Case Tc4
    .\run-insert-bui-into-karte-cmt.ps1 -Diagnostics -AllowConfirm
#>
[CmdletBinding()]
param(
    [string]$Case = "",
    [int]$StepMs = -1,
    [int]$GroupNo = 0,
    [string]$TrtDate = "",
    [switch]$AllowConfirm,
    [switch]$Diagnostics,
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj"

if ($StepMs -ge 0) { $env:OCHA_STEP_MS = "$StepMs" }
if ($TrtDate -ne "") { $env:OCHA_TRT_DT = $TrtDate }
if ($GroupNo -gt 0) { $env:OCHA_KARTE_CMT_GROUP_NO = "$GroupNo" }

# Fixture assert co 6 testcase NOI TIEP tren cung mot phien app va cung mot cap dialog.
# killOnFail giet app ngay o TearDown cua testcase do dau tien, nen moi testcase sau do
# chay tren app DA CHET va do voi ly do gia. Da vap that 2026-09-04 o luong PerioKensaOrder.
$env:OCHA_KILL_ON_FAIL = "0"

# TAT HAN khi khong -AllowConfirm: de co bat sot tu lan chay truoc thi probe se bam Enter
# trong o テキスト, va do la duong DUY NHAT cua luong nay cham vao mst_cmt2.use_cnt.
$env:OCHA_KARTE_CMT_ALLOW_CONFIRM = if ($AllowConfirm) { "1" } else { "0" }

$ns = "OchaCom.FlaUiTests.Tests.KarteCmtBuiCaret"

if ($Diagnostics) {
    # Fixture PROBE mang [Explicit] nen luot chay du khong goi toi; loc dich danh thi chay.
    $filter = "FullyQualifiedName~KarteCmtBuiCaretProbeTests"
} elseif ($Case -ne "") {
    $filter = "FullyQualifiedName~$ns&FullyQualifiedName~$Case"
} else {
    $filter = "FullyQualifiedName~KarteCmtBuiCaretTests"
}

$testArgs = @(
    "test", $project,
    "-c", $Configuration,
    "--filter", $filter,
    "--logger", "console;verbosity=detailed",
    "--logger", "trx;LogFileName=insert-bui-into-karte-cmt.trx"
)

Write-Host "dotnet $($testArgs -join ' ')" -ForegroundColor Cyan
if ($AllowConfirm) {
    Write-Host "CO THE GHI DB: -AllowConfirm cho probe bam Enter trong txtValue; neu Enter la 確定 thi fixCmt2 ghi mst_cmt2.use_cnt." -ForegroundColor Yellow
} else {
    Write-Host "CHI DOC: khong bam F9 / End / Escape / Enter o frm203012 — bon phim do deu la fixProc -> fixCmt2." -ForegroundColor Green
}

& dotnet @testArgs
$exit = $LASTEXITCODE

$artifacts = Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests\bin\$Configuration\net8.0-windows\artifacts"

$trx = Get-ChildItem -Path (Join-Path $PSScriptRoot "src\OchaCom.FlaUiTests") -Filter "insert-bui-into-karte-cmt.trx" -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($trx) {
    # Log console bi giai ma theo console codepage nen tieng Nhat thanh rac va KHONG khoi
    # phuc duoc (PROBE-GUIDELINE 3.7). .trx la UTF-8 chuan => loc tu do.
    #
    # Rieng luong nay con mot ly do THU HAI phai doc tu .trx: 省略表示 部位 la ky tu EUDC
    # (U+E000..U+F8FF). In thang ra console thi KHONG THAY GI. Vi vay moi chuoi deu duoc
    # escape san thanh \uXXXX (Txt.Vis) truoc khi in — doi chieu voi ban web THEO MA.
    $kq = Join-Path $PSScriptRoot "insert-bui-into-karte-cmt-KQ.txt"
    Select-String -Path $trx.FullName -Pattern "=== KQ-" |
        ForEach-Object { $_.Line.Trim() } | Set-Content -Path $kq -Encoding UTF8
    Write-Host ""
    Write-Host "Da loc san cac dong KQ vao: $kq" -ForegroundColor Green

    $verdict = Select-String -Path $trx.FullName -Pattern "=== KQ-VERDICT ===" | Select-Object -Last 4
    if ($verdict) {
        Write-Host ""
        Write-Host "=== KET LUAN ===" -ForegroundColor Yellow
        $verdict | ForEach-Object { Write-Host ("   " + $_.Line.Trim()) }
    }
}

Write-Host ""
Write-Host "=== Sau khi chay, gui lai ===" -ForegroundColor Yellow
Write-Host "1. TAT CA cac dong chua '=== KQ-' (hoac file insert-bui-into-karte-cmt-KQ.txt)"
Write-Host "2. $artifacts\screenshots   - nhat ky tung buoc + anh man hinh"
Write-Host ""
Write-Host "3. VA MOT VIEC PHAI LAM TAY: so hai dong '省略表示' o TC-2 voi dong '[#3b] 省略表示'"
Write-Host "   ma spec Playwright in ra. Hai ben KHAC chuoi => khong so duoc ket qua voi nhau,"
Write-Host "   va cau hoi 'co port bug khong' chua dat ra duoc."

$shots = Join-Path $artifacts "screenshots"
if (Test-Path $shots) {
    Write-Host ""
    Write-Host "Thu muc anh moi nhat:" -ForegroundColor Green
    Get-ChildItem $shots -Directory | Sort-Object LastWriteTime -Descending |
        Select-Object -First 5 Name, LastWriteTime | Format-Table -AutoSize
}

exit $exit
