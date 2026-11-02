/**
 * 窓口精算（患者選択）— 未精算患者一覧 (frm204001) ↔ `/counter-payments`.
 *
 * Phím F ở 未精算 (ESC/End, F8 ẩn ở 患者検索…) đã có ở counter-payment-winform-keys.spec.ts;
 * spec này đo phần còn lại của màn: dữ liệu lưới, chọn bệnh nhân, xoá, điều hướng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (src/OCHACOM/SEISAN/Forms/frm204001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :51 tiêu đề 「窓口精算（患者選択）」; :90-91 tiêu đề lưới 「<<患者検索一覧>>」 /
 *    「<<未精算患者一覧>>」 (ASCII `<<`).
 *  - :70-82 phím ở 未精算: F1 患者検索 / F2 入力一覧 / F3 来患一覧 / F8 削除 / F9 選択 /
 *    F10 戻る / F12 メニュー; F4–F7, F11 tắt. :56-68 ở 患者検索 F1 đổi thành 未精算患者.
 *  - :108-118 cột: (tick) 患者番号 氏名 性別 生年月日 点数 請求金額 未収金; :166-176 点数 /
 *    請求金額 / 未収金 định dạng `{0:N0}`.
 *  - COMMON/DBAccess/PatInfoList.getUnPaidPatInfo: 点数 = Σscore, 請求金額 = Σ(claim_amt + tax)
 *    của `unpaid`; 未収金 = person_exp ins_due_bal + own_due_bal + own_due_exc + gds_due_bal +
 *    gds_due_exc; 生年月日 = chữ đầu niên hiệu + năm 2 số + 「年」MM「月」DD「日」.
 *  - :270-279 F9: ô 患者番号 có chữ thì mở số đã gõ (bỏ qua dòng đang chọn); trống thì mở
 *    dòng đang chọn. :372-378 số không tồn tại ⇒ W 「E00005」 患者情報 (患者情報が登録されていません。).
 *  - :535-584 F8: chưa tick ⇒ E00021; tick ⇒ Q00003 [OK/キャンセル]; OK ⇒ xoá `unpaid` theo
 *    pat_no rồi nạp lại lưới — KHÔNG có hộp báo xong.
 *  - :227-257 F2 ⇒ frm204004 (入力一覧), F3 ⇒ frm204008 (来患一覧), cả hai ghi lịch sử
 *    GAMEN_HIDE ⇒ F10 bên đó quay về đây. COMMON/Forms/frm901001.cs:157-171 F10 ở đây ⇒ màn
 *    trước, không có thì MENU; không hỏi gì.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (TEST_DB=1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990960: 2 dòng unpaid (保険 300点/900円, 自費 5000円 + 税 500) + person_exp nợ
 *    100/200/20/30/3 ⇒ 点数 300, 請求金額 6,400, 未収金 353.
 *  - 990961: 1 dòng unpaid — dùng cho F9 gõ số và F8 xoá.
 *  - 990962: 1 dòng unpaid — ca parity sau F8 không có hộp báo xong.
 *  F8 + OK ghi DB thật (xoá unpaid của bệnh nhân test) ⇒ cần TEST_ALLOW_SAVE=1.
 *
 * Hai khối: 「cơ bản」 SERIAL; 「parity」 KHÔNG serial.
 */
import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { allowSave, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const SCREEN_LOAD_TIMEOUT = 60_000
const TRT_DT = trtDt('2026-08-03')

const PAT_A = SEED_PAT_NO_BASE + 960
const PAT_B = SEED_PAT_NO_BASE + 961
const PAT_C = SEED_PAT_NO_BASE + 962
const PAT_MISSING = SEED_PAT_NO_BASE + 969
const ALL = [PAT_A, PAT_B, PAT_C]

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid riêng')

type UnpaidRow = { kmCd: number; score: number; claim: number; tax: number }

async function seedUnpaid(patNo: number, rows: UnpaidRow[]): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [patNo])
        for (const r of rows)
            await c.query(
                `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                     rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg)
                 VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0)`,
                [TRT_DT, patNo, r.kmCd, r.score, r.claim, r.tax],
            )
    })
}

async function unpaidCount(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: string }>('SELECT count(*) AS n FROM unpaid WHERE pat_no = $1', [patNo])
        return Number(r.rows[0]?.n ?? 0)
    })
}

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: PAT_A, patNm: 'ミセイサン　一覧', patKn: 'みせいさん　いちらん' })
    await seedTestPatient({ patNo: PAT_B, patNm: 'ミセイサン　選択', patKn: 'みせいさん　せんたく' })
    await seedTestPatient({ patNo: PAT_C, patNm: 'ミセイサン　削除', patKn: 'みせいさん　さくじょ' })
    await seedUnpaid(PAT_A, [
        { kmCd: 40, score: 300, claim: 900, tax: 0 },
        { kmCd: 50, score: 0, claim: 5000, tax: 500 },
    ])
    await seedUnpaid(PAT_B, [{ kmCd: 40, score: 100, claim: 300, tax: 0 }])
    await seedUnpaid(PAT_C, [{ kmCd: 40, score: 100, claim: 300, tax: 0 }])
    await withDb((c) =>
        c.query(
            `UPDATE person_exp SET ins_due_bal = 100, own_due_bal = 200, own_due_exc = 20,
                                   gds_due_bal = 30, gds_due_exc = 3
              WHERE pat_no = $1`,
            [PAT_A],
        ),
    )
})

test.afterAll(async () => {
    if (!dbEnabled) return
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = ANY($1::int[])', [ALL])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = ANY($1::int[])', [ALL])
    })
    for (const p of ALL) await deleteTestPatient(p)
})

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const fkey = (k: string): Locator => page().locator(`[data-fkey="${k}"]`).last()
    const top = (): Locator => page().locator('[role="alertdialog"], [role="dialog"]').last()
    const row = (patNo: number): Locator => page().getByTestId(`row-${patNo}`)
    const patNoBox = (): Locator =>
        page().getByText('患者番号', { exact: true }).first().locator('..').locator('input').first()
    const open = async () => {
        await page().goto('/counter-payments', { waitUntil: 'domcontentloaded' })
        await expect(fkey('F1')).toHaveText(/患者検索/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(row(PAT_A)).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    }
    const tick = async (patNo: number) => {
        await row(patNo).getByRole('checkbox').click()
    }
    const answer = async (re: RegExp) => {
        await top().getByRole('button', { name: re }).click()
    }
    return { fkey, top, row, patNoBox, open, tick, answer }
}

test.describe('窓口精算（患者選択）— 未精算患者一覧: cơ bản', () => {
    test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })
    let page: Page
    let step: () => Promise<void>
    const { fkey, top, row, patNoBox, open, tick, answer } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test('TC-1 — tiêu đề, tiêu đề lưới và dải phím F ở 未精算 (frm204001.cs:51, :70-82)', async () => {
        await open()
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(/窓\s*口\s*精\s*算\s*（患者選択）/)
        await expect(page.getByText(/未精算患者一覧/).first()).toBeVisible()
        const want: Record<string, RegExp> = {
            F1: /患者検索/,
            F2: /入力一覧/,
            F3: /来患一覧/,
            F8: /削除/,
            F9: /選択/,
            F10: /戻る/,
            F12: /メニュー/,
        }
        for (const [k, re] of Object.entries(want)) await expect(fkey(k), k).toHaveText(re)
        for (const k of ['F4', 'F5', 'F6', 'F7', 'F11']) {
            const cell = page.locator(`[data-fkey="${k}"]`)
            if ((await cell.count()) > 0) await expect(cell.last(), `${k} phải trống`).not.toHaveText(/\S/)
        }
        await step()
    })

    test('TC-2 — dòng 未精算 của bệnh nhân seed: tổng 点数 / 請求金額(+税) / 未収金 (getUnPaidPatInfo)', async () => {
        const cells = row(PAT_A)
        await expect(cells).toContainText(String(PAT_A))
        await expect(cells).toContainText('ミセイサン　一覧')
        await expect(cells).toContainText('昭55年01月01日')
        // Thứ tự cột sau ô tick: 患者番号 氏名 性別 生年月日 点数 請求金額 未収金.
        const text = (await cells.innerText()).replace(/\s+/g, ' ')
        console.log(`[TC-2] dòng: ${text}`)
        expect(text, '点数 = Σscore').toMatch(/昭55年01月01日 300 /)
        expect(text, '請求金額 = Σ(claim_amt + tax) = 900 + 5000 + 500').toContain('6,400')
        expect(text, '未収金 = 100 + 200 + 20 + 30 + 3').toMatch(/ 353$/)
        await captureFixedUi(page, 'counter-payment-unpaid-row')
    })

    test('TC-3 — F1 đổi sang 患者検索 rồi F1 về lại 未精算 (frm204001.cs:211-221)', async () => {
        await fkey('F1').click()
        await expect(fkey('F1')).toHaveText(/未精算患者/)
        await expect(page.getByText(/患者検索一覧/).first()).toBeVisible()
        await expect(row(PAT_A)).toHaveCount(0)
        await fkey('F1').click()
        await expect(fkey('F1')).toHaveText(/患者検索/)
        await expect(row(PAT_A)).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('TC-4 — gõ 患者番号 không tồn tại + F9 ⇒ E00005 「患者情報が登録されていません。」 (:372-378)', async () => {
        await patNoBox().fill(String(PAT_MISSING))
        await fkey('F9').click()
        await expect(top()).toContainText('患者情報が登録されていません。', { timeout: SCREEN_LOAD_TIMEOUT })
        await answer(/^(OK|閉じる)$/)
        await expect(page).toHaveURL(/\/counter-payments(\?|$)/)
        await patNoBox().fill('')
    })

    test('TC-5 — ô 患者番号 có chữ thì F9 mở số ĐÃ GÕ, bỏ qua dòng đang chọn (:272-279)', async () => {
        await row(PAT_A).click()
        await patNoBox().fill(String(PAT_B))
        await fkey('F9').click()
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_B}(\\?|$)`), {
            timeout: SCREEN_LOAD_TIMEOUT,
        })
    })

    test('TC-6 — ô 患者番号 trống thì F9 mở dòng đang chọn', async () => {
        await open()
        await patNoBox().fill('')
        await row(PAT_A).click()
        await fkey('F9').click()
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_A}(\\?|$)`), {
            timeout: SCREEN_LOAD_TIMEOUT,
        })
    })

    test('TC-7 — F2 ⇒ 入力一覧, F10 ở đó quay về 未精算 (:227-237 GAMEN_HIDE)', async () => {
        await open()
        await fkey('F2').click()
        await expect(page).toHaveURL(/\/counter-payments\/input-list/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.getByText(/入\s*力\s*一\s*覧/).first(), 'chờ màn 入力一覧 thay bar F-key').toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(fkey('F2')).toContainText('印刷')
        await step()
        await fkey('F10').click()
        await expect(page).toHaveURL(/\/counter-payments(\?|$)/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(row(PAT_A)).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('TC-8 — F3 ⇒ 来患一覧, F10 ở đó quay về 未精算 (:243-253 GAMEN_HIDE)', async () => {
        await fkey('F3').click()
        await expect(page).toHaveURL(/\/counter-payments\/visit-list/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(fkey('F4'), 'chờ bar F-key của 来患一覧').toContainText('CSV出力', { timeout: SCREEN_LOAD_TIMEOUT })
        await step()
        await fkey('F10').click()
        await expect(page).toHaveURL(/\/counter-payments(\?|$)/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(row(PAT_A)).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('TC-9 — F8 tick + キャンセル ở Q00003 ⇒ không xoá (:547-548)', async () => {
        await tick(PAT_B)
        await fkey('F8').click()
        await expect(top()).toContainText('削除', { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(top().getByRole('button', { name: /^(OK)$/ })).toBeVisible()
        await answer(/^(キャンセル|Cancel)$/)
        await expect(row(PAT_B)).toBeVisible()
        expect(await unpaidCount(PAT_B)).toBe(1)
        await tick(PAT_B)
    })

    test('TC-10 — F8 tick + OK ⇒ xoá unpaid của bệnh nhân đó, dòng biến khỏi lưới (:555-583)', async () => {
        test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F8 + OK xoá unpaid thật')
        await tick(PAT_B)
        await fkey('F8').click()
        await answer(/^OK$/)
        await expect(row(PAT_B)).toHaveCount(0, { timeout: SCREEN_LOAD_TIMEOUT })
        expect(await unpaidCount(PAT_B)).toBe(0)
        // Dọn hộp báo xong (nếu có) để ca sau không vướng; ca parity đo riêng chuyện có/không.
        if (await top().isVisible().catch(() => false)) await answer(/^(OK|閉じる)$/)
        await expect(row(PAT_A), 'xoá B mà mất cả A').toBeVisible()
    })

    test('TC-11 — F10 ⇒ rời 窓口精算, không hỏi gì (frm901001.cs:157-171)', async () => {
        await fkey('F10').click()
        await expect(page).not.toHaveURL(/\/counter-payments/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.locator('[role="alertdialog"]')).toHaveCount(0)
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })
})

test.describe('窓口精算（患者選択）— 未精算患者一覧: parity', () => {
    test.describe.configure({ retries: 0, timeout: 180_000 })
    let page: Page
    const { fkey, top, row, open, tick, answer } = helpers(() => page)

    test.beforeEach(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('P-1 (parity) — tiêu đề lưới là 「<<未精算患者一覧>>」 ASCII (frm204001.cs:91)', async () => {
        await open()
        await captureFixedUi(page, 'counter-payment-unpaid-title')
        await expect(page.getByText('<<未精算患者一覧>>', { exact: true })).toBeVisible()
    })

    test('P-2 (parity) — F8 + OK xoá xong KHÔNG hiện hộp báo (frm204001.cs:555-583 chỉ nạp lại lưới)', async () => {
        test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: F8 + OK xoá unpaid thật')
        await open()
        await tick(PAT_C)
        await fkey('F8').click()
        await answer(/^OK$/)
        await expect(row(PAT_C)).toHaveCount(0, { timeout: SCREEN_LOAD_TIMEOUT })
        const shown = await top()
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false)
        if (shown) {
            console.log(`[P-2] hộp sau khi xoá: ${(await top().innerText()).replace(/\s+/g, ' ')}`)
            await captureFixedUi(page, 'counter-payment-unpaid-delete-done')
            await answer(/^(OK|閉じる)$/)
        }
        expect(shown, 'WinForm không báo 「削除が完了しました」').toBe(false)
    })
})
