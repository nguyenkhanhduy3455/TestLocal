import {
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
    expect,
    test,
} from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { makeStep, skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

/**
 * web-admin /tenants — 4 nút migration: 更新 / 復元 (trên từng dòng tenant) và
 * 次の段階を実行 / 残りをすべて実行 (khung ≪マイグレーション≫). CHẠY THẬT: job
 * migration thật trên Hangfire, đổi schema thật của t_tenant1 / t_tenant2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ GHI THẬT — CHỈ CHẠY KHI TEST_ALLOW_MIGRATE=1 VÀ TEST_DB=1 (Rule 18.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 更新 / rollout áp MỌI migration còn thiếu của build lên tenant, không chỉ
 *    migration probe (lần chạy đầu trên demo1 còn áp cả add-trn-trn-del-flg).
 *  - Migration probe High có RequiresMaintenance ⇒ tenant ĐÓNG (503) vài giây
 *    lúc 更新 / 復元. Chạy RIÊNG file này, đừng chạy chung suite tenant:
 *      TEST_DB=1 TEST_ALLOW_MIGRATE=1 npx playwright test tests/admin-tenants/tenant-migration-buttons.spec.ts
 *  - DB dùng để: soi bảng probe, và gỡ cờ 保留 của tenant2 (xem TC-5).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION PROBE (chỉ có trên demo1, nhánh test/e2e-migration-probe)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 20261008034546-add-e2e-migration-probe   Low : CREATE TABLE e2e_migration_probe
 *    (id, label, val) + 2 dòng (1,'a',1), (2,'b',2).
 *  - 20261008034549-scale-e2e-migration-probe High: UPDATE … SET val = val * 10,
 *    BackupTables = [e2e_migration_probe], RequiresMaintenance.
 *  ⇒ áp đủ: val = [10, 20]; 復元 về trước High: val = [1, 2].
 *  復元 chỉ nhận migration High ÁP GẦN NHẤT ⇒ PROBE_HIGH phải là migration mới
 *  nhất của build. Có migration mới hơn ⇒ spec skip kèm lý do (TC-0).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LẶP LẠI ĐƯỢC — CHẠY LẦN 2, 3… VẪN ĐO THẬT
 * ═══════════════════════════════════════════════════════════════════════════
 *  - tenant1: TC-1 更新 (lần đầu áp thật; lần sau đã 最新 ⇒ chỉ đo nút mờ) →
 *    TC-2 復元 về trước PROBE_HIGH → TC-3 更新 áp lại PROBE_HIGH. TC-3 luôn đo
 *    更新 thật vì TC-2 vừa đẩy tenant1 lùi lại.
 *  - tenant2: rollout BỎ QUA tenant 保留 (RolloutExecutor: includeHeld chỉ cho
 *    rerun). Nên TC-5 nếu tenant2 đã 最新 thì 復元 nó rồi UPDATE thẳng
 *    platform.tenant_migration_state về 'ready' — schema vẫn đang thiếu
 *    PROBE_HIGH, rollout sẽ áp nó thật.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTS GHIM TỪ SOURCE (Rule 21) — ochacom-saas demo1, web-admin
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Chuỗi UI: features/tenants/migrations/locales/ja.ts.
 *  - Dòng tenant là `div.grid … border-b` (không có role=row) — tenant-list-table.tsx.
 *  - Badge: 最新 / 更新あり / 実行中 / 失敗 / 保留（復元済み） / 未記録.
 *  - Danh sách migration tự tải lại mỗi 5s (use-tenant-migrations.ts) ⇒ chờ bằng
 *    expect auto-retry, không reload.
 *  - 更新 / rollout dùng ConfirmDialog và Dialog của 復元 đều role dialog (mỗi lúc chỉ mở một).
 *  - Không có InternalSlugs ⇒ 2 tenant chung 1 đợt ⇒ 次の段階を実行 kết thúc
 *    ở 完了 (không phải 一時停止). Spec nhận cả hai.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 1 LOGIN (Rule 10.1) — page riêng, KHÔNG dùng authedPage (Rule 19.2)
 * ═══════════════════════════════════════════════════════════════════════════
 * authedPage login vào app TENANT; đây cần phiên super-admin ở admin.ochacom.local.
 * `serial`: các testcase nối trạng thái, thứ tự có ý nghĩa — chạy lẻ một test ở
 * giữa sẽ sai; một test đỏ thì các test sau bị skip.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'
const ALLOW_MIGRATE = process.env.TEST_ALLOW_MIGRATE === '1'

const PROBE_LOW = '20261008034546'
const PROBE_HIGH = '20261008034549'
const PROBE_TABLE = 'e2e_migration_probe'
const VALS_APPLIED = [10, 20]
const VALS_RESTORED = [1, 2]

const TENANT1 = { slug: 'tenant1', schema: 't_tenant1' }
const TENANT2 = { slug: 'tenant2', schema: 't_tenant2' }

/** Một job migration (gồm drain 3s + backup S3) — rộng tay cho dev server. */
const JOB_TIMEOUT = 120_000

const JA = {
    upToDate: '最新',
    outdated: '更新あり',
    held: '保留（復元済み）',
    failed: '失敗',
    update: '更新',
    updateConfirm: '更新する',
    restore: '復元',
    restoreConfirm: '復元する',
    restoreMigrationId: 'マイグレーションID',
    restoreTypeSlug: /確認のため/,
    restoreLoss: /次の表への適用後の変更/,
    notRestorable:
        'このテナントに適用済みの、影響度 High のマイグレーションではないため復元できません。',
    queued: 'ジョブを登録しました。進行状況は一覧に反映されます。',
    latest: (id: string) => `最新マイグレーション ${id}`,
    section: '≪マイグレーション≫',
    next: '次の段階を実行',
    all: '残りをすべて実行',
    run: '実行する',
    completed: '完了',
    paused: '一時停止',
    upToDateHint: '最新のマイグレーションまで適用済みです',
} as const

async function probeVals(schema: string): Promise<number[] | null> {
    return withDb(async (c) => {
        const exists = await c.query<{ ok: boolean }>(
            'SELECT to_regclass($1) IS NOT NULL AS ok',
            [`${schema}.${PROBE_TABLE}`],
        )
        if (!exists.rows[0]?.ok) return null
        const r = await c.query<{ val: number }>(
            `SELECT val FROM "${schema}".${PROBE_TABLE} ORDER BY id`,
        )
        return r.rows.map((x) => x.val)
    })
}

async function newAdminPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.goto('/login?from=%2Ftenants', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
    await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(
        page,
        'login admin không vào /tenants — rate-limit (Rule 10.1) hoặc sai tài khoản super-admin',
    ).toHaveURL(/\/tenants/)
    return { context, page }
}

test.describe('web-admin /tenants — 更新 / 復元 / 次の段階を実行 / 残りをすべて実行 (chạy thật)', () => {
    let context: BrowserContext | undefined
    let page: Page
    let skipReason = ''

    const row = (slug: string): Locator =>
        page
            .locator('div.grid.border-b')
            .filter({ has: page.getByText(slug, { exact: true }) })
    const badge = (slug: string, text: string): Locator =>
        row(slug).getByText(text, { exact: true })
    /** Cột migration tải riêng (GET /admin/tenant-migrations) — chờ nó trước khi đọc badge (Rule 10.8). */
    const migrationLoaded = (slug: string) =>
        expect(
            row(slug).getByText(/^(最新|更新あり|保留（復元済み）|失敗|未記録|実行中)$/),
        ).toBeVisible()
    const updateButton = (slug: string): Locator =>
        row(slug).getByRole('button', { name: JA.update, exact: true })
    const section = (): Locator =>
        page.locator('div.mt-3').filter({ has: page.getByText(JA.section, { exact: true }) })
    const rolloutStatus = (): Locator =>
        section().locator('dt', { hasText: '状態' }).locator('xpath=following-sibling::dd[1]')

    async function confirmUpdate(slug: string, from: RegExp): Promise<void> {
        await updateButton(slug).click()
        const dialog = page.getByRole('dialog')
        await expect(dialog, 'hộp xác nhận ghi "từ X lên bản mới nhất"').toContainText(from)
        await expect(dialog).toContainText(`${PROBE_HIGH} まで`)
        await dialog.getByRole('button', { name: JA.updateConfirm }).click()
        await expect(page.getByText(JA.queued).first()).toBeVisible()
    }

    async function restoreHigh(slug: string): Promise<void> {
        await row(slug).getByRole('button', { name: JA.restore, exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel(JA.restoreMigrationId).fill(PROBE_HIGH)
        await expect(dialog.getByText(JA.restoreLoss), 'preview liệt kê bảng bị ghi đè').toContainText(
            PROBE_TABLE,
        )
        const submit = dialog.getByRole('button', { name: JA.restoreConfirm })
        await expect(submit, 'chưa gõ slug thì chưa được 復元').toBeDisabled()
        await dialog.getByLabel(JA.restoreTypeSlug).fill(slug)
        await submit.click()
        await expect(page.getByText(JA.queued).first()).toBeVisible()
        await expect(dialog).toBeHidden()
        await expect(badge(slug, JA.held), `${slug} sau 復元 phải là 保留`).toBeVisible({
            timeout: JOB_TIMEOUT,
        })
    }

    /**
     * id của rollout gần nhất, đọc từ lần tự tải lại kế tiếp của màn (≤ 5s). Không đọc
     * dòng 実行者: thời điểm hiện theo PHÚT, hai rollout trong cùng phút trông y hệt nhau.
     */
    async function nextRolloutId(): Promise<string | null> {
        const res = await page.waitForResponse(
            (r) => r.request().method() === 'GET' && /\/admin\/tenant-migrations$/.test(r.url()),
        )
        const body = (await res.json()) as { data?: { latestRollout?: { id?: string } } }
        return body.data?.latestRollout?.id ?? null
    }

    async function startRollout(label: string): Promise<void> {
        const before = await nextRolloutId()
        const button = section().getByRole('button', { name: label })
        await expect(button, 'không có rollout nào đang chạy ⇒ nút phải bật').toBeEnabled()
        await button.click()
        await page.getByRole('dialog').getByRole('button', { name: JA.run }).click()
        await expect(page.getByText(JA.queued).first()).toBeVisible()
        await expect
            .poll(nextRolloutId, { timeout: JOB_TIMEOUT, message: 'phải có rollout MỚI' })
            .not.toBe(before)
    }

    test.beforeAll(async ({ browser }) => {
        if (!ALLOW_MIGRATE) {
            skipReason =
                'TEST_ALLOW_MIGRATE=1 chưa bật — spec áp migration THẬT lên tenant1/tenant2 (Rule 18.1)'
            return
        }
        if (!dbEnabled) {
            skipReason = 'TEST_DB=1 chưa bật — cần DB để soi bảng probe và gỡ 保留 của tenant2'
            return
        }
        ;({ context, page } = await newAdminPage(browser))
    })

    test.afterAll(async () => {
        await context?.close()
    })

    test('TC-0 — build có migration probe và PROBE_HIGH là migration mới nhất', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const latest = page.getByText(/^最新マイグレーション /)
        await expect(latest).toBeVisible()
        const text = await latest.innerText()
        if (text !== JA.latest(PROBE_HIGH)) {
            skipReason =
                `build không ở PROBE_HIGH (${text}) — demo1 thiếu nhánh test/e2e-migration-probe, ` +
                'hoặc đã có migration mới hơn nên 復元 PROBE_HIGH không còn hợp lệ'
        }
        skipWithReason(skipReason !== '', skipReason)
        await migrationLoaded(TENANT1.slug)
        await migrationLoaded(TENANT2.slug)
    })

    test('TC-1 — 更新 tenant1: áp lần lượt migration còn thiếu tới bản mới nhất (lần sau: nút mờ)', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const step = makeStep(page)
        await migrationLoaded(TENANT1.slug)

        if (await badge(TENANT1.slug, JA.upToDate).isVisible()) {
            console.log('tenant1 đã 最新 từ lần chạy trước → chỉ đo nút mờ; 更新 thật đo ở TC-3')
            await expect(updateButton(TENANT1.slug)).toBeDisabled()
            await expect(updateButton(TENANT1.slug)).toHaveAttribute('title', JA.upToDateHint)
            return
        }

        await confirmUpdate(TENANT1.slug, /から/)
        await step()
        await expect(badge(TENANT1.slug, JA.upToDate), 'job 更新 xong ⇒ 最新').toBeVisible({
            timeout: JOB_TIMEOUT,
        })
        await expect(row(TENANT1.slug)).toContainText(PROBE_HIGH)
        await expect(updateButton(TENANT1.slug)).toBeDisabled()
        expect(await probeVals(TENANT1.schema), 'Low tạo bảng + High nhân 10').toEqual(VALS_APPLIED)
    })

    test('TC-2 — 復元 tenant1 về trước PROBE_HIGH: dữ liệu quay lại, tenant 保留', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await restoreHigh(TENANT1.slug)
        await expect(updateButton(TENANT1.slug), '保留 ⇒ 更新 bật lại').toBeEnabled()
        expect(await probeVals(TENANT1.schema), 'bảng probe chép lại từ backup').toEqual(VALS_RESTORED)
        await captureFixedUi(page, 'admin-tenants-after-restore')
    })

    test('TC-3 — 更新 tenant1 lần nữa: áp lại PROBE_HIGH thật', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await confirmUpdate(TENANT1.slug, new RegExp(`${PROBE_LOW} から`))
        await expect(badge(TENANT1.slug, JA.upToDate)).toBeVisible({ timeout: JOB_TIMEOUT })
        expect(await probeVals(TENANT1.schema)).toEqual(VALS_APPLIED)
    })

    test('TC-4 — 復元 migration Low: server từ chối ngay ở bước xem trước, nút 復元する mờ', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await row(TENANT1.slug).getByRole('button', { name: JA.restore, exact: true }).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByLabel(JA.restoreMigrationId).fill(PROBE_LOW)
        await expect(dialog.getByText(JA.notRestorable)).toBeVisible()
        await expect(dialog.getByRole('button', { name: JA.restoreConfirm })).toBeDisabled()
        await dialog.getByRole('button', { name: 'キャンセル' }).click()
        await expect(dialog).toBeHidden()
        expect(await probeVals(TENANT1.schema), 'không có gì bị đụng').toEqual(VALS_APPLIED)
    })

    test('TC-5 — 次の段階を実行: rollout migrate tenant2 thật', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await migrationLoaded(TENANT2.slug)

        if (await badge(TENANT2.slug, JA.upToDate).isVisible()) {
            console.log('tenant2 đã 最新 → 復元 về trước PROBE_HIGH rồi gỡ 保留 để rollout có việc')
            await restoreHigh(TENANT2.slug)
            const cleared = await withDb((c) =>
                c.query(
                    `UPDATE platform.tenant_migration_state s SET status = 'ready', error = NULL,
                            updated_at = now()
                     FROM platform.tenants t
                     WHERE t.id = s.tenant_id AND t.slug = $1 AND s.status = 'held'`,
                    [TENANT2.slug],
                ),
            )
            expect(cleared.rowCount, 'gỡ 保留 của tenant2').toBe(1)
            await expect(badge(TENANT2.slug, JA.outdated)).toBeVisible({ timeout: 15_000 })
        }
        expect(await probeVals(TENANT2.schema), 'trước rollout tenant2 chưa có PROBE_HIGH').not.toEqual(
            VALS_APPLIED,
        )

        await startRollout(JA.next)
        await expect(rolloutStatus()).toHaveText(new RegExp(`^(${JA.completed}|${JA.paused})$`), {
            timeout: JOB_TIMEOUT,
        })
        await expect(section(), 'không tenant nào lỗi').toContainText('失敗 0')
        await expect(badge(TENANT2.slug, JA.upToDate)).toBeVisible({ timeout: 15_000 })
        expect(await probeVals(TENANT2.schema)).toEqual(VALS_APPLIED)
    })

    test('TC-6 — 残りをすべて実行: rollout chạy hết, mọi tenant đã 最新 ⇒ chỉ bỏ qua, 完了', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await startRollout(JA.all)
        await expect(rolloutStatus()).toHaveText(JA.completed, { timeout: JOB_TIMEOUT })
        await expect(section()).toContainText('成功 0 ／ 失敗 0')
        for (const t of [TENANT1, TENANT2]) {
            await expect(badge(t.slug, JA.upToDate)).toBeVisible()
            expect(await probeVals(t.schema)).toEqual(VALS_APPLIED)
        }
        await captureFixedUi(page, 'admin-tenants-after-rollout')
    })
})
