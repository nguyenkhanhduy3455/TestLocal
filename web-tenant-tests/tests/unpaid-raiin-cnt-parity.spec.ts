import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    seedTreatmentRows,
    withDb,
} from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

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
 * Bug (2026-09-04, ISSUE-14 trong `userapp/inp-p0-open-issues.md`): bản port bỏ qua
 * `intSelectRaiin` ở **cả 5 chỗ** — `InsertUnpaidHandler` để `trtCnt = 1` cứng
 * (TODO Phase 2), `BuiPriceCalcInput.VisitsNo = 0`, `AccUnitCalculator` không có
 * tham số 来院回数, và `UnpaidDayRows.ForDay` lọc cứng `trt_cnt ∈ {1, 101}`.
 *
 * ⇒ bệnh nhân đến 2 lần/ngày: lượt 2 **xoá mềm rồi ghi đè** dòng của lượt 1 (cùng
 *   `trt_cnt = 1`), và **mỗi** lượt mang điểm/tiền của **cả ngày** → 窓口精算 thu sai.
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
 *  - `UnpaidDayRows.ForDay(…, raiinCnt)` → `trt_cnt % 100 = raiinCnt`.
 *  - `trn_trn.raiin_cnt` do `RaiinCntCalculator` ghi lúc F9 登録 — spec dựa vào
 *    đó nên TC-0 kiểm nó TRƯỚC, giống `p0-save-side-effects.spec.ts` TC-3.
 *
 * ─── Vì sao spec này phải TỰ DỰNG dữ liệu ──────────────────────────────────
 *  Ngày có 2 lượt khám gần như không tồn tại sẵn trong DB của tester, mà đó lại
 *  chính là kịch bản duy nhất phân biệt bản đúng với bản hỏng. Nên spec seed
 *  thẳng `trn_trn` (vùng `disp_no >= SEED_DISP_BASE`, giống
 *  `p0-save-side-effects.spec.ts`) rồi bấm F9 THẬT để `RaiinCntCalculator` đánh số.
 *  Không seed `raiin_cnt` bằng tay: làm vậy là tự viết ra kỳ vọng của chính mình.
 *
 * ─── GHI DB — đọc kỹ trước khi chạy ────────────────────────────────────────
 *  Spec GHI THẬT ở hai chỗ:
 *   · F9 登録 — bulk-save ghi lại **CẢ THÁNG** 処置 (xoá mềm + chèn lại disp_no mới).
 *     Chọn TEST_PAT_NO / TEST_TRT_DT vào tháng ÍT dữ liệu thật; beforeAll in ra
 *     số dòng thật để không ai phải đoán.
 *   · F8 会計 — `clear-unpaid` xoá mềm 未精算 của ngày rồi `insert-unpaid` chèn lại.
 *  Dọn dẹp: `trn_trn` của ngày test bị xoá hẳn; `unpaid` được snapshot ở beforeAll,
 *  afterAll xoá cứng dòng do lượt chạy sinh ra và bỏ xoá mềm dòng vốn đang sống.
 *
 * ─── BẪY ───────────────────────────────────────────────────────────────────
 *  1. F9 gửi lên NHỮNG GÌ ĐANG CÓ TRONG LƯỚI. Seed xong PHẢI mở lại màn hình,
 *     nếu không F9 ghi đè bằng bộ dòng cũ (chú thích của `resetMonthTo` ở
 *     `p0-save-side-effects.spec.ts`).
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
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/unpaid-raiin-cnt-parity.spec.ts --retries=0
 *
 * ENV:
 *   TEST_PAT_NO        bệnh nhân test (mặc định 12138)
 *   TEST_TRT_DT        ngày dựng 2 lượt khám (mặc định hôm nay)
 *   TEST_DB=1          BẮT BUỘC — assert soi thẳng Postgres
 *   TEST_ALLOW_SAVE=1  BẮT BUỘC — F9 + F8 ghi thật
 *
 * Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19) — các TC nối tiếp nhau.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = Number(process.env.TEST_PAT_NO ?? '12138')

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

/** 点数 mà mỗi lượt phải mang: `AccUnitCalculator` cộng `trt_pt × trt_cnt`. */
const SCORE_VISIT_1 = PT.syosin + PT.plainA // 304
const SCORE_VISIT_2 = PT.saisin + PT.plainB // 86
/** Con số của CẢ NGÀY — chính là giá trị mà bản hỏng ghi cho từng lượt. */
const SCORE_WHOLE_DAY = SCORE_VISIT_1 + SCORE_VISIT_2 // 390

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

const ALL_TEST_TRT_CDS = [SYOSIN_TRT_CD, SAISIN_TRT_CD, PLAIN_TRT_CD] as const

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

/** `trt_cd → raiin_cnt` của ngày test, theo thứ tự hiển thị. */
async function readRaiinCnts(): Promise<{ trtCd: number; dspTrt: string; raiinCnt: number }[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT trt_cd, COALESCE(dsp_trt, '') AS dsp_trt, raiin_cnt
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND deleted_at IS NULL
              ORDER BY disp_no, seq`,
            [PAT_NO, TRT_DT],
        )
        return r.rows.map((x) => ({
            trtCd: Number(x['trt_cd'] ?? 0),
            dspTrt: String(x['dsp_trt'] ?? ''),
            raiinCnt: Number(x['raiin_cnt'] ?? 0),
        }))
    })
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

    /** Xoá HẲN mọi dòng 処置 do spec này tạo, ở cả hai vùng disp_no. */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(PAT_NO, TRT_DT).catch(() => 0)
        for (const trtCd of ALL_TEST_TRT_CDS) {
            n += await deleteTreatmentRowsByTrtCd(PAT_NO, TRT_DT, trtCd).catch(() => 0)
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
     * Bản sao rút gọn của helper trong `unpaid-insert-parity.spec.ts` — cố ý giữ
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

    test.beforeAll(async ({ browser }) => {
        daySettled = await isDaySettled()
        const realRows = await countRealTreatmentRowsInMonth(PAT_NO, TRT_DT)
        console.log(
            `bệnh nhân ${PAT_NO}, ngày ${TRT_DT}: 会計済 = ${daySettled}, ` +
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

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Rule 14 — AutoSantei bung 「…を算定しますか？」 vào lúc không đoán được.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 60 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test.afterAll(async () => {
        await page?.close()
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

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-0 (mốc) — F9 đánh số raiin_cnt 1,1,2,2 cho ngày 2 lượt khám', async () => {
        skipWithReason(
            daySettled,
            `ngày ${TRT_DT} của bệnh nhân ${PAT_NO} ĐÃ quyết toán (view_acc_dat_active có dòng) — ` +
                'F8 sẽ rẽ sang nhánh 既存会計/会計データ修正, khác nhánh đang đo. Đổi TEST_TRT_DT.',
        )
        if (daySettled) return

        await buildTwoVisitDay()

        const rows = await readRaiinCnts()
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
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-1 — F8 từ dòng lượt 1: unpaid.trt_cnt = 1 và score CHỈ của lượt 1', async () => {
        skipWithReason(daySettled, `ngày ${TRT_DT} đã quyết toán — xem lý do ở TC-0`)
        if (daySettled) return

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
            `unpaid.score = ${insRow!.score}. Ra ${SCORE_WHOLE_DAY} nghĩa là vẫn tính CẢ NGÀY ` +
                `(AccUnitCalculator / BuiPriceService chưa lọc theo 来院回数).`,
        ).toBe(SCORE_VISIT_1)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-2 — F8 từ dòng lượt 2: sinh dòng trt_cnt = 2 và KHÔNG xoá dòng lượt 1', async () => {
        skipWithReason(daySettled, `ngày ${TRT_DT} đã quyết toán — xem lý do ở TC-0`)
        if (daySettled) return

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
            `lượt 2: unpaid.score = ${insVisit2!.score}, cần ${SCORE_VISIT_2}. ` +
                `Ra ${SCORE_WHOLE_DAY} nghĩa là mỗi lượt vẫn mang điểm của CẢ NGÀY.`,
        ).toBe(SCORE_VISIT_2)

        const insVisit1 = visit1.find((r) => r.lflg === 0 && r.score > 0)
        expect(insVisit1, 'lượt 1 không còn dòng 未精算 nào mang 点数').toBeTruthy()
        expect(
            insVisit1!.score,
            'kế toán lượt 2 KHÔNG được sửa số của lượt 1',
        ).toBe(SCORE_VISIT_1)

        // Tổng hai lượt = con số footer 日計 của ngày (modAcc.DispDayPoint cộng cả ngày).
        expect(
            insVisit1!.score + insVisit2!.score,
            'tổng điểm hai lượt phải bằng 日計 của ngày — thiếu nghĩa là có dòng bị bỏ sót',
        ).toBe(SCORE_WHOLE_DAY)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-3 — sflg giống nhau ở cả hai lượt: 初診判定 quét theo NGÀY, không theo lượt', async () => {
        skipWithReason(daySettled, `ngày ${TRT_DT} đã quyết toán — xem lý do ở TC-0`)
        if (daySettled) return

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
