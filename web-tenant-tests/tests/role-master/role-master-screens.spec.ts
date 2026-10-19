import { type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * ロールマスタ (web-only, admin): mọi màn — 一覧, 新規, 更新 — đều có dải 画面名
 * 「ロ ー ル マ ス タ」 như ユーザマスタ. Khung 一覧 chuẩn do Rule 24
 * (master-screens-chrome.spec.ts) kiểm; ở đây chỉ kiểm header + chụp lại.
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 })

const LIST_URL = '/settings/role-master'
const TITLE = 'ロ ー ル マ ス タ'

test.describe('ロールマスタ — header trên 一覧 / 新規 / 更新', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    const header = () => page.getByRole('heading', { name: TITLE, exact: true })

    test('TC-1 — 一覧 có header và 2 role hệ thống', async () => {
        await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' })
        await expect(header()).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText('管理者', { exact: true })).toBeVisible()
        await expect(page.getByText('ユーザ', { exact: true })).toBeVisible()
        await captureFixedUi(page, 'role-master-list')
    })

    test('TC-2 — F1 新規 vẫn giữ header', async () => {
        await page.keyboard.press('F1')
        await expect(page).toHaveURL(/\/settings\/role-master\/new$/, { timeout: 30_000 })
        await expect(header()).toBeVisible()
        await expect(page.getByLabel('コード', { exact: true })).toBeVisible()
        await captureFixedUi(page, 'role-master-new')
    })

    test('TC-3 — mở role hệ thống (更新) vẫn giữ header, không sửa được', async () => {
        await page.keyboard.press('F10')
        await expect(page).toHaveURL(/\/settings\/role-master$/, { timeout: 30_000 })
        await page.getByText('ユーザ', { exact: true }).dblclick()
        await expect(page).toHaveURL(/\/settings\/role-master\/[0-9a-f-]{36}$/, { timeout: 30_000 })
        await expect(header()).toBeVisible()
        await expect(page.getByLabel('ロール名', { exact: true })).toBeDisabled()
        await captureFixedUi(page, 'role-master-edit-system')
    })
})
