/**
 * 窓口精算 F9 登録 (frm204002.F9Proc) — hai tác dụng phụ ngoài acc_dat:
 *  - setClaimB :3749 → MstGoods.insertGoodsStockHistory(setGoodsStockHistoryData): MỖI dòng 物品 ghi
 *    một dòng goods_stock_history với stock_change = −数量, stock_qty = 在庫 hiện tại − 数量, pat_no = 患者.
 *  - getYoyaku :4055-4072 + setYoyaku :4076-4082: 予約 TRONG NGÀY ở trạng thái 10 予約済 / 20 受付済 /
 *    30 診療入力済 (dòng đầu theo st_dt, ed_dt, chair) ⇒ res_sts = 40 精算済. 予約 ngày khác không đổi.
 *
 * Dữ liệu: 990982, unpaid 保険 300点/900円; 803 ホワイトニングジェル × 2 (外税, 請求 4400).
 * 予約: hôm nay res_sts 20 (phải thành 40), ngày mai res_sts 10 (giữ nguyên). Cần TEST_ALLOW_SAVE=1.
 */
import { type Locator, type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, allowSave, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 982
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000
const SOLD_QTY = 2

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid + 予約 riêng')
skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F9 ghi acc_dat / goods_stock_history thật')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

let page: Page
let step: () => Promise<void>
let stockBefore = 0

async function cleanup(): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM goods_stock_history WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM yoyaku WHERE pat_no = $1', [PAT_NO])
    })
}

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　在庫予約', patKn: 'せいさん　ざいこよやく' })
    await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算在庫予約E2E' }])
    await cleanup()
    await withDb(async (c) => {
        await c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                 rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
             VALUES ($1::date, 1, $2, 40, 300, 900, 0, 0, -1, 1, 1, 1, now(), 1, 0, 50, 250)`,
            [TRT_DT, PAT_NO],
        )
        await c.query(
            `INSERT INTO yoyaku (st_dt, ed_dt, chair, pat_no, pat_nm, res_sts)
             VALUES (now(), now() + interval '30 minutes', 1, $1, 'E2E', 20),
                    (now() + interval '1 day', now() + interval '1 day 30 minutes', 1, $1, 'E2E', 10)`,
            [PAT_NO],
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
const goodsDlg = (): Locator => page.getByRole('dialog').filter({ hasText: '物 品 登 録' })
const block = (header: string): Locator =>
    page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
const scoreTotal = (): Locator => block('初・再診料').nth(7)
const rece = (): Locator => block('本日入金').nth(0)

async function num(box: Locator): Promise<number> {
    return Number((await box.inputValue()).replace(/,/g, '') || '0')
}

async function openScreen(): Promise<void> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        try {
            await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            await expect.poll(() => num(scoreTotal()), { message: 'chờ unpaid nạp xong' }).toBeGreaterThan(0)
            await step()
            return
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr
}

test.describe('F9 登録 — 在庫 + 予約', () => {
    test('S-1 — bán 803 × 2 rồi F9 登録 ⇒ 在庫 −2 (pat_no = 患者), 当日予約 20 → 40, 予約 ngày mai giữ 10', async () => {
        await openScreen()
        await page.keyboard.press('F2')
        await expect(goodsDlg(), 'F2 phải mở 物品登録').toBeVisible()
        const qty = goodsDlg().getByTestId('row-803-0').locator('input')
        await expect(qty).toBeVisible()
        await qty.click()
        await qty.press('ControlOrMeta+a')
        await qty.pressSequentially(String(SOLD_QTY))
        await qty.press('Tab')
        await goodsDlg().locator('[data-fkey="F9"]').last().click()
        await expect(goodsDlg()).toBeHidden()

        await page.getByText('なし', { exact: true }).click()
        await fkey('F7').click()
        await expect.poll(() => num(rece()), { message: 'F7 nhận đủ' }).toBe(900 + 4400)
        await fkey('F9').click()
        await expect(alert()).toContainText('登録してよろしいですか？')
        await alert().getByRole('button', { name: 'OK' }).click()

        // Có sẵn 次回予約 (ngày mai) ⇒ dspYoyaku không hiện 予約登録 (frm204002.cs:1323-1331), web về
        // thẳng danh sách. Nếu hộp vẫn hiện thì đóng bằng F10.
        const reservation = page.getByRole('dialog').filter({ hasText: /予\s*約\s*登\s*録/ })
        await expect
            .poll(
                async () => {
                    if (await reservation.isVisible()) await reservation.locator('[data-fkey="F10"]').last().click()
                    return /\/counter-payments\/?$/.test(page.url())
                },
                { timeout: SCREEN_LOAD_TIMEOUT, message: 'sau 登録 phải về danh sách 窓口精算' },
            )
            .toBe(true)

        const after = await withDb(async (c) => {
            const stock = await c.query<{ change: number; qty: number }>(
                `SELECT stock_change AS change, stock_qty AS qty FROM goods_stock_history
                  WHERE pat_no = $1 AND goods_cd = 803 AND goods_sb = 0`,
                [PAT_NO],
            )
            const yoyaku = await c.query<{ res_sts: number }>(
                'SELECT res_sts FROM yoyaku WHERE pat_no = $1 ORDER BY st_dt',
                [PAT_NO],
            )
            return { stock: stock.rows, yoyaku: yoyaku.rows.map((r) => r.res_sts) }
        })
        expect(after.stock, 'đúng một dòng 在庫履歴 cho 803-0').toEqual([{ change: -SOLD_QTY, qty: stockBefore - SOLD_QTY }])
        expect(after.yoyaku, '予約 hôm nay → 40 精算済, ngày mai giữ 10').toEqual([40, 10])
    })
})
