import { type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { openTreatmentEntry } from '../_shared/entry'
import { patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 処置入力 (frm203002) — PageUp / PageDown trên lưới grdRegi.
 *
 * WinForm `grdRegi_KeyDown` KHÔNG bắt hai phím này ⇒ DataGridView.ProcessNextKey /
 * ProcessPriorKey: ô hiện tại nhảy N dòng trong CÙNG cột (N = số dòng đang hiện TRỌN),
 * kẹp ở dòng đầu/cuối, rồi ScrollRowIntoView cuộn VỪA ĐỦ — sau PageDown ô đích nằm sát
 * ĐÁY khung, sau PageUp nằm sát ĐỈNH. Không đưa ra giữa, không giữ vị trí tương đối.
 *
 * Đã đo trên WinForm thật (fla-ui-tests TreatmentGridPageKeyProbeTests, bệnh nhân 18137,
 * khung ~19 dòng): dòng 81 (giữa khung) → PageDown → 100 ở dòng CUỐI khung; PageUp →
 * 81 ở dòng ĐẦU; dòng 99 (cuối khung) → PageDown → 118 ở dòng cuối.
 *
 * KHÔNG GHI DB. Chạy cả file:
 *   npx playwright test tests/treatment-grid/treatment-grid-page-keys.spec.ts
 */

/** Bệnh nhân / ngày có lịch sử dài (nhiều hơn một trang dòng). */
const PAT_NO = patNo('12138')
const TRT_DT = trtDt('2025-12-24')

/** Ô vàng = ô đang giữ con trỏ (`focusedCell`). */
const FOCUS_CLASS = 'bg-[#ffffc0]'

/** Cột 療法・処置 (RegiCol.ryo). */
const COL_RYO = 2

type ColumnState = {
    /** `data-grid-cell` của các ô cùng cột với ô vàng, từ trên xuống. */
    ids: string[]
    /** Vị trí ô vàng trong `ids`. */
    at: number
    /** Các ô của cột đang hiện TRỌN (dưới header sticky) — một trang. */
    visible: string[]
}

/** Đọc cột của ô vàng và phần đang hiện trọn, giống cách DataGridView đếm một trang. */
async function columnState(page: Page): Promise<ColumnState> {
    return page.evaluate((cls) => {
        const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-grid-cell]'))
        const cur = document.querySelector<HTMLElement>(`[data-grid-cell].${CSS.escape(cls)}`)
        if (!cur) throw new Error('không có ô vàng')
        const c = cur.getBoundingClientRect()
        const column = cells
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.right > c.left + 1 && r.left < c.right - 1)
            .sort((a, b) => a.r.top - b.r.top)
        let scroller = cur.parentElement
        while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement
        const v = scroller!.getBoundingClientRect()
        const header = scroller!.querySelector<HTMLElement>('.table-header-row')
        const top = v.top + (header?.offsetHeight ?? 0)
        return {
            ids: column.map(({ el }) => el.dataset.gridCell!),
            at: column.findIndex(({ el }) => el === cur),
            visible: column
                .filter(({ r }) => r.top >= top - 1 && r.bottom <= v.bottom + 1)
                .map(({ el }) => el.dataset.gridCell!),
        }
    }, FOCUS_CLASS)
}

async function focusedId(page: Page): Promise<string | null> {
    return page.evaluate(
        (cls) =>
            document.querySelector(`[data-grid-cell].${CSS.escape(cls)}`)?.getAttribute('data-grid-cell') ??
            null,
        FOCUS_CLASS,
    )
}

/** Bấm phím, rồi chờ ô vàng tới ô mong đợi. */
async function pressAndExpect(page: Page, key: 'PageUp' | 'PageDown', expected: string, why: string) {
    await page.keyboard.press(key)
    await expect.poll(() => focusedId(page), why).toBe(expected)
}

test.describe.configure({ mode: 'serial' })

test.describe('処置入力 — PageUp/PageDown trên lưới grdRegi (DataGridView)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-PG-1 — PageDown từ dòng ĐẦU khung: nhảy một trang, ô mới nằm ở dòng CUỐI khung', async () => {
        // Ô 療法 trên cùng đang hiện trọn.
        const first = await page.evaluate((col) => {
            const cells = Array.from(document.querySelectorAll<HTMLElement>(`[data-grid-cell$="|${col}"]`))
            return (
                cells.find((el) => {
                    const r = el.getBoundingClientRect()
                    return r.top > 0 && r.bottom < window.innerHeight && r.height > 0
                })?.dataset.gridCell ?? null
            )
        }, COL_RYO)
        expect(first, 'không thấy ô 療法 nào trên màn').not.toBeNull()
        await page.locator(`[data-grid-cell="${first}"]`).click()
        await expect.poll(() => focusedId(page)).toBe(first)

        const before = await columnState(page)
        const pageSize = before.visible.length
        console.log(`TC-PG-1: cột ${before.ids.length} ô, một trang = ${pageSize} ô, đứng ở #${before.at}`)
        expect(before.ids.length - before.at, 'lưới quá ngắn — cần hơn một trang dòng phía dưới').toBeGreaterThan(pageSize)

        await pressAndExpect(page, 'PageDown', before.ids[before.at + pageSize]!, 'PageDown phải nhảy đúng một trang')
        const after = await columnState(page)
        expect(after.visible.at(-1), 'ô mới phải nằm sát ĐÁY khung (cuộn vừa đủ)').toBe(after.ids[after.at])
        await captureFixedUi(page, 'treatment-grid-pagedown-lands-bottom')
        await step()
    })

    test('TC-PG-2 — PageUp: lùi một trang, ô mới nằm ở dòng ĐẦU khung', async () => {
        const before = await columnState(page)
        await pressAndExpect(
            page,
            'PageUp',
            before.ids[Math.max(0, before.at - before.visible.length)]!,
            'PageUp phải lùi đúng một trang',
        )
        const after = await columnState(page)
        expect(after.visible[0], 'ô mới phải nằm sát ĐỈNH khung (cuộn vừa đủ)').toBe(after.ids[after.at])
        await captureFixedUi(page, 'treatment-grid-pageup-lands-top')
        await step()
    })

    test('TC-PG-3 — PageDown từ dòng GIỮA khung: ô mới cũng nằm ở dòng CUỐI khung', async () => {
        const view = await columnState(page)
        const mid = view.visible[Math.floor(view.visible.length / 2)]!
        await page.locator(`[data-grid-cell="${mid}"]`).click()
        await expect.poll(() => focusedId(page)).toBe(mid)
        const before = await columnState(page)
        const target = before.ids[Math.min(before.ids.length - 1, before.at + before.visible.length)]!
        await pressAndExpect(page, 'PageDown', target, 'PageDown từ giữa khung phải nhảy đúng một trang')
        const after = await columnState(page)
        expect(after.visible.at(-1), 'ô mới phải nằm sát ĐÁY khung').toBe(target)
        await captureFixedUi(page, 'treatment-grid-pagedown-from-middle')
        await step()
    })

    test('TC-PG-4 — PageUp ở dòng đầu lưới: kẹp lại, ô vàng đứng yên', async () => {
        // Lưới nạp DẦN các tháng cũ (virtualize) khi cuộn lên, nên "đầu phần đang render"
        // chưa phải đầu lưới. Dòng lịch sử mang rowKey `<tháng>-<dòng>`: dòng ĐẦU THẬT là
        // `0-0`. Mỗi lần bấm chờ ô vàng đổi hẳn rồi mới bấm tiếp.
        const FIRST_ROW = new RegExp(`^0-0\\|${COL_RYO}$`)
        let presses = 0
        for (; presses < 400 && !FIRST_ROW.test((await focusedId(page)) ?? ''); presses++) {
            const was = await focusedId(page)
            await page.keyboard.press('PageUp')
            await expect.poll(() => focusedId(page), { timeout: 5000 }).not.toBe(was)
        }
        const firstId = await focusedId(page)
        console.log(`TC-PG-4: ${presses} lần PageUp tới dòng đầu ${firstId}`)
        expect(firstId, 'bấm PageUp mãi mà không tới được dòng đầu lưới').toMatch(FIRST_ROW)
        await page.keyboard.press('PageUp')
        await step()
        await expect.poll(() => focusedId(page), 'PageUp ở dòng đầu làm ô vàng chạy lung tung').toBe(firstId)
    })
})
