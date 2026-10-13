import { type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * Parity WinForm ↔ web: 診療入力設定 (frm203003), mở bằng F11 「設定」 ở màn 患者選択.
 *
 * Kỳ vọng ĐO trên WinForm thật (FlaUI `Tests/ToothInfo` Tc6a) + source `frm203003.cs`:
 *   - focus lúc mở ở nút F9 登録;
 *   - ESC và End = F9 (BaseDialog): GHI setting rồi đóng, KHÔNG hỏi xác nhận;
 *   - 過去データを表示する ⟷ 過去データ1画面表示 loại trừ nhau (tick bên này thì bên kia bỏ tick);
 *   - nút リセット hỏi 「学習結果をリセットしてもよろしいですか？」 (tiêu đề リセット) với OK / キャンセル.
 *
 * KHÔNG ghi thật: mọi PUT /tenant/settings/inp và PUT /v1/config bị chặn (route abort), nút リセット
 * luôn キャンセル.
 */
const SETTINGS_INP = /\/tenant\/settings\/inp(\?|$)/
const AGENT_CONFIG = /\/v1\/config(\?|$)/

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('Parity — 診療入力設定', () => {
    let page: Page
    const attempts: string[] = []

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        page.on('dialog', (d) => void d.accept().catch(() => {}))
        await page.route(SETTINGS_INP, (r) => {
            if (r.request().method() === 'GET') return r.continue()
            attempts.push(`${r.request().method()} settings/inp`)
            return r.abort()
        })
        await page.route(AGENT_CONFIG, (r) => {
            if (r.request().method() === 'GET') return r.continue()
            attempts.push(`${r.request().method()} agent/config`)
            return r.abort()
        })
    })

    test.afterAll(async () => {
        await page.unroute(SETTINGS_INP).catch(() => {})
        await page.unroute(AGENT_CONFIG).catch(() => {})
        await releaseSharedPage(page)
    })

    async function openDialog() {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F11"]')).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(1_200)
        const history = page.getByRole('listbox', { name: 'Suggestions' })
        if (await history.isVisible().catch(() => false)) await page.keyboard.press('Escape')
        await page.locator('[data-fkey="F11"]').click()
        const dlg = page.getByRole('dialog').filter({ hasText: /診\s*療\s*入\s*力\s*設\s*定/ }).last()
        await expect(dlg).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(1_000)
        return dlg
    }

    test('TC-focus — focus lúc mở ở nút F9 登録', async () => {
        const dlg = await openDialog()
        await expect(dlg.locator('[data-fkey="F9"]')).toBeFocused()
        await dlg.locator('[data-fkey="F10"]').click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    test('TC-ESC-End — ESC và End = F9 登録 (gửi request ghi, không hỏi xác nhận)', async () => {
        const dlg = await openDialog()
        for (const key of ['Escape', 'End']) {
            const before = attempts.length
            await dlg.locator('[data-fkey="F9"]').focus()
            await page.keyboard.press(key)
            await expect.poll(() => attempts.length, { message: `${key} phải chạy 登録`, timeout: 10_000 }).toBeGreaterThan(before)
            await expect(page.getByRole('alertdialog'), `${key} không được hỏi xác nhận`).toBeHidden()
        }
        // Ghi bị chặn nên dialog còn mở (登録 thất bại giữ nguyên màn) — đóng bằng F10.
        if (await dlg.isVisible().catch(() => false)) await dlg.locator('[data-fkey="F10"]').click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    test('TC-loại-trừ — 過去データを表示する ⟷ 過去データ1画面表示', async () => {
        const dlg = await openDialog()
        const first = dlg.getByRole('checkbox', { name: '過去データを表示する' })
        const single = dlg.getByRole('checkbox', { name: '過去データ1画面表示' })
        for (const c of [first, single]) if ((await c.getAttribute('aria-checked')) === 'true') await c.click()
        await first.click()
        await expect(first).toHaveAttribute('aria-checked', 'true')
        await single.click()
        await expect(single).toHaveAttribute('aria-checked', 'true')
        await expect(first, 'tick 1画面表示 phải bỏ tick 過去データを表示する').toHaveAttribute('aria-checked', 'false')
        await first.click()
        await expect(single, 'tick 過去データを表示する phải bỏ tick 1画面表示').toHaveAttribute('aria-checked', 'false')
        await dlg.locator('[data-fkey="F10"]').click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    test('TC-リセット — hỏi 「学習結果をリセットしてもよろしいですか？」 với OK / キャンセル', async () => {
        const dlg = await openDialog()
        await dlg.getByRole('tab', { name: '学習機能' }).click()
        await dlg.getByRole('button', { name: '全て', exact: true }).click()
        const box = page.getByRole('alertdialog')
        await expect(box).toBeVisible({ timeout: 10_000 })
        expect((await box.innerText()).replace(/\s+/g, ' ')).toContain('学習結果をリセットしてもよろしいですか？')
        expect((await box.getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)).toEqual(['OK', 'キャンセル'])
        await box.getByRole('button', { name: 'キャンセル' }).click()
        await dlg.locator('[data-fkey="F10"]').click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })
})
