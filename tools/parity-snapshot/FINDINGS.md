# Parity 診療入力 (frm203002) — lệch WinForm ↔ web

Đo bằng bộ so sánh snapshot (`tools/parity-snapshot/`): cùng một thao tác chạy trên WinForm
(FlaUI) và web (Playwright), chụp header + lưới + phím F + hộp thoại, rồi diff.

- Bệnh nhân / ngày: **3948 @ 2026-06-28** (TRNTRN khớp từng dòng giữa SQL Server và Postgres
  sau migrate 2026-10-05). Mở bằng 閲覧/変更, KHÔNG bấm F9 ⇒ không ghi DB.
- Chạy lại một kịch bản (cả hai bên + diff): `tools/parity-snapshot/run-case.sh <Case>`.
- Bằng chứng: `capture-results/parity-snapshot/{winform,web}-<case>-3948-2026-06-28.json`.
- Không tính là lệch: dòng 日計 `[負担金 N円]` vs `【負担金 N,NNN円】` (CÓ CHỦ Ý — `INTENTIONAL`
  trong `diff.mjs`); F8 `会計` vs `会計データ作成` (cấu hình máy — `AccButton`).

## Thang mức độ

| Mức | Nghĩa |
|---|---|
| 🔴 **S1 Nghiêm trọng** | Sai tiền, hoặc dữ liệu LƯU XUỐNG khác WinForm (ảnh hưởng 会計 / レセプト) |
| 🟠 **S2 Cao** | Thiếu / thừa bước nghiệp vụ (dòng, hộp thoại, cảnh báo) nhưng chưa chắc làm sai dữ liệu lưu |
| 🟡 **S3 Trung bình** | Khác hành vi / thời điểm hiển thị, kết quả cuối giống nhau |
| ⚪ **S4 Thấp** | Nhãn, định dạng, chi tiết hiển thị |

## Tổng hợp

| Mã | Mức | Tóm tắt |
|---|---|---|
| P-001 | ✅ S1 | **Đã sửa** (7a3c58067) — 【負担金】 ngày có 2 lần khám: WinForm làm tròn từng lần (53,210円), web làm tròn một lần (53,200円) |
| P-013 | ✅ S1 | **Đã sửa** (02e87fb38, 2026-10-06) — 日付変更 (sửa ô 日 của 1 dòng): web dời CẢ NGÀY sang ngày mới (+ 負担金 0円, dư dòng 日計 0点); WinForm chỉ dời đúng dòng đó |
| P-015 | ✅ S1 | **Đã sửa** (5905e02f7) — 病名選択: ô 選択番号 có sẵn 「1」 mà KHÔNG bôi đen — gõ 「2」 thành 「12」 ⇒ chọn nhầm 病名 dòng 12; WinForm SelectAll nên gõ là thay |
| P-010 | ✅ S2 | **Đã sửa** (8a047326b) — Nút レセプト: web LUÔN hỏi 「処置データは変更されています。保存しますか？」 kể cả khi không sửa gì, và はい KHÔNG lưu (chỉ in) |
| P-011 | ⏸ S2 | **Ngoài phạm vi** (dính OQS, khách chưa yêu cầu) — Shift+F5 処方: WinForm mở màn 処方 (kê đơn), web báo 「この機能は開発中です。」 |
| P-007 | ⏸ S2 | **Ngoài phạm vi** (dính OQS, khách chưa yêu cầu) — F2 資格確認 chưa làm trên web (「この機能は開発中です。」) |
| P-008 | ✅ | **Đã sửa** (925a0ff49) — F3 チェック: câu lỗi 「１初診内に 1530-0 ___ 等の算定が必要です」 web thiếu tên 処置 (PZ(4/5・FCK)) |
| P-002 | ➖ S3 | **Không cần sửa** (user 2026-10-06: chỉ cần ra đúng hộp thoại, không xét thời điểm) — Web cập nhật 合計 / 日計 TRƯỚC WinForm: (a) 個別 chọn xong chưa Enter 回; (b) sửa 回 bung cảnh báo 算定限度 — WinForm đợi đóng cảnh báo |
| P-012 | ✅ | **Đã sửa** (c948a4784 + 3e81861ca + 83f4fa069) — Chuột phải vào dòng 日計: WinForm bung menu đầy đủ (メニュー…行追加/行削除), web KHÔNG bung menu |
| P-003 | ✅ | **Đã sửa** (c544af950 + 95dcfb484) — Ô 点 còn mã vừa gõ khi 処置選択 mở (WinForm) / trống (web) |
| P-004 | ✅ | **Đã sửa** (f0babc837 — đúng ra là `№` (Designer), bộ đo NFKC thành "No") — Tiêu đề cột tab ガイド / パック: `No` vs `No.` |
| P-009 | ✅ | **Đã sửa** (8011e992d) — Shift+F4 (không có STEP ガイド): WinForm giữ danh sách ガイド cũ, web xoá trống danh sách |
| P-014 | ✅ | **Đã sửa** (a0374edda) — 履歴 → 日付を指定: tiêu đề hộp chọn tháng `日付入力` (WinForm) vs `日付を指定` (web) |
| P-006 | ✅ | **Đã sửa** (a0374edda) — Hộp xác nhận xoá 部位病名行: tiêu đề `確認` (WinForm) vs `お茶コン` (web) |
| P-018 | ✅ S1 | **Đã sửa** (ae9b078d0) — Phase B — web lưu dòng 摘要コメント / 加算 / IS KHÔNG có 部位/病名 (WinForm luôn kèm theo nhóm). Nặng: F9 KHÔNG sửa gì cũng XOÁ 部位/病名 của dòng コメント cũ đã đúng |
| P-021 | ✅ S4 | **Đã sửa** (beb8dee82) — Phase B (cột không ai đọc) — 3 会計データ作成: dòng UNPAID web ghi `rece_kbn = 0`, `acc_tm = giờ hiện tại`; WinForm `rece_kbn = 1`, `acc_tm` rỗng (1900-01-01) |
| P-019 | ➖ S3 | **Không sửa** (user 2026-10-06: web đúng nghiệp vụ hơn — ngày 27 có nội dung mới nên phải chờ in; WinForm sót cờ pChgTrt ở đường sửa ô 日) — Phase B — F9 sau khi sửa ô 日 dòng đầu ngày (28→27): web thêm NCULT (カルテ待ち) ngày 27, WinForm không |
| P-020 | ➖ S4 | **Không sửa** (user 2026-10-07) — Phase B — sau 日付変更 dời cả ngày 28 (= 処置日 đang mở) rồi mở lại: web hiện thêm dòng 「28 【負担金 0円】【日計 0点】」, WinForm không |
| P-022 | ➖ S4 | **Không sửa** (user 2026-10-07) — 日付変更: WinForm chuột phải cột 日 bung menu 1 mục 「日付変更」 rồi mới mở hộp; hộp ghi 「28日の処置データの日付を一括変更します。」 + 「新しい日付：」. Web mở thẳng hộp, nhãn 「元の日 / 新しい日」 |
| P-023 | ➖ S4 | **Không sửa** (user 2026-10-06) — Nhóm 1 — bệnh nhân KHÔNG có tháng lịch sử hiển thị (18269, 18277): web vẫn vẽ dòng tiêu đề tháng hiện hành 「R 07年12月」 đầu lưới; WinForm chỉ vẽ nó khi có tháng lịch sử phía trên |
| P-024 | ✅ S4 | **Đã sửa** (3a3c2a737) — Nhóm 1 — F8 / 「3 会計データ作成」 khi 会計前チェック有り mà KHÔNG có lỗi: WinForm hiện I00100 「エラーはありません。」 rồi đi tiếp; web đi tiếp không hiện gì |
| P-025 | ➖ S2 | **Không sửa** (user 2026-10-06: web thụt dòng bằng CSS là đúng thiết kế) — Nhóm 1 — dòng thuốc nhiều dòng: web lưu `dsp_trt` nối dòng bằng `LF`; WinForm (và toàn bộ 1.522 dòng dữ liệu thật) dùng `CRLF + 2 dấu cách` ⇒ mỗi lần web F9 (kể cả không sửa) viết lại khác định dạng |
| P-027 | ✅ S3 | **Đã sửa** (57e3c3ffd + e22a728e3 + 63da656dc) — Nhóm 1 — tháng có 2 nhánh bảo hiểm: チェック của web báo sai 「…歯科初診料を算定していますが、診療開始日(11/12)と異なります」 (dùng 1 med_st_dt chung cho cả tháng); WinForm dùng med_st_dt của từng dòng ⇒ không lỗi |
| P-026 | ✅ S3 | **Đã sửa** (65bfc5451) — Nhóm 1 — tháng đổi nhánh bảo hiểm: WinForm chèn dòng 「保険切替 (2) / 切替日：令01/11/7」 tại chỗ đổi nhánh; web không có |
| P-017 | ✅ | **Đã sửa** (a0374edda) — Hộp 「処置データは変更されています。保存しますか？」 (F8 / レセプト): nút WinForm `はい / いいえ / キャンセル`, web `Yes / No / Cancel` |
| P-016 | ✅ | **Đã sửa** (a65edca43) — Sửa ô 日 dòng đầu ngày: dòng kế WinForm hiện số `28`, web để trống (web hiện ngày mới màu cam ở dòng đã sửa) |

---

## P-001 🔴 S1 — 【負担金】 của ngày lệch 10円 khi ngày có 2 lần khám

| | |
|---|---|
| Mức độ | 🔴 **S1 — sai tiền hiển thị** (số này cũng là thứ 入金/会計 đối chiếu) |
| Kịch bản | `CodeEntryCommit`, `KobeCommit` (cũng thấy ở `KobeSelect`) |
| Trạng thái | ✅ **Đã sửa** — nhánh `fix/inp-parity-s1` commits 7a3c58067 + 8f9582522 (giữ số cũ khi đang tính lại). Dòng 日計 gửi kèm lưới tháng, BE (`RecomputeCopaymentHandler`) bỏ `ScoreOverride` khi 来院回数 0 + có lưới ⇒ làm tròn theo từng 来院回数. Đo lại 2026-10-06: `CodeEntryCommit` KHỚP HOÀN TOÀN (53,210円) |

**Tái hiện (tay)** — giống nhau trên hai bên:
1. Mở 診療入力 bệnh nhân 3948, ngày 2026-06-28 (閲覧/変更). Ngày 28 đã có 22 dòng, 日計 17,675点,
   【負担金】 53,030円.
2. Chuyển 入力モード sang **コード**.
3. Bấm ô 点 của dòng 日計 (ô vàng cuối ngày 28), gõ `110`, Enter.
4. Ở 処置選択 chọn **110-0 歯科再診料 (59点)** → F9 確定.
5. Ô 回 đang nhập sẵn `1` → Enter.

**Kết quả**

| | 日計 | 【負担金】 |
|---|---|---|
| WinForm | 17,734点 | **53,210円** |
| Web | 17,734点 | **53,200円** |

**Nguyên nhân (source)**
- WinForm `INP/Lib/modAcc.cs:132-212` `DispDayPoint`: cộng `payData.ins_copayment_round`
  của TỪNG `payData` trong ngày. `payData` tách theo `trt_dt` + `visits_no` (来院回数)
  (`COMMON/Lib/buiPrice.cs:233-250`), mỗi cái làm tròn 10円 riêng:
  17,675点 → 53,025 → **53,030** + 59点 → 177 → **180** = **53,210円**.
- Web `features/treatments/components/treatment-entry-detail.tsx:3173-3188`: gửi
  `customInsScore = dayTotal` (cả ngày) với `raiinCnt = WHOLE_DAY_RAIIN_CNT (0)` ⇒ BE làm tròn
  MỘT lần: 17,734 → 53,202 → **53,200円**.
- Suy luận: 再診 vừa nhập mở 来院回数 thứ 2 trong ngày ở WinForm (`hfgRaiinCnt`), nên ngày có
  2 `payData`. Cần kiểm: đọc cột ẩn 71 (来院回数) của dòng mới ở WinForm, hoặc lưu rồi xem
  `trn_trn.raiin_cnt`.

**Ảnh hưởng**: mọi ngày có ≥ 2 lần khám (hoặc ≥ 2 nhánh làm tròn) — số tiền ở dòng 日計 trên
lưới web lệch số WinForm vài chục yên.

---

## P-010 🟠 S2 — Nút レセプト: hỏi 「保存しますか？」 sai lúc, và はい không lưu

| | |
|---|---|
| Mức độ | 🟠 **S2** — hộp thoại sai điều kiện + nút はい không làm điều nó hỏi. Nếu đang có sửa đổi chưa lưu: người dùng trả lời 「はい (lưu)」 nhưng KHÔNG có gì được lưu và bản xem レセプト không có sửa đổi đó |
| Kịch bản | `BtnReceipt` (ảnh: WinForm `01_BtnReceipt_Passed_*.png`, web `scratchpad/shots/web-receipt.png`) |
| Trạng thái | ✅ **Đã sửa** — commit 8a047326b: dùng chung hộp 3 nút của F8, CHỈ hỏi khi lưới có sửa đổi; はい = lưu rồi in, いいえ = trả lưới về bản đã lưu rồi in, キャンセル = dừng; tháng < 2018-04 ⇒ W00100. E2e `web-tenant-tests/tests/fkey-menu/treatment-receipt-save-gate.spec.ts` (5 TC, đỏ trước khi sửa, xanh sau). Còn P-017 (nhãn nút) |

**Tái hiện (tay)**:
1. Mở 3948 @ 2026-06-28, KHÔNG sửa gì.
2. Bấm nút **レセプト** (dưới lưới).

| | kết quả |
|---|---|
| WinForm | mở thẳng màn xem 診療報酬明細書 (Crystal Reports viewer, cửa sổ không tiêu đề) |
| Web | hộp 「処置データ確認 — 処置データは変更されています。保存しますか？」, nút **キャンセル / はい** |

**Nguyên nhân**
- WinForm `INP/Forms/frm203002.cs` `btnReceipt_Click`: `ModSave.ExitWithoutSaving(DialogResult.Yes)`
  — chỉ hỏi khi `ChkChangedTrnData` thấy có thay đổi (`modSave.cs:160`); hỏi thì có はい (lưu rồi in)
  / いいえ (bỏ sửa đổi rồi in) / キャンセル. Không đổi gì ⇒ in luôn (`CommonPrint.directPrint`).
- Web `features/treatments/components/treatment-entry-detail.tsx:7644`
  `onReceiptClick={() => setReceiptConfirmationOpen(true)}` — mở hộp hỏi VÔ ĐIỀU KIỆN; `onConfirm`
  (`:7969-7972`) chỉ gọi `handlePrintRezept` (`:1612-…`) — dựng レセプト từ dữ liệu ĐÃ LƯU, không lưu.
- Thiếu nút いいえ.
- WinForm còn chặn 診療年月 < 2018-04 bằng W00100 「診療年月が平成３０年３月以前のレセプトは表示できません。」 —
  chưa kiểm web có chặn không.

---

## P-011 🟠 S2 — Shift+F5 処方 chưa nối trên web

| | |
|---|---|
| Mức độ | 🟠 S2 — thiếu đường vào chức năng (web có module 処方箋 riêng nhưng phím tắt từ 診療入力 chưa nối) |
| Kịch bản | `ShiftF5` (ảnh WinForm: `01_ShiftF5_*.png`) |
| Trạng thái | Đo được |

**Tái hiện**: mở 3948 @ 2026-06-28 → bấm ô 療法・処置 của 歯科疾患管理料 → **Shift+F5**.

| | kết quả |
|---|---|
| WinForm | mở màn **処方** (院内処方 / 院外処方, danh sách 薬剤名 メイアクトMS錠100mg4T…) — nhãn phím là 「処方」 hay 「処方箋」 tuỳ `RXScreenUse` (frm203002.cs:127) |
| Web | hộp 「開発中 — この機能は開発中です。」 |

WinForm đi qua `ModSave.ExitWithoutSaving` trước khi mở (frm203002.cs:4539) — khi nối trên web cần
giữ bước hỏi lưu đó (chỉ khi có thay đổi, xem P-010).

---

## P-007 🟠 S2 — F2 資格確認 chưa có trên web

| | |
|---|---|
| Mức độ | 🟠 S2 — thiếu chức năng (đã biết: web cố ý báo 「開発中」) |
| Kịch bản | `FkeyF2` (tên file: `fkey-f2`) |
| Trạng thái | Đo được |

**Tái hiện**: mở 3948 @ 2026-06-28 → bấm ô 療法・処置 của 歯科疾患管理料 → **F2**.

| | kết quả |
|---|---|
| WinForm | chạy 資格確認 (OQS) thật. Trên máy test ra 「システムエラーです。Could not find a part of the path 'C:\hpkicardless-clientadapter-server\req\OQSsiquc01req_….xml'」 — lỗi MÔI TRƯỜNG (máy test không có adapter), không phải lỗi WinForm |
| Web | hộp 「開発中 — この機能は開発中です。」 (`treatment-entry-detail.tsx` F2 → `notifyUnderDevelopment`) |

---

## P-008 🟡 S3 — F3 チェック: câu lỗi thiếu tên 処置 bắt buộc (mã 1530-0)

| | |
|---|---|
| Mức độ | 🟡 S3 — thông tin trong câu cảnh báo bị thiếu (số lỗi + các câu khác khớp) |
| Kịch bản | `FkeyF3` (tên file: `fkey-f3`) |
| Trạng thái | Đo được; nguyên nhân thiếu tên chưa kiểm |

**Tái hiện**: mở 3948 @ 2026-06-28 → bấm ô 療法・処置 của 歯科疾患管理料 → **F3** → panel
処置データチェック (cả hai: エラー 5件) → đọc câu thứ 2.

| | câu thứ 2 |
|---|---|
| WinForm | 06/28 254-4 FMCset(12%金ﾊﾟﾗ･大臼)を算定していますが、１初診内に 1530-0 **PZ(4/5・FCK)** 等の算定が必要です。 |
| Web | 06/28 254-4 FMCset(12%金ﾊﾟﾗ･大臼)を算定していますが、１初診内に 1530-0 等の算定が必要です。 |

- Web `apps/api/src/Ochacom.Application/Treatments/Check/Rules/Chk9_12CmnRule.cs:252-254`
  (`BuildMessage`): `candidateNames.TryGetValue((1530, 0))` không ra ⇒ chèn chuỗi rỗng.
- Các câu khác có mã (vd 241-2 咬合(Br～5)) web vẫn có tên ⇒ nghi chỗ dựng `candidateNames`
  bỏ sót mã 4 chữ số / bản master khác. Cần kiểm nguồn `candidateNames`.

---

## P-012 🟡 S3 — Chuột phải vào dòng 日計 không bung menu trên web

| | |
|---|---|
| Mức độ | 🟡 S3 — thiếu đường thao tác (F11 vẫn mở được cùng menu) |
| Kịch bản | `RowMenuNikkei` (đối chứng `RowMenuTrt`, `RowMenuBui` — khớp hoàn toàn) |
| Trạng thái | Đo được |

**Tái hiện**: mở 3948 @ 2026-06-28 → **chuột phải** vào dòng 【負担金…】【日計…】 của ngày 28.

| | menu |
|---|---|
| WinForm | 1 メニュー … 9 オプション, 行追加, 行削除 (giống dòng 処置) |
| Web | không có menu |

Trên dòng 処置 và 部位病名行, menu hai bên khớp (không có コピー / 貼り付け ở cả hai — đúng luật hiện/ẩn
sticky của WinForm).

---

## P-002 🟡 S3 — Header 合計 và dòng 日計 cập nhật SỚM hơn WinForm khi chọn từ 個別

| | |
|---|---|
| Mức độ | 🟡 S3 — khác thời điểm hiển thị, không sai số cuối |
| Kịch bản | `KobeSelect` |
| Trạng thái | Đo được |

**Tái hiện (tay)**:
1. Mở 3948 @ 2026-06-28.
2. Tab **個別** → ô ｺｰﾄﾞ gõ `110` → 検索.
3. Ô 選択№ gõ `1` → Enter (chèn 110-0 歯科再診料; con trỏ đang ở ô 回, CHƯA Enter).

**Kết quả**

| | header 合計 | dòng 日計 |
|---|---|---|
| WinForm | vẫn **17,675点** | dòng mới nằm ở chỗ dòng 日計, **chưa có dòng 日計** |
| Web | **17,734点** ngay | có ngay 【負担金 53,200円】【日計 17,734点】 |

(b) `EditKai`: sửa 回 của 歯科疾患管理料 1 → 2 ⇒ cả hai bung 「06/28 116-7 歯科疾患管理料を算定していますが、当月の算定限度（1回）を超えています。」;
trong lúc hộp đó mở WinForm vẫn 17,675点 / 53,030円, web đã 17,765点 / 53,300円.

WinForm chỉ chạy `modAcc.Calc_MDPoint` / `DispDayPoint` sau khi Enter ô 回 (frm203002.cs, nhánh
Enter của ô 回); web tính lại tổng từ `currentRows` mỗi lần render. Sau khi Enter ô 回 hai bên
mới cùng con số (xem P-001 cho phần tiền).

---

## P-003 ⚪ S4 — Ô 点 còn giữ mã vừa gõ trong lúc 処置選択 đang mở

| | |
|---|---|
| Mức độ | ⚪ S4 — hiển thị |
| Kịch bản | `CodeEntryPicker` |
| Trạng thái | Đo được |

**Tái hiện (tay)**: mở 3948 @ 2026-06-28 → コードモード → ô 点 của dòng 日計 gõ `110` → Enter
→ NHÌN ô 点 khi 処置選択 còn mở.

| | ô 点 của dòng 日計 |
|---|---|
| WinForm | `110` |
| Web | trống |

WinForm giữ mã đã gõ trong ô (xem ghi chú 力技 ở ô 点 — mã nằm sẵn trong cột 点 cho tới khi chốt
hoặc huỷ); web xoá input trước khi tra cứu.

---

## P-004 ⚪ S4 — Tiêu đề cột số thứ tự ở tab ガイド / パック: `No` vs `No.`

| | |
|---|---|
| Mức độ | ⚪ S4 — nhãn |
| Kịch bản | `PanelGuide`, `PanelPack` |
| Trạng thái | Đo được |

**Tái hiện**: mở 3948 @ 2026-06-28 → bấm tab ガイド (hoặc パック) → đọc tiêu đề cột đầu.

| | tiêu đề |
|---|---|
| WinForm | `No` |
| Web | `No.` — `treatment-side-panel.tsx:194` (`GUID_HEADER`), `:199` (`PACK_HEADER`) |

Tab 病検 hai bên cùng `No` (`treatment-side-panel.tsx:188`).

---

## P-013 🔴 S1 — 日付変更 trên lưới: web dời cả ngày, WinForm chỉ dời một dòng

| | |
|---|---|
| Mức độ | 🔴 **S1** — F9 sẽ lưu ngày điều trị KHÁC WinForm cho cả nhóm dòng; 【負担金】 hiện 0円 |
| Kịch bản | `EditDay` |
| Trạng thái | ✅ **Đã sửa** — commit 02e87fb38. Nguyên nhân thật (đọc source): WinForm `frm203002.cs:5373-5377` chỉ TÁCH ngày khi dòng phía trên cùng ngày; dòng ĐẦU ngày (trên là 日計/切換/空/過去月) chỉ đổi 処置日 của đúng dòng đó, không tính lại 日計. Web đã đưa trường hợp này sang đường 保留 `pendingDay`. Đo lại: 負担金 khớp 53,030円; còn lệch hiển thị nhãn ngày dòng kế → P-016 (S4) |

**Tái hiện (tay)**:
1. Mở 3948 @ 2026-06-28.
2. Ô **日** của dòng đầu ngày 28 tháng 06 (歯科再診料, 59点) → gõ `27` → Enter.
3. Nhìn các dòng ngày 28 bên dưới và các dòng 日計.

| | dòng 歯科再診料 | các dòng còn lại của ngày 28 | dòng 日計 |
|---|---|---|---|
| WinForm | **27** | vẫn **28** (dòng kế hiện số 28) | một dòng: 【負担金 53,030円】【日計 17,675点】 |
| Web | **27** | không còn nhãn 28 — cả nhóm coi như sang 27 | 【負担金 **0円**】【日計 17,675点】 rồi THÊM 「28 【負担金 0円】【日計 0点】」 |

**Nguyên nhân (web, suy luận)**: `treatment-entry-detail.tsx` dùng `dayRemap` — ánh xạ THEO NGÀY
(`dayRemap[r.day]`, xem khối tính tổng :3152-3168 「日付変更 (dayRemap) moves a row's score onto its new
day」) ⇒ đổi 日 của một dòng biến thành đổi ngày cho MỌI dòng có cùng 日. WinForm giữ 処置日 theo
TỪNG dòng (cột ẩn 78 `strDate`). 負担金 0円: recompute 当日 không tìm thấy dòng nào của ngày 28 nữa.

**Cần kiểm thêm**: WinForm khi F9 có tách dòng 27 thành ngày riêng (2 lần khám) — Phase B.

---

## P-015 🔴 S1 — 病名選択: ô 選択番号 không bôi đen sẵn ⇒ gõ số bị NỐI vào số cũ

| | |
|---|---|
| Mức độ | 🔴 **S1** — nhập bằng bàn phím ra 病名 SAI mà không báo (gõ 「2」 muốn Ｐ ⇒ 「12」 ⇒ MT(床裏装)); hoặc không chọn được gì (「11」…) |
| Kịch bản | `BuiCommit` (+ probe đọc selection của ô) |
| Trạng thái | ✅ **Đã sửa** — commit 5905e02f7. Đo lại 2026-10-06 (spec web đã bỏ Ctrl+A, gõ thẳng): `BuiCommit` KHỚP HOÀN TOÀN |

**Tái hiện (tay)**:
1. Mở 3948 @ 2026-06-28 → ô 部位 của dòng 日計 → Enter ⇒ 部位選択.
2. Bàn phím: Delete → → → 1 → End ⇒ 病名選択 mở (danh sách 1 Ｃ, 2 Ｐ, 3 Ｐer, …, 12 MT(床裏装)).
3. KHÔNG bấm chuột — gõ `2` rồi Enter.

| | ô 選択番号 khi mở | sau khi gõ 「2」 | Enter |
|---|---|---|---|
| WinForm | 「1」 **bôi đen hết** | 「2」 | vào danh sách 枝番 của Ｐ |
| Web | 「1」, con trỏ ở CUỐI, không bôi đen (selectionStart = selectionEnd = 1) | **「12」** | chọn dòng 12 MT(床裏装) |

(Đo với gõ 「1」: WinForm vào danh sách 枝番 của 100 Ｃ — 100-1 C … 100-8 Co; web thành 「11」 và
không vào đâu.)

- WinForm `COMMON/Forms/frm902007.cs:563-565` `txtNo_Enter` → `txtNo.SelectAll()`; `:902-905` khi đổi
  dòng chọn cũng `txtNo.SelectAll()`.
- Web `features/treatments/components/disease-selection-dialog.tsx:148` — ô 選択番号 được focus lúc
  mở nhưng không chọn hết chữ.
- Nên rà các ô 選択№ khác (panel phải 病検 / ガイド / パック / 個別, 処置選択…) — WinForm hay
  `SelectAll()` khi vào ô.

---

---|
| Mức độ | 🔴 **S1** — thiếu dòng 摘要コメント 704-0 ⇒ nếu F9 thì dữ liệu lưu thiếu dòng, レセプト thiếu 摘要 |
| Kịch bản | `KobeCommit` (đối chứng: `CodeEntryCommit` — đường gõ mã thì web CÓ sinh) |
| Trạng thái | Đo được trên cả hai đường. Nguyên nhân ở web là **giả thuyết, chưa kiểm** |

**Tái hiện (tay)**:
1. Mở 3948 @ 2026-06-28 (ngày 28 đã có 歯科再診料 110-0).
2. Tab **個別** → ô ｺｰﾄﾞ gõ `110` → 検索 → ô 選択№ gõ `1` → Enter (chèn 110-0 歯科再診料).
3. Ô 回 đang nhập sẵn `1` → **Enter**.
4. Nhìn các dòng ngay dưới 歯科再診料 vừa chèn.

**Kết quả**

| | dòng dưới 歯科再診料 mới |
|---|---|
| WinForm | **1日2度来院** (0点, 回 1), rồi dòng 日計 |
| Web | KHÔNG có — thẳng xuống dòng 日計 |

Đối chứng — cùng thao tác nhưng GÕ MÃ ở ô 点 (`CodeEntryCommit`, P-001 bước 1-5): web CÓ thêm
「１日２度来院」 giống WinForm.

**Nguyên nhân**
- WinForm: nhánh Enter ô 回 (frm203002.cs case 4, :5738-5762) gọi `ModMain.Chk_CMT704`
  (modMain.cs:2015) khi `cod == 100 || cod == 110` và 回数 ≥ 1 — cho MỌI đường chèn (gõ mã, 個別,
  …) vì tất cả đều chốt bằng Enter ô 回.
- Web: `runChkCmt704` chỉ được gọi trong `runCountEnterTail`
  (`treatment-entry-detail.tsx:5763-5788`). Giả thuyết: dòng chèn từ 個別 đặt con trỏ vào ô 回
  của dòng ĐÃ có trong lưới ở chế độ sửa, và Enter ở đó đi đường sửa ô thường (không qua
  `runCountEnterTail`) — cần kiểm đường commit ô 回 của dòng 個別 (`handleKobetuPicks` →
  sửa ô 回 → Enter). Các thứ cùng nằm trong `runCountEnterTail` (`Chk_CmtAuto` cascade,
  `Chk_ChkAuto` 自動算定) nhiều khả năng cũng bị bỏ qua trên đường 個別 — nên kiểm luôn.

---

## P-009 ⚪ S4 — Shift+F4 khi không có STEP ガイド: danh sách bên phải

| | |
|---|---|
| Mức độ | ⚪ S4 — hiển thị panel trong lúc báo lỗi |
| Kịch bản | `ShiftF4` (tên file `shift-f4`) |
| Trạng thái | Đo được (ảnh WinForm: `01_ShiftF4_Passed_*.png`) |

**Tái hiện**: mở 3948 @ 2026-06-28 → bấm ô 療法・処置 của 歯科疾患管理料 → **Shift+F4**.

| | hộp thoại | danh sách tab ガイド |
|---|---|---|
| WinForm | 「該当ガイドがありません。」 (お茶コン, icon ✖) | giữ danh sách 通常 cũ (検査(Br), TFix imp・BT, …) |
| Web | 「該当ガイドがありません。」 | **trống** |

Hộp thoại khớp. Ghi chú đo: trong lúc hộp thoại mở, thanh phím WinForm kẹt ở lớp Shift (key-up
rơi vào hộp thoại) — trạng thái tạm, không tính.

---

## P-006 ⚪ S4 — Tiêu đề hộp xác nhận khi xoá 部位病名行

| | |
|---|---|
| Mức độ | ⚪ S4 — nhãn hộp thoại (nội dung câu hỏi khớp) |
| Kịch bản | `RowDeleteBui` |
| Trạng thái | Đo được |

**Tái hiện (tay)**: mở 3948 @ 2026-06-28 → bấm ô 療法・処置 của dòng 部位病名 「ＭＴ（Ｂｒ）」 của
tháng 06 → phím **Delete** → nhìn hộp thoại.

| | tiêu đề | nội dung |
|---|---|---|
| WinForm | **確認** (kèm icon ⚠ Exclamation) | 同一部位の処置を全て削除します。よろしいですか？ |
| Web | **お茶コン** (tiêu đề mặc định) | như trên |

- WinForm `INP/Forms/frm203002.cs:3862-3863`: `MsgBox(…, YesNo | Exclamation, "確認")`.
- Web `features/treatments/components/treatment-entry-detail.tsx:3723`: `confirmDialog(…)` không
  truyền `title` ⇒ `DEFAULT_DIALOG_TITLE`. Icon chưa đo (bộ so chỉ so chữ).
- Nên rà các `confirmDialog` / `alertDialog` khác của màn này: WinForm thường truyền tiêu đề
  riêng (「確認」「エラー」…), web hay để mặc định.

---

## Đã khớp hoàn toàn

| Kịch bản | Nội dung |
|---|---|
| `Open` | header (患者番号/処置年月/合計/実日数), lưới 36 dòng 2 tháng, F1–F12 |
| `PanelByou`, `PanelKobe` | tab + tiêu đề cột + 12 dòng đầu |
| `PanelGuide`, `PanelPack` | 12 dòng đầu (chỉ lệch nhãn cột — P-004) |
| `CodeEntryPicker` | 処置選択: tiêu đề, cột, 2 dòng 110-0 / 110-1 (trừ P-003) |
| `CodeEntryCommit` | lưới sau khi chốt, không bên nào bung hộp thoại (trừ P-001) |
| `PointEntryPicker` | 点数モード gõ 59 ⇒ 処置選択 6 dòng giống nhau |
| `GuideSelect` | ガイド処置選択: cột, 12 dòng, cả 回数 |
| `PackSelect` | パック №1 ⇒ cả hai bung 「算定可能な処置はありません。」 |
| `BuiDialog` | Enter ô 部位 dòng 日計 ⇒ 部位選択 mở, lưới không đổi |
| `RowInsert` | Insert trên dòng 処置 ⇒ chèn dòng trống |
| `RowDeleteTrt` | Delete trên dòng 処置 ⇒ xoá, 合計 −90 |
| `RowDeleteBui` | Delete trên 部位病名行 ⇒ cùng câu hỏi xác nhận (chỉ lệch tiêu đề — P-006) |
| `RowDeleteNikkei` | Delete trên dòng 日計 ⇒ từ chối, im lặng |
| `RowInsertNikkei` | Insert trên dòng 日計 ⇒ chèn được |
| `FkeyF1` | F1 ⇒ tab 病検 |
| `FkeyF4`, `FkeyF5` | F4 ⇒ tab ガイド (danh sách 通常), F5 ⇒ tab パック — 12 dòng khớp (chỉ P-004) |
| `FkeyF6` | F6 ⇒ カルテ記載選択 |
| `FkeyF7` | F7 ⇒ không bung hộp thoại, lưới không đổi (cả hai) |
| `FkeyF3` | F3 ⇒ エラー 5件, 4/5 câu khớp (câu 2 — P-008) |
| `ShiftF2` | Shift+F2 検索 ⇒ tab 個別 |
| `ShiftF6` | Shift+F6 ⇒ 薬剤選択, cột + 12 dòng thuốc đầu khớp |
| `ShiftF9`, `ShiftF10` | Shift+F9 / F10 ⇒ 入力モード 点数 / コード |
| `BtnSikan`, `BtnSidou`, `BtnHokan`, `BtnHotetu` | 歯管 / 指導文書 / 補管・義歯 / 補管(&H) ⇒ mở đúng màn cùng tiêu đề (歯科疾患管理, 実地指１・訪衛指, クラウン・ブリッジ維持管理・義歯管理, 補綴管理) |
| `ShiftF3` | Shift+F3 ⇒ 紹介状 |
| `ShiftF7` | Shift+F7 ⇒ 電子カルテ情報共有サービス (WinForm xác nhận bằng ảnh — cửa sổ nằm ngoài bộ đọc) |
| `ShiftF11` | Shift+F11 IRS ⇒ cả hai không làm gì |
| `FkeyF12` | F12 ⇒ メインメニュー |
| `HistLast` | 履歴 → 履歴を表示 → 前回来院月 ⇒ panel 履歴 tháng 04, 11 dòng khớp |
| `Hist3Month`, `Hist6Month`, `Hist1Year`, `HistAll`, `HistHide` | 履歴 → 3ヶ月 / 6ヶ月 / 1年 / すべて / 隠す ⇒ panel 履歴 khớp |
| `HistSelect` | 履歴 → 日付を指定 ⇒ hộp chọn tháng (chỉ lệch tiêu đề — P-014) |
| `FkeyF10` | F10 戻る (không sửa) ⇒ cả hai về 診療入力（患者選択）, không hỏi lưu |
| `BuiToDisease` | 部位 → chọn răng 左上1 → End ⇒ 病名選択, 12 dòng đầu khớp |
| `BuiCommit` | … → 病名 1 (Ｃ) → 枝番 1 → End 登録 ⇒ cùng dòng 部位病名 「1 (1) / Ｃ₂」 (gõ thẳng, không Ctrl+A — P-015 đã sửa) |
| `F11Karte` | F11 → カルテ ⇒ カルテ（２号用紙）印刷 |
| `F11OptRestrictDis`, `F11OptChkAuto`, `F11OptAuto`, `F11OptAutoCmt` | F11 → オプション → 必要病名 / 自動算定 / 処置自動入力 / コメント自動入力 ⇒ cùng màn 一覧 |
| `ImgM`, `ImgP`, `ImgI`, `ImgT` | nút Ｍ / Ｐ / Ｉ / Ｔ ⇒ 申し送り事項 / 歯周情報 / 患者注意情報 / 治療情報 |
| `EditTen` | gõ 100 vào ô 点 của dòng có sẵn ⇒ 処置選択 giống nhau |
| `GuideAll` | ガイド → 全て表示 ⇒ 12 dòng khớp (chỉ P-004) |
| `RowMenuTrt`, `RowMenuBui` | chuột phải dòng 処置 / 部位病名 ⇒ cùng danh sách mục |
| `F11Pat`, `F11Exa`, `F11PatInfo` | F11 → 患者登録 / 口腔内情報 / 患者登録(患者選択) ⇒ cùng màn (cùng tiêu đề) |
| `F11OptChkPrm`, `F11OptInpOpt`, `F11OptChkRule`, `F11OptStep` | F11 → オプション → チェック項目設定 / 処置入力設定 / チェックルール登録 / Step ⇒ cùng hộp thoại |
| `BtnJikangai`, `BtnKyuujitu`, `BtnSinya` | 時間外 / 休日 / 深夜 ⇒ cùng dòng 加算, cùng 合計 (17,778 / 17,942 / 18,172点) |

## Đã loại (không phải lệch)
- **P-005 (cũ)** 「chọn 再診 từ 個別 không sinh １日２度来院」 — SAI do đo sớm: web CÓ thêm dòng đó, chỉ sau
  chuỗi check-single → cmt-autos → chk-auto → receipt-comment(704) chạy xong (≈ vài giây sau Enter),
  muộn hơn lúc snapshot `KobeCommit` chụp (networkidle). Kiểm lại 2026-10-06 bằng probe chờ 6s.
- `GuideSelect` cột 回数 web trống — do bộ đọc lấy `innerText` của ô `<input>`; đọc `value` thì khớp.
- `ShiftF6` WinForm 0 dòng — 薬剤選択 có 2 lưới, bộ đọc lấy nhầm lưới 「đã chọn」 (trống).
- `FkeyF3` WinForm 0 câu — lưới grdChek có ô tiêu đề dòng, bộ đọc tưởng là dòng tiêu đề.
- `BtnSikan`… web 「không bung hộp thoại」 — hộp thoại mở sau networkidle; đợi thêm thì có.

## Chưa đo được / chưa đo

| Mục | Lý do |
|---|---|
| Nút ﾚﾝﾄｹﾞﾝ / ﾃﾞﾝﾀ / 画像 | Ẩn ở cả hai bên với cấu hình hiện tại (phụ thuộc thiết lập 連携 của máy) |
| ガイド 前回 / リセット | Chỉ hiện ở chế độ STEP; bệnh nhân 3948 không có STEP ガイド |
| Danh sách dài (個別 ~1.700 dòng, 一覧 master) | Chỉ so 12 dòng đầu / tiêu đề màn — UIA chỉ phơi dòng đang thấy (FLA-UI-GUIDELINE F10) |
| **Phase B — các thao tác GHI DB** | F9 登録, F8 会計 / 会計データ作成 (+入金指定), 転帰 (WinForm `Set_Tenki` ghi DB ngay), lưu 日付変更 (để kiểm P-013 tới cùng), lưu các hộp オプション. Cần bệnh nhân giống nhau ở 2 DB + dọn dữ liệu sau khi chạy |


---

# Phase B — thao tác GHI DB (2026-10-06)

Bệnh nhân nhân bản **993948 ← 3948** trên cả hai DB (`clone-patient.sh`); mỗi kịch bản nhân bản
LẠI rồi chạy (`run-write-case.sh <Case>`): thao tác + F9 ở hai vế → mở lại màn → so màn hình
(`diff.mjs`) + so DỮ LIỆU đã lưu (`db-diff.mjs`: mọi bảng có PAT_NO, ghép bảng/cột theo tên bỏ
「_」). Lệch DB **nền** (có sẵn sau migrate, không do thao tác): `CCTLINE`/`TRTSTATE` chỉ có ở SQL
Server, `insurance.sex2` NULL↔0 — xem `capture-results/parity-snapshot/db-baseline-993948.txt`.

| Kịch bản | Thao tác | Màn sau khi mở lại | Dữ liệu lưu |
|---|---|---|---|
| `SaveNoChange` | F9 không sửa gì | ✅ khớp (câu 「変更されていません」 khớp) | ✅ không đổi |
| `SaveCodeEntry` | gõ 110 → 110-0 → Enter 回 → F9 | ✅ khớp | ❌ **P-018** |
| `SaveEditDay` | ô 日 dòng đầu ngày 28 → 27 → F9 | ✅ khớp (P-013 đúng cả sau lưu) | ✅ TRNTRN khớp; ❌ **P-019** (NCULT) |
| `SaveDateChange` | 日付変更 28→27 (cả ngày) → F9 | ❌ **P-020** | ✅ khớp (22 dòng sang 27) |
| `SaveTenki` | F11 → 7 転帰 → 1 治癒 | ✅ khớp | ✅ `pat_outcome = 1` hai bên |
| `SaveAccData` | F11 → 3 会計データ作成 (nhánh tạo 未精算) | ✅ khớp, chuỗi hộp thoại giống (チェック → 本日でありません → 入金指定 指定なし) | ❌ **P-021** |

**Chưa đo**: F8 会計 (cấu hình F8 hai bên khác nhau — WinForm 会計, web 会計データ作成; nhánh 会計 =
B5 + mở 窓口精算, màn khác); lưu オプション (ghi cấu hình CHUNG của phòng khám — không thuộc bệnh nhân
nhân bản, cần user đồng ý).

## P-018 🔴 S1 — web lưu dòng 摘要コメント / 加算 / IS mất 部位/病名 (kể cả dòng cũ khi F9 không sửa)

**Tái hiện**: `SaveCodeEntry` (993948 @ 2026-06-28): コード gõ 110 → 110-0 → Enter 回 ⇒ sinh 「1日2度来院」
(704-0) ⇒ F9 はい.

| | TRNTRN dòng 704-0 (disp_no 24) |
|---|---|
| WinForm | `dsp_bui` 「6543」, `dis_cd1` 116, `dsp_dis` MT(Br), bui19..22 = 2/1/1/2 |
| Web | `dsp_bui` rỗng, `dis_cd1` 0, bui = 0 |

- WinForm `Chk_CMT704` (modMain.cs:2015) chỉ AddRow + điền 処置; 部位/病名 đi theo nhóm như mọi dòng.
- Web `lib/treatment-grid-rows.ts` `isBuiLessByDesign` (= `isSummaryCommentCd`: 6 / 26 / 700-899) ⇒
  `buildSaveRowsIndexed` bỏ 部位/病名 khỏi MỌI dòng 摘要コメント.
- Dữ liệu WinForm thật (SQL Server, toàn bảng TRNTRN): 704 có 部位/病名 ở **263/270** dòng, 700-899
  **7.934/9.627**, mã 6/26 **101.038/116.574** ⇒ giả định "bui-less by design" sai với phần lớn dữ liệu.
  Cần rà từng đường chèn コメント (CmtAuto, パック, 個別…) xem đường nào WinForm thật sự xoá 部位.
- Ảnh hưởng: TRNTRN lưu khác; レセプト 摘要 có thể thiếu thông tin răng (chưa kiểm).

## P-021 ⚪ S4 — UNPAID: `rece_kbn` / `acc_tm` (không ai đọc)

**Tái hiện**: `SaveAccData`. WinForm: `UnPaidData` mặc định `rece_kbn = 1`, `acc_tm = ""`
(COMMON/DBAccess/UnPaid.cs:93/99); các dòng gán 0 / "" ở `modAcc.cs:509/516` đã bị comment.
Web `InsertUnpaidHandler.BuildUnpaid` (:414/:420) gán `ReceKbn = 0`, `AccTm = UtcNow`.
Ảnh hưởng: 入金区分 / 精算時間 của 未精算 khác ⇒ màn đọc UNPAID (窓口精算, 日計表…) có thể hiểu khác — chưa kiểm.

## P-019 ➖ S3 — NCULT (カルテ待ち) thêm ngày — KHÔNG SỬA (web đúng nghiệp vụ hơn, user chốt 2026-10-06)

**Tái hiện**: `SaveEditDay`. WinForm `Set_NCULT` (modSave.cs:1269) chỉ thêm ngày có `pChgTrt[day]`
(cờ bật theo thao tác trên màn); đường sửa ô 日 dòng đầu ngày không bật cờ cho ngày 27 ⇒ không thêm.
Web `SaveTreatmentsHandler.ApplySetNcultAsync` **cố ý** suy "ngày đổi" từ khác biệt nội dung trước/sau
(comment 「per the project decision」) ⇒ thêm NCULT 27. Muốn khớp tuyệt đối phải gửi cờ đổi-ngày từ FE.

## P-020 ⚪ S4 — dòng 日計 trống của 処置日 sau 日付変更

**Tái hiện**: `SaveDateChange` → màn mở lại (処置日 28, không còn dòng nào ngày 28): web có thêm
「28 【負担金 0円】【日計 0点】」 (`buildDisplayMonth` luôn chèn carrier cho 処置日), WinForm không.
Nguyên nhân phía WinForm (khi nào nó dựng dòng nhập cho 処置日) chưa kiểm.

## P-022 ⚪ S4 — 日付変更: menu + nhãn

WinForm: chuột phải cột 日 ⇒ menu `contextMenuStripDateChg` (1 mục 「日付変更」) ⇒ frm203051
「28日の処置データの日付を一括変更します。」 / 「新しい日付：」. Web `handleDayContextMenu` mở thẳng
`DateChangeDialog`, nhãn 「元の日: 28 日 / 新しい日」.


### Điều tra sâu P-018 (2026-10-06)

1. **Cơ chế WinForm**: `frmInpMain.AddRow` LUÔN gọi `ModMain.AutoBui` (frm203002.cs:3805/3811) — chép
   cột 部位/病名 (8..49, 枝番 55..64, 52/53) của dòng kề sang dòng mới. Mọi đường chèn thêm dòng
   (`Chk_CMT704`, `Kasan`→`AddRow(i+1)`+`ShowTrt`, コメント tự động…) đều đi qua AddRow; `ShowTrt` /
   `Chk_CMT704` chỉ ghi cột 1 (chữ 部位 hiển thị = "") và 処置, KHÔNG đụng cột 8..49.
2. **Dữ liệu thật WinForm (SQL Server, toàn TRNTRN)** — dòng đứng ngay sau một dòng CÓ 部位:
   | mã | mang 部位 | mất 部位 |
   |---|---|---|
   | 摘要コメント 6/26 | 100.845 (+193 khác nhóm) | **0** |
   | 700-899 | 6.970 (+964) | **0** |
   | 704 | 261 (+1) | **0** |
   | 加算 101 / 102 / 104 / 105 | 25 / 27 / 16 / 9 | **0** |
   | mọi mã khác | hàng trăm nghìn | ≤ 13 / mã (lẻ tẻ) |
   Dòng コメント thiếu 部位 chỉ khi dòng trên CŨNG không có ⇒ WinForm không có luật "bui-less".
3. **Web**: `buildSaveRowsIndexed` bỏ 部位/病名 khi `isBuiLessByDesign(trtCd)` (= 6/26/700-899, có từ
   d18f0f55e 2026-06-23 「摘要コメント(700, bui-less 仕様)」) hoặc `row.buiLess` (gán ở `kasan-insert.ts:84`
   cho dòng 加算, `is-input-flow.tsx:179` cho dòng IS 笑気/酸素/全麻). Cả ba giả định đều trái dữ liệu WinForm.
4. **Tái hiện mất dữ liệu cũ** — nhân bản bệnh nhân 9 → 990009, tháng 2026-07 (dòng 9-11: 316 補綴前処置 +
   2 dòng 6-0 コメント, cùng 部位 7654321|1234567 / 病名 393 MT). `run-write-case.sh SaveNoChange 9 990009
   2026-07-01` (F9 không sửa gì): WinForm giữ nguyên; web ghi lại 2 dòng 6-0 với 部位 = 0, `dis_cd1` 0,
   `dsp_bui`/`dsp_dis` rỗng. Màn hình sau khi mở lại hai bên VẪN KHỚP ⇒ không ai thấy.
5. **Ảnh hưởng**: mất 部位/病名 trên TRNTRN của MỌI tháng có コメント/加算 mỗi lần lưu bằng web; レセプト
   web hiện dùng datasource mẫu nên chưa đo được ảnh hưởng in; các logic tìm コメント theo 部位 (CmtAuto…)
   có thể hiểu khác — chưa kiểm.
6. **Hướng sửa (chưa làm)**: bỏ `isBuiLessByDesign` và cờ `buiLess` ở 2 chỗ gán — mọi dòng 処置 nhận
   部位病名 của nhóm như WinForm. Phải rà: test `treatment-grid-rows.test.ts` (d18f0f55e) đang khẳng định
   ngược lại; hiển thị nạp lại (mapper gộp header — dòng コメント cùng 部位 sẽ không sinh header thừa);
   chỗ 部位病名行 "fold" vào dòng đầu nhóm (nay có thể là dòng コメント).

### Điều tra sâu P-021 (2026-10-06) — hạ xuống S4

- WinForm `UnPaidData` mặc định `rece_kbn = 1` (現金), `acc_tm = ""` (UnPaid.cs:93/99); `LetAccData2` không gán lại.
- **Không ai đọc 2 cột này của UNPAID**: 窓口精算 (`frm204002`) lọc UNPAID theo `rece_amt` (`receKbn.receOn/
  receOff` = `rece_amt != -1 / = -1`, UnPaid.cs:149-167), lấy 入金区分 từ combo và ghi vào **ACCDAT**; 日計表
  (`frm207001`) đọc ACCDAT. Web: `GetUnpaidListHandler` chỉ trả ra, xếp theo `trt_dt`; 窓口精算 web khởi tạo combo
  từ master, không từ `unpaid.receKbn`.
- Dữ liệu thật: SQL Server chỉ có 1 dòng UNPAID, Postgres 1 dòng — đều `rece_kbn 1` / `acc_tm` rỗng (= mặc định WinForm).
- Sửa (nếu muốn khớp tuyệt đối): `InsertUnpaidHandler.BuildUnpaid` gán `ReceKbn = 1`, `AccTm = 1900-01-01`.


### Đã sửa P-018 / P-021 (2026-10-06)

- **P-018** — commit `ae9b078d0`: bỏ `isBuiLessByDesign` và cờ `buiLess` (加算 / IS); mọi dòng 処置 nhận
  部位病名 của nhóm như `AutoBui`. Đo lại: `SaveNoChange 9→990009` DB **không khác nền** (dòng コメント giữ
  部位); `SaveCodeEntry 3948→993948` TRNTRN **32 dòng khớp** (704 có 部位). E2e mới
  `web-tenant-tests/tests/save-f9/comment-row-keeps-bui.spec.ts` (F9 không sửa ⇒ dòng 6-0 giữ 部位/病名).
- **P-021** — commit `beb8dee82`: `ReceKbn = 1`, `AccTm = 1900-01-01`. Đo lại `SaveAccData`: UNPAID **khớp**.
  E2e `accounting-unpaid/unpaid-insert.spec.ts` TC-4; unit test `InsertUnpaidHandlerTests.NewRow_KeepsUnPaidDataDefaults_ForReceKbnAndAccTm` (chưa chạy).


---

# Nhóm 1 — loại bệnh nhân khác (2026-10-06)

Nhân bản rồi chạy `Open / SaveNoChange / SaveCodeEntry / SaveAccData` (script `scratchpad/group1.sh`;
`clone-patient.sh` nay chép thêm PUBEXPINF / ACCDAT / PCONDITION / CCTA). Bệnh nhân lịch sử dài
(12847: 2.633 dòng, 13766: 3.625 dòng) KHÔNG đo được: WinForm vẽ cả lịch sử, UIA đọc lưới quá 900s /
COMException ⇒ chỉ chọn bệnh nhân tổng ≤ 60 dòng.

| Loại | Bệnh nhân (ngày) | Kết quả |
|---|---|---|
| Kiểm lại P-018 | 9 → 990009 (2026-07-01) `SaveNoChange` | ✅ màn + DB khớp (lần đo trước bị sai tham số — không hợp lệ) |
| 後期高齢 | 18269 (2025-12-18) | DB khớp ở Open / SaveNoChange / SaveAccData (UNPAID 2 dòng khớp); màn: P-023; chuỗi 会計: P-024; SaveCodeEntry: chạy lại (rớt mạng) |
| 公費 + 初診 | 18185 (2026-02-17) | SaveNoChange khớp hoàn toàn; SaveAccData DB khớp; Open lần đo có 負担金 0円 ở web ⇒ đo lại riêng (bệnh nhân thật + bản sao probe) đều 2.600円 = WinForm ⇒ nghi do rớt mạng lúc chụp, chạy lại xác nhận; SaveCodeEntry: chạy lại |
| 初診 | 18277 (2026-04-30) | DB khớp cả 4 case (SaveCodeEntry: TRNTRN 9 dòng khớp, SaveAccData: UNPAID khớp); màn: chỉ P-023 |
| Đổi nhánh 1→2 trong tháng | 17170 (2019-11-28) | chưa chạy được (ssh timeout do rớt mạng) — đang chạy lại |
| 介護 | — | KHÔNG có dữ liệu thật: cả hai DB không có dòng jihi_flg 3; hồ sơ 介護 duy nhất (bệnh nhân 9) không có dòng 599 |

## P-023 ⚪ S4 — dòng tiêu đề tháng hiện hành khi không có lịch sử

WinForm `modSave.cs:5118-5130` thêm dòng 「R ee年mm月」 của tháng hiện hành ở CUỐI đoạn vẽ lịch sử (ngay
sau 「◯月 合計」 của tháng cũ) ⇒ không có tháng lịch sử thì không có dòng này. Web luôn vẽ tiêu đề cho
mọi record. Tái hiện: `run-write-case.sh Open 18277 998277 2026-04-30` (hoặc 18269).

## P-024 ⚪ S4 — 会計 chain thiếu I00100 khi không có lỗi

WinForm `TrnChk` (frm203002.cs:5164-5221) tự `ShowWarningMsg("I00100")` khi danh sách lỗi rỗng; F8
(:7717) và 「3 会計データ作成」 (:7771) đều gọi `TrnChk` ⇒ người dùng thấy 「エラーはありません。」 rồi chuỗi
đi tiếp. Web `runPreAccountingCheck` (treatment-entry-detail.tsx) chỉ hiện hộp khi CÓ lỗi (I00100 chỉ có ở F3
`runDataCheck`). Tái hiện: `run-write-case.sh SaveAccData 18269 998269 2025-12-18` (bệnh nhân không có lỗi チェック).


## P-025 ➖ — `dsp_trt` dòng thuốc: CRLF + 2 dấu cách — KHÔNG SỬA (user chốt 2026-10-06: thụt dòng bằng CSS)

Tái hiện: `run-write-case.sh SaveNoChange 17170 997170 2019-11-28` (F9 không sửa). Dữ liệu gốc 607-0 chỉ là
「ﾒｲｱｸﾄMS錠100mg 3T」; CẢ HAI bên đều nối thêm dòng 用法 từ MST_MED khi lưu (đúng parity), nhưng mã ký tự:
- WinForm: `… 51 84 13 10 32 32 65297 …` — `3T` + **CRLF + 2 dấu cách** + 「１日３回…」
- Web: `… 51 84 10 65297 …` — chỉ **LF**
Dữ liệu thật: 1.522/1.522 dòng `dsp_trt` nhiều dòng trong TRNTRN đều `CRLF + "  "` (không dòng nào chỉ LF).
Web: `DrugRowNameResolver` (BE) nối dòng bằng `"\n"` để hiển thị; đường lưu ghi nguyên chuỗi đó.
(Dấu cách toàn độ rộng giữa 「食後」「服用」 hai bên GIỐNG nhau — U+3000; lệch thấy lúc đầu là do sqlcmd in sai mã.)
Hướng sửa: chuẩn hoá ở chỗ ghi `dsp_trt` (BE save) — dòng tiếp theo nối bằng `"\r\n  "`.

## P-026 🟡 S3 — dòng 「保険切替」

WinForm `GetTrnRs` (modSave.cs:2511-2545): khi `pat_br` đổi giữa hai dòng liên tiếp ⇒ chèn dòng nền xanh, chữ đậm
「保険切替 (pat_br)」 / 「切替日：<br_dt của bảo hiểm hiệu lực, dạng 令01/11/7>」 / 「－」「－」 (linekbn 3). Web chưa port.
Tái hiện: `run-write-case.sh Open 17170 997170 2019-11-28`.

### Đã sửa P-026 (2026-10-06)
`buildDisplayMonth` chèn dòng chỉ-đọc 「保険切替 (br)」/「切替日：…」 trước dòng đầu tiên có `patBr` khác dòng trên (không chèn ở đầu tháng).
Đo lại `Open 17170`: chỉ còn lệch P-023.

## P-027 🟡 S3 — チェック 診療開始日 sai ở tháng 2 nhánh

17170 tháng 2019-11: nhánh 1 (ngày 5, 6) med_st_dt 2019-11-05, nhánh 2 (ngày 12, 28) med_st_dt 2019-11-12.
Web F3 / 会計前チェック báo 「11/05 100-0 歯科初診料を算定していますが、診療開始日(11/12)と異なります。」.
`CheckContextBuilder.cs:107-122` gán cho MỌI dòng FE một `med_st_dt` = max của tháng (comment ghi rõ 「Not split
by 枝番 here」); WinForm `ChkFirst_visit_date` đọc `Chk_data[i].med_st_dt` của chính dòng (hFG1[79]) ⇒ 11/05 ⇒ không lỗi.
Hướng sửa: lấy med_st_dt theo nhánh (pat_br) của dòng — max med_st_dt của các dòng đã lưu cùng pat_br.


### Đã sửa P-027 (2026-10-06)
- `57e3c3ffd`: `CheckContextBuilder` lấy med_st_dt theo 枝番 của từng dòng (max của các dòng đã lưu cùng pat_br);
  dòng mới chưa có 枝番 vẫn dùng giá trị của tháng; claim 初診 trên màn vẫn ưu tiên.
- `e22a728e3`: `CheckTreatmentRowRequest` chưa có `PatBr` ⇒ mapper check / check-single đánh rơi 枝番 FE gửi ⇒ thêm vào.
- `63da656dc`: thêm `patBr` vào openapi-spec / api-types (chỉ trường này — `sync:spec` từ demo1 kéo theo cả endpoint riêng của demo1).
- Đo lại: probe F3 bệnh nhân thật 17170 @ 2019-11-28 ⇒ `hasErrors: false` + 「エラーはありません。」; parity `SaveAccData 17170`
  ⇒ chuỗi hộp thoại hai bên cùng thứ tự (エラーはありません → 本日でありません → 既に…未清算データ…).
