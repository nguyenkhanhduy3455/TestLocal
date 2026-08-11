import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * SidePanel — tab パック (frm203002 《VB6》frmInpMain 07-B「パックタブ系」) trên màn
 * 診療入力 `/treatments/{patNo}`.
 *
 * Nguồn WinForm (src/OCHACOM/INP/Forms):
 *  - frm203002.cs:2025 getPackNyuryokuInfo — nạp grdPack từ
 *    ImpMstTrt.getInpPackNyuryokuData; cột PackNum = (rowIndex + 1) → cột No. của
 *    web CHÍNH LÀ số thứ tự hiển thị, KHÔNG phải pac_cd.
 *  - frm203002.cs:2228 grdPack_RowEnter — mỗi lần đổi dòng thì
 *    `txtPackSentakuNo.Text = rowIndex + 1` → ô 選択№ luôn bám dòng đang sáng.
 *    Web port: guard render-time `prevSelPack` (treatment-side-panel.tsx:605).
 *  - frm203002.cs:6773 grdPack_CellDoubleClick — lấy PackCod của dòng, snapshot
 *    getFocusDt/getFocusBui/getFocusDis vào frm203014.ParamData rồi mở
 *    パック処置選択; dialog trả null (F10) → `txtPackSentakuNo.Focus()`; trả data →
 *    frmPack2_Let_Data (:8901) rồi `txtPackSentakuNo.Text = ""` + `grdRegi.Focus()`.
 *  - frm203002.cs:6840 grdPack_KeyDown — Enter trên grid = double-click.
 *  - frm203002.cs:6858 txtPackSentakuNo_KeyDown — ↑/↓/PageUp/PageDown cuộn dòng
 *    chọn của grdPack; Enter nhảy tới dòng (số nhập − 1) rồi chạy tiếp nhánh
 *    double-click. Số ngoài phạm vi → CurrentCell không đổi.
 *  - frm203014.cs:122-126 frm203013_Load — sau initProc mà dgvView rỗng thì form
 *    TỰ ĐÓNG và MsgBox「算定可能な処置はありません。」 (title 処置パック).
 *
 * Web port (apps/web-tenant/src/features/treatments):
 *  - components/treatment-side-panel.tsx
 *      · Tab パック: header 2 cột 「No.」/「名称」 (grid-cols-[35px_1fr], sticky),
 *        list là map thường (KHÔNG virtual như tab 個別); rỗng → 「未登録」,
 *        đang tải → 「読込中…」.
 *      · Dòng đang sáng: nền `bg-[#ffffc0]` (vàng nhạt) — mirror CurrentRow.
 *      · prevPackLen guard (:579): mỗi lần độ dài list đổi → auto sáng dòng đầu
 *        (DataGridView mặc định focus dòng 0 khi load data).
 *      · prevSelPack guard (:605): selectedPackIdx đổi → ô № = idx + 1.
 *      · Click dòng (:888) = SINGLE click chứ không double-click — web CỐ Ý lệch
 *        WinForm (double-click nhanh ở tab 病検 từng rò cú click thứ 2 sang tab
 *        khác). Click lại chính dòng đó chỉ mở lại đúng dialog cũ (idempotent).
 *      · Ô 選択№ (:1148) `data-side-anchor`, lọc ký tự bằng sanitizeDigits
 *        (`raw.replace(/\D/g,'')`) → gõ chữ bị nuốt ngay.
 *      · Enter trên ô № (:1156): № có số → dòng (số − 1); № rỗng → dùng dòng đang
 *        sáng (selectedPackIdx). Index ngoài list → `item` undefined → KHÔNG làm gì.
 *      · Effect :682 — vào tab nào thì focus + select ô № của tab đó.
 *      · Effect :716 — ←/→ đổi tab, ↑/↓ đổi dòng, CHỈ khi focus đang nằm trong
 *        side panel (root.contains(document.activeElement)); có clamp 2 đầu.
 *  - components/treatment-entry-detail.tsx
 *      · handlePackPick (:818) chỉ set ctx + open (KHÔNG có guard
 *        「当月以外の操作はできません」 — guardCurrentMonth :2258 chỉ dùng cho F-key;
 *        đây là điểm LỆCH so với frm203002.cs:6775, ghi ra để biết, không test).
 *      · onOpenChange (:4826): đóng kiểu huỷ (F10/戻る/×) → refocusSidePanel()
 *        (bump focusSignal ở frame kế) → con trỏ về ô №; đóng kiểu 確定
 *        (packPickConfirmedRef) → KHÔNG kéo focus về, nhường cho grid — đúng
 *        nhánh `grdRegi.Focus()` của WinForm.
 *  - components/pack-selection-dialog.tsx: list rỗng → tự đóng + alert
 *    「算定可能な処置はありません。」; body có nhãn 「パック番号」 + pac_cd + pac_nm.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login trong một khung thời gian, nên login + mở màn 診療入力 làm đúng một lần ở
 * beforeAll. Các testcase nối tiếp nhau trên cùng tab, thứ tự có ý nghĩa — chạy
 * lẻ một testcase ở giữa sẽ hỏng vì tab パック chưa được mở.
 *
 * Testcase 確定 (F9) ĐẨY DÒNG VÀO GRID mặc định bị bỏ qua (chỉ sửa state màn hình,
 * chưa ghi DB, nhưng làm bẩn lưới đang mở). Muốn chạy:
 *   TEST_ALLOW_COMMIT=1 npx playwright test tests/pack-sidepanel-handler.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/**
 * Mặc định KHÔNG truyền trtDt → app lấy ngày hôm nay, đúng tháng hiện hành. Đây
 * là điều kiện tự nhiên của tab パック (WinForm chặn thao tác trên tháng khác).
 * Muốn ghim ngày: TEST_TRT_DT=YYYY-MM-DD.
 */
const TRT_DT = process.env.TEST_TRT_DT ?? ''
/** Bật nhánh F9 確定 (đẩy 処置 vào lưới đăng ký). Mặc định tắt. */
const ALLOW_COMMIT = process.env.TEST_ALLOW_COMMIT === '1'

/** Số dòng パック tối đa sẽ dò khi cần tìm một パック mở được picker / ra alert. */
const SCAN_LIMIT = 12

/** Kết quả của một cú "chốt" một dòng パック. */
type PickResult = 'picker' | 'alert'

test.describe.configure({ mode: 'serial' })

test.describe('SidePanel — tab パック (frm203002 パックタブ系)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog パック処置選択 (frm203014) — nhận diện bằng nhãn 「パック番号」 trong body. */
    let picker: Locator
    /** Alert 「算定可能な処置はありません。」 khi パック không có 処置 nào tính được. */
    let noTrtAlert: Locator
    /**
     * Dòng của tab パック. Header cũng dùng grid-cols-[35px_1fr] nên phải kèm
     * `cursor-pointer` (chỉ dòng dữ liệu mới có) để loại header ra.
     */
    let rows: Locator
    /** Ô 選択№ của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
    let noInput: Locator

    /** Chờ kết quả của một cú chốt: picker mở, HOẶC alert 算定可能な処置はありません. */
    async function waitPickResult(): Promise<PickResult> {
        await expect(picker.or(noTrtAlert).first()).toBeVisible({ timeout: 30000 })
        return (await noTrtAlert.count()) > 0 ? 'alert' : 'picker'
    }

    /**
     * Đóng thứ vừa bung ra.
     * Picker đóng bằng PHÍM F10 chứ không click nút 戻る: màn hình nền cũng có nút
     * 「F10 戻る」 nằm dưới modal nên dễ click nhầm. Cũng KHÔNG dùng Escape.
     */
    async function dismiss(result: PickResult) {
        if (result === 'alert') {
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
            return
        }
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /** Số thứ tự (cột No.) của dòng i — cell đầu tiên trong dòng. */
    const rowNo = (i: number) => rows.nth(i).locator('div').first()
    /** Tên パック (cột 名称) của dòng i. */
    const rowNm = (i: number) => rows.nth(i).locator('div').nth(1)

    /** Index của dòng đang sáng (nền #ffffc0); -1 nếu không có dòng nào. */
    async function highlightedIdx(): Promise<number> {
        return rows.evaluateAll((els) => els.findIndex((e) => e.className.includes('bg-[#ffffc0]')))
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

        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        picker = page.getByRole('dialog').filter({ hasText: 'パック番号' })
        noTrtAlert = page.getByText('算定可能な処置はありません')
        rows = page.locator('div[class*="grid-cols-[35px_1fr]"][class*="cursor-pointer"]')
        noInput = page.locator('input[data-side-anchor]')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('mở tab パック — header No./名称 + danh sách pac_mst nạp xong', async () => {
        await page.getByRole('button', { name: 'パック', exact: true }).click()

        // Header sticky 2 cột của riêng tab パック.
        await expect(page.getByText('No.', { exact: true })).toBeVisible({ timeout: 30000 })
        await expect(page.getByText('名称', { exact: true })).toBeVisible()

        // 「読込中…」 → có dòng. Tenant KHÔNG có pac_mst nào thì cả file vô nghĩa
        // (mọi testcase sau đều thao tác trên dòng), nên fail thẳng ở đây.
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        await expect(page.getByText('未登録')).toHaveCount(0)
        const n = await rows.count()
        expect(n, 'tenant không có パック nào trong pac_mst').toBeGreaterThan(0)
        console.log(`tab パック: ${n} dòng`)
        await step()
    })

    test('cột No. = số thứ tự 1..N (PackNum = rowIndex + 1), KHÔNG phải pac_cd', async () => {
        // getPackNyuryokuInfo (frm203002.cs:2033) gán PackNum = intRow + 1; pac_cd
        // nằm ở cột PackCod và cột đó KHÔNG hiển thị trên web.
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await expect(rowNo(i), `dòng ${i} sai số thứ tự`).toHaveText(String(i + 1))
        }
        await step()
    })

    test('vừa vào tab: dòng đầu sáng, ô № = "1" và ô № được focus', async () => {
        // prevPackLen guard (:579) — list vừa có dữ liệu → selectedPackIdx = 0.
        expect(await highlightedIdx(), 'dòng đầu phải sáng khi list vừa nạp').toBe(0)
        await expect(noInput).toHaveValue('1')

        // Effect :682 focus + select ô № khi vào tab. Bình thường đúng, NHƯNG nó
        // đua với handler đóng popup 算定 (popup đó kéo focus về nút của nó) → chỉ
        // log khi lệch, không đánh đỏ cả suite vì một cuộc đua.
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
            console.log(`CẢNH BÁO: ô 選択№ không được focus khi vào tab パック; đang focus: ${desc}`)
        }
        await step()
    })

    test('single click 1 dòng → sáng dòng đó, ô № đồng bộ, mở パック処置選択', async () => {
        // WinForm mở ở DOUBLE click (grdPack_CellDoubleClick); web CỐ Ý dùng single
        // click — xem chú thích đầu file. Dòng thứ 2 để phân biệt với dòng mặc định.
        const target = Math.min(1, (await rows.count()) - 1)
        await rows.nth(target).click()

        expect(await highlightedIdx(), 'click không chuyển dòng sáng').toBe(target)
        await expect(noInput, 'grdPack_RowEnter: ô № phải bám dòng sáng').toHaveValue(
            String(target + 1),
        )

        // Một cú chốt ra 1 trong 2 kết quả — phải chờ CẢ HAI:
        //   a) picker パック処置選択 mở (パック có 処置 tính được), hoặc
        //   b) alert 「算定可能な処置はありません。」 (frm203014.cs:122-126).
        const result = await waitPickResult()
        console.log(`click dòng ${target + 1} → ${result}`)
        await step()
        await dismiss(result)
    })

    test('đóng picker kiểu huỷ (F10) → con trỏ quay lại ô 選択№', async () => {
        // frm203002.cs:6811-6814 — ComParam == null (F10) thì txtPackSentakuNo.Focus().
        // Web: refocusSidePanel() bump focusSignal ở frame kế (:745) → effect :682
        // focus + select lại ô №.
        const idx = Math.max(await highlightedIdx(), 0)
        await rows.nth(idx).click()
        const result = await waitPickResult()
        await dismiss(result)

        await expect
            .poll(() => noInput.evaluate((el) => el === document.activeElement), { timeout: 15000 })
            .toBe(true)
        await step()
    })

    test('↑/↓ đổi dòng sáng và kéo theo ô №, có clamp ở hai đầu', async () => {
        // Effect :716 nghe keydown ở window nhưng chỉ chạy khi focus nằm TRONG side
        // panel — ô № vừa được focus ở testcase trước, click lại cho chắc.
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

    test('ô 選択№ chỉ nhận chữ số (sanitizeDigits nuốt ký tự khác)', async () => {
        // onChange chạy sanitizeDigits = raw.replace(/\D/g,'') NGAY khi gõ, nên chữ
        // và dấu bị nuốt tại chỗ chứ không đợi tới lúc Enter.
        await noInput.fill('')
        await noInput.pressSequentially('a1b-2.c')
        await expect(noInput).toHaveValue('12')

        // Gõ № KHÔNG được đổi dòng sáng (chỉ Enter mới chốt) — selectedPackIdx giữ nguyên.
        expect(await highlightedIdx(), 'gõ № không được tự nhảy dòng sáng').toBe(0)
        await step()
    })

    test('Enter trên ô № có số → nhảy đúng dòng đó rồi chốt như double-click', async () => {
        // txtPackSentakuNo_KeyDown (frm203002.cs:6879-6889): intRow-- rồi
        // grdPack.CurrentCell = dòng đó, sau đó gọi lại nhánh double-click.
        const total = await rows.count()
        const target = Math.min(3, total) // № 1-based
        await noInput.fill(String(target))
        await noInput.press('Enter')

        expect(await highlightedIdx(), 'Enter phải nhảy tới dòng của №').toBe(target - 1)
        const result = await waitPickResult()
        console.log(`Enter № ${target} → ${result}`)
        await step()
        await dismiss(result)
    })

    test('Enter với № ngoài phạm vi → KHÔNG dời dòng sáng nhưng vẫn chốt dòng đang sáng', async () => {
        // txtPackSentakuNo_KeyDown (frm203002.cs:6876-6890): `grdPack.CurrentCell = ...`
        // (cú NHẢY DÒNG) nằm TRONG range check `0 <= intRow < Rows.Count`, còn
        // `grdPack_KeyDown(txtPackSentakuNo, Return)` (cú CHỐT) nằm NGOÀI nó. Nên №
        // ngoài phạm vi chỉ mất cú nhảy dòng chứ vẫn chốt dòng đang sáng — đúng nhánh
        // resolveSelNoPick(..., { fallbackToCurrent: true }) của tab パック:
        // { jumpTo: null, item: list[selectedPackIdx] }. (Tab KHÔNG chốt gì khi № sai
        // là 病検 — fallbackToCurrent: false — chứ không phải tab này.)
        const before = await highlightedIdx()
        await noInput.click()
        await noInput.fill('9999')
        await noInput.press('Enter')

        // waitPickResult() chính là TÍN HIỆU CÓ THẬT xảy ra sau cú Enter (Rule 7:
        // không sleep) — có nó rồi mới soi dòng sáng thì assert mới có nghĩa.
        const result = await waitPickResult()
        expect(await highlightedIdx(), '№ ngoài phạm vi không được dời dòng sáng').toBe(before)
        console.log(`Enter № 9999 → giữ dòng ${before + 1} → ${result}`)
        await step()
        await dismiss(result)
    })

    test('Enter với № RỖNG → no-op, không chốt gì (chặn ở int.TryParse)', async () => {
        // txtPackSentakuNo_KeyDown (frm203002.cs:6876-6890): TOÀN BỘ nhánh Enter — cả
        // cú nhảy dòng lẫn cú chốt `grdPack_KeyDown(...)` — nằm trong
        // `if (int.TryParse(txtPackSentakuNo.Text, out intRow) == true)`. Chuỗi rỗng
        // TryParse ra false nên Enter không làm gì cả; resolveSelNoPick trả về `null`
        // đúng cho cả 4 tab. パック cũng không có KeyPress bù như 病検 — nó chỉ có
        // KeyDown + PreviewKeyDown(Tab) (:10186). № rỗng KHÁC № ngoài phạm vi: № sai
        // vẫn parse được nên vẫn chốt dòng đang sáng (testcase ngay trên).
        await noInput.click()
        await page.keyboard.press('ArrowDown') // đổi dòng sáng — ↓ cũng ghi lại № …
        const highlighted = await highlightedIdx()
        expect(highlighted, 'cần một dòng đang sáng để test nhánh № rỗng').toBeGreaterThan(0)
        await noInput.fill('') // … nên xoá № để ép Enter đi vào nhánh "rỗng"

        await noInput.press('Enter')

        // Assert VẮNG MẶT (Rule 7: không sleep) — mốc vào TÍN HIỆU CÓ THẬT xảy ra SAU
        // cú Enter: ↑ một dòng. Vì Enter là no-op nên không dialog nào cướp focus, ô №
        // vẫn giữ focus và ↑ vẫn ăn; ô № hiện lại số dòng nghĩa là app đã xử lý xong.
        await page.keyboard.press('ArrowUp')
        await expect(noInput).toHaveValue(String(highlighted)) // (highlighted - 1) + 1
        expect(await highlightedIdx(), 'Enter № rỗng không được tự chốt/dời dòng').toBe(
            highlighted - 1,
        )
        await expect(picker, '№ rỗng mà vẫn mở picker').toBeHidden()
        await expect(noTrtAlert, '№ rỗng mà vẫn bung alert').toHaveCount(0)

        await page.keyboard.press('ArrowDown') // trả dòng sáng về chỗ cũ
        await step()
    })

    test('picker hiển thị 「パック番号」 + tên đúng dòng đã chốt', async () => {
        // Tìm dòng đầu tiên mở được picker (nhiều パック ra 0 dòng → chỉ có alert).
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        let openedIdx = -1
        let openedNm = ''
        for (let i = 0; i < total; i++) {
            const nm = (await rowNm(i).innerText()).trim()
            await rows.nth(i).click()
            const result = await waitPickResult()
            if (result === 'picker') {
                openedIdx = i
                openedNm = nm
                break
            }
            await dismiss(result)
        }
        expect(
            openedIdx,
            'không パック nào mở được picker để kiểm nội dung header',
        ).toBeGreaterThanOrEqual(0)

        await expect(picker.getByText('パック番号')).toBeVisible()
        // pac_nm của dòng đã chốt phải nằm trên header dialog (frm203014 hiển thị
        // pacCd + pacNm nhận từ ParamData).
        // `.first()`: pac_nm có thể trùng với tên một 処置 trong lưới của dialog.
        if (openedNm) await expect(picker.getByText(openedNm, { exact: true }).first()).toBeVisible()
        console.log(`picker mở từ dòng ${openedIdx + 1} 「${openedNm}」`)
        await step()
        await dismiss('picker')
    })

    test('パック không có 処置 tính được → alert 「算定可能な処置はありません。」', async () => {
        // frm203014_Load: dgvView.Rows.Count == 0 → this.Close() + MsgBox. Web port
        // giữ nguyên thứ tự: đóng dialog TRƯỚC rồi mới alert, nên picker không được
        // "nháy" một cái rồi tắt.
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        let found = false
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            const result = await waitPickResult()
            if (result === 'alert') {
                found = true
                await expect(picker, 'alert rỗng mà picker vẫn mở').toBeHidden()
                await dismiss(result)
                console.log(`dòng ${i + 1} → alert 算定可能な処置はありません`)
                break
            }
            await dismiss(result)
        }
        if (!found) {
            console.log(
                `mọi パック trong ${total} dòng đầu đều có 処置 tính được → BỎ QUA nhánh alert`,
            )
        }
        await step()
    })

    test('←/→ đổi tab khi side panel giữ focus, quay lại パック giữ nguyên trạng thái', async () => {
        await noInput.click()
        const before = await rows.count()
        const beforeNo = await noInput.inputValue()

        // → sang tab 個別 (SIDE_TABS = 病検/ガイド/パック/個別 → パック là áp chót).
        await page.keyboard.press('ArrowRight')
        await expect(page.getByText('ｺｰﾄﾞ', { exact: true })).toBeVisible({ timeout: 30000 })
        await expect(rows, 'rời tab パック mà list パック vẫn còn').toHaveCount(0)

        // ← quay lại. SidePanel không unmount → số dòng và ô № giữ nguyên.
        await page.keyboard.press('ArrowLeft')
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        expect(await rows.count()).toBe(before)
        await expect(noInput, 'ô № không được reset khi quay lại tab').toHaveValue(beforeNo)
        await step()
    })

    test('click lại chính dòng đang sáng → mở lại đúng dialog đó (idempotent)', async () => {
        // Web cố ý cho single click; cú click thứ 2 (dù nhanh) chỉ mở lại cùng một
        // dialog chứ không cộng dồn gì — khác tab 個別 (append 処置, phải chặn detail===2).
        const idx = Math.max(await highlightedIdx(), 0)
        await rows.nth(idx).click()
        const first = await waitPickResult()
        await dismiss(first)

        await rows.nth(idx).click()
        const second = await waitPickResult()
        expect(second, 'click lại cùng dòng phải cho cùng kết quả').toBe(first)
        expect(await highlightedIdx()).toBe(idx)
        await step()
        await dismiss(second)
    })

    test('F9 確定 đẩy 処置 vào lưới đăng ký (mặc định BỎ QUA)', async () => {
        test.skip(!ALLOW_COMMIT, 'làm bẩn lưới đang mở — đặt TEST_ALLOW_COMMIT=1 để chạy')

        // Tìm パック mở được picker.
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        let opened = false
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            const result = await waitPickResult()
            if (result === 'picker') {
                opened = true
                break
            }
            await dismiss(result)
        }
        expect(opened, 'không パック nào mở được picker để test 確定').toBe(true)

        // Nút F9 確定 disabled khi mọi 回数 = 0 (hasAnyCnt). Double-click 1 dòng để
        // chạy vòng 回数 (dgvSelect_CellClick: cnt = (cnt + 1) % (maxCnt + 1)).
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
        // qua; dòng 処置 đã được chèn TRƯỚC đó (handleKobetuPicks chạy trước picker).
        const dialogs = page.getByRole('dialog')
        for (let i = 0; i < 3 && (await dialogs.count()) > 0; i++) {
            await page.keyboard.press('F10')
            // Không assert cứng: có thể là dialog dây chuyền (batch kế tiếp mở ngay),
            // vòng lặp sẽ dọn tiếp — đây chỉ là dọn dẹp sau khi đã assert xong.
            await expect(dialogs.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
        await step()
    })
})
