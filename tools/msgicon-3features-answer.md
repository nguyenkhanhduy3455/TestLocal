# 患者登録 / 窓口精算 / カルテ印刷 — trả lời 87 chỗ

Làm **hoàn toàn offline** (đọc legacy + MSGTBL + bảng tra), không chạy FlaUI.

**Trước hết: có hai thứ nằm NGOÀI danh sách 87 mà cần sửa ngay** — chúng rơi vào
nhóm 52 「khớp bảng tra, icon đúng」 nên phép đối chiếu theo icon không thấy.

---

## ⚠ A. 7 chỗ thiếu `defaultButtonIndex: 1` — Enter đang phá dữ liệu

Trong **toàn bộ** legacy chỉ có 3 hộp 3-nút không mặc định nút 1:

| Legacy | Nút mặc định |
|---|---|
| `frm201001.ExitWithoutSaving:1012` 「患者データは変更されています。保存しますか？」 | **Button2 = いいえ** |
| `frm201031.ExitWithoutSaving:390` 「介護保険情報は変更されています。保存しますか？」 | **Button2 = いいえ** |
| `frm201001.chkInputDataMain:2433` 「…生保後期高齢者ですか？…」 | Button3 = キャンセル |

Chỗ thứ ba bản web khai đúng (`wizard-validation.ts:772` `THREE_WAY_DEFAULT_CANCEL`).
Hai chỗ đầu thì **không chỗ gọi nào khai**, mà `defaultButtonIndex` bỏ trống = 0 = はい:

| File | Dòng | Ngữ cảnh |
|---|---|---|
| `patient-detail-form.tsx` | 1176 | `handleExit` — F10 戻る / F11 患者選択 / F12 メニュー |
| `patient-detail-form.tsx` | 1191 | `handleShiftF9Accounting` |
| `patient-detail-form.tsx` | 1223 | `handleShiftF6Chart` |
| `patient-detail-form.tsx` | 1248 | 口腔 (`goToOralExam`) |
| `long-term-care-insurance-screen.tsx` | 1116 · 1162 · 1203 | thoát màn 介護保険 |

Chính comment bên web ở `patient-detail-form.tsx:1170` đã ghi `// ExitWithoutSaving
(frm201001)` — đúng hàm, chỉ thiếu tham số.

### Cặp đối chứng chứng minh đây không phải suy đoán

Cùng một câu, hai chỗ gọi, hai nút mặc định khác nhau:

```csharp
frm201001.cs:978   F9Proc            ShowYesNoCancelMsg("", strMsg)                       // Button1 = はい
frm201001.cs:1012  ExitWithoutSaving ShowYesNoCancelMsg("", "…", MessageBoxDefaultButton.Button2)  // いいえ
```

Và `patient-detail-form.tsx:855` (nhánh F9 không đổi gì) **đang đúng** — nó ứng với
`F9Proc:978`, vốn mặc định はい. Nên đây không phải 「thêm `defaultButtonIndex: 1` cho
mọi chỗ」: chỗ F9 phải giữ nguyên, chỉ 7 chỗ thoát màn mới đổi.

**Đây là lần thứ ba cùng một lớp lỗi** — sau `Q00049` và `modAcc.cs:581` vs `:733`.

## B. Vì sao 87 chỗ này bảng tra không khớp — không phải 「web tự đặt câu」

Kết luận ở báo cáo cũ nói bản port tự đặt câu. Đúng một phần, nhưng **legacy cũng ghép
chuỗi lúc chạy**, nên bảng tra lưu mảnh chưa render:

```csharp
frm201001.cs:974   string strMsg = "患者データは、変更されて"
                                 + (chkChangeData(iList) == true ? "いません" : "います")
                                 + "。保存しますか？";
```

`患者登録#32` 「患者データは、変更されていません。保存しますか？」 chính là nhánh `いません`
của dòng này — **có gốc WinForm hẳn hoi**, chỉ là khớp chuỗi chính xác không thấy.
Bảng tra ghi dòng 978 là `⟨không render được: mã là biến⟩`.

⇒ Khi bảng tra ghi 「không render được」, đừng kết luận web tự thêm; phải mở file đọc.

---

## C. 20 chỗ chốt được bằng chỗ gọi cụ thể

| # | Chuỗi | Legacy | **Icon** | Nút | Mặc định |
|---|---|---|---|---|---|
| 患#6 | タブ…の設定の有効期間… | `frm201031.chkInputDataMain:849` | ✕ đỏ | OK | — |
| 患#13 | `削除できません。` | `frm201001.btnDel_Click:853` | ✕ đỏ | OK | — |
| 患#14 | これ以上削除できません。 | `frm201001.btnDel_Click:853` | ✕ đỏ | OK | — |
| 患#22 | 資格取得日より過去の日付が… | `frm201023.chkInputDataMain:499` | ✕ đỏ | OK | — |
| 患#24 | `ja.E00100` 公費 自>至 | `frm201001.cs:2721` | ✕ đỏ | OK | — |
| 患#27 | 以前の患者情報有効日より… | `frm201001.chkInputDataMain:2386` | ✕ đỏ | OK | — |
| 患#28 | 削除しますか？ | `frm201003.delData:345` | ？ hỏi | **Yes/No** | Button1 |
| 患#29 | 削除しますか？ | `frm201002.delData:353` | ？ hỏi | **Yes/No** | Button1 |
| 患#30 | このタブを削除しますか？ | `frm201031.btnF8_Click:202` | ？ hỏi | **OK/Cancel** | Button1 |
| 患#32 | 患者データは、変更されていません… | `frm201001.F9Proc:978` | ？ hỏi | Yes/No/Cancel | **Button1** ✓ |
| 患#33 | 患者情報を削除してよろしいですか？ | `frm201001.btnF8_Click:623` | ？ hỏi | **OK/Cancel** | Button1 |
| 患#35 | 選択した画像を削除しますか？ | `frm201012.btnF8_Click:172` | ？ hỏi | **Yes/No** | Button1 |
| 窓#3 | 削除対象を選択してください | `frm204001.delUnPaid:552` | ✕ đỏ | OK | — |
| 窓#8 | 削除対象を選択してください | `frm204004.btnF8_Click:578` | ✕ đỏ | OK | — |
| 窓#18 | 保険及び自費のデータを再診で… | `frm204002.initProc:301` | ？ hỏi | **Yes/No** | Button1 ✓ |
| 窓#21 | 登録してよろしいですか？ | `frm204002.F9Proc:1154` | ？ hỏi | OK/Cancel | Button1 ✓ |
| カ#1 | 部位、傷病名の登録に失敗しました | `frm205002.saveBuiDisInfo:593` | ✕ đỏ | OK | — |
| カ#4 · #8 | カルテ印刷に失敗しました | `frm205002:730` · `frm205003:895` | ✕ đỏ | OK | — |
| カ#12 | 月締め印刷に失敗しました | `frm205003.printMonthSumProc:895` | ✕ đỏ | OK | — |
| カ#13 · #14 | 印刷指定の範囲を正しく… | `frm205006.getPatInf:239/251` | ✕ đỏ | OK | — |
| カ#18 | 削除対象を選択してください | `frm205001.delCctWait:411` | ✕ đỏ | OK | — |
| カ#23 | 診療日が選択されていません。 | `frm205005.defData:210` | ✕ đỏ | OK | — |
| カ#25 · #28 | お茶コンを終了しますか？ | `frm205002:400` · `frm205003:431` | ？ hỏi | **OK/Cancel** | Button1 |
| カ#26 | …月締めを行っていません… | `frm205003.printMonthSumProc:840` | ？ hỏi | **Yes/No** | Button1 ✓ |
| カ#27 | プリンターに新しい用紙を… | `frm205003:857/1011` | ？ hỏi | OK/Cancel | Button1 ✓ |

### ⚠ Lệch BỘ NÚT — 5 chỗ

Legacy `ShowOKCancelMsg` ⇒ **OK/キャンセル**, nhưng web gọi `confirmDialog(...)` trơ,
mà mặc định của nó là **はい/いいえ**:

`患#30` · `患#33` · `カ#25` · `カ#28` — và hai chỗ ghép động dưới đây:

| Web | Legacy |
|---|---|
| `counter-payment-page.tsx:252` 「選択された${n}件の未精算データを削除しますか？」 はい/いいえ | `frm204001.delUnPaid:547` 「削除してよろしいですか？」 **OK/Cancel** |
| `chart-print-patient-select-page.tsx:243` 「選択された${n}件のカルテ待ちデータを…」 はい/いいえ | `frm205001.delCctWait:406` 「削除してよろしいですか？」 **OK/Cancel** |

Đổi sang `confirmDialog.okCancel(...)` là khớp.

## D. 24 chỗ ghép động — luật họ câu đã phủ, MẶC ĐỊNH ĐỎ là ĐÚNG

Gần hết nhóm 「chuỗi ghép lúc chạy」 là handler `catch` đổ ra `…に失敗しました`:

`窓#1 #2 #5 #6 #7 #9 #10 #12 #13 #15 #17` · `カ#3 #7 #11 #17 #20` · `患#2 #3`

Luật đã đo ở đợt trước: **`…に失敗しました` 116/116 là ✕ đỏ**, không ngoại lệ.
Các chỗ đổ `result.errors` của validation (`患#4 #10 #19 #21 #23`) cũng vậy —
mọi `chkInputData*` của `frm201001` / `frm201023` / `frm201031` đều `ShowErrorMsg`.

⇒ **Giữ nguyên.** Không cần sửa, không cần chạy UI.

## E. 9 chỗ web tự thêm — WinForm không có hộp tương ứng

| # | Chuỗi | Vì sao |
|---|---|---|
| 患#8 · #20 | 元号情報を読み込み中です。 | trạng thái tải bất đồng bộ, WinForm không có |
| 患#11 | 入力内容に誤りがあります。 | WinForm báo từng lỗi cụ thể, không có câu gộp |
| 患#25 · #26 | 郵便番号…／該当するデータが見つかりません。 | tra bưu chính là chức năng web |
| 患#34 | 患者データを保存しますか？ | `frm201001.btnF7_Click:581` đi thẳng `callProj`, **không hỏi gì** |
| カ#2 · #6 · #10 | 印刷エージェントに接続できません。 | WinForm in trực tiếp, không có agent |

Riêng `患#34`: WinForm F7 sang 処置 **không hỏi**. Bản web thêm một hộp xác nhận
không có ở bản gốc — quyết định thiết kế, cần người chốt chứ không phải parity.

## F. 6 chỗ nên xem lại — nghi ⚠ vàng chứ không phải ✕ đỏ

Nhóm 「không có / chưa chọn」 trong `defData` của WinForm đều là `ShowWarningMsg`:
`frm203001.defData:672` · `frm204001.defData:376` · `frm205001.defData:495`
— cả ba đều 「患者情報が登録されていません。」 **⚠ vàng**.

| # | Chuỗi | Nghi |
|---|---|---|
| 患#9 | 患者情報がありません。 | ⚠ vàng |
| 患#15 · #16 | 患者が見つかりませんでした。 | ⚠ vàng |
| 患#17 | 番号を正しく入力してください | ⚠ vàng — cùng họ với `patient-no-input:161` đã sửa |
| 患#18 | 患者情報の取得に失敗しました | ⚠ vàng (`frm203001.defData:672`) |
| カ#22 | 患者を選択してください | ⚠ vàng (`frm205001.defData:495`) |

`患#17` đáng chú ý: `patient-no-input.tsx:161` vừa được sửa thành ⚠ vàng, mà `:150`
ngay trên nó vẫn đỏ — cùng một ô nhập, cùng một họ câu.

## G. Còn lại 8 chỗ chưa chốt

`患#1 #5 #12 #31` · `窓#4 #11 #14 #16 #19 #20 #22` · `カ#15 #16 #19 #21 #29`
— chuỗi không có họ rõ ràng trong legacy. Phần lớn là 「…を選択してください」 /
「…がありません」, tức cùng nhóm nghi ngờ ở mục F.
