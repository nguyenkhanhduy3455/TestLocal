# Icon hộp thoại WinForm — trả lời cho `userapp-msgicon-unverified.md`

## Nguồn & độ tin cậy

Bảng tra `winform-dialog-catalog.tsv`: **1785 chỗ gọi hộp thoại / 273 màn**, dựng bằng
cách ghép *call-site đọc từ `src/OCHACOM/**`* với *140 row MSGTBL đọc từ SQL Server*,
rồi render ra đúng câu app sẽ hiện.

> **Vì sao grep của đợt trước không ra.** Với mọi chỗ đi qua `MsgDialog.Show*Msg(mã, tham số)`,
> chuỗi nằm trong **MSGTBL (DB)**, source C# chỉ có mã và tham số. Không có DB thì không
> tài nào tra ngược được — 1717/1785 chỗ thuộc loại này.

**Đối chứng**: 12 hộp thoại đã *đo thật* trên `ochacom-win` (ảnh + manifest icon) so với
bảng tra → **12/12 khớp**, kể cả ca `frm203002.cs:2205` dùng `ShowWarningMsg("E00002",…)`
nên ra ⚠ vàng dù tên mã bắt đầu bằng `E`.

> **Icon do CHỖ GỌI quyết định, không do mã.** Bảng khoá theo call-site.

---

## A. Chốt được — 34 chỗ

Chuỗi khớp nguyên văn, và **mọi** chỗ gọi sinh ra nó đều cùng một icon ⇒ đáp án không
phụ thuộc vào việc đoán đúng màn.

| Nhóm | # | Chuỗi | **Icon** | Số chỗ gọi | Ví dụ call-site |
|---|---|---|---|---|---|
| 1. Ưu tiên cao — | 2 | ``新しい日付が入力されていません。`` | **✕ đỏ** | 1 | `INP/Forms/frm203051.cs:121` ShowErrorMsg("E00001", "新しい日付") |
| 1. Ưu tiên cao — | 18 | ``情報が入力されていません。`` | **✕ đỏ** | 1 | `INP/Forms/frm203047.cs:158` ShowErrorMsg("E00001", "情報") |
| 1. Ưu tiên cao — | 19 | ``情報の文字数が越えています。`` | **✕ đỏ** | 1 | `INP/Forms/frm203047.cs:163` ShowErrorMsg("E00022", "情報") |
| 1. Ưu tiên cao — | 25 | ``エラーはありません。`` | **⚠ vàng** | 1 | `INP/Forms/frm203002.cs:5212` ShowWarningMsg("I00100") |
| 1. Ưu tiên cao — | 28 | ``該当ガイドがありません。`` | **✕ đỏ** | 1 | `INP/Forms/frm203002.cs:2011` ShowErrorMsg("E00024", "該当ガイド") |
| 2. Đang khai ĐỎ  | 1 | ``算定処置コードが間違っています。`` | **✕ đỏ** | 2 | `INP/Forms/frm203039.cs:365` ShowErrorMsg("E00002", "算定処置コード") |
| 2. Đang khai ĐỎ  | 2 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 3 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 4 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 5 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 6 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 8 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 10 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 11 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 12 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 13 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 14 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 15 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 16 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 18 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 19 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 20 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 23 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 24 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 27 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 2. Đang khai ĐỎ  | 28 | ``登録に失敗しました。`` | **✕ đỏ** | 3 | `NIKEI/Forms/frm207003.cs:348` ShowErrorMsg("E00026", "登録") |
| 3. Hộp XÁC NHẬN  | 6 | ``削除してよろしいですか？`` | **？ hỏi** | 39 | `INP/Forms/frm203047.cs:137` ShowOKCancelMsg("Q00003") |
| 3. Hộp XÁC NHẬN  | 7 | ``更新してよろしいですか？`` | **？ hỏi** | 29 | `INP/Forms/frm203030.cs:104` ShowOKCancelMsg("Q00002") |
| 3. Hộp XÁC NHẬN  | 8 | ``更新してよろしいですか？`` | **？ hỏi** | 29 | `INP/Forms/frm203028.cs:111` ShowOKCancelMsg("Q00002") |
| 3. Hộp XÁC NHẬN  | 9 | ``更新してよろしいですか？`` | **？ hỏi** | 29 | `INP/Forms/frm203029.cs:172` ShowOKCancelMsg("Q00002") |
| 3. Hộp XÁC NHẬN  | 19 | ``該当部位の治療進行状態をリセットします。\nよろしいですか` | **？ hỏi** | 1 | `INP/Forms/frm203002.cs:6631` ShowOKCancelMsg("Q00100", "該当部位の治療進行状態をリセットします。") |
| 4. Đang khai ⚠ v | 1 | ``登録が完了しました。`` | **ⓘ xanh** | 24 | `INP/Forms/frm203030.cs:350` ShowInfoMsg("I00001") |
| 4. Đang khai ⚠ v | 2 | ``登録が完了しました。`` | **ⓘ xanh** | 24 | `INP/Forms/frm203028.cs:779` ShowInfoMsg("I00001") |
| 4. Đang khai ⚠ v | 3 | ``登録が完了しました。`` | **ⓘ xanh** | 24 | `INP/Forms/frm203029.cs:1135` ShowInfoMsg("I00001") |

## B. Cần chọn màn — 0 chỗ

Cùng chuỗi nhưng các chỗ gọi dùng icon KHÁC NHAU — đây đúng là ca mà "icon do chỗ gọi
quyết định". Phải theo màn ghi ở cột cuối của danh sách gốc.


## C. Không có đối ứng WinForm — 7 chỗ

Nói về **print agent / PDF** — cơ chế chỉ bản web mới có. Không có hộp thoại WinForm
nào để so; icon là quyết định của bản web.

- 1. Ưu tiên cao — #4 — `components/dental-disease-management-dialog.tsx:573`
- 1. Ưu tiên cao — #14 — `components/karte-info-share-dialog.tsx:459`
- 1. Ưu tiên cao — #16 — `components/monthly-visit-summary-dialog.tsx:246`
- 1. Ưu tiên cao — #17 — `components/oral-hygiene-instruction-dialog.tsx:388`
- 1. Ưu tiên cao — #22 — `components/prosthesis-management-dialog.tsx:359`
- 1. Ưu tiên cao — #23 — `components/referral-letter-dialog.tsx:398`
- 1. Ưu tiên cao — #24 — `components/treatment-entry-detail.tsx:1328`

## D. Chưa khớp — 42 chỗ

Chuỗi do bản port tự đặt, không trùng câu nào trong 1785 chỗ gọi. Hai khả năng:
bản port diễn đạt lại (phải khớp theo *tình huống*), hoặc WinForm không có hộp thoại
tương ứng. Tra `winform-dialog-catalog.tsv` lọc theo cột `screen`.

- 1. Ưu tiên cao — #1 ``日付が正しくありません。`` — `components/comment-date-param-dialog.tsx:83` — màn frm203048
- 1. Ưu tiên cao — #3 ``新しい日付が正しくありません。`` — `components/date-change-dialog.tsx:64` — màn frm203002,frm203051
- 1. Ưu tiên cao — #5 ``⟨động⟩ alertDialog(`部位情報の変換に失敗しました: ${msg}`)`` — `components/handover-dialog.tsx:222` — màn frm203025
- 1. Ưu tiên cao — #6 ``申し送り事項を入力してください。`` — `components/handover-dialog.tsx:230` — màn frm203025
- 1. Ưu tiên cao — #7 ``申し送り事項は10行以内で入力してください。`` — `components/handover-dialog.tsx:241` — màn frm203025
- 1. Ưu tiên cao — #8 ``申し送り事項の１行あたり文字数（バイト数）が上限を超えています。`` — `components/handover-dialog.tsx:249` — màn frm203025
- 1. Ưu tiên cao — #9 ``⟨động⟩ alertDialog(`登録に失敗しました: ${err.message}`)`` — `components/handover-dialog.tsx:278` — màn frm203025
- 1. Ưu tiên cao — #10 ``申し送り事項を入力してください。`` — `components/handover-template-dialog.tsx:85` — màn —
- 1. Ưu tiên cao — #11 ``登録するデータがありません。`` — `components/handover-template-dialog.tsx:156` — màn —
- 1. Ưu tiên cao — #12 ``⟨động⟩ alertDialog(`登録に失敗しました: ${err.message}`)`` — `components/handover-template-dialog.tsx:169` — màn —
- 1. Ưu tiên cao — #13 ``日付が正しくありません。`` — `components/history-date-select-dialog.tsx:74` — màn frm902004
- 1. Ưu tiên cao — #15 ``薬剤の確定に失敗しました。`` — `components/medicine-selection-dialog.tsx:272` — màn frm203013
- 1. Ưu tiên cao — #20 ``⟨động⟩ alertDialog(`登録／削除に失敗しました: ${err.message}`)`` — `components/patient-notice-dialog.tsx:76` — màn frm203047
- 1. Ưu tiên cao — #21 ``⟨động⟩ F8 削除 — confirm then delete (WinForm btnF8_C` — `components/patient-notice-dialog.tsx:86` — màn frm203047
- 1. Ưu tiên cao — #26 ``コメント自動入力の取得に失敗しました。\n`` — `components/treatment-entry-detail.tsx:3725` — màn frm201001,frm201008,frm201045
- 1. Ưu tiên cao — #27 ``この薬剤コードは現在未対応です。`` — `components/treatment-entry-detail.tsx:5128` — màn frm201001,frm201008,frm201045
- 1. Ưu tiên cao — #29 ``治療進行状態のリセットに失敗しました。`` — `components/treatment-side-panel.tsx:653` — màn frm203002
- 2. Đang khai ĐỎ  #7 ``登録に失敗しました: ${reason}`` — `components/dental-disease-management-dialog.tsx:529` — màn frm203021
- 2. Đang khai ĐỎ  #9 ``⟨động⟩ alertDialog(`登録に失敗しました: ${(err as Error).mes` — `components/oral-hygiene-instruction-dialog.tsx:329` — màn frm203022
- 2. Đang khai ĐỎ  #17 ``登録に失敗しました: ${reason}`` — `components/prosthesis-management-dialog.tsx:309` — màn frm203023
- 2. Đang khai ĐỎ  #21 ``⟨động⟩ Surface failures so the user doesn't think t` — `components/restorative-management-dialog.tsx:543` — màn frm203045
- 2. Đang khai ĐỎ  #22 ``STEPの値が正しくありません。\n${max}以下の値を入力して下さい。`` — `components/step-edit-dialog.tsx:171` — màn frm203050
- 2. Đang khai ĐỎ  #25 ``⟨động⟩ whereas legacy's generic wording sent them h` — `components/treatment-entry-detail.tsx:4067` — màn frm201001,frm201008,frm201045
- 2. Đang khai ĐỎ  #26 ``グループコードは「100未満」または「1000以上」で入力してください。`` — `components/treatment-group-register-dialog.tsx:129` — màn frm601013
- 2. Đang khai ĐỎ  #29 ``部位の取得に失敗しました。`` — `queries/bui-queries.ts:59` — màn frm902003
- 3. Hộp XÁC NHẬN  #1 ``⟨động⟩ wrapped by Q00100 template "{0}よろしいですか？"). N` — `components/date-change-dialog.tsx:72` — màn frm203002,frm203051
- 3. Hộp XÁC NHẬN  #2 ``登録します。よろしいですか？`` — `components/handover-dialog.tsx:254` — màn frm203025
- 3. Hộp XÁC NHẬN  #3 ``⟨động⟩ confirmDialog(`行（${targetMsg}）を削除してよろしいですか？`` — `components/handover-template-dialog.tsx:112` — màn —
- 3. Hộp XÁC NHẬN  #4 ``登録します。よろしいですか？`` — `components/handover-template-dialog.tsx:160` — màn —
- 3. Hộp XÁC NHẬN  #5 ``⟨động⟩ confirmDialog(message)`` — `components/oral-info-screen.tsx:663` — màn frm201001,frm202002,frm202003
- 3. Hộp XÁC NHẬN  #10 ``変更を適用しますか？\n当月のすべての処置に適用されます。よろしいですか？`` — `components/treatment-entry-detail.tsx:1644` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #11 ``⟨động⟩ confirmDialog( `処置点数が ${Math.abs(diffScore)}` — `components/treatment-entry-detail.tsx:1871` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #12 ``⟨động⟩ 作成してよろしいですか？」 (default No, modAcc.cs:560-562` — `components/treatment-entry-detail.tsx:2124` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #13 ``会計処理後、請求金額が増えています。\n`` — `components/treatment-entry-detail.tsx:2143` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #14 ``会計処理後、医療保険の請求金額が増えています。\n`` — `components/treatment-entry-detail.tsx:2177` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #15 ``${day}日診療分の担当ドクターを\n${drNm} に変更します。\n\nよろしいですか？`` — `components/treatment-entry-detail.tsx:2571` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #16 ``同一部位の処置を全て削除します。\nよろしいですか？`` — `components/treatment-entry-detail.tsx:3289` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #17 ``⟨động⟩ 初診/再診 prompt, matching the legacy ordering.`` — `components/treatment-entry-detail.tsx:3581` — màn frm201001,frm201008,frm201045
- 3. Hộp XÁC NHẬN  #18 ``⟨động⟩ See userapp/inp-p0-investigation.md §6 and i` — `components/treatment-entry-detail.tsx:4335` — màn frm201001,frm201008,frm201045
- 4. Đang khai ⚠ v #1 ``⟨động⟩ MsgDialog.ShowWarningMsg("W00100", info) — w` — `components/treatment-entry-detail.tsx:3818` — màn frm201001,frm201008,frm201045
- 4. Đang khai ⚠ v #2 ``⟨động⟩ `MsgBox(…, MsgBoxStyle.Exclamation)` (modMai` — `components/treatment-entry-detail.tsx:5591` — màn frm201001,frm201008,frm201045
- 4. Đang khai ⚠ v #3 ``⟨động⟩ alertDialog(NO_MATCHING_TREATMENT_MSG, { sev` — `components/treatment-entry-detail.tsx:5613` — màn frm201001,frm201008,frm201045

---

## E. 「Hộp hỏi màu vàng」 — 2 chỗ, cần quyết định primitive

Hộp HỎI kèm icon ⚠ (`YesNo` + `Exclamation`). Bản web luôn ra ？ xanh nên không diễn
tả được; đây là toàn bộ danh sách trong app:

- `INP/Forms/frm203002.cs:3857` `DeleteRow` — ？ hỏi + ⚠ vàng — 「よろしいですか？」

---

## F. LUẬT THEO HỌ CÂU — dùng cho mọi chỗ chưa khớp nguyên văn

Đếm trên toàn bộ 1785 chỗ gọi. Cột cuối là số ngoại lệ, đã liệt kê hết bên dưới —
nên đây là luật *có kiểm chứng*, không phải cảm tính.

| Họ câu | Số chỗ | Icon áp đảo | Ngoại lệ |
|---|---|---|---|
| `…に失敗しました` | 116 | **✕ đỏ** (116) | 0 |
| `…が越えています` | 35 | **✕ đỏ** (35) | 0 |
| `…してよろしいですか？` | 214 | **？ hỏi** (213) | 1 |
| `…が完了しました` | 59 | **ⓘ xanh** (58) | 1 |
| `…が入力されていません` | 176 | **✕ đỏ** (166) | 10 |
| `…が間違っています` | 187 | **✕ đỏ** (174) | 13 |
| `…が選択されていません` | 65 | **✕ đỏ** (45) | 20 |
| `…がありません` | 160 | **✕ đỏ** (144) | 16 |

### Toàn bộ ngoại lệ của bảng trên

**…してよろしいですか？**
- ？ hỏi + ⚠ vàng · `INP/Forms/frm203002.cs:3857` `DeleteRow` — 「よろしいですか？」
**…が完了しました**
- ⚠ vàng · `PAT/Forms/frm201012.cs:639` `CallbackTransferImage` — 「スキャナ取込が完了しました。（画像なし）」
**…が入力されていません**
- ？ hỏi · `PAT/Forms/frm201001.cs:2234` `chkInputDataMain` — 「患者情報有効日が入力されていません。資格取得日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201001.cs:2324` `chkInputDataMain` — 「診療開始日が入力されていません。今日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201001.cs:2339` `chkInputDataMain` — 「患者情報有効日が入力されていません。診療開始日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201001.cs:2349` `chkInputDataMain` — 「患者情報有効日が入力されていません。今日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201001.cs:2433` `chkInputDataMain` — 「歳以上で、保険者番号が入力されていません。生保後期高齢者ですか？「はい」を押すと生保後期高齢者、「いいえ」を押す」
- ？ hỏi · `PAT/Forms/frm201001.cs:2643` `chkInputDataMed` — 「記号が入力されていません。続行してよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201023.cs:432` `chkInputDataMain` — 「診療開始日が入力されていません。今日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201023.cs:449` `chkInputDataMain` — 「患者情報有効日が入力されていません。資格取得日にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201023.cs:457` `chkInputDataMain` — 「患者情報有効日が入力されていません。診療開始日の日付にしてよろしいですか？」
- ？ hỏi · `PAT/Forms/frm201023.cs:467` `chkInputDataMain` — 「患者情報有効日が入力されていません。今日の日付にしてよろしいですか？」
**…が間違っています**
- ⚠ vàng · `INP/Forms/frm203001.cs:638` `defData` — 「診療日が間違っています。」
- ⚠ vàng · `INP/Forms/frm203002.cs:2205` `InputCheckKobe` — 「個別入力のコードが間違っています。」
- ⚠ vàng · `INP/Forms/frm203002.cs:2216` `InputCheckKobe` — 「個別入力の点数が間違っています。」
- ⚠ vàng · `WAIT/Forms/frm208001.cs:387` `btnF2_Click` — 「予約日が間違っています。」
- ⚠ vàng · `COMMON/Forms/frm902001.cs:189` `getViewData` — 「生年月日が間違っています。」
- ⚠ vàng · `COMMON/Forms/frm901001.cs:337` `getPatInf` — 「生年月日が間違っています。」
- ⚠ vàng · `COMMON/Forms/frm901001.cs:344` `getPatInf` — 「最終診療日が間違っています。」
- ⚠ vàng · `INI/Forms/frm506006.cs:278` `getViewData` — 「基準日が間違っています。」
- ⚠ vàng · `PAT/Forms/frm201041.cs:268` `DoSearch` — 「番号が間違っています。」
- ⚠ vàng · `PAT/Forms/frm201041.cs:295` `DoSearch` — 「生年月日が間違っています。」
- ⚠ vàng · `PAT/Forms/frm201041.cs:302` `DoSearch` — 「資格確認日が間違っています。」
- ⚠ vàng · `PAT/Forms/frm201014.cs:252` `getViewData` — 「診療年月が間違っています。」
- ⚠ vàng · `PAT/Forms/frm201009.cs:190` `getViewData` — 「生年月日が間違っています。」
**…が選択されていません**
- ⚠ vàng · `YOYAKU/Forms/frm206005.cs:139` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `SYOHO/Forms/frm503005.cs:166` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `WAIT/Forms/frm208003.cs:140` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `REC/Forms/frm502005.cs:160` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `COMMON/Forms/frm902010.cs:173` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `COMMON/Forms/frm902011.cs:172` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `COMMON/Forms/frm902001.cs:143` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `COMMON/Forms/frm902012.cs:172` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `COMMON/Forms/frm902013.cs:182` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `FIL/Forms/frm501018.cs:135` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `FIL/Forms/frm501017.cs:146` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `FIL/Forms/frm501023.cs:229` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `FIL/Forms/frm501014.cs:159` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201044.cs:123` `btnF8_Click` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201044.cs:496` `defData` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201010.cs:140` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201041.cs:329` `btnF8_Click` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201041.cs:348` `btnF9_Click` — 「データが選択されていません。」
- ⚠ vàng · `PAT/Forms/frm201009.cs:143` `btnF9_Click` — 「データが選択されていません。」
- ？ hỏi · `COMMON/Forms/frm902007.cs:412` `btnEndEntry_Click` — 「病名が選択されていませんが、よろしいですか？」
**…がありません**
- ⓘ xanh · `YOYAKU/Forms/frm206005.cs:177` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `SYOHO/Forms/frm503005.cs:229` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `REC/Forms/frm502005.cs:227` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `COMMON/Forms/frm902001.cs:204` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `COMMON/Forms/frm901001.cs:361` `getPatInf` — 「該当データがありません。」
- ⓘ xanh · `FIL/Forms/frm501017.cs:218` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `FIL/Forms/frm501023.cs:291` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `FIL/Forms/frm501014.cs:233` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `CCT/Forms/frm205006.cs:310` `getPatInf` — 「該当データがありません。」
- ⓘ xanh · `PAT/Forms/frm201010.cs:181` `getViewData` — 「該当データがありません。」
- ⓘ xanh · `PAT/Forms/frm201009.cs:205` `getViewData` — 「該当データがありません。」
- ？ hỏi · `INP/Forms/frm203017.cs:1005` `getViewData` — 「算定できる処置がありません。\r\nガイド表示チェックをスキップしてガイド表示します。よろしいですか？」
- ？ hỏi · `CCT/Forms/frm205003.cs:851` `printMonthSumProc` — 「指定月に診療情報がありません。このまま続けてもよろしいですか？」
- ？ hỏi · `CCT/Forms/frm205003.cs:1004` `printCctbProc` — 「指定月に診療情報がありません。このまま続けてもよろしいですか？」
- ⚠ vàng · `SHARE_EMR/Forms/frm201045.cs:243` `btnF8_Click` — 「削除するデータがありません。」
- ⚠ vàng · `SHARE_EMR/Forms/frm201045.cs:298` `btnF9_Click` — 「選択するデータがありません。」

---

## G. Nhóm D — ứng viên trong đúng màn

Chuỗi bản port diễn đạt lại. Mỗi chỗ kèm ứng viên gần nhất TRONG MÀN mà file khai là
port từ đó, cùng điểm tương đồng. **Với họ 「…に失敗しました」 thì khỏi cần chọn**: cả 116
chỗ gọi trong app đều ✕ đỏ.

| Nhóm | # | Chuỗi (web) | Mức | Ứng viên legacy | Icon |
|---|---|---|---|---|---|
| 1. Ưu tiên cao | 1 | ``日付が正しくありません。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 3 | ``新しい日付が正しくありません。`` | ứng viên 0.38 | `INP/Forms/frm203051.cs:121` chkInputData 「新しい日付が入力されていません。」 | **✕ đỏ** |
| 1. Ưu tiên cao | 5 | ``⟨động⟩ alertDialog(`部位情報の変換に失` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 6 | ``申し送り事項を入力してください。`` | ứng viên 0.24 | `INP/Forms/frm203025.cs:284` selectRow 「申し送り事項が入力されていません。」 | **✕ đỏ** |
| 1. Ưu tiên cao | 7 | ``申し送り事項は10行以内で入力してください。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 8 | ``申し送り事項の１行あたり文字数（バイト数）が上限を超えてい` | rất có thể 0.50 | `INP/Forms/frm203025.cs:297` selectRow 「申し送り事項の１行あたりの文字数が越えています。」 | **✕ đỏ** |
| 1. Ưu tiên cao | 9 | ``⟨động⟩ alertDialog(`登録に失敗しました` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 10 | ``申し送り事項を入力してください。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 11 | ``登録するデータがありません。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 12 | ``⟨động⟩ alertDialog(`登録に失敗しました` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 13 | ``日付が正しくありません。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 15 | ``薬剤の確定に失敗しました。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 20 | ``⟨động⟩ alertDialog(`登録／削除に失敗し` | rất có thể 0.79 | `INP/Forms/frm203047.cs:253` updateProc 「登録／削除に失敗しました。」 | **✕ đỏ** |
| 1. Ưu tiên cao | 21 | ``⟨động⟩ F8 削除 — confirm then d` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 26 | ``コメント自動入力の取得に失敗しました。\n`` | ứng viên 0.35 | `SHARE_EMR/Forms/frm201045.cs:286` btnF8_Click 「削除に失敗しました。」 | **✕ đỏ** |
| 1. Ưu tiên cao | 27 | ``この薬剤コードは現在未対応です。`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 1. Ưu tiên cao | 29 | ``治療進行状態のリセットに失敗しました。`` | ứng viên 0.25 | `INP/Forms/frm203002.cs:6631` cmdGuidReset_Click 「該当部位の治療進行状態をリセットします。よろしいです」 | **？ hỏi** |
| 2. Đang khai Đ | 7 | ``登録に失敗しました: ${reason}`` | rất có thể 0.50 | `INP/Forms/frm203021.cs:621` printProc 「印刷に失敗しました。」 | **✕ đỏ** |
| 2. Đang khai Đ | 9 | ``⟨động⟩ alertDialog(`登録に失敗しました` | — | *(không có ứng viên trong màn khai báo)* | — |
| 2. Đang khai Đ | 17 | ``登録に失敗しました: ${reason}`` | rất có thể 0.50 | `INP/Forms/frm203023.cs:404` printProc 「印刷に失敗しました。」 | **✕ đỏ** |
| 2. Đang khai Đ | 21 | ``⟨động⟩ Surface failures so th` | — | *(không có ứng viên trong màn khai báo)* | — |
| 2. Đang khai Đ | 22 | ``STEPの値が正しくありません。\n${max}以下の値を` | rất có thể 0.48 | `INP/Forms/frm203050.cs:261` saveData 「STEPの値が正しくありません。" + Enviro」 | **✕ đỏ** |
| 2. Đang khai Đ | 25 | ``⟨động⟩ whereas legacy's gener` | — | *(không có ứng viên trong màn khai báo)* | — |
| 2. Đang khai Đ | 26 | ``グループコードは「100未満」または「1000以上」で入力` | rất có thể 0.61 | `CHKRULE/Forms/frm601013.cs:344` chkInputData 「入力範囲が間違っています。グループコードは「100未」 | **✕ đỏ** |
| 2. Đang khai Đ | 29 | ``部位の取得に失敗しました。`` | rất có thể 0.50 | `COMMON/Forms/frm902003.cs:1025` delBrSample 「削除に失敗しました。」 | **✕ đỏ** |
| 3. Hộp XÁC NHẬ | 1 | ``⟨động⟩ wrapped by Q00100 temp` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 2 | ``登録します。よろしいですか？`` | rất có thể 0.60 | `INP/Forms/frm203025.cs:144` btnF9_Click 「登録してよろしいですか？」 | **？ hỏi** |
| 3. Hộp XÁC NHẬ | 3 | ``⟨động⟩ confirmDialog(`行（${tar` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 4 | ``登録します。よろしいですか？`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 5 | ``⟨động⟩ confirmDialog(message)` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 10 | ``変更を適用しますか？\n当月のすべての処置に適用されます。` | ứng viên 0.33 | `PAT/Forms/frm201001.cs:3352` chkOQSDataMerge 「続柄が変更されました。枝番を追加します。よろしいです」 | **？ hỏi** |
| 3. Hộp XÁC NHẬ | 11 | ``⟨động⟩ confirmDialog( `処置点数が ` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 12 | ``⟨động⟩ 作成してよろしいですか？」 (default` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 13 | ``会計処理後、請求金額が増えています。\n`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 14 | ``会計処理後、医療保険の請求金額が増えています。\n`` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 15 | ``${day}日診療分の担当ドクターを\n${drNm} に` | ứng viên 0.29 | `PAT/Forms/frm201001.cs:3352` chkOQSDataMerge 「続柄が変更されました。枝番を追加します。よろしいです」 | **？ hỏi** |
| 3. Hộp XÁC NHẬ | 16 | ``同一部位の処置を全て削除します。\nよろしいですか？`` | ứng viên 0.37 | `PAT/Forms/frm201001.cs:859` btnDel_Click 「選択されている患者情報を削除します。よろしいですか？」 | **？ hỏi** |
| 3. Hộp XÁC NHẬ | 17 | ``⟨động⟩ 初診/再診 prompt, matching` | — | *(không có ứng viên trong màn khai báo)* | — |
| 3. Hộp XÁC NHẬ | 18 | ``⟨động⟩ See userapp/inp-p0-inv` | — | *(không có ứng viên trong màn khai báo)* | — |
| 4. Đang khai ⚠ | 1 | ``⟨động⟩ MsgDialog.ShowWarningM` | — | *(không có ứng viên trong màn khai báo)* | — |
| 4. Đang khai ⚠ | 2 | ``⟨động⟩ `MsgBox(…, MsgBoxStyle` | — | *(không có ứng viên trong màn khai báo)* | — |
| 4. Đang khai ⚠ | 3 | ``⟨động⟩ alertDialog(NO_MATCHIN` | — | *(không có ứng viên trong màn khai báo)* | — |

---

## H. Nhóm D — đọc handler xong (22 chỗ)

Tra bằng cách mở đúng `frmXXXXXX` mà file web khai, rồi đọc handler tương ứng.

| Nhóm | # | Chuỗi (web) | **Icon** | Call-site legacy | Ghi chú |
|---|---|---|---|---|---|
| 1 | 1 | `日付が正しくありません。` | **✕ đỏ** | `frm203048.cs:179` `btnF9_Click` | legacy: 「日付が間違っています。」 |
| 1 | 7 | `申し送り事項は10行以内で…` | **✕ đỏ** | `frm203025.cs:290` `selectRow` | legacy: 「登録できるのは１０行までです。」 |
| 1 | 10 | `申し送り事項を入力してください。` | **✕ đỏ** | `frm203026.cs:102` `btnF9_Click` | màn là **frm203026** (web ghi 「—」) |
| 1 | 11 | `登録するデータがありません。` | — | *(không có)* | legacy không có câu này |
| 1 | 13 | `日付が正しくありません。` | **✕ đỏ** | `frm902004.cs:135` `btnF9_Click` | |
| 1 | 21 | F8 削除 confirm | **？ hỏi** | `frm203047.cs:137` `btnF8_Click` | `Q00003` |
| 1 | 27 | `この薬剤コードは現在未対応です。` | — | *(không có)* | web tự thêm |
| 2 | 21 | Surface failures… | **✕ đỏ** | `frm203045.cs:174` `btnF9_Click` | 「補綴管理情報の更新に失敗しました。」 |
| 3 | 1 | wrapped by `Q00100` | **？ hỏi** | `frm203051.cs:104` `btnF9_Click` | |
| 3 | 3 | `行（…）を削除してよ…` | **？ hỏi** | `frm203026.cs:185` `btnDelete_Click` | `Q00006` |
| 3 | 4 | `登録します。よろしいですか？` | **？ hỏi** | `frm203026.cs:106` `btnF9_Click` | `Q00001` |
| 3 | 13 | `会計処理後、請求金額が増えています。` | **？ hỏi** Yes/No | `INP/Lib/modAcc.cs:581` | **mặc định No** (`Button2`) |
| 3 | 14 | `会計処理後、医療保険の請求金額が…` | **？ hỏi** Yes/No | `INP/Lib/modAcc.cs:733` | **mặc định Yes** (`Button1`) |
| 4 | 1 | `W00100` | **⚠ vàng** | `ShowWarningMsg("W00100", …)` | comment bên web đã ghi sẵn |
| 4 | 2 | `MsgBoxStyle.Exclamation` | **⚠ vàng** | — | comment bên web đã ghi sẵn |
| 4 | 3 | `NO_MATCHING_TREATMENT_MSG` | **⚠ vàng** | `modMain.cs:280/480/596` | 「該当処置はありません。」 |

### ⚠ Hai hộp thoại kề nhau, NÚT MẶC ĐỊNH KHÁC NHAU

```csharp
modAcc.cs:581  ShowYesNoMsg(string.Empty, "会計処理後、請求金額が増えています。…",
                            MessageBoxDefaultButton.Button2)   // mặc định No
modAcc.cs:733  ShowYesNoMsg(string.Empty, "会計処理後、医療保険の請求金額が増えています。…",
                            MessageBoxDefaultButton.Button1)   // mặc định Yes
```

Đây đúng loại chi tiết đã sai một lần ở `Q00049` (lẽ ra mặc định Cancel, bản web để OK).
Hai câu gần như giống nhau mà con trỏ nằm ở hai nút khác nhau — bản web phải khớp từng cái.

### Một hộp XÁC NHẬN KHÔNG CÓ ICON

```csharp
modAcc.cs:388  Interaction.MsgBox("会計処理を行う日が本日でありません。よろしいですか。",
                                  MsgBoxStyle.OkCancel, "")
```

`OkCancel` là kiểu **nút**, không phải icon — không style icon nào ⇒ MessageBox hiện
**không icon và không kêu tiếng nào**. Bản web luôn ra ？ xanh, nên đây là chênh lệch
thứ hai mà primitive chưa diễn tả được (cùng loại với 「hộp hỏi màu vàng」).

### Còn lại chưa tra được — 6 chỗ

`1.#11` · `1.#27` · `2.#25` · `3.#5` · `3.#11` · `3.#17` · `3.#18` — chuỗi ghép lúc chạy
hoặc bản web tự thêm; không có câu tương ứng trong 1787 chỗ gọi của WinForm.
