import { createHmac } from 'node:crypto'
import { execSync } from 'node:child_process'

import { expect, test, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER, JA } from '../_shared/test-data'

/**
 * 二段階認証 (TOTP) cho đăng nhập web-tenant — nhánh feat/tenant-totp.
 *
 * FACT bám theo source:
 *  - Ô 確認コード là 6 ô 1 chữ số (group aria-label 確認コード, từng ô 「確認コード N」).
 *  - apps/web-tenant/src/features/totp/locales/ja.ts (mọi chuỗi UI bên dưới)
 *  - BE: POST /tenant/auth/login trả { step: done | totp | totp_setup }; mã TOTP
 *    RFC 6238 (SHA1, 6 số, 30 giây, lệch ±1 bước), mỗi bước chỉ dùng 1 lần
 *    (totp_last_step) ⇒ helper `nextCode` luôn lấy bước sau bước đã dùng.
 *  - Cookie "ghi nhớ trình duyệt" td_* nằm ở Path=/api/tenant/auth, sống 30 ngày.
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

const REDIS_CONTAINER = process.env.TEST_REDIS_CONTAINER ?? 'ochacom_redis'
const REDIS_PASS = process.env.TEST_REDIS_PASSWORD ?? 'ochacom_redis_pass'

const T = {
    name: '二段階認証',
    codeLabel: '確認コード',
    submitCode: '確認',
    useRecovery: 'リカバリーコードを使う',
    recoveryLabel: 'リカバリーコード',
    rememberDevice: '30日間このブラウザでは省略',
    enable: '設定する',
    confirmSetup: '設定する',
    recoveryList: 'リカバリーコード',
    saved: '保存しました',
    done: '完了',
    continue: '続ける',
    requiredTitle: '二段階認証の設定が必要です',
    requiredOk: '設定する',
    forceLabel: '全ユーザーに二段階認証を必須にする',
    savedToast: '保存しました',
    enabledToast: '設定しました',
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────

const STEP_MS = 30_000

function base32Decode(input: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = 0
    let value = 0
    const out: number[] = []
    for (const ch of input.replace(/[\s=]/g, '').toUpperCase()) {
        value = (value << 5) | alphabet.indexOf(ch)
        bits += 5
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff)
            bits -= 8
        }
    }
    return Buffer.from(out)
}

function codeAt(secret: string, step: number): string {
    const counter = Buffer.alloc(8)
    counter.writeBigUInt64BE(BigInt(step))
    const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
    const offset = hmac[hmac.length - 1] & 0x0f
    const bin = hmac.readUInt32BE(offset) & 0x7fffffff
    return String(bin % 1_000_000).padStart(6, '0')
}

/** Mã của bước chưa dùng kế tiếp; nếu bước đó còn quá xa (> +1) thì chờ tới gần. */
async function nextCode(page: Page, totp: { secret: string; lastStep: number }): Promise<string> {
    const step = Math.max(Math.floor(Date.now() / STEP_MS), totp.lastStep + 1)
    const waitMs = (step - 1) * STEP_MS - Date.now()
    if (waitMs > 0) await page.waitForTimeout(waitMs + 500)
    totp.lastStep = step
    return codeAt(totp.secret, step)
}

// ── Seed / cleanup ──────────────────────────────────────────────────────────

function flushConfigCache(): void {
    const redis = `docker exec -i ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASS} --no-auth-warning`
    execSync(`${redis} --scan --pattern 'tenant:*:cache:config:*' | xargs -r ${redis} DEL`, {
        stdio: 'pipe',
    })
}

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

/**
 * Nạp /login, chờ form hiện. Vite dev thỉnh thoảng nhả hụt module ngay sau restart ⇒ trang
 * trắng; đó là môi trường (user-master.spec gặp y hệt) nên nạp lại tối đa 3 lần.
 */
async function openLogin(page: Page): Promise<void> {
    const email = page.getByLabel(JA.emailLabel)
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        if (await email.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) return
        console.log(`openLogin: lượt ${attempt}/3 trang trắng (Vite dev) → nạp lại`)
    }
    await expect(email, 'form login không hiện sau 3 lần nạp').toBeVisible()
}

async function submitPassword(page: Page, email: string): Promise<void> {
    await page.getByLabel(JA.emailLabel).fill(email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
}

/** Đọc khoá Base32 hiển thị dưới QR (nhóm 4 ký tự, cách nhau bởi dấu cách). */
async function readSecret(scope: ReturnType<Page['locator']> | Page): Promise<string> {
    const text = await scope.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).innerText()
    return text.replace(/\s/g, '')
}

/** Ô mã là 6 ô 1 chữ số: gõ vào ô đầu, app tự nhảy sang ô sau. */
async function fillCode(scope: ReturnType<Page['locator']> | Page, code: string): Promise<void> {
    const cells = scope.getByRole('group', { name: T.codeLabel }).getByRole('textbox')
    await expect(cells).toHaveCount(6)
    await cells.first().click()
    await cells.first().page().keyboard.type(code)
    for (let i = 0; i < 6; i++) await expect(cells.nth(i)).toHaveValue(code[i])
}

async function readRecoveryCodes(scope: ReturnType<Page['locator']> | Page): Promise<string[]> {
    const list = scope.getByRole('list', { name: T.recoveryList })
    await expect(list.getByRole('listitem')).toHaveCount(10)
    return list.getByRole('listitem').allInnerTexts()
}

// ── Spec ────────────────────────────────────────────────────────────────────

test.describe('二段階認証 (TOTP)', () => {
    let page: Page
    const totpA = { secret: '', lastStep: 0 }
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
                    [u.userNo, u.email, u.name, admin.rows[0].password_hash],
                )
                await c.query(
                    'INSERT INTO app_user_role (user_id, role_id, created_at) VALUES ($1, $2, now())',
                    [ins.rows[0].id, role.rows[0].id],
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
        expect(enc.rows[0].totp_secret_enc, 'secret phải được mã hoá, không lưu Base32 trần').not.toContain(
            totpA.secret,
        )
    })

    test('ログイン: mật khẩu đúng → bước 確認コード → vào app', async () => {
        await signOut(page)
        await submitPassword(page, USER_A.email)

        await expect(page.getByRole('heading', { name: T.name })).toBeVisible()
        await expect(page, 'chưa nhập mã thì chưa được vào app').toHaveURL(/\/login/)
        await captureFixedUi(page, 'totp-login-code-step')

        await fillCode(page, await nextCode(page, totpA))
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test('ログイン: リカバリーコード + ghi nhớ trình duyệt', async () => {
        await signOut(page)
        await submitPassword(page, USER_A.email)

        await page.getByRole('button', { name: T.useRecovery }).click()
        await page.getByRole('textbox', { name: T.recoveryLabel }).fill(recoveryA[0])
        await page.getByLabel(T.rememberDevice).click()
        await page.getByRole('button', { name: T.submitCode, exact: true }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test('ログイン: trình duyệt đã ghi nhớ → bỏ qua bước mã', async () => {
        await signOut(page, true)
        await submitPassword(page, USER_A.email)
        await expect(page).toHaveURL(/\/$/)
    })

    test('セキュリティ設定: bật bắt buộc → user chưa có TOTP phải thiết lập ngay khi login', async () => {
        await page.goto('/settings/security', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(T.forceLabel).click()
        await captureFixedUi(page, 'totp-security-settings')
        await page.keyboard.press('F9')
        await page.getByRole('button', { name: 'はい' }).click()
        await expect(page.getByText(T.savedToast, { exact: true })).toBeVisible()

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
