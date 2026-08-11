import { test, expect, Page, Locator } from '@playwright/test';

/**
 * 診療入力 F11 「選択」 menu — the WinForm frm203002 grdRegi context menu popped out
 * beside the F11 key in the footer strip (RowContextMenu).
 *
 * Source facts this test is pinned to (apps/web-tenant):
 *  - RowContextMenu renders `role="menu"` (NOT a dialog), positioned `fixed` and
 *    flipped up/clamped by the useLayoutEffect in row-context-menu.tsx.
 *  - Its submenu is a plain `div[data-submenu]` inside `[data-sub="<key>"]`,
 *    `visibility: hidden` until measured -> always waitFor({ state: 'visible' }).
 *  - Menu labels carry their WinForm mnemonic number: '1 メニュー', '9 オプション',
 *    '1 チェック項目設定' (F11_MENU_ITEMS in lib/treatment-entry-shared.ts).
 *  - Submenus open on hover (onMouseEnter); a click TOGGLES, so never dblclick.
 */

// Kiểm tra element không bị tràn ra ngoài viewport.
async function expectNotCutOff(page: Page, locator: Locator, name: string) {
    const viewport = page.viewportSize();
    if (!viewport) return;

    const box = await locator.boundingBox();
    expect(box, `${name}: không tìm thấy trên DOM`).not.toBeNull();
    if (!box) return;

    // Cho phép sai số 1px do sub-pixel rounding của layout.
    const EPS = 1;
    expect(box.x + box.width, `${name} bị tràn ra mép PHẢI màn hình`).toBeLessThanOrEqual(
        viewport.width + EPS,
    );
    expect(box.y + box.height, `${name} bị tràn ra mép DƯỚI màn hình`).toBeLessThanOrEqual(
        viewport.height + EPS,
    );
    expect(box.x, `${name} bị tràn ra mép TRÁI màn hình`).toBeGreaterThanOrEqual(-EPS);
    expect(box.y, `${name} bị tràn ra mép TRÊN màn hình`).toBeGreaterThanOrEqual(-EPS);
}

test('F11 選択 menu + 9 オプション submenu hiển thị và không bị cut off', async ({ page }) => {
    // --- Login -------------------------------------------------------------
    await page.goto('https://tenant1.ochacom.local/login?from=%2F');
    await page.getByRole('textbox', { name: 'メールアドレス' }).fill('sontvh@aipower.com.vn');
    await page.getByRole('textbox', { name: 'パスワード' }).fill('Sontran280900@');
    await page.getByRole('button', { name: 'ログイン' }).click();

    // --- 日常業務 → 診療入力 -----------------------------------------------
    await page.getByRole('button', { name: '日常業務' }).click();
    await page.getByRole('link', { name: '診療入力' }).click();

    // 患者番号 = PatientNoInput (role=combobox + aria-controls), Enter -> mở màn detail.
    const patientNo = page.locator('input[role="combobox"][aria-controls="patient-no-history-list"]');
    await patientNo.waitFor({ state: 'visible', timeout: 15000 });
    await patientNo.fill('10');
    await patientNo.press('Enter');

    // Màn detail đã mở khi header 患者情報 render 「合計:」 (patient-info-header.tsx).
    await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 20000 });

    // AutoSantei có thể bật SanteiConfirmDialog 「<trt_nm>を算定しますか？」 -> chọn Yes.
    const santeiConfirm = page.getByText(/を算定しますか？/);
    if (await santeiConfirm.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.getByRole('button', { name: 'Yes', exact: true }).click();
        await expect(santeiConfirm).toBeHidden({ timeout: 10000 });
    }

    // --- F11 選択 ----------------------------------------------------------
    // FKeyScopeProvider preventDefault F1-F12 nên F11 không bung fullscreen của browser.
    await page.keyboard.press('F11');

    // RowContextMenu = role="menu" (không phải dialog).
    const rowMenu = page.getByRole('menu').filter({ hasText: '1 メニュー' });
    await expect(rowMenu).toBeVisible({ timeout: 10000 });
    // Menu neo vào button [data-fkey="F11"] ở footer -> phải flip lên trên, không tràn đáy.
    await expectNotCutOff(page, rowMenu, 'F11 選択 menu');

    // --- 9 オプション submenu ----------------------------------------------
    // Submenu mở bằng hover (onMouseEnter). Click sẽ TOGGLE -> tuyệt đối không dblclick.
    await rowMenu.getByRole('button', { name: '9 オプション' }).hover();

    const optionsSubmenu = page.locator('[data-sub="options"] [data-submenu]');
    await expect(optionsSubmenu).toBeVisible({ timeout: 10000 });
    await expect(optionsSubmenu.getByRole('button', { name: '1 チェック項目設定' })).toBeVisible();
    // Submenu 9 entries, mở từ footer -> phải flip trái / trượt lên, không tràn viewport.
    await expectNotCutOff(page, optionsSubmenu, '9 オプション submenu');

    // --- 1 チェック項目設定 -> CheckItemSettingDialog ----------------------
    await optionsSubmenu.getByRole('button', { name: '1 チェック項目設定' }).click();

    // Menu đóng lại ngay khi chạy leaf (runSub gọi onClose trước).
    await expect(rowMenu).toBeHidden({ timeout: 10000 });

    // DraggableDialog: role="dialog" bọc cả header/body/footer. Title bị giãn chữ
    // ('チ ェ ッ ク 項 目 設 定') nên match theo text trong body thay vì theo title.
    const checkItemDialog = page.getByRole('dialog').filter({ hasText: 'チェック項目設定' });
    await expect(checkItemDialog).toBeVisible({ timeout: 10000 });
    await expectNotCutOff(page, checkItemDialog, 'チェック項目設定 dialog');
});
