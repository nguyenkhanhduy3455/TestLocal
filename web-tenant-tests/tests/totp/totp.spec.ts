import { expect, test, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import {
    T,
    changeDevice,
    openTotpSettings,
    fillCode,
    flushConfigCache,
    nextCode,
    openLogin,
    readRecoveryCodes,
    readSecret,
    submitPassword,
} from './totp-helpers'

/**
 * 二段階認証 (TOTP) cho đăng nhập web-tenant — nhánh feat/tenant-totp.
 *
 * FACT bám theo source:
 *  - Ô 確認コード là 6 ô 1 chữ số (group aria-label 確認コード, từng ô 「確認コード N」).
 *  - apps/web-tenant/src/features/totp/locales/ja.ts (mọi chuỗi UI bên dưới)
 *  - BE: POST /tenant/auth/login trả { step: done | totp | totp_setup }; mã TOTP
 *    RFC 6238 (SHA1, 6 số, 30 giây, lệch ±1 bước), mỗi bước chỉ dùng 1 lần
 *    (totp_last_step) ⇒ helper `nextCode` luôn lấy bước sau bước đã dùng.
 *  - Cookie "ghi nhớ trình duyệt" td_* nằm ở Path=/api/tenant/auth, sống 1 ngày; ô 「このブラウザでは省略」 mặc định đã tick.
 *
 * Dữ liệu: spec tự seed 2 user riêng (KHÔNG bật TOTP cho ADMIN_USER — làm thế là
 * khoá login của mọi spec khác). Hai user dùng lại password_hash của ADMIN_USER
 * nên đăng nhập bằng ADMIN_USER.password. User A có role admin (users.manage) để
 * bật 「全ユーザーに二段階認証を必須にする」; user B chưa có TOTP để đi luồng bắt buộc.
 *
 * ⚠️ Trong lúc ca bắt buộc chạy, mọi user chưa có TOTP (kể cả ADMIN_USER) bị chặn
 * ⇒ chạy spec này MỘT MÌNH. afterAll trả cấu hình `sec` về như cũ (DB + DEL cache
 * config trong Redis qua docker) và xoá 2 user kèm bảng archive *_deleted.
 *
 * Ngân sách login (policy Login = 10/phút/IP, mọi request qua nginx chung 1 IP):
 * spec dùng 9 lượt (login ×5, login/totp ×2, login/totp/setup + confirm).
 */

test.describe.configure({ mode: 'serial' })

const USER_A = { userNo: 9901, email: 'e2e-totp-a@example.test', name: 'E2E TOTP A' }
const USER_B = { userNo: 9902, email: 'e2e-totp-b@example.test', name: 'E2E TOTP B' }
const SEEDED = [USER_A, USER_B]

// ── Seed / cleanup ──────────────────────────────────────────────────────────

let secOriginal: unknown = undefined

async function deleteSeededUsers(): Promise<void> {
    await withDb(async (c) => {
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

async function restoreSecConfig(): Promise<void> {
    await withDb(async (c) => {
        if (secOriginal === undefined) {
            await c.query(`DELETE FROM tenant_config WHERE namespace = 'sec'`)
        } else {
            await c.query(`UPDATE tenant_config SET value = $1 WHERE namespace = 'sec'`, [secOriginal])
        }
        await c.query(`DELETE FROM tenant_config_deleted WHERE namespace = 'sec'`)
    })
    flushConfigCache()
}

// ── UI helpers ──────────────────────────────────────────────────────────────

/** Xoá cookie phiên rồi nạp lại /login (accessToken chỉ nằm trong RAM). */
async function signOut(page: Page, keepTrustedDevice = false): Promise<void> {
    if (keepTrustedDevice) await page.context().clearCookies({ name: 'rt' })
    else await page.context().clearCookies()
    await openLogin(page)
}

// ── Spec ────────────────────────────────────────────────────────────────────

test.describe('二段階認証 (TOTP)', () => {
    let page: Page
    let totpA = { secret: '', lastStep: 0 }
    let recoveryA: string[] = []

    test.beforeAll(async ({ browser }) => {
        skipWithReason(!dbEnabled, 'cần DB (TEST_DB=1) để seed user riêng cho TOTP')
        await deleteSeededUsers()
        await withDb(async (c) => {
            const sec = await c.query<{ value: unknown }>(
                `SELECT value FROM tenant_config WHERE namespace = 'sec'`,
            )
            secOriginal = sec.rows[0]?.value
            const admin = await c.query<{ password_hash: string }>(
                'SELECT password_hash FROM app_user WHERE email = $1',
                [ADMIN_USER.email],
            )
            const role = await c.query<{ id: string }>(`SELECT id FROM app_role WHERE code = 'admin'`)
            for (const u of SEEDED) {
                const ins = await c.query<{ id: string }>(
                    `INSERT INTO app_user (user_no, email, display_name, password_hash)
                     VALUES ($1, $2, $3, $4) RETURNING id`,
                    [u.userNo, u.email, u.name, admin.rows[0]!.password_hash],
                )
                await c.query(
                    'INSERT INTO app_user_role (user_id, role_id, created_at) VALUES ($1, $2, now())',
                    [ins.rows[0]!.id, role.rows[0]!.id],
                )
            }
        })
        page = await browser.newPage()
    })

    test.afterAll(async () => {
        await page?.close()
        if (!dbEnabled) return
        await restoreSecConfig()
        await deleteSeededUsers()
    })

    test('個人設定: bật TOTP → QR + mã → 10 リカバリーコード → trạng thái 有効', async () => {
        await openLogin(page)
        await submitPassword(page, USER_A.email)
        await expect(page).toHaveURL(/\/$/)

        await page.goto('/account/profile', { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: T.enable, exact: true }).click()

        const dialog = page.getByRole('dialog')
        totpA.secret = await readSecret(dialog)
        await captureFixedUi(dialog, 'totp-setup-dialog')
        await fillCode(dialog, await nextCode(page, totpA))
        await dialog.getByRole('button', { name: T.confirmSetup, exact: true }).click()

        recoveryA = await readRecoveryCodes(dialog)
        const done = dialog.getByRole('button', { name: T.done })
        await expect(done, 'chưa tick 「保存しました」 thì 完了 phải khoá').toBeDisabled()
        await captureFixedUi(dialog, 'totp-recovery-codes')
        await dialog.getByLabel(T.saved).click()
        await done.click()

        await expect(page.getByText(T.enabledToast, { exact: true })).toBeVisible()
        await expect(page.getByText(/^有効（/)).toBeVisible()
        await captureFixedUi(page, 'totp-profile-enabled')

        const enc = await withDb((c) =>
            c.query<{ totp_secret_enc: string | null }>(
                'SELECT totp_secret_enc FROM app_user WHERE email = $1',
                [USER_A.email],
            ),
        )
        expect(enc.rows[0]!.totp_secret_enc, 'secret phải được mã hoá, không lưu Base32 trần').not.toContain(
            totpA.secret,
        )
    })

    test('ログイン: mật khẩu đúng → bước 確認コード → vào app', async () => {
        await signOut(page)
        await submitPassword(page, USER_A.email)

        await expect(page.getByRole('heading', { name: T.name })).toBeVisible()
        await expect(page, 'chưa nhập mã thì chưa được vào app').toHaveURL(/\/login/)
        // Chuột còn nằm ở chỗ nút ログイン = đúng chỗ nút 戻る → ảnh bị hover; dời chuột đi trước khi chụp.
        await page.mouse.move(0, 0)
        await captureFixedUi(page, 'totp-login-code-step')

        await fillCode(page, await nextCode(page, totpA))
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test('ログイン: リカバリーコード + ghi nhớ trình duyệt', async () => {
        await signOut(page)
        await submitPassword(page, USER_A.email)

        await page.getByRole('button', { name: T.useRecovery }).click()
        await page.getByRole('textbox', { name: T.recoveryLabel }).fill(recoveryA[0]!)
        await expect(page.getByLabel(T.rememberDevice), 'mặc định đã tick sẵn').toBeChecked()
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test('ログイン: trình duyệt đã ghi nhớ → bỏ qua bước mã', async () => {
        await signOut(page, true)
        await submitPassword(page, USER_A.email)
        await expect(page).toHaveURL(/\/$/)
    })

    test('端末を変更: mật khẩu + mã máy cũ → QR mới → リカバリーコード mới', async () => {
        await openTotpSettings(page, '/account/profile')
        const changed = await changeDevice(page, { code: await nextCode(page, totpA) }, 'totp')
        expect(changed.totp.secret, 'phải là khoá mới').not.toBe(totpA.secret)
        totpA = changed.totp
        await expect(page.getByText(/^有効（/)).toBeVisible()
    })

    test('セキュリティ設定: bật bắt buộc → user chưa có TOTP phải thiết lập ngay khi login', async () => {
        // Reached from 初期設定 (last button of <<機能設定>>), not マスタ登録.
        await page.goto('/settings/general', { waitUntil: 'domcontentloaded' })
        const menuButton = page.getByRole('button', { name: 'セキュリティ設定' })
        await expect(menuButton).toBeVisible()
        await captureFixedUi(page, 'totp-initial-settings-menu')
        await menuButton.click()
        await expect(page).toHaveURL(/\/settings\/security$/)
        await page.getByLabel(T.forceLabel).click()
        await captureFixedUi(page, 'totp-security-settings')
        await page.keyboard.press('F9')
        await page.getByRole('button', { name: 'はい' }).click()
        await expect(page.getByText(T.savedToast, { exact: true })).toBeVisible()
        await page.keyboard.press('F10')
        await expect(page, 'F10 戻る về 初期設定').toHaveURL(/\/settings\/general$/)

        await signOut(page)
        await submitPassword(page, USER_B.email)

        const notice = page.getByRole('dialog')
        await expect(notice.getByText(T.requiredTitle)).toBeVisible()
        await captureFixedUi(notice, 'totp-required-dialog')
        await notice.getByRole('button', { name: T.requiredOk }).click()

        const totpB = { secret: await readSecret(page), lastStep: 0 }
        await fillCode(page, await nextCode(page, totpB))
        await page.getByRole('button', { name: T.confirmSetup, exact: true }).click()

        await readRecoveryCodes(page)
        await page.getByLabel(T.saved).click()
        await page.getByRole('button', { name: T.continue }).click()
        await expect(page).toHaveURL(/\/$/)
    })
})
