import { expect, test, type Locator, type Page, type Request, type Route } from '@playwright/test'

import { foldForCompare, readPdf } from './pdf-content'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * GIỚI HẠN ĐỘ DÀI CỦA CÁC Ô TEXT ĐI VÀO 帳票 — hồi quy cho bug "nhập dài thì
 * dòng rớt xuống trang 2".
 *
 * Bug gốc: template Crystal (rpt20300301 / rpt20300201) bật **Can Grow** ở các
 * field bound. Nhập quá dài → section 明細 giãn ra → 保険医療機関名 /
 * 開設者・担当歯科医 bị đẩy sang TRANG 2. WinForm không bao giờ tới được trạng
 * thái đó vì chặn 2 tầng, mà bản web port thiếu cả hai:
 *   1. `MaxLength` của control (ĐẾM KÝ TỰ, không phải byte)
 *   2. Bề rộng cột VARCHAR của bảng tạm in `#prt_shishu` → `insertPrtShishu`
 *      ném lỗi → `printProc` dừng bằng E00026「印刷」
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/prosthesis-management-dialog.tsx (補管・義歯, frm203023)
 *      · `MAX_LEN_TEXT = 60` → `maxLength` trên 2 Input 【着脱方法】 và 6 Input
 *        【その他情報】 (WinForm txtAttach1/2 + cboOtherInfo1..6 MaxLength=60).
 *      · `MAX_BYTES_OTHER_INFO = 50` — `prt_shishu.txt4‥txt9` là `varchar(50)`,
 *        tức 25 chữ 全角. CHẶT HƠN cap 60 ký tự → đây mới là cap người dùng chạm.
 *      · `firstOverByteCapOtherInfo` chạy TRƯỚC khi POST datasource; vượt cap →
 *        `alertDialog(ja.E00022('その他情報{n}'))` rồi `return`. Nên khi vượt cap
 *        KHÔNG có request nào tới `/tenant/report/{patNo}/hokan-datasource` —
 *        đó là điểm phân biệt "chặn tại FE" với "BE trả 422".
 *      · 着脱方法 KHÔNG có byte-cap: cột `memo8/memo9` là `varchar(200)` = 100
 *        全角, 60 ký tự không bao giờ chạm tới.
 *  - components/oral-hygiene-instruction-dialog.tsx (指導文書, frm203022)
 *      · `MAX_LEN_GUIDE = 60` / `MAX_LEN_SCORE = 6` / `MAX_LEN_NO = 5`.
 *      · Màn này in qua typed DataSet TRONG BỘ NHỚ (không có bảng tạm SQL) nên
 *        KHÔNG có tầng byte-cap — `maxLength` là thứ DUY NHẤT chặn. Vì vậy
 *        testcase ở đây chỉ kiểm ký tự, KHÔNG kiểm byte. Đừng "đồng bộ" nó với
 *        補管・義歯 bằng cách thêm assert byte.
 *  - locales/ja.ts: E00022 `${field}の桁数が長すぎます。`
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login nên login + mở màn 診療入力 chỉ làm một lần ở beforeAll. Thứ tự testcase
 * có ý nghĩa (mở dialog ở case đầu) — chạy lẻ case giữa sẽ hỏng.
 *
 * KHÔNG ghi DB và KHÔNG đụng máy in: mọi nhánh đều dừng trước khi in, riêng
 * case biên thì stub `hokan-datasource` trả `shouldPrint:false` để FE return
 * sớm — không cần print agent chạy.
 *
 * ⚠️ HAI TẦNG KIỂM, ĐỪNG NHẦM:
 *   · Các case `maxlength` / byte-cap dưới đây chỉ chứng minh FE CHẶN ĐÚNG CHỖ.
 *     Chúng KHÔNG chứng minh tờ giấy còn gọn 1 trang — mà đó mới là bug gốc.
 *   · TC-PDF-1 (cuối khối 補管・義歯) nhồi ĐÚNG cap vào MỌI ô rồi in THẬT qua
 *     print agent, tải PDF về và đòi `pageCount === 1` + 保険医療機関名 vẫn có mặt.
 *     Đây là testcase duy nhất thực sự bắt được "dòng rớt xuống trang 2".
 *     Cần agent (Windows) → máy khác thì tự skip kèm lý do.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
/** Trỏ vào ca có 補管/義管 算定 để chart có 部位 sẵn (giống 2 spec dialog kia). */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
const TRT_DT = process.env.TEST_TRT_DT ?? '2025-12-24'

/** MAX_LEN_TEXT — cap ký tự của 着脱方法 / その他情報 (WinForm MaxLength). */
const MAX_LEN_TEXT = 60
/** MAX_LEN_GUIDE / MAX_LEN_SCORE / MAX_LEN_NO của màn 指導文書. */
const MAX_LEN_GUIDE = 60
const MAX_LEN_SCORE = 6
const MAX_LEN_NO = 5

/** 6 dòng 【その他情報】 / 【指導内容】. */
const OTHER_INFO_COUNT = 6
const GUIDE_COUNT = 6

/**
 * 25 chữ 全角 = 50 byte Shift_JIS = ĐÚNG sức chứa của `prt_shishu.txt4‥txt9`.
 * Thêm 1 chữ nữa (26 全角 = 52 byte) là vượt — nhưng vẫn nằm trong cap 60 KÝ TỰ,
 * nên chỉ byte-cap mới bắt được. Đây chính xác là ca WinForm báo E00026.
 */
const OTHER_INFO_AT_CAP = 'あ'.repeat(25)
const OTHER_INFO_OVER_CAP = 'あ'.repeat(26)

/** Dòng 【その他情報】 dùng để test (0-based) → nhãn lỗi phải là 「その他情報3」. */
const OVER_CAP_LINE_IDX = 2
const OVER_CAP_LINE_LABEL = `その他情報${OVER_CAP_LINE_IDX + 1}`

// ── In THẬT để soi số trang (TC-PDF-1) ───────────────────────────────────────
/**
 * Print agent là net48 + Crystal → chỉ Windows. Máy khác thì TC-PDF-1 tự skip:
 * không có agent thì KHÔNG có tờ giấy nào để đếm trang, và stub một PDF giả rồi
 * assert số trang là tự lừa mình.
 *   TEST_AGENT=1 / TEST_AGENT=0 để ép.
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `cần print agent (net48/Crystal, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

const AGENT_RENDER_URL = /\/v1\/render(\?|$)/
const AGENT_PRINT_URL = /\/v1\/print(\?|$)/
/** Tiêu đề PdfPreviewDialog = ja.printPreviewTitle(ja.reportHokan()). */
const PREVIEW_TITLE = 'クラウン・ブリッジ維持管理・義歯管理プレビュー'

/** Body POST /v1/render. */
interface RenderRequestBody {
    reportId: string
    printCategory: number
    dataJson: Record<string, Record<string, string>[]>
    useDesignPaper?: boolean
}

/** Đóng SanteiConfirmDialog 「…を算定しますか？」 do AutoSantei bung ra (đè lên dialog). */
async function installSanteiAutoClose(page: Page) {
    await page.addLocatorHandler(
        page.getByText(/を算定しますか？/).first(),
        async () => {
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
        },
        { times: 20 },
    )
}

/**
 * Đếm request FE gửi tới một endpoint trong lúc chạy `fn`. Dùng để phân biệt
 * "FE chặn trước" (0 request) với "BE trả lỗi" (>= 1 request) — hai cái này ra
 * cùng một hộp thoại nên nhìn UI không phân biệt được.
 */
async function countRequests(
    page: Page,
    urlPart: string,
    fn: () => Promise<void>,
): Promise<number> {
    let n = 0
    const onRequest = (req: Request) => {
        if (req.url().includes(urlPart)) n += 1
    }
    page.on('request', onRequest)
    try {
        await fn()
    } finally {
        page.off('request', onRequest)
    }
    return n
}

/** Đọc thuộc tính maxlength thật trên DOM của từng phần tử trong locator. */
async function maxLengths(locator: Locator): Promise<(string | null)[]> {
    return locator.evaluateAll((els) => els.map((e) => e.getAttribute('maxlength')))
}

test.describe.configure({ mode: 'serial' })

test.describe('帳票の文字数ガード — 長文入力が2ページ目に落ちる不具合の回帰', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog 補管・義歯 — match theo body text 「【着脱方法】」 (Rule 13.1). */
    let hokanDialog: Locator
    /** Dialog 指導文書 — match theo body text 「【歯・歯肉の状態】」. */
    let sidouDialog: Locator
    /** Khối chứa một nhãn = CHA của phần tử mang đúng text đó. */
    let boxOf: (dialog: Locator, text: string) => Locator
    /** PdfPreviewDialog của agent (chỉ dùng ở TC-PDF-1). */
    let previewDialog: Locator

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        await installSanteiAutoClose(page)

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        hokanDialog = page.getByRole('dialog').filter({ hasText: '【着脱方法】' })
        sidouDialog = page.getByRole('dialog').filter({ hasText: '【歯・歯肉の状態】' })
        boxOf = (dialog: Locator, text: string) =>
            dialog.getByText(text, { exact: true }).locator('..')
        previewDialog = page.getByRole('dialog').filter({ hasText: PREVIEW_TITLE })

        // Chỉ cài route khi CÓ agent: các case còn lại không chạm agent, và trên
        // máy không có agent thì TC-PDF-1 skip nên cũng không cần stub.
        //   · /v1/render → chụp body GỐC rồi chèn forcePreview để agent luôn trả
        //     PDF xem trước (print_mapping của RPT203003 có thể đang tắt preview).
        //   · /v1/print  → CHẶN: job xuống spooler Windows sẽ bung hộp thoại
        //     "Save Print Output As" mà Playwright không đóng được → treo suite.
        if (AGENT_AVAILABLE) {
            await page.route(/\/v1\/(render|print)(\?|$)/, async (route: Route) => {
                const req = route.request()
                if (AGENT_PRINT_URL.test(req.url())) {
                    return route.fulfill({
                        status: 202,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': '*',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ jobId: '00000000-0000-4000-8000-000000000000' }),
                    })
                }
                const original = req.postDataJSON() as RenderRequestBody
                return route.continue({
                    postData: JSON.stringify({ ...original, forcePreview: true }),
                })
            })
        }
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── 補管・義歯 (frm203023) ───────────────────────────────────────────────

    test('mở dialog 補管・義歯', async () => {
        // 「補管・義歯」 (frm203023) KHÁC 「補管(&H)」 (frm203045) → phải exact.
        await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
        await expect(hokanDialog).toBeVisible({ timeout: 30000 })
        await step()
    })

    test('【着脱方法】 — 2 Input đều có maxlength=60', async () => {
        const inputs = boxOf(hokanDialog, '【着脱方法】').getByRole('textbox')
        await expect(inputs).toHaveCount(2)
        expect(await maxLengths(inputs)).toEqual([String(MAX_LEN_TEXT), String(MAX_LEN_TEXT)])
        await step()
    })

    test('【その他情報】 — cả 6 Input đều có maxlength=60', async () => {
        // Input có `list=` mang role combobox chứ không phải textbox (Rule 12.5)
        // → lấy bằng CSS cho chắc.
        const others = hokanDialog.locator('input[list="gisi-kanri-other-info-list"]')
        await expect(others).toHaveCount(OTHER_INFO_COUNT)
        expect(await maxLengths(others)).toEqual(
            Array.from({ length: OTHER_INFO_COUNT }, () => String(MAX_LEN_TEXT)),
        )
        await step()
    })

    test('着脱方法 — trình duyệt chặn cứng ở ký tự thứ 60', async () => {
        const attach1 = boxOf(hokanDialog, '【着脱方法】').getByRole('textbox').nth(0)

        // fill() gán thẳng value nên KHÔNG bị maxLength chặn — dùng nó để mồi tới
        // sát cap, rồi GÕ THẬT phần còn lại để trình duyệt thực thi maxLength.
        await attach1.fill('あ'.repeat(MAX_LEN_TEXT - 5))
        await attach1.pressSequentially('いいいいいいいいいい') // +10 → chỉ 5 ký tự lọt

        await expect(attach1).toHaveValue('あ'.repeat(MAX_LEN_TEXT - 5) + 'いいいいい')
        await step()
    })

    test('F9 印刷 — その他情報 vượt 50 byte bị CHẶN TẠI FE, nêu đúng tên dòng', async () => {
        const others = hokanDialog.locator('input[list="gisi-kanri-other-info-list"]')

        // Dọn 着脱方法 của case trước để không lẫn nguyên nhân.
        await boxOf(hokanDialog, '【着脱方法】').getByRole('textbox').nth(0).fill('')

        // 26 全角 = 52 byte: vẫn dưới cap 60 KÝ TỰ (gõ vào được), nhưng vượt bề
        // rộng varchar(50) của cột in → phải bị chặn.
        await others.nth(OVER_CAP_LINE_IDX).fill(OTHER_INFO_OVER_CAP)
        await expect(others.nth(OVER_CAP_LINE_IDX)).toHaveValue(OTHER_INFO_OVER_CAP)

        const sent = await countRequests(page, 'hokan-datasource', async () => {
            await hokanDialog.getByRole('button', { name: 'F9 印刷' }).click()
            const alert = page.getByRole('alertdialog')
            await expect(alert).toBeVisible({ timeout: 10000 })
            // Điểm cốt lõi của bản vá: nêu ĐÚNG dòng nào quá dài, không phải
            // 「印刷に失敗しました。」 chung chung như trước.
            await expect(alert.getByText(`${OVER_CAP_LINE_LABEL}の桁数が長すぎます。`)).toBeVisible()
            await alert.getByRole('button', { name: 'OK' }).click()
            await expect(alert).toBeHidden({ timeout: 10000 })
        })

        // Chặn ở FE nghĩa là KHÔNG tốn round-trip nào. Nếu số này > 0 tức là
        // pre-flight đã bị bỏ và ta chỉ đang thấy 422 của BE.
        expect(sent, 'F9 vẫn gọi hokan-datasource dù đã vượt cap → mất pre-flight').toBe(0)
        await step()
    })

    test('F9 印刷 — その他情報 đúng 50 byte (25 全角) thì ĐI QUA được', async () => {
        const others = hokanDialog.locator('input[list="gisi-kanri-other-info-list"]')
        await others.nth(OVER_CAP_LINE_IDX).fill(OTHER_INFO_AT_CAP)

        // Stub datasource trả shouldPrint=false → handlePrint return sớm, không
        // chạm print agent. Nhờ vậy case biên chạy được mà không cần agent.
        await page.route('**/hokan-datasource', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: { shouldPrint: false, renderRequest: null },
                }),
            }),
        )

        try {
            const sent = await countRequests(page, 'hokan-datasource', async () => {
                await hokanDialog.getByRole('button', { name: 'F9 印刷' }).click()
                // Giá trị BIÊN phải lọt: không có alert 桁数 nào bung ra.
                await expect(
                    page.getByText('の桁数が長すぎます。'),
                    '25 全角 (= đúng 50 byte) bị chặn nhầm — cap đang lệch 1 ký tự',
                ).toBeHidden({ timeout: 5000 })
            })
            expect(sent, 'giá trị hợp lệ mà không gọi hokan-datasource').toBeGreaterThan(0)
        } finally {
            await page.unroute('**/hokan-datasource')
        }

        await others.nth(OVER_CAP_LINE_IDX).fill('')
        await step()
    })

    test('TC-PDF-1 — nhồi ĐÚNG cap mọi ô: PDF thật vẫn gọn 1 trang', async () => {
        // Đây là testcase THẬT SỰ canh bug gốc. Các case trên chỉ chứng minh FE
        // chặn đúng chỗ; còn "section 明細 giãn ra đẩy 保険医療機関名 sang TRANG 2"
        // thì chỉ nhìn thấy khi Crystal đã dựng xong tờ giấy.
        //
        // Nhồi TỐI ĐA hợp lệ: 着脱方法 = 60 ký tự (cap MaxLength), その他情報 = 25
        // 全角 × 6 dòng (cap 50 byte của prt_shishu.txt4‥txt9). Nếu template còn
        // bật Can Grow ở field bound thì đúng cấu hình này làm tràn trang.
        test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)

        const attach = boxOf(hokanDialog, '【着脱方法】').getByRole('textbox')
        await attach.nth(0).fill('あ'.repeat(MAX_LEN_TEXT))
        await attach.nth(1).fill('い'.repeat(MAX_LEN_TEXT))

        const others = hokanDialog.locator('input[list="gisi-kanri-other-info-list"]')
        for (let i = 0; i < OTHER_INFO_COUNT; i++) await others.nth(i).fill(OTHER_INFO_AT_CAP)

        // Bắt body /v1/render ngay tại đây (bản GỐC, trước khi route chèn
        // forcePreview) — khỏi phải giữ state chung giữa các testcase.
        const renderReq = page.waitForRequest(AGENT_RENDER_URL, { timeout: 60000 })
        await hokanDialog.getByRole('button', { name: 'F9 印刷' }).click()

        // Không có alert 桁数 nào được bung ra — toàn bộ giá trị đều ĐÚNG cap.
        await expect(
            page.getByText('の桁数が長すぎます。'),
            'giá trị đúng cap bị chặn nhầm — cap đang lệch',
        ).toBeHidden({ timeout: 5000 })

        await expect(previewDialog, 'agent không render được bản đầy chữ này').toBeVisible({
            timeout: 60000,
        })
        const src = await previewDialog.locator('iframe').getAttribute('src')
        expect(src, 'iframe preview không có src').toBeTruthy()
        const res = await page.request.get(src!.split('#')[0]!)
        expect(res.ok(), `tải PDF preview lỗi ${res.status()}`).toBe(true)
        const body = await res.body()
        expect(body.subarray(0, 5).toString('latin1'), 'agent trả về không phải PDF').toBe('%PDF-')
        await test.info().attach('rpt20300301-at-cap.pdf', {
            body,
            contentType: 'application/pdf',
        })

        const pdf = await readPdf(body)
        await test.info().attach('pdf-text.txt', { body: pdf.text, contentType: 'text/plain' })

        expect(
            pdf.pageCount,
            'ĐÚNG BUG GỐC: nhập tối đa cho phép mà 帳票 vẫn tràn sang trang 2 ⇒ cap hiện tại ' +
                'CHƯA đủ chặt, hoặc template Crystal còn bật Can Grow ở field bound',
        ).toBe(1)

        // 保険医療機関名 (memo4) là dòng bị đẩy sang trang 2 trong bug gốc — nó phải
        // còn nằm trên tờ giấy DUY NHẤT này.
        const sent = (await renderReq).postDataJSON() as RenderRequestBody
        const shishu = sent.dataJson?.SHISHU?.[0]
        const clinic = shishu?.memo4 ?? ''
        if (clinic.trim() === '') {
            console.log('医院マスタ chưa có 医院名 → BỎ QUA phần kiểm 保険医療機関名 trên giấy')
        } else {
            expect(
                pdf.folded.includes(foldForCompare(clinic)),
                `保険医療機関名 "${clinic}" không có trên trang 1 — đúng triệu chứng bị đẩy ` +
                    'xuống trang sau (mở phần đính kèm .pdf / pdf-text.txt để đối chiếu)',
            ).toBe(true)
        }

        await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(previewDialog).toBeHidden({ timeout: 10000 })

        // Trả form về trạng thái sạch cho các case sau.
        await attach.nth(0).fill('')
        await attach.nth(1).fill('')
        for (let i = 0; i < OTHER_INFO_COUNT; i++) await others.nth(i).fill('')
        await step()
    })

    test('đóng dialog 補管・義歯 bằng F10', async () => {
        await page.keyboard.press('F10')
        await expect(hokanDialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    // ── 指導文書 (frm203022) ─────────────────────────────────────────────────

    test('mở dialog 指導文書', async () => {
        await page.getByRole('button', { name: '指導文書', exact: true }).click()
        await expect(sidouDialog).toBeVisible({ timeout: 30000 })
        await step()
    })

    test('【指導内容】 — cả 6 Input đều có maxlength=60', async () => {
        const guides = sidouDialog.locator('input[list="sidou-guide-list"]')
        await expect(guides).toHaveCount(GUIDE_COUNT)
        expect(await maxLengths(guides)).toEqual(
            Array.from({ length: GUIDE_COUNT }, () => String(MAX_LEN_GUIDE)),
        )
        await step()
    })

    test('指導内容 — trình duyệt chặn cứng ở ký tự thứ 60', async () => {
        const guide = sidouDialog.locator('input[list="sidou-guide-list"]').nth(0)
        await guide.fill('あ'.repeat(MAX_LEN_GUIDE - 5))
        await guide.pressSequentially('いいいいいいいいいい') // +10 → chỉ 5 lọt
        await expect(guide).toHaveValue('あ'.repeat(MAX_LEN_GUIDE - 5) + 'いいいいい')
        await guide.fill('')
        await step()
    })

    test('プラークスコア — maxlength=6', async () => {
        const score = boxOf(sidouDialog, '【歯・歯肉の状態】').getByRole('textbox')
        await expect(score).toHaveCount(1)
        expect(await maxLengths(score)).toEqual([String(MAX_LEN_SCORE)])

        // onChange còn lọc [^0-9.]; gõ 10 chữ số thì maxLength cắt còn 6.
        await score.fill('')
        await score.pressSequentially('1234567890')
        await expect(score).toHaveValue('123456')
        await step()
    })

    test('No. — maxlength=5', async () => {
        // Khối 「No.」 chứa cả EraDateField (年/月/日) → No. là textbox đầu tiên.
        const no = boxOf(sidouDialog, 'No.').getByRole('textbox').nth(0)
        expect(await maxLengths(no)).toEqual([String(MAX_LEN_NO)])

        await no.fill('')
        await no.pressSequentially('1234567')
        await expect(no).toHaveValue('12345')
        await step()
    })

    test('đóng dialog 指導文書 bằng F10', async () => {
        await page.keyboard.press('F10')
        await expect(sidouDialog).toBeHidden({ timeout: 10000 })
        await step()
    })
})
