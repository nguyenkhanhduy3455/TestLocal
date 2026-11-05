import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteTestPatient,
    SEED_PAT_NO_BASE,
    seedTestPatient,
    seedTreatmentRows,
} from '../_shared/db'
import { patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * ガイド処置選択 (frm203017) — インレー rows are gated by 算定単位 per tooth.
 *
 * frm203017 `ucToothGuide_Changed` case 2 (1696-1712): for each tooth with a cavity,
 * the rows of group 2 (複雑) / 3 (単純) are tried in order and the FIRST row whose
 * 算定単位 counts THAT tooth (`CalcCnt.getCalcCnt(unit, tooth alone) > 0`) gets +1.
 *
 * ガイド 10090 「インレーセット」 (病名 Ｃ) holds, per group, 251 (front +
 * premolar), 258 (same), 256 and 254 (molar). For a MOLAR (右上6) the first row (251)
 * does not count the tooth, so the count must land on the first row that does. The old
 * web code always incremented the first row (251), and a React Compiler post-increment
 * miscompile then shifted the count one row down.
 *
 * Own data: one patient in the seed range with a single 部位病名行 on 右上6 + 病名 Ｃ.
 * Needs TEST_DB=1. Never presses F9 / Escape.
 */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 995))
const TRT_DT = trtDt('2026-07-20')

const DIS_CD_C = 100
const DIS_SB_C1 = 1
/** Slot 2 of the 32-cell layout = 右上6 (slots 0-7 are 右上 8..1). */
const MOLAR_SLOT = 2
const GUIDE_NAME = 'インレーセット'
const GUIDE_CD = 10090
/** mst_trt_grp 9992 / 9993 → group index 2 (複雑) / 3 (単純). */
const GRP_INLAY_COMPLEX = 2
const GRP_INLAY_SIMPLE = 3
/** First row of each group (unit 15: does not count a molar). */
const TRT_CD_FRONT_ROW = 251

interface GuideTrtWire {
    trtCd: number | string
    trtSb: number | string
    grpIdx: number | string
    calcToothMask: number | string
}

test.skip(!dbEnabled, 'Needs TEST_DB=1: the spec seeds its own patient and 部位病名行.')

test.describe.configure({ mode: 'serial' })

test.describe('ガイド処置選択 — インレー 算定単位 gate per tooth', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined
    let picker: Locator
    let items: GuideTrtWire[] = []

    const rows = () => picker.locator('[data-testid^="row-"]')

    /** 回数 of every row keyed `${trtCd}-${trtSb}` (the cell is an <input>). */
    async function counts(): Promise<Map<string, number>> {
        const out = new Map<string, number>()
        const n = await rows().count()
        for (let i = 0; i < n; i++) {
            const row = rows().nth(i)
            const key = ((await row.getAttribute('data-testid')) ?? '').replace(/^row-/, '')
            out.set(key, Number(await row.locator('[data-testid="cell-cnt"] input').inputValue()))
        }
        return out
    }

    /** Key of the row with `trtCd` inside cavity group `grp`, from the response. */
    function keyOf(grp: number, trtCd: number): string {
        const it = items.find((x) => Number(x.grpIdx) === grp && Number(x.trtCd) === trtCd)
        expect(it, `ガイド ${GUIDE_CD} must have trtCd ${trtCd} in group ${grp}`).toBeTruthy()
        return `${it!.trtCd}-${it!.trtSb}`
    }

    /** Legacy rule: the FIRST row of the group (response order) whose mask counts the tooth. */
    function firstCountingKey(grp: number, toothSlot: number): string {
        const it = items
            .filter((x) => Number(x.grpIdx) === grp)
            .find((x) => ((Number(x.calcToothMask) >> toothSlot) & 1) === 1)
        expect(it, `group ${grp} must have a row counting tooth slot ${toothSlot}`).toBeTruthy()
        return `${it!.trtCd}-${it!.trtSb}`
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: Number(PAT_NO) })
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: '',
                bui: Array.from({ length: 32 }, (_, i) => (i === MOLAR_SLOT ? 1 : 0)),
                dspBui: '６',
                disCd: [DIS_CD_C],
                disSb: [DIS_SB_C1],
                dspDis: 'Ｃ',
            },
        ])

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        picker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })

        page.on('response', (res) => {
            if (!res.url().includes('/tenant/guids/treatments')) return
            if (new URL(res.url()).searchParams.get('GuidCd') !== String(GUIDE_CD)) return
            void res
                .json()
                .then((j: { data?: { items?: GuideTrtWire[] } }) => {
                    if (j.data?.items) items = j.data.items
                })
                .catch(() => {})
        })

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 })
            await page.waitForTimeout(700)
        }
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await deleteTestPatient(Number(PAT_NO)).catch((e) =>
            console.log(`cleanup of test patient ${PAT_NO} failed: ${(e as Error).message}`),
        )
    })

    test('molar cavity lands on the first row whose 算定単位 counts the tooth, not on the first row', async () => {
        await page.keyboard.press('F4')
        const guideRows = page
            .locator('div[class*="w-[450px]"]')
            .first()
            .locator('div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]')
        await expect(guideRows.first()).toBeVisible({ timeout: 30000 })

        const target = guideRows.filter({ hasText: GUIDE_NAME }).first()
        await expect(target, `ガイド 「${GUIDE_NAME}」 must be listed for 病名 Ｃ`).toBeVisible({
            timeout: 30000,
        })
        await target.click()
        await expect(picker.getByTestId('cell-trtNm').first()).toBeVisible({ timeout: 30000 })
        await expect.poll(() => items.length, { timeout: 10000 }).toBeGreaterThan(0)

        const simpleFront = keyOf(GRP_INLAY_SIMPLE, TRT_CD_FRONT_ROW)
        const complexFront = keyOf(GRP_INLAY_COMPLEX, TRT_CD_FRONT_ROW)
        const simpleTarget = firstCountingKey(GRP_INLAY_SIMPLE, MOLAR_SLOT)
        const complexTarget = firstCountingKey(GRP_INLAY_COMPLEX, MOLAR_SLOT)
        expect(simpleTarget, 'the molar must skip the unit-15 front row').not.toBe(simpleFront)
        expect(complexTarget, 'the molar must skip the unit-15 front row').not.toBe(complexFront)

        const svg = picker.locator('svg[viewBox="0 0 100 100"]').first()

        // 単純 cavity: only the centre circle (咬合面 O).
        await svg.locator('circle').first().click()
        const simple = await counts()
        expect(simple.get(simpleTarget), '単純 inlay on a molar → first row counting it').toBe(1)
        expect(simple.get(simpleFront), 'first row (unit 15) does not count a molar').toBe(0)

        // 複雑 cavity: add the wedges (they include M / D) → the tooth moves to group 2.
        const wedges = svg.locator('path')
        const wedgeCount = await wedges.count()
        for (let i = 0; i < wedgeCount; i++) await wedges.nth(i).click()
        const complex = await counts()
        expect(complex.get(complexTarget), '複雑 inlay on a molar → first row counting it').toBe(1)
        expect(complex.get(complexFront), 'first row (unit 15) does not count a molar').toBe(0)
        expect(complex.get(simpleTarget), 'group 3 is reset when the tooth turns 複雑').toBe(0)

        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
    })
})
