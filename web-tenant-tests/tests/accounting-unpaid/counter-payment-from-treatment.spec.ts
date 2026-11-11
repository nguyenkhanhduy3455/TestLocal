/**
 * 窓口精算 mở từ 診療入力 F8 会計 (frm203002.IDM_Acc_Click → frm204002).
 *
 * ĐÁP ÁN = WinForm (đọc source):
 *  - F8 (accButton ≠ 0): LetAccData2 ghi 未精算 rồi đẩy ID203001 (診療入力：患者選択) vào lịch sử, đặt
 *    raiin_cnt/TrtDt và mở 窓口精算 (frm203002.cs:7725-7755).
 *  - 窓口精算 hiện 未精算 vừa ghi: 初・再診料 + các cột theo SCORE_D*, 医療保険点数 = tổng (frm204002.initProc).
 *  - Shift+F7 処置 ⇒ 診療入力 hôm nay; F10 ở đó ⇒ về lại 窓口精算 (callProj :1119-1125).
 *  - ⛔ F10 + Q00004 OK (:1340-1358), ESC/End = 登録 (:1101-1115), F9 登録 (:1084-1096) đều
 *    `showForm(CommonHistory.getHistory())` ⇒ về 診療入力：患者選択 (web: /treatments), KHÔNG về 未精算患者一覧.
 *
 * Dữ liệu: 990990 (社保・本人 qua med_ins_inf fm_type 1, 負担/会計 30%), trn_trn hôm nay 再診 110/59 + 209/40 —
 * cùng dữ liệu với probe FlaUI SeisanFromTreatmentProbeTests (TRNTRN PRICE = TRT_PT).
 * F8 ghi unpaid thật, ESC ghi acc_dat thật ⇒ cần TEST_DB=1 + TEST_ALLOW_SAVE=1; afterAll xoá sạch.
 */
import { type Locator, type Page } from '@playwright/test'

import { ACC_BUTTON, routeAccButton, type AccButtonRoute } from '../_shared/acc-button'
import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { allowSave } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 990
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const SCREEN_LOAD_TIMEOUT = 60_000

skipWithReason(!dbEnabled || !allowSave, 'Cần TEST_DB=1 + TEST_ALLOW_SAVE=1: F8 ghi unpaid, ESC ghi acc_dat thật')

// Cả file chung MỘT bệnh nhân seed (990990) ở beforeAll/afterAll cấp file. Config để
// fullyParallel + 4 worker ⇒ không ghim thì mỗi describe sang một worker, seed đụng nhau
// (duplicate ux_person) và worker này xoá unpaid/acc_dat khi worker kia đang F8.
// 'default' = một worker, đúng thứ tự, nhưng test đỏ không kéo test sau skip theo.
test.describe.configure({ mode: 'default', retries: 0, timeout: 240_000 })

let page: Page
let step: () => Promise<void>
let accButton: AccButtonRoute | undefined
let disposeOverlays: (() => Promise<void>) | undefined

const PAT_TABLES = ['unpaid', 'unpaid_deleted', 'acc_dat', 'acc_dat_deleted', 'med_ins_inf', 'med_ins_inf_deleted']

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　処置', patKn: 'せいさん　しょち' })
    // AccTypeResolver: ins_kbn 1 + fm_type 1 ⇒ km_cd 40 (社保・本人). Thiếu med_ins_inf thì km_cd 0 và 精算 hiện toàn 0.
    await withDb(async (c) => {
        for (const t of PAT_TABLES) await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [PAT_NO])
        await c.query('INSERT INTO med_ins_inf (pat_no, medinsinf_no, fm_type, ben_rate) VALUES ($1, 1, 1, 70)', [PAT_NO])
        // 負担/会計割合 30% như bệnh nhân mẫu bên WinForm (INSURANCE BUR_RATE = ACC_RATE = 30).
        await c.query('UPDATE insurance SET medinsinf_no = 1, bur_rate = 30, acc_rate = 30 WHERE pat_no = $1', [PAT_NO])
    })
    await seedTreatmentRows(PAT_NO, TODAY, [
        { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '再診' },
        { trtCd: 209, trtSb: 0, trtPt: 40, trtCnt: 1, dspTrt: '処置-G8' },
    ])
    accButton = await routeAccButton(page, ACC_BUTTON.Acc)
    disposeOverlays = await installOverlayHandlers(page, { santei: true })
})

test.afterAll(async () => {
    await accButton?.dispose()
    await disposeOverlays?.()
    await withDb(async (c) => {
        for (const t of PAT_TABLES) await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [PAT_NO])
    })
    await deleteTestPatient(PAT_NO)
    await releaseSharedPage(page)
})

// ── locator (cùng cách counter-payment-calc.spec.ts) ────────────────────────

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const block = (header: string): Locator =>
    page.getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
const firstVisit = (): Locator => block('初・再診料').nth(0)
const scoreTotal = (): Locator => block('初・再診料').nth(7)
const surgery = (): Locator => block('リハビリテーション').nth(2)
const claimTotal = (): Locator => block('請求金額').nth(0)
const anyDialog = (): Locator => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last()

async function num(box: Locator): Promise<number> {
    return Number((await box.inputValue()).replace(/,/g, '') || '0')
}
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/** Trả lời một hộp: nút đầu tiên có trong `names` (theo thứ tự). Không còn hộp ⇒ false. */
async function answer(names: RegExp[], timeout = 8_000): Promise<string | null> {
    const box = anyDialog()
    if (!(await appeared(box, timeout))) return null
    // Hộp 入金指定 hiện trước, nút tới sau (「読み込み中…」) ⇒ chờ nút chứ đừng đọc một lần.
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
        for (const n of names) {
            const b = box.getByRole('button', { name: n }).first()
            if ((await b.isVisible().catch(() => false)) && (await b.isEnabled().catch(() => false))) {
                const text = (await box.innerText().catch(() => '')).replace(/\s+/g, ' ')
                // 入金指定 dựng lại DOM ngay lúc bấm ⇒ click báo "detached" dù đã ăn; hộp đã đóng là xong.
                await b.click({ timeout: 5_000 }).catch(async (e) => {
                    if (await b.isVisible().catch(() => false)) throw e
                })
                await step()
                return text
            }
        }
        // Hộp vừa bấm còn mờ dần (chưa rời DOM, không còn nút) rồi biến mất ⇒ lượt này xong.
        if (!(await box.isVisible().catch(() => false))) return ''
        await page.waitForTimeout(300)
    }
    throw new Error(`hộp thoại không có nút nào trong ${names.join(', ')}: ${(await box.innerText().catch(() => '')).replace(/\s+/g, ' ')}`)
}

/** 診療入力 hôm nay → F8 → đi hết chuỗi 会計 (チェック OK, 保存? No, 入金指定 指定なし) → 窓口精算. */
async function f8ToCounterPayment(): Promise<void> {
    await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('合計:').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
    await expect(page.locator('button[data-fkey="F8"]:visible').first()).toHaveText(/^F8\s*会計$/)
    await page.keyboard.press('F8')
    for (let i = 0; i < 6; i++) {
        if ((await answer([/^OK$/, /^(No|いいえ)$/, /指定なし/])) === null) break
    }
    await expect(page, 'F8 会計 phải sang 窓口精算 của bệnh nhân').toHaveURL(
        new RegExp(`/counter-payments/${PAT_NO}(\\?|$)`),
        { timeout: SCREEN_LOAD_TIMEOUT },
    )
    await expect.poll(() => num(scoreTotal()), { message: 'chờ 未精算 nạp xong', timeout: SCREEN_LOAD_TIMEOUT }).toBe(99)
    await step()
}

test.describe('診療入力 F8 → 窓口精算 — hành vi', () => {
    test.describe.configure({ mode: 'serial' })

    test('T-1 — F8 mở 窓口精算 đúng bệnh nhân; 未精算 và màn khớp WinForm (đo 2026-10-27, KQ-8)', async () => {
        await f8ToCounterPayment()
        await expect(block('患者番号').first()).toHaveValue(`${PAT_NO}-1`)
        // WinForm: txtSc1 59, txtSc10 40 (acc_unit 209 = 10 手術, MST_TRT269), txtScoreTotal 99, txtClaimTotal 300.
        expect(await num(firstVisit()), '初・再診料 = 再診 59').toBe(59)
        expect(await num(surgery()), '209 có acc_unit 10 ⇒ cột 手術').toBe(40)
        expect(await num(claimTotal()), '請求金額 = 99点 × 10 × 30% làm tròn').toBe(300)
        const rows = await withDb((c) =>
            c.query(
                `SELECT km_cd, score, claim_amt, sflg, score_d_1, score_d_10
                   FROM unpaid WHERE pat_no = $1 AND trt_dt = $2::date`,
                [PAT_NO, TODAY],
            ),
        )
        // WinForm UNPAID: KM_CD 40 SCORE 99 CLAIM_AMT 300 SFLG 2 SCORE_D1 59 SCORE_D10 40.
        expect(rows.rows, 'unpaid hôm nay').toEqual([
            { km_cd: 40, score: 99, claim_amt: 300, sflg: 2, score_d_1: 59, score_d_10: 40 },
        ])
    })

    test('T-2 — Shift+F7 処置 ⇒ 診療入力 hôm nay; F10 ⇒ về lại 窓口精算', async () => {
        await page.keyboard.press('Shift+F7')
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.getByText('処置-G8').first()).toBeVisible()
        await step()
        await page.keyboard.press('F10')
        await expect(page.getByText('合計:')).toHaveCount(0, { timeout: 30_000 })
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}(\\?|$)`))
        expect(await num(scoreTotal())).toBe(99)
    })
})

test.describe('診療入力 F8 → 窓口精算 — parity ⛔', () => {
    test('P-1 — F10 + OK ⇒ về 診療入力：患者選択 (lịch sử ID203001, frm204002.cs:1350-1358)', async () => {
        await f8ToCounterPayment()
        await fkey('F10').click()
        const text = await answer([/^OK$/])
        expect(text, 'F10 phải hỏi Q00004').toContain('登録せずに終了してよろしいですか？')
        await expect(page, 'WinForm về màn trước theo CommonHistory = 診療入力：患者選択').toHaveURL(/\/treatments\/?(\?|$)/, {
            timeout: 30_000,
        })
    })

    test('P-2 — ESC = 登録 ⇒ xong về 診療入力：患者選択 (btnEndEsc_Click :1101-1115)', async () => {
        await f8ToCounterPayment()
        await page.locator('body').press('Escape')
        // 請求 300, 本日入金 0 ⇒ F9Proc hỏi Q00100 (WinForm KQ-10 cùng nguyên văn) ⇒ OK; rồi 予約登録 ⇒ F10.
        const confirm = await answer([/^(はい|Yes|OK)$/], 15_000)
        expect(confirm, 'ESC = F9Proc phải hỏi Q00100').toContain('本日入金が０円です。このまま登録してよろしいですか？')
        const yoyaku = page.getByRole('dialog').filter({ hasText: '予 約 登 録' })
        if (await appeared(yoyaku, 20_000)) {
            await yoyaku.getByRole('button', { name: /F10\s*戻る/ }).click()
            await step()
        }
        await expect
            .poll(
                () => withDb(async (c) => (await c.query('SELECT 1 FROM acc_dat WHERE pat_no = $1', [PAT_NO])).rowCount),
                { message: 'ESC phải 登録 (ghi acc_dat)', timeout: 30_000 },
            )
            .toBeGreaterThan(0)
        await expect(page, 'WinForm về màn trước theo CommonHistory = 診療入力：患者選択').toHaveURL(/\/treatments\/?(\?|$)/, {
            timeout: 30_000,
        })
    })
})
