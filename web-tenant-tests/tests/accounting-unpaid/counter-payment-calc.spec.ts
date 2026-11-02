/**
 * 窓口精算 (frm204002) — phép tính trên màn, không F9.
 *
 * Thuế 自費 theo ma trận 外税/内税 × 端数 và 値引 自費/保険 vượt 金額 đã ở
 * counter-payment-jihi-tax.spec.ts; file này phủ phần còn lại của FlaUI G3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÁP ÁN = SỐ ĐO WinForm (fla-ui-tests Tests/Seisan/SeisanCalcTests, 16/16, 2026-10-20)
 * ═══════════════════════════════════════════════════════════════════════════
 * Cùng dữ liệu nền: 保険 300点 (score_d_1 50 + score_d_9 250) / 900円, 自費 5000 + 税 500,
 * person_exp = 0, 負担率 0. Cấu hình hai bên trùng nhau: 外税, 四捨五入 (j/bTaxKbn 1, j/bCalcKbn 3),
 * thuế 10% / 軽減 8%, receRcvFlg 1.
 *  - Tc3a 未収 (frm204002.cs:711-714): 保険 100, 自費 200+20, 物品 300+30 ⇒ 請求合計 7050.
 *  - Tc3b 入金指定 (:404-414): rece_amt 3000 ⇒ 本日入金 3000, 不足 3400, おつり 0.
 *  - Tc3c 介護 (lflg 1, :459-463): 介護 100点/300円 ⇒ 保険金額 1200, 請求合計 6700.
 *  - Tc3d 負担率 30 lúc mở: chỉ hiện, 金額 giữ 900 (không tính lại).
 *  - Tc3e/f F7 với 預り金 (:2087-2100): 5000 < 6400 ⇒ 預り 5000, 本日入金 1400; gõ 預り 9000 ⇒ chặn
 *    về 5000 (:1477-1480). 10000 ≥ 6400 ⇒ 預り 6400, 本日入金 0.
 *  - Tc3g 負担率 30 + 処置 283 ⇒ 点数 333 ⇒ 999 ⇒ 10円四捨五入 1000 (:2342-2355).
 *  - Tc3h 点数入力 100 Enter ⇒ cộng dồn 400 / 1200; phím − trừ lại lần cộng cuối (:2315-2335).
 *  - Tc3i 負担率 20 Enter ⇒ 300 × 10 × 20 / 100 = 600 (:1450-1459).
 *  - Tc3j 保険 金額入力 500 ⇒ 1400; phím − ⇒ 900 (:1663-1677).
 *  - Tc3k 自費 金額入力 1234 ⇒ 6234, 税 623, 請求 6857, 合計 7757.
 *  - Tc3m 保険 値引 100 ⇒ 請求 800, 合計 6300.
 *  - Tc3n 物品 金額 1000 + 「軽減税率を適用しますか？」 いいえ ⇒ 税 100 / 合計 7500; lần hai はい ⇒
 *    2000 / 180 / 2180 / 8580 (:2252-2286).
 *  - Tc3o 返金 自費 1100 ⇒ tách 内税 1000 + 100. ⛔ Quirk WinForm: nhập 返金 KHÔNG gọi dspTotal ⇒
 *    請求合計 / 不足 giữ 6400 (ca parity, assert theo WinForm).
 *  - Tc3p 入金 mode, gõ 自費 金額 100 ⇒ calcClaim đảo về 請求: 5100/510/5610, 合計 6510, 本日入金 0,
 *    nhãn phím về bộ 請求 (:2572-2583).
 *
 * Dữ liệu: 990970. Mỗi ca đặt lại unpaid / person_exp / acc_rate rồi mở lại màn (initProc đọc
 * lại mọi thứ). Không bấm F9.
 */
import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
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

const PAT_NO = SEED_PAT_NO_BASE + 970
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid riêng')

type Row = {
    kmCd: number
    score: number
    claim: number
    tax?: number
    d1?: number
    d9?: number
    rece?: number
    lflg?: number
    trtCnt?: number
}
const BASE: Row[] = [
    { kmCd: 40, score: 300, claim: 900, d1: 50, d9: 250 },
    { kmCd: 50, score: 0, claim: 5000, tax: 500 },
]
type Exp = Partial<Record<'ins_due_bal' | 'own_due_bal' | 'own_due_exc' | 'gds_due_bal' | 'gds_due_exc' | 'dep_due', number>>

async function setState(o: { rows?: Row[]; exp?: Exp; accRate?: number } = {}): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        for (const r of o.rows ?? BASE)
            await c.query(
                `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                     rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
                 VALUES ($1::date, $2, $3, $4, $5, $6, 0, $7, $8, 1, 1, 1, now(), 1, $9, $10, $11)`,
                [TRT_DT, r.trtCnt ?? 1, PAT_NO, r.kmCd, r.score, r.claim, r.tax ?? 0, r.rece ?? -1, r.lflg ?? 0, r.d1 ?? 0, r.d9 ?? 0],
            )
        const e = o.exp ?? {}
        await c.query(
            `UPDATE person_exp SET ins_due_bal = $2, own_due_bal = $3, own_due_exc = $4,
                                   gds_due_bal = $5, gds_due_exc = $6, dep_due = $7 WHERE pat_no = $1`,
            [PAT_NO, e.ins_due_bal ?? 0, e.own_due_bal ?? 0, e.own_due_exc ?? 0, e.gds_due_bal ?? 0, e.gds_due_exc ?? 0, e.dep_due ?? 0],
        )
        await c.query('UPDATE insurance SET acc_rate = $2 WHERE pat_no = $1', [PAT_NO, o.accRate ?? 0])
    })
}

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

test.describe('窓口精算 — phép tính (khớp SeisanCalcTests)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　計算', patKn: 'せいさん　けいさん' })
        await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算計算E2E' }])
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

    // ── locator (cùng cách counter-payment-screen-modes.spec.ts) ─────────────

    const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
    const alert = (): Locator => page.getByRole('alertdialog').last()
    const block = (header: string): Locator =>
        page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
    const sc = (n: number): Locator => (n <= 7 ? block('初・再診料').nth(n - 1) : block('リハビリテーション').nth(n - 8))
    const scoreTotal = (): Locator => block('初・再診料').nth(7)
    const careScore = (): Locator => block('初・再診料').nth(8)
    const scoreInput = (): Locator => block('リハビリテーション').nth(7)
    const careAmount = (): Locator => block('リハビリテーション').nth(8)
    function rowInputs(label: '保 険' | '自 費' | '物 品' | '預 り'): Locator {
        return page
            .locator('div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .filter({ has: page.locator('input') })
            .last()
            .locator('input')
    }
    const H = { total: 0, input: 1, discount: 2, claim: 3, accr: 4, repay: 5 }
    const J = { total: 0, input: 1, discount: 2, tax: 3, claim: 4, accr: 5, repay: 6, repayTax: 7 }
    const B = { total: 0, input: 1, discount: 2, tax: 3, claim: 4, accr: 5 }
    const hoken = (i: number) => rowInputs('保 険').nth(i)
    const jihi = (i: number) => rowInputs('自 費').nth(i)
    const buppin = (i: number) => rowInputs('物 品').nth(i)
    const appr = (): Locator =>
        page.getByText('預り金より入金', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=2][1]').locator('input').nth(0)
    const claimTotal = (): Locator => block('請求金額').nth(0)
    const shortage = (): Locator =>
        page.getByText('請求金額', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=2][1]').locator('input').nth(1)
    const rece = (): Locator => block('本日入金').nth(0)
    const receChange = (): Locator =>
        page.getByText('本日入金', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=2][1]').locator('input').nth(1)
    const accRate = (): Locator =>
        page.getByText('患者番号', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=7][1]').locator('input').last()

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
    async function subtract(box: Locator): Promise<void> {
        await box.click()
        await box.press('NumpadSubtract')
        await step()
    }

    async function open(state: Parameters<typeof setState>[0] = {}): Promise<void> {
        await setState(state)
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({
                    timeout: SCREEN_LOAD_TIMEOUT,
                })
                await expect.poll(() => num(scoreTotal()), { message: 'chờ unpaid nạp xong' }).toBeGreaterThan(0)
                await step()
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    // ── A: giá trị lúc mở ───────────────────────────────────────────────────

    test('C-1 — 未収 từ person_exp vào cột 未収 và 請求合計 (Tc3a)', async () => {
        await open({ exp: { ins_due_bal: 100, own_due_bal: 200, own_due_exc: 20, gds_due_bal: 300, gds_due_exc: 30 } })
        await expectVals('Tc3a', [
            [hoken(H.accr), 100, '保険 未収'],
            [jihi(J.accr), 220, '自費 未収 = 200 + 20'],
            [buppin(B.accr), 330, '物品 未収 = 300 + 30'],
            [claimTotal(), 7050, '請求合計'],
            [shortage(), 7050, '不足'],
        ])
    })

    test('C-2 — 入金指定 rece_amt 3000 ⇒ 本日入金 3000, 不足 3400 (Tc3b)', async () => {
        await open({ rows: [{ ...BASE[0]!, rece: 3000 }, BASE[1]!] })
        await expectVals('Tc3b', [
            [rece(), 3000, '本日入金 = Σ rece_amt'],
            [shortage(), 3400, '不足'],
            [receChange(), 0, 'おつり'],
        ])
    })

    test('C-3 — 介護 (lflg 1) cộng vào 保険 (Tc3c)', async () => {
        await open({ rows: [...BASE, { kmCd: 40, score: 100, claim: 300, lflg: 1, trtCnt: 101 }] })
        await expectVals('Tc3c', [
            [scoreTotal(), 300, '医療保険点数'],
            [careScore(), 100, '介護保険点数'],
            [careAmount(), 300, '介護保険金額'],
            [hoken(H.total), 1200, '保険 金額 = 保険 + 介護'],
            [hoken(H.claim), 1200, '保険 請求'],
            [claimTotal(), 6700, '請求合計'],
        ])
        await captureFixedUi(page, 'counter-payment-calc-kaigo')
    })

    test('C-4 — 負担率 30 lúc mở chỉ hiện, 金額 không tính lại (Tc3d)', async () => {
        await open({ accRate: 30 })
        await expectVals('Tc3d', [
            [accRate(), 30, '負担率'],
            [hoken(H.total), 900, '保険 金額 giữ nguyên unpaid'],
            [hoken(H.claim), 900, '保険 請求'],
        ])
    })

    // ── B: F7 với 預り金 ─────────────────────────────────────────────────────

    test('C-5 — 預り金 5000 < 請求 ⇒ F7: 預り 5000, 本日入金 1400; gõ 預り 9000 bị chặn về 5000 (Tc3e)', async () => {
        await open({ exp: { dep_due: 5000 } })
        await fkey('F7').click()
        await expectVals('Tc3e F7', [
            [appr(), 5000, '預り'],
            [rece(), 1400, '本日入金 = 6400 − 5000'],
            [shortage(), 0, '不足'],
        ])
        await typeEnter(appr(), '9000')
        await expectVals('Tc3e chặn', [
            [appr(), 5000, '預り > 預り金 ⇒ về 預り金'],
            [rece(), 1400, '本日入金'],
        ])
    })

    test('C-6 — 預り金 10000 ≥ 請求 ⇒ F7: 預り 6400, 本日入金 0 (Tc3f)', async () => {
        await open({ exp: { dep_due: 10000 } })
        await fkey('F7').click()
        await expectVals('Tc3f', [
            [appr(), 6400, '預り = 請求合計'],
            [rece(), 0, '本日入金'],
            [shortage(), 0, '不足'],
        ])
    })

    // ── C: 点数 / 負担率 ────────────────────────────────────────────────────

    test('C-7 — 負担率 30, 処置 283 ⇒ 点数 333 ⇒ 999 ⇒ 10円四捨五入 1000 (Tc3g)', async () => {
        await open({ accRate: 30 })
        await typeEnter(sc(9), '283')
        await expectVals('Tc3g', [
            [scoreTotal(), 333, '点数'],
            [hoken(H.total), 1000, '保険 金額'],
            [hoken(H.claim), 1000, '保険 請求'],
            [claimTotal(), 6500, '請求合計'],
        ])
    })

    test('C-8 — 点数入力 100 cộng dồn; phím − trừ lại lần cộng cuối (Tc3h)', async () => {
        await open({ accRate: 30 })
        await typeEnter(scoreInput(), '100')
        await expectVals('Tc3h cộng', [
            [scoreTotal(), 400, '点数'],
            [hoken(H.total), 1200, '保険 金額'],
            [claimTotal(), 6700, '請求合計'],
        ])
        await subtract(scoreInput())
        await expectVals('Tc3h trừ', [
            [scoreTotal(), 300, '点数'],
            [hoken(H.total), 900, '保険 金額'],
            [claimTotal(), 6400, '請求合計'],
        ])
    })

    test('C-9 — gõ 負担率 20 Enter ⇒ 300 × 10 × 20% = 600 (Tc3i)', async () => {
        await open()
        await typeEnter(accRate(), '20')
        await expectVals('Tc3i', [
            [accRate(), 20, '負担率'],
            [hoken(H.total), 600, '保険 金額'],
            [hoken(H.claim), 600, '保険 請求'],
            [claimTotal(), 6100, '請求合計'],
        ])
    })

    // ── D/E: 金額 / 値引 / 消費税 ────────────────────────────────────────────

    test('C-10 — 保険 金額入力 500 cộng dồn; phím − trừ lại (Tc3j)', async () => {
        await open()
        await typeEnter(hoken(H.input), '500')
        await expectVals('Tc3j cộng', [
            [hoken(H.total), 1400, '保険 金額'],
            [hoken(H.claim), 1400, '保険 請求'],
            [claimTotal(), 6900, '請求合計'],
        ])
        await subtract(hoken(H.input))
        await expectVals('Tc3j trừ', [
            [hoken(H.total), 900, '保険 金額'],
            [claimTotal(), 6400, '請求合計'],
        ])
    })

    test('C-11 — 自費 金額入力 1234 ⇒ 外税 四捨五入 623 (Tc3k)', async () => {
        await open()
        await typeEnter(jihi(J.input), '1234')
        await expectVals('Tc3k', [
            [jihi(J.total), 6234, '自費 金額'],
            [jihi(J.tax), 623, '自費 消費税 = 623.4 → 623'],
            [jihi(J.claim), 6857, '自費 請求'],
            [claimTotal(), 7757, '請求合計'],
        ])
    })

    test('C-12 — 保険 値引 100 ⇒ 請求 800 (Tc3m)', async () => {
        await open()
        await typeEnter(hoken(H.discount), '100')
        await expectVals('Tc3m', [
            [hoken(H.discount), 100, '保険 値引'],
            [hoken(H.claim), 800, '保険 請求'],
            [claimTotal(), 6300, '請求合計'],
        ])
    })

    test('C-13 — 物品 金額 1000: 軽減税率 いいえ ⇒ 10%, lần hai はい ⇒ +8% (Tc3n)', async () => {
        await open()
        await typeEnter(buppin(B.input), '1000')
        await expect(alert()).toContainText('軽減税率を適用しますか？')
        await alert().getByRole('button', { name: /^(いいえ|No)$/ }).click()
        await expectVals('Tc3n 標準', [
            [buppin(B.total), 1000, '物品 金額'],
            [buppin(B.tax), 100, '物品 消費税 10%'],
            [buppin(B.claim), 1100, '物品 請求'],
            [claimTotal(), 7500, '請求合計'],
        ])

        await typeEnter(buppin(B.input), '1000')
        await expect(alert()).toContainText('軽減税率を適用しますか？')
        await alert().getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await expectVals('Tc3n 軽減', [
            [buppin(B.total), 2000, '物品 金額'],
            [buppin(B.tax), 180, '物品 消費税 100 + 80'],
            [buppin(B.claim), 2180, '物品 請求'],
            [claimTotal(), 8580, '請求合計'],
        ])
    })

    // ── I: calcClaim trong 入金 mode ───────────────────────────────────────

    test('C-14 — 入金 mode gõ 自費 金額 100 ⇒ đảo về 請求, 本日入金 0 (Tc3p)', async () => {
        await open()
        await fkey('F7').click()
        await expect.poll(() => num(rece())).toBe(6400)
        await typeEnter(jihi(J.input), '100')
        await expectVals('Tc3p', [
            [jihi(J.total), 5100, '自費 金額'],
            [jihi(J.tax), 510, '自費 消費税'],
            [jihi(J.claim), 5610, '自費 請求'],
            [claimTotal(), 6510, '請求合計'],
            [shortage(), 6510, '不足'],
            [rece(), 0, '本日入金'],
        ])
        for (const [k, label] of Object.entries({ F3: '負担', F4: '自費', F5: '区分', F7: '入金' }))
            await expect(fkey(k), `nhãn ${k} về bộ 請求`).toHaveText(new RegExp(label))
    })

    // ── G: 返金 (để cuối: ca parity theo quirk WinForm) ─────────────────────

    test('C-15 — 返金 自費 1100 ⇒ tách 内税 1000 + 100 (Tc3o)', async () => {
        await open()
        await fkey('F6').click()
        await step()
        await typeEnter(jihi(J.repay), '1100')
        await expectVals('Tc3o', [
            [jihi(J.repay), 1000, '自費 返金'],
            [jihi(J.repayTax), 100, '自費 返金税'],
        ])
    })

    test('C-16 (parity) — nhập 返金 KHÔNG đổi 請求合計 / 不足 (Tc3o, quirk WinForm: không gọi dspTotal)', async () => {
        await typeEnter(hoken(H.repay), '500')
        await captureFixedUi(page, 'counter-payment-calc-henkin-total')
        await expectVals('Tc3o tổng', [
            [hoken(H.repay), 500, '保険 返金'],
            [claimTotal(), 6400, '請求合計 giữ nguyên'],
            [shortage(), 6400, '不足 giữ nguyên'],
        ])
    })
})
