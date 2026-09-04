import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, receiptTypeInputsFor, type ReceiptTypeInputs } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { emptyState, rows, scroller, skeletons } from './virtual-grid'

/**
 * 来患一覧 (frm204008) — cột レセプト種別 và cách màn hình chịu lỗi tính
 * 一部負担金. Route `/counter-payments/visit-list`, KHÔNG phải dialog.
 *
 * Spec này sinh ra từ một bug thật: cột レセプト種別 bị cho là "luôn null" (một
 * comment TODO cũ trong BE nói vậy), và khi soát lại thì lộ ra bug KHÁC ở đúng
 * cột đó — `buiPrice.getReceiptType` (buiPrice.cs:1563) ghi 単独 ngược lại vào
 * `patInfoData.ins.combi_kbn`. WinForm lấy lại patInfo cho TỪNG dòng
 * (frm204008.cs:711) nên ghi đè không lan; bản web dùng lại một instance
 * `Insurance` xuyên các ngày nên một ngày không có 公費 kéo mọi ngày sau
 * xuống 単独.
 *
 * ── FACT bám theo source (Rule 21) ──────────────────────────────────────────
 *  - routes/_authenticated/counter-payments_.visit-list.tsx
 *      · Route `/counter-payments/visit-list`, render `PatientVisitListPage`.
 *  - components/patient-visit-list-filter-panel.tsx
 *      · 診療年月 là `EraDateField mode="month"` ⇒ CHỈ 1 combobox 元号 + 2 textbox
 *        (年, 月). Không có ô 日 — khác `setTrtDate` của today-visit-list.spec.
 *      · 初診/再診/訪問診療 mặc định CHECKED cả ba; nút `検索` có aria-label 検索.
 *      · `disabled={eras.length === 0}` ⇒ phải chờ mst-era xong mới gõ được.
 *  - components/patient-visit-list-table.tsx
 *      · 12 cột đúng `_viewItem` của frm204008, id theo thứ tự:
 *        patNo / patNm / rcpTypeNm / trtDt / syosinLabel / insScore / insPrice /
 *        careScore / carePrice / jihiPrice / jihiTax / priceTotal.
 *      · CHỈ patNo + patNm sortable (`SORT_COMPARATORS`) — xem chú thích ở
 *        SORTABLE_COLS: đây là hành vi của web, KHÁC WinForm; mọi cột khác
 *        `enableSorting: false` ⇒ header của chúng KHÔNG có `aria-sort`
 *        (sort-header-dom.ts:43). レセプト種別 nằm trong nhóm không sort.
 *      · `title="来患一覧"`, `emptyText="対象データがありません"`.
 *  - lib/patient-visit-list-row-grouping.ts
 *      · Banding phân cấp port `IsTheSameCellValue`: `rcpTypeSame = patNmSame &&
 *        prev.rcpTypeNm === row.rcpTypeNm` ⇒ レセプト種別 chỉ bị bỏ trắng khi
 *        患者番号 VÀ 氏名 VÀ chính nó đều lặp lại dòng ngay trên.
 *      · ⇒ Banding chính là MÁY DÒ cho bug combi_kbn: nếu 種別 của cùng một
 *        bệnh nhân đổi giữa hai ngày, ô sẽ HIỆN LẠI ở dòng thứ hai thay vì
 *        trắng. TC-BAND-1 bắt đúng dấu hiệu đó.
 *      · `trtDtDisplay` = NGÀY trong tháng (row2["day"] của WinForm), không phải
 *        ngày đầy đủ.
 *      · Dòng 合計 có patNo/trtDt = null → `isPatientVisitListVisitRow` = false.
 *  - api/patient-visit-list-api.ts
 *      · GET /tenant/settlement/visit-list?sinryoYm=yyyyMM&syosin=&saisin=&houmon=
 *      · Envelope `{ data: { rows, warnings } }`.
 *  - components/patient-visit-list-page.tsx + locales/ja.ts
 *      · Mỗi phần tử `warnings` bật MỘT `alertDialog` nối tiếp, nội dung
 *        `一部負担金計算に失敗しました。患者登録データを確認してください。`
 *        (port E00100 của buiPrice.cs:196-203).
 *
 * BE (apps/api):
 *  - GetPatientNosForMonthAsync: `SELECT DISTINCT pat_no FROM
 *    view_trn_status_active WHERE sinryo_ym = @SinryoYm`.
 *  - GetPatientVisitListHandler: mỗi (bệnh nhân × ngày) gọi BuiPriceService
 *    (PriceType.All). Dòng nào ném thì bị loại và đẩy vào `warnings`.
 *  - BuiPriceService.GetReceiptType: port buiPrice.cs:1502-1602 — xem
 *    `expectedReceiptType` bên dưới, spec TỰ TÍNH lại theo luật WinForm chứ
 *    không chép port.
 *
 * ── PHẠM VI: cái spec này KHÔNG bắt được ────────────────────────────────────
 * Kịch bản chính xác của bug combi_kbn cần một bệnh nhân `combi_kbn = 2` có
 * 公費 với `qualification_date` rơi GIỮA tháng và có ngày khám ở CẢ HAI phía
 * mốc đó. Đã dò dataset demo bằng SQL: KHÔNG có bản ghi nào như vậy (0 dòng).
 * Nên bug đó được chốt bằng unit test .NET
 * `BuiPriceServiceReceiptTypeTests.ReceiptType_PublicExpenseStartingMidMonth_
 * KeepsCombinationOnLaterDay`, còn spec này giữ BẤT BIẾN quan sát được qua UI
 * (TC-RCP-3 / TC-BAND-1): 種別 của một bệnh nhân phải GIỐNG NHAU ở mọi ngày.
 * Nếu sau này dataset có ca 公費 giữa tháng thì TC-BAND-1 sẽ đỏ ngay khi bug
 * quay lại — không cần sửa spec.
 *
 * CHẠY TUẦN TỰ (`describe.serial`), dùng CHUNG một page: app giới hạn số lần
 * login (Rule 10.1). Testcase nối tiếp trạng thái ⇒ chạy lẻ bằng `-g` sẽ hỏng.
 * Luôn chạy cả file:
 *   npx playwright test tests/patient-visit-list-rcp-type.spec.ts
 *
 * DỮ LIỆU (Rule 18): mặc định 200601 — 36 bệnh nhân / 86 dòng (bệnh nhân × ngày)
 * trên dataset demo, đủ nhỏ để chạy nhanh mà vẫn đa dạng 保険種別 (ins_kbn
 * 1/2/6/8/9/10, old_flg 0/1/4/5) ⇒ chạm được các nhánh 社・/国・/退職・/後期・,
 * 家外/本外/高外 và cả 自費. Đổi bằng TEST_SINRYO_YM (yyyyMM).
 *
 * TC-DB-1 cần TEST_DB=1 (xem tests/db.ts), tự skip khi không bật. Spec này
 * KHÔNG ghi DB — chỉ đọc.
 *
 * ── NỬA WINFORM ─────────────────────────────────────────────────────────────
 * `fla-ui-tests/src/OchaCom.FlaUiTests/Tests/PatientVisitList/` đo CHÍNH frm204008
 * trên cùng 診療年月 200601 (SQL Server SIM2000 và Postgres của tenant là cùng một
 * dataset: 36 bệnh nhân / 86 dòng ở cả hai bên). Hàm `expectedReceiptType` dưới đây
 * và `ReceiptTypeOracle.Expected` bên đó là CÙNG một luật — mỗi bên khớp oracle của
 * mình thì hai bên khớp nhau.
 *
 * Đối chiếu ngày 2026-09-04: 86/86 dòng trùng khít, cùng thứ tự, không lệch trường
 * nào. Xem `fla-ui-tests/.../PatientVisitList/README.md` mục 6. Tình trạng 3 điểm
 * khác tìm được ở lần đối chiếu đó:
 *   · nhãn dòng 合計 — ĐÃ SỬA. WinForm (frm204008.cs:807) dùng khoảng trắng 全角
 *     U+3000 sau 「名」 và độn 件数 4 ký tự; handler từng dùng 半角 + độn 5.
 *     `GetPatientVisitListHandlerTests` chốt đúng chuỗi WinForm nên không trôi lại;
 *   · WinForm sort được 10 cột mà bản web khoá `enableSorting: false` — CHƯA xử lý,
 *     chờ quyết định sản phẩm (xem chú thích ở SORTABLE_COLS);
 *   · ngược lại, bấm 患者番号 ở WinForm KHÔNG sort (handler dò nhầm tên cột
 *     「dsp_pat_no」, frm204008.cs:242) trong khi bản web sort được — CHƯA xử lý.
 *     Lưu ý 氏名 thì WinForm CÓ sort, bằng ComLibrary.kanaSort (50音順).
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** 診療年月 yyyyMM. Xem khối DỮ LIỆU ở doc-comment cho lý do chọn 200601. */
const SINRYO_YM = process.env.TEST_SINRYO_YM ?? '200601'

const VISIT_LIST_URL = /\/tenant\/settlement\/visit-list(\?|$)/

/** Nội dung E00100 của 来患一覧 — features/counter-payments/locales/ja.ts. */
const BUI_PRICE_FAILED_HEAD = '一部負担金計算に失敗しました。患者登録データを確認してください。'

/** id cột theo `COLUMNS` của patient-visit-list-table, ĐÚNG thứ tự render. */
const COL_IDS = [
    'patNo',
    'patNm',
    'rcpTypeNm',
    'trtDt',
    'syosinLabel',
    'insScore',
    'insPrice',
    'careScore',
    'carePrice',
    'jihiPrice',
    'jihiTax',
    'priceTotal',
] as const
type ColId = (typeof COL_IDS)[number]

/** Nhãn header đúng `_viewItem` của frm204008 (chuẩn hoá NFKC khi so). */
const HEADER_LABELS: Record<ColId, string> = {
    patNo: '患者番号',
    patNm: '氏　　名',
    rcpTypeNm: 'レセプト種別',
    trtDt: '診療日',
    syosinLabel: '初/再診',
    insScore: '医療保険点数',
    insPrice: '医療保険負担金',
    careScore: '介護保険点数',
    carePrice: '介護保険負担金',
    jihiPrice: '保険外負担金',
    jihiTax: '保険外消費税',
    priceTotal: '合計金額',
}

/**
 * 2 cột web cho sort (SORT_COMPARATORS).
 *
 * KHÔNG phải parity — đo thật trên WinForm bằng bộ FlaUI thì ngược lại gần hết:
 *  - 患者番号 KHÔNG sort: init() hạ xuống SortMode.Programmatic (frm204008.cs:411)
 *    rồi handler dò tên cột "dsp_pat_no" (frm204008.cs:242) trong khi cột tên
 *    "pat_no" → nhánh chết. Web sort được cột này là THÊM so với WinForm.
 *  - 氏名 CÓ sort, qua ComLibrary.kanaSort (frm204008.cs:261) — 50音順, mà
 *    comparator 'text' của web chưa chắc cho cùng thứ tự.
 *  - 10 cột còn lại (kể cả レセプト種別) CÓ sort ở WinForm: InitViewItem để
 *    SortMode.Automatic và frm204008 không gọi columnSortModeOff().
 * Nên assert dưới đây chốt HÀNH VI HIỆN TẠI CỦA WEB, không phải luật WinForm.
 */
const SORTABLE_COLS: ReadonlySet<ColId> = new Set<ColId>(['patNo', 'patNm'])

/** Một dòng của payload API (đã bỏ dòng 合計). */
interface VisitRow {
    patNo: number
    patNm: string
    rcpTypeNm: string | null
    trtDt: string
}

interface VisitWarning {
    patNo: number | string
    patBr: number | string
    trtDt: string
    reason: string | null
}

/**
 * Hình dạng レセプト識別 hợp lệ theo buiPrice.cs:1523-1602:
 *   <保険種別>・<単独 | N併>・<六外 | 本外 | 家外 | 高外７ | 高外－>
 * cộng hai nhánh trả về SỚM chỉ có nhãn: 労災 / 自費.
 * Dùng để bắt lỗi "rỗng" hoặc "ghép thiếu vế" mà không cần DB.
 */
const RCP_TYPE_RE =
    /^(労災|自費|(公費|社|国|退職|後期)・(単独|[０-９]+併)・(六外|本外|家外|高外７|高外－))$/

/**
 * 年齢（学年基準）— port `ComLibrary.getAge2` (ComLibrary.cs:238-251).
 * Mốc là 4/1 mở đầu năm học chứa `baseIso`, KHÔNG phải sinh nhật.
 */
function schoolYearAge(birthIso: string, baseIso: string): number {
    const part = (iso: string, i: number, what: string): number => {
        const n = Number(iso.split('-')[i])
        if (!Number.isFinite(n)) throw new Error(`${what} không phải ISO yyyy-MM-dd: "${iso}"`)
        return n
    }
    const by = part(birthIso, 0, 'birthdate')
    const bm = part(birthIso, 1, 'birthdate')
    const bd = part(birthIso, 2, 'birthdate')
    const ry = part(baseIso, 0, '診療日')
    const rm = part(baseIso, 1, '診療日')

    const wkYear = rm >= 4 ? ry + 1 : ry
    let age = wkYear - by
    if (4 * 100 + 1 < bm * 100 + bd) age -= 1
    return age
}

/**
 * レセプト識別 KỲ VỌNG — viết lại từ `buiPrice.getReceiptType`
 * (buiPrice.cs:1502-1602), KHÔNG chép từ BuiPriceService, để test còn giá trị
 * đối chứng.
 *
 * Trả `null` khi không suy ra được:
 *  - `combi_kbn = 2` (併用): số 公費 thực sự áp dụng do `setBurdenType` quyết
 *    (buiPrice.cs:1726-1868) và phụ thuộc master 福祉医療 + tỉnh 愛知/京都 —
 *    dựng lại ở đây là chép nguyên một hệ thống khác, không đáng.
 *  - thiếu `birthdate` (WinForm ném ở `DateTime.Parse` → E00100).
 */
function expectedReceiptType(ins: ReceiptTypeInputs, trtDtIso: string): string | null {
    if (ins.insKbn === 3) return '労災'
    if (ins.insKbn === 6) return '自費'
    if (!ins.birthdate) return null

    let dsp: string
    switch (ins.insKbn) {
        case 7:
            dsp = '公費・'
            break
        case 1:
        case 8:
            dsp = '社・'
            break
        case 2:
            dsp = '国・'
            break
        case 9:
            dsp = '退職・'
            break
        case 10:
            dsp = '後期・'
            break
        default:
            dsp = ''
    }

    if (ins.combiKbn === 1 || ins.insKbn === 7) dsp += '単独・'
    else return null

    const age2 = schoolYearAge(ins.birthdate, trtDtIso)
    if (age2 < 7 && ins.insKbn !== 7) dsp += '六外'
    else if (ins.insKbn === 7) dsp += '本外'
    else if (ins.oldFlg === 4 || ins.oldFlg === 5) dsp += ins.burRate === 30 ? '高外７' : '高外－'
    else if (ins.oldFlg === 1) dsp += '本外'
    else if (ins.fmType === 1) dsp += '本外'
    else dsp += '家外'

    return dsp
}

/** 平成 bắt đầu 1989-01-08, 令和 bắt đầu 2019-05-01 — ranh giới là NGÀY, không phải năm. */
function eraOf(yyyy: number, mm: number): { name: string; startYear: number } {
    if (yyyy > 2019 || (yyyy === 2019 && mm >= 5)) return { name: '令和', startYear: 2018 }
    if (yyyy > 1989 || (yyyy === 1989 && mm >= 1)) return { name: '平成', startYear: 1988 }
    return { name: '昭和', startYear: 1925 }
}

test.describe.configure({ mode: 'serial' })

test.describe('来患一覧 (frm204008) — レセプト種別 + chịu lỗi 一部負担金', () => {
    let page: Page
    let step: () => Promise<void>

    /** Payload của lần 検索 ở TC-OPEN-1; các testcase sau dùng lại. */
    let apiRows: VisitRow[] = []
    let apiWarnings: VisitWarning[] = []
    /** Có dòng 合計 trong payload không (handler chỉ thêm khi rows.length > 0). */
    let hasTotalRow = false
    /** Payload có field `warnings` thật không — xem ghi chú ở `pressSearch`. */
    let hasWarningsField = false

    function grid(): Locator {
        return scroller(page)
    }

    /** Hàng chứa nhãn 診療年月 — EraDateField không có aria-label nên bám theo nhãn. */
    function sinryoYmRow(): Locator {
        return page.getByText('診療年月', { exact: true }).locator('..')
    }

    /**
     * Gõ lại 診療年月. `mode="month"` nên CHỈ có 2 textbox (年, 月) — đừng copy
     * `setTrtDate` của today-visit-list.spec (nó gõ 3 ô).
     */
    async function setSinryoYm(yyyymm: string) {
        const match = /^(\d{4})(\d{2})$/.exec(yyyymm)
        if (!match) throw new Error(`TEST_SINRYO_YM phải là yyyyMM, đang là "${yyyymm}"`)
        const yyyy = Number(match[1])
        const mm = Number(match[2])

        const row = sinryoYmRow()
        const boxes = row.getByRole('textbox')
        // `disabled={eras.length === 0}` — ô chỉ enable sau khi mst-era về.
        await expect(boxes.first(), 'không thấy ô 年 của 診療年月').toBeEnabled({ timeout: 30000 })

        const want = eraOf(yyyy, mm)
        await row.getByRole('combobox').click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15000 })
        const eraNames = (await listbox.getByRole('option').allInnerTexts())
            .map((t) => t.trim())
            .filter((t) => t !== '')
        const picked = eraNames.find((n) => n.startsWith(want.name))
        expect(
            picked,
            `mst-era không có 元号 ${want.name} (đang có: ${eraNames.join('/')})`,
        ).toBeTruthy()
        await listbox.getByRole('option', { name: picked!, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 15000 })

        await boxes.nth(0).fill(String(yyyy - want.startYear))
        await boxes.nth(1).fill(String(mm))
        await step()
    }

    /**
     * Bấm 検索 và trả payload.
     *
     * Query chỉ bay khi `appliedParams` được set (nút 検索), nên đăng ký chờ
     * TRƯỚC khi click. Khớp theo `sinryoYm` để không bắt nhầm request của lần
     * gõ dở dang trước đó.
     */
    async function pressSearch(expectedYm: string) {
        const waiter = page.waitForResponse(
            (r) =>
                VISIT_LIST_URL.test(r.url()) &&
                r.request().method() === 'GET' &&
                new URL(r.url()).searchParams.get('sinryoYm') === expectedYm,
            { timeout: 120000 },
        )
        await page.getByRole('button', { name: '検索', exact: true }).click()
        const res = await waiter
        expect(
            res.status(),
            `GET visit-list trả ${res.status()} — BE đã có endpoint 来患一覧 chưa?`,
        ).toBeLessThan(300)

        const body = (await res.json()) as {
            data?: {
                rows?: {
                    patNo: number | string | null
                    patNm: string
                    rcpTypeNm: string | null
                    trtDt: string | null
                }[]
                warnings?: VisitWarning[]
            }
        }
        const all = body.data?.rows ?? []
        // Dòng 合計 (patNo/trtDt null) KHÔNG phải dòng khám — lọc ra như
        // `isPatientVisitListVisitRow`.
        hasTotalRow = all.some((r) => r.patNo == null && r.trtDt == null)
        apiRows = all
            .filter((r) => r.patNo != null && r.trtDt != null)
            .map((r) => ({
                patNo: Number(r.patNo),
                patNm: r.patNm,
                rcpTypeNm: r.rcpTypeNm,
                trtDt: String(r.trtDt).slice(0, 10),
            }))
        // Ghi lại field có MẶT hay không: `?? []` bên dưới sẽ che mất việc BE
        // không trả `warnings`, và khi đó TC-WARN-1 pass mà chẳng kiểm gì.
        hasWarningsField = Array.isArray(body.data?.warnings)
        apiWarnings = body.data?.warnings ?? []
        return new URL(res.url())
    }

    /**
     * Đọc TOÀN BỘ dòng đang render (lưới virtual hoá → phải cuộn).
     *
     * Mỗi nhịp cuộn đọc bằng ĐÚNG MỘT `evaluateAll`: giữa hai lời gọi Locator
     * riêng lẻ, virtualizer kịp unmount dòng vừa trôi khỏi khung nhìn và
     * `getAttribute` sẽ treo ở đúng dòng biên (bẫy đã gặp ở today-visit-list).
     */
    async function readRenderedRows(): Promise<{ testId: string; cells: Record<string, string> }[]> {
        const sc = grid()
        await expect(sc, 'lưới 来患一覧 không render').toBeVisible({ timeout: 60000 })
        await expect(rows(page).first().or(emptyState(page))).toBeVisible({ timeout: 60000 })
        if ((await rows(page).count()) === 0) return []

        const map = new Map<string, { index: number; cells: Record<string, string> }>()
        const max = await sc.evaluate((el) => el.scrollHeight - el.clientHeight)
        const STEP_PX = 200

        for (let top = 0; ; top += STEP_PX) {
            const target = Math.min(top, Math.max(max, 0))
            await sc.evaluate((el, t) => {
                el.scrollTop = t
            }, target)
            await expect(rows(page).first()).toBeVisible({ timeout: 15000 })

            const chunk = await rows(page).evaluateAll(
                (els, colIds) =>
                    els.map((el) => {
                        const cells: Record<string, string> = {}
                        for (const id of colIds) {
                            cells[id] =
                                el.querySelector(`[data-testid="cell-${id}"]`)?.textContent ?? ''
                        }
                        return {
                            testId: el.getAttribute('data-testid') ?? '',
                            index: Number(el.getAttribute('data-index') ?? '-1'),
                            cells,
                        }
                    }),
                [...COL_IDS] as string[],
            )

            for (const raw of chunk) {
                if (raw.testId === '' || map.has(raw.testId)) continue
                map.set(raw.testId, { index: raw.index, cells: raw.cells })
            }
            if (target >= max) break
        }

        await sc.evaluate((el) => {
            el.scrollTop = 0
        })
        return [...map.entries()]
            .sort((a, b) => a[1].index - b[1].index)
            .map(([testId, v]) => ({ testId, cells: v.cells }))
    }

    /**
     * Gác dữ liệu cho từng testcase.
     *
     * `describe.serial` chỉ chặn các testcase sau khi có testcase FAIL — một
     * `test.skip()` ở TC-OPEN-1 KHÔNG lan xuống. Không gác thì tháng rỗng sẽ
     * biến thành một loạt fail giả thay vì skip có lý do (Rule 18).
     */
    function requireRows() {
        skipWithReason(
            apiRows.length === 0,
            `${SINRYO_YM} không có dòng khám nào — đổi TEST_SINRYO_YM sang tháng có dữ liệu`,
        )
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

        await page.goto('/counter-payments/visit-list', { waitUntil: 'domcontentloaded' })
        await expect(
            page.getByRole('heading', { name: '来患一覧' }),
            'không vào được /counter-payments/visit-list',
        ).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Mở màn + gọi API ─────────────────────────────────────────────────────

    test('TC-OPEN-1 — 検索 gọi API đúng 診療年月 và đủ 3 cờ 初診/再診/訪問診療', async () => {
        // Chưa bấm 検索 thì query đứng ở skipToken ⇒ lưới phải đang rỗng.
        await expect(
            rows(page),
            'lưới đã có dòng trước khi bấm 検索 — query gate đang sai',
        ).toHaveCount(0)

        await setSinryoYm(SINRYO_YM)
        const url = await pressSearch(SINRYO_YM)

        expect(url.searchParams.get('sinryoYm'), 'sinryoYm gửi lên sai').toBe(SINRYO_YM)
        // Ba checkbox mặc định đều checked (frm204008 chkSyosin/chkSaisin/chkHoumon).
        for (const flag of ['syosin', 'saisin', 'houmon']) {
            expect(url.searchParams.get(flag), `cờ ${flag} mặc định phải là true`).toBe('true')
        }

        console.log(
            `来患一覧 ${SINRYO_YM}: ${apiRows.length} dòng khám, ` +
                `${new Set(apiRows.map((r) => r.patNo)).size} bệnh nhân, ` +
                `${apiWarnings.length} warning`,
        )
        skipWithReason(
            apiRows.length === 0,
            `${SINRYO_YM} không có dòng nào — đổi TEST_SINRYO_YM sang tháng có dữ liệu`,
        )
        await step()
    })

    test('TC-OPEN-2 — 12 cột đúng nhãn, đúng thứ tự _viewItem, và chỉ 患者番号/氏名 sort được', async () => {
        requireRows()
        for (const col of COL_IDS) {
            const header = page.getByTestId(`header-${col}`)
            await expect(header, `thiếu cột ${col}`).toBeVisible({ timeout: 30000 })
            expect(
                (await header.innerText()).normalize('NFKC').replace(/[▲▼]/g, '').trim(),
                `nhãn cột ${col} sai`,
            ).toBe(HEADER_LABELS[col].normalize('NFKC').trim())

            // Cột không sortable thì sort-header-dom KHÔNG gắn aria-sort.
            const ariaSort = await header.getAttribute('aria-sort')
            if (SORTABLE_COLS.has(col)) {
                expect(ariaSort, `cột ${col} phải sort được`).not.toBeNull()
            } else {
                expect(
                    ariaSort,
                    `cột ${col} sort được, nhưng web đang cố ý tắt sort cột này`,
                ).toBeNull()
            }
        }

        const order = await page
            .getByTestId('table-header-row')
            .locator('[data-testid^="header-"]')
            .evaluateAll((els) =>
                els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^header-/, '')),
            )
        expect(order, 'thứ tự cột KHÁC _viewItem của frm204008').toEqual([...COL_IDS])
        await step()
    })

    // ── レセプト種別 ─────────────────────────────────────────────────────────

    test('TC-RCP-1 — MỌI dòng khám đều có レセプト種別, không dòng nào rỗng/null', async () => {
        requireRows()
        // Đây chính là bug được báo: "レセプト種別 luôn null".
        const blank = apiRows.filter((r) => r.rcpTypeNm == null || r.rcpTypeNm.trim() === '')
        expect(
            blank.slice(0, 5),
            `${blank.length}/${apiRows.length} dòng có レセプト種別 rỗng — ` +
                'GetReceiptType đang không chạy, hoặc insurance thiếu birthdate/ins_kbn',
        ).toEqual([])
        await step()
    })

    test('TC-RCP-2 — レセプト種別 đúng hình dạng 保険種別・単独|N併・区分 của WinForm', async () => {
        requireRows()
        // KHÔNG normalize NFKC: nó biến ２併 → 2併 và phá luôn nhánh [０-９]+併
        // của regex — 全角 ở đây là parity (EditControl.editHanToZen), không phải
        // khác biệt hiển thị.
        const bad = apiRows
            .filter((r) => !RCP_TYPE_RE.test(r.rcpTypeNm ?? ''))
            .map((r) => `${r.patNo}/${r.trtDt}="${r.rcpTypeNm}"`)
        expect(
            bad.slice(0, 5),
            `${bad.length} dòng có レセプト種別 sai hình dạng buiPrice.cs:1523-1602`,
        ).toEqual([])

        const kinds = new Set(apiRows.map((r) => r.rcpTypeNm))
        console.log(`レセプト種別 xuất hiện (${kinds.size} loại): ${[...kinds].join(' | ')}`)
        await step()
    })

    test('TC-RCP-3 — cùng một bệnh nhân thì mọi ngày phải CÙNG レセプト種別 (chống rò combi_kbn)', async () => {
        requireRows()
        // Bug cũ: ngày không có 公費 ghi 単独 ngược vào Insurance dùng chung, kéo
        // mọi ngày SAU đó xuống 単独 ⇒ một bệnh nhân có 2 種別 khác nhau trong
        // cùng tháng mà không có lý do (bảo hiểm không đổi giữa tháng).
        const byPat = new Map<number, Set<string>>()
        for (const r of apiRows) {
            const set = byPat.get(r.patNo) ?? new Set<string>()
            set.add(r.rcpTypeNm ?? '')
            byPat.set(r.patNo, set)
        }
        const multi = [...byPat.entries()]
            .filter(([, kinds]) => kinds.size > 1)
            .map(([patNo, kinds]) => `患者${patNo}: ${[...kinds].join(' → ')}`)

        expect(
            multi.slice(0, 5),
            'một bệnh nhân có nhiều レセプト種別 trong cùng tháng — nghi getReceiptType ' +
                'ghi combi_kbn ngược vào Insurance dùng chung (buiPrice.cs:1563)',
        ).toEqual([])

        const multiDay = [...byPat.keys()].filter(
            (p) => apiRows.filter((r) => r.patNo === p).length > 1,
        ).length
        // Bất biến chỉ có ý nghĩa khi CÓ bệnh nhân nhiều ngày — nói rõ ra thay vì
        // để một lần chạy rỗng trông giống một lần pass thật (Rule 18).
        if (multiDay === 0) {
            console.log(
                `${SINRYO_YM}: không bệnh nhân nào có >1 ngày khám → TC-RCP-3 KHÔNG kiểm được gì`,
            )
        } else {
            console.log(`TC-RCP-3: ${multiDay} bệnh nhân có nhiều ngày khám, tất cả nhất quán`)
        }
        await step()
    })

    // ── Banding (IsTheSameCellValue) ─────────────────────────────────────────

    test('TC-BAND-1 — dòng đầu mỗi nhóm bệnh nhân HIỆN 種別, dòng lặp lại thì để trắng', async () => {
        requireRows()
        const rendered = await readRenderedRows()
        expect(rendered.length, 'không đọc được dòng nào từ lưới').toBeGreaterThan(0)

        // Dòng 合計 (`row-total`) không tham gia banding theo bệnh nhân.
        const visits = rendered.filter((r) => r.testId !== 'row-total')

        let prevPatNo = ''
        let prevPatNm = ''
        let groupHeadChecked = 0
        let bandedChecked = 0

        for (const row of visits) {
            const patNo = (row.cells.patNo ?? '').trim()
            const patNm = (row.cells.patNm ?? '').trim()
            const rcp = (row.cells.rcpTypeNm ?? '').trim()

            if (patNo !== '') {
                // Ô 患者番号 có chữ ⇒ đây là dòng MỞ ĐẦU nhóm ⇒ 種別 bắt buộc hiện.
                expect(
                    rcp,
                    `dòng mở đầu nhóm (${row.testId}) để trống レセプト種別 — ` +
                        'banding đang bỏ trắng nhầm, hoặc BE trả rỗng',
                ).not.toBe('')
                groupHeadChecked++
                prevPatNo = patNo
                prevPatNm = patNm
            } else {
                // 患者番号 trắng ⇒ lặp lại bệnh nhân dòng trên. Theo
                // `rcpTypeSame = patNmSame && prev.rcpTypeNm === row.rcpTypeNm`,
                // 種別 chỉ được HIỆN LẠI khi nó thật sự đổi — mà nó không được đổi
                // (TC-RCP-3). Hiện lại ở đây = dấu hiệu bug combi_kbn quay lại.
                if (patNm.trim() === '') {
                    expect(
                        rcp,
                        `dòng ${row.testId} lặp lại 患者番号+氏名 nhưng レセプト種別 vẫn hiện ` +
                            `("${rcp}") — 種別 đã đổi giữa hai ngày của cùng bệnh nhân ` +
                            `${prevPatNo} ${prevPatNm}`,
                    ).toBe('')
                    bandedChecked++
                }
            }
        }

        expect(groupHeadChecked, 'không có dòng mở đầu nhóm nào để kiểm').toBeGreaterThan(0)
        console.log(
            `TC-BAND-1: ${groupHeadChecked} dòng mở nhóm có 種別, ` +
                `${bandedChecked} dòng lặp lại được bỏ trắng đúng`,
        )
        await step()
    })

    test('TC-BAND-2 — lưới client-side: không skeleton, và có dòng 合計 khi có dữ liệu', async () => {
        requireRows()
        await expect(
            skeletons(page),
            'lưới client-side lẽ ra resolve ngay mà vẫn có skeleton',
        ).toHaveCount(0)

        // Handler chỉ thêm dòng 合計 khi rows.length > 0 (frm204008 dspData).
        expect(hasTotalRow, 'có dòng khám mà payload thiếu dòng 合計').toBe(true)

        // Lưới VIRTUAL HOÁ: dòng 合計 là dòng CUỐI nên chỉ nằm trong DOM khi đã
        // cuộn tới đáy. TC-BAND-1 chạy trước đã trả con trỏ về đầu, nên không
        // cuộn lại thì `row-total` luôn 0 phần tử — đó là bẫy của test, không
        // phải lỗi render.
        const sc = grid()
        await sc.evaluate((el) => {
            el.scrollTop = el.scrollHeight
        })
        await expect(page.getByTestId('row-total'), 'lưới không render dòng 合計').toHaveCount(1, {
            timeout: 15000,
        })

        // 合計 phải là dòng CUỐI CÙNG, kể cả khi người dùng đã đổi sort
        // (PatientVisitListTable ghép totalRow vào sau sortedRows).
        const lastTestId = await rows(page).evaluateAll((els) => {
            let maxIdx = -1
            let id = ''
            for (const el of els) {
                const i = Number(el.getAttribute('data-index') ?? '-1')
                if (i > maxIdx) {
                    maxIdx = i
                    id = el.getAttribute('data-testid') ?? ''
                }
            }
            return id
        })
        expect(lastTestId, 'dòng 合計 không nằm ở cuối lưới').toBe('row-total')

        await sc.evaluate((el) => {
            el.scrollTop = 0
        })
        await step()
    })

    // ── E00100 (warnings) ────────────────────────────────────────────────────

    test('TC-WARN-1 — chạy sạch thì warnings rỗng và KHÔNG có hộp thoại E00100', async () => {
        requireRows()
        // WinForm chỉ bật E00100 khi 一部負担金 tính hỏng (buiPrice.cs:201). Dữ liệu
        // demo không có ca hỏng, nên hộp thoại bật lên ở đây = báo động giả, và
        // nó CHẶN màn hình (modal) nên phải bắt.
        if (apiWarnings.length > 0) {
            console.log(
                `warnings (${apiWarnings.length}): ` +
                    apiWarnings
                        .slice(0, 5)
                        .map((w) => `患者${w.patNo}/枝番${w.patBr}/${w.trtDt}: ${w.reason ?? '(no reason)'}`)
                        .join(' | '),
            )
        }
        expect(
            hasWarningsField,
            'response thiếu hẳn field `warnings` — BE chưa có bản trả warning thì ' +
                'testcase này không kiểm được gì',
        ).toBe(true)
        expect(
            apiWarnings.length,
            `${SINRYO_YM} có ${apiWarnings.length} dòng tính hỏng — ` +
                'xem log phía trên để biết bệnh nhân nào, đây là lỗi DỮ LIỆU hoặc BE',
        ).toBe(0)

        await expect(
            page.getByText(BUI_PRICE_FAILED_HEAD),
            'hộp thoại E00100 bật lên dù không có warning nào',
        ).toHaveCount(0)
        await step()
    })

    // ── Đối chiếu DB (parity thật) ───────────────────────────────────────────

    test('TC-DB-1 — レセプト種別 khớp giá trị suy từ DB theo luật getReceiptType', async () => {
        requireRows()
        skipWithReason(!dbEnabled, 'TEST_DB chưa bật → bỏ đối chiếu DB')

        const patNos = [...new Set(apiRows.map((r) => r.patNo))]
        const inputs = await receiptTypeInputsFor(patNos)

        const mismatches: string[] = []
        let compared = 0
        let skippedMultiBranch = 0
        let skippedCombi = 0

        for (const row of apiRows) {
            const ins = inputs.get(row.patNo)
            if (!ins) continue
            // Response không có 枝番 (frm204008 cũng không có cột đó) ⇒ nhiều 枝番
            // thì không biết API dùng bản nào, bỏ qua thay vì đoán.
            if (ins.branchCount > 1) {
                skippedMultiBranch++
                continue
            }
            const want = expectedReceiptType(ins, row.trtDt)
            if (want === null) {
                skippedCombi++
                continue
            }
            compared++
            if ((row.rcpTypeNm ?? '') !== want) {
                mismatches.push(
                    `患者${row.patNo} ${row.trtDt}: API="${row.rcpTypeNm}" ≠ WinForm="${want}" ` +
                        `(ins_kbn=${ins.insKbn} combi=${ins.combiKbn} old=${ins.oldFlg} ` +
                        `bur=${ins.burRate} fm=${ins.fmType} birth=${ins.birthdate})`,
                )
            }
        }

        console.log(
            `TC-DB-1: đối chiếu ${compared} dòng; bỏ qua ${skippedMultiBranch} (nhiều 枝番), ` +
                `${skippedCombi} (併用 — cần master 福祉医療 mới suy được)`,
        )
        expect(
            mismatches.slice(0, 10),
            `${mismatches.length} dòng lệch luật buiPrice.getReceiptType`,
        ).toEqual([])
        expect(compared, 'không đối chiếu được dòng nào — dataset toàn 併用/nhiều 枝番?').toBeGreaterThan(0)
    })
})
