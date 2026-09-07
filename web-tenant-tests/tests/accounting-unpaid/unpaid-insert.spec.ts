/**
 * 診療入力 F8 会計 → câu INSERT vào bảng `unpaid`
 * (`modAcc.LetAccData2` → `UnPaid.insertUnPaid`, modAcc.cs:626-707).
 *
 * MỘT CÂU INSERT = MỘT FILE. Hai spec cũ cùng soi đúng một câu lệnh đó, chỉ khác
 * cột nào đang bị nghi:
 *   · `sflg` (1=初診 / 2=再診 / 3=再初診) và `att_dr` (Dr đang chọn trên header);
 *   · `trt_cnt` (診療回 = 当日来院回数 của DÒNG CON TRỎ) — 1 ngày 2 lượt khám phải ra
 *     2 dòng 未精算 riêng.
 *
 * Từ 2026-09-04 khối `sflg/att_dr` đã canh thêm chính cột `trt_cnt`, tức hai file
 * đã bắt đầu chồng lên nhau — gộp là dọn đúng chỗ chồng đó.
 *
 * Hai khối giữ NGUYÊN VĂN nội dung hai file cũ.
 */

import { type Locator, type Page } from '@playwright/test'
import { dbEnabled, withDb, countRealTreatmentRowsInMonth, deleteTreatmentRows, deleteTreatmentRowsByDspTrt, seedTreatmentRows } from '../_shared/db'
import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

// ═══ nguyên văn từ unpaid-insert-parity.spec.ts (đã gộp vào file này) ══════════════════════════════════════
test.describe('cột sflg (1/2/3) và att_dr', () => {

/**
 * 診療入力 F8 会計 → các cột của bảng `unpaid` phải khớp WinForm. Hai chỗ đã đo
 * được lệch khi đối chiếu với SIM2000, cùng nằm trong MỘT câu INSERT
 * (`modAcc.LetAccData2` → `UnPaid.insertUnPaid`, modAcc.cs:626-707):
 *
 *   · `sflg`   (初診フラグ) — phải theo bảng mã **1=初診 / 2=再診 / 3=再初診**.
 *   · `att_dr` (担当医)     — phải là Dr đang chọn trên header 診療入力.
 *
 * Từ 2026-09-04 spec canh thêm một cột nữa của CÙNG câu INSERT:
 *
 *   · `trt_cnt` (診療回) — phải là 当日来院回数 của DÒNG CON TRỎ
 *     (`intSelectRaiin = CInt(hFG1[71, hFG1.CurrentCellAddress.Y])`, modAcc.cs:415),
 *     dòng 介護保険 lấy `+100` (modAcc.cs:673). Bản port từng để `1` cứng.
 *     Kịch bản NGÀY 2 LƯỢT KHÁM — nơi con số này thực sự phân biệt đúng/sai —
 *     nằm ở spec riêng `accounting-unpaid/unpaid-insert.spec.ts` (nó tự dựng dữ liệu).
 *     Ở đây chỉ neo `unpaid.trt_cnt` vào `trn_trn.raiin_cnt` trên DỮ LIỆU THẬT.
 *
 * Bug tester báo (2026-08-26):
 *   · `SFLG`   — hệ cũ ghi 3 cho ngày có 歯科初診料 và 2 cho ngày 歯科再診料;
 *                web ghi 2 cho cả hai ngày.
 *   · `ATT_DR` — hệ cũ ghi 16, web ghi 0.
 *
 * ─── Nguồn WinForm ───────────────────────────────────────────────────────────
 *  - `modAcc.LetAccData2` tự tính `intSyosin` rồi ghi vào UNPAID
 *    (modAcc.cs:639/686/710/751 → `unPaidData.sflg = intSyosin`):
 *        foreach 当日行 (表示順):
 *            if IsFirstVisitTreatCode(cd, sb)           → 初診; break   // :437
 *            if cd == 110 || (cd == 107 && sb == 1)                    // :440
 *                && 当日に「健診より」等の行             → 初診扱い; break  // :447-452
 *        intSyosin = 初診 ? (過去に初診あり ? 3 : 1) : 2                 // :465-474
 *  - 「過去に初診あり」 = `Trntrn.getKaikeiPastSyosinCnt` (Trntrn.cs:1274):
 *        TRNTRN, TRT_DT < 当月1日, và (TRT_CD = 100 OR (TRT_CD = 107 AND PAT_BR = 0)).
 *    ⚠️ Nhánh 107 khoá theo **PAT_BR** (枝番) chứ không phải TRT_SB — trông như lỗi
 *    gõ của legacy nhưng đây là routine ghi `unpaid.sflg`, nên bản port giữ
 *    nguyên và SQL kỳ vọng trong spec này cũng viết y hệt.
 *  - modAcc còn GHI ĐÈ giá trị của buiPrice bằng `intSyosin`
 *    (`cur_buiPriceData2.syosin_flg = intSyosin`, modAcc.cs:549) ⇒ giá trị của
 *    buiPrice không bao giờ tới được bảng UNPAID.
 *  - `unPaidData.att_dr = ModCommon.pintDrNo` (modAcc.cs:640). `pintDrNo` là giá
 *    trị dropdown `cboDr` trên header 診療入力 TẠI THỜI ĐIỂM bấm F8
 *    (frm203002.cs:8091), KHÔNG phải bác sĩ đã điều trị ngày đó — thanh toán một
 *    ngày cũ thì WinForm vẫn đóng dấu bác sĩ đang hiện trên header. Đó là lý do
 *    spec đọc kỳ vọng từ CHÍNH cái dropdown chứ không từ `trn_trn.dr_no`.
 *
 * ─── Web port ────────────────────────────────────────────────────────────────
 *  - `Ochacom.Application/Treatments/Common/UnpaidSyosinFlgResolver.cs` — port
 *    modAcc, có mã 3, không bao giờ trả 4.
 *  - `InsertUnpaidHandler.ResolveSyosinFlgAsync` — đọc các dòng `trn_trn` của
 *    会計対象日 (theo `disp_no`, `seq`) + câu hỏi 「quá khứ có 初診 chưa」.
 *  - `InsertUnpaidRequest.DrNo` — FE gửi `activeDrNo` (giá trị dropdown Dr), BE
 *    ghi thẳng vào `att_dr`.
 *  - TRƯỚC KHI SỬA: handler lấy `priceResult.SyosinFlg` của `BuiPriceService`
 *    (port `buiPrice.cs`, bảng mã 1 / 2 / **4=訪問診療**, KHÔNG có 3) ⇒ 再初診 là
 *    thứ web không thể ghi ra; còn `att_dr` thì để `0` cứng.
 *
 * ─── Vì sao spec này phải soi DB ─────────────────────────────────────────────
 *  Cả `sflg` lẫn `att_dr` không hiện ở bất kỳ đâu trên màn hình — chính tester
 *  cũng phải mở bảng UNPAID để thấy. Không có đường nào đo qua UI, nên spec chạy
 *  F8 THẬT rồi đọc `view_unpaid_active`. Đây cũng là lý do nó KHÔNG chạy trong
 *  lượt hằng ngày mà phải bật cờ (Rule 18.1).
 *
 * ─── GHI DB — đọc kỹ trước khi chạy ──────────────────────────────────────────
 *  Spec CÓ ghi thật: mỗi lần F8 chạy `deleteTrtDtUnPaid` (xoá mềm dòng 未精算 của
 *  ngày đó) rồi chèn lại. Từ 2026-09-03 bước xoá đó là một endpoint RIÊNG
 *  (`POST …/accounting/clear-unpaid`, chạy ngay sau 日付チェック — modAcc.cs:428);
 *  `insert-unpaid` vẫn tự xoá lần nữa nên hành vi tổng thể không đổi. Vì vậy:
 *   · bắt buộc `TEST_DB=1` (để assert) và `TEST_ALLOW_SAVE=1` (để cho phép ghi);
 *   · chỉ chọn NGÀY CHƯA CÓ 会計 済み (`view_acc_dat_active` trống cho ngày đó),
 *     nên không đụng vào dữ liệu đã quyết toán và cũng không bung hộp 既存会計;
 *   · `beforeAll` chụp lại `id` + `deleted_at` của mọi dòng `unpaid` thuộc các
 *     ngày sẽ test, `afterAll` xoá cứng dòng do lượt chạy sinh ra và bỏ xoá mềm
 *     những dòng vốn đang sống. In ra số dòng đụng tới để không ai phải đoán.
 *  KHÔNG bấm Yes ở hộp 「処置データは変更されています」 — Yes ghi lại cả tháng 処置.
 *
 * ─── Kỳ vọng được TÍNH TỪ DỮ LIỆU, không hardcode ────────────────────────────
 *  DB của tester khác DB của dev, nên spec không cắm cứng "ngày 25 phải là 3".
 *  Nó dò trong tháng đang mở một ngày CHỈ có 初診 và một ngày CHỈ có 再診, rồi
 *  diễn đạt lại luật modAcc bằng SQL để ra giá trị kỳ vọng. Không có ngày phù
 *  hợp thì skip kèm lý do + in bảng ngày ra log để đổi `TEST_PAT_NO`/`TEST_TRT_DT`.
 *
 *  `att_dr` cũng vậy: kỳ vọng lấy từ CHÍNH dropdown Dr trên header ngay trước khi
 *  bấm F8 — đọc nhãn đang hiện rồi tra sang `userNo` bằng danh sách bác sĩ mà màn
 *  hình vừa tải (`GET /tenant/mst-iin-2?userKbn=0`). Header trống thì spec tự chọn
 *  bác sĩ đầu tiên, vì kỳ vọng 0 sẽ trùng đúng giá trị của bug cũ (hardcode 0) và
 *  testcase mất hết ý nghĩa.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. Cột 日 chỉ hiện số ở dòng ĐẦU của mỗi ngày ⇒ đọc DOM phải cộng dồn ngày
 *     gần nhất (giống `accounting-unpaid/accounting-target-date.spec.ts`).
 *  2. Dòng tháng cũ mang rowKey `${recordIndex}-${itemIndex}` — `guardCurrentMonth`
 *     chặn F8 ở đó bằng 「当月以外の操作はできません」. Chỉ chọn dòng tháng hiện hành.
 *  3. Ô 日 bấm HAI lần sẽ mở 日付変更 ⇒ chỉ bấm một lần.
 *  4. `SanteiConfirmDialog` 「〜を算定しますか？」 đè lên mọi click; `addLocatorHandler`
 *     chỉ chạy khi có ACTION nên trước `keyboard.press` phải tự vét.
 *  5. Mốc "đã ghi xong" là RESPONSE của `POST …/accounting/insert-unpaid`, không
 *     phải việc màn hình nhảy sang 窓口精算 — đọc DB trước khi commit xong sẽ ra
 *     dữ liệu cũ.
 *  6. modAcc ghi CÙNG một `intSyosin` (và cùng một `att_dr`) cho cả ba dòng
 *     医療保険 / 介護保険 / 自費 của ngày ⇒ assert trên MỌI dòng, không phải dòng đầu.
 *  7. Dropdown Dr là Radix Select, KHÔNG phải `<select>` gốc: trigger là `button`
 *     nằm ngay sau `<span>Dr:</span>`, và danh sách bung ra qua PORTAL ở `body`
 *     với `role="option"` (Rule 12.6). Nhãn hiện trên trigger là TÊN bác sĩ, còn
 *     thứ ghi xuống DB là `user_no` ⇒ bắt buộc phải tra bảng ánh xạ.
 *
 * ─── KHÔNG kiểm ở đây ────────────────────────────────────────────────────────
 *  Các nhánh 「健診より/自費より」, thứ tự "hit đầu tiên thắng", 訪問診療 không ra 4,
 *  và chỗ cố ý lệch với `modSave.SetOrder` đều đã có unit test:
 *  `apps/api/tests/Ochacom.Application.UnitTests/Treatments/Common/UnpaidSyosinFlgResolverTests.cs`.
 *  Việc `drNo` đi từ body request tới Command đã có
 *  `apps/api/tests/Ochacom.Api.UnitTests/Mappers/Treatments/InsertUnpaidRequestMapperTests.cs`.
 *  Ở đây chỉ chứng minh đường dây thật: F8 → BE → cột `sflg` / `att_dr` trong DB.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/accounting-unpaid/unpaid-insert.spec.ts --retries=0
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138)
 *   TEST_TRT_DT        ngày bất kỳ TRONG THÁNG muốn dò (mặc định hôm nay)
 *   TEST_DB=1          BẮT BUỘC — assert soi thẳng Postgres
 *   TEST_ALLOW_SAVE=1  BẮT BUỘC — F8 ghi 未精算データ thật
 *
 * Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19).
 */

const PAT_NO = Number(patNo('12138'))

/** Ngày bất kỳ trong THÁNG muốn dò — chỉ phần 年月 được dùng. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

const MONTH_START = `${TRT_DT.slice(0, 8)}01`
const MONTH_END = (() => {
    const y = Number(TRT_DT.slice(0, 4))
    const m = Number(TRT_DT.slice(5, 7))
    const last = new Date(y, m, 0).getDate()
    return `${TRT_DT.slice(0, 8)}${String(last).padStart(2, '0')}`
})()

/** Rule 18.1 — F8 ghi 未精算データ thật nên phải có cờ. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

const GRID_LOAD_TIMEOUT = 60_000
const INSERT_TIMEOUT = 90_000

/** LetAccData2 bước GHI — mốc "BE đã chèn xong" (BẪY 5). */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

/** Danh sách bác sĩ của dropdown Dr (`cboDr`) — nhãn hiển thị ↔ `user_no`. */
const MST_IIN_DOCTORS_URL = /\/tenant\/mst-iin-2\?.*userKbn=0/

/** Chỉ số cột 日 — `RegiCol.day` = cột 0 (frm203002.cs:158). */
const COL_DAY = 0

/** rowKey dòng tháng cũ (`isHistoryRowKey`); dòng tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

/** 介護保険行 lấy `trt_cnt = 来院回数 + 100` (modAcc.cs:673). */
const CARE_TRT_CNT_OFFSET = 100

/** Ba giá trị hợp lệ của `unpaid.sflg` — buiPrice's 4 KHÔNG nằm trong đây. */
const SFLG = { firstVisit: 1, revisit: 2, repeatFirstVisit: 3 } as const

interface DaySummary {
    trtDt: string
    hasSyosin: boolean
    hasSaisin: boolean
    hasPhrase: boolean
    settled: boolean
}

interface UnpaidRow {
    trtCnt: number
    kmCd: number
    lflg: number
    sflg: number
    attDr: number
}

/** Dòng lưới tháng hiện hành kèm ngày ĐÃ CỘNG DỒN (BẪY 1). */
interface DayRow {
    key: string
    day: string
}

/** `true` nếu locator hiện ra trong `timeout` — `isVisible()` KHÔNG chờ. */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/** Chờ cái nào hiện trước; `false` nếu hết `timeout` mà không cái nào. */
async function appearedAny(locators: Locator[], timeout: number): Promise<boolean> {
    const races = locators.map((l) =>
        l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false),
    )
    return Promise.race([
        ...races,
        new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500)),
    ])
}

/**
 * Từng ngày có 処置 trong tháng, kèm những gì luật modAcc cần biết.
 *
 * `has_syosin` dùng đúng tập mã của `Check.IsFirstVisitTreatCode` (Check.cs:12383):
 * 100-0 / 100-1 / 107-0 / 333-50 / 333-55.
 */
async function readMonthDays(): Promise<DaySummary[]> {
    return withDb(async (c) => {
        const r = await c.query<{
            trt_dt: Date | string
            has_syosin: boolean
            has_saisin: boolean
            has_phrase: boolean
            settled: boolean
        }>(
            `WITH d AS (
                 SELECT trt_dt,
                        bool_or((trt_cd = 100 AND trt_sb IN (0, 1))
                             OR (trt_cd = 107 AND trt_sb = 0)
                             OR (trt_cd = 333 AND trt_sb IN (50, 55)))       AS has_syosin,
                        bool_or(trt_cd = 110 OR (trt_cd = 107 AND trt_sb = 1)) AS has_saisin,
                        bool_or(COALESCE(dsp_trt, '') LIKE '%健診より%'
                             OR COALESCE(dsp_trt, '') LIKE '%検診より%'
                             OR COALESCE(dsp_trt, '') LIKE '%自費より%'
                             OR COALESCE(dsp_trt, '') LIKE '%健康診断の結果に基づき治療開始%')
                                                                             AS has_phrase
                   FROM view_trn_trn_active
                  WHERE pat_no = $1 AND trt_dt BETWEEN $2 AND $3
                  GROUP BY trt_dt
             )
             SELECT d.trt_dt, d.has_syosin, d.has_saisin, d.has_phrase,
                    EXISTS (SELECT 1 FROM view_acc_dat_active a
                             WHERE a.pat_no = $1 AND a.trt_dt = d.trt_dt) AS settled
               FROM d
              ORDER BY d.trt_dt`,
            [PAT_NO, MONTH_START, MONTH_END],
        )
        return r.rows.map((row) => ({
            trtDt: String(row.trt_dt instanceof Date ? isoOf(row.trt_dt) : row.trt_dt).slice(0, 10),
            hasSyosin: row.has_syosin,
            hasSaisin: row.has_saisin,
            hasPhrase: row.has_phrase,
            settled: row.settled,
        }))
    })
}

/** `yyyy-MM-dd` theo giờ ĐỊA PHƯƠNG — `toISOString()` lệch ngày ở múi giờ +09. */
function isoOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 「過去に初診あり」 — diễn đạt lại `Trntrn.getKaikeiPastSyosinCnt` (Trntrn.cs:1283-1287)
 * bằng SQL, GIỮ NGUYÊN chỗ nhánh 107 khoá theo `pat_br` chứ không phải `trt_sb`.
 */
async function readHasPastFirstVisit(): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ exists: boolean }>(
            `SELECT EXISTS (
                 SELECT 1 FROM view_trn_trn_active
                  WHERE pat_no = $1
                    AND trt_dt < $2
                    AND (trt_cd = 100 OR (trt_cd = 107 AND pat_br = 0))
             ) AS exists`,
            [PAT_NO, MONTH_START],
        )
        return r.rows[0]?.exists ?? false
    })
}

/**
 * 来院回数 của dòng ĐẦU TIÊN trong ngày (theo thứ tự hiển thị `disp_no`, `seq`).
 *
 * Đó chính là dòng mà `runF8On` đặt con trỏ vào, nên nó là kỳ vọng của
 * `unpaid.trt_cnt`. `null` khi ngày không có dòng 処置 nào.
 */
async function readFirstRowRaiinCnt(trtDt: string): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query<{ raiin_cnt: number }>(
            `SELECT raiin_cnt
               FROM view_trn_trn_active
              WHERE pat_no = $1 AND trt_dt = $2
              ORDER BY disp_no, seq
              LIMIT 1`,
            [PAT_NO, trtDt],
        )
        const v = r.rows[0]?.raiin_cnt
        return v === undefined ? null : Number(v)
    })
}

/** Mọi dòng 未精算 còn sống của một ngày. */
async function readUnpaidRows(trtDt: string): Promise<UnpaidRow[]> {
    return withDb(async (c) => {
        const r = await c.query<{
            trt_cnt: number
            km_cd: number
            lflg: number
            sflg: number
            att_dr: number
        }>(
            `SELECT trt_cnt, km_cd, lflg, sflg, att_dr
               FROM view_unpaid_active
              WHERE pat_no = $1 AND trt_dt = $2
              ORDER BY trt_cnt, km_cd`,
            [PAT_NO, trtDt],
        )
        return r.rows.map((row) => ({
            trtCnt: Number(row.trt_cnt),
            kmCd: Number(row.km_cd),
            lflg: Number(row.lflg),
            sflg: Number(row.sflg),
            attDr: Number(row.att_dr),
        }))
    })
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: `sflg` không hiện trên UI, assert phải soi Postgres')
skipWithReason(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: F8 会計 ghi 未精算データ thật (Rule 18.1)')

test.describe('診療入力 F8 → unpaid: sflg (1/2/3) và att_dr phải khớp modAcc', () => {
    let page: Page
    let step: () => Promise<void>

    /** Ngày CHỈ có 初診 và ngày CHỈ có 再診, đều chưa quyết toán. */
    let syosinDay: string | null = null
    let saisinDay: string | null = null

    /** Giá trị kỳ vọng cho ngày 初診: 3 nếu trước tháng này đã có 初診, không thì 1. */
    let expectedSyosinFlg: number = SFLG.firstVisit

    /** `id` → `deleted_at` của mọi dòng unpaid thuộc các ngày test, chụp TRƯỚC khi chạy. */
    const unpaidSnapshot = new Map<string, string | null>()

    /**
     * Nhãn bác sĩ trên dropdown ↔ `user_no` — bắt từ CHÍNH response mà màn hình
     * tải (`GET /tenant/mst-iin-2?userKbn=0`). Không hỏi DB: cái ghi xuống
     * `att_dr` là giá trị màn hình đang cầm, nên nguồn kỳ vọng cũng phải là nó.
     * Trùng tên hai bác sĩ → lưu -1 để testcase skip thay vì đoán bừa.
     */
    const doctorNoByName = new Map<string, number>()

    /** Thứ tự bác sĩ như dropdown dựng — cần khi header trống, phải tự chọn. */
    const doctorNames: string[] = []

    /** 会計対象日 → Dr đang hiện trên header lúc bấm F8 = kỳ vọng của `att_dr`. */
    const expectedAttDr = new Map<string, number>()

    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    // Các cổng của chuỗi F8 (frm203002.IDM_Acc_Click + modAcc.LetAccData2).
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')

    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

    /**
     * Trigger của dropdown Dr trên header — Radix Select nên nó là `button` đứng
     * ngay sau `<span>Dr:</span>` (BẪY 7). Nhãn hiện trên nút là TÊN bác sĩ.
     */
    const drTrigger = () =>
        page
            .getByText('Dr:', { exact: true })
            .first()
            .locator('xpath=following-sibling::button[1]')

    /**
     * Bảo đảm header ĐANG chọn một bác sĩ thật, trả về `user_no` của người đó.
     *
     * Vì sao phải ép chọn: header trống ⇒ FE gửi `drNo = 0` ⇒ kỳ vọng cũng là 0,
     * trùng đúng giá trị mà bug cũ (hardcode 0) sinh ra, testcase sẽ xanh cả trên
     * bản hỏng. Trả về 0 khi phòng khám không có bác sĩ nào hoặc tên bị trùng —
     * lúc đó testcase tự skip kèm lý do.
     */
    async function ensureHeaderDoctor(): Promise<number> {
        const readLabel = async () => (await drTrigger().innerText()).trim()

        let label = await readLabel()
        if (doctorNoByName.get(label) === undefined || doctorNoByName.get(label) === -1) {
            const pick = doctorNames.find((nm) => (doctorNoByName.get(nm) ?? -1) > 0)
            if (pick === undefined) return 0
            await drTrigger().click()
            // Radix bung listbox qua portal ở `body`; mục chọn mang role="option".
            await page.getByRole('option', { name: pick, exact: true }).first().click()
            await expect(drTrigger()).toContainText(pick, { timeout: 10_000 })
            label = await readLabel()
        }
        const no = doctorNoByName.get(label) ?? 0
        return no > 0 ? no : 0
    }

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

    async function openEntry(trtDt: string) {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${trtDt}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await drainSanteiDialogs()
    }

    /** Đọc cột 日 toàn lưới, cộng dồn ngày (BẪY 1), bỏ dòng tháng cũ + dòng 日計. */
    async function currentMonthDayRows(): Promise<DayRow[]> {
        const raw = await page.locator(`[data-grid-cell$="|${COL_DAY}"]`).evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''),
                text: (e.textContent ?? '').trim(),
            })),
        )
        const out: DayRow[] = []
        let carried = ''
        for (const r of raw) {
            if (r.key.includes(':')) continue
            if (HISTORY_KEY_RE.test(r.key)) continue
            if (/^\d+$/.test(r.text)) carried = String(Number(r.text))
            if (carried === '') continue
            out.push({ key: r.key, day: carried })
        }
        return out
    }

    /**
     * Trả lời các cổng của chuỗi F8 cho tới khi hết.
     *
     * Bản sao rút gọn của helper trong `accounting-unpaid/accounting-target-date.spec.ts` — cố ý
     * giữ riêng để mỗi spec chạy độc lập. KHÁC một chỗ: ở đây `insert-unpaid`
     * KHÔNG bị chặn, vì đúng thứ cần đo là dòng nó ghi xuống.
     *   · 会計前チェック → OK      · 処置データ変更 → No (Yes ghi cả tháng — cấm)
     *   · 日付チェック   → OK      · 既存会計/計上   → No
     *   · 入金指定       → F10 戻る
     */
    async function settleAccountingDialogs(rounds = 8) {
        for (let i = 0; i < rounds; i++) {
            const boxes = [
                checkGate(),
                dirtyGate(),
                dateGate(),
                createGate(),
                chgAccGate(),
                nyukinDialog(),
            ]
            if (!(await appearedAny(boxes, 15_000))) break

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
                await expect(dateGate()).toBeHidden({ timeout: 10_000 })
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
    }

    /**
     * Mở màn hình ở `trtDt`, đặt con trỏ vào dòng của ngày đó rồi F8, chờ BE chèn
     * xong. Trả về `false` nếu lưới không có dòng nào của ngày đó.
     */
    async function runF8On(trtDt: string): Promise<boolean> {
        await openEntry(trtDt)

        const wantDay = String(Number(trtDt.slice(8, 10)))
        const target = (await currentMonthDayRows()).find((r) => r.day === wantDay)
        if (!target) return false

        await drainSanteiDialogs()
        await page.locator(`[data-grid-cell="${target.key}|${COL_DAY}"]`).click()
        await step()

        // Chốt 担当医 NGAY TRƯỚC khi bấm — WinForm đọc pintDrNo tại đúng thời điểm
        // này (modAcc.cs:640), nên kỳ vọng cũng phải chụp ở đây chứ không phải
        // lúc mở màn hình.
        expectedAttDr.set(trtDt, await ensureHeaderDoctor())

        // Mốc tin cậy là response của bước GHI, không phải việc đổi URL (BẪY 5).
        const inserted = page
            .waitForResponse(
                (r) => INSERT_UNPAID_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: INSERT_TIMEOUT },
            )
            .catch(() => null)

        await drainSanteiDialogs()
        await page.keyboard.press('F8')
        await settleAccountingDialogs()

        const res = await inserted
        expect(
            res,
            `F8 ở ngày ${trtDt} không gọi insert-unpaid — chưa ghi thì không đo được sflg`,
        ).not.toBeNull()
        expect(res?.status(), 'insert-unpaid trả lỗi').toBe(200)
        await step()
        return true
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung
     *  theo worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        // ── Chọn ngày test từ chính dữ liệu của DB đang chạy ──────────────────
        const days = await readMonthDays()
        console.log(`Tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO}:`)
        for (const d of days) {
            console.log(
                `  ${d.trtDt} 初診=${d.hasSyosin} 再診=${d.hasSaisin} ` +
                    `初診扱い文言=${d.hasPhrase} 会計済=${d.settled}`,
            )
        }

        // Ngày CHỈ có 初診 / CHỈ có 再診 để luật "hit đầu tiên thắng" không phụ
        // thuộc thứ tự dòng, và ngày phải CHƯA quyết toán để F8 không bung hộp
        // 既存会計 và không đụng dữ liệu đã chốt.
        syosinDay = days.find((d) => d.hasSyosin && !d.hasSaisin && !d.settled)?.trtDt ?? null
        saisinDay =
            days.find((d) => d.hasSaisin && !d.hasSyosin && !d.hasPhrase && !d.settled)?.trtDt ??
            null
        expectedSyosinFlg = (await readHasPastFirstVisit())
            ? SFLG.repeatFirstVisit
            : SFLG.firstVisit
        console.log(
            `→ ngày 初診 = ${syosinDay ?? '(không có)'} (kỳ vọng sflg=${expectedSyosinFlg}), ` +
                `ngày 再診 = ${saisinDay ?? '(không có)'} (kỳ vọng sflg=${SFLG.revisit})`,
        )

        // ── Chụp lại unpaid của các ngày sẽ test, để afterAll trả nguyên trạng ──
        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        if (targets.length > 0) {
            await withDb(async (c) => {
                const r = await c.query<{ id: string; deleted_at: string | null }>(
                    `SELECT id, deleted_at FROM unpaid WHERE pat_no = $1 AND trt_dt = ANY($2)`,
                    [PAT_NO, targets],
                )
                for (const row of r.rows) unpaidSnapshot.set(row.id, row.deleted_at)
            })
            console.log(
                `unpaid hiện có ở các ngày test: ${unpaidSnapshot.size} dòng — afterAll sẽ trả về nguyên trạng`,
            )
        }

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        // Bảng bác sĩ lấy từ chính response màn hình tải, không hỏi DB (xem chú
        // thích ở `doctorNoByName`). Response tới trước khi dropdown render nên
        // lúc cần tra thì bảng đã đầy.
        page.on('response', (res) => {
            if (!MST_IIN_DOCTORS_URL.test(res.url())) return
            void res
                .json()
                .then((body: { data?: { userNo?: number | string; userNm?: string }[] }) => {
                    for (const d of body.data ?? []) {
                        const nm = (d.userNm ?? '').trim()
                        const no = Number(d.userNo ?? 0)
                        if (nm === '' || !Number.isFinite(no)) continue
                        if (!doctorNoByName.has(nm)) {
                            doctorNoByName.set(nm, no)
                            doctorNames.push(nm)
                        } else if (doctorNoByName.get(nm) !== no) {
                            doctorNoByName.set(nm, -1) // trùng tên ⇒ không tra được
                        }
                    }
                })
                .catch(() => {})
        })

    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)

        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        if (!dbEnabled || targets.length === 0) return

        // Xoá CỨNG dòng do lượt chạy sinh ra, rồi bỏ xoá mềm những dòng vốn đang
        // sống mà F8 vừa dọn đi. Hai bước, không phải một: `deleteTrtDtUnPaid`
        // xoá mềm dòng cũ TRƯỚC khi chèn dòng mới.
        await withDb(async (c) => {
            const known = [...unpaidSnapshot.keys()]
            const del = await c.query(
                `DELETE FROM unpaid
                  WHERE pat_no = $1 AND trt_dt = ANY($2)
                    AND ($3::uuid[] = '{}' OR NOT (id = ANY($3::uuid[])))`,
                [PAT_NO, targets, known],
            )
            const revive = [...unpaidSnapshot.entries()]
                .filter(([, deletedAt]) => deletedAt === null)
                .map(([id]) => id)
            let revived = 0
            if (revive.length > 0) {
                const up = await c.query(
                    `UPDATE unpaid SET deleted_at = NULL, deleted_by = NULL
                      WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`,
                    [revive],
                )
                revived = up.rowCount ?? 0
            }
            console.log(
                `afterAll: xoá ${del.rowCount ?? 0} dòng unpaid do test sinh ra, ` +
                    `khôi phục ${revived} dòng bị F8 xoá mềm`,
            )
        }).catch((e: unknown) => console.log(`afterAll: dọn không xong — ${String(e)}`))
    })

    test('TC-SFLG-1 — ngày có 初診: sflg = 1 hoặc 3 theo quá khứ, KHÔNG BAO GIỜ 2', async () => {
        skipWithReason(
            syosinDay === null,
            `tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO} không có ngày nào CHỈ có 初診 ` +
                `và chưa quyết toán — đổi TEST_PAT_NO / TEST_TRT_DT (xem bảng ngày in ở log)`,
        )
        if (syosinDay === null) return

        expect(await runF8On(syosinDay), `lưới không có dòng nào của ngày ${syosinDay}`).toBe(true)

        const rows = await readUnpaidRows(syosinDay)
        expect(rows, `F8 không để lại dòng 未精算 nào cho ngày ${syosinDay}`).not.toHaveLength(0)

        for (const row of rows) {
            // Đây là con số tester đọc trên bảng UNPAID.
            expect(
                row.sflg,
                `ngày ${syosinDay} có 初診 mà unpaid.sflg = ${row.sflg} (km_cd=${row.kmCd}). ` +
                    `Ra 2 nghĩa là vẫn đang lấy 再診; ra 4 nghĩa là còn dùng bảng mã của buiPrice.`,
            ).toBe(expectedSyosinFlg)
        }
        console.log(`${syosinDay}: sflg = ${rows.map((r) => r.sflg).join(', ')}`)
    })

    test('TC-SFLG-2 — ngày chỉ có 再診: sflg = 2 kể cả khi quá khứ đã có 初診', async () => {
        skipWithReason(
            saisinDay === null,
            `tháng ${MONTH_START.slice(0, 7)} của bệnh nhân ${PAT_NO} không có ngày nào CHỈ có 再診 ` +
                `và chưa quyết toán — đổi TEST_PAT_NO / TEST_TRT_DT (xem bảng ngày in ở log)`,
        )
        if (saisinDay === null) return

        expect(await runF8On(saisinDay), `lưới không có dòng nào của ngày ${saisinDay}`).toBe(true)

        const rows = await readUnpaidRows(saisinDay)
        expect(rows, `F8 không để lại dòng 未精算 nào cho ngày ${saisinDay}`).not.toHaveLength(0)

        for (const row of rows) {
            // Bước hạ 再初診 chỉ áp cho ngày 初診 (modAcc.cs:465 gác trên flgSyosin).
            expect(
                row.sflg,
                `ngày ${saisinDay} chỉ có 再診 mà unpaid.sflg = ${row.sflg} (km_cd=${row.kmCd})`,
            ).toBe(SFLG.revisit)
        }
        console.log(`${saisinDay}: sflg = ${rows.map((r) => r.sflg).join(', ')}`)
    })

    test('TC-ATTDR-1 — att_dr = Dr đang chọn trên header, KHÔNG phải 0', async () => {
        const tested = [...expectedAttDr.entries()]
        skipWithReason(tested.length === 0, 'không có ngày nào chạy được ở TC-SFLG-1/2')
        if (tested.length === 0) return

        const usable = tested.filter(([, drNo]) => drNo > 0)
        skipWithReason(
            usable.length === 0,
            'dropdown Dr không chọn được bác sĩ nào (phòng khám chưa có mst-iin user_kbn=0, ' +
                'hoặc hai bác sĩ trùng tên) — kỳ vọng 0 sẽ trùng đúng giá trị của bug cũ nên ' +
                'testcase mất ý nghĩa',
        )
        if (usable.length === 0) return

        // Không bấm F8 thêm lần nào: đọc lại chính những dòng TC-SFLG-1/2 vừa tạo.
        for (const [day, drNo] of usable) {
            const rows = await readUnpaidRows(day)
            expect(rows, `không còn dòng 未精算 nào của ngày ${day}`).not.toHaveLength(0)
            for (const row of rows) {
                expect(
                    row.attDr,
                    `ngày ${day}: att_dr = ${row.attDr} (km_cd=${row.kmCd}) nhưng header đang ` +
                        `chọn Dr ${drNo}. Ra 0 nghĩa là 担当医 vẫn bị bỏ trống như trước khi sửa.`,
                ).toBe(drNo)
            }
            console.log(`${day}: att_dr = ${rows.map((r) => r.attDr).join(', ')} (header Dr ${drNo})`)
        }
    })

    test('TC-RAIIN-1 — trt_cnt = 当日来院回数 của dòng con trỏ, KHÔNG phải 1 cứng', async () => {
        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        skipWithReason(targets.length === 0, 'không có ngày nào chạy được ở TC-SFLG-1/2')
        if (targets.length === 0) return

        // Không bấm F8 thêm lần nào — đọc lại chính những dòng hai testcase trên
        // vừa tạo. `runF8On` đặt con trỏ vào dòng ĐẦU của ngày, nên kỳ vọng là
        // `raiin_cnt` của chính dòng đó (WinForm đọc hFG1[71] tại dòng con trỏ).
        for (const day of targets) {
            const expected = await readFirstRowRaiinCnt(day)
            expect(expected, `ngày ${day} không có dòng 処置 nào trong trn_trn`).not.toBeNull()

            const rows = await readUnpaidRows(day)
            expect(rows, `không còn dòng 未精算 nào của ngày ${day}`).not.toHaveLength(0)

            for (const row of rows) {
                // `deleteTrtDtUnPaid` khoá theo `trt_cnt % 100` (UnPaid.cs:357) —
                // dùng đúng phép đó để 医療保険 (n) và 介護保険 (n+100) cùng khớp.
                expect(
                    row.trtCnt % CARE_TRT_CNT_OFFSET,
                    `ngày ${day}: unpaid.trt_cnt = ${row.trtCnt} (km_cd=${row.kmCd}) nhưng ` +
                        `trn_trn.raiin_cnt của dòng con trỏ = ${String(expected)}. Bản port từng ` +
                        'để trtCnt = 1 cứng (InsertUnpaidHandler, TODO Phase 2).',
                ).toBe(expected)

                // 介護保険行 (lflg = 1) là dòng DUY NHẤT được cộng 100.
                const isCare = row.lflg === 1
                expect(
                    row.trtCnt >= CARE_TRT_CNT_OFFSET,
                    `ngày ${day}: dòng lflg=${row.lflg} có trt_cnt = ${row.trtCnt}. ` +
                        'Chỉ dòng 介護保険 mới mang +100 (modAcc.cs:673).',
                ).toBe(isCare)
            }
            console.log(
                `${day}: trt_cnt = ${rows.map((r) => r.trtCnt).join(', ')} ` +
                    `(raiin_cnt dòng con trỏ = ${String(expected)})`,
            )
        }
    })

    test('TC-SFLG-3 — mọi dòng vừa ghi chỉ mang 1/2/3, không có mã 4 của buiPrice', async () => {
        const targets = [syosinDay, saisinDay].filter((d): d is string => d !== null)
        skipWithReason(targets.length === 0, 'không có ngày nào chạy được ở TC-SFLG-1/2')
        if (targets.length === 0) return

        // Không bấm F8 thêm lần nào — đọc lại chính những dòng hai testcase trên
        // vừa tạo. `4` là giá trị của `BuiPriceService.SyosinFlg` cho 訪問診療: nếu
        // nó xuất hiện thì dây cũ đã quay lại.
        for (const day of targets) {
            for (const row of await readUnpaidRows(day)) {
                expect(
                    [SFLG.firstVisit, SFLG.revisit, SFLG.repeatFirstVisit],
                    `ngày ${day} có unpaid.sflg = ${row.sflg}, ngoài bảng mã của modAcc`,
                ).toContain(row.sflg)
            }
        }
    })
})

})

// ═══ nguyên văn từ unpaid-raiin-cnt-parity.spec.ts (đã gộp vào file này) ═══════════════════════════════════
test.describe('cột trt_cnt — 1 ngày 2 lượt = 2 dòng', () => {

/**
 * 診療入力 F8 会計 — 当日来院回数 (số lần bệnh nhân đến khám TRONG CÙNG một ngày).
 *
 * Cả chuỗi 会計 của WinForm được **giới hạn vào MỘT lượt khám**, không phải cả ngày:
 *
 * ```csharp
 * hfgRaiinCnt();                                              // modAcc.cs:396 — điền cột 71
 * intSelectRaiin = CInt(hFG1[71, hFG1.CurrentCellAddress.Y]); // modAcc.cs:415 — DÒNG CON TRỎ
 * GetDayPoint(intRow, …, ref intSelectRaiin, …);              // 点数 / 一部負担金 / 自費
 * Calc_DayPoint_Kaigo(con, dtTgtDate, intSelectRaiin, …);     // 介護
 * Get_AccUnit(con, intRow, lngAccUnit, intSelectRaiin, "9");  // 14 診療識別
 * UnPaid.deleteTrtDtUnPaid(command, …, intSelectRaiin);       // xoá 未精算 (trt_cnt % 100)
 * unPaidData.trt_cnt = intSelectRaiin;                        // khoá dòng 未精算
 * unPaidData.trt_cnt = intSelectRaiin + 100;                  // dòng 介護 (modAcc.cs:673)
 * ```
 *
 * Bug ban đầu (ISSUE-14 trong `userapp/inp-p0-open-issues.md`): bản port bỏ qua
 * `intSelectRaiin` ở **cả 5 chỗ** — `InsertUnpaidHandler` để `trtCnt = 1` cứng
 * (TODO Phase 2), `BuiPriceCalcInput.VisitsNo = 0`, `AccUnitCalculator` không có
 * tham số 来院回数, và `UnpaidDayRows.ForDay` lọc cứng `trt_cnt ∈ {1, 101}`.
 *
 * ⇒ bệnh nhân đến 2 lần/ngày: lượt 2 **xoá mềm rồi ghi đè** dòng của lượt 1 (cùng
 *   `trt_cnt = 1`), và **mỗi** lượt mang điểm/tiền của **cả ngày** → 窓口精算 thu sai.
 *
 * **ĐÃ VÁ** (`fix/inp-acc-raiin-cnt-winform-parity`, đo lại 2026-09-04): cả 4/4 TC
 * xanh, và nửa WinForm `fla-ui-tests/Tests/UnpaidRaiinCnt/` ra CÙNG hành vi. Spec
 * này từ đây là lưới chống tái phát, không còn là spec đi chứng minh bug.
 *
 * ─── Nguồn WinForm (src/OCHACOM) ────────────────────────────────────────────
 *  - `modAcc.hfgRaiinCnt` (modAcc.cs:1188-1222) — quét lưới THEO THỨ TỰ HIỂN THỊ:
 *        visit_day = 0; visit_cnt_of_day = 0
 *        foreach 行 (bỏ 過去月 linekbn=="99"):
 *            if 行.日 != visit_day → visit_day = 行.日; visit_cnt_of_day = 0
 *            if 行.trt_cd ∈ {100,107,110,111,333} && 行.回数 > 0 → visit_cnt_of_day++
 *            行[71] = visit_cnt_of_day > 1 ? visit_cnt_of_day : 1
 *    Hai chỗ dễ port sai: (1) reset xảy ra KHI ĐANG QUÉT mà ngày đổi, không phải
 *    group-by; (2) các dòng NẰM TRƯỚC 再診 thứ hai vẫn giữ 1.
 *  - `UnPaid.deleteTrtDtUnPaid` (UnPaid.cs:350-357) — `trt_cnt % 100 = @trt_cnt`,
 *    tức xoá đúng cặp 医療保険 (n) + 介護保険 (n+100) của lượt đó.
 *  - `Get_AccUnit` (modAcc.cs:821-822) — `CommonInp.CVal(grdRegi[71,i]) == opIntRaiinCnt`.
 *
 * ─── KHÔNG lọc theo 来院回数 (đã kiểm chứng — đừng "sửa" thêm) ──────────────
 *  - `GetAccData` nhận `intSelectRaiin` nhưng **không dùng**: nó gọi
 *    `AccDat.getInpAccDat(con, dtDate, patId)` theo NGÀY (modAcc.cs:869-881).
 *  - 初診/再診/再初診 判定 quét theo NGÀY (`grdRegi[0,i] == grdRegi[0,intRow]`,
 *    modAcc.cs:433) ⇒ `unpaid.sflg` GIỐNG NHAU ở cả hai lượt của cùng một ngày.
 *    Spec này assert đúng điều đó để không ai "sửa nhầm" sang per-lượt.
 *  - Footer 日計/負担金 của 診療入力 là port `modAcc.DispDayPoint` (modAcc.cs:132-212)
 *    → cộng CẢ NGÀY. Đó là lý do tổng điểm hai lượt phải bằng số footer.
 *
 * ─── Web port (ochacom-saas) ────────────────────────────────────────────────
 *  - `web-tenant/src/features/treatments/lib/accounting-visit-no.ts`
 *      · `resolveAccountingVisitNo(rows, rowKey, dayRemap)` — port `hfgRaiinCnt`
 *        + đọc dòng con trỏ. Con trỏ ở 日計 footer → số lượt CUỐI của ngày.
 *      · `WHOLE_DAY_RAIIN_CNT = 0` — giá trị footer 日計 gửi lên (không lọc).
 *  - `treatment-entry-detail.tsx` → `runLetAccData2` tính `raiinCnt` ngay sau
 *    `resolveAccountingTargetDate` rồi gửi kèm mọi bước: `clear-unpaid`,
 *    `precheck`, `daily-summary`, `insert-unpaid`, `correct`, `recompute-copayment`.
 *  - `InsertUnpaidHandler.Command.RaiinCnt` → `unpaid.trt_cnt` (介護 `+100`),
 *    `BuiPriceCalcInput.VisitsNo`, `AccUnitCalculator.ComputeAsync(…, raiinCnt, …)`.
 *  - `UnpaidDayRows.ForVisit(…, raiinCnt)` → `trt_cnt % 100 = raiinCnt`.
 *  - `trn_trn.raiin_cnt` do `RaiinCntCalculator` ghi lúc F9 登録 — spec dựa vào
 *    đó nên TC-0 kiểm nó TRƯỚC, giống `save-f9/p0-save-side-effects.spec.ts` TC-3.
 *
 * ─── Vì sao spec này phải TỰ DỰNG dữ liệu ──────────────────────────────────
 *  Ngày có 2 lượt khám gần như không tồn tại sẵn trong DB của tester, mà đó lại
 *  chính là kịch bản duy nhất phân biệt bản đúng với bản hỏng. Nên spec seed
 *  thẳng `trn_trn` (vùng `disp_no >= SEED_DISP_BASE`, giống
 *  `save-f9/p0-save-side-effects.spec.ts`) rồi bấm F9 THẬT để `RaiinCntCalculator` đánh số.
 *  Không seed `raiin_cnt` bằng tay: làm vậy là tự viết ra kỳ vọng của chính mình.
 *
 * ─── GHI DB — đọc kỹ trước khi chạy ────────────────────────────────────────
 *  Spec GHI THẬT ở hai chỗ:
 *   · F9 登録 — bulk-save ghi lại **CẢ THÁNG** 処置 (xoá mềm + chèn lại disp_no mới).
 *     Chọn TEST_PAT_NO / TEST_TRT_DT vào tháng ÍT dữ liệu thật; beforeAll in ra
 *     số dòng thật để không ai phải đoán.
 *   · F8 会計 — `clear-unpaid` xoá mềm 未精算 của ngày rồi `insert-unpaid` chèn lại.
 *  Dọn dẹp: dòng 処置 do spec dựng bị xoá hẳn — nhận theo `(trt_cd, dsp_trt)` chứ
 *  KHÔNG theo mã (xem `TEST_ROW_SIGNATURES`); `unpaid` được snapshot ở beforeAll,
 *  afterAll xoá cứng dòng do lượt chạy sinh ra và bỏ xoá mềm dòng vốn đang sống.
 *
 * ─── BẪY ───────────────────────────────────────────────────────────────────
 *  1. F9 gửi lên NHỮNG GÌ ĐANG CÓ TRONG LƯỚI. Seed xong PHẢI mở lại màn hình,
 *     nếu không F9 ghi đè bằng bộ dòng cũ (chú thích của `resetMonthTo` ở
 *     `save-f9/p0-save-side-effects.spec.ts`).
 *  2. F8 xong màn hình NHẢY sang 窓口精算 (`goToCounterPayment`) ⇒ trước mỗi lượt
 *     F8 phải mở lại 診療入力.
 *  3. Ô 日 bấm HAI lần sẽ mở 日付変更 ⇒ chỉ bấm một lần.
 *  4. `SanteiConfirmDialog` 「〜を算定しますか？」 nuốt mọi click; `addLocatorHandler`
 *     chỉ chạy khi có ACTION nên trước `keyboard.press` phải tự vét (Rule 14).
 *  5. Mốc "đã ghi xong" là RESPONSE của `POST …/accounting/insert-unpaid`, không
 *     phải việc đổi URL — đọc DB sớm sẽ ra dữ liệu cũ.
 *  6. KHÔNG bấm はい ở hộp 「処置データは変更されています」 trong chuỗi F8: nó lưu lại
 *     cả tháng và làm hỏng bộ dòng vừa dựng. Trả lời いいえ.
 *  7. Ngày test phải CHƯA quyết toán (`view_acc_dat_active` trống) — nếu không F8
 *     bung hộp 既存会計 và rẽ sang 会計データ修正, khác hẳn nhánh đang đo.
 *
 * ─── KHÔNG kiểm ở đây ──────────────────────────────────────────────────────
 *  Luật đếm của `hfgRaiinCnt` (reset khi đổi ngày, 回数 = 0 không mở lượt, 部位病名行,
 *  con trỏ ở 日計 footer) đã có unit test:
 *  `apps/web-tenant/src/features/treatments/lib/__tests__/accounting-visit-no.test.ts`.
 *  Vị từ xoá `trt_cnt % 100` có `ClearDayUnpaidHandlerTests`; bộ lọc 14 診療識別 có
 *  `AccUnitCalculatorTests`. Ở đây chỉ chứng minh ĐƯỜNG DÂY THẬT:
 *  lưới → F8 → `unpaid.trt_cnt` / `unpaid.score` trong Postgres.
 *
 * ─── Cách chạy ─────────────────────────────────────────────────────────────
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/accounting-unpaid/unpaid-insert.spec.ts --retries=0
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138)
 *   TEST_TRT_DT        ngày dựng 2 lượt khám (mặc định hôm nay)
 *   TEST_DB=1          BẮT BUỘC — assert soi thẳng Postgres
 *   TEST_ALLOW_SAVE=1  BẮT BUỘC — F9 + F8 ghi thật
 *
 * Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19) — các TC nối tiếp nhau.
 */

const PAT_NO = Number(patNo('12138'))

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** Rule 18.1 — F9 + F8 đều ghi DB thật. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ─── 処置 đem dựng ───────────────────────────────────────────────────────────
// Ba mã đầu nằm trong tập mở lượt khám của hfgRaiinCnt {100,107,110,111,333};
// PLAIN_TRT_CD cố ý NGOÀI tập đó để chứng minh nó chỉ ĐI THEO lượt, không mở lượt mới.
/** 歯科初診料 — mở lượt khám thứ 1. */
const SYOSIN_TRT_CD = 100
const SYOSIN_SB = 0
/** 歯科再診料 — mở lượt khám thứ 2 trong cùng ngày. */
const SAISIN_TRT_CD = 110
const SAISIN_SB = 0
/** 処置 trung tính — KHÔNG nằm trong tập đếm lượt. */
const PLAIN_TRT_CD = 209
const PLAIN_SB = 0

/** 点数 của từng dòng — chọn khác nhau để tổng của hai lượt không thể trùng nhau. */
const PT = { syosin: 264, plainA: 40, saisin: 56, plainB: 30 } as const

/**
 * 点数 kỳ vọng của từng lượt — **ĐO LẠI TỪ DB**, không cộng từ `PT`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO KHÔNG VIẾT CỨNG `PT.syosin + PT.plainA`
 * ═══════════════════════════════════════════════════════════════════════════
 * Công thức đó chỉ đúng khi ngày test **không còn dòng nào khác**. Ngày test là
 * ngày THẬT của bệnh nhân THẬT, nên nó thường đã có sẵn 処置; những dòng đó cũng
 * được `hfgRaiinCnt` gán 来院回数 và cũng vào tổng điểm của lượt tương ứng.
 *
 * Đã đỏ oan thật 2026-09-04: ngày test còn 3 dòng 加算 thật (2 điểm mỗi dòng) nằm
 * TRƯỚC dòng 初診 ⇒ thuộc lượt 1 ⇒ điểm lượt 1 thật là 264 + 40 + **6** = 310, còn
 * assert thì đòi 304. App tính ĐÚNG mà testcase báo sai — và thông điệp lỗi lại chỉ
 * thẳng vào `AccUnitCalculator`, tức đổ oan đúng chỗ khó cãi nhất.
 *
 * ⇒ kỳ vọng được tính lại từ `trn_trn` SAU khi F9 đã đánh số `raiin_cnt`, theo đúng
 * ba đoạn source mà chuỗi 会計 dùng:
 * ```
 *   buiPrice.cs:288      score = trt_pt × trt_cnt          (điểm lấy từ Ô LƯỚI, không tra master)
 *   modAcc.cs:238        chỉ cộng payData.visits_no == intSelectRaiin
 *   modAcc.cs:542/636    insScore → unPaidData.score
 * ```
 * ⇒ **`unpaid.score` của lượt N = Σ (trt_pt × trt_cnt) trên các dòng của ngày mang
 * `raiin_cnt = N`.** Dòng 自費 (`jihi_flg != 0`) không vào tổng này: điểm 自費 đi vào
 * `jihiPrice`, và dòng 未精算 自費 luôn `score = 0` (modAcc.cs:706).
 *
 * `PT` bên dưới vẫn giữ nguyên vai trò: nó quyết định SEED gì, và các giá trị được
 * chọn lệch nhau để hai lượt không thể ra cùng một tổng.
 */
interface ExpectedScores {
    visit1: number
    visit2: number
    /** Con số của CẢ NGÀY — chính là giá trị mà bản bỏ qua 来院回数 ghi cho TỪNG lượt. */
    wholeDay: number
}

/** Điền ở TC-0 sau khi F9 đánh số xong; TC-1/TC-2 đọc ra. */
let expectedScores: ExpectedScores | null = null

/** `expectedScores` đã đo xong chưa — TC sau TC-0 gọi để có lỗi nói đúng nguyên nhân. */
function requireExpectedScores(): ExpectedScores {
    expect(
        expectedScores,
        'chưa đo được điểm kỳ vọng — TC-0 phải chạy trước (bộ này chạy serial, đừng -g một TC lẻ)',
    ).not.toBeNull()
    return expectedScores!
}

/** 来院回数 kỳ vọng. `hfgRaiinCnt` không bao giờ trả 0. */
const VISIT_1 = 1
const VISIT_2 = 2

/** 介護保険行 lấy `trt_cnt = 来院回数 + 100` (modAcc.cs:673). */
const CARE_TRT_CNT_OFFSET = 100

/**
 * `dsp_trt` của MỌI dòng spec này seed — dùng cả để locate trên lưới lẫn để dọn.
 * Thêm dòng mới thì PHẢI thêm tên vào đây, nếu không cleanup sẽ để lại rác.
 */
const NM = {
    syosin: '初診-来院回数テスト',
    plainA: '処置A-来院回数テスト',
    saisin: '再診-来院回数テスト',
    plainB: '処置B-来院回数テスト',
} as const

/**
 * Chữ ký `(trt_cd, dsp_trt[])` của MỌI dòng spec này dựng — dùng để dọn.
 *
 * Dọn theo TÊN chứ không theo mã: `deleteTreatmentRowsByTrtCd` xoá HẲN mọi dòng
 * cùng mã trong ngày, kể cả dòng THẬT. Ngày test hiếm khi trống — bệnh nhân có 再診
 * (110) thật trong ngày là mất luôn, không dựng lại được (xoá cứng, không phải xoá
 * mềm, và `afterAll` cũng chỉ gọi lại chính hàm dọn này).
 *
 * Đã mất thật 2026-09-04: chạy thử trên một ngày có 3 dòng 110 thật, cả ba biến mất.
 * Mã 100/110 lại là mã ai cũng có, nên lưới xoá theo mã ở đây gần như chắc chắn
 * cuốn theo dữ liệu thật.
 *
 * Vẫn phải dọn ngoài vùng `disp_no >= SEED_DISP_BASE`: F9 一回 là `bulk-save` xoá
 * mềm dòng seed rồi chèn lại với `disp_no` đánh số từ 1
 * (`SaveTreatmentsHandler.cs:175-196`) ⇒ bản mới rơi ra ngoài vùng test. `dsp_trt`
 * thì sống sót qua F9 (lưới gửi lên đúng chữ đang hiện), nên nó là chữ ký hẹp vừa
 * đủ: chỉ trúng dòng của spec, không bao giờ trúng dòng thật.
 */
const TEST_ROW_SIGNATURES = [
    { trtCd: SYOSIN_TRT_CD, names: [NM.syosin] },
    { trtCd: SAISIN_TRT_CD, names: [NM.saisin] },
    { trtCd: PLAIN_TRT_CD, names: [NM.plainA, NM.plainB] },
] as const

/** Chỉ số cột 日 — `RegiCol.day` = cột 0 (frm203002.cs:158). */
const COL_DAY = 0
/** Chỉ số cột 療法・処置 — nơi `dsp_trt` hiện ra. */
const COL_RYOHO = 2

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3
const SAVE_TIMEOUT = 60_000
const INSERT_TIMEOUT = 90_000

/** LetAccData2 bước GHI — mốc "BE đã chèn xong" (BẪY 5). */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

interface UnpaidRow {
    trtCnt: number
    kmCd: number
    lflg: number
    score: number
    claimAmt: number
    sflg: number
}

/** Mọi dòng 未精算 CÒN SỐNG của ngày test. */
async function readUnpaidRows(): Promise<UnpaidRow[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT trt_cnt, km_cd, lflg, score, claim_amt, sflg
               FROM view_unpaid_active
              WHERE pat_no = $1 AND trt_dt = $2
              ORDER BY trt_cnt, km_cd`,
            [PAT_NO, TRT_DT],
        )
        return r.rows.map((x) => ({
            trtCnt: Number(x['trt_cnt'] ?? 0),
            kmCd: Number(x['km_cd'] ?? 0),
            lflg: Number(x['lflg'] ?? 0),
            score: Number(x['score'] ?? 0),
            claimAmt: Number(x['claim_amt'] ?? 0),
            sflg: Number(x['sflg'] ?? 0),
        }))
    })
}

interface DayRow {
    trtCd: number
    dspTrt: string
    raiinCnt: number
    trtPt: number
    trtCnt: number
    jihiFlg: number
}

/** MỌI dòng 処置 còn sống của ngày test, theo thứ tự hiển thị. */
async function readDayRows(): Promise<DayRow[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT trt_cd, COALESCE(dsp_trt, '') AS dsp_trt, raiin_cnt,
                    trt_pt, trt_cnt, COALESCE(jihi_flg, 0) AS jihi_flg
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND deleted_at IS NULL
              ORDER BY disp_no, seq`,
            [PAT_NO, TRT_DT],
        )
        return r.rows.map((x) => ({
            trtCd: Number(x['trt_cd'] ?? 0),
            dspTrt: String(x['dsp_trt'] ?? ''),
            raiinCnt: Number(x['raiin_cnt'] ?? 0),
            trtPt: Number(x['trt_pt'] ?? 0),
            trtCnt: Number(x['trt_cnt'] ?? 0),
            jihiFlg: Number(x['jihi_flg'] ?? 0),
        }))
    })
}

/**
 * Tập 処置 MỞ một lượt khám mới — `modAcc.hfgRaiinCnt` (modAcc.cs:1208).
 *
 * KHÁC tập quyết định `sflg` (`Check.IsFirstVisitTreatCode`) và KHÁC tập đếm 初診
 * quá khứ (`getKaikeiPastSyosinCnt`). Ba tập, ba việc — lẫn là sai.
 */
const VISIT_OPENING_TRT_CDS = new Set([100, 107, 110, 111, 333])

/** Số dòng MỞ lượt trong một bộ dòng — `trt_cnt > 0` mới được tính (modAcc.cs:1210). */
function countVisitOpeners(rows: readonly DayRow[]): number {
    return rows.filter((r) => VISIT_OPENING_TRT_CDS.has(r.trtCd) && r.trtCnt > 0).length
}

/**
 * Σ (trt_pt × trt_cnt) theo từng 来院回数 — kỳ vọng cho `unpaid.score`.
 *
 * Gom theo `raiin_cnt` mà F9 vừa đóng dấu (TC-0 khoá giá trị đó trước), nên nó
 * phản ánh ĐÚNG ngày test thật sự có gì, kể cả 処置 sẵn có của bệnh nhân.
 * `trt_cd = 50` (自費 số lượng) đếm như một lần, giống `buiPrice.cs:288`.
 */
function scoreByVisit(rows: readonly DayRow[]): Map<number, number> {
    const byVisit = new Map<number, number>()
    for (const row of rows) {
        if (row.jihiFlg !== 0) continue
        const cnt = row.trtCd === 50 ? 1 : row.trtCnt
        byVisit.set(row.raiinCnt, (byVisit.get(row.raiinCnt) ?? 0) + row.trtPt * cnt)
    }
    return byVisit
}

/** Ngày test đã có 会計 済み chưa (BẪY 7). */
async function isDaySettled(): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ exists: boolean }>(
            `SELECT EXISTS (SELECT 1 FROM view_acc_dat_active
                             WHERE pat_no = $1 AND trt_dt = $2) AS exists`,
            [PAT_NO, TRT_DT],
        )
        return r.rows[0]?.exists ?? false
    })
}

/** `true` nếu locator hiện ra trong `timeout` — `isVisible()` KHÔNG chờ. */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/** Chờ cái nào hiện trước; `false` nếu hết `timeout` mà không cái nào. */
async function appearedAny(locators: Locator[], timeout: number): Promise<boolean> {
    const races = locators.map((l) =>
        l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false),
    )
    return Promise.race([
        ...races,
        new Promise<boolean>((r) => setTimeout(() => r(false), timeout + 500)),
    ])
}

test.describe.configure({ mode: 'serial', timeout: 420_000 })

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: `unpaid.trt_cnt` không hiện trên UI, phải soi Postgres')
skipWithReason(
    !ALLOW_SAVE,
    'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 (ghi lại CẢ THÁNG) và F8 会計 (ghi 未精算)',
)

test.describe('診療入力 F8 会計 — 1 ngày 2 lượt khám phải ra 2 dòng 未精算 riêng', () => {
    let page: Page
    let step: () => Promise<void>

    /** Ngày test đã quyết toán ⇒ mọi TC skip (BẪY 7). */
    let daySettled = false

    /**
     * Ngày test ĐÃ có sẵn bao nhiêu 処置 mở lượt khám TRƯỚC khi spec seed.
     *
     * Phải bằng 0 thì phép đo mới có nghĩa: spec tự mang theo 初診 + 再診 của mình để
     * dựng đúng HAI lượt, nên ngày nào đã có 再診/初診 thật thì dòng seed bị đẩy thành
     * lượt 3, 4… và mọi kỳ vọng 1/2 sai theo.
     *
     * Đã đỏ oan thật 2026-09-04: ngày test có 3 dòng 再診 thật ⇒ 初診 seed thành lượt 4,
     * TC-0 báo 「初診 phải mở lượt 1」 — thông điệp đúng chữ nhưng chỉ sai địa chỉ, người
     * đọc đi soi `RaiinCntCalculator` trong khi lỗi nằm ở CHỌN NGÀY.
     */
    let dayVisitOpeners = 0

    /** `id` → `deleted_at` của mọi dòng unpaid ngày test, chụp TRƯỚC khi chạy. */
    const unpaidSnapshot = new Map<string, string | null>()

    const dlg = (text: string | RegExp) =>
        page.locator('[role="dialog"], [role="alertdialog"]').filter({ hasText: text })

    // Các cổng của chuỗi F8 (frm203002.IDM_Acc_Click + modAcc.LetAccData2).
    const checkGate = () => dlg('このまま続けますか?')
    const dirtyGate = () => dlg('処置データは変更されています。保存しますか？')
    const dateGate = () => dlg('会計処理を行う日が本日でありません。よろしいですか。')
    const createGate = () => dlg(/作成し(ますか|てよろしいですか)？/)
    const chgAccGate = () => dlg(/に計上しますか？/)
    const nyukinDialog = () => dlg('入 金 指 定')

    const btn = (box: Locator, name: string | RegExp) =>
        box.getByRole('button', { name, exact: typeof name === 'string' })

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

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    page.locator(`[data-grid-cell$="|${COL_RYOHO}"]`).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
                await drainSanteiDialogs()
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới — nạp lại`,
                )
            }
        }
        throw lastErr
    }

    /**
     * Xoá HẲN mọi dòng 処置 do spec này tạo — theo vùng `disp_no` VÀ theo `dsp_trt`.
     *
     * Hai lượt là cần: vùng `disp_no >= SEED_DISP_BASE` tóm bản vừa seed, còn
     * `dsp_trt` tóm bản mà F9 đã chèn lại với `disp_no` thật. KHÔNG dọn theo 処置コード
     * — xem chú thích ở `TEST_ROW_SIGNATURES`.
     */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(PAT_NO, TRT_DT).catch(() => 0)
        for (const sig of TEST_ROW_SIGNATURES) {
            n += await deleteTreatmentRowsByDspTrt(PAT_NO, TRT_DT, sig.trtCd, sig.names).catch(
                () => 0,
            )
        }
        return n
    }

    /**
     * Dựng ngày test thành HAI lượt khám rồi F9 để `RaiinCntCalculator` đánh số.
     *
     * Thứ tự dòng chính là đầu vào của `hfgRaiinCnt` (quét theo thứ tự hiển thị):
     * 初診 + 処置A → lượt 1; 再診 + 処置B → lượt 2.
     */
    async function buildTwoVisitDay() {
        await purgeTestRows()
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: SYOSIN_TRT_CD, trtSb: SYOSIN_SB, trtCnt: 1, trtPt: PT.syosin, dspTrt: NM.syosin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: PT.plainA, dspTrt: NM.plainA },
            { trtCd: SAISIN_TRT_CD, trtSb: SAISIN_SB, trtCnt: 1, trtPt: PT.saisin, dspTrt: NM.saisin },
            { trtCd: PLAIN_TRT_CD, trtSb: PLAIN_SB, trtCnt: 1, trtPt: PT.plainB, dspTrt: NM.plainB },
        ])
        // BẪY 1 — F9 gửi lên nội dung LƯỚI, nên phải nạp lại sau khi seed.
        await openTreatmentScreen()
        await step()

        const pending = page.waitForResponse(
            (r) =>
                r.url().includes('/tenant/treatment/bulk-save') && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await drainSanteiDialogs()
        await page.keyboard.press('F9')
        await step()
        await page
            .getByRole('button', { name: /^(はい|Yes|OK)$/ })
            .first()
            .click()
        const resp = await pending
        if (resp.status() >= 300) {
            console.log(
                `bulk-save ${resp.status()} body: ${await resp.text().catch(() => '(unreadable)')}`,
            )
        }
        expect(resp.status(), 'POST bulk-save không trả 2xx').toBeLessThan(300)
        await step()
    }

    /**
     * Trả lời các cổng của chuỗi F8 cho tới khi hết.
     *
     * Bản sao rút gọn của helper trong `accounting-unpaid/unpaid-insert.spec.ts` — cố ý giữ
     * riêng để mỗi spec chạy độc lập. `insert-unpaid` KHÔNG bị chặn: đó đúng là
     * thứ cần đo.
     *   · 会計前チェック → OK      · 処置データ変更 → いいえ (BẪY 6)
     *   · 日付チェック   → OK      · 既存会計/計上   → いいえ
     *   · 入金指定       → F10 戻る
     */
    async function settleAccountingDialogs(rounds = 8) {
        for (let i = 0; i < rounds; i++) {
            const boxes = [
                checkGate(),
                dirtyGate(),
                dateGate(),
                createGate(),
                chgAccGate(),
                nyukinDialog(),
            ]
            if (!(await appearedAny(boxes, 15_000))) break

            if (await checkGate().isVisible().catch(() => false)) {
                await btn(checkGate(), 'OK').first().click()
                continue
            }
            if (await dirtyGate().isVisible().catch(() => false)) {
                await btn(dirtyGate(), /^(No|いいえ)$/).first().click()
                continue
            }
            if (await dateGate().isVisible().catch(() => false)) {
                await btn(dateGate(), 'OK').first().click()
                await expect(dateGate()).toBeHidden({ timeout: 10_000 })
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
    }

    /** `rowKey` của dòng lưới đang in `dspTrt` ở cột 療法・処置. */
    async function rowKeyOf(dspTrt: string): Promise<string | null> {
        const found = await page
            .locator(`[data-grid-cell$="|${COL_RYOHO}"]`)
            .evaluateAll(
                (els, want) =>
                    els
                        .filter((e) => (e.textContent ?? '').trim().includes(want))
                        .map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')),
                dspTrt,
            )
        return found[0] ?? null
    }

    /**
     * Mở lại 診療入力 (BẪY 2), đặt con trỏ vào dòng mang `dspTrt` rồi F8, chờ BE
     * chèn xong. Trả về `false` nếu lưới không còn dòng đó.
     */
    async function runF8OnRow(dspTrt: string): Promise<boolean> {
        await openTreatmentScreen()

        const key = await rowKeyOf(dspTrt)
        if (key === null) return false

        // BẪY 3 — ô 日 chỉ bấm MỘT lần, bấm hai lần mở 日付変更.
        await page.locator(`[data-grid-cell="${key}|${COL_DAY}"]`).click()
        await step()

        // BẪY 5 — mốc tin cậy là response của bước GHI.
        const inserted = page
            .waitForResponse(
                (r) => INSERT_UNPAID_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: INSERT_TIMEOUT },
            )
            .catch(() => null)

        await drainSanteiDialogs()
        await page.keyboard.press('F8')
        await settleAccountingDialogs()

        const res = await inserted
        expect(
            res,
            `F8 ở dòng 「${dspTrt}」 không gọi insert-unpaid — chưa ghi thì không đo được trt_cnt`,
        ).not.toBeNull()
        expect(res?.status(), 'insert-unpaid trả lỗi').toBe(200)

        // Kỳ vọng của FE nằm ngay trong body — in ra để một TC đỏ nói được lỗi ở
        // FE (tính sai 来院回数) hay ở BE (nhận đúng mà ghi sai).
        const sent = res?.request().postDataJSON() as { raiinCnt?: number } | undefined
        console.log(`F8 ở 「${dspTrt}」: FE gửi raiinCnt = ${String(sent?.raiinCnt)}`)
        await step()
        return true
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung
     *  theo worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        daySettled = await isDaySettled()
        dayVisitOpeners = countVisitOpeners(await readDayRows())
        const realRows = await countRealTreatmentRowsInMonth(PAT_NO, TRT_DT)
        console.log(
            `bệnh nhân ${PAT_NO}, ngày ${TRT_DT}: 会計済 = ${daySettled}, ` +
                `処置 mở lượt CÓ SẴN trong ngày = ${dayVisitOpeners}, ` +
                `処置行 THẬT trong tháng = ${realRows}`,
        )
        if (realRows > 0) {
            console.log(
                `⚠️ mỗi lần F9 sẽ ghi lại toàn bộ ${realRows} dòng đó (xoá mềm + chèn lại ` +
                    'disp_no mới). Đổi TEST_PAT_NO/TEST_TRT_DT sang tháng trống nếu không muốn đụng.',
            )
        }

        await withDb(async (c) => {
            const r = await c.query<{ id: string; deleted_at: string | null }>(
                `SELECT id, deleted_at FROM unpaid WHERE pat_no = $1 AND trt_dt = $2`,
                [PAT_NO, TRT_DT],
            )
            for (const row of r.rows) unpaidSnapshot.set(row.id, row.deleted_at)
        })
        console.log(
            `unpaid hiện có ở ngày test: ${unpaidSnapshot.size} dòng — afterAll sẽ trả nguyên trạng`,
        )

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        if (!dbEnabled) return

        const removed = await purgeTestRows()

        // Hai bước, không phải một: `clear-unpaid` xoá MỀM dòng cũ trước khi
        // `insert-unpaid` chèn dòng mới.
        await withDb(async (c) => {
            const known = [...unpaidSnapshot.keys()]
            const del = await c.query(
                `DELETE FROM unpaid
                  WHERE pat_no = $1 AND trt_dt = $2
                    AND ($3::uuid[] = '{}' OR NOT (id = ANY($3::uuid[])))`,
                [PAT_NO, TRT_DT, known],
            )
            const revive = [...unpaidSnapshot.entries()]
                .filter(([, deletedAt]) => deletedAt === null)
                .map(([id]) => id)
            let revived = 0
            if (revive.length > 0) {
                const up = await c.query(
                    `UPDATE unpaid SET deleted_at = NULL, deleted_by = NULL
                      WHERE id = ANY($1::uuid[]) AND deleted_at IS NOT NULL`,
                    [revive],
                )
                revived = up.rowCount ?? 0
            }
            console.log(
                `afterAll: xoá ${removed} 処置行 test, xoá ${del.rowCount ?? 0} dòng unpaid do ` +
                    `test sinh ra, khôi phục ${revived} dòng bị F8 xoá mềm`,
            )
        }).catch((e: unknown) => console.log(`afterAll: dọn không xong — ${String(e)}`))
    })

    /**
     * Hai tiền đề của ngày test, kiểm bằng DB TRƯỚC khi ghi gì.
     *
     * Trả `true` = bỏ qua. Gọi ở ĐẦU mọi TC: bộ này chạy serial nên TC sau không thể
     * có nghĩa nếu TC-0 không dựng được dữ liệu.
     */
    function skipUnlessDayUsable(): boolean {
        skipWithReason(
            daySettled,
            `ngày ${TRT_DT} của bệnh nhân ${PAT_NO} ĐÃ quyết toán (view_acc_dat_active có dòng) — ` +
                'F8 sẽ rẽ sang nhánh 既存会計/会計データ修正, khác nhánh đang đo. Đổi TEST_TRT_DT.',
        )
        skipWithReason(
            !daySettled && dayVisitOpeners > 0,
            `ngày ${TRT_DT} của bệnh nhân ${PAT_NO} ĐÃ có ${dayVisitOpeners} 処置 mở lượt khám ` +
                `(${[...VISIT_OPENING_TRT_CDS].join('/')}) — spec tự mang 初診 + 再診 của mình nên ` +
                'dòng seed sẽ thành lượt 3, 4… chứ không phải 1 và 2, và mọi kỳ vọng sai theo. ' +
                'Trỏ TEST_TRT_DT vào một ngày CHƯA có 初診/再診 (ngày trống là tốt nhất — F9 ghi ' +
                'lại cả tháng nên tháng trống còn tránh đụng dữ liệu thật).',
        )
        return daySettled || dayVisitOpeners > 0
    }

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-0 (mốc) — F9 đánh số raiin_cnt 1,1,2,2 cho ngày 2 lượt khám', async () => {
        if (skipUnlessDayUsable()) return

        await buildTwoVisitDay()

        const rows = await readDayRows()
        const mine = rows.filter((r) => Object.values(NM).some((nm) => r.dspTrt.includes(nm)))
        expect(
            mine.length,
            'Sau F9 không đọc lại được dòng nào do spec seed — harness hỏng, đừng đọc TC khác',
        ).toBe(4)

        const byName = (nm: string) => mine.find((r) => r.dspTrt.includes(nm))
        console.log(`raiin_cnt sau F9: ${mine.map((r) => `${r.dspTrt}=${r.raiinCnt}`).join(', ')}`)

        // 初診 + 処置A = lượt 1; 再診 + 処置B = lượt 2 (hfgRaiinCnt quét tuần tự).
        expect(byName(NM.syosin)?.raiinCnt, `${NM.syosin} phải mở lượt 1`).toBe(VISIT_1)
        expect(
            byName(NM.plainA)?.raiinCnt,
            `${NM.plainA} nằm SAU 初診 và TRƯỚC 再診 ⇒ vẫn thuộc lượt 1`,
        ).toBe(VISIT_1)
        expect(byName(NM.saisin)?.raiinCnt, `${NM.saisin} phải mở lượt 2`).toBe(VISIT_2)
        expect(
            byName(NM.plainB)?.raiinCnt,
            `${NM.plainB} nằm SAU 再診 ⇒ thuộc lượt 2 (209 không tự mở lượt)`,
        ).toBe(VISIT_2)

        // ── Đo điểm kỳ vọng của TỪNG lượt, từ chính bộ dòng vừa đánh số ──────
        // Tính ở đây chứ không cộng từ PT: ngày test còn 処置 SẴN CÓ của bệnh nhân
        // thì chúng cũng mang 来院回数 và cũng vào tổng của lượt tương ứng
        // (xem khối chú thích ở `ExpectedScores`).
        const byVisit = scoreByVisit(rows)
        const visit1 = byVisit.get(VISIT_1) ?? 0
        const visit2 = byVisit.get(VISIT_2) ?? 0
        const others = [...byVisit.entries()].filter(([v]) => v !== VISIT_1 && v !== VISIT_2)

        expect(
            others,
            `ngày test có thêm lượt khám ngoài 1 và 2 (${others.map(([v, s]) => `来院${v}=${s}点`).join(', ')}) ` +
                '⇒ phép đo không còn là "2 lượt". Chọn TEST_TRT_DT khác.',
        ).toHaveLength(0)

        const seeded = mine.reduce((sum, r) => sum + r.trtPt * r.trtCnt, 0)
        const dayTotal = visit1 + visit2
        if (dayTotal !== seeded) {
            console.log(
                `⚠️ ngày ${TRT_DT} có sẵn ${dayTotal - seeded} điểm từ 処置 THẬT ngoài 4 dòng seed — ` +
                    'kỳ vọng đã cộng cả chúng vào đúng lượt của mình.',
            )
        }

        // Hai lượt phải ra hai con số KHÁC NHAU, nếu không TC-1/TC-2 không phân biệt
        // được "điểm của lượt" với "điểm của cả ngày" — xanh mà vô nghĩa.
        expect(visit1, 'lượt 1 không có điểm nào').toBeGreaterThan(0)
        expect(visit2, 'lượt 2 không có điểm nào').toBeGreaterThan(0)
        expect(
            visit1,
            `hai lượt cùng ra ${visit1} điểm ⇒ phép đo mất khả năng phân biệt. ` +
                'Đổi PT sang bộ số khác, hoặc chọn ngày test khác.',
        ).not.toBe(visit2)

        expectedScores = { visit1, visit2, wholeDay: dayTotal }
        console.log(
            `điểm kỳ vọng (đo từ trn_trn): 来院1 = ${visit1}, 来院2 = ${visit2}, CẢ NGÀY = ${dayTotal}`,
        )
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-1 — F8 từ dòng lượt 1: unpaid.trt_cnt = 1 và score CHỈ của lượt 1', async () => {
        if (skipUnlessDayUsable()) return

        const want = requireExpectedScores()

        expect(
            await runF8OnRow(NM.syosin),
            `lưới không còn dòng 「${NM.syosin}」 — TC-0 chưa dựng được dữ liệu`,
        ).toBe(true)

        const rows = await readUnpaidRows()
        expect(rows, 'F8 không để lại dòng 未精算 nào').not.toHaveLength(0)
        console.log(
            `sau F8 lượt 1: ${rows.map((r) => `trt_cnt=${r.trtCnt} km_cd=${r.kmCd} score=${r.score}`).join(' | ')}`,
        )

        for (const row of rows) {
            expect(
                row.trtCnt % CARE_TRT_CNT_OFFSET,
                `con trỏ ở lượt 1 mà unpaid.trt_cnt = ${row.trtCnt} (km_cd=${row.kmCd}). ` +
                    'WinForm ghi thẳng intSelectRaiin = hFG1[71] (modAcc.cs:632).',
            ).toBe(VISIT_1)
        }

        // Dòng 医療保険 mang 点数 của LƯỢT, không phải của cả ngày. Nhận nó bằng
        // `score > 0` chứ không bằng km_cd: bệnh nhân có 科目コード = 自費 (50) thì
        // WinForm gộp 自費 vào chính dòng 医療保険 (modAcc.cs:658-665), còn dòng 自費
        // đứng riêng thì luôn `score = 0` (modAcc.cs:694).
        const insRow = rows.find((r) => r.lflg === 0 && r.score > 0)
        expect(insRow, 'không có dòng 未精算 nào mang 点数 (lflg = 0, score > 0)').toBeTruthy()
        expect(
            insRow!.score,
            `unpaid.score = ${insRow!.score}, cần ${want.visit1} (điểm RIÊNG lượt 1). ` +
                `Ra ${want.wholeDay} nghĩa là vẫn tính CẢ NGÀY ` +
                `(AccUnitCalculator / BuiPriceService chưa lọc theo 来院回数).`,
        ).toBe(want.visit1)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-2 — F8 từ dòng lượt 2: sinh dòng trt_cnt = 2 và KHÔNG xoá dòng lượt 1', async () => {
        if (skipUnlessDayUsable()) return

        const want = requireExpectedScores()

        expect(
            await runF8OnRow(NM.saisin),
            `lưới không còn dòng 「${NM.saisin}」 — TC-0 chưa dựng được dữ liệu`,
        ).toBe(true)

        const rows = await readUnpaidRows()
        console.log(
            `sau F8 lượt 2: ${rows.map((r) => `trt_cnt=${r.trtCnt} km_cd=${r.kmCd} score=${r.score}`).join(' | ')}`,
        )

        const visit1 = rows.filter((r) => r.trtCnt % CARE_TRT_CNT_OFFSET === VISIT_1)
        const visit2 = rows.filter((r) => r.trtCnt % CARE_TRT_CNT_OFFSET === VISIT_2)

        // ĐÂY là vế chính của bug: `deleteTrtDtUnPaid` lọc `trt_cnt % 100 = 来院回数`
        // (UnPaid.cs:357) nên lượt 2 không được đụng vào lượt 1.
        expect(
            visit1.length,
            'Dòng 未精算 của lượt 1 BIẾN MẤT sau khi kế toán lượt 2. Bản hỏng dùng ' +
                'trt_cnt = 1 cứng cho cả hai lượt ⇒ clear-unpaid xoá mềm dòng cũ rồi ghi đè.',
        ).toBeGreaterThan(0)
        expect(
            visit2.length,
            `Không có dòng 未精算 nào mang trt_cnt = ${VISIT_2}. Đang đọc được: ` +
                `${rows.map((r) => r.trtCnt).join(', ')}`,
        ).toBeGreaterThan(0)

        // Cách nhận dòng 医療保険 giống TC-1 — xem chú thích ở đó.
        const insVisit2 = visit2.find((r) => r.lflg === 0 && r.score > 0)
        expect(insVisit2, 'lượt 2 không có dòng 未精算 nào mang 点数').toBeTruthy()
        expect(
            insVisit2!.score,
            `lượt 2: unpaid.score = ${insVisit2!.score}, cần ${want.visit2}. ` +
                `Ra ${want.wholeDay} nghĩa là mỗi lượt vẫn mang điểm của CẢ NGÀY.`,
        ).toBe(want.visit2)

        const insVisit1 = visit1.find((r) => r.lflg === 0 && r.score > 0)
        expect(insVisit1, 'lượt 1 không còn dòng 未精算 nào mang 点数').toBeTruthy()
        expect(
            insVisit1!.score,
            `kế toán lượt 2 KHÔNG được sửa số của lượt 1 (phải vẫn là ${want.visit1})`,
        ).toBe(want.visit1)

        // Tổng hai lượt = con số footer 日計 của ngày (modAcc.DispDayPoint cộng cả ngày).
        expect(
            insVisit1!.score + insVisit2!.score,
            `tổng điểm hai lượt phải bằng 日計 ${want.wholeDay} của ngày — thiếu nghĩa là ` +
                'có dòng bị bỏ sót khỏi cả hai lượt',
        ).toBe(want.wholeDay)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-3 — sflg giống nhau ở cả hai lượt: 初診判定 quét theo NGÀY, không theo lượt', async () => {
        if (skipUnlessDayUsable()) return

        // Không bấm F8 thêm lần nào — đọc lại chính những dòng TC-1/TC-2 vừa tạo.
        const rows = await readUnpaidRows()
        expect(rows.length, 'không còn dòng 未精算 nào của ngày test').toBeGreaterThan(0)

        // modAcc.cs:431-433 so sánh `grdRegi[0,i] == grdRegi[0,intRow]` — chỉ NGÀY.
        // Ngày này có 初診 (100) nên `flgSyosin` bật ở CẢ hai lượt.
        const distinct = [...new Set(rows.map((r) => r.sflg))]
        expect(
            distinct.length,
            `unpaid.sflg khác nhau giữa các lượt (${rows.map((r) => `${r.trtCnt}:${r.sflg}`).join(', ')}). ` +
                '初診/再診/再初診 判定 của modAcc quét theo NGÀY, KHÔNG lọc 来院回数 (modAcc.cs:433) — ' +
                'nếu ai đó thêm bộ lọc 来院回数 vào ResolveSyosinFlgAsync thì TC này đỏ.',
        ).toBe(1)
        console.log(`sflg của mọi dòng = ${distinct[0]}`)
    })
})

})
