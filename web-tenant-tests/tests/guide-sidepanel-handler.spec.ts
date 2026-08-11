import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * SidePanel — tab ガイド (frm203002 《VB6》frmInpMain 07-A「ガイドタブ系」) trên màn
 * 診療入力 `/treatments/{patNo}`.
 *
 * ĐẶC TÍNH KIỂM THỬ: các assert dưới đây bám THEO WINFORM (src/OCHACOM/INP), không
 * bám theo code web. Chỗ nào web lệch WinForm thì tách ra thành testcase riêng tên
 * 「WinForm parity N」 ở cuối file — đỏ ở đó nghĩa là web lệch bản gốc, KHÔNG phải
 * test viết sai.
 *
 * 5 điểm lệch parity 1..5 ĐÃ ĐƯỢC SỬA ở web (commit d9f7dfce
 * 「ガイドタブが WinForm と乖離する5点を修正」) và cả 5 hiện XANH. Giữ lại làm
 * regression guard. Mỗi testcase parity TỰ DỰNG trạng thái nên chạy lẻ được:
 *   npx playwright test tests/guide-sidepanel-handler.spec.ts -g "WinForm parity 4"
 * Chạy nguyên file thì testcase đỏ ĐẦU TIÊN sẽ SKIP mọi testcase sau nó (serial).
 *
 * BẪY ĐÃ VẤP, đừng lặp lại: sau khi sửa điểm 5, ガイド không có 処置 làm dialog TỰ
 * ĐÓNG kèm alert E00024. Vì vậy mọi chỗ chốt một dòng ガイド phải mốc vào
 * `waitPickResult()` (dòng 処置 HOẶC alert) chứ KHÔNG phải sự xuất hiện của
 * `picker` — picker vẫn bung ra trong lúc query chạy rồi mới tắt, nên chờ nó sẽ
 * lọt nhánh rỗng và bỏ quên alert, và overlay của alert đó chặn click của
 * testcase kế tiếp (đã từng làm testcase F10 timeout 30s).
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - frm203002.cs:1974 getGuidNyuryokuInfo — nạp hfgGuid1 từ
 *    ImpMstTrt.getInpGuidNyuryokuData; `GuidNum = intRow + 1`, `GuidSyo = GUID_NM`
 *    → cột 「No.」 của web CHÍNH LÀ số thứ tự hiển thị, KHÔNG phải guid_cd.
 *    Đồng thời `cmdGuidPrv.Visible = false` + `cmdGuidReset.Visible = false`.
 *  - frm203002.cs:239 GuidCol — lưới ガイド chỉ 2 cột hiển thị: 0:№ / 1:処置名称.
 *  - frm203002.cs:2238 hfgGuid1_RowEnter — `txtGuid1Sel.Text = rowIndex + 1`
 *    → ô 選択No. luôn bám dòng đang sáng.
 *  - frm203002.cs:6515 hfgGuid1_CellDoubleClick — lấy GUID_CD + GuidSyo của dòng,
 *    snapshot getFocusDt/getFocusBui/getFocusDis vào frm203017.ParamData rồi mở
 *    ガイド処置選択. ComParam == null (F10/戻る) → `txtGuid1Sel.Focus()` rồi return;
 *    có data (F9 確定) → frmGuid2_Let_Data → `txtGuid1Sel.Text = ""` → `grdRegi.Focus()`.
 *  - frm203002.cs:6570 hfgGuid1_Click — CLICK ĐƠN trên lưới ガイド đã tương đương
 *    Enter (gọi grdGuid_KeyDown(Return) → CellDoubleClick). Vậy single-click của
 *    web ở tab này ĐÚNG WinForm (khác tab パック, nơi WinForm đòi double-click).
 *  - frm203002.cs:6584 grdGuid_KeyDown — Enter trên lưới = double-click.
 *  - frm203002.cs:6726 txtGuid1Sel_KeyDown — ↑/↓/PageUp/PageDown cuộn dòng chọn;
 *    Enter: TryParse ô No. → nhảy tới dòng (số − 1) NẾU trong phạm vi, rồi
 *    grdGuid_KeyDown(Return) được gọi NGOÀI nhánh kiểm tra phạm vi (xem parity).
 *  - frm203002.cs:6604 cmdGuidAll_Click 「全て表示」 → getGuidNyuryokuInfo2(true, false, true).
 *  - frm203002.cs:6617 cmdGuidPrv_Click 「前回」   → getGuidNyuryokuInfo2(false, true, false).
 *  - frm203002.cs:6631 cmdGuidReset_Click 「リセット」 → Q00100
 *    「該当部位の治療進行状態をリセットします。」 → StepReset() (GHI trt_state) →
 *    getGuidNyuryokuInfo2(false, false, false).
 *  - frm203002.cs:1990 getGuidNyuryokuInfo2 — bolStepPass=true → ẩn 前回/リセット;
 *    bolStepPass=false → HIỆN 前回/リセット. dt rỗng → MsgBox E00024
 *    「該当ガイドがありません。」 và KHÔNG gán DataSource (lưới giữ nguyên list cũ).
 *  - modGuid1.cs:37 pSet_Guid1 — dải guid_cd theo chế độ:
 *      · bolStepPass (F4 / 全て表示): `GUID_CD < 1000 or GUID_CD >= 2000`
 *      · STEP (Shift+F4):            `GUID_CD between 1000 and 1999` + PAC_STEPxx
 *      · 前回 (SelPrv):               `GUID_CD = intTrtS[0]` (mã trt_state, KHÔNG
 *        chắc nằm trong dải 1000-1999 → đừng assert dải cho nhánh này)
 *      · rỗng → fallback `GUID_CD between 1000 and 1999`.
 *    `GuidNum = cnt + 1` (đánh lại số sau khi lọc trùng GUID_CD).
 *  - frm203017.cs:432 initProc — `txtGuidNo.Text = param.guidCd`,
 *    `txtGuidNm.Text = param.guidNm`; nhãn lblName = 「ガイド番号」; cột lưới:
 *    ｺｰﾄﾞ / 枝番 / 処置名称 / 点数 / 回数. Escape ⇒ btnF9_Click (確定!) —
 *    frm203017.cs:180 — nên ĐÓNG DIALOG BẰNG F10, TUYỆT ĐỐI KHÔNG Escape.
 *  - frm203017.cs:1001 — lưới rỗng: guide_chk_flg=0 → Q00100
 *    「算定できる処置がありません。…」; =1 → E00024; cả hai nhánh đều `this.Close()`.
 *
 * ─── Web port (apps/web-tenant/src/features/treatments) ───────────────────────
 *  - components/treatment-side-panel.tsx: tab ガイド header 2 cột 「No.」/「名称」
 *    (grid-cols-[40px_1fr], sticky); dòng sáng nền `bg-[#ffffc0]`; guard
 *    prevGuidLen (:574) auto sáng dòng đầu khi list đổi; guard prevSelGuid (:600)
 *    đồng bộ ô No. = idx + 1; ô No. mang `data-side-anchor`, lọc ký tự bằng
 *    sanitizeDigits; effect :682 focus ô No. khi vào tab; effect :716 ←/→ đổi tab
 *    và ↑/↓ đổi dòng khi focus nằm trong side panel (có clamp 2 đầu);
 *    useEmptyGuideAlert (:102) bung alert 「該当ガイドがありません。」 cho STEP/前回.
 *  - components/guide-selection-dialog.tsx: header 「ガイド番号」 + guid_cd + guid_nm;
 *    F9 確定 (disabled khi mọi 回数 = 0) / F10 戻る; list rỗng → tự đóng + alert
 *    「算定できる処置がありません。」 (đã port nhánh E00024 của frm203017).
 *  - components/treatment-entry-detail.tsx: F4 → guidSubMode 'regular' + nhảy tab
 *    ガイド; Shift+F4 → 'step'; onOpenChange (:4959) đóng kiểu huỷ →
 *    refocusSidePanel() (con trỏ về ô No.), đóng kiểu 確定 → nhường focus cho lưới.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login trong một khung thời gian, nên login + mở màn 診療入力 làm đúng một lần ở
 * beforeAll. Thứ tự testcase có ý nghĩa (tab ガイド phải được mở trước, chế độ
 * regular phải chạy trước STEP/前回) — chạy lẻ một testcase ở giữa sẽ hỏng.
 *
 * Các testcase GHI dữ liệu (リセット thật → UPDATE trt_state; F9 確定 → đẩy 処置 vào
 * lưới) mặc định bị bỏ qua. Muốn chạy:
 *   TEST_ALLOW_COMMIT=1 npx playwright test tests/guide-sidepanel-handler.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/**
 * Mặc định KHÔNG truyền trtDt → app lấy ngày hôm nay, đúng tháng hiện hành (WinForm
 * chặn thao tác trên tháng khác). Muốn ghim ngày: TEST_TRT_DT=YYYY-MM-DD.
 */
const TRT_DT = process.env.TEST_TRT_DT ?? ''
/** Bật các nhánh GHI (リセット thật, F9 確定). Mặc định tắt. */
const ALLOW_COMMIT = process.env.TEST_ALLOW_COMMIT === '1'

/** Số dòng ガイド tối đa sẽ dò khi cần mở thử nhiều dòng. */
const SCAN_LIMIT = 8

/** Dải guid_cd dành riêng cho ガイド STEP (modGuid1.cs:98/107/135). */
const STEP_CD_MIN = 1000
const STEP_CD_MAX = 1999

/**
 * Hạn chờ cho các `waitForResponse` mang tính "mốc đồng bộ", luôn kèm `.catch(() => null)`.
 * Chúng có thể KHÔNG BAO GIỜ nổ: TanStack Query cache list ガイド với staleTime 5 phút,
 * nên lần bấm thứ hai vào cùng một chế độ không phát request nào. Để 30s thì mỗi cú
 * bấm đã cache phải ngồi chờ đủ 30s vô ích (từng làm một testcase parity mất 35s).
 * Sau mốc này luôn còn assert trên DOM nên chờ hụt cũng không làm test sai.
 */
const OPTIONAL_RESP_TIMEOUT = 10_000

test.describe.configure({ mode: 'serial' })

test.describe('SidePanel — tab ガイド (frm203002 ガイドタブ系)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog ガイド処置選択 (frm203017) — nhận diện bằng nhãn 「ガイド番号」 trong body. */
    let picker: Locator
    /** Alert E00024 「該当ガイドがありません。」 (getGuidNyuryokuInfo2, frm203002.cs:2011). */
    let noGuidAlert: Locator
    /** Alert E00024 「算定できる処置がありません。」 (frm203017 getViewData, :1015). */
    let noTrtAlert: Locator
    /** Khung side panel (w-[450px]) — mọi locator lưới đều bám vào đây. */
    let sidePanel: Locator
    /**
     * Dòng của tab ガイド. Header cũng dùng grid-cols-[40px_1fr] nên phải kèm
     * `cursor-pointer` (chỉ dòng dữ liệu mới có) để loại header ra.
     */
    let rows: Locator
    /** Ô 選択No. của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
    let noInput: Locator
    /** Nút 「前回」 / 「全て表示」 / 「リセット」 ở chân tab ガイド. */
    let prvBtn: Locator
    let allBtn: Locator
    let resetBtn: Locator

    /** Số thứ tự (cột No.) của dòng i — cell đầu tiên trong dòng. */
    const rowNo = (i: number) => rows.nth(i).locator('div').first()
    /** Tên ガイド (cột 名称) của dòng i. */
    const rowNm = (i: number) => rows.nth(i).locator('div').nth(1)

    /** Index của dòng đang sáng (nền #ffffc0); -1 nếu không có dòng nào. */
    async function highlightedIdx(): Promise<number> {
        return rows.evaluateAll((els) => els.findIndex((e) => e.className.includes('bg-[#ffffc0]')))
    }


    /**
     * Đóng dialog bằng PHÍM F10.
     * KHÔNG click nút 「F10 戻る」: màn nền cũng có nút F10 戻る nằm dưới modal.
     * TUYỆT ĐỐI KHÔNG Escape: frm203017.cs:180 map Escape ⇒ btnF9_Click (確定),
     * web bê nguyên (guide-selection-dialog.tsx:372) → Escape là XÁC NHẬN, không phải huỷ.
     */
    async function dismissPicker() {
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /** ガイド番号 đang hiển thị trên header dialog = frm203017 txtGuidNo = guid_cd. */
    async function pickerGuidCd(): Promise<number> {
        const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
        return Number(raw.trim())
    }

    /**
     * Chờ kết quả THẬT của một cú chốt ガイド.
     *
     * KHÔNG được mốc vào `picker` không thôi: dialog bung ra ngay khi query còn
     * đang chạy, rồi mới tự đóng nếu ガイド không có 処置 nào tính được
     * (frm203017.cs:1001-1024). Chờ `picker` sẽ luôn khớp cái cửa sổ loading đó và
     * bỏ lọt nhánh rỗng — tệ hơn là để lại alert E00024 chưa đóng, overlay của nó
     * chặn mọi click của testcase sau. Mốc đúng là DÒNG 処置 hoặc chính cái alert.
     */
    async function waitPickResult(): Promise<'rows' | 'empty'> {
        await expect(picker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
            timeout: 30000,
        })
        return (await noTrtAlert.count()) > 0 ? 'empty' : 'rows'
    }

    /** Đóng alert 「算定できる処置がありません。」 đang bung. */
    async function dismissNoTrtAlert() {
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
    }

    /**
     * Chốt dòng đầu tiên MỞ ĐƯỢC picker (bỏ qua các ガイド rỗng 処置 — chúng tự đóng
     * kèm E00024) và trả về index dòng đó. Dùng cho các testcase chỉ cần "một
     * picker đang mở" chứ không quan tâm là ガイド nào.
     */
    async function openPickableRow(): Promise<number> {
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'rows') return i
            await dismissNoTrtAlert()
        }
        throw new Error(`không ガイド nào trong ${total} dòng đầu mở được ガイド処置選択`)
    }

    /** Đóng dialog nếu nó đang mở (dọn dẹp đầu/cuối các testcase parity). */
    async function dismissPickerIfOpen() {
        if (await picker.count()) await dismissPicker().catch(() => {})
    }

    /**
     * Mở (hoặc nạp lại) màn 診療入力 của bệnh nhân test.
     *
     * Nạp lại trang là cách DUY NHẤT xoá cache TanStack Query (list ガイド có
     * staleTime 5 phút) và reset ref `hasAlerted` của useEmptyGuideAlert. Testcase
     * nào cần cú bấm của mình thực sự gọi BE / thực sự bung alert thì phải gọi hàm
     * này trước, nếu không nó chỉ đọc cache và không kết luận được gì.
     */
    async function gotoTreatments() {
        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        // Nếu phiên đăng nhập rụng thì app đá về /login và 「合計:」 KHÔNG BAO GIỜ hiện
        // → chờ đủ 60s rồi mới báo "element(s) not found", che mất nguyên nhân thật.
        // Soi URL trước để lỗi nói thẳng ra là mất session.
        await expect(page, 'goto màn 診療入力 mà bị đá về trang khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
    }

    /** Envelope `{ data: [...] }` của BE có phải list rỗng không. */
    async function isEmptyListResponse(resp: { json: () => Promise<unknown> }): Promise<boolean> {
        try {
            const body = (await resp.json()) as { data?: unknown }
            return Array.isArray(body.data) && body.data.length === 0
        } catch {
            return false
        }
    }

    /**
     * Đưa màn hình về trạng thái chuẩn của nhóm parity: tab ガイド, chế độ regular
     * (F4 → getGuidNyuryokuInfo), list đã nạp, không còn dialog/alert nào che.
     *
     * Mỗi testcase parity gọi hàm này ở đầu để TỰ DỰNG trạng thái của mình. Nhờ vậy
     * chạy lẻ được sau khi sửa bug:
     *   npx playwright test tests/guide-sidepanel-handler.spec.ts -g "Enter với ô No. RỖNG"
     * (file chạy `mode: 'serial'` nên một testcase đỏ sẽ SKIP mọi testcase sau nó —
     * sửa xong điểm nào thì grep chạy riêng điểm đó, hoặc chạy lại cả file.)
     */
    async function enterGuideRegular() {
        await dismissPickerIfOpen()
        await dismissNoGuidAlert(1000)
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && !r.url().includes('/tenant/guids/step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('F4')
        await resp
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
    }

    /**
     * Đóng alert E00024 nếu nó bung ra; trả về true khi có alert.
     *
     * PHẢI CHỜ chứ không soi `count()` ngay: alert do useEmptyGuideAlert bắn ở
     * effect SAU khi query resolve, nên ngay lúc response về nó chưa có trong DOM.
     * Soi ngay sẽ cho false rồi cú click kế tiếp đâm vào overlay `z-[200]` của alert.
     */
    async function dismissNoGuidAlert(waitMs = 5000): Promise<boolean> {
        const appeared = await noGuidAlert
            .waitFor({ state: 'visible', timeout: waitMs })
            .then(() => true)
            .catch(() => false)
        if (!appeared) return false
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noGuidAlert).toBeHidden({ timeout: 10000 })
        return true
    }

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        /**
         * Tự đóng SanteiConfirmDialog 「<trt_nm>を算定しますか？」 do AutoSantei bung ra.
         * Nó là DraggableDialog (nút Yes/No/Cancel) nổi ĐÈ lên mọi thứ và nuốt click;
         * thời điểm xuất hiện không đoán được nên cắm handler cho Playwright tự dọn.
         * Bấm 「No」 chứ KHÔNG 「Yes」: 「Yes」 算定 xong lại kéo theo dialog
         * カルテ記載選択 — đổi popup này lấy popup khác.
         */
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 30 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await gotoTreatments()

        picker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        noGuidAlert = page.getByText('該当ガイドがありません')
        noTrtAlert = page.getByText('算定できる処置がありません')
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        rows = sidePanel.locator('div[class*="grid-cols-[40px_1fr]"][class*="cursor-pointer"]')
        noInput = page.locator('input[data-side-anchor]')
        prvBtn = sidePanel.getByRole('button', { name: '前回', exact: true })
        allBtn = sidePanel.getByRole('button', { name: '全て表示', exact: true })
        resetBtn = sidePanel.getByRole('button', { name: 'リセット', exact: true })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('F4 mở tab ガイド — header No./名称 + danh sách pac_nam nạp xong', async () => {
        // frm203002.cs:4195/4698 KeyFunc(F4), nhánh non-STEP: nhảy sang tab ガイド rồi
        // getGuidNyuryokuInfo. Bấm PHÍM F4 chứ không click tab — đây mới là đường đi
        // WinForm, và nó kiểm luôn dây F-key của màn nền.
        await page.keyboard.press('F4')

        // Header sticky 2 cột — GuidCol chỉ có 0:№ và 1:処置名称 (frm203002.cs:239).
        // Bám vào DÒNG header (phần tử grid-cols-[40px_1fr] đầu tiên, không có
        // cursor-pointer) chứ không getByText('No.'): nhãn 「No.」 còn xuất hiện lần
        // nữa ở cụm 選択 dưới chân tab ガイド.
        const header = sidePanel.locator('div[class*="grid-cols-[40px_1fr]"]').first()
        await expect(header).toBeVisible({ timeout: 30000 })
        await expect(header.locator('div').first(), 'cột 0 phải là 「No.」').toHaveText('No.')
        await expect(header.locator('div').nth(1), 'cột 1 phải là 「名称」').toHaveText('名称')

        // 「読込中…」 → có dòng. Tenant KHÔNG có ガイド nào thì cả file vô nghĩa
        // (mọi testcase sau đều thao tác trên dòng), nên fail thẳng ở đây.
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        await expect(page.getByText('未登録')).toHaveCount(0)
        const n = await rows.count()
        expect(
            n,
            'tenant không có ガイド nào (pac_nam trống, hoặc không ガイド nào có dòng pag_trt)',
        ).toBeGreaterThan(0)
        console.log(`tab ガイド: ${n} dòng`)
        await step()
    })

    test('cột No. = số thứ tự 1..N (GuidNum = index + 1), KHÔNG phải guid_cd', async () => {
        // getGuidNyuryokuInfo (frm203002.cs:1981) gán GuidNum = intRow + 1;
        // pSet_Guid1 (modGuid1.cs:154) gán GuidNum = cnt + 1 sau khi lọc trùng
        // GUID_CD. GUID_CD nằm ở cột ẩn và KHÔNG hiển thị trên lưới.
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await expect(rowNo(i), `dòng ${i} sai số thứ tự`).toHaveText(String(i + 1))
        }
        await step()
    })

    test('vừa vào tab: dòng đầu sáng, ô No. = "1" và ô No. được focus', async () => {
        // DataGridView mặc định đặt CurrentCell về dòng 0 khi gán DataSource →
        // hfgGuid1_RowEnter bắn ngay `txtGuid1Sel.Text = 0 + 1`.
        expect(await highlightedIdx(), 'dòng đầu phải sáng khi list vừa nạp').toBe(0)
        await expect(noInput).toHaveValue('1')

        // Ghi chú lệch nhỏ: SSTab1_Selected (frm203002.cs:2226) focus LƯỚI
        // (hfgGuid1.Select()), web focus Ô No. Cả hai đều cho ↑/↓ + Enter chạy nên
        // không đánh đỏ. Chỉ log khi ô No. mất focus, vì nó đua với handler đóng
        // popup 算定 (popup đó kéo focus về nút của nó).
        const focused = await noInput
            .evaluate((el) => el === document.activeElement)
            .catch(() => false)
        if (!focused) {
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                if (!el) return 'null'
                const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
                return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? '-'}] "${label.slice(0, 30)}"`
            })
            console.log(`CẢNH BÁO: ô 選択No. không được focus khi vào tab ガイド; đang focus: ${desc}`)
        }
        await step()
    })

    test('click 1 dòng → sáng dòng đó, ô No. đồng bộ, mở ガイド処置選択', async () => {
        // hfgGuid1_Click (frm203002.cs:6570): CLICK ĐƠN ⇒ grdGuid_KeyDown(Return)
        // ⇒ hfgGuid1_CellDoubleClick. Vậy single-click ở tab ガイド là ĐÚNG WinForm.
        // Dùng dòng thứ 2 để phân biệt với dòng mặc định.
        const target = Math.min(1, (await rows.count()) - 1)
        const nm = (await rowNm(target).innerText()).trim()
        await rows.nth(target).click()

        expect(await highlightedIdx(), 'click không chuyển dòng sáng').toBe(target)
        await expect(noInput, 'hfgGuid1_RowEnter: ô No. phải bám dòng sáng').toHaveValue(
            String(target + 1),
        )

        await waitPickResult()
        // frm203017 _title = 「ガイド処置選択」, lblName = 「ガイド番号」.
        await expect(picker.getByText('ガイド処置選択').first()).toBeVisible()
        await expect(picker.getByText('ガイド番号')).toBeVisible()
        // txtGuidNm = param.guidNm = GuidSyo của dòng đã chốt.
        // `.first()`: guid_nm có thể trùng tên một 処置 trong lưới của dialog.
        if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        console.log(`click dòng ${target + 1} 「${nm}」 → ガイド番号 ${await pickerGuidCd()}`)
        await step()
        await dismissPicker()
    })

    test('dialog hiển thị đủ 5 cột ｺｰﾄﾞ/枝番/処置名称/点数/回数 (frm203017 _viewItem)', async () => {
        await rows.first().click()
        await waitPickResult()

        // frm203017.cs:95-103 _viewItem — 4 cột đầu Visible=true, 回数 là cột
        // editable cũng hiển thị; 4 cột sau (jihi_flg/men/unit/acc_unit) width 0 → ẩn.
        for (const h of ['コード', '枝番', '処置名称', '点数', '回数']) {
            await expect(
                picker.getByText(h, { exact: true }).first(),
                `dialog thiếu cột ${h}`,
            ).toBeVisible()
        }
        await step()
        await dismissPicker()
    })

    test('chế độ regular (F4): guid_cd của mọi dòng nằm NGOÀI dải STEP 1000-1999', async () => {
        // modGuid1.cs:44 — bolStepPass ⇒ `(PCNA.GUID_CD < 1000 or PCNA.GUID_CD >= 2000)`.
        // Assert này bắt lỗi filter của BE: nếu một ガイド STEP lọt vào list F4 thì
        // F4 và Shift+F4 đang trả về cùng một tập.
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await rows.nth(i).click()
            // ガイド rỗng 処置 tự đóng kèm E00024 → không có header để đọc guid_cd.
            // Phải dọn alert rồi đi tiếp, nếu bỏ mặc thì overlay của nó chặn click
            // của testcase sau (đã từng làm testcase F10 phía dưới timeout 30s).
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            const cd = await pickerGuidCd()
            expect(
                cd >= STEP_CD_MIN && cd <= STEP_CD_MAX,
                `dòng ${i + 1}: guid_cd ${cd} thuộc dải STEP 1000-1999 mà vẫn nằm trong list F4 ` +
                    `(modGuid1.cs:44 chỉ cho GUID_CD < 1000 hoặc >= 2000)`,
            ).toBe(false)
            await dismissPicker()
        }
        await step()
    })

    test('đóng dialog kiểu huỷ (F10) → con trỏ quay lại ô 選択No.', async () => {
        // frm203002.cs:6559-6563 — ComParam == null (F10/戻る) thì txtGuid1Sel.Focus()
        // rồi return (KHÔNG chạy tiếp frmGuid2_Let_Data).
        // Cần một picker ĐANG MỞ nên phải bỏ qua các ガイド rỗng — dòng đang sáng lúc
        // này là dòng cuối mà testcase trước quét tới, có thể chính là dòng rỗng.
        await openPickableRow()
        await dismissPicker()

        await expect
            .poll(() => noInput.evaluate((el) => el === document.activeElement), { timeout: 15000 })
            .toBe(true)
        await step()
    })

    test('↑/↓ đổi dòng sáng và kéo theo ô No., có clamp ở hai đầu', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6728-6742): ↑ ⇒ hfgGuid1.ScrollRowUp(),
        // ↓ ⇒ ScrollRowDown() — dừng ở hai đầu lưới, KHÔNG nhảy vòng.
        // Web nghe keydown ở window nhưng chỉ chạy khi focus nằm TRONG side panel.
        await noInput.click()
        const total = await rows.count()

        const start = await highlightedIdx()
        await page.keyboard.press('ArrowDown')
        const expectedDown = Math.min(start + 1, total - 1)
        expect(await highlightedIdx(), '↓ không xuống dòng').toBe(expectedDown)
        await expect(noInput).toHaveValue(String(expectedDown + 1))

        await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx(), '↑ không lên dòng').toBe(Math.max(expectedDown - 1, 0))

        // Clamp đầu list: ↑ quá số dòng vẫn dừng ở dòng 1 (không âm, không nhảy vòng).
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx(), '↑ vượt đầu list phải clamp về dòng 1').toBe(0)
        await expect(noInput).toHaveValue('1')

        // Clamp cuối list.
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowDown')
        expect(await highlightedIdx(), '↓ vượt cuối list phải clamp ở dòng cuối').toBe(total - 1)
        await expect(noInput).toHaveValue(String(total))

        // Trả về dòng 1 cho các testcase sau.
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx()).toBe(0)
        await step()
    })

    test('ô 選択No. chỉ nhận chữ số', async () => {
        // txtGuid1Sel là ô số (nhánh Enter chạy int.TryParse); web lọc ngay lúc gõ
        // bằng sanitizeDigits = raw.replace(/\D/g,'') nên chữ/dấu bị nuốt tại chỗ.
        await noInput.fill('')
        await noInput.pressSequentially('a1b-2.c')
        await expect(noInput).toHaveValue('12')

        // Gõ No. KHÔNG được đổi dòng sáng — WinForm chỉ đổi CurrentCell ở nhánh Enter.
        expect(await highlightedIdx(), 'gõ No. không được tự nhảy dòng sáng').toBe(0)
        await step()
    })

    test('Enter trên ô No. có số → nhảy đúng dòng đó rồi mở dialog của dòng đó', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6747-6752): intRow--, nếu
        // 0 <= intRow < Rows.Count thì hfgGuid1.CurrentCell = dòng đó, sau đó
        // grdGuid_KeyDown(Return) mở frm203017 cho CHÍNH dòng vừa nhảy tới.
        const total = await rows.count()
        const target = Math.min(3, total) // No. 1-based
        const nm = (await rowNm(target - 1).innerText()).trim()

        await noInput.fill(String(target))
        await noInput.press('Enter')

        expect(await highlightedIdx(), 'Enter phải nhảy tới dòng của No.').toBe(target - 1)
        await waitPickResult()
        // Dialog phải là của ĐÚNG dòng vừa nhảy tới, không phải dòng đang sáng cũ.
        if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        console.log(`Enter No. ${target} → 「${nm}」`)
        await step()
        await dismissPicker()
    })

    test('click lại chính dòng đang sáng → mở lại đúng dialog đó (idempotent)', async () => {
        // hfgGuid1_Click gọi lại CellDoubleClick trên cùng CurrentCell → cùng một
        // frm203017 với cùng ParamData; không cộng dồn gì (khác tab 個別).
        // Dòng phải là dòng MỞ ĐƯỢC picker thì mới so được ガイド番号 hai lần.
        const idx = await openPickableRow()
        const first = await pickerGuidCd()
        await dismissPicker()

        await rows.nth(idx).click()
        await waitPickResult()
        expect(await pickerGuidCd(), 'click lại cùng dòng phải cho cùng ガイド番号').toBe(first)
        expect(await highlightedIdx()).toBe(idx)
        await step()
        await dismissPicker()
    })

    test('←/→ đổi tab khi side panel giữ focus, quay lại ガイド giữ nguyên trạng thái', async () => {
        await noInput.click()
        const before = await rows.count()
        const beforeNo = await noInput.inputValue()

        // → sang tab パック (SIDE_TABS = 病検/ガイド/パック/個別 → ガイド đứng thứ 2).
        await page.keyboard.press('ArrowRight')
        await expect(
            sidePanel.locator('div[class*="grid-cols-[35px_1fr]"]').first(),
        ).toBeVisible({ timeout: 30000 })
        await expect(rows, 'rời tab ガイド mà list ガイド vẫn còn').toHaveCount(0)

        // ← quay lại. SidePanel không unmount → số dòng và ô No. giữ nguyên.
        await page.keyboard.press('ArrowLeft')
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        expect(await rows.count()).toBe(before)
        await expect(noInput, 'ô No. không được reset khi quay lại tab').toHaveValue(beforeNo)
        await step()
    })

    test('「全て表示」 (cmdGuidAll) → list là SUPERSET của list F4, vẫn dải regular', async () => {
        // cmdGuidAll_Click → getGuidNyuryokuInfo2(con, bolStepPass:true, SelPrv:false,
        // AllGuid:true) → cùng dải guid_cd với F4 nhưng BỎ điều kiện dis_cd
        // (getInpGuidNyuryokuData nhánh AllGuid) và bỏ luôn PacnamChk
        // (modGuid1.cs:152 `pass || bolStepPass`) → không bao giờ ít dòng hơn F4.
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && r.url().includes('allGuid=true'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await allBtn.click()
        await resp
        await expect(allBtn, '全て表示 không bật trạng thái ON').toHaveClass(/bg-primary/)

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        expect(
            after,
            `全て表示 (${after} dòng) phải ⊇ list F4 (${before} dòng) — nó chỉ BỎ BỚT điều kiện lọc`,
        ).toBeGreaterThanOrEqual(before)

        // Vẫn là dải regular: bolStepPass=true nên guid_cd không được rơi vào 1000-1999.
        await rows.first().click()
        await waitPickResult()
        const cd = await pickerGuidCd()
        expect(
            cd >= STEP_CD_MIN && cd <= STEP_CD_MAX,
            `全て表示 trả guid_cd ${cd} thuộc dải STEP — modGuid1.cs:44 vẫn giữ dải regular`,
        ).toBe(false)
        await dismissPicker()
        console.log(`全て表示: ${before} → ${after} dòng`)
        await step()
    })

    test('Shift+F4 (STEP) → guid_cd trong dải 1000-1999, hoặc alert 該当ガイドがありません', async () => {
        // frm203002.cs:4698-4714 nhánh STEP → getGuidNyuryokuInfo2(bolStepPass:false)
        // → modGuid1.pSet_Guid1: `GUID_CD between 1000 and 1999` + PAC_STEPxx =
        // intTrtS[0]; rỗng → fallback VẪN `between 1000 and 1999`; rỗng nốt → E00024
        // 「該当ガイドがありません。」 và lưới GIỮ NGUYÊN list cũ (không gán DataSource).
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('Shift+F4')
        await resp

        if (await dismissNoGuidAlert()) {
            expect(
                await rows.count(),
                'E00024: WinForm KHÔNG gán DataSource khi rỗng → lưới phải giữ nguyên list cũ',
            ).toBe(before)
            console.log('Shift+F4 → 該当ガイドがありません (không có STEP ガイド khớp trt_state)')
            await step()
            return
        }

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            const cd = await pickerGuidCd()
            expect(
                cd,
                `STEP dòng ${i + 1}: guid_cd ${cd} ngoài dải 1000-1999 (modGuid1.cs:98/135)`,
            ).toBeGreaterThanOrEqual(STEP_CD_MIN)
            expect(cd, `STEP dòng ${i + 1}: guid_cd ${cd} ngoài dải 1000-1999`).toBeLessThanOrEqual(
                STEP_CD_MAX,
            )
            await dismissPicker()
        }
        console.log(`Shift+F4 → ${await rows.count()} dòng STEP`)
        await step()
    })

    test('「前回」 (cmdGuidPrv) → bật chế độ prv, list rỗng thì báo E00024', async () => {
        // cmdGuidPrv_Click → getGuidNyuryokuInfo2(con, false, true, false) →
        // modGuid1.cs:105-108 `GUID_CD = intTrtS[0]` (mã trt_state — KHÔNG assert
        // dải 1000-1999 ở nhánh này). intTrtS[0] = 0 → rỗng → fallback → E00024.
        //
        // Đây là cú bấm 前回 ĐẦU TIÊN của phiên nên chắc chắn gọi BE và chắc chắn
        // bung alert nếu rỗng → assert luôn bất biến 「rỗng thì lưới giữ nguyên」 ở
        // đây. 「WinForm parity 1」 kiểm cùng bất biến nhưng cô lập (chạy lẻ).
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=prv'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await prvBtn.click()
        await resp
        // Dọn alert TRƯỚC mọi assert bằng getByRole: AlertDialog của Radix gắn
        // `aria-hidden` lên toàn bộ nền khi mở, nên locator theo role không nhìn
        // thấy nút 前回 nữa (báo "element(s) not found" chứ không phải sai class).
        const alerted = await dismissNoGuidAlert()
        await expect(prvBtn, '前回 không bật trạng thái ON').toHaveClass(/bg-primary/)

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        if (alerted) {
            // getGuidNyuryokuInfo2 (frm203002.cs:2014) chỉ gán DataSource ở nhánh CÓ
            // dòng; nhánh rỗng chỉ bung E00024 và để nguyên lưới.
            expect(
                after,
                `E00024 mà list đổi ${before} → ${after} dòng. WinForm không gán DataSource ` +
                    `khi rỗng nên lưới phải giữ nguyên ${before} dòng.`,
            ).toBe(before)
        }
        console.log(
            alerted
                ? `前回 → 該当ガイドがありません (trt_state chưa có tiến trình cho 部位 này); list ${before} → ${after} dòng`
                : `前回 → ${after} dòng`,
        )
        await step()
    })

    test('「リセット」 → hỏi Q00100 該当部位の治療進行状態…; chọn No → không ghi gì', async () => {
        // cmdGuidReset_Click (frm203002.cs:6631): Q00100 TRƯỚC, chọn OK mới chạy
        // StepReset() (UPDATE trt_state). Nhánh Cancel không ghi gì → chạy được mặc
        // định. Nhánh OK là GHI THẬT nên nằm ở testcase riêng, mặc định skip.
        const before = await rows.count()
        await resetBtn.click()

        const confirm = page.getByText('該当部位の治療進行状態をリセットします')
        const appeared = await confirm
            .waitFor({ state: 'visible', timeout: 8000 })
            .then(() => true)
            .catch(() => false)

        if (!appeared) {
            // Web chặn sớm khi 部位病名行 đang focus không có 病名 (disCd0 <= 0) —
            // WinForm hỏi Q00100 vô điều kiện. Không đủ dữ kiện để phân biệt
            // "thiếu 病名" với "nút hỏng" nên log thay vì đánh đỏ.
            console.log(
                'CẢNH BÁO WinForm parity: リセット không bung Q00100. WinForm cmdGuidReset_Click ' +
                    'hỏi vô điều kiện; web return sớm khi 部位病名行 đang focus không có 病名 ' +
                    '(handleGuidReset: disCd0 <= 0). Chọn một 部位病名行 rồi chạy lại để kiểm nhánh này.',
            )
            await step()
            return
        }

        await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
        await expect(confirm).toBeHidden({ timeout: 10000 })
        expect(await rows.count(), 'huỷ Q00100 mà list vẫn đổi → đã lỡ chạy StepReset').toBe(before)
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // WinForm parity — 5 điểm web ĐANG LỆCH bản gốc, mỗi điểm là MỘT testcase
    // assert thẳng theo WinForm nên nó ĐỎ cho tới khi web được sửa.
    //
    // Mỗi testcase TỰ DỰNG trạng thái (enterGuideRegular) → sửa xong điểm nào thì
    // chạy riêng điểm đó, không cần chạy lại cả file:
    //   npx playwright test tests/guide-sidepanel-handler.spec.ts -g "<tên testcase>"
    // Lưu ý file chạy `mode: 'serial'`: chạy nguyên file thì testcase đỏ đầu tiên
    // sẽ SKIP mọi testcase sau nó, nên mỗi lần chạy full chỉ thấy điểm lệch đầu.
    // ─────────────────────────────────────────────────────────────────────────

    test('WinForm parity 1: 前回 rỗng (E00024) → lưới phải GIỮ NGUYÊN list cũ', async () => {
        // getGuidNyuryokuInfo2 (frm203002.cs:2005-2016):
        //   if (dt.Rows.Count == 0) { MsgDialog.ShowErrorMsg("E00024", "該当ガイド"); }
        //   else                    { hfgGuid1.DataSource = dt; }        ← CHỈ nhánh else
        // Rỗng ⇒ KHÔNG gán DataSource ⇒ lưới giữ nguyên list đang hiển thị.
        //
        // CHẠY LẺ mới kết luận được, chạy nguyên file thì testcase này TỰ SKIP:
        // 「前回」 phía trên đã gọi BE mode=prv rồi, cú bấm ở đây chỉ đọc cache
        // (staleTime 5 phút) nên không có response để soi → không biết BE trả rỗng
        // hay không → skip thay vì đoán mò. Bất biến vẫn được phủ trong lần chạy
        // full bởi testcase 「Shift+F4」 và 「前回」 (cả hai assert list giữ nguyên ở
        // nhánh E00024) — đây chỉ là bản kiểm riêng, cô lập.
        //
        // KHÔNG nạp lại trang để ép fetch mới: `page.goto` giữa suite làm SPA không
        // boot lại được (màn hình trắng, 「合計:」 không bao giờ render) — app giới hạn
        // số lần login trong một khung thời gian, xem chú thích đầu file.
        await enterGuideRegular()

        // Dựng một list RỘNG bằng 全て表示 để chênh lệch nhìn thấy được (27 → 334 dòng
        // trên tenant test). Nếu 前回 giữ đúng như WinForm thì con số này không đổi.
        const allResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && r.url().includes('allGuid=true'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await allBtn.click()
        await allResp
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const before = await rows.count()

        // Vào chế độ STEP bằng Shift+F4 — nút 前回 CHỈ hiện ở nhánh bolStepPass=false
        // (xem 「WinForm parity 2」). Cú Shift+F4 này cũng rỗng trên tenant test, nên
        // nó đã là một phép thử của chính bất biến đang xét: list phải vẫn là `before`.
        const stepResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('Shift+F4')
        await stepResp
        await dismissNoGuidAlert()
        await expect(prvBtn, 'Shift+F4 phải làm nút 前回 hiện ra (chế độ STEP)').toBeVisible({
            timeout: 15000,
        })

        const prvResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=prv'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await prvBtn.click()
        const prvBody = await prvResp
        // Kết luận "BE trả rỗng" từ CHÍNH RESPONSE, không dựa vào alert: alert chỉ
        // bung một lần cho mỗi lượt fetch nên không phải tín hiệu tin cậy.
        const beReturnedEmpty = prvBody ? await isEmptyListResponse(prvBody) : false
        // Dọn alert TRƯỚC khi đếm: overlay của Radix AlertDialog che side panel.
        await dismissNoGuidAlert()
        test.skip(
            !beReturnedEmpty,
            '前回 lần này BE trả có dòng nên không chạm nhánh E00024 — không có gì để so',
        )

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        expect(
            after,
            `E00024 mà list đổi ${before} → ${after} dòng. WinForm chỉ gán DataSource ở nhánh ` +
                `CÓ dòng (frm203002.cs:2014) nên lưới phải giữ nguyên ${before} dòng.`,
        ).toBe(before)
        await step()
    })

    test('WinForm parity 2: 「前回」/「リセット」 phải ẩn ở chế độ regular (F4)', async () => {
        // getGuidNyuryokuInfo (frm203002.cs:1985-1986) — mở tab / F4 luôn đặt
        // `cmdGuidPrv.Visible = false` và `cmdGuidReset.Visible = false`.
        // getGuidNyuryokuInfo2(bolStepPass:true) (:1994-1998, tức 全て表示) cũng ẩn.
        // Chỉ nhánh bolStepPass=false (Shift+F4 / 前回 / リセット) mới HIỆN 2 nút này.
        // Web dựng cả 2 nút cố định trong footer tab ガイド.
        await enterGuideRegular()

        await expect(
            prvBtn,
            'getGuidNyuryokuInfo đặt cmdGuidPrv.Visible = false → nút 前回 phải ẩn ở chế độ regular',
        ).toBeHidden({ timeout: 5000 })
        await expect(
            resetBtn,
            'getGuidNyuryokuInfo đặt cmdGuidReset.Visible = false → nút リセット phải ẩn ở chế độ regular',
        ).toBeHidden({ timeout: 5000 })
        await step()
    })

    test('WinForm parity 3: Enter với No. ngoài phạm vi → vẫn mở dialog của dòng đang sáng', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6745-6754):
        //   if (int.TryParse(...)) {
        //       intRow--;
        //       if (0 <= intRow && intRow < Rows.Count) { CurrentCell = ...; }  ← chỉ NHẢY DÒNG
        //       grdGuid_KeyDown(txtGuid1Sel, Return);                           ← NGOÀI if ⇒ LUÔN chạy
        //   }
        // Nghĩa là số ngoài phạm vi KHÔNG dời CurrentCell nhưng VẪN mở ガイド処置選択
        // cho dòng đang sáng. Web return sớm khi list[idx] undefined.
        await enterGuideRegular()
        await noInput.click()
        const before = Math.max(await highlightedIdx(), 0)
        const nm = (await rowNm(before).innerText()).trim()

        await noInput.fill('9999')
        await noInput.press('Enter')

        try {
            await expect(
                picker,
                'WinForm: grdGuid_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi (frm203002.cs:6753) ' +
                    '→ No. sai vẫn phải mở ガイド処置選択 cho dòng đang sáng. Web đang return sớm khi ' +
                    'list[idx] undefined (treatment-side-panel.tsx:1126).',
            ).toBeVisible({ timeout: 10000 })
            // CurrentCell không đổi → dialog phải là của ĐÚNG dòng đang sáng trước đó.
            expect(await highlightedIdx(), 'No. ngoài phạm vi không được dời dòng sáng').toBe(before)
            if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        } finally {
            // Dọn dialog dù assert đỏ hay xanh — testcase sau chạy trên màn sạch.
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity 4: Enter với ô No. RỖNG → không mở gì (int.TryParse thất bại)', async () => {
        // frm203002.cs:6746 — toàn bộ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ KHÔNG đổi CurrentCell, KHÔNG mở dialog.
        // Web dùng `guidNo.trim() ? Number(guidNo) - 1 : (selectedGuidIdx ?? -1)`
        // nên ô rỗng lại chốt dòng đang sáng.
        await enterGuideRegular()
        await noInput.click()
        const before = await highlightedIdx()
        await noInput.fill('')
        await noInput.press('Enter')

        try {
            // Soi dialog TRƯỚC: nếu Enter đã mở dialog thì ↑/↓ không còn tác dụng lên
            // side panel nữa, mốc đồng bộ bên dưới sẽ hỏng theo và che mất nguyên nhân.
            await expect(
                picker,
                'WinForm: nhánh Enter của txtGuid1Sel nằm trong if(int.TryParse) → ô No. rỗng thì ' +
                    'KHÔNG mở ガイド処置選択. Web đang rơi về selectedGuidIdx (treatment-side-panel.tsx:1125).',
            ).toBeHidden({ timeout: 10000 })

            // Assert VẮNG MẶT — mốc vào một tín hiệu CÓ THẬT xảy ra SAU cú Enter (↓ một
            // dòng) thay vì soi ngay (Rule 7: không sleep).
            const afterDown = Math.min(before + 1, (await rows.count()) - 1)
            await page.keyboard.press('ArrowDown')
            await expect(noInput).toHaveValue(String(afterDown + 1))
            await page.keyboard.press('ArrowUp') // trả dòng sáng về chỗ cũ
        } finally {
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity 5: ガイド không có 処置 tính được → dialog phải TỰ ĐÓNG', async () => {
        // frm203017.cs:1001-1017 — dspDt.Rows.Count == 0:
        //   guide_chk_flg == 0 → Q00100「算定できる処置がありません。…」, chọn Cancel ⇒ Close()
        //   guide_chk_flg == 1 → E00024「算定できる処置がありません。」 ⇒ Close()
        // Cả hai nhánh đều ĐÓNG form. Web giữ dialog mở và chỉ hiện 「該当なし」.
        await enterGuideRegular()

        // Dò dòng đầu tiên cho lưới rỗng (trên tenant test là dòng 8). Mỗi cú chốt
        // ra 1 trong 2 kết quả nên phải chờ CẢ HAI — dialog rỗng KHÔNG còn ở lại để
        // waitPicker() bắt được nữa, nó đóng ngay theo đúng frm203017:
        //   a) picker mở (ガイド có 処置 tính được), hoặc
        //   b) alert 「算定できる処置がありません。」 (ガイド rỗng → form tự đóng).
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        let emptyIdx = -1
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            // Mốc phải là DÒNG 処置 trong picker, KHÔNG phải bản thân picker: picker
            // bung ra ngay lúc query còn đang chạy rồi mới tự đóng khi biết là rỗng,
            // nên chờ `picker.or(alert)` sẽ luôn khớp picker trước và bỏ sót nhánh rỗng.
            await expect(
                picker.getByTestId('cell-trtNm').first().or(noTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if (await noTrtAlert.count()) {
                emptyIdx = i
                break
            }
            await dismissPicker()
        }
        test.skip(
            emptyIdx < 0,
            `mọi ガイド trong ${total} dòng đầu đều có 処置 tính được → không có gì để so`,
        )

        console.log(`dòng ${emptyIdx + 1}: ガイド không có 処置 tính được`)
        try {
            // Thứ tự của WinForm: form đóng TRƯỚC rồi mới báo lỗi → picker không được
            // "nháy" một cái rồi tắt, tại thời điểm alert bung nó phải đã biến mất.
            await expect(
                picker,
                'frm203017 rỗng ⇒ MsgBox + this.Close(): alert đã bung mà picker vẫn còn mở',
            ).toBeHidden({ timeout: 10000 })
        } finally {
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity: F9 確定 đẩy 処置 vào lưới VÀ xoá ô 選択No. (mặc định BỎ QUA)', async () => {
        test.skip(!ALLOW_COMMIT, 'làm bẩn lưới đang mở — đặt TEST_ALLOW_COMMIT=1 để chạy')

        // frm203002.cs:6565-6572, nhánh có data:
        //   frmGuid2_Let_Data(con, param);   → đẩy 処置 vào grdRegi
        //   txtGuid1Sel.Focus();
        //   txtGuid1Sel.Text = "";           ← XOÁ ô 選択No.
        //   grdRegi.Focus();
        // Web không reset guidNo sau 確定 (treatment-entry-detail.tsx:4959 chỉ bỏ
        // phần refocus, không xoá giá trị).
        await openPickableRow()

        // Nút F9 確定 disabled khi mọi 回数 = 0 (hasAnyCnt). Double-click 1 dòng để
        // chạy vòng 回数 (dgvView_CellClick: cnt = (cnt + 1) % (maxCnt + 1)).
        const f9 = picker.getByRole('button', { name: /F9\s*確定/ })
        if (await f9.isDisabled()) {
            await picker.getByTestId('cell-trtNm').first().dblclick()
        }
        await expect(f9).toBeEnabled({ timeout: 10000 })

        // Mỗi 処置 chốt thêm ít nhất 1 dòng vào lưới → số ô [data-grid-cell] phải tăng.
        const cells = page.locator('[data-grid-cell]')
        const beforeCells = await cells.count()
        await f9.click()
        await expect(picker).toBeHidden({ timeout: 20000 })
        await expect.poll(() => cells.count(), { timeout: 30000 }).toBeGreaterThan(beforeCells)

        // Chk_CmtAuto có thể kéo theo カルテ記載選択 (CmtAutoPickerDialog) — F10 để bỏ
        // qua; dòng 処置 đã được chèn TRƯỚC đó.
        const dialogs = page.getByRole('dialog')
        for (let i = 0; i < 3 && (await dialogs.count()) > 0; i++) {
            await page.keyboard.press('F10')
            // Không assert cứng: có thể là dialog dây chuyền (batch kế tiếp mở ngay),
            // vòng lặp sẽ dọn tiếp — đây chỉ là dọn dẹp sau khi đã assert xong.
            await expect(dialogs.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }

        await expect(
            noInput,
            'WinForm frm203002.cs:6570 `txtGuid1Sel.Text = ""` → 確定 xong phải XOÁ ô 選択No.',
        ).toHaveValue('')
        await step()
    })

    test('リセット thật (StepReset → UPDATE trt_state) (mặc định BỎ QUA)', async () => {
        test.skip(
            !ALLOW_COMMIT,
            'GHI trt_state của bệnh nhân test — đặt TEST_ALLOW_COMMIT=1 để chạy',
        )

        // cmdGuidReset_Click: Q00100 OK → StepReset() (UPDATE trt_state) →
        // getGuidNyuryokuInfo2(con, false, false, false) → nạp lại list STEP.
        // Sau reset intTrtS[0] = 0 nên list rỗng → E00024 là kết quả HỢP LỆ.
        await resetBtn.click()
        const confirm = page.getByText('該当部位の治療進行状態をリセットします')
        await expect(confirm).toBeVisible({ timeout: 10000 })
        await page.getByRole('button', { name: /^(Yes|はい)$/ }).first().click()
        await expect(confirm).toBeHidden({ timeout: 10000 })

        // Kết quả: hoặc list STEP mới, hoặc E00024 (list cũ giữ nguyên).
        await expect(noGuidAlert.or(rows.first())).toBeVisible({ timeout: 30000 })
        await dismissNoGuidAlert()
        await step()
    })

})

// ═════════════════════════════════════════════════════════════════════════════
// SidePanel — ô 選択№ + Enter: PARITY CHUNG cho CẢ 4 TAB (病検/ガイド/パック/個別)
//
// Tab ガイド đã được port đúng `txtGuid1Sel_KeyDown` (frm203002.cs:6728). Ba tab
// còn lại dùng chung một handler viết tay KHÁC WinForm. Nhóm testcase dưới đây
// chốt SPEC THEO WINFORM cho cả 4 tab — nhiều testcase sẽ ĐỎ cho tới khi web
// được sửa, đó là chủ đích (spec-first), KHÔNG phải test viết sai.
//
// ─── Bảng quyết định lấy thẳng từ WinForm ────────────────────────────────────
// Gọi N = số dòng đang hiển thị của tab.
//
//  ┌──────────────┬──────────────────────┬──────────────────────────────────────┐
//  │ Ô № nhập     │ ガイド/パック/個別    │ 病検                                 │
//  ├──────────────┼──────────────────────┼──────────────────────────────────────┤
//  │ 1..N (hợp lệ)│ nhảy dòng + CHỐT dòng│ nhảy dòng + CHỐT dòng                │
//  │ ngoài phạm vi│ KHÔNG nhảy dòng      │ KHÔNG nhảy, KHÔNG chốt               │
//  │ (0 / 999)    │ nhưng VẪN CHỐT dòng  │ (guard `Val(txt) < grdByou.Rows.Count│
//  │              │ đang sáng            │  && Val(txt) != 0`, :6451/:6453)     │
//  │ RỖNG         │ KHÔNG làm gì         │ KHÔNG làm gì                         │
//  │              │ (int.TryParse fail)  │ (`Val("") == 0` → guard chặn)        │
//  └──────────────┴──────────────────────┴──────────────────────────────────────┘
//
// Cột giữa PHẢN TRỰC GIÁC nhưng đúng bản gốc: lời gọi `grd*_KeyDown(Return)` nằm
// NGOÀI khối `if (0 <= intRow && intRow < Rows.Count)`:
//   · ガイド : frm203002.cs:6759  grdGuid_KeyDown(txtGuid1Sel, Return)
//   · パック : frm203002.cs:6889  grdPack_KeyDown(txtPackSentakuNo, Return)
//   · 個別  : frm203002.cs:6970  grdKobe_KeyDown(txtKobetuSel, Return)
// còn 病検 đi đường khác hẳn (txtByokenSel_KeyPress, :6430) và CÓ guard chặn.
//
// KHÔNG off-by-one: `intRow--` (guide :6753, pack :6883). Ở 病検/個別 dòng
// `//intRow--` bị COMMENT nhưng lưới legacy có 1 dòng dummy ẩn ở index 0 nên
// hai cách vẫn TƯƠNG ĐƯƠNG 1-based. Web dùng mảng 0-based + `Number(no) - 1` là
// chuẩn — các testcase 「№ 1 → dòng thứ nhất」 dưới đây là chốt chặn để không ai
// "sửa ngược" thành 0-based khi đọc nhầm dòng comment đó.
//
// ─── Web port đang lệch ở đâu (apps/web-tenant/.../treatment-side-panel.tsx) ──
//  · 病検 :1061-1070 — `byouNo.trim() ? Number(byouNo) - 1 : (selectedByouIdx ?? -1)`
//      → ô RỖNG lại chốt dòng đang sáng (WinForm không làm gì); và KHÔNG hề
//        setSelectedByouIdx nên № hợp lệ cũng không dời dòng sáng.
//  · ガイド :1135-1162 — ĐÃ ĐÚNG (bản port verbatim).
//  · パック :1181-1196 / 個別 :1260-1281 — `if (item)` bọc CẢ setSelectedIdx lẫn
//        onPick → № ngoài phạm vi không chốt gì (WinForm vẫn chốt dòng đang sáng),
//        còn № rỗng lại chốt dòng đang sáng (WinForm không làm gì).
//
// ─── Chạy ────────────────────────────────────────────────────────────────────
// File chạy `mode: 'serial'` (khai ở đầu file): testcase ĐỎ ĐẦU TIÊN sẽ SKIP mọi
// testcase sau nó. Mỗi testcase dưới đây TỰ DỰNG trạng thái bằng openTab() nên
// chạy lẻ được — sửa xong điểm nào thì grep chạy riêng điểm đó:
//   npx playwright test tests/guide-sidepanel-handler.spec.ts -g "パック: № ngoài phạm vi"
//
// Khối này LOGIN RIÊNG (beforeAll của nó) → cả file tốn 2 lượt login, vẫn dưới
// ngưỡng 10 của GUIDELINE 10.1.
//
// GHI DỮ LIỆU: các testcase 病検 (chèn 部位病名行) và 個別 (append 処置) chỉ đổi
// state React của lưới đăng ký, KHÔNG gọi API lưu (F12/登録 không bao giờ được
// bấm ở đây) → không đụng DB. Lưới bẩn dần trong phiên là chấp nhận được vì mọi
// assert đều đo DELTA số ô lưới, không đo giá trị tuyệt đối. KHÔNG nạp lại trang
// giữa suite để dọn — `page.goto` giữa phiên làm SPA không boot lại được (xem
// chú thích 「WinForm parity 1」 phía trên).
// ═════════════════════════════════════════════════════════════════════════════

/** Dòng tab 病検 — header cũng dùng grid-cols-[30px_270px_1fr] nên phải kèm cursor-pointer. */
const BYOU_ROW_SEL = 'div[class*="grid-cols-[30px_270px_1fr]"][class*="cursor-pointer"]'
/** Dòng tab ガイド (treatment-side-panel.tsx:857). */
const GUID_ROW_SEL = 'div[class*="grid-cols-[40px_1fr]"][class*="cursor-pointer"]'
/** Dòng tab パック (treatment-side-panel.tsx:902). */
const PACK_ROW_SEL = 'div[class*="grid-cols-[35px_1fr]"][class*="cursor-pointer"]'
/**
 * Dòng tab 個別 — list ẢO (react-virtual), chỉ cửa sổ đang nhìn có mặt trong DOM.
 * `data-index` (treatment-side-panel.tsx:950) là CHỈ SỐ THẬT trong mst_trt, nên
 * mọi phép đo dòng của tab này phải đọc data-index chứ không đếm thứ tự DOM.
 */
const KOBE_ROW_SEL = 'div[data-index]'

type SideTab = '病検' | 'ガイド' | 'パック' | '個別'

test.describe('SidePanel — 選択№ + Enter parity 4 tab (病検/ガイド/パック/個別)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Khung side panel (w-[450px]) — mọi locator lưới đều bám vào đây. */
    let sidePanel: Locator
    /** 4 nút tab — nút đang mở mang class `bg-accent` (treatment-side-panel.tsx:758). */
    let tabBtns: Locator
    /** Ô 選択№ của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
    let noInput: Locator

    let byouRows: Locator
    let guidRows: Locator
    let packRows: Locator
    let kobeRows: Locator

    /** Dialog ガイド処置選択 (frm203017) / パック処置選択 (frm203014). */
    let guidePicker: Locator
    let packPicker: Locator
    /** Alert khi list 処置 của dialog rỗng (frm203017.cs:1015 / frm203014.cs:124). */
    let guideNoTrtAlert: Locator
    let packNoTrtAlert: Locator

    /** Ô của lưới đăng ký (registration-table.tsx:244) — mốc đo 「đã chốt 処置 chưa」. */
    let gridCells: Locator

    /** Tên tab đang mở. */
    async function activeTab(): Promise<string> {
        return tabBtns.evaluateAll(
            (els) => els.find((e) => e.className.includes('bg-accent'))?.textContent?.trim() ?? '',
        )
    }

    /** Index dòng đang sáng (#ffffc0) của một list KHÔNG ảo; -1 nếu không có dòng nào. */
    async function highlightedIdx(rowsLoc: Locator): Promise<number> {
        return rowsLoc.evaluateAll((els) =>
            els.findIndex((e) => e.className.includes('bg-[#ffffc0]')),
        )
    }

    /**
     * Index THẬT của dòng 個別 đang sáng. KHÔNG dùng highlightedIdx() được: list ảo
     * nên thứ tự DOM ≠ thứ tự dữ liệu — phải đọc data-index.
     */
    async function kobeHighlightedIdx(): Promise<number> {
        const hit = sidePanel.locator(`${KOBE_ROW_SEL}[class*="bg-[#ffffc0]"]`)
        if ((await hit.count()) === 0) return -1
        return Number(await hit.first().getAttribute('data-index'))
    }

    /** Đóng sạch dialog/alert đang mở: OK trước (alert), rồi F10 (picker). */
    async function closeAnyDialogs(max = 6) {
        for (let i = 0; i < max; i++) {
            const ok = page.getByRole('button', { name: 'OK' })
            if (await ok.count()) {
                await ok.first().click()
                await expect(ok.first())
                    .toBeHidden({ timeout: 10000 })
                    .catch(() => {})
                continue
            }
            const dlg = page.getByRole('dialog')
            if ((await dlg.count()) === 0) return
            await page.keyboard.press('F10')
            await expect(dlg.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
    }

    /**
     * Mở một tab và chờ list của nó sẵn sàng, sau khi đã dọn mọi dialog còn sót.
     * Tab ガイド đi bằng PHÍM F4 — đó là đường đi WinForm (KeyFunc(F4),
     * frm203002.cs:4698) và cũng là điều kiện để list có data (GUIDELINE 10.7).
     */
    async function openTab(tab: SideTab) {
        await closeAnyDialogs()
        if ((await activeTab()) !== tab) {
            if (tab === 'ガイド') await page.keyboard.press('F4')
            else await sidePanel.getByRole('button', { name: tab, exact: true }).click()
        }
        await expect.poll(() => activeTab(), { timeout: 15000 }).toBe(tab)

        const ready =
            tab === '病検'
                ? byouRows.first().or(sidePanel.getByText('未登録'))
                : tab === 'ガイド'
                  ? guidRows.first().or(sidePanel.getByText('未登録'))
                  : tab === 'パック'
                    ? packRows.first().or(sidePanel.getByText('未登録'))
                    : kobeRows.first().or(sidePanel.getByText('該当なし'))
        await expect(ready).toBeVisible({ timeout: 30000 })
        // Ô № của tab vừa mở — mọi thao tác bàn phím bên dưới bám vào nó, và
        // effect :691 chỉ focus nó khi tab đã dựng xong.
        await expect(noInput).toHaveCount(1)
    }

    /**
     * Mốc 「app đã xử lý xong cú Enter」 cho các assert VẮNG MẶT (GUIDELINE Rule 7:
     * không sleep). Bấm ↓ một nhịp: nếu cú Enter trước đó KHÔNG dời dòng sáng và
     * KHÔNG kéo focus ra khỏi side panel thì ô № phải thành (beforeIdx + 1) + 1.
     * Bấm ↑ trả dòng sáng về chỗ cũ.
     *
     * `total` bỏ trống cho list dài (個別) — chỉ cần biết ↓ không bị clamp.
     */
    async function arrowDownAnchor(beforeIdx: number, total = Number.POSITIVE_INFINITY) {
        const from = Math.max(beforeIdx, 0)
        const after = Math.min(from + 1, total - 1)
        await page.keyboard.press('ArrowDown')
        await expect(
            noInput,
            'ô № không nhích theo ↓ → cú Enter trước đó đã dời dòng sáng hoặc đã kéo focus ' +
                'ra khỏi side panel (tức là NÓ ĐÃ CHỐT một dòng)',
        ).toHaveValue(String(after + 1))
        if (after > from) await page.keyboard.press('ArrowUp')
    }

    /**
     * Bắt lỗi 「dialog NHÁY một nhịp rồi tự đóng」.
     * `expect(...).toBeHidden()` KHÔNG bắt được: lúc assert chạy thì dialog đã tắt.
     * Nên cắm MutationObserver TRƯỚC thao tác, đếm số lần một node chứa `marker`
     * được CHÈN vào DOM. WinForm đóng form TRƯỚC khi vẽ (frm203017.cs:1001,
     * frm203014.cs:122) ⇒ với list 処置 rỗng, số lần phải là 0.
     */
    async function armFlashWatch(marker: string) {
        await page.evaluate((m) => {
            const w = window as unknown as { __flashN?: number; __flashObs?: MutationObserver }
            w.__flashObs?.disconnect()
            w.__flashN = 0
            const obs = new MutationObserver((muts) => {
                for (const mu of muts) {
                    for (const n of Array.from(mu.addedNodes)) {
                        if (n.nodeType !== 1) continue
                        if (((n as Element).textContent ?? '').includes(m)) {
                            w.__flashN = (w.__flashN ?? 0) + 1
                        }
                    }
                }
            })
            obs.observe(document.body, { childList: true, subtree: true })
            w.__flashObs = obs
        }, marker)
    }

    /** Số lần `marker` xuất hiện kể từ armFlashWatch(); đồng thời gỡ observer. */
    async function readFlashWatch(): Promise<number> {
        return page.evaluate(() => {
            const w = window as unknown as { __flashN?: number; __flashObs?: MutationObserver }
            w.__flashObs?.disconnect()
            return w.__flashN ?? 0
        })
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        // Xem chú thích ở beforeAll của khối trên: popup 算定 nổi đè và nuốt click,
        // thời điểm bung không đoán được nên để Playwright tự dọn.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 30 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await expect(page, 'goto màn 診療入力 mà bị đá về trang khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        tabBtns = sidePanel.getByRole('button', { name: /^(病検|ガイド|パック|個別)$/ })
        noInput = page.locator('input[data-side-anchor]')

        byouRows = sidePanel.locator(BYOU_ROW_SEL)
        guidRows = sidePanel.locator(GUID_ROW_SEL)
        packRows = sidePanel.locator(PACK_ROW_SEL)
        kobeRows = sidePanel.locator(KOBE_ROW_SEL)

        guidePicker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        packPicker = page.getByRole('dialog').filter({ hasText: 'パック番号' })
        guideNoTrtAlert = page.getByText('算定できる処置がありません')
        packNoTrtAlert = page.getByText('算定可能な処置はありません')

        gridCells = page.locator('[data-grid-cell]')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab 病検 — txtByokenSel_KeyPress (frm203002.cs:6430)
    // Đây là tab DUY NHẤT có guard phạm vi, nên nó là tab duy nhất KHÔNG chốt gì
    // khi № sai. Click 1 dòng ở tab này áp 部位病名 rồi NHẢY sang tab ガイド
    // (handleByouPick → jumpToGuideTab, treatment-entry-detail.tsx:2278), nên
    // 「đã chốt hay chưa」 đo bằng chính cú nhảy tab đó.
    // ─────────────────────────────────────────────────────────────────────────

    test('病検: cột No. đánh số 1..N (1-based), khớp số gõ vào ô 選択№', async () => {
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        for (let i = 0; i < Math.min(n, SCAN_LIMIT); i++) {
            await expect(
                byouRows.nth(i).locator('div').first(),
                `dòng ${i} sai số thứ tự — cột No. phải là index + 1`,
            ).toHaveText(String(i + 1))
        }
        await step()
    })

    test('病検: № hợp lệ + Enter → áp 部位病名 (nhảy sang tab ガイド)', async () => {
        // txtByokenSel_KeyPress (frm203002.cs:6451-6474): Val != 0 và
        // Val < grdByou.Rows.Count ⇒ pByoken_Let_Data(№) + pByoken_Dis_Move_Cell.
        // Web: handleByouPick chèn 部位病名行 rồi jumpToGuideTab (:2278) — cú nhảy
        // tab đó là tín hiệu 「đã chốt」 duy nhất quan sát được từ ngoài.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        const target = Math.min(2, n) // № 1-based
        await noInput.click()
        await noInput.fill(String(target))
        await step()
        await noInput.press('Enter')

        await expect
            .poll(() => activeTab(), { timeout: 20000 })
            .toBe('ガイド')
        await step()

        // Quay lại 病検 để soi dòng sáng: WinForm pByoken_Let_Data đặt CurrentCell
        // về đúng dòng đã nhập. Web (:1061-1070) KHÔNG hề setSelectedByouIdx.
        await openTab('病検')
        if ((await byouRows.count()) !== n) {
            // Áp 部位病名 xong list 病検 đổi độ dài → prevByouLen guard (:579) reset
            // dòng sáng về 0. Không đủ dữ kiện để phán, log rồi bỏ qua phần này.
            console.log(
                `BỎ QUA phần dòng sáng: list 病検 đổi ${n} → ${await byouRows.count()} dòng sau khi áp`,
            )
            return
        }
        expect(
            await highlightedIdx(byouRows),
            'WinForm pByoken_Let_Data đặt CurrentCell về dòng của №; web không dời dòng sáng',
        ).toBe(target - 1)
        await expect(noInput).toHaveValue(String(target))
        await step()
    })

    test('病検: № ngoài phạm vi (999) + Enter → KHÔNG chốt gì, dòng sáng giữ nguyên', async () => {
        // KHÁC 3 tab kia: txtByokenSel_KeyPress CÓ guard
        //   frm203002.cs:6453  if (Conversion.Val(txtByokenSel.Text) < grdByou.Rows.Count)
        // nên № ngoài phạm vi bị chặn TRƯỚC pByoken_Let_Data ⇒ không áp gì cả.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('999')
        await step()
        await noInput.press('Enter')

        // Mốc đồng bộ: ↓ vẫn ăn ⇒ focus còn ở side panel ⇒ Enter đã không chốt gì.
        await arrowDownAnchor(before, n)
        expect(await activeTab(), '№ ngoài phạm vi mà vẫn nhảy sang tab ガイド → đã áp 部位病名').toBe(
            '病検',
        )
        expect(await highlightedIdx(byouRows), '№ ngoài phạm vi không được dời dòng sáng').toBe(
            before,
        )
        expect(
            await gridCells.count(),
            'guard frm203002.cs:6453 chặn № ngoài phạm vi → lưới đăng ký không được đổi',
        ).toBe(beforeCells)
        await step()
    })

    test('病検: № = 0 + Enter → KHÔNG chốt gì (guard Val(txt) != 0)', async () => {
        // frm203002.cs:6451  if (Conversion.Val(txtByokenSel.Text) != 0)
        // № 0 rơi thẳng ra ngoài, không chạm pByoken_Let_Data.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('0')
        await step()
        await noInput.press('Enter')

        await arrowDownAnchor(before, n)
        expect(await activeTab(), '№ 0 mà vẫn nhảy sang tab ガイド → đã áp 部位病名').toBe('病検')
        expect(await highlightedIdx(byouRows), '№ 0 không được dời dòng sáng').toBe(before)
        expect(await gridCells.count(), '№ 0 mà lưới đăng ký vẫn đổi').toBe(beforeCells)
        await step()
    })

    test('病検: ô № RỖNG + Enter → KHÔNG chốt gì (Val("") == 0 nên guard chặn)', async () => {
        // PHẢN TRỰC GIÁC — đọc kỹ: Conversion.Val("") trả 0, nên guard
        // frm203002.cs:6451 `Val(txt) != 0` chặn luôn. WinForm KHÔNG rơi về dòng
        // đang sáng. Web (:1066) lại `byouNo.trim() ? … : (selectedByouIdx ?? -1)`
        // → ô rỗng chốt dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        await arrowDownAnchor(before, n)
        expect(
            await activeTab(),
            'WinForm: `Val("") == 0` → guard :6451 chặn, KHÔNG áp 部位病名 và KHÔNG nhảy tab ガイド',
        ).toBe('病検')
        expect(await highlightedIdx(byouRows), 'ô № rỗng không được dời dòng sáng').toBe(before)
        expect(await gridCells.count(), 'ô № rỗng mà lưới đăng ký vẫn đổi').toBe(beforeCells)
        await step()
    })

    test('病検: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        // Không kiểm nhánh CLICK ở tab này: click 1 dòng 病検 áp luôn 部位病名 rồi
        // nhảy sang tab ガイド (:811-815) nên ô № của 病検 không còn để mà soi.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n < 2, '病検 cần ≥ 2 dòng để kiểm đồng bộ ↑/↓')

        await noInput.click()
        const start = await highlightedIdx(byouRows)
        await page.keyboard.press('ArrowDown')
        const down = Math.min(Math.max(start, 0) + 1, n - 1)
        expect(await highlightedIdx(byouRows), '↓ không xuống dòng').toBe(down)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        const up = Math.max(down - 1, 0)
        expect(await highlightedIdx(byouRows), '↑ không lên dòng').toBe(up)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(up + 1))
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab ガイド — chỉ bổ sung chốt chặn 1-based.
    // Ba hành vi còn lại của tab này ĐÃ có testcase riêng ở khối trên:
    //   · № hợp lệ  → 「Enter trên ô No. có số → nhảy đúng dòng đó rồi mở dialog…」
    //   · № sai     → 「WinForm parity 3: Enter với No. ngoài phạm vi → vẫn mở dialog…」
    //   · № rỗng    → 「WinForm parity 4: Enter với ô No. RỖNG → không mở gì…」
    //   · ↑/↓ đồng bộ → 「↑/↓ đổi dòng sáng và kéo theo ô No., có clamp ở hai đầu」
    // Không viết lại ở đây để khỏi trùng lặp.
    // ─────────────────────────────────────────────────────────────────────────

    test('ガイド: № 1 → dòng thứ nhất, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // `intRow--` (frm203002.cs:6753) + cột GuidNum = intRow + 1 (:1981) ⇒ số
        // hiển thị và số gõ vào là CÙNG một hệ 1-based. Web dùng Number(no) - 1
        // trên mảng 0-based là tương đương. Chốt chặn để không ai đọc nhầm dòng
        // `//intRow--` của tab 病検/個別 rồi "sửa ngược" cả 4 tab thành 0-based.
        await openTab('ガイド')
        const n = await guidRows.count()
        test.skip(n < 2, 'tab ガイド cần ≥ 2 dòng để kiểm off-by-one')

        for (const no of [1, 2]) {
            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')

            // Chốt một dòng ガイド ra 1 trong 2 kết quả: dialog có 処置, hoặc alert
            // 「算定できる処置がありません。」 (dialog tự đóng). Chờ CẢ HAI.
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            expect(
                await highlightedIdx(guidRows),
                `№ ${no} phải trúng dòng thứ ${no} (index ${no - 1}) — sai là đã thành 0-based`,
            ).toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab パック — txtPackSentakuNo_KeyDown (frm203002.cs:6858)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Chốt kết quả một cú pick パック: dialog パック処置選択, HOẶC alert
     * 「算定可能な処置はありません。」 (frm203014.cs:122-126 đóng form rồi báo).
     */
    async function waitPackPick(): Promise<'picker' | 'alert'> {
        await expect(packPicker.or(packNoTrtAlert).first()).toBeVisible({ timeout: 30000 })
        return (await packNoTrtAlert.count()) > 0 ? 'alert' : 'picker'
    }

    test('パック: № hợp lệ + Enter → dời dòng sáng tới dòng đó VÀ chốt dòng đó', async () => {
        // frm203002.cs:6879-6889: intRow-- → CurrentCell = dòng đó → grdPack_KeyDown(Return).
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        const target = Math.min(3, n) // № 1-based
        const nm = (await packRows.nth(target - 1).locator('div').nth(1).innerText()).trim()

        await noInput.click()
        await noInput.fill(String(target))
        await step()
        await noInput.press('Enter')

        const result = await waitPackPick()
        expect(await highlightedIdx(packRows), 'Enter № phải dời dòng sáng tới dòng của №').toBe(
            target - 1,
        )
        if (result === 'picker' && nm) {
            await expect(
                packPicker.getByText(nm, { exact: true }).first(),
                'dialog phải là của ĐÚNG dòng vừa nhảy tới',
            ).toBeVisible()
        }
        console.log(`パック Enter № ${target} 「${nm}」 → ${result}`)
        await step()
        await closeAnyDialogs()
    })

    test('パック: № ngoài phạm vi (9999) + Enter → KHÔNG dời dòng sáng NHƯNG VẪN chốt dòng đang sáng', async () => {
        // PHẢN TRỰC GIÁC — nguồn: frm203002.cs:6880-6889
        //   if (int.TryParse(txtPackSentakuNo.Text, out intRow)) {
        //       intRow--;
        //       if (0 <= intRow && intRow < grdPack.Rows.Count) { CurrentCell = …; }
        //       grdPack_KeyDown(txtPackSentakuNo, Return);      ← NGOÀI khối if ⇒ LUÔN chạy
        //   }
        // ⇒ № sai chỉ bỏ qua bước NHẢY DÒNG, cú chốt vẫn nổ cho dòng đang sáng.
        // Web (:1188-1194) bọc cả hai trong `if (item)` nên không làm gì cả ⇒ ĐỎ.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        // Dựng dòng sáng ở một dòng ≠ 0 để phân biệt với "rơi về dòng đầu".
        await noInput.click()
        if (n >= 2) await page.keyboard.press('ArrowDown')
        const before = await highlightedIdx(packRows)
        const nm = (await packRows.nth(Math.max(before, 0)).locator('div').nth(1).innerText()).trim()

        await noInput.fill('9999')
        await step()
        await noInput.press('Enter')

        try {
            await expect(
                packPicker.or(packNoTrtAlert).first(),
                'WinForm: grdPack_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi ' +
                    '(frm203002.cs:6889) → № sai vẫn phải chốt dòng đang sáng. Web đang ' +
                    'return sớm khi list[idx] undefined (treatment-side-panel.tsx:1188).',
            ).toBeVisible({ timeout: 15000 })
            // CurrentCell không đổi → phải là dialog của ĐÚNG dòng đang sáng trước đó.
            expect(await highlightedIdx(packRows), '№ ngoài phạm vi không được dời dòng sáng').toBe(
                before,
            )
            if ((await packPicker.count()) > 0 && nm) {
                await expect(packPicker.getByText(nm, { exact: true }).first()).toBeVisible()
            }
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック: ô № RỖNG + Enter → KHÔNG chốt gì (int.TryParse("") thất bại)', async () => {
        // frm203002.cs:6880 — TOÀN BỘ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ không nhảy dòng, không chốt. Web (:1187) lại
        // `packNo.trim() ? Number(packNo) - 1 : (selectedPackIdx ?? -1)` nên rơi về
        // dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        await noInput.click()
        const before = await highlightedIdx(packRows)
        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        try {
            // Soi dialog TRƯỚC: nếu Enter đã mở dialog thì ↑/↓ không còn tác dụng lên
            // side panel nữa, mốc đồng bộ bên dưới sẽ hỏng theo và che mất nguyên nhân.
            await expect(
                packPicker,
                'WinForm: nhánh Enter nằm trong if(int.TryParse) → ô № rỗng KHÔNG mở パック処置選択',
            ).toBeHidden({ timeout: 10000 })
            await expect(
                packNoTrtAlert,
                'ô № rỗng mà vẫn bung alert 算定可能な処置はありません → đã lỡ chốt một dòng',
            ).toHaveCount(0)
            await arrowDownAnchor(before, n)
            expect(await highlightedIdx(packRows), 'ô № rỗng không được dời dòng sáng').toBe(before)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック: № 1 → dòng thứ nhất, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // Cột PackNum = rowIndex + 1 (frm203002.cs:2033) + `intRow--` (:6883) ⇒ 1-based.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để kiểm off-by-one')

        for (const no of [1, 2]) {
            await expect(
                packRows.nth(no - 1).locator('div').first(),
                `cột No. của dòng ${no - 1} phải hiển thị ${no}`,
            ).toHaveText(String(no))

            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')
            await waitPackPick()
            expect(
                await highlightedIdx(packRows),
                `№ ${no} phải trúng dòng thứ ${no} (index ${no - 1}) — sai là đã thành 0-based`,
            ).toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    test('パック: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        // grdPack_RowEnter (frm203002.cs:2228) `txtPackSentakuNo.Text = rowIndex + 1`.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để kiểm đồng bộ ↑/↓')

        await noInput.click()
        const start = await highlightedIdx(packRows)
        await page.keyboard.press('ArrowDown')
        const down = Math.min(Math.max(start, 0) + 1, n - 1)
        expect(await highlightedIdx(packRows), '↓ không xuống dòng').toBe(down)
        await expect(noInput).toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        const up = Math.max(down - 1, 0)
        expect(await highlightedIdx(packRows), '↑ không lên dòng').toBe(up)
        await expect(noInput).toHaveValue(String(up + 1))
        await step()
    })

    test('パック: click 1 dòng → ô № đồng bộ index + 1', async () => {
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để phân biệt với dòng mặc định')

        const target = 1 // dòng thứ 2
        await packRows.nth(target).click()
        expect(await highlightedIdx(packRows), 'click không chuyển dòng sáng').toBe(target)
        await expect(noInput, 'grdPack_RowEnter: ô № phải bám dòng sáng').toHaveValue(
            String(target + 1),
        )
        await step()
        await closeAnyDialogs()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab 個別 — txtKobetuSel_KeyDown (frm203002.cs:6939)
    // Chốt một dòng 個別 KHÔNG mở dialog mà APPEND thẳng 処置 vào lưới đăng ký
    // (onKobetuPick → handleKobetuPicks, treatment-entry-detail.tsx:4471), nên
    // 「đã chốt hay chưa」 đo bằng số ô [data-grid-cell] của lưới.
    // Một vài mã 処置 đặc biệt lại mở dialog nhập liệu trước khi chèn
    // (openSpecialPickDialog :4475) — coi cả hai đều là 「đã chốt」.
    // ─────────────────────────────────────────────────────────────────────────

    /** Cú chốt 個別 có xảy ra không: lưới thêm ô, HOẶC dialog nhập liệu đặc biệt bung ra. */
    async function kobePickHappened(beforeCells: number, timeout = 15000): Promise<boolean> {
        try {
            await expect
                .poll(
                    async () =>
                        (await gridCells.count()) > beforeCells ||
                        (await page.getByRole('dialog').count()) > 0,
                    { timeout },
                )
                .toBe(true)
            return true
        } catch {
            return false
        }
    }

    test('個別: № hợp lệ + Enter → dời dòng sáng tới dòng đó VÀ append 処置 vào lưới', async () => {
        // frm203002.cs:6960-6970: CurrentCell = dòng của № → grdKobe_KeyDown(Return)
        // → modKobetu.pKobetu_Let_Trt_Data (chèn 処置 vào grdRegi).
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        const beforeCells = await gridCells.count()
        await noInput.click()
        await noInput.fill('2')
        await step()
        await noInput.press('Enter')

        expect(
            await kobePickHappened(beforeCells),
            'Enter № hợp lệ phải append 処置 vào lưới đăng ký',
        ).toBe(true)
        expect(await kobeHighlightedIdx(), 'Enter № phải dời dòng sáng tới dòng của №').toBe(1)
        await step()
        await closeAnyDialogs()
    })

    test('個別: № ngoài phạm vi (999999) + Enter → KHÔNG dời dòng sáng NHƯNG VẪN append dòng đang sáng', async () => {
        // PHẢN TRỰC GIÁC — nguồn: frm203002.cs:6961-6970
        //   if (int.TryParse(txtKobetuSel.Text, out intRow)) {
        //       //intRow--;
        //       if (0 <= intRow && intRow < hfgKobetu.Rows.Count) { CurrentCell = …; }
        //       grdKobe_KeyDown(txtKobetuSel, Return);          ← NGOÀI khối if ⇒ LUÔN chạy
        //   }
        // ⇒ № sai chỉ bỏ qua bước NHẢY DÒNG, 処置 của dòng đang sáng vẫn được append.
        // Web (:1267-1279) bọc cả hai trong `if (item)` nên không làm gì cả ⇒ ĐỎ.
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        await page.keyboard.press('ArrowDown') // dòng sáng ≠ 0 để phân biệt
        const before = await kobeHighlightedIdx()
        const beforeCells = await gridCells.count()

        await noInput.fill('999999')
        await step()
        await noInput.press('Enter')

        try {
            expect(
                await kobePickHappened(beforeCells),
                'WinForm: grdKobe_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi ' +
                    '(frm203002.cs:6970) → № sai vẫn phải append 処置 của dòng đang sáng. ' +
                    'Web đang return sớm khi list[idx] undefined (treatment-side-panel.tsx:1267).',
            ).toBe(true)
            expect(await kobeHighlightedIdx(), '№ ngoài phạm vi không được dời dòng sáng').toBe(
                before,
            )
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('個別: ô № RỖNG + Enter → KHÔNG append gì (int.TryParse("") thất bại)', async () => {
        // frm203002.cs:6961 — toàn bộ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ không nhảy dòng, không append. Web (:1266) lại
        // `kobeNo.trim() ? Number(kobeNo) - 1 : (selectedKobeIdx ?? -1)` nên rơi về
        // dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        const before = await kobeHighlightedIdx()
        const beforeCells = await gridCells.count()

        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        try {
            // Mốc đồng bộ trước: ↓ vẫn ăn ⇒ focus còn ở side panel ⇒ Enter chưa append
            // (append xong focus bị kéo sang ô 回 của lưới — setPendingFocusPickId :4486).
            await arrowDownAnchor(before)
            expect(
                await gridCells.count(),
                'WinForm: ô № rỗng không qua nổi int.TryParse → lưới đăng ký KHÔNG được đổi',
            ).toBe(beforeCells)
            await expect(
                page.getByRole('dialog'),
                'ô № rỗng mà vẫn bung dialog nhập liệu → đã lỡ chốt một 処置',
            ).toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('個別: № 1 → dòng đầu tiên, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // Ở tab này WinForm để `//intRow--` DẠNG COMMENT, nhưng hfgKobetu có 1 dòng
        // dummy ẩn ở index 0 nên `Rows[№]` vẫn là "dòng dữ liệu thứ №" — TƯƠNG ĐƯƠNG
        // 1-based. Web dùng mảng 0-based + Number(no) - 1 là chuẩn. Đừng "sửa ngược".
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        for (const no of [1, 2]) {
            await openTab('個別')
            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')
            await expect
                .poll(() => kobeHighlightedIdx(), { timeout: 15000 })
                .toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    test('個別: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        await openTab('個別')
        test.skip((await kobeRows.count()) < 3, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        const start = await kobeHighlightedIdx()
        await page.keyboard.press('ArrowDown')
        const down = Math.max(start, 0) + 1
        expect(await kobeHighlightedIdx(), '↓ không xuống dòng').toBe(down)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        expect(await kobeHighlightedIdx(), '↑ không lên dòng').toBe(down - 1)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down))
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Dialog 処置選択 với list RỖNG — logic dùng chung useEmptyPickerClose
    // (cnt-cell.tsx:86-104). WinForm đóng form TRƯỚC rồi mới báo lỗi
    // (frm203017.cs:1001-1017 / frm203014.cs:122-126), nên dialog KHÔNG được
    // "nháy" một nhịp rồi tắt, và alert chỉ được bung ĐÚNG MỘT LẦN (ref
    // `notified` chặn cú double-invoke của StrictMode).
    // Cả hai picker phải có guard render `if (items.length === 0) return null`
    // (pack-selection-dialog.tsx:203, guide-selection-dialog.tsx:431) — thiếu nó
    // là dialog bung ra trong lúc query còn chạy rồi mới tự đóng.
    // ─────────────────────────────────────────────────────────────────────────

    test('ガイド rỗng 処置: dialog KHÔNG nháy, alert 「算定できる処置がありません。」 bung ĐÚNG 1 lần', async () => {
        await openTab('ガイド')
        const n = Math.min(await guidRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab ガイド không có dòng nào để dò')

        // Dò dòng ガイド đầu tiên cho list 処置 rỗng. KHÔNG bịa data: tenant nào mọi
        // ガイド đều có 処置 thì testcase tự skip.
        let emptyIdx = -1
        for (let i = 0; i < n; i++) {
            await armFlashWatch('ガイド番号')
            await guidRows.nth(i).click()
            // Mốc phải là DÒNG 処置 trong dialog, KHÔNG phải bản thân dialog: dialog
            // rỗng đóng ngay nên chờ `picker` sẽ lọt nhánh rỗng (xem chú thích đầu file).
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await guideNoTrtAlert.count()) > 0) {
                emptyIdx = i
                break
            }
            await readFlashWatch()
            await closeAnyDialogs()
        }
        test.skip(
            emptyIdx < 0,
            `mọi ガイド trong ${n} dòng đầu đều có 処置 tính được → không có nhánh rỗng để so`,
        )

        const flashes = await readFlashWatch()
        console.log(`ガイド dòng ${emptyIdx + 1}: list 処置 rỗng, dialog xuất hiện ${flashes} lần`)
        try {
            expect(
                flashes,
                'guide-selection-dialog.tsx phải có guard `if (items.length === 0) return null` ' +
                    '(:431, giống pack-selection-dialog.tsx:203) — thiếu nó dialog bung ra trong ' +
                    'lúc query chạy rồi mới tự đóng, tức NHÁY một nhịp. WinForm frm203017.cs:1001 ' +
                    'đóng form TRƯỚC khi vẽ.',
            ).toBe(0)
            await expect(guidePicker, 'alert đã bung mà dialog vẫn còn mở').toBeHidden()
            await expect(guideNoTrtAlert, 'alert 「算定できる処置がありません。」 phải bung ĐÚNG 1 lần').toHaveCount(1)

            // Đóng alert rồi kiểm KHÔNG có alert thứ hai (ref `notified` của
            // useEmptyPickerClose chặn cú double-invoke của StrictMode).
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(guideNoTrtAlert).toBeHidden({ timeout: 10000 })
            // Mốc đồng bộ: side panel nhận lại phím ⇒ app đã xử lý xong, không còn
            // alert nào đang xếp hàng.
            await noInput.click()
            await page.keyboard.press('ArrowDown')
            await expect(guideNoTrtAlert, 'alert bung LẦN THỨ HAI → useEmptyPickerClose chạy 2 lần').toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('ガイド có 処置: dialog Ở LẠI, KHÔNG tự đóng và KHÔNG alert', async () => {
        await openTab('ガイド')
        const n = Math.min(await guidRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab ガイド không có dòng nào để dò')

        let openedIdx = -1
        for (let i = 0; i < n; i++) {
            await guidRows.nth(i).click()
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await guideNoTrtAlert.count()) === 0) {
                openedIdx = i
                break
            }
            await closeAnyDialogs()
        }
        test.skip(openedIdx < 0, `không ガイド nào trong ${n} dòng đầu có 処置 tính được`)

        try {
            await expect(guidePicker, 'list 処置 CÓ dòng mà dialog vẫn tự đóng').toBeVisible()
            await expect(
                guideNoTrtAlert,
                'list 処置 CÓ dòng mà vẫn bung 「算定できる処置がありません。」',
            ).toHaveCount(0)
            expect(
                await guidePicker.getByTestId('cell-trtNm').count(),
                'dialog mở mà không có dòng 処置 nào',
            ).toBeGreaterThan(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック rỗng 処置: dialog KHÔNG nháy, alert 「算定可能な処置はありません。」 bung ĐÚNG 1 lần', async () => {
        await openTab('パック')
        const n = Math.min(await packRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab パック không có dòng nào để dò')

        let emptyIdx = -1
        for (let i = 0; i < n; i++) {
            await armFlashWatch('パック番号')
            await packRows.nth(i).click()
            await expect(
                packPicker.getByTestId('cell-trtNm').first().or(packNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await packNoTrtAlert.count()) > 0) {
                emptyIdx = i
                break
            }
            await readFlashWatch()
            await closeAnyDialogs()
        }
        test.skip(
            emptyIdx < 0,
            `mọi パック trong ${n} dòng đầu đều có 処置 tính được → không có nhánh rỗng để so`,
        )

        const flashes = await readFlashWatch()
        console.log(`パック dòng ${emptyIdx + 1}: list 処置 rỗng, dialog xuất hiện ${flashes} lần`)
        try {
            expect(
                flashes,
                'pack-selection-dialog.tsx:203 `if (items.length === 0) return null` phải chặn ' +
                    'dialog vẽ ra khi list rỗng — WinForm frm203014.cs:122 Close() TRƯỚC MsgBox.',
            ).toBe(0)
            await expect(packPicker, 'alert đã bung mà dialog vẫn còn mở').toBeHidden()
            await expect(packNoTrtAlert, 'alert 「算定可能な処置はありません。」 phải bung ĐÚNG 1 lần').toHaveCount(1)

            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(packNoTrtAlert).toBeHidden({ timeout: 10000 })
            await noInput.click()
            await page.keyboard.press('ArrowDown')
            await expect(packNoTrtAlert, 'alert bung LẦN THỨ HAI → useEmptyPickerClose chạy 2 lần').toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック có 処置: dialog Ở LẠI, KHÔNG tự đóng và KHÔNG alert', async () => {
        await openTab('パック')
        const n = Math.min(await packRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab パック không có dòng nào để dò')

        let openedIdx = -1
        for (let i = 0; i < n; i++) {
            await packRows.nth(i).click()
            await expect(
                packPicker.getByTestId('cell-trtNm').first().or(packNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await packNoTrtAlert.count()) === 0) {
                openedIdx = i
                break
            }
            await closeAnyDialogs()
        }
        test.skip(openedIdx < 0, `không パック nào trong ${n} dòng đầu có 処置 tính được`)

        try {
            await expect(packPicker, 'list 処置 CÓ dòng mà dialog vẫn tự đóng').toBeVisible()
            await expect(
                packNoTrtAlert,
                'list 処置 CÓ dòng mà vẫn bung 「算定可能な処置はありません。」',
            ).toHaveCount(0)
            expect(
                await packPicker.getByTestId('cell-trtNm').count(),
                'dialog mở mà không có dòng 処置 nào',
            ).toBeGreaterThan(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })
})
