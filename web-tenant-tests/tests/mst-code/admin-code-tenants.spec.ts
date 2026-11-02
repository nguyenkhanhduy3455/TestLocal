import { type BrowserContext, type Locator, type Page, type Request, expect, test } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import { ADMIN_BASE_URL, type AdminApi, OWN_CODE, TENANT_SLUG, openAdminApi } from './_mst-code-admin'

/**
 * web-admin コードマスタ — dialog tenant theo nhóm, admin sửa mã THAY tenant, đóng dialog lúc đang kiểm tenant,
 * kiểm tra nhập ở client. Bổ sung cho admin-code-master.spec.ts. Commit 93f1e323c, 22d116b3d, d38460b95,
 * 712ca6fa0; quyền theo loại + dải mã riêng cố định từ BE 7564a9ebc (2026-10-27).
 *
 * FACT bám theo source (Rule 21) — apps/web-admin/src/features/mst-codes/:
 *  - components/mst-code-type-tenants.tsx (MstCodeTypeTenantsDialog): 「<nhóm> のテナント別データ」; nhóm nút
 *    (role=group 「絞り込み」) すべて / 変更あり kèm số; ô 「テナントを検索」 lọc slug không phân biệt hoa thường;
 *    tenant chưa đổi gì ⇒ 「共通マスタのまま」; lọc ra rỗng ⇒ 「該当するテナントはありません。」.
 *  - components/tenant-mst-code-screen.tsx: nhóm nút 「表示」 全データ / 変更のみ kèm số; dòng ghi đè đủ các trường
 *    tenant đặt được (名称1/名称2/順 — isFullOverride, ngày là của admin) có trạng thái 「全項目上書き」
 *    (mst-code-columns.tsx); dòng ẩn 「非表示（令和yy年mm月dd日〜）」 (formatWarekiFieldDate); 元に戻す LUÔN kèm câu
 *    「過去の記録も含め、このコードを使っているすべての記録が共通の名称で表示されます。」; 編集 ⇒ 「コード編集」,
 *    checkbox 「名称1 上書き」, 保存 ⇒ toast 「コードを保存しました。」; 表示 ⇒ 「表示に戻しました。」; 元に戻す ⇒
 *    「元に戻しました。」. Admin làm thay tenant theo TRẦN của nhóm (allowed), không theo quyền đã bật.
 *  - components/mst-code-form-dialog.tsx: đóng dialog trong lúc kiểm tenant (GET …/overriding-tenants) thì không ghi gì.
 *  - schemas/mst-code-form-schema.ts validateCodeForm (chạy khi bấm 保存, lỗi hiện dưới ô: #mst-code-<field>-error,
 *    không gửi request): trống ⇒ 「入力してください」; mã chung không phải số ⇒ 「0以上の整数を入力してください」; mã riêng
 *    ngoài 30000～32767 ⇒ 「30000〜32767の整数を入力してください」; 順 ⇒ 「0〜99999の整数を入力してください」;
 *    終了日 < 開始日 ⇒ 「終了日は開始日以降の日付を入力してください」. 名称1/名称2 maxLength 256. 開始日/終了日 là
 *    WarekiDateField (role=group 「開始日」/「終了日」: 元号 + 和暦年 + 月 + 日).
 *
 * DỮ LIỆU: tenant đang test, nhóm 9 職業 (trần cho cả bốn quyền): 9-1 ghi đè đủ 名称1/名称2/順, 9-2 ẩn, mã riêng
 * 30950. Tenant còn lại không đổi gì nhóm 9. afterAll xoá override; spec KHÔNG ghi mã dùng chung.
 * (Bỏ hai ca cũ: tenant ghi đè 開始日 — ngày giờ là của admin; グループ設定 đề xuất dải — dải mã riêng giờ cố định.)
 *
 * Cần TEST_ALLOW_SAVE=1, TEST_DB=1. Serial — chạy cả file:
 *   TEST_ALLOW_SAVE=1 TEST_DB=1 npx playwright test tests/mst-code/admin-code-tenants.spec.ts
 * Login: 1 UI admin (context riêng, Rule 19.2) + 1 admin API.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec ghi override của tenant')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id')

const CD_TYPE = 9
const GROUP_LABEL = '9 職業'
const CUSTOM_CD = OWN_CODE.min + 950
/** 9-1 ghi đè đủ trường, 9-2 bị ẩn, 9-3 để admin sửa thay tenant. */
const FULL_CD = 1
const HIDDEN_NAME = '教師'
const EDIT_NAME = '自営業'
const EDIT_CD = 3
const FULL_NAME = 'E2E全項目'
const ADMIN_EDIT = 'E2E管理者編集'
const RESET_NOTE = '過去の記録も含め、このコードを使っているすべての記録が共通の名称で表示されます。'
const PROBE_CD = 801

const V = {
    required: '入力してください',
    cdVal: '0以上の整数を入力してください',
    tenantCdVal: `${OWN_CODE.min}〜${OWN_CODE.max}の整数を入力してください`,
    sortOrder: '0〜99999の整数を入力してください',
    period: '終了日は開始日以降の日付を入力してください',
}

test.describe('web-admin コードマスタ — tenant theo nhóm và sửa thay tenant', () => {
    let context: BrowserContext
    let page: Page
    let admin: AdminApi
    let otherSlugs: string[]
    /** Số mã chung của nhóm 9. */
    let sharedCount: number

    const rows = (): Locator => page.getByTestId('data-row')
    const rowOf = (text: string): Locator => rows().filter({ hasText: text })
    const dialog = (title: string | RegExp): Locator => page.getByRole('dialog').filter({ hasText: title })
    const btn = (name: string | RegExp): Locator => page.getByRole('button', { name, exact: typeof name === 'string' })
    const toast = (text: string): Locator => page.getByText(text, { exact: true }).first()

    async function gotoUntilRows(path: string): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(path, { waitUntil: 'domcontentloaded' })
            try {
                await expect(rows().first()).toBeVisible({ timeout: 30_000 })
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    const openGroup = () => gotoUntilRows(`/masters/mst-code?cdType=${CD_TYPE}`)
    const openTenant = () => gotoUntilRows(`/masters/mst-code?tenant=${admin.tenantId}&cdType=${CD_TYPE}`)

    const fieldError = (form: Locator, id: string): Locator => form.locator(`#mst-code-${id}-error`)

    /** Gõ một ngày vào WarekiDateField (role=group theo nhãn ô): 元号 bằng CHUỘT như người dùng, rồi năm/tháng/ngày. */
    async function fillWareki(form: Locator, label: string, era: string, y: number, m: number, d: number): Promise<void> {
        const field = form.getByRole('group', { name: label, exact: true })
        await field.getByRole('combobox', { name: '元号' }).click()
        await page.getByRole('option', { name: era, exact: true }).click({ timeout: 5_000 })
        const two = (n: number) => String(n).padStart(2, '0')
        const cells = field.getByRole('textbox')
        await cells.nth(0).fill(two(y))
        await cells.nth(1).fill(two(m))
        await cells.nth(2).fill(two(d))
        await cells.nth(2).press('Tab')
    }

    /** Ghi lại mọi POST/PUT tới mã của nhóm 30 trong lúc `fn` chạy. */
    async function writesDuring(fn: () => Promise<void>): Promise<string[]> {
        const writes: string[] = []
        const onRequest = (r: Request) => {
            if ((r.method() === 'POST' || r.method() === 'PUT') && r.url().includes(`/mst-code/types/${CD_TYPE}/codes`))
                writes.push(`${r.method()} ${r.url()}`)
        }
        page.on('request', onRequest)
        try {
            await fn()
            await page.waitForLoadState('networkidle')
        } finally {
            page.off('request', onRequest)
        }
        return writes
    }

    async function sharedCodeExists(cdVal: number): Promise<boolean> {
        return withDb(async (c) => {
            const r = await c.query('SELECT 1 FROM master.mst_code WHERE cd_type = $1 AND cd_val = $2', [CD_TYPE, cdVal])
            return (r.rowCount ?? 0) > 0
        })
    }

    async function sharedAnyVal2(cdVal: number): Promise<string> {
        return withDb(async (c) => {
            const r = await c.query<{ any_val2: string }>(
                'SELECT any_val2 FROM master.mst_code WHERE cd_type = $1 AND cd_val = $2',
                [CD_TYPE, cdVal],
            )
            return r.rows[0]!.any_val2
        })
    }

    test.beforeAll(async ({ browser }) => {
        admin = await openAdminApi()
        otherSlugs = await withDb(async (c) => {
            const r = await c.query<{ slug: string }>(
                "SELECT slug FROM platform.tenants WHERE slug <> $1 AND status = 'active' ORDER BY slug",
                [TENANT_SLUG],
            )
            return r.rows.map((x) => x.slug)
        })
        expect(otherSlugs.length, 'cần ít nhất một tenant khác để kiểm 「共通マスタのまま」').toBeGreaterThan(0)
        sharedCount = await withDb(async (c) =>
            Number((await c.query<{ n: string }>('SELECT count(*) n FROM master.mst_code WHERE cd_type = $1', [CD_TYPE])).rows[0]!.n),
        )
        await admin.resetGroup(CD_TYPE)
        expect(await sharedCodeExists(PROBE_CD), `mã ${CD_TYPE}-${PROBE_CD} phải chưa có (lần chạy trước sót?)`).toBe(false)
        // Ngày của mã chung là của admin: gửi null (= giữ nguyên) — gửi ngày khác thì bị NOT_PERMITTED.
        await admin.save(CD_TYPE, FULL_CD, { anyVal1: FULL_NAME, anyVal2: FULL_NAME, sortOrder: 0, startDate: null, endDate: null })
        await admin.hide(CD_TYPE, 2)
        await admin.add(CD_TYPE, CUSTOM_CD, {
            anyVal1: 'E2E独自',
            anyVal2: 'E2E独自',
            sortOrder: 0,
            startDate: '1900-01-01',
            endDate: '9999-12-31',
        })

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
            await admin.resetGroup(CD_TYPE).catch((e) => console.log(`DỌN override nhóm ${CD_TYPE} lỗi: ${e}`))
            await admin.dispose()
        }
        await context?.close()
    })

    test('TC-01 — dialog tenant: すべて / 変更あり kèm số, tenant chưa đổi 「共通マスタのまま」, tìm slug không phân biệt hoa thường', async () => {
        await openGroup()
        await expect(btn(/^カスタムテナント/)).toHaveText(/カスタムテナント 1社/, { timeout: 30_000 })
        await btn(/^カスタムテナント/).click()
        const d = dialog(`${GROUP_LABEL} のテナント別データ`)
        await expect(d).toBeVisible()
        const filters = d.getByRole('group', { name: '絞り込み' })
        const all = filters.getByRole('button', { name: /^すべて/ })
        const changed = filters.getByRole('button', { name: /^変更あり/ })
        const items = d.locator('li')
        const search = d.getByLabel('テナントを検索')

        await expect(all).toHaveAttribute('aria-pressed', 'true')
        await expect(all).toContainText(String(otherSlugs.length + 1))
        await expect(changed).toContainText('1')
        await expect(items).toHaveCount(otherSlugs.length + 1)
        for (const slug of otherSlugs) await expect(items.filter({ hasText: slug })).toContainText('共通マスタのまま')
        await expect(items.filter({ hasText: TENANT_SLUG })).not.toContainText('共通マスタのまま')
        for (const header of ['変更済み', '非表示', '独自コード', '全項目上書き']) await expect(d).toContainText(header)
        await captureFixedUi(d, 'mst-code-admin-type-tenants-all')

        await changed.click()
        await expect(changed).toHaveAttribute('aria-pressed', 'true')
        await expect(items).toHaveCount(1)
        await expect(items.first()).toContainText(TENANT_SLUG)
        await search.fill(otherSlugs[0]!)
        await expect(d).toContainText('該当するテナントはありません。')
        await expect(items).toHaveCount(0)

        await all.click()
        await expect(items).toHaveCount(1)
        await expect(items.first()).toContainText(otherSlugs[0]!)
        await search.fill(TENANT_SLUG.toUpperCase())
        await expect(items).toHaveCount(1)
        await expect(items.first()).toContainText(TENANT_SLUG)
        await search.fill('zzz-không-có')
        await expect(d).toContainText('該当するテナントはありません。')

        await search.fill('')
        await d.getByRole('button').filter({ hasText: TENANT_SLUG }).click()
        await expect(d).toBeHidden()
        await expect(page.getByRole('heading', { name: `コードマスタ（${TENANT_SLUG}）` })).toBeVisible({ timeout: 30_000 })
    })

    test('TC-02 — màn tenant: 全データ / 変更のみ kèm số; dòng ghi đè đủ trường là 「全項目上書き」, 元に戻す kèm câu 「過去の記録も含め…」', async () => {
        const views = page.getByRole('group', { name: '表示' })
        await expect(views.getByRole('button', { name: /^全データ/ })).toContainText(String(sharedCount + 1))
        await expect(views.getByRole('button', { name: /^変更のみ/ })).toContainText('3')
        await expect(rowOf(FULL_NAME)).toContainText('全項目上書き')
        await expect(rowOf(HIDDEN_NAME)).toContainText(/非表示（令和\d{2}年\d{2}月\d{2}日〜）/)

        await views.getByRole('button', { name: /^変更のみ/ }).click()
        await expect(rows()).toHaveCount(3)
        await expect(rowOf(EDIT_NAME)).toHaveCount(0)
        await views.getByRole('button', { name: /^全データ/ }).click()
        await expect(rows()).toHaveCount(sharedCount + 1)

        await rowOf(FULL_NAME).click()
        await btn('元に戻す').click()
        const confirm = dialog(/上書きを削除し、共通の値に戻します/)
        await expect(confirm).toContainText(`「${CD_TYPE}-${FULL_CD} ${FULL_NAME}」の上書きを削除し、共通の値に戻します。`)
        await expect(confirm).toContainText(RESET_NOTE)
        await captureFixedUi(confirm, 'mst-code-admin-reset-full')
        await confirm.getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(confirm).toBeHidden()
        await expect(rowOf(FULL_NAME)).toContainText('全項目上書き')
    })

    test('TC-03 — admin sửa thay tenant: 編集 tick 名称1 上書き ⇒ 変更済み; 元に戻す (cũng kèm câu 過去の記録) ⇒ 共通', async () => {
        await rowOf(EDIT_NAME).click()
        await btn('編集').click()
        const form = dialog('コード編集')
        await expect(form).toBeVisible()
        await expect(form).toContainText('上書きにチェックした項目だけ、テナントの値を使います。')
        await expect(form.locator('#mst-code-anyVal1')).toBeDisabled()
        await form.getByRole('checkbox', { name: '名称1 上書き' }).check()
        await form.locator('#mst-code-anyVal1').fill(ADMIN_EDIT)
        await form.getByRole('button', { name: '保存', exact: true }).click()
        await expect(toast('コードを保存しました。')).toBeVisible({ timeout: 30_000 })
        await expect(form).toBeHidden()
        await expect(rowOf(ADMIN_EDIT)).toContainText('変更済み')
        const saved = (await admin.tenantCodes(CD_TYPE)).find((c) => c.cdVal === EDIT_CD)
        expect(saved).toMatchObject({ anyVal1: ADMIN_EDIT, status: 'overridden' })

        await rowOf(ADMIN_EDIT).click()
        await btn('元に戻す').click()
        const confirm = dialog(/上書きを削除し、共通の値に戻します/)
        // Một mã có một tên cho mọi ngày ⇒ câu này giờ hiện ở MỌI lần 元に戻す, không chỉ dòng ghi đè đủ trường.
        await expect(confirm).toContainText(RESET_NOTE)
        await confirm.getByRole('button', { name: '元に戻す', exact: true }).click()
        await expect(toast('元に戻しました。')).toBeVisible({ timeout: 30_000 })
        await expect(rowOf(EDIT_NAME)).toContainText('共通')
    })

    test('TC-04 — admin hiện lại mã tenant đã ẩn: 表示 ⇒ 「表示に戻しました。」, dòng về 共通', async () => {
        await rowOf(HIDDEN_NAME).click()
        await expect(btn('表示')).toBeEnabled()
        await btn('表示').click()
        await expect(toast('表示に戻しました。')).toBeVisible({ timeout: 30_000 })
        await expect(rowOf(HIDDEN_NAME)).toContainText('共通')
        await expect(btn('非表示')).toBeEnabled()
        expect((await admin.tenantCodes(CD_TYPE)).find((c) => c.cdVal === 2)?.status).toBe('shared')
    })

    test('TC-06 — đóng dialog trong lúc đang kiểm tenant ⇒ không ghi mã dùng chung khi kết quả kiểm về', async () => {
        const before = await sharedAnyVal2(EDIT_CD)
        const checkUrl = `**/api/admin/mst-code/types/${CD_TYPE}/codes/${EDIT_CD}/overriding-tenants`
        let release!: () => void
        const held = new Promise<void>((resolve) => (release = resolve))
        await page.route(checkUrl, async (route) => {
            await held
            await route.continue()
        })
        const writes: Request[] = []
        const onRequest = (r: Request) => {
            if (r.method() === 'PUT' && new URL(r.url()).pathname.endsWith(`/api/admin/mst-code/types/${CD_TYPE}/codes/${EDIT_CD}`))
                writes.push(r)
        }
        page.on('request', onRequest)
        try {
            await openGroup()
            await rowOf(EDIT_NAME).dblclick()
            const form = dialog('コード編集')
            await form.locator('#mst-code-anyVal2').fill('E2E閉じる')
            const checkRequest = page.waitForRequest((r) => r.url().includes(`/codes/${EDIT_CD}/overriding-tenants`))
            await form.getByRole('button', { name: '保存', exact: true }).click()
            await checkRequest
            await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
            await expect(form).toBeHidden()

            const checkResponse = page.waitForResponse((r) => r.url().includes(`/codes/${EDIT_CD}/overriding-tenants`))
            release()
            await checkResponse
            await page.waitForLoadState('networkidle')
            expect(writes, 'dialog đã đóng mà vẫn gửi PUT mã dùng chung').toHaveLength(0)
            await expect(dialog('共通コードの変更')).toHaveCount(0)
            expect(await sharedAnyVal2(EDIT_CD)).toBe(before)
        } finally {
            release()
            page.off('request', onRequest)
            await page.unroute(checkUrl)
        }
    })

    test('TC-08 — 追加 mã dùng chung: lỗi client hiện dưới từng ô, KHÔNG gửi request; 名称 maxLength 256', async () => {
        await openGroup()
        const writes = await writesDuring(async () => {
            await btn('追加').click()
            const form = dialog('コード追加')
            await expect(form).toBeVisible()
            await expect(form.locator('#mst-code-anyVal1')).toHaveAttribute('maxlength', '256')
            await expect(form.locator('#mst-code-anyVal2')).toHaveAttribute('maxlength', '256')

            await form.locator('#mst-code-sortOrder').fill('x')
            await form.getByRole('button', { name: '保存', exact: true }).click()
            await expect(fieldError(form, 'cd-val')).toHaveText(V.required)
            await expect(fieldError(form, 'anyVal1')).toHaveText(V.required)
            await expect(fieldError(form, 'anyVal2'), '名称2 được để trống').toHaveCount(0)
            await expect(fieldError(form, 'sortOrder')).toHaveText(V.sortOrder)
            await captureFixedUi(form, 'mst-code-admin-add-validation')

            await form.locator('#mst-code-cd-val').fill('a')
            await form.locator('#mst-code-anyVal1').fill('E2E検査')
            await form.locator('#mst-code-sortOrder').fill('0')
            await form.getByRole('button', { name: '保存', exact: true }).click()
            await expect(fieldError(form, 'cd-val')).toHaveText(V.cdVal)
            await expect(fieldError(form, 'sortOrder')).toHaveCount(0)
            await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
            await expect(form).toBeHidden()
        })
        expect(writes, 'lỗi client mà vẫn gửi request').toEqual([])
    })

    test('TC-09 — 追加 mã riêng trên màn tenant: mã ngoài 30000～32767 ⇒ 「30000〜32767の整数を入力してください」, không gửi request', async () => {
        await openTenant()
        const writes = await writesDuring(async () => {
            await btn('追加').click()
            const form = dialog('独自コード追加')
            await expect(form).toBeVisible()
            await form.locator('#mst-code-anyVal1').fill('E2E検査')
            for (const typed of ['0', String(OWN_CODE.min - 1), String(OWN_CODE.max + 1)]) {
                await form.locator('#mst-code-cd-val').fill(typed)
                await form.getByRole('button', { name: '保存', exact: true }).click()
                await expect(fieldError(form, 'cd-val')).toHaveText(V.tenantCdVal)
            }
            await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
            await expect(form).toBeHidden()
        })
        expect(writes, 'lỗi client mà vẫn gửi request').toEqual([])
    })

    test('TC-10 — 追加 mã dùng chung, đóng dialog trong lúc đang kiểm tenant ⇒ không thêm khi kết quả kiểm về', async () => {
        const checkUrl = `**/api/admin/mst-code/types/${CD_TYPE}/codes/${PROBE_CD}/overriding-tenants`
        let release!: () => void
        const held = new Promise<void>((resolve) => (release = resolve))
        await page.route(checkUrl, async (route) => {
            await held
            await route.continue()
        })
        try {
            await openGroup()
            const writes = await writesDuring(async () => {
                await btn('追加').click()
                const form = dialog('コード追加')
                await form.locator('#mst-code-cd-val').fill(String(PROBE_CD))
                await form.locator('#mst-code-anyVal1').fill('E2E閉じる')
                const checkRequest = page.waitForRequest((r) => r.url().includes(`/codes/${PROBE_CD}/overriding-tenants`))
                await form.getByRole('button', { name: '保存', exact: true }).click()
                await checkRequest
                await form.getByRole('button', { name: 'キャンセル', exact: true }).click()
                await expect(form).toBeHidden()
                const checkResponse = page.waitForResponse((r) => r.url().includes(`/codes/${PROBE_CD}/overriding-tenants`))
                release()
                await checkResponse
            })
            expect(writes, 'dialog đã đóng mà vẫn gửi POST thêm mã dùng chung').toEqual([])
            await expect(dialog('共通コードの追加')).toHaveCount(0)
            expect(await sharedCodeExists(PROBE_CD)).toBe(false)
        } finally {
            release()
            await page.unroute(checkUrl)
        }
    })

    // ── Lỗi app — để cuối file để serial không bỏ ca khác ──────────────────────
    //
    // web-admin Dialog là <dialog> gốc mở bằng showModal() (shared/ui/dialog.tsx:78) ⇒ nằm ở TOP LAYER. Danh sách
    // 元号 của WarekiDateField là Radix SelectContent portal ra <body> (web-ui primitives/select.tsx:43, z-[9999]
    // không thắng được top layer) ⇒ mở ra NẰM DƯỚI dialog, bị inert: không bấm được 元号 nào. Hệ quả: trong
    // コード追加 / コード編集 / 独自コード追加, 開始日 kẹt ở 明治 (mặc định 1900-01-01), 終了日 kẹt ở 令和.

    test('TC-11 — [lỗi app] コード追加: chọn 元号 của 開始日/終了日 bằng chuột ⇒ 終了日 < 開始日 báo 「終了日は開始日以降…」', async () => {
        await openGroup()
        await btn('追加').click()
        const form = dialog('コード追加')
        await expect(form).toBeVisible()
        try {
            await form.locator('#mst-code-cd-val').fill(String(PROBE_CD))
            await form.locator('#mst-code-anyVal1').fill('E2E検査')
            await fillWareki(form, '開始日', '平成', 13, 1, 1)
            await fillWareki(form, '終了日', '平成', 12, 1, 1)
            await form.getByRole('button', { name: '保存', exact: true }).click()
            await expect(fieldError(form, 'endDate')).toHaveText(V.period)
        } finally {
            await captureFixedUi(page, 'mst-code-admin-era-list-under-dialog')
            await page.keyboard.press('Escape')
            await form.getByRole('button', { name: 'キャンセル', exact: true }).click().catch(() => {})
        }
        expect(await sharedCodeExists(PROBE_CD)).toBe(false)
    })
})
