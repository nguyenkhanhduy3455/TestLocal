import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { rows } from './virtual-grid'

/**
 * 診療入力（患者選択）F8「閲覧」— 更新区分 = Update (変更/閲覧モード).
 *
 * WinForm không có "màn F8" riêng: `btnF8_Click` (frm203001.cs:444-454) và
 * `btnF9_Click` (:460-470) gọi CÙNG một `defData`, chỉ khác tham số cuối
 * (`formControl.inpKbn.Update` vs `.Insert`). Toàn bộ khác biệt nằm ở màn
 * 処置入力, tại 3 chỗ chỉ chạy khi Insert:
 *
 *   1. `modSave.GetTrnRs:2830-2851` — Insert thêm một dòng 処置日 trống (kèm dòng
 *      保険切替 nếu đổi 枝番) khi từ 診療日 trở đi chưa có 処置 nào. Update không
 *      tạo dòng nào.
 *   2. `frm203002.cs:3196` — Insert mở sẵn ô 処置日 để gõ.
 *   3. `frm203002.cs:3262-3270` — Insert bắn một Enter giả vào
 *      `grdRegi_TextBox_PreviewKeyDown`, chuỗi này chạy tới `:5345` →
 *      `ModSave.AutoSantei` + `AutoSantei2` (tự động算定 初診/再診 + 加算).
 *
 * Nên 閲覧 KHÔNG phải read-only: lưới vẫn sửa + F9 登録 được như thường. Khác
 * biệt duy nhất là **không sinh dòng mới và không tự算定** — mở ra xem thì không
 * được vô tình đẻ thêm một 初診/再診 cho ngày đó.
 *
 * Các fact bám theo source (apps/web-tenant/src):
 *  - `features/treatments/lib/treatment-entry-shared.ts`:
 *      `InpKbn = { Insert: 'insert', Update: 'update' }`.
 *  - `routes/_authenticated/treatments/$patNo.tsx`: search param `inpKbn`,
 *    VẮNG = insert (đúng default của `defData`, frm203001.cs:645) ⇒ URL của F9
 *    KHÔNG được mang param này.
 *  - `features/treatments/components/treatment-entry-page.tsx`:
 *      · `confirmPatient(inpKbn)` — ô 患者番号 TRƯỚC, dòng đang chọn SAU.
 *      · `openDetail(id, { inpKbn, fromListRow })` — `fromListRow` + đang ở
 *        受付患者一覧 ⇒ ép CẢ 診療日 = hôm nay LẪN 区分 = Insert
 *        (frm203001.cs:657-661): bệnh nhân bốc từ danh sách tiếp nhận luôn là
 *        初/再診 hôm nay, không bao giờ là 閲覧 theo ngày trên panel.
 *  - `features/treatments/components/treatment-entry-detail.tsx`: 3 gate
 *    `isInsertMode` ứng đúng 3 chỗ WinForm ở trên.
 *  - `features/treatments/components/registration-table.tsx`: mỗi ô lưới mang
 *    `data-grid-cell="<rowKey>|<RegiCol>"`; `RegiCol.day = 0`, `ryo = 2`.
 *    Dòng 日計 footer cũng có ô `|0` nhưng kèm `data-footer-cell` → phải loại ra.
 *
 * CHẠY TUẦN TỰ (`describe.serial`), dùng CHUNG một page: app giới hạn số lần
 * login (GUIDELINE Rule 10.1). Testcase NỐI TIẾP TRẠNG THÁI (ô 患者番号, view
 * đang đứng, URL hiện tại) — chạy lẻ bằng `-g` sẽ hỏng. Luôn chạy cả file:
 *   npx playwright test tests/patient-select-f8-view-mode.spec.ts
 *
 * KHÔNG GHI DB: spec chỉ mở màn và đọc lưới; các dòng AutoSantei sinh ra ở TC-F9-1
 * chỉ nằm trong state chưa lưu (không bấm F9 登録), rời màn là mất.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/**
 * 患者番号 dùng cho mọi testcase. Mặc định 12138 — bệnh nhân demo được các spec
 * khác dùng (client-sort, dental-disease-management-dialog) nên chắc chắn tồn tại.
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** `RegiCol` của registration-table (treatment-entry-shared.ts:94-105). */
const REGI_COL_DAY = 0
const REGI_COL_RYO = 2

/**
 * GET /tenant/treatment/wait-list — bị chặn ở TC-WAIT-1 (xem lý do tại chỗ).
 *
 * RegExp chứ KHÔNG phải glob: app gọi qua tiền tố `/api` của nginx nên URL thật
 * là `https://tenant1.ochacom.local/api/tenant/treatment/wait-list?...`, và glob
 * `**\/tenant/...` không khớp (đã thử, handler không hề chạy). RegExp khớp theo
 * chuỗi con nên chắc ăn hơn — cùng cách các spec khác dùng cho `waitForResponse`.
 */
const WAIT_LIST_URL = /\/tenant\/treatment\/wait-list(\?|$)/

/** Số ngày trong tháng của một Date — để kẹp ngày test vào đúng 処置月. */
function daysInMonth(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/**
 * Bỏ nháy kép do TanStack Router JSON-serialise search param kiểu chuỗi
 * (`?inpKbn=%22update%22`). Gõ URL tay thì không có nháy — chấp nhận cả hai.
 */
function unquote(raw: string | null): string {
    return (raw ?? '').replace(/^"|"$/g, '')
}

test.describe.configure({ mode: 'serial' })

test.describe('診療入力（患者選択）F8 閲覧 — 変更/閲覧モード', () => {
    let page: Page
    let step: () => Promise<void>

    /**
     * 診療日 dùng cho TC so sánh F9/F8. Chốt ở beforeAll và PHẢI là ngày CHƯA CÓ
     * 処置 nào — nếu ngày đã có dữ liệu thì Insert cũng không thêm dòng (WinForm
     * `flgLastTrt`, và mapper FE cũng bỏ blank khi ngày đã có item), hai chế độ
     * trông giống hệt nhau và testcase mất hết sức nặng.
     */
    let emptyDay: number | null = null

    // ── Locator ──────────────────────────────────────────────────────────────

    /** Ô 日 của các DÒNG LƯỚI. Loại footer 日計 (cũng mang `|0`). */
    function dayCells(): Locator {
        return page.locator(`[data-grid-cell$="|${REGI_COL_DAY}"]:not([data-footer-cell])`)
    }

    /** Ô 療法・処置 — dấu hiệu "lưới đã nạp xong dữ liệu" (mượn từ kasan-buttons). */
    function ryoCells(): Locator {
        return page.locator(`[data-grid-cell$="|${REGI_COL_RYO}"]`)
    }

    /** Ô 患者番号 của panel 患者選択 — role combobox, KHÔNG phải textbox (Rule 12.5). */
    function patNoInput(): Locator {
        return page
            .getByText('患者番号', { exact: true })
            .first()
            .locator('..')
            .getByRole('combobox')
    }

    /** appDialog (alert/confirm). Loại busyOverlay (cùng role, có aria-busy). */
    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    // ── Thao tác dùng lại ────────────────────────────────────────────────────

    /** Về màn danh sách và ép về view mặc định 受付患者一覧 bằng chính F5 của app. */
    async function backToList() {
        // CHỜ link bằng assertion, KHÔNG dùng `count()`: count() không auto-wait
        // (Rule 10.8) nên lúc SPA còn đang điều hướng dở nó trả 0, rơi vào nhánh
        // `page.goto` cũ, rồi chính client-nav đang bay huỷ luôn goto đó
        // (`net::ERR_ABORTED`). Sidebar có mặt ở mọi màn sau đăng nhập nên không
        // cần nhánh dự phòng.
        const link = page.getByRole('link', { name: '診療入力', exact: true })
        await expect(link, 'không thấy link 診療入力 trên sidebar').toBeVisible({ timeout: 30000 })
        await link.click()
        await expect(page.getByText('診 療 入 力')).toBeVisible({ timeout: 60000 })
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
    }

    /**
     * Gõ 患者番号 rồi RỜI ô. PatientNoInput bung popover lịch sử khi focus;
     * popover của Radix mang role `dialog`, mà FKeyScopeProvider nuốt mọi F-key
     * khi scope trên cùng không nằm trong dialog đang nổi → không Tab ra thì
     * F8/F9 im lặng không chạy.
     */
    async function typePatNo(value: string) {
        await patNoInput().fill(value)
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog'), 'popover lịch sử 患者番号 chưa đóng').toHaveCount(0)
        await step()
    }

    /** Đặt ô 日 của 診療日 trên panel 患者選択 (元号/年/月 giữ nguyên). */
    async function setTrtDay(day: number) {
        const row = page.getByText('診療日', { exact: true }).locator('..')
        await row.getByRole('textbox').nth(2).fill(String(day))
        await page.keyboard.press('Tab')
        await step()
    }

    /**
     * Chờ màn chi tiết nạp xong lưới (có ít nhất một ô 療法 hoặc footer 点).
     *
     * `.first()` phải đứng SAU `.or()`: `a.first().or(b.first())` vẫn là một
     * union khớp cả hai nhánh → strict mode violation. `.or()` rồi mới `.first()`
     * mới thu về đúng một element.
     */
    async function waitDetailLoaded() {
        await expect(
            ryoCells().or(page.locator('[data-footer-cell$=":footer-ten"]')).first(),
            'màn 診療入力 chi tiết không nạp được lưới',
        ).toBeVisible({ timeout: 60000 })
    }

    /**
     * Trả lời DỨT ĐIỂM hộp 初診算定 rồi mới đọc lưới.
     *
     * `addLocatorHandler` ở beforeAll chỉ chạy TRƯỚC một action / auto-waiting
     * assertion. Các assert dưới đây đọc DOM thô (`allInnerTexts` trong
     * `expect.poll`) nên không kích hoạt nó: nếu hộp bung ra SAU khi
     * `waitDetailLoaded` đã xong thì nó nằm im mãi, AutoSantei không bao giờ áp
     * dòng nào, và testcase đỏ oan. Đã dính thật ở `--repeat-each=3` (lần 1 xanh,
     * lần 2-3 đỏ) — app không sai, nó đang đợi người trả lời.
     *
     * Bấm `No` (GUIDELINE Rule 14.1): `Yes` lại mở tiếp カルテ記載選択. `No` vẫn
     * 算定 bộ 再診 nên lưới VẪN có dòng cho ngày đó.
     */
    /** Ô 日 của lưới mang đúng số ngày `day` (neo hai đầu để không dính 11, 21…). */
    function dayCell(day: number): Locator {
        return dayCells().filter({ hasText: new RegExp(`^\\s*${day}\\s*$`) })
    }

    /**
     * Các số ngày đang hiển thị trên cột 日 của lưới.
     *
     * ⚠️ Bao gồm CẢ tháng lịch sử: `renderHistoryRecord`
     * (registration-table.tsx:243) phát cùng `data-grid-cell="…|0"` như tháng
     * hiện tại, và không có testid nào tách hai loại. ĐỪNG "sửa" thành chỉ đọc
     * 処置月 — chính việc đếm rộng này là thứ làm TC-F8-1 an toàn:
     * `emptyDay` được TC-SETUP-1 chọn là ngày KHÔNG có trong tập rộng đó, nên
     * một dòng lịch sử không bao giờ cấp được số ngày ấy. Nếu thu hẹp lại, một
     * dòng lịch sử trùng ngày sẽ làm TC-F8-1 đỏ oan.
     *
     * Cái giá: nếu cả 31 ngày đều bận (gộp mọi tháng) thì TC-SETUP-1 không tìm
     * ra ngày trống → TC-F9-1/F8-1 skip kèm log, không đỏ.
     */
    async function visibleDays(): Promise<number[]> {
        const texts = await dayCells().allInnerTexts()
        return texts
            .map((t) => Number(t.trim()))
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
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

        // AutoSantei của chế độ Insert có thể bung hộp「〜を算定しますか？」bất kỳ lúc
        // nào sau khi lưới nạp xong — thời điểm không đoán được, và nó nuốt mọi click
        // (GUIDELINE Rule 14). Trả lời `No` (Rule 14.1: `Yes` lại mở tiếp カルテ記載選択).
        // Chọn No vẫn算定 bộ 再診 nên lưới VẪN có dòng cho ngày đó — đúng thứ TC-F9-1 cần.
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

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F8"]')).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Tìm một ngày TRỐNG trong 処置月 ───────────────────────────────────────

    test('TC-SETUP-1 — tìm một ngày chưa có 処置 trong 処置月 (mở bằng 閲覧 nên không đẻ dòng)', async () => {
        // Mở bằng 閲覧 để chính việc đi tìm KHÔNG tự thêm dòng — nếu dùng 初/再診
        // thì AutoSantei đã sinh dữ liệu cho ngày mặc định trước khi ta kịp đọc.
        await typePatNo(PAT_NO)
        await page.keyboard.press('F8')
        await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })
        await waitDetailLoaded()

        const iso = unquote(new URL(page.url()).searchParams.get('trtDt'))
        const monthDate = new Date(`${iso || new Date().toISOString().slice(0, 10)}T00:00:00`)
        const used = new Set(await visibleDays())
        for (let d = 1; d <= daysInMonth(monthDate); d++) {
            if (!used.has(d)) {
                emptyDay = d
                break
            }
        }
        console.log(
            `処置月 ${iso}: ngày đã có 処置 = [${[...used].sort((a, b) => a - b).join(',')}] → ` +
                `chọn ngày trống ${emptyDay}`,
        )
        await step()
        await backToList()
    })

    // ── 1. URL / 更新区分 ────────────────────────────────────────────────────

    test('TC-URL-1 — F9 KHÔNG gắn inpKbn (vắng = insert, đúng default của defData)', async () => {
        await typePatNo(PAT_NO)
        await page.keyboard.press('F9')
        await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })

        expect(
            new URL(page.url()).searchParams.get('inpKbn'),
            'URL của F9 mang inpKbn — 初/再診 phải để param VẮNG cho sạch, route tự default insert',
        ).toBeNull()
        await step()
        await backToList()
    })

    test('TC-URL-2 — F8 gắn inpKbn=update', async () => {
        await typePatNo(PAT_NO)
        await page.keyboard.press('F8')
        await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })

        expect(
            unquote(new URL(page.url()).searchParams.get('inpKbn')),
            'F8 không truyền 更新区分 = update xuống màn chi tiết',
        ).toBe('update')
        await step()
        await backToList()
    })

    // ── 2. Khác biệt thật trên lưới: dòng 処置日 + AutoSantei ─────────────────

    test('TC-F9-1 — F9 vào ngày TRỐNG: lưới sinh dòng cho ngày đó', async () => {
        skipWithReason(
            emptyDay === null,
            '処置月 đã kín ngày → không có ngày trống để phân biệt Insert với Update.',
        )

        await typePatNo(PAT_NO)
        await setTrtDay(emptyDay!)
        await page.keyboard.press('F9')
        await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })
        await waitDetailLoaded()

        // Insert = dòng 処置日 của GetTrnRs + các dòng AutoSantei vừa áp.
        //
        // KHÔNG tự bấm hộp 初診算定 ở đây: `addLocatorHandler` (beforeAll) đã nhận
        // việc đó, và nó chạy TRƯỚC mỗi auto-waiting assertion — kể cả assertion
        // ngay dưới. Bấm thêm bằng tay thì handler đóng hộp trước, click của mình
        // mất đích rồi timeout 15s (đã dính thật). Cứ để assertion tự chờ:
        // handler đóng hộp → AutoSantei áp bộ 再診 → dòng hiện ra.
        await expect(
            dayCell(emptyDay!).first(),
            `F9 vào ngày trống ${emptyDay} mà lưới không có dòng nào cho ngày đó — ` +
                'GetTrnRs của chế độ Insert lẽ ra phải thêm dòng 処置日',
        ).toBeVisible({ timeout: 60000 })
        await step()
        await backToList()
    })

    test('TC-F8-1 — F8 vào ĐÚNG ngày đó: KHÔNG sinh dòng nào', async () => {
        skipWithReason(emptyDay === null, 'không có ngày trống (xem TC-F9-1).')

        await typePatNo(PAT_NO)
        await setTrtDay(emptyDay!)
        await page.keyboard.press('F8')
        await expect(page).toHaveURL(/inpKbn=/, { timeout: 30000 })
        await waitDetailLoaded()

        // Cho AutoSantei của chế độ Insert đủ thời gian bung ra nếu nó CÓ chạy —
        // assert phủ định mà đọc ngay thì luôn xanh giả. displayRecords vẫn dựng
        // group 処置月 (kèm footer 日計) nên có mốc chờ thật.
        await expect(
            page.locator('[data-footer-cell$=":footer-ten"]').first(),
            'không thấy footer 日計 của 処置月',
        ).toBeVisible({ timeout: 30000 })

        expect(
            await visibleDays(),
            `F8 (変更/閲覧) vào ngày trống ${emptyDay} mà lưới lại có dòng cho ngày đó — ` +
                'gate 更新区分 đang không chặn GetTrnRs / AutoSantei',
        ).not.toContain(emptyDay!)
        await step()
    })

    test('TC-F8-2 — F8 KHÔNG bật hộp「〜を算定しますか？」', async () => {
        // Vẫn đang đứng ở màn chi tiết của TC-F8-1 (serial). Hộp 初診算定 chỉ có thể
        // đến từ AutoSantei; ở 変更/閲覧 nó không được chạy lúc mở màn.
        expect(
            await page.getByText(/を算定しますか？/).count(),
            'F8 bật hộp 初診算定 — AutoSantei đang chạy dù ở chế độ 変更/閲覧',
        ).toBe(0)
        await expect(appDialog(), 'F8 mở kèm một dialog lạ').toHaveCount(0)
        await step()
        await backToList()
    })

    // ── 3. Luật ép Insert khi chọn từ 受付患者一覧 ───────────────────────────

    test('TC-WAIT-1 — F8 trên dòng 受付患者一覧 vẫn ra chế độ insert + 診療日 = hôm nay', async () => {
        // frm203001.cs:657-661 — nhánh selRow ở viewType.wait ghi đè CẢ ngày LẪN 区分.
        //
        // Bảng `wait` của DB demo rỗng hoàn toàn (0 dòng, kể cả xoá mềm) và app
        // CHƯA có đường tạo 受付: màn 受付患者一覧 còn là PlaceholderPage, BE chỉ có
        // GET /tenant/treatment/wait-list chứ không có endpoint ghi. Nên chặn
        // response của chính endpoint đó và trả về một dòng cố định — thứ đang kiểm
        // là LOGIC FE (nguồn dòng + luật ép), không phải truy vấn DB. Cách này cũng
        // không đụng gì tới dữ liệu thật.
        const waitRow = {
            patNo: Number(PAT_NO),
            patNm: 'テスト 受付',
            knSort: 1,
            resStDt: null,
            rdate: new Date().toISOString(),
            wait: 5,
            tplan: null,
            userNm: null,
            chair: -1,
        }
        const handler = async (route: import('@playwright/test').Route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        items: [waitRow],
                        page: 1,
                        pageSize: 300,
                        totalCount: 1,
                        totalPages: 1,
                        hasPreviousPage: false,
                        hasNextPage: false,
                    },
                    error: null,
                    meta: null,
                }),
            })
        }
        await page.route(WAIT_LIST_URL, handler)
        try {
            // F5 = `chgViewType(wait)` → luôn refetch, nên lưới nhận dòng mock.
            await page.keyboard.press('F5')
            await expect(
                rows(page).first(),
                '受付患者一覧 không nhận dòng mock — route intercept có khớp URL không?',
            ).toBeVisible({ timeout: 30000 })

            // Ô 患者番号 thắng dòng đang chọn ở confirmPatient → phải để trống thì
            // mới đi vào nhánh selRow.
            await patNoInput().fill('')
            await page.keyboard.press('Tab')

            // Đổi 診療日 sang một ngày KHÁC hôm nay để thấy rõ ngày bị ghi đè.
            const todayDay = new Date().getDate()
            const otherDay = todayDay === 1 ? 2 : 1
            await setTrtDay(otherDay)

            await rows(page).first().click()
            await page.keyboard.press('F8')
            await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), {
                timeout: 30000,
            })

            const q = new URL(page.url()).searchParams
            expect(
                q.get('inpKbn'),
                'chọn từ 受付患者一覧 mà vẫn giữ 更新区分 = update — luật frm203001.cs:657-661 chưa áp',
            ).toBeNull()
            const today = new Date()
            const p2 = (n: number) => String(n).padStart(2, '0')
            expect(
                unquote(q.get('trtDt')),
                '受付患者一覧 phải ép 診療日 về ngày hệ thống, không dùng ngày trên panel 患者選択',
            ).toBe(`${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`)
            await step()
        } finally {
            // Gỡ mock TRƯỚC khi về lại danh sách để testcase sau thấy dữ liệu thật.
            await page.unroute(WAIT_LIST_URL, handler)
        }
        await backToList()
    })

    // ── 4. Thứ tự ưu tiên nguồn 患者番号 của F8 ──────────────────────────────

    test('TC-ORDER-1 — F8 lấy ô 患者番号 TRƯỚC dòng đang chọn', async () => {
        // btnF8_Click đọc `cboPatNo.Text` trước rồi mới tới `dgvView.SelectedRows[0]`.
        // Dùng 患者検索 để chắc chắn có một dòng được auto-select.
        await page.keyboard.press('F1')
        await expect(page.getByText('≪患者検索一覧≫')).toBeVisible({ timeout: 30000 })
        // `exact: true` bắt buộc: nút 「F1 患者検索」 cũng chứa chuỗi 検索 (Rule 10.3).
        await page.getByRole('button', { name: '検索', exact: true }).click()
        await expect(rows(page).first().or(page.getByTestId('empty-state'))).toBeVisible({
            timeout: 30000,
        })

        const hasRow = (await rows(page).count()) > 0
        skipWithReason(!hasRow, '患者検索 không trả dòng nào → không có dòng đang chọn để so.')

        const rowPatNo = (await rows(page).first().getByTestId('cell-patNo').innerText()).trim()
        skipWithReason(
            rowPatNo === PAT_NO,
            `dòng đầu của 患者検索 trùng TEST_PAT_NO (${PAT_NO}) → không phân biệt được nguồn.`,
        )

        await typePatNo(PAT_NO)
        await page.keyboard.press('F8')
        await expect(
            page,
            `F8 phải ưu tiên ô 患者番号 (${PAT_NO}), không phải dòng đang chọn (${rowPatNo})`,
        ).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })
        expect(unquote(new URL(page.url()).searchParams.get('inpKbn'))).toBe('update')
        await step()
        await backToList()
    })
})
