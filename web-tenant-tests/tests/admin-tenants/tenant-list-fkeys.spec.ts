import { type BrowserContext, type Locator, type Page, expect, test } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { ADMIN_USER } from '../_shared/test-data'

/**
 * web-admin /tenants — FKeyBar, row pick / open and column sort. CHỈ ĐỌC: không chạy
 * migration, không tạo tenant (dialog nào mở ra cũng bấm キャンセル).
 *
 * FACTS (Rule 21) — ochacom-saas web-admin:
 *  - routes/_authenticated/tenants/index.tsx: FKeyBar F1 新規テナント作成 → /tenants/new,
 *    F2 次の段階を実行 / F3 残りをすべて実行 (mở hộp xác nhận rollout), F4 更新 / F5 復元 (dialog
 *    của dòng đang chọn), F9 選択 → /tenants/$id. F4/F5/F9 mờ khi chưa chọn dòng; F4 mờ khi
 *    tenant đã 最新. Double-click một dòng = F9.
 *  - Danh sách là virtual list (shared/components/windowed-list-table.tsx): dòng role=row,
 *    header role=columnheader có aria-sort none/ascending/descending; click header lần 1 ⇒ tăng,
 *    lần 2 ⇒ giảm (sort phía server, TenantSortColumns). Cột 操作 không sort.
 *  - Tên nút F-key bắt đầu bằng số phím ("F9" + nhãn).
 *
 * Cần ≥ 2 tenant (demo1: tenant1, tenant2). 1 LOGIN (Rule 10.1), page riêng (Rule 19.2).
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'

const SORTABLE = ['クリニック名', 'スラグ', 'ステータス', 'マイグレーション', '作成日'] as const

test.describe('web-admin /tenants — FKeyBar, chọn / mở dòng, sort cột', () => {
    let context: BrowserContext
    let page: Page

    const fkey = (n: number): Locator =>
        page.getByRole('button', { name: new RegExp(`^F${n}(?!\\d)`) })
    const dataRows = (): Locator => page.getByTestId('data-row')
    /** Text of the first cell (クリニック名) of every loaded row, top to bottom. */
    const names = async (): Promise<string[]> =>
        (await dataRows().locator('[role="cell"]:first-child').allInnerTexts()).map((t) => t.trim())
    const header = (title: string): Locator =>
        page.getByRole('columnheader', { name: new RegExp(`^${title}`) })

    async function backToList(): Promise<void> {
        await page.goto('/tenants', { waitUntil: 'domcontentloaded' })
        await expect(dataRows().first()).toBeVisible({ timeout: 30_000 })
    }

    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
        page = await context.newPage()
        await page.goto('/login?from=%2Ftenants', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
        await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: 'ログイン' }).click()
        await expect(page).toHaveURL(/\/tenants/)
        await expect(dataRows().first()).toBeVisible({ timeout: 30_000 })
        expect(await dataRows().count(), 'cần ≥ 2 tenant').toBeGreaterThanOrEqual(2)
    })

    test.afterAll(async () => {
        await context?.close()
    })

    test('TC-1 — chưa chọn dòng: F4 / F5 / F9 mờ; F1 bật; không còn nút tạo mới / rollout trên màn', async () => {
        await expect(fkey(1)).toBeEnabled()
        await expect(fkey(1)).toContainText('新規テナント作成')
        await expect(fkey(2)).toContainText('次の段階を実行')
        await expect(fkey(3)).toContainText('残りをすべて実行')
        for (const n of [4, 5, 9]) await expect(fkey(n), `F${n} chưa có dòng`).toBeDisabled()
        await expect(page.getByRole('link', { name: /新規テナント作成/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: /^次の段階を実行$/ })).toHaveCount(0)
        await expect(
            page.getByRole('link', { name: '詳細を見る' }),
            'không còn icon 👁',
        ).toHaveCount(0)
        await captureFixedUi(page, 'admin-tenants-fkeybar')
    })

    test('TC-2 — F1 新規テナント作成 mở /tenants/new', async () => {
        await fkey(1).click()
        await expect(page).toHaveURL(/\/tenants\/new$/)
        await backToList()
    })

    test('TC-3 — chọn dòng rồi F9 選択 mở chi tiết tenant đó', async () => {
        const first = dataRows().first()
        const slug = (await first.locator('[role="cell"]').nth(1).innerText()).trim()
        await first.click()
        await expect(first).toHaveAttribute('aria-selected', 'true')
        await expect(fkey(9)).toBeEnabled()
        await fkey(9).click()
        await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}$/)
        await expect(page.getByText(slug).first()).toBeVisible()
        await backToList()
    })

    test('TC-4 — double-click một dòng = F9: mở chi tiết', async () => {
        await dataRows().nth(1).dblclick()
        await expect(page).toHaveURL(/\/tenants\/[0-9a-f-]{36}$/)
        await backToList()
    })

    test('TC-5 — mọi cột trừ 操作 sort được: none → tăng → giảm', async () => {
        for (const title of SORTABLE) {
            await expect(header(title), `${title} chưa sort`).toHaveAttribute('aria-sort', 'none')
            await header(title).getByRole('button').click()
            await expect(header(title)).toHaveAttribute('aria-sort', 'ascending')
            await header(title).getByRole('button').click()
            await expect(header(title)).toHaveAttribute('aria-sort', 'descending')
        }
        await expect(header('操作'), '操作 không sort').not.toHaveAttribute('aria-sort', /.+/)
        await expect(header('操作').getByRole('button')).toHaveCount(0)
    })

    test('TC-6 — sort クリニック名 đảo thứ tự dòng thật (server sort)', async () => {
        await header('クリニック名').getByRole('button').click()
        await expect(header('クリニック名')).toHaveAttribute('aria-sort', 'ascending')
        await expect.poll(names).toEqual([...(await names())].sort())
        const asc = await names()
        await header('クリニック名').getByRole('button').click()
        await expect(header('クリニック名')).toHaveAttribute('aria-sort', 'descending')
        await expect.poll(names).toEqual([...asc].reverse())
    })

    test('TC-7 — F5 / F4 mở dialog 復元 / 更新 của dòng đang chọn (rồi キャンセル)', async () => {
        const first = dataRows().first()
        const slug = (await first.locator('[role="cell"]').nth(1).innerText()).trim()
        await first.click()

        await fkey(5).click()
        const restore = page.getByRole('dialog')
        await expect(restore).toContainText('バックアップから復元')
        await expect(restore).toContainText(slug)
        await restore.getByRole('button', { name: 'キャンセル' }).click()
        await expect(restore).toBeHidden()

        if (await fkey(4).isEnabled()) {
            await fkey(4).click()
            const update = page.getByRole('dialog')
            await expect(update).toContainText('マイグレーションの更新')
            await expect(update).toContainText(slug)
            await update.getByRole('button', { name: 'キャンセル' }).click()
            await expect(update).toBeHidden()
        } else {
            console.log(`${slug} đã 最新 ⇒ F4 mờ (đúng); bỏ qua bước mở dialog 更新`)
        }
    })
})
