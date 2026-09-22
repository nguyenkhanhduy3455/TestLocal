# MisoutyakuE00100 — mã 999 (未装着) và hộp thoại E00100

Nguồn yêu cầu: `userapp/fla-ui-todo-inp-legacy-sync-20260921.md` §B.
Nguồn chân lý: `modMain.cs:1800-1830` (`Misoutyaku`), `Trntrn.getInpTrnImpDt`,
`frm203002.cs:5587-5618`.

```
ô 点, コードモード, gõ 999 → Enter          (frm203002.cs:5587-5590)
  └─ ModMain.GetTrtmasCod(con, "999")       (modMain.cs:501)
       └─ trt_cd == 999 → Misoutyaku(con)   (modMain.cs:556-558)
            ① quét hFG1 từ DƯỚI LÊN tìm 印象 240 / 247 / 325-5 / 325-8 / 530-2
                                            (modMain.cs:1805-1817)
            ② không thấy → Trntrn.getInpTrnImpDt (CẢ lịch sử, tới cuối tháng)
            ③ vẫn không thấy → E00100, return false   (modMain.cs:1822-1826)
  └─ ret == false → grdRegi.EndEdit(); hFG1.CurrentCell.Value = "";
                                            (frm203002.cs:5605-5607)
```

**Ca §B2/§B3 CHỈ ĐỌC**; ca §B4 seed MỘT dòng (dải `disp_no` 9300..9399, xem §4). Không ca nào
bấm F9 登録. Ô 点 bị app xoá trắng chỉ nằm trong lưới đang mở
và mất khi `runner-task.ps1` kill `MENU.exe`.

---

## 1. ⚠️ Đính chính ghi chú gốc: E00100 cần HAI điều kiện, không phải một

§B1 của ghi chú gốc chỉ nói tới **bước ①** (quét lưới). Thực tế còn **bước ②** hỏi DB, và
E00100 **chỉ bung khi CẢ HAI trượt**.

Hệ quả: một bệnh nhân **không có 印象 nào trên lưới** vẫn có thể **KHÔNG** ra E00100.

| bệnh nhân | dòng 印象 tới cuối tháng | `getInpTrnImpDt` | E00100 |
|---|---|---|---|
| 4 | 0 | `null` | **bung** |
| 14788 | 3 — 2020-11-17, 2023-05-15, **2023-05-19** | `2023-05-19` | **không bung** |

Bệnh nhân 14788 có 印象 từ 2020/2023 — quá cũ để 過去データ hiển thị inline, nên lưới sạch;
nhưng bước ② vẫn lấy được ngày, và app dùng **2023-05-19** làm ngày tính điểm.

⚠️ **`getInpTrnImpDt` KHÔNG lọc `DEL_FLG`** — một dòng 印象 đã xoá mềm vẫn chặn E00100. Ca
test nào chọn bệnh nhân bằng `DEL_FLG = 0` sẽ dựng **nhầm** tiền đề. `MisoutyakuDb.ImpressionRows`
vì thế cố ý cũng không lọc.

### §B1 chỉ quan sát được ở NGÀY TÍNH ĐIỂM, không ở chỗ có/không E00100

Hễ DB còn một dòng 印象 thì đằng nào cũng không bung E00100, nên câu hỏi 「過去データ inline
có tính là 有印象 trên lưới không」 **không** phân biệt được bằng hộp thoại. Chỗ khác nhau nằm ở
`dtTgtDate`:

| tìm thấy ở | ngày dùng để tính điểm |
|---|---|
| ① lưới | ô 日 của **DÒNG ĐANG ĐỨNG** (`CurrentCellAddress.Y`) — modMain.cs:1813 |
| ② DB | **ngày thật** của dòng 印象 |

Ngày đó đi vào `modPat.GetValidSubCode2(patId, dtTgtDate)` và `HowOldS(birth, dtTgtDate)`, nên
chỉ lộ ra qua 点数/bảo hiểm — muốn đo phải dựng ca so 点数, chưa làm.

---

## 2. Các ca

| ca | fixture | mở app? | đo gì |
|---|---|---|---|
| `TCM_0` | `MisoutyakuMasterTests` | không | bệnh nhân test **chưa từng** có 印象 ⇒ E00100 phải bung |
| `TCM_1` | ″ | không | ngày test có 処置 mang 点数 > 0 để gõ đè lên (§B2 cần) |
| `TCM_2` | ″ | không | **ĐỐI CHỨNG** — bệnh nhân 14788 có 印象 cũ ⇒ bước ② tìm ra ngày |
| `TCM_10` | `MisoutyakuUiTests` | có | **§B2 + §B3** — E00100 bung, và ô 点 bị **xoá trắng** |
| `TCM_20` | `MisoutyakuCodeSetTests` | có + **seed** | **§B4** — mã seed có được coi là 印象 không (MỘT mã mỗi lượt) |

```powershell
.\run-misoutyaku-e00100.ps1        # 3 ca DB, ~0.2 giây, KHÔNG mở app — TRƯỚC TIÊN
.\run-misoutyaku-e00100.ps1 -Ui    # §B2/§B3 (~35 giây)

# §B4 — đặt misoutyaku.seedTrtCd/seedTrtSb rồi chạy, MỘT mã mỗi lượt:
.\run-misoutyaku-e00100.ps1 -CodeSet
```

---

## 3. Đo được trên máy thật

### 2026-09-22 · bệnh nhân **4** · 診療月 2026-06, ngày 3 · cổng 1434 · app build 2026-09-21 · **XANH**

Tiền đề: 0 dòng 印象 tới cuối tháng, `getInpTrnImpDt` ⇒ `null`; ngày 3 có 15 dòng 点数 > 0.

```
DÒNG ĐEM THỬ : [34] ngày 3 | ペリオクリン 0.5g(3シリンジ) | 点 = 150 | 回 = 1
gõ 999 →  hộp thoại tiêu đề 「お茶コン」
          thân (nguyên văn): 「以前の印象データが見つかりません。コード999は入力できません。」
          nút thật: [OK]                    ← MỘT nút, không phải はい/いいえ
OK     →  点 TRƯỚC = 「150」   点 SAU = 「(null)」
```

**§B2 — XÁC NHẬN: WinForm XOÁ TRẮNG ô 点.** Đúng `frm203002.cs:5605-5607`.

⇒ Vế web đang **LỆCH**: `commitCellEdit` với `RegiCol.ten` + Enter không ghi giá trị gõ vào
dòng, nên ô 点 giữ **点数 CŨ**. Lệch này áp dụng cho **MỌI** đường thất bại của
`handleCodeEntry`, không riêng 999 ⇒ xử lý như **task riêng**, đừng nhét vào nhánh
`inp-legacy-sync` (đúng như ghi chú gốc §B2 dặn).

**§B3 (hình thức hộp thoại) — XÁC NHẬN:** tiêu đề 「お茶コン」, **đúng một nút `OK`**, thân đúng
nguyên văn `modMain.cs:1824`.

### Chưa đo

| mục | tình trạng |
|---|---|
| §B3 phần 転帰 | **chỉ chốt từ source**: `Set_Tenki(eTyusi)` nằm ở **cuối** `Misoutyaku` (modMain.cs:1925) mà `return false` thoát ở :1824 ⇒ 転帰 **không đổi**. Chưa đo được vì cột 転帰 không nằm trong 5 cột mà `RegiGrid.Col` phơi ra — muốn đo phải thêm accessor cột. |
| §B4 | **đã đo — xem §4** |
| §B1 (ngày tính điểm) | xem §1 — cần ca so 点数, chưa làm. |


---

## 4. §B4 — định nghĩa 「dòng 印象」, đo được 7/7

### 2026-09-22 · bệnh nhân **4** · 診療月 2026-06 ngày 3 · cổng 1434 · **7/7 XANH**

Cách đo: bệnh nhân **chưa từng** có 印象 (nên E00100 vốn sẽ bung). Seed **MỘT** dòng mang mã
đem thử vào ngày test → mở app → gõ 999 → xem E00100 có bung không.

| mã | tên (MST_TRT266) | E00100 | ⇒ là 印象? |
|---|---|---|---|
| `240/2` | 印象(連合) | không bung | **có** |
| `247/0` | 印象(Br~5歯) | không bung | **có** |
| `325/5` | 印象(ＳＡＳ－ＯＡｐ) | không bung | **có** |
| `325/8` | 印象(ＰＡＰ) | không bung | **có** |
| `530/2` | 印象(ＯＡｐ･困難) | không bung | **có** |
| `325/0` | ＳＡＳ－ＯＡｐ１ | **CÓ bung** | không — đối chứng |
| `530/1` | 歯肉剥離 | **CÓ bung** | không — đối chứng |

⇒ Bộ 5 tổ hợp của `modMain.cs:1807-1810` **đúng y**, và hai mã sát cạnh (325/0, 530/1) xác
nhận phép so không nới rộng.

### ⚠️ Hai điểm cho vế web

**① `240` và `247` khớp BẤT KỂ 枝番.** Source so `hFG1[6, i].Value == "240"` mà **không**
xét `hFG1[7, i]`; chỉ `325` (枝番 5/8) và `530` (枝番 2) mới xét cặp. Nếu
`isImpressionTrt(...)` trong `treatment-entry-detail.tsx` so cả cặp `cd/sb` cho 240/247 thì
nó **hẹp hơn** WinForm — những mã như `240/6 印象(支台築造)`, `240/13 咬合印象`,
`240/14 光ｉｍｐ` vẫn phải được nhận là 印象.

**② `530-0` trong ghi chú gốc KHÔNG tồn tại.** `MST_TRT266` chỉ có `530/1 歯肉剥離` và
`530/2 印象(ＯＡｐ･困難)`. Ca đối chứng dùng **`530/1`** thay — vẫn đúng vai trò 「mã không
phải 印象」.

### Ghi DB

Một dòng mỗi lượt, dải `disp_no` **9300..9399** (tách khỏi 9100 của `CmtPackExitFlg` và 9200
của `CmtPackDenture`), sau cờ riêng `misoutyaku.allowSeed`, dọn ở `OneTimeTearDown` rồi đếm
lại. Không bấm F9 登録.

**Mỗi lượt chạy ĐÚNG MỘT mã** (`misoutyaku.seedTrtCd`/`seedTrtSb`) — seed nhiều mã cùng lúc
thì chỉ cần MỘT mã được nhận là cả lượt ra 「không E00100」, và ca đo không chỉ được mã nào.

Kiểm sau mỗi buổi — phải ra **0**:

```sql
SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO BETWEEN 9300 AND 9399
```
