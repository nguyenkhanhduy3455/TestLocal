/**
 * 監査ログ — 患者登録画面 (màn hình đăng ký bệnh nhân) có ghi audit không, và có ghi
 * đủ để khôi phục tay không.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO MÀN NÀY ĐÁNG TEST RIÊNG
 * ═══════════════════════════════════════════════════════════════════════════
 * `patient_updated` là ca dùng cột before/after thuyết phục nhất trong toàn hệ:
 * nó sửa hồ sơ người thật — tên, ngày sinh, số bảo hiểm, điện thoại — và sai sót
 * ở đây là loại mà người ta thực sự phải khôi phục bằng tay.
 *
 * Nó cũng mang một rủi ro riêng mà `treatments_saved` không có.
 * `UpdateRegisteredPatientHandler` XOÁ MỀM rồi CHÈN LẠI cùng một khoá tự nhiên
 * (2 pha SaveChangesAsync trong 1 transaction). Nếu
 * TenantChangeRecordingInterceptor ghi nhầm thứ tự — hoặc bản "trước" bị bản
 * "sau" ghi đè — thì `before_json` sẽ bằng `after_json` và nhật ký trông như
 * "không có gì đổi". KHÔNG có gì fail trong trường hợp đó: writer fail-open,
 * API vẫn 2xx, màn hình vẫn báo lưu xong. Chỉ có test này bắt được.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Spec TỰ DỰNG bệnh nhân riêng trong dải seed (990000+) rồi tự xoá ở `afterAll`.
 * Không mượn bệnh nhân thật: F9 ở màn này ghi đè cả bản ghi 保険, nên trỏ vào
 * người thật là hỏng dữ liệu thật.
 *
 * Trường được sửa là 電話番号 (`insurance.tel_1`) — seed để trống, nên diff đọc ra
 * `null → "090-…"`, rõ ràng nhất có thể. Cố tình KHÔNG sửa tên/ngày sinh: hai
 * trường đó kéo theo tính lại 負担割合 và có thể bung thêm dialog, làm test đo
 * chuyện khác.
 */
import { type Page } from '@playwright/test'

import {
    type AuditRow,
    MISSING_SNAPSHOT_COLUMNS_HINT,
    auditColumns,
    auditRowsSince,
    capturedValue,
    dbNow,
    describeRow,
    hasSnapshotColumns,
    rowsForTable,
} from '../_shared/audit-log'
import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    withDb,
} from '../_shared/db'
import { allowSave, patNo } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/** Bệnh nhân của riêng spec này — khác 990031 của tenant-audit-log.spec.ts. */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 33))
const SELF_SEEDED = Number(PAT_NO) >= SEED_PAT_NO_BASE

/** `AuditEventTypes.PatientUpdated` / `PatientRegistered`. */
const EVENT_PATIENT_UPDATED = 'patient_updated'
const EVENT_PATIENT_REGISTERED = 'patient_registered'

/** `TenantPatientsEndpoints` — PUT /tenant/patients/ (F9 ở chế độ sửa). */
const PATIENTS_PATH = '/tenant/patients'

/** Số điện thoại test ghi đè lên ô đang trống. */
const NEW_PHONE = '090-7777-8888'

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
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật ' +
        '(ghi đè bản ghi 保険 của bệnh nhân test)',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('監査ログ — 患者登録画面 ghi audit đủ để khôi phục tay', () => {
    let page: Page
    let step: () => Promise<void>

    let columns: string[] = []
    let withSnapshots = false

    /** Mốc thời gian (giờ DB) ngay trước khi bấm F9. */
    let sinceSave: Date
    /** Dòng audit của lần sửa, lấy ở TC-1 và dùng lại cho các TC sau. */
    let savedRow: AuditRow | null = null

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        if (SELF_SEEDED) {
            // 氏名 PHẢI có dấu cách ngăn họ/tên, nếu không chuỗi F9 dừng ở
            // E00010「氏名は姓名を空白で区切って入力してください。」 và không có
            // request nào bay đi (hasFamilyGivenSeparator — wizard-validation.ts).
            // Mặc định của seedTestPatient là 'E2Eテスト患者', liền một khối.
            await seedTestPatient({
                patNo: Number(PAT_NO),
                patNm: 'イーツーイー　患者',
                patKn: 'いーつーいー　かんじゃ',
            })

            // 患者情報有効日 (`insurance.br_dt`) phải >= 生年月日, nếu không chuỗi F9
            // dừng ở E00100「生年月日より過去日付が患者情報有効日に…」.
            // seedTestPatient đặt br_dt = đúng ngày sinh; đẩy hẳn về sau để không
            // phụ thuộc vào chuyện so sánh có tính bằng nhau hay không.
            await withDb(async (c) => {
                await c.query(
                    `UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = $1`,
                    [Number(PAT_NO)],
                )
            })
        } else {
            console.log(
                `⚠️ TEST_PAT_NO=${PAT_NO} nằm ngoài dải seed — spec KHÔNG dựng và ` +
                    'KHÔNG xoá bệnh nhân này. F9 sẽ ghi đè 保険 của người thật.',
            )
        }

        columns = await auditColumns()
        withSnapshots = hasSnapshotColumns(columns)
        console.log(`audit_log columns: ${columns.join(', ')}`)
    })

    test.afterAll(async () => {
        if (SELF_SEEDED) await deleteTestPatient(Number(PAT_NO))
        await releaseSharedPage(page)
    })

    // ── Điều khiển màn hình ──────────────────────────────────────────────────

    /**
     * Ô 電話番号. FieldRow render `<div><label>電話番号</label><input/></div>` và
     * không gắn testid/aria-label, nên phải bám theo nhãn.
     *
     * `.last()` chứ KHÔNG phải `.first()`: bộ lọc khớp MỌI div tổ tiên có chứa
     * nhãn đó — kể cả div bọc cả trang — và Playwright trả về theo thứ tự DOM,
     * nên `.first()` ra div ngoài cùng và `input` đầu tiên của nó là một ô hoàn
     * toàn khác. Đã vấp thật: `fill()` chạy trơn, không ai báo lỗi, nhưng số điện
     * thoại không bao giờ tới `insurance.tel_1`.
     */
    function phoneInput() {
        return page
            .locator('div')
            .filter({ has: page.locator('label').filter({ hasText: /^電話番号$/ }) })
            .last()
            .locator('input')
            .first()
    }

    /**
     * `patientNo` đi qua router dưới dạng JSON-serialise, nên giá trị thật trên URL
     * là `%22990033%22` chứ không phải `990033` — xem `registrationUrlRe` trong
     * patient-select-f7-f2-end.spec.ts. Truyền dạng trần thì `validateSearch`
     * (z.string()) nhận về number, ném SearchParamError và RouteErrorComponent
     * dựng ra trang 404 — trông y hệt "route không tồn tại".
     */
    async function openDetail(): Promise<void> {
        await page.goto(`/patients/registration?patientNo=%22${PAT_NO}%22`, {
            waitUntil: 'domcontentloaded',
        })
        await expect(
            phoneInput(),
            'màn 患者登録 không mở được ở chế độ sửa — kiểm tra route ' +
                '/patients/registration?patientNo=… và bệnh nhân seed có tồn tại không',
        ).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await step()
    }

    /**
     * Đọc và ĐÓNG mọi dialog đang mở, trả về nội dung của chúng.
     *
     * Chuỗi F9 (`frm201001.F9Proc` + `chkInputDataMain`) bung ra hai loại rất khác
     * nhau qua cùng một lớp UI: `alertDialog` = lỗi validate ⇒ F9 DỪNG, và
     * `confirmDialog` = hỏi có làm tiếp không ⇒ Yes là đi tiếp. Bấm bừa "OK/はい"
     * lên cả hai làm mất dấu ca thứ nhất: test chỉ thấy "không có request" mà
     * không biết vì sao. Nên gom text lại rồi mới quyết.
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

    /**
     * F9 登録. Bấm bằng nút trên FKeyBar (`[data-fkey="F9"]`) chứ không phải phím:
     * sau `fill()` con trỏ đang nằm trong ô 電話番号 và phím F9 có thể bị chính ô
     * đó nuốt, trong khi nút thì luôn gọi đúng handler.
     */
    async function pressF9AndSave(): Promise<void> {
        const pending = page.waitForResponse(
            (r) =>
                r.url().includes(PATIENTS_PATH) &&
                ['PUT', 'POST'].includes(r.request().method()),
            { timeout: SAVE_TIMEOUT },
        )
        // Không để timeout của waitForResponse thành unhandled rejection khi ta
        // fail sớm hơn vì một alert validate.
        pending.catch(() => undefined)

        const f9 = page.locator('[data-fkey="F9"]').first()
        if (await f9.isVisible().catch(() => false)) {
            await f9.click()
        } else {
            await page.keyboard.press('F9')
        }
        await step()

        const dialogs = await drainDialogs()

        const resp = await pending.catch(() => null)
        if (resp === null) {
            throw new Error(
                'F9 không phát ra request lưu 患者 nào trong ' +
                    `${SAVE_TIMEOUT}ms. Dialog đã hiện: ` +
                    (dialogs.length > 0 ? dialogs.map((d) => `「${d}」`).join(' → ') : '(không có)') +
                    '. Nếu có dialog báo lỗi ⇒ bệnh nhân seed thiếu trường bắt buộc ' +
                    'của chkInputDataMain, bổ sung vào seedTestPatient hoặc điền trên màn.',
            )
        }

        if (resp.status() >= 300) {
            console.log(
                `${resp.request().method()} ${PATIENTS_PATH} ${resp.status()} body: ` +
                    `${await resp.text().catch(() => '(unreadable)')}`,
            )
        }
        expect(
            resp.status(),
            'lưu 患者 không trả 2xx — chưa có thao tác nào để mà audit',
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
                        `không có dòng '${eventType}' nào sau khi lưu. ` +
                        'TenantAuditLogWriter fail-open (nuốt lỗi, chỉ LogError) nên ' +
                        'API 2xx KHÔNG chứng minh gì — soi log API tìm ' +
                        '「Tenant audit event dropped」.',
                },
            )
            .toBeGreaterThan(0)
        return rows
    }

    // ── TC-0 ────────────────────────────────────────────────────────────────

    test('TC-0 (mốc) — bảng audit_log của tenant tồn tại', async () => {
        expect(columns, `${'audit_log'} không tồn tại hoặc rỗng — chưa migrate DDL`).not.toHaveLength(
            0,
        )
        for (const c of ['id', 'event_type', 'actor_id', 'meta_json', 'created_at']) {
            expect(columns, `audit_log thiếu cột '${c}'`).toContain(c)
        }
    })

    // ── TC-1..4: 患者更新 ────────────────────────────────────────────────────

    test(`TC-1 — sửa 電話番号 rồi F9 ghi đúng MỘT dòng '${EVENT_PATIENT_UPDATED}'`, async () => {
        await openDetail()

        // Seed để trống; nếu lần chạy trước sót thì vẫn ghi đè về giá trị test.
        await phoneInput().fill(NEW_PHONE)
        await step()

        sinceSave = await dbNow()
        await pressF9AndSave()

        const rows = await waitForAuditRows(sinceSave, EVENT_PATIENT_UPDATED)
        expect(
            rows.length,
            `một lần F9 phải để lại đúng MỘT dòng, đang có ${rows.length}: ` +
                rows.map(describeRow).join(' | '),
        ).toBe(1)

        savedRow = rows[0]!
        console.log(`audit row: ${describeRow(savedRow)}`)
    })

    test('TC-2 — actor_id KHÔNG null và meta mang actorEmail + patNo', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()

        expect(
            savedRow!.actorId,
            'actor_id null: sửa hồ sơ bệnh nhân luôn có người đăng nhập đứng sau',
        ).not.toBeNull()

        expect(
            String(savedRow!.meta['actorEmail'] ?? ''),
            'meta_json thiếu actorEmail — email được chụp lúc ghi để dòng này còn ' +
                'đọc được sau khi tài khoản bị xoá',
        ).not.toHaveLength(0)

        expect(String(savedRow!.meta['patNo'] ?? '')).toBe(String(PAT_NO))
    })

    test('TC-3 — KHÔNG ghi nhầm thành patient_registered', async () => {
        // Hai handler dùng chung màn hình và chỉ khác nhau ở chế độ. Ghi nhầm loại
        // sự kiện làm hỏng mọi bộ lọc dựng trên event_type.
        const wrong = await auditRowsSince(sinceSave, EVENT_PATIENT_REGISTERED, withSnapshots)
        expect(
            wrong.length,
            `sửa bệnh nhân có sẵn mà lại ghi '${EVENT_PATIENT_REGISTERED}': ` +
                wrong.map(describeRow).join(' | '),
        ).toBe(0)
    })

    test('TC-4 — schema có before_json / after_json', async () => {
        expect(columns, MISSING_SNAPSHOT_COLUMNS_HINT).toContain('before_json')
        expect(columns, MISSING_SNAPSHOT_COLUMNS_HINT).toContain('after_json')
    })

    test('TC-5 — before_json giữ số điện thoại CŨ, after_json giữ số MỚI', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        skipWithReason(
            !withSnapshots,
            'schema chưa có before_json/after_json (TC-4 đã đỏ) — không có gì để so',
        )

        const before = savedRow!.beforeJson
        const after = savedRow!.afterJson

        expect(
            before,
            'before_json NULL. Handler xoá-mềm-rồi-chèn-lại qua change tracker nên ' +
                'TenantChangeRecordingInterceptor PHẢI thấy — null nghĩa là camera ' +
                'không bắt được màn này, và một lần sửa nhầm hồ sơ là không khôi phục nổi.',
        ).not.toBeNull()
        expect(after, 'after_json NULL — không có trạng thái sau khi ghi').not.toBeNull()

        // Đây là thứ người khôi phục thực sự đọc.
        expect(
            capturedValue(before, 'insurance', 'tel_1'),
            `before_json.insurance.tel_1 phải là giá trị CŨ, đang là ` +
                `${JSON.stringify(capturedValue(before, 'insurance', 'tel_1'))}. ` +
                'Bằng giá trị mới ⇒ snapshot chụp SAI THỜI ĐIỂM (đọc lại sau commit ' +
                'thì cả hai bên đều là trạng thái mới).',
        ).not.toBe(NEW_PHONE)

        expect(
            capturedValue(after, 'insurance', 'tel_1'),
            'after_json.insurance.tel_1 phải là số vừa nhập',
        ).toBe(NEW_PHONE)
    })

    test('TC-6 — snapshot có nhắc tới bảng insurance và không rỗng', async () => {
        expect(savedRow, 'TC-1 chưa lấy được dòng audit').not.toBeNull()
        skipWithReason(!withSnapshots, 'schema chưa có before_json/after_json')

        const beforeRows = rowsForTable(savedRow!.beforeJson, 'insurance')
        const afterRows = rowsForTable(savedRow!.afterJson, 'insurance')

        expect(
            beforeRows.length,
            'before_json không chứa dòng insurance nào — 保険 là bảng mà màn này ghi',
        ).toBeGreaterThan(0)
        expect(afterRows.length).toBeGreaterThan(0)

        // Đủ cột để dựng lại câu lệnh khôi phục, không chỉ vài field lẻ.
        expect(
            Object.keys(beforeRows[0]!.values).length,
            'snapshot chỉ có vài cột — khôi phục tay cần đủ cột của dòng',
        ).toBeGreaterThan(5)
    })
})
