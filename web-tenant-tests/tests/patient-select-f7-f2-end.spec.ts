import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { rows } from './virtual-grid'

/**
 * 診療入力（患者選択）— frm203001: 5 chức năng vừa được port từ WinForm
 * (nhánh `feat/treatment-entry-page-winform-parity`, đã merge vào demo1):
 *
 *   1. F7 会計作成      — btnF7_Click → modBulkAcc.calcAcc
 *   2. F2 患者情報      — btnF2_Click → showForm(ID201001) 患者登録
 *   3. 衛生士欄 ẩn/hiện — preInit: `if (DispEiseisi == 0) lblStaffNm.Visible = false`
 *   4. 診療日 sai → E00002, KHÔNG âm thầm lấy hôm nay — defData (frm203001.cs:636)
 *   5. End / Esc = 患者確定, y hệt F9 — btnEndEsc_Click (frm203001.cs:487-506)
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-page.tsx:
 *      · `showHygienist = Number(inpConfig?.eiseijiFlg ?? EiseijiFlg.Shown) !==
 *        EiseijiFlg.Hidden` (EiseijiFlg.Hidden = 0) ⇒ hàng 衛生士 render hay
 *        không là HÀM của `inp_config.eiseiji_flg`, không phải hằng số.
 *      · F2: `selectedPatNo() ?? typedPatNo()` — LƯỚI trước, ô 患者番号 sau.
 *        Không có gì → `return` (no-op). Đích: `/patients/registration?patientNo=`.
 *      · confirmPatient() (F9 + End): `typedPatNo() ?? selectedPatNo() ?? dòng
 *        đầu của view` — Ô 患者番号 TRƯỚC, ngược thứ tự với F2. Đây đúng là
 *        WinForm: btnF2 đọc grid trước (:334-344), btnF9/btnEndEsc đọc
 *        `cboPatNo.Text` trước (:462, :500).
 *      · `End: { label: '', onPress: () => confirmPatient() }` — FKeyBar mặc
 *        định `slots = 12` nên slot 13 (End) KHÔNG vẽ ra. Không có
 *        `[data-fkey="End"]`; chỉ có bàn phím. `fkey-scope-provider` map CẢ
 *        `End` lẫn `Escape` về pseudo-key 'End'.
 *      · openDetail + handleBulkAccounting đều đọc `trtDtIso` (null khi
 *        EraDateField không ra ngày thật) → `alertDialog(ja.E00002('診療日'))`
 *        rồi return. `diagTrtDtIso` (fallback hôm nay) CHỈ còn dùng cho F3
 *        来患集計, đúng như WinForm F3 không gọi IsDate.
 *      · handleBulkAccounting: nhãn 和暦 = `formatJapaneseEraDate` (「令和08年08月05日」),
 *        acc_make=1 thì cắt 3 ký tự cuối 「05日」 → 「令和08年08月」
 *        (= `strDt.Substring(0, strDt.Length - 3)`).
 *      · `drNo: dr ? Number(dr) : undefined` — combo Dr. để trống = 全Dr, param
 *        bị bỏ hẳn khỏi query string (toQueryString skip undefined).
 *  - queries/bulk-accounting-mutations.ts: mutationFn chạy HAI call nối nhau —
 *    GET /tenant/treatment/accounting/data (fetchAllPages, pageSize=300) rồi
 *    POST /tenant/treatment/accounting/bulk-create. Danh sách rỗng thì DỪNG ở
 *    bước 1, trả `{ kind: 'noData' }` → E00003, KHÔNG POST.
 *  - locales/ja.ts:
 *      · E00002 「{field}が間違っています。」  ← LƯU Ý: không phải 「正しくありません」
 *      · E00003 「該当するデータがありません。」
 *      · Q00049 「{period}の会計データを作成します。よろしいですか？」
 *      · I00005 「{proc}が完了しました。」 → 「会計データ作成が完了しました。」
 *  - shared/ui/confirm-dialog-view.tsx: nút mặc định là `Yes` / `No` (TIẾNG ANH,
 *    GUIDELINE Rule 13.2), alert-dialog-view.tsx là một nút `OK`. Cả hai mang
 *    role `alertdialog`, tách hẳn với `dialog` của DraggableDialog (Rule 13).
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (GUIDELINE Rule 10.1). Testcase NỐI TIẾP TRẠNG THÁI (ô 患者番号, 診療日,
 * view đang đứng, URL hiện tại) — thứ tự CÓ Ý NGHĨA, chạy lẻ bằng `-g` sẽ hỏng.
 * Luôn chạy cả file:
 *   npx playwright test tests/patient-select-f7-f2-end.spec.ts
 *
 * GHI DB (GUIDELINE Rule 18.1): F7 xoá-rồi-ghi lại acc_dat của cả kỳ. Mặc định
 * spec chỉ đi tới hộp confirm rồi bấm `No` — KHÔNG đụng DB. Nhánh bấm `Yes`
 * (TC-F7-3) chỉ chạy khi TEST_ALLOW_SAVE=1, ngược lại tự skip kèm log.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Chỉ chạy nhánh THẬT SỰ ghi acc_dat khi được bật tường minh (Rule 18.1). */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/**
 * 患者番号 gõ tay để kiểm nhánh `typedPatNo()`. Mặc định 12138 — bệnh nhân demo
 * được các spec khác dùng (client-sort, dental-disease-management-dialog) nên
 * chắc chắn tồn tại. Đổi bằng TEST_PAT_NO nếu dataset khác.
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** `inp_config.acc_make` — 0 = 日単位, 1 = 月単位 (api/inp-config-api.ts AccMakeUnit). */
const ACC_MAKE_MONTH = 1
/** `inp_config.eiseiji_flg` — 0 = ẩn hàng 衛生士 (EiseijiFlg.Hidden). */
const EISEIJI_HIDDEN = 0

const INP_CONFIG_URL = /\/tenant\/inp-config(\?|$)/
const ACC_DATA_URL = /\/tenant\/treatment\/accounting\/data(\?|$)/
const ACC_BULK_URL = /\/tenant\/treatment\/accounting\/bulk-create(\?|$)/

/** Chỉ đọc field cần dùng — envelope của app là { success, data, error, meta }. */
interface InpConfig {
    accMake: number
    eiseijiFlg: number
}

/**
 * URL màn 患者登録 cho một 患者番号.
 *
 * TanStack Router serialise search param KIỂU CHUỖI bằng JSON, nên trên URL nó
 * là `patientNo=%2212138%22` (có nháy kép) chứ không phải `patientNo=12138`.
 * Đây là convention của CẢ APP — `patient-list-page.tsx:141` và
 * `treatment-entry-detail.tsx:1316` cùng dạng — nên test phải chấp nhận, không
 * phải lỗi của F2. Vẫn cho khớp cả dạng trần phòng khi router đổi cấu hình.
 */
function registrationUrlRe(patNo: string): RegExp {
    return new RegExp(`/patients/registration\\?.*patientNo=(?:%22)?${patNo}(?:%22)?(&|$)`)
}

/** Bỏ nháy kép do JSON-serialise của router để so giá trị thật. */
function unquote(raw: string | null): string {
    return (raw ?? '').replace(/^"|"$/g, '')
}

test.describe.configure({ mode: 'serial' })

test.describe('診療入力（患者選択）— F7 会計作成 / F2 患者情報 / End 患者確定', () => {
    let page: Page
    let step: () => Promise<void>

    /** Payload GET /tenant/inp-config bắt được khi vào màn — nguồn của mọi assert cấu hình. */
    let inpConfig: InpConfig | null = null

    // ── Locator dùng lại ─────────────────────────────────────────────────────

    /** Hàng của EraDateField 診療日: 1 combobox (元号) + 3 textbox (年/月/日). */
    function trtDtRow(): Locator {
        return page.getByText('診療日', { exact: true }).locator('..')
    }

    /**
     * Ô 患者番号 (PatientNoInput).
     *
     * Bó vào hàng chứa nhãn 患者番号: 患者検索条件 bên phải cũng có ô 患者番号 và
     * lưới có header cùng tên → lấy thẳng ở cấp page là strict mode violation
     * (GUIDELINE Rule 10.3). `.first()` lấy nhãn của panel 患者選択 (đứng trước
     * header lưới trong DOM).
     *
     * Role là **combobox**, KHÔNG phải textbox (GUIDELINE Rule 12.5): input này
     * là phần điều khiển của Popover + cmdk (dropdown lịch sử bệnh nhân).
     * A11y snapshot: `generic 患者番号 → generic → combobox [active]`.
     */
    function patNoInput(): Locator {
        return page
            .getByText('患者番号', { exact: true })
            .first()
            .locator('..')
            .getByRole('combobox')
    }

    /**
     * appDialog (alertDialog / confirmDialog) — role alertdialog, Rule 13.
     *
     * PHẢI loại `aria-busy="true"`: `busyOverlay` (busy-overlay-view.tsx) cũng
     * render `role="alertdialog"`. Trong F7 nó nằm đè suốt lúc gọi API, nên
     * `getByRole('alertdialog')` trần sẽ đọc trúng 「会計データを作成しています…
     * しばらくお待ちください。」 và tưởng đó là hộp kết quả.
     */
    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    /** Lớp phủ chặn thao tác trong lúc F7 gọi API (busyOverlay.show). */
    function busyOverlay(): Locator {
        return page.locator('[role="alertdialog"][aria-busy="true"]')
    }

    // ── Thao tác dùng lại ────────────────────────────────────────────────────

    /**
     * Gõ 患者番号 rồi RỜI ô.
     *
     * PatientNoInput bung popover lịch sử khi ô được focus. Popover của Radix
     * mang role `dialog`, mà `FKeyScopeProvider` nuốt mọi F-key khi scope trên
     * cùng không nằm trong dialog đang nổi → không Tab ra thì F2/F7/End im lặng
     * không chạy. Tab cũng chính là thao tác người dùng thật.
     */
    async function typePatNo(value: string) {
        await patNoInput().fill(value)
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog'), 'popover lịch sử 患者番号 chưa đóng').toHaveCount(0)
        await step()
    }

    /** Xoá trắng ô 患者番号 (về nhánh `typedPatNo() === null`). */
    async function clearPatNo() {
        await patNoInput().fill('')
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    /**
     * Về lại màn danh sách sau khi một testcase điều hướng đi nơi khác.
     *
     * Đi bằng LINK TRONG SIDEBAR, KHÔNG dùng `page.goto`. `accessToken` của app
     * chỉ nằm trong RAM (GUIDELINE Rule 10.2) nên mỗi lần tải lại trang là một
     * vòng refresh từ cookie `rt`; lặp lại nhiều lần trong cùng một phiên đã làm
     * app render ra TRANG TRẮNG ở đúng lần thứ tư (TC-ORDER-1). Điều hướng
     * client-side giữ nguyên token nên ổn định.
     *
     * Quay lại rồi PHẢI bấm F5: quan sát thực tế cho thấy điều hướng client-side
     * về /treatments có thể giữ nguyên state 患者検索 của lần trước (lưới vẫn ở
     * ≪患者検索一覧≫ với kết quả cũ), trong khi mọi testcase sau đều giả định
     * đang đứng ở view mặc định. F5 chính là `chgViewType(viewType.wait)` của
     * WinForm nên đây là cách của app, không phải mẹo của test. Nó cũng
     * `handleExitSearchMode()` ⇒ xoá 検索条件 + bỏ chọn dòng.
     */
    async function backToList() {
        // CHỜ link bằng assertion, KHÔNG dùng `count()`: count() không auto-wait
        // (Rule 10.8) nên lúc SPA còn đang điều hướng dở nó trả 0, rơi vào nhánh
        // `page.goto` cũ, rồi chính client-nav đang bay huỷ luôn goto đó
        // (`net::ERR_ABORTED`). Sidebar có mặt ở mọi màn sau đăng nhập nên không
        // cần nhánh dự phòng.
        const link = page.getByRole('link', { name: '診療入力', exact: true })
        await expect(link, 'không thấy link 診療入力 trên sidebar').toBeVisible({ timeout: 30000 })
        await link.click()
        // Lưu ý: `[data-fkey="F7"]` KHÔNG đủ để khẳng định đang ở /treatments —
        // màn 患者登録 cũng có thanh FKey 12 ô. Tiêu đề mới là dấu hiệu thật.
        await expect(page.getByText('診 療 入 力')).toBeVisible({ timeout: 60000 })
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
    }

    /**
     * 和暦 của 診療日 ĐANG hiển thị, dựng đúng cách `formatJapaneseEraDate` dựng:
     * `<元号><YY>年<MM>月<DD>日`. Đọc từ chính các ô trên màn thay vì hardcode để
     * không phải nhúng bảng mst-era vào test.
     */
    async function warekiOnScreen(): Promise<string> {
        const era = (await trtDtRow().getByRole('combobox').innerText()).trim()
        const boxes = trtDtRow().getByRole('textbox')
        const p2 = (s: string) => s.trim().padStart(2, '0')
        const y = p2(await boxes.nth(0).inputValue())
        const m = p2(await boxes.nth(1).inputValue())
        const d = p2(await boxes.nth(2).inputValue())
        return `${era}${y}年${m}月${d}日`
    }

    /** Chuỗi kỳ mà Q00049 phải nhắc tới: 月単位 thì rụng 「DD日」 (3 ký tự cuối). */
    async function expectedPeriod(): Promise<string> {
        const wareki = await warekiOnScreen()
        return inpConfig?.accMake === ACC_MAKE_MONTH ? wareki.slice(0, -3) : wareki
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

        // Bắt inp-config ngay từ đầu: react-query cache nó 10 phút (staleTime)
        // nên chỉ có ĐÚNG MỘT request trong cả phiên — cắm listener sau khi đã
        // vào /treatments là đã lỡ mất.
        page.on('response', (res) => {
            if (!INP_CONFIG_URL.test(res.url()) || res.request().method() !== 'GET') return
            void res
                .json()
                .then((body) => {
                    const data = (body as { data?: InpConfig }).data
                    if (data) inpConfig = { accMake: Number(data.accMake), eiseijiFlg: Number(data.eiseijiFlg) }
                })
                .catch(() => {
                    /* body không phải JSON → bỏ qua, TC-CFG-1 sẽ báo */
                })
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        // Footer F-key strip dựng xong = màn danh sách sẵn sàng nhận phím.
        await expect(page.locator('[data-fkey="F7"]')).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── 3. 衛生士欄 theo inp_config.eiseiji_flg ──────────────────────────────

    test('TC-CFG-1 — màn gọi GET /tenant/inp-config (nguồn của eiseijiFlg + accMake)', async () => {
        // Trước khi port, hàng 衛生士 là `const showHygienist = true` và màn KHÔNG
        // hề đọc inp-config. Không thấy request này nghĩa là bản đang chạy chưa
        // có bản port — mọi assert cấu hình phía dưới sẽ vô nghĩa.
        await expect
            .poll(() => inpConfig, {
                message:
                    'không bắt được GET /tenant/inp-config — bản đang chạy có phải bản đã port ' +
                    '(inpConfigQueryOptions trong treatment-entry-page.tsx) không?',
                timeout: 30000,
            })
            .not.toBeNull()

        console.log(
            `inp_config: acc_make=${inpConfig!.accMake} ` +
                `(${inpConfig!.accMake === ACC_MAKE_MONTH ? '月単位' : '日単位'}), ` +
                `eiseiji_flg=${inpConfig!.eiseijiFlg}`,
        )
        await step()
    })

    test('TC-CFG-2 — hàng 衛生士 hiện/ẩn ĐÚNG theo eiseiji_flg', async () => {
        const hidden = inpConfig!.eiseijiFlg === EISEIJI_HIDDEN
        // Nhãn của StaffSelect là `{label}:` (staff-select.tsx:38) — dấu hai chấm
        // là thứ tách nó khỏi HEADER LƯỚI cùng tên `Dr.` / `患者番号`. Bỏ dấu này
        // ra là assert bám nhầm vào header và vẫn xanh dù panel 患者選択 hỏng.
        await expect(
            page.getByText('Dr.:', { exact: true }),
            'không thấy hàng Dr. — panel 患者選択 hỏng chứ không riêng gì 衛生士',
        ).toBeVisible({ timeout: 15000 })

        const staffLabel = page.getByText('衛生士:', { exact: true })
        if (hidden) {
            await expect(
                staffLabel,
                'eiseiji_flg=0 mà hàng 衛生士 vẫn render — gate đang bị bỏ qua',
            ).toHaveCount(0)
            console.log('eiseiji_flg=0 → đã kiểm nhánh ẨN hàng 衛生士')
        } else {
            await expect(
                staffLabel,
                'eiseiji_flg≠0 mà không thấy hàng 衛生士 — gate đang ẩn nhầm',
            ).toBeVisible({ timeout: 15000 })
            console.log(
                `eiseiji_flg=${inpConfig!.eiseijiFlg} → chỉ kiểm được nhánh HIỆN. ` +
                    'Muốn kiểm nhánh ẩn phải đặt inp_config.eiseiji_flg = 0 rồi chạy lại.',
            )
        }
        await step()
    })

    // ── 4. 診療日 sai → E00002, không âm thầm lấy hôm nay ────────────────────

    test('TC-DATE-1 — xoá 年 của 診療日 rồi End: chặn bằng E00002, KHÔNG điều hướng', async () => {
        await typePatNo(PAT_NO)

        // Xoá ô 年 ⇒ japaneseEraToDate trả undefined ⇒ trtDtIso = null.
        const yearBox = trtDtRow().getByRole('textbox').nth(0)
        const savedYear = await yearBox.inputValue()
        await yearBox.fill('')
        await page.keyboard.press('Tab')
        await step()

        await page.keyboard.press('End')

        // WinForm: MsgDialog.ShowWarningMsg("E00002", "診療日") rồi RETURN.
        await expect(
            appDialog(),
            'End với 診療日 rỗng mà không có cảnh báo — có phải vẫn đang fallback về hôm nay?',
        ).toBeVisible({ timeout: 15000 })
        await expect(appDialog()).toContainText('診療日')
        // Chuỗi thật của app là 「が間違っています。」, KHÔNG phải 「が正しくありません」.
        await expect(
            appDialog(),
            'nội dung E00002 khác locales/ja.ts (「{field}が間違っています。」)',
        ).toContainText('間違っています')
        await appDialog().getByRole('button', { name: 'OK' }).click()
        await expect(appDialog()).toHaveCount(0)

        await expect(
            page,
            'đã điều hướng sang màn chi tiết dù 診療日 không hợp lệ',
        ).toHaveURL(/\/treatments\/?(\?|$)/)
        await step()

        // Trả 年 về giá trị cũ cho các testcase sau.
        await yearBox.fill(savedYear)
        await page.keyboard.press('Tab')
        await expect(yearBox).toHaveValue(savedYear)
    })

    test('TC-DATE-2 — 診療日 rỗng thì F7 cũng chặn, KHÔNG gọi API 会計データ', async () => {
        const yearBox = trtDtRow().getByRole('textbox').nth(0)
        const savedYear = await yearBox.inputValue()
        await yearBox.fill('')
        await page.keyboard.press('Tab')

        let called = false
        // Giữ THAM CHIẾU của handler: `page.off` so sánh bằng identity, truyền
        // một arrow mới vào off() là không gỡ được gì cả.
        const handler = (req: { url: () => string }) => {
            if (ACC_DATA_URL.test(req.url()) || ACC_BULK_URL.test(req.url())) called = true
        }
        page.on('request', handler)

        await page.keyboard.press('F7')
        await expect(appDialog(), 'F7 với 診療日 rỗng mà không cảnh báo').toBeVisible({
            timeout: 15000,
        })
        await expect(appDialog()).toContainText('間違っています')
        await appDialog().getByRole('button', { name: 'OK' }).click()
        await expect(appDialog()).toHaveCount(0)

        page.off('request', handler)
        expect(called, 'F7 đã bắn API 会計データ dù 診療日 không hợp lệ').toBe(false)

        await yearBox.fill(savedYear)
        await page.keyboard.press('Tab')
        await expect(yearBox).toHaveValue(savedYear)
        await step()
    })

    // ── 1. F7 会計作成 ───────────────────────────────────────────────────────

    test('TC-F7-1 — F7 hỏi Q00049 đúng kỳ 和暦 theo acc_make', async () => {
        const period = await expectedPeriod()

        await page.keyboard.press('F7')
        await expect(appDialog(), 'F7 không mở hộp xác nhận').toBeVisible({ timeout: 15000 })

        const text = (await appDialog().innerText()).replace(/\s/g, '')
        expect(
            text,
            `Q00049 không nhắc đúng kỳ. Chờ "${period}" (acc_make=${inpConfig!.accMake}), thấy: ${text}`,
        ).toContain(period)
        expect(text, 'thân Q00049 khác locales/ja.ts').toContain('会計データを作成します')

        // acc_make=1 (月単位) thì WinForm cắt 「DD日」 → chuỗi KHÔNG được còn 日.
        if (inpConfig!.accMake === ACC_MAKE_MONTH) {
            expect(
                period.endsWith('月'),
                `月単位 mà kỳ vẫn còn phần ngày: "${period}"`,
            ).toBe(true)
        }
        await step()
    })

    test('TC-F7-2 — bấm No thì đóng hộp và KHÔNG gọi API nào (mặc định: không đụng DB)', async () => {
        let called = ''
        const onReq = (url: string) => {
            if (ACC_DATA_URL.test(url)) called = 'GET accounting/data'
            if (ACC_BULK_URL.test(url)) called = 'POST accounting/bulk-create'
        }
        const handler = (req: { url: () => string }) => onReq(req.url())
        page.on('request', handler)

        // Nhãn nút của confirmDialog là Yes/No (tiếng Anh) — chịu cả tiếng Nhật
        // phòng khi call-site đổi sang truyền yesLabel/noLabel (Rule 13.2).
        await appDialog()
            .getByRole('button', { name: /^(No|いいえ)$/ })
            .click()
        await expect(appDialog(), 'bấm No mà hộp xác nhận không đóng').toHaveCount(0)

        page.off('request', handler)
        expect(called, `bấm No mà vẫn gọi ${called}`).toBe('')
        await step()
    })

    test('TC-F7-3 — bấm Yes: GET accounting/data → POST bulk-create → I00005 (GHI DB)', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'TC-F7-3 xoá-rồi-ghi lại acc_dat của cả kỳ. Bật bằng TEST_ALLOW_SAVE=1 khi chấp nhận ghi DB.',
        )

        await page.keyboard.press('F7')
        await expect(appDialog()).toBeVisible({ timeout: 15000 })

        const dataRes = page.waitForResponse(
            (r) => ACC_DATA_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: 120000 },
        )
        await appDialog()
            .getByRole('button', { name: /^(Yes|はい)$/ })
            .click()

        const data = await dataRes
        expect(data.status(), `GET accounting/data trả ${data.status()}`).toBeLessThan(300)

        const q = new URL(data.url()).searchParams
        expect(q.get('trtDt'), 'trtDt gửi lên khác 診療日 đang chọn').toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(q.get('accMake'), 'accMake gửi lên khác inp_config.acc_make').toBe(
            String(inpConfig!.accMake),
        )
        // Combo Dr. để trống ⇒ toQueryString bỏ hẳn param (không gửi drNo=0).
        expect(q.get('drNo'), 'combo Dr. đang trống mà vẫn gửi drNo').toBeNull()
        expect(q.get('pageSize'), 'không xin trọn kỳ → write-set bị cắt').toBe('300')

        // Danh sách rỗng thì mutation DỪNG ở bước 1 → E00003, không POST.
        const body = (await data.json()) as { data?: { items?: unknown[]; totalCount?: number } }
        const total = body.data?.totalCount ?? body.data?.items?.length ?? 0

        // Chờ lớp phủ tan trước: nó cùng role alertdialog, và chừng nào còn đó
        // thì kết quả vẫn chưa được quyết định.
        await expect(busyOverlay(), 'busyOverlay không tắt sau khi F7 chạy xong').toHaveCount(0, {
            timeout: 120000,
        })
        await expect(appDialog(), 'không thấy hộp kết quả sau khi bấm Yes').toBeVisible({
            timeout: 120000,
        })
        const result = (await appDialog().innerText()).replace(/\s/g, '')

        if (total === 0) {
            expect(result, '0 dòng mà không báo E00003').toContain('該当するデータがありません')
            console.log('会計データ 0 dòng → đã đi nhánh E00003, KHÔNG có POST bulk-create')
        } else {
            expect(result, `${total} dòng mà không báo I00005`).toContain('会計データ作成が完了しました')
            console.log(`会計データ作成: ${total} dòng đã ghi`)
        }

        await appDialog().getByRole('button', { name: 'OK' }).click()
        await expect(appDialog()).toHaveCount(0)
        await step()
    })

    // ── 2. F2 患者情報 ───────────────────────────────────────────────────────

    test('TC-F2-1 — không có dòng chọn và ô 患者番号 rỗng → F2 là no-op', async () => {
        await clearPatNo()
        // Lưới 受付患者一覧 khởi tạo `selectedIndex = null` nên chưa có dòng nào
        // được báo lên; WinForm cũng `return` khi cả hai nguồn đều rỗng.
        await page.keyboard.press('F2')
        await expect(
            page,
            'F2 điều hướng dù không có bệnh nhân nào đang chọn',
        ).toHaveURL(/\/treatments\/?(\?|$)/)
        await expect(appDialog(), 'F2 no-op mà lại bật dialog').toHaveCount(0)
        await step()
    })

    test('TC-F2-2 — ô 患者番号 có số → F2 mở 患者登録 với đúng patientNo', async () => {
        await typePatNo(PAT_NO)
        await page.keyboard.press('F2')

        // showForm(ID201001) với InpKbn=Update ⇒ trên web là chế độ edit của
        // /patients/registration, phân biệt bằng chính search param patientNo.
        await expect(page, 'F2 không mở màn 患者登録').toHaveURL(registrationUrlRe(PAT_NO), {
            timeout: 30000,
        })
        await step()
        await backToList()
    })

    // ── 5. End / Esc = 患者確定 ──────────────────────────────────────────────

    test('TC-END-1 — phím End mở màn chi tiết của 患者番号 đang gõ, kèm ?trtDt', async () => {
        await typePatNo(PAT_NO)
        await page.keyboard.press('End')

        await expect(page, 'End không mở 診療入力 detail (btnEndEsc_Click)').toHaveURL(
            new RegExp(`/treatments/${PAT_NO}(\\?|$)`),
            { timeout: 30000 },
        )
        expect(
            unquote(new URL(page.url()).searchParams.get('trtDt')),
            'thiếu ?trtDt — detail sẽ tự lấy hôm nay thay vì 診療日 đang chọn',
        ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        await step()
        await backToList()
    })

    test('TC-END-2 — phím Escape làm ĐÚNG việc của End (không phải huỷ)', async () => {
        await typePatNo(PAT_NO)
        await page.keyboard.press('Escape')

        // fkey-scope-provider gộp Escape và End về cùng pseudo-key 'End'.
        // Nếu Escape bị hiểu là "đóng/huỷ" thì URL đứng yên ở /treatments.
        await expect(
            page,
            'Escape không kích hoạt 患者確定 — nó đang bị hiểu là huỷ?',
        ).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })
        await step()
        await backToList()
    })

    test('TC-ORDER-1 — ô 患者番号 THẮNG dòng đang chọn ở End, nhưng THUA ở F2', async () => {
        // Cần một dòng thật sự được chọn. 受付患者一覧 có thể rỗng (phụ thuộc
        // ngày), nên dùng 患者検索 (F1) — list này tự chọn dòng đầu sau khi 検索.
        await page.keyboard.press('F1')
        await expect(page.getByText('≪患者検索一覧≫')).toBeVisible({ timeout: 30000 })
        // `exact: true` là bắt buộc: nút 「F1 患者検索」 trên thanh FKey cũng chứa
        // chuỗi 検索 → match lỏng là strict mode violation (Rule 10.3).
        await page.getByRole('button', { name: '検索', exact: true }).click()
        await expect(rows(page).first().or(page.getByTestId('empty-state'))).toBeVisible({
            timeout: 30000,
        })

        const hasRow = (await rows(page).count()) > 0
        skipWithReason(
            !hasRow,
            '患者検索 không trả dòng nào → không có "dòng đang chọn" để so thứ tự ưu tiên.',
        )

        const selectedPatNo = (await rows(page).first().getByTestId('cell-patNo').innerText()).trim()
        // Cần hai số KHÁC nhau thì mới phân biệt được nguồn nào thắng.
        skipWithReason(
            selectedPatNo === PAT_NO,
            `dòng đầu của 患者検索 trùng TEST_PAT_NO (${PAT_NO}) → không phân biệt được nguồn. Đổi TEST_PAT_NO.`,
        )

        // (a) End: typedPatNo() đứng TRƯỚC → phải đi tới số GÕ TAY.
        await typePatNo(PAT_NO)
        await page.keyboard.press('End')
        await expect(
            page,
            `End phải ưu tiên ô 患者番号 (${PAT_NO}), không phải dòng đang chọn (${selectedPatNo})`,
        ).toHaveURL(new RegExp(`/treatments/${PAT_NO}(\\?|$)`), { timeout: 30000 })
        await step()

        // (b) F2: selectedPatNo() đứng TRƯỚC → phải đi tới số của DÒNG.
        await backToList()
        await page.keyboard.press('F1')
        await expect(page.getByText('≪患者検索一覧≫')).toBeVisible({ timeout: 30000 })
        await page.getByRole('button', { name: '検索', exact: true }).click()
        await expect(rows(page).first()).toBeVisible({ timeout: 30000 })
        await typePatNo(PAT_NO)
        await page.keyboard.press('F2')
        await expect(
            page,
            `F2 phải ưu tiên dòng đang chọn (${selectedPatNo}), không phải ô 患者番号 (${PAT_NO})`,
        ).toHaveURL(registrationUrlRe(selectedPatNo), { timeout: 30000 })
        await step()
        await backToList()
    })
})
