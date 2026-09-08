# GuideDialog — 「ガイド処置選択」 (frm203017)

Dialog bung ra khi click một dòng ở tab ガイド. Đây là **cặp parity thứ hai** của thư mục
này: luồng cũ ([`README.md`](./README.md)) đo **TAB** (list ガイド, ô 選択№, ba nút), luồng
này đo **CHÍNH DIALOG** — định dạng và các dòng 処置 hiển thị.

Nửa Playwright:
[`../../../../../web-tenant-tests/tests/side-panel/guide-selection-dialog-format.spec.ts`](../../../../../web-tenant-tests/tests/side-panel/guide-selection-dialog-format.spec.ts).

> Đọc [`../../../../FLA-UI-GUIDELINE.md`](../../../../FLA-UI-GUIDELINE.md) trước. Luật **F1**:
> chưa biết app hành xử ra sao thì **chụp ảnh → đọc ảnh → rồi mới viết assert**. Toàn bộ
> số trong file này do `GuideDialogProbeTests` đo, không cái nào viết theo phỏng đoán.

---

## 1. Chạy

```powershell
.\run-open-guide-dialog.ps1 -Probe        # 16 câu hỏi D1..D16, KHÔNG assert
.\run-open-guide-dialog.ps1               # fixture assert TC-D1..TC-D14
.\run-open-guide-dialog.ps1 -Case TcD10
```

Kết quả: `open-guide-dialog-KQ.txt` (các dòng `=== KQ-…`, đọc từ `.trx` nên tiếng Nhật
sạch) + `artifacts\screenshots\<tên testcase>\`.

Bên Playwright:

```bash
cd web-tenant-tests
npx playwright test tests/side-panel/guide-selection-dialog-format.spec.ts
```

**Không testcase nào ghi DB.** Không bấm F9 của frm203017, không bấm F9 登録 của
frm203002, không bao giờ Escape (trên dialog này Escape = `btnF9_Click` = 確定,
frm203017.cs:180).

### Cách đối chiếu hai bên

Cả hai fixture in ra các dòng cùng khuôn:

```
DUMP|win|row|1|135|3|パノラマデジタル|402|1
DUMP|web|row|0|135|3|パノラマデジタル|402|1
```

Lấy `open-guide-dialog-KQ.txt` (WinForm) và stdout của Playwright, cắt phần sau `DUMP|`
rồi diff — đó là bảng parity ở mục 4. Cả hai bên đều NFKC trước khi in (nếu không thì
「ﾃﾞｼﾞﾀﾙ(標)」 và 「デジタル(標)」 đỏ ở mọi dòng vì một khác biệt không có thật).

---

## 2. Nguồn WinForm

| Việc | Hàm / dòng |
|---|---|
| Tiêu đề + kích thước | `_title` `frm203017.cs:77`, `DialogSize = Size3` `:133` |
| Nút F (chỉ F9 確定 / F10 戻る) | `_btnInfo` `:78-92` |
| 9 cột, 5 cột hiển thị + bề rộng | `_viewItem` `:96-104` |
| Chèn dấu cách vào mọi ô | `dgvView_CellFormatting` `:221-232` |
| Click ĐƠN đổi 回数 | `dgvView_CellClick` `:363-388` |
| 「回数」 không sắp xếp được | `initProc` `:418` |
| Header ガイド番号 / 名称 | `initProc` `:428-429` |
| Nền dòng theo nhóm `acc_unit >> 4` | `getViewData` `:1038-1050` |
| Màu chữ コメント (magenta / xanh) | `getViewData` `:1053-1059` |
| Con trỏ về ô 回数 dòng đầu | `getViewData` `:1063-1067` |
| Rỗng 処置 → Q00100 / E00024 rồi tự đóng | `getViewData` `:1001-1024` |
| Escape = 確定 | `formBase_KeyDown` `:180` |
| Mở lại là form MỚI | `Instance` `:113-124` |

---

## 3. Bảng tương ứng testcase

| FlaUI (`GuideDialogTests`) | Đo cái gì | Playwright |
|---|---|---|
| **TC-D1** | tiêu đề 「ガイド処置選択」, nhãn 「ガイド番号」 + 番号 + 名称 | `TC-D1` |
| **TC-D2** | 5 cột, tiêu đề **nguyên văn** 「 ｺｰﾄﾞ」/枝番/処置名称/点数/回数 | `TC-D2` |
| **TC-D3** | bề rộng cột = 65/40/370/70/70 px | `TC-D3` (chỉ so QUAN HỆ, web dùng CSS grid) |
| **TC-D4** | mọi ô số parse được, 処置名称 không rỗng; in trọn danh sách | `TC-D4` |
| **TC-D5** | CellFormatting chèn dấu cách vào mọi ô | *(không có — LỆCH cố ý, xem 4.2)* |
| **TC-D6** | vừa mở: con trỏ ở 「回数 Row 0」 | `TC-D5` |
| **TC-D7** | ↑/↓ đi giữa các ô 回数, clamp ở dòng đầu | `TC-D6` |
| **TC-D8** | click 「処置名称」 sắp xếp, lần hai đảo chiều | `TC-D8` |
| **TC-D9** | click 「回数」 KHÔNG sắp xếp | `TC-D7` |
| **TC-D10** | CLICK ĐƠN làm 回数 +1, vượt trần thì về 0 | `WinForm parity D-a` |
| **TC-D11** | chữ コメント magenta/xanh, 処置 thường đen | `TC-D10` |
| **TC-D12** | nền dòng đổi theo NHÓM, không theo chẵn/lẻ | `WinForm parity D-b` |
| **TC-D13** | chỉ F9 確定 + F10 戻る | `TC-D11` |
| **TC-D14** | đóng bằng 戻る rồi mở lại: 回数 về mặc định | `TC-D12` |
| *(không có)* | ô 回数 chỉ nhận chữ số | `TC-D9` |
| *(không có)* | 回数 rộng hơn 枝番 | `WinForm parity D-c` |

---

## 4. Parity đo được — 2026-09-08

Cùng điều kiện hai bên: **bệnh nhân 12138**, **ngày 2026-09-08**, ガイド ở **dòng 1** của
list 通常 = **ガイド番号 101 「検査(Br)」**.

### 4.1 Bảng so

| # | Điểm đo | WinForm (frm203017) | Web (GuideSelectionDialog) | Kết luận |
|---|---|---|---|---|
| 1 | Tiêu đề | 「ガイド処置選択」 | 「ガイド処置選択」 | **KHỚP** |
| 2 | Cụm header | 「ガイド番号」 + `101` + 「検査(Br)」 | y hệt | **KHỚP** |
| 3 | Kích thước cửa sổ | 700×740 px | 648×618 px | **LỆCH** (cosmetic) |
| 4 | Số cột hiển thị | 5 | 5 | **KHỚP** |
| 5 | Thứ tự cột | ｺｰﾄﾞ・枝番・処置名称・点数・回数 | y hệt | **KHỚP** |
| 6 | Tiêu đề cột 1 | 「 ｺｰﾄﾞ」 (nửa chiều rộng + dấu cách) | 「コード」 (đủ chiều rộng) | **LỆCH** |
| 7 | Bề rộng cột | 65 / 40 / 370 / 70 / 70 px | 70 / 60 / 374 / 60 / 50 px | **LỆCH** ở 枝番 vs 回数 |
| 8 | Dấu cách của CellFormatting | có ở MỌI ô (「135 」「 パノラマデジタル」) | không (canh lề bằng CSS) | **LỆCH cố ý** |
| 9 | Số dòng 処置 | **12** | **11** | **LỆCH — xem 4.3** |
| 10 | Nội dung 11 dòng chung | — | trùng khít cả 5 cột | **KHỚP** |
| 11 | Con trỏ khi vừa mở | ô 「回数」 dòng đầu | ô `<input>` 回数 dòng đầu | **KHỚP** |
| 12 | ↑/↓ | đi giữa các ô 回数, clamp đầu list | y hệt | **KHỚP** |
| 13 | Sắp xếp 4 cột đầu | có, lần hai đảo chiều | có, lần hai đảo chiều | **KHỚP** |
| 14 | Sắp xếp 「回数」 | KHÔNG (NotSortable) | KHÔNG (`enableSorting: false`) | **KHỚP** |
| 15 | Đổi 回数 bằng chuột | **CLICK ĐƠN** (1→0→1→0) | **DOUBLE-CLICK** (click đơn không đổi gì) | **LỆCH** |
| 16 | Nền dòng | đổi theo NHÓM `acc_unit >> 4`: dòng 0-1 trắng, 2-5 RGB(234,246,253), 6 trắng, 7-9 xanh, 10-11 trắng | đổi theo CHẴN/LẺ từng dòng | **LỆCH** |
| 17 | Chữ mã コメント | 7321 → RGB(0,0,255) | 7321 → RGB(21,93,252) | **KHỚP về ý nghĩa**, khác sắc độ |
| 18 | Chữ mã 処置 thường | đen | RGB(23,58,64) (xám rất tối) | **KHỚP về ý nghĩa** |
| 19 | Nút F | `btnF9`「F9 確定」 + `btnF10`「F10 戻る」, không nút nào khác | `F9 確定` + `F10 戻る` | **KHỚP** |
| 20 | Đóng rồi mở lại | 回数 về giá trị CalcCnt | 回数 về giá trị CalcCnt, sort sạch | **KHỚP** |

### 4.2 Ba điểm LỆCH chỉ là hình thức

- **#6** — 「 ｺｰﾄﾞ」 nửa chiều rộng: testcase FlaUI so **NGUYÊN VĂN** (không NFKC) là cố ý.
  Đi qua `Txt.N` thì chuỗi WinForm thành đúng chuỗi web đang hiển thị và điểm lệch biến
  mất khỏi test — đúng cái bẫy 「hàm đọc UI làm phẳng chuỗi ⇒ xanh giả」.
- **#8** — dấu cách của `CellFormatting` là cách WinForm tạo padding khi không có CSS.
  Đừng bắt bản web nhét dấu cách vào dữ liệu.
- **#3, #7** — kích thước và bề rộng cột: WinForm dùng px của Designer, web dùng CSS grid.
  Cái đáng giữ là **quan hệ**: 処置名称 rộng nhất (cả hai đều đúng), 枝番 hẹp nhất
  (WinForm đúng, web thì 回数 mới là hẹp nhất ⇒ `WinForm parity D-c` đỏ).

### 4.3 Điểm LỆCH THẬT — web thiếu một dòng 処置

`pag_trt` của ガイド 101 có 14 dòng; WinForm hiển thị 12, web hiển thị 11. Dòng web đánh
rơi:

```
186 | 0 | 歯槽骨整形手術(AEct) | 110 点 | 回数 1
```

Mười một dòng còn lại trùng khít cả 5 cột, đúng thứ tự (`pag_trt` order):

| # | ｺｰﾄﾞ | 枝番 | 処置名称 | 点数 | 回数 |
|---|---|---|---|---|---|
| 1 | 135 | 3 | パノラマデジタル | 402 | 1 |
| 2 | 135 | 0 | ﾃﾞｼﾞﾀﾙ(標) | 58 | 0 |
| 3 | 7321 | 1 | OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用ｵｰﾗ注Ct1.8ml） | 0 | 0 |
| 4 | 200 | 0 | 伝達麻酔 | 42 | 0 |
| 5 | 7321 | 0 | OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用2%ｵｸﾀﾌﾟﾚｼﾝCt1.8ml） | 0 | 0 |
| 6 | 310 | 3 | OA＋歯科用ｷｼﾛｶｲﾝｶｰﾄﾘｯｼﾞ 1.8mL | 11 | 0 |
| — | **186** | **0** | **歯槽骨整形手術(AEct)** | **110** | **1** | ← **chỉ WinForm có** |
| 7 | 301 | 2 | 処方料 | 42 | 0 |
| 8 | 302 | 0 | 調剤料(内服薬･屯服薬) | 11 | 0 |
| 9 | 302 | 2 | 調剤料(外用薬) | 8 | 0 |
| 10 | 117 | 4 | 薬剤情報提供料 | 4 | 0 |
| 11 | 117 | 5 | 手帳記載加算 | 3 | 0 |

Hai dòng cả hai bên cùng bỏ (`144/0`, `117/0`) là đúng: chúng bị loại bởi dedup nhóm
`FLG2` / `trt_cnt` — hai bên nhất trí.

**Điều kiện lúc đo:** request của web là
`GuidCd=101 TrtDt=2026-09-08 PatNo=12138 Bui=(rỗng) DisCd=(rỗng)` — dòng đang focus trên
lưới không có 部位 lẫn 病名. Fixture FlaUI in `DUMP|win|ctx|bui=…|ryo=…` để đối chiếu
đúng tiền đề đó.

**Nghi can (chưa chốt):** `GuideTrtResolver` (`apps/api/src/Ochacom.Application/Guids/
Resolution/GuideTrtResolver.cs`) có ba nhánh làm rơi một dòng khi 部位 rỗng —
`Flg10 != 0` → `CalcCntService.GetCalcCnt(...) == 0` ⇒ `continue`; `Chk4Service.Chk4`
false; `ToothConditionChecker.ChkSiga` false ⇒ `trtCnt` giữ `-1` ⇒ không thêm vào kết
quả. WinForm với cùng 部位 rỗng vẫn cho 回数 = 1. **Việc tiếp theo:** chạy lại cả hai bên
trên một dòng CÓ 部位 để biết đây là 「lệch chỉ khi 部位 rỗng」 hay 「lệch luôn」.

---

## 5. Chưa đo

| Câu hỏi | Vì sao chưa |
|---|---|
| Nhánh F9 確定 đẩy 処置 vào lưới | Nhánh GHI. Nằm sau một cờ riêng, chưa làm |
| ガイド rỗng 処置 → Q00100 / E00024 | Đã đo ở luồng cũ (`README.md` mục 3, parity 5) |
| 窩洞形態 (`tabGuide`) | ガイド đo được không bật khối đó (`DUMP|win|cavity|shown=False`); cần ガイド trộn 複雑+単純, ví dụ 10020 |
| Sửa 点数 (chỉ mở khi 点数=0 và 自費) | Cần một dòng 自費 có 点数=0 trong list |
| ←/→ trong lưới | WinForm chặn cả hai ở dòng đo được (点数≠0). Web: ←/→ chạy trong ô `<input>`, không dời ô — không so trực tiếp được |
