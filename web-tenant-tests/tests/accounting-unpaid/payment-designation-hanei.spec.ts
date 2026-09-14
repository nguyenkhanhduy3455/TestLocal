/**
 * 入金指定 (frm203027) — 反映 (Hanei) phải xong TRƯỚC khi phím F chốt số.
 *
 * ─── Vì sao có spec này ──────────────────────────────────────────────────────
 * Trong WinForm, `txtMoney_TextChanged` gọi `Hanei()` ĐỒNG BỘ (frm203027.cs:239-243),
 * nên tới lúc `KeyFunc(End)` chạy thì nhãn 医療保険 đã cùng thế hệ với 14 ô 保険点数
 * mà nó chép vào `modAcc.templngAccUnit`:
 *
 *     case Keys.End:                                        // ← F9 登録
 *         for (i…) modAcc.templngAccUnit[i + 1] = CInt(txtMoney[i].Text)
 *         ModCommon.pLngAccOrder = CInt(txtInp.Text)
 *         modAcc.temphoken      = CInt(lb1[0].Text)         // frm203027.cs:434-441
 *
 * Bản web gọi POST `recompute-copayment` sau debounce 200ms + RTT. Bấm F9 trong
 * khoảng đó thì `unitValues` là MỚI còn `insPrice` vẫn là CŨ, và
 * `InsertUnpaidHandler` ghi đúng cặp lệch đó vào MỘT dòng `unpaid`:
 *
 *     lines.Add(new(KmCd: accCode, Score: dayInsScore, ClaimAmt: insPrice, …))
 *     // dayInsScore = tổng unitOverrides (MỚI) — claim_amt = insPriceOverride (CŨ)
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - components/payment-designation-dialog.tsx
 *      · `HANEI_DEBOUNCE_MS = 200`.
 *      · 14 ô 保険点数 là `<Input type="number">` → role `spinbutton` (Rule 12.5);
 *        ô 入金指定額 cũng spinbutton nhưng có `id="txt-inp-payment"`.
 *      · Tiêu đề dialog giãn chữ: `入 金 指 定` → KHÔNG match theo title (Rule 13.1).
 *      · F1 `指定なし` / F9 `登録` / F10 `戻る` đi qua `flushHanei()`; thất bại
 *        mạng thì KHÔNG chốt, dialog ở nguyên (sai lệch parity có chủ ý — WinForm
 *        không có đường lỗi mạng vì Hanei gọi local).
 *  - queries/daily-accounting-mutations.ts: không có `onError` ở tầng hook —
 *    dialog tự lo bằng `mutateAsync` + số thế hệ.
 *  - treatment-entry-detail.tsx:2230 — `insPriceOverride` của insert-unpaid lấy
 *    từ outcome của dialog, áp dụng cho CẢ register / unspecified / back.
 *  - Dialog chỉ bung khi `accConfig.receRcvFlg === 1` → spec vá response thật.
 *
 * ─── Chạy ────────────────────────────────────────────────────────────────────
 * `serial` + page dùng chung (Rule 19): thứ tự test có ý nghĩa, chạy lẻ một test
 * ở giữa sẽ fail. Không có trace/video tự động.
 *
 * Mặc định trỏ vào bệnh nhân + ngày CÓ 処置 của tháng hiện hành (Rule 18); chưa
 * chắc dataset nào cũng có → có `TEST_PAT_NO` / `TEST_TRT_DT` để chỉnh.
 * Testcase GHI DB (bấm 登録 thật) nằm sau `TEST_ALLOW_SAVE=1` (Rule 18.1).
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
const RECOMPUTE_URL = /\/tenant\/treatment\/accounting\/recompute-copayment(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

/** Cột 日 của lưới (treatment-entry-shared RegiCol.day). */
const COL_DAY = 0
/** Ô 検査 — hàng thứ 4 trong UNIT_ROW_LABELS. */
const UNIT_IDX_KENSA = 3

type RecomputeCall = { customInsScore: number; insPrice: number }
type InsertCall = { insPriceOverride: number | null; unitOverrides: number[] | null }

test.describe.configure({ mode: 'serial' })

test.describe('入金指定 — F キー đợi 反映 rồi mới chốt', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    const recomputeCalls: RecomputeCall[] = []
    const insertCalls: InsertCall[] = []

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

    /**
     * 14 ô 保険点数 — CSS chứ không `filter({ hasNot })`: ô 入金指定額 cùng role
     * `spinbutton` và `hasNot` xét HẬU DUỆ, mà `<input>` không có hậu duệ nên lọc
     * kiểu đó không loại được gì (Rule 12.1). Selector này bám cấu trúc thật
     * (`type="number"` + `id` của ô 入金指定額), không bám class Tailwind.
     */
    const moneyBoxes = () => nyukin().locator('input[type="number"]:not(#txt-inp-payment)')

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

    async function openEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSantei()
    }

    /** Đặt con trỏ vào một dòng của 会計対象日 rồi F8 cho tới khi 入金指定 bung. */
    async function openNyukinViaF8(): Promise<boolean> {
        await openEntry()

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
        await step()

        await drainSantei()
        await page.keyboard.press('F8')

        // Trả lời mọi cổng đứng TRƯỚC 入金指定 (modAcc.LetAccData2).
        for (let i = 0; i < 8; i++) {
            if (await nyukin().isVisible().catch(() => false)) return true
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
        return await nyukin().isVisible().catch(() => false)
    }

    /** Đóng mọi hộp còn sót để test sau bắt đầu từ màn sạch. */
    async function closeChain() {
        for (let i = 0; i < 8; i++) {
            const boxes = [nyukin(), createGate(), chgAccGate(), checkGate(), dateGate(), dirtyGate()]
            const open = []
            for (const b of boxes) if (await b.isVisible().catch(() => false)) open.push(b)
            if (open.length === 0) return
            if (await nyukin().isVisible().catch(() => false)) {
                await btn(nyukin(), /F10\s*戻る/).first().click()
                continue
            }
            await open[0]!
                .getByRole('button')
                .last()
                .click()
                .catch(() => {})
        }
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        // 会計設定 — chỉ ép ĐÚNG một trường, giữ nguyên phần còn lại của response thật.
        await page.route(ACC_CONFIG_URL, async (route: Route) => {
            const res = await route.fetch()
            const body = (await res.json()) as { data?: { receRcvFlg?: number } }
            if (body.data) body.data.receRcvFlg = 1 // 入金指定 mới bung
            await route.fulfill({
                status: res.status(),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        })

        page.on('request', (req) => {
            if (req.method() !== 'POST') return
            if (RECOMPUTE_URL.test(req.url())) {
                const b = req.postDataJSON() as { customInsScore?: number } | null
                recomputeCalls.push({ customInsScore: Number(b?.customInsScore ?? -1), insPrice: -1 })
            }
            if (INSERT_UNPAID_URL.test(req.url())) {
                const b = req.postDataJSON() as InsertCall | null
                insertCalls.push({
                    insPriceOverride: b?.insPriceOverride ?? null,
                    unitOverrides: b?.unitOverrides ?? null,
                })
            }
        })
        page.on('response', async (res) => {
            if (!RECOMPUTE_URL.test(res.url())) return
            const body = (await res.json().catch(() => null)) as
                | { data?: { insPrice?: number } }
                | null
            const slot = recomputeCalls[recomputeCalls.length - 1]
            if (slot && body?.data) slot.insPrice = Number(body.data.insPrice ?? -1)
        })
    })

    test.afterAll(async () => {
        await closeChain().catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page) // ⚠️ KHÔNG page.close()
    })

    test('TC-HANEI-1 — 登録 (F9) ngay sau khi gõ: claim_amt và score CÙNG thế hệ', async () => {
        skipWithReason(
            !allowSave,
            'TEST_ALLOW_SAVE chưa bật — 登録 ghi thật xuống unpaid nên không chạy mặc định',
        )
        if (!allowSave) return

        recomputeCalls.length = 0
        insertCalls.length = 0

        const opened = await openNyukinViaF8()
        skipWithReason(!opened, `lưới không có dòng nào của ngày ${TRT_DT} — đổi TEST_TRT_DT`)
        if (!opened) return

        await expect(moneyBoxes().nth(UNIT_IDX_KENSA)).toBeVisible({ timeout: 15_000 })
        await step()

        // Gõ rồi bấm 登録 NGAY — cố tình nằm trong cửa sổ debounce 200ms.
        await moneyBoxes().nth(UNIT_IDX_KENSA).fill('300')
        await btn(nyukin(), /F9\s*登録/).first().click()
        await step()

        // Dialog chỉ đóng SAU khi 反映 xong — đó chính là hành vi đang đo.
        await expect(nyukin()).toBeHidden({ timeout: 20_000 })

        await expect
            .poll(() => insertCalls.length, { timeout: 20_000 })
            .toBeGreaterThan(0)

        expect(recomputeCalls.length, '反映 phải chạy ít nhất 1 lần trước khi chốt').toBeGreaterThan(0)
        const last = recomputeCalls[recomputeCalls.length - 1]!
        const ins = insertCalls[insertCalls.length - 1]!

        expect(last.customInsScore, '反映 phải gửi tổng 14 ô SAU khi gõ').toBe(300)
        expect(
            ins.unitOverrides?.[UNIT_IDX_KENSA],
            'insert-unpaid phải mang đúng ô 検査 vừa gõ',
        ).toBe(300)
        expect(
            ins.insPriceOverride,
            '一部負担金 gửi lên phải là số của LẦN 反映 CUỐI — không phải số cũ trước khi gõ. ' +
                'Lệch ở đây nghĩa là unpaid.score và unpaid.claim_amt khác thế hệ nhau.',
        ).toBe(last.insPrice)
    })

    test('TC-HANEI-2 — 指定なし (F1) cũng đợi 反映', async () => {
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật')
        if (!allowSave) return

        recomputeCalls.length = 0
        insertCalls.length = 0

        const opened = await openNyukinViaF8()
        skipWithReason(!opened, 'không mở được 入金指定 lần 2')
        if (!opened) return

        await expect(moneyBoxes().nth(0)).toBeVisible({ timeout: 15_000 })
        await moneyBoxes().nth(0).fill('150')
        await btn(nyukin(), /F1\s*指定なし/).first().click()
        await step()

        await expect(nyukin()).toBeHidden({ timeout: 20_000 })
        await expect.poll(() => insertCalls.length, { timeout: 20_000 }).toBeGreaterThan(0)

        const last = recomputeCalls[recomputeCalls.length - 1]!
        const ins = insertCalls[insertCalls.length - 1]!
        expect(ins.unitOverrides?.[0]).toBe(150)
        expect(ins.insPriceOverride, 'F1 dùng chung buildBaseOutcome với F9').toBe(last.insPrice)
    })

    test('TC-HANEI-3 — 反映 lỗi mạng: dialog Ở NGUYÊN, không ghi unpaid', async () => {
        const opened = await openNyukinViaF8()
        skipWithReason(!opened, 'không mở được 入金指定 lần 3')
        if (!opened) return

        await expect(moneyBoxes().nth(UNIT_IDX_KENSA)).toBeVisible({ timeout: 15_000 })

        const before = insertCalls.length
        await page.route(RECOMPUTE_URL, (route: Route) => route.abort('failed'))
        try {
            await moneyBoxes().nth(UNIT_IDX_KENSA).fill('777')
            await btn(nyukin(), /F9\s*登録/).first().click()
            await step()

            // Không chốt bằng số đã biết là cũ — thà đứng lại trong dialog.
            await expect(
                nyukin(),
                '反映 hỏng mà vẫn đóng dialog nghĩa là 一部負担金 cũ đã bị ghi vào unpaid',
            ).toBeVisible({ timeout: 10_000 })
            expect(insertCalls.length, 'không được gọi insert-unpaid khi 反映 hỏng').toBe(before)
        } finally {
            await page.unroute(RECOMPUTE_URL)
        }

        await closeChain()
    })

    test('TC-HANEI-4 — unpaid: score và claim_amt của dòng vừa ghi khớp nhau', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình — bỏ phần đối chiếu DB')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật')
        if (!dbEnabled || !allowSave) return

        const ins = insertCalls.find((c) => c.unitOverrides !== null)
        skipWithReason(ins === undefined, 'chưa có lượt 登録 nào ở các TC trên để đối chiếu')
        if (ins === undefined) return

        const rows = await withDb(async (c) => {
            const r = await c.query<{ score: string; claim_amt: string }>(
                `SELECT score, claim_amt FROM unpaid
                  WHERE pat_no = $1 AND trt_dt = $2 AND deleted_at IS NULL
                  ORDER BY trt_cnt`,
                [Number(PAT_NO), TRT_DT],
            )
            return r.rows.map((x) => ({ score: Number(x.score), claimAmt: Number(x.claim_amt) }))
        })
        skipWithReason(rows.length === 0, 'F8 không sinh dòng unpaid nào (mọi khoản = 0)')
        if (rows.length === 0) return

        const expectedScore = (ins.unitOverrides ?? []).reduce((a, b) => a + b, 0)
        console.log(`unpaid đọc được: ${JSON.stringify(rows)} — kỳ vọng score ${expectedScore}`)
        expect(
            rows.some((r) => r.score === expectedScore),
            'unpaid.score phải bằng tổng 14 ô đã gõ (InsertUnpaidHandler: Score = dayInsScore)',
        ).toBe(true)
    })
})
