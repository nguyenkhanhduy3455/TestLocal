import { type Page } from '@playwright/test'

import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows } from '../_shared/db'
import { allowSave, TODAY_ISO, trtDt } from '../_shared/env'

/**
 * 診療入力 — nút レセプト (P-010 trong tools/parity-snapshot/FINDINGS.md).
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  INP/Forms/frm203002.cs `btnReceipt_Click`:
 *    - 診療年月 < 2018-04 ⇒ W00100 「診療年月が平成３０年３月以前のレセプトは表示できません。」
 *    - còn lại ⇒ `ModSave.ExitWithoutSaving(DialogResult.Yes)` rồi `CommonPrint.directPrint`.
 *  INP/Lib/modSave.cs `ExitWithoutSaving`: CHỈ hỏi khi ChkChangedTrnData thấy sửa đổi —
 *  「処置データは変更されています。保存しますか？」 はい = SaveData / いいえ = RestoreData /
 *  キャンセル = dừng. Không sửa gì ⇒ in thẳng, không hỏi.
 *
 * ─── Bug web trước khi sửa ───────────────────────────────────────────────────
 *  Hộp 「処置データ確認」 bật VÔ ĐIỀU KIỆN, chỉ có キャンセル / はい, và はい chỉ in (không lưu).
 *
 * ─── Đo thế nào ──────────────────────────────────────────────────────────────
 *  "In" = request POST …/rezept-datasource (bước đầu của handlePrintRezept) — không phụ
 *  thuộc agent in. "Lưu" = request POST bulk-save của 診療入力. Làm bẩn lưới bằng
 *  Insert (行追加) trên dòng 再診.
 *  Bệnh nhân seed riêng (SEED_PAT_NO_BASE + 83); TC はい ghi DB của chính bệnh nhân này
 *  (cần TEST_ALLOW_SAVE=1); afterAll xoá hẳn.
 *
 *   npx playwright test tests/fkey-menu/treatment-receipt-save-gate.spec.ts
 */

const PAT_NO = SEED_PAT_NO_BASE + 83
const TRT_DT = trtDt(TODAY_ISO)
/** Tháng trước H30/4 — WinForm chặn bằng W00100. */
const OLD_TRT_DT = '2018-03-15'
/**
 * Tháng chỉ seed trn_trn, không bao giờ lưu qua màn hình ⇒ không có trn_status
 * (TC-4 はい lưu tháng TRT_DT nên tháng đó CÓ trn_status).
 */
const NO_STATUS_TRT_DT = '2024-06-10'
const SAIKOU = { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, jihiFlg: 0, dspTrt: '再診' }
const GRID_LOAD_TIMEOUT = 60_000
const SAVE_PROMPT = /処置データは変更されています。保存しますか？/

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('診療入力 レセプト — chỉ hỏi lưu khi có sửa đổi (btnReceipt_Click → ExitWithoutSaving)', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined
    const posts: string[] = []

    const receiptButton = () => page.getByRole('button', { name: 'レセプト', exact: true })
    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')
    const prompt = () => page.getByText(SAVE_PROMPT)
    /** Nút của hộp 保存しますか — MessageBox YesNoCancel của WinForm: はい / いいえ / キャンセル. */
    const promptButton = (name: 'はい' | 'いいえ' | 'キャンセル') =>
        page.getByRole('dialog').filter({ hasText: SAVE_PROMPT }).getByRole('button', { name, exact: true })
    const printed = () => posts.some((u) => u.includes('rezept-datasource'))
    const saved = () => posts.some((u) => u.includes('/tenant/treatment/bulk-save'))

    async function openGrid(dt: string) {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${dt}`, { waitUntil: 'domcontentloaded' })
        await expect(ryoCells().filter({ hasText: '再診' }).first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * Đóng bản xem レセプト (閉じる) / hộp agent offline (キャンセル) / thông báo (OK) bằng
     * NÚT. Không dùng phím: closeDialogs bấm F10 và Esc là 登録 trên 診療入力 — hộp nào
     * không nuốt phím thì phím rơi xuống màn chính (戻る / 保存しますか).
     */
    async function closeOpenDialogs() {
        const btn = page
            .getByRole('dialog')
            .or(page.getByRole('alertdialog'))
            .getByRole('button', { name: /^(キャンセル|閉じる|OK)$/ })
        // Bản xem / hộp agent offline bật SAU request rezept-datasource — chờ nó ra đã.
        await btn.first().waitFor({ timeout: 5_000 }).catch(() => {})
        for (let i = 0; i < 5; i++) {
            if (!(await btn.count())) return
            await btn.first().click()
            await page.waitForTimeout(500)
        }
    }

    /** Insert trên dòng 再診 ⇒ lưới có sửa đổi chưa lưu. Trả về số dòng trước Insert. */
    async function dirtyGrid(): Promise<number> {
        const before = await ryoCells().count()
        await ryoCells().filter({ hasText: '再診' }).last().click() // last = tháng hiện hành (lưới hiện cả tháng cũ)
        await page.keyboard.press('Insert')
        await expect.poll(() => ryoCells().count(), { timeout: 10_000 }).toBe(before + 1)
        return before
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: PAT_NO, accRate: 30 })
        await seedTreatmentRows(PAT_NO, TRT_DT, [SAIKOU])
        await seedTreatmentRows(PAT_NO, OLD_TRT_DT, [SAIKOU])
        await seedTreatmentRows(PAT_NO, NO_STATUS_TRT_DT, [SAIKOU])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        page.on('request', (req) => {
            if (req.method() === 'POST') posts.push(req.url())
        })
        await openGrid(TRT_DT)
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await deleteTestPatient(PAT_NO).catch(() => {})
    })

    test('TC-1 — lưới sạch: KHÔNG hỏi, in thẳng', async () => {
        posts.length = 0
        await receiptButton().click()
        await expect.poll(printed, { message: 'phải gọi rezept-datasource', timeout: 15_000 }).toBe(true)
        await expect(prompt(), 'không sửa gì thì WinForm không hỏi 保存しますか').toHaveCount(0)
        await closeOpenDialogs()
    })

    test('TC-2 — có sửa đổi + キャンセル: không in, giữ nguyên sửa đổi', async () => {
        const before = await dirtyGrid()
        posts.length = 0
        await receiptButton().click()
        await expect(prompt()).toBeVisible({ timeout: 10_000 })
        await promptButton('キャンセル').click()
        await expect(prompt()).toHaveCount(0)
        await page.waitForTimeout(1_000)
        expect(printed(), 'キャンセル thì không in').toBe(false)
        expect(await ryoCells().count(), 'キャンセル giữ nguyên dòng vừa chèn').toBe(before + 1)
    })

    test('TC-3 — có sửa đổi + いいえ: trả lưới về bản đã lưu rồi in, KHÔNG lưu', async () => {
        const before = (await ryoCells().count()) - 1 // dòng chèn ở TC-2 vẫn còn
        posts.length = 0
        await receiptButton().click()
        await expect(prompt()).toBeVisible({ timeout: 10_000 })
        await promptButton('いいえ').click()
        await expect.poll(printed, { timeout: 15_000 }).toBe(true)
        expect(saved(), 'いいえ không được lưu').toBe(false)
        await closeOpenDialogs()
        await expect.poll(() => ryoCells().count(), { message: 'いいえ = RestoreData', timeout: 10_000 }).toBe(before)
    })

    test('TC-4 — có sửa đổi + はい: lưu RỒI in', async () => {
        test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: はい ghi DB (bệnh nhân seed)')
        await dirtyGrid()
        posts.length = 0
        await receiptButton().click()
        await expect(prompt()).toBeVisible({ timeout: 10_000 })
        await promptButton('はい').click()
        await expect.poll(printed, { timeout: 20_000 }).toBe(true)
        const iSave = posts.findIndex((u) => u.includes('/tenant/treatment/bulk-save'))
        const iPrint = posts.findIndex((u) => u.includes('rezept-datasource'))
        expect(iSave, `はい phải lưu (POST đã gửi: ${posts.join(', ')})`).toBeGreaterThanOrEqual(0)
        expect(iSave, 'lưu phải xảy ra TRƯỚC khi dựng レセプト').toBeLessThan(iPrint)
        await closeOpenDialogs()
    })

    test('TC-5 — 診療年月 trước 2018-04: W00100, không in', async () => {
        await openGrid(OLD_TRT_DT)
        posts.length = 0
        await receiptButton().click()
        await expect(page.getByText('診療年月が平成３０年３月以前のレセプトは表示できません。')).toBeVisible({ timeout: 10_000 })
        expect(printed()).toBe(false)
        await closeOpenDialogs()
    })

    /**
     * Tháng chỉ có trn_trn, không có trn_status ⇒ không có レセプト nào.
     * WinForm directPrint: getTrnStatusDataRcp2 rỗng ⇒ E00024 「印刷用データがありません。」
     * (RCP/Lib/CommonPrint.cs:69-73), không mở bản xem.
     */
    test('TC-6 — tháng không có trn_status: E00024 印刷用データ, không mở bản xem', async () => {
        await openGrid(NO_STATUS_TRT_DT)
        posts.length = 0
        await receiptButton().click()
        await expect.poll(printed, { timeout: 15_000 }).toBe(true)
        await expect(page.getByText('印刷用データがありません。')).toBeVisible({ timeout: 10_000 })
        await expect(page.getByText('診療報酬明細書プレビュー')).toHaveCount(0)
        await closeOpenDialogs()
    })
})
