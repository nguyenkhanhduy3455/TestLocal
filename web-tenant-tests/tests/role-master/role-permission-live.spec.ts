import { type APIRequestContext, type Page } from '@playwright/test'

import { DB_SCHEMA, dbEnabled, withDb } from '../_shared/db'
import { newTestPage } from '../_shared/entry'
import { BASE_URL } from '../_shared/env'
import { gotoListScreen } from '../_shared/list-screen-chrome'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { ADMIN_USER, JA } from '../_shared/test-data'
import {
    API,
    adminToken,
    assignRole,
    bearer,
    createRole,
    deleteRole,
    newApi,
    purge,
    type RoleInfo,
    roleCodesOf,
    roleIdOf,
    seedUser,
    setRolePermissions,
} from './_role-api'

/**
 * Quyền THAY ĐỔI trong lúc người dùng đang đăng nhập, và tự đổi quyền của chính mình.
 *
 * Người tham gia (seed DB, mật khẩu = mật khẩu owner):
 *   · M (9905) — giữ role tuỳ chỉnh 「E2E途中変更」 (物品マスタ 閲覧 + 編集).
 *   · A (9906) — admin thứ hai (không phải owner).
 *   · owner — tài khoản admin của authedPage.
 *
 *   TC-1 admin gỡ 編集 khỏi role của M khi M đang mở 物品マスタ:
 *        BE chặn NGAY với token đang dùng; FE khoá phím ghi sau khi nạp lại.
 *   TC-2 admin đổi role của M sang 「ユーザ」 ⇒ refresh xong M mất quyền ghi.
 *   TC-3 admin xoá role M đang giữ ⇒ token cũ mất quyền ngay; refresh xong M là 「ユーザ」.
 *   TC-4 owner hạ A từ 管理者 xuống 「ユーザ」 ⇒ refresh xong A mất quyền admin.
 *   TC-5 owner tự hạ quyền mình: ô ロール bị khoá, API trả OWNER_PROTECTED.
 *   TC-6 A tự hạ mình xuống 「ユーザ」 ở ユーザマスタ ⇒ nạp lại thì BE từ chối ロールマスタ
 *        và menu admin bị khoá.
 *
 *   TC-7 tổng hợp: mọi lần đổi role ở TC-2 / TC-4 / TC-6 phải có hiệu lực NGAY.
 *
 * Bước "NGAY" của TC-2 / TC-4 / TC-6 không assert tại chỗ mà ghi vào `stale`, rồi TC-7
 * assert danh sách rỗng: role nằm trong access token và việc đổi role chưa thu hồi token,
 * nên hiện tại người bị hạ vẫn giữ quyền cũ tới lần refresh (≤ 15 phút). Assert tại chỗ
 * thì serial mode bỏ luôn các TC sau — gom lại để TC-1..6 vẫn kiểm phần còn lại.
 *
 * LOGIN: 2 lần UI (M, A). Token lấy từ response login của chính trang đó, refresh bằng
 * cookie của trang (giới hạn refresh 30 / phút / IP).
 *
 * Chạy: npx playwright test tests/role-master/role-permission-live.spec.ts --workers=1
 */
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const M = { userNo: 9905, email: 'e2e-perm-live@example.test', name: 'E2E途中変更' }
const A = { userNo: 9906, email: 'e2e-perm-admin2@example.test', name: 'E2E第二管理者' }
const ROLE_CODE = 'e2e-perm-live'
const ROLE_NAME = 'E2E途中変更ロール'
const GOODS = ['master-goods.view', 'master-goods.edit']

interface Person {
    page: Page
    token: string
}

test.describe('Quyền đổi trong lúc đang đăng nhập', () => {
    test.skip(!dbEnabled, 'cần TEST_DB=1 để seed user test')

    let owner: Page
    let api: APIRequestContext
    let adminTok: string
    let role: RoleInfo
    let m: Person
    let a: Person
    /** Lần đổi role mà token đang dùng vẫn giữ quyền cũ — TC-7 đòi rỗng. */
    const stale: string[] = []
    function expectImmediate(what: string, status: number, expected: number) {
        if (status !== expected) stale.push(`${what}: token đang dùng trả ${status}, phải ${expected}`)
    }

    /** Login UI, giữ lại access token từ response login (token đang chạy trong app). */
    async function signIn(email: string): Promise<Person> {
        const page = await newTestPage(owner.context().browser()!)
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        const login = page.waitForResponse((r) => r.url().endsWith('/tenant/auth/login'))
        await page.getByRole('button', { name: JA.submit }).click()
        const body = await (await login).json()
        await expect(page, `${email} không đăng nhập được (rate-limit?)`).toHaveURL(/\/$/, { timeout: 30_000 })
        return { page, token: (body.data ?? body).accessToken }
    }

    /** Refresh bằng cookie của trang — như app tự làm khi access token hết hạn. */
    async function refresh(p: Person): Promise<string[]> {
        const res = await p.page.context().request.post(`${BASE_URL}${API}/tenant/auth/refresh`)
        expect(res.status()).toBe(200)
        const body = await res.json()
        const d = body.data ?? body
        p.token = d.accessToken
        return d.user?.permissions ?? []
    }

    /** Ghi 物品マスタ với body hỏng: 400 = qua được bước quyền (không ghi gì), 403 = bị chặn. */
    async function goodsWrite(token: string): Promise<number> {
        const res = await api.post(`${API}/tenant/goods/master`, {
            headers: { ...bearer(token), 'Content-Type': 'application/json' },
            data: '{',
        })
        return res.status()
    }

    /** Đọc ロールマスタ — chỉ admin. */
    async function adminRead(token: string): Promise<number> {
        return (await api.get(`${API}/tenant/roles`, { headers: bearer(token) })).status()
    }

    /**
     * goto (nạp lại trang). Trên Vite dev, nạp lại ngay sau một lần nạp khác đôi khi làm
     * refresh trả 401 và app đá về /login (đã gặp ở user-master.spec.ts) — khi đó đăng
     * nhập lại (thêm 1 login) rồi đi tiếp. Không ảnh hưởng điều đang kiểm: quyền đọc từ DB.
     */
    async function reloadAt(p: Person, email: string, path: string): Promise<void> {
        await p.page.goto(path, { waitUntil: 'domcontentloaded' })
        const loginButton = p.page.getByRole('button', { name: JA.submit })
        const signedIn = p.page.locator('[data-fkey]').first()
        await expect(loginButton.or(signedIn).first()).toBeVisible({ timeout: 30_000 })
        if (!(await loginButton.isVisible())) return
        console.log(`reloadAt: ${email} bị đá về /login khi nạp lại — đăng nhập lại`)
        await p.page.getByLabel(JA.emailLabel).fill(email)
        await p.page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await loginButton.click()
        await expect(p.page).toHaveURL(/\/$/, { timeout: 30_000 })
        await p.page.goto(path, { waitUntil: 'domcontentloaded' })
    }

    /** Điều hướng trong SPA (TanStack Router nghe popstate) — không nạp lại trang. */
    async function spaNavigate(page: Page, path: string): Promise<void> {
        await page.evaluate((to) => {
            window.history.pushState({}, '', to)
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
        }, path)
    }

    async function openGoodsRegister(page: Page) {
        await gotoListScreen(page, '/masters/goods')
        await page.keyboard.press('F1')
        const dialog = page.getByRole('dialog').filter({ hasText: '物品マスタ登録' })
        await expect(dialog).toBeVisible({ timeout: 30_000 })
        return dialog.locator('[data-fkey="F9"]')
    }

    test.beforeAll(async ({ authedPage }) => {
        owner = authedPage
        api = await newApi()
        await purge([M, A], [ROLE_CODE])
        adminTok = await adminToken(owner)
        role = await createRole(api, adminTok, ROLE_CODE, ROLE_NAME, GOODS)
        await seedUser(M, ROLE_CODE)
        await seedUser(A, 'admin')
    })

    test.afterAll(async () => {
        await m?.page.close()
        await a?.page.close()
        await api?.dispose()
        await releaseSharedPage(owner)
        if (dbEnabled) await purge([M, A], [ROLE_CODE])
    })

    test('TC-1 — gỡ 編集 khỏi role: BE chặn ngay, FE khoá phím sau khi nạp lại', async () => {
        m = await signIn(M.email)
        await expect(await openGoodsRegister(m.page)).toBeEnabled()
        expect(await goodsWrite(m.token), 'trước khi gỡ: được ghi').toBe(400)

        await setRolePermissions(api, adminTok, role, ['master-goods.view'])
        expect(await goodsWrite(m.token), 'token đang dùng phải bị chặn ngay').toBe(403)

        await expect(await openGoodsRegister(m.page), 'nạp lại ⇒ F9 bị khoá').toBeDisabled()

        await setRolePermissions(api, adminTok, role, GOODS)
        expect(await goodsWrite(m.token), 'trả lại 編集: ghi được ngay').toBe(400)
        await expect(await openGoodsRegister(m.page)).toBeEnabled()
    })

    test('TC-2 — đổi role của M sang 「ユーザ」: refresh xong mất quyền ghi', async () => {
        const res = await assignRole(api, adminTok, M.userNo, await roleIdOf('user'))
        expect(res.status()).toBeLessThan(300)
        expect(await roleCodesOf(M.userNo)).toEqual(['user'])

        expectImmediate('TC-2 đổi role M → ユーザ, ghi 物品マスタ', await goodsWrite(m.token), 403)

        await refresh(m)
        expect(await goodsWrite(m.token), 'sau refresh: chỉ còn 閲覧').toBe(403)
    })

    test('TC-3 — xoá role M đang giữ: token cũ mất quyền ngay, refresh xong là 「ユーザ」', async () => {
        await assignRole(api, adminTok, M.userNo, role.id)
        await refresh(m)
        expect(await goodsWrite(m.token), 'đã giữ lại role tuỳ chỉnh').toBe(400)

        await deleteRole(api, adminTok, role)
        expect(await goodsWrite(m.token), 'role đã xoá không còn quyền nào').toBe(403)
        expect(await roleCodesOf(M.userNo)).toEqual(['user'])

        const permissions = await refresh(m)
        expect(permissions.length, 'sau refresh có đủ quyền 閲覧 của 「ユーザ」').toBeGreaterThan(0)
        expect(permissions.every((p) => p.endsWith('.view'))).toBe(true)
        expect(await goodsWrite(m.token)).toBe(403)
    })

    test('TC-4 — hạ admin A xuống 「ユーザ」: refresh xong mất quyền admin', async () => {
        a = await signIn(A.email)
        expect(await adminRead(a.token), 'A đang là admin').toBe(200)

        const userRole = await roleIdOf('user')
        expect((await assignRole(api, adminTok, A.userNo, userRole)).status()).toBeLessThan(300)
        expectImmediate('TC-4 owner hạ A → ユーザ, đọc ロールマスタ', await adminRead(a.token), 403)

        await refresh(a)
        expect(await adminRead(a.token), 'sau refresh: không còn là admin').toBe(403)

        // Trả A về admin cho TC-6.
        expect((await assignRole(api, adminTok, A.userNo, await roleIdOf('admin'))).status()).toBeLessThan(300)
        await refresh(a)
        expect(await adminRead(a.token)).toBe(200)
    })

    test('TC-5 — owner không tự hạ quyền được', async () => {
        const ownerNo = await withDb(async (c) => {
            const { rows } = await c.query<{ user_no: number }>(
                `SELECT user_no FROM ${DB_SCHEMA}.app_user WHERE is_owner`,
            )
            return rows[0]!.user_no
        })
        const roleBox = owner.getByRole('combobox', { name: 'ロール' })
        for (let attempt = 1; ; attempt++) {
            await owner.goto(`/settings/user-master/${ownerNo}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(roleBox).toBeVisible({ timeout: 30_000 })
                break
            } catch (error) {
                if (attempt === 3) throw error
            }
        }
        await expect(roleBox, 'ô ロール của owner phải bị khoá').toBeDisabled()

        const res = await assignRole(api, adminTok, ownerNo, await roleIdOf('user'))
        expect(res.status()).toBe(409)
        expect((await res.json()).error.code).toBe('USER_MASTER.OWNER_PROTECTED')
        expect(await roleCodesOf(ownerNo)).toEqual(['admin'])
    })

    test('TC-6 — admin A tự hạ mình xuống 「ユーザ」: nạp lại thì mất quyền admin', async () => {
        const page = a.page
        const roleBox = page.getByRole('combobox', { name: 'ロール' })
        await page.goto(`/settings/user-master/${A.userNo}`, { waitUntil: 'domcontentloaded' })
        await expect(roleBox).toHaveText('管理者', { timeout: 30_000 })
        await roleBox.click()
        await page.getByRole('option', { name: 'ユーザ', exact: true }).click()
        await page.locator('[data-fkey="F9"]').click()
        await expect(page).toHaveURL(/\/settings\/user-master$/, { timeout: 30_000 })
        expect(await roleCodesOf(A.userNo)).toEqual(['user'])

        // Cùng tab, không nạp lại: sang ロールマスタ (điều hướng trong SPA).
        await spaNavigate(page, '/settings/role-master')
        await expect(page).toHaveURL(/\/settings\/role-master$/)
        const refused = page.locator('p[role="alert"]')
        const list = page.getByText('管理者', { exact: true })
        await expect(refused.or(list).first()).toBeVisible({ timeout: 30_000 })
        if (!(await refused.isVisible())) stale.push('TC-6 A tự hạ → ユーザ: cùng tab vẫn mở được ロールマスタ')

        // Nạp lại ⇒ app refresh token: BE từ chối, menu admin bị khoá.
        await reloadAt(a, A.email, '/settings/role-master')
        await expect(refused).toBeVisible({ timeout: 30_000 })
        // Sang メニュー trong SPA: nạp lại lần nữa ngay sau đó dễ mất phiên trên Vite dev
        // (refresh bị 401 — xem ghi chú ở user-master.spec.ts), không liên quan tới quyền.
        await spaNavigate(page, '/masters')
        await expect(page.getByRole('button', { name: 'ロールマスタ', exact: true })).toBeDisabled({
            timeout: 30_000,
        })
    })

    test('TC-7 — đổi role phải có hiệu lực ngay với phiên đang đăng nhập', () => {
        expect(stale, 'đổi role không thu hồi access token đang dùng').toEqual([])
    })
})
