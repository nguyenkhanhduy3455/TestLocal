import { expect, test, type Page } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — 一括 診療チェック (F3/F8 → `Check.getCheckAnswer`) đọc KẾT QUẢ THẬT từ BE.
 *
 * ─── Vì sao có file này ───────────────────────────────────────────────────────
 * `treatment-table-handler.spec.ts` TC-8..TC-11 CHẶN `POST /tenant/treatment/check`
 * bằng `page.route` và trả 12 lỗi giả — cố ý, vì nó chỉ đo chuyện cuộn panel. Hệ quả
 * là toàn bộ `CheckRulesService.RunAsync` (~690 dòng + 12 luật) trước nay KHÔNG có
 * một dòng assert nghiệp vụ nào ở tầng e2e. File này lấp đúng chỗ đó: KHÔNG mock,
 * đọc thẳng nội dung panel.
 *
 * Trọng tâm là 月次チェック — 5 luật chạy MỘT LẦN mỗi 処置月, SAU vòng lặp từng dòng
 * (Check.cs:1232-1301). Unit test C# đã khoá phần TÍNH của từng luật; thứ chỉ e2e mới
 * chạm được là tầng ráp nối: có được gọi không, gọi mấy lần, và cái `return` sớm ở
 * giữa chuỗi có cắt đúng phần sau không.
 *
 * ─── Nguồn WinForm (src/OCHACOM/COMMON/Lib/Check.cs) ─────────────────────────
 *   :1235  Chk10_4_Cmn    スケーリング全ブロック終了      → SetErrorMsg(10)
 *   :1241  Chk_Buidis_Cmn 当月部位病名                   → SetErrorMsg(11) + **return**
 *   :1253  Chk_6000_Cmn   Ｐ病名Ｇ病名重複                → SetErrorMsg(15)
 *   :1261  Chk_338_Cmn    欠損病名とＰ病名重複            → SetErrorMsg(16)
 *   :1269  Chkrol999_Cmn  1初診内スケーリング回数超過      → SetErrorMsg(19)
 *   :1279  Chk10_5_Cmn    SRP/PCur全歯終了                → SetErrorMsg(27)/(29)
 *
 * Hai điểm dễ port sai, và là lý do chính của file này:
 *   1. `Chk_Buidis_Cmn` bắn thì WinForm `return` NGAY (:1246) — 4 luật sau bị bỏ.
 *      Port thiếu chỗ này thì người dùng thấy thừa cảnh báo mà không ai biết.
 *   2. `Chkrol999_Cmn` ở F8 chạy MỘT LẦN cho cả tháng, không có dòng hiện hành
 *      (:1269) — khác hẳn đường 行単位, nơi nó chạy mỗi dòng sau cổng 165/(0|1)
 *      (:1441). Port nhầm thành per-row thì một tháng có N dòng スケーリング sẽ ra
 *      N cảnh báo giống hệt nhau.
 *
 * ─── GIỚI HẠN đã đo, đừng mất công thử lại ───────────────────────────────────
 * Ba luật 月次 còn lại — Ｐ病名Ｇ病名重複 (:1253), 欠損病名とＰ病名重複 (:1261) và
 * スケーリング全ブロック / SRP全歯 (:1235/:1279) — KHÔNG lái được từ file này, vì tất cả
 * đều đọc `bui` (+ `dis_cd`) CỦA TỪNG DÒNG.
 *
 * `seedTreatmentRows` ghi thẳng `trn_trn`, nhưng lưới KHÔNG đọc 部位・病名 từ đó: nó
 * dựng lại chúng từ 部位病名行 đứng trên trong cùng ngày (`buildSaveRowsIndexed`,
 * treatment-grid-rows.ts). Dòng seed không có 部位病名行 nào phía trên nên payload F3
 * mang `bui` toàn 0 và `disCd` rỗng — TC-BASE in con số đó ra mỗi lần chạy để ai đọc
 * log cũng thấy ngay. Muốn phủ nốt thì phải seed được 部位病名行, là một mảng hạ tầng
 * riêng. Hiện chúng nằm ở `MonthlyCheckRulesTests` (unit, phía API).
 *
 * ─── Dữ liệu ─────────────────────────────────────────────────────────────────
 * Seed qua `seedTreatmentRows` (vùng `disp_no >= SEED_DISP_BASE`, idempotent, dọn ở
 * afterAll). Spec KHÔNG bấm F9 nên KHÔNG cần `TEST_ALLOW_SAVE` — không dòng thật nào
 * bị đụng tới.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = Number(process.env.TEST_PAT_NO ?? '12138')

/**
 * Tháng test = tháng hiện hành.
 *
 * Bệnh nhân PHẢI có sẵn dòng thật mang 病名 ở tháng này, nếu không `Chk_Buidis_Cmn`
 * bắn và cắt mất Chkrol999. TC-BASE assert đúng điều kiện đó, nên giả định hỏng sẽ
 * đỏ ngay ở testcase đầu kèm lời giải thích, chứ không đỏ mơ hồ ở TC sau.
 */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/**
 * Tháng RỖNG (không có dòng thật nào) — chỉ TC-BUIDIS dùng.
 *
 * `Chk_Buidis_Cmn` chỉ bắn khi CẢ THÁNG không có `dis_cd` nào khác 0. Ở tháng hiện
 * hành bệnh nhân đã có dòng thật mang 病名 nên không dựng được tình huống đó; phải
 * mượn một tháng trống. Mặc định = tháng sau tháng test.
 */
const EMPTY_MONTH_DT =
    process.env.TEST_EMPTY_MONTH_DT ??
    (() => {
        const d = new Date(`${TRT_DT}T00:00:00`)
        const n = new Date(d.getFullYear(), d.getMonth() + 1, 15)
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-15`
    })()

/** スケーリング 165-1 — cổng của Chkrol999 là trt_cd 165 && trt_sb ∈ {0,1}. */
const SCALING_CD = 165
const SCALING_SB = 1
const SCALING_PT = 72
const SCALING_NM = 'ｽｹｰﾘﾝｸﾞ'

/** 歯科初診料 — dòng 保険 vô hại, để tháng chắc chắn có 処置点数 (jihi_flg 0 && price > 0). */
const VISIT_CD = 1
const VISIT_SB = 0
const VISIT_PT = 272
const VISIT_NM = '歯科初診料'

// ── Văn bản WinForm, nguyên văn (Check.cs:6585-6665) ─────────────────────────
const MSG_SCALING_BLOCKS = 'スケーリングが全ブロック終了していません。'
const MSG_BUIDIS = '当月に部位・病名がない可能性があります。確認してください。'
const MSG_PG_OVERLAP = 'P病名とG病名が重複しています。'
const MSG_MISSING_TOOTH = '欠損病名とP病名が重複しています。'
const MSG_ROL999 = '1初診内でｽｹｰﾘﾝｸﾞの回数がﾌﾞﾛｯｸ数を超えています。'

/** Mọi câu 月次 — dùng để chốt mốc ở TC-BASE. */
const MONTHLY_MSGS = [
    MSG_SCALING_BLOCKS,
    MSG_BUIDIS,
    MSG_PG_OVERLAP,
    MSG_MISSING_TOOTH,
    MSG_ROL999,
] as const

const CHECK_LIST_LABEL = '処置データチェック エラー一覧'
/** RegExp chứ không phải glob — `/check` không được kéo theo `/check-single`. */
const CHECK_URL = /\/tenant\/treatment\/check(\?|$)/
const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

// GUIDELINE Rule 18 — skip cấp file phải NÓI LÝ DO ra stdout.
if (!dbEnabled) {
    console.log(
        'SKIP tests/trn-chk-sweep.spec.ts — thiếu TEST_DB=1 (spec seed 処置行 để dựng tình ' +
            'huống 月次チェック).\n  TEST_DB=1 npx playwright test tests/trn-chk-sweep.spec.ts',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 処置行 cho 一括 診療チェック')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 一括 診療チェック: 月次チェック đọc kết quả THẬT từ BE', () => {
    let page: Page
    let step: () => Promise<void>

    /** Các dòng payload của lần bấm F3 gần nhất — để chẩn đoán khi assert đỏ. */
    let lastCheckRows: Array<Record<string, unknown>> = []

    const f3Button = () => page.locator('button[data-fkey="F3"]', { hasText: 'チェック' })
    const checkList = () => page.getByRole('region', { name: CHECK_LIST_LABEL })

    async function openTreatmentScreen(trtDt: string) {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${trtDt}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(
                    page.locator('[data-grid-cell$="|2"]').first(),
                    'Lưới 診療入力 không nạp được dữ liệu',
                ).toBeVisible({ timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT })
                return
            } catch (e) {
                lastErr = e
                console.log(`openTreatmentScreen(${trtDt}): lần ${attempt}/${GRID_LOAD_ATTEMPTS} — nạp lại`)
            }
        }
        throw lastErr
    }

    /**
     * Danh sách message trên panel, đúng thứ tự BE trả.
     *
     * Mỗi dòng lỗi là `<div><span>{i+1}</span><span>{info}</span></div>`
     * (treatment-entry-detail.tsx:5238-5242); dòng cuối 「----- 以上 -----」 chỉ có 1
     * span nên loại được bằng số span.
     */
    async function panelMessages(): Promise<string[]> {
        return checkList().evaluate((el) =>
            Array.from(el.children)
                .filter((d) => d.querySelectorAll('span').length >= 2)
                .map((d) => (d.querySelectorAll('span')[1]?.textContent ?? '').trim()),
        )
    }

    /** Seed → mở màn → bấm F3 → trả danh sách message (và giữ lại payload đã gửi). */
    async function sweep(
        trtDt: string,
        rows: Parameters<typeof seedTreatmentRows>[2],
    ): Promise<string[]> {
        await seedTreatmentRows(PAT_NO, trtDt, rows)
        await openTreatmentScreen(trtDt)
        lastCheckRows = []
        const posted = page
            .waitForRequest((r) => CHECK_URL.test(r.url()) && r.method() === 'POST', {
                timeout: 30_000,
            })
            .catch(() => null)
        await f3Button().click()
        const req = await posted
        if (req) lastCheckRows = (req.postDataJSON()?.rows as typeof lastCheckRows) ?? []
        await expect(checkList(), 'F3 không mở được panel 処置データチェック').toBeVisible()
        await step()
        return panelMessages()
    }

    const count = (msgs: readonly string[], needle: string) =>
        msgs.filter((m) => m.includes(needle)).length

    /** Dòng 保険 vô hại — chỉ để tháng chắc chắn có 処置点数. */
    const visitRow = () => ({
        trtCd: VISIT_CD,
        trtSb: VISIT_SB,
        trtPt: VISIT_PT,
        trtCnt: 1,
        jihiFlg: 0,
        dspTrt: VISIT_NM,
    })

    /** Một dòng スケーリング với 算定回数 cho trước. */
    const scalingRow = (trtCnt: number) => ({
        trtCd: SCALING_CD,
        trtSb: SCALING_SB,
        trtPt: SCALING_PT,
        trtCnt,
        jihiFlg: 0,
        dspTrt: SCALING_NM,
    })

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // SanteiConfirmDialog đến chậm và đè lên mọi click (GUIDELINE Rule 14).
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
    })

    test.afterAll(async () => {
        await page?.close()
        for (const d of [TRT_DT, EMPTY_MONTH_DT]) {
            const n = await deleteTreatmentRows(PAT_NO, d).catch(() => 0)
            console.log(`afterAll: đã xoá ${n} dòng seed của (${PAT_NO}, ${d})`)
        }
    })

    /**
     * TC-BASE — panel đọc BE THẬT, và chốt mốc: với dữ liệu nền + một dòng 保険 vô hại,
     * KHÔNG câu 月次 nào có mặt. Mọi TC sau chỉ thêm ĐÚNG một tình huống, nên câu xuất
     * hiện thêm là do tình huống đó chứ không phải do dữ liệu nền.
     */
    test('TC-BASE — mốc: panel lấy dữ liệu thật, chưa có câu 月次 nào', async () => {
        const msgs = await sweep(TRT_DT, [visitRow()])

        console.log(`TC-BASE: panel có ${msgs.length} message (dữ liệu nền của bệnh nhân)`)

        // Panel sống và KHÔNG bị mock.
        await expect(
            page.getByText(/エラー\s*\d+件|エラーはありません/),
            'panel phải in số lỗi — nếu trống thì BE hoặc đường dẫn panel hỏng',
        ).toBeVisible()

        // Chứng cứ cho khối 「GIỚI HẠN」 ở đầu file: dòng seed lên tới BE với 部位/病名
        // RỖNG, vì lưới dựng lại hai thứ đó từ 部位病名行 chứ không đọc trn_trn. Ngày nào
        // log này khác 0 thì mở khoá được các luật 月次 còn lại.
        for (const r of lastCheckRows.filter((r) => Number(r.trtCd) === VISIT_CD)) {
            const bui = ((r.bui as unknown[]) ?? []).filter((v) => Number(v) !== 0)
            const dis = ((r.disCd as unknown[]) ?? []).filter((v) => Number(v) !== 0)
            console.log(`TC-BASE: dòng seed lên BE với 部位=${bui.length} ô, 病名=${dis.length} mã`)
        }

        for (const m of MONTHLY_MSGS) {
            expect(
                count(msgs, m),
                `dữ liệu nền đã bắn sẵn 「${m}」 — mốc không sạch, các TC sau sẽ pass vì lý do sai. ` +
                    `Nếu là 「${MSG_BUIDIS}」 thì tháng ${TRT_DT} của bệnh nhân ${PAT_NO} không còn ` +
                    `dòng nào mang 病名; đổi TEST_PAT_NO / TEST_TRT_DT. Panel: ${JSON.stringify(msgs)}`,
            ).toBe(0)
        }
    })

    /**
     * TC-ROL999 — Chkrol999 ở F8 chạy MỘT LẦN cho cả tháng (:1269), không phải mỗi dòng.
     *
     * 3 dòng スケーリング × 算定回数 2 = 6 lần, vượt ブロック数 của 部位 đã算定 ⇒ bắn.
     * Thứ được khoá ở đây là SỐ LƯỢNG câu, không phải ngưỡng: port đúng ⇒ ĐÚNG 1 câu;
     * port nhầm sang per-row ⇒ 3 câu giống hệt nhau.
     */
    test('TC-ROL999 — 1初診内スケーリング回数超過 ra ĐÚNG MỘT câu cho cả tháng', async () => {
        const msgs = await sweep(TRT_DT, [visitRow(), scalingRow(2), scalingRow(2), scalingRow(2)])

        expect(
            count(msgs, MSG_ROL999),
            `3 dòng スケーリング phải cho ĐÚNG 1 câu 「${MSG_ROL999}」. ` +
                `0 = luật chưa được đấu nối vào F8; ≥2 = đang chạy per-row thay vì per-month. ` +
                `Panel: ${JSON.stringify(msgs)}`,
        ).toBe(1)
    })

    /**
     * TC-BUIDIS — 当月部位病名 bắn thì CẮT toàn bộ luật phía sau (:1246).
     *
     * Tháng rỗng, dòng seed không mang 病名 ⇒ 「当月に部位・病名がない…」. Cùng tháng đó vẫn
     * có đủ nguyên vật liệu để Chkrol999 nổ (đúng bộ dòng của TC-ROL999), nhưng nó đứng
     * SAU trong chuỗi nên phải im. Đây là testcase duy nhất chứng minh cái `return` giữa
     * chuỗi đã được port.
     */
    test('TC-BUIDIS — 当月部位病名 bắn ⇒ các luật sau nó bị bỏ qua', async () => {
        const msgs = await sweep(EMPTY_MONTH_DT, [
            visitRow(),
            scalingRow(2),
            scalingRow(2),
            scalingRow(2),
        ])

        expect(
            count(msgs, MSG_BUIDIS),
            `tháng không có 病名 nào phải bắn 「${MSG_BUIDIS}」. Nếu 0 thì tháng ` +
                `${EMPTY_MONTH_DT} không rỗng như giả định — đặt TEST_EMPTY_MONTH_DT sang ` +
                `một tháng chưa có dòng nào. Panel: ${JSON.stringify(msgs)}`,
        ).toBe(1)

        expect(
            count(msgs, MSG_ROL999),
            `当月部位病名 đã bắn nên WinForm return ngay (:1246) — 「${MSG_ROL999}」 KHÔNG được ` +
                `xuất hiện dù dữ liệu đủ để nó nổ (TC-ROL999 dựng đúng bộ dòng này và nó CÓ ` +
                `bắn). Panel: ${JSON.stringify(msgs)}`,
        ).toBe(0)
    })
})
