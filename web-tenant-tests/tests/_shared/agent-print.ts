/**
 * Luồng in qua print agent theo giao thức PRINT JOB (FE từ commit 3dbe4ac11,
 * 「すべての印刷画面をエージェントの印刷ジョブに移行する」) — dùng chung cho các spec in.
 *
 * ─── Giao thức ───────────────────────────────────────────────────────────────
 *  POST {agent}/v1/print-jobs { path, body, forcePreview?, prerender?, copies? }
 *    → 202 { jobId, eventsUrl }. AGENT tự gọi BE `POST /api{path}` bằng token của
 *    người dùng — trình duyệt KHÔNG còn thấy datasource nữa.
 *  GET  {agent}{eventsUrl} — SSE: `fetched` { pageCount } → một trong
 *    `preview-ready` { page, pdfUrl, pdfTicket } / `printed` { page } /
 *    `nothing-to-print` / `error` { errorCode, message, source }.
 *  POST {agent}/v1/print-jobs/{jobId}/pages/{n} { print? } — trang n của job
 *    (F1 印刷 trong preview = print:true; trang 2..n của job nhiều trang).
 *  DELETE {agent}/v1/print-jobs/{jobId} — đóng preview, agent bỏ cache.
 *
 * ─── Chế độ ──────────────────────────────────────────────────────────────────
 *  real    — đi tới agent THẬT (máy có agent, hoặc Mac nối tunnel tới máy Windows).
 *            Chỉ can thiệp: chèn `forcePreview: true` vào job (帳票 chưa có
 *            print_mapping bật preview thì agent in thẳng → không có PDF để soi), và
 *            CHẶN mọi lệnh in thật (pages/{n} print:true) cùng /v1/save-pdf: job
 *            xuống spooler Windows hoặc hộp thoại "Save As" của Windows là thứ
 *            Playwright không đóng được → treo suite.
 *  preview — stub: job → `preview-ready` (PdfPreviewDialog với PDF giả).
 *  direct  — stub: job → `printed` (in thẳng, không preview).
 *  error   — stub: POST print-jobs trả 500 kèm message.
 *  offline — abort mọi request agent (kể cả /healthz) → AgentUnreachableError.
 *
 * Datasource: spec gọi `fetchDatasource(page, call)` — gửi LẠI đúng path + body +
 * Authorization của job tới BE, y như agent làm. Các route `*-datasource` đều là
 * Query handler (chỉ đọc) nên gọi thêm một lần không đổi dữ liệu.
 */
import { expect, type Page, type Route } from '@playwright/test'

/**
 * Có print agent để chạy luồng in THẬT hay không. Agent là net48 + Crystal → chỉ
 * chạy trên Windows; Mac dùng được qua tunnel SSH (xem .env.example).
 *   TEST_AGENT=1 buộc chạy, TEST_AGENT=0 buộc bỏ qua; mặc định suy từ nền tảng.
 */
export const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

export const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác (tunnel tới 127.0.0.1).'

/** Phải khớp VITE_AGENT_BASE_URL của web-tenant. */
export const AGENT_BASE_URL = process.env.TEST_AGENT_BASE_URL ?? 'https://127.0.0.1:58247'

export type AgentPrintMode = 'real' | 'preview' | 'direct' | 'error' | 'offline'

/** GUID cố định — PdfPreviewDialog bóc pdfId 36 ký tự từ src. */
export const STUB_JOB_ID = '11111111-1111-4111-8111-111111111111'
export const STUB_PDF_ID = '22222222-2222-4222-8222-222222222222'
export const STUB_AGENT_ERROR = '印刷エージェント側のテスト用エラーです'

const STUB_PDF_TICKET = 'pdf-ticket-stub'
const STUB_PDF_BODY =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'

/** Agent ở origin khác (loopback) nên response stub phải mang CORS header. */
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

const AGENT_PRINT_ANY_URL =
    /\/(v1\/print-jobs(\/[^?]*)?|v1\/jobs\/[^/]+\/events|v1\/save-pdf|v1\/prewarm|healthz|tmp\/[0-9a-fA-F-]+\.pdf)(\?|$)/
const START_URL = /\/v1\/print-jobs(\?|$)/
const PAGE_URL = /\/v1\/print-jobs\/([^/]+)\/pages\/(\d+)(\?|$)/
const RELEASE_URL = /\/v1\/print-jobs\/([^/?]+)(\?|$)/
const EVENTS_URL = /\/v1\/jobs\/([^/]+)\/events/

/** Body POST /v1/print-jobs. */
export interface PrintJobRequest {
    path: string
    body: unknown
    forcePreview?: boolean
    prerender?: boolean
    copies?: number
    dataJsonOverride?: object
}

/** Một lần FE mở job (không tính job prerender) — kèm token để gọi lại BE. */
export interface PrintJobCall {
    /** Body FE gửi, GỐC (trước khi chế độ real chèn forcePreview). */
    request: PrintJobRequest
    authorization: string
}

/** Một lần FE gọi pages/{n}. */
export interface PrintPageCall {
    jobId: string
    page: number
    print?: boolean
    copies?: number
}

export interface SavePdfCall {
    pdfId?: string
    defaultName?: string
}

export interface AgentPrintStub {
    /** Chế độ cho các request SAU; đổi giữa các testcase. */
    mode: AgentPrintMode
    /** Số trang stub báo trong `fetched` (job nhiều trang, vd レセプト 2 様式). */
    pageCount: number
    readonly starts: PrintJobCall[]
    readonly pageCalls: PrintPageCall[]
    readonly savePdfCalls: SavePdfCall[]
    /** Job id agent THẬT trả cho lần mở job gần nhất (chỉ chế độ real). */
    readonly lastRealJobId: string | null
    /** Xoá mọi thứ đã chụp. */
    reset(): void
    /** Chờ tới khi có ít nhất `count` lần mở job, trả lần cuối. */
    waitForStart(count?: number): Promise<PrintJobCall>
    dispose(): Promise<void>
}

const jsonFulfill = (route: Route, status: number, body: unknown) =>
    route.fulfill({
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

/** Agent phát event CÓ TÊN nên mỗi frame phải ghi `event: <tên>`. */
const sseFulfill = (route: Route, events: [name: string, data: object][]) =>
    route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`).join(''),
    })

const stubEventsUrl = (ticket: string) => `/v1/jobs/${STUB_JOB_ID}/events?ticket=${ticket}`

const previewReady = (page: number) => ({
    page,
    pdfUrl: `/tmp/${STUB_PDF_ID}.pdf`,
    pdfTicket: STUB_PDF_TICKET,
})

export async function routeAgentPrint(page: Page, mode: AgentPrintMode): Promise<AgentPrintStub> {
    const starts: PrintJobCall[] = []
    const pageCalls: PrintPageCall[] = []
    const savePdfCalls: SavePdfCall[] = []

    const stub: AgentPrintStub = {
        mode,
        pageCount: 1,
        starts,
        pageCalls,
        savePdfCalls,
        lastRealJobId: null,
        reset() {
            starts.length = 0
            pageCalls.length = 0
            savePdfCalls.length = 0
        },
        async waitForStart(count = 1) {
            await expect
                .poll(() => starts.length, { timeout: 60_000, message: 'FE không mở print job (/v1/print-jobs)' })
                .toBeGreaterThanOrEqual(count)
            return starts[starts.length - 1]!
        },
        dispose: () => page.unroute(AGENT_PRINT_ANY_URL, handler),
    }

    const handler = async (route: Route) => {
        const req = route.request()
        const url = req.url()
        const method = req.method()
        const real = stub.mode === 'real'

        if (stub.mode === 'offline') return route.abort('failed')

        // Lưu PDF: agent bung "Save As" của Windows — KHÔNG bao giờ cho đi thật.
        if (/\/v1\/save-pdf/.test(url)) {
            const body = req.postDataJSON() as SavePdfCall
            savePdfCalls.push(body)
            return jsonFulfill(route, 200, { saved: true, path: `C:\\temp\\${body.defaultName ?? STUB_PDF_ID}.pdf` })
        }

        if (method === 'POST' && START_URL.test(url)) {
            const body = req.postDataJSON() as PrintJobRequest
            if (!body.prerender) {
                const headers = await req.allHeaders()
                starts.push({ request: body, authorization: headers['authorization'] ?? '' })
            }
            if (real) {
                if (body.prerender) return route.continue()
                const res = await route.fetch({ postData: JSON.stringify({ ...body, forcePreview: true }) })
                const json = (await res.json().catch(() => null)) as { jobId?: string } | null
                if (json?.jobId) (stub as { lastRealJobId: string | null }).lastRealJobId = json.jobId
                return route.fulfill({ response: res })
            }
            if (stub.mode === 'error') return jsonFulfill(route, 500, { message: STUB_AGENT_ERROR })
            return jsonFulfill(route, 202, { jobId: STUB_JOB_ID, eventsUrl: stubEventsUrl('start') })
        }

        const pageMatch = method === 'POST' ? PAGE_URL.exec(url) : null
        if (pageMatch) {
            const body = (req.postDataJSON() ?? {}) as { print?: boolean; copies?: number }
            const n = Number(pageMatch[2])
            pageCalls.push({ jobId: decodeURIComponent(pageMatch[1]!), page: n, ...body })
            // Xem trang kế của job thật thì cho đi; IN thì luôn chặn.
            if (real && !body.print) return route.continue()
            return jsonFulfill(route, 202, {
                jobId: STUB_JOB_ID,
                eventsUrl: stubEventsUrl(`page-${n}-${body.print ? 'print' : 'view'}`),
            })
        }

        const releaseMatch = method === 'DELETE' ? RELEASE_URL.exec(url) : null
        if (releaseMatch) {
            if (real && decodeURIComponent(releaseMatch[1]!) !== STUB_JOB_ID) return route.continue()
            return route.fulfill({ status: 204, headers: CORS_HEADERS })
        }

        const eventsMatch = EVENTS_URL.exec(url)
        if (eventsMatch) {
            if (eventsMatch[1] !== STUB_JOB_ID) return route.continue()
            const ticket = new URL(url).searchParams.get('ticket') ?? ''
            const pageTicket = /^page-(\d+)-(print|view)$/.exec(ticket)
            if (pageTicket) {
                const n = Number(pageTicket[1])
                return sseFulfill(route, [pageTicket[2] === 'print' ? ['printed', { page: n }] : ['preview-ready', previewReady(n)]])
            }
            const fetched: [string, object] = ['fetched', { pageCount: stub.pageCount, printWarnings: null }]
            if (stub.mode === 'direct') return sseFulfill(route, [fetched, ['printed', { page: 1 }]])
            return sseFulfill(route, [fetched, ['progress', { progressPercent: 50 }], ['preview-ready', previewReady(1)]])
        }

        if (/\/tmp\/[0-9a-fA-F-]+\.pdf/.test(url)) {
            if (real && !url.includes(STUB_PDF_ID)) return route.continue()
            return route.fulfill({
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/pdf' },
                body: STUB_PDF_BODY,
            })
        }

        if (real) return route.continue()
        // Stub: healthz phải "online" để AgentOfflineDialog không bật; prewarm là tối ưu thuần.
        if (/\/healthz/.test(url)) return jsonFulfill(route, 200, { ok: true, state: 'ready' })
        return jsonFulfill(route, 200, {})
    }

    await page.route(AGENT_PRINT_ANY_URL, handler)
    return stub
}

/** Envelope chung của mọi /tenant/report/*-datasource. */
export interface DatasourceEnvelope<R = RenderRequestBody> {
    success: boolean
    data: { shouldPrint: boolean; renderRequest: R | null; additionalRenderRequests?: R[] | null }
}

/** renderRequest trong envelope — thứ agent đưa vào Crystal. */
export interface RenderRequestBody<D = Record<string, unknown[]>> {
    reportId: string
    printCategory: number
    dataJson: D
    useDesignPaper?: boolean
    forcePreview?: boolean
}

/**
 * Gọi BE datasource đúng như agent gọi cho job `call` — để spec soi dữ liệu in mà
 * trình duyệt không còn thấy.
 */
export async function fetchDatasource<E = DatasourceEnvelope>(page: Page, call: PrintJobCall): Promise<E> {
    const res = await page.request.post(`/api${call.request.path}`, {
        data: call.request.body,
        headers: { Authorization: call.authorization },
    })
    expect(res.status(), `BE ${call.request.path} trả ${res.status()}`).toBe(200)
    return (await res.json()) as E
}
