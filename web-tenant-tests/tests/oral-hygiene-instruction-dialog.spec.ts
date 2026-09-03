import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { foldForCompare, readPdf } from './pdf-content'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 実地指１・訪衛指 (frm203022) — OralHygieneInstructionDialog, mở từ CategoryTabs
 * 「指導文書」 trên màn 診療入力 `/treatments/{patNo}`.
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/oral-hygiene-instruction-dialog.tsx
 *      · DraggableDialog title 「実 地 指 １ ・ 訪 衛 指」 (chữ bị giãn) → KHÔNG
 *        match theo title, match theo text trong body 「【歯・歯肉の状態】」.
 *      · initProc kết thúc bằng chkJichi.Focus() → 実地指１ checked + focused.
 *      · 実地指１ / 訪衛指 chỉ là selector layout in, không nằm trong payload save.
 *      · プラークスコア input lọc `[^0-9.]` ngay khi gõ.
 *      · 指導内容 = 6 Input gắn `list="sidou-guide-list"` (combo editable của
 *        WinForm cboGuide1..6) → free text + gợi ý, KHÔNG phải Select.
 *      · 指導時刻: giờ 24 mục, phút bước MINUTE_STEP=5 → 12 mục.
 *      · F8 登録 → confirmDialog Q00002; ngày sai → alert E00002.
 *      · F9 印刷 → ngày sai chặn trước bằng E00002 (KHÔNG confirm, đúng WinForm
 *        btnF9). Ngày hợp lệ → POST /tenant/report/{patNo}/inp-doc-datasource
 *        dựng datasource RPT203002 (kèm teeth_image chụp từ chart) rồi đẩy
 *        NGUYÊN XI envelope.renderRequest sang print agent:
 *          POST {agent}/v1/render → preview=false: in thẳng qua /v1/print
 *                                 → preview=true : SSE `complete` → PdfPreviewDialog
 *        Xem khối TC-IN-* bên dưới + cờ TEST_AGENT.
 *      · F10 戻る → đóng luôn, WinForm btnF10 không hỏi lưu.
 *  - components/oral-hygiene-tooth-chart.tsx (chart tách riêng):
 *      · READ-ONLY y như WinForm — mọi tooth model dựng với SelectMode=false nên
 *        bấm 歯面 KHÔNG đổi gì; 歯面 chỉ sửa được ở dialog PCR (frm203030).
 *      · Port ToothInfo.delToothInfo: MỌI răng đều được vẽ cùng một kiểu mực,
 *        bất kể có nằm trong 部位 của ngày hay không.
 *      · Mỗi răng `<g data-tooth={idx} data-present>` + 4 `<path data-face data-on>`;
 *        `data-on="true"` = 歯面 đó có plaque → tô PLAQUE_FILL #ff0000
 *        (`_sigaColors[4] = Color.Red` của WinForm).
 *      · Ô 本数 có aria-label="本数".
 *  - lib/pcr-record.ts `extractPlaqueLines` + treatment-entry-detail.tsx:
 *      LOAD PCR — port getPlaque: quét NGƯỢC LÊN từ dòng đang focus trong cùng
 *      ngày, dòng record gặp ĐẦU TIÊN là 下段, dòng thứ hai là 上段. Không có
 *      con trỏ thì bắt đầu từ dòng CUỐI của ngày. Hai dòng này gửi lên BE
 *      (/tenant/sidou/initial) để decode 歯面 + tính プラークスコア.
 *  - utils/tooth-chart.ts: getToothSize / getToothVariant / TOOTH_SIZE_DEFAULTS
 *    — 3 cỡ vòng tròn (WinForm frm203045 ToothModelSize) và 2 kiểu marker;
 *    `surfaceFace` xoay 歯面 của răng hàm (4–8) một phần tư theo cung.
 *  - locales/ja.ts: E00002 `${field}が間違っています。` (commit 4b25e1455 chỉnh lại
 *    theo WinForm — KHÔNG phải 「が正しくありません。」), Q00002
 *    「更新してよろしいですか？」, I00001 「登録が完了しました。」
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login trong một khung thời gian, nên login + mở màn 診療入力 làm đúng một lần
 * ở beforeAll. Các testcase nối tiếp nhau trên cùng dialog, thứ tự có ý nghĩa —
 * chạy lẻ một testcase ở giữa sẽ hỏng vì dialog chưa được mở.
 *
 * F8 登録 mặc định chỉ chạy tới bước confirm rồi chọn No (không ghi DB).
 * Muốn chạy hẳn nhánh ghi thật: TEST_ALLOW_SAVE=1 npx playwright test <spec>
 *
 * IN THẬT HAY KHÔNG — suy từ NỀN TẢNG, không phải cờ opt-in (đồng bộ với
 * `dental-disease-management-dialog.spec.ts`):
 *   Có agent (Windows, hoặc TEST_AGENT=1)  ← MẶC ĐỊNH trên máy tester
 *     F9 đi THẲNG tới agent thật. Route chỉ làm 2 việc: (a) chụp body /v1/render
 *     rồi chèn `forcePreview: true` để agent luôn trả PDF xem trước bất kể
 *     print_mapping của 帳票 đó bật/tắt preview, (b) CHẶN /v1/print để không bao
 *     giờ có job xuống spooler. Nhờ vậy chặng datasource → Crystal → tờ giấy
 *     được kiểm THẬT: tải chính file PDF agent render, soi số trang, ảnh 歯式 và
 *     từng giá trị của datasource có lên giấy hay không (TC-IN-4/5).
 *     KHÔNG bấm PDF出力 (F2): agent bung hộp thoại "Save As" của Windows mà
 *     Playwright không đóng được → treo cả suite.
 *   Không có agent (macOS/Linux, hoặc TEST_AGENT=0)
 *     Toàn bộ endpoint agent bị stub. Vẫn soi được DATASOURCE (envelope BE trả
 *     về, body /v1/render, từng cột RptInpDocTbl, teeth_image) nhưng KHÔNG chứng
 *     minh được PDF xuất ra — nên TC-IN-5 tự skip kèm lý do rõ ràng.
 *
 * Các nhánh LỖI của agent (preview OFF / 500 / offline — TC-IN-6..9) LUÔN chạy
 * bằng stub, kể cả khi có agent thật: không có cách nào ép agent thật hỏng theo
 * ý muốn, mà đó lại chính là thứ cần kiểm ở phía FE.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
/**
 * Mặc định trỏ vào ca CÓ record プラークコントロール (trt_cd 7999 / trt_sb 7, hai
 * dòng `*プラーク*|…`) để nhánh load PCR chạy thật chứ không bị bỏ qua:
 *
 *   select pat_no, trt_dt, count(*) from t_tenant1.trn_trn
 *   where trt_cd = 7999 and trt_sb = 7 and dsp_trt like '%プラーク%'
 *   group by 1, 2 having count(*) >= 2;
 *
 * Ca khác: TEST_PAT_NO=... TEST_TRT_DT=YYYY-MM-DD.
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
const TRT_DT = process.env.TEST_TRT_DT ?? '2025-12-24'
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/**
 * Có print agent để in THẬT hay không — xem đầu file.
 *
 * Agent là net48 + Crystal Reports → CHỈ chạy được trên Windows. Trên macOS/Linux
 * mọi lệnh gọi agent hỏng nên phải stub. Suy từ nền tảng thay vì bắt người chạy
 * nhớ đặt cờ; ép tay khi agent nằm ở máy khác:
 *   TEST_AGENT=1   # buộc in THẬT
 *   TEST_AGENT=0   # buộc stub, kể cả trên Windows
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

/** Lý do skip cho các testcase chỉ có nghĩa khi PDF do agent thật render. */
const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

/** Phải khớp VITE_AGENT_BASE_URL của web-tenant (lib/env.ts mặc định cổng này). */
const AGENT_BASE_URL = process.env.TEST_AGENT_BASE_URL ?? 'https://127.0.0.1:58247'
/**
 * Độ gắt khi so text bóc từ PDF thật (chỉ có tác dụng khi có agent):
 *   strict (mặc định) — thiếu giá trị nào trên giấy là FAIL, kể cả chữ Hán.
 *   loose             — chỉ giá trị KHÔNG chứa chữ Hán mới fail; chữ Hán thiếu
 *                       thì chỉ cảnh báo. Dùng khi bộ ghi PDF của template map
 *                       chữ Hán sang code point bộ thủ lạ mà bảng FOLD_RADICALS
 *                       trong pdf-content.ts chưa phủ (xem chú thích ở đó).
 */
const PDF_TEXT_STRICT = (process.env.TEST_PDF_TEXT ?? 'strict') !== 'loose'

// ── URL của luồng in ─────────────────────────────────────────────────────────
/** BE dựng datasource: POST /tenant/report/{patNo}/inp-doc-datasource. */
const DATASOURCE_URL = /\/tenant\/report\/\d+\/inp-doc-datasource(\?|$)/
/** Agent: render → SSE tiến độ → PDF tạm → in / lưu PDF. */
const AGENT_RENDER_URL = /\/v1\/render(\?|$)/
const AGENT_PRINT_URL = /\/v1\/print(\?|$)/
const AGENT_SAVE_PDF_URL = /\/v1\/save-pdf(\?|$)/
/** Gộp mọi endpoint agent mà stub cần nắm (kể cả /healthz cho nhánh offline). */
const AGENT_ANY_URL =
    /\/(v1\/(render|print|prewarm|save-pdf)|healthz|v1\/jobs\/[^/]+\/events|tmp\/[0-9a-fA-F-]+\.pdf)(\?|$)/

/** 帳票ID sau ReportNameNormalizer: rpt_nm_1 "RPT20300201.rpt" → "rpt20300201". */
const REPORT_ID = 'rpt20300201'
/** Tên bảng DUY NHẤT của datasource (Lib.RptInpDoc), printProc emit đúng 1 dòng. */
const DS_TABLE = 'RptInpDocTbl'
/** WinForm nối cboGuide1..6 bằng Environment.NewLine (Windows ⇒ CRLF). */
const PLAN_SEPARATOR = '\r\n'
/** cboStHour + "：" + cboStMin — dấu hai chấm TOÀN GIÁC, không phải ':' ASCII. */
const TIME_SEPARATOR = '：'
/** 8 byte đầu của PNG, đã base64 → mọi PNG đều mở đầu bằng chuỗi này. */
const PNG_BASE64_PREFIX = 'iVBORw0KGgo'

/** Giá trị nhồi vào form trước khi bấm F9 — cột nào của datasource cũng truy ra được. */
const PRINT_FIXTURE = {
    /** txtScore — BE Trim() rồi in verbatim, KHÔNG parse số. */
    score: '32.5',
    /** cboGuide1..6; để trống 2 ô giữa để kiểm plan_text vẫn đủ 6 đoạn. */
    guides: ['ブラッシング指導', 'フロス使用', '', '定期健診の案内', '', '仕上げ磨き'],
    startHour: '09',
    startMinute: '30',
    endHour: '10',
    endMinute: '00',
    toothCnt: '28',
    /** chkSts1..4 — đúng thứ tự STATE_LABELS (brushOk/brushNg/tartar/swelling). */
    flags: [true, false, true, false],
} as const

// ── Stub agent ───────────────────────────────────────────────────────────────
/**
 * Kịch bản agent trả về, đổi giữa các testcase (mô hình một-route-nhiều-mode
 * như spec 深夜(&S)):
 *   real    — KHÔNG giả lập: đẩy tiếp tới agent thật, chỉ chèn forcePreview và
 *             chặn /v1/print (xem đầu file)
 *   preview — 202 { preview: true } → SSE `complete` → PdfPreviewDialog
 *   direct  — 202 { preview: false } → FE gọi thẳng /v1/print
 *   error   — 500 kèm message → nhánh AgentResponseError
 *   offline — abort mọi request (kể cả /healthz) → nhánh AgentUnreachableError
 */
type AgentMode = 'real' | 'preview' | 'direct' | 'error' | 'offline'

/** GUID cố định cho job/PDF tạm — extractPdfId của PdfPreviewDialog cần đúng 36 ký tự. */
const STUB_JOB_ID = '11111111-1111-4111-8111-111111111111'
const STUB_PDF_ID = '22222222-2222-4222-8222-222222222222'
const STUB_PDF_TICKET = 'pdf-ticket-stub'
const STUB_SSE_TICKET = 'sse-ticket-stub'
const STUB_AGENT_ERROR = '印刷エージェント側のテスト用エラーです'
/** PDF tối thiểu để iframe có cái mà tải; nội dung không được assert. */
const STUB_PDF_BODY =
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n'

/**
 * Agent nằm ở origin khác (loopback), nên response stub phải mang CORS header
 * thì fetch của agentClient / EventSource mới đọc được. Preflight OPTIONS thì
 * KHÔNG cần lo: Playwright tự trả 204 cho nó khi page đang bật interception.
 */
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
}

/** Body POST /v1/render — cũng đúng shape FE dùng lại cho /v1/print. */
interface RenderRequestBody {
    reportId: string
    printCategory: number
    dataJson: Record<string, unknown[]>
    useDesignPaper?: boolean
}

/** Một dòng RptInpDocTbl — chỉ các cột makeRepInpDocTblData thực sự gán. */
interface InpDocRow {
    trt_dt: string
    trt_dt_jp: string
    pat_no: number
    pat_nm: string
    clinic_nm: string
    clinic_addr: string
    clinic_tel: string
    clinic_dentist: string
    treat1: boolean
    treat2: boolean
    treat3: boolean
    treat4: boolean
    treat_text: string
    plan_text: string
    start_time: string
    end_time: string
    teeth_cnt: number
    teeth_image?: string
}

/** Body POST /v1/save-pdf — agent bung hộp thoại "Save As" của Windows. */
interface SavePdfBody {
    pdfId?: string
    defaultName?: string
}

/** Envelope chung của mọi /tenant/report/*-datasource. */
interface DatasourceEnvelope {
    success: boolean
    data: { shouldPrint: boolean; renderRequest: RenderRequestBody | null }
}

const jsonFulfill = (route: Route, status: number, body: unknown) =>
    route.fulfill({
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })

/** TOOTH_COUNT — số răng vĩnh viễn của chart (utils/tooth-chart.ts). */
const TOOTH_COUNT = 32
/** SURFACE_COUNT — 4 歯面 mỗi răng (M/B/D/P). */
const SURFACE_COUNT = 4
/** Số cung phần tư (UR/UL/LR/LL) — mỗi cung 8 răng vĩnh viễn. */
const QUAD_COUNT = 4

/**
 * Cỡ vòng NGOÀI lấy từ chính designer của WinForm `ToothInfo`
 * (TOOTH_INFO_CELLS.size) — panel này chỉ dùng 2 cỡ control: 25px cho răng 1–5
 * và 30px cho răng 6–8 (KHÔNG có cỡ `small` 22px như frm203045). Bán kính là
 * TOOTH_SIZE_DEFAULTS[size].Ro.
 */
const OUTER_RADII = [
    { label: '1-5 (medium, 25px)', r: '11.3', perQuad: 5 },
    { label: '6-8 (large, 30px)', r: '13.7', perQuad: 3 },
] as const

/**
 * Vòng TRONG (咬合面) chỉ vẽ cho variant 'nested' = răng 4–8; răng cửa/nanh 1–3
 * là 'simple' (chỉ dấu X). Bán kính là TOOTH_SIZE_DEFAULTS[size].Rc của chính
 * cỡ control đó.
 */
const INNER_RADII = [
    { label: '4-5 (medium)', r: '4.48', perQuad: 2 },
    { label: '6-8 (large)', r: '5.9', perQuad: 3 },
] as const

/**
 * viewBox của chart — CHART_W × CHART_H, chính là panel `customPanel1` của
 * WinForm (TOOTH_INFO_PANEL, utils/tooth-info-layout.ts). Không phải con số
 * trang trí: RPT203002 in bitmap này làm lớp DƯỚI rồi ghép ảnh 口腔 + 20 chữ
 * 乳歯 lên trên theo đúng hệ toạ độ đó.
 */
const CHART_VIEWBOX = '0 0 392 460'
const CHART_W = 392
const CHART_H = 460
/** VIEWPORT_MARGIN của DraggableDialog — lề tối thiểu mỗi bên khi mở. */
const VIEWPORT_MARGIN = 8
/** GUIDE_COUNT — số dòng 指導内容. */
const GUIDE_COUNT = 6
/** HOURS = 24 mục; MINUTES = 60 ÷ MINUTE_STEP(5) = 12 mục. */
const HOUR_OPTIONS = 24
const MINUTE_OPTIONS = 12
/**
 * Màu wedge: bật = đỏ, tắt = trắng (ToothGlyph). Đỏ phải là RED thuần của
 * WinForm (`_sigaColors[4] = Color.Red`), không phải đỏ của palette Tailwind.
 */
const SURF_ON = '#ff0000'
const SURF_OFF = '#ffffff'
/** Sai số cho phép khi so kích thước layout (sub-pixel rounding). */
const EPS = 1

/** Nhãn 4 checkbox 【歯・歯肉の状態】 — đúng thứ tự brushOk/brushNg/tartar/swelling. */
const STATE_LABELS = [
    'よく磨けています',
    '磨き残しがあります',
    '歯石がついています',
    '歯ぐきに発赤・出血・腫れがあります',
] as const

/**
 * Radix Select: click trigger → listbox render qua portal ở body (KHÔNG nằm
 * trong dialog), nên option luôn phải tìm ở cấp `page`.
 */
async function selectOption(page: Page, trigger: Locator, optionName: string | RegExp) {
    await trigger.click()
    const option = page.getByRole('option', { name: optionName }).first()
    await option.waitFor({ state: 'visible', timeout: 10000 })
    await option.click()
    await expect(page.getByRole('listbox')).toBeHidden({ timeout: 10000 })
}

/** Đếm số option của một Radix Select rồi đóng lại bằng Escape. */
async function countOptions(page: Page, trigger: Locator): Promise<number> {
    await trigger.click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 10000 })
    const n = await page.getByRole('option').count()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden({ timeout: 10000 })
    return n
}

test.describe.configure({ mode: 'serial' })

test.describe('指導文書 — 実地指１・訪衛指 dialog', () => {
    let page: Page
    let step: () => Promise<void>

    /** DraggableDialog gắn role="dialog"; alert/confirm của appDialog là "alertdialog". */
    let dialog: Locator
    /**
     * Khối chứa một nhãn = CHA của phần tử mang đúng text đó.
     *
     * KHÔNG dùng `locator('div').filter({ has: ... }).last()`: `has` khớp cả
     * CHÍNH phần tử lẫn hậu duệ, nên `.last()` rơi trúng đúng cái div tiêu đề
     * (rỗng ruột) chứ không phải khối bao ngoài.
     */
    let boxOf: (text: string) => Locator
    let stateBox: Locator
    let noRow: Locator
    /** SVG chart = svg DUY NHẤT chứa foreignObject (ô 本); svg đầu tiên là icon X. */
    let chartSvg: Locator

    // ── Trạng thái stub agent, chia sẻ giữa các testcase in ───────────────────
    let agentMode: AgentMode = 'preview'
    /** Body /v1/render gần nhất do stub bắt được (bị resetAgentCapture xoá). */
    let sentRenderReq: RenderRequestBody | null = null
    /** Bản chụp datasource của TC-IN-1, giữ nguyên cho các TC sau đối chiếu. */
    let baselineRenderReq: RenderRequestBody | null = null
    /** Dòng RptInpDocTbl bóc từ sentRenderReq. */
    let sentRow: InpDocRow | null = null
    /** Body /v1/print và /v1/save-pdf gần nhất (chỉ có ở chế độ stub). */
    let sentPrintReq: RenderRequestBody | null = null
    let sentSavePdfReq: SavePdfBody | null = null
    /**
     * Xoá qua HÀM chứ không gán thẳng `= null` tại chỗ: gán thẳng làm TypeScript
     * thu hẹp biến về đúng `null` cho cả phần còn lại của testcase, nên mọi lần
     * đọc lại sau đó (dù stub đã ghi giá trị mới) đều thành `never`.
     */
    const resetAgentCapture = () => {
        sentRenderReq = null
        sentPrintReq = null
        sentSavePdfReq = null
    }

    /** Preview dialog của agent — tiêu đề do ja.printPreviewTitle dựng. */
    let previewDialog: Locator
    /** File PDF agent render thật (chỉ có khi AGENT_AVAILABLE) — TC-IN-5 soi. */
    let renderedPdf: Buffer | null = null

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        /**
         * Tự đóng SanteiConfirmDialog 「<trt_nm>を算定しますか？」 do AutoSantei bung
         * ra. Nó là DraggableDialog (nút Yes/No/Cancel — KHÔNG phải はい/いいえ),
         * nổi ĐÈ lên cả dialog 指導文書 và nuốt mọi cú click. Thời điểm xuất hiện
         * không đoán được, nên cắm handler để Playwright tự dọn trước mỗi thao tác.
         *
         * Bấm 「No」 chứ KHÔNG 「Yes」: 「Yes」 算定 xong lại kéo theo dialog
         * カルテ記載選択 — đổi popup này lấy popup khác.
         */
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 20 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        dialog = page.getByRole('dialog').filter({ hasText: '【歯・歯肉の状態】' })
        boxOf = (text: string) => dialog.getByText(text, { exact: true }).locator('..')
        stateBox = boxOf('【歯・歯肉の状態】')
        noRow = boxOf('No.')
        chartSvg = dialog.locator('svg:has(foreignObject)')
        previewDialog = page.getByRole('dialog').filter({ hasText: '実地指導文書プレビュー' })

        // ─── Một route duy nhất cho MỌI endpoint agent ────────────────────────
        // `agentMode` quyết định hành vi: 'real' đẩy tiếp tới agent thật, các mode
        // còn lại trả stub. Nhờ vậy cùng một suite chạy được trên máy có agent
        // (in thật, soi PDF) lẫn máy không có (vẫn soi trọn datasource).
        if (AGENT_AVAILABLE) {
            console.log(`có print agent → in THẬT qua ${AGENT_BASE_URL} (preview, không xuống spooler)`)
        }
        await page.route(AGENT_ANY_URL, async (route: Route) => {
            const req = route.request()
            const url = req.url()

            // ── Chế độ THẬT: không giả lập gì, chỉ can thiệp 2 chỗ ────────────
            if (agentMode === 'real') {
                // /v1/render — chụp body GỐC (để TC-IN-1 soi FE pass-through) rồi
                // chèn forcePreview: RPT203002 có thể chưa có dòng print_mapping
                // bật preview, khi đó agent in thẳng và test không còn PDF nào để
                // soi. forcePreview là cờ override có sẵn của agent; PDF vẫn do
                // Crystal render thật từ .rpt thật với datasource thật.
                if (AGENT_RENDER_URL.test(url)) {
                    const original = req.postDataJSON() as RenderRequestBody
                    sentRenderReq = original
                    return route.continue({
                        postData: JSON.stringify({ ...original, forcePreview: true }),
                    })
                }
                // /v1/print — CHẶN. Job xuống spooler Windows là mất kiểm soát:
                // nếu máy in mặc định là "Microsoft Print to PDF" thì driver bung
                // hộp thoại "Save Print Output As" của Windows shell, Playwright
                // không điều khiển được → treo cả suite.
                if (AGENT_PRINT_URL.test(url)) {
                    sentPrintReq = req.postDataJSON() as RenderRequestBody
                    return jsonFulfill(route, 202, { jobId: STUB_JOB_ID })
                }
                // SSE, PDF tạm, prewarm, healthz… đi thẳng tới agent thật.
                return route.continue()
            }

            // Offline: rơi cả /healthz, nếu không AgentOfflineDialog tự đóng
            // khi query health báo online.
            if (agentMode === 'offline') return route.abort('failed')

            if (/\/healthz/.test(url)) return jsonFulfill(route, 200, { ok: true })

            // Prewarm là tối ưu thuần tuý, FE nuốt mọi lỗi — trả 200 rỗng.
            if (/\/v1\/prewarm/.test(url)) return jsonFulfill(route, 200, {})

            if (AGENT_RENDER_URL.test(url)) {
                sentRenderReq = req.postDataJSON() as RenderRequestBody
                if (agentMode === 'error') {
                    return jsonFulfill(route, 500, { message: STUB_AGENT_ERROR })
                }
                if (agentMode === 'direct') return jsonFulfill(route, 202, { preview: false })
                return jsonFulfill(route, 202, {
                    preview: true,
                    jobId: STUB_JOB_ID,
                    sseTicket: STUB_SSE_TICKET,
                    eventsUrl: `/v1/jobs/${STUB_JOB_ID}/events?ticket=${STUB_SSE_TICKET}`,
                })
            }

            // SSE tiến độ. Agent phát event CÓ TÊN nên phải ghi `event: <tên>`;
            // `data:` mặc định (không tên) sẽ bị agent-print bỏ qua. Trả cả
            // stream trong một response — EventSource vẫn parse đủ frame.
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
                    body:
                        `event: progress\ndata: ${JSON.stringify({ type: 'progress', progressPercent: 50 })}\n\n` +
                        `event: complete\ndata: ${complete}\n\n`,
                })
            }

            // PDF tạm mà iframe preview trỏ tới.
            if (/\/tmp\/[0-9a-fA-F-]+\.pdf/.test(url)) {
                return route.fulfill({
                    status: 200,
                    headers: { ...CORS_HEADERS, 'Content-Type': 'application/pdf' },
                    body: STUB_PDF_BODY,
                })
            }

            if (AGENT_PRINT_URL.test(url)) {
                sentPrintReq = req.postDataJSON() as RenderRequestBody
                return jsonFulfill(route, 202, {
                    jobId: STUB_JOB_ID,
                    eventsUrl: `/v1/jobs/${STUB_JOB_ID}/events?ticket=${STUB_SSE_TICKET}`,
                })
            }

            if (AGENT_SAVE_PDF_URL.test(url)) {
                sentSavePdfReq = req.postDataJSON() as SavePdfBody
                return jsonFulfill(route, 200, {
                    saved: true,
                    path: `C:\\temp\\${STUB_PDF_ID}.pdf`,
                })
            }

            return jsonFulfill(route, 200, {})
        })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('mở dialog bằng nút 指導文書 của CategoryTabs', async () => {
        await page.getByRole('button', { name: '指導文書', exact: true }).click()
        await expect(dialog).toBeVisible({ timeout: 30000 })

        // Các khối chính của form đều phải có mặt.
        await expect(dialog.getByText('【歯・歯肉の状態】')).toBeVisible()
        await expect(dialog.getByText('【指導内容】')).toBeVisible()
        await expect(dialog.getByText('指導開始時刻')).toBeVisible()
        await expect(dialog.getByText('指導終了時刻')).toBeVisible()
        await step()
    })

    test('実地指１ / 訪衛指 — mặc định, focus, toggle độc lập', async () => {
        const jichi = dialog.getByRole('checkbox', { name: '実地指１' })
        const houei = dialog.getByRole('checkbox', { name: '訪衛指' })

        // initProc: 実地指１ bật sẵn, 訪衛指 tắt.
        await expect(jichi).toBeChecked()
        await expect(houei).not.toBeChecked()

        // WinForm initProc kết thúc bằng chkJichi.Focus(). Effect trong Body có
        // focus 実地指１ và bình thường thì đúng, NHƯNG không assert cứng được:
        // nó đua với effect open-focus của DraggableDialog / react-rnd, và nếu
        // popup 算定 bị handler đóng ngay lúc đó thì focus trả về màn nền.
        // → chỉ log để thấy khi lệch, không đánh đỏ cả suite vì một cuộc đua.
        const focused = await jichi.evaluate((el) => el === document.activeElement).catch(() => false)
        if (!focused) {
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                if (!el) return 'null'
                const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
                return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? '-'}] "${label.slice(0, 30)}"`
            })
            console.log(`CẢNH BÁO: 実地指１ không được focus khi mở dialog; đang focus: ${desc}`)
        }

        // Hai ô độc lập nhau (không phải radio).
        await houei.click()
        await expect(houei).toBeChecked()
        await expect(jichi).toBeChecked()
        await houei.click()
        await expect(houei).not.toBeChecked()
        await step()
    })

    test('tên bệnh nhân hiển thị kèm 「様」', async () => {
        await expect(dialog.getByText('様', { exact: true })).toBeVisible()
    })

    test('dialog vừa cửa sổ và KHÔNG phải cuộn khi vừa mở', async () => {
        // Dialog khai 1120×720 nhưng DraggableDialog kẹp lại theo window
        // (VIEWPORT_MARGIN mỗi bên) — mở trên màn nhỏ vẫn thấy đủ footer F8/F9/F10.
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

        // Mục tiêu của lần chỉnh size: body không sinh thanh cuộn lúc khởi tạo.
        // Body là div flex-1 overflow-auto (tabindex=-1) của DraggableDialog.
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

    test('歯面 chart — SVG co giãn theo cột, giữ viewBox cung hình trứng', async () => {
        // Bỏ width/height cứng, chỉ còn viewBox + w-full → chart co theo cột thay
        // vì đẩy dialog rộng ra và sinh thanh cuộn ngang.
        await expect(chartSvg).toHaveAttribute('viewBox', CHART_VIEWBOX)
        await expect(chartSvg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
        expect(await chartSvg.getAttribute('width'), 'SVG không được đặt width cứng').toBeNull()
        expect(await chartSvg.getAttribute('height'), 'SVG không được đặt height cứng').toBeNull()

        // Vẽ đúng tỉ lệ viewBox (cao hơn rộng — cung răng dựng đứng).
        const box = await chartSvg.boundingBox()
        expect(box).not.toBeNull()
        if (!box) return
        expect(box.height / box.width, 'chart phải cao hơn rộng').toBeCloseTo(CHART_H / CHART_W, 1)
        await step()
    })

    test('歯面 chart — 2 cỡ vòng tròn + marker nested/simple theo nhãn răng', async () => {
        // ToothSymbol vẽ cho MỌI răng (present lẫn absent) nên số lượng cố định,
        // không phụ thuộc dữ liệu 部位 của ngày đang xem.
        for (const size of OUTER_RADII) {
            await expect(
                chartSvg.locator(`circle[r="${size.r}"]`),
                `vòng ngoài răng ${size.label}`,
            ).toHaveCount(size.perQuad * QUAD_COUNT)
        }

        // Vòng trong chỉ có ở variant 'nested' (răng 4–8); răng cửa 1–3 là
        // 'simple' nên KHÔNG được sinh thêm vòng nào.
        for (const size of INNER_RADII) {
            await expect(
                chartSvg.locator(`circle[r="${size.r}"]`),
                `vòng trong răng ${size.label}`,
            ).toHaveCount(size.perQuad * QUAD_COUNT)
        }
        const nested = INNER_RADII.reduce((n, s) => n + s.perQuad * QUAD_COUNT, 0)
        await expect(
            chartSvg.locator('circle'),
            'tổng vòng tròn = 32 vòng ngoài + vòng trong',
        ).toHaveCount(TOOTH_COUNT + nested)
        await step()
    })

    test('歯面 chart — vẽ đủ 32 răng × 4 quarter, kể cả răng ngoài 部位', async () => {
        // Port ToothInfo.delToothInfo: WinForm chỉ set Enabled=false cho răng
        // ngoài 部位 — KHÔNG đổi màu, KHÔNG bỏ vẽ. Nên số lượng luôn cố định,
        // không phụ thuộc dữ liệu của ngày.
        await expect(chartSvg.locator('[data-tooth]')).toHaveCount(TOOTH_COUNT)
        await expect(chartSvg.locator('[data-face]')).toHaveCount(TOOTH_COUNT * SURFACE_COUNT)

        // data-tooth phải phủ đủ index 0..31 (toothIndexOf của 4 cung).
        const idx = await chartSvg
            .locator('[data-tooth]')
            .evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-tooth'))).sort((a, b) => a - b))
        expect(idx, 'data-tooth phải là 0..31 không trùng').toEqual(
            Array.from({ length: TOOTH_COUNT }, (_, i) => i),
        )

        // Răng ngoài 部位 (data-present="false") vẫn có đủ 4 quarter của nó.
        const absent = chartSvg.locator('[data-tooth][data-present="false"]')
        const nAbsent = await absent.count()
        if (nAbsent > 0) {
            await expect(absent.first().locator('[data-face]')).toHaveCount(SURFACE_COUNT)
        }
        console.log(`歯面 chart: ${TOOTH_COUNT - nAbsent}/${TOOTH_COUNT} răng nằm trong 部位`)
        await step()
    })

    test('load PCR — 歯面 có plaque được tô đỏ và プラークスコア tự điền', async () => {
        // getPlaque quét ngược từ dòng focus → 2 dòng `*プラーク*|…` của ngày →
        // BE decode thành vector 歯面 + tính điểm. Ngày này PHẢI có record PCR,
        // xem chú thích của PAT_NO/TRT_DT ở đầu file.
        const on = chartSvg.locator('[data-face][data-on="true"]')
        const nOn = await on.count()

        if (nOn === 0) {
            console.log(
                `load PCR: ngày ${TRT_DT} của BN ${PAT_NO} không có record プラークコントロール → BỎ QUA`,
            )
            return
        }

        // 歯面 bật thì phải được tô PLAQUE_FILL; 歯面 tắt thì nền trắng.
        await expect(on.first()).toHaveAttribute('fill', SURF_ON)
        await expect(chartSvg.locator('[data-face][data-on="false"]').first()).toHaveAttribute(
            'fill',
            SURF_OFF,
        )

        // プラークスコア do BE tính từ chính 2 dòng đó → không được rỗng/0.
        const score = stateBox.getByRole('textbox')
        await expect(score).not.toHaveValue('')
        const val = Number(await score.inputValue())
        expect(val, 'プラークスコア phải là số dương').toBeGreaterThan(0)

        console.log(`load PCR: ${nOn} 歯面 có plaque, プラークスコア = ${await score.inputValue()}`)
        await step()
    })

    test('歯面 chart — READ-ONLY: bấm 歯面 không đổi gì (SelectMode=false)', async () => {
        // WinForm dựng mọi tooth model với SelectMode=false → CustomPie vẽ theo
        // dữ liệu và bỏ qua click. 歯面 chỉ sửa được ở dialog PCR (frm203030).
        const quarter = chartSvg.locator('[data-face]').first()
        const beforeOn = await quarter.getAttribute('data-on')
        const beforeFill = await quarter.getAttribute('fill')

        await quarter.click({ force: true }) // force: SVG path không có hit-area khi rỗng
        await step()

        await expect(quarter).toHaveAttribute('data-on', beforeOn ?? 'false')
        await expect(quarter).toHaveAttribute('fill', beforeFill ?? SURF_OFF)
    })

    test('本数 — input number trong foreignObject giữa chart', async () => {
        const toothCnt = dialog.getByLabel('本数')
        await expect(toothCnt).toBeVisible()
        await toothCnt.fill('28')
        await expect(toothCnt).toHaveValue('28')
        await step()
    })

    test('【歯・歯肉の状態】 — 4 checkbox bật/tắt độc lập', async () => {
        const boxes = stateBox.getByRole('checkbox')
        await expect(boxes).toHaveCount(STATE_LABELS.length)

        for (const label of STATE_LABELS) {
            // <label> bọc Checkbox → accessible name của checkbox chính là nhãn.
            const cb = dialog.getByRole('checkbox', { name: label })
            await expect(cb).toBeVisible()
            await cb.click()
            await expect(cb, `${label}: click không bật`).toBeChecked()
        }
        // Tắt lại để không ảnh hưởng các testcase sau.
        for (const label of STATE_LABELS) {
            const cb = dialog.getByRole('checkbox', { name: label })
            await cb.click()
            await expect(cb).not.toBeChecked()
        }
        await step()
    })

    test('プラークスコア — chỉ nhận chữ số và dấu chấm', async () => {
        const score = stateBox.getByRole('textbox')
        await expect(score).toHaveCount(1)
        // onChange lọc [^0-9.] ngay khi gõ → chữ cái bị nuốt, số + '.' giữ lại.
        await score.fill('')
        await score.pressSequentially('a1b2.5x')
        await expect(score).toHaveValue('12.5')
        await step()
    })

    test('【指導内容】 — 6 dòng free text + datalist gợi ý', async () => {
        const guides = dialog.locator('input[list="sidou-guide-list"]')
        await expect(guides).toHaveCount(GUIDE_COUNT)
        // datalist phải tồn tại thì gợi ý guideHistory mới bung ra được.
        await expect(page.locator('#sidou-guide-list')).toHaveCount(1)

        // Combo WinForm là editable → gõ tay được, không bị khoá vào danh sách.
        await guides.nth(0).fill('ブラッシング指導')
        await expect(guides.nth(0)).toHaveValue('ブラッシング指導')
        await guides.nth(GUIDE_COUNT - 1).fill('フロス使用')
        await expect(guides.nth(GUIDE_COUNT - 1)).toHaveValue('フロス使用')
        await step()
    })

    test('指導開始/終了時刻 — 24 giờ, phút bước 5, chọn được', async () => {
        // TimeField root = cha của nhãn.
        const start = boxOf('指導開始時刻')
        const end = boxOf('指導終了時刻')
        await expect(start.getByRole('combobox')).toHaveCount(2)
        await expect(end.getByRole('combobox')).toHaveCount(2)

        expect(await countOptions(page, start.getByRole('combobox').nth(0)), '24 giờ').toBe(
            HOUR_OPTIONS,
        )
        expect(
            await countOptions(page, start.getByRole('combobox').nth(1)),
            'phút bước 5 → 12 mục',
        ).toBe(MINUTE_OPTIONS)

        await selectOption(page, start.getByRole('combobox').nth(0), '09')
        await selectOption(page, start.getByRole('combobox').nth(1), '30')
        await expect(start.getByRole('combobox').nth(0)).toHaveText('09')
        await expect(start.getByRole('combobox').nth(1)).toHaveText('30')

        await selectOption(page, end.getByRole('combobox').nth(0), '10')
        await selectOption(page, end.getByRole('combobox').nth(1), '00')
        await expect(end.getByRole('combobox').nth(0)).toHaveText('10')
        await expect(end.getByRole('combobox').nth(1)).toHaveText('00')
        await step()
    })

    test('No. + 印刷日 (EraDateField) — nhập được, mặc định seed từ printDt', async () => {
        // textbox theo thứ tự DOM: No. → 年 → 月 → 日.
        const boxes = noRow.getByRole('textbox')
        await expect(boxes).toHaveCount(4)

        await boxes.nth(0).fill('1')
        await expect(boxes.nth(0)).toHaveValue('1')

        // base seed từ printDt (ngày đang focus) → 年/月/日 không được rỗng.
        await expect(boxes.nth(1)).not.toHaveValue('')
        await expect(boxes.nth(2)).not.toHaveValue('')
        await expect(boxes.nth(3)).not.toHaveValue('')
        // 元号 select cũng phải có giá trị (mặc định 令和).
        await expect(noRow.getByRole('combobox')).not.toHaveText('')
        await step()
    })

    test('過去の記録から呼び出し — combo lịch sử nạp lại form', async () => {
        // Select đầu tiên của cột phải; khi chưa chọn hiện placeholder.
        const history = dialog.getByRole('combobox').first()
        await history.click()
        const listbox = page.getByRole('listbox')
        await listbox.waitFor({ state: 'visible', timeout: 10000 })
        const n = await page.getByRole('option').count()
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10000 })

        if (n === 0) {
            console.log('過去の記録: bệnh nhân chưa có bản ghi nào → BỎ QUA phần nạp lại')
            return
        }
        // Chọn một ngày → pickHistory setEdits(null) rồi nạp lại toàn bộ form.
        await selectOption(page, history, /.+/)
        await expect(history).not.toHaveText('過去の記録から呼び出し')
        await expect(dialog.locator('input[list="sidou-guide-list"]')).toHaveCount(GUIDE_COUNT)
        await step()
    })

    test('F9 印刷 (nút) với 年 rỗng → alert E00002 「日付が間違っています。」', async () => {
        // WinForm btnF9: chỉ 日付チェック rồi printProc, KHÔNG confirm. Date hợp lệ
        // sẽ dựng datasource RPT203002 + gọi print agent (preview/in/offline —
        // phụ thuộc agent, không deterministic) nên chỉ test nhánh date-sai, nó
        // chặn TRƯỚC khi chạm agent.
        const yearBox = noRow.getByRole('textbox').nth(1)
        const keepYear = await yearBox.inputValue()
        await yearBox.fill('')

        await dialog.getByRole('button', { name: 'F9 印刷' }).click()
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が間違っています。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keepYear)
        await step()
    })

    test('phím F9 (FKeyLayer của dialog) cho kết quả như nút F9', async () => {
        // fKeys của DraggableDialog là scope trên cùng → F-key của màn nền KHÔNG nổ.
        const yearBox = noRow.getByRole('textbox').nth(1)
        const keepYear = await yearBox.inputValue()
        await yearBox.fill('')

        await page.keyboard.press('F9')
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が間違っています。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keepYear)
        await step()
    })

    // ═══ Luồng in RPT203002 — datasource → agent ═════════════════════════════
    // Ngày hợp lệ: F9 gọi BE dựng datasource rồi đẩy NGUYÊN XI renderRequest
    // sang agent. Máy CÓ agent (Windows) thì đi tới agent THẬT và soi luôn file
    // PDF nó render; máy không có thì stub — xem đầu file.

    /** Nhồi mọi trường in được vào form, để từng cột datasource truy ngược ra được. */
    async function fillPrintForm() {
        for (const [i, label] of STATE_LABELS.entries()) {
            const want = PRINT_FIXTURE.flags[i]!
            const cb = dialog.getByRole('checkbox', { name: label })
            if ((await cb.isChecked()) !== want) await cb.click()
            await expect(cb).toBeChecked({ checked: want })
        }

        await stateBox.getByRole('textbox').fill(PRINT_FIXTURE.score)

        const guides = dialog.locator('input[list="sidou-guide-list"]')
        for (const [i, text] of PRINT_FIXTURE.guides.entries()) await guides.nth(i).fill(text)

        const start = boxOf('指導開始時刻')
        const end = boxOf('指導終了時刻')
        await selectOption(page, start.getByRole('combobox').nth(0), PRINT_FIXTURE.startHour)
        await selectOption(page, start.getByRole('combobox').nth(1), PRINT_FIXTURE.startMinute)
        await selectOption(page, end.getByRole('combobox').nth(0), PRINT_FIXTURE.endHour)
        await selectOption(page, end.getByRole('combobox').nth(1), PRINT_FIXTURE.endMinute)

        await dialog.getByLabel('本数').fill(PRINT_FIXTURE.toothCnt)

        // 印刷日 phải hợp lệ, nếu không F9 dừng ở E00002 trước khi chạm mạng.
        for (const i of [1, 2, 3]) {
            await expect(noRow.getByRole('textbox').nth(i)).not.toHaveValue('')
        }
    }

    /**
     * Đợi ĐÚNG response dựng datasource của lần bấm F9 — bỏ qua lời gọi prewarm
     * (`reportOnly: true`) mà dialog bắn ra mỗi lần mở.
     */
    function waitForDatasource() {
        return page.waitForResponse((res) => {
            if (!DATASOURCE_URL.test(res.url()) || res.request().method() !== 'POST') return false
            const body = res.request().postDataJSON() as { reportOnly?: boolean } | null
            return body?.reportOnly !== true
        }, { timeout: 60000 })
    }

    test('TC-IN-1 — F9 印刷 ngày hợp lệ: BE dựng datasource, FE đẩy nguyên xi sang agent', async () => {
        await fillPrintForm()
        // Có agent → in THẬT (route chỉ chèn forcePreview + chặn /v1/print);
        // không có → stub preview. Datasource được soi y hệt nhau ở cả hai.
        agentMode = AGENT_AVAILABLE ? 'real' : 'preview'
        resetAgentCapture()

        const datasourceResp = waitForDatasource()
        const renderReq = page.waitForRequest(AGENT_RENDER_URL, { timeout: 60000 })
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()

        // Trong lúc chờ, overlay chặn thao tác hiện lên (role="status").
        const envelope = (await (await datasourceResp).json()) as DatasourceEnvelope
        expect(envelope.success, 'BE trả lỗi khi dựng datasource').toBe(true)
        expect(envelope.data.shouldPrint, 'màn này luôn shouldPrint=true').toBe(true)
        expect(envelope.data.renderRequest, 'thiếu renderRequest').not.toBeNull()

        const built = envelope.data.renderRequest!
        expect(built.reportId, '帳票ID sau khi normalize').toBe(REPORT_ID)
        expect(typeof built.printCategory, 'printCategory lấy từ rpt_info.prt_no').toBe('number')
        expect(Object.keys(built.dataJson), 'datasource chỉ có 1 bảng').toEqual([DS_TABLE])
        expect(built.dataJson[DS_TABLE], 'printProc emit đúng 1 dòng').toHaveLength(1)

        // FE là pass-through thuần: body gửi agent PHẢI y hệt cái BE trả về.
        const sent = (await renderReq).postDataJSON() as RenderRequestBody
        expect(sent, 'FE sửa datasource trước khi gửi agent').toEqual(built)

        // Giữ lại làm mốc cho các TC sau (resetAgentCapture KHÔNG đụng tới).
        baselineRenderReq = sent
        sentRow = sent.dataJson[DS_TABLE]![0] as InpDocRow
        await step()
    })

    test('TC-IN-2 — RptInpDocTbl: từng cột khớp form + 医院マスタ', async () => {
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        // ── 日付: trt_dt (DateTime) và trt_dt_jp (和暦) cùng trỏ về 印刷日 trên form.
        const era = (await noRow.getByRole('combobox').textContent())?.trim() ?? ''
        const ymd = await Promise.all(
            [1, 2, 3].map((i) => noRow.getByRole('textbox').nth(i).inputValue()),
        )
        const [y, m, d] = [ymd[0]!, ymd[1]!, ymd[2]!]
        const iso = /^(\d{4})-(\d{2})-(\d{2})T00:00:00/.exec(row.trt_dt)
        expect(iso, `trt_dt phải là DateTime nửa đêm, nhận "${row.trt_dt}"`).not.toBeNull()
        expect(Number(iso![2]), 'trt_dt lệch tháng so với form').toBe(Number(m))
        expect(Number(iso![3]), 'trt_dt lệch ngày so với form').toBe(Number(d))
        // FormatSpaced căn phải bề rộng 2 → gộp khoảng trắng lại rồi so.
        expect(row.trt_dt_jp.replace(/\s+/g, ' ').trim()).toBe(`${era} ${Number(y)} 年 ${Number(m)} 月 ${Number(d)} 日`)

        // ── 患者 ──────────────────────────────────────────────────────────────
        expect(row.pat_no).toBe(Number(PAT_NO))
        expect(typeof row.pat_nm).toBe('string')
        if (row.pat_nm) await expect(dialog.getByText(row.pat_nm, { exact: false }).first()).toBeVisible()

        // ── 医院マスタ: WinForm chỉ in add1, và ghép tiền tố "TEL." vào số điện thoại.
        for (const key of ['clinic_nm', 'clinic_addr', 'clinic_tel', 'clinic_dentist'] as const) {
            expect(typeof row[key], `${key} phải là chuỗi`).toBe('string')
        }
        expect(row.clinic_tel, 'clinic_tel thiếu tiền tố TEL.').toMatch(/^TEL\./)

        // ── 歯・歯肉の状態 (chkSts1..4 + txtScore) ───────────────────────────────
        expect([row.treat1, row.treat2, row.treat3, row.treat4]).toEqual([...PRINT_FIXTURE.flags])
        expect(row.treat_text, 'treat_text = txtScore.Text.Trim(), không parse số').toBe(
            PRINT_FIXTURE.score,
        )

        // ── 指導内容: LUÔN 6 đoạn nối bằng CRLF, ô trống thành dòng rỗng ────────
        expect(row.plan_text.split(PLAN_SEPARATOR), 'plan_text phải đủ 6 đoạn').toEqual([
            ...PRINT_FIXTURE.guides,
        ])

        // ── 開始/終了時刻: dấu hai chấm toàn giác ───────────────────────────────
        expect(row.start_time).toBe(
            `${PRINT_FIXTURE.startHour}${TIME_SEPARATOR}${PRINT_FIXTURE.startMinute}`,
        )
        expect(row.end_time).toBe(
            `${PRINT_FIXTURE.endHour}${TIME_SEPARATOR}${PRINT_FIXTURE.endMinute}`,
        )

        // ── 歯数 ──────────────────────────────────────────────────────────────
        expect(row.teeth_cnt).toBe(Number(PRINT_FIXTURE.toothCnt))
    })

    test('TC-IN-3 — teeth_image: PNG base64 của chính chart 歯式', async () => {
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const image = sentRow!.teeth_image

        // BE chỉ gán cột khi FE gửi PNG hợp lệ (Convert.TryFromBase64String +
        // chữ ký PNG); hỏng thì BỎ cột và khung 歯式 in rỗng — không phải lỗi cứng.
        expect(image, 'thiếu teeth_image → khung 歯式 sẽ in rỗng').toBeTruthy()
        expect(image, 'teeth_image phải là base64 TRẦN, không có tiền tố data:').not.toMatch(
            /^data:/,
        )
        expect(image!.startsWith(PNG_BASE64_PREFIX), 'teeth_image không phải PNG').toBe(true)

        // Chart rasterise ở scale 3 (392×460 → 1176×1380) nên không thể bé tí,
        // và phải nằm dưới trần 2 MB của BE.
        const bytes = Math.floor((image!.length * 3) / 4)
        expect(bytes, 'teeth_image nhỏ bất thường — có thể chụp trượt chart').toBeGreaterThan(1000)
        expect(bytes, 'teeth_image vượt trần 2MB của BE').toBeLessThan(2 * 1024 * 1024)
        console.log(`teeth_image: ~${Math.round(bytes / 1024)} KB PNG`)
    })

    test('TC-IN-4 — preview: PdfPreviewDialog mở, iframe trỏ đúng PDF agent vừa render', async () => {
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

        if (AGENT_AVAILABLE) {
            // In THẬT: tải chính file agent vừa render. KHÔNG bấm F1 (job xuống
            // spooler, đã chặn ở route nhưng vẫn không bấm) và KHÔNG bấm F2
            // (agent bung "Save As" của Windows, Playwright không đóng được →
            // treo). TC-IN-5 soi nội dung file này.
            const res = await page.request.get(src!.split('#')[0]!)
            expect(res.ok(), `tải PDF preview lỗi ${res.status()}`).toBe(true)
            const pdf = await res.body()
            expect(pdf.subarray(0, 5).toString('latin1'), 'file agent trả về không phải PDF').toBe(
                '%PDF-',
            )

            // Đính kèm vào báo cáo Playwright — mở `npm run report` là xem được
            // đúng tờ giấy agent vừa dựng, kể cả khi mọi assert đều xanh.
            await test.info().attach('rpt20300201.pdf', { body: pdf, contentType: 'application/pdf' })
            renderedPdf = pdf
            console.log(`in THẬT: agent đã xuất PDF ${pdf.length} byte`)

            await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
            await expect(previewDialog).toBeHidden({ timeout: 10000 })
            await step()
            return
        }

        // Chế độ stub: F2 PDF出力 → POST /v1/save-pdf kèm GUID bóc từ src.
        resetAgentCapture()
        await previewDialog.getByRole('button', { name: 'F2 PDF出力' }).click()
        await expect(page.getByText(/保存しました：/)).toBeVisible({ timeout: 15000 })
        const savePdf: SavePdfBody | null = sentSavePdfReq
        expect(savePdf?.pdfId, 'save-pdf gửi sai pdfId').toBe(STUB_PDF_ID)
        expect(savePdf?.defaultName, 'tên file gợi ý = tên 帳票').toBe('実地指導文書')
        await step()
    })

    test('TC-IN-5 — nội dung PDF thật: từng giá trị của datasource phải lên giấy', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(renderedPdf, 'TC-IN-4 chưa tải được PDF').not.toBeNull()
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        const pdf = await readPdf(renderedPdf!)
        // Text nguyên trạng cũng đính kèm — fail thì mở ra đối chiếu ngay, khỏi
        // phải chạy lại với debugger.
        await test.info().attach('pdf-text.txt', { body: pdf.text, contentType: 'text/plain' })

        // ── Cấu trúc ─────────────────────────────────────────────────────────
        expect(pdf.pageCount, 'RPT203002 là帳票 1 trang').toBe(1)

        // ── 歯式イメージ: PNG đã nhúng vào khung 歯式 chưa ──────────────────────
        expect(pdf.images.length, 'PDF không có ảnh nhúng → khung 歯式 in rỗng').toBeGreaterThan(0)
        if (pdf.imagesFromRawScan) {
            console.log('CẢNH BÁO: không bóc được kích thước ảnh, chỉ biết PDF CÓ ảnh')
        } else {
            // Chart giữ nguyên tỉ lệ viewBox 392×460 khi rasterise, nên ảnh lớn
            // nhất trong PDF phải cùng tỉ lệ đó (bất kể agent scale bao nhiêu).
            const biggest = pdf.images[0]!
            expect(
                biggest.width / biggest.height,
                `ảnh 歯式 sai tỉ lệ (${biggest.width}×${biggest.height})`,
            ).toBeCloseTo(CHART_W / CHART_H, 1)
        }

        // ── Nội dung: mọi giá trị của datasource phải tìm thấy trên giấy ──────
        // So với chính `sentRow` chứ không phải hằng số: khép kín vòng
        // form → datasource → giấy, và tự đúng với dữ liệu 医院マスタ của tenant.
        const guides = row.plan_text.split(PLAN_SEPARATOR).filter((g) => g.trim() !== '')
        const expected: { label: string; value: string }[] = [
            { label: 'プラークスコア', value: row.treat_text },
            { label: '指導開始時刻', value: row.start_time },
            { label: '指導終了時刻', value: row.end_time },
            { label: '電話番号', value: row.clinic_tel },
            { label: '患者氏名', value: row.pat_nm },
            { label: '医院名', value: row.clinic_nm },
            { label: '住所', value: row.clinic_addr },
            { label: '開設者', value: row.clinic_dentist },
            { label: '印刷日(和暦)', value: row.trt_dt_jp },
            ...guides.map((g, i) => ({ label: `指導内容${i + 1}`, value: g })),
        ].filter((e) => e.value.trim() !== '')
        // 歯数 KHÔNG kiểm: nó là số trần ("28"), gặp trùng ở chỗ khác trên giấy
        // là chuyện thường → assert sẽ xanh giả.

        const hasKanji = (s: string) => /[一-鿿]/.test(s)
        const missingHard: string[] = []
        const missingSoft: string[] = []
        for (const { label, value } of expected) {
            if (pdf.folded.includes(foldForCompare(value))) continue
            const entry = `${label} = "${value}"`
            // Chữ Hán có thể trượt vì bảng ToUnicode của font, không hẳn do dữ
            // liệu sai — TEST_PDF_TEXT=loose hạ nhóm này xuống mức cảnh báo.
            if (!PDF_TEXT_STRICT && hasKanji(value)) missingSoft.push(entry)
            else missingHard.push(entry)
        }
        if (missingSoft.length > 0) {
            console.log(`CẢNH BÁO: không thấy trên PDF (loose): ${missingSoft.join(' | ')}`)
        }
        expect(
            missingHard,
            'các giá trị này có trong datasource nhưng KHÔNG thấy trên PDF ' +
                '(mở phần đính kèm rpt20300201.pdf / pdf-text.txt của testcase để đối chiếu)',
        ).toEqual([])

        console.log(`nội dung PDF: khớp ${expected.length - missingSoft.length}/${expected.length} giá trị`)
        await step()
    })

    test('TC-IN-6 — preview → F1 印刷: /v1/print nhận đúng datasource, dialog đóng', async () => {
        // LUÔN chạy bằng STUB, kể cả khi có agent thật: đây là hợp đồng FE↔agent
        // (in lại đúng datasource đã render), không phải chặng Crystal. Với agent
        // thật thì /v1/print đã bị chặn ở route nên cũng không có gì để soi.
        if (await previewDialog.isVisible()) {
            await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
            await expect(previewDialog).toBeHidden({ timeout: 10000 })
        }
        agentMode = 'preview'
        resetAgentCapture()
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()
        await expect(previewDialog, 'stub preview không mở được dialog xem trước').toBeVisible({
            timeout: 60000,
        })

        // baselineRenderReq của TC-IN-1 là mốc so sánh; lần render vừa rồi phải
        // mang y hệt datasource đó (form không đổi giữa hai lần bấm).
        resetAgentCapture()
        await previewDialog.getByRole('button', { name: 'F1 印刷' }).click()

        await expect(previewDialog, '印刷 xong phải tự đóng preview').toBeHidden({ timeout: 30000 })
        await expect(page.getByText('実地指導文書を印刷しました')).toBeVisible({ timeout: 15000 })

        // printReport gửi lại ĐÚNG datasource đã render — agent in lại theo khổ
        // giấy cấu hình, nên không kèm pdfUrl.
        const printed: RenderRequestBody | null = sentPrintReq
        expect(printed, '/v1/print không được gọi').not.toBeNull()
        expect(printed!.reportId).toBe(baselineRenderReq!.reportId)
        expect(printed!.printCategory).toBe(baselineRenderReq!.printCategory)
        expect(printed!.dataJson, '/v1/print nhận datasource khác lúc render').toEqual(
            baselineRenderReq!.dataJson,
        )
        await step()
    })

    test('TC-IN-7 — preview OFF: in thẳng, /v1/render rồi /v1/print không qua dialog', async () => {
        // Nhánh này CHỈ dựng được bằng stub (không ép agent thật trả preview=false).

        // Toast của TC-IN-6 phải tan hẳn, nếu không assert bên dưới trúng nó.
        await expect(page.getByText('実地指導文書を印刷しました')).toBeHidden({ timeout: 30000 })

        agentMode = 'direct'
        resetAgentCapture()
        const printReq = page.waitForRequest(AGENT_PRINT_URL, { timeout: 60000 })
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()
        await printReq

        await expect(page.getByText('実地指導文書を印刷しました')).toBeVisible({ timeout: 30000 })
        await expect(previewDialog, 'preview=false thì KHÔNG được mở dialog xem trước').toBeHidden()
        expect(sentPrintReq!.dataJson[DS_TABLE], 'in thẳng cũng phải đủ 1 dòng').toHaveLength(1)
        await step()
    })

    test('TC-IN-8 — agent trả lỗi: hiện đúng message của agent, không báo in xong', async () => {
        // Chỉ stub mới ép được agent trả 500 — agent thật không có cách nào hỏng
        // theo ý muốn, mà nhánh này lại là thứ cần kiểm ở phía FE.
        agentMode = 'error'
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()

        // AgentResponseError → ưu tiên message trong body agent, không phải câu chung.
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 30000 })
        await expect(alert.getByText(STUB_AGENT_ERROR)).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })
        await expect(previewDialog).toBeHidden()
        await step()
    })

    test('TC-IN-9 — agent không chạy: hiện hướng dẫn khởi động, không nuốt lỗi', async () => {
        // Cũng chỉ dựng được bằng stub (abort mọi request, kể cả /healthz).
        agentMode = 'offline'
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()

        // AgentUnreachableError → AgentOfflineDialog thay vì toast lỗi chung chung.
        const offline = page.getByRole('dialog').filter({
            hasText: '印刷エージェントが起動していません',
        })
        await expect(offline).toBeVisible({ timeout: 30000 })
        await expect(offline.getByRole('button', { name: '起動' })).toBeVisible()
        await offline.getByRole('button', { name: 'キャンセル' }).click()
        await expect(offline).toBeHidden({ timeout: 10000 })

        agentMode = 'preview' // trả stub về mặc định cho các testcase sau
        await step()
    })

    test('F8 登録 với 年 rỗng → alert E00002 「日付が間違っています。」', async () => {
        const yearBox = noRow.getByRole('textbox').nth(1)
        const keepYear = await yearBox.inputValue()
        await yearBox.fill('') // japaneseEraToDate trả null → chặn TRƯỚC confirm

        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が間違っています。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keepYear) // trả lại ngày hợp lệ cho testcase sau
        await step()
    })

    test('F8 登録 — confirm Q00002 「更新してよろしいですか？」', async () => {
        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const confirm = page.getByRole('alertdialog')
        await expect(confirm).toBeVisible({ timeout: 10000 })
        await expect(confirm.getByText('更新してよろしいですか？')).toBeVisible()

        if (!ALLOW_SAVE) {
            // Mặc định KHÔNG ghi DB: chọn No → handleRegister return sớm, dialog
            // 実地指１ vẫn mở nguyên trạng. (Nút của confirmDialog đang là Yes/No,
            // chấp nhận cả はい/いいえ phòng khi label đổi lại.)
            await confirm.getByRole('button', { name: /^(No|いいえ)$/ }).click()
            await expect(confirm).toBeHidden({ timeout: 10000 })
            await expect(dialog).toBeVisible()
            console.log('F8 登録: dừng ở confirm (đặt TEST_ALLOW_SAVE=1 để ghi thật)')
            await step()
            return
        }

        await confirm.getByRole('button', { name: /^(Yes|はい)$/ }).click()
        // Thành công → I00001; lỗi → 「登録に失敗しました: ...」. Cả hai đều là alert,
        // nên phải assert đúng nhánh thành công.
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
        // WinForm btnF10 đóng thẳng — không có confirm nào chen vào.
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await step()
    })

    test('mở lại → state reset (Body unmount khi đóng = chạy lại initProc)', async () => {
        await page.getByRole('button', { name: '指導文書', exact: true }).click()
        await expect(dialog).toBeVisible({ timeout: 30000 })

        await expect(dialog.getByRole('checkbox', { name: '実地指１' })).toBeChecked()
        await expect(dialog.locator('input[list="sidou-guide-list"]').nth(0)).toHaveValue('')
        await step()
    })

    test('phím F10 đóng dialog', async () => {
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('cửa sổ nhỏ hơn dialog → DraggableDialog kẹp lại, footer vẫn với tới', async () => {
        // Dialog khai 1120×720; DraggableDialog kẹp width/height theo
        // window - VIEWPORT_MARGIN*2 ngay lúc mở. Không kẹp thì trên màn nhỏ
        // footer F8/F9/F10 lọt ra ngoài mép và không bấm được.
        const original = page.viewportSize()
        const SMALL = { width: 1000, height: 620 }
        await page.setViewportSize(SMALL)
        try {
            await page.getByRole('button', { name: '指導文書', exact: true }).click()
            await expect(dialog).toBeVisible({ timeout: 30000 })

            const box = await dialog.boundingBox()
            expect(box).not.toBeNull()
            if (box) {
                expect(box.width, 'dialog không được rộng quá cửa sổ nhỏ').toBeLessThanOrEqual(
                    SMALL.width - VIEWPORT_MARGIN * 2 + EPS,
                )
                expect(box.height, 'dialog không được cao quá cửa sổ nhỏ').toBeLessThanOrEqual(
                    SMALL.height - VIEWPORT_MARGIN * 2 + EPS,
                )
                expect(box.x, 'dialog tràn mép trái').toBeGreaterThanOrEqual(0)
                expect(box.y, 'dialog tràn mép trên').toBeGreaterThanOrEqual(0)
            }
            // Chart co theo cột (w-full + viewBox) nên không đẩy body cuộn ngang.
            const body = dialog.locator('div[tabindex="-1"].overflow-auto').first()
            const { sw, cw } = await body.evaluate((el) => ({
                sw: el.scrollWidth,
                cw: el.clientWidth,
            }))
            expect(sw, 'body bị cuộn NGANG trên cửa sổ nhỏ').toBeLessThanOrEqual(cw + EPS)

            // Footer phải nằm TRỌN trong cửa sổ, không thò ra ngoài mép dưới/phải.
            // (Không click thẳng: ở dev build, badge nổi 'TanStack Devtools' ngồi
            // đúng góc dưới-phải và ăn mất cú click — đó là widget dev, không phải app.)
            const f10 = dialog.getByRole('button', { name: 'F10 戻る' })
            await expect(f10).toBeVisible()
            const fb = await f10.boundingBox()
            expect(fb).not.toBeNull()
            if (fb) {
                expect(fb.y + fb.height, 'nút F10 thò khỏi mép dưới').toBeLessThanOrEqual(
                    SMALL.height,
                )
                expect(fb.x + fb.width, 'nút F10 thò khỏi mép phải').toBeLessThanOrEqual(SMALL.width)
            }

            await page.keyboard.press('F10')
            await expect(dialog).toBeHidden({ timeout: 10000 })
            await step()
        } finally {
            if (original) await page.setViewportSize(original)
        }
    })
})
