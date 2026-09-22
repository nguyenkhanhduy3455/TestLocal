# CodeEntryFailPaths — hai nhánh THẤT BẠI của `GetTrtmasCod`

Nguồn yêu cầu: hai nhánh §B2 cố ý chưa sửa trong
`userapp/fla-ui-todo-inp-legacy-sync-20260921.md`.
Nguồn chân lý: `modMain.cs:501-693` (`GetTrtmasCod`), `frm203002.cs:5587-5618`,
`frm203016.cs:373-377, 831-884`.

Caller xử lý `ret == false` bằng:

```csharp
grdRegi.EndEdit();
hFG1.CurrentCell.Value = "";        // ← XOÁ Ô ĐANG ĐỨNG   (frm203002.cs:5605-5607)
```

**CHỈ ĐỌC** — không seed, không bấm F9 登録. Mọi thay đổi chỉ nằm trong lưới đang mở.

---

## 1. Kết quả — cả hai nhánh đều KHÁC dự đoán ban đầu

| ca | tình huống | kết quả đo |
|---|---|---|
| `TCF_10` | huỷ 処置選択 trên dòng **đã có 処置** | 点 thành **chính mã vừa gõ** (150 → 116) |
| `TCF_11` | huỷ 処置選択 trên dòng **trống** | 点 **rỗng** |
| `TCF_20` | mã **50 (笑気/IS)** trên dòng đã có 点数 | N2O/O2 **giữ** 点数; **dòng gốc bị xoá** 点数 |

### 2026-09-22 · bệnh nhân **4** · 診療月 2026-06 ngày 3 · cổng 1434 · app build 2026-09-21

---

## 2. Nhánh ② — huỷ 処置選択

`functionReturnValue` được đặt **`true`** ở `modMain.cs:584` sau khi tra master xong. Đoạn
`:688-690` chỉ **hạ cờ có điều kiện**:

```csharp
if (string.IsNullOrEmpty(hFG1[6, CurrentCellAddress.Y].Value.ToString()))
    functionReturnValue = false;
```

Cột 6 là `TRT_CD` của **dòng đang đứng** ⇒ kết cục phụ thuộc dòng đó đã có 処置 chưa:

| dòng | `hFG1[6]` | `ret` | caller làm gì | 点 |
|---|---|---|---|---|
| đã có 処置 | khác rỗng | **true** | `txtInp.Text = hFG1[3,Y]; Move_Cell(Right)` | **= mã vừa gõ** |
| trống | rỗng | false | `EndEdit(); CurrentCell.Value = ""` | **rỗng** |

### ⛔ Vì sao dòng đã có 処置 lại ra CHÍNH MÃ VỪA GÕ

Nhánh `true` **không** gọi `EndEdit`. Và ngay tại đó có comment của chính tác giả:

```csharp
//処置選択にて、hFG1[3, …].Value にセットしているが、
//Move_Cell 呼出した後、txtInp.Text の値に戻ってしまう為、暫定対応
txtInp.Text = hFG1[3, hFG1.CurrentCellAddress.Y].Value.ToString();   // frm203002.cs:5597
Move_Cell(eMovePoint.Right);
```

Text của editor **thắng** giá trị ô sau `Move_Cell`. Bản vá tạm ấy chép giá trị ô vào
`txtInp.Text` — chỉ đúng khi picker **được chốt** (lúc đó `hFG1[3]` đã là 点数 mới). Khi picker
bị **huỷ**, `hFG1[3]` chưa đổi nhưng editor vẫn giữ mã vừa gõ ⇒ commit ra con số mã.

**Hệ quả:** gõ nhầm mã rồi huỷ picker trên một dòng đã có 処置 ⇒ 点数 dòng đó bị thay bằng con
số mã. Chưa lưu (cần F9), nhưng bấm F9 là thành dữ liệu sai.

---

## 3. Nhánh ① — mã 50 (笑気/IS)

`modMain.cs:542-552` mở `frm203016` rồi `return functionReturnValue` mà **chưa bao giờ gán**
(khởi tạo `false` ở `:503`) ⇒ **luôn** `false` ⇒ caller **luôn** chạy nhánh xoá.

Nhưng `frm203016` ở chế độ `_flg50` (`frm203016.cs:373-377`) làm, cho cả N2O và O2
(`:831-884`):

```csharp
frmInpMain.AddRow();                                          // chèn dòng MỚI
grdRegi[3, CurrentCellAddress.Y].Value = n2oScore;            // ghi 点 vào dòng mới
grdRegi.CurrentCell = grdRegi[X, CurrentCellAddress.Y + 1];   // DỜI con trỏ xuống
```

Hai dòng IS được chèn vào **vị trí hiện tại** và đẩy dòng gốc **xuống 2 bậc**; con trỏ dừng
lại đúng **dòng gốc**. Nên cú xoá của caller đánh trúng nó:

```
TRƯỚC:  [34] ペリオクリン 0.5g(3シリンジ) | 150 | 1
        [35] [負担金 1190円]  [日計 1189点]

SAU:    [34] N2O 0.6288 |   3 | 5          ← dòng mới, GIỮ 点数
        [35] O2  0.3068 |   2 | 5          ← dòng mới, GIỮ 点数
        [36] ペリオクリン 0.5g(3シリンジ) | (rỗng) | 1   ← 150 BỊ XOÁ
        [37] [負担金 1090円]  [日計 1094点]
```

⇒ **Cú xoá KHÔNG đè lên số dialog vừa ghi** — nó xoá **点数 của dòng gốc**.

**Hệ quả:** nhập 笑気 khi con trỏ đang đứng trên một dòng **đã có 点数** thì dòng đó **mất
trắng 点数**. Chưa lưu, nhưng bấm F9 là mất dữ liệu thật.

### Dữ kiện phụ

| | |
|---|---|
| `MST_TRT266` | **không có dòng nào** cho `TRT_CD = 50` — mã ảo, `frm203016` tự dựng 2 dòng `50/0 N2O使用リッター数`, `50/1 O2使用リッター数` |
| `INPCONFIG.IS_AUTO_FLG` | **1** (bật). Nếu = 0 thì `frm203016.cs:407` `return` sớm, không hiện ô nhập lít ⇒ hành vi khác hẳn, ca đo mất nghĩa |
| thao tác | `txtVal` (N2O) → Enter → `txtVal2` (O2) → Enter; `txtVal2_KeyDown` gọi `setIS` rồi dialog tự đóng (`frm203016.cs:323-338`) |

---

## 4. Với vế web: ba trạng thái, không phải hai

Ghi chú gốc §B2 so cặp 「WinForm xoá trắng」 ↔ 「web giữ 点数 cũ」. Thực tế WinForm có **ba**
kết cục khác nhau tuỳ đường:

| đường thất bại | WinForm |
|---|---|
| E00100 (mã 999, không có 印象) | **xoá trắng** ô 点 — xem `Tests/MisoutyakuE00100` |
| huỷ 処置選択, dòng **đã có 処置** | ô 点 = **mã vừa gõ** |
| huỷ 処置選択, dòng **trống** | **xoá trắng** |
| mã 50 (IS) | xoá trắng **dòng gốc**, hai dòng IS mới giữ nguyên 点数 |

⇒ Không thể port bằng một luật chung 「mọi đường thất bại đều xoá ô 点」. Phải tách theo đường.

---

## 5. `IS_AUTO_FLG = 0` — lỗ hổng cuối của §B2, nặng hơn cờ = 1

`frm203016` ở chế độ `_flg50` **`return` sớm** khi cờ tắt (`frm203016.cs:407`) ⇒ không hiện ô
nhập lít ⇒ `_is2[0]`/`_is2[1]` rỗng ⇒ `setIS` bỏ qua cả khối N2O (`:831`) lẫn O2 (`:857`) ⇒
**không** `AddRow()` nào, con trỏ **không** bị dời.

Nhưng `btnF9_Click` vẫn chạy: `chkInputArea()` chỉ chặn 179/5, 202/x, 203/x, 17 — **mã 50
không nằm trong đó** ⇒ `setPacData` + `fixProc`, mà `fixProc` gọi `frmTrtSel_Let_Trt_Data`,
tức **đường ghi của 処置選択 bình thường: GHI ĐÈ dòng đang đứng**.

### 2026-09-22 · bệnh nhân 4 · 2026-06-03 · **XANH** (đã xác nhận lại 2 lượt)

```
ô nhập lít 「txtVal」 : KHÔNG CÓ          ← mốc trực tiếp của cú return sớm

TRƯỚC: [34] ペリオクリン 0.5g(3シリンジ) | 150 | 1
SAU  : [34] N2O使用リッター数            | (rỗng) | 0
       dòng gốc 「ペリオクリン…」          : ĐÃ BIẾN MẤT
```

| cờ | 確定 làm gì | dòng gốc |
|---|---|---|
| **1** | `setIS` → `AddRow()` ×2, dời con trỏ | mất **点数** (150 → rỗng) |
| **0** | `fixProc` → `frmTrtSel_Let_Trt_Data` → **ghi đè dòng đang đứng** | mất **cả 処置** |

⚠️ **Cờ 0 nặng hơn**: không chỉ mất 点数 mà 処置 gốc bị **thay thế hoàn toàn** bằng dòng
placeholder của dialog. Chưa lưu (cần F9), nhưng bấm F9 là mất dữ liệu thật.

### Đổi cấu hình — không phải seed dữ liệu

`INPCONFIG` chỉ có **MỘT** dòng và áp cho **toàn app**. Cờ riêng
`codeEntryFail.allowConfigChange` (mặc định tắt), chụp/in/trả lại rồi **đọc lại để khẳng
định**. Nếu lượt chạy đứt giữa chừng:

```sql
UPDATE INPCONFIG SET IS_AUTO_FLG = 1
```

---

## 6. Chạy

```powershell
.\run-code-entry-fail-paths.ps1 -Case TCF_10   # huỷ picker, dòng ĐÃ CÓ 処置
.\run-code-entry-fail-paths.ps1 -Case TCF_11   # huỷ picker, dòng TRỐNG
.\run-code-entry-fail-paths.ps1 -Case TCF_20   # mã 50 (IS), IS_AUTO_FLG = 1
.\run-code-entry-fail-paths.ps1 -IsAutoOff     # mã 50 với IS_AUTO_FLG = 0 (ĐỔI CẤU HÌNH)
```

Mỗi ca ~35-45 giây. Chạy riêng từng ca (F7) — ca trước làm đổi lưới, ca sau chọn lại dòng
mốc theo 点数 > 0 nên chạy chung một lượt là chọn phải dòng đã bị ca trước sửa.

⚠️ Điều kiện chờ phải là 「**dòng CUỐI** của `runner.log` là `runner-task END`」, không phải
「trong vài dòng cuối **có** `END`」 — `schtasks /run` trả về ngay, lượt mới mất vài giây mới
ghi `START`, nên vòng chờ kiểu `Tail 5 | grep END` thấy ngay `END` của **lượt trước**.
