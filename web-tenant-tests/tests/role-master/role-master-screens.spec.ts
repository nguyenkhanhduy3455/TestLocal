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

    test('TC-2b — chọn/bỏ nhanh cả cột 閲覧 / 編集, mỗi nút chỉ đụng cột của nó', async () => {
        // Đang ở màn 新規 (TC-2): chưa tick ô nào.
        const allView = page.getByRole('checkbox', { name: '閲覧をすべて選択' })
        const allEdit = page.getByRole('checkbox', { name: '編集をすべて選択' })
        const checkedIn = (col: '閲覧' | '編集') =>
            page.locator(`[role="checkbox"][aria-label$=" ${col}"][data-state="checked"]`)
        const viewCount = await page.locator('[role="checkbox"][aria-label$=" 閲覧"]').count()
        const editCount = await page.locator('[role="checkbox"][aria-label$=" 編集"]').count()

        // 編集 chỉ chọn cột 編集, 閲覧 giữ nguyên.
        await allEdit.click()
        await expect(allEdit).toHaveAttribute('data-state', 'checked')
        await expect(allView).toHaveAttribute('data-state', 'unchecked')
        await expect(checkedIn('編集')).toHaveCount(editCount)
        await expect(checkedIn('閲覧')).toHaveCount(0)

        // 閲覧 chỉ chọn cột 閲覧.
        await allView.click()
        await expect(checkedIn('閲覧')).toHaveCount(viewCount)
        await captureFixedUi(page, 'role-master-select-all')

        // Bỏ 閲覧 ⇒ cột 編集 vẫn còn nguyên.
        await allView.click()
        await expect(checkedIn('閲覧')).toHaveCount(0)
        await expect(checkedIn('編集')).toHaveCount(editCount)

        // Bỏ 編集 ⇒ trống hết.
        await allEdit.click()
        await expect(page.locator('[role="checkbox"][data-state="checked"]')).toHaveCount(0)

        // Tick 1 ô ⇒ ô chọn tất cả ở trạng thái một phần.
        await page.getByRole('checkbox', { name: '診療入力 閲覧' }).click()
        await expect(allView).toHaveAttribute('data-state', 'indeterminate')
        await expect(allEdit).toHaveAttribute('data-state', 'unchecked')
        await captureFixedUi(page.locator('thead'), 'role-master-select-all-partial')
    })

    test('TC-2c — コード / ロール名 trùng thì BE từ chối, không lưu', async () => {
        // Đang ở màn 新規 (TC-2b không lưu gì).
        const code = page.getByLabel('コード', { exact: true })
        const name = page.getByLabel('ロール名', { exact: true })

        await code.fill('admin')
        await name.fill('E2E重複テスト')
        await page.keyboard.press('F9')
        await expect(page.getByText('このコードは既に使用されています。')).toBeVisible({ timeout: 15_000 })

        await code.fill('e2e-dup-check')
        await name.fill('管理者')
        await page.keyboard.press('F9')
        await expect(page.getByText('このロール名は既に使用されています。')).toBeVisible({ timeout: 15_000 })
        await expect(page).toHaveURL(/\/settings\/role-master\/new$/)
        await captureFixedUi(page, 'role-master-name-taken')
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
