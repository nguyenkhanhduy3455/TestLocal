import { type Page } from '@playwright/test'

import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { captureFixedUi } from '../_shared/capture'

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
        await captureFixedUi(dialog(), 'disease-selection-parent-view')
    })

    test('TC-CHILD-1 — màn mã con: tiêu đề vẫn 「病名選択」, Tab đi chuỗi có F11', async () => {
        // Mở mã con của dòng đầu (dblclick) — WinForm defData → _dspDisSb.
        await disNmCells().first().dblclick()
        await expect(dialog().getByRole('columnheader', { name: /枝番/ }).or(dialog().getByText('枝番'))).toBeVisible({
            timeout: 20000,
        })
        await expect(dialog(), 'màn mã con không được đổi tiêu đề').toBeVisible()
        await expect(page.getByText(/の\s*詳\s*細/)).toHaveCount(0)
        await captureFixedUi(dialog(), 'disease-selection-subcode-view')
        await step()

        await disNmCells().first().click()
        const seen = await tabCycle(page, CHILD_CHAIN.length + 1)
        console.log(`TC-CHILD-1: ${seen.join(' → ')}`)
        expect(seen).toEqual([...CHILD_CHAIN, SHARED_CLOSE_BUTTON, 'grid'])
    })

    // ── F10 検索 — frm902007.btnF10_Click → frm902008 ──────────────────────────
    // frm902008 (BaseDialog2): F9 確定 / Enter / End / ESC đều XÁC NHẬN; chỉ F10 戻る là
    // đóng không tìm. Có chuỗi ⇒ rời màn mã con, tìm TOÀN BỘ (searchKbn.F9) theo
    // 病名/カナ chứa chuỗi, sắp theo dis_cd và đánh lại 選択番号 từ 1. Rỗng ⇒ không gì.
    const prompt = () => page.getByRole('dialog').filter({ hasText: '検索文字列を入力して下さい' })
    const promptInput = () => prompt().getByRole('textbox', { name: '検索文字列' })
    const MST_DIS_LIST = /\/tenant\/mst-dis(\?|$)/

    /** Request danh sách cha bắn ra trong lúc chạy `action` (chờ thêm 1.5s cho chắc). */
    async function listRequestsDuring(action: () => Promise<void>): Promise<URL[]> {
        const urls: URL[] = []
        const onReq = (r: { url(): string }) => {
            if (MST_DIS_LIST.test(r.url())) urls.push(new URL(r.url()))
        }
        page.on('request', onReq)
        await action()
        await page.waitForTimeout(1500)
        page.off('request', onReq)
        return urls
    }

    /** 選択番号 / コード của các dòng đang render ở danh sách cha. */
    async function parentRows(): Promise<{ dsp: number[]; cd: number[] }> {
        const dsp = (await dialog().getByTestId('cell-dspCd').allInnerTexts()).map((t) => Number(t.trim()))
        const cd = (await dialog().getByTestId('cell-disCd').allInnerTexts()).map((t) => Number(t.trim()))
        return { dsp, cd }
    }

    test('TC-F10-1 — F10 mở hộp nhập; F9 確定 tìm toàn bộ theo chuỗi, rời màn mã con, sắp theo コード', async () => {
        await page.keyboard.press('F10')
        await expect(prompt(), 'F10 không mở hộp nhập chuỗi tìm kiếm').toBeVisible({ timeout: 10000 })
        await expect(promptInput(), 'ô nhập phải có focus khi mở').toBeFocused()
        await expect(promptInput()).toHaveAttribute('maxlength', '50')
        await captureFixedUi(page, 'disease-selection-f10-prompt')

        await promptInput().fill('P')
        const reqs = await listRequestsDuring(() => page.keyboard.press('F9'))
        await expect(prompt()).toHaveCount(0)
        expect(reqs.length, 'F9 確定 không gửi request tìm kiếm').toBeGreaterThan(0)
        const url = reqs.at(-1)!
        expect(url.searchParams.get('q'), 'q phải là chuỗi vừa nhập').toBe('P')
        expect(url.searchParams.get('kbn'), 'F10 tìm TOÀN BỘ (searchKbn.F9 = 9)').toBe('9')

        await expect(dialog().getByText('枝番'), 'F10 phải rời màn mã con').toHaveCount(0)
        await expect(dialog().getByTestId('cell-disNm').first()).toBeVisible({ timeout: 15000 })
        const { dsp, cd } = await parentRows()
        console.log(`TC-F10-1: ${cd.length} dòng đang render, コード đầu = ${cd.slice(0, 6).join(',')}`)
        expect(cd.length).toBeGreaterThan(0)
        expect(cd, 'kết quả F10 phải sắp theo コード (dis_cd) tăng dần').toEqual([...cd].sort((a, b) => a - b))
        expect(dsp, '選択番号 phải đánh lại liên tục từ 1').toEqual(dsp.map((_, i) => i + 1))
        await captureFixedUi(dialog(), 'disease-selection-f10-result')
        await step()
    })

    test('TC-F10-2 — ESC trong hộp nhập cũng là XÁC NHẬN (BaseDialog2: Escape → btnF9_Click)', async () => {
        await page.keyboard.press('F10')
        await expect(prompt()).toBeVisible({ timeout: 10000 })
        await promptInput().fill('Pul')
        const reqs = await listRequestsDuring(() => page.keyboard.press('Escape'))
        await expect(prompt()).toHaveCount(0)
        expect(reqs.at(-1)?.searchParams.get('q'), 'ESC phải tìm với chuỗi đã nhập').toBe('Pul')
        await expect(dialog(), 'ESC của hộp nhập không được đóng luôn 病名選択').toBeVisible()
    })

    test('TC-F10-3 — F10 戻る trong hộp nhập: đóng, không tìm, danh sách giữ nguyên', async () => {
        const before = await parentRows()
        await page.keyboard.press('F10')
        await expect(prompt()).toBeVisible({ timeout: 10000 })
        await promptInput().fill('Per')
        const reqs = await listRequestsDuring(() => page.keyboard.press('F10'))
        await expect(prompt()).toHaveCount(0)
        expect(reqs, 'F10 戻る không được gửi request tìm kiếm').toHaveLength(0)
        expect(await parentRows()).toEqual(before)
    })

    test('TC-F10-4 — chuỗi rỗng + Enter: không làm gì', async () => {
        const before = await parentRows()
        await page.keyboard.press('F10')
        await expect(prompt()).toBeVisible({ timeout: 10000 })
        const reqs = await listRequestsDuring(() => promptInput().press('Enter'))
        await expect(prompt()).toHaveCount(0)
        expect(reqs, 'chuỗi rỗng không được tìm').toHaveLength(0)
        expect(await parentRows()).toEqual(before)
    })

    test('TC-CLOSE — F12 戻る đóng 病名選択', async () => {
        await page.keyboard.press('F12')
        await expect(dialog()).toHaveCount(0)
    })
})
