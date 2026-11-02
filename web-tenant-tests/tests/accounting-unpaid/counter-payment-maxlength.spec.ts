/**
 * 窓口精算 — số ký tự tối đa của ô nhập khớp WinForm (frm204002.designer.cs MaxLength).
 *
 *   txtAccRate 負担率                      MaxLength = 3   (:1695)
 *   txtSc1-14 / txtScore / txtAmount* /
 *   txtDiscount* / txtTaxJ / txtRepay*     MaxLength = 7   (vd txtAmountJ :1506)
 *   txtRece 本日入金 / txtAppr              MaxLength = 8   (:724 / :781)
 *
 * MaxLength chỉ chặn GÕ PHÍM ⇒ gõ dư một ký tự rồi đọc lại. Mỗi mức một ô đại diện,
 * vào ô bằng đúng phím WinForm dùng: F3 (請求 mode) → txtAccRate, F4 → txtAmountJ,
 * F7 → txtRece (frm204002.cs:925-1054). Vế WinForm đo ở fla-ui-tests
 * Tests/Seisan/SeisanStaticUiTests.Tc1f.
 *
 * Không bấm F9 — spec không ghi acc_dat.
 */
import { type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 36
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân 精算 riêng')

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('窓口精算 — MaxLength ô nhập khớp WinForm', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン桁数　患者', patKn: 'せいさんけたすう　かんじゃ' })
        // seisan-info INNER JOIN trn_trn — thiếu là màn ra 404.
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算桁数E2E' },
        ])
        await openDetail()
    })

    test.afterAll(async () => {
        await deleteTestPatient(PAT_NO)
        await withDb(async (c) => {
            await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        })
        await releaseSharedPage(page)
    })

    async function openDetail(): Promise<void> {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({
                    timeout: SCREEN_LOAD_TIMEOUT,
                })
                // Nạp xong màn tự focus 自費金額/本日入金 sau 200ms (counter-payment-detail.tsx
                // setTimeout … focus) — bấm F-key trước mốc đó thì focus bị cướp lại.
                await expect
                    .poll(() => page.evaluate(() => document.activeElement?.tagName), { timeout: 10_000 })
                    .toBe('INPUT')
                await step()
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    /** Gõ đè `typed` vào ô đang focus, trả về giá trị đọc lại. */
    async function typeIntoFocused(typed: string): Promise<string> {
        await page.keyboard.press('ControlOrMeta+a')
        await page.keyboard.press('Backspace')
        await page.keyboard.type(typed)
        return page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value ?? '')
    }

    const cases = [
        { key: 'F3', field: 'txtAccRate 負担率', max: 3 },
        { key: 'F4', field: 'txtAmountJ 自費金額', max: 7 },
        { key: 'F7', field: 'txtRece 本日入金', max: 8 },
    ] as const

    for (const c of cases) {
        test(`${c.field}: gõ ${c.max + 1} ký tự chỉ nhận ${c.max} (MaxLength = ${c.max})`, async () => {
            await page.keyboard.press(c.key)
            await step()
            const value = await typeIntoFocused('1'.repeat(c.max + 1))
            expect(value, `${c.field} — ô focus sau ${c.key} nhận được 「${value}」`).toBe('1'.repeat(c.max))
            if (c.key === 'F7') await captureFixedUi(page, 'counter-payment-maxlength-rece')
        })
    }
})
