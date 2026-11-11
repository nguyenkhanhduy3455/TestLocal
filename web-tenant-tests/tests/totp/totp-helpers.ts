/**
 * Helper dùng chung cho các spec 二段階認証 (TOTP): sinh mã RFC 6238, ô mã 6 chữ số,
 * nạp /login, cache config Redis. Chuỗi UI bám apps/web-tenant/src/features/totp/locales/ja.ts.
 */
import { createHmac } from 'node:crypto'
import { execSync } from 'node:child_process'

import { expect, type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { ADMIN_USER, JA } from '../_shared/test-data'

const REDIS_CONTAINER = process.env.TEST_REDIS_CONTAINER ?? 'ochacom_redis'
const REDIS_PASS = process.env.TEST_REDIS_PASSWORD ?? 'ochacom_redis_pass'

export const T = {
    name: '二段階認証',
    codeLabel: '確認コード',
    submitCode: '確認',
    useRecovery: 'リカバリーコードを使う',
    recoveryLabel: 'リカバリーコード',
    rememberDevice: 'このブラウザでは省略',
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
    change: '端末を変更',
    changeNext: '次へ',
    changedToast: '端末を変更しました',
}

// ── TOTP (RFC 6238) ─────────────────────────────────────────────────────────

const STEP_MS = 30_000

export type TotpState = { secret: string; lastStep: number }

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
    const offset = hmac.readUInt8(hmac.length - 1) & 0x0f
    const bin = hmac.readUInt32BE(offset) & 0x7fffffff
    return String(bin % 1_000_000).padStart(6, '0')
}

/**
 * Mã của bước chưa dùng kế tiếp (BE chặn dùng lại bước cũ qua totp_last_step);
 * nếu bước đó còn quá xa (> +1) thì chờ tới gần.
 */
export async function nextCode(page: Page, totp: TotpState): Promise<string> {
    const step = Math.max(Math.floor(Date.now() / STEP_MS), totp.lastStep + 1)
    const waitMs = (step - 1) * STEP_MS - Date.now()
    if (waitMs > 0) await page.waitForTimeout(waitMs + 500)
    totp.lastStep = step
    return codeAt(totp.secret, step)
}

// ── Redis ───────────────────────────────────────────────────────────────────

/** tenant_config có cache Redis ~1h: sửa DB xong phải xoá cache thì API mới đọc lại. */
export function flushConfigCache(): void {
    const redis = `docker exec -i ${REDIS_CONTAINER} redis-cli -a ${REDIS_PASS} --no-auth-warning`
    execSync(`${redis} --scan --pattern 'tenant:*:cache:config:*' | xargs -r ${redis} DEL`, {
        stdio: 'pipe',
    })
}

// ── UI ──────────────────────────────────────────────────────────────────────

/**
 * Nạp trang login, chờ form hiện. Vite dev thỉnh thoảng nhả hụt module ngay sau restart ⇒
 * trang trắng; đó là môi trường (user-master.spec gặp y hệt) nên nạp lại tối đa 3 lần.
 */
export async function openLogin(page: Page, loginUrl = '/login'): Promise<void> {
    const email = page.getByLabel(JA.emailLabel)
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded' })
        if (await email.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) return
        console.log(`openLogin: lượt ${attempt}/3 trang trắng (Vite dev) → nạp lại`)
    }
    await expect(email, 'form login không hiện sau 3 lần nạp').toBeVisible()
}

/** Nạp `url` tới khi nút 端末を変更 hiện (cùng lý do trang trắng Vite dev như openLogin). */
export async function openTotpSettings(page: Page, url: string): Promise<void> {
    const change = page.getByRole('button', { name: T.change, exact: true })
    for (let attempt = 1; attempt <= 3; attempt++) {
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        if (await change.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false)) return
        console.log(`openTotpSettings: lượt ${attempt}/3 trang trắng (Vite dev) → nạp lại`)
    }
    await expect(change, `nút 端末を変更 không hiện ở ${url}`).toBeVisible()
}

/** User seed dùng lại password_hash của ADMIN_USER ⇒ mật khẩu là ADMIN_USER.password. */
export async function submitPassword(page: Page, email: string): Promise<void> {
    await page.getByLabel(JA.emailLabel).fill(email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
}

/** Đọc khoá Base32 hiển thị dưới QR (nhóm 4 ký tự, cách nhau bởi dấu cách). */
export async function readSecret(scope: Locator | Page): Promise<string> {
    const text = await scope.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/).innerText()
    return text.replace(/\s/g, '')
}

/** Ô mã là 6 ô 1 chữ số: gõ vào ô đầu, app tự nhảy sang ô sau. */
export async function fillCode(scope: Locator | Page, code: string): Promise<void> {
    const cells = scope.getByRole('group', { name: T.codeLabel }).getByRole('textbox')
    await expect(cells).toHaveCount(6)
    await cells.first().click()
    await cells.first().page().keyboard.type(code)
    for (let i = 0; i < 6; i++) await expect(cells.nth(i)).toHaveValue(code.charAt(i))
}

export async function readRecoveryCodes(scope: Locator | Page): Promise<string[]> {
    const list = scope.getByRole('list', { name: T.recoveryList })
    await expect(list.getByRole('listitem')).toHaveCount(10)
    return list.getByRole('listitem').allInnerTexts()
}

/**
 * 個人設定 → 設定する → QR → mã → 10 リカバリーコード → 完了. Trang phải đang đăng nhập.
 * `profileUrl` tuyệt đối khi spec chạy nhiều tenant trên cùng một context.
 */
export async function enableTotpFromProfile(page: Page, profileUrl = '/account/profile'): Promise<{
    totp: TotpState
    recoveryCodes: string[]
}> {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: T.enable, exact: true }).click()

    const dialog = page.getByRole('dialog')
    const totp: TotpState = { secret: await readSecret(dialog), lastStep: 0 }
    await fillCode(dialog, await nextCode(page, totp))
    await dialog.getByRole('button', { name: T.confirmSetup, exact: true }).click()

    const recoveryCodes = await readRecoveryCodes(dialog)
    await dialog.getByLabel(T.saved).click()
    await dialog.getByRole('button', { name: T.done }).click()
    await expect(page.getByText(T.enabledToast, { exact: true })).toBeVisible()
    return { totp, recoveryCodes }
}

/**
 * 端末を変更: password + (mã hiện tại hoặc リカバリーコード) → 次へ → QR máy mới → mã máy mới →
 * 10 リカバリーコード mới → 完了. Trang phải đang ở màn có nút 端末を変更.
 */
export async function changeDevice(
    page: Page,
    proof: { code: string } | { recoveryCode: string },
    capturePrefix: string,
): Promise<{ totp: TotpState; recoveryCodes: string[] }> {
    await page.getByRole('button', { name: T.change, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    if ('code' in proof) {
        await fillCode(dialog, proof.code)
    } else {
        await dialog.getByRole('button', { name: T.useRecovery }).click()
        await dialog.getByRole('textbox', { name: T.recoveryLabel }).fill(proof.recoveryCode)
    }
    await captureFixedUi(dialog, `${capturePrefix}-change-verify`)
    await dialog.getByRole('button', { name: T.changeNext, exact: true }).click()

    const totp: TotpState = { secret: await readSecret(dialog), lastStep: 0 }
    await captureFixedUi(dialog, `${capturePrefix}-change-new-qr`)
    await fillCode(dialog, await nextCode(page, totp))
    await dialog.getByRole('button', { name: T.confirmSetup, exact: true }).click()

    const recoveryCodes = await readRecoveryCodes(dialog)
    await dialog.getByLabel(T.saved).click()
    await dialog.getByRole('button', { name: T.done }).click()
    await expect(page.getByText(T.changedToast, { exact: true })).toBeVisible()
    return { totp, recoveryCodes }
}
