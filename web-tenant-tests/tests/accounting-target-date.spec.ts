import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — 会計対象日 phải lấy theo DÒNG ĐANG CÓ CON TRỎ, màn `/treatments/{patNo}`.
 *
 * Bug tester báo (2026-08-26): đứng ở màn 診療入力 mở bằng `?trtDt=<hôm nay>`, rê
 * con trỏ về dòng ngày 25 rồi bấm F8 会計 — web vẫn thanh toán dữ liệu ngày 26.
 * Nguyên nhân: chuỗi F8 dùng thẳng ngày trên URL thay vì ngày của dòng con trỏ.
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - frm203002.IDM_Acc_Click (:7695) chỉ truyền xuống CHỈ SỐ DÒNG:
 *        int intRo = hFG1.CurrentCellAddress.Y;          // :7719
 *        bool AccRet = modAcc.LetAccData2(con, intRo);   // :7720
 *  - modAcc.LetAccData2 (:346) tự dựng ngày từ 処置年月 của màn hình + ô 日 của
 *    ĐÚNG dòng đó:
 *        strDate = pstrADYear + "/" + pstrMonth + "/" + hFG1[0, intRow].Value;  // :377
 *        if (TryParse == false) { MsgBox("会計処理を行う日の行にカーソルを
 *                                 合わせてください。"); return false; }          // :379-383
 *        if (dtTgtDate != DateTime.Today) {
 *            ret = MsgBox("会計処理を行う日が本日でありません。よろしいですか。", OkCancel);
 *            if (ret != Ok) { return TRUE; }                                     // :386-391
 *        }
 *    Mọi bước sau (xoá/tạo 未精算データ, 日計, 一部負担金, 入金指定) đều chạy trên
 *    `dtTgtDate` này.
 *  - frm203002.IDM_AccDataOnly_Click (:7750) 「3 会計データ作成」 cũng gọi CHÍNH
 *    LetAccData2 ⇒ nó cũng đi qua hộp 日付チェック, không được bỏ qua.
 *
 * ─── Web port (apps/web-tenant/src/features/treatments) ──────────────────────
 *  - `lib/accounting-target-date.ts`
 *      · `resolveAccountingTargetDate(rows, rowKey, trtMonth)` = năm/tháng của màn
 *        hình + ô 日 của dòng con trỏ; `null` khi dòng không có ngày (nhánh
 *        TryParse hỏng bên WinForm).
 *      · `isAccountingDateToday(target, today)` — so theo NGÀY LỊCH.
 *  - `components/treatment-entry-detail.tsx`
 *      · `runLetAccData2()` KHÔNG nhận ngày từ ngoài nữa: nó tự giải ngày ở đầu
 *        hàm rồi mới chạy precheck → 未精算データ作成, đúng chỗ WinForm giải.
 *      · Hộp 日付チェック nằm TRONG `runLetAccData2` ⇒ cả F8 và F11「3 会計データ作成」
 *        đều đi qua. Bấm Cancel thì hàm trả TRUE (parity modAcc.cs:389) nên F8
 *        VẪN sang 窓口精算, chỉ bỏ bước tạo 未精算データ.
 *      · Dialog 入金指定 nhận `accTargetDt` chứ không còn nhận ngày trên URL.
 *
 * ─── Cách spec chứng minh ────────────────────────────────────────────────────
 *  Không đọc DB. Bằng chứng nằm ở REQUEST mà FE bắn ra:
 *      GET  /tenant/treatment/accounting/precheck?patNo=…&trtDt=YYYY-MM-DD
 *      POST /tenant/treatment/accounting/insert-unpaid  { trtDt: 'YYYY-MM-DD', … }
 *  Cả hai phải mang ngày của DÒNG CON TRỎ. Trước khi sửa, chúng luôn mang ngày
 *  trên URL — đó chính là triệu chứng tester thấy.
 *
 * ─── Ghi DB ──────────────────────────────────────────────────────────────────
 *  KHÔNG ghi gì. `page.route` CHẶN CỨNG hai endpoint ghi của chuỗi này
 *  (`insert-unpaid`, `correct`) và trả envelope giả, nên spec chạy hằng ngày
 *  được, không cần TEST_DB (GUIDELINE Rule 18.1). `precheck` là GET nên để đi
 *  thật, chỉ ghi lại URL.
 *  TUYỆT ĐỐI không bấm Yes ở hộp 「処置データは変更されています」: Yes chạy bulk-save,
 *  xoá mềm cả tháng 処置 rồi chèn lại.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. Cột 日 CHỈ hiện số ở dòng ĐẦU của mỗi ngày (`buildDisplayMonth` xoá số ở
 *     các dòng sau) ⇒ đọc DOM phải TỰ CỘNG DỒN ngày gần nhất, đừng tưởng dòng
 *     trống là "không có ngày". Bản thân `GridRow.day` bên trong luôn có ngày
 *     thật — chính vì vậy đặt con trỏ ở dòng nối tiếp vẫn ra đúng ngày.
 *  2. Dòng THÁNG CŨ mang rowKey `${recordIndex}-${itemIndex}`, dòng tháng hiện
 *     hành mang uuid (`isHistoryRowKey`). Bấm F8 khi con trỏ ở dòng tháng cũ chỉ
 *     nhận 「当月以外の操作はできません」 (guardCurrentMonth) ⇒ spec chỉ chọn dòng
 *     tháng hiện hành.
 *  3. Ô 日 bấm MỘT lần = đặt con trỏ; bấm HAI lần = mở 日付変更. Chỉ bấm một lần.
 *     Cũng KHÔNG bấm vào ô 部位: một click ở đó mở luôn hộp 部位選択.
 *  4. `SanteiConfirmDialog` 「〜を算定しますか？」 bung ra sau mỗi lần nạp lưới và đè
 *     lên mọi click ⇒ `addLocatorHandler` bấm No (Rule 14/14.1). Handler CHỈ chạy
 *     khi Playwright đang thực hiện một ACTION, nên trước mỗi `keyboard.press`
 *     phải tự vét bằng `drainSanteiDialogs()`.
 *  5. `locator.isVisible({ timeout })` KHÔNG chờ — nó soi DOM ngay lúc gọi. Hộp
 *     nào phải đợi một vòng API mới bung thì dùng `appeared()`.
 *  6. Hộp xác nhận của app có HAI loại role: DraggableDialog → `role="dialog"`
 *     (処置データチェック / 処置データ変更 / 日付チェック), còn appDialog/confirmDialog
 *     dựng trên Radix AlertDialog → `role="alertdialog"` (既存会計, 会計データ修正).
 *     `dlg()` bắt cả hai (Rule 13.1: đừng mốc theo title).
 *  7. Màn 診療入力 của bệnh nhân test bị coi là "đã sửa" NGAY SAU KHI NẠP ⇒ chuỗi
 *     F8 gần như luôn bung hộp 「処置データは変更されています」. Luôn trả lời No.
 *  8. Thứ tự cổng của F8 KHÔNG cố định (mỗi cổng có điều kiện riêng) ⇒ dùng vòng
 *     lặp `settleDialogs()` xử lý theo cái nào hiện ra, đừng chờ cứng theo thứ tự.
 *
 * ─── KHÔNG kiểm ở đây ────────────────────────────────────────────────────────
 *  Nhánh 「会計処理を行う日の行にカーソルを合わせてください。」 (TryParse hỏng): trên web
 *  mọi dòng tháng hiện hành đều mang ngày thật và màn hình tự đặt con trỏ vào dòng
 *  cuối khi nạp, nên UI không dựng được trạng thái đó. Nhánh này đã có unit test
 *  `apps/web-tenant/src/features/treatments/lib/__tests__/accounting-target-date.test.ts`.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/accounting-target-date.spec.ts --retries=0
 *
 * Chạy CẢ FILE, KHÔNG `-g` một testcase lẻ (Rule 19): khối serial dùng chung một
 * page, và các testcase sau đều dựa vào `backToEntry()` của testcase trước.
 * `--retries=0` vì retry là chạy lại cả khối ⇒ thêm một lần login (Rule 10.1).
 *
 * Kỳ vọng: tất cả XANH. TC-DATE-3 tự skip khi màn hình không mở ở ngày hôm nay
 * hoặc lưới không có dòng nào của ngày hôm nay.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/**
 * Ngày mở màn hình = HÔM NAY.
 *
 * Đây là tiền đề của chính cái bug: URL mang ngày hôm nay, con trỏ ở ngày cũ. Nếu
 * ép `TEST_TRT_DT` sang ngày khác thì phép so "ngày trên URL ≠ ngày dòng con trỏ"
 * vẫn đo được (TC-DATE-1/2/4), riêng TC-DATE-3 (dòng hôm nay ⇒ KHÔNG hỏi ngày) sẽ
 * tự skip vì lúc đó cả hai ngày đều khác hôm nay.
 */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** `YYYY-MM-` của 処置年月 đang mở — ghép với ô 日 để ra ngày mà FE phải gửi đi. */
const TRT_MONTH_PREFIX = TRT_DT.slice(0, 8)

/** Ngày trong tháng của màn hình (chuỗi, không đệm 0 — đúng như ô 日 render). */
const SCREEN_DAY = String(Number(TRT_DT.slice(8, 10)))

/** Hôm nay theo lịch máy chạy test — mốc của `dtTgtDate != DateTime.Today`. */
const TODAY_ISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const GRID_LOAD_TIMEOUT = 60_000

// ── Endpoint của chuỗi 会計 ───────────────────────────────────────────────────
/** LetAccData2 bước ĐỌC — GET, mang `trtDt` trên query string. */
const ACC_PRECHECK_URL = /\/tenant\/treatment\/accounting\/precheck/
/** LetAccData2 bước GHI — POST, mang `trtDt` trong body. CHẶN, không cho ghi thật. */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/
/** 会計データ修正 (nhánh G) — POST ghi ACCDAT + PERSON_EXP. CHẶN. */
const ACC_CORRECT_URL = /\/tenant\/treatment\/accounting\/correct(\?|$)/

/** Chỉ số cột 日 — `RegiCol.day` = cột 0 bên WinForm (frm203002.cs:158). */
const COL_DAY = 0

/** rowKey của dòng THÁNG CŨ (`isHistoryRowKey`); dòng tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** Một dòng của lưới tháng hiện hành, kèm ngày ĐÃ CỘNG DỒN (xem BẪY 1). */
interface DayRow {
    key: string
    /** Ngày trong tháng, dạng chuỗi không đệm 0 — vd '25'. */
    day: string
}

/** `true` nếu locator HIỆN RA trong `timeout` (BẪY 5). */
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
    return (await Promise.race([...races, new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500))]))
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 会計 chạy theo ngày của dòng con trỏ (modAcc.LetAccData2)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Ngày mà FE thực sự gửi đi trong lượt bấm F8 gần nhất. Reset ở mỗi testcase. */
    const calls = {
        precheck: [] as string[],
        insertUnpaid: [] as string[],
        correct: [] as string[],
    }

    function resetCalls() {
        calls.precheck.length = 0
        calls.insertUnpaid.length = 0
        calls.correct.length = 0
    }

    /** Hộp thoại theo NỘI DUNG, bắt cả `role="dialog"` lẫn `role="alertdialog"` (BẪY 6). */
    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    // Sáu cổng có thể chen ngang chuỗi F8, theo đúng thứ tự chúng xuất hiện trong
    // IDM_Acc_Click + LetAccData2.
    /** 会計前チェック — frm203002.cs:7705. */
    const checkGate = () => dlg('このまま続けますか?')
    /** ModSave.ExitWithoutSaving — frm203002.cs:7717. */
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    /** 日付チェック — modAcc.cs:387. ĐÂY là cổng spec này đo. */
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    /** 既存会計あり — modAcc.cs:560 / 579 / 722. */
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    /** 会計データ修正 — modAcc.cs:931. */
    const chgAccGate = () => dlg(/に計上しますか？/)
    /** 入金指定 (frm203027) — chỉ bung khi accConfig.receRcvFlg = 1. */
    const nyukinDialog = () => dlg('入 金 指 定')

    /** Nút trong một hộp thoại cụ thể — tránh trùng tên nút với màn nền (Rule 10.3). */
    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    /** Về lại màn 診療入力 và chờ lưới dựng xong. */
    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
    }

    /**
     * Bấm No cho MỌI hộp 「〜を算定しますか？」 đang mở.
     *
     * `addLocatorHandler` chỉ chạy khi Playwright đang thực hiện một ACTION, nó
     * không đỡ được một `keyboard.press` thô (BẪY 4). AutoSantei bung liên tiếp
     * nhiều hộp nên phải vét bằng vòng lặp có giới hạn.
     */
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

    /**
     * Đọc cột 日 của toàn lưới rồi CỘNG DỒN ngày (BẪY 1) và bỏ dòng tháng cũ (BẪY 2).
     *
     * Dòng 日計 (`<rowKey>:footer-day`) cũng bị loại: nó là dòng tổng, không phải
     * chỗ WinForm đặt con trỏ khi chọn ngày.
     */
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

    /** Đặt con trỏ vào ô 日 của một dòng — MỘT click (BẪY 3). */
    async function focusDayCell(key: string) {
        await drainSanteiDialogs()
        await page.locator(`[data-grid-cell="${key}|${COL_DAY}"]`).click()
        await step()
    }

    /** Bấm một phím F trên thanh F-key của màn nền (`data-fkey` do FKeyBar gắn). */
    async function pressFKey(fkey: string) {
        await drainSanteiDialogs()
        await page.keyboard.press(fkey)
    }

    /**
     * Trả lời các cổng của chuỗi 会計 cho tới khi hết hoặc chạm `rounds`.
     *
     * Thứ tự cổng KHÔNG cố định (BẪY 8) nên vòng lặp xử lý theo cái nào đang hiện:
     *   · 会計前チェック   → OK  (đi tiếp; bấm Cancel là chuỗi dừng, đo nhầm thứ)
     *   · 処置データ変更   → No  (bỏ sửa dở; Yes sẽ GHI cả tháng — cấm)
     *   · 日付チェック    → theo `dateChoice`, và ghi nhận là ĐÃ THẤY
     *   · 既存会計/計上    → No  (không tạo thêm dữ liệu)
     *   · 入金指定        → F10 戻る (outcome Back, chuỗi đi tiếp như thường)
     *
     * Trả về `true` nếu hộp 日付チェック từng hiện ra.
     */
    async function settleAccountingDialogs(
        dateChoice: 'OK' | 'Cancel',
        rounds = 8,
    ): Promise<boolean> {
        let dateGateSeen = false
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
                dateGateSeen = true
                await btn(dateGate(), dateChoice).first().click()
                await expect(dateGate()).toBeHidden({ timeout: 10_000 })
                // Cancel = LetAccData2 trả TRUE ngay, không còn cổng nào phía sau.
                if (dateChoice === 'Cancel') break
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
        return dateGateSeen
    }

    /** Dòng đầu tiên của một ngày KHÁC ngày đang mở trên URL — mục tiêu của spec. */
    async function pickRowOfOtherDay(): Promise<DayRow | null> {
        const rows = await currentMonthDayRows()
        return rows.find((r) => r.day !== SCREEN_DAY) ?? null
    }

    /** Dòng đầu tiên của ĐÚNG ngày đang mở trên URL. */
    async function pickRowOfScreenDay(): Promise<DayRow | null> {
        const rows = await currentMonthDayRows()
        return rows.find((r) => r.day === SCREEN_DAY) ?? null
    }

    /** `YYYY-MM-DD` mà FE phải gửi cho một dòng có ô 日 = `day`. */
    const isoOf = (day: string) => `${TRT_MONTH_PREFIX}${day.padStart(2, '0')}`

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // AutoSantei bung 「〜を算定しますか？」 sau MỖI lần vào lại màn 診療入力.
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

        // GET — để đi thật, chỉ ghi lại `trtDt` trên query string.
        await page.route(ACC_PRECHECK_URL, async (route: Route) => {
            calls.precheck.push(new URL(route.request().url()).searchParams.get('trtDt') ?? '')
            await route.continue()
        })

        // POST GHI — chặn cứng, trả envelope giả để FE đi hết chuỗi như thường.
        await page.route(INSERT_UNPAID_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            const body = JSON.parse(req.postData() ?? '{}') as { trtDt?: string }
            calls.insertUnpaid.push(body.trtDt ?? '')
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { inserted: 0 } }),
            })
        })

        // POST GHI — 会計データ修正. Không testcase nào cần nó chạy thật.
        await page.route(ACC_CORRECT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            const body = JSON.parse(req.postData() ?? '{}') as { trtDt?: string }
            calls.correct.push(body.trtDt ?? '')
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { applied: false } }),
            })
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await backToEntry()
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('TC-DATE-1 — F8 với con trỏ ở NGÀY CŨ: mọi request 会計 mang ngày của dòng đó', async () => {
        await backToEntry()
        resetCalls()

        const target = await pickRowOfOtherDay()
        skipWithReason(
            target === null,
            `lưới tháng ${TRT_MONTH_PREFIX.slice(0, 7)} của bệnh nhân ${PAT_NO} chỉ có dòng của ngày ` +
                `${SCREEN_DAY} — không dựng được tình huống "con trỏ ở ngày khác ngày trên URL"`,
        )
        if (target === null) return

        const wantIso = isoOf(target.day)
        console.log(`URL mở ở ${TRT_DT}, đặt con trỏ vào dòng ngày ${target.day} ⇒ chờ ${wantIso}`)

        await focusDayCell(target.key)
        await pressFKey('F8')

        // Hộp 日付チェック chỉ bung khi 会計対象日 ≠ hôm nay. Bấm OK để chuỗi chạy tiếp
        // tới precheck / insert-unpaid — chỗ đọc được ngày FE thực sự gửi.
        await settleAccountingDialogs('OK')

        // precheck luôn chạy trong mọi nhánh của LetAccData2 ⇒ dùng nó làm mốc.
        await expect
            .poll(() => calls.precheck.length, {
                message: 'chuỗi F8 không gọi precheck — LetAccData2 chưa chạy thì không đo được gì',
                timeout: 60_000,
            })
            .toBeGreaterThan(0)

        expect(
            calls.precheck,
            `precheck phải hỏi ngày của DÒNG CON TRỎ (${wantIso}), không phải ngày trên URL (${TRT_DT})`,
        ).not.toContain(TRT_DT)
        expect(calls.precheck[0], 'precheck gửi sai 会計対象日').toBe(wantIso)

        // insert-unpaid chỉ chạy ở nhánh thực sự tạo dữ liệu; nếu có thì cũng phải
        // cùng một ngày. Không ép nó phải chạy: nhánh 既存会計/修正 kết thúc sớm là
        // hợp lệ theo modAcc.cs:571/712.
        for (const iso of calls.insertUnpaid) {
            expect(iso, 'insert-unpaid ghi 未精算データ vào ngày khác với dòng con trỏ').toBe(wantIso)
        }
        console.log(
            `precheck=${JSON.stringify(calls.precheck)} insert-unpaid=${JSON.stringify(calls.insertUnpaid)}`,
        )
        await step()
    })

    test('TC-DATE-2 — Cancel ở hộp 日付チェック: KHÔNG tạo 未精算データ nhưng VẪN sang 窓口精算', async () => {
        await backToEntry()
        resetCalls()

        const target = await pickRowOfOtherDay()
        skipWithReason(target === null, 'không có dòng nào khác ngày trên URL (xem TC-DATE-1)')
        if (target === null) return

        await focusDayCell(target.key)
        await pressFKey('F8')

        const dateGateSeen = await settleAccountingDialogs('Cancel')
        expect(
            dateGateSeen,
            'con trỏ ở ngày cũ mà không hỏi 「会計処理を行う日が本日でありません。」 — 会計対象日 đang bị ' +
                'lấy theo ngày trên URL',
        ).toBe(true)

        // modAcc.cs:389 — Cancel đặt functionReturnValue = TRUE, nên IDM_Acc_Click
        // vẫn chạy showForm(ID204002). Đây là parity, KHÔNG phải bug mới.
        await expect(
            page,
            'Cancel ở hộp 日付チェック phải vẫn sang 窓口精算 (modAcc.cs:389 trả TRUE)',
        ).toHaveURL(/\/counter-payments\//, { timeout: 30_000 })

        expect(
            calls.insertUnpaid,
            'Cancel mà vẫn gọi insert-unpaid — LetAccData2 phải return TRƯỚC bước tạo dữ liệu',
        ).toHaveLength(0)
        expect(calls.precheck, 'Cancel mà vẫn chạy precheck — return nằm sau cổng ngày').toHaveLength(0)
        await step()
    })

    test('TC-DATE-3 — F8 với con trỏ ở ngày HÔM NAY: không hỏi ngày, request mang đúng hôm nay', async () => {
        skipWithReason(
            TRT_DT !== TODAY_ISO,
            `màn hình đang mở ở ${TRT_DT} chứ không phải hôm nay (${TODAY_ISO}) — lúc đó dòng nào cũng ` +
                `khác hôm nay nên không đo được nhánh "không hỏi"`,
        )
        if (TRT_DT !== TODAY_ISO) return

        await backToEntry()
        resetCalls()

        const target = await pickRowOfScreenDay()
        skipWithReason(
            target === null,
            `lưới chưa có dòng nào của ngày ${SCREEN_DAY} — bệnh nhân ${PAT_NO} chưa có 処置 hôm nay`,
        )
        if (target === null) return

        await focusDayCell(target.key)
        await pressFKey('F8')

        const dateGateSeen = await settleAccountingDialogs('OK')
        expect(
            dateGateSeen,
            'con trỏ ở dòng HÔM NAY mà vẫn hỏi 「本日でありません」 — điều kiện đang so nhầm ngày',
        ).toBe(false)

        await expect
            .poll(() => calls.precheck.length, { timeout: 60_000 })
            .toBeGreaterThan(0)
        expect(calls.precheck[0], 'precheck gửi sai ngày cho dòng hôm nay').toBe(TODAY_ISO)
        await step()
    })

    test('TC-DATE-4 — F11「3 会計データ作成」 cũng qua hộp 日付チェック và Ở LẠI màn 診療入力', async () => {
        await backToEntry()
        resetCalls()

        const target = await pickRowOfOtherDay()
        skipWithReason(target === null, 'không có dòng nào khác ngày trên URL (xem TC-DATE-1)')
        if (target === null) return

        const wantIso = isoOf(target.day)
        await focusDayCell(target.key)

        // Menu 選択 mở bằng F11, mục 「3 会計データ作成」 = IDM_AccDataOnly_Click.
        const rowMenu = page.getByRole('menu').filter({ hasText: '1 メニュー' })
        for (let attempt = 1; attempt <= 3; attempt++) {
            await pressFKey('F11')
            if (await rowMenu.isVisible({ timeout: 10_000 }).catch(() => false)) break
        }
        await expect(rowMenu, 'bấm F11 3 lần mà menu 選択 vẫn không mở').toBeVisible({
            timeout: 10_000,
        })
        await rowMenu.getByRole('button', { name: '3 会計データ作成' }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })

        // 日付チェック nằm TRONG LetAccData2 (modAcc.cs:386) nên lối vào này cũng phải
        // đi qua — trước khi sửa, web bỏ hẳn cổng này ở nhánh 会計データ作成.
        const dateGateSeen = await settleAccountingDialogs('OK')
        expect(
            dateGateSeen,
            '「3 会計データ作成」 bỏ qua hộp 日付チェック — nó gọi CHÍNH LetAccData2 nên phải hỏi',
        ).toBe(true)

        await expect
            .poll(() => calls.precheck.length, { timeout: 60_000 })
            .toBeGreaterThan(0)
        expect(calls.precheck[0], '「3 会計データ作成」 gửi sai 会計対象日').toBe(wantIso)

        // IDM_AccDataOnly_Click KHÔNG có showForm(ID204002).
        await expect(
            page,
            '「3 会計データ作成」 nhảy sang 窓口精算 — đó là việc của 「2 会計」 (IDM_Acc_Click)',
        ).not.toHaveURL(/\/counter-payments/)
        await step()
    })
})
