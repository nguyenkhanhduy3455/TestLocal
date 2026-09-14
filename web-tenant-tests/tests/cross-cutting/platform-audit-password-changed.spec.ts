import { expect, test, type Page } from '@playwright/test'

import { login } from '../_shared/auth'
import { dbEnabled, withDb } from '../_shared/db'
import { dbNow } from '../_shared/audit-log'
import { newTestPage } from '../_shared/entry'
import { makeStep, skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

/**
 * パスワード変更 (đổi mật khẩu người dùng tenant) — thao tác có ĐƯỢC ghi vào
 * `platform.audit_logs` hay không.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BUG ĐANG ĐO (fix trên nhánh `investigate/tenant-audit-log-findings`)
 * ═══════════════════════════════════════════════════════════════════════════
 * `TenantChangePasswordHandler` lưu `IAppUserDbContext` (schema tenant) nhưng
 * gọi `IAuditLogWriter.EnqueueAsync`, mà writer đó `Add` vào `AppDbContext`
 * (`platform.audit_logs`). Hai DbContext KHÁC NHAU — `AuditLogWriter.cs:11` lấy
 * `AppDbContext`, handler lấy `IAppUserDbContext` — nên dòng audit được stage
 * vào một ChangeTracker mà không ai trong request đó `SaveChanges`, rồi bị vứt
 * lúc scope kết thúc.
 *
 * KHÔNG có exception, KHÔNG có log: `Add()` không bao giờ fail. API vẫn trả 200
 * và mật khẩu vẫn đổi thật. Nghĩa là **response xanh không chứng minh được gì
 * về nhật ký** — đúng lý do spec này phải soi thẳng Postgres.
 *
 * Trạng thái nghịch lý trước khi fix: nhánh SAI mật khẩu hiện tại
 * (`TenantChangePasswordHandler.cs:75`) dùng `WriteImmediateAsync` nên `login_failed`
 * CÓ được ghi; chỉ nhánh đổi THÀNH CÔNG là mất. Fix chuyển `password_changed`
 * sang `WriteImmediateAsync` và đặt SAU `db.SaveChangesAsync`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO ĐO QUA API CHỨ KHÔNG QUA UI
 * ═══════════════════════════════════════════════════════════════════════════
 * `apps/web-tenant` KHÔNG có màn đổi mật khẩu (grep `change-password` trong
 * `apps/web-tenant/src` ra 0). Endpoint tồn tại và có policy
 * (`TenantAuthEndpoints.cs:64`, `AuthPolicies.TenantUser`) nhưng chưa có màn
 * hình nào gọi. Nên đường duy nhất là `page.request` với header auth bóc từ
 * chính request của app — cùng pattern với `kaigo-hutan-row.spec.ts:426` và
 * `tooth-extraction-siga-restore.spec.ts:267` (accessToken nằm trong RAM,
 * zustand không persist → GUIDELINE 10.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ VÌ SAO PHẢI CÓ CỜ RIÊNG `TEST_ALLOW_PASSWORD_CHANGE=1`
 * ═══════════════════════════════════════════════════════════════════════════
 * Tenant `t_tenant1` chỉ có ĐÚNG MỘT `app_user` có `password_hash`, và đó chính
 * là tài khoản mọi spec dùng để login (`test-data.ts` ADMIN_USER). Đổi mật khẩu
 * của nó thì handler còn làm hai việc nữa:
 *   · `user.TokenVersion += 1` và xoá cache `tenant:{tid}:user:{uid}:tokenVer`
 *     → mọi accessToken đang lưu trong RAM của CÁC WORKER KHÁC bị từ chối NGAY.
 *   · `RevokeAllForUserAsync` → xoá sạch refresh family trong Redis.
 * Tức là chạy chung suite là giết hết page dùng chung của worker khác
 * (`session.ts` fixture worker-scope). Vì vậy:
 *   · spec này KHÔNG dùng fixture `authedPage` — nó tự `newTestPage()` + `login()`,
 *     đúng ngoại lệ đã ghi ở `session.ts` (dòng 74: "spec cần trạng thái đăng
 *     nhập KHÁC admin / đo chính màn login");
 *   · mặc định SKIP. Muốn chạy thì bật cờ và chạy RIÊNG file này:
 *
 *       TEST_DB=1 TEST_ALLOW_PASSWORD_CHANGE=1 \
 *         npx playwright test tests/cross-cutting/platform-audit-password-changed.spec.ts
 *
 * Cùng quy ước với `TEST_ALLOW_INVITE` (gửi mail thật) và `TEST_ALLOW_PRINT`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TỰ KHÔI PHỤC — ĐỌC TRƯỚC KHI SỬA
 * ═══════════════════════════════════════════════════════════════════════════
 * TC-1 đổi `ADMIN_USER.password` → `TEMP_PASSWORD`; TC-4 đổi NGƯỢC lại. Không
 * khôi phục được thì `test-data.ts` thành sai và MỌI spec sau đó không login nổi.
 * `password_hash` là Argon2 nên KHÔNG thể vá bằng SQL — khôi phục chỉ có một
 * đường là gọi lại chính endpoint này. Vì thế:
 *   · TC-4 là testcase, `afterAll` còn một lần thử nữa (idempotent, chỉ chạy khi
 *     TC-4 chưa kịp chạy hoặc đỏ);
 *   · `mode: 'serial'` để TC-4 luôn chạy sau TC-1 trên cùng page/token;
 *   · nếu cả hai đều trượt, console in ra đúng lệnh curl để khôi phục tay.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTS GHIM TỪ SOURCE (Rule 21)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - `AuditEventTypes.cs:31` — `PasswordChanged = "password_changed"`.
 *  - `TenantChangePasswordHandler.cs` — `actorId: null` là CỐ Ý:
 *    `audit_logs.actor_id` có FK sang `platform.super_admins`, còn đây là
 *    `app_user` của tenant, nên danh tính đi vào `meta_json.appUserId`.
 *  - meta_json = `{ actorEmail, appUserId, tenantId }`.
 *  - `PasswordRules.MustBeStrongPassword` — tối thiểu 12 ký tự, đủ
 *    hoa/thường/số/ký hiệu. `TEMP_PASSWORD` phải thoả, nếu không TC-1 ăn 400.
 *  - Handler chặn no-op: mật khẩu mới trùng mật khẩu hiện tại → 409.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

/** Cờ riêng — xem khối cảnh báo ở trên. */
const ALLOW_PASSWORD_CHANGE = process.env.TEST_ALLOW_PASSWORD_CHANGE === '1'

/** Mật khẩu trung gian. Phải thoả PasswordRules (≥12, hoa/thường/số/ký hiệu). */
const TEMP_PASSWORD = process.env.TEST_TEMP_PASSWORD ?? 'E2eTmp!Passw0rd#26'

const EVENT_PASSWORD_CHANGED = 'password_changed'

const CHANGE_PASSWORD_PATH = '/tenant/auth/change-password'

/**
 * Một dòng của `platform.audit_logs`.
 *
 * Đọc tại chỗ chứ không đưa vào `_shared/audit-log.ts`: file đó phục vụ bảng
 * TENANT (`t_<slug>.audit_log`) và theo quy ước promote-on-second-use của repo
 * thì chỉ chuyển lên khi có spec THỨ HAI cần bảng platform.
 */
interface PlatformAuditRow {
    id: string
    eventType: string
    actorId: string | null
    meta: Record<string, unknown>
    ipAddress: string | null
    createdAt: Date
}

/**
 * Các dòng `platform.audit_logs` thêm vào từ mốc `since`.
 *
 * Schema-qualified tường minh: `withDb` đặt `search_path` sang schema TENANT,
 * nên `audit_logs` trần sẽ không tìm thấy (hoặc tệ hơn: trúng bảng khác).
 * `meta_json` ở bảng platform là **text**, không phải jsonb như bảng tenant —
 * nên phải tự `JSON.parse`, `pg` không parse sẵn giúp.
 */
async function platformAuditRowsSince(
    since: Date,
    eventType: string,
): Promise<PlatformAuditRow[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT id, event_type, actor_id, meta_json, ip_address, created_at
               FROM platform.audit_logs
              WHERE created_at >= $1 AND event_type = $2
              ORDER BY created_at, id`,
            [since, eventType],
        )
        return r.rows.map((x) => {
            const raw = x['meta_json']
            let meta: Record<string, unknown> = {}
            if (raw && typeof raw === 'object') meta = raw as Record<string, unknown>
            else if (typeof raw === 'string' && raw !== '') {
                try {
                    meta = JSON.parse(raw) as Record<string, unknown>
                } catch {
                    meta = { _unparsed: raw }
                }
            }
            return {
                id: String(x['id']),
                eventType: String(x['event_type']),
                actorId: (x['actor_id'] as string | null) ?? null,
                meta,
                ipAddress: (x['ip_address'] as string | null) ?? null,
                createdAt: x['created_at'] as Date,
            }
        })
    })
}

const describeRows = (rows: PlatformAuditRow[]) =>
    rows.length === 0
        ? '(không có dòng nào)'
        : rows
              .map(
                  (r) =>
                      `id=${r.id} actor=${r.actorId ?? 'NULL'} ip=${r.ipAddress ?? 'NULL'} ` +
                      `meta=${JSON.stringify(r.meta)}`,
              )
              .join('\n    ')

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: không có API/màn hình nào đọc platform.audit_logs từ app tenant, ' +
        'spec phải soi Postgres trực tiếp',
)

skipWithReason(
    !ALLOW_PASSWORD_CHANGE,
    'Cần TEST_ALLOW_PASSWORD_CHANGE=1: spec đổi mật khẩu THẬT của tài khoản mọi spec ' +
        'dùng để login (bump TokenVersion + revoke toàn bộ session) — chạy riêng file này',
)

test.describe('監査ログ — パスワード変更 phải để lại dòng trong platform.audit_logs', () => {
    let page: Page
    let step: () => Promise<void>

    /** Origin thật của API, bóc từ request của app. */
    let apiOrigin = ''
    /** Header auth bóc được — accessToken chỉ nằm trong RAM (GUIDELINE 10.2). */
    let authHeaders: Record<string, string> = {}

    /** Mốc thời gian lấy TỪ DB (không lấy từ máy test — có thể lệch giờ). */
    let since: Date

    /** accessToken mới do lần đổi đầu trả về — TC-4 phải dùng cái này. */
    let rotatedToken = ''

    /** true khi mật khẩu đã được đưa về giá trị gốc. `afterAll` đọc cờ này. */
    let restored = false

    /** Dòng audit TC-2 tìm được; TC-3 đọc lại. */
    let firstRow: PlatformAuditRow | null = null

    const changePassword = async (
        currentPassword: string,
        newPassword: string,
        token?: string,
    ) => {
        const headers: Record<string, string> = {
            ...authHeaders,
            'Content-Type': 'application/json',
        }
        if (token) headers['authorization'] = `Bearer ${token}`
        return page.request.post(`${apiOrigin}${CHANGE_PASSWORD_PATH}`, {
            headers,
            data: { currentPassword, newPassword },
        })
    }

    test.beforeAll(async ({ browser }) => {
        page = await newTestPage(browser)
        step = makeStep(page)

        // Bóc origin + header auth từ chính request của app.
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (!h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(
                    ([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept',
                ),
            )
        })

        await login(page)
        // Dashboard đã gọi ít nhất một endpoint /tenant/… nên header đã bắt được.
        await expect
            .poll(() => (apiOrigin !== '' && authHeaders['authorization'] ? 'ok' : 'chưa'), {
                timeout: 60_000,
                message:
                    'không bóc được header auth — app chưa gọi endpoint /tenant/… nào ' +
                    'sau khi login?',
            })
            .toBe('ok')

        since = await dbNow()
    })

    test.afterAll(async () => {
        // Lần thử khôi phục cuối. Chỉ chạy khi TC-4 chưa làm được — gọi hai lần thì
        // lần sau ăn 401/409 chứ không phá thêm gì, nhưng vẫn tránh cho sạch log.
        if (!restored && apiOrigin !== '') {
            const res = await changePassword(
                TEMP_PASSWORD,
                ADMIN_USER.password,
                rotatedToken || undefined,
            ).catch(() => null)
            restored = res?.ok() === true
        }
        if (!restored) {
            console.log(
                '\n!!! MẬT KHẨU CHƯA ĐƯỢC KHÔI PHỤC !!!\n' +
                    `Tài khoản ${ADMIN_USER.email} hiện đang là "${TEMP_PASSWORD}".\n` +
                    'Mọi spec khác sẽ KHÔNG login được. Khôi phục tay:\n' +
                    `  1) POST ${apiOrigin || '<api>'}/tenant/auth/login  ` +
                    `{"email":"${ADMIN_USER.email}","password":"${TEMP_PASSWORD}"}\n` +
                    `  2) POST ${apiOrigin || '<api>'}${CHANGE_PASSWORD_PATH}  (Bearer token bước 1)  ` +
                    `{"currentPassword":"${TEMP_PASSWORD}","newPassword":"${ADMIN_USER.password}"}\n`,
            )
        }
        await page.close()
    })

    test('TC-1 — đổi mật khẩu qua API trả 200 và cấp accessToken mới', async () => {
        const res = await changePassword(ADMIN_USER.password, TEMP_PASSWORD)

        expect(
            res.status(),
            'đổi mật khẩu thất bại — mật khẩu trong test-data.ts còn đúng không? ' +
                '(409 = trùng mật khẩu hiện tại, 400 = TEMP_PASSWORD không thoả PasswordRules)',
        ).toBe(200)

        const body = (await res.json()) as { data?: { accessToken?: string } }
        rotatedToken = body.data?.accessToken ?? ''
        expect(
            rotatedToken,
            'response phải trả accessToken mới (server rotate refresh family)',
        ).not.toBe('')
        await step()
    })

    test(`TC-2 — platform.audit_logs có ĐÚNG một dòng '${EVENT_PASSWORD_CHANGED}' mới`, async () => {
        // Writer ghi đồng bộ trong chính request, nhưng poll thay vì đọc một phát:
        // nếu có ngày nào nó chuyển sang hàng đợi thì test không đỏ giả.
        let rows: PlatformAuditRow[] = []
        await expect
            .poll(
                async () => {
                    rows = await platformAuditRowsSince(since, EVENT_PASSWORD_CHANGED)
                    return rows.length
                },
                {
                    timeout: 30_000,
                    intervals: [500, 1000, 2000, 3000, 5000],
                    message:
                        'Không có dòng password_changed nào — ĐÂY chính là bug: ' +
                        'EnqueueAsync stage vào AppDbContext (platform) còn handler ' +
                        'SaveChanges trên AppUserDbContext (tenant), nên dòng bị vứt ' +
                        'im lặng. Xem TenantChangePasswordHandler.',
                },
            )
            .toBe(1)

        firstRow = rows[0]!
        await step()
    })

    test('TC-3 — dòng audit mang đúng danh tính: actor_id NULL, meta có appUserId/tenantId/actorEmail', async () => {
        expect(firstRow, 'TC-2 chưa lấy được dòng audit').not.toBeNull()
        const row = firstRow!

        // actor_id NULL là CỐ Ý, không phải thiếu dữ liệu: FK của cột này trỏ sang
        // platform.super_admins, còn người thao tác là app_user của tenant.
        expect(
            row.actorId,
            `actor_id phải NULL (FK sang super_admins, người thao tác là app_user). Dòng: ${describeRows([row])}`,
        ).toBeNull()

        expect(row.meta['actorEmail'], `meta.actorEmail sai. Dòng: ${describeRows([row])}`).toBe(
            ADMIN_USER.email,
        )
        expect(
            String(row.meta['appUserId'] ?? ''),
            `meta.appUserId phải là uuid của app_user vừa đổi. Dòng: ${describeRows([row])}`,
        ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        expect(
            String(row.meta['tenantId'] ?? ''),
            `meta.tenantId phải là uuid của tenant. Dòng: ${describeRows([row])}`,
        ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

        // meta_json KHÔNG được chứa mật khẩu, dù cũ hay mới hay hash.
        const metaText = JSON.stringify(row.meta)
        expect(metaText, 'meta_json rò rỉ mật khẩu').not.toContain(TEMP_PASSWORD)
        expect(metaText, 'meta_json rò rỉ mật khẩu').not.toContain(ADMIN_USER.password)
        await step()
    })

    test('TC-4 — đổi ngược lại mật khẩu gốc: audit APPEND thêm dòng thứ hai, không ghi đè', async () => {
        expect(rotatedToken, 'TC-1 chưa lấy được token mới').not.toBe('')

        // Token cũ đã bị TokenVersion bump loại bỏ → phải dùng token TC-1 trả về.
        const res = await changePassword(TEMP_PASSWORD, ADMIN_USER.password, rotatedToken)
        expect(res.status(), 'không đổi ngược được mật khẩu — xem khối TỰ KHÔI PHỤC ở đầu file').toBe(200)
        restored = true

        let rows: PlatformAuditRow[] = []
        await expect
            .poll(
                async () => {
                    rows = await platformAuditRowsSince(since, EVENT_PASSWORD_CHANGED)
                    return rows.length
                },
                {
                    timeout: 30_000,
                    intervals: [500, 1000, 2000, 3000, 5000],
                    message: 'lần đổi thứ hai không sinh thêm dòng audit',
                },
            )
            .toBe(2)

        // Append-only: dòng đầu vẫn nguyên id, không bị UPDATE thành dòng mới.
        expect(rows[0]!.id, 'dòng audit đầu bị ghi đè — bảng phải là append-only').toBe(
            firstRow!.id,
        )
        expect(rows[1]!.id).not.toBe(firstRow!.id)
        await step()
    })
})
