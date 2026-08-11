# Luồng ParitySaveData — xác minh bug parity của `modSave.SaveData`

Chạy: **`.\run-save-treatment-data.ps1`** (ở thư mục gốc `fla-ui-tests`), **không** dùng
`run-all-tests.ps1`.

---

## 1. Luồng này để làm gì

Bản web đã port **NGUYÊN** 5 hành vi **SAI** của WinForm. Nhưng tới giờ kết luận chỉ dựa
trên **đọc source**. Nếu đọc sai thì bản web đang tái tạo một cái sai **không tồn tại**,
và bộ e2e Playwright đang khoá chặt cái sai đó lại.

Luồng này chạy WinForm thật để trả lời: **cái bug đó có thật không?**

Bối cảnh đầy đủ từng bug: `userapp/winform-parity-verification-guide.md`.
Bảng quyết định: `userapp/inp-p0-open-issues.md`.

---

## 2. ⚠️ Luồng DUY NHẤT ghi xuống DB

Mọi fixture khác trong project cố ý không bao giờ bấm F9 (xem chú thích đầu
`Screens/TreatmentEntryScreen.cs`) — nhờ vậy không cần dọn dẹp, đóng app là sạch.

Luồng này **buộc phải** bấm, vì mọi bug cần xác minh đều nằm trong `SaveData`.

> **F9 ghi lại TOÀN BỘ 処置行 của tháng đó** — xoá rồi chèn lại, `disp_no` đánh số lại
> từ 1. **Trỏ `patient.patNo` vào bệnh nhân TEST.**

Nên nó bị khoá sau một cờ, mặc định tắt. Chưa bật thì **cả fixture tự bỏ qua ngay,
không tốn công mở app** (`FixturePreflightSkipReason`).

```jsonc
// src/OchaCom.FlaUiTests/testsettings.local.json
{
  "db": {
    "enabled": true,
    "connectionString": "Data Source=<SERVER\\INSTANCE>;Initial Catalog=SIM2000;User ID=sa;Password=<mk>;TrustServerCertificate=True"
  },
  "parity": { "allowSave": true },
  "patient": { "patNo": "<BENH NHAN TEST>" }
}
```

Chuỗi kết nối: copy y nguyên từ `<DbConnectString>` trong `C:\NEW_SIM2000\Ocha.xml` —
đó chính là chuỗi app đang dùng.

---

## 3. Tệp trong luồng

| Tệp | Vai trò |
|---|---|
| `Bug2dConcurrentSaveTests.cs` | 3 testcase cho BUG-2d |
| `SaveFlow.cs` | Lái chuỗi hộp thoại F9 → 保存しますか → 上書きしますか |
| `OchaDbParity.cs` | Truy vấn **CÓ GHI** (tách khỏi `Data/OchaDb.cs` vốn hứa chỉ đọc) |
| `BuiDialogDiagnosticsTests.cs` | Công cụ chẩn đoán, `[Explicit]` |

Thứ dùng chung cho mọi luồng thì **không** để ở đây: `Infrastructure/TestTrace.cs`
(nhật ký + ảnh từng bước) và hook `UiTestBase.FixturePreflightSkipReason`.

---

## 4. BUG-2d — không cần máy thứ hai

Trên giấy bug này cần 2 máy. Nhưng `CompareTrntrnData` (modSave.cs:5176) chỉ làm một
việc: đọc lại TRNTRN của tháng rồi so với ảnh chụp `trtDataListCur` lấy lúc mở màn.
**Nó không quan tâm ai gây ra thay đổi.**

Nên một câu UPDATE thẳng vào DB trong lúc màn hình đang mở là **tương đương hoàn toàn**
với "máy khác vừa bấm F9" — `OchaDbParity.SimulateRemoteSave` dời `disp_no` +1000 rồi
hoàn tác ở teardown (kể cả khi test đỏ; hoàn tác lỗi thì nó in sẵn câu SQL chạy tay).

> **Thứ tự bắt buộc**: mở màn hình **trước**, rồi mới giả lập. Đảo lại thì app đọc luôn
> trạng thái mới và không có xung đột nào cả.

### Ba testcase

| | Kiểm gì |
|---|---|
| `Tc2d0` | (mốc) tháng test có ≥1 dòng đã lưu — không có thì tự tạo bằng UI |
| `Tc2d1` | 🐛 chọn 「いいえ」: DB **không đổi**, nhưng **màn hình vẫn đóng** ← chính là bug |
| `Tc2d2` | (đối chứng) chọn 「はい」 thì ghi đè thật ⇒ hộp thoại không phải đồ trang trí |

`Tc2d1` còn kiểm **nút nào đang giữ focus** lúc hộp thoại 上書き mở — WinForm khai
`MsgBoxStyle.DefaultButton2` nên phải là 「いいえ」. Không phải chi tiết trang trí: người
dùng quen Enter, Enter rơi vào 「はい」 là cơ chế tự vô hiệu đúng lúc cần nhất.

**Nếu vế "màn hình đóng" ĐỎ** ⇒ tôi đã đọc sai source, phải gỡ phần port parity đó khỏi
bản web (kèm TC-9 của bộ Playwright đang khoá nó). Đó là kết quả quan trọng nhất, đừng
bỏ qua.

---

## 5. Chưa tự động hoá được

| Bug | |
|---|---|
| BUG-2d | ✅ tự động hoàn toàn |
| BUG-2a — ô 42 đụng nhau | ⛔ cần chọn răng trong dialog 部位選択 |
| BUG-2b — MISOU bị đè | ⛔ cần chọn răng |
| BUG-2c — BNOW không INSERT | ⛔ cần chọn răng |
| ISSUE-1 — mất số dư | ⛔ cần cả luồng 窓口精算 + 会計データ修正 |

Ba cái ⛔ đầu chặn ở **cùng một chỗ**: chọn răng trong `frm902003`. Source chỉ lộ
`lblScBui*` / `lblSrBui*`, mà đó là **marker phủ lên sơ đồ** (スケーリング / SRP), không
phải nút chọn răng. Viết locator mò cho cửa sổ chưa từng thấy cây UIA chỉ tạo ra một
lượt chạy đỏ vô ích.

### ✅ Đã có cây UIA của `frm902003` — giải mã 2026-08-10

Chạy `.\run-save-treatment-data.ps1 -Diagnostics` (2/2 passed, 139 phần tử).

**Mở dialog**: click ô cột `部位` (ô index **1**) của **bất kỳ dòng 処置 nào** —
`grdRegi_CellClick` chỉ đòi cột đúng và `BuiDispFlg != 99`, KHÔNG đòi 処置 phải cần 部位.
Xác nhận thực tế: mở được từ dòng `歯科初診料`.

**32 ô răng** = `Pane id="buiLabel{pos}{idx}"`, `pos` 1..4, `idx` 1..8
(`BuiInfo.getControl`, BuiInfo.cs:793-804):

| pos | Vùng | Vị trí trên màn hình |
|---|---|---|
| 1 | 左上 (buiLU) | trên, **phải** tâm (x 965→1154) |
| 2 | 右上 (buiRU) | trên, **trái** tâm (x 918→729) |
| 3 | 左下 (buiLD) | dưới, phải tâm |
| 4 | 右下 (buiRD) | dưới, trái tâm |

`idx` = số răng 1..8, tăng dần **từ tâm ra ngoài**. Nhãn số hiển thị nằm ở
`lblClrBui{pos}{idx}` — dùng để tự kiểm tra locator có trỏ đúng răng không.

> ⚠️ Tâm hàm ở x≈955 (`customLabel13`). Bên **trái** màn hình là **右** của bệnh nhân —
> quy ước sơ đồ răng, đừng đọc ngược.

**Nút** (`pnlButton`):

| id | Nhãn | Dùng làm gì |
|---|---|---|
| `btnEntry` | `End 確定` | xác nhận — **đây là nút chốt**, không phải F9 |
| `btnF8` | `F8 乳歯` | **chuyển sang răng sữa** — cửa vào của BUG-2a/2b |
| `btnF11` | `F11 全消去` | xoá hết, để dựng trạng thái sạch |
| `btnF12` | `F12 戻る` | huỷ |
| `btnUpDel` / `btnDwnDel` | `上顎/下顎 削除` | xoá cả hàm |

### Còn thiếu một mắt xích

Chưa truy ra ánh xạ từ `(pos, idx)` sang **chỉ số phẳng `bui[0..31]`** mà `trn_trn`
lưu và `Let_BNOW` đọc (`rsTrn[i]`). BUG-2a cần đúng `i = 13` và `i = 19` — không có
ánh xạ này thì không biết phải click răng nào.

Đường tra: `BuiInfo.BuiData` (4 mảng 8 phần tử) → `frm902003Param` → `frm203002`
đổ vào `hFG1[i + 8]` (= `bui[i]`, xem modSave.cs:295-297).

Bốn cái còn lại vẫn theo hướng dẫn thủ công trong
`userapp/winform-parity-verification-guide.md`.

---

## 6. Sau khi chạy, gửi lại HAI thứ

1. `C:\OCHACOM_Logs\investigation.log` — lọc `SONTEST1`, log từ **bên trong** WinForm
2. `bin\Debug\net8.0-windows\artifacts\screenshots\<ten-test>\` — nhật ký từng bước +
   ảnh, từ **phía** test

Hai nguồn khớp nhau theo mốc thời gian. Nếu có lệch giữa "test tưởng đã bấm gì" và
"WinForm thực sự chạy nhánh nào" thì đối chiếu là ra.

### Nhật ký từng bước

```
[04]    2.4s  bấm F9 登録
         3.0s  · câu hỏi F9: 「処置データは、変更されています。保存しますか？」
         3.0s  📷 hop-thoai-luu
[05]    3.2s  trả lời 「はい」 cho câu hỏi lưu
         3.9s  · nút đang focus (= nút mặc định): 「いいえ」
         3.9s  📷 hop-thoai-ghi-de          ← ảnh quan trọng nhất
[06]    4.1s  trả lời 「いいえ」 cho câu hỏi ghi đè
[07]    4.3s  chờ xem màn hình 診療入力 có đóng không
         5.0s  · màn hình 診療入力 ĐÃ ĐÓNG
```

Bước nào ném lỗi thì có thêm ảnh `NN_FAIL_<buoc>.png`, chụp **trước** khi lỗi bay lên
(chụp sau thì màn hình thường đã kịp đổi). Câu lỗi khi không tìm thấy nút còn liệt kê
**các nút đang thực sự có**, nên nếu Windows của bạn hiện 「Yes/No」 thay vì 「はい/いいえ」
thì đọc log là biết ngay.

Tắt ảnh từng bước: `run.traceScreenshots = false`.

---

## 7. Bẫy đã vấp

**Lưới đăng ký có thể có vài NGHÌN dòng.** Máy test thật đo được 2864: khi
`診療入力設定` bật `pInpOpt[41]` (`過去データ１画面表示`), `GetTrnRsOld` đổ toàn bộ lịch
sử vào **chính lưới này**. Nên **không được gọi `Grid.RowCount()`** hay bất kỳ hàm duyệt
không giới hạn nào qua cầu UIA — tốn hàng phút cho một dòng log. Luôn truyền `limit:`.

Cùng lý do, khi một testcase đỏ thì `UiTestBase.TearDown` đổ cây UIA của `frm203002` —
với lưới cỡ đó thì bước dọn dẹp cũng chậm. Thấy test "treo" ở cuối thì thường là nó.
