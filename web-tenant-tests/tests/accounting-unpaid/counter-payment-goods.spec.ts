/**
 * 窓口精算 — F2 物品登録 (frm204003) + F1 物品販売履歴 (frm204009).
 *
 * ĐÁP ÁN = WinForm (đọc source; mục ⛔ cần FlaUI đo lại):
 *  - 204003 F-key: F1 販売履歴 | F9 登録 | F10 戻る (SeisanTestBase.Fk204003 đã đo).
 *  - Danh sách lọc theo 入金日 nằm trong app_st_dt..app_ed_dt (frm204003 getViewData) — 444-44
 *    (hiệu lực 2026-09-01..30) không có mặt khi 入金日 = hôm nay.
 *  - 登録: thuế tính theo ĐƠN GIÁ × 数量 (frm204002.cs:895-907); 内税 thì price -= tax/cnt, amt -= tax.
 *    803 ホワイトニングジェル 2000 外税 × 2 ⇒ 金額 4000, 税 400, 請求 4400.
 *    800 ハビットプロ 900 内税 × 1 ⇒ 税 round(900×10/110)=82, 金額 818, 請求 900.
 *  - Mở lại F2 giữ 数量 đã chọn (frm204002 truyền buppinDetail vào ParamData).
 *  - F10 đóng, KHÔNG đổi lựa chọn trước.
 *  - ⛔ ESC = F9 登録 (BaseDialog.cs:302-325 định tuyến Escape/End qua btnF9_Click).
 *  - 204009: F9 選択 | F10 戻る; chọn dòng → CỘNG 数量 vào dòng đang có (frm204003.cs:292-318).
 *  - 204009 SQL (AccDat.cs:445-469): km_cd 59, ORDER BY acc_dt desc, acc_cnt; KHÔNG lọc gds_cnt.
 *    ⛔ Web (GoodsQueries.cs:126-153) ORDER BY acc_dt desc, gds_cd, gds_sb và lọc gds_cnt > 0.
 *  - P-4: bấm CHUỘT nút F9 選択 — web fkey-bar.tsx:237 `onClick={action.onPress}` truyền MouseEvent vào
 *    handleConfirm(overrideIndices) (goods-history-dialog.tsx:37) ⇒ lặp trên MouseEvent ném lỗi, hộp không đóng.
 *    Phím F9 thì chạy (fkey-scope-provider.tsx:92 gọi onPress() không đối số).
 *
 * Dữ liệu: 990975, unpaid 保険 300点/900円 + 自費 5000/500; acc_dat km 59:
 *   2026-10-01 acc_cnt 1 = 803 × 1, acc_cnt 2 = 800 × 2; 2026-09-15 acc_cnt 1 = gds 0-0 × 0 (rece 200+10,
 *   kiểu dữ liệu cũ thật có trong DB). Không bấm F9 của 精算.
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
import { GRID_LOAD_ATTEMPTS, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 975
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid + acc_dat riêng')

test.describe.configure({ retries: 0, timeout: 180_000 })

let page: Page
let step: () => Promise<void>

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　物品', patKn: 'せいさん　ぶっぴん' })
    await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算物品E2E' }])
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        for (const [km, sc, cl, tx, d1, d9] of [
            [40, 300, 900, 0, 50, 250],
            [50, 0, 5000, 500, 0, 0],
        ])
            await c.query(
                `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                     rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
                 VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0, $7, $8)`,
                [TRT_DT, PAT_NO, km, sc, cl, tx, d1, d9],
            )
        for (const [dt, cnt, cd, sb, qty, amt, tax] of [
            ['2026-10-01', 1, 803, 0, 1, 2000, 200],
            ['2026-10-01', 2, 800, 0, 2, 1636, 164],
            ['2026-09-15', 1, 0, 0, 0, 200, 10],
        ] as const)
            await c.query(
                `INSERT INTO acc_dat (acc_dt, acc_cnt, trt_dt, trt_cnt, pat_no, km_cd, claim_amt, tax,
                                      rece_amt, rece_tax, rece_kbn, pflg, gds_cd, gds_sb, gds_cnt, att_dr, acc_tm, pat_br)
                 VALUES ($1::date, $2, $1::date, 1, $3, 59, $4, $5, $4, $5, 1, 1, $6, $7, $8, 1, now(), 1)`,
                [dt, cnt, PAT_NO, amt, tax, cd, sb, qty],
            )
    })
})

test.afterAll(async () => {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
    })
    await deleteTestPatient(PAT_NO)
    await releaseSharedPage(page)
})

// ── locator (cùng cách counter-payment-calc.spec.ts) ────────────────────────

const goodsDlg = (): Locator => page.getByRole('dialog').filter({ hasText: '物 品 登 録' })
const historyDlg = (): Locator => page.getByRole('dialog').filter({ hasText: '物 品 販 売 履 歴' }).last()
const dlgKey = (dlg: Locator, k: string): Locator => dlg.locator(`[data-fkey="${k}"]`).last()
const goodsRow = (key: string): Locator => goodsDlg().getByTestId(`row-${key}`)
const qty = (key: string): Locator => goodsRow(key).locator('input')
const block = (header: string): Locator =>
    page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
const scoreTotal = (): Locator => block('初・再診料').nth(7)
const buppin = (i: number): Locator =>
    page
        .locator('div')
        .filter({ has: page.getByText('物 品', { exact: true }) })
        .filter({ has: page.locator('input') })
        .last()
        .locator('input')
        .nth(i)
const B = { total: 0, tax: 3, claim: 4 }
const claimTotal = (): Locator => block('請求金額').nth(0)

async function num(box: Locator): Promise<number> {
    return Number((await box.inputValue()).replace(/,/g, '') || '0')
}
async function expectVals(what: string, pairs: [Locator, number, string][]): Promise<void> {
    for (const [box, want, name] of pairs) await expect.poll(() => num(box), { message: `${what}: ${name}` }).toBe(want)
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
async function openGoods(): Promise<void> {
    await page.keyboard.press('F2')
    await expect(goodsDlg(), 'F2 phải mở 物品登録').toBeVisible()
    await expect(goodsRow('803-0'), 'danh sách 物品 chưa nạp').toBeVisible()
    await step()
}
async function setQty(key: string, v: string): Promise<void> {
    await qty(key).click()
    await qty(key).press('ControlOrMeta+a')
    await qty(key).pressSequentially(v)
    await qty(key).press('Tab')
    await step()
}

test.describe('物品登録 / 物品販売履歴 — hành vi', () => {
    test.describe.configure({ mode: 'serial' })

    test('G-1 — F2 mở 物品登録: F1 販売履歴 / F9 登録 / F10 戻る, cột, lọc theo 入金日', async () => {
        await openScreen()
        await openGoods()
        const dlg = goodsDlg()
        await expect(dlgKey(dlg, 'F1')).toContainText('販売履歴')
        await expect(dlgKey(dlg, 'F9')).toContainText('登録')
        await expect(dlgKey(dlg, 'F10')).toContainText('戻る')
        for (const h of ['物品コード', '物品名称', '販売単価', '数量', '在庫数'])
            await expect(dlg.getByText(h, { exact: true }).first(), `cột ${h}`).toBeVisible()
        await expect(goodsRow('803-0')).toContainText('ホワイトニングジェル')
        await expect(goodsRow('803-0')).toContainText('2,000')
        await expect(goodsRow('444-44'), '444-44 hết hiệu lực ở 入金日 hôm nay — không được có').toHaveCount(0)
    })

    test('G-2 — F10 đóng không đổi gì ở 物品', async () => {
        await setQty('803-0', '5')
        await dlgKey(goodsDlg(), 'F10').click()
        await expect(goodsDlg()).toBeHidden()
        await expectVals('F10', [[buppin(B.total), 0, '物品 金額'], [claimTotal(), 6400, '請求合計']])
    })

    test('G-3 — 803 × 2 外税 ⇒ 4000 / 400 / 4400, 請求合計 10800 (frm204002.cs:895-907)', async () => {
        await openGoods()
        await expect(qty('803-0'), 'F10 lần trước không được giữ 数量').toHaveValue('')
        await setQty('803-0', '2')
        await dlgKey(goodsDlg(), 'F9').click()
        await expect(goodsDlg()).toBeHidden()
        await expectVals('外税', [
            [buppin(B.total), 4000, '物品 金額'],
            [buppin(B.tax), 400, '物品 税'],
            [buppin(B.claim), 4400, '物品 請求'],
            [claimTotal(), 10800, '請求合計'],
        ])
    })

    test('G-4 — mở lại giữ 数量; thêm 800 × 1 内税 ⇒ 4818 / 482 / 5300', async () => {
        await openGoods()
        await expect(qty('803-0'), 'mở lại phải giữ 数量 đã 登録').toHaveValue('2')
        await setQty('800-0', '1')
        await dlgKey(goodsDlg(), 'F9').click()
        await expect(goodsDlg()).toBeHidden()
        await expectVals('内税', [
            [buppin(B.total), 4818, '物品 金額 = 4000 + 818'],
            [buppin(B.tax), 482, '物品 税 = 400 + 82'],
            [buppin(B.claim), 5300, '物品 請求'],
            [claimTotal(), 11700, '請求合計'],
        ])
    })

    test('G-5 — 数量 chỉ nhận số', async () => {
        await openGoods()
        await setQty('801-0', 'a1b')
        await expect(qty('801-0')).toHaveValue('1')
        await setQty('801-0', '')
    })

    test('G-6 — F1 販売履歴: F9 選択 / F10 戻る, cột, F10 quay về 物品登録', async () => {
        await dlgKey(goodsDlg(), 'F1').click()
        const h = historyDlg()
        await expect(h, 'F1 phải mở 物品販売履歴').toBeVisible()
        await expect(dlgKey(h, 'F9')).toContainText('選択')
        await expect(dlgKey(h, 'F10')).toContainText('戻る')
        for (const c of ['日付', '物品コード', '物品名称', '販売単価', '数量'])
            await expect(h.getByText(c, { exact: true }).first(), `cột ${c}`).toBeVisible()
        await expect(h.getByText('803-0', { exact: true })).toBeVisible()
        await expect(h.getByText('800-0', { exact: true })).toBeVisible()
        await dlgKey(h, 'F10').click()
        await expect(h).toBeHidden()
        await expect(goodsDlg()).toBeVisible()
        await expect(qty('803-0'), 'F10 販売履歴 không đổi 数量').toHaveValue('2')
    })

    test('G-7 — chọn 803 trong 販売履歴 + F9 ⇒ CỘNG vào 数量 đang có (frm204003.cs:292-318)', async () => {
        await dlgKey(goodsDlg(), 'F1').click()
        const h = historyDlg()
        await expect(h).toBeVisible()
        await h.getByText('803-0', { exact: true }).click()
        await step()
        await page.keyboard.press('F9')
        await expect(h).toBeHidden()
        await expect(qty('803-0'), '2 + 1 từ lịch sử').toHaveValue('3')
        await expect(qty('800-0'), '800 giữ nguyên').toHaveValue('1')
        await dlgKey(goodsDlg(), 'F10').click()
        await expect(goodsDlg()).toBeHidden()
    })
})

test.describe('物品登録 / 物品販売履歴 — parity ⛔', () => {
    async function openHistory(): Promise<Locator> {
        await openScreen()
        await openGoods()
        await dlgKey(goodsDlg(), 'F1').click()
        const h = historyDlg()
        await expect(h.getByText('803-0', { exact: true })).toBeVisible()
        return h
    }

    test('P-1 — 販売履歴 cùng ngày xếp theo acc_cnt: 803 (acc_cnt 1) trước 800 (AccDat.cs:469)', async () => {
        const h = await openHistory()
        const codes = await h.getByText(/^\d+-\d+$/).allTextContents()
        expect(codes.indexOf('803-0'), `thứ tự đang là ${codes.join(', ')}`).toBeLessThan(codes.indexOf('800-0'))
    })

    test('P-2 — 販売履歴 hiện cả dòng 数量 0 (WinForm không lọc gds_cnt, AccDat.cs:466-468)', async () => {
        const h = await openHistory()
        await expect(h.getByText('0-0', { exact: true }), 'dòng 2026-09-15 gds 0-0 × 0').toBeVisible()
    })

    test('P-4 — bấm chuột dòng rồi bấm chuột nút F9 選択 ⇒ chọn (btnF9_Click, frm204009.cs:256-261)', async () => {
        const h = await openHistory()
        await h.getByText('803-0', { exact: true }).click()
        await step()
        await dlgKey(h, 'F9').click()
        await expect(h, 'nút F9 選択 không phản hồi khi bấm chuột').toBeHidden()
        await expect(qty('803-0')).toHaveValue('1')
    })

    test('P-3 — ESC ở 物品登録 = F9 登録 (BaseDialog.cs:302-325)', async () => {
        await openScreen()
        await openGoods()
        await setQty('803-0', '1')
        await page.keyboard.press('Escape')
        await expect(goodsDlg()).toBeHidden()
        await expectVals('ESC', [[buppin(B.total), 2000, 'ESC phải 登録 803 × 1']])
    })
})
