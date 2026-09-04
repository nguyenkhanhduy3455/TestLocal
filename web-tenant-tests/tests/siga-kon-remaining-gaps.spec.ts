import { expect, test, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteKonRow,
    deleteSigaRow,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    deleteTreatmentRowsByTrtCd,
    ensureKonRow,
    ensureSigaRow,
    findMstTrt,
    findTreatmentRows,
    readKon,
    readSiga,
    restoreKon,
    restoreSiga,
    seedTreatmentRows,
    writeKonTeeth,
    writeSigaTeeth,
    type KonSnapshot,
    type SigaSnapshot,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — BỐN gap còn lại của 自歯状況変更 / 根数変更 (siga & kon).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web. Từ 2026-09-03 cả bốn gap đã đóng nên KHÔNG còn TC nào gắn 🐛: một TC đỏ
 * từ đây là HỒI QUY thật, không phải "gap đã biết".
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BỐN GAP TRONG FILE NÀY
 * ═════════════════════════════════════════════════════════════════════════════
 *  A. TC-3       ＥＭＲ(４根) 122/3 → `ekon_n = 4` / `nkon_n = 4`  (modSave.cs:770-808)
 *  B. TC-4/4b    歯根嚢胞摘出手術 185 + 抜歯同時 → 欠損歯          (modSave.cs:1031-1085)
 *  C. TC-5/5b    「いいえ」 ở dirty gate → RestoreData / Restore_SK  (modSave.cs:453-462)
 *  D. TC-6       bệnh nhân KHÔNG có dòng `siga` → F9 phải tạo rồi ghi (modKonSiga.cs:77)
 *
 * ── CẬP NHẬT 2026-09-03: GAP C ĐÃ ĐƯỢC PORT, TC-5 ĐÃ VIẾT LẠI ────────────────
 * Nhánh `fix/inp-siga-delextrec-pmode-kesson` thêm ba đường ghi 歯式/根数 chạy TRƯỚC
 * F9 (`SigaChg`, `DelExtRec`, `Chk_PModeKesson`) và port luôn `Restore_SK`. Đúng cái
 * ngày mà bản cũ của TC-5 đã dự báo: 「TC này sẽ ĐỎ đúng lúc có người thêm một đường
 * ghi 歯式/根数 chạy TRƯỚC F9 … mà quên phần lùi」.
 *
 * Nhưng WinForm KHÔNG lùi cả ba — và đó mới là điều phải khoá:
 *   · `SigaChg`         BẬT `pSiga_chg` ⇒ 「いいえ」 LÙI            → TC-5b
 *   · `DelExtRec`       KHÔNG bật cờ    ⇒ 「いいえ」 KHÔNG lùi      → TC-5
 *   · `Chk_PModeKesson` KHÔNG bật cờ    ⇒ 「いいえ」 KHÔNG lùi      → p-mode-kesson-siga.spec.ts
 * Bất biến cũ ("discard xong DB phải y nguyên") vì thế đã SAI, không phải chỉ lạc
 * hậu. Xem `userapp/inp-p0-open-issues.md` ISSUE-15.
 *
 * ── LỊCH SỬ CHẠY THẬT (tenant1 local, PAT_NO 12138) ─────────────────────────
 * 2026-08-03 — TRƯỚC khi sửa: 3 passed / 3 failed. Cả bốn gap đều được tái hiện:
 *   TC-3 ✘ ekon_11 = NULL, nkon_4 = NULL   (đối chứng 122/0 giữ NULL — đúng)
 *   TC-4 ✘ hộp thoại 抜歯同時 KHÔNG bung; se_11 = 0, sn_4 = 5
 *   TC-5 ✓ cả hai vế xanh ⇒ hồ sơ gap C ĐÓNG (xem mục 「TC-5 …」 bên dưới)
 *   TC-6 ✘ POST bulk-save → 200 nhưng dòng siga VẪN KHÔNG CÓ ⇒ mất 歯式 ÂM THẦM
 *
 * 2026-09-03 — SAU nhánh `fix/inp-siga-delextrec-pmode-kesson`: cả bốn gap đã đóng.
 *   TC-5 được VIẾT LẠI (bất biến cũ đã sai — xem khối 「HAI NỬA BẤT ĐỐI XỨNG」) và
 *   thêm TC-5b. Kỳ vọng hiện tại: TOÀN BỘ XANH. Một TC đỏ từ đây trở đi là HỒI QUY
 *   thật, không còn là "gap đã biết".
 *
 * 2026-08-03 — SAU commit d42ee857 「診療入力の登録で自歯状況・根数が反映されない不具合を
 *   修正」: TC-3 → ekon_11 = 4 / nkon_4 = 4; TC-6 → 「dòng siga ĐÃ CÓ, se_11 = 4」;
 *   TC-4 vế hộp thoại → bung. TC-4 khi ấy VẪN đỏ ở phần soi `siga`, nhưng đó là lỗi
 *   của CÁCH VIẾT TEST chứ không phải của fix — nó seed dòng 185 thẳng vào DB, mà
 *   như thế cờ 抜歯同時 luôn = 0 (xem `enterCystViaUi`). TC-4 đã được viết lại cho đi
 *   hẳn đường UI, kèm TC-4b khoá vế 「いいえ」.
 *
 * ── VÌ SAO LOG `beforeAll` LẶP LẠI NHIỀU LẦN KHI CHẠY (KHÔNG phải lỗi spec) ──
 *  Playwright dựng WORKER MỚI sau mỗi test FAIL để bảo đảm môi trường sạch ⇒
 *  `beforeAll` (login + mở màn) và `afterAll` (dọn) chạy lại một lượt cho mỗi lần
 *  đỏ. File này cố ý có 3 TC đỏ nên sẽ thấy 3-4 lượt login và 3-4 dòng 「dọn: …」.
 *  Tốn thời gian (~2 phút) nhưng KHÔNG sai: mỗi lượt đều tự chụp lại snapshot và
 *  tự dọn, và `resetMonthTo()` purge sạch trước mỗi lần seed nên không giẫm chân.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO FILE NÀY KHÔNG DÙNG `describe.serial`
 * ═════════════════════════════════════════════════════════════════════════════
 * `serial` = một test đỏ thì MỌI test sau bị skip. File này ra đời để phơi BỐN gap
 * cùng lúc, nên `serial` sẽ chỉ cho nhìn thấy gap đầu tiên.
 * Dùng `mode: 'default'`: các test vẫn chạy TUẦN TỰ trong CÙNG một worker (nên
 * `page` chung tạo ở `beforeAll` vẫn hợp lệ, cả file login MỘT lần — Rule 10.1 /
 * Rule 19) nhưng KHÔNG fail-fast ⇒ một lượt chạy thấy đủ cả bốn mặt.
 * GIỮ NGUYÊN kể cả khi cả bốn gap đã đóng (2026-09-03): mỗi TC dựng lại dữ liệu của
 * chính nó bằng `resetMonthTo()`, nên chúng độc lập, và khi có hồi quy thì một lượt
 * chạy vẫn cho thấy hồi quy đó ảnh hưởng mấy mặt.
 * `retries: 0` cũng là cố ý: retry chỉ tốn thêm một vòng login + setup.
 *
 * Trong MỖI testcase gap, các vế đều dùng `expect.soft` để một lần chạy thấy hết
 * các mặt của cùng một defect, thay vì sửa xong vế này mới lòi vế kia.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (src/OCHACOM)
 * ═════════════════════════════════════════════════════════════════════════════
 * ── Nền chung ────────────────────────────────────────────────────────────────
 *  · INP/Lib/modSave.cs:742-1107 `SigaChg_Save` 「自歯状況変更」 — chạy trong F9
 *    (`Save_Data` gọi ở :617), duyệt MỌI dòng 当月 từ `prvIntPos`, phân loại từng
 *    ô 部位 sau khi bóc mốc 100: `1..9` = 永久歯, `11..19` = 乳歯; cột 乳歯 map
 *    `i<16 → n=i-2`, `16≤i<29 → n=i-8`. Cuối mỗi dòng phát
 *    `update Siga set …` (:1090) và `update Kon set …` (:1100).
 *  · INP/Lib/CommonChk.cs:497-580 `chkSiga` — MIỀN GIÁ TRỊ (nguồn chân lý):
 *      永久歯 SE : 0=生活歯, 1/2/3=失活歯, 4=欠損歯       (cột `se_*` DEFAULT 0)
 *      乳歯   SN : 5=生活歯, 6/7/8=失活歯, 9=欠損歯       (cột `sn_*` DEFAULT 5)
 *  · INP/Lib/modKonSiga.cs:44-84 `pGet_KON` / `pGet_SIGA` 「歯牙情報保持」 — doc-comment
 *    ghi rõ 「レコードがない場合作成する」: mở màn mà chưa có dòng thì TẠO, rồi giữ
 *    làm snapshot `pKon_old` / `pSiga_old` và đặt cờ đổi về false.
 *
 * ── A. ＥＭＲ(４根) 122/3 ──────────────────────────────────────────────────────
 *  · modSave.cs:770-808 — case 122 + `intN == 3`: `pbui[i] %= 100` rồi
 *    永久歯 ⇒ `EKon{i+1} = 4`; 乳歯 ⇒ `NKon{i-2} = 4` / `NKon{i-8} = 4`.
 *  · frm203016.cs:1024-1031 + 1141-1164 — `IregCodChk` case 122 → `SigaChg(122,3)`:
 *    chiều input-time cũng ghi `EKon{i+1} = 4` ngay khi chốt 処置.
 *    ⚠️ BUG CÓ THẬT TRONG CHÍNH WINFORM: nhánh 乳歯 của `SigaChg`
 *    (frm203016.cs:1155-1160) gọi `makeSql("NKon", …, ref strSiga)` — nhét
 *    `NKon{n} = 4` vào câu UPDATE bảng **Siga**. Nhánh save-time (modSave.cs:800/804)
 *    thì ĐÚNG (`ref strKon`). File này chỉ soi đường F9 ⇒ nằm gọn trong phần
 *    WinForm làm đúng. ĐỪNG port theo nhánh input-time.
 *
 * ── B. 歯根嚢胞摘出手術 185 ───────────────────────────────────────────────────
 *  · frm203016.cs:1045-1057 — `IregCodChk` case 185: NGAY khi chốt 処置, bung hỏi
 *    「歯根嚢胞摘出手術と同時に抜歯手術を行いましたか？」 (MsgDialog Q00200).
 *      Yes → `SigaChg(179, 0)` (ghi 欠損歯 y hệt một ca 抜歯 thật) + `ChkPExt` khi
 *            `pInpOpt[14] == 1` + đặt cờ `dt.Rows[idx][74] = 1`;
 *      No  → `dt.Rows[idx][74] = 0`, KHÔNG đụng 歯式.
 *  · modSave.cs:1031-1085 — `SigaChg_Save` case 185: ở F9, nếu `hFG1[74, j] != 0`
 *    thì GHI LẠI đúng thế (`SE{n} = 4` / `SN{n} = 9`).
 *
 * ── C. RestoreData / Restore_SK ──────────────────────────────────────────────
 *  · modSave.cs:100-133 `SaveChangesAndExit` / :154-226 `ExitWithoutSaving` — hộp
 *    thoại 3 nút 「処置データは変更されています。保存しますか？」:
 *    Yes → `SaveData`; **No → `RestoreData(con)`**; Cancel → ở lại.
 *  · modSave.cs:453-462 `RestoreData` — mở transaction, gọi `Restore_SK` (歯牙+根)
 *    và `Restore_TrtState`, commit.
 *  · modSave.cs:4649-4743 `Restore_SK` / `Restore_Siga` / `Restore_Kon` — ghi lại
 *    ĐỦ 52 cột từ snapshot, chỉ chạy khi có cờ `pSiga_chg` / `pKon_chg`.
 *  · modSave.cs:583 — F9 cũng gọi `Restore_SK` TRƯỚC `SigaChg_Save` (:617): WinForm
 *    luôn "lùi về mốc mở màn rồi dựng lại", còn bản port thì "Revert(dòng cũ) rồi
 *    Apply(dòng mới)".
 *
 * ── D. Thiếu dòng siga ───────────────────────────────────────────────────────
 *  · modKonSiga.cs:70-84 `pGet_SIGA` — tạo dòng nếu chưa có, nhờ vậy MỌI
 *    `update Siga … where pat_no = …` phía sau đều chắc chắn trúng 1 dòng.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN PORT ĐANG CÓ (đọc 2026-08-03, nhánh feat/treatment-settings-manager)
 * ═════════════════════════════════════════════════════════════════════════════
 *  A. `ToothStatusChangeCalculator.ApplyKon:126` chặn cứng
 *     `trtCd != 179 || trtSb != 5 || rootCnt == 0` ⇒ 122/3 không có đường tới `kon`.
 *     `SaveTreatmentsHandler.cs:240` còn gác thêm: payload không có 179/5 thì handler
 *     KHÔNG đọc bảng `kon` lần nào.
 *  B. `ToothStatusChangeCalculator.ConditionValues:162-173` CHỈ nhận 170/176/179 —
 *     mã 185 rơi vào `_ => null`. Web cũng KHÔNG có hộp thoại 「…同時に抜歯手術…」
 *     (grep 「歯根嚢胞」/「同時に抜歯」 trong apps/web-tenant = 0 hit), và cờ WinForm
 *     dùng (grid col 74) KHÔNG có cột nào trong `trn_trn` — cả WinForm `InsData2`
 *     (modSave.cs:2000-2115) lẫn bản port đều không ghi nó xuống DB.
 *     Class-doc của chính file đó đã tự nhận: 「EMR-4根 (122/3) and 歯根嚢胞摘出 (185)
 *     根数 writes are still pending」 (:29-30).
 *  C. ✅ ĐÃ PORT 2026-09-03. FE giữ `toothStatusSnapshotRef` (= `pSiga_old`/`pKon_old`,
 *     chụp ở lần fetch ĐẦU sau khi mount) và `toothStatusChgRef` (= `pSiga_chg`/
 *     `pKon_chg`); cả ba cửa 「いいえ」 (F9 / F10 戻る / F12 メニュー) gọi
 *     `POST /tenant/siga/restore`, và F9 gửi kèm `toothStatusRestore` để BE chạy
 *     `Restore_Siga`/`Restore_Kon` ngay trước `SigaChg_Save`.
 *     ⚠️ `Restore_TrtState` (người thứ ba của `RestoreData`) VẪN chưa port — web vẫn
 *     chưa có đường ghi `trt_state` nào để mà lùi (ISSUE-6).
 *  D. `SaveTreatmentsHandler.cs:218-235`:
 *         var siga = await db.Sigas.FirstOrDefaultAsync(...);
 *         if (siga is not null) { Revert(...); Apply(...); }
 *     Không có dòng thì bỏ qua TOÀN BỘ 自歯状況変更 — không log, không lỗi. Nơi DUY
 *     NHẤT tạo dòng `siga` trong BE là `RegisterPatientHandler.cs:204`, tức chỉ bệnh
 *     nhân đăng ký BẰNG MÀN 患者登録 CỦA BẢN WEB mới có.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TC-5 / TC-5b (Restore_SK) — HAI NỬA BẤT ĐỐI XỨNG, ĐỌC KỸ TRƯỚC KHI SỬA
 * ═════════════════════════════════════════════════════════════════════════════
 * WinForm ghi `siga`/`kon` NGAY LÚC NHẬP, tức DB đã đổi TRƯỚC khi người dùng kịp
 * quyết định lưu hay không ⇒ nó phải có `Restore_SK` để lùi. Nhưng cái van của
 * `Restore_SK` là cờ `pSiga_chg` / `pKon_chg` (modSave.cs:4684/:4689), và chỉ
 * `SigaChg` bật cờ đó (frm203016.cs:1282/:1295). Hai đường ghi kia thì không:
 *
 *   · TC-5b — phiên có NHẬP 処置 (185 + はい → `SigaChg(179,0)`): cờ BẬT ⇒ 「いいえ」
 *     phải lùi 歯式 về đúng snapshot lúc mở màn. Đây là vế CHỨNG MINH `Restore_SK`
 *     thật sự chạy; thiếu nó thì một bản port "không ghi gì trước F9" cũng làm TC-5
 *     xanh y hệt (đúng là chuyện đã xảy ra ở lần chạy 2026-08-03).
 *
 *   · TC-5 — phiên CHỈ XOÁ dòng 抜歯 (`DelExtRec`): cờ KHÔNG bật ⇒ 「いいえ」 KHÔNG
 *     lùi. Kết quả là một trạng thái TỰ MÂU THUẪN mà WinForm chấp nhận: răng đã về
 *     健全歯 trong khi dòng 抜歯 vẫn còn nguyên trong `trn_trn` (vì không lưu thì
 *     không có gì bị xoá). Nghe như bug — và đúng là bug, nhưng là bug CỦA WINFORM,
 *     port nguyên theo quyết định 2026-08-25. Hồ sơ: ISSUE-15.
 *
 * ⛔ ĐỪNG "sửa" TC-5 thành "sau 「いいえ」 thì siga phải y nguyên". Bất biến đó chỉ
 *    đúng hồi bản port chưa ghi gì trước F9; nay nó mâu thuẫn với chính WinForm.
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO 185 PHẢI NHẬP QUA UI, KHÔNG SEED DB (bẫy đã vấp — đừng lặp lại)
 * ═════════════════════════════════════════════════════════════════════════════
 * Cờ 抜歯同時 là grid col 74 của WinForm, và cột đó KHÔNG có chỗ trong `trn_trn`
 * (`InsData2`, modSave.cs:2000-2115); bản port cũng vậy — nó chỉ sống trong payload
 * F9 dưới tên `splitRootCnt`. Hệ quả: một dòng 185 **seed thẳng vào DB** luôn đi lên
 * với `splitRootCnt = 0` = 「いいえ」, nên BE **đúng ra không được** đụng 歯式 — chính
 * WinForm cũng thế (`modSave.cs:1033` gác cả case 185 trên cờ đó).
 *
 * Bản đầu của TC-4 seed DB rồi đòi 欠損歯 ⇒ ĐỎ OAN, đổ tội nhầm cho BE ngay cả sau
 * khi BE đã đúng (xem 「LỊCH SỬ CHẠY THẬT」). TC-4/4b hiện tại nhập 185 QUA UI thật
 * (コードモード → 処置選択 → 確定 → はい/いいえ → 回数 Enter), và kiểm `bui` của dòng
 * ĐÃ LƯU trước khi kết luận về `siga`, để tách bạch "harness hỏng (không thừa kế
 * được 部位)" với "BE không ghi".
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU TỰ DỰNG (CÓ GHI DB — cần TEST_DB=1 và TEST_ALLOW_SAVE=1)
 * ═════════════════════════════════════════════════════════════════════════════
 * `beforeAll` chụp nguyên trạng `siga` + `kon` (IN RA LOG để cứu tay được) rồi mỗi
 * testcase tự dựng dữ liệu của mình qua `resetMonthTo([...])` — hàm này XOÁ SẠCH
 * mọi dòng test cũ trước khi seed, nên các phase không giẫm chân nhau.
 *
 * Ánh xạ ô 部位 → cột (tooth-bui.ts:25-34 + modSave.cs:788/800/995/1008):
 *   ô 0-7 右上(8→1), 8-15 左上(1→8), 16-23 右下(8→1), 24-31 左下(1→8)
 *   永久歯: ô i → `se_{i+1}` / `ekon_{i+1}`
 *   乳歯  : ô i<16 → `sn_{i-2}` / `nkon_{i-2}`;  ô 16≤i<29 → `_{i-8}`
 * Ba ô dùng xuyên suốt:
 *   ô 10 = 左上3 永久歯 (giá trị 1)  → se_11 / ekon_11
 *   ô 6  = 右上Ｂ 乳歯   (giá trị 11) → sn_4  / nkon_4
 *   ô 18 = 右下8 永久歯 (giá trị 1)  → se_19 / ekon_19   ← luôn là dòng ĐỐI CHỨNG
 *
 * ⚠️ RỦI RO: TC-6 XOÁ dòng `siga` của TEST_PAT_NO (tạo lại ngay trong chính testcase
 *    + một lần nữa ở afterAll). Bị Ctrl+C giữa chừng thì dòng đó chưa kịp phục hồi —
 *    nhưng snapshot đã in ra stdout ở beforeAll, dựng lại bằng tay được. An toàn nhất
 *    là trỏ TEST_PAT_NO vào bệnh nhân test, ĐỪNG dùng dữ liệu thật.
 *
 * ⚠️ SPEC NÀY BẤM F9 登録 ⇒ GHI DB THẬT (Rule 18.1). `bulk-save` XOÁ MỀM TOÀN BỘ
 *    処置行 của THÁNG rồi chèn lại từ payload (`SaveTreatmentsHandler.cs:97-100` +
 *    `:182-209`) — dòng thật của bệnh nhân trong tháng đó SẼ bị ghi lại (disp_no mới,
 *    dòng cũ mang `deleted_at`). beforeAll in ra số dòng thật bị ảnh hưởng; chọn
 *    TEST_PAT_NO / TEST_TRT_DT vào tháng KHÔNG có dữ liệu thật thì con số đó = 0.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY CẦN BIẾT
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. Ô 部位 để 0 thì save KHÔNG đụng `siga`/`kon` — testcase XANH GIẢ. Luôn seed
 *     `bui` (tham số của `seedTreatmentRows`).
 *  2. 乳歯 dùng giá trị ô `11..19`, KHÔNG phải `1..9`. Để 1 thì nó thành 永久歯 và
 *     nhánh SN/NKon không bao giờ chạy.
 *  3. Cột `kon` là **nullable** (schema.sql:3576) — KHÁC `siga` vốn NOT NULL có
 *     DEFAULT. Trạng thái xuất phát là `NULL`, và assert phải phân biệt được `null`
 *     (chưa từng ghi — đúng triệu chứng gap) với `0`.
 *  4. Xoá dòng ở FE chỉ đổi state; 歯式 chỉ nhúc nhích SAU F9. Assert ngay sau
 *     `Delete` là đỏ oan → luôn chờ response `POST /tenant/treatment/bulk-save`.
 *  5. Sau 登録 màn 診療入力 **tự dọn sạch lưới** (WinForm reset để nhận bệnh nhân kế
 *     tiếp) ⇒ `saveF9()` luôn nạp lại màn hình; không nạp lại thì testcase kế tiếp
 *     báo "seed hỏng" trong khi seed hoàn toàn đúng.
 *  6. Dòng 処置 có 部位 CÓ THỂ được mapper thăng lên 部位病名行 (`isBuiLineRow` —
 *     treatment-grid-rows.ts:71-80), khi đó `Delete` bung confirm
 *     「同一部位の処置を全て削除します」. `deleteRowByText` bấm Yes nếu có.
 *  7. Dọn dữ liệu phải đi BA ĐƯỜNG: vùng `disp_no >= 9000` (bản seed gốc), theo
 *     `dsp_trt` (bản do F9 chèn lại, disp_no từ 1), và theo ô 部位 (bắt 部位病名行 do
 *     chính app đẻ ra, vốn có `dsp_trt` rỗng).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19)
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-kon-remaining-gaps.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-kon-remaining-gaps.spec.ts --headed
 *
 * LUÔN chạy CẢ FILE, không bao giờ `-g` một testcase lẻ: các TC dùng chung `page`
 * và chung một mạch dựng dữ liệu.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — TC-6 XOÁ dòng siga của họ, đừng trỏ vào dữ liệu thật. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** Ngày test = HÔM NAY: chỉ dòng của tháng đang mở mới xoá/nhập tay được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** Rule 18.1 — mọi thao tác ghi DB phải nằm sau cờ env. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ─── 処置 đem thử ─────────────────────────────────────────────────────────────
/** 抜歯 — đường ĐÃ port đầy đủ, dùng làm ĐỐI CHỨNG xuyên suốt. */
const EXT_TRT_CD = 179
const EXT_SB = 1
const EXT_PT = 150
/** ＥＭＲ — WinForm hard-code 122 (modSave.cs:770, frm203016.cs:1024). */
const EMR_TRT_CD = 122
/** 枝番 3 = ＥＭＲ(４根) — ĐÚNG điều kiện `intN == 3` của SigaChg_Save. */
const EMR_SB_4ROOT = 3
/** 枝番 0 = ＥＭＲ(１根) — WinForm KHÔNG ghi 根数 cho nó (dùng làm đối chứng). */
const EMR_SB_1ROOT = 0
const EMR_PT_4ROOT = 75
const EMR_PT_1ROOT = 30
/** 根数 WinForm ghi cho ＥＭＲ(４根) — hằng số "4" nằm thẳng trong chuỗi SQL. */
const EMR_ROOT_CNT = 4
/** 歯根嚢胞摘出手術 — WinForm hard-code 185 (frm203016.cs:1045, modSave.cs:1031). */
const CYST_TRT_CD = 185
/** 枝番 0 = ＷＺ(歯冠大). Không cần 点数: dòng này nhập qua UI nên master tự cấp. */
const CYST_SB = 0

/**
 * `dsp_trt` của MỌI dòng spec này từng seed — dùng cả lúc locate trên lưới lẫn
 * lúc dọn. Thêm dòng mới thì PHẢI thêm tên vào đây, nếu không cleanup sẽ hụt và
 * để lại rác mang dáng dữ liệu thật.
 */
const NM = {
    extPerm: '抜歯(前歯)-対照',
    emrPerm: 'ＥＭＲ(4根)-永久歯',
    emrMilk: 'ＥＭＲ(4根)-乳歯',
    emr1Root: 'ＥＭＲ(1根)-対照',
    /** 部位病名行 để dòng 185 nhập qua UI thừa kế 部位 — xem seedBuiProviderRow(). */
    buiProvider: 'ＥＭＲ(1根)-部位提供',
    extDiscard: '抜歯(前歯)-discard',
    extNoSiga: '抜歯(前歯)-siga無し',
} as const
const ALL_NAMES = Object.values(NM)

// ─── Ô 部位 và cột tương ứng ──────────────────────────────────────────────────
/** Ô 10 (0-based) = 左上3, 永久歯 ⇒ `se_11` / `ekon_11`. */
const PERM_BUI_SLOT = 10
const PERM_SE_COL = PERM_BUI_SLOT + 1
const PERM_EKON_COL = PERM_BUI_SLOT + 1
/** Giá trị ô cho 永久歯 — miền `1..9`. */
const PERM_BUI_VAL = 1

/** Ô 6 (0-based) = 右上Ｂ, 乳歯 ⇒ `sn_4` / `nkon_4` (i<16 ⇒ i-2). */
const MILK_BUI_SLOT = 6
const MILK_SN_COL = MILK_BUI_SLOT - 2
const MILK_NKON_COL = MILK_BUI_SLOT - 2
/** Giá trị ô cho 乳歯 — miền `11..19` (11 = giá trị đầu của vòng `nextMilkVal`). */
const MILK_BUI_VAL = 11

/** Ô 18 (0-based) = 右下8, 永久歯 ⇒ `se_19` / `ekon_19` — luôn là dòng ĐỐI CHỨNG. */
const CTRL_BUI_SLOT = 18
const CTRL_SE_COL = CTRL_BUI_SLOT + 1
const CTRL_EKON_COL = CTRL_BUI_SLOT + 1

// ─── Miền giá trị 自歯状況 (CommonChk.cs:497-580 / ToothConditionChecker.cs) ───
/** 永久歯 生活歯 — cũng là DEFAULT của cột `se_*`. */
const SE_VITAL = 0
/** 永久歯 欠損歯 — giá trị 抜歯 ghi vào. */
const SE_MISSING = 4
/** 乳歯 生活歯 — cũng là DEFAULT của cột `sn_*`. NOT 0. */
const SN_VITAL = 5
/** 乳歯 欠損歯. */
const SN_MISSING = 9

const BULK_SAVE_PATH = '/tenant/treatment/bulk-save'
/** Endpoint `Restore_SK` — 「いいえ」 ở dirty gate (`TenantSigaEndpoints.cs`). */
const RESTORE_PATH = '/tenant/siga/restore'

/** Câu hỏi WinForm bung ra khi chốt 185 (frm203016.cs:1047). */
const CYST_CONFIRM_RE = /歯根嚢胞摘出手術と同時に抜歯手術を行いましたか/

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3
/** Chờ hộp thoại 185 — ngắn có chủ đích: nó KHÔNG tồn tại nên đừng treo test 30s. */
const CONFIRM_WAIT = 8_000

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|2` của data-grid-cell). */
    key: string
    text: string
}

/** Mảng 32 ô 部位 với đúng MỘT ô khác 0. */
const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

// Rule 5.3 — skip cấp file chỉ hiện chữ "skipped" trơ trọi ở terminal, nhìn y như
// đã chạy xong. In hẳn lý do + câu lệnh sửa ra stdout.
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (để seed 処置行 + đọc/khôi phục siga & kon)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (spec bấm F9 登録 ⇒ GHI DB thật)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  siga-kon-remaining-gaps.spec.ts BỎ QUA TOÀN BỘ testcase — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy cho ra gap bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-kon-remaining-gaps.spec.ts\n' +
            '   (bulk-save ghi lại TOÀN BỘ 処置行 của tháng test; TC-6 xoá dòng siga rồi tạo lại —\n' +
            '    đọc khối doc đầu file trước khi chạy trên dữ liệu thật)\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 処置行 + đọc/khôi phục siga & kon')
test.skip(
    !ALLOW_SAVE,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật (bulk-save ghi lại cả tháng)',
)

// mode 'default' (KHÔNG serial) — xem khối doc 「VÌ SAO FILE NÀY KHÔNG DÙNG serial」.
test.describe.configure({ mode: 'default', retries: 0, timeout: 300_000 })

test.describe('診療入力 — 4 gap còn lại của 自歯状況変更 / 根数変更 (siga & kon)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Nguyên trạng trước khi test đụng vào — trả lại ở afterAll. */
    let sigaBefore: SigaSnapshot | null = null
    let konBefore: KonSnapshot | null = null
    /** true khi dòng do CHÍNH test tạo ⇒ afterAll xoá hẳn thay vì restore. */
    let sigaRowCreated = false
    let konRowCreated = false

    const seOf = (s: SigaSnapshot, col: number) => s.se[col - 1]
    const snOf = (s: SigaSnapshot, col: number) => s.sn[col - 1]
    const ekonOf = (k: KonSnapshot, col: number) => k.ekon[col - 1]
    const nkonOf = (k: KonSnapshot, col: number) => k.nkon[col - 1]

    async function mustReadSiga(): Promise<SigaSnapshot> {
        const s = await readSiga(Number(PAT_NO))
        expect(s, `bệnh nhân ${PAT_NO} không còn dòng siga nào để đọc`).not.toBeNull()
        return s!
    }

    async function gridRows(): Promise<GridRow[]> {
        const raw = await ryoCells(page).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
                text: e.textContent ?? '',
            })),
        )
        return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
    }

    /**
     * Dò dòng theo TỪ KHOÁ (đã NFKC) — KHÔNG mốc theo số dòng: lưới virtualize các
     * tháng lịch sử (registration-table.tsx:206).
     */
    function findRow(rows: readonly GridRow[], ...keys: readonly string[]): GridRow | undefined {
        return rows.find((r) => keys.every((k) => r.text.includes(txt(k))))
    }

    /**
     * Bảo đảm khối THÁNG HIỆN HÀNH (nơi các dòng seed nằm) đã mount — lưới
     * virtualize các tháng lịch sử nên chỉ dòng trong khung nhìn mới ở trong DOM.
     */
    async function ensureBottomMounted() {
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
    }

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

    /**
     * Xoá HẲN mọi dòng do spec này từng tạo (BẪY 7: ba đường). Gọi trước mỗi lần
     * seed để các phase không giẫm chân nhau, và một lần nữa ở afterAll.
     */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        for (const trtCd of [EXT_TRT_CD, EMR_TRT_CD, CYST_TRT_CD]) {
            n += await deleteTreatmentRowsByDspTrt(
                Number(PAT_NO),
                TRT_DT,
                trtCd,
                ALL_NAMES,
            ).catch(() => 0)
        }
        for (const [slot, val] of [
            [PERM_BUI_SLOT, PERM_BUI_VAL],
            [MILK_BUI_SLOT, MILK_BUI_VAL],
            [CTRL_BUI_SLOT, PERM_BUI_VAL],
        ] as const) {
            n += await deleteTreatmentRowsByBui(
                Number(PAT_NO),
                TRT_DT,
                slot + 1,
                val,
            ).catch(() => 0)
        }
        // Lưới cuối cho dòng 185 NHẬP QUA UI: nó mang `dsp_trt` của master
        // (「ＷＺ(歯冠大)」) nên hai đường trên trượt, và nếu việc thừa kế 部位 hỏng thì
        // đường theo ô 部位 cũng trượt nốt (bui toàn 0).
        n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, CYST_TRT_CD).catch(() => 0)
        return n
    }

    /** Xoá sạch dòng test cũ → seed bộ mới → nạp lại màn hình. */
    async function resetMonthTo(rows: Parameters<typeof seedTreatmentRows>[2]) {
        await purgeTestRows()
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, rows)
        await openTreatmentScreen()
        await ensureBottomMounted()
    }

    /**
     * Xoá một dòng theo từ khoá: click ô 療法 để đặt focusedCell rồi `Delete`
     * (treatment-entry-detail.tsx:4091-4106 — WinForm grdRegi_KeyDown:3576-3587).
     * Bấm Yes nếu confirm 「同一部位の処置を全て削除します」 bung ra (BẪY 6).
     */
    async function deleteRowByText(...keys: readonly string[]) {
        await ensureBottomMounted()
        const row = findRow(await gridRows(), ...keys)
        expect(
            row,
            `không thấy dòng 「${keys.join(' + ')}」 trên lưới để xoá — seed hỏng hoặc màn hình ` +
                `đang mở tháng khác (TEST_TRT_DT = ${TRT_DT})`,
        ).toBeDefined()

        await page.locator(`[data-grid-cell="${row!.key}|2"]`).click()
        await page.keyboard.press('Delete')

        const confirmYes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        if (await confirmYes.count()) await confirmYes.first().click()

        await expect(
            ryoCells(page).filter({ hasText: keys[0]! }),
            `bấm Delete rồi mà dòng 「${keys.join(' + ')}」 vẫn còn trên lưới`,
        ).toHaveCount(0, { timeout: 15_000 })
    }

    /**
     * Bấm F9 登録, CHỜ ĐÚNG response bulk-save (Rule 7: mốc có thật, không sleep),
     * rồi NẠP LẠI màn hình (BẪY 5). Trả về HTTP status — TC-6 cần chính con số đó.
     */
    async function saveF9(): Promise<number> {
        await closeDialogs(page)
        const done = page.waitForResponse(
            (r) => r.url().includes(BULK_SAVE_PATH) && r.request().method() === 'POST',
            { timeout: 60_000 },
        )
        await page.getByRole('button', { name: /F9\s*登録/ }).click()
        const confirmYes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        if (await confirmYes.count()) await confirmYes.first().click()

        const res = await done
        await closeDialogs(page)
        await openTreatmentScreen()
        return res.status()
    }

    /** Mọi dòng seed phải lên được lưới thì assert phía sau mới có nghĩa. */
    async function expectRowsOnGrid(...names: readonly string[]) {
        await ensureBottomMounted()
        const rows = await gridRows()
        for (const name of names) {
            expect(
                findRow(rows, name),
                `không thấy dòng 「${name}」 — seed hỏng hoặc màn hình đang mở tháng khác ` +
                    `(TEST_TRT_DT = ${TRT_DT}). ${rows.length} dòng đang mount, 15 dòng CUỐI: ` +
                    rows
                        .map((r) => r.text)
                        .slice(-15)
                        .join(' / '),
            ).toBeDefined()
        }
    }

    test.beforeAll(async ({ browser }) => {
        // ── DB: chụp nguyên trạng, in ra để cứu tay được ─────────────────────
        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        konRowCreated = await ensureKonRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
        konBefore = await readKon(Number(PAT_NO))
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)

        if (sigaBefore) {
            console.log(
                `siga nguyên trạng của ${PAT_NO} (LƯU LẠI phòng khi test bị kill giữa chừng):\n` +
                    `  se = [${sigaBefore.se.join(',')}]\n` +
                    `  sn = [${sigaBefore.sn.join(',')}]` +
                    (sigaRowCreated ? '\n  (dòng siga do test vừa tạo)' : ''),
            )
        }
        if (konBefore) {
            console.log(
                `kon nguyên trạng: ekon_${PERM_EKON_COL} = ${ekonOf(konBefore, PERM_EKON_COL)}, ` +
                    `nkon_${MILK_NKON_COL} = ${nkonOf(konBefore, MILK_NKON_COL)}` +
                    (konRowCreated ? ' (dòng kon do test vừa tạo)' : ''),
            )
        }
        if (realRows > 0) {
            console.log(
                `⚠️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT — mỗi lần F9 sẽ ghi lại toàn bộ ` +
                    '(xoá mềm + chèn lại với disp_no mới). Đổi TEST_PAT_NO/TEST_TRT_DT sang tháng ' +
                    'trống nếu không muốn đụng dữ liệu đó.',
            )
        }

        // ── Trình duyệt ──────────────────────────────────────────────────────
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Rule 14 — AutoSantei bung 「…を算定しますか？」 vào thời điểm không đoán được
        // và nuốt mọi click. Bấm No — Yes lại kéo theo カルテ記載選択.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
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

        if (sigaRowCreated) {
            await deleteSigaRow(Number(PAT_NO)).catch(() => 0)
        } else if (sigaBefore) {
            // TC-6 có thể đã xoá dòng — tạo lại trước khi ghi 52 cột.
            await ensureSigaRow(Number(PAT_NO)).catch(() => false)
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
        }
        if (konRowCreated) {
            await deleteKonRow(Number(PAT_NO)).catch(() => 0)
        } else if (konBefore) {
            await ensureKonRow(Number(PAT_NO)).catch(() => false)
            await restoreKon(Number(PAT_NO), konBefore).catch(() => {})
        }
        console.log(`dọn: xoá ${n} 処置行 seed, trả siga & kon về nguyên trạng`)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // MỐC — hai testcase này XANH thì mọi kết luận bên dưới mới có giá trị.
    // ═════════════════════════════════════════════════════════════════════════

    test(`TC-1 (mốc) — master tháng ${TRT_DT} có đủ 3 mã đem thử (${EXT_TRT_CD} / ${EMR_TRT_CD} / ${CYST_TRT_CD})`, async () => {
        for (const [trtCd, sb, nhan] of [
            [EXT_TRT_CD, EXT_SB, '抜歯 (đối chứng)'],
            [EMR_TRT_CD, EMR_SB_4ROOT, 'ＥＭＲ(４根)'],
            [CYST_TRT_CD, CYST_SB, '歯根嚢胞摘出手術'],
        ] as const) {
            const rows = await findMstTrt(TRT_DT, trtCd)
            console.log(
                `mst_trt ${trtCd}: ` +
                    (rows.map((r) => `${r.trtSb}=${r.trtNm}(${r.score1}点)`).join(', ') || '(rỗng)'),
            )
            expect
                .soft(
                    rows.find((r) => r.trtSb === sb),
                    `bản master hiệu lực cho ${TRT_DT} không có 枝番 ${sb} của mã ${trtCd} (${nhan}). ` +
                        'Mã bị 改定 gỡ thì spec KHÔNG kết luận được gì về mã đó — đổi TEST_TRT_DT về ' +
                        'tháng còn hiệu lực rồi chạy lại, ĐỪNG đọc TC tương ứng là "app thiếu chức năng".',
                )
                .toBeDefined()
        }
        await step()
    })

    test(`TC-2 (mốc/đối chứng lớn) — 抜歯 179 ghi 欠損歯: se_${PERM_SE_COL}=${SE_MISSING}, sn_${MILK_SN_COL}=${SN_MISSING}`, async () => {
        // Đây là bằng chứng harness đúng: 部位 lên tới payload, F9 có ghi `siga`.
        // TC này đỏ ⇒ MỌI TC gap bên dưới vô nghĩa, sửa harness trước.
        await writeSigaTeeth(Number(PAT_NO), {
            se: { [PERM_SE_COL]: SE_VITAL, [CTRL_SE_COL]: SE_VITAL },
            sn: { [MILK_SN_COL]: SN_VITAL },
        })
        await resetMonthTo([
            {
                trtCd: EXT_TRT_CD,
                trtSb: EXT_SB,
                trtPt: EXT_PT,
                trtCnt: 1,
                dspTrt: NM.extPerm,
                bui: buiAt(PERM_BUI_SLOT, PERM_BUI_VAL),
                dspBui: '左上3',
            },
            {
                trtCd: EXT_TRT_CD,
                trtSb: EXT_SB,
                trtPt: EXT_PT,
                trtCnt: 1,
                dspTrt: NM.extNoSiga, // tên khác để phân biệt dòng 乳歯 trên lưới
                bui: buiAt(MILK_BUI_SLOT, MILK_BUI_VAL),
                dspBui: '右上B',
            },
        ])
        await expectRowsOnGrid(NM.extPerm, NM.extNoSiga)

        const status = await saveF9()
        expect(status, `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)

        const s = await mustReadSiga()
        console.log(
            `sau F9 (mốc): se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}, sn_${MILK_SN_COL} = ${snOf(s, MILK_SN_COL)}`,
        )
        expect
            .soft(
                seOf(s, PERM_SE_COL),
                `抜歯 trên 永久歯 (ô 部位 ${PERM_BUI_SLOT} = 左上3) phải ghi se_${PERM_SE_COL} = ${SE_MISSING} ` +
                    '(欠損歯 — SigaChg frm203016.cs:1250 / ToothStatusChangeCalculator.cs:171). ' +
                    'Đỏ ở đây nghĩa là payload F9 không mang 部位 của dòng seed ⇒ mọi TC sau vô nghĩa.',
            )
            .toBe(SE_MISSING)
        expect
            .soft(
                snOf(s, MILK_SN_COL),
                `抜歯 trên 乳歯 (ô 部位 ${MILK_BUI_SLOT} = 右上Ｂ, giá trị ${MILK_BUI_VAL}) phải ghi ` +
                    `sn_${MILK_SN_COL} = ${SN_MISSING} (欠損歯 — frm203016.cs:1257). ` +
                    'Đỏ riêng vế này ⇒ nhánh 乳歯 hỏng, không phải gap của các TC sau.',
            )
            .toBe(SN_MISSING)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // GAP A — ＥＭＲ(４根) 122/3 → 根数 4 (modSave.cs:770-808)
    // ═════════════════════════════════════════════════════════════════════════

    test(`TC-3 — ＥＭＲ(４根) 122/${EMR_SB_4ROOT} phải ghi 根数 ${EMR_ROOT_CNT} vào bảng kon`, async () => {
        // Trạng thái xuất phát: cả ba răng CHƯA có 根数 (NULL — BẪY 3).
        await ensureKonRow(Number(PAT_NO))
        await writeKonTeeth(Number(PAT_NO), {
            ekon: { [PERM_EKON_COL]: null, [CTRL_EKON_COL]: null },
            nkon: { [MILK_NKON_COL]: null },
        })

        await resetMonthTo([
            {
                trtCd: EMR_TRT_CD,
                trtSb: EMR_SB_4ROOT,
                trtPt: EMR_PT_4ROOT,
                trtCnt: 1,
                dspTrt: NM.emrPerm,
                bui: buiAt(PERM_BUI_SLOT, PERM_BUI_VAL),
                dspBui: '左上3',
            },
            {
                trtCd: EMR_TRT_CD,
                trtSb: EMR_SB_4ROOT,
                trtPt: EMR_PT_4ROOT,
                trtCnt: 1,
                dspTrt: NM.emrMilk,
                bui: buiAt(MILK_BUI_SLOT, MILK_BUI_VAL),
                dspBui: '右上B',
            },
            {
                trtCd: EMR_TRT_CD,
                trtSb: EMR_SB_1ROOT,
                trtPt: EMR_PT_1ROOT,
                trtCnt: 1,
                dspTrt: NM.emr1Root,
                bui: buiAt(CTRL_BUI_SLOT, PERM_BUI_VAL),
                dspBui: '右下8',
            },
        ])
        await expectRowsOnGrid(NM.emrPerm, NM.emrMilk, NM.emr1Root)

        const status = await saveF9()
        expect(status, `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)
        await expectRowsOnGrid(NM.emrPerm, NM.emrMilk, NM.emr1Root)

        const k = await readKon(Number(PAT_NO))
        expect(k, 'không đọc được dòng kon sau F9').not.toBeNull()
        console.log(
            `sau F9 (ＥＭＲ): ekon_${PERM_EKON_COL} = ${ekonOf(k!, PERM_EKON_COL)}, ` +
                `nkon_${MILK_NKON_COL} = ${nkonOf(k!, MILK_NKON_COL)}, ` +
                `ekon_${CTRL_EKON_COL} (đối chứng 1根) = ${ekonOf(k!, CTRL_EKON_COL)}`,
        )

        // Cột `kon` nullable (BẪY 3) — `null` (chưa từng ghi) phải đọc ra khác `0`.
        const show = (v: number | null | undefined) =>
            v == null ? 'NULL (chưa từng được ghi)' : String(v)

        expect
            .soft(
                ekonOf(k!, PERM_EKON_COL),
                `(a) 永久歯 — WinForm SigaChg_Save case 122/3 ghi thẳng "EKon${PERM_EKON_COL} = 4" cho ` +
                    `ô 部位 ${PERM_BUI_SLOT} (左上3) — modSave.cs:788. Đang là ${show(ekonOf(k!, PERM_EKON_COL))}.\n` +
                    'Nguyên nhân: ToothStatusChangeCalculator.ApplyKon:126 chặn cứng ' +
                    '`trtCd != 179 || trtSb != 5` ⇒ 122/3 bị `continue` ngay; và ' +
                    'SaveTreatmentsHandler.cs:240 còn không mở bảng `kon` khi payload không có 179/5.',
            )
            .toBe(EMR_ROOT_CNT)
        expect
            .soft(
                nkonOf(k!, MILK_NKON_COL),
                `(b) 乳歯 — WinForm ghi "NKon${MILK_NKON_COL} = 4" cho ô 部位 ${MILK_BUI_SLOT} ` +
                    `(右上Ｂ, giá trị ${MILK_BUI_VAL} ⇒ 乳歯, i<16 nên cột = i-2) — modSave.cs:800. ` +
                    `Đang là ${show(nkonOf(k!, MILK_NKON_COL))}. Cùng nguyên nhân với (a).\n` +
                    'GHI CHÚ: nhánh INPUT-TIME của chính WinForm (frm203016.cs:1155-1160) nhét ' +
                    '"NKon{n} = 4" vào câu UPDATE bảng **Siga** — bug của bản gốc, ĐỪNG port theo. ' +
                    'Đường F9 (save-time) mà TC này soi thì WinForm làm đúng.',
            )
            .toBe(EMR_ROOT_CNT)
        expect
            .soft(
                ekonOf(k!, CTRL_EKON_COL),
                `(c) ĐỐI CHỨNG — SigaChg_Save chỉ ghi 根数 khi 枝番 == 3 (modSave.cs:772 「if (intN == 3)」). ` +
                    `Dòng ＥＭＲ(１根) 122/${EMR_SB_1ROOT} phải để ekon_${CTRL_EKON_COL} nguyên NULL. ` +
                    'Đỏ riêng vế này nghĩa là có đường ghi 根数 nào đó quét quá tay, KHÔNG phải gap đang soi.',
            )
            .toBeNull()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // GAP B — 歯根嚢胞摘出手術 185 + 抜歯同時 (modSave.cs:1031-1085)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Nhập 185 QUA UI đúng như người dùng thật, trả lời `answerYes` cho hộp thoại
     * 抜歯同時, rồi chốt 回数. Trả về `true` nếu hộp thoại có bung.
     *
     * VÌ SAO PHẢI ĐI ĐƯỜNG UI (đừng đổi lại thành seed DB):
     * cờ 抜歯同時 là grid col 74 của WinForm, và cột đó KHÔNG có chỗ trong `trn_trn`
     * (`InsData2`, modSave.cs:2000-2115) — bản port cũng vậy, nó chỉ sống trong
     * payload F9 dưới tên `splitRootCnt`. Một dòng 185 seed thẳng vào DB luôn đi lên
     * với `splitRootCnt = 0` = 「いいえ」, nên BE ĐÚNG RA không được đụng 歯式. Bản
     * trước của testcase này seed DB rồi đòi 欠損歯 ⇒ đỏ oan, đổ tội nhầm cho BE.
     */
    async function enterCystViaUi(answerYes: boolean): Promise<boolean> {
        await closeDialogs(page)
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        await ensureBottomMounted()
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
        await step()

        await footerTen.click()
        await footerTen.fill(String(CYST_TRT_CD))
        await footerTen.press('Enter')
        // Handler xoá input trước khi tra cứu → value === '' là mốc CÓ THẬT rằng
        // Enter đã được xử lý (Rule 7: không sleep).
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        await expect(
            trtPicker,
            `mã ${CYST_TRT_CD} không mở được 処置選択 — xem lại TC-1 (master tháng này có mã đó không)`,
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === CYST_SB)
        expect(idx, `処置選択 không có 枝番 ${CYST_SB} của mã ${CYST_TRT_CD}`).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // WinForm hỏi NGAY tại đây (IregCodChk chạy khi 処置選択 確定).
        const asked = await page
            .getByText(CYST_CONFIRM_RE)
            .first()
            .waitFor({ state: 'visible', timeout: CONFIRM_WAIT })
            .then(() => true)
            .catch(() => false)
        console.log(
            `chốt ${CYST_TRT_CD}/${CYST_SB} → hộp thoại 抜歯同時 xuất hiện? ${asked}` +
                (asked ? ` → trả lời ${answerYes ? 'はい' : 'いいえ'}` : ''),
        )
        if (!asked) return false

        // kind 'confirm' mặc định nhãn Yes/No (confirm-dialog-view.tsx:18-19); vẫn
        // nhận cả はい/いいえ phòng khi call-site truyền yesLabel/noLabel.
        await page
            .getByRole('button', { name: answerYes ? /^(Yes|はい)$/ : /^(No|いいえ)$/ })
            .first()
            .click()
        await step()

        // Sau 確定 con trỏ nằm ở ô 回 CỦA CHÍNH DÒNG vừa chốt, đang ở chế độ nhập với
        // sẵn "1". KHÔNG Enter ở đây thì dòng chưa được chốt hẳn.
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', {
            timeout: 20_000,
        })
        await page.keyboard.press('Enter')
        await closeDialogs(page)
        await step()
        return true
    }

    /** Dựng một 部位病名行 để dòng 185 nhập sau đó THỪA KẾ 部位 của nó. */
    async function seedBuiProviderRow() {
        // 122/0 ＥＭＲ(１根): mang 部位 nhưng KHÔNG đụng `siga` (ConditionValues không
        // nhận 122) và KHÔNG đụng `kon` (chỉ 122/3 mới ghi 根数 — xem TC-3 vế đối
        // chứng). Nhờ vậy mọi thay đổi 歯式 quan sát được đều là của dòng 185.
        await resetMonthTo([
            {
                trtCd: EMR_TRT_CD,
                trtSb: EMR_SB_1ROOT,
                trtPt: EMR_PT_1ROOT,
                trtCnt: 1,
                dspTrt: NM.buiProvider,
                bui: buiAt(PERM_BUI_SLOT, PERM_BUI_VAL),
                dspBui: '左上3',
            },
        ])
        await expectRowsOnGrid(NM.buiProvider)
    }

    /**
     * 部位 mà dòng 185 ĐÃ LƯU thực sự mang. `null` = không tìm thấy dòng 185 nào.
     * Dùng để tách bạch "harness hỏng (không thừa kế được 部位)" với "BE không ghi".
     */
    async function savedCystBui(): Promise<number[] | null> {
        const rows = await findTreatmentRows(Number(PAT_NO), TRT_DT, CYST_TRT_CD)
        console.log(
            `dòng ${CYST_TRT_CD} đã lưu: ` +
                (rows
                    .map((r) => `${r.trtCd}/${r.trtSb} 「${r.dspTrt ?? ''}」 bui=[${r.bui.join(',')}]`)
                    .join(' | ') || '(không có)'),
        )
        return rows[0]?.bui ?? null
    }

    test(`TC-4 — 185 + 抜歯同時「はい」 → 欠損歯 (se_${PERM_SE_COL} = ${SE_MISSING})`, async () => {
        await writeSigaTeeth(Number(PAT_NO), { se: { [PERM_SE_COL]: SE_VITAL } })
        await seedBuiProviderRow()

        const asked = await enterCystViaUi(true)
        expect(
            asked,
            `Chốt 処置 ${CYST_TRT_CD}/${CYST_SB} phải bung 「歯根嚢胞摘出手術と同時に抜歯手術を` +
                `行いましたか？」 (frm203016.cs:1047). はい ⇒ SigaChg(179,0) ghi 欠損歯 + đặt cờ ` +
                'col 74 để F9 ghi lại (modSave.cs:1031-1085); いいえ ⇒ không đụng 歯式.\n' +
                'Không bung ⇒ người dùng KHÔNG có cách nào khai báo ca nhổ răng kèm theo, và mọi ' +
                'assert bên dưới mất ý nghĩa.',
        ).toBe(true)

        const status = await saveF9()
        expect(status, `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)

        // Mốc chẩn đoán TRƯỚC khi kết luận về `siga`: dòng 185 có mang 部位 lên BE không?
        const savedBui = await savedCystBui()
        expect(
            savedBui?.[PERM_BUI_SLOT] ?? 0,
            `Dòng 185 vừa nhập phải THỪA KẾ 部位 của 部位病名行 phía trên nó trong cùng ngày ` +
                `(buildSaveRowsIndexed — treatment-grid-rows.ts:502), tức bui_${PERM_BUI_SLOT + 1} = ` +
                `${PERM_BUI_VAL}. Đỏ ở đây là HARNESS hỏng (185 rơi ra ngoài nhóm 部位, hoặc dòng ` +
                '部位病名行 không được dựng), KHÔNG phải BE thiếu chức năng — sửa harness trước rồi ' +
                'mới đọc assert 歯式 bên dưới.',
        ).toBe(PERM_BUI_VAL)

        const s = await mustReadSiga()
        console.log(`sau F9 (185 「はい」): se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}`)
        expect(
            seOf(s, PERM_SE_COL),
            `永久歯 左上3 (ô 部位 ${PERM_BUI_SLOT}) của ca 歯根嚢胞摘出 kèm 抜歯 phải là 欠損歯 ` +
                `se_${PERM_SE_COL} = ${SE_MISSING} — WinForm ghi ngay lúc chốt (SigaChg → ` +
                `frm203016.cs:1250) và ghi lại ở F9 (SigaChg_Save → modSave.cs:1051). ` +
                `Đang là ${seOf(s, PERM_SE_COL)}.`,
        ).toBe(SE_MISSING)
        await step()
    })

    test(`TC-4b (đối chứng) — 185 + 抜歯同時「いいえ」 → 歯式 KHÔNG đổi`, async () => {
        // Vế ngược của TC-4: nếu thiếu nó, một bản port coi MỌI ca 185 là có nhổ răng
        // kèm theo vẫn làm TC-4 xanh — mà như thế là sai hẳn nghiệp vụ.
        await writeSigaTeeth(Number(PAT_NO), { se: { [PERM_SE_COL]: SE_VITAL } })
        await seedBuiProviderRow()

        const asked = await enterCystViaUi(false)
        expect(asked, 'hộp thoại 抜歯同時 không bung — xem TC-4').toBe(true)

        const status = await saveF9()
        expect(status, `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)

        const savedBui = await savedCystBui()
        expect(
            savedBui?.[PERM_BUI_SLOT] ?? 0,
            'dòng 185 phải thừa kế 部位 (giống TC-4) thì phép so mới có nghĩa — nếu bui = 0 thì ' +
                '歯式 không đổi là chuyện đương nhiên, không chứng minh được gì',
        ).toBe(PERM_BUI_VAL)

        const s = await mustReadSiga()
        console.log(`sau F9 (185 「いいえ」): se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}`)
        expect(
            seOf(s, PERM_SE_COL),
            `Trả lời 「いいえ」 ⇒ WinForm đặt col 74 = 0 (frm203016.cs:1055) và SigaChg_Save bỏ qua ` +
                `cả case 185 (modSave.cs:1033 「if (CInt(hFG1[74, j]) != 0)」) ⇒ răng phải giữ nguyên ` +
                `生活歯 se_${PERM_SE_COL} = ${SE_VITAL}. Đang là ${seOf(s, PERM_SE_COL)} — ghi 欠損歯 ở ` +
                'đây nghĩa là mọi ca 歯根嚢胞摘出 đều bị coi như có nhổ răng kèm theo.',
        ).toBe(SE_VITAL)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // GAP C — 「いいえ」 ở dirty gate → RestoreData / Restore_SK
    //         ĐỌC khối 「TC-5 / TC-5b — HAI NỬA BẤT ĐỐI XỨNG」 ở đầu file TRƯỚC khi
    //         diễn giải kết quả: hai TC này kỳ vọng NGƯỢC NHAU và cả hai đều đúng.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Bấm F10 戻る rồi trả lời 「いいえ」 ở hộp thoại dirty gate.
     * Chờ `POST /tenant/siga/restore` nếu nó có bay ra (chỉ khi cờ đã bật).
     */
    async function exitWithoutSaving(): Promise<number | null> {
        await closeDialogs(page)
        const restored = page
            .waitForResponse(
                (r) => r.url().includes(RESTORE_PATH) && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            .catch(() => null)

        await page.getByRole('button', { name: /F10\s*戻る/ }).click()

        const gate = page.getByText('処置データは変更されています。保存しますか？')
        await expect(
            gate,
            'Sửa lưới rồi bấm F10 戻る PHẢI bung 「処置データは変更されています。保存しますか？」 ' +
                '(modSave.ExitWithoutSaving:177). Không bung nghĩa là hasUnsavedGridEdits() không ' +
                'nhận ra thao tác vừa rồi — đó lại là một gap KHÁC, ghi lại rồi báo riêng.',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        // PHẢI khoanh trong chính hộp thoại: từ 2026-08-26 (c6ebf8e5d 「右タブ4グリッドに
        // 見出しクリックの並べ替えを追加」) tiêu đề cột 「No」 của tab 病検 là
        // `role="button"`, nên `getByRole('button', { name: /^No$/ })` khớp 2 phần tử và
        // `.first()` rơi vào TIÊU ĐỀ CỘT — bấm xong chỉ sort side panel, hộp thoại đứng
        // im và TC đỏ y như app hỏng.
        const gateDialog = page.getByRole('dialog').filter({ hasText: '保存しますか？' })
        await gateDialog.getByRole('button', { name: 'No', exact: true }).click()
        await expect(gate, 'bấm No mà hộp thoại không đóng').toBeHidden({ timeout: 15_000 })
        await step()

        const res = await restored
        console.log(`「いいえ」 → POST ${RESTORE_PATH}: ${res ? res.status() : 'KHÔNG có request nào'}`)
        return res ? res.status() : null
    }

    /** Chênh lệch từng cột giữa hai snapshot, dạng chuỗi đọc được. */
    function sigaDrift(before: SigaSnapshot, after: SigaSnapshot): string[] {
        return [
            ...after.se
                .map((v, i) => ({ col: `se_${i + 1}`, b: before.se[i], a: v }))
                .filter((d) => d.b !== d.a),
            ...after.sn
                .map((v, i) => ({ col: `sn_${i + 1}`, b: before.sn[i], a: v }))
                .filter((d) => d.b !== d.a),
        ].map((d) => `${d.col}: ${d.b}→${d.a}`)
    }

    test('TC-5 — 「いいえ」 KHÔNG lùi cái DelExtRec vừa ghi (pSiga_chg không bật)', async () => {
        // Dựng một 歯式 ĐÃ LƯU rồi mới sửa lưới — không có mốc đã lưu thì nhánh
        // discard chẳng chứng minh được gì.
        await writeSigaTeeth(Number(PAT_NO), { se: { [PERM_SE_COL]: SE_VITAL } })
        await resetMonthTo([
            {
                trtCd: EXT_TRT_CD,
                trtSb: EXT_SB,
                trtPt: EXT_PT,
                trtCnt: 1,
                dspTrt: NM.extDiscard,
                bui: buiAt(PERM_BUI_SLOT, PERM_BUI_VAL),
                dspBui: '左上3',
            },
        ])
        await expectRowsOnGrid(NM.extDiscard)

        const status = await saveF9()
        expect(status, `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)
        const sAtMoc = await mustReadSiga()
        expect(
            seOf(sAtMoc, PERM_SE_COL),
            `chưa dựng được mốc 歯式 đã lưu (se_${PERM_SE_COL} phải là ${SE_MISSING}) ⇒ nhánh discard ` +
                'không chứng minh được gì. Đỏ ở đây là hỏng harness, không phải gap Restore_SK.',
        ).toBe(SE_MISSING)
        await step()

        // Xoá dòng 抜歯 — DelExtRec ghi 健全歯 NGAY (không đợi F9, không bật cờ).
        await deleteRowByText(NM.extDiscard)
        const sAfterDelete = await mustReadSiga()
        expect(
            seOf(sAfterDelete, PERM_SE_COL),
            `Xoá dòng 179/${EXT_SB} phải gọi DelExtRec ngay lúc xoá (frm203002.cs:3949 → :6185) ` +
                `⇒ se_${PERM_SE_COL} về ${SE_VITAL} TRƯỚC khi bấm bất cứ nút lưu nào. ` +
                `Đang là ${seOf(sAfterDelete, PERM_SE_COL)}.`,
        ).toBe(SE_VITAL)
        await step()

        const restoreStatus = await exitWithoutSaving()

        // ── vế (a) — bất biến parity: 「いいえ」 KHÔNG hoàn tác DelExtRec ──────────
        const s = await mustReadSiga()
        expect
            .soft(
                seOf(s, PERM_SE_COL),
                `(a) DelExtRec CỐ Ý không bật pSiga_chg (WinForm phát một \`update Siga\` trần, ` +
                    'frm203002.cs:6185-6190), nên `Restore_SK` bỏ qua nó (modSave.cs:4684) và răng ' +
                    `PHẢI ở lại ${SE_VITAL} sau 「いいえ」. Ra ${SE_MISSING} nghĩa là DelExtRec đang ` +
                    'bị arm cờ nhầm — lúc đó một thao tác xoá rồi huỷ sẽ khôi phục cả những 欠損 mà ' +
                    'người dùng thật sự muốn bỏ. Xem inp-p0-open-issues.md ISSUE-15.',
            )
            .toBe(SE_VITAL)
        expect
            .soft(
                restoreStatus,
                '(a2) Phiên CHỈ xoá ⇒ cả hai cờ đều false ⇒ FE không được gửi request nào tới ' +
                    `${RESTORE_PATH} (toothStatusRestorePayload trả undefined). Có request nghĩa là ` +
                    'cờ đang bị bật sai chỗ.',
            )
            .toBeNull()

        // ── vế (b) — dòng 処置 chưa hề bị xoá khỏi trn_trn ────────────────────
        // 「いいえ」 = KHÔNG lưu, nên bản ghi vẫn còn. Đây chính là trạng thái tự mâu
        // thuẫn mà WinForm chấp nhận: răng đã lành nhưng dòng 抜歯 vẫn nằm đó.
        await openTreatmentScreen()
        await ensureBottomMounted()
        const rows = await gridRows()
        console.log(
            `mở lại sau discard: ${rows.length} dòng mount, 15 dòng CUỐI: ` +
                rows
                    .map((r) => r.text)
                    .slice(-15)
                    .join(' / '),
        )
        expect
            .soft(
                findRow(rows, NM.extDiscard),
                `(b) 「いいえ」 = KHÔNG lưu ⇒ dòng 抜歯 chưa bao giờ bị xoá khỏi \`trn_trn\`, nên mở lại ` +
                    'tháng phải thấy nó y như cũ (RestoreData chỉ lùi 歯式/根数, không đụng trn_trn).\n' +
                    'Không thấy dòng ⇒ màn hình đang hiển thị trạng thái ĐÃ VỨT BỎ như thể nó là dữ ' +
                    'liệu thật: người dùng tưởng đã xoá xong, trong khi DB vẫn giữ nguyên dòng đó.',
            )
            .toBeDefined()
        await step()
    })

    test('TC-5b — 「いいえ」 PHẢI lùi cái SigaChg vừa ghi (Restore_SK thật sự chạy)', async () => {
        // Vế đối xứng của TC-5, và là vế duy nhất chứng minh `Restore_SK` có chạy:
        // 185 + はい gọi SigaChg(179,0) ⇒ ghi 欠損歯 NGAY và BẬT pSiga_chg
        // (frm203016.cs:1049 + :1282). Không bấm F9. 「いいえ」 phải trả răng về đúng
        // snapshot lúc mở màn (modSave.cs:455-463 → :4700).
        //
        // ⚠️ Thứ tự BẮT BUỘC: writeSigaTeeth TRƯỚC seedBuiProviderRow, vì
        // `resetMonthTo` mở lại màn hình và CHÍNH lúc đó FE mới chụp snapshot
        // (`toothStatusSnapshotRef`, chốt ở lần fetch siga/kon đầu tiên sau mount).
        // Đảo thứ tự thì snapshot mang giá trị cũ và assert dưới đây vô nghĩa.
        await writeSigaTeeth(Number(PAT_NO), { se: { [PERM_SE_COL]: SE_VITAL } })
        await seedBuiProviderRow()
        const sAtOpen = await mustReadSiga()
        expect(
            seOf(sAtOpen, PERM_SE_COL),
            `harness: se_${PERM_SE_COL} phải là ${SE_VITAL} lúc mở màn`,
        ).toBe(SE_VITAL)

        const asked = await enterCystViaUi(true)
        expect(asked, 'hộp thoại 抜歯同時 không bung — xem TC-4').toBe(true)

        // Chưa F9, nhưng 歯式 phải đã đổi: SigaChg ghi ngay lúc chốt 処置.
        const sAfterEntry = await mustReadSiga()
        console.log(`sau khi nhập 185「はい」 (chưa F9): se_${PERM_SE_COL} = ${seOf(sAfterEntry, PERM_SE_COL)}`)
        expect(
            seOf(sAfterEntry, PERM_SE_COL),
            `SigaChg ghi 歯式 NGAY lúc chốt 処置, trước 登録 (frm203016.IregCodChk → :1049/:1282). ` +
                `Vẫn là ${SE_VITAL} nghĩa là đường ghi eager không chạy ⇒ TC này không kiểm được gì, ` +
                'và cờ pSiga_chg cũng chưa bao giờ bật.',
        ).toBe(SE_MISSING)
        await step()

        const restoreStatus = await exitWithoutSaving()
        expect
            .soft(
                restoreStatus,
                `SigaChg BẬT pSiga_chg ⇒ 「いいえ」 phải gọi ${RESTORE_PATH} (RestoreData → Restore_SK, ` +
                    'modSave.cs:455-463). Không có request nào ⇒ nhánh 「いいえ」 vẫn đang bỏ trống.',
            )
            .toBeLessThan(400)

        const sAfterDiscard = await mustReadSiga()
        console.log(`sau 「いいえ」: se_${PERM_SE_COL} = ${seOf(sAfterDiscard, PERM_SE_COL)}`)
        expect
            .soft(
                sigaDrift(sAtOpen, sAfterDiscard),
                'Sau 「いいえ」, `siga` phải Y HỆT lúc MỞ MÀN: Restore_Siga ghi lại 50 cột từ ' +
                    'snapshot `pSiga_old` (modSave.cs:4700-4729 — SE1..SE32 + SN1..SN18). ' +
                    'Còn chênh lệch nghĩa là 欠損 do một 処置 CHƯA ĐƯỢC LƯU nằm lại DB vĩnh viễn: ' +
                    'răng đó biến mất khỏi 部位選択 mà không có dòng 処置 nào giải thích.',
            )
            .toEqual([])
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // GAP D — bệnh nhân KHÔNG có dòng `siga` (modKonSiga.cs:77 「レコードがない場合作成する」)
    //         XẾP CUỐI vì đây là testcase phá trạng thái nặng nhất.
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-6 — thiếu dòng siga: F9 phải TẠO rồi ghi, không được im lặng bỏ qua', async () => {
        try {
            await resetMonthTo([
                {
                    trtCd: EXT_TRT_CD,
                    trtSb: EXT_SB,
                    trtPt: EXT_PT,
                    trtCnt: 1,
                    dspTrt: NM.extNoSiga,
                    bui: buiAt(PERM_BUI_SLOT, PERM_BUI_VAL),
                    dspBui: '左上3',
                },
            ])
            await expectRowsOnGrid(NM.extNoSiga)

            // Dựng trạng thái "bệnh nhân migrate thiếu row" NGAY TRƯỚC khi bấm F9,
            // để lần nạp lưới ở trên không bị ảnh hưởng.
            const removed = await deleteSigaRow(Number(PAT_NO))
            console.log(`đã xoá ${removed} dòng siga của ${PAT_NO} — dựng trạng thái "migrate thiếu row"`)
            expect(
                await readSiga(Number(PAT_NO)),
                'vừa xoá dòng siga mà đọc lại vẫn thấy ⇒ có đường nào đó tự tạo lại (hoặc bệnh nhân ' +
                    'có nhiều dòng siga chưa soft-delete). Các vế bên dưới chưa kết luận được.',
            ).toBeNull()

            const status = await saveF9()
            const s = await readSiga(Number(PAT_NO))
            console.log(
                `POST ${BULK_SAVE_PATH} → ${status}; sau F9 dòng siga ${s ? 'ĐÃ CÓ' : 'VẪN KHÔNG CÓ'}` +
                    (s ? `, se_${PERM_SE_COL} = ${s.se[PERM_SE_COL - 1]}` : ''),
            )

            expect
                .soft(
                    status,
                    '(a) Handler bỏ qua nhánh 歯式 bằng `if (siga is not null)` nên save vẫn "thành công". ' +
                        'Vế này KHÔNG đòi app phải lỗi — nó GHIM lại rằng người dùng hoàn toàn không nhận ' +
                        'được tín hiệu gì, đó chính là phần nguy hiểm của gap. Đỏ ở đây nghĩa là F9 chết ' +
                        'hẳn, một triệu chứng KHÁC (đáng báo riêng).',
                )
                .toBeLessThan(400)

            expect
                .soft(
                    s,
                    '(b) WinForm `pGet_SIGA` (modKonSiga.cs:70-84) TẠO dòng `Siga` ngay khi mở 診療入力 nếu ' +
                        'bệnh nhân chưa có — doc-comment ghi thẳng 「レコードがない場合作成する」. Nhờ vậy mọi ' +
                        '`update Siga` phía sau đều trúng đích.\n' +
                        'Bản port không có bước đó: nơi DUY NHẤT tạo dòng là RegisterPatientHandler.cs:204 ' +
                        '(chỉ chạy ở màn 患者登録 của bản web), còn SaveTreatmentsHandler.cs:220 gặp ' +
                        '`siga is null` thì bỏ qua im lặng ⇒ bệnh nhân migrate từ hệ cũ MẤT TRẮNG 歯式.\n' +
                        'Dữ liệu vào DB bằng đường import/convert (src/PersonConvert, src/ConsoleDataConvert) ' +
                        'KHÔNG đi qua RegisterPatientHandler ⇒ rơi đúng vào nhánh này.',
                )
                .not.toBeNull()

            if (s) {
                expect
                    .soft(
                        s.se[PERM_SE_COL - 1],
                        `(c) Dòng 抜歯 179/${EXT_SB} trên ô 部位 ${PERM_BUI_SLOT} (左上3) phải ghi ` +
                            `se_${PERM_SE_COL} = ${SE_MISSING} (欠損歯). Đây là đường ĐÃ port đầy đủ ` +
                            '(ToothStatusChangeCalculator.ConditionValues:171) và TC-2 đã chứng minh nó ' +
                            'chạy được — nên nếu vẫn không ghi thì nguyên nhân duy nhất còn lại là dòng ' +
                            'siga được tạo SAU khi handler đã bỏ qua.',
                    )
                    .toBe(SE_MISSING)
            } else {
                console.log(
                    `bỏ qua vế (c) vì chưa có dòng siga nào để đọc — vế (b) đã nói đúng nguyên nhân`,
                )
            }
        } finally {
            // Trả dòng siga về NGAY trong testcase, đừng đợi afterAll: nếu sau này có
            // ai thêm testcase phía dưới thì nó phải thấy trạng thái bình thường.
            await ensureSigaRow(Number(PAT_NO)).catch(() => false)
            if (sigaBefore) await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
        }
        await step()
    })
})
