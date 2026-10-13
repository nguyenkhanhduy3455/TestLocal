import { type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from '../_shared/db'
import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 診療入力 — End/Esc 登録, 日付変更 trên mọi dòng, menu 選択 trên dòng tháng cũ.
 *
 * ─── Nguồn WinForm (frm203002) ───────────────────────────────────────────────
 *  - frm203002_KeyDown (:3289-3310): Escape / End → KeyFunc(Keys.End) — CHÍNH lời gọi
 *    của btnF9_Click (F9 登録), đi qua ArrowEvents (dòng tháng cũ ⇒ 操作不可). Ô đang
 *    sửa nuốt Esc (huỷ sửa) trước.
 *  - IDM_DateChg_Click (:8036-8048): menu 日付変更 treo ở cột 0 của MỌI dòng, lấy
 *    ngày của DÒNG CON TRỎ (hFG1[78, CurrentCellAddress.Y]) — không phải dòng vừa
 *    chuột phải, không phụ thuộc ô 日 có vẽ số hay không.
 *  - grdRegi.ContextMenuStrip (:375): menu 選択 mở ở MỌI dòng, kể cả tháng cũ; 行追加
 *    / 行削除 vẫn bật nhưng AddRow / DeleteRow return khi hFG1[51] == "99".
 *
 * ─── Web trước khi sửa ───────────────────────────────────────────────────────
 *  End/Esc không làm gì; 日付変更 chỉ mở ở dòng đầu mỗi ngày và theo dòng vừa click;
 *  chuột phải dòng tháng cũ không mở menu 選択.
 *
 * ─── Không ghi DB ────────────────────────────────────────────────────────────
 *  End/Esc chỉ tới hộp 「処置データは、変更されて…。保存しますか？」 rồi bấm Cancel;
 *  POST bulk-save bị chặn cứng (abort) cho chắc. TEST_DB=1: seed 2 dòng 処置 hôm nay
 *  (disp_no >= 9000, afterAll dọn) để có dòng thứ 2 của một ngày (ô 日 trống).
 *
 *   npx playwright test tests/fkey-menu/treatment-end-esc-datechg-menu.spec.ts --retries=0
 */

const PAT_NO = patNo('12138')
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const GRID_LOAD_TIMEOUT = 60_000
const COL_DAY = 0
const COL_TEN = 3
const SEED_ROWS = [
    { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '再診' },
    { trtCd: 108, trtSb: 9, trtPt: 2, trtCnt: 1, dspTrt: '外安全１(再診)' },
] as const

const BULK_SAVE_URL = /\/tenant\/treatment\/bulk-save(\?|$)/
const SAVE_CONFIRM = /処置データは、変更されて(います|いません)。保存しますか？/
const MSG_KEYFUNC = '当月以外の操作はできません'
const MSG_DATE_CHG = '当月以外の操作はできません。'
const HISTORY_KEY_RE = /^\d+-\d+$/

async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — End/Esc 登録 · 日付変更 mọi dòng · menu 選択 trên dòng tháng cũ', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    let saveAttempts = 0

    const saveHandler = async (route: Route) => {
        if (route.request().method() !== 'POST') return route.fallback()
        saveAttempts++
        await route.abort('failed')
    }

    const alert = () => page.getByRole('alertdialog')
    const saveConfirm = () => page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: SAVE_CONFIRM })
    const dateChgDialog = () => page.getByRole('dialog').filter({ hasText: '日付変更' })
    /** WinForm: chuột phải ô 日 hiện menu một mục 「日付変更」; dialog chỉ mở sau khi chọn mục đó. */
    const pickDateChgMenu = () => page.getByRole('menu').getByRole('button', { name: '日付変更' }).click()
    const rowMenu = () => page.getByRole('menu').filter({ hasText: '1 メニュー' })

    async function drain() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(santei, 2_000))) break
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
        }
        const karte = page.locator('[role="dialog"]').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(karte.first(), 2_000))) break
            await karte.first().getByRole('button', { name: /F10\s*戻る/ }).first().click().catch(() => {})
        }
    }

    async function openEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drain()
    }

    /** Khoá `data-grid-cell` (bỏ `|col`) của các dòng đang render, theo thứ tự DOM. */
    async function dayKeys(): Promise<{ key: string; text: string }[]> {
        return page.locator(`[data-grid-cell$="|${COL_DAY}"]`).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
    }

    async function revealHistory() {
        for (let i = 0; i < 15; i++) {
            if ((await dayKeys()).some((k) => HISTORY_KEY_RE.test(k.key))) return
            const any = page.locator(`[data-grid-cell$="|${COL_DAY}"]`).first()
            if (!(await any.count())) return
            await any.hover()
            await page.mouse.wheel(0, -400)
            await page.waitForTimeout(200)
        }
    }

    async function historyKey(): Promise<string | null> {
        await revealHistory()
        const keys = (await dayKeys()).filter((k) => HISTORY_KEY_RE.test(k.key))
        return keys.at(-1)?.key ?? null
    }

    /** Dòng tháng hiện tại có ô 日 TRỐNG (dòng thứ 2+ của một ngày). */
    async function currentContinuationKey(): Promise<string | null> {
        const keys = (await dayKeys()).filter((k) => !HISTORY_KEY_RE.test(k.key) && !k.key.includes(':'))
        return keys.find((k) => k.text === '')?.key ?? null
    }

    const cell = (key: string, col: number) => page.locator(`[data-grid-cell="${key}|${col}"]`)

    async function expectAlert(msg: string) {
        const a = alert()
        await expect(a, `phải báo 「${msg}」`).toBeVisible({ timeout: 10_000 })
        await expect(a).toContainText(msg)
        await a.getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        await expect(a).toBeHidden({ timeout: 10_000 })
    }

    /** Hộp F9 登録 hiện ra ⇒ bấm Cancel (không lưu, ở lại màn hình). */
    async function expectSaveConfirmThenCancel(what: string) {
        await expect(saveConfirm(), `${what} phải chạy F9 登録 (hộp 保存しますか？)`).toBeVisible({
            timeout: 10_000,
        })
        await saveConfirm().getByRole('button', { name: /^(Cancel|キャンセル)$/ }).first().click()
        await expect(saveConfirm()).toBeHidden({ timeout: 10_000 })
        expect(saveAttempts, 'Cancel mà vẫn gửi bulk-save').toBe(0)
        await expect(page).toHaveURL(/\/treatments\//)
    }

    test.beforeAll(async ({ authedPage }) => {
        if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), TODAY, [...SEED_ROWS])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        await page.route(BULK_SAVE_URL, saveHandler)
        await openEntry()
    })

    test.afterAll(async () => {
        await page.unroute(BULK_SAVE_URL, saveHandler).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (dbEnabled) await deleteTreatmentRows(Number(PAT_NO), TODAY)
    })

    // ── End / Esc ────────────────────────────────────────────────────────────

    for (const key of ['End', 'Escape']) {
        test(`TC-END-${key} — ${key} trên dòng tháng hiện tại = F9 登録`, async () => {
            await drain()
            await page.keyboard.press(key)
            await expectSaveConfirmThenCancel(key)
            await step()
        })
    }

    test('TC-END-SHIFT — Shift+End cũng là 登録 (KeyFunc(End) gọi với Shift = 0)', async () => {
        await drain()
        await page.keyboard.press('Shift+End')
        await expectSaveConfirmThenCancel('Shift+End')
        await step()
    })

    test('TC-ESC-EDIT — Esc khi đang sửa ô chỉ huỷ sửa, KHÔNG lưu', async () => {
        const key = (await dayKeys()).find((k) => !HISTORY_KEY_RE.test(k.key) && !k.key.includes(':'))?.key
        skipWithReason(!key, 'không có dòng tháng hiện tại (bật TEST_DB=1 để seed)')
        await cell(key!, COL_TEN).dblclick()
        const editor = page.locator(`[data-grid-cell="${key}|${COL_TEN}"] input`)
        skipWithReason(!(await appeared(editor, 5_000)), 'ô 点 không vào chế độ sửa')
        await page.keyboard.press('Escape')
        await expect(editor, 'Esc phải đóng ô đang sửa').toHaveCount(0)
        await expect(saveConfirm(), 'Esc của ô đang sửa không được chạy 登録').toHaveCount(0)
        await step()
    })

    test('TC-END-HIST — End / Esc với con trỏ ở dòng tháng cũ ⇒ 操作不可', async () => {
        const key = await historyKey()
        skipWithReason(!key, `bệnh nhân ${PAT_NO} không có dòng tháng cũ trong vùng render`)
        await cell(key!, COL_DAY).click()
        await page.keyboard.press('End')
        await expectAlert(MSG_KEYFUNC)
        await page.keyboard.press('Escape')
        // Esc lúc này có thể được hộp alert (nếu còn) nuốt; kiểm lại là không có 登録.
        if (await appeared(alert(), 3_000)) await expectAlert(MSG_KEYFUNC)
        await expect(saveConfirm()).toHaveCount(0)
        await step()
    })

    // ── 日付変更 ──────────────────────────────────────────────────────────────

    test('TC-DATECHG-CONT — dòng thứ 2 của một ngày (ô 日 trống) vẫn mở 日付変更', async () => {
        await openEntry()
        const key = await currentContinuationKey()
        skipWithReason(!key, 'không có dòng thứ 2 của ngày nào trong tháng hiện tại (bật TEST_DB=1)')
        await cell(key!, COL_DAY).click()
        await cell(key!, COL_DAY).click({ button: 'right' })
        await pickDateChgMenu()
        await expect(dateChgDialog(), 'web cũ chỉ mở ở dòng đầu mỗi ngày').toBeVisible({ timeout: 10_000 })
        await dateChgDialog().getByRole('button', { name: /F10\s*戻る|キャンセル|戻る/ }).first().click()
        await expect(dateChgDialog()).toBeHidden({ timeout: 10_000 })
        await step()
    })

    test('TC-DATECHG-CURSOR — con trỏ ở dòng tháng cũ, chuột phải ô 日 tháng hiện tại ⇒ E00100', async () => {
        const hist = await historyKey()
        skipWithReason(!hist, `bệnh nhân ${PAT_NO} không có dòng tháng cũ trong vùng render`)
        await cell(hist!, COL_DAY).click()
        const cur = (await dayKeys()).find((k) => !HISTORY_KEY_RE.test(k.key) && !k.key.includes(':'))?.key
        skipWithReason(!cur, 'không có dòng tháng hiện tại cùng lúc trong vùng render')
        await cell(cur!, COL_DAY).click({ button: 'right' })
        await pickDateChgMenu()
        await expectAlert(MSG_DATE_CHG)
        await expect(dateChgDialog(), 'IDM_DateChg lấy dòng CON TRỎ, không phải dòng vừa click').toHaveCount(0)
        await step()
    })

    // ── Menu 選択 trên dòng tháng cũ ──────────────────────────────────────────

    test('TC-MENU-HIST — chuột phải dòng tháng cũ mở menu 選択; 行追加 bật nhưng không thêm dòng', async () => {
        await openEntry()
        const hist = await historyKey()
        skipWithReason(!hist, `bệnh nhân ${PAT_NO} không có dòng tháng cũ trong vùng render`)
        await cell(hist!, COL_TEN).click()
        const before = (await dayKeys()).length
        await cell(hist!, COL_TEN).click({ button: 'right' })
        await expect(rowMenu(), 'WinForm mở menu 選択 ở mọi dòng').toBeVisible({ timeout: 10_000 })
        const addRow = rowMenu().getByRole('button', { name: /行追加/ }).first()
        await expect(addRow, '行追加 phải BẬT như WinForm').toBeEnabled()
        await addRow.click()
        await expect(rowMenu()).toBeHidden({ timeout: 10_000 })
        expect((await dayKeys()).length, 'AddRow return trên dòng "99" — không được thêm dòng').toBe(before)
        await step()
    })
})
