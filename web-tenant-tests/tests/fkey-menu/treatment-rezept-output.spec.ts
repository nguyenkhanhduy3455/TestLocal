import fs from 'node:fs'
import path from 'node:path'

import { type Page, type Route } from '@playwright/test'

import { installOverlayHandlers } from '../_shared/overlays'
import { foldForCompare, readPdf } from '../_shared/pdf-content'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * 診療入力 → nút レセプト — NỘI DUNG tờ レセプト (診療報酬明細書) trên bệnh nhân THẬT.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  INP/Forms/frm203002.cs `btnReceipt_Click` → RCP/Lib/CommonPrint.cs `directPrint`:
 *    mỗi dòng trn_status (枝番 × 未来院区分 × 請求年月) = 1 tờ, mỗi 様式 (rpt_no của
 *    RPT304001 theo 請求年月) mở 1 bản xem trước, lần lượt.
 *  Mẫu theo tháng: 2018-04~2020-03 rpt30400180, 2020-04~2022-03 rpt30400200,
 *  2022-04~2024-05 rpt30400220, 2024-06~2026-05 rpt30400240, 2026-06~ rpt30400260.
 *
 * ─── Giá trị mong đợi lấy từ đâu ─────────────────────────────────────────────
 *  Ca ≥ 2022-04: đo bằng chính WinForm — gọi `CommonPrint.printProc` của bản build
 *  WinForm trên cùng DB rồi dump f1..f455 (156 ca, web khớp 100% từng ô). Mỗi ca
 *  dưới đây chỉ chốt vài ô đại diện.
 *  Ca < 2022-04: WinForm ném IndexOutOfRange ở mọi tháng này (CommonPrint.cs:1178 —
 *  `_sMsg5` bị thu còn 2 dòng nhưng vẫn đọc dòng 3-4), nên KHÔNG có giá trị WinForm.
 *  Web cố ý in được (chỉ 2 dòng その他); giá trị dưới đây là output web đã soát tay,
 *  giữ để bắt hồi quy.
 *
 * ─── In thật hay stub — suy từ NỀN TẢNG (giống oral-hygiene-instruction-dialog) ─
 *  Có agent (Windows, hoặc TEST_AGENT=1): /v1/render đi tới agent thật (chèn
 *  forcePreview), /v1/print bị CHẶN, PDF xem trước được tải về và soi số trang +
 *  các giá trị chốt. Agent phải được build từ code có rpt30400180/200/220/240.
 *  Không có agent: mọi endpoint agent bị stub — vẫn soi trọn datasource BE trả về
 *  và luồng xem trước của FE, phần soi PDF tự skip.
 *  /v1/print LUÔN bị chặn và trả job giả (cả khi có agent): F1 印刷 chỉ được kiểm
 *  tới chỗ FE gửi đúng 様式, không bao giờ có job xuống spooler.
 *
 * Chỉ ĐỌC dữ liệu: mở tháng đã có, lưới không sửa ⇒ không có hộp 保存しますか
 * (nếu có thì chọn いいえ = RestoreData, không ghi DB).
 *
 *   npx playwright test tests/fkey-menu/treatment-rezept-output.spec.ts
 *   TEST_AGENT=1 npx playwright test tests/fkey-menu/treatment-rezept-output.spec.ts   # máy có agent
 */

const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1' ? true : process.env.TEST_AGENT === '0' ? false : process.platform === 'win32'
const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'
/** strict: thiếu chữ Hán trên PDF là FAIL; loose: chỉ cảnh báo (xem pdf-content.ts). */
const PDF_TEXT_STRICT = (process.env.TEST_PDF_TEXT ?? 'strict') !== 'loose'

const DATASOURCE_URL = /\/tenant\/report\/\d+\/rezept-datasource(\?|$)/
const AGENT_RENDER_URL = /\/v1\/render(\?|$)/
const AGENT_PRINT_URL = /\/v1\/print(\?|$)/
const AGENT_ANY_URL =
    /\/(v1\/(render|print|prewarm|save-pdf)|healthz|v1\/jobs\/[^/]+\/events|tmp\/[0-9a-fA-F-]+\.pdf)(\?|$)/

const STUB_JOB_ID = '00000000-0000-4000-8000-0000000000aa'
const STUB_PDF_ID = '00000000-0000-4000-8000-0000000000bb'
const STUB_TICKET = 'stub-ticket'
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
}
/** PDF tối thiểu hợp lệ cho iframe ở chế độ stub. */
const STUB_PDF =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj ' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'

const PREVIEW_TITLE = '診療報酬明細書プレビュー'
/**
 * PDF agent render thật được lưu ra đây để soi bằng mắt (thư mục gitignore):
 * capture-results/rezept-pdf/<YYYY-MM-DD>/<患者番号>-<処置日>[-<n>].pdf
 */
const PDF_DIR = path.resolve(
    __dirname,
    '../../capture-results/rezept-pdf',
    new Date().toISOString().slice(0, 10),
)
const GRID_LOAD_TIMEOUT = 60_000

type Row = Record<string, string | number | null>
interface RenderRequestBody {
    reportId: string
    printCategory: number
    dataJson: { rcp: Row[]; rcpT: Row[] }
    forcePreview?: boolean
}
interface DatasourceEnvelope {
    success: boolean
    data: {
        shouldPrint: boolean
        renderRequest: RenderRequestBody | null
        additionalRenderRequests?: RenderRequestBody[] | null
    }
}

/**
 * Một tờ — tên cột theo ds304xxxxx.xsd:
 *  rcp.f3 診療年月 / f8 単独・併用 / f67 実日数 / kubun 区分
 *  rcpT.f402 公費分点数 / f404 公費一部負担金 / f405 合計点数 / f408 OCR① / f413 患者番号-連番
 */
interface Sheet {
    kubun: number
    f3: string
    f8: string
    f67: string
    f405: string
    f413: string
    f402?: string
    f404?: string
    f408?: string
    /** rcpT.f412 — ô điểm nhỏ trên mẫu 180/200, dòng その他 thứ 3 trên mẫu 220 trở đi. */
    f412?: string
}
interface Case {
    title: string
    patNo: number
    trtDt: string
    reportId: string
    sheets: Sheet[]
    /** Giá trị đo trên WinForm (true) hay output web giữ để bắt hồi quy (false). */
    winform: boolean
}

const CASES: Case[] = [
    {
        title: '2022-10 · 様式 220 · 社保単独 14 日 (có 傷病名部位, その他 X線)',
        patNo: 17767,
        trtDt: '2022-10-03',
        reportId: 'rpt30400220',
        winform: true,
        sheets: [
            {
                kubun: 15, f3: '令和  4 年 10 月分', f8: '1単独', f67: '14', f405: '8069', f413: '17767-1',
                f408: '13439006131223700000000089',
            },
        ],
    },
    {
        title: '2024-07 · 様式 240 · 社保単独',
        patNo: 10776,
        trtDt: '2024-07-03',
        reportId: 'rpt30400240',
        winform: true,
        sheets: [
            {
                kubun: 15, f3: '令和  6 年  7 月分', f8: '1単独', f67: '6', f405: '3963', f413: '10776-1',
                f408: '23418000000026000009004503',
            },
        ],
    },
    {
        title: '2023-12 · 未来院 (tờ 1) + 来院 (tờ 2) cùng tháng',
        patNo: 17491,
        trtDt: '2023-12-05',
        reportId: 'rpt30400220',
        winform: true,
        sheets: [
            // 未来院: 実日数 0, không in 一部負担金
            { kubun: 15, f3: '令和  5 年 12 月分', f8: '1単独', f67: '0', f405: '1543', f413: '17491-1', f404: '' },
            { kubun: 15, f3: '令和  5 年 12 月分', f8: '1単独', f67: '2', f405: '857', f413: '17491-2' },
        ],
    },
    {
        title: '2024-06 · 様式 240 · chỉ 未来院',
        patNo: 18078,
        trtDt: '2024-06-27',
        reportId: 'rpt30400240',
        winform: true,
        sheets: [{ kubun: 45, f3: '令和  6 年  6 月分', f8: '1単独', f67: '0', f405: '1607', f413: '18078-1' }],
    },
    {
        title: '2023-08 · 公費併用 (２併, 公費一部負担金 200円)',
        patNo: 15661,
        trtDt: '2023-08-05',
        reportId: 'rpt30400220',
        winform: true,
        sheets: [{ kubun: 25, f3: '令和  5 年  8 月分', f8: '2２併', f67: '1', f405: '823', f404: '200', f413: '15661-1' }],
    },
    {
        title: '2023-07 · 公費単独 (点数 ở 公費分, 合計点数 trống)',
        patNo: 10966,
        trtDt: '2023-07-05',
        reportId: 'rpt30400220',
        winform: true,
        sheets: [{ kubun: 3, f3: '令和  5 年  7 月分', f8: '1単独', f67: '', f402: '5017', f405: '', f413: '10966-1' }],
    },
    {
        title: '2018-07 · 様式 180 (WinForm crash ở tháng này)',
        patNo: 13952,
        trtDt: '2018-07-11',
        reportId: 'rpt30400180',
        winform: false,
        sheets: [{ kubun: 13, f3: '平成 30 年  7 月分', f8: '1単独', f67: '1', f405: '308', f413: '13952-1', f412: '' }],
    },
    {
        title: '2021-10 · 様式 200 · f412 là ô điểm (830), không phải dòng その他',
        patNo: 15685,
        trtDt: '2021-10-14',
        reportId: 'rpt30400200',
        winform: false,
        sheets: [{ kubun: 43, f3: '令和  3 年 10 月分', f8: '1単独', f67: '1', f405: '1746', f413: '15685-1', f412: '830' }],
    },
    {
        title: '2021-02 · tờ 2 có 請求年月 2021-01 ≠ 診療年月',
        patNo: 16793,
        trtDt: '2021-02-01',
        reportId: 'rpt30400200',
        winform: false,
        sheets: [
            { kubun: 13, f3: '令和  3 年  2 月分', f8: '1単独', f67: '1', f405: '588', f413: '16793-1' },
            { kubun: 13, f3: '令和  3 年  1 月分', f8: '1単独', f67: '0', f405: '1316', f413: '16793-2' },
        ],
    },
]

const jsonFulfill = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('診療入力 レセプト — nội dung tờ レセプト trên bệnh nhân thật', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined
    /** Số lần FE gọi /v1/render từ lúc reset gần nhất. */
    let renderCalls = 0
    /** Body /v1/print gần nhất (luôn bị chặn, xem route). */
    let printBody: RenderRequestBody | null = null
    /** Ghi đè response rezept-datasource (TC đa 様式); null = để BE trả nguyên. */
    let rewriteDatasource: ((env: DatasourceEnvelope) => DatasourceEnvelope) | null = null

    const preview = () => page.getByRole('dialog').filter({ hasText: PREVIEW_TITLE })
    const savePrompt = () => page.getByText(/処置データは変更されています。保存しますか？/)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        if (AGENT_AVAILABLE) console.log('có print agent → render THẬT (preview, /v1/print bị chặn)')

        await page.route(AGENT_ANY_URL, async (route: Route) => {
            const req = route.request()
            const url = req.url()
            if (AGENT_RENDER_URL.test(url)) renderCalls++
            // 印刷 — chặn ở MỌI chế độ: job thật xuống spooler Windows sẽ bung hộp
            // thoại Save As (Microsoft Print to PDF) và treo cả suite.
            if (AGENT_PRINT_URL.test(url)) {
                printBody = req.postDataJSON() as RenderRequestBody
                return jsonFulfill(route, 202, {
                    jobId: STUB_JOB_ID,
                    eventsUrl: `/v1/jobs/${STUB_JOB_ID}/events?ticket=${STUB_TICKET}`,
                })
            }
            if (url.includes(`/v1/jobs/${STUB_JOB_ID}/events`)) {
                const complete = JSON.stringify({ type: 'complete', pdfUrl: `/tmp/${STUB_PDF_ID}.pdf`, pdfTicket: STUB_TICKET })
                return route.fulfill({
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
                    body: `event: complete\ndata: ${complete}\n\n`,
                })
            }
            if (AGENT_AVAILABLE) {
                if (AGENT_RENDER_URL.test(url)) {
                    const original = req.postDataJSON() as RenderRequestBody
                    return route.continue({ postData: JSON.stringify({ ...original, forcePreview: true }) })
                }
                return route.continue()
            }
            if (/\/healthz/.test(url)) return jsonFulfill(route, 200, { ok: true })
            if (/\/v1\/prewarm/.test(url)) return jsonFulfill(route, 200, {})
            if (AGENT_RENDER_URL.test(url)) {
                return jsonFulfill(route, 202, {
                    preview: true,
                    jobId: STUB_JOB_ID,
                    sseTicket: STUB_TICKET,
                    eventsUrl: `/v1/jobs/${STUB_JOB_ID}/events?ticket=${STUB_TICKET}`,
                })
            }
            if (/\/v1\/jobs\/[^/]+\/events/.test(url)) {
                const complete = JSON.stringify({ type: 'complete', pdfUrl: `/tmp/${STUB_PDF_ID}.pdf`, pdfTicket: STUB_TICKET })
                return route.fulfill({
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
                    body: `event: complete\ndata: ${complete}\n\n`,
                })
            }
            if (/\/tmp\/[0-9a-fA-F-]+\.pdf/.test(url)) {
                return route.fulfill({ status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/pdf' }, body: STUB_PDF })
            }
            return jsonFulfill(route, 200, {})
        })

        await page.route(DATASOURCE_URL, async (route: Route) => {
            const body = route.request().postDataJSON() as { reportOnly?: boolean } | null
            if (!rewriteDatasource || body?.reportOnly) return route.continue()
            const res = await route.fetch()
            const env = (await res.json()) as DatasourceEnvelope
            return route.fulfill({ response: res, json: rewriteDatasource(env) })
        })
    })

    test.afterAll(async () => {
        await page.unroute(AGENT_ANY_URL).catch(() => {})
        await page.unroute(DATASOURCE_URL).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    /**
     * Mở tháng và chờ header (「合計:」). Nạp lại tới 3 lần: Vite dev server thỉnh
     * thoảng nhả hụt một module, React không mount và trang trắng mãi (cùng lý do
     * với `openTreatmentEntry` trong _shared/entry.ts). Không dùng helper đó vì nó
     * dọn dialog bằng phím — Esc là 登録 trên 診療入力, ở đây chỉ được ĐỌC.
     */
    async function openMonth(c: Case) {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/treatments/${c.patNo}?trtDt=${c.trtDt}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByText('合計:').first()).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : 30_000,
                })
                return
            } catch (e) {
                if (attempt >= 3) throw e
                console.log(`openMonth ${c.patNo}/${c.trtDt}: lần ${attempt} trang không dựng — nạp lại`)
            }
        }
    }

    /** Mở tháng, bấm レセプト, trả envelope BE (bỏ qua request reportOnly của prewarm). */
    async function issueRezept(c: Case): Promise<DatasourceEnvelope> {
        await openMonth(c)
        renderCalls = 0
        const response = page.waitForResponse(
            (res) =>
                DATASOURCE_URL.test(res.url()) &&
                res.request().method() === 'POST' &&
                (res.request().postDataJSON() as { reportOnly?: boolean } | null)?.reportOnly !== true,
            { timeout: 60_000 },
        )
        await page.getByRole('button', { name: 'レセプト', exact: true }).click()
        // AutoSantei lúc mở có thể làm bẩn lưới — いいえ = RestoreData, không ghi DB.
        if (await savePrompt().isVisible({ timeout: 2_000 }).catch(() => false)) {
            await page.getByRole('dialog').filter({ has: savePrompt() }).getByRole('button', { name: 'いいえ', exact: true }).click()
        }
        const res = await response
        expect(res.status(), `rezept-datasource ${c.patNo}/${c.trtDt}`).toBe(200)
        return (await res.json()) as DatasourceEnvelope
    }

    /** Tải PDF bản xem trước đang mở (chỉ khi agent thật). */
    async function downloadPreviewPdf(name: string): Promise<Buffer> {
        const src = await preview().locator('iframe').getAttribute('src')
        expect(src, 'iframe preview không có src').toBeTruthy()
        const res = await page.request.get(src!.split('#')[0]!)
        expect(res.ok(), `tải PDF preview lỗi ${res.status()}`).toBe(true)
        const pdf = await res.body()
        expect(pdf.subarray(0, 5).toString('latin1'), 'agent không trả về PDF').toBe('%PDF-')
        await test.info().attach(name, { body: pdf, contentType: 'application/pdf' })
        fs.mkdirSync(PDF_DIR, { recursive: true })
        fs.writeFileSync(path.join(PDF_DIR, name), pdf)
        console.log(`PDF: ${path.join(PDF_DIR, name)}`)
        return pdf
    }

    async function closePreview() {
        await preview().getByRole('button', { name: 'F10 戻る' }).click()
    }

    for (const c of CASES) {
        test(`${c.patNo} — ${c.title}`, async () => {
            const env = await issueRezept(c)
            const rr = env.data.renderRequest
            expect(env.data.shouldPrint).toBe(true)
            expect(rr?.reportId, '様式 theo 請求年月').toBe(c.reportId)
            expect(rr!.forcePreview, 'レセプト chỉ xem, không xuống máy in').toBe(true)
            expect(env.data.additionalRenderRequests ?? [], 'cả tháng chỉ 1 様式').toHaveLength(0)

            const { rcp, rcpT } = rr!.dataJson
            expect(rcp, 'số tờ = số dòng trn_status có điểm').toHaveLength(c.sheets.length)
            expect(rcpT).toHaveLength(c.sheets.length)

            c.sheets.forEach((s, i) => {
                const a = rcp[i]!
                const t = rcpT[i]!
                const at = `tờ ${i + 1} (${c.winform ? 'giá trị WinForm' : 'giá trị web'})`
                expect(a['no'], `${at} no — đánh số từ 4 như WinForm`).toBe(4 + i)
                expect(a['kubun'], `${at} kubun`).toBe(s.kubun)
                expect(a['f3'], `${at} 診療年月`).toBe(s.f3)
                expect(a['f8'], `${at} 単独/併用`).toBe(s.f8)
                expect(a['f67'], `${at} 実日数`).toBe(s.f67)
                expect(t['f405'], `${at} 合計点数`).toBe(s.f405)
                expect(t['f413'], `${at} 患者番号-連番`).toBe(s.f413)
                if (s.f402 !== undefined) expect(t['f402'], `${at} 公費分点数`).toBe(s.f402)
                if (s.f404 !== undefined) expect(t['f404'], `${at} 公費一部負担金`).toBe(s.f404)
                if (s.f408 !== undefined) expect(t['f408'], `${at} OCR①`).toBe(s.f408)
                if (s.f412 !== undefined) expect(t['f412'], `${at} f412`).toBe(s.f412)
                // 全体のその他 dòng 4 chỉ tồn tại từ 2022-04; mẫu cũ không bao giờ ghi.
                if (c.reportId === 'rpt30400180' || c.reportId === 'rpt30400200') {
                    expect(t['f445'], `${at} mẫu cũ không có dòng その他 thứ 4`).toBe('')
                }
            })

            await expect(preview(), 'phải mở bản xem trước').toBeVisible({ timeout: 90_000 })
            expect(renderCalls, 'một 様式 = một lần render').toBe(1)

            if (!AGENT_AVAILABLE) {
                test.info().annotations.push({ type: 'pdf', description: `không soi PDF: ${AGENT_SKIP_REASON}` })
            } else {
                const pdf = await readPdf(await downloadPreviewPdf(`${c.patNo}-${c.trtDt}.pdf`))
                expect(pdf.pageCount, 'mỗi tờ ít nhất một trang').toBeGreaterThanOrEqual(c.sheets.length)
                for (const s of c.sheets) {
                    for (const v of [s.f405, s.f413].filter((x) => x !== '')) {
                        expect(pdf.folded, `PDF thiếu "${v}"`).toContain(foldForCompare(v))
                    }
                    const month = foldForCompare(s.f3)
                    if (PDF_TEXT_STRICT) expect(pdf.folded, `PDF thiếu "${s.f3}"`).toContain(month)
                    else if (!pdf.folded.includes(month)) console.warn(`[loose] PDF thiếu "${s.f3}"`)
                }
            }

            await closePreview()
            await expect(preview()).toBeHidden({ timeout: 10_000 })
        })
    }

    test('F1 印刷 — in đúng 様式 đang xem; không có F2 PDF出力 (WinForm frm902009)', async () => {
        const c = CASES[0]!
        const env = await issueRezept(c)
        await expect(preview()).toBeVisible({ timeout: 90_000 })
        // frm902009: F-key chỉ có 戻る, Crystal viewer giữ nút in nhưng ẩn nút export.
        await expect(preview().getByRole('button', { name: 'F2 PDF出力' })).toHaveCount(0)

        printBody = null
        await preview().getByRole('button', { name: 'F1 印刷' }).click()
        await expect(page.getByText('診療報酬明細書を印刷しました')).toBeVisible({ timeout: 30_000 })
        expect(printBody, 'phải gửi /v1/print').not.toBeNull()
        expect(printBody!.reportId, 'in đúng 様式 đang xem').toBe(c.reportId)
        expect(printBody!.dataJson.rcp, 'in đúng các tờ đang xem').toEqual(env.data.renderRequest!.dataJson.rcp)
        expect(printBody!.forcePreview, '/v1/print không mang cờ preview').toBeUndefined()

        await expect(preview(), 'in xong vẫn ở bản xem trước, như WinForm').toBeVisible()
        await closePreview()
        await expect(preview()).toBeHidden({ timeout: 10_000 })
    })

    test('2 様式 trong một tháng — mở lần lượt, đóng bản này thì mở bản kế', async () => {
        // Dữ liệu dev không có tháng nào cần 2 様式 (chỉ khi 請求年月 khác đời mẫu với
        // 診療年月), nên dựng bằng cách nhân đôi renderRequest của một ca thật thành
        // additionalRenderRequests — đúng shape BE trả khi có 2 様式.
        rewriteDatasource = (env) => ({
            ...env,
            data: { ...env.data, additionalRenderRequests: [env.data.renderRequest!] },
        })
        try {
            const env = await issueRezept(CASES[1]!)
            expect(env.data.additionalRenderRequests).toHaveLength(1)

            await expect(preview()).toBeVisible({ timeout: 90_000 })
            await expect.poll(() => renderCalls, { message: 'render cả 2 様式 trước khi xem' }).toBe(2)
            if (AGENT_AVAILABLE) await downloadPreviewPdf(`${CASES[1]!.patNo}-2yoshiki-1.pdf`)

            await closePreview()
            await expect(preview(), 'đóng bản 1 thì bản 2 mở').toBeVisible({ timeout: 10_000 })
            if (AGENT_AVAILABLE) await downloadPreviewPdf(`${CASES[1]!.patNo}-2yoshiki-2.pdf`)
            await closePreview()
            await expect(preview(), 'đóng bản 2 thì hết').toBeHidden({ timeout: 10_000 })
        } finally {
            rewriteDatasource = null
        }
    })
})
