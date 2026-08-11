import { expect, test, type Locator, type Page } from '@playwright/test'

import { SEED_DISP_BASE, dbEnabled, deleteTreatmentRows, seedTreatmentRows, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { emptyState, rows, scroller, skeletons } from './virtual-grid'

/**
 * 来患集計 (frm203046) — UnvisitedTotalDialog, mở bằng phím F3「当月来患」trên màn
 * DANH SÁCH `/treatments` (màn 患者選択, KHÔNG phải detail `/treatments/{patNo}`).
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-page.tsx:
 *      · `F3: { label: '当月来患', onPress: () => setUnvisitedTotalOpen(true) }`.
 *      · Dialog mount SẴN, chỉ bật/tắt bằng prop `open` → query gate `enabled: open`
 *        ⇒ request CHỈ bay khi bấm F3, phải bắt response TRƯỚC khi nhấn.
 *      · Prop `trtDt` = ISO của EraDateField 診療日 (mặc định hôm nay).
 *  - components/unvisited-total-dialog.tsx:
 *      · Radix `<Dialog>` (KHÔNG phải DraggableDialog) → role="dialog". Tiêu đề
 *        giãn chữ có DẤU CÁCH THẬT trong source: '来 患 集 計'.
 *      · Nhãn combo là 'Ｄｒ．' (full-width), nút '検索', footer 'F1 印刷' / 'F10 戻る'.
 *      · Combo Ｄｒ． nạp từ mst-iin-2 (user_kbn=0), có DÒNG TRẮNG đầu tiên
 *        (EMPTY_SELECT_VALUE) và LUÔN reset về trắng mỗi lần mở — WinForm
 *        makeIinMstCombo(..., COMBO_SPC_ON) rồi makeDspData ngay (frm203046.cs:216).
 *      · Chỉ nút 検索 mới đổi `appliedDrNo` ⇒ đổi combo KHÔNG refetch.
 *      · 9 cột SỐ + 1 cột nhãn, TẤT CẢ `enableSorting: false` — WinForm đặt
 *        `col.SortMode = NotSortable` (frm203046.cs:133-136).
 *      · F1 印刷 là STUB → alertDialog 「この機能は開発中です。」 (title 開発中);
 *        RPT203004 chưa port. F10 đóng dialog.
 *  - lib/monthly-visit-summary-rows.ts:
 *      · 5 cột đầu (人数/合計点数/平均点数/実日数/点数・実日数) format {0:N0}
 *        → có dấu phẩy ngăn nghìn; 4 cột sau in số trần.
 *      · Ô bị chặn in đúng một dấu '-' (SUPPRESSED_CELL).
 *  - api/monthly-visit-summary-api.ts:
 *      · POST /tenant/treatment/monthly-visit-summary, THAM SỐ NẰM TRONG THÂN
 *        `{ trtDt, drNo?, password? }`. Là POST dù chỉ để đọc: màn này có cổng
 *        mật khẩu 医院, mà mật khẩu trên query string sẽ lọt vào access log.
 *      · drNo CHỈ được gắn khi > 0 (WinForm bỏ hẳn predicate DR_NO khi cboDr trắng).
 *  - components/clinic-password-dialog.tsx (port frm902014):
 *      · Chỉ THU THẬP mật khẩu; so sánh nằm ở BE (ClinicPasswordGate). FE chỉ
 *        nhận cờ `MstIin1Response.passFlg`, KHÔNG bao giờ nhận mật khẩu đã lưu.
 *      · Sai thì hiện E00002「パスワードが正しくありません。」và GIỮ hộp mở để
 *        nhập lại (frm902014.chkPass); F9 確定 / Enter gửi, F10 戻る huỷ.
 *
 * BE (apps/api, GetMonthlyVisitSummaryHandler):
 *  - Trả ĐÚNG 18 dòng, đã sắp thứ tự + kèm `label` (§3.30: bảng tra ở BE).
 *  - `kind`: detail / total (社保合計・国保合計・保険合計・合計) / kaigo (居宅・居宅（衛）).
 *  - Dòng kaigo trả null cho 実日数〜訪問 → UI in '-'.
 *  - 平均点数 = round(合計点数 / 人数), 点数/実日数 = round(合計点数 / 実日数),
 *    banker's rounding, và = 0 khi một trong hai vế bằng 0.
 *  - 合計 = 保険合計 + 居宅 + 居宅（衛） CHỈ ở 人数/合計点数; các cột còn lại chép
 *    nguyên từ 保険合計 (frm203046.cs:383-392).
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (GUIDELINE Rule 10.1) nên login + vào /treatments làm đúng một lần ở
 * beforeAll. Testcase nối tiếp trạng thái, thứ tự CÓ Ý NGHĨA — chạy lẻ một
 * testcase ở giữa bằng `-g` sẽ hỏng. Luôn chạy cả file:
 *   npx playwright test tests/monthly-visit-summary-dialog.spec.ts
 *
 * DỮ LIỆU (Rule 18): mặc định lấy tháng HIỆN HÀNH của 診療日 (hôm nay). Tháng đó
 * có thể toàn 0 — các assert cấu trúc / số học vẫn đúng nhưng nhạt. Trỏ vào
 * tháng CÓ dữ liệu để test có sức nặng:
 *   TEST_TRT_DT=2009-03-01 npx playwright test tests/monthly-visit-summary-dialog.spec.ts
 * Khi đặt biến này, spec sẽ gõ lại EraDateField 診療日 trước khi bấm F3.
 *
 * Nhóm TC-DB-* và TC-KAIGO-2 cần TEST_DB=1 (xem tests/db.ts), tự skip khi không bật.
 *
 * TC-KAIGO-2 là testcase DUY NHẤT ghi DB: nó tự dựng vài dòng 居宅 / 居宅（衛）
 * trong vùng disp_no >= SEED_DISP_BASE rồi xoá ở afterAll (dataset demo không có
 * ca 介護 hợp lệ nào nên nhánh đó vĩnh viễn bằng 0). Vì nó sửa một CON SỐ TOÀN
 * CỤC (来患集計 gộp mọi bệnh nhân), hai lần chạy song song sẽ giẫm lên nhau —
 * chạy lặp phải kèm `--workers=1`:
 *   npx playwright test tests/monthly-visit-summary-dialog.spec.ts --repeat-each=3 --workers=1
 * Chạy một lần (mặc định) thì không sao: cả file là một job serial duy nhất.
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

/** Ngày đầu tháng của một ISO — mốc dùng cho các query đối chiếu DB. */
function monthStartOf(iso: string): string {
    const { y, m } = isoParts(iso)
    return `${y}-${String(m).padStart(2, '0')}-01`
}

/** 診療日 dùng cho lần chạy này. Rỗng env → hôm nay (đúng seed của màn danh sách). */
const TRT_DT = process.env.TEST_TRT_DT ?? isoOf(new Date())
/** Có phải đang ép ngày khác hôm nay không → quyết định có gõ lại EraDateField. */
const OVERRIDE_DATE = TRT_DT !== isoOf(new Date())

const SUMMARY_URL = /\/tenant\/treatment\/monthly-visit-summary(\?|$)/
const MST_IIN1_URL = /\/tenant\/mst-iin1(\?|$)/

/**
 * Mật khẩu 医院 khi tenant BẬT cổng (`mst_iin_1.pass_flg = 1`).
 *
 * Cổng do dữ liệu tenant quyết định, không phải do spec: có phòng khám bật, có
 * phòng khám không. Khi bật mà không đưa mật khẩu thì server chặn MỌI request
 * số liệu, nên cả file mất nghĩa — lúc đó spec tự skip kèm log thay vì đỏ hàng
 * loạt (GUIDELINE Rule 18).
 *
 *   TEST_CLINIC_PASSWORD=xxxxx npx playwright test tests/monthly-visit-summary-dialog.spec.ts
 */
const CLINIC_PASSWORD = process.env.TEST_CLINIC_PASSWORD ?? ''

/** Thân request 来患集計 (POST body) — chỉ các field spec này soi tới. */
interface SummaryBody {
    trtDt?: string
    drNo?: number
    password?: string
}

/** Thứ tự 18 dòng do BE quyết (DisplayRows trong GetMonthlyVisitSummaryHandler). */
const ROW_CODES = [
    'shahoHonnin',
    'shahoKazoku',
    'shataiHonnin',
    'shataiKazoku',
    'shahoRojin',
    'shahoTotal',
    'kokuhoHonnin',
    'kokuhoKazoku',
    'kokutaiHonnin',
    'kokutaiKazoku',
    'kokuhoRojin',
    'kokuhoTotal',
    'kokiKorei',
    'kohiTandoku',
    'insuranceTotal',
    'homeCare',
    'homeCareHygienist',
    'grandTotal',
] as const
type RowCode = (typeof ROW_CODES)[number]

/** Nhãn tiếng Nhật đi kèm, đúng nhãn Designer của frm203046 (Y 80 → 454). */
const ROW_LABELS: Record<RowCode, string> = {
    shahoHonnin: '社保本人',
    shahoKazoku: '社保家族',
    shataiHonnin: '社退本人',
    shataiKazoku: '社退家族',
    shahoRojin: '社保老人',
    shahoTotal: '社保合計',
    kokuhoHonnin: '国保本人',
    kokuhoKazoku: '国保家族',
    kokutaiHonnin: '国退本人',
    kokutaiKazoku: '国退家族',
    kokuhoRojin: '国保老人',
    kokuhoTotal: '国保合計',
    kokiKorei: '後期高齢',
    kohiTandoku: '公費単独',
    insuranceTotal: '保険合計',
    homeCare: '居宅',
    homeCareHygienist: '居宅（衛）',
    grandTotal: '合計',
}

/** 12 dòng 保険種別 chi tiết — 保険合計 phải bằng tổng của chúng. */
const DETAIL_CODES: RowCode[] = [
    'shahoHonnin',
    'shahoKazoku',
    'shataiHonnin',
    'shataiKazoku',
    'shahoRojin',
    'kokuhoHonnin',
    'kokuhoKazoku',
    'kokutaiHonnin',
    'kokutaiKazoku',
    'kokuhoRojin',
    'kokiKorei',
    'kohiTandoku',
]
const SHAHO_GROUP: RowCode[] = [
    'shahoHonnin',
    'shahoKazoku',
    'shataiHonnin',
    'shataiKazoku',
    'shahoRojin',
]
const KOKUHO_GROUP: RowCode[] = [
    'kokuhoHonnin',
    'kokuhoKazoku',
    'kokutaiHonnin',
    'kokutaiKazoku',
    'kokuhoRojin',
]
const KAIGO_CODES: RowCode[] = ['homeCare', 'homeCareHygienist']

/** id cột theo `col.accessor(...)` của dialog. */
const NUMERIC_COL_IDS = [
    'cnt',
    'totalScore',
    'aveScore',
    'days',
    'ave',
    'syosin',
    'saiSyosin',
    'saisin',
    'houmon',
] as const
type NumericCol = (typeof NUMERIC_COL_IDS)[number]
/** 6 cột bị thay bằng '-' trên dòng 介護 (WinForm ghi đè cell 3..8). */
const SUPPRESSED_COLS: NumericCol[] = ['days', 'ave', 'syosin', 'saiSyosin', 'saisin', 'houmon']
/** Nhãn header, để kiểm không cột nào là nút sort. */
const HEADER_LABELS = [
    '人数',
    '合計点数',
    '平均点数',
    '実日数',
    '点数/実日数',
    '初診',
    '再初診',
    '再診',
    '訪問',
] as const

/** 処置サブコード của 居宅 / 居宅（衛） (MonthlyVisitSummaryCodes). */
const KAIGO_TRT_CD = 599
const HOME_CARE_TRT_SBS = [0, 10, 12, 14, 16, 18]
const HOME_CARE_HYGIENIST_TRT_SBS = [1, 11, 13, 15, 17, 19, 20, 21, 22, 23]

/**
 * Dòng 介護 do CHÍNH test dựng (TC-KAIGO-2).
 *
 * Vì sao cần: dataset demo không có ca 居宅療養管理指導 hợp lệ nào (dòng
 * trt_cd=599 duy nhất mang trt_sb ngoài cả hai tập), nên hai dòng 居宅 /
 * 居宅（衛）luôn bằng 0 — nhánh kbn 5/6 và quy tắc "合計 cộng thêm 介護" không
 * bao giờ được kiểm bằng số thật. Đây KHÔNG phải seed dữ liệu nền: dòng nằm
 * trong vùng disp_no >= SEED_DISP_BASE và bị xoá ở afterAll.
 *
 * Một mảng con = một BỆNH NHÂN. SQL gom 人数 theo (pat_no, pat_br) nên mỗi bệnh
 * nhân chỉ cộng 1 vào 人数 dù có mấy dòng — dùng 2 bệnh nhân để phân biệt được
 * "đếm theo người" với "đếm theo dòng".
 */
const KAIGO_SEED_ROWS: readonly (readonly { trtSb: number; trtPt: number }[])[] = [
    // 患者 #1 — 2 dòng 居宅 (cộng dồn điểm, vẫn chỉ 1 người) + 1 dòng 居宅（衛）.
    [
        { trtSb: 0, trtPt: 100 },
        { trtSb: 12, trtPt: 200 },
        { trtSb: 1, trtPt: 70 },
    ],
    // 患者 #2 — mỗi loại 1 dòng, lấy trt_sb ở cuối dải để chặn lỗi copy thiếu.
    [
        { trtSb: 10, trtPt: 50 },
        { trtSb: 23, trtPt: 30 },
    ],
]

/** Mức tăng kỳ vọng của 2 dòng 介護 sau khi dựng — suy từ KAIGO_SEED_ROWS. */
function expectedKaigoDelta(): Record<'homeCare' | 'homeCareHygienist', { cnt: number; total: number }> {
    const acc = {
        homeCare: { cnt: 0, total: 0 },
        homeCareHygienist: { cnt: 0, total: 0 },
    }
    for (const patientRows of KAIGO_SEED_ROWS) {
        const seen = { homeCare: false, homeCareHygienist: false }
        for (const row of patientRows) {
            const key = HOME_CARE_TRT_SBS.includes(row.trtSb)
                ? ('homeCare' as const)
                : HOME_CARE_HYGIENIST_TRT_SBS.includes(row.trtSb)
                  ? ('homeCareHygienist' as const)
                  : null
            if (key === null) throw new Error(`trt_sb ${row.trtSb} không thuộc 居宅 lẫn 居宅（衛）`)
            acc[key].total += row.trtPt
            seen[key] = true
        }
        if (seen.homeCare) acc.homeCare.cnt++
        if (seen.homeCareHygienist) acc.homeCareHygienist.cnt++
    }
    return acc
}

/** Một dòng lưới đã đọc: label + 9 số (null = ô in '-'). */
interface GridRow {
    label: string
    values: Record<NumericCol, number | null>
}

/** '1,234' → 1234; '-' → null. Ném khi gặp chuỗi lạ để không âm thầm so 0 với 0. */
function parseCell(raw: string, where: string): number | null {
    const s = raw.normalize('NFKC').trim()
    if (s === '-') return null
    const n = Number(s.replace(/,/g, ''))
    if (!Number.isFinite(n)) throw new Error(`${where}: ô không phải số và cũng không phải '-': "${raw}"`)
    return n
}

/** Số bắt buộc phải có (dùng cho cột không bị chặn). */
function num(row: GridRow, col: NumericCol, code: string): number {
    const v = row.values[col]
    expect(v, `dòng ${code} cột ${col} đang là '-' nhưng lẽ ra phải có số`).not.toBeNull()
    return v as number
}

/** Tổng một cột trên nhiều dòng. */
function sumOf(map: Map<string, GridRow>, codes: RowCode[], col: NumericCol): number {
    return codes.reduce((acc, code) => {
        const row = map.get(code)
        expect(row, `thiếu dòng ${code} trong lưới`).toBeDefined()
        return acc + num(row!, col, code)
    }, 0)
}

/** `Math.Round` của .NET = làm tròn về số CHẴN khi đúng 0.5 (banker's rounding). */
function roundHalfToEven(x: number): number {
    const floor = Math.floor(x)
    const diff = x - floor
    if (diff > 0.5) return floor + 1
    if (diff < 0.5) return floor
    return floor % 2 === 0 ? floor : floor + 1
}

/** Số học của handler: 0 khi một trong hai vế bằng 0, còn lại là round(a/b). */
function expectedAvg(total: number, divisor: number): number {
    if (total === 0 || divisor === 0) return 0
    return roundHalfToEven(total / divisor)
}

test.describe.configure({ mode: 'serial' })

test.describe('F3 当月来患 — 来患集計 dialog (frm203046)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog chính. Tiêu đề có dấu cách thật trong source nên match nguyên văn. */
    let dialog: Locator

    /** Lưới đọc ở TC-OPEN-1, các testcase sau dùng lại (đỡ cuộn lại 18 dòng). */
    let baseline: Map<string, GridRow> = new Map()
    /** Nhãn Ｄｒ đầu tiên khác trắng, dùng cho nhóm TC-DR-*. Null = master rỗng. */
    let firstDoctor: string | null = null
    /** Bệnh nhân được mượn để dựng dòng 介護 ở TC-KAIGO-2; dọn ở afterAll. */
    let seededPatNos: number[] = []

    /** Tenant có bật cổng mật khẩu 医院 không — đọc từ 医院マスタ ở beforeAll. */
    let clinicGateArmed = false

    // ── Thao tác dùng lại ────────────────────────────────────────────────────

    /** Combo Ｄｒ． trong dialog (Radix SelectTrigger → role="combobox"). */
    function drSelect(): Locator {
        return dialog.getByRole('combobox')
    }

    /**
     * Bấm F3 mở dialog và trả về BODY của request 来患集計 đã bay.
     *
     * Query gate `enabled: open` nên phải đăng ký chờ TRƯỚC khi nhấn phím.
     * FKeyScopeProvider preventDefault F1–F12 nên F3 không kích search của Chrome.
     *
     * Endpoint là POST chứ không phải GET, và tham số nằm trong THÂN chứ không
     * phải query string: màn này có cổng mật khẩu 医院 (xem nhóm TC-PASS-*), mà
     * mật khẩu trên query string sẽ bị ghi vào access log. Đây là lý do helper
     * trả `SummaryBody` thay vì `URL`.
     */
    async function openDialog(): Promise<SummaryBody> {
        const res = page.waitForResponse(
            (r) => SUMMARY_URL.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60000 },
        )
        await page.keyboard.press('F3')
        // Tenant có bật cổng thì F3 hỏi mật khẩu trước; qua cổng rồi 来患集計 mới
        // mở. Xử lý ở đây để mọi testcase khác không phải biết tới cổng.
        if (clinicGateArmed) await clearPasswordPrompt(CLINIC_PASSWORD)
        await expect(dialog).toBeVisible({ timeout: 30000 })
        const response = await res
        expect(
            response.status(),
            `POST 来患集計 trả ${response.status()} — BE chưa chạy bản có endpoint này?`,
        ).toBeLessThan(300)
        return (response.request().postDataJSON() ?? {}) as SummaryBody
    }

    /** Hộp mật khẩu 医院 (ClinicPasswordDialog) — Radix Dialog, role="dialog". */
    const passwordDialog = () => page.getByRole('dialog').filter({ hasText: 'パスワード入力' })

    /** Gõ mật khẩu vào hộp đang mở rồi 確定. */
    async function clearPasswordPrompt(password: string) {
        await expect(passwordDialog(), 'cổng đang bật mà F3 không hỏi mật khẩu').toBeVisible({
            timeout: 30000,
        })
        await passwordDialog().getByRole('textbox').fill(password)
        await passwordDialog().getByRole('button', { name: 'F9 確定' }).click()
    }

    /** Đóng bằng F10 (nút 戻る của dialog); Escape KHÔNG được dùng — xem Rule 10.4. */
    async function closeDialog() {
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 30000 })
    }

    /**
     * Đọc TOÀN BỘ 18 dòng.
     *
     * Lưới ảo hoá: vùng cuộn chỉ cao ~380px (dialog 640px trừ header + thanh
     * 検索 + footer) trong khi 18 dòng × 32px = 576px ⇒ `rows()` chỉ thấy ~12
     * dòng. Cuộn từng nhịp và gom lại theo `data-testid="row-<code>"`.
     */
    async function readAllRows(): Promise<Map<string, GridRow>> {
        const map = new Map<string, GridRow>()
        const sc = scroller(dialog)
        await expect(sc, 'lưới 来患集計 không render').toBeVisible({ timeout: 30000 })
        await expect(rows(dialog).first()).toBeVisible({ timeout: 30000 })

        const max = await sc.evaluate((el) => el.scrollHeight - el.clientHeight)
        const STEP_PX = 200

        for (let top = 0; ; top += STEP_PX) {
            const target = Math.min(top, Math.max(max, 0))
            await sc.evaluate((el, t) => {
                el.scrollTop = t
            }, target)
            // Chờ virtualizer vẽ xong nhịp này, KHÔNG dùng sleep (Rule 7).
            await expect(rows(dialog).first()).toBeVisible({ timeout: 15000 })

            const visible = await rows(dialog).all()
            for (const row of visible) {
                const testId = await row.getAttribute('data-testid')
                const code = testId?.replace(/^row-/, '') ?? ''
                if (code === '' || map.has(code)) continue

                const label = (await row.getByTestId('cell-label').innerText()).trim()
                const values = {} as Record<NumericCol, number | null>
                for (const col of NUMERIC_COL_IDS) {
                    const raw = await row.getByTestId(`cell-${col}`).innerText()
                    values[col] = parseCell(raw, `${code}.${col}`)
                }
                map.set(code, { label, values })
            }
            if (target >= max) break
        }
        return map
    }

    /**
     * Gõ lại 診療日 trên màn danh sách (chỉ khi TEST_TRT_DT ép ngày khác hôm nay).
     *
     * EraDateField không có aria-label nên bám theo hàng chứa nhãn 診療日:
     * 1 combobox (元号) + 3 textbox (年/月/日) theo đúng thứ tự render.
     */
    async function setTrtDate(iso: string) {
        const { y: yyyy, m: mm, d: dd } = isoParts(iso)
        const row = page.getByText('診療日', { exact: true }).locator('..')
        const boxes = row.getByRole('textbox')
        await expect(boxes.first(), 'không tìm thấy ô 年 của 診療日').toBeVisible({ timeout: 30000 })

        // 元号 lấy từ chính danh sách của app (mst-era) thay vì hardcode 令和/平成:
        // ngày test có thể rơi vào bất kỳ 元号 nào.
        await row.getByRole('combobox').click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15000 })
        const eraNames = (await listbox.getByRole('option').allInnerTexts())
            .map((t) => t.trim())
            .filter((t) => t !== '')
        const era = yyyy >= 2019 ? '令和' : yyyy >= 1989 ? '平成' : '昭和'
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

    /**
     * Nạp lại `/treatments` từ đầu.
     *
     * Cần cho nhóm TC-PASS-*: `mstIin1QueryOptions` đặt `staleTime: 10 phút`
     * (shared/queries/mst-iin1.ts) nên trong một lần chạy nó KHÔNG gọi lại —
     * `page.route` chỉ ăn khi có QueryClient mới, tức là tải lại trang thật.
     *
     * Thử lại tối đa 3 lần: `accessToken` chỉ nằm trong RAM (GUIDELINE Rule 10.2)
     * nên mỗi lần tải lại là một vòng refresh từ cookie `rt`, và lặp nhiều lần
     * trong cùng phiên đã từng cho ra trang trắng. Cùng cách
     * `kasan-buttons.spec.ts:openTreatmentScreen` xử lý.
     */
    async function backToListAndReload() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.locator('[data-fkey="F3"]')).toBeVisible({ timeout: 30000 })
                if (OVERRIDE_DATE) await setTrtDate(TRT_DT)
                return
            } catch (e) {
                lastErr = e
                console.log(`backToListAndReload: lần ${attempt}/3 không dựng được màn — nạp lại`)
            }
        }
        throw lastErr
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

        // Đọc cờ cổng mật khẩu THẬT của tenant ngay khi vào màn: nó quyết định
        // F3 có hỏi mật khẩu hay không, và do đó quyết định cả file chạy được hay
        // phải skip. Bắt response thay vì query DB để spec không cần TEST_DB.
        const iinRes = page.waitForResponse((r) => MST_IIN1_URL.test(r.url()), { timeout: 60000 })
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        // Footer F-key strip dựng xong = màn danh sách sẵn sàng nhận F3.
        await expect(page.locator('[data-fkey="F3"]')).toBeVisible({ timeout: 60000 })

        const iinBody = (await (await iinRes).json()) as { data?: { passFlg?: unknown } }
        clinicGateArmed = Number(iinBody.data?.passFlg) === 1
        console.log(
            clinicGateArmed
                ? `医院パスワードゲート: BẬT${CLINIC_PASSWORD === '' ? ' — thiếu TEST_CLINIC_PASSWORD' : ''}`
                : '医院パスワードゲート: tắt',
        )

        dialog = page.getByRole('dialog').filter({ hasText: '来 患 集 計' })

        if (OVERRIDE_DATE) {
            console.log(`TEST_TRT_DT=${TRT_DT} → gõ lại 診療日 trước khi mở dialog`)
            await setTrtDate(TRT_DT)
        }
    })

    test.afterAll(async () => {
        // Dọn TRƯỚC khi đóng page: dòng 介護 do TC-KAIGO-2 dựng là dữ liệu test
        // thuần, để lại sẽ làm lệch 来患集計 của mọi lần chạy sau (và của người
        // đang xem app). Xoá cứng vì đây là dòng do test tạo, không cần lịch sử.
        for (const patNo of seededPatNos) {
            const removed = await deleteTreatmentRows(patNo, TRT_DT)
            console.log(`dọn ${removed} dòng 介護 test của 患者番号 ${patNo} (${TRT_DT})`)
        }
        seededPatNos = []
        await page?.close()
    })

    // Cổng bật mà không có mật khẩu thì server chặn MỌI request số liệu — mọi
    // assert về con số sẽ đỏ vì thiếu cấu hình, không phải vì app sai. Skip kèm
    // log rõ ràng (Rule 18) thay vì để suite đỏ hàng loạt.
    test.beforeEach(() => {
        skipWithReason(
            clinicGateArmed && CLINIC_PASSWORD === '',
            '医院マスタ đang bật cổng mật khẩu (pass_flg = 1). Chạy lại kèm ' +
                'TEST_CLINIC_PASSWORD=<mật khẩu> để spec qua được cổng.',
        )
    })

    // ── Mở màn ───────────────────────────────────────────────────────────────

    test('TC-OPEN-1 — F3 gọi đúng tháng của 診療日 và KHÔNG kèm drNo', async () => {
        const body = await openDialog()

        expect(
            body.trtDt,
            'trtDt gửi lên khác 診療日 đang chọn — dialog đang lấy ngày từ đâu?',
        ).toBe(TRT_DT)
        expect(
            body.drNo ?? null,
            'cboDr đang trắng mà vẫn gửi drNo — WinForm bỏ HẲN predicate DR_NO',
        ).toBeNull()

        baseline = await readAllRows()
        await step()
    })

    test('TC-OPEN-2 — đúng 18 dòng, đúng thứ tự và nhãn của frm203046', async () => {
        expect(
            [...baseline.keys()].length,
            `đọc được ${baseline.size} dòng, BE phải trả đúng ${ROW_CODES.length}`,
        ).toBe(ROW_CODES.length)

        for (const code of ROW_CODES) {
            const row = baseline.get(code)
            expect(row, `thiếu dòng ${code}`).toBeDefined()
            expect(row!.label.normalize('NFKC'), `nhãn dòng ${code} sai`).toBe(
                ROW_LABELS[code].normalize('NFKC'),
            )
        }

        // Thứ tự: chỉ so phần đang render (lưới ảo hoá) theo PREFIX.
        const visibleCodes = (await rows(dialog).evaluateAll((els) =>
            els.map((el) => (el.getAttribute('data-testid') ?? '').replace(/^row-/, '')),
        )) as string[]
        const startAt = ROW_CODES.indexOf(visibleCodes[0] as RowCode)
        expect(startAt, `dòng đầu đang render (${visibleCodes[0]}) không nằm trong 18 mã đã biết`).toBeGreaterThanOrEqual(0)
        expect(
            visibleCodes,
            'thứ tự dòng KHÁC WinForm — 小計 phải nằm NGAY SAU nhóm của nó',
        ).toEqual(ROW_CODES.slice(startAt, startAt + visibleCodes.length))
        await step()
    })

    test('TC-OPEN-3 — lưới client-side: không skeleton, không empty', async () => {
        // 18 dòng là mảng client (`rows={rows}`), `getRow` resolve ngay ⇒ có
        // skeleton nghĩa là count/getRow bị tính sai.
        await expect(skeletons(dialog), 'lưới hằng 18 dòng mà vẫn render skeleton').toHaveCount(0)
        await expect(emptyState(dialog), 'lưới 18 dòng mà hiện empty state').toHaveCount(0)
        await step()
    })

    // ── Parity WinForm ───────────────────────────────────────────────────────

    test('TC-SORT-1 — KHÔNG cột nào sort được (SortMode = NotSortable)', async () => {
        for (const label of HEADER_LABELS) {
            await expect(
                dialog.getByRole('button', { name: new RegExp(`^${label}\\s*[▲▼]?$`) }),
                `cột 「${label}」 đang là nút sort — WinForm đặt NotSortable cho MỌI cột, ` +
                    'sort sẽ đẩy 社保合計/国保合計 ra khỏi nhóm của chúng',
            ).toHaveCount(0)
        }
        // Header sortable của VirtualListTable luôn kèm aria-sort; không cột nào có.
        await expect(
            dialog.locator('[aria-sort]'),
            'còn header mang aria-sort ⇒ vẫn còn cột sortable',
        ).toHaveCount(0)
        await step()
    })

    test('TC-KAIGO-1 — 居宅 / 居宅（衛）: 6 ô cuối in "-", 3 ô đầu vẫn là số', async () => {
        for (const code of KAIGO_CODES) {
            const row = baseline.get(code)!
            for (const col of SUPPRESSED_COLS) {
                expect(
                    row.values[col],
                    `${ROW_LABELS[code]}.${col} phải là '-' (WinForm ghi đè cell 3..8 khi flg=2)`,
                ).toBeNull()
            }
            for (const col of ['cnt', 'totalScore', 'aveScore'] as NumericCol[]) {
                expect(
                    row.values[col],
                    `${ROW_LABELS[code]}.${col} bị chặn nhầm — 介護 vẫn có 人数/合計点数/平均点数`,
                ).not.toBeNull()
            }
        }
        await step()
    })

    test('TC-CALC-1 — 保険合計 = tổng 12 dòng chi tiết', async () => {
        const total = baseline.get('insuranceTotal')!
        for (const col of ['cnt', 'totalScore', 'days', 'syosin', 'saiSyosin', 'saisin', 'houmon'] as NumericCol[]) {
            expect(
                num(total, col, 'insuranceTotal'),
                `保険合計.${col} ≠ tổng 12 dòng 保険種別`,
            ).toBe(sumOf(baseline, DETAIL_CODES, col))
        }
        await step()
    })

    test('TC-CALC-2 — 社保合計 / 国保合計 = tổng đúng nhóm 5 dòng của mình', async () => {
        const groups: [RowCode, RowCode[]][] = [
            ['shahoTotal', SHAHO_GROUP],
            ['kokuhoTotal', KOKUHO_GROUP],
        ]
        for (const [code, members] of groups) {
            const row = baseline.get(code)!
            for (const col of ['cnt', 'totalScore', 'days', 'syosin', 'saiSyosin', 'saisin', 'houmon'] as NumericCol[]) {
                expect(
                    num(row, col, code),
                    `${ROW_LABELS[code]}.${col} ≠ tổng nhóm (${members.map((m) => ROW_LABELS[m]).join('+')})`,
                ).toBe(sumOf(baseline, members, col))
            }
        }
        // 後期高齢 + 公費単独 KHÔNG thuộc nhóm nào nhưng VẪN vào 保険合計 — đây là
        // chỗ dễ port sai nhất (WinForm cộng total riêng cho cả 12 dòng).
        const shaho = num(baseline.get('shahoTotal')!, 'cnt', 'shahoTotal')
        const kokuho = num(baseline.get('kokuhoTotal')!, 'cnt', 'kokuhoTotal')
        const outside =
            num(baseline.get('kokiKorei')!, 'cnt', 'kokiKorei') +
            num(baseline.get('kohiTandoku')!, 'cnt', 'kohiTandoku')
        expect(
            num(baseline.get('insuranceTotal')!, 'cnt', 'insuranceTotal'),
            '保険合計 phải gồm cả 後期高齢 + 公費単独, không chỉ 社保合計 + 国保合計',
        ).toBe(shaho + kokuho + outside)
        await step()
    })

    test('TC-CALC-3 — 合計 = 保険合計 + 居宅 + 居宅（衛） chỉ ở 人数 / 合計点数', async () => {
        const grand = baseline.get('grandTotal')!
        const insurance = baseline.get('insuranceTotal')!
        const kaigoSum = (col: NumericCol) => sumOf(baseline, KAIGO_CODES, col)

        expect(num(grand, 'cnt', 'grandTotal'), '合計.人数 sai').toBe(
            num(insurance, 'cnt', 'insuranceTotal') + kaigoSum('cnt'),
        )
        expect(num(grand, 'totalScore', 'grandTotal'), '合計.合計点数 sai').toBe(
            num(insurance, 'totalScore', 'insuranceTotal') + kaigoSum('totalScore'),
        )

        // Các cột còn lại CHÉP nguyên từ 保険合計 — cộng thêm 介護 vào đây là sai
        // (dòng 介護 không có 実日数/初診/…).
        for (const col of SUPPRESSED_COLS) {
            expect(
                num(grand, col, 'grandTotal'),
                `合計.${col} phải chép nguyên từ 保険合計 (frm203046.cs:387-392)`,
            ).toBe(num(insurance, col, 'insuranceTotal'))
        }
        await step()
    })

    test('TC-CALC-4 — 平均点数 và 点数/実日数 khớp Math.Round của WinForm', async () => {
        for (const [code, row] of baseline) {
            const cnt = num(row, 'cnt', code)
            const total = num(row, 'totalScore', code)
            expect(
                num(row, 'aveScore', code),
                `${row.label}: 平均点数 ≠ round(合計点数 ${total} / 人数 ${cnt})`,
            ).toBe(expectedAvg(total, cnt))

            // Dòng 介護 không có 実日数 → bỏ qua vế thứ hai.
            if (row.values.days === null) continue
            expect(
                num(row, 'ave', code),
                `${row.label}: 点数/実日数 ≠ round(合計点数 ${total} / 実日数 ${row.values.days})`,
            ).toBe(expectedAvg(total, row.values.days!))
        }
        await step()
    })

    test('TC-FORMAT-1 — 5 cột đầu có dấu phẩy ngăn nghìn, 4 cột sau in số trần', async () => {
        // Chỉ khẳng định được khi thật sự có số ≥ 1000; nếu tháng test toàn số nhỏ
        // thì nói rõ là CHƯA kiểm, đừng để tưởng là đã pass (Rule 18).
        const grouped: NumericCol[] = ['cnt', 'totalScore', 'aveScore', 'days', 'ave']
        let checked = 0
        for (const code of ROW_CODES) {
            const row = baseline.get(code)!
            for (const col of grouped) {
                const v = row.values[col]
                if (v === null || v < 1000) continue
                const raw = (await dialog.getByTestId(`row-${code}`).count())
                    ? (await dialog.getByTestId(`row-${code}`).getByTestId(`cell-${col}`).innerText()).trim()
                    : null
                if (raw === null) continue // dòng đang nằm ngoài vùng render
                expect(raw, `${ROW_LABELS[code]}.${col} = ${v} nhưng in không có dấu phẩy`).toContain(',')
                checked++
            }
        }
        if (checked === 0) {
            console.log(
                'TC-FORMAT-1: tháng test không có số ≥ 1000 đang hiển thị → CHƯA kiểm được ' +
                    'dấu phẩy. Đặt TEST_TRT_DT vào tháng có dữ liệu để kiểm thật.',
            )
        }
        await step()
    })

    // ── Bộ lọc Ｄｒ． ─────────────────────────────────────────────────────────

    test('TC-DR-1 — combo mở ra có dòng trắng đầu tiên và danh sách Ｄｒ', async () => {
        await drSelect().click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15000 })

        const options = await listbox.getByRole('option').allInnerTexts()
        expect(options.length, 'combo Ｄｒ． rỗng — mst-iin-2 (user_kbn=0) không trả gì?').toBeGreaterThan(0)
        expect(
            (options[0] ?? '').trim(),
            'mục đầu tiên phải là DÒNG TRẮNG (makeIinMstCombo COMBO_SPC_ON)',
        ).toBe('')

        const named = options.map((t) => t.trim()).filter((t) => t !== '')
        firstDoctor = named[0] ?? null
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 15000 })

        skipWithReason(firstDoctor === null, 'master Ｄｒ (mst_iin_2 user_kbn=0) chưa có ai')
        await step()
    })

    test('TC-DR-2 — đổi combo mà KHÔNG bấm 検索 thì không gọi lại API', async () => {
        skipWithReason(firstDoctor === null, 'không có Ｄｒ nào để chọn (xem TC-DR-1)')

        let called = false
        const watch = (r: { url: () => string }) => {
            if (SUMMARY_URL.test(r.url())) called = true
        }
        page.on('request', watch)

        await drSelect().click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 15000 })
        await listbox.getByRole('option', { name: firstDoctor!, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 15000 })
        await expect(drSelect()).toContainText(firstDoctor!)

        // Không có cách nào "chờ một request KHÔNG xảy ra"; mượn một mốc có thật —
        // lưới vẫn đang hiển thị đúng bộ số cũ — rồi mới gỡ listener.
        await expect(
            dialog.getByTestId('row-shahoHonnin').getByTestId('cell-cnt'),
        ).toBeVisible({ timeout: 15000 })
        page.off('request', watch)

        expect(
            called,
            'đổi combo đã gọi lại API — WinForm chỉ chạy makeDspData khi bấm 検索',
        ).toBe(false)
        await step()
    })

    test('TC-DR-3 — bấm 検索 mới gửi drNo, và số liệu không vượt bản すべて', async () => {
        skipWithReason(firstDoctor === null, 'không có Ｄｒ nào để chọn (xem TC-DR-1)')

        const res = page.waitForResponse(
            (r) => SUMMARY_URL.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60000 },
        )
        await dialog.getByRole('button', { name: '検索' }).click()
        const body = ((await res).request().postDataJSON() ?? {}) as SummaryBody

        expect(body.trtDt, '検索 làm đổi cả tháng').toBe(TRT_DT)
        const drNo = Number(body.drNo)
        expect(drNo, `検索 với Ｄｒ「${firstDoctor}」 mà drNo không phải số dương`).toBeGreaterThan(0)

        // Lọc theo một Ｄｒ là THU HẸP tập dòng trn_trn ⇒ mọi ô không thể lớn hơn.
        const filtered = await readAllRows()
        for (const code of ROW_CODES) {
            const before = baseline.get(code)!
            const after = filtered.get(code)!
            for (const col of ['cnt', 'totalScore'] as NumericCol[]) {
                if (before.values[col] === null || after.values[col] === null) continue
                expect(
                    after.values[col]!,
                    `lọc Ｄｒ mà ${ROW_LABELS[code]}.${col} lại TĂNG (${before.values[col]} → ${after.values[col]})`,
                ).toBeLessThanOrEqual(before.values[col]!)
            }
        }
        await step()
    })

    test('TC-DR-4 — đóng rồi mở lại: combo về trắng, request lại không có drNo', async () => {
        await closeDialog()
        await step()

        const body = await openDialog()
        expect(
            body.drNo ?? null,
            'mở lại vẫn còn drNo — WinForm dựng lại cboDr trắng mỗi lần vào frm203046',
        ).toBeNull()
        // Combo trắng KHÔNG hiện placeholder: `dr=''` được map sang
        // EMPTY_SELECT_VALUE, tức vẫn là một SelectItem có thật (nội dung là một
        // dấu cách) → chỉ khẳng định được là tên Ｄｒ đã biến mất khỏi trigger.
        if (firstDoctor !== null) {
            await expect(
                drSelect(),
                'combo Ｄｒ． không reset về trắng khi mở lại',
            ).not.toContainText(firstDoctor)
        }
        await step()
    })

    // ── Phím chức năng ───────────────────────────────────────────────────────

    test('TC-FKEY-1 — F1 印刷 hỏi Q00039 trước khi in; huỷ thì không in', async () => {
        // RPT203004 ĐÃ được port (frm203046.btnF1_Click → printProc), nên F1 không
        // còn là stub 開発中 nữa: nó hỏi Q00039「用紙をセットして下さい。」rồi mới
        // dựng datasource và đẩy sang agent.
        //
        // Chỉ kiểm tới hộp xác nhận rồi bấm No: đi tiếp sẽ gọi agent in thật, mà
        // `/v1/print` bung hộp thoại Windows và treo Playwright.
        await dialog.getByRole('button', { name: 'F1 印刷' }).click()

        // confirmDialog dùng Radix AlertDialog → role="alertdialog", KHÔNG phải dialog.
        const confirm = page.getByRole('alertdialog')
        await expect(confirm, 'F1 không bung hộp xác nhận in').toBeVisible({ timeout: 15000 })
        await expect(confirm).toContainText('用紙をセットして下さい')

        // Nhãn mặc định của confirmDialog là Yes/No (tiếng Anh) — chịu cả tiếng
        // Nhật phòng khi call-site đổi sang truyền yesLabel/noLabel (Rule 13.2).
        let printCalled = false
        const watch = (r: { url: () => string }) => {
            if (/monthly-visit-summary-datasource/.test(r.url())) printCalled = true
        }
        page.on('request', watch)
        await confirm.getByRole('button', { name: /^(No|いいえ)$/ }).click()
        await expect(confirm).toBeHidden({ timeout: 15000 })
        page.off('request', watch)

        expect(printCalled, 'huỷ Q00039 mà vẫn dựng datasource in').toBe(false)

        // Quan trọng: F1 KHÔNG được đóng dialog (bản mock cũ đóng — đó là lỗi).
        await expect(dialog, 'F1 印刷 lại đóng dialog — WinForm F1 chỉ in, không thoát').toBeVisible()
        await step()
    })

    test('TC-FKEY-2 — F10 戻る đóng dialog', async () => {
        await closeDialog()
        await expect(page.locator('[data-fkey="F3"]'), 'đóng dialog xong không về màn danh sách').toBeVisible()
        await step()
    })

    // ── Đối chiếu DB ─────────────────────────────────────────────────────────

    test('TC-DB-1 — 居宅 / 居宅（衛）khớp chính xác trn_trn', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đọc trn_trn (xem tests/db.ts)')

        // Hai dòng 介護 là nhánh SQL ĐƠN GIẢN nhất của frm203046 (kbn 5/6): không
        // join bảo hiểm, không 保険種別 → viết lại được ở đây làm ORACLE độc lập.
        // 人数 = số cặp (pat_no, pat_br), 合計点数 = tổng price.
        const monthStart = monthStartOf(TRT_DT)

        const expectedOf = async (trtSbs: number[]) =>
            withDb(async (c) => {
                const { rows: r } = await c.query<{ cnt: string; total: string }>(
                    `SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(total_score), 0)::bigint AS total
                       FROM (
                         SELECT SUM(price) AS total_score
                           FROM view_trn_trn_active
                          WHERE trt_dt >= $1::date
                            AND trt_dt < ($1::date + INTERVAL '1 month')
                            AND price <> 0
                            AND trt_cd = $2
                            AND trt_sb = ANY($3::int[])
                          GROUP BY pat_no, pat_br
                       ) t`,
                    [monthStart, KAIGO_TRT_CD, trtSbs],
                )
                const first = r[0]
                if (!first) throw new Error('query 居宅 không trả dòng nào (aggregate luôn phải có 1)')
                return { cnt: Number(first.cnt), total: Number(first.total) }
            })

        const cases: [RowCode, number[]][] = [
            ['homeCare', HOME_CARE_TRT_SBS],
            ['homeCareHygienist', HOME_CARE_HYGIENIST_TRT_SBS],
        ]
        for (const [code, trtSbs] of cases) {
            const want = await expectedOf(trtSbs)
            const row = baseline.get(code)!
            expect(num(row, 'cnt', code), `${ROW_LABELS[code]}.人数 khác DB`).toBe(want.cnt)
            expect(num(row, 'totalScore', code), `${ROW_LABELS[code]}.合計点数 khác DB`).toBe(want.total)
            console.log(`TC-DB-1 ${ROW_LABELS[code]}: 人数=${want.cnt}, 合計点数=${want.total}`)
        }
    })

    test('TC-DB-2 — 保険合計 nằm trong trần điểm không tự費 của tháng', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đọc trn_trn (xem tests/db.ts)')

        // Không chép lại cả bậc thang CASE insu_type (chép = test tự nghiệm chính
        // mình). Thay vào đó chốt một bất biến đủ chặt để bắt lỗi ĐI SAI THÁNG /
        // SAI CỘT: 保険合計 chỉ gộp các dòng jihi_flg=0 có bảo hiểm map được, nên
        // phải ≤ tổng price của mọi dòng jihi_flg=0 trong tháng, và > 0 nếu tháng
        // đó thực sự có dữ liệu bảo hiểm.
        const { y: yyyy, m: mm } = isoParts(TRT_DT)
        const monthStart = monthStartOf(TRT_DT)

        const ceiling = await withDb(async (c) => {
            const { rows: r } = await c.query<{ total: string }>(
                `SELECT COALESCE(SUM(price), 0)::bigint AS total
                   FROM view_trn_trn_active
                  WHERE trt_dt >= $1::date
                    AND trt_dt < ($1::date + INTERVAL '1 month')
                    AND jihi_flg = 0
                    AND price <> 0`,
                [monthStart],
            )
            const first = r[0]
            if (!first) throw new Error('query trần điểm không trả dòng nào')
            return Number(first.total)
        })

        const got = num(baseline.get('insuranceTotal')!, 'totalScore', 'insuranceTotal')
        expect(got, `保険合計.合計点数 (${got}) vượt tổng điểm bảo hiểm của tháng (${ceiling})`).toBeLessThanOrEqual(ceiling)
        if (ceiling === 0) {
            console.log(
                `TC-DB-2: tháng ${yyyy}/${mm} KHÔNG có dòng jihi_flg=0 nào → 来患集計 toàn 0 là đúng. ` +
                    'Đặt TEST_TRT_DT vào tháng có dữ liệu để test có sức nặng.',
            )
        } else {
            expect(got, `tháng có ${ceiling} điểm bảo hiểm mà 保険合計 = 0 ⇒ nghi sai tháng hoặc sai join`).toBeGreaterThan(0)
        }
    })

    // ── 介護: dựng dữ liệu test rồi kiểm bằng số thật ─────────────────────────

    test('TC-KAIGO-2 — dựng dòng 居宅 / 居宅（衛）rồi mở lại: số khớp đúng phần vừa tạo', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để dựng dòng 介護 test (xem tests/db.ts)')

        // Mượn bệnh nhân CÓ dòng thật trong tháng (seedTreatmentRows clone
        // pat_br/insu_cd từ một dòng có sẵn của họ — không có dòng nào thì INSERT
        // chèn 0 bản ghi và test sẽ pass sai) và CHƯA có dòng 599 nào trong tháng
        // (đã có thì họ được đếm sẵn vào 人数, phép so delta hoá vô nghĩa).
        const patNos = await withDb(async (c) => {
            const { rows: r } = await c.query<{ pat_no: number }>(
                `SELECT pat_no
                   FROM view_trn_trn_active
                  WHERE trt_dt >= $1::date
                    AND trt_dt < ($1::date + INTERVAL '1 month')
                    AND disp_no < ${SEED_DISP_BASE}
                  GROUP BY pat_no
                 HAVING COUNT(*) FILTER (WHERE trt_cd = $2) = 0
                  ORDER BY pat_no
                  LIMIT $3`,
                [monthStartOf(TRT_DT), KAIGO_TRT_CD, KAIGO_SEED_ROWS.length],
            )
            return r.map((row) => row.pat_no)
        })
        skipWithReason(
            patNos.length < KAIGO_SEED_ROWS.length,
            `tháng ${TRT_DT.slice(0, 7)} không đủ ${KAIGO_SEED_ROWS.length} bệnh nhân sạch dòng 599 để dựng dữ liệu 介護`,
        )

        for (let i = 0; i < KAIGO_SEED_ROWS.length; i++) {
            const patNo = patNos[i]!
            await seedTreatmentRows(
                patNo,
                TRT_DT,
                KAIGO_SEED_ROWS[i]!.map((row) => ({
                    trtCd: KAIGO_TRT_CD,
                    trtSb: row.trtSb,
                    trtPt: row.trtPt,
                    // WinForm ModSave.SetKaigoFlg đóng dấu 3 cho mọi dòng 599 —
                    // và nhánh kbn 5/6 CỐ Ý không lọc jihi_flg, nên dòng test phải
                    // mang đúng cờ này mới chứng minh được điều đó.
                    jihiFlg: 3,
                    dspTrt: `居宅療養管理指導(E2E ${row.trtSb})`,
                })),
            )
            // Nhớ NGAY để afterAll dọn được kể cả khi assert bên dưới ném.
            seededPatNos = [...seededPatNos, patNo]
        }
        console.log(`dựng dòng 介護 test cho 患者番号 ${patNos.join(', ')} (${TRT_DT})`)

        await openDialog()
        const after = await readAllRows()
        const delta = expectedKaigoDelta()

        for (const code of KAIGO_CODES) {
            const want = delta[code as 'homeCare' | 'homeCareHygienist']
            const before = baseline.get(code)!
            const now = after.get(code)!

            expect(
                num(now, 'cnt', code) - num(before, 'cnt', code),
                `${ROW_LABELS[code]}.人数 phải đếm theo NGƯỜI (pat_no, pat_br), không theo số dòng`,
            ).toBe(want.cnt)
            expect(
                num(now, 'totalScore', code) - num(before, 'totalScore', code),
                `${ROW_LABELS[code]}.合計点数 không cộng đúng phần vừa dựng`,
            ).toBe(want.total)
            expect(
                num(now, 'aveScore', code),
                `${ROW_LABELS[code]}.平均点数 không tính lại theo số mới`,
            ).toBe(expectedAvg(num(now, 'totalScore', code), num(now, 'cnt', code)))

            // Có số rồi thì 6 ô kia VẪN phải là '-' — dễ hỏng nhất đúng lúc này.
            for (const col of SUPPRESSED_COLS) {
                expect(
                    now.values[col],
                    `${ROW_LABELS[code]}.${col} hiện số sau khi có dữ liệu — phải luôn là '-'`,
                ).toBeNull()
            }
        }

        // jihi_flg = 3 ⇒ KHÔNG được lọt vào 保険合計 (nhánh kbn 1 lọc jihi_flg = 0)…
        expect(
            num(after.get('insuranceTotal')!, 'totalScore', 'insuranceTotal'),
            '保険合計 đổi sau khi thêm dòng 介護 — nhánh kbn 1 đang thiếu lọc jihi_flg = 0',
        ).toBe(num(baseline.get('insuranceTotal')!, 'totalScore', 'insuranceTotal'))

        // …nhưng PHẢI vào 合計 (frm203046.cs:383-386).
        expect(
            num(after.get('grandTotal')!, 'totalScore', 'grandTotal'),
            '合計 không cộng 介護 vào 合計点数',
        ).toBe(
            num(after.get('insuranceTotal')!, 'totalScore', 'insuranceTotal') +
                num(after.get('homeCare')!, 'totalScore', 'homeCare') +
                num(after.get('homeCareHygienist')!, 'totalScore', 'homeCareHygienist'),
        )
        await step()
    })

    // ── 医院パスワードゲート (frm203001.cs:357-384 → frm902014) ────────────────
    //
    // WinForm: nếu 医院マスタ.pass_flg = 1 thì F3 phải qua hộp mật khẩu frm902014
    // rồi mới mở 来患集計. Bản web KHÔNG so mật khẩu ở client — mật khẩu đã lưu
    // không bao giờ rời server; FE chỉ nhận CỜ bật/tắt và gửi chuỗi người dùng gõ
    // theo request lấy số liệu để server phán.
    //
    // Tenant demo đang `pass_flg = 0` nên nhánh "có cổng" phải giả lập bằng cách
    // chặn `GET /tenant/mst-iin1`. Việc giả lập chỉ đổi thứ FE TIN, không đổi
    // hành vi server — đó cũng chính là điều TC-PASS-3 kiểm: cờ bị sửa cũng
    // không mở được cửa. Nhánh server từ chối thì chặn luôn cả endpoint số liệu,
    // vì cổng thật ở BE đã có 11 unit test riêng (ClinicPasswordGateTests);
    // ở đây kiểm phần FE và dây nối.

    /**
     * Bắt `GET /tenant/mst-iin1` và ép `passFlg` thành giá trị mong muốn.
     *
     * Dựng lại body tường minh chứ KHÔNG dùng `fulfill({ response, json })`:
     * cách đó giữ nguyên header của response gốc, trong đó có `Content-Length`
     * của body CŨ, nên body mới dài hơn sẽ bị cắt và FE nhận JSON hỏng — biểu
     * hiện là mock im lặng không có tác dụng (đã dính thật).
     */
    async function mockPassFlg(passFlg: number) {
        await page.route(/\/tenant\/mst-iin1(\?|$)/, async (route) => {
            const res = await route.fetch()
            const body = (await res.json()) as { data?: Record<string, unknown> }
            if (body.data) body.data.passFlg = passFlg
            await route.fulfill({
                status: res.status(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
    }

    /**
     * Nạp lại màn danh sách rồi CHỜ 医院マスタ về, khẳng định `passFlg` đúng như
     * mong đợi trước khi trả quyền điều khiển.
     *
     * Bắt buộc phải chờ: `requiresClinicPassword(undefined)` là false, nên bấm F3
     * trong lúc query còn bay sẽ mở thẳng 来患集計 và testcase đỏ oan. (Đây cũng
     * là một khoảng hở thật của app — xem ghi chú ở TC-PASS-3.)
     */
    async function reloadWithPassFlg(expected: number) {
        const res = page.waitForResponse((r) => /\/tenant\/mst-iin1(\?|$)/.test(r.url()), {
            timeout: 60000,
        })
        await backToListAndReload()
        const body = (await (await res).json()) as { data?: { passFlg?: unknown } }
        expect(
            Number(body.data?.passFlg),
            `passFlg tới FE không phải ${expected} — kiểm lại page.route`,
        ).toBe(expected)
    }

    test('TC-PASS-1 — /tenant/mst-iin1 KHÔNG BAO GIỜ trả mật khẩu đã lưu', async () => {
        // Bất biến quan trọng nhất của cả tính năng: FE chỉ được biết CỜ.
        // Chạy trên BE thật, không giả lập gì.
        const res = page.waitForResponse(
            (r) => /\/tenant\/mst-iin1(\?|$)/.test(r.url()),
            { timeout: 60000 },
        )
        await backToListAndReload()
        const body = (await (await res).json()) as { data?: Record<string, unknown> }

        expect(body.data, 'không đọc được 医院マスタ').toBeTruthy()
        expect(
            Object.keys(body.data!),
            'response 医院マスタ có trường chứa mật khẩu — secret phải ở lại server',
        ).not.toContain('pass')
        expect(
            'passFlg' in body.data!,
            'thiếu passFlg — FE không biết có phải hỏi mật khẩu hay không',
        ).toBe(true)
        await step()
    })

    test('TC-PASS-2 — F3 hỏi hay không, và có gửi password hay không, đúng theo cờ thật', async () => {
        // Một testcase phủ cả hai trạng thái tenant: cờ tắt thì mở thẳng và KHÔNG
        // được gửi password; cờ bật thì phải hỏi và password phải đi kèm.
        const body = await openDialog()

        if (clinicGateArmed) {
            expect(
                body.password,
                'cổng đang bật mà request không mang password — server sẽ chặn',
            ).toBe(CLINIC_PASSWORD)
        } else {
            await expect(
                passwordDialog(),
                'tenant không bật cổng mà vẫn hỏi mật khẩu',
            ).toHaveCount(0)
            expect(
                body.password ?? null,
                'không có cổng mà vẫn gửi password — chỉ nên gửi khi thực sự có nhập',
            ).toBeNull()
        }
        await step()
        await closeDialog()
    })

    test('TC-PASS-3 — pass_flg = 1: F3 hỏi mật khẩu và CHƯA gọi API số liệu', async () => {
        // Điểm cốt lõi: số liệu không được rời server trước khi qua cổng.
        await mockPassFlg(1)
        // Chờ cờ về hẳn rồi mới bấm F3: `requiresClinicPassword(undefined)` là
        // false, nên nếu 医院マスタ chưa kịp về thì F3 mở thẳng 来患集計 mà KHÔNG
        // hỏi. Server vẫn chặn nên không thủng bảo mật, nhưng đúng ra FE nên coi
        // "chưa biết cờ" là "phải hỏi" — đã báo lại cho dev.
        await reloadWithPassFlg(1)

        let summaryCalled = false
        const watch = (r: { url: () => string }) => {
            if (SUMMARY_URL.test(r.url())) summaryCalled = true
        }
        page.on('request', watch)

        await page.keyboard.press('F3')
        await expect(passwordDialog(), 'pass_flg = 1 mà F3 không hỏi mật khẩu').toBeVisible({
            timeout: 30000,
        })
        await expect(dialog, '来患集計 mở ra trước khi qua cổng').toHaveCount(0)
        page.off('request', watch)

        expect(summaryCalled, 'đã gọi API 来患集計 trước khi nhập mật khẩu').toBe(false)
        await step()
    })

    test('TC-PASS-4 — server từ chối: hộp vẫn mở, báo lỗi, 来患集計 KHÔNG mở', async () => {
        // Giả lập server bác bỏ. FE không được tự quyết định gì — nó chỉ gửi đi
        // rồi phản ứng theo kết quả.
        let sentPassword: string | undefined
        const reject = async (route: import('@playwright/test').Route) => {
            sentPassword = (route.request().postDataJSON() as SummaryBody | null)?.password
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    data: null,
                    error: {
                        code: 'TENANT.CLINIC_PASSWORD.INVALID',
                        message: 'パスワードが正しくありません。',
                    },
                    meta: null,
                }),
            })
        }
        await page.route(SUMMARY_URL, reject)
        try {
            await passwordDialog().getByRole('textbox').fill('0000')
            await passwordDialog().getByRole('button', { name: 'F9 確定' }).click()

            await expect(
                passwordDialog(),
                'sai mật khẩu mà hộp đã đóng — WinForm chkPass giữ hộp mở để nhập lại',
            ).toBeVisible({ timeout: 30000 })
            await expect(passwordDialog().getByRole('alert')).toContainText('パスワード')
            await expect(dialog, 'server từ chối mà 来患集計 vẫn mở').toHaveCount(0)

            expect(sentPassword, 'FE không gửi mật khẩu lên server').toBe('0000')
        } finally {
            await page.unroute(SUMMARY_URL, reject)
        }
        await step()
    })

    test('TC-PASS-5 — server chấp nhận: hộp đóng, 来患集計 mở, body có password', async () => {
        // Không giả lập endpoint số liệu — để server thật phán. Cờ FE đang bị ép
        // bằng 1, còn mật khẩu phải là thứ server chấp nhận: tenant bật cổng thì
        // dùng TEST_CLINIC_PASSWORD, tenant tắt cổng thì chuỗi nào cũng được.
        const accepted = clinicGateArmed ? CLINIC_PASSWORD : '8931'
        const res = page.waitForResponse(
            (r) => SUMMARY_URL.test(r.url()) && r.request().method() === 'POST',
            { timeout: 60000 },
        )
        await passwordDialog().getByRole('textbox').fill(accepted)
        await passwordDialog().getByRole('button', { name: 'F9 確定' }).click()

        const body = ((await res).request().postDataJSON() ?? {}) as SummaryBody
        expect(body.password, 'mật khẩu không được đính vào request 来患集計').toBe(accepted)

        await expect(passwordDialog(), 'qua cổng rồi mà hộp mật khẩu chưa đóng').toHaveCount(0)
        await expect(dialog, 'qua cổng rồi mà 来患集計 không mở').toBeVisible({ timeout: 30000 })
        await step()
        await closeDialog()
    })

    test('TC-PASS-6 — huỷ hộp mật khẩu: không mở 来患集計, không gọi API', async () => {
        await reloadWithPassFlg(1)

        await page.keyboard.press('F3')
        await expect(passwordDialog()).toBeVisible({ timeout: 30000 })

        let summaryCalled = false
        const watch = (r: { url: () => string }) => {
            if (SUMMARY_URL.test(r.url())) summaryCalled = true
        }
        page.on('request', watch)

        // F10 戻る — nhánh huỷ của frm902014.
        await page.keyboard.press('F10')
        await expect(passwordDialog(), 'F10 không đóng hộp mật khẩu').toHaveCount(0)
        await expect(dialog, 'huỷ nhập mật khẩu mà 来患集計 vẫn mở').toHaveCount(0)
        page.off('request', watch)

        expect(summaryCalled, 'huỷ rồi mà vẫn gọi API 来患集計').toBe(false)
        await step()
    })
})
