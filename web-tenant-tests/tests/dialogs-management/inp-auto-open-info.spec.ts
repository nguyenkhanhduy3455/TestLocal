import { type Page, type Route } from '@playwright/test'

import { SEED_PAT_NO_BASE, deleteTestPatient, seedTestPatient, seedTreatmentRows } from '../_shared/db'
import { ryoCells } from '../_shared/entry'
import { TODAY_ISO, trtDt } from '../_shared/env'
import { INP_FLAG } from '../_shared/inp-device-settings'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * 診療入力設定 -> tự mở 治療情報 / 歯周情報, nạp + lưu 一初診内, 薬剤学習 trên 薬剤選択.
 *
 * Kỳ vọng bám WinForm (src/OCHACOM/INP):
 *  - frm203002.cs:3161  `pInpOpt[51] == 1` (Dcond)  -> Shown mở frm203031 (治療情報).
 *  - frm203002.cs:3214  `pInpOpt[16] == 1` (PCond)  -> Activated mở frm203032 (歯周情報)
 *    CHỈ KHI ModMain.GetPlaqueTreatData() có dữ liệu (120/121/124/125-0 từ 初診 trở đi).
 *  - frm203031.cs:167 / :110  một 初診内 nạp DcondMode khi mở, ghi lại khi đóng.
 *  - pInpOpt[...] Intellidrg -> thứ tự use_cnt của 薬剤選択; FE gửi `intellidrg` lên BE.
 *
 * KHÔNG ghi DB tenant: GET/PUT /tenant/settings/inp bị chặn (PUT trả lại bản GET cuối),
 * chỉ bệnh nhân seed 990000+ được ghi và xoá hẳn ở afterAll. Không bấm F9 登録, không in.
 *
 * Đóng dialog bằng F10 (Escape của 診療入力 = End = 登録).
 */

const PAT_EXAM = SEED_PAT_NO_BASE + 230 // có Ｐ混検 (120) trong tháng
const PAT_PLAIN = SEED_PAT_NO_BASE + 231 // chỉ có 再診料
const TRT_DT = trtDt(TODAY_ISO)

const SETTINGS_INP_URL = /\/tenant\/settings\/inp(\?|$)/

test.describe('診療入力 — tự mở 治療情報 / 歯周情報 và 一初診内', () => {
    let page: Page
    let devicePatch: Record<string, number>
    let disposeOverlays: () => Promise<void>

    /** Bản GET cuối + thân PUT đã chặn, để assert thứ FE định ghi. */
    let lastGet: { data: { clinic: Record<string, unknown>; device: Record<string, unknown> } } | null
    let putBodies: Array<{ clinic: Record<string, unknown>; device: Record<string, unknown> }>
    let clinicPatch: Record<string, number>

    const treatmentInfo = () => page.getByRole('dialog').filter({ hasText: '治療情報' })
    const perioInfo = () => page.getByRole('dialog').filter({ hasText: '歯周情報' })

    /** Một handler: vá device + clinic của GET; PUT bị chặn (trả lại bản GET cuối). */
    async function routeSettings() {
        await page.route(SETTINGS_INP_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() === 'PUT') {
                putBodies.push(req.postDataJSON())
                return route.fulfill({ json: lastGet })
            }
            if (req.method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const json = (await res.json()) as NonNullable<typeof lastGet>
            Object.assign(json.data.clinic, clinicPatch)
            Object.assign(json.data.device, devicePatch)
            lastGet = json
            await route.fulfill({ response: res, json })
        })
    }

    /** Vào màn 診療入力 và chờ cả cài đặt lẫn lưới nạp xong (không dùng closeDialogs). */
    async function openEntry(patNo: number) {
        const settings = page.waitForResponse(
            (r) => SETTINGS_INP_URL.test(r.url()) && r.request().method() === 'GET',
        )
        await page.goto(`/treatments/${patNo}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await settings
        await expect(ryoCells(page).first()).toBeVisible({ timeout: 60_000 })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: false })
        await routeSettings()
        for (const patNo of [PAT_EXAM, PAT_PLAIN]) {
            await seedTestPatient({ patNo })
        }
        await seedTreatmentRows(PAT_EXAM, TRT_DT, [
            { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' },
            { trtCd: 120, trtSb: 0, trtPt: 0, trtCnt: 1, dspTrt: 'Ｐ混検' },
        ])
        await seedTreatmentRows(PAT_PLAIN, TRT_DT, [
            { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' },
        ])
    })

    test.beforeEach(() => {
        lastGet = null
        putBodies = []
        clinicPatch = { dcondMode: INP_FLAG.Off }
        devicePatch = {}
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        for (const patNo of [PAT_EXAM, PAT_PLAIN]) await deleteTestPatient(patNo)
        await releaseSharedPage(page)
    })

    test('TC-1 — dcond=1: 治療情報 tự mở khi vào màn', async () => {
        devicePatch = { dcond: INP_FLAG.On, pCond: INP_FLAG.Off }
        await openEntry(PAT_PLAIN)
        await expect(treatmentInfo()).toBeVisible({ timeout: 15_000 })
        await expect(perioInfo()).toHaveCount(0)
    })

    test('TC-2 — dcond=9: 治療情報 không tự mở', async () => {
        devicePatch = { dcond: INP_FLAG.Off, pCond: INP_FLAG.Off }
        await openEntry(PAT_PLAIN)
        await page.waitForTimeout(1500)
        await expect(treatmentInfo()).toHaveCount(0)
    })

    test('TC-3 — pCond=1 và có Ｐ混検: 歯周情報 tự mở', async () => {
        devicePatch = { dcond: INP_FLAG.Off, pCond: INP_FLAG.On }
        await openEntry(PAT_EXAM)
        await expect(perioInfo()).toBeVisible({ timeout: 15_000 })
    })

    test('TC-4 — pCond=1 nhưng chưa có 歯周病検査: 歯周情報 không mở (GetPlaqueTreatData rỗng)', async () => {
        devicePatch = { dcond: INP_FLAG.Off, pCond: INP_FLAG.On }
        await openEntry(PAT_PLAIN)
        await page.waitForTimeout(1500)
        await expect(perioInfo()).toHaveCount(0)
    })

    test('TC-5 — pCond=9 dù có Ｐ混検: 歯周情報 không mở', async () => {
        devicePatch = { dcond: INP_FLAG.Off, pCond: INP_FLAG.Off }
        await openEntry(PAT_EXAM)
        await page.waitForTimeout(1500)
        await expect(perioInfo()).toHaveCount(0)
    })

    test('TC-6 — 一初診内 nạp từ clinic dcondMode=1 khi mở', async () => {
        clinicPatch = { dcondMode: INP_FLAG.On }
        devicePatch = { dcond: INP_FLAG.On, pCond: INP_FLAG.Off }
        await openEntry(PAT_PLAIN)
        await expect(treatmentInfo()).toBeVisible({ timeout: 15_000 })
        await expect(treatmentInfo().getByRole('checkbox', { name: '一初診内' })).toBeChecked()
    })

    test('TC-7 — đổi 一初診内 rồi F10: ghi dcondMode=1, giữ nguyên device; không đổi thì không ghi', async () => {
        devicePatch = { dcond: INP_FLAG.On, pCond: INP_FLAG.Off, guidMode: INP_FLAG.On }
        await openEntry(PAT_PLAIN)
        await expect(treatmentInfo()).toBeVisible({ timeout: 15_000 })

        // Đóng không đổi -> không PUT.
        await page.keyboard.press('F10')
        await expect(treatmentInfo()).toHaveCount(0)
        expect(putBodies).toHaveLength(0)

        // Mở lại bằng dấu Ｔ không có sẵn selector ổn định -> nạp lại màn, đổi rồi đóng.
        await openEntry(PAT_PLAIN)
        await expect(treatmentInfo()).toBeVisible({ timeout: 15_000 })
        await treatmentInfo().getByRole('checkbox', { name: '一初診内' }).click()
        await page.keyboard.press('F10')
        await expect.poll(() => putBodies.length, { timeout: 10_000 }).toBe(1)
        expect(putBodies[0]!.clinic.dcondMode).toBe(INP_FLAG.On)
        // PUT thay cả hai tầng: device phải mang đúng giá trị đang hiệu lực, không phải mặc định.
        expect(putBodies[0]!.device.dcond).toBe(INP_FLAG.On)
        expect(putBodies[0]!.device.guidMode).toBe(INP_FLAG.On)
    })

    for (const flag of [INP_FLAG.On, INP_FLAG.Off]) {
        test(`TC-8 — intellidrg=${flag}: GET yaku-select gửi intellidrg=${flag}`, async () => {
            devicePatch = { dcond: INP_FLAG.Off, pCond: INP_FLAG.Off, intellidrg: flag }
            await openEntry(PAT_PLAIN)
            const req = page.waitForRequest(
                (r) => r.url().includes('/tenant/treatment/yaku-select') && r.method() === 'GET',
                { timeout: 30_000 },
            )
            await page.keyboard.press('Shift+F6')
            expect(new URL((await req).url()).searchParams.get('intellidrg')).toBe(String(flag))
            await page.keyboard.press('F10')
        })
    }
})
