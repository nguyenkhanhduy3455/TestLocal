import { expect, test, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteSigaRow,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    ensureSigaRow,
    readSiga,
    restoreSiga,
    seedTreatmentRows,
    writeSigaTeeth,
    type SigaSnapshot,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — 抜歯行を削除したら歯を健全歯に戻す (WinForm `DelExtRec`).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web.
 *
 * ─── CẬP NHẬT 2026-09-03 — `DelExtRec` ĐÃ ĐƯỢC PORT ─────────────────────────
 * Nhánh `fix/inp-siga-delextrec-pmode-kesson` port đúng hình dạng của `DelExtRec`:
 * FE `handleDeleteRow` gom các dòng 179 (枝番 ∉ {5,6}) đang bị xoá rồi gọi
 * `POST /tenant/siga/extraction-revert` NGAY, không đợi F9.
 * Hai hệ quả cho chính spec này:
 *
 *   1. 歯式 trở về 健全歯 NGAY LÚC XOÁ (TC-3), không còn phải đợi F9 nữa. BẪY 4 cũ
 *      ("assert ngay sau Delete là đỏ oan") đã ĐẢO: nay phải chờ response
 *      `POST /tenant/siga/extraction-revert` thay vì `bulk-save`.
 *   2. TC-6 (乳歯 → 5) KHÔNG còn là bug. Bug `sn = 0` mô tả bên dưới đã được sửa từ
 *      commit `e2935ef8c`; nay `ToothSlots.Enumerate` + `SigaToothCondition.Vital`
 *      ghi đúng `SE=0` / `SN=5` cho từng thang răng. TC-6 giữ lại làm ĐỐI CHỨNG.
 *
 * Đồng thời `SaveTreatmentsHandler` KHÔNG còn `ToothStatusChangeCalculator.Revert`:
 * F9 nay chạy `Restore_Siga` (lùi về snapshot đầu phiên, chỉ khi cờ `pSiga_chg`
 * bật) rồi `Apply`. `DelExtRec` CỐ Ý không bật cờ đó, nên chuỗi TC-3 → TC-4/5/6
 * dưới đây (phiên CHỈ xoá, không nhập 処置) không bị F9 ghi đè — đúng parity.
 * Xem `userapp/inp-p0-open-issues.md` ISSUE-15 và `inp-c1-c2-c7-plan.md` §KQ.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - INP/Forms/frm203002.cs:3944-3951 — trong `DeleteRow()`: dòng bị xoá có
 *    `trt_cd == 179` và `trt_sb ∉ {5, 6}` ⇒ gọi `DelExtRec(con)`.
 *  - INP/Forms/frm203002.cs:6120-6191 — **DelExtRec** 「抜歯行削除時、健全歯に戻す」:
 *      · đọc 32 ô 部位 của dòng đang xoá (grid col 8..39 = `bui_1..bui_32`);
 *      · bóc tối đa hai mốc 100 (`arrBui[i] - 100` ×2, tương đương `% 100`);
 *      · ô `1..9` = 永久歯 ⇒ `SE{i+1} = 0`;
 *      · ô `11..19` = 乳歯 ⇒ `SN{i-2} = 5` (i<16) / `SN{i-8} = 5` (16≤i<29);
 *      · một `update Siga set … where pat_no = …` chạy NGAY, ngoài transaction save.
 *  - INP/Forms/frm203016.cs:1195-1265 `SigaChg` — chiều thuận: 抜歯 ⇒ SE=4 / SN=9,
 *    分割抜歯 (179/5) ⇒ SE=2 / SN=7, 抜髄 (170/176) ⇒ SE=1 / SN=6.
 *  - INP/Lib/modSave.cs:742+ `SigaChg_Save` — F9 dựng lại 歯式 từ tập 処置 đã lưu.
 *  - INP/Lib/CommonChk.cs:497-580 `chkSiga` — MIỀN GIÁ TRỊ (nguồn chân lý):
 *      永久歯 SE : 0=生活歯, 1/2/3=失活歯, 4=欠損歯
 *      乳歯   SN : 5=生活歯, 6/7/8=失活歯, 9=欠損歯
 *    ⇒ 「健全歯」 của 乳歯 là **5**, KHÔNG phải 0. Đúng bằng DEFAULT của cột
 *    (`apps/ddl/sql/snapshot/schema.sql:7599` — `se_* DEFAULT 0`, `sn_* DEFAULT 5`).
 *  - Vì sao WinForm loại `trt_sb` 5 và 6 khỏi DelExtRec: master 処置 cho thấy
 *    `179/5 = 分割抜歯` (半歯欠損 SE=2, không được reset về 0) và
 *    `179/6 = 埋伏歯加算` — chỉ là DÒNG 加算, xoá nó thì răng vẫn đang bị nhổ bởi
 *    dòng 抜歯 kia. Spec này chỉ dùng 179/0 và 179/1 nên nằm gọn trong nhánh
 *    「抜歯 thật」, tránh hẳn vùng tranh chấp đó.
 *
 * ─── Port web/BE đang có (đọc 2026-09-03, nhánh fix/inp-siga-delextrec-pmode-kesson) ──
 *  - FE `handleDeleteRow` (`treatment-entry-detail.tsx`) lọc các dòng bị xoá qua
 *    `revertsToothOnDelete(trtCd, trtSb)` (= 179 và 枝番 ∉ {5,6} — chính điều kiện
 *    frm203002.cs:3944-3951), lấy 部位 của 部位病名行 chi phối từng dòng, rồi gọi
 *    `POST /tenant/siga/extraction-revert` NGAY, không đợi F9.
 *  - BE `RevertExtractedTeethHandler` → `ToothStatusChangeCalculator.RevertExtraction`
 *    → `ToothSlots.Enumerate` + `SigaToothCondition.Vital` = `(SE 0, SN 5)`, tức
 *    健全歯 THEO TỪNG THANG RĂNG, đúng như DelExtRec:6151/6164.
 *  - Endpoint này CỐ Ý không bật `pSiga_chg` (WinForm phát một `update Siga` trần và
 *    không đụng cờ) ⇒ F9 sau đó không lùi về snapshot, và 「いいえ」 cũng không hoàn
 *    tác — xem ISSUE-15.
 *
 * ─── Vì sao spec soi DB/API chứ không soi màu ────────────────────────────────
 *  Màu trên chart TRÙNG NGẪU NHIÊN giữa 健全 và giá trị bẩn:
 *  `selSigaColorNo(5)` → 0 → White và `selSigaColorNo(0)` → 0 → White
 *  (`restorative-management-mapping.ts:190-195`). Một hồi quy 乳歯 ghi 0 thay vì 5
 *  sẽ KHÔNG nhìn ra bằng mắt, nên mọi assert ở đây đọc thẳng bảng `siga` + endpoint
 *  `GET /tenant/siga` (chính đường màn 口腔内情報 dùng).
 *
 * ─── Dữ liệu tự dựng (CÓ GHI DB — cần TEST_DB=1 và TEST_ALLOW_SAVE=1) ─────────
 * `beforeAll`:
 *   1. chụp lại nguyên trạng `siga` của bệnh nhân (trả về ở afterAll);
 *   2. ép 2 răng thử về 健全歯: `se_11 = 0`, `sn_4 = 5`;
 *   3. seed 2 dòng 抜歯 vào `trn_trn` của (PAT_NO, TRT_DT), vùng `disp_no >= 9000`:
 *        179/1 抜歯(前歯) 150点  bui[10] = 1   (永久歯 左上3) → se_11
 *        179/0 抜歯(乳歯) 120点  bui[6]  = 11  (乳歯   右上Ｂ) → sn_4
 *
 * Ánh xạ ô 部位 → cột siga (tooth-bui.ts:25-34 + DelExtRec:6162-6180):
 *   ô 0-7 右上(8→1), 8-15 左上(1→8), 16-23 右下(8→1), 24-31 左下(1→8)
 *   永久歯: ô i → `se_{i+1}`               ⇒ ô 10 (左上3) → se_11
 *   乳歯  : ô i<16 → `sn_{i-2}`            ⇒ ô 6  (右上Ｂ) → sn_4
 *           ô 16≤i<29 → `sn_{i-8}`
 *   (ô 3-12 = 10 răng sữa hàm trên → sn_1..sn_10; ô 19-28 = hàm dưới → sn_11..sn_20)
 *
 * ⚠️ SPEC NÀY BẤM F9 登録 — tức GHI DB THẬT, nên bị khoá sau `TEST_ALLOW_SAVE=1`
 * (GUIDELINE Rule 18.1). Phải biết trước: `bulk-save` XOÁ MỀM TOÀN BỘ 処置行 của
 * THÁNG rồi chèn lại từ payload (`SaveTreatmentsHandler.cs:97-100` + `:175-196`).
 * Dòng thật của bệnh nhân trong tháng đó sẽ bị ghi lại (disp_no mới, dòng cũ mang
 * `deleted_at`). `beforeAll` in ra số dòng thật sẽ bị ảnh hưởng — chọn
 * TEST_PAT_NO / TEST_TRT_DT vào tháng KHÔNG có dữ liệu thật thì con số đó = 0.
 * afterAll trả `siga` về nguyên trạng và xoá vùng seed.
 *
 * ─── BẪY ĐÃ VẤP / cần biết ────────────────────────────────────────────────────
 *  1. Ô 部位 để 0 thì save KHÔNG đụng `siga` (Write() bỏ qua ô 0) — testcase sẽ
 *     xanh giả. Vì thế `seedTreatmentRows` được mở rộng thêm tham số `bui`.
 *  2. 乳歯 dùng giá trị ô `11..19`, KHÔNG phải `1..9`; ô 11 là giá trị đầu tiên của
 *     vòng `nextMilkVal` (tooth-bui.ts). Để 1 thì nó thành 永久歯 và bug không lộ.
 *  3. `sn = 0` KHÔNG đổi màu chart (xem mục "Hệ quả" trên) ⇒ đừng cố assert bằng
 *     màu, phải soi DB / `GET /tenant/siga`.
 *  4. ĐÃ ĐẢO TỪ 2026-09-03: xoá dòng 抜歯 nay GHI DB NGAY (`DelExtRec`). Mốc phải
 *     chờ là response `POST /tenant/siga/extraction-revert`, KHÔNG phải `bulk-save`.
 *     `deleteRowByText` đã bọc sẵn việc chờ đó. (Các thao tác xoá KHÁC — dòng không
 *     phải 179 — vẫn chỉ đổi state như cũ, nên helper chờ có điều kiện.)
 *  5. Dòng 処置 có 部位 CÓ THỂ được mapper thăng lên 部位病名行 (`isBuiLineRow` —
 *     `treatment-grid-rows.ts:71-80`), khi đó `Delete` bung confirm
 *     「同一部位の処置を全て削除します」. Helper `deleteRowByText` bấm Yes nếu có,
 *     bỏ qua nếu không — cả hai nhánh đều dẫn tới việc dòng 抜歯 rời lưới.
 *  6. Thứ tự testcase CÓ Ý NGHĨA và `serial` ⇒ test đỏ thì các test SAU bị skip.
 *     TC-6 (bug) CỐ Ý xếp CUỐI để mọi testcase xanh chạy hết trước — đọc report là
 *     thấy ngay "harness đúng, chỉ mỗi vế 乳歯 sai".
 *
 * ─── Cách chạy (GUIDELINE Rule 19) ────────────────────────────────────────────
 * `describe.serial` + MỘT page chung tạo ở `beforeAll` ⇒ cả file login MỘT lần.
 * LUÔN chạy CẢ FILE, không bao giờ `-g` một testcase lẻ.
 *
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/tooth-extraction-siga-restore.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/tooth-extraction-siga-restore.spec.ts --headed
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — dùng chung với kaigo-hutan-row.spec.ts. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** Ngày test = HÔM NAY: chỉ dòng của tháng đang mở mới xoá/nhập tay được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** GUIDELINE Rule 18.1 — mọi thao tác ghi DB phải nằm sau cờ env. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ─── 処置 đem thử ─────────────────────────────────────────────────────────────
/** 抜歯 — WinForm hard-code 179 (frm203002.cs:3944, frm203016.cs:1195). */
const EXT_TRT_CD = 179
/** 179/1 抜歯(前歯) — `trt_sb ∉ {5,6}` ⇒ ĐÚNG điều kiện gọi DelExtRec. */
const EXT_SB_PERM = 1
/** 179/0 抜歯(乳歯) — cũng `∉ {5,6}`. */
const EXT_SB_MILK = 0
/** score1 của 2 枝番 trên trong master đang áp dụng (`mst_trt.score1`). */
const EXT_PT_PERM = 150
const EXT_PT_MILK = 120
/** `dsp_trt` ghi lúc seed — cũng là chuỗi lưới in ra ở cột 療法・処置. */
const EXT_NM_PERM = '抜歯(前歯)'
const EXT_NM_MILK = '抜歯(乳歯)'

// ─── Ô 部位 và cột siga tương ứng ─────────────────────────────────────────────
/** Ô 10 (0-based) = 左上3, 永久歯 ⇒ `se_11` (ánh xạ đồng nhất i → i+1). */
const PERM_BUI_SLOT = 10
const PERM_SE_COL = PERM_BUI_SLOT + 1
/** Giá trị ô cho 永久歯 — miền `1..9`. */
const PERM_BUI_VAL = 1

/** Ô 6 (0-based) = 右上Ｂ, 乳歯 ⇒ `sn_4` (i<16 ⇒ i-2). */
const MILK_BUI_SLOT = 6
const MILK_SN_COL = MILK_BUI_SLOT - 2
/** Giá trị ô cho 乳歯 — miền `11..19` (11 = giá trị đầu của vòng `nextMilkVal`). */
const MILK_BUI_VAL = 11

// ─── Miền giá trị 自歯状況 (CommonChk.cs:497-580 / ToothConditionChecker.cs:20-23) ──
/** 永久歯 健全 (生活歯) — cũng là DEFAULT của cột `se_*`. */
const SE_VITAL = 0
/** 永久歯 欠損歯 — giá trị 抜歯 ghi vào. */
const SE_MISSING = 4
/** 乳歯 健全 (生活歯) — cũng là DEFAULT của cột `sn_*`. CHÍNH LÀ giá trị bug bỏ sót. */
const SN_VITAL = 5
/** 乳歯 欠損歯. */
const SN_MISSING = 9
/** Toàn bộ miền hợp lệ của `sn_*` — mọi giá trị ngoài tập này là dữ liệu bẩn. */
const SN_DOMAIN = [5, 6, 7, 8, 9]

/** Endpoint đọc 歯式 (`TenantSigaEndpoints.cs:24`) — đường màn hình thật dùng. */
const SIGA_PATH = '/tenant/siga'
/** Endpoint F9 登録 (`TenantTreatmentEndpoints.cs:89`). */
const BULK_SAVE_PATH = '/tenant/treatment/bulk-save'
/** Endpoint `DelExtRec` — chạy NGAY lúc xoá dòng 抜歯 (`TenantSigaEndpoints.cs`). */
const EXT_REVERT_PATH = '/tenant/siga/extraction-revert'

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|2` của data-grid-cell). */
    key: string
    text: string
}

async function gridRows(page: Page): Promise<GridRow[]> {
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

// GUIDELINE Rule 18 — "Skip phải có log rõ ràng": `test.skip()` cấp file chỉ hiện
// chữ "skipped" trơ trọi ở terminal, nhìn y như đã chạy xong. In hẳn lý do + câu
// lệnh sửa ra stdout, nếu không người chạy tưởng spec pass mà thật ra nó chưa
// chạy dòng nào.
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (để seed 抜歯行 + đọc/khôi phục bảng siga)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (spec bấm F9 登録 ⇒ GHI DB thật)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  tooth-extraction-siga-restore.spec.ts BỎ QUA TOÀN BỘ 7 testcase — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy cho ra bug bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/tooth-extraction-siga-restore.spec.ts\n' +
            '   (bulk-save ghi lại TOÀN BỘ 処置行 của tháng test — xem khối doc đầu file)\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 抜歯行 + đọc/khôi phục bảng siga')
test.skip(
    !ALLOW_SAVE,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật (bulk-save ghi lại cả tháng)',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 抜歯行削除 → 健全歯復元 (DelExtRec / siga)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Origin thật của API (bóc từ một request có sẵn của app). */
    let apiOrigin = ''
    /** Header auth bắt được — dùng lại để gọi thẳng BE bằng page.request. */
    let authHeaders: Record<string, string> = {}

    /** Nguyên trạng `siga` trước khi test đụng vào — trả lại ở afterAll. */
    let sigaBefore: SigaSnapshot | null = null
    /** true khi dòng siga do CHÍNH test tạo ⇒ afterAll xoá hẳn thay vì restore. */
    let sigaRowCreated = false

    /** Đọc một cột `se_n` (n là số cột 1-based). */
    const seOf = (snap: SigaSnapshot, col: number) => snap.se[col - 1]
    /** Đọc một cột `sn_n` (n là số cột 1-based). */
    const snOf = (snap: SigaSnapshot, col: number) => snap.sn[col - 1]

    async function mustReadSiga(): Promise<SigaSnapshot> {
        const s = await readSiga(Number(PAT_NO))
        expect(s, `bệnh nhân ${PAT_NO} không còn dòng siga nào để đọc`).not.toBeNull()
        return s!
    }

    /**
     * Bảo đảm khối THÁNG HIỆN HÀNH (nơi 2 dòng seed nằm) đã mount — lưới
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
     * Xoá một dòng theo từ khoá: click ô 療法 để đặt focusedCell rồi `Delete`
     * (`treatment-entry-detail.tsx:4091-4106` — WinForm grdRegi_KeyDown:3576-3587).
     *
     * Bấm Yes nếu confirm 「同一部位の処置を全て削除します」 bung ra (dòng có 部位 có
     * thể đã được mapper thăng lên 部位病名行 — xem BẪY 5 ở đầu file).
     */
    async function deleteRowByText(...keys: readonly string[]) {
        await ensureBottomMounted()
        const row = findRow(await gridRows(page), ...keys)
        expect(
            row,
            `không thấy dòng 「${keys.join(' + ')}」 trên lưới để xoá — seed hỏng hoặc màn hình ` +
                `đang mở tháng khác (TEST_TRT_DT = ${TRT_DT})`,
        ).toBeDefined()

        // BẪY 4 (đã đảo): xoá dòng 抜歯 GHI DB NGAY. Arm mốc chờ TRƯỚC khi bấm Delete,
        // nếu không request có thể xong trước khi kịp lắng nghe.
        const reverted = page
            .waitForResponse(
                (r) => r.url().includes(EXT_REVERT_PATH) && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            .catch(() => null)

        await page.locator(`[data-grid-cell="${row!.key}|2"]`).click()
        await page.keyboard.press('Delete')

        const confirmYes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        if (await confirmYes.count()) await confirmYes.first().click()

        await expect(
            ryoCells(page).filter({ hasText: keys[0]! }),
            `bấm Delete rồi mà dòng 「${keys.join(' + ')}」 vẫn còn trên lưới`,
        ).toHaveCount(0, { timeout: 15_000 })

        const res = await reverted
        console.log(
            `xoá 「${keys.join(' + ')}」 → POST ${EXT_REVERT_PATH}: ` +
                (res ? `${res.status()}` : 'KHÔNG có request nào'),
        )
        return res
    }

    /**
     * Bấm F9 登録, CHỜ ĐÚNG response bulk-save (Rule 7: mốc có thật, không sleep),
     * rồi NẠP LẠI màn hình.
     *
     * BẪY ĐÃ VẤP: sau 登録 màn 診療入力 **tự dọn sạch lưới** (WinForm reset để nhận
     * bệnh nhân kế tiếp; spec ghi hình cũ `treatment-table-delete-rows.spec.ts:51`
     * phải `press('Enter')` lại ô 患者番号 mới thấy dữ liệu). Bản đầu của spec này
     * không nạp lại ⇒ testcase NGAY SAU đó không tìm thấy dòng nào và đỏ với thông
     * báo "seed hỏng", trong khi seed hoàn toàn đúng và F9 đã lưu thành công.
     */
    async function saveF9() {
        await closeDialogs(page)
        const done = page.waitForResponse(
            (r) => r.url().includes(BULK_SAVE_PATH) && r.request().method() === 'POST',
            { timeout: 60_000 },
        )
        await page.getByRole('button', { name: /F9\s*登録/ }).click()
        const confirmYes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        if (await confirmYes.count()) await confirmYes.first().click()

        const res = await done
        expect(res.status(), `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)
        await closeDialogs(page)
        await openTreatmentScreen()
    }

    test.beforeAll(async ({ browser }) => {
        // ── DB: chụp nguyên trạng rồi dựng trạng thái xuất phát ──────────────
        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        console.log(
            `siga trước test: se_${PERM_SE_COL} = ${sigaBefore ? seOf(sigaBefore, PERM_SE_COL) : '?'}, ` +
                `sn_${MILK_SN_COL} = ${sigaBefore ? snOf(sigaBefore, MILK_SN_COL) : '?'}` +
                (sigaRowCreated ? ' (dòng siga do test vừa tạo)' : ''),
        )
        if (realRows > 0) {
            console.log(
                `⚠️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT — F9 sẽ ghi lại toàn bộ ` +
                    '(xoá mềm + chèn lại với disp_no mới). Đổi TEST_PAT_NO/TEST_TRT_DT sang tháng ' +
                    'trống nếu không muốn đụng dữ liệu đó.',
            )
        }

        // Trạng thái xuất phát: cả hai răng đều 健全歯.
        await writeSigaTeeth(Number(PAT_NO), {
            se: { [PERM_SE_COL]: SE_VITAL },
            sn: { [MILK_SN_COL]: SN_VITAL },
        })

        // Seed TRƯỚC khi mở trình duyệt: lưới đọc một lần lúc vào màn.
        const permBui = Array.from({ length: 32 }, (_, i) =>
            i === PERM_BUI_SLOT ? PERM_BUI_VAL : 0,
        )
        const milkBui = Array.from({ length: 32 }, (_, i) =>
            i === MILK_BUI_SLOT ? MILK_BUI_VAL : 0,
        )
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: EXT_TRT_CD,
                trtSb: EXT_SB_PERM,
                trtPt: EXT_PT_PERM,
                trtCnt: 1,
                dspTrt: EXT_NM_PERM,
                bui: permBui,
                dspBui: '左上3',
            },
            {
                trtCd: EXT_TRT_CD,
                trtSb: EXT_SB_MILK,
                trtPt: EXT_PT_MILK,
                trtCnt: 1,
                dspTrt: EXT_NM_MILK,
                bui: milkBui,
                dspBui: '右上B',
            },
        ])

        // ── Trình duyệt ──────────────────────────────────────────────────────
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Bóc origin + header auth từ chính request của app: accessToken nằm trong
        // RAM (zustand không persist) nên không có đường nào lấy ra (GUIDELINE 10.2).
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (!h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(
                    ([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept',
                ),
            )
        })

        // AutoSantei bung 「…を算定しますか？」 vào thời điểm không đoán được và nuốt
        // mọi click (GUIDELINE Rule 14). Bấm No — Yes lại kéo theo カルテ記載選択.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 30 },
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
        // Dọn BA ĐƯỜNG, vì F9 làm dòng test đổi hình dạng:
        //  1. vùng disp_no >= 9000            — bản seed gốc (chưa qua F9);
        //  2. theo dsp_trt                    — bản do F9 chèn lại, disp_no từ 1;
        //  3. theo ô 部位                      — 部位病名行 (trt_cd 0, tên rỗng) do
        //     chính app đẻ ra quanh dòng seed; hai đường trên không tóm được.
        const n =
            (await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)) +
            (await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, EXT_TRT_CD, [
                EXT_NM_PERM,
                EXT_NM_MILK,
            ]).catch(() => 0)) +
            (await deleteTreatmentRowsByBui(
                Number(PAT_NO),
                TRT_DT,
                PERM_SE_COL,
                PERM_BUI_VAL,
            ).catch(() => 0)) +
            (await deleteTreatmentRowsByBui(
                Number(PAT_NO),
                TRT_DT,
                MILK_BUI_SLOT + 1,
                MILK_BUI_VAL,
            ).catch(() => 0))
        if (sigaRowCreated) {
            const k = await deleteSigaRow(Number(PAT_NO)).catch(() => 0)
            console.log(`dọn: xoá ${n} 処置行 seed, xoá ${k} dòng siga do test tạo`)
        } else if (sigaBefore) {
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
            console.log(`dọn: xoá ${n} 処置行 seed, trả siga về nguyên trạng`)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Mốc: dữ liệu phải lên được lưới thì các assert parity mới có nghĩa.
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-1 (mốc) — 2 dòng 抜歯 đã seed hiện đúng trên lưới tháng hiện hành', async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)

        const perm = findRow(rows, EXT_NM_PERM)
        const milk = findRow(rows, EXT_NM_MILK)
        expect(
            perm,
            `không thấy dòng 「${EXT_NM_PERM}」 — seed hỏng hoặc màn hình đang mở tháng khác ` +
                `(TEST_TRT_DT = ${TRT_DT}). ${rows.length} dòng đang mount, 15 dòng CUỐI: ` +
                rows
                    .map((r) => r.text)
                    .slice(-15)
                    .join(' / '),
        ).toBeDefined()
        expect(milk, `không thấy dòng 「${EXT_NM_MILK}」 trên lưới`).toBeDefined()

        // 点 (RegiCol.ten = 3) đúng điểm đã seed ⇒ chắc chắn đang nhìn đúng dòng.
        for (const [row, pt] of [
            [perm!, EXT_PT_PERM],
            [milk!, EXT_PT_MILK],
        ] as const) {
            const ten = page.locator(`[data-grid-cell="${row.key}|3"]`)
            expect(Number(txt(await ten.innerText()).replace(/,/g, '')), `点 của 「${row.text}」`).toBe(
                pt,
            )
        }
        await step()
    })

    test(`TC-2 (mốc) — F9 lần 1: 抜歯 đã lưu ghi 欠損歯 vào siga (SigaChg_Save — se_${PERM_SE_COL}=4 / sn_${MILK_SN_COL}=9)`, async () => {
        await saveF9()
        const s = await mustReadSiga()
        console.log(
            `sau F9 #1: se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}, sn_${MILK_SN_COL} = ${snOf(s, MILK_SN_COL)}`,
        )

        // Hai vế của cùng một lượt Apply → soft để một lần chạy thấy đủ.
        expect
            .soft(
                seOf(s, PERM_SE_COL),
                `抜歯 trên 永久歯 (ô 部位 ${PERM_BUI_SLOT} = 左上3) phải ghi se_${PERM_SE_COL} = ${SE_MISSING} ` +
                    '(欠損歯 — SigaChg frm203016.cs:1250 / ToothStatusChangeCalculator.cs:170-171). ' +
                    'Đỏ ở đây nghĩa là payload F9 không mang 部位 của dòng seed ⇒ mọi TC sau vô nghĩa.',
            )
            .toBe(SE_MISSING)
        expect
            .soft(
                snOf(s, MILK_SN_COL),
                `抜歯 trên 乳歯 (ô 部位 ${MILK_BUI_SLOT} = 右上Ｂ) phải ghi sn_${MILK_SN_COL} = ${SN_MISSING} ` +
                    '(欠損歯 — frm203016.cs:1257 / ToothStatusChangeCalculator.cs:170-171).',
            )
            .toBe(SN_MISSING)
        await step()
    })

    test('TC-3 — DelExtRec: xoá dòng 抜歯 ghi 健全歯 NGAY, TRƯỚC khi bấm F9', async () => {
        // Đây là vế cốt lõi của DelExtRec và là thứ phân biệt bản port đúng với bản
        // "re-derive ở F9" cũ: WinForm phát `update Siga set …` ngay trong vòng lặp
        // xoá dòng (frm203002.cs:3944-3951 → :6185), TRƯỚC và ĐỘC LẬP với 登録.
        const resPerm = await deleteRowByText(EXT_NM_PERM)
        expect(
            resPerm,
            `Xoá dòng 179/${EXT_SB_PERM} phải gọi POST ${EXT_REVERT_PATH} NGAY (DelExtRec chạy ` +
                'trong vòng lặp xoá, frm203002.cs:3949). Không có request nào ⇒ FE vẫn đang hoãn ' +
                'việc ghi 歯式 tới F9 — đó là mô hình CŨ, không phải DelExtRec.',
        ).not.toBeNull()
        expect(resPerm!.status(), `POST ${EXT_REVERT_PATH} phải thành công`).toBeLessThan(400)
        await step()

        const resMilk = await deleteRowByText(EXT_NM_MILK)
        expect(resMilk, `xoá dòng 179/${EXT_SB_MILK} cũng phải gọi ${EXT_REVERT_PATH}`).not.toBeNull()
        await step()

        // CHƯA hề bấm F9 — nhưng 歯式 phải đã lùi rồi.
        const s = await mustReadSiga()
        console.log(
            `sau khi XOÁ (chưa F9): se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}, ` +
                `sn_${MILK_SN_COL} = ${snOf(s, MILK_SN_COL)}`,
        )
        expect
            .soft(
                seOf(s, PERM_SE_COL),
                `永久歯: DelExtRec ghi thẳng "SE${PERM_SE_COL} = 0" (frm203002.cs:6151) ngay lúc xoá.`,
            )
            .toBe(SE_VITAL)
        expect
            .soft(
                snOf(s, MILK_SN_COL),
                `乳歯: DelExtRec ghi "SN${MILK_SN_COL} = 5" (frm203002.cs:6164/6175) ngay lúc xoá — ` +
                    '5 mới là 生活歯 của 乳歯 (CommonChk.cs:549), không phải 0.',
            )
            .toBe(SN_VITAL)
        await step()
    })

    test('TC-3b (mốc) — F9 lần 2: dòng biến mất và 健全歯 KHÔNG bị ghi đè', async () => {
        // Phiên này CHỈ xoá, không nhập 処置 nào ⇒ pSiga_chg = false ⇒ F9 KHÔNG chạy
        // Restore_Siga (modSave.cs:4684), nên cái DelExtRec vừa ghi phải sống sót.
        // Đây chính là nhánh thứ nhất của bảng so sánh ở inp-c1-c2-c7-plan.md §C1.3.
        const before = await mustReadSiga()

        // saveF9() đã nạp lại màn hình ⇒ lưới dưới đây phản ánh cái ĐÃ LƯU.
        await saveF9()
        await ensureBottomMounted()
        const rows = await gridRows(page)
        expect(
            findRow(rows, EXT_NM_PERM),
            `nạp lại tháng mà dòng 「${EXT_NM_PERM}」 vẫn còn ⇒ F9 chưa thực sự xoá`,
        ).toBeUndefined()
        expect(
            findRow(rows, EXT_NM_MILK),
            `nạp lại tháng mà dòng 「${EXT_NM_MILK}」 vẫn còn ⇒ F9 chưa thực sự xoá`,
        ).toBeUndefined()

        const after = await mustReadSiga()
        expect(
            [
                ...after.se
                    .map((v, i) => ({ col: `se_${i + 1}`, before: before.se[i], after: v }))
                    .filter((d) => d.before !== d.after),
                ...after.sn
                    .map((v, i) => ({ col: `sn_${i + 1}`, before: before.sn[i], after: v }))
                    .filter((d) => d.before !== d.after),
            ].map((d) => `${d.col}: ${d.before}→${d.after}`),
            'Phiên CHỈ xoá dòng (không nhập 処置 nào) ⇒ pSiga_chg = false ⇒ F9 phải BỎ QUA ' +
                'Restore_Siga (modSave.cs:4684) và SigaChg_Save không còn dòng nào để ghi. ' +
                'Có cột nào đổi nghĩa là F9 vẫn đang tự ý dựng lại 歯式 — quay lại mô hình ' +
                '`Revert(dòng cũ) + Apply(dòng mới)` đã bị gỡ.',
        ).toEqual([])
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // WinForm parity — cả ba TC dưới đây đều PHẢI XANH. Chúng đọc lại trạng thái
    // cuối (sau F9 #2) để khoá riêng từng vế: 永久歯, phạm vi quét, và 乳歯.
    // ─────────────────────────────────────────────────────────────────────────

    test(`TC-4 — 永久歯: se_${PERM_SE_COL} về 生活歯 = ${SE_VITAL} và ở lại đó (DelExtRec:6151)`, async () => {
        const s = await mustReadSiga()
        console.log(`sau F9 #2: se_${PERM_SE_COL} = ${seOf(s, PERM_SE_COL)}`)

        expect(
            seOf(s, PERM_SE_COL),
            `Xoá dòng 179/${EXT_SB_PERM} (trt_sb ∉ {5,6}) phải đưa răng 左上3 về 健全歯: ` +
                `WinForm DelExtRec ghi thẳng "SE${PERM_SE_COL} = 0" (frm203002.cs:6151). ` +
                `Đang là ${seOf(s, PERM_SE_COL)}.`,
        ).toBe(SE_VITAL)
        await step()
    })

    test('TC-5 — DelExtRec KHÔNG được đụng răng nằm ngoài 部位 của dòng bị xoá', async () => {
        expect(sigaBefore, 'không chụp được nguyên trạng siga ở beforeAll').not.toBeNull()
        const s = await mustReadSiga()

        // Mọi cột TRỪ 2 cột đang thử phải y hệt lúc trước khi test bắt đầu.
        const seDrift = s.se
            .map((v, i) => ({ col: i + 1, before: sigaBefore!.se[i], after: v }))
            .filter((d) => d.col !== PERM_SE_COL && d.before !== d.after)
        const snDrift = s.sn
            .map((v, i) => ({ col: i + 1, before: sigaBefore!.sn[i], after: v }))
            .filter((d) => d.col !== MILK_SN_COL && d.before !== d.after)

        expect(
            [...seDrift.map((d) => `se_${d.col}: ${d.before}→${d.after}`), ...snDrift.map((d) => `sn_${d.col}: ${d.before}→${d.after}`)],
            'RevertExtraction chỉ được đụng các ô 部位 KHÁC 0 của dòng bị xoá — nó đi qua ' +
                '`ToothSlots.Enumerate`, vốn chỉ sinh cột cho ô 1..9 (永久歯) và 11..19 (乳歯). ' +
                'Có cột đổi ngoài phạm vi ⇒ DelExtRec quét sai răng.\n' +
                'NGOẠI LỆ HỢP LỆ: nếu tháng test còn 処置行 THẬT mang 170/176/179 (xem cảnh báo ' +
                '"đang có N 処置行 THẬT" ở log beforeAll) thì F9 lần đầu ghi 歯式 cho chúng là ĐÚNG — ' +
                'chọn TEST_PAT_NO/TEST_TRT_DT vào tháng trống rồi chạy lại trước khi kết luận.',
        ).toEqual([])
        await step()
    })

    test(`TC-6 — 乳歯: sn_${MILK_SN_COL} về 生活歯 = ${SN_VITAL}, KHÔNG phải 0 (DelExtRec:6164)`, async () => {
        const s = await mustReadSiga()
        const actual = snOf(s, MILK_SN_COL)
        const outOfDomain = s.sn
            .map((v, i) => ({ col: i + 1, v }))
            .filter((x) => !SN_DOMAIN.includes(x.v))
        console.log(
            `sau F9 #2: sn_${MILK_SN_COL} = ${actual}; các cột sn ngoài miền {${SN_DOMAIN.join(',')}}: ` +
                (outOfDomain.map((x) => `sn_${x.col}=${x.v}`).join(', ') || '(không có)'),
        )

        // Ba vế của CÙNG một bất biến → soft để một lần chạy thấy hết.
        //
        // LỊCH SỬ: vế đầu từng ĐỎ — bản port cũ dùng chung số 0 cho cả hai thang răng
        // (`Revert` đặt "se = 0; sn = 0"), đúng cho 永久歯 nhưng sai cho 乳歯. Đã sửa ở
        // `e2935ef8c` và nay `RevertExtraction` lấy cặp `SigaToothCondition.Vital`
        // = (0, 5) nên tách đúng theo thang. Giữ TC làm hàng rào chống hồi quy.
        expect
            .soft(
                actual,
                `WinForm DelExtRec ghi "SN${MILK_SN_COL} = 5" cho 乳歯 (frm203002.cs:6164/6175) — 5 mới là ` +
                    `生活歯 của 乳歯 (CommonChk.cs:549), và cũng là DEFAULT của cột. Đang là ${actual}. ` +
                    'Ra 0 nghĩa là ai đó lại dùng chung một hằng 健全 cho cả hai thang răng.',
            )
            .toBe(SN_VITAL)
        expect
            .soft(
                outOfDomain,
                `sn_* chỉ được mang giá trị trong {${SN_DOMAIN.join(', ')}} (5=生活歯, 6/7/8=失活歯, 9=欠損歯 — ` +
                    'ToothConditionChecker.cs:101-126). Giá trị ngoài miền không khớp case nào trong ' +
                    'switch của chkSiga ⇒ răng đó thoát mọi phép lọc 生活/失活/欠損, và nằm lại DB vĩnh viễn.',
            )
            .toEqual([])

        // Vế thứ ba: chính con số màn 口腔内情報 đọc về (oral-info-screen.tsx:77).
        if (apiOrigin !== '' && authHeaders['authorization'] !== undefined) {
            const res = await page.request.get(`${apiOrigin}${SIGA_PATH}?patNo=${PAT_NO}`, {
                headers: authHeaders,
            })
            expect(res.status(), `GET ${SIGA_PATH}`).toBe(200)
            const json = (await res.json().catch(() => ({}))) as {
                data?: { sn?: number[] }
                sn?: number[]
            }
            const sn = json.data?.sn ?? json.sn
            if (Array.isArray(sn)) {
                console.log(`GET ${SIGA_PATH} trả sn[${MILK_SN_COL - 1}] = ${sn[MILK_SN_COL - 1]}`)
                expect
                    .soft(
                        sn[MILK_SN_COL - 1],
                        `Con số API trả cho màn 口腔内情報 phải khớp DB — guard ` +
                            '`getDeciSigaRaw(...) === 5` (oral-info-screen.tsx:873) chỉ kích hoạt khi là 5.',
                    )
                    .toBe(SN_VITAL)
            }
        } else {
            console.log('chưa bắt được token API → BỎ QUA vế kiểm GET /tenant/siga')
        }
        await step()
    })
})
