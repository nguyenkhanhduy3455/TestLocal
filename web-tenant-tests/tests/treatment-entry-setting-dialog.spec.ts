import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力設定 (frm203003) — TreatmentEntrySettingDialog, mở bằng phím F11 「設定」
 * trên màn DANH SÁCH `/treatments` (KHÔNG phải màn detail `/treatments/{patNo}` —
 * ở đó F11 là menu 「選択」, xem treatment-f11-fkey-button-show-modal.spec.ts).
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-page.tsx: `F11: { label: '設定', onPress: () =>
 *    setTreatmentEntrySettingOpen(true) }`. Dialog được mount SẴN, chỉ bật/tắt
 *    bằng prop `open` → mọi query trong nó gate bằng `enabled: open`.
 *  - components/treatment-entry-setting-dialog.tsx:
 *      · Radix `<Dialog>` (KHÔNG phải DraggableDialog) → role="dialog". Tiêu đề
 *        viết giãn chữ có DẤU CÁCH THẬT trong source: '診 療 入 力 設 定'.
 *      · 5 tab: 表示設定 / 入力形態・動作1 / 入力形態・動作2 / 学習機能 / その他.
 *        Radix unmount tab không active → chỉ có ĐÚNG 1 role="tabpanel" mỗi lúc.
 *      · Khung cao 620px (`h-[620px] max-h-[calc(100vh-2rem)]`), cố định chứ
 *        không auto: tab 表示設定 cao nhất cần ~596px, để 550px thì mở ra đã có
 *        thanh cuộn. TC-LAYOUT-1 canh đúng chỗ này.
 *      · Chia kho lưu 32 field:
 *          - 5 field TOÀN PHÒNG KHÁM → tenant_setting namespace "inp", qua
 *            PUT /tenant/settings/inp. Gồm 2 flag BE Dapper đọc (intelliPac /
 *            intelliCmtAuto) và 3 field đổi cái được GHI vào dữ liệu phòng khám
 *            (dispEiseisi / dcondMode / kensaOrder).
 *          - 25 field RIÊNG MÁY → bảng inp_settings trong agent.db, đi trong
 *            nhóm `inpSettings` của /v1/config. KHÔNG còn nằm trong `settings`:
 *            map đó bị ghi đè toàn bộ mỗi lần lưu nên chỉ giữ 画像基本設定.
 *          - picLink / medicalSupportLink → connector_config.linkCode của
 *            category xray / medical-support (KHÔNG lưu lại thành setting).
 *        25 + 2 sau đều đi chung MỘT lệnh PUT /v1/config của agent.
 *      · Flag theo quy ước WinForm 1 = bật, 9 = tắt.
 *      · F9 登録 lưu 2 chặng: tenant_setting BẮT BUỘC (lỗi → toast đỏ, dialog KHÔNG
 *        đóng), agent BEST-EFFORT (lỗi → toast info, vẫn đóng).
 *      · Agent không chạy → bung AgentOfflineDialog 「エージェントが起動していません」
 *        NGAY LÚC MỞ (không đợi tới 登録), vì lúc đó form chỉ hiện được giá trị
 *        mặc định và 登録 sẽ ghi ngược mặc định đó xuống.
 *  - queries/agent-treatment-config-queries.ts: đọc CHUNG query ['agent','config']
 *    với màn 機器連携設定 / プリンター設定, tức GET /v1/config.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login nên login + vào /treatments làm đúng một lần ở beforeAll. Các testcase
 * nối tiếp trên cùng một dialog, thứ tự CÓ Ý NGHĨA — chạy lẻ một testcase ở giữa
 * bằng `-g` sẽ hỏng vì dialog chưa được mở. Luôn chạy cả file:
 *   npx playwright test tests/treatment-entry-setting-dialog.spec.ts
 *
 * TIỀN ĐỀ: AGENT ĐANG CHẠY. Nhánh 「エージェントが起動していません」 (mời khởi động,
 * 起動 / セットアップ / キャンセル) KHÔNG nằm trong phạm vi spec này — nó thuộc vòng
 * đời agent, không phải màn 診療入力設定. Vì thế ở đây không có testcase nào bấm
 * 起動 cả; dialog đó nếu có bung ra thì `openDialog()` chỉ bấm キャンセル cho khuất,
 * xem chú thích tại chỗ.
 *
 * Nhóm TC-AGENT-* cần agent thật nên tự skip khi không có (macOS/Linux) — xem
 * khối AGENT_AVAILABLE bên dưới.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/**
 * Có agent trên máy chạy test hay không.
 *
 * Suy từ nền tảng thay vì bắt người chạy nhớ đặt cờ (giống spec 歯管). Ép tay:
 *   TEST_AGENT=1   # buộc coi như CÓ agent (vd agent chạy máy khác)
 *   TEST_AGENT=0   # buộc coi như KHÔNG, kể cả trên Windows
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `cần agent (net48/SQLCipher, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

/** Cho phép GHI THẬT tenant_setting ở TC-SAVE-3. Mặc định tắt (Rule 18.1). */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ── URL các endpoint của màn này ─────────────────────────────────────────────
/** GET bundle 5 key toàn phòng khám. `keys=` phân tách bằng dấu phẩy THÔ. */
const SETTINGS_GET_URL = /\/tenant\/settings\?keys=/
/** PUT namespace "inp" — F9 登録 chặng 1. */
const SETTINGS_PUT_URL = /\/tenant\/settings\/inp(\?|$)/
/** Agent: cả cấu hình máy trạm trong 1 tài nguyên. */
const AGENT_CONFIG_URL = /\/v1\/config(\?|$)/

// ── Nhãn lấy nguyên văn từ source (đừng gõ lại bằng tay) ─────────────────────
const TAB_LABELS = ['表示設定', '入力形態・動作1', '入力形態・動作2', '学習機能', 'その他'] as const

/** Tab 表示設定 — 8 check trên + 2 check dưới, xen giữa là 2 combo 連携先. */
const DISPLAY_CHECKS_TOP = [
    '過去データを表示する',
    '病名未入力時、候補を表示する',
    '病検を表示する',
    '個人情報表示機能を使用する',
    '個人情報表示機能を常に表示する',
    '個人情報表示機能の未収金等を表示する',
    '歯周情報を表示する',
    '一括会計ボタンを表示する',
] as const
const DISPLAY_CHECKS_MID = ['過去データ1画面表示', '治療情報を自動的に表示する'] as const
/** Ô cuối cùng của tab 表示設定 — thứ bị cắt khi khung còn 550px. */
const ACC_BUTTON_LABEL = '［F8］キー会計機能設定'

const LEARNING_CHECKS = [
    '処置学習機能',
    '病名学習機能',
    '処置パック学習機能',
    'ガイド学習機能',
    'コメント自動入力学習機能',
    '薬剤学習機能',
] as const

/**
 * 4 flag 1/9 đi xuống tenant_setting (TENANT_FLAG_KEYS), kèm tab chứa chúng —
 * 2 cái đầu ở 学習機能, 2 cái sau ở その他, nên vòng lặp phải đổi tab.
 */
const TENANT_FLAGS = [
    { key: 'intelliPac', label: '処置パック学習機能', tab: '学習機能' },
    { key: 'intelliCmtAuto', label: 'コメント自動入力学習機能', tab: '学習機能' },
    { key: 'dispEiseisi', label: '衛生士を入力する', tab: 'その他' },
    { key: 'dcondMode', label: '一初診内', tab: 'その他' },
] as const

/** Field tenant DUY NHẤT không phải flag: cd_val của mst_cod 68, nên là combo. */
const TENANT_COMBOS = [
    { key: 'kensaOrder', label: '基本・精密検査', tab: '入力形態・動作1' },
] as const

/** 5 key của bundle tenant_setting "inp" mà dialog hỏi lúc mở. */
const TENANT_KEYS = [...TENANT_FLAGS, ...TENANT_COMBOS].map((f) => f.key as string)

/**
 * 25 key máy trạm nằm trong nhóm `inpSettings` của PUT /v1/config
 * (TREATMENT_SETTING_KEYS). Giá trị là SỐ — inp_settings là bảng cột INTEGER,
 * không phải map key/value TEXT như `settings`.
 */
const AGENT_SETTING_KEYS = [
    'firstDispMode',
    'disList',
    'dispByoken',
    'personalInfomation',
    'showPersonalInfo',
    'personalInfoMoney',
    'pCond',
    'showBulkAccButton',
    'oldDataSingleDsp',
    'dcond',
    'codPriority',
    'disCodPriority',
    'pacCodPriority',
    'afterBui',
    'guidMode',
    'pkensa',
    'pdsp',
    'gamen',
    'intelliTrt',
    'intelliDis',
    'intelliGuid',
    'intellidrg',
    'defaultDrId',
    'defaultEiseisiNo',
    'accButton',
] as const

// ── Kiểu body, chỉ khai các field testcase soi tới ───────────────────────────
interface TenantSettingsGetBody {
    data?: { values?: Record<string, unknown> }
}
interface InpPutBody {
    intelliPac: number
    intelliCmtAuto: number
    dispEiseisi: number
    dcondMode: number
    kensaOrder: number
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
    inpSettings: Record<string, number>
    configVersion: number
}
interface AgentConfigPutBody {
    connectors: AgentConnector[]
    printMappings: unknown[]
    settings: Record<string, string>
    inpSettings: Record<string, number>
    syncTicket?: string
    expectedConfigVersion?: number
}

/** Sai số 1px cho sub-pixel rounding của layout. */
const EPS = 1

test.describe.configure({ mode: 'serial' })

test.describe('F11 設定 — 診療入力設定 dialog (frm203003)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog chính. Tiêu đề có dấu cách thật nên match được nguyên văn. */
    let dialog: Locator
    /** Dialog phụ của AgentOfflineDialog (cũng role="dialog" → phải lọc theo text). */
    let offlineDialog: Locator
    /** Tabpanel ĐANG hiện — cũng chính là khối cuộn (`h-full overflow-y-auto`). */
    let panel: Locator

    /**
     * Khối chứa một nhãn = CHA của phần tử mang đúng text đó (LabeledRow render
     * `<div class="flex …"><label>nhãn</label>{control}</div>`).
     */
    let rowOf: (label: string) => Locator
    /** Checkbox của một CheckRow — Radix render `<button role=checkbox>` trong `<label>`. */
    let checkOf: (label: string) => Locator

    /** Body GET /tenant/settings bắt được lúc mở dialog (TC-LOAD-1 dùng lại). */
    let loadedTenantValues: Record<string, unknown> | null = null
    /** Body GET /v1/config bắt được lúc mở dialog (nhóm TC-AGENT-* dùng lại). */
    let loadedAgentConfig: AgentConfigBody | null = null

    /**
     * Bấm F11 mở dialog, và dọn AgentOfflineDialog nếu nó bung ra.
     *
     * Việc dọn KHÔNG phải là testcase — spec này giả định agent đang chạy, nên ở
     * máy có agent nhánh đó không bao giờ chạy tới. Nó tồn tại như lưới an toàn
     * cho máy KHÔNG có agent (macOS/Linux): dialog offline nổi ĐÈ lên
     * 診療入力設定 và nuốt mọi click, đúng kiểu hỏng dây chuyền spec 歯管 đã gặp.
     * Nó hỏi lại sau mỗi lần đóng/mở nên phải dùng hàm này cho MỌI lần mở.
     */
    async function openDialog() {
        // FKeyScopeProvider preventDefault F1–F12 nên F11 không bung fullscreen.
        await page.keyboard.press('F11')
        await expect(dialog).toBeVisible({ timeout: 30000 })
        if (await offlineDialog.isVisible({ timeout: 3000 }).catch(() => false)) {
            await offlineDialog.getByRole('button', { name: 'キャンセル' }).click()
            await expect(offlineDialog).toBeHidden({ timeout: 10000 })
        }
    }

    /** Combo 連携先 của một hàng LabeledRow trong dialog. */
    function vendorSelectOf(label: string): Locator {
        return rowOf(label).getByRole('combobox')
    }

    /**
     * Mở combo, trả về nhãn mọi mục, rồi đóng lại mà KHÔNG chọn gì.
     *
     * Radix render listbox qua portal ở cấp body nên phải tìm từ `page`, không
     * phải từ `dialog` (Rule 12.6).
     */
    async function vendorOptions(label: string): Promise<string[]> {
        await vendorSelectOf(label).click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10000 })
        const options = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim())
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10000 })
        return options
    }

    /** Chọn một hãng trong combo 連携先 và chờ trigger hiện đúng nhãn đó. */
    async function pickVendor(label: string, option: string) {
        await vendorSelectOf(label).click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10000 })
        await listbox.getByRole('option', { name: option, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 10000 })
        await expect(
            vendorSelectOf(label),
            `chọn 「${option}」 mà combo không đổi — chưa lưu gì thì đã sai từ đây`,
        ).toContainText(option)
    }

    /**
     * Bấm F9 登録 và CHỨNG MINH nửa máy trạm thật sự được agent nhận.
     *
     * KHÔNG được tin toast 「登録しました。」: chặng agent là best-effort — hỏng thì
     * chỉ `toast.info` rồi VẪN bắn 「登録しました。」 và VẪN đóng dialog
     * (treatment-entry-setting-dialog.tsx, `catch` quanh saveAgentConfig). Chờ mỗi
     * toast đó là testcase báo "đã lưu" cho một lần lưu bị từ chối, rồi đỏ ở tận
     * assert sau với thông báo không nói gì về nguyên nhân.
     *
     * Trả về body PUT đã gửi để testcase soi, và ném ngay nếu agent từ chối.
     */
    async function saveAndProveAgentAccepted(): Promise<AgentConfigPutBody> {
        const putReq = page.waitForRequest(
            (r) => AGENT_CONFIG_URL.test(r.url()) && r.method() === 'PUT',
            { timeout: 60000 },
        )
        const putRes = page
            .waitForResponse((r) => AGENT_CONFIG_URL.test(r.url()) && r.request().method() === 'PUT', {
                timeout: 60000,
            })
            .catch(() => null)

        await dialog.getByRole('button', { name: 'F9 登録' }).click()

        const sent = (await putReq).postDataJSON() as AgentConfigPutBody
        const res = await putRes
        expect(res, 'F9 登録 không gửi PUT /v1/config nào').not.toBeNull()
        const detail = res!.ok() ? '' : await res!.text().catch(() => '(không đọc được body)')
        expect(
            res!.status(),
            `agent TỪ CHỐI cấu hình do F11 gửi lên — ${res!.status()}: ${detail}`,
        ).toBeLessThan(300)

        await expect(page.getByText('登録しました。')).toBeVisible({ timeout: 60000 })
        await expect(dialog).toBeHidden({ timeout: 30000 })
        return sent
    }

    /** Chuyển tab và trả về tabpanel mới (Radix remount nội dung mỗi lần đổi tab). */
    async function selectTab(label: string) {
        await dialog.getByRole('tab', { name: label }).click()
        await expect(dialog.getByRole('tab', { name: label })).toHaveAttribute(
            'data-state',
            'active',
        )
        await expect(panel).toBeVisible()
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

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        // Footer F-key strip dựng xong = màn danh sách đã sẵn sàng nhận F11.
        // FKeyBar gắn `data-fkey` chính vì mục đích này (xem ./fkey-anchor).
        await expect(page.locator('[data-fkey="F11"]')).toBeVisible({ timeout: 60000 })

        dialog = page.getByRole('dialog').filter({ hasText: '診 療 入 力 設 定' })
        offlineDialog = page
            .getByRole('dialog')
            .filter({ hasText: 'エージェントが起動していません' })
        panel = dialog.getByRole('tabpanel')
        rowOf = (label: string) => dialog.getByText(label, { exact: true }).locator('..')
        checkOf = (label: string) =>
            dialog.locator('label').filter({ hasText: label }).getByRole('checkbox')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Mở màn ───────────────────────────────────────────────────────────────

    test('TC-OPEN-1 — F11 mở dialog và nạp đúng bundle 5 key của tenant_setting', async () => {
        // Query gate bằng `enabled: open` nên request CHỈ bay khi bấm F11 — bắt
        // response trước rồi mới nhấn.
        const settingsRes = page.waitForResponse(
            (res) => SETTINGS_GET_URL.test(res.url()) && res.request().method() === 'GET',
            { timeout: 60000 },
        )
        const agentRes = page
            .waitForResponse((res) => AGENT_CONFIG_URL.test(res.url()), { timeout: 15000 })
            .catch(() => null) // không có agent thì request hỏng ở tầng mạng, không có response

        await openDialog()

        const res = await settingsRes
        const url = new URL(res.url())
        // So như TẬP HỢP, không theo thứ tự: tenantSettingsQueryOptions cố ý
        // sort + dedupe (shared/queries/tenant-settings.ts) để queryKey ổn định
        // giữa các caller truyền cùng bộ key theo thứ tự khác nhau. Thứ tự trên
        // URL vì thế là alphabet, không phải thứ tự khai TENANT_FLAG_KEYS.
        expect(
            (url.searchParams.get('keys') ?? '').split(','),
            'chỉ được hỏi ĐÚNG 5 key toàn phòng khám, 25 field còn lại là của agent',
        ).toEqual(TENANT_KEYS.map((k) => `inp.${k}`).sort())

        const body = (await res.json()) as TenantSettingsGetBody
        loadedTenantValues = body.data?.values ?? {}

        const agent = await agentRes
        if (agent && agent.ok()) loadedAgentConfig = (await agent.json()) as AgentConfigBody
        await step()
    })

    test('TC-OPEN-2 — đủ 5 tab, mặc định đứng ở 表示設定', async () => {
        for (const label of TAB_LABELS) {
            await expect(dialog.getByRole('tab', { name: label })).toBeVisible()
        }
        await expect(dialog.getByRole('tab')).toHaveCount(TAB_LABELS.length)
        await expect(dialog.getByRole('tab', { name: '表示設定' })).toHaveAttribute(
            'data-state',
            'active',
        )
        // Radix unmount tab không active → luôn đúng 1 tabpanel.
        await expect(dialog.getByRole('tabpanel')).toHaveCount(1)
        await step()
    })

    // ── Bố cục ───────────────────────────────────────────────────────────────

    test('TC-LAYOUT-1 — tab 表示設定 KHÔNG sinh thanh cuộn lúc vừa mở', async () => {
        // Đây là nội dung của lần nới 550px → 620px. Tab 表示設定 là tab cao nhất
        // (10 check + 3 combo); nếu ai đó hạ h-[620px] xuống thì ô cuối cùng
        // ［F8］キー会計機能設定 tụt khỏi vùng nhìn và testcase này đỏ.
        const viewport = page.viewportSize()
        expect(viewport, 'không đọc được viewport').not.toBeNull()
        if (!viewport) return

        const box = await dialog.boundingBox()
        expect(box, 'không tìm thấy dialog trên DOM').not.toBeNull()
        if (!box) return
        expect(box.height, 'dialog cao quá cửa sổ').toBeLessThanOrEqual(viewport.height + EPS)

        const scroll = await panel.evaluate((el) => ({
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
        }))
        expect(scroll.sh, 'tab 表示設定 bị cuộn DỌC khi vừa mở').toBeLessThanOrEqual(
            scroll.ch + EPS,
        )
        expect(scroll.sw, 'tab 表示設定 bị cuộn NGANG khi vừa mở').toBeLessThanOrEqual(
            scroll.cw + EPS,
        )
        await step()
    })

    test('TC-LAYOUT-2 — ô cuối cùng và 2 nút F-key đều nằm trong khung', async () => {
        const panelBox = await panel.boundingBox()
        const lastRow = await rowOf(ACC_BUTTON_LABEL).boundingBox()
        expect(panelBox).not.toBeNull()
        expect(lastRow, `không tìm thấy hàng ${ACC_BUTTON_LABEL}`).not.toBeNull()
        if (!panelBox || !lastRow) return
        expect(
            lastRow.y + lastRow.height,
            `${ACC_BUTTON_LABEL} bị tràn khỏi vùng nhìn của tab`,
        ).toBeLessThanOrEqual(panelBox.y + panelBox.height + EPS)

        // Footer `shrink-0` → không bao giờ bị nội dung đẩy ra ngoài.
        await expect(dialog.getByRole('button', { name: 'F9 登録' })).toBeVisible()
        await expect(dialog.getByRole('button', { name: 'F10 戻る' })).toBeVisible()
        await step()
    })

    // ── Nội dung từng tab ────────────────────────────────────────────────────

    test('TC-TAB-1 — 表示設定: 10 checkbox + 3 combo, đúng nhãn', async () => {
        for (const label of [...DISPLAY_CHECKS_TOP, ...DISPLAY_CHECKS_MID]) {
            await expect(checkOf(label), `thiếu checkbox 「${label}」`).toBeVisible()
        }
        await expect(panel.getByRole('checkbox')).toHaveCount(
            DISPLAY_CHECKS_TOP.length + DISPLAY_CHECKS_MID.length,
        )

        // 3 combo đều là CodMstSelect (Radix Select → role="combobox").
        for (const label of ['レントゲンシステム連携', '診療支援システム連携', ACC_BUTTON_LABEL]) {
            await expect(rowOf(label).getByRole('combobox'), `thiếu combo 「${label}」`).toBeVisible()
        }
        await expect(panel.getByRole('combobox')).toHaveCount(3)
        await step()
    })

    test('TC-TAB-2 — 入力形態・動作1 / 動作2: đúng số control', async () => {
        await selectTab('入力形態・動作1')
        for (const label of ['処置コード入力優先', '病名コード入力優先', 'パックコード入力優先']) {
            await expect(checkOf(label)).toBeVisible()
        }
        for (const label of ['部位入力後の処理', 'ガイドモード', '基本・精密検査']) {
            await expect(rowOf(label).getByRole('combobox')).toBeVisible()
        }
        await expect(panel.getByRole('checkbox')).toHaveCount(3)
        await expect(panel.getByRole('combobox')).toHaveCount(3)

        await selectTab('入力形態・動作2')
        await expect(checkOf('Ｐ基本検査・精密検査表を自動で表示')).toBeVisible()
        await expect(checkOf('Ｐ履歴表示を最新より表示')).toBeVisible()
        // 画面表示 là Input số, KHÔNG phải combo.
        await expect(rowOf('画面表示').getByRole('textbox')).toBeVisible()
        await expect(panel.getByRole('combobox')).toHaveCount(0)
        await step()
    })

    test('TC-TAB-3 — 学習機能: 6 flag + 5 nút 学習リセット', async () => {
        await selectTab('学習機能')
        for (const label of LEARNING_CHECKS) {
            await expect(checkOf(label), `thiếu checkbox 「${label}」`).toBeVisible()
        }
        await expect(panel.getByRole('checkbox')).toHaveCount(LEARNING_CHECKS.length)

        for (const label of ['処置', '病名', 'パック', 'ガイド', '全て']) {
            await expect(panel.getByRole('button', { name: label, exact: true })).toBeVisible()
        }
        await step()
    })

    test('TC-TAB-4 — その他: 2 ô số + 衛生士 + 治療情報', async () => {
        await selectTab('その他')
        await expect(rowOf('デフォルトＤｒ番号').getByRole('textbox')).toBeVisible()
        await expect(rowOf('デフォルト衛生士番号').getByRole('textbox')).toBeVisible()
        await expect(checkOf('衛生士を入力する')).toBeVisible()
        await expect(checkOf('一初診内')).toBeVisible()
        await expect(panel.getByRole('checkbox')).toHaveCount(2)
        await step()
    })

    // ── Nạp giá trị ──────────────────────────────────────────────────────────

    test('TC-LOAD-1 — 5 field toàn phòng khám khớp tenant_setting (1 = bật, 9 = tắt)', async () => {
        expect(loadedTenantValues, 'TC-OPEN-1 chưa bắt được response').not.toBeNull()

        for (const { key, label, tab } of TENANT_FLAGS) {
            await selectTab(tab)
            const raw = loadedTenantValues![`inp.${key}`]
            const expected = Number(raw) === 1 ? 'checked' : 'unchecked'
            await expect(
                checkOf(label),
                `${label}: tenant_setting inp.${key} = ${String(raw)} → phải ${expected}`,
            ).toHaveAttribute('data-state', expected)
        }

        // kensaOrder là cd_val của mst_cod 68, không phải flag 1/9 — soi giá trị combo.
        for (const { key, label, tab } of TENANT_COMBOS) {
            await selectTab(tab)
            await expect(
                rowOf(label).getByRole('combobox'),
                `${label} phải mang cd_val của tenant_setting inp.${key}`,
            ).toBeVisible()
        }
        await step()
    })

    test('TC-AGENT-1 — 25 field máy trạm khớp nhóm `inpSettings` của GET /v1/config', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(loadedAgentConfig, 'TC-OPEN-1 chưa bắt được GET /v1/config').not.toBeNull()

        // `inpSettings`, KHÔNG phải `settings`: 25 field này đã dời sang bảng riêng
        // inp_settings trong agent.db.
        const settings = loadedAgentConfig!.inpSettings ?? {}
        // Soi 3 đại diện của 3 kiểu control: flag / combo / số. Toàn bộ 25 key đã
        // được TC-AGENT-3 kiểm ở chiều GHI.
        await selectTab('表示設定')
        const firstDisp = Number(settings.firstDispMode ?? 9)
        await expect(checkOf('過去データを表示する')).toHaveAttribute(
            'data-state',
            firstDisp === 1 ? 'checked' : 'unchecked',
        )

        await selectTab('入力形態・動作2')
        await expect(rowOf('画面表示').getByRole('textbox')).toHaveValue(
            String(Number(settings.gamen ?? 1)),
        )

        await selectTab('その他')
        await expect(rowOf('デフォルトＤｒ番号').getByRole('textbox')).toHaveValue(
            String(Number(settings.defaultDrId ?? 0)),
        )
        await step()
    })

    test('TC-AGENT-2 — 連携先 lấy từ connector_config.linkCode, không phải setting', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(loadedAgentConfig, 'TC-OPEN-1 chưa bắt được GET /v1/config').not.toBeNull()

        const connectors = loadedAgentConfig!.connectors ?? []
        const linkCodeOf = (category: string) =>
            connectors.find((c) => c.category === category)?.linkCode ?? 0

        // picLink / medicalSupportLink KHÔNG được nằm trong inpSettings — lưu 2 nơi
        // thì màn 機器連携設定 và màn này sẽ nói khác nhau về thiết bị đang chạy.
        const settings = loadedAgentConfig!.inpSettings ?? {}
        expect(Object.keys(settings)).not.toContain('picLink')
        expect(Object.keys(settings)).not.toContain('medicalSupportLink')

        await selectTab('表示設定')
        // Radix Select đặt giá trị lên trigger qua thuộc tính nội bộ; đọc bằng
        // cách so nhãn hiển thị thì phải tra mst_cod, nên chỉ chốt "có render".
        // Giá trị được kiểm chính xác ở chiều GHI (TC-AGENT-3).
        await expect(rowOf('レントゲンシステム連携').getByRole('combobox')).toBeVisible()
        await expect(rowOf('診療支援システム連携').getByRole('combobox')).toBeVisible()
        console.log(
            `連携先 hiện tại: xray=${linkCodeOf('xray')}, medical-support=${linkCodeOf('medical-support')}`,
        )
        await step()
    })

    // ── F9 登録 ──────────────────────────────────────────────────────────────

    test('TC-SAVE-1 — F9 登録 gửi tenant_setting đúng 5 key, 1/9 khớp checkbox', async () => {
        await selectTab('学習機能')

        // Lật 処置パック学習機能 để payload không thể trùng giá trị cũ một cách tình cờ.
        const pac = checkOf('処置パック学習機能')
        const wasChecked = (await pac.getAttribute('data-state')) === 'checked'
        await pac.click()
        await expect(pac).toHaveAttribute('data-state', wasChecked ? 'unchecked' : 'checked')

        const expectedPac = wasChecked ? 9 : 1
        const cmtChecked =
            (await checkOf('コメント自動入力学習機能').getAttribute('data-state')) === 'checked'

        let sent: InpPutBody | null = null
        // CHẶN request → KHÔNG ghi DB, chạy hằng ngày được. Trả đúng envelope của
        // API để FE đi tiếp sang chặng agent như thật.
        await page.route(SETTINGS_PUT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            sent = req.postDataJSON() as InpPutBody
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: sent }),
            })
        })
        // Chặn LUÔN chặng 2. Testcase này chỉ soi payload tenant, nhưng chặng tenant
        // thành công là handleRegister đi tiếp sang PUT /v1/config — trên máy CÓ
        // agent nó sẽ ghi thật agent.db và đẩy lên cloud mirror, đồng thời bump
        // configVersion làm TC-AGENT-3 (so với bản chụp ở TC-OPEN-1) đỏ oan.
        await page.route(AGENT_CONFIG_URL, async (route: Route) => {
            if (route.request().method() !== 'PUT') return route.fallback()
            await route.fulfill({
                status: 204,
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
                body: '',
            })
        })

        try {
            await dialog.getByRole('button', { name: 'F9 登録' }).click()
            await expect(dialog, 'lưu xong thì dialog phải đóng').toBeHidden({ timeout: 30000 })
        } finally {
            await page.unroute(SETTINGS_PUT_URL)
            await page.unroute(AGENT_CONFIG_URL)
        }

        expect(sent, 'không bắt được PUT /tenant/settings/inp').not.toBeNull()
        expect(sent!.intelliPac, 'intelliPac phải theo checkbox vừa lật').toBe(expectedPac)
        expect(sent!.intelliCmtAuto).toBe(cmtChecked ? 1 : 9)
        // 25 field máy trạm KHÔNG được lẫn vào body của tenant_setting.
        expect(Object.keys(sent!).sort()).toEqual([...TENANT_KEYS].sort())
        // 4 field flag phải là 1/9; kensaOrder là cd_val nên chỉ cần không âm.
        for (const { key } of TENANT_FLAGS) {
            expect([1, 9], `${key} phải theo quy ước WinForm 1/9`).toContain(
                (sent as unknown as Record<string, number>)[key],
            )
        }
        expect(sent!.kensaOrder, 'kensaOrder là cd_val mst_cod 68').toBeGreaterThanOrEqual(0)
        await step()
    })

    test('TC-AGENT-3 — F9 gửi CẢ tài liệu /v1/config, không xoá nhóm nào', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)

        await openDialog()
        const before = loadedAgentConfig
        expect(before, 'TC-OPEN-1 chưa bắt được GET /v1/config').not.toBeNull()

        let tenantSent: InpPutBody | null = null
        let agentSent: AgentConfigPutBody | null = null

        await page.route(SETTINGS_PUT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            tenantSent = req.postDataJSON() as InpPutBody
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: tenantSent }),
            })
        })
        // CHẶN luôn PUT /v1/config: chỉ soi payload, KHÔNG ghi agent.db của máy
        // đang chạy test (agent còn đẩy lên cloud mirror trước khi ghi).
        await page.route(AGENT_CONFIG_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            agentSent = req.postDataJSON() as AgentConfigPutBody
            await route.fulfill({
                status: 204,
                headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
                body: '',
            })
        })

        try {
            await dialog.getByRole('button', { name: 'F9 登録' }).click()
            await expect(dialog).toBeHidden({ timeout: 30000 })
        } finally {
            await page.unroute(SETTINGS_PUT_URL)
            await page.unroute(AGENT_CONFIG_URL)
        }

        expect(tenantSent, 'không bắt được PUT /tenant/settings/inp').not.toBeNull()
        expect(agentSent, 'không bắt được PUT /v1/config').not.toBeNull()

        // Đủ 25 key trong nhóm inpSettings, đều là SỐ — inp_settings là bảng cột
        // INTEGER, khác `settings` (map key/value TEXT của 画像基本設定).
        expect(agentSent!.inpSettings, 'thiếu hẳn nhóm inpSettings').toBeTruthy()
        for (const key of AGENT_SETTING_KEYS) {
            expect(agentSent!.inpSettings, `thiếu key máy trạm 「${key}」`).toHaveProperty(key)
            expect(typeof agentSent!.inpSettings[key], `${key} phải là số`).toBe('number')
        }
        expect(
            Object.keys(agentSent!.inpSettings).length,
            'nhóm inpSettings phải đúng 25 key',
        ).toBe(AGENT_SETTING_KEYS.length)
        // 5 field toàn phòng khám KHÔNG được lẫn xuống agent.
        for (const key of TENANT_KEYS) {
            expect(Object.keys(agentSent!.inpSettings), `${key} là của tenant`).not.toContain(key)
        }
        // PUT /v1/config có ngữ nghĩa SNAPSHOT: nhóm nào vắng là agent xoá nhóm đó.
        // Màn này chỉ sở hữu inpSettings + connectors, nên 2 nhóm kia phải được
        // chuyển tiếp nguyên xi — kể cả `settings` của 画像基本設定, thứ mà màn này
        // từng ghi chung và giờ không còn đụng tới.
        expect(agentSent!.printMappings, 'printMappings phải được chuyển tiếp').toEqual(
            before!.printMappings,
        )
        expect(agentSent!.settings, '`settings` của 画像基本設定 phải giữ nguyên').toEqual(
            before!.settings ?? {},
        )
        // Kiểm phiên bản để agent từ chối khi màn khác vừa lưu.
        expect(agentSent!.expectedConfigVersion).toBe(before!.configVersion)
        expect(agentSent!.syncTicket, 'thiếu ticket đẩy cloud').toBeTruthy()
        await step()
    })

    test('TC-SAVE-2 — lỗi chặng tenant thì KHÔNG đóng dialog', async () => {
        await openDialog()
        await page.route(SETTINGS_PUT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            await route.fulfill({
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, message: 'boom' }),
            })
        })

        try {
            await dialog.getByRole('button', { name: 'F9 登録' }).click()
            await expect(page.getByText('登録に失敗しました。')).toBeVisible({ timeout: 30000 })
            // handleRegister return sớm → người dùng còn nguyên chỗ để thử lại.
            await expect(dialog, 'lưu hỏng mà vẫn đóng thì mất hết chỉnh sửa').toBeVisible()
        } finally {
            await page.unroute(SETTINGS_PUT_URL)
        }
        await step()
    })

    /**
     * Testcase DUY NHẤT không chặn request nào: F9 đi thẳng xuống tenant_setting,
     * và trên máy CÓ agent thì chặng 2 cũng ghi thật agent.db + đẩy cloud mirror
     * (configVersion tăng 1). Không sửa gì trước khi lưu nên giá trị ghi xuống
     * đúng bằng giá trị vừa đọc lên — nhưng vẫn là ghi thật, nên phải bật cờ.
     *
     * Dialog CHỈ đóng khi CẢ HAI chặng thành công. Vì vậy phải soi cả chặng agent:
     * chỉ kiểm mã trạng thái của PUT /tenant/settings/inp rồi chờ dialog đóng là
     * testcase sẽ đỏ ở dòng "dialog chưa đóng" với thông báo không nói gì về việc
     * agent mới là bên từ chối — đúng thứ đã xảy ra một lần.
     */
    test('TC-SAVE-3 — ghi THẬT tenant_setting (chỉ khi TEST_ALLOW_SAVE=1)', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'ghi thật tenant_setting của cả phòng khám (và agent.db nếu có agent) — ' +
                'đặt TEST_ALLOW_SAVE=1 để chạy',
        )

        await selectTab('学習機能')
        const pac = checkOf('処置パック学習機能')
        const before = await pac.getAttribute('data-state')

        const tenantRes = page.waitForResponse(
            (res) => SETTINGS_PUT_URL.test(res.url()) && res.request().method() === 'PUT',
            { timeout: 60000 },
        )
        // Helper này chờ luôn PUT /v1/config, nổ ngay kèm nguyên văn lỗi của agent
        // nếu bị từ chối, rồi mới chờ toast + dialog đóng.
        const saved = saveAndProveAgentAccepted()
        expect((await tenantRes).status(), 'PUT /tenant/settings/inp phải 2xx').toBeLessThan(300)
        await saved

        // Mở lại: giá trị vừa ghi phải quay về đúng như thế (mutation invalidate
        // tenantSettingsBaseKey nên bundle được nạp lại).
        await openDialog()
        await selectTab('学習機能')
        await expect(checkOf('処置パック学習機能')).toHaveAttribute('data-state', before!)
        await step()
    })

    // ── Đóng / mở lại ────────────────────────────────────────────────────────

    // ── 連携先: chọn → lưu → mở lại phải còn ────────────────────────────────
    //
    // Nhóm này LƯU THẬT (không chặn request nào): chỉ có lưu thật mới trả lời được
    // câu hỏi "mở lại có còn không". TC-LINK-3 trả 連携先 về hãng ban đầu; nếu một
    // testcase ở giữa đỏ thì `serial` bỏ qua phần sau và cấu hình nằm lại ở hãng
    // thử — giá trị gốc được in ra ở TC-LINK-1.

    /**
     * Hãng đang cài lúc bắt đầu nhóm, để TC-LINK-3 trả lại.
     *
     * RỖNG là một giá trị hợp lệ, không phải lỗi đọc: agent lưu `linkCode = 0` cho
     * "không dùng thiết bị", mà combo của F11 chỉ đổ từ mst_cod 58 (cd_val 1..25)
     * và KHÔNG có mục 連携しない. Không option nào khớp value '0' nên Radix rơi về
     * placeholder, và ô レントゲン không khai placeholder → trigger rỗng.
     * TC-LINK-3 vì thế phải khôi phục qua màn 機器連携, nơi có mục đó.
     */
    let vendorBefore = ''
    /** Hãng dùng để thử, chọn sao cho KHÁC hãng đang cài. */
    let vendorProbe = ''

    test('TC-LINK-1 — đổi レントゲンシステム連携 rồi F9: payload mang linkCode mới', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(loadedAgentConfig, 'TC-OPEN-1 chưa bắt được GET /v1/config').not.toBeNull()

        await openDialog()
        await selectTab('表示設定')

        vendorBefore = (await vendorSelectOf('レントゲンシステム連携').innerText()).trim()
        const options = await vendorOptions('レントゲンシステム連携')
        // Hãng thử phải KHÁC hãng đang cài, nếu không "đã đổi" và "chưa đổi" trông
        // giống hệt nhau và testcase mất khả năng đỏ.
        const candidate = options.find((o) => o !== vendorBefore && o !== '連携しない')
        expect(candidate, `không có hãng nào khác 「${vendorBefore}」 để thử`).toBeTruthy()
        vendorProbe = candidate!
        console.log(`連携先 レントゲン: đang là 「${vendorBefore}」, thử đổi sang 「${vendorProbe}」`)

        await pickVendor('レントゲンシステム連携', vendorProbe)
        const sent = await saveAndProveAgentAccepted()

        const xray = sent.connectors.find((c) => c.category === 'xray')
        expect(xray, 'payload thiếu hẳn ô xray').toBeTruthy()
        const codeBefore =
            loadedAgentConfig!.connectors.find((c) => c.category === 'xray')?.linkCode ?? 0
        expect(
            xray!.linkCode,
            `F11 gửi lên linkCode ${xray!.linkCode} — vẫn là mã CŨ (${codeBefore}), ` +
                'tức lựa chọn trên màn hình không tới được payload',
        ).not.toBe(codeBefore)
        console.log(`payload gửi lên: xray.linkCode = ${xray!.linkCode}`)
        await step()
    })

    test('TC-LINK-2 — mở lại dialog: 連携先 phải vẫn là hãng vừa chọn', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(vendorProbe, 'TC-LINK-1 chưa chốt được hãng thử').toBeTruthy()

        await openDialog()
        await selectTab('表示設定')
        await expect(
            vendorSelectOf('レントゲンシステム連携'),
            `chọn 「${vendorProbe}」 và agent đã nhận, nhưng mở lại vẫn hiện hãng cũ ` +
                '— giá trị không được đọc lại từ connector_config.linkCode',
        ).toContainText(vendorProbe)
        await step()
    })

    test('TC-LINK-3 — trả 連携先 về trạng thái ban đầu', async () => {
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
        expect(vendorProbe, 'TC-LINK-1 chưa chốt được hãng thử').toBeTruthy()

        // Dialog đang mở từ TC-LINK-2.
        if (vendorBefore) {
            await pickVendor('レントゲンシステム連携', vendorBefore)
            await saveAndProveAgentAccepted()

            await openDialog()
            await selectTab('表示設定')
            await expect(vendorSelectOf('レントゲンシステム連携')).toContainText(vendorBefore)
            await dialog.getByRole('button', { name: 'F10 戻る' }).click()
            await expect(dialog).toBeHidden({ timeout: 10000 })
            await step()
            return
        }

        // Ban đầu KHÔNG có thiết bị nào (linkCode 0). F11 không diễn đạt được trạng
        // thái đó — combo của nó không có mục 連携しない — nên phải trả lại qua màn
        // 機器連携. Bỏ qua bước này là để máy test nằm lại ở hãng thử.
        console.log('連携先 ban đầu là "không có thiết bị" — khôi phục qua màn 機器連携')
        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10000 })

        await page.goto('/settings/agent?tab=linkage', { waitUntil: 'domcontentloaded' })
        const xraySelect = page.locator('#connector-category-xray')
        await expect(xraySelect).toBeVisible({ timeout: 60000 })
        await expect(xraySelect, 'màn 機器連携 phải đang thấy hãng do F11 đặt').toContainText(
            vendorProbe,
        )

        await xraySelect.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10000 })
        await listbox.getByRole('option', { name: '連携しない', exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 10000 })

        await page.getByRole('button', { name: '保存', exact: true }).click()
        await expect(page.getByText('エージェント設定を保存しました。')).toBeVisible({
            timeout: 60000,
        })

        // Trả trang về /treatments để TC-CLOSE-* còn bấm được F11.
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F11"]')).toBeVisible({ timeout: 60000 })
        await step()
    })

    test('TC-CLOSE-1 — F10 戻る đóng dialog, không hỏi lưu', async () => {
        if (await dialog.isHidden()) await openDialog()
        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('TC-CLOSE-2 — mở lại thì seed lại form, bỏ hết chỉnh sửa chưa lưu', async () => {
        await openDialog()
        await selectTab('学習機能')

        const pac = checkOf('処置パック学習機能')
        const seeded = await pac.getAttribute('data-state')
        await pac.click()
        await expect(pac).toHaveAttribute(
            'data-state',
            seeded === 'checked' ? 'unchecked' : 'checked',
        )

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10000 })

        // useEffect seed chạy lại mỗi lần `open` bật → đúng hành vi reload của WinForm.
        await openDialog()
        await selectTab('学習機能')
        await expect(
            checkOf('処置パック学習機能'),
            'mở lại phải lấy lại giá trị đã lưu, không giữ chỉnh sửa dở',
        ).toHaveAttribute('data-state', seeded!)
        await step()
    })
})
