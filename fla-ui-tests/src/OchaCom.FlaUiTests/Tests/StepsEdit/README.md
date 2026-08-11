# Luồng StepsEdit — xác minh frm203050 「Ｓｔｅｐ編集」

Chạy: **`.\run-steps-edit.ps1`** — runner riêng, **không** đi qua
`run-tests.ps1` / `run-parity-savedata.ps1` / `run-parity-accounting.ps1`.

---

## 1. Để làm gì

`INP/Forms/frm203050.cs` — dialog nhập STEP (giá trị 0..30000 cho 32 vị trí,
mỗi loại có một panel riêng chuyển qua `cboKind` 1..15). Được mở từ menu của
frm203002 (`IDM_Step_Click` ở `frm203002.cs:8011-8015`):

```csharp
// frm203002.cs:8011
public void IDM_Step_Click(System.Object eventSender, System.EventArgs eventArgs)
{
    formControl.showDialog(formControl.formId.ID203050);  // → frm203050 (Ｓｔｅｐ編集)
}
```

Tới giờ chưa có test nào chạm vào mục menu này, và mục 「Step」 là menu
item VB6 ([24]) — locator hoàn toàn khác nút `btnF*` mà các luồng khác đã
quen. Luồng này:

1. **Mở** dialog frm203050 từ menu của 診療入力.
2. **Đọc** cấu trúc: tiêu đề "Ｓｔｅｐ編集", `cboKind` có nhiều mục,
   `txtEpp1..txtEpp32` đều tồn tại.
3. **Đóng** bằng F10 戻る — KHÔNG ghi.

Không có bug parity nào ở đây; đây chỉ là bước dọn đường: nếu locator mục
「Step」 đổi thì bất kỳ luồng parity nào sau này đụng dialog này (ví dụ
kiểm `TrtState` round-trip) sẽ có chỗ dựa.

---

## 2. KHÔNG ghi DB

Phạm vi hiện tại chỉ là "mở + đọc + đóng". Không bấm F9 確定, không có
`parity.allowSave`, không có khôi phục. Nếu sau này thêm testcase có bấm
F9 thì đặt cờ riêng (`stepsEdit.allowSave`) giống cách ParitySaveData đặt
`parity.allowSave`.

---

## 3. Tiền đề

| Cần | Test tự lo? |
|---|---|
| App đang ở 診療入力 | Có — `UiTestBase` mở sẵn ở `OneTimeSetUp` |
| DB bật + cod_mst có dòng kind=70 (mục của `cboKind`) | Một phần — nếu `db.enabled = false` thì `cboKind` rỗng, test Ignore kèm lý do |
| Bệnh nhân test có row `TrtState` | Không tự dựng — bệnh nhân thường có sẵn; nếu không, dialog vẫn mở nhưng `txtEpp*` đều trống (Test vẫn pass với tiêu chí "có control", không kiểm giá trị) |

DB không bắt buộc cho testcase "mở + đọc cấu trúc". Nếu sau này có test
kiểm giá trị thì mới bắt buộc.

---

## 4. Tệp trong luồng

| Tệp | Vai trò |
|---|---|
| `StepsEditTests.cs` | Testcase |
| `StepsEditFlow.cs` | Mở menu Step + click mục 「Step」 + đọc dialog |
| `StepsEditDiagnosticsTests.cs` | `[Explicit]` đổ cây UIA menu + dialog |

---

## 5. Testcase

| | Kiểm gì |
|---|---|
| `Tc1_OpenDialog` | Mở dialog từ menu Step; cửa sổ mới có title chứa 「Ｓｔｅｐ編集」; `cboKind` có ≥ 2 mục; `txtEpp1..txtEpp32` đều tồn tại; đóng bằng F10 戻る, xác nhận dialog đã đóng |

Bài học rút ra từ hai luồng parity (viết lại trong README của ParityAccountingCorrection
mục §5), khi áp dụng ở đây:

- **Click nút menu, không gửi phím tắt.** Mục menu của WinForm có thể nhận
  phím ALT mở menu rồi chữ cái đầu nhưng cầu MSAA→UIA đôi khi nuốt phím
  ALT. Click chuột vào `MenuItem` thì chắc chắn hơn.
- **Đợi dialog sẵn sàng, đừng hỏi một lần.** `frm203050` chạy `Shown` rồi
  `initProc()` mới nạp `cboKind`. Polling 1 lần thấy cửa sổ hiện ≠ dialog
  đã sẵn sàng.
- **Đóng bằng nút, không dùng X.** `BaseDialog` kế thừa `BaseForm` có thể
  bật `CS_NOCLOSE` (xem ghi chú ở `AccountingFlow.LeaveCounterPayment`).
  Test bấm `btnF10` qua `Uia.MouseClick`.
