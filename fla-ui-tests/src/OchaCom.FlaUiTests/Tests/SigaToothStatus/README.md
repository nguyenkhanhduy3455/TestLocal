# SigaToothStatus — 自歯状況 (SIGA) và 根数 (KON)

Nửa **WinForm** của ba spec Playwright. Cùng một yêu cầu nghiệp vụ, khác chỗ đo: bên kia
đo bản web, bên này đo chính WinForm — tức là đo cái "đáp án" mà bản web phải khớp.

| Spec Playwright | Fixture ở đây | Hàm WinForm đang đo |
|---|---|---|
| `tooth-extraction-siga-restore.spec.ts` | `DelExtRecTests` | `frm203002.DelExtRec` (frm203002.cs:6120-6191) |
| `siga-kon-remaining-gaps.spec.ts` | `SigaKonGapsTests` | `frm203016.SigaChg` + `modSave.SigaChg_Save` + `Restore_SK` |
| `p-mode-kesson-siga.spec.ts` | `PModeKessonTests` | `frm203002.Chk_PModeKesson` (frm203002.cs:7446-7495) |
| — (không có bên web) | `SigaToothProbeTests` | PROBE `[Explicit]`, 14 câu hỏi, KHÔNG assert |

Chạy: `.\run-change-tooth-status.ps1` — xem `-Diagnostics` ở mục 6.

---

## 1. BỐN đường ghi 歯式, ba trong số đó chạy TRƯỚC F9

Đây là điều quan trọng nhất của cả luồng, và cũng là chỗ bản web dễ port lệch nhất.

```
① nhập 処置     frm203016.IregCodChk → SigaChg          update Siga/Kon NGAY · BẬT pSiga_chg
② xoá dòng 抜歯  frm203002.DeleteRow  → DelExtRec        update Siga NGAY · KHÔNG bật cờ
③ 病検 Ｐ変更    ChkBuiDisChg(はい)   → Chk_PModeKesson  update Siga NGAY · KHÔNG bật cờ
④ F9 登録       modSave.Save_Data    → SigaChg_Save     dựng lại từ TẬP 処置 đã lưu
```

Cái van của `Restore_SK` (「いいえ」 ở dirty gate) là cờ `pSiga_chg` / `pKon_chg`
(modSave.cs:4684/:4689), và **chỉ `SigaChg` bật cờ đó** (frm203016.cs:1282/:1295).
Hệ quả bất đối xứng, đã được khoá bằng testcase:

- phiên có **nhập 処置** ⇒ 「いいえ」 **lùi** 歯式 về snapshot lúc mở màn;
- phiên **chỉ xoá** dòng 抜歯 ⇒ 「いいえ」 **không lùi** — răng đã về 健全歯 trong khi dòng
  抜歯 vẫn còn nguyên trong `trn_trn`. Trạng thái tự mâu thuẫn mà WinForm chấp nhận.
  Bug của WinForm, port nguyên theo quyết định 2026-08-25 (`inp-p0-open-issues.md` ISSUE-15).

---

## 2. Miền giá trị — nguồn chân lý là `CommonChk.cs:497-580`

```
永久歯 SE : 0 = 生活歯 · 1/2/3 = 失活歯 · 4 = 欠損歯      (cột se*  DEFAULT 0)
乳歯   SN : 5 = 生活歯 · 6/7/8 = 失活歯 · 9 = 欠損歯      (cột sn*  DEFAULT 5)
```

**「健全歯」 của 乳歯 là 5, KHÔNG phải 0.** Đây đúng chỗ bản web từng ghi nhầm 0 mà nhìn
màu KHÔNG ra: `selSigaColorNo(5)` và `selSigaColorNo(0)` cùng trả White. Vì thế mọi
khẳng định ở đây đọc thẳng DB, không đọc màu.

`KON` thì **nullable** — trạng thái xuất phát là `NULL` chứ không phải 0, nên assert phải
phân biệt được `NULL` (chưa từng ghi) với `0`.

### Tên cột: legacy KHÁC bản web

SQL Server dùng `se1..se32` / `sn1..sn20` / `ekon1..ekon32` / `nkon1..nkon20` —
**không gạch dưới** (Siga.cs:90-101, Kon.cs:94-105). Bản Postgres của web là `se_1`,
`sn_4`… Ba spec Playwright viết theo kiểu gạch dưới; chép thẳng sang đây là câu SQL chết
với 「Invalid column name」.

---

## 3. Ánh xạ ô 部位 ↔ vùng/răng ↔ cột DB

`buiData.unionBui` (buiData.cs:485-496) ghép bốn vùng thành mảng 32:

```
bui[i]    = buiRU[7-i]   ⇒ 右上 răng N ở ô  8-N        (RU8→0 … RU1→7)
bui[i+8]  = buiLU[i]     ⇒ 左上 răng N ở ô  8+(N-1)
bui[i+16] = buiRD[7-i]   ⇒ 右下 răng N ở ô 16+(8-N)
bui[i+24] = buiLD[i]     ⇒ 左下 răng N ở ô 24+(N-1)
```

Cột DB (modSave.cs:788/:800/:995/:1008):

```
永久歯: ô i            → se{i+1} / ekon{i+1}
乳歯  : ô i < 16       → sn{i-2} / nkon{i-2}
        ô 16 ≤ i < 29  → sn{i-8} / nkon{i-8}
```

Ba ô dùng xuyên suốt (đổi được ở `testsettings.json` mục `sigaTooth`):

| Ô | Vùng/răng | Phím | Cột DB | Vai trò |
|---|---|---|---|---|
| 10 | 左上3 | `3` | `se11` / `ekon11` | 永久歯 đem thử |
| 6 | 右上Ｂ | `B` | `sn4` / `nkon4` | 乳歯 đem thử |
| 18 | 右下6 | `6` | `se19` / `ekon19` | ĐỐI CHỨNG, không bao giờ được đụng |

> 📌 Ba spec Playwright chú thích ô 18 là 「右下8」. Công thức trên cho **右下6**
> (`16 + (8-N) = 18 ⇒ N = 6`). Con số cột `se_19` thì vẫn đúng, nên đây chỉ là chú
> thích lệch — nhưng đừng dựa vào nó khi đi gõ phím.

**乳歯 phải gõ phím A..E, không phải phím số.** `BuiInfo.ProcessCmdKey` (BuiInfo.cs:420-427)
đặt `NyusiFlg = true` cho nhánh chữ cái, và `BuiLabel.chkVal` (:199) đưa ô trống lên **11**.
Gõ phím số cho một răng sữa thì ô mang giá trị `1..9` ⇒ nhánh SN/NKon **không bao giờ chạy**
và testcase xanh giả.

---

## 4. ⚠️ `ModCommon.pbui` đọc từ DÒNG ĐANG CÓ CON TRỎ — điểm lệch lớn nhất với web

`SigaChg` KHÔNG nhìn 部位 của 処置 vừa chọn. Nó duyệt `ModCommon.pbui[0..31]`
(frm203016.cs:1145-1265), mảng do `CommonInp.getGridBuiDisInf()` nạp từ **cột 8..39 của
dòng đang có con trỏ** (CommonInp.cs:594-600), gọi ngay trước khi mở 処置選択
(modMain.cs:286 / :605).

⇒ Thứ tự **bắt buộc** trong mọi testcase: **đặt 部位 cho dòng TRƯỚC, gõ mã 処置 SAU.**
Làm ngược lại thì `pbui` toàn 0, câu `update Siga` rỗng và không bao giờ được phát —
testcase đỏ với thông điệp 「WinForm không ghi 歯式」 trong khi WinForm hoàn toàn đúng.

Bên web thì 部位 đi kèm payload của **từng dòng**; ở WinForm nó là **trạng thái toàn cục
của phiên chạy**. Hai mô hình khác nhau về bản chất, và mọi khác biệt hành vi quanh
「dòng nào bị ảnh hưởng」 đều bắt nguồn từ đây.

---

## 5. Sáu điểm LỆCH tìm được khi đọc source (trước khi chạy)

| # | WinForm | Bản web | Ghi chú |
|---|---|---|---|
| 1 | Ｐ変更 khi tháng không có 病名 Ｐ/Ｇ: **im lặng**, không làm gì (frm203002.cs:6365-6383 chỉ có `if`, không `else`) | bung alert 「当月にＰ／Ｇの病名がありません。」 | Web THÊM một thông báo WinForm không có |
| 2 | Nhánh 乳歯 của `DelExtRec` đọc **`ModCommon.pbui[i]`** chứ không đọc `arrBui[i]` của dòng bị xoá (frm203002.cs:6158) | đọc 部位 của chính dòng bị xoá | Nhánh 永久歯 (:6146) thì đọc `arrBui` — hai nhánh cạnh nhau đọc hai nguồn khác nhau |
| 3 | F9 **giữ nguyên `disp_no`** của dòng cũ (modSave.cs:306) | `bulk-save` xoá mềm cả tháng rồi đánh số lại | Vì thế bên WinForm dữ liệu seed `disp_no 9001/9002` sống sót qua F9 |
| 4 | `SigaChg` lấy 部位 từ dòng con trỏ (mục 4) | 部位 theo từng dòng trong payload | |
| 5 | `SigaChg` case 122 nhánh 乳歯 nhét `NKon{n} = 4` vào câu **`update Siga`** (frm203016.cs:1155-1160) | — | **Bug thật của WinForm.** Nhánh save-time (modSave.cs:800/:804) thì đúng (`ref strKon`). ĐỪNG port theo nhánh input-time |
| 6 | `Chk_PModeKesson` bỏ qua 4 ô 智歯 ở **cả hai** vòng (:7460 và :7472) và không đụng 乳歯 | như trên | Đã port đúng; giữ làm đối chứng |

Số liệu đo được trên máy thật nằm ở mục 7 (điền sau mỗi lượt chạy).

---

## 6. Chạy

```powershell
# 1) PROBE trước — bắt buộc khi máy/dữ liệu đổi. KHÔNG assert, chụp ảnh từng bước.
.\run-change-tooth-status.ps1 -Diagnostics -Case Tc0 -AllowSave   # 179 抜歯: SigaChg + DelExtRec
.\run-change-tooth-status.ps1 -Diagnostics -Case Tc1 -AllowSave   # 乳歯 · ＥＭＲ 122/3 · 185
.\run-change-tooth-status.ps1 -Diagnostics -Case Tc2 -AllowSave   # Ｐ変更 · dirty gate
.\run-change-tooth-status.ps1 -Diagnostics -Case Tc3 -AllowSave   # F9 登録

# 2) Rồi mới chạy testcase
.\run-change-tooth-status.ps1 -AllowSave
.\run-change-tooth-status.ps1 -AllowSave -Case TcDEL
```

Đáp án của probe nằm ở các dòng `=== KQ-n ===`, runner lọc sẵn ra `siga-tooth-KQ.txt`.
Ảnh + nhật ký từng bước ở `bin\Debug\net8.0-windows\artifacts\screenshots\<tên test>\`.

### ⚠️ Luồng này GHI DB, và không tránh được

`SigaChg` phát `update Siga` **ngay khi chốt một 処置 抜歯**, trước cả khi người dùng kịp
nghĩ tới F9. Không có cách nào "chỉ nhìn" ba đường đầu. Vì thế:

- cờ **riêng** `sigaTooth.allowSave` (mặc định `false` ⇒ cả bộ tự Ignore **trước khi mở app**);
- fixture chụp `SIGA`/`KON` ở `OneTimeSetUp`, **in ra stdout**, trả lại ở `OneTimeTearDown`;
- bị Ctrl+C giữa chừng thì dựng lại bằng tay theo khối 「NGUYÊN TRẠNG」 trong log.

Cờ tách khỏi `parity.allowSave` là có chủ ý: hai luồng ghi vào những bảng khác hẳn nhau
về mức rủi ro (`TRNTRN`/`ACC_DAT` là 処置行 và sổ tiền; ở đây là `SIGA`/`KON`).

### Tiền đề bộ test KHÔNG tự dựng được

1. Bệnh nhân test có dòng trong `SIGA` và `KON` (app tự tạo khi mở màn — modKonSiga.cs:70-84).
2. Tháng của `patient.trtDate` có **ít nhất một dòng 処置** để đứng lên gõ mã. Tháng trống
   thì không dòng nào mở được 部位選択.
3. Master của tháng đó có `179`, `122` 枝番 3, `185`. Probe hỏi thẳng DB và in ở `=== KQ-1 ===`.

---

## 7. Đo được trên máy thật

> Mục này là bộ nhớ của luồng. Điền sau mỗi lượt chạy, đừng để trống.

### 2026-09-03 — bệnh nhân 10, 診療月 2026-08 (`MST_TRT266`)

**Hai chiều của 歯式 đều chạy, và đều chạy NGAY LÚC NHẬP/XOÁ:**

| Thao tác | Kết quả trong `SIGA` | Bấm F9 chưa? |
|---|---|---|
| chốt `179/1` 抜歯手術(前歯) trên ô 10 (左上3) | `se11: 0→4` | **chưa** |
| xoá chính dòng đó | `se11: 4→0` | **chưa** |
| chốt `179/0` 抜歯手術(乳歯) trên ô 6 (右上Ｂ, phím `B`) | `sn4: 5→9` | **chưa** |
| xoá chính dòng đó | `sn4: 9→5` (KHÔNG phải 0) | **chưa** |

Răng đối chứng `se19` đứng yên suốt cả bốn thao tác; không cột nào ngoài ô được chọn bị đụng.

**Hình dạng thật của `grdRegi`** (診療入力設定 đang bật 過去データ１画面表示):

```
[0]  (null) | R 08年07月 | (null) | (null) | (null)   ← tiêu đề THÁNG, rect RỖNG
[1]  20 | 54321|…|(5) | C | - | -                     ← 部位病名行, ô 点 = 「-」
[2]  20 | (null) | 歯科初診料 | 272 | 1                ← 処置行
[3]  20 | R 08年07月 合計 | 実日数: 1日 272 点 | …     ← 合計 THÁNG
[14] 3  | (null) | [負担金 0円]  [日計 339点] | …      ← 日計行
```

Ô trống đọc ra chuỗi **`(null)`**, không phải rỗng. Tháng đang mở nằm **cuối** lưới.

**Danh sách 病名選択** (đọc từ chính lưới):
`1|100 Ｃ` · `2|103 Ｐ` · `3|102 Per` · `4|101 Pul` · `5|153 ,` · `6|151 →` · `7|107 GA` ·
`8|317 義歯ハソン` · `9|110 Dul` · `10|104 単Ｇ` · `11|154 の疑い`

**Ba cái bẫy đã trả giá trong chính bộ test này** (không phải lỗi app):

1. **Ô trống của lưới đọc ra `(null)`.** Bộ lọc dòng đầu tiên vì thế chọn nhầm dòng
   *tiêu đề tháng* — dòng đó có **rect rỗng**, và `FocusCell` ném đúng như nó được thiết kế
   để ném (click vào rect rỗng = bắn chuột ra góc trái trên Desktop).
2. **`部位病名行` cũng có ô 療法 rỗng.** `InsertBlankRow` vì thế nhận nhầm nó là "dòng
   trống vừa chèn" rồi mở lại 部位選択 **của dòng đang có** — tức sửa dữ liệu thay vì tạo
   mới. Dòng trống thật thì **ô 点 cũng rỗng**; 部位病名行 mang `-`.
3. **Gõ mã vào ô nhập của 病名選択 KHÔNG chọn được 病名.** `Insert` đổi nhãn sang
   「コード」 thật (đọc được), gõ `100` + Enter vẫn không chốt: End 登録 ngay sau đó bung
   「病名が選択されていませんが、よろしいですか?」. Đường chạy được là **double-click dòng
   lưới** — `dgvView_CellDoubleClick` gọi thẳng `chkDisSb` (frm902007.cs:480).
   Trả lời 「いいえ」 cho câu đó là **huỷ cả lượt đặt 部位**: `ComParam` về null và
   `OpenDialogBuiAndByou` thoát sớm, dòng lưới vẫn trắng. Lượt probe đầu tiên đã dính
   đúng thế: 部位選択 chọn đúng ô 10 mà 抜歯 sau đó lại ghi `se4..se8`, vì nó lấy 部位 của
   **部位病名行 có sẵn phía trên** (`54321`).

**Ghi nhận thêm:** chốt một dòng 抜歯 làm app **tự chèn thêm một dòng 麻酔**
(「ＯＡ＋オーラ注歯科用カートリッジ …」, 11 点). Không phải test thêm vào — đừng đếm số dòng
để kết luận gì.

**Chưa đo:** `122/3` → `KON`, `185` → hộp thoại 抜歯同時, Ｐ変更 → `Chk_PModeKesson`,
dirty gate của F10. Ba lượt probe Tc1/Tc2/Tc3 còn đang chạy.
