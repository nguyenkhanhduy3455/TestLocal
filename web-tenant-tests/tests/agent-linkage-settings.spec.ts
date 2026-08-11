import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 機器連携 — tab `linkage` của màn エージェント設定 (`/settings/agent?tab=linkage`),
 * port của 連携環境設定 legacy (frm506008).
 *
 * Spec này CHỈ kiểm thao tác ĐƠN GIẢN: xem màn hình và bấm 保存 — và kiểm cho
 * TẤT CẢ device trong danh mục. Phần ghi file thiết bị + verify nội dung nằm ở
 * `agent-linkage-hercules2007.spec.ts`, hiện chỉ làm cho Hercules2007.
 *
 * ─── Nguồn WinForm ──────────────────────────────────────────────────────────
 *  - COMMON/Lib/CoopRoentgen.cs — 4 ô liên kết, luật chọn hãng, luật bật/tắt.
 *  - frm506008.cs:1678 — DB名/ユーザ名/パスワード/ディレクトリパス thuộc về Ô, không
 *    thuộc về HÃNG: đổi 連携先 KHÔNG xoá thứ đã gõ, và mọi createData_* nhận đủ
 *    cả bốn. Vì thế các ô nhập không phản ứng gì khi đổi 連携先 (TC-VENDOR-3).
 *  - CodMst.cs:38-41 — combo 連携先 đổ THẲNG `WHERE CD_TYPE=58`, KHÔNG lọc theo
 *    hãng mà máy có connector. Chọn một mã không có connector là hợp lệ và chỉ
 *    đơn giản là không ghi gì (TC-VENDOR-2). Đây là hành vi cố ý.
 *  - CoopRoentgen.cs:343-355 — 予約/清算機 không có mã hãng, chúng bật/tắt CHỈ nhờ
 *    đường dẫn khác rỗng. Web giữ nguyên: `isActive` = có device && path khác rỗng.
 *
 * ─── Port web đang có ───────────────────────────────────────────────────────
 *  - routes/_authenticated/settings/agent.tsx
 *      · AGENT_TABS = ['connection','printers','linkage','other'] (:39), tab thiếu
 *        → 'connection' (:54); giá trị lạ trượt zod → RouteErrorComponent → 404.
 *      · 保存 (:114-122) `disabled={isSaving || !isDirty}`; badge
 *        「未保存の変更があります」 (:112) chỉ hiện khi dirty.
 *      · Agent tắt → AgentOfflinePanel THAY THẾ toàn bộ tab strip + nút 保存 (:82-86)
 *        ⇒ spec này bắt buộc phải có agent, xem AGENT_AVAILABLE.
 *  - routes/_authenticated/settings/linkage.tsx:8-10 — redirect sang ?tab=linkage.
 *  - features/agent-settings/components/settings-panel.tsx:22 — tiêu đề card bọc
 *    trong 「≪…≫」, là `<span>` chứ KHÔNG phải heading.
 *  - features/agent-linkage/components/connector-config-form.tsx
 *      · id ổn định: `connector-category-<cat>`, `connector-field-<cat>-<key>`.
 *      · 連携先 chỉ có ở xray / medical-support (:330,355 + connector-rows.ts:21).
 *      · DB名/ユーザ名/パスワード chỉ có ở xray (`takesCredentials`, :78).
 *      · commit() (:306-313) LOẠI row `linkCode===0` của ô chọn-hãng, và
 *        `enabled = isActive(row)` = path khác rỗng.
 *      · Chuỗi gợi ý cạnh 一括作成 có đúng 4 trạng thái (:433-441).
 *  - features/agent-settings/locales/ja.ts — 保存 / 保存中... / các câu toast.
 *  - shared/ui/toast.tsx:88 — mỗi toast là `role="status"`.
 *
 * CHẠY TUẦN TỰ và dùng CHUNG một page: app giới hạn số lần login (GUIDELINE
 * Rule 10.1). KHÔNG `page.reload()` ở giữa suite — accessToken chỉ nằm trong RAM
 * (Rule 10.2), reload là mất phiên và tốn thêm một lần login. Muốn bỏ chỉnh sửa
 * thì gõ lại giá trị cũ: `isDirty` so sánh sâu nên trả về đúng giá trị cũ là
 * form sạch trở lại (TC-SAVE-5 kiểm chính điều đó).
 *   npx playwright test tests/agent-linkage-settings.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/**
 * Màn hình này KHÔNG render được nếu agent không chạy — `agent.tsx:82-86` thay
 * cả tab strip lẫn nút 保存 bằng AgentOfflinePanel. Nên cả spec skip, không phải
 * từng testcase.
 *
 * Ép tay: TEST_AGENT=1 (agent ở máy khác) / TEST_AGENT=0 (bỏ qua dù ở Windows).
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `màn 機器連携 cần agent đang chạy (net48, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

// ── URL ──────────────────────────────────────────────────────────────────────
const LINKAGE_URL = '/settings/agent?tab=linkage'
/** Danh mục hãng: mst_cod cdType 58 (MstCodType.PicLink). */
const MST_COD_58_URL = /\/tenant\/mst-cod\?[^ ]*cdTypes=58/
/** Cấu hình máy trạm — 1 tài nguyên cho connectors + printMappings + settings. */
const AGENT_CONFIG_URL = /\/v1\/config(\?|$)/
/** Danh mục connector mà agent THẬT SỰ cài được — khác hẳn danh mục hãng của master. */
const AGENT_CONNECTORS_URL = /\/v1\/connectors(\?|$)/

// ── Bốn ô, theo đúng thứ tự LINKAGE_CATEGORIES ───────────────────────────────
interface CategorySpec {
    category: string
    /** Tiêu đề card, LINKAGE_CATEGORY_LABELS (lib/agent-config.ts:34-39). */
    title: string
    /** Ô có combo 連携先 hay không (chỉ xray + medical-support). */
    vendorChoice: boolean
    /** Ô có DB名/ユーザ名/パスワード hay không (chỉ xray). */
    credentials: boolean
}
const CATEGORIES: CategorySpec[] = [
    { category: 'xray', title: 'レントゲンシステム連携', vendorChoice: true, credentials: true },
    {
        category: 'medical-support',
        title: '診療支援システム連携',
        vendorChoice: true,
        credentials: false,
    },
    { category: 'appointment', title: '予約システム連携', vendorChoice: false, credentials: false },
    { category: 'settlement', title: '清算機システム連携', vendorChoice: false, credentials: false },
]

/** Key của 3 ô thông tin đăng nhập, theo ConfigSchema của NeoPremium/DentAView. */
const CREDENTIAL_KEYS = ['dbName', 'userName', 'password'] as const

/** 連携しない — NO_CONNECTOR (connector-rows.ts:18). */
const NO_CONNECTOR_LABEL = '連携しない'

/** Bốn câu gợi ý cạnh 一括作成 (connector-config-form.tsx:433-441). */
const HINT_NO_DEVICE = '連携先を選択してください。'
const HINT_NO_PATH = 'ディレクトリパスを入力すると有効になります。'
const HINT_DIRTY = '設定を保存してから実行してください。'
const HINT_READY = '登録済みの全患者を書き出します。'

// ── Kiểu body (chỉ khai field testcase soi tới) ──────────────────────────────
interface MstCodRow {
    cdVal: number | string
    anyVal1?: string | null
}
interface AgentConnector {
    category: string
    linkCode: number
    enabled: boolean
    settings: Record<string, unknown>
}
interface AgentConfigBody {
    connectors: AgentConnector[]
    printMappings: unknown[]
    settings: Record<string, string>
    configVersion: number
}
interface AgentConfigPutBody {
    connectors: AgentConnector[]
    printMappings: unknown[]
    settings: Record<string, string>
    syncTicket?: string
    expectedConfigVersion?: number
}

test.describe.configure({ mode: 'serial' })

test.describe('機器連携 — エージェント設定 tab linkage (frm506008)', () => {
    test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)

    let page: Page
    let step: () => Promise<void>

    /** Card của một ô: `<span>≪tiêu đề≫</span>` → div header → div card. */
    let cardOf: (title: string) => Locator
    /** Ô nhập ディレクトリパス của một category (id ổn định, không cần bó theo card). */
    let pathBoxOf: (category: string) => Locator
    /** Combo 連携先 của một category. */
    let vendorSelectOf: (category: string) => Locator
    let saveButton: Locator
    let dirtyBadge: Locator

    /** Danh mục hãng bắt được lúc mở màn (TC-VENDOR-1 đối chiếu). */
    let picLinkRows: MstCodRow[] = []
    /** linkCode mà agent có connector — mọi mã ngoài tập này là "chọn được nhưng inert". */
    let supportedLinkCodes: Set<number> = new Set()
    /** Cấu hình agent lúc mở màn — mốc để khôi phục và để so payload. */
    let loadedConfig: AgentConfigBody | null = null
    /** Giá trị ディレクトリパス ban đầu của từng ô, để trả lại sau mỗi lần làm bẩn form. */
    const originalPaths: Record<string, string> = {}

    /**
     * Chạy `body` với một handler chặn PUT /v1/config, rồi gỡ ĐÚNG handler đó.
     *
     * `page.unroute(url)` không kèm handler sẽ gỡ MỌI route khớp url — kể cả cái
     * đang chụp body GET /v1/config ở `beforeAll`, và từ đó `loadedConfig` đứng
     * yên ở bản cũ mà không ai biết. Truyền lại chính hàm đã đăng ký là cách duy
     * nhất gỡ có chọn lọc.
     *
     * Route của Playwright chạy theo thứ tự đăng ký NGƯỢC, nên handler này chạy
     * trước; request không phải PUT được `fallback()` xuống handler chụp GET.
     */
    async function withPutIntercepted(
        onPut: (route: Route) => Promise<void>,
        body: () => Promise<void>,
    ) {
        const handler = async (route: Route) => {
            if (route.request().method() !== 'PUT') return route.fallback()
            await onPut(route)
        }
        await page.route(AGENT_CONFIG_URL, handler)
        try {
            await body()
        } finally {
            await page.unroute(AGENT_CONFIG_URL, handler)
        }
    }

    /** Gõ lại đúng giá trị ban đầu → `isDirty` so sánh sâu nên form sạch trở lại. */
    async function restoreForm() {
        for (const { category } of CATEGORIES) {
            const original = originalPaths[category] ?? ''
            const box = pathBoxOf(category)
            if ((await box.inputValue()) !== original) await box.fill(original)
        }
    }

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
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Chụp body NGAY LÚC request chạy qua, không đọc lại sau.
        //
        // `page.waitForResponse(...).json()` không dùng được ở đây vì hai lý do
        // cộng lại: `fetchAllMstCods` gộp MỌI cdType vào một request
        // `?cdTypes=1&cdTypes=2&…&cdTypes=58&…` nên nó khớp ngay từ trang
        // dashboard sau khi login, rồi lần `page.goto` kế tiếp điều hướng đi và
        // trình duyệt thu hồi body — đọc muộn nhận
        // `Network.getResponseBody: No resource with given identifier found`.
        // Đọc tại chỗ trong handler thì không có cửa sổ nào để mất.
        await page.route(MST_COD_58_URL, async (route) => {
            const res = await route.fetch()
            const body = (await res.json().catch(() => null)) as {
                data?: Record<string, MstCodRow[]>
            } | null
            const rows = body?.data?.['58']
            if (rows?.length) picLinkRows = rows
            await route.fulfill({ response: res })
        })
        await page.route(AGENT_CONNECTORS_URL, async (route) => {
            const res = await route.fetch()
            const body = (await res.json().catch(() => null)) as {
                connectors?: { linkCode: number }[]
            } | null
            if (body?.connectors?.length) {
                supportedLinkCodes = new Set(body.connectors.map((c) => c.linkCode))
            }
            await route.fulfill({ response: res })
        })
        await page.route(AGENT_CONFIG_URL, async (route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const body = (await res.json().catch(() => null)) as AgentConfigBody | null
            // Giữ bản MỚI NHẤT: form chỉ seed lại khi configVersion đổi, nên bản
            // cuối cùng đọc được cũng chính là bản form đang giữ.
            if (body?.connectors) loadedConfig = body
            await route.fulfill({ response: res })
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        // Tiêu đề card là `<span>` chứ không phải heading → span → header → card.
        cardOf = (title: string) =>
            page.getByText(`≪${title}≫`, { exact: true }).locator('..').locator('..')
        pathBoxOf = (category: string) => page.locator(`#connector-field-${category}-path`)
        vendorSelectOf = (category: string) => page.locator(`#connector-category-${category}`)
        saveButton = page.getByRole('button', { name: '保存', exact: true })
        dirtyBadge = page.getByText('未保存の変更があります')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Điều hướng ───────────────────────────────────────────────────────────

    test('TC-NAV-1 — mở ?tab=linkage: đứng đúng tab, nạp danh mục hãng + cấu hình', async () => {
        await page.goto(LINKAGE_URL, { waitUntil: 'domcontentloaded' })
        await expect(
            page.getByRole('heading', { name: 'エージェント設定', level: 1 }),
        ).toBeVisible({ timeout: 60000 })

        // Agent phải sống, nếu không AgentOfflinePanel thay thế cả màn hình.
        await expect(
            page.getByRole('heading', { name: 'エージェントが起動していません' }),
            'agent không chạy — cả spec này vô nghĩa, xem AGENT_AVAILABLE',
        ).toHaveCount(0)

        await expect(page.getByRole('tab', { name: '機器連携' })).toHaveAttribute(
            'data-state',
            'active',
        )
        // Card レントゲン dựng xong = hai query của panel đã về.
        await expect(vendorSelectOf('xray')).toBeVisible({ timeout: 30000 })

        // Hai biến này do handler `page.route` ở beforeAll điền vào; `expect.poll`
        // chờ đúng cách thay vì ngủ (Rule 7).
        await expect
            .poll(() => picLinkRows.length, {
                message: 'mst_cod cdType 58 rỗng → không kiểm được danh mục hãng',
                timeout: 30000,
            })
            .toBeGreaterThan(0)
        await expect
            .poll(() => loadedConfig?.connectors?.length ?? -1, {
                message: 'chưa bắt được GET /v1/config',
                timeout: 30000,
            })
            .toBeGreaterThanOrEqual(0)
        await step()
    })

    test('TC-NAV-2 — 4 tab đúng nhãn, và /settings/linkage cũ redirect về đây', async () => {
        for (const label of ['接続', 'プリンター', '機器連携', 'その他']) {
            await expect(page.getByRole('tab', { name: label })).toBeVisible()
        }
        await expect(page.getByRole('tab')).toHaveCount(4)

        // Route cũ chỉ còn là `beforeLoad` ném redirect, không render gì.
        await page.goto('/settings/linkage', { waitUntil: 'domcontentloaded' })
        await expect(page).toHaveURL(/\/settings\/agent\?tab=linkage$/, { timeout: 30000 })
        await expect(page.getByRole('tab', { name: '機器連携' })).toHaveAttribute(
            'data-state',
            'active',
        )
        await step()
    })

    // ── Bố cục 4 ô ───────────────────────────────────────────────────────────

    test('TC-CARD-1 — đủ 4 ô, đúng nhãn và đúng thứ tự', async () => {
        for (const { title } of CATEGORIES) {
            await expect(
                page.getByText(`≪${title}≫`, { exact: true }),
                `thiếu ô 「${title}」`,
            ).toBeVisible()
        }

        // Thứ tự là LINKAGE_CATEGORIES — 2 ô chọn-hãng trước, 2 ô cố định sau.
        const titles = await page
            .locator('span')
            .filter({ hasText: /^≪.+システム連携≫$/ })
            .allInnerTexts()
        expect(titles).toEqual(CATEGORIES.map((c) => `≪${c.title}≫`))
        await step()
    })

    test('TC-CARD-2 — chỉ レントゲン và 診療支援 có combo 連携先', async () => {
        for (const { category, vendorChoice, title } of CATEGORIES) {
            await expect(
                vendorSelectOf(category),
                `${title}: ${vendorChoice ? 'phải' : 'KHÔNG được'} có combo 連携先`,
            ).toHaveCount(vendorChoice ? 1 : 0)
        }
        // 予約 và 清算機 không có gì để chọn — legacy lái thẳng DentMapPlus / Teraoka.
        await expect(page.getByRole('combobox')).toHaveCount(2)
        await step()
    })

    test('TC-CARD-3 — chỉ レントゲン có DB名 / ユーザ名 / パスワード', async () => {
        for (const { category, credentials, title } of CATEGORIES) {
            for (const key of CREDENTIAL_KEYS) {
                await expect(
                    page.locator(`#connector-field-${category}-${key}`),
                    `${title}: ${credentials ? 'phải' : 'KHÔNG được'} có ô ${key}`,
                ).toHaveCount(credentials ? 1 : 0)
            }
        }
        // パスワード là input[type=password] → KHÔNG phải role textbox, phải bắt bằng id.
        await expect(page.locator('#connector-field-xray-password')).toHaveAttribute(
            'type',
            'password',
        )
        await step()
    })

    test('TC-CARD-4 — cả 4 ô đều có ディレクトリパス + フォルダを選択 + 一括作成', async () => {
        for (const { category, title } of CATEGORIES) {
            await expect(pathBoxOf(category), `${title}: thiếu ô ディレクトリパス`).toBeVisible()
            await expect(pathBoxOf(category)).toHaveAttribute('aria-label', 'ディレクトリパス')

            const card = cardOf(title)
            await expect(
                card.getByRole('button', { name: 'フォルダを選択' }),
                `${title}: thiếu nút chọn thư mục`,
            ).toBeVisible()
            await expect(
                card.getByRole('button', { name: /^一括作成/ }),
                `${title}: thiếu nút 一括作成`,
            ).toBeVisible()

            originalPaths[category] = await pathBoxOf(category).inputValue()
        }
        console.log(`ディレクトリパス hiện tại: ${JSON.stringify(originalPaths)}`)
        await step()
    })

    // ── Danh mục hãng — phủ HẾT device ───────────────────────────────────────

    test('TC-VENDOR-1 — combo 連携先 liệt kê ĐỦ mọi hãng của mst_cod 58', async () => {
        // Legacy đổ thẳng `WHERE CD_TYPE=58` không lọc, nên UI phải hiện đúng bấy
        // nhiêu dòng + một mục 連携しない ở đầu. Đây là chỗ phủ hết mọi device:
        // thêm/bớt một hãng trong master mà UI không theo là testcase này đỏ.
        await vendorSelectOf('xray').click()
        // Radix Select render listbox qua PORTAL ở body → tìm ở cấp page (Rule 12.6).
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10000 })

        const options = await listbox.getByRole('option').allInnerTexts()
        // Nhãn = anyVal1, rỗng thì rơi về chính cdVal (connector-config-form.tsx:93-99).
        const expected = [
            NO_CONNECTOR_LABEL,
            ...picLinkRows.map((r) => (r.anyVal1?.trim() ? r.anyVal1 : String(r.cdVal))),
        ]
        expect(options.map((t) => t.trim())).toEqual(expected)

        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10000 })
        console.log(`連携先 có ${picLinkRows.length} hãng + 連携しない`)
        await step()
    })

    test('TC-CLEAN-1 — form vừa nạp: 保存 tắt, và ô đang bật sẵn sàng 一括作成', async () => {
        // PHẢI đứng trước mọi testcase có chỉnh sửa. Sau lần `commit()` đầu tiên,
        // form không bao giờ quay lại trạng thái sạch nữa (xem TC-SAVE-5) — nên
        // đây là cửa sổ DUY NHẤT quan sát được trạng thái này.
        await expect(saveButton, 'chưa chỉnh gì thì 保存 phải tắt').toBeDisabled()
        await expect(dirtyBadge).toBeHidden()

        const linkCodeOf = (category: string) =>
            loadedConfig?.connectors.find((c) => c.category === category)?.linkCode ?? 0
        const active = CATEGORIES.find(
            (c) => (originalPaths[c.category] ?? '').trim() !== '' && linkCodeOf(c.category) !== 0,
        )
        skipWithReason(
            !active,
            'máy này chưa bật sẵn ô nào (mọi ô đều thiếu 連携先 và/hoặc ディレクトリパス) — ' +
                'trạng thái sẵn sàng của 一括作成 không tồn tại để mà quan sát. ' +
                'Cấu hình một ô ở màn 機器連携 rồi chạy lại nếu muốn phủ nhánh này.',
        )

        // Trạng thái (4) trong 4 câu gợi ý — ba trạng thái còn lại ở TC-HINT-1.
        const card = cardOf(active!.title)
        await expect(card.getByText(HINT_READY)).toBeVisible()
        await expect(card.getByRole('button', { name: /^一括作成/ })).toBeEnabled()
        await step()
    })

    test('TC-VENDOR-2 — chọn được hãng mà máy KHÔNG có connector (cố ý)', async () => {
        // CodMst.cs:38-41 không lọc theo connector: hợp lệ khi chọn một mã mà máy
        // KHÔNG có connector, và nó chỉ đơn giản là không ghi gì. Chặn ở UI là
        // làm một dòng master trở thành bất khả lưu.
        //
        // "Không có connector" phải hỏi chính agent qua /v1/connectors, KHÔNG suy
        // từ nhãn: master seed đặt tên cho mấy mã vô chủ bằng chính con số
        // ('1','4','6','10'), tức nhãn KHÁC RỖNG, nên lọc theo nhãn rỗng là không
        // bao giờ tìm thấy gì và testcase tự skip mà trông như đã chạy.
        await expect
            .poll(() => supportedLinkCodes.size, {
                message: 'chưa bắt được GET /v1/connectors',
                timeout: 30000,
            })
            .toBeGreaterThan(0)

        const orphan = picLinkRows.find(
            (r) => Number(r.cdVal) !== 0 && !supportedLinkCodes.has(Number(r.cdVal)),
        )
        skipWithReason(
            !orphan,
            'mọi mã cdType 58 đều có connector trên máy này — không còn nhánh nào để kiểm',
        )

        const label = orphan!.anyVal1?.trim() ? orphan!.anyVal1 : String(orphan!.cdVal)
        console.log(`mã không có connector: cdVal=${orphan!.cdVal} nhãn="${label}"`)
        await vendorSelectOf('xray').click()
        await page.getByRole('option', { name: label, exact: true }).click()
        await expect(vendorSelectOf('xray')).toContainText(label)
        await expect(saveButton, 'đổi 連携先 là một chỉnh sửa → 保存 phải bật').toBeEnabled()
        await step()
    })

    test('TC-VENDOR-3 — đổi 連携先 KHÔNG xoá thứ đã gõ trong ô của category', async () => {
        // frm506008.cs:1678 — 4 ô nhập thuộc về CATEGORY chứ không thuộc về hãng.
        const probe = 'C:\\ochacom-e2e\\keep-me'
        await pathBoxOf('xray').fill(probe)

        await vendorSelectOf('xray').click()
        await page.getByRole('option', { name: 'Hercules2007', exact: true }).click()
        await expect(vendorSelectOf('xray')).toContainText('Hercules2007')

        await expect(
            pathBoxOf('xray'),
            'đổi hãng mà mất đường dẫn đã gõ là sai nghiệp vụ legacy',
        ).toHaveValue(probe)
        await step()
    })

    // ── Trạng thái bật/tắt của một ô ─────────────────────────────────────────

    test('TC-HINT-1 — 4 trạng thái gợi ý cạnh 一括作成 và nút bật/tắt theo', async () => {
        const card = cardOf('レントゲンシステム連携')
        const bulk = card.getByRole('button', { name: /^一括作成/ })

        // (1) dirty + có device + có path → chờ lưu. Form đang bẩn từ TC-VENDOR-3.
        await expect(card.getByText(HINT_DIRTY)).toBeVisible()
        await expect(bulk, 'còn chỉnh sửa chưa lưu thì 一括作成 phải tắt').toBeDisabled()

        // (2) có device, path rỗng → chưa bật được (CoopRoentgen.cs:343-355).
        await pathBoxOf('xray').fill('')
        await expect(card.getByText(HINT_NO_PATH)).toBeVisible()
        await expect(bulk).toBeDisabled()

        // (3) 連携しない → chưa chọn thiết bị.
        await vendorSelectOf('xray').click()
        await page.getByRole('option', { name: NO_CONNECTOR_LABEL, exact: true }).click()
        await expect(card.getByText(HINT_NO_DEVICE)).toBeVisible()
        await expect(bulk).toBeDisabled()

        // (4) trạng thái sẵn sàng cần form SẠCH nên không quan sát được ở đây —
        // đã kiểm ở TC-CLEAN-1, trước khi có chỉnh sửa đầu tiên.
        await step()
    })

    // ── 保存 ─────────────────────────────────────────────────────────────────

    test('TC-SAVE-1 — badge 未保存の変更があります hiện ngay khi có chỉnh sửa', async () => {
        // Tự gõ một giá trị CHẮC CHẮN khác thay vì tin rằng testcase trước còn để
        // form bẩn: TC-HINT-1 kết thúc bằng xoá đường dẫn + chọn 連携しない, và trên
        // một máy vốn đã ở đúng trạng thái đó thì form quay về SẠCH — badge tắt,
        // và testcase này đỏ vì một lý do chẳng liên quan gì đến badge.
        //
        // Gõ vào ô CỐ ĐỊNH (予約), không phải ô chọn-hãng: `isConfigurable` luôn
        // đúng với hai ô cố định nên input của chúng KHÔNG BAO GIỜ bị đóng băng.
        // Ô レントゲン thì có — TC-HINT-1 vừa để nó ở 連携しない, và ô chưa chọn thiết
        // bị bị `disabled` (connector-config-form.tsx, `noDeviceChosen`), nên gõ vào
        // đó là chờ hết timeout trên một input không bao giờ nhận chữ.
        //
        // Nửa "chỉ" của mệnh đề (sạch thì badge tắt) do TC-CLEAN-1 giữ.
        await pathBoxOf('appointment').fill('C:\\ochacom-e2e\\dirty-probe')
        await expect(dirtyBadge).toBeVisible()
        await expect(saveButton).toBeEnabled()
        await step()
    })

    test('TC-SAVE-2 — 保存 gửi cả tài liệu; enabled suy từ path, ô rỗng bị loại', async () => {
        expect(loadedConfig, 'TC-NAV-1 chưa bắt được GET /v1/config').not.toBeNull()

        // Dựng một trạng thái nói lên đủ 3 luật của commit():
        //  · xray  = Hercules2007 + path  → giữ lại, enabled = true
        //  · medical-support = 連携しない   → BỊ LOẠI khỏi payload
        //  · appointment (ô cố định) path rỗng → giữ lại nhưng enabled = false
        const xrayPath = 'C:\\ochacom-e2e\\xray'
        await vendorSelectOf('xray').click()
        await page.getByRole('option', { name: 'Hercules2007', exact: true }).click()
        await pathBoxOf('xray').fill(xrayPath)

        await vendorSelectOf('medical-support').click()
        await page.getByRole('option', { name: NO_CONNECTOR_LABEL, exact: true }).click()

        await pathBoxOf('appointment').fill('')

        let sent: AgentConfigPutBody | null = null
        // CHẶN → chỉ soi payload, KHÔNG ghi agent.db và KHÔNG đẩy cloud mirror.
        await withPutIntercepted(
            async (route) => {
                sent = route.request().postDataJSON() as AgentConfigPutBody
                await route.fulfill({
                    status: 204,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': '*',
                    },
                    body: '',
                })
            },
            async () => {
                await saveButton.click()
                await expect(page.getByText('エージェント設定を保存しました。')).toBeVisible({
                    timeout: 30000,
                })
            },
        )

        expect(sent, 'không bắt được PUT /v1/config').not.toBeNull()
        const byCategory = new Map(sent!.connectors.map((c) => [c.category, c]))

        const xray = byCategory.get('xray')
        expect(xray, 'ô có hãng + có path phải được lưu').toBeTruthy()
        expect(xray!.linkCode, 'linkCode phải là mã mst_cod của Hercules2007').toBe(2)
        expect(xray!.enabled, 'có đường dẫn thì ô phải bật').toBe(true)
        expect(xray!.settings.path).toBe(xrayPath)

        expect(
            byCategory.has('medical-support'),
            '連携しない trên ô chọn-hãng phải bị LOẠI khỏi payload (isConfigurable)',
        ).toBe(false)

        const appointment = byCategory.get('appointment')
        expect(appointment, 'ô cố định luôn được lưu dù chưa có đường dẫn').toBeTruthy()
        expect(appointment!.enabled, 'đường dẫn rỗng thì ô phải tắt').toBe(false)

        // Snapshot: nhóm màn này không đụng vẫn phải được chuyển tiếp nguyên xi.
        expect(sent!.printMappings).toEqual(loadedConfig!.printMappings)
        expect(sent!.settings).toEqual(loadedConfig!.settings)
        expect(sent!.expectedConfigVersion).toBe(loadedConfig!.configVersion)
        expect(sent!.syncTicket, 'thiếu ticket đẩy cloud').toBeTruthy()
        await step()
    })

    test('TC-SAVE-3 — agent trả 409: báo đúng câu "màn khác đã đổi", không nuốt', async () => {
        await pathBoxOf('xray').fill('C:\\ochacom-e2e\\conflict')
        await withPutIntercepted(
            async (route) => {
                await route.fulfill({
                    status: 409,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': '*',
                    },
                    // Envelope lỗi của agent là PHẲNG: WriteErrorAsync serialise
                    // `new { code, message }` (AgentEndpointHelpers.cs:35), và
                    // `agentErrorCode` đọc thẳng `error.body.code`
                    // (agent-client.ts:48-51). Bọc thêm một lớp `error` là mã
                    // không đọc được → rơi xuống nhánh lỗi chung.
                    body: JSON.stringify({
                        code: 'config_conflict',
                        message: 'changed elsewhere',
                    }),
                })
            },
            async () => {
                await saveButton.click()
                await expect(
                    page.getByText(
                        '他の画面で設定が変更されました。最新の内容を読み込みました。もう一度ご確認ください。',
                    ),
                ).toBeVisible({ timeout: 30000 })
            },
        )
        await step()
    })

    test('TC-SAVE-4 — lỗi khác: báo エージェント設定の保存に失敗しました。', async () => {
        await pathBoxOf('xray').fill('C:\\ochacom-e2e\\boom')
        await withPutIntercepted(
            async (route) => {
                await route.fulfill({
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Headers': '*',
                    },
                    body: JSON.stringify({ code: 'boom', message: 'boom' }),
                })
            },
            async () => {
                await saveButton.click()
                await expect(page.getByText('エージェント設定の保存に失敗しました。')).toBeVisible({
                    timeout: 30000,
                })
            },
        )
        await step()
    })

    /**
     * Hoàn tác một chỉnh sửa: GIÁ TRỊ phải về đúng như cũ.
     *
     * Cố ý KHÔNG assert 保存 tắt lại. Nút cứ sáng dù không còn gì để lưu là hành
     * vi được CHẤP NHẬN, không phải lỗi — bấm lúc đó chỉ ghi lại đúng thứ đang có.
     *
     * Vì sao nó CÓ THỂ sáng, để người đọc sau không mất công dò lại:
     * `sameConfiguration` so `JSON.stringify` trên mảng `connectors`
     * (use-agent-config-draft.ts:88-94) — nhạy thứ tự. Agent trả
     * `ORDER BY category` (ConnectorConfigRepository.cs:341) còn form dựng lại
     * theo LINKAGE_CATEGORIES (connector-rows.ts:113-115), nên lần `commit()`
     * đầu tiên sắp lại mảng và `isDirty` ở lại true dù mọi GIÁ TRỊ đã khớp.
     *
     * KHÔNG phải lúc nào cũng vậy: `commit()` loại các ô chọn-hãng mang linkCode 0
     * (isConfigurable), và khi chỉ còn appointment + settlement thì thứ tự canonical
     * TRÙNG thứ tự alphabet, form sạch lại được. Tức trạng thái badge ở đây phụ
     * thuộc cấu hình của máy — đó chính là lý do testcase này không assert nó.
     */
    test('TC-SAVE-5 — hoàn tác chỉnh sửa: mọi giá trị trở lại đúng như đã nạp', async () => {
        expect(loadedConfig, 'TC-NAV-1 chưa bắt được GET /v1/config').not.toBeNull()

        const linkCodeOf = (category: string) =>
            loadedConfig!.connectors.find((c) => c.category === category)?.linkCode ?? 0
        for (const category of ['xray', 'medical-support']) {
            const code = linkCodeOf(category)
            const label =
                code === 0
                    ? NO_CONNECTOR_LABEL
                    : (() => {
                          const row = picLinkRows.find((r) => Number(r.cdVal) === code)
                          return row?.anyVal1?.trim() ? row.anyVal1 : String(code)
                      })()
            await vendorSelectOf(category).click()
            await page.getByRole('option', { name: label, exact: true }).click()
            await expect(vendorSelectOf(category)).toContainText(label)
        }
        await restoreForm()

        // Đây mới là thứ đáng chốt: màn hình không âm thầm nuốt mất giá trị nào
        // sau chuỗi chỉnh sửa của TC-VENDOR-* và TC-SAVE-*.
        for (const { category, title } of CATEGORIES) {
            await expect(
                pathBoxOf(category),
                `${title}: ディレクトリパス không trở lại giá trị đã nạp`,
            ).toHaveValue(originalPaths[category] ?? '')
        }
        await step()
    })
})
