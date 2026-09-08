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
| **TC-D15** | danh sách khi con trỏ ở dòng CÓ 部位 (dựng cùng tiền đề để so) | `TC-D13` |
| **TC-D16** | **QUÉT 8 ガイド** — cái nào có 処置, cái nào rỗng, trọn danh sách từng cái | `TC-D14` |
| *(WinForm là đáp án)* | tên 薬剤 kèm 用法 | `WinForm parity D-d` |
| *(WinForm là đáp án)* | 回数 của dòng nhóm 窩洞形態 lúc vừa mở | `WinForm parity D-e` |
| *(không có)* | ô 回数 chỉ nhận chữ số | `TC-D9` |
| *(không có)* | 回数 rộng hơn 枝番 | `WinForm parity D-c` |

---

## 4. Parity đo được — 2026-09-08

### 4.0 Điều kiện đo (phải khớp thì số mới có nghĩa)

| | Giá trị |
|---|---|
| Bệnh nhân | **10** — máy Windows ghim trong `testsettings.local.json` (12138 có 2864 dòng TRNTRN, app treo hơn một phút) |
| 診療日 | **2026-07-20** |
| Dòng đang chọn | 部位 **5 răng** 「54321」 (bui idx 3..7), 病名 **100 「C」** |
| Dữ liệu hai DB | **TRÙNG KHÍT** — đã đối chiếu `TRNTRN` (SQL Server SIM2000) với `trn_trn` (Postgres `t_tenant1`): cùng ngày, cùng `disp_no 9001`, cùng bui, cùng 病名. KHÔNG cần seed |

```powershell
.\run-open-guide-dialog.ps1 -Case TcD16 -TrtDate 2026-07-20 -PatNo 10
```
```bash
TEST_PAT_NO=10 TEST_TRT_DT=2026-07-20 npx playwright test tests/side-panel/guide-selection-dialog-format.spec.ts
```

> ⚠️ Đổi bệnh nhân hoặc đổi ngày là đổi 部位 ⇒ đổi 算定回数 ⇒ mọi con số 回数 dưới đây vô
> nghĩa. Đã trả giá đúng một vòng vì chuyện này: lượt đo đầu chạy WinForm trên bệnh nhân
> **10** còn Playwright trên **12138**, ra 「web thiếu dòng 186 歯槽骨整形手術」 và 「回数
> lệch khắp nơi」 — **cả hai đều ẢO**, chỉ vì khác bệnh nhân. Hai fixture nay in
> `DUMP|win|ctx|screen|patNo=…` và `DUMP|web|scanreq|…|Bui=…` để lần sau bắt được ngay.

### 4.1 DỮ LIỆU — 7 ガイド so được, 5 trùng khít 100%

`TcD16` (WinForm) và `TC-D14` (web) quét cùng một list. Bảy ガイド đọc được đều **trùng
tên, trùng ガイド番号, trùng số dòng**:

| # | ガイド | 番号 | số dòng 処置 | từng ô |
|---|---|---|---|---|
| 0 | 抜歯 | 511 | 16 = 16 | **TRÙNG KHÍT** (kể cả 回数: 抜歯手術(前歯)=3, (臼歯)=2 — đúng 3 前歯 + 2 臼歯 của 部位 「54321」) |
| 1 | 異種充填 | 611 | 9 = 9 | **LỆCH 2 dòng** — xem (a) |
| 2 | コーピング set | 821 | 8 = 8 | **TRÙNG KHÍT** |
| 3 | 抜歯 | 10650 | 13 = 13 | **LỆCH 2 dòng** — xem (b) |
| 4 | コーピング KP・imp | 630 | 3 = 3 | **TRÙNG KHÍT** |
| 5 | HJK set | 715 | 6 = 6 | **TRÙNG KHÍT** |
| 6 | 支台築造印象 | 720 | 1 = 1 | **TRÙNG KHÍT** |

Trùng khít nghĩa là **cả 5 cột ｺｰﾄﾞ/枝番/処置名称/点数/回数 và đúng thứ tự**.

**(a) 回数 của các dòng thuộc nhóm 窩洞形態 — testcase `WinForm parity D-e`**

| dòng | WinForm | web |
|---|---|---|
| `326/1 充填1(単純) 106点` | 回数 **5** | 回数 **0** |
| `342/0 グラスアイオノマー充填(標準型・単純) 3点` | 回数 **5** | 回数 **0** |

WinForm để nguyên 算定回数 (CalcCnt = 5 răng của 部位). Bản web ép các dòng nhóm 複雑/単純
về 0 và chỉ điền khi người dùng chọn mặt răng ở khối 窩洞形態 (`cavityRowCnt`,
`guide-selection-dialog.tsx`). Vừa mở dialog là hai bên hiện hai con số khác nhau.

**(b) Tên 薬剤 thiếu hậu tố 用法 — testcase `WinForm parity D-d`**

| dòng | WinForm | web |
|---|---|---|
| `601/0` | 「ボルタレン錠25mg1T **疼痛時 服用**」 | 「ボルタレン錠25mg1T」 |
| `602/0` | 「メイアクトMS錠100mg4T **1日4回朝昼夕食後と就寝前 服用**」 | 「メイアクトMS錠100mg4T」 |

`frm203017.getViewData` nối 用法 vào `trt_nm` (`newRow["trt_nm"] += " " + usage;`). Bản web
khai thẳng trong doc-comment rằng 「drug-usage name suffix」 nằm ngoài Phase 1 — **đã biết
và cố ý**, nhưng vẫn là lệch với người ngồi trước màn hình.

> WinForm chỉ phơi ra UIA **7 ガイド đang nhìn thấy** (luật F10), còn web báo tổng **86**.
> Muốn so sâu hơn thì cuộn lưới rồi quét tiếp, hoặc chọn theo TÊN như `openGuideByName`
> của spec Playwright.

### 4.2 THAO TÁC — hai điểm lệch

| Thao tác | WinForm | web | Testcase |
|---|---|---|---|
| Đổi 回数 bằng chuột | **CLICK ĐƠN** lên ô bất kỳ của dòng (`dgvView_CellClick`, :363) — đo được 1→0→1→0 | **DOUBLE-CLICK**; click đơn không đổi gì | `WinForm parity D-a` |
| Nền dòng | đổi theo **NHÓM** `acc_unit >> 4` (đo được: dòng 0-1 trắng, 2-5 RGB(234,246,253), 6 trắng, 7-9 xanh, 10-11 trắng) | đổi theo **CHẴN/LẺ** từng dòng | `WinForm parity D-b` |

Còn lại **khớp**: con trỏ vào ô 回数 dòng đầu khi mở, ↑/↓ đi giữa các ô 回数 + clamp ở dòng
đầu, sắp xếp 4 cột đầu (lần hai đảo chiều) và 「回数」 KHÔNG sắp xếp được, ô 回数 chỉ nhận
chữ số, đóng bằng F10 rồi mở lại là form MỚI (回数 về CalcCnt, sort sạch), thanh F chỉ có
F9 確定 + F10 戻る, Escape = 確定.

### 4.3 HÌNH THỨC — ghi nhận, KHÔNG tính là lệch

| Điểm | WinForm | web |
|---|---|---|
| Tiêu đề cột 1 | 「 ｺｰﾄﾞ」 nửa chiều rộng + dấu cách đứng trước | 「コード」 đủ chiều rộng |
| Dấu cách trong ô | `CellFormatting` chèn vào MỌI ô (「135 」「 パノラマデジタル」) | canh lề bằng CSS |
| Kích thước cửa sổ | 700×740 px | 648×618 px |
| Bề rộng cột | 65/40/370/70/70 px | 70/60/374/60/50 px |
| Màu chữ コメント | magenta `0xff00ff` / `Color.Blue` — đo được 7321 → RGB(0,0,255) | cùng Ý NGHĨA, khác sắc độ: RGB(21,93,252) |

**Bề rộng cột và kích thước cửa sổ KHÔNG phải tiêu chí parity** (hai hệ đơn vị khác nhau,
người nhập liệu không thao tác trên bề rộng) — spec chỉ in dòng `DUMP|…|colw|…`, không
assert. Tiêu đề cột thì `TcD2` vẫn so NGUYÊN VĂN, nhưng đó là để chốt WinForm viết gì.

---

## 5. Chưa đo

| Câu hỏi | Vì sao chưa |
|---|---|
| Nhánh F9 確定 đẩy 処置 vào lưới | Nhánh GHI. Nằm sau một cờ riêng, chưa làm |
| ガイド rỗng 処置 → Q00100 / E00024 | Đã đo ở luồng cũ (`README.md` mục 3, parity 5) |
| Khối 窩洞形態 (`tabGuide`) hiện ra thế nào | ガイド 611 「異種充填」 CÓ bật khối đó (điểm lệch 4.1a), nhưng bản thân khối (tab từng răng + 3 hình 窩洞形態) chưa đo — mới chỉ đo 回数 của các dòng thuộc nhóm |
| Hơn 7 ガイド | UIA chỉ phơi ra dòng đang nhìn thấy (F10); phải cuộn lưới ガイド rồi quét tiếp |
| Sửa 点数 (chỉ mở khi 点数=0 và 自費) | Cần một dòng 自費 có 点数=0 trong list |
| ←/→ trong lưới | WinForm chặn cả hai ở dòng đo được (点数≠0). Web: ←/→ chạy trong ô `<input>`, không dời ô — không so trực tiếp được |
