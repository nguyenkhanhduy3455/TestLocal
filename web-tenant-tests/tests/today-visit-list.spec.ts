import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { emptyState, rows, scroller, skeletons } from './virtual-grid'

/**
 * 当日来患一覧 (frm203001, F4) — chế độ lưới thứ BA của màn DANH SÁCH
 * `/treatments` (診療入力（患者選択）). KHÔNG phải dialog: F4 chỉ ĐỔI bộ cột của
 * chính lưới đang đứng, y như WinForm `chgViewType(viewType.today)`.
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-page.tsx:
 *      · State `displayView: 'patInfo' | 'wait' | 'today'` — port của 3 nhánh
 *        `chgViewType`. Mặc định 'wait' (frm203001.cs:189).
 *      · `F4: { label: '当日来患', onPress: () => { setDisplayView('today');
 *        handleExitSearchMode() } }` ⇒ vào view này thì 検索条件 bị vô hiệu hoá
 *        (port của `switchCondItem(false)`).
 *      · Query gate: `useTodayVisitQuery(displayView === 'today' ? trtDtIso : null)`
 *        ⇒ request CHỈ bay khi đang ở view today → phải đăng ký chờ response
 *        TRƯỚC khi nhấn F4.
 *      · `trtDtIso` = ISO của EraDateField 診療日 (mặc định hôm nay). Đổi 診療日
 *        là đổi queryKey ⇒ gọi lại API.
 *      · F9 初/再診 mở /treatments/$patNo với ?trtDt=<ISO>; ở view today lấy dòng
 *        đang chọn, không có thì lấy dòng đầu.
 *  - components/treatment-today-list-table.tsx:
 *      · `title="≪当日来患一覧≫"`, `emptyText="当日の来患がありません"`.
 *      · 10 cột theo `_todayViewItem` của WinForm, id lần lượt:
 *        patNo / dspPatNm / sex / birthDt / insScore / insPrice / accScore /
 *        accClaimAmt / accDiscount / accReceAmt. KHÔNG cột nào tắt sort
 *        (WinForm cũng không gọi `columnSortModeOff` ở nhánh today).
 *      · Dòng 合計 render qua prop `footer` → `data-testid="today-total-row"`,
 *        mỗi ô `total-<id cột>`. Nội dung lấy từ `summary` của BE, KHÔNG tự cộng
 *        ở FE — nên tổng lệch là lỗi BE, không phải lỗi render.
 *      · 氏名 in NGUYÊN VĂN `dspPatNm` của BE: đã kèm '＊' (初診) hoặc U+3000
 *        (再診) ở đầu — port của CASE trong Trntrn.cs:2109.
 *      · 生年月日 format bằng `formatJpEra` → `<chữ cái đầu 元号><2 số>年<2>月<2>日`.
 *  - api/today-visit-api.ts:
 *      · GET /tenant/treatment/today?trtDt=<ISO>&page=1&pageSize=300, nạp trọn
 *        ngày; `summary` lấy từ trang 1.
 *
 * BE (apps/api):
 *  - TreatmentQueries.GetTodayTreatmentAsync: union view_trn_trn_active
 *    (jihi_flg=0, có trn_status của tháng, miraiin_kbn=0) ∪ view_acc_dat_active
 *    (score<>0, lflg=0), INNER JOIN person / insurance / mst_cod(cd_type=12) /
 *    era, LEFT JOIN med_ins_inf / pub_exp_inf / acc_dat. ins_score / ins_price
 *    SELECT ra 0.
 *  - GetTodayTreatmentHandler: lặp từng dòng chạy BuiPriceService
 *    (PriceType.Ins, trtStDt = trtEdDt = 診療日) để ĐIỀN ins_score / ins_price,
 *    rồi cộng lại TotalInsScore / TotalInsPrice cho summary — port của vòng lặp
 *    trong frm203001.getTodayViewData.
 *  - Validator chặn 診療日 TƯƠNG LAI (MustNotBeFuture) → TEST_TRT_DT phải ≤ hôm nay.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (GUIDELINE Rule 10.1) nên login + vào /treatments làm đúng một lần ở
 * beforeAll. Testcase nối tiếp trạng thái, thứ tự CÓ Ý NGHĨA — chạy lẻ một
 * testcase ở giữa bằng `-g` sẽ hỏng. Luôn chạy cả file:
 *   npx playwright test tests/today-visit-list.spec.ts
 *
 * DỮ LIỆU (Rule 18): mặc định KHÔNG dùng hôm nay — hôm nay gần như luôn rỗng và
 * một lần chạy toàn skip trông y hệt một lần pass thật. Spec chạy trên HAI ngày
 * đông bệnh nhân của dataset demo, cả hai đều được kiểm số liệu trong MỘT lần
 * chạy mặc định:
 *   TRT_DT     = 2018-04-20 — 64 người, CÓ 初診 (nhánh marker '＊')
 *   TRT_DT_ALT = 2019-04-25 — 46 người, toàn 再診 (nhánh 初診 = 0)
 * TC-DATE-1 đổi sang ngày thứ hai, TC-ALT-1 kiểm lại số liệu ở đó rồi trả về
 * ngày chính. Đổi bằng TEST_TRT_DT / TEST_TRT_DT_ALT (phải ≤ hôm nay). Dataset
 * khác thì hai ngày này có thể rỗng — khi đó testcase tự skip kèm log.
 *
 * Nhóm TC-DB-* cần TEST_DB=1 (xem tests/db.ts), tự skip khi không bật. Spec này
 * KHÔNG ghi DB — chỉ đọc.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** ISO yyyy-MM-dd theo giờ máy — khớp cách `formatDateIso` của app dựng chuỗi. */
function isoOf(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Tách ISO yyyy-MM-dd thành số, ném ngay nếu env truyền sai định dạng. */
function isoParts(iso: string): { y: number; m: number; d: number } {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
    if (!match) throw new Error(`TEST_TRT_DT phải là ISO yyyy-MM-dd, đang là "${iso}"`)
    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/**
 * 診療日 CHÍNH. Mặc định là một ngày ĐÔNG BỆNH NHÂN của dataset demo, KHÔNG phải
 * hôm nay (GUIDELINE Rule 18): hôm nay gần như luôn rỗng, và một lần chạy toàn
 * skip trông y hệt một lần chạy pass thật. 2018-04-20 có 64 người và trong đó
 * CÓ 初診 — cần thiết để nhánh marker '＊' của TC-ROW-1 được kiểm bằng số thật.
 */
const TRT_DT = process.env.TEST_TRT_DT ?? '2018-04-20'

/**
 * 診療日 THỨ HAI, cũng đông người (46 người, toàn 再診 — bổ sung nhánh
 * 初診 = 0 mà ngày chính không có). TC-DATE-1 đổi sang ngày này rồi TC-ALT-1
 * kiểm lại toàn bộ bất biến số học trên đó, nên hai ngày đều được test thật
 * trong MỘT lần chạy mặc định.
 */
const TRT_DT_ALT = process.env.TEST_TRT_DT_ALT ?? '2019-04-25'

/** Có phải đang xem ngày khác hôm nay không → quyết định có gõ lại EraDateField. */
const OVERRIDE_DATE = TRT_DT !== isoOf(new Date())

const TODAY_URL = /\/tenant\/treatment\/today(\?|$)/

/** id cột theo `columnHelper.accessor(...)` của treatment-today-list-table. */
const COL_IDS = [
    'patNo',
    'dspPatNm',
    'sex',
    'birthDt',
    'insScore',
    'insPrice',
    'accScore',
    'accClaimAmt',
    'accDiscount',
    'accReceAmt',
] as const
type ColId = (typeof COL_IDS)[number]

/** Nhãn header đúng `_todayViewItem` của frm203001 (đã chuẩn hoá NFKC khi so). */
const HEADER_LABELS: Record<ColId, string> = {
    patNo: '患者番号',
    dspPatNm: '氏　　　名',
    sex: '性別',
    birthDt: '生年月日',
    insScore: '保険点数',
    insPrice: '保険負担額',
    accScore: '窓口点数',
    accClaimAmt: '請求金額',
    accDiscount: '減額金額',
    accReceAmt: '入金額',
}

/** 6 cột số của lưới — cũng chính là 6 ô số của dòng 合計. */
const NUMERIC_COLS = [
    'insScore',
    'insPrice',
    'accScore',
    'accClaimAmt',
    'accDiscount',
    'accReceAmt',
] as const
type NumericCol = (typeof NUMERIC_COLS)[number]

/** Hậu tố WinForm gắn vào từng ô của dòng 合計 (`{0:#,0}点` / `{0:#,0}円`). */
const TOTAL_SUFFIX: Record<NumericCol, string> = {
    insScore: '点',
    insPrice: '円',
    accScore: '点',
    accClaimAmt: '円',
    accDiscount: '円',
    accReceAmt: '円',
}

/** Marker 初診 WinForm ghép vào đầu 氏名; 再診 dùng U+3000 (全角スペース). */
const SYOSIN_MARK = '＊'
const SAISIN_MARK = '　'

/** 生年月日: chữ cái đầu của 元号 + 2 số năm/tháng/ngày (formatJpEra). */
const BIRTH_DT_RE = /^.\d{2}年\d{2}月\d{2}日$/

/** Một dòng lưới đã đọc. */
interface GridRow {
    patNo: number
    name: string
    sex: string
    birthDt: string
    values: Record<NumericCol, number>
}

/**
 * 6 ô số của dòng 合計 phải bằng tổng đúng cột đó trên MỌI dòng đang hiển thị.
 * Dùng cho cả hai 診療日 nên tách ra khỏi testcase — summary do BE tính, lệch ở
 * đây là handler cộng sai hoặc summary bị giới hạn theo trang.
 */
function expectTotalsMatchRows(
    gridRows: GridRow[],
    gridTotals: Record<NumericCol, number>,
    where: string,
) {
    for (const col of NUMERIC_COLS) {
        const want = gridRows.reduce((acc, row) => acc + row.values[col], 0)
        expect(
            gridTotals[col],
            `${where}: 合計.${col} (${gridTotals[col]}) ≠ tổng cột trên ${gridRows.length} dòng (${want})`,
        ).toBe(want)
    }
}

/** '1,234' → 1234; '1,234点' → 1234. Ném khi gặp chuỗi lạ để không âm thầm so 0. */
function parseNum(raw: string, where: string): number {
    const s = raw.normalize('NFKC').replace(/[点円\s]/g, '').replace(/,/g, '')
    if (s === '') return 0
    const n = Number(s)
    if (!Number.isFinite(n)) throw new Error(`${where}: ô không phải số: "${raw}"`)
    return n
}

test.describe.configure({ mode: 'serial' })

test.describe('F4 当日来患 — 当日来患一覧 (frm203001)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Toàn bộ dòng đọc ở TC-OPEN-2; các testcase sau dùng lại. */
    let baseline: GridRow[] = []
    /** Dòng 合計 đọc cùng lúc với `baseline`. */
    let totals: Record<NumericCol, number> = {
        insScore: 0,
        insPrice: 0,
        accScore: 0,
        accClaimAmt: 0,
        accDiscount: 0,
        accReceAmt: 0,
    }

    // ── Thao tác dùng lại ────────────────────────────────────────────────────

    /** Vùng lưới của màn danh sách. Không có dialog nào mở nên `page` là đủ. */
    function grid(): Locator {
        return page.getByTestId('virtual-scroll-container')
    }

    function totalRow(): Locator {
        return page.getByTestId('today-total-row')
    }

    /**
     * Nút 検索 của 患者検索条件.
     *
     * `exact: true` là BẮT BUỘC: thanh FKey có nút 「F1 患者検索」, accessible name
     * của nó CHỨA chuỗi '検索' nên match lỏng sẽ trúng 2 phần tử → strict mode
     * violation (GUIDELINE Rule 10.3).
     */
    function searchButton(): Locator {
        return page.getByRole('button', { name: '検索', exact: true })
    }

    /**
     * Bấm F4 và trả về URL của request 当日来患 đã bay.
     *
     * Query gate `enabled: trtDt !== null` + `displayView === 'today'` nên phải
     * đăng ký chờ TRƯỚC khi nhấn phím. FKeyScopeProvider preventDefault F1–F12.
     */
    async function pressF4(): Promise<URL> {
        const res = page.waitForResponse(
            (r) => TODAY_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: 60000 },
        )
        await page.keyboard.press('F4')
        await expect(
            page.getByText('≪当日来患一覧≫'),
            'F4 không đổi lưới sang 当日来患 — displayView có đang nhận giá trị today?',
        ).toBeVisible({ timeout: 30000 })
        const response = await res
        expect(
            response.status(),
            `GET 当日来患 trả ${response.status()} — BE chưa chạy bản có endpoint này? ` +
                '(400 = 診療日 đang ở TƯƠNG LAI, validator MustNotBeFuture chặn)',
        ).toBeLessThan(300)
        return new URL(response.url())
    }

    /**
     * Chờ response 当日来患 CỦA ĐÚNG ngày mong đợi.
     *
     * `setTrtDate` gõ lần lượt 元号 → 年 → 月 → 日, nên trên đường đi có những
     * ngày trung gian hợp lệ (vd 平成30年04月20日 → 平成31年04月20日 → …). Mỗi
     * ngày đó là một queryKey mới ⇒ một request thật. Khớp theo `trtDt` thay vì
     * "response 当日来患 đầu tiên" để không bắt nhầm ngày dở dang.
     */
    function waitForTodayResponse(expected: string) {
        return page.waitForResponse(
            (r) =>
                TODAY_URL.test(r.url()) &&
                r.request().method() === 'GET' &&
                new URL(r.url()).searchParams.get('trtDt') === expected,
            { timeout: 60000 },
        )
    }

    /** Quay về 受付患者一覧 (F5) — dùng để đổi view qua lại. */
    async function pressF5() {
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
    }

    /**
     * Đọc TOÀN BỘ dòng của lưới (virtual hoá → phải cuộn) + dòng 合計.
     * Gom theo `data-testid="row-<patNo>-<patBr>"`, khoá theo chính testid.
     *
     * Mỗi nhịp cuộn đọc bằng ĐÚNG MỘT `evaluateAll`. Bản trước dùng
     * `rows().all()` rồi lặp `getAttribute` / `innerText` trên từng Locator:
     * giữa hai lời gọi đó virtualizer kịp unmount dòng vừa trôi khỏi khung nhìn
     * → `locator.getAttribute` chờ hết 15s ở đúng dòng biên. `evaluateAll` chạy
     * trọn vẹn trong page nên ảnh chụp DOM là nguyên tử.
     */
    async function readAllRows(): Promise<GridRow[]> {
        const sc = scroller(page)
        await expect(sc, 'lưới 当日来患 không render').toBeVisible({ timeout: 30000 })
        await expect(rows(page).first().or(emptyState(page))).toBeVisible({ timeout: 30000 })

        // Ngày KHÔNG có ca nào (mặc định TRT_DT = hôm nay rất hay rơi vào đây):
        // không có gì để cuộn, và vòng lặp dưới chờ `rows().first()` mỗi nhịp
        // nên sẽ treo 15s rồi fail. TC-OPEN-3 mới là chỗ khẳng định empty state.
        if ((await rows(page).count()) === 0) return []

        const map = new Map<string, GridRow>()
        const max = await sc.evaluate((el) => el.scrollHeight - el.clientHeight)
        const STEP_PX = 200

        for (let top = 0; ; top += STEP_PX) {
            const target = Math.min(top, Math.max(max, 0))
            await sc.evaluate((el, t) => {
                el.scrollTop = t
            }, target)
            // Chờ virtualizer vẽ xong nhịp này, KHÔNG dùng sleep (Rule 7).
            await expect(rows(page).first()).toBeVisible({ timeout: 15000 })

            const chunk = await rows(page).evaluateAll((els) =>
                els.map((el) => {
                    const cell = (id: string) =>
                        el.querySelector(`[data-testid="cell-${id}"]`)?.textContent ?? ''
                    return {
                        testId: el.getAttribute('data-testid') ?? '',
                        patNo: cell('patNo'),
                        name: cell('dspPatNm'),
                        sex: cell('sex'),
                        birthDt: cell('birthDt'),
                        insScore: cell('insScore'),
                        insPrice: cell('insPrice'),
                        accScore: cell('accScore'),
                        accClaimAmt: cell('accClaimAmt'),
                        accDiscount: cell('accDiscount'),
                        accReceAmt: cell('accReceAmt'),
                    }
                }),
            )

            for (const raw of chunk) {
                if (raw.testId === '' || map.has(raw.testId)) continue
                const values = {} as Record<NumericCol, number>
                for (const col of NUMERIC_COLS) {
                    values[col] = parseNum(raw[col], `${raw.testId}.${col}`)
                }
                map.set(raw.testId, {
                    patNo: parseNum(raw.patNo, `${raw.testId}.patNo`),
                    name: raw.name,
                    sex: raw.sex.trim(),
                    birthDt: raw.birthDt.trim(),
                    values,
                })
            }
            if (target >= max) break
        }

        // Cuộn về đầu để testcase sau (sort / chọn dòng) bắt đầu từ trạng thái sạch.
        await sc.evaluate((el) => {
            el.scrollTop = 0
        })
        return [...map.values()]
    }

    /** Đọc 6 ô số của dòng 合計. */
    async function readTotals(): Promise<Record<NumericCol, number>> {
        await expect(totalRow(), 'không thấy dòng 合計 (prop footer)').toBeVisible({ timeout: 30000 })
        const out = {} as Record<NumericCol, number>
        for (const col of NUMERIC_COLS) {
            out[col] = parseNum(
                await totalRow().getByTestId(`total-${col}`).innerText(),
                `合計.${col}`,
            )
        }
        return out
    }

    /**
     * Gõ lại 診療日 trên màn danh sách.
     *
     * EraDateField không có aria-label nên bám theo hàng chứa nhãn 診療日:
     * 1 combobox (元号) + 3 textbox (年/月/日) theo đúng thứ tự render.
     */
    async function setTrtDate(iso: string) {
        const { y: yyyy, m: mm, d: dd } = isoParts(iso)
        const row = page.getByText('診療日', { exact: true }).locator('..')
        const boxes = row.getByRole('textbox')
        await expect(boxes.first(), 'không tìm thấy ô 年 của 診療日').toBeVisible({ timeout: 30000 })

        // 元号 lấy từ chính danh sách của app (mst-era) thay vì hardcode.
        await row.getByRole('combobox').click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15000 })
        const eraNames = (await listbox.getByRole('option').allInnerTexts())
            .map((t) => t.trim())
            .filter((t) => t !== '')
        // Ranh giới 元号 là NGÀY chứ không phải năm: 令和 bắt đầu 2019-05-01, nên
        // 2019-04-25 vẫn là 平成31 — chọn theo `yyyy >= 2019` sẽ gõ nhầm 令和1年.
        const era =
            yyyy > 2019 || (yyyy === 2019 && mm >= 5)
                ? '令和'
                : yyyy > 1989 || (yyyy === 1989 && mm >= 1)
                  ? '平成'
                  : '昭和'
        const picked = eraNames.find((n) => n.startsWith(era))
        expect(picked, `mst-era không có 元号 ${era} (có: ${eraNames.join('/')})`).toBeTruthy()
        await listbox.getByRole('option', { name: picked!, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 15000 })

        const eraStart = era === '令和' ? 2018 : era === '平成' ? 1988 : 1925
        await boxes.nth(0).fill(String(yyyy - eraStart))
        await boxes.nth(1).fill(String(mm))
        await boxes.nth(2).fill(String(dd))
        await step()
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
        // Footer F-key strip dựng xong = màn danh sách sẵn sàng nhận F4.
        await expect(page.locator('[data-fkey="F4"]')).toBeVisible({ timeout: 60000 })

        if (OVERRIDE_DATE) {
            console.log(`TEST_TRT_DT=${TRT_DT} → gõ lại 診療日 trước khi bấm F4`)
            await setTrtDate(TRT_DT)
        }
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Mở view ──────────────────────────────────────────────────────────────

    test('TC-OPEN-1 — màn mở ở 受付患者一覧, F4 mới gọi API đúng 診療日', async () => {
        // Mặc định `displayView = 'wait'` (frm203001.cs:189) — nếu view today tự
        // bật thì query gate sai và API sẽ bay ngay khi vào màn.
        await expect(
            page.getByText('≪受付患者一覧≫'),
            'màn /treatments không mở ở 受付患者一覧',
        ).toBeVisible({ timeout: 30000 })
        await expect(
            totalRow(),
            'dòng 合計 của 当日来患 hiện ngay ở view 受付 — nhánh render đang sai',
        ).toHaveCount(0)

        const url = await pressF4()
        expect(
            url.searchParams.get('trtDt'),
            'trtDt gửi lên khác 診療日 đang chọn — view đang lấy ngày từ đâu?',
        ).toBe(TRT_DT)
        // FE nạp TRỌN ngày để sort/tính tổng phía client (api/today-visit-api.ts).
        expect(url.searchParams.get('pageSize'), 'không xin trọn ngày → lưới bị cắt').toBe('300')
        await step()
    })

    test('TC-OPEN-2 — 10 cột đúng nhãn và đúng thứ tự của _todayViewItem', async () => {
        for (const col of COL_IDS) {
            const header = page.getByTestId(`header-${col}`)
            await expect(header, `thiếu cột ${col}`).toBeVisible({ timeout: 15000 })
            expect(
                (await header.innerText()).normalize('NFKC').replace(/[▲▼]/g, '').trim(),
                `nhãn cột ${col} sai`,
            ).toBe(HEADER_LABELS[col].normalize('NFKC').trim())
        }

        // Thứ tự: đọc nguyên hàng header rồi so danh sách id.
        const order = await page
            .getByTestId('table-header-row')
            .locator('[data-testid^="header-"]')
            .evaluateAll((els) =>
                els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^header-/, '')),
            )
        expect(order, 'thứ tự cột KHÁC WinForm _todayViewItem').toEqual([...COL_IDS])

        baseline = await readAllRows()
        totals = await readTotals()
        console.log(`当日来患 ${TRT_DT}: ${baseline.length} dòng`)
        await step()
    })

    test('TC-OPEN-3 — lưới client-side: không skeleton; rỗng thì hiện đúng emptyText', async () => {
        // Cả ngày được nạp vào một mảng client (`rows={sorted}`) ⇒ `getRow` luôn
        // resolve; có skeleton nghĩa là count/getRow bị tính sai.
        await expect(skeletons(page), 'lưới mảng client mà vẫn render skeleton').toHaveCount(0)

        if (baseline.length === 0) {
            await expect(
                emptyState(page),
                'lưới rỗng mà không hiện 当日の来患がありません',
            ).toBeVisible()
            await expect(emptyState(page)).toContainText('当日の来患がありません')
            console.log(
                `当日来患 ngày ${TRT_DT} KHÔNG có ca nào → các testcase số liệu sẽ skip. ` +
                    'Đặt TEST_TRT_DT vào ngày có dữ liệu để test có sức nặng.',
            )
        } else {
            await expect(emptyState(page), 'có dòng mà vẫn hiện empty state').toHaveCount(0)
        }
        await step()
    })

    // ── Dòng 合計 (dgvTotal) ─────────────────────────────────────────────────

    test('TC-TOTAL-1 — ô đầu là 合　計 và ô 氏名 là "N人　（初診：X人　再診：Y人）"', async () => {
        await expect(totalRow()).toBeVisible({ timeout: 30000 })
        expect(
            (await totalRow().getByTestId('total-patNo').innerText()).replace(/\s/g, ''),
            'ô đầu dòng 合計 không phải 合計',
        ).toBe('合計')

        // NFKC hạ full-width về half-width: 「（」→「(」, 「：」→「:」, U+3000 → space.
        // Regex vì thế phải chấp nhận CẢ HAI dạng dấu hai chấm.
        const label = (await totalRow().getByTestId('total-dspPatNm').innerText()).normalize('NFKC')
        const m = /^([\d,]+)人\s*\(初診[:：]([\d,]+)人\s*再診[:：]([\d,]+)人\)$/.exec(label.trim())
        expect(
            m,
            `ô 人数 của dòng 合計 sai định dạng WinForm (frm203001.cs:936): "${label}"`,
        ).not.toBeNull()

        const [total, syosin, saisin] = [m![1]!, m![2]!, m![3]!].map((s) => Number(s.replace(/,/g, '')))
        expect(
            total,
            '人数 tổng ≠ 初診 + 再診 — summary của BE đang đếm hai vế rời nhau',
        ).toBe(syosin! + saisin!)
        expect(
            total,
            `人数 (${total}) khác số dòng lưới (${baseline.length}) — summary và items lệch nhau`,
        ).toBe(baseline.length)
        console.log(`合計: ${total}人 (初診 ${syosin} / 再診 ${saisin})`)
        await step()
    })

    test('TC-TOTAL-2 — 6 ô số của 合計 = tổng đúng cột đó trên MỌI dòng', async () => {
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào để cộng`)
        expectTotalsMatchRows(baseline, totals, TRT_DT)
        await step()
    })

    test('TC-TOTAL-3 — hậu tố 点 / 円 đúng cột (WinForm {0:#,0}点 / {0:#,0}円)', async () => {
        for (const col of NUMERIC_COLS) {
            const raw = (await totalRow().getByTestId(`total-${col}`).innerText()).trim()
            expect(raw, `合計.${col} thiếu hậu tố ${TOTAL_SUFFIX[col]}`).toContain(TOTAL_SUFFIX[col])
        }
        await step()
    })

    // ── Nội dung dòng ────────────────────────────────────────────────────────

    test('TC-ROW-1 — 氏名 mang marker 初診 "＊" / 再診 U+3000 và khớp số của 合計', async () => {
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào`)

        let syosinRows = 0
        for (const row of baseline) {
            const head = row.name.charAt(0)
            expect(
                head === SYOSIN_MARK || head === SAISIN_MARK,
                `患者番号 ${row.patNo}: 氏名 "${row.name}" không bắt đầu bằng '＊' lẫn 全角スペース — ` +
                    'FE đang trim mất marker mà WinForm ghép trong SQL',
            ).toBe(true)
            if (head === SYOSIN_MARK) syosinRows++
        }

        const label = (await totalRow().getByTestId('total-dspPatNm').innerText()).normalize('NFKC')
        const m = /初診[:：]([\d,]+)人/.exec(label)
        expect(m, `không đọc được 初診 từ dòng 合計: "${label}"`).not.toBeNull()
        expect(
            Number(m![1]!.replace(/,/g, '')),
            'số dòng có marker ＊ khác 初診 của summary — hai chỗ đang đọc syosin_flg khác nhau',
        ).toBe(syosinRows)
        console.log(`marker ＊: ${syosinRows}/${baseline.length} dòng`)
        await step()
    })

    test('TC-ROW-2 — 生年月日 đúng dạng 和暦 và 性別 không rỗng', async () => {
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào`)

        for (const row of baseline) {
            expect(
                row.birthDt,
                `患者番号 ${row.patNo}: 生年月日 "${row.birthDt}" không đúng dạng ` +
                    '<元号><NN>年<NN>月<NN>日 (formatJpEra) — mst-era chưa nạp hay format sai?',
            ).toMatch(BIRTH_DT_RE)
            expect(
                row.sex,
                `患者番号 ${row.patNo}: 性別 rỗng — BE join mst_cod (cd_type=12) hụt?`,
            ).not.toBe('')
        }
        console.log(`ví dụ dòng đầu: 生年月日=${baseline[0]!.birthDt}, 性別=${baseline[0]!.sex}`)
        await step()
    })

    test('TC-INS-1 — 保険点数 / 保険負担額 đã được BuiPrice điền, không còn 0 cứng', async () => {
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào`)

        const scored = baseline.filter((r) => r.values.insScore > 0)
        if (scored.length === 0) {
            // Có thể ngày này chỉ toàn ca 自費 — nói rõ là CHƯA kiểm được, đừng để
            // tưởng đã pass (Rule 18). Trước khi port handler thì cột này LUÔN 0.
            console.log(
                `TC-INS-1: cả ${baseline.length} dòng đều có 保険点数 = 0. Hoặc ngày ${TRT_DT} ` +
                    'toàn ca tự費, hoặc GetTodayTreatmentHandler chưa chạy BuiPriceService. ' +
                    'Đặt TEST_TRT_DT vào ngày có ca bảo hiểm để kiểm thật.',
            )
            return
        }

        // 一部負担金 không bao giờ vượt tổng tiền của số điểm đó (点 × 10 円).
        for (const row of scored) {
            expect(
                row.values.insPrice,
                `患者番号 ${row.patNo}: 保険負担額 (${row.values.insPrice}) > 保険点数 × 10 ` +
                    `(${row.values.insScore * 10}) — vế 一部負担金 đang nhân sai tỉ lệ`,
            ).toBeLessThanOrEqual(row.values.insScore * 10)
        }
        console.log(`保険点数 > 0 ở ${scored.length}/${baseline.length} dòng`)
        await step()
    })

    // ── Sort ─────────────────────────────────────────────────────────────────

    test('TC-SORT-1 — cột 患者番号 sort được và sắp tăng dần (WinForm không tắt sort ở view này)', async () => {
        skipWithReason(baseline.length < 2, 'cần ≥ 2 dòng mới kiểm được thứ tự sort')

        const header = page.getByTestId('header-patNo')
        await expect(
            header,
            'cột 患者番号 không sortable — nhánh today của WinForm KHÔNG gọi columnSortModeOff',
        ).toHaveAttribute('aria-sort', 'none')

        await header.click()
        await expect(header, 'click header không chuyển sang ascending').toHaveAttribute(
            'aria-sort',
            'ascending',
        )

        const shown = (await page.getByTestId('cell-patNo').allInnerTexts()).map((t) =>
            parseNum(t, 'sort.patNo'),
        )
        expect(shown, 'sort asc 患者番号 không tăng dần').toEqual([...shown].sort((a, b) => a - b))

        // Sort KHÔNG được đụng vào dòng 合計 (nó nằm ngoài vùng cuộn).
        expect(await readTotals(), 'sort làm đổi dòng 合計').toEqual(totals)
        await step()
    })

    // ── Chuyển view ──────────────────────────────────────────────────────────

    test('TC-VIEW-1 — F4 vô hiệu hoá 検索条件 (port của switchCondItem(false))', async () => {
        await expect(
            searchButton(),
            'đang ở view 当日来患 mà nút 検索 vẫn bấm được — handleExitSearchMode chưa chạy',
        ).toBeDisabled()
        await step()
    })

    test('TC-VIEW-2 — F5 về 受付患者一覧 (mất dòng 合計), F4 vào lại thì gọi API lần nữa', async () => {
        await pressF5()
        await expect(
            totalRow(),
            'về view 受付 rồi mà dòng 合計 của 当日来患 vẫn còn',
        ).toHaveCount(0)
        await step()

        // `staleTime: 0` ⇒ mỗi lần vào lại view là một lần đọc mới, đúng như
        // WinForm gọi getTodayViewData ở MỖI lần bấm F4.
        const url = await pressF4()
        expect(url.searchParams.get('trtDt'), 'vào lại view mà đổi mất 診療日').toBe(TRT_DT)
        await step()
    })

    test('TC-VIEW-3 — F1 患者検索 mở lại 検索条件 và rời khỏi view 当日来患', async () => {
        await page.keyboard.press('F1')
        await expect(page.getByText('≪患者検索一覧≫')).toBeVisible({ timeout: 30000 })
        await expect(
            searchButton(),
            'F1 không mở lại 検索条件',
        ).toBeEnabled()
        await expect(totalRow(), 'sang view 患者検索 mà dòng 合計 còn nguyên').toHaveCount(0)
        await step()

        // Về lại view today cho các testcase sau.
        await pressF4()
        await expect(
            searchButton(),
            'F4 từ view 患者検索 không khoá lại 検索条件',
        ).toBeDisabled()
        await step()
    })

    test('TC-DATE-1 — đổi sang 診療日 thứ hai thì gọi lại API với ngày mới', async () => {
        const res = waitForTodayResponse(TRT_DT_ALT)
        await setTrtDate(TRT_DT_ALT)
        expect(
            (await res).status(),
            'đổi 診療日 mà không có request nào cho ngày mới — queryKey không đổi?',
        ).toBeLessThan(300)
        console.log(`đổi 診療日 ${TRT_DT} → ${TRT_DT_ALT}, API đã gọi lại`)
        await step()
    })

    test('TC-ALT-1 — 診療日 thứ hai: số liệu cũng đúng (không chỉ ngày đầu)', async () => {
        // Ngày chính có 初診 > 0, ngày này toàn 再診 — chạy cả hai trong một lần
        // chạy để hai nhánh của MIN(syosin_flg) đều được kiểm bằng số thật, và
        // để chắc summary không bị dính cache/số liệu của ngày trước.
        const altRows = await readAllRows()
        const altTotals = await readTotals()
        skipWithReason(
            altRows.length === 0,
            `ngày ${TRT_DT_ALT} không có ca nào — đặt TEST_TRT_DT_ALT vào ngày có dữ liệu`,
        )

        expectTotalsMatchRows(altRows, altTotals, TRT_DT_ALT)

        const label = (await totalRow().getByTestId('total-dspPatNm').innerText()).normalize('NFKC')
        const m = /^([\d,]+)人\s*\(初診[:：]([\d,]+)人\s*再診[:：]([\d,]+)人\)$/.exec(label.trim())
        expect(m, `合計 sai định dạng ở ngày ${TRT_DT_ALT}: "${label}"`).not.toBeNull()
        const [total, syosin, saisin] = [m![1]!, m![2]!, m![3]!].map((s) =>
            Number(s.replace(/,/g, '')),
        )
        expect(total, `人数 ngày ${TRT_DT_ALT} khác số dòng lưới`).toBe(altRows.length)
        expect(syosin! + saisin!, '初診 + 再診 ≠ 人数').toBe(total)

        const syosinRows = altRows.filter((r) => r.name.charAt(0) === SYOSIN_MARK).length
        expect(syosinRows, `marker ＊ ngày ${TRT_DT_ALT} không khớp 初診 của summary`).toBe(syosin!)

        expect(
            altRows.some((r) => r.values.insScore > 0),
            `cả ${altRows.length} dòng của ngày ${TRT_DT_ALT} đều có 保険点数 = 0 — ` +
                'BuiPriceService không chạy cho ngày này?',
        ).toBe(true)
        console.log(
            `${TRT_DT_ALT}: ${altRows.length} dòng, 初診 ${syosin} / 再診 ${saisin}, ` +
                `保険点数 > 0 ở ${altRows.filter((r) => r.values.insScore > 0).length} dòng`,
        )
        await step()

        // Trả về ngày chính cho nhóm TC-DB-* / TC-F9-1 (chúng so với `baseline`).
        const back = waitForTodayResponse(TRT_DT)
        await setTrtDate(TRT_DT)
        await back
        await expect(rows(page).first().or(emptyState(page))).toBeVisible({ timeout: 30000 })
        await step()
    })

    // ── Đối chiếu DB ─────────────────────────────────────────────────────────

    test('TC-DB-1 — mọi 患者番号 hiển thị đều nằm trong union trn_trn ∪ acc_dat của ngày', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đọc trn_trn / acc_dat (xem tests/db.ts)')
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào`)

        // Không chép lại toàn bộ chuỗi INNER JOIN của BE (chép = test tự nghiệm
        // chính mình). Union là TRẦN TRÊN: các JOIN phía sau chỉ có thể LOẠI bớt
        // bệnh nhân, không bao giờ thêm — nên đây vẫn bắt được lỗi sai ngày /
        // thiếu nhánh union / lọt ca 自費.
        const { y, m } = isoParts(TRT_DT)
        const sinryoYm = `${y}${String(m).padStart(2, '0')}`

        const union = await withDb(async (c) => {
            const { rows: r } = await c.query<{ pat_no: number }>(
                `SELECT DISTINCT trn.pat_no
                   FROM view_trn_trn_active AS trn
                   INNER JOIN view_trn_status_active AS trn_s
                     ON trn_s.pat_no = trn.pat_no
                    AND trn_s.sinryo_ym = $2
                    AND trn_s.miraiin_kbn = 0
                  WHERE trn.trt_dt = $1::date
                    AND trn.jihi_flg = 0
                  UNION
                 SELECT DISTINCT pat_no
                   FROM view_acc_dat_active
                  WHERE trt_dt = $1::date
                    AND score <> 0
                    AND lflg = 0`,
                [TRT_DT, sinryoYm],
            )
            return new Set(r.map((row) => Number(row.pat_no)))
        })

        for (const row of baseline) {
            expect(
                union.has(row.patNo),
                `患者番号 ${row.patNo} hiện trong lưới nhưng KHÔNG có trong union của ngày ${TRT_DT}`,
            ).toBe(true)
        }
        expect(
            baseline.length,
            `lưới có ${baseline.length} dòng > ${union.size} bệnh nhân của union — đang nhân dòng`,
        ).toBeLessThanOrEqual(union.size)
        console.log(`TC-DB-1: lưới ${baseline.length} dòng / union ${union.size} bệnh nhân`)
    })

    test('TC-DB-2 — 窓口点数 / 請求金額 / 減額金額 / 入金額 khớp acc_dat của ngày', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đọc acc_dat (xem tests/db.ts)')
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào`)

        // BE join acc_dat CHỈ theo pat_no (không kèm pat_br) — y hệt WinForm. Với
        // bệnh nhân có 2 枝番 trong cùng ngày thì tổng acc bị lặp cho từng dòng,
        // nên chỉ đối chiếu các 患者番号 xuất hiện ĐÚNG một dòng.
        const seen = new Map<number, number>()
        for (const row of baseline) seen.set(row.patNo, (seen.get(row.patNo) ?? 0) + 1)
        const singles = baseline.filter((r) => seen.get(r.patNo) === 1).slice(0, 5)
        skipWithReason(singles.length === 0, 'không có 患者番号 nào chỉ xuất hiện một dòng')

        for (const row of singles) {
            const want = await withDb(async (c) => {
                const { rows: r } = await c.query<{
                    score: string
                    claim: string
                    discount: string
                    rece: string
                }>(
                    `SELECT COALESCE(SUM(score), 0)::text     AS score,
                            COALESCE(SUM(claim_amt), 0)::text AS claim,
                            COALESCE(SUM(discount), 0)::text  AS discount,
                            COALESCE(SUM(rece_amt), 0)::text  AS rece
                       FROM view_acc_dat_active
                      WHERE trt_dt = $1::date
                        AND pat_no = $2
                        AND score <> 0`,
                    [TRT_DT, row.patNo],
                )
                const first = r[0]
                if (!first) throw new Error('query acc_dat không trả dòng nào (aggregate luôn có 1)')
                return {
                    accScore: Number(first.score),
                    accClaimAmt: Number(first.claim),
                    accDiscount: Number(first.discount),
                    accReceAmt: Number(first.rece),
                }
            })

            for (const col of ['accScore', 'accClaimAmt', 'accDiscount', 'accReceAmt'] as const) {
                expect(
                    row.values[col],
                    `患者番号 ${row.patNo}: ${col} trên lưới (${row.values[col]}) khác acc_dat (${want[col]})`,
                ).toBe(want[col])
            }
        }
        console.log(`TC-DB-2: đối chiếu ${singles.length} bệnh nhân với acc_dat`)
    })

    // ── F9 (đặt CUỐI vì nó rời khỏi màn danh sách) ───────────────────────────

    test('TC-F9-1 — chọn một dòng rồi F9 mở /treatments/{患者番号} kèm 診療日', async () => {
        skipWithReason(baseline.length === 0, `ngày ${TRT_DT} không có dòng nào để chọn`)

        const firstRow = rows(page).first()
        await expect(firstRow).toBeVisible({ timeout: 30000 })
        const patNo = parseNum(await firstRow.getByTestId('cell-patNo').innerText(), 'F9.patNo')
        await firstRow.click()
        await step()

        await page.keyboard.press('F9')
        await expect(
            page,
            'F9 ở view 当日来患 không mở màn 診療入力 của dòng đang chọn',
        ).toHaveURL(new RegExp(`/treatments/${patNo}(\\?|$)`), { timeout: 60000 })
        expect(
            new URL(page.url()).searchParams.get('trtDt'),
            'F9 không mang 診療日 của màn danh sách sang màn chi tiết',
        ).toBe(TRT_DT)
        await step()
    })
})
