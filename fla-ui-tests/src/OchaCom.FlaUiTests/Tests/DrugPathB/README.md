# G2 — Path B của `editDrugName` (`mst_med`)

Nửa **WinForm** của điểm parity G2.

> **Trạng thái: THÔNG LUỒNG + PROBE, CHƯA CHẠY LẦN NÀO.**
> Luật F1: dữ liệu dev không có ca nào rơi vào path B, nên **chưa ai nhìn thấy nhánh này
> chạy trên app thật**. Mọi assert viết bây giờ đều là phỏng đoán — `DrugPathBTests` viết
> sau khi có file `resolve-drug-path-b-KQ.txt` đầu tiên.

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
# LUÔN từng -Case một (F7)
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc0_ProbeMasterData        # chỉ DB
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc1_ProbePathBRow          # 1 vòng
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc2_ProbeWithoutUsage      # 1 vòng
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc3_ProbeCloneSourceIsPathA # 1 vòng
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

## 7. Cặp Playwright

`../web-tenant-tests/tests/treatment-grid/drug-path-b-mst-med.spec.ts` — đã có, và **dùng
đúng ba mã ở mục 3** (clone 602 → 698/699, cùng tên, cùng 用法), nên số đo hai bên so thẳng
được với nhau.

Điều cần khẳng định trước tiên vẫn là **KQ-3**: *WinForm có thật sự chèn dòng không*. Nếu
hoá ra nó cũng không chèn thì điểm parity G2 nhỏ hơn nhiều so với giả định — bản web chỉ
còn thiếu **câu thông báo**, không thiếu **dòng dữ liệu**. Chưa chạy vế WinForm lần nào
thì chưa được kết luận theo hướng nào.

---

## 8. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.
> Để trống là lần sau đo lại từ đầu.

### *(chưa chạy lần nào)*

Cần điền: KQ-1 … KQ-9, kèm ảnh `artifacts\screenshots\`.
