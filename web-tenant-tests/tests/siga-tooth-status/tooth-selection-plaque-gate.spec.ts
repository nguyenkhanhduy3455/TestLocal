import { type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from '../_shared/db'
import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 部位選択 (frm902003) — gate Ｐ部位 (buiPlaque) cho các phím chọn dải F1〜F7 và F10 反転.
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - frm203002.OpenDialogBuiAndByou (:1706-1744): mở từ ô 部位 của lưới, truyền
 *    `buiPlaque` = 部位 của dòng 病検 ĐẦU TIÊN chưa chia (cột 45 = "0") có 病名 đầu
 *    là Ｐ(103)/単Ｇ(104) — tức dòng Ｐ部位 đứng đầu tab 病検.
 *  - frm902003.Load (:595-620): `_plaqueData` = buiPlaque; nếu buiPlaque toàn 0
 *    (未設定) thì `_plaqueData` = 1 cho răng 1..`_maxBuicnt` (7 khi 全部位モード=0).
 *  - frm902003.setBui (:776-901): F1〜F7 LUÔN quét răng 1..8 (`setBui(1, 8, …)`), và
 *    chỉ điền răng khi `_plaqueData == 1` (vĩnh viễn) / `!= 0` (sữa) VÀ răng không
 *    mất (SIGA se != 4 / sn != 9). ⇒ Việc bỏ 智歯 ở chế độ 7 răng là NHỜ plaque mặc
 *    định; có Ｐ部位 thì chính Ｐ部位 quyết định, kể cả 智歯.
 *  - frm902003.btnF10_Click 反転 (:354-385): răng trống → bật, riêng 智歯 (i == 7)
 *    chỉ bật khi `_plaqueData == 1`. 反転 KHÔNG xét SIGA.
 *  - 病検 変更 (frm203002.cs:6255-6266) mở frm902003 kiểu Cct và KHÔNG truyền
 *    buiPlaque ⇒ luôn là plaque mặc định.
 *
 * ─── Web ─────────────────────────────────────────────────────────────────────
 *  lib/byoken-plaque.ts chọn dòng Ｐ部位 (dùng chung với tab 病検);
 *  treatment-entry-detail truyền `plaqueBui` khi mở từ ô 部位 (không truyền khi đang
 *  病検 変更); tooth-selection-dialog dựng `plaqueGate` + gate trong selectRange/反転.
 *  Trước khi sửa: không có gate, F1〜F7 cắt dải theo 全部位モード.
 *
 * ─── Không ghi DB ────────────────────────────────────────────────────────────
 *  Ｐ部位 được ép bằng cách vá response `GET /tenant/patients/{patNo}/diagnosis-history`
 *  (bỏ hết bản ghi Ｐ/単Ｇ thật, tuỳ testcase chèn một bản ghi Ｐ giả mới nhất).
 *  Không bấm 確定 (End) — mọi testcase đóng dialog bằng F12 戻る.
 *  SIGA (`GET /tenant/siga`) đi thật, spec đọc lại để tính răng mất vào kỳ vọng.
 *  TEST_DB=1: seed 再診 hôm nay (disp_no >= 9000, afterAll dọn) để có dòng tháng hiện
 *  hành mà click ô 部位. Không có TEST_DB và tháng trống ⇒ nhóm ô 部位 tự skip.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/siga-tooth-status/tooth-selection-plaque-gate.spec.ts --retries=0
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

const DIAG_HISTORY_URL = /\/tenant\/patients\/\d+\/diagnosis-history(\?|$)/
const SIGA_URL = /\/tenant\/siga(\?|$)/

const COL_BUI = 1
/** rowKey dòng THÁNG CŨ; dòng tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** SIGA: răng vĩnh viễn mất (frm902003 `_sigaData.buiXX[i] != 4`). */
const SE_MISSING = 4
const PLAQUE_DIS_CDS = [103, 104]

/** bui[32]: RU 0..7 = răng 8..1, LU 8..15 = 1..8, RD 16..23 = 8..1, LD 24..31 = 1..8. */
const RU = (t: number) => 8 - t
const LU = (t: number) => 8 + t - 1
const RD = (t: number) => 16 + 8 - t
const LD = (t: number) => 24 + t - 1
const QUADS = [RU, LU, RD, LD] as const
const toothNumOf = (i: number) => (i < 8 || (i >= 16 && i < 24) ? 8 - (i % 8) : (i % 8) + 1)

/** Ｐ部位 giả của testcase: có 智歯 RU8, và thiếu phần lớn răng khác. */
const FAKE_PLAQUE_TEETH = [RU(8), RU(1), LU(2), LD(3), LD(8)]

interface DiagItem {
    dspBui?: string
    dspDis?: string
    maxDate: string
    bui?: (number | string)[] | null
    disCd?: (number | string)[] | null
    disSb?: (number | string)[] | null
}

async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('部位選択 — gate Ｐ部位 cho F1〜F7 / F10 反転 (frm902003 _plaqueData)', () => {
    let page: Page
    let step: () => Promise<void>
    let toothDialog: Locator
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Ｐ部位 mà route sẽ trả cho lần đọc diagnosis-history kế tiếp; null = không có. */
    let plaqueForNextRead: number[] | null = null
    /** se[32] mới nhất đọc được từ /tenant/siga. */
    let siga: { se: number[] } | null = null

    const diagHandler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        const json = (await res.json()) as { data?: DiagItem[] }
        const items = (json.data ?? []).filter(
            (i) => !PLAQUE_DIS_CDS.includes(Number(i.disCd?.[0] ?? 0)),
        )
        if (plaqueForNextRead) {
            items.unshift({
                dspBui: 'E2E Ｐ部位',
                dspDis: 'Ｐ',
                maxDate: '2099-12-31T00:00:00',
                bui: plaqueForNextRead,
                disCd: [103, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                disSb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            })
        }
        await route.fulfill({ response: res, json: { ...json, data: items } })
    }

    const sigaHandler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        const json = (await res.json()) as { data?: { se?: unknown[] } | null }
        siga = { se: Array.from({ length: 32 }, (_, i) => Number(json.data?.se?.[i] ?? 0)) }
        await route.fulfill({ response: res })
    }

    const permMissing = (i: number) => siga !== null && siga.se[i] === SE_MISSING

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
            await karte
                .first()
                .getByRole('button', { name: /F10\s*戻る/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    /** Mở lại 診療入力 với Ｐ部位 cho trước (reload ⇒ cache react-query sạch). */
    async function openEntry(plaque: number[] | null) {
        plaqueForNextRead = plaque
        const diagRead = page.waitForResponse(
            (r) => DIAG_HISTORY_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: GRID_LOAD_TIMEOUT },
        )
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await diagRead
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
    }

    /** rowKey của dòng tháng hiện hành đầu tiên (không phải dòng tổng). */
    async function currentMonthRowKey(): Promise<string | null> {
        const keys = await page
            .locator(`[data-grid-cell$="|${COL_BUI}"]`)
            .evaluateAll((els) =>
                els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')),
            )
        return keys.find((k) => k && !k.includes(':') && !/^\d+-\d+$/.test(k)) ?? null
    }

    /** Click ô 部位 (một lần) — WinForm grdRegi_CellClick → OpenDialogBuiAndByou. */
    async function openFromBuiCell(): Promise<boolean> {
        const key = await currentMonthRowKey()
        if (!key) return false
        await drainSanteiDialogs()
        await page.locator(`[data-grid-cell="${key}|${COL_BUI}"]`).click()
        return appeared(toothDialog, 20_000)
    }

    const fkey = (name: RegExp) => toothDialog.getByRole('button', { name }).first()

    /** Trạng thái 32 ô răng, theo thứ tự bui[32] (DOM: RU, LU, RD, LD). */
    async function readBui(): Promise<number[]> {
        const cells = toothDialog.locator('button.w-10.h-10')
        await expect(cells).toHaveCount(32)
        const titles = await cells.evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))
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

    const fmt = (b: number[]) =>
        QUADS.map((q, qi) => `${['RU', 'LU', 'RD', 'LD'][qi]}:` + [1, 2, 3, 4, 5, 6, 7, 8].map((t) => b[q(t)]).join('')).join(' ')

    test.beforeAll(async ({ authedPage }) => {
        if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), TODAY, [...SEED_ROWS])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        toothDialog = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ })
        await page.route(DIAG_HISTORY_URL, diagHandler)
        await page.route(SIGA_URL, sigaHandler)
    })

    test.afterAll(async () => {
        await closeDialog().catch(() => {})
        await page.unroute(DIAG_HISTORY_URL, diagHandler).catch(() => {})
        await page.unroute(SIGA_URL, sigaHandler).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (dbEnabled) await deleteTreatmentRows(Number(PAT_NO), TODAY)
    })

    test('TC-PLQ-1 — không có Ｐ部位: 全顎 điền răng 1..7 (trừ răng mất), 智歯 để trống', async () => {
        await openEntry(null)
        const opened = await openFromBuiCell()
        skipWithReason(!opened, 'không có dòng tháng hiện hành để click ô 部位 (bật TEST_DB=1 để spec tự seed)')
        if (!opened) return

        await fkey(/^F11\s*全消去$/).click()
        await fkey(/^F7\s*全顎$/).click()
        const got = await readBui()
        console.log(`F7 (không Ｐ部位): ${fmt(got)}`)
        for (const q of QUADS) {
            for (let t = 1; t <= 7; t++) {
                expect(got[q(t)], `răng ${t} (idx ${q(t)})`).toBe(permMissing(q(t)) ? 0 : 1)
            }
            expect(got[q(8)], `智歯 idx ${q(8)} phải trống khi Ｐ部位 未設定 (7 răng)`).toBe(0)
        }
        await closeDialog()
        await step()
    })

    test('TC-PLQ-2 — có Ｐ部位: 全顎 CHỈ điền răng thuộc Ｐ部位, kể cả 智歯', async () => {
        const plaque = new Array<number>(32).fill(0)
        for (const i of FAKE_PLAQUE_TEETH) plaque[i] = 1
        await openEntry(plaque)
        const opened = await openFromBuiCell()
        skipWithReason(!opened, 'không mở được 部位選択 từ ô 部位')
        if (!opened) return

        await fkey(/^F11\s*全消去$/).click()
        await fkey(/^F7\s*全顎$/).click()
        const got = await readBui()
        const want = plaque.map((v, i) => (v === 1 && !permMissing(i) ? 1 : 0))
        console.log(`F7 (Ｐ部位 ${fmt(plaque)}): ${fmt(got)}`)
        expect(
            got,
            '全顎 phải khớp đúng Ｐ部位 (trừ răng mất) — điền cả răng ngoài Ｐ部位 là thiếu gate _plaqueData',
        ).toEqual(want)
        await step()
    })

    test('TC-PLQ-3 — có Ｐ部位: F5 (右 N～1) chỉ điền răng Ｐ部位 bên phải của hàm đang chọn', async () => {
        // Dialog còn mở từ TC-PLQ-2; vùng focus mặc định là RU (hàm trên).
        const plaque = new Array<number>(32).fill(0)
        for (const i of FAKE_PLAQUE_TEETH) plaque[i] = 1
        if (!(await toothDialog.isVisible().catch(() => false))) {
            await openEntry(plaque)
            skipWithReason(!(await openFromBuiCell()), 'không mở được 部位選択 từ ô 部位')
        }
        await fkey(/^F11\s*全消去$/).click()
        await fkey(/^F5\s/).click()
        const got = await readBui()
        const want = new Array<number>(32).fill(0)
        for (let t = 1; t <= 8; t++) {
            const i = RU(t)
            if (plaque[i] === 1 && !permMissing(i)) want[i] = 1
        }
        console.log(`F5 (Ｐ部位): ${fmt(got)}`)
        expect(got, 'F5 phải quét RU răng 1..8 và gate theo Ｐ部位').toEqual(want)
        await step()
    })

    test('TC-PLQ-4 — 反転 với Ｐ部位: chỉ 智歯 bị gate, răng khác bật hết (không xét SIGA)', async () => {
        const plaque = new Array<number>(32).fill(0)
        for (const i of FAKE_PLAQUE_TEETH) plaque[i] = 1
        if (!(await toothDialog.isVisible().catch(() => false))) {
            await openEntry(plaque)
            skipWithReason(!(await openFromBuiCell()), 'không mở được 部位選択 từ ô 部位')
        }
        await fkey(/^F11\s*全消去$/).click()
        await fkey(/^F10\s*反転$/).click()
        const got = await readBui()
        const want = Array.from({ length: 32 }, (_, i) =>
            toothNumOf(i) === 8 ? (plaque[i] === 1 ? 1 : 0) : 1,
        )
        console.log(`F10 (Ｐ部位): ${fmt(got)}`)
        expect(got, '反転: 智歯 chỉ bật khi Ｐ部位 có nó (RU8, LD8); các răng khác luôn bật').toEqual(want)
        await closeDialog()
        await step()
    })

    test('TC-PLQ-5 — 病検 変更 mở 部位選択 KHÔNG mang Ｐ部位 (InputType.Cct) ⇒ plaque mặc định', async () => {
        // Chỉ chứa RU1: nếu dialog (sai) gate theo Ｐ部位 thì 全顎 chỉ ra đúng một răng.
        const plaque = new Array<number>(32).fill(0)
        plaque[RU(1)] = 1
        await openEntry(plaque)

        await page.getByRole('button', { name: '病検', exact: true }).click()
        const changeBtn = page.getByRole('button', { name: '変更', exact: true })
        skipWithReason(!(await appeared(changeBtn, 15_000)), 'tab 病検 không có nút 変更')
        await changeBtn.click()
        const byoRows = page.locator('div[class*="grid-cols-[44px_270px_1fr]"]')
        skipWithReason(!(await appeared(byoRows.nth(1), 20_000)), 'tab 病検 rỗng')
        await byoRows.nth(1).click()
        skipWithReason(!(await appeared(toothDialog, 20_000)), '病検 変更 không mở 部位選択')

        await fkey(/^F11\s*全消去$/).click()
        await fkey(/^F7\s*全顎$/).click()
        const got = await readBui()
        console.log(`F7 (病検 変更): ${fmt(got)}`)
        for (const q of QUADS) {
            for (let t = 1; t <= 7; t++) {
                expect(
                    got[q(t)],
                    `病検 変更 không truyền buiPlaque — răng ${t} (idx ${q(t)}) phải được điền`,
                ).toBe(permMissing(q(t)) ? 0 : 1)
            }
            expect(got[q(8)]).toBe(0)
        }
        await closeDialog()
        // 変更 mode tự tắt khi đóng 部位選択 mà không sang 病名選択 (web + WinForm).
        await step()
    })
})
