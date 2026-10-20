import {
    type APIRequestContext,
    type Browser,
    type Locator,
    type Page,
    request as pwRequest,
} from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { DB_SCHEMA, dbEnabled, withDb } from '../_shared/db'
import { newTestPage } from '../_shared/entry'
import { BASE_URL } from '../_shared/env'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { ADMIN_USER, JA } from '../_shared/test-data'

/**
 * ロールマスタ + permission — luồng đầy đủ, từ lúc admin tạo role tới lúc người
 * giữ role bị chặn thật ở FE lẫn BE.
 *
 * role-master-screens.spec.ts chỉ kiểm khung màn hình (header, chọn nhanh, trùng
 * mã/tên) và KHÔNG lưu gì. File này lưu thật:
 *   TC-1 admin tạo role 「E2E物品閲覧」 chỉ có 物品マスタ 閲覧 → DB đúng 1 quyền.
 *   TC-2 admin sửa role, thêm 病名マスタ 閲覧 → DB đúng 2 quyền.
 *   TC-3 admin gán role cho user test ở ユーザマスタ (dropdown ロール) → app_user_role.
 *   TC-4..6 user test đăng nhập:
 *     · マスタ登録メニュー: ユーザマスタ / ロールマスタ / 処置マスタ bị khoá, 物品マスタ mở được.
 *     · /masters/trt (không có 閲覧) → màn 403.
 *     · 物品マスタ 新規: F8/F9 bị khoá, End chỉ báo thiếu quyền.
 *   TC-7 BE: login API trả đúng 2 quyền; POST 物品マスタ và GET /tenant/roles → 403.
 *   TC-8 admin xoá role → user test rơi về 「ユーザ」, role và quyền biến mất khỏi DB.
 *
 * USER TEST seed thẳng DB (user_no 9901, email riêng), password_hash CHÉP của
 * owner ⇒ đăng nhập bằng mật khẩu admin. Không qua thư mời vì đó là việc của
 * user-master.spec.ts. Mỗi lượt dọn sạch trước & sau.
 *
 * LOGIN: 3 lần / lượt (admin qua authedPage, user test trên UI, user test qua API)
 * — nằm trong ngân sách Rule 10.1.
 *
 * Chạy cả file (serial, trạng thái nối tiếp):
 *   npx playwright test tests/role-master/role-permissions.spec.ts --workers=1
 */
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const ROLE_CODE = 'e2e-goods-viewer'
const ROLE_NAME = 'E2E物品閲覧'
const USER_NO = 9901
const USER_NAME = 'E2Eロール確認'
const USER_EMAIL = 'e2e-role-perm@example.test'

const VIEW_GOODS = 'master-goods.view'
const VIEW_DIS = 'master-dis.view'

const ROLE_LIST_URL = '/settings/role-master'
const EDIT_DENIED = 'この操作を行う権限がありません。'
const FORBIDDEN_TITLE = 'この画面を表示する権限がありません'

test.describe('ロールマスタ — tạo/sửa/xoá role và chặn quyền theo role', () => {
    test.skip(!dbEnabled, 'cần TEST_DB=1 để seed user test')

    let admin: Page
    let member: Page | undefined

    const fkey = (p: Page, key: string) => p.locator(`[data-fkey="${key}"]`)

    async function purge(): Promise<void> {
        await withDb(async (c) => {
            const user = `(SELECT id FROM ${DB_SCHEMA}.app_user WHERE email = $1 OR user_no = $2)`
            await c.query(`DELETE FROM ${DB_SCHEMA}.app_user_role WHERE user_id IN ${user}`, [
                USER_EMAIL,
                USER_NO,
            ])
            await c.query(`DELETE FROM ${DB_SCHEMA}.app_user WHERE email = $1 OR user_no = $2`, [
                USER_EMAIL,
                USER_NO,
            ])
            const role = `(SELECT id FROM ${DB_SCHEMA}.app_role WHERE code = $1 OR name = $2)`
            await c.query(`DELETE FROM ${DB_SCHEMA}.app_user_role WHERE role_id IN ${role}`, [
                ROLE_CODE,
                ROLE_NAME,
            ])
            await c.query(`DELETE FROM ${DB_SCHEMA}.app_role WHERE code = $1 OR name = $2`, [
                ROLE_CODE,
                ROLE_NAME,
            ])
        })
    }

    /** User test giữ role 「ユーザ」, đăng nhập được bằng mật khẩu của owner. */
    async function seedMember(): Promise<void> {
        await withDb(async (c) => {
            const { rows } = await c.query<{ id: string }>(
                `INSERT INTO ${DB_SCHEMA}.app_user (user_no, email, display_name, password_hash, user_kbn)
                 SELECT $1, $2, $3, password_hash, 2 FROM ${DB_SCHEMA}.app_user WHERE is_owner
                 RETURNING id`,
                [USER_NO, USER_EMAIL, USER_NAME],
            )
            await c.query(
                `INSERT INTO ${DB_SCHEMA}.app_user_role (user_id, role_id)
                 SELECT $1, id FROM ${DB_SCHEMA}.app_role WHERE code = 'user'`,
                [rows[0]!.id],
            )
        })
    }

    async function rolePermissions(): Promise<string[] | null> {
        return withDb(async (c) => {
            const { rows } = await c.query<{ id: string; perms: string[] }>(
                `SELECT r.id, COALESCE(array_agg(p.permission_code ORDER BY p.permission_code)
                        FILTER (WHERE p.permission_code IS NOT NULL), '{}') AS perms
                   FROM ${DB_SCHEMA}.app_role r
                   LEFT JOIN ${DB_SCHEMA}.app_role_permission p ON p.role_id = r.id
                  WHERE r.code = $1 GROUP BY r.id`,
                [ROLE_CODE],
            )
            return rows[0]?.perms ?? null
        })
    }

    async function memberRoleCodes(): Promise<string[]> {
        return withDb(async (c) => {
            const { rows } = await c.query<{ code: string }>(
                `SELECT r.code FROM ${DB_SCHEMA}.app_user_role ur
                   JOIN ${DB_SCHEMA}.app_role r ON r.id = ur.role_id
                   JOIN ${DB_SCHEMA}.app_user u ON u.id = ur.user_id
                  WHERE u.user_no = $1 ORDER BY r.code`,
                [USER_NO],
            )
            return rows.map((r) => r.code)
        })
    }

    /**
     * goto rồi chờ `ready`. Vite dev thỉnh thoảng nhả hụt module và trang đứng trắng
     * (giống gotoListScreen) ⇒ nạp lại tối đa 3 lượt.
     */
    async function gotoReady(p: Page, url: string, ready: Locator): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await p.goto(url, { waitUntil: 'domcontentloaded' })
            try {
                await expect(ready).toBeVisible({ timeout: 30_000 })
                return
            } catch (error) {
                if (attempt === 3) throw error
            }
        }
    }

    async function loginAs(p: Page, email: string): Promise<void> {
        await gotoReady(p, '/login', p.getByLabel(JA.emailLabel))
        await p.getByLabel(JA.emailLabel).fill(email)
        await p.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await p.getByRole('button', { name: JA.submit }).click()
        await expect(p, 'user test không đăng nhập được (rate-limit?)').toHaveURL(/\/$/, {
            timeout: 30_000,
        })
    }

    async function openRole(name: string): Promise<void> {
        await gotoListScreen(admin, ROLE_LIST_URL)
        await admin.getByText(name, { exact: true }).dblclick()
        await expect(admin).toHaveURL(/\/settings\/role-master\/[0-9a-f-]{36}$/, { timeout: 30_000 })
        await expect(admin.getByLabel('ロール名', { exact: true })).toHaveValue(name, {
            timeout: 30_000,
        })
    }

    test.beforeAll(async ({ authedPage }) => {
        admin = authedPage
        await purge()
        await seedMember()
    })

    test.afterAll(async () => {
        await member?.close()
        await releaseSharedPage(admin)
        if (dbEnabled) await purge()
    })

    test('TC-1 — admin tạo role chỉ có 物品マスタ 閲覧', async () => {
        await gotoReady(admin, `${ROLE_LIST_URL}/new`, admin.getByLabel('コード', { exact: true }))
        await admin.getByLabel('コード', { exact: true }).fill(ROLE_CODE)
        await admin.getByLabel('ロール名', { exact: true }).fill(ROLE_NAME)
        await admin.getByRole('checkbox', { name: '物品マスタ 閲覧' }).click()
        await fkey(admin, 'F9').click()

        await expect(admin.getByText(`${ROLE_NAME} を登録しました`)).toBeVisible({ timeout: 15_000 })
        await expect(admin).toHaveURL(/\/settings\/role-master$/)
        await expect(admin.getByText(ROLE_NAME, { exact: true })).toBeVisible()
        expect(await rolePermissions()).toEqual([VIEW_GOODS])
    })

    test('TC-2 — admin sửa role: thêm 病名マスタ 閲覧, quyền cũ giữ nguyên', async () => {
        await openRole(ROLE_NAME)
        await expect(admin.getByLabel('コード', { exact: true })).toBeDisabled()
        await expect(admin.getByRole('checkbox', { name: '物品マスタ 閲覧' })).toHaveAttribute(
            'data-state',
            'checked',
        )
        await admin.getByRole('checkbox', { name: '病名マスタ 閲覧' }).click()
        await fkey(admin, 'F9').click()

        await expect(admin.getByText(`${ROLE_NAME} を更新しました`)).toBeVisible({ timeout: 15_000 })
        expect(await rolePermissions()).toEqual([VIEW_DIS, VIEW_GOODS])
    })

    test('TC-3 — admin gán role cho user test ở ユーザマスタ', async () => {
        const roleBox = admin.getByRole('combobox', { name: 'ロール' })
        await gotoReady(admin, `/settings/user-master/${USER_NO}`, roleBox)
        await expect(roleBox).toHaveText('ユーザ')
        await roleBox.click()
        await admin.getByRole('option', { name: ROLE_NAME, exact: true }).click()
        await expect(roleBox).toHaveText(ROLE_NAME)
        await fkey(admin, 'F9').click()

        await expect(admin).toHaveURL(/\/settings\/user-master$/, { timeout: 30_000 })
        expect(await memberRoleCodes()).toEqual([ROLE_CODE])
    })

    test('TC-4 — user test: マスタ登録メニュー chỉ mở được màn có 閲覧', async ({ browser }) => {
        member = await newTestPage(browser as Browser)
        await loginAs(member, USER_EMAIL)
        const button = (name: string) => member!.getByRole('button', { name, exact: true })
        await gotoReady(member, '/masters', button('物品マスタ'))
        await expect(button('物品マスタ')).toBeEnabled()
        await expect(button('病名マスタ')).toBeEnabled()
        for (const locked of ['ユーザマスタ', 'ロールマスタ', '処置マスタ', '薬剤マスタ']) {
            await expect(button(locked), `${locked} phải bị khoá`).toBeDisabled()
        }
        await captureFixedUi(member, 'role-permissions-master-menu')
    })

    test('TC-5 — user test: vào thẳng màn không có 閲覧 → màn 403', async () => {
        await gotoReady(
            member!,
            '/masters/trt',
            member!.getByRole('heading', { name: FORBIDDEN_TITLE }),
        )
        await captureFixedUi(member!, 'role-permissions-forbidden')
    })

    test('TC-6 — user test: 物品マスタ chỉ xem, phím ghi bị khoá', async () => {
        await gotoListScreen(member!, '/masters/goods')
        await member!.keyboard.press('F1')
        const dialog = member!.getByRole('dialog').filter({ hasText: '物品マスタ登録' })
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // 一覧 phía sau cũng có F9 選択 ⇒ chỉ soi thanh F-key của dialog.
        const key = (k: string) => dialog.locator(`[data-fkey="${k}"]`)
        await expect(key('F9')).toBeDisabled()
        await expect(key('F8')).toBeDisabled()
        await expect(key('F10')).toBeEnabled()

        // End (= 登録 của BaseDialog) vẫn được bắt, chỉ báo thiếu quyền.
        await member!.keyboard.press('End')
        await expect(member!.getByText(EDIT_DENIED)).toBeVisible({ timeout: 15_000 })
        await expect(dialog).toBeVisible()
        await captureFixedUi(member!, 'role-permissions-goods-view-only')
    })

    test('TC-7 — BE: login trả đúng quyền, API ghi / API admin trả 403', async () => {
        const api: APIRequestContext = await pwRequest.newContext({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
        })
        try {
            const login = await api.post('api/tenant/auth/login', {
                data: { email: USER_EMAIL, password: ADMIN_USER.password },
            })
            expect(login.status()).toBe(200)
            const body = await login.json()
            const data = body.data ?? body
            expect([...data.user.permissions].sort()).toEqual([VIEW_DIS, VIEW_GOODS])

            const headers = { Authorization: `Bearer ${data.accessToken}` }
            const read = await api.get('api/tenant/goods/master', { headers })
            expect(read.status(), 'có 閲覧 thì đọc được').toBe(200)
            const write = await api.post('api/tenant/goods/master', { headers, data: {} })
            expect(write.status(), 'thiếu 編集 thì BE phải chặn').toBe(403)
            const roles = await api.get('api/tenant/roles', { headers })
            expect(roles.status(), 'ロールマスタ chỉ cho admin').toBe(403)
        } finally {
            await api.dispose()
        }
    })

    test('TC-8 — admin xoá role → user test về 「ユーザ」', async () => {
        await openRole(ROLE_NAME)
        await fkey(admin, 'F8').click()
        const confirm = admin.getByRole('alertdialog')
        await expect(confirm).toContainText(ROLE_NAME)
        await confirm.getByRole('button', { name: '削除する' }).click()

        await expect(admin.getByText(`${ROLE_NAME} を削除しました`)).toBeVisible({ timeout: 15_000 })
        await expect(admin).toHaveURL(/\/settings\/role-master$/)
        await expect(admin.getByText(ROLE_NAME, { exact: true })).toHaveCount(0)
        expect(await rolePermissions()).toBeNull()
        expect(await memberRoleCodes()).toEqual(['user'])
    })
})
