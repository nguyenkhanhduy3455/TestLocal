import { expect, test, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    seedTreatmentRows,
    withDb,
} from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 F9 登録 — NHÓM P0: các side-effect của `modSave.SaveData` chưa port.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (`src/OCHACOM`), không bám theo
 * code web. File này được viết để **ĐỎ TRƯỚC KHI SỬA** — mỗi TC đỏ là một gap
 * THẬT, KHÔNG phải test viết sai. Xanh dần theo từng lô thi công.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TÀI LIỆU NGUỒN
 * ═════════════════════════════════════════════════════════════════════════════
 *  · `userapp/inp-p0-investigation.md` — đặc tả đầy đủ 11 side-effect + quyết định
 *  · `userapp/inp-p0-open-issues.md`   — các bug WinForm tạm gác (ISSUE-1..6)
 *  · `userapp/inp-remaining-work.md`   — bản tổng P0..P7
 *
 * ⚠️ `inp-remaining-work.md` §P0 có 5 chỗ SAI đã được đính chính ở
 *    `inp-p0-investigation.md` §1. Đáng chú ý nhất với file này:
 *      · KHÔNG có cột `insurance.last_trt_dt` — WinForm ghi **`med_ed_dt`** (TC-7)
 *      · `men_1..5` là cột CHẾT ở CẢ HAI bên ⇒ KHÔNG có TC nào soi nó
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN ĐỒ TC → GAP → LÔ THI CÔNG
 * ═════════════════════════════════════════════════════════════════════════════
 *  TC-0  mốc     F9 thật sự ghi DB (nếu ĐỎ ⇒ HARNESS hỏng, đừng đọc TC khác)
 *  TC-1  🐛 lô 0 `dr_no` / `staff_no` bị vứt ở tầng JSON binding
 *  TC-2  🐛 lô 1 `syosin_flg` hard-code 3 (phải là 1 初診 / 2 再診 / 3 再初診)
 *  TC-3  🐛 lô 1 `raiin_cnt` hard-code 1 (phải đánh số theo lượt khám trong ngày)
 *  TC-4  🐛 lô 1 `isl` = 0, 分 của 麻酔 bị dồn nhầm vào `trt_cnt`
 *  TC-5  🐛 lô 2 F9 chỉ hỏi 2 nút, WinForm hỏi 3 nút はい/いいえ/キャンセル
 *  TC-6  🐛 lô 3 `wait` (受付) không bị xoá sau khi lưu
 *  TC-7  🐛 lô 3 `insurance.med_ed_dt` không được cập nhật
 *  TC-8  ✅ lô 6 `price` (点数×回数) + `trn_status` — CHẶN KÉP, xem chú thích ở TC-8
 *  TC-9  ✅ lô 4 楽観ロック — token gửi lên, lệch thì 409 và KHÔNG ghi gì
 *  TC-10 ✅ lô 4 楽観ロック — 「はい」 gửi lại kèm force ⇒ ghi đè được
 *
 * ── LỊCH SỬ CHẠY THẬT ────────────────────────────────────────────────────────
 * 2026-08-10 — TRƯỚC khi sửa, tenant1 local, PAT_NO 12138, TRT_DT = 2026-08-10,
 *   nhánh dev @ 1c0fe109b. Kết quả: **1 passed / 8 failed** — tái hiện ĐỦ 8 gap.
 *     TC-0 ✓ mốc xanh ⇒ harness đúng, các TC đỏ bên dưới là gap THẬT
 *     TC-1 ✘ 「FE gửi drNo = 1 nhưng DB lưu 0」 ⇒ bug mapper được XÁC NHẬN end-to-end
 *     TC-2 ✘ cả hai vế: ngày có 初診 → đọc được 3 (cần 1); ngày chỉ 再診 → 3 (cần 2)
 *     TC-3 ✘ raiin_cnt đọc được 「100:1, 209:1, 110:1, 209:1」 (cần lượt 2 = 2)
 *     TC-4 ✘ isl = 0 (cần 7) và trt_cnt = 7 (cần 0)
 *     TC-5 ✘ CHỈ thiếu nút キャンセル — nút Yes/No đã có (confirmDialog 2 nút)
 *     TC-6 ✘ wait còn 1 dòng sau F9 (cần 0)
 *     TC-7 ✘ không 枝番 nào có med_ed_dt = 2026-08-10 (br9 vẫn là 2026-07-31)
 *     TC-8 ✘ log chẩn đoán in 「price = 0 ⇒ điều kiện (a) CHƯA ĐẠT」, trn_status = 0
 *   Dọn dẹp sau lượt chạy: trn_trn ngày test = 0, wait = 0, insurance về nguyên trạng ✓
 *
 *   ⚠️ MỘT LẦN SỬA TEST trong lượt này: TC-5 ban đầu bó locator vào
 *   `getByRole('dialog')` ⇒ CẢ BA vế đỏ, kể cả nút はい/Yes vốn chắc chắn có.
 *   Nguyên nhân: `DialogShell` là Radix `AlertDialog` → role **alertdialog**.
 *   Đã sửa (xem chú thích trong TC-5). Đây là lỗi TEST, không phải gap.
 *
 * 2026-08-10 — SAU khi sửa (nhánh feat/inp-p0-save-side-effects, lô 0-3):
 *   **8 passed / 1 failed**. TC-0..TC-7 xanh hết; TC-8 vẫn đỏ ĐÚNG THEO THIẾT KẾ
 *   — log in ra 「price = 0 ⇒ điều kiện (a) CHƯA ĐẠT」, tức còn chờ pricing engine.
 *   TC-2 tự tra DB và kỳ vọng 3 (再初診) vì 12138 đã có 初診 trước 2026-08-01.
 *   TC-5 log xác nhận hộp thoại: 「処置データは、変更されていません。保存しますか？
 *   はい いいえ キャンセル」. Dọn dẹp sạch (trn_trn = 0, wait = 0, insurance nguyên trạng).
 *
 * 2026-08-10 — SAU lô 6: **11 passed / 0 failed**. LẦN ĐẦU cả file xanh.
 *   TC-8 chuyển xanh: log in 「price của dòng bảo hiểm = 40 ⇒ điều kiện (a) ĐÃ ĐẠT」
 *   và tháng 202608 có dòng `trn_status`.
 *
 *   ⚠️ Lượt chạy ngay trước đó vẫn đỏ TC-8 với `price = 0` DÙ code đã sửa và 2058
 *   test .NET đều xanh — vì API đang chạy là binary build TRƯỚC đó (process khởi
 *   động 2:29PM, sửa code lúc 3:0x). Sửa BE xong PHẢI restart API rồi mới chạy spec;
 *   không thì spec đo bản cũ và kết luận ngược.
 *
 *   Ghi chú nội dung lô 6 — `trn_trn.price` KHÔNG phải đầu ra của pricing engine.
 *   WinForm lưu thẳng ô lưới cột 54, chú thích của chính nó là 「点数*回数」
 *   (frm203002.cs:5657 / modMain.cs:1563 / modSave.cs:307 / modSave.cs:5668), và
 *   không có đường UPDATE nào ghi lại về sau. Bản port chỉ thừa điều kiện
 *   `jihiFlg != 0`. TODO cũ trong SaveTreatmentsHandler ghi "call BuiPriceService
 *   and persist price" là SAI — BuiPriceService (đã port sẵn 1690 dòng) chỉ tính
 *   một部負担金 lúc đọc, không đụng cột này.
 *
 * 2026-08-10 — SAU lô 4 (楽観ロック), thêm TC-9/TC-10: **10 passed / 1 failed**.
 *   Chỉ TC-8 còn đỏ (chờ pricing engine). TC-0..TC-7 vẫn xanh ⇒ token KHÔNG gây
 *   xung đột giả: mọi TC đó đều bấm F9 và đòi 2xx, nếu FE/BE lệch predicate thì
 *   cả 8 đã đỏ cùng lúc. Đó là lưới an toàn tốt nhất cho lô 4, mạnh hơn bất kỳ
 *   assert riêng lẻ nào.
 *
 *   ⚠️ TC-9 BẮT ĐƯỢC MỘT BUG THẬT ở lượt chạy đầu (không phải lỗi test):
 *   `DialogShell` đặt `onOpenAutoFocus={() => buttonRefs.current[0].focus()}` —
 *   hard-code 0. Handler này chạy SAU effect focus theo `selected`, nên nó luôn
 *   kéo DOM focus về nút ĐẦU. Kết quả: vòng ring nằm ở 「いいえ」 (đúng) nhưng DOM
 *   focus ở 「はい」 (sai). Enter vẫn an toàn vì `handleKeyDown` tự resolve theo
 *   `selected`, NHƯNG **Space** sẽ bấm nút đang focus ⇒ ghi đè ngoài ý muốn.
 *   Đã sửa thành `buttonRefs.current[selected]`. Bug này vô hình với mọi hộp thoại
 *   cũ vì chúng đều dùng mặc định 0 — chỉ lộ ra khi có nút mặc định ≠ 0 đầu tiên.
 *
 *   ⚠️ Lượt chạy TRƯỚC đó đỏ cả 9 vì BE ném 500
 *   「Cannot write DateTime with Kind=Unspecified to PostgreSQL type 'timestamp with
 *   time zone'」 — `yoyaku.st_dt` là timestamptz mà `DateOnly.ToDateTime()` trả
 *   Kind=Unspecified. Đó là lý do `pressF9AndSave` in nguyên body khi non-2xx:
 *   chỉ nhìn status code thì 9 vệt đỏ trông y hệt "chưa port".
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (src/OCHACOM)
 * ═════════════════════════════════════════════════════════════════════════════
 * ── Khung `SaveData` ─────────────────────────────────────────────────────────
 *  · INP/Lib/modSave.cs:570-657 — MỘT transaction, thứ tự:
 *      DelData → deleteWait → Restore_SK → SetOrder → SigaChg_Save → InsData2
 *      (+LetHokan) → SetLastTrtDay → SetStartTrtDay → Let_BNOW → Set_NCULT
 *      → Set_Tenki → Upd_TrnStatus → updateResSts → COMMIT
 *    Nhánh "0 dòng" (SetOrder trả false) BỎ QUA SigaChg_Save/InsData2/Let_BNOW/
 *    Set_Tenki/updateResSts — spec này luôn seed ≥1 dòng nên đi nhánh đầy đủ.
 *
 * ── TC-1 `dr_no` / `staff_no` ────────────────────────────────────────────────
 *  · modSave.cs:2095/2110 `InsData2` — ghi cột 69 (DR_NO) và 75 (STAFF_NO) từ lưới.
 *  · Bản port: FE CÓ gửi (`save-treatments-api.ts:43-44,154-155`), `SaveTreatmentRowInput`
 *    CÓ khai báo, handler CÓ dùng — nhưng `SaveTreatmentRowRequest` KHÔNG có 2 field
 *    và `SaveTreatmentsRequestMapper.cs:20` chỉ truyền 12 tham số ⇒ rơi mất im lặng,
 *    mọi dòng nhận `dr_no = 0`, `staff_no = 100` (TrnTrnDefaults).
 *
 * ── TC-2 `syosin_flg` ────────────────────────────────────────────────────────
 *  · modSave.cs:1160-1225 `SetOrder` — tính THEO TỪNG NGÀY, đóng dấu cho MỌI dòng
 *    của ngày đó. Miền: 1=初診, 2=再診, 3=再初診.
 *      IsFirstVisitTreatCode (Check.cs:12456) = (100,0) (100,1) (107,0) (333,50) (333,55)
 *        → flg = 1
 *      trt_cd 110 hoặc (107,1) → flg = 2
 *      dsp_trt chứa 健診より/健康診断の結果に基づき治療開始/検診より/自費より → flg = 1
 *      flg==1 mà QUÁ KHỨ có trt_cd 100 hoặc (107,0) → hạ xuống 3
 *  · Bản port: `TrnTrn.cs:177` `SyosinFlg = 3` HARD-CODE kèm TODO Phase 2.
 *
 * ── TC-3 `raiin_cnt` ─────────────────────────────────────────────────────────
 *  · modAcc.cs:1174 `hfgRaiinCnt` — chạy trên memory trước transaction:
 *      reset visit_cnt khi QUÉT thấy đổi ngày (KHÔNG group-by);
 *      visit_cnt++ khi trt_cd ∈ {100,107,110,111,333} và 回数 > 0;
 *      raiin_cnt = max(visit_cnt, 1) cho TỪNG dòng tại thời điểm quét tới nó.
 *    ⇒ dòng đứng TRƯỚC mã 初診/再診 thứ 2 của ngày vẫn giữ 1; dòng sau nhận 2.
 *  · Bản port: `TrnTrn.cs:156` `RaiinCnt = 1` HARD-CODE.
 *
 * ── TC-4 `isl` ───────────────────────────────────────────────────────────────
 *  · modSave.cs:2034-2049 `InsData2` — cột 回数 của lưới bị DÙNG CHUNG:
 *      trt_cd == 50                            → isl = 回数, trt_cnt = 0
 *      trt_cd == 203 && (trt_sb<=5 || >=8)      → isl = 回数, trt_cnt = 1
 *      còn lại                                  → isl = 0,    trt_cnt = 回数
 *    (⚠️ trt_sb 6 và 7 của 203 là NGOẠI LỆ, dùng trt_cnt.)
 *    Predicate này lặp ở 6 chỗ trong WinForm ⇒ port thành MỘT helper dùng chung.
 *  · Bản port: `TrnTrn.cs:163` `Isl = 0` HARD-CODE, 回数 luôn vào `trt_cnt`.
 *
 * ── TC-5 hộp thoại 3 nút ─────────────────────────────────────────────────────
 *  · modSave.cs:100-132 `SaveChangesAndExit` — phím End (F9 登録) LUÔN hỏi, 3 nút
 *    はい/いいえ/キャンセル, mặc định はい, chữ giữa đổi theo `ChkChangedTrnData`:
 *      「処置データは、変更されて{いません|います}。保存しますか？」
 *      はい → SaveData ; いいえ → RestoreData ; キャンセル → ở lại màn hình
 *  · QUYẾT ĐỊNH DỰ ÁN (3): làm PARITY ⇒ 「いいえ」 KHÔNG lưu nhưng VẪN rời màn hình.
 *    (Web không có đường ghi 歯式/根数 "nóng" như WinForm nên RestoreData ở web
 *     gần như no-op — xem inp-p0-investigation.md §6.)
 *  · Bản port: `treatment-entry-detail.tsx:3548` dùng `confirmDialog` 2 NÚT.
 *    Component 3 nút `DataModifiedConfirmDialog` ĐÃ CÓ SẴN, chỉ chưa dùng cho F9.
 *
 * ── TC-6 `wait.deleteWait` ───────────────────────────────────────────────────
 *  · COMMON/DBAccess/Wait.cs:210-228 — `delete from wait where pat_no = <id>`,
 *    KHÔNG lọc ngày, KHÔNG lọc ghế. Gọi ở modSave.cs:580, ngay sau DelData.
 *  · Gate: `ModCommon.pUKETUKE` = INI `iniconfig.pat_list_flg == 1`.
 *    ⚠️ Nếu clinic TẮT 受付患者一覧 thì WinForm cũng không xoá ⇒ TC này chỉ đúng
 *    khi tenant đang BẬT. Tắt TC bằng TEST_P0_SKIP_WAIT=1 nếu tenant tắt.
 *  · Bản port: `SaveTreatmentsHandler.cs:31` TODO, chưa đụng bảng `wait`.
 *
 * ── TC-7 `insurance.med_ed_dt` ───────────────────────────────────────────────
 *  · modSave.cs:1334 `SetLastTrtDay` — `select PAT_BR, min/max(TRT_DT) ... group by
 *    PAT_BR`, rồi per 枝番: `update INSURANCE set med_ed_dt = <max>`; 枝番 hết dòng
 *    thì set NULL. (Cũng ghi `person.fs_visi_dt` write-once — xem ISSUE-3.)
 *  · Bản port: `SaveTreatmentsHandler.cs:34` TODO ghi nhầm tên cột là `last_trt_dt`;
 *    cột đó KHÔNG TỒN TẠI. Đích đúng là `med_ed_dt` (schema.sql:3416).
 *
 * ── TC-9 / TC-10 楽観ロック (lô 4) ────────────────────────────────────────────
 *  · modSave.cs:543-557 `SaveData` — gọi `CompareTrntrnData`; lệch thì hỏi
 *      「他の端末で処置データが更新されています。上書きしますか？」
 *      (MsgBoxStyle.YesNo | DefaultButton2 ⇒ mặc định 「いいえ」)
 *    いいえ → không lưu. はい → lưu đè.
 *  · WinForm so sánh NGOÀI transaction ⇒ vẫn hở cửa sổ TOCTOU giữa lúc so và lúc
 *    DelData. Bản port dùng token `updated_at` và so BÊN TRONG transaction ⇒ đóng
 *    cửa sổ đó. Đây là chỗ CỐ Ý chặt hơn WinForm, không phải lệch parity.
 *  · 🐛 2d — WinForm chọn 「いいえ」 thì KHÔNG lưu nhưng VẪN đóng màn hình:
 *    `SaveChangesAndExit` (modSave.cs:120) vứt giá trị trả về của `SaveData`, nên
 *    `retval` vẫn true ⇒ 終了. Nội dung đang nhập mất sạch. ĐÃ PORT NGUYÊN cho F9.
 *    Xem `userapp/inp-parity-bugs-reproduction.md` §2d.
 *
 * ── TC-8 `Upd_TrnStatus` ─────────────────────────────────────────────────────
 *  · modTrnSubcode.cs:227 — driver:
 *      select distinct pat_br from trntrn where pat_no và tháng
 *        and price > 0 and jihi_flg in (0,1,2)
 *  · 🔴 CHẶN KÉP: `price` của bản port luôn = 0 cho dòng bảo hiểm
 *    (`TrnTrn.cs:166` — chờ pricing engine). Nên TC-8 CHỈ xanh khi có ĐỦ hai thứ:
 *    (a) pricing ghi `price > 0`, VÀ (b) `Upd_TrnStatus` được port.
 *    Đừng coi TC-8 đỏ là bằng chứng riêng cho (b).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG DÙNG `describe.serial`
 * ═════════════════════════════════════════════════════════════════════════════
 * `serial` = một test đỏ thì MỌI test sau bị skip, mà file này cố ý có 8 TC đỏ.
 * `mode: 'default'` vẫn chạy TUẦN TỰ trong CÙNG worker (nên `page` chung tạo ở
 * `beforeAll` hợp lệ, cả file login MỘT lần — Rule 10.1) nhưng KHÔNG fail-fast
 * ⇒ một lượt chạy thấy đủ mọi gap. `retries: 0` cũng cố ý.
 * Trong mỗi TC dùng `expect.soft` để thấy hết các mặt của cùng một defect.
 *
 * ⚠️ Playwright dựng WORKER MỚI sau mỗi test FAIL ⇒ `beforeAll` (login + mở màn)
 *    chạy lại một lượt cho mỗi lần đỏ. Thấy nhiều lượt login là BÌNH THƯỜNG.
 *    Nhưng Rule 10.1: app chặn khi vượt ~10 login / khung thời gian. File này có
 *    9 TC ⇒ nếu đỏ nhiều sẽ ĐỤNG TRẦN. Đụng thì chờ ~4 phút, ĐỪNG sửa code;
 *    hoặc chạy từng nhóm bằng `--grep`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *   cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p0-save-side-effects.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p0-save-side-effects.spec.ts --headed
 *
 * Chạy riêng một nhóm khi bị rate-limit login:
 *   ... npx playwright test tests/p0-save-side-effects.spec.ts --grep "TC-1|TC-2"
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138 — ĐỪNG trỏ dữ liệu thật)
 *   TEST_TRT_DT        ngày test, mặc định HÔM NAY (chỉ tháng đang mở mới sửa được)
 *   TEST_ALLOW_SAVE=1  BẮT BUỘC — spec bấm F9 nên GHI DB thật (ghi lại CẢ THÁNG)
 *   TEST_DB=1          BẮT BUỘC — mọi assert đều soi thẳng Postgres
 *   TEST_P0_SKIP_WAIT=1  bỏ TC-6 khi tenant TẮT 受付患者一覧
 *
 * ⚠️ RỦI RO DỮ LIỆU: mỗi F9 XOÁ MỀM + CHÈN LẠI toàn bộ 処置行 của THÁNG đó
 *    (disp_no được đánh lại từ 1). `beforeAll` in ra số dòng thật bị ảnh hưởng.
 *    Chọn TEST_PAT_NO / TEST_TRT_DT vào tháng TRỐNG thì con số đó = 0.
 *    TC-7 còn GHI `insurance.med_ed_dt` — snapshot + trả lại ở afterAll.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** `yyyyMM` của TRT_DT — khoá tháng của `trn_status.sinryo_ym` (char(6)). */
const SINRYO_YM = TRT_DT.slice(0, 4) + TRT_DT.slice(5, 7)

/** Rule 18.1 — mọi thao tác ghi DB phải nằm sau cờ env. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'
const SKIP_WAIT = process.env.TEST_P0_SKIP_WAIT === '1'

// ─── 処置 đem thử ─────────────────────────────────────────────────────────────
/** 初診 — IsFirstVisitTreatCode (Check.cs:12456). Kéo syosin_flg lên 1 (hoặc 3). */
const SYOSIN_TRT_CD = 100
const SYOSIN_SB = 0
/** 再診 — nhánh flg = 2 của SetOrder. Cũng đếm vào raiin_cnt (modAcc.cs:1174). */
const SAISIN_TRT_CD = 110
const SAISIN_SB = 0
/** ＩＳＬ 浸潤麻酔 — mã DUY NHẤT mà WinForm dồn 回数 sang `isl` và ép trt_cnt = 0. */
const ISL_TRT_CD = 50
const ISL_SB = 0
/** 分 麻酔 đem thử — đủ lớn để không lẫn với trt_cnt mặc định 1. */
const ISL_MINUTES = 7
/** 処置 trung tính, KHÔNG nằm trong tập đếm lượt khám của hfgRaiinCnt. */
const PLAIN_TRT_CD = 209
const PLAIN_SB = 0

/**
 * `dsp_trt` của MỌI dòng spec này từng seed — dùng cả lúc nhìn trên lưới lẫn lúc
 * dọn. Thêm dòng mới thì PHẢI thêm tên vào đây, nếu không cleanup sẽ hụt và để
 * lại rác mang dáng dữ liệu thật.
 */
const NM = {
    syosin: '初診-P0テスト',
    saisin: '再診-P0テスト',
    isl: 'ＩＳＬ-P0テスト',
    plainA: '処置A-P0テスト',
    plainB: '処置B-P0テスト',
} as const

const ALL_TEST_TRT_CDS = [SYOSIN_TRT_CD, SAISIN_TRT_CD, ISL_TRT_CD, PLAIN_TRT_CD] as const

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3
const SAVE_TIMEOUT = 60_000

const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

// ═════════════════════════════════════════════════════════════════════════════
// Truy vấn DB riêng của spec này
//
// `db.ts` chưa có helper cho các cột P0 (dr_no / staff_no / syosin_flg /
// raiin_cnt / isl / freewd / price), cho `wait`, `insurance.med_ed_dt` và
// `trn_status`. Giữ inline ở đây để thay đổi gói gọn trong một file; nếu spec
// khác cần dùng lại thì lúc đó mới nâng lên `db.ts`.
// ═════════════════════════════════════════════════════════════════════════════

interface P0Row {
    dispNo: number
    trtCd: number
    trtSb: number
    trtCnt: number
    trtPt: number
    price: number
    isl: number
    drNo: number
    staffNo: number
    syosinFlg: number
    raiinCnt: number
    freewd: string | null
    dspTrt: string | null
}

/** MỌI 処置行 còn sống của (patNo, trtDt), theo `disp_no` — đọc lại chính thứ F9 vừa ghi. */
async function readP0Rows(patNo: number, trtDt: string): Promise<P0Row[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT disp_no, trt_cd, trt_sb, trt_cnt, trt_pt, price, isl,
                    dr_no, staff_no, syosin_flg, raiin_cnt, freewd, dsp_trt
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND deleted_at IS NULL
              ORDER BY disp_no`,
            [patNo, trtDt],
        )
        return r.rows.map((x) => ({
            dispNo: Number(x['disp_no'] ?? 0),
            trtCd: Number(x['trt_cd'] ?? 0),
            trtSb: Number(x['trt_sb'] ?? 0),
            trtCnt: Number(x['trt_cnt'] ?? 0),
            trtPt: Number(x['trt_pt'] ?? 0),
            price: Number(x['price'] ?? 0),
            isl: Number(x['isl'] ?? 0),
            drNo: Number(x['dr_no'] ?? 0),
            staffNo: Number(x['staff_no'] ?? 0),
            syosinFlg: Number(x['syosin_flg'] ?? 0),
            raiinCnt: Number(x['raiin_cnt'] ?? 0),
            freewd: (x['freewd'] as string | null) ?? null,
            dspTrt: (x['dsp_trt'] as string | null) ?? null,
        }))
    })
}

/**
 * Bệnh nhân đã có 初診 ở THÁNG TRƯỚC tháng test chưa.
 *
 * Quyết định kỳ vọng của TC-2: `SetOrder` (modSave.cs:1218-1224) hạ 初診 (1)
 * xuống 再初診 (3) khi quá khứ đã có 初診. Điều kiện WinForm dùng CHỈ gồm
 * `trt_cd = 100` và `(107, 0)` — HẸP HƠN `IsFirstVisitTreatCode` (bỏ (100,1),
 * (333,50), (333,55)). Query này phải giữ đúng điều kiện hẹp đó, nếu không
 * TC-2 sẽ kỳ vọng sai với bệnh nhân từng có 歯訪診(初).
 *
 * Không hard-code kỳ vọng = 1 vì bệnh nhân test thật (12138) có hồ sơ từ 2006,
 * gần như chắc chắn đã có 初診 ⇒ đúng ra phải là 3. Hard-code 1 sẽ cho một vệt
 * ĐỎ GIẢ mà người sửa code không tài nào làm xanh được.
 */
async function hasPastFirstVisit(patNo: number, firstOfMonth: string): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt < $2::date AND deleted_at IS NULL
                AND (trt_cd = 100 OR (trt_cd = 107 AND trt_sb = 0))`,
            [patNo, firstOfMonth],
        )
        return (r.rows[0]?.n ?? 0) > 0
    })
}

/** Số dòng `wait` CÒN SỐNG của bệnh nhân (bảng dùng soft-delete). */
async function countWait(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM wait WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        return r.rows[0]?.n ?? 0
    })
}

/**
 * Dựng một dòng 受付 cho bệnh nhân nếu chưa có. Trả về true khi CHÍNH hàm này tạo
 * (⇒ afterAll phải xoá hẳn thay vì để lại).
 *
 * `ux_wait_active(pat_no)` là partial unique index ⇒ chỉ được có 1 dòng sống.
 */
async function ensureWaitRow(patNo: number): Promise<boolean> {
    return withDb(async (c) => {
        const cur = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM wait WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        if ((cur.rows[0]?.n ?? 0) > 0) return false
        await c.query(
            `INSERT INTO wait (pat_no, user_no, tplan, chair, rdate)
             VALUES ($1, 0, 0, 0, now())`,
            [patNo],
        )
        return true
    })
}

/** Xoá HẲN mọi dòng `wait` của bệnh nhân, kể cả bản đã soft-delete. */
async function purgeWait(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM wait WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

interface InsRow {
    patBr: number
    medEdDt: string | null
}

/** `insurance.med_ed_dt` của mọi 枝番 còn sống. */
async function readInsurance(patNo: number): Promise<InsRow[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT pat_br, to_char(med_ed_dt, 'YYYY-MM-DD') AS med_ed_dt
               FROM insurance
              WHERE pat_no = $1 AND deleted_at IS NULL
              ORDER BY pat_br`,
            [patNo],
        )
        return r.rows.map((x) => ({
            patBr: Number(x['pat_br'] ?? 0),
            medEdDt: (x['med_ed_dt'] as string | null) ?? null,
        }))
    })
}

/** Trả `insurance.med_ed_dt` về đúng nguyên trạng đã chụp ở beforeAll. */
async function restoreInsurance(patNo: number, snap: readonly InsRow[]): Promise<void> {
    await withDb(async (c) => {
        for (const row of snap) {
            await c.query(
                'UPDATE insurance SET med_ed_dt = $3::date WHERE pat_no = $1 AND pat_br = $2',
                [patNo, row.patBr, row.medEdDt],
            )
        }
    })
}

/** Số dòng `trn_status` còn sống của (patNo, tháng) ở nhánh 医療/自費 (jihi_flg 0,1,2). */
async function countTrnStatus(patNo: number, sinryoYm: string): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM trn_status
              WHERE pat_no = $1 AND sinryo_ym = $2
                AND jihi_flg IN (0, 1, 2) AND deleted_at IS NULL`,
            [patNo, sinryoYm],
        )
        return r.rows[0]?.n ?? 0
    })
}

/**
 * Giả lập "máy khác vừa lưu cùng tháng" — chỉ cần đẩy `updated_at` lên là đủ,
 * vì token của lô 4 chính là `MAX(updated_at)` của (pat_no, 処置月).
 *
 * KHÔNG lọc `deleted_at IS NULL`: bên BE cố tình đọc bảng gốc, vì một lượt lưu
 * chỉ-xoá của máy khác cũng phải làm token nhúc nhích.
 */
async function bumpMonthUpdatedAt(patNo: number, trtDt: string): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query(
            `UPDATE trn_trn
                SET updated_at = now()
              WHERE pat_no = $1
                AND trt_dt >= date_trunc('month', $2::date)
                AND trt_dt <  date_trunc('month', $2::date) + interval '1 month'`,
            [patNo, trtDt],
        )
        return r.rowCount ?? 0
    })
}

/**
 * `id` + `disp_no` của mọi dòng còn sống trong THÁNG — dùng để chứng minh một lượt
 * lưu bị 409 KHÔNG chạm vào DB.
 *
 * Phải đọc `id`, không được chỉ đọc `disp_no`: bulk-save xoá mềm rồi chèn lại,
 * `disp_no` có thể trùng y hệt bộ cũ nên nhìn riêng nó thì "đã ghi đè" và "không
 * đụng gì" trông giống nhau. `id` là surrogate nên luôn đổi khi có chèn lại.
 */
async function readMonthRowIds(patNo: number, trtDt: string): Promise<string[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT id, disp_no
               FROM trn_trn
              WHERE pat_no = $1
                AND trt_dt >= date_trunc('month', $2::date)
                AND trt_dt <  date_trunc('month', $2::date) + interval '1 month'
                AND deleted_at IS NULL
              ORDER BY trt_dt, disp_no`,
            [patNo, trtDt],
        )
        return r.rows.map((x) => `${String(x['id'])}:${String(x['disp_no'])}`)
    })
}

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: mọi assert của spec này soi thẳng Postgres')
skipWithReason(
    !ALLOW_SAVE,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật (bulk-save ghi lại CẢ THÁNG)',
)

test.describe.configure({ mode: 'default', retries: 0, timeout: 300_000 })

test.describe('診療入力 F9 登録 — side-effect nhóm P0 chưa port', () => {
    let page: Page
    let step: () => Promise<void>

    /** Nguyên trạng `insurance.med_ed_dt` — trả lại ở afterAll (TC-7 ghi vào đây). */
    let insBefore: InsRow[] = []
    /** true khi dòng `wait` do CHÍNH spec tạo ⇒ afterAll xoá hẳn. */
    let waitRowCreated = false

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    ryoCells(page).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới — nạp lại`,
                )
            }
        }
        throw lastErr
    }

    /** Xoá HẲN mọi dòng do spec này từng tạo, ở cả hai vùng disp_no. */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        for (const trtCd of ALL_TEST_TRT_CDS) {
            n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, trtCd).catch(() => 0)
        }
        return n
    }

    /**
     * Dựng lại tháng test: purge → seed → mở lại màn hình.
     *
     * Bắt buộc mở lại màn: F9 gửi lên NHỮNG GÌ ĐANG CÓ TRONG LƯỚI, không phải
     * những gì đang có trong DB. Seed xong mà không reload thì F9 sẽ ghi đè lại
     * bằng bộ dòng cũ và mọi assert đều sai lệch một cách khó truy.
     */
    async function resetMonthTo(rows: Parameters<typeof seedTreatmentRows>[2]) {
        await purgeTestRows()
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, rows)
        await openTreatmentScreen()
        await step()
    }

    /**
     * Bấm F9 登録, trả lại payload FE đã gửi lên.
     *
     * Vì sao cần payload: TC-1 phải phân biệt "FE không gửi `drNo`" (⇒ test/dữ liệu
     * hỏng) với "FE gửi rồi mà DB vẫn 0" (⇒ ĐÚNG cái bug đang soi). Không có nó thì
     * một TC đỏ không nói được lỗi nằm ở đâu.
     *
     * Nút xác nhận khớp CẢ hai hình dạng — 2 nút hiện tại lẫn 3 nút sau khi sửa
     * (TC-5) — để TC này không đỏ lây khi lô 2 đổi hộp thoại.
     */
    async function pressF9AndSave(): Promise<{ rows: Array<Record<string, unknown>> }> {
        const pending = page.waitForResponse(
            (r) =>
                r.url().includes('/tenant/treatment/bulk-save') && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await page.keyboard.press('F9')
        await step()
        await page
            .getByRole('button', { name: /^(はい|Yes|OK)$/ })
            .first()
            .click()
        await step()

        const resp = await pending
        if (resp.status() >= 300) {
            // In nguyên body: 500 từ BE mang mã lỗi/nội dung exception, mà chỉ nhìn
            // status code thì không lần ra được nguyên nhân.
            console.log(`bulk-save ${resp.status()} body: ${await resp.text().catch(() => '(unreadable)')}`)
        }
        expect(resp.status(), 'POST bulk-save không trả 2xx').toBeLessThan(300)
        const body = resp.request().postDataJSON() as { rows?: Array<Record<string, unknown>> }
        return { rows: body.rows ?? [] }
    }

    /**
     * Bấm F9 → 「保存しますか？」 → はい, rồi trả về LƯỢT bulk-save đầu tiên **dù
     * status là gì**. `pressF9AndSave` ép 2xx nên không dùng được cho nhánh 409.
     */
    async function pressF9RawSave(): Promise<{
        payload: Record<string, unknown>
        status: number
    }> {
        const pending = page.waitForResponse(
            (r) =>
                r.url().includes('/tenant/treatment/bulk-save') && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await page.keyboard.press('F9')
        await step()
        await page
            .getByRole('button', { name: /^(はい|Yes|OK)$/ })
            .first()
            .click()
        await step()

        const resp = await pending
        return {
            payload: resp.request().postDataJSON() as Record<string, unknown>,
            status: resp.status(),
        }
    }

    /**
     * Hộp thoại 「上書きしますか？」.
     *
     * ⚠️ `DialogShell` là Radix **AlertDialog** ⇒ role `alertdialog`, KHÔNG phải
     * `dialog`. Bó vào `getByRole('dialog')` là cách TC-5 từng đỏ giả cả 3 vế.
     */
    const overwriteDialog = () =>
        page
            .locator('[role="alertdialog"], [role="dialog"]')
            .filter({ hasText: /上書きしますか/ })
            .first()

    test.beforeAll(async ({ browser }) => {
        insBefore = await readInsurance(Number(PAT_NO))
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)

        console.log(
            `insurance nguyên trạng của ${PAT_NO} (LƯU LẠI phòng khi test bị kill giữa chừng):\n` +
                insBefore.map((r) => `  pat_br ${r.patBr}: med_ed_dt = ${r.medEdDt}`).join('\n'),
        )
        if (realRows > 0) {
            console.log(
                `⚠️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT — mỗi lần F9 sẽ ghi lại toàn bộ ` +
                    '(xoá mềm + chèn lại với disp_no mới). Đổi TEST_PAT_NO/TEST_TRT_DT sang tháng ' +
                    'trống nếu không muốn đụng dữ liệu đó.',
            )
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Rule 14 — AutoSantei bung 「…を算定しますか？」 vào thời điểm không đoán được
        // và nuốt mọi click. Bấm No — Yes lại kéo theo カルテ記載選択.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 60 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await page?.close()

        const n = await purgeTestRows()
        await restoreInsurance(Number(PAT_NO), insBefore)
        if (waitRowCreated) await purgeWait(Number(PAT_NO))

        console.log(
            `dọn: xoá ${n} 処置行 test, trả insurance.med_ed_dt về nguyên trạng` +
                (waitRowCreated ? ', xoá dòng wait do test tạo' : ''),
        )
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-0 (mốc) — F9 登録 thật sự ghi xuống trn_trn (nếu ĐỎ ⇒ harness hỏng)', async () => {
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])

        const { rows: payload } = await pressF9AndSave()
        expect(payload.length, 'FE không gửi dòng nào lên bulk-save').toBeGreaterThan(0)

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        const mine = saved.filter((r) => r.trtCd === PLAIN_TRT_CD)
        expect(
            mine.length,
            `Sau F9 không đọc lại được dòng trt_cd ${PLAIN_TRT_CD} nào — harness hỏng, ` +
                'đừng đọc kết quả các TC khác',
        ).toBeGreaterThan(0)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-1 — 🐛 dr_no / staff_no bị vứt ở tầng JSON binding (lô 0)', async () => {
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])

        const { rows: payload } = await pressF9AndSave()
        const first = payload[0] ?? {}
        const sentDrNo = first['drNo']
        const sentStaffNo = first['staffNo']

        // Phân biệt "FE không gửi" với "BE làm rơi" — xem doc của pressF9AndSave().
        skipWithReason(
            sentDrNo === undefined && sentStaffNo === undefined,
            'FE không gửi drNo/staffNo trong payload ⇒ không phải cái bug đang soi ' +
                '(có thể header chưa chọn Dr). Chọn Dr/衛生士 trên header rồi chạy lại.',
        )

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        const mine = saved.find((r) => r.trtCd === PLAIN_TRT_CD)
        expect(mine, `không đọc lại được dòng trt_cd ${PLAIN_TRT_CD}`).toBeTruthy()

        if (sentDrNo !== undefined) {
            expect
                .soft(
                    mine!.drNo,
                    `FE gửi drNo = ${String(sentDrNo)} nhưng DB lưu ${mine!.drNo}. ` +
                        'SaveTreatmentRowRequest thiếu field DrNo + mapper chỉ truyền 12 tham số ' +
                        '(SaveTreatmentsRequestMapper.cs:20) ⇒ mọi dòng nhận TrnTrnDefaults.DefaultDrNo = 0.',
                )
                .toBe(Number(sentDrNo))
        }
        if (sentStaffNo !== undefined) {
            expect
                .soft(
                    mine!.staffNo,
                    `FE gửi staffNo = ${String(sentStaffNo)} nhưng DB lưu ${mine!.staffNo} ` +
                        '(TrnTrnDefaults.DefaultStaffNo = 100).',
                )
                .toBe(Number(sentStaffNo))
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-2 — 🐛 syosin_flg hard-code 3, phải tính theo ngày (lô 1)', async () => {
        // Vế A — ngày CÓ 初診 (100/0) ⇒ SetOrder đóng dấu MỘT giá trị cho MỌI dòng
        // của ngày: 1 (初診), hoặc 3 (再初診) nếu quá khứ đã có 初診. Kỳ vọng được
        // suy từ DB chứ không hard-code — xem doc của hasPastFirstVisit().
        const firstOfMonth = `${TRT_DT.slice(0, 8)}01`
        const past = await hasPastFirstVisit(Number(PAT_NO), firstOfMonth)
        const expectedFirstVisitFlg = past ? 3 : 1
        console.log(
            `TC-2: bệnh nhân ${PAT_NO} ${past ? 'ĐÃ' : 'CHƯA'} có 初診 trước ${firstOfMonth} ` +
                `⇒ kỳ vọng syosin_flg = ${expectedFirstVisitFlg} (${past ? '再初診' : '初診'})`,
        )

        await resetMonthTo([
            { trtCd: SYOSIN_TRT_CD, trtSb: SYOSIN_SB, trtCnt: 1, trtPt: 264, dspTrt: NM.syosin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])
        await pressF9AndSave()

        const afterSyosin = await readP0Rows(Number(PAT_NO), TRT_DT)
        const syosinRows = afterSyosin.filter((r) =>
            [SYOSIN_TRT_CD, PLAIN_TRT_CD].includes(r.trtCd),
        )
        expect(syosinRows.length, 'không đọc lại được dòng nào ở vế 初診').toBeGreaterThan(0)
        for (const r of syosinRows) {
            expect
                .soft(
                    r.syosinFlg,
                    `dòng trt_cd ${r.trtCd}: ngày CÓ 初診 (100/0) ⇒ syosin_flg phải = ` +
                        `${expectedFirstVisitFlg} (modSave.cs:1160-1225 SetOrder đóng dấu cho ` +
                        `MỌI dòng của ngày; quá khứ ${past ? 'CÓ' : 'KHÔNG có'} 初診 nên ` +
                        `${past ? 'hạ xuống 再初診' : 'giữ 初診'}).`,
                )
                .toBe(expectedFirstVisitFlg)
        }

        // Vế B — ngày CHỈ có 再診 (110) ⇒ flg = 2.
        await resetMonthTo([
            { trtCd: SAISIN_TRT_CD, trtSb: SAISIN_SB, trtCnt: 1, trtPt: 56, dspTrt: NM.saisin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainB },
        ])
        await pressF9AndSave()

        const afterSaisin = await readP0Rows(Number(PAT_NO), TRT_DT)
        const saisinRows = afterSaisin.filter((r) =>
            [SAISIN_TRT_CD, PLAIN_TRT_CD].includes(r.trtCd),
        )
        expect(saisinRows.length, 'không đọc lại được dòng nào ở vế 再診').toBeGreaterThan(0)
        for (const r of saisinRows) {
            expect
                .soft(
                    r.syosinFlg,
                    `dòng trt_cd ${r.trtCd}: ngày CHỈ có 再診 (110) ⇒ syosin_flg phải = 2.`,
                )
                .toBe(2)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-3 — 🐛 raiin_cnt hard-code 1, phải đánh số theo lượt khám (lô 1)', async () => {
        // Hai lượt khám trong CÙNG một ngày: 初診 … rồi 再診 …
        // hfgRaiinCnt quét tuần tự: dòng 1,2 → raiin_cnt 1; dòng 3,4 → raiin_cnt 2.
        await resetMonthTo([
            { trtCd: SYOSIN_TRT_CD, trtSb: SYOSIN_SB, trtCnt: 1, trtPt: 264, dspTrt: NM.syosin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
            { trtCd: SAISIN_TRT_CD, trtSb: SAISIN_SB, trtCnt: 1, trtPt: 56, dspTrt: NM.saisin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainB },
        ])
        await pressF9AndSave()

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        const mine = saved.filter((r) => (ALL_TEST_TRT_CDS as readonly number[]).includes(r.trtCd))
        expect(mine.length, 'không đọc lại được dòng nào').toBeGreaterThan(0)

        const maxRaiin = Math.max(...mine.map((r) => r.raiinCnt))
        expect
            .soft(
                maxRaiin,
                'Ngày có HAI lượt khám (初診 rồi 再診, cả hai 回数 > 0) ⇒ raiin_cnt lớn nhất phải = 2 ' +
                    '(modAcc.cs:1174 hfgRaiinCnt). Bản port hard-code 1 ở TrnTrn.cs:156. ' +
                    `Đang đọc được: ${mine.map((r) => `${r.trtCd}:${r.raiinCnt}`).join(', ')}`,
            )
            .toBe(2)

        // Vế phụ: dòng 再診 (lượt 2) phải mang raiin_cnt LỚN HƠN dòng 初診 (lượt 1).
        const syosinRow = mine.find((r) => r.trtCd === SYOSIN_TRT_CD)
        const saisinRow = mine.find((r) => r.trtCd === SAISIN_TRT_CD)
        if (syosinRow && saisinRow) {
            expect
                .soft(
                    saisinRow.raiinCnt,
                    'dòng của lượt khám thứ 2 (再診) phải có raiin_cnt lớn hơn lượt 1 (初診)',
                )
                .toBeGreaterThan(syosinRow.raiinCnt)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    test(`TC-4 — 🐛 isl: 分 của 麻酔 ${ISL_TRT_CD} bị dồn nhầm vào trt_cnt (lô 1)`, async () => {
        await resetMonthTo([
            {
                trtCd: ISL_TRT_CD,
                trtSb: ISL_SB,
                trtCnt: ISL_MINUTES, // cột 回数 của lưới — với mã 50 đây là SỐ PHÚT
                trtPt: 30,
                dspTrt: NM.isl,
            },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 2, trtPt: 40, dspTrt: NM.plainA },
        ])

        const { rows: payload } = await pressF9AndSave()
        const sentIsl = payload.find((r) => Number(r['trtCd']) === ISL_TRT_CD)
        skipWithReason(
            sentIsl === undefined,
            `FE không gửi dòng trt_cd ${ISL_TRT_CD} lên bulk-save ⇒ dòng seed không lên được lưới. ` +
                'Kiểm tra master 処置 của tháng test có mã này không.',
        )
        expect(
            Number(sentIsl!['trtCnt']),
            `FE phải gửi 回数 = ${ISL_MINUTES} trong trtCnt (WinForm dùng CHUNG cột 回数 cho 分)`,
        ).toBe(ISL_MINUTES)

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        const islRow = saved.find((r) => r.trtCd === ISL_TRT_CD)
        expect(islRow, `không đọc lại được dòng trt_cd ${ISL_TRT_CD}`).toBeTruthy()

        expect
            .soft(
                islRow!.isl,
                `trt_cd ${ISL_TRT_CD} (ＩＳＬ 浸潤麻酔): 回数 ${ISL_MINUTES} phải vào cột isl ` +
                    '(modSave.cs:2034-2049). Bản port hard-code isl = 0 ở TrnTrn.cs:163.',
            )
            .toBe(ISL_MINUTES)
        expect
            .soft(
                islRow!.trtCnt,
                `trt_cd ${ISL_TRT_CD}: WinForm ép trt_cnt = 0 khi đã dồn 回数 sang isl.`,
            )
            .toBe(0)

        // Đối chứng: mã thường KHÔNG được đụng vào isl, 回数 vẫn nằm ở trt_cnt.
        const plainRow = saved.find((r) => r.trtCd === PLAIN_TRT_CD)
        if (plainRow) {
            expect
                .soft(plainRow.isl, `đối chứng: mã thường ${PLAIN_TRT_CD} phải giữ isl = 0`)
                .toBe(0)
            expect
                .soft(plainRow.trtCnt, `đối chứng: mã thường ${PLAIN_TRT_CD} giữ 回数 ở trt_cnt`)
                .toBe(2)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-5 — 🐛 F9 phải hỏi 3 nút はい/いいえ/キャンセル (lô 2)', async () => {
        await openTreatmentScreen()
        await step()

        await page.keyboard.press('F9')
        await step()

        // BẪY ĐÃ VẤP (2026-08-10): KHÔNG dùng `getByRole('dialog')` ở đây.
        // `confirmDialog` render qua `DialogShell` = Radix `AlertDialog` ⇒ role là
        // **alertdialog**, KHÔNG phải dialog (khác `DraggableDialog` của các dialog
        // nghiệp vụ — xem GUIDELINE 10.3). Bó nhầm vào 'dialog' làm CẢ BA vế đỏ,
        // kể cả nút はい/Yes vốn chắc chắn có ⇒ báo sai chỗ hỏng.
        // Nhận CẢ HAI role: nếu lô 2 sửa bằng `DataModifiedConfirmDialog`
        // (DraggableDialog, role=dialog) thay vì `confirmDialog.yesNoCancel`
        // (AlertDialog, role=alertdialog) thì TC vẫn tìm đúng hộp thoại.
        const dialog = page.locator('[role="alertdialog"], [role="dialog"]').last()
        await expect(dialog, 'Bấm F9 không bung hộp thoại xác nhận nào').toBeVisible({
            timeout: 15_000,
        })
        // Chẩn đoán trước khi assert: F9 có thể bị chặn bởi guardCurrentMonth
        // (「当月以外の操作はできません」) hoặc bị AutoSantei chen ngang, và lúc đó
        // hộp thoại bung ra KHÔNG phải hộp thoại lưu. In nội dung thật ra để phân
        // biệt "thiếu nút" với "sai hộp thoại".
        console.log(
            `TC-5 hộp thoại đang hiện: ${JSON.stringify(
                (await dialog.textContent().catch(() => null))?.replace(/\s+/g, ' ').trim() ?? null,
            )}`,
        )

        await expect(
            dialog.getByText(/保存しますか？/),
            'Hộp thoại bung ra nhưng không phải hộp thoại xác nhận lưu của F9 — xem log ' +
                '「TC-5 hộp thoại đang hiện」 ở trên để biết cái gì đã chen vào',
        ).toBeVisible({ timeout: 10_000 })

        const yes = dialog.getByRole('button', { name: /^(はい|Yes|OK)$/ })
        const no = dialog.getByRole('button', { name: /^(いいえ|No)$/ })
        const cancel = dialog.getByRole('button', { name: /^(キャンセル|Cancel)$/ })

        await expect
            .soft(yes, 'thiếu nút はい/Yes trên hộp thoại F9')
            .toHaveCount(1, { timeout: 10_000 })
        await expect
            .soft(
                no,
                'thiếu nút いいえ/No — WinForm SaveChangesAndExit (modSave.cs:100-132) hỏi ĐỦ 3 nút. ' +
                    'Bản port dùng confirmDialog 2 nút ở treatment-entry-detail.tsx:3548, ' +
                    'trong khi component 3 nút DataModifiedConfirmDialog ĐÃ CÓ SẴN.',
            )
            .toHaveCount(1, { timeout: 10_000 })
        await expect
            .soft(cancel, 'thiếu nút キャンセル/Cancel — nút DUY NHẤT cho phép ở lại màn hình')
            .toHaveCount(1, { timeout: 10_000 })

        // Đóng mà TUYỆT ĐỐI KHÔNG lưu: ưu tiên キャンセル, không có thì いいえ, cuối
        // cùng mới Escape. Không bao giờ bấm はい ở TC này.
        if ((await cancel.count()) > 0) await cancel.first().click()
        else if ((await no.count()) > 0) await no.first().click()
        else await page.keyboard.press('Escape')
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-6 — 🐛 wait (受付) không bị xoá sau khi lưu (lô 3)', async () => {
        skipWithReason(
            SKIP_WAIT,
            'TEST_P0_SKIP_WAIT=1 — tenant đang TẮT 受付患者一覧 (iniconfig.pat_list_flg ≠ 1), ' +
                'WinForm cũng không xoá trong trường hợp đó',
        )

        waitRowCreated = (await ensureWaitRow(Number(PAT_NO))) || waitRowCreated
        expect(
            await countWait(Number(PAT_NO)),
            'không dựng được dòng wait để thử',
        ).toBeGreaterThan(0)

        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])
        await pressF9AndSave()

        expect
            .soft(
                await countWait(Number(PAT_NO)),
                'Sau F9, bệnh nhân phải bị xoá khỏi 受付 (Wait.cs:210-228 `delete from wait where pat_no`, ' +
                    'gọi ở modSave.cs:580). Bản port chưa đụng bảng wait — SaveTreatmentsHandler.cs:31 TODO. ' +
                    'HỆ QUẢ VỚI KHÁCH: bệnh nhân khám xong vẫn nằm trong 受付一覧.',
            )
            .toBe(0)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-7 — 🐛 insurance.med_ed_dt không được cập nhật (lô 3)', async () => {
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])
        await pressF9AndSave()

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        expect(saved.length, 'không có dòng nào sau F9').toBeGreaterThan(0)

        const ins = await readInsurance(Number(PAT_NO))
        expect(ins.length, `bệnh nhân ${PAT_NO} không có dòng insurance nào`).toBeGreaterThan(0)

        // WinForm ghi max(trt_dt) cho ĐÚNG 枝番 có dòng. Spec chỉ seed vào TRT_DT nên
        // ít nhất MỘT 枝番 phải mang đúng ngày đó.
        const hit = ins.some((r) => r.medEdDt === TRT_DT)
        expect
            .soft(
                hit,
                `Sau F9, ít nhất một 枝番 phải có med_ed_dt = ${TRT_DT} ` +
                    '(modSave.cs:1334 SetLastTrtDay). Bản port chưa ghi — SaveTreatmentsHandler.cs:34, ' +
                    'và TODO đó còn ghi NHẦM tên cột là `last_trt_dt` (cột này KHÔNG TỒN TẠI). ' +
                    `Đang đọc được: ${ins.map((r) => `br${r.patBr}=${r.medEdDt}`).join(', ')}`,
            )
            .toBe(true)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-8 — 🐛 trn_status không sinh sau khi lưu (lô 6 — CHẶN KÉP)', async () => {
        // ⚠️ ĐỌC KỸ TRƯỚC KHI SỬA: TC này chỉ xanh khi có ĐỦ HAI thứ.
        //   (a) pricing engine ghi `price > 0` cho dòng bảo hiểm — hiện `TrnTrn.cs:166`
        //       để 0, mà driver của Upd_TrnStatus lọc `price > 0` (modTrnSubcode.cs
        //       → Trntrn.cs:1426) ⇒ dù có port side-effect thì vẫn 0 dòng.
        //   (b) `Upd_TrnStatus` được port (SaveTreatmentsHandler.cs:32 TODO).
        // Đỏ ở đây KHÔNG phải bằng chứng riêng cho (b).
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, jihiFlg: 0, dspTrt: NM.plainA },
        ])
        await pressF9AndSave()

        const saved = await readP0Rows(Number(PAT_NO), TRT_DT)
        const insured = saved.filter((r) => r.trtCd === PLAIN_TRT_CD)
        expect(insured.length, 'không có dòng bảo hiểm nào sau F9').toBeGreaterThan(0)

        const anyPriced = insured.some((r) => r.price > 0)
        console.log(
            `TC-8 chẩn đoán: price của dòng bảo hiểm = ${insured.map((r) => r.price).join(', ')} ` +
                `⇒ điều kiện (a) ${anyPriced ? 'ĐÃ ĐẠT' : 'CHƯA ĐẠT'}`,
        )

        expect
            .soft(
                anyPriced,
                'ĐIỀU KIỆN (a): dòng bảo hiểm phải có price > 0 thì Upd_TrnStatus mới nhìn thấy ' +
                    '(driver: `select distinct pat_br ... where price > 0 and jihi_flg in (0,1,2)`). ' +
                    'Bản port để price = 0 — TrnTrn.cs:166, chờ pricing engine.',
            )
            .toBe(true)

        expect
            .soft(
                await countTrnStatus(Number(PAT_NO), SINRYO_YM),
                `ĐIỀU KIỆN (b): tháng ${SINRYO_YM} phải có ít nhất 1 dòng trn_status sau F9 ` +
                    '(modTrnSubcode.cs:227 Upd_TrnStatus). Bản port chưa port — ' +
                    'SaveTreatmentsHandler.cs:32 TODO, và `TrnStatus` còn CHƯA được expose ' +
                    'trong IAppUserDbContext. HỆ QUẢ VỚI KHÁCH: レセプト / 集計 tháng sai.',
            )
            .toBeGreaterThan(0)
    })
    // ─────────────────────────────────────────────────────────────────────────
    test('TC-9 — 楽観ロック: token lệch ⇒ 409, hỏi 上書き, từ chối thì KHÔNG ghi gì (lô 4)', async () => {
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])

        // "Máy khác" lưu cùng tháng ⇒ token trên màn hình này thành cũ.
        const bumped = await bumpMonthUpdatedAt(Number(PAT_NO), TRT_DT)
        expect(bumped, 'không đẩy được updated_at ⇒ không dựng được tình huống xung đột')
            .toBeGreaterThan(0)

        const before = await readMonthRowIds(Number(PAT_NO), TRT_DT)
        expect(before.length, 'tháng test đang rỗng ⇒ TC này không có gì để bảo vệ')
            .toBeGreaterThan(0)

        const { payload, status } = await pressF9RawSave()

        // Vế 1 — FE THẬT SỰ có gửi token.
        // Đây là vế dễ hỏng nhất và hỏng thì im lặng: thiếu field này thì BE bỏ
        // qua phần so sánh, mọi TC khác vẫn xanh, và cơ chế khoá thành đồ trang trí.
        expect
            .soft(
                payload['expectedUpdatedAt'],
                'payload bulk-save thiếu `expectedUpdatedAt` ⇒ FE chưa latch token lúc nạp lưới ' +
                    '(treatment-entry-detail.tsx, khối seed `seededPage !== treatmentsPage`). ' +
                    'BE sẽ bỏ qua phần so sánh và KHÔNG bao giờ báo xung đột.',
            )
            .toBeTruthy()

        // Vế 2 — BE từ chối.
        expect
            .soft(
                status,
                'token đã cũ mà bulk-save vẫn không trả 409 ' +
                    '(BusinessErrorCodes.Treatment.ConcurrentSaveConflict)',
            )
            .toBe(409)

        // Vế 3 — hộp thoại đúng CHỮ của WinForm.
        const dlg = overwriteDialog()
        await expect
            .soft(dlg, 'không thấy hộp thoại 「他の端末で処置データが更新されています。上書きしますか？」')
            .toBeVisible({ timeout: 15_000 })

        if (await dlg.isVisible().catch(() => false)) {
            const no = dlg.getByRole('button', { name: /^(いいえ|No)$/ })
            const yes = dlg.getByRole('button', { name: /^(はい|Yes)$/ })
            await expect.soft(yes, 'hộp thoại 上書き thiếu nút はい').toHaveCount(1)
            await expect.soft(no, 'hộp thoại 上書き thiếu nút いいえ').toHaveCount(1)

            // Vế 4 — mặc định phải là 「いいえ」 (MsgBoxStyle.DefaultButton2).
            // Không phải chi tiết trang trí: người dùng quen Enter, mà Enter rơi
            // vào はい thì cái khoá này tự vô hiệu đúng lúc cần nhất.
            await expect
                .soft(
                    no,
                    'nút mặc định phải là 「いいえ」 — WinForm dùng MsgBoxStyle.DefaultButton2 ' +
                        '(modSave.cs:548). Nếu đang focus はい thì Enter theo phản xạ sẽ đè mất ' +
                        'dữ liệu của máy kia.',
                )
                .toBeFocused()

            await no.first().click()
            await step()
        }

        // Vế 5 — từ chối ghi đè ⇒ DB không được đụng tới MỘT dòng nào.
        expect(
            await readMonthRowIds(Number(PAT_NO), TRT_DT),
            'Một lượt lưu bị 409 phải KHÔNG chạm DB — BE so token TRƯỚC RemoveRange, ' +
                'bên trong transaction. Bộ id đổi ⇒ đã có xoá mềm + chèn lại.',
        ).toEqual(before)

        // Vế 6 — parity bug 2d: WinForm vẫn ĐÓNG màn hình sau khi chọn 「いいえ」
        // (SaveChangesAndExit modSave.cs:120 vứt giá trị trả về của SaveData).
        // Xem userapp/inp-parity-bugs-reproduction.md §2d.
        await expect
            .soft(
                page,
                'PARITY 2d: WinForm rời màn hình 診療入力 ngay cả khi từ chối ghi đè ' +
                    '(nội dung đang nhập mất). Nếu vế này đỏ tức là web đã CHỌN ở lại — ' +
                    'không sai về mặt sản phẩm, nhưng lệch parity, phải cập nhật md.',
            )
            .not.toHaveURL(/\/treatments\/\d+/, { timeout: 15_000 })
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-10 — 楽観ロック: chọn 「はい」 ⇒ gửi lại kèm force và ghi đè được (lô 4)', async () => {
        await resetMonthTo([
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: 40, dspTrt: NM.plainA },
        ])

        const bumped = await bumpMonthUpdatedAt(Number(PAT_NO), TRT_DT)
        expect(bumped, 'không dựng được tình huống xung đột').toBeGreaterThan(0)

        const before = await readMonthRowIds(Number(PAT_NO), TRT_DT)
        const { status } = await pressF9RawSave()
        expect(status, 'không tái hiện được 409 ⇒ phần còn lại của TC vô nghĩa').toBe(409)

        const dlg = overwriteDialog()
        await expect(dlg, 'không thấy hộp thoại 上書き').toBeVisible({ timeout: 15_000 })

        // Lượt gửi lại — phải mang force: true.
        const retry = page.waitForResponse(
            (r) =>
                r.url().includes('/tenant/treatment/bulk-save') && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await dlg.getByRole('button', { name: /^(はい|Yes)$/ }).first().click()
        await step()

        const resp = await retry
        const retryPayload = resp.request().postDataJSON() as Record<string, unknown>
        if (resp.status() >= 300) {
            console.log(`bulk-save (force) ${resp.status()} body: ${await resp.text().catch(() => '(unreadable)')}`)
        }

        expect
            .soft(
                retryPayload['force'],
                'lượt gửi lại sau khi chọn 「はい」 phải mang `force: true`, nếu không BE lại so ' +
                    'token cũ và trả 409 lần nữa ⇒ người dùng bấm はい mãi không lưu được',
            )
            .toBe(true)

        expect.soft(resp.status(), 'lượt gửi lại kèm force vẫn không lưu được').toBeLessThan(300)

        expect
            .soft(
                await readMonthRowIds(Number(PAT_NO), TRT_DT),
                'sau khi ghi đè, bộ dòng của tháng phải khác bộ cũ (xoá mềm + chèn lại)',
            )
            .not.toEqual(before)
    })
})
