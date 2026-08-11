# Luồng ParityAccountingCorrection — xác minh 会計データ修正 (lô 8)

Chạy: **`.\run-parity-accounting.ps1`** — runner riêng, **không** dùng
`run-tests.ps1` cũng **không** dùng `run-parity-savedata.ps1`.

---

## 1. Để làm gì

Bản web `ApplyAccountingCorrectionHandler` port `modAcc.ChgAccData`, **kèm cả bug
ISSUE-1** theo quyết định 2026-08-10 phương án A. Tới giờ kết luận chỉ dựa trên
đọc source. Luồng này chạy WinForm thật để trả lời hai câu:

1. Phép ghi `ACCDAT` có đúng như mô tả không? (4 điểm ở §5b của
   `userapp/winform-parity-verification-guide.md`)
2. Nhánh giữa của `PERSON_EXP` có **thật sự GÁN** (làm mất số dư kia) không?

Câu 2 quan trọng nhất. Nếu WinForm hoá ra cộng dồn đúng thì bản web đang tái tạo
một bug **không tồn tại**, và phải gỡ ra cùng `AccountingBalanceAllocatorTests`.

---

## 2. ⚠️ Luồng này GHI VÀO SỔ TIỀN

Nặng hơn ParitySaveData: cái kia chỉ ghi lại `処置行`, cái này sửa **`ACCDAT`**
(会計 đã chốt) và **`PERSON_EXP`** (預り金残 / 未収金残).

Teardown khôi phục theo ảnh chụp đầu lô — nhưng đó là **đường lui, không phải giấy
phép**. Trỏ `patient.patNo` vào bệnh nhân TEST.

Bật bằng `parity.allowSave = true` (dùng chung cờ với ParitySaveData). Chưa bật thì
cả fixture tự bỏ qua ngay, không tốn công mở app.

---

## 3. Tiền đề — test tự dựng, nhưng có một cái cần khởi động lại app

Nhánh rẽ nằm ở **modAcc.cs:598** và chỉ có đúng hai điều kiện:

```csharp
if (past_billing_amount == 0 || ModCommon.pAccLink == false) {  // nhánh F: tạo 未精算
    ... frm203027 入金指定 ...
} else {                                                        // nhánh G
    ... ChgAccData(...) ...
}
```

| Cần | Test tự lo? |
|---|---|
| Ngày test có dòng `ACCDAT` 医療保険 (`km_cd` 40-49/57/58, `lflg = 0`, `claim_amt > 0`) | **Có** — `EnsureSettledAccounting` seed, teardown xoá |
| `accconfig.tre_acc_link = 1` | **Bật hộ**, nhưng phải **khởi động lại WinForm** |

`tre_acc_link` được nạp vào `ModCommon.pAccLink` **một lần lúc app khởi động**
(modCommon.cs:346), nên sửa DB khi app đang chạy không có tác dụng.
`AccountingPreconditions` bật cờ rồi `Ignore` kèm câu "đóng app, chạy lại" — thay vì
để chuỗi F8 lặng lẽ đi nhầm nhánh.

> Vì sao phải seed chứ không dùng dữ liệu có sẵn: đã tra DB, **toàn bộ SIM2000 không
> có dòng `ACCDAT` nào trong tháng test** (mới nhất 2026-07-31). Bệnh nhân đã 窓口精算
> đều ở tháng 1/2026, mà 診療入力 chỉ sửa được 処置月 hiện hành.

---

## 4. Tệp trong luồng

| Tệp | Vai trò |
|---|---|
| `ChgAccDataTests.cs` | 3 testcase |
| `AccountingPreconditions.cs` | Dựng đủ 2 điều kiện của modAcc.cs:598 |
| `AccountingFlow.cs` | Lái chuỗi hộp thoại F8 → 会計データ修正 |
| `OchaDbAccounting.cs` | Đọc/ghi `ACCDAT` + `PERSON_EXP` + `accconfig`, ảnh chụp & khôi phục |
| `AccountingFlowDiagnosticsTests.cs` | Công cụ chẩn đoán, `[Explicit]` |

`Infrastructure/ModalDialogs.cs` dùng chung với ParitySaveData — nó vốn nằm trong
thư mục luồng kia, đã nâng lên hạ tầng khi luồng thứ hai cần tới.

---

## 5. Ba testcase

| | Kiểm gì |
|---|---|
| `Tc8_0` | (mốc) dựng đủ tiền đề §3; hỏng thì Tc8-1/Tc8-2 **không bấm F8** |
| `Tc8_1` | Chuỗi F8 có dẫn tới 「…計上しますか？」 — và **ghi lại chuỗi thật** |
| `Tc8_2` | 🐛 ISSUE-1: nhánh giữa GÁN ⇒ `dep_due` bị ghi đè, không cộng dồn |

Không testcase nào **đụng vào lưới 処置**. Bản đầu có chèn một 処置 để "tạo chênh
lệch" — thừa: chênh lệch đến từ tiền đề (bệnh nhân test là 公費単独 ⇒
`cur.insPrice = 0` so với 会計 seed ¥1.020). Mà chèn xong thì lưới thành "đã sửa" nên
F8 hỏi 「処置データは変更されています。保存しますか？」: trả **はい** là ghi thẳng vào
`TRNTRN`, trả **いいえ** là `RestoreData` vứt bỏ đúng cái vừa chèn — vô nghĩa ở cả hai
nhánh, mà còn làm 点数 tính ra lệch hẳn.

Cần chênh lệch theo 点数 chứ không chỉ theo tiền thì đổi
`AccountingPreconditions.SeedScore`, đừng gõ vào giao diện.

`Tc8_2` dựng `dep_due = 10.000`, `ins_due_bal = 300`. Tổ hợp này là **bắt buộc**:
nhánh mang bug chỉ chạy khi có **cả hai** số dư và số dư bị trừ **nhỏ hơn** mức
chênh. Sai tổ hợp thì đi nhánh ngoài (vốn cộng dồn đúng) và chẳng chứng minh gì.

---

## 6. Vì sao không viết cứng chuỗi hộp thoại

`LetAccData2` (modAcc.cs:541-784) là một **cây quyết định**: 「既に…会計処理…」,
「請求金額が増えています」, 「差額」… cái nào hiện ra tuỳ dữ liệu bệnh nhân và
`tre_acc_link`. Viết cứng "bấm はい rồi いいえ rồi はい" là đóng đinh vào MỘT tổ hợp
dữ liệu — đổi bệnh nhân test là hỏng, mà lỗi chỉ nói "không thấy nút".

`AccountingFlow` đi **theo luật**: gặp hộp thoại nào thì tra bảng `Rules`, ghi lại
mọi cái đã gặp, dừng khi thấy hộp thoại đích. Chuỗi thật xuất hiện trong nhật ký —
vừa chạy được vừa tự tài liệu hoá.

Luật then chốt: 「既に…会計処理…」 phải trả lời **いいえ** (modAcc.cs:567). Trả lời
はい là tạo 会計 mới và không bao giờ tới được `ChgAccData`.

### Chuỗi thật, đo ngày 2026-08-11

**Đã đi trọn chuỗi, đo 2026-08-11 11:44 — `toi duoc 会計データ修正: True`:**

```
[1] 「処置データチェックでエラーがありました。このまま続けますか?」        OK / Cancel → OK
[2] 「会計処理を行う日が本日でありません。よろしいですか。」               OK / Cancel → OK
[3] 「既に、¥1,020 の会計処理がされていますが、未清算データ(¥0)を…?」   Yes / No   → いいえ
[4] 「処置点数が 0点追加されました。¥1,020預り金に計上しますか?」  ← ĐÍCH (ChgAccData)
```

Hướng ra 預り金 vì bệnh nhân test là **公費単独** ⇒ `cur.insPrice = 0`, còn 会計 seed
là ¥1.020 → `diffPrice = −1.020`. Đúng hướng mà `Tc8_2` cần cho ISSUE-1.

**F8 chạy 処置データチェック TRƯỚC** khi vào cây quyết định của `LetAccData2`. Bệnh nhân
test không có 部位・病名 nên luôn dính cảnh báo 「当月に部位・病名がない可能性があります」.

[1] và [2] là MessageBox **OK/Cancel**, [3] là **Yes/No** — trên Windows tiếng Anh nhãn
ra tiếng Anh, nên mọi luật đều liệt kê cả hai thứ tiếng.

Năm bài học, đều từ vấp thật:

1. **Với 「…続けますか？」 / 「…よろしいですか。」 thì phủ định = BỎ CUỘC**, không phải an
   toàn. Luật mặc định "trả lời phủ định" bấm Cancel và huỷ cả chuỗi F8.
2. **Luật phải HẸP.** Bản đầu khớp trên 「会計処理」 và bắt nhầm hộp thoại [2] (cảnh báo
   NGÀY). Luật cho 既存会計 giờ đòi cả 「既に」.
3. **`patient.trtDate` phải trỏ đúng ngày CÓ 処置.** Để trống (= hôm nay) thì màn hình
   mở vào ngày trống, 窓口精算 ra toàn số 0 và chuỗi kết thúc sớm vì không có gì để tính.
4. **Không phải cửa sổ nào chặn đường cũng cần thêm luật.** Bước [3] trông y hệt một
   hộp thoại lạ, và phản xạ đầu tiên là viết luật bấm 「F1 指定なし」 cho nó đi tiếp.
   Sai — `入金指定` chỉ được mở ở modAcc.cs:602, tức **bên trong nhánh
   「会計データが存在しない」**. Thấy nó nghĩa là `ChgAccData` đã bị bỏ qua từ
   modAcc.cs:598, trước cả hộp thoại đầu tiên; bấm thêm nút không kéo về được.
   Việc phải làm là dựng tiền đề §3 **trước khi** bấm F8.
   `AccountingFlow.BranchFMarker` giờ nhận ra nó, lui bằng 「F10 戻る」 và trả về
   `Walk.Diagnosis` nói thẳng điều đó.

   > Quy tắc rút ra: gặp cửa sổ lạ thì **tra xem nó nằm ở nhánh nào của source**
   > trước, rồi mới quyết định thêm luật hay sửa tiền đề.

5. **Thứ tự trong `Rules` là một phần của luật: cụ thể trước, chung chung sau.**
   Khớp là first-wins, mà câu chữ của WinForm chồng lấn rất nhiều. Hộp thoại [3]
   chứa **cả** 「既に」 lẫn 「よろしいですか」; luật chung 「よろしいですか」 đứng trước
   nên trúng trước và trả lời **はい** — mà はい chính là 「tạo 未精算データ mới」
   (modAcc.cs:566 đặt `past_billing_amount = 0`), tức tự tay rẽ sang nhánh F.
   Chuỗi đi đúng tới cửa ngõ nhánh G rồi bị luật của chính mình đẩy ra.

   Luật 「よろしいですか」 giờ nằm **cuối cùng** và có ghi chú: thêm luật mới thì đặt
   TRÊN nó.

6. **Đúng kết quả vì lý do sai vẫn là lỗi.** Lượt 11:54 gặp thêm
   「処置データは変更されています。保存しますか？」. Nó bị luật `"されています"` (viết cho
   hộp thoại 既存会計) bắt, và trả lời いいえ — **tình cờ đúng** với ý đồ của lô test
   (không làm lệch `TRNTRN`), nhưng vì lý do hoàn toàn khác. Lý do sai thì lần sau
   ai sửa luật kia là hỏng luôn cái này.

   Giờ nó có luật riêng, đặt trên, ghi rõ はい = `SaveData` / いいえ = `RestoreData`;
   còn luật cũ thu hẹp thành `"会計処理がされています"`.

7. **Đường lui cũng là một chuỗi hộp thoại.** Sau Tc8-1, app nằm ở 窓口精算 và
   Tc8-2 phải bấm 「F10 戻る」 để quay lại. Nhưng `btnF10_Click` còn hỏi tiếp
   「登録せずに…」 (`Q00004`, frm204002.cs:1349). Bản đầu bấm 戻る xong đi thẳng sang
   mở lại 診療入力 — trong khi hộp thoại xác nhận đang **chặn luồng UI**, nên mọi
   phép duyệt cửa sổ sau đó đi vào chỗ mù và app **đứng yên** ở màn 窓口精算.

   `LeaveCounterPayment` giờ: đưa cửa sổ lên tiền cảnh → click **chuột thật** (nút
   `GradientButton` tự vẽ, không ăn `InvokePattern`) → trả lời hộp thoại qua
   `ModalDialogs` → **chờ 窓口精算 đóng thật** rồi mới trả về. Chờ ở đây để lỗi nói
   đúng chỗ, thay vì để bước sau báo 「không thấy メインメニュー」.

8. **Đừng hỏi một lần về một trạng thái đang chuyển tiếp.** Testcase kết thúc ngay
   sau khi trả lời hộp thoại cuối, nhưng WinForm còn đang đóng 診療入力 và dựng
   窓口精算 — mất vài giây. `EnsureTreatmentScreen` hỏi `app.Window("frm204002")` đúng
   **0,9 giây** sau đó: chưa có gì cả, nên nó kết luận "không ở 窓口精算" rồi đi mở lại
   診療入力 — trong lúc 窓口精算 hiện lên và chặn đường.

   Giờ nó **chờ** app thật sự ở một trong hai màn đã biết rồi mới quyết.

### Nhật ký phải hiện NGAY

NUnit giữ `TestContext.Out` tới khi testcase kết thúc, nên nhật ký từng bước — thứ
viết ra để biết hỏng ở đâu — chỉ xuất hiện khi mọi chuyện đã xong. Treo là **đúng lúc
cần nó nhất**: ba lượt liền chỉ thấy Tc8-1 xanh rồi console im lặng, phải đoán mò.

`TestTrace.Write` ghi ra ba chỗ: `TestContext.Out` (báo cáo NUnit),
`TestContext.Progress` (hiện ngay trên console), và `_trace.log` (ghi ngay từng dòng,
nên treo cứng vẫn còn log đọc được). Đổi xong thì lượt sau chỉ ra ngay dòng cuối cùng
là `mo lai man 診療入力` — đủ để biết chính xác chỗ hỏng.

### F8 để lại ba thứ, và còn đóng cả màn hình

`ExitWithoutSaving(DialogResult.Yes, …)` chạy **trước** `LetAccData2`
(frm203002.cs:7716), và khi `LetAccData2` trả true thì handler **đóng 診療入力** rồi mở
窓口精算 (frm203002.cs:7741-7742).

| Thứ | Xử lý |
|---|---|
| `ACCDAT` + `PERSON_EXP` | Khôi phục theo ảnh chụp đầu lô |
| `UNPAID` | Teardown xoá phần vượt ảnh chụp (xem dưới) |
| `TRNTRN` | **Chỉ báo lệch, không xoá** — 処置 thêm vào bị F8 lưu thật |
| Màn 診療入力 bị đóng | Mỗi testcase gọi `EnsureTreatmentScreen` ở **đầu** |

`TRNTRN` không tự xoá vì luồng ParitySaveData đã học bài đó bằng cách mất dữ liệu:
F9 xoá rồi chèn lại cả tháng với `seq` **mới**, nên "xoá dòng thêm vào" theo ảnh chụp
hoá ra xoá sạch cả 8 dòng gốc.

`EnsureTreatmentScreen` đặt ở đầu testcase chứ không ở cuối testcase trước — testcase
trước có thể đã ném lỗi giữa chừng, dọn ở đầu thì trạng thái nào cũng về được.

### Rác nhánh F: bảng `UNPAID`

Mỗi lượt F8 đi nhầm sang nhánh F đều ghi một dòng 未精算データ vào **`UNPAID`** —
bảng này **không** nằm trong ảnh chụp `ACCDAT` nên trước đây không ai dọn, và chúng
hiện lên 未精算患者一覧 của 窓口精算 như bệnh nhân thật đang chờ thu tiền.

Giờ tiền đề chụp `UNPAID` trước lô, teardown xoá đúng phần **vượt ra ngoài** ảnh chụp
(không xoá sạch theo ngày — bệnh nhân test vẫn có thể có 未精算 hợp lệ từ trước).

Rác của các lượt chạy **trước** bản vá này thì phải xoá tay:

```sql
SELECT * FROM UNPAID WHERE pat_no = 10 AND trt_dt = '2026-08-03';
DELETE FROM UNPAID WHERE pat_no = 10 AND trt_dt = '2026-08-03';
```

Chuỗi trên máy bạn khác giả định thì chạy:

```powershell
.\run-parity-accounting.ps1 -Diagnostics
```

Nó dựng **cùng tiền đề** với testcase (nên cần `parity.allowSave`, và tự xoá dòng đã
seed khi xong), đổ toàn bộ chuỗi ra file, **không** trả lời hộp thoại đích.

> Bản đầu của công cụ này không dựng gì cả — nghe thì "trung lập" nhưng hoá ra là
> hỏng: nó khảo sát nhánh F trong khi testcase chạy nhánh G, nên mọi luật rút ra từ
> nó đều lệch địa chỉ.

---

## 7. Sau khi chạy, gửi lại HAI thứ

1. `C:\OCHACOM_Logs\investigation.log` — lọc `SONTEST1`, quan tâm `[LO8]` và `[ISSUE-1]`
2. `bin\Debug\net8.0-windows\artifacts\` — nhật ký từng bước + ảnh

Log `[LO8] UPDATE ACCDAT: <SQL>` in **nguyên văn câu lệnh** WinForm chạy — so trực
tiếp được với handler, không phải suy luận.
