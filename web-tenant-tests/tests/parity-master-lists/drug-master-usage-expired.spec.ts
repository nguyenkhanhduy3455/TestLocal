import { type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { clickDialog, closeDialog, expectSeverity, MSG, nextDialogText, topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'

/**
 * 処置マスタ（薬剤）登録 (frm501016) — `chkInputData` theo legacy bản 2026-10-28.
 *
 * Thay đổi của nhà cung cấp (so src_20261028 → src, frm501016.cs:1070-1084):
 *  - Sau check trùng 薬品コード, TRƯỚC Q00023 (点数): 用法コード không trống mà
 *    `MstDrugUsage.getMstDrugUsageByUsageCd(usage_cd, getUsageChkDate())` = null
 *    (`@appDt between app_start_date and app_end_date`) ⇒
 *    E00100「用法（<txtUsage_nm>）は、使用期限切れのため使用できません。用法を変更してください。」,
 *    focus 用法コード, không lưu.
 *  - `getUsageChkDate` = ngày lớn hơn giữa appDt của version và 適用日 (giống strDt của
 *    lblUsageMstSearch).
 *
 * FACT bám theo source web:
 *  - features/drug-masters/components/drug-master-register-screen.tsx `handleRegister`:
 *    check chạy sau `checkDrugMasterForm`, trước Q00023 / Q00002; tra qua
 *    GET /tenant/drug-masters/usage với `lookupDate(true)`.
 *  - 用法コード: textbox aria-label 用法コード; 用法名称: #drug-usage-nm.
 *
 * DỮ LIỆU (TEST_DB=1, CHỈ ĐỌC): mst_drug_usage là master dùng chung (schema master, tenant
 * không ghi được) ⇒ dùng 用法 có sẵn hết hạn 2026-07-31; ở 新規, ngày tra = 適用日 mặc định =
 * ngày đầu version mới nhất (2026-09-01). beforeAll kiểm lại điều kiện này trên DB.
 * Không ca nào lưu: ca đối chứng dừng ở Q00002 bằng キャンセル.
 * Chạy cả file (serial, chung page):
 *   npx playwright test tests/parity-master-lists/drug-master-usage-expired.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const LIST_URL = '/masters/drugs'
const REGISTER_HEADING = '処 置 マ ス タ （ 薬 剤 ） 登 録'
/** 用法 của master chuẩn hết hạn 2026-07-31 (không có dòng nào còn hiệu lực). */
const EXPIRED_USAGE_CD = '1011009000000000'
const EXPIRED_USAGE_NM = '１日１回昼食中　服用'
/** 用法 của master chuẩn còn hiệu lực tới 9999-12-31. */
const VALID_USAGE_CD = '1011000090000000'
const VALID_USAGE_NM = '１日１回起床時　服用'

/** Chuỗi E00100, gộp khoảng trắng như `nextDialogText` (tên 用法 có dấu cách toàn góc). */
const usageExpiredMsg = (nm: string) =>
    `用法（${nm}）は、使用期限切れのため使用できません。用法を変更してください。`.replace(/\s+/g, ' ')

test.beforeAll(async () => {
    if (!dbEnabled) return
    // Điều kiện tiền đề: ở ngày đầu version mới nhất, 用法 hết hạn không có dòng, 用法 đối chứng có.
    const { rows } = await withDb((c) =>
        c.query<{ cd: string; hit: boolean }>(
            `WITH v AS (SELECT max(start_date) AS d FROM mst_trt_ver WHERE table_name LIKE 'MST%')
             SELECT cd, EXISTS (SELECT 1 FROM mst_drug_usage u, v
                                WHERE u.usage_cd = cd AND v.d BETWEEN u.app_start_date AND u.app_end_date) AS hit
             FROM unnest($1::text[]) AS cd`,
            [[EXPIRED_USAGE_CD, VALID_USAGE_CD]],
        ),
    )
    const hit = Object.fromEntries(rows.map((r) => [r.cd, r.hit]))
    expect(hit[EXPIRED_USAGE_CD], `${EXPIRED_USAGE_CD} phải hết hạn ở version mới nhất`).toBe(false)
    expect(hit[VALID_USAGE_CD], `${VALID_USAGE_CD} phải còn hiệu lực ở version mới nhất`).toBe(true)
})

test.describe('処置マスタ（薬剤）登録 — 用法 使用期限切れ (legacy 2026-10-28)', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để kiểm dữ liệu 用法')
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    const usageCd = (): Locator => page.getByRole('textbox', { name: '用法コード', exact: true })

    /** 一覧 mới → F1 新規 → nhập 薬剤コード / 薬剤名 / 用法. */
    async function openNewWithUsage(cd: string, nm: string): Promise<void> {
        await gotoListScreen(page, LIST_URL)
        await page.locator('[data-fkey="F1"]:visible').first().click()
        await expect(page.getByText(REGISTER_HEADING, { exact: true })).toBeVisible({ timeout: 30_000 })
        await page.locator('#drug-trt-cd').fill('699')
        await page.getByRole('textbox', { name: '薬剤サブコード', exact: true }).fill('99')
        await page.locator('#drug-trt-nm').fill('E2E薬剤')
        await usageCd().fill(cd)
        // txtUsage_cd_Leave tra lại 用法名称 — chờ nó xong rồi mới gõ tên.
        const leave = page.waitForResponse((r) => r.url().includes('/tenant/drug-masters/usage?'))
        await page.locator('#drug-usage-nm').click()
        await leave
        await page.locator('#drug-usage-nm').fill(nm)
    }

    test('TC-1 用法 hết hạn ⇒ E00100, focus về 用法コード, không tới Q00002', async () => {
        await openNewWithUsage(EXPIRED_USAGE_CD, EXPIRED_USAGE_NM)

        await page.locator('[data-fkey="F9"]:visible').first().click()
        const text = await nextDialogText(page, 'E00100 用法 期限切れ')
        expect(text).toContain(usageExpiredMsg(EXPIRED_USAGE_NM))
        await expectSeverity(page, 'error', '用法 期限切れ: ShowErrorMsg')
        await closeDialog(page, 'E00100 用法 期限切れ')
        await expect(usageCd(), 'focus phải về ô 用法コード').toBeFocused()
        await expect(topDialog(page), 'không được hỏi tiếp Q00002').toHaveCount(0)
    })

    test('TC-2 (đối chứng) 用法 còn hiệu lực ⇒ qua check, tới Q00002 rồi キャンセル', async () => {
        await openNewWithUsage(VALID_USAGE_CD, VALID_USAGE_NM)

        await page.locator('[data-fkey="F9"]:visible').first().click()
        const text = await nextDialogText(page, 'Q00002 sau 用法 hợp lệ')
        expect(text).not.toContain('使用期限切れ')
        expect(text).toContain(MSG.Q00002())
        await clickDialog(page, 'decline')
        await expect(topDialog(page)).toHaveCount(0)
    })
})
