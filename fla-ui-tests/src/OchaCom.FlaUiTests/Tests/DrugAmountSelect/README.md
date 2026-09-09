# G1 — 薬剤使用量選択 (frm203020)

Nửa **WinForm** của điểm parity G1. Bản web **chưa port** màn này: 0 hit trong
`ochacom-saas`.

> **Trạng thái: THÔNG LUỒNG + PROBE. Chưa có testcase assert.**
> Chưa ai mở được hộp thoại này trên máy thật (xem mục 2), nên mọi assert viết bây giờ
> đều là phỏng đoán. Luật F1: **probe trước, assert sau.** `DrugAmountTests` sẽ được viết
> sau khi có file `select-drug-amount-KQ.txt` đầu tiên.

---

## 1. Hộp thoại này là gì, và mở ra bằng đường nào

Khi chốt một mã 処置 mà `mst_trt.F2 = 1` (数量変更可), WinForm bung
**薬剤使用量選択** cho người dùng sửa 使用量 của từng thành phần thuốc **trước khi** dòng
rơi xuống lưới `grdRegi`.

```
gõ mã vào ô 点 của grdRegi
  └─ modMain.GetTrtmasCod  →  đếm số dòng master khớp mã
       ├─ intRowCnt == 1  →  frm203016_Hide_Let_Trt_Data(0)      (modMain.cs:474)
       │                       ⇒ 処置選択 KHÔNG BAO GIỜ HIỆN RA
       └─ intRowCnt >  1  →  showDialog(ID203016)                (modMain.cs:485)
                               ⇒ 処置選択 hiện, người dùng chốt 枝番
                    ↓  cả hai đường đều chạy tiếp vào:
  └─ frm203016.frmTrtSel_Let_Trt_Data
       └─ if (trtData.F2 == 1 && dataLineSource != ID210002)      (frm203016.cs:1426-1427)
            └─ showDialog(ID203020)   ← 薬剤使用量選択                (:1439)
                 └─ 確定 ⇒ setPacData ⇒ data.score + data.freeWd  (frm203020.cs:467-484)
            └─ selRec.intPoint  = data.score                      (:1450)
            └─ grdRegi[72, row] = data.freeWd                     (:1451)
       └─ ModSave.getDrugName(..., grdRegi[72])                   (:1462)
            └─ editDrugName ghi đè cnt[i] bằng free_wd            (EditControl.cs:1049-1055)
                 ⇒ 数量 mới hiện ra ngay trong ô 療法・処置
```

Ba thứ đi kèm mà bản web **chưa có**:

| # | Thứ | WinForm | Web |
|---|---|---|---|
| a | `free_wd` (cột 72 → `trn_trn.freewd`) | chuỗi 使用量 ngăn bằng dấu phẩy | có cột, nhưng **chỉ dùng cho 面入力 và 困難者加算** — không có nhánh thuốc. `DrugNameEditor.cs:25` ghi rõ 「The 数量変更 (free_wd) override is not wired」 |
| b | 点数 tính từ 薬価 | `getPoint(薬価合計, 1)` — frm203020.cs:492-518 | lấy thẳng `mst_trt.score1` — `ResolveDrugHandler.cs:33` |
| c | Lưới nội bộ 薬剤名/薬価/使用量/単位/薬価計 + 薬価合計 + 点数 | có | không có màn hình nào tương ứng |

---

## 2. ⚠️ Dữ liệu dev che mất cả màn hình này

Đo trên `SIM2000` ngày **2026-09-09**:

```sql
SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1;   -- 0
```

Bảng master đang áp dụng (`MST_TRT266`, hiệu lực từ 2026-06-01) có **63 mã dải 600–699**
với `mst_drug_rx` còn hiệu lực, và **không mã nào** có `F2 = 1`. Nghĩa là:

- không thao tác nào trên giao diện mở được 薬剤使用量選択;
- mọi lượt chạy "thử xem sao" đều **xanh vì chẳng đo gì**;
- và đó cũng là lý do bug parity này chưa ai vấp phải.

⇒ Luồng phải **seed**: bật `F2 = 1` cho đúng một dòng master, nằm sau cờ riêng
`drugAmount.allowSeed` (mặc định **tắt**), chụp ảnh — in ra — trả lại (F20).
Xem `DrugAmountDb.TakeF2Snapshot` / `RestoreF2`.

**Thứ bị sửa là bảng master dùng chung cả phòng khám**, không phải dữ liệu bệnh nhân test.
Vì thế cờ này **không** dùng chung `parity.allowSave`.

---

## 3. Oracle — và vì sao hai vế parity trùng khít ở điểm xuất phát

`DrugAmountDb.Point` là bản chép **nguyên văn** `frm203020.getPoint`. Chạy nó trên dữ
liệu thật với 使用量 **mặc định** (`mst_drug_rx.cnt`):

> **Đo được 2026-09-09 · SIM2000 · MST_TRT266 · 63 mã · 0 mã lệch**
> `getPoint(薬価合計 mặc định, 1) == MST_TRT266.SCORE1` cho **mọi** mã thuốc còn hiệu lực.

Đó chính là thứ làm bug ẩn đi: bản web trả `score1`, và ở 数量 mặc định `score1` **đúng**.
Sai chỉ xuất hiện khi người dùng đổi 数量 — mà web thì không có màn hình để đổi.

Ví dụ với mã mặc định của luồng (`605/0` 「ｵｾﾞｯｸｽ150ｍｇ３T」, 薬価 28.60/錠):

| 使用量 | 薬価合計 | WinForm 点数 | Web 点数 | free_wd |
|---:|---:|---:|---:|---|
| 3 (mặc định) | 85.80 | **9** | 9 | `3` |
| 4 (1 cú click) | 114.40 | **11** | 9 ✗ | `4` |
| 10 (gõ tay) | 286.00 | **29** | 9 ✗ | `10` |

Hai nhánh của `getPoint` mà **không được** rút gọn thành `ceil((cost-15)/10)+1`:

```
F3 == 2          → 0     (院外処方 — phòng khám không tính điểm thuốc)   :494-497
薬価合計 == 0     → 0                                                     :503
薬価合計 <  15    → 1     ← nhánh này nuốt mọi thay đổi nhỏ              :505
```

> **Chú thích trong source tự mâu thuẫn — bám theo CODE, không theo comment.**
> `ParamData.F3` khai 「1:院内処方 2:院外処方」 (frm203020.cs:31) còn `getPoint` lại chú
> nhánh `F3 == 2` là 「院内処方の場合」 (:494-495). Dữ liệu đứng về phía khai báo: 4 mã
> đang có `F3 = 2` (603, 622/1, 651, 660) đều mang `SCORE1 = 0`.

---

## 4. Bảng tương ứng với bên Playwright

| WinForm (ở đây) | Playwright | Câu hỏi |
|---|---|---|
| `Tc0_ProbeMasterData` | — | Master có gì; oracle có khớp `SCORE1` |
| `Tc1_ProbeOpenAndShape` | *(chưa có — web chưa port)* | Hộp thoại mở ra hình dạng gì |
| `Tc2_ProbeChangeAmount` | *(chưa có)* | Click / gõ có đổi 数量 không; 確定 đẩy gì về lưới |
| `Tc3_ProbeReopenAndControl` | *(chưa có)* | Bẫy phiên + mã đối chứng |

Cặp Playwright sẽ được viết **sau**, khi bên web có màn hình để so. Cho tới lúc đó, vế
WinForm này là **đặc tả hành vi đúng** — số đo ở mục 7 chính là thứ bên kia phải khớp.

---

## 5. Ba cái bẫy của luồng này

### 5.1 処置選択 thường **không** hiện — đừng chờ nó

`intRowCnt == 1` ⇒ `frm203016_Hide_Let_Trt_Data(0)` nạp form, chạy trọn
`frmTrtSel_Let_Trt_Data`, rồi `Close()` **mà chưa từng hiện ra** (frm203016.cs:107-127).
Phần lớn mã thuốc chỉ có một 枝番. `SigaToothFlow.EnterTreatment` chờ 処置選択 20 giây rồi
kết luận 「KHÔNG mở」 ⇒ **báo sai ở đây**. `DrugAmountFlow.OpenDialog` chờ **một trong hai**.

### 5.2 Hai form cùng có lưới tên `dgvView`, và chúng chồng lên nhau

`showDialog(ID203020)` nằm **bên trong** `frmTrtSel_Let_Trt_Data` (frm203016.cs:1439) nên
処置選択 vẫn đang mở phía dưới. `SigaToothFlow.Picker()` lui về 「modal nào có `dgvView` mà
không phải 病名選択」 ⇒ nó sẽ trả về **nhầm** chính 薬剤使用量選択.
`DrugAmountDialog.Find` nhận diện theo `txtCostSum` + `txtPointSum`;
`DrugAmountFlow.Picker()` lọc ngược lại.

### 5.3 Click để "chọn dòng" **đã đổi dữ liệu**

`CellClick` cộng 使用量 thêm 1 với **mọi** ô của dòng (frm203020.cs:303-330), không riêng
ô 使用量. Không có cách nào chọn một dòng mà không làm số nhảy.
`DrugAmountDialog.TypeCount` vì thế **ghi đè** (F2 → Ctrl+A → gõ) chứ không gõ nối thêm.

### 5.4 ⛔ Escape ở hộp thoại này là **確定**, không phải huỷ

`formBase_KeyDown` ánh xạ `Escape → btnF9_Click` (:153-155), và `End` cũng vậy
(:150-152). Đóng bằng nút **「F10 戻る」**.

### 5.5 Nghi vấn chưa đo: `dataLineSource` không bao giờ được đặt lại

Field của **singleton** `frm203016.Instance` (frm203016.cs:55). Chỗ gán **duy nhất** là
đường 処方箋 `ID210002` (frm203002.cs:8804), và **không có chỗ nào gán ngược về**. Nếu
instance sống sót qua `Close()` thì mọi lượt nhập thuốc sau đó trong cùng phiên app sẽ
rơi vào `if (dataLineSource != ID210002)` = false ⇒ hộp thoại không mở lại nữa.
Đó là câu **KQ-10** của probe. Cho tới khi có số đo: **đo 薬剤使用量選択 trước mọi thao
tác 処方箋** trong cùng một phiên.

---

## 6. Chạy

```powershell
# LUÔN từng -Case một (F7: mỗi vòng giao diện 2-3 phút, trần wrapper 15 phút)
.\run-select-drug-amount.ps1 -Probe -Seed -Case Tc0_ProbeMasterData      # chỉ DB, ~10s
.\run-select-drug-amount.ps1 -Probe -Seed -Case Tc1_ProbeOpenAndShape    # 1 vòng
.\run-select-drug-amount.ps1 -Probe -Seed -Case Tc2_ProbeChangeAmount    # 1 vòng
.\run-select-drug-amount.ps1 -Probe -Seed -Case Tc3_ProbeReopenAndControl # 2 vòng
```

Lô chạy: `Tc0` → `Tc1` → `Tc2` → `Tc3`. **Đọc `select-drug-amount-KQ.txt` sau mỗi lô**
trước khi chạy lô kế (F1/F2).

Không bật `-Seed` ⇒ fixture tự Ignore **trước khi mở app**, kèm lý do.

**Kiểm lại trước khi đóng máy:**

```sql
SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1;   -- phải về đúng số ban đầu (0)
```

Lượt chạy chết giữa chừng thì tìm dòng `ẢNH CHỤP F2` trong `.trx` rồi `UPDATE` tay về.

---

## 7. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.
> Để trống là lần sau đo lại từ đầu.

### 2026-09-09 — chỉ đo DB, **chưa chạm giao diện lần nào**

Máy Windows `ochacom-win` (100.86.177.68) **offline** (Tailscale: last seen 4h ago) nên
chưa chạy được vòng nào trên app thật. Số đo dưới đây lấy thẳng từ SQL Server trong
container `OCHASQLEXPRESS` trên máy Mac.

| Mốc | Giá trị |
|---|---|
| Bảng master áp dụng 2026-09-09 | `MST_TRT266` (2026-06-01 → 9999-12-31) |
| `SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1` | **0** |
| Mã dải 600–699 có `mst_drug_rx` còn hiệu lực | **63** |
| `getPoint(薬価合計 mặc định) != SCORE1` | **0 mã** (trùng khít hoàn toàn) |
| Mã có `F3 = 2` (⇒ 0 điểm) | 603, 622/1, 651, 660 — cả bốn đều `SCORE1 = 0` |

Ứng viên mặc định `605/0` 「ｵｾﾞｯｸｽ150ｍｇ３T」:

```
mst_drug_rx: dg_cd1 = 616290167, cnt1 = 3, app 20160401-99999999
mst_drug   : 「オゼックス錠１５０　１５０ｍｇ」 単位 錠  cost_type 1  薬価 28.60
mst_trt266 : SCORE1 = 9  F2 = 0  F3 = 1  G_CNT = 3  ACC_UNIT = 6  枝番 ×1
oracle     : 使用量 3 → 薬価合計 85.80 → 点数 9   (== SCORE1 ✔)
             使用量 4 → 薬価合計 114.40 → 点数 11
             使用量 10 → 薬価合計 286.00 → 点数 29
```

Đối chứng `606/0` 「ｸﾗﾋﾞｯﾄ錠250ｍｇ2T」: 621925701, 薬価 59.80, cnt 2 → 119.60 → 12 điểm,
`SCORE1 = 12`, `F2 = 0` (**giữ nguyên, không seed**).

### *(lần chạy trên app thật — chưa có)*

Cần điền: KQ-3 … KQ-11, kèm ảnh `artifacts\screenshots\`.
