# G2 — Path B của `editDrugName` (`mst_med`)

Nửa **WinForm** của điểm parity G2.

> **Trạng thái: THÔNG LUỒNG + PROBE, ĐÃ CHẠY — 6/6 câu đo được trên máy thật (§8),
> parity với hai spec Playwright SẠCH (§9). Chưa có testcase assert.**
> Luật F1 đã xong phần của nó: probe trả lời 5/6 câu, và **hai lỗi harness** bị bắt trong
> lúc đó (§4.1, §4.2). Giờ mới đủ căn cứ viết `DrugPathBTests` (assert) — kỳ vọng lấy từ
> `DrugPathBDb.PathBCandidate.ExpectedLines`, không hardcode.

---

## 1. Hai nhánh của `editDrugName`, và chỗ bản web dừng lại

```
EditControl.editDrugName(con, …, trt_cd, trt_sb, trt_cnt, trt_dt, dsp_trt, free_wd, blUsage)
  │
  ├─ mstDrugRXGroupData = MstDrugRX.getMstDrugRXListJoinMstDrug(...)   ← null khi 0 dòng
  │                                                                      (MstDrugRX.cs:214-219)
  ├─ if (mstDrugRXGroupData != null && dg_nm[0] != "")     ← PATH A  (:1048)  ĐÃ PORT
  │     tên thuốc (căn cột) + 数量 + 単位 → 用法 → 用量 「n日分」/「n回分」
  │
  └─ else                                                  ← PATH B  (:1136)  CHƯA PORT
        tbl  = TrtSel.getTrtSel(trt_dt)                                       (:1137)
        line ← MstTrt.getMstTrtDataYaku(tbl, cd, sb).trt_nm                   (:1138-1140)
        line ← SyoPac.getMstMed(cd, sb)              ← bảng MST_MED           (:1142-1148)
```

**Bản web không có path B.** `ResolveDrugHandler` trả `Found = false` khi `joined is null`,
và `commitDrugPick` dừng ngay:

```ts
if (!resolved.found || resolved.lines.length === 0) {
  await alertDialog('この薬剤コードは現在未対応です。')
  return                                    // ← treatment-entry-detail.tsx:5077-5079
}
```

⇒ **WinForm chèn một dòng; web không chèn gì.** Đó là toàn bộ điểm parity G2.

| | WinForm | Web |
|---|---|---|
| Dòng trên lưới | **CÓ** — 処置名 (+ 用法) | **KHÔNG** |
| Nguồn tên | `mst_trt.trt_nm` qua `getMstTrtDataYaku` | — |
| Nguồn 用法 | `MST_MED.usage` qua `SyoPac.getMstMed` | — (bảng chưa migrate) |
| Người dùng thấy | dòng thuốc bình thường | hộp thoại 「現在未対応です」 |

---

## 2. ⚠️ Dev không có ca nào rơi vào path B — phải seed

Đo trên `SIM2000` ngày **2026-09-09**:

| Mốc | Giá trị |
|---|---|
| Mã 600–699 trong `MST_TRT266` | **63** |
| …có `MST_DRUG_RX` phủ ngày test | **63** ⇒ path B **không bao giờ** chạy |
| Dòng `MST_MED` | **53** (14 cột) |
| Dòng `MST_MED` **mồ côi** (không có 処置 trong master) | **2** — `620/0` 「４Ｔ×５」, `647/1` 「２Ｔ×１４」 |
| Mã 600–699 **không** có dòng `MST_MED` | **12** (618, 630, 635, 643, 644, 648, 654, 656, 657, 662, 690, 622/1) |

> Mã mồ côi **không** dùng làm ứng viên được: gõ `620` thì `GetTrtmasCod` không tìm ra
> 処置 nào và app bung 「該当処置はありません」 (modMain.cs:487) — chưa tới được `editDrugName`.

⇒ Luồng **tạo mã riêng**: clone một dòng master có sẵn ra mã mới rồi chèn `MST_MED` cho
nó. Mã mới thì **đương nhiên** không có `MST_DRUG_RX` ⇒ rơi thẳng vào path B.

**Lượt chạy chỉ THÊM dòng rồi XOÁ — không sửa dòng nào đang có.** Vẫn nằm sau cờ riêng
`drugPathB.allowSeed` (mặc định **tắt**) vì bảng bị thêm vào là master dùng chung cả
phòng khám; và **không** dùng chung `drugAmount.allowSeed` (bên đó *sửa* `mst_trt.F2`
của một dòng thật — rủi ro khác hẳn).

---

## 3. Ứng viên — trùng khít với vế Playwright

Cả ba mã lấy đúng hằng số của
`../web-tenant-tests/tests/treatment-grid/drug-path-b-mst-med.spec.ts`:

| Vai | Mã | Vì sao |
|---|---|---|
| **Nguồn clone** | `602/0` 「ﾒｲｱｸﾄMS錠100ｍｇ４T」 | `active_flg = 1`, `F2 = 0` (không mở 薬剤使用量選択 — đó là G1). Cũng là **đối chứng của chính phép seed**: nó **vẫn có** `MST_DRUG_RX` nên phải đi path A. |
| **Path B có 用法** | `698/0` 「ﾃｽﾄ院内調剤薬PB」 + `MST_MED` 「ﾃｽﾄ用法　毎食後　服用」 | đo được **cả hai** dòng |
| **Path B không 用法** | `699/0` 「ﾃｽﾄ院内調剤薬NM」 | mất dòng 用法 ⇒ tách đôi câu hỏi: dòng 1 từ `getMstTrtDataYaku`, dòng 2 từ `MST_MED` |

Tên seed **cố ý không chứa** 「日分」/「回分」, để câu hỏi 「path B có gắn hậu tố 用量 không」
không bị chính dữ liệu seed làm nhiễu. Cụm sinh 「n日分」 nằm bên trong nhánh A
(EditControl.cs:1118-1133) nên path B **không** có nó — nhưng đó là điều phải **đo**, không
phải điều được giả định.

Đối chiếu hai nhánh trên cùng một màn hình:

```
path A (602, còn 処置変換)  「ﾒｲｱｸﾄMS錠100ｍｇ４T…」 dựng từ mst_drug + 数量 + 単位 + 用法 + 用量
path B (698, không có)      「ﾃｽﾄ院内調剤薬PB」        ← trt_nm của master
                            「ﾃｽﾄ用法　毎食後　服用」   ← MST_MED, KHÔNG có 用量
```

⚠️ **Hàng rào (F22):** mã đích đã tồn tại ⇒ hoặc master thật dùng mã đó, hoặc một lượt
chạy trước chết giữa chừng. Cả hai trường hợp `SeedCodes` đều **dừng** và bắt dọn tay
chứ không ghi đè. Fixture cũng tự `Cleanup` một lượt **trước khi** seed.

---

## 4. Hai LỐI VÀO, một ô 療法・処置

`editDrugName` được gọi từ hai chỗ, và **cả hai** phải cho ra cùng một ô:

| Lối | Thao tác | Đường đi |
|---|---|---|
| **Gõ mã** | コードモード → gõ mã vào ô 点 → Enter | `GetTrtmasCod` → `frm203016_Hide_Let_Trt_Data` → `getDrugName` |
| **薬剤選択** | Shift+F6 → tab theo `grp` → double-click → 「F9 確定」 | `frmMed_LetData` (frm203002.cs:8791) → **cùng** `frm203016_Hide_Let_Trt_Data` → `getDrugName` |

Lối thứ hai đáng chú ý ở chỗ `frm203013.setData` trả `outList` mang `trt_nm` — nhưng đó
chỉ là **giá trị trung gian**: `frmMed_LetData` không tự ghi dòng, nó dựng `tblTrtSel`
rồi gọi chung đường chốt của 処置選択. Nên giá trị đọng lại trên lưới là kết quả
`getDrugName`, **không** phải `trt_nm` mà form kia đưa sang.

⛔ **Escape và End trên `frm203013` cũng đều là 確定** (frm203013.cs:166-174) — cùng họ
với frm203017/frm203020. Đóng bằng 「F10 戻る」.

### 4.1 Mở 薬剤選択: dùng dải phím Shift, đừng gửi tổ hợp phím

`frm203002.btnF6_Click` rẽ theo `ShiftFlg` (:826-838): tắt thì ra コメント, **bật mới ra
薬剤**. Mà `ShiftFlg` chỉ được đặt trong `BaseForm.editButtonPanel` — do `btnShift`, hoặc
do `Keys.ShiftKey` ở KeyDown/KeyUp (BaseForm.cs:613/:646). Flow bấm `btnShift` rồi bấm nút
mang chữ 「薬剤」: phím F rơi vào form đang giữ tiêu điểm (F15), và thứ tự KeyDown của một
tổ hợp là chuyện của bộ gõ — sai nhịp một cái là mở nhầm コメント mà không có dấu hiệu gì.

### 4.2 Chuyển tab: click TAB HEADER, và chờ lưới hiện ra

**Không có nút F1–F4 để bấm**: `_btnInfo` của `frm203013` khai cả bốn là `OCHA_OFF`
(:44-48) — chỉ 「F9 確定」/「F10 戻る」 hiện ra.

Và **lưới của một tab chưa từng hiện thì UIA không thấy gì bên trong**: WinForms chỉ tạo
handle cho control của `TabPage` khi trang ấy hiện lần đầu. Đo được 2026-09-09 (Tc5):
đọc `dgvTon` trước khi chuyển tab trả về **0 dòng** — trông y như 「mã seed không có
trong master」. `SelectTab` vì thế chờ đúng cái lưới của tab đó xuất hiện.

---

## 5. Ba cái bẫy

### 5.1 ⚠️ Ô 療法・処置 phải đọc NGUYÊN VĂN

Path B dựng **tối đa hai dòng** nối bằng `Environment.NewLine` (modSave.cs:2227-2233).
Nhưng `TreatmentGridOps.Snapshot` đọc ô qua `Txt.N`, và `Txt.N` **đổi mọi `\r\n` thành dấu
cách** (Txt.cs:17-25) ⇒ hai dòng thành một chuỗi phẳng. **Đếm số dòng trên bản đã phẳng là
xanh giả** (F23). Dùng `DrugPathBFlow.RawRyo`, đọc thẳng `Uia.ValueOf`.

Mỗi dòng còn được app chèn `CommonInp.REGIRYO_PADLEFT` = **hai dấu cách** ở đầu
(CommonInp.cs:35). `PathBResult.Lines` gỡ sẵn phần đệm đó.

### 5.2 「該当処置はありません」 ≠ 「path B ra rỗng」

Hai chuyện khác hẳn nhau: câu đầu là `GetTrtmasCod` không tìm ra 処置 nào (chưa tới
`editDrugName`); câu sau là path B chạy nhưng `getMstTrtDataYaku` trả null. Flow ghi
**nguyên văn** mọi hộp thoại gặp phải để không nhầm hai thứ.

`getMstTrtDataYaku` trả null khi `active_flg <> 1` **hoặc** `right(trt_nm,1) = '!'`
(MstTrt.cs:957-958) — `PathBCandidate.YakuRowVisible` kiểm sẵn.

### 5.3 Dò dòng mới bằng PHẦN CHÊNH, không bằng tên

Bài học 2026-09-09 của G1: mỗi testcase để lại một dòng mang cùng tên thuốc, nên
「dòng đầu tiên khớp tên」 vớ phải dòng của lượt **trước**. Flow chụp lưới trước khi gõ mã
rồi lấy phần chênh (`DrugAmountFlow.WaitForAddedDrugRow`).

---

## 6. Chạy

```powershell
# Lối GÕ MÃ
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc0_ProbeMasterData          # chỉ DB
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc1_ProbePathBRow            # 698
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc2_ProbeWithoutUsage        # 699
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc3_ProbeCloneSourceIsPathA  # 600, path A

# Lối 薬剤選択 (Shift+F6)
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc4_ProbeMedicineSelectPathA    # 600
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc5_ProbeMedicineSelectPathB    # 698
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc6_ProbeMedicineSelectNoUsage  # 699

# Hoặc cả fixture một lượt (~8 phút, vẫn trong trần 15 phút)
.\run-resolve-drug-path-b.ps1 -Probe -Seed
```

Không bật `-Seed` ⇒ fixture tự Ignore **trước khi mở app**, kèm lý do.

**Kiểm lại trước khi đóng máy:**

```sql
SELECT COUNT(*) FROM MST_TRT266 WHERE TRT_CD IN (698, 699);   -- phải là 0
SELECT COUNT(*) FROM MST_MED    WHERE TRT_CD IN (698, 699);   -- phải là 0
```

Lượt chạy chết giữa chừng thì dọn tay bằng đúng hai câu `DELETE` tương ứng — không có
dòng nào bị *sửa* nên không cần khôi phục gì.

---

## 7. Cặp Playwright — đối xứng 1-1

Bên web tách theo **lối vào**, hai file:

| WinForm (ở đây) | Playwright |
|---|---|
| `Tc1_ProbePathBRow` (gõ mã, 698) | `treatment-grid/drug-path-b-mst-med.spec.ts` — 「mã 薬剤 không có mst_drug_rx → …」 |
| `Tc2_ProbeWithoutUsage` (gõ mã, 699) | cùng file — 「…không có mst_drug_rx lẫn mst_med → chỉ còn 処置名称」 |
| `Tc3_ProbeCloneSourceIsPathA` (gõ mã, 600) | *(bổ sung 2026-09-09 — xem §7.1)* |
| `Tc4_ProbeMedicineSelectPathA` (Shift+F6, 600) | `dialogs-selection/medicine-selection-drug-name.spec.ts` — TC-1 |
| `Tc5_ProbeMedicineSelectPathB` (Shift+F6, 698) | cùng file — TC-2 |
| `Tc6_ProbeMedicineSelectNoUsage` (Shift+F6, 699) | cùng file — TC-3 |

Cả ba mã (`600` clone → `698`/`699`), tên và 用法 **trùng từng ký tự** với hằng số của
`medicine-selection-drug-name.spec.ts`, nên số đo so thẳng được.

> ⚠️ `drug-path-b-mst-med.spec.ts` mặc định clone từ **602** (`TEST_CLONE_TRT_CD`), còn vế
> WinForm và spec kia dùng **600**. Khác nguồn clone chỉ đổi `点`/`回` của mã seed, không
> đổi chuỗi đang đo — nhưng muốn so cả hai con số đó thì chạy nó với
> `TEST_CLONE_TRT_CD=600`.

### 7.1 Chỗ vế web còn thiếu

Spec lối **gõ mã** không có testcase **path A đối chứng** (vế WinForm là `Tc3`). Thiếu nó
thì 「thấy hai dòng path B」 chưa loại được khả năng 「mã thuốc nào gõ vào cũng ra hai
dòng」. Đã bổ sung — xem §9.

---

## 8. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.
> Để trống là lần sau đo lại từ đầu.

### 2026-09-09 — `ochacom-win` · bệnh nhân **10** · 診療日 **2026-08-03** · `MST_TRT266`

Seed: clone `600/0` → `698/0` 「ﾃｽﾄ院内調剤薬PB」 (+`MST_MED` 「ﾃｽﾄ用法　毎食後　服用」) và
`699/0` 「ﾃｽﾄ院内調剤薬NM」 (không `MST_MED`). Cả hai có **0 dòng `mst_drug_rx`**.

```
KQ-1   0 mã 600–699 ở path B TRƯỚC seed · MST_MED 53 dòng (54 khi đang seed)
       2 dòng MST_MED MỒ CÔI: 620/0 「４Ｔ×５」 · 647/1 「２Ｔ×１４」
KQ-2   oracle 698 ⇒ 2 dòng · 699 ⇒ 1 dòng · getMstTrtDataYaku trả bản ghi = True
```

**Lối GÕ MÃ (コードモード):**

```
KQ-3  698 ⇒ CÓ dòng rơi xuống lưới:
      [14] 3 | (null) | テスト院内調剤薬PB    テスト用法 毎食後 服用 | 点 1 | 回 2
      nguyên văn 2 dòng: 「ﾃｽﾄ院内調剤薬PB」 ⏎ 「ﾃｽﾄ用法　毎食後　服用」   == oracle
      KHÔNG hộp thoại nào bung ra.
KQ-4  hậu tố 用量: KHÔNG có — đúng như đọc từ source.
      bản đã LÀM PHẲNG qua Txt.N: 「テスト院内調剤薬PB    テスト用法 毎食後 服用」
      ⇒ đếm dòng trên bản này là xanh giả (F23).
KQ-5  点 = 1 (score1 chép từ dòng clone) · 回 = 2 (g_cnt)
KQ-6  699 ⇒ ĐÚNG MỘT dòng 「ﾃｽﾄ院内調剤薬NM」
      ⇒ dòng thứ hai của KQ-3 ĐÚNG LÀ đến từ MST_MED.
KQ-7  ĐỐI CHỨNG — nguồn clone 600 (còn 2 dòng rx) ⇒ path A:
      「ﾎﾞﾙﾀﾚﾝ錠25mg 2T」 ⏎ 「疼痛時　服用  2回分」
      ⇒ khác hẳn, và CÓ hậu tố 用量 ⇒ phép seed THẬT SỰ đổi nhánh.
```

**Lối 薬剤選択 (Shift+F6):**

```
KQ-10  628 (path A) ⇒ mở=True chọn=True 確定=True
       lưới PHẢI trước 確定: [カロナール錠200mg 1T | 1 | 2]
       dòng: [20] 3 | (null) | カロナール錠200 200mg 1T    疼痛時 服用  2回分 | 1 | 2
       ⇒ GIỐNG HỆT KQ-7 (cùng mã, lối gõ mã) ✔
KQ-11  698 ⇒ mở=True chọn=True 確定=True
       lưới PHẢI trước 確定: [テスト院内調剤薬PB | 1 | 2]
       dòng: [23] 3 | (null) | テスト院内調剤薬PB    テスト用法 毎食後 服用 | 1 | 2
       2 dòng text — GIỐNG HỆT KQ-3 ✔
KQ-12  699 ⇒ ĐÚNG MỘT dòng 「ﾃｽﾄ院内調剤薬NM」 — GIỐNG HỆT KQ-6 ✔
```

> **KQ-10 phải trả giá hai lượt mới đo được**, và cả hai đều đáng ghi.
>
> **① Nguồn clone `600` kéo theo một tính năng khác.** 確定 bung `frm203012`
> 「処置名称 ボルタレン錠25mg2T 医療上の必要性を選択してください。」 — **長期収載品の選定療養**.
> Cửa của nó là `CmtAuto.IsDrug_lt_listed_product` (CmtAuto.cs:925-975): mã 薬剤 **và**
> một thành phần `dg_cd*` bắt đầu bằng `6` **và** `MST_DRUG.selected_treat_kb = '1'`
> **và** `mst_trt.F3 = 1` (院内処方). `600/0` dính đủ bốn.
> Trong dải 600–699 `grp = 2`: `600/601/624` dính, `628/631/632/637/654/662` thì không.
> ⇒ Đổi nguồn clone sang **`628/0`** 「カロナール錠200mg　１T」 — cùng `grp 2`, `F2 0`,
> `F3 1`, `score1 1`, `g_cnt 2`, `med_kbn 22` (path A vẫn có hậu tố 用量) nhưng
> `selected_treat_kb = 0`. Đổi ở **cả hai vế** để vẫn đo cùng một mã.
>
> **② Dò dòng path A không được dựa vào `trt_nm`.** Hết bị chặn rồi mà vẫn
> 「dòng = KHÔNG CÓ」: path A in ra tên của **`mst_drug`**, không phải master.
> `master 「カロナール錠200mg　１T」` ≠ `mst_drug 「カロナール錠２００　２００ｍｇ」` ≠
> `lưới 「カロナール錠200 200mg 1T」`. NFKC hai vế rồi thì needle vẫn không phải chuỗi con.
> Đường lui 「chỉ có đúng một dòng mới」 cũng không cứu được vì 確定 của 薬剤選択 còn tự
> chèn các dòng 加算 (処方料/調剤料/薬剤情報提供料).
> ⇒ `PathBCandidate.RowNeedle` = tên `mst_drug` khi có, ngược lại là `trt_nm`.
> Đây đúng là lỗi mà vế Playwright cũng vấp khi thêm đối chứng path A.

Hai lượt `KQ-11`/`KQ-12` còn kéo theo 診療チェック 「…1日の算定限度(1回)を超えています」 cho
処方料/調剤料/薬剤情報提供料 — nhiễu do chạy lại nhiều lần trong cùng một ngày, đã dẹp và
không ảnh hưởng dòng đo.

**Kiểm sau cùng:** `MST_TRT266` và `MST_MED` đều **0** dòng mang 698/699; `MST_MED` về
đúng **53** dòng. Không lượt nào bấm F9 登録.

---

## 9. Parity WinForm ⇄ Web — đã chạy cả hai vế

| # | Testcase | Lối vào | WinForm | Web |
|---|---|---|---|---|
| 1 | path B **có** `mst_med` ⇒ 処置名称 + 用法 | gõ mã | ✅ KQ-3 | ✅ |
| 2 | path B **không** `mst_med` ⇒ chỉ 処置名称 | gõ mã | ✅ KQ-6 | ✅ |
| 3 | **đối chứng** path A ⇒ tên từ `mst_drug`, CÓ 用量 | gõ mã | ✅ KQ-7 | ✅ *(bổ sung 2026-09-09)* |
| 4 | path A qua hộp thoại | 薬剤選択 | ✅ KQ-10 | ✅ TC-1 |
| 5 | path B **có** `mst_med` | 薬剤選択 | ✅ KQ-11 | ✅ TC-2 |
| 6 | path B **không** `mst_med` | 薬剤選択 | ✅ KQ-12 | ✅ TC-3 |

**WinForm 6/6 đo được · Web 6/6 xanh.** Cả hai vế dùng **cùng ba mã** (`628` clone →
`698`/`699`), cùng tên, cùng 用法.

### 9.1 Kết luận nghiệp vụ

**Điểm parity G2 là THẬT, và đúng như đọc từ source:** WinForm **chèn dòng** cho mã 薬剤
không có `mst_drug_rx` — ở **cả hai** lối vào, với **cùng một** ô 療法・処置:

```
698 (có mst_med)     「ﾃｽﾄ院内調剤薬PB」 ⏎ 「ﾃｽﾄ用法　毎食後　服用」      2 dòng
699 (không mst_med)  「ﾃｽﾄ院内調剤薬NM」                                1 dòng
```

Hai lối vào cho ra chuỗi **giống hệt nhau** — đúng như `frmMed_LetData` đi chung đường
chốt của 処置選択 (frm203002.cs:8791). Và path B **không** có hậu tố 用量, còn path A
(cùng ngày, cùng bệnh nhân) **có**: 「疼痛時　服用  2回分」.

Bản web trước bản vá dừng ở 「この薬剤コードは現在未対応です。」 và không chèn gì; sau bản
vá thì cả 6 testcase đều xanh với **cùng chuỗi kỳ vọng**.

### 9.2 Còn lệch ở đâu

**Không còn điểm lệch nào.** 6/6 testcase đo được ở cả hai vế, cùng mã, cùng chuỗi kỳ
vọng, `点 = 1` / `回 = 2` giống nhau.

Một quan sát phụ, không phải lệch: hai lượt 薬剤選択 kéo theo 診療チェック
「…1日の算定限度(1回)を超えています」 cho 処方料/調剤料/薬剤情報提供料 — nhiễu do chạy
lại nhiều lần trong cùng một ngày, đã dẹp và không ảnh hưởng dòng đo.

### 9.3 Việc còn để lại

**長期収載品の選定療養** (`frm203012` 「医療上の必要性を選択してください」) là một điểm
parity **riêng**, chưa ai đo. Cửa vào đã biết rõ (`CmtAuto.IsDrug_lt_listed_product`,
CmtAuto.cs:925-975) và mã sẵn có: chạy lại cả hai vế với `TEST_CLONE_TRT_CD=600`
(hoặc `drugPathB.cloneTrtCd = 600`) là nó bung ra ngay. Nên là một thư mục luồng riêng
chứ không nhét vào G2.
