import { type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { MSG } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

import { type AdminApi, type CodeFields, openAdminApi } from './_mst-code-admin'

/**
 * Kiểm phía server khi LƯU một mã chọn từ combo (MstCodeChoice.cs): mã phải còn được combo đưa ra
 * (pickable và — khi bản ghi có ngày — còn hiệu lực ngày đó), nếu không thì từ chối 422 với field +
 * MST_CODE.NOT_OFFERED.
 * Nhánh feature/mst-cod-shared-override, commit ace3d9d53.
 *
 * FACT bám theo source (Rule 21):
 *  - api Application/Goods/Handlers/GoodsMasterAudit.cs:35 CheckCodesAsync: 税率区分 (reducedTaxRate,
 *    mst_code 902) kiểm theo kỳ hiệu lực trên 適用開始日 (on: AppStDt) ⇒ mã hết hạn trước ngày đó bị từ chối.
 *  - Nhóm 902 KHÔNG cho ẩn (master.mst_code_type.hide_allowed = false, BE 7564a9ebc / 8fe3aab77 — admin cũng
 *    không ẩn được) ⇒ mã chỉ "thôi được đưa ra" theo KỲ: admin đổi 終了日 của mã chung 902-1.
 *  - web-tenant goods-masters/components/goods-master-register-dialog.tsx: không hỏi xác nhận trước khi
 *    lưu; lỗi `isMstCodeNotOffered(err, 'reducedTaxRate')` ⇒ alert E00002 「税率区分が間違っています。」
 *    (severity error), dialog vẫn mở. Combo 税率区分: SelectTrigger aria-label 「税率区分」.
 *  - Ô bắt buộc (lib/goods-master-form.ts): #goods-goodsCd, 物品サブコード, 適用開始日, #goods-goodsNm,
 *    #goods-supplierNm, #goods-purchasePrice, #goods-salesPrice.
 *  - mst_code 902: 0 標準税率 / 1 軽減税率.
 *
 * Kịch bản: chọn 軽減税率 (適用開始日 令和6/4/1 = 2024-04-01), rồi admin đặt 終了日 của mã chung 902-1 về
 * 2024-03-31 (PUT /admin/mst-code/types/902/codes/1), rồi F9 ⇒ server từ chối.
 *
 * NGOÀI PHẠM VI: 京都市学歯 (mst_code 72) — chỉ kiểm khi 医院マスタ pref_cd = 26; tenant demo là 13
 * (東京) nên server luôn lưu 0, không dựng được ca từ chối qua UI.
 *
 * GHI: mã CHUNG 902-1 (mọi tenant, chỉ trong lúc chạy — trả kỳ gốc ở afterAll); nếu server lọt kiểm tra thì có một dòng mst_goods 9999-254 —
 * afterAll xoá nó. Cần TEST_ALLOW_SAVE=1, TEST_DB=1. Login: authedPage + 1 admin API.
 *   npx playwright test tests/mst-code/code-choice-on-save.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec đổi kỳ mã chung 902-1')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id và dọn mst_goods')

const TAX_RATE_TYPE = 902
const REDUCED = 1
const GOODS_CD = '9999'
const GOODS_SB = '254'
/** Ngày cuối trước 適用開始日 令和6/4/1 mà spec nhập. */
const ENDS_BEFORE_APP_ST = '2024-03-31'

test.describe('物品マスタ登録 — 税率区分 hết hạn trong lúc mở dialog', () => {
    let page: Page
    let admin: AdminApi
    let reduced: CodeFields

    /** Mã chung 902-1 như master đang lưu (ngày theo lịch, không qua timezone). */
    async function sharedReduced(): Promise<CodeFields> {
        return withDb(async (c) => {
            const r = await c.query<{ any_val1: string; any_val2: string; sort_order: number; s: string; e: string }>(
                `SELECT any_val1, any_val2, sort_order, to_char(start_date, 'YYYY-MM-DD') s, to_char(end_date, 'YYYY-MM-DD') e
                   FROM master.mst_code WHERE cd_type = $1 AND cd_val = $2`,
                [TAX_RATE_TYPE, REDUCED],
            )
            const x = r.rows[0]!
            return { anyVal1: x.any_val1, anyVal2: x.any_val2, sortOrder: x.sort_order, startDate: x.s, endDate: x.e }
        })
    }

    async function dropTestGoods(): Promise<number> {
        return withDb(async (c) => {
            const r = await c.query('DELETE FROM mst_goods WHERE goods_cd = $1 AND goods_sb = $2', [
                Number(GOODS_CD),
                Number(GOODS_SB),
            ])
            return r.rowCount ?? 0
        })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        admin = await openAdminApi()
        reduced = await sharedReduced()
        expect(reduced.endDate, '902-1 phải đang mở (lần chạy trước chưa trả kỳ?)').toBe('9999-12-31')
        await dropTestGoods()
    })

    test.afterAll(async () => {
        if (admin) {
            if (reduced)
                await admin.saveShared(TAX_RATE_TYPE, REDUCED, reduced).catch((e) => console.log(`TRẢ 902-1 lỗi: ${e}`))
            await admin.dispose()
        }
        const dropped = await dropTestGoods().catch(() => 0)
        if (dropped > 0) console.log(`afterAll: đã xoá ${dropped} dòng mst_goods ${GOODS_CD}-${GOODS_SB} (server đã lưu dù mã hết hạn)`)
        await releaseSharedPage(page)
    })

    test('TC-01 — chọn 軽減税率, mã hết hạn trước 適用開始日 ngay trước F9 ⇒ E00002 「税率区分が間違っています。」, không lưu', async () => {
        const step = makeStep(page)
        await gotoListScreen(page, '/masters/goods')
        await page.keyboard.press('F1')
        const dialog = page.getByRole('dialog').filter({ hasText: '物品マスタ登録' })
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        await page.locator('#goods-goodsCd').fill(GOODS_CD)
        await dialog.getByLabel('物品サブコード', { exact: true }).fill(GOODS_SB)
        const appSt = dialog.locator('div.flex.items-center.gap-4').filter({ hasText: '適用開始日' })
        await appSt.getByRole('combobox').click()
        await page.getByRole('option', { name: '令和', exact: true }).click()
        const boxes = appSt.getByRole('textbox')
        await boxes.nth(0).fill('6')
        await boxes.nth(1).fill('4')
        await boxes.nth(2).fill('1')
        await page.locator('#goods-goodsNm').fill('E2E物品')
        await page.locator('#goods-supplierNm').fill('E2E仕入先')
        await page.locator('#goods-purchasePrice').fill('100')
        await page.locator('#goods-salesPrice').fill('200')

        await dialog.getByRole('combobox', { name: '税率区分' }).click()
        await page.getByRole('option', { name: '軽減税率', exact: true }).click()
        await expect(dialog.getByRole('combobox', { name: '税率区分' })).toContainText('軽減税率')
        await step()

        await admin.saveShared(TAX_RATE_TYPE, REDUCED, { ...reduced, endDate: ENDS_BEFORE_APP_ST })

        await page.keyboard.press('F9')
        const alert = page.getByRole('alertdialog').first()
        await expect(alert).toBeVisible({ timeout: 30_000 })
        await expect(alert).toContainText(MSG.E00002('税率区分'))
        // Chụp cả trang: alert phủ lên dialog làm locator.screenshot của dialog không ổn định.
        await captureFixedUi(page, 'mst-code-goods-tax-rate-expired')
        await alert.getByRole('button', { name: /^(OK|はい|Yes)$/ }).click()
        await expect(dialog, 'lỗi lưu thì dialog vẫn mở').toBeVisible()

        const saved = await withDb(async (c) =>
            (await c.query('SELECT 1 FROM mst_goods WHERE goods_cd = $1 AND goods_sb = $2', [Number(GOODS_CD), Number(GOODS_SB)]))
                .rowCount,
        )
        expect(saved, 'server không được lưu mã hết hạn').toBe(0)
        await page.keyboard.press('F10')
    })
})
