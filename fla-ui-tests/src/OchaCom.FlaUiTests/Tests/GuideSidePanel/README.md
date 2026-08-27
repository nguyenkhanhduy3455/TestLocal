# GuideSidePanel — tab 「ガイド」 của 診療入力 (frm203002) + 「ガイド処置選択」 (frm203017)

Nửa **WinForm** của spec Playwright
[`../../../../../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts`](../../../../../web-tenant-tests/tests/guide-sidepanel-handler.spec.ts).

Bên kia đo **bản web**; ở đây đo **chính WinForm** — tức là đo cái "đáp án" mà bản web
phải khớp. Chỗ nào hai bên lệch thì lệch đó là **thật**, và bảng ở mục 3 nói rõ lệch ở
đâu.

> **Đọc [`../../../../PROBE-GUIDELINE.md`](../../../../PROBE-GUIDELINE.md) trước.**
> Luật số một: chưa biết app thật hành xử ra sao thì **chụp màn hình → đọc ảnh → rồi mới
> viết assert**. Luồng này đã trả giá đúng một vòng vì bỏ qua nó — xem mục 4.1.

---

## 1. Chạy

```powershell
.\run-select-guide-treatment.ps1 -Diagnostics          # 3 fixture PROBE, 18 câu hỏi
.\run-select-guide-treatment.ps1 -Case Tc0_ProbeOpenGuideTab
.\run-select-guide-treatment.ps1                        # fixture assert
```

Kết quả: `select-guide-treatment-KQ.txt` (các dòng `=== KQ-n ===`, UTF-8 sạch, đọc từ
`.trx`) + `artifacts\screenshots\<tên testcase>\` (ảnh **từng bước** + `_trace.log`).

**Không ghi DB.** Không bấm F9 登録 của frm203002. Nút 「リセット」 *có* ghi
(`StepReset` → `UPDATE TRTSTATE`) nên mọi chỗ bấm nó đều trả lời キャンセル/いいえ.

---

## 2. Nguồn WinForm

| Việc | Hàm | Chỗ |
|---|---|---|
| Nạp list khi CHỌN TAB | `getGuidNyuryokuInfo` | `frm203002.cs:1974` |
| Nạp list khi bấm F4 / các nút | `getGuidNyuryokuInfo2` | `frm203002.cs:1991` |
| Dải `guid_cd` theo chế độ | `modGuid1.pSet_Guid1` | `modGuid1.cs:37` |
| Ô 選択№ bám dòng sáng | `hfgGuid1_RowEnter` | `frm203002.cs:2238` |
| Click đơn = Enter | `hfgGuid1_Click` | `frm203002.cs:6570` |
| Enter trên lưới = double-click | `grdGuid_KeyDown` | `frm203002.cs:6584` |
| Mở frm203017 + xử lý kết quả | `hfgGuid1_CellDoubleClick` | `frm203002.cs:6515` |
| ↑/↓/PageUp/PageDown + Enter ở ô № | `txtGuid1Sel_KeyDown` | `frm203002.cs:6726` |
| 「全て表示」/「前回」/「リセット」 | `cmdGuidAll/Prv/Reset_Click` | `frm203002.cs:6604/6617/6631` |
| Header dialog + 5 cột | `initProc` / `_viewItem` | `frm203017.cs:432` / `:96` |
| Dialog rỗng 処置 → tự đóng | `getViewData` | `frm203017.cs:1001` |

Hai control **KHÔNG** có trong bản web và ngược lại — xem mục 3.

---

## 3. Bảng tương ứng với spec Playwright

`GuideSidePanelTests` (fixture assert) — cột bên phải là testcase tương ứng trong
`guide-sidepanel-handler.spec.ts`.

| WinForm | Đo cái gì | Playwright |
|---|---|---|
| **TC-G1** | F4 mở tab ガイド; lưới đúng **2 cột**, tiêu đề 「№」/「名称」 | `F4 mở tab ガイド — header No./名称 + danh sách … nạp xong` |
| **TC-G2** | cột 「№」 = 1..N (`GuidNum = cnt + 1`), không phải `guid_cd` | `cột No. = số thứ tự 1..N …` |
| **TC-G3** | vừa vào tab: ô 選択№ = 「1」, con trỏ ở `txtGuid1Sel` | `vừa vào tab: dòng đầu sáng, ô No. = "1" …` |
| **TC-G4** | 通常: 「全て表示」 hiện, 「前回」/「リセット」 **ẩn** | `WinForm parity 2` |
| **TC-G5** | click ĐƠN → mở frm203017 của đúng dòng; lưới **5 cột** | `click 1 dòng → …` + `dialog hiển thị đủ 5 cột …` |
| **TC-G6** | đóng kiểu huỷ (戻る) → con trỏ về ô 選択№ | `đóng dialog kiểu huỷ (F10) → con trỏ quay lại ô 選択No.` |
| **TC-G7** | ↑/↓ dời dòng sáng + kéo ô №, clamp ở đầu list | `↑/↓ đổi dòng sáng và kéo theo ô No., có clamp ở hai đầu` |
| **TC-G8** | ô 選択№ **KHÔNG lọc ký tự** — 「1a2」 nằm nguyên | `ô 選択No. chỉ nhận chữ số` → **LỆCH**, mục 4.2 |
| **TC-G9** | № hợp lệ + Enter → dialog của ĐÚNG dòng (không off-by-one) | `Enter trên ô No. có số → …` + `ガイド: № 1 → dòng thứ nhất …` |
| **TC-G10** | № 999 + Enter → VẪN mở dialog của dòng đang sáng | `WinForm parity 3` |
| **TC-G11** | № rỗng + Enter → không mở gì | `WinForm parity 4` |
| **TC-G12** | Shift+F4 (STEP) → 「前回」/「リセット」 hiện ra | `Shift+F4 (STEP) → …` |
| **TC-G13** | 「リセット」 hỏi Q00100 nguyên văn; Cancel → không ghi gì | `「リセット」 → hỏi Q00100 …; chọn No → không ghi gì` |
| **TC-G14** | 「全て表示」 → list dài ra, hai nút ẩn lại | `「全て表示」 → list là SUPERSET của list F4 …` |
| **TC-G15** | dòng ガイド có 処置 → dialog Ở LẠI, không alert | `ガイド có 処置: dialog Ở LẠI, KHÔNG tự đóng và KHÔNG alert` |

### Bên kia có, bên này CHƯA đo

| Playwright | Vì sao chưa |
|---|---|
| `WinForm parity 1` — 「前回」 rỗng thì lưới giữ nguyên list cũ | Máy đo có dữ liệu 前回 (1 dòng 「検査(C) test 1080」) nên nhánh RỖNG không dựng được bằng UI. Cần bệnh nhân/部位 không có `trt_state` |
| `WinForm parity 5` — ガイド không có 処置 thì dialog tự đóng | Bốn dòng đầu của cả hai list đều CÓ 処置. Phải dò cả list mới gặp, mỗi lần mở dialog tốn ~40s |
| `F9 確定 đẩy 処置 vào lưới VÀ xoá ô 選択№` | Nhánh GHI. Sẽ nằm sau một cờ riêng như `parity.allowSave`, chưa làm |
| `リセット thật (StepReset → UPDATE trt_state)` | Nhánh GHI vào `TRTSTATE`, cố ý không bấm |
| `←/→ đổi tab khi side panel giữ focus` | Bên WinForm phím mũi tên ngang do `SSTab1` xử lý, chưa dò |
| Các tab 病検 / パック / 個別 của spec `選択№ + Enter parity 4 tab` | Luồng khác, sẽ là thư mục test riêng |

---

## 4. Đã đo được trên máy thật (2026-08-27, bệnh nhân 10, 08年08月)

### 4.1 Ba cái bẫy đã trả giá trong chính buổi này

**(a) `Uia.SendKey` KHÔNG gửi phím nào — và im lặng.** Lượt đo đầu tiên kết luận
「F4/Enter/↑/↓ đều không ăn, phải bấm nút」. Sai: `Infrastructure/Uia.cs` khai `INPUT`
**phẳng** (`type, wVk, wScan, dwFlags, time, dwExtraInfo`) nên `Marshal.SizeOf` ra **32**
trên x64 thay vì **40** — thiếu 4 byte đệm sau `type` và thiếu thân `MOUSEINPUT`, thành
viên lớn nhất của union. `SendInput` thấy `cbSize` không khớp thì trả **0** và **không
gửi gì cả**: không ngoại lệ, không lỗi, không dấu vết. Đã sửa (struct union đúng chuẩn +
`SendKey` trả `bool`). **Luồng nào thấy 「app nuốt phím」 hãy kiểm giá trị trả về TRƯỚC
khi ghi vào README rằng WinForm sai.**

**(b) Bấm nút mở MessageBox bằng `Uia.Click` = treo.** `Invoke` là lời gọi ĐỒNG BỘ, nó
chờ handler chạy xong; handler của 「リセット」 mở MessageBox modal nên `Invoke` không bao
giờ trả về và chết với `TimeoutException: UIA Timeout`. Đọc log thì tưởng nút hỏng — xem
ảnh mới thấy hộp thoại đang mở rành rành. Ba nút của tab này đều bấm bằng
`Uia.LeftClickPhysical`.

**(c) Rời tab ガイド thì đừng rời sang 個別.** Lưới 個別 giữ nguyên master ~1.7k dòng, cầu
MSAA dựng phần tử cho từng dòng ⇒ mọi `FindFirstDescendant` sau đó **timeout**, testcase
đỏ ngay câu hỏi đầu tiên trong khi app hoàn toàn khoẻ. Đi sang 病検.

Thêm hai điều nhỏ nhưng tốn thời gian:
- Dòng tiêu đề của `hfgGuid1` **lọt vào danh sách dòng dữ liệu** (`WinFormsGrid.IsHeaderRow`
  tìm `HeaderItem`, lưới này không dựng kiểu đó). Lọc theo GIÁ TRỊ ô 「№」 phải parse ra số.
- `OchaApp.Window(id)` **không tìm ra frm203017**: nó lọc `Uia.IsOnScreen` trên từng cửa
  sổ, gặp cửa sổ chủ đang bị modal chặn thì ném, `try/catch` bọc cả vòng lặp nuốt lỗi và
  trả về danh sách RỖNG. Dùng `Window.ModalWindows` + `GetAllTopLevelWindows`, nhận dạng
  theo tiêu đề 「ガイド処置選択」.

### 4.2 Ba điểm LỆCH với bản web

| # | WinForm (đo được) | Bản web | Ghi chú |
|---|---|---|---|
| 1 | Ô 選択№ **không lọc ký tự**: gõ 「1a2」 thì ô mang đúng 「1a2」; chỉ tới lúc Enter mới bị `int.TryParse` loại | `sanitizeDigits` xoá chữ ngay khi gõ ⇒ ô không bao giờ chứa chữ | Web **chặt hơn** bản gốc. Kết cục cuối (Enter không làm gì) thì giống nhau, chỉ khác cái người dùng NHÌN THẤY trong ô |
| 2 | Tiêu đề cột đầu là 「**№**」 (U+2116) | 「**No.**」 — hai chữ + dấu chấm | Chữ khác nhau thật; `Txt.N` (NFKC) biến 「№」 thành `"No"` nên testcase so với `"No"` |
| 3 | 「Shift+F4」 rẽ theo **cờ lớp phím `ShiftFlg`** (BaseForm.cs:613: giữ Shift, hoặc bấm nút `btnShift` lật lớp), KHÔNG theo phím bổ trợ của lần bấm | Web nghe đúng tổ hợp `Shift+F4` | Còn một tầng nữa: `ModCommon.pInpOpt[39] == 2` (診療入力設定 「ｶﾞｲﾄﾞﾓｰﾄﾞ」) **đảo** hai nhánh 通常/STEP (frm203002.cs:777). Bản web hard-code một chiều |

### 4.3 Số đo cụ thể (bệnh nhân 10, 部位 của dòng đang chọn)

| Chế độ | Số dòng | Hai nút 前回/リセット |
|---|---|---|
| 通常 (F4) | 86 | ẨN |
| STEP (Shift+F4) | 1 — 「検査(C) test 1080」 | HIỆN |
| 全て表示 | 334 (UIA chỉ đọc được 199 vì lưới ảo hoá) | ẨN |

- Ô 選択№ sau khi mở tab: 「1」, con trỏ ở `txtGuid1Sel`.
- ↑/↓: 1→2→3→4 rồi 3→2→1, quá đầu list thì **dừng ở 1**.
- Click ĐƠN dòng 「抜歯」 → frm203017 mở với 「ガイド番号」 **511**, lưới 5 cột
  ｺｰﾄﾞ/枝番/処置名称/点数/回数 (vd `310 | 2 | OA+オーラ注歯科用カートリッジ料1.8mL | 11 | 1`).
- № 2 + Enter → dialog 「異種充填」 = **đúng dòng thứ hai** ⇒ không off-by-one.
- № 999 + Enter → **vẫn mở** dialog của dòng đang sáng.
- № rỗng + Enter → **không mở gì**, không hộp thoại.
- 「リセット」 hỏi nguyên văn:
  **「該当部位の治療進行状態をリセットします。よろしいですか？」**, tiêu đề 「お茶コン」,
  nút **OK / Cancel** (không phải はい/いいえ).
- Đóng frm203017 **bằng nút 戻る** → con trỏ về `txtGuid1Sel`.
  Đóng **bằng phím F10** → con trỏ đọc ra `MenuBar`: phím F10 của Windows kích hoạt thanh
  menu của cửa sổ đứng sau. Testcase đo focus phải đóng bằng NÚT.
