/**
 * 来患一覧 (frm204008) — phần chưa có ở patient-visit-list-csv / -rcp-type: F-key, kiểm điều kiện, ESC/End, F10.
 *
 * ĐÁP ÁN = WinForm (đọc source):
 *  - F-key: F4 CSV出力 | F10 戻る | F12 メニュー (frm204008.cs:49-57; SeisanTestBase.Fk204008 đã đo).
 *  - 診療年月 sai ⇒ E00002 「診療年月が間違っています。」 (chkCondition :561-569).
 *  - 集計 ra 0 dòng ⇒ E00003 「該当データがありません。」 (searchProc :513-528).
 *  - ⛔ ESC / End = 集計 (btnEndEsc_Click :366-370 gọi searchProc).
 *  - F10 ⇒ về màn trước (未精算患者一覧) (:333-347).
 * Không seed, không ghi DB.
 */
import { type Locator, type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

test.describe.configure({ retries: 0, timeout: 180_000 })

let page: Page
let step: () => Promise<void>

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
})

test.afterAll(async () => {
    await releaseSharedPage(page)
})

const fkey = (k: string): Locator => page.locator(`[data-fkey="${k}"]`).last()
const alert = (): Locator => page.getByRole('alertdialog').last()
const ymRow = (): Locator => page.locator('div').filter({ has: page.getByText('診療年月', { exact: true }) }).last()

async function openFromUnpaidList(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        await page.goto('/counter-payments', { waitUntil: 'domcontentloaded' })
        try {
            await expect(fkey('F3')).toContainText('来患一覧', { timeout: 30_000 })
            await fkey('F3').click()
            await expect(page.getByRole('heading', { name: '来患一覧' })).toBeVisible({ timeout: 30_000 })
            await expect(ymRow().getByRole('textbox').first()).toBeEnabled({ timeout: 30_000 })
            await step()
            return
        } catch (e) {
            if (attempt === 3) throw e
        }
    }
}
async function setYm(era: string, year: string, month: string): Promise<void> {
    await ymRow().getByRole('combobox').click()
    await page.getByRole('listbox').getByRole('option').filter({ hasText: era }).first().click()
    const boxes = ymRow().getByRole('textbox')
    await boxes.nth(0).fill(year)
    await boxes.nth(1).fill(month)
    await step()
}
const search = (): Promise<void> => page.getByRole('button', { name: '検索', exact: true }).click()

test.describe('来患一覧 — hành vi', () => {
    test.describe.configure({ mode: 'serial' })

    test('V-1 — F-key: F4 CSV出力 / F10 戻る / F12 メニュー', async () => {
        await openFromUnpaidList()
        await expect(fkey('F4')).toContainText('CSV出力')
        await expect(fkey('F10')).toContainText('戻る')
        await expect(fkey('F12')).toContainText('メニュー')
    })

    test('V-2 — 診療年月 để trống tháng ⇒ E00002 「診療年月が間違っています。」', async () => {
        await setYm('令和', '8', '')
        await search()
        await expect(alert()).toContainText('診療年月が間違っています。')
        await alert().getByRole('button').first().click()
        await expect(alert()).toBeHidden()
    })

    test('V-3 — tháng không có dữ liệu (平成2年1月) ⇒ E00003 「該当データがありません。」', async () => {
        await setYm('平成', '2', '1')
        await search()
        await expect(alert()).toContainText('該当データがありません。', { timeout: 120_000 })
        await alert().getByRole('button').first().click()
        await expect(alert()).toBeHidden()
        await expect(fkey('F4'), 'không có dòng ⇒ F4 mờ').toBeDisabled()
    })

    test('V-4 — F10 ⇒ về 未精算患者一覧', async () => {
        await fkey('F10').click()
        await expect(page).toHaveURL(/\/counter-payments\/?$/, { timeout: 30_000 })
    })
})

test.describe('来患一覧 — parity ⛔', () => {
    test('P-1 — ESC = 集計 (btnEndEsc_Click :366-370): 平成2年1月 + ESC ⇒ E00003', async () => {
        await openFromUnpaidList()
        await setYm('平成', '2', '1')
        await page.locator('body').click({ position: { x: 5, y: 5 } })
        await page.keyboard.press('Escape')
        await expect(alert(), 'ESC phải chạy 集計 như WinForm').toContainText('該当データがありません。', { timeout: 60_000 })
    })
})
