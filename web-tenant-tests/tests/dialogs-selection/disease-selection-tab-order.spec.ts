import { type Page } from '@playwright/test'

import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 病名選択 (DiseaseSelectionDialog, frm902007) — thứ tự Tab, tiêu đề, nhãn F-key.
 *
 * frm902007.Designer (TabIndex theo container):
 *   form   : pnlBase 0 → pnlButton 1 (F1…F12, BaseDialog3) → btnEndEntry 2
 *   pnlBase: txtDisNm 0 (TabStop = false) → dgvView 1 → btnCreateDisNm 2 →
 *            btnDelete 3 → btnClear 4 → txtNo 5
 * ⇒ Tab: lưới → 病名作成 → １つ削除 → クリア → 選択番号 → F1…F12 (bỏ nút
 *   disabled) → End 登録 → quay lại lưới. Màn mã con (枝番) dùng CHUNG form nên
 *   chuỗi y hệt, chỉ khác F11 前へ bật. Tiêu đề luôn 「病名選択」 (`Title` gán một
 *   lần trong init) — kể cả khi đang xem mã con.
 *
 * KHÔNG GHI DB: mở dialog, bấm Tab, đóng bằng F12.
 *   npx playwright test tests/dialogs-selection/disease-selection-tab-order.spec.ts
 */

const PAT_NO = patNo('11')
const TRT_DT = trtDt(TODAY_ISO)

/** Chuỗi Tab của WinForm ở màn chính (F11 前へ disabled). */
const PARENT_CHAIN = [
    'grid',
    '病名作成',
    '１つ削除',
    'クリア',
    '選択番号',
    'F1',
    'F2',
    'F3',
    'F4',
    'F5',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F12',
    'End',
]

/**
 * Nút × trên header của DraggableDialog (dùng chung) nhận Tab, còn nút đóng trên
 * thanh tiêu đề WinForm thì không — sai lệch ĐÃ BIẾT, nằm ở component chung nên
 * chưa sửa trong phạm vi dialog này. Nó chen giữa End và lưới khi vòng lại.
 */
const SHARED_CLOSE_BUTTON = '<button 閉じる>'

/** Màn mã con: như trên + F11 前へ. */
const CHILD_CHAIN = [...PARENT_CHAIN.slice(0, 15), 'F11', 'F12', 'End']

/** Tên ngắn của phần tử đang giữ focus trong dialog 病名選択. */
async function focusName(page: Page): Promise<string> {
    return page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el) return '(none)'
        if (el.closest('[data-testid="virtual-scroll-container"]')) return 'grid'
        if (el.getAttribute('inputmode') === 'numeric') return '選択番号'
        const fkey = el.closest('[data-fkey]')?.getAttribute('data-fkey')
        if (fkey) return fkey
        const text = el.textContent?.replace(/\s+/g, '').trim()
        if (el.tagName === 'BUTTON' && text) return text
        const ph = el.getAttribute('placeholder') ?? el.getAttribute('aria-label') ?? ''
        return `<${el.tagName.toLowerCase()}${ph ? ` ${ph}` : ''}>`
    })
}

/** Bấm Tab đủ một vòng + 1 bước, trả về chuỗi focus (bắt đầu từ phần tử đang focus). */
async function tabCycle(page: Page, steps: number): Promise<string[]> {
    const seen = [await focusName(page)]
    for (let i = 0; i < steps; i++) {
        await page.keyboard.press('Tab')
        seen.push(await focusName(page))
    }
    return seen
}

test.describe.configure({ mode: 'serial' })

test.describe('病名選択 — thứ tự Tab / tiêu đề / nhãn F-key theo frm902007', () => {
    let page: Page
    let step: () => Promise<void>
    const dialog = () => page.getByRole('dialog').filter({ hasText: /病\s*名\s*選\s*択/ })
    const disNmCells = () => dialog().getByTestId('cell-disNm')

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

        const shoshinConfirm = page.getByRole('button', { name: 'Yes' })
        await shoshinConfirm.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
        if (await shoshinConfirm.count()) await shoshinConfirm.click()
        await page
            .getByRole('dialog')
            .first()
            .waitFor({ state: 'visible', timeout: 45000 })
            .catch(() => {})
        for (let i = 0; i < 15 && (await page.getByRole('dialog').count()); i++) {
            await page.keyboard.press('F10')
            await page.waitForTimeout(800)
        }
        await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 })

        // 病名選択 chỉ mở qua 部位選択 → End (xem disease-selection-enter.spec.ts).
        await page.getByRole('button', { name: '病検', exact: true }).click().catch(() => {})
        await page.getByRole('button', { name: '変更', exact: true }).click()
        const byoRows = page.locator('div[class*="grid-cols-[44px_270px_1fr]"]')
        await expect(byoRows.nth(1), 'panel 病検 chưa có dòng nào — đổi TEST_PAT_NO').toBeVisible({
            timeout: 20000,
        })
        await byoRows.nth(1).click()
        await expect(page.getByText(/部\s*位\s*選\s*択/)).toBeVisible({ timeout: 20000 })
        await page.keyboard.press('End')
        await expect(dialog()).toBeVisible({ timeout: 30000 })
        await expect(disNmCells().first()).toBeVisible({ timeout: 20000 })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-TAB-1 — màn chính: Tab đi đúng chuỗi TabIndex của frm902007 rồi quay về lưới', async () => {
        await disNmCells().first().click()
        await step()
        const seen = await tabCycle(page, PARENT_CHAIN.length + 1)
        console.log(`TC-TAB-1: ${seen.join(' → ')}`)
        expect(seen).toEqual([...PARENT_CHAIN, SHARED_CLOSE_BUTTON, 'grid'])
    })

    test('TC-LBL-1 — nhãn F4 「ダツリ・ハソン」 nằm trên MỘT dòng', async () => {
        const f4 = dialog().locator('[data-fkey="F4"]')
        const label = f4.getByText('ダツリ・ハソン', { exact: true })
        await expect(label).toBeVisible()
        const lines = await label.evaluate((el) => {
            const lh = parseFloat(getComputedStyle(el).lineHeight) || el.getBoundingClientRect().height
            return Math.round(el.getBoundingClientRect().height / lh)
        })
        expect(lines, 'nhãn F4 bị rớt dòng').toBe(1)
    })

    test('TC-CHILD-1 — màn mã con: tiêu đề vẫn 「病名選択」, Tab đi chuỗi có F11', async () => {
        // Mở mã con của dòng đầu (dblclick) — WinForm defData → _dspDisSb.
        await disNmCells().first().dblclick()
        await expect(dialog().getByRole('columnheader', { name: /枝番/ }).or(dialog().getByText('枝番'))).toBeVisible({
            timeout: 20000,
        })
        await expect(dialog(), 'màn mã con không được đổi tiêu đề').toBeVisible()
        await expect(page.getByText(/の\s*詳\s*細/)).toHaveCount(0)
        await step()

        await disNmCells().first().click()
        const seen = await tabCycle(page, CHILD_CHAIN.length + 1)
        console.log(`TC-CHILD-1: ${seen.join(' → ')}`)
        expect(seen).toEqual([...CHILD_CHAIN, SHARED_CLOSE_BUTTON, 'grid'])

        await page.keyboard.press('F12')
        await expect(dialog()).toHaveCount(0)
    })
})
