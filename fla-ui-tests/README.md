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
    ├── TreatmentGrid/                  thao tác CƠ BẢN trên lưới 処置 — xem mục 8b
    │   ├── README.md                   bảng tương ứng với spec Playwright
    │   ├── TreatmentGridOps.cs         phần GHI vào grdRegi (click ô, gửi phím)
    │   └── TreatmentGridBasicTests.cs  TC-1 … TC-7
    ├── ParitySaveData/                ⚠️ luồng GHI DB, runner riêng — xem mục 8b
    │   ├── README.md                  đọc file này TRƯỚC khi chạy
    │   ├── Bug2dConcurrentSaveTests.cs
    │   ├── SaveFlow.cs                lái chuỗi hộp thoại F9
    │   ├── OchaDbParity.cs            truy vấn CÓ GHI (tách khỏi Data/OchaDb.cs)
    │   └── BuiDialogDiagnosticsTests.cs
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
| `.\run-inp-p1-dialog.ps1` | F11 →「９ オプション」→ Step / チェック項目設定 · 部位選択 → F9 Br例 | `Tests/InpP1Dialogs/` | ⚠️ chỉ khi `-AllowSave` — `TRTSTATE`, `chkprm` |
| `.\run-edit-treatment-rows.ps1` | Insert/Delete trên lưới 処置 → `AddRow` / `DeleteRow` (行追加・行削除) | `Tests/TreatmentGrid/` | ✖ không bấm F9 |

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
