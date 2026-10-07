import fs from 'node:fs'
import path from 'node:path'

import { type Page } from '@playwright/test'

import { patNo, trtDt } from '../_shared/env'
import { expect } from '../_shared/session'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * Parity 診療入力 — vế web: mở màn + ghi snapshot JSON, schema dùng chung với vế WinForm
 * (`fla-ui-tests/.../Tests/ParitySnapshot/InpSnapshot.cs`). So bằng
 * `tools/parity-snapshot/diff.mjs`; chạy cả hai vế + diff bằng `tools/parity-snapshot/run-case.sh`.
 *
 * Lưới web virtualize tháng cũ theo TỪNG THÁNG (`div[data-index]`, registration-table.tsx)
 * ⇒ cuộn từ đầu tới cuối, gom mỗi tháng một lần. Ô `col-span-N` trải lại thành N ô để
 * dòng nào cũng đủ 5 cột như grdRegi.
 *
 * Mặc định 3948 / 2026-06-28: TRNTRN khớp từng dòng giữa SQL Server và Postgres (đo
 * 2026-10-05 sau migrate), 47 dòng nên WinForm không treo.
 */
export const PAT_NO = patNo('3948')
export const TRT_DT = trtDt('2026-06-28')
const OUT_DIR = process.env.PARITY_SNAPSHOT_DIR ?? path.resolve(__dirname, '../../../capture-results/parity-snapshot')

const GRID_LOAD_TIMEOUT = 60_000
/** TABLE_GRID_COLS (treatment-entry-shared.ts) — mọi dòng của lưới đều mang class này. */
const ROW_CLASS = 'grid-cols-[30px_290px'
const COLS = 5

/** Mở 診療入力 của bệnh nhân/ngày parity và chờ lưới nạp. */
export async function openInp(page: Page): Promise<void> {
    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-grid-cell$="|2"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    await closeDialogs(page)
}

/** Ghi snapshot của màn hiện tại; `extra` = dữ liệu riêng của kịch bản, so theo khoá. */
export async function dumpSnapshot(page: Page, caseName: string, extra: Record<string, unknown> = {}): Promise<string> {
    // Grid có thể không còn (đã rời màn) — không assert ở đây, xem nhánh mainHidden bên dưới.
    const header = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll<HTMLElement>('div.bg-blue-50')).map((e) => e.innerText.trim())
        const ymEl = Array.from(document.querySelectorAll<HTMLElement>('div, span')).find((e) =>
            /^処置年月:/.test(e.innerText.trim()) && e.innerText.trim().length < 30,
        )
        return {
            patNo: boxes.find((t) => /^\d+$/.test(t)) ?? '',
            ym: ymEl?.innerText.replace(/^処置年月:\s*/, '').trim() ?? '',
            total: boxes.find((t) => /点$/.test(t)) ?? '',
            days: boxes.find((t) => /日$/.test(t)) ?? '',
        }
    })

    const fkeys: Record<string, string> = {}
    // Chỉ thanh phím của màn chính — hộp thoại (処置選択…) có F9 「確定」 riêng.
    const fkeyTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('button'))
            .filter((b) => !b.closest('[role="dialog"],[role="alertdialog"]') && /^\s*F\d{1,2}\b/.test(b.innerText))
            .map((b) => b.innerText),
    )
    for (const t of fkeyTexts) {
        const m = t.trim().match(/^F(\d{1,2})\s*([\s\S]*)$/)
        if (m && fkeys[`F${m[1]}`] === undefined) fkeys[`F${m[1]}`] = `F${m[1]}${m[2]!.replace(/\s+/g, '')}`
    }

    const rows = await page.evaluate(
        async ({ rowClass, cols }) => {
            const head = Array.from(document.querySelectorAll<HTMLElement>('.table-header-row')).find((h) =>
                h.innerText.includes('療法・処置'),
            )
            const scroller = head?.parentElement
            // Đã rời màn 診療入力 (患者登録…) ⇒ không có lưới — dumpSnapshot xử lý mainHidden.
            if (!scroller) return []
            const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))

            const readRow = (row: HTMLElement): string[] => {
                const out: string[] = []
                for (const cell of Array.from(row.children) as HTMLElement[]) {
                    const input = cell.querySelector('input')
                    out.push((input ? input.value : cell.innerText).trim())
                    const span = Number(cell.className.match(/col-span-(\d+)/)?.[1] ?? 1)
                    for (let i = 1; i < span; i++) out.push('')
                }
                while (out.length < cols) out.push('')
                return out.slice(0, cols)
            }
            const rowsIn = (root: Element) =>
                Array.from(root.querySelectorAll<HTMLElement>(`[class*="${rowClass}"]`)).filter(
                    (r) => r !== head && !r.parentElement?.closest(`[class*="${rowClass}"]`),
                )

            const history = new Map<number, string[][]>()
            scroller.scrollTop = 0
            await frame()
            for (;;) {
                for (const item of Array.from(scroller.querySelectorAll<HTMLElement>('[data-index]'))) {
                    const idx = Number(item.dataset.index)
                    if (!history.has(idx)) history.set(idx, rowsIn(item).map(readRow))
                }
                if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) break
                scroller.scrollTop += scroller.clientHeight
                await frame()
            }
            const tail = rowsIn(scroller)
                .filter((r) => !r.closest('[data-index]'))
                .map(readRow)
            return [...[...history.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, r]) => r), ...tail]
        },
        { rowClass: ROW_CLASS, cols: COLS },
    )

    // Đã rời màn 診療入力 (患者登録…): như vế WinForm (mainHidden) — chỉ so cửa sổ đang mở; tiêu
    // đề trang mới đưa vào `dialogs` để so với tiêu đề cửa sổ WinForm.
    if (rows.length === 0) {
        extra = { ...extra, mainHidden: true }
        const heading = await page.evaluate(() =>
            Array.from(document.querySelectorAll('main h1, main h2, h1'))
                .map((e) => (e as HTMLElement).innerText.trim())
                .find((t) => t !== '' && t !== 'tenant1') ?? '',
        )
        const dialogs = Array.isArray(extra.dialogs) ? (extra.dialogs as unknown[]) : []
        if (heading && dialogs.length === 0) extra.dialogs = [{ title: heading, headers: [], rows: [], text: '' }]
    }
    const snapshot = { source: 'web', case: caseName, patNo: PAT_NO, trtDt: TRT_DT, header, fkeys, rows, extra }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const file = path.join(OUT_DIR, `web-${caseName}-${PAT_NO}-${TRT_DT}.json`)
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2))
    console.log(`=== SNAPSHOT ${caseName} === ${rows.length} rows → ${file}`)
    return file
}

/** Số dòng đầu của danh sách panel đem so — cùng mốc `InpSnapshot.PanelRows` của vế WinForm
 *  (UIA chỉ phơi dòng đang thấy, FLA-UI-GUIDELINE F10). */
export const PANEL_ROWS = 12

const sidePanel = (page: Page) => page.locator('div[class*="w-[450px]"]').first()

/** Chọn tab panel phải theo tên (病検 / ガイド / パック / 個別). */
export async function openPanelTab(page: Page, tab: string): Promise<void> {
    await sidePanel(page).getByRole('button', { name: tab, exact: true }).click()
    await expect(sidePanel(page).getByText(/読込中/)).toHaveCount(0, { timeout: 30_000 })
}

/** Tab panel phải đang chọn + tiêu đề cột + `PANEL_ROWS` dòng đầu — cùng schema vế WinForm. */
export async function readPanel(page: Page): Promise<{ tab: string; headers: string[]; rows: string[][] }> {
    return sidePanel(page).evaluate((panel, max) => {
        const [tabBar, list] = Array.from(panel.children) as HTMLElement[]
        const active = Array.from(tabBar!.querySelectorAll('button')).find((b) => b.className.includes('bg-accent'))
        // Dòng = phần tử `grid` không lồng trong một dòng `grid` khác; dòng đầu là tiêu đề.
        const grids = Array.from(list!.querySelectorAll<HTMLElement>('.grid')).filter(
            (g) => !g.parentElement?.closest('.grid'),
        )
        const cells = (g: HTMLElement) => Array.from(g.children).map((c) => (c as HTMLElement).innerText.trim())
        const [head, ...body] = grids
        return {
            tab: active?.innerText.trim() ?? '',
            headers: head ? cells(head) : [],
            rows: body.map(cells).filter((r) => r.some((c) => c !== '')).slice(0, max),
        }
    }, PANEL_ROWS)
}

/** Hộp thoại đang mở: tiêu đề (h2) + tiêu đề cột + `PANEL_ROWS` dòng đầu của bảng bên trong.
 *  Cùng schema `InpSnapshot.ReadDialogs` của vế WinForm. */
export async function readDialogs(
    page: Page,
): Promise<{ title: string; headers: string[]; rows: string[][]; text: string }[]> {
    return page.evaluate((max) => {
        const text = (e: Element | null | undefined) => (e as HTMLElement | null)?.innerText.trim() ?? ''
        return Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).map((d) => {
            const head = d.querySelector('[data-testid="table-header-row"]')
            // Ô = `data-testid="cell-<cột>"` (VirtualListTable); dòng = cha trực tiếp của ô,
            // giữ thứ tự xuất hiện trong DOM.
            const byRow = new Map<Element, string[]>()
            for (const c of Array.from(d.querySelectorAll<HTMLElement>('[data-testid^="cell-"]'))) {
                const row = c.parentElement!
                if (!byRow.has(row)) byRow.set(row, [])
                // Ô sửa được (回数 của ガイド処置選択…) là <input> — innerText rỗng, phải đọc value.
                const input = c.querySelector('input')
                byRow.get(row)!.push((input ? input.value : c.innerText).trim())
            }
            const rows = Array.from(byRow.values()).filter((r) => r.some((c) => c !== '')).slice(0, max)
            return {
                // Dòng CUỐI của h2: hộp メインメニュー có 「tenant1」 ở dòng đầu (logo).
                title:
                    (text(d.querySelector('h2') ?? d.querySelector('h1') ?? d.querySelector('h3'))
                        .split('\n')
                        .filter((l) => l.trim() !== '')
                        .pop() ??
                        '') ||
                    d.getAttribute('aria-label') ||
                    ((d as HTMLElement).innerText.trim().split('\n')[0] ?? ''),
                headers: head ? Array.from(head.children).map((c) => text(c)).filter((h) => h !== '') : [],
                rows,
                // Như vế WinForm: chỉ hộp THÔNG BÁO (alertdialog ⇔ MsgBox #32770) mới so chữ.
                text:
                    d.getAttribute('role') === 'alertdialog'
                        ? Array.from(d.querySelectorAll('p')).map((p) => text(p)).join('\n')
                        : '',
            }
        })
    }, PANEL_ROWS)
}

/** Đặt 入力モード (nút 「点数/コード 入力モード切替」). */
export async function ensureMode(page: Page, want: '点数' | 'コード'): Promise<void> {
    const btn = page.locator('button[title^="点数/コード 入力モード切替"]')
    if ((await btn.innerText()).trim() !== want) await btn.click()
    await expect(btn).toHaveText(want)
}

/** Gõ vào ô 点 của dòng 日計 cuối cùng (ô vàng) rồi Enter — như `InpSnapshot.TypeIntoFooterTen`. */
export async function typeIntoFooterTen(page: Page, typed: string): Promise<void> {
    const ten = page.locator('input[data-footer-cell$=":footer-ten"]').last()
    await ten.scrollIntoViewIfNeeded()
    await ten.click()
    await ten.fill(typed)
    await ten.press('Enter')
    await expect(ten, 'Enter chưa được xử lý').toHaveValue('')
}

/** Gõ số vào ô 選択№ của tab đang mở rồi Enter — như `InpSnapshot.SelectNo`. */
export async function selectNo(page: Page, no: number): Promise<void> {
    // Nhãn khác nhau theo tab (「№」 ở 病検 / 個別, 「No.」 ở ガイド / パック).
    const box = sidePanel(page).locator('span', { hasText: /^(№|No\.?)$/ }).locator('xpath=following-sibling::input[1]')
    await box.click()
    await box.fill(String(no))
    await box.press('Enter')
    await page.waitForLoadState('networkidle')
}

/** 個別: gõ ｺｰﾄﾞ rồi bấm 検索, chờ list có dòng. */
export async function kobeSearchByCode(page: Page, code: number): Promise<void> {
    const panel = sidePanel(page)
    await panel.locator('span', { hasText: /^ｺｰﾄﾞ$/ }).locator('xpath=following-sibling::input[1]').fill(String(code))
    await panel.getByRole('button', { name: '検索' }).click()
    await expect(panel.locator('div[data-index]').first()).toBeVisible({ timeout: 20_000 })
}

/** Panel 処置履歴 (history-panel.tsx): các dòng 5 cột, ô col-span trải lại. Không mở thì rỗng. */
export async function readHistory(page: Page): Promise<string[][]> {
    return page.evaluate((cols) => {
        const title = Array.from(document.querySelectorAll('span')).find((e) => e.textContent?.trim() === '処置履歴')
        const panel = title?.closest('.rounded-t')
        if (!panel) return []
        const rows = Array.from(panel.querySelectorAll<HTMLElement>('[class*="grid-cols-[30px_290px"]')).filter(
            (r) => !r.parentElement?.closest('[class*="grid-cols-[30px_290px"]'),
        )
        const out: string[][] = []
        for (const [i, row] of rows.entries()) {
            if (i === 0) continue // dòng tiêu đề 日/部位/療法・処置/点/回
            const cells: string[] = []
            for (const cell of Array.from(row.children) as HTMLElement[]) {
                cells.push(cell.innerText.trim())
                const span = Number(cell.className.match(/col-span-(\d+)/)?.[1] ?? 1)
                for (let k = 1; k < span; k++) cells.push('')
            }
            while (cells.length < cols) cells.push('')
            if (cells.some((c) => c !== '')) out.push(cells.slice(0, cols))
        }
        return out
    }, 5)
}

/** Nút 履歴(&R) → menu con (履歴を表示 → …). */
export async function openHistoryMenu(page: Page, ...path: string[]): Promise<void> {
    await page.getByRole('button', { name: '履歴(&R)', exact: true }).click()
    // .last(): mục menu render SAU — 「履歴を隠す」 còn trùng aria-label nút X của panel 処置履歴.
    for (const item of path) await page.getByRole('button', { name: new RegExp(item) }).last().click()
    await page.waitForLoadState('networkidle')
}

/** Con trỏ ở 歯科疾患管理料 → F11 → bấm lần lượt các mục menu (role="menu", row-context-menu.tsx). */
export async function f11Menu(page: Page, ...path: string[]): Promise<void> {
    const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
    await cell.scrollIntoViewIfNeeded()
    await cell.click()
    await page.keyboard.press('F11')
    // Mục cha (オプション / 転帰) mở menu con khi HOVER; click lại thì ĐÓNG (activateTop toggle,
    // row-context-menu.tsx) ⇒ hover các mục cha, chỉ click mục cuối. Menu con không nằm trong
    // role="menu" — tìm theo tên nút.
    for (const [i, label] of path.entries()) {
        const item = page.getByRole('button', { name: label, exact: true }).last()
        if (i < path.length - 1) await item.hover()
        else await item.click()
    }
    await page.waitForLoadState('networkidle')
    await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 8_000 }).catch(() => {})
}
