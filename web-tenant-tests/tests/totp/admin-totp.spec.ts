import { randomUUID } from 'node:crypto'

import { expect, test, type BrowserContext, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import {
    T,
    changeDevice,
    fillCode,
    nextCode,
    openLogin,
    openTotpSettings,
    readRecoveryCodes,
    readSecret,
    submitPassword,
} from './totp-helpers'

/**
 * 二段階認証 (TOTP) cho đăng nhập web-admin (super-admin) — nhánh feat/tenant-totp.
 *
 * FACT bám theo source (apps/web-admin/src/features/auth/totp/locales/ja.ts):
 *  - Sidebar → link 「アカウント設定」 mở màn /account (パスワード変更 + 二段階認証); nút 「設定する」 mở dialog
 *    「二段階認証の設定」 (QR + khoá Base32 + 6 ô mã) → 「リカバリーコード」 (10 mã, chỉ có 「コピー」).
 *  - POST /api/admin/auth/login trả { step, challengeToken, session }; step=totp ⇒ bước 確認コード.
 *  - Cookie ghi nhớ trình duyệt là td_{adminId} ở Path=/api/admin/auth.
 *
 * Dữ liệu: spec tự seed 1 super-admin riêng (KHÔNG bật TOTP cho ADMIN_USER — làm thế là khoá
 * login admin của mọi spec khác), dùng lại password_hash của ADMIN_USER. afterAll xoá dòng đó
 * (audit_logs.actor_id có ON DELETE SET NULL).
 *
 * Ngân sách login (policy Login = 10/phút/IP): 5 lượt (login ×3, login/totp ×2).
 */

test.describe.configure({ mode: 'serial' })

const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'
const SEEDED = { email: 'e2e-admin-totp@example.test', name: 'E2E Admin TOTP' }

async function deleteSeededAdmin(): Promise<void> {
    await withDb((c) => c.query('DELETE FROM platform.super_admins WHERE email = $1', [SEEDED.email]))
}

test.describe('web-admin 二段階認証 (TOTP)', () => {
    let context: BrowserContext
    let page: Page
    let totp = { secret: '', lastStep: 0 }
    let recovery: string[] = []

    test.beforeAll(async ({ browser }) => {
        skipWithReason(!dbEnabled, 'cần DB (TEST_DB=1) để seed super-admin riêng cho TOTP')
        await deleteSeededAdmin()
        await withDb(async (c) => {
            const admin = await c.query<{ password_hash: string }>(
                'SELECT password_hash FROM platform.super_admins WHERE email = $1 AND deleted_at IS NULL',
                [ADMIN_USER.email],
            )
            await c.query(
                `INSERT INTO platform.super_admins (id, email, display_name, password_hash)
                 VALUES ($1, $2, $3, $4)`,
                [randomUUID(), SEEDED.email, SEEDED.name, admin.rows[0]!.password_hash],
            )
        })
        context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
        page = await context.newPage()
    })

    test.afterAll(async () => {
        await context?.close()
        if (dbEnabled) await deleteSeededAdmin()
    })

    test('アカウント設定 → 二段階認証: bật TOTP → QR + mã → 10 リカバリーコード (chỉ コピー)', async () => {
        await openLogin(page)
        await submitPassword(page, SEEDED.email)
        await expect(page).not.toHaveURL(/\/login/)

        await page.getByRole('link', { name: 'アカウント設定', exact: true }).click()
        await expect(page).toHaveURL(/\/account$/)
        await expect(page.getByRole('heading', { name: 'アカウント設定', level: 1 })).toBeVisible()

        // パスワード変更 now lives on this screen: the button opens the existing dialog.
        await page.getByRole('button', { name: 'パスワード変更' }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        const enable = page.getByRole('button', { name: T.enable, exact: true })
        await expect(enable).toBeVisible()
        await captureFixedUi(page, 'admin-totp-account-screen')
        await enable.click()

        const setup = page.getByRole('dialog')
        totp.secret = await readSecret(setup)
        await captureFixedUi(setup, 'admin-totp-setup-dialog')
        await fillCode(setup, await nextCode(page, totp))
        await setup.getByRole('button', { name: T.confirmSetup, exact: true }).click()

        recovery = await readRecoveryCodes(setup)
        await expect(setup.getByRole('button', { name: 'ダウンロード' }), 'chỉ còn nút コピー').toHaveCount(0)
        await expect(setup.getByRole('button', { name: 'コピー' })).toBeVisible()
        await captureFixedUi(setup, 'admin-totp-recovery-codes')
        await setup.getByLabel(T.saved).click()
        await setup.getByRole('button', { name: T.done }).click()
        await expect(page.getByText(T.enabledToast, { exact: true })).toBeVisible()
        await expect(page.getByText(/^有効（/)).toBeVisible()
        await captureFixedUi(page, 'admin-totp-account-enabled')

        await page.getByRole('link', { name: 'セキュリティ設定', exact: true }).click()
        await expect(page.getByLabel('全管理者に二段階認証を必須にする')).toBeVisible()
        await captureFixedUi(page, 'admin-totp-security-settings')

        const row = await withDb((c) =>
            c.query<{ totp_secret_enc: string | null }>(
                'SELECT totp_secret_enc FROM platform.super_admins WHERE email = $1',
                [SEEDED.email],
            ),
        )
        expect(row.rows[0]!.totp_secret_enc, 'secret phải được mã hoá').not.toContain(totp.secret)
    })

    test('ログイン: mật khẩu đúng → bước 確認コード → vào app', async () => {
        await context.clearCookies()
        await openLogin(page)
        await submitPassword(page, SEEDED.email)

        await expect(page.getByRole('heading', { name: T.name })).toBeVisible()
        await expect(page, 'chưa nhập mã thì chưa được vào app').toHaveURL(/\/login/)
        await page.mouse.move(0, 0)
        await captureFixedUi(page, 'admin-totp-login-code-step')

        await fillCode(page, await nextCode(page, totp))
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).not.toHaveURL(/\/login/)
    })

    test('端末を変更: mất máy → リカバリーコード → QR mới; đăng nhập lại bằng máy mới', async () => {
        await openTotpSettings(page, '/account')
        const oldSecret = totp.secret
        const changed = await changeDevice(page, { recoveryCode: recovery[0]! }, 'admin-totp')
        expect(changed.totp.secret, 'phải là khoá mới').not.toBe(oldSecret)
        totp = changed.totp

        // Trusted browsers are forgotten with the change: the code step is asked again.
        await context.clearCookies({ name: 'rt' })
        await openLogin(page)
        await submitPassword(page, SEEDED.email)
        await expect(page.getByRole('heading', { name: T.name })).toBeVisible()
        await fillCode(page, await nextCode(page, totp))
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).not.toHaveURL(/\/login/)
    })
})
