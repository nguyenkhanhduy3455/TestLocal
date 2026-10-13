import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Công cụ ĐO (không assert) dùng cho các probe parity: in ra dòng `=== KQ-WB… [tag] ===` cùng khuôn với
 * bên WinForm (`=== KQ-B/C… ===`). Chỉ dùng trong probe tạm; spec chính thức dùng assert.
 */
export function log(line: string) {
    // eslint-disable-next-line no-console
    console.log(line)
}

export function createDialogProbe(page: Page) {
    const box = () => page.getByRole('alertdialog')

    async function appeared(l: Locator, timeout: number): Promise<boolean> {
        return l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    /** Phần tử đang giữ focus: loại, nhãn, giá trị, tick, vùng bôi đen. */
    async function focusInfo(): Promise<string> {
        return page.evaluate(() => {
            const a = document.activeElement as HTMLInputElement | null
            if (!a || a === document.body) return '(body)'
            const hasSel = typeof a.selectionStart === 'number' && a.selectionStart !== a.selectionEnd
            const sel = hasSel ? (a.value ?? '').slice(a.selectionStart ?? 0, a.selectionEnd ?? 0) : ''
            const fromLabel = a.labels?.[0]?.textContent ?? a.closest('label')?.textContent ?? ''
            const label = (a.getAttribute('aria-label') || fromLabel || a.textContent || a.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
            const role = a.getAttribute('role') ?? a.type ?? ''
            const hint = label === '' ? ` html=${a.outerHTML.replace(/\s+/g, ' ').slice(0, 110)}` : ''
            const checked = a.type === 'checkbox' || a.type === 'radio' ? `checked=${a.checked}` : a.getAttribute('aria-checked') ? `checked=${a.getAttribute('aria-checked')}` : ''
            const fk = a.closest('[data-fkey]')?.getAttribute('data-fkey')
            return `${a.tagName.toLowerCase()}[${role}]${fk ? `[data-fkey=${fk}]` : ''} 「${label}」 value=「${a.value ?? ''}」 ${checked} bôiĐen=「${sel}」${hint}`
        })
    }

    async function takeBox(prefer: RegExp, timeout = 6_000): Promise<string | null> {
        if (!(await appeared(box(), timeout))) return null
        const text = (await box().innerText()).trim().replace(/\s+/g, ' ')
        const buttons = (await box().getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(', ')
        const btn = box().getByRole('button', { name: prefer }).first()
        if (await btn.count()) await btn.click()
        else await box().getByRole('button').first().click()
        await expect(box()).toBeHidden({ timeout: 10_000 })
        return `「${text}」 nút=[${buttons}]`
    }

    /** Đo một dialog: `open()` mở (lại) nó và trả Locator; F-key, control, focus, Tab, ESC/End/Enter/F8/F9. */
    async function measure(tag: string, open: () => Promise<Locator | null>, tabSteps = 40, keys = ['Escape', 'End', 'Enter', 'F8', 'F9']) {
        const dlg = await open()
        log(`=== KQ-WB1 [${tag}] === dialog: ${dlg ? 'MỞ' : 'KHÔNG mở'}`)
        if (!dlg) return
        await page.waitForTimeout(1_200)

        const fk = await dlg.locator('[data-fkey]').evaluateAll((els) =>
            els.map((e) => `${e.getAttribute('data-fkey')}=「${(e.textContent ?? '').trim().replace(/\s+/g, ' ')}」${(e as HTMLButtonElement).disabled ? '(disabled)' : ''}`).join(' '),
        )
        log(`=== KQ-WB1 [${tag}] === F-key: ${fk}`)
        log(`=== KQ-WB1 [${tag}] === tiêu đề: 「${(await dlg.getByRole('heading').first().innerText().catch(() => '?')).trim()}」`)

        const controls = await dlg.locator('input, textarea, select, [role="combobox"], [role="checkbox"], [role="radio"], [role="grid"], table, svg').evaluateAll((els) =>
            els.slice(0, 120).map((e) => {
                const a = e as HTMLInputElement
                const fromLabel = a.labels?.[0]?.textContent ?? a.closest('label')?.textContent ?? ''
                const label = (a.getAttribute('aria-label') || fromLabel || '').trim().replace(/\s+/g, ' ').slice(0, 40)
                return `${a.tagName.toLowerCase()}[${a.getAttribute('role') ?? a.type ?? ''}] 「${label}」 value=「${a.value ?? ''}」 ${a.disabled ? 'disabled' : ''} maxlen=${a.maxLength > 0 ? a.maxLength : ''}`
            }),
        )
        controls.forEach((c, i) => log(`=== KQ-WB2 [${tag}] === #${i + 1} ${c}`))
        log(`=== KQ-WB2 [${tag}] === tổng ${controls.length} control (tối đa 120)`)

        log(`=== KQ-WB6 [${tag}] === focus lúc MỞ: ${await focusInfo()}`)
        for (let i = 1; i <= tabSteps; i++) {
            await page.keyboard.press('Tab')
            await page.waitForTimeout(100)
            log(`=== KQ-WB6 [${tag}] === Tab#${i} → ${await focusInfo()}`)
        }

        const reopen = async () => {
            if (await dlg.isVisible().catch(() => false)) return
            await open()
            await page.waitForTimeout(1_000)
        }
        for (const key of keys) {
            await reopen()
            await dlg.click({ position: { x: 5, y: 5 } }).catch(() => {})
            await page.keyboard.press(key)
            await page.waitForTimeout(1_200)
            const text = await takeBox(/^(Cancel|キャンセル|No|いいえ)$/, 3_000)
            const alive = await dlg.isVisible().catch(() => false)
            log(`=== KQ-WB7 [${tag}] === ${key}: dialog ${alive ? 'còn' : 'ĐÃ ĐÓNG'}, hộp thoại=${text ?? 'không'}; focus: ${await focusInfo()}`)
        }
        if (await dlg.isVisible().catch(() => false)) {
            await page.getByRole('button', { name: /F10\s*戻る/ }).last().click().catch(() => {})
            await expect(dlg).toBeHidden({ timeout: 10_000 }).catch(() => {})
        }
    }

    return { box, appeared, focusInfo, takeBox, measure }
}
