import { type Locator, type Page, type Route } from '@playwright/test'

import { ACC_BUTTON, routeAccButton, type AccButtonRoute } from '../_shared/acc-button'
import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from '../_shared/db'
import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 診療入力 — phím F8 đổi NHÃN và HÀNH ĐỘNG theo ［F8］キー会計機能設定 (accButton).
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - frm203002.cs:518-531 (lúc dựng màn):
 *        codMstData = CodMst.getCodMstData(con, 200, InpInfo.AccButton.ToString());
 *        if (codMstData != null) {
 *            if (AccButton == 0) _Function[7].name = "   会計" + NewLine + "データ作成";
 *            else                _Function[7].name = codMstData.any_val1;          // 会計
 *        }
 *    `_Function[7]` khởi tạo là "" (frm203002.cs:120) ⇒ AccButton không có dòng
 *    mst_cod thì phím F8 để TRỐNG nhãn.
 *  - frm203002.KeyFunc F8 (:4772-4782):
 *        if (AccButton == 0) IDM_AccDataOnly_Click(...)   // 「3 会計データ作成」
 *        else                IDM_Acc_Click(...)           // 「2 会計」
 *    Rẽ theo `== 0` DUY NHẤT ⇒ mọi giá trị khác 0 đều là 会計.
 *  - IDM_AccDataOnly_Click: 会計前チェック + LetAccData2, KHÔNG có ExitWithoutSaving
 *    (hộp 「処置データは変更されています」) và KHÔNG showForm(ID204002) 窓口精算.
 *  - IDM_Acc_Click: có cổng lưu + sang 窓口精算.
 *
 * ─── Web ─────────────────────────────────────────────────────────────────────
 *  treatment-entry-detail.tsx: nhãn F8 = any_val1 của mst_cod 200 ứng với accButton
 *  (không có ⇒ ''), onPress rẽ `accButton === ACC_BUTTON.AccDataOnly`.
 *  Trước khi sửa: nhãn cố định 「会計」 và F8 luôn chạy chuỗi 会計.
 *
 * ─── Không ghi DB ────────────────────────────────────────────────────────────
 *  - accButton được ép bằng `routeAccButton` (vá response GET /tenant/settings/inp).
 *  - Ba endpoint GHI của LetAccData2 (clear-unpaid / insert-unpaid / correct) bị
 *    CHẶN CỨNG, trả envelope giả. precheck đi thật (chỉ đọc), dùng làm mốc "chuỗi
 *    đã chạy".
 *  - Hộp 「処置データは変更されています」 luôn trả lời No (Yes = bulk-save cả tháng).
 *  - TEST_DB=1: seed 再診 + 外安全１ cho HÔM NAY (vùng disp_no >= 9000, afterAll dọn)
 *    để con trỏ ở dòng hôm nay ⇒ không có hộp 日付チェック, AutoSantei on-load bỏ qua.
 *    Không có TEST_DB vẫn chạy được: vòng `settleAccountingDialogs` bấm OK hộp ngày.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/fkey-menu/treatment-f8-acc-button.spec.ts --retries=0
 * Chạy CẢ FILE (serial, page dùng chung).
 */

const PAT_NO = patNo('12138')

const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const GRID_LOAD_TIMEOUT = 60_000

const SEED_ROWS = [
    { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '再診' },
    { trtCd: 108, trtSb: 9, trtPt: 2, trtCnt: 1, dspTrt: '外安全１(再診)' },
] as const

const ACC_CLEAR_UNPAID_URL = /\/tenant\/treatment\/accounting\/clear-unpaid(\?|$)/
const ACC_PRECHECK_URL = /\/tenant\/treatment\/accounting\/precheck/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/
const ACC_CORRECT_URL = /\/tenant\/treatment\/accounting\/correct(\?|$)/

/** cd_val KHÔNG có trong mst_cod 200 — nhánh `codMstData == null` của WinForm. */
const ACC_BUTTON_UNKNOWN = 7

async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

async function appearedAny(locators: Locator[], timeout: number): Promise<boolean> {
    const races = locators.map((l) => appeared(l, timeout))
    return Promise.race([
        ...races,
        new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500)),
    ])
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — F8 theo ［F8］キー会計機能設定 (frm203002 AccButton)', () => {
    let page: Page
    let step: () => Promise<void>
    let accButton: AccButtonRoute | undefined
    let disposeOverlays: (() => Promise<void>) | undefined

    const calls = { clearUnpaid: 0, precheck: 0, insertUnpaid: 0, correct: 0 }
    const resetCalls = () => {
        calls.clearUnpaid = 0
        calls.precheck = 0
        calls.insertUnpaid = 0
        calls.correct = 0
    }

    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')
    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    /** Nút F8 trên thanh F-key của màn nền (FKeyBar gắn `data-fkey`). */
    const f8Button = () => page.locator('button[data-fkey="F8"]:visible').first()

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

    /** Mở lại 診療入力 để FE đọc lại /tenant/settings/inp (đã bị vá accButton). */
    async function openEntry(value: number) {
        accButton!.set(value)
        const settingsRead = page.waitForResponse(
            (r) => /\/tenant\/settings\/inp(\?|$)/.test(r.url()) && r.request().method() === 'GET',
            { timeout: GRID_LOAD_TIMEOUT },
        )
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await settingsRead
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
    }

    async function pressF8() {
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
        await page.keyboard.press('F8')
    }

    /**
     * Trả lời các cổng của chuỗi 会計 cho tới khi hết. Trả về `true` nếu hộp
     * 「処置データは変更されています」 từng hiện — đó là dấu hiệu IDM_Acc_Click.
     */
    async function settleAccountingDialogs(): Promise<{ dirtySeen: boolean }> {
        let dirtySeen = false
        for (let i = 0; i < 8; i++) {
            const boxes = [checkGate(), dirtyGate(), dateGate(), createGate(), chgAccGate(), nyukinDialog()]
            if (!(await appearedAny(boxes, 15_000))) break
            if (await checkGate().isVisible().catch(() => false)) {
                await btn(checkGate(), 'OK').first().click()
                continue
            }
            if (await dirtyGate().isVisible().catch(() => false)) {
                dirtySeen = true
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
        return { dirtySeen }
    }

    const fakeWrite = (key: 'clearUnpaid' | 'insertUnpaid' | 'correct', data: unknown) =>
        async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            calls[key]++
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data }),
            })
        }

    test.beforeAll(async ({ authedPage }) => {
        if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), TODAY, [...SEED_ROWS])

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        accButton = await routeAccButton(page, ACC_BUTTON.AccDataOnly)

        await page.route(ACC_CLEAR_UNPAID_URL, fakeWrite('clearUnpaid', { deletedCount: 0 }))
        await page.route(
            INSERT_UNPAID_URL,
            fakeWrite('insertUnpaid', { deletedCount: 0, insertedCount: 0, warnings: [] }),
        )
        await page.route(ACC_CORRECT_URL, fakeWrite('correct', { applied: false }))
        await page.route(ACC_PRECHECK_URL, async (route) => {
            calls.precheck++
            await route.continue()
        })
    })

    test.afterAll(async () => {
        await page.unroute(ACC_CLEAR_UNPAID_URL).catch(() => {})
        await page.unroute(INSERT_UNPAID_URL).catch(() => {})
        await page.unroute(ACC_CORRECT_URL).catch(() => {})
        await page.unroute(ACC_PRECHECK_URL).catch(() => {})
        await accButton?.dispose()
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (dbEnabled) await deleteTreatmentRows(Number(PAT_NO), TODAY)
    })

    test('TC-F8-1 — accButton=0: nhãn F8 là 「会計データ作成」', async () => {
        await openEntry(ACC_BUTTON.AccDataOnly)
        await expect(
            f8Button(),
            'accButton=0 mà nhãn F8 không phải 会計データ作成 — nhãn đang cố định (frm203002.cs:522-526)',
        ).toHaveText(/^F8\s*会計データ作成$/)
        await step()
    })

    test('TC-F8-2 — accButton=0: F8 chạy 会計データ作成 — không cổng lưu, Ở LẠI 診療入力', async () => {
        resetCalls()
        await pressF8()
        const { dirtySeen } = await settleAccountingDialogs()

        await expect
            .poll(() => calls.precheck, {
                message: 'F8 không chạy LetAccData2 (precheck = 0) — 会計データ作成 cũng phải tạo dữ liệu',
                timeout: 60_000,
            })
            .toBeGreaterThan(0)
        expect(calls.clearUnpaid, 'LetAccData2 phải xoá 未精算 của ngày (clear-unpaid)').toBeGreaterThan(0)
        expect(
            dirtySeen,
            'hộp 処置データは変更されています chỉ có ở IDM_Acc_Click — F8 đang chạy nhầm chuỗi 会計',
        ).toBe(false)
        // Cho FE một nhịp để nếu có navigate thì nó đã xảy ra.
        await page.waitForTimeout(2_000)
        await expect(
            page,
            'accButton=0 mà F8 sang 窓口精算 — IDM_AccDataOnly_Click không có showForm(ID204002)',
        ).toHaveURL(/\/treatments\//)
        await step()
    })

    test('TC-F8-3 — accButton=1: nhãn F8 là 「会計」', async () => {
        await openEntry(ACC_BUTTON.Acc)
        await expect(f8Button()).toHaveText(/^F8\s*会計$/)
        await step()
    })

    test('TC-F8-4 — accButton=1: F8 chạy chuỗi 会計 và sang 窓口精算', async () => {
        resetCalls()
        await pressF8()
        await settleAccountingDialogs()
        await expect(
            page,
            'accButton=1 mà F8 không sang 窓口精算 — IDM_Acc_Click phải showForm(ID204002)',
        ).toHaveURL(/\/counter-payments/, { timeout: 60_000 })
        expect(calls.precheck, 'chuỗi 会計 không chạy LetAccData2').toBeGreaterThan(0)
        await step()
    })

    test('TC-F8-5 — accButton không có trong mst_cod 200: nhãn F8 TRỐNG (codMstData == null)', async () => {
        await openEntry(ACC_BUTTON_UNKNOWN)
        await expect(
            f8Button(),
            'không có dòng mst_cod thì WinForm để trống _Function[7].name ("")',
        ).toHaveText(/^F8$/)
        await step()
    })

    test('TC-F8-6 — accButton khác 0 mà không phải 1: F8 vẫn là chuỗi 会計 (WinForm rẽ theo == 0)', async () => {
        resetCalls()
        await pressF8()
        await settleAccountingDialogs()
        await expect(
            page,
            `accButton=${ACC_BUTTON_UNKNOWN} phải chạy IDM_Acc_Click (chỉ 0 mới là 会計データ作成)`,
        ).toHaveURL(/\/counter-payments/, { timeout: 60_000 })
        await step()
    })
})
