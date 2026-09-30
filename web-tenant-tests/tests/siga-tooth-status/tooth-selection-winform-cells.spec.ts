import { type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from '../_shared/db'
import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 部位選択 (frm902003) — ngữ nghĩa từng Ô răng của WinForm (BuiInfo / BuiLabel).
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - Mỗi BuiLabel có cờ 乳歯 RIÊNG (`_nyusi`), chỉ răng 1〜5 mới có thể bật:
 *      · Load: setNyusiFlg(data) bật cho ô đang mang 11〜19 (BuiInfo.cs:161-187).
 *      · F8: setNyusiFlg(bool) đặt lại ô 1〜5 theo chế độ, KHÔNG ghi giá trị.
 *      · Phím 1〜8 → ô vĩnh viễn; A〜E → ô sữa; rồi BuiVal = BuiVal + 1
 *        (BuiInfo.ProcessCmdKey :400-437). Chế độ 乳歯 bỏ qua phím 6〜8.
 *  - Mọi lần ghi đi qua setter BuiVal → chkVal(false) (BuiLabel.cs:59-68): giá trị
 *    không hợp với cờ của Ô bị đổi (sữa ghi vào ô vĩnh viễn → 1, vĩnh viễn vào ô sữa → 11).
 *  - setBui F1〜F7 GHI ĐÈ 1 / 11 bất kể ô đang có gì (frm902003.cs:776-901).
 *  - F10 反転 chế độ 乳歯 chỉ đi răng 1〜5 (A〜E) và coi 10 là ô trống (:336-349).
 *  - Mỗi lần mở là một frm902003 mới ⇒ luôn bắt đầu ở 永久歯.
 *  - Backspace / テンキー「-」 (Keys.Back / Keys.Subtract) → clearBui(_pos, _idx): xoá
 *    răng BẤM/CLICK GẦN NHẤT (`_idx`, mặc định 1) của vùng đang chọn; `-` hàng số
 *    thường (OemMinus) KHÔNG xoá. Click số răng (lblClrBui) xoá đúng răng đó
 *    (BuiInfo.cs:370-374, :508-515).
 *
 * ─── Không ghi DB ────────────────────────────────────────────────────────────
 *  Không bấm 確定 (End); đóng bằng F12 戻る. plaque-teeth trả giả `row: null` để gate
 *  Ｐ部位 là mặc định (răng 1..7). TEST_DB=1: seed 再診 ngày 1 của tháng (SEED_DT) để có
 *  dòng mà click ô 部位.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/siga-tooth-status/tooth-selection-winform-cells.spec.ts --retries=0
 */

const PAT_NO = patNo('12138')
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
/**
 * Ngày seed — một ngày KHÁC hôm nay trong cùng tháng. Spec Ｐ部位 (plaque-gate) seed và
 * dọn hôm nay cho cùng bệnh nhân, mà Playwright có thể chạy xen kẽ test của hai file:
 * dùng chung ngày thì afterAll bên này xoá mất dòng bên kia đang dùng.
 */
const SEED_DT = `${TODAY.slice(0, 8)}${TODAY.endsWith('-01') ? '02' : '01'}`
const GRID_LOAD_TIMEOUT = 60_000
const SEED_ROWS = [
    { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '再診' },
    { trtCd: 108, trtSb: 9, trtPt: 2, trtCnt: 1, dspTrt: '外安全１(再診)' },
] as const

const PLAQUE_URL = /\/tenant\/treatment\/plaque-teeth(\?|$)/
const SIGA_URL = /\/tenant\/siga(\?|$)/
const COL_BUI = 1
const SE_MISSING = 4

const RU = (t: number) => 8 - t
const LU = (t: number) => 8 + t - 1
const RD = (t: number) => 16 + 8 - t
const LD = (t: number) => 24 + t - 1
const QUADS = [RU, LU, RD, LD] as const

async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('部位選択 — cờ 乳歯 từng ô + setter BuiVal (frm902003 / BuiLabel)', () => {
    let page: Page
    let step: () => Promise<void>
    let toothDialog: Locator
    let disposeOverlays: (() => Promise<void>) | undefined
    let siga: { se: number[] } | null = null
    let opened = false

    const plaqueHandler = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        await route.fulfill({
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ success: true, data: { row: null } }),
        })
    }
    const sigaHandler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        const json = (await res.json()) as { data?: { se?: unknown[] } | null }
        siga = { se: Array.from({ length: 32 }, (_, i) => Number(json.data?.se?.[i] ?? 0)) }
        await route.fulfill({ response: res })
    }
    const permMissing = (i: number) => siga !== null && siga.se[i] === SE_MISSING

    async function drain() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(santei, 2_000))) break
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
        }
        const karte = page.locator('[role="dialog"]').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(karte.first(), 2_000))) break
            await karte.first().getByRole('button', { name: /F10\s*戻る/ }).first().click().catch(() => {})
        }
    }

    async function openFromBuiCell(): Promise<boolean> {
        const keys = await page
            .locator(`[data-grid-cell$="|${COL_BUI}"]`)
            .evaluateAll((els) => els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')))
        const key = keys.find((k) => k && !k.includes(':') && !/^\d+-\d+$/.test(k))
        if (!key) return false
        await drain()
        await page.locator(`[data-grid-cell="${key}|${COL_BUI}"]`).click()
        return appeared(toothDialog, 20_000)
    }

    const fkey = (name: RegExp) => toothDialog.getByRole('button', { name }).first()
    const cells = () => toothDialog.locator('button.w-10.h-10')

    async function readBui(): Promise<number[]> {
        await expect(cells()).toHaveCount(32)
        const titles = await cells().evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))
        return titles.map((t) => {
            const m = /^Type: (\d+)$/.exec(t)
            return m ? Number(m[1]) : 0
        })
    }

    async function closeDialog() {
        if (!(await toothDialog.isVisible().catch(() => false))) return
        await fkey(/^F12\s*戻る$/).click()
        await expect(toothDialog).toBeHidden({ timeout: 10_000 })
    }

    /** Một răng vĩnh viễn 1..5 của LU không bị mất (SIGA) — để kỳ vọng không phụ thuộc bệnh nhân. */
    function presentLuTooth(): number | null {
        for (let t = 1; t <= 5; t++) if (!permMissing(LU(t))) return t
        return null
    }

    const fmt = (b: number[]) =>
        QUADS.map((q, qi) => `${['RU', 'LU', 'RD', 'LD'][qi]}:` + [1, 2, 3, 4, 5, 6, 7, 8].map((t) => b[q(t)]).join(',')).join(' ')

    test.beforeAll(async ({ authedPage }) => {
        if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), SEED_DT, [...SEED_ROWS])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        toothDialog = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ })
        await page.route(PLAQUE_URL, plaqueHandler)
        await page.route(SIGA_URL, sigaHandler)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drain()
        opened = await openFromBuiCell()
    })

    test.afterAll(async () => {
        await closeDialog().catch(() => {})
        await page.unroute(PLAQUE_URL, plaqueHandler).catch(() => {})
        await page.unroute(SIGA_URL, sigaHandler).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (dbEnabled) await deleteTreatmentRows(Number(PAT_NO), SEED_DT)
    })

    test('TC-CELL-1 — 全顎 GHI ĐÈ răng đang mang loại khác (2 → 1)', async () => {
        skipWithReason(!opened, 'không mở được 部位選択 từ ô 部位 (bật TEST_DB=1 để seed)')
        const t = presentLuTooth()
        skipWithReason(t === null, 'LU 1..5 đều mất theo SIGA')
        await fkey(/^F11\s*全消去$/).click()
        await cells().nth(LU(t!)).click() // 0 → 1
        await cells().nth(LU(t!)).click() // 1 → 2
        expect((await readBui())[LU(t!)], 'hai lần click phải ra loại 2').toBe(2)
        await fkey(/^F7\s*全顎$/).click()
        const got = await readBui()
        console.log(`F7 sau khi LU${t} = 2: ${fmt(got)}`)
        expect(got[LU(t!)], 'setBui gán 1 vô điều kiện — web cũ giữ nguyên 2').toBe(1)
        await step()
    })

    test('TC-CELL-2 — 乳歯 反転: chỉ đảo A〜E (răng 1..5), răng 6..8 giữ nguyên', async () => {
        skipWithReason(!opened, 'không mở được 部位選択')
        await fkey(/^F11\s*全消去$/).click()
        await cells().nth(LU(7)).click() // răng 7 vĩnh viễn = 1
        await fkey(/^F8\s*乳歯$/).click()
        await fkey(/^F10\s*反転$/).click()
        const got = await readBui()
        console.log(`乳歯 F10: ${fmt(got)}`)
        for (const q of QUADS) {
            for (let t = 1; t <= 5; t++) expect(got[q(t)], `răng ${t} (idx ${q(t)}) phải thành 11`).toBe(11)
        }
        expect(got[LU(7)], 'răng 7 nằm ngoài A〜E — 反転 乳歯 không được đụng').toBe(1)
        for (const q of QUADS) {
            expect(got[q(6)], 'răng 6 không có ô sữa — phải giữ 0').toBe(0)
            expect(got[q(8)]).toBe(0)
        }
        await step()
    })

    test('TC-CELL-3 — mở lại dialog: về 永久歯 (frm902003 mới)', async () => {
        skipWithReason(!opened, 'không mở được 部位選択')
        // Dialog đang ở 乳歯 từ TC-CELL-2.
        await expect(fkey(/^F8\s*永久歯$/)).toBeVisible()
        await closeDialog()
        opened = await openFromBuiCell()
        skipWithReason(!opened, 'không mở lại được 部位選択')
        await expect(fkey(/^F8\s*乳歯$/), 'mở lại vẫn ở 乳歯 — web cũ không reset isMilk').toBeVisible()
        await step()
    })

    test('TC-CELL-4 — phím A đặt ô sữa: 全顎 (永久歯) giữ 11 ở ô đó; phím 1 đổi lại thành vĩnh viễn', async () => {
        skipWithReason(!opened, 'không mở được 部位選択')
        await fkey(/^F11\s*全消去$/).click()
        // Mở lại ⇒ vùng focus = RU; phím A = răng A = RU răng 1.
        await page.keyboard.press('a')
        expect((await readBui())[RU(1)], 'phím A phải cho 11 ở RU răng 1').toBe(11)

        await fkey(/^F7\s*全顎$/).click()
        const got = await readBui()
        console.log(`F7 sau phím A: ${fmt(got)}`)
        // Ô sữa: setBui ghi 1 → setter BuiVal đổi thành 11. RU1 bị SIGA đánh mất thì
        // setBui bỏ qua ô, giá trị vẫn là 11 từ phím A — cùng một kỳ vọng.
        expect(got[RU(1)], 'ô RU1 là ô SỮA (cờ riêng) — ghi 1 vào phải ra 11').toBe(11)
        const other = [2, 3, 4, 5, 6, 7].find((t) => !permMissing(RU(t)))
        if (other) expect(got[RU(other)], `RU${other} là ô vĩnh viễn — phải 1`).toBe(1)

        await page.keyboard.press('1')
        expect((await readBui())[RU(1)], 'phím 1 đổi ô thành vĩnh viễn: 11+1 qua setter → 1').toBe(1)
        await closeDialog()
        await step()
    })

    test('TC-CELL-5 — Backspace xoá răng bấm gần nhất; テンキー「-」 cũng xoá; 「-」 thường thì không', async () => {
        skipWithReason(!opened, 'không mở được 部位選択')
        if (!(await toothDialog.isVisible().catch(() => false))) {
            opened = await openFromBuiCell()
            skipWithReason(!opened, 'không mở lại được 部位選択')
        }
        await fkey(/^F11\s*全消去$/).click()
        // Vùng focus sau khi mở = RU. Bấm răng 3 rồi răng 4 ⇒ _idx = 4.
        await page.keyboard.press('3')
        await page.keyboard.press('4')
        await page.keyboard.press('Backspace')
        let got = await readBui()
        expect(got[RU(3)], 'răng 3 không phải răng bấm gần nhất — phải giữ').toBe(1)
        expect(got[RU(4)], 'Backspace phải xoá răng 4 (_idx)').toBe(0)

        await page.keyboard.press('Minus') // OemMinus — WinForm không bắt
        expect((await readBui())[RU(3)], '「-」 hàng số thường không được xoá').toBe(1)

        await page.keyboard.press('3') // RU3: 1 → 2, _idx = 3
        await page.keyboard.press('NumpadSubtract')
        got = await readBui()
        expect(got[RU(3)], 'テンキー「-」 phải xoá răng 3').toBe(0)
        await step()
    })

    test('TC-CELL-6 — click số răng (lblClrBui) xoá đúng răng đó', async () => {
        skipWithReason(!opened, 'không mở được 部位選択')
        await fkey(/^F11\s*全消去$/).click()
        await cells().nth(LD(6)).click()
        await cells().nth(LD(5)).click()
        expect((await readBui())[LD(6)]).toBe(1)
        await toothDialog.locator(`button[data-clear-bui="${LD(6)}"]`).click()
        const got = await readBui()
        expect(got[LD(6)], 'click số răng 6 (LD) phải xoá răng đó').toBe(0)
        expect(got[LD(5)], 'răng bên cạnh giữ nguyên').toBe(1)
        await closeDialog()
        await step()
    })
})
