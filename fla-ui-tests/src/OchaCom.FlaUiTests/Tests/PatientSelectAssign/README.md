# PatientSelectAssign — 患者確定 chốt 担当医 / 衛生士

Đo **đáp án WinForm** cho `frm203001.defData` (`INP/Forms/frm203001.cs:632-749`):
màn 診療入力（患者選択） phải chốt được 担当医 và 衛生士 **trước khi** mở 処置入力,
và từ chối mở màn khi không chốt được.

Nửa còn lại của cặp parity nằm ở:

| | |
|---|---|
| `../web-tenant-tests/tests/patient-select-dr-staff-required.spec.ts` | spec gốc của bản web |
| `../web-tenant-tests/tests/patient-select-assign-parity.spec.ts` | spec **đối chiếu**, cùng số hiệu TC với file này |

> ✅ **Đã chạy PROBE trên máy Windows thật (2026-08-26).** Kết quả đo nằm ở mục 4b.
> Vẫn chạy `.\run-confirm-patient.ps1 -Diagnostics` trước khi chạy fixture assert trên
> một máy/dataset khác — sai locator thì log trông y hệt "WinForm sai"
> (PROBE-GUIDELINE mục 2).

---

## 1. Vì sao đáng đo

`drNo` / `staffNo` mà màn này chốt được **đóng dấu lên MỌI dòng lưu ở màn sau**
(`TRNTRN.dr_no` / `staff_no`, `COMMON/DBAccess/TrnTrn.cs:4202,4212`). Mở được màn
chi tiết mà chưa chốt nghĩa là ghi cả một ngày điều trị dưới sentinel `0` — thứ
WinForm **không bao giờ** tạo ra từ luồng này vì nó chặn ngay ở 患者選択.

## 2. Chuỗi fallback thật (trích `defData`)

Thứ tự chặn: **診療日 → 患者情報 → ドクター → 衛生士**.

```
:636-641  _dtTrtDt.IsDate() != True      → E00002「診療日」  + focus _dtTrtDt
:669-675  getLastPatInfo() == null       → E00005「患者情報」 + focus cboPatNo
:678      cboUserNm.SelectedIndex > 0    ⇒ combo THẮNG mọi nguồn khác
:690-702    ├ inpKbn.inpTxt  → person.dr (att_dr)
            ├ inpKbn.selRow  → dt.Columns.Contains("user_no") ? dòng : person.dr
            └ inpKbn.newPat  → person.dr (trừ khi Update mà UserNo != 0)
:705-710  UserNo <= 0                    → E00027「ドクター」 + focus cboUserNm
:713-717  cboStaffNm.SelectedIndex > 0 ? combo : person.staff (att_st)
:721-726  StaffNo <= 0 && DispEiseisi==1 → E00027「衛生士」  + focus cboStaffNm
:738      cboUserNm.SelectedValue = UserNo   ← combo bị GHI ĐÈ sau khi chốt xong
:1054     Let_Data_frmPatId: pintDrNo = att_dr  (DrId_fixed KHÔNG BAO GIỜ true)
```

`0` là sentinel 未選択: combo có dòng trống `USER_NO = 0` ở index 0
(`EditControl.makeIinMstCombo`, `COMMON/Lib/EditControl.cs:660-676`) nên `defData`
kiểm `SelectedIndex > 0` chứ không kiểm chuỗi rỗng.

## 3. Bảng tương ứng testcase

| TC | WinForm (file này) | Web (`*-parity.spec.ts`) | Nguồn WinForm |
|---|---|---|---|
| **TC-MSG-1** | `Tc1_MsgTblWording` — đọc nguyên văn `MSGTBL` | so chuỗi thật với `locales/ja.ts` | `MsgTbl.cs:15-33` |
| **TC-PAT-1** | `Tc2_MissingPatientBlocks` | 患者番号 không tồn tại → E00005 | `:669-675` |
| **TC-DR-1** | `Tc3_BlankComboFallsBackToPatientMaster` | combo trống → `att_dr` | `:694` |
| **TC-DR-2** | `Tc4_PickedComboBeatsPatientMaster` | combo chọn thắng `att_dr` | `:678` |
| **TC-DR-3** | `Tc5_NoDoctorBlocks` | thiếu 担当医 → E00027「ドクター」 | `:705-710` |
| **TC-ST-1** | `Tc6_HygienistGateFollowsDispEiseisi` | thiếu 衛生士 → E00027「衛生士」 | `:721-726` |
| **TC-ROW-1** | `Tc7_DoubleClickIsNoOp` | double-click mở màn (web) | `:303-309` |
| **TC-DR-4** | `Tc8_WaitRowUserNoBeatsPatientMaster` | dòng 受付 thắng `att_dr` | `:696-701` |
| **TC-SEED-1** | `Tc9_RecordHeaderDoctorSourceWhenMonthHasRows` | header giữ Ｄｒ．vừa chọn | `modMain.cs:2125` |

## 4. Năm điểm LỆCH đã tìm ra khi đọc source

Đây là thứ cặp parity này sinh ra. Bốn cái đầu chốt được từ source; cái thứ năm
phải chạy probe mới biết.

### 4.1 `DispEiseisi` — bản web bind NHẦM TRƯỜNG

WinForm đọc `XmlControl.OchaXml.InpInfo.DispEiseisi` — một số nguyên trong
**`C:\NEW_SIM2000\Ocha.xml`** (`COMMON/Lib/XmlControl.cs:80`).

Bản web đọc `inp_config.eiseiji_flg` từ **DB**. Nhưng `eiseiji_flg` trong WinForm là
một tuỳ chọn **算定** hoàn toàn khác — 「衛生実地指導を算定しない」
(`COMMON/DBAccess/InpConfig.cs:28`, dùng ở `frm506008.cs:819`). `frm203001` **không
đọc cột đó một lần nào**.

### 4.2 `DispEiseisi` có BA trạng thái, bản web chỉ biết hai

Màn 処置入力設定 ghi `1` khi tick và **`9`** khi bỏ tick (`INP/Forms/frm203003.cs:264`):

| `DispEiseisi` | ẩn hàng? (`:542` kiểm `== 0`) | bắt buộc? (`:721` kiểm `== 1`) |
|---|---|---|
| `1` | hiện | **có** |
| `9` ← *giá trị thật khi bỏ tick* | **hiện** | **không** |
| `0` (mặc định của `int`, chưa ai vào設定) | ẩn | không |

Bản web (`api/inp-config-api.ts:34`) chỉ có `{Hidden:0, Shown:1}` và suy
`hygienistRequired = showHygienist`, tức **hiện ⇒ bắt buộc**. Vậy ở đúng cấu hình
phổ biến nhất (đã bỏ tick ⇒ `9`) **web chặn E00027「衛生士」 còn WinForm cho qua**.

### 4.3 Nhánh `selRow` — cột TỒN TẠI, không phải giá trị > 0

```csharp
// frm203001.cs:696-701
case inpKbn.selRow:
    DataTable dt = (DataTable)dgvView.DataSource;
    if (dt.Columns.Contains("user_no"))
        formParam.UserNo = int.Parse(dt.Rows[(int)args[0]]["user_no"].ToString());
    else
        formParam.UserNo = data.person.dr;
```

Lưới 受付患者一覧 **luôn có** cột `user_no` (`PatInfoList.cs:177`). Nên dòng 受付 mang
`user_no = 0` thì WinForm lấy luôn `0` rồi **chặn E00027**; nó KHÔNG rơi về `att_dr`.
Nhánh `else` chỉ dành cho các view KHÁC (本日来院 / 検索一覧) vốn không có cột đó.

Bản web viết `toUserNo(waitRowUserNo) || toUserNo(patientAttDr)` — rơi về `att_dr` và
**mở được màn**. Comment trong `lib/staff-assignment.ts` giải thích nhánh này là
「when that column is empty」, tức đọc `Columns.Contains` thành 「giá trị rỗng」.

`user_no` là `NULL` còn tệ hơn: `int.Parse(null.ToString())` ném ngay trong WinForm.

### 4.4 Double-click trên lưới là no-op

```csharp
// frm203001.cs:303-309
void dgvView_CellDoubleClick(object sender, DataGridViewCellEventArgs e)
{
    if (e.RowIndex >= 0)
    {
        //defData(inpKbn.selRow, e.RowIndex);
    }
}
```

Câu `defData` **đang bị comment**. Cửa vào thật của nhánh `selRow` là **Enter** trên
lưới (`:287-296`) hoặc End/F9 khi ô 患者番号 rỗng (`:500`). Spec web mở màn chi tiết
bằng `dblclick()`.

### 4.5 Ｄｒ．nào thắng trên header 処置入力 — PHẢI ĐO

Ba đoạn cùng tranh nhau ghi, thứ tự thật chỉ probe mới biết:

```
frm203001.cs:1054  Let_Data_frmPatId : pintDrNo = att_dr
                   — chạy VÔ ĐIỀU KIỆN: DrId_fixed không được gán true ở ĐÂU CẢ
                     (grep cả repo chỉ ra 3 chỗ: khai báo, câu if, và gán lại false)
frm203002.cs:425   cboDr.SelectedValue = formParam.UserNo → :8095 ghi pintDrNo lại
                   — nhưng SelectedValueChanged chỉ bắn khi GIÁ TRỊ ĐỔI
         :427      lbDr.Text = cboDr.Text        ← thứ người dùng NHÌN THẤY
modMain.cs:2125    Chg_DrName : lbDr lấy cột 69 CỦA DÒNG (dr_no đã lưu) nếu có,
                   không có mới rơi về pintDrNo
```

`TC-SEED-1` **ghi lại** đáp án chứ không áp đặt; `KQ-6` của probe hỏi thẳng câu này.

> Ghi chú thêm: trên frm203002, `cboDr` **bị ẩn** (`:2478`) và chỉ hiện khi click vào
> nhãn (`lbDr_Click`, `:8087`). Thứ đọc được là **nhãn `lbDr`**. Bản web render một
> combobox luôn hiện — nên hai bên không so bằng cùng một loại control.

## 4b. ĐÃ ĐO trên máy thật (2026-08-26, SIM2000 của máy Windows)

Chạy `.\run-confirm-patient.ps1 -Diagnostics`. Trích `confirm-patient-KQ.txt`:

### Chốt được

| Câu | Đo được | Ý nghĩa cho parity |
|---|---|---|
| `KQ-2` | `E00027` = **「{0}を特定出来ません。{0}を選択して下さい。」** | **Bản web ĐOÁN SAI.** `locales/ja.ts:69` đang dùng 「{field}が選択されていません。」 và tự khai ở `:63` là 未確認. Giờ đã xác nhận — phải sửa. |
| `KQ-2` | `E00005` = 「{0}が登録されていません。」 | khớp bản web ✔ |
| `KQ-2` | `E00002` = 「{0}が間違っています。」 | khớp bản web ✔ |
| `KQ-7` | 患者番号 không tồn tại → chặn 「患者情報が登録されていません。」 | thứ tự chặn đúng như source ✔ |
| `KQ-8` | thiếu `att_dr` → chặn **「ドクターを特定出来ません。ドクターを選択して下さい。」** | E00027 thật, in situ ✔ |
| `KQ-8b` | sau khi chặn, `frm203001` vẫn hiện | không điều hướng ✔ |
| `KQ-5` / `KQ-5b` | combo TRỐNG + 患者1 (`att_dr`=16) → **mở được**, nhãn `lbDr` = 「院」 = tên của `att_dr` | chuỗi fallback 患者マスタ chạy đúng ✔ |
| `KQ-1b` | hàng 衛生士 **đang hiện** ⇒ `DispEiseisi ≠ 0` | máy này không dựng được nhánh ẩn |
| `KQ-4c` | bảng `wait` **rỗng** | `TC-DR-4` / `TC-ROW-1` sẽ `Ignore` trên máy này |
| `KQ-10` | **F10 戻る từ frm203002 làm app ném unhandled exception** 「Index was out of range」 | lỗi thật của app, không phải của test — luồng phải bấm **Continue** để phiên sống tiếp |

### ĐÃ GỠ — cả hai chặn cũ, và câu KQ-6

**Nguyên nhân gốc: app KHÔNG nhận `InvokePattern` lẫn UIA `SetFocus` ở control nào.**
Đo 2026-08-27 (xem thêm `Tests/TreatmentHeaderStaff/README.md` mục 4). Hệ quả và cách gỡ:

| Chỗ kẹt | Vì sao | Cách gỡ |
|---|---|---|
| Hộp thoại `MsgDialog` không đóng | `dialog.FindAllDescendants()` trả **rỗng** trên modal này nên không tìm ra nút | duyệt bằng `Uia.Descendants` — thấy `Button id="2" name="OK" @(1005,580 75x23)` — rồi click đúng tâm |
| Đoán toạ độ nút OK bị trượt | nút **lệch phải**, không nằm giữa hộp thoại (đoán x=963, cần x=1042) | ĐỌC rect từ cây UIA, đừng đoán tỉ lệ |
| Combo Ｄｒ．không lái được | `Uia.Click` không bung dropdown | click **chuột thật** rồi `Down` + đọc nhãn từng bước |
| `IsAlive(dialog)` báo sai | tham chiếu UIA cũ không mục nát, trả `true` cho cửa sổ đã đóng | truy vấn LẠI `FirstDialog()` mỗi vòng |

**`KQ-6` đã có đáp án** (2026-08-27):

```
KQ-6a === chọn Ｄｒ．「副」 — đường đi qua combo: 「」(trống) → 「副」
KQ-6  === combo = 1「副」 (att_dr=16) + 患者1 → MỞ ĐƯỢC 処置入力
KQ-6b === nhãn lbDr = 「副」 · Ｄｒ．vừa chọn = 「副」 · att_dr của 患者マスタ = 「院」
KQ-6c === TRNTRN tháng 2026-08 của 患者1: KHÔNG CÓ DÒNG NÀO
```

⇒ **WinForm GIỮ Ｄｒ．vừa chọn**, không lấy `att_dr`. Nhánh `Let_Data_frmPatId`
(`:1054`, `DrId_fixed` luôn `false`) quả thật là **chết trong thực tế** —
`frm203002.cs:425` ghi đè lại đúng như bản port đã lập luận. **KHÔNG phải điểm lệch.**

> Lưu ý phạm vi: 患者1 KHÔNG có dòng TRNTRN nào trong tháng, nên đây là ca 「ngày sạch」.
> Ca 「ngày đã có 処置」 (nơi `Chg_DrName` đọc cột 69 của dòng) vẫn chưa đo — nhưng đó
> đúng là hành vi mà bản web đã CỐ Ý port (`TC-LBL-1` của
> `treatment-header-staff.spec.ts`), nên hai bên cùng thiết kế.

### NHÁNH 受付患者一覧 — ĐÃ ĐO (2026-08-27), hai điểm lệch được XÁC NHẬN

Bảng `wait` trên máy đó vốn rỗng nên nhánh này treo suốt. Đã seed hai dòng:

```sql
INSERT INTO wait (pat_no, user_no, rdate, chair) VALUES (3, 11, GETDATE(), 1);  -- user_no ≠ att_dr
INSERT INTO wait (pat_no, user_no, rdate, chair) VALUES (5,  0, GETDATE(), 2);  -- sentinel 未選択
-- dọn:  DELETE FROM wait WHERE pat_no IN (3, 5);
```

`患者3` và `患者5` đều có `att_dr = 16「院」`, nên `user_no` của dòng tách được khỏi
`att_dr`. Chạy `.\run-confirm-patient.ps1 -Case Tc1_ProbeWaitList`:

| Câu | Đo được | Kết luận |
|---|---|---|
| `KQ-W1` | ENTER dòng 患者3 (`user_no=11「池田 忠雄」`, `att_dr=16「院」`) → **mở được**, `lbDr` = 「池田 忠雄」 | **DÒNG THẮNG** `att_dr` — đúng `frm203001.cs:698`, và **khớp bản web** |
| `KQ-W2` | ENTER dòng 患者5 (`user_no=0`) → **BỊ CHẶN** 「ドクターを特定出来ません。…」 | ★ **KHÁC** — WinForm KHÔNG rơi về `att_dr`; bản web rơi về và MỞ màn (`TC-DR-4B` xanh) |
| `KQ-W3` | DOUBLE-CLICK dòng → **im lặng** | ★ **KHÁC** — no-op đúng `frm203001.cs:303-309`; bản web mở màn bằng chính cử chỉ này (`TC-ROW-1` xanh) |

#### ⚠️ `user_no = 0` MANG HAI NGHĨA KHÁC NHAU — phép so KQ-W2 ban đầu là SAI

Đây là chỗ tôi kết luận vội và phải đính chính.

| | ý nghĩa của `user_no = 0` |
|---|---|
| WinForm | **sentinel 未選択**. `IINMST2` không có dòng nào `USER_NO = 0`, và `defData` kiểm `UserNo > 0` (`frm203001.cs:705`) |
| web (sau khi gộp `app_user`) | **user THẬT — owner của tenant**. Đo trên `t_tenant1.app_user`: `user_no=0, user_kbn=2, 「Son Tran」` |

Nên seed `wait.user_no = 0` bên WinForm rồi đem so với bản web là **không cùng một
tình huống**: cùng con số, hai nghĩa. `KQ-W2` chỉ chứng minh 「WinForm chặn khi
`user_no = 0`」 — đúng, nhưng KHÔNG kết luận được gì về parity.

**Tình huống so được** là 「受付 chưa gán Ｄｒ．」, mà bên WinForm biểu diễn bằng
`NULL` chứ không phải `0`. Xem `KQ-W2` ở bảng trên (đã seed lại `user_no = NULL`).

Việc web đặt owner vào `user_no = 0` là **cải tiến có chủ ý** (gộp `IINMST2` với tài
khoản đăng nhập), và hệ quả của nó đã được xử lý ở chỗ khác: `TC-MST-1` của
`treatment-header-staff.spec.ts` đòi dropdown 担当医 KHÔNG chứa `user_no = 0`, tức owner
cố ý không được làm 担当医. Nhưng nó tạo ra một va chạm cần biết: **mọi đoạn code còn
mang ngữ nghĩa `> 0` thừa kế từ WinForm sẽ âm thầm loại owner** — ví dụ
`resolveStaffAssignment` trả `{ ok: false }` khi `drNo = 0`.

#### Double-click (KQ-W3) — thêm lối vào, không phá gì

Bên web là **thêm** một cử chỉ mà WinForm không có (câu `defData` trong
`dgvView_CellDoubleClick` bị comment). Rủi ro thấp; nhiều khả năng nên giữ và ghi rõ
là cố ý thêm, thay vì gỡ đi cho 「giống WinForm」.

### ĐIỂM LỆCH MỚI — focus sau khi bị chặn

| | sau `E00005` |
|---|---|
| WinForm | `AutomationId=「1001」 · Edit` — ô Edit **bên trong `cboPatNo`** (`1001` là id Win32 quen thuộc của edit con trong ComboBox). Đúng `cboPatNo.Focus()`, `frm203001.cs:673`. Đo 3 lượt, nhất quán. |
| web | `<button>「F1患者検索」` — nút F-key đầu thanh dưới, tức thứ tự tab mặc định |

⇒ WinForm trả con trỏ về ô vừa bị từ chối, người dùng gõ lại được ngay; bên web phải
click vào ô trước. Nhiều khả năng do dialog của Radix restore focus **sau** lệnh
`.focus()` trong `openDetail` (`onCloseAutoFocus`). `TC-FOCUS-1` của
`patient-select-assign-parity.spec.ts` khoá điểm này.

### THÊM BA CÁI BẪY UIA đã trả giá (2026-08-27)

Tất cả cùng một gốc: **app không nhận `InvokePattern` lẫn UIA `SetFocus`**.

| Bẫy | Triệu chứng | Cách đúng |
|---|---|---|
| **ESC trên `frm203001` = 患者確定** | probe bấm ESC để đóng dropdown → app lập tức xác nhận bệnh nhân và rời màn; mọi bước sau đỏ với 「không thấy cboUserNm」, nghe như sai locator | đóng dropdown bằng `Alt+Up`. `BaseForm` map `Escape` → `btnEndEsc_Click` (BaseForm.cs:616-627 → frm203001.cs:487-506) — cùng họ PROBE-GUIDELINE 3.3 |
| **`Uia.Click` lên DÒNG lưới không dời con trỏ** | ENTER sau đó rơi vào hư không, 患者確定 「im lặng」 | click **chuột thật vào một Ô** của dòng, như `TreatmentGridOps.FocusCell` |
| **Chọn dòng lưới TỰ ĐIỀN ô 患者番号** | đọc ô ra 「3」 = số bệnh nhân của dòng vừa chọn, tưởng ô bẩn | biết mà trừ ra; `btnEndEsc_Click` đọc `cboPatNo.Text` TRƯỚC lưới (`:500`) nên phải dọn ô nếu muốn đi nhánh `selRow` |

### CÒN LẠI — hạn chế của HARNESS, không phải của app

Ô 患者番号 **chưa ghi đè được sau lần đầu**: `Ctrl+A` không select-all trong `TextBox`
của WinForms, và `End`/`Shift+Home`/`Delete` cũng chưa ăn sau khi vừa đóng hộp thoại —
các lần gõ NỐI vào nhau (ảnh chụp cho thấy ô mang `19282157`). Phép verify trong
`SetPatNo` nay **bắt và ném** thay vì đo sai âm thầm, nên `KQ-8` / `KQ-5` tự dừng chứ
không báo số liệu bịa. Hướng tiếp: gõ `BackSpace` theo độ dài hiện có, hoặc chờ ô nhận
focus thật rồi mới gõ.

### CHẶN CŨ #1 — không đóng được hộp thoại của `MsgDialog`

MessageBox 「お茶コン」 (một nút OK, ảnh chụp ở `artifacts\screenshots`) **không đóng
được từ tiến trình test**. Đã thử và hỏng **cả bốn**:

| Cách | Kết quả |
|---|---|
| `Dialogs.ClickButton` (InvokePattern / LegacyIAccessible) | không tìm thấy nút — `FindAllDescendants` ra rỗng |
| `Window.Close()` (bên trong `Dialogs.DismissOk`) | hộp thoại vẫn còn sau 10s |
| `Enter` / `Esc` sau `ForceForeground` | không đóng |
| click chuột THẬT theo toạ độ (`LeftClickPhysical`) | không đóng |

Hệ quả: **đọc nội dung thì đúng**, nhưng testcase sau bị hộp thoại cũ chắn. Probe đã
được sửa để KHÔNG bao giờ báo cáo hộp thoại cũ (`ConfirmAndObserve` dọn trước khi bấm,
và ném khi dọn không xong) — nên các dòng `KQ-` ở trên là số liệu THẬT, còn các dòng
`!! bước` là lời than về khâu dọn dẹp.

Chưa gỡ được cái này thì mỗi lượt chạy chỉ đo chắc chắn được **một** nhánh có hộp thoại.
Hướng tiếp theo: đổ cây UIA của CHÍNH hộp thoại (`Uia.DumpTree` trên window đó) để biết
nó là lớp cửa sổ gì và nút OK nằm ở đâu trong cây — probe hiện chưa đổ.

### CHẶN CŨ #2 — `KQ-6` (Ｄｒ．nào thắng trên header) — ĐÃ TRẢ LỜI, xem trên

Combo `cboUserNm` **không lái được qua UIA**. Đã thử và hỏng **cả bốn**:

| Cách | Kết quả |
|---|---|
| `ComboBox.Select(string)` (ComboBoxPattern) | không chọn được |
| tìm `ListItem` trong hậu duệ của combo | `KQ-3`: **0 mục** |
| combo ĐÓNG + `Home`/`Down` | `KQ-3b`: nhãn không đổi, luôn 「」 |
| click mở dropdown + `Down` + đọc nhãn | đi 30 bước, nhãn vẫn 「」 |

Dropdown của WinForms ComboBox là **cửa sổ popup riêng** chứ không phải con của combo,
nên mọi phép tìm trong hậu duệ đều ra rỗng. Bước tiếp theo nên là: bung dropdown rồi
**quét CỬA SỔ TOP-LEVEL mới xuất hiện** trong tiến trình (giống cách `Dialogs.Open`
quét `#32770`), hoặc click theo TOẠ ĐỘ vào từng dòng của popup đó.

Cho tới khi gỡ được **cả hai** chặn trên, `TC-DR-2` và `TC-SEED-1` bên WinForm **chưa
chạy được** — và đó cũng là hai testcase quan trọng nhất, vì `Let_Data_frmPatId`
(`:1054`, `DrId_fixed` không bao giờ `true`) và `Chg_DrName` (modMain.cs:2125) đều có
thể thắng Ｄｒ．vừa chọn.

> Ghi chú cho người gỡ tiếp: hai chặn này **cùng một họ** — combo và hộp thoại của app
> đều là control WinForms vẽ tay không phơi con qua cầu MSAA→UIA. Giải được một cái
> nhiều khả năng giải được cả hai. Bắt đầu bằng `Uia.DumpTree` đổ thẳng cây của hộp
> thoại và của combo lúc đang bung, rồi mới chọn cách tác động.

## 5. Chạy

```powershell
.\run-confirm-patient.ps1 -Diagnostics    # PROBE — LÀM CÁI NÀY TRƯỚC
.\run-confirm-patient.ps1                 # fixture assert
.\run-confirm-patient.ps1 -Case Tc4 -StepMs 1200
```

Runner lọc sẵn mọi dòng `=== KQ-` ra `confirm-patient-KQ.txt` (đọc từ `.trx` để
không hỏng tiếng Nhật — PROBE-GUIDELINE 3.7).

## 6. KHÔNG ghi DB

Không bấm **F9 登録**, không seed bảng `wait`. Đây là chỗ **khác** bản Playwright:
bên đó `ensureWaitRow` chèn rồi xoá một dòng 受付, còn DB bên này là DB **thật** của
phòng khám (SIM2000) và `wait` là hàng đợi tiếp nhận đang chạy. Nhánh nào cần dòng
受付 mà máy không có sẵn thì testcase `Ignore` kèm lý do — tiếp nhận một bệnh nhân
trên app rồi chạy lại.

Mọi hộp thoại 「保存しますか？」 gặp phải đều trả lời **いいえ**.

## 7. Tiền đề

* `db.enabled = true` — mọi 患者番号 / Ｄｒ．đều **dò từ DB lúc chạy**, không hard-code.
  Không có DB thì cả fixture tự bỏ qua ở `FixturePreflightSkipReason`.
* App đang ở メインメニュー hoặc 患者選択. Đang đứng ở 診療入力 thì luồng **báo lỗi**
  thay vì bấm F10 mò — F10 có thể bung 「保存しますか？」 và trả lời nhầm là ghi thật.

## 8. File

```
PatientSelectScreen.cs             screen object frm203001 (screen object ĐẦU TIÊN cho màn này)
PatientSelectFlow.cs               lái 患者確定 + đọc kết cục, KHÔNG assert
PatientSelectAssignDb.cs           truy vấn CHỈ ĐỌC: person / iinmst2 / wait / TRNTRN
PatientSelectAssignProbeTests.cs   PROBE [Explicit] — 10 câu hỏi, không assert
PatientSelectAssignTests.cs        TC-MSG-1, TC-PAT-1, TC-DR-1..4, TC-ST-1, TC-ROW-1, TC-SEED-1
```

Hai thứ dùng chung đã thêm vào hạ tầng cho luồng này:

* `App/AppNavigator.OpenPatientSelect` — đi tới frm203001 rồi **dừng lại** ở đó.
* `Infrastructure/UiTestBase.NavigatesToTreatmentEntry` — trả `false` để nền chung
  không đi xuyên qua 患者選択 (và `UiaDumpRoot` để cây UIA đổ ra đúng cửa sổ đang đo).
