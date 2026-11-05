/**
 * 領収書印刷 F3 診療内容ﾖﾘ (frm204004.getTrnTrn) — số liệu phải do CÙNG engine 一部負担金 tính
 * (buiPrice.getBuiPrice2), mỗi cặp (診療日, 枝番):
 *  - 保険: khi bur_rate ≠ acc_rate (không 公費) 窓口負担 tính theo 会計割合 acc_rate
 *    (buiPrice.cs:667-670: ins_copayment_round = score × 10 × acc_rate / 100), làm tròn 10円.
 *  - 自費: jihiPrice + jihiTax của engine (không còn thuế 10% cố định).
 *  - Dòng chỉ ra khi insScore > 0 hoặc jihiPrice > 0; 診療開始日 / 終了日 = ngày duyệt.
 *
 * Dữ liệu: 990983, acc_rate 30 / bur_rate 20 (khác nhau để chạm đúng nhánh :667);
 * hôm nay: 保険 100点 + 自費 500円. Chỉ ĐỌC (F3 không ghi), nên không cần TEST_ALLOW_SAVE.
 */
import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 983
// Ngày kinh doanh của tenant (JST) — hộp 領収書印刷 mở sẵn với 診療日 = hôm nay.
const TODAY = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + 処置 + unpaid riêng')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let page: Page
let step: () => Promise<void>

async function cleanup(): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
    })
}

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　診療内容', patKn: 'せいさん　しんりょうないよう', accRate: 30 })
    await withDb((c) => c.query('UPDATE insurance SET bur_rate = 20, acc_rate = 30 WHERE pat_no = $1', [PAT_NO]))
    await seedTreatmentRows(PAT_NO, TODAY, [
        { trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 100, dspTrt: '処置-診療内容E2E保険' },
        { trtCd: 210, trtSb: 0, trtCnt: 1, trtPt: 500, jihiFlg: 1, dspTrt: '処置-診療内容E2E自費' },
    ])
    await cleanup()
    await withDb((c) =>
        c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                 rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
             VALUES ($1::date, 1, $2, 40, 300, 900, 0, 0, -1, 1, 1, 1, now(), 1, 0, 50, 250)`,
            [TODAY, PAT_NO],
        ),
    )
})

test.afterAll(async () => {
    await cleanup()
    await deleteTestPatient(PAT_NO)
    await releaseSharedPage(page)
})

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const block = (header: string): Locator =>
    page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
const scoreTotal = (): Locator => block('初・再診料').nth(7)

async function openScreen(): Promise<void> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        try {
            await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            await expect
                .poll(async () => Number((await scoreTotal().inputValue()).replace(/,/g, '') || '0'), { message: 'chờ unpaid nạp xong' })
                .toBeGreaterThan(0)
            await step()
            return
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr
}

test.describe('領収書印刷 F3 診療内容ﾖﾘ', () => {
    test('R-1 — 保険 theo 会計割合 (100点 × 30% = 300), 自費 theo engine, ユニット Σ = 100, khoảng ngày = hôm nay', async () => {
        await openScreen()
        await fkey('F1').click()
        const received = page.waitForResponse((r) => r.url().includes('treatment-receipt') && r.status() === 200)
        await fkey('F3').click()
        const body = (await (await received).json()) as {
            data: {
                rows: { hoken: number; jihi: number; jihiTax: number; lflg: number }[]
                totalHoken: number
                totalJihi: number
                totalJihiTax: number
                totalKaigo: number
                unitScores: number[]
                trtDtSt: string | null
                trtDtEnd: string | null
            }
        }
        const d = body.data

        expect(d.rows, 'một dòng 保険/自費 cho ngày hôm nay').toHaveLength(1)
        expect(d.rows[0].hoken, '100点 × 10 × acc_rate 30% (bur_rate ≠ acc_rate ⇒ 会計割合)').toBe(300)
        expect(d.rows[0].jihi, '自費 = 500').toBe(500)
        expect(d.rows[0].jihiTax, 'thuế 自費 do engine tính').toBe(d.totalJihiTax)
        expect(d.totalHoken).toBe(300)
        expect(d.totalJihi).toBe(500)
        expect(d.totalKaigo, 'không có 介護').toBe(0)
        expect(
            d.unitScores.reduce((a, b) => a + b, 0),
            'Σ 14 ユニット = 点数 保険 (jihi_flg = 0)',
        ).toBe(100)
        expect([d.trtDtSt, d.trtDtEnd]).toEqual([TODAY, TODAY])
    })
})
