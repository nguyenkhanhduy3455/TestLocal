/**
 * 入金指定 — 未収金 không được lấy từ cache cũ sau khi CHÍNH app vừa ghi person_exp.
 *
 * ─── Vì sao có spec này ──────────────────────────────────────────────────────
 * `dailyAccountingSummaryQueryOptions` đặt `staleTime: 30_000`, và queryKey của nó
 * là `(patNo, trtDt, raiinCnt, rows)`. Sửa lưới thì `rows` đổi ⇒ key đổi ⇒ chắc chắn
 * gọi lại. Nhưng 未収金 KHÔNG đến từ lưới — nó là tổng `person_exp`:
 *
 *     GetDailyAccountingSummaryHandler.GetOutstandingBalanceAsync
 *         = ins_due_bal + own_due_bal + own_due_exc + gds_due_bal + gds_due_exc
 *
 * mà 未精算データ作成 / 未精算削除 / 窓口精算 đều ghi vào đó. Không ai hạ cache thì mở
 * lại 入金指定 trong 30s vẫn thấy 未収金 TRƯỚC khi ghi, và `入金指定額` seed từ 合計
 * (đã cộng 未収金 đó) rồi F9 đẩy thẳng xuống `unpaid.rece_amt`:
 *
 *     payment-designation-dialog.tsx   setPaymentAmount(insPrice + jihi + tax + care + outstanding)
 *     InsertUnpaidHandler              var receAmt = cmd.PaymentAmount
 *
 * Bản vá: `invalidateAccountingCaches(qc, patNo)` được gọi từ `useInsertUnpaid`,
 * `useClearDayUnpaid`, `useDeleteUnpaidRecords` và `useSettlementRegisterInvalidation`.
 *
 * ─── Cách đo ─────────────────────────────────────────────────────────────────
 * Ghi thẳng vào DB thì KHÔNG đo được gì: app đâu biết mà hạ cache, và cả bản đã vá
 * lẫn bản chưa vá đều hiện số cũ. Phải đi qua chính đường ghi của app.
 *
 * Chạy chuỗi F8 HAI LẦN liên tiếp trong vòng 30s mà KHÔNG đụng vào lưới (để
 * queryKey không đổi):
 *   · chưa vá  → lần 2 dialog ăn cache, KHÔNG có POST `daily-summary` nào;
 *   · đã vá    → `clear-unpaid` / `insert-unpaid` của lần 1 đã hạ cache ⇒ lần 2
 *                bắt buộc gọi lại.
 *
 * ─── DỮ LIỆU: spec TỰ DỰNG, tự dọn ───────────────────────────────────────────
 * Bệnh nhân riêng + 処置 + MỘT dòng `person_exp` với 未収金 biết trước, để TC-CACHE-2
 * có số thật mà đối chiếu (bệnh nhân mới tinh thì 未収金 = 0 và phép so 0 === 0
 * không chứng minh gì). `bur_rate` đặt tay vì `seedTestPatient` để NULL ⇒
 * 一部負担金 = 0 ⇒ không có dòng `unpaid` nào để hạ cache.
 *
 * Dọn ở `afterAll`: `unpaid` + `person_exp` rồi `deleteTestPatient`.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - queries/daily-accounting-summary-queries.ts: `staleTime: 30_000` cho
 *    `dailySummaryItem`; `precheckItem` `staleTime: 0` (nên precheck luôn gọi lại,
 *    KHÔNG dùng nó làm mốc).
 *  - queries/daily-accounting-summary-keys.ts: `invalidateAccountingCaches` lọc theo
 *    `queryKey.at(-1).patNo` → chỉ hạ cache của đúng bệnh nhân này.
 *  - `daily-summary` và `precheck` là POST (mang cả lưới trong body), không phải GET.
 *  - Dialog chỉ bung khi `accConfig.receRcvFlg === 1` → spec vá response thật.
 *  - payment-designation-dialog.tsx: hàng 未収金 là hai `<span>` (nhãn + số) trong
 *    cùng một hàng flex.
 *
 * `serial` + page dùng chung (Rule 19). TEST_ALLOW_SAVE bắt buộc: chuỗi F8 ghi
 * thật vào `unpaid` (Rule 18.1).
 */

import { type Locator, type Page, type Route } from '@playwright/test'

import { ACC_BUTTON, routeAccButton, type AccButtonRoute } from '../_shared/acc-button'
import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import {
    GRID_LOAD_ATTEMPTS,
    GRID_LOAD_TIMEOUT,
    GRID_RELOAD_TIMEOUT,
    TODAY_ISO,
    allowSave,
    trtDt,
} from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/** Bệnh nhân riêng của spec này — +6, tách khỏi spec 反映 (+5) và 枝番 (+7). */
const PAT_NO = Number(process.env.TEST_PAT_NO ?? SEED_PAT_NO_BASE + 6)
const TRT_DT = trtDt(TODAY_ISO)
const BUR_RATE = 30
/** 未収金 seed sẵn — con số lẻ để không trùng bất kỳ khoản nào engine tự tính ra. */
const SEEDED_DUE = 1234

const ACC_CONFIG_URL = /\/tenant\/master\/acc-config(\?|$)/
const DAILY_SUMMARY_URL = /\/tenant\/treatment\/accounting\/daily-summary(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

const COL_DAY = 0
const HISTORY_KEY_RE = /^\d+-\d+$/

test.describe.configure({ mode: 'serial' })

test.describe('会計キャッシュ — 未収金 không được phục vụ từ cache cũ', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    let seeded = false
    let onRequest: (req: import('@playwright/test').Request) => void

    let dailySummaryCount = 0
    let insertUnpaidCount = 0

    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })
    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    const nyukin = () => dlg('入 金 指 定')
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)

    const appeared = async (loc: Locator, ms: number) =>
        loc
            .first()
            .waitFor({ state: 'visible', timeout: ms })
            .then(() => true)
            .catch(() => false)

    async function drainSantei() {
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

    /** Mở 診療入力, thử lại vài lần — Vite dev server có lúc trả trang trắng. */
    async function openEntry() {
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            const ok = await page
                .getByText('合計:')
                .first()
                .waitFor({ state: 'visible', timeout: GRID_RELOAD_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (ok) {
                await drainSantei()
                return
            }
            console.log(`lưới chưa hiện (lần ${attempt}/${GRID_LOAD_ATTEMPTS}) — tải lại`)
        }
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSantei()
    }

    /**
     * Key của một dòng thuộc 会計対象日. PHẢI chờ ô 日 hiện rồi mới `evaluateAll` —
     * `evaluateAll` là ảnh chụp tức thời, KHÔNG auto-wait (Rule 10.8).
     */
    async function findDayRowKey(): Promise<string | null> {
        const cells = page.locator(`[data-grid-cell$="|${COL_DAY}"]`)
        await expect(cells.first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })

        const raw = await cells.evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
        const wantDay = String(Number(TRT_DT.slice(8, 10)))
        let carried = ''
        for (const r of raw) {
            if (r.key.includes(':')) continue
            if (HISTORY_KEY_RE.test(r.key)) continue
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === '') continue
            if (carried === wantDay) return r.key
        }
        return null
    }

    /**
     * Chạy trọn một lượt F8 và đóng 入金指定 bằng F10 戻る (outcome `back` vẫn đi tiếp
     * tới insert-unpaid).
     *
     * ⚠️ KHÔNG chạm vào ô nào của lưới — `rows` phải giữ nguyên giữa hai lượt, nếu
     * không queryKey đổi và lượt 2 gọi lại vì lý do KHÁC với thứ đang đo.
     */
    async function runF8Round(): Promise<boolean> {
        await openEntry()
        const targetKey = await findDayRowKey()
        if (targetKey === null) return false

        await page.locator(`[data-grid-cell="${targetKey}|${COL_DAY}"]`).click()
        await drainSantei()
        await page.keyboard.press('F8')
        await step()

        // Chờ BẤT KỲ hộp nào, không phải riêng 入金指定 (xem spec 反映 cùng thư mục).
        const anyBox = page.locator('[role="dialog"], [role="alertdialog"]')
        for (let i = 0; i < 12; i++) {
            const gates: [Locator, string | RegExp][] = [
                [checkGate(), 'OK'],
                [dirtyGate(), 'No'],
                [dateGate(), 'OK'],
                [createGate(), /^(No|いいえ)$/],
                [chgAccGate(), /^(No|いいえ)$/],
                [nyukin(), /F10\s*戻る/],
            ]
            let acted = false
            for (const [box, name] of gates) {
                if (await box.isVisible().catch(() => false)) {
                    await btn(box, name).first().click()
                    acted = true
                    break
                }
            }
            if (acted) continue
            if (!(await appeared(anyBox, 10_000))) break
            await drainSantei()
        }
        return true
    }

    /** F8 của spec này là chuỗi 「会計」 — máy test không có device_config nên
     *  accButton mặc định 0 (= 会計データ作成), phải ép 1. Xem _shared/acc-button.ts. */
    let accButtonRoute: AccButtonRoute | undefined

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        accButtonRoute = await routeAccButton(page, ACC_BUTTON.Acc)
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        if (dbEnabled && allowSave) {
            await seedTestPatient({ patNo: PAT_NO, accRate: BUR_RATE })
            await withDb(async (c) => {
                await c.query(
                    `UPDATE insurance SET bur_rate = $2, acc_rate = $2 WHERE pat_no = $1`,
                    [PAT_NO, BUR_RATE],
                )
                await c.query(`DELETE FROM person_exp WHERE pat_no = $1`, [PAT_NO])
                await c.query(
                    `INSERT INTO person_exp (pat_no, ins_due_bal) VALUES ($1, $2)`,
                    [PAT_NO, SEEDED_DUE],
                )
            })
            await seedTreatmentRows(PAT_NO, TRT_DT, [
                { trtCd: 110, trtPt: 45, dspTrt: 'E2E 歯科再診料' },
                { trtCd: 400, trtPt: 100, dspTrt: 'E2E 検査' },
            ])
            seeded = true
            console.log(`đã seed bệnh nhân ${PAT_NO}, 未収金 ${SEEDED_DUE}, ngày ${TRT_DT}`)
        }

        await page.route(ACC_CONFIG_URL, async (route: Route) => {
            const res = await route.fetch()
            const body = (await res.json()) as { data?: { receRcvFlg?: number } }
            if (body.data) body.data.receRcvFlg = 1
            await route.fulfill({
                status: res.status(),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        })

        onRequest = (req) => {
            if (req.method() !== 'POST') return
            if (DAILY_SUMMARY_URL.test(req.url())) dailySummaryCount++
            if (INSERT_UNPAID_URL.test(req.url())) insertUnpaidCount++
        }
        page.on('request', onRequest)
    })

    test.afterAll(async () => {
        // Page dùng chung cả worker → listener KHÔNG tự mất, phải gỡ tay (Rule 19.1).
        page.off('request', onRequest)
        // Để mọi POST của chuỗi F8 đáp xong rồi mới xoá — nếu không, một request
        // còn đang bay sẽ ghi lại dòng vừa xoá và để sót dữ liệu test.
        await page.waitForLoadState('networkidle').catch(() => {})
        if (seeded) {
            await withDb(async (c) => {
                await c.query(`DELETE FROM unpaid WHERE pat_no = $1`, [PAT_NO])
                await c.query(`DELETE FROM person_exp WHERE pat_no = $1`, [PAT_NO])
            }).catch(() => {})
            await deleteTestPatient(PAT_NO).catch(() => {})
        }
        await disposeOverlays?.()
        await accButtonRoute?.dispose()
        await releaseSharedPage(page)
    })

    test('TC-CACHE-1 — lượt F8 thứ hai (cùng lưới, trong 30s) vẫn phải gọi lại daily-summary', async () => {
        skipWithReason(!dbEnabled || !allowSave, 'cần TEST_DB_* + TEST_ALLOW_SAVE')
        if (!dbEnabled || !allowSave) return

        dailySummaryCount = 0
        insertUnpaidCount = 0

        const ok1 = await runF8Round()
        expect(ok1, `lưới không có dòng nào của ngày ${TRT_DT}`).toBe(true)

        await expect.poll(() => dailySummaryCount, { timeout: 20_000 }).toBeGreaterThan(0)
        await expect
            .poll(() => insertUnpaidCount, { timeout: 20_000 })
            .toBeGreaterThan(0)
        const afterFirst = dailySummaryCount
        console.log(`lượt 1: daily-summary ${afterFirst} lần, insert-unpaid ${insertUnpaidCount} lần`)

        // Lượt 2 NGAY LẬP TỨC — nằm gọn trong staleTime 30s, lưới không đổi.
        const ok2 = await runF8Round()
        expect(ok2).toBe(true)

        await expect
            .poll(() => dailySummaryCount, { timeout: 20_000 })
            .toBeGreaterThan(afterFirst)
        console.log(`lượt 2: daily-summary tổng ${dailySummaryCount} lần`)
    })

    test('TC-CACHE-2 — 未収金 trên dialog đúng bằng tổng person_exp', async () => {
        skipWithReason(!dbEnabled || !allowSave, 'cần TEST_DB_* + TEST_ALLOW_SAVE')
        if (!dbEnabled || !allowSave) return

        const expected = await withDb(async (c) => {
            const r = await c.query<Record<string, unknown>>(
                `SELECT COALESCE(ins_due_bal,0) + COALESCE(own_due_bal,0) + COALESCE(own_due_exc,0)
                      + COALESCE(gds_due_bal,0) + COALESCE(gds_due_exc,0) AS total
                   FROM person_exp WHERE pat_no = $1`,
                [PAT_NO],
            )
            return r.rows.length === 0 ? 0 : Number(r.rows[0]!['total'] ?? 0)
        })
        expect(expected, 'person_exp seed hỏng — phép so sẽ vô nghĩa').toBe(SEEDED_DUE)

        await openEntry()
        const targetKey = await findDayRowKey()
        expect(targetKey, 'không tìm được dòng của 会計対象日').not.toBeNull()
        if (targetKey === null) return

        await page.locator(`[data-grid-cell="${targetKey}|${COL_DAY}"]`).click()
        await drainSantei()
        await page.keyboard.press('F8')

        const anyBox = page.locator('[role="dialog"], [role="alertdialog"]')
        for (let i = 0; i < 12; i++) {
            if (await nyukin().isVisible().catch(() => false)) break
            const gates: [Locator, string | RegExp][] = [
                [checkGate(), 'OK'],
                [dirtyGate(), 'No'],
                [dateGate(), 'OK'],
                [createGate(), /^(No|いいえ)$/],
                [chgAccGate(), /^(No|いいえ)$/],
            ]
            let acted = false
            for (const [box, name] of gates) {
                if (await box.isVisible().catch(() => false)) {
                    await btn(box, name).first().click()
                    acted = true
                    break
                }
            }
            if (acted) continue
            if (!(await appeared(anyBox, 10_000))) break
            await drainSantei()
        }
        expect(await nyukin().isVisible().catch(() => false), '入金指定 không bung').toBe(true)
        await step()

        // Hàng 未収金: nhãn và số là hai <span> cạnh nhau trong cùng một hàng flex.
        const shown = await nyukin().getByText('未収金', { exact: true }).locator('..').innerText()
        const num = Number((shown.match(/([\d,]+)\s*$/)?.[1] ?? '').replace(/,/g, ''))
        console.log(`未収金 hiện: ${num} — person_exp: ${expected}`)
        expect(
            num,
            '未収金 trên dialog khác person_exp ⇒ dialog đang đọc cache cũ; 入金指定額 ' +
                '(→ unpaid.rece_amt) seed từ chính con số này',
        ).toBe(expected)

        // F10 戻る KHÔNG dừng chuỗi — outcome `back` vẫn chạy tiếp tới insert-unpaid.
        // Phải chờ POST đó đáp, nếu không `afterAll` xoá `unpaid` trước khi dòng mới
        // được ghi và để sót lại đúng một dòng trong dải test (đã gặp thật).
        await btn(nyukin(), /F10\s*戻る/).first().click()
        await page
            .waitForResponse(
                (r) => INSERT_UNPAID_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            .catch(() => null)
    })
})
