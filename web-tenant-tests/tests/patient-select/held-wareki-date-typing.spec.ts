/**
 * 患者登録 — gõ tay vào ô ngày 和暦 đang TRỐNG phải giữ được chữ đang gõ dở.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HỒI QUY ĐANG CHẶN (2026-10-26, sửa ở 25f73cf55)
 * ═══════════════════════════════════════════════════════════════════════════
 * `HeldWarekiDateField` giữ ngày gõ dở trong một Map của màn hình. Bản build
 * chạy React Compiler cache `drafts.get(key)` theo tham chiếu của Map, nên Map
 * bị sửa tại chỗ thì ô không thấy: gõ `8` vào ô năm trống là chữ biến mất ngay.
 * Chỉ trình duyệt mới thấy — vitest không bật React Compiler, unit test xanh.
 *
 * Vì thế spec gõ PHÍM thật (pressSequentially) chứ không `fill`, và soi giá trị
 * NGAY sau phím đầu tiên — lúc ngày còn dở, là lúc lỗi hiện ra.
 *
 * Không ghi DB: chỉ mở màn đăng ký mới, gõ, rồi rời đi. Số 患者番号 màn này giữ
 * chỗ sẽ tự nhả sau 2 phút (job pat-no-slot-release).
 */
import { type Locator, type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from '../_shared/session'

const DIALOG_TIMEOUT = 30_000
const OPEN_ATTEMPTS = 3

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

test.describe('患者登録 — gõ tay ô ngày 和暦 trống', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    /** Mở màn đăng ký mới và dọn オンライン資格確認 + câu hỏi wizard. */
    async function openNewRegistration(): Promise<void> {
        // Retry như `openPatientRegistration`: dev server nhả hụt module thì trang
        // trắng, React không mount; chỉ `goto` lại mới cứu.
        for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
            await page.goto('/patients/registration', { waitUntil: 'domcontentloaded' })
            const opened = await page
                .getByRole('dialog')
                .waitFor({ timeout: DIALOG_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (opened) break
            console.log(
                `openNewRegistration: lần ${attempt}/${OPEN_ATTEMPTS} trang trắng — nạp lại`,
            )
        }
        await page.keyboard.press('F10')
        await page
            .getByRole('alertdialog')
            .filter({ hasText: '新規登録ウィザード' })
            .getByRole('button', { name: 'いいえ' })
            .click()
        await expect(page.getByRole('alertdialog')).toBeHidden()
    }

    function dateCell(field: string, name: '和暦年' | '月' | '日'): Locator {
        return page
            .locator(`[data-field="${field}"]:visible`)
            .first()
            .getByRole('group', { name: '和暦日付' })
            .getByRole('textbox', { name })
    }

    /** Gõ từng phím, soi giá trị sau MỖI ô — ô năm là lúc ngày còn dở. */
    async function typeDate(field: string, y: string, m: string, d: string): Promise<void> {
        for (const [name, value] of [
            ['和暦年', y],
            ['月', m],
            ['日', d],
        ] as const) {
            const cell = dateCell(field, name)
            await cell.click()
            await cell.pressSequentially(value)
            await expect(cell, `${field} ${name}: chữ vừa gõ phải còn trên ô`).toHaveValue(value)
        }
    }

    test('患者情報有効日 / 生年月日 / 資格取得日 — gõ dở rồi gõ đủ đều giữ được', async () => {
        await openNewRegistration()

        await typeDate('br', '8', '10', '1')
        await typeDate('birth', '55', '1', '1')
        await typeDate('medinsQual', '8', '4', '1')

        // Rời ô rồi quay lại: ngày đủ vẫn nằm nguyên.
        await page.locator('[data-field="patNm"] input').click()
        await expect(dateCell('birth', '和暦年')).toHaveValue('55')
        await expect(dateCell('medinsQual', '日')).toHaveValue('1')
    })

    // 75ac86228 / 197e44b5f (thay c1e60c8b9): ô nhận nguyên chữ gõ, kể cả vượt giới hạn; rời ô
    // mà năm ngoài 1–99, tháng ngoài 1–12, ngày ngoài 1–31 hoặc ngày không có trong tháng thì
    // focus bị kéo về ô sai và chọn sẵn chữ (giống chkDate WinForm).
    test('資格取得日 — rời ô sai giới hạn thì focus bị giữ lại ô đó', async () => {
        await openNewRegistration()

        /** Xoá ô, gõ từng phím, Tab; `held` = focus phải quay về chính ô đó, chữ còn nguyên và được chọn. */
        async function typeAndLeave(name: '和暦年' | '月' | '日', text: string, held: boolean) {
            const cell = dateCell('medinsQual', name)
            await cell.fill('')
            await cell.pressSequentially(text)
            await expect(cell, `${name} gõ "${text}" phải giữ nguyên chữ`).toHaveValue(text)
            await page.keyboard.press('Tab')
            if (held) {
                await expect(cell, `${name} "${text}" sai ⇒ focus quay về`).toBeFocused()
                expect(await cell.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, text.length])
            } else {
                await expect(cell, `${name} "${text}" hợp lệ ⇒ focus đi tiếp`).not.toBeFocused()
            }
        }

        await typeAndLeave('和暦年', '8', false)
        await typeAndLeave('月', '22', true)
        await typeAndLeave('月', '13', true)
        await typeAndLeave('月', '4', false)
        await typeAndLeave('日', '32', true)
        // Tháng 4 không có ngày 31.
        await typeAndLeave('日', '31', true)
        await typeAndLeave('日', '30', false)
        // 令和7 = 2025 không nhuận, 令和6 = 2024 nhuận.
        await typeAndLeave('和暦年', '7', false)
        await typeAndLeave('月', '2', false)
        await typeAndLeave('日', '29', true)
        await typeAndLeave('和暦年', '6', false)
        await typeAndLeave('日', '29', false)
    })

    // 75ac86228: lịch dừng ở 令和99年12月 (tháng cuối mà ô năm 2 chữ số còn hiện được).
    test('資格取得日 — lịch dừng ở 令和99年12月, chọn 31 → 99/12/31', async () => {
        await openNewRegistration()

        const group = page
            .locator('[data-field="medinsQual"]:visible')
            .first()
            .getByRole('group', { name: '和暦日付' })
        await group.getByRole('button', { name: '日付を選択' }).click()
        await page.getByRole('button', { name: '年を選択' }).click()
        const nextYear = page.getByRole('button', { name: '次の年' })
        while (await nextYear.isEnabled()) await nextYear.click()
        await expect(page.getByRole('button', { name: '令和100年' })).toHaveCount(0)
        await page.getByRole('button', { name: '令和99年' }).click()
        await page.getByRole('button', { name: '月を選択' }).click()
        await page.getByRole('button', { name: '12月', exact: true }).click()
        await expect(page.getByText('令和99年12月')).toBeVisible()
        await expect(page.getByRole('button', { name: '次の月' })).toBeDisabled()
        await page.getByRole('gridcell', { name: '31' }).dblclick()

        await expect(dateCell('medinsQual', '和暦年')).toHaveValue('99')
        await expect(dateCell('medinsQual', '月')).toHaveValue('12')
        await expect(dateCell('medinsQual', '日')).toHaveValue('31')
    })
})
