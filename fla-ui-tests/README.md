# fla-ui-tests — test tự động cho app WinForm お茶コン

Bộ test UI cho **app desktop** (`src/OCHACOM`, WinForms .NET Framework 3.5), viết bằng
**FlaUI + NUnit**, project chạy trên **.NET 8 (`net8.0-windows`)**.

Anh em song sinh với `../web-tenant-tests` (Playwright, cho bản web port). Cùng một yêu
cầu nghiệp vụ, khác chỗ đo: bên kia đo **bản web**, bên này đo **chính WinForm** — tức là
đo cái "đáp án" mà bản web phải khớp.

Ba testcase đầu tiên là bản chuyển của ba testcase đầu trong
`../web-tenant-tests/tests/kobetu-sidepanel-score.spec.ts`.

---

## 1. Chạy ở đâu

| | |
|---|---|
| Hệ điều hành | **Windows** (UIAutomation là API của Windows) |
| SDK | .NET 8 SDK trở lên |
| Phiên đăng nhập | Có **màn hình thật đang mở**. Máy khoá màn hình / RDP bị thu nhỏ ⇒ phím và chuột rơi vào hư không |
| Trong lúc chạy | **Không đụng chuột/bàn phím**. Test gõ vào cửa sổ đang focus |

Trên macOS/Linux chỉ **biên dịch** được để soát lỗi cú pháp, không chạy được:

```bash
dotnet build src/OchaCom.FlaUiTests/OchaCom.FlaUiTests.csproj
```

## 2. Điều kiện của app (bộ test không tự dựng được)

1. **`C:\NEW_SIM2000\Ocha.xml`** tồn tại, thẻ `<DbConnectString>` trỏ tới SQL Server chạy
   được. `XmlControl` đọc file này trong static ctor — hỏng là app chết ngay từ E88888
   (`COMMON/Lib/XmlControl.cs:235`).
2. **SQL Server sống**, có license hợp lệ, có ít nhất một bác sĩ trong `IINMST2`, và có
   bệnh nhân `patient.patNo`. Thiếu thì màn chọn bệnh nhân dừng ở E00005 / E00027.
3. **`MENU.exe` đã build** (`src\OCHACOM\MENU\bin\x86\Debug\MENU.exe`). App **không nhận
   tham số dòng lệnh** (`MENU/Program.cs:17`) nên không có đường tắt: test phải đi
   メインメニュー → 診療入力（患者選択） → 診療入力 đúng như người dùng.

## 3. Cấu hình

Thứ tự ưu tiên **tăng dần**:

```
testsettings.json  →  testsettings.local.json  →  biến môi trường OCHA_*
```

Hai file JSON được **deep-merge**, file local chỉ cần ghi khoá muốn đè:

```bash
cd src\OchaCom.FlaUiTests
copy testsettings.local.json.example testsettings.local.json
```

Khoá hay dùng:

| Khoá | Env | Ý nghĩa |
|---|---|---|
| `app.exePath` | `OCHA_EXE` | Đường dẫn `MENU.exe` |
| `app.attachIfRunning` | | App đang mở sẵn thì bám vào, không mở thêm |
| `app.closeOnFinish` | `OCHA_CLOSE_ON_FINISH` | Mặc định **false** — để còn soi màn hình khi đỏ |
| `patient.patNo` | `OCHA_PAT_NO` | Bệnh nhân đem test |
| `patient.trtDate` | `OCHA_TRT_DT` | `yyyy-MM-dd`, rỗng = hôm nay |
| `patient.openMode` | | `update` = F8 閲覧/変更 (ít hộp thoại, mặc định) · `insert` = Enter/F9 初再診入力 |
| `db.connectionString` | `OCHA_DB` | SQL Server của app, **chỉ đọc** |
| `run.stepMs` | `OCHA_STEP_MS` | Nhịp quan sát giữa các thao tác, để ngồi nhìn |
| `run.stopOnFirstFailure` | | Bắt chước `mode:'serial'` của Playwright |
| `locators.*` | | AutomationId từng control — sửa ở đây khi locator lệch, **không sửa code** |

## 4. Chạy

```powershell
.\run-all-tests.ps1                    # cả bộ
.\run-all-tests.ps1 -Filter Tc1        # một testcase
.\run-all-tests.ps1 -StepMs 1500       # chậm lại để nhìn
.\run-all-tests.ps1 -Diagnostics       # đổ cây UIA (xem mục 7)
```

Hoặc trực tiếp:

```powershell
dotnet test src\OchaCom.FlaUiTests\OchaCom.FlaUiTests.csproj --logger "console;verbosity=detailed"
```

## 5. Ảnh màn hình

Sau **mỗi** testcase (cả xanh lẫn đỏ) framework chụp **toàn màn hình** — mọi màn nếu máy
nhiều màn — và đính vào báo cáo NUnit:

```
bin\Debug\net8.0-windows\artifacts\screenshots\01_Tc1_ThreeScoreColumns_Passed_143052.png
```

Chụp cả màn hình chứ không chỉ cửa sổ app là có lý do: hộp thoại modal, tooltip, IME của
WinForm là **cửa sổ top-level riêng**, nằm ngoài khung `frm203002`. Chụp mỗi cửa sổ app thì
đúng lúc cần nhìn nhất — cái hộp thoại đang chặn thao tác — lại không có trong ảnh.

Testcase **đỏ** còn được đổ thêm **cây UIA** ra `*.uia.txt` cạnh ảnh. Bật/tắt ở
`run.captureOnPass` / `run.captureOnFail`.

## 6. Cấu trúc

```
src/OchaCom.FlaUiTests/
├── Infrastructure/
│   ├── TestSettings.cs           cấu hình 3 tầng (json → json.local → env)
│   ├── Waits.cs                  chờ có điều kiện; KHÔNG Thread.Sleep phỏng đoán
│   ├── Uia.cs                    tìm/đọc/ghi phần tử + đổ cây UIA
│   ├── WinFormsGrid.cs           đọc DataGridView qua cầu MSAA→UIA
│   ├── Dialogs.cs                MessageBox (#32770): tìm, đọc chữ, bấm nút
│   ├── NuisanceDialogWatcher.cs  luồng nền tự bấm 「いいえ」 cho hộp thoại nhiễu
│   ├── ScreenCapture.cs          chụp toàn màn hình + DPI awareness
│   ├── PixelProbe.cs             đọc MÀU NỀN control bằng pixel (UIA không phơi BackColor)
│   ├── Vk.cs                     mã Virtual-Key gửi qua Uia.SendKey
│   ├── TestTrace.cs              nhật ký + ảnh TỪNG BƯỚC (không chỉ 1 ảnh cuối test)
│   └── UiTestBase.cs             1 phiên app cho cả fixture, chụp ảnh ở TearDown
├── App/
│   ├── OchaApp.cs                mở / bám tiến trình, tìm cửa sổ theo AutomationId
│   └── AppNavigator.cs           メインメニュー → 患者選択 → 診療入力
├── Screens/
│   ├── TreatmentEntryScreen.cs   frm203002
│   ├── KobetuTab.cs              tab 個別: 3 ô 検索, nút, lưới hfgKobetu
│   └── RegiGrid.cs               lưới đăng ký grdRegi (hFG1)
├── Data/
│   ├── OchaDb.cs                 truy vấn CHỈ ĐỌC vào SQL Server (SIM2000)
│   └── TensuOracle.cs            chép lại nhánh getTensu mà test cần
└── Tests/
    ├── KobetuSidePanelScoreTests.cs   TC-1 … TC-3
    ├── UiaTreeDumpTests.cs            công cụ chẩn đoán locator ([Explicit])
    ├── TreatmentGrid/                     thao tác trên lưới 処置 — xem mục 8b
    │   ├── README.md                      bảng tương ứng với spec Playwright
    │   ├── TreatmentGridOps.cs            phần GHI vào grdRegi (click ô, gửi phím)
    │   ├── TreatmentGridBasicTests.cs     TC-1 … TC-7   (cơ bản)
    │   ├── TreatmentGridAdvancedTests.cs  TC-A1 … TC-A5 (luật theo linekbn)
    │   └── TreatmentGridProbeTests.cs     PROBE [Explicit] — dò hành vi, không assert
    ├── ParitySaveData/                ⚠️ luồng GHI DB, runner riêng — xem mục 8b
    │   ├── README.md                  đọc file này TRƯỚC khi chạy
    │   ├── Bug2dConcurrentSaveTests.cs
    │   ├── SaveFlow.cs                lái chuỗi hộp thoại F9
    │   ├── OchaDbParity.cs            truy vấn CÓ GHI (tách khỏi Data/OchaDb.cs)
    │   └── BuiDialogDiagnosticsTests.cs
    ├── TrnCheck/                   診療チェック — CẢ HAI cửa của COMMON/Lib/Check.cs
    │   ├── README.md                  bảng tương ứng spec + kết quả đo trên máy thật
    │   ├── TrnCheckFlow.cs            F3 → panel grdChek/lbChk · đọc-rồi-dẹp W00100
    │   ├── TrnCheckProbeTests.cs      PROBE 1 [Explicit] — 9 câu hỏi, không assert
    │   ├── TrnCheckProbe2Tests.cs     PROBE 2 [Explicit] — cây UIA panel + đường chèn
    │   └── TrnCheckSweepTests.cs      一括 F3: TC-BASE, TC-TOGGLE
    ├── PatientSelectAssign/           患者確定 chốt 担当医/衛生士 — xem mục 8b
    │   ├── README.md                      bảng tương ứng spec + 5 điểm lệch đã tìm ra
    │   ├── PatientSelectScreen.cs         screen object frm203001 (đầu tiên cho màn này)
    │   ├── PatientSelectFlow.cs           lái 患者確定, đọc kết cục, KHÔNG assert
    │   ├── PatientSelectAssignDb.cs       truy vấn CHỈ ĐỌC person/iinmst2/wait/TRNTRN
    │   ├── PatientSelectAssignProbeTests.cs PROBE [Explicit] — 10 câu hỏi
    │   └── PatientSelectAssignTests.cs    TC-MSG-1, TC-PAT-1, TC-DR-1..4, TC-ST-1, TC-ROW-1, TC-SEED-1
    ├── GuideSidePanel/                 tab 「ガイド」 + frm203017 — xem mục 8b
    │   ├── README.md                      bảng tương ứng spec + 3 điểm LỆCH đo được
    │   ├── GuideTabFlow.cs                 lái tab ガイド + dialog, KHÔNG assert
    │   ├── MsgBoxWin32.cs                  đọc/bấm MessageBox bằng Win32 thuần (không UIA)
    │   ├── GuideSidePanelProbeTests.cs     PROBE [Explicit] — 18 câu hỏi
    │   └── GuideSidePanelTests.cs          TC-G1 … TC-G15
    ├── MenInput/                      面入力 frm203035 — xem mục 8b
    │   ├── README.md                     bảng tương ứng spec + 2 điểm LỆCH + 4 cái bẫy
    │   ├── MenInputDb.cs                 CHỈ ĐỌC: INPCONFIG.MENINPUT_FLG + cột `men` của master
    │   ├── MenInputFlow.cs               gõ mã → 処置選択 → chốt 枝番; đọc cột 2 và cột 72
    │   ├── MenInputDialog.cs             frm203035: nhãn 5 mặt, phím 8/4/5/6/2, F9/F10/ESC
    │   ├── MenInputProbeTests.cs         PROBE [Explicit] — 12 câu hỏi, không assert
    │   └── MenInputTests.cs              TcM0 … TcM9
    ├── PerioKensaOrder/               検査順 pInpOpt[36] — xem mục 8b
    │   ├── README.md                  bảng tương ứng spec + 3 điểm KHÁC bản web + 4 cái bẫy
    │   ├── PerioExamDialog.cs         frm203028/29: tên ô, đọc con trỏ, F10 để đóng
    │   ├── PerioKensaOrderFlow.cs     đổi 検査順 · 部位 全顎 · F6 → frm203011 → F1/F2
    │   ├── PerioKensaTestBase.cs      đo nhánh đang chạy + khôi phục Ocha.xml
    │   ├── PerioKensaOrderProbeTests.cs PROBE [Explicit] — 9 câu hỏi, không assert
    │   └── PerioKensaOrderTests.cs    TcREAD, Tc1, Tc2, Tc4, Tc5 … Tc8
    └── InpP1Dialogs/                  ba dialog vừa port sang web — xem mục 8b
        ├── README.md                  bảng tương ứng với spec Playwright
        ├── InpP1MenuFlow.cs           F11 → 「９ オプション」 → mục con
        ├── StepEditDialog.cs          frm203050 Ｓｔｅｐ編集
        ├── CheckItemDialog.cs         frm203044 チェック項目設定
        ├── BrSampleFlow.cs            frm902003 部位選択 → frm203049 Ｂｒサンプル
        ├── InpP1Db.cs                 truy vấn CHỈ ĐỌC TRTSTATE / chkprm / CODMST
        └── *Tests.cs                  3 fixture + 1 fixture chẩn đoán ([Explicit])
```

> Một luồng có tiền đề riêng / rủi ro riêng thì để trong thư mục con của `Tests/` cùng
> với helper của chính nó, kèm README và runner riêng — thay vì rải vào `Screens/`,
> `Data/` rồi thêm một nhánh `-Filter` nữa vào `run-all-tests.ps1`. Đọc thư mục là biết
> luồng gồm những gì và chạy bằng cách nào.

### Vài quyết định đáng biết

**Một phiên app cho cả fixture.** `OneTimeSetUp` mở app + đi tới 診療入力 đúng một lần; mọi
testcase dùng chung cửa sổ đó — khởi động app mất hàng chục giây và chạm DB. Đổi lại, các
testcase **không độc lập**: mỗi testcase tự dọn 3 ô 検索 trước khi làm việc của mình, và
testcase đầu tiên đỏ sẽ làm mọi testcase sau bị `Ignore` (`run.stopOnFirstFailure`), y như
`mode: 'serial'` bên Playwright.

**Gõ phím chứ không `SetValue`.** `ValuePattern.SetValue` nhét thẳng giá trị vào control mà
không sinh `KeyDown`/`KeyPress` — trong khi logic của frm203002 treo đúng ở đó
(`txtKobeSearchCode_KeyDown` chuyển focus khi Enter, `CustomTextBox` lọc ký tự).

**Vì sao cần DB.** Ba cột điểm chỉ có nghĩa khi biết `score1/2/3` thật, và `getTensu` còn rẽ
theo `acc_unit`/`f1` — cả ba đều là **cột ẩn** của lưới, UI không đọc được
(`modKobetu.cs:96-131`). 処置 đem test **không hard-code**: hỏi thẳng bản master đang áp dụng
(bảng lấy từ `TRT_SEL`, đúng bảng app đọc) để tìm dòng có score1/2/3 **khác nhau đôi một** —
điều kiện cần để phân biệt được cột nào đang lấy nhầm cột nào. Không có DB thì TC-1/TC-2 tự
`Ignore` kèm lý do, TC-3 vẫn chạy.

**Không ghi gì vào DB.** Test không seed, không bấm **F9 登録**. Tiền đề 「ngày 訪問診療」 của
TC-2 dựng bằng chính giao diện: chọn 歯科訪問診療 (mã 333) ở tab 個別 làm
`ModCommon.pHoumon[ngày] = true` (`modKobetu.cs:337`). Đây là chỗ **khác** bản Playwright —
bên đó seed thẳng dòng 333 vào DB, vì bản web suy cờ này từ dữ liệu; còn ở WinForm cờ nằm
trong **bộ nhớ của phiên chạy**, ghi DB không tự bật nó lên.

## 7. Khi locator không khớp

Bộ test bám control theo **AutomationId** — với WinForms, cầu MSAA→UIA lấy nó từ
`Control.Name` (`hfgKobetu`, `txtKobeSearchCode`, `grdRegi`…). Nếu trên máy thật hoá ra
khác (bản Windows cũ, control tuỳ biến), test sẽ đỏ với thông báo *"không thấy control
AutomationId=…"*. Cách xử lý:

```powershell
.\run-all-tests.ps1 -Diagnostics
```

Nó mở app, đi tới 診療入力, rồi đổ cây UIA thật ra
`bin\Debug\net8.0-windows\artifacts\*.txt` (kèm AutomationId / Name / ControlType của từng
node, và giá trị + mô tả ô của lưới 個別). Đối chiếu xong thì **sửa mục `locators` trong
`testsettings.json`**, không phải sửa code.

Chỗ dễ lệch nhất là cách đọc ô `DataGridView`: giá trị nằm ở `LegacyIAccessible.Value`, còn
`Name` của ô là chuỗi mô tả có kèm **tên cột** (`WinFormsGrid.cs` dùng cả hai). Bản đổ ở
trên in ra cả hai để so.

## 8. Ba testcase hiện có

Nguồn: `../web-tenant-tests/tests/kobetu-sidepanel-score.spec.ts` (TC-1…TC-3).

| | Nội dung | Cần DB |
|---|---|---|
| **TC-1** | Cột 「一般」/「50/100」/「訪問」 phải là `score1`/`score2`/`score3` (`modKobetu.cs:203-207`). Header 「老人」 chỉ có trong Designer, đã bị `Columns.Clear()` xoá — cột giữa tên thật là 「50/100」 | ✔ |
| **TC-2** | Ngày 訪問診療: chọn dòng 個別 phải ghi điểm **`getTensu`** (score3), không phải score1 (`modKobetu.cs:265` → `CommonChk.cs:83`) | ✔ |
| **TC-3** | Ô ｺｰﾄﾞ chỉ ăn số nguyên: 「174-0」 ra **E00002** và **huỷ search** (`InputCheckKobe`, `frm203002.cs:2194`) | ✖ |

Về TC-3: comment ở `frm203002.cs:2054` nói ô ｺｰﾄﾞ tách 「101-2」 thành `TRT_CD`+`TRT_SB`, nhưng
`InputCheckKobe` chạy **trước** nên nhánh đó chưa bao giờ tới. Testcase chốt lại điều đó để
không ai "sửa" bằng cách mở lại nhánh tách dấu gạch ngang — đó là **thêm tính năng**, không
phải giữ nguyên hành vi.

## 8b. Các luồng có runner riêng

Một số luồng có tiền đề riêng, rủi ro riêng, hoặc công cụ chẩn đoán riêng — chúng nằm
trong thư mục con của `Tests/` và có script chạy riêng, KHÔNG đi qua `run-all-tests.ps1`.

Runner được **đặt tên theo HÀM WinForm mà nó lái**, không theo tên thư mục test —
đọc tên file là biết chạy nó thì cái gì trong app chạy theo.

| Chạy | Phím → hàm WinForm | Thư mục | Ghi DB? |
|---|---|---|---|
| `.\run-save-treatment-data.ps1` | F9 登録 → `modSave.SaveData` (処置データ登録) | `Tests/ParitySaveData/` | ⚠️ **CÓ** — `trn_trn` |
| `.\run-fix-accounting-data.ps1` | F8 会計 → `modAcc.ChgAccData` (会計データ修正) | `Tests/ParityAccountingCorrection/` | ⚠️ **CÓ** — `acc_dat` + `person_exp` (**sổ tiền**) |
| `.\run-fix-accounting-data.ps1 -Fixture ChgAccDataParityTests` | F8 会計 → cây quyết định `LetAccData2` (nút mặc định · `deleteTrtDtUnPaid`) | `Tests/ParityAccountingCorrection/` | ✖ trả lời いいえ nên không ghi sổ tiền |
| `.\run-inp-p1-dialog.ps1` | F11 →「９ オプション」→ Step / チェック項目設定 · 部位選択 → F9 Br例 | `Tests/InpP1Dialogs/` | ⚠️ chỉ khi `-AllowSave` — `TRTSTATE`, `chkprm` |
| `.\run-edit-treatment-rows.ps1` | Insert/Delete trên lưới 処置 → `AddRow` / `DeleteRow` (行追加・行削除) | `Tests/TreatmentGrid/` | ✖ không bấm F9 |
| `.\run-confirm-patient.ps1` | End/F9/Enter ở 患者選択 → `frm203001.defData` (患者確定) | `Tests/PatientSelectAssign/` | ✖ không bấm F9, không seed `wait` |
| `.\run-select-guide-treatment.ps1` | Click dòng ガイド → `hfgGuid1_CellDoubleClick` (ガイド処置選択 frm203017) | `Tests/GuideSidePanel/` | ✖ không bấm F9; 「リセット」 luôn trả lời Cancel |
| `.\run-bulk-change-dr.ps1` | Click nhãn 「Ｄｒ」 → `lblDrLabel_Click` (担当医 一括変更) | `Tests/TreatmentHeaderStaff/` | ✖ chỉ sửa lưới trong bộ nhớ |
| `.\run-input-tooth-surfaces.ps1` | Chốt 枝番 `men=1` ở 処置選択 → `frm203035.fixProc` (面入力) | `Tests/MenInput/` | ✖ đọc cột ẩn 72, không bấm F9 |
| `.\run-change-tooth-status.ps1` | chốt 処置 → `frm203016.SigaChg` · Delete → `DelExtRec` · Ｐ変更 → `Chk_PModeKesson` · F9 → `SigaChg_Save` (自歯状況変更・根数変更) | `Tests/SigaToothStatus/` | ⚠️ **CÓ** — `SIGA` + `KON`, và ghi **ngay lúc nhập** |
| `.\run-move-perio-exam-cursor.ps1` | Enter/←/→ trong 歯周基本・精密検査 → `getMoveIndex` / `getMoveIndexArrow`, rẽ theo 検査順 `pInpOpt[36]` | `Tests/PerioKensaOrder/` | ✖ không bấm F9; ⚠️ `-AllowSettingChange` GHI **`Ocha.xml` của MÁY** |
| `.\run-unpaid-raiin-cnt.ps1` | F8 会計 → `modAcc.LetAccData2` với 当日来院回数 (`hfgRaiinCnt` → `hFG1[71]` → `UNPAID.TRT_CNT`) | `Tests/UnpaidRaiinCnt/` | ⚠️ **CÓ** — seed `TRNTRN` (disp_no 9101-9103) + `UNPAID` của ngày test |
| `.\run-edit-treatment-rows.ps1 -Case Probe_Advanced` | PROBE — dò hành vi, KHÔNG assert | `Tests/TreatmentGrid/` | ✖ |

> Thêm luồng mới thì giữ đúng quy ước này: `run-<động từ>-<đối tượng>.ps1` mô tả việc
> mà WinForm làm, chứ không phải `run-<tên thư mục test>.ps1`. Tên cũ
> (`run-parity-savedata` / `run-parity-accounting`) chỉ nói "đây là test parity" —
> thứ mà mọi luồng ở đây đều là, nên không phân biệt được gì.

**ParitySaveData** xác minh các bug parity của `modSave.SaveData` trên WinForm thật. Nó
là luồng DUY NHẤT bấm F9 登録 của 診療入力 nên **ghi thật xuống DB** (F9 ghi lại toàn bộ
処置行 của tháng). Mặc định tắt; chưa bật `parity.allowSave` thì cả fixture tự bỏ qua
ngay, không tốn công mở app.

**ParityAccountingCorrection** xác minh 会計データ修正 (`ChgAccData`, lô 8). Nặng hơn:
nó sửa **sổ tiền** — 会計 đã chốt và số dư 預り金/未収金. Cần tiền đề mà test không tự
dựng được (ngày đã 窓口精算, `tre_acc_link = 1`).

Thư mục này có **hai** fixture, chọn bằng `-Fixture`. `ChgAccDataTests` (mặc định) đo
phép GHI — nó là cái sửa sổ tiền. `ChgAccDataParityTests` là nửa WinForm của
`../web-tenant-tests/tests/chg-acc-data-parity.spec.ts`, đo **tầng màn hình** và
**không** ghi sổ tiền: nó trả lời いいえ cho hộp 会計データ修正, mà `ChgAccData` chỉ ghi ở
nhánh はい (modAcc.cs:956). Đã chạy thật 2026-09-03: 4/4 khẳng định xanh, `TcCHG4`
`Ignore` vì dữ liệu (bệnh nhân test là 公費単独 nên hộp 差額 không mở được).

Nó đo được thứ trước nay chưa ai đo: **nút MẶC ĐỊNH** của từng hộp thoại. UIA không
phơi `MessageBoxDefaultButton` ra, nhưng Win32 giao CON TRỎ cho nút mặc định — đọc
`FocusedElement()` NGAY khi hộp thoại vừa mở (trước khi bấm) là ra. Đo được: 既存会計 →
`No` (Button2), 会計データ修正 → `Yes` (Button1). Hai hộp **ngược nhau có chủ ý**, và bản
web trước đây để はい cả ba ⇒ bấm Enter theo phản xạ là **thu tiền hai lần**.

> 🐛 Lượt chạy đầu của fixture mới đỏ vì một cái bẫy đáng nhớ: **F8 会計 chạy theo ngày
> của DÒNG CON TRỎ**, không theo ngày mở màn hình. Lưới bệnh nhân test nay có bốn ngày
> nên con trỏ rơi vào ngày chưa seed 会計 ⇒ rẽ nhánh F ⇒ ghi rác `UNPAID` vào một ngày mà
> teardown không biết tới. `ChgAccDataTests` cũng chưa đặt con trỏ — xem cảnh báo trong
> README của luồng, mục 5b.

**TreatmentGrid** đo **đáp án** cho bảy thao tác CƠ BẢN nhất trên lưới 処置 của
`frm203002` (`grdRegi` / `hFG1`): nhìn cột, chèn 処置 từ tab 個別, Enter, Tab, gõ số
vào ô 点, Insert 行追加, Delete 行削除. Nó KHÔNG bấm F9 nên **không ghi DB** và không
cần cờ gì — nhưng vẫn có runner riêng vì bảy testcase NỐI TIẾP nhau (TC-2 chèn dòng
mà TC-3…TC-6 đứng lên, TC-7 xoá dòng đó) và vì nó là nửa còn lại của một cặp parity:
bên kia là `../web-tenant-tests/tests/treatment-grid-basic.spec.ts`, cùng số hiệu
TC-1…TC-7. Bảng tương ứng nằm ở `Tests/TreatmentGrid/README.md` mục 4.

**InpP1Dialogs** đo **đáp án** cho spec Playwright của bản web
(`../web-tenant-tests/tests/step-edit-dialog.spec.ts` cho TC-STEP-*,
`../web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts` cho TC-CHK-* / TC-BR-*):
ba dialog vừa được port —
`frm203050`「Ｓｔｅｐ編集」, `frm203044`「チェック項目設定」, `frm203049`「Ｂｒサンプル」.
Mỗi testcase ghi rõ nó ứng với TC nào bên kia. Hai dialog đầu vào bằng **mục menu**
(`IDM_Step` / `IDM_ChkPrm`), locator khác hẳn nút `btnF*` của các luồng trên. Nhánh ghi
DB (`TRTSTATE` của một bệnh nhân, `chkprm` là cấu hình **toàn phòng khám**) nằm sau cờ
riêng `inpP1.allowSave` và tự trả lại giá trị cũ. Ｂｒサンプル không ghi gì.

> ⚠️ **Chưa chạy lần nào trên Windows.** Tên control mới chỉ đọc ra từ Designer. Chạy
> `.\run-inp-p1-dialog.ps1 -Diagnostics` **trước tiên** rồi mới chạy testcase — sai
> locator thì log trông y hệt "WinForm sai". Đáp án nằm ở các dòng `=== KQ-n ===`, runner
> lọc sẵn ra `inp-p1-dialog-KQ.txt`.
>
> Luồng này thay cho `StepsEdit` / `run-steps-edit.ps1` cũ — luồng đó chỉ mở `frm203050`
> rồi đọc cấu trúc, giờ là `StepEditTests.Tc1` trong đây.

**PatientSelectAssign** đo **đáp án** cho `frm203001.defData` — màn 診療入力（患者選択）
phải chốt được 担当医 / 衛生士 **trước khi** mở 処置入力, và từ chối mở khi không chốt
được (hai số đó bị đóng dấu lên mọi dòng lưu ở màn sau, `TRNTRN.dr_no` / `staff_no`).
Nó KHÔNG bấm F9 và KHÔNG seed bảng `wait` — khác bản Playwright, nơi `ensureWaitRow`
chèn rồi xoá một dòng 受付; DB bên này là DB thật của phòng khám nên nhánh nào cần dòng
受付 mà máy không có sẵn thì testcase tự `Ignore`.

Đây là luồng ĐẦU TIÊN đứng lại ở `frm203001` thay vì đi xuyên qua nó, nên nó thêm hai
thứ dùng chung: `AppNavigator.OpenPatientSelect` và
`UiTestBase.NavigatesToTreatmentEntry` (+ `UiaDumpRoot`).

Đọc source đã tìm ra **năm điểm lệch** với bản web — trong đó `DispEiseisi` bị bind
nhầm sang một cột DB khác hẳn, và nhánh 受付 đọc *sự tồn tại của cột* chứ không phải
giá trị. Chi tiết ở `Tests/PatientSelectAssign/README.md` mục 4.

> ⚠️ **Chưa chạy lần nào trên Windows.** Chạy `.\run-confirm-patient.ps1 -Diagnostics`
> **trước tiên**; đáp án nằm ở các dòng `=== KQ-n ===`, runner lọc sẵn ra
> `confirm-patient-KQ.txt`.

**GuideSidePanel** đo **đáp án** cho tab 「ガイド」 của `frm203002` và dialog
`frm203017`「ガイド処置選択」 — nửa WinForm của
`../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts`. Không bấm F9 nên **không ghi
DB**; nút 「リセット」 *có* ghi (`StepReset` → `UPDATE TRTSTATE`) nên mọi chỗ bấm nó đều
trả lời **Cancel**.

Đã chạy thật 2026-08-27 trên bệnh nhân 10: TC-G1…TC-G12 **xanh**; TC-G13…TC-G15 chưa
chạy lại sau lần sửa cuối. Ba điểm **LỆCH** với bản web + ba cái bẫy đã trả giá (trong đó
có một **lỗi của chính bộ test**: `Uia.SendKey` khai sai layout `INPUT` nên `SendInput`
không gửi phím nào mà cũng không báo lỗi) nằm ở `Tests/GuideSidePanel/README.md` mục 4.

> ⚠️ Luồng này đóng `frm203017` bằng **F10 / nút 戻る**, TUYỆT ĐỐI không Escape: Escape ở
> dialog đó gọi `btnF9_Click`, tức 確定 (`frm203017.cs:180`).

**TreatmentHeaderStaff** đo **đáp án** cho vùng 「Ｄｒ」 của header `frm203002`, nơi
WinForm để **ba** control chồng nhau và mỗi cái trả lời một câu khác nhau: `lblDrLabel`
(click = 一括変更 cả ngày), `lbDr` (担当医 của DÒNG con trỏ), `cboDr` (担当医 cho dòng
THÊM MỚI, `Visible = false`). Chúng rất dễ bị gộp thành một khi port — bản web có riêng
`treatment-header-staff.spec.ts` khoá cả ba, và đây là nửa WinForm của nó.

Đã chạy thật 2026-08-26: 4/5 xanh, `TC-LBL-1` `Ignore` vì dataset máy đó không tách
được nhãn khỏi combo. Chi tiết + văn bản 一括変更 nguyên văn ở README của luồng.

**MenInput** đo **đáp án** cho `frm203035`「面入力」 — nửa WinForm của
`../web-tenant-tests/tests/men-input-dialog.spec.ts` (TC-M1…TC-M8). Hộp thoại này mở
**sau** khi 処置 đã đáp xuống lưới, khi `mst_trt.men = 1` **và**
`INPCONFIG.MENINPUT_FLG = 1`; mỗi lần F9 確定 nối một token `<歯 + 面文字>` vào **cả**
cột 2 (療法・処置) **lẫn** cột 72 (`FREEWD`).

Nó KHÔNG bấm F9 登録: cột 72 đọc thẳng từ lưới sau khi bật cột ẩn bằng cửa hậu của app,
nên **không cần cờ nào và không ghi DB** — rẻ hơn hẳn bản Playwright, nơi TC-M8 phải bấm
登録 rồi query `trn_trn.freewd` sau cờ `TEST_ALLOW_SAVE`.

Đã chạy thật 2026-09-03 trên bệnh nhân 10. Hai thứ đáng biết nhất, cả hai đều đo được
chứ không suy ra:

- **「Mặt đang chọn」 chỉ đọc được bằng MÀU NỀN.** UIA không phơi ra `Control.BackColor`,
  mà đó là tín hiệu duy nhất WinForm dùng (`White` ↔ `LightGray`, `frm203035.cs:596-627`).
  Vì thế có `Infrastructure/PixelProbe.cs` — chụp rect của nhãn rồi lấy màu chiếm đa số.
  Đây là công cụ dùng chung đầu tiên cho loại câu hỏi 「control này đang tô màu gì」.
- **処置選択 VẪN MỞ phía sau 面入力** (`showDialog` modal lồng nhau, `frm203016.cs:1573`),
  nên KHÔNG dùng lại được `HighNeedsFlow.CommitPick` — hàm đó coi 「picker đã đóng」 là
  「chốt xong」 và sẽ bắn cú click đường lui vào đúng vùng mà 面入力 đang che.

Hai điểm **LỆCH** với bản web + hai cái bẫy còn lại nằm ở `Tests/MenInput/README.md` mục 4-5.

**SigaToothStatus** đo **đáp án** cho hai bảng 歯牙 — `SIGA` (自歯状況) và `KON` (根数) —
nửa WinForm của BA spec Playwright cùng lúc: `tooth-extraction-siga-restore`,
`siga-kon-remaining-gaps`, `p-mode-kesson-siga`. Bảng tương ứng từng testcase ở
`Tests/SigaToothStatus/README.md` mục 1.

Điều làm luồng này khác mọi luồng khác: **ba trong bốn đường ghi 歯式 chạy TRƯỚC F9**.
Chốt một 処置 抜歯 là `IregCodChk` → `SigaChg` phát `update Siga` ngay tại chỗ; xoá dòng
đó là `DelExtRec` phát một câu nữa; Ｐ変更 là `Chk_PModeKesson`. Không có cách nào "chỉ
nhìn" — vì thế cờ **riêng** `sigaTooth.allowSave`, và fixture chụp `SIGA`/`KON` ở
`OneTimeSetUp`, in ra stdout, trả lại ở `OneTimeTearDown`.

Đã chạy thật 2026-09-03 trên bệnh nhân 10 (診療月 2026-08). Hai chiều đo được:
`179/1` trên ô 部位 10 ⇒ `se11: 0→4` **chưa bấm F9**; xoá dòng đó ⇒ `se11: 4→0`; răng sữa
`179/0` trên ô 6 ⇒ `sn4: 5→9` rồi `9→5`. Sáu điểm LỆCH tìm được khi đọc source + ba cái
bẫy của chính bộ test nằm ở README của luồng, mục 5 và mục 7.

> ⚠️ Luồng này nâng `frm902003`「部位選択」 lên `Infrastructure/ToothSelectDialog.cs` —
> trước đó nó nằm trong `Tests/InpP1Dialogs/BrSampleFlow`. `BrSampleFlow` giữ nguyên
> chữ ký cũ, thân hàm uỷ nhiệm về lớp chung.

**PerioKensaOrder** đo **đáp án** cho 検査順 (`ModCommon.pInpOpt[36]`) — hướng quét con trỏ
của 歯周基本検査 (`frm203028`) và 歯周精密検査 (`frm203029`). Nửa WinForm của
`perio-kensa-order.spec.ts`; bảng tương ứng từng testcase ở
`Tests/PerioKensaOrder/README.md` mục 1.

Nó không ghi DB (không bao giờ bấm F9 登録, và 部位 dựng bằng `F7 全顎` trong bộ nhớ),
nhưng có một rủi ro **khác loại** với mọi luồng trên: `-AllowSettingChange` cho phép ghi
`KensaOrder` vào **`C:\NEW_SIM2000\Ocha.xml`** — cấu hình **của MÁY**, không phải của
phòng khám. Đường duy nhất đổi được setting trong một phiên là 処置入力設定 → F9 登録, vì
`btnF9_Click` gọi `ModCommon.pGetInpOpt()` ngay sau khi ghi (`frm203003.cs:113-118`,
`:270-273`). Fixture chụp nhãn cũ và trả lại ở `OneTimeTearDown`.

Hai thứ đáng biết nhất, cả hai đọc source mới thấy:

- **Combo 「基本･精密検査」 có thể nói dối.** `KensaOrder = 0` (máy chưa cấu hình) làm
  `dspData` rơi vào `SelectedIndex = 0` ⇒ combo hiện 「左上から」, trong khi `pInpOpt[36] = 0`
  và cả hai form chỉ kiểm `== 1` nên app **chạy nhánh 右上**. Khi cờ tắt, fixture đo nhánh
  đang chạy bằng chính chỗ con trỏ rơi vào, chứ không tin combo.
- **4点法/6点法 không đổi được giữa phiên.** `pGetInpOpt()` chỉ nạp lại XML; `pInpOpt[32]`
  lấy từ `_inpConfigData` (bảng `INPCONFIG`) vốn chỉ nạp một lần lúc app khởi động
  (`modCommon.cs:299`). Một lượt chạy vì thế phủ được **một** chế độ — bên Playwright cả
  hai chạy trong một lượt vì đó chỉ là một field JSON.

Đã chạy thật 2026-09-04 trên bệnh nhân 10 (診療月 2026-08). **歯周基本検査 KHÔNG lệch**:
`TcREAD`/`Tc1`/`Tc2`/`Tc4` xanh — cả hai nhánh 検査順 khớp đúng source, kể cả trên bộ răng
khuyết 25/32 (`F7 全顎` bỏ qua 欠損歯). Răng 15 không tồn tại ở bệnh nhân này và WinForm rơi
đúng xuống răng 14 — thứ mà spec web assert cứng `răng 15` không bắt được. **歯周精密検査
chưa đo được** (UIA sập giữa chừng + trần 15 phút của wrapper). Bảy cái bẫy đã trả giá và
hai việc còn phải sửa nằm ở README của luồng, mục 6.

> **Bài học dùng chung, đọc trước khi viết luồng mới:** app này **không nhận
> InvokePattern ở bất kỳ control nào**. `Uia.Click` lên nhãn / caption / dòng lưới đều
> KHÔNG có tác dụng — phải `Uia.LeftClickPhysical` / `Uia.MouseClick`, và luôn kiểm
> rect trước khi bắn chuột. Đo được ở `Tests/TreatmentHeaderStaff/README.md` mục 4.

→ Đọc README trong thư mục của luồng **trước khi chạy**.

> Mỗi luồng có tiền đề riêng và rủi ro riêng thì nằm trong thư mục con của `Tests/`
> cùng helper của chính nó, kèm README và runner riêng. Thứ nào hoá ra dùng chung
> (ví dụ `Infrastructure/ModalDialogs.cs`, ban đầu viết cho ParitySaveData) thì nâng
> lên `Infrastructure/` khi luồng thứ hai cần — chứ không chép đôi.

---

## 9. Thêm testcase mới

> **Đọc [`PROBE-GUIDELINE.md`](./PROBE-GUIDELINE.md) TRƯỚC.** Luật số một: chưa biết
> app thật hành xử ra sao thì **chụp màn hình → đọc ảnh → rồi mới viết assert**, chứ
> không viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu. File đó
> còn ghi bảy cái bẫy đã trả giá (UIA chỉ thấy dòng trong khung nhìn, ESC = 戻る,
> dòng tiêu đề lọt vào danh sách dữ liệu, …).

1. Kế thừa `UiTestBase` → có sẵn `App`, `Screen`, `Db`, ảnh chụp, watcher hộp thoại.
2. Thao tác qua `Screens/*`, đừng gọi thẳng FlaUI trong testcase — locator gom một chỗ.
3. Cần đọc cột ẩn (acc_unit, f1, 処置日…) thì thêm truy vấn vào `Data/OchaDb.cs`; **chỉ đọc**.
4. Chờ bằng `Waits.Until` / `Waits.Poll`, **không** `Thread.Sleep` một con số phỏng đoán.
5. Mọi khẳng định đều dẫn nguồn WinForm (`file:dòng`) trong thông điệp assert — người đọc
   log sau này cần biết "đúng" là đúng theo cái gì.
6. Kỳ vọng phụ thuộc dữ liệu máy thì `IgnoreWithReason(...)` chứ đừng để đỏ oan.
