# E00100 一部負担金計算失敗 — nửa WinForm

Nửa WinForm của
[`../../../../../web-tenant-tests/tests/accounting-unpaid/bui-price-e00100-parity.spec.ts`](../../../../../web-tenant-tests/tests/accounting-unpaid/bui-price-e00100-parity.spec.ts).

Bên kia đo **bản web**, bên này đo **chính WinForm** — tức là đo cái "đáp án" mà bản web
phải khớp.

```powershell
.\run-calc-bui-price.ps1 -Diagnostics          # PROBE sạch  — chỉ đọc
.\run-calc-bui-price.ps1 -Diagnostics -Seed    # PROBE có seed — GHI DB (có khôi phục)
```

---

## 1. Cái đang đo

`buiPrice.getBuiPrice2` **tự bắt** ngoại lệ, bật E00100 rồi trả `buiPriceData2` với giá
trị 0 cho nơi gọi (buiPrice.cs:196-203). Cả 8 nơi gọi đều chạy tiếp với số 0 — **không
nơi nào** bỏ dở màn hình hay job in.

Bản web trước đây ném lại thành `InvalidOperationException` ở 5 nơi ⇒ `ExceptionMiddleware`
trả 500 ⇒ **một bệnh nhân dữ liệu lỗi làm chết cả danh sách**. Nhánh
`fix/buiprice-e00100-parity-single-callers` đã đổi sang fail-soft; luồng này đo phía
WinForm để biết "fail-soft" phải trông ra sao.

Ba đường đi qua 診療入力 / 患者選択 — cũng là ba thứ luồng này lái:

| Đường | Hàm WinForm | Khi 一部負担金 **ném** |
|---|---|---|
| Mở 診療入力 | `frmInpMain_Load_Method` → `ModSave.GetTrnRs` → `modAcc.Calc_BuiPriceData2s` (modSave.cs:2467) | E00100 rồi 日計 ra `[負担金 0円]  [日計 0点]` (modAcc.cs:196-198) |
| F4 当日来患 | `frm203001.getTodayViewData` (frm203001.cs:908-932) | E00100 rồi **GIỮ dòng** với số 0, và vẫn cộng vào 合計 |
| F8 会計 | `modAcc.LetAccData2` (modAcc.cs:403) | (chưa đo — xem mục 6.2) |

> Cột thứ ba mô tả nhánh **NGOẠI LỆ** (A ở mục 2). Nhánh mà bộ test seed được là **(B)**,
> nó KHÔNG ném nên số **không** về 0 — xem mục 5b trước khi đọc kết quả.

> ⚠️ Đừng nhầm 当日来患 với 来患一覧. `frm203001` **giữ** dòng hỏng và ghi 0; `frm204008`
> mới là chỗ **loại** dòng (frm204008.cs:711-733). Bản web từng dùng chung một xử lý cho
> cả hai — xem `parity-notes-buiprice-error-handling.md` mục 「F4 当日来患 は 来患一覧 と同型」.

---

## 2. Hai câu E00100, và bản web chỉ có một

`buiPrice.cs` bật E00100 ở **hai** chỗ khác hẳn nhau:

**(A) nhánh NGOẠI LỆ** — buiPrice.cs:196-203, cái mà spec Playwright mô phỏng:

```
一部負担金計算に失敗しました。患者登録データを確認してください。
　患者番号[{patNo}] 枝番[{patBr}] 診療年月[{gggy年M月}]

内容[{ex.Message}]
場所[{ex.StackTrace}]
```

**(B) nhánh 福祉医療設定 THIẾU** — buiPrice.cs:1734-1737, không ném gì cả:

```
一部負担金計算に失敗しました。福祉医療設定データが存在しません。
　患者番号[{patNo}] 枝番[{patBr}] 診療年月[{gggy年M月}] 福祉医療フラグ[{lflg}]
```

Sau (B) app **vá `localFlg` bằng giá trị mặc định** (`pay_kbn = 2` 定率, `rate = acc_rate`,
`limit = 999999`, `printFlg = 0` — buiPrice.cs:1866-1872) rồi chạy tiếp. Nghĩa là (B) chỉ
sinh **một** hộp thoại, không kéo theo NullReference.

**LỆCH đã biết:** bản web **cố ý không có (B)**. `BuiPriceService.cs:936` ghi thẳng:
*"legacy shows an error dialog when lflg is set but no LocalFlg master row matches
(福祉医療設定データが存在しません) — no UI here, so this just falls through to the same
default below."* Bản web im lặng đi tiếp; WinForm báo cho người dùng.

Và với (A) thì bản web **cố ý bỏ dòng `場所[stack trace]`** (parity-notes mục
「意図的に WinForm と変えた点」 §1) — stack trace không được gửi ra trình duyệt.

Cả hai câu đều đi qua `MsgDialog.getMsg` (MsgDialog.cs:184-213) nên khuôn trong bảng
`MSGTBL` còn ghép thêm một lớp nữa. Đo trên DB demo: `MSGTBL['E00100']` đúng bằng `{0}`
⇒ thân đi qua **nguyên vẹn**, không tiền tố. Nhưng đó là DỮ LIỆU, nên probe đọc lại chứ
không viết cứng.

---

## 3. Vì sao PHẢI seed, và vì sao chỉ còn đúng một đường

Spec Playwright chèn `warnings` vào response bằng `page.route`. Bên WinForm không có lớp
nào chen vào giữa: `getBuiPrice2` đọc thẳng SQL Server trong tiến trình app. Muốn thấy
E00100 thì dữ liệu phải hỏng thật.

Đã dò hết các cột có thể phá. **Ba trong bốn ý tưởng chết vì KIỂU CỘT** (đo trên SIM2000
thật, 2026-09-07):

| Chỗ ném | Cột DB | Kết luận |
|---|---|---|
| `DateTime.Parse(pubexp.QualificationDate)` — buiPrice.cs:1652 | `PUBEXPINF.QualificationDate` = `date` | ✗ không nhét rác được |
| `DateTime.Parse(…ValidStartDate)` — buiPrice.cs:976 | `MEDINSINF.LimitApplicationCertificateValidStartDate` = `date` | ✗ như trên |
| `int.Parse(careInsData.bur_rate[j])` — buiPrice.cs:921 | `CARE_INSURANCE.bur_rate_1` = `tinyint` | ✗ như trên |
| `getLocalFlg(lflg) == null` — buiPrice.cs:1734 | `PUBEXPINF.LFLG` = `varchar(8)` | ✓ **đường duy nhất** |

Nên seed đi theo đường cuối: gán `LFLG` một mã **không có trong `LOCALFLG`**.

### Hai phép ghi, và vì sao cả hai đều cần

```sql
UPDATE INSURANCE SET PUBEXPINF_NO = @no WHERE PAT_NO = @pat AND PAT_BR = @br
INSERT INTO PUBEXPINF (PAT_NO, PUBEXPINF_NO, PUB_NO, …, LFLG) VALUES (…)
```

Chỉ `INSERT` là **chưa đủ**: câu SELECT của `PatInfoList` nối
`pub.pubexpinf_no = ins.pubexpinf_no` (PatInfoList.cs:486-488) và `setData` còn chặn thêm
`if (data.ins.pubexpinf_no != 0 …)` (PatInfoList.cs:678). Bệnh nhân test để
`PUBEXPINF_NO = 0` nên dòng seed bị bỏ qua **im lặng** — seed xong mà app vẫn chạy trơn,
và testcase **xanh sai**.

Cả hai được chụp ảnh ở `PrepareDataBeforeApp` và trả lại ở `OneTimeTearDown`. Khôi phục
so với **ảnh chụp** chứ không chỉ "xoá dòng seed": một lượt chạy chết giữa chừng có thể
để lại dòng mang số khác.

### Ba điều kiện phải đúng, fixture tự kiểm trước khi ghi

1. `buiPrice.missingLflg` **không** có trong `LOCALFLG` — trúng mã có thật thì app chạy
   trơn và testcase xanh sai.
2. `buiPrice.seedPubexpinfNo` **khác 0** — xem đoạn trên.
3. 資格取得年月日 / 有効期限 trùm cả tháng test — `setBurdenType` bỏ qua 公費 ngoài hạn
   (buiPrice.cs:1664-1670) và khi đó nhánh E00100 không tới được.

---

## 4. Bốn cái bẫy của chính bộ test

**4.1 — Nền chung KHÔNG được tự mở 診療入力 khi đã seed.**
`ModSave.GetTrnRs` gọi `Calc_BuiPriceData2s` ngay trong `frmInpMain_Load_Method`
(frm203002.cs:423 → modSave.cs:2467), nên E00100 bung ra **giữa lúc màn hình đang mở**.
`MessageBox.Show` là đồng bộ ⇒ luồng UI của app đứng lại, `AppNavigator` chờ hết 180 giây
rồi ném. Fixture có seed vì thế đặt `NavigatesToTreatmentEntry = false` và tự vét hộp
thoại **trong lúc** chờ cửa sổ.

**4.2 — Đừng nhét câu E00100 vào `run.nuisanceDialogs`.**
`NuisanceDialogWatcher` sẽ bấm hộ trước khi testcase kịp nhìn thấy. Khi đó testcase không
đỏ mà **xanh sai**: nó kết luận 「app không hỏi」 trong khi app có hỏi và đã bị trả lời mất.
Cả hai fixture ở đây đặt `NuisanceDialogPatterns => []`.

**4.3 — Bắt hộp thoại bằng Win32, KHÔNG phải UIA.**
E00100 là `MessageBox.Show` — cửa sổ lớp `#32770`, không thuộc cây UIA của form. Và
`Dialogs.Open` quét cả desktop, đã treo hơn 20 phút một lần. Dùng
`Infrastructure/MsgBoxWin32`.

**4.4 — Vét hàng đợi thì chờ 「khác hộp vừa đóng」, đừng chờ 「hết hộp」.**
WinForm hiện 「1 件 1 ダイアログ」 nối tiếp, hộp kế tiếp mở gần như ngay khi hộp này đóng —
`đếm == 0` không bao giờ đúng ở giữa. Đúng cái bẫy mà `drainE00100` của spec Playwright
đã ghi lại. Và phải vét **CẠN** kể cả khi testcase chỉ cần một hộp: bỏ sót một hộp thì nó
chắn mọi thao tác sau, và log sẽ đổ oan cho app (PROBE-GUIDELINE 3.4).

---

## 5. Bảng tương ứng với spec Playwright

| Playwright | Ở đây | Ghi chú |
|---|---|---|
| TC-CLEAN-1 `monthly-copayments` có `warnings` và rỗng | `TcClean1_TreatmentEntryHasNoDialogAndRealDailyTotals` | Bên này không có field nào để soi ⇒ mốc là 「không MessageBox nào」 **cộng** 「日計 khớp `TRNTRN`」 — thiếu vế sau thì một màn hình chết cứng cũng pass |
| TC-CLEAN-2 F4 `summary.warnings` rỗng | `TcClean2_TodayViewHasNoDialog` | |
| TC-E00100-1 日計 hỏng: văn bản đúng, màn hình sống | `TcE001003_TreatmentEntrySurvivesTheDialog` | Xem cảnh báo mục 5b — nhánh đo được **không** làm số về 0 |
| TC-E00100-2 2 warnings = 2 hộp nối tiếp | `TcE001001_TodayViewRaisesExactDialogPerRow` | WinForm chia theo **dòng bệnh nhân** (F4) / **枝番** (診療入力), không theo 「warning」 |
| TC-E00100-3 `reason` null ⇒ bỏ dòng `内容[]` | — | Không áp dụng: WinForm **luôn** in `内容[]` + `場所[]`; chính đó là điểm lệch đã chốt |
| TC-E00100-4 当日来患 giữ dòng | `TcE001002_TodayViewKeepsTheFailingRow` | |
| TC-E00100-5 F8 vẫn sang 窓口精算 | *(chưa — mục 6.2)* | |

### 5b. Nhánh đo được KHÔNG phải nhánh trả 0 — đọc kỹ chỗ này

Spec Playwright dựng cảnh 「tính hỏng ⇒ mọi số về 0 mà màn hình vẫn sống」. Nhánh mà bộ
này seed được là **(B) 福祉医療設定データが存在しません**, và nó **không ném**: app bật hộp
thoại, vá `localFlg` bằng giá trị mặc định (buiPrice.cs:1866-1872) rồi **tính tiếp bình
thường**. Đo được: 日計 và 合計 sau E00100 **y hệt** lúc dữ liệu sạch.

Nhánh trả `buiPriceData2` toàn 0 là **(A) nhánh ngoại lệ** (buiPrice.cs:196-203) — chưa
seed được, xem mục 6.1. Nên đừng đọc `TcE001003` thành 「đã chứng minh màn hình sống với
số 0」; nó chứng minh 「E00100 không chặn màn hình」, đúng bằng đó.

## 6. Chưa làm

**6.1 — Nhánh E00100 (A), tức đúng hộp mà spec web mô phỏng.**
Đường tới được nó: `buiPrice.cs:998` gọi `BeneficiaryNumber.Substring(0, 2)` trong khi
guard chỉ kiểm `PublicExpenseNumber.Length == 8` — **hai field khác nhau** — nên 受給者番号
rỗng là `ArgumentOutOfRangeException`. Nhưng nhánh đó chỉ tới được với bệnh nhân
**70歳以上 医保** (`ins_kbn ∈ {1,2,8,9}` + `old_flg = 4`, hoặc `ins_kbn = 10` + `old_flg = 5`),
mà trong DB demo chỉ mỗi **12138** có 処置 ở tháng test — và nó có 2876 dòng, app mở hơn
một phút (đo 2026-09-07). Làm được, nhưng phải đổi bệnh nhân test hoặc seed thêm `TRNTRN`.

**6.2 — Chuỗi F8 会計.** `modAcc.LetAccData2` gọi `Calc_BuiPriceData2s` ở modAcc.cs:403,
nên E00100 bật lại ở đó; câu hỏi parity là 「E00100 xong có VẪN sang 窓口精算 không」
(`IDM_Acc_Click` → `showForm(ID204002)`, frm203002.cs:7746). Chưa đo vì chuỗi F8 **ghi
`UNPAID`** — cần thêm `parity.allowSave` và một bước khôi phục như
`Tests/UnpaidRaiinCnt/`.

**6.3 — Testcase assert.** Lượt đầu chỉ có PROBE, đúng luật `PROBE-GUIDELINE.md`. Số đo
điền vào mục 7 rồi mới viết assert.

---

## 7. Số đo thật

Máy `ochacom-win`, DB `SIM2000`, bệnh nhân **10** (`ins_kbn = 7` 公費単独, `old_flg = 3`,
`bur_rate = 0`, `acc_rate = 0`, `pubexpinf_no = 0`), 診療日 **2026-08-03**.
Lượt chạy **2026-09-07**: PROBE 2/2 xanh, testcase **5/5 xanh**, DB trả lại nguyên trạng
(kiểm lại: `PUBEXPINF` 0 dòng, `INSURANCE.PUBEXPINF_NO = 0`).

### Khuôn câu

```
MSGTBL['E00100'] = 「{0}」        ⇒ MsgDialog.getMsg thay {0} bằng thân ⇒ KHÔNG có tiền tố
```

### Hộp thoại — khớp oracle tới từng ký tự

```
tiêu đề : 「お茶コン」            ← Application.ProductName (MsgDialog.cs:35)
nút     : [OK]                  ← ĐÚNG một nút, MessageBoxButtons.OK
mặc định: 「OK」                 ← đọc bằng FocusedElement() TRƯỚC khi bấm
thân    : 一部負担金計算に失敗しました。福祉医療設定データが存在しません。
          　患者番号[10] 枝番[1] 診療年月[令和8年8月] 福祉医療フラグ[99999999]
```

Dấu cách đầu dòng 2 là **全角 U+3000**; 診療年月 dùng khuôn `gggy年M月` nên **không đệm 0**
(`令和8年8月`, không phải `令和08年08月`).

### F4 当日来患 (frm203001)

| | sạch | có seed |
|---|---|---|
| số hộp E00100 | 0 | **1** (= số dòng của ngày) |
| số dòng trên lưới | 1 | **1 — GIỮ NGUYÊN** |
| dòng đọc được | — | `10 \| *池田 忠 \| 男性 \| 昭23年09月23日 \| 339 \| 0 \| 678 \| 2040 \| 0 \| 2040` |
| dòng 合計 (`dgvTotal`) | — | `合 計 \| 1人 (初診:1人 再診:0人) \| \| \| 339点 \| 0円 \| 678点 \| 2,040円 \| 0円 \| 2,040円` |

⇒ **xác nhận `frm203001` GIỮ dòng và vẫn cộng vào 合計** (frm203001.cs:921-932), ngược hẳn
`frm204008` 来患一覧 vốn LOẠI dòng (frm204008.cs:711-733). Đây là điểm mà bản web từng dùng
chung một xử lý cho cả hai màn.

### Mở 診療入力 (frm203002)

| | sạch | có seed |
|---|---|---|
| số hộp E00100 | 0 | **1** (bệnh nhân có 1 枝番) |
| màn hình | mở | **VẪN MỞ** — 患者番号 10, 年月 08年08月, lưới 24 dòng |
| 日計 | ngày 3 = 339点 · 14 = 70点 · 25 = 272点 | **y hệt** |
| 合計 | `681 点` / `3 日` | **y hệt** |

Cả ba con số 日計 khớp oracle `Σ (trt_pt × 回数)` trên dòng `jihi_flg = 0` của `TRNTRN`.

`負担金` ra `0円` ở **cả hai** cột — đó là vì bệnh nhân test là 公費単独 `bur_rate = 0`,
KHÔNG phải vì tính hỏng. Nên đừng dùng `負担金` làm mốc phân biệt trên bệnh nhân này.
