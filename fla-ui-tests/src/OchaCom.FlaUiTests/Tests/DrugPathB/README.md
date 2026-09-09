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

⇒ Luồng **giấu tạm** dòng `MST_DRUG_RX` của mã đem thử: chụp — in ra — trả lại (F20), nằm
sau cờ riêng `drugPathB.allowSeed` (mặc định **tắt**).

**Thứ bị sửa là bảng 処置変換 dùng chung cả phòng khám**, nên **không** dùng chung
`drugAmount.allowSeed` (bên đó sửa `mst_trt.F2` — bảng khác, rủi ro khác).

---

## 3. Hai cửa vào path B — và vì sao đo cả hai

Điều kiện rẽ nhánh là `mstDrugRXGroupData != null && dg_nm[0] != ""`. Có **hai** cách làm
nó sai:

| Chế độ | Làm gì | `drugRxData` | Giống ca thật nào |
|---|---|---|---|
| `HideByDate` | dời `app_st_dt`/`app_ed_dt` ra `29990101–29991231` | **null** | 「phòng khám tự đăng ký thuốc riêng」 — có master, không có 処置変換 |
| `BlankDgCd` | bỏ trống `dg_cd1..3` | **khác null** | 処置変換 có dòng nhưng không trỏ tới thuốc nào |

Đo **cả hai** là đối chứng của chính phép seed: giống nhau ⇒ kết luận về path B không phụ
thuộc cách ta ép nó vào path B. Khác nhau ⇒ chỗ khác đó chính là thứ phải soi — nhánh
`if (drugInfStr.drugRxData != null)` ở frm203016.cs:1470 **chỉ chạy ở chế độ thứ hai**.

⚠️ `HideByDate` đụng **cột khoá chính** (`trt_cd, trt_sb, app_st_dt, app_ed_dt`). Update
vẫn hợp lệ vì khoá đích không đụng dòng nào — nhưng vì thế phải có hàng rào
`ParkedRowExists`: đã có sẵn dòng ở khoảng cất tạm ⇒ một lượt chạy trước chết giữa chừng,
fixture **dừng** và bắt dọn tay chứ không chồng lên rác cũ (F22).

---

## 4. Ứng viên

| Vai | Mã | Vì sao |
|---|---|---|
| **Đối tượng** | `605/0` 「ｵｾﾞｯｸｽ150ｍｇ３T」 | **Có** `MST_MED` 「１日３回朝昼夕食後　服用」 ⇒ đo được **cả hai** dòng của path B. Một 枝番 ⇒ 処置選択 không hiện. |
| **Đối chứng** | `630/0` 「ムコスタ錠１００ｍｇ」 | **Không** có `MST_MED` ⇒ path B mất dòng 用法. Tách đôi câu hỏi: dòng 1 từ `getMstTrtDataYaku`, dòng 2 từ `MST_MED`. |

`605` cố ý **trùng mã của luồng G1**. Cùng một mã:

```
path A (G1)  「オゼックス錠150 150mg 3T    1日3回朝昼夕食後 服用  3日分」   ← 1 dòng text + 用法 + 用量
path B (G2)  「ｵｾﾞｯｸｽ150ｍｇ３T」                                        ← trt_nm của master
             「１日３回朝昼夕食後　服用」                                   ← MST_MED, KHÔNG có 用量
```

Đặt cạnh nhau là thấy ngay path B **không** phải một biến thể của path A: khác nguồn tên,
khác độ rộng chữ (半角/全角), và **không có hậu tố 用量** — cụm sinh 「n日分」 nằm bên trong
nhánh A (EditControl.cs:1118-1133).

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
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc2_ProbeControlWithoutUsage  # 1 vòng
.\run-resolve-drug-path-b.ps1 -Probe -Seed -Case Tc3_ProbeSeedModesAndPathA    # 2 vòng
```

Không bật `-Seed` ⇒ fixture tự Ignore **trước khi mở app**, kèm lý do.

**Kiểm lại trước khi đóng máy:**

```sql
SELECT COUNT(*) FROM MST_DRUG_RX WHERE app_st_dt = '29990101';       -- phải là 0
SELECT trt_cd, trt_sb, app_st_dt, app_ed_dt, dg_cd1
  FROM MST_DRUG_RX WHERE trt_cd IN (605, 630);                       -- dg_cd1 khác rỗng
```

Lượt chạy chết giữa chừng thì tìm dòng `ẢNH CHỤP MST_DRUG_RX` trong `.trx` rồi `UPDATE`
tay về.

---

## 7. Cặp Playwright

Chưa có — bên web hiện chỉ có nhánh 「現在未対応です」. Khi `mst_med` được migrate (53 dòng /
14 cột, rẻ) thì spec bên kia đặt cùng thư mục `tests/dialogs-selection/` và **dùng đúng hai
mã này** để số đo so thẳng được.

Cho tới lúc đó, vế WinForm ở đây là **đặc tả hành vi đúng**, và điều cần khẳng định trước
tiên là: *WinForm có thật sự chèn dòng không* (KQ-3). Nếu hoá ra nó cũng không chèn thì
điểm parity G2 nhỏ hơn nhiều so với giả định, và bản web chỉ còn thiếu **câu thông báo**
chứ không thiếu **dòng dữ liệu**.

---

## 8. Đo được trên máy thật

> Điền sau **mỗi** lượt chạy: ngày, bệnh nhân, 診療日, và số đo **nguyên văn**.
> Để trống là lần sau đo lại từ đầu.

### *(chưa chạy lần nào)*

Cần điền: KQ-1 … KQ-9, kèm ảnh `artifacts\screenshots\`.
