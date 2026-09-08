# AutoSanteiChkAuto — cái ĐUÔI của một cú chốt 処置

**Cặp parity của [`../../../../../web-tenant-tests/tests/auto-santei/chk-auto-after-commit.spec.ts`](../../../../../web-tenant-tests/tests/auto-santei/chk-auto-after-commit.spec.ts).**
Hai bên đo CÙNG một thao tác, từ CÙNG một trạng thái xuất phát, với CÙNG cách tính kỳ vọng —
có vậy thì đỏ/xanh mới quy được cho app chứ không cho harness.

> Runner: [`../../../../run-insert-auto-santei-rows.ps1`](../../../../run-insert-auto-santei-rows.ps1)
> Luật chung: [`../../../../FLA-UI-GUIDELINE.md`](../../../../FLA-UI-GUIDELINE.md) (F1–F24)

---

## 1. Lệch đang đo

Nhập 抜歯 lên một răng rồi so hai bên — cùng bệnh nhân, cùng ngày, cùng thao tác:

|        | WinForm                                        | Web                   |
|--------|------------------------------------------------|-----------------------|
|        | `6 (1) Ｃ₂`                                    | `6 (1) Ｃ₂`           |
|        | `OA（ｺｰﾊﾟﾛﾝ）浸麻（…）` **0 点**               | *(không có)*          |
|        | `抜歯手術(臼歯)` **270 点**                    | `抜歯手術(臼歯)` 270 点 |
|        | `OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL` **11 点**      | *(không có)*          |
| **日計** | **443 点**                                     | **432 点**            |

Lệch **11 điểm cho MỘT ca 抜歯** ⇒ sai cả tiền thu lẫn レセプト. Đây là lệch **nặng hơn**
hai cái trước vì nó sai **điểm số**, không phải sai hiển thị.

---

## 2. Cơ chế — ba lệnh gọi ngay sau khi Enter ô 回

`frm203002.cs:5738-5752`, case 4 (ô 回). Điều kiện DUY NHẤT là `trtCnt >= 1`, không có cờ
nào chặn:

```csharp
ModMain.Chk_CmtAuto(con, intCod, intNo, trtCnt);   // コメント自動入力  ← web CÓ (runCmtAutoCascade)
ModMain.Chk_ChkAuto_soutyaku(con, intCod, intNo);  // 装着料自動算定
ModMain.Chk_ChkAuto(con, intCod, intNo);           // 自動算定  ★ CHỖ ĐANG ĐO
```

`ModMain.Chk_ChkAuto` (`modMain.cs:812`):

1. `ChkAuto.getChkAutoData(con, trtCd, trtSb)` — đọc bảng `chkauto`, lấy 5 cặp
   `(cd_i, sb_i)`. Không có dòng ⇒ **return ngay** (`:841-844`).
2. Với mỗi cặp:
   * `cd` trong dải **摘要 700..899** ⇒ chèn một dòng **コメント 0 点** (`:862-908`);
   * `cd > 100` ⇒ cho qua **診療チェック** `Check.getCheckAnswerGuide` (`:914-940`), rớt thì
     `continue`; qua được thì tra master của tháng rồi chèn bằng
     `frm203016.frm203016_Hide_Let_Trt_Data(0)` (`:990-1010`), rồi gọi `Chk_CmtAuto` cho
     chính mã vừa chèn (`:1030`).

Dữ liệu khớp đúng ảnh trên:

```
chkauto(179, 2)  →  cd1 = 310 / sb1 = 2
MST_TRT266: 179/2 = 抜歯手術(臼歯) 270点   ·   310/2 = OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL 11点
```

**Phạm vi:** bảng `chkauto` có **196 dòng**, trong đó **25 dòng có từ 2 mã đi kèm trở lên**
(`100/1→108/7`, `104/0→104/2`, `110/0→108/9 + 108/12`, `116/6→116/8`, `125/9→116/22`,
`179/2→310/2` …) ⇒ khoảng **196 mã 処置** đang thiếu phần tự chèn ở bản web.

> ⚠️ Bảng tên **`chkauto`**, KHÔNG gạch dưới — khác `chk_auto` của bản Postgres bên web.
> Cột là `cd1..cd5` / `sb1..sb5` (`COMMON/DBAccess/ChkAuto.cs:26-43`).

---

## 3. Bảng tương ứng với spec Playwright

| FlaUI | Playwright | Đo gì |
|---|---|---|
| `TC0` | *(không có)* | **mốc harness**: `chkauto` / `CMTAUTO` / master có đủ dữ liệu chưa; mã ĐỐI CHỨNG không nằm trong `chkauto`. Chỉ hỏi DB. |
| `TC1` | `TC-1` | 自動算定 — chốt 処置 xong, `chkauto` phải kéo các 処置 đi kèm xuống lưới, mỗi dòng mang đúng `score1`, và 月計 tăng đúng `270 + 11`. |
| `TC2` | `TC-2` | コメント自動入力 — dòng `CMTAUTO` tự áp dụng phải rơi xuống lưới, không bị nuốt. |
| `TC3` | `TC-3` | `disp_no` quyết định comment nằm **TRÊN** hay **DƯỚI** dòng 処置. |
| `TC4` | `TC-4` | Dòng `chkauto` phải nằm **liền dưới** 処置, không trôi xuống cuối ngày. |

Probe (`[Explicit]`, chạy bằng `-Diagnostics`):

| Case | Đo gì |
|---|---|
| `Tc0` | Chỉ hỏi DB: `chkauto` / `CMTAUTO` / master có gì; đối chiếu `CMTAUTO.CMT_NM` với `MST_CMT2`. Rẻ — chạy trước tiên. |
| `Tc1` | Chốt `179/2` trên 部位病名行 đã seed — đúng đường của `TC1..TC4`, nhưng KHÔNG assert. |

### Lô chạy

> ⚠️ **Luồng này là NGOẠI LỆ của thói quen 「luôn chạy bằng `-Case`」.** `TC2/TC3/TC4`
> **đọc lại chính ảnh chụp lưới của cú chốt trong `TC1`** — y như spec Playwright, nơi
> `TC-2/3/4` ghi rõ 「TC-1 đã chốt 処置 rồi; lưới hiện tại là kết quả của cùng một cú
> Enter」. Chạy riêng chúng thì `RequireCommitted()` tự `Ignore` với lý do rõ ràng.
>
> Vẫn nằm trong trần 15 phút vì chỉ `TC1` đi giao diện: `TC0` hỏi DB, còn `TC2-TC4` đọc
> lại snapshot trong bộ nhớ.

```powershell
.\run-insert-auto-santei-rows.ps1 -Diagnostics -Case Tc0   # 1. re, chi hoi DB
.\run-insert-auto-santei-rows.ps1 -AllowSave               # 2. ca bo TC0..TC4 (1 vong UI)
```

Chạy từ xa (F5) — `schtasks` không truyền được tham số, phải ghi lệnh vào file:

```powershell
Set-Content logs\command.txt "run-insert-auto-santei-rows.ps1 -AllowSave"
schtasks /run /tn "FlaUI-Tests-Run"
```

## 3b. Hai bên khớp nhau ở đâu

| | WinForm (đây) | Web (spec Playwright) |
|---|---|---|
| Bệnh nhân / ngày | `patient.patNo`, `patient.trtDate` | `TEST_PAT_NO`, `TEST_TRT_DT` |
| 処置 đem chốt | `autoSantei.trtCd/trtSb` = **179/2** | `TEST_TRIGGER_CD/SB` = **179/2** |
| Ô 部位 | `autoSantei.buiSlot` = **2** (右上6) | `BUI_SLOT` = **2** |
| 病名 | `disCd/disSb` = **100 / 2** (Ｃ₂) | `DIS_CD_C` / `DIS_SB_C2` = **100 / 2** |
| Vùng seed | `TRNTRN.DISP_NO >= 9000` **+ đúng ngày** | `trn_trn.disp_no >= 9000` |
| Cờ ghi | `autoSantei.allowSave` | `TEST_ALLOW_SAVE=1` |
| Kỳ vọng | tính từ `chkauto` + `CMTAUTO` + `MST_TRT*` | tính từ `chk_auto` + `cmt_auto` + `mst_trt` |
| Chuẩn hoá chuỗi | `AutoSanteiOps.Norm` (NFKC) | `norm()` (NFKC) |

### Hai điểm LỆCH phát hiện khi đối chiếu — soi trước khi kết luận parity

1. **Nguồn tên カルテコメント.** Bên này lấy từ `MST_CMT2(cmt_cd, cmt_sb)` — thứ app THẬT SỰ
   in ra. Spec Playwright lấy từ `cmt_auto.cmt_nm`. Trên DB dev hai cột đã lệch:
   `CMTAUTO(179,2).CMT_NM` = 「…**ｵｸﾀﾌﾟﾚｼﾝ**Ct1.8ml」 còn `MST_CMT2(7321,1)` =
   「…**ｵｰﾗ注**Ct1.8ml」, và lưới in cái thứ hai. Nếu bản web port `cmt_nm` từ `CMTAUTO` thì
   nó sẽ hiển thị chuỗi khác WinForm — **kiểm chỗ này trước khi tin TC2/TC3 xanh**.
2. **回数 lấy từ đâu.** ⚠️ *Bản đầu của mục này ghi sai — đã sửa 2026-09-08.*
   WinForm **có** tự điền ô 回: `frm203016.cs:1531` ghi `grdRegi[4] = selRec.intCnt`, giá trị
   từ `GetTrtmasCod` (modMain.cs:645-651) — 薬剤 → `g_cnt`, 一般処置 →
   `CalcCnt.getCalcCnt(unit, pbui, dis_cd)`. Với `179/2` trên một răng ⇒ **1**, và lượt chạy
   xanh đã đo đúng thế (`抜歯手術(臼歯) | 270 | 1`, harness không gõ gì).
   Cái `回 = 0` gặp ở bốn lượt đầu là **triệu chứng 部位 chưa bám**, không phải hành vi app:
   `getCalcCnt` đếm răng trong `bui[]` và trả 0 khi rỗng (CalcCnt.cs:32-54).

   **Lệch THẬT nằm chỗ khác:** web chốt `pick.trtCnt > 0 ? pick.trtCnt : 1` — một **hằng số**,
   trong khi WinForm là `CalcCnt` trên 部位. Hai bên trùng nhau khi 部位 chỉ một răng (đúng ca
   đang đo), và **lệch khi nhiều răng**. Đáng mở hồ sơ riêng; luồng này chưa phủ.
3. **Cách lọc slot `chk_auto`.** `findChkAutoSlots` bên web chỉ lọc `cd !== 0`; bên này tách
   thêm dải 摘要 700..899 ra `CommentPairs` vì `Chk_ChkAuto` xét nhánh đó TRƯỚC
   (modMain.cs:862). Master hiện tại không có slot nào rơi vào dải ấy nên hai bên đang
   trùng kết quả — nhưng tenant khác thì chưa chắc.

---

## 4. Ghi DB — cờ riêng `autoSantei.allowSave`

**KHÔNG bấm F9** ⇒ `TRNTRN` **không bị đụng**: mọi dòng chỉ nằm trong bộ nhớ lưới và biến
mất khi đóng màn hình mà không lưu.

Nhưng `179` đi qua `frm203016.IregCodChk → SigaChg` nên nó **GHI THẲNG vào `SIGA` ngay lúc
chốt** (`frm203016.cs:1032-1035`), và răng phải là **現存** thì `ChkSiga` mới cho 抜歯 đi
qua. Vì thế:

* cờ **RIÊNG** `autoSantei.allowSave` (mặc định `false` ⇒ fixture tự `Ignore` **trước khi
  mở app**) — không dùng chung `sigaTooth.allowSave`, vì ở đây 歯式 chỉ là **tiền đề** chứ
  không phải thứ đang đo;
* `PrepareDataBeforeApp` **chụp `SIGA` TRƯỚC khi đặt mốc**, **IN RA STDOUT**, rồi mới
  `ResetSigaToVital` — F20. Đặt mốc phải nằm **trước khi app mở**: `pSiga_old` chỉ được nạp
  đúng một lần lúc mở 診療入力 (`modKonSiga.cs:70-84`);
* `OneTimeTearDown` trả `SIGA` về nguyên trạng.

Mã **ĐỐI CHỨNG** `171/0` cố ý chọn ngoài switch của `IregCodChk` nên nó **không ghi gì cả**.

---

## 5. Cạm bẫy đã biết

* **日計行 / 合計行 in chính số điểm.** So hai lượt chụp lưới theo nội dung sẽ thấy chúng
  「biến mất rồi xuất hiện」 mỗi lượt nhập ⇒ phải lọc ra trước khi đếm
  (`AutoSanteiOps.EntryMeasure.IsData`). Không lọc thì cả ô ĐỐI CHỨNG cũng đỏ.
* **Chụp mốc SAU 部位選択, TRƯỚC khi gõ mã.** 部位選択 + 病名選択 tự dựng thêm một 部位病名行;
  chụp trước chúng thì dòng đó lọt vào "app tự chèn".
* **Mốc là `lbAllPoint`, không phải số dòng lưới** (F12): UIA chỉ phơi ra dòng đang nhìn
  thấy, mà chèn xong app lại cuộn.
* **Không seed DB** (F21): `Chk_ChkAuto` đọc `ModCommon.pbui` / `pHoumon` / `dis_cd` —
  trạng thái trong **bộ nhớ phiên chạy**. Dòng seed thẳng `TRNTRN` không đi qua case 4 của
  `frm203002` nên cả nhánh này biến mất.
* **診療チェック có thể loại mã đi kèm** (`modMain.cs:936-940`). Nếu tháng test đã có sẵn mã
  đó (nhất là các 加算 giới hạn 月1回 như `108/9`, `108/12`), TcAUTO2 sẽ đỏ vì **DỮ LIỆU**
  chứ không vì app — thông điệp assert đã nói rõ cách phân biệt. Vì đúng lý do này mà
  `110/0` (ô có 2 mã đi kèm) **chỉ nằm trong probe**, không assert.

---

## 6. Đo được trên máy thật

Bệnh nhân **10**, 診療日 **2026-08-03**, máy `ochacom-win`.

### ✅ 2026-09-08 — TC0..TC4 XANH CẢ NĂM, tái hiện đúng ảnh báo lỗi

```
+ [15] 3 | OA(コーパロン)浸麻(歯科用オーラ注Ct1.8ml) |   0 | 1   ← CMTAUTO, disp_no -1 ⇒ TRÊN
+ [16] 3 | 抜歯手術(臼歯)                            | 270 | 1   ← mã gõ vào
+ [17] 3 | OA+オーラ注歯科用カートリッジ 料1.8mL        |  11 | 1   ← chkauto 310/2 ⇒ DƯỚI

lbAllPoint (合計 = 月計 CẢ THÁNG)  413 → 694   ⇒  Δ 281 = 270 + 11
```

**Ba dòng trên khớp từng dòng với ảnh báo lỗi**, và `11 点` chính là phần bản web đang thiếu.

> ⚠️ **Đừng đọc 413 → 694 như số của MỘT NGÀY.** `lbAllPoint` là 合計点数 của **cả tháng**
> (`modAcc.Calc_MDPoint` trả `strMP`; xem `TreatmentGridOps.AllPoint`). Kiểm lại từ DB:
> tháng 2026-08 của bệnh nhân 10 = `339` (ngày 03, 初診 272 + các 加算) + `74` (ngày 14)
> = **413**. Con số so được với ảnh là **Δ 281**, không phải giá trị nền.
> Còn `日計 443 / 432` trong ảnh là tổng của MỘT NGÀY ở một phiên khác — cùng cơ chế,
> khác phạm vi; đừng đặt cạnh nhau như hai số so trực tiếp.

| Ngày | Case | Kết quả |
|---|---|---|
| 2026-09-08 | `TC0` | ✅ `chkauto` 196 dòng / 25 dòng ≥2 mã · `chkauto(179,2) → 310/2` · `171/0` không có (đối chứng hợp lệ) |
| 2026-09-08 | `TC1` | ✅ `310/2` tự chèn, `11 点` đúng `score1`, 月計 tăng đúng `270 + 11` |
| 2026-09-08 | `TC2` | ✅ dòng `CMTAUTO` 7321/1 rơi xuống lưới |
| 2026-09-08 | `TC3` | ✅ `disp_no = -1` ⇒ comment nằm TRÊN 抜歯 |
| 2026-09-08 | `TC4` | ✅ `310/2` nằm liền DƯỚI 抜歯 |

### Bốn cái bẫy đã trả giá để tới được đây (đừng lặp lại)

| # | Triệu chứng | Nguyên nhân thật |
|---|---|---|
| 1 | `回 = 0` ⇒ `Chk_ChkAuto` không chạy | **KHÔNG phải app để trống ô 回** (WinForm tự điền từ `CalcCnt`, xem mục 3b-2). `getCalcCnt` trả 0 vì `pbui` rỗng ⇒ triệu chứng của bẫy #2 bên dưới. Nhật ký 「editor đang mở với 「」」 là ảo giác của UIA (`EditorText` đọc `ValuePattern` của phần tử focus), không phải ô trống. |
| 2 | 「算定可能な部位がありません」 | Dựng 部位病名行 bằng 部位選択 mà không kèm 病名, và `AutoBui` bỏ qua dòng đích đã có dữ liệu (`modMain.cs:139-146`). ⇒ chuyển sang **seed** đúng như spec Playwright. |
| 3 | 「Quá 4s mà không thấy `grdRegi`」, 5/5 đỏ ở `OneTimeSetUp` | Dòng seed để `MED_ST_DT` = NULL trong khi mọi dòng thật đều có ngày ⇒ app không dựng nổi lưới. Kế thừa cột đó từ dòng mẫu. |
| 4 | Nhập 処置 vào **nhầm ngày** | `grdRegi` mở CẢ THÁNG; `SeededBuiRow`/`LastBuiLineRow` quét cả tháng nên vớ phải 部位病名行 của ngày khác. ⇒ khoá mọi thao tác theo `patient.trtDate`. |

### Đo sẵn từ DB (`SIM2000` trên `OCHASQLEXPRESS`)

```
chkauto: 196 dòng, 25 dòng có từ 2 mã đi kèm trở lên
chkauto(179,2) → 310/2                      chkauto(170,0..8) → 310/2
chkauto(110,0) → 108/9 + 108/12             chkauto(171,*)    → KHÔNG có  (⇒ mã đối chứng)
CMTAUTO(179,2) → 7321/1, disp_no -1, no_chk 1  (một dòng ⇒ app TỰ ÁP DỤNG, không hỏi)
MST_CMT2(7321,1) = 「OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用ｵｰﾗ注Ct1.8ml）」   ← thứ lưới in
CMTAUTO(179,2).CMT_NM = 「…ｵｸﾀﾌﾟﾚｼﾝCt1.8ml」                  ← ĐÃ LỆCH, đừng assert theo

MST_TRT266 (áp dụng từ 2026-06-01):
  179/2 = 抜歯(臼歯) / 抜歯手術(臼歯)                 score1=270 unit=19 acc_unit=10 f1=0
  310/2 = OA+ｵｰﾗ注歯科用Ct 1.8mL / …ｶｰﾄﾘｯｼﾞ 料1.8mL  score1= 11 unit= 9 acc_unit=11 f1=1
  171/0 = 感根処(1根) / 感染根管処置(単根)            score1=160 unit=61 acc_unit= 9 f1=0
```
