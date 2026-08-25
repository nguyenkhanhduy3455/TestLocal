# TreatmentGrid — thao tác CƠ BẢN trên lưới 処置 của 診療入力

Bảy thao tác cơ bản nhất trên lưới đăng ký `grdRegi` (biến static `hFG1`) của
`frm203002`: nhìn cột, chèn một 処置 từ tab 個別, Enter, Tab, gõ số vào ô 点,
Insert 行追加, Delete 行削除.

**Không có gì nâng cao ở đây** — không 部位選択, không 日計, không copy/paste,
không F9 登録.

> Đọc `../../../../README.md` (README của cả bộ fla-ui-tests) trước, nhất là mục
> 1–3 (chạy ở đâu, điều kiện app, cấu hình).

---

## 1. Chạy

```powershell
.\run-edit-treatment-rows.ps1 -Diagnostics   # CHẠY CÁI NÀY TRƯỚC TIÊN
.\run-edit-treatment-rows.ps1                # cả bộ TC-1..TC-7
.\run-edit-treatment-rows.ps1 -Case Tc6
.\run-edit-treatment-rows.ps1 -StepMs 1500   # chậm lại để ngồi nhìn
```

⚠️ **Chưa chạy lần nào trên Windows.** Tên control (`grdRegi`, `lbAllPoint`,
`lbDays`) đọc ra từ Designer, chưa đối chiếu cây UIA thật. Chạy `-Diagnostics`
trước: nó chỉ chạy `Tc0`, đổ cây UIA của lưới ra
`artifacts\treatment-grid.uia.txt` và in tiêu đề cột + 30 dòng đầu. Sai locator
thì log trông **y hệt** "WinForm sai" — mất nguyên một vòng gửi log qua lại.

**Không cần cờ gì**, không cần DB. Luồng này không đọc DB và không ghi DB.

---

## 2. Không ghi DB

Không có testcase nào bấm **F9 登録**. Mọi thay đổi (chèn 処置, Insert, Delete)
chỉ nằm trong `DataTable` trên bộ nhớ của phiên chạy — app đóng lại là sạch.
Vì vậy:

* không có bước dọn dẹp,
* không cần `parity.allowSave` / `inpP1.allowSave`,
* chạy được trên máy có dữ liệu thật mà không sợ hỏng gì.

Đây là cùng một luật với `Tests/KobetuSidePanelScoreTests.cs`, và khác hẳn
`Tests/ParitySaveData/` (luồng DUY NHẤT bấm F9).

---

## 3. Các testcase nối tiếp nhau

`TC-2` chèn dòng 処置 mà `TC-3`…`TC-6` dùng làm chỗ đứng, rồi `TC-7` xoá chính
dòng đó đi. Lọc `-Case Tc5` thì lưới chưa có dòng nào của luồng này ⇒ testcase
tự `Ignore` kèm lý do chứ không đỏ oan.

`run.stopOnFirstFailure` (mặc định bật) làm TC sau bị `Ignore` khi TC trước đỏ —
bản sao `mode: 'serial'` của bộ Playwright.

---

## 4. Bảng tương ứng với spec Playwright

Bên kia: `../../../../../web-tenant-tests/tests/treatment-grid-basic.spec.ts`.
Cùng số hiệu, cùng thứ tự, cùng nguồn WinForm — chạy hai bên rồi so từng cặp.

| TC | Nội dung | Nguồn WinForm | Đo gì bên web |
|---|---|---|---|
| **TC-1** | 5 cột `日/部位/療法・処置/点/回`, và dòng CUỐI luôn trống | `Designer.cs:1148-1206`, `frm203002.cs:158-169`, `:3043-3044` + `:3063-3066` | nhãn header + ô `data-grid-cell$="\|2"` cuối |
| **TC-2** | Chọn 処置 ở tab 個別 → thêm ĐÚNG 1 dòng, con trỏ nhảy sang cột 回 | `frm203002.cs:6902-6925`, `modKobetu.cs:255-265` | side panel 個別 → lưới +1 dòng, ô vàng ở cột 4 |
| **TC-3** | Enter trên ô ≠ 部位 mở editor TẠI CHỖ, không nhảy xuống | `frm203002.cs:3549-3564`, `Designer.cs:1116` | ô focus mọc `<input>`, `focusedCell` không đổi |
| **TC-4** | Tab bị NUỐT, con trỏ đứng yên | `frm203002.cs:3566-3569`, `Designer.cs:1121` | `focusedCell` không đổi sau Tab |
| **TC-5** | Ô 点 chỉ ăn `0-9`, chữ cái bị chặn | `frm203002.cs:3601-3639` | giá trị `<input>` sau khi gõ `9a8` |
| **TC-6** | Insert chèn ĐÚNG 1 dòng trống tại con trỏ | `frm203002.cs:3570-3572` → `AddRow` `:3699-3805` | số dòng +1 |
| **TC-7** | Delete xoá dòng đang đứng và tính lại 合計 | `frm203002.cs:3574-3583` → `DeleteRow` `:3814`, `:3959-3965` | dòng biến mất, `合計:` giảm |

### Khác biệt CÓ CHỦ Ý giữa hai bên

* **Cách chèn dòng ở TC-2.** Bên WinForm click một dòng của lưới `hfgKobetu` là
  đủ (`hfgKobetu_Click` tự gọi tiếp Enter → `CellDoubleClick`, `frm203002.cs:6928`).
  Bên web là panel React, spec đi theo đúng thao tác của bản web.
* **Cách gửi phím.** WinForm cần bàn phím/chuột THẬT (mọi nghiệp vụ treo ở
  `KeyDown`/`KeyPress`); Playwright dùng `page.keyboard.press`.
* **Số lượt "đăng nhập".** Bên web bị rate-limit ~10 lượt/giờ nên cả file dùng
  chung một `page` ở `beforeAll`; bên này mở app không tốn quota, nhưng vẫn dùng
  chung một phiên vì khởi động app mất hàng chục giây.

---

## 5. Ba cái bẫy đã biết

1. **Dòng 0 của `grdRegi` là dòng giả bị ẩn** (`hFG1.Rows[0].Visible = false`,
   `frm203002.cs:3063-3066`) — di sản VB6, nơi dòng đầu là dòng tiêu đề. Nó
   *không* ra tới UIA nên `Snapshot()` không thấy; đừng "sửa" chỉ số cho lệch đi
   một khi đối chiếu với số hàng trong source.

2. **Dòng cuối lưới LUÔN trống** và đó là bất biến, không phải rác — xem TC-1.
   `Move_Cell(Down)` ở dòng cuối còn nối thêm một dòng nữa (`:5856-5870`).

3. **`lbAllPoint` không parse thẳng ra số được.** `Calc_MDPoint` định dạng
   `lngMonthPoint.ToString("#,###") + "　点"` (`modAcc.cs:107-121`) — có dấu phẩy
   ngăn nghìn *và* khoảng trắng ĐỦ CHIỀU RỘNG trước chữ 点. Dùng
   `TreatmentGridOps.AllPointValue()`, đừng dùng `Txt.Int`.

---

## 6. Cố ý ĐỂ SAU (không nằm ở đây)

Ba thứ dưới đây đều là thao tác cơ bản của lưới nhưng **mở hộp thoại**, tức là
kéo theo chuỗi dialog + tiền đề riêng — xếp vào đợt "nâng cao":

* Enter trên cột **部位** → 部位＆病名 (`frm203002.cs:3551-3558`);
* **←** trên cột **点** → 部位＆病名 (`:3583-3593`);
* menu chuột phải **コピー / 貼り付け** (`:7856-7883` → `modTrtCopy`), chỉ hiện khi
  con trỏ đang ở cột 点 và `linekbn == "2"` (`:3647-3689`).

Còn 行追加 / 行削除 qua **menu chuột phải** (`IDM_TrtInsert` / `IDM_TrtDelete`,
`Designer.cs:2932-2937`) thì đi cùng một đường với phím Insert/Delete mà TC-6 và
TC-7 đã đo — bản web đã có spec riêng cho menu
(`web-tenant-tests/tests/treatment-table-handler.spec.ts`), nên ở đây không đo lại.
