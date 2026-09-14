import { type Page } from '@playwright/test'

import {
    type AuditRow,
    actionsOf,
    actionsOn,
    auditRowsSince,
    dbNow,
    describeRow,
} from '../_shared/audit-log'
import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { allowSave, trtDt, TODAY_ISO } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 監査ログ — các thao tác GHI BẰNG SET-BASED / RAW SQL có để lại `actions` không.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NHÓM BUG ĐANG ĐO (fix ở `investigate/tenant-audit-log-findings`, commit 7b4fe6072)
 * ═══════════════════════════════════════════════════════════════════════════
 * `TenantChangeRecordingInterceptor` chỉ thấy thứ đi qua EF change tracker. Mọi
 * `ExecuteUpdateAsync` / `ExecuteDeleteAsync` / `SoftDeleteAsync` và mọi writer raw SQL
 * đều VÔ HÌNH với nó. 7 handler ghi DB bằng đúng những đường đó mà không tự khai
 * `actions`, nên dòng nhật ký của chúng hoặc rỗng hoặc chỉ có một nửa.
 *
 * Nửa vời còn nguy hơn rỗng: vết trông như đủ, mà khôi phục theo nó thì dòng nhân đôi.
 *
 * Mỗi testcase dưới đây gọi đúng một endpoint rồi soi `t_<slug>.audit_log`. Trước fix
 * chúng đỏ vì `actions` thiếu/rỗng; sau fix xanh.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO GỌI API CHỨ KHÔNG BẤM UI
 * ═══════════════════════════════════════════════════════════════════════════
 * Thứ đang đo là **dòng trong DB**, UI không thêm tín hiệu nào. Mà 7 endpoint này rải
 * khắp 5 màn khác nhau (患者登録 / 部位病名管理 / カルテ待ち / 診療開始日 / 会計) —
 * dựng đủ 5 luồng UI là 5 lần cơ hội đỏ vì lý do không liên quan. Header auth bóc từ
 * chính request của app, cùng pattern `kaigo-hutan-row.spec.ts:426` và
 * `tooth-extraction-siga-restore.spec.ts:267` (accessToken chỉ nằm trong RAM,
 * GUIDELINE 10.2).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AN TOÀN DỮ LIỆU — ĐỌC TRƯỚC KHI SỬA
 * ═══════════════════════════════════════════════════════════════════════════
 * Spec tự seed MỘT bệnh nhân trong dải test (`pat_no >= SEED_PAT_NO_BASE`) rồi xoá ở
 * `afterAll`. TC cuối XOÁ HẲN bệnh nhân đó, nên:
 *   · KHÔNG chạy với `TEST_PAT_NO` trỏ vào bệnh nhân thật — spec tự chặn bằng
 *     `assertSeedPatNo` bên trong `seedTestPatient`, nhưng đừng thử;
 *   · `mode: 'serial'` và THỨ TỰ TC LÀ MỘT PHẦN CỦA SPEC: TC-8 (xoá bệnh nhân) phải
 *     chạy cuối, mọi TC trước nó cần bệnh nhân còn sống.
 * Cần `TEST_ALLOW_SAVE=1` (Rule 18.1) vì đây toàn là thao tác ghi thật.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HANDLER KHÔNG PHỦ ĐƯỢC Ở ĐÂY
 * ═══════════════════════════════════════════════════════════════════════════
 * `BuildTrnTrnLedgerDatasourceHandler` (帳票 カルテ2号紙) cũng nằm trong nhóm fix —
 * nó xoá mềm `ncult` theo khoảng ngày. KHÔNG đo ở đây: endpoint là đường dựng
 * datasource in ấn, đòi `chkSum` khớp + trạng thái `cct_line` nhất quán, và chạm vào
 * luồng in là chạm vào cái bẫy đã ghi trong GUIDELINE. Phần đó để unit test lo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/cross-cutting/tenant-audit-actions-coverage.spec.ts
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

/** Bệnh nhân test — LUÔN trong dải seed, vì TC-8 xoá hẳn nó. */
const PAT_NO = SEED_PAT_NO_BASE + 731
const PAT_BR = 1
const TRT_DT = trtDt(TODAY_ISO)

const EV = {
    patMsgSaved: 'pat_msg_saved',
    cctaSaved: 'ccta_saved',
    cctaFinished: 'ccta_finished',
    cctWaitDeleted: 'cct_wait_deleted',
    medStartDatesUpdated: 'med_start_dates_updated',
    accountingBulkCreated: 'accounting_bulk_created',
    patientDeleted: 'patient_deleted',
} as const

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: không có API/màn hình nào đọc t_<slug>.audit_log, spec phải soi Postgres',
)
skipWithReason(
    !allowSave,
    'Cần TEST_ALLOW_SAVE=1: mọi TC ở đây là thao tác GHI thật (Rule 18.1), TC cuối xoá hẳn ' +
        'bệnh nhân test',
)

test.describe('監査ログ — set-based / raw-SQL write phải để lại actions', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Origin thật của API + header auth, bóc từ request của app (GUIDELINE 10.2). */
    let apiOrigin = ''
    let authHeaders: Record<string, string> = {}

    const json = () => ({ ...authHeaders, 'Content-Type': 'application/json' })

    /**
     * Chờ đúng MỘT dòng nhật ký của `eventType` xuất hiện sau mốc `since`, rồi trả về.
     *
     * Poll thay vì đọc một phát: writer ghi đồng bộ trong chính request nhưng
     * `TenantAuditLogWriter` là fail-open, nên nếu nó hỏng thì không có exception nào —
     * chỉ có dòng không bao giờ tới. Poll cho thông báo lỗi nói đúng chuyện đó.
     */
    async function auditRowFor(eventType: string): Promise<AuditRow> {
        let rows: AuditRow[] = []
        await expect
            .poll(
                async () => {
                    rows = await auditRowsSince(mark, eventType)
                    return rows.length
                },
                {
                    timeout: 30_000,
                    intervals: [300, 700, 1000, 2000, 3000, 5000],
                    message:
                        `Không có dòng '${eventType}' nào sau thao tác. TenantAuditLogWriter ` +
                        'fail-open nên API vẫn 2xx khi ghi nhật ký hỏng — response xanh KHÔNG ' +
                        'chứng minh gì về nhật ký.',
                },
            )
            .toBe(1)
        return rows[0]!
    }

    /** Mốc thời gian lấy TỪ DB (máy test có thể lệch giờ) — đặt lại trước mỗi thao tác. */
    let mark: Date

    const resetMark = async () => {
        mark = await dbNow()
    }

    /** Dựng chuỗi `bảng/loại` để nhồi vào thông báo lỗi. */
    const shapeOf = (row: AuditRow) =>
        JSON.stringify(actionsOf(row).map((a) => `${a.table}/${a.type}`))

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })

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

        // Bệnh nhân test + một dòng 処置 (TC-6 cần trn_trn để có gì mà cập nhật).
        await seedTestPatient({ patNo: PAT_NO })
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: 1, trtSb: 0, trtCnt: 1, trtPt: 12, dspTrt: '初診' },
        ])

        // Mở một màn bất kỳ để app gọi endpoint /tenant/… → bóc được header auth.
        // Cố tình KHÔNG dùng env.patNo(): TEST_PAT_NO không được phép chi phối spec này,
        // TC-8 xoá hẳn bệnh nhân nên nó phải luôn là dòng seed.
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
            waitUntil: 'domcontentloaded',
        })
        await expect
            .poll(() => (apiOrigin !== '' && authHeaders['authorization'] ? 'ok' : 'chưa'), {
                timeout: 60_000,
                message: 'không bóc được header auth — app chưa gọi endpoint /tenant/… nào?',
            })
            .toBe('ok')
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)

        // `deleteTestPatient` chỉ dọn 5 bảng (trn_trn / siga / kon / insurance / person),
        // còn spec này tạo dòng ở 3 bảng khác nữa. Không dọn thì lần chạy sau TC-1 gặp
        // dòng pat_msg có sẵn ⇒ thao tác thành UPDATE, `update_dt` không nằm trong tập cột
        // đã đổi, và assertion về kiểu giá trị đỏ oan.
        //
        // Xoá CỨNG được vì `pat_no` nằm trong dải seed: không dòng nào của bệnh nhân này là
        // dữ liệu thật. Cố tình KHÔNG mở rộng `deleteTestPatient` trong db.ts — dọn cái gì
        // là việc của spec đã tạo ra nó (và đó là hạ tầng dùng chung của 70 spec khác).
        const residue = ['pat_msg', 'ccta', 'acc_dat', 'acc_dat_bill', 'unpaid', 'ncult']
        await withDb(async (c) => {
            for (const table of residue) {
                await c.query(`DELETE FROM ${table} WHERE pat_no = $1`, [PAT_NO])
            }
        }).catch((e) => console.log(`dọn bảng phụ hỏng: ${(e as Error).message}`))

        // Bọc lại: dọn hỏng không được che mất lỗi test thật. TC-8 đã xoá mềm bệnh nhân,
        // đây là xoá cứng cho sạch dải seed.
        await deleteTestPatient(PAT_NO).catch((e) =>
            console.log(`dọn bệnh nhân test ${PAT_NO} hỏng: ${(e as Error).message}`),
        )
    })

    // ── AuditSnapshot: giá trị phải là của CỘT, không phải của property C# ──

    test('TC-1 — pat_msg: update_dt vào vết dưới dạng timestamp, không phải ngày trần', async () => {
        await resetMark()

        const res = await page.request.put(`${apiOrigin}/tenant/settlement/${PAT_NO}/msg`, {
            headers: json(),
            data: { updateDt: TRT_DT, msg1: 'E2E 監査テスト' },
        })
        expect(res.status(), `PUT msg thất bại: ${(await res.text()).slice(0, 200)}`).toBe(200)

        const row = await auditRowFor(EV.patMsgSaved)
        const patMsg = actionsOn(row, 'pat_msg')
        expect(
            patMsg.length,
            `không có action nào trên pat_msg. actions=${shapeOf(row)}`,
        ).toBeGreaterThan(0)

        // pat_msg.update_dt là timestamptz trong DDL nhưng DateOnly trên entity
        // (PatMsgConfiguration có HasConversion). Vết được người khôi phục dùng để VIẾT SQL,
        // nên phải là literal của cột — '2026-09-14T00:00:00Z', không phải '2026-09-14'.
        const updateDt = String(
            patMsg[0]!.new?.['update_dt'] ?? patMsg[0]!.old?.['update_dt'] ?? '',
        )
        expect(
            updateDt,
            'update_dt đang được ghi ở kiểu model (DateOnly) chứ không phải kiểu cột ' +
                `(timestamptz) — xem AuditSnapshot.ProviderValue. Giá trị: ${updateDt}`,
        ).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        await step()
    })

    // ── SaveCcta: cả hai nửa của CÙNG một bảng ──────────────────────────────

    test('TC-2 — ccta lần lưu đầu: có action insert', async () => {
        await resetMark()

        const res = await page.request.put(`${apiOrigin}/tenant/ccta/${PAT_NO}`, {
            headers: json(),
            data: {
                patBr: PAT_BR,
                rows: [
                    {
                        seq: 1,
                        dis: 'Ｃ',
                        stDt: TRT_DT,
                        edDt: null,
                        outcome: null,
                        fin: 0,
                        buiFlg: 0,
                        bui: Array.from({ length: 32 }, () => 0),
                    },
                ],
            },
        })
        expect(res.status(), `PUT ccta thất bại: ${(await res.text()).slice(0, 200)}`).toBe(200)

        const row = await auditRowFor(EV.cctaSaved)
        expect(
            actionsOn(row, 'ccta').map((a) => a.type),
            `lần lưu đầu phải có insert. actions=${shapeOf(row)}`,
        ).toContain('insert')
        await step()
    })

    test('TC-3 — ccta lưu lại: phải có ĐỦ CẢ softdelete VÀ insert', async () => {
        await resetMark()

        // Lần lưu thứ hai: handler xoá mềm toàn bộ dòng của (患者, 枝番) rồi chèn lại.
        const res = await page.request.put(`${apiOrigin}/tenant/ccta/${PAT_NO}`, {
            headers: json(),
            data: {
                patBr: PAT_BR,
                rows: [
                    {
                        seq: 1,
                        dis: 'Ｐ',
                        stDt: TRT_DT,
                        edDt: null,
                        outcome: null,
                        fin: 0,
                        buiFlg: 0,
                        bui: Array.from({ length: 32 }, () => 0),
                    },
                ],
            },
        })
        expect(res.status()).toBe(200)

        const row = await auditRowFor(EV.cctaSaved)
        const types = actionsOn(row, 'ccta').map((a) => a.type)

        // Đây là cạnh sắc của phép gộp THEO BẢNG: nửa xoá mềm là set-based (bộ ghi âm mù),
        // nửa chèn đi qua change tracker (bộ ghi âm thấy). Nêu tên `ccta` trong danh sách
        // thủ công là nhận quyền cả bảng, nên handler phải tự khai CẢ HAI — khai thiếu nửa
        // nào thì vết nói dối nửa đó.
        expect(
            types,
            'thiếu nửa xoá mềm ⇒ vết nói dòng mới xuất hiện mà không nói dòng cũ đi đâu. ' +
                `actions=${shapeOf(row)}`,
        ).toContain('softdelete')
        expect(
            types,
            'thiếu nửa chèn ⇒ danh sách thủ công đã ghi đè bản ghi âm của chính bảng đó. ' +
                `actions=${shapeOf(row)}`,
        ).toContain('insert')
        await step()
    })

    // ── MarkCctaFin: chỉ đúng cột câu lệnh ghi ──────────────────────────────

    test('TC-4 — ccta 完了: action update chỉ mang cột `fin` ở cả hai phía', async () => {
        await resetMark()

        const res = await page.request.patch(`${apiOrigin}/tenant/ccta/${PAT_NO}/fin`, {
            headers: json(),
            data: { patBr: PAT_BR, seqs: [1] },
        })
        expect(res.status(), `PATCH fin thất bại: ${(await res.text()).slice(0, 200)}`).toBe(200)

        const row = await auditRowFor(EV.cctaFinished)
        const updates = actionsOn(row, 'ccta')
        expect(
            updates.length,
            `không có action nào trên ccta. actions=${shapeOf(row)}`,
        ).toBeGreaterThan(0)

        const a = updates[0]!
        expect(a.type).toBe('update')
        expect(Number(a.new?.['fin'])).toBe(1)

        // Câu UPDATE này KHÔNG đóng dấu updated_at/updated_by. Nêu chúng ra là mô tả một
        // phép ghi không hề xảy ra — người khôi phục sẽ trả lại giá trị không ai đổi.
        for (const side of ['old', 'new'] as const) {
            expect(
                Object.keys(a[side] ?? {}),
                `phía '${side}' chỉ được có cột 'fin' — câu lệnh không ghi gì khác`,
            ).toEqual(['fin'])
        }
        await step()
    })

    // ── DeleteCctWaitList: xoá CỨNG ⇒ vết là bản sao cuối cùng ──────────────

    test('TC-5 — カルテ待ち xoá cứng: action delete mang ĐỦ MỌI CỘT', async () => {
        // Seed dòng ncult trực tiếp: không có endpoint nào tạo nó, và ncult không có
        // helper trong db.ts (đầu tiên dùng ⇒ giữ tại chỗ theo quy ước promote-on-second-use).
        await withDb(async (c) => {
            await c.query(
                `INSERT INTO ncult (pat_no, pat_br, trt_date) VALUES ($1, $2, $3::date)`,
                [PAT_NO, PAT_BR, TRT_DT],
            )
        })

        await resetMark()

        const res = await page.request.delete(`${apiOrigin}/tenant/ncult`, {
            headers: json(),
            data: { keys: [{ patNo: PAT_NO, patBr: PAT_BR }] },
        })
        expect([200, 204], `DELETE ncult thất bại: ${(await res.text()).slice(0, 200)}`).toContain(
            res.status(),
        )

        const row = await auditRowFor(EV.cctWaitDeleted)
        const gone = actionsOn(row, 'ncult')
        expect(
            gone.length,
            `không có action nào trên ncult. Writer là raw SQL nên bộ ghi âm không thấy — ` +
                `handler phải tự khai. actions=${shapeOf(row)}`,
        ).toBeGreaterThan(0)

        const a = gone[0]!
        expect(a.type, 'đây là xoá CỨNG, không phải xoá mềm').toBe('delete')
        expect(a.new, 'xoá cứng thì không còn gì ở phía new').toBeUndefined()
        // Dòng đã mất khỏi bảng, vết là bản sao duy nhất còn lại ⇒ phải đủ mọi cột.
        expect(
            Object.keys(a.old ?? {}),
            `phía old phải mang đủ mọi cột của ncult, đang có ${JSON.stringify(Object.keys(a.old ?? {}))}`,
        ).toEqual(
            expect.arrayContaining([
                'id',
                'pat_no',
                'pat_br',
                'trt_date',
                'created_at',
                'created_by',
                'updated_at',
                'updated_by',
            ]),
        )
        expect(Number(a.old!['pat_no'])).toBe(PAT_NO)
        await step()
    })

    // ── UpdateMedStartDates: hai pha, hai bảng ──────────────────────────────

    test('TC-6 — 診療開始日: action update trên trn_trn và/hoặc insurance', async () => {
        // `bt_dt_1` / `bt_dt_2` là NĂM và THÁNG của 処置日, không phải cờ 0/1
        // (TrnTrn.cs:208-209 `BtDt1 = (short)trtDt.Year`). Cột nullable, không default, mà
        // `seedTreatmentRows` không ghi hai cột đó ⇒ dòng seed để NULL và mệnh đề WHERE của
        // handler sẽ không khớp gì. Spec đặt đúng năm/tháng để có dòng mà cập nhật.
        const [year, month] = [
            Number(TRT_DT.slice(0, 4)),
            Number(TRT_DT.slice(5, 7)),
        ]
        await withDb(async (c) => {
            await c.query(
                `UPDATE trn_trn SET bt_dt_1 = $2, bt_dt_2 = $3 WHERE pat_no = $1`,
                [PAT_NO, year, month],
            )
        })

        await resetMark()

        const res = await page.request.put(
            `${apiOrigin}/tenant/patients/${PAT_NO}/med-start-dates`,
            {
                headers: json(),
                data: {
                    updates: [{ patBr: PAT_BR, btDt1: year, btDt2: month, medStDt: TRT_DT }],
                },
            },
        )
        expect(
            res.status(),
            `PUT med-start-dates thất bại: ${(await res.text()).slice(0, 200)}`,
        ).toBe(200)

        const row = await auditRowFor(EV.medStartDatesUpdated)
        const tables = new Set(actionsOf(row).map((a) => a.table))

        // Cả hai pha đều là ExecuteUpdate ⇒ bộ ghi âm mù cả hai. Trước fix dòng nhật ký này
        // KHÔNG có action nào. Bảng nào thực sự có dòng khớp thì mới xuất hiện, nên kiểm
        // "có ít nhất một trong hai" chứ không ghim cứng cả hai.
        expect(
            [...tables],
            'không có action nào — trước fix đây đúng là trạng thái của dòng nhật ký này. ' +
                `actions=${shapeOf(row)}`,
        ).toEqual(expect.arrayContaining([expect.stringMatching(/^(trn_trn|insurance)$/)]))

        for (const a of actionsOf(row)) {
            expect(a.type).toBe('update')
            expect(a.key, `action thiếu key ⇒ không tìm lại được dòng`).toHaveProperty('id')
            expect(a.old, 'update phải có phía old').toBeDefined()
            expect(a.new, 'update phải có phía new').toBeDefined()
        }
        await step()
    })

    // ── BulkCreateAccounting: CỐ Ý không có actions, bù bằng meta ───────────

    test('TC-7 — 会計一括作成: meta mang deletedAt + patNos để hoàn tác được', async () => {
        await resetMark()

        // Khai ĐỦ mọi field còn lại của AccountingDataItemRequest: thiếu field là cột
        // NOT NULL của acc_dat nhận default, và test sẽ đỏ vì 500 chứ không vì cái đang đo.
        const zeros = {
            score: 0,
            claimAmt: 0,
            discount: 0,
            tax: 0,
            accrAmt: 0,
            accrTax: 0,
            apprAmt: 0,
            apprTax: 0,
            receAmt: 0,
            receTax: 0,
            receKbn: 0,
            pflg: 0,
            sflg: 0,
            gdsCd: 0,
            gdsCnt: 0,
            attDr: 0,
            accTm: `${TRT_DT}T09:00:00Z`,
            meds: 0,
            tflg: 0,
            scoreD1: 0,
            scoreD2: 0,
            scoreD3: 0,
            scoreD4: 0,
            scoreD5: 0,
            scoreD6: 0,
            scoreD7: 0,
            scoreD8: 0,
            scoreD9: 0,
            scoreD10: 0,
            scoreD11: 0,
            scoreD12: 0,
            scoreD13: 0,
            scoreD14: 0,
            patBr: PAT_BR,
            lflg: 0,
        }

        const res = await page.request.post(
            `${apiOrigin}/tenant/treatment/accounting/bulk-create`,
            {
                headers: json(),
                data: {
                    accountingDataList: [
                        {
                            accDt: TRT_DT,
                            accCnt: 1,
                            trtDt: TRT_DT,
                            trtCnt: 1,
                            patNo: PAT_NO,
                            kmCd: 1,
                            ...zeros,
                        },
                    ],
                    startDate: TRT_DT,
                    endDate: TRT_DT,
                    accMake: 0,
                },
            },
        )
        expect(
            res.status(),
            `POST bulk-create thất bại: ${(await res.text()).slice(0, 300)}`,
        ).toBe(200)

        const row = await auditRowFor(EV.accountingBulkCreated)

        // Handler này CỐ Ý không truyền actions: batch cả kỳ × nhiều bệnh nhân, acc_dat tới
        // ~4.000 dòng cho MỘT bệnh nhân, nên ghi từng dòng sẽ vượt cap và thành vết cụt
        // không khôi phục được. Thay vào đó meta mang đúng thứ cần: `deletedAt` là dấu
        // nhận diện tập dòng bị xoá mềm (lần chạy trước có dấu khác), cộng danh sách
        // bệnh nhân và khoảng ngày ⇒ dựng lại được mệnh đề WHERE để hoàn tác.
        expect(
            Object.keys(row.meta),
            `meta thiếu deletedAt/patNos — không dựng lại được mệnh đề hoàn tác. ` +
                `meta=${JSON.stringify(row.meta)}`,
        ).toEqual(expect.arrayContaining(['deletedAt', 'patNos', 'startDate', 'endDate']))

        expect(String(row.meta['deletedAt'] ?? '')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(row.meta['patNos']).toEqual(expect.arrayContaining([PAT_NO]))
        await step()
    })

    // ── DeletePatient: PHẢI CHẠY CUỐI — xoá hẳn bệnh nhân test ─────────────

    test('TC-8 — xoá bệnh nhân: mỗi bảng bị xoá mềm phải có action, kèm deletedRows', async () => {
        await resetMark()

        // Guard của handler (PatientDeleteGuard) chặn bệnh nhân còn trn_trn/unpaid/acc_dat.
        // TC-6 cần trn_trn, TC-7 tạo acc_dat ⇒ phải dọn trước khi xoá, nếu không TC này đo
        // nhánh 409 chứ không đo được vết.
        await withDb(async (c) => {
            await c.query(`DELETE FROM trn_trn WHERE pat_no = $1`, [PAT_NO])
            await c.query(`DELETE FROM acc_dat WHERE pat_no = $1`, [PAT_NO])
            await c.query(`DELETE FROM acc_dat_bill WHERE pat_no = $1`, [PAT_NO])
            await c.query(`DELETE FROM unpaid WHERE pat_no = $1`, [PAT_NO])
        })

        const res = await page.request.delete(`${apiOrigin}/tenant/patients/${PAT_NO}`, {
            headers: json(),
        })
        // 204 No Content, không phải 200 — endpoint trả `Results.NoContent()`
        // (TenantPatientsEndpoints.cs:266). Đã vấp: assertion 200 làm TC đỏ trong khi xoá
        // đã thành công.
        expect(
            res.status(),
            `DELETE patient thất bại (409 = guard chặn, còn dữ liệu liên quan): ` +
                `${(await res.text()).slice(0, 200)}`,
        ).toBe(204)

        const row = await auditRowFor(EV.patientDeleted)
        console.log(`audit row: ${describeRow(row)}`)

        const actions = actionsOf(row)
        expect(
            actions.length,
            'KHÔNG có action nào. Đây chính là trạng thái trước fix: thao tác phá huỷ nhất ' +
                'của màn hình chỉ để lại {ai làm, mã bệnh nhân}. 16 bảng bị xoá mềm bằng ' +
                'SoftDeleteAsync (set-based) nên bộ ghi âm không thấy gì.',
        ).toBeGreaterThan(0)

        // person là bảng cha, luôn có dòng ⇒ luôn phải xuất hiện.
        const person = actionsOn(row, 'person')
        expect(person.length, `thiếu action trên person. actions=${shapeOf(row)}`).toBe(1)
        expect(person[0]!.type).toBe('softdelete')

        // insurance / siga / kon đều do seedTestPatient tạo (db.ts) ⇒ cả ba phải có mặt.
        for (const table of ['insurance', 'siga', 'kon']) {
            expect(
                actionsOn(row, table).length,
                `thiếu action trên ${table} — seedTestPatient luôn tạo dòng cho bảng này. ` +
                    `actions=${shapeOf(row)}`,
            ).toBeGreaterThan(0)
        }

        // Mỗi action xoá mềm phải mang đủ 4 cột dấu ở hai phía: khôi phục chỉ deleted_at sẽ
        // để updated_at đứng ở đúng thời điểm xoá, dòng không trở về trạng thái cũ.
        for (const a of actions.filter((x) => x.type === 'softdelete')) {
            expect(a.key, `action thiếu key`).toHaveProperty('id')
            for (const side of ['old', 'new'] as const) {
                expect(
                    Object.keys(a[side] ?? {}),
                    `phía '${side}' của ${a.table} thiếu cột dấu`,
                ).toEqual(
                    expect.arrayContaining([
                        'deleted_at',
                        'deleted_by',
                        'updated_at',
                        'updated_by',
                    ]),
                )
            }
            expect(a.old, `${a.table}: old.deleted_at phải là null (dòng đang sống)`).toHaveProperty(
                'deleted_at',
                null,
            )
        }

        // Mọi action phải thuộc đúng tập bảng mà purge có quyền đụng. Một tên lạ ở đây
        // nghĩa là vết đang khai một bảng handler không hề xoá.
        //
        // KHÔNG kiểm chiều ngược ("bảng rỗng thì không có action") ở tầng e2e: bảng nào
        // rỗng phụ thuộc vào việc mở màn 診療入力 có tạo siga/kon hay không, tức test sẽ
        // đỏ vì lý do không liên quan. Bất biến đó do unit test
        // DeletePatientHandlerTests ghim, ở đó trạng thái ban đầu là do test dựng hết.
        const purgeTables = [
            'insurance', 'med_ins_inf', 'pub_exp_inf', 'kon', 'siga', 'bnow', 'person_exp',
            'pat_msg', 'wait', 'yoyaku', 'unpaid', 'acc_dat_bill', 'acc_dat', 'trn_trn',
            'pub_exp_ticket', 'person', 'user_patient_history',
        ]
        for (const a of actions) {
            expect(purgeTables, `vết khai bảng '${a.table}' mà purge không đụng tới`).toContain(
                a.table,
            )
        }

        // Tổng số dòng — thứ nói purge này quét một lịch sử dài hay một vỏ rỗng.
        expect(Number(row.meta['deletedRows'] ?? 0)).toBeGreaterThan(0)
        await step()
    })
})
