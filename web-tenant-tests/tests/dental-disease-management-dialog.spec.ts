import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { countChiryoKanriR2, dbEnabled, deleteChiryoKanriR2, latestChiryoKanriR2 } from './db'
import { foldForCompare, readPdf } from './pdf-content'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 歯科疾患管理 (frm203021) — DentalDiseaseManagementDialog, mở từ CategoryTabs
 * 「歯管」 trên màn 診療入力 `/treatments/{patNo}`.
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/dental-disease-management-dialog.tsx
 *      · DraggableDialog title 「歯 科 疾 患 管 理」 (chữ bị giãn) → KHÔNG match
 *        theo title, match theo text trong body 「【歯科疾患管理に係わる管理計画書】」.
 *      · Body split: đóng thì `open=false` → return null (không render gì); mở
 *        là remount Body → chạy lại initProc → state reset.
 *      · Mở dialog → POST /tenant/chiryo-kanri-r2/initial với paramData của lưới:
 *        patNo, printDt (ngày của dòng đang focus — getFocusDt), toothFlg (vector
 *        32 ô 部位 của dòng đó) và 2 dòng `*プラーク*|…` của ngày (getPlaque).
 *        BE dựng 歯式 + 本数 + 履歴 + carry-forward từ đó.
 *      · carry-forward (bản ghi mới nhất ≤ 印刷日) CHỈ điền các mục lâm sàng —
 *        文書書式 KHÔNG được kế thừa (luôn về 継続用) và 歯式 luôn dựng lại từ 部位
 *        của ngày. Chọn một mục 履歴 thì ngược lại: khôi phục TẤT CẢ, cả 文書書式
 *        lẫn 歯式.
 *      · F8 登録 → 日付チェック (E00002) → confirm Q00001 → upsert theo
 *        (pat_no, print_dt).
 *      · F9 印刷 → dựng datasource RPT203001 rồi đẩy sang print agent. 文書書式
 *        chọn hẳn file .rpt (初回用 → rpt_no 1, 継続用 → 2). KHÔNG check ngày và
 *        KHÔNG confirm — khác hẳn F8.
 *      · F10 戻る → đóng luôn, WinForm btnF10 không hỏi lưu.
 *  - components/dental-disease-tooth-chart.tsx:
 *      · Vẽ CẢ HAI vòng: 32 永久歯 (se_1..se_32) + 20 乳歯 (sn_1..sn_20) = 52 răng,
 *        208 歯面. Đây là điểm khác 実地指１ (frm203022 ép mọi `nbui` = -1 nên chỉ
 *        có vòng ngoài).
 *      · `data-tooth` ở đây là KHOÁ chuỗi ('UR-8', 'LL-1', 'UR-E'…) chứ không
 *        phải index số như chart 実地指１ — hai vòng dùng chung một namespace.
 *      · READ-ONLY y như WinForm (mọi tooth model SelectMode = false): bấm 歯面
 *        KHÔNG đổi gì; 歯面 chỉ sửa được ở dialog PCR (frm203030).
 *      · Ô 本数 (aria-label="本数") là control DUY NHẤT sửa được trong chart.
 *  - utils/tooth-info-layout.ts + utils/tooth-chart.ts: cỡ vòng tròn lấy từ
 *    designer WinForm — 永久歯 1-5 medium / 6-8 large, 乳歯 A-C small / D-E medium;
 *    vòng trong (咬合面) chỉ có ở variant 'nested' (4-8 và D-E).
 *  - locales/ja.ts: E00002 `${field}が正しくありません。`, Q00001
 *    「登録してよろしいですか？」, I00001 「登録が完了しました。」
 *
 * Commit layout (798aa8c2) chuyển mọi 【…】 sang bố cục "caption cột trái cố định
 * + control cột phải co giãn" và nới dialog 1120×740 → 1200×880 để KHÔNG sinh
 * thanh cuộn lúc mở. Hai testcase TC-LAYOUT-* dưới đây canh đúng chỗ đó.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login, nên login + mở màn 診療入力 làm đúng một lần ở beforeAll. Các testcase
 * nối tiếp trên cùng dialog, thứ tự có ý nghĩa — chạy lẻ một testcase ở giữa sẽ
 * hỏng vì dialog chưa được mở.
 *
 * F8 登録:
 *   · TC-SAVE-1 CHẶN request bằng `page.route` rồi soi payload → KHÔNG ghi DB,
 *     chạy hằng ngày được. Đây là chỗ kiểm 2 lỗi WinForm đã sửa trong commit:
 *     tooth_cnt không còn luôn bằng 0, và răng hiện diện không có プラーク vẫn
 *     được gửi present = true.
 *   · TC-SAVE-2 đi tới bước confirm rồi chọn No. Muốn ghi thật:
 *     TEST_ALLOW_SAVE=1 npx playwright test <spec>
 *
 * Testcase CAN THIỆP DB (ghi thật + verify + DELETE dọn) chỉ chạy ở LOCAL, gate
 * bằng `dbEnabled` (tests/db.ts): TEST_DB=1 npx playwright test <spec>. Chạy
 * production không đặt biến → tự skip, không đụng Postgres.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
/**
 * Mặc định trỏ vào ca CÓ record プラークコントロール để nhánh 歯面 chạy thật (cùng
 * bệnh nhân/ngày với spec 実地指１ — xem chú thích ở đó). Testcase KHÔNG bắt buộc
 * ngày phải có 部位: trạng thái rỗng vẫn chạy đủ, chỉ log lại.
 * Ca khác: TEST_PAT_NO=... TEST_TRT_DT=YYYY-MM-DD.
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
const PAT_NO_NUM = Number(PAT_NO)
const TRT_DT = process.env.TEST_TRT_DT ?? '2025-12-24'
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ── URL các endpoint của màn này ─────────────────────────────────────────────
/** initProc — POST, body mang 部位 + プラーク của lưới. */
const INITIAL_URL = /\/tenant\/chiryo-kanri-r2\/initial(\?|$)/
/** entryProc — POST đúng gốc feature (KHÔNG khớp /initial vì phải hết chuỗi). */
const SAVE_URL = /\/tenant\/chiryo-kanri-r2\/?(\?|$)/
/** printProc — F9 印刷 dựng datasource RPT203001 (文書書式 chọn rpt_no 1/2). */
const PRINT_URL = /\/tenant\/report\/\d+\/chiryo-kanri-datasource(\?|$)/

// ── Luồng in: agent + PDF ────────────────────────────────────────────────────
/**
 * Luồng in chạy THẲNG qua print agent thật — máy chạy test luôn bật agent.
 * KHÔNG stub: stub chỉ chứng minh FE gửi đúng dữ liệu, còn chặng
 * datasource → Crystal → tờ giấy nằm ngoài web-tenant và chỉ agent thật kiểm được.
 *
 * Hệ quả: các nhánh LỖI của agent (500 / không chạy) KHÔNG test ở đây — muốn ép
 * agent hỏng thì phải stub, mà stub thì mất luôn giá trị của việc render thật.
 * Chúng thuộc test của agent, không phải của màn này.
 */
/**
 * Có print agent để chạy nhóm TC-IN-* hay không.
 *
 * Agent là net48 + Crystal Reports → CHỈ chạy được trên Windows. Trên macOS/Linux
 * mọi lệnh gọi agent hỏng, FE bung dialog 「印刷エージェントが起動していません」 và
 * nó đè lên dialog 歯管 làm hỏng luôn các testcase phía sau. Nên mặc định suy từ
 * nền tảng thay vì bắt người chạy nhớ đặt cờ.
 *
 * Ép tay khi cần (vd agent chạy ở máy khác, trỏ qua TEST_AGENT_BASE_URL):
 *   TEST_AGENT=1   # buộc CHẠY nhóm TC-IN-*
 *   TEST_AGENT=0   # buộc BỎ QUA, kể cả trên Windows
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

/** Lý do skip, dùng chung cho cả nhóm TC-IN-*. */
const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

/** Phải khớp VITE_AGENT_BASE_URL của web-tenant (lib/env.ts mặc định cổng này). */
const AGENT_BASE_URL = process.env.TEST_AGENT_BASE_URL ?? 'https://127.0.0.1:58247'
/**
 * Độ gắt khi so text bóc từ PDF thật. loose → chữ Hán thiếu chỉ cảnh báo.
 * Xem chú thích trong pdf-content.ts.
 */
const PDF_TEXT_STRICT = (process.env.TEST_PDF_TEXT ?? 'strict') !== 'loose'

const AGENT_RENDER_URL = /\/v1\/render(\?|$)/
const AGENT_PRINT_URL = /\/v1\/print(\?|$)/

/**
 * 帳票ID sau ReportNameNormalizer. KHÁC các màn khác: 文書書式 chọn hẳn file .rpt,
 * nên RPT203001 có HAI id — seed rpt_info: rpt_no 1 → RPT20300101R02.rpt,
 * rpt_no 2 → RPT20300102R02.rpt.
 */
const REPORT_ID_BY_DOC_TYPE: Record<number, string> = {
    0: 'rpt20300101r02', // 初回用
    1: 'rpt20300102r02', // 継続用
}
/** Tên bảng DUY NHẤT của datasource (Lib.RptInpDoc) — dùng chung với 実地指導文書. */
const DS_TABLE = 'RptInpDocTbl'
/** 8 byte đầu của PNG, đã base64. */
const PNG_BASE64_PREFIX = 'iVBORw0KGgo'
/** WinForm in "✓" cho ô tick, rỗng cho ô không tick. */
const CHECK = '✓'

/** Body POST /v1/render — cũng đúng shape FE dùng lại cho /v1/print. */
interface RenderRequestBody {
    reportId: string
    printCategory: number
    dataJson: Record<string, unknown[]>
    useDesignPaper?: boolean
}

/** Một dòng RptInpDocTbl — chỉ các cột frm203021.makeRepInpDocTblData thực gán. */
interface KanriRow {
    trt_dt?: string
    trt_dt_jp: string
    pat_no: number
    pat_nm: string
    clinic_nm: string
    underlying_dis_1: string
    underlying_dis_other: string
    drug: boolean
    drug_other: string
    lifestyle_1: string
    lifestyle_other: string
    etc: string
    pq: number
    swel: boolean
    doyo: boolean
    pkt: boolean
    caries: boolean
    ins_other: string
    oral_func: string
    oral_func_1: string
    oral_func_child: string
    special_note: string
    prev_treat_other: string
    improve_other: string
    plan_treat_other: string
    teeth_cnt: number
    teeth_image?: string
    /** Các cột 実地指導文書 dùng nhưng màn này KHÔNG gán → phải vắng mặt. */
    no?: unknown
    clinic_addr?: unknown
    clinic_tel?: unknown
    clinic_dentist?: unknown
    start_time?: unknown
    plan_text?: unknown
}

/** Envelope chung của mọi /tenant/report/*-datasource. */
interface DatasourceEnvelope {
    success: boolean
    data: { shouldPrint: boolean; renderRequest: RenderRequestBody | null }
}

/** PERM_COUNT / DECI_COUNT của dialog — cũng là số cột se_n / sn_n của BE. */
const PERM_COUNT = 32
const DECI_COUNT = 20
const TOOTH_COUNT = PERM_COUNT + DECI_COUNT
/** SURFACE_COUNT — 4 歯面 mỗi răng (近心/頬側/遠心/口蓋). */
const SURFACE_COUNT = 4

/**
 * viewBox của chart — TOOTH_INFO_PANEL, chính là panel `customPanel1` của WinForm.
 * Không phải con số trang trí: RPT203001 in bitmap này làm lớp dưới.
 */
const CHART_VIEWBOX = '0 0 392 460'
const CHART_W = 392
const CHART_H = 460

/**
 * Bán kính vòng NGOÀI (TOOTH_SIZE_DEFAULTS[size].Ro) và số lượng mong đợi.
 * 永久歯: 1-5 medium (5×4 cung), 6-8 large (3×4); 乳歯: A-C small (3×4),
 * D-E medium (2×4). Nên medium = 20 + 8 = 28.
 */
const OUTER_RADII = [
    { label: 'small (乳歯 A-C)', r: '9.9', count: 12 },
    { label: 'medium (永久歯 1-5 + 乳歯 D-E)', r: '11.3', count: 28 },
    { label: 'large (永久歯 6-8)', r: '13.7', count: 12 },
] as const

/** Vòng TRONG (咬合面) chỉ có ở variant 'nested' = 永久歯 4-8 và 乳歯 D-E. */
const INNER_RADII = [
    { label: 'medium nested (永久歯 4-5 + 乳歯 D-E)', r: '4.48', count: 16 },
    { label: 'large nested (永久歯 6-8)', r: '5.9', count: 12 },
] as const

/** VIEWPORT_MARGIN của DraggableDialog — lề tối thiểu mỗi bên khi mở. */
const VIEWPORT_MARGIN = 8
/** Sai số cho phép khi so kích thước layout (sub-pixel rounding). */
const EPS = 1
/** Màu 歯面: bật = đỏ thuần của WinForm (`_sigaColors[4]`), tắt = trắng. */
const SURF_ON = '#ff0000'
const SURF_OFF = '#ffffff'

// ── nhãn các nhóm (đúng thứ tự designer = thứ tự cột DB) ─────────────────────
const UNDERLYING_DIS = ['高血圧症', '心血管疾患', '呼吸器疾患', '糖尿病', '骨粗鬆症'] as const
const ORAL_FUNC = [
    '口腔衛生状態',
    '口腔乾燥',
    '咬合力',
    '舌口唇運動機能',
    '舌圧',
    '咀嚼機能',
    '嚥下機能',
] as const
const ORAL_FUNC_CHILD = ['咀嚼機能', '嚥下機能', '食行動', '構音機能', '栄養', 'その他'] as const
/** 【これまでの治療】 4 mục + その他. */
const PREV_TREAT_COUNT = 5
/** 【改善目標】 5 mục + その他 (lưới 2 cột × 3 hàng). */
const IMPROVE_COUNT = 6
/** 【治療の予定】 3 + 歯肉炎 + 重症化予防 + 3 con + その他. */
const PLAN_TREAT_COUNT = 9

/**
 * Giá trị nhồi vào form cho TC-SAVE-1 — mỗi trường một giá trị nhận diện được,
 * để soi ngược từng field của payload. Chuỗi có tiền tố E2E để dễ dọn nếu lỡ ghi.
 */
const SAVE_FIXTURE = {
    no: '7',
    /** 文書書式 初回用 → docType 0 (getRadio(rdoDocNew, rdoDocCon)). */
    docTypeLabel: '初回用',
    docType: 0,
    underlyingDisChecked: '高血圧症',
    underlyingDisOther: 'E2E基礎疾患その他',
    drugOther: 'E2E薬剤名',
    lifestyleOther: 'E2E生活習慣',
    etc: 'E2Eその他',
    /** 4mm以上の歯周ポケット → 有 = 1. */
    insPocket: 1,
    /** プラーク・歯石: 多い → getRadio trả INDEX của {無, 少ない, 多い} → 2. */
    pq: 2,
    /** むし歯 有 → 1. */
    caries: 1,
    insOther: 'E2E口腔その他',
    oralFuncChecked: '口腔衛生状態',
    oralFuncChildChecked: '食行動',
    specialNote: 'E2E特記事項',
    prevTreatChecked: 'ブリッジ',
    prevTreatOther: 'E2Eこれまでの治療',
    improveChecked: '喫煙習慣',
    improveOther: 'E2E改善目標',
    planTreatChecked: '歯肉炎・歯周炎の治療',
    planTreatOther: 'E2E治療の予定',
    /** 本数 — WinForm lưu luôn 0; commit này sửa nên payload PHẢI là 28. */
    toothCnt: '28',
} as const

/** Body POST /tenant/chiryo-kanri-r2 — chỉ các field testcase soi tới. */
interface SaveBody {
    patNo: number
    printDt: string
    no: string | null
    docType: number
    underlyingDis: boolean[]
    underlyingDisOther: string
    drug: boolean
    drugOther: string
    lifestyle: boolean[]
    lifestyleOther: string
    etc: string
    insPocket: number
    insDoyo: number
    insSwelling: number
    pq: number
    caries: number
    insOther: string
    oralFunc: boolean[]
    oralFuncChild: boolean[]
    specialNote: string
    prevTreat: boolean[]
    prevTreatOther: string
    improve: boolean[]
    improveOther: string
    planTreat: boolean[]
    planTreatOther: string
    perm: { present: boolean; surfaces: boolean[] }[]
    deci: { present: boolean; surfaces: boolean[] }[]
    toothCnt: number
}

/** Body POST /tenant/chiryo-kanri-r2/initial — paramData lấy từ lưới. */
interface InitialBody {
    patNo: number
    printDt: string
    toothFlg: number[]
    plaqueUpper: string
    plaqueLower: string
}

/** Đóng SanteiConfirmDialog 「…を算定しますか？」 do AutoSantei bung ra (đè lên dialog). */
async function installSanteiAutoClose(page: Page) {
    await page.addLocatorHandler(
        page.getByText(/を算定しますか？/).first(),
        async () => {
            await page
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click()
        },
        { times: 20 },
    )
}

/** Mở dialog 歯管 và chờ hiện. */
async function openDialog(page: Page, dialog: Locator) {
    // 「歯管」 KHÁC 「補管・義歯」 và 「歯管理」 — exact để không bắt nhầm.
    await page.getByRole('button', { name: '歯管', exact: true }).click()
    await expect(dialog).toBeVisible({ timeout: 30000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('歯管 — 歯科疾患管理 dialog (frm203021)', () => {
    let page: Page
    let step: () => Promise<void>

    let dialog: Locator
    /**
     * Khối chứa một nhãn = CHA của phần tử mang đúng text đó.
     *
     * KHÔNG dùng `locator('div').filter({ has: ... }).last()`: `has` khớp cả
     * CHÍNH phần tử lẫn hậu duệ, nên `.last()` rơi trúng đúng div tiêu đề (rỗng
     * ruột) chứ không phải khối bao ngoài.
     */
    let boxOf: (text: string) => Locator
    /** Hàng No. — chứa 4 textbox: No. / 年 / 月 / 日 và select 元号. */
    let noRow: Locator
    /** SVG chart = svg DUY NHẤT chứa foreignObject (ô 本数). */
    let chartSvg: Locator
    /** Combo 過去の記録 — nằm cùng hàng với caption 【口腔内の状態】. */
    let history: Locator

    /** Body POST /initial bắt được lúc mở dialog lần đầu (TC-OPEN-1 ghi vào). */
    let sentInitial: InitialBody | null = null

    // ── Trạng thái luồng in, chia sẻ giữa các testcase TC-IN-* ────────────────
    /** Body /v1/render FE gửi đi, chụp TRƯỚC khi test chèn forcePreview. */
    let sentRenderReq: RenderRequestBody | null = null
    /** Dòng RptInpDocTbl bóc từ body /v1/render của TC-IN-1. */
    let sentRow: KanriRow | null = null

    /** Preview dialog của agent — tiêu đề do ja.printPreviewTitle dựng. */
    let previewDialog: Locator
    /** File PDF agent vừa render (TC-IN-4 tải về) — TC-IN-5 soi nội dung. */
    let renderedPdf: Buffer | null = null

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)
        await installSanteiAutoClose(page)

        // Không có agent thì mọi lệnh gọi tới nó đều hỏng. Prewarm nuốt lỗi im
        // lặng, nhưng nếu có đường nào khác bung 「印刷エージェントが起動していません」
        // thì dialog đó nổi ĐÈ lên dialog 歯管 và nuốt mọi click — hỏng dây chuyền
        // các testcase phía sau (đúng thứ đã xảy ra khi chạy trên macOS). Tự bấm
        // キャンセル để nó không bao giờ chặn được ai.
        if (!AGENT_AVAILABLE) {
            await page.addLocatorHandler(
                page.getByText('印刷エージェントが起動していません').first(),
                async () => {
                    await page.getByRole('button', { name: 'キャンセル' }).first().click()
                },
                { times: 20 },
            )
        }

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
            waitUntil: 'domcontentloaded',
        })
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({
            timeout: 60000,
        })

        dialog = page.getByRole('dialog').filter({ hasText: '【歯科疾患管理に係わる管理計画書】' })
        boxOf = (text: string) => dialog.getByText(text, { exact: true }).locator('..')
        noRow = boxOf('No.')
        chartSvg = dialog.locator('svg:has(foreignObject)')
        history = boxOf('【口腔内の状態】').getByRole('combobox')
        previewDialog = page
            .getByRole('dialog')
            .filter({ hasText: '歯科疾患管理に係わる管理計画書プレビュー' })

        // ─── Ép preview cho MỌI /v1/render ────────────────────────────────────
        // RPT203001 là 帳票 mới nên chưa có dòng print_mapping nào; agent tính
        //     preview = req.ForcePreview || (mapping?.Preview ?? false)
        // → mapping == null ⇒ preview=false ⇒ FE in thẳng, không có PDF để soi.
        // Cấu hình "luôn bật preview" là THEO TỪNG 帳票, nên phụ thuộc vào nó thì
        // test xanh/đỏ theo máy. `forcePreview` là cờ override có sẵn của agent
        // (レセプト dùng nó để luôn xem trước) — bật ở đây để suite tự lo.
        //
        // KHÔNG làm giả dữ liệu: agent vẫn render PDF thật từ .rpt thật với
        // datasource thật, chỉ đổi "hiện lên màn hình" thay vì "đẩy xuống spooler".
        // Body GỐC được chụp lại trước khi ghi đè, nên assert FE pass-through ở
        // TC-IN-1 vẫn soi đúng cái FE gửi.
        await page.route(AGENT_RENDER_URL, async (route: Route) => {
            const original = route.request().postDataJSON() as RenderRequestBody
            sentRenderReq = original
            await route.continue({
                postData: JSON.stringify({ ...original, forcePreview: true }),
            })
        })

        // ─── Lưới an toàn: không bao giờ để job xuống spooler ─────────────────
        // Suite này chỉ soi PREVIEW nên không bấm F1 印刷 ở đâu cả — /v1/print lẽ
        // ra không được gọi. Chặn nó là bảo hiểm cho trường hợp print_mapping bị
        // tắt preview: khi đó FE in thẳng, job xuống spooler Windows, và nếu máy
        // in mặc định là "Microsoft Print to PDF" thì driver bung hộp thoại
        // "Save Print Output As" của Windows shell. Playwright KHÔNG điều khiển
        // được hộp thoại ngoài trình duyệt → nó treo và chặn cả suite.
        //
        // Đây là endpoint DUY NHẤT bị chặn; /v1/render, SSE và PDF tạm vẫn đi qua
        // agent thật, nên phần Crystal dựng tờ giấy vẫn được kiểm nguyên vẹn.
        await page.route(AGENT_PRINT_URL, async (route: Route) => {
            await route.fulfill({
                status: 202,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ jobId: '00000000-0000-4000-8000-000000000000' }),
            })
        })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('TC-OPEN-1 — mở bằng nút 歯管, POST /initial mang đúng paramData của lưới', async () => {
        const initialReq = page.waitForRequest(
            (req) => INITIAL_URL.test(req.url()) && req.method() === 'POST',
            { timeout: 60000 },
        )
        await openDialog(page, dialog)

        sentInitial = (await initialReq).postDataJSON() as InitialBody
        expect(sentInitial.patNo, 'patNo phải là bệnh nhân đang mở').toBe(PAT_NO_NUM)
        // printDt = ngày của DÒNG đang focus (getFocusDt) trong tháng của trtDt →
        // ngày có thể khác TRT_DT, nhưng tháng thì không.
        expect(sentInitial.printDt, 'printDt phải là ISO yyyy-MM-dd').toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(sentInitial.printDt.slice(0, 7), 'printDt phải nằm trong tháng của trtDt').toBe(
            TRT_DT.slice(0, 7),
        )
        // toothFlg là vector 32 ô 部位 của dòng focus; không có dòng nào thì ZERO_BUI.
        expect(sentInitial.toothFlg, 'toothFlg phải đủ 32 ô').toHaveLength(PERM_COUNT)
        expect(typeof sentInitial.plaqueUpper).toBe('string')
        expect(typeof sentInitial.plaqueLower).toBe('string')
        console.log(
            `initial: printDt=${sentInitial.printDt}, 部位 khác 0 = ` +
                `${sentInitial.toothFlg.filter((v) => v !== 0).length}/32, ` +
                `プラーク lines = ${[sentInitial.plaqueUpper, sentInitial.plaqueLower].filter(Boolean).length}`,
        )
        await step()
    })

    test('TC-OPEN-2 — các khối chính của form đều có mặt', async () => {
        await expect(dialog.getByText('【歯科疾患管理に係わる管理計画書】')).toBeVisible()
        await expect(dialog.getByText('【口腔内の状態】')).toBeVisible()
        await expect(dialog.getByText('【基礎疾患】')).toBeVisible()
        await expect(dialog.getByText('【服薬】')).toBeVisible()
        await expect(dialog.getByText('【生活習慣】')).toBeVisible()
        await expect(dialog.getByText('【歯や歯肉の状態】')).toBeVisible()
        await expect(dialog.getByText('【口腔機能の問題】')).toBeVisible()
        await expect(dialog.getByText('【小児口腔機能の問題】')).toBeVisible()
        await expect(dialog.getByText('【その他・特記事項】')).toBeVisible()
        await expect(dialog.getByText('【これまでの治療】')).toBeVisible()
        await expect(dialog.getByText('【改善目標】')).toBeVisible()
        await expect(dialog.getByText('【治療の予定】')).toBeVisible()
        // Tên bệnh nhân kèm 「様」.
        await expect(dialog.getByText('様', { exact: true })).toBeVisible()
        await step()
    })

    test('TC-LAYOUT-1 — dialog vừa cửa sổ và KHÔNG phải cuộn khi vừa mở', async () => {
        // Dialog khai 1200×880 (đã kẹp thêm bằng window.innerHeight - 40 để hàng
        // F-key không rơi ra ngoài); DraggableDialog kẹp lần nữa theo
        // VIEWPORT_MARGIN. Mục tiêu của lần nới size: body KHÔNG sinh thanh cuộn
        // lúc khởi tạo.
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

    test('TC-LAYOUT-2 — caption 【…】 nằm CÙNG HÀNG với control, không rớt dòng', async () => {
        // Đây là chính nội dung commit layout: caption ở cột trái cố định
        // (shrink-0, whitespace-nowrap), control ở cột phải co giãn (min-w-0
        // flex-1). Nếu ai đó bỏ w-[68px]/w-[108px] hay bỏ nowrap thì caption sẽ
        // rớt xuống dòng riêng — bắt bằng "caption phải nằm BÊN TRÁI control và
        // chồng nhau theo chiều dọc".
        const rows = [
            '【基礎疾患】',
            '【服薬】',
            '【生活習慣】',
            '【その他・特記事項】',
            '【これまでの治療】',
            '【改善目標】',
            '【治療の予定】',
            '【むし歯】',
        ] as const

        for (const label of rows) {
            const caption = dialog.getByText(label, { exact: true })
            await expect(caption, `${label}: không thấy caption`).toBeVisible()
            const cap = await caption.boundingBox()
            // Control column = phần tử anh em kế tiếp trong cùng hàng.
            const ctrl = await caption.locator('xpath=following-sibling::*[1]').boundingBox()
            expect(cap, `${label}: không đo được caption`).not.toBeNull()
            expect(ctrl, `${label}: caption không có control nào bên cạnh`).not.toBeNull()
            if (!cap || !ctrl) continue

            expect(
                cap.x + cap.width,
                `${label}: caption KHÔNG nằm bên trái control (đã rớt dòng?)`,
            ).toBeLessThanOrEqual(ctrl.x + EPS)
            // Chồng nhau theo chiều dọc = cùng một hàng.
            const overlap =
                Math.min(cap.y + cap.height, ctrl.y + ctrl.height) - Math.max(cap.y, ctrl.y)
            expect(overlap, `${label}: caption và control không cùng hàng`).toBeGreaterThan(0)
        }
        await step()
    })

    test('TC-LAYOUT-3 — 【口腔内の状態】 và combo 履歴 cùng một hàng, ngay trên chart', async () => {
        // WinForm đặt customLabel18 và cboHistory cạnh nhau trên hàng phía trên
        // panel 歯式 — commit layout dời combo về đúng đó.
        const caption = dialog.getByText('【口腔内の状態】', { exact: true })
        const cap = await caption.boundingBox()
        const combo = await history.boundingBox()
        const chart = await chartSvg.boundingBox()
        expect(cap).not.toBeNull()
        expect(combo).not.toBeNull()
        expect(chart).not.toBeNull()
        if (!cap || !combo || !chart) return

        expect(cap.x + cap.width, 'caption không nằm bên trái combo 履歴').toBeLessThanOrEqual(
            combo.x + EPS,
        )
        const overlap =
            Math.min(cap.y + cap.height, combo.y + combo.height) - Math.max(cap.y, combo.y)
        expect(overlap, 'caption và combo 履歴 không cùng hàng').toBeGreaterThan(0)
        expect(combo.y + combo.height, 'combo 履歴 phải nằm TRÊN chart').toBeLessThanOrEqual(
            chart.y + EPS,
        )
        await step()
    })

    test('TC-DOC-1 — 文書書式 mặc định 継続用 (carry-forward KHÔNG kế thừa 文書書式)', async () => {
        // WinForm makeCombo chỉ chép các mục lâm sàng sang form trắng; 文書書式 giữ
        // nguyên mặc định 継続用 dù bệnh nhân đã có bản ghi cũ. Đây là điểm dễ port
        // sai (chép luôn cả docType).
        const first = dialog.getByRole('radio', { name: '初回用' })
        const cont = dialog.getByRole('radio', { name: '継続用' })
        await expect(cont, '文書書式 mặc định phải là 継続用').toBeChecked()
        await expect(first).not.toBeChecked()

        await first.click()
        await expect(first).toBeChecked()
        await expect(cont).not.toBeChecked()
        await step()
    })

    test('TC-NO-1 — No. chỉ nhận chữ số', async () => {
        // onChange lọc [^0-9] ngay khi gõ (maxLength 5).
        const no = noRow.getByRole('textbox').nth(0)
        await no.fill('')
        await no.pressSequentially('a1b2c3')
        await expect(no).toHaveValue('123')
        await step()
    })

    test('TC-DATE-1 — 印刷日 (EraDateField) seed từ printDt của lưới', async () => {
        // textbox theo thứ tự DOM: No. → 年 → 月 → 日.
        const boxes = noRow.getByRole('textbox')
        await expect(boxes).toHaveCount(4)

        for (const i of [1, 2, 3]) {
            await expect(boxes.nth(i), `ô thứ ${i} của 印刷日 bị rỗng`).not.toHaveValue('')
        }
        // 元号 select cũng phải có giá trị (mặc định 令和).
        await expect(noRow.getByRole('combobox')).not.toHaveText('')

        // Cùng tháng với trtDt (ngày thì theo dòng đang focus).
        expect(Number(await boxes.nth(2).inputValue()), '月 lệch so với trtDt').toBe(
            Number(TRT_DT.slice(5, 7)),
        )
        await step()
    })

    test('TC-CHART-1 — vẽ CẢ 永久歯 lẫn 乳歯: 52 răng × 4 歯面', async () => {
        // Khác 実地指１ (chỉ 32): frm203021 route từng ô 部位 sang một trong hai vòng
        // nên phải vẽ đủ 32 + 20.
        await expect(chartSvg).toHaveAttribute('viewBox', CHART_VIEWBOX)
        await expect(chartSvg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
        expect(await chartSvg.getAttribute('width'), 'SVG không được đặt width cứng').toBeNull()
        expect(await chartSvg.getAttribute('height'), 'SVG không được đặt height cứng').toBeNull()

        await expect(chartSvg.locator('[data-tooth]')).toHaveCount(TOOTH_COUNT)
        await expect(chartSvg.locator('[data-face]')).toHaveCount(TOOTH_COUNT * SURFACE_COUNT)

        // data-tooth ở chart này là KHOÁ chuỗi và phải duy nhất trên cả hai vòng.
        const keys = await chartSvg
            .locator('[data-tooth]')
            .evaluateAll((els) => els.map((e) => e.getAttribute('data-tooth') ?? ''))
        expect(new Set(keys).size, 'data-tooth bị trùng giữa 永久歯 và 乳歯').toBe(TOOTH_COUNT)
        for (const key of ['UR-8', 'UL-1', 'LR-8', 'LL-1', 'UR-E', 'UL-A', 'LR-E', 'LL-A']) {
            expect(keys, `thiếu răng ${key}`).toContain(key)
        }

        // Tỉ lệ đúng viewBox (cung răng dựng đứng).
        const box = await chartSvg.boundingBox()
        expect(box).not.toBeNull()
        if (box) {
            expect(box.height / box.width, 'chart phải cao hơn rộng').toBeCloseTo(
                CHART_H / CHART_W,
                1,
            )
        }
        await step()
    })

    test('TC-CHART-2 — 3 cỡ vòng ngoài + vòng trong chỉ ở răng 臼歯 / D-E', async () => {
        for (const size of OUTER_RADII) {
            await expect(
                chartSvg.locator(`circle[r="${size.r}"]`),
                `vòng ngoài ${size.label}`,
            ).toHaveCount(size.count)
        }
        for (const size of INNER_RADII) {
            await expect(
                chartSvg.locator(`circle[r="${size.r}"]`),
                `vòng trong ${size.label}`,
            ).toHaveCount(size.count)
        }
        const inner = INNER_RADII.reduce((n, s) => n + s.count, 0)
        await expect(
            chartSvg.locator('circle'),
            'tổng vòng tròn = 52 vòng ngoài + vòng trong',
        ).toHaveCount(TOOTH_COUNT + inner)
        await step()
    })

    test('TC-CHART-3 — 歯面 có plaque tô đỏ, còn lại nền trắng', async () => {
        const on = chartSvg.locator('[data-face][data-on="true"]')
        const nOn = await on.count()
        const present = await chartSvg.locator('[data-tooth][data-present="true"]').count()
        console.log(`chart: ${present}/${TOOTH_COUNT} răng hiện diện, ${nOn} 歯面 có plaque`)

        await expect(chartSvg.locator('[data-face][data-on="false"]').first()).toHaveAttribute(
            'fill',
            SURF_OFF,
        )
        if (nOn === 0) {
            console.log(`ngày ${TRT_DT} của BN ${PAT_NO} không có プラーク → BỎ QUA phần tô đỏ`)
            return
        }
        await expect(on.first()).toHaveAttribute('fill', SURF_ON)
        await step()
    })

    test('TC-CHART-4 — READ-ONLY: bấm 歯面 không đổi gì (SelectMode=false)', async () => {
        // WinForm dựng mọi tooth model với SelectMode=false → CustomPie vẽ theo
        // dữ liệu và bỏ qua click. 歯面 chỉ sửa được ở dialog PCR (frm203030).
        const quarter = chartSvg.locator('[data-face]').first()
        const beforeOn = await quarter.getAttribute('data-on')
        const beforeFill = await quarter.getAttribute('fill')

        await quarter.click({ force: true }) // force: path rỗng không có hit-area
        await step()

        await expect(quarter).toHaveAttribute('data-on', beforeOn ?? 'false')
        await expect(quarter).toHaveAttribute('fill', beforeFill ?? SURF_OFF)
    })

    test('TC-CHART-5 — 本数 là control DUY NHẤT sửa được trong chart', async () => {
        const toothCnt = dialog.getByLabel('本数')
        await expect(toothCnt).toBeVisible()
        await toothCnt.fill('28')
        await expect(toothCnt).toHaveValue('28')
        await step()
    })

    test('TC-FORM-1 — 【基礎疾患】 5 mục + その他 (kèm ô text)', async () => {
        const box = boxOf('【基礎疾患】')
        const boxes = box.getByRole('checkbox')
        await expect(boxes).toHaveCount(UNDERLYING_DIS.length + 1)

        for (const label of UNDERLYING_DIS) {
            await expect(box.getByRole('checkbox', { name: label }), label).toBeVisible()
        }
        const first = box.getByRole('checkbox', { name: UNDERLYING_DIS[0] })
        const was = await first.isChecked()
        await first.click()
        await expect(first).toBeChecked({ checked: !was })
        await first.click()
        await expect(first).toBeChecked({ checked: was })

        await box.getByRole('textbox').fill('E2E基礎疾患')
        await expect(box.getByRole('textbox')).toHaveValue('E2E基礎疾患')
        await step()
    })

    test('TC-FORM-2 — 【服薬】 有/無 + 薬剤名, 【生活習慣】 喫煙/その他', async () => {
        const drug = boxOf('【服薬】')
        await expect(drug.getByRole('radio')).toHaveCount(2)
        await expect(drug.getByText('薬剤の種類・薬剤名')).toBeVisible()
        await drug.getByRole('radio', { name: '有' }).click()
        await expect(drug.getByRole('radio', { name: '有' })).toBeChecked()
        await expect(drug.getByRole('radio', { name: '無' })).not.toBeChecked()
        await drug.getByRole('textbox').fill('E2E薬剤')

        const life = boxOf('【生活習慣】')
        await expect(life.getByRole('checkbox')).toHaveCount(2)
        // Toggle TƯƠNG ĐỐI so với trạng thái ban đầu, không giả định "chưa tick".
        // carry-forward điền sẵn form từ bản ghi gần nhất ≤ 印刷日, nên 喫煙 hoàn
        // toàn có thể đã bật khi dialog vừa mở (TC-FORM-1 vốn đã làm đúng cách).
        const smoke = life.getByRole('checkbox', { name: '喫煙' })
        const smokeWas = await smoke.isChecked()
        await smoke.click()
        await expect(smoke).toBeChecked({ checked: !smokeWas })
        await smoke.click()
        await expect(smoke).toBeChecked({ checked: smokeWas })
        await step()
    })

    test('TC-FORM-3 — 【歯や歯肉の状態】: 3 hàng 有/無 + プラーク 3 mức + むし歯', async () => {
        for (const label of [
            '4mm以上の歯周ポケット',
            '歯の動揺',
            '歯肉の炎症(発赤・出血・腫れ)',
        ] as const) {
            const row = boxOf(label)
            await expect(row.getByRole('radio'), `${label}: phải có đúng 2 lựa chọn`).toHaveCount(2)
            await row.getByRole('radio', { name: '有' }).click()
            await expect(row.getByRole('radio', { name: '有' })).toBeChecked()
            await expect(row.getByRole('radio', { name: '無' })).not.toBeChecked()
        }

        // プラーク・歯石の付着状況: 多い / 少ない / 無 (thứ tự HIỂN THỊ; giá trị lưu là
        // index của {無, 少ない, 多い} nên 多い = 2 — soi ở TC-SAVE-1).
        const pq = boxOf('プラーク・歯石の付着状況')
        await expect(pq.getByRole('radio')).toHaveCount(3)
        for (const label of ['多い', '少ない', '無'] as const) {
            await expect(pq.getByRole('radio', { name: label }), label).toBeVisible()
        }
        await pq.getByRole('radio', { name: '多い' }).click()
        await expect(pq.getByRole('radio', { name: '多い' })).toBeChecked()

        const caries = boxOf('【むし歯】')
        await expect(caries.getByRole('radio')).toHaveCount(2)
        await caries.getByRole('radio', { name: '有' }).click()
        await expect(caries.getByRole('radio', { name: '有' })).toBeChecked()
        await step()
    })

    test('TC-FORM-4 — 【口腔機能の問題】 7 mục + 【小児口腔機能の問題】 6 mục', async () => {
        const panel = boxOf('【口腔機能の問題】')
        // 咀嚼機能 / 嚥下機能 có ở CẢ hai nhóm → phải bó theo từng khối con, không
        // đếm phẳng trên cả panel.
        const parent = panel.locator('> div').nth(0)
        const child = boxOf('【小児口腔機能の問題】')

        await expect(parent.getByRole('checkbox')).toHaveCount(ORAL_FUNC.length)
        await expect(child.getByRole('checkbox')).toHaveCount(ORAL_FUNC_CHILD.length)

        // Toggle một mục có tên DUY NHẤT ở mỗi nhóm, tương đối với trạng thái ban
        // đầu — carry-forward có thể đã bật sẵn chúng (xem TC-FORM-2). Bật/tắt
        // rồi trả về nguyên trạng để không ảnh hưởng testcase sau.
        const hygiene = parent.getByRole('checkbox', { name: '口腔衛生状態' })
        const hygieneWas = await hygiene.isChecked()
        await hygiene.click()
        await expect(hygiene).toBeChecked({ checked: !hygieneWas })
        await hygiene.click()
        await expect(hygiene).toBeChecked({ checked: hygieneWas })

        const eating = child.getByRole('checkbox', { name: '食行動' })
        const eatingWas = await eating.isChecked()
        await eating.click()
        await expect(eating).toBeChecked({ checked: !eatingWas })
        await eating.click()
        await expect(eating).toBeChecked({ checked: eatingWas })
        await step()
    })

    test('TC-FORM-5 — 【これまでの治療】/【改善目標】/【治療の予定】 đủ số ô', async () => {
        await expect(boxOf('【これまでの治療】').getByRole('checkbox')).toHaveCount(
            PREV_TREAT_COUNT,
        )
        await expect(boxOf('【改善目標】').getByRole('checkbox')).toHaveCount(IMPROVE_COUNT)
        await expect(boxOf('【治療の予定】').getByRole('checkbox')).toHaveCount(PLAN_TREAT_COUNT)

        // 重症化予防 và 3 mục con thụt lề của nó.
        const plan = boxOf('【治療の予定】')
        await expect(
            plan.getByRole('checkbox', {
                name: '歯科疾患の重症化予防のため、以下の治療や管理をします',
            }),
        ).toBeVisible()
        for (const label of [
            '定期的な歯周病の治療と管理',
            '定期的なむし歯の管理',
            '継続的な口腔機能の管理',
        ] as const) {
            await expect(plan.getByRole('checkbox', { name: label }), label).toBeVisible()
        }
        await step()
    })

    test('TC-FORM-6 — 【その他・特記事項】 là textarea nhập được', async () => {
        const note = boxOf('【その他・特記事項】').getByRole('textbox')
        await note.fill('E2E特記事項テキスト')
        await expect(note).toHaveValue('E2E特記事項テキスト')
        await step()
    })

    // ═══ F9 印刷 — datasource → agent thật → PDF ════════════════════════════
    // WinForm frm203021.btnF9_Click gọi THẲNG printProc: KHÔNG check ngày và
    // KHÔNG confirm — khác F8 (Q00001) và khác cả F9 của 実地指導文書.
    // Agent chạy thật, nên chuỗi này đi hết: BE dựng datasource → /v1/render →
    // preview → tải PDF về soi nội dung.

    test('TC-IN-1 — F9 印刷: BE dựng datasource, FE đẩy nguyên xi sang agent', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        await fillSaveForm()

        const f9 = dialog.getByRole('button', { name: 'F9 印刷' })
        await expect(f9).toBeEnabled()

        // Prewarm (reportOnly=true) cũng gọi đúng URL này lúc mở dialog và mỗi
        // lần đổi 文書書式 → lọc theo body để không bắt nhầm.
        const datasourceResp = page.waitForResponse(
            (r) => {
                if (!PRINT_URL.test(r.url()) || r.request().method() !== 'POST') return false
                const body = r.request().postDataJSON() as Record<string, unknown>
                return body.reportOnly !== true
            },
            { timeout: 60000 },
        )
        const renderResp = page.waitForResponse(AGENT_RENDER_URL, { timeout: 60000 })
        await f9.click()

        const resp = await datasourceResp
        // patNo đi ở ROUTE ([FromRoute]), không nằm trong body.
        expect(resp.url(), 'patNo phải là bệnh nhân đang mở').toContain(
            `/tenant/report/${PAT_NO_NUM}/chiryo-kanri-datasource`,
        )
        const envelope = (await resp.json()) as DatasourceEnvelope
        expect(envelope.success, 'BE trả lỗi khi dựng datasource').toBe(true)
        expect(envelope.data.shouldPrint, 'màn này luôn shouldPrint=true').toBe(true)
        expect(envelope.data.renderRequest, 'thiếu renderRequest').not.toBeNull()

        const built = envelope.data.renderRequest!
        // 文書書式 quyết định .rpt — fillSaveForm chọn 初回用 → rpt_no 1.
        expect(built.reportId, '帳票ID phải theo 文書書式').toBe(
            REPORT_ID_BY_DOC_TYPE[SAVE_FIXTURE.docType],
        )
        expect(typeof built.printCategory, 'printCategory lấy từ rpt_info.prt_no').toBe('number')
        expect(Object.keys(built.dataJson), 'datasource chỉ có 1 bảng').toEqual([DS_TABLE])
        expect(built.dataJson[DS_TABLE], 'printProc emit đúng 1 dòng').toHaveLength(1)

        // FE là pass-through thuần: body gửi agent PHẢI y hệt cái BE trả về.
        // Dùng bản GỐC route chụp được, không phải bản đã chèn forcePreview.
        await expect
            .poll(() => sentRenderReq, { timeout: 60000, message: 'FE không gọi /v1/render' })
            .not.toBeNull()
        const sent = sentRenderReq!
        expect(sent, 'FE sửa datasource trước khi gửi agent').toEqual(built)

        sentRow = sent.dataJson[DS_TABLE]![0] as KanriRow

        // forcePreview ở beforeAll đảm bảo agent luôn trả preview=true. Nếu không
        // thì agent đã bỏ qua cờ override — hỏng ở tầng agent, không phải màn này.
        const rendered = (await (await renderResp).json()) as { preview?: boolean }
        expect(rendered.preview, 'agent bỏ qua forcePreview → không có PDF để soi').toBe(true)
        await step()
    })

    test('TC-IN-2 — RptInpDocTbl: từng cột khớp form + 医院マスタ', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        // ── 日付 ──────────────────────────────────────────────────────────────
        const era = (await noRow.getByRole('combobox').textContent())?.trim() ?? ''
        const ymd = await Promise.all(
            [1, 2, 3].map((i) => noRow.getByRole('textbox').nth(i).inputValue()),
        )
        const [y, m, d] = [ymd[0]!, ymd[1]!, ymd[2]!]
        const iso = /^(\d{4})-(\d{2})-(\d{2})T00:00:00/.exec(String(row.trt_dt))
        expect(iso, `trt_dt phải là DateTime nửa đêm, nhận "${row.trt_dt}"`).not.toBeNull()
        expect(Number(iso![2]), 'trt_dt lệch tháng so với form').toBe(Number(m))
        expect(Number(iso![3]), 'trt_dt lệch ngày so với form').toBe(Number(d))
        expect(row.trt_dt_jp.replace(/\s+/g, ' ').trim()).toBe(
            `${era} ${Number(y)} 年 ${Number(m)} 月 ${Number(d)} 日`,
        )

        // ── 患者 / 医院 ────────────────────────────────────────────────────────
        expect(row.pat_no).toBe(PAT_NO_NUM)
        expect(typeof row.pat_nm).toBe('string')
        expect(typeof row.clinic_nm).toBe('string')
        // Khác 実地指導文書: form này CHỈ in 医院名. makeRepInpDocTblData không gán
        // clinic_addr / clinic_tel / clinic_dentist, cũng không gán cột `no`.
        for (const key of ['no', 'clinic_addr', 'clinic_tel', 'clinic_dentist'] as const) {
            expect(row[key], `${key} không được xuất hiện (WinForm để null)`).toBeUndefined()
        }
        for (const key of ['start_time', 'plan_text'] as const) {
            expect(row[key], `${key} là cột của 実地指導文書, màn này không gán`).toBeUndefined()
        }

        // ── Checkbox: WinForm in "✓" / rỗng, KHÔNG phải boolean ────────────────
        expect(row.underlying_dis_1, '【基礎疾患】 ô đã tick phải là "✓"').toBe(CHECK)
        expect(row.underlying_dis_other).toBe(SAVE_FIXTURE.underlyingDisOther)
        expect(row.lifestyle_1, '【生活習慣】喫煙 đã tick').toBe(CHECK)
        expect(row.lifestyle_other).toBe(SAVE_FIXTURE.lifestyleOther)
        expect(row.etc).toBe(SAVE_FIXTURE.etc)

        // ── 服薬: cột boolean DUY NHẤT của form này ─────────────────────────────
        expect(row.drug, '服薬 有 → true').toBe(true)
        expect(row.drug_other).toBe(SAVE_FIXTURE.drugOther)

        // ── 歯や歯肉の状態: pq là số 0/1/2; 4 cột còn lại là boolean ─────────────
        expect(row.pq, 'pq = INDEX của {無, 少ない, 多い}').toBe(SAVE_FIXTURE.pq)
        expect(row.pkt, '4mm以上の歯周ポケット 有 → true').toBe(true)
        expect(row.caries, 'むし歯 有 → true').toBe(true)
        expect(typeof row.swel).toBe('boolean')
        expect(typeof row.doyo).toBe('boolean')
        expect(row.ins_other).toBe(SAVE_FIXTURE.insOther)

        // ── 口腔機能: ô "特に問題なし" chỉ tick khi KHÔNG mục con nào được tick ──
        expect(row.oral_func_1, '口腔衛生状態 đã tick').toBe(CHECK)
        expect(row.oral_func, 'có mục con được tick → oral_func phải rỗng').toBe('')
        expect(row.oral_func_child, 'có mục con được tick → phải rỗng').toBe('')

        // ── Các khối text còn lại ─────────────────────────────────────────────
        expect(row.special_note).toBe(SAVE_FIXTURE.specialNote)
        expect(row.prev_treat_other).toBe(SAVE_FIXTURE.prevTreatOther)
        expect(row.improve_other).toBe(SAVE_FIXTURE.improveOther)
        expect(row.plan_treat_other).toBe(SAVE_FIXTURE.planTreatOther)

        expect(row.teeth_cnt).toBe(Number(SAVE_FIXTURE.toothCnt))
        await step()
    })

    test('TC-IN-3 — teeth_image: PNG base64 của chính chart 歯式', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const image = sentRow!.teeth_image

        // BE chỉ gán cột khi FE gửi PNG hợp lệ (TryFromBase64String + chữ ký PNG);
        // hỏng thì BỎ cột và khung 歯式 in rỗng — không phải lỗi cứng.
        expect(image, 'thiếu teeth_image → khung 歯式 sẽ in rỗng').toBeTruthy()
        expect(image, 'teeth_image phải là base64 TRẦN, không có tiền tố data:').not.toMatch(
            /^data:/,
        )
        expect(image!.startsWith(PNG_BASE64_PREFIX), 'teeth_image không phải PNG').toBe(true)

        const bytes = Math.floor((image!.length * 3) / 4)
        expect(bytes, 'teeth_image nhỏ bất thường — có thể chụp trượt chart').toBeGreaterThan(1000)
        expect(bytes, 'teeth_image vượt trần 2MB của BE').toBeLessThan(2 * 1024 * 1024)
        console.log(`teeth_image: ~${Math.round(bytes / 1024)} KB PNG`)
        await step()
    })

    test('TC-IN-4 — preview: agent render xong, iframe trỏ đúng PDF vừa dựng', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        await expect(previewDialog, 'agent bật preview thì phải hiện dialog xem trước').toBeVisible(
            {
                timeout: 60000,
            },
        )

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

        const name = `${REPORT_ID_BY_DOC_TYPE[SAVE_FIXTURE.docType]}.pdf`
        await test.info().attach(name, { body: pdf, contentType: 'application/pdf' })
        renderedPdf = pdf
        console.log(`agent đã xuất PDF ${pdf.length} byte`)
        await step()
    })

    test('TC-IN-5 — nội dung PDF: từng giá trị của datasource phải lên giấy', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(renderedPdf, 'TC-IN-4 chưa tải được PDF').not.toBeNull()
        expect(sentRow, 'TC-IN-1 chưa bắt được datasource').not.toBeNull()
        const row = sentRow!

        const pdf = await readPdf(renderedPdf!)
        await test.info().attach('pdf-text.txt', { body: pdf.text, contentType: 'text/plain' })

        // ── 歯式イメージ: PNG đã nhúng vào khung 歯式 chưa ──────────────────────
        expect(pdf.images.length, 'PDF không có ảnh nhúng → khung 歯式 in rỗng').toBeGreaterThan(0)
        if (pdf.imagesFromRawScan) {
            console.log('CẢNH BÁO: không bóc được kích thước ảnh, chỉ biết PDF CÓ ảnh')
        } else {
            // Chart giữ nguyên tỉ lệ viewBox 392×460 khi rasterise.
            const biggest = pdf.images[0]!
            expect(
                biggest.width / biggest.height,
                `ảnh 歯式 sai tỉ lệ (${biggest.width}×${biggest.height})`,
            ).toBeCloseTo(CHART_W / CHART_H, 1)
        }

        // ── Nội dung: mọi giá trị TEXT của datasource phải tìm thấy trên giấy ──
        // So với chính `sentRow` → khép kín vòng form → datasource → giấy.
        // Bỏ qua teeth_cnt và các cột "✓": số trần / dấu tick trùng lặp khắp tờ
        // giấy nên assert sẽ xanh giả.
        // `section` = caption tiếng Nhật của khối chứa giá trị đó trên biểu mẫu.
        // RPT203001 có HAI layout dùng CHUNG một datasource (RptInpDocTbl), và
        // mỗi layout chỉ in một tập con — ví dụ 初回用 không có khối
        // 【これまでの治療】. WinForm cũng đổ đủ mọi cột cho cả hai bản, để .rpt tự
        // chọn cái nào hiện. Nên "có trong datasource" KHÔNG đồng nghĩa "phải có
        // trên tờ giấy này"; chỉ bắt buộc khi caption của khối đó thực sự có mặt.
        // `section: null` = luôn bắt buộc (không thuộc khối nào).
        const expected: { label: string; section: string | null; value: string }[] = [
            { label: '患者氏名', section: null, value: row.pat_nm },
            { label: '医院名', section: null, value: row.clinic_nm },
            { label: '印刷日(和暦)', section: null, value: row.trt_dt_jp },
            { label: '基礎疾患その他', section: '基礎疾患', value: row.underlying_dis_other },
            { label: '薬剤名', section: '服薬', value: row.drug_other },
            { label: '生活習慣その他', section: '生活習慣', value: row.lifestyle_other },
            { label: 'その他', section: 'その他', value: row.etc },
            { label: '歯や歯肉の状態その他', section: '歯や歯肉の状態', value: row.ins_other },
            { label: 'その他・特記事項', section: 'その他・特記事項', value: row.special_note },
            {
                label: 'これまでの治療その他',
                section: 'これまでの治療',
                value: row.prev_treat_other,
            },
            { label: '改善目標その他', section: '改善目標', value: row.improve_other },
            { label: '治療の予定その他', section: '治療の予定', value: row.plan_treat_other },
        ].filter((e) => (e.value ?? '').trim() !== '')

        const hasKanji = (str: string) => /[一-鿿]/.test(str)
        const missingHard: string[] = []
        const missingSoft: string[] = []
        /** Khối không có trên layout này → giá trị vắng mặt là ĐÚNG, không phải lỗi. */
        const skippedSections: string[] = []
        for (const { label, section, value } of expected) {
            if (pdf.folded.includes(foldForCompare(value))) continue
            if (section !== null && !pdf.folded.includes(foldForCompare(section))) {
                skippedSections.push(`${label} (khối 【${section}】 không có trên layout này)`)
                continue
            }
            const entry = `${label} = "${value}"`
            if (!PDF_TEXT_STRICT && hasKanji(value)) missingSoft.push(entry)
            else missingHard.push(entry)
        }
        if (skippedSections.length > 0) {
            console.log(`khối không in trên layout này: ${skippedSections.join(' | ')}`)
        }
        if (missingSoft.length > 0) {
            console.log(`CẢNH BÁO: không thấy trên PDF (loose): ${missingSoft.join(' | ')}`)
        }
        expect(
            missingHard,
            'các giá trị này có trong datasource, khối chứa chúng CÓ trên tờ giấy, ' +
                'nhưng giá trị lại không in ra (mở phần đính kèm .pdf / pdf-text.txt để đối chiếu)',
        ).toEqual([])

        console.log(
            `nội dung PDF: khớp ${expected.length - missingSoft.length - skippedSections.length}` +
                `/${expected.length - skippedSections.length} giá trị`,
        )

        await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(previewDialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('TC-IN-6 — 文書書式 継続用 → agent render đúng .rpt rpt_no 2', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        // Điểm KHÁC các màn in khác: một 帳票ID nhưng HAI layout, chọn theo 文書書式.
        // Đổi radio rồi in lại thì reportId phải nhảy sang bản 継続用.
        await dialog.getByRole('radio', { name: '継続用' }).click()

        sentRenderReq = null
        await dialog.getByRole('button', { name: 'F9 印刷' }).click()
        await expect
            .poll(() => sentRenderReq, { timeout: 60000, message: 'FE không gọi /v1/render' })
            .not.toBeNull()
        const sent = sentRenderReq!

        expect(sent.reportId, '継続用 phải dùng rpt_no 2').toBe(REPORT_ID_BY_DOC_TYPE[1])
        expect(sent.reportId, '継続用 không được trùng .rpt của 初回用').not.toBe(
            REPORT_ID_BY_DOC_TYPE[0],
        )
        expect(sent.dataJson[DS_TABLE], 'đổi layout không được mất dữ liệu').toHaveLength(1)

        // Agent phải render được bản 継続用 — nếu .rpt/.xsd chưa map thì preview
        // không bao giờ hiện và lỗi dừng ở đây, đúng chỗ cần biết.
        await expect(previewDialog, '継続用 render lỗi ở agent').toBeVisible({
            timeout: 60000,
        })
        const src = await previewDialog.locator('iframe').getAttribute('src')
        const res = await page.request.get(src!.split('#')[0]!)
        expect(res.ok(), `tải PDF 継続用 lỗi ${res.status()}`).toBe(true)
        const pdf = await res.body()
        expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-')
        await test.info().attach(`${REPORT_ID_BY_DOC_TYPE[1]}.pdf`, {
            body: pdf,
            contentType: 'application/pdf',
        })

        await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(previewDialog).toBeHidden({ timeout: 10000 })

        // Trả lại 初回用 cho các testcase sau (TC-DB-1 assert doc_type = 0).
        await dialog.getByRole('radio', { name: SAVE_FIXTURE.docTypeLabel }).click()
        await step()
    })

    test('TC-DATE-2 — F8 với 年 rỗng → alert E00002 「日付が正しくありません。」', async () => {
        // japaneseEraToDate trả null → chặn TRƯỚC confirm Q00001.
        const yearBox = noRow.getByRole('textbox').nth(1)
        const keep = await yearBox.inputValue()
        await yearBox.fill('')

        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText('日付が正しくありません。')).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })

        await yearBox.fill(keep)
        await step()
    })

    /** Nhồi mọi trường lưu được, để từng field của payload truy ngược ra được. */
    async function fillSaveForm() {
        await dialog.getByRole('radio', { name: SAVE_FIXTURE.docTypeLabel }).click()
        const no = noRow.getByRole('textbox').nth(0)
        await no.fill(SAVE_FIXTURE.no)

        const basic = boxOf('【基礎疾患】')
        const bDis = basic.getByRole('checkbox', {
            name: SAVE_FIXTURE.underlyingDisChecked,
        })
        if (!(await bDis.isChecked())) await bDis.click()
        await basic.getByRole('textbox').fill(SAVE_FIXTURE.underlyingDisOther)

        const drug = boxOf('【服薬】')
        await drug.getByRole('radio', { name: '有' }).click()
        await drug.getByRole('textbox').fill(SAVE_FIXTURE.drugOther)

        const life = boxOf('【生活習慣】')
        const smoke = life.getByRole('checkbox', { name: '喫煙' })
        if (!(await smoke.isChecked())) await smoke.click()
        await life.getByRole('textbox').fill(SAVE_FIXTURE.lifestyleOther)

        // 【その他】 của panel đầu: hàng Row có caption 【その他】 và một Input.
        // Có HAI caption 【その他】 trong dialog (panel này + 歯や歯肉の状態) →
        // .first() theo thứ tự DOM chính là cái của panel đầu.
        await dialog
            .getByText('【その他】', { exact: true })
            .first()
            .locator('xpath=following-sibling::*[1]')
            .getByRole('textbox')
            .fill(SAVE_FIXTURE.etc)

        await boxOf('4mm以上の歯周ポケット').getByRole('radio', { name: '有' }).click()
        await boxOf('プラーク・歯石の付着状況').getByRole('radio', { name: '多い' }).click()
        await boxOf('【むし歯】').getByRole('radio', { name: '有' }).click()
        await dialog
            .getByText('【その他】', { exact: true })
            .last()
            .locator('xpath=following-sibling::*[1]')
            .fill(SAVE_FIXTURE.insOther)

        const oral = boxOf('【口腔機能の問題】').locator('> div').nth(0)
        const oralCb = oral.getByRole('checkbox', {
            name: SAVE_FIXTURE.oralFuncChecked,
        })
        if (!(await oralCb.isChecked())) await oralCb.click()
        const childCb = boxOf('【小児口腔機能の問題】').getByRole('checkbox', {
            name: SAVE_FIXTURE.oralFuncChildChecked,
        })
        if (!(await childCb.isChecked())) await childCb.click()

        await boxOf('【その他・特記事項】').getByRole('textbox').fill(SAVE_FIXTURE.specialNote)

        const prev = boxOf('【これまでの治療】')
        const prevCb = prev.getByRole('checkbox', {
            name: SAVE_FIXTURE.prevTreatChecked,
        })
        if (!(await prevCb.isChecked())) await prevCb.click()
        await prev.getByRole('textbox').fill(SAVE_FIXTURE.prevTreatOther)

        const improve = boxOf('【改善目標】')
        const impCb = improve.getByRole('checkbox', {
            name: SAVE_FIXTURE.improveChecked,
        })
        if (!(await impCb.isChecked())) await impCb.click()
        await improve.getByRole('textbox').fill(SAVE_FIXTURE.improveOther)

        const plan = boxOf('【治療の予定】')
        const planCb = plan.getByRole('checkbox', {
            name: SAVE_FIXTURE.planTreatChecked,
        })
        if (!(await planCb.isChecked())) await planCb.click()
        await plan.getByRole('textbox').fill(SAVE_FIXTURE.planTreatOther)

        await dialog.getByLabel('本数').fill(SAVE_FIXTURE.toothCnt)

        // 印刷日 phải hợp lệ, nếu không F8 dừng ở E00002 trước khi chạm mạng.
        for (const i of [1, 2, 3]) {
            await expect(noRow.getByRole('textbox').nth(i)).not.toHaveValue('')
        }
    }

    test('TC-SAVE-1 — payload F8 khớp form (request bị chặn, KHÔNG ghi DB)', async () => {
        await fillSaveForm()
        await step()

        let sent: SaveBody | null = null
        await page.route(SAVE_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            sent = req.postDataJSON() as SaveBody
            // Trả về đúng envelope của API để FE chạy tiếp tới I00001.
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: true }),
            })
        })

        try {
            await dialog.getByRole('button', { name: 'F8 登録' }).click()
            const confirm = page.getByRole('alertdialog')
            await expect(confirm).toBeVisible({ timeout: 10000 })
            await expect(confirm.getByText('登録してよろしいですか？')).toBeVisible()
            await confirm.getByRole('button', { name: /^(Yes|はい)$/ }).click()

            const done = page.getByRole('alertdialog')
            await expect(done).toBeVisible({ timeout: 30000 })
            await expect(done.getByText('登録が完了しました。')).toBeVisible({
                timeout: 30000,
            })
            await done.getByRole('button', { name: 'OK' }).click()
            await expect(done).toBeHidden({ timeout: 10000 })
        } finally {
            await page.unroute(SAVE_URL)
        }

        expect(sent, 'F8 không gửi request nào').not.toBeNull()
        const body = sent as unknown as SaveBody

        // ── khoá tự nhiên ────────────────────────────────────────────────────
        expect(body.patNo).toBe(PAT_NO_NUM)
        expect(body.printDt, 'printDt phải là ISO yyyy-MM-dd').toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const ymd = await Promise.all(
            [1, 2, 3].map((i) => noRow.getByRole('textbox').nth(i).inputValue()),
        )
        expect(Number(body.printDt.slice(5, 7)), 'printDt lệch tháng so với form').toBe(
            Number(ymd[1]),
        )
        expect(Number(body.printDt.slice(8, 10)), 'printDt lệch ngày so với form').toBe(
            Number(ymd[2]),
        )

        // ── các mục trên form ────────────────────────────────────────────────
        expect(body.no).toBe(SAVE_FIXTURE.no)
        expect(body.docType, '初回用 = 0').toBe(SAVE_FIXTURE.docType)
        expect(body.underlyingDis[0], '高血圧症 phải bật').toBe(true)
        expect(body.underlyingDisOther).toBe(SAVE_FIXTURE.underlyingDisOther)
        expect(body.drug, '服薬 有').toBe(true)
        expect(body.drugOther).toBe(SAVE_FIXTURE.drugOther)
        expect(body.lifestyle[0], '喫煙 phải bật').toBe(true)
        expect(body.lifestyleOther).toBe(SAVE_FIXTURE.lifestyleOther)
        expect(body.etc).toBe(SAVE_FIXTURE.etc)
        expect(body.insPocket, '4mm以上の歯周ポケット 有').toBe(SAVE_FIXTURE.insPocket)
        expect(body.pq, 'プラーク 多い lưu theo INDEX của {無,少ない,多い} = 2').toBe(
            SAVE_FIXTURE.pq,
        )
        expect(body.caries, 'むし歯 有').toBe(SAVE_FIXTURE.caries)
        expect(body.insOther).toBe(SAVE_FIXTURE.insOther)
        expect(body.oralFunc[0], '口腔衛生状態 phải bật').toBe(true)
        expect(body.oralFuncChild[2], '小児 食行動 phải bật').toBe(true)
        expect(body.specialNote).toBe(SAVE_FIXTURE.specialNote)
        expect(body.prevTreat[1], 'ブリッジ phải bật').toBe(true)
        expect(body.prevTreatOther).toBe(SAVE_FIXTURE.prevTreatOther)
        expect(body.improve[2], '喫煙習慣 phải bật').toBe(true)
        expect(body.improveOther).toBe(SAVE_FIXTURE.improveOther)
        expect(body.planTreat[3], '歯肉炎・歯周炎の治療 phải bật').toBe(true)
        expect(body.planTreatOther).toBe(SAVE_FIXTURE.planTreatOther)

        // ── 歯式 ─────────────────────────────────────────────────────────────
        expect(body.perm, 'perm phải đủ 32 ô').toHaveLength(PERM_COUNT)
        expect(body.deci, 'deci phải đủ 20 ô').toHaveLength(DECI_COUNT)
        for (const cell of [...body.perm, ...body.deci]) {
            expect(cell.surfaces, 'mỗi răng phải có đủ 4 歯面').toHaveLength(SURFACE_COUNT)
        }

        // ── 2 lỗi WinForm đã sửa trong commit này ────────────────────────────
        // (1) tooth_cnt luôn được lưu 0 → nay phải bằng đúng ô 本数.
        expect(body.toothCnt, 'tooth_cnt phải theo ô 本数, không được luôn 0').toBe(
            Number(SAVE_FIXTURE.toothCnt),
        )
        // (2) răng hiện diện KHÔNG có プラーク bị lưu 0 rồi biến mất khi nạp lại từ
        //     履歴 → nay present vẫn phải là true dù cả 4 歯面 đều tắt.
        const presentInChart = await chartSvg.locator('[data-tooth][data-present="true"]').count()
        const presentInBody = [...body.perm, ...body.deci].filter((c) => c.present).length
        expect(presentInBody, 'số răng hiện diện gửi lên phải khớp chart').toBe(presentInChart)
        const plaqueless = [...body.perm, ...body.deci].filter(
            (c) => c.present && c.surfaces.every((s) => !s),
        ).length
        console.log(
            `payload 歯式: ${presentInBody} răng hiện diện (trong đó ${plaqueless} răng không プラーク)`,
        )
        await step()
    })

    test('TC-SAVE-2 — F8 登録: confirm Q00001 「登録してよろしいですか？」', async () => {
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
        const done = page.getByRole('alertdialog')
        await expect(done).toBeVisible({ timeout: 30000 })
        await expect(done.getByText('登録が完了しました。')).toBeVisible({
            timeout: 30000,
        })
        await done.getByRole('button', { name: 'OK' }).click()
        await expect(done).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('TC-HIST-1 — 過去の記録 combo: nạp lại form nếu bệnh nhân có bản ghi', async () => {
        await history.click()
        const listbox = page.getByRole('listbox')
        await listbox.waitFor({ state: 'visible', timeout: 10000 })
        const n = await page.getByRole('option').count()
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10000 })

        if (n === 0) {
            console.log('過去の記録: bệnh nhân chưa có bản ghi 歯科疾患管理 → BỎ QUA phần nạp lại')
            return
        }
        // Chọn một ngày → pickHistory setEdits(null) rồi nạp lại TOÀN BỘ form
        // (khác carry-forward: lần này 文書書式 và 歯式 cũng được khôi phục).
        await history.click()
        await page.getByRole('option').first().click()
        await expect(page.getByRole('listbox')).toBeHidden({ timeout: 10000 })

        await expect(history).not.toHaveText('過去の記録から呼び出し')
        // Form không vỡ: chart vẫn đủ 52 răng và các khối vẫn còn.
        await expect(chartSvg.locator('[data-tooth]')).toHaveCount(TOOTH_COUNT)
        await expect(dialog.getByText('【治療の予定】')).toBeVisible()
        console.log(`過去の記録: ${n} bản ghi, đã nạp lại bản đầu tiên`)
        await step()
    })

    test('TC-CLOSE-1 — F10 戻る (nút) đóng dialog, không hỏi lưu', async () => {
        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10000 })
        // WinForm btnF10 đóng thẳng — không confirm nào chen vào.
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await step()
    })

    test('TC-CLOSE-2 — mở lại → state reset (Body unmount khi đóng = chạy lại initProc)', async () => {
        await openDialog(page, dialog)

        // Assert reset bằng 文書書式, KHÔNG bằng các ô text.
        //
        // Vì sao: các ô text đều nằm trong nhóm carry-forward khôi phục. Chỉ cần
        // bệnh nhân có BẤT KỲ record nào ≤ 印刷日 — record thật, hoặc record sót
        // lại từ một lần TC-DB-1 fail giữa chừng chưa kịp dọn — là form mở lại sẽ
        // có đúng các chuỗi E2E đó, và assert "không được có" fail vì lý do hoàn
        // toàn không liên quan tới việc remount.
        //
        // 文書書式 thì ngược lại: WinForm makeCombo KHÔNG chép doc_type sang form
        // trắng, nên nó luôn về 継続用 bất kể có carry-forward hay không.
        // fillSaveForm đã đặt 初回用, nên đây là bằng chứng sạch rằng Body đã
        // unmount và chạy lại initProc.
        await expect(
            dialog.getByRole('radio', { name: '継続用' }),
            'mở lại phải reset 文書書式 về 継続用 (carry-forward không kế thừa nó)',
        ).toBeChecked()
        await expect(dialog.getByRole('radio', { name: '初回用' })).not.toBeChecked()
        await step()
    })

    test('TC-CLOSE-3 — phím F10 (FKeyLayer của dialog) đóng dialog', async () => {
        // fKeys của DraggableDialog là scope trên cùng → F-key màn nền không nổ.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    /**
     * GHI THẬT vào DB: F8 登録 lưu một record 歯科疾患管理, kiểm chính record đó ở
     * tầng DB (đặc biệt là `tooth_cnt` — WinForm luôn ghi 0, commit này sửa), rồi
     * nạp lại từ 履歴 để chứng minh răng hiện diện KHÔNG biến mất, cuối cùng DỌN
     * bằng DELETE thẳng bảng — frm203021 không có nút xoá.
     *
     * CHỈ CHẠY Ở LOCAL: gate bằng `dbEnabled` (TEST_DB=1 / TEST_DB_URL).
     */
    test('TC-DB-1 — ghi thật F8 → verify DB → nạp lại từ 履歴 → dọn (can thiệp DB)', async () => {
        test.skip(!dbEnabled, 'testcase can thiệp DB — đặt TEST_DB=1 (chỉ local)')

        // Dọn trước cho sạch: bệnh nhân test không còn record cũ (cũng loại luôn
        // ảnh hưởng của carry-forward lên form).
        await deleteChiryoKanriR2(PAT_NO_NUM)
        expect(await countChiryoKanriR2(PAT_NO_NUM), 'chưa dọn sạch record cũ').toBe(0)

        // 1. Mở dialog, nhồi form (giá trị CỐ ĐỊNH → upsert theo (pat_no, print_dt)
        //    idempotent, chạy lại chỉ đè lên chính nó).
        await openDialog(page, dialog)
        await fillSaveForm()
        const presentInChart = await chartSvg.locator('[data-tooth][data-present="true"]').count()
        await step()

        // 2. F8 登録 → confirm Yes → I00001. Đây là GHI THẬT.
        await dialog.getByRole('button', { name: 'F8 登録' }).click()
        const confirm = page.getByRole('alertdialog')
        await expect(confirm).toBeVisible({ timeout: 10000 })
        await confirm.getByRole('button', { name: /^(Yes|はい)$/ }).click()
        const done = page.getByRole('alertdialog')
        await expect(done.getByText('登録が完了しました。')).toBeVisible({
            timeout: 30000,
        })
        await done.getByRole('button', { name: 'OK' }).click()
        await expect(done).toBeHidden({ timeout: 10000 })

        // 3. DB phải có đúng record vừa ghi.
        expect(await countChiryoKanriR2(PAT_NO_NUM), 'F8 không ghi được record').toBe(1)
        const row = await latestChiryoKanriR2(PAT_NO_NUM)
        expect(row, 'không đọc được record vừa ghi').not.toBeNull()
        if (!row) return

        expect(row.no).toBe(SAVE_FIXTURE.no)
        expect(row.doc_type, '初回用 = 0').toBe(SAVE_FIXTURE.docType)
        expect(row.etc).toBe(SAVE_FIXTURE.etc)
        expect(row.special_note).toBe(SAVE_FIXTURE.specialNote)
        // Lỗi WinForm #1: tooth_cnt luôn 0.
        expect(row.tooth_cnt, 'tooth_cnt phải lưu đúng ô 本数, không được là 0').toBe(
            Number(SAVE_FIXTURE.toothCnt),
        )
        // Lỗi WinForm #2: răng hiện diện không プラーク bị encode thành 0 → mất khi
        // nạp lại. Số ô se_n/sn_n khác 0 phải bằng số răng hiện diện trên chart.
        const nonZero = [...row.se, ...row.sn].filter((v) => v !== 0).length
        expect(nonZero, 'răng hiện diện bị lưu thành 0 (mất khi nạp lại từ 履歴)').toBe(
            presentInChart,
        )
        await step()

        // 4. Đóng + mở lại → chọn chính ngày vừa ghi từ 履歴 → form khôi phục đủ.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await openDialog(page, dialog)
        await history.click()
        await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10000 })
        await page.getByRole('option').first().click()
        await expect(page.getByRole('listbox')).toBeHidden({ timeout: 10000 })

        await expect(boxOf('【その他・特記事項】').getByRole('textbox')).toHaveValue(
            SAVE_FIXTURE.specialNote,
        )
        await expect(dialog.getByLabel('本数')).toHaveValue(SAVE_FIXTURE.toothCnt)
        // 履歴 khôi phục CẢ 歯式 → số răng hiện diện không được rơi về 0.
        await expect(chartSvg.locator('[data-tooth][data-present="true"]')).toHaveCount(
            presentInChart,
        )
        await step()

        // 5. Đóng dialog rồi DỌN: DELETE thẳng bảng (UI không có nút xoá). Nguồn
        //    chân lý của việc dọn là DB — verify count = 0.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        const deleted = await deleteChiryoKanriR2(PAT_NO_NUM)
        expect(deleted, 'không xoá được record test').toBeGreaterThan(0)
        expect(await countChiryoKanriR2(PAT_NO_NUM), 'DB chưa sạch sau khi dọn').toBe(0)
        await step()
    })
})
