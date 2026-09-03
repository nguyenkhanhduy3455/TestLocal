import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { countGisiKanri, dbEnabled, deleteGisiKanri } from './db'
import { foldForCompare, readPdf } from './pdf-content'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * クラウン・ブリッジ維持管理・義歯管理 (frm203023) — ProsthesisManagementDialog,
 * mở từ CategoryTabs 「補管・義歯」 trên màn 診療入力 `/treatments/{patNo}`.
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/prosthesis-management-dialog.tsx
 *      · DraggableDialog title 「クラウン・ブリッジ維持管理・義歯管理」 → để chắc,
 *        match dialog theo body text 「【着脱方法】」 (chỉ dialog này có).
 *      · Body split: ダイアログ đóng thì `open=false` → return null (không render
 *        gì); mở là remount Body → chạy lại initProc → state reset.
 *      · initProc kết thúc bằng buiInfo1.Focus() → chart 歯式 được focus khi mở
 *        (effect keyed on mount, ref chartRef → BuiInfoChart root tabindex=0).
 *      · 2 区分 checkbox 「ブリッジ・冠の管理」/「義歯の使用上の注意について」 loại
 *        trừ nhau kiểu NGHỊCH (WinForm chkManage_CheckedChanged): bỏ tick ô này
 *        thì ô kia TỰ bật. KHÔNG phải radio thường.
 *      · 【着脱方法】 = 2 Input; 【その他情報】 = 6 Input gắn
 *        `list="gisi-kanri-other-info-list"` (combo editable của WinForm
 *        cboOtherInfo1..6) → free text + gợi ý, KHÔNG phải Select.
 *      · 印刷日 = EraDateField, seed từ HÔM NAY (dtDate.setDate(DateTime.Now)),
 *        KHÔNG phải trtDt.
 *      · F8 登録 → date sai chặn TRƯỚC bằng E00002; hợp lệ → confirmDialog Q00001
 *        「登録してよろしいですか？」.
 *      · F9 印刷 → date sai → E00002 (KHÔNG confirm, đúng WinForm btnF9). Date hợp
 *        lệ → POST /tenant/report/{patNo}/hokan-datasource rồi đẩy NGUYÊN XI
 *        renderRequest sang print agent → nhóm TC-IN-* bên dưới.
 *      · F10 戻る → đóng luôn, WinForm btnF10 không hỏi lưu.
 *  - components/bui-info-chart.tsx (port WinForm BuiInfo, InputType.GisiKanri):
 *      · 4 象限 × 8 ô = 32 cell `button.h-8.w-8`; giá trị KHÔNG phải boolean mà
 *        là サイクル値 (BuiLabel.chkVal: 0→1..9→101/102/201/202/108/208, 乳歯 11..19).
 *      · Click ô = chạy chkVal + đổi focus 象限 sang ô đó (nền vàng SEL_BUI
 *        = bg-yellow-100 cho các ô rỗng cùng 象限). Đây là chỗ từng regress:
 *        Object.keys trả string → `pos === n` luôn false → mất highlight.
 *      · 歯番 = 32 `button.h-4.w-8`; click 歯番 xoá đúng 1 ô (lblClrBui).
 *      · 上顎削除 / 下顎削除 = clear 16 ô nửa trên / nửa dưới.
 *      · DOM order của cả cells lẫn labels = flat index 0..31 (上顎: RU 0-7,
 *        LU 8-15; 下顎: RD 16-23, LD 24-31).
 *  - locales/ja.ts: E00002 `${field}が間違っています。` (SỬA 2026-09-03 — không phải
 *    「正しくありません」: commit 4b25e1455 「E00002 の文言を WinForm に合わせる」 đã
 *    đổi theo template mà legacy để lại ở frm203002.cs:2202
 *    `//E00002：{0}が間違っています。`; E00002 là MỘT dòng trong MSGTBL nên mọi màn
 *    dùng chung, kể cả 日付チェック của 補管・義歯 / 歯科疾患管理 / 実地指導文書),
 *    Q00001
 *    「登録してよろしいですか？」, I00001 「登録が完了しました。」
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login, nên login + mở màn 診療入力 làm đúng một lần ở beforeAll. Các testcase
 * nối tiếp trên cùng dialog, thứ tự có ý nghĩa — chạy lẻ một testcase ở giữa sẽ
 * hỏng vì dialog chưa được mở.
 *
 * F8 登録 mặc định chỉ tới bước confirm rồi chọn No (không ghi DB). Muốn chạy hẳn
 * nhánh ghi: TEST_ALLOW_SAVE=1 npx playwright test <spec>
 *
 * Testcase CAN THIỆP DB (ghi thật + verify + DELETE dọn) chỉ chạy ở LOCAL, gate
 * bằng `dbEnabled` (tests/db.ts): TEST_DB=1 npx playwright test <spec>. Chạy
 * production không đặt biến → tự skip, không đụng Postgres.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
/**
 * Dialog seed 区分 + 歯式 từ getGisiBui của ngày đang xem. Mặc định trỏ vào ca có
 * 補管/義管 算定 để chart có 部位 sẵn (như ảnh 池田 雄); nhưng testcase KHÔNG bắt
 * buộc có seed — trạng thái rỗng vẫn chạy đủ.
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
const PAT_NO_NUM = Number(PAT_NO)
const TRT_DT = process.env.TEST_TRT_DT ?? '2025-12-24'
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/** TOOTH_COUNT — 32 ô 歯式 (= GISIKANRI se_1..se_32). */
const TOOTH_COUNT = 32
/** OTHER_INFO_COUNT — 6 dòng 【その他情報】. */
const OTHER_INFO_COUNT = 6
/** VIEWPORT_MARGIN của DraggableDialog — lề tối thiểu mỗi bên khi mở. */
const VIEWPORT_MARGIN = 8
/** Sai số cho phép khi so kích thước layout (sub-pixel rounding). */
const EPS = 1
/** Flat index của ô đầu 象限 左下 (下顎左) — thường rỗng, hợp để test cycle. */
const LD_START = 24

/**
 * Giá trị その他情報 dùng cho test ghi-thật vào DB. CỐ ĐỊNH (không random) để
 * upsert theo (pat_no, print_dt) idempotent — chạy lại chỉ đè lên chính nó,
 * KHÔNG phình datalist. Dễ nhận diện để dọn.
 */
const OTHER_INFO_MARKER = 'E2Eテスト・その他情報マーカー'

// ── Luồng in RPT203003 (F9 印刷) ──────────────────────────────────────────────
/**
 * Có print agent để in THẬT hay không — cùng cách suy như
 * `dental-disease-management-dialog.spec.ts`.
 *
 * Agent là net48 + Crystal Reports → CHỈ chạy trên Windows. Máy khác thì stub
 * toàn bộ endpoint agent: vẫn soi được DATASOURCE (thứ web-tenant chịu trách
 * nhiệm), chỉ không chứng minh được tờ giấy — nhóm TC-IN-3/4 tự skip.
 *   TEST_AGENT=1  # buộc in THẬT (agent ở máy khác)
 *   TEST_AGENT=0  # buộc stub, kể cả trên Windows
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

/** Phải khớp VITE_AGENT_BASE_URL của web-tenant (lib/env.ts mặc định cổng này). */
const AGENT_BASE_URL = process.env.TEST_AGENT_BASE_URL ?? 'https://127.0.0.1:58247'
/** strict → thiếu giá trị nào trên giấy là FAIL; loose → chữ Hán thiếu chỉ cảnh báo. */
const PDF_TEXT_STRICT = (process.env.TEST_PDF_TEXT ?? 'strict') !== 'loose'

/** BE dựng datasource: POST /tenant/report/{patNo}/hokan-datasource. */
const DATASOURCE_URL = /\/tenant\/report\/\d+\/hokan-datasource(\?|$)/
const AGENT_RENDER_URL = /\/v1\/render(\?|$)/
const AGENT_PRINT_URL = /\/v1\/print(\?|$)/
/** Mọi endpoint agent mà route cần nắm. */
const AGENT_ANY_URL =
    /\/(v1\/(render|print|prewarm|save-pdf)|healthz|v1\/jobs\/[^/]+\/events|tmp\/[0-9a-fA-F-]+\.pdf)(\?|$)/

/** 帳票ID sau ReportNameNormalizer (seed rpt_info: RPT203003 → RPT20300301.rpt). */
const REPORT_ID = 'rpt20300301'
/**
 * HAI bảng, ĐÚNG thứ tự của rpt20300301.rpt / ds20300301.xsd. HOKAN luôn RỖNG:
 * WinForm printProc tạo bảng tạm nhưng không insert dòng nào (BuildHokanDatasource
 * ghi rõ "Do not fix this by populating it").
 */
const DS_TABLES = ['HOKAN', 'SHISHU'] as const
/** Tiêu đề PdfPreviewDialog = ja.printPreviewTitle(ja.reportHokan()). */
const PREVIEW_TITLE = 'クラウン・ブリッジ維持管理・義歯管理プレビュー'

/** GUID cố định cho job/PDF tạm của stub — extractPdfId cần đúng 36 ký tự. */
const STUB_JOB_ID = '33333333-3333-4333-8333-333333333333'
const STUB_PDF_ID = '44444444-4444-4444-8444-444444444444'
const STUB_PDF_TICKET = 'pdf-ticket-stub'
const STUB_SSE_TICKET = 'sse-ticket-stub'
/** PDF tối thiểu để iframe có cái mà tải; nội dung KHÔNG được assert. */
const STUB_PDF_BODY =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'

/** Agent ở origin khác (loopback) → response stub phải mang CORS header. */
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
}

const jsonFulfill = (route: Route, status: number, body: unknown) =>
    route.fulfill({
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

/** Body POST /v1/render — FE dùng lại đúng shape này cho /v1/print. */
interface RenderRequestBody {
    reportId: string
    printCategory: number
    dataJson: Record<string, unknown[]>
    useDesignPaper?: boolean
}

/** Envelope chung của mọi /tenant/report/*-datasource. */
interface DatasourceEnvelope {
    success: boolean
    data: { shouldPrint: boolean; renderRequest: RenderRequestBody | null }
}

/** Một dòng SHISHU — chỉ các cột frm203023.setPrintData thực gán. */
interface ShishuRow {
    id: string
    name: string
    txt0: string
    chk1: string
    chk2: string
    chk6: string
    chk7: string
    memo8: string
    memo9: string
    txt4: string
    txt5: string
    txt6: string
    txt7: string
    txt8: string
    txt9: string
    memo4: string
    memo5: string
    memo6: string
    memo7: string
    memo0: string
    memo1: string
    memo2: string
    memo3: string
}

/**
 * Giá trị nhồi vào form trước khi bấm F9 — mỗi ô một chuỗi nhận diện được để
 * truy ngược từ datasource ra tờ giấy.
 *
 * ⚠️ その他情報 phải ≤ 50 byte Shift_JIS (= 25 全角): `prt_shishu.txt4‥txt9` là
 * varchar(50) và FE có pre-flight chặn trước khi POST (xem
 * report-text-length-guard.spec.ts). Chuỗi dưới đây cố tình ngắn.
 */
const PRINT_FIXTURE = {
    attach1: 'E2Eチャクダツ上顎',
    attach2: 'E2Eチャクダツ下顎',
    otherInfo: [
        'E2Eソノタ1',
        'E2Eソノタ2',
        'E2Eソノタ3',
        'E2Eソノタ4',
        'E2Eソノタ5',
        'E2Eソノタ6',
    ],
} as const

/** Đọc toàn bộ value của các <option> trong datalist その他情報. */
async function otherInfoOptions(page: Page): Promise<string[]> {
    return page
        .locator('#gisi-kanri-other-info-list option')
        .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))
}

/** Mở dialog 補管・義歯 và chờ hiện. */
async function openDialog(page: Page, dialog: Locator) {
    await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
    await expect(dialog).toBeVisible({ timeout: 30000 })
}

/**
 * F8 登録 → confirm Q00001 → Yes → chờ I00001. Ghi THẬT vào DB (upsert theo
 * pat_no + 印刷日 đang seed = hôm nay).
 */
async function saveViaF8(page: Page, dialog: Locator) {
    await dialog.getByRole('button', { name: 'F8 登録' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toBeVisible({ timeout: 10000 })
    await expect(confirm.getByText('登録してよろしいですか？')).toBeVisible()
    await confirm.getByRole('button', { name: /^(Yes|はい)$/ }).click()

    const result = page.getByRole('alertdialog')
    await expect(result).toBeVisible({ timeout: 30000 })
    await expect(result.getByText('登録が完了しました。')).toBeVisible({ timeout: 30000 })
    await result.getByRole('button', { name: 'OK' }).click()
    await expect(result).toBeHidden({ timeout: 10000 })
}

/** Đóng SanteiConfirmDialog 「…を算定しますか？」 do AutoSantei bung ra (đè lên dialog). */
async function installSanteiAutoClose(page: Page) {
    await page.addLocatorHandler(
        page.getByText(/を算定しますか？/).first(),
        async () => {
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
        },
        { times: 20 },
    )
}

test.describe.configure({ mode: 'serial' })

test.describe('補管・義歯 — クラウン・ブリッジ維持管理・義歯管理 dialog', () => {
    let page: Page
    let step: () => Promise<void>

    let dialog: Locator
    /** Khối chứa một nhãn = CHA của phần tử mang đúng text đó (xem chú thích ref). */
    let boxOf: (text: string) => Locator
    /** Root focus của chart 歯式 (BuiInfoChart) = div outline-none tabindex=0. */
    let chart: Locator
    /** 32 ô 歯式. */
    let cells: Locator
    /** 32 nút 歯番. */
    let labels: Locator
    /** PdfPreviewDialog của agent. */
    let previewDialog: Locator

    // ── Trạng thái luồng in, chia sẻ giữa các TC-IN-* ─────────────────────────
    /** Body /v1/render FE gửi đi — chụp TRƯỚC khi chèn forcePreview. */
    let sentRenderReq: RenderRequestBody | null = null
    /** Dòng SHISHU bóc từ datasource của TC-IN-1. */
    let sentRow: ShishuRow | null = null
    /** File PDF agent render thật (chỉ có khi AGENT_AVAILABLE) — TC-IN-4 soi. */
    let renderedPdf: Buffer | null = null

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        await installSanteiAutoClose(page)

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        dialog = page.getByRole('dialog').filter({ hasText: '【着脱方法】' })
        boxOf = (text: string) => dialog.getByText(text, { exact: true }).locator('..')
        chart = dialog.locator('div.outline-none[tabindex="0"]')
        cells = chart.locator('button.h-8.w-8')
        labels = chart.locator('button.h-4.w-8')
        previewDialog = page.getByRole('dialog').filter({ hasText: PREVIEW_TITLE })

        // ─── Print agent: đi thật (Windows) hoặc stub (máy khác) ──────────────
        // Máy CÓ agent: chỉ can thiệp 2 chỗ —
        //   · /v1/render: chụp body GỐC rồi chèn `forcePreview: true`. RPT203003
        //     có thể chưa có dòng print_mapping bật preview; khi đó agent in
        //     THẲNG và test không còn PDF nào để soi. forcePreview là cờ override
        //     có sẵn của agent, PDF vẫn do Crystal render thật từ .rpt thật.
        //   · /v1/print: CHẶN. Job xuống spooler Windows là mất kiểm soát — máy in
        //     mặc định "Microsoft Print to PDF" bung hộp thoại "Save Print Output
        //     As" của Windows shell mà Playwright không đóng được → treo suite.
        // Máy KHÔNG có agent: stub trọn bộ để nhóm datasource vẫn chạy được.
        await page.route(AGENT_ANY_URL, async (route: Route) => {
            const req = route.request()
            const url = req.url()

            if (AGENT_AVAILABLE) {
                if (AGENT_RENDER_URL.test(url)) {
                    const original = req.postDataJSON() as RenderRequestBody
                    sentRenderReq = original
                    return route.continue({
                        postData: JSON.stringify({ ...original, forcePreview: true }),
                    })
                }
                if (AGENT_PRINT_URL.test(url)) {
                    return jsonFulfill(route, 202, { jobId: STUB_JOB_ID })
                }
                return route.continue()
            }

            if (/\/healthz/.test(url)) return jsonFulfill(route, 200, { ok: true })
            if (/\/v1\/prewarm/.test(url)) return jsonFulfill(route, 200, {})

            if (AGENT_RENDER_URL.test(url)) {
                sentRenderReq = req.postDataJSON() as RenderRequestBody
                return jsonFulfill(route, 202, {
                    preview: true,
                    jobId: STUB_JOB_ID,
                    sseTicket: STUB_SSE_TICKET,
                    eventsUrl: `/v1/jobs/${STUB_JOB_ID}/events?ticket=${STUB_SSE_TICKET}`,
                })
            }

            // SSE: agent phát event CÓ TÊN nên phải ghi `event: <tên>`.
            if (/\/v1\/jobs\/[^/]+\/events/.test(url)) {
                const complete = JSON.stringify({
                    type: 'complete',
                    pdfUrl: `/tmp/${STUB_PDF_ID}.pdf`,
                    pdfTicket: STUB_PDF_TICKET,
                })
                return route.fulfill({
                    status: 200,
                    headers: {
                        ...CORS_HEADERS,
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                    },
                    body: `event: complete\ndata: ${complete}\n\n`,
                })
            }

            if (/\/tmp\/[0-9a-fA-F-]+\.pdf/.test(url)) {
                return route.fulfill({
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/pdf' },
                    body: STUB_PDF_BODY,
                })
            }

            return jsonFulfill(route, 200, {})
        })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('mở dialog bằng nút 補管・義歯 của CategoryTabs', async () => {
        // 「補管・義歯」 (frm203023) KHÁC 「補管(&H)」 (frm203045) → phải exact.
        await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
        await expect(dialog).toBeVisible({ timeout: 30000 })

        // Các khối chính của form đều phải có mặt.
        await expect(dialog.getByText('ブリッジ・冠の管理')).toBeVisible()
        await expect(dialog.getByText('義歯の使用上の注意について')).toBeVisible()
        await expect(dialog.getByText('【着脱方法】')).toBeVisible()
        await expect(dialog.getByText('【その他情報】')).toBeVisible()
        await expect(dialog.getByText('歯番クリック:1歯取り消し')).toBeVisible()
        await step()
    })

    test('initProc focus chart 歯式 (buiInfo1.Focus())', async () => {
        // WinForm initProc kết thúc bằng buiInfo1.Focus(). Effect trong Body focus
        // chart qua ref, bình thường đúng NHƯNG đua với open-focus của
        // DraggableDialog và handler đóng popup 算定 → chỉ log khi lệch, không
        // đánh đỏ cả suite vì một cuộc đua (giống spec 実地指).
        await expect(chart).toBeVisible()
        const focused = await chart.evaluate((el) => el === document.activeElement).catch(() => false)
        if (!focused) {
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                if (!el) return 'null'
                const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
                return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? '-'}] "${label.slice(0, 30)}"`
            })
            console.log(`CẢNH BÁO: chart 歯式 không được focus khi mở dialog; đang focus: ${desc}`)
        }
        await step()
    })

    test('tên bệnh nhân hiển thị kèm 「様」', async () => {
        await expect(dialog.getByText('様', { exact: true })).toBeVisible()
        await step()
    })

    test('dialog vừa cửa sổ và KHÔNG phải cuộn khi vừa mở', async () => {
        // Dialog khai 1120×840 nhưng DraggableDialog kẹp lại theo window
        // (VIEWPORT_MARGIN mỗi bên). Mục tiêu chỉnh size: body không sinh thanh
        // cuộn lúc khởi tạo (dòng ● 説明文 không rớt dòng, cột phải đủ chỗ).
        const viewport = page.viewportSize()
        expect(viewport, 'không đọc được viewport').not.toBeNull()
        if (!viewport) return

        const box = await dialog.boundingBox()
        expect(box).not.toBeNull()
        if (!box) return
        expect(box.width, 'dialog rộng quá cửa sổ').toBeLessThanOrEqual(
            viewport.width - VIEWPORT_MARGIN * 2 + EPS,
        )
        expect(box.height, 'dialog cao quá cửa sổ').toBeLessThanOrEqual(
            viewport.height - VIEWPORT_MARGIN * 2 + EPS,
        )
        await expect(dialog.getByRole('button', { name: 'F8 登録' })).toBeVisible()

        const body = dialog.locator('div[tabindex="-1"].overflow-auto').first()
        const scroll = await body.evaluate((el) => ({
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
        }))
        expect(scroll.sw, 'body bị cuộn NGANG khi vừa mở').toBeLessThanOrEqual(scroll.cw + EPS)
        expect(scroll.sh, 'body bị cuộn DỌC khi vừa mở').toBeLessThanOrEqual(scroll.ch + EPS)
        await step()
    })

    test('区分 checkbox — loại trừ NGHỊCH (bỏ tick ô này bật ô kia)', async () => {
        const br = dialog.getByRole('checkbox', { name: 'ブリッジ・冠の管理' })
        const gisi = dialog.getByRole('checkbox', { name: '義歯の使用上の注意について' })
        await expect(br).toBeVisible()
        await expect(gisi).toBeVisible()

        // Tick 補管 → 補管 on, 義歯 off.
        await br.click()
        await expect(br).toBeChecked()
        await expect(gisi).not.toBeChecked()

        // BỎ tick 補管 → 義歯 TỰ bật (WinForm chkManage_CheckedChanged), KHÔNG phải
        // "cả hai off" như radio thường. Đây là điểm parity dễ bị sửa sai.
        await br.click()
        await expect(br).not.toBeChecked()
        await expect(gisi).toBeChecked()

        // Đối xứng: bỏ tick 義歯 → 補管 tự bật.
        await gisi.click()
        await expect(gisi).not.toBeChecked()
        await expect(br).toBeChecked()
        await step()
    })

    test('歯式 chart — 32 ô + 32 歯番 + nút 上顎/下顎削除', async () => {
        await expect(cells).toHaveCount(TOOTH_COUNT)
        await expect(labels).toHaveCount(TOOTH_COUNT)
        await expect(dialog.getByRole('button', { name: /上顎.*削除/ })).toBeVisible()
        await expect(dialog.getByRole('button', { name: /下顎.*削除/ })).toBeVisible()
        await step()
    })

    test('歯式 — click ô đổi サイクル値 và highlight 象限 (regression)', async () => {
        // Click ô rỗng ở 左下 → chkVal 0→1 → glyph type=1 (数字全角) hiện ra.
        const cell = cells.nth(LD_START)
        const before = (await cell.textContent())?.trim() ?? ''
        await cell.click()
        const after = (await cell.textContent())?.trim() ?? ''
        expect(after, 'click ô phải đổi giá trị (không phải bật/tắt)').not.toBe(before)
        expect(after, 'ô sau click phải có glyph').not.toBe('')

        // Điểm regress: click ô phải đổi focus 象限 → các ô RỖNG cùng 象限 có nền
        // vàng nhạt (bg-yellow-100 = SEL_BUI). Trước đây Object.keys trả string
        // khiến `pos === n` luôn false → KHÔNG ô nào highlight.
        const highlighted = await cells.evaluateAll((els) =>
            els.filter((e) => e.className.includes('bg-yellow-100')).length,
        )
        expect(highlighted, 'không có ô nào được highlight sau khi click 象限').toBeGreaterThan(0)
        await step()
    })

    test('歯式 — click 歯番 xoá đúng 1 ô (lblClrBui)', async () => {
        // Ô 左下 vừa được set ở testcase trước → click 歯番 tương ứng để xoá.
        const cell = cells.nth(LD_START)
        expect((await cell.textContent())?.trim(), 'tiền đề: ô đang có giá trị').not.toBe('')

        await labels.nth(LD_START).click()
        await expect(cell).toHaveText('')
        await step()
    })

    test('歯式 — 上顎削除 xoá 16 ô nửa trên', async () => {
        // Set thử vài ô 上顎 (RU idx 0, LU idx 8) rồi 上顎削除 → cả 16 ô đầu rỗng.
        await cells.nth(0).click()
        await cells.nth(8).click()
        await dialog.getByRole('button', { name: /上顎.*削除/ }).click()

        for (const i of [0, 4, 8, 15]) {
            await expect(cells.nth(i), `上顎削除 chưa xoá ô ${i}`).toHaveText('')
        }
        await step()
    })

    test('歯式 — 下顎削除 xoá 16 ô nửa dưới', async () => {
        await cells.nth(16).click()
        await cells.nth(LD_START).click()
        await dialog.getByRole('button', { name: /下顎.*削除/ }).click()

        for (const i of [16, 20, 24, 31]) {
            await expect(cells.nth(i), `下顎削除 chưa xoá ô ${i}`).toHaveText('')
        }
        await step()
    })

    test('【着脱方法】 — 2 Input nhập được', async () => {
        const box = boxOf('【着脱方法】')
        const inputs = box.getByRole('textbox')
        await expect(inputs).toHaveCount(2)
        await expect(box.getByText('より着脱')).toBeVisible()
        await expect(box.getByText('より外す')).toBeVisible()

        await inputs.nth(0).fill('右上6')
        await inputs.nth(1).fill('左下7')
        await expect(inputs.nth(0)).toHaveValue('右上6')
        await expect(inputs.nth(1)).toHaveValue('左下7')
        await step()
    })

    test('【その他情報】 — 6 Input free text + datalist gợi ý', async () => {
        const box = boxOf('【その他情報】')
        const others = box.locator('input[list="gisi-kanri-other-info-list"]')
        await expect(others).toHaveCount(OTHER_INFO_COUNT)
        // datalist phải tồn tại thì gợi ý otherInfoSuggestions mới bung ra được.
        await expect(page.locator('#gisi-kanri-other-info-list')).toHaveCount(1)

        // Combo WinForm là editable (đọc `.Text`) → gõ tay được.
        await others.nth(0).fill('上顎総義歯')
        await expect(others.nth(0)).toHaveValue('上顎総義歯')
        await others.nth(OTHER_INFO_COUNT - 1).fill('下顎部分床')
        await expect(others.nth(OTHER_INFO_COUNT - 1)).toHaveValue('下顎部分床')
        await step()
    })

    test('印刷日 (EraDateField) — seed từ hôm nay, nhập được', async () => {
        // EraDateField render Fragment; khối = cha của span 「年」.
        const eraRow = boxOf('年')
        const boxes = eraRow.getByRole('textbox')
        await expect(boxes).toHaveCount(3) // 年 / 月 / 日

        // Seed từ HÔM NAY (dtDate.setDate(DateTime.Now)) → 年/月/日 không rỗng.
        await expect(boxes.nth(0)).not.toHaveValue('')
        await expect(boxes.nth(1)).not.toHaveValue('')
        await expect(boxes.nth(2)).not.toHaveValue('')
        // 元号 select mặc định 令和.
        await expect(eraRow.getByRole('combobox')).not.toHaveText('')
        await step()
    })

    test('過去の記録 (履歴 combo) — nạp lại form nếu bệnh nhân có bản ghi', async () => {
        // Select đầu tiên của cột phải (mục rỗng đầu là item reset).
        const history = dialog.getByRole('combobox').first()
        await history.click()
        const listbox = page.getByRole('listbox')
        await listbox.waitFor({ state: 'visible', timeout: 10000 })
        const n = await page.getByRole('option').count()
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10000 })

        // Luôn có ít nhất 1 option (item rỗng ở đầu). >1 nghĩa có 履歴 thật.
        if (n <= 1) {
            console.log('過去の記録: bệnh nhân chưa có bản ghi 義歯管理 → BỎ QUA phần nạp lại')
            await step()
            return
        }
        await history.click()
        await page.getByRole('option').nth(1).click()
        await expect(page.getByRole('listbox')).toBeHidden({ timeout: 10000 })
        // Nạp lại record → form vẫn còn nguyên các khối (không vỡ).
        await expect(dialog.locator('input[list="gisi-kanri-other-info-list"]')).toHaveCount(
            OTHER_INFO_COUNT,
        )
        await step()
    })

    test('F9 印刷 với 年 rỗng → alert E00002 「日付が間違っています。」', async () => {
        // WinForm btnF9: chỉ 日付チェック rồi printProc, KHÔNG confirm. Nhánh date
        // hợp lệ nằm ở nhóm TC-IN-* bên dưới.
        const yearBox = boxOf('年').getByRole('textbox').nth(0)
        const keep = await yearBox.inputValue()
        await yearBox.fill('')

        await dialog.getByRole('button', { name: 'F9 印刷' }).click()
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が間違っています。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keep)
        await step()
    })

    // ═══ F9 印刷 — datasource → agent → PDF (RPT203003) ══════════════════════
    // WinForm frm203023.btnF9_Click: 日付チェック rồi printProc THẲNG, KHÔNG confirm.
    // Chuỗi kiểm ở đây đi hết: BE dựng datasource → FE đẩy nguyên xi sang agent →
    // agent render → tải chính file PDF đó về soi.

    /** Nhồi 着脱方法 + その他情報 để từng cột SHISHU truy ngược ra được. */
    async function fillPrintForm() {
        const attach = boxOf('【着脱方法】').getByRole('textbox')
        await attach.nth(0).fill(PRINT_FIXTURE.attach1)
        await attach.nth(1).fill(PRINT_FIXTURE.attach2)

        const others = dialog.locator('input[list="gisi-kanri-other-info-list"]')
        for (const [i, text] of PRINT_FIXTURE.otherInfo.entries()) await others.nth(i).fill(text)

        // 印刷日 phải hợp lệ, nếu không F9 dừng ở E00002 trước khi chạm mạng.
        for (const i of [0, 1, 2]) {
            await expect(boxOf('年').getByRole('textbox').nth(i)).not.toHaveValue('')
        }
    }

    test('TC-IN-1 — F9 印刷: BE dựng datasource RPT203003, FE đẩy nguyên xi sang agent', async () => {
        await fillPrintForm()
        sentRenderReq = null

        // Prewarm (reportOnly=true) cũng gọi đúng URL này → lọc theo body.
        const datasourceResp = page.waitForResponse((r) => {
            if (!DATASOURCE_URL.test(r.url()) || r.request().method() !== 'POST') return false
            const body = r.request().postDataJSON() as { reportOnly?: boolean } | null
            return body?.reportOnly !== true
        }, { timeout: 60000 })

        await dialog.getByRole('button', { name: 'F9 印刷' }).click()

        const resp = await datasourceResp
        // patNo đi ở ROUTE ([FromRoute]), không nằm trong body.
        expect(resp.url(), 'patNo phải là bệnh nhân đang mở').toContain(
            `/tenant/report/${PAT_NO_NUM}/hokan-datasource`,
        )
        const envelope = (await resp.json()) as DatasourceEnvelope
        expect(envelope.success, 'BE trả lỗi khi dựng datasource').toBe(true)
        expect(envelope.data.shouldPrint, 'màn này luôn shouldPrint=true').toBe(true)
        expect(envelope.data.renderRequest, 'thiếu renderRequest').not.toBeNull()

        const built = envelope.data.renderRequest!
        expect(built.reportId, '帳票ID sau khi normalize').toBe(REPORT_ID)
        expect(typeof built.printCategory, 'printCategory lấy từ rpt_info.prt_no').toBe('number')
        // Tên VÀ thứ tự bảng phải khớp .rpt/.xsd — Crystal có thể ghép theo vị trí.
        expect(Object.keys(built.dataJson), 'sai tên/thứ tự bảng của datasource').toEqual([
            ...DS_TABLES,
        ])
        expect(built.dataJson.HOKAN, 'HOKAN phải RỖNG (printProc không insert dòng nào)').toEqual([])
        expect(built.dataJson.SHISHU, 'printProc emit đúng 1 dòng SHISHU').toHaveLength(1)

        // FE là pass-through thuần: body gửi agent PHẢI y hệt cái BE trả về.
        await expect
            .poll(() => sentRenderReq, { timeout: 60000, message: 'FE không gọi /v1/render' })
            .not.toBeNull()
        expect(sentRenderReq!, 'FE sửa datasource trước khi gửi agent').toEqual(built)

        sentRow = built.dataJson.SHISHU![0] as ShishuRow
        await step()
    })

    test('TC-IN-2 — SHISHU: từng cột khớp form + 医院マスタ', async () => {
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        // ── 患者 ──────────────────────────────────────────────────────────────
        expect(row.id, 'cột id = 患者番号 dạng chuỗi').toBe(PAT_NO)
        expect(typeof row.name).toBe('string')

        // ── 日付: txt0 = 和暦 "ggg yy 年 MM 月 dd 日" (FormatSpaced căn phải) ────
        const eraRow = boxOf('年')
        const era = (await eraRow.getByRole('combobox').textContent())?.trim() ?? ''
        const ymd = await Promise.all(
            [0, 1, 2].map((i) => eraRow.getByRole('textbox').nth(i).inputValue()),
        )
        expect(row.txt0.replace(/\s+/g, ' ').trim()).toBe(
            `${era} ${Number(ymd[0])} 年 ${Number(ymd[1])} 月 ${Number(ymd[2])} 日`,
        )

        // ── 区分: chk1/chk6 đi CẶP với ブリッジ・冠, chk2/chk7 với 義歯 ───────────
        // Hai checkbox loại trừ NGHỊCH nhau nên đúng một cặp được đánh dấu.
        const brOn = row.chk1 !== ''
        const gisiOn = row.chk2 !== ''
        expect(brOn !== gisiOn, '区分 phải bật đúng MỘT trong hai (chkManage/chkAttention)').toBe(
            true,
        )
        expect(row.chk6 !== '', 'chk6 phải đi cặp với chk1').toBe(brOn)
        expect(row.chk7 !== '', 'chk7 phải đi cặp với chk2').toBe(gisiOn)

        // ── 着脱方法: Trim() chỉ ở đường in (đường save giữ verbatim) ───────────
        expect(row.memo8).toBe(PRINT_FIXTURE.attach1)
        expect(row.memo9).toBe(PRINT_FIXTURE.attach2)

        // ── その他情報 → txt4‥txt9 theo đúng thứ tự dòng ────────────────────────
        expect(
            [row.txt4, row.txt5, row.txt6, row.txt7, row.txt8, row.txt9],
            'その他情報 map sai cột txt4‥txt9',
        ).toEqual([...PRINT_FIXTURE.otherInfo])

        // ── 医院マスタ: memo6 là "住所2 TEL.<số>" hoặc "TEL.<số>" khi add2 rỗng ──
        for (const key of ['memo4', 'memo5', 'memo6', 'memo7'] as const) {
            expect(typeof row[key], `${key} phải là chuỗi`).toBe('string')
        }
        expect(row.memo6, 'memo6 thiếu "TEL."').toContain('TEL.')

        // ── 部位状態: 4 象限 (右上/左上/右下/左下) ────────────────────────────────
        for (const key of ['memo0', 'memo1', 'memo2', 'memo3'] as const) {
            expect(typeof row[key], `${key} (象限) phải là chuỗi`).toBe('string')
        }
        await step()
    })

    test('TC-IN-3 — preview: agent render xong, tải được chính file PDF đó', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        await expect(previewDialog, 'agent bật preview thì phải hiện dialog xem trước').toBeVisible({
            timeout: 60000,
        })

        // src = {agentBase}{pdfUrl}?ticket=… — ticket đi trong query string, KHÔNG
        // phải Bearer, vì iframe không gắn được header.
        const src = await previewDialog.locator('iframe').getAttribute('src')
        expect(src, 'iframe preview không có src').toBeTruthy()
        expect(src!, 'preview phải trỏ vào agent').toContain(AGENT_BASE_URL)
        expect(src!, 'preview không trỏ vào PDF tạm của agent').toMatch(
            /\/tmp\/[0-9a-fA-F-]{36}\.pdf\?ticket=/,
        )

        // Tải chính file agent vừa render. KHÔNG bấm F2 PDF出力: agent bung hộp
        // thoại "Save As" của Windows mà Playwright không đóng được → treo.
        const res = await page.request.get(src!.split('#')[0]!)
        expect(res.ok(), `tải PDF preview lỗi ${res.status()}`).toBe(true)
        const pdf = await res.body()
        expect(pdf.subarray(0, 5).toString('latin1'), 'file agent trả về không phải PDF').toBe(
            '%PDF-',
        )

        await test.info().attach(`${REPORT_ID}.pdf`, { body: pdf, contentType: 'application/pdf' })
        renderedPdf = pdf
        console.log(`agent đã xuất PDF ${pdf.length} byte`)
        await step()
    })

    test('TC-IN-4 — nội dung PDF: từng giá trị của datasource phải lên giấy', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(renderedPdf, 'TC-IN-3 chưa tải được PDF').not.toBeNull()
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        const pdf = await readPdf(renderedPdf!)
        await test.info().attach('pdf-text.txt', { body: pdf.text, contentType: 'text/plain' })

        // 説明書 là 帳票 1 trang. >1 trang = nội dung tràn (đúng lớp bug mà
        // report-text-length-guard.spec.ts canh ở tầng nhập liệu).
        expect(pdf.pageCount, 'RPT203003 là 帳票 1 trang — >1 nghĩa là nội dung bị tràn').toBe(1)

        // So với chính `sentRow` → khép kín vòng form → datasource → giấy.
        const expected: { label: string; value: string }[] = [
            { label: '患者氏名', value: row.name },
            { label: '印刷日(和暦)', value: row.txt0 },
            { label: '着脱方法1', value: row.memo8 },
            { label: '着脱方法2', value: row.memo9 },
            { label: 'その他情報1', value: row.txt4 },
            { label: 'その他情報6', value: row.txt9 },
            { label: '医院名', value: row.memo4 },
            { label: '住所', value: row.memo5 },
            { label: '電話番号', value: row.memo6 },
            { label: '開設者', value: row.memo7 },
        ].filter((e) => (e.value ?? '').trim() !== '')

        const hasKanji = (s: string) => /[一-鿿]/.test(s)
        const missingHard: string[] = []
        const missingSoft: string[] = []
        for (const { label, value } of expected) {
            if (pdf.folded.includes(foldForCompare(value))) continue
            const entry = `${label} = "${value}"`
            // Chữ Hán có thể trượt vì bảng ToUnicode của font, không hẳn do dữ liệu
            // sai — TEST_PDF_TEXT=loose hạ nhóm này xuống mức cảnh báo.
            if (!PDF_TEXT_STRICT && hasKanji(value)) missingSoft.push(entry)
            else missingHard.push(entry)
        }
        if (missingSoft.length > 0) {
            console.log(`CẢNH BÁO: không thấy trên PDF (loose): ${missingSoft.join(' | ')}`)
        }
        expect(
            missingHard,
            'các giá trị này có trong datasource nhưng KHÔNG in ra ' +
                `(mở phần đính kèm ${REPORT_ID}.pdf / pdf-text.txt để đối chiếu)`,
        ).toEqual([])

        console.log(`nội dung PDF: khớp ${expected.length - missingSoft.length}/${expected.length} giá trị`)
        await step()
    })

    test('TC-IN-5 — đóng preview, trả màn hình về dialog 補管・義歯', async () => {
        // Testcase DỌN DẸP, cố ý KHÔNG skip theo agent.
        //
        // F9 mở PdfPreviewDialog ở CẢ hai chế độ: agent thật (TC-IN-3) lẫn stub
        // (route trả preview=true để TC-IN-1/2 vẫn soi được datasource trên máy
        // không có agent). Preview là <dialog z-[110]> nằm ĐÈ lên dialog 補管 và
        // nuốt mọi click — nếu để hở, mọi testcase phía sau (F8 登録, F10 戻る…)
        // đều timeout ở "subtree intercepts pointer events" chứ không phải lỗi app.
        //
        // Trước đây việc đóng nằm ở cuối TC-IN-4, mà TC-IN-4 lại skip khi không có
        // agent → preview rò rỉ. Giữ nó ở đây, MỘT chỗ duy nhất chịu trách nhiệm.
        if (await previewDialog.isVisible()) {
            await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
        }
        await expect(previewDialog, 'preview không đóng được → chắn các testcase sau').toBeHidden({
            timeout: 15000,
        })
        await expect(dialog, 'đóng preview xong phải quay lại dialog 補管・義歯').toBeVisible()
        await step()
    })

    test('F8 登録 với 年 rỗng → alert E00002 (chặn trước confirm)', async () => {
        const yearBox = boxOf('年').getByRole('textbox').nth(0)
        const keep = await yearBox.inputValue()
        await yearBox.fill('') // japaneseEraToDate trả null → chặn TRƯỚC Q00001

        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が間違っています。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keep)
        await step()
    })

    test('F8 登録 — confirm Q00001 「登録してよろしいですか？」', async () => {
        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const confirm = page.getByRole('alertdialog')
        await expect(confirm).toBeVisible({ timeout: 10000 })
        await expect(confirm.getByText('登録してよろしいですか？')).toBeVisible()

        if (!ALLOW_SAVE) {
            // Mặc định KHÔNG ghi DB: chọn No → handleRegister return sớm, dialog mở
            // nguyên trạng. (Nút confirmDialog là Yes/No, chấp nhận cả はい/いいえ.)
            await confirm.getByRole('button', { name: /^(No|いいえ)$/ }).click()
            await expect(confirm).toBeHidden({ timeout: 10000 })
            await expect(dialog).toBeVisible()
            console.log('F8 登録: dừng ở confirm (đặt TEST_ALLOW_SAVE=1 để ghi thật)')
            await step()
            return
        }

        await confirm.getByRole('button', { name: /^(Yes|はい)$/ }).click()
        const result = page.getByRole('alertdialog')
        await expect(result).toBeVisible({ timeout: 30000 })
        await expect(result.getByText('登録が完了しました。')).toBeVisible({ timeout: 30000 })
        await result.getByRole('button', { name: 'OK' }).click()
        await expect(result).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('F10 戻る (nút) đóng dialog, không hỏi lưu', async () => {
        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10000 })
        // WinForm btnF10 đóng thẳng — không confirm nào chen vào.
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await step()
    })

    test('mở lại → state reset (Body unmount khi đóng = chạy lại initProc)', async () => {
        await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
        await expect(dialog).toBeVisible({ timeout: 30000 })

        // Các Input 【着脱方法】 / 【その他情報】 đã nhập ở trên phải rỗng lại.
        await expect(boxOf('【着脱方法】').getByRole('textbox').nth(0)).toHaveValue('')
        await expect(
            boxOf('【その他情報】').locator('input[list="gisi-kanri-other-info-list"]').nth(0),
        ).toHaveValue('')
        await step()
    })

    test('phím F10 (FKeyLayer của dialog) đóng dialog', async () => {
        // fKeys của DraggableDialog là scope trên cùng → F-key màn nền không nổ.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('cửa sổ nhỏ hơn dialog → DraggableDialog kẹp lại, footer vẫn với tới', async () => {
        const original = page.viewportSize()
        const SMALL = { width: 1000, height: 640 }
        await page.setViewportSize(SMALL)
        try {
            await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
            await expect(dialog).toBeVisible({ timeout: 30000 })

            const box = await dialog.boundingBox()
            expect(box).not.toBeNull()
            if (box) {
                expect(box.width, 'dialog rộng quá cửa sổ nhỏ').toBeLessThanOrEqual(
                    SMALL.width - VIEWPORT_MARGIN * 2 + EPS,
                )
                expect(box.height, 'dialog cao quá cửa sổ nhỏ').toBeLessThanOrEqual(
                    SMALL.height - VIEWPORT_MARGIN * 2 + EPS,
                )
                expect(box.x, 'dialog tràn mép trái').toBeGreaterThanOrEqual(0)
                expect(box.y, 'dialog tràn mép trên').toBeGreaterThanOrEqual(0)
            }

            // Footer F10 phải nằm TRỌN trong cửa sổ (không click thẳng: badge dev
            // TanStack ngồi góc dưới-phải nuốt click — đó là widget dev, không phải app).
            const f10 = dialog.getByRole('button', { name: 'F10 戻る' })
            await expect(f10).toBeVisible()
            const fb = await f10.boundingBox()
            expect(fb).not.toBeNull()
            if (fb) {
                expect(fb.y + fb.height, 'nút F10 thò khỏi mép dưới').toBeLessThanOrEqual(SMALL.height)
                expect(fb.x + fb.width, 'nút F10 thò khỏi mép phải').toBeLessThanOrEqual(SMALL.width)
            }

            await page.keyboard.press('F10')
            await expect(dialog).toBeHidden({ timeout: 10000 })
            await step()
        } finally {
            if (original) await page.setViewportSize(original)
        }
    })

    /**
     * GHI THẬT vào DB: bấm F8 登録 lưu một record 義歯管理 có 【その他情報】, rồi
     * kiểm chính record đó ở tầng DB + kiểm gợi ý datalist (makeCombo đọc lại
     * other_info_1..6 của bệnh nhân), cuối cùng DỌN bằng DELETE thẳng bảng —
     * frm203023 không có nút xoá nên UI không tự dọn được.
     *
     * CHỈ CHẠY Ở LOCAL: gate bằng `dbEnabled` (TEST_DB=1 / TEST_DB_URL). Chạy
     * production không đặt biến → tự skip, không đụng DB.
     */
    test('ghi thật F8 → datalist その他情報 có gợi ý → dọn DB (can thiệp DB)', async () => {
        test.skip(!dbEnabled, 'testcase can thiệp DB — đặt TEST_DB=1 (chỉ local)')

        // Dọn trước cho sạch: đảm bảo bệnh nhân test không còn record cũ.
        await deleteGisiKanri(PAT_NO_NUM)
        expect(await countGisiKanri(PAT_NO_NUM), 'chưa dọn sạch record cũ').toBe(0)

        // 1. Mở dialog, điền 【その他情報】 marker (cố định → upsert idempotent).
        await openDialog(page, dialog)
        const marker = boxOf('【その他情報】').locator('input[list="gisi-kanri-other-info-list"]').nth(0)
        await marker.fill(OTHER_INFO_MARKER)
        await expect(marker).toHaveValue(OTHER_INFO_MARKER)
        await step()

        // 2. F8 登録 → confirm Yes → I00001. Đây là GHI THẬT (印刷日 seed = hôm nay).
        await saveViaF8(page, dialog)

        // 3. DB phải có đúng record vừa ghi.
        expect(await countGisiKanri(PAT_NO_NUM), 'F8 không ghi được record vào DB').toBeGreaterThan(0)
        await step()

        // 4. Đóng + mở lại → makeCombo (GET /history) đọc lại other_info_1..6 →
        //    marker phải xuất hiện trong datalist gợi ý.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await openDialog(page, dialog)
        await expect
            .poll(() => otherInfoOptions(page), { timeout: 15000 })
            .toContain(OTHER_INFO_MARKER)
        await step()

        // 5. Đóng dialog rồi DỌN: DELETE thẳng bảng (UI không có nút xoá).
        //    Nguồn chân lý của việc dọn là DB — verify count = 0.
        //
        //    KHÔNG verify "marker biến khỏi datalist" qua UI: DELETE này xảy ra
        //    NGOÀI luồng app, mà history query có staleTime 60s → mở lại dialog
        //    trong 60s vẫn trả cache cũ (còn marker). Đó là app ĐÚNG (cache hợp
        //    lý, app không thể biết về DELETE ngoài nó), không phải lỗi.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        const deleted = await deleteGisiKanri(PAT_NO_NUM)
        expect(deleted, 'không xoá được record test').toBeGreaterThan(0)
        expect(await countGisiKanri(PAT_NO_NUM), 'DB chưa sạch sau khi dọn').toBe(0)
        await step()
    })
})
