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
    loginApi,
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
 *   TC-2 admin đổi role của M sang 「ユーザ」 ⇒ phiên của M kết thúc ngay (token cũ 401,
 *        refresh 401, app đá về /login).
 *   TC-3 admin xoá role M đang giữ ⇒ token cũ mất quyền ghi ngay; refresh xong M là 「ユーザ」
 *        (xoá role không kết thúc phiên: role đã xoá không còn quyền nào).
 *   TC-4 owner hạ A từ 管理者 xuống 「ユーザ」 ⇒ phiên của A kết thúc ngay.
 *   TC-5 owner tự hạ quyền mình: ô ロール bị khoá, API trả OWNER_PROTECTED.
 *   TC-6 A tự hạ mình xuống 「ユーザ」 ở ユーザマスタ ⇒ lưu xong bị đá về /login; đăng nhập
 *        lại thì ロールマスタ bị từ chối và nút trên メニュー bị khoá.
 *
 * Đổi role tăng token_version và thu hồi mọi refresh token của người đó (giống đổi mật
 * khẩu) — role nằm trong access token nên không làm vậy thì người bị hạ giữ quyền cũ
 * tới khi token hết hạn.
 *
 * LOGIN: M 1 lần UI + 1 lần API, A 3 lần UI (mỗi lần bị hạ là mất phiên). Token lấy từ
 * response login của chính trang đó (refresh giới hạn 30 / phút / IP).
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

    const loginButton = (page: Page) => page.getByRole('button', { name: JA.submit })

    /** Login UI trên `page`, trả access token lấy từ response login (token app đang dùng). */
    async function logIn(page: Page, email: string): Promise<string> {
        if (!(await loginButton(page).isVisible())) await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        const login = page.waitForResponse((r) => r.url().endsWith('/tenant/auth/login'))
        await loginButton(page).click()
        const res = await login
        const body = await res.json()
        // Bị đá ra giữa chừng thì app quay lại đúng trang cũ, không phải "/".
        await expect(page, `${email} không đăng nhập được (rate-limit?)`).not.toHaveURL(/\/login/, {
            timeout: 30_000,
        })
        expect(res.status(), `${email} login`).toBe(200)
        return (body.data ?? body).accessToken
    }

    async function signIn(email: string): Promise<Person> {
        const page = await newTestPage(owner.context().browser()!)
        return { page, token: await logIn(page, email) }
    }

    /** Refresh bằng cookie của trang — như app tự làm khi access token hết hạn. Trả status. */
    async function refresh(p: Person): Promise<number> {
        const res = await p.page.context().request.post(`${BASE_URL}${API}/tenant/auth/refresh`)
        if (res.status() === 200) p.token = ((await res.json()).data ?? {}).accessToken
        return res.status()
    }

    /** Phiên đã kết thúc: nạp lại trang thì app đá về /login. */
    async function expectSignedOut(page: Page, path: string): Promise<void> {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await expect(loginButton(page)).toBeVisible({ timeout: 30_000 })
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

    test('TC-2 — đổi role của M sang 「ユーザ」: phiên của M kết thúc ngay', async () => {
        const res = await assignRole(api, adminTok, M.userNo, await roleIdOf('user'))
        expect(res.status()).toBeLessThan(300)
        expect(await roleCodesOf(M.userNo)).toEqual(['user'])

        expect(await goodsWrite(m.token), 'token đang dùng bị từ chối ngay').toBe(401)
        expect(await refresh(m), 'refresh token cũ bị thu hồi').toBe(401)
        await expectSignedOut(m.page, '/masters/goods')
    })

    test('TC-3 — xoá role M đang giữ: token cũ mất quyền ngay, refresh xong là 「ユーザ」', async () => {
        expect((await assignRole(api, adminTok, M.userNo, role.id)).status()).toBeLessThan(300)
        const session = await loginApi(M.email)
        try {
            expect(await goodsWrite(session.token), 'đăng nhập lại với role tuỳ chỉnh').toBe(400)

            await deleteRole(api, adminTok, role)
            expect(await goodsWrite(session.token), 'role đã xoá không còn quyền nào').toBe(403)
            expect(await roleCodesOf(M.userNo)).toEqual(['user'])

            await session.refresh()
            expect(session.permissions.length, 'sau refresh có đủ quyền 閲覧 của 「ユーザ」').toBeGreaterThan(0)
            expect(session.permissions.every((p) => p.endsWith('.view'))).toBe(true)
            expect(await goodsWrite(session.token)).toBe(403)
        } finally {
            await session.dispose()
        }
    })

    test('TC-4 — hạ admin A xuống 「ユーザ」: phiên của A kết thúc ngay', async () => {
        a = await signIn(A.email)
        expect(await adminRead(a.token), 'A đang là admin').toBe(200)

        expect((await assignRole(api, adminTok, A.userNo, await roleIdOf('user'))).status()).toBeLessThan(300)
        expect(await adminRead(a.token), 'token đang dùng bị từ chối ngay').toBe(401)
        expect(await refresh(a), 'refresh token cũ bị thu hồi').toBe(401)
        await expectSignedOut(a.page, '/settings/role-master')

        // Trả A về admin cho TC-6 (A không còn phiên nào để thu hồi).
        expect((await assignRole(api, adminTok, A.userNo, await roleIdOf('admin'))).status()).toBeLessThan(300)
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

    test('TC-6 — admin A tự hạ mình xuống 「ユーザ」: lưu xong bị đá về /login', async () => {
        const page = a.page
        a.token = await logIn(page, A.email)
        expect(await adminRead(a.token)).toBe(200)

        const roleBox = page.getByRole('combobox', { name: 'ロール' })
        await spaNavigate(page, `/settings/user-master/${A.userNo}`)
        await expect(roleBox).toHaveText('管理者', { timeout: 30_000 })
        await roleBox.click()
        await page.getByRole('option', { name: 'ユーザ', exact: true }).click()
        await page.locator('[data-fkey="F9"]').click()

        // Lưu được (request đi bằng token trước khi bị thu hồi), rồi request kế tiếp 401 →
        // refresh 401 → app về /login.
        await expect(loginButton(page), 'tự hạ quyền phải kết thúc phiên').toBeVisible({ timeout: 30_000 })
        expect(await roleCodesOf(A.userNo)).toEqual(['user'])
        expect(await adminRead(a.token)).toBe(401)

        // Đăng nhập lại: không còn là admin.
        a.token = await logIn(page, A.email)
        expect(await adminRead(a.token)).toBe(403)
        await spaNavigate(page, '/masters')
        await expect(page.getByRole('button', { name: 'ロールマスタ', exact: true })).toBeDisabled({
            timeout: 30_000,
        })
        await spaNavigate(page, '/settings/role-master')
        await expect(page.locator('p[role="alert"]'), 'BE từ chối ロールマスタ').toBeVisible({ timeout: 30_000 })
    })
})
