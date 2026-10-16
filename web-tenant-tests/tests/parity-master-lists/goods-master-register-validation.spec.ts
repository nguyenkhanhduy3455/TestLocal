import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { closeDialog, expectMsg, expectSeverity, MSG, nextDialogText, topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * 物品マスタ登録 (frm501005) — `chkInputData` theo legacy bản 2026-10-16.
 *
 * Ba thay đổi của nhà cung cấp trong frm501005.cs (so src_20261016 → src):
 *  1. 物品サブコード > 255 ⇒ E00002 (MST_GOODS.GOODS_SB là tinyint). Kiểm NGAY sau
 *     E00001 của chính ô đó, TRƯỚC 適用開始日.
 *  2. 仕入先名称 kiểm bằng `TrimEnd()` ⇒ ô toàn dấu cách giờ là E00001 (trước đây lọt).
 *  3. Hai check E00022 (物品名称 / 仕入先名称 quá 30 byte) có thêm `ret &&` ⇒ đã có lỗi
 *     trước thì KHÔNG bật thêm hộp E00022 nữa (trước đây bật 2 hộp liên tiếp).
 *
 * FACT bám theo source web:
 *  - features/goods-masters/lib/goods-master-form.ts → `validateGoodsMasterForm`
 *  - features/goods-masters/components/goods-master-register-dialog.tsx
 *      · DraggableDialog title 物品マスタ登録 (role="dialog"); F9 登録.
 *      · lỗi hiện bằng alertDialog severity 'error' (role="alertdialog"), lần lượt.
 *      · ô 物品サブコード có aria-label 物品サブコード; các ô khác id `goods-<key>`.
 *  - features/goods-masters/components/goods-master-list-screen.tsx → F1 新規.
 *
 * Spec CHỈ kiểm validate phía client: không ca nào tới được lệnh lưu, nên không ghi DB.
 * Chạy cả file (serial, chung page):
 *   npx playwright test tests/parity-master-lists/goods-master-register-validation.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const LIST_URL = '/masters/goods'
const DIALOG_TITLE = '物品マスタ登録'

test.describe('物品マスタ登録 — chkInputData (legacy 2026-10-16)', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    /** Mở 一覧 mới (state sạch) rồi F1 新規. */
    async function openNew(): Promise<Locator> {
        await gotoListScreen(page, LIST_URL)
        await page.keyboard.press('F1')
        const dialog = page.getByRole('dialog').filter({ hasText: DIALOG_TITLE })
        await expect(dialog).toBeVisible({ timeout: 30_000 })
        await expect(page.locator('#goods-goodsCd')).toBeFocused()
        return dialog
    }

    /** 適用開始日 = 令和6年4月1日 (EraDateField: combobox 元号 + 3 ô 年/月/日). */
    async function fillAppSt(dialog: Locator): Promise<void> {
        const row = dialog.locator('div.flex.items-center.gap-4').filter({ hasText: '適用開始日' })
        await row.getByRole('combobox').click()
        await page.getByRole('option', { name: '令和', exact: true }).click()
        const boxes = row.getByRole('textbox')
        await boxes.nth(0).fill('6')
        await boxes.nth(1).fill('4')
        await boxes.nth(2).fill('1')
    }

    /**
     * F9 登録 → đúng MỘT hộp lỗi. Dialog chỉ đặt focus SAU khi đã hiện hết các hộp
     * (focus của lỗi CUỐI), nên chờ focus về `focus` trước rồi mới kết luận không
     * còn hộp thứ hai — kiểm ngay sau khi đóng hộp đầu sẽ xanh giả.
     */
    async function registerExpectingOnly(
        code: 'E00001' | 'E00002',
        field: string,
        focus: Locator,
        what: string,
    ) {
        await page.keyboard.press('F9')
        const text = await nextDialogText(page, `${code} ${what}`)
        expectMsg(text, code, MSG[code](field), what)
        await expectSeverity(page, 'error', `${what}: ShowErrorMsg`)
        await closeDialog(page, `${code} ${what}`)
        await expect(focus, `${what}: focus phải về ô ${field}`).toBeFocused()
        await expect(topDialog(page), `${what}: còn hộp thứ hai sau ${code}`).toHaveCount(0)
    }

    test('TC-1 物品サブコード 256 ⇒ E00002, focus về ô サブコード', async () => {
        const dialog = await openNew()
        await page.locator('#goods-goodsCd').fill('1')
        const sb = dialog.getByLabel('物品サブコード', { exact: true })
        await sb.fill('256')

        await registerExpectingOnly('E00002', '物品サブコード', sb, '物品サブコード 256')
        await captureFixedUi(dialog, 'goods-master-goods-sb-256-focus')
    })

    test('TC-2 仕入先名称 toàn dấu cách ⇒ E00001, focus về ô 仕入先名称', async () => {
        const dialog = await openNew()
        await page.locator('#goods-goodsCd').fill('1')
        await dialog.getByLabel('物品サブコード', { exact: true }).fill('255')
        await fillAppSt(dialog)
        await page.locator('#goods-goodsNm').fill('E2E物品')
        await page.locator('#goods-supplierNm').fill('   ')

        await registerExpectingOnly(
            'E00001',
            '仕入先名称',
            page.locator('#goods-supplierNm'),
            '仕入先名称 dấu cách',
        )
    })

    test('TC-3 lỗi đầu tiên không kéo theo E00022 của 物品名称 / 仕入先名称', async () => {
        await openNew()
        // 16 ký tự toàn góc = 32 byte > 30, nhưng 物品コード trống đã là lỗi trước đó.
        await page.locator('#goods-goodsNm').fill('あ'.repeat(16))
        await page.locator('#goods-supplierNm').fill('い'.repeat(16))

        // Bản cũ: hộp E00022 物品名称 nối tiếp và focus dừng ở 物品名称.
        await registerExpectingOnly(
            'E00001',
            '物品コード',
            page.locator('#goods-goodsCd'),
            '物品コード trống + tên quá dài',
        )
    })
})
