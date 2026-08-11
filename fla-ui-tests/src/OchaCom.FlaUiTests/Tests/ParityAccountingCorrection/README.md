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

## 3. Tiền đề test KHÔNG tự dựng được

| Cần | Vì sao |
|---|---|
| Ngày test đã 窓口精算 xong (có dòng `ACCDAT`) | Nhánh G chỉ tồn tại khi có 会計 để mà sửa |
| `会計設定.tre_acc_link = 1` | Không bật thì `LetAccData2` không rẽ sang nhánh G |

Test **kiểm** tiền đề và `Ignore` kèm lý do rõ ràng nếu thiếu — thay vì đỏ một cách
khó hiểu. Chạy 窓口精算 bằng tay một lần cho ngày test là đủ.

---

## 4. Tệp trong luồng

| Tệp | Vai trò |
|---|---|
| `ChgAccDataTests.cs` | 3 testcase |
| `AccountingFlow.cs` | Lái chuỗi hộp thoại F8 → 会計データ修正 |
| `OchaDbAccounting.cs` | Đọc/ghi `ACCDAT` + `PERSON_EXP`, ảnh chụp & khôi phục |
| `AccountingFlowDiagnosticsTests.cs` | Công cụ chẩn đoán, `[Explicit]` |

`Infrastructure/ModalDialogs.cs` dùng chung với ParitySaveData — nó vốn nằm trong
thư mục luồng kia, đã nâng lên hạ tầng khi luồng thứ hai cần tới.

---

## 5. Ba testcase

| | Kiểm gì |
|---|---|
| `Tc8_0` | (mốc) ngày test có `会計` đã chốt, và có dòng 医療保険 để sửa |
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

Chuỗi trên máy bạn khác giả định thì chạy:

```powershell
.\run-parity-accounting.ps1 -Diagnostics
```

Nó đổ toàn bộ chuỗi ra file mà **không** trả lời hộp thoại đích, **không** ghi DB.

---

## 7. Sau khi chạy, gửi lại HAI thứ

1. `C:\OCHACOM_Logs\investigation.log` — lọc `SONTEST1`, quan tâm `[LO8]` và `[ISSUE-1]`
2. `bin\Debug\net8.0-windows\artifacts\` — nhật ký từng bước + ảnh

Log `[LO8] UPDATE ACCDAT: <SQL>` in **nguyên văn câu lệnh** WinForm chạy — so trực
tiếp được với handler, không phải suy luận.
