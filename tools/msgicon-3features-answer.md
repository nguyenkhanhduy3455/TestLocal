# 87 chỗ — tra xong toàn bộ

Tra bằng legacy + MSGTBL + `winform-dialog-catalog.tsv`. Không chạy FlaUI.

| | Số chỗ | |
|---|---|---|
| Đang đúng, **giữ nguyên** | 53 | |
| **Sai icon — phải sửa** | 2 | `窓#4` ⓘ xanh · `患#17` ⚠ vàng |
| **Sai bộ nút — phải sửa** | 10 | legacy `OK/Cancel`, web đang `はい/いいえ` |
| Web tự thêm, WinForm không có | 22 | |

---

## ⚠ Hai chỗ sai icon

### `窓#4` — báo THÀNH CÔNG mà vẽ ✕ đỏ

```ts
counter-payment-page.tsx:261   await alertDialog('削除が完了しました')   // sau khi xoá THÀNH CÔNG
```

Legacy: 「…完了しました」 xuất hiện **62 lần, 61 lần là ⓘ xanh**. Ngoại lệ duy nhất là
`frm201012.CallbackTransferImage:639` 「スキャナ取込が完了しました。（画像なし）」 ⚠ vàng —
xong nhưng không có ảnh, nên cảnh báo là hợp lý.

Quét cả 3 feature thì đây là **chỗ duy nhất** báo thành công mà đổ về đỏ. Cùng lớp lỗi
với `long-term-care-insurance-screen.tsx:1272` mà anh đã sửa.

### `患#17` — cùng một ô nhập, hai dòng liền nhau lại khác icon

```ts
patient-no-input.tsx:150   await alertDialog('番号を正しく入力してください')            // ✕ đỏ
patient-no-input.tsx:161   await alertDialog(ja.E00005('患者情報'), {severity:'warning'}) // ⚠ vàng — đã sửa
```

Màn `frm203001` dùng `ShowWarningMsg` ở **6/8** chỗ (`defData:638/672/707/723`,
`Let_Data_frmPatId:1006`). Dòng `:150` nên theo ⚠ vàng cho đồng bộ.

## ⚠ 10 chỗ sai bộ nút

Legacy `ShowOKCancelMsg` ⇒ **OK / キャンセル**. Web gọi `confirmDialog(...)` trơ, mà mặc
định của nó là **はい / いいえ** (`confirm-dialog-view.tsx:13`). Đổi sang
`confirmDialog.okCancel(...)` là khớp.

| # | Web | Legacy |
|---|---|---|
| 患#30 | `long-term-care-insurance-screen.tsx:1027` | `frm201031.btnF8_Click:202` — web đang Yes/No |
| 患#33 | `patient-detail-form.tsx:1149` | `frm201001.btnF8_Click:623` — web đang Yes/No |
| 窓#19 | `counter-payment-detail.tsx:1454` | `frm204002.btnF10_Click:1349` |
| 窓#20 | `counter-payment-detail.tsx:1463` | `frm204002.btnF12_Click:1401` |
| 窓#22 | `counter-payment-page.tsx:252` | `frm204001.delUnPaid:547` |
| 窓#23 | `use-reservation-delete.ts:41` | `frm204007.btnF8_Click:137` — comment bên web đã ghi `ShowOKCancelMsg("Q00007")` |
| カ#24 | `chart-form1-page.tsx:581` | `frm205002.printProc:598` / `frm205006.printProc:343` |
| カ#25 | `chart-form1-page.tsx:854` | `frm205002.btnF12_Click:400` |
| カ#28 | `chart-form2-page.tsx:740` | `frm205003.btnF12_Click:431` |
| カ#29 | `chart-print-patient-select-page.tsx:243` | `frm205001.delCctWait:406` |

`窓#23` đáng chú ý: comment ngay trên nó đã ghi `mirrors MsgDialog.ShowOKCancelMsg("Q00007")`
— biết đúng mà gọi nhầm hàm.

---

## Bảng đầy đủ 87 chỗ

### 患者登録 — 35 chỗ

| # | Chuỗi | Icon | Nút | Kết luận | Căn cứ |
|---|---|---|---|---|---|
| 1 | 会計情報の更新に失敗しました。 | ✕ đỏ | OK | giữ | họ `…に失敗しました` — 116/116 ✕ đỏ |
| 2 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | lỗi runtime, cùng họ `失敗` |
| 3 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | lỗi runtime, cùng họ `失敗` |
| 4 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | mọi `chkInputData*` của frm201001/201023/201031 đều `ShowErrorMsg` |
| 5 | 最後のタブは削除できません。 | — | — | web tự thêm | legacy không có thông báo nào về tab 枝番 |
| 6 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | `frm201031.chkInputDataMain:849` |
| 7 | 患者情報の取得に失敗しました。 | ✕ đỏ | OK | giữ | họ `…に失敗しました` — 116/116 ✕ đỏ |
| 8 | 元号情報を読み込み中です。少々お待ちください。 | — | — | web tự thêm | trạng thái tải bất đồng bộ |
| 9 | 患者情報がありません。 | ✕ đỏ | OK | giữ | `E00100` trong frm201001 luôn `ShowErrorMsg` |
| 10 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | mọi `chkInputData*` của frm201001/201023/201031 đều `ShowErrorMsg` |
| 11 | 入力内容に誤りがあります。 | — | — | web tự thêm | WinForm báo từng lỗi cụ thể, không có câu gộp |
| 12 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | không có câu 患者番号 trùng |
| 13 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | `frm201001.btnDel_Click:853` 「削除できません。」 |
| 14 | これ以上削除できません。 | ✕ đỏ | OK | giữ | `frm201001.btnDel_Click:853` 「削除できません。」 |
| 15 | 患者が見つかりませんでした。 | ✕ đỏ | OK | giữ | nhánh tải chi tiết hỏng — là lỗi thật |
| 16 | 患者が見つかりませんでした。 | ✕ đỏ | OK | giữ | nhánh tải chi tiết hỏng — là lỗi thật |
| 17 | 番号を正しく入力してください | ⚠ vàng | OK | **SỬA ICON** | cả frm203001 dùng `ShowWarningMsg` (6/8 dòng); `:161` ngay dưới đã sửa rồi |
| 18 | 患者情報の取得に失敗しました | ✕ đỏ | OK | giữ | họ `…に失敗しました` — 116/116 ✕ đỏ |
| 19 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | mọi `chkInputData*` của frm201001/201023/201031 đều `ShowErrorMsg` |
| 20 | 元号情報を読み込み中です。少々お待ちください。 | — | — | web tự thêm | trạng thái tải bất đồng bộ |
| 21 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | mọi `chkInputData*` của frm201001/201023/201031 đều `ShowErrorMsg` |
| 22 | 資格取得日より過去の日付が患者情報有効日入力されています。\n資格取得日以降の日 | ✕ đỏ | OK | giữ | `frm201023.chkInputDataMain:499` |
| 23 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | mọi `chkInputData*` của frm201001/201023/201031 đều `ShowErrorMsg` |
| 24 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | `frm201001.cs:2721` `ShowErrorMsg("E00100", …)` |
| 25 | 郵便番号・住所　両方が未入力です。 | — | — | web tự thêm | tra bưu chính là chức năng web |
| 26 | 該当するデータが見つかりません。 | — | — | web tự thêm | tra bưu chính là chức năng web |
| 27 | 以前の患者情報有効日より過去日付が患者情報有効日に入力されています。\n\n以前 | ✕ đỏ | OK | giữ | `frm201001.chkInputDataMain:2386` |
| 28 | 削除しますか？ | ？ hỏi | Yes/No | giữ | `frm201003.delData:345` |
| 29 | 削除しますか？ | ？ hỏi | Yes/No | giữ | `frm201002.delData:353` |
| 30 | このタブを削除しますか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm201031.btnF8_Click:202` — web đang Yes/No |
| 31 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | F1 コピー của frm201001 chép thẳng, không hỏi |
| 32 | 患者データは、変更されていません。保存しますか？ | ？ hỏi | Yes/No/Cancel | giữ | `frm201001.F9Proc:978` — mặc định Button1 ✓ |
| 33 | 患者情報を削除してよろしいですか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm201001.btnF8_Click:623` — web đang Yes/No |
| 34 | 患者データを保存しますか？ | — | — | web tự thêm | `frm201001.btnF7_Click:581` đi thẳng `callProj`, **không hỏi gì** |
| 35 | 選択した画像を削除しますか？ | ？ hỏi | Yes/No | giữ | `frm201012.btnF8_Click:172` |

### 窓口精算 — 23 chỗ

| # | Chuỗi | Icon | Nút | Kết luận | Căn cứ |
|---|---|---|---|---|---|
| 1 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | エージェント in ấn là kiến trúc web |
| 2 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | như trên |
| 3 | 削除対象を選択してください | ✕ đỏ | OK | giữ | `frm204001.delUnPaid:552` |
| 4 | 削除が完了しました | **ⓘ xanh** | OK | **SỬA ICON** | 「…完了しました」 legacy **61/62 ⓘ xanh** — đây là báo THÀNH CÔNG |
| 5 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 6 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 7 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 8 | 削除対象を選択してください | ✕ đỏ | OK | giữ | `frm204004.btnF8_Click:578` |
| 9 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 10 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | như trên |
| 11 | 患者が選択されていません | ✕ đỏ | OK | giữ | gần nhất `frm204004:578` 「削除対象が選択されていません。」 |
| 12 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 13 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 14 | 患者が選択されていません | ✕ đỏ | OK | giữ | gần nhất `frm204004:578` 「削除対象が選択されていません。」 |
| 15 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 16 | 印刷するデータがありません。 | — | — | web tự thêm | frm204004/204005 không có câu tương ứng |
| 17 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 18 | 保険及び自費のデータを再診で処理します。よろしいですか？\n | ？ hỏi | Yes/No | giữ | `frm204002.initProc:301` |
| 19 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm204002.btnF10_Click:1349` |
| 20 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm204002.btnF12_Click:1401` |
| 21 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | OK/Cancel | giữ | `frm204002.F9Proc:1154` — web đã dùng `.okCancel` ✓ |
| 22 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm204001.delUnPaid:547` |
| 23 | 予約データを削除しますか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm204007.btnF8_Click:137` — comment bên web đã ghi `ShowOKCancelMsg("Q00007")` |

### カルテ印刷 — 29 chỗ

| # | Chuỗi | Icon | Nút | Kết luận | Căn cứ |
|---|---|---|---|---|---|
| 1 | 部位、傷病名の登録に失敗しました | ✕ đỏ | OK | giữ | `frm205002.saveBuiDisInfo:593` |
| 2 | 印刷エージェントに接続できません。エージェントを起動してください。 | — | — | web tự thêm | エージェント in ấn là kiến trúc web |
| 3 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | như trên |
| 4 | カルテ印刷に失敗しました | ✕ đỏ | OK | giữ | `frm205002.printProc:730` |
| 5 | 検索条件が変更されています。検索ボタンを押してから実行してください。 | — | — | web tự thêm | WinForm không có khái niệm 検索条件 lệch |
| 6 | 印刷エージェントに接続できません。 | — | — | web tự thêm | エージェント |
| 7 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | エージェント |
| 8 | カルテ印刷に失敗しました | ✕ đỏ | OK | giữ | `frm205003.printMonthSumProc:895` |
| 9 | 診療日を指定してください。 | ✕ đỏ | OK | giữ | `frm205003.printCctbProc:922` |
| 10 | 印刷エージェントに接続できません。 | — | — | web tự thêm | エージェント |
| 11 | ⟨chuỗi ghép lúc chạy⟩ | — | — | web tự thêm | エージェント |
| 12 | 月締め印刷に失敗しました | ✕ đỏ | OK | giữ | `frm205003.printMonthSumProc:895` |
| 13 | 印刷指定の範囲を正しく指定してください | ✕ đỏ | OK | giữ | `frm205006.getPatInf:239` |
| 14 | 印刷指定の範囲を正しく指定してください | ✕ đỏ | OK | giữ | `frm205006.getPatInf:251` |
| 15 | 印刷対象を選択してください | ✕ đỏ | OK | giữ | 「印刷対象が選択されていません。」 `frm304001:121`/`frm305002` đều ✕ đỏ |
| 16 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 17 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 18 | 削除対象を選択してください | ✕ đỏ | OK | giữ | `frm205001.delCctWait:411` |
| 19 | 削除対象の形式が不正です | — | — | web tự thêm | chặn phòng thủ id hỏng |
| 20 | ⟨chuỗi ghép lúc chạy⟩ | ✕ đỏ | OK | giữ | họ `…に失敗しました` |
| 21 | 該当する患者が見つかりません | — | — | web tự thêm | WinForm ô 患者番号 chỉ nhập số |
| 22 | 患者を選択してください | ✕ đỏ | OK | giữ | `frm205001.delCctWait:411` — cùng dạng 「chưa chọn gì」 |
| 23 | 診療日が選択されていません。 | ✕ đỏ | OK | giữ | `frm205005.defData:210` |
| 24 | １号用紙を印刷しますか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm205002.printProc:598` / `frm205006.printProc:343` |
| 25 | お茶コンを終了しますか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm205002.btnF12_Click:400` |
| 26 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | Yes/No | giữ | `frm205003.printMonthSumProc:840` |
| 27 | プリンターに新しい用紙をセットしてください。 | ？ hỏi | OK/Cancel | giữ | `frm205003:857` — web đã khai OK/キャンセル ✓ |
| 28 | お茶コンを終了しますか？ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm205003.btnF12_Click:431` |
| 29 | ⟨chuỗi ghép lúc chạy⟩ | ？ hỏi | **OK/Cancel** | **SỬA NÚT** | `frm205001.delCctWait:406` |

---

## Ghi chú cách tra

Khớp chuỗi chính xác trượt hai lớp, nên lần trước mới còn 87 chỗ:

1. **Legacy cũng ghép chuỗi lúc chạy** — bảng tra ghi `⟨không render được⟩`.
   Gặp chữ đó phải mở file đọc, không được kết luận 「web tự thêm」.
2. **Cùng một ý nhưng khác chữ** — web 「削除対象を選択してください」 ↔ WinForm
   「削除対象が選択されていません。」. Phải khớp theo **màn + hàm**, không theo chữ.
