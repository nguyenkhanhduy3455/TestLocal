# GuideReset — nút 「リセット」 của tab ガイド (`cmdGuidReset_Click`)

Cặp parity thứ ba của thư mục này. [`README.md`](./README.md) đo **TAB** (list ガイド, ô
選択№, ba nút), [`GUIDE-DIALOG-README.md`](./GUIDE-DIALOG-README.md) đo **DIALOG**
frm203017; file này đo **MỘT NÚT** — vì nó là nút duy nhất của tab có đường GHI DB, và vì
bản web vừa sửa nó theo suy luận từ source chứ chưa có số đo.

Nửa web: `fix/guide-reset-q00100` của `ochacom-saas-fix`, commit **`adf011470`**
(`treatment-side-panel.tsx` + `__tests__/guide-reset-confirm.test.tsx`), đã merge vào
`demo1` ở `29f34a697`.

> Đọc [`../../../../FLA-UI-GUIDELINE.md`](../../../../FLA-UI-GUIDELINE.md) trước. Mọi số
> trong file này do `GuideResetProbeTests` đo, không cái nào viết theo phỏng đoán.

---

## 1. Chạy

```powershell
.\run-select-guide-treatment.ps1 -Reset -Case TcR0            # dump lưới + TRTSTATE. CHẠY TRƯỚC.
.\run-select-guide-treatment.ps1 -Reset -Case TcR1A           # dòng CÓ 病名 — mốc đối chiếu
.\run-select-guide-treatment.ps1 -Reset -Case TcR1B           # dòng KHÔNG có 病名 — câu hỏi chính
.\run-select-guide-treatment.ps1 -Reset -Case TcR1B -AllowOk  # câu 1.4: bấm OK
```

Mỗi ca **một lô** (F7): một lượt đọc list ガイド tốn ~2 phút nên cả ba ca một lượt sẽ
vượt trần 15 phút của wrapper.

Kết quả: `select-guide-treatment-KQ.txt`, `artifacts\screenshots\<tên ca>\`, và
`artifacts\guide-reset-trtstate.log` — file cuối là **bắt buộc phải đọc**: bản chụp
`TRTSTATE` đầu lượt và kết quả trả lại nằm ở `OneTimeSetUp`/`OneTimeTearDown`, mà hai chỗ
đó **không** vào `.trx` (đo 2026-09-18: mọi dòng `=== KQ-snap ===` / `=== KQ-cleanup ===`
biến mất khỏi `.trx`).

### Ghi DB

`-AllowOk` đặt `OCHA_GUIDE_RESET_ALLOW_OK=1` cho tiến trình con và **chỉ** kịch bản B
(dòng KHÔNG có 病名) được bấm OK. Kịch bản A **cố định không bấm**, kể cả khi bật cờ: ở đó
`setResetData` vào đúng nhánh và `bui{n}[idx] = 0` xoá thật tiến trình STEP.

`GuideResetDb` chụp `TRTSTATE` ở `OneTimeSetUp`, **in ra stdout**, và trả lại theo DIFF ở
`OneTimeTearDown` (F20). Cờ nằm ở biến môi trường chứ không ở `testsettings.json` có chủ
ý — máy Windows đang có bản `TestSettings.cs` sửa dở của luồng khác.

---

## 2. Nguồn WinForm — ba hàm, đọc theo thứ tự này

| Việc | Hàm | Chỗ |
|---|---|---|
| Hỏi Q00100 **vô điều kiện** rồi mới làm | `cmdGuidReset_Click` | `frm203002.cs:6629-6641` |
| Đọc 病名 của **CHÍNH dòng đang có con trỏ** | `StepReset` → `hFG1[40, CurrentCellAddress.Y]` | `:6646-6677` |
| `switch (val)`, mã lạ rơi `default: break;` | `setResetData` | `:6686-6729` |
| `UPDATE TRTSTATE` (thuần UPDATE, **không** INSERT) | `TrtState.updateTrtState` | `TrtState.cs:1677-1690` |
| Nạp lại list, và bật hai nút TRƯỚC khi query | `getGuidNyuryokuInfo2` | `:1991-2017` |
| 病名 cho việc nạp list: **quét NGƯỢC LÊN** tìm 部位病名行 | `getFocusDis` | `:2373-2402` |
| Câu hỏi: template MSGTBL | `MSGTBL.Q00100 = '{0}よろしいですか？'` | DB `SIM2000` |
| Bộ nút + nút mặc định | `MsgDialog.ShowOKCancelMsg` | `MsgDialog.cs:77-91` |

**Chỗ dễ port sai nhất:** 病名 mà `getGuidNyuryokuInfo2` dùng **không** phải 病名 của dòng
đang có con trỏ — `getFocusDis` quét ngược lên tìm 部位病名行 gần nhất **cùng ngày**
(`linekbn == "1"`), và dừng hẳn khi gặp `linekbn == "99"` (tháng cũ). Còn `StepReset` đọc
ĐÚNG dòng đang có con trỏ. Hai hàm chạy liền nhau trong cùng một cú OK mà lấy 病名 từ hai
chỗ khác nhau.

---

## 3. Đo được trên máy thật — 2026-09-18, bệnh nhân 10, 08年08月

### 3.0 Điều kiện đo (khớp thì số mới có nghĩa)

| | Giá trị |
|---|---|
| Bệnh nhân | **10** · 診療日 **2026-08-03** · `patient.openMode = update` |
| `INSURANCE.MED_ST_DT` | 2026-08-03 |
| `TRTSTATE(pat 10)` | `BUI1_4..BUI1_8 = 1081`, mọi ô khác 0 |

Lưới `grdRegi` đọc được 22 dòng (cột ẩn đã bật, mỗi dòng 81 ô), hai khối rõ rệt:

```
[ 0..4 ]  khối 07月                                   linekbn=99   ← getFocusDis DỪNG ở đây
[ 5 ]  日 3   部位「54321(5)」 療法・処置「C」  DIS_CD1=100  linekbn=1   ← KỊCH BẢN A
[ 6..13]  日 3   処置行                          DIS_CD1=100  linekbn=2   (thừa hưởng 病名)
[14 ]  日 3   [負担金 0円] [日計 339点]                     linekbn=10
[15..17]  日 14  処置行, KHÔNG 部位             DIS_CD1=0    linekbn=2
[18 ]  日 14  部位「3(1)」 療法・処置 RỖNG    DIS_CD1=0    linekbn=1   ← KỊCH BẢN B
[19..20]  日 14  処置行                          DIS_CD1=0    linekbn=2
[21 ]  日 14  [負担金 0円] [日計 74点]                      linekbn=10
```

Dòng **[18]** là ca mạnh nhất cho kịch bản B: nó CÓ ô 部位 khác 0 (nên vòng lặp của
`StepReset` thật sự gọi `setResetData`, không bỏ qua) nhưng `DIS_CD1 = 0` nên `val = 0`
rơi vào `default: break;`. Chọn dòng không có 部位 thì 「không ghi gì」 có hai cách giải
thích và phép đo không phân biệt được.

### 3.1 Hộp thoại Q00100 — GIỐNG HỆT ở cả hai kịch bản

```
NGUYÊN VĂN = 該当部位の治療進行状態をリセットします。よろしいですか？
điểm mã    = U+8A72 U+5F53 U+90E8 U+4F4D U+306E U+6CBB U+7642 U+9032 U+884C U+72B6
             U+614B U+3092 U+30EA U+30BB U+30C3 U+30C8 U+3057 U+307E U+3059 U+3002
             U+3088 U+308D U+3057 U+3044 U+3067 U+3059 U+304B U+FF1F
tiêu đề    = お茶コン            (= Application.ProductName)
bộ nút     = [OK | Cancel]
nút giữ con trỏ lúc vừa mở = name=「OK」 id=「1」 type=Button
```

Ba điều chốt được từ chuỗi điểm mã, và **không** chốt được nếu chỉ đọc chuỗi đã làm phẳng:

1. `… U+3059 U+3002 U+3088 …` — 「す」「。」「よ」 **liền nhau**: KHÔNG có ngắt dòng, KHÔNG
   có dấu cách giữa 「…します。」 và 「よろしいですか？」.
2. Dấu cuối là `U+FF1F` — **？ toàn rộng**, không phải `?` nửa rộng.
3. 「よろしいですか？」 do **template MSGTBL** thêm (`Q00100 = '{0}よろしいですか？'`), không
   phải do code nối. Tham số chỉ là `該当部位の治療進行状態をリセットします。`.

### 3.2 Bốn câu, bốn câu trả lời

| # | Câu hỏi | Đo được |
|---|---|---|
| **1.1** | Kịch bản B có bung hộp thoại không? | **CÓ.** Hạn chờ 8s, bung ngay. Giống hệt kịch bản A |
| **1.2** | Nguyên văn | xem 3.1 |
| **1.3** | Bộ nút / nút mặc định / ESC | `[OK \| Cancel]`, **OK mặc định**. ESC ⇒ hộp thoại đóng, list STEP không đổi, `TRTSTATE` **y nguyên** ⇒ ESC = キャンセル |
| **1.4** | Bấm OK ở kịch bản B | `TRTSTATE` **KHÔNG đổi** (`1081×5` trước và sau). Bung thêm **`E00024 「該当ガイドがありません。」`** (tiêu đề お茶コン, bộ nút `[OK]`). List STEP 27 → 27 dòng, **giống hệt** |

### 3.3 Điều KHÔNG ngờ tới: ở dòng không có 病名, list trong chế độ STEP **không phải list STEP**

Vào STEP bằng Shift+F4 ở dòng [18] đã bung `E00024` **ngay**, mà lưới vẫn có **27 dòng**
`検査(Br) / 検査(Per) / 止血シーネ / 扁桃周囲膿瘍 / KP / TFix imp・BT / TFix 修理 / TFix 除去 …`,
và cả ba nút `全て表示 / 前回 / リセット` đều **hiện**.

Cơ chế (đọc source, khớp số đo): `case Keys.F4` đặt `SSTab1.SelectedIndex = 1` **trước**
(`frm203002.cs:4196`) → sự kiện đổi tab chạy `getGuidNyuryokuInfo` — loader **通常**
(`:7076` → `:1974`) — hàm này **GÁN** `DataSource` và ẩn hai nút; rồi mới tới
`getGuidNyuryokuInfo2(con, false, false, false)`, hàm này **bật** hai nút trước khi query
(`:1994-2004`), query STEP với `intTrtS[0] = 0` ra 0 dòng → `E00024` và **không gán lại**
`DataSource` (`:2013`).

⇒ Người dùng thấy: hai nút STEP hiện, `E00024` bung, **lưới là list 通常**.

So với `README.md` mục 4.3 (cùng bệnh nhân, nhưng con trỏ ở dòng CÓ 病名): STEP = **1
dòng** 「検査(C) test 1080」. Hai con số 1 và 27 khác nhau vì **khác dòng**, không phải vì
app đổi hành vi.

### 3.4 Còn dữ liệu nguyên trạng

Kiểm sau lượt chạy bằng query chỉ đọc vào `SIM2000`:
`TRTSTATE(pat 10)` = `BUI1_4..BUI1_8 = 1081`; `TRNTRN(pat 10, >= 2026-08-01)` = đúng 13
dòng như đầu buổi; `INSURANCE.MED_ST_DT` = 2026-08-03. Không ca nào bấm F9 登録.

---

## 4. Bốn điểm LỆCH với bản web (`adf011470` / `demo1`)

| # | WinForm (đo được) | web | Việc phải làm |
|---|---|---|---|
| 1 | Hộp thoại bung **vô điều kiện** | `adf011470` đã sửa đúng chiều | ✅ **GIỮ, đừng revert** |
| 2 | Chuỗi **một dòng**, không `\n` | hardcode `'…します。\nよろしいですか？'` | bỏ `\n`. Và khi đưa Q00100 vào `ja-msgtbl.ts` thì template là `{0}よろしいですか？`, tham số chỉ là câu đầu |
| 3 | `ShowOKCancelMsg` ⇒ **OK/キャンセル**, **OK mặc định**, ESC = キャンセル | `confirmDialog` (はい/いいえ) | đổi sang `confirmDialog.okCancel` + nút mặc định OK; spec e2e đang click `/^(Yes\|はい)$/` phải sửa cùng lượt |
| 4 | Sau OK, nạp lại bằng nhánh **STEP** — `getGuidNyuryokuInfo2(con, false, **false**, false)` | `setGuidSubMode('prv')` ⇒ nhánh **前回**; comment `treatment-side-panel.tsx:373-375` ghi 「with SelPrv=true」 | sửa comment + đổi sang nhánh STEP. **Pre-existing**, không do `adf011470` sinh ra |

Về điểm 4, hai nhánh ra hai câu SQL khác nhau thật trong `modGuid1.pSet_Guid1`:

```
STEP (SelPrv=false) : GUID_CD between 1000..1999 AND (PAC_STEP01..15 = intTrtS[0])
前回 (SelPrv=true)  : GUID_CD = intTrtS[0]
```

Trên bệnh nhân 10 hai list **tình cờ trùng** (cùng 1 dòng 「検査(C) test 1080」) nên spec
hiện tại không bắt được. Muốn khoá nó thì cần một bệnh nhân/部位 mà hai list khác nhau.

Còn **khớp**: `E00024` khi list rỗng (web có `useEmptyGuideAlert` mô phỏng đúng), lưới giữ
nguyên list cũ, và cú OK ở dòng không có 病名 không ghi gì (web bỏ luôn lời gọi BE — hợp
lý, vì BE trả 422 cho `disCd0` đó, mà legacy thì im lặng chứ không báo lỗi).

---

## 5. Cái bẫy đã trả giá trong chính buổi này

**Danh sách nhãn nút truyền cho `MsgBoxWin32.ClickButton` là một TẬP HỢP, không phải thứ
tự ưu tiên.** Hàm đó `EnumChildWindows` — duyệt theo **thứ tự NÚT trên hộp thoại** — và
bấm nút ĐẦU TIÊN có nhãn nằm trong tập (`MsgBoxWin32.cs:94-118`). Hộp Q00100 có
`[OK | Cancel]`, nên một lời gọi gộp
`ClickButton(h, "キャンセル","Cancel","いいえ","No","OK")` bấm **OK**.

Hệ quả đo được: `TcR1A` ghi vào log 「đã bấm キャンセル」 trong khi thật ra đã trả lời OK,
`StepReset` chạy, `TRTSTATE` đi từ `BUI1_4..BUI1_8 = 1081` về **0 hết**. Chỉ bản chụp ở
`OneTimeSetUp` + `Restore` ở `OneTimeTearDown` (F20) cứu lại được — và đó chính là lý do
luồng nào bấm nút có thể GHI DB thì **phải** có ba bước chụp/in/trả lại.

Đây là bẫy **F16**, nhưng F16 chưa nói rõ chuyện thứ tự danh sách vô tác dụng — nên nó tái
diễn. Cách gọi đúng: mỗi nhánh MỘT lời gọi, nhánh mình muốn TRƯỚC, chỉ rơi xuống nhánh kia
khi lời gọi đầu trả `false`:

```csharp
if (ClickButton(h, "キャンセル", "Cancel", "いいえ", "No")) { /* đã huỷ */ }
else if (ClickButton(h, "OK", "はい", "Yes"))              { /* hộp MỘT nút */ }
```

Đã sửa ở `GuideResetProbeTests.Dismiss` **và** ở `GuideSidePanelProbeTests.ClearDialogs`
(bug y hệt, có sẵn trong repo), kèm cảnh báo vào doc-comment của `MsgBoxWin32.ClickButton`.

---

## 6. Chưa đo

| Câu hỏi | Vì sao chưa |
|---|---|
| Kịch bản A bấm OK ghi ĐÚNG những ô nào | Đo được **một lần ngoài ý muốn** (mục 5): `BUI1_4..8` → 0, tức `case 100` → `bui1[idx] = 0` cho đúng slot 3..7 của 部位「54321」. Nhưng đó không phải phép đo có kiểm soát; muốn chốt thì cần một ca riêng có cờ riêng |
| Nhánh 前回 vs STEP khác nhau ra sao trên UI | Cần bệnh nhân/部位 mà hai list KHÁC nhau (xem mục 4 điểm 4) |
| `pInpOpt[39] == 2` đảo hai nhánh 通常/STEP | `frm203002.cs:777`; máy đo đang ở chế độ 1 |
