import { type APIRequestContext, expect, request as playwrightRequest, test } from '@playwright/test'

import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

/**
 * 監査ログ (admin) — cửa sổ thời gian của `GET /admin/audit-logs` phải bị chặn
 * ở 90 ngày, kể cả khi caller chỉ gửi MỘT đầu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BUG ĐANG ĐO (fix trên nhánh `investigate/tenant-audit-log-findings`)
 * ═══════════════════════════════════════════════════════════════════════════
 * `ListAuditLogsRequestValidator` chỉ kiểm khi có CẢ `from` và `to`:
 *
 *     When(x => x.From.HasValue && x.To.HasValue, () => { … 90 ngày … });
 *
 * Còn `AdminAuditLogEndpoints` thì tự điền đầu thiếu:
 *
 *     var to   = (query.To   ?? now);
 *     var from = (query.From ?? now.AddDays(-7));
 *
 * ⇒ `?from=1900-01-01` KHÔNG kích hoạt rule nào, rồi endpoint điền `to = now`
 * thành cửa sổ ~126 năm. `AuditLogQueries` chạy `SELECT COUNT(*)` trên
 * `platform.audit_logs` — bảng mà chính docstring của nó gọi là "grows
 * boundless" — cộng LIMIT/OFFSET.
 *
 * Không phải bề mặt tấn công công khai (endpoint đòi `AuthPolicies.SuperAdmin`),
 * nên đây là rủi ro "super-admin vô tình làm chậm DB".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHỦ ĐỦ 4 TỔ HỢP — ĐÓ MỚI LÀ NỘI DUNG CỦA SPEC NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Thứ cần chốt KHÔNG phải "hai tham số cách nhau ≤ 90 ngày" mà là "cửa sổ THẬT
 * SỰ ĐƯỢC QUÉT ≤ 90 ngày". Vì endpoint điền đầu thiếu nên phải đo cả bốn:
 *
 *   | from | to  | cửa sổ thật            | kỳ vọng |
 *   |------|-----|------------------------|---------|
 *   | có   | có  | caller quyết cả hai    | 422 nếu > 90 ngày  (đã có rule) |
 *   | có   | —   | from … now             | 422 nếu > 90 ngày  ← LỖ ĐANG FIX |
 *   | —    | có  | now-7d … to (chặn dưới)| 200, KHÔNG rule    |
 *   | —    | —   | 7 ngày                 | 200, KHÔNG rule    |
 *
 * Hai dòng cuối là chốt chặn hồi quy: fix không được siết quá tay thành 422.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO SPEC ADMIN LẠI NẰM TRONG REPO web-tenant-tests
 * ═══════════════════════════════════════════════════════════════════════════
 * Đây là bộ e2e duy nhất của dự án. Không có suite riêng cho `web-admin`, mà
 * nhánh này sửa validator của admin — bỏ trắng thì lỗ vừa vá không có gì canh.
 * Spec KHÔNG mở UI admin: chỉ gọi API bằng `APIRequestContext` riêng trỏ sang
 * `admin.ochacom.local` (nginx.conf: `location /api/` của host đó proxy về
 * cùng backend 5219). Chuyển sang suite admin lúc nào có thì chỉ là dời file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CHI PHÍ: 1 LẦN LOGIN (Rule 10.1)
 * ═══════════════════════════════════════════════════════════════════════════
 * `beforeAll` login MỘT lần cho cả file rồi tái dùng token. Không dùng fixture
 * `session.ts` được: fixture đó login vào app TENANT, còn đây cần token
 * super-admin. Tài khoản là cùng một email (`platform.super_admins` chỉ có một
 * dòng, trùng `ADMIN_USER.email`) nhưng đi qua `/api/admin/auth/login`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTS GHIM TỪ SOURCE + ĐO THẬT 2026-09-14 (Rule 21)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - `page` và `pageSize` là BẮT BUỘC. Thiếu → 400 kèm
 *    `errors:[{field:'page',code:'REQUIRED'}]`, tức là đỏ vì lý do hoàn toàn
 *    khác cái đang đo. Mọi request dưới đây đều gửi đủ hai tham số.
 *  - Validator trượt → `ValidationFilter` trả **422** (`Results.UnprocessableEntity`),
 *    KHÔNG phải 400, body `{ success:false, error:{ code:'PLT.VALIDATION_FAILED',
 *    errors:[{ field:'from', code:'DATE_RANGE_TOO_WIDE' }] } }`.
 *  - Đo trên BE `demo1` trước khi fix: both-bounds 243 ngày → 422 (rule cũ chạy);
 *    `from-only 1900` → **200** (đúng lỗ); ba tổ hợp còn lại → 200.
 *  - `MaxDateRangeDays = 90`, `DefaultWindowDays = 7`.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

/** Host của app admin. nginx.conf server_name admin.ochacom.local. */
const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'

const AUDIT_LOGS_PATH = '/api/admin/audit-logs'
const ADMIN_LOGIN_PATH = '/api/admin/auth/login'

/** Khớp `ListAuditLogsRequestValidator.MaxDateRangeDays`. */
const MAX_DATE_RANGE_DAYS = 90

const TOO_WIDE_CODE = 'DATE_RANGE_TOO_WIDE'

/** 422, không phải 400 — xem khối FACTS. */
const VALIDATION_STATUS = 422

const iso = (d: Date) => d.toISOString()
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

interface ValidationBody {
    error?: { code?: string; errors?: { field?: string; code?: string }[] }
}

test.describe('監査ログ (admin) — cửa sổ tra cứu bị chặn ở 90 ngày ở CẢ BỐN tổ hợp from/to', () => {
    let api: APIRequestContext
    /** Lý do skip phát hiện lúc chạy (host admin không lên / login trượt). */
    let skipReason = ''

    /** Gọi endpoint với `page`/`pageSize` đã điền sẵn (bắt buộc, xem FACTS). */
    const listAuditLogs = (query: string) =>
        api.get(`${AUDIT_LOGS_PATH}?page=1&pageSize=1${query ? `&${query}` : ''}`)

    const expectTooWide = async (res: Awaited<ReturnType<typeof listAuditLogs>>, what: string) => {
        const body = (await res.json()) as ValidationBody
        expect
            .soft(
                res.status(),
                `${what} phải bị chặn ở ${MAX_DATE_RANGE_DAYS} ngày. ` +
                    `Nhận ${res.status()} — body: ${JSON.stringify(body).slice(0, 300)}`,
            )
            .toBe(VALIDATION_STATUS)
        if (res.status() === VALIDATION_STATUS) {
            expect
                .soft(
                    body.error?.errors ?? [],
                    `${what}: phải có lỗi ${TOO_WIDE_CODE} trên field 'from'`,
                )
                .toEqual(expect.arrayContaining([expect.objectContaining({ code: TOO_WIDE_CODE })]))
        }
    }

    const expectAccepted = async (
        res: Awaited<ReturnType<typeof listAuditLogs>>,
        what: string,
    ) => {
        expect
            .soft(
                res.status(),
                `${what} là cửa sổ hợp lệ, KHÔNG được chặn — fix siết quá tay? ` +
                    `body: ${(await res.text()).slice(0, 300)}`,
            )
            .toBe(200)
    }

    test.beforeAll(async () => {
        api = await playwrightRequest.newContext({
            baseURL: ADMIN_BASE_URL,
            ignoreHTTPSErrors: true,
        })

        const res = await api
            .post(ADMIN_LOGIN_PATH, {
                data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
            })
            .catch((e: Error) => e)

        if (res instanceof Error) {
            skipReason =
                `không gọi được ${ADMIN_BASE_URL} — app admin chưa chạy? ` +
                `(đặt TEST_ADMIN_BASE_URL nếu host khác). Gốc: ${res.message}`
            return
        }
        if (!res.ok()) {
            skipReason =
                `login super-admin trượt (${res.status()}) — ${ADMIN_USER.email} có trong ` +
                'platform.super_admins không? Hoặc đang dính rate-limit login (Rule 10.1)'
            return
        }

        const body = (await res.json()) as { data?: { accessToken?: string } }
        const token = body.data?.accessToken ?? ''
        if (token === '') {
            skipReason = 'login admin trả 200 nhưng không có accessToken'
            return
        }

        // Thay context bằng bản mang sẵn header auth cho mọi request sau.
        await api.dispose()
        api = await playwrightRequest.newContext({
            baseURL: ADMIN_BASE_URL,
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: { authorization: `Bearer ${token}` },
        })
    })

    test.afterAll(async () => {
        await api?.dispose()
    })

    /**
     * MỘT testcase cho cả bốn tổ hợp — cố ý, và đây là chỗ dễ "sửa cho đẹp" rồi
     * làm hỏng spec:
     *
     * `playwright.config.ts` đặt `fullyParallel: true`, nên tách thành 5 test là
     * chúng rải ra 4 worker ⇒ 4-5 lần login admin, trong khi ngân sách login của
     * repo là 10 và CỘNG DỒN (Rule 10.1). Giữ `mode: 'serial'` thì chỉ 1 login,
     * nhưng test đầu đỏ là mấy test sau KHÔNG CHẠY — và đúng ba tổ hợp "phải vẫn
     * 200" mới là chốt chặn chống siết quá tay. Đã vấp thật: chạy trước khi fix
     * lên demo1 thì TC-1 đỏ và 4 case còn lại báo "did not run".
     *
     * Nên: 1 login, 1 test, `expect.soft` cho từng tổ hợp. Cả bốn luôn được đo và
     * mọi lệch đều hiện trong cùng một lần chạy.
     */
    test('cả bốn tổ hợp from/to: quá 90 ngày thì 422, còn lại phải vẫn 200', async () => {
        skipWithReason(skipReason !== '', skipReason)

        // ── Tổ hợp 1: chỉ có `from`, quá xa — ĐÂY là lỗ đang fix ──────────────
        // `to` được endpoint điền = now ⇒ cửa sổ ~126 năm, COUNT(*) cả bảng.
        await expectTooWide(
            await listAuditLogs('from=1900-01-01T00:00:00Z'),
            'from=1900-01-01 không kèm `to`',
        )

        // ── Tổ hợp 2: có cả hai đầu, quá rộng — rule cũ, chốt chặn hồi quy ────
        await expectTooWide(
            await listAuditLogs(
                `from=${iso(daysAgo(MAX_DATE_RANGE_DAYS + 1))}&to=${iso(new Date())}`,
            ),
            `khoảng ${MAX_DATE_RANGE_DAYS + 1} ngày (cả hai đầu)`,
        )

        // ── Ba tổ hợp hợp lệ: fix KHÔNG được biến thành 422 ───────────────────
        await expectAccepted(
            await listAuditLogs(`from=${iso(daysAgo(MAX_DATE_RANGE_DAYS - 1))}`),
            `chỉ có \`from\`, cách đây ${MAX_DATE_RANGE_DAYS - 1} ngày`,
        )
        // Chặn dưới cố định (`from` = 7 ngày trước) ⇒ không có gì để cap.
        await expectAccepted(
            await listAuditLogs('to=2076-01-01T00:00:00Z'),
            'chỉ có `to`, ở tương lai xa',
        )
        await expectAccepted(
            await listAuditLogs(''),
            'không gửi đầu nào (cửa sổ mặc định 7 ngày)',
        )
    })
})
