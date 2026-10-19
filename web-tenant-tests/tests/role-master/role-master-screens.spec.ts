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

    test('TC-2b — chọn/bỏ nhanh cả cột 閲覧 / 編集', async () => {
        // Đang ở màn 新規 (TC-2). 17 màn × 2 cột = 34 ô + 2 ô chọn tất cả.
        const boxes = page.getByRole('checkbox')
        const allView = page.getByRole('checkbox', { name: '閲覧をすべて選択' })
        const allEdit = page.getByRole('checkbox', { name: '編集をすべて選択' })

        await allEdit.click()
        await expect(allEdit).toHaveAttribute('data-state', 'checked')
        // 編集 kéo theo 閲覧.
        await expect(allView).toHaveAttribute('data-state', 'checked')
        await expect(page.locator('[role="checkbox"][data-state="checked"]')).toHaveCount(await boxes.count())
        await captureFixedUi(page, 'role-master-select-all')

        // Bỏ hết 閲覧 ⇒ bỏ luôn hết 編集.
        await allView.click()
        await expect(page.locator('[role="checkbox"][data-state="checked"]')).toHaveCount(0)

        // Tick 1 ô ⇒ ô chọn tất cả ở trạng thái một phần.
        await page.getByRole('checkbox', { name: '診療入力 閲覧' }).click()
        await expect(allView).toHaveAttribute('data-state', 'indeterminate')
        await expect(allEdit).toHaveAttribute('data-state', 'unchecked')
        await captureFixedUi(page.locator('thead'), 'role-master-select-all-partial')
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
