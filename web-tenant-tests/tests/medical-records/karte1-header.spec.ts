import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, GRID_LOAD_TIMEOUT, GRID_RELOAD_TIMEOUT } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { createTestPatient, dropTestPatient, TEST_PAT_NO_BASE } from '../_shared/test-patient'

/**
 * カルテ（１号用紙）印刷 — 頭書き (chart header) — nhóm 1/6 của medical-records.
 *
 * Route `/medical-records/print?patNo=&form=1`, WinForm `frm205002` + `CustomChart`
 * (`CCT/UserControls/CustomChart.cs`, `CCT/Lib/CommonCct.cs`).
 *
 * ─── FACT bám vào source (đổi source thì soát lại assert tương ứng) ───────────────
 *  - components/chart-header-section.tsx
 *      · Màu viền/caption theo loại bảo hiểm = `resolveHeaderAccent` (CustomChart.dspChartData):
 *        ins_kbn 2/9 → xanh `#008000` (Color.Green); 家族 (med_ins_inf.fm_type = 2 và
 *        insurance.medinsinf_no ≠ 0) → đỏ `#ff0000`; còn lại đen. Giá trị ô (TextBox) luôn đen.
 *      · Ngày (生年月日 / 有効期限 / 資格取得) = `WarekiCells`: 元号, 年, 月, 日 là span riêng, số
 *        KHÔNG đệm 0; 有効期限 trống vẫn hiện nhãn 年 月 日.
 *      · Địa chỉ = `splitPatientAddress` (CommonCct 受診者住所設定): dòng 1 = 郵便番号 + 住所1 (半角化),
 *        cắt ở 34 byte Shift_JIS; phần tràn sang dòng 2.
 *      · 電話 = tel1 → tel3 → tel2 (cái đầu tiên không trống).
 *      · 職業 = mst_code cd_type 9 `any_val1` của `insurance.pat_op`.
 *      · 番号欄 (`DigitCells`): nét đậm = viền 1px + inset shadow, tổng 3px mỗi cạnh; ô số font 21px.
 *        公費負担者番号 / 保険者番号 (8 ô): dọc sau ô 2, 4, 7; trên+dưới ở ô 5-7.
 *        受給者番号 (7 ô): dọc sau ô 3, 6, 7; dưới ở ô 7; ô cuối lấn ra cột trống 2px (`DIGIT_COLUMNS`).
 *      · Cỡ chữ: nhãn 12px (9pt), tên 15px (11.25pt) không đậm.
 *  - components/chart-form1-page.tsx: nhãn 患者番号 = chip `≪患者番号：N≫` (text-sm, font-black).
 *  - components/buidis-section.tsx: nhãn trang `<< Page N >>` (không có tổng số trang).
 *
 * ─── Dữ liệu (TEST_DB=1) ─────────────────────────────────────────────────────────
 *  Bệnh nhân test clone từ bệnh nhân mẫu (createTestPatient), rồi UPDATE các cột mà từng testcase
 *  định nghĩa. 郵便番号 lưu nguyên văn `3300852` — màn hiển thị đúng giá trị lưu (không chèn "-").
 *  afterAll xoá hẳn bệnh nhân.
 *
 * ─── Cấu trúc ────────────────────────────────────────────────────────────────────
 *  Testcase NỐI TIẾP trạng thái (serial, một page dùng chung theo worker — Rule 19): chạy lẻ một test
 *  ở giữa có thể fail. Chạy cả file:
 *
 *      npx playwright test tests/medical-records/karte1-header.spec.ts
 */

test.skip(!dbEnabled, 'Cần TEST_DB=1 — spec dựng bệnh nhân test qua Postgres')
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const COVER_FROM = new Date().toISOString().slice(0, 10)
const BIRTH = '1983-04-05' // 昭和58年4月5日 — tháng/ngày một chữ số để lộ việc đệm 0
const QUAL_DT = '2006-05-01' // 平成18年5月1日
const ACCENT_BLACK = 'rgb(0, 0, 0)'
const ACCENT_GREEN = 'rgb(0, 128, 0)' // .NET Color.Green
const ACCENT_RED = 'rgb(255, 0, 0)' // .NET Color.Red
const INS_KBN_SHAHO = 1
const INS_KBN_KOKUHO = 2
const FM_TYPE_HONNIN = 1
const FM_TYPE_KAZOKU = 2
const THICK_PX = 3 // 1px viền + 2px inset shadow
const THIN_PX = 1
const DIGIT_FONT_PX = '21px' // MS UI Gothic 15.75pt
const NAME_FONT_PX = '15px' // MS UI Gothic 11.25pt
const LABEL_FONT_PX = '12px' // MS UI Gothic 9pt
const DIGIT_COLUMNS = 8
const CER_COLUMNS = 7 // 受給者番号

/** 郵便番号 + 住所1 = 8 + 22 + 4 = 34 byte → "3-29" vừa khít, "0-3" tràn xuống dòng 2. */
const POST_CD = '3300852'
const ADD_1 = 'さいたま市大宮区大成町3-290-3'
const LINE_1 = '3300852 さいたま市大宮区大成町3-29'
const LINE_2 = '0-3'

const TEL_1 = '03-1111-1111'
const TEL_2 = '03-2222-2222'
const TEL_3 = '090-3433-9811'

let patNo = 0
let jobCode = 0
let jobName = ''

async function setPatientData(
    person: Record<string, string | number | null>,
    insurance: Record<string, string | number | null>,
    medIns: Record<string, string | number | null>,
): Promise<void> {
    if (patNo < TEST_PAT_NO_BASE) throw new Error(`pat_no ${patNo} ngoài vùng test`)
    const upd = async (
        table: string,
        values: Record<string, string | number | null>,
        client: import('pg').Client,
    ): Promise<void> => {
        const keys = Object.keys(values)
        if (keys.length === 0) return
        const set = keys.map((k, i) => `"${k}" = $${i + 2}`).join(', ')
        await client.query(`UPDATE ${table} SET ${set} WHERE pat_no = $1`, [
            patNo,
            ...keys.map((k) => values[k]),
        ])
    }
    await withDb(async (client) => {
        await upd('person', person, client)
        await upd('insurance', insurance, client)
        await upd('med_ins_inf', medIns, client)
    })
}

/**
 * Mở カルテ１号 của bệnh nhân test, chờ header hiện.
 *
 * Nạp lại tới GRID_LOAD_ATTEMPTS lần: Vite dev server thỉnh thoảng nhả hụt một module nên React
 * không mount — chỉ `goto` lại mới cứu được (cùng chế độ hỏng mà `openTreatmentEntry` xử lý).
 */
async function openKarte1(page: Page): Promise<void> {
    const header = page.getByText('公費負担者番号', { exact: true })
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/medical-records/print?patNo=${patNo}&form=1`, {
            waitUntil: 'domcontentloaded',
        })
        try {
            await expect(header).toBeVisible({
                timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
            })
            return
        } catch (err) {
            lastErr = err
        }
    }
    throw new Error('Header カルテ１号 không hiện sau nhiều lần nạp lại', { cause: lastErr })
}

/**
 * Ô số của một hàng 番号: `count` div đứng ngay sau nhãn. 公費負担者番号 và 受給者番号 nằm chung một
 * grid phẳng nên không thể lấy "mọi anh em sau nhãn".
 */
const digitCells = (label: Locator, count: number) =>
    label.locator(`xpath=following-sibling::div[position() <= ${count}]`)

const styleOf = (loc: Locator, prop: string) =>
    loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop)

interface EdgeWidths {
    top: number
    bottom: number
    /** Tổng bề dày đường biên bên phải ô i (viền phải ô i + shadow + viền trái/shadow ô i+1). */
    boundaryAfter: number[]
    lastRight: number
    fontSize: string
    borderTop: string
}

/** Đọc bề dày từng cạnh = viền + inset shadow (computed style). */
async function readEdges(cells: Locator): Promise<EdgeWidths[]> {
    return cells.evaluateAll((els) => {
        const num = (v: string) => Number.parseFloat(v) || 0
        const parse = (el: Element) => {
            const cs = getComputedStyle(el)
            const shadows = cs.boxShadow === 'none' ? [] : cs.boxShadow.split(/,(?![^(]*\))/)
            let top = 0
            let bottom = 0
            let left = 0
            let right = 0
            for (const s of shadows) {
                if (!s.includes('inset')) continue
                const nums = (s.match(/-?\d+(\.\d+)?px/g) ?? []).map(num)
                const [x = 0, y = 0] = nums
                if (y > 0) top += y
                if (y < 0) bottom += -y
                if (x > 0) left += x
                if (x < 0) right += -x
            }
            return {
                top: num(cs.borderTopWidth) + top,
                bottom: num(cs.borderBottomWidth) + bottom,
                left: num(cs.borderLeftWidth) + left,
                right: num(cs.borderRightWidth) + right,
                fontSize: cs.fontSize,
                borderTop: cs.borderTopWidth,
            }
        }
        const all = els.map(parse)
        return all.map((c, i) => ({
            top: c.top,
            bottom: c.bottom,
            boundaryAfter: [i < all.length - 1 ? c.right + all[i + 1]!.left : c.right],
            lastRight: c.right,
            fontSize: c.fontSize,
            borderTop: c.borderTop,
        }))
    })
}

test.describe('カルテ１号 頭書き — WinForm 表示一致', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        const created = await createTestPatient(COVER_FROM)
        patNo = created.patNo
        console.log(`bệnh nhân test ${patNo} (clone từ ${created.templatePatNo})`)

        await withDb(async (client) => {
            const job = await client.query<{ cd_val: number; any_val1: string }>(
                'SELECT cd_val, any_val1 FROM mst_code WHERE cd_type = 9 ORDER BY cd_val LIMIT 1',
            )
            if (!job.rows[0]) throw new Error('mst_code cd_type=9 (職業) rỗng — không dựng được ca 職業')
            jobCode = job.rows[0].cd_val
            jobName = job.rows[0].any_val1.trim()

            const med = await client.query<{ medinsinf_no: number }>(
                'SELECT medinsinf_no FROM med_ins_inf WHERE pat_no = $1 ORDER BY medinsinf_no LIMIT 1',
                [patNo],
            )
            if (!med.rows[0]) throw new Error('bệnh nhân mẫu không có med_ins_inf — không dựng được 保険証')
            await client.query('UPDATE insurance SET medinsinf_no = $2 WHERE pat_no = $1', [
                patNo,
                med.rows[0].medinsinf_no,
            ])
        })

        await setPatientData(
            {
                pat_birth_dt: BIRTH,
                pat_post_cd: POST_CD,
                pat_add_1_1: ADD_1,
                pat_add_1_2: '',
                pat_tel_1: TEL_1,
                pat_tel_2: TEL_2,
                pat_tel_3: TEL_3,
            },
            {
                pat_nm: 'E2E 太郎',
                pat_kn: 'ｲｰﾂｰｲｰ ﾀﾛｳ',
                birthdate: BIRTH,
                pat_op: String(jobCode),
                ins_kbn: INS_KBN_SHAHO,
            },
            {
                ins_no: '114033',
                ins_mk: '420',
                ins_seq: '956921',
                fm_type: FM_TYPE_HONNIN,
                ins_qual_dt: QUAL_DT,
                ins_exp_dt: null,
                insured_nm: 'E2E 太郎',
            },
        )
        await openKarte1(page)
    })

    test.afterAll(async () => {
        if (patNo >= TEST_PAT_NO_BASE) await dropTestPatient(patNo)
        await releaseSharedPage(page)
    })

    test('日付: 元号/年/月/日 を別セルで、0埋めなしで表示する', async () => {
        const step = makeStep(page)
        const cellOf = (label: string) =>
            page.getByText(label, { exact: true }).locator('xpath=following-sibling::div[1]')

        // textContent: các span đứng sát nhau, không chèn khoảng trắng → 昭和58年4月5日.
        await expect(cellOf('生年月日')).toHaveText('昭和58年4月5日')
        await expect(cellOf('資格取得')).toHaveText('平成18年5月1日')
        // 有効期限 trống: vẫn có nhãn 年 月 日, không có chữ số.
        await expect(cellOf('有効期限')).toHaveText('年月日')
        await step()

        // Nhãn 年・月・日 mang màu viền (CustomLabel → chgBorderColor), số thì không.
        const unit = cellOf('生年月日').getByText('年', { exact: true })
        expect(await styleOf(unit, 'color')).toBe(ACCENT_BLACK) //社保本人 → đen
        await step()
    })

    test('住所: 34バイトで折り返し、住所2は2行目', async () => {
        const step = makeStep(page)
        await expect(page.getByText(LINE_1, { exact: true })).toBeVisible()
        await expect(page.getByText(LINE_2, { exact: true })).toBeVisible()
        await step()

        // 住所1 ngắn (≤34 byte) → 住所2 ở dòng 2 nguyên vẹn, không nối vào dòng 1.
        await setPatientData({ pat_add_1_1: '東京都新宿区', pat_add_1_2: 'ビル３階' }, {}, {})
        await openKarte1(page)
        await expect(page.getByText('3300852 東京都新宿区', { exact: true })).toBeVisible()
        await expect(page.getByText('ビル３階', { exact: true })).toBeVisible()
        await step()

        // 住所1 全角英数 → 半角化 (StrConv Narrow) trước khi đo byte.
        await setPatientData({ pat_add_1_1: 'ＡＢ１ビル', pat_add_1_2: '' }, {}, {})
        await openKarte1(page)
        await expect(page.getByText('3300852 AB1ﾋﾞﾙ', { exact: true })).toBeVisible()
        await step()

        await setPatientData({ pat_add_1_1: ADD_1, pat_add_1_2: '' }, {}, {})
    })

    test('電話: 電話1 → 電話3 → 電話2 の優先順', async () => {
        const step = makeStep(page)
        const telRow = (tel: string) => page.getByText(new RegExp(`^電話\\s*${tel}$`))

        await openKarte1(page)
        await expect(telRow(TEL_1)).toBeVisible()
        await expect(page.getByText(TEL_3, { exact: true })).toHaveCount(0)
        await step()

        await setPatientData({ pat_tel_1: '' }, {}, {})
        await openKarte1(page)
        await expect(telRow(TEL_3)).toBeVisible()
        await step()

        await setPatientData({ pat_tel_3: '' }, {}, {})
        await openKarte1(page)
        await expect(telRow(TEL_2)).toBeVisible()
        await step()

        // Nhãn 電話 mang màu viền.
        const caption = telRow(TEL_2).getByText('電話')
        expect(await styleOf(caption, 'color')).toBe(ACCENT_BLACK)
    })

    test('職業 / 年齢 / 氏名: 名称・才・フォントサイズ', async () => {
        const step = makeStep(page)
        await openKarte1(page)

        // 職業 = tên trong mst_code cd_type 9 (trước đây luôn để trống).
        await expect(page.getByText(jobName, { exact: true })).toBeVisible()
        await step()

        // 年齢 `( 43 才)` — số tuổi tính tại ngày hiện tại.
        const today = new Date()
        const [by, bm, bd] = BIRTH.split('-').map(Number) as [number, number, number]
        let age = today.getFullYear() - by
        if (today.getMonth() + 1 < bm || (today.getMonth() + 1 === bm && today.getDate() < bd)) age -= 1
        await expect(page.getByText(new RegExp(`^\\(\\s*${age}\\s*才\\)$`))).toBeVisible()
        await step()

        // 氏名 15px, không đậm; nhãn 12px.
        const name = page.getByText('E2E 太郎', { exact: true }).first()
        expect(await styleOf(name, 'font-size')).toBe(NAME_FONT_PX)
        expect(await styleOf(name, 'font-weight')).toBe('400')
        expect(await styleOf(page.getByText('保険者番号', { exact: true }), 'font-size')).toBe(
            LABEL_FONT_PX,
        )
    })

    test('枠線色: 社保本人=黒 / 国保=緑 / 家族=赤、値は常に黒', async () => {
        const step = makeStep(page)
        const label = () => page.getByText('保険者番号', { exact: true })
        const value = () => page.getByText('E2E 太郎', { exact: true }).first()
        const colorsOf = async () => ({
            caption: await styleOf(label(), 'color'),
            border: await styleOf(label(), 'border-top-color'),
            value: await styleOf(value(), 'color'),
        })

        await openKarte1(page)
        expect(await colorsOf()).toMatchObject({ caption: ACCENT_BLACK, border: ACCENT_BLACK })
        await step()

        await setPatientData({}, { ins_kbn: INS_KBN_KOKUHO }, {})
        await openKarte1(page)
        const green = await colorsOf()
        expect(green).toMatchObject({ caption: ACCENT_GREEN, border: ACCENT_GREEN })
        expect(green.value, 'ô giá trị (TextBox) luôn đen').not.toBe(ACCENT_GREEN)
        // Nhãn 電話 / 年月日 cũng đổi màu theo (CustomLabel), dấu ○ giới tính thì không.
        expect(
            await styleOf(page.getByText('年', { exact: true }).first(), 'color'),
        ).toBe(ACCENT_GREEN)
        await captureFixedUi(label().locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]'), 'karte1-header-green')
        await step()

        await setPatientData({}, { ins_kbn: INS_KBN_SHAHO }, { fm_type: FM_TYPE_KAZOKU })
        await openKarte1(page)
        expect(await colorsOf()).toMatchObject({ caption: ACCENT_RED, border: ACCENT_RED })
        await step()

        await setPatientData({}, { ins_kbn: INS_KBN_SHAHO }, { fm_type: FM_TYPE_HONNIN })
    })

    test('番号欄: 太線は上下左右とも3px、境界は上下段で揃う', async () => {
        const step = makeStep(page)
        await openKarte1(page)

        const defCells = digitCells(page.getByText('公費負担者番号', { exact: true }), DIGIT_COLUMNS)
        const cerCells = digitCells(page.getByText('の受給者番号'), CER_COLUMNS)
        const insCells = digitCells(page.getByText('保険者番号', { exact: true }), DIGIT_COLUMNS)
        await expect(defCells).toHaveCount(DIGIT_COLUMNS)
        await expect(cerCells).toHaveCount(CER_COLUMNS)
        await expect(insCells).toHaveCount(DIGIT_COLUMNS)

        // 保険者番号 114033 → 右詰め: ['','','1','1','4','0','3','3'].
        await expect(insCells).toHaveText(['', '', '1', '1', '4', '0', '3', '3'])
        await step()

        const thickIdx = new Set([4, 5, 6])
        const thickAfter = new Set([1, 3, 6]) // đường biên sau ô thứ n (0 origin)
        for (const [name, cells] of [
            ['公費負担者番号', defCells],
            ['保険者番号', insCells],
        ] as const) {
            const edges = await readEdges(cells)
            edges.forEach((e, i) => {
                const expectEdge = thickIdx.has(i) ? THICK_PX : THIN_PX
                expect(e.top, `${name} ô ${i + 1} cạnh trên`).toBe(expectEdge)
                expect(e.bottom, `${name} ô ${i + 1} cạnh dưới`).toBe(expectEdge)
                expect(e.borderTop, `${name} ô ${i + 1}: nét đậm không dùng border-*-2`).toBe('1px')
                expect(e.fontSize, `${name} ô ${i + 1} cỡ chữ`).toBe(DIGIT_FONT_PX)
                if (i < DIGIT_COLUMNS - 1) {
                    expect(e.boundaryAfter[0], `${name} đường biên sau ô ${i + 1}`).toBe(
                        thickAfter.has(i) ? THICK_PX : THIN_PX,
                    )
                }
            })
            // Viền phải ngoài cùng của ô cuối: 1px, không đậm.
            expect(edges[DIGIT_COLUMNS - 1]!.lastRight, `${name} mép phải`).toBe(THIN_PX)
        }
        await step()

        // 受給者番号 (7 ô): cạnh dưới đậm ở ô 7, dọc đậm sau ô 3, 6 và ở mép phải ô 7.
        const cer = await readEdges(cerCells)
        expect(cer[6]!.bottom).toBe(THICK_PX)
        expect(cer[2]!.boundaryAfter[0]).toBe(THICK_PX)
        expect(cer[5]!.boundaryAfter[0]).toBe(THICK_PX)
        expect(cer[6]!.lastRight).toBe(THICK_PX)
        await step()

        // Mép phải của ô cuối hàng 受給者番号 trùng đường biên sau ô 7 của hàng trên:
        // ô lấn 2px ra cột trống (margin-right: -2px) nên right(cer[6]) = left(def[7]) + 2.
        const defLast = await defCells.nth(DIGIT_COLUMNS - 1).boundingBox()
        const cerLast = await cerCells.nth(CER_COLUMNS - 1).boundingBox()
        expect(defLast && cerLast).toBeTruthy()
        expect(cerLast!.x + cerLast!.width - defLast!.x).toBeCloseTo(2, 0)
    })

    test('患者番号 chip と ページ表示', async () => {
        const chip = page.getByText(`≪患者番号：${patNo}≫`, { exact: true })
        await expect(chip).toBeVisible()
        expect(await styleOf(chip, 'font-weight')).toBe('900')
        expect(await styleOf(chip, 'font-size')).toBe('14px')
        // Số bệnh nhân không đệm 0 (WinForm: person.patNo là int).
        await expect(page.getByText(new RegExp(`≪患者番号：0+${patNo}≫`))).toHaveCount(0)

        // `<< Page N >>` — không có tổng số trang.
        await expect(page.getByText(/^<< Page \d+ >>$/)).toBeVisible()
        await expect(page.getByText(/Page \d+ \/ \d+/)).toHaveCount(0)
    })
})
