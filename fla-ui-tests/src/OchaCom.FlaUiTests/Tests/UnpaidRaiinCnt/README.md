# UnpaidRaiinCnt — `UNPAID.TRT_CNT` (当日来院回数) mà F8 会計 ghi ra

Đo **đáp án WinForm** cho câu: *một ngày bệnh nhân đến hai lần thì 会計 chia điểm/tiền
theo **lượt** hay theo **cả ngày**?* — để đối chiếu với bản web ở
[`../../../../../web-tenant-tests/tests/unpaid-raiin-cnt-parity.spec.ts`](../../../../../web-tenant-tests/tests/unpaid-raiin-cnt-parity.spec.ts)
(ISSUE-14). Cùng số hiệu TC-0/1/2/3.

```powershell
.\run-unpaid-raiin-cnt.ps1 -Diagnostics   # PROBE: đo, không assert
.\run-unpaid-raiin-cnt.ps1                # bộ testcase
```

---

## 1. Bug đang đối chiếu

Bản port bỏ qua `intSelectRaiin` ở **cả 5 chỗ**: `InsertUnpaidHandler` để `trtCnt = 1`
cứng, `BuiPriceCalcInput.VisitsNo = 0`, `AccUnitCalculator` không có tham số 来院回数, và
`UnpaidDayRows.ForDay` lọc cứng `trt_cnt ∈ {1, 101}`.

⇒ bệnh nhân đến 2 lần/ngày: lượt 2 **xoá mềm rồi ghi đè** dòng của lượt 1, và **mỗi**
lượt mang điểm của **cả ngày** → 窓口精算 thu sai.

Cả chuỗi 会計 của WinForm bị giới hạn vào **một lượt**:

```csharp
hfgRaiinCnt();                                              // modAcc.cs:396 — điền cột 71
intSelectRaiin = CInt(hFG1[71, hFG1.CurrentCellAddress.Y]); // :415 — DÒNG CON TRỎ
GetDayPoint(intRow, …, ref intSelectRaiin, …);              // :416 — 点数 / 一部負担金
Calc_DayPoint_Kaigo(con, dtTgtDate, intSelectRaiin, …);     // :419 — 介護
Get_AccUnit(con, intRow, lngAccUnit, intSelectRaiin, "9");  // :423 — 14 診療識別
UnPaid.deleteTrtDtUnPaid(command, …, intSelectRaiin);       // :428 — xoá (trt_cnt % 100)
unPaidData.trt_cnt = intSelectRaiin;                        // :632 — dòng 医療保険
unPaidData.trt_cnt = intSelectRaiin + 100;                  // :673 — dòng 介護
```

---

## 2. ORACLE — không con số nào viết cứng

Ba đoạn source ghép lại cho một công thức tính thẳng từ `TRNTRN`:

| Bước | Nguồn | Nội dung |
|---|---|---|
| gán 来院回数 | `modAcc.hfgRaiinCnt` (modAcc.cs:1188-1222) | quét theo thứ tự `order by trt_dt, disp_no`; `trt_cd ∈ {100,107,110,111,333}` và `回数 > 0` thì tăng bộ đếm; bộ đếm 0 vẫn ghi ra **1** |
| điểm mỗi dòng | `buiPrice.cs:288` | `score = trt_pt × trt_cnt` — **lấy từ ô lưới, KHÔNG tra master** |
| lọc theo lượt | `modAcc.GetDayPoint` (modAcc.cs:238) | chỉ cộng `payData.visits_no == intSelectRaiin` |

> **`UNPAID.SCORE` của lượt N = Σ (trt_pt × 回数) trên các dòng của ngày mang `raiin_cnt = N`.**

Nhánh 入金指定 (`pNYUKIN`) đè `insScore = unit.Sum()` (modAcc.cs:620), nhưng `Get_AccUnit`
cũng chỉ cộng `grdRegi[54] = 点数×回数` của các dòng có `grdRegi[71] == 来院回数`
(modAcc.cs:821-856) ⇒ **ra cùng một số**. Vì vậy oracle dùng được cho cả hai nhánh mà
không cần biết máy có bật 入金指定 hay không.

`RaiinCntDb.ExpectedScoreByVisit` là bản cài đặt của công thức đó. Đổi bệnh nhân / đổi
ngày là kỳ vọng tự đổi theo — không ai phải chạy rồi chép con số vào assert.

### `sflg` KHÔNG chia theo lượt

Vòng 初診/再診/再初診 判定 (modAcc.cs:431-459) so `grdRegi[0,i] == grdRegi[0,intRow]` —
chỉ **NGÀY** — và `break` ngay ở dòng khớp đầu tiên. Không có bộ lọc 来院回数 nào. TC-3
khoá lại đúng điều đó, để không ai "sửa nhầm" sang per-lượt.

---

## 3. Ngày test được dựng thế nào

Ngày có 2 lượt khám gần như không tồn tại sẵn trong DB, mà đó lại là kịch bản **duy
nhất** phân biệt bản đúng với bản hỏng. Nên `TwoVisitDay.Build` **thêm ba dòng** vào
ngày đã có sẵn 処置:

```
  [những dòng CÓ SẴN của ngày]        ← 初診 (100) mở lượt 1
  disp_no 9101 「処置A-来院回数テスト」  ← 処置 trung tính, TRƯỚC 再診 ⇒ vẫn lượt 1
  disp_no 9102 「再診-来院回数テスト」   ← 110, MỞ lượt 2
  disp_no 9103 「処置B-来院回数テスト」  ← 処置 trung tính, sau 再診 ⇒ lượt 2
```

Thứ tự lưới là `order by trt_dt, disp_no` (Trntrn.cs:2372), nên `disp_no` 9101-9103 luôn
xếp **sau** mọi dòng thật (dải thật 1..13) — đó là toàn bộ cơ chế đảm bảo 初診 mở lượt 1
trước, 再診 mở lượt 2 sau.

Đo thật trên bệnh nhân 10 / 2026-08-03 (ngày 2026-09-04):

| | Dòng | Điểm |
|---|---|---|
| 来院1 | 8 dòng có sẵn (初診料 272 + 5 加算 + 2 コメント 0 điểm) + 処置A | **341** |
| 来院2 | 再診料 59 + 処置B | **61** |
| CẢ NGÀY | 日計 trên lưới | **402** ✓ khớp tổng oracle |

### Bốn điều đã cân nhắc khi chọn dòng seed

1. **Nhân bản dòng có thật** (`INSERT…SELECT`) thay vì tự dựng: `TRNTRN` có 84 cột, phần
   lớn `NOT NULL`, và `buiPrice` đọc tới `pat_br`/`jihi_flg` chứ không chỉ 処置コード.
   `SEQ` bị loại khỏi `INSERT` vì là IDENTITY.
2. **Không đè `TRT_CD`** lên dòng khuôn: đè mã mà giữ `TRT_PT` là dựng ra dòng có 点数
   không khớp master — sai ngay chỗ đang đo. Nên dòng khuôn được *chọn* theo mã cần
   (`FindOpenerTemplate`), không có thì fixture Ignore kèm lý do.
3. **処置 trung tính phải CHƯA có trên ngày test** (`FindPlainTemplates` lọc bằng
   `NOT EXISTS`): nhân bản một 処置 đã nằm sẵn trong ngày là mời 処置チェック bung hộp thoại
   「重複」 lạ, mà luật của `UnpaidCreationFlow` gặp câu lạ thì phủ định và **bỏ cuộc**
   giữa chuỗi F8.
4. **Seed TRƯỚC khi app mở** (`PrepareDataBeforeApp`): lưới chỉ nạp một lần lúc vào
   診療入力. Seed sau đó thì app không thấy, và mọi testcase đo trên bộ dòng cũ.

### Tiền đề của ngày test — kiểm bằng DB, không đoán

`TwoVisitDay.PreflightBlocker` chặn trước khi ghi gì, mỗi điều kiện có lý do riêng:

| Điều kiện | Hỏng thì sao |
|---|---|
| ngày có ít nhất một dòng 処置 | 日計 toàn 0, chuỗi 会計 kết thúc sớm |
| có 枝番 bảo hiểm phủ ngày đó | `buiPrice` lọc `trtData.pat_br == ins.pat_br` (buiPrice.cs:232) ⇒ mọi điểm ra 0 |
| ngày có **đúng một** 処置 mở lượt | 0 ⇒ dòng seed thành lượt 1; >1 ⇒ số lượt kỳ vọng không còn là 1/2 |

---

## 4. ⚠️ Luồng này GHI DB — hai chỗ

1. **`TRNTRN`** — 3 dòng seed, dải `disp_no` 9101-9103. Gỡ ở `[OneTimeTearDown]`, và
   `TwoVisitDay.Build` cũng tự dọn dải đó **trước** khi chèn, nên lượt chạy hỏng giữa
   chừng không cộng dồn. Gỡ tay:
   ```sql
   DELETE FROM TRNTRN WHERE pat_no = <patNo> AND disp_no >= 9101;
   ```
2. **`UNPAID`** — muốn đọc được `trt_cnt` thì phải để `LetAccData2` chạy qua
   `deleteTrtDtUnPaid` + insert, tức **ghi thật**, mà `modAcc.cs` không có transaction
   nào để lui. Fixture chụp ảnh UNPAID của **đúng ngày test** trước, khôi phục sau
   (`RestoreUnpaidForDay` — chỉ ngày test, vì F8 cũng chỉ đụng ngày đó).

Nằm sau `parity.allowSave`. **Trỏ `patient.patNo` vào bệnh nhân TEST** — khôi phục là
đường lui, không phải giấy phép.

> `RestoreUnpaidForDay` chèn lại **cả `lflg` và `tax`**. Thiếu `lflg` thì dòng 介護 sống
> dậy thành dòng 医療保険 và 窓口精算 đọc sai — `UnpaidSyosinDb.RestoreUnpaid` của luồng
> bên cạnh không có hai cột đó vì luồng ấy không đọc tới chúng.

---

## 5. Chuỗi hộp thoại của F8

Dùng lại `UnpaidCreationFlow` của luồng `UnpaidSyosinFlag` — bộ luật trả lời **はい** cho
「…未清算データ…作成してよろしいですか?」, tức đi vào nhánh **TẠO** 未精算 (modAcc.cs:566/598).
`AccountingFlow.WalkToChgAccData` trả lời 「いいえ」 nên không có dòng nào để đọc.

Ngày đã có `ACCDAT` thì có thêm hộp 「既に、¥… の会計処理がされていますが…」 — trả lời はい
đặt `past_billing_amount = 0` và chuỗi đi tiếp đúng nhánh cần đo. Cả hai lượt F8 đều đi
qua cùng một nhánh nên hai phép đo so được với nhau.

**Watcher bị tắt** (`NuisanceDialogPatterns => []`): chuỗi F8 toàn 「…続けますか？」/
「…よろしいですか。」 mà với chúng phủ định = **bỏ cuộc**. Watcher bấm 「いいえ」 hộ sẽ huỷ
chuỗi trước khi 未精算 kịp được ghi, và testcase đỏ với 「không có dòng UNPAID nào」 — đổ
oan cho app.

---

## 6. Đặt con trỏ vào đâu

`intSelectRaiin = hFG1[71, hFG1.CurrentCellAddress.Y]` đọc **đúng dòng con trỏ**, và
`hfgRaiinCnt` ghi cột 71 cho **từng dòng**. Nên:

| Con trỏ ở | 来院回数 |
|---|---|
| 「処置A-来院回数テスト」 | 1 |
| 「再診-来院回数テスト」 | 2 |
| dòng 【日計】 của ngày | số lượt **CUỐI** của ngày |

Fixture đặt con trỏ vào **dòng seed theo TÊN**, không theo chỉ số: UIA của
`DataGridView` chỉ phơi ra dòng đang nhìn thấy nên chỉ số trôi theo vị trí cuộn
(PROBE-GUIDELINE 3.1).

> Đo 2026-09-04: **mọi** dòng 処置 đều mang ô 日 riêng (modSave.cs:2625 điền cho từng
> dòng; `CellPainting` chỉ *gộp đường viền* chứ không xoá giá trị — frm203002.cs:1199).
> Hệ quả: `AccountingDayFlow.RowForDay` (lấy dòng **cuối** khớp ngày) trả về dòng
> 【日計】, tức 来院回数 = lượt CUỐI — đúng cho luồng kia, sai cho luồng này.

---

## 7. Gồm những file gì

| File | Việc |
|---|---|
| `RaiinCntDb.cs` | ORACLE (`AssignVisits` / `ExpectedScoreByVisit`); nhân bản dòng seed; đọc + khôi phục `UNPAID` (có `lflg`) |
| `TwoVisitDay.cs` | dựng ngày 2 lượt, kiểm tiền đề, tìm dòng trên lưới theo tên |
| `UnpaidRaiinCntProbeTests.cs` | `[Explicit]` PROBE — đo 7 câu hỏi, không assert |
| `UnpaidRaiinCntTests.cs` | TC-0/1/2/3 — assert, cùng số hiệu với spec web |
