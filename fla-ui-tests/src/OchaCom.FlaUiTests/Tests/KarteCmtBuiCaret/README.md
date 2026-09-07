# `frm203012.btnF1_Click` — chèn 部位 vào ô テキスト của カルテ記載選択

Nửa WinForm của
[`web-tenant-tests/tests/dialogs-selection/bui-caret-newline-branch.spec.ts`](../../../../../web-tenant-tests/tests/dialogs-selection/bui-caret-newline-branch.spec.ts)
(báo cáo **#3b**).

```powershell
.\run-insert-bui-into-karte-cmt.ps1 -Diagnostics   # PROBE — chạy cái này TRƯỚC
.\run-insert-bui-into-karte-cmt.ps1                # 6 testcase assert
```

---

## 1. Câu hỏi

Spec Playwright kết luận rằng ở nhánh 「caret đứng ngay trước dấu xuống dòng cuối」,
WinForm và web **ra hai chuỗi khác nhau**, và đề xuất **A — port nguyên cái lệch đó sang
web** vì nó là khác biệt *output* chứ không phải khác biệt *vị trí con trỏ*.

Vấn đề: **cột 「WinForm」 trong spec đó chưa từng được đo.** Cả hai kỳ vọng đều là chuỗi
do TypeScript dựng từ công thức đọc trong C#. Chính spec khai điều đó ở dòng 3-5. Port một
bug là đổi output của **ba màn** cùng lúc (`insertBui` của `lib/use-karte-text-area.ts`
dùng chung cho `gType.Cult` / `Auto` / `Tekiyo`), nên nó cần một phép đo, không phải một
suy luận.

Luồng này đo, và trả lời dưới dạng **「khớp công thức nào」**:

```
=== KQ-VERDICT === TC-4 gõ 「X」…: WINFORM      ⇒ khác biệt là THẬT, và là khác biệt OUTPUT
                                                 ⇒ đề xuất A có căn cứ
=== KQ-VERDICT === TC-4 gõ 「X」…: WEB          ⇒ WinForm hành xử giống web
                                                 ⇒ #3b sai tiền đề, KHÔNG port
=== KQ-VERDICT === TC-4 gõ 「X」…: KHÔNG KHỚP   ⇒ mô hình suy luận sai, chưa port gì cả
```

---

## 2. Hàm đang đo

`INP/Forms/frm203012.cs:196-215` — hai nhánh chèn nhưng **chung một dòng tính con trỏ**:

```csharp
string msg = txtValue.Text;
int idx = txtValue.SelectionStart;
if (idx == txtValue.Text.Length - 2 && msg.Substring(idx, 2) == Environment.NewLine) {
    msg = msg.Substring(0, idx + 2) + pData.strBui1 + msg.Substring(idx + 2);   // ← +2
} else {
    msg = msg.Substring(0, idx) + pData.strBui1 + msg.Substring(idx);
}
txtValue.Text = msg;
txtValue.Focus();
txtValue.SelectionStart = idx + (pData.strBui1 != null ? pData.strBui1.Length : 0);  // ← không bù 2
```

Nhánh trên dời **điểm chèn** đi 2 ký tự (CRLF); dòng cuối không cộng bù. Suy ra: ở nhánh
đó con trỏ lùi đúng 2 ký tự so với cuối cụm 部位 vừa chèn, tức nằm **giữa** cụm glyph.

Ba mốc đọc được từ source, đã đối chiếu lại khi viết luồng này:

| | |
|---|---|
| `SelectionStart` đếm `\r\n` là **2** ký tự | chính tác giả app khẳng định: `btnDummy_Click` chèn `NewLine` rồi `SelectionStart = idx + 2` (`:372-374`) |
| `strBui1` = **省略表示** | `frm902003.btnEntry_Click` nhánh `PatMsg` gọi `getBui()` → `buiData.InputType.OmitDisp` (`frm902003.cs:415-416`, `:939`) — cùng thứ mà `GET /tenant/bui/omit-disp` của web port |
| lần chèn **thứ hai** rơi vào nhánh `else` | nhưng **không phải** vì `idx` hết khớp: lúc đó `idx = base + bui1.Length` và `Text.Length - 2` cũng đúng bằng thế ⇒ **vế đầu VẪN TRUE**, chỉ phép so `Substring(idx, 2) == NewLine` mới đẩy nó xuống `else`. Chú thích ở dòng 507-508 của spec Playwright nói nhẹ hơn thực tế chỗ này. |

---

## 3. ☠ Bốn phím là 確定 — và đó là lý do luồng này không ghi DB

`fixProc` (`:1348-1387`) gọi `fixCmt2()` cập nhật `use_cnt` của `mst_cmt2` rồi
`this.Close()`. Bốn đường dẫn tới đó:

| Phím | Đường | Nguồn |
|---|---|---|
| `F9` | `formBase_KeyDown` → `btnF9_Click` → `fixProc` | `frm203012.cs:164-166` |
| `End` | như trên — **không phải** 「về cuối dòng」 | `:167-169` |
| `Escape` | như trên — **không phải** 「huỷ」 | `:170-172` |
| `Enter` | `txtValue_KeyDown` → `fixProc` (khi chuỗi hết dấu `*`) | `:339-342` |

Ba phím đầu do `formBase_KeyDown` bắt ở **tầng form** (`BaseDialog.KeyPreview = true`,
`BaseDialog.cs:139`) nên chúng ăn bất kể control nào đang giữ tiêu điểm, và
`switch (e.KeyCode)` không nhìn phím bổ trợ ⇒ **`Ctrl+End` cũng là 確定**.

Vì vậy bộ test:

* dựng trạng thái bằng **`ValuePattern.SetValue`** — không sinh phím nào;
* dời con trỏ bằng **`Ctrl+Home` + mũi tên** — không bao giờ `End`;
* đóng màn bằng **`F10 戻る`** (`BaseDialog.cs:308`).

Không SetValue được thì fixture **Ignore**, chứ không lấy Enter làm đường thay thế.

> **Enter là câu hỏi riêng, không phải bước chuẩn bị.** `AcceptButton` được đặt bằng
> `btnDummy` (`:399/409/419`) và `btnDummy_Click` thì **chèn xuống dòng** (`:369-377`) —
> ngược hẳn với `txtValue_KeyDown`. Cái nào thắng phụ thuộc `AcceptsReturn` của
> `CustomTextBox` và thứ tự dialog-key của WinForms; đọc source không phân xử được. Nó nằm
> sau cờ `karteCmt.allowConfirm` và chỉ probe mới hỏi tới (KQ-11).

---

## 4. Đo output, không đo caret

Không có chỗ nào ở đây đọc `SelectionStart`. Hai lý do:

1. Cả repo chưa dùng `TextPattern` lần nào, và trình cung cấp text của WinForms `TextBox`
   qua cầu MSAA→UIA không đáng tin — một phép đo trả 0 vì pattern vắng mặt trông y hệt một
   phép đo trả 0 vì con trỏ thật ở 0.
2. Thứ quyết định việc port là **chuỗi đầu ra**. Con trỏ chỉ lộ thành output ở hai chỗ:
   gõ thêm một ký tự (TC-4), hoặc bấm F1 部位 lần nữa (TC-5).

Con trỏ ở bước **dựng trạng thái** cũng được kiểm theo cách đó: gõ `Z` rồi đọc chuỗi —
`ABCZ␍␊` nghĩa là con trỏ ở 3 (đúng nhánh), `ABC␍␊Z` nghĩa là nó ở dòng trống (nhánh
`else`, không tái hiện được lỗi).

---

## 5. Vì sao fixture assert không so với một chuỗi cứng

Viết `Assert.That(text, Is.EqualTo(<chuỗi WinForm suy ra từ C#>))` lúc chưa đo lần nào
chính là 「viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu」 — đúng cái
[`PROBE-GUIDELINE.md`](../../../../PROBE-GUIDELINE.md) cấm.

Nên TC-4 và TC-5 assert một mệnh đề **yếu hơn nhưng chắc chắn**: chuỗi đo được phải khớp
**một trong hai** công thức đang tranh nhau — rồi ghi lại khớp cái nào. Nó không thể xanh
giả (chỉ xanh khi mô hình suy luận đúng), và phía nó khớp chính là câu trả lời.

Những mệnh đề **thật sự** suy ra được thì vẫn assert cứng:

| TC | Khẳng định | Vì sao assert cứng được |
|---|---|---|
| TC-1 | ô text = `ABC␍␊`, con trỏ ngay trước `␍␊` | điều kiện của nhánh, tự kiểm bằng cách gõ `Z` |
| TC-2 | 省略表示 dài ≥ 2 và hai preset khác nhau | tiền đề để hai công thức phân biệt được nhau |
| TC-3 | text sau lần chèn đầu = `ABC␍␊` + 部位 | **cả hai phía cùng kết quả** — và là tiền đề của #3b |
| TC-4 | khớp công thức WEB **hoặc** WinForm | ← câu trả lời |
| TC-5 | khớp công thức WEB **hoặc** WinForm | ← câu trả lời |
| TC-6 | đối chứng: con trỏ ở dòng trống ⇒ hai phía giống nhau | nhánh `else`, công thức con trỏ ở đó là đúng |

**TC-6 là mốc đối chứng, đừng bỏ.** Không có nó thì giả thuyết 「app chèn kiểu đó ở *mọi*
trường hợp」 vẫn sống, và TC-4/TC-5 lệch không chứng minh được là do **nhánh**.

---

## 6. Rủi ro lớn nhất: hai bên có cùng một 省略表示 không?

TC-2 in ra 省略表示 thật của cả hai preset, dạng escape `\uXXXX`:

```
TC-2 F3 ３～３ ⇒ 省略表示 = "" (6 ký tự)
```

**Phải so tay** với dòng `[#3b] 省略表示 …` mà spec Playwright in ra. Bên web lấy chuỗi từ
`GET /tenant/bui/omit-disp`, bên này từ `buiData.getBui` đọc thẳng SQL Server; hai bên ra
khác chuỗi thì **không so được kết quả với nhau**, và câu hỏi 「có port bug không」 chưa đặt
ra được. Bộ test không tự kiểm điều này được — nó chỉ chạy được một phía.

> 省略表示 dùng ký tự **EUDC** (private-use `U+E000…U+F8FF`): in thẳng ra terminal thì
> **không thấy gì**, và hai chuỗi khác nhau trông y hệt nhau. Mọi chuỗi trong luồng này đi
> qua `Txt.Vis` trước khi in — đối chiếu **theo mã**, không theo hình. Và tuyệt đối không
> đi qua `Txt.N`: nó NFKC + biến `\r\n` thành dấu cách, tức xoá sạch đúng bằng chứng.

---

## 7. Tiền đề

* Ngày test phải **có sẵn dòng 処置** trong lưới: F6 đọc `grdRegi.CurrentCellAddress.Y`
  (`frm203002.cs:4719`) nên lưới rỗng thì không đặt được con trỏ lên dòng nào.
* Bệnh nhân test còn đủ răng cho preset ３～３: `歯牙情報` loại hết răng thì `getBui` trả
  chuỗi rỗng, app không chèn gì, và fixture **Ignore** (chuyện dữ liệu của máy, không phải
  app sai).
* `mst_cmt2_grp` có ít nhất `karteCmt.groupNo` dòng — nút group vượt quá số dòng bị
  `Visible = false` (`frm203011.cs:200-207`) nên **không có trong cây UIA**. Không thấy nút
  thì đổi `karteCmt.groupNo`, đừng sửa code.

## 8. Hai form trùng tiêu đề

`frm203011` và `frm203012` (gType `Cult`) **cùng mang tiêu đề 「カルテ記載選択」**
(`frm203012.cs:54`). `KarteAutoCalcDialog.FindDialogWindow` thử `app.WindowByTitle(...)` ở
đường thứ hai, nên truyền tiêu đề đó vào là có ngày bắt nhầm form cha. `KarteCmtDialog`
khớp theo `AutomationId`, và khi phải rơi xuống tiêu đề thì kiểm thêm đặc điểm phân biệt:
`frm203012` **có** `txtValue`, `frm203011` **không**. (Bản Playwright vấp đúng chỗ này —
xem 「bẫy 1」 trong doc-comment của spec.)
