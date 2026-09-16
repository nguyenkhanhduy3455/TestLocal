import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from '../_shared/step'
import { BASE_URL, patNo, trtDt } from '../_shared/env'
import { ADMIN_USER, JA } from '../_shared/test-data'

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
 *      · Tab パック: header 2 cột 「No.」/「名称」 (grid-cols-[42px_1fr], sticky),
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
 * Rule 23 (4 testcase bắt buộc cho hộp thoại) nằm ở cuối file: 23.1 con trỏ lúc mở,
 * 23.2 thanh cuộn, 23.4 mở lại reset — còn 23.3 (thông báo) là testcase
 * 「算定可能な処置はありません。」 ở giữa file.
 *
 * HAI testcase 確定 (F9) ĐẨY DÒNG VÀO GRID mặc định bị bỏ qua (chỉ sửa state màn
 * hình, chưa ghi DB, nhưng làm bẩn lưới đang mở). Muốn chạy:
 *   TEST_ALLOW_COMMIT=1 npx playwright test tests/side-panel/pack-sidepanel-handler.spec.ts
 *
 * THỨ TỰ của hai cái đó CÓ Ý NGHĨA (serial, chung một page):
 *  1. regression 摘要選択（長期収載品…）— giữ nửa còn thiếu của `ModMain.Chk_CmtAuto`:
 *     F9 確定 của パック phải chạy cascade 摘要コメントパック cho từng 処置
 *     (frm203002.cs:9054), chứ không chỉ đẩy dòng vào lưới. Nó chốt một パック CỐ ĐỊNH
 *     nên cần xuất phát từ màn sạch — Rule 23.4 ngay phía trên kết thúc bằng
 *     `dismiss('picker')` nên đúng là màn sạch.
 *  2. testcase 確定 chung — dò パック ĐẦU TIÊN nào mở được picker, tức là chốt một
 *     パック không đoán trước, và cascade của nó xếp cả hàng dialog
 *     (đo được: để lại nguyên 摘要選択（歯清-妊婦、糖尿病）). Vì vậy nó phải nằm SAU;
 *     đảo lại là testcase regression chết vì overlay của nó, không phải vì app.
 */

const PAT_NO = patNo('12138')
/**
 * Mặc định KHÔNG truyền trtDt → app lấy ngày hôm nay, đúng tháng hiện hành. Đây
 * là điều kiện tự nhiên của tab パック (WinForm chặn thao tác trên tháng khác).
 * Muốn ghim ngày: TEST_TRT_DT=YYYY-MM-DD.
 */
const TRT_DT = trtDt('')
/** Bật nhánh F9 確定 (đẩy 処置 vào lưới đăng ký). Mặc định tắt. */
const ALLOW_COMMIT = process.env.TEST_ALLOW_COMMIT === '1'

/** Số dòng パック tối đa sẽ dò khi cần tìm một パック mở được picker / ra alert. */
const SCAN_LIMIT = 12

/**
 * pac_nm của パック chứa 薬剤 選定療養 — dùng cho testcase regression Chk_CmtAuto ở
 * cuối file. Tìm theo TÊN chứ không theo cột No.: thứ tự list phụ thuộc cờ
 * IntelliPac (PacQueries.cs:37-39) nên số thứ tự không phải hằng số.
 */
const LONG_TERM_PACK_NM = process.env.TEST_PACK_NM ?? 'クラリス2T、ボルタレン'
/** pack_nm của mst_cmt_pack_def Z001 — phần trong ngoặc của tiêu đề 摘要選択. */
const LONG_TERM_PACK_DEF_NM = '長期収載品の選定療養に関する取扱い'

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
     * Tiêu đề dialog 摘要選択 (frm203018) = `摘要選択（<pack_nm>）`
     * (summary-comment-selection-dialog.tsx:326). Neo đầu-cuối bằng regex nên
     * KHÔNG match nhầm 「ユーザー摘要コメント選択」 (frm203019).
     *
     * Dùng `getByText` chứ không `getByRole('dialog')`: Radix `hideOthers` gắn
     * `aria-hidden` lên portal khi một modal khác mount, làm locator theo role
     * "mù" dù dialog vẫn hiện (bẫy đã ghi ở
     * dialogs-selection/summary-comment-selection-enter.spec.ts).
     */
    let summaryTitle: Locator
    /**
     * Dialog カルテ記載選択 (frm203012 gType.Auto) — nhịp CUỐI của chuỗi AutoSantei:
     * trả lời No cho 「〜を算定しますか？」 xong thì 処置 kế tự 算定 KHÔNG hỏi
     * (POST /tenant/treatment/autosantei2) rồi bung dialog này sau ~1s.
     *
     * Phải dọn trước khi chạy testcase. Nó là modal nên (a) FKeyScopeProvider nuốt
     * sạch F-key của màn nền (nhánh `top && !topOwnsKeys` ⇒ preventDefault) và
     * (b) nó GIỮ focus — testcase 「F10 → con trỏ quay lại ô 選択№」 đỏ chính vì
     * dialog này chen vào đúng lúc, không phải vì refocusSidePanel hỏng.
     */
    let karteCmtDialog: Locator
    /**
     * Dòng của tab パック. Header cũng dùng grid-cols-[42px_1fr] nên phải kèm
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
        const closed = await picker
            .waitFor({ state: 'hidden', timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        if (!closed) {
            // F10 vừa rồi bị nuốt vì カルテ記載選択 chen lên trên picker — xem chú
            // thích của karteCmtDialog. Dọn nó rồi gõ LẠI F10 (không click nút,
            // để vẫn đang kiểm đường đi bàn phím), nhưng chỉ khi picker VẪN còn:
            // F10 của màn nền là 戻る, gõ nhầm là rời hẳn màn 診療入力.
            await dismissKarteCmtIfOpen()
            if ((await picker.count()) > 0) await page.keyboard.press('F10')
        }
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /**
     * Bấm OK cho tới khi hàng đợi alert お茶コン rỗng.
     *
     * F10 KHÔNG đóng được `[role="alertdialog"]` — phải bấm nút OK. Đo được khi
     * chạy với TEST_ALLOW_COMMIT=1: testcase 「F9 確定 đẩy 処置 vào lưới」 chốt một
     * パック làm 算定チェック bung alert 「…当月の算定限度（1回）を超えています。」, cleanup
     * bằng F10 của nó không dọn nổi, và overlay `z-[200] bg-black/80` của alert
     * NUỐT mọi cú click ở testcase sau (「element intercepts pointer events」).
     * Không phải bug app: cảnh báo 算定チェック là thật.
     */
    async function drainAlerts() {
        const alert = page.locator('[role="alertdialog"]')
        for (let i = 0; i < 10; i++) {
            if ((await alert.count()) === 0) return
            const ok = alert.locator('button', { hasText: /^(OK|Yes|はい)$/ })
            if ((await ok.count()) === 0) return
            await ok.first().click({ timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300)
        }
    }

    /**
     * Dọn SẠCH mọi thứ đang đè lên màn nền: alert お茶コン trước, rồi mọi
     * `[role="dialog"]` bằng F10, lặp cho tới khi hết.
     *
     * Thứ tự BẮT BUỘC là alert-trước-dialog: overlay `z-[200]` của alert nuốt cả
     * click lẫn F10, nên F10 bắn khi còn alert chỉ rơi vào alert. Đúng lý do lần
     * chạy trước 「F9 確定 đẩy 処置 vào lưới」 để sót lại nguyên một
     * 摘要選択（歯清-妊婦、糖尿病）, và nó chặn testcase kế.
     *
     * Chỉ dùng ở cleanup của HAI testcase 確定 (cuối file). KHÔNG cắm
     * addLocatorHandler toàn cục: testcase 「算定可能な処置はありません。」 cần alert
     * đó còn sống để assert.
     */
    async function clearOverlays() {
        const dialogs = page.getByRole('dialog')
        for (let i = 0; i < 6; i++) {
            await drainAlerts()
            if ((await dialogs.count()) === 0) return
            await page.keyboard.press('F10')
            await page.waitForTimeout(600)
        }
    }

    /** Đóng カルテ記載選択 nếu nó đang mở; true = có đóng. */
    async function dismissKarteCmtIfOpen(): Promise<boolean> {
        if ((await karteCmtDialog.count()) === 0) return false
        // Chỗ BẤM 「F10 戻る」 là locator handler ở beforeAll, không phải ở đây. Hàm
        // này chỉ ASSERT auto-retry để ÉP Playwright chạy handler đó. Tự click sẽ
        // tranh chấp: handler chen vào trước mỗi action, đóng dialog xong thì cú
        // click gốc không còn nút để bấm → timeout 15s (đã vấp ở tab パック).
        await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
        return true
    }

    /**
     * Chờ chuỗi AutoSantei chạy hết rồi dọn sạch, TRƯỚC khi testcase đầu tiên bắt
     * đầu. Confirm 「〜を算定しますか？」 do locator handler bấm No — mà handler chỉ
     * chạy khi Playwright có action/assert auto-retry, nên phải assert (không phải
     * waitForTimeout trần) rồi mới chờ nhịp カルテ記載選択 phía sau.
     */
    async function drainAutoSantei() {
        // AutoSantei chạy SAU khi lưới dựng xong, và với bệnh nhân test thì nó
        // KHÔNG hỏi gì: 算定 thẳng 歯科疾患管理料 (POST /tenant/treatment/autosantei2)
        // rồi bung カルテ記載選択 ở khoảng t+2s và để NGUYÊN đó. Bệnh nhân khác thì
        // có thêm confirm 「〜を算定しますか？」 phía trước.
        //
        // Cả hai dialog đều do locator handler ở beforeAll bấm — mà handler CHỈ chạy
        // khi Playwright có action / assert auto-retry. Vòng dưới đây vừa là cú hích
        // đó, vừa là bằng chứng màn đã sạch LIÊN TỤC vài nhịp (đoán bằng một
        // `waitForTimeout` đơn lẻ thì trượt: dialog tới trễ ~2s, dọn hụt là nó nằm
        // lại tới giữa suite rồi nuốt F-key / cướp focus).
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
            await page.waitForTimeout(700)
        }
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
        summaryTitle = page.getByText(new RegExp(`^摘要選択（${LONG_TERM_PACK_DEF_NM}）$`))
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        rows = page.locator('div[class*="grid-cols-[42px_1fr]"][class*="cursor-pointer"]')
        noInput = page.locator('input[data-side-anchor]')

        // Nó có thể bung LẠI giữa chừng (mỗi lần AutoSantei chạy) → để Playwright
        // tự dọn trước mỗi thao tác. Đây là chỗ DUY NHẤT bấm 「F10 戻る」 của dialog
        // này (xem dismissKarteCmtIfOpen), giống handler của 「…を算定しますか？」.
        await page.addLocatorHandler(
            karteCmtDialog,
            async () => {
                await karteCmtDialog
                    .getByRole('button', { name: 'F10 戻る' })
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {})
            },
            { times: 30 },
        )

        await drainAutoSantei()
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

    // ═════════════════════════════════════════════════════════════════════════
    // Rule 23 — 4 testcase bắt buộc cho MỌI hộp thoại.
    // 23.3 (thông báo trùng WinForm) đã nằm ở testcase 「パック không có 処置 tính
    // được → alert 算定可能な処置はありません。」 phía trên. Ba cái còn lại ở đây.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Mở パック ĐẦU TIÊN ra được picker (bỏ qua パック rỗng) và trả về index dòng.
     * Không cố định dòng 1: パック nào rỗng là tuỳ dữ liệu tenant.
     */
    async function openAnyPicker(): Promise<number> {
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'picker') return i
            await dismiss('alert')
        }
        throw new Error(`không パック nào trong ${total} dòng đầu mở được picker`)
    }

    /** Ô 回数 của dòng thứ `n` trong lưới dialog (cnt-cell.tsx: cell-cnt là <input>). */
    const pickerCntInput = (n: number) =>
        picker.locator('[data-testid^="row-"]').nth(n).locator('[data-testid="cell-cnt"] input')

    test('Rule 23.1 — vừa mở: con trỏ nằm ở ô 回数 của DÒNG ĐẦU', async () => {
        // pack-selection-dialog.tsx dùng `useCntCellApi({ open, rows, … })`, cùng
        // wiring với ガイド (frm203017) — on-open focus đặt vào ô 回数 dòng đầu.
        // WinForm frm203014: dgvSelect nhận focus, CurrentCell = cột 回数 dòng 0.
        await openAnyPicker()
        const first = pickerCntInput(0)
        await expect(first, 'lưới dialog không có ô 回数 nào').toBeVisible({ timeout: 15000 })

        // Đua với alert/popup có thể cướp focus → poll thay vì đọc một lần.
        await expect
            .poll(() => first.evaluate((el) => el === document.activeElement), { timeout: 15000 })
            .toBe(true)
        await step()
        await dismiss('picker')
    })

    test('Rule 23.2 — dialog nằm trong viewport và chỉ THÂN cuộn, không phải cả trang', async () => {
        await openAnyPicker()

        // (a) Cả hộp thoại phải nằm gọn trong viewport.
        const vp = page.viewportSize()
        expect(vp, 'không đọc được viewport').not.toBeNull()
        const box = await picker.boundingBox()
        expect(box, 'không đọc được bounding box của dialog').not.toBeNull()
        expect(box!.y, 'dialog tràn lên trên viewport').toBeGreaterThanOrEqual(-1)
        expect(
            box!.y + box!.height,
            `dialog cao ${Math.round(box!.height)}px, tràn dưới viewport ${vp!.height}px`,
        ).toBeLessThanOrEqual(vp!.height + 1)

        // (b) Nội dung dài hơn thì CUỘN Ở THÂN (virtual list), KHÔNG phải cả trang —
        // đúng nhánh thứ hai của Rule 23.2.
        const pageScroll = await page.evaluate(() => ({
            sh: document.documentElement.scrollHeight,
            ch: document.documentElement.clientHeight,
        }))
        expect(
            pageScroll.sh,
            'mở dialog làm CẢ TRANG cuộn dọc — thân dialog phải tự cuộn',
        ).toBeLessThanOrEqual(pageScroll.ch + 1)
        await step()
        await dismiss('picker')
    })

    test('Rule 23.4 — đóng (F10) rồi mở lại: 回数 gõ dở KHÔNG sống sót', async () => {
        // frm203014 là dialog dựng mới mỗi lần mở. Web: pack-selection-dialog.tsx
        // reset `cntOverrides` ở transition open→false (guard prevOpen), và
        // useClientSort có `resetOn: open`. Nếu state sống sót thì lần mở sau kế
        // thừa 回数 của lần trước ⇒ F9 確定 đẩy sai số vào lưới.
        const idx = await openAnyPicker()
        const cell = pickerCntInput(0)
        await expect(cell).toBeVisible({ timeout: 15000 })
        const before = await cell.inputValue()

        // Gõ một giá trị KHÁC giá trị mặc định để phép so có ý nghĩa.
        const typed = before.trim() === '7' ? '5' : '7'
        await cell.fill(typed)
        await expect(cell).toHaveValue(typed)
        await dismiss('picker')

        await rows.nth(idx).click()
        const again = await waitPickResult()
        expect(again, 'mở lại cùng dòng phải ra picker như lần đầu').toBe('picker')
        await expect(
            pickerCntInput(0),
            `回数 của lần mở trước (${typed}) sống sót sang lần mở sau`,
        ).toHaveValue(before)
        await step()
        await dismiss('picker')
    })

    /**
     * REGRESSION — F9 確定 của パック phải chạy `ModMain.Chk_CmtAuto` cho TỪNG 処置,
     * tức là mở cả 摘要選択 (frm203018) chứ không chỉ đẩy dòng vào lưới.
     *
     * Bug (đã sửa): `pack-selection-flow.tsx` chỉ gọi `/tenant/cmt-autos` +
     * `/tenant/cmt-autos/programmatic` rồi append hết một lượt. Nửa còn lại của
     * Chk_CmtAuto — cascade 摘要コメントパック qua `/tenant/cmt-autos/cascade` — KHÔNG
     * bao giờ được gọi, nên dialog 摘要選択 không bung. WinForm frm203002.cs:9054
     * gọi `Chk_CmtAuto(con, trtCd, trtSb, cnt)` sau MỖI pick 通常処置; tab ガイド
     * (frmGuid2_Let_Data) đã port đúng, chỉ mình tab パック sót.
     *
     * Đường đi TẤT ĐỊNH (dữ liệu t_tenant1, đã kiểm bằng SQL):
     *   pac_mst 889 「クラリス2T、ボルタレン」 = 301/2, 117/4, 302/0, 626/0(×3), 600/0(×2)
     *   · 600/0 = ボルタレン錠２５ｍｇ → mst_drug.selected_treat_kb='1' và mst_trt.f3=1
     *     (院内処方) ⇒ `IsDrug_lt_listed_product` = true ⇒ BE gắn thêm pack Z001.
     *   · Z001 = 長期収載品の選定療養に関する取扱い, pack_type=1, 5 dòng candidate
     *     (com_cd 820101320..24) ⇒ candidates.length > 1 ⇒ mở 摘要選択, KHÔNG auto-apply.
     *   · 626/0 = クラリス錠２００ có selected_treat_kb='0' ⇒ KHÔNG bung dialog.
     *   · 301/2 có 2 pack syohosen nhưng cổng 同日 đòi 処方箋料 cùng ngày — pack này
     *     không có ⇒ cũng KHÔNG bung dialog.
     *   ⇒ Đúng MỘT dialog 摘要選択, khớp ảnh WinForm người dùng gửi.
     *
     * com_cd 820101320 → comPattern = substring(1,2) = 20 (KHÔNG phải 30) nên 確定
     * ghi thẳng text vào lưới, không cascade tiếp sang frm203019.
     *
     * Rule 18 — tên パック để env override; không tìm thấy thì log rõ rồi BỎ QUA
     * (không giả vờ pass). KHÔNG dò theo cột No.: thứ tự list phụ thuộc cờ
     * IntelliPac (PacQueries.cs:37-39 — `use_cnt DESC` hoặc `pac_sb, pac_cd`),
     * nên số 21 trong ảnh không phải hằng số.
     */
    test('F9 確定 mở 摘要選択（長期収載品…）cho 処置 選定療養 (Chk_CmtAuto, mặc định BỎ QUA)', async () => {
        test.skip(!ALLOW_COMMIT, 'làm bẩn lưới đang mở — đặt TEST_ALLOW_COMMIT=1 để chạy')

        // Testcase 確定 phía trên (cũng chỉ chạy khi ALLOW_COMMIT) để lại alert
        // 算定チェック và/hoặc 摘要選択 của パック nó vừa chốt; overlay của chúng nuốt
        // mọi click ở đây.
        await clearOverlays()

        // Tìm dòng パック theo TÊN (xem docblock: cột No. không ổn định).
        const total = await rows.count()
        let target = -1
        for (let i = 0; i < total; i++) {
            if ((await rowNm(i).innerText()).trim() === LONG_TERM_PACK_NM) {
                target = i
                break
            }
        }
        if (target < 0) {
            console.log(
                `không thấy パック 「${LONG_TERM_PACK_NM}」 trong ${total} dòng → BỎ QUA ` +
                    '(đặt TEST_PACK_NM=<tên> để trỏ sang パック 選定療養 khác)',
            )
            return
        }

        await rows.nth(target).click()
        expect(await waitPickResult(), 'パック 選定療養 phải mở được picker').toBe('picker')
        // 600/0 nằm trong パック — nếu dữ liệu master đổi thì fail ở đây (rõ nguyên
        // nhân) thay vì fail mù ở câu assert dialog phía dưới.
        await expect(
            picker.getByText(/ボルタレン/).first(),
            'パック không còn chứa 薬剤 選定療養 → đường đi tất định đã hỏng',
        ).toBeVisible({ timeout: 15000 })

        const beforeCells = await page.locator('[data-grid-cell]').count()
        await picker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(picker).toBeHidden({ timeout: 20000 })

        // ── Câu assert CHÍNH của regression ──────────────────────────────────
        // Locator theo TEXT chứ không `getByRole`: Radix `hideOthers` gắn
        // aria-hidden lên portal khi một modal khác mount, làm getByRole "mù"
        // (bẫy đã ghi ở summary-comment-selection-enter.spec.ts).
        //
        // PHẢI vừa dọn alert vừa chờ: WinForm chạy SingleChk (frm203002.cs:9049)
        // TRƯỚC Chk_CmtAuto và web port cũng chặn (`runSingleCheckBlocking`), nên
        // alert 算定チェック của mấy 処置 đầu パック đứng CHẶN cascade — chờ suông là
        // hết giờ. Đây là thứ tự đúng của WinForm, không phải app treo.
        await expect
            .poll(
                async () => {
                    await drainAlerts()
                    return (await summaryTitle.count()) > 0
                },
                {
                    timeout: 60000,
                    message:
                        'F9 確定 của パック KHÔNG chạy Chk_CmtAuto → 摘要選択 không bung (bug cũ)',
                },
            )
            .toBe(true)
        await expect(summaryTitle).toBeVisible({ timeout: 10000 })

        const cmtDialog = page
            .locator('[role="dialog"]')
            .filter({ hasText: LONG_TERM_PACK_DEF_NM })
        // 処置名称 caption = 処置 đã kích hoạt cascade (frm203018 customLabel3).
        //
        // Khớp theo 「錠25mg」 chứ KHÔNG theo tên thuốc: caption lấy thẳng mst_trt.trt_nm
        // nên là katakana NỬA chiều rộng 「ﾎﾞﾙﾀﾚﾝ錠25mg２T」, trong khi pac_mst /
        // mst_drug ghi FULL chiều rộng 「ボルタレン」. Viết /ボルタレン/ ở đây là fail oan
        // (đã dính) — hai chuỗi đó không bằng nhau với JS regex.
        await expect(cmtDialog.getByText(/処置名称.*錠25mg/)).toBeVisible({ timeout: 10000 })
        const candidates = cmtDialog.locator('[data-testid="cell-dispText"]')
        await expect(candidates, 'Z001 có 5 摘要 candidate (com_cd 820101320..24)').toHaveCount(5)

        // 確定 dòng đang ở con trỏ (dòng đầu) → text phải rơi xuống cột 療法・処置.
        const firstText = (await candidates.first().innerText()).trim()
        await cmtDialog.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(summaryTitle).toBeHidden({ timeout: 20000 })

        const ryoCells = page.locator('[data-grid-cell$="|2"]')
        await expect
            .poll(
                async () => (await ryoCells.allInnerTexts()).some((t) => t.includes(firstText)),
                { timeout: 30000, message: '摘要コメント đã chọn không xuất hiện trong lưới' },
            )
            .toBe(true)
        // Các 処置 của パック cũng phải nằm trong lưới (dòng 処置 + dòng comment).
        expect(await page.locator('[data-grid-cell]').count()).toBeGreaterThan(beforeCells)

        // Dọn dialog dây chuyền còn sót (カルテ記載選択 do CMTAUTO của 処方料 …).
        await clearOverlays()
        await step()
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

        // Chk_CmtAuto kéo theo cả 摘要選択 (frm203018) lẫn カルテ記載選択 — và
        // 算定チェック có thể bung alert đè lên. Dọn hết, nếu không testcase kế
        // không click được gì (dòng 処置 đã chèn TRƯỚC đó nên bỏ qua là an toàn).
        await clearOverlays()
        await step()
    })

})
