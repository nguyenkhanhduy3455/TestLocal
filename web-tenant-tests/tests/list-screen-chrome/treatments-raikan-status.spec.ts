/**
 * /treatments — layout decisions on top of Rule 24:
 *   · 当月来患 sits in the list footer, beside 選択中 (not on the ≪患者選択≫ row)
 *   · 登録患者数 and the 「患者を選択してください」 prompt are gone
 * The 受付 row used for picking is seeded (list-chrome-seed.ts).
 */
import { cleanListChromeData, CHROME_PAT_NO, seedListChromeData } from '../_shared/list-chrome-seed'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { expect, releaseSharedPage, test } from '../_shared/session'

test.describe('診療入力 /treatments — 当月来患 beside 選択中', () => {
    test.beforeAll(async ({ authedPage }) => {
        await seedListChromeData()
        await gotoListScreen(authedPage, '/treatments')
    })
    test.afterAll(async ({ authedPage }) => {
        await releaseSharedPage(authedPage)
        await cleanListChromeData()
    })

    test('当月来患 is in the footer and shares a row with 選択中', async ({ authedPage: page }) => {
        const footer = page.getByText('合　計', { exact: true }).locator('xpath=../..')
        await expect(footer.getByText(/^当月来患：\d*$/), 'in the list footer').toBeVisible()
        await expect(
            page
                .getByText('≪患者選択≫', { exact: true })
                .locator('xpath=../..')
                .getByText(/当月来患/),
            'not on the ≪患者選択≫ row',
        ).toHaveCount(0)

        await page
            .locator('[data-testid^="row-"]')
            .filter({ hasText: String(CHROME_PAT_NO) })
            .first()
            .click()
        const picked = await footer.getByText(`選択中: ${CHROME_PAT_NO}`).boundingBox()
        const raikan = await footer.getByText(/^当月来患：\d*$/).boundingBox()
        expect(picked).not.toBeNull()
        expect(raikan).not.toBeNull()
        expect(Math.abs(picked!.y - raikan!.y)).toBeLessThanOrEqual(2)
    })

    test('登録患者数 and the select prompt are not rendered', async ({ authedPage: page }) => {
        await expect(page.getByText('登録患者数')).toHaveCount(0)
        await expect(page.getByText('患者を選択してください')).toHaveCount(0)
    })
})
