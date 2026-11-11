/**
 * 窓口精算 (frm204002) ↔ `/counter-payments/$patNo` — giá trị mở màn, ba chế độ 請求 / 入金 /
 * 返金, lớp Shift, các màn con mở từ phím F, và F10/F11/F12.
 *
 * Phím ESC/End/Shift+F8/Shift+F12 đã ở counter-payment-winform-keys.spec.ts; MaxLength ở
 * counter-payment-maxlength.spec.ts; thuế 自費 ở counter-payment-jihi-tax.spec.ts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÁP ÁN = SỐ ĐO WinForm (fla-ui-tests Tests/Seisan/SeisanStaticUiTests, 18/18, 2026-10-20)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Tc1e: getUnpaid (frm204002.cs:458-485) với cùng seed ⇒ 点数 300 (初・再診料 50, 処置 250),
 *    保険 900/0/900, 自費 5000/0/500/5500, 物品 0, 請求合計 6400, 不足 6400, 本日入金 0, 預り金 0,
 *    負担率 0; 入金区分 = dòng đầu CODMST 17 (đo ra 現金). Vùng 返金 tắt, 点数/金額 bật, 物品税
 *    (txtTaxB) luôn tắt (:246-248, :1995).
 *  - Tc1g: F7 ⇒ 入金 (:2071-2104): 本日入金 = 6400, おつり 0, 不足 0; F7 lần hai về 請求 ⇒ 本日入金
 *    0, 不足 6400.
 *  - Tc1h: F6 ⇒ 返金 (:1009-1028): F2–F5 tắt, vùng 返金 bật, 点数/金額/入金区分 tắt; F7 ⇒ 入金 và
 *    tắt lại vùng 返金 (:1040-1054).
 *  - Bộ phím (SeisanTestBase.cs:29-34):
 *      請求 F1 領収書発行|F2 物品|F3 負担|F4 自費|F5 区分|F6 返金|F7 入金|F8 訂正|F9 登録|F10 戻る|F11 患者選択|F12 メニュー
 *      入金 F3 明細|F4 預り|F5 ﾂﾘ銭|F7 請求 (còn lại như 請求)
 *      Shift (frm204002.cs:148-161) F5 患者登録|F6 カルテ|F7 処置|F8 口腔|F12 終了
 *  - Tc1j: 入金 + 本日入金 1000 < 請求 ⇒ F3 mở 入金明細 [F1 クリア|F9 確定|F10 戻る];
 *    nhận đủ ⇒ I00004 「明細入力は不要です。」 (:937-948).
 *  - Tc1k: F1 ⇒ frm204004 gType.Print [F1 領収書印刷|F2 精算済ﾖﾘ|F3 診療内容ﾖﾘ|F5 明細書印刷|F10 戻る].
 *  - Tc1l: F8 ⇒ frm204004 gType.Update [F8 削除|F9 訂正|F10 戻る].
 *  - Tc1m + frm204002.cs:1340-1410: F10 / F11 / F12 LUÔN hỏi Q00004 「登録せずに終了してよろしいですか？」
 *    [OK|キャンセル], không phụ thuộc có sửa hay không. OK: F10 ⇒ màn trước, F11 ⇒ 未精算 (204001),
 *    F12 ⇒ MENU.
 *
 * Dữ liệu: 990966, 2 dòng unpaid giống seed FlaUI (保険 km 40: 300点/900円, score_d_1 50,
 * score_d_9 250; 自費 km 50: 5000 + 税 500). Không bấm F9 — spec không ghi acc_dat.
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

const PAT_NO = SEED_PAT_NO_BASE + 966
const TRT_DT = trtDt('2026-08-03')
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid riêng')

const FK_SEIKYU = {
    F1: '領収書発行', F2: '物品', F3: '負担', F4: '自費', F5: '区分', F6: '返金',
    F7: '入金', F8: '訂正', F9: '登録', F10: '戻る', F11: '患者選択', F12: 'メニュー',
}
const FK_NYUKIN = { ...FK_SEIKYU, F3: '明細', F4: '預り', F5: 'ﾂﾘ銭', F7: '請求' }

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　モード', patKn: 'せいさん　もーど' })
    // seisan-info INNER JOIN trn_trn — thiếu là màn ra 404.
    await seedTreatmentRows(PAT_NO, TRT_DT, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算モードE2E' }])
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        const insert = `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax,
                                            rece_amt, rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg,
                                            score_d_1, score_d_9)
                        VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0, $7, $8)`
        await c.query(insert, [TRT_DT, PAT_NO, 40, 300, 900, 0, 50, 250])
        await c.query(insert, [TRT_DT, PAT_NO, 50, 0, 5000, 500, 0, 0])
    })
})

test.afterAll(async () => {
    if (!dbEnabled) return
    await withDb(async (c) => {
        await c.query('DELETE FROM unpaid WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM unpaid_deleted WHERE pat_no = $1', [PAT_NO])
        await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [PAT_NO])
    })
    await deleteTestPatient(PAT_NO)
})

test.describe('窓口精算 — mở màn, chế độ 請求/入金/返金, màn con, rời màn', () => {
    test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    // ── locator ─────────────────────────────────────────────────────────────

    const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
    const top = (): Locator => page.locator('[role="alertdialog"], [role="dialog"]').last()
    const alert = (): Locator => page.getByRole('alertdialog').last()

    /** Khối có tiêu đề `header` (hàng tiêu đề xanh + hàng ô) — mọi input trong khối, theo thứ tự. */
    function block(header: string): Locator {
        return page
            .getByText(header, { exact: true })
            .first()
            .locator('xpath=ancestor::div[.//input][1]')
            .locator('input')
    }
    /** 点数: khối 1 = 初・再診料…注射 (txtSc1-7), 医療保険点数, 介護保険点数; khối 2 = リハビリ…その他 (txtSc8-14). */
    const sc = (n: number): Locator => (n <= 7 ? block('初・再診料').nth(n - 1) : block('リハビリテーション').nth(n - 8))
    const scoreTotal = (): Locator => block('初・再診料').nth(7)
    /** Hàng 保険/自費/物品 của lưới 金額…返金 (cùng cách counter-payment-jihi-tax.spec.ts). */
    function rowInputs(label: '保 険' | '自 費' | '物 品'): Locator {
        return page
            .locator('div')
            .filter({ has: page.getByText(label, { exact: true }) })
            .filter({ has: page.locator('input') })
            .last()
            .locator('input')
    }
    // 保険: [金額計, 金額入力, 値引, 請求, 未収, 返金]; 自費: [金額計, 金額入力, 値引, 消費税, 請求, 未収, 返金, 返金税];
    // 物品: [金額計, 金額入力, 値引, 消費税, 請求, 未収, 返金, 返金税].
    const H = { total: 0, input: 1, discount: 2, claim: 3, repay: 5 }
    const J = { total: 0, input: 1, discount: 2, tax: 3, claim: 4, repay: 6, repayTax: 7 }
    const B = { total: 0, input: 1, discount: 2, tax: 3, claim: 4, repay: 6 }
    const claimTotal = (): Locator => block('請求金額').nth(0)
    const shortage = (): Locator =>
        page.getByText('請求金額', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=2][1]').locator('input').nth(1)
    const rece = (): Locator => block('本日入金').nth(0)
    const receChange = (): Locator =>
        page.getByText('本日入金', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=2][1]').locator('input').nth(1)
    const deposit = (): Locator => block('預り金').nth(0)
    /** 負担率 — ô sửa được duy nhất trong khung 患者番号. */
    const accRate = (): Locator =>
        page.getByText('患者番号', { exact: true }).first().locator('xpath=ancestor::div[count(.//input)>=7][1]').locator('input').last()
    const receKbn = (): Locator => page.getByText('入金区分', { exact: true }).first().locator('..').getByRole('combobox')

    async function num(box: Locator): Promise<number> {
        return Number((await box.inputValue()).replace(/,/g, '') || '0')
    }
    async function expectNum(box: Locator, want: number, what: string): Promise<void> {
        await expect.poll(() => num(box), { message: what }).toBe(want)
    }
    async function expectKeys(want: Record<string, string>, where: string): Promise<void> {
        for (const [k, label] of Object.entries(want)) await expect(fkey(k), `${where}: ${k}`).toHaveText(new RegExp(label))
    }
    async function expectLocked(boxes: Locator[], locked: boolean, what: string): Promise<void> {
        for (const [i, b] of boxes.entries()) {
            const isLocked = (await b.getAttribute('readonly')) !== null || (await b.isDisabled())
            expect(isLocked, `${what} #${i}`).toBe(locked)
        }
    }

    async function openDetail(): Promise<void> {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByText('入金日').first(), 'overlay 窓口精算 không mở').toBeVisible({
                    timeout: SCREEN_LOAD_TIMEOUT,
                })
                await expectNum(claimTotal(), 6400, 'chờ dữ liệu unpaid nạp xong')
                await step()
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    // ── 請求 ────────────────────────────────────────────────────────────────

    test('TC-1 — mở màn: giá trị từ unpaid (Tc1e, getUnpaid frm204002.cs:458-485)', async () => {
        await openDetail()
        await expect(page.getByRole('alertdialog'), 'FST_VISIT_FLG = 0 ⇒ không hỏi Q00017').toHaveCount(0)
        await expect(page.getByText(/窓\s*口\s*精\s*算/).first()).toBeVisible()
        await expectKeys(FK_SEIKYU, '請求')

        await expectNum(scoreTotal(), 300, '医療保険点数')
        await expectNum(sc(1), 50, '初・再診料 = score_d_1')
        await expectNum(sc(9), 250, '処置 = score_d_9')
        await expectNum(sc(2), 0, '医学管理料')
        await expectNum(rowInputs('保 険').nth(H.total), 900, '保険 金額')
        await expectNum(rowInputs('保 険').nth(H.discount), 0, '保険 値引')
        await expectNum(rowInputs('保 険').nth(H.claim), 900, '保険 請求')
        await expectNum(rowInputs('自 費').nth(J.total), 5000, '自費 金額')
        await expectNum(rowInputs('自 費').nth(J.discount), 0, '自費 値引')
        await expectNum(rowInputs('自 費').nth(J.tax), 500, '自費 消費税')
        await expectNum(rowInputs('自 費').nth(J.claim), 5500, '自費 請求 = 金額 − 値引 + 税')
        await expectNum(rowInputs('物 品').nth(B.total), 0, '物品 金額')
        await expectNum(rowInputs('物 品').nth(B.claim), 0, '物品 請求')
        await expectNum(claimTotal(), 6400, '請求合計')
        await expectNum(shortage(), 6400, '不足')
        await expectNum(rece(), 0, '本日入金')
        await expectNum(deposit(), 0, '預り金')
        await expectNum(accRate(), 0, '負担率')
        await expect(receKbn(), '入金区分 = dòng đầu CODMST 17 (WinForm đo ra 現金)').toHaveText(/現金/)
        await captureFixedUi(page, 'counter-payment-open-seikyu')
    })

    test('TC-2 — 請求: vùng 返金 khoá, vùng 点数/金額/値引 mở, 物品消費税 luôn khoá (:246-248, :1995)', async () => {
        await expectLocked(
            [rowInputs('保 険').nth(H.repay), rowInputs('自 費').nth(J.repay), rowInputs('自 費').nth(J.repayTax),
             rowInputs('物 品').nth(B.repay), rowInputs('物 品').nth(B.tax)],
            true,
            '返金 + 物品税',
        )
        await expectLocked(
            [sc(1), sc(14), rowInputs('保 険').nth(H.input), rowInputs('自 費').nth(J.input), rowInputs('物 品').nth(B.input),
             rowInputs('保 険').nth(H.discount), rowInputs('自 費').nth(J.discount), rowInputs('物 品').nth(B.discount),
             rowInputs('自 費').nth(J.tax)],
            false,
            '点数/金額/値引/自費税',
        )
        await expect(receKbn()).toBeEnabled()
    })

    // ── 入金 ────────────────────────────────────────────────────────────────

    test('TC-3 — F7 ⇒ 入金: 本日入金 = 請求合計, 不足 0; F7 lần hai về 請求 (Tc1g, :2071-2127)', async () => {
        await fkey('F7').click()
        await expectKeys(FK_NYUKIN, '入金')
        await expectNum(rece(), 6400, '本日入金 tự điền = 請求合計')
        await expectNum(receChange(), 0, 'おつり')
        await expectNum(shortage(), 0, '不足')
        await captureFixedUi(page, 'counter-payment-open-nyukin')

        await fkey('F7').click()
        await expectKeys(FK_SEIKYU, 'về 請求')
        await expectNum(rece(), 0, '本日入金 về 0')
        await expectNum(shortage(), 6400, '不足 về 6400')
    })

    // ── 返金 ────────────────────────────────────────────────────────────────

    test('TC-4 — F6 ⇒ 返金: F2–F5 tắt, vùng 返金 mở, 点数/金額/入金区分 khoá (Tc1h, :1009-1028)', async () => {
        await fkey('F6').click()
        await step()
        for (const k of ['F2', 'F3', 'F4', 'F5']) await expect(fkey(k), `返金: ${k} tắt`).toBeDisabled()
        for (const k of ['F1', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) await expect(fkey(k), `返金: ${k} bật`).toBeEnabled()
        await expectLocked(
            [rowInputs('保 険').nth(H.repay), rowInputs('自 費').nth(J.repay), rowInputs('自 費').nth(J.repayTax),
             rowInputs('物 品').nth(B.repay)],
            false,
            '返金',
        )
        await expectLocked(
            [sc(1), sc(14), rowInputs('保 険').nth(H.input), rowInputs('自 費').nth(J.input),
             rowInputs('保 険').nth(H.discount), rowInputs('自 費').nth(J.discount), rowInputs('自 費').nth(J.tax)],
            true,
            '点数/金額/値引/税',
        )
        await expect(receKbn()).toBeDisabled()
        await captureFixedUi(page, 'counter-payment-open-henkin')
    })

    test('TC-5 — 返金 rồi F7 ⇒ 入金, vùng 返金 khoá lại, 点数/金額 mở (Tc1h, :1040-1054)', async () => {
        await fkey('F7').click()
        await expectKeys(FK_NYUKIN, '返金 → F7')
        await expectLocked([rowInputs('保 険').nth(H.repay)], true, '返金')
        await expectLocked([sc(1), rowInputs('自 費').nth(J.input)], false, '点数/金額')
        await expect(receKbn()).toBeEnabled()
        await fkey('F7').click()
        await expectKeys(FK_SEIKYU, 'về 請求')
    })

    // ── Shift ───────────────────────────────────────────────────────────────

    test('TC-6 — lớp Shift: F5 患者登録 / F6 カルテ / F7 処置 / F8 口腔 / F12 終了 (frm204002.cs:148-161)', async () => {
        await page.keyboard.down('Shift')
        try {
            const want = { F5: '患者登録', F6: 'カルテ', F7: '処置', F8: '口腔', F12: '終了' }
            await expectKeys(want, 'Shift')
            for (const k of ['F1', 'F2', 'F3', 'F4', 'F9', 'F10', 'F11']) {
                const cell = page.locator(`[data-fkey="${k}"]`)
                if ((await cell.count()) > 0) await expect(cell.last(), `Shift: ${k} trống`).not.toHaveText(/[一-龯ぁ-んァ-ヶｦ-ﾟ]/)
            }
        } finally {
            await page.keyboard.up('Shift')
        }
        await expectKeys(FK_SEIKYU, 'nhả Shift')
    })

    // ── Màn con ─────────────────────────────────────────────────────────────

    test('TC-7 — 入金 + 本日入金 < 請求 ⇒ F3 mở 入金明細 [F1 クリア|F9 確定|F10 戻る] (Tc1j, :937-948)', async () => {
        await fkey('F7').click()
        await rece().click()
        await rece().press('ControlOrMeta+a')
        await rece().pressSequentially('1000')
        await rece().press('Enter')
        await expectNum(rece(), 1000, '本日入金')
        await expectNum(shortage(), 5400, '不足 = 6400 − 1000')
        await expectNum(receChange(), 0, 'おつり')

        await fkey('F3').click()
        const d = page.getByRole('dialog').filter({ has: page.locator('[data-fkey="F9"]') }).last()
        await expect(d).toContainText(/入\s*金\s*明\s*細/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(d.locator('[data-fkey="F1"]')).toHaveText(/クリア/)
        await expect(d.locator('[data-fkey="F9"]')).toHaveText(/確定/)
        await expect(d.locator('[data-fkey="F10"]')).toHaveText(/戻る/)
        await captureFixedUi(page, 'counter-payment-deposit-detail')
        await d.locator('[data-fkey="F10"]').click()
        await expect(d).toBeHidden()
    })

    test('TC-8 — 入金 nhận đủ ⇒ F3 báo I00004 「明細入力は不要です。」 (:937-948)', async () => {
        await fkey('F7').click() // về 請求
        await fkey('F7').click() // 入金 — tự điền đủ
        await expectNum(shortage(), 0, '不足 0')
        await fkey('F3').click()
        await expect(alert()).toContainText('明細入力は不要です。')
        await alert().getByRole('button', { name: /^(OK|閉じる)$/ }).click()
        await fkey('F7').click()
        await expectKeys(FK_SEIKYU, 'về 請求')
    })

    test('TC-9 — F1 ⇒ 領収書印刷 [F1 領収書印刷|F2 精算済ﾖﾘ|F3 診療内容ﾖﾘ|F5 明細書印刷|F10 戻る] (Tc1k)', async () => {
        await fkey('F1').click()
        const d = page.getByRole('dialog').last()
        await expect(d).toContainText(/領\s*収\s*書\s*印\s*刷/, { timeout: SCREEN_LOAD_TIMEOUT })
        const want = { F1: '領収書印刷', F2: '精算済ﾖﾘ', F3: '診療内容ﾖﾘ', F5: '明細書印刷', F10: '戻る' }
        for (const [k, label] of Object.entries(want)) await expect(d.locator(`[data-fkey="${k}"]`), k).toHaveText(new RegExp(label))
        await captureFixedUi(page, 'counter-payment-receipt-print')
        await d.locator('[data-fkey="F10"]').click()
        await expect(d).toBeHidden({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('TC-10 — F8 ⇒ 精算データ訂正 [F8 削除|F9 訂正|F10 戻る] (Tc1l)', async () => {
        await fkey('F8').click()
        const d = page.getByRole('dialog').last()
        await expect(d).toContainText(/精\s*算\s*デ\s*ー\s*タ\s*訂\s*正/, { timeout: SCREEN_LOAD_TIMEOUT })
        const want = { F8: '削除', F9: '訂正', F10: '戻る' }
        for (const [k, label] of Object.entries(want)) await expect(d.locator(`[data-fkey="${k}"]`), k).toHaveText(new RegExp(label))
        await d.locator('[data-fkey="F10"]').click()
        await expect(d).toBeHidden({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    // ── Rời màn ─────────────────────────────────────────────────────────────

    for (const k of ['F10', 'F11'] as const) {
        test(`TC-11 — ${k} khi CHƯA sửa vẫn hỏi Q00004 「登録せずに終了してよろしいですか？」 [OK|キャンセル]; キャンセル ở lại`, async () => {
            await openDetail()
            await fkey(k).click()
            await expect(alert()).toContainText('登録せずに終了してよろしいですか？')
            await expect(alert().getByRole('button', { name: /^OK$/ })).toBeVisible()
            await alert().getByRole('button', { name: /^(キャンセル|Cancel)$/ }).click()
            await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`))
            await expect(page.getByRole('dialog')).toHaveCount(0)
        })
    }

    test('TC-12 — F11 + OK ⇒ về 窓口精算（患者選択）(frm204002.cs:1365-1380)', async () => {
        await fkey('F11').click()
        await alert().getByRole('button', { name: /^OK$/ }).click()
        await expect(page).toHaveURL(/\/counter-payments(\?|$)/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.locator('[data-fkey="F1"]').last()).toHaveText(/患者検索|未精算患者/)
    })

    // BỎ QUA — web CỐ Ý lệch WinForm (xác nhận 2026-11-02): F12 mở thẳng hộp メニュー
    // (counter-payment-detail.tsx F12 → setMenuOpen), Q00004 chỉ hỏi SAU khi chọn mục (menuGate qua
    // menuNavigate). WinForm hỏi Q00004 TRƯỚC rồi mới mở MENU (frm204002.cs:1398-1400). Vẫn không mất
    // dữ liệu ngầm, chỉ khác thứ tự. Giữ thân test làm mốc nếu sau này đổi sang hỏi trước.
    test.skip('TC-13 (parity) — F12 khi CHƯA sửa hỏi Q00004 TRƯỚC khi mở メニュー; キャンセル ở lại (:1398-1400)', async () => {
        await openDetail()
        await fkey('F12').click()
        await expect(alert()).toContainText('登録せずに終了してよろしいですか？')
        await captureFixedUi(page, 'counter-payment-f12-q00004')
        await alert().getByRole('button', { name: /^(キャンセル|Cancel)$/ }).click()
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`))
    })

    test('TC-14 — F12 + OK ⇒ メニュー (frm204002.cs:1398-1407)', async () => {
        await openDetail()
        await fkey('F12').click()
        // Hộp Q00004 có hay không là chuyện của TC-13; ở đây chỉ đo F12 (+ OK) dẫn tới メニュー.
        const ok = alert().getByRole('button', { name: /^OK$/ })
        if (await ok.isVisible({ timeout: 3_000 }).catch(() => false)) await ok.click()
        await expect(page.getByRole('dialog').filter({ hasText: /メ\s*ニ\s*ュ\s*ー|日常業務/ }).last()).toBeVisible({
            timeout: SCREEN_LOAD_TIMEOUT,
        })
        await page.keyboard.press('Escape')
    })
})
