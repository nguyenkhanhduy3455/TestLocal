# CmtPackExitFlg — `exit_flg` của 摘要コメントパック

Luồng này trả lời **một câu**, và câu đó đang làm vế web sai:

> Một 候補 có `exit_flg` trên hộp thoại 摘要選択 có **cắt** được các pack phía sau không —
> và cắt theo **đúng dòng người dùng chọn**?

Nguồn yêu cầu: `userapp/fla-ui-todo-cmt-pack.md` §A1, §A2 (mức **cao — đang sai**), §B1, §B4,
§C1. Nguồn chân lý: `userapp/src/OCHACOM/INP/Lib/CmtAuto.cs` (`prgCmtAuto`),
`INP/Forms/frm203018.cs`.

```
grdRegi — Enter ở ô 回              (frm203002.cs:5733-5738)
  └─ ModMain.Chk_CmtAuto
       └─ CmtAuto.prgCmtAuto        (CmtAuto.cs:54)
            for (i = 0; i < MstCmtPackData.Count; i++)   ← ORDER BY a.seq_no
                switch (pack_type) { 1 / 10 / 50 / 90 … }
                if (exit_flg) break;                     ← CmtAuto.cs:917-919
```

`exit_flg` đến từ **ba nguồn khác nhau** — đó là cả vấn đề:

| pack_type | cờ lấy từ đâu | file:dòng |
|---|---|---|
| `1` (リスト選択) | **dòng NGƯỜI DÙNG CHỌN** trên frm203018 | `frm203018.cs:488` → `CmtAuto.cs:295-299` |
| `10` (自動選択) | `MST_CMT_PACK_DETAIL[0].exit_flg` của nhánh handler | `CmtAuto.cs:3659` |
| `90` (ユーザー入力) | **ĐẶT TRƯỚC KHI MỞ hộp thoại** | `CmtAuto.cs:838-841`, dialog ở `:880` |

**Vế web hiện tại** (`ochacom-saas`, nhánh `fix/inp-pack-tekiyou-dialog`):
`cascadePackAlwaysExits` chỉ dừng khi **MỌI** 候補 đều `exit_flg`. `I017` có 8/12 ⇒ điều kiện
đó không bao giờ đúng ⇒ web hỏi tiếp cả ba pack đuôi kể cả khi người dùng chọn 番号 1.

---

## 1. Các ca

| ca | fixture | mở app? | đo gì |
|---|---|---|---|
| `TCX_0` | `CmtPackExitFlgMasterTests` | không | bảng tra: pack type 1 nào có 候補 **trộn** `exit_flg` |
| `TCX_1` | ″ | không | `I017` (195/0) — 4 pack, 12 候補, `exit_flg` 8 t / 4 f |
| `TCX_2` | ″ | không | `B014` (108/4, 108/5) — 3 pack, 候補 「１回目」 `exit_flg = t` |
| `TCX_3` | ″ | không | `I030` 歯清 (108/2) — 6 pack, điểm cắt là 歯清-特 |
| `TCX_4` | ″ | không | `I011-2-1-1` ＳＰＴ — 初回 `exit_flg = t`, `com_cd` pattern **50** ⇒ in ĐỦ NGÀY |
| `TCX_5` | `CmtPackExitFlgUiTests` | có | 195/0 chọn **番号 1** (イ, exit=t) → cascade **PHẢI dừng** |
| `TCX_6` | ″ | có | 195/0 chọn **番号 7** (ト, exit=f) → ba pack đuôi chạy |
| `TCX_7` | ″ | có | 195/0 chọn **番号 10** (ヌ, exit=f) → đo xem `I017-3` có điều kiện riêng không |
| `TCX_8` | ″ | có | 195/0 bấm **戻る** → huỷ **KHÔNG** dừng cascade (đối chứng) |
| `TCX_9` | ″ | có | 108/5 chọn **番号 1** (１回目, exit=t) → `B014-3` **KHÔNG** mở |
| `TCX_10` | ″ | có | 108/5 bấm **戻る** → `B014-3` **CÓ** mở (đối chứng) |
| `TCX_11` | `CmtPackKonCSeedTests` | có + **seed** | §B3 — huỷ `frm203019` của pack type 90 mà cascade **vẫn** bị cắt |
| `TCX_12` | ″ | có + **seed** | §B3 — xác nhận `frm203019`: kết quả **y hệt** `TCX_11` |
| `TCX_13` | ″ | có + **seed** | §B1 — `歯清-特` cắt sạch `seq 4..7` |
| `TCX_14` | `CmtPackCeOnlySeedTests` | có + **seed** | **đối chứng** cho `TCX_11`: `I030-2-3` ra được dòng 口管強 |
| `TCX_15` | `CmtPackPrevDateTests` | có | §B2 — dòng **chưa F9** của ngày 3 được tính khi gõ ở ngày 14 |
| `TCX_16` | ″ | có | §B2 đảo — dòng ngày 14 **không** lọt vào cửa sổ của ngày 3 |
| `TCX_17` | `CmtPackPrevDateLatestTests` | có + **seed** | §B2 — dòng **chưa lưu** của ngày muộn thắng dòng **đã lưu** của ngày sớm |
| `TCX_18` | `CmtPackSptTests` | có + **seed** | §B4 điểm 1 — `ＳＰＴ又はＰ重防前回実施年月` in **ĐỦ NGÀY** |
| `TCX_19` | `CmtPackSptJyubouTests` | có + **seed** | §B4 điểm 2 — `Ｐ重防 167/9` tính là 「lần trước」 của ＳＰＴ |
| `TcXP0..4` | `CmtPackExitFlgProbeTests` | có | probe `[Explicit]`, không assert |

### Chạy theo lô

```powershell
.\run-cmt-pack-exit-flg.ps1                          # 5 ca DB, ~0.3 giây, KHÔNG mở app — chạy TRƯỚC TIÊN
.\run-cmt-pack-exit-flg.ps1 -Probe -Case TcXP1       # PROBE quan trọng nhất (xem §3.5)
.\run-cmt-pack-exit-flg.ps1 -Ui   -Case TCX_5        # ca UI không seed   (~2 phút/ca)
.\run-cmt-pack-exit-flg.ps1 -Seed -Case TCX_11       # ca UI CÓ seed      (~3 phút/ca)
.\run-cmt-pack-exit-flg.ps1 -SeedCe -Case TCX_14
.\run-cmt-pack-exit-flg.ps1 -PrevDate       -Case TCX_15
.\run-cmt-pack-exit-flg.ps1 -PrevDateLatest -Case TCX_17
.\run-cmt-pack-exit-flg.ps1 -Spt  -Case TCX_18
.\run-cmt-pack-exit-flg.ps1 -SptP -Case TCX_19
```

⚠️ **Đợi dòng `runner-task END` trong `logs\runner.log`, đừng ngủ một khoảng cố định.** Ca hai
vòng + cuộn lưới mất tới ~5 phút; copy `.trx` sớm là copy phải kết quả của **lượt trước** — đã
vấp thật 2026-09-17 và suýt đọc nhầm ba ca liền.

**Chạy RIÊNG từng ca UI** (F7). Chạy chung một lượt thì ca thứ hai gõ lại cùng một mã trong
cùng một ngày; `once_day`/`once_month` của pack đọc **cả lưới đang mở**
(`getTreatDataPackCd`, `CmtAuto.cs:80-96`) nên pack có thể bị bỏ qua và ca kết luận **ngược**
— mà ngược đúng theo chiều 「cascade đã dừng」, tức **xanh sai**. Mọi ca UI đều tự kiểm tiền đề
này (`Assert.Inconclusive` khi ngày đó đã có sẵn mã), nhưng đừng mất một lượt vì chuyện đó.

### Ghi DB

**Không ca nào bấm F9 登録.** Dòng do testcase gõ chỉ nằm trong lưới đang mở và biến mất khi
`runner-task.ps1` kill `MENU.exe`.

`TCX_11..14` và `TCX_17..19` **có ghi DB**: chúng chèn vài dòng **lịch sử 算定** vào `TRNTRN`
rồi xoá lại ở `OneTimeTearDown`. Ba hàng rào (F20):

| | |
|---|---|
| cờ riêng | `cmtPack.allowSeed`, **mặc định tắt** ⇒ fixture tự `Ignore` **trước khi mở app** |
| dải `disp_no` | **9100..9199**, `DELETE` chặn cứng trong dải — xem §3.7 |
| chụp / in / trả lại | nguyên trạng in ra stdout **trước** khi seed; teardown xoá rồi **đếm lại** |

Kiểm sau mỗi buổi: `SELECT COUNT(*) FROM TRNTRN WHERE DISP_NO BETWEEN 9100 AND 9199` phải ra **0**.

> ⚠️ Dọn tay thì **đừng bấm 「はい」** ở 「処置データは、変更されています。保存しますか？」 —
> `modSave.SaveData` xoá sạch rồi chèn lại toàn bộ 処置行 của tháng.

---

## 2. Đo được trên máy thật

### 2026-09-17 · `CmtPackExitFlgMasterTests` · SIM2000 · 算定日 2026-08-03 · 5/5 xanh

**Bốn pack có 候補 trộn `exit_flg`** — tức bốn chỗ cascade phụ thuộc **dòng người dùng chọn**:

| pack | type | 候補 exit / tổng | 処置 kích hoạt |
|---|---:|---:|---|
| `I017` | 1 | **8 / 12** | `195/0..4` 口腔内装置 |
| `B014-2` | 1 | 1 / 2 | `108/4`, `108/5` 退院時共同指導料１ |
| `I011-2-1-1` | 10 | 1 / 2 | `167/1-3` ＳＰＴ |
| `I011-2-1-2` | 1 | 5 / 7 | `167/1-3` ＳＰＴ |

`I017` — 4 pack theo `seq_no`, và **12 候補 khớp từng chữ** bảng §A1 của ghi chú gốc:

```
I017    [20180401..∞] type 1   口腔内装置                                   ← 12 候補
I017-1  [20200401..∞] type 50  …気管内挿管時の歯の保護等-手術予定年月日      ← 0 候補, com_cd1 850100394
I017-2  [20200401..∞] type 90  …気管内挿管時の歯の保護等-保険医療機関名      ← 0 候補, com_cd1 830100462
I017-3  [20240601..∞] type 50  …外傷歯の保護-外傷受傷年月日                 ← 0 候補, com_cd1 850190274

exit_flg = t : 番号 1,2,3,4,5,6,8,9        (イ ロ ハ ニ ホ ヘ / チ リ)
exit_flg = f : 番号 7, 10, 11, 12          (ト / ヌ日常 ヌ運動 / ル)
```

Ba thứ master nói thêm mà ghi chú gốc chưa có:

1. **`I017-1/2/3` KHÔNG có `MST_CMT_PACK_DETAIL`** — câu comment lấy từ `com_cd1` của
   `MST_CMT_PACK_DEF`, và `setPacData(med_kbn, MstCmtPackData, strDt)` **luôn đặt `cnt = "0"`**
   (`CmtAuto.cs:3675`). ⇒ ba pack đuôi **không bao giờ tự dừng cascade**; chỉ có 候補 của
   `I017` mới dừng được. Vì thế chọn 番号 7 (ト) thì cả `I017-3` (外傷受傷年月日) cũng chạy —
   đó chính là câu §A1 mục 2 đang hỏi, và `TCX_6`/`TCX_7` đo nó.
2. **`B014-2` 候補 2** mang `com_cd 810000001` ⇒ pattern **10** (không phải 20), rơi vào nhánh
   `case 10` của `prgCmtAuto` (`CmtAuto.cs:286-299`). `exit_flg` vẫn `f`.
3. **`I030-2-2` (type 90) có `exit_flg = t`** ⇒ §B3 đúng ở mức master: cờ được đặt **trước**
   `showDialog(ID203019)` nên huỷ hộp thoại không gỡ được cờ. Còn thiếu một lượt UI để chốt
   (xem §4).

`I011-2-1-1` — §B4 trả lời được **ngay ở master**, không cần UI:

```
番号 1  exit_flg=t  com_cd 820190337  pattern 20  「初回（ＳＰＴ）」
番号 2  exit_flg=f  com_cd 850100337  pattern 50  「ＳＰＴ又はＰ重防前回実施年月」
```

⇒ **điểm 1**: pattern 50 ⇒ `setPacData` ghép `com_nm + " " + gggyy年MM月dd日` (`CmtAuto.cs:3620-3627`)
— **ĐỦ NGÀY**, và `fmt_str` của dòng (`ＳＰＴ又はP重防前回実施年月`, chữ P nửa rộng) **bị bỏ
qua hoàn toàn**. ⇒ **điểm 3**: 初回 mang `exit_flg` ⇒ khi ra 初回 thì `I011-2-1-2` (hộp thoại
３ヶ月以内) **không** mở.

### 2026-09-17 · `CmtPackExitFlgUiTests` · bệnh nhân 10 · 診療月 08年08月 · ngày 3 · 6/6 xanh

| ca | chuỗi hộp thoại đo được | dòng comment rơi xuống lưới |
|---|---|---|
| `TCX_5` 195/0 chọn **番号 1** (イ) | `frm203018` — **hết** | 「イ 顎関節治療用装置」 |
| `TCX_6` 195/0 chọn **番号 7** (ト) | `frm203018` → `frm203048`(手術予定年月日) → `frm203019`(保険医療機関名) → `frm203048`(外傷受傷年月日) | 「ト 気管内挿管…」 · 「口腔内装置手術予定年月日 令和08年09月17日」 · 「TESTCMT」 · 「外傷受傷年月日 令和08年09月17日」 |
| `TCX_7` 195/0 chọn **番号 10** (ヌ) | **giống hệt `TCX_6`** | 「ヌ 外傷歯の保護…」 + ba dòng như `TCX_6` |
| `TCX_8` 195/0 **戻る** | **vẫn giống `TCX_6`** | chỉ ba dòng đuôi — **mất** dòng của `I017` |
| `TCX_9` 108/5 chọn **番号 1** (１回目) | `frm203019`(患者が入院している保険医療機関名) → `frm203018` — **hết** | 「TESTCMT」 · 「1回目(退院時共同指導料1)」 |
| `TCX_10` 108/5 **戻る** | `frm203019`(患者が入院…) → `frm203018` → `frm203019`(**該当する病名**) | 「TESTCMT」 · 「TESTCMT」 |

**Trả lời cho `userapp/fla-ui-todo-cmt-pack.md`:**

- **§A1 — đúng, và web đang sai.** `exit_flg` của **đúng dòng người dùng chọn** cắt cascade
  (`TCX_5`). ⇒ vòng lặp cascade bên web phải **đợi** lựa chọn rồi mới quyết chạy pack sau;
  `cascadePackAlwaysExits` (chỉ dừng khi **mọi** 候補 đều exit) không bao giờ đúng với `I017`.
- **§A1 mục 2 — câu bỏ ngỏ đã có đáp án: chọn ト (番号 7) VẪN ra 外傷受傷年月日.**
  `TCX_6` và `TCX_7` cho ra **cùng một chuỗi bốn hộp thoại**. `I017-1/2/3` **không** gắn với
  候補 nào; chúng chỉ chạy-hay-không theo `exit_flg`. Tên pack (「…気管内挿管時の歯の保護等-
  手術予定年月日」) chỉ là **mô tả ý đồ**, master không có điều kiện nào cài đặt nó.
- **§A2 — đúng.** `TCX_9` / `TCX_10` là cặp đối chứng: khác nhau đúng **một** thao tác trên
  frm203018, mà `B014-3` 該当する病名 có/không mở theo đúng `exit_flg`.
- **Huỷ ≠ dừng** (`TCX_8`, `TCX_10`). `exit_flg` chỉ bật bên trong
  `if (formControl.formParam.ComParam != null)` (`CmtAuto.cs:276-299`), mà nhánh đó không chạy
  khi người dùng bấm 戻る. Bản port nào gộp 「không chọn gì」 với 「chọn dòng có exit_flg」 là
  sai theo chiều còn lại.

**Ba thứ đo được mà ghi chú gốc chưa có — cả ba đều ảnh hưởng trực tiếp tới vế web:**

1. **Dòng của pack `type 90` KHÔNG có tiền tố `com_nm`.** Lưới nhận **đúng chuỗi người dùng
   gõ** — `frm203019.setPacData` đặt `data.trtNm = _strBui + txtChiryo.Text.Trim()`
   (`frm203019.cs:199-213`); `_param.com_cd` chỉ đi vào `freeWd`. Chuỗi
   「口腔内装置手術を行う保険医療機関名；」 **chỉ hiện ở nhãn hướng dẫn**. ⇒ hai pack type 90
   khác nhau (`B014-1` và `B014-3`) đẩy ra **hai dòng giống hệt nhau**, chỉ phân biệt được
   bằng `freeWd` (com_cd + pack_cd).
2. **`frm203048` chốt NGÀY HÔM NAY, không phải 算定日.** Lưới ra 「…令和08年09月17日」 trong khi
   算定日 là 08年08月03日 — `frm203048_Load` gọi `dtUpdate.setDate(DateTime.Today)`
   (`frm203048.cs:148`) và ẩn `txtValue`. Vế web nếu điền sẵn 算定日 là **lệch**.
3. **`108/4` không dùng được trên máy test.** App bung
   「08/03 108-4 退院時共同指導料1(歯援診1、歯援診2又は歯援病)を算定していますが、歯援診1、歯援診2、
   歯援病の届出が必要です。」, 月計 **Δ 0**, và **không pack nào chạy**. Đây là giới hạn
   **dữ liệu 施設基準** của phòng khám test, không phải của cascade — ca UI vì thế dùng
   `108/5` 「退院時共同指導料1(1以外)」, mà `TCX_2` đã khoá là kích hoạt **cùng** ba pack.

**Hai bẫy đọc chuỗi, đã trả giá trong buổi này:**

- Ô lưới chen **khoảng trắng** vào giữa chuỗi dài: 「…口腔内装置(日常生活時**␣**の外傷歯の保護…」.
  Assert 「nguyên văn」 trên chuỗi đã qua tay UI là xanh giả/đỏ oan — mọi hằng số so chuỗi ở đây
  cố ý là **mẩu ngắn**.
- `Uia.IsOnScreen` trên một `MessageBox` vừa bị `PostMessage(BM_CLICK)` đóng còn trả `true`
  thêm một nhịp ⇒ vòng `DrainDialogs` tưởng 「hộp thoại không đóng」 và dừng sớm. Nay guard
  hỏi lại `OpenDialogs()` và chỉ dừng khi hộp thoại đứng đầu **vẫn mang đúng nội dung/nhãn**
  vừa trả lời (`CmtPackCascade.SameDialog`).

### 2026-09-17 · các fixture CÓ SEED · bệnh nhân 10 · 診療月 08年08月 · 9/9 xanh

Seed nằm ở `TRNTRN` dải `disp_no 9100..9199`, dọn sạch sau mỗi lượt (đã kiểm: `COUNT(*) = 0`,
bệnh nhân 10 về đúng 14 dòng, dòng 再初診 `disp_no = 9001` nguyên vẹn).

| ca | seed | dòng comment rơi xuống lưới | hộp thoại của pack |
|---|---|---|---|
| `TCX_11` §B3 | `116/23` + `116/20` ngày 3 | 「初回(歯清)」 · **「口管強(歯清)」 ×1** | `frm203019` ×1 → **戻る** |
| `TCX_12` §B3 | ″ | 「初回(歯清)」 · **「口管強(歯清)」 ×1** · 「TESTCMT」 | `frm203019` ×1 → 確定 |
| `TCX_13` §B1 | ″, và gõ `105/2` trước (chưa F9) | 「初回(歯清)」 · **「歯科診療特別対応加算算定後」** · **0× 口管強** | **không có** |
| `TCX_14` đối chứng | **chỉ** `116/20` ngày 3 | 「初回(歯清)」 · **「口管強(歯清)」 ×1** | **không có** |
| `TCX_15` §B2 | không seed | ngày 3 → 「初回(歯清)」; ngày 14 → **「歯清前回実施年月 令和08年08月03日」** | `frm203018` 歯清-月１回 ở lượt 2 |
| `TCX_16` §B2 đảo | không seed | ngày 14 → 「初回(歯清)」; ngày 3 → **「初回(歯清)」** lần nữa | — |
| `TCX_17` §B2 | `108/2` ngày 3 (đã lưu) + mồi ngày 20 | ngày 14 → 「歯清前回実施年月 **令和08年08月03日**」; ngày 20 → 「歯清前回実施年月 **令和08年08月14日**」 | `frm203018` 歯清-月１回 |
| `TCX_18` §B4-1 | `167/1` ngày 3 | ngày 14 → **「SPT又はP重防前回実施年月 令和08年08月03日」** | — |
| `TCX_19` §B4-2 | **`167/9` Ｐ重防** ngày 3 | ngày 14 → **「SPT又はP重防前回実施年月 令和08年08月03日」** | — |

**Trả lời cho `userapp/fla-ui-todo-cmt-pack.md`:**

- **§B1 — ĐÚNG, bản port đã viết là đúng.** Cùng ngày có `105/2` thì `I030-2` (seq 3) ra câu
  **và** mang `exit_flg` ⇒ `break` ⇒ **0 dòng 口管強** dù lịch sử `116/23` và `116/20` đều có sẵn.
  `TCX_11` (cùng seed, **không** có 加算) ra 1 dòng — đó là đối chứng. Dialog `歯清-月１回` cũng
  biến mất.
- **§B3 — ĐÚNG.** `exit_flg` của pack type 90 đặt **trước** `showDialog` (`CmtAuto.cs:838-841`
  → dialog ở `:880`): `TCX_11` (戻る) và `TCX_12` (確定) khác nhau đúng một thao tác mà **cùng ra
  1 dòng 口管強** — tức `I030-2-3` bị cắt trong cả hai. `TCX_14` chứng minh dòng thứ hai ấy là
  **dòng có thật**: bỏ `116/23` đi thì `I030-2-3` ra đúng nó.
- **§B2 — ĐÚNG, và rộng hơn ghi chú gốc.** `TCX_15`: dòng `108/2` gõ ở **ngày 3 chưa F9** được
  tính khi gõ ở **ngày 14** ⇒ 「歯清前回実施年月 **令和08年08月03日**」, **ĐỦ NGÀY**.
  `TCX_17`: khi có **hai** ứng viên — một **đã lưu** ở ngày 3 và một **chưa lưu** ở ngày 14 —
  thì **dòng chưa lưu của ngày muộn thắng** (ra `令和08年08月14日`). `TCX_16`: dòng của ngày 14
  **không** lọt ngược vào cửa sổ `[初診日, 算定日-1]` của ngày 3.
  ⇒ vế web: gộp dòng chưa lưu của **cả tháng** vào **trước**, rồi mới rơi về DB — đừng làm ngược,
  và đừng chỉ lấy 「dòng muộn nhất trong tháng」 mà bỏ vế 「phải trước 算定日」.
- **§B4 điểm 1 — ĐÚNG, in ĐỦ NGÀY.** `TCX_18` đo được 「SPT又はP重防前回実施年月 令和08年08月03日」.
  `cmtSPT` nối `年月` vào `fmt_str` (`CmtAuto.cs:2370`) nhưng `setPacData` rẽ theo `com_cd`
  pattern **50** và **bỏ qua `fmt_str`** (`CmtAuto.cs:3616-3627`). ⇒ vế web quyết định định dạng
  bằng `com_cd`, **không** bằng `fmt_str`.
- **§B4 điểm 2 — ĐÚNG, và đây là chỗ dễ port sai nhất.** `TCX_19`: seed **`167/9` Ｐ重防** —
  mã đã **rời `MST_TRT266`** sau 令和８年６月改定 và pack `I011-2-3-1` đã hết hạn `2026-05-31` —
  vậy mà ＳＰＴ vẫn ra 「前回実施年月」. Vì `cmtSPT` tra `getMstCmtPackTrtCd("I011-2-3-1", …)` bằng
  **ngày cố định 2026-05-31** (`MedicalFeeRevision_202606.AddDays(-1)`, `CmtAuto.cs:2331-2333`),
  **không** bằng 算定日. Port theo 算定日 ⇒ ra RỖNG ⇒ web in 「初回（ＳＰＴ）」 trong khi WinForm in
  「前回実施年月」 — **sai hẳn nội dung レセプト**.
- **§B4 điểm 3 — chỉ đứng được ở mức master, KHÔNG đo được trên máy này.** `I011-2-1-2` có
  `condition = "SPT1-3-monthly"`, mà nhánh đó kiểm **施設基準届出** trước mọi thứ khác
  (`CmtAuto.cs:133-151`). DB test có `IINMST3(1346 か強診) [2017-02-01, 9999-12-31]` và
  `(1375 口管強) [2024-06-01, 9999-12-31]` ⇒ `pack_detail_dsp_flg = false` ⇒ hộp thoại
  **không bao giờ mở**, bất kể `exit_flg`. Probe `TcXP4` xác nhận. Muốn đo thật phải sửa
  `IINMST3` — bảng cấu hình **toàn phòng khám** — nên luồng này cố ý **không** làm.

**Ba thứ đo được thêm:**

1. **`167/1-3` gõ thẳng được** dù `KESSON = 9`: probe `TcXP4` cho thấy **không** mở 部位選択,
   月計 +290 (170点 ＳＰＴ + 120点 口腔管理体制強化加算(SPT) do `Chk_ChkAuto` tự kéo theo).
2. **`108/2`, `167/1` luôn bung MessageBox nghiệp vụ** 「…歯管、特疾管、歯在管…の算定がありません。
   算定不可です。」 (`#32770`). Nó **không** chặn dòng nào và **không** thuộc cascade — mọi phép
   đếm hộp thoại phải **loại `#32770` ra** (lượt `TCX_13` đầu tiên đỏ oan đúng vì chuyện này).
3. **Sau một vòng nhập, lưới dài ra và dòng của ngày muộn rơi ra ngoài khung nhìn** ⇒ mọi ca
   **hai ngày** phải đi qua `CmtPackUiTestBase.ScrollToLastRowOfDay` (Page Down), xem §3.8.

---

## 3. Bẫy

### 3.1 `DismissAll` bấm 「戻る」 = **HUỶ**, và huỷ ra kết quả NGƯỢC

`SigaToothFlow.DismissAll` / `FinishTreatmentEntry` gặp hộp thoại lạ thì bấm
「いいえ/No/Cancel/OK」; không nút nào khớp thì lui về `ClickButtonContaining("戻る")`. Trên
frm203018/19/48 thì 「戻る」 chính là **huỷ**.

Mà huỷ và chọn-dòng-có-`exit_flg` cho ra **hai kết quả ngược nhau**:

```
chọn 候補 exit_flg=t   →  exit_flg = true   →  break  →  pack đuôi KHÔNG chạy
bấm 戻る               →  ComParam = null   →  exit_flg KHÔNG bao giờ bật  →  pack đuôi CHẠY
```

…và **cả hai đều xanh** nếu ca đo chỉ đếm dòng comment. Vì thế luồng này **tự cầm lái** từ
`EnterCodeOnRow` trở đi (`CmtPackCascade.Run`) chứ không dùng `EnterTreatment`, và mọi hộp
thoại đều được **ghi lại đã trả lời gì** (`DialogStep.Answered`).

### 3.2 Ô 番号 là `seq_no`, KHÔNG phải chỉ số dòng

`frm203018` đổ `row["seq_no"] = _MstCmtPackDetailData[i].seq_no` (`frm203018.cs:296`) còn thứ
tự dòng thì theo `dsp_seq_no`. Hai con số lệch nhau ở nhiều pack — `I011-2-1-2` là ví dụ rõ
nhất: dòng thứ ba trên màn hình mang 番号 **5**. `PackDialogs.PickSeq` vì thế chọn theo **ô
番号**, không theo chỉ số.

### 3.3 Hộp thoại có đúng 1 dòng thì **tự chọn và tự đóng**

`getViewData`: `if (dgvView.Rows.Count == 1) defData();` (`frm203018.cs:313-315`). Không kịp
nhìn thấy gì, và `exit_flg` của dòng đó vẫn có hiệu lực. Ca nào thấy 「không có hộp thoại nào」
phải loại trừ khả năng này trước khi kết luận.

### 3.4 `frm203048` ở chế độ 「ggg」 thì **không có ô để gõ**

Chuỗi type 50 luôn chứa `gggyy年MM月dd日` ⇒ form **ẩn `txtValue`**, hiện `dtUpdate` đã
`setDate(DateTime.Today)` (`frm203048.cs:140-151`). Bấm 確定 là chốt **ngày hôm nay** — nên
dòng rơi xuống lưới mang ngày **chạy test**, không phải 算定日. Đừng assert theo `TrtDate`.

### 3.5 Dòng ngoài khung nhìn (F10)

`I017` có 12 候補. UIA của `DataGridView` phơi ra cả dòng ngoài khung nhìn, nên
`SelectRows()` đọc đủ 12 **không chứng minh** 番号 10/11/12 click được.
`PackDialogs.PickSeq` kiểm `RectOf` trước khi click và báo rõ 「HARNESS chưa cuộn được lưới」
— nhưng **chạy `TcXP1` và ĐỌC ẢNH trước** là rẻ hơn (đúng cái bẫy đã trả giá với 処置選択
枝番 23, xem `../CmtPackType10/README.md` §3.1).

### 3.6 Watcher trả lời hộ = xanh sai

Cả hai fixture đều `override NuisanceDialogPatterns => []`. Mặc định `run.nuisanceDialogs` tự
bấm 「いいえ」 cho 「を算定しますか？」 — 195/0 và 108/5 rất dễ hỏi đúng câu đó (F19).

### 3.7 Dải seed **9100..9199** — đừng nới, và đừng dùng chung với `ChkAutoDb`

Bệnh nhân test có một dòng **再初診 seed CỐ ĐỊNH ở `disp_no = 9001`**
(`100/0 歯科初診料`, `2026-07-20`) mà **không luồng nào được xoá**. `ChkAutoDb.DeleteSeededRows`
xoá `DISP_NO >= 9000` — nếu luồng này dùng chung dải đó thì một lần teardown là mất dòng ấy,
và hàng loạt ca của luồng khác đỏ với lý do không liên quan.

`CmtPackSeedDb` vì thế chặn cứng `DISP_NO BETWEEN 9100 AND 9199` ở **cả** `SeedTreatmentRow`
(chọn dòng mẫu) lẫn `DeleteSeeded`. Điều kiện đó là **hàng rào duy nhất** giữa lệnh `DELETE` và
dữ liệu thật.

### 3.8 Một vòng nhập đẩy dòng của ngày muộn ra ngoài khung nhìn

Ca **hai ngày** (`TCX_15`, `TCX_17`, `TCX_18`, `TCX_19`) gõ ở ngày sớm trước; lưới dài ra
(22 → 26 dòng) và dòng mốc của ngày muộn rơi khỏi khung nhìn. UIA vẫn phơi ra nó nhưng
`BoundingRectangle` **rỗng** ⇒ `FocusCell` ném (đúng), nhưng ca đo mất trắng một lượt chạy —
đã vấp thật 2026-09-17 (`TCX_15` lượt đầu).

`CmtPackUiTestBase.ScrollToLastRowOfDay` cuộn bằng **Page Down** (cầu MSAA→UIA của
`DataGridView` không phơi ra `ScrollBar` nào để kéo), và **không bao giờ dùng ESC** để đóng
editor — trên lưới 処置 ESC là 戻る (F14).

### 3.9 Đừng đếm `#32770` là hộp thoại của cascade

Gõ `108/2` hay `167/1` cho bệnh nhân test **luôn** bung
「…歯管、特疾管、歯在管…の算定がありません。算定不可です。」. Nó **không chặn dòng nào** (月計 vẫn
tăng đủ) và **không thuộc** `prgCmtAuto`. Mọi assert 「không hộp thoại nào mở」 phải lọc
`DialogStep.Form != "#32770"` trước — `TCX_13` lượt đầu đỏ **oan cho app** đúng vì thiếu bộ lọc này.

---

## 4. Còn nợ

| # | việc | trạng thái |
|---|---|---|
| §B4 điểm 3 | 初回 mang `exit_flg` ⇒ `I011-2-1-2` không mở | **chặn bởi dữ liệu, không phải bởi harness.** `IINMST3(1346)` còn hiệu lực vô hạn trên DB test ⇒ hộp thoại bị chặn từ trước, không phân biệt được với `exit_flg`. Master đã khoá ở `TCX_4`. Muốn đo thật phải tạm sửa `IINMST3` — cấu hình **toàn phòng khám** — luồng này cố ý không làm. |
| §C1 | thứ tự dòng 摘要 màu magenta | `TcXP3` đã dựng sẵn, **chưa chạy**. Gợi ý đọc trước: ở `TCX_6` và `TCX_11`, các dòng 摘要 rơi xuống lưới **theo đúng thứ tự pack chạy**, ngay dưới dòng 処置, và dòng 自動算定 (「ポリッシングブラシ…」) nằm **sau cùng**. Màu `0xff80ff` không ra tới UIA ⇒ câu 「dòng nào màu magenta」 chỉ **ảnh** trả lời được. |
| §C2 | 戻る ở `frm203012` → `Chk_ChkAuto` còn chạy không | thuộc luồng `AutoSanteiChkAuto`, không gom vào đây. |
| §C3 | `getTreatDataTeethDis` bỏ dòng ĐẦU của lưới (`intRow > 0`) | chưa dựng được ca: cần dòng khớp là dòng **trên cùng duy nhất** của lưới, mà dòng 0 của `grdRegi` luôn là dòng tiêu đề tháng (F11) ⇒ rất có thể là **code vô hại**. Đo được §B2 ở trên đã cho thấy dòng ngày 3 (không phải dòng 0) vẫn được quét bình thường. |
| §C4 | `%m` / `%d` | ghi chú gốc đã kết luận: không handler type 10 nào còn sống dùng tới. Không cần đo. |
| 処置選択 | chưa cuộn được lưới `dgvView` của `frm203016` | `116/20`, `116/23` vẫn **không gõ tay được** — luồng này đi đường seed. `ScrollToLastRowOfDay` chỉ cuộn `grdRegi`, chưa áp dụng cho picker. |

## 5. File

| file | việc |
|---|---|
| `PackDialogs.cs` | ba form `frm203018` / `frm203019` / `frm203048` — nhận dạng, đọc 候補, chọn/huỷ |
| `CmtPackCascade.cs` | gõ một 処置 rồi **đi trọn chuỗi hộp thoại** theo `Plan`, ghi lại từng bước |
| `CmtPackExitFlgMasterTests.cs` | `TCX_0..TCX_4` — chỉ DB, không mở app |
| `CmtPackExitFlgUiTests.cs` | `TCX_5..TCX_10` — số đo trên giao diện |
| `CmtPackExitFlgProbeTests.cs` | `TcXP0..TcXP3` — probe `[Explicit]`, không assert |
| `../../../run-cmt-pack-exit-flg.ps1` | runner |

Dùng lại nguyên: `CmtPackType10/CmtPackDb.cs` (ba bảng master, chỉ đọc),
`CmtPackType10/CmtPackOps.cs` (`LastRowOfDay`), `AutoSanteiChkAuto/AutoSanteiOps.EntryMeasure`,
`SigaToothStatus/SigaToothFlow`.

Nguồn WinForm: `INP/Lib/CmtAuto.cs` (`prgCmtAuto` 54-919, `setPacData` 3609/3669),
`INP/Forms/frm203018.cs` (`getViewData` 250-320, `defData` 334-453, `setPacData` 480-492),
`INP/Forms/frm203019.cs`, `INP/Forms/frm203048.cs`, `COMMON/DBAccess/MstCmtPack.cs`.
