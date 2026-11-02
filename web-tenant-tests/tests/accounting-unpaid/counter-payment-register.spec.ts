/**
 * 窓口精算 — F3 入金明細 (frm204006) + F9 登録 (frm204002.F9Proc) + bước 予約 sau 登録.
 *
 * ĐÁP ÁN = WinForm (đọc source):
 *  - 入金明細 mở khi 請求合計 > 預り + 本日入金 (frm204002.cs:937-955). Cột 請求金額 (setParamData :2138-2157):
 *    保険 = 請求H + insDueBal, 自費 = 請求J − 税J, 自費消費税 = 税J, 物品 / 物品消費税 tương tự.
 *  - initProc (frm204006.cs:262-300): chưa có 明細, không 預り ⇒ khoá cột 預り金より入金, 保険 本日入金 = 本日入金.
 *  - Enter ở ô 本日入金 = calcRece (:390-411): tổng < 本日入金 ⇒ phần thiếu vào Ô KẾ; tổng > ⇒ trừ ở chính ô.
 *  - F9 確定 giữ 明細 (lần mở sau hiện lại); F10 không đổi 明細 đã 確定; F1 クリア đưa về 0 và bỏ 明細 (:115-131).
 *  - F9 登録 (F9Proc :1131-1169): 入金日 thiếu ngày ⇒ E00002 「入金日が間違っています。」 (CustomDate.IsDate
 *    :891-901 — chỉ cả ba ô trống mới là None/E00001). Ngoài 返金:
 *      本日入金 0 và 預り 0 ⇒ Q00100 「本日入金が０円です。このまま登録してよろしいですか？」;
 *      còn lại (kể cả 点数 > 0 mà 請求 0) ⇒ Q00001 「登録してよろしいですか？」. キャンセル ⇒ không ghi gì.
 *    返金 (txtRepayH.Enabled) ⇒ không hỏi.
 *  - Sau 登録: appoFlg 1 + chưa có 次回予約 ⇒ hiện 予約登録 (dspYoyaku :1306-1320); F10 ⇒ về danh sách.
 *    Web cố ý KHÔNG port F8/F9 của 予約 (reservation-register-dialog.tsx: 「開発中」) ⇒ chỉ dùng F10.
 *
 * Dữ liệu: 990980, unpaid 保険 300点/900円 + 自費 5000/税 500 (請求合計 6400). Ca ghi DB cần TEST_ALLOW_SAVE=1.
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

const PAT_NO = SEED_PAT_NO_BASE + 980
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid riêng')

type Row = { kmCd: number; score: number; claim: number; tax?: number; d1?: number; d9?: number }
const BASE: Row[] = [
    { kmCd: 40, score: 300, claim: 900, d1: 50, d9: 250 },
    { kmCd: 50, score: 0, claim: 5000, tax: 500 },
]

async function setRows(rows: Row[] = BASE): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        for (const r of rows)
            await c.query(
                `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                     rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
                 VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0, $7, $8)`,
                [TRT_DT, PAT_NO, r.kmCd, r.score, r.claim, r.tax ?? 0, r.d1 ?? 0, r.d9 ?? 0],
            )
    })
}
async function accDatCount(): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        return r.rows[0]?.n ?? 0
    })
}

test.describe.configure({ retries: 0, timeout: 180_000 })

let page: Page
let step: () => Promise<void>

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　登録', patKn: 'せいさん　とうろく' })
    await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算登録E2E' }])
    await withDb((c) => c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO]))
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

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const alert = (): Locator => page.getByRole('alertdialog').last()
const block = (header: string): Locator =>
    page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
const scoreTotal = (): Locator => block('初・再診料').nth(7)
const rece = (): Locator => block('本日入金').nth(0)
const receDay = (): Locator => block('入金日').nth(2)
const repayH = (): Locator =>
    page
        .locator('div')
        .filter({ has: page.getByText('保 険', { exact: true }) })
        .filter({ has: page.locator('input') })
        .last()
        .locator('input')
        .nth(5)
const detailDlg = (): Locator => page.getByRole('dialog').filter({ hasText: '入 金 明 細' })
const dKey = (k: string): Locator => detailDlg().locator(`[data-fkey="${k}"]`).last()
/** Cột 入金明細: [0] 請求金額, [1] 預り金より入金, [2] 本日入金. */
const col = (label: '保 険' | '自 費' | '自費消費税' | '物 品' | '物品消費税'): Locator =>
    detailDlg().getByText(label, { exact: true }).locator('xpath=..').locator('input')

async function num(box: Locator): Promise<number> {
    return Number((await box.inputValue()).replace(/,/g, '') || '0')
}
async function expectVals(what: string, pairs: [Locator, number, string][]): Promise<void> {
    for (const [box, want, name] of pairs) await expect.poll(() => num(box), { message: `${what}: ${name}` }).toBe(want)
}
async function typeEnter(box: Locator, text: string): Promise<void> {
    await box.click()
    await box.press('ControlOrMeta+a')
    await box.pressSequentially(text)
    await box.press('Enter')
    await step()
}

async function openScreen(rows?: Row[]): Promise<void> {
    await setRows(rows)
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
async function openDetail(): Promise<void> {
    await fkey('F3').click()
    await expect(detailDlg(), 'F3 phải mở 入金明細').toBeVisible()
    await step()
}
async function expectConfirmThenCancel(text: string): Promise<void> {
    await expect(alert()).toContainText(text)
    await expect(alert().getByRole('button', { name: 'OK' })).toBeVisible()
    await alert().getByRole('button', { name: 'キャンセル' }).click()
    await expect(alert()).toBeHidden()
}

test.describe('入金明細 (frm204006)', () => {
    test.describe.configure({ mode: 'serial' })

    test('D-1 — mở: 請求金額 theo cột, 預り khoá, 保険 本日入金 = 1000', async () => {
        await openScreen()
        await fkey('F7').click()
        await typeEnter(rece(), '1000')
        await openDetail()
        await expectVals('請求金額', [
            [col('保 険').nth(0), 900, '保険'],
            [col('自 費').nth(0), 5000, '自費 = 5500 − 500'],
            [col('自費消費税').nth(0), 500, '自費消費税'],
            [col('物 品').nth(0), 0, '物品'],
            [col('物品消費税').nth(0), 0, '物品消費税'],
        ])
        await expectVals('本日入金', [
            [col('保 険').nth(2), 1000, '保険 = 本日入金'],
            [col('自 費').nth(2), 0, '自費'],
        ])
        for (const c of ['保 険', '自 費', '自費消費税', '物 品', '物品消費税'] as const)
            await expect(col(c).nth(1), `${c} 預り khoá`).not.toBeEditable()
        await expect(col('保 険').nth(2), 'focus đầu ở 保険 本日入金').toBeFocused()
    })

    test('D-2 — calcRece: thiếu ⇒ dồn sang ô kế; thừa ⇒ trừ ở chính ô (:390-411)', async () => {
        await typeEnter(col('保 険').nth(2), '600')
        await expectVals('thiếu', [[col('自 費').nth(2), 400, '自費 nhận 1000 − 600']])
        await typeEnter(col('自 費').nth(2), '700')
        await expectVals('thừa', [[col('自 費').nth(2), 400, '700 − (1300 − 1000)']])
    })

    test('D-3 — F9 確定 rồi mở lại: giữ 600 / 400', async () => {
        await dKey('F9').click()
        await expect(detailDlg()).toBeHidden()
        await openDetail()
        await expectVals('mở lại', [
            [col('保 険').nth(2), 600, '保険'],
            [col('自 費').nth(2), 400, '自費'],
        ])
    })

    test('D-4 — sửa rồi F10: 明細 đã 確定 không đổi', async () => {
        await typeEnter(col('保 険').nth(2), '100')
        await dKey('F10').click()
        await expect(detailDlg()).toBeHidden()
        await openDetail()
        await expectVals('sau F10', [
            [col('保 険').nth(2), 600, '保険'],
            [col('自 費').nth(2), 400, '自費'],
        ])
    })

    test('D-5 — F1 クリア ⇒ 0 hết; F10 rồi mở lại ⇒ về mặc định (保険 = 1000)', async () => {
        await dKey('F1').click()
        await expectVals('クリア', [
            [col('保 険').nth(2), 0, '保険'],
            [col('自 費').nth(2), 0, '自費'],
        ])
        await dKey('F10').click()
        await expect(detailDlg()).toBeHidden()
        await openDetail()
        await expectVals('mặc định', [
            [col('保 険').nth(2), 1000, '保険'],
            [col('自 費').nth(2), 0, '自費'],
        ])
        await dKey('F10').click()
        await expect(detailDlg()).toBeHidden()
    })
})

test.describe('F9 登録 — xác nhận (không ghi)', () => {
    test.describe.configure({ mode: 'serial' })

    test('F-1 — 請求 mode (本日入金 0, 預り 0) ⇒ Q00100; キャンセル không ghi', async () => {
        await openScreen()
        await fkey('F9').click()
        await expectConfirmThenCancel('本日入金が０円です。このまま登録してよろしいですか？')
        expect(await accDatCount()).toBe(0)
    })

    test('F-2 — 入金 mode (本日入金 = 請求) ⇒ Q00001 「登録してよろしいですか？」', async () => {
        await fkey('F7').click()
        await expectVals('F7', [[rece(), 6400, '本日入金']])
        await fkey('F9').click()
        await expectConfirmThenCancel('登録してよろしいですか？')
        await expect(alert()).toBeHidden()
        expect(await accDatCount()).toBe(0)
    })

    test('F-3 — 点数 > 0 mà 請求 0 ⇒ Q00001 (không phải Q00100) (:1151-1154)', async () => {
        await openScreen([{ kmCd: 40, score: 300, claim: 0, d1: 50, d9: 250 }])
        await fkey('F9').click()
        await expectConfirmThenCancel('登録してよろしいですか？')
        expect(await accDatCount()).toBe(0)
    })
})

test.describe('F9 登録 — ghi DB', () => {
    test.describe.configure({ mode: 'serial' })
    test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F9 ghi acc_dat thật')

    async function finishReservation(): Promise<void> {
        const r = page.getByRole('dialog').filter({ hasText: /予\s*約\s*登\s*録/ })
        await expect(r, 'appoFlg 1 + chưa có 次回予約 ⇒ phải hiện 予約登録').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await r.locator('[data-fkey="F10"]').last().click()
        await expect(page).toHaveURL(/\/counter-payments\/?$/, { timeout: SCREEN_LOAD_TIMEOUT })
    }

    test('W-1 — 返金 保険 100 + F9 ⇒ KHÔNG hỏi, ghi dòng 返金', async () => {
        await openScreen()
        await page.getByText('なし', { exact: true }).click()
        await fkey('F6').click()
        await typeEnter(repayH(), '100')
        await fkey('F9').click()
        await expect(alert(), '返金 không có hộp xác nhận').toBeHidden()
        await finishReservation()
        const n = await withDb(async (c) => {
            const r = await c.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM acc_dat WHERE pat_no = $1 AND km_cd BETWEEN 240 AND 259',
                [PAT_NO],
            )
            return r.rows[0]?.n ?? 0
        })
        expect(n, 'phải có dòng 返金 (km_cd 240-259)').toBeGreaterThan(0)
        await withDb((c) => c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO]))
    })

    test('W-2 — F7 nhận đủ + F9 OK ⇒ unpaid hết, acc_dat Σ 入金 6400, 予約 F10 về danh sách', async () => {
        await openScreen()
        await page.getByText('なし', { exact: true }).click()
        await fkey('F7').click()
        await expectVals('F7', [[rece(), 6400, '本日入金']])
        await fkey('F9').click()
        await expect(alert()).toContainText('登録してよろしいですか？')
        await alert().getByRole('button', { name: 'OK' }).click()
        await finishReservation()
        const r = await withDb(async (c) => {
            const u = await c.query<{ n: number }>('SELECT count(*)::int AS n FROM unpaid WHERE pat_no = $1', [PAT_NO])
            const a = await c.query<{ s: number }>(
                'SELECT coalesce(sum(rece_amt + rece_tax), 0)::int AS s FROM acc_dat WHERE pat_no = $1',
                [PAT_NO],
            )
            return { unpaid: u.rows[0]?.n ?? -1, rece: a.rows[0]?.s ?? -1 }
        })
        expect(r.unpaid, 'unpaid phải bị xoá sau 精算').toBe(0)
        expect(r.rece, 'Σ 入金').toBe(6400)
    })
})

test.describe('parity ⛔', () => {
    test('P-1 — 入金日 thiếu ngày + F9 ⇒ hộp E00002 「入金日が間違っています。」 (F9Proc :1144-1148)', async () => {
        await openScreen()
        await expect(receDay()).toHaveValue(/\d+/)
        await receDay().click()
        await receDay().press('ControlOrMeta+a')
        await receDay().press('Backspace')
        await receDay().press('Tab')
        await fkey('F9').click()
        await expect(alert(), 'WinForm báo bằng hộp thoại, không phải chữ đỏ dưới ô').toContainText('入金日が間違っています。')
    })
})
