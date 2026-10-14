/**
 * Rule 24 — web-admin list screens (admin.ochacom.local). FACT: admin lists have
 * no double-click selection, no FKeyBar and are server-paged, so only 24.1,
 * 24.2 (panel inset), 24.4 (合　計 footer) apply; the 郵便番号 master is the one
 * admin list with row selection and also gets 24.5.
 * One login in a private context (the shared `authedPage` is a TENANT session).
 */
import { expect, test, type Browser, type Page } from '@playwright/test'

import {
    expectHeader,
    expectHint,
    expectSelectionStatus,
    expectHeaderSpacing,
} from '../_shared/list-screen-chrome'
import { ADMIN_USER } from '../_shared/test-data'

const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'
const PANEL_INSET = 4
const TOLERANCE = 1.5

test.describe.configure({ mode: 'serial', timeout: 300_000 })

type AdminScreen = {
    name: string
    path: string
    /** ≪…≫ title bar of the list panel. */
    panelTitle: string
    selectable?: boolean
}

const SCREENS: AdminScreen[] = [
    { name: 'テナント一覧', path: '/tenants', panelTitle: '≪テナント一覧≫' },
    { name: '管理者一覧', path: '/super-admins', panelTitle: '≪管理者一覧≫' },
    { name: '監査ログ', path: '/audit-logs', panelTitle: '' },
    {
        name: '郵便番号マスタ',
        path: '/masters/postal',
        panelTitle: '',
        selectable: true,
    },
]

test.describe('Rule 24 — web-admin lists', () => {
    let page: Page

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
        const context = await browser.newContext({
            baseURL: ADMIN_BASE_URL,
            ignoreHTTPSErrors: true,
        })
        page = await context.newPage()
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
        await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: 'ログイン' }).click()
        await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
    })

    test.afterAll(async () => {
        await page.context().close()
    })

    for (const screen of SCREENS) {
        test.describe(screen.name, () => {
            const root = () => page.locator('.animate-fade-in').first()

            test.beforeAll(async () => {
                await page.goto(screen.path, { waitUntil: 'domcontentloaded' })
                await expect(page.getByText('合　計', { exact: true })).toBeVisible({
                    timeout: 60_000,
                })
            })

            test('24.1 header', async () => {
                await expectHeader(root())
                await expectHeaderSpacing(root())
            })

            test('24.2 panel left/right inset', async () => {
                const rootBox = (await root().boundingBox())!
                const footer = (await page
                    .getByText('合　計', { exact: true })
                    .locator("xpath=ancestor::div[contains(@class,'grid')][1]")
                    .boundingBox())!
                expect(
                    Math.abs(footer.x - rootBox.x - PANEL_INSET),
                    'left inset',
                ).toBeLessThanOrEqual(TOLERANCE)
                expect(
                    Math.abs(rootBox.x + rootBox.width - (footer.x + footer.width) - PANEL_INSET),
                    'right inset',
                ).toBeLessThanOrEqual(TOLERANCE)
            })

            test('24.2b bottom: last box ends 6px above the screen bottom (pb-1.5)', async () => {
                const gap = await root().evaluate((el) => {
                    const r = el.getBoundingClientRect()
                    let lowest = 0
                    for (const e of Array.from(el.querySelectorAll('*'))) {
                        const s = getComputedStyle(e)
                        if (
                            parseFloat(s.borderBottomWidth) > 0 &&
                            e.getBoundingClientRect().height > 40
                        )
                            lowest = Math.max(lowest, e.getBoundingClientRect().bottom)
                    }
                    return r.bottom - lowest
                })
                expect(Math.abs(gap - 6)).toBeLessThanOrEqual(TOLERANCE)
            })

            test('24.3 no double-click hint unless rows are selectable', async () => {
                await expectHint(root(), false)
            })

            test('24.4 footer 合　計 with count, no 該当件数', async () => {
                const footer = page
                    .getByText('合　計', { exact: true })
                    .locator("xpath=ancestor::div[contains(@class,'grid')][1]")
                await expect(footer.getByText(/\d+\s?件/).first()).toBeVisible()
                await expect(page.getByText('該当件数')).toHaveCount(0)
            })

            if (screen.selectable) {
                test('24.5 選択中 follows the picked row', async () => {
                    await expectSelectionStatus(page, root(), {
                        // FACT: nothing is selected until a row is clicked, and there is no prompt text.
                        prompt: null,
                        // Row 0 is the column header row.
                        pickRow: (_page, scope) => scope.getByRole('row').nth(1),
                    })
                })
            }
        })
    }
})
