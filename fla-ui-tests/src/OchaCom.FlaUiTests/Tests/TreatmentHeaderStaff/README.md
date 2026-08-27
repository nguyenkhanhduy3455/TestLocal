# TreatmentHeaderStaff — vùng 「Ｄｒ」 trên header 処置入力

Đo **đáp án WinForm** cho ba control mà `frm203002` đặt chồng nhau ở cùng một chỗ,
mỗi cái trả lời một câu khác nhau — và rất dễ bị gộp thành một khi port.

Nửa còn lại của cặp parity: `../web-tenant-tests/tests/treatment-header-staff.spec.ts`
(chạy bằng `.\run-bulk-change-dr.ps1`).

---

## 1. Ba control, ba câu trả lời

| control | trả lời câu gì | mặc định | nguồn |
|---|---|---|---|
| `lblDrLabel` (CustomLabel 「Ｄｒ」) | click = **一括変更 cả ngày** | luôn hiện | `frm203002.cs:8105-8130` |
| `lbDr` (TextBox) | 担当医 **của DÒNG con trỏ đang đứng** | luôn hiện | `Chg_DrName`, `modMain.cs:2125-2138` |
| `cboDr` (ComboBox) | 担当医 cho **DÒNG THÊM MỚI** (`pintDrNo`) | **`Visible = false`** | `:2478`, lộ ra ở `lbDr_Click` `:8087` |

Văn bản 一括変更 dựng THẲNG trong source, **không** qua `MSGTBL` (`:8115`):

```
{日}日診療分の担当ドクターを\r\n{cboDr.Text} に変更します。\r\n\r\nよろしいですか？
title = 「ドクター変更」   (Interaction.MsgBox, Question|YesNo)
```

> Chú ý hai chi tiết dễ port sai: có **một dấu cách** giữa tên Ｄｒ．và
> 「に変更します。」, và xuống dòng nằm **trước** tên chứ không phải sau.

Nhánh Yes duyệt **mọi** dòng có `hFG1[0]` bằng 日 hiện hành và ghi `hFG1[69]` —
kể cả 部位病名行 (`:8121-8127`).

## 2. Bảng tương ứng testcase

| TC | WinForm (file này) | Web (`treatment-header-staff.spec.ts`) |
|---|---|---|
| **TC-MST-1** | `Tc1_ComboSourceHasNoSentinelDoctor` | dropdown không chứa `user_no = 0` |
| **TC-LBL-1** | `Tc2_LabelFollowsRowNotCombo` | nhãn hiện 担当医 của DÒNG |
| **TC-LBL-2** | `Tc3_ComboHiddenUntilLabelClicked` | click nhãn mới hiện combo |
| **TC-BULK-1** | `Tc4_BulkPromptWordingAndCancel` | văn bản đúng, No thì không đổi |
| **TC-BULK-2** | `Tc5_BulkAppliesToWholeDayOnly` | Yes thì mọi dòng cùng ngày đổi |
| *(không có)* | — | **TC-MST-2** — chặn request rồi bỏ `userKbn`; thuần BE/HTTP, WinForm đọc `IINMST2` thẳng nên không có tầng đó |

## 3. ĐÃ ĐO trên máy thật (2026-08-26)

| Câu | Đo được |
|---|---|
| `KQ-1` | `lblDrLabel` HIỆN · `lbDr` HIỆN · `cboDr` **KHÔNG CÓ TRONG CÂY UIA** khi `Visible=false` |
| `KQ-2` | `lbDr` = 「院」, `cboDr` = 「」 ⇒ **khác nhau**, đúng thiết kế ba-control |
| `KQ-3` | 患者10: `att_dr` = 16「院」; TRNTRN tháng 2026-08: `3日→dr_no=0`, `14日→dr_no=16`, `25日→dr_no=0` |
| `KQ-4` | `IINMST2` 20 dòng — **không** có `user_no = 0`, **không** có `user_kbn` ngoài `{0,1}` |
| `KQ-5` | lưới đọc ra 25 dòng, 日 = `日,(null),20,20,20,(null),3,3,…` ⇒ **dòng tiêu đề lọt vào** (PROBE-GUIDELINE 3.2) |

### Kết quả fixture assert (chạy thật, 2026-08-26)

```
Passed       Tc1_ComboSourceHasNoSentinelDoctor   (TC-MST-1)
Passed       Tc3_ComboHiddenUntilLabelClicked     (TC-LBL-2)
Passed       Tc4_BulkPromptWordingAndCancel       (TC-BULK-1)
Passed       Tc5_BulkAppliesToWholeDayOnly        (TC-BULK-2)
NotExecuted  Tc2_LabelFollowsRowNotCombo          (TC-LBL-1)
```

Đo được từ các lượt xanh:

* `cboDr` **ẩn** lúc mở màn → click nhãn → **hiện**, mang 「院」 = `att_dr`. Đúng thiết
  kế ba-control, và đúng thứ mà bản web vừa port.
* Hộp thoại 一括変更 thật:
  `20日診療分の担当ドクターを⏎院 に変更します。⏎⏎よろしいですか？` — mở đầu đúng 日 của
  DÒNG con trỏ, và **có dấu cách** trước 「に変更します。」. Khớp `ja.ts:102` bên web.
* Bấm 「いいえ」 thì nhãn và combo đều không đổi.

**`TC-LBL-1` `Ignore`** vì dataset máy này: mọi dòng có `dr_no > 0` đều bằng `att_dr`
(16), nên nhãn và combo trùng nhau và testcase sẽ xanh cả khi cả hai đọc chung một
nguồn. Muốn chạy được: đổi `patient.patNo` sang bệnh nhân có `att_dr` khác `dr_no`
của các dòng, hoặc chọn Ｄｒ．khác ở 患者選択 trước khi mở màn.

`TC-BULK-2` cũng có cùng rủi ro nên đã thêm guard: Ｄｒ．sắp áp mà **trùng** nhãn sẵn
có thì `Ignore` chứ không xanh rỗng nghĩa.

> Dữ liệu máy này còn có **9 dòng mang `dr_no = 0`** (3日 ×8, 25日 ×1) — chính là
> sentinel mà bản vá 患者確定 sinh ra để ngăn. Đáng viết thêm một TC hỏi 「nhãn hiện gì
> khi dòng mang `dr_no = 0`」, vì `Chg_DrName` chỉ rơi về `pintDrNo` khi ô **rỗng**,
> mà 「0」 thì không rỗng.

### Đối chiếu parity — luồng này KHÔNG tìm ra điểm lệch nào

Soát lại phía web ngày 2026-08-27, cả hai chỗ ban đầu tưởng lệch đều **khớp**:

**Văn bản 一括変更 — KHỚP từng ký tự.** Web dựng ở `locales/ja.ts:102`
(`drBulkChangeConfirm`): `` `${day}日診療分の担当ドクターを\n${drNm} に変更します。\n\nよろしいですか？` ``
— đúng dấu cách trước 「に変更します。」, đúng vị trí xuống dòng. Comment ở đó còn ghi rõ
đây là 確定した文言 vì đi thẳng qua `Interaction.MsgBox` chứ không qua `MSGTBL`.

**Dòng trống của combo — cùng hành vi, khác cách mã hoá.** Cả hai bên đều chèn một dòng
trống ở đầu: WinForm bằng `makeIinMstCombo(..., spcFlg: true)` (`frm203002.cs:597` →
`EditControl.cs:660-676`), web bằng `<SelectItem value={EMPTY_SELECT_VALUE}>`
(`staff-select.tsx:90`, comment nói thẳng là mirror của `addBlank=true`).

Khác biệt duy nhất là **cách mã hoá**, và bản web **an toàn hơn**:

| | dòng trống mang giá trị | hệ quả |
|---|---|---|
| WinForm | `USER_NO = 0` | **trùng** sentinel 未選択 (`frm203001.cs:705`) ⇒ một bác sĩ thật mang `user_no = 0` sẽ không phân biệt được với 「chưa chọn」 |
| web | `'__empty__'` | ngoài miền số ⇒ không có xung đột |

Nên `TC-MST-1` bên web (chặn `user_no = 0` lọt vào options) là **phòng thủ cho một rủi
ro mà WinForm không có cách phòng** — không phải hai bên hành xử khác nhau. Master trên
máy thật cũng không có `user_no = 0` (`KQ-4`), nên rủi ro đó đến từ tầng gộp `app_user`
phía web, không phải từ `IINMST2`.

`TC-MST-2` **không có** đối ứng WinForm: nó chặn request HTTP rồi gọi lại không kèm
`userKbn`, mà WinForm đọc `IINMST2` thẳng qua ADO nên không có tầng nào để bỏ bộ lọc.

## 4. BÀI HỌC LỚN NHẤT — app này KHÔNG nhận InvokePattern

Đo 2026-08-26, ba lần liên tiếp trong cùng một lượt probe:

```
Uia.Click(lbDr)        → combo KHÔNG hiện ra        (KQ-6)
Uia.Click(lblDrLabel)  → hộp thoại KHÔNG bung       (KQ-7)
Uia.Click(row)         → con trỏ lưới KHÔNG dời     (KQ-5b: click 6 dòng khác nhau,
                                                     CurrentCellAddress vẫn đứng ở 日=25)
```

Toàn bộ control của app là **vẽ tay** (`CustomLabel` / `GradientButton` /
`GradientDataGridView`) và chỉ nghe `MouseClick` — đúng như `AppNavigator` đã ghi cho
menu chính: 「Menu chính không có Button nào, toàn Panel nghe MouseClick ⇒ phải click
chuột thật, InvokePattern không có tác dụng」.

**Luật cho mọi luồng sau: dùng `Uia.LeftClickPhysical` / `Uia.MouseClick`, đừng dùng
`Uia.Click`.** Và luôn kiểm rect trước khi bắn chuột — rect rỗng thì `Uia.Center` trả
`(0,0)` và cú click rơi vào góc trái trên **desktop**, app mất foreground, còn thông
điệp lỗi sau đó thì đổ oan cho app (`TreatmentGridOps.FocusCell` đã trả giá vụ này).

Nhiều khả năng đây cũng là gốc của hai chỗ kẹt bên
`Tests/PatientSelectAssign/` (README mục 4b) — combo không lái được và hộp thoại
`MsgDialog` không đóng được.

## 5. Chạy

```powershell
.\run-bulk-change-dr.ps1 -Diagnostics   # PROBE — LÀM TRƯỚC
.\run-bulk-change-dr.ps1                # fixture assert
.\run-bulk-change-dr.ps1 -Case TcLbl1
```

## 6. KHÔNG ghi DB

Không bấm **F9 登録**. `一括変更` chỉ sửa **lưới trong bộ nhớ**, rời màn hình là mất —
đúng tính chất với bản Playwright («KHÔNG cần `TEST_ALLOW_SAVE`»). `TC-BULK-2` có bấm
「はい」 nhưng vẫn không có dòng nào xuống `TRNTRN`.

## 7. Tiền đề

* `db.enabled = true` — cột `dr_no` (`hFG1[69]`) là cột **ẩn**, UI không đọc được, nên
  mọi kỳ vọng về nhãn đều phải đối chiếu với DB.
* `patient.patNo` / `patient.trtDate` phải trỏ vào tháng **có 処置**, và tốt nhất là có
  dòng mang `dr_no` **khác** `att_dr` — không thì `TC-LBL-1` tự `Ignore` vì nhãn và
  combo trùng nhau.
