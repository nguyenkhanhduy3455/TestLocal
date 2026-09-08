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
2. **Ô 回 sau 確定.** Web điền sẵn `1` (spec assert `toHaveValue('1')`); WinForm để editor
   **RỖNG**, nên Enter ghi `回 = 0` và cả nhánh `Chk_ChkAuto` không chạy. Harness bên này
   gõ `1` vào (`AutoSanteiOps.EnsureTrtCount`) để đo được phần còn lại — nhưng bản thân
   sự khác nhau đó là một lệch parity thật, đáng mở hồ sơ riêng.
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

Điền sau **mỗi** lượt chạy — ngày, bệnh nhân, 診療月, số đo **nguyên văn**. Để trống là lần
sau đo lại từ đầu.

Bệnh nhân **10**, 診療日 **2026-08-03** (lưới mở tháng 2026-08), máy `ochacom-win`.

| Ngày | Case | Kết quả | Số đo nguyên văn |
|---|---|---|---|
| 2026-09-08 | probe `Tc0` | ✅ | `chkauto` 196 dòng / 25 dòng ≥2 mã · `chkauto(179,2) → 310/2` · `171/0` không có trong bảng |
| 2026-09-08 | `TcAUTO1` | ✅ | master `MST_TRT266`; `179/2 = 抜歯手術(臼歯) 270点`; `310/2 = OA+ｵｰﾗ注…1.8mL 11点` |
| 2026-09-08 | `TcAUTO2` lượt 1 | ❌ harness | `抜歯手術(臼歯) \| 270 \| 0` — 回 = 0 ⇒ `Chk_ChkAuto` không chạy |
| 2026-09-08 | `TcAUTO2` lượt 2 | ❌ harness | gõ 1 vào ô 回 ⇒ `Chk_CmtAuto` chạy (`OA(コーパロン)浸麻(歯科用オーラ注Ct1.8ml) \| 0 \| 1`), `Chk_ChkAuto` vẫn bỏ qua |
| 2026-09-08 | `TcAUTO2` lượt 3 | ❌ harness | đăng ký 病名 ⇒ app nhảy sang tab ガイド, gõ mã rơi vào 選択№, chốt nhầm 310/2 |
| 2026-09-08 | `TcAUTO2` lượt 4 | ❌ harness | gõ đúng ô 点 nhưng dòng đích đã có dữ liệu ⇒ `AutoBui` bỏ qua |
| 2026-09-08 | `TcAUTO2` lượt 5 | ⚠️ gần xong | **`Chk_ChkAuto` ĐÃ CHẠY**: `+ OA+オーラ注歯科用カートリッジ 料1.8mL` xuất hiện trên lưới. Nhưng ô 点 của nó đọc ra `(null)` và 月計 không đổi |

### Việc còn lại (bắt đầu từ đây)

Lượt 5 đã dựng được **đúng hành vi cần đo** — WinForm tự chèn `310/2` sau khi nhập `179/2`.
Chỗ còn hở là **部位 chưa bám được vào dòng 抜歯**: app vẫn bung
「26/8/14 179-2 抜歯手術(臼歯)を算定していますが、算定可能な部位がありません。」 và vì thế
ghi `回 = 0`, kéo theo 点 của dòng tự chèn chưa được tính (đọc ra `(null)`) và 月計 đứng yên.

Chạy lại probe `-Diagnostics -Case Tc1` và **mở ảnh** `bui-da-chon` / `byoumei-sub` để xem
部位 + 病名 thực sự nằm ở dòng nào trên lưới trước khi sửa tiếp. Hai hướng đáng thử,
**mỗi lượt một thứ** (F4):

1. `ModMain.AutoBui` chạy trên dòng mà `fDis_Move_Cell` dời con trỏ tới (frm203002.cs:8660).
   Kiểm xem dòng đó có đúng là dòng trống thứ hai mình vừa chèn không — nếu app dời sang
   dòng khác thì phải đọc con trỏ THẬT (`TreatmentGridOps.FocusedCellName`) chứ đừng suy
   ra từ `LastBuiLineRow`.
2. Ô 部位 đem thử là `buiSlot = 10` (左上3). `ChkSiga` chỉ cho 抜歯 trên răng **現存**;
   fixture đã `ResetSigaToVital` trước khi app mở, nhưng đáng kiểm lại `SIGA.se11` ngay
   trước lượt chốt — mốc có thể đã bị chính lượt chạy trước ghi đè.

### Đo sẵn từ DB (2026-09-08, `SIM2000` trên `OCHASQLEXPRESS`)

```
chkauto: 196 dòng, 25 dòng có từ 2 mã đi kèm trở lên
chkauto(179,2) → 310/2                      chkauto(170,0..8) → 310/2
chkauto(110,0) → 108/9 + 108/12             chkauto(171,*)    → KHÔNG có  (⇒ mã đối chứng)
MST_TRT266 (áp dụng từ 2026-06-01):
  179/2 = 抜歯(臼歯) / 抜歯手術(臼歯)                 score1=270 unit=19 acc_unit=10 f1=0
  310/2 = OA+ｵｰﾗ注歯科用Ct 1.8mL / …ｶｰﾄﾘｯｼﾞ 料1.8mL  score1= 11 unit= 9 acc_unit=11 f1=1
  171/0 = 感根処(1根) / 感染根管処置(単根)            score1=160 unit=61 acc_unit= 9 f1=0
```

⇒ TcAUTO2 mong đợi **月計 tăng 270 + 11 = 281**, TcAUTO3 mong đợi **tăng đúng 160**.
