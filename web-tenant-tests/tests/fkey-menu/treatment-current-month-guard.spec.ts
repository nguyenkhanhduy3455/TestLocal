import { type Locator, type Page } from '@playwright/test'

import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 診療入力 — 当月以外操作不可 (không được thao tác khi con trỏ ở dòng THÁNG CŨ).
 *
 * ─── Nguồn WinForm (frm203002) ───────────────────────────────────────────────
 *  - KeyFunc → ArrowEvents (:4115-4119, :5113-5155): con trỏ ở dòng tháng cũ
 *    (hFG1[51] == "99") thì MsgBox 「当月以外の操作はできません」 (操作不可) và dừng.
 *      · Lớp thường: chặn mọi key đi qua KeyFunc — F1〜F9 (F9 = End 登録) — TRỪ F10,
 *        ＋/－ và 1006 補綴管理. F11 選択 / F12 メニュー không đi qua KeyFunc ⇒ mở.
 *      · Lớp Shift: chặn HẾT (Shift == 1 không có ngoại lệ). Shift+F12 終了 không qua
 *        KeyFunc.
 *      · Nút trên: 時間外/休日/深夜 (1001-1003), レントゲン (1011-1013) qua KeyFunc ⇒ chặn.
 *  - Side panel: txtByokenSel_KeyPress (:6444), hfgGuid1 (:6524), grdPack (:6778),
 *    hfgKobetu (:6911) double-click tự kiểm cùng điều kiện ⇒ chặn.
 *  - IDM_DateChg_Click (:8036-8048): menu 日付変更 treo ở cột 日 của MỌI dòng; dòng
 *    ngoài 処置月 báo E00100 「当月以外の操作はできません。」.
 *
 * ─── Web trước khi sửa ───────────────────────────────────────────────────────
 *  Chỉ F6/F7/F8/F9 và Shift+F7 bị chặn; side panel không chặn; 日付変更 im lặng.
 *
 * ─── Không ghi DB ────────────────────────────────────────────────────────────
 *  Mọi thao tác bị chặn nên không có gì chạy. F11/F12 (không bị chặn) chỉ mở menu
 *  rồi đóng. Mỗi nhóm mở lại màn hình cho sạch trạng thái.
 *
 * ─── Dữ liệu ─────────────────────────────────────────────────────────────────
 *  Cần bệnh nhân có lịch sử tháng cũ (nhóm tháng 0 trên lưới ≠ tháng hiện tại).
 *  Không có ⇒ cả file tự skip kèm lý do.
 *
 *   npx playwright test tests/fkey-menu/treatment-current-month-guard.spec.ts --retries=0
 */

const PAT_NO = patNo('12138')
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const GRID_LOAD_TIMEOUT = 60_000
const COL_DAY = 0

const MSG_KEYFUNC = '当月以外の操作はできません'
const MSG_DATE_CHG = '当月以外の操作はできません。'

async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 当月以外操作不可 (ArrowEvents + side panel + 日付変更)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    let hasHistory = false

    const alert = () => page.getByRole('alertdialog')

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

    /**
     * Ô 日 của một dòng THÁNG CŨ đang được render. Lưới là danh sách ảo nên chỉ các nhóm
     * đang nhìn thấy có mặt trong DOM; dòng tháng hiện tại mang uuid, dòng tháng cũ mang
     * `<nhóm>-<dòng>` — lấy dòng cuối cùng có dạng đó (gần tháng hiện tại nhất).
     */
    const historyDayCell = (withDay = false) =>
        page
            .locator(`[data-grid-cell$="|${COL_DAY}"]`)
            .evaluateAll(
                (els, needDay) =>
                    els
                        .filter((e) => !needDay || /\d/.test(e.textContent ?? ''))
                        .map((e) => e.getAttribute('data-grid-cell') ?? '')
                        .filter((k) => /^\d+-\d+\|0$/.test(k)),
                withDay,
            )
            .then((keys) => (keys.length ? page.locator(`[data-grid-cell="${keys[keys.length - 1]}"]`) : null))

    /**
     * Lưới tự cuộn xuống dòng cuối khi nạp; nếu tháng hiện tại dài thì không còn dòng
     * tháng cũ nào trong vùng render — cuộn lên từng nấc cho tới khi thấy.
     */
    async function revealHistory(withDay = false) {
        for (let i = 0; i < 15; i++) {
            if (await historyDayCell(withDay)) return
            const anyCell = page.locator(`[data-grid-cell$="|${COL_DAY}"]`).first()
            if (!(await anyCell.count())) return
            await anyCell.hover()
            await page.mouse.wheel(0, -400)
            await page.waitForTimeout(200)
        }
    }

    async function focusHistoryRow() {
        await drain()
        await revealHistory()
        const cell = await historyDayCell()
        if (!cell) throw new Error('không còn dòng tháng cũ nào trong vùng render')
        await cell.click()
    }

    /** Chờ hộp 操作不可, kiểm nội dung, bấm OK. */
    async function expectBlocked(what: string, msg = MSG_KEYFUNC) {
        const a = alert()
        await expect(a, `${what}: phải bị chặn bằng 「${msg}」`).toBeVisible({ timeout: 10_000 })
        await expect(a).toContainText(msg)
        await a.getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        await expect(a).toBeHidden({ timeout: 10_000 })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        await openEntry()

        // Nhóm 0 có phải tháng cũ không? Thử bằng Shift+F7 (đã chặn từ trước khi sửa).
        await revealHistory()
        if (!(await historyDayCell())) return
        await focusHistoryRow()
        await page.keyboard.press('Shift+F7')
        hasHistory = await appeared(alert(), 5_000)
        if (hasHistory) {
            await alert().getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        } else {
            await page.keyboard.press('F10').catch(() => {})
        }
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    const NO_HISTORY =
        `bệnh nhân ${PAT_NO} không có nhóm tháng cũ trên lưới — không dựng được con trỏ ngoài 処置月`

    for (const key of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9']) {
        test(`TC-KEY-${key} — ${key} trên dòng tháng cũ bị chặn`, async () => {
            skipWithReason(!hasHistory, NO_HISTORY)
            await focusHistoryRow()
            await page.keyboard.press(key)
            await expectBlocked(key)
            await step()
        })
    }

    for (const key of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F9', 'F10']) {
        test(`TC-SHIFT-${key} — Shift+${key} trên dòng tháng cũ bị chặn`, async () => {
            skipWithReason(!hasHistory, NO_HISTORY)
            await focusHistoryRow()
            await page.keyboard.press(`Shift+${key}`)
            await expectBlocked(`Shift+${key}`)
            await step()
        })
    }

    test('TC-OPEN-F11 — F11 選択 KHÔNG bị chặn (không qua KeyFunc)', async () => {
        skipWithReason(!hasHistory, NO_HISTORY)
        await focusHistoryRow()
        await page.keyboard.press('F11')
        const menu = page.getByRole('menu').filter({ hasText: '1 メニュー' })
        await expect(menu, 'F11 phải mở menu 選択').toBeVisible({ timeout: 10_000 })
        await expect(alert(), 'F11 không được báo 操作不可').toBeHidden()
        await page.keyboard.press('Escape')
        await expect(menu).toBeHidden({ timeout: 10_000 })
        await step()
    })

    for (const label of ['時間外', '休日', '深夜']) {
        test(`TC-BTN-${label} — nút ${label} trên dòng tháng cũ bị chặn`, async () => {
            skipWithReason(!hasHistory, NO_HISTORY)
            await focusHistoryRow()
            await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click()
            await expectBlocked(label)
            await step()
        })
    }

    test('TC-SIDE-病検 — chọn dòng tab 病検 bị chặn (txtByokenSel_KeyPress)', async () => {
        skipWithReason(!hasHistory, NO_HISTORY)
        await openEntry()
        await page.getByRole('button', { name: '病検', exact: true }).click()
        const rows = page.locator('div[class*="grid-cols-[44px_270px_1fr]"][class*="cursor-pointer"]')
        skipWithReason(!(await appeared(rows.first(), 15_000)), 'tab 病検 rỗng')
        await focusHistoryRow()
        await rows.first().click()
        await expectBlocked('病検 pick')
        await step()
    })

    /** Lớp cột của dòng danh sách từng tab (treatment-side-panel PACK_COLS / GUID_COLS). */
    const LIST_COLS: Record<string, string> = { パック: 'grid-cols-[42px_1fr]', ガイド: 'grid-cols-[46px_1fr]' }

    for (const tab of ['パック', 'ガイド']) {
        test(`TC-SIDE-${tab} — Enter ở ô № tab ${tab} bị chặn`, async () => {
            skipWithReason(!hasHistory, NO_HISTORY)
            await openEntry()
            await focusHistoryRow()
            await page.getByRole('button', { name: tab, exact: true }).click()
            const no = page.locator('input[data-side-anchor]').first()
            skipWithReason(!(await appeared(no, 10_000)), `tab ${tab} không có ô №`)
            // Chờ DÒNG CỦA DANH SÁCH side panel (không phải ô vàng của lưới — ô đang chọn
            // trên lưới cũng nền vàng) — bấm Enter khi danh sách còn rỗng thì
            // resolveSelNoPick không chọn gì, và không có gì để chặn.
            const listRow = page.locator(`div[class*="${LIST_COLS[tab]}"][class*="cursor-pointer"]`).first()
            skipWithReason(!(await appeared(listRow, 20_000)), `tab ${tab} không có dòng nào`)
            await no.fill('1')
            await no.press('Enter')
            await expectBlocked(`${tab} pick`)
            await step()
        })
    }

    test('TC-DATECHG — chuột phải ô 日 dòng tháng cũ: E00100 thay vì mở 日付変更', async () => {
        skipWithReason(!hasHistory, NO_HISTORY)
        await openEntry()
        // Ô 日 CÓ SỐ: web chỉ hiện ngày ở dòng đầu mỗi ngày và chỉ mở menu ở đó.
        await revealHistory(true)
        const cell = await historyDayCell(true)
        skipWithReason(!cell, 'không có ô 日 nào của tháng cũ mang số ngày trong vùng render')
        // IDM_DateChg reads the CURRENT cell's row (hFG1[78, CurrentCellAddress.Y]) and a
        // right-click does not move it — put the cursor on the past row first.
        await cell!.click()
        await cell!.click({ button: 'right' })
        await expectBlocked('日付変更', MSG_DATE_CHG)
        await expect(page.getByRole('dialog').filter({ hasText: '日付変更' })).toHaveCount(0)
        await step()
    })
})
