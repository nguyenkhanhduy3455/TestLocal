import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { Client } from 'pg'

import { DB_SCHEMA, dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import {
    T,
    enableTotpFromProfile,
    fillCode,
    flushConfigCache,
    nextCode,
    openLogin,
    submitPassword,
    type TotpState,
} from './totp-helpers'

/**
 * 二段階認証 (TOTP) × nhiều tenant: CÙNG một email ở tenant1 và tenant2 là hai tài khoản độc lập.
 *
 * FACT bám theo source (nhánh feat/tenant-totp):
 *  - Cột totp_* nằm trên app_user của TỪNG schema tenant (migration Tenant/…-add-app-user-totp).
 *  - Redis key TOTP có tiền tố tenant id (Ochacom.Shared/Redis/TenantRedisKeys.cs).
 *  - Cookie ghi nhớ td_<userId> KHÔNG đặt Domain ⇒ chỉ gửi về đúng subdomain đã set
 *    (Ochacom.API/Security/CookieHelper.cs SetTenantTrustedDevice).
 *  - 「全ユーザーに二段階認証を必須にする」 = tenant_config namespace 'sec' { forceTotp } của từng schema.
 *
 * Hai tenant chạy trên CÙNG một BrowserContext (= cùng một trình duyệt) để cookie của tenant1
 * có mặt thật trong trình duyệt khi đăng nhập tenant2.
 *
 * Dữ liệu: seed 2 email vào CẢ HAI schema, dùng lại password_hash của ADMIN_USER ở tenant1
 * (mật khẩu = ADMIN_USER.password). A: bật TOTP ở tenant1, sau đó bật cả ở tenant2.
 * B: không bao giờ bật — dùng cho ca bắt buộc. Bắt buộc ở tenant1 được bật thẳng bằng DB
 * (UI đã có totp.spec phủ) để tiết kiệm lượt login.
 *
 * ⚠️ Lúc ca bắt buộc chạy, mọi user tenant1 chưa có TOTP (kể cả ADMIN_USER) bị chặn ⇒ chạy
 * spec này MỘT MÌNH. afterAll trả 'sec' của tenant1 về như cũ (DB + cache Redis) và xoá user
 * seed ở cả hai schema kèm bảng *_deleted.
 *
 * Ngân sách login (10/phút/IP, mọi request qua nginx chung 1 IP): spec dùng 9 lượt
 * (login ×7, login/totp ×2) ⇒ đừng chạy ngay sau totp.spec, chờ ≥ 1 phút.
 */

test.describe.configure({ mode: 'serial' })

const OTHER_SLUG = process.env.TEST_OTHER_TENANT_SLUG ?? 'tenant2'
const OTHER_SCHEMA = process.env.TEST_OTHER_TENANT_SCHEMA ?? `t_${OTHER_SLUG}`

const TENANT1_URL = new URL(process.env.BASE_URL ?? 'https://tenant1.ochacom.local/')
/** Mặc định: đổi nhãn đầu của host tenant1 (tenant1.ochacom.local → tenant2.ochacom.local). */
const TENANT2_URL = new URL(process.env.TEST_OTHER_TENANT_URL ?? TENANT1_URL)
if (!process.env.TEST_OTHER_TENANT_URL) TENANT2_URL.hostname = TENANT1_URL.hostname.replace(/^[^.]+/, OTHER_SLUG)

const TENANTS = [
    { label: 'tenant1', schema: DB_SCHEMA, url: TENANT1_URL },
    { label: OTHER_SLUG, schema: OTHER_SCHEMA, url: TENANT2_URL },
] as const
type Tenant = (typeof TENANTS)[number]
const [TENANT1, TENANT2] = TENANTS

const USER_A = { userNo: 9903, email: 'e2e-totp-mt-a@example.test', name: 'E2E TOTP MT A' }
const USER_B = { userNo: 9904, email: 'e2e-totp-mt-b@example.test', name: 'E2E TOTP MT B' }
const SEEDED = [USER_A, USER_B]

const at = (tenant: Tenant, path: string) => new URL(path, tenant.url).href

// ── DB ──────────────────────────────────────────────────────────────────────

/** withDb trỏ sẵn DB_SCHEMA; đổi search_path để thao tác schema tenant khác. */
function withTenantDb<R>(tenant: Tenant, fn: (c: Client) => Promise<R>): Promise<R> {
    return withDb(async (c) => {
        await c.query(`SET search_path TO "${tenant.schema}", public`)
        return fn(c)
    })
}

async function deleteSeededUsers(tenant: Tenant): Promise<void> {
    await withTenantDb(tenant, async (c) => {
        const emails = SEEDED.map((u) => u.email)
        const nos = SEEDED.map((u) => u.userNo)
        const { rows } = await c.query<{ id: string }>(
            `SELECT id FROM app_user WHERE email = ANY($1) OR user_no = ANY($2)
             UNION SELECT id FROM app_user_deleted WHERE email = ANY($1) OR user_no = ANY($2)`,
            [emails, nos],
        )
        const ids = rows.map((r) => r.id)
        await c.query('DELETE FROM app_user WHERE id = ANY($1)', [ids])
        await c.query('DELETE FROM app_user_role_deleted WHERE user_id = ANY($1)', [ids])
        await c.query('DELETE FROM user_config_deleted WHERE user_id = ANY($1)', [ids])
        await c.query('DELETE FROM app_user_deleted WHERE id = ANY($1)', [ids])
    })
}

async function seedUsers(tenant: Tenant, passwordHash: string): Promise<void> {
    await withTenantDb(tenant, async (c) => {
        const role = await c.query<{ id: string }>(`SELECT id FROM app_role WHERE code = 'admin'`)
        for (const u of SEEDED) {
            const ins = await c.query<{ id: string }>(
                `INSERT INTO app_user (user_no, email, display_name, password_hash)
                 VALUES ($1, $2, $3, $4) RETURNING id`,
                [u.userNo, u.email, u.name, passwordHash],
            )
            await c.query(
                'INSERT INTO app_user_role (user_id, role_id, created_at) VALUES ($1, $2, now())',
                [ins.rows[0]!.id, role.rows[0]!.id],
            )
        }
    })
}

async function readTotpEnabled(tenant: Tenant, email: string): Promise<boolean> {
    const { rows } = await withTenantDb(tenant, (c) =>
        c.query<{ on: boolean }>('SELECT totp_enabled_at IS NOT NULL AS on FROM app_user WHERE email = $1', [
            email,
        ]),
    )
    return rows[0]!.on
}

let secOriginal: unknown = undefined

async function setForceTotp(tenant: Tenant, on: boolean): Promise<void> {
    await withTenantDb(tenant, (c) =>
        c.query(
            `INSERT INTO tenant_config (namespace, value) VALUES ('sec', $1)
             ON CONFLICT (namespace) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
            [{ forceTotp: on }],
        ),
    )
    flushConfigCache()
}

async function restoreSecConfig(tenant: Tenant): Promise<void> {
    await withTenantDb(tenant, async (c) => {
        if (secOriginal === undefined) await c.query(`DELETE FROM tenant_config WHERE namespace = 'sec'`)
        else await c.query(`UPDATE tenant_config SET value = $1 WHERE namespace = 'sec'`, [secOriginal])
        await c.query(`DELETE FROM tenant_config_deleted WHERE namespace = 'sec'`)
    })
    flushConfigCache()
}

// ── UI ──────────────────────────────────────────────────────────────────────

/**
 * Đăng xuất MỘT tenant: chỉ xoá cookie của host đó (cookie host-only, domain = hostname),
 * nên phiên + cookie ghi nhớ của tenant kia vẫn nằm trong trình duyệt.
 */
async function signOut(page: Page, tenant: Tenant, keepTrustedDevice = false): Promise<void> {
    const domain = tenant.url.hostname
    if (keepTrustedDevice) await page.context().clearCookies({ name: 'rt', domain })
    else await page.context().clearCookies({ domain })
    await openLogin(page, at(tenant, '/login'))
}

async function trustedCookieNames(context: BrowserContext, tenant: Tenant): Promise<string[]> {
    const cookies = await context.cookies(at(tenant, '/api/tenant/auth/login'))
    return cookies.filter((c) => c.name.startsWith('td_')).map((c) => c.name)
}

/** Trang /login đang ở bước nhập mã (chưa vào app). */
async function expectCodeStep(page: Page, why: string): Promise<void> {
    await expect(page.getByRole('group', { name: T.codeLabel }), why).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
}

// ── Spec ────────────────────────────────────────────────────────────────────

test.describe('二段階認証 (TOTP) × nhiều tenant — cùng email, hai tài khoản độc lập', () => {
    let context: BrowserContext
    let page1: Page
    let page2: Page
    let totpA1: TotpState
    let totpA2: TotpState

    test.beforeAll(async ({ browser }) => {
        skipWithReason(!dbEnabled, 'cần DB (TEST_DB=1) để seed cùng một email vào hai tenant')
        for (const t of TENANTS) await deleteSeededUsers(t)
        const hash = await withTenantDb(TENANT1, async (c) => {
            const sec = await c.query<{ value: unknown }>(`SELECT value FROM tenant_config WHERE namespace = 'sec'`)
            secOriginal = sec.rows[0]?.value
            const admin = await c.query<{ password_hash: string }>(
                'SELECT password_hash FROM app_user WHERE email = $1',
                [ADMIN_USER.email],
            )
            return admin.rows[0]!.password_hash
        })
        for (const t of TENANTS) await seedUsers(t, hash)

        context = await browser.newContext()
        page1 = await context.newPage()
        page2 = await context.newPage()
    })

    test.afterAll(async () => {
        await context?.close()
        if (!dbEnabled) return
        await restoreSecConfig(TENANT1)
        for (const t of TENANTS) await deleteSeededUsers(t)
    })

    test(`tenant1 bật TOTP → ${OTHER_SLUG} cùng email chưa bật vẫn vào thẳng, không hỏi mã`, async () => {
        await openLogin(page1, at(TENANT1, '/login'))
        await submitPassword(page1, USER_A.email)
        await expect(page1).toHaveURL(/\/$/)
        totpA1 = (await enableTotpFromProfile(page1, at(TENANT1, '/account/profile'))).totp

        expect(await readTotpEnabled(TENANT1, USER_A.email), 'tenant1: đã bật').toBe(true)
        expect(await readTotpEnabled(TENANT2, USER_A.email), `${OTHER_SLUG}: KHÔNG được bật theo`).toBe(false)

        await openLogin(page2, at(TENANT2, '/login'))
        await submitPassword(page2, USER_A.email)
        await expect(page2, `${OTHER_SLUG} chưa bật TOTP ⇒ không có bước mã`).toHaveURL(/\/$/)
    })

    test('tenant1 đăng nhập bằng mã + ghi nhớ trình duyệt → lần sau bỏ qua bước mã', async () => {
        await signOut(page1, TENANT1)
        await submitPassword(page1, USER_A.email)
        await expectCodeStep(page1, 'tenant1 đã bật ⇒ phải hỏi mã')
        await expect(page1.getByLabel(T.rememberDevice)).toBeChecked()
        await fillCode(page1, await nextCode(page1, totpA1))
        await page1.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page1).toHaveURL(/\/$/)

        expect(await trustedCookieNames(context, TENANT1), 'tenant1 có cookie ghi nhớ').toHaveLength(1)
        expect(await trustedCookieNames(context, TENANT2), `cookie đó KHÔNG gửi sang ${OTHER_SLUG}`).toHaveLength(0)

        await signOut(page1, TENANT1, true)
        await submitPassword(page1, USER_A.email)
        await expect(page1, 'tenant1 đã ghi nhớ ⇒ vào thẳng').toHaveURL(/\/$/)
    })

    test(`${OTHER_SLUG} bật TOTP riêng → ghi nhớ của tenant1 KHÔNG miễn bước mã ở ${OTHER_SLUG}`, async () => {
        // page2 vẫn đang đăng nhập từ ca đầu.
        totpA2 = (await enableTotpFromProfile(page2, at(TENANT2, '/account/profile'))).totp
        expect(totpA2.secret, 'mỗi tenant một secret riêng').not.toBe(totpA1.secret)

        await signOut(page2, TENANT2, true)
        expect(await trustedCookieNames(context, TENANT1), 'cookie ghi nhớ tenant1 vẫn còn trong trình duyệt').toHaveLength(1)
        await submitPassword(page2, USER_A.email)
        await expectCodeStep(page2, `${OTHER_SLUG} phải hỏi mã dù trình duyệt đã ghi nhớ ở tenant1`)

        await fillCode(page2, await nextCode(page2, totpA2))
        await page2.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page2).toHaveURL(/\/$/)
    })

    test(`tenant1 bắt buộc TOTP → user ${OTHER_SLUG} chưa có TOTP không bị bắt thiết lập`, async () => {
        await setForceTotp(TENANT1, true)

        // Đối chứng: bắt buộc thật sự có hiệu lực ở tenant1 (sai key config thì ca này fail, không xanh giả).
        await signOut(page1, TENANT1)
        await submitPassword(page1, USER_B.email)
        await expect(page1.getByRole('dialog').getByText(T.requiredTitle), 'tenant1: B bị bắt thiết lập').toBeVisible()

        await signOut(page2, TENANT2)
        await submitPassword(page2, USER_B.email)
        await expect(page2, `${OTHER_SLUG} không bắt buộc ⇒ B vào thẳng`).toHaveURL(/\/$/)
        await expect(page2.getByText(T.requiredTitle)).toHaveCount(0)
    })
})
