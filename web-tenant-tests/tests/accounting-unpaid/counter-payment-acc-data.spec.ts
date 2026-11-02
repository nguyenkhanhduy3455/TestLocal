/**
 * 会計データ — frm204004 (3 chế độ) + frm204005 精算データ訂正.
 *   List   ↔ /counter-payments/input-list (F2 từ 未精算患者一覧)
 *   Update ↔ 精算 F8 (精算データ訂正)
 *   Print  ↔ 精算 F1 (領収書印刷)
 *
 * ĐÁP ÁN = WinForm (đọc source):
 *  - List: F2 印刷 | F8 削除 | F9 訂正 | F10 戻る (frm204004.cs:111-123); 精算日 mặc định hôm nay (postInit :410-412).
 *    Cột (:176-187): 患者番号 氏名 会計種別 点数 請求金額 入金額 未収金 (未収回収) (充当) (預り金) 入金区分 備考 (FlaUI 2026-10-27 đọc 「(充当)」).
 *  - Update cột (:148-163): … 預りより充当 / 当日入金額 / 未収回収額 …
 *  - Print cột (:129-136): 精算日 連番 診療日 保険 自費 自費消費税 物品 物品消費税.
 *  - ⛔ F8 không tick dòng nào ⇒ E00021 「削除対象が選択されていません。」 (:574-580).
 *  - F8 có tick ⇒ Q00016 (MSGTBL, SQL 1434): 「自動計算ありで削除してよろしいですか？「はい」を押すと自動計算ありで
 *    削除、「いいえ」を押すと自動計算なしで削除、「キャンセル」で中断します。」 [はい|いいえ|キャンセル] (:583).
 *    はい = xoá + tự tính lại, いいえ = xoá không tính lại, キャンセル = không làm gì.
 *  - F9 có dòng chọn ⇒ 204005: F9 登録 | F10 戻る (frm204005.cs:47-48); 登録 hỏi Q00016 「更新」 (:127).
 *
 * Dữ liệu: 990985 + acc_dat hôm nay (acc_cnt 1): 保険 km 40 900/入金 900, 自費 km 50 5000+500/入金 5500.
 * Ca xoá thật cần TEST_ALLOW_SAVE=1.
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

const PAT_NO = SEED_PAT_NO_BASE + 985
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000
const Q00016_DELETE =
    '自動計算ありで削除してよろしいですか？「はい」を押すと自動計算ありで削除、「いいえ」を押すと自動計算なしで削除、「キャンセル」で中断します。'

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + acc_dat riêng')

async function seedAccDat(): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        for (const [km, sc, claim, tax] of [
            [40, 300, 900, 0],
            [50, 0, 5000, 500],
        ])
            await c.query(
                `INSERT INTO acc_dat (acc_dt, acc_cnt, trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, tax,
                                      rece_amt, rece_tax, rece_kbn, att_dr, acc_tm, pat_br)
                 VALUES (current_date, 1, $1::date, 1, $2, $3, $4, $5, $6, $5, $6, 1, 1, now(), 1)`,
                [TRT_DT, PAT_NO, km, sc, claim, tax],
            )
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                 rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
             VALUES ($1::date, 2, $2, 40, 300, 900, 0, 0, -1, 1, 1, 1, now(), 1, 0, 50, 250)`,
            [TRT_DT, PAT_NO],
        )
    })
}
async function accKms(): Promise<number[]> {
    return withDb(async (c) => {
        const r = await c.query<{ km_cd: number }>('SELECT km_cd FROM acc_dat WHERE pat_no = $1 ORDER BY km_cd', [PAT_NO])
        return r.rows.map((x) => x.km_cd)
    })
}

test.describe.configure({ retries: 0, timeout: 180_000 })

let page: Page
let step: () => Promise<void>

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　会計', patKn: 'せいさん　かいけい' })
    await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-会計データE2E' }])
    await seedAccDat()
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

// ── locator ─────────────────────────────────────────────────────────────────

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const alert = (): Locator => page.getByRole('alertdialog').last()
const patRows = (): Locator => page.locator('[data-testid^="row-"]').filter({ hasText: String(PAT_NO) })
const kmRow = (scope: Locator, kmNm: string): Locator =>
    scope.locator('[data-testid^="row-"]').filter({ has: page.locator('[data-testid="cell-kmNm"]', { hasText: kmNm }) })
const correctionDlg = (): Locator => page.getByRole('dialog').filter({ hasText: /精\s*算\s*デ\s*ー\s*タ\s*訂\s*正/ }).last()
const headerCells = async (scope: Locator): Promise<string[]> =>
    (await scope.getByTestId('table-header-row').first().innerText()).split('\n').map((s) => s.trim()).filter(Boolean)
const norm = (s: string): string => s.replace(/\s+/g, '')

async function openInputList(): Promise<void> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto('/counter-payments/input-list', { waitUntil: 'domcontentloaded' })
        try {
            await expect(page.getByText(/入\s*力\s*一\s*覧/).first(), 'màn 入力一覧 không mở').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            await expect(patRows().first(), 'dòng acc_dat seed hôm nay chưa lên').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            await step()
            return
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr
}
async function openSeisan(): Promise<void> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        try {
            await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            await step()
            return
        } catch (e) {
            lastErr = e
        }
    }
    throw lastErr
}

test.describe('入力一覧 (List)', () => {
    test.describe.configure({ mode: 'serial' })

    test('L-1 — F-key, cột, 2 dòng seed hôm nay', async () => {
        await openInputList()
        for (const [k, label] of [
            ['F2', '印刷'],
            ['F8', '削除'],
            ['F9', '訂正'],
            ['F10', '戻る'],
        ] as const)
            await expect(fkey(k), k).toContainText(label)
        const heads = (await headerCells(page.locator('body'))).map(norm)
        for (const h of ['患者番号', '氏名', '会計種別', '点数', '請求金額', '入金額', '未収金', '(未収回収)', '(充当)', '(預り金)', '入金区分', '備考'])
            expect(heads, `cột ${h}`).toContain(h)
        await expect(patRows()).toHaveCount(2)
    })

    test('L-3 — chọn dòng + F9 ⇒ 精算データ訂正 [F9 登録 | F10 戻る]; F10 đóng', async () => {
        await patRows().first().click()
        await fkey('F9').click()
        const d = correctionDlg()
        await expect(d, 'F9 phải mở 204005').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(d.locator('[data-fkey="F9"]').last()).toContainText('登録')
        await expect(d.locator('[data-fkey="F10"]').last()).toContainText('戻る')
        await d.locator('[data-fkey="F10"]').last().click()
        await expect(d).toBeHidden()
    })

    test('L-4 — tick + F8 ⇒ hỏi はい/いいえ/キャンセル; キャンセル không xoá', async () => {
        await patRows().first().getByRole('checkbox').click()
        await fkey('F8').click()
        await expect(alert()).toContainText('自動計算ありで削除してよろしいですか？')
        for (const b of ['はい', 'いいえ', 'キャンセル']) await expect(alert().getByRole('button', { name: b }), b).toBeVisible()
        await alert().getByRole('button', { name: 'キャンセル' }).click()
        await expect(alert()).toBeHidden()
        await expect(patRows()).toHaveCount(2)
        expect(await accKms()).toEqual([40, 50])
    })

    test('L-5 — F10 ⇒ về 未精算患者一覧', async () => {
        await fkey('F10').click()
        await expect(page).toHaveURL(/\/counter-payments\/?$/, { timeout: SCREEN_LOAD_TIMEOUT })
    })
})

test.describe('精算データ訂正 (Update) + 領収書印刷 (Print)', () => {
    test.describe.configure({ mode: 'serial' })

    test('U-1 — 精算 F8 ⇒ 精算データ訂正 liệt kê 2 dòng acc_dat', async () => {
        await openSeisan()
        await fkey('F8').click()
        const d = correctionDlg()
        await expect(d).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(d.locator('[data-testid^="row-"]')).toHaveCount(2, { timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('U-2 — chọn dòng + F9 ⇒ 204005; F9 登録 hỏi 「自動計算ありで更新…」; キャンセル không ghi', async () => {
        const list = correctionDlg()
        await list.locator('[data-testid^="row-"]').first().click()
        await list.locator('[data-fkey="F9"]').last().click()
        const detail = page.getByRole('dialog').filter({ has: page.locator('[data-fkey="F9"]', { hasText: '登録' }) }).last()
        await expect(detail).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await detail.locator('[data-fkey="F9"]').last().click()
        await expect(alert()).toContainText('自動計算ありで更新してよろしいですか？')
        await alert().getByRole('button', { name: 'キャンセル' }).click()
        await expect(alert()).toBeHidden()
        await detail.locator('[data-fkey="F10"]').last().click()
        expect(await accKms()).toEqual([40, 50])
        await correctionDlg().locator('[data-fkey="F10"]').last().click()
        await expect(correctionDlg()).toBeHidden()
    })

    test('R-1 — 精算 F1 ⇒ 領収書印刷: cột, dòng hôm nay 900 / 5,000 / 500', async () => {
        await fkey('F1').click()
        const d = page.getByRole('dialog').filter({ hasText: /領\s*収\s*書\s*印\s*刷/ }).last()
        await expect(d).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        const heads = (await headerCells(d)).map(norm)
        for (const h of ['精算日', '連番', '診療日', '保険', '自費', '自費消費税', '物品', '物品消費税'])
            expect(heads, `cột ${h}`).toContain(h)
        // getAccDatList (AccDat.cs:212+) UNION ALL theo km ⇒ mỗi dòng acc_dat một dòng lưới.
        const rows = d.locator('[data-testid^="row-"]')
        await expect(rows).toHaveCount(2)
        await expect(rows.nth(0).getByTestId('cell-hoken')).toHaveText(/^900$/)
        await expect(rows.nth(1).getByTestId('cell-jihi')).toHaveText(/^5,000$/)
        await expect(rows.nth(1).getByTestId('cell-jihiTax')).toHaveText(/^500$/)
        await d.locator('[data-fkey="F10"]').last().click()
        await expect(d).toBeHidden()
    })
})

test.describe('ghi DB', () => {
    test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F8 xoá acc_dat thật')

    test('W-1 — 入力一覧 tick dòng 自費 + F8 いいえ ⇒ chỉ dòng km 50 mất', async () => {
        await seedAccDat()
        await openInputList()
        await kmRow(page.locator('body'), '自由診療').filter({ hasText: String(PAT_NO) }).getByRole('checkbox').click()
        await fkey('F8').click()
        await alert().getByRole('button', { name: 'いいえ' }).click()
        await expect.poll(accKms, { message: 'chỉ còn dòng 保険' }).toEqual([40])
        await expect(patRows()).toHaveCount(1)
    })
})

test.describe('parity ⛔', () => {
    test('P-1 — Q00016 khi 削除 đúng nguyên văn MSGTBL (có 「、」 giữa các vế)', async () => {
        await seedAccDat()
        await openInputList()
        await patRows().first().getByRole('checkbox').click()
        await fkey('F8').click()
        await expect(alert()).toBeVisible()
        // Assert khi hộp còn mở để ảnh lúc đỏ có hộp; afterAll goto trang khác nên không cần đóng.
        expect(norm(await alert().innerText())).toContain(norm(Q00016_DELETE))
        await alert().getByRole('button', { name: 'キャンセル' }).click()
    })

    test('P-2 — cột 精算データ訂正 theo WinForm: 預りより充当 / 当日入金額 / 未収回収額 (frm204004.cs:156-160)', async () => {
        await openSeisan()
        await fkey('F8').click()
        const d = correctionDlg()
        await expect(d.locator('[data-testid^="row-"]').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        const heads = (await headerCells(d)).map(norm)
        for (const h of ['預りより充当', '当日入金額', '未収回収額']) expect(heads, `cột ${h}`).toContain(h)
    })

    test('P-4 — F8 khi chưa tick dòng nào vẫn chạy và báo E00021 「削除対象が選択されていません。」 (:574-580)', async () => {
        await openInputList()
        await page.keyboard.press('F8')
        await expect(alert(), 'web khoá F8 khi chưa tick nên không có hộp E00021').toContainText('削除対象が選択されていません。')
    })
})
