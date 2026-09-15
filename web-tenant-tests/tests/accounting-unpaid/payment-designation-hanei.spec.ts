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
 * ─── DỮ LIỆU: spec TỰ DỰNG, tự dọn ───────────────────────────────────────────
 * Không mượn bệnh nhân có sẵn. Lần chạy đầu đã cho thấy vì sao: mặc định trỏ vào
 * hôm nay, 12138 không có 処置 nào của ngày đó ⇒ cả 4 testcase SKIP, nhìn như
 * "pass" mà thật ra chưa đo gì. Bệnh nhân riêng + 処置 tự seed thì mọi lượt chạy
 * đều xuất phát từ đúng một trạng thái.
 *
 * `bur_rate` PHẢI đặt tay: `seedTestPatient` để NULL ⇒ 一部負担金 = 0 ⇒
 * `insLineNonEmpty` false ⇒ không có dòng `unpaid` nào ⇒ spec mất đối tượng đo.
 *
 * Dọn dẹp ở `afterAll`: `unpaid` của bệnh nhân này (F8 sinh ra) rồi
 * `deleteTestPatient` (person/insurance/siga/kon/trn_trn).
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
 * `serial` + page dùng chung (Rule 19): thứ tự test có ý nghĩa, chạy lẻ một test
 * ở giữa sẽ fail. Không có trace/video tự động.
 */

import { type Locator, type Page, type Route } from '@playwright/test'

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

/** Bệnh nhân riêng của spec này — +5 để không đụng spec seed khác. */
const PAT_NO = Number(process.env.TEST_PAT_NO ?? SEED_PAT_NO_BASE + 5)
/** Ngày test = hôm nay ⇒ luôn nằm trong tháng hiện hành của lưới. */
const TRT_DT = trtDt(TODAY_ISO)
/** 負担割合 của bệnh nhân seed — khác 0 để 一部負担金 > 0 (xem doc đầu file). */
const BUR_RATE = 30

const ACC_CONFIG_URL = /\/tenant\/master\/acc-config(\?|$)/
const RECOMPUTE_URL = /\/tenant\/treatment\/accounting\/recompute-copayment(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

/** Cột 日 của lưới (treatment-entry-shared RegiCol.day = 0). */
const COL_DAY = 0
/** Dòng của tháng CŨ (read-only) có key dạng `<recordIdx>-<itemIdx>`. */
const HISTORY_KEY_RE = /^\d+-\d+$/
/** Ô 検査 — hàng thứ 4 trong UNIT_ROW_LABELS. */
const UNIT_IDX_KENSA = 3

type RecomputeCall = { customInsScore: number; insPrice: number }
type InsertCall = { insPriceOverride: number | null; unitOverrides: number[] | null }

test.describe.configure({ mode: 'serial' })

test.describe('入金指定 — F キー đợi 反映 rồi mới chốt', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    let seeded = false
    let onRequest: (req: import('@playwright/test').Request) => void
    let onResponse: (res: import('@playwright/test').Response) => Promise<void>

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
     * kiểu đó không loại được gì (Rule 12.1).
     */
    const moneyBoxes = () => nyukin().locator('input[type="number"]:not(#txt-inp-payment)')

    /** Lần 反映 ứng với ĐÚNG tổng điểm `score` — chờ tới khi response của nó về. */
    async function recomputeFor(score: number): Promise<RecomputeCall> {
        await expect
            .poll(() => recomputeCalls.filter((c) => c.customInsScore === score).length, {
                timeout: 15_000,
            })
            .toBeGreaterThan(0)
        const hit = recomputeCalls.filter((c) => c.customInsScore === score)
        return hit[hit.length - 1]!
    }

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
     * Mở 診療入力. Thử lại tới `GRID_LOAD_ATTEMPTS` lần: đây là Vite **dev** server và
     * đã gặp thật một lần trang trắng giữa suite (lượt goto ngay sau khi chuỗi F8
     * điều hướng sang 窓口精算). Idiom này đã có sẵn trong repo cho đúng cảnh đó.
     */
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
     * Key của một dòng thuộc 会計対象日.
     *
     * ⚠️ PHẢI chờ ô 日 đầu tiên hiện ra rồi mới `evaluateAll`: `evaluateAll` là ảnh
     * chụp tức thời, KHÔNG auto-wait (Rule 10.8). Lần chạy đầu của spec này trượt
     * đúng ở đây — lưới chưa vẽ xong nên danh sách rỗng và testcase tự SKIP với lý
     * do "không có dòng nào của ngày X", nghe như lỗi dữ liệu.
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
        const seen: string[] = []
        for (const r of raw) {
            if (r.key.includes(':')) continue // dòng 日計 footer
            if (HISTORY_KEY_RE.test(r.key)) continue // tháng cũ, read-only
            // Lưới bỏ trống số ngày ở các dòng lặp lại → cộng dồn (BẪY 1).
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === '') continue
            seen.push(carried)
            if (carried === wantDay) return r.key
        }
        console.log(`cột 日 đang có: [${[...new Set(seen)].join(', ')}] — cần ${wantDay}`)
        return null
    }

    /** Đặt con trỏ vào một dòng của 会計対象日 rồi F8 cho tới khi 入金指定 bung. */
    async function openNyukinViaF8(): Promise<boolean> {
        await openEntry()

        const targetKey = await findDayRowKey()
        if (targetKey === null) return false

        await page.locator(`[data-grid-cell="${targetKey}|${COL_DAY}"]`).click()
        await step()

        await drainSantei()
        await page.keyboard.press('F8')

        // Trả lời mọi cổng đứng TRƯỚC 入金指定 (modAcc.LetAccData2).
        //
        // ⚠️ Phải chờ BẤT KỲ hộp nào, không phải riêng 入金指定. Bản đầu của spec chờ
        // đúng `nyukin()`, nên khi 会計前チェック bung trước thì hết 15s rồi thoát vòng
        // và kết luận nhầm là "chuỗi F8 không chạy".
        const anyBox = page.locator('[role="dialog"], [role="alertdialog"]')
        const handled: string[] = []
        for (let i = 0; i < 12; i++) {
            if (await nyukin().isVisible().catch(() => false)) {
                console.log(`chuỗi F8 đã qua: [${handled.join(' → ')}] → 入金指定`)
                return true
            }
            if (!(await appeared(anyBox, 15_000))) break

            const gates: [string, Locator, string | RegExp][] = [
                ['会計前チェック', checkGate(), 'OK'],
                ['処置データ変更', dirtyGate(), 'No'],
                ['日付チェック', dateGate(), 'OK'],
                ['未精算作成', createGate(), /^(No|いいえ)$/],
                ['計上', chgAccGate(), /^(No|いいえ)$/],
            ]
            let acted = false
            for (const [nm, box, name] of gates) {
                if (await box.isVisible().catch(() => false)) {
                    await btn(box, name).first().click()
                    handled.push(nm)
                    acted = true
                    break
                }
            }
            // Hộp lạ (算定 v.v.) — để overlay handler dọn, vòng sau xét lại.
            if (!acted) await drainSantei()
        }
        console.log(`chuỗi F8 dừng lại sau: [${handled.join(' → ')}] — 入金指定 KHÔNG bung`)
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

        if (dbEnabled && allowSave) {
            await seedTestPatient({ patNo: PAT_NO, accRate: BUR_RATE })
            await withDb((c) =>
                c.query(`UPDATE insurance SET bur_rate = $2, acc_rate = $2 WHERE pat_no = $1`, [
                    PAT_NO,
                    BUR_RATE,
                ]),
            )
            await seedTreatmentRows(PAT_NO, TRT_DT, [
                { trtCd: 110, trtPt: 45, dspTrt: 'E2E 歯科再診料' },
                { trtCd: 400, trtPt: 100, dspTrt: 'E2E 検査' },
            ])
            seeded = true
            console.log(`đã seed bệnh nhân ${PAT_NO}, 2 dòng 処置 ngày ${TRT_DT}`)
        }

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

        onRequest = (req) => {
            if (req.method() !== 'POST') return
            if (!INSERT_UNPAID_URL.test(req.url())) return
            const b = req.postDataJSON() as InsertCall | null
            insertCalls.push({
                insPriceOverride: b?.insPriceOverride ?? null,
                unitOverrides: b?.unitOverrides ?? null,
            })
        }
        page.on('request', onRequest)
        // 反映 ghép request↔response NGAY TẠI response, đọc body của chính
        // `res.request()`. Bản đầu đẩy request vào mảng rồi để response điền vào
        // "phần tử cuối" — hai lần 反映 chồng nhau là điền nhầm ô, và assert đọc phải
        // `insPrice = -1` của ô chưa kịp điền.
        onResponse = async (res) => {
            if (!RECOMPUTE_URL.test(res.url())) return
            const req = res.request()
            if (req.method() !== 'POST') return
            const rb = req.postDataJSON() as { customInsScore?: number } | null
            const body = (await res.json().catch(() => null)) as
                | { data?: { insPrice?: number } }
                | null
            recomputeCalls.push({
                customInsScore: Number(rb?.customInsScore ?? -1),
                insPrice: Number(body?.data?.insPrice ?? -1),
            })
        }
        page.on('response', onResponse)
    })

    test.afterAll(async () => {
        // Page dùng chung cả worker → listener KHÔNG tự mất, phải gỡ tay (Rule 19.1).
        page.off('request', onRequest)
        page.off('response', onResponse)
        await closeChain().catch(() => {})
        // Để mọi POST của chuỗi F8 đáp xong rồi mới xoá — nếu không, một request
        // còn đang bay sẽ ghi lại dòng vừa xoá và để sót dữ liệu test.
        await page.waitForLoadState('networkidle').catch(() => {})
        if (seeded) {
            // F8 sinh dòng `unpaid` — `deleteTestPatient` không đụng bảng đó.
            await withDb((c) => c.query(`DELETE FROM unpaid WHERE pat_no = $1`, [PAT_NO])).catch(
                () => {},
            )
            await deleteTestPatient(PAT_NO).catch(() => {})
        }
        await disposeOverlays?.()
        await releaseSharedPage(page) // ⚠️ KHÔNG page.close()
    })

    test('TC-HANEI-1 — 登録 (F9) ngay sau khi gõ: claim_amt và score CÙNG thế hệ', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình — spec tự dựng bệnh nhân nên cần DB')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật — 登録 ghi thật xuống unpaid')
        if (!dbEnabled || !allowSave) return

        recomputeCalls.length = 0
        insertCalls.length = 0

        const opened = await openNyukinViaF8()
        expect(opened, '入金指定 không bung — xem log cột 日 ở trên').toBe(true)

        await expect(moneyBoxes().nth(UNIT_IDX_KENSA)).toBeVisible({ timeout: 15_000 })
        await step()

        // Gõ rồi bấm 登録 NGAY — cố tình nằm trong cửa sổ debounce 200ms.
        await moneyBoxes().nth(UNIT_IDX_KENSA).fill('300')
        await btn(nyukin(), /F9\s*登録/).first().click()
        await step()

        // Dialog chỉ đóng SAU khi 反映 xong — đó chính là hành vi đang đo.
        await expect(nyukin()).toBeHidden({ timeout: 20_000 })
        await expect.poll(() => insertCalls.length, { timeout: 20_000 }).toBeGreaterThan(0)

        expect(recomputeCalls.length, '反映 phải chạy ít nhất 1 lần trước khi chốt').toBeGreaterThan(0)
        const ins = insertCalls[insertCalls.length - 1]!

        expect(
            ins.unitOverrides?.[UNIT_IDX_KENSA],
            'insert-unpaid phải mang đúng ô 検査 vừa gõ',
        ).toBe(300)
        // 14 ô KHÔNG bắt đầu từ 0: chúng seed từ `summary.unitScores` (port
        // modAcc.Get_AccUnit) nên đã mang điểm của 処置 trong ngày. Bất biến cần chốt
        // là "一部負担金 gửi lên chính là kết quả của lần 反映 ứng với BỘ Ô ĐANG GỬI",
        // chứ không phải một con số tuyệt đối.
        const unitSum = (ins.unitOverrides ?? []).reduce((a, b) => a + b, 0)
        const matching = await recomputeFor(unitSum)
        expect(
            ins.insPriceOverride,
            '一部負担金 gửi lên phải là số của lần 反映 ứng với đúng bộ 14 ô này — không ' +
                'phải số cũ trước khi gõ. Lệch ở đây nghĩa là unpaid.score và ' +
                'unpaid.claim_amt khác thế hệ nhau.',
        ).toBe(matching.insPrice)
    })

    test('TC-HANEI-2 — 指定なし (F1) cũng đợi 反映', async () => {
        skipWithReason(!dbEnabled || !allowSave, 'cần TEST_DB_* + TEST_ALLOW_SAVE')
        if (!dbEnabled || !allowSave) return

        recomputeCalls.length = 0
        insertCalls.length = 0

        const opened = await openNyukinViaF8()
        expect(opened, 'không mở được 入金指定 lần 2').toBe(true)

        await expect(moneyBoxes().nth(0)).toBeVisible({ timeout: 15_000 })
        await moneyBoxes().nth(0).fill('150')
        await btn(nyukin(), /F1\s*指定なし/).first().click()
        await step()

        await expect(nyukin()).toBeHidden({ timeout: 20_000 })
        await expect.poll(() => insertCalls.length, { timeout: 20_000 }).toBeGreaterThan(0)

        const ins = insertCalls[insertCalls.length - 1]!
        expect(ins.unitOverrides?.[0]).toBe(150)
        const unitSum = (ins.unitOverrides ?? []).reduce((a, b) => a + b, 0)
        const matching = await recomputeFor(unitSum)
        expect(ins.insPriceOverride, 'F1 dùng chung buildBaseOutcome với F9').toBe(
            matching.insPrice,
        )
    })

    test('TC-HANEI-3 — 反映 lỗi mạng: dialog Ở NGUYÊN, không ghi unpaid', async () => {
        skipWithReason(!dbEnabled || !allowSave, 'cần TEST_DB_* + TEST_ALLOW_SAVE')
        if (!dbEnabled || !allowSave) return

        const opened = await openNyukinViaF8()
        expect(opened, 'không mở được 入金指定 lần 3').toBe(true)

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

    test('TC-HANEI-4 — unpaid: score bằng tổng 14 ô đã gõ', async () => {
        skipWithReason(!dbEnabled || !allowSave, 'cần TEST_DB_* + TEST_ALLOW_SAVE')
        if (!dbEnabled || !allowSave) return

        // Tự chạy MỘT lượt của riêng mình thay vì đọc ké kết quả của TC trước:
        // TC-3 kết thúc ngay sau cú F10 戻る nên POST insert-unpaid của nó có thể còn
        // đang bay, và mỗi lượt F8 lại `clear-unpaid` xoá dòng của lượt trước — đọc
        // ké là chắc chắn bập bênh.
        insertCalls.length = 0
        const opened = await openNyukinViaF8()
        expect(opened, 'không mở được 入金指定 lần 4').toBe(true)

        await expect(moneyBoxes().nth(UNIT_IDX_KENSA)).toBeVisible({ timeout: 15_000 })
        await moneyBoxes().nth(UNIT_IDX_KENSA).fill('250')
        await btn(nyukin(), /F9\s*登録/).first().click()
        await expect(nyukin()).toBeHidden({ timeout: 20_000 })

        // Mốc tin cậy là RESPONSE của bước ghi, không phải việc dialog đóng.
        await page
            .waitForResponse(
                (r) => INSERT_UNPAID_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            .catch(() => null)

        const ins = insertCalls[insertCalls.length - 1]
        expect(ins, 'lượt này không gọi insert-unpaid').toBeDefined()
        if (!ins) return
        const expectedScore = (ins.unitOverrides ?? []).reduce((a, b) => a + b, 0)

        const readRows = async () =>
            withDb(async (c) => {
                const r = await c.query<{ trt_dt: string; score: string; claim_amt: string }>(
                    `SELECT trt_dt::text AS trt_dt, score, claim_amt FROM unpaid
                      WHERE pat_no = $1 AND deleted_at IS NULL
                      ORDER BY trt_cnt`,
                    [PAT_NO],
                )
                return r.rows.map((x) => ({
                    trtDt: x.trt_dt.slice(0, 10),
                    score: Number(x.score),
                    claimAmt: Number(x.claim_amt),
                }))
            })

        await expect
            .poll(async () => (await readRows()).length, { timeout: 15_000 })
            .toBeGreaterThan(0)

        const rows = await readRows()
        console.log(`unpaid đọc được: ${JSON.stringify(rows)} — kỳ vọng score ${expectedScore}`)
        expect(
            rows.some((r) => r.score === expectedScore),
            `unpaid.score phải bằng tổng 14 ô đã gõ (${expectedScore}) — ` +
                'InsertUnpaidHandler: Score = dayInsScore = unitScores.Sum()',
        ).toBe(true)
        expect(
            rows.some((r) => r.score === expectedScore && r.claimAmt === ins.insPriceOverride),
            'claim_amt của CHÍNH dòng đó phải là 一部負担金 gửi kèm — hai cột cùng thế hệ',
        ).toBe(true)
    })
})
