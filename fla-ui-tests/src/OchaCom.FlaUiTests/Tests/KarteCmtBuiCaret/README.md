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

## 1b. ĐÃ ĐO — kết quả (2026-09-07, `ochacom-win`, BN 10 / 2026-08-03)

**Cả hai phép đo then chốt đều KHỚP CÔNG THỨC WINFORM. Báo cáo #3b đúng, và đúng cả ở chi
tiết. Đề xuất A có căn cứ.** Fixture assert: **6/6 xanh**.

```
=== KQ-VERDICT === TC-4 gõ 「X」 sau khi chèn 部位: WINFORM
=== KQ-VERDICT === TC-5 F1 部位 lần thứ hai:        WINFORM
```

省略表示 đo được trên WinForm — **trùng khít từng codepoint** với con số bản web in ra
(spec #3b: 「3≁3」 6 ký tự, 「全顎」 15 ký tự), nên hai bên **so được với nhau**; đây là rủi
ro lớn nhất của cả việc so sánh và nó đã được gỡ:

```
F3 ３～３  = \ue0a9\ue0af\ue0b2\ue0af\ue0a9\ue0a3                               (6)
F7 全顎    = \ue11f\ue122\ue127\ue12a\ue12e\ue12f\ue132\ue142
             \ue132\ue12f\ue12c\ue128\ue125\ue122\ue11f                        (15)
```

| Phép đo | WinForm đo được | Kết luận |
|---|---|---|
| lần chèn đầu | `ABC␍␊` + 部位 | nhánh 「nhảy qua newline」 — **đúng tiền đề #3b**; web ra y hệt nên nhìn bước này không phát hiện được gì |
| **gõ `X` sau đó** | `ABC␍␊` `\ue0a9\ue0af\ue0b2\ue0af` **`X`** `\ue0a9\ue0a3` | **WINFORM** — `X` chen vào giữa cụm, sau ký tự thứ 4/6 |
| **F1 部位 lần hai** | `ABC␍␊` `\ue0a9\ue0af\ue0b2\ue0af` **`全顎(15)`** `\ue0a9\ue0a3` | **WINFORM** — chuỗi 2 chen vào giữa chuỗi 1, đẩy 2 ký tự cuối ra sau |
| đối chứng (caret ở dòng trống) | `ABC␍␊` + 部位 + `X` | `X` ở cuối — hai phía **giống nhau** ⇒ lệch ở trên là **do NHÁNH** |

Chuỗi `X` đo được trùng đúng chuỗi mà spec Playwright *dự đoán* cho WinForm
(`"ABC\n\ue0a9\ue0af\ue0b2\ue0afX\ue0a9\ue0a3"`, khác mỗi `\r\n` ↔ `\n` như dự
kiến).

> **Một chỗ WinForm KHÁC web, ngoài dự đoán:** mở lại 部位選択 lần hai thấy **0 răng** còn
> đánh dấu — form dựng lại sạch mỗi lần. Bên web thì 「bẫy 3」 của spec ghi rõ là **có nhớ**
> (`open=` không unmount cây). Luồng này vẫn bấm 全消去 mỗi lần: mất nó thì phép đo phụ
> thuộc vào đúng một hành vi vừa được chứng minh là khác nhau giữa hai bản.

> Câu hỏi Enter (KQ-11) **vẫn chưa đo** — cần `-AllowConfirm`, và nó có thể ghi
> `mst_cmt2.use_cnt`. Không cần cho kết luận trên.

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

## 8. ☠ `ToothSelectDialog.Find` không thấy 部位選択 ở đường này (đo 2026-09-07)

Ba form của luồng — `frm203011`, `frm203012`, **và cả `frm902003`** — đều **không phải
top-level**. `app.Windows()` chỉ trả về đúng một cửa sổ `frm203002`; tất cả nằm trong
**cây** của form chính. Mà cả ba đường của `ToothSelectDialog.Find` đều giả định hộp thoại
là top-level hoặc là `ModalWindows` của cửa sổ chủ được truyền vào — nên nó trả `null`.

Cái nguy hiểm là **thông điệp lỗi khi đó đổ oan cho app**. Lượt đo đầu tiên báo
`F1 không mở được 部位選択`, trong khi sự thật là nó **mở rồi**: ngay bước sau
`ValuePattern.SetValue` lên `txtValue` ném `ElementNotEnabledException` — WinForms vô hiệu
hoá form cha khi có modal. Đúng bẫy **PROBE-GUIDELINE 3.4**.

Đã sửa hai chỗ:

* `KarteCmtDialog.FindToothDialog` thử **bốn** đường — `ToothSelectDialog.Find` với chủ là
  `frm203012` rồi `frm203002`, sau đó lục cây bằng `KarteAutoCalcDialog.FindNested` (BFS có
  chặn số nút, **bỏ qua cây lưới** — lưới 処置 hàng nghìn dòng);
* không tìm thấy thì `PickBui` **hỏi `IsEnabled` của `txtValue` trước khi kết luận**, và
  phân biệt rõ 「có modal chắn」 với 「phím không tới nơi」. Trường hợp đầu nó gửi `F12`
  gỡ kẹt — `F12` là 戻る của `frm902003` và là **phím chết** trên `frm203012`
  (`BaseDialog.formBase_KeyDown` không có `case Keys.F12`), nên gửi mù được mà không sợ
  lạc sang 確定.

> `PerioKensaOrderFlow` / `SigaToothFlow` gọi `ToothSelectDialog.Find` bình thường được vì
> ở đó 部位選択 mở **từ `frm203002`**. Khác đường mở, khác chỗ nằm trong cây.

## 8b. ☠☠ Phím F gửi bằng `FocusWindow` + `SendKey` rơi vào NHẦM FORM (đo 2026-09-07)

Đây là cái bẫy đắt nhất của luồng, và **chỉ tấm ảnh mới nói ra sự thật**.

`frm203011` và `frm203012` **chồng lên nhau trong cùng một cửa sổ top-level**. Ảnh
`06_F1 部位…png` cho thấy hai thanh phím cùng nằm trên màn hình một lúc:

```
   góc trái dưới   「F1 病検」    ← của frm203011
   giữa dưới       「F1 部位」    ← của frm203012
```

`ToothSelectDialog.FocusWindow(cmtList)` gọi `ForceForeground` lên handle của form con —
việc đó **không quyết định được form nào nhận phím**. Kết quả đo: `SendKey(F1)` rơi vào
**frm203011**, nơi F1 là 「病検」, nên app mở **歯周基本検査 (`frm203028`)** chứ không mở
部位選択. Log lúc đó báo `F1 không mở được 部位選択` — **đổ oan cho app**.

Và hậu quả không dừng ở một phép đo hỏng. Bấm F1 lần nữa ⇒ `frm203011` gọi `showDialog`
lên một form **đang visible** ⇒ app không bắt ⇒ hộp thoại crash
**`Form that is already visible cannot be displayed as a modal dialog box`** (đúng lỗi đã
ghi ở `PerioKensaOrderFlow.OpenSettings`), và mọi bước sau đó đo trên một app đã hỏng.

**Cách đúng — `KarteCmtBuiFlow.PressFKey`:** click thẳng vào **nút trên thanh phím của
chính form đó** (nút nằm trong cây con của form nên không thể nhầm), luôn kiểm rect trước
khi bắn chuột. Chỉ khi không thấy nút mới quay về đường phím, và khi đó phải focus một
**control BÊN TRONG** form chứ không phải cửa sổ.

> Đây cũng là lý do các bước **gõ chữ** chạy đúng ngay từ đầu còn các bước **gửi phím F**
> thì không: `FocusTextBox` focus `txtValue` — một control bên trong `frm203012`.

⚠️ Nếu 歯周基本検査 lỡ mở, `ClosePerioExamIfOpen` đóng nó bằng **F10 戻る**. Tuyệt đối
không gửi F1 vào form đó: F1 của `frm203028` là 「デフォルト設定」, `btnF1_Click` hỏi
`Q00002` rồi `setDefalut()` **ghi `kihon_def`**.

## 9. Hai form trùng tiêu đề

`frm203011` và `frm203012` (gType `Cult`) **cùng mang tiêu đề 「カルテ記載選択」**
(`frm203012.cs:54`). `KarteAutoCalcDialog.FindDialogWindow` thử `app.WindowByTitle(...)` ở
đường thứ hai, nên truyền tiêu đề đó vào là có ngày bắt nhầm form cha. `KarteCmtDialog`
khớp theo `AutomationId`, và khi phải rơi xuống tiêu đề thì kiểm thêm đặc điểm phân biệt:
`frm203012` **có** `txtValue`, `frm203011` **không**. (Bản Playwright vấp đúng chỗ này —
xem 「bẫy 1」 trong doc-comment của spec.)
