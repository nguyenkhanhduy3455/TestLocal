/**
 * 枝番 (pat_br) đi theo TỪNG DÒNG — tháng có 2 枝番 phải tính tiền riêng rồi cộng.
 *
 * ─── Luật WinForm ────────────────────────────────────────────────────────────
 * `pat_br` là một CỘT CỦA LƯỚI (`hFG1[68]`), không phải thuộc tính của màn hình:
 *
 *   · dòng đọc từ DB   → giữ nguyên 枝番 đã lưu
 *       modSave.cs:2680   hFG1[68, intRow].Value = trtData.pat_br
 *       modSave.cs:243    data.pat_br = hFG1[68, intRow]      ← GetViewToTrtDataList
 *   · dòng vừa nhập    → 枝番 có hiệu lực tại NGÀY CỦA CHÍNH DÒNG ĐÓ
 *       frm203002.cs:5491 GetValidSubCode2(pstrPatId, DateTime.Parse(hFG1[78, …]))
 *
 * rồi 会計 gom theo cột đó:
 *       modAcc.cs:76   var groupBy_pat_br = trtDataList.GroupBy(x => x.pat_br)
 *       modAcc.cs:174  foreach (var _buiPriceData2 in _buiPriceData2s)   ← DispDayPoint
 *       modAcc.cs:233  foreach (var _buiPriceData2 in _buiPriceData2s)   ← GetDayPoint
 * ⇒ TÍNH theo 枝番, HIỂN THỊ và THU tổng của mọi 枝番.
 *
 * Bản port cũ coi 1 tháng = 1 枝番: lưu thì đóng một 枝番 (lấy theo 診療日 của màn
 * hình) lên toàn bộ dòng trong tháng, còn 会計 chỉ đọc `pat_br` của dòng ĐẦU TIÊN —
 * nên bệnh nhân đổi bảo hiểm giữa tháng (kể cả dữ liệu migrate từ hệ cũ) bị rụng
 * hẳn phần 処置 của 枝番 kia khỏi số tiền, và mỗi lần F9 lại xoá luôn lịch sử 枝番.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - `SaveTreatmentRowRequest.PatBr` (`int?`) — FE chỉ gửi 枝番 ĐÃ LƯU của dòng đọc
 *    từ DB; dòng vừa nhập bỏ trống để BE tự tra theo ngày của dòng.
 *  - `GridMonthTrtRows.Build(..., patBrForDate)` — `row.PatBr is { } p and > 0`
 *    mới dùng; **0 bị coi như không khai báo** (0 là placeholder của bệnh nhân chưa
 *    có bảo hiểm, giữ lại sẽ khoá 一部負担金 ở 0円 vĩnh viễn).
 *  - `MonthBranchPricing.RunPerBranchAsync` + `Sum` — chạy engine mỗi 枝番 rồi cộng;
 *    dùng ở daily-summary / insert-unpaid / 日計フッター.
 *  - `GET /tenant/treatment/accounting/monthly-copayments` trả `days[]` = một mục cho
 *    mỗi NGÀY có 処置, đúng thứ vẽ `[負担金 N円][日計 M点]` dưới lưới.
 *
 * ─── Dữ liệu ─────────────────────────────────────────────────────────────────
 * Tự dựng bệnh nhân riêng (`SEED_PAT_NO_BASE`) — không mượn bệnh nhân thật, vì spec
 * này phải SỬA bảng `insurance` (thêm 枝番 2, đặt `bur_rate` cho cả hai).
 * Hai ngày cùng số điểm, hai 枝番 khác 負担割合 30% / 10% ⇒ 負担金 ngày đầu = 3× ngày sau.
 * So theo TỈ LỆ chứ không theo số tuyệt đối: engine còn 端数処理 và 自己負担限度額,
 * nhưng tỉ lệ 3:1 thì không phụ thuộc mấy thứ đó ở mức điểm nhỏ.
 *
 * `serial` + page dùng chung (Rule 19). Ghi DB nên bắt buộc `TEST_ALLOW_SAVE=1`.
 */

import { type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import {
    GRID_LOAD_ATTEMPTS,
    GRID_LOAD_TIMEOUT,
    GRID_RELOAD_TIMEOUT,
    allowSave,
} from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/** Bệnh nhân riêng của spec này — +7 để không đụng spec seed khác. */
const PAT_NO = Number(process.env.TEST_PAT_NO ?? SEED_PAT_NO_BASE + 7)

/** Tháng test: tháng hiện hành (lưới 診療入力 chỉ cho sửa tháng hiện hành). */
const NOW = new Date()
const MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
/** Ngày của 枝番 1 và của 枝番 2 — 枝番 2 lấy tư cách từ ngày 10. */
const DAY_BR1 = 4
const DAY_BR2 = 18
const DT_BR1 = `${MONTH}-0${DAY_BR1}`
const DT_BR2 = `${MONTH}-${DAY_BR2}`
const BR2_ACQUIRED = `${MONTH}-10`

/** 歯科再診料 — mở một lượt khám, điểm ổn định. */
const SAISIN = 110
const TRT_PT = 100

const MONTHLY_COPAYMENTS_URL = /\/tenant\/treatment\/accounting\/monthly-copayments/
/** F9 登録 — save-treatments-api.ts:113. */
const BULK_SAVE_URL = /\/tenant\/treatment\/bulk-save(\?|$)/

type DayLine = { day: number; insScore: number; insPrice: number }

test.describe.configure({ mode: 'serial' })

test.describe('枝番 (pat_br) — tháng bắc qua 2 枝番', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    let seeded = false

    /** 日計 của lần `monthly-copayments` gần nhất + số thứ tự để biết đã có lần mới. */
    let lastDays: DayLine[] | null = null
    let daysSeq = 0
    const onResponse = async (res: import('@playwright/test').Response) => {
        if (!MONTHLY_COPAYMENTS_URL.test(res.url())) return
        const body = (await res.json().catch(() => null)) as
            | { data?: { days?: DayLine[] } }
            | null
        if (!body?.data?.days) return
        lastDays = body.data.days.map((d) => ({
            day: Number(d.day),
            insScore: Number(d.insScore),
            insPrice: Number(d.insPrice),
        }))
        daysSeq++
    }

    /**
     * 日計 của cả tháng, đọc thẳng từ response `monthly-copayments`.
     *
     * `openOn` phải KHÁC nhau giữa các lần gọi trong cùng một lượt chạy:
     * `monthlyCopaymentItem` khoá theo `{ patNo, trtDt }` với `staleTime` 30s, nên mở
     * lại đúng ngày cũ thì react-query phục vụ từ cache và KHÔNG có request nào để
     * chờ — lần chạy đầu đã treo 60s ở đúng chỗ này. Đổi sang một ngày khác trong
     * CÙNG tháng là đủ (handler tự nới ra cả tháng nên `days` không đổi).
     */
    /**
     * Mở 診療入力 ở `openOn`, thử lại vài lần. Cần retry vì đây là Vite **dev**
     * server VÀ vì sau F9 登録 app tự điều hướng rời màn — lượt goto ngay sau đó đã
     * gặp thật cảnh trang trắng.
     */
    async function openEntry(openOn: string): Promise<void> {
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${openOn}`, {
                waitUntil: 'domcontentloaded',
            })
            const ok = await page
                .getByText('合計:')
                .first()
                .waitFor({ state: 'visible', timeout: GRID_RELOAD_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (ok) return
            console.log(`lưới chưa hiện (lần ${attempt}/${GRID_LOAD_ATTEMPTS}) — tải lại`)
        }
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * 日計 của cả tháng.
     *
     * Body được đọc NGAY trong listener chứ không giữ `Response` rồi `json()` sau:
     * `openEntry` có thể goto lại (retry) và điều hướng làm Chromium vứt body của
     * response cũ — đã gặp thật: `Protocol error (Network.getResponseBody): No
     * resource with given identifier found`.
     */
    async function readMonthlyCopayments(openOn: string): Promise<DayLine[]> {
        const before = daysSeq
        await openEntry(openOn)
        await expect
            .poll(() => daysSeq, { timeout: GRID_LOAD_TIMEOUT })
            .toBeGreaterThan(before)
        return lastDays ?? []
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        page.on('response', onResponse)

        if (!dbEnabled || !allowSave) return

        // 枝番 1 (30%) — seedTestPatient dựng sẵn pat_br = 1.
        await seedTestPatient({ patNo: PAT_NO, accRate: 30 })
        await withDb(async (c) => {
            await c.query(`UPDATE insurance SET bur_rate = 30, acc_rate = 30 WHERE pat_no = $1`, [
                PAT_NO,
            ])
            // 枝番 2 (10%) — lấy tư cách giữa tháng.
            //
            // Nhân bản qua bảng tạm thay vì liệt kê cột: `insurance` có ~40 cột và
            // nhiều cột NOT NULL, liệt kê tay là nợ kỹ thuật (schema còn đổi).
            // `id` là uuid PK (InsuranceConfiguration: HasKey(x => x.Id)) nên PHẢI
            // cấp lại, nếu không INSERT vỡ vì trùng khoá.
            await c.query(`DROP TABLE IF EXISTS tmp_ins_br2`)
            await c.query(
                `CREATE TEMP TABLE tmp_ins_br2 AS
                 SELECT * FROM insurance WHERE pat_no = $1 AND pat_br = 1`,
                [PAT_NO],
            )
            await c.query(
                `UPDATE tmp_ins_br2
                    SET id = gen_random_uuid(), pat_br = 2,
                        bur_rate = 10, acc_rate = 10, br_dt = $1::date`,
                [BR2_ACQUIRED],
            )
            await c.query(`INSERT INTO insurance SELECT * FROM tmp_ins_br2`)
            await c.query(`DROP TABLE tmp_ins_br2`)
        })

        await seedTreatmentRows(PAT_NO, DT_BR1, [
            { trtCd: SAISIN, trtPt: TRT_PT, dspTrt: 'E2E 枝番1' },
        ])
        await seedTreatmentRows(PAT_NO, DT_BR2, [
            { trtCd: SAISIN, trtPt: TRT_PT, dspTrt: 'E2E 枝番2' },
        ])
        // seedTreatmentRows đóng pat_br theo dòng thật/fallback → ép đúng 枝番 mong muốn.
        await withDb(async (c) => {
            await c.query(`UPDATE trn_trn SET pat_br = 1 WHERE pat_no = $1 AND trt_dt = $2::date`, [
                PAT_NO,
                DT_BR1,
            ])
            await c.query(`UPDATE trn_trn SET pat_br = 2 WHERE pat_no = $1 AND trt_dt = $2::date`, [
                PAT_NO,
                DT_BR2,
            ])
        })
        seeded = true
    })

    test.afterAll(async () => {
        // Page dùng chung cả worker → listener KHÔNG tự mất, phải gỡ tay (Rule 19.1).
        page.off('response', onResponse)
        // Để mọi POST của chuỗi F8 đáp xong rồi mới xoá — nếu không, một request
        // còn đang bay sẽ ghi lại dòng vừa xoá và để sót dữ liệu test.
        await page.waitForLoadState('networkidle').catch(() => {})
        if (seeded) {
            // Spec này không chạy F8, nhưng xoá cho chắc: `deleteTestPatient`
            // không đụng bảng `unpaid`.
            await withDb((c) =>
                c.query(`DELETE FROM unpaid WHERE pat_no = $1`, [PAT_NO]),
            ).catch(() => {})
            await deleteTestPatient(PAT_NO).catch(() => {})
        }
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    test('TC-PATBR-1 — 日計 của CẢ HAI 枝番 đều có mặt, mỗi ngày theo 負担割合 của 枝番 mình', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật — spec này dựng/xoá bệnh nhân test')
        if (!dbEnabled || !allowSave) return

        const days = await readMonthlyCopayments(DT_BR2)
        console.log(`monthly-copayments: ${JSON.stringify(days)}`)
        await step()

        const d1 = days.find((d) => d.day === DAY_BR1)
        const d2 = days.find((d) => d.day === DAY_BR2)

        expect(
            d1,
            `ngày ${DAY_BR1} (枝番 1) biến mất khỏi 日計 — engine chỉ chạy cho MỘT 枝番`,
        ).toBeDefined()
        expect(
            d2,
            `ngày ${DAY_BR2} (枝番 2) biến mất khỏi 日計 — engine chỉ chạy cho MỘT 枝番`,
        ).toBeDefined()
        if (!d1 || !d2) return

        expect(d1.insScore, '日計点 của ngày 枝番 1').toBe(TRT_PT)
        expect(d2.insScore, '日計点 của ngày 枝番 2').toBe(TRT_PT)

        expect(d1.insPrice, '負担金 của 枝番 1 (30%) phải > 0').toBeGreaterThan(0)
        expect(d2.insPrice, '負担金 của 枝番 2 (10%) phải > 0').toBeGreaterThan(0)
        expect(
            d1.insPrice,
            'cùng số điểm mà 30% / 10% ⇒ tỉ lệ 3:1. Bằng nhau nghĩa là cả hai ngày ' +
                'đang bị tính bằng CÙNG một 枝番.',
        ).toBe(d2.insPrice * 3)
    })

    test('TC-PATBR-2 — F9 保存 KHÔNG gộp cả tháng về một 枝番', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật')
        if (!dbEnabled || !allowSave) return

        // Màn hình mở ở DT_BR2 ⇒ 枝番 theo 診療日 của MÀN HÌNH là 2. Bản cũ đóng số 2
        // lên mọi dòng của tháng, xoá mất 枝番 1 của ngày 4.
        await openEntry(DT_BR2)

        // ⚠️ PHẢI chờ CHÍNH các dòng 処置 hiện ra, không chỉ chờ footer 合計.
        // Lần chạy đầu bấm F9 ngay sau khi thấy 合計: — lúc đó `currentRows` còn rỗng,
        // và bulk-save xoá mềm cả tháng rồi chèn lại 0 dòng ⇒ trn_trn trống trơn,
        // testcase báo "mất dòng" trong khi lỗi là ở chính spec.
        for (const nm of ['E2E 枝番1', 'E2E 枝番2']) {
            await expect(
                page.getByText(nm).first(),
                `dòng "${nm}" chưa lên lưới — F9 lúc này sẽ lưu một tháng RỖNG`,
            ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        }
        await step()

        // Soi luôn payload để khi đỏ biết ngay là lưới rỗng hay 枝番 sai.
        let savedRows: { day: number; patBr?: number }[] = []
        const capture = (req: import('@playwright/test').Request) => {
            if (!BULK_SAVE_URL.test(req.url()) || req.method() !== 'POST') return
            const b = req.postDataJSON() as { rows?: { day: number; patBr?: number }[] } | null
            savedRows = b?.rows ?? []
        }
        page.on('request', capture)

        const saved = page
            .waitForResponse(
                (r) => BULK_SAVE_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: 60_000 },
            )
            .catch(() => null)
        await page.keyboard.press('F9')

        // Cổng 確認 của F9 nếu có (「保存してよろしいですか？」 / 診療チェック).
        for (let i = 0; i < 6; i++) {
            const box = page.locator('[role="dialog"], [role="alertdialog"]').first()
            if (!(await box.isVisible().catch(() => false))) break
            const ok = box.getByRole('button', { name: /^(OK|はい|Yes)$/ }).first()
            if (await ok.isVisible().catch(() => false)) {
                await ok.click()
                continue
            }
            break
        }
        const res = await saved
        page.off('request', capture)
        expect(res, 'F9 không gửi bulk-save (lưới không dirty / bị cổng chặn)').not.toBeNull()
        if (res === null) return
        console.log(`bulk-save gửi ${savedRows.length} dòng: ${JSON.stringify(savedRows.map((r) => ({ day: r.day, patBr: r.patBr })))}`)
        expect(savedRows.length, 'F9 gửi lưới RỖNG — spec bấm quá sớm, không phải lỗi app').toBeGreaterThan(0)
        await step()

        const rows = await withDb(async (c) => {
            const r = await c.query<{ trt_dt: string; pat_br: number }>(
                `SELECT trt_dt::text AS trt_dt, pat_br FROM trn_trn
                  WHERE pat_no = $1
                  ORDER BY trt_dt`,
                [PAT_NO],
            )
            return r.rows.map((x) => ({ trtDt: x.trt_dt.slice(0, 10), patBr: Number(x.pat_br) }))
        })
        console.log(`trn_trn sau F9: ${JSON.stringify(rows)}`)

        const br1 = rows.filter((r) => r.trtDt === DT_BR1).map((r) => r.patBr)
        const br2 = rows.filter((r) => r.trtDt === DT_BR2).map((r) => r.patBr)
        expect(br1.length, 'dòng của ngày 枝番 1 bị mất sau F9').toBeGreaterThan(0)
        expect(br2.length, 'dòng của ngày 枝番 2 bị mất sau F9').toBeGreaterThan(0)
        expect(
            br1.every((b) => b === 1),
            'dòng ngày 4 phải GIỮ 枝番 1 (modSave.cs:2680 — dòng đọc từ DB mang 枝番 đã lưu)',
        ).toBe(true)
        expect(
            br2.every((b) => b === 2),
            'dòng ngày 18 phải giữ 枝番 2',
        ).toBe(true)
    })

    test('TC-PATBR-3 — sau F9, 日計 vẫn tách đúng hai 枝番', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB_* chưa cấu hình')
        skipWithReason(!allowSave, 'TEST_ALLOW_SAVE chưa bật')
        if (!dbEnabled || !allowSave) return

        // Ngày KHÁC lần trước (xem doc của readMonthlyCopayments).
        const days = await readMonthlyCopayments(DT_BR1)
        console.log(`monthly-copayments sau F9: ${JSON.stringify(days)}`)
        const d1 = days.find((d) => d.day === DAY_BR1)
        const d2 = days.find((d) => d.day === DAY_BR2)
        expect(d1, `ngày ${DAY_BR1} biến mất sau khi lưu`).toBeDefined()
        expect(d2, `ngày ${DAY_BR2} biến mất sau khi lưu`).toBeDefined()
        if (!d1 || !d2) return
        expect(
            d1.insPrice,
            'lưu xong mà tỉ lệ 3:1 vỡ ⇒ F9 đã gộp hai 枝番 làm một',
        ).toBe(d2.insPrice * 3)
    })
})
