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

```
[1] 「処置データチェックでエラーがありました。このまま続けますか?」   OK / Cancel
[2] 「会計処理を行う日が本日でありません。よろしいですか。」          OK / Cancel
[3] cửa sổ 入金指定 (frm203027)     ← KHÔNG phải hộp thoại. Xem bài học 4.
```

**F8 chạy 処置データチェック TRƯỚC** khi vào cây quyết định của `LetAccData2`. Bệnh nhân
test không có 部位・病名 nên luôn dính cảnh báo 「当月に部位・病名がない可能性があります」.

[1] và [2] đều là MessageBox **OK/Cancel**, không phải はい/いいえ.

Bốn bài học, đều từ vấp thật:

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
