import { type Locator, type Page, type Route } from '@playwright/test'

import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import { makeStep, skipWithReason } from '../_shared/step'
import { emptyState, rows } from '../_shared/virtual-grid'

/**
 * E00100 khi 一部負担金 tính hỏng — cho các màn KHÁC 来患一覧.
 *
 * WinForm `buiPrice.getBuiPrice2` TỰ bắt exception, bật E00100 rồi trả
 * `buiPriceData2` với giá trị 0 cho nơi gọi (buiPrice.cs:196-203). Cả 8 nơi gọi
 * đều chạy tiếp với số 0 — KHÔNG nơi nào bỏ dở màn hình hay job in.
 *
 * Bản web trước đây ném lại thành `InvalidOperationException` ở 5 nơi ⇒
 * `ExceptionMiddleware` trả 500 ⇒ một bệnh nhân dữ liệu lỗi làm chết cả danh
 * sách / cả job in. Nhánh `fix/buiprice-e00100-parity-single-callers` đổi 5 nơi
 * đó sang fail-soft: BE đẩy lỗi ra field `warnings` của response, FE dựng lại
 * đúng hộp E00100. Spec này canh NỬA FE + hợp đồng của field `warnings`.
 *
 * 来患一覧 (frm204008) đã có spec riêng: `accounting-unpaid/patient-visit-list-rcp-type.spec.ts`
 * (TC-WARN-1). Ở ĐÂY chỉ đo những màn còn lại.
 *
 * ── FACT bám theo source (Rule 21) ──────────────────────────────────────────
 *  - features/treatments/hooks/use-bui-price-warnings.ts
 *      · `useBuiPriceWarnings(warnings, eras)` — mỗi phần tử bật MỘT alertDialog,
 *        NỐI TIẾP (await từng cái), đúng độ hạt WinForm 「1 件 1 ダイアログ」.
 *      · `announceBuiPriceWarnings(...)` — bản mệnh lệnh cho kết quả mutation.
 *      · 診療年月 dựng bằng `formatWarekiYearMonthUnpadded` ⇒ `gggy年M月`,
 *        KHÔNG đệm 0 (buiPrice.cs:200 dùng "gggy年M月").
 *  - features/counter-payments/locales/ja.ts → `buiPriceFailed`
 *      · Thân: `一部負担金計算に失敗しました。患者登録データを確認してください。\n`
 *              `　患者番号[{patNo}] 枝番[{patBr}] 診療年月[{和暦}]`
 *        — dấu cách đầu dòng 2 là 全角 U+3000.
 *      · Có `reason` thì nối thêm `\n\n内容[{reason}]`; `reason` null thì BỎ HẲN
 *        dòng 内容[] (bản prod không bật VerboseMessages).
 *      · KHÔNG BAO GIỜ có `場所[stack trace]` — cố ý bỏ, stack trace không được
 *        gửi ra trình duyệt. Đây là điểm lệch WinForm ĐÃ CHỐT.
 *      · locale của treatments tham chiếu THẲNG hàm này (một nguồn duy nhất);
 *        unit test `bui-price-warning-message.test.ts` giữ chỗ đó.
 *  - features/treatments/components/treatment-entry-detail.tsx
 *      · `useBuiPriceWarnings(monthlyCopaymentsQuery.data?.warnings, eras)` —
 *        footer 日計 hiện 0 và màn hình vẫn sống (port modAcc.cs:94 + :172-200).
 *      · Chuỗi F8: sau `insertUnpaidMutation.mutateAsync(...)` gọi
 *        `announceBuiPriceWarnings(inserted.warnings, eras)` rồi `return true`
 *        ⇒ VẪN sang 窓口精算. Parity modAcc.cs:626-707 (không có nhánh lỗi):
 *        guard thấy 0 nên không ghi dòng 未精算 nào, nhưng chuỗi không dừng.
 *  - features/treatments/components/treatment-entry-page.tsx
 *      · `useBuiPriceWarnings(todaySummary?.warnings, eras)` — F4 当日来患.
 *  - features/treatments/api/today-visit-api.ts
 *      · GET /tenant/treatment/today → `data.summary.warnings`.
 *  - features/treatments/api/daily-accounting-summary-api.ts
 *      · GET /tenant/treatment/accounting/monthly-copayments → `data.warnings`.
 *  - shared/ui/alert-dialog-view.tsx: đúng MỘT nút, nhãn `OK`.
 *
 * BE (apps/api):
 *  - `BuiPriceFailureResponse { patNo, patBr, trtDt, reason }` — `reason` chỉ có
 *    khi `ApiErrorOptions.VerboseMessages` bật (BuiPriceFailureResponseMapper).
 *  - `BuiPriceService.TryCalculatePriceAsync` là entry point DUY NHẤT; bản
 *    fail-loud `CalculatePriceAsync` đã bị xoá.
 *
 * ── VÌ SAO PHẢI GIẢ LẬP RESPONSE ────────────────────────────────────────────
 * Dataset demo KHÔNG có bệnh nhân nào làm 一部負担金 ném exception (đã dò khi viết
 * `accounting-unpaid/patient-visit-list-rcp-type.spec.ts`: 0 dòng warning trên 86 dòng). Dựng một ca
 * hỏng thật phải phá dữ liệu đăng ký bệnh nhân — không làm trên spec chạy hằng
 * ngày. Nên: TC-CLEAN-* đo dữ liệu THẬT (không được có warning giả), TC-E00100-*
 * chèn `warnings` vào response bằng `page.route` để đo NỬA FE.
 * Nửa BE (fail-soft, không còn 500) đã có unit test .NET:
 * `Cct2DaySumCalculatorFailureTests`, `CalculateAccountingDataHandlerTests`,
 * `BuiPriceServiceFailureToleranceTests`.
 *
 * ── CHẶN GHI ────────────────────────────────────────────────────────────────
 * Chuỗi F8 ghi thật (`clear-unpaid`, `insert-unpaid`, `correct`) nên cả ba bị
 * chặn cứng và trả envelope giả — copy cách làm của `accounting-target-date.spec`.
 * Spec này KHÔNG đụng DB.
 *
 * CHẠY TUẦN TỰ (`describe.serial`), CHUNG một page: app giới hạn số lần login
 * (Rule 10.1). Chạy CẢ FILE, đừng `-g` lẻ (Rule 19):
 *   npx playwright test tests/accounting-unpaid/bui-price-e00100-parity.spec.ts --retries=0
 *
 * DỮ LIỆU (Rule 18): `TEST_PAT_NO` mặc định 12138 và 診療日 = HÔM NAY, giống
 * `accounting-target-date.spec`. Hôm nay thường KHÔNG có 当日来患 nào ⇒ TC-E00100-4
 * tự skip. Muốn chạy nó thì trỏ vào một ngày CÓ 来患 (spec tự gõ lại ô 診療日):
 *   TEST_TRT_DT=2026-09-03 npx playwright test tests/accounting-unpaid/bui-price-e00100-parity.spec.ts --retries=0
 * Lúc đó chuỗi F8 của TC-E00100-5 sẽ gặp thêm cổng 日付チェック — `settleAccountingDialogs`
 * đã trả lời OK cho nó nên không cần chỉnh gì.
 */

const PAT_NO = patNo('12138')

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** Hôm nay theo lịch máy chạy test — mốc để biết có phải gõ lại 診療日 hay không. */
const TODAY_ISO = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

/** `TEST_TRT_DT` trỏ sang ngày khác hôm nay ⇒ phải gõ lại ô 診療日 trước khi bấm F4. */
const OVERRIDE_DATE = TRT_DT !== TODAY_ISO

/**
 * Chờ lưới 診療入力 dựng xong.
 *
 * 90s chứ không phải 60s: `playwright.config.ts` ghi rõ "against the Vite *dev*
 * server a cold module-graph transform can push a single navigation past 60s"
 * và đặt `navigationTimeout: 90_000`. Với 60s, `backToEntry()` của TC-E00100-2
 * timeout 1/3 lần trong khi chính lượt đó TC-E00100-1 chỉ mất 8-12s — tức là
 * chậm do transform nguội, không phải app hỏng. Khối describe đặt
 * `timeout: 300_000` nên nới lên vẫn còn dư ngân sách cho phần vét hộp thoại.
 */
const GRID_LOAD_TIMEOUT = 90_000

// ── Endpoint ─────────────────────────────────────────────────────────────────
const MONTHLY_COPAYMENTS_URL = /\/tenant\/treatment\/accounting\/monthly-copayments/
const TODAY_URL = /\/tenant\/treatment\/today(\?|$)/
const ACC_CLEAR_UNPAID_URL = /\/tenant\/treatment\/accounting\/clear-unpaid(\?|$)/
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/
const ACC_CORRECT_URL = /\/tenant\/treatment\/accounting\/correct(\?|$)/

/** Đầu thân E00100 — locales/ja.ts `buiPriceFailed`. */
const BUI_PRICE_FAILED_HEAD = '一部負担金計算に失敗しました。患者登録データを確認してください。'

/** Đầu thân E00100 THỨ HAI — locales/ja.ts `buiPriceWelfareMasterMissing`. */
const BUI_PRICE_WELFARE_HEAD = '一部負担金計算に失敗しました。福祉医療設定データが存在しません。'

/**
 * `kind` của một phần tử `warnings` — chép từ `BuiPriceWarningKind` của FE
 * (features/treatments/types/bui-price-warning.ts), vốn chép lại chuỗi mà BE publish
 * (`BuiPriceFailureKind`).
 */
const KIND = {
    /** 患者登録データを確認してください — tính toán DỪNG giữa chừng, đoạn đó còn 0. */
    pricingThrew: 'pricing-threw',
    /** 福祉医療設定データが存在しません — tính toán VẪN THÀNH CÔNG. */
    welfareMasterMissing: 'welfare-master-missing',
} as const

/** Một phần tử `warnings` của BE. */
interface BuiPriceWarning {
    patNo: number
    patBr: number
    /** ISO yyyy-MM-dd. FE in ra dạng 和暦 `gggy年M月`. */
    trtDt: string
    /** Quyết định FE dựng thân nào. Thiếu ⇒ FE rơi về `buiPriceFailed`. */
    kind: string
    reason: string | null
    /** Chỉ có nghĩa với `welfare-master-missing`: lflg không tra được master. */
    welfareFlg: string | null
}

/**
 * 平成 bắt đầu 1989-01-08, 令和 bắt đầu 2019-05-01 — ranh giới là NGÀY.
 * Copy từ `patient-visit-list-rcp-type.spec` để hai spec cùng một luật.
 */
function eraOf(yyyy: number, mm: number): { name: string; startYear: number } {
    if (yyyy > 2019 || (yyyy === 2019 && mm >= 5)) return { name: '令和', startYear: 2018 }
    if (yyyy > 1989 || (yyyy === 1989 && mm >= 1)) return { name: '平成', startYear: 1988 }
    return { name: '昭和', startYear: 1925 }
}

/** `gggy年M月` — KHÔNG đệm 0, đúng `formatWarekiYearMonthUnpadded`. */
function warekiYm(iso: string): string {
    const y = Number(iso.slice(0, 4))
    const m = Number(iso.slice(5, 7))
    const era = eraOf(y, m)
    return `${era.name}${y - era.startYear}年${m}月`
}

/** Dựng lại ĐÚNG thân E00100 mà `ja.buiPriceFailed` sinh ra. */
function expectedBody(w: BuiPriceWarning): string {
    const head =
        `${BUI_PRICE_FAILED_HEAD}\n` +
        `　患者番号[${w.patNo}] 枝番[${w.patBr}] 診療年月[${warekiYm(w.trtDt)}]`
    return w.reason ? `${head}\n\n内容[${w.reason}]` : head
}

/**
 * Dựng lại ĐÚNG thân của `ja.buiPriceWelfareMasterMissing` — thân E00100 THỨ HAI.
 *
 * Đo trên WinForm thật (fla-ui-tests, bệnh nhân 10 / 診療月 2026-08, 2026-09-07):
 *
 *     一部負担金計算に失敗しました。福祉医療設定データが存在しません。
 *     　患者番号[10] 枝番[1] 診療年月[令和8年8月] 福祉医療フラグ[99999999]
 *
 * KHÔNG phải một biến thể của `buiPriceFailed`: câu thứ hai khác, có thêm trường
 * 福祉医療フラグ, và KHÔNG có đuôi `内容[]` / `場所[]` nào cả — buiPrice.cs:1731-1737 không
 * bắt ngoại lệ nào ở đó để mà in ra.
 */
function expectedWelfareBody(w: BuiPriceWarning): string {
    return (
        `${BUI_PRICE_WELFARE_HEAD}\n` +
        `　患者番号[${w.patNo}] 枝番[${w.patBr}] ` +
        `診療年月[${warekiYm(w.trtDt)}] 福祉医療フラグ[${w.welfareFlg ?? ''}]`
    )
}

const warn = (over: Partial<BuiPriceWarning> = {}): BuiPriceWarning => ({
    patNo: Number(PAT_NO),
    patBr: 1,
    trtDt: TRT_DT,
    kind: KIND.pricingThrew,
    reason: '介護保険データ不正',
    welfareFlg: null,
    ...over,
})

/** Warning nhánh 福祉医療設定 — `reason` LUÔN null, WinForm không có gì để in vào 内容[]. */
const welfareWarn = (over: Partial<BuiPriceWarning> = {}): BuiPriceWarning =>
    warn({ kind: KIND.welfareMasterMissing, reason: null, welfareFlg: '99999999', ...over })

/** `true` nếu locator hiện ra trong `timeout` (BẪY 5 của accounting-target-date). */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('E00100 一部負担金計算失敗 — 診療入力 / 当日来患 / 未精算', () => {
    let page: Page
    let step: () => Promise<void>

    /**
     * Warning sẽ CHÈN vào response ở lượt gọi kế tiếp. Rỗng = để response thật đi
     * qua nguyên vẹn (TC-CLEAN-*).
     */
    const inject = {
        monthly: [] as BuiPriceWarning[],
        today: [] as BuiPriceWarning[],
        insertUnpaid: [] as BuiPriceWarning[],
    }

    /** Cái BE thật trả về ở lượt gần nhất — dùng cho TC-CLEAN-*. */
    const observed = {
        monthlyHasField: false,
        monthlyWarnings: [] as BuiPriceWarning[],
        todayHasField: false,
        todayWarnings: [] as BuiPriceWarning[],
    }

    function resetInject() {
        inject.monthly.length = 0
        inject.today.length = 0
        inject.insertUnpaid.length = 0
    }

    /** Hộp thoại theo NỘI DUNG, bắt cả `dialog` lẫn `alertdialog` (Rule 13). */
    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    /**
     * Hộp E00100 — bắt CẢ HAI thân.
     *
     * Hai câu chỉ giống nhau ở vế đầu 「一部負担金計算に失敗しました。」, nên bám vào đó.
     * Bám riêng `BUI_PRICE_FAILED_HEAD` là TC-E00100-6/7 không thấy hộp nào và đỏ với
     * 「không thấy E00100」 — đúng chữ, sai nguyên nhân.
     */
    const e00100 = () => dlg('一部負担金計算に失敗しました。')

    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    /** Đóng hộp E00100 đang mở (một nút OK duy nhất — alert-dialog-view.tsx). */
    async function dismissE00100() {
        await btn(e00100().first(), 'OK').first().click()
    }

    /**
     * Vét SẠCH hàng đợi E00100 và trả về nội dung từng hộp theo thứ tự hiện ra.
     *
     * Hai cái bẫy đã vấp khi chạy thật, cả hai đều nằm ở đây:
     *
     *  1. KHÔNG chờ `toHaveCount(0)` giữa hai vòng. Hộp kế tiếp mở NGAY khi hộp
     *     này đóng (dialog-queue), nên số lượng không bao giờ về 0 ở giữa —
     *     assert kiểu đó đỏ 3/3 lần. Cái phải chờ là "khác hộp vừa đóng".
     *  2. Phải vét CẠN, kể cả khi testcase chỉ cần 1 hộp. Bỏ sót một hộp thì nó
     *     treo sang testcase sau, và `page.goto` lúc còn modal mở làm TRẮNG màn
     *     (chụp được ở test-failed-1.png: trang trắng trơn, không có pageerror).
     *
     * Ghi chú: lúc đầu spec này còn đỏ vì `useBuiPriceWarnings` PHÁT LẠI hộp thoại
     * mỗi khi `monthly-copayments` bay lại (deps là identity của mảng `warnings`).
     * Đó là lỗi parity thật — WinForm chỉ hiện mỗi lỗi ĐÚNG MỘT LẦN — và đã được
     * sửa ở app bằng `announcedRef`, chứ không phải nới timeout trong test.
     *
     * @param firstWaitMs chờ hộp ĐẦU lâu hơn (vừa điều hướng xong); các hộp sau
     *   mở tức thì nên không cần chờ lâu.
     */
    async function drainE00100(firstWaitMs = 20_000, rounds = 6): Promise<string[]> {
        const seen: string[] = []
        for (let round = 0; round < rounds; round++) {
            if (!(await appeared(e00100().first(), round === 0 ? firstWaitMs : 6_000))) break
            expect(
                await e00100().count(),
                'có 2 hộp E00100 mở cùng lúc — phải nối tiếp, không chồng nhau',
            ).toBe(1)
            const text = (await e00100().first().innerText()).replace(/\r\n/g, '\n')
            seen.push(text)
            await dismissE00100()
            await expect
                .poll(
                    async () => {
                        if ((await e00100().count()) === 0) return 'HẾT'
                        return (await e00100().first().innerText()).replace(/\r\n/g, '\n')
                    },
                    { timeout: 15_000 },
                )
                .not.toBe(text)
        }
        return seen
    }

    /**
     * Mở 診療入力 và CHỜ CHO XONG lượt gọi `monthly-copayments`.
     *
     * Lưới dựng xong (`合計:`) KHÔNG có nghĩa là query kia đã về: nó là một
     * `useQuery` riêng, bay song song. Lần chạy đầu spec đỏ đúng vì lý do này —
     * assert `observed.monthlyHasField` chạy trước khi route handler kịp chạy.
     */
    async function backToEntry() {
        const waiter = page.waitForResponse((r) => MONTHLY_COPAYMENTS_URL.test(r.url()), {
            timeout: 120_000,
        })
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await waiter
    }

    /**
     * Gõ lại 診療日 trên màn danh sách — copy nguyên của `today-visit-list.spec`.
     *
     * EraDateField không có aria-label nên bám theo hàng chứa nhãn 診療日:
     * 1 combobox (元号) + 3 textbox (年/月/日) theo đúng thứ tự render. Ranh giới
     * 元号 là NGÀY chứ không phải năm (令和 bắt đầu 2019-05-01).
     */
    async function setTrtDate(iso: string) {
        const yyyy = Number(iso.slice(0, 4))
        const mm = Number(iso.slice(5, 7))
        const dd = Number(iso.slice(8, 10))
        const row = page.getByText('診療日', { exact: true }).locator('..')
        const boxes = row.getByRole('textbox')
        await expect(boxes.first(), 'không tìm thấy ô 年 của 診療日').toBeVisible({ timeout: 30_000 })

        await row.getByRole('combobox').click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15_000 })
        const eraNames = (await listbox.getByRole('option').allInnerTexts())
            .map((t) => t.trim())
            .filter((t) => t !== '')
        const era = eraOf(yyyy, mm)
        const picked = eraNames.find((n) => n.startsWith(era.name))
        expect(picked, `mst-era không có 元号 ${era.name} (có: ${eraNames.join('/')})`).toBeTruthy()
        await listbox.getByRole('option', { name: picked!, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 15_000 })

        await boxes.nth(0).fill(String(yyyy - era.startYear))
        await boxes.nth(1).fill(String(mm))
        await boxes.nth(2).fill(String(dd))
    }

    /**
     * Về màn danh sách và chờ thanh F-key dựng xong = sẵn sàng nhận F4.
     *
     * `診療日` mặc định là HÔM NAY; `TEST_TRT_DT` trỏ ngày khác thì phải gõ lại,
     * nếu không F4 vẫn hỏi 当日来患 của hôm nay và testcase đo nhầm ngày.
     */
    async function backToPatientList() {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F4"]')).toBeVisible({ timeout: 60_000 })
        if (OVERRIDE_DATE) await setTrtDate(TRT_DT)
    }

    /**
     * Bấm F4 để sang view 当日来患 và chờ response.
     *
     * Query chỉ bay khi `displayView === 'today'` nên phải đăng ký chờ TRƯỚC khi
     * bấm (đúng ghi chú của today-visit-list.spec).
     */
    async function pressF4AndWait() {
        const waiter = page.waitForResponse(
            (r) => TODAY_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: 120_000 },
        )
        await page.keyboard.press('F4')
        await waiter
        await expect(rows(page).first().or(emptyState(page))).toBeVisible({ timeout: 60_000 })
    }

    // ── Các cổng có thể chen ngang chuỗi F8 (copy accounting-target-date) ────
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')

    async function drainSanteiDialogs() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(santei, 2_000))) return
            await page
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    async function drainKarteCmtDialogs() {
        const karte = page.locator('[role="dialog"]').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(karte.first(), 2_000))) return
            await btn(karte.first(), /F10\s*戻る/)
                .first()
                .click()
                .catch(() => {})
        }
    }

    async function pressFKey(fkey: string) {
        await drainSanteiDialogs()
        await drainKarteCmtDialogs()
        await page.keyboard.press(fkey)
    }

    /**
     * Trả lời mọi cổng của chuỗi F8 cho tới khi hết.
     *
     * Khác `settleAccountingDialogs` của accounting-target-date ở một điểm: có
     * thêm nhánh E00100 và ĐẾM số lần thấy nó — đó chính là thứ TC-E00100-5 đo.
     * Thứ tự cổng không cố định nên vẫn là vòng lặp theo "cái nào đang hiện".
     */
    async function settleAccountingDialogs(rounds = 10): Promise<number> {
        let e00100Seen = 0
        for (let i = 0; i < rounds; i++) {
            if (await appeared(e00100().first(), 3_000)) {
                e00100Seen++
                await dismissE00100()
                await expect(e00100()).toHaveCount(0, { timeout: 10_000 })
                continue
            }
            if (await checkGate().isVisible().catch(() => false)) {
                await btn(checkGate(), 'OK').first().click()
                continue
            }
            if (await dirtyGate().isVisible().catch(() => false)) {
                await btn(dirtyGate(), 'No').first().click()
                continue
            }
            if (await dateGate().isVisible().catch(() => false)) {
                await btn(dateGate(), 'OK').first().click()
                continue
            }
            if (await createGate().isVisible().catch(() => false)) {
                await btn(createGate(), /^(No|いいえ)$/).first().click()
                continue
            }
            if (await chgAccGate().isVisible().catch(() => false)) {
                await btn(chgAccGate(), /^(No|いいえ)$/).first().click()
                continue
            }
            if (await nyukinDialog().isVisible().catch(() => false)) {
                await btn(nyukinDialog(), /F10\s*戻る/).first().click()
                continue
            }
            break
        }
        return e00100Seen
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung
     *  theo worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        // ── GET: để đi thật, ghi lại `warnings` của BE, chèn thêm nếu được yêu cầu.
        await page.route(MONTHLY_COPAYMENTS_URL, async (route: Route) => {
            const res = await route.fetch()
            const body = (await res.json()) as {
                data?: { days?: unknown[]; warnings?: BuiPriceWarning[] }
            }
            observed.monthlyHasField = Array.isArray(body.data?.warnings)
            observed.monthlyWarnings = body.data?.warnings ?? []
            if (inject.monthly.length > 0 && body.data) body.data.warnings = [...inject.monthly]
            await route.fulfill({
                status: res.status(),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        })

        await page.route(TODAY_URL, async (route: Route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const body = (await res.json()) as {
                data?: { items?: unknown[]; summary?: { warnings?: BuiPriceWarning[] } }
            }
            observed.todayHasField = Array.isArray(body.data?.summary?.warnings)
            observed.todayWarnings = body.data?.summary?.warnings ?? []
            if (inject.today.length > 0 && body.data?.summary) {
                body.data.summary.warnings = [...inject.today]
            }
            await route.fulfill({
                status: res.status(),
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
        })

        // ── POST GHI: chặn cứng, trả envelope giả (spec không được đụng dữ liệu).
        await page.route(ACC_CLEAR_UNPAID_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { deletedCount: 0 } }),
            })
        })

        await page.route(INSERT_UNPAID_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            // insertedCount 0 + warnings ≠ rỗng = ĐÚNG trạng thái WinForm để lại khi
            // getBuiPrice2 hỏng: guard thấy 0 nên không ghi dòng 未精算 nào.
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    data: {
                        deletedCount: 0,
                        insertedCount: 0,
                        warnings: [...inject.insertUnpaid],
                    },
                }),
            })
        })

        await page.route(ACC_CORRECT_URL, async (route: Route) => {
            if (route.request().method() !== 'POST') return route.fallback()
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { applied: false } }),
            })
        })

    })

    test.afterAll(async () => {
        // Route handler của spec này gọi `route.fetch()`; nếu còn cái nào đang bay
        // khi page đóng thì Playwright báo "Request context disposed" đè lên lỗi
        // thật của testcase.
        await page?.unrouteAll({ behavior: 'ignoreErrors' })
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ── Dữ liệu THẬT: không được có E00100 nào ───────────────────────────────

    test('TC-CLEAN-1 — 診療入力: monthly-copayments CÓ field warnings và nó RỖNG', async () => {
        resetInject()
        await backToEntry()

        // Field phải TỒN TẠI: `?? []` ở FE che mất việc BE không trả warnings, và
        // khi đó mọi testcase E00100 bên dưới pass mà chẳng kiểm gì.
        expect(
            observed.monthlyHasField,
            'response monthly-copayments thiếu hẳn field `warnings` — BE chưa lên bản fail-soft',
        ).toBe(true)

        if (observed.monthlyWarnings.length > 0) {
            console.log(
                'warnings THẬT: ' +
                    observed.monthlyWarnings
                        .map((w) => `患者${w.patNo}/枝番${w.patBr}/${w.trtDt}: ${w.reason ?? '(no reason)'}`)
                        .join(' | '),
            )
        }
        expect(
            observed.monthlyWarnings.length,
            `bệnh nhân ${PAT_NO} ngày ${TRT_DT} có ${observed.monthlyWarnings.length} tháng tính hỏng ` +
                '— xem log phía trên; đây là lỗi DỮ LIỆU hoặc BE, không phải lỗi spec',
        ).toBe(0)

        await expect(e00100(), 'E00100 bật lên dù không có warning nào').toHaveCount(0)
        await step()
    })

    test('TC-CLEAN-2 — F4 当日来患: summary.warnings CÓ mặt và RỖNG', async () => {
        resetInject()
        await backToPatientList()
        await pressF4AndWait()

        expect(
            observed.todayHasField,
            'response /treatment/today thiếu `summary.warnings` — BE chưa lên bản fail-soft',
        ).toBe(true)
        expect(
            observed.todayWarnings.length,
            `ngày ${TRT_DT} có ${observed.todayWarnings.length} bệnh nhân tính hỏng`,
        ).toBe(0)

        await expect(e00100(), 'E00100 bật lên dù không có warning nào').toHaveCount(0)
        await step()
    })

    // ── Chèn warnings: đo nửa FE ─────────────────────────────────────────────

    test('TC-E00100-1 — 日計 footer hỏng: E00100 ĐÚNG văn bản và màn hình VẪN SỐNG', async () => {
        resetInject()
        const w = warn()
        inject.monthly.push(w)

        await backToEntry()

        const seen = await drainE00100(60_000)
        expect(seen.length, 'không thấy E00100 dù response có warnings').toBeGreaterThan(0)
        // So NGUYÊN VĂN: chốt luôn hai điểm lệch WinForm đã quyết — không có dòng
        // 場所[stack trace], và khoảng trắng đầu dòng 2 là 全角 U+3000.
        expect(seen[0]).toContain(expectedBody(w))
        expect(seen[0], 'E00100 in cả stack trace ra trình duyệt — 場所[] phải bị bỏ').not.toContain(
            '場所[',
        )

        // Đây là điều mà lỗi 500 cũ phá: WinForm chỉ bật hộp thoại rồi vẽ
        // 「[負担金 0円][日計 0点]」, lưới vẫn dùng được (modAcc.cs:172-200).
        await expect(
            page.getByText('合計:').first(),
            'lưới 診療入力 biến mất sau E00100 — WinForm chỉ hiện hộp thoại rồi chạy tiếp',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await step()
    })

    test('TC-E00100-2 — 2 warnings = 2 hộp thoại NỐI TIẾP (1 件 1 ダイアログ)', async () => {
        resetInject()
        const a = warn({ patBr: 1, reason: '公費データ不正' })
        const b = warn({ patBr: 2, reason: '介護保険データ不正' })
        inject.monthly.push(a, b)

        await backToEntry()

        // Bất biến cần giữ:
        //   · ĐÚNG 2 hộp cho 2 warning — không gộp lại, và cũng không phát lại;
        //   · không bao giờ có 2 hộp mở cùng lúc (`drainE00100` tự kiểm);
        //   · đúng thứ tự BE trả về, vì WinForm duyệt tuần tự từng dòng hỏng.
        const seen = await drainE00100()

        expect(
            seen.length,
            `2 warning phải ra ĐÚNG 2 hộp thoại, đang ra ${seen.length} — ` +
                'ít hơn là bị gộp, nhiều hơn là bị phát lại (xem `announcedRef` của hook)',
        ).toBe(2)
        expect(seen[0], `hộp thứ nhất phải là 枝番 ${a.patBr}`).toContain(expectedBody(a))
        expect(seen[1], `hộp thứ hai phải là 枝番 ${b.patBr}`).toContain(expectedBody(b))
        await step()
    })

    test('TC-E00100-3 — reason null (prod, không VerboseMessages): BỎ HẲN dòng 内容[]', async () => {
        resetInject()
        const w = warn({ reason: null })
        inject.monthly.push(w)

        await backToEntry()

        const seen = await drainE00100(60_000)
        expect(seen.length, 'không thấy E00100 dù response có warnings').toBeGreaterThan(0)
        expect(seen[0]).toContain(expectedBody(w))
        expect(seen[0], 'còn dòng 内容[] rỗng — phải bỏ cả dòng khi reason null').not.toContain(
            '内容[',
        )
        await step()
    })

    test('TC-E00100-4 — 当日来患: dòng bệnh nhân hỏng VẪN CÒN (khác 来患一覧)', async () => {
        resetInject()
        await backToPatientList()
        await pressF4AndWait()
        const baseline = await rows(page).count()
        skipWithReason(baseline === 0, `ngày ${TRT_DT} không có 当日来患 nào để đo`)
        if (baseline === 0) return

        inject.today.push(warn())
        await backToPatientList()
        await pressF4AndWait()

        expect(
            (await drainE00100(60_000)).length,
            'không thấy E00100 dù summary có warnings',
        ).toBeGreaterThan(0)

        // frm203001.getTodayViewData (frm203001.cs:921-926) GÁN price2.insScore /
        // insCopayment vào chính dòng đó rồi cộng vào 合計 — nghĩa là dòng Ở LẠI với
        // số 0 — vì màn này KHÔNG có guard nào, chứ không phải vì nó 「chọn giữ dòng」.
        // Ở frm204008 (来患一覧) dòng toàn 0 rơi ra ngoài guard 実績あり CÓ SẴN
        // (insScore != 0 || careScore != 0 || jihiPrice != 0, frm204008.cs:731-733), nên
        // dòng hỏng MỘT PHẦN vẫn ở lại. Cả hai màn đều không quyết định gì về failure —
        // ĐỪNG 「đồng bộ」 chúng.
        expect(
            await rows(page).count(),
            'dòng bị loại khỏi 当日来患 khi tính hỏng — WinForm giữ dòng và ghi 0',
        ).toBe(baseline)
        await step()
    })

    test('TC-E00100-6 — 福祉医療設定データが存在しません: thân KHÁC HẲN, KHÔNG có 内容[]/場所[]', async () => {
        resetInject()
        const w = welfareWarn()
        inject.monthly.push(w)

        await backToEntry()

        const seen = await drainE00100(60_000)
        expect(seen.length, 'không thấy E00100 dù response có warnings').toBeGreaterThan(0)

        // Đây là thân E00100 THỨ HAI của WinForm (buiPrice.cs:1731-1737). Trước nhánh
        // `fix/buiprice-e00100-parity-single-callers` bản web BỎ HẲN nó —
        // `BuiPriceService.cs` chỉ để lại comment 「legacy shows an error dialog … no UI
        // here」 rồi đi tiếp, nên người dùng không có cách nào biết 福祉医療フラグ nào hỏng.
        //
        // Nguyên văn đã đối chiếu với WinForm THẬT: fla-ui-tests
        // `Tests/BuiPriceE00100/` chạy 2026-09-07 trên bệnh nhân 10 / 診療月 2026-08 đọc
        // ra đúng chuỗi này (README của luồng đó, mục 7).
        expect(seen[0]).toContain(expectedWelfareBody(w))

        // KHÔNG phải một biến thể của `buiPriceFailed`: buiPrice.cs:1731-1737 không bắt
        // ngoại lệ nào nên chẳng có gì để in vào 内容[], và 場所[] thì bản web không bao
        // giờ in. Thiếu hai khẳng định này thì một FE dựng nhầm thân vẫn pass.
        expect(seen[0], 'nhánh 福祉医療設定 KHÔNG được có dòng 内容[]').not.toContain('内容[')
        expect(seen[0], 'không bao giờ gửi stack trace ra trình duyệt').not.toContain('場所[')
        expect(
            seen[0],
            'đang dựng nhầm sang thân của nhánh ngoại lệ — kiểm `kind` trong ' +
                'use-bui-price-warnings.ts',
        ).not.toContain(BUI_PRICE_FAILED_HEAD)

        // WinForm chỉ hiện hộp thoại rồi vá `localFlg` mặc định và TÍNH TIẾP — khác hẳn
        // nhánh ngoại lệ vốn trả về số 0. Đo trên WinForm: 日計 và 合計 y hệt lúc dữ liệu
        // sạch. Nên màn hình phải còn nguyên.
        await expect(
            page.getByText('合計:').first(),
            'lưới 診療入力 biến mất sau E00100 — nhánh này thậm chí không dừng phép tính',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await step()
    })

    test('TC-E00100-7 — trộn HAI loại: 2 hộp, mỗi hộp một thân, vẫn 1 件 1 ダイアログ', async () => {
        resetInject()
        const thrown = warn({ patBr: 1, reason: '公費データ不正' })
        const welfare = welfareWarn({ patBr: 2, welfareFlg: '81239998' })
        inject.monthly.push(thrown, welfare)

        await backToEntry()

        const seen = await drainE00100()

        // Độ hạt 「1 件 1 ダイアログ」 phải giữ nguyên khi HAI loại trộn lẫn — gộp lại là
        // mất cả 患者番号/枝番 lẫn việc phân biệt hai nguyên nhân.
        expect(
            seen.length,
            `2 warning khác LOẠI phải ra ĐÚNG 2 hộp thoại, đang ra ${seen.length}`,
        ).toBe(2)

        // Đúng thứ tự BE trả về, và mỗi hộp mang ĐÚNG thân của loại mình.
        expect(seen[0], 'hộp thứ nhất phải là nhánh ngoại lệ').toContain(expectedBody(thrown))
        expect(seen[1], 'hộp thứ hai phải là nhánh 福祉医療設定').toContain(
            expectedWelfareBody(welfare),
        )
        expect(seen[1], 'hộp 福祉医療設定 không được mang 福祉医療フラグ của hộp kia').toContain(
            '福祉医療フラグ[81239998]',
        )
        await step()
    })

    test('TC-E00100-5 — F8: E00100 rồi VẪN sang 窓口精算 dù không ghi dòng 未精算 nào', async () => {
        resetInject()
        inject.insertUnpaid.push(warn())

        await backToEntry()
        await pressFKey('F8')

        const seen = await settleAccountingDialogs()
        expect(
            seen,
            'chuỗi F8 không hiện E00100 dù insert-unpaid trả warnings — ' +
                'announceBuiPriceWarnings chưa được gắn vào nhánh này',
        ).toBeGreaterThan(0)

        // ĐÂY là quyết định parity của nhánh: WinForm không có nhánh lỗi trong
        // modAcc.cs:626-707 — guard thấy 0 nên không ghi dòng nào, NHƯNG
        // IDM_Acc_Click vẫn showForm(ID204002). Bản web trước đây toast lỗi rồi
        // `return false`, tức là dựng thêm một lớp chặn WinForm không có.
        await expect(
            page,
            'E00100 xong mà không sang 窓口精算 — đang chặn chuỗi F8, WinForm thì đi tiếp',
        ).toHaveURL(/\/counter-payments\//, { timeout: 30_000 })
        await step()
    })
})
