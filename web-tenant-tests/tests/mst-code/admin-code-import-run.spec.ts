import { type BrowserContext, type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import { ADMIN_BASE_URL, type AdminApi, type CodeFields, INHERIT_ALL, TENANT_SLUG, openAdminApi } from './_mst-code-admin'

/**
 * web-admin コードマスタ → ≪CSV入出力≫ — NHẬP THẬT rồi 復元 (khôi phục) mã dùng chung.
 * Nối tiếp admin-code-import.spec.ts (spec đó chỉ dừng ở bước 確認). Commit bdbd718ee, 92d44dc67,
 * 174809b0a, d38460b95 (nhánh feature/mst-cod-shared-override, merge dev ccf611752).
 *
 * FACT bám theo source (Rule 21):
 *  - api MstCodeImportPlanner.cs — lỗi từng dòng 「行番号 n: …」:
 *      sort_order ngoài 0～99999 ⇒ 「sort_order が0～99999の整数ではありません。」
 *      ngày sai dạng ⇒ 「start_date が yyyy-MM-dd（または yyyy/M/d）形式の日付ではありません。」 (yyyy/M/d hợp lệ)
 *      ngày < 1900 ⇒ 「start_date と end_date は1900-01-01以降にしてください。」
 *      start > end ⇒ 「start_date が end_date より後です。」; any_val1 > 256 ⇒ 「any_val1 が256文字を超えています。」
 *  - CheckAdminMasterImportHandler.DryRunCodeAsync: 確認結果 = 総レコード数 / 追加 / 更新 / 変更なし; tenant có
 *    override trên khoá bị thêm/sửa ⇒ 「次のテナントでは独自の値が優先され、取込む共通コードは反映されません: slug」;
 *    mã bị sửa ⇒ 「更新されるコード（区分/コード）: 30/1」 (import-dialog.tsx CheckResult).
 *  - AdminMasterImportRunner: nhập xong ⇒ 「取込が完了しました。」 + số đếm; kiểm tenant sau khi nhập ⇒
 *    「次のテナントでは独自の値が優先され、取込んだ共通コードは反映されていません: slug」 (tenant-check-notes.tsx).
 *    Bản master đổi giữa 確認 và 取込 ⇒ job failed 「確認後にマスタが更新されました。もう一度確認してください。」
 *    + gợi ý 「確認後にマスタが変更されました。ファイルを選び直して、もう一度確認してください。」.
 *  - restore-dialog.tsx: 「コードマスタの復元」, ô #master-restore-confirm phải gõ đúng tên bảng 「mst_code」 thì
 *    「復元する」 mới bật; xong ⇒ 「復元が完了しました。」.
 *  - MasterImportRestoreGuard.cs — từ chối khôi phục (hiện ngay trong dialog, job không được xếp hàng):
 *      tenant có dòng thiếu trường trên mã do lần nhập THÊM ⇒
 *        「取込で追加したコードを次のテナントが変更または非表示にしているため、復元できません: slug」
 *      master.mst_code bị sửa (updated_at) sau lúc nhập xong ⇒
 *        「取込後にコードマスタが画面から更新されたため、この取込は復元できません。」
 *      job không có created_keys (lần nhập trước khi có cột) ⇒ 「この取込には追加したコードの記録がないため、復元できません。」
 *  - RestoreAdminMasterImportHandler.cs: đã có lần nhập thành công MỚI HƠN ⇒ 422
 *    「このテーブルにはより新しい取込があるため、この取込は復元できません。」 (UI không có nút 復元 cho lần cũ ⇒ gọi API).
 *  - Nhập / khôi phục xong thì xoá cache mã của MỌI tenant (MstCodeTenantFanOut.InvalidateAllAsync) ⇒ màn コード設定
 *    của tenant thấy ngay mã mới / mất mã đã gỡ, không phải chờ cache hết hạn.
 *
 * FILE CSV: không có thư viện mã hoá Shift_JIS trong project ⇒ lấy dòng Shift_JIS của chính bản CSV出力 (nhóm 30)
 * rồi thay phần đuôi ASCII (sort_order, ngày). Mã mới 30-800 dùng tên ASCII.
 *
 * GHI THẬT vào master.mst_code (dùng chung mọi tenant, DB dev): thêm 30-800, sửa sort_order 30-1 / 30-2. Lần
 * khôi phục thành công đưa 30-800 + 30-1 về như cũ; 30-2 được trả bằng admin API. afterAll dọn mọi thứ còn sót
 * (30-800 bằng SQL nếu khôi phục chưa chạy) và xoá override của tenant. CSV 8 cột (thêm hidden, BE 7564a9ebc).
 *
 * Testcase nối tiếp trạng thái (serial) — chạy cả file:
 *   TEST_ALLOW_SAVE=1 TEST_DB=1 npx playwright test tests/mst-code/admin-code-import-run.spec.ts
 * Login: 1 UI admin (context riêng, Rule 19.2) + 1 admin API + authedPage (màn コード設定 của tenant).
 */

test.describe.configure({ mode: 'serial', timeout: 300_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec nhập thật vào mã dùng chung')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để soi master.mst_code')

const CD_TYPE = 30
const NEW_CD = 800
const TABLE = 'mst_code'
const HEADER = 'cd_type,cd_val,any_val1,any_val2,sort_order,start_date,end_date,hidden'
/** Kỳ mở + hidden = 0 — đuôi ASCII của mọi dòng 30-x trong bản CSV出力. */
const FULL_PERIOD = ',1900-01-01,9999-12-31,0'
const IMPORT_TIMEOUT = 180_000

const T = {
    willOverride: '次のテナントでは独自の値が優先され、取込む共通コードは反映されません:',
    overriding: '次のテナントでは独自の値が優先され、取込んだ共通コードは反映されていません:',
    succeeded: '取込が完了しました。',
    failed: '取込に失敗しました。',
    changedAfterCheck: '確認後にマスタが更新されました。もう一度確認してください。',
    recheckHint: '確認後にマスタが変更されました。ファイルを選び直して、もう一度確認してください。',
    restoreDone: '復元が完了しました。',
    refuseTenantRow: '取込で追加したコードを次のテナントが変更または非表示にしているため、復元できません:',
    refuseScreenEdit: '取込後にコードマスタが画面から更新されたため、この取込は復元できません。',
    refuseNoKeys: 'この取込には追加したコードの記録がないため、復元できません。',
    refuseNewer: 'このテーブルにはより新しい取込があるため、この取込は復元できません。',
}

interface SharedRow {
    cd_val: number
    any_val1: string
    any_val2: string
    sort_order: number
}

const ascii = (s: string) => Buffer.from(s, 'ascii')
const CRLF = ascii('\r\n')

/** Ghép các dòng (Buffer Shift_JIS hoặc chuỗi ASCII) thành một file CRLF. */
function csv(lines: (Buffer | string)[]): Buffer {
    return Buffer.concat(lines.flatMap((l) => [typeof l === 'string' ? ascii(l) : l, CRLF]))
}

/** Dòng Shift_JIS của mã `cdVal` trong bản xuất, với sort_order đổi thành `sortOrder`. */
function withSortOrder(exported: Buffer, cdVal: number, sortOrder: number): Buffer {
    const prefix = ascii(`${CD_TYPE},${cdVal},`)
    const lines: Buffer[] = []
    for (let start = 0; start < exported.length; ) {
        const end = exported.indexOf(CRLF, start)
        lines.push(exported.subarray(start, end === -1 ? exported.length : end))
        start = end === -1 ? exported.length : end + 2
    }
    const line = lines.find((l) => l.subarray(0, prefix.length).equals(prefix))
    expect(line, `bản CSV出力 không có dòng ${CD_TYPE}-${cdVal}`).toBeTruthy()
    const tail = ascii(`,0${FULL_PERIOD}`)
    const at = line!.lastIndexOf(tail)
    expect(at, `dòng ${CD_TYPE}-${cdVal} không kết thúc bằng 「,0${FULL_PERIOD}」`).toBe(line!.length - tail.length)
    return Buffer.concat([line!.subarray(0, at), ascii(`,${sortOrder}${FULL_PERIOD}`)])
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

test.describe('web-admin コードマスタ — nhập thật, kiểm tenant và 復元', () => {
    let context: BrowserContext
    let page: Page
    let tenantPage: Page
    let admin: AdminApi
    /** 30-0..2 trước khi chạy — để trả lại mã dùng chung ở afterAll. */
    let originalRows: SharedRow[]
    let exported: Buffer

    const importDialog = (): Locator => page.getByRole('dialog').filter({ hasText: 'コードマスタの取込' })
    const restoreDialog = (): Locator => page.getByRole('dialog').filter({ hasText: 'コードマスタの復元' })
    const panel = (): Locator => page.getByRole('region', { name: 'CSV入出力' })
    const resultValue = (label: string): Locator =>
        importDialog().locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd[1]')

    async function openScreen(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/masters/mst-code?cdType=${CD_TYPE}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByTestId('data-row').first()).toBeVisible({ timeout: 30_000 })
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    /** Mở 取込, chọn file, 確認; trả về khi job kiểm tra xong (lỗi hoặc sẵn sàng nhập). */
    async function check(name: string, buffer: Buffer): Promise<Locator> {
        await openScreen()
        await panel().getByRole('button', { name: '取込', exact: true }).click()
        const d = importDialog()
        await expect(d).toBeVisible()
        await d.locator('#master-import-files').setInputFiles({ name, mimeType: 'text/csv', buffer })
        await expect(d).toContainText(name)
        await d.getByRole('button', { name: '確認', exact: true }).click()
        const checkAgain = d.getByRole('button', { name: '確認', exact: true })
        const repick = d.getByRole('button', { name: 'ファイルを選び直す', exact: true })
        await expect
            // 確認 có thể biến mất giữa isVisible và isEnabled (job vừa xong) ⇒ isEnabled chờ ngắn, mất thì coi là chưa.
            .poll(async () => (await repick.isVisible()) || (await checkAgain.isEnabled({ timeout: 500 }).catch(() => false)), {
                timeout: 60_000,
            })
            .toBe(true)
        return d
    }

    async function closeImport(): Promise<void> {
        await importDialog().getByRole('button', { name: /^(キャンセル|閉じる)$/ }).last().click()
        await expect(importDialog()).toBeHidden()
    }

    /** Nhập một file đúng: 確認 → 取込 → chờ 「取込が完了しました。」. */
    async function importFile(name: string, buffer: Buffer): Promise<Locator> {
        const d = await check(name, buffer)
        await d.getByRole('button', { name: '取込', exact: true }).click()
        await expect(d).toContainText(T.succeeded, { timeout: IMPORT_TIMEOUT })
        return d
    }

    /** Màn コード設定 của tenant, nhóm 30 (goto mới ⇒ đọc lại từ API, qua cache mã của tenant). */
    async function openTenantGroup(): Promise<Locator> {
        for (let attempt = 1; ; attempt++) {
            await tenantPage.goto('/masters/code', { waitUntil: 'domcontentloaded' })
            try {
                await expect(tenantPage.getByRole('heading', { name: 'コ ー ド 設 定' })).toBeVisible({ timeout: 30_000 })
                break
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
        await tenantPage.getByLabel('グループ').selectOption(String(CD_TYPE))
        const root = tenantPage.locator('.animate-fade-in').first()
        await expect(root.locator('[data-testid="row-0"]')).toBeVisible({ timeout: 30_000 })
        return root
    }

    /** Job nhập mã thành công mới nhất (id, created_keys). */
    async function latestSucceededJob(): Promise<{ id: string; created_keys: unknown }> {
        return withDb(async (c) => {
            const r = await c.query<{ id: string; created_keys: unknown }>(
                "SELECT id, created_keys FROM platform.master_import_job WHERE kind = 'code' AND status = 'succeeded' ORDER BY finished_at DESC LIMIT 1",
            )
            return r.rows[0]!
        })
    }

    async function openRestore(): Promise<Locator> {
        await openScreen()
        const button = panel().getByRole('button', { name: '復元', exact: true })
        await expect(button, 'lần nhập mới nhất phải còn khôi phục được (restorable)').toBeVisible({ timeout: 30_000 })
        await button.click()
        await expect(restoreDialog()).toBeVisible()
        return restoreDialog()
    }

    /** Đưa mã dùng chung + override của tenant về như trước khi chạy (dùng cả trước lẫn sau). */
    async function cleanUp(): Promise<void> {
        const leftover = await withDb(async (c) => {
            const r = await c.query('DELETE FROM master.mst_code WHERE cd_type = $1 AND cd_val = $2', [CD_TYPE, NEW_CD])
            return r.rowCount ?? 0
        })
        if (leftover > 0) console.log(`DỌN: xoá ${CD_TYPE}-${NEW_CD} bằng SQL (lần khôi phục chưa chạy)`)
        const now = await sharedRows()
        for (const before of originalRows) {
            const cur = now.find((r) => r.cd_val === before.cd_val)
            if (cur && (cur.sort_order !== before.sort_order || cur.any_val1 !== before.any_val1 || cur.any_val2 !== before.any_val2)) {
                await admin.saveShared(CD_TYPE, before.cd_val, fieldsOf(before))
            }
        }
        await admin.resetGroup(CD_TYPE)
    }

    test.beforeAll(async ({ browser, authedPage }) => {
        tenantPage = authedPage
        admin = await openAdminApi()
        originalRows = (await sharedRows()).filter((r) => r.cd_val <= 2)
        expect(originalRows.map((r) => r.sort_order), 'mã 30-0..2 phải có sort_order 0 như bản gốc').toEqual([0, 0, 0])
        await cleanUp()
        // Tenant đang test ghi đè 名称1 của 30-1 ⇒ lần nhập sửa 30-1 phải nêu tên tenant.
        await admin.save(CD_TYPE, 1, { ...INHERIT_ALL, anyVal1: 'E2E取込前上書き' })
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
            await cleanUp().catch((e) => console.log(`DỌN mã nhóm ${CD_TYPE} lỗi: ${e}`))
            await admin.dispose()
        }
        await context?.close()
        if (tenantPage) await releaseSharedPage(tenantPage)
    })

    test('TC-01 — 確認 báo lỗi từng dòng: sort_order, dạng ngày, ngày < 1900, start > end, any_val1 > 256', async () => {
        const d = await check(
            'row-errors.csv',
            csv([
                HEADER,
                `30,801,a,a,100000${FULL_PERIOD}`,
                '30,802,a,a,0,2026.1.1,9999-12-31,0',
                '30,803,a,a,0,1899-12-31,9999-12-31,0',
                '30,804,a,a,0,2000-01-02,2000-01-01,0',
                `30,805,${'a'.repeat(257)},a,0${FULL_PERIOD}`,
            ]),
        )
        // Lỗi dòng đến từ phản hồi lỗi của bước 確認 (không qua job) ⇒ không kèm dòng 「確認に失敗しました」.
        await expect(d).toContainText('行番号 2: sort_order が0～99999の整数ではありません。')
        await expect(d).toContainText('行番号 3: start_date が yyyy-MM-dd（または yyyy/M/d）形式の日付ではありません。')
        await expect(d).toContainText('行番号 4: start_date と end_date は1900-01-01以降にしてください。')
        await expect(d).toContainText('行番号 5: start_date が end_date より後です。')
        await expect(d).toContainText('行番号 6: any_val1 が256文字を超えています。')
        await closeImport()
    })

    test('TC-02 — 確認 file hợp lệ (ngày yyyy/M/d): 追加 1 / 更新 1, nêu mã sửa 30/1 và tenant đang ghi đè', async () => {
        // Tenant đọc nhóm 30 TRƯỚC khi nhập ⇒ cache mã của tenant đã có bản cũ; TC-03b mới chứng minh được cache bị xoá.
        await expect((await openTenantGroup()).locator(`[data-testid="row-${NEW_CD}"]`)).toHaveCount(0)
        const d = await check(
            'add-and-update.csv',
            csv([HEADER, withSortOrder(exported, 1, 5), `30,${NEW_CD},E2E-IMPORT,E2E-IMPORT,0,1900/1/1,9999/12/31,0`]),
        )
        await expect(d).toContainText('確認結果')
        await expect(resultValue('総レコード数')).toHaveText('2')
        await expect(resultValue('追加')).toHaveText('1')
        await expect(resultValue('更新')).toHaveText('1')
        await expect(resultValue('変更なし')).toHaveText('0')
        await expect(d).toContainText('更新されるコード（区分/コード）: 30/1')
        await expect(d.getByRole('alert').filter({ hasText: T.willOverride })).toContainText(TENANT_SLUG)
        await expect(d.getByRole('button', { name: '取込', exact: true })).toBeEnabled()
        await captureFixedUi(d, 'mst-code-import-ready')
    })

    test('TC-03 — 取込: hoàn tất, kiểm tenant sau khi nhập nêu tenant ghi đè; DB có 30-800, 30-1 sort_order = 5', async () => {
        const d = importDialog()
        await d.getByRole('button', { name: '取込', exact: true }).click()
        await expect(d).toContainText(T.succeeded, { timeout: IMPORT_TIMEOUT })
        await expect(d).toContainText('取込 1件')
        await expect(d).toContainText('更新 1件')
        await expect(d.getByRole('alert').filter({ hasText: T.overriding })).toContainText(TENANT_SLUG, {
            timeout: IMPORT_TIMEOUT,
        })
        await captureFixedUi(d, 'mst-code-import-succeeded')
        await closeImport()

        const rows = await sharedRows()
        expect(rows.find((r) => r.cd_val === NEW_CD)).toMatchObject({ any_val1: 'E2E-IMPORT', sort_order: 0 })
        expect(rows.find((r) => r.cd_val === 1)?.sort_order).toBe(5)
        await expect(panel()).toContainText('成功')
        await expect(panel().getByRole('button', { name: '復元', exact: true })).toBeVisible()
    })

    test('TC-03b — tenant thấy ngay mã vừa nhập: コード設定 có dòng 30-800 「E2E-IMPORT」 trạng thái 共通', async () => {
        const root = await openTenantGroup()
        const added = root.locator(`[data-testid="row-${NEW_CD}"]`)
        await expect(added).toBeVisible()
        await expect(added).toContainText('E2E-IMPORT')
        await expect(added).toContainText('共通')
    })

    test('TC-03c — job không có created_keys ⇒ 復元 bị từ chối 「この取込には追加したコードの記録がないため…」', async () => {
        const job = await latestSucceededJob()
        await withDb((c) => c.query('UPDATE platform.master_import_job SET created_keys = NULL WHERE id = $1', [job.id]))
        try {
            const d = await openRestore()
            await d.locator('#master-restore-confirm').fill(TABLE)
            await d.getByRole('button', { name: '復元する' }).click()
            await expect(d).toContainText(T.refuseNoKeys, { timeout: 30_000 })
            await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
            await expect(d).toBeHidden()
        } finally {
            await withDb((c) =>
                c.query('UPDATE platform.master_import_job SET created_keys = $2::jsonb WHERE id = $1', [
                    job.id,
                    JSON.stringify(job.created_keys),
                ]),
            )
        }
        expect((await sharedRows()).some((r) => r.cd_val === NEW_CD), 'bị từ chối thì 30-800 vẫn còn').toBe(true)
    })

    test('TC-04 — 復元 bị từ chối khi tenant ghi đè thiếu trường trên mã vừa THÊM (30-800)', async () => {
        await admin.save(CD_TYPE, NEW_CD, { ...INHERIT_ALL, anyVal1: 'E2E上書き800' })
        const d = await openRestore()
        await expect(d).toContainText(TABLE)
        await d.locator('#master-restore-confirm').fill(TABLE)
        await d.getByRole('button', { name: '復元する' }).click()
        await expect(d).toContainText(T.refuseTenantRow, { timeout: 30_000 })
        await expect(d).toContainText(TENANT_SLUG)
        await captureFixedUi(d, 'mst-code-restore-refused-tenant')
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(d).toBeHidden()
        expect((await sharedRows()).some((r) => r.cd_val === NEW_CD), 'bị từ chối thì 30-800 vẫn còn').toBe(true)
        await admin.reset(CD_TYPE, NEW_CD)
    })

    test('TC-05 — 復元: gõ sai tên bảng thì nút mờ; đúng 「mst_code」 ⇒ 復元が完了しました, DB về như trước khi nhập', async () => {
        const d = await openRestore()
        const confirm = d.getByRole('button', { name: '復元する' })
        await d.locator('#master-restore-confirm').fill('mst_cod')
        await expect(confirm).toBeDisabled()
        await d.locator('#master-restore-confirm').fill(` ${TABLE} `)
        await expect(confirm, 'khoảng trắng hai đầu được bỏ qua (matchesConfirmTable)').toBeEnabled()
        await confirm.click()
        await expect(d).toContainText(T.restoreDone, { timeout: IMPORT_TIMEOUT })
        await d.getByRole('button', { name: '閉じる', exact: true }).last().click()
        await expect(d).toBeHidden()

        const rows = await sharedRows()
        expect(rows.some((r) => r.cd_val === NEW_CD), 'mã do lần nhập thêm phải biến mất').toBe(false)
        expect(rows.find((r) => r.cd_val === 1)?.sort_order).toBe(0)
        await expect(panel()).toContainText('復元済み', { timeout: 30_000 })
    })

    test('TC-05b — sau 復元 tenant thấy ngay: コード設定 không còn dòng 30-800', async () => {
        const root = await openTenantGroup()
        await expect(root.locator(`[data-testid="row-${NEW_CD}"]`)).toHaveCount(0)
        await expect(root.locator('[data-testid="row-1"]')).toBeVisible()
    })

    test('TC-06 — sửa mã dùng chung SAU khi nhập ⇒ 復元 bị từ chối 「取込後にコードマスタが画面から更新されたため…」', async () => {
        await importFile('update-2.csv', csv([HEADER, withSortOrder(exported, 2, 7)]))
        await closeImport()
        expect((await sharedRows()).find((r) => r.cd_val === 2)?.sort_order).toBe(7)
        // Sửa như màn admin (PUT mã dùng chung) — trả 30-2 về bản gốc luôn.
        await admin.saveShared(CD_TYPE, 2, fieldsOf(originalRows.find((r) => r.cd_val === 2)!))

        const d = await openRestore()
        await d.locator('#master-restore-confirm').fill(TABLE)
        await d.getByRole('button', { name: '復元する' }).click()
        await expect(d).toContainText(T.refuseScreenEdit, { timeout: 30_000 })
        await d.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(d).toBeHidden()
    })

    test('TC-06b — đã có lần nhập mới hơn ⇒ API từ chối khôi phục lần cũ; khôi phục lần mới nhất qua UI thì được', async () => {
        const older = await latestSucceededJob()
        await importFile('update-2-again.csv', csv([HEADER, withSortOrder(exported, 2, 7)]))
        await closeImport()
        const newer = await latestSucceededJob()
        expect(newer.id).not.toBe(older.id)

        const res = await admin.ctx.post(`api/admin/master-imports/jobs/${older.id}/restore`, {
            data: { confirmTable: TABLE },
        })
        expect(res.status(), 'khôi phục lần nhập cũ phải bị từ chối').toBeGreaterThanOrEqual(400)
        expect(await res.text()).toContain(T.refuseNewer)

        const d = await openRestore()
        await expect(d, 'nút 復元 của màn luôn trỏ lần nhập mới nhất').toContainText(TABLE)
        await d.locator('#master-restore-confirm').fill(TABLE)
        await d.getByRole('button', { name: '復元する' }).click()
        await expect(d).toContainText(T.restoreDone, { timeout: IMPORT_TIMEOUT })
        await d.getByRole('button', { name: '閉じる', exact: true }).last().click()
        expect((await sharedRows()).find((r) => r.cd_val === 2)?.sort_order).toBe(0)
    })

    test('TC-07 — master đổi giữa 確認 và 取込 ⇒ 取込に失敗しました + 「確認後にマスタが更新されました」 + gợi ý chọn lại file', async () => {
        const d = await check('stale.csv', csv([HEADER, withSortOrder(exported, 2, 7)]))
        await expect(resultValue('更新')).toHaveText('1')
        const before = originalRows.find((r) => r.cd_val === 2)!
        await admin.saveShared(CD_TYPE, 2, { ...fieldsOf(before), sortOrder: 3 })
        try {
            await d.getByRole('button', { name: '取込', exact: true }).click()
            await expect(d).toContainText(T.failed, { timeout: IMPORT_TIMEOUT })
            await expect(d).toContainText(T.changedAfterCheck)
            await expect(d).toContainText(T.recheckHint)
            await expect(d.getByRole('button', { name: 'ファイルを選び直す', exact: true })).toBeVisible()
            expect((await sharedRows()).find((r) => r.cd_val === 2)?.sort_order, 'lần nhập hỏng không được ghi gì').toBe(3)
        } finally {
            await admin.saveShared(CD_TYPE, 2, fieldsOf(before))
        }
        await closeImport()
    })
})
