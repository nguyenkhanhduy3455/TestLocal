# G1 — 薬剤使用量選択 (frm203020)

Nửa **WinForm** của điểm parity G1.

> **Cập nhật 2026-09-09** — bản web ĐÃ port màn này (`ochacom-saas` nhánh
> `feat/inp-drug-qty-select`: `drug-qty-selection-dialog.tsx` +
> `POST /tenant/treatment/drug-qty`). Mô tả 「web chưa có」 bên dưới giữ lại làm
> bối cảnh của lúc probe; cột 「Web」 ở mục 1 đã cập nhật theo bản port.

> **Trạng thái: ĐỦ BỘ, parity SẠCH.** Probe 4/4 + fixture assert 8/8 (WinForm) và
> 8/8 (Playwright) đã chạy XANH trên máy thật. Điểm lệch tìm được ở §9.2 **đã được
> sửa** (`ochacom-saas` 6c50e538b) và cả hai vế chạy lại đều khớp.
> Vế Playwright đã có — xem mục 4. Số đo nguyên văn ở **mục 7**, tổng kết ở **mục 8**.
> Luật F1: **probe trước, assert sau.** Probe đã trả lời xong 11/11 câu và bắt được
> **sáu lỗi harness** (§10), nên fixture assert mới có căn cứ để viết.

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
| a | `free_wd` (cột 72 → `trn_trn.freewd`) | chuỗi 使用量 ngăn bằng dấu phẩy | ~~không có nhánh thuốc~~ → **đã port**: `commitDrugPick` đặt `freewd` từ 確定, và `GET /drug-rx?freeWd=` dựng lại tên thuốc theo 使用量 mới (`DrugNameEditor.Build(..., freeWd)`) |
| b | 点数 tính từ 薬価 | `getPoint(薬価合計, 1)` — frm203020.cs:492-518 | ~~lấy thẳng `mst_trt.score1`~~ → **đã port**: `DrugQtyCalculator.Point` (BE). `score1` giờ chỉ là giá trị khi KHÔNG qua hộp thoại |
| c | Lưới nội bộ 薬剤名/薬価/使用量/単位/薬価計 + 薬価合計 + 点数 | có | **đã port**: `drug-qty-selection-dialog.tsx`; mọi con số do BE trả (`POST /tenant/treatment/drug-qty`), FE không giữ bản sao công thức |

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

Vế Playwright: `web-tenant-tests/tests/dialogs-selection/drug-qty-selection-dialog.spec.ts`
(viết 2026-09-09, sau khi web port màn này ở nhánh `feat/inp-drug-qty-select` của
`ochacom-saas`).

| WinForm (ở đây) | Playwright | Câu hỏi |
|---|---|---|
| `Tc0_ProbeMasterData` | — | Master có gì; oracle có khớp `SCORE1` |
| `Tc1_ProbeOpenAndShape` | 「bung ra với đúng thành phần…」 | Hộp thoại mở ra hình dạng gì |
| `Tc2_ProbeChangeAmount` | 「click vào dòng làm 使用量 +1…」 · 「Escape là 確定…」 | Click / gõ có đổi 数量 không; 確定 đẩy gì về lưới |
| `Tc3_ProbeReopenAndControl` | 「mã đối chứng (f2 = 0)…」 · 「F10 戻る…」 | Bẫy phiên + mã đối chứng |

Hai vế **cố ý đo cùng một mã** (`605/0` 「ｵｾﾞｯｸｽ150ｍｇ３T」, đối chứng `606/0`) để số đo
so thẳng được với nhau. Vế WinForm vẫn là **đặc tả hành vi đúng** — số đo ở mục 7 chính
là thứ bên kia phải khớp.

Vế Playwright KHÔNG hardcode số của mã nào: nó tính lại kỳ vọng từ
`mst_trt` + `mst_drug_rx` + `mst_drug` ngay trong spec, rồi kiểm tréo bằng đúng phát
hiện ở mục 3 — với 使用量 mặc định thì `点数` tính từ 薬価 phải trùng `SCORE1`. Nghĩa là
nếu công thức 15円/10円 bên web sai, testcase ĐẦU TIÊN đỏ ngay, không phải đợi tới lúc
đổi 数量.

Điều **chưa** kiểm được bên Playwright: KQ-10 (`dataLineSource` của singleton
`frm203016`, mục 5.5) là bẫy riêng của WinForm — web không có singleton đó.

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
ô 使用量. Không có cách nào chọn một dòng mà không làm số nhảy — **đo được**: KQ-7.

Không cần tránh: `DataGridView` mặc định `EditOnKeystrokeOrF2`, nên `TypeCount` **gõ
thẳng chữ số** và phím đầu tiên vừa mở editor vừa **thay** nội dung cũ. Rồi **Tab** để
rời ô cho `CellValidating` chạy — ↓ vô dụng khi lưới chỉ một dòng, `F2` bị chính hộp
thoại nuốt (`base.btnF2_Click`, :138-140). Cả hai đều là lỗi harness đã trả giá, xem
mục 7 lô `Tc2`.

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

### 2026-09-09 11:15 — `Tc0_ProbeMasterData` trên máy thật · **XANH**

`ochacom-win` · bệnh nhân **10** · 診療日 **2026-08-03** · `MST_TRT266`.

```
KQ-1  MST_TRT266 đang có 1 dòng F2 = 1  (đã tính dòng probe vừa seed ⇒ nền là 0 ✔)
KQ-2  getPoint(薬価合計 ở 数量 MẶC ĐỊNH) == SCORE1 cho MỌI mã thuốc còn hiệu lực
KQ-2  ĐỐI TƯỢNG = 605/0 「ｵｾﾞｯｸｽ150ｍｇ３T」 score1=9 F2=0 F3=1 g_cnt=3 枝番×1 · 1 thành phần
KQ-2  ĐỐI CHỨNG = 606/0 「ｸﾗﾋﾞｯﾄ錠250ｍｇ2T」 score1=12 F2=0 F3=1 g_cnt=3 枝番×1 · 1 thành phần
KQ-2  616290167 「オゼックス錠１５０　１５０ｍｇ」 薬価 28.60 × 3錠 (cost_type=1)
KQ-2  使用量 [3] → 薬価合計 85.80 · 点数 9  · free_wd 「3」 · score1 9
KQ-2  使用量 [4] → 薬価合計 114.40 · 点数 11 · free_wd 「4」
```

Sau `OneTimeTearDown`, kiểm từ Mac: `SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1` → **0**,
`605/0` và `606/0` đều `F2 = 0`. **Vòng seed/trả lại chạy đúng.**

### 2026-09-09 11:18 — `Tc1_ProbeOpenAndShape` trên máy thật · **XANH**

```
KQ-3  gõ mã 605 (1 枝番) ⇒ 処置選択 KHÔNG hiện — ĐÚNG như đọc từ modMain.cs:474.
      薬剤使用量選択 = mở · không hộp thoại lạ nào.
KQ-4  lưới có 1 dòng, 5 ô ra tới UIA, NGUYÊN VĂN:
      [オゼックス錠150 150mg] [28.60] [3] [錠] [85.8]
      ⇒ CellFormatting KHÔNG để lại dấu cách nào đọc được qua UIA.
      ⇒ 薬価計 in 「85.8」 (editFloatToString = float.ToString), còn 薬価合計 in 「85.80」.
KQ-5  vừa mở: 使用量=[3] 薬価合計=「85.80」 点数=「9」
      oracle nói 薬価合計 =「85.80」· 点数 =「9」· score1 = 9      ⇒ TRÙNG KHÍT
KQ-6  nút: [F9  確定, F10  戻る, Minimize, Maximize, Close]   (hai dấu cách sau số F)
KQ-11 「F10 戻る」: hộp thoại đóng ✔ · 月計点数 413 → 413 (KHÔNG đổi ✔)
      dòng thuốc VẪN nằm trên lưới sau khi huỷ:
      [14] 3 | (null) | オゼックス錠150 150mg 3T    1日3回朝昼夕食後 服用  3日分 | 9 | 3
```

**Hai lỗi HARNESS lộ ra ở lô này, đã sửa** (đây là lý do F1 tồn tại):

1. **Ô 薬価 đọc ra tên thuốc.** Ba cột chứa 「薬」 (`薬剤名称` / `薬価` / `薬価計`); bản đầu
   chỉ loại 「計」 nên 「薬　剤　名　称」 khớp trước. Dòng in ra thành
   「薬価 オゼックス錠150 150mg × 3錠」 — **sai mà trông vẫn hợp lý**.
   Sửa: loại cả 「剤」 lẫn 「計」 (`DrugAmountDialog.CostCell`).
2. **単位 trên lưới bị RÚT GỌN: 「錠」 → 「T」** (`editDrugUnitToShortUnit`,
   EditControl.cs:1160-1190). Dò 数量 bằng 「錠」 thì không khớp gì, và testcase sẽ kết
   luận 「free_wd không tới nơi」 — đổ oan hoàn toàn cho app.
   Sửa: `DrugAmountFlow.ShortUnit` + `AmountsInRowText` nhận cả hai dạng.

### 2026-09-09 11:25 — `Tc2_ProbeChangeAmount` trên máy thật · **XANH**

```
KQ-7  1 cú click vào ô 薬剤名称 dòng 0:
      使用量=[3] 薬価合計=「85.80」 点数=「9」  →  使用量=[4] 薬価合計=「114.40」 点数=「11」
      Δ使用量 = [1] · Δ点 = 2 · oracle nói 「114.40」/「11」        ⇒ TRÙNG KHÍT
KQ-8  gõ 使用量 = 「10」 rồi rời ô: ĐỌC RA 使用量=[5] 薬価合計=「143.00」 点数=「14」
      oracle nói 「286.00」/「29」                                  ⇒ LỆCH — nhưng là LỖI HARNESS
KQ-9  確定 với hộp thoại ĐANG HIỂN THỊ 点数=「14」 ⇒ lưới nhận:
      [14] 3 | (null) | オゼックス錠150 150mg 10T    1日3回朝昼夕食後 服用  3日分 | 29 | 3
      数量 đọc ra từ ô 療法・処置: [10]   (gốc master là 3)
      月計点数 413 → 500 (Δ 87 = 29 điểm × 3 回)
```

**KQ-8 và KQ-9 mâu thuẫn nhau — và KQ-9 mới là sự thật.** Giá trị 「10」 gõ vào **CÓ**
tới nơi: 確定 đẩy `free_wd = 10` về lưới, ô 療法・処置 in 「10T」, 点 = **29** đúng bằng
oracle của 使用量 = 10. Cái sai là **phép đọc của harness**, không phải app:

> **Lỗi harness #3 — mũi tên ↓ không rời được ô khi lưới chỉ có MỘT dòng.**
> Ô không mất tiêu điểm ⇒ `CellValidating` (:269-301) chưa chạy ⇒ 薬価計 / 薬価合計 /
> 点数 vẫn là số của bước TRƯỚC, và `Capture` đọc đúng số cũ đó. Validation chỉ chạy lúc
> bấm 「F9 確定」 (nút lấy tiêu điểm) — nên `setPacData` vẫn lấy đúng 「29」.
> Sửa: rời ô bằng **Tab** (`StandardTab = true`, Designer:130).
>
> **Lỗi harness #4 — `F2` bị chính hộp thoại nuốt.** `formBase_KeyDown` chuyển F2 sang
> `base.btnF2_Click` (:138-140) ⇒ editor không mở. Không cần F2: `DataGridView` mặc định
> `EditOnKeystrokeOrF2` nên **gõ thẳng chữ số vừa mở editor vừa thay nội dung**.

Kết luận nghiệp vụ rút ra từ KQ-9 (đây là **đặc tả** cho vế web):

| Mốc | Giá trị |
|---|---|
| `free_wd` → ô 療法・処置 | 「オゼックス錠150 150mg **10T**」 — 数量 mới, 単位 **rút gọn** |
| 点数 dòng lưới | **29** = `getPoint(28.60 × 10, 1)`, **không** phải `score1 = 9` |
| 月計点数 | +87 = 29 điểm × 3 回 |
| `回数` | vẫn là `g_cnt` = 3 — 数量 và 回数 là **hai thứ khác nhau** |

### 2026-09-09 11:30 — `Tc2` chạy lại sau khi sửa · **XANH, khớp oracle từng số**

```
KQ-8  gõ 使用量 = 「10」 rồi Tab:
      使用量=[4] 薬価合計=「114.40」 点数=「11」  →  使用量=[10] 薬価合計=「286.00」 点数=「29」
      oracle nói 「286.00」/「29」/free_wd「10」                     ⇒ TRÙNG KHÍT
KQ-9  確定 với 点数=「29」 ⇒ lưới nhận 「…10T…」 | 29 | 3 · 月計 413 → 500 (Δ 87)
```

### 2026-09-09 11:35 — `Tc3_ProbeReopenAndControl` trên máy thật · **XANH**

```
KQ-10 lượt mở thứ HAI trong cùng phiên app: 処置選択 KHÔNG hiện · 薬剤使用量選択 = MỞ
      薬価合計=「85.80」 点数=「9」 · [0] 「オゼックス錠150 150mg」 薬価 28.60 × 3錠 = 85.8
KQ-11 ĐỐI CHỨNG 606/0 (F2 = 0): 薬剤使用量選択 = KHÔNG mở, không hộp thoại lạ nào
      ⇒ cửa mở hộp thoại ĐÚNG là F2.
```

**KQ-10 — nghi vấn ở mục 5.5 KHÔNG xảy ra** (trong điều kiện này): mở lại lần thứ hai
trong cùng phiên app vẫn được. Nhưng lượt chạy này **không hề đi qua đường 処方箋
`ID210002`**, mà đó mới là chỗ duy nhất gán `dataLineSource` (frm203002.cs:8804). Nên
kết luận đúng là: *「mở lại nhiều lần thì không sao」*, **chưa phải** *「`dataLineSource`
vô hại」*. Vẫn giữ nguyên khuyến cáo ở mục 5.5.

**KQ-11 là mảnh ghép làm mọi số ở trên thành kết luận.** Không có nó thì 「hộp thoại mở
ra」 có thể là do bất cứ thứ gì; có nó rồi thì cùng một đường đi, cùng một loại mã, chỉ
khác đúng cột `F2` — một bên mở, một bên không.

Dòng này cũng xác nhận **lỗi harness #1 đã sửa**: ô 薬価 giờ đọc ra `28.60`, không còn
đọc ra tên thuốc.

---

## 8. Tổng kết — 4/4 lô XANH, oracle khớp từng số

| Lô | Kết quả | Điều chốt được |
|---|---|---|
| `Tc0` | XANH | `getPoint == SCORE1` ở 数量 mặc định, **63/63 mã**; seed/trả lại `F2` chạy đúng |
| `Tc1` | XANH | 処置選択 không hiện; hộp thoại 5 cột; 薬価合計「85.80」/点数「9」 == oracle; 戻る không ghi gì |
| `Tc2` | XANH | click +1 · gõ tay · 確定 đẩy `free_wd` → lưới in 「10T」, 点 **29**, 月計 +87 |
| `Tc3` | XANH | mở lại lần 2 vẫn được; **đối chứng `F2 = 0` KHÔNG mở** |

**Kiểm sau cùng từ Mac:** `SELECT COUNT(*) FROM MST_TRT266 WHERE F2 = 1` → **0**;
`605/0` và `606/0` đều `F2 = 0`; `TRNTRN` của bệnh nhân 10 **không có dòng 605/606 nào**
(không lượt nào bấm F9 登録).

**Bốn lỗi HARNESS bị probe bắt được — không lỗi nào thuộc về app.** Cả bốn đều thuộc
loại "sai mà trông vẫn hợp lý", tức là nếu viết assert trước rồi chạy thì cả bốn đều
hiện ra dưới dạng 「app sai」:

| # | Lỗi | Nếu không bắt được thì testcase sẽ nói gì |
|---|---|---|
| 1 | Ô 薬価 khớp nhầm cột 薬剤名称 (ba cột cùng chứa 「薬」) | 「薬価 đọc ra tên thuốc」 |
| 2 | 単位 trên lưới bị rút gọn 「錠」→「T」 | 「free_wd không tới nơi」 |
| 3 | ↓ không rời được ô khi lưới một dòng ⇒ chưa `CellValidating` | 「gõ 数量 không ăn」 |
| 4 | `F2` bị `formBase_KeyDown` nuốt | như trên |

---

## 9. Parity WinForm ⇄ Web — đã chạy cả hai vế

`DrugAmountTests` (WinForm) và `drug-qty-selection-dialog.spec.ts` (Playwright) đối xứng
1-1 và **cố ý đo cùng một mã**. Master hai bên trùng khít (kiểm 2026-09-09):
`605/0` score1 9 · f3 1 · g_cnt 3 · 薬価 28.60/錠 · cnt 3 — `606/0` score1 12 —
cả hai DB đều có **0** dòng `f2 = 1`.

### 9.1 Kết quả chạy · 2026-09-09

| # | Testcase | WinForm 605 | Web 605 | WinForm 690 | Web 690 |
|---|---|:---:|:---:|:---:|:---:|
| 1 | bung ra với đúng thành phần + tổng khớp master | ✅ | ✅ | ✅ | ✅ |
| 2 | click vào dòng ⇒ 使用量 +1, tổng/点数 tính lại | ✅ | ✅ | ✅ | ✅ |
| 3 | dòng 薬価固定 (`cost_type 3`) không đổi khi click | ⊘ | ⊘ | ✅ | ✅ |
| 4 | Escape là 確定 ⇒ dòng nhận 点数 vừa tính | ✅ | ✅ | ✅ | ✅ |
| 5 | mã đối chứng `f2 = 0` KHÔNG mở hộp thoại | ✅ | ✅ | ✅ | ✅ |
| 6 | F10 戻る giữ nguyên 点数 mặc định | ✅ | ✅ | ✅ | ✅ |
| 7 | gõ thẳng 使用量 ⇒ `CellValidating` tính lại | ✅ | ✅ | ✅ | ✅ |
| 8 | 確定 ⇒ ô 療法・処置 dựng lại với 数量 mới ¹ | ✅ | ✅ | ✅ | ❌→✅ |

⊘ = skip có lý do (mã 605 không có thành phần `cost_type 3`).
¹ Ô 療法・処置 của testcase này **luôn khớp** ở cả hai vế. ❌ ban đầu nằm ở assert
**回数** vốn ở chung testcase — với `690` (`med_kbn = 54`, `usage_nm` rỗng) thì
`trt_cnt` không hề xuất hiện trong ô 療法・処置, nên nhãn của dòng bảng này từng gây
hiểu nhầm.

**Sau khi sửa (2026-09-09): WinForm 7/7 + 8/8 · Web 7/7 + 8/8 — hai vế khớp hoàn toàn.**

### 9.2 ĐIỂM LỆCH ĐÃ TÌM RA VÀ ĐÃ SỬA: `回数` khi `g_cnt = 0`

> **Trạng thái: ĐÃ SỬA** — `ochacom-saas` commit `6c50e538b`
> 「薬剤行の 回数 に無い下限を敷かない」. Mục này giữ lại làm hồ sơ.

⚠️ **Đây KHÔNG phải nợ của 薬剤使用量選択.** `modMain.cs:412` gán `cnt = g_cnt` cho
**mọi** pick thuốc, và `commitDrugPick` là đường mọi pick thuốc của web — nên pick `690`
lúc `f2 = 0` (không hộp thoại nào) đã lệch sẵn từ trước. Hộp thoại chỉ làm nó lộ ra.
Đó là **nợ của đường pick thuốc**, và bản sửa vì thế nằm ở `commitDrugPick`.

```
WinForm  modMain.cs:410-413  rsNewTrt["cnt"] = editStringToInt(g_cnt)     ⇒ 回 = 0
Web      commitDrugPick      trtCnt: resolved.defaultCnt > 0 ? … : 1      ⇒ 回 = 1
```

Đo trên máy thật với `690/0` (`g_cnt = 0`), sau khi gõ 使用量 = 10 rồi 確定:

```
WinForm  「OA(1~2歯)   スキャンドネストカートリッジ3% 1.8mL 10A」 | 点 168 | 回 0
         (trace TcG8: 「editor dang mo voi 「0」 — Enter de dong」)
Web      cùng dòng, cùng 点 168, nhưng 回 = 1
```

Với `605/0` (`g_cnt = 3`) hai bên đều ra `回 = 3` ⇒ **chỉ mã `g_cnt = 0` mới lộ ra**, và
dữ liệu dev chỉ có `690` như thế trong cả dải 600–699.

**Hệ quả là tiền, không phải hiển thị:** `回 = 0` thì dòng không cộng gì vào 月計点数;
`回 = 1` thì cộng trọn 168 điểm.

**Có HAI chỗ kẹp, không phải một** — bỏ một chỗ là chưa đủ, vì chỗ thứ hai đọc lại
`drugPick.trtCnt` mà chỗ thứ nhất đã kẹp:

```
treatment-entry-detail.tsx :5106  trtCnt: resolved.defaultCnt > 0 ? … : 1   (đường 日計 footer)
treatment-entry-detail.tsx :5121  const cnt = drugPick.trtCnt > 0 ? … : 1   (đường ghi đè dòng có sẵn)
```

Cả hai đã bỏ ở `6c50e538b`. Chạy lại 2026-09-09:

| Lượt | Trước sửa | Sau sửa |
|---|---|---|
| Web · 690 (qua hộp thoại) | ❌ `Expected 0, Received 1` | ✅ 8/8 |
| Web · 605 (hồi quy) | ✅ | ✅ 7/7 (1 skip) |
| Web · control = 690, `f2 = 0` | *(chưa có assert)* | ✅ 7/7 (1 skip) |
| WinForm · control = 690, `f2 = 0` | *(chưa có assert)* | ✅ |

**Bán kính hồi quy = 0:** `690` là mã `g_cnt = 0` **duy nhất** trong 600–699, và không
spec nào khác pick nó. (Cả master có 1580 dòng `g_cnt = 0`, nhưng chỉ nhánh 600–699 mới
đọc `g_cnt` — mã khác đi qua `CalcCnt.getCalcCnt`, modMain.cs:359/:415.)

**Lỗ hổng đã bịt:** testcase 「mã đối chứng (`f2 = 0`)」 ở **cả hai vế** nay assert
`回 = g_cnt`. Đó chính là đường mà điểm lệch này đi lọt, và trước đây nó chỉ chạy với
`606` (`g_cnt = 3`) nên không thể bắt được. Chạy nhánh đó bằng
`TEST_DRUG_CONTROL_TRT_CD=690` (web) và `-ControlTrtCd 690` (WinForm).

**Còn để lại cho phòng khám:** `690` có `score1 = 19` mà `g_cnt = 0` — nghĩa là nếu
không ai gõ đè 回数 thì dòng đó vĩnh viễn 0 điểm. Là cố ý hay bỏ sót dữ liệu thì phải
hỏi phòng khám; đó là câu hỏi về master, không phải về code, và không chặn bản sửa trên.

### 9.3 Những chỗ hai bên KHỚP mà đáng ghi

- **Gộp 「OA+…」 chỉ khi `free_wd` rỗng.** 戻る ⇒ 「OA+スキャンドネスト…」 (một dòng);
  確定 ⇒ hai dòng riêng. `editDrugName` (EditControl.cs:1091-1099) và
  `DrugNameEditor.Build` (cùng cờ `!hasFreeWd`) khớp nhau.
- **単位 rút gọn** 「錠」→「T」, 「管」→「A」 — cả hai cùng bảng.
- **Ô 回 mở sẵn editor sau 確定** ở cả hai bên (WinForm mở editor ô 回; web
  `setEditingCell(RegiCol.kai)`).
- **`点数` ở 使用量 mặc định trùng `score1`** cho toàn bộ 63 mã — tiền đề của cả cặp.

### 9.4 月計点数 — cố ý KHÔNG assert ở cả hai vế

Mốc 「Δ月計 = 点 × 回」 chỉ đúng khi lượt chốt là thay đổi duy nhất giữa hai lần đọc.
Cả hai bộ đều chạy nhiều testcase trong một phiên, mỗi lượt để lại một dòng mà ô 回 còn
đang mở editor, và `Calc_MDPoint` chốt chúng vào 月計 ở thời điểm khác. Đo được: TcG8
thấy Δ = 264 trong khi dòng của chính nó đáng 87. Số sạch lấy từ probe (phiên riêng):
**413 → 500, Δ = 87 = 29 × 3**.

---

## 10. Sáu lỗi HARNESS mà probe/parity bắt được

Không lỗi nào thuộc về app. Cả sáu đều "sai mà trông vẫn hợp lý" — viết assert trước rồi
chạy thì cả sáu đều hiện ra dưới dạng 「app sai」.

| # | Lỗi | Nếu không bắt được thì testcase sẽ nói gì |
|---|---|---|
| 1 | Ô 薬価 khớp nhầm cột 薬剤名称 (ba cột cùng chứa 「薬」) | 「薬価 đọc ra tên thuốc」 |
| 2 | 単位 trên lưới bị rút gọn 「錠」→「T」 | 「free_wd không tới nơi」 |
| 3 | ↓ không rời được ô khi lưới một dòng ⇒ chưa `CellValidating` | 「gõ 数量 không ăn」 |
| 4 | `F2` bị `formBase_KeyDown` nuốt | như trên |
| 5 | Dò dòng theo TÊN ⇒ vớ dòng của lượt TRƯỚC | 「nhánh ghi đè 点数 không chạy」 |
| 6 | Bộ lọc dòng vứt mất thành phần có 使用量 RỖNG | 「click vào dòng 薬価固定 vẫn làm số nhảy」 |

Bên Playwright vấp hai lỗi cùng họ: dò dòng theo tên (giải bằng `waitForAddedRow`) và đọc
ô 回 bằng `innerText` trong khi ô đang là `<input>` (⇒ `Number('') = 0`, trông y như
「app ghi 回 = 0」).

### Bước tiếp theo

- Quyết định về điểm lệch §9.2 (`回数` khi `g_cnt = 0`).
- Nhánh `cost_type '3'` chỉ chạy được với mã 690; nếu master thật có nhiều mã như vậy
  thì nên chạy thêm vài mã để chắc.
