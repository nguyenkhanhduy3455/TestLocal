/**
 * 診療入力 会計 — TIỀN PHẢI TÍNH TỪ LƯỚI ĐANG HIỆN, KHÔNG PHẢI TỪ `trn_trn` ĐÃ LƯU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WinForm nói gì
 * ═══════════════════════════════════════════════════════════════════════════
 *  `modAcc.LetAccData2` mở đầu MỖI lượt 会計 bằng hai dòng này (modAcc.cs:396-402):
 *
 *      hfgRaiinCnt();                                   // đánh số 来院回数 lên lưới
 *      ModSave.GetViewToTrtDataList(ref trtDataListNow, …);   // CHỤP LƯỚI
 *      Calc_BuiPriceData2s(con, trtDataListNow);              // tính tiền TỪ ẢNH CHỤP
 *
 *  ⇒ 点数 / 一部負担金 / 自費 / 介護 / 14 診療識別 / 初診フラグ đều ra từ GIÁ TRỊ ĐANG
 *  HIỆN TRÊN MÀN HÌNH. Đó chính là lý do hai đường dưới đây chạy được khi chưa lưu:
 *
 *   · 「3 会計データ作成」 (`IDM_AccDataOnly_Click`, frm203002.cs:7754) KHÔNG có
 *     cổng lưu — nó gọi thẳng LetAccData2;
 *   · 「2 会計」 (`IDM_Acc_Click`) hỏi 「保存しますか？」 nhưng nhánh 「いいえ」 của
 *     `ModSave.ExitWithoutSaving` (modSave.cs:213-220) KHÔNG khôi phục gì cả —
 *     lưới giữ nguyên sửa dở và LetAccData2 vẫn tính trên đó.
 *
 *  `Get_AccUnit` (modAcc.cs:813-853) còn rõ hơn: nó quét `grdRegi` chứ không hề
 *  chạm DB, chỉ tra `mst_trt` để biết 会計ユニット.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Bug mà spec này canh
 * ═══════════════════════════════════════════════════════════════════════════
 *  Bản port cũ để BE đọc lại `trn_trn`. Hệ quả trên chính hai đường trên: sửa dở
 *  không vào tiền. Lộ nhất ở ngày 2 lượt khám mà lượt 2 CHƯA lưu — không có dòng
 *  `raiin_cnt = 2` nào trong DB nên 点数 lẫn 一部負担金 đều 0, `insLineNonEmpty`
 *  false, và vòng 会計 kết thúc IM LẶNG: không tạo dòng 未精算 nào, không báo lỗi.
 *
 *  Bản sửa cho FE chụp lưới MỘT lần trong `runLetAccData2` rồi gửi kèm `rows`
 *  xuống cả bốn endpoint của vòng đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT ghim vào source (Rule 21) — đổi source thì soát lại đúng mấy dòng này
 * ═══════════════════════════════════════════════════════════════════════════
 *  - `treatment-entry-detail.tsx` → `runLetAccData2`
 *      · `const round = { trtDt: isoTrtDt, raiinCnt, rows: buildSavePayload() }`
 *        — chụp MỘT lần, ngay sau khi chốt 会計対象日 + 当日来院回数;
 *      · cả `precheck`, `insert-unpaid`, `correct` và dialog 入金指定 đều nhận
 *        `...round` ⇒ BỐN chỗ dùng CHUNG một ảnh chụp.
 *  - `daily-accounting-summary-api.ts` — `precheck` và `daily-summary` là **POST**
 *    (một tháng 処置 không nhét vừa query string).
 *  - Payload dòng = `buildSavePayload()`, y hệt cái F9 登録 gửi
 *    (`SaveTreatmentRowPayload`: day / trtCd / trtSb / trtPt / trtCnt / jihiFlg …).
 *  - BE: `GridMonthTrtRows.Build` dựng lại `trn_trn` trong bộ nhớ,
 *    `BuiPriceCalcInput.EditedRows` + `AccUnitCalculator(editedRows)` thay chỗ đọc DB.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ranh giới với các spec anh em — đừng viết chồng
 * ═══════════════════════════════════════════════════════════════════════════
 *  · `unpaid-insert.spec.ts`      — các CỘT của dòng `unpaid` sau khi ghi thật
 *                                   (sflg / att_dr / trt_cnt), có đọc DB.
 *  · `accounting-target-date.spec.ts` — 会計対象日 lấy theo dòng con trỏ.
 *  · `chg-acc-data-parity.spec.ts`    — các hộp thoại nhánh 既存会計 / 修正.
 *  Spec NÀY chỉ đo MỘT điều: cái mà FE gửi đi có phải LƯỚI ĐANG HIỆN hay không.
 *  Phần BE dùng `rows` để ra tiền đã có unit test chốt
 *  (`BuiPriceServiceEditedRowsTests`, `GridMonthTrtRowsTests`, `AccUnitCalculatorTests`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG GHI DB
 * ═══════════════════════════════════════════════════════════════════════════
 *  Ba endpoint ghi (`clear-unpaid`, `insert-unpaid`, `correct`) bị CHẶN CỨNG bằng
 *  `page.route` và trả envelope giả. Hai endpoint đọc (`precheck`, `daily-summary`)
 *  cho đi thật, chỉ đọc trộm body. Vì vậy spec chạy được hằng ngày, KHÔNG cần
 *  `TEST_ALLOW_SAVE`. Tuyệt đối KHÔNG bấm 「はい」 ở hộp 「処置データは変更されて
 *  います」 — はい ghi lại cả tháng 処置.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. Thứ tự các cổng của chuỗi F8 KHÔNG cố định → xử theo cái nào đang hiện.
 *  2. `addLocatorHandler` chỉ chạy khi Playwright đang làm một ACTION, không đỡ
 *     được `keyboard.press` thô → phải vét hộp 算定 bằng vòng lặp.
 *  3. Ô 回 của dòng 日計 cũng mang `data-grid-cell$="|4"` → loại bằng
 *     `:not([data-footer-cell])`.
 *  4. Dòng tháng cũ có rowKey dạng `<số>-<số>` và bị `guardCurrentMonth` chặn F8.
 *  5. `daily-summary` CHỈ chạy khi 入金指定 bung (accConfig.receRcvFlg = 1) →
 *     testcase liên quan tự skip kèm log, không đỏ oan.
 *
 * Testcase NỐI TIẾP TRẠNG THÁI (`mode: 'serial'`) và dùng chung một page đăng
 * nhập theo worker (Rule 19) — chạy lẻ một test ở giữa sẽ fail.
 */

import { type Locator, type Page, type Route } from '@playwright/test'

import { patNo } from '../_shared/env'
import { openTreatmentEntry } from '../_shared/entry'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = patNo('12138')

/** Ngày mở màn hình = HÔM NAY — chuỗi 会計 khi đó không phải qua cổng 日付チェック. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

const GRID_LOAD_TIMEOUT = 60_000

// ── Endpoint của MỘT vòng 会計 ────────────────────────────────────────────────
/** modAcc.cs:428 — xoá mềm 未精算 của ngày. CHẶN. */
const ACC_CLEAR_UNPAID_URL = /\/tenant\/treatment\/accounting\/clear-unpaid(\?|$)/
/** Bước ĐỌC, POST kể từ bản 「tính tiền từ lưới」. Cho đi thật. */
const ACC_PRECHECK_URL = /\/tenant\/treatment\/accounting\/precheck(\?|$)/
/** Nguồn số của dialog 入金指定, POST. Cho đi thật. */
const ACC_DAILY_SUMMARY_URL = /\/tenant\/treatment\/accounting\/daily-summary(\?|$)/
/** Bước GHI. CHẶN. */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/
/** 会計データ修正 (nhánh G) — ghi ACCDAT + PERSON_EXP. CHẶN. */
const ACC_CORRECT_URL = /\/tenant\/treatment\/accounting\/correct(\?|$)/

/** `RegiCol` — frm203002.cs:158-169. Lưới web chỉ render 5 cột này. */
const COL_RYO = 2
const COL_KAI = 4

/** rowKey của dòng tháng CŨ có dạng `<recordIndex>-<itemIndex>`. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** Một dòng trong payload `rows` mà FE gửi — `SaveTreatmentRowPayload`. */
interface GridRowPayload {
    day: number
    trtCd: number
    trtSb: number
    trtPt: number
    trtCnt: number
    dspTrt: string
}

/** Body chung của bốn endpoint trong một vòng 会計. */
interface AccCallBody {
    trtDt?: string
    raiinCnt?: number
    rows?: GridRowPayload[]
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 会計 — tiền tính từ lưới đang hiện (modAcc.cs:396-402)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Body của từng endpoint trong vòng 会計 gần nhất. Reset ở đầu mỗi testcase. */
    const calls = {
        precheck: [] as AccCallBody[],
        dailySummary: [] as AccCallBody[],
        insertUnpaid: [] as AccCallBody[],
        clearUnpaid: [] as AccCallBody[],
        correct: [] as AccCallBody[],
    }

    function resetCalls() {
        calls.precheck.length = 0
        calls.dailySummary.length = 0
        calls.insertUnpaid.length = 0
        calls.clearUnpaid.length = 0
        calls.correct.length = 0
    }

    const bodyOf = (route: Route): AccCallBody =>
        JSON.parse(route.request().postData() ?? '{}') as AccCallBody

    /** Hộp thoại theo NỘI DUNG — bắt cả `dialog` lẫn `alertdialog` (Rule 13.1). */
    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    const checkGate = () => dlg('このまま続けますか?')
    /** ModSave.ExitWithoutSaving — cổng mà TC-GRID-5 cố tình trả lời 「いいえ」. */
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')

    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    async function appeared(loc: Locator, timeout: number): Promise<boolean> {
        return loc
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    async function appearedAny(locators: Locator[], timeout: number): Promise<boolean> {
        const races = locators.map((l) => appeared(l, timeout))
        return (
            await Promise.race([
                ...races,
                new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500)),
            ])
        )
    }

    /** Bấm No cho MỌI hộp 「〜を算定しますか？」 đang xếp hàng (BẪY 2). */
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

    /** Đóng mọi hộp 「カルテ記載選択」 còn treo — F10戻る = không chọn gì, không ghi gì. */
    async function drainKarteCmtDialogs() {
        const karte = page.locator('[role="dialog"]').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(karte.first(), 2_000))) return
            await btn(karte.first(), /F10\s*戻る/)
                .first()
                .click()
                .catch(() => {})
        }
    }

    async function backToEntry() {
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
    }

    async function pressFKey(fkey: string) {
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
        await page.keyboard.press(fkey)
    }

    /**
     * Trả lời các cổng của chuỗi 会計 cho tới khi hết.
     *
     * Hộp 「保存しますか」 luôn trả lời 「No」 ở đây. TC-GRID-5 cần chính cái hộp đó
     * nên nó tự bấm TRƯỚC rồi mới gọi hàm này. Không bao giờ chọn 「Yes」 —
     * Yes ghi lại cả tháng 処置.
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

    /** Chờ vòng 会計 chạy tới bước ĐỌC — mốc chắc chắn có ở MỌI nhánh LetAccData2. */
    async function waitPrecheck() {
        await expect
            .poll(() => calls.precheck.length, {
                message:
                    'chuỗi 会計 không gọi precheck — LetAccData2 chưa chạy thì không đo được gì',
                timeout: 60_000,
            })
            .toBeGreaterThan(0)
    }

    /** Ô 回 của một dòng 処置 tháng hiện hành (loại dòng 日計 và dòng tháng cũ). */
    async function pickEditableKaiRowKey(): Promise<string | null> {
        const keys = await page
            .locator(`[data-grid-cell$="|${COL_KAI}"]:not([data-footer-cell]):not(:has(input))`)
            .evaluateAll((els) =>
                els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')),
            )
        for (const k of keys) {
            if (k === '' || k.includes(':') || HISTORY_KEY_RE.test(k)) continue
            const name = (
                await page.locator(`[data-grid-cell="${k}|${COL_RYO}"]`).innerText()
            ).trim()
            if (name !== '') return k
        }
        return null
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        // ── GHI: chặn cứng, trả envelope giả để FE vẫn đi hết chuỗi ──────────
        await page.route(ACC_CLEAR_UNPAID_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            calls.clearUnpaid.push(bodyOf(route))
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { deletedCount: 0 } }),
            })
        })

        await page.route(INSERT_UNPAID_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            calls.insertUnpaid.push(bodyOf(route))
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                // `warnings` là field BẮT BUỘC của InsertUnpaidResponse kể từ bản
                // fail-soft E00100; rỗng = lượt này tính sạch.
                body: JSON.stringify({
                    success: true,
                    data: { deletedCount: 0, insertedCount: 0, warnings: [] },
                }),
            })
        })

        await page.route(ACC_CORRECT_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            calls.correct.push(bodyOf(route))
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    data: { applied: false, insDueBal: 0, ownDueBal: 0, ownDueExc: 0, accCnt: 0 },
                }),
            })
        })

        // ── ĐỌC: đi thật, chỉ đọc trộm body ─────────────────────────────────
        await page.route(ACC_PRECHECK_URL, async (route: Route) => {
            if (route.request().method() === 'POST') calls.precheck.push(bodyOf(route))
            await route.continue()
        })
        await page.route(ACC_DAILY_SUMMARY_URL, async (route: Route) => {
            if (route.request().method() === 'POST') calls.dailySummary.push(bodyOf(route))
            await route.continue()
        })

        await backToEntry()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ─────────────────────────────────────────────────────────────────────────

    test('TC-GRID-1 — F8 会計 gửi kèm lưới 当月 (`rows`) xuống bước ĐỌC lẫn bước GHI', async () => {
        resetCalls()
        await pressFKey('F8')
        await settleAccountingDialogs()
        await waitPrecheck()

        const pre = calls.precheck[0]!
        expect(
            Array.isArray(pre.rows),
            'precheck KHÔNG mang `rows` — BE sẽ đọc lại `trn_trn`, tức là quay về đúng ' +
                'cái bug: sửa chưa lưu không vào tiền (modAcc.cs:396-402 chụp lưới mỗi lượt).',
        ).toBe(true)
        expect(
            pre.rows!.length,
            'lưới gửi đi rỗng — bệnh nhân/ngày test không có 処置 nào thì testcase vô nghĩa',
        ).toBeGreaterThan(0)

        // Bước GHI phải mang CÙNG bộ dòng. Nhánh 既存会計 có thể return sớm trước khi
        // tới insert — khi đó bỏ qua, TC-GRID-3 mới là chỗ canh tính nhất quán.
        if (calls.insertUnpaid.length > 0) {
            expect(
                Array.isArray(calls.insertUnpaid[0]!.rows),
                'insert-unpaid KHÔNG mang `rows` — dòng 未精算 sẽ tính từ dữ liệu đã lưu',
            ).toBe(true)
        } else {
            console.log('insert-unpaid không chạy ở lượt này (nhánh 既存会計) — bỏ qua vế GHI')
        }
        await step()
    })

    test('TC-GRID-2 — sửa 回数 mà CHƯA lưu thì `rows` phải mang giá trị MỚI', async () => {
        await backToEntry()
        const rowKey = await pickEditableKaiRowKey()
        skipWithReason(
            rowKey === null,
            'lưới không có dòng 処置 nào của tháng hiện hành để sửa 回数',
        )
        if (rowKey === null) return

        const name = (
            await page.locator(`[data-grid-cell="${rowKey}|${COL_RYO}"]`).innerText()
        ).trim()

        await page.locator(`[data-grid-cell="${rowKey}|${COL_KAI}"]`).dblclick()
        const editor = page.locator(`[data-grid-cell="${rowKey}|${COL_KAI}"] input`)
        await expect(editor, 'double-click không mở được editor ô 回').toBeVisible({
            timeout: 10_000,
        })
        const oldCnt = Number((await editor.inputValue()).trim() || '0')
        const newCnt = oldCnt === 2 ? 3 : 2
        await editor.fill(String(newCnt))
        await editor.press('Enter')
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
        await step()

        resetCalls()
        await pressFKey('F8')
        await settleAccountingDialogs()
        await waitPrecheck()

        const sent = (calls.precheck[0]!.rows ?? []).filter((r) => r.dspTrt === name)
        console.log(
            `回数 sửa ${oldCnt} → ${newCnt} trên dòng 「${name}」; ` +
                `payload gửi đi: ${JSON.stringify(sent.map((r) => r.trtCnt))}`,
        )
        expect(
            sent.length,
            `payload không có dòng 「${name}」 nào — không đối chiếu được 回数`,
        ).toBeGreaterThan(0)
        expect(
            sent.some((r) => r.trtCnt === newCnt),
            `回数 vừa sửa (${newCnt}) KHÔNG có trong payload. FE đang gửi dữ liệu đã lưu ` +
                'chứ không phải lưới đang hiện — WinForm chụp lưới bằng GetViewToTrtDataList ' +
                'nên sửa dở luôn vào tiền.',
        ).toBe(true)
        await step()
    })

    test('TC-GRID-3 — một vòng 会計 dùng CHUNG một ảnh chụp lưới cho mọi endpoint', async () => {
        // `runLetAccData2` chụp `round` MỘT lần rồi spread `...round` đi khắp nơi.
        // Nếu chỗ nào tự gọi lại `buildSavePayload()` thì số hiện trên dialog 入金指定
        // và số thực ghi vào 未精算 có thể lệch nhau mà không ai báo.
        await backToEntry()
        resetCalls()
        await pressFKey('F8')
        await settleAccountingDialogs()
        await waitPrecheck()

        const pre = calls.precheck[0]!
        const others: { name: string; body: AccCallBody | undefined }[] = [
            { name: 'insert-unpaid', body: calls.insertUnpaid[0] },
            { name: 'daily-summary', body: calls.dailySummary[0] },
            { name: 'correct', body: calls.correct[0] },
        ]
        const seen = others.filter((o) => o.body !== undefined)
        skipWithReason(
            seen.length === 0,
            'lượt này chỉ có precheck chạy (nhánh 既存会計 return sớm) — không có gì để đối chiếu',
        )
        if (seen.length === 0) return

        for (const { name, body } of seen) {
            expect(body!.trtDt, `${name} gửi 会計対象日 khác precheck`).toBe(pre.trtDt)
            expect(body!.raiinCnt, `${name} gửi 来院回数 khác precheck`).toBe(pre.raiinCnt)
            expect(
                JSON.stringify(body!.rows ?? null),
                `${name} gửi bộ dòng KHÁC precheck — số hiện trên dialog và số ghi xuống ` +
                    '未精算 sẽ lệch nhau. Cả vòng phải dùng chung `round` của runLetAccData2.',
            ).toBe(JSON.stringify(pre.rows ?? null))
        }
        console.log(`đối chiếu ảnh chụp lưới với: ${seen.map((s) => s.name).join(', ')}`)
        await step()
    })

    test('TC-GRID-4 — F11「3 会計データ作成」 (không có cổng lưu) cũng gửi lưới', async () => {
        // IDM_AccDataOnly_Click (frm203002.cs:7754) cố tình KHÔNG hỏi 保存しますか —
        // WinForm chạy được vì LetAccData2 đọc lưới. Nếu web đọc DB ở đường này thì
        // đúng đường này ra 0 đồng.
        await backToEntry()
        resetCalls()

        const rowMenu = page.locator('[role="dialog"]').filter({ hasText: '3 会計データ作成' })
        for (let i = 0; i < 3 && !(await rowMenu.isVisible().catch(() => false)); i++) {
            await pressFKey('F11')
        }
        await expect(rowMenu, 'bấm F11 3 lần mà menu 選択 vẫn không mở').toBeVisible({
            timeout: 15_000,
        })
        await rowMenu.getByRole('button', { name: '3 会計データ作成' }).click()

        await settleAccountingDialogs()
        await waitPrecheck()

        expect(
            Array.isArray(calls.precheck[0]!.rows),
            '「3 会計データ作成」 không gửi `rows`. Đây là đường KHÔNG có cổng lưu, nên nếu ' +
                'BE đọc `trn_trn` thì mọi sửa dở đều bị bỏ qua và vòng 会計 kết thúc im lặng.',
        ).toBe(true)

        // WinForm ở lại 診療入力 — chỉ 「2 会計」 mới sang 窓口精算.
        expect(page.url(), '「3 会計データ作成」 nhảy sang 窓口精算').not.toContain(
            '/counter-payments',
        )
        await step()
    })

    test('TC-GRID-5 — trả lời 「いいえ」 ở hộp 保存しますか vẫn tính trên lưới đang sửa dở', async () => {
        // modSave.cs:213-220 — nhánh いいえ của ExitWithoutSaving KHÔNG khôi phục gì,
        // lưới giữ nguyên sửa dở và LetAccData2 vẫn tính trên đó. Đây là chỗ dễ port
        // sai nhất: "không lưu" bị hiểu nhầm thành "dùng dữ liệu đã lưu".
        await backToEntry()
        const rowKey = await pickEditableKaiRowKey()
        skipWithReason(rowKey === null, 'lưới không có dòng 処置 nào để tạo trạng thái sửa dở')
        if (rowKey === null) return

        const name = (
            await page.locator(`[data-grid-cell="${rowKey}|${COL_RYO}"]`).innerText()
        ).trim()
        await page.locator(`[data-grid-cell="${rowKey}|${COL_KAI}"]`).dblclick()
        const editor = page.locator(`[data-grid-cell="${rowKey}|${COL_KAI}"] input`)
        await expect(editor).toBeVisible({ timeout: 10_000 })
        const oldCnt = Number((await editor.inputValue()).trim() || '0')
        const newCnt = oldCnt === 4 ? 5 : 4
        await editor.fill(String(newCnt))
        await editor.press('Enter')
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()

        resetCalls()
        await pressFKey('F8')

        const sawDirty = await appeared(dirtyGate(), 20_000)
        skipWithReason(
            !sawDirty,
            'hộp 「処置データは変更されています」 không bung — sửa 回数 chưa làm lưới dirty, ' +
                'không dựng được trạng thái mà testcase cần',
        )
        if (!sawDirty) {
            await settleAccountingDialogs()
            return
        }

        // 「いいえ」 = bỏ qua việc lưu, KHÔNG phải bỏ qua sửa dở.
        await btn(dirtyGate(), 'No').first().click()
        await settleAccountingDialogs()
        await waitPrecheck()

        const sent = (calls.precheck[0]!.rows ?? []).filter((r) => r.dspTrt === name)
        expect(
            sent.some((r) => r.trtCnt === newCnt),
            `sau khi trả lời 「いいえ」, payload không mang 回数 = ${newCnt} vừa sửa. ` +
                'WinForm không khôi phục gì ở nhánh này (modSave.cs:213-220) nên tiền vẫn ' +
                'phải tính trên lưới đang hiện.',
        ).toBe(true)
        await step()
    })
})
