import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 F8 会計 — nhánh 「既に会計処理がされています」 → 会計データ修正 (ChgAccData).
 *
 * Đây là ba chỗ lệch parity tìm được khi rà lại `modAcc.LetAccData2` +
 * `modAcc.ChgAccData` (2026-09-03, ISSUE-13 trong `userapp/inp-p0-open-issues.md`).
 * Bản thân `ChgAccData` đã port từ trước — spec này KHÔNG đo lại việc nó ghi
 * `acc_dat`/`person_exp` (đã có unit test `AccountingBalanceAllocatorTests`), mà đo
 * ba thứ chỉ nhìn thấy được ở tầng màn hình + đường dây request:
 *
 *   1. `deleteTrtDtUnPaid` phải chạy VÔ ĐIỀU KIỆN, kể cả nhánh không insert.
 *   2. Nút mặc định của hai hộp đầu là 「いいえ」, của hộp 会計データ修正 là 「はい」.
 *   3. Nhánh 「từ chối 差額 + tre_acc_link = 1」 phải gọi 会計データ修正, KHÔNG phải
 *      lặng lẽ bỏ qua rồi báo thành công (đúng cái comment cũ ở
 *      `treatment-entry-detail.tsx:1806` mô tả — comment đó nay đã sửa).
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - `modAcc.LetAccData2` (modAcc.cs:346):
 *        :386-391  日付チェック — Cancel ⇒ return TRUE (chưa xoá gì)
 *        :428      UnPaid.deleteTrtDtUnPaid(...)          ← VÔ ĐIỀU KIỆN, TRƯỚC dialog
 *        :560-562  MsgDialog.ShowYesNoMsg(「既に、… 未清算データ（…）を作成して
 *                  よろしいですか？」, MessageBoxDefaultButton.Button2)   ← mặc định いいえ
 *        :579-581  MsgDialog.ShowYesNoMsg(「… 差額分の未精算データ（…）を作成
 *                  しますか？」, MessageBoxDefaultButton.Button2)         ← mặc định いいえ
 *        :598      if (past_billing_amount == 0 || pAccLink == false) → nhánh insert
 *        :709-772  ngược lại → nhánh G: 修正不要 / 医療保険差額 (Button1) / ChgAccData
 *  - `modAcc.ChgAccData` (modAcc.cs:925):
 *        :944-955  MsgDialog.ShowYesNoMsg(「処置点数が N点{削除|追加}されました。
 *                  {金額}{預り金|未収金}に計上しますか？」, MessageBoxDefaultButton.Button1)
 *                                                                       ← mặc định はい
 *
 *  Hai hộp đầu mặc định いいえ vì はい nghĩa là chồng thêm một 未精算 ĐỦ TIỀN lên
 *  ngày đã thu; hộp thứ ba mặc định はい vì đó là hành động WinForm muốn người
 *  dùng chọn. Bấm Enter theo phản xạ ở web (mặc định はい cho cả ba) là thu tiền
 *  hai lần — nên nút mặc định ở đây là parity thật, không phải chi tiết thẩm mỹ.
 *
 * ─── Web port ────────────────────────────────────────────────────────────────
 *  - `treatment-entry-detail.tsx` → `runLetAccData2()`:
 *      · bước 0-3 gọi `POST /tenant/treatment/accounting/clear-unpaid`
 *        (`ClearDayUnpaidHandler`) ngay sau 日付チェック, trước `precheck`;
 *      · hai `confirmDialog(...)` đầu truyền `{ defaultButtonIndex: 1 }`;
 *      · `runChgAccData()` (`:1599`) giữ mặc định 0 = はい rồi gọi
 *        `POST /tenant/treatment/accounting/correct`.
 *  - Trước khi sửa: không có `clear-unpaid` (DELETE nằm trong `InsertUnpaidHandler`),
 *    và cả ba hộp đều mặc định はい.
 *
 * ─── Vì sao phải GIẢ LẬP `precheck` ──────────────────────────────────────────
 *  Nhánh này chỉ mở ra khi ngày đó ĐÃ 窓口精算 (có `acc_dat`) và số tiền hiện tại
 *  khác số đã thu. Dựng trạng thái đó bằng dữ liệu thật nghĩa là phải ghi vào
 *  `acc_dat` + `person_exp` — đúng hai bảng tiền mà không spec nào được phép đụng.
 *  Nên spec CHẶN `GET …/accounting/precheck` và trả về đúng bộ cờ của kịch bản
 *  cần đo. Thứ đang kiểm là LOGIC RẼ NHÁNH CỦA FE, và các cờ đó là toàn bộ đầu vào
 *  của nó — phần tính cờ đã có test riêng ở BE (`GetAccountingPrecheckHandler`).
 *
 *  `GET /tenant/master/acc-config` cũng bị vá (chỉ hai trường): `treAccLink = 1`
 *  để mở nhánh 会計データ修正, `receRcvFlg = 0` để hộp 入金指定 không chen vào. Vá
 *  bằng `route.fetch()` rồi sửa JSON, KHÔNG dựng envelope giả — mọi trường khác
 *  vẫn là cấu hình thật của phòng khám.
 *
 * ─── Ghi DB ──────────────────────────────────────────────────────────────────
 *  Mặc định KHÔNG ghi gì: cả ba endpoint ghi (`clear-unpaid`, `insert-unpaid`,
 *  `correct`) đều bị chặn và trả envelope giả ⇒ TC-CHG-1/2 chạy hằng ngày được
 *  (GUIDELINE Rule 18.1).
 *
 *  Riêng TC-CHG-3 MỞ CHO `clear-unpaid` đi thật (`TEST_ALLOW_SAVE=1`) vì nó đo
 *  đúng cái DELETE đó. Nó tự seed một dòng `unpaid` mốc (`nte = 'E2E-CLEAR'`,
 *  `km_cd = 99` để không đụng khoá `ux_unpaid_active` của dòng thật) rồi kiểm tra
 *  dòng ấy biến mất; `afterAll` xoá cứng dòng mốc dù test đỏ hay xanh.
 *  `insert-unpaid` vẫn bị chặn ⇒ chứng minh được DELETE không còn phụ thuộc INSERT.
 *
 *  TUYỆT ĐỐI không bấm Yes ở hộp 「処置データは変更されています」: Yes chạy bulk-save,
 *  xoá mềm cả tháng 処置 rồi chèn lại.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. Hộp 1 và hộp 差額 CÙNG khớp `/作成し(ますか|てよろしいですか)？/` ⇒ phải phân biệt
 *     bằng 「既に、」 và 「請求金額が増えています」, đừng dùng một locator cho cả hai.
 *  2. `confirmDialog` mặc định nhãn TIẾNG ANH `Yes`/`No` (`ConfirmDialogView`), chỉ
 *     `confirm3` mới ra はい/いいえ. Locator bắt cả hai để khỏi vỡ khi đổi nhãn.
 *  3. Nút "mặc định" của `DialogShell` là nút ĐANG ĐƯỢC FOCUS (`buttonRefs[selected]
 *     .focus()`), không phải nút có class primary ⇒ assert bằng `toBeFocused()`.
 *  4. Con trỏ đặt ở dòng của NGÀY HÔM NAY để hộp 日付チェック không chen vào — spec
 *     này không đo cổng đó (đã có `accounting-target-date.spec.ts`).
 *  5. `SanteiConfirmDialog` 「〜を算定しますか？」 đè lên mọi click; `addLocatorHandler`
 *     chỉ chạy khi có ACTION nên trước `keyboard.press` phải tự vét.
 *  6. Ô 日 bấm HAI lần sẽ mở 日付変更 ⇒ chỉ bấm một lần.
 *
 * ─── KHÔNG kiểm ở đây ────────────────────────────────────────────────────────
 *  · Số học 預り金/未収金 (kể cả bug ISSUE-1 cố ý giữ) — unit test
 *    `AccountingBalanceAllocatorTests`.
 *  · `acc_cnt` của dòng hoàn tiền (`getMaxAccCnt(patNo, 精算日) + 1`) — chỉ dựng
 *    được bằng cách ghi thật vào `acc_dat` + `person_exp`, không đáng đánh đổi
 *    trong e2e. Xem ISSUE-13-b.
 *  · Cách BE tính các cờ của `precheck` — ở đây chúng bị giả lập.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/chg-acc-data-parity.spec.ts --retries=0
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/chg-acc-data-parity.spec.ts --retries=0
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138)
 *   TEST_DB=1          seed 処置行 cho hôm nay + bật TC-CHG-3
 *   TEST_ALLOW_SAVE=1  cho `clear-unpaid` chạy thật ở TC-CHG-3 (Rule 18.1)
 *
 * Chạy CẢ FILE, KHÔNG `-g` một testcase lẻ (Rule 19): khối serial dùng chung một
 * page và một lần login.
 *
 * ⚠️ CHẠY RIÊNG TỪNG FILE. `playwright.config.ts` để `fullyParallel: true` +
 * `workers: 4`, nên đưa spec này cùng lệnh với `accounting-target-date.spec.ts`
 * hay `unpaid-insert-parity.spec.ts` là ba file chạy SONG SONG trên CÙNG một
 * `TEST_PAT_NO` và CÙNG vùng seed `disp_no >= 9000` của hôm nay —
 * `seedTreatmentRows` xoá vùng đó trước khi chèn, `afterAll` của file này lại xoá
 * đúng vùng file kia đang dùng ⇒ dòng biến mất giữa chừng, đỏ ngẫu nhiên.
 * `mode: 'serial'` chỉ nối tiếp TRONG một file, không chặn được giữa các file.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = Number(process.env.TEST_PAT_NO ?? '12138')

/** Màn hình luôn mở ở HÔM NAY — con trỏ ở dòng hôm nay thì không có hộp 日付チェック. */
const TODAY_ISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

/** Ngày trong tháng, không đệm 0 — đúng như ô 日 render. */
const TODAY_DAY = String(Number(TODAY_ISO.slice(8, 10)))

/** Rule 18.1 — TC-CHG-3 để `clear-unpaid` xoá thật. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

const GRID_LOAD_TIMEOUT = 60_000

// ── Endpoint của chuỗi 会計 ───────────────────────────────────────────────────
const ACC_CONFIG_URL = /\/tenant\/master\/acc-config(\?|$)/
const ACC_PRECHECK_URL = /\/tenant\/treatment\/accounting\/precheck/
const ACC_CLEAR_UNPAID_URL = /\/tenant\/treatment\/accounting\/clear-unpaid(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/
const ACC_CORRECT_URL = /\/tenant\/treatment\/accounting\/correct(\?|$)/

/** Chỉ số cột 日 — `RegiCol.day` = cột 0 (frm203002.cs:158). */
const COL_DAY = 0

/** rowKey dòng tháng cũ (`isHistoryRowKey`); dòng tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** Hai 処置行 seed cho hôm nay — 再診 đơn lẻ, không chạm nhánh 初診 nào. */
const SEED_ROWS = [
    { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '再診' },
    { trtCd: 108, trtSb: 9, trtPt: 2, trtCnt: 1, dspTrt: '外安全１(再診)' },
] as const

/** `km_cd` của dòng `unpaid` mốc — ngoài mọi dải thật (医療 40-49/57-58, 自費 50). */
const MARKER_KM_CD = 99
/** `nte` của dòng mốc — `afterAll` xoá theo đúng chuỗi này. */
const MARKER_NTE = 'E2E-CLEAR'

/** Bộ cờ `AccountingPrecheckResponse` mà FE dùng để rẽ nhánh. */
interface PrecheckStub {
    pastExists: boolean
    pastBillingAmount: number
    curBillingAmount: number
    isIdentical: boolean
    isCurGreaterOrEqual: boolean
    diffAmount: number
    gIsNothing: boolean
    gIsInsIncrease: boolean
    insDiffPrice: number
    chgDiffScore: number
    chgIsDecrease: boolean
}

/**
 * 既存会計あり, tiền TĂNG, 介護/自費 không giảm.
 *
 * Đây là kịch bản đi qua ĐỦ ba hộp: 既に… → 差額 → 処置点数が…計上しますか？
 * (`isCurGreaterOrEqual` ⇒ `gIsInsIncrease` false ⇒ đi thẳng tới ChgAccData).
 */
const PRECHECK_INCREASE: PrecheckStub = {
    pastExists: true,
    pastBillingAmount: 1000,
    curBillingAmount: 1500,
    isIdentical: false,
    isCurGreaterOrEqual: true,
    diffAmount: 500,
    gIsNothing: false,
    gIsInsIncrease: false,
    insDiffPrice: 500,
    chgDiffScore: 50,
    chgIsDecrease: false,
}

/** 既存会計あり và số tiền Y HỆT — modAcc.cs:571 return true, không ghi gì cả. */
const PRECHECK_IDENTICAL: PrecheckStub = {
    ...PRECHECK_INCREASE,
    curBillingAmount: 1000,
    isIdentical: true,
    diffAmount: 0,
    gIsNothing: true,
    insDiffPrice: 0,
    chgDiffScore: 0,
}

interface DayRow {
    key: string
    day: string
}

/** `true` nếu locator HIỆN RA trong `timeout` — `isVisible()` KHÔNG chờ. */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/** Chờ cái NÀO hiện trước trong danh sách; `false` nếu hết `timeout` mà không cái nào. */
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

/** Chèn một dòng `unpaid` mốc cho ngày `trtDt`; trả về `id` vừa tạo. */
async function seedMarkerUnpaid(trtDt: string): Promise<string> {
    return withDb(async (c) => {
        await c.query(
            `DELETE FROM unpaid WHERE pat_no = $1 AND trt_dt = $2 AND km_cd = $3`,
            [PAT_NO, trtDt, MARKER_KM_CD],
        )
        const r = await c.query<{ id: string }>(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, acc_tm, nte)
             VALUES ($1, 1, $2, $3, now(), $4)
             RETURNING id`,
            [trtDt, PAT_NO, MARKER_KM_CD, MARKER_NTE],
        )
        return r.rows[0]!.id
    })
}

/** Dòng mốc còn SỐNG (chưa bị xoá mềm) hay không. */
async function markerUnpaidAlive(id: string): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ n: string }>(
            `SELECT count(*) AS n FROM view_unpaid_active WHERE id = $1`,
            [id],
        )
        return Number(r.rows[0]?.n ?? 0) > 0
    })
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 F8 → 会計データ修正 (modAcc.ChgAccData) parity', () => {
    let page: Page
    let step: () => Promise<void>

    /** Bộ cờ `precheck` mà route trả về cho lượt F8 kế tiếp. */
    let precheckStub: PrecheckStub = PRECHECK_INCREASE

    /** `true` thì `clear-unpaid` đi thật (chỉ TC-CHG-3 bật). */
    let letClearThrough = false

    /** `id` dòng `unpaid` mốc của TC-CHG-3 — `afterAll` xoá cứng. */
    let markerUnpaidId: string | null = null

    const calls = {
        clearUnpaid: [] as string[],
        insertUnpaid: [] as string[],
        correct: [] as string[],
    }

    function resetCalls() {
        calls.clearUnpaid.length = 0
        calls.insertUnpaid.length = 0
        calls.correct.length = 0
    }

    /** Hộp thoại theo NỘI DUNG — app dùng cả `dialog` lẫn `alertdialog`. */
    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    /** 会計前チェック — frm203002.cs:7705. */
    const checkGate = () => dlg('このまま続けますか?')
    /** ModSave.ExitWithoutSaving — frm203002.cs:7717. */
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    /** Hộp 1 — 既存会計あり (modAcc.cs:560). Phân biệt bằng 「既に、」 (BẪY 1). */
    const existingAccGate = () => dlg('既に、')
    /** Hộp 2 — 差額分の未精算データ (modAcc.cs:579). */
    const diffGate = () => dlg('請求金額が増えています')
    /** Hộp 3 — 会計データ修正 (modAcc.cs:944). */
    const chgAccGate = () => dlg(/に計上しますか？/)

    const yesBtn = (box: Locator) => box.getByRole('button', { name: /^(Yes|はい)$/ }).first()
    const noBtn = (box: Locator) => box.getByRole('button', { name: /^(No|いいえ)$/ }).first()

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

    /** Đóng mọi hộp 「カルテ記載選択」 còn treo — nó nuốt phím F8. */
    async function drainKarteCmtDialogs() {
        const karte = page.locator('[role="dialog"]').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(karte.first(), 2_000))) return
            await karte
                .first()
                .getByRole('button', { name: /F10\s*戻る/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY_ISO}`, {
            waitUntil: 'domcontentloaded',
        })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
    }

    /** Đọc cột 日 toàn lưới, cộng dồn ngày, bỏ dòng tháng cũ + dòng 日計. */
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
     * Đặt con trỏ vào dòng của HÔM NAY rồi bấm F8, trả lời hai cổng đầu
     * (会計前チェック → OK, 処置データ変更 → No). Trả về `false` khi lưới không có
     * dòng nào của hôm nay.
     */
    async function pressF8OnToday(): Promise<boolean> {
        const target = (await currentMonthDayRows()).find((r) => r.day === TODAY_DAY)
        if (!target) return false

        await drainSanteiDialogs()
        await page.locator(`[data-grid-cell="${target.key}|${COL_DAY}"]`).click()
        await step()

        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
        await page.keyboard.press('F8')

        // Hai cổng đứng TRƯỚC LetAccData2 — trả lời cho xong để tới phần cần đo.
        //
        // ⚠️ KHÔNG dùng `appeared(a, 3s)` rồi `appeared(b, 3s)` rồi `break`: 会計前チェック
        // chỉ bung SAU khi POST /treatment/check trả về, và cú gọi đầu tiên sau khi
        // API vừa khởi động lại (JIT + dựng model EF) mất hơn 6 giây ⇒ vòng lặp
        // thoát trước khi hộp kịp hiện, F8 đứng nguyên ở cổng đó và testcase đỏ oan.
        // Đợi CÁI NÀO HIỆN TRƯỚC trong 30 giây, và dừng ngay khi hộp 既存会計 (thứ
        // testcase cần) đã mở.
        for (let i = 0; i < 6; i++) {
            if (!(await appearedAny([checkGate(), dirtyGate(), existingAccGate()], 30_000))) break
            if (await existingAccGate().isVisible().catch(() => false)) break
            if (await checkGate().isVisible().catch(() => false)) {
                await checkGate().getByRole('button', { name: 'OK' }).first().click()
                continue
            }
            if (await dirtyGate().isVisible().catch(() => false)) {
                await noBtn(dirtyGate()).click()
                continue
            }
            break
        }
        return true
    }

    test.beforeAll(async ({ browser }) => {
        // Lưới phải có dòng của HÔM NAY thì mới đặt được con trỏ (BẪY 4).
        if (dbEnabled) {
            await seedTreatmentRows(PAT_NO, TODAY_ISO, [...SEED_ROWS])
            console.log(`seed ${SEED_ROWS.length} dòng 処置 cho ${TODAY_ISO} (bệnh nhân ${PAT_NO})`)
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // 会計設定 — vá ĐÚNG hai trường trên response THẬT, giữ nguyên phần còn lại.
        await page.route(ACC_CONFIG_URL, async (route: Route) => {
            const res = await route.fetch()
            const body = (await res.json()) as {
                data?: { treAccLink?: number; receRcvFlg?: number }
            }
            if (body.data) {
                body.data.treAccLink = 1 // mở nhánh 会計データ修正 (pAccLink)
                body.data.receRcvFlg = 0 // hộp 入金指定 không chen vào
            }
            await route.fulfill({
                status: res.status(),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        })

        // precheck — GIẢ LẬP: trạng thái "đã 窓口精算" không dựng được bằng dữ liệu
        // thật mà không ghi vào acc_dat/person_exp.
        await page.route(ACC_PRECHECK_URL, async (route: Route) => {
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: precheckStub }),
            })
        })

        await page.route(ACC_CLEAR_UNPAID_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            const body = JSON.parse(req.postData() ?? '{}') as { trtDt?: string }
            calls.clearUnpaid.push(body.trtDt ?? '')
            // TC-CHG-3 cần DELETE thật; các testcase khác chạy hằng ngày nên chặn.
            if (letClearThrough) return route.continue()
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { deletedCount: 0 } }),
            })
        })

        await page.route(INSERT_UNPAID_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            const body = JSON.parse(req.postData() ?? '{}') as { trtDt?: string }
            calls.insertUnpaid.push(body.trtDt ?? '')
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { deletedCount: 0, insertedCount: 0 } }),
            })
        })

        await page.route(ACC_CORRECT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            const body = JSON.parse(req.postData() ?? '{}') as { trtDt?: string }
            calls.correct.push(body.trtDt ?? '')
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    data: {
                        applied: true,
                        diffScore: 0,
                        diffPrice: 0,
                        depDue: 0,
                        insDueBal: 0,
                    },
                }),
            })
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
        if (!dbEnabled) return

        await deleteTreatmentRows(PAT_NO, TODAY_ISO).catch((e: unknown) =>
            console.log(`afterAll: dọn 処置 seed không xong — ${String(e)}`),
        )
        // Xoá CỨNG dòng mốc — kể cả khi test đỏ giữa chừng và nó còn sống.
        if (markerUnpaidId !== null) {
            await withDb(async (c) => {
                const r = await c.query(`DELETE FROM unpaid WHERE id = $1`, [markerUnpaidId])
                console.log(`afterAll: xoá ${r.rowCount ?? 0} dòng unpaid mốc`)
            }).catch((e: unknown) => console.log(`afterAll: dọn unpaid mốc không xong — ${String(e)}`))
        }
    })

    test('TC-CHG-1 — hộp 既存会計 và hộp 差額 phải mặc định 「いいえ」 (Button2)', async () => {
        await backToEntry()
        resetCalls()
        precheckStub = PRECHECK_INCREASE

        const ok = await pressF8OnToday()
        skipWithReason(
            !ok,
            `lưới không có dòng nào của hôm nay (${TODAY_ISO}) — bật TEST_DB=1 để spec tự seed`,
        )
        if (!ok) return

        // ── Hộp 1 (modAcc.cs:560-562, MessageBoxDefaultButton.Button2) ─────────
        expect(
            await appeared(existingAccGate(), 30_000),
            'precheck báo 既存会計あり mà hộp 「既に、…作成してよろしいですか？」 không mở',
        ).toBe(true)
        await expect(
            noBtn(existingAccGate()),
            'hộp 既存会計 đang mặc định 「はい」 — Enter theo phản xạ sẽ chồng thêm một ' +
                '未精算 ĐỦ TIỀN lên ngày đã thu (WinForm để Button2)',
        ).toBeFocused({ timeout: 10_000 })
        await noBtn(existingAccGate()).click()

        // ── Hộp 2 (modAcc.cs:579-581, cũng Button2) ────────────────────────────
        expect(
            await appeared(diffGate(), 30_000),
            'cur ≥ past mà hộp 「請求金額が増えています…差額分…」 không mở',
        ).toBe(true)
        await expect(
            noBtn(diffGate()),
            'hộp 差額 đang mặc định 「はい」 — WinForm để Button2 vì いいえ mới là đường ' +
                'dẫn sang 会計データ修正',
        ).toBeFocused({ timeout: 10_000 })
        await noBtn(diffGate()).click()

        // ── Hộp 3 — ngược lại, mặc định 「はい」 (modAcc.cs:955, Button1) ────────
        expect(
            await appeared(chgAccGate(), 30_000),
            'từ chối 差額 với tre_acc_link=1 mà không mở hộp 会計データ修正 — đây chính là ' +
                'nhánh trước kia bị bỏ qua rồi vẫn báo thành công',
        ).toBe(true)
        await expect(
            yesBtn(chgAccGate()),
            'hộp 会計データ修正 phải mặc định 「はい」 (Button1) — đừng đổi mặc định của cả ' +
                'ba hộp về một phía',
        ).toBeFocused({ timeout: 10_000 })

        // Trả lời いいえ: WinForm không ghi gì (modAcc.cs:955 nhánh No).
        await noBtn(chgAccGate()).click()
        await expect(chgAccGate()).toBeHidden({ timeout: 10_000 })
        expect(calls.correct, 'trả lời いいえ mà vẫn gọi 会計データ修正').toHaveLength(0)
        await step()
    })

    test('TC-CHG-2 — từ chối 差額 + tre_acc_link=1 ⇒ gọi 会計データ修正, KHÔNG tạo 未精算', async () => {
        await backToEntry()
        resetCalls()
        precheckStub = PRECHECK_INCREASE

        const ok = await pressF8OnToday()
        skipWithReason(!ok, `lưới không có dòng nào của hôm nay (${TODAY_ISO})`)
        if (!ok) return

        expect(await appeared(existingAccGate(), 30_000), 'hộp 既存会計 không mở').toBe(true)
        await noBtn(existingAccGate()).click()

        expect(await appeared(diffGate(), 30_000), 'hộp 差額 không mở').toBe(true)
        await noBtn(diffGate()).click()

        expect(await appeared(chgAccGate(), 30_000), 'hộp 会計データ修正 không mở').toBe(true)
        await yesBtn(chgAccGate()).click()

        // modAcc.cs:770 — nhánh này SỬA sổ đã chốt, KHÔNG chèn 未精算 mới.
        await expect
            .poll(() => calls.correct.length, {
                message:
                    'trả lời はい mà không gọi /accounting/correct — nhánh ChgAccData đang bị bỏ qua',
                timeout: 30_000,
            })
            .toBeGreaterThan(0)
        expect(calls.correct[0], '会計データ修正 gửi sai 会計対象日').toBe(TODAY_ISO)
        expect(
            calls.insertUnpaid,
            'nhánh 会計データ修正 mà vẫn tạo 未精算データ — WinForm chỉ sửa acc_dat/person_exp',
        ).toHaveLength(0)

        // clear-unpaid vẫn phải chạy: modAcc.cs:428 nằm trước mọi nhánh.
        expect(
            calls.clearUnpaid,
            'nhánh không insert mà bỏ luôn bước xoá 未精算 — đúng lỗi ISSUE-13-a',
        ).not.toHaveLength(0)
        expect(calls.clearUnpaid[0], 'clear-unpaid gửi sai 会計対象日').toBe(TODAY_ISO)

        // IDM_Acc_Click vẫn sang 窓口精算 sau khi LetAccData2 trả true.
        await expect(page, 'F8 会計 phải sang 窓口精算 sau khi 会計データ修正 xong').toHaveURL(
            /\/counter-payments\//,
            { timeout: 30_000 },
        )
        await step()
    })

    test('TC-CHG-3 — nhánh 金額同一 (không insert) VẪN xoá 未精算 của ngày', async () => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1: phải seed dòng unpaid mốc rồi soi lại Postgres')
        skipWithReason(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: testcase này cho clear-unpaid xoá thật')
        if (!dbEnabled || !ALLOW_SAVE) return

        // Dòng mốc = "未精算 còn sót của lượt F8 trước". WinForm xoá nó ở
        // modAcc.cs:428 dù nhánh phía dưới có insert hay không.
        markerUnpaidId = await seedMarkerUnpaid(TODAY_ISO)
        expect(await markerUnpaidAlive(markerUnpaidId), 'seed dòng unpaid mốc không thành').toBe(
            true,
        )

        await backToEntry()
        resetCalls()
        // cur == past ⇒ FE return true ngay sau hộp 1, KHÔNG gọi insert-unpaid.
        precheckStub = PRECHECK_IDENTICAL
        letClearThrough = true

        try {
            const ok = await pressF8OnToday()
            skipWithReason(!ok, `lưới không có dòng nào của hôm nay (${TODAY_ISO})`)
            if (!ok) return

            expect(await appeared(existingAccGate(), 30_000), 'hộp 既存会計 không mở').toBe(true)
            await noBtn(existingAccGate()).click()

            await expect
                .poll(() => calls.clearUnpaid.length, {
                    message: 'F8 không gọi clear-unpaid — bước xoá 未精算 đang thiếu',
                    timeout: 30_000,
                })
                .toBeGreaterThan(0)

            // Chốt: nhánh này KHÔNG insert, nên nếu dòng mốc biến mất thì đúng là
            // clear-unpaid xoá — không phải DELETE bên trong insert-unpaid.
            expect(
                calls.insertUnpaid,
                'nhánh 金額同一 mà vẫn gọi insert-unpaid — modAcc.cs:571 return TRƯỚC bước tạo',
            ).toHaveLength(0)

            await expect
                .poll(() => markerUnpaidAlive(markerUnpaidId!), {
                    message:
                        'dòng 未精算 của ngày vẫn còn sau F8 — nhánh không insert đang bỏ qua ' +
                        'deleteTrtDtUnPaid, 窓口精算 sẽ thu chồng lên số đã sửa (ISSUE-13-a)',
                    timeout: 30_000,
                })
                .toBe(false)
        } finally {
            letClearThrough = false
        }
        await step()
    })
})
