import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 F8 会計 → các cột của bảng `unpaid` phải khớp WinForm. Hai chỗ đã đo
 * được lệch khi đối chiếu với SIM2000, cùng nằm trong MỘT câu INSERT
 * (`modAcc.LetAccData2` → `UnPaid.insertUnPaid`, modAcc.cs:626-707):
 *
 *   · `sflg`   (初診フラグ) — phải theo bảng mã **1=初診 / 2=再診 / 3=再初診**.
 *   · `att_dr` (担当医)     — phải là Dr đang chọn trên header 診療入力.
 *
 * Bug tester báo (2026-08-26):
 *   · `SFLG`   — hệ cũ ghi 3 cho ngày có 歯科初診料 và 2 cho ngày 歯科再診料;
 *                web ghi 2 cho cả hai ngày.
 *   · `ATT_DR` — hệ cũ ghi 16, web ghi 0.
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - `modAcc.LetAccData2` tự tính `intSyosin` rồi ghi vào UNPAID
 *    (modAcc.cs:639/686/710/751 → `unPaidData.sflg = intSyosin`):
 *        foreach 当日行 (表示順):
 *            if IsFirstVisitTreatCode(cd, sb)           → 初診; break   // :437
 *            if cd == 110 || (cd == 107 && sb == 1)                    // :440
 *                && 当日に「健診より」等の行             → 初診扱い; break  // :447-452
 *        intSyosin = 初診 ? (過去に初診あり ? 3 : 1) : 2                 // :465-474
 *  - 「過去に初診あり」 = `Trntrn.getKaikeiPastSyosinCnt` (Trntrn.cs:1274):
 *        TRNTRN, TRT_DT < 当月1日, và (TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0)).
 *    ⚠️ Nhánh 107 khoá theo **PAT_BR** (枝番) chứ không phải TRT_SB — trông như lỗi
 *    gõ của legacy nhưng đây là routine ghi `unpaid.sflg`, nên bản port giữ
 *    nguyên và SQL kỳ vọng trong spec này cũng viết y hệt.
 *  - modAcc còn GHI ĐÈ giá trị của buiPrice bằng `intSyosin`
 *    (`cur_buiPriceData2.syosin_flg = intSyosin`, modAcc.cs:549) ⇒ giá trị của
 *    buiPrice không bao giờ tới được bảng UNPAID.
 *  - `unPaidData.att_dr = ModCommon.pintDrNo` (modAcc.cs:640). `pintDrNo` là giá
 *    trị dropdown `cboDr` trên header 診療入力 TẠI THỜI ĐIỂM bấm F8
 *    (frm203002.cs:8091), KHÔNG phải bác sĩ đã điều trị ngày đó — thanh toán một
 *    ngày cũ thì WinForm vẫn đóng dấu bác sĩ đang hiện trên header. Đó là lý do
 *    spec đọc kỳ vọng từ CHÍNH cái dropdown chứ không từ `trn_trn.dr_no`.
 *
 * ─── Web port ────────────────────────────────────────────────────────────────
 *  - `Ochacom.Application/Treatments/Common/UnpaidSyosinFlgResolver.cs` — port
 *    modAcc, có mã 3, không bao giờ trả 4.
 *  - `InsertUnpaidHandler.ResolveSyosinFlgAsync` — đọc các dòng `trn_trn` của
 *    会計対象日 (theo `disp_no`, `seq`) + câu hỏi 「quá khứ có 初診 chưa」.
 *  - `InsertUnpaidRequest.DrNo` — FE gửi `activeDrNo` (giá trị dropdown Dr), BE
 *    ghi thẳng vào `att_dr`.
 *  - TRƯỚC KHI SỬA: handler lấy `priceResult.SyosinFlg` của `BuiPriceService`
 *    (port `buiPrice.cs`, bảng mã 1 / 2 / **4=訪問診療**, KHÔNG có 3) ⇒ 再初診 là
 *    thứ web không thể ghi ra; còn `att_dr` thì để `0` cứng.
 *
 * ─── Vì sao spec này phải soi DB ─────────────────────────────────────────────
 *  Cả `sflg` lẫn `att_dr` không hiện ở bất kỳ đâu trên màn hình — chính tester
 *  cũng phải mở bảng UNPAID để thấy. Không có đường nào đo qua UI, nên spec chạy
 *  F8 THẬT rồi đọc `view_unpaid_active`. Đây cũng là lý do nó KHÔNG chạy trong
 *  lượt hằng ngày mà phải bật cờ (Rule 18.1).
 *
 * ─── GHI DB — đọc kỹ trước khi chạy ──────────────────────────────────────────
 *  Spec CÓ ghi thật: mỗi lần F8 chạy `deleteTrtDtUnPaid` (xoá mềm dòng 未精算 của
 *  ngày đó) rồi chèn lại. Từ 2026-09-03 bước xoá đó là một endpoint RIÊNG
 *  (`POST …/accounting/clear-unpaid`, chạy ngay sau 日付チェック — modAcc.cs:428);
 *  `insert-unpaid` vẫn tự xoá lần nữa nên hành vi tổng thể không đổi. Vì vậy:
 *   · bắt buộc `TEST_DB=1` (để assert) và `TEST_ALLOW_SAVE=1` (để cho phép ghi);
 *   · chỉ chọn NGÀY CHƯA CÓ 会計 済み (`view_acc_dat_active` trống cho ngày đó),
 *     nên không đụng vào dữ liệu đã quyết toán và cũng không bung hộp 既存会計;
 *   · `beforeAll` chụp lại `id` + `deleted_at` của mọi dòng `unpaid` thuộc các
 *     ngày sẽ test, `afterAll` xoá cứng dòng do lượt chạy sinh ra và bỏ xoá mềm
 *     những dòng vốn đang sống. In ra số dòng đụng tới để không ai phải đoán.
 *  KHÔNG bấm Yes ở hộp 「処置データは変更されています」 — Yes ghi lại cả tháng 処置.
 *
 * ─── Kỳ vọng được TÍNH TỪ DỮ LIỆU, không hardcode ────────────────────────────
 *  DB của tester khác DB của dev, nên spec không cắm cứng "ngày 25 phải là 3".
 *  Nó dò trong tháng đang mở một ngày CHỈ có 初診 và một ngày CHỈ có 再診, rồi
 *  diễn đạt lại luật modAcc bằng SQL để ra giá trị kỳ vọng. Không có ngày phù
 *  hợp thì skip kèm lý do + in bảng ngày ra log để đổi `TEST_PAT_NO`/`TEST_TRT_DT`.
 *
 *  `att_dr` cũng vậy: kỳ vọng lấy từ CHÍNH dropdown Dr trên header ngay trước khi
 *  bấm F8 — đọc nhãn đang hiện rồi tra sang `userNo` bằng danh sách bác sĩ mà màn
 *  hình vừa tải (`GET /tenant/mst-iin-2?userKbn=0`). Header trống thì spec tự chọn
 *  bác sĩ đầu tiên, vì kỳ vọng 0 sẽ trùng đúng giá trị của bug cũ (hardcode 0) và
 *  testcase mất hết ý nghĩa.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. Cột 日 chỉ hiện số ở dòng ĐẦU của mỗi ngày ⇒ đọc DOM phải cộng dồn ngày
 *     gần nhất (giống `accounting-target-date.spec.ts`).
 *  2. Dòng tháng cũ mang rowKey `${recordIndex}-${itemIndex}` — `guardCurrentMonth`
 *     chặn F8 ở đó bằng 「当月以外の操作はできません」. Chỉ chọn dòng tháng hiện hành.
 *  3. Ô 日 bấm HAI lần sẽ mở 日付変更 ⇒ chỉ bấm một lần.
 *  4. `SanteiConfirmDialog` 「〜を算定しますか？」 đè lên mọi click; `addLocatorHandler`
 *     chỉ chạy khi có ACTION nên trước `keyboard.press` phải tự vét.
 *  5. Mốc "đã ghi xong" là RESPONSE của `POST …/accounting/insert-unpaid`, không
 *     phải việc màn hình nhảy sang 窓口精算 — đọc DB trước khi commit xong sẽ ra
 *     dữ liệu cũ.
 *  6. modAcc ghi CÙNG một `intSyosin` (và cùng một `att_dr`) cho cả ba dòng
 *     医療保険 / 介護保険 / 自費 của ngày ⇒ assert trên MỌI dòng, không phải dòng đầu.
 *  7. Dropdown Dr là Radix Select, KHÔNG phải `<select>` gốc: trigger là `button`
 *     nằm ngay sau `<span>Dr:</span>`, và danh sách bung ra qua PORTAL ở `body`
 *     với `role="option"` (Rule 12.6). Nhãn hiện trên trigger là TÊN bác sĩ, còn
 *     thứ ghi xuống DB là `user_no` ⇒ bắt buộc phải tra bảng ánh xạ.
 *
 * ─── KHÔNG kiểm ở đây ────────────────────────────────────────────────────────
 *  Các nhánh 「健診より/自費より」, thứ tự "hit đầu tiên thắng", 訪問診療 không ra 4,
 *  và chỗ cố ý lệch với `modSave.SetOrder` đều đã có unit test:
 *  `apps/api/tests/Ochacom.Application.UnitTests/Treatments/Common/UnpaidSyosinFlgResolverTests.cs`.
 *  Việc `drNo` đi từ body request tới Command đã có
 *  `apps/api/tests/Ochacom.Api.UnitTests/Mappers/Treatments/InsertUnpaidRequestMapperTests.cs`.
 *  Ở đây chỉ chứng minh đường dây thật: F8 → BE → cột `sflg` / `att_dr` trong DB.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/unpaid-insert-parity.spec.ts --retries=0
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138)
 *   TEST_TRT_DT        ngày bất kỳ TRONG THÁNG muốn dò (mặc định hôm nay)
 *   TEST_DB=1          BẮT BUỘC — assert soi thẳng Postgres
 *   TEST_ALLOW_SAVE=1  BẮT BUỘC — F8 ghi 未精算データ thật
 *
 * Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19).
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = Number(process.env.TEST_PAT_NO ?? '12138')

/** Ngày bất kỳ trong THÁNG muốn dò — chỉ phần 年月 được dùng. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

const MONTH_START = `${TRT_DT.slice(0, 8)}01`
const MONTH_END = (() => {
    const y = Number(TRT_DT.slice(0, 4))
    const m = Number(TRT_DT.slice(5, 7))
    const last = new Date(y, m, 0).getDate()
    return `${TRT_DT.slice(0, 8)}${String(last).padStart(2, '0')}`
})()

/** Rule 18.1 — F8 ghi 未精算データ thật nên phải có cờ. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

const GRID_LOAD_TIMEOUT = 60_000
const INSERT_TIMEOUT = 90_000

/** LetAccData2 bước GHI — mốc "BE đã chèn xong" (BẪY 5). */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

/** Danh sách bác sĩ của dropdown Dr (`cboDr`) — nhãn hiển thị ↔ `user_no`. */
const MST_IIN_DOCTORS_URL = /\/tenant\/mst-iin-2\?.*userKbn=0/

/** Chỉ số cột 日 — `RegiCol.day` = cột 0 (frm203002.cs:158). */
const COL_DAY = 0

/** rowKey dòng tháng cũ (`isHistoryRowKey`); dòng tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** Ba giá trị hợp lệ của `unpaid.sflg` — buiPrice's 4 KHÔNG nằm trong đây. */
const SFLG = { firstVisit: 1, revisit: 2, repeatFirstVisit: 3 } as const

interface DaySummary {
    trtDt: string
    hasSyosin: boolean
    hasSaisin: boolean
    hasPhrase: boolean
    settled: boolean
}

interface UnpaidRow {
    trtCnt: number
    kmCd: number
    sflg: number
    attDr: number
}

/** Dòng lưới tháng hiện hành kèm ngày ĐÃ CỘNG DỒN (BẪY 1). */
interface DayRow {
    key: string
    day: string
}

/** `true` nếu locator hiện ra trong `timeout` — `isVisible()` KHÔNG chờ. */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/** Chờ cái nào hiện trước; `false` nếu hết `timeout` mà không cái nào. */
async function appearedAny(locators: Locator[], timeout: number): Promise<boolean> {
    const races = locators.map((l) =>
        l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false),
    )
    return Promise.race([
        ...races,
        new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500)),
    ])
}

/**
 * Từng ngày có 処置 trong tháng, kèm những gì luật modAcc cần biết.
 *
 * `has_syosin` dùng đúng tập mã của `Check.IsFirstVisitTreatCode` (Check.cs:12383):
 * 100-0 / 100-1 / 107-0 / 333-50 / 333-55.
 */
async function readMonthDays(): Promise<DaySummary[]> {
    return withDb(async (c) => {
        const r = await c.query<{
            trt_dt: Date | string
            has_syosin: boolean
            has_saisin: boolean
            has_phrase: boolean
            settled: boolean
        }>(
            `WITH d AS (
                 SELECT trt_dt,
                        bool_or((trt_cd = 100 AND trt_sb IN (0, 1))
                             OR (trt_cd = 107 AND trt_sb = 0)
                             OR (trt_cd = 333 AND trt_sb IN (50, 55)))       AS has_syosin,
                        bool_or(trt_cd = 110 OR (trt_cd = 107 AND trt_sb = 1)) AS has_saisin,
                        bool_or(COALESCE(dsp_trt, '') LIKE '%健診より%'
                             OR COALESCE(dsp_trt, '') LIKE '%検診より%'
                             OR COALESCE(dsp_trt, '') LIKE '%自費より%'
                             OR COALESCE(dsp_trt, '') LIKE '%健康診断の結果に基づき治療開始%')
                                                                             AS has_phrase
                   FROM view_trn_trn_active
                  WHERE pat_no = $1 AND trt_dt BETWEEN $2 AND $3
                  GROUP BY trt_dt
             )
             SELECT d.trt_dt, d.has_syosin, d.has_saisin, d.has_phrase,
                    EXISTS (SELECT 1 FROM view_acc_dat_active a
                             WHERE a.pat_no = $1 AND a.trt_dt = d.trt_dt) AS settled
               FROM d
              ORDER BY d.trt_dt`,
            [PAT_NO, MONTH_START, MONTH_END],
        )
        return r.rows.map((row) => ({
            trtDt: String(row.trt_dt instanceof Date ? isoOf(row.trt_dt) : row.trt_dt).slice(0, 10),
            hasSyosin: row.has_syosin,
            hasSaisin: row.has_saisin,
            hasPhrase: row.has_phrase,
            settled: row.settled,
        }))
    })
}

/** `yyyy-MM-dd` theo giờ ĐỊA PHƯƠNG — `toISOString()` lệch ngày ở múi giờ +09. */
function isoOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 「過去に初診あり」 — diễn đạt lại `Trntrn.getKaikeiPastSyosinCnt` (Trntrn.cs:1283-1287)
 * bằng SQL, GIỮ NGUYÊN chỗ nhánh 107 khoá theo `pat_br` chứ không phải `trt_sb`.
 */
async function readHasPastFirstVisit(): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ exists: boolean }>(
            `SELECT EXISTS (
                 SELECT 1 FROM view_trn_trn_active
                  WHERE pat_no = $1
                    AND trt_dt < $2
                    AND (trt_cd = 100 OR (trt_cd = 107 AND pat_br = 0))
             ) AS exists`,
            [PAT_NO, MONTH_START],
        )
        return r.rows[0]?.exists ?? false
    })
}

/** Mọi dòng 未精算 còn sống của một ngày. */
async function readUnpaidRows(trtDt: string): Promise<UnpaidRow[]> {
    return withDb(async (c) => {
        const r = await c.query<{ trt_cnt: number; km_cd: number; sflg: number; att_dr: number }>(
            `SELECT trt_cnt, km_cd, sflg, att_dr
               FROM view_unpaid_active
              WHERE pat_no = $1 AND trt_dt = $2
              ORDER BY trt_cnt, km_cd`,
            [PAT_NO, trtDt],
        )
        return r.rows.map((row) => ({
            trtCnt: Number(row.trt_cnt),
            kmCd: Number(row.km_cd),
            sflg: Number(row.sflg),
            attDr: Number(row.att_dr),
        }))
    })
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: `sflg` không hiện trên UI, assert phải soi Postgres')
skipWithReason(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: F8 会計 ghi 未精算データ thật (Rule 18.1)')

test.describe('診療入力 F8 → unpaid: sflg (1/2/3) và att_dr phải khớp modAcc', () => {
    let page: Page
    let step: () => Promise<void>

    /** Ngày CHỈ có 初診 và ngày CHỈ có 再診, đều chưa quyết toán. */
    let syosinDay: string | null = null
    let saisinDay: string | null = null

    /** Giá trị kỳ vọng cho ngày 初診: 3 nếu trước tháng này đã có 初診, không thì 1. */
    let expectedSyosinFlg: number = SFLG.firstVisit

    /** `id` → `deleted_at` của mọi dòng unpaid thuộc các ngày test, chụp TRƯỚC khi chạy. */
    const unpaidSnapshot = new Map<string, string | null>()

    /**
     * Nhãn bác sĩ trên dropdown ↔ `user_no` — bắt từ CHÍNH response mà màn hình
     * tải (`GET /tenant/mst-iin-2?userKbn=0`). Không hỏi DB: cái ghi xuống
     * `att_dr` là giá trị màn hình đang cầm, nên nguồn kỳ vọng cũng phải là nó.
     * Trùng tên hai bác sĩ → lưu -1 để testcase skip thay vì đoán bừa.
     */
    const doctorNoByName = new Map<string, number>()

    /** Thứ tự bác sĩ như dropdown dựng — cần khi header trống, phải tự chọn. */
    const doctorNames: string[] = []

    /** 会計対象日 → Dr đang hiện trên header lúc bấm F8 = kỳ vọng của `att_dr`. */
    const expectedAttDr = new Map<string, number>()

    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    // Các cổng của chuỗi F8 (frm203002.IDM_Acc_Click + modAcc.LetAccData2).
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')

    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    /**
     * Trigger của dropdown Dr trên header — Radix Select nên nó là `button` đứng
     * ngay sau `<span>Dr:</span>` (BẪY 7). Nhãn hiện trên nút là TÊN bác sĩ.
     */
    const drTrigger = () =>
        page
            .getByText('Dr:', { exact: true })
            .first()
            .locator('xpath=following-sibling::button[1]')

    /**
     * Bảo đảm header ĐANG chọn một bác sĩ thật, trả về `user_no` của người đó.
     *
     * Vì sao phải ép chọn: header trống ⇒ FE gửi `drNo = 0` ⇒ kỳ vọng cũng là 0,
     * trùng đúng giá trị mà bug cũ (hardcode 0) sinh ra, testcase sẽ xanh cả trên
     * bản hỏng. Trả về 0 khi phòng khám không có bác sĩ nào hoặc tên bị trùng —
     * lúc đó testcase tự skip kèm lý do.
     */
    async function ensureHeaderDoctor(): Promise<number> {
        const readLabel = async () => (await drTrigger().innerText()).trim()

        let label = await readLabel()
        if (doctorNoByName.get(label) === undefined || doctorNoByName.get(label) === -1) {
            const pick = doctorNames.find((nm) => (doctorNoByName.get(nm) ?? -1) > 0)
            if (pick === undefined) return 0
            await drTrigger().click()
            // Radix bung listbox qua portal ở `body`; mục chọn mang role="option".
            await page.getByRole('option', { name: pick, exact: true }).first().click()
            await expect(drTrigger()).toContainText(pick, { timeout: 10_000 })
            label = await readLabel()
        }
        const no = doctorNoByName.get(label) ?? 0
        return no > 0 ? no : 0
    }

    async function drainSanteiDialogs() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(santei, 2_000))) return
            await page
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    async function openEntry(trtDt: string) {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${trtDt}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
    }

    /** Đọc cột 日 toàn lưới, cộng dồn ngày (BẪY 1), bỏ dòng tháng cũ + dòng 日計. */
    async function currentMonthDayRows(): Promise<DayRow[]> {
        const raw = await page.locator(`[data-grid-cell$="|${COL_DAY}"]`).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
        const out: DayRow[] = []
        let carried = ''
        for (const r of raw) {
            if (r.key.includes(':')) continue
            if (HISTORY_KEY_RE.test(r.key)) continue
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === '') continue
            out.push({ key: r.key, day: carried })
        }
        return out
    }

    /**
     * Trả lời các cổng của chuỗi F8 cho tới khi hết.
     *
     * Bản sao rút gọn của helper trong `accounting-target-date.spec.ts` — cố ý
     * giữ riêng để mỗi spec chạy độc lập. KHÁC một chỗ: ở đây `insert-unpaid`
     * KHÔNG bị chặn, vì đúng thứ cần đo là dòng nó ghi xuống.
     *   · 会計前チェック → OK      · 処置データ変更 → No (Yes ghi cả tháng — cấm)
     *   · 日付チェック   → OK      · 既存会計/計上   → No
     *   · 入金指定       → F10 戻る
     */
    async function settleAccountingDialogs(rounds = 8) {
        for (let i = 0; i < rounds; i++) {
            const boxes = [
                checkGate(),
                dirtyGate(),
                dateGate(),
                createGate(),
                chgAccGate(),
                nyukinDialog(),
            ]
            if (!(await appearedAny(boxes, 15_000))) break

            if (await checkGate().isVisible().catch(() => false)) {
                await btn(checkGate(), 'OK').first().click()
                continue
            }
            if (await dirtyGate().isVisible().catch(() => false)) {
                await btn(dirtyGate(), 'No').first().click()
                continue
            }
            if (await dateGate().isVisible().catch(() => false)) {
                await btn(dateGate(), 'OK').first().click()
                await expect(dateGate()).toBeHidden({ timeout: 10_000 })
                continue
            }
            if (await createGate().isVisible().catch(() => false)) {
                await btn(createGate(), /^(No|いいえ)$/).first().click()
                continue
            }
            if (await chgAccGate().isVisible().catch(() => false)) {
                await btn(chgAccGate(), /^(No|いいえ)$/).first().click()
                continue
            }
            if (await nyukinDialog().isVisible().catch(() => false)) {
                await btn(nyukinDialog(), /F10\s*戻る/).first().click()
                continue
            }
            break
        }
    }

    /**
     * Mở màn hình ở `trtDt`, đặt con trỏ vào dòng của ngày đó rồi F8, chờ BE chèn
     * xong. Trả về `false` nếu lưới không có dòng nào của ngày đó.
     */
    async function runF8On(trtDt: string): Promise<boolean> {
        await openEntry(trtDt)

        const wantDay = String(Number(trtDt.slice(8, 10)))
        const target = (await currentMonthDayRows()).find((r) => r.day === wantDay)
        if (!target) return false

        await drainSanteiDialogs()
        await page.locator(`[data-grid-cell="${target.key}|${COL_DAY}"]`).click()
        await step()

        // Chốt 担当医 NGAY TRƯỚC khi bấm — WinForm đọc pintDrNo tại đúng thời điểm
        // này (modAcc.cs:640), nên kỳ vọng cũng phải chụp ở đây chứ không phải
        // lúc mở màn hình.
        expectedAttDr.set(trtDt, await ensureHeaderDoctor())

        // Mốc tin cậy là response của bước GHI, không phải việc đổi URL (BẪY 5).
        const inserted = page
            .waitForResponse(
                (r) => INSERT_UNPAID_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: INSERT_TIMEOUT },
            )
            .catch(() => null)

        await drainSanteiDialogs()
        await page.keyboard.press('F8')
        await settleAccountingDialogs()

        const res = await inserted
        expect(
            res,
            `F8 ở ngày ${trtDt} không gọi insert-unpaid — chưa ghi thì không đo được sflg`,
        ).not.toBeNull()
        expect(res?.status(), 'insert-unpaid trả lỗi').toBe(200)
        await step()
        return true
    }

    test.beforeAll(async ({ browser }) => {
        // ── Chọn ngày test từ chính dữ liệu của DB đang chạy ──────────────────
        const days = await readMonthDays()
        console.log(`Tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO}:`)
        for (const d of days) {
            console.log(
                `  ${d.trtDt} 初診=${d.hasSyosin} 再診=${d.hasSaisin} ` +
                    `初診扱い文言=${d.hasPhrase} 会計済=${d.settled}`,
            )
        }

        // Ngày CHỈ có 初診 / CHỈ có 再診 để luật "hit đầu tiên thắng" không phụ
        // thuộc thứ tự dòng, và ngày phải CHƯA quyết toán để F8 không bung hộp
        // 既存会計 và không đụng dữ liệu đã chốt.
        syosinDay = days.find((d) => d.hasSyosin && !d.hasSaisin && !d.settled)?.trtDt ?? null
        saisinDay =
            days.find((d) => d.hasSaisin && !d.hasSyosin && !d.hasPhrase && !d.settled)?.trtDt ??
            null
        expectedSyosinFlg = (await readHasPastFirstVisit())
            ? SFLG.repeatFirstVisit
            : SFLG.firstVisit
        console.log(
            `→ ngày 初診 = ${syosinDay ?? '(không có)'} (kỳ vọng sflg=${expectedSyosinFlg}), ` +
                `ngày 再診 = ${saisinDay ?? '(không có)'} (kỳ vọng sflg=${SFLG.revisit})`,
        )

        // ── Chụp lại unpaid của các ngày sẽ test, để afterAll trả nguyên trạng ──
        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        if (targets.length > 0) {
            await withDb(async (c) => {
                const r = await c.query<{ id: string; deleted_at: string | null }>(
                    `SELECT id, deleted_at FROM unpaid WHERE pat_no = $1 AND trt_dt = ANY($2)`,
                    [PAT_NO, targets],
                )
                for (const row of r.rows) unpaidSnapshot.set(row.id, row.deleted_at)
            })
            console.log(
                `unpaid hiện có ở các ngày test: ${unpaidSnapshot.size} dòng — afterAll sẽ trả về nguyên trạng`,
            )
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Bảng bác sĩ lấy từ chính response màn hình tải, không hỏi DB (xem chú
        // thích ở `doctorNoByName`). Response tới trước khi dropdown render nên
        // lúc cần tra thì bảng đã đầy.
        page.on('response', (res) => {
            if (!MST_IIN_DOCTORS_URL.test(res.url())) return
            void res
                .json()
                .then((body: { data?: { userNo?: number | string; userNm?: string }[] }) => {
                    for (const d of body.data ?? []) {
                        const nm = (d.userNm ?? '').trim()
                        const no = Number(d.userNo ?? 0)
                        if (nm === '' || !Number.isFinite(no)) continue
                        if (!doctorNoByName.has(nm)) {
                            doctorNoByName.set(nm, no)
                            doctorNames.push(nm)
                        } else if (doctorNoByName.get(nm) !== no) {
                            doctorNoByName.set(nm, -1) // trùng tên ⇒ không tra được
                        }
                    }
                })
                .catch(() => {})
        })

        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 50 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test.afterAll(async () => {
        await page?.close()

        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        if (!dbEnabled || targets.length === 0) return

        // Xoá CỨNG dòng do lượt chạy sinh ra, rồi bỏ xoá mềm những dòng vốn đang
        // sống mà F8 vừa dọn đi. Hai bước, không phải một: `deleteTrtDtUnPaid`
        // xoá mềm dòng cũ TRƯỚC khi chèn dòng mới.
        await withDb(async (c) => {
            const known = [...unpaidSnapshot.keys()]
            const del = await c.query(
                `DELETE FROM unpaid
                  WHERE pat_no = $1 AND trt_dt = ANY($2)
                    AND ($3::uuid[] = '{}' OR NOT (id = ANY($3::uuid[])))`,
                [PAT_NO, targets, known],
            )
            const revive = [...unpaidSnapshot.entries()]
                .filter(([, deletedAt]) => deletedAt === null)
                .map(([id]) => id)
            let revived = 0
            if (revive.length > 0) {
                const up = await c.query(
                    `UPDATE unpaid SET deleted_at = NULL, deleted_by = NULL
                      WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`,
                    [revive],
                )
                revived = up.rowCount ?? 0
            }
            console.log(
                `afterAll: xoá ${del.rowCount ?? 0} dòng unpaid do test sinh ra, ` +
                    `khôi phục ${revived} dòng bị F8 xoá mềm`,
            )
        }).catch((e: unknown) => console.log(`afterAll: dọn không xong — ${String(e)}`))
    })

    test('TC-SFLG-1 — ngày có 初診: sflg = 1 hoặc 3 theo quá khứ, KHÔNG BAO GIỜ 2', async () => {
        skipWithReason(
            syosinDay === null,
            `tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO} không có ngày nào CHỈ có 初診 ` +
                `và chưa quyết toán — đổi TEST_PAT_NO / TEST_TRT_DT (xem bảng ngày in ở log)`,
        )
        if (syosinDay === null) return

        expect(await runF8On(syosinDay), `lưới không có dòng nào của ngày ${syosinDay}`).toBe(true)

        const rows = await readUnpaidRows(syosinDay)
        expect(rows, `F8 không để lại dòng 未精算 nào cho ngày ${syosinDay}`).not.toHaveLength(0)

        for (const row of rows) {
            // Đây là con số tester đọc trên bảng UNPAID.
            expect(
                row.sflg,
                `ngày ${syosinDay} có 初診 mà unpaid.sflg = ${row.sflg} (km_cd=${row.kmCd}). ` +
                    `Ra 2 nghĩa là vẫn đang lấy 再診; ra 4 nghĩa là còn dùng bảng mã của buiPrice.`,
            ).toBe(expectedSyosinFlg)
        }
        console.log(`${syosinDay}: sflg = ${rows.map((r) => r.sflg).join(', ')}`)
    })

    test('TC-SFLG-2 — ngày chỉ có 再診: sflg = 2 kể cả khi quá khứ đã có 初診', async () => {
        skipWithReason(
            saisinDay === null,
            `tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO} không có ngày nào CHỈ có 再診 ` +
                `và chưa quyết toán — đổi TEST_PAT_NO / TEST_TRT_DT (xem bảng ngày in ở log)`,
        )
        if (saisinDay === null) return

        expect(await runF8On(saisinDay), `lưới không có dòng nào của ngày ${saisinDay}`).toBe(true)

        const rows = await readUnpaidRows(saisinDay)
        expect(rows, `F8 không để lại dòng 未精算 nào cho ngày ${saisinDay}`).not.toHaveLength(0)

        for (const row of rows) {
            // Bước hạ 再初診 chỉ áp cho ngày 初診 (modAcc.cs:465 gác trên flgSyosin).
            expect(
                row.sflg,
                `ngày ${saisinDay} chỉ có 再診 mà unpaid.sflg = ${row.sflg} (km_cd=${row.kmCd})`,
            ).toBe(SFLG.revisit)
        }
        console.log(`${saisinDay}: sflg = ${rows.map((r) => r.sflg).join(', ')}`)
    })

    test('TC-ATTDR-1 — att_dr = Dr đang chọn trên header, KHÔNG phải 0', async () => {
        const tested = [...expectedAttDr.entries()]
        skipWithReason(tested.length === 0, 'không có ngày nào chạy được ở TC-SFLG-1/2')
        if (tested.length === 0) return

        const usable = tested.filter(([, drNo]) => drNo > 0)
        skipWithReason(
            usable.length === 0,
            'dropdown Dr không chọn được bác sĩ nào (phòng khám chưa có mst-iin user_kbn=0, ' +
                'hoặc hai bác sĩ trùng tên) — kỳ vọng 0 sẽ trùng đúng giá trị của bug cũ nên ' +
                'testcase mất ý nghĩa',
        )
        if (usable.length === 0) return

        // Không bấm F8 thêm lần nào: đọc lại chính những dòng TC-SFLG-1/2 vừa tạo.
        for (const [day, drNo] of usable) {
            const rows = await readUnpaidRows(day)
            expect(rows, `không còn dòng 未精算 nào của ngày ${day}`).not.toHaveLength(0)
            for (const row of rows) {
                expect(
                    row.attDr,
                    `ngày ${day}: att_dr = ${row.attDr} (km_cd=${row.kmCd}) nhưng header đang ` +
                        `chọn Dr ${drNo}. Ra 0 nghĩa là 担当医 vẫn bị bỏ trống như trước khi sửa.`,
                ).toBe(drNo)
            }
            console.log(`${day}: att_dr = ${rows.map((r) => r.attDr).join(', ')} (header Dr ${drNo})`)
        }
    })

    test('TC-SFLG-3 — mọi dòng vừa ghi chỉ mang 1/2/3, không có mã 4 của buiPrice', async () => {
        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        skipWithReason(targets.length === 0, 'không có ngày nào chạy được ở TC-SFLG-1/2')
        if (targets.length === 0) return

        // Không bấm F8 thêm lần nào — đọc lại chính những dòng hai testcase trên
        // vừa tạo. `4` là giá trị của `BuiPriceService.SyosinFlg` cho 訪問診療: nếu
        // nó xuất hiện thì dây cũ đã quay lại.
        for (const day of targets) {
            for (const row of await readUnpaidRows(day)) {
                expect(
                    [SFLG.firstVisit, SFLG.revisit, SFLG.repeatFirstVisit],
                    `ngày ${day} có unpaid.sflg = ${row.sflg}, ngoài bảng mã của modAcc`,
                ).toContain(row.sflg)
            }
        }
    })
})
