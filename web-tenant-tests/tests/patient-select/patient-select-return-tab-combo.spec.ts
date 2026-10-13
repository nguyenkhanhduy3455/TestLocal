import { type Locator, type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from '../_shared/session'

import { makeStep, skipWithReason } from '../_shared/step'
import { captureFixedUi } from '../_shared/capture'
import { emptyState, rows } from '../_shared/virtual-grid'

/**
 * 診療入力（患者選択）frm203001 — 4 điểm parity sửa trên nhánh
 * fix/inp-patient-select-parity:
 *
 *  1. Dr. / 衛生士 là combo NHẬP ĐƯỢC: `CustomComboBox` chỉ ép DropDownList khi
 *     Designer đặt style khác DropDown, mà frm203001.Designer không đặt
 *     `DropDownStyle` cho cboUserNm / cboStaffNm ⇒ DropDown. Web = EditableSelect:
 *     gõ chữ tự do, danh sách mở bằng nút mũi tên (`<label>-list`).
 *  2. Thứ tự Tab của ≪患者検索条件≫ theo TabIndex của frm901001.Designer:
 *     氏名(カナ) 4 → 性別 5 → 生年月日 6 → 電話／携帯 7 → 最終診療日 8 →
 *     ﾎﾙﾀﾞｰ番号 9 → 分類1 10 → 分類2 11 → 検索 12.
 *  3. Về từ 診療入力 (F10 戻る): frm203001 chỉ bị ẨN (GAMEN_HIDE), `postInit`
 *     chỉ chạy lúc Load ⇒ quay lại vẫn đúng view 患者検索一覧, đúng dòng đang chọn.
 *  4. F5 受付一覧: `dspUnAdjustView` — lưới rỗng ⇒ `cboPatNo.Focus()`.
 *
 * KHÔNG GHI DB: vào chi tiết bằng F8 閲覧 rồi F10 戻る; hộp 「保存しますか？」 trả
 * lời いいえ (rời màn không lưu).
 *
 * CHẠY TUẦN TỰ, dùng CHUNG một page (Rule 10.1) — testcase nối tiếp trạng thái,
 * luôn chạy cả file:
 *   npx playwright test tests/patient-select/patient-select-return-tab-combo.spec.ts
 */

test.describe.configure({ mode: 'serial' })

test.describe('診療入力（患者選択）— combo nhập tay / Tab 検索条件 / 戻る giữ dòng / F5 focus', () => {
    let page: Page
    let step: () => Promise<void>

    /** Ô nhập của combo Dr. / 衛生士 — nhãn `{label}:` (dấu hai chấm tách khỏi header lưới `Dr.`). */
    function staffInput(label: 'Dr.' | '衛生士'): Locator {
        return page.getByText(`${label}:`, { exact: true }).locator('..').getByRole('combobox')
    }

    function staffListButton(label: 'Dr.' | '衛生士'): Locator {
        return page.getByRole('button', { name: `${label}-list`, exact: true })
    }

    /** Ô 患者番号 của panel 患者選択 (`.first()`: 検索条件 không có, header lưới có chữ cùng tên). */
    function patNoInput(): Locator {
        return page.getByText('患者番号', { exact: true }).first().locator('..').getByRole('combobox')
    }

    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    /** Chọn dòng đầu tiên KHÁC dòng trống trong danh sách combo; trả về tên đã chọn. */
    async function pickFirstStaff(label: 'Dr.' | '衛生士'): Promise<string | null> {
        await staffListButton(label).click()
        const options = page.getByRole('option')
        await expect(options.first()).toBeVisible({ timeout: 15000 })
        if ((await options.count()) < 2) {
            await page.keyboard.press('Escape')
            return null
        }
        const name = (await options.nth(1).innerText()).trim()
        await options.nth(1).click()
        await expect(staffInput(label)).toHaveValue(name)
        // Popover của danh sách mang role `dialog`; FKeyScopeProvider nuốt F-key
        // khi còn dialog nổi ⇒ chờ nó gỡ hẳn rồi mới bấm F-key tiếp.
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await step()
        return name
    }

    /**
     * Nhãn của ô đang giữ focus trong ≪患者検索条件≫: leo lên tới con trực tiếp của
     * hàng, rồi lùi qua các anh em tới `<label>` gần nhất. Nút 検索 trả '検索'.
     * EraDateField là Fragment (nhiều ô anh em) nên mọi ô của nó cùng ra một nhãn.
     */
    async function focusedCondLabel(): Promise<string> {
        return page.evaluate(() => {
            const active = document.activeElement as HTMLElement | null
            if (!active) return '(none)'
            if (active.tagName === 'BUTTON' && active.textContent?.trim() === '検索') return '検索'
            let el: Element | null = active
            while (el && el.parentElement && !el.parentElement.classList.contains('items-center')) {
                el = el.parentElement
            }
            // EraDateField nằm trong một div.items-center riêng (col-start-2): nhãn là anh
            // em của div đó, không phải của ô bên trong ⇒ thử cả phần tử bọc.
            for (const start of [el, el.parentElement]) {
                for (let sib: Element | null = start; sib; sib = sib.previousElementSibling) {
                    if (sib.tagName === 'LABEL') return sib.textContent?.trim() ?? ''
                }
            }
            return `<${active.tagName.toLowerCase()}>`
        })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F5"]')).toBeVisible({ timeout: 60000 })
        await expect(staffInput('Dr.')).toBeVisible({ timeout: 30000 })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-COMBO-1 — Dr. nhận chữ gõ tay, rời ô vẫn giữ chữ; danh sách vẫn chọn được', async () => {
        const dr = staffInput('Dr.')
        await dr.fill('zz手入力')
        await expect(dr, 'combo Dr. không nhận chữ gõ tay — vẫn là DropDownList').toHaveValue('zz手入力')
        await page.keyboard.press('Tab')
        await expect(dr, 'rời ô thì chữ gõ tay bị xoá — WinForm DropDown giữ nguyên Text').toHaveValue(
            'zz手入力',
        )
        await captureFixedUi(page.getByText('≪患者選択≫').locator('xpath=ancestor::div[2]'), 'patient-select-dr-typed-text')
        await step()

        const picked = await pickFirstStaff('Dr.')
        expect(picked, 'mst_iin không có Ｄｒ．nào để chọn').not.toBeNull()
    })

    test('TC-TAB-1 — Tab trong ≪患者検索条件≫ đi đúng TabIndex của frm901001', async () => {
        await page.keyboard.press('F1')
        const kana = page.locator('[data-first-filter]')
        await expect(kana, 'F1 xong mà 氏名(カナ) không nhận focus').toBeFocused({ timeout: 15000 })

        const seen: string[] = []
        for (let i = 0; i < 25; i++) {
            const label = await focusedCondLabel()
            if (seen[seen.length - 1] !== label) seen.push(label)
            if (label === '検索') break
            await page.keyboard.press('Tab')
        }
        await captureFixedUi(page.getByText('≪患者検索条件≫').locator('xpath=ancestor::div[2]'), 'patient-select-search-cond-layout')
        console.log(`TC-TAB-1 thứ tự Tab: ${seen.join(' → ')}`)
        expect(seen).toEqual([
            '氏名(カナ)',
            '性　別',
            '生年月日',
            '電話／携帯',
            '最終診療日',
            'ホルダー番号',
            '分類1',
            '分類2',
            '検索',
        ])
    })

    test('TC-BACK-1 — F8 閲覧 rồi F10 戻る: vẫn ở 患者検索一覧, đúng dòng đã chọn', async () => {
        // State "danh sách lúc rời đi" chỉ nằm trong RAM (giống form bị ẩn của
        // WinForm). Vite dev qua nginx thỉnh thoảng hỏng một request module
        // (net::ERR_FAILED) và router tải lại CẢ TRANG ⇒ RAM mất, quay về là
        // 受付患者一覧. Đó là trục trặc môi trường dev, không phải logic: phát hiện
        // bằng sự kiện `load` (điều hướng SPA không phát) và làm lại vòng đi-về.
        let patNo: string | null = null
        for (let attempt = 1; attempt <= 3; attempt++) {
            if (!(await page.getByText('≪患者検索一覧≫').isVisible())) {
                // Quay về sau reload: ô 患者番号 autoFocus bung popover lịch sử (role
                // `dialog`) và FKeyScope nuốt F-key khi còn dialog — Tab ra trước.
                await patNoInput().focus()
                await page.keyboard.press('Tab')
                await expect(page.getByRole('dialog')).toHaveCount(0)
                await page.keyboard.press('F1')
            }
            await page.getByRole('button', { name: '検索', exact: true }).click()
            await expect(page.getByText('≪患者検索一覧≫')).toBeVisible({ timeout: 30000 })
            await expect(rows(page).first(), '検索 không ra bệnh nhân nào').toBeVisible({ timeout: 30000 })

            // 衛生士 có thể bị bắt buộc (eiseiji_flg) — chọn sẵn nếu hàng đang hiện.
            if ((await staffListButton('衛生士').count()) > 0) await pickFirstStaff('衛生士')

            let reloaded = false
            const onLoad = () => {
                reloaded = true
            }
            page.on('load', onLoad)

            // Dòng thứ 5 trở đi, để "chọn lại dòng 0" không xanh giả. Bệnh nhân nào
            // không mở được (chưa có bảo hiểm ngày đó…) thì đóng hộp, thử dòng sau.
            patNo = null
            for (let n = 4; n < 10 && patNo === null; n++) {
                await rows(page).nth(n).click()
                // Đọc patNo từ dòng ĐANG CHỌN sau khi click: lưới ảo có thể render lại
                // giữa lúc đọc và lúc click, nên `nth(n)` trước click chưa chắc là nó.
                const selectedRow = page.locator('[data-testid^="row-"][class*="border-l-primary"]')
                await expect(selectedRow).toHaveCount(1)
                const candidate = ((await selectedRow.getAttribute('data-testid')) ?? '').replace(/^row-/, '')
                await step()
                await page.keyboard.press('F8')
                const opened = await Promise.race([
                    page
                        .waitForURL(new RegExp(`/treatments/${candidate}(\\?|$)`), { timeout: 30000 })
                        .then(() => true),
                    appDialog()
                        .waitFor({ state: 'visible', timeout: 30000 })
                        .then(() => false),
                ])
                if (opened) {
                    patNo = candidate
                } else {
                    console.log(`TC-BACK-1: 患者 ${candidate} không mở được — thử dòng sau`)
                    await appDialog().getByRole('button').first().click()
                    await expect(appDialog()).toHaveCount(0)
                }
            }
            expect(patNo, 'không mở được bệnh nhân nào trong 6 dòng thử').not.toBeNull()
            const drBefore = new URL(page.url()).searchParams.get('drNo')
            console.log(`TC-BACK-1: lần ${attempt} mở 患者 ${patNo} (drNo=${drBefore})`)

            await expect(page.locator('[data-footer-cell$=":footer-ten"]').first()).toBeVisible({
                timeout: 60000,
            })
            await step()
            await page.keyboard.press('F10')
            // 閲覧 vẫn dựng dòng seed của 処置月 ⇒ F10 hỏi 「保存しますか？」. Trả lời
            // いいえ: rời màn KHÔNG lưu (spec không ghi DB).
            // Hộp hỏi này mang role `dialog` (không phải `alertdialog`).
            const saveAsk = page.getByRole('dialog').filter({ hasText: '保存しますか' })
            await saveAsk
                .getByRole('button', { name: 'いいえ', exact: true })
                .click({ timeout: 10000 })
                .catch(() => console.log('TC-BACK-1: F10 không hỏi 保存 — đi thẳng về danh sách'))
            await expect(page).toHaveURL(/\/treatments(\?|$)/, { timeout: 30000 })
            page.off('load', onLoad)
            if (!reloaded) break
            console.log(
                `TC-BACK-1: lần ${attempt} trang bị Vite dev tải lại giữa chừng (state RAM mất) — làm lại vòng đi-về`,
            )
            expect(attempt, 'cả 3 lần đi-về đều bị tải lại trang — môi trường dev không ổn định').toBeLessThan(3)
        }

        await expect(
            page.getByText('≪患者検索一覧≫'),
            '戻る xong lưới quay về 受付患者一覧 — frm203001 chỉ bị ẩn, phải giữ view 患者検索',
        ).toBeVisible({ timeout: 30000 })
        await expect(
            page.getByTestId(`row-${patNo}`),
            `戻る xong không chọn lại 患者 ${patNo}`,
        ).toHaveClass(/border-l-primary/, { timeout: 30000 })
        await expect(page.getByText(/^選択中:/)).toBeVisible()
        await expect(page.locator('[data-first-filter]'), '検索条件 phải còn bật (view 患者検索)').toBeEnabled()
        await captureFixedUi(page, 'patient-select-back-keeps-selected-row')
        await step()
    })

    test('TC-F5-1 — F5 với 受付患者一覧 rỗng: focus về ô 患者番号', async () => {
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
        // Chờ lưới ổn định: hoặc ra dòng, hoặc ra empty-state.
        await expect(rows(page).first().or(emptyState(page))).toBeVisible({ timeout: 30000 })
        const empty = (await emptyState(page).count()) > 0
        skipWithReason(!empty, 'TC-F5-1: hôm nay có 受付 — nhánh "lưới rỗng ⇒ cboPatNo.Focus()" không đo được')
        await expect(patNoInput(), 'F5 với lưới rỗng mà focus không về 患者番号').toBeFocused({
            timeout: 15000,
        })
        await captureFixedUi(page, 'patient-select-f5-focus-pat-no')
    })
})
