import { type BrowserContext, type Locator, type Page, expect, test } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import { ADMIN_BASE_URL, type AdminApi, type CodeFields, INHERIT_ALL, TENANT_SLUG, openAdminApi } from './_mst-code-admin'

/**
 * web-admin コードマスタ với NHIỀU tenant: hai tenant cùng ghi đè, một tenant đang bảo trì (không kiểm được),
 * một tenant đã archive (bị bỏ qua). Commit bdbd718ee, 92d44dc67, 174809b0a, 712ca6fa0, 93f1e323c.
 *
 * FACT bám theo source (Rule 21):
 *  - Infrastructure/MstCodes/MstCodeTenantFanOut.cs: duyệt mọi tenant có schema TRỪ archived, theo thứ tự slug;
 *    tenant đang bảo trì (platform.tenant_migration_state.maintenance = true ⇒ TenantMigratingException, xem
 *    Tenants/TenantMaintenance.cs) hoặc lỗi bất kỳ ⇒ vào danh sách "unavailable" thay vì làm hỏng cả request.
 *    Archived thì "không cảnh báo nêu tên, không chờ kiểm, không chặn khôi phục".
 *  - Danh sách unavailable hiện ở:
 *      bước 確認 + sau khi nhập (import-dialog.tsx / tenant-check-notes.tsx):
 *        「次のテナントは現在利用できないため確認できませんでした: slug」
 *      dialog tenant (mst-code-type-tenants.tsx): cùng câu (ja.unavailableTenants)
 *      cảnh báo trước khi lưu mã chung (mst-code-form-dialog.tsx): 「確認できなかったテナント: slug」
 *  - MasterImportRestoreGuard.cs: còn tenant không kiểm được ⇒ 「次のテナントを確認できないため、復元できません: slug」;
 *    tenant (không archived) có dòng thiếu trường trên mã do lần nhập thêm ⇒ 「取込で追加したコードを次のテナントが
 *    変更または非表示にしているため、復元できません: slug」.
 *  - Danh sách tenant trong các câu cảnh báo nối bằng 「, 」 theo thứ tự slug.
 *
 * DỮ LIỆU: tenant đang test (TENANT_SLUG) + một tenant khác (TEST_OTHER_TENANT_SLUG, mặc định tenant2). Override dựng qua
 * admin API (cùng một login, AdminApi.forTenant). Bật/tắt bảo trì và archive bằng SQL trên platform.*; afterAll trả
 * lại cả hai, xoá override nhóm 30 của hai tenant, xoá 30-800 nếu còn, trả mã dùng chung 30-0..2. Ghi đè 名称1 của 30-x đi qua admin API trong trần của nhóm 30 (rename),
 * không cần bật quyền cho tenant.
 * Trong lúc chạy tenant kia KHÔNG dùng được (bảo trì / archived) — đừng chạy song song spec khác của tenant đó.
 *
 * Cần TEST_ALLOW_SAVE=1, TEST_DB=1. Serial — chạy cả file:
 *   TEST_ALLOW_SAVE=1 TEST_DB=1 npx playwright test tests/mst-code/admin-code-multi-tenant.spec.ts
 * Login: 1 UI admin (context riêng, Rule 19.2) + 1 admin API.
 */

test.describe.configure({ mode: 'serial', timeout: 300_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec nhập thật và đổi trạng thái tenant')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để đổi trạng thái tenant')

const OTHER_SLUG = process.env.TEST_OTHER_TENANT_SLUG ?? 'tenant2'
const CD_TYPE = 30
const GROUP_LABEL = '30 ユーザ区分'
const NEW_CD = 800
const TABLE = 'mst_code'
const HEADER = 'cd_type,cd_val,any_val1,any_val2,sort_order,start_date,end_date,hidden'
/** Kỳ mở + hidden = 0 — đuôi ASCII của mọi dòng 30-x trong bản CSV出力. */
const FULL_PERIOD = ',1900-01-01,9999-12-31,0'
const IMPORT_TIMEOUT = 180_000
const BOTH = [TENANT_SLUG, OTHER_SLUG].sort().join(', ')

const T = {
    willOverride: '次のテナントでは独自の値が優先され、取込む共通コードは反映されません:',
    overriding: '次のテナントでは独自の値が優先され、取込んだ共通コードは反映されていません:',
    unavailable: `次のテナントは現在利用できないため確認できませんでした: ${OTHER_SLUG}`,
    unchecked: `確認できなかったテナント: ${OTHER_SLUG}`,
    succeeded: '取込が完了しました。',
    restoreDone: '復元が完了しました。',
    refuseUnavailable: `次のテナントを確認できないため、復元できません: ${OTHER_SLUG}`,
    refuseTenantRow: `取込で追加したコードを次のテナントが変更または非表示にしているため、復元できません: ${OTHER_SLUG}`,
}

interface SharedRow {
    cd_val: number
    any_val1: string
    any_val2: string
    sort_order: number
}

const ascii = (s: string) => Buffer.from(s, 'ascii')
const CRLF = ascii('\r\n')

function csv(lines: (Buffer | string)[]): Buffer {
    return Buffer.concat(lines.flatMap((l) => [typeof l === 'string' ? ascii(l) : l, CRLF]))
}

/** Dòng Shift_JIS của mã `cdVal` trong bản CSV出力, với sort_order đổi thành `sortOrder`. */
function withSortOrder(exported: Buffer, cdVal: number, sortOrder: number): Buffer {
    const prefix = ascii(`${CD_TYPE},${cdVal},`)
    let line: Buffer | undefined
    for (let start = 0; start < exported.length && !line; ) {
        const end = exported.indexOf(CRLF, start)
        const l = exported.subarray(start, end === -1 ? exported.length : end)
        if (l.subarray(0, prefix.length).equals(prefix)) line = l
        start = end === -1 ? exported.length : end + 2
    }
    expect(line, `bản CSV出力 không có dòng ${CD_TYPE}-${cdVal}`).toBeTruthy()
    const tail = ascii(`,0${FULL_PERIOD}`)
    expect(line!.lastIndexOf(tail)).toBe(line!.length - tail.length)
    return Buffer.concat([line!.subarray(0, line!.length - tail.length), ascii(`,${sortOrder}${FULL_PERIOD}`)])
}

async function sharedRows(): Promise<SharedRow[]> {
    return withDb(async (c) => {
        const r = await c.query<SharedRow>(
            'SELECT cd_val, any_val1, any_val2, sort_order FROM master.mst_code WHERE cd_type = $1 ORDER BY cd_val',
            [CD_TYPE],
        )
        return r.rows
    })
}

const fieldsOf = (r: SharedRow): CodeFields => ({
    anyVal1: r.any_val1,
    anyVal2: r.any_val2,
    sortOrder: r.sort_order,
    startDate: '1900-01-01',
    endDate: '9999-12-31',
})

async function setMaintenance(tenantId: string, on: boolean): Promise<void> {
    await withDb((c) => c.query('UPDATE platform.tenant_migration_state SET maintenance = $2 WHERE tenant_id = $1', [tenantId, on]))
}

async function setStatus(tenantId: string, status: string): Promise<void> {
    await withDb((c) => c.query('UPDATE platform.tenants SET status = $2 WHERE id = $1', [tenantId, status]))
}

test.describe('web-admin コードマスタ — nhiều tenant: cùng ghi đè, đang bảo trì, đã archive', () => {
    let context: BrowserContext
    let page: Page
    let admin: AdminApi
    let other: AdminApi
    let originalRows: SharedRow[]
    let otherStatus: string
    let exported: Buffer

    const rows = (): Locator => page.getByTestId('data-row')
    const dialog = (title: string | RegExp): Locator => page.getByRole('dialog').filter({ hasText: title })
    const btn = (name: string | RegExp): Locator => page.getByRole('button', { name, exact: typeof name === 'string' })
    const importDialog = (): Locator => dialog('コードマスタの取込')
    const restoreDialog = (): Locator => dialog('コードマスタの復元')
    const panel = (): Locator => page.getByRole('region', { name: 'CSV入出力' })

    /** Cả file: thêm 30-800 và sửa sort_order của 30-1 ⇒ khoá bị ảnh hưởng là 30-1 (cả hai tenant ghi đè) và 30-800. */
    const addAndUpdate = () => csv([HEADER, withSortOrder(exported, 1, 5), `30,${NEW_CD},E2E-IMPORT,E2E-IMPORT,0,1900/1/1,9999/12/31,0`])

    async function openGroup(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/masters/mst-code?cdType=${CD_TYPE}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(rows().first()).toBeVisible({ timeout: 30_000 })
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    async function check(name: string, buffer: Buffer): Promise<Locator> {
        await openGroup()
        await panel().getByRole('button', { name: '取込', exact: true }).click()
        const d = importDialog()
        await expect(d).toBeVisible()
        await d.locator('#master-import-files').setInputFiles({ name, mimeType: 'text/csv', buffer })
        await d.getByRole('button', { name: '確認', exact: true }).click()
        await expect(d.getByRole('button', { name: 'ファイルを選び直す', exact: true })).toBeVisible({ timeout: 60_000 })
        return d
    }

    async function closeImport(): Promise<void> {
        await importDialog().getByRole('button', { name: /^(キャンセル|閉じる)$/ }).last().click()
        await expect(importDialog()).toBeHidden()
    }

    /** 復元 lần nhập mới nhất; trả dialog sau khi bấm 復元する. */
    async function restore(): Promise<Locator> {
        await openGroup()
        await panel().getByRole('button', { name: '復元', exact: true }).click()
        const d = restoreDialog()
        await expect(d).toBeVisible()
        await d.locator('#master-restore-confirm').fill(TABLE)
        await d.getByRole('button', { name: '復元する' }).click()
        return d
    }

    /** Dialog tenant của nhóm 30, mở từ nút カスタムテナント. */
    async function openTypeTenants(): Promise<Locator> {
        await openGroup()
        await btn(/^カスタムテナント/).click()
        const d = dialog(`${GROUP_LABEL} のテナント別データ`)
        await expect(d).toBeVisible()
        await expect(d.locator('li').first()).toBeVisible({ timeout: 30_000 })
        return d
    }

    /** Bấm 保存 sau khi đổi 名称1 của 30-1 ⇒ hộp 「共通コードの変更」 (không bấm 保存する — không ghi mã chung). */
    async function openChangeWarning(): Promise<{ form: Locator; confirm: Locator }> {
        await openGroup()
        await rows().filter({ hasText: '衛生士' }).dblclick()
        const form = dialog('コード編集')
        await form.locator('#mst-code-anyVal1').fill('E2E変更')
        await form.getByRole('button', { name: '保存', exact: true }).click()
        const confirm = dialog('共通コードの変更')
        await expect(confirm).toBeVisible({ timeout: 30_000 })
        return { form, confirm }
    }

    async function cancelChangeWarning(w: { form: Locator; confirm: Locator }): Promise<void> {
        await w.confirm.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(w.confirm).toBeHidden()
        await w.form.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(w.form).toBeHidden()
    }

    async function cleanUp(): Promise<void> {
        await setMaintenance(other.tenantId, false)
        await setStatus(other.tenantId, otherStatus)
        await withDb(async (c) => {
            await c.query('DELETE FROM master.mst_code WHERE cd_type = $1 AND cd_val = $2', [CD_TYPE, NEW_CD])
        })
        const now = await sharedRows()
        for (const before of originalRows) {
            const cur = now.find((r) => r.cd_val === before.cd_val)
            if (cur && (cur.sort_order !== before.sort_order || cur.any_val1 !== before.any_val1 || cur.any_val2 !== before.any_val2))
                await admin.saveShared(CD_TYPE, before.cd_val, fieldsOf(before))
        }
        for (const api of [admin, other]) {
            await api.resetGroup(CD_TYPE).catch(async (e) => {
                // Override trên mã đã bị khôi phục gỡ (30-800) không còn mã chung để reset qua API ⇒ xoá bằng SQL.
                console.log(`resetGroup qua API lỗi (${e}) ⇒ xoá override nhóm ${CD_TYPE} bằng SQL`)
            })
        }
        await withDb(async (c) => {
            for (const slug of [TENANT_SLUG, OTHER_SLUG]) {
                await c.query(`DELETE FROM t_${slug}.mst_code_override WHERE cd_type = $1 AND cd_val = $2`, [CD_TYPE, NEW_CD])
            }
        })
    }

    test.beforeAll(async ({ browser }) => {
        admin = await openAdminApi()
        other = await admin.forTenant(OTHER_SLUG)
        otherStatus = await withDb(async (c) => {
            const r = await c.query<{ status: string }>('SELECT status FROM platform.tenants WHERE id = $1', [other.tenantId])
            return r.rows[0]!.status
        })
        expect(otherStatus, `${OTHER_SLUG} phải đang active`).toBe('active')
        originalRows = (await sharedRows()).filter((r) => r.cd_val <= 2)
        await cleanUp()
        await admin.save(CD_TYPE, 1, { ...INHERIT_ALL, anyVal1: 'E2E上書き1' })
        await other.save(CD_TYPE, 1, { ...INHERIT_ALL, anyVal1: 'E2E上書き2' })
        const res = await admin.ctx.get(`api/admin/mst-code/export?cdType=${CD_TYPE}`)
        expect(res.status(), 'GET /admin/mst-code/export').toBe(200)
        exported = await res.body()

        context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
        page = await context.newPage()
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
        await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: 'ログイン' }).click()
        await expect(page, 'login admin UI (rate-limit?)').not.toHaveURL(/\/login/, { timeout: 30_000 })
    })

    test.afterAll(async () => {
        if (admin) {
            await cleanUp().catch((e) => console.log(`DỌN lỗi: ${e}`))
            await admin.dispose()
        }
        await context?.close()
    })

    // ── hai tenant cùng ghi đè 30-1 ───────────────────────────────────────────

    test('TC-01 — hai tenant cùng ghi đè: dialog tenant 変更あり 2; 確認 nêu cả hai (theo slug); cảnh báo đổi mã chung liệt kê cả hai', async () => {
        const tenants = await openTypeTenants()
        await expect(tenants.getByRole('group', { name: '絞り込み' }).getByRole('button', { name: /^変更あり/ })).toContainText('2')
        await tenants.getByRole('button', { name: '閉じる', exact: true }).last().click()

        const d = await check('both-tenants.csv', addAndUpdate())
        await expect(d.getByRole('alert').filter({ hasText: T.willOverride })).toContainText(`${T.willOverride} ${BOTH}`)
        await closeImport()

        const w = await openChangeWarning()
        await expect(w.confirm).toContainText(`・${TENANT_SLUG}（`)
        await expect(w.confirm).toContainText(`・${OTHER_SLUG}（`)
        await cancelChangeWarning(w)
    })

    // ── tenant kia đang bảo trì ───────────────────────────────────────────────

    test('TC-02 — tenant đang bảo trì: dialog tenant, bước 確認 và cảnh báo đổi mã chung đều nêu 「確認できませんでした: slug」', async () => {
        await setMaintenance(other.tenantId, true)
        const tenants = await openTypeTenants()
        await expect(tenants).toContainText(T.unavailable)
        await expect(tenants.locator('li').filter({ hasText: OTHER_SLUG }), 'tenant không kiểm được thì không có dòng').toHaveCount(0)
        await tenants.getByRole('button', { name: '閉じる', exact: true }).last().click()

        const d = await check('maintenance.csv', addAndUpdate())
        await expect(d.getByRole('alert').filter({ hasText: T.willOverride })).toContainText(`${T.willOverride} ${TENANT_SLUG}`)
        await expect(d.getByRole('alert').filter({ hasText: T.willOverride })).not.toContainText(OTHER_SLUG)
        await expect(d.getByRole('alert').filter({ hasText: T.unavailable })).toHaveCount(1)
        await closeImport()

        const w = await openChangeWarning()
        await expect(w.confirm).toContainText(T.unchecked)
        await expect(w.confirm).not.toContainText(`・${OTHER_SLUG}（`)
        await cancelChangeWarning(w)
    })

    test('TC-03 — nhập trong lúc tenant kia bảo trì: kết quả kiểm sau khi nhập nêu tenant không kiểm được', async () => {
        const d = await check('maintenance-import.csv', addAndUpdate())
        await d.getByRole('button', { name: '取込', exact: true }).click()
        await expect(d).toContainText(T.succeeded, { timeout: IMPORT_TIMEOUT })
        await expect(d.getByRole('alert').filter({ hasText: T.unavailable })).toHaveCount(1, { timeout: IMPORT_TIMEOUT })
        await expect(d.getByRole('alert').filter({ hasText: T.overriding })).toContainText(TENANT_SLUG)
        await closeImport()
        await expect(panel().getByText(T.unavailable)).toBeVisible()
    })

    test('TC-04 — 復元 khi tenant kia còn bảo trì ⇒ 「次のテナントを確認できないため、復元できません」; hết bảo trì thì khôi phục được', async () => {
        let d = await restore()
        await expect(d).toContainText(T.refuseUnavailable, { timeout: 30_000 })
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
        expect((await sharedRows()).some((r) => r.cd_val === NEW_CD)).toBe(true)

        await setMaintenance(other.tenantId, false)
        d = await restore()
        await expect(d).toContainText(T.restoreDone, { timeout: IMPORT_TIMEOUT })
        await d.getByRole('button', { name: '閉じる', exact: true }).last().click()
        const after = await sharedRows()
        expect(after.some((r) => r.cd_val === NEW_CD)).toBe(false)
        expect(after.find((r) => r.cd_val === 1)?.sort_order).toBe(0)
    })

    // ── tenant kia đã archive ─────────────────────────────────────────────────

    test('TC-05 — tenant archived: không có trong dialog tenant, không bị nêu ở 確認 dù đang ghi đè 30-1', async () => {
        await setStatus(other.tenantId, 'archived')
        const tenants = await openTypeTenants()
        await expect(tenants.locator('li')).toHaveCount(1)
        await expect(tenants.locator('li').first()).toContainText(TENANT_SLUG)
        await expect(tenants).not.toContainText(OTHER_SLUG)
        await tenants.getByRole('button', { name: '閉じる', exact: true }).last().click()

        const d = await check('archived.csv', addAndUpdate())
        await expect(d.getByRole('alert').filter({ hasText: T.willOverride })).toContainText(`${T.willOverride} ${TENANT_SLUG}`)
        await expect(d).not.toContainText(OTHER_SLUG)
        await d.getByRole('button', { name: '取込', exact: true }).click()
        await expect(d).toContainText(T.succeeded, { timeout: IMPORT_TIMEOUT })
        await expect(d.getByRole('alert').filter({ hasText: T.overriding })).toContainText(TENANT_SLUG, { timeout: IMPORT_TIMEOUT })
        await expect(d).not.toContainText(OTHER_SLUG)
        await closeImport()
    })

    test('TC-06 — dòng thiếu trường của tenant trên mã vừa thêm: chặn 復元 khi tenant active, KHÔNG chặn khi đã archive', async () => {
        await setStatus(other.tenantId, otherStatus)
        await other.save(CD_TYPE, NEW_CD, { ...INHERIT_ALL, anyVal1: 'E2E上書き800' })

        let d = await restore()
        await expect(d).toContainText(T.refuseTenantRow, { timeout: 30_000 })
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()

        await setStatus(other.tenantId, 'archived')
        d = await restore()
        await expect(d).toContainText(T.restoreDone, { timeout: IMPORT_TIMEOUT })
        await d.getByRole('button', { name: '閉じる', exact: true }).last().click()
        expect((await sharedRows()).some((r) => r.cd_val === NEW_CD)).toBe(false)
        await setStatus(other.tenantId, otherStatus)
    })
})
