/**
 * 窓口精算 — 自費消費税 + 値引 khớp WinForm (frm204002).
 *
 * Đáp án là SỐ ĐO WinForm, không phải công thức tự nghĩ: fla-ui-tests
 * Tests/Seisan/SeisanTaxMatrixTests (19/19) + SeisanCalcTests (16/16), 2026-10-20.
 *
 *   calcTax(int, int, int, int, int, float) (frm204002.cs:2497-2545) tính với thuế suất
 *   `float` rồi ép `(decimal)` (~7 chữ số) ⇒ 1100 内税 10% ra ĐÚNG 100 (double: 101 khi 切り上げ).
 *   calcTax(dType.Jihi, …) (:2365-2430) với 内税: amount = 金額 + 税 − 値引, 金額 = amount − 税
 *   ⇒ 請求 không cộng thêm thuế.
 *   txtDiscountX_KeyDown: 値引 > 金額 ⇒ trả về 値引 đã xác nhận trước đó, không báo lỗi.
 *
 * Ca ma trận đổi `tenant_config.acc.jTaxKbn/jCalcKbn` (DB + DEL cache Redis qua docker) rồi
 * trả lại ở afterAll. Máy không có container Redis ⇒ các ca đó tự skip.
 * Không bấm F9 — spec không ghi acc_dat.
 */
import { execSync } from 'node:child_process'

import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 37
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000
const REDIS_CONTAINER = process.env.TEST_REDIS_CONTAINER ?? 'ochacom_redis'
const REDIS_PASS = process.env.TEST_REDIS_PASSWORD ?? 'ochacom_redis_pass'

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân 精算 + UNPAID riêng')

/** DEL cache config của ConfigStore — sửa tenant_config bằng SQL không ăn nếu thiếu bước này. */
function flushConfigCache(): boolean {
    try {
        const redis = `docker exec -i ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASS} --no-auth-warning`
        execSync(`${redis} --scan --pattern 'tenant:*:cache:config:*' | xargs -r ${redis} DEL`, { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

const canChangeConfig = dbEnabled && flushConfigCache()

type UnpaidRow = { kmCd: number; score: number; claim: number; tax: number }
const HOKEN: UnpaidRow = { kmCd: 40, score: 300, claim: 900, tax: 0 }
const JIHI: UnpaidRow = { kmCd: 50, score: 0, claim: 5000, tax: 500 }

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('窓口精算 — 自費消費税・値引 khớp WinForm', () => {
    let page: Page
    let step: () => Promise<void>
    let savedTax: { jTaxKbn: number; jCalcKbn: number } | null = null

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン税　患者', patKn: 'せいさんぜい　かんじゃ' })
        // seisan-info INNER JOIN trn_trn — thiếu là màn ra 404.
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算税E2E' },
        ])
        savedTax = await withDb(async (c) => {
            const r = await c.query(
                `SELECT (value->>'jTaxKbn')::int AS "jTaxKbn", (value->>'jCalcKbn')::int AS "jCalcKbn"
                   FROM tenant_config WHERE namespace = 'acc'`,
            )
            return r.rows[0] ?? null
        })
    })

    test.afterAll(async () => {
        if (savedTax && canChangeConfig) await setJihiTax(savedTax.jTaxKbn, savedTax.jCalcKbn)
        await withDb(async (c) => {
            await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
            await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
            await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
        })
        await deleteTestPatient(PAT_NO)
        await releaseSharedPage(page)
    })

    async function setJihiTax(jTaxKbn: number, jCalcKbn: number): Promise<void> {
        await withDb((c) =>
            c.query(
                `UPDATE tenant_config
                    SET value = jsonb_set(jsonb_set(value, '{jTaxKbn}', to_jsonb($1::int)), '{jCalcKbn}', to_jsonb($2::int))
                  WHERE namespace = 'acc'`,
                [jTaxKbn, jCalcKbn],
            ),
        )
        expect(flushConfigCache(), 'không xoá được cache config trong Redis').toBe(true)
    }

    async function seedUnpaid(rows: UnpaidRow[]): Promise<void> {
        await withDb(async (c) => {
            await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
            for (const r of rows)
                await c.query(
                    `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                         rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg)
                     VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0)`,
                    [TRT_DT, PAT_NO, r.kmCd, r.score, r.claim, r.tax],
                )
        })
    }

    async function openDetail(): Promise<void> {
        // Vite dev thi thoảng nhả hụt một module ⇒ trang trắng; nạp lại.
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({
                    timeout: SCREEN_LOAD_TIMEOUT,
                })
                await step()
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    /**
     * Các ô của một hàng 保険 / 自費 trong lưới 金額…返金. 自費: [金額計, 金額入力, 値引,
     * 消費税, 請求, 未収, 返金, 返金税]; 保険: [金額計, 金額入力, 値引, 請求, 未収, 返金].
     */
    function rowInputs(label: '保 険' | '自 費'): Locator {
        return page
            .locator('div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .filter({ has: page.locator('input') })
            .last()
            .locator('input')
    }
    const jihi = (i: number) => rowInputs('自 費').nth(i)
    const hoken = (i: number) => rowInputs('保 険').nth(i)
    const J = { total: 0, discount: 2, tax: 3, claim: 4, repay: 6, repayTax: 7 }
    const H = { discount: 2, claim: 3 }

    async function typeEnter(box: Locator, text: string): Promise<void> {
        await box.click()
        await box.press('ControlOrMeta+a')
        await box.pressSequentially(text)
        await box.press('Enter')
        await step()
    }

    async function expectNumber(box: Locator, want: number, what: string): Promise<void> {
        await expect.poll(async () => Number((await box.inputValue()).replace(/,/g, '')), { message: what }).toBe(want)
    }

    // ── Ma trận 自費消費税 (値引 0 Enter ⇒ calcTax(dType.Jihi, …, flg: false)) ──────

    const MATRIX: { tax: 1 | 2; calc: number; amount: number; taxJ: number }[] = [
        { tax: 1, calc: 2, amount: 1234, taxJ: 124 },
        { tax: 1, calc: 6, amount: 1250, taxJ: 130 },
        { tax: 2, calc: 1, amount: 1234, taxJ: 112 },
        { tax: 2, calc: 2, amount: 1234, taxJ: 113 },
        { tax: 2, calc: 3, amount: 1234, taxJ: 112 },
        { tax: 2, calc: 5, amount: 1234, taxJ: 120 },
        { tax: 2, calc: 2, amount: 1100, taxJ: 100 },
        { tax: 2, calc: 5, amount: 1100, taxJ: 100 },
    ]

    for (const m of MATRIX) {
        const kind = m.tax === 1 ? '外税' : '内税'
        test(`TC-1 — ${kind} 端数${m.calc} 金額 ${m.amount}: 消費税 ${m.taxJ}`, async () => {
            test.skip(!canChangeConfig, `không DEL được Redis trong container ${REDIS_CONTAINER} ⇒ không đổi được jTaxKbn/jCalcKbn`)
            await setJihiTax(m.tax, m.calc)
            await seedUnpaid([{ kmCd: 50, score: 0, claim: m.amount, tax: 0 }])
            await openDetail()
            await typeEnter(jihi(J.discount), '0')

            // 内税: 金額 = amount − 税, 請求 = amount (thuế nằm TRONG số tiền)
            const total = m.tax === 2 ? m.amount - m.taxJ : m.amount
            await expectNumber(jihi(J.tax), m.taxJ, `${kind} 端数${m.calc} ${m.amount}: 消費税`)
            await expectNumber(jihi(J.total), total, `${kind}: 金額`)
            await expectNumber(jihi(J.claim), total + m.taxJ, `${kind}: 請求`)
            if (m.tax === 2 && m.amount === 1100 && m.calc === 2) await captureFixedUi(page, 'counter-payment-jihi-naizei-1100')
        })
    }

    for (const calc of [2, 5]) {
        test(`TC-2 — 返金 自費 1100, 端数${calc}: tách 内税 100`, async () => {
            test.skip(!canChangeConfig, `không DEL được Redis trong container ${REDIS_CONTAINER}`)
            await setJihiTax(1, calc)
            await seedUnpaid([HOKEN, JIHI])
            await openDetail()
            await page.keyboard.press('F6')
            await step()
            await typeEnter(jihi(J.repay), '1100')
            await expectNumber(jihi(J.repayTax), 100, `返金 端数${calc}: 消費税`)
            await expectNumber(jihi(J.repay), 1000, `返金 端数${calc}: 返金額`)
        })
    }

    // ── 値引 > 金額 ⇒ trả về 値引 đã xác nhận trước (không báo lỗi) ────────────────

    test('TC-3 — 自費値引: vượt 金額 ⇒ về giá trị xác nhận trước, không báo lỗi', async () => {
        if (savedTax && canChangeConfig) await setJihiTax(savedTax.jTaxKbn, savedTax.jCalcKbn)
        await seedUnpaid([HOKEN, JIHI])
        await openDetail()

        await typeEnter(jihi(J.discount), '99999')
        await expectNumber(jihi(J.discount), 0, '値引 99999 > 金額 5000 ⇒ về 0 (chưa xác nhận lần nào)')
        await expectNumber(jihi(J.tax), 500, '消費税 không tính lại')
        await expect(page.getByText('自費値引は自費金額を超えることはできません')).toHaveCount(0)
        await captureFixedUi(page, 'counter-payment-jihi-discount-revert')

        await typeEnter(jihi(J.discount), '234')
        await expectNumber(jihi(J.tax), 477, '値引 234 ⇒ (5000 − 234) × 10% = 476.6 ⇒ 477')
        await expectNumber(jihi(J.claim), 5243, '請求 = 5000 − 234 + 477')

        await typeEnter(jihi(J.discount), '99999')
        await expectNumber(jihi(J.discount), 234, '値引 vượt 金額 lần nữa ⇒ về 234 vừa xác nhận')
    })

    test('TC-4 — 保険値引: vượt 金額 ⇒ về giá trị xác nhận trước', async () => {
        await openDetail()
        await typeEnter(hoken(H.discount), '99999')
        await expectNumber(hoken(H.discount), 0, '値引 99999 > 金額 900 ⇒ về 0')
        await expectNumber(hoken(H.claim), 900, '請求 không đổi')
        await expect(page.getByText('保険値引は保険金額を超えることはできません')).toHaveCount(0)
    })
})
