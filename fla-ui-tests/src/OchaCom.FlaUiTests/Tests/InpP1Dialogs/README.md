# Luồng InpP1Dialogs — ba dialog của 診療入力 vừa port sang web

Chạy: **`.\run-inp-p1-dialog.ps1`** — runner riêng, **không** đi qua `run-all-tests.ps1`.

| | WinForm | Đường vào |
|---|---|---|
| **A** Ｓｔｅｐ編集 | `INP/Forms/frm203050.cs` | F11 → 「９ オプション」 → 「Step」 |
| **B** チェック項目設定 | `INP/Forms/frm203044.cs` | F11 → 「９ オプション」 → 「１ チェック項目設定」 |
| **C** Ｂｒサンプル | `INP/Forms/frm203049.cs` | 部位選択 (`frm902003`) → F9 「Br例」 |

---

## 1. Để làm gì

Đối chiếu với spec của bản web:

```
../../../../web-tenant-tests/tests/step-edit-dialog.spec.ts        (TC-STEP-*)
../../../../web-tenant-tests/tests/inp-p1-ported-dialogs.spec.ts   (TC-CHK-* / TC-BR-*)
```

Spec bên đó viết **sau khi port**, dựa trên đọc source WinForm. Bộ này chạy **chính
WinForm** để lấy ra **đáp án**: mỗi khẳng định bên web hoặc được xác nhận, hoặc lộ ra là
đang mô tả một hành vi mà WinForm không có.

Đây là lý do luồng tồn tại, và cũng là lý do mỗi testcase ở đây ghi rõ **nó ứng với TC
nào bên Playwright** — đọc log là biết cặp nào đang lệch.

---

## 2. Bảng tương ứng testcase

### A. Ｓｔｅｐ編集 — `StepEditTests.cs`

| FlaUI | Playwright | Kiểm gì |
|---|---|---|
| `Tc1_OpenAndLoad` | `TC-STEP-OPEN-1` + `TC-STEP-LOAD-1` | title; đủ `txtEpp1..txtEpp32` đúng thứ tự; 32 ô khớp `TRTSTATE.bui1_1..bui1_32` |
| `Tc2_KindCombo` | `TC-STEP-OPEN-2` | 15 mục từ `CODMST` 70, **hiện theo đúng thứ tự 1..15**, mở màn đứng ở 種別 1, nhãn = `ANY_VAL1` |
| `Tc3_BufferKeepsEdits` | `TC-STEP-BUFFER-1` | đổi 種別 rồi quay lại: số vừa gõ vẫn còn (bộ đệm `_stsBui` 15×32) |
| `Tc4_ArrowNavigation` | `TC-STEP-NAV-1` + `TC-STEP-NAV-2` | ↑/↓ nhảy ±16 cùng cột; →/← vòng lại ở hai đầu |
| `Tc5_OverMaxBlocksKindChange` | `TC-STEP-VALID-1` | > 30000 thì **dữ liệu không đổi sang 種別 khác** (xem mục 5 — WinForm khác web ở đây) |
| `Tc6_OverMaxBlocksSave` | `TC-STEP-VALID-2` | F9 → E00100 hai câu; dialog **không đóng**; focus về đúng ô sai |
| `Tc7_BackDiscardsEdits` | `TC-STEP-CLOSE-1` | F10 戻る không ghi; mở lại nạp lại từ DB |
| `Tc8_SaveWritesTrtState` | `TC-STEP-SAVE-1` + `TC-STEP-SAVE-2` | F9 ghi thật; **ô để trống ghi 0**; mở lại thấy giá trị mới; tự trả lại giá trị gốc |

### B. チェック項目設定 — `CheckItemTests.cs`

| FlaUI | Playwright | Kiểm gì |
|---|---|---|
| `Tc1_OpenAndRows` | `TC-CHK-OPEN-1` + `TC-CHK-ROWS-1` | 19 nhãn **đúng nguyên văn**; đủ 19 combo; **không có** `cboParam20` |
| `Tc2_TwoColumnLayout` | `TC-CHK-ROWS-2` | mục 1-10 cột trái, 11-19 cột phải (đọc theo toạ độ) |
| `Tc3_ComboSourcePerItem` | `TC-CHK-COMBO-1` | mỗi mục đổ đúng `CODMST` 62/63/64 — so **từng nhãn** với DB, không chỉ đếm số mục |
| `Tc4_LoadValues` | `TC-CHK-LOAD-1` | 19 combo khớp `chkprm`; chưa lưu bao giờ → mặc định 1, riêng 14/15/16 → 9 |
| `Tc5_BackDiscardsEdits` | `TC-CHK-CLOSE-1` | F10 戻る không ghi; mở lại bỏ chỉnh sửa dở |
| `Tc6_SaveWritesChkPrm` | `TC-CHK-SAVE-1` + `TC-CHK-SAVE-2` | F9 ghi `param7 = 2`; `chkprm` còn **đúng 1 dòng**; tự trả lại |

`Tc1` là testcase đáng giá nhất của cả luồng: 19 nhãn ở đây chính là **hợp đồng** mà
`Domain/Constants/CheckItemSettings.cs` của bản web phải khớp. Bên web không khai lại
bảng nhãn trong component (nó đọc từ `GET /tenant/chk-prm`), nên testcase là chỗ duy nhất
khoá được nội dung — còn đây là chỗ lấy nội dung đó ra khỏi WinForm.

### C. Ｂｒサンプル — `BrSampleTests.cs`

| FlaUI | Playwright | Kiểm gì |
|---|---|---|
| `Tc1_OpenAndList` | `TC-BR-OPEN-1` + `TC-BR-LIST-1` | chọn 2 răng 左上 bằng bàn phím; lưới có cột 番号 + 部位; 部位 là 歯式 **2 dòng**; F9 còn dùng được |
| `Tc2_ConfirmAppliesSample` | `TC-BR-CONFIRM-1` | F9 確定 ghi đè lựa chọn của 部位選択 (số ô răng có chữ **tăng lên**) rồi đóng |
| `Tc3_MixedJawError` | `TC-BR-ERR-1` | F7 全顎 → 「上下顎同時の処理はできません。」 + **tắt** F9 |
| `Tc4_NoMatchError` | `TC-BR-ERR-2` | răng 1+8 → 「Brに使用できません。」 + tắt F9 + lưới rỗng |

---

## 3. Ghi DB

| | Ghi gì | Cờ |
|---|---|---|
| A `Tc8` | `TRTSTATE` của **đúng** `patient.patNo` | `inpP1.allowSave` |
| B `Tc6` | `chkprm` — **cấu hình TOÀN PHÒNG KHÁM** | `inpP1.allowSave` |
| C | không ghi gì | — |

Mặc định `inpP1.allowSave = false` ⇒ hai testcase đó tự `Ignore`, phần chỉ-đọc vẫn chạy đủ.
Bật bằng `.\run-inp-p1-dialog.ps1 -AllowSave` hoặc `testsettings.local.json`:

```json
{ "inpP1": { "allowSave": true } }
```

Cả hai testcase **tự trả lại giá trị cũ qua giao diện** (bấm F9 lần nữa), không sửa DB
bằng SQL — `InpP1Db` là lớp **chỉ đọc**, và khôi phục bằng SQL thì test không còn chứng
minh được đường ghi của app. Trả không xong thì in `CẢNH BÁO … KHÔI PHỤC THỦ CÔNG` kèm
giá trị gốc.

> Một trường hợp **không** khôi phục được bằng giao diện: trước khi chạy mà bảng `chkprm`
> **rỗng** thì F9 đã chèn một dòng, và không có nút nào xoá nó. Lúc đó phải tự
> `DELETE FROM chkprm`. Test in cảnh báo đúng câu này.

Cờ này **tách khỏi** `parity.allowSave` là có chủ ý: hai luồng ghi vào những bảng khác
hẳn nhau về mức rủi ro (`TRNTRN`/`ACC_DAT` là 処置行 và sổ tiền cả tháng). Dùng chung một
cờ thì bật cái này là mở luôn cái kia.

---

## 4. Tiền đề

| Cần | Test tự lo? |
|---|---|
| App đang ở 診療入力 | Có — `UiTestBase` mở sẵn ở `OneTimeSetUp` |
| DB bật, `CODMST` có cd_type 62/63/64/70 | Một phần — thiếu thì combo rỗng và `InpP1MenuFlow.Open` ném lỗi kèm đúng lý do |
| Bệnh nhân test có dòng `TRTSTATE` | Có — `TrtState.getTrtState` tự chèn dòng mặc định (`TrtState.cs:1030`) |
| Lưới đăng ký có **ít nhất một 処置 cần chọn 部位** | Không — thiếu thì nhóm C `Ignore` kèm lý do, đổi `patient.patNo` |
| Bảng `BrSample` có mẫu khớp `inpP1.brTeeth` | Không — không có thì `Tc1` của C `Ignore`, đổi `inpP1.brTeeth` |

Kỳ vọng nào phụ thuộc dữ liệu của máy thì **`Ignore` kèm lý do**, không để đỏ oan — đỏ ở
đây chỉ làm người chạy đi sửa nhầm chỗ.

---

## 5. Ba chỗ WinForm KHÁC bản web — đọc trước khi kết luận "web sai"

**1. Giá trị STEP > 30000: WinForm chặn ở BA lớp, web chỉ port lớp thứ ba.**

```
txtEpp_KeyPress (frm203050.cs:171)  ép focus lại NGAY khi đang gõ
txtEpp_Leave    (:179)              rời ô là bị kéo về, KHÔNG có thông báo nào
saveData        (:259)              E00100 「STEPの値が正しくありません。」
```

Hệ quả: trên WinForm, thao tác "gõ số sai rồi bấm chuột sang combo 種別" có thể **không
bao giờ tới được combo** — lớp 2 nuốt cú click, và **không có hộp thoại nào bung ra**.
`Tc5` vì thế ghi nhận cả hai đường đi và chỉ khẳng định thứ bất biến: `dspData` không
chạy, tức 32 ô vẫn là dữ liệu của 種別 cũ. Testcase in ra lớp nào đã bắt được.

Còn một khác biệt nữa cùng chỗ: `cboKind_SelectedValueChanged` (`:130-142`) chạy **sau
khi** ComboBox đã đổi `SelectedValue`; `saveData` thất bại thì handler chỉ bỏ qua chứ
**không trả combo về mục cũ**. Bản web cho combo đứng yên. Đó là lựa chọn port tốt hơn —
đừng "sửa" bản web cho giống WinForm ở điểm này, nhưng cũng đừng assert điều ngược lại
trên WinForm.

**2. Nút F9 khi có lỗi: WinForm TẮT, web KHÔNG RENDER.**

`errorProc` (`frm203049.cs:290-294`) gọi `btnChgEnable(btnF9, false)` — nút vẫn nằm đó,
chỉ xám đi. Bản web dựng lại thành "không render nút" và spec Playwright assert
`toHaveCount(0)`. Ở đây assert `IsEnabled == false`. Cùng một ý nghĩa nghiệp vụ, hai cách
thể hiện; không bên nào phải sửa theo bên nào.

**3. Nạp lại dữ liệu khi mở lần thứ hai.**

WinForm chạy `initProc` trong mỗi lần `Load`/`Shown` ⇒ mở lại là đọc DB lại. Bản web đặt
`staleTime: Infinity` cho `trt-state` nên lần mở thứ hai **không có request nào** (spec
bên đó có nguyên một đoạn cảnh báo về chuyện này). Nghĩa là các testcase "mở lại thì thấy
gì" ở hai bên **không đo cùng một thứ**, dù kết luận trùng nhau.

---

## 6. Tệp trong luồng

| Tệp | Vai trò |
|---|---|
| `InpP1MenuFlow.cs` | F11 → 「９ オプション」 → mục con; đóng dialog bằng F10; đọc/đóng MessageBox |
| `StepEditDialog.cs` | frm203050: 32 ô, combo 種別, F9 |
| `CheckItemDialog.cs` | frm203044: 19 nhãn + 19 combo (bảng nhãn nằm ở đây) |
| `BrSampleFlow.cs` | frm902003 (mở, chọn răng bằng bàn phím, F7/F12) + frm203049 (lưới, F9 確定) |
| `InpP1Db.cs` | truy vấn **chỉ đọc** `TRTSTATE` / `chkprm` / `CODMST` |
| `InpP1TestBase.cs` | nền chung: `InpDb`, `AllowSave`, `RequireInpDb`, `RequireAllowSave` |
| `Vk.cs` | mã virtual-key gửi qua `Uia.SendKey` |
| `StepEditTests.cs` / `CheckItemTests.cs` / `BrSampleTests.cs` | testcase |
| `InpP1DiagnosticsTests.cs` | `[Explicit]` — đổ cây UIA menu + ba dialog + sơ đồ răng + CODMST |

Ba dialog nằm ở **ba fixture riêng** chứ không gộp một: `run.stopOnFirstFailure` tính
theo từng fixture, nên Ｂｒサンプル hỏng vì dữ liệu `BrSample` của máy sẽ không kéo theo
hai dialog kia bị `Ignore`. Đây là chỗ **khác** bản Playwright — bên đó gộp một file để
tiết kiệm lượt đăng nhập (app web chặn ~10 lần login/giờ), còn mở app ở đây không tốn
quota gì.

---

## 7. Bài học đã trả giá — đừng làm lại

**Gửi phím, đừng click, cho mọi thao tác F-key.** `BaseDialog.KeyPreview = true`
(`BaseDialog.cs:139`) nên F9/F10 tới thẳng `formBase_KeyDown` bất kể focus ở đâu. Click
chuột thì phải rời focus khỏi ô đang sửa — và `txtEpp_Leave` ép focus quay lại, nuốt mất
cú click. Triệu chứng: "bấm F9 mà không có gì xảy ra".

**ESC không phải "huỷ".** Trong `BaseDialog`, `Keys.Escape` và `Keys.End` đều gọi
`btnF9_Click` (`BaseDialog.cs:314-325`) — tức là 確定/登録, **ghi dữ liệu**. Ở `frm902003`
thì `End`/`Escape` gọi `btnEntry_Click` (`:192-197`): xác nhận lựa chọn rồi đi tiếp sang
病名選択. Đóng 部位選択 **phải** bằng **F12 戻る**.

**Phím số phải là virtual-key thật.** `BuiInfo.ProcessCmdKey` (`BuiInfo.cs:368`) chỉ chạy
với `WM_KEYDOWN`. `Keyboard.Type('5')` của FlaUI gửi `KEYEVENTF_UNICODE` → app nhận
`WM_CHAR` → ô răng không đổi. Dùng `Uia.SendKey(Vk.Digit(5))`.

**Tiêu điểm phải nằm trong `buiInfo1`.** WinForms chuyển `ProcessCmdKey` đi **lên** theo
chuỗi cha của control đang focus. Focus ở ngoài sơ đồ răng (ví dụ trên một nút F-key) thì
Delete/mũi tên/phím số bay vào hư không — và testcase đỏ ở bước sau, hoàn toàn sai địa chỉ.

**MessageBox modal làm UIA mù.** Khi nó đang mở, luồng UI của app bị chặn trong
`MessageBox.Show`, mọi truy vấn lên form phía sau treo tới hết timeout. Luôn **đọc + đóng
hộp thoại trước**, rồi mới hỏi tới cửa sổ (`InpP1MenuFlow.ReadAndDismissError`). Với
`frm203049`, cửa sổ hiện **trước** rồi `initProc` mới bung E00100 (nó chạy trong `Shown`),
nên `OpenBrSample` dò **cả hai** và ưu tiên hộp thoại.

**Chú ý quy tắc đệm số 0 của Designer.** `cboParam01`..`cboParam09` có đệm 0,
`cboParam10`..`cboParam19` thì không, còn nhãn `customLabel1`..`customLabel19` không đệm
bao giờ. Nội suy chuỗi kiểu `$"cboParam{n}"` sẽ trượt đúng 9 control đầu.

**Bám AutomationId của mục menu.** `IDM_Step` / `IDM_ChkPrm` / `IDM_Option` ổn định hơn
chữ hiển thị — Text còn dính ký tự tăng tốc (`&9 オプション`). Submenu là **cửa sổ #32768
riêng**, không phải con của popup cha, nên phải tìm mục con trong *mọi* popup đang mở.

---

## 8. Chạy

```powershell
.\run-inp-p1-dialog.ps1 -Diagnostics    # ⚠️ CHẠY CÁI NÀY TRƯỚC TIÊN
.\run-inp-p1-dialog.ps1                 # cả ba dialog
.\run-inp-p1-dialog.ps1 -Dialog step    # step | check | br
.\run-inp-p1-dialog.ps1 -Case Tc3
.\run-inp-p1-dialog.ps1 -StepMs 1200    # chậm lại để ngồi nhìn
.\run-inp-p1-dialog.ps1 -AllowSave      # bật nhánh GHI DB
```

**Vì sao `-Diagnostics` trước.** Luồng này **chưa chạy lần nào trên Windows**. Mọi tên
control mới chỉ được đọc ra từ Designer, chưa đối chiếu với cây UIA thật. Sai một cái là
testcase đỏ vì *không tìm thấy control* — trong log nhìn **giống hệt** "WinForm sai", và
người đọc sẽ đi sửa nhầm chỗ. `-Diagnostics` đổ cây UIA của menu, của cả bốn form, sơ đồ
răng và danh sách `CODMST` ra artifact; không bấm F9, không ghi DB.

Runner chạy **một `dotnet test` cho mỗi fixture** (build một lần rồi `--no-build`), lọc
theo dạng `~<namespace>.<TênLớp>` — đúng dạng mà `run-karte-auto-calc.ps1` đã chạy được.
Một fixture đỏ **không** làm dừng hai fixture kia: lượt chạy đầu tiên cần biết cả ba cái
nào chạy được, không chỉ cái đầu.

### Dòng `=== KQ-n ===` — thứ cần gửi lại

Mọi **đáp án** lấy được từ WinForm đều in ra với tiền tố `=== KQ-n ===` (cùng quy ước với
`Tests/KarteAutoCalc`), phân biệt với hàng trăm dòng nhật ký thao tác. Sau mỗi lượt chạy,
runner gom chúng — cộng mọi dòng `IGNORE —` và `CANH BAO` — vào **`inp-p1-dialog-KQ.txt`**.

| | Trả lời câu gì |
|---|---|
| `KQ-0` | cây UIA + tên control thật (chỉ có ở `-Diagnostics`) |
| `KQ-1` | combo 種別 của `CODMST` 70 hiện theo **thứ tự** nào |
| `KQ-2` | 32 ô STEP so với `TRTSTATE` |
| `KQ-3` | giá trị > 30000 bị **lớp nào** chặn (`txtEpp_Leave` hay `saveData` — xem mục 5) |
| `KQ-4` | 19 nhãn チェック項目設定 — hợp đồng cho BE bản web |
| `KQ-5` | giá trị `chkprm` + các mục `CODMST` 62/63/64 |
| `KQ-6` | Ｂｒサンプル: răng chọn được, số mẫu khớp, câu lỗi |

Dòng `IGNORE —` quan trọng ngang `KQ-` ở lượt chạy đầu: nó nói chính xác dữ liệu của máy
đang thiếu gì (bệnh nhân không có 処置 cần 部位, `BrSample` không có mẫu khớp…).

Chạy **cả fixture**, đừng chạy lẻ một testcase: cả fixture dùng chung một lần mở dialog
và thứ tự `Order` có ý nghĩa (`Tc6` dựa vào giá trị sai mà `Tc5` để lại). Đây là bản
WinForm của cùng một quy tắc bên Playwright — spec đó cũng chạy `mode: 'serial'` và cấm
`-g` một testcase lẻ.
