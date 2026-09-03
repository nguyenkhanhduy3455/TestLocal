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
    // --- Dọn popup của AutoSantei ------------------------------------------
    // Cắm TRƯỚC khi điều hướng: cả hai popup dưới đây bung ra ở thời điểm không
    // đoán trước được, `addLocatorHandler` để Playwright tự dọn trước mỗi
    // actionability check.
    //
    // 「〜を算定しますか？」 → trả lời **No**. Bản trước bấm Yes, mà Yes thì AutoSantei
    // 算定 xong sẽ bung tiếp 「カルテ記載選択」 (frm203012 gType.Auto) — modal đó cướp
    // focus, đóng luôn menu F11 vừa mở nên leaf 「1 チェック項目設定」 không bao giờ chạy
    // và testcase đỏ ở bước cuối. Không phải bug app: menu F11 đóng khi có modal khác
    // giành focus là đúng.
    await page.addLocatorHandler(
        page.getByText(/を算定しますか？/).first(),
        async () => {
            await page
                .getByRole('dialog')
                .filter({ hasText: /を算定しますか？/ })
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click({ timeout: 3000 })
                .catch(() => {});
        },
        { times: 30 },
    );

    // 「カルテ記載選択」 vẫn có thể bung (bệnh nhân có 処置 được 算定 không hỏi). Nó là
    // HÀNG ĐỢI — đóng cái này thì cái kế mở ngay — nên phải dọn hết trong MỘT lần vào
    // handler, nếu không Playwright thấy locator chưa biến mất và quay vòng tới timeout.
    const karteDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' });
    await page.addLocatorHandler(
        karteDialog,
        async () => {
            for (let i = 0; i < 8; i++) {
                if ((await karteDialog.count()) === 0) return;
                await karteDialog
                    .getByRole('button', { name: 'F10 戻る' })
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {});
                await page.waitForTimeout(300);
            }
        },
        { times: 30 },
    );

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

    // Chuỗi AutoSantei phải chạy XONG trước khi bấm F11: 「合計:」 hiện sớm hơn lúc
    // lưới dựng xong, và popup của nó tới trễ vài giây. Hai handler ở đầu test lo phần
    // bấm nút, nhưng chúng CHỈ chạy khi có action / assert auto-retry — vòng dưới vừa
    // là cú hích cho chúng, vừa là bằng chứng màn hình đã sạch liên tục vài nhịp.
    for (let i = 0; i < 6; i++) {
        await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 });
        await expect(page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })).toHaveCount(0, {
            timeout: 15000,
        });
        await page.waitForTimeout(700);
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

    // DraggableDialog: role="dialog" bọc cả header/body/footer.
    //
    // Match theo ĐÚNG chuỗi tiêu đề 「チ ェ ッ ク 項 目 設 定」 — dấu cách là KÝ TỰ THẬT
    // trong DOM (check-item-setting-dialog.tsx:147 `title={<>チ ェ ッ ク 項 目 設 定</>}`,
    // kiểu caption giãn chữ của WinForm), không phải CSS letter-spacing.
    //
    // Bản trước match `hasText: 'チェック項目設定'` (viết liền) và nói là "match theo
    // body". Chuỗi viết liền ĐÃ từng có thật trong body: bản đầu của dialog
    // (d29d2bf9b, 2026-04-28) chỉ là chỗ giữ chỗ, in ra 「チェック項目設定 (port pending)」.
    // Khi dialog được port thật (19 mục 歯種チェック１ … 歯清の算定漏れ) thì đoạn chữ đó
    // biến mất ⇒ locator không còn khớp gì. Dialog vẫn mở đúng, chỉ testcase lỗi thời.
    const checkItemDialog = page.getByRole('dialog').filter({ hasText: 'チ ェ ッ ク 項 目 設 定' });
    await expect(checkItemDialog).toBeVisible({ timeout: 10000 });
    // Chốt là dialog ĐÃ PORT THẬT, không phải chỗ giữ chỗ: phải thấy mục đầu của lưới.
    await expect(checkItemDialog.getByText('歯種チェック１')).toBeVisible({ timeout: 10000 });
    await expectNotCutOff(page, checkItemDialog, 'チェック項目設定 dialog');
});
