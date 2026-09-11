import { type Page } from '@playwright/test'

import {
    type AuditRow,
    actionsOf,
    actionsTotal,
    actionsTruncated,
    auditColumns,
    auditRowsSince,
    dbNow,
    describeRow,
} from '../_shared/audit-log'
import {
    DB_SCHEMA,
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
} from '../_shared/db'
import { allowSave, patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * テナント監査ログ (tenant audit trail) — is a row ACTUALLY written to
 * `t_<slug>.audit_log` when the operator performs an audited operation?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS SPEC VERIFIES THROUGH POSTGRES AND NOT THROUGH THE UI
 * ═══════════════════════════════════════════════════════════════════════════
 * There is no read path for the tenant trail today — no endpoint, no screen.
 * The 監査ログ screen belongs to **web-admin** and it reads
 * `platform.audit_logs` (admin-scope events: login_success, tenant_created, …).
 * It cannot show a tenant event, by design: `ITenantAuditLogWriter` exists
 * precisely so tenant rows stay inside the tenant schema
 * (`ITenantAuditLogWriter.cs` — "Mixing admin + tenant audit rows in the same
 * table loses tenant isolation").
 *
 * So the only observable this spec can assert on is the table itself. Every
 * assertion below reads `t_<slug>.audit_log` directly ⇒ `TEST_DB=1` is
 * mandatory; without it the whole file skips.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTS PINNED FROM SOURCE (Rule 21) — re-check these when the API changes
 * ═══════════════════════════════════════════════════════════════════════════
 *  - `apps/ddl/scripts/migrate/schema-ddl.mjs` — the tenant table:
 *      · CREATE TABLE t_<slug>.audit_log (id UUID DEFAULT uuidv7(),
 *        event_type VARCHAR(100) NOT NULL, actor_id UUID NULL,
 *        meta_json JSONB NOT NULL DEFAULT '{}', ip_address VARCHAR(45) NULL,
 *        created_at TIMESTAMPTZ NOT NULL DEFAULT now());
 *      · append-only: NO deleted_at, NO updated_at, NO view_audit_log_active.
 *      · there are NO before_json / after_json columns. They existed briefly and
 *        were removed: what an operation did to the database now travels inside
 *        meta_json as an `actions` array. A schema still carrying them was
 *        provisioned before that change — TC-4 says so out loud rather than
 *        leaving a stale schema to be found later.
 *  - `Ochacom.Domain/Constants/AuditEventTypes.cs`
 *      · `TreatmentsSaved = "treatments_saved"` — "Tenant op (F9 一括保存).
 *        Written by SaveTreatmentsHandler after commit. Metadata:
 *        { actorEmail, patNo, trtDt, deletedCount, insertedCount }".
 *  - `Ochacom.Application/Treatments/Handlers/SaveTreatmentsHandler.cs:408`
 *      · the Enqueue call runs AFTER `trn.CommitAsync(ct)`, with
 *        `actorId: cmd.CallerUserId` and `ipAddress: cmd.IpAddress`.
 *  - `Ochacom.Infrastructure/AuditLogs/Writers/TenantAuditLogWriter.cs`
 *      · fail-open: a write that throws is logged and swallowed, the audited
 *        operation still returns 2xx. That is exactly why a green bulk-save
 *        response proves NOTHING about the trail, and why this spec exists.
 *      · `before`/`after` stay NULL when the caller passes no snapshot, so
 *        "not captured" is distinguishable from "captured, and empty".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Measured 2026-09-10 on `feat/tenant-audit-log`: the writer and the two
 * columns are in place, but **no handler passes `before:` / `after:` yet** —
 * grep for `before:` across `Ochacom.Application` returns zero audit call
 * sites. So every row lands with before_json = after_json = NULL and TC-5
 * fails. That is a real gap in the product, not a broken test (same convention
 * as `save-f9/p0-save-side-effects.spec.ts`: red first, green as the work
 * lands). TC-5 turns green the moment SaveTreatmentsHandler starts snapshotting.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHICH OPERATION IS EXERCISED, AND WHY THIS ONE
 * ═══════════════════════════════════════════════════════════════════════════
 * 診療入力 F9 登録 (bulk-save) → `treatments_saved`. Picked because:
 *   · it is one keypress plus one confirm — the whole flow is already proven by
 *     `save-f9/p0-save-side-effects.spec.ts` and
 *     `siga-tooth-status/tooth-extraction-siga-restore.spec.ts`;
 *   · it is an UPDATE-shaped operation (bulk-save soft-deletes the month and
 *     re-inserts it), which is what TC-5's before ≠ after needs;
 *   · everything it touches can be seeded and destroyed by the test itself.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA: THIS SPEC BUILDS ITS OWN PATIENT, IT BORROWS NOTHING
 * ═══════════════════════════════════════════════════════════════════════════
 * `beforeAll` creates a patient in the `SEED_PAT_NO_BASE` (990000+) range
 * (person + insurance + siga + kon) and seeds ONE plain 処置行; `afterAll`
 * destroys that patient completely. F9 bulk-save rewrites the whole month of
 * whatever patient it is aimed at, so aiming it at a real one would rewrite
 * real 処置行 for nothing. No other spec knows this number, so nothing else can
 * clear the precondition either.
 *
 * Overriding `TEST_PAT_NO` with a REAL patient number is honoured, and the
 * seed/cleanup then switches itself off (`SELF_SEEDED`) — the helpers refuse
 * pat_no below the seed range anyway, and a real patient must never be dropped.
 *
 * ⇒ the spec WRITES to the DB (its own patient + one real bulk-save), so
 *   `TEST_ALLOW_SAVE=1` is required on top of `TEST_DB=1` (Rule 18.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RUN — WHOLE FILE, never a single test
 * ═══════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/cross-cutting/tenant-audit-log.spec.ts
 *
 * `mode: 'serial'` + one shared `authedPage` (Rule 19): the tests carry state
 * forward — TC-1 performs the save and every later test reads the row it
 * produced — so running one test with `-g` fails for reasons that have nothing
 * to do with the product. One red test skips the rest of the file.
 * The page comes from the worker fixture, so there is no automatic
 * trace/video/screenshot for it.
 */

// ─── Target ──────────────────────────────────────────────────────────────────

/**
 * Patient under test. Default is SELF-BUILT in the 990000+ range (see the
 * 「DATA」 block above); `TEST_PAT_NO` still overrides it for hand-probing.
 */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 31))

/** true when PAT_NO is inside the seed range ⇒ this spec owns it end to end. */
const SELF_SEEDED = Number(PAT_NO) >= SEED_PAT_NO_BASE

/**
 * 診療日 — pinned, not "today". Same 処置マスタ version window as the parity specs
 * (MST_TRT266, in force from 2026-06-01), so the seeded 処置 stays resolvable
 * whenever the suite happens to run.
 */
const TRT_DT = trtDt('2026-08-03')

/** 処置 seeded so the grid has something to save. Neutral code — not part of
 *  hfgRaiinCnt's visit-counting set (see p0-save-side-effects.spec.ts). */
const PLAIN_TRT_CD = 209
const PLAIN_TRT_SB = 0
/** `dsp_trt` of the seeded row — the string the grid prints in 療法・処置. */
const PLAIN_TRT_NM = '処置-監査ログE2E'

/** `AuditEventTypes.TreatmentsSaved`. */
const EVENT_TREATMENTS_SAVED = 'treatments_saved'

/** `TenantTreatmentEndpoints` — F9 登録. */
const BULK_SAVE_PATH = '/tenant/treatment/bulk-save'

const SAVE_TIMEOUT = 60_000
const SCREEN_LOAD_TIMEOUT = 60_000
/** The writer runs after commit, inside the same request — but poll rather than
 *  read once, so a future move to a background writer degrades into a slower
 *  green instead of a mystery red. */
const AUDIT_POLL_TIMEOUT = 20_000

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: không có API/màn hình nào đọc được tenant audit log, ' +
        'spec này soi thẳng Postgres',
)
skipWithReason(
    !allowSave,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật ' +
        '(bulk-save ghi lại CẢ THÁNG của bệnh nhân test)',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('監査ログ — tenant audit trail thực sự được ghi xuống t_<slug>.audit_log', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Columns present on the tenant table, read once in TC-0. */
    let columns: string[] = []
    /** DB clock right before the first F9 — start of the "rows appended" window. */
    let sinceFirstSave: Date
    /** The row TC-1 produced; every later test reads it. */
    let savedRow: AuditRow | null = null

    /**
     * Open 診療入力 and wait until AutoSantei has finished bothering the screen.
     *
     * The readiness marker is 「合計:」 rather than a grid cell: the seeded patient
     * may briefly render an empty grid while AutoSantei is still running, and a
     * cell-based marker would then race. Same shape as
     * `side-panel/guide-selection-dialog-format.spec.ts`.
     */
    async function openEntry(): Promise<void> {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
            waitUntil: 'domcontentloaded',
        })
        await expect(page, 'goto 診療入力 mà bị đá đi (mất session?)').toHaveURL(/\/treatments\//, {
            timeout: 15_000,
        })
        await expect(page.getByText('合計:').first()).toBeVisible({
            timeout: SCREEN_LOAD_TIMEOUT,
        })
        // An assertion (auto-retry) is what actually drives the locator handlers;
        // a bare waitForTimeout does not (Rule 7 / Rule 14).
        for (let i = 0; i < 4; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await page.waitForTimeout(500)
        }
    }

    /**
     * Press F9 登録, answer 「保存しますか？」 and wait for the bulk-save response.
     *
     * The confirm button matcher covers both shapes — today's 2-button dialog and
     * the 3-button WinForm-parity one — so this does not go red when that dialog
     * is fixed (see p0-save-side-effects.spec.ts TC-5).
     */
    async function pressF9AndSave(): Promise<void> {
        const pending = page.waitForResponse(
            (r) => r.url().includes(BULK_SAVE_PATH) && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await page.keyboard.press('F9')
        await step()
        await page
            .getByRole('button', { name: /^(はい|Yes|OK)$/ })
            .first()
            .click()
        await step()

        const resp = await pending
        if (resp.status() >= 300) {
            // Print the body: a 500 carries the error code, the status alone does not.
            console.log(
                `bulk-save ${resp.status()} body: ${await resp.text().catch(() => '(unreadable)')}`,
            )
        }
        expect(
            resp.status(),
            'POST bulk-save không trả 2xx — chưa có thao tác nào để mà audit',
        ).toBeLessThan(300)
    }

    /** Wait until the audited operation shows up in the table. */
    async function waitForAuditRows(since: Date, expectedCount: number): Promise<AuditRow[]> {
        let rows: AuditRow[] = []
        await expect
            .poll(
                async () => {
                    rows = await auditRowsSince(since, EVENT_TREATMENTS_SAVED)
                    return rows.length
                },
                {
                    timeout: AUDIT_POLL_TIMEOUT,
                    message:
                        `Bấm F9 và bulk-save trả 2xx, nhưng ${DB_SCHEMA}.audit_log KHÔNG có ` +
                        `dòng '${EVENT_TREATMENTS_SAVED}' nào mới.\n` +
                        'TenantAuditLogWriter FAIL-OPEN: nó nuốt lỗi ghi và chỉ log Error, nên ' +
                        '2xx của bulk-save KHÔNG chứng minh gì về audit trail. Soi log API ' +
                        '「Tenant audit event dropped」 để biết lý do (thiếu tenant context / ' +
                        'INSERT vỡ / gọi trong transaction của caller).',
                },
            )
            .toBeGreaterThanOrEqual(expectedCount)
        return rows
    }

    test.beforeAll(async ({ authedPage }) => {
        if (SELF_SEEDED) {
            // Build the data BEFORE opening the screen: the grid must have a row to
            // save, otherwise F9 has nothing to audit.
            await seedTestPatient({ patNo: Number(PAT_NO) })
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
                `⚠️ TEST_PAT_NO=${PAT_NO} nằm NGOÀI dải seed (>= ${SEED_PAT_NO_BASE}) — spec KHÔNG ` +
                    'seed và KHÔNG xoá bệnh nhân này, nhưng mỗi lần F9 vẫn XOÁ MỀM + CHÈN LẠI ' +
                    'toàn bộ 処置行 của THÁNG đó. Bỏ TEST_PAT_NO đi nếu không cố ý.',
            )
        }

        page = authedPage
        step = makeStep(page)
        // 「〜を算定しますか？」 only. NOT `alerts`: that handler dismisses anything with
        // role=alertdialog carrying an OK button, and the 保存しますか confirm is an
        // alertdialog too (DialogShell = Radix AlertDialog) — it would race with
        // pressF9AndSave for the same box.
        disposeOverlays = await installOverlayHandlers(page, { santei: true })

        await openEntry()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (SELF_SEEDED) {
            // Wrapped: a cleanup failure must not mask a real test failure.
            await deleteTestPatient(Number(PAT_NO)).catch((e) =>
                console.log(`dọn bệnh nhân test ${PAT_NO} hỏng: ${(e as Error).message}`),
            )
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-0 (mốc) — bảng audit_log của tenant tồn tại và mang đủ cột (nếu ĐỎ ⇒ chưa migrate DDL)', async () => {
        columns = await auditColumns()
        console.log(`${DB_SCHEMA}.audit_log columns: ${columns.join(', ') || '(bảng không tồn tại)'}`)

        expect(
            columns.length,
            `Không thấy bảng ${DB_SCHEMA}.audit_log. Schema tenant này được provision TRƯỚC khi ` +
                'audit_log vào pipeline DDL, hoặc TEST_DB_SCHEMA đang trỏ nhầm tenant. ' +
                'Chạy lại pipeline DDL (apps/ddl) cho tenant rồi thử lại.',
        ).toBeGreaterThan(0)

        // The columns every assertion below reads. `id`/`created_at` are the ordering
        // spine, the rest are the payload of the trail.
        for (const col of ['id', 'event_type', 'actor_id', 'meta_json', 'ip_address', 'created_at']) {
            expect(columns, `audit_log thiếu cột bắt buộc '${col}'`).toContain(col)
        }

        await step()
    })

    test(`TC-1 — F9 登録 ghi đúng MỘT dòng '${EVENT_TREATMENTS_SAVED}' vào audit_log`, async () => {
        sinceFirstSave = await dbNow()
        await pressF9AndSave()

        const rows = await waitForAuditRows(sinceFirstSave, 1)
        expect(
            rows.length,
            `một lần F9 phải sinh ĐÚNG một dòng audit, đang có ${rows.length}: ` +
                rows.map(describeRow).join(' | '),
        ).toBe(1)

        savedRow = rows[0]!
        console.log(`audit row: ${describeRow(savedRow)}`)
        expect(savedRow.eventType).toBe(EVENT_TREATMENTS_SAVED)
        await step()
    })

    test('TC-2 — actor_id KHÔNG null (thao tác có người đăng nhập đứng sau)', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        expect(
            savedRow!.actorId,
            'actor_id null nghĩa là hàng ghi như thao tác HỆ THỐNG. F9 登録 luôn đi kèm ' +
                'JWT của người dùng ⇒ SaveTreatmentsHandler phải truyền cmd.CallerUserId.',
        ).not.toBeNull()
        await step()
    })

    test('TC-3 — meta_json mang actorEmail + patNo + trtDt của chính thao tác vừa làm', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        const meta = savedRow!.meta

        // actorEmail is snapshotted at write time on purpose: actor_id is FK-free
        // and may stop resolving after a hard delete of app_user, so the e-mail is
        // what keeps an old row readable (schema-ddl.mjs comment on meta_json).
        expect(
            Object.keys(meta),
            `meta_json phải chứa actorEmail (snapshot để dòng còn đọc được khi app_user ` +
                `bị xoá). Đang có: ${JSON.stringify(meta)}`,
        ).toContain('actorEmail')
        expect(
            String(meta['actorEmail'] ?? ''),
            'actorEmail rỗng — snapshot không lấy được email từ JWT',
        ).not.toBe('')

        expect(
            Number(meta['patNo']),
            `meta_json.patNo phải là bệnh nhân vừa lưu (${PAT_NO}) — dòng audit không ` +
                'chỉ đúng đối tượng thì không truy vết được gì',
        ).toBe(Number(PAT_NO))
        expect(
            String(meta['trtDt'] ?? ''),
            `meta_json.trtDt phải là ${TRT_DT}`,
        ).toContain(TRT_DT)

        // ip_address is logged, not asserted: local dev can legitimately hand the
        // handler a null IP, and a red here would say nothing about the trail.
        console.log(`ip_address của dòng audit: ${savedRow!.ipAddress ?? 'NULL'}`)
        await step()
    })

    // Ordered before the two actions tests on purpose: append-only holds regardless
    // of what meta_json carries, and in serial mode a red TC-4 would otherwise skip
    // this check over an unrelated schema gap.
    test('TC-6 — audit là APPEND-ONLY: lưu lần hai THÊM một dòng, không ghi đè dòng cũ', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()

        // Reopen: F9 sends what is IN THE GRID, and a fresh screen also re-arms the
        // month token, so the second save cannot collide with the first one's.
        await openEntry()
        await pressF9AndSave()

        const rows = await waitForAuditRows(sinceFirstSave, 2)
        expect(
            rows.length,
            `hai lần F9 phải để lại HAI dòng, đang có ${rows.length}: ` +
                rows.map(describeRow).join(' | '),
        ).toBe(2)
        expect(
            rows[0]!.id,
            'dòng của lần lưu đầu bị mất/ghi đè — audit_log là bảng CHỈ THÊM ' +
                '(không deleted_at, không updated_at trong DDL)',
        ).toBe(savedRow!.id)
        await step()
    })
    test('TC-4 — schema tenant KHÔNG còn before_json / after_json (đã gộp vào meta_json)', async () => {
        // Hai cột từng tồn tại rồi bị bỏ: thao tác đã làm gì với DB nay nằm trong mảng
        // `actions` của chính meta_json. Nếu chúng còn, schema lạc hậu so với code.
        const hint = 'Chạy lại pipeline DDL cho tenant này.'
        expect(
            columns,
            `${DB_SCHEMA}.audit_log vẫn còn 'before_json'. ${hint}`,
        ).not.toContain('before_json')
        expect(
            columns,
            `${DB_SCHEMA}.audit_log vẫn còn 'after_json'. ${hint}`,
        ).not.toContain('after_json')
        await step()
    })

    test('TC-5 — meta_json mang bộ ba actions / actionsTotal / actionsTruncated đúng hợp đồng', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        const meta = savedRow!.meta

        // Ba khoá đi cùng nhau. Thiếu actionsTruncated là mất tín hiệu "nhật ký này
        // không đủ để khôi phục" — thứ duy nhất phân biệt chụp thiếu với chụp đủ.
        for (const k of ['actionsTotal', 'actionsTruncated', 'actions']) {
            expect(
                Object.keys(meta),
                `meta_json thiếu '${k}'. Ba khoá do TenantAuditLogWriter gộp vào, nên ` +
                    `thiếu một khoá nghĩa là writer chưa chạy nhánh actions. ` +
                    `meta=${JSON.stringify(meta)}`,
            ).toContain(k)
        }

        const actions = actionsOf(savedRow!)

        // actionsTotal đếm TRƯỚC khi cắt, nên luôn ≥ số phần tử thực có. Ngược lại là
        // bộ đếm nói dối về quy mô thao tác.
        expect(
            actionsTotal(savedRow!),
            'actionsTotal nhỏ hơn số action đang có ⇒ đếm sau khi cắt, sai hợp đồng',
        ).toBeGreaterThanOrEqual(actions.length)
        expect(
            actionsTruncated(savedRow!),
            'actionsTruncated phải true khi và chỉ khi actionsTotal > số action giữ lại',
        ).toBe(actionsTotal(savedRow!) > actions.length)

        // Mỗi action phải tự đủ: không có `table` + `key` thì không viết nổi mệnh đề
        // WHERE, và cả dòng nhật ký thành vô dụng cho việc khôi phục.
        for (const a of actions) {
            expect(
                ['insert', 'update', 'softdelete', 'delete'],
                `action.type lạ: ${JSON.stringify(a)}`,
            ).toContain(a.type)
            expect(String(a.table ?? ''), `action thiếu 'table': ${JSON.stringify(a)}`).not.toBe('')
            expect(
                Object.keys(a.key ?? {}).length,
                `action thiếu 'key' ⇒ không tìm lại được dòng: ${JSON.stringify(a)}`,
            ).toBeGreaterThan(0)

            if (a.type === 'insert') {
                expect(a.old, `insert không được có 'old': ${JSON.stringify(a)}`).toBeUndefined()
                expect(a.new, `insert phải có 'new': ${JSON.stringify(a)}`).toBeDefined()
            }
            if (a.type === 'delete') {
                expect(a.new, `delete không được có 'new': ${JSON.stringify(a)}`).toBeUndefined()
                expect(a.old, `delete phải có 'old': ${JSON.stringify(a)}`).toBeDefined()
            }
            // softdelete là UPDATE đóng dấu — phải có đủ hai phía để gỡ lại được.
            if (a.type === 'softdelete' || a.type === 'update') {
                expect(a.old, `${a.type} phải có 'old': ${JSON.stringify(a)}`).toBeDefined()
                expect(a.new, `${a.type} phải có 'new': ${JSON.stringify(a)}`).toBeDefined()
            }
        }

        console.log(
            `actions: total=${actionsTotal(savedRow!)} ` +
                `truncated=${actionsTruncated(savedRow!)} chi tiết=${JSON.stringify(actions)}`,
        )
        await step()
    })

})
