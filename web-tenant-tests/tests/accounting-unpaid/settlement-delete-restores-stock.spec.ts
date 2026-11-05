/**
 * 精算データ修正 F8 削除 (frm204004.deleteProc) — 物品在庫:
 *  - Chỉ dòng 物品 (km_cd 59) có gds_cd ≠ 0 mới ghi lại goods_stock_history (+gds_cnt, pat_no = 患者),
 *    và KHÔNG ghi remarks (frm204004.cs:970-975). Dòng km_cd khác dù mang gds_cd thì không đụng 在庫.
 *  - Dòng bị xoá biến khỏi acc_dat (WinForm xoá CỨNG; web lưu vào acc_dat_deleted).
 *
 * Dữ liệu: 990984, hôm nay acc_dat: (1) km 59 803-0 × 2, (2) km 40 mang gds 803-0 × 1 (đối chứng gating).
 * Chọn tất cả → F8 → 「いいえ」 (không tính lại 個人会計). Ghi DB thật nên cần TEST_ALLOW_SAVE=1.
 */
import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, allowSave } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 984
const TODAY = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const SCREEN_LOAD_TIMEOUT = 60_000
const GOODS_QTY = 2

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + acc_dat riêng')
skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F8 削除 ghi acc_dat / goods_stock_history thật')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let page: Page
let step: () => Promise<void>
let stockBefore = 0

async function cleanup(): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat_deleted WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM goods_stock_history WHERE pat_no = $1', [PAT_NO])
    })
}

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　削除在庫', patKn: 'せいさん　さくじょざいこ' })
    await seedTreatmentRows(PAT_NO, TODAY, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算削除E2E' }])
    await cleanup()
    await withDb(async (c) => {
        await c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                 rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
             VALUES ($1::date, 1, $2, 40, 300, 900, 0, 0, -1, 1, 1, 1, now(), 1, 0, 50, 250)`,
            [TODAY, PAT_NO],
        )
        for (const [cnt, km, qty] of [
            [1, 59, GOODS_QTY],
            [2, 40, 1],
        ] as const)
            await c.query(
                `INSERT INTO acc_dat (acc_dt, acc_cnt, trt_dt, trt_cnt, pat_no, km_cd, claim_amt, tax,
                                      rece_amt, rece_tax, rece_kbn, pflg, gds_cd, gds_sb, gds_cnt, att_dr, acc_tm, pat_br)
                 VALUES ($1::date, $2, $1::date, 1, $3, $4, 1000, 0, 1000, 0, 1, 1, 803, 0, $5, 1, now(), 1)`,
                [TODAY, cnt, PAT_NO, km, qty],
            )
        const r = await c.query<{ q: number }>(
            `SELECT coalesce((SELECT stock_qty FROM goods_stock_history
                              WHERE goods_cd = 803 AND goods_sb = 0 ORDER BY stock_dt DESC LIMIT 1), 0)::int AS q`,
        )
        stockBefore = r.rows[0]?.q ?? 0
    })
})

test.afterAll(async () => {
    await cleanup()
    await deleteTestPatient(PAT_NO)
    await releaseSharedPage(page)
})

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const alert = (): Locator => page.getByRole('alertdialog').last()
const correctionDlg = (): Locator => page.getByRole('dialog').last()
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

test.describe('精算データ修正 F8 削除 — 物品在庫', () => {
    test('D-1 — xoá 物品 km 59 ⇒ +在庫 (không remarks); km 40 mang gds_cd ⇒ không đụng 在庫', async () => {
        await openScreen()
        await fkey('F8').click() // 窓口精算 F8 訂正 → 精算データ修正
        const dlg = correctionDlg()
        const boxes = dlg.getByRole('checkbox')
        await expect(boxes, 'header + 2 dòng acc_dat của hôm nay').toHaveCount(3, { timeout: SCREEN_LOAD_TIMEOUT })
        await boxes.first().click()
        await expect(dlg.locator('[data-fkey="F8"]').last(), 'đã chọn ⇒ F8 削除 hết disabled').toBeEnabled()
        await dlg.locator('[data-fkey="F8"]').last().click()
        await expect(alert()).toBeVisible()
        await alert().getByRole('button', { name: 'いいえ' }).click()

        await expect
            .poll(() => withDb(async (c) => (await c.query('SELECT 1 FROM acc_dat WHERE pat_no = $1', [PAT_NO])).rowCount), {
                message: 'cả hai dòng acc_dat phải bị xoá',
            })
            .toBe(0)

        const stock = await withDb(async (c) =>
            (
                await c.query<{ goods_cd: number; goods_sb: number; stock_change: number; stock_qty: number; remarks: string | null }>(
                    'SELECT goods_cd, goods_sb, stock_change, stock_qty, remarks FROM goods_stock_history WHERE pat_no = $1',
                    [PAT_NO],
                )
            ).rows,
        )
        expect(stock, 'đúng MỘT dòng 在庫履歴 — dòng km 59; dòng km 40 không được ghi').toEqual([
            { goods_cd: 803, goods_sb: 0, stock_change: GOODS_QTY, stock_qty: stockBefore + GOODS_QTY, remarks: null },
        ])
    })
})
