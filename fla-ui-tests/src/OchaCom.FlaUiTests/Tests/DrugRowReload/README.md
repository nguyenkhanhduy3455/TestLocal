# G3 — Dựng lại dòng thuốc khi LOAD lưới

Nửa **WinForm** của điểm parity G3.

> **Trạng thái: THÔNG LUỒNG + PROBE, CHƯA CHẠY LẦN NÀO.**
> Luật F1: source nói rõ `GetTrnRs` dựng lại chuỗi thay vì hiện `dsp_trt`, nhưng **chưa ai
> nhìn thấy** điều đó, và cũng chưa ai biết ô có thật sự bị khoá không. Probe trả lời
> trước; `DrugRowReloadTests` (assert) viết sau khi có `reload-drug-row-KQ.txt` đầu tiên.

---

## 1. WinForm không hiện `dsp_trt` đã lưu cho dòng 薬剤

```
modSave.cs:2627-2637   GetTrnRs — lưới THÁNG HIỆN HÀNH
    if (isCodeRange(drug, trt_cd)) {                      ← 600–699
        drugInfStr = getDrugName(con, null, raiin_cnt, trt_cd, trt_sb,
                                 trt_cnt, trt_dt, dsp_trt, freewd, true);
        hFG1[2] = drugInfStr.combineDrugNmsStr;           ← dsp_trt BỊ BỎ QUA
        hFG1[2].Tag = drugInfStr.drugRxData;
        if (drugInfStr.drugRxData != null)
            hFG1[2].ReadOnly = true;                      ← CHỈ khi path A
    } else {
        hFG1[2] = REGIRYO_PADLEFT + dsp_trt;              ← mã khác: hiện nguyên văn
    }

modSave.cs:4961-4974   lưới QUÁ KHỨ — y hệt, nhưng ReadOnly VÔ ĐIỀU KIỆN
```

Ngay trên đoạn đó còn nguyên cái tên `#region`:

```csharp
#region "               hFG1[ 2, intRow].Value = "\t" + rsTrn["dsp_trt"];"
```

— chính là dòng code **cũ** mà phép dựng lại đã thay thế. Nó nằm đó như một dấu vết.

### Chỗ bản web lệch

`treatment-table-mapper.ts:160,234` đọc thẳng `name: dspTrt` cho **mọi** dòng. Không có
nhánh `isDrugCode` nào ở luồng load — `isDrugCode` chỉ tồn tại ở
`treatment-entry-shared.ts:426`, tức đường **NHẬP**.

| | WinForm | Web |
|---|---|---|
| Nguồn chuỗi 療法・処置 của dòng 薬剤 | **dựng lại** từ master + `freewd` | `trn_trn.dsp_trt` đã lưu |
| Ô có khoá không | **có** (path A, lưới tháng hiện hành) · **luôn có** ở lưới quá khứ | *(chưa rõ)* |
| Mã ngoài 600–699 | `dsp_trt` nguyên văn | `dsp_trt` nguyên văn — **giống nhau** |

⇒ Hai bên chỉ giống nhau **chừng nào `dsp_trt` đã lưu vẫn đúng bằng cái master dựng ra**.
Lệch xuất hiện khi:

- **master đổi** sau khi lưu (đổi tên thuốc, đổi 薬価, hết hiệu lực, đổi 用法), hoặc
- **`freewd` khác mặc định** — mà `freewd` khác mặc định chính là thứ luồng **G1**
  (薬剤使用量選択) sinh ra. Hai điểm parity này nối vào nhau: G1 tạo ra dữ liệu, G3 là
  chỗ nó được đọc lại.

---

## 2. Khác hẳn G1/G2: luồng này **không nhập gì**

G1/G2 đo **đường nhập**. G3 đo **đường LOAD**: dữ liệu phải nằm sẵn trong `TRNTRN`
**trước khi** màn hình mở, rồi ta chỉ ĐỌC.

Hệ quả về cách viết: seed phải xong trong `PrepareDataBeforeApp`, tức trước
`OchaApp.LaunchOrAttach`. Chèn sau khi 診療入力 đã mở thì `GetTrnRs` đã chạy rồi và app
không bao giờ thấy — cùng họ với bẫy **F21**, chỉ khác là thứ nạp một lần ở đây là **cả
cái lưới**. Muốn đọc lại sau khi đổi DB giữa chừng thì phải
`UiTestBase.ReopenTreatmentScreen()`.

---

## 3. ⚠️ Luồng ghi **nặng nhất** của cả bộ

Nó chèn dòng vào **`TRNTRN`** — 処置行 thật của bệnh nhân. Không có đường nào khác: thứ
đang đo là đường LOAD.

Và để phân biệt được 「hiện `dsp_trt` đã lưu」 với 「dựng lại từ master」 thì `dsp_trt` phải
được đặt **khác hẳn** cái master sẽ dựng — tức phải là một chuỗi **bịa**. Đó là toàn bộ
phép đo, và cũng là lý do không thể mượn một dòng có sẵn.

**Ba hàng rào:**

1. Cờ RIÊNG `drugRowReload.allowSeed`, mặc định **tắt** ⇒ fixture tự Ignore **trước khi
   mở app**.
2. **Chỉ CHÈN** dòng mới mang `DISP_NO` riêng (9201 / 9202) — **không bao giờ** sửa hay
   xoá dòng có sẵn. Dọn là `DELETE` đúng `DISP_NO` đó, và chạy cả **trước** khi seed
   (lượt trước chết giữa chừng thì hàng rào sẽ chặn, mà chặn xong cũng không đo được gì).
3. Chèn bằng **clone** một dòng có sẵn của chính bệnh nhân + ngày test rồi ghi đè vài cột,
   nên mọi cột NOT NULL (`PAT_BR`, `INSU_CD`, `DR_NO`, 32 cột `BUI`, 20 cột `DIS_*`…) đều
   đúng bối cảnh. Viết tay 80 cột là chỗ chắc chắn sẽ sai.

`SEQ` là IDENTITY nên không truyền; PK là `(PAT_NO, TRT_DT, DISP_NO, SEQ)`.

**KHÔNG bấm F9 登録** ⇒ không dòng nào khác bị ghi đè.

---

## 4. Hai dòng seed

| Vai | `DISP_NO` | Mã | `freewd` | `dsp_trt` | 点 |
|---|---|---|---|---|---|
| **Đối tượng** | 9201 | `628/0` 「カロナール錠200mg　１T」 | `7` | `ｾﾞﾃｽﾄDSPTRTﾏｰｶｰ` | 777 |
| **Đối chứng** | 9202 | `110/0` 再診 (ngoài dải 薬剤) | *(rỗng)* | `ｾﾞﾃｽﾄDSPTRTﾏｰｶｰ` | 778 |

- `628` chọn vì **có `mst_drug_rx`** (path A ⇒ nhánh khoá ô mới chạy) và
  **`selected_treat_kb = 0`** (không kéo theo 長期収載品 — bài học của G2).
- **`freewd = 7`** khác 使用量 mặc định của master (`cnt1 = 1`) ⇒ mới thấy được phép dựng
  lại có đọc `freewd` không.
- **Dòng đối chứng tách đôi câu hỏi:** chuỗi bịa biến mất ở dòng 薬剤 là hành vi **riêng**
  của dải 600–699, hay app không bao giờ hiện `dsp_trt`? Dòng ngoài dải phải hiện **nguyên
  văn** chuỗi bịa.

---

## 5. Hai cái bẫy

### 5.1 Dò dòng theo **点**, không theo tên

Cái đang đo **chính là chuỗi tên**. Lấy tên làm mốc tìm dòng là vòng luẩn quẩn: không tìm
thấy thì không phân biệt được 「app dựng tên khác」 với 「dòng không có trên lưới」.
`点` do seed đặt (777 / 778) — một con số không đụng dòng nào khác trong ngày.

### 5.2 Đo ReadOnly bằng **hành vi**, không bằng thuộc tính

`DataGridViewCell.ReadOnly` không được cầu MSAA→UIA phơi ra thành một cờ đọc được tin cậy.
`ProbeReadOnly` đặt con trỏ vào ô rồi bấm Enter và xem editor có mở không — đúng thứ người
dùng gặp.

⛔ Mở được editor thì **đóng bằng Enter**, tuyệt đối không bằng Escape: **F14** —
`GradientDataGridView.ProcessDialogKey` trả `false` nên Escape rơi xuống form thành 戻る
và bung dirty gate 「保存しますか」.

---

## 6. Chạy

```powershell
.\run-reload-drug-row.ps1 -Probe -Seed                              # cả fixture
.\run-reload-drug-row.ps1 -Probe -Seed -Case Tc0_ProbeSeededData    # chỉ DB
.\run-reload-drug-row.ps1 -Probe -Seed -Case Tc1_ProbeDrugRowOnLoad
.\run-reload-drug-row.ps1 -Probe -Seed -Case Tc2_ProbeNonDrugRowShowsDspTrt
```

Cả fixture chỉ **một** vòng giao diện (không nhập gì, chỉ đọc lưới đã nạp sẵn) nên rẻ —
khác hẳn G1/G2.

Không bật `-Seed` ⇒ fixture tự Ignore **trước khi mở app**, kèm lý do.

**Kiểm lại trước khi đóng máy:**

```sql
SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO IN (9201, 9202);   -- phải là 0
```

Lượt chạy chết giữa chừng thì dọn tay bằng đúng câu `DELETE` tương ứng — không dòng nào bị
*sửa* nên không cần khôi phục gì.

---

## 7. Cặp Playwright

Chưa có (bên web đang code). Khi viết, dùng **đúng hai dòng seed ở mục 4** để số đo so
thẳng được.

Điều cần khẳng định trước tiên là **KQ-2**: *chuỗi bịa có hiện ra không*. Nếu hoá ra
WinForm cũng hiện `dsp_trt` thì điểm parity G3 không tồn tại và phải đọc lại
`modSave.cs:2627` trước khi kết luận theo hướng nào.

---

## 8. Việc chưa phủ

- **Lưới QUÁ KHỨ** (`modSave.cs:4961-4974`) — cùng phép dựng lại nhưng `ReadOnly` **vô
  điều kiện**, tức khác lưới tháng hiện hành ở đúng một chữ. Luồng này mới chỉ đo lưới
  tháng hiện hành.
- **Dòng path B khi load** — mã 600–699 **không** có `mst_drug_rx` thì `drugRxData == null`
  ⇒ nhánh khoá ô **không** chạy ⇒ ô vẫn sửa được. Đo được nó cần seed cả master (G2) lẫn
  `TRNTRN` (G3) trong một lượt.
- **`raiin_cnt`** — `getDrugName` nhận `ModSave.getRaiinCnt(intRow)` và dùng nó để tra
  `RxUsage`; chưa đo ảnh hưởng.

---

## 9. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.

### *(chưa chạy lần nào)*

Cần điền: KQ-1 … KQ-7, kèm ảnh `artifacts\screenshots\`.
