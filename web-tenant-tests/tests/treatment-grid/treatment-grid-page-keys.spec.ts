import { type Page } from '@playwright/test'

import { openTreatmentEntry } from '../_shared/entry'
import { patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 処置入力 (frm203002) — PageUp / PageDown trên lưới grdRegi.
 *
 * WinForm `grdRegi_KeyDown` KHÔNG bắt PageUp/PageDown, nên chúng rơi về hành vi
 * mặc định của DataGridView: ô hiện tại nhảy MỘT TRANG (số dòng đang hiện trọn
 * vẹn) trong CÙNG cột, kẹp ở dòng đầu/cuối, và lưới cuộn theo.
 *
 * KHÔNG GHI DB: chỉ mở màn và bấm phím di chuyển, không F9 登録.
 * Chạy cả file:
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
    /** `data-grid-cell` của các ô cùng cột với ô vàng, theo thứ tự từ trên xuống. */
    ids: string[]
    /** Vị trí ô vàng trong `ids`. */
    at: number
    /** Số ô của cột đang hiện TRỌN trong khung cuộn = một trang. */
    page: number
    /** Ô vàng có nằm trọn trong khung cuộn không. */
    focusedVisible: boolean
}

/** Đọc cột của ô vàng, giống cách DataGridView đếm một trang. */
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
        const inView = (r: DOMRect) => r.top >= v.top - 1 && r.bottom <= v.bottom + 1
        return {
            ids: column.map(({ el }) => el.dataset.gridCell!),
            at: column.findIndex(({ el }) => el === cur),
            page: column.filter(({ r }) => inView(r)).length,
            focusedVisible: inView(c),
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

test.describe.configure({ mode: 'serial' })

test.describe('処置入力 — PageUp/PageDown trên lưới grdRegi', () => {
    let page: Page
    let step: () => Promise<void>
    let start: ColumnState

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-PG-1 — PageDown: ô vàng nhảy đúng một trang trong cùng cột, lưới cuộn theo', async () => {
        // Đứng ở ô 療法 trên cùng đang hiện, để chắc chắn còn chỗ nhảy xuống.
        const firstVisible = await page.evaluate((col) => {
            const cells = Array.from(document.querySelectorAll<HTMLElement>(`[data-grid-cell$="|${col}"]`))
            const top = cells.find((el) => {
                const r = el.getBoundingClientRect()
                return r.top > 0 && r.bottom < window.innerHeight && r.height > 0
            })
            return top?.dataset.gridCell ?? null
        }, COL_RYO)
        expect(firstVisible, 'không thấy ô 療法 nào trên màn').not.toBeNull()
        await page.locator(`[data-grid-cell="${firstVisible}"]`).click()
        await expect.poll(() => focusedId(page)).toBe(firstVisible)

        start = await columnState(page)
        console.log(`TC-PG-1: cột có ${start.ids.length} ô, một trang = ${start.page} ô, đứng ở #${start.at}`)
        expect(start.ids.length, 'lưới quá ngắn — cần hơn một trang dòng để đo').toBeGreaterThan(start.page)

        await page.keyboard.press('PageDown')
        await step()
        const expected = start.ids[Math.min(start.ids.length - 1, start.at + start.page)]
        await expect.poll(() => focusedId(page), 'PageDown không đưa ô vàng xuống đúng một trang').toBe(expected)
        const after = await columnState(page)
        expect(after.focusedVisible, 'ô vàng mới nằm ngoài khung — lưới không cuộn theo').toBe(true)
    })

    test('TC-PG-2 — PageUp: lùi đúng một trang (tính tại chỗ đang đứng), lưới cuộn theo', async () => {
        // Dòng cao thấp khác nhau nên "một trang" ở đây có thể khác lúc PageDown —
        // DataGridView cũng đếm theo dòng đang hiện tại chỗ đứng, không nhớ trang cũ.
        const before = await columnState(page)
        await page.keyboard.press('PageUp')
        await step()
        const expected = before.ids[Math.max(0, before.at - before.page)]
        console.log(`TC-PG-2: một trang tại chỗ = ${before.page} ô, #${before.at} → #${before.ids.indexOf(expected!)}`)
        await expect.poll(() => focusedId(page), 'PageUp không lùi ô vàng đúng một trang').toBe(expected)
        expect((await columnState(page)).focusedVisible).toBe(true)
    })

    test('TC-PG-3 — PageUp ở dòng đầu: kẹp lại, ô vàng đứng yên ở dòng đầu', async () => {
        // Lưới nạp thêm tháng cũ khi cuộn lên ⇒ đọc lại cột mỗi lần, không dùng `start`.
        for (let i = 0; i < 200 && (await columnState(page)).at !== 0; i++) {
            await page.keyboard.press('PageUp')
        }
        const top = await columnState(page)
        expect(top.at, 'bấm PageUp mãi mà không tới được dòng đầu').toBe(0)
        console.log(`TC-PG-3: dòng đầu = ${top.ids[0]} (cột ${top.ids.length} ô)`)
        await page.keyboard.press('PageUp')
        await step()
        await expect
            .poll(() => focusedId(page), 'PageUp ở dòng đầu làm ô vàng chạy lung tung')
            .toBe(top.ids[0])
    })
})
