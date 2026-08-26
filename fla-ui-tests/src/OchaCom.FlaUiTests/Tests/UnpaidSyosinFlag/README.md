# UnpaidSyosinFlag — `UNPAID.SFLG` (初診フラグ) mà F8 会計 ghi ra

Đo **đáp án WinForm** cho hệ mã `1 = 初診 / 2 = 再診 / 3 = 再初診`, để đối chiếu với
bản web ở `../../../../../web-tenant-tests/`.

```powershell
.\run-unpaid-syosin-flag.ps1 -Diagnostics
```

---

## 1. Bug đang điều tra

Tester: 「hệ thống cũ 2 ngày ra **2 và 3**, nhưng web ra **2 và 2**」.

Ảnh `UNPAID` hệ cũ: bệnh nhân 100 — ngày 25 → `SFLG 3`, ngày 26 → `SFLG 2`;
bệnh nhân 1863 ngày 25 → `SFLG 1`.

---

## 2. `sflg` KHÔNG đến từ `buiPrice`

Đây là chỗ dễ port sai nhất.

| | Hệ mã | Ai dùng |
|---|---|---|
| `buiPrice.SetSyosinFlags` | 1 = 初診 · 2 = 再診 · **4 = 訪問診療** | bản web đang lấy từ đây |
| `modAcc.LetAccData2` | 1 = 初診 · 2 = 再診 · **3 = 再初診** | WinForm ghi vào `UNPAID.SFLG` |

`modAcc` **tự tính** `intSyosin` rồi ghi thẳng (`modAcc.cs:639/686/710/751`), thậm chí
còn **đè ngược** lên `cur_buiPriceData2.syosin_flg`. Nên hệ 1/2/4 không bao giờ là
nguồn đúng cho cột này — và `4` thì WinForm **không bao giờ** ghi vào `UNPAID.SFLG`.

```csharp
// modAcc.cs:465-476
if (flgSyosin) {
    dtBufDate = 年/月/01;                                   // ĐẦU THÁNG đang mở
    cnt = Trntrn.getKaikeiPastSyosinCnt(con, patId, dtBufDate);
    intSyosin = (cnt == 0) ? 1 : 3;
} else {
    intSyosin = 2;
}
```

```sql
-- Trntrn.cs:1274 — getKaikeiPastSyosinCnt
SELECT COUNT(*) FROM TRNTRN
 WHERE PAT_NO = @p
   AND ( TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0) )
   AND TRT_DT < @dauThang
```

> **HAI bộ mã khác nhau, đừng lẫn.** Bộ quyết định `flgSyosin` là
> `Check.IsFirstVisitTreatCode` (`Check.cs:12456`) — **rộng**: `100/0`, `100/1`,
> `107/0`, `333/50`, `333/55`. Bộ đếm quá khứ thì **hẹp**: chỉ `100` (mọi 枝番) và
> `107` với `PAT_BR = 0`. Và `PAT_BR` ở đây là **枝番 bảo hiểm**, không phải `TRT_SB`.
> Dùng nhầm một trong hai là ra sai **1 ↔ 3**.

---

## 3. ⚠️ Luồng này GHI DB

Khác hẳn `AccountingFocusedDay` (luồng đó **dừng** ở cổng ngày nên không ghi gì).

Muốn đọc được `UNPAID.SFLG` thì phải để `LetAccData2` chạy qua `deleteTrtDtUnPaid` +
insert — tức **ghi thật**, mà `modAcc.cs` **không có transaction nào** để lui.

Fixture chụp ảnh `UNPAID` của bệnh nhân trước, khôi phục ở `[OneTimeTearDown]`. Đó là
**đường lui, không phải giấy phép** — trỏ `patient.patNo` vào bệnh nhân TEST, và bật
`parity.allowSave`.

### Chuỗi hộp thoại thật (đo 2026-08-26)

```
[1] 「処置データチェックでエラーがありました。このまま続けますか?」  [OK, Cancel, Close]     → OK
[2] 「会計処理を行う日が本日でありません。よろしいですか。」          [OK, Cancel, Close]     → OK
[3] 「既に、¥1,020…未清算データ(¥0)を作成してよろしいですか?」       [Yes, No, Close]        → はい
[4] 入金指定 (frm203027)                          [F1 指定なし, F9 登録, F10 戻る]           → 指定なし
```

Bước **[3] phải trả lời はい**. `AccountingFlow.WalkToChgAccData` trả lời 「いいえ」 —
đúng với mục tiêu của lớp đó (đi tới 会計データ修正) nhưng **ngược hẳn** mục tiêu ở đây:
「いいえ」 nghĩa là không tạo `未精算`, nên không có dòng nào để đọc `SFLG`. Vì vậy luồng
này có `UnpaidCreationFlow` với bộ luật riêng.

> `入金指定` **đổi vai giữa hai luồng**: bên `AccountingFlow` nó là *dấu hiệu đi nhầm
> nhánh*; ở đây nó nằm **trên đường đúng** (`modAcc.cs:602`, chỉ bung khi `pNYUKIN`).

---

## 4. Dữ liệu seed — CỐ ĐỊNH, không tự gỡ

`sflg = 3` đòi **hai** điều cùng lúc: ngày đang xét **có** 初診, **và** bệnh nhân **đã
từng** 初診 **trước** tháng. Dữ liệu gốc không bệnh nhân nào thoả cả hai:

| Bệnh nhân | Ngày trong tháng | 初診 trong ngày | 初診 trước tháng |
|---|---|---|---|
| 10 | 08-03 / 08-14 | có / không | **0** |
| 9 | 08-11 | không | 2 |
| 12138 | 08-04 | không | 2 |

Nên tiền đề được seed **một lần, cố định, vào CẢ HAI DB**:

| | SQL Server `SIM2000` | Postgres `t_tenant1` |
|---|---|---|
| Bảng | `TRNTRN` | `trn_trn` |
| Bệnh nhân | 10 | 10 |
| Ngày | 2026-07-20 | 2026-07-20 |
| `disp_no` (mốc) | 9001 | 9001 |

Sau seed: bệnh nhân 10 ngày **08-03** → `sflg` phải ra **3**, ngày **08-14** → **2**.

> **Probe KHÔNG tự seed và KHÔNG tự gỡ.** Làm vậy thì mỗi lượt chạy bên WinForm lại
> xoá mất tiền đề và hai DB lệch nhau ngay — đúng lúc cần chúng giống hệt nhau.
> Seed **chỉ gỡ khi được yêu cầu**.

### Ba điều đã trả giá khi seed

1. **Chỉ thêm lịch sử QUÁ KHỨ**, không đụng ngày đang test. Nhờ vậy cùng bệnh nhân,
   cùng ngày, chỉ khác một dòng quá khứ mà `sflg` lật **1 → 3** — cô lập đúng
   `getKaikeiPastSyosinCnt`.
2. **Nhân bản một dòng 初診 có thật** (`INSERT…SELECT`) thay vì tự dựng dòng mới:
   `TRNTRN` có 84 cột / `trn_trn` có 90 cột, phần lớn `NOT NULL`.
3. **Mỗi DB bắt một lỗi khác nhau**, vì khoá chính khác nhau:

   | DB | Lỗi | Cột phải loại khỏi `INSERT` |
   |---|---|---|
   | SQL Server | `Cannot insert explicit value for identity column` | `SEQ` — IDENTITY, và nằm trong PK `PAT_NO/TRT_DT/DISP_NO/SEQ` |
   | Postgres | `duplicate key violates "trn_trn_pkey"` | `id` — PK **surrogate**, default sinh tự động nhưng **không phải `nextval`** |

4. **Ngày seed = 20 tháng trước**, cố ý tránh trùng số ngày với 3 và 14: dòng tháng cũ
   vẫn hiện trên `grdRegi` dạng `linekbn 99`, trùng ngày thì `RowForDay` tóm nhầm và F8
   chỉ nhận 「当月以外の操作はできません」.

### Gỡ seed (chỉ khi được yêu cầu)

```sql
DELETE FROM TRNTRN            WHERE pat_no = 10 AND disp_no = 9001;  -- SQL Server
DELETE FROM t_tenant1.trn_trn WHERE pat_no = 10 AND disp_no = 9001;  -- Postgres
```

---

## 5. Đã đo được

| | Giá trị | |
|---|---|---|
| `SFLG` ngày 08-03 (trước seed) | **1** | khớp oracle |
| `ATT_DR` | **16** | WinForm ghi `ModCommon.pintDrNo` (担当医, `modAcc.cs:640`) — báo cáo nói web hardcode `0` ⇒ **lệch thật** |

---

## 6. Gồm những file gì

| File | Việc |
|---|---|
| `UnpaidSyosinDb.cs` | ORACLE tính lại `intSyosin` từ DB; đọc/khôi phục `UNPAID`; công cụ seed |
| `UnpaidCreationFlow.cs` | Lái F8 tới đúng nhánh **tạo** 未精算 (luật riêng, khác `AccountingFlow`) |
| `UnpaidSyosinProbeTests.cs` | `[Explicit]` PROBE — đo, không assert |
