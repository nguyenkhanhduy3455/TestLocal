/**
 * 窓口精算 — phím chức năng khớp WinForm (frm204001 / frm204002).
 *
 * Nguồn WinForm (src_20261016/OCHACOM/SEISAN/Forms):
 *   - frm204002.btnEndEsc_Click → F9Proc (登録). BaseForm route cả End lẫn ESC vào
 *     đó vì `_endKeyEndTouroku` / `_escapeKeyEndTouroku` mặc định true.
 *   - frm204002.btnF8_Click Shift → callProj(ID202002) 口腔; F10 bên đó quay về 精算.
 *   - frm204002.btnF12_Click Shift → Q00004「お茶コン」 rồi thoát.
 *   - frm204002.changeF7 → nhãn F5 ở chế độ 入金 là 「ﾂﾘ銭」 (nửa độ rộng).
 *   - frm204001: F8 OCHA_OFF (ẩn) ở 患者検索; ở 未精算 luôn bật, delUnPaid tự báo
 *     E00021「削除対象が選択されていません。」 khi chưa tick dòng nào.
 *
 * Ca ESC thật sự 登録 (ghi acc_dat) chỉ chạy khi TEST_ALLOW_SAVE=1.
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
import { GRID_LOAD_ATTEMPTS, allowSave, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 35))
const SELF_SEEDED = Number(PAT_NO) >= SEED_PAT_NO_BASE
const TRT_DT = trtDt('2026-08-03')

const SETTLEMENT_REGISTER_RE = /\/tenant\/settlement\/\d+\/register(\?|$)/
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân 精算 riêng')

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('窓口精算 — phím chức năng khớp WinForm', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        if (!SELF_SEEDED) return
        await seedTestPatient({
            patNo: Number(PAT_NO),
            patNm: 'セイサンキー　患者',
            patKn: 'せいさんきー　かんじゃ',
        })
        // seisan-info INNER JOIN person_exp + trn_trn — thiếu là màn ra 404.
        await withDb(async (c) => {
            await c.query('DELETE FROM person_exp WHERE pat_no = $1', [Number(PAT_NO)])
            await c.query('INSERT INTO person_exp (pat_no) VALUES ($1)', [Number(PAT_NO)])
        })
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            { trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-精算キーE2E' },
        ])
    })

    test.afterAll(async () => {
        if (SELF_SEEDED) {
            await deleteTestPatient(Number(PAT_NO))
            await withDb(async (c) => {
                await c.query('DELETE FROM person_exp WHERE pat_no = $1', [Number(PAT_NO)])
                await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [Number(PAT_NO)])
            })
        }
        await releaseSharedPage(page)
    })

    /** Thanh F-key nằm trên cùng (overlay 精算 render sau shell trong DOM). */
    function fkey(fk: string): Locator {
        return page.locator(`[data-fkey="${fk}"]`).last()
    }

    function topDialog(): Locator {
        return page.locator('[role="alertdialog"], [role="dialog"]').last()
    }

    async function answer(dlg: Locator, ok: boolean): Promise<void> {
        await dlg.getByRole('button', { name: ok ? /^(はい|Yes|OK)$/ : /^(Cancel|キャンセル|いいえ)$/ }).click()
        await step()
    }

    async function openDetail(): Promise<void> {
        // Vite dev thi thoảng nhả hụt một module /src/*.ts (net::ERR_FAILED) → trang
        // trắng mãi; nạp lại như `openTreatmentEntry` (entry.ts).
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

    // ── frm204001 ───────────────────────────────────────────────────────────

    test('TC-1 — 未精算: F8 luôn bật, chưa tick ⇒ E00021「削除対象」', async () => {
        await page.goto('/counter-payments', { waitUntil: 'domcontentloaded' })
        await expect(fkey('F1')).toHaveText(/患者検索/, { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(fkey('F8')).toHaveText(/削除/)
        await expect(fkey('F8')).toBeEnabled()

        await fkey('F8').click()
        const dlg = topDialog()
        await expect(dlg).toContainText('削除対象が選択されていません。')
        await captureFixedUi(page, 'counter-payment-unpaid-f8-e00021')
        await answer(dlg, true)
    })

    test('TC-2 — 患者検索: ô F8 bị ẩn hẳn', async () => {
        await fkey('F1').click()
        await expect(fkey('F1')).toHaveText(/未精算患者/)
        await expect(page.locator('[data-fkey="F8"]')).toHaveCount(0)
        await captureFixedUi(page, 'counter-payment-search-no-f8')
    })

    // ── frm204002 ───────────────────────────────────────────────────────────

    test('TC-3 — chế độ 入金: nhãn F5 là 「ﾂﾘ銭」 (nửa độ rộng)', async () => {
        await openDetail()
        if (/区分/.test(await fkey('F5').innerText())) {
            await fkey('F7').click()
            await step()
        }
        await expect(fkey('F5')).toHaveText(/ﾂﾘ銭/)
        await captureFixedUi(page, 'counter-payment-f5-tsurisen')
    })

    test('TC-4 — Shift+F8 口腔 mở 口腔内情報, F10 quay về 精算', async () => {
        await openDetail()
        await page.keyboard.press('Shift+F8')
        await expect(page).toHaveURL(new RegExp(`/oral-examinations/${PAT_NO}(\\?|$)`), {
            timeout: SCREEN_LOAD_TIMEOUT,
        })
        // URL đổi trước khi màn 口腔 mount: bấm F10 lúc này thì màn 精算 cũ nhận phím.
        await expect(page.getByText('歯牙配列').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await step()

        await page.keyboard.press('F10')
        // 口腔 hỏi 「登録せずに終了してよろしいですか？」 trước khi rời màn.
        const dlg = topDialog()
        await expect(dlg).toContainText('登録せずに終了してよろしいですか？')
        await answer(dlg, true)
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}(\\?|$)`), {
            timeout: SCREEN_LOAD_TIMEOUT,
        })
        await expect(page.getByText('入金日').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    })

    test('TC-5 — Shift+F12 終了 hỏi Q00004「お茶コン」; Cancel ở lại, OK về trang đầu', async () => {
        await openDetail()
        await page.keyboard.press('Shift+F12')
        let dlg = topDialog()
        await expect(dlg).toContainText('お茶コン終了してよろしいですか？')
        await captureFixedUi(page, 'counter-payment-shift-f12-q00004')
        await answer(dlg, false)
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`))

        await page.keyboard.press('Shift+F12')
        dlg = topDialog()
        await expect(dlg).toContainText('お茶コン終了してよろしいですか？')
        await answer(dlg, true)
        await expect(page).not.toHaveURL(/\/counter-payments/)
    })

    for (const key of ['End', 'Escape'] as const) {
        test(`TC-6 — ${key} đi vào F9 登録 (confirm 登録), KHÔNG phải 「登録せずに」`, async () => {
            await openDetail()
            let posted = false
            const onRequest = (r: import('@playwright/test').Request) => {
                if (SETTLEMENT_REGISTER_RE.test(r.url()) && r.method() === 'POST') posted = true
            }
            page.on('request', onRequest)

            await page.keyboard.press(key)
            const dlg = topDialog()
            await expect(dlg).toContainText(/登録して/)
            await expect(dlg).not.toContainText('登録せずに')
            await answer(dlg, false)

            page.off('request', onRequest)
            expect(posted, 'Cancel ở confirm 登録 mà vẫn POST register').toBe(false)
            await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`))
        })
    }

    test('TC-7 — ESC + OK ⇒ POST 精算登録 2xx (ghi acc_dat)', async () => {
        test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: ca này ghi acc_dat thật')
        await openDetail()
        const pending = page.waitForResponse(
            (r) => SETTLEMENT_REGISTER_RE.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60_000 },
        )
        await page.keyboard.press('Escape')
        await answer(topDialog(), true)
        const resp = await pending
        expect(resp.status(), 'POST 精算登録 không trả 2xx').toBeLessThan(300)
    })
})
