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

> ⚠️ **Cả hai màn đều KHÔNG có nhánh xử lý lỗi nào** — đừng đọc thành 「frm203001 giữ dòng,
> frm204008 loại dòng」.
>
> `frm204008` có sẵn một guard 実績あり từ trước, không liên quan gì tới failure:
>
> ```csharp
> // frm204008.cs:731-733
> if (buiPriceData.insScore != 0 || buiPriceData.careScore != 0 || buiPriceData.jihiPrice != 0) {
>     //行追加
> ```
>
> Dòng hỏng **toàn 0** rơi ra ngoài guard đó nên trông như bị 「loại」; dòng hỏng **một phần**
> (保険 xong, 自費 ném) thì **vẫn ở lại**. `frm203001` thì không có guard nào.
>
> Khác nhau là do **guard sẵn có khác nhau**, không phải do xử lý lỗi khác nhau — nên
> **đừng 「đồng bộ」 hai màn**. (Đính chính 2026-09-07; bản trước của README này viết như
> thể đó là một chính sách, đúng loại câu dẫn người sau đi sửa nhầm.)

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

Nên seed nhánh **(B)** đi theo đường cuối: gán `LFLG` một mã **không có trong `LOCALFLG`**.

### Nhánh (A) — đường tới nó là một lỗi thật của WinForm

`buiPrice.cs:997-998`:

```csharp
if (pubexpInfs.Count > 0 &&
    pubexpInfs[0].PublicExpenseNumber.Length == 8 &&      // ← kiểm field NÀY
    pubexpInfs[0].BeneficiaryNumber.Substring(0, 2) == "12") {   // ← dùng field KHÁC
```

Guard kiểm độ dài của 負担者番号 rồi cắt chuỗi trên 受給者番号 — hai field khác nhau. 受給者番号
rỗng ⇒ `ArgumentOutOfRangeException`. Stack trace đọc được lúc chạy chốt đúng dòng đó:

```
内容[Index and length must refer to a location within the string.  Parameter name: length]
場所[  at System.String.Substring(Int32 startIndex, Int32 length)
       at COMMON.Lib.buiPrice.getLimitApplicationCertificateRelatedInfo(…) in …\buiPrice.cs:line 999
       at COMMON.Lib.buiPrice.getInsInfo2(…) in …\buiPrice.cs:line 337
       at COMMON.Lib.buiPrice.getBuiPrice2(…) in …\buiPrice.cs:line 181]
```

Nhánh đó chỉ tới được với bệnh nhân **70歳以上 医保** (`ins_kbn ∈ {1,2,8,9}` + `old_flg = 4`,
hoặc `ins_kbn = 10` + `old_flg = 5`) nên seed đổi thêm `INS_KBN` → 2 và `OLD_FLG` → 4. Hai
cột đó nằm trong ảnh chụp và `Restore` đặt lại — **quên chúng thì bệnh nhân test ở lại dạng
国保 前期高齢者 vĩnh viễn** và mọi luồng khác sau đó đo trên một bệnh nhân khác hẳn.

Ném xảy ra ở buiPrice.cs:334, **TRƯỚC** `_rtnData.insPayDatas = payDatas` (:649) ⇒
`buiPriceData2` giữ nguyên giá trị khởi tạo **toàn 0**. Đó mới là cảnh 「màn hình sống với
số 0」 mà TC-E00100-1 bên web dựng — nhánh (B) **không** làm được điều đó.

### `SeedMode.InsKbnControl` — seed ĐỐI CHỨNG

Đổi ĐÚNG hai cột 保険 mà (A) buộc phải đổi, **không** chèn 公費 ⇒ `pubexpInfs` rỗng ⇒ guard
`pubexpInfs.Count > 0` chặn ngay ⇒ **không có E00100 nào**. Nó tồn tại để trả lời một câu
hỏi mà thiếu nó thì kết luận về F8 (mục 5c) chỉ là phỏng đoán.

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

## 4. Sáu cái bẫy của chính bộ test

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

**4.5 — So nguyên văn thì dùng `Found.Raw`, KHÔNG dùng `Txt.N`.**
`Txt.N` chạy NFKC (biến 全角スペース U+3000 thành space thường) và đổi xuống dòng thành
space; `MsgBoxWin32.StaticTextOf` cũng làm phẳng cho `Found.Text`. So bằng chúng thì
testcase chỉ chứng minh 「các chữ đúng thứ tự」 — đúng hai chi tiết mà bộ này khoe là đã chốt
thì bị xoá trước khi so. Bản đầu XANH mà không chứng minh được điều nó nói.

**4.6 — Chuỗi F8: chờ hộp thoại ĐÓNG rồi mới tìm hộp kế.**
`MsgBoxWin32.ClickButton` dùng `PostMessage` — trả về NGAY. Vòng sau tóm lại đúng hộp vừa
bấm rồi bấm lần hai khi cửa sổ đang đóng dở. Log đọc rất giống lỗi app: hộp
「本日でありません」 hiện HAI lần liền, lần sau báo 「không có nút nào trong [OK, はい, Yes]」
trong khi nút đọc được lại là `[OK, Cancel]` — mâu thuẫn, vì `OK` có trong cả hai.

**4.4 — Vét hàng đợi thì chờ 「khác hộp vừa đóng」, đừng chờ 「hết hộp」.**
WinForm hiện 「1 件 1 ダイアログ」 nối tiếp, hộp kế tiếp mở gần như ngay khi hộp này đóng —
`đếm == 0` không bao giờ đúng ở giữa. Đúng cái bẫy mà `drainE00100` của spec Playwright
đã ghi lại. Và phải vét **CẠN** kể cả khi testcase chỉ cần một hộp: bỏ sót một hộp thì nó
chắn mọi thao tác sau, và log sẽ đổ oan cho app (PROBE-GUIDELINE 3.4).

---

## 5. Bảng tương ứng với spec Playwright

| Playwright | Ở đây | Ghi chú |
|---|---|---|
| TC-CLEAN-1 `monthly-copayments` có `warnings` và rỗng | `CleanTests.TcClean1` | Bên này không có field nào để soi ⇒ mốc là 「không MessageBox nào」 **cộng** 「日計 khớp `TRNTRN`」 |
| TC-CLEAN-2 F4 `summary.warnings` rỗng | `CleanTests.TcClean2` | |
| TC-E00100-1 日計 hỏng: văn bản đúng, màn hình sống | `ExceptionTests.TcE001001` | Nhánh (A) — 日計 **về 0 thật** |
| TC-E00100-2 2 warnings = 2 hộp nối tiếp | `SeedTests.TcE001001` | WinForm chia theo **dòng bệnh nhân** (F4) / **枝番** (診療入力), không theo 「warning」 |
| TC-E00100-3 `reason` null ⇒ bỏ dòng `内容[]` | — | Không áp dụng: WinForm **luôn** in `内容[]` + `場所[]`; `ExceptionTests.TcE001004` khoá đúng điều đó |
| TC-E00100-4 当日来患 giữ dòng | `SeedTests.TcE001002` (nhánh B) · `ExceptionTests.TcE001004` (nhánh A, 保険点数 = 0) | Giữ được là vì frm203001 **không có guard nào**, không phải vì nó chọn giữ — xem mục 1 |
| TC-E00100-5 F8 vẫn sang 窓口精算 | `ExceptionTests.TcE001005` | **NGƯỢC LẠI** — xem mục 5c |

### 5b. Nhánh (B) KHÔNG phải nhánh trả 0

`SeedTests` chạy nhánh **(B) 福祉医療設定データが存在しません**, và nó **không ném**: app bật
hộp thoại, vá `localFlg` mặc định (buiPrice.cs:1866-1872) rồi **tính tiếp bình thường**.
Đo được: 日計 và 合計 sau E00100 **y hệt** lúc dữ liệu sạch. Nên đừng đọc
`SeedTests.TcE001003` thành 「đã chứng minh màn hình sống với số 0」 — vế đó là của
`ExceptionTests`.

### 5c. ⚠️ ĐIỂM LỆCH LỚN NHẤT: F8 会計 **KHÔNG** sang 窓口精算

`LetAccData2` bọc cả thân trong một `try/catch`, và nhánh catch chỉ hiện **E99999
「システムエラーです。」** (modAcc.cs:789-791). Ngoại lệ xảy ra TRƯỚC `functionReturnValue = true`
(:783) nên hàm trả **false**, và `IDM_Acc_Click` có `if (AccRet == false) { }` — **khối
RỖNG** (frm203002.cs:7727-7729). Màn hình đứng im.

Ba lượt chạy tách bạch, 2026-09-07:

| | E00100 | 日計 | F8 hộp [3] | F8 hộp [4] | 窓口精算 |
|---|---|---|---|---|---|
| dữ liệu sạch | 0 | 339/70/272 | 既に…作成 | …計上しますか | ✓ |
| **ĐỐI CHỨNG** `ins_kbn` 2 / `old_flg` 4 | 0 | 339/70/272 | 既に…作成 | …計上しますか | ✓ |
| nhánh NGOẠI LỆ (A) | 1 | **0/0/0** | **E00100** | **システムエラーです** | **✗** |

Lượt ĐỐI CHỨNG đổi **đúng hai cột 保険** mà seed (A) buộc phải đổi nhưng không chèn 公費 —
nó loại trừ giả thuyết 「system error là do `INS_KBN`」. Chênh lệch quy hết về E00100.

**Bản web đang làm ngược:** `announceBuiPriceWarnings(...)` rồi `return true` ⇒ VẪN sang
窓口精算. Chú thích TC-E00100-5 của `bui-price-e00100-parity.spec.ts` viết
*「E00100 xong mà không sang 窓口精算 — đang chặn chuỗi F8, WinForm thì đi tiếp」* — **đo thật
thì WinForm KHÔNG đi tiếp**.

> Chưa xác định được ngoại lệ THỨ HAI (cái rơi vào catch-all) ném ở dòng nào: `MsgDialog`
> thay hẳn `ex.Message` bằng hằng số khi id là `E99999` (MsgDialog.cs:27-30), nên hộp thoại
> không nói gì thêm. Nó nằm giữa `Calc_BuiPriceData2s` (modAcc.cs:403) và cổng
> 「既に…作成」 (:558).
>
> **Câu hỏi để ngỏ, đáng đo tiếp:** `UnPaid.deleteTrtDtUnPaid` nằm ở modAcc.cs:427, tức
> TRƯỚC chỗ ném. Nếu ngoại lệ rơi sau dòng đó thì dòng 未精算 của ngày **bị xoá mà không
> được tạo lại** — mất dữ liệu. Bệnh nhân test có 0 dòng `UNPAID` nên lượt chạy vừa rồi
> không phân biệt được (0 → 0). Cần một ngày CÓ 未精算 để đo.

## 6. Chưa làm

**6.1 — Ngoại lệ thứ hai trong `LetAccData2` ném ở đâu**, và nó có làm mất dòng `未精算`
không. Xem khung cảnh báo ở mục 5c.

**6.2 — Đo trên bệnh nhân 医保 THẬT.** Cả hai seed đều mượn bệnh nhân 公費単独 rồi đổi
`INS_KBN`. Bệnh nhân 医保 70歳以上 có sẵn 処置 ở tháng test trong DB demo chỉ có **12138**
(2876 dòng, app mở hơn một phút) — chạy được nhưng chậm, và phải canh trần 15 phút của
runner.

**6.3 — 来患一覧 (frm204008).** Chưa đo. Điều đáng đo KHÔNG phải 「nó loại dòng」 (nó không
có nhánh lỗi nào — xem mục 1) mà là **dòng hỏng MỘT PHẦN**: 保険 tính xong, 自費 ném ⇒
`insScore != 0` ⇒ dòng **vẫn ở lại** guard 実績あり. Seed hiện tại làm hỏng toàn bộ nên không
dựng được ca đó. Luồng `Tests/PatientVisitList/` đã có sẵn màn hình.

## 7. Số đo thật

Máy `ochacom-win`, DB `SIM2000`, bệnh nhân **10** (`ins_kbn = 7` 公費単独, `old_flg = 3`,
`bur_rate = 0`, `acc_rate = 0`, `pubexpinf_no = 0`), 診療日 **2026-08-03**, lượt chạy
**2026-09-07**. Testcase **8/8 xanh** (2 CLEAN + 3 nhánh B + 3 nhánh A), DB trả lại nguyên
trạng sau mỗi lượt (kiểm lại: `PUBEXPINF` 0 dòng, `INSURANCE` = `ins_kbn 7 / old_flg 3 /
pubexpinf_no 0`, `UNPAID` 0 dòng).

### Khuôn câu

```
MSGTBL['E00100'] = 「{0}」        ⇒ MsgDialog.getMsg thay {0} bằng thân ⇒ KHÔNG có tiền tố
tiêu đề : 「お茶コン」            ← Application.ProductName (MsgDialog.cs:35)
nút     : [OK], và OK là nút MẶC ĐỊNH
```

### Nhánh (B) 福祉医療設定データが存在しません

```
一部負担金計算に失敗しました。福祉医療設定データが存在しません。
　患者番号[10] 枝番[1] 診療年月[令和8年8月] 福祉医療フラグ[99999999]
```

Khớp oracle **tới từng ký tự** (so bằng `Found.Raw`, không phải `Txt.N` — xem mục 4.5).
Dấu cách đầu dòng 2 là 全角 U+3000; 診療年月 dùng `gggy年M月` nên **không đệm 0**
(`令和8年8月`, không phải `令和08年08月`).

| | sạch | nhánh (B) |
|---|---|---|
| E00100 khi F4 当日来患 | 0 | **1** |
| E00100 khi mở 診療入力 | 0 | **1** (bệnh nhân có 1 枝番) |
| lưới 当日来患 | 1 dòng | **1 dòng — GIỮ NGUYÊN**, 保険点数 339 |
| 合計 (`dgvTotal`) | — | `合 計 \| 1人 (初診:1人 再診:0人) \| \| \| 339点 \| 0円 \| 678点 \| 2,040円 \| 0円 \| 2,040円` |
| 日計 | 3=339点 · 14=70点 · 25=272点 | **y hệt** |
| 合計 / 実日数 | `681 点` / `3 日` | **y hệt** |

### Nhánh (A) 患者登録データを確認してください

```
一部負担金計算に失敗しました。患者登録データを確認してください。
　患者番号[10] 枝番[1] 診療年月[令和8年8月]

内容[Index and length must refer to a location within the string.  Parameter name: length]
場所[  at System.String.Substring(…)
       at COMMON.Lib.buiPrice.getLimitApplicationCertificateRelatedInfo(…) buiPrice.cs:line 999
       at COMMON.Lib.buiPrice.getInsInfo2(…) buiPrice.cs:line 337
       at COMMON.Lib.buiPrice.getBuiPrice2(…) buiPrice.cs:line 181]
```

| | sạch | ĐỐI CHỨNG | nhánh (A) |
|---|---|---|---|
| E00100 khi F4 / mở màn | 0 / 0 | 0 / 0 | **1 / 1** |
| lưới 当日来患 | 1 dòng, 保険点数 339 | 1 dòng, 339 | **1 dòng — GIỮ, 保険点数 0** |
| 合計 (`dgvTotal`) 保険点数 | 339点 | 339点 | **0点** |
| 日計 | 339/70/272 | 339/70/272 | **0/0/0** |
| 合計 / 実日数 | `681 点` / `3 日` | `681 点` / `3 日` | **`点` (rỗng) / `0 日`** |
| chuỗi F8 → 窓口精算 | ✓ | ✓ | **✗ (システムエラーです)** |

`負担金` ra `0円` ở **mọi** cột — đó là vì bệnh nhân test là 公費単独 `bur_rate = 0`, KHÔNG
phải vì tính hỏng. Đừng dùng `負担金` làm mốc phân biệt trên bệnh nhân này; mốc thật là
**保険点数 / 日計**.
