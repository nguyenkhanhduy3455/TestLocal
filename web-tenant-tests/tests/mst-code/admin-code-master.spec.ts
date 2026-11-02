import fs from 'node:fs'

import { type BrowserContext, type Locator, type Page, expect, test } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import { ADMIN_BASE_URL, type AdminApi, type CodeType, INHERIT_ALL, OWN_CODE, TENANT_SLUG, openAdminApi } from './_mst-code-admin'

/**
 * web-admin コードマスタ (/masters/mst-code) — mã dùng chung (master.mst_code) và cách admin thấy
 * những tenant đã sửa nó. Nhánh feature/mst-cod-shared-override (merge dev ccf611752); quyền theo từng
 * loại thay cho 3 mức tuỳ biến từ BE 7564a9ebc (2026-10-27).
 *
 * FACT bám theo source (Rule 21) — apps/web-admin/src/features/mst-codes/:
 *  - routes/_authenticated/masters/mst-code.tsx: ?cdType=<n> mở sẵn một nhóm; ?tenant=<id>&cdType=<n>
 *    thay bằng màn mã của tenant đó (TenantMstCodeScreen, tiêu đề 「コードマスタ（slug）」, nút
 *    「共通マスタに戻る」).
 *  - components/mst-code-list-frame.tsx: <select id="mst-code-group"> (すべて + từng nhóm), danh sách
 *    (dòng data-testid="data-row"); footer 「合　計」 + 「n件」.
 *  - components/mst-code-screen.tsx: nút グループ設定 / カスタムテナント N社 / 基準日で確認 / 追加 mờ khi
 *    chưa lọc một nhóm; khối ≪CSV入出力≫ có CSV出力 + panel 取込/復元.
 *  - components/mst-code-group-settings-dialog.tsx: 「グループ設定（9 職業）」, ô #mst-code-group-name, nhóm
 *    checkbox 「テナントに許可」 CHỈ gồm quyền trong trần của nhóm (#mst-code-group-rename|reorder|hide|add,
 *    nhãn 名称の変更 / 並び順の変更 / 共通コードの非表示 / 独自コードの追加); nhóm cho thêm mã có ghi chú
 *    「独自コードの範囲: 30000〜32767」; trần rỗng ⇒ 「このグループはシステムで固定されているため、テナントは変更
 *    できません。」; bỏ tick một quyền đang bật ⇒ khối 「保存後、次のテナントは変更できなくなります…」 liệt kê
 *    tenant đang có thay đổi.
 *  - components/mst-code-form-dialog.tsx: trước khi lưu, hỏi danh sách tenant đang ghi đè:
 *      sửa ⇒ ConfirmDialog 「共通コードの変更」 + 「コード n の変更した項目を次のテナントが…」 + nút 保存する;
 *      thêm ⇒ 「共通コードの追加」 + 「コード n は次のテナントで独自コードとして使われています…」 + 追加する.
 *  - errors/mst-code-error-registry.ts: RESERVED_FOR_TENANTS 「このコードは独自コードの範囲（30000〜32767）内の
 *    ため共通コードとして追加できません。」.
 *  - components/tenant-mst-code-screen.tsx: 非表示 bật khi trần nhóm cho ẩn; mã riêng ⇒ nút 削除 thay 元に戻す.
 *  - api MstCodeCsvFormat.cs: file mst_code_<cdType>_<yyyymmdd>.csv, Shift_JIS, header
 *    「cd_type,cd_val,any_val1,any_val2,sort_order,start_date,end_date,hidden」.
 *
 * DỮ LIỆU dựng qua admin API (beforeAll) trên nhóm 9 職業 (trần cho cả bốn quyền; mã 1 会社員 … 10 その他):
 *   bật cả bốn quyền cho tenant; tenant đang test có mã riêng 30950 và ghi đè 名称1 của mã 1. Nhóm 30 không còn
 *   cho thêm/ẩn (trần) nên không dùng được cho các ca mã riêng.
 * afterAll trả quyền gốc và xoá mọi override. Spec KHÔNG ghi mã dùng chung: mọi hộp cảnh báo đều
 * bấm キャンセル, còn lần 追加する duy nhất bị server từ chối (RESERVED_FOR_TENANTS).
 *
 * Cần TEST_ALLOW_SAVE=1 (đổi quyền nhóm dùng chung + override tenant) và TEST_DB=1 (tra tenant id).
 * Login: 1 UI admin (context riêng, Rule 19.2: authedPage là phiên TENANT) + 1 admin API.
 *   npx playwright test tests/mst-code/admin-code-master.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec đổi quyền nhóm mã và ghi override')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id')

const CD_TYPE = 9
const GROUP_LABEL = '9 職業'
const CUSTOM_CD = OWN_CODE.min + 950
const OVERRIDE_NAME = 'E2E上書き会社員'
const CSV_HEADER = 'cd_type,cd_val,any_val1,any_val2,sort_order,start_date,end_date,hidden'
/** Nhóm có trần rỗng (連携先) — グループ設定 chỉ có ghi chú, không có checkbox. */
const LOCKED_TYPE = 58

/** Mã chung của nhóm như dòng CSV出力 (ngày theo lịch, không qua timezone). */
async function sharedCsvLines(cdType: number): Promise<string[]> {
    return withDb(async (c) => {
        const r = await c.query<{ line: string }>(
            `SELECT concat_ws(',', cd_type, cd_val, any_val1, any_val2, sort_order, to_char(start_date, 'YYYY-MM-DD'),
                              to_char(end_date, 'YYYY-MM-DD'), CASE WHEN hidden_on IS NULL THEN 0 ELSE 1 END) AS line
               FROM master.mst_code WHERE cd_type = $1 ORDER BY cd_val`,
            [cdType],
        )
        return r.rows.map((x) => x.line)
    })
}

test.describe('web-admin コードマスタ — nhóm 9 với tenant đã tuỳ biến', () => {
    let context: BrowserContext
    let page: Page
    let admin: AdminApi
    let original: CodeType
    /** Dòng CSV của mã chung nhóm 9 — cũng là số mã của nhóm. */
    let sharedLines: string[]

    const rows = (): Locator => page.getByTestId('data-row')
    const dialog = (title: string | RegExp): Locator => page.getByRole('dialog').filter({ hasText: title })
    /** ConfirmDialog của web-admin là Radix Dialog (role=dialog), nhận ra theo tiêu đề. */
    const confirm = (): Locator => page.getByRole('dialog').filter({ hasText: /共通コードの(変更|追加)/ })
    const btn = (name: string | RegExp): Locator => page.getByRole('button', { name, exact: typeof name === 'string' })

    async function openGroup(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/masters/mst-code?cdType=${CD_TYPE}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(rows().first()).toBeVisible({ timeout: 30_000 })
                break
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
        await expect(page.locator('#mst-code-group')).toHaveValue(String(CD_TYPE))
        await expect(rows()).toHaveCount(sharedLines.length)
    }

    test.beforeAll(async ({ browser }) => {
        admin = await openAdminApi()
        original = await admin.getType(CD_TYPE)
        sharedLines = await sharedCsvLines(CD_TYPE)
        await admin.resetGroup(CD_TYPE)
        await admin.enable(CD_TYPE, { rename: true, reorder: true, hide: true, add: true })
        await admin.add(CD_TYPE, CUSTOM_CD, {
            anyVal1: 'E2E独自',
            anyVal2: 'E2E独自',
            sortOrder: 0,
            startDate: '1900-01-01',
            endDate: '9999-12-31',
        })
        await admin.save(CD_TYPE, 1, { ...INHERIT_ALL, anyVal1: OVERRIDE_NAME })

        context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
        // Không có hộp chọn nơi lưu: CSV出力 rơi về tải xuống thường (export-file.ts) ⇒ bắt được 'download'.
        await context.addInitScript(() => {
            delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker
        })
        page = await context.newPage()
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
        await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: 'ログイン' }).click()
        await expect(page, 'login admin UI (rate-limit?)').not.toHaveURL(/\/login/, { timeout: 30_000 })
    })

    test.afterAll(async () => {
        if (admin) {
            await admin.resetGroup(CD_TYPE).catch((e) => console.log(`DỌN override nhóm ${CD_TYPE} lỗi: ${e}`))
            await admin.setType(original).catch((e) => console.log(`TRẢ quyền nhóm ${CD_TYPE} lỗi: ${e}`))
            await admin.dispose()
        }
        await context?.close()
    })

    test('TC-01 — ?cdType=9 mở sẵn nhóm: đủ mã dùng chung, footer 「n件」 (tổng tính trong nhóm đang tìm); các nút nhóm bật', async () => {
        await openGroup()
        await expect(page.getByText('合　計', { exact: true })).toBeVisible()
        await expect(page.getByText(`${sharedLines.length}件`, { exact: true })).toBeVisible()
        // Danh sách chung KHÔNG chứa mã riêng của tenant.
        await expect(rows().filter({ hasText: 'E2E独自' })).toHaveCount(0)
        for (const name of ['グループ設定', '基準日で確認', '追加']) await expect(btn(name)).toBeEnabled()
        await captureFixedUi(page, 'mst-code-admin-group-9')
    })

    test('TC-02 — すべて (bỏ lọc nhóm): các nút theo nhóm mờ đi', async () => {
        await page.locator('#mst-code-group').selectOption('')
        await btn('検索').click()
        await expect(page.getByText(/^[\d,]+件$/)).toBeVisible()
        for (const name of ['グループ設定', '基準日で確認', '追加']) await expect(btn(name)).toBeDisabled()
    })

    test('TC-03 — カスタムテナント 1社 → danh sách tenant → bấm tenant mở 「コードマスタ（slug）」', async () => {
        await openGroup()
        const button = btn(/^カスタムテナント/)
        await expect(button).toHaveText(/カスタムテナント 1社/, { timeout: 30_000 })
        await button.click()
        const d = dialog(`${GROUP_LABEL} のテナント別データ`)
        await expect(d).toBeVisible()
        await captureFixedUi(d, 'mst-code-admin-type-tenants')
        await d.getByRole('button').filter({ hasText: TENANT_SLUG }).click()
        await expect(page.getByRole('heading', { name: `コードマスタ（${TENANT_SLUG}）` })).toBeVisible({ timeout: 30_000 })
    })

    test('TC-04 — màn mã của tenant: thấy ghi đè + mã riêng; 非表示 bật (trần nhóm 9 cho ẩn); mã riêng có 削除', async () => {
        await expect(rows().filter({ hasText: OVERRIDE_NAME })).toHaveCount(1)
        await expect(rows().filter({ hasText: 'E2E独自' })).toHaveCount(1)
        await rows().filter({ hasText: '教師' }).first().click()
        await expect(btn('非表示')).toBeEnabled()
        await rows().filter({ hasText: 'E2E独自' }).click()
        await expect(btn('削除')).toBeEnabled()
        await captureFixedUi(page, 'mst-code-admin-tenant-screen')
        await btn('共通マスタに戻る').click()
        await expect(page.getByRole('heading', { name: 'コードマスタ', exact: true })).toBeVisible()
    })

    test('TC-05 — sửa 名称1 của mã 1 (tenant đang ghi đè) ⇒ cảnh báo 「共通コードの変更」 nêu tenant; キャンセル không ghi', async () => {
        await openGroup()
        await rows().filter({ hasText: '会社員' }).first().dblclick()
        const form = dialog('コード編集')
        await expect(form).toBeVisible()
        await form.locator('#mst-code-anyVal1').fill('E2E変更')
        await form.getByRole('button', { name: '保存', exact: true }).click()
        await expect(confirm()).toBeVisible({ timeout: 30_000 })
        await expect(confirm()).toContainText('共通コードの変更')
        await expect(confirm()).toContainText(`コード 1 の変更した項目を次のテナントが上書きまたは非表示にしています`)
        await expect(confirm()).toContainText(TENANT_SLUG)
        await expect(confirm().getByRole('button', { name: '保存する' })).toBeVisible()
        await captureFixedUi(confirm(), 'mst-code-admin-change-warning')
        await confirm().getByRole('button', { name: 'キャンセル' }).click()
        await expect(confirm()).toBeHidden()
        await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(form).toBeHidden()
        await expect(rows().filter({ hasText: 'E2E変更' }), 'キャンセル không được ghi').toHaveCount(0)
    })

    test('TC-06 — sửa 名称2 (tenant không ghi đè trường này) ⇒ không cảnh báo; huỷ bằng キャンセル trước khi lưu', async () => {
        await rows().filter({ hasText: '会社員' }).first().dblclick()
        const form = dialog('コード編集')
        await form.locator('#mst-code-anyVal2').fill('E2E名称2')
        // Không bấm 保存 (sẽ ghi mã dùng chung): chỉ kiểm dialog vẫn đóng sạch.
        await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(form).toBeHidden()
        await expect(confirm()).toHaveCount(0)
    })

    test('TC-07 — 追加 mã 30950 (tenant dùng làm mã riêng) ⇒ cảnh báo 「共通コードの追加」; 追加する ⇒ server từ chối vì nằm trong dải mã riêng', async () => {
        await btn('追加').click()
        const form = dialog('コード追加')
        await expect(form).toBeVisible()
        await form.locator('#mst-code-cd-val').fill(String(CUSTOM_CD))
        await form.locator('#mst-code-anyVal1').fill('E2E共通')
        await form.locator('#mst-code-anyVal2').fill('E2E共通')
        await form.getByRole('button', { name: '保存', exact: true }).click()
        await expect(confirm()).toBeVisible({ timeout: 30_000 })
        await expect(confirm()).toContainText('共通コードの追加')
        await expect(confirm()).toContainText(`コード ${CUSTOM_CD} は次のテナントで独自コードとして使われています`)
        await expect(confirm()).toContainText(TENANT_SLUG)
        await confirm().getByRole('button', { name: '追加する' }).click()
        await expect(form).toContainText(
            `このコードは独自コードの範囲（${OWN_CODE.min}〜${OWN_CODE.max}）内のため共通コードとして追加できません。`,
        )
        await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(form).toBeHidden()
        await expect(rows()).toHaveCount(sharedLines.length)
    })

    test('TC-08 — グループ設定: tên nhóm + đủ 4 checkbox của trần, đang tick theo quyền đã bật; ghi chú dải 30000〜32767', async () => {
        await btn('グループ設定').click()
        const d = dialog(`グループ設定（${GROUP_LABEL}）`)
        await expect(d).toBeVisible()
        await expect(d.locator('#mst-code-group-name')).toHaveValue(original.name ?? '')
        const perms = d.getByRole('group', { name: 'テナントに許可' })
        for (const label of ['名称の変更', '並び順の変更', '共通コードの非表示', '独自コードの追加'])
            await expect(perms.getByRole('checkbox', { name: label })).toBeChecked()
        await expect(d).toContainText(`独自コードの範囲: ${OWN_CODE.min}〜${OWN_CODE.max}`)
        await captureFixedUi(d, 'mst-code-admin-group-settings')
    })

    test('TC-09 — bỏ tick 独自コードの追加 (đang bật) ⇒ cảnh báo 「保存後、次のテナントは変更できなくなります」 nêu tenant; キャンセル không lưu', async () => {
        const d = dialog(`グループ設定（${GROUP_LABEL}）`)
        await d.getByRole('group', { name: 'テナントに許可' }).getByRole('checkbox', { name: '独自コードの追加' }).uncheck()
        const lowering = d.getByRole('region', { name: /保存後、次のテナントは変更できなくなります/ })
        await expect(lowering).toBeVisible()
        await expect(lowering).toContainText(TENANT_SLUG, { timeout: 30_000 })
        await captureFixedUi(d, 'mst-code-admin-permission-lowering')
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(d).toBeHidden()
        expect((await admin.getType(CD_TYPE)).enabled.add, 'キャンセル không được lưu').toBe(true)
    })

    test('TC-10 — nhóm trần rỗng (58): グループ設定 không có checkbox, chỉ 「このグループはシステムで固定されているため…」', async () => {
        await page.goto(`/masters/mst-code?cdType=${LOCKED_TYPE}`, { waitUntil: 'domcontentloaded' })
        await expect(rows().first()).toBeVisible({ timeout: 30_000 })
        await btn('グループ設定').click()
        const d = dialog(/^グループ設定（58 /)
        await expect(d).toBeVisible()
        await expect(d).toContainText('このグループはシステムで固定されているため、テナントは変更できません。')
        await expect(d.getByRole('checkbox')).toHaveCount(0)
        await expect(d).not.toContainText('独自コードの範囲')
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(d).toBeHidden()
        await openGroup()
    })

    test('TC-11 — 基準日で確認: mở dialog chỉ xem của nhóm, liệt kê mọi mã hiệu lực hôm nay', async () => {
        await btn('基準日で確認').click()
        const d = dialog(`基準日で確認（${GROUP_LABEL}）`)
        await expect(d).toBeVisible()
        await expect(d).toContainText('この日に有効なコードです（参照のみ）。')
        await expect(d).toContainText(`${sharedLines.length}件`)
        await page.keyboard.press('Escape')
        await expect(d).toBeHidden()
    })

    test('TC-12 — CSV出力 nhóm 9: file Shift_JIS, header đúng 8 cột (có hidden), đủ dòng mã chung', async () => {
        const [download] = await Promise.all([page.waitForEvent('download'), btn('CSV出力').click()])
        expect(download.suggestedFilename()).toMatch(new RegExp(`^mst_code_${CD_TYPE}_\\d{8}\\.csv$`))
        const bytes = fs.readFileSync(await download.path())
        const text = new TextDecoder('shift_jis').decode(bytes)
        const lines = text.split('\r\n').filter((l) => l !== '')
        expect(lines[0]).toBe(CSV_HEADER)
        expect(lines.slice(1)).toEqual(sharedLines)
        // Danh sách chung không mang mã riêng của tenant.
        expect(lines.some((l) => l.startsWith(`${CD_TYPE},${CUSTOM_CD},`))).toBe(false)
        // UTF-8 thì 「会社員」 ra byte E4 BC 9A…; Shift_JIS là 89 EF…
        expect(bytes.includes(Buffer.from('会社員', 'utf8')), 'file không được là UTF-8').toBe(false)
    })
})
