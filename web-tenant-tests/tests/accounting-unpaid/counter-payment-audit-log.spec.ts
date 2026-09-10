/**
 * 監査ログ — 窓口精算画面 (màn hình thanh toán quầy) có ghi audit không.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO MÀN NÀY PHẢI CÓ E2E RIÊNG
 * ═══════════════════════════════════════════════════════════════════════════
 * Đây là màn duy nhất trong app làm tiền đổi chủ. Trước loạt thay đổi audit,
 * `RegisterSettlementHandler` KHÔNG ghi một dòng nhật ký nào: ai thu bao nhiêu
 * của ai, lúc nào — không lưu ở đâu cả. Đó là lỗ hổng nghiêm trọng nhất trong
 * bản khảo sát, và cũng là chỗ đầu tiên người ta soi khi tiền lệch.
 *
 * Handler này còn KHÔNG có unit test (phụ thuộc giao dịch kiểu Postgres, cần cả
 * bộ khung riêng), nên e2e ở đây là lớp bảo vệ duy nhất.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG CẦN DỰNG DỮ LIỆU KẾ TOÁN
 * ═══════════════════════════════════════════════════════════════════════════
 * `frm204002.F9Proc` vẫn đăng ký khi tiền = 0, chỉ đổi câu xác nhận sang
 * Q00100「本日入金が０円です。…」. Nên spec chỉ cần một bệnh nhân hợp lệ rồi bấm
 * F9 — đủ để chứng minh đường ghi nhật ký thông, mà không phải dựng 未収/処置.
 * Số tiền cụ thể là chuyện của các spec accounting khác.
 */
import { type Page } from '@playwright/test'

import {
    type AuditRow,
    MISSING_SNAPSHOT_COLUMNS_HINT,
    auditColumns,
    auditRowsSince,
    dbNow,
    describeRow,
    hasSnapshotColumns,
} from '../_shared/audit-log'
import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { allowSave, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/** Bệnh nhân riêng của spec này (990031 / 990033 đã có chủ). */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 34))
const SELF_SEEDED = Number(PAT_NO) >= SEED_PAT_NO_BASE

/**
 * 診療日 — ghim cứng, cùng khung phiên bản 処置マスタ với các spec parity
 * (MST_TRT266, hiệu lực từ 2026-06-01), để 処置 seed luôn tra được.
 */
const TRT_DT = trtDt('2026-08-03')

/** 処置 seed để màn 窓口精算 có cái mà tính. Mã trung tính, không thuộc nhóm đếm 来院回数. */
const PLAIN_TRT_CD = 209
const PLAIN_TRT_SB = 0
const PLAIN_TRT_NM = '処置-精算監査E2E'

/** `AuditEventTypes.SettlementRegistered`. */
const EVENT_SETTLEMENT_REGISTERED = 'settlement_registered'

/** `TenantSettlementEndpoints` — POST /tenant/settlement/{patNo}/register. */
const SETTLEMENT_REGISTER_RE = /\/tenant\/settlement\/\d+\/register(\?|$)/

const SCREEN_LOAD_TIMEOUT = 60_000
const SAVE_TIMEOUT = 60_000
const AUDIT_POLL_TIMEOUT = 20_000

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: không có API/màn hình nào đọc được tenant audit log, ' +
        'spec này soi thẳng Postgres',
)
skipWithReason(
    !allowSave,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật (tạo acc_dat)',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('監査ログ — 窓口精算 ghi lại việc thu tiền', () => {
    let page: Page
    let step: () => Promise<void>

    let columns: string[] = []
    let withSnapshots = false

    let sinceSave: Date
    let savedRow: AuditRow | null = null

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        if (SELF_SEEDED) {
            await seedTestPatient({
                patNo: Number(PAT_NO),
                patNm: 'セイサン　患者',
                patKn: 'せいさん　かんじゃ',
            })

            // Bắt buộc: `GetSeisanInfoAsync` join `trn_trn`, nên bệnh nhân KHÔNG có
            // 処置 nào thì trả null → API 404 → màn render NotFoundPage. Không seed
            // thì spec chỉ đo được trang 404.
            // `GetSeisanInfoAsync` INNER JOIN `view_person_exp_active`, mà
            // seedTestPatient chỉ dựng person/insurance/siga/kon. Thiếu dòng này thì
            // query trả null → API 404 → màn render NotFoundPage, và spec chỉ đo
            // được trang 404 chứ không đo được cái gì của 精算.
            // Xoá trước rồi chèn: `ux_person_exp_active` là unique trên dòng chưa
            // xoá mềm, và `deleteTestPatient` KHÔNG đụng tới bảng này — nên chèn
            // thẳng sẽ vỡ ngay ở lần chạy thứ hai.
            await withDb(async (c) => {
                await c.query('DELETE FROM person_exp WHERE pat_no = $1', [Number(PAT_NO)])
                await c.query('INSERT INTO person_exp (pat_no) VALUES ($1)', [Number(PAT_NO)])
            })

            await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
                {
                    trtCd: PLAIN_TRT_CD,
                    trtSb: PLAIN_TRT_SB,
                    trtCnt: 1,
                    trtPt: 40,
                    dspTrt: PLAIN_TRT_NM,
                },
            ])
        } else {
            console.log(
                `⚠️ TEST_PAT_NO=${PAT_NO} ngoài dải seed — spec KHÔNG dựng/xoá bệnh nhân này, ` +
                    'và F9 sẽ ghi acc_dat thật cho người đó.',
            )
        }

        columns = await auditColumns()
        withSnapshots = hasSnapshotColumns(columns)
        console.log(`audit_log columns: ${columns.join(', ')}`)
    })

    test.afterAll(async () => {
        if (SELF_SEEDED) {
            await deleteTestPatient(Number(PAT_NO))
            // deleteTestPatient dọn person/insurance/siga/kon/trn_trn nhưng không
            // biết tới person_exp — bỏ lại thì lần chạy sau vỡ ở unique index.
            await withDb(async (c) => {
                await c.query('DELETE FROM person_exp WHERE pat_no = $1', [Number(PAT_NO)])
                await c.query('DELETE FROM acc_dat WHERE pat_no = $1', [Number(PAT_NO)])
            })
        }
        await releaseSharedPage(page)
    })

    // ── Điều khiển màn hình ──────────────────────────────────────────────────

    /**
     * Nút F9 CỦA MÀN 窓口精算.
     *
     * `.last()` chứ KHÔNG phải `.first()`: màn này render như một overlay
     * `fixed inset-y-0 right-0 z-50` NẰM TRÊN shell, và cả hai đều có FKeyBar
     * đóng dấu `data-fkey`. `.first()` bắt trúng thanh của shell — bấm không
     * gọi `handleF9` của màn, nên test chỉ thấy "không có request, không có
     * dialog" mà không hiểu vì sao. Overlay nằm sau trong DOM nên `.last()`.
     */
    function f9Button() {
        return page.locator('[data-fkey="F9"]').last()
    }

    async function openScreen(): Promise<void> {
        // Ghi lại mọi phản hồi lỗi trong lúc mở màn. Không có nó thì mọi nguyên nhân
        // đều hiện ra y hệt nhau: một trang 404 câm.
        const failures: string[] = []
        const onResponse = (r: import('@playwright/test').Response) => {
            if (r.status() >= 400 && r.url().includes('/tenant/')) {
                failures.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`)
            }
        }
        page.on('response', onResponse)

        await page.goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })

        // Chờ CHÍNH overlay của màn, không phải nút F9 của shell (shell luôn có,
        // kể cả trên trang 404) và cũng không phải phép "không thấy chữ 404" —
        // toHaveCount(0) ngay sau navigate thì trang nào cũng qua vì còn trống.
        // Bám vào nhãn CHỈ màn 窓口精算 mới có. Không đếm `[data-fkey]`: shell và
        // overlay đều có FKeyBar, và số lượng ô là chi tiết dựng hình chứ không
        // phải hợp đồng — đếm nó là tự buộc test vào bố cục.
        await expect(
            page.getByText('入金日', { exact: false }).first(),
            'overlay 窓口精算 không mở. Thường là seisan-info trả null → 404: query ' +
                'INNER JOIN person + insurance + person_exp, thiếu bảng nào cũng thành null.',
        )
            .toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
            .catch((e: unknown) => {
                page.off('response', onResponse)
                throw new Error(
                    `${(e as Error).message}\nAPI lỗi trong lúc mở màn: ` +
                        (failures.length > 0 ? failures.join(' | ') : '(không có request nào 4xx/5xx)'),
                )
            })
        page.off('response', onResponse)
        await step()
    }

    /**
     * Đọc và ĐÓNG mọi dialog đang mở, trả về nội dung.
     *
     * Cùng lý do như spec 患者登録: `alertDialog` (lỗi ⇒ F9 DỪNG) và
     * `confirmDialog` (hỏi tiếp ⇒ OK là đi tiếp) đi qua cùng một lớp UI. Bấm bừa
     * làm mất dấu ca thứ nhất — test chỉ thấy "không có request" mà không biết vì sao.
     */
    async function drainDialogs(): Promise<string[]> {
        const seen: string[] = []
        for (let i = 0; i < 6; i++) {
            const dlg = page.locator('[role="alertdialog"], [role="dialog"]').first()
            if (!(await dlg.isVisible().catch(() => false))) break

            seen.push(((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim())

            const ok = dlg.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first()
            if (!(await ok.isVisible().catch(() => false))) break
            await ok.click()
            await step()
        }
        return seen
    }

    async function pressF9AndRegister(): Promise<void> {
        const pending = page.waitForResponse(
            (r) => SETTLEMENT_REGISTER_RE.test(r.url()) && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        pending.catch(() => undefined)

        await f9Button().click()
        await step()

        const dialogs = await drainDialogs()

        const resp = await pending.catch(() => null)
        if (resp === null) {
            throw new Error(
                `F9 không phát ra POST …/register nào trong ${SAVE_TIMEOUT}ms. ` +
                    'Dialog đã hiện: ' +
                    (dialogs.length > 0 ? dialogs.map((d) => `「${d}」`).join(' → ') : '(không có)') +
                    '. Không có dialog nào ⇒ F9 dừng ở counterPaymentRegisterSchema ' +
                    '(lỗi hiện inline dưới ô, không phải dialog).',
            )
        }

        if (resp.status() >= 300) {
            console.log(
                `POST register ${resp.status()} body: ` +
                    `${await resp.text().catch(() => '(unreadable)')}`,
            )
        }
        expect(
            resp.status(),
            'POST 精算登録 không trả 2xx — chưa có thao tác nào để mà audit',
        ).toBeLessThan(300)
    }

    async function waitForAuditRows(since: Date, eventType: string): Promise<AuditRow[]> {
        let rows: AuditRow[] = []
        await expect
            .poll(
                async () => {
                    rows = await auditRowsSince(since, eventType, withSnapshots)
                    return rows.length
                },
                {
                    timeout: AUDIT_POLL_TIMEOUT,
                    message:
                        `không có dòng '${eventType}' nào sau khi 精算登録. ` +
                        'TenantAuditLogWriter fail-open (nuốt lỗi, chỉ LogError) nên API 2xx ' +
                        'KHÔNG chứng minh gì — soi log API tìm 「Tenant audit event dropped」.',
                },
            )
            .toBeGreaterThan(0)
        return rows
    }

    // ── Tests ────────────────────────────────────────────────────────────────

    test('TC-0 (mốc) — bảng audit_log của tenant tồn tại', async () => {
        expect(columns, 'audit_log không tồn tại hoặc rỗng — chưa migrate DDL').not.toHaveLength(0)
        for (const c of ['id', 'event_type', 'actor_id', 'meta_json', 'created_at']) {
            expect(columns, `audit_log thiếu cột '${c}'`).toContain(c)
        }
    })

    test(`TC-1 — F9 登録 ghi đúng MỘT dòng '${EVENT_SETTLEMENT_REGISTERED}'`, async () => {
        await openScreen()

        sinceSave = await dbNow()
        await pressF9AndRegister()

        const rows = await waitForAuditRows(sinceSave, EVENT_SETTLEMENT_REGISTERED)
        expect(
            rows.length,
            `một lần 精算登録 phải để lại đúng MỘT dòng, đang có ${rows.length}: ` +
                rows.map(describeRow).join(' | '),
        ).toBe(1)

        savedRow = rows[0]!
        console.log(`audit row: ${describeRow(savedRow)}`)
    })

    test('TC-2 — actor_id KHÔNG null: thu tiền luôn có người đứng sau', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        expect(
            savedRow!.actorId,
            'actor_id null — không truy được ai đã thu khoản này',
        ).not.toBeNull()
    })

    test('TC-3 — meta mang actorEmail + patNo + accDt + số tiền', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        const meta = savedRow!.meta

        expect(
            String(meta['actorEmail'] ?? ''),
            'meta_json thiếu actorEmail — chụp lúc ghi để dòng này còn đọc được ' +
                'sau khi tài khoản bị xoá',
        ).not.toHaveLength(0)

        expect(String(meta['patNo'] ?? '')).toBe(String(PAT_NO))

        for (const key of ['accDt', 'accCnt', 'receAmt', 'accrAmt']) {
            expect(
                meta[key],
                `meta_json thiếu '${key}' — không có nó thì dòng nhật ký không nói ` +
                    'được đây là lần thu nào, bao nhiêu tiền',
            ).not.toBeUndefined()
        }
    })

    test('TC-4 — schema có before_json / after_json', async () => {
        expect(columns, MISSING_SNAPSHOT_COLUMNS_HINT).toContain('before_json')
        expect(columns, MISSING_SNAPSHOT_COLUMNS_HINT).toContain('after_json')
    })

    test('TC-5 — camera có chụp được thao tác này (snapshot không rỗng)', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        skipWithReason(!withSnapshots, 'schema chưa có before_json/after_json (TC-4 đã đỏ)')

        // Chỉ khẳng định camera CÓ chụp. Cố tình KHÔNG đòi phải thấy `acc_dat`:
        // ca này thu 0 円 nên `ClaimAllocator` không sinh dòng nào, và cái duy nhất
        // đổi là `tenant_config` (receType ghi nhớ lần dùng gần nhất). Nếu đổi
        // assertion thành "phải có acc_dat" thì nó đỏ vì bối cảnh test, chứ không
        // phải vì audit hỏng — kiểu test tệ nhất.
        expect(
            savedRow!.afterJson,
            'after_json NULL ⇒ TenantChangeRecordingInterceptor không bắt được màn ' +
                'tiền. Handler ghi qua IAppUserDbContext nên nó PHẢI thấy.',
        ).not.toBeNull()
    })

    test('TC-6 (ghi nhận hiện trạng) — snapshot chụp CẢ thay đổi ăn theo, không chỉ tiền', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        skipWithReason(!withSnapshots, 'schema chưa có before_json/after_json (TC-4 đã đỏ)')

        // Camera chụp MỌI dòng mà request đó chạm vào, nên 精算登録 kéo theo cả
        // `tenant_config` — `RecordReceTypeAsync` ghi nhớ 領収書種別 vừa dùng.
        // Đây là hành vi ĐÚNG theo thiết kế hiện tại (chụp đủ để khôi phục), nhưng
        // nó có nghĩa là cột khôi phục lẫn cả thứ không liên quan tới tiền.
        //
        // Test này KHÔNG phán đúng/sai — nó ghim hiện trạng lại để nếu sau này có
        // lọc bớt bảng ăn theo thì chỗ này đỏ và người sửa biết là mình đang đổi
        // hợp đồng, chứ không phải vô tình.
        const tables = ((savedRow!.afterJson as { rows?: { table: string }[] }).rows ?? []).map(
            (r) => r.table,
        )
        expect(
            tables.length,
            'after_json không có dòng nào — xem TC-5',
        ).toBeGreaterThan(0)
        console.log(`bảng bị chụp trong lần 精算登録 này: ${tables.join(', ')}`)
    })
})

