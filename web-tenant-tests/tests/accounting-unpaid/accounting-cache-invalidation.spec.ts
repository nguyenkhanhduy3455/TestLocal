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
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - queries/daily-accounting-summary-queries.ts: `staleTime: 30_000` cho
 *    `dailySummaryItem`; `precheckItem` `staleTime: 0` (nên precheck luôn gọi lại,
 *    KHÔNG dùng nó làm mốc).
 *  - queries/daily-accounting-summary-keys.ts: `invalidateAccountingCaches` lọc theo
 *    `queryKey.at(-1).patNo` → chỉ hạ cache của đúng bệnh nhân này.
 *  - `daily-summary` và `precheck` là POST (mang cả lưới trong body), không phải GET.
 *  - Dialog chỉ bung khi `accConfig.receRcvFlg === 1` → spec vá response thật.
 *
 * `serial` + page dùng chung (Rule 19). TEST_ALLOW_SAVE bắt buộc: chuỗi F8 ghi
 * thật vào `unpaid` (Rule 18.1).
 */

import { type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { GRID_LOAD_TIMEOUT, allowSave, patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = patNo('12138')
const TRT_DT = trtDt(new Date().toISOString().slice(0, 10))

const ACC_CONFIG_URL = /\/tenant\/master\/acc-config(\?|$)/
const DAILY_SUMMARY_URL = /\/tenant\/treatment\/accounting\/daily-summary(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

const COL_DAY = 0

test.describe.configure({ mode: 'serial' })

test.describe('会計キャッシュ — 未収金 không được phục vụ từ cache cũ', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

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

    /**
     * Chạy trọn một lượt F8: đặt con trỏ vào dòng của 会計対象日, bấm F8, trả lời mọi
     * cổng, đóng 入金指定 bằng F10 戻る (F10 vẫn đi tới insert-unpaid — outcome `back`).
     * Trả về `false` khi lưới không có dòng nào của ngày đó.
     *
     * ⚠️ KHÔNG chạm vào ô nào của lưới — `rows` phải giữ nguyên giữa hai lượt, nếu
     * không queryKey đổi và lượt 2 gọi lại vì lý do KHÁC với thứ đang đo.
     */
    async function runF8Round(): Promise<boolean> {
        const wantDay = String(Number(TRT_DT.slice(8, 10)))
        const rows = await page.locator(`[data-grid-cell$="|${COL_DAY}"]`).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
        let carried = ''
        let targetKey: string | null = null
        for (const r of rows) {
            if (r.key.includes(':')) continue
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === wantDay) {
                targetKey = r.key
                break
            }
        }
        if (targetKey === null) return false

        await page.locator(`[data-grid-cell="${targetKey}|${COL_DAY}"]`).click()
        await drainSantei()
        await page.keyboard.press('F8')
        await step()

        for (let i = 0; i < 10; i++) {
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
            if (!acted) {
                const any = await appeared(
                    page.locator('[role="dialog"], [role="alertdialog"]'),
                    8_000,
                )
                if (!any) break
            }
        }
        return true
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

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

        page.on('request', (req) => {
            if (req.method() !== 'POST') return
            if (DAILY_SUMMARY_URL.test(req.url())) dailySummaryCount++
            if (INSERT_UNPAID_URL.test(req.url())) insertUnpaidCount++
        })

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSantei()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    test('TC-CACHE-1 — lượt F8 thứ hai (cùng lưới, trong 30s) vẫn phải gọi lại daily-summary', async () => {
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật — chuỗi F8 ghi thật vào unpaid')
        if (!allowSave) return

        dailySummaryCount = 0
        insertUnpaidCount = 0

        const ok1 = await runF8Round()
        skipWithReason(!ok1, `lưới không có dòng nào của ngày ${TRT_DT} — đổi TEST_TRT_DT`)
        if (!ok1) return

        await expect.poll(() => dailySummaryCount, { timeout: 20_000 }).toBeGreaterThan(0)
        const afterFirst = dailySummaryCount
        console.log(`lượt 1: daily-summary ${afterFirst} lần, insert-unpaid ${insertUnpaidCount} lần`)

        skipWithReason(
            insertUnpaidCount === 0,
            'lượt 1 không ghi unpaid (mọi khoản = 0) → không có gì để hạ cache, phép đo vô nghĩa',
        )
        if (insertUnpaidCount === 0) return

        // Lượt 2 NGAY LẬP TỨC — nằm gọn trong staleTime 30s, lưới không đổi.
        const ok2 = await runF8Round()
        expect(ok2).toBe(true)

        await expect
            .poll(() => dailySummaryCount, { timeout: 20_000 })
            .toBeGreaterThan(afterFirst)
        console.log(`lượt 2: daily-summary tổng ${dailySummaryCount} lần`)
    })

    test('TC-CACHE-2 — 未収金 trên dialog khớp person_exp tại thời điểm mở', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật')
        if (!dbEnabled || !allowSave) return

        const expected = await withDb(async (c) => {
            const r = await c.query<Record<string, unknown>>(
                `SELECT COALESCE(ins_due_bal,0) + COALESCE(own_due_bal,0) + COALESCE(own_due_exc,0)
                      + COALESCE(gds_due_bal,0) + COALESCE(gds_due_exc,0) AS total
                   FROM person_exp WHERE pat_no = $1`,
                [Number(PAT_NO)],
            )
            return r.rows.length === 0 ? 0 : Number(r.rows[0]!['total'] ?? 0)
        })

        // Mở lại 入金指定 để đọc con số đang hiện.
        const wantDay = String(Number(TRT_DT.slice(8, 10)))
        const rows = await page.locator(`[data-grid-cell$="|${COL_DAY}"]`).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
        let carried = ''
        let targetKey: string | null = null
        for (const r of rows) {
            if (r.key.includes(':')) continue
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === wantDay) {
                targetKey = r.key
                break
            }
        }
        skipWithReason(targetKey === null, 'không tìm được dòng của 会計対象日')
        if (targetKey === null) return

        await page.locator(`[data-grid-cell="${targetKey}|${COL_DAY}"]`).click()
        await drainSantei()
        await page.keyboard.press('F8')

        for (let i = 0; i < 10; i++) {
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
            if (!acted && !(await appeared(nyukin(), 15_000))) break
        }
        skipWithReason(
            !(await nyukin().isVisible().catch(() => false)),
            'không mở được 入金指定 (receRcvFlg / nhánh 既存会計)',
        )
        if (!(await nyukin().isVisible().catch(() => false))) return

        // Hàng 未収金: nhãn và số là hai <span> cạnh nhau trong cùng một hàng flex.
        const shown = await nyukin()
            .getByText('未収金', { exact: true })
            .locator('..')
            .innerText()
        const num = Number((shown.match(/([\d,]+)\s*$/)?.[1] ?? '').replace(/,/g, ''))
        console.log(`未収金 hiện: ${num} — person_exp: ${expected}`)
        expect(
            num,
            '未収金 trên dialog khác person_exp ⇒ dialog đang đọc cache cũ; 入金指定額 ' +
                '(→ unpaid.rece_amt) seed từ con số này',
        ).toBe(expected)

        await btn(nyukin(), /F10\s*戻る/).first().click()
    })
})
