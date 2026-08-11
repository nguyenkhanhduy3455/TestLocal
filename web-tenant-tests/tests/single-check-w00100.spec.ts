import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, deleteMstTrtRows, seedMstTrtRows } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — 行単位 診療チェック (SingleChk / W00100) trên màn `/treatments/{patNo}`.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo code
 * web. Các testcase tên 「WinForm parity N」 là những điểm web ĐANG LỆCH bản gốc →
 * chúng ĐỎ cho tới khi phần port còn thiếu được làm xong. Đỏ ở đó KHÔNG phải test
 * viết sai.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - INP/Lib/SingleChk.cs:26-47 — `new SingleChk(con, …, dtGrdRegi, curRow, cntRow)`
 *    gọi `Check.getCheckAnswerSingle(…, intPos: curRow, intRec: cntRow)` rồi lặp
 *    `Chk_list` và bung `MsgDialog.ShowWarningMsg("W00100", checkData.info)` cho
 *    TỪNG phần tử. KHÔNG hề gộp trùng: cùng một câu xuất hiện 2 lần trong Chk_list
 *    thì người dùng phải bấm OK 2 lần.
 *  - Check.cs:1322-1467 getCheckAnswerSingle — hai tham số định vị:
 *      · intPos = VỊ TRÍ DÒNG trong lưới (SetSelChkdata trả về đúng dòng vừa chạm),
 *      · intRec = SỐ DÒNG cần chạy (`for (idx = intPos; idx < intPos + intRec; idx++)`).
 *    Vậy đơn vị định vị của WinForm là (vị trí, số lượng) — KHÔNG phải bộ ba
 *    (trt_cd, trt_sb, ngày).
 *  - Check.cs:10980 — TOÀN BỘ khối 医情 (ijyo1_2 / sai_den / ishiC / ijyo3_4) nằm
 *    trong `DateHelper.IsDateTimeBetween(2022/4/1, 2026/5/31, dteTrtDt)`. Từ 令和8年6月
 *    (改定: 歯科ＤＸ thay 医情) WinForm KHÔNG chạy nhánh nào của khối này nữa ⇒ nhập
 *    医情 ở tháng hiện hành (令和8年7月) phải IM LẶNG.
 *  - Các điểm gọi SingleChk trong frm203002.cs:
 *      · :5678  sau khi chốt ô 回数 「１処置チェック」            → (curRow, 1)
 *      · :8802  frm210002_Let_Data (danh sách 薬剤)              → (CurrentCellAddress.Y, 1)
 *      · :9051  frmPack2_Let_Data (パック)                       → (CurrentCellAddress.Y, 1)
 *      · :9468  frmGuid2_Let_Data — lời gọi TRONG VÒNG LẶP bị COMMENT OUT (cố ý!)
 *      · :9532  frmGuid2_Let_Data — gọi ĐÚNG MỘT LẦN sau vòng lặp: (curRow, intCnt)
 *               với intCnt = số 処置 mà ガイド vừa đẩy vào lưới.
 *      · :9993  frmMed_LetData (薬剤選択)                        → (CurrentCellAddress.Y, 1)
 *
 * ─── Port web/BE đang có ──────────────────────────────────────────────────────
 *  - apps/web-tenant/.../treatment-entry-detail.tsx
 *      :2685 runSingleCheck — gọi POST /tenant/treatment/check-single cho TỪNG
 *            target rồi GỘP TRÙNG message (`seen` Set) trước khi bung alert.
 *      :5065 vòng lặp ガイド — gọi runSingleCheckBlocking cho TỪNG pick (WinForm
 *            comment out đúng chỗ này và chỉ gọi 1 lần sau vòng lặp).
 *      :694 / :3449 / :3538 / :5180 — các điểm gọi còn lại, đều truyền
 *            { trtCd, trtSb, day }.
 *  - apps/api/.../Treatments/Check/CheckRulesService.cs:139 — BE tìm lại dòng bằng
 *    (trt_cd, trt_sb, day) và lấy MATCH CUỐI CÙNG, thay cho intPos của WinForm.
 *  - apps/api/.../Check/Rules/ChkCalcPossibleRule.cs:41 và :51 — cổng thời gian của
 *    医情 chỉ có CẬN DƯỚI (>= 2022/4/1 và >= 2024/6/1), THIẾU cận trên 2026/5/31.
 *
 * ─── Phần KHÔNG kiểm được bằng e2e (đã chuyển sang unit test C#) ──────────────
 *  · ChkCalcPossible_repair_formation — nhánh thoát bằng コメントパック I019-0 (cần
 *    seed 修形 + 除去簡単 + comment インレー trùng 部位/ngày).
 *  · ChkCalcPossible_PerioCline — nhánh 特定薬剤 (mst_drug_rx dg_cd 628305301).
 *  · CHK4 ComToothCdSplit, CHK8 khe đối thủ là 処置グループ (trt_cd ≥ 1000).
 *  · Quirk `Chk_data[intPos]` của WinForm (Check.cs:1443/1458/1463): trong vòng lặp
 *    intRec dòng, Chkrol999 / ChkCalcPossible / ChkCalcWarn chỉ chạy cho dòng ĐẦU
 *    và lặp lại intRec lần → sinh message TRÙNG. Kiểm bằng unit test cho chắc.
 *
 * ─── Dữ liệu tự dựng (có can thiệp DB) ───────────────────────────────────────
 * Bản master áp dụng cho tháng hiện hành (MST_TRT266, hiệu lực 2026-06-01) đã BỎ
 * 医情 theo 改定 令和8年6月 — 108 chỉ còn 歯物価/外安全/外感染/歯ＤＸ(30/31/40). Không có
 * mã 医情 thì không nhập được qua UI, mà đúng mã đó mới kiểm được cận trên
 * 2026/5/31. Vì vậy `beforeAll` SEED tạm 108-14/108-16 vào bản master đang áp dụng
 * (clone từ 108-30 歯ＤＸ１ — xem seedMstTrtRows trong db.ts) và `afterAll` XOÁ HẲN
 * theo id đã tạo. Cần TEST_DB=1 (hoặc TEST_DB_HOST/TEST_DB_URL) trong .env; không
 * bật thì 2 testcase đó tự skip kèm lý do.
 *
 * ─── BẪY ĐÃ VẤP, đừng lặp lại ────────────────────────────────────────────────
 *  1. ĐỪNG mốc vào SỐ DÒNG lưới (`data-grid-cell$="|2"`). Lưới virtualize các
 *     tháng lịch sử (registration-table.tsx:206 useVirtualizer, overscan 2): chốt
 *     MỘT 処置 làm khối tháng hiện hành cao lên, scroll dịch, DOM đếm được nhảy
 *     90 → 96. Bản đầu của file này đỏ ở đúng chỗ đó và nó là LỖI TEST, không phải
 *     lỗi app. Mốc đúng: dòng mang TÊN 処置 vừa chốt xuất hiện.
 *  2. ĐỪNG đếm số lượt gọi ngay sau lượt đầu: web gọi tuần tự từng pick nên
 *     `expect(calls.length).toBe(1)` sẽ XANH GIẢ. Dùng `settledCallCount()` (dò
 *     tĩnh lặng) thay vì chốt ngay.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page (app giới hạn số lần
 * login — GUIDELINE Rule 10.1). Thứ tự testcase có ý nghĩa.
 *
 * File CÓ làm bẩn lưới đang mở (thêm dòng 処置) nhưng TUYỆT ĐỐI KHÔNG bấm F9 登録
 * nên KHÔNG ghi DB — tải lại trang là sạch.
 *
 *   npx playwright test tests/single-check-w00100.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** Endpoint của 行単位 診療チェック (TenantTreatmentEndpoints.cs:234). */
const CHECK_SINGLE_PATH = '/tenant/treatment/check-single'

/**
 * 医療情報取得加算 — cùng bộ mã mà WinForm dùng ở cả 3 nhánh của khối 医情:
 * 108-14/15 = 医情１･２(初診) (ChkCalcPossibleRule.IjyoInitCodes),
 * 108-16/17 = 医情３･４(再診) (IjyoReexamCodes).
 */
const IJYO_INIT_SB = 14
const IJYO_REEXAM_SB = 16
const IJYO_TRT_CD = '108'

/**
 * Cặp 医学管理料 dùng làm mồi sinh W00100 cho testcase đếm số hộp thoại:
 * 特疾管 (113-0) + 歯在管 (598-3). ChkCalcPossible_medical_care_fee (Check.cs:8110)
 * coi chúng là hai 医学管理料 KHÁC NHAU nên cái thứ hai luôn báo 同月算定不可 —
 * message không phụ thuộc dữ liệu sẵn có của ngày test.
 */
const MED_CARE_1_CD = '113'
const MED_CARE_1_SB = 0
const MED_CARE_2_CD = '598'
const MED_CARE_2_SB = 3

/**
 * Cận trên cửa sổ thời gian của khối 医情 — Check.cs:10980
 * `IsDateTimeBetween(new DateTime(2022,4,1), new DateTime(2026,5,31), dteTrtDt)`.
 */
const IJYO_WINDOW_END = new Date('2026-05-31T00:00:00')

/**
 * Các câu CHỈ khối 医情 mới sinh ra (ChkCalcPossible_ijyo1_2 / ijyo3_4,
 * Check.cs:11499/11703 → port ChkCalcPossibleRule.cs:602/638). Cố tình KHÔNG đưa
 * 「…の算定限度（1回）を超えています。」 vào danh sách: CHK5 (Check.cs:1418) vẫn chạy
 * bình thường ở tháng hiện hành và sinh câu rất giống — đưa vào sẽ đánh đỏ nhầm.
 */
const IJYO_ONLY_FRAGMENTS = [
    '電子情報処理組織の使用による費用の請求に関する届出が必要です',
    'オンライン資格確認運用開始日',
    'オンライン資格確認のライセンスがありません',
    '110-0 再診の算定がありません',
    '100-0 初診の算定がありません',
    '薬剤情報等・特定健診情報閲覧の同意があります',
]

/** Ngày test = hôm nay (màn hình mở tháng hiện hành khi không truyền trtDt). */
const TODAY_ISO = new Date().toISOString().slice(0, 10)

/** Số dòng ガイド tối đa sẽ dò để tìm một ガイド đẩy được ≥2 処置 vào lưới. */
const GUIDE_SCAN_LIMIT = 8

/** Chờ response của check-single (đi một vòng BE, có thể chậm khi dev server lạnh). */
const CHECK_RESP_TIMEOUT = 30_000

test.describe.configure({ mode: 'serial' })

test.describe('診療入力 — 行単位 診療チェック W00100 (SingleChk)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Nút đổi 入力モード ở header (lbInpMode) — nhãn đổi 点数 ↔ コード. */
    let modeBtn: Locator
    /** Ô 点 của dòng 日計 dưới cùng (input thật, data-footer-cell). */
    let footerTen: Locator
    /** Dialog 処置選択 (frm203016). */
    let trtPicker: Locator
    /** Dialog ガイド処置選択 (frm203017) — nhận diện bằng nhãn 「ガイド番号」. */
    let guidePicker: Locator
    /** Ô 療法・処置 của mọi dòng lưới — đếm số dòng. */
    let ryoCells: Locator
    /** Khung side panel (w-[450px]). */
    let sidePanel: Locator
    /** Dòng của tab ガイド (header cùng grid-cols nên phải kèm cursor-pointer). */
    let guideRows: Locator

    /**
     * Một lượt gọi /check-single đã bắt được: body request + danh sách message
     * BE trả về. Ghi cả hai vì mỗi testcase parity soi một nửa khác nhau.
     */
    interface SingleCheckCall {
        body: Record<string, unknown>
        infos: string[]
    }

    const calls: SingleCheckCall[] = []

    /**
     * id các dòng 処置マスタ seed tạm cho 2 testcase 医情 (xem seedMstTrtRows trong
     * db.ts). Rỗng = không seed được (TEST_DB tắt / không tìm thấy bản master) →
     * 2 testcase đó tự skip kèm lý do thay vì đỏ oan.
     */
    let seededMstTrtIds: string[] = []

    /** Xoá lịch sử bắt được — gọi ngay TRƯỚC thao tác cần đo. */
    function resetCalls() {
        calls.length = 0
    }

    /**
     * Chờ tới khi bắt được ít nhất `n` lượt gọi.
     *
     * KHÔNG kết luận "chỉ có đúng 1 lượt" ngay sau khi lượt đầu về (Rule 10.8):
     * web đang gọi tuần tự từng pick, lượt thứ hai đến sau lượt đầu vài trăm ms.
     * Vì vậy testcase đếm số lượt phải chờ thêm một mốc CÓ THẬT (lưới đã nhận đủ
     * dòng) rồi mới chốt con số.
     */
    async function waitCalls(n: number, timeout = CHECK_RESP_TIMEOUT) {
        await expect
            .poll(() => calls.length, {
                timeout,
                message: `không thấy đủ ${n} lượt POST ${CHECK_SINGLE_PATH}`,
            })
            .toBeGreaterThanOrEqual(n)
    }

    /**
     * Số lượt gọi sau khi ĐÃ LẶNG — trả về con số cuối cùng.
     *
     * KHÔNG đếm ngay sau lượt đầu (Rule 10.8): web gọi tuần tự từng pick, lượt sau
     * đến trễ vài trăm ms nên `expect(calls.length).toBe(1)` sẽ XANH GIẢ. Cũng
     * không đếm được bằng số dòng lưới: lưới virtualize các tháng lịch sử
     * (registration-table.tsx:206 useVirtualizer, overscan 2) nên số phần tử
     * `data-grid-cell` mount/unmount theo scroll — chốt 1 処置 có thể làm DOM đổi 6
     * dòng. Ở đây dò TĨNH LẶNG: poll cho tới khi `calls.length` không đổi suốt
     * `quietMs`, rồi mới chốt.
     */
    async function settledCallCount(quietMs = 3000, timeout = CHECK_RESP_TIMEOUT): Promise<number> {
        let last = -1
        let lastChange = Date.now()
        await expect
            .poll(
                () => {
                    if (calls.length !== last) {
                        last = calls.length
                        lastChange = Date.now()
                    }
                    // Chỉ tính là "lặng" khi đã có ít nhất một lượt.
                    return last > 0 ? Date.now() - lastChange : 0
                },
                { timeout, intervals: [200], message: 'không lượt SingleChk nào đến, hoặc chưa lặng' },
            )
            .toBeGreaterThanOrEqual(quietMs)
        return calls.length
    }

    /**
     * Dọn các dialog dây chuyền sau khi commit (W00100 / カルテ記載選択 / 摘要コメント…).
     * `waitMs > 0` = CHỜ dialog đến (SingleChk đi một vòng BE nên đến trễ; đếm ngay
     * sẽ thấy "sạch" rồi vài trăm ms sau overlay nuốt hết click của testcase kế).
     */
    async function closeStrayDialogs(waitMs = 0, rounds = 6) {
        const any = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        for (let i = 0; i < rounds; i++) {
            const present =
                waitMs > 0
                    ? await any
                          .first()
                          .waitFor({ state: 'visible', timeout: i === 0 ? waitMs : 1500 })
                          .then(() => true)
                          .catch(() => false)
                    : (await any.count()) > 0
            if (!present) break
            const ok = page.getByRole('button', { name: 'OK' })
            if ((await ok.count()) > 0) await ok.first().click()
            else await page.keyboard.press('F10')
            await expect(any.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
        // Overlay của Radix còn sống thêm một nhịp animation SAU khi dialog đã
        // "hidden" và nó nuốt pointer event → phải chờ nó biến mất hẳn.
        await expect(
            page.locator('div.fixed.inset-0[data-state="open"]'),
            'overlay của dialog vẫn còn, mọi click lên lưới sẽ bị nuốt',
        ).toHaveCount(0, { timeout: 10000 })
    }

    /**
     * Đóng lần lượt MỌI alertdialog đang xếp hàng, trả về nội dung từng cái.
     * Dùng để đếm số lần người dùng phải bấm OK — đúng thứ SingleChk.cs:43-46 làm
     * (một MsgDialog cho mỗi phần tử Chk_list).
     */
    async function drainAlerts(waitMs = 8000): Promise<string[]> {
        const texts: string[] = []
        const alert = page.getByRole('alertdialog')
        for (let i = 0; i < 12; i++) {
            const shown = await alert
                .first()
                .waitFor({ state: 'visible', timeout: i === 0 ? waitMs : 1500 })
                .then(() => true)
                .catch(() => false)
            if (!shown) break
            texts.push((await alert.first().innerText()).replace(/\s+/g, ' ').trim())
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(alert.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
        return texts
    }

    /** Bật コードモード (WinForm KeyFunc(F10) → flgInpMode = eCod). */
    async function setCodeMode() {
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')
    }

    /**
     * Gõ một 処置コード vào ô 点 của 日計 rồi Enter (WinForm case 3 → GetTrtmasCod).
     * Trả về true khi 処置選択 mở ra (mã có ≥2 枝番 — đúng thứ ta cần cho 108).
     */
    async function enterCodeAndOpenPicker(code: string): Promise<boolean> {
        await footerTen.click()
        await footerTen.fill(code)
        await footerTen.press('Enter')
        // Handler xoá input trước khi tra cứu → value === '' là tín hiệu CÓ THẬT
        // cho biết Enter đã được xử lý (Rule 7: không sleep).
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        return trtPicker
            .waitFor({ state: 'visible', timeout: 20000 })
            .then(() => true)
            .catch(() => false)
    }

    /**
     * Chọn dòng có 枝番 = `sb` trong 処置選択 rồi F9 確定.
     * Trả về false khi master của tháng hiện hành không có 枝番 đó.
     */
    async function confirmSb(sb: number): Promise<boolean> {
        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === sb)
        if (idx < 0) return false
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15000 })
        return true
    }

    /**
     * Lý do skip khi 処置選択 không có 枝番 医情 nào cho tháng hiện hành.
     *
     * ĐÂY LÀ TRẠNG THÁI ĐÚNG của dữ liệu, không phải test hỏng: bản master áp dụng
     * cho 令和8年7月 là MST_TRT266 (hiệu lực 2026-06-01) và 改定 令和8年6月 đã BỎ HẲN
     * 医情 — 108 chỉ còn 歯物価/外安全/外感染/歯ＤＸ (30/31/40). Bản trước đó
     * (MST_TRT264, hết hiệu lực 2026-05-31) mới có 108-14 医情(初診) / 108-16 医情(再診).
     * Nghĩa là ở tháng ngoài cửa sổ, mã 医情 KHÔNG nhập được qua UI, và nếu có dòng cũ
     * mang mã đó thì 処置マスタ存在チェック (getCheckAnswerSingle:1368) chặn trước khi
     * ChkCalcPossible kịp chạy. Luật cận trên vì vậy chỉ kiểm được ở tầng unit test.
     */
    const ijyoUnreachableReason = (sb: number, label: string) =>
        `không dựng được ${IJYO_TRT_CD}-${sb} (${label}) trong 処置選択. Bản master áp dụng cho ` +
        `tháng hiện hành (MST_TRT266) đã bỏ 医情 theo 改定 令和8年6月, nên spec tự seed tạm vào DB ` +
        `ở beforeAll — lần chạy này seed được ${seededMstTrtIds.length} dòng. Bật TEST_DB=1 trong ` +
        `.env để cho phép seed. Cận trên 2026/5/31 vẫn được phủ bởi unit test ` +
        `ChkCalcPossibleRuleTests.Evaluate_Ijyo3_AfterWindowEnd_Silent / Evaluate_Ijyo1_2_AfterWindowEnd_Silent.`

    /** Đóng 処置選択 bằng F10 (WinForm btnF10 戻る — không ghi gì). */
    async function dismissTrtPicker() {
        await page.keyboard.press('F10')
        await expect(trtPicker).toBeHidden({ timeout: 10000 })
    }

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo để cả file chỉ login MỘT lần; browser.newPage() KHÔNG kế thừa
        // `use` của config nên phải truyền tay ignoreHTTPSErrors (*.ochacom.local
        // dùng cert tự ký) + baseURL.
        // Seed TRƯỚC khi mở trình duyệt: danh sách 処置 của mã 108 được TanStack Query
        // cache (staleTime), nên nếu seed sau lần tra cứu đầu tiên thì picker vẫn là
        // bản cũ và 2 testcase 医情 sẽ skip nhầm.
        if (dbEnabled) {
            // Clone từ 108-30 歯ＤＸ１ — dòng có thật trong bản master đang áp dụng
            // (MST_TRT266), nên mọi cột NOT NULL đều hợp lệ.
            seededMstTrtIds = await seedMstTrtRows(TODAY_ISO, [
                { trtCd: 108, trtSb: IJYO_REEXAM_SB, trtNm: '医情３(再診)', fromTrtCd: 108, fromTrtSb: 30 },
                { trtCd: 108, trtSb: IJYO_INIT_SB, trtNm: '医情１(初診)', fromTrtCd: 108, fromTrtSb: 30 },
            ]).catch((err: unknown) => {
                console.log(`seed 処置マスタ 医情 thất bại: ${(err as Error).message}`)
                return [] as string[]
            })
            console.log(`seed 処置マスタ 医情: ${seededMstTrtIds.length} dòng`)
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        // Bắt MỌI lượt /check-single: request body cho các assert về định vị dòng,
        // response body cho các assert về nội dung message. Bọc try/catch vì
        // response có thể bị huỷ giữa chừng khi test kết thúc sớm.
        page.on('response', (res) => {
            if (!res.url().includes(CHECK_SINGLE_PATH)) return
            void (async () => {
                try {
                    const body = (res.request().postDataJSON() ?? {}) as Record<string, unknown>
                    const json = (await res.json()) as {
                        data?: { errors?: { info?: string }[] }
                    }
                    const infos = (json.data?.errors ?? []).map((e) => e.info ?? '')
                    calls.push({ body, infos })
                } catch {
                    /* response bị huỷ / không phải JSON — bỏ qua, assert sẽ tự báo thiếu */
                }
            })()
        })

        // AutoSantei bung SanteiConfirmDialog 「…を算定しますか？」 đè lên mọi thứ và nuốt
        // click; thời điểm không đoán được (GUIDELINE Rule 14). Bấm 「No」 chứ không
        // 「Yes」 — Yes lại kéo theo dialog カルテ記載選択.
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

        // KHÔNG truyền trtDt → tháng hiện hành. Bắt buộc: chỉ dòng của tháng hiện
        // hành mới sửa được, và cửa sổ 医情 của WinForm được xét theo dteTrtDt.
        await page.goto(`/treatments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        guidePicker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        ryoCells = page.locator('[data-grid-cell$="|2"]')
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        guideRows = sidePanel.locator(
            'div[class*="grid-cols-[40px_1fr]"][class*="cursor-pointer"]',
        )

        await expect(footerTen, 'không thấy ô 点 của dòng 日計').toBeVisible({ timeout: 30000 })
    })

    test.afterAll(async () => {
        await page?.close()
        // Dọn master đã seed — DELETE thật (không soft-delete) theo đúng id đã tạo.
        if (seededMstTrtIds.length > 0) {
            const n = await deleteMstTrtRows(seededMstTrtIds).catch(() => 0)
            console.log(`dọn 処置マスタ 医情: xoá ${n} dòng`)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Mốc: đường đi cơ bản phải còn sống thì các testcase parity mới có nghĩa.
    // ─────────────────────────────────────────────────────────────────────────

    test('chốt 処置選択 → bắn ĐÚNG MỘT lượt SingleChk (frm203002.cs:9051 → (row, 1))', async () => {
        // Điểm gọi đơn dòng của WinForm luôn truyền cntRow = 1: một cú chốt 処置 =
        // một lượt chạy getCheckAnswerSingle, không hơn.
        await setCodeMode()
        await closeStrayDialogs()

        const opened = await enterCodeAndOpenPicker(IJYO_TRT_CD)
        expect(opened, `mã ${IJYO_TRT_CD} không mở được 処置選択 — master tháng này không có?`).toBe(
            true,
        )

        resetCalls()
        // Dòng đầu của picker — không quan tâm là 枝番 nào, chỉ cần một cú chốt thật.
        const pickedName = (await trtPicker.getByTestId('cell-trtNm').first().innerText()).trim()
        await trtPicker.getByTestId('cell-trtNm').first().click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15000 })

        // Mốc: dòng 処置 vừa chốt đã nằm trong lưới (KHÔNG dùng số dòng — xem
        // settledCallCount về chuyện lưới virtualize).
        await expect(
            ryoCells.filter({ hasText: pickedName }).last(),
            `確定 mà lưới không có dòng 「${pickedName}」`,
        ).toBeVisible({ timeout: 20000 })

        const n = await settledCallCount()
        expect(
            n,
            `một cú chốt 処置 phải là ĐÚNG một lượt getCheckAnswerSingle (WinForm luôn truyền ` +
                `cntRow = 1), web bắn ${n} lượt`,
        ).toBe(1)
        console.log(`chốt 処置 「${pickedName}」 → 1 lượt SingleChk, BE trả ${calls[0]!.infos.length} message`)

        await closeStrayDialogs(6000)
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // WinForm parity — các điểm web đang lệch bản gốc.
    // ─────────────────────────────────────────────────────────────────────────

    test('WinForm parity 1: request phải định vị bằng (vị trí dòng, số dòng), không phải (mã, ngày)', async () => {
        // getCheckAnswerSingle nhận `intPos` (vị trí dòng trong lưới, do
        // SetSelChkdata trả về — Check.cs:1355) và `intRec` (số dòng). Vòng lặp
        // `for (idx = intPos; idx < intPos + intRec; idx++)` chạy ĐÚNG dải đó.
        //
        // Web đang gửi { trtCd, trtSb, day } và BE (CheckRulesService.cs:139) dò
        // ngược lấy MATCH CUỐI CÙNG trong tháng → chèn một 処置 trùng mã ở GIỮA ngày
        // sẽ chấm nhầm sang dòng cũ (khác 部位) và cho ra message sai.
        //
        // Hợp đồng đúng: body mang `rowIndex` (0-based, trỏ vào chính mảng `rows`
        // gửi kèm) + `rowCount` (= intRec).
        await closeStrayDialogs()
        await setCodeMode()
        const opened = await enterCodeAndOpenPicker(IJYO_TRT_CD)
        expect(opened, `mã ${IJYO_TRT_CD} không mở được 処置選択`).toBe(true)

        resetCalls()
        const pickedName = (await trtPicker.getByTestId('cell-trtNm').first().innerText()).trim()
        const pickedCd = Number(
            (await trtPicker.getByTestId('cell-trtCd').first().innerText()).trim(),
        )
        await trtPicker.getByTestId('cell-trtNm').first().click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15000 })
        await waitCalls(1)

        const body = calls[0]!.body
        const rows = (body.rows ?? []) as { trtCd?: number }[]
        try {
            expect(
                typeof body.rowIndex,
                `body thiếu 「rowIndex」 (intPos của Check.cs:1333). Đang gửi: ` +
                    `${JSON.stringify(Object.keys(body))}`,
            ).toBe('number')
            expect(
                typeof body.rowCount,
                'body thiếu 「rowCount」 (intRec của Check.cs:1334)',
            ).toBe('number')

            const idx = Number(body.rowIndex)
            expect(idx, 'rowIndex phải nằm trong mảng rows đã gửi kèm').toBeGreaterThanOrEqual(0)
            expect(idx).toBeLessThan(rows.length)
            expect(Number(body.rowCount), 'chốt 1 処置 ⇒ intRec = 1').toBe(1)
            // Dòng được trỏ tới phải ĐÚNG là 処置 vừa chốt.
            expect(
                Number(rows[idx]?.trtCd),
                `rows[${idx}] không phải 処置 vừa chốt 「${pickedName}」`,
            ).toBe(pickedCd)
        } finally {
            await closeStrayDialogs(6000)
        }
        await step()
    })

    test('WinForm parity 2: ガイド確定 N 処置 → ĐÚNG MỘT lượt SingleChk với intRec = N', async () => {
        // frmGuid2_Let_Data: lời gọi trong vòng lặp bị COMMENT OUT (frm203002.cs:9468)
        // và thay bằng đúng MỘT lời gọi sau vòng lặp (:9532):
        //     if (intCnt != 0) new SingleChk(…, curRow, intCnt);
        // ⇒ người dùng thấy cảnh báo SAU KHI cả loạt 処置 đã vào lưới, không bị chen
        // ngang giữa từng pick. Web đang gọi blocking cho từng pick
        // (treatment-entry-detail.tsx:5065).
        await closeStrayDialogs()

        // F4 → tab ガイド (frm203002.cs:4698 nhánh non-STEP).
        await page.keyboard.press('F4')
        await expect(guideRows.first(), 'tenant không có ガイド nào để test').toBeVisible({
            timeout: 30000,
        })

        // Dò một ガイド đẩy được ≥2 処置: dialog phải mở ĐƯỢC (ガイド rỗng tự đóng kèm
        // E00024) và có ≥2 dòng mang 回数 > 0 — chỉ những dòng đó mới vào lưới
        // (guide-selection-dialog: `.filter((it) => it.cnt > 0)`), và chúng chính là
        // intCnt của WinForm.
        let picks = 0
        /** Tên 処置 của dòng CUỐI CÙNG có 回数 > 0 — mốc "cả loạt đã vào lưới". */
        let lastPickName = ''
        const total = Math.min(await guideRows.count(), GUIDE_SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            await guideRows.nth(i).click()
            const noTrtAlert = page.getByText('算定できる処置がありません')
            await expect(guidePicker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
                timeout: 30000,
            })
            if (await noTrtAlert.count()) {
                await page.getByRole('button', { name: 'OK' }).first().click()
                await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
                continue
            }
            const cnts = await guidePicker.getByTestId('cell-cnt').locator('input').all()
            let positive = 0
            let lastIdx = -1
            for (let k = 0; k < cnts.length; k++) {
                if (Number((await cnts[k]!.inputValue()).trim() || '0') > 0) {
                    positive++
                    lastIdx = k
                }
            }
            if (positive >= 2) {
                picks = positive
                lastPickName = (
                    await guidePicker.getByTestId('cell-trtNm').nth(lastIdx).innerText()
                ).trim()
                break
            }
            await page.keyboard.press('F10')
            await expect(guidePicker).toBeHidden({ timeout: 10000 })
        }
        test.skip(
            picks < 2,
            `không ガイド nào trong ${total} dòng đầu đẩy được ≥2 処置 → không đo được intRec`,
        )

        resetCalls()
        await guidePicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(guidePicker).toBeHidden({ timeout: 15000 })

        // Mốc CÓ THẬT: 処置 CUỐI của loạt đã nằm trong lưới ⇒ vòng lặp đã chạy hết.
        // (Không dùng số dòng: lưới virtualize tháng lịch sử — xem settledCallCount.)
        if (lastPickName) {
            await expect(
                ryoCells.filter({ hasText: lastPickName }).last(),
                `ガイド確定 mà lưới không có 処置 cuối 「${lastPickName}」`,
            ).toBeVisible({ timeout: 30000 })
        }
        const n = await settledCallCount()

        try {
            expect(
                n,
                `frm203002.cs:9532 gọi SingleChk ĐÚNG 1 lần cho cả dải ${picks} 処置 ` +
                    `(lời gọi trong vòng lặp ở :9468 bị comment out). Web bắn ${n} lượt.`,
            ).toBe(1)
            expect(
                Number(calls[0]!.body.rowCount),
                `intRec phải bằng số 処置 ガイド vừa đẩy (${picks})`,
            ).toBe(picks)
        } finally {
            await closeStrayDialogs(8000)
        }
        console.log(`ガイド: ${picks} 処置 → ${n} lượt SingleChk`)
        await step()
    })

    test('WinForm parity 3: W00100 hiển thị TỪNG message, không gộp trùng (SingleChk.cs:43)', async () => {
        // SingleChk.cs:43-46 lặp nguyên `Chk_list` và bung một MsgDialog cho MỖI phần
        // tử. Chk_list CÓ THỂ chứa câu trùng nhau — chính WinForm sinh ra trùng ở
        // getCheckAnswerSingle (Check.cs:1458/1463 dùng `Chk_data[intPos]` bên trong
        // vòng lặp intRec dòng nên ChkCalcPossible/ChkCalcWarn lặp lại y nguyên).
        // Web gộp trùng bằng Set (treatment-entry-detail.tsx:2705) ⇒ người dùng bấm
        // OK ít lần hơn WinForm.
        //
        // Mồi phải KHÔNG phụ thuộc dữ liệu có sẵn của ngày test. Hai mồi đã thử và
        // loại: 108 (mọi 枝番 trong master hiện hành đều là 加算 → 0 message) và
        // 医管 334-8 (ChkCalcPossible_ikan tính được ngay khi ngày đó đã có một 処置
        // hợp lệ — testcase ガイド phía trên vừa thêm 3 dòng nên nó im lặng).
        //
        // Mồi dùng ở đây: 医学管理料 併算定 (ChkCalcPossible_medical_care_fee,
        // Check.cs:8107). Test TỰ nhập 2 医学管理料 khác nhau trong cùng tháng, nên cú
        // chốt thứ hai CHẮC CHẮN sinh 「…を算定しています。同月算定不可です。」 bất kể lưới
        // đang có gì. Cả hai mã đều có trong master hiện hành (MST_TRT266).
        await closeStrayDialogs()
        await setCodeMode()

        // (1) 特疾管 — dọn sạch mọi dialog dây chuyền của nó trước khi đo.
        const openedFirst = await enterCodeAndOpenPicker(MED_CARE_1_CD)
        expect(openedFirst, `mã ${MED_CARE_1_CD} không mở được 処置選択`).toBe(true)
        const pickedFirst = await confirmSb(MED_CARE_1_SB)
        if (!pickedFirst) {
            await dismissTrtPicker()
            test.skip(true, `master tháng này không có ${MED_CARE_1_CD}-${MED_CARE_1_SB} (特疾管)`)
        }
        await closeStrayDialogs(8000)

        // (2) 歯在管 — 医学管理料 thứ hai ⇒ 併算定 message.
        const openedSecond = await enterCodeAndOpenPicker(MED_CARE_2_CD)
        expect(openedSecond, `mã ${MED_CARE_2_CD} không mở được 処置選択`).toBe(true)

        resetCalls()
        const picked = await confirmSb(MED_CARE_2_SB)
        if (!picked) {
            await dismissTrtPicker()
            test.skip(true, `master tháng này không có ${MED_CARE_2_CD}-${MED_CARE_2_SB} (歯在管)`)
        }
        await waitCalls(1)

        const infos = calls[0]!.infos
        expect(
            infos.length,
            `nhập 2 医学管理料 khác nhau trong cùng tháng mà BE không trả message nào — ` +
                `ChkCalcPossible_medical_care_fee (Check.cs:8107) phải báo 同月算定不可`,
        ).toBeGreaterThan(0)
        const dupes = infos.length - new Set(infos).size
        console.log(
            `parity 3: BE trả ${infos.length} message (${dupes} câu trùng) → phải có ${infos.length} hộp thoại`,
        )

        const alerts = await drainAlerts()
        try {
            expect(
                alerts.length,
                `BE trả ${infos.length} message (${JSON.stringify(infos)}) nhưng chỉ bung ` +
                    `${alerts.length} hộp thoại. SingleChk.cs:43 bung một hộp cho MỖI phần tử ` +
                    `Chk_list, kể cả khi trùng nội dung.`,
            ).toBe(infos.length)
        } finally {
            await closeStrayDialogs(3000)
        }
        await step()
    })

    test('WinForm parity 4: 医情３･４ (108-16) ngoài cửa sổ 2026/5/31 → KHÔNG cảnh báo 医情', async () => {
        // Check.cs:10980 bọc CẢ khối 医情 trong IsDateTimeBetween(2022/4/1, 2026/5/31).
        // Tháng hiện hành đã qua mốc đó ⇒ ChkCalcPossible không chạm ijyo3_4, không
        // câu nào của khối này được sinh ra. Port ChkCalcPossibleRule.cs:51 chỉ có
        // cận dưới (>= 2024/6/1) nên vẫn chạy → sinh cảnh báo mà WinForm không có.
        const today = new Date()
        test.skip(
            today <= IJYO_WINDOW_END,
            `hôm nay (${today.toISOString().slice(0, 10)}) vẫn nằm trong cửa sổ 医情 ` +
                `(≤ ${IJYO_WINDOW_END.toISOString().slice(0, 10)}) → chưa kiểm được cận trên`,
        )

        await closeStrayDialogs()
        await setCodeMode()
        const opened = await enterCodeAndOpenPicker(IJYO_TRT_CD)
        expect(opened).toBe(true)

        resetCalls()
        const picked = await confirmSb(IJYO_REEXAM_SB)
        if (!picked) {
            await dismissTrtPicker()
            test.skip(true, ijyoUnreachableReason(IJYO_REEXAM_SB, '医情３'))
        }
        await waitCalls(1)

        const infos = calls[0]!.infos
        const hits = infos.filter((m) => IJYO_ONLY_FRAGMENTS.some((f) => m.includes(f)))
        try {
            expect(
                hits,
                `nhập ${IJYO_TRT_CD}-${IJYO_REEXAM_SB} ở tháng hiện hành mà vẫn ra cảnh báo của ` +
                    `khối 医情. WinForm (Check.cs:10980) KHÔNG chạy khối này sau 2026/5/31.`,
            ).toEqual([])
        } finally {
            await closeStrayDialogs(6000)
        }
        if (infos.length === 0) {
            // Không thể kiểm CHIỀU NGƯỢC LẠI bằng e2e: muốn 医情 lên tiếng thì màn hình
            // phải mở ở tháng TRONG cửa sổ (≤ 2026/5), mà tháng quá khứ là read-only
            // (WinForm col51 == "99") nên không nhập được 処置 vào đó. Chiều dương nằm ở
            // unit test ChkCalcPossibleRuleTests.Evaluate_Ijyo3_InsideWindow_Reports —
            // cùng một hàng, tháng 2026/5 → có message; ở đây tháng 2026/7 → im lặng.
            console.log(
                'parity 4: BE trả 0 message cho 医情３ (đúng kỳ vọng ngoài cửa sổ). ' +
                    'Chiều dương "trong cửa sổ thì phải cảnh báo" nằm ở unit test ' +
                    'ChkCalcPossibleRuleTests.Evaluate_Ijyo3_InsideWindow_Reports.',
            )
        }
        await step()
    })

    test('WinForm parity 5: 医情１･２ (108-14) ngoài cửa sổ 2026/5/31 → KHÔNG cảnh báo 医情', async () => {
        // Cùng lý do parity 4, nhánh 初診 (ChkCalcPossible_ijyo1_2, Check.cs:11499 →
        // port ChkCalcPossibleRule.cs:41 chỉ có cận dưới >= 2022/4/1).
        const today = new Date()
        test.skip(today <= IJYO_WINDOW_END, 'hôm nay vẫn trong cửa sổ 医情 → chưa kiểm được cận trên')

        await closeStrayDialogs()
        await setCodeMode()
        const opened = await enterCodeAndOpenPicker(IJYO_TRT_CD)
        expect(opened).toBe(true)

        resetCalls()
        const picked = await confirmSb(IJYO_INIT_SB)
        if (!picked) {
            await dismissTrtPicker()
            test.skip(true, ijyoUnreachableReason(IJYO_INIT_SB, '医情１'))
        }
        await waitCalls(1)

        const infos = calls[0]!.infos
        const hits = infos.filter((m) => IJYO_ONLY_FRAGMENTS.some((f) => m.includes(f)))
        try {
            expect(
                hits,
                `nhập ${IJYO_TRT_CD}-${IJYO_INIT_SB} ở tháng hiện hành mà vẫn ra cảnh báo của khối 医情.`,
            ).toEqual([])
        } finally {
            await closeStrayDialogs(6000)
        }
        await step()
    })

    test('WinForm parity 6: sửa ô 回数 → SingleChk trỏ ĐÚNG dòng vừa sửa (frm203002.cs:5678)', async () => {
        // Sau khi chốt 回数, WinForm gọi `new SingleChk(…, curRow, 1)` với curRow =
        // CHÍNH dòng đang đứng. Web gửi (trtCd, trtSb, day) nên BE phải dò ngược và
        // lấy match cuối cùng — sai ngay khi ngày đó có 2 dòng cùng mã.
        await closeStrayDialogs()

        // Ô 回 của dòng dưới cùng — `:not([data-footer-cell])` loại ô của dòng 日計.
        const kaiCell = page
            .locator('[data-grid-cell$="|4"]:not([data-footer-cell]):not(:has(input))')
            .last()
        await expect(kaiCell, 'lưới chưa có dòng 処置 nào để sửa 回数').toBeVisible({
            timeout: 15000,
        })
        const cellKey = ((await kaiCell.getAttribute('data-grid-cell')) ?? '').replace(/\|4$/, '')
        // Lưới chỉ có 5 cột 0:日/1:部位/2:療法・処置/3:点/4:回 (RegiCol, frm203002.cs:158)
        // — không có cột 処置コード, nên đối chiếu dòng bằng TÊN 処置 (payload.dspTrt).
        const nameOfRow = (await page.locator(`[data-grid-cell="${cellKey}|2"]`).innerText()).trim()

        await kaiCell.dblclick()
        const editor = page.locator(`[data-grid-cell="${cellKey}|4"] input`)
        await expect(editor, 'double-click không mở được editor ô 回').toBeVisible({ timeout: 10000 })
        const oldCnt = Number((await editor.inputValue()).trim() || '0')

        resetCalls()
        await editor.fill(String(oldCnt === 2 ? 3 : 2))
        await editor.press('Enter')
        await waitCalls(1)

        const body = calls[0]!.body
        const rows = (body.rows ?? []) as { trtCd?: number; dspTrt?: string }[]
        try {
            expect(
                typeof body.rowIndex,
                'body thiếu 「rowIndex」 — đường sửa 回数 cũng phải định vị bằng vị trí dòng (curRow)',
            ).toBe('number')
            expect(Number(body.rowCount), 'sửa 1 dòng ⇒ intRec = 1').toBe(1)
            const idx = Number(body.rowIndex)
            expect(idx).toBeGreaterThanOrEqual(0)
            expect(idx).toBeLessThan(rows.length)
            if (nameOfRow) {
                expect(
                    (rows[idx]?.dspTrt ?? '').trim(),
                    `rowIndex ${idx} không trỏ vào dòng vừa sửa 「${nameOfRow}」`,
                ).toBe(nameOfRow)
            }
        } finally {
            await closeStrayDialogs(8000)
        }
        await step()
    })
})
