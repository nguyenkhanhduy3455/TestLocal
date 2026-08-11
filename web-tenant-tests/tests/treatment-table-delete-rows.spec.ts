import { test, expect } from '@playwright/test';

test('Test delete bui dsp and F9 save reload data real saved', async ({ page }) => {
    const today = new Date().getDate().toString(); // '21'
    await page.goto('https://tenant1.ochacom.local/login?from=%2F');
    await page.getByRole('textbox', { name: 'メールアドレス' }).click();
    await page.getByRole('textbox', { name: 'メールアドレス' }).fill('sontvh@aipower.com.vn');
    await page.getByRole('textbox', { name: 'メールアドレス' }).press('Tab');
    await page.getByRole('textbox', { name: 'パスワード' }).fill('Sontran280900@');
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.getByRole('button', { name: '日常業務' }).click();
    await page.getByRole('link', { name: '診療入力' }).click();
    await page.getByRole('combobox').nth(3).fill('10');
    await page.getByRole('combobox').nth(3).press('Enter');
    // Locator chọn phần tử chứa chữ "点" trong ô 合計 (hoặc dùng locator chính xác hơn nếu có ID/Class)
    const totalPointsText = page.getByText(/合計:/).locator('..');
    const confirmDialogText = page.getByText('歯科初診料を算定しますか？');
    // 2. Chờ 1 trong 2 điều kiện xảy ra (Promise.race)
    await Promise.race([
        // Trường hợp 1: Dialog xuất hiện
        confirmDialogText.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { }),
        // Trường hợp 2: Chờ cho ô 合計 KHÔNG CÒN chứa "0 点" (load dữ liệu thành công)
        expect(totalPointsText).not.toHaveText(/0\s*点/, { timeout: 10000 }).catch(() => { })
    ]);
    // 1. Tìm thông báo đặc trưng của Dialog (歯科初診料を算定しますか？)
    if (await confirmDialogText.isVisible({ timeout: 10000 }).catch(() => false)) {
        // Nếu có xuất hiện -> Bấm nút Yes
        await page.getByRole('button', { name: 'Yes' }).click();

        // Kiểm tra tiếp nút 'F9 確定' nếu nó xuất hiện ngay sau đó
        const f9Btn = page.getByRole('button', { name: 'F9 確定' });
        await f9Btn.waitFor({ state: 'visible', timeout: 10000 });
        await f9Btn.click();
    }
    const todayRow = page.locator('tr, .grid-row, div').filter({
        has: page.getByText(new RegExp(`^${today}$`))
    });

    // 3. Click vào ô 部位 thuộc hàng hôm nay
    await todayRow.locator('[data-grid-cell]').nth(1).click();
    await page.keyboard.type('345');
    // await page.locator('.px-1.py-0\\.5.border-r.border-b').first().click();
    await page.getByRole('button', { name: 'End 確定' }).click();
    await page.getByTestId('row-100-1').getByTestId('cell-disNm').dblclick();
    await page.getByTestId('row-100-1').getByTestId('cell-disNm').dblclick();
    await page.getByRole('button', { name: 'End 登録' }).click();
    // ⏳ BƯỚC CHECK: Chờ cho ô 部位 của ngày 21 KHÔNG CÒN TRỐNG (not empty)
    await expect(todayRow.locator('[data-grid-cell]').nth(1)).not.toHaveText('', { timeout: 5000 });
    await page.getByRole('button', { name: 'F9 登録' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.getByRole('combobox').nth(3).press('Enter');
    await Promise.race([
        expect(totalPointsText).not.toHaveText(/0\s*点/, { timeout: 10000 }).catch(() => { })
    ]);
    await page.getByText('Ｃ').first().click();
    await page.keyboard.press('Delete');
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.getByRole('button', { name: 'F9 登録' }).click();
    await page.getByRole('button', { name: 'Yes' }).click();
    await page.getByRole('combobox').nth(3).fill('10');
    await page.getByRole('combobox').nth(3).press('Enter');
    await Promise.race([
        // Trường hợp 1: Dialog xuất hiện
        confirmDialogText.waitFor({ state: 'visible', timeout: 10000 }).catch(() => { }),
    ]);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(todayRow.locator('[data-grid-cell]').nth(1)).toBeEmpty();
});