# CmtPackType10 — 摘要コメントパック `pack_type = 10`（自動選択）

Luồng này trả lời hai câu mà vế web đang vướng trước khi port 30 pack type 10 còn lại
(ghi chú gốc: `userapp/cmt-pack-type10-remaining.md`):

| # | câu hỏi | trả lời bằng | trạng thái |
|---|---|---|---|
| 1 | Trong 21 condition chưa port, cái nào **còn chạy được** với 算定日 hiện hành? | `CmtPackMasterTests` (chỉ DB) | **đã đo 2026-09-16** |
| 2 | WinForm có tính những dòng **chưa F9 登録** khi tra lịch sử 算定 không? (§4.6) | `CmtPackType10UiTests` (giao diện) | **đã đo 2026-09-16 — CÓ** |

Đường đi đang đo:

```
grdRegi — Enter ở ô 回  (frm203002.cs:5731-5741)
  └─ ModMain.Chk_CmtAuto            (modMain.cs:738-800)   ← chạy CẢ KHI 回数 = 0
       └─ CmtAuto.prgCmtAuto        (CmtAuto.cs:54)
            ├─ getMstCmtPack(trt_cd, trt_sb, 算定日)        ← LỌC NGÀY hai lần (câu 1)
            └─ case 10 → cmtXxx(...) → getTreatData(...)   ← đọc CẢ lưới chưa lưu (câu 2)
       └─ chkCmtAuto_Chk_SikanDay   (modMain.cs:2159)      ← chèn dòng 点 = 0 vào lưới
```

---

## 1. Các ca

| ca | fixture | mở app? | đo gì |
|---|---|---|---|
| `TC10_0` | `CmtPackMasterTests` | không | bảng tra: mỗi condition → cửa sổ ngày, mã 処置 kích hoạt, câu comment |
| `TC10_1` | `CmtPackMasterTests` | không | 歯CAD / Denture / SPT2 / 歯清-特導 **không kích hoạt được** |
| `TC10_2` | `CmtPackMasterTests` | không | 歯清 `108/2` kích hoạt đúng 6 pack, đúng thứ tự `seq_no` |
| `TC10_3` | `CmtPackMasterTests` | không | một `pack_cd` đổi `condition` theo ngày (`I031`) |
| `TC10_4` | `CmtPackType10UiTests` | có | **đối chứng**: gõ 歯清 một mình ⇒ KHÔNG ra câu 歯清-特 |
| `TC10_5` | `CmtPackType10UiTests` | có | gõ `105/2` (chưa F9) rồi 歯清 ⇒ **ra** câu 歯清-特 |
| `TcCP0..2` | `CmtPackProbeTests` | có | probe `[Explicit]`, không assert — dò lại khi master/app đổi |

### Chạy theo lô

```powershell
.\run-cmt-pack-type10.ps1                    # 4 ca DB, ~4 giây, KHÔNG mở app — chạy trước tiên
.\run-cmt-pack-type10.ps1 -Ui -Case TC10_4   # đối chứng   (~2 phút)
.\run-cmt-pack-type10.ps1 -Ui -Case TC10_5   # phép đo     (~3 phút)
.\run-cmt-pack-type10.ps1 -Probe -Case TcCP1 # probe khi cần dò lại
```

**Chạy RIÊNG `TC10_4` và `TC10_5`** (F7). Chạy chung một lượt thì `TC10_5` gõ 歯清 lần thứ
hai trong cùng một ngày; app có thể chặn và tiền đề của phép đo không thành. Cả hai ca đều
tự kiểm tiền đề nên chạy chung cũng không cho kết quả **sai**, chỉ cho `Inconclusive`.

### Ghi DB

**Không ca nào bấm F9 登録, không ca nào seed.** Mọi dòng chỉ nằm trong lưới đang mở và
biến mất khi `runner-task.ps1` kill `MENU.exe`. Vì thế luồng này **không có cờ `allowSave`**.

> ⚠️ Dọn tay thì **đừng bấm 「はい」** ở 「処置データは、変更されています。保存しますか？」 —
> `modSave.SaveData` xoá sạch rồi chèn lại toàn bộ 処置行 của tháng.

---

## 2. Đo được trên máy thật

### 2026-09-16 · `CmtPackMasterTests` · SIM2000 · 算定日 2026-08-03 · 4/4 xanh

**12 trong 30 pack chưa port đã HẾT HIỆU LỰC** — handler của chúng là code chết với mọi
算定日 hiện hành:

| condition | pack | cửa sổ kết thúc | handler (số dòng) |
|---|---:|---|---|
| `歯CAD` | 8 | `2026-05-31` — 令和８年６月改定 bỏ hẳn, **không có pack thay thế** | `cmtTeethCAD` 54d + `chkTeethOcclusion` 107d |
| `Denture` | 2 | `2020-03-31` | `cmtDenture` **177d** |
| `SPT2` | 1 | `2020-03-31` | `cmtSPT2` 36d |
| `歯清-特導` | 1 | `2024-05-31` | `cmtTokuDou` 20d |

⇒ **Hai khối to nhất của phần còn lại (歯CAD 8 pack, Denture 177 dòng) không chạy được.**
Và cái bẫy §4.1 (`cmtSPT2` lấy bản ghi **cũ nhất** vì `break` chỉ thoát vòng `foreach`
trong) nằm trên pack đã chết từ 2020-03-31 — **không cần xác minh 「chủ ý hay bug」**, cũng
không cần port. `TC10_1` khoá con số đó lại: master mở lại nhánh nào thì ca đó đỏ.

20 condition còn sống, trong đó **17 cái chưa port**: `hokan` · `HomonEisei` · `hosin2` ·
`insurrance` · `IssueNumber` · `Kankonsyo` · `koucyo` · `RCF` · `RCT-6-monthly` · `sosyaku` ·
`SPT` · `TFix-PO` · `歯在管` · `歯清-口管強(Ce)` · `歯清-口管強(根C)` · `歯清-特` ·
`未来院装着予定日`. Bảng đầy đủ (mã 処置 kích hoạt + câu comment của từng pack) in ra ở
`TC10_0`.

Thêm ba thứ `TC10_0/TC10_2` bắt được mà ghi chú gốc chưa có:

1. **`歯清-口管強(根C)` nằm ở CẢ hai chỗ**: pack `I030-2-1` (type 10 → xuất câu cố định
   「口管強（歯清）」) và pack `I030-2-2` (type 90 → mở `frm203019` cho người dùng nhập
   「特に機械的歯面清掃が必要と認められる理由」). Cùng một hàm `cmtKouKanKyo_KonC`
   (CmtAuto.cs:3557 và :817). Ghi chú gốc §4.5 chỉ nói tới `koucyo` — đây là ca thứ hai.
2. **Một cú gõ 歯清 kích hoạt 6 pack** (`I030`, `I030-2`, `I030-2-1`, `I030-2-2`, `I030-2-3`,
   `I030-3`) theo đúng `ORDER BY a.seq_no`. Trong đó `I030-3` là type 1 (mở `frm203018`) và
   `I030-2-2` là type 90 — hộp thoại bung ra ở luồng này là **bình thường**, không phải sự cố.
3. **Cùng một `pack_cd` đổi `condition` theo ngày**: `I031` là `前回実施年月` trong
   `[2020-04-01, 2024-05-31]` rồi thành `前回実施年月-F局` từ `2024-06-01`. BE web phải lọc
   `app_st_dt/app_ed_dt` y hệt app, tra theo một mình `pack_cd` là lấy nhầm thời kỳ.

### 2026-09-16 · `CmtPackType10UiTests` · bệnh nhân 10 · 診療月 08年08月 · ngày 3

Phép đo §4.6 — **dòng chưa F9 CÓ được tính**:

| ca | lưới trước khi gõ 歯清 | comment rơi xuống |
|---|---|---|
| `TC10_4` (đối chứng) | không có dòng 105 nào | 「初回(歯清)」 · 「ポリッシングブラシ+研磨用ペースト」 |
| `TC10_5` | `105/2 特２(初診)` vừa gõ, **chưa F9** (月計 +250) | 「初回(歯清)」 · **「歯科診療特別対応加算算定後」** · 「ポリッシングブラシ+研磨用ペースト」 |

`cmtToku` (CmtAuto.cs:3521-3546) tra cửa sổ `[算定日, 算定日]` — đúng một ngày — và
`TRNTRN` của ngày đó **không có** dòng 105 nào (ca tự kiểm trước khi đo). Nên câu comment
chỉ có thể đến từ dòng đang nằm trong lưới. Đó chính là tham số thứ hai của
`CommonChk.getTreatData` → `getTreatDataTeethDis`, `_tblRegiInp` = lưới đang mở
(CommonChk.cs:653-753): app quét **当月レコード trước**, không thấy mới tra tới
`ModSave.trtDataList` (dữ liệu đã lưu).

⇒ **Vế web**: `GetLastTrtDtAsync` (chỉ đọc DB) là **thiếu** cho mọi condition có cửa sổ
chạm tới ngày/tháng hiện tại. FE phải gửi kèm các dòng chưa lưu — tiền lệ đã có:
`dayPlagueTreats` của cổng P処.

Hai chi tiết phụ đo được cùng lúc, đáng nhớ:

- **`Chk_CmtAuto` chạy cả khi 回数 = 0** (frm203002.cs:5731-5741, WinForm ghi hẳn lý do vào
  comment: 歯在管). Khác `Chk_ChkAuto` — cái đó nằm sau `if (trtCnt >= 1)`. Vì thế luồng này
  **không** cần ép ô 回 về 1 như `AutoSanteiOps.EnsureTrtCount`.
- Gõ 歯清 cho bệnh nhân test luôn bung hộp thoại
  「8/3 108-2 機械的歯面清掃処置を算定していますが、歯管、特疾管、歯在管、周III、周IVまたは回管の算定がありません。算定不可です。」
  (nút **OK / Close**). Nó **không** chặn dòng: 月計 vẫn +72 và cả ba dòng vẫn vào lưới.

---

## 3. Bẫy đã trả giá

### 3.1 `処置選択` — 枝番 ngoài khung nhìn thì double-click rơi vào hư không

**2026-09-16, probe `TcCP2` lượt đầu.** Gõ `116/23 口管強(根Ｃ管)`. `PickerRows` đọc ra 18
dòng, `CommitPick` tìm thấy phần tử của 枝番 23, bắn double-click, trace in
「double-click dong 枝番 23 … xong」 và `Committed = true`. Nhưng khung nhìn của picker chỉ
tới 枝番 17: **月計 không nhúc nhích (Δ 0), dòng thêm vào lưới rỗng.**

Đây là F10 ở một lưới khác `grdRegi`. Nếu ca đo kết luận từ đó, nó trả lời 「WinForm không
tính dòng chưa lưu」 trong khi thật ra **chưa có dòng nào cả** — xanh sai, không dấu hiệu.

Hai việc đã làm: chuyển sang mã có 枝番 nằm trong khung nhìn (`105/2`, dòng thứ ba), và
thêm mốc `CmtPackOps.CommitMeasure.InsertedTreatmentRow` — **mọi ca phải kiểm nó trước khi
đọc `CommentRows`**. Chưa có cách cuộn lưới picker; mã có 枝番 lớn thì tạm chưa gõ được.

### 3.2 Watcher trả lời hộ = xanh sai

Cả fixture UI lẫn probe đều `override NuisanceDialogPatterns => []`. Mặc định
`run.nuisanceDialogs` tự bấm 「いいえ」 cho 「を算定しますか？」 — 加算 105/116 rất dễ hỏi đúng
câu đó, và bị trả lời hộ thì dòng không vào lưới, ca kết luận ngược (F19).

### 3.3 Cửa sổ ngày nằm ở **hai** bảng

`getMstCmtPack` lọc ngày trên **cả** `MST_CMT_PACK` (mã kích hoạt) lẫn `MST_CMT_PACK_DEF`
(định nghĩa pack), MstCmtPack.cs:84-86. Hết hạn một trong hai là handler không bao giờ chạy.
`TC10_0` in cả hai cửa sổ; `CmtPackDb.PackDef.Covers` so chuỗi `yyyyMMdd` **đúng kiểu app so**
(cột là `char(8)`, không phải kiểu ngày).

### 3.4 Dòng comment nhận ra bằng `点 = 0`, không bằng màu

`chkCmtAuto_Chk_SikanDay` (modMain.cs:2159-2183) tô chữ màu `0xff80ff`, nhưng màu không ra
tới UIA. Mốc dùng được: `点 = "0"`, `回 = "1"`, chữ nằm ở ô 療法・処置.

---

## 4. File

| file | việc |
|---|---|
| `CmtPackDb.cs` | truy vấn CHỈ ĐỌC ba bảng master + `TRNTRN`; bản sao từng chữ của `MstCmtPack.cs` |
| `CmtPackMasterTests.cs` | `TC10_0..TC10_3` — không mở app |
| `CmtPackOps.cs` | gõ một 処置 không cần 部位 rồi tách các dòng comment ra khỏi các dòng thêm |
| `CmtPackType10UiTests.cs` | `TC10_4`, `TC10_5` — số đo trên giao diện |
| `CmtPackProbeTests.cs` | `TcCP0..TcCP2` — probe `[Explicit]` |
| `../../../run-cmt-pack-type10.ps1` | runner |

Nguồn WinForm: `userapp/src/OCHACOM/INP/Lib/CmtAuto.cs` (`prgCmtAuto` case 10, dòng 411-535),
`INP/Lib/CommonChk.cs` (`getTreatData` 601 → `getTreatDataTeethDis` 640),
`COMMON/DBAccess/MstCmtPack.cs`.

---

## 5. Còn nợ

- `SPT` (`I011-2-1-1`, 167/1-3) còn sống nhưng chưa có ca UI. Đo được `初回（ＳＰＴ）` /
  `ＳＰＴ又はＰ重防前回実施年月` cần lịch sử SPT — bệnh nhân 10 trống hoàn toàn.
- Các condition cần `bui` (`歯CAD`, `hokan`, `Denture`, `HomonEisei`, `hosin2`, `Kankonsyo`,
  `koucyo`, `RCF`, `RCT-6-monthly`, `TFix-PO`, `歯在管`, `未来院装着予定日`) chưa đo được ở
  đây: mọi mã của chúng đều mở 部位選択, tức là mỗi ca tốn trọn một vòng
  `Insert → 部位選択 → 病名選択 → gõ mã → 処置選択` (2-3 phút, F7).
- Chưa có cách cuộn lưới `dgvView` của 処置選択 ⇒ mã có 枝番 lớn (`116/20`, `116/23`) chưa gõ
  được — xem §3.1.
