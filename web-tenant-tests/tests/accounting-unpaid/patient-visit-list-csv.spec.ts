import fs from 'node:fs'

import { type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 来患一覧 (frm204008) — F4 CSV出力 sau khi chuyển sang server xuất file (eb07117b0) và gom về
 * web-core/file-export (764db7f1a, 05896e254), cùng nhánh feature/mst-cod-shared-override.
 *
 * FACT bám theo source (Rule 21):
 *  - web-tenant counter-payments/components/patient-visit-list-page.tsx
 *      · F4 CSV出力 mờ khi chưa 検索 / lưới rỗng; KHÔNG hỏi Q00047 (frm204008.btnF4_Click mở thẳng
 *        hộp lưu) ⇒ useCsvExport({ confirm: false }).
 *      · Tên file `来患一覧(<和暦 gggyy年MM月, năm/tháng độn KHOẢNG TRẮNG>).csv`
 *        (formatWarekiYearMonthSpacePadded — 平成18年 1月).
 *  - shared/hooks/use-csv-export.ts: lưu xong ⇒ I00005 「CSV出力が完了しました。」 severity info.
 *  - web-core file-export/export-file.ts: không có showSaveFilePicker ⇒ tải xuống thường (bắt được
 *    sự kiện 'download'); dữ liệu lấy từ GET /tenant/settlement/visit-list/csv.
 *  - api Settlement/Handlers/ExportPatientVisitListCsvHandler.cs: header nguyên văn editCsvHeader
 *    「患者番号,氏　　名,レセプト種別,診療日,初/再診,医療保険点数,医療保険負担金,介護保険点数,
 *    介護保険負担金,保険外負担金,保険外消費税,合計金額」, Shift_JIS như mọi CSV của hệ thống.
 *  - GetPatientVisitListHandler.cs (88fc4b618): năm 0 ⇒ lỗi (không thử ở đây: ô 年 của EraDateField
 *    không cho gõ 0 qua UI).
 *
 * DỮ LIỆU: 診療年月 200601 (平成18年1月) — cùng tháng với patient-visit-list-rcp-type.spec (36 bệnh
 * nhân / 86 dòng trên dataset demo). Chỉ ĐỌC.
 *
 * showSaveFilePicker bị xoá bằng page.evaluate SAU khi goto (không dùng addInitScript): page dùng
 * chung cả worker, addInitScript sẽ rò sang file chạy sau (Rule 19.1); lần goto kế tiếp tự trả lại.
 *   npx playwright test tests/accounting-unpaid/patient-visit-list-csv.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 300_000 })

const SINRYO = { era: '平成', year: '18', month: '1' }
const FILE_NAME = '来患一覧(平成18年 1月).csv'
const HEADER =
    '患者番号,氏　　名,レセプト種別,診療日,初/再診,医療保険点数,医療保険負担金,介護保険点数,介護保険負担金,保険外負担金,保険外消費税,合計金額'

test.describe('来患一覧 — F4 CSV出力', () => {
    let page: Page
    let step: () => Promise<void>

    const f4 = () => page.locator('[data-fkey="F4"]')

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        for (let attempt = 1; ; attempt++) {
            await page.goto('/counter-payments/visit-list', { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByRole('heading', { name: '来患一覧' })).toBeVisible({ timeout: 30_000 })
                break
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
        await page.evaluate(() => {
            delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
        })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    test('TC-01 — chưa 検索: F4 CSV出力 mờ', async () => {
        await expect(f4()).toContainText('CSV出力')
        await expect(f4()).toBeDisabled()
    })

    test('TC-02 — 検索 平成18年1月: có dòng, F4 bật', async () => {
        const row = page.locator('div').filter({ has: page.getByText('診療年月', { exact: true }) }).last()
        const boxes = row.getByRole('textbox')
        await expect(boxes.first()).toBeEnabled({ timeout: 30_000 })
        await row.getByRole('combobox').click()
        await page.getByRole('listbox').getByRole('option').filter({ hasText: SINRYO.era }).first().click()
        await boxes.nth(0).fill(SINRYO.year)
        await boxes.nth(1).fill(SINRYO.month)
        await page.getByRole('button', { name: '検索', exact: true }).click()
        await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible({ timeout: 120_000 })
        await expect(f4()).toBeEnabled()
        await step()
    })

    test('TC-03 — F4: không hỏi Q00047, tải file 「来患一覧(平成18年 1月).csv」 rồi báo I00005 (info)', async () => {
        const [download] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), f4().click()])
        expect(download.suggestedFilename()).toBe(FILE_NAME)
        const alert = page.getByRole('alertdialog').first()
        await expect(alert).toBeVisible({ timeout: 30_000 })
        await expect(alert).not.toContainText('CSV出力してよろしいですか？')
        await expect(alert).toContainText('CSV出力が完了しました。')
        await captureFixedUi(alert, 'visit-list-csv-i00005')
        await alert.getByRole('button', { name: /^(OK|はい|Yes)$/ }).click()

        const bytes = fs.readFileSync(await download.path())
        const lines = new TextDecoder('shift_jis').decode(bytes).split(/\r?\n/).filter((l) => l !== '')
        expect(lines[0], 'header = editCsvHeader của frm204008').toBe(HEADER)
        expect(lines.length, 'có dòng dữ liệu ngoài header').toBeGreaterThan(1)
        expect(bytes.includes(Buffer.from('患者番号', 'utf8')), 'file phải là Shift_JIS, không phải UTF-8').toBe(false)
    })
})
