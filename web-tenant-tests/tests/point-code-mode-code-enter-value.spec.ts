import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — nhập giá trị vào ô 点 / 回 của lưới đăng ký theo 入力モード
 * (点数モード ↔ コードモード) và chuỗi thao tác kéo theo.
 *
 * ═══ NGUỒN WinForm (src/OCHACOM) ═══
 *
 * ・frm203002.cs:2976-2992 / 3024 — `enum eInpMode { ePoint = 1, eCod = 2 }`,
 *   biến `flgInpMode`, khởi tạo `flgInpMode = eInpMode.ePoint` → MẶC ĐỊNH là
 *   点数モード.
 * ・frm203002.cs:4571 (F9) / 4604 (F10) — lớp phím ON: F9 → ePoint +
 *   `lbInpMode.Text = "点数"`; F10 → eCod + `lbInpMode.Text = "コード"`.
 * ・frm203002.cs:7126 lbInpMode_Click — CLICK vào chính cái nhãn 「コード／点数」
 *   cũng đổi mode: đang eCod thì gọi KeyFunc(F9) (→点数), ngược lại KeyFunc(F10).
 * ・frm203002.cs:5560-5628 「case 3://点列」 — Enter trên ô 点:
 *     - 自由処置 (trt_cd 1..6) + ePoint → sang ô 回, đặt "1", ĐỔI sang eCod, thoát.
 *     - còn lại, nếu [51] != "1" và text khác rỗng:
 *         ePoint → ModMain.GetTrtmas(点数)   (tra theo ĐIỂM)
 *         eCod   → ModMain.GetTrtmasCod(コード) (tra theo MÃ 処置)
 *     - ret == true  → 点 = 点数 của 処置 vừa chọn, Move_Cell(Right) sang ô 回 rồi
 *       `grdRegi.BeginEdit(true)` (ô 回 mở sẵn chế độ nhập).
 *     - ret == false → EndEdit + `hFG1.CurrentCell.Value = ""` (XOÁ giá trị vừa gõ).
 *   ⇒ Ô 点 KHÔNG phải ô nhập số thuần: Enter ở đó là một LẦN TRA CỨU 処置.
 * ・modMain.cs:174 GetTrtmas (点数モード) — SQL `score1 = <点数>` (乳幼児/障害 dùng
 *   score2, 訪問 thêm score3+f1), Point == "0" thì bó hẹp `trt_cd >= 400 or in
 *   (144,157,201,234,236)`; 0 dòng → MsgBox「該当処置はありません。」(title エラー);
 *   1 dòng → tự commit (trừ mã đặc biệt 179/202/203/549/333 vẫn mở frm203016);
 *   ≥2 dòng → mở frm203016 処置選択.
 * ・modMain.cs:501 GetTrtmasCod (コードモード) — bẫy mã đặc biệt TRƯỚC khi query:
 *   101/102/103 → KasanCode; 50 → frm203016 (IS); 999 → 未装着; 333 → 訪問; 1..6 →
 *   自由処置 (ghi trt_cd, trả flgInpMode về ePoint, return false). Sau đó SQL
 *   `t.trt_cd = <mã> order by t.trt_sb`; 0 dòng → 該当処置はありません。;
 *   đúng 1 dòng && mã != 17 → tự commit; còn lại → mở frm203016.
 * ・frm203002.cs:5628-5720 「case 4://回列」 — Enter trên ô 回:
 *     - text == "－" (gạch ngang ZENKAKU) → chỉ Move_Cell(Down)+Left, AutoDate, AutoBui.
 *     - text khác rỗng → `hFG1[4] = 回数`, `hFG1[54] = 点数 × 回数` (合計点数);
 *       部位/病名 rỗng + cùng ngày với dòng trên → AutoBui; bật cờ đổi pChgTrt;
 *       SingleChk (1処置チェック → cảnh báo W00100); 599 → nền xám 介護;
 *       mã thuốc → getDrugName (tên thuốc 2 dòng); Move_Cell(Down) + Move_Cell(Left)
 *       (con trỏ XUỐNG dòng dưới); AutoDate/AutoBui; cuối cùng
 *       modAcc.DispDayPoint → cập nhật dòng 日計.
 *
 * ═══ PORT WEB (apps/web-tenant/src/features/treatments) ═══
 *
 * ・components/treatment-entry-detail.tsx
 *     :427  `const [inpMode, setInpMode] = useState<'point' | 'code'>('point')` —
 *           mặc định 点数, đúng WinForm.
 *     :1660 lớp ON (Shift): F9 → setInpMode('point'), F10 → setInpMode('code').
 *     :4021 nút nhãn ở header (PatientInfoHeader) — click để đổi mode (lbInpMode_Click).
 *     :3441 handleCodeEntry — 点数モード: `score = Number(text)`, KHÔNG nguyên/âm →
 *           return im lặng; コードモード: tách `"101-2"` → trtCd + trtSb.
 *           0 kết quả → alert 「該当する処置がありません。」; 1 → commit thẳng;
 *           ≥2 → mở 処置選択 (frm203016).
 *     :3488 handleCountEnter — CHƯA có 処置 chờ (pendingPick luôn null ở bản hiện
 *           tại) → Enter ô 回 của dòng 日計 nhân bản dòng 負担金/日計 mang 回数 vừa gõ;
 *           gõ rỗng → không làm gì.
 *     :617  ô 点 của DÒNG + Enter → pendingTenCodeEntry → cùng đường tra cứu như ô
 *           点 của 日計 (không phải sửa số); :660 sau khi sửa 点/回 → SingleChk;
 *           :677 回 + Enter → advanceFocusToNextTen + cascade 摘要コメント.
 *     :3277 commitPick — 処置選択 xong: nếu mở từ ô 点 của MỘT DÒNG có sẵn thì GHI ĐÈ
 *           chính dòng đó (WinForm ghi lên CurrentCell), còn mở từ ô 点 của 日計 thì
 *           thêm dòng mới ở đáy ngày; cả hai đều đặt con trỏ vào ô 回 ở chế độ nhập.
 * ・components/registration-table.tsx — ô 点/回 của 日計 là `<input>` thật, gắn
 *   `data-footer-cell="<rowKey>:footer-ten|kai"`; ô của dòng là div
 *   `data-grid-cell="<rowKey>|3"` (点) / `"|4"` (回), mở editor bằng double-click,
 *   Enter hoặc gõ ký tự (seed). Enter commit, Escape/click ra ngoài HUỶ.
 *
 * ═══ TÌNH TRẠNG PARITY (cập nhật 2026-07-23 sau khi dev port thêm) ═══
 *  ĐÃ SỬA — testcase bên dưới đã chỉnh theo:
 *  1. Chuỗi lỗi giờ đúng WinForm 「該当処置はありません。」
 *     (`lib/code-mode-entry.ts` NO_MATCHING_TREATMENT_MSG).
 *  2. Bỏ cú pháp mở rộng "コード-枝番": ô 点 đi qua `conversionVal` (port
 *     Conversion.Val) nên "116-5" → 116, giống hệt WinForm.
 *  3. "abc" → Val = 0 → VẪN chạy nhánh tra cứu 点数 0 (không còn nuốt im lặng).
 *  4. Mã đặc biệt コードモード đã port: `classifyCodeModeEntry` + applyKasanCode
 *     (101-103) / setIsInputPick (50) / applyMisoutyaku (999) / homeVisit (333) /
 *     applyFreeTreatment (1-6, có trả 入力モード về 点数), và nhánh 自由処置+ePoint
 *     của 点列 (chuyển sang ô 回 đặt 回数 1 rồi đổi sang コードモード).
 *
 *  CÒN LỆCH — testcase CUỐI 「mã đặc biệt — quét toàn bộ」 viết kỳ vọng THEO WinForm
 *  nên phần này DỰ KIẾN CÒN FAIL; nó tự bắt lỗi từng mã và in bảng tổng kết:
 *  a. `commitPick` (đường ô 点) chưa route mã cần form nhập của frm203016 sau khi
 *     chọn trong 処置選択: 17 自費金額 / 179-5 残根数 / 202・203 IS — mới chỉ nối ở
 *     đường tab 個別 (`onKobetuPick`).
 *  b. Chưa có luật `intRowCnt == 1 && trt_cd != 17` (mã 17 phải LUÔN mở dialog dù
 *     master chỉ có 1 dòng).
 *
 * CHẠY TUẦN TỰ (`describe.serial`), dùng CHUNG một page vì app giới hạn số lần
 * login. Thứ tự testcase CÓ Ý NGHĨA (mode và dòng vừa thêm được dùng lại ở bước sau).
 *
 * File này CÓ làm bẩn lưới đang mở (thêm dòng 処置) nhưng TUYỆT ĐỐI KHÔNG bấm
 * F9 登録 nên KHÔNG ghi vào DB — tải lại trang là sạch.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/**
 * Danh sách 点数 để dò một giá trị có ≥2 処置 (mở được 処置選択). Ghim cứng một số
 * cụ thể sẽ vỡ khi đổi master, nên dò lần lượt. Ép một giá trị: TEST_POINT_VALUE=42
 */
const POINT_CANDIDATES = process.env.TEST_POINT_VALUE
    ? [process.env.TEST_POINT_VALUE]
    : ['10', '12', '14', '20', '30', '40', '50', '60']

/**
 * Danh sách 処置コード để dò một mã có ≥2 枝番. CỐ TÌNH tránh các mã đặc biệt của
 * GetTrtmasCod (101/102/103/50/999/333/1-6) và các mã có dialog riêng trên web
 * (17 自費, 179 分割抜歯, 202/203 IS・全麻, 599 介護, 600-699 薬剤) để không test
 * nhầm vào phần chưa port. Ép một mã: TEST_TRT_CD=116
 */
const CODE_CANDIDATES = process.env.TEST_TRT_CD
    ? [process.env.TEST_TRT_CD]
    : ['116', '214', '234', '236', '144', '157', '201', '218']

/** 点数/コード chắc chắn không có trong master → dùng cho nhánh 0 kết quả. */
const NO_MATCH_VALUE = '99999'

/**
 * Thông báo 0 kết quả — GIỐNG HỆT WinForm MsgBox (modMain.cs:280/480/597), web khai
 * ở `lib/code-mode-entry.ts` NO_MATCHING_TREATMENT_MSG. (Trước 2026-07-23 web dùng
 * 「該当する処置がありません。」, đã sửa cho khớp WinForm.)
 */
const NO_TRT_MSG = '該当処置はありません。'

test.describe.configure({ mode: 'serial' })

test.describe('診療入力 — ô 点/回 với 点数モード / コードモード', () => {
    let page: Page
    let step: () => Promise<void>

    /**
     * Nút nhãn 入力モード ở header (lbInpMode). Nhãn ĐỔI theo mode (点数 ↔ コード)
     * nên KHÔNG match theo tên được — bám vào `title` cố định của nút.
     */
    let modeBtn: Locator
    /** Ô 点 của dòng 日計 đang hoạt động (dưới cùng) — input thật. */
    let footerTen: Locator
    /** Ô 回 của dòng 日計 đang hoạt động. */
    let footerKai: Locator
    /** Dialog 処置選択 (frm203016). */
    let picker: Locator
    /** Alert 0 kết quả. */
    let noTrtAlert: Locator
    /** Ô 療法・処置 của mọi dòng (data-grid-cell "<rowKey>|2") — đếm số dòng lưới. */
    let ryoCells: Locator

    /** 点数 dò được ở testcase 点数モード — dùng lại cho bước 確定. */
    let foundPoint = ''
    /** コード có ≥2 枝番 dò được ở testcase コードモード — dùng lại cho bước Val("コード-枝番"). */
    let foundCode = ''
    let foundSb = ''
    /** コード chỉ có ĐÚNG 1 枝番 (commit thẳng) — dùng cho nhánh "1 kết quả". */
    let singleHitCode = ''

    /** Đọc 日計 của ngày dưới cùng: 「【負担金 …円】 【日計 N点】」. */
    async function dayTotal(): Promise<number> {
        const txt = await page.getByText(/【日計/).last().innerText()
        const m = /【日計\s*([\d,]+)\s*点】/.exec(txt)
        expect(m, `không đọc được 日計 từ 「${txt}」`).not.toBeNull()
        return Number((m?.[1] ?? '0').replace(/,/g, ''))
    }

    /** Số dòng đang có trong lưới (đếm ô 療法・処置). */
    const rowCount = () => ryoCells.count()

    /**
     * Gõ một giá trị vào ô 点 của 日計 rồi Enter.
     * Handler onKeyDown XOÁ input trước khi gọi onCodeEntry, nên `value === ''`
     * là TÍN HIỆU CÓ THẬT cho biết Enter đã được xử lý — dùng nó thay cho sleep
     * (Rule 7) ở các assert "không có gì xảy ra".
     */
    async function enterTen(value: string) {
        await footerTen.click()
        await footerTen.fill(value)
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
    }

    /** Đóng alert 0 kết quả. */
    async function dismissNoTrtAlert() {
        const alert = page.getByRole('alertdialog')
        await expect(alert).toBeVisible({ timeout: 10000 })
        await expect(alert.getByText(NO_TRT_MSG)).toBeVisible()
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden({ timeout: 10000 })
    }

    /**
     * Dọn các dialog dây chuyền bung ra SAU khi commit 処置 / 回数 — SingleChk
     * 「１処置チェック」 (W00100, frm203002.cs:5684, vd 「…当月の算定限度（1回）を
     * 超えています。」), カルテ記載選択, 摘要コメント…
     *
     * `waitMs > 0`: CHỜ dialog xuất hiện. Bắt buộc dùng ở đường commit — SingleChk
     * phải đi một vòng BE nên dialog đến TRỄ; đếm một phát ngay sau Enter sẽ thấy
     * "sạch" rồi vài trăm ms sau overlay của nó nuốt hết click của testcase kế
     * (đúng lỗi đã gặp). `waitMs = 0`: chỉ dọn cái đang mở, dùng làm chốt chặn rẻ
     * tiền ở đầu các testcase có click vào lưới.
     */
    async function closeStrayDialogs(waitMs = 0, rounds = 4) {
        const any = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        for (let i = 0; i < rounds; i++) {
            const present =
                waitMs > 0
                    ? await any
                          .first()
                          // Vòng đầu chờ đủ lâu cho BE trả lời; các vòng sau chỉ đón
                          // dialog nối đuôi nên chờ ngắn.
                          .waitFor({ state: 'visible', timeout: i === 0 ? waitMs : 1500 })
                          .then(() => true)
                          .catch(() => false)
                    : (await any.count()) > 0
            if (!present) break
            const ok = page.getByRole('button', { name: 'OK' })
            if ((await ok.count()) > 0) await ok.first().click()
            else await page.keyboard.press('F10')
            await expect(any.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
        // Overlay nền đen của Radix còn sống thêm một nhịp animation SAU khi dialog
        // đã "hidden", và nó `intercepts pointer events` → phải chờ nó biến mất hẳn
        // rồi mới được click/dblclick vào lưới.
        await expect(
            page.locator('div.fixed.inset-0[data-state="open"]'),
            'overlay của dialog vẫn còn, mọi click lên lưới sẽ bị nuốt',
        ).toHaveCount(0, { timeout: 10000 })
    }

    /** rowKey của dòng chứa 処置名称 `name` (ô 療法 gần đáy nhất). */
    async function rowKeyOfName(name: string): Promise<string> {
        const cell = ryoCells.filter({ hasText: name }).last()
        await expect(cell, `không thấy dòng 「${name}」 trong lưới`).toBeVisible({ timeout: 15000 })
        const attr = await cell.getAttribute('data-grid-cell')
        expect(attr, 'ô 療法 thiếu data-grid-cell').not.toBeNull()
        return (attr ?? '').replace(/\|2$/, '')
    }

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo để cả file dùng chung MỘT lần login; ignoreHTTPSErrors vì
        // *.ochacom.local dùng cert tự ký (browser.newPage không kế thừa `use`).
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        // AutoSantei bung SanteiConfirmDialog 「…を算定しますか？」 đè lên mọi thứ và
        // nuốt click. Bấm 「No」 (bấm Yes lại kéo theo dialog カルテ記載選択).
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

        // KHÔNG truyền trtDt → tháng hiện hành. Bắt buộc: chỉ dòng của tháng hiện
        // hành mới sửa được (dòng lịch sử là read-only, WinForm col51 == "99").
        await page.goto(`/treatments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        // Nhiều ngày trong tháng → nhiều dòng 日計; ô nhập nằm ở ngày DƯỚI CÙNG
        // (WinForm sau khi load cũng đặt CurrentCell ở dòng đáy).
        footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        footerKai = page.locator('input[data-footer-cell$=":footer-kai"]').last()
        picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        noTrtAlert = page.getByText(NO_TRT_MSG)
        ryoCells = page.locator('[data-grid-cell$="|2"]')

        await expect(footerTen, 'không thấy ô 点 của dòng 日計').toBeVisible({ timeout: 30000 })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ───────────────────────── 入力モード ─────────────────────────

    test('mặc định là 点数モード (flgInpMode = ePoint)', async () => {
        // frm203002.cs:3024 — form khởi tạo ở ePoint, nhãn hiện 「点数」.
        await expect(modeBtn).toBeVisible()
        await expect(modeBtn).toHaveText('点数')
        await step()
    })

    test('click nhãn 入力モード đổi 点数 ↔ コード (lbInpMode_Click)', async () => {
        // frm203002.cs:7126 — click nhãn: eCod → KeyFunc(F9) (点数), ngược lại F10.
        await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')
        await modeBtn.click()
        await expect(modeBtn).toHaveText('点数')
        await step()
    })

    test('lớp phím ON: F10 → コード, Shift+F9 → 点数', async () => {
        // ON layer = FKeyBar shift layer (bật bằng nút ON/OFF hoặc giữ Shift).
        // Dùng NÚT cho F10: Shift+F10 là phím tắt menu ngữ cảnh của hệ điều hành.
        await page.getByRole('button', { name: 'OFF', exact: true }).click()
        await page.getByRole('button', { name: /^F10\s*コード$/ }).click()
        await expect(modeBtn, 'F10 lớp ON phải chuyển コードモード').toHaveText('コード')

        // Shift+F9 (không đụng phím tắt hệ thống) → về 点数. Provider chọn lớp shift
        // khi `e.shiftKey || toggled`, nên phím này chạy dù nút ON đang bật.
        await page.keyboard.press('Shift+F9')
        await expect(modeBtn, 'Shift+F9 phải chuyển 点数モード').toHaveText('点数')

        // Trả bar về lớp base để các phím F sau không chạy nhầm lớp ON.
        await page.getByRole('button', { name: 'ON', exact: true }).click()
        await expect(page.getByRole('button', { name: 'OFF', exact: true })).toBeVisible()
        await step()
    })

    // ─────────────────── 点数モード — nhập vào ô 点 ───────────────────

    test('点数モード — Enter ô 点 khi rỗng: không tra cứu, không dialog', async () => {
        // handleCodeEntry: `text === '' → return` (WinForm cũng chỉ tra khi
        // txtInp.Text.Trim() != "").
        const before = await rowCount()
        await enterTen('')
        await expect(picker, 'ô 点 rỗng mà vẫn mở 処置選択').toBeHidden()
        await expect(noTrtAlert, 'ô 点 rỗng mà vẫn bung alert').toHaveCount(0)
        expect(await rowCount(), 'ô 点 rỗng mà vẫn thêm dòng').toBe(before)
        await step()
    })

    test('点数モード — gõ chữ vào ô 点: Conversion.Val("abc") = 0 nên VẪN tra cứu', async () => {
        // frm203002.cs:5596/5600 truyền `Conversion.Val(txtInp.Text)` cho CẢ HAI hàm
        // tra cứu ⇒ rác bị ÉP KIỂU chứ không bị chặn: "abc" → 0 → chạy nhánh 点数 0
        // (GetTrtmas :200 bó hẹp còn trt_cd ≥ 400 hoặc ∈ {144,157,201,234,236}).
        // Web port bằng `lib/code-mode-entry.ts conversionVal` (trước đây dùng
        // Number() ra NaN rồi nuốt im lặng — đã sửa 2026-07-23).
        const before = await rowCount()
        await enterTen('abc')

        // Có tra cứu thật ⇒ phải ra picker hoặc alert 該当処置はありません。 —
        // tuyệt đối không được im lặng.
        const settled = picker.or(noTrtAlert)
        await expect(settled.first(), 'Val("abc") = 0 mà không hề tra cứu').toBeVisible({
            timeout: 30000,
        })
        if ((await noTrtAlert.count()) > 0) {
            await dismissNoTrtAlert()
        } else {
            // Danh sách 点数 0 phải là danh sách HẠN CHẾ của WinForm.
            const codes = (await picker.getByTestId('cell-trtCd').allTextContents()).map((t) =>
                Number(t.trim()),
            )
            const allow = new Set([144, 157, 201, 234, 236])
            const wrong = codes.filter((c) => !(c >= 400 || allow.has(c)))
            expect(wrong, `点数 0 lọt mã ngoài phạm vi: ${wrong.slice(0, 5).join(', ')}`).toEqual([])
            await page.keyboard.press('F10')
            await expect(picker).toBeHidden({ timeout: 10000 })
        }
        expect(await rowCount(), 'nhánh tra cứu 点数 0 không được tự thêm dòng').toBe(before)
        await step()
    })

    test('点数モード — 点数 không khớp 処置 nào → alert 0 kết quả', async () => {
        // modMain.cs:277 / 480 — tblTrt.Rows.Count == 0 → MsgBox + return false.
        const before = await rowCount()
        await enterTen(NO_MATCH_VALUE)
        await dismissNoTrtAlert()
        expect(await rowCount(), 'nhánh 0 kết quả không được thêm dòng').toBe(before)
        await step()
    })

    test('点数モード — 点数 khớp ≥2 処置 → mở 処置選択, mọi dòng đúng 点数 đã gõ', async () => {
        // GetTrtmas lọc theo `score1 = <点数>` nên MỌI dòng trong picker phải mang
        // đúng con số vừa gõ. Dò lần lượt vì master mỗi tenant một khác.
        const before = await rowCount()
        for (const p of POINT_CANDIDATES) {
            await enterTen(p)
            // 3 kết cục: picker mở (≥2), alert (0), hoặc commit thẳng (đúng 1) —
            // commit thẳng nhận biết qua số dòng lưới tăng.
            const settled = picker
                .or(noTrtAlert)
                .or(ryoCells.nth(before)) // dòng thứ (before+1) xuất hiện = đã commit
            await expect(settled.first()).toBeVisible({ timeout: 30000 })

            if (await picker.isVisible()) {
                foundPoint = p
                break
            }
            if ((await noTrtAlert.count()) > 0) {
                await dismissNoTrtAlert()
                continue
            }
            // Commit thẳng (1 kết quả) — hợp lệ với WinForm nhưng không dùng được
            // cho testcase này; dọn dialog dây chuyền rồi thử 点数 kế.
            await closeStrayDialogs(4000)
        }
        expect(foundPoint, `không 点数 nào trong [${POINT_CANDIDATES.join(', ')}] cho ≥2 処置`).not.toBe(
            '',
        )
        console.log(`点数モード: 点数 ${foundPoint} mở được 処置選択`)

        // ⚠️ Cột `score1` của picker nay mang KẾT QUẢ getTensu, không phải score1 thô
        // (modMain.cs:337/:391 ghi getTensu vào tblTrtSel c04 trước khi mở frm203016).
        // Assert dưới đây chỉ đúng vì bệnh nhân test là NGƯỜI LỚN, dis_flg 0, ngày
        // không phải 訪問診療 ⇒ getTensu trả về đúng score1. Đổi TEST_PAT_NO sang một
        // bệnh nhân 乳幼児/障害 là nó đỏ mà KHÔNG phải lỗi app — lúc đó xem
        // `treatment-score-gettensu-parity.spec.ts` TC-4.
        const scores = await picker.getByTestId('cell-score1').allTextContents()
        expect(scores.length, 'picker phải có ≥2 dòng').toBeGreaterThanOrEqual(2)
        for (const s of scores) {
            expect(s.trim(), '処置選択 lọt dòng khác 点数 đã gõ').toBe(foundPoint)
        }

        // F10 戻る → huỷ, KHÔNG được thêm dòng nào (WinForm ret=false → không ghi).
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
        expect(await rowCount(), 'huỷ picker mà vẫn thêm dòng').toBe(before)
        await step()
    })

    test('処置選択 F9 確定 → thêm dòng vào lưới, con trỏ vào ô 回 ở chế độ nhập', async () => {
        // WinForm case 3: ret == true → Move_Cell(Right) + grdRegi.BeginEdit(true).
        const before = await rowCount()
        await enterTen(foundPoint)
        await expect(picker).toBeVisible({ timeout: 30000 })

        // Lấy tên 処置 của dòng đang sáng (dòng đầu — selectedIdx khởi tạo 0).
        const pickedName = (await picker.getByTestId('cell-trtNm').first().innerText()).trim()
        await picker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(picker).toBeHidden({ timeout: 15000 })

        expect(await rowCount(), '確定 mà lưới không thêm dòng').toBe(before + 1)
        const rowKey = await rowKeyOfName(pickedName)
        console.log(`確定 処置 「${pickedName}」 → rowKey ${rowKey}`)

        // Ô 回 của chính dòng đó phải đang là <input> (editingCell) — KHÔNG phải
        // chỉ tô vàng. `:not([data-footer-cell])` loại input của dòng 日計.
        const kaiInput = page.locator(
            `[data-grid-cell="${rowKey}|4"] input:not([data-footer-cell])`,
        )
        await expect(kaiInput, 'ô 回 của dòng vừa thêm phải mở sẵn để nhập').toBeVisible({
            timeout: 15000,
        })
        await step()
    })

    test('回 + Enter → ghi 回数 và 日計 tăng đúng 点数 × 回数', async () => {
        // WinForm case 4: hFG1[4] = 回数, hFG1[54] = 点数 × 回数, cuối cùng
        // modAcc.DispDayPoint dựng lại dòng 日計.
        const kaiInput = page.locator('[data-grid-cell$="|4"] input:not([data-footer-cell])')
        await expect(kaiInput).toBeVisible({ timeout: 15000 })
        const cellKey = await kaiInput
            .locator('..')
            .getAttribute('data-grid-cell')
            .then((v) => (v ?? '').replace(/\|4$/, ''))

        const points = Number((await page.locator(`[data-grid-cell="${cellKey}|3"]`).innerText()).trim())
        const oldCount = Number((await kaiInput.inputValue()).trim() || '0')
        expect(points, 'không đọc được 点数 của dòng').toBeGreaterThan(0)

        const totalBefore = await dayTotal()
        const newCount = oldCount === 2 ? 3 : 2 // luôn khác giá trị cũ để delta != 0
        await kaiInput.fill(String(newCount))
        await kaiInput.press('Enter')

        // Commit 回数 kéo theo SingleChk (W00100) / カルテ記載選択 — CHỜ hẳn rồi dọn
        // (dialog đi qua BE nên đến trễ; không chờ là testcase sau ăn overlay).
        await closeStrayDialogs(6000)

        const kaiCell = page.locator(`[data-grid-cell="${cellKey}|4"]`)
        await expect(kaiCell, 'ô 回 chưa ghi được giá trị').toHaveText(String(newCount), {
            timeout: 15000,
        })
        // 合計点数 của dòng đổi theo 点数 × 回数 → 日計 lệch đúng chừng đó.
        await expect
            .poll(() => dayTotal(), { timeout: 20000 })
            .toBe(totalBefore + points * (newCount - oldCount))
        console.log(
            `回 Enter: ${oldCount}→${newCount} 回 × ${points} 点 ⇒ 日計 ${totalBefore} → ${await dayTotal()}`,
        )
        await step()
    })

    test('回 + Enter → thoát chế độ nhập, con trỏ rời ô 回 (Move_Cell(Down))', async () => {
        // advanceFocusToNextTen — WinForm Move_Cell(Down) + Move_Cell(Left) đưa con
        // trỏ xuống dòng dưới; ô 回 vừa nhập phải đóng editor.
        await expect(
            page.locator('[data-grid-cell$="|4"] input:not([data-footer-cell])'),
            'ô 回 vẫn còn mở editor sau khi Enter',
        ).toHaveCount(0)
        await step()
    })

    // ────────────── ô 点 của DÒNG (không phải 日計) ──────────────

    test('ô 点 của dòng + Enter là TRA CỨU 処置, không phải sửa số', async () => {
        // frm203002.cs case 3 chạy y hệt cho ô 点 của dòng đang đứng: gõ 99999 →
        // GetTrtmas 0 dòng → alert, và giá trị cũ của ô KHÔNG bị thay bằng 99999
        // (WinForm ret=false còn xoá trắng ô).
        // Chốt chặn: còn dialog/overlay của bước trước là dblclick dưới đây bị nuốt.
        await closeStrayDialogs()
        // `:not([data-footer-cell])` loại ô 点 của dòng 日計 (nó là <input> và cũng
        // mang data-grid-cell kết thúc bằng "|3"); `:not(:has(input))` loại ô đang mở editor.
        const tenCell = page
            .locator('[data-grid-cell$="|3"]:not([data-footer-cell]):not(:has(input))')
            .last()
        const key = (await tenCell.getAttribute('data-grid-cell')) ?? ''
        const beforeText = (await tenCell.innerText()).trim()

        // Mở editor: double-click (grdRegi_CellDoubleClick) rồi gõ + Enter.
        await tenCell.dblclick()
        const editor = page.locator(`[data-grid-cell="${key}"] input`)
        await expect(editor, 'double-click không mở được editor ô 点').toBeVisible({ timeout: 10000 })
        await editor.fill(NO_MATCH_VALUE)
        await editor.press('Enter')

        await dismissNoTrtAlert()
        await expect(
            page.locator(`[data-grid-cell="${key}"]`),
            'ô 点 không được nhận thẳng số vừa gõ',
        ).not.toHaveText(NO_MATCH_VALUE, { timeout: 10000 })
        console.log(`ô 点 dòng: trước 「${beforeText}」, sau alert 「${(await page.locator(`[data-grid-cell="${key}"]`).innerText()).trim()}」`)
        await step()
    })

    test('ô 点 của dòng — Escape huỷ, giá trị giữ nguyên', async () => {
        // Chốt chặn: còn dialog/overlay của bước trước là dblclick dưới đây bị nuốt.
        await closeStrayDialogs()
        // `:not([data-footer-cell])` loại ô 点 của dòng 日計 (nó là <input> và cũng
        // mang data-grid-cell kết thúc bằng "|3"); `:not(:has(input))` loại ô đang mở editor.
        const tenCell = page
            .locator('[data-grid-cell$="|3"]:not([data-footer-cell]):not(:has(input))')
            .last()
        const key = (await tenCell.getAttribute('data-grid-cell')) ?? ''
        const before = (await tenCell.innerText()).trim()

        await tenCell.dblclick()
        const editor = page.locator(`[data-grid-cell="${key}"] input`)
        await expect(editor).toBeVisible({ timeout: 10000 })
        await editor.fill('12345')
        await editor.press('Escape')

        await expect(editor).toHaveCount(0, { timeout: 10000 })
        await expect(page.locator(`[data-grid-cell="${key}"]`)).toHaveText(before)
        await step()
    })

    test('ô 点 của dòng — click ra ngoài (không Enter) thì HUỶ, không commit', async () => {
        // renderEditableCell onBlur: chỉ commit khi viaEnter; 点/回 click-away →
        // onCancelCellEdit (chỉ ô 日 mới commit kiểu hoãn).
        // Chốt chặn: còn dialog/overlay của bước trước là dblclick dưới đây bị nuốt.
        await closeStrayDialogs()
        // `:not([data-footer-cell])` loại ô 点 của dòng 日計 (nó là <input> và cũng
        // mang data-grid-cell kết thúc bằng "|3"); `:not(:has(input))` loại ô đang mở editor.
        const tenCell = page
            .locator('[data-grid-cell$="|3"]:not([data-footer-cell]):not(:has(input))')
            .last()
        const key = (await tenCell.getAttribute('data-grid-cell')) ?? ''
        const before = (await tenCell.innerText()).trim()

        await tenCell.dblclick()
        const editor = page.locator(`[data-grid-cell="${key}"] input`)
        await expect(editor).toBeVisible({ timeout: 10000 })
        await editor.fill('777')
        await footerTen.click() // blur sang ô khác, KHÔNG Enter

        await expect(editor).toHaveCount(0, { timeout: 10000 })
        await expect(page.locator(`[data-grid-cell="${key}"]`)).toHaveText(before)
        await step()
    })

    // ─────────────────── コードモード — nhập vào ô 点 ───────────────────

    test('コードモード — mã không tồn tại → alert 0 kết quả', async () => {
        await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')

        const before = await rowCount()
        await enterTen(NO_MATCH_VALUE)
        await dismissNoTrtAlert()
        expect(await rowCount()).toBe(before)
        await step()
    })

    test('コードモード — mã có nhiều 枝番 → 処置選択 chỉ chứa đúng mã đó', async () => {
        // GetTrtmasCod: `where t.trt_cd = <mã> order by t.trt_sb` → mọi dòng cùng
        // コード, khác 枝番. Dò lần lượt vì master mỗi tenant một khác.
        const before = await rowCount()
        for (const cd of CODE_CANDIDATES) {
            await enterTen(cd)
            const settled = picker.or(noTrtAlert).or(ryoCells.nth(before))
            await expect(settled.first()).toBeVisible({ timeout: 30000 })

            if (await picker.isVisible()) {
                foundCode = cd
                break
            }
            if ((await noTrtAlert.count()) > 0) {
                await dismissNoTrtAlert()
                continue
            }
            // Commit thẳng = mã chỉ có 1 枝番 → giữ lại để test nhánh "1 kết quả"
            // ở testcase sau, rồi thử mã kế.
            if (singleHitCode === '') singleHitCode = cd
            await closeStrayDialogs(4000)
        }
        expect(foundCode, `không mã nào trong [${CODE_CANDIDATES.join(', ')}] có ≥2 枝番`).not.toBe('')

        const codes = await picker.getByTestId('cell-trtCd').allTextContents()
        const sbs = await picker.getByTestId('cell-trtSb').allTextContents()
        expect(codes.length, 'picker phải có ≥2 枝番').toBeGreaterThanOrEqual(2)
        for (const c of codes) {
            expect(c.trim(), '処置選択 lọt dòng khác コード đã gõ').toBe(foundCode)
        }
        // WinForm order by t.trt_sb — chỉ log để thấy khi lệch (thứ tự do BE trả).
        const nums = sbs.map((s) => Number(s.trim()))
        const asc = [...nums].sort((a, b) => a - b)
        if (JSON.stringify(nums) !== JSON.stringify(asc)) {
            console.log(`CẢNH BÁO: 枝番 không tăng dần như "order by t.trt_sb": ${nums.join(',')}`)
        }
        foundSb = (sbs[0] ?? '').trim()
        console.log(`コードモード: mã ${foundCode} có ${codes.length} 枝番 (đầu tiên: ${foundSb})`)

        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
        expect(await rowCount(), 'huỷ picker mà vẫn thêm dòng').toBe(before)
        await step()
    })

    test('コードモード — KHÔNG có cú pháp "コード-枝番": Val cắt tại "-" nên "116-5" = "116"', async () => {
        // GetTrtmasCod chỉ query `trt_cd` (modMain.cs:588) còn ô 点 đi qua
        // Conversion.Val → "116-5" đọc được tiền tố số là 116, dấu "-" kết thúc phép
        // quét. ⇒ gõ "コード-枝番" phải cho kết quả Y HỆT gõ mỗi コード: picker mở với
        // đủ 枝番, KHÔNG được lọc còn 1 dòng. (Bản web cũ tách "101-2" thành
        // trtCd+trtSb — mở rộng ngoài WinForm, đã bỏ 2026-07-23.)
        const before = await rowCount()
        await enterTen(`${foundCode}-${foundSb}`)

        await expect(picker, 'Val cắt tại "-" nên vẫn phải mở picker theo コード').toBeVisible({
            timeout: 30000,
        })
        const codes = await picker.getByTestId('cell-trtCd').allTextContents()
        expect(codes.length, '"コード-枝番" bị hiểu thành lọc theo 枝番').toBeGreaterThanOrEqual(2)
        for (const c of codes) {
            expect(c.trim()).toBe(foundCode)
        }
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
        expect(await rowCount(), 'huỷ picker mà vẫn thêm dòng').toBe(before)
        await step()
    })

    test('コードモード — mã chỉ có 1 枝番 → commit thẳng, không mở picker', async () => {
        // frm203016_Hide_Let_Trt_Data(0) — `intRowCnt == 1 && trt_cd != 17` thì ghi
        // luôn, không hiện 処置選択. Mã dùng ở đây là mã đã lộ ra ở vòng dò phía trên.
        if (singleHitCode === '') {
            console.log(
                `không mã nào trong [${CODE_CANDIDATES.join(', ')}] chỉ có 1 枝番 → BỎ QUA nhánh commit thẳng`,
            )
            return
        }
        const before = await rowCount()
        await enterTen(singleHitCode)

        await expect(picker, '1 kết quả mà vẫn mở 処置選択').toBeHidden({ timeout: 10000 })
        await expect.poll(() => rowCount(), { timeout: 20000 }).toBeGreaterThan(before)
        await closeStrayDialogs(4000)
        console.log(
            `コード ${singleHitCode} (1 枝番) → commit thẳng, lưới ${before} → ${await rowCount()} dòng`,
        )
        await step()
    })

    // ─────────────── ô 回 của dòng 日計 (không có 処置 đang chờ) ───────────────

    test('ô 回 của 日計 — Enter khi rỗng: không tạo dòng thừa', async () => {
        // handleCountEnter: không có 処置 chờ + chuỗi rỗng → return.
        const before = await page.getByText(/【負担金/).count()
        await footerKai.click()
        await footerKai.fill('')
        await footerKai.press('Enter')
        await expect(footerKai, 'Enter chưa được xử lý').toHaveValue('')
        expect(await page.getByText(/【負担金/).count(), 'Enter rỗng mà vẫn nhân bản dòng').toBe(before)
        await step()
    })

    test('ô 回 của 日計 — Enter có 回数: nhân bản dòng 負担金/日計 mang đúng 回数', async () => {
        // WinForm case 4 trên dòng 日計 → Move_Cell(Down) + AddRow; web dựng dòng
        // nhân bản mang 回数 vừa gõ (committedCountsByDay).
        const before = await page.getByText(/【負担金/).count()
        const cnt = '3'
        await footerKai.click()
        await footerKai.fill(cnt)
        await footerKai.press('Enter')
        await expect(footerKai).toHaveValue('')

        await expect
            .poll(() => page.getByText(/【負担金/).count(), { timeout: 15000 })
            .toBe(before + 1)
        await step()
    })

    // ══════════════════ MÃ ĐẶC BIỆT (special codes) ══════════════════
    //
    // Gộp TẤT CẢ mã đặc biệt vào MỘT testcase, đặt CUỐI CÙNG, có chủ ý:
    //   · describe chạy `mode: 'serial'` → một testcase fail là các testcase SAU bị
    //     skip. Nhóm mã đặc biệt phần lớn CHƯA được port (xem mục ĐIỂM LỆCH đầu
    //     file) nên tách lẻ ra thì mã đầu tiên fail sẽ che hết các mã còn lại.
    //   · Gộp lại + tự bắt lỗi từng mã ⇒ một lần chạy liệt kê ĐẦY ĐỦ mã nào lệch,
    //     lệch ra sao — đúng thứ dev cần khi ngồi sửa.
    // Kỳ vọng viết theo WinForm (modMain.GetTrtmasCod :501-590 / GetTrtmas :174-490),
    // KHÔNG theo hành vi web hiện tại.

    test('mã đặc biệt — quét toàn bộ theo kỳ vọng WinForm (dự kiến FAIL tới khi port xong)', async () => {
        // Quét ~10 kịch bản, mỗi kịch bản có thể phải chờ dialog → nới timeout.
        test.setTimeout(420_000)

        /** Kết cục có thể quan sát được sau một cú Enter trên ô 点. */
        type Outcome = 'alert' | 'self-pay' | 'is' | 'split' | 'picker' | 'commit' | 'none'

        // Ba dialog nhập liệu đặc biệt của frm203016 dùng CHUNG title 「処置選択」 với
        // picker, nên phải phân biệt bằng CHỮ TRONG THÂN dialog.
        const selfPayMsg = page.getByText('自費金額を入力してください。')
        const isMsg = page.getByText(/使用リッター数|使用時間（分）|実施時間（分）/)
        const splitMsg = page.getByText(/残根数/)
        const pickerRows = page.getByTestId('cell-trtCd')

        const failures: string[] = []
        const bad = (code: string, msg: string) => {
            failures.push(`${code} — ${msg}`)
            console.log(`✗ ${code} — ${msg}`)
        }
        const good = (code: string, msg: string) => console.log(`✓ ${code} — ${msg}`)

        /** Ảnh chụp trạng thái hiện tại; 'none' = chưa có gì xảy ra. */
        const snapshot = async (before: number): Promise<Outcome> => {
            if ((await noTrtAlert.count()) > 0) return 'alert'
            if ((await selfPayMsg.count()) > 0) return 'self-pay'
            if ((await isMsg.count()) > 0) return 'is'
            if ((await splitMsg.count()) > 0) return 'split'
            if ((await pickerRows.count()) > 0) return 'picker'
            if ((await ryoCells.count()) > before) return 'commit'
            return 'none'
        }

        /** Chờ tới khi có kết cục; hết giờ mà im lìm thì trả 'none' (Rule 7: dùng poll, không sleep). */
        const waitOutcome = async (before: number, timeout = 12000): Promise<Outcome> => {
            let last: Outcome = 'none'
            await expect
                .poll(async () => (last = await snapshot(before)), { timeout })
                .not.toBe('none')
                .catch(() => {})
            return last
        }

        /** Đặt 入力モード về đúng mode cần. */
        const setMode = async (m: '点数' | 'コード') => {
            if ((await modeBtn.innerText()).trim() !== m) await modeBtn.click()
            await expect(modeBtn).toHaveText(m)
        }

        /**
         * Đóng sạch dialog để kịch bản kế bắt đầu từ nền sạch. Chờ 3s mỗi vòng vì
         * hầu hết kịch bản ở đây đều commit dòng → SingleChk (W00100) đến TRỄ; bỏ
         * chờ là overlay của nó nuốt cú Enter của mã kế tiếp.
         */
        const cleanup = () => closeStrayDialogs(3000)

        /** Gõ `value` vào ô 点 ở `mode` rồi trả về kết cục + số dòng trước đó. */
        const tryCode = async (
            mode: '点数' | 'コード',
            value: string,
        ): Promise<{ outcome: Outcome; before: number }> => {
            await cleanup()
            await setMode(mode)
            const before = await rowCount()
            await enterTen(value)
            return { outcome: await waitOutcome(before), before }
        }

        // ── 101 / 102 / 103 加算コード ──────────────────────────────────
        // GetTrtmasCod (modMain.cs:531): `trt_cd == 101|102|103` → KasanCode (:1647)
        // đọc DÒNG TRÊN con trỏ và CHỈ ghi dòng 加算 trong 3 trường hợp:
        //   · 初診 (100 / 107-0)                    → 枝番 0, ShowTrt, return TRUE
        //   · 再診 (110 / 111 / 107-1)              → 枝番 1, ShowTrt, return TRUE
        //   · 処置 (col51 == 2) VÀ `grp == 4` (装着) → 枝番 2, Calc_Kasan, return TRUE
        // Mọi trường hợp khác — kể cả một 処置 bình thường có grp != 4 — rơi xuống
        // `return functionReturnValue` với giá trị FALSE (:1760): KHÔNG ghi gì, case 3
        // chỉ xoá ô 点 (`hFG1.CurrentCell.Value = ""`, frm203002.cs:5619).
        //
        // Testcase này KHÔNG dựng sẵn dòng 初診/再診/装着 phía trên, nên dòng trên là
        // 処置 bất kỳ mà các bước trước để lại (thường grp != 4) ⇒ 'none' CŨNG đúng
        // WinForm. Chỉ chốt phần xác định được: không alert, không mở picker.
        for (const cd of ['101', '102', '103']) {
            try {
                const { outcome } = await tryCode('コード', cd)
                if (outcome === 'commit' || outcome === 'none') {
                    good(cd, `加算コード không tra cứu master (${outcome} — tuỳ dòng trên)`)
                } else {
                    bad(cd, `加算コード không được alert/picker, thực tế: ${outcome}`)
                }
            } catch (e) {
                bad(cd, `lỗi khi chạy: ${String(e)}`)
            }
        }

        // ── 50 酸素 (IS) ────────────────────────────────────────────────
        // GetTrtmasCod (:541): dựng ParamData rỗng với trtCd = 50 rồi showDialog
        // frm203016 → form NHẬP IS (Ｎ２Ｏ／Ｏ２使用リッター数), không phải picker.
        try {
            const { outcome } = await tryCode('コード', '50')
            if (outcome === 'is') good('50', 'mở form nhập IS (酸素)')
            else bad('50', `phải mở form nhập IS (…使用リッター数), thực tế: ${outcome}`)
        } catch (e) {
            bad('50', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 999 未装着 ──────────────────────────────────────────────────
        // GetTrtmasCod (:556): Misoutyaku(con) (:1767) lấy 装着料 của DÒNG TRÊN, thay
        // 点数 bằng điểm tại ngày算定 印象, ghi dòng rồi return true. 999 KHÔNG hề
        // được query trong mst_trt ⇒ tuyệt đối không được ra alert 0 kết quả.
        try {
            const { outcome } = await tryCode('コード', '999')
            if (outcome === 'commit') good('999', '未装着 được ghi thẳng (Misoutyaku)')
            else bad('999', `Misoutyaku phải ghi thẳng dòng 未装着, thực tế: ${outcome}`)
        } catch (e) {
            bad('999', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 333 訪問診療 ────────────────────────────────────────────────
        // GetTrtmasCod (:563): bật cờ `ModCommon.pHoumon[ngày] = true` RỒI vẫn chạy
        // tiếp SQL trt_cd = 333 ⇒ commit thẳng (1 枝番) hoặc mở picker (nhiều 枝番),
        // KHÔNG được alert. Hệ quả của cờ 訪問 (GetTrtmas :250 chuyển sang so cả
        // score3 + f1 in (0,11)) nằm ngoài tầm quan sát của E2E — chỉ ghi chú.
        try {
            const { outcome } = await tryCode('コード', '333')
            if (outcome === 'commit' || outcome === 'picker') good('333', `訪問診療: ${outcome}`)
            else bad('333', `phải commit hoặc mở picker (không alert), thực tế: ${outcome}`)
        } catch (e) {
            bad('333', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 1..6 自由処置 ───────────────────────────────────────────────
        // GetTrtmasCod (:567): ghi trt_cd = mã, trt_sb = 0, col51 = 2, col73 = "6",
        // TRẢ 入力モード VỀ ePoint rồi return false ⇒ không dialog, không alert, và
        // nhãn 入力モード phải tự lật về 「点数」.
        try {
            const { outcome } = await tryCode('コード', '3')
            if (outcome === 'alert' || outcome === 'picker') {
                bad('1-6 (自由処置)', `không được alert/picker, thực tế: ${outcome}`)
            } else {
                good('1-6 (自由処置)', `không dialog (${outcome})`)
            }
            const mode = (await modeBtn.innerText()).trim()
            if (mode === '点数') good('1-6 (自由処置)', 'mode tự lật về 点数 (flgInpMode = ePoint)')
            else bad('1-6 (自由処置)', `sau khi nhập mã 自由処置, mode phải là 点数, thực tế: ${mode}`)
        } catch (e) {
            bad('1-6 (自由処置)', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 17 自費 ─────────────────────────────────────────────────────
        // GetTrtmasCod (:678): điều kiện commit thẳng là `intRowCnt == 1 && trt_cd != 17`
        // ⇒ mã 17 LUÔN phải mở dialog (処置選択, và trong frm203016 là ô nhập 自費金額),
        // dù master chỉ có đúng 1 dòng.
        try {
            const { outcome } = await tryCode('コード', '17')
            if (outcome === 'picker' || outcome === 'self-pay') good('17', `mở dialog: ${outcome}`)
            else bad('17', `mã 17 luôn phải mở dialog (không commit thẳng), thực tế: ${outcome}`)
        } catch (e) {
            bad('17', `lỗi khi chạy: ${String(e)}`)
        }

        /**
         * Mở picker cho `code`, chọn dòng 枝番 `sb` (double-click = onOpenRow = 確定)
         * rồi trả về kết cục — dùng cho các mã mà form nhập liệu đặc biệt nằm SAU
         * bước chọn 枝番 trong frm203016.
         */
        const pickSbThen = async (code: string, sb: string): Promise<Outcome> => {
            const { outcome, before } = await tryCode('コード', code)
            if (outcome !== 'picker') return outcome
            const row = page.getByTestId(`row-${code}-${sb}`)
            if ((await row.count()) === 0) return 'none'
            await row.dblclick()
            return waitOutcome(before)
        }

        // ── 179-5 分割抜歯 ──────────────────────────────────────────────
        // GetTrtmas (:428) liệt 179 vào nhóm "1 dòng cũng phải hiện frm203016";
        // frm203016 (frm203016.cs:483-553) với 179/5 hiện ô nhập 残根数.
        try {
            const outcome = await pickSbThen('179', '5')
            if (outcome === 'split') good('179-5', 'mở ô nhập 残根数 (分割抜歯)')
            else bad('179-5', `chọn 179/5 phải mở ô nhập 残根数, thực tế: ${outcome}`)
        } catch (e) {
            bad('179-5', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 202 笑気 / 203 全身麻酔 ─────────────────────────────────────
        // Cùng nhóm mã đặc biệt của GetTrtmas (:434/:449) và frm203016 hiện form
        // nhập IS (Ｎ２Ｏ/Ｏ２ リッター, 実施時間).
        for (const [cd, sb] of [
            ['202', '0'],
            ['203', '0'],
        ] as const) {
            try {
                const outcome = await pickSbThen(cd, sb)
                if (outcome === 'is') good(`${cd}-${sb}`, 'mở form nhập IS')
                else bad(`${cd}-${sb}`, `chọn ${cd}/${sb} phải mở form nhập IS, thực tế: ${outcome}`)
            } catch (e) {
                bad(`${cd}-${sb}`, `lỗi khi chạy: ${String(e)}`)
            }
        }

        // ── 点数モード với 点数 = "0" ───────────────────────────────────
        // GetTrtmas (:200): `Point == "0"` bó hẹp câu SQL còn
        // `(t.trt_cd >= 400 or t.trt_cd in (144,157,201,234,236))` — ユーザーコード +
        // 模型 / ラバーダム / 浸麻 / EE・EB / 研磨 (những thứ vẫn cần ghi カルテ).
        const ZERO_ALLOW = new Set([144, 157, 201, 234, 236])
        try {
            const { outcome } = await tryCode('点数', '0')
            if (outcome !== 'picker') {
                bad('点数=0', `phải mở 処置選択 danh sách hạn chế, thực tế: ${outcome}`)
            } else {
                const codes = (await pickerRows.allTextContents()).map((t) => Number(t.trim()))
                const wrong = codes.filter((c) => !(c >= 400 || ZERO_ALLOW.has(c)))
                if (wrong.length === 0) {
                    good('点数=0', `${codes.length} dòng, đều là trt_cd ≥ 400 hoặc mã ghi カルテ`)
                } else {
                    bad(
                        '点数=0',
                        `lọt ${wrong.length} mã ngoài phạm vi (vd ${wrong.slice(0, 5).join(', ')})`,
                    )
                }
            }
        } catch (e) {
            bad('点数=0', `lỗi khi chạy: ${String(e)}`)
        }

        // ── 549 ────────────────────────────────────────────────────────
        // GetTrtmas (:461) cũng ép hiện frm203016 khi chỉ có 1 dòng, NHƯNG nhánh này
        // chỉ vào được từ 点数モード và cần biết trước 点数 của 549 trong master —
        // không suy ra được một cách xác định từ UI nên KHÔNG tự động hoá ở đây.
        console.log('549: bỏ qua — nhánh 点数モード 1 dòng, cần biết trước 点数 của 549 trong master')

        await cleanup()
        console.log(
            `\n=== TỔNG KẾT mã đặc biệt: ${failures.length} lệch ===\n${failures.map((f) => ` - ${f}`).join('\n')}`,
        )
        expect(failures, 'các mã đặc biệt còn lệch so với WinForm').toEqual([])
    })
})
