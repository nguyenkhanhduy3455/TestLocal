import { type Locator, type Page } from '@playwright/test'

import { dbEnabled, seedTreatmentRows, withDb } from '../_shared/db'
import { captureFixedUi } from '../_shared/capture'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'
import { createTestPatient, dropTestPatient, nextTestPatNo } from '../_shared/test-patient'

/**
 * 医薬品使用状況 (WinForm frm506011) — màn takeover mở từ 施設基準届出設定 (frm506009)
 * bằng double-click một ô KHÔNG phải ngày của dòng 後発使１/２/３.
 *
 * Fact bám source (apps/web-tenant/src/features):
 *  - facility-standards/components/facility-standards-dialog.tsx: `handleOpenRow` — ô
 *    ngày (data-facility-date-col) mở DatePickerModal, ô khác của dòng có
 *    `opensDrugUsageStatus` (mã 3487/3488/3598) mở DrugUsageStatusScreen. FKeyBar của
 *    dialog bị tắt khi takeover mở ⇒ phím F10 thật chỉ tới takeover.
 *  - drug-usage-status/components/drug-usage-status-screen.tsx: portal ra body,
 *    role="dialog" aria-label="医薬品使用状況"; mở ra lưới RỖNG, focus ở 届出年月
 *    (mặc định tháng hôm nay); 集計 gọi GET /tenant/drug-usage-status?reportMonth=…
 *    rồi hiện 9 dòng: 期間 + 8 dòng BE đã cộng và format "#,0.00".
 *  - BE DrugUsageStatusCalculator: 3 tháng TRƯỚC 届出年月; thuốc phân (a) 後発品,
 *    (b) 先発品 có 後発, (c) 先発品 không 後発 / còn lại; ① = a+b+c, ② = a+b, ③ = a,
 *    ④ = ②/①×100, ⑤ = ③/②×100. Số lượng = 処置変換 med_cnt × 回数, freewd ghi đè.
 *
 * ORACLE: dữ liệu thật của tenant trong 3 tháng đó KHÔNG biết trước ⇒ đo HIỆU giữa
 * hai lần 集計 (trước / sau khi seed bệnh nhân 990000+). Ba 処置 seed, 処置変換 có sẵn
 * trong cnv_treat (1 thuốc / 処置) và mst_drug_generic (migration mst-drug-generic):
 *   628/0 カロナール錠200     med_cnt 1 — generic_dg 1        → (a)
 *   602/0 メイアクトMS錠100mg med_cnt 4 — original 1, with 1 → (b)
 *   608/0 ペングッド錠250mg   med_cnt 6 — original 1, with '' → (c)
 *
 * TIỀN ĐỀ: TEST_DB=1, migration master + tenant của mst_drug_generic đã chạy.
 * Chạy cả file (serial, 1 page chung):
 *   npx playwright test tests/dialogs-management/drug-usage-status.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const TITLE = '医薬品使用状況'
const API_URL = '/tenant/drug-usage-status'
/** Dòng 後発使１ — mst_code cd_type 71, chưa có mst_iin_3 nên key là `cd:<mã>`. */
const GENERIC_USE_1_ROW = 'row-cd:3487'

const LINE_LABELS = [
    '後発医薬品(a)',
    '後発医薬品のある先発医薬品(b)',
    '後発医薬品のない先発医薬品など(c)',
    '全医薬品の規格単位数量(①)',
    '後発医薬品のある先発医薬品及び後発医薬品の規格単位数量(②)',
    '後発医薬品の規格単位数量(③)',
    'カットオフ値の割合(④) (②／①)％',
    '後発医薬品の割合(⑤) (③／②)％',
] as const

/** Cột số theo thứ tự 3ヶ月前 / 2ヶ月前 / 1ヶ月前 / 合計. */
const VALUE_COLS = ['month3', 'month2', 'month1', 'total'] as const

const GENERIC = { trtCd: 628, trtSb: 0 }
const ORIGINAL_WITH_GENERIC = { trtCd: 602, trtSb: 0 }
const ORIGINAL_ONLY = { trtCd: 608, trtSb: 0 }

/**
 * Lượng seed mong đợi theo dòng (a)(b)(c) × tháng [3ヶ月前, 2ヶ月前, 1ヶ月前]:
 *  - 3ヶ月前: カロナール 回数 3 (1×3) + メイアクト 回数 1 (4×1)
 *  - 2ヶ月前: ペングッド 回数 2 (6×2)
 *  - 1ヶ月前: カロナール freewd "2" (ghi đè med_cnt 1 → 2, ×回数 1)
 */
const EXPECTED_DELTA = {
    a: [3, 0, 2],
    b: [4, 0, 0],
    c: [0, 12, 0],
}

type Grid = Record<string, number[]>

const takeover = (page: Page) => page.getByRole('dialog', { name: TITLE })
const facilityDialog = (page: Page) =>
    page.locator('[role="dialog"]').filter({ hasText: '施設基準届出設定' }).first()

/**
 * Lưới 施設基準届出設定 là virtual list: dòng 後発使１ nằm dưới, chưa render ⇒ cuộn từng
 * khung tới khi nó vào DOM.
 */
async function scrollToRow(dialog: Locator, testId: string): Promise<Locator> {
    const row = dialog.getByTestId(testId)
    const scroll = dialog.getByTestId('virtual-scroll-container')
    await expect(dialog.locator('[data-testid^="row-"]').first()).toBeVisible({ timeout: 30_000 })
    for (let i = 0; i < 40 && (await row.count()) === 0; i++) {
        await scroll.evaluate((el) => el.scrollBy(0, el.clientHeight / 2))
        await dialog.page().waitForTimeout(100)
    }
    await row.scrollIntoViewIfNeeded()
    await expect(row).toBeVisible()
    return row
}

/** Ô 0/0 (tháng không có thuốc): WinForm in NaN theo culture ja-JP của .NET Framework. */
const WINFORM_NAN = 'NaN (非数値)'

/** "1,234.56" → 1234.56; WINFORM_NAN → NaN; chữ khác (vd "NaN" trơn) → fail. */
const toNumber = (s: string) => {
    if (s === WINFORM_NAN) return Number.NaN
    const n = Number(s.replace(/,/g, ''))
    if (Number.isNaN(n)) throw new Error(`ô không phải số: "${s}"`)
    return n
}

async function readGrid(root: Locator): Promise<{ period: string[]; lines: Grid }> {
    const rowText = async (key: string) =>
        Promise.all(
            ['kbn', ...VALUE_COLS].map(async (col) =>
                (await root.getByTestId(key).getByTestId(`cell-${col}`).innerText()).trim(),
            ),
        )
    const period = await rowText('row-period')
    const lines: Grid = {}
    for (let i = 0; i < LINE_LABELS.length; i++) {
        const [label, ...values] = await rowText(`row-line-${i}`)
        lines[label!] = values.map(toNumber)
    }
    return { period, lines }
}

/** Bấm 集計 và chờ response; trả về `months` (ISO đầu tháng) BE đã dùng. */
async function runSearch(page: Page): Promise<string[]> {
    const response = page.waitForResponse(
        (r) => r.url().includes(API_URL) && r.request().method() === 'GET',
    )
    await takeover(page).getByRole('button', { name: '集計', exact: true }).click()
    const res = await response
    expect(res.status(), `${API_URL} phải 200 — migration mst_drug_generic đã chạy chưa?`).toBe(200)
    // Envelope ApiResponse { data: … } — FE gỡ bằng unwrapQuery.
    const body = ((await res.json()) as { data: { months: string[] } }).data
    await expect(takeover(page).getByTestId('row-line-7')).toBeVisible()
    return body.months
}

/** `editDateToString(dt, "gggy年M月")` cho tháng thuộc 令和 (đủ cho mọi tháng spec dùng). */
function reiwaMonth(iso: string): string {
    const [y, m] = iso.split('-').map(Number)
    return `令和${y! - 2018}年${m}月`
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

test.describe('医薬品使用状況 (frm506011) — mở từ 施設基準届出設定', () => {
    let page: Page
    let patNo = 0
    let baseline: Grid
    let months: string[] = []

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        await page.goto('/settings/general', { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: '施設基準届出設定', exact: true }).click()
        await scrollToRow(facilityDialog(page), GENERIC_USE_1_ROW)
    })

    test.afterAll(async () => {
        if (patNo) await dropTestPatient(patNo)
        await releaseSharedPage(page)
    })

    test('TC-OPEN: double-click 届出略称 của 後発使１ mở takeover, lưới rỗng, focus 届出年月', async () => {
        const row = await scrollToRow(facilityDialog(page), GENERIC_USE_1_ROW)
        await row.getByTestId('cell-facilityNmAbbr').dblclick()

        const screen = takeover(page)
        await expect(screen).toBeVisible()
        // postInit: lưới trống tới khi bấm 集計.
        await expect(screen.locator('[data-testid^="row-"]')).toHaveCount(0)
        // 選択計 / 総合計 của WinForm bị lưới đè lên, không bao giờ hiện.
        await expect(screen.getByText('選択計：', { exact: true })).toHaveCount(0)
        await expect(screen.getByText('総合計：', { exact: true })).toHaveCount(0)
        // dtSum.Focus(): WarekiDateField.focus() đặt focus vào combobox 元号 (một <button>).
        await expect(screen.locator('[aria-label="元号"]')).toBeFocused()
    })

    test('TC-BASELINE: 集計 tháng mặc định — 期間 + 8 dòng đúng nhãn', async () => {
        months = await runSearch(page)
        expect(months).toHaveLength(3)

        const grid = await readGrid(takeover(page))
        const [m3, m2, m1] = months.map(reiwaMonth)
        expect(grid.period).toEqual(['期間', m3, m2, m1, `${m3}～${m1}の合計`])
        expect(Object.keys(grid.lines)).toEqual([...LINE_LABELS])
        baseline = grid.lines
    })

    test('TC-SUM: seed 3 処置 cho bệnh nhân test — hiệu (a)(b)(c) và ①～⑤ đúng công thức', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để seed bệnh nhân 990000+')

        patNo = await nextTestPatNo()
        const day15 = (iso: string) => `${iso.slice(0, 8)}15`
        await createTestPatient(months[0]!, { patNo })
        await seedTreatmentRows(patNo, day15(months[0]!), [
            { ...GENERIC, trtCnt: 3, dspTrt: 'e2e カロナール' },
            { ...ORIGINAL_WITH_GENERIC, trtCnt: 1, dspTrt: 'e2e メイアクト' },
        ])
        await seedTreatmentRows(patNo, day15(months[1]!), [
            { ...ORIGINAL_ONLY, trtCnt: 2, dspTrt: 'e2e ペングッド' },
        ])
        await seedTreatmentRows(patNo, day15(months[2]!), [
            { ...GENERIC, trtCnt: 1, freewd: '2', dspTrt: 'e2e カロナール freewd' },
        ])
        await withDb(async (c) => {
            // bt_dt_1/2 = năm/tháng áp dụng 処置変換 (dữ liệu thật luôn = tháng 診療).
            await c.query(
                `UPDATE trn_trn SET bt_dt_1 = extract(year FROM trt_dt), bt_dt_2 = extract(month FROM trt_dt)
                  WHERE pat_no = $1`,
                [patNo],
            )
            // Bỏ trn_status clone từ bệnh nhân mẫu; mỗi tháng đúng 1 dòng 保険 / 来院.
            await c.query(`DELETE FROM trn_status WHERE pat_no = $1`, [patNo])
            await c.query(`DELETE FROM trn_status_deleted WHERE pat_no = $1`, [patNo])
            for (const iso of months) {
                const ym = iso.slice(0, 7).replace('-', '')
                await c.query(
                    `INSERT INTO trn_status (pat_no, pat_sb, sinryo_ym, seikyu_ym, miraiin_kbn, jihi_flg, receipt_ym)
                     VALUES ($1, 1, $2, $2, 0, 0, $2)`,
                    [patNo, ym],
                )
            }
        })

        const after = await runSearch(page)
        expect(after, 'tháng 集計 không được đổi giữa hai lần').toEqual(months)
        const { lines } = await readGrid(takeover(page))

        const delta = (label: string) => lines[label]!.map((v, i) => v - baseline[label]![i]!)
        const withTotal = (xs: number[]) => [...xs, sum(xs)]
        const close = (actual: number[], expected: number[], what: string) =>
            actual.forEach((v, i) => {
                const msg = `${what} [${VALUE_COLS[i]}] = ${v}, mong ${expected[i]}`
                // 0/0 (tháng không có ② hay ①) hiện "NaN" như float của WinForm.
                if (Number.isNaN(expected[i])) expect(v, msg).toBeNaN()
                else expect(Math.abs(v - expected[i]!), msg).toBeLessThan(0.011)
            })

        close(delta(LINE_LABELS[0]), withTotal(EXPECTED_DELTA.a), '(a)')
        close(delta(LINE_LABELS[1]), withTotal(EXPECTED_DELTA.b), '(b)')
        close(delta(LINE_LABELS[2]), withTotal(EXPECTED_DELTA.c), '(c)')

        // ①②③ là tổng của (a)(b)(c) ĐÃ HIỂN THỊ — kiểm trên giá trị sau seed.
        const [a, b, c] = [lines[LINE_LABELS[0]]!, lines[LINE_LABELS[1]]!, lines[LINE_LABELS[2]]!]
        close(lines[LINE_LABELS[3]]!, a.map((v, i) => v + b[i]! + c[i]!), '①')
        close(lines[LINE_LABELS[4]]!, a.map((v, i) => v + b[i]!), '②')
        close(lines[LINE_LABELS[5]]!, a, '③')

        const one = lines[LINE_LABELS[3]]!
        const two = lines[LINE_LABELS[4]]!
        const three = lines[LINE_LABELS[5]]!
        close(lines[LINE_LABELS[6]]!, two.map((v, i) => (v / one[i]!) * 100), '④')
        close(lines[LINE_LABELS[7]]!, three.map((v, i) => (v / two[i]!) * 100), '⑤')

        await captureFixedUi(page, 'drug-usage-status-after-sum')
    })

    test('TC-BACK: F10 戻る đóng takeover, 施設基準届出設定 vẫn mở', async () => {
        await page.keyboard.press('F10')
        await expect(takeover(page)).toHaveCount(0)
        await expect(facilityDialog(page).getByTestId(GENERIC_USE_1_ROW)).toBeVisible()
        await captureFixedUi(facilityDialog(page), 'drug-usage-status-back-to-facility')
    })
})
