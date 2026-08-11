import { expect, test, type Page } from '@playwright/test'

import {
    careInsRateFor,
    dayScoreByJihiFlg,
    dbEnabled,
    deleteTreatmentRows,
    seedTreatmentRows,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — dòng xám 【介護保険一部負担金　　n 円】 (linekbn = 30) trên lưới
 * `/treatments/{patNo}`.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web. Testcase 「WinForm parity」 là điểm web ĐANG THIẾU HẲN phần port →
 * nó ĐỎ cho tới khi làm xong. Đỏ ở đó KHÔNG phải test viết sai.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - INP/Forms/frm203002.cs:5681-5688 — gõ 処置 mà `trt_cd == 599` và
 *    `trt_sb == 0 | 1 | > 10` ⇒ `bolKaigoFlg = true`, đồng thời TÔ XÁM dòng vừa
 *    nhập: `hFG1[i, curRow].Style.BackColor = 0xE0E0E0` (i = 1..5).
 *    (INP/Lib/modMain.cs:775 `Chk_CmtAuto` và INP/Lib/modSave.cs:706 `SetKaigoFlg`
 *     dùng `trt_sb >= 10` — bản gốc lệch nhau ở chính chỗ này, xem "Bẫy" bên dưới.)
 *  - INP/Forms/frm203002.cs:5785-5788 — `if (bolKaigoFlg) KaigoHutanSet(con);`
 *  - INP/Forms/frm203002.cs:5935-6025 — **KaigoHutanSet**:
 *      · quét cả lưới, cộng `careScore += hFG1[54, i]` (点数×回数) cho MỌI dòng
 *        CÙNG NGÀY có `hFG1[70, i] == "3"` (jihi_flg = 3 = 介護), nhớ `intKaigoMaxRow`
 *        = dòng 介護 CUỐI CÙNG và `intKaigoRow` = dòng linekbn 30 CŨ (nếu có);
 *      · `strRate = CareIns.getCareInsRate(careInsDataList, dtTgtDate)`, không ra
 *        thì fallback `INSURE.acc_rate == 0 ? 0 : 10` (:5977-5992);
 *      · `carePrice = careScore * 10 * careRate / 100` (:5993, chia số nguyên);
 *      · XOÁ dòng 30 cũ rồi chèn lại NGAY SAU dòng 介護 cuối (:5995-6010) ⇒ mỗi
 *        ngày luôn có ĐÚNG MỘT dòng, số tiền luôn mới;
 *      · nội dung ô 療法・処置: `"     【介護保険一部負担金　　" + carePrice + " 円】"`
 *        (:6014 — 5 space thường + 2 space toàn giác), `hFG1[51] = "30"` (:6015),
 *        `hFG1[68]` chép 枝番 của dòng trên (:6016), tô xám (:6018-6021).
 *  - INP/Forms/frm203002.cs:9117-9130 / 9491-9526 — đường ガイド: `guidCd == "9908"`
 *    ⇒ `bFlgKaigo`, mọi dòng đẩy vào lưới mang `jihi_flg = "3"` rồi chèn cùng một
 *    dòng tổng. (INP/Forms/frm203017.cs:1400-1403 ép `jihiFlg = "3"` từ phía ガイド.)
 *  - INP/Lib/modSave.cs:2456-2500 và 2747-2790 — LÚC NẠP THÁNG: đọc `jihi_flg` từ
 *    TRNTRN (:2661), tô xám lại (:2723-2733) và chèn dòng 30 ở cuối mỗi khối 介護.
 *    ⇒ dòng này KHÔNG lưu DB (modSave.cs:237 chỉ ghi dòng `linekbn == "2"`), nó
 *    được DỰNG LẠI từ `jihi_flg = 3` mỗi lần mở màn hình.
 *  - INP/Forms/frm203002.cs:3458-3468 — `grdRegi_CellBeginEdit` huỷ edit khi
 *    `linekbn ∈ {10..15, 30}` và cột đang sửa là 2 (療法・処置) ⇒ dòng tổng read-only.
 *  - INP/Lib/modAcc.cs:132-212 `DispDayPoint` / :107-121 `Calc_MDPoint` — 日計/月計
 *    CHỈ cộng `insPayDatas` ⇒ điểm 介護 nằm NGOÀI 【日計 …点】.
 *  - INP/Lib/modAcc.cs:302-342 `Calc_DayPoint_Kaigo` + :419/:544/:556 — 会計 lấy
 *    `carePrice` qua đường riêng và cộng vào 本日請求額.
 *  - COMMON/DBAccess/CareInsurance.cs:227-266 `getCareInsRate` — ưu tiên
 *    `acc_rate_1/2` khi bản 認定 có 公費 (`pubexp_def_no`), không thì `bur_rate_1/2`
 *    của bản mới nhất. `care_ed_dt` KHÔNG được xét (認定 hết hạn vẫn ra rate).
 *    → dựng lại ở `tests/db.ts` → `careInsRateFor()` để test tự tính kỳ vọng.
 *
 * ─── Port web/BE đang có (đọc ngày 2026-07-29, nhánh feat/single-check-gate-todo) ─
 *  - KHÔNG có gì trong lưới 診療入力: `components/registration-table.tsx` không hề
 *    nhắc 介護 / kaigo / 599; `linekbn` chỉ còn trong comment (`"1"`, `"99"`), không
 *    có hằng số nào mang giá trị 30.
 *  - `trt_cd 599 → 介護` mới chỉ tồn tại ở đường IN カルテ2号用紙:
 *    `Reports/Handlers/BuildTrnTrnLedgerDatasourceHandler.cs:227/235` và
 *    `TrnTrns/Handlers/Cct2KaigoSumCalculator.cs` (bản port đủ của getCareInsRate).
 *    Dòng xám mẫu đã có: `medical-records/components/cct2-table.tsx:303/310/327`
 *    (`isKaigo && 'bg-gray-200'`).
 *  - `Treatments/Pricing/BuiPriceService.cs:428-444 CalculateCareInfoAsync` là STUB
 *    (`// TODO: Implement care insurance calculation logic` → `SetCareData(0,0,0,0,…)`)
 *    ⇒ `GET /tenant/treatment/accounting/daily-summary` luôn trả careScore/carePrice = 0
 *    và dialog 入金指定 (`payment-designation-dialog.tsx:324`) luôn hiện 介護保険 0.
 *  - `Treatments/Handlers/SaveTreatmentsHandler.cs:37` — `TODO SetKaigoFlg`.
 *  - Đường đọc lưới `TreatmentQueries.GetPatientTreatmentsAsync` trả `jihi_flg` thô,
 *    KHÔNG phân loại 介護; màn hình gọi với `inputType: All`
 *    (`treatment-entry-detail.tsx:329`) nên dòng `jihi_flg = 3` VẪN hiện — chỉ là
 *    hiện như một dòng bảo hiểm bình thường.
 *
 * ─── Phần KHÔNG kiểm được bằng e2e không-ghi-DB ───────────────────────────────
 *  · `SetKaigoFlg` (modSave.cs:684-737): chỉ lộ ra khi bấm F9 登録 rồi soi
 *    `trn_trn.jihi_flg` — spec này CỐ Ý không ghi DB nên không phủ. Cần một
 *    testcase riêng có cờ `TEST_ALLOW_SAVE`, hoặc unit test C#.
 *  · Đường ガイド 9908: tenant hiện KHÔNG có `guid_cd` 9908 nào (grep toàn repo +
 *    toàn bộ `apps/ddl/sql` = 0 hit), nên không dựng được từ UI.
 *
 * ─── Dữ liệu tự dựng (có can thiệp DB, cần TEST_DB=1) ─────────────────────────
 * `beforeAll` seed 2 dòng 処置 vào `trn_trn` của (TEST_PAT_NO, TEST_TRT_DT) trong
 * vùng `disp_no >= 9000` và `afterAll` xoá đúng vùng đó:
 *      599-0 歯科医師居宅療養管理指導Ⅰ  517点 ×1   jihi_flg = 3
 *      599-1 歯科衛生士等居宅療養Ⅰ      362点 ×1   jihi_flg = 3
 * `jihi_flg = 3` là trạng thái mà `SetKaigoFlg` LUÔN ghi ra cho mã 599 ⇒ đây đúng
 * là "dữ liệu đã lưu của một ngày có 介護" mà màn hình phải đọc lại được. Điểm số
 * 517/362 lấy từ bản master đang áp dụng (MST_TRT266, `mst_trt.score1`).
 *
 * ─── BẪY ĐÃ VẤP / cần biết ────────────────────────────────────────────────────
 *  1. Bản gốc LỆCH NHAU về ngưỡng 枝番: frm203002.cs:5684 dùng `trt_sb > 10` trong
 *     khi modMain.cs:775 / modSave.cs:706 dùng `>= 10`. Spec chỉ dùng 599-0 và
 *     599-1 nên tránh hẳn vùng tranh chấp đó.
 *  2. `KaigoHutanSet` tô xám cột 1..4 (`i < 5`, :6018) còn 3 chỗ chèn còn lại tô
 *     1..5 — test chỉ assert cột 療法・処置 (col 2), nằm trong cả hai cách hiểu.
 *  3. ĐỪNG mốc vào SỐ DÒNG lưới: lưới virtualize các tháng lịch sử
 *     (registration-table.tsx:206). Mốc theo TEXT của dòng.
 *  4. `599-2 歯在管(１又は２以外)` KHÔNG phải 介護 (modSave.cs:2964,
 *     CmtAuto.cs:1469 loại trừ) — dữ liệu thật của tenant toàn là 599-2, đừng
 *     nhầm nó là dòng 介護.
 *  5. F9 確定 Ở 処置選択 CHƯA PHẢI LÀ CHỐT 処置: nó chỉ đưa dòng vào trạng thái chờ
 *     nhập 回数. Cascade 摘要コメント (`Chk_CmtAuto`) chạy ở nhánh Enter của ô 回数
 *     (frm203002.cs:5758-5776) — cùng chỗ gọi `KaigoHutanSet` (:5785). Muốn kiểm
 *     comment thì phải Enter ô 回 trước, nếu không lưới đúng là chưa có gì.
 *     VÀ phải Enter vào ĐÚNG ô app đang focus (ô 回 của chính dòng vừa chốt, ở chế độ
 *     nhập, KHÔNG mang `data-grid-cell`) — nhắm vào ô 回 của dòng 日計
 *     (`data-footer-cell$=":footer-kai"`) tuy cũng chốt được dòng nhưng cascade không
 *     chạy, và testcase đỏ như thể app thiếu chức năng.
 *  6. TAILWIND v4 TRẢ MÀU **oklch**: `getComputedStyle().backgroundColor` của
 *     `bg-gray-200` là `oklch(0.928 0.006 264.531)`, KHÔNG phải `rgb(229,231,235)`.
 *     Bản đầu của `isGrayish` chỉ regex `rgba?(...)` nên đánh đỏ oan TC-5 trong khi
 *     app đã tô xám đúng. Nay quy đổi qua canvas 1×1 trước khi so.
 *  7. NFKC ĂN 「Ⅰ」: bản đầu của file này dò dòng bằng đúng tên master
 *     `歯科医師居宅療養管理指導Ⅰ` và ĐỎ với thông báo "seed hỏng" — thật ra seed đúng,
 *     chỉ là `txt()` chuẩn hoá NFKC đã biến `Ⅰ` (U+2160) trên lưới thành `I`, còn
 *     hằng số thì không. Mọi phép dò giờ dùng `KAIGO_KEY_*` (đã cắt ký tự đó).
 *     Cùng họ với bẫy `加算１` → `加算1` mà `expectWinFormOrder` đã ghi nhận.
 *
 * ─── Cách chạy (GUIDELINE Rule 19) ────────────────────────────────────────────
 * `describe.serial` + MỘT page chung tạo ở `beforeAll` ⇒ cả file chỉ login MỘT
 * lần (Rule 10.1). Mỗi điểm parity là một testcase riêng (TC-2 … TC-9) để đọc
 * report biết ngay chỗ nào thiếu, nhưng chúng NỐI TIẾP TRẠNG THÁI của cùng một
 * phiên đăng nhập:
 *   · LUÔN chạy CẢ FILE, không bao giờ `-g` một testcase lẻ (chạy lẻ thì
 *     `beforeAll` vẫn login + seed nhưng thứ tự trạng thái đứt, dễ đỏ giả);
 *   · serial ⇒ một test đỏ thì các test SAU bị SKIP. Chấp nhận có chủ ý: cứ sửa
 *     gap đỏ đầu tiên rồi chạy lại, gap kế tiếp lộ ra. TC-2 (dòng tổng không tồn
 *     tại) là gốc của gần hết các gap còn lại nên nó đỏ trước là hợp lý;
 *   · page tự tạo nên KHÔNG có trace/video/screenshot tự động của fixture.
 *
 * Thứ tự testcase CÓ Ý NGHĨA: TC-9 (nhập tay) làm bẩn lưới nên phải nằm cuối.
 *
 * Lưới bị làm bẩn ở bước cuối (nhập tay 599-0) nhưng TUYỆT ĐỐI KHÔNG bấm F9 登録
 * ⇒ không ghi DB; dữ liệu duy nhất chạm DB là 2 dòng seed, đã dọn ở afterAll.
 *
 *   npx playwright test tests/kaigo-hutan-row.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — 12138 không có bản 介護保険 nào ⇒ rate đi nhánh fallback. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/**
 * Ngày test = HÔM NAY (yyyy-MM-dd). Bắt buộc thuộc tháng hiện hành: chỉ dòng của
 * tháng đang mở mới nhập tay được (bước KaigoHutanSet ở cuối cần điều đó).
 */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** 介護 対象 処置コード — WinForm hard-code 599 ở 5 chỗ, không có hằng số nào. */
const KAIGO_TRT_CD = '599'
/** 枝番 0/1 = 居宅療養管理指導Ⅰ (歯科医師 / 歯科衛生士) — chắc chắn là 介護. */
const KAIGO_SB_DR = 0
const KAIGO_SB_DH = 1
/** 点数 của 2 枝番 trên trong bản master đang áp dụng (mst_trt.score1, MST_TRT266). */
const KAIGO_PT_DR = 517
const KAIGO_PT_DH = 362
/** 表示名 đầy đủ trong master — ghi vào `dsp_trt` khi seed. */
const KAIGO_NM_DR = '歯科医師居宅療養管理指導Ⅰ'
const KAIGO_NM_DH = '歯科衛生士等居宅療養Ⅰ'

/**
 * Mốc TÌM KIẾM trên lưới — CỐ Ý cắt bỏ đuôi 「Ⅰ」.
 *
 * BẪY ĐÃ VẤP: `txt()` chuẩn hoá NFKC (bắt buộc, vì lưới render full-width còn
 * master ghi half-width), mà NFKC biến `Ⅰ` (U+2160 ROMAN NUMERAL ONE) thành chữ
 * `I` thường — y như nó biến `１` thành `1`. Hằng số dò tìm mà vẫn giữ U+2160 thì
 * `includes` KHÔNG BAO GIỜ khớp, và test đỏ ở chỗ trông như "seed hỏng".
 * Bỏ hẳn ký tự dễ biến dạng ⇒ khớp được cả chuỗi thô (Playwright `hasText`) lẫn
 * chuỗi đã chuẩn hoá.
 */
const KAIGO_KEY_DR = '歯科医師居宅療養管理指導'
const KAIGO_KEY_DH = '歯科衛生士等居宅療養'

/** `TRNTRN.JIHI_FLG` = 3 ⇒ dòng 介護 (0=保険, 1/2=自費). */
const JIHI_FLG_KAIGO = 3
/** `RegiLineKbn.kaigoLine` (frm203002.cs:218-219) — cột 51 của dòng tổng. */
const LINEKBN_KAIGO = 30
/** Nhãn cố định của dòng tổng (frm203002.cs:6014). */
const KAIGO_LABEL = '介護保険一部負担金'

/** Endpoint 本日請求額 của dialog 入金指定 (TenantTreatmentEndpoints.cs:126). */
const DAILY_SUMMARY_PATH = '/tenant/treatment/accounting/daily-summary'

/** Lưới nạp lần đầu qua Vite dev server lạnh có thể rất chậm. */
const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

/**
 * 摘要コメント mà 処置 599 kéo theo — `mst_cmt_pack` của (599, 枝番):
 *   C001-3-1 pack_type 1  → 「居宅療養管理指導費」          (không kèm ngày)
 *   C001-3-2 pack_type 50 / condition 算定日 → com 850100317
 *            「居宅療養管理指導費算定年月日 <和暦の処置日>」
 * WinForm sinh cả hai ngay khi chốt 回数 (CmtAuto.prgCmtAuto, CmtAuto.cs:674 →
 * :1287-1289 lấy strDt = 算定日 = chính 処置日, rồi setPacData case 50 nối
 * `com_nm + " " + gggyy年MM月dd日` — CmtAuto.cs:3684-3695).
 */
const KAIGO_CMT_NM = '居宅療養管理指導費'
const KAIGO_CMT_DATE_NM = '居宅療養管理指導費算定年月日'

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/**
 * `gggyy年MM月dd日` của WinForm (`EditControl.editDateToString`) cho ngày test.
 * Chỉ dựng nhánh 令和 (bắt đầu 2019/05/01): TRT_DT luôn là tháng hiện hành nên
 * không chạm biên niên hiệu; ngoài phạm vi đó thì ném lỗi thay vì trả số sai.
 */
function warekiDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
    if (y < 2019 || (y === 2019 && m < 5)) {
        throw new Error(`warekiDate: ${iso} nằm trước 令和 — spec chỉ dựng nhánh 令和`)
    }
    const yy = y - 2018
    return `令和${String(yy).padStart(2, '0')}年${String(m).padStart(2, '0')}月${String(d).padStart(2, '0')}日`
}

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|2` của data-grid-cell). */
    key: string
    text: string
}

async function gridRows(page: Page): Promise<GridRow[]> {
    const raw = await ryoCells(page).evaluateAll((els) =>
        els.map((e) => ({
            key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
            text: e.textContent ?? '',
        })),
    )
    return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
}

/**
 * Regex nhận dòng tổng với ĐÚNG số tiền, chịu được cả `879` lẫn `1,396`
 * (WinForm in số trần, bản port có thể `toLocaleString()`), và cả space thường
 * lẫn space toàn giác giữa nhãn và số.
 */
function kaigoRowPattern(yen: number): RegExp {
    const forms = new Set([String(yen), yen.toLocaleString('en-US')])
    const num = [...forms].map((f) => f.replace(/,/g, ',')).join('|')
    return new RegExp(`${KAIGO_LABEL}[\\s\\u3000]*(?:${num})[\\s\\u3000]*円`)
}

/** Màu nền của một ô: chuỗi CSS thô + giá trị sRGB đã quy đổi. */
interface CellBg {
    /** Nguyên văn `getComputedStyle().backgroundColor` — để in ra khi assert hỏng. */
    raw: string
    /** [r, g, b, a] 0-255 (a: 0-1); null khi trình duyệt không parse được màu. */
    rgba: [number, number, number, number] | null
}

/**
 * Màu nền THỰC TẾ của một ô: leo tối đa 3 cấp cha vì bản port có thể đặt class
 * nền ở div dòng (như `cct2-table.tsx` đặt `bg-gray-200` cho CẢ dòng lẫn ô).
 *
 * BẪY ĐÃ VẤP: Tailwind v4 khai màu bằng **oklch**, và Chrome trả computed style
 * NGUYÊN DẠNG `oklch(0.928 0.006 264.531)` chứ không quy về `rgb()`. Bản đầu của
 * hàm so màu chỉ regex `rgba?(...)` nên coi `bg-gray-200` là "không phải xám" và
 * đánh đỏ oan một tính năng ĐÃ chạy đúng. Vì vậy quy đổi qua canvas 1×1: gán
 * `fillStyle` rồi đọc pixel — Chrome tự chuyển mọi cú pháp màu nó hiểu về sRGB.
 */
async function resolvedBg(page: Page, key: string, col: number): Promise<CellBg> {
    return page.locator(`[data-grid-cell="${key}|${col}"]`).evaluate((el) => {
        const toRgba = (color: string): [number, number, number, number] | null => {
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1
            const ctx = canvas.getContext('2d')
            if (!ctx) return null
            ctx.clearRect(0, 0, 1, 1)
            // Đặt màu hợp lệ trước: fillStyle giữ nguyên giá trị cũ nếu chuỗi mới
            // không parse được, nên nền đen này là dấu hiệu "không đọc được màu".
            ctx.fillStyle = '#000000'
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            const d = ctx.getImageData(0, 0, 1, 1).data
            return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
        }

        let n: HTMLElement | null = el as HTMLElement
        for (let i = 0; i < 3 && n; i++, n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                return { raw: c, rgba: toRgba(c) }
            }
        }
        return { raw: 'rgba(0, 0, 0, 0)', rgba: [0, 0, 0, 0] as [number, number, number, number] }
    })
}

/**
 * WinForm dùng 0xE0E0E0 = rgb(224,224,224); bản port dùng gam xám nào cũng được
 * miễn là XÁM và ĐẶC. `bg-gray-200` của Tailwind = #e5e7eb = rgb(229,231,235).
 */
function isGrayish(bg: CellBg): boolean {
    if (!bg.rgba) return false
    const [r, g, b, alpha] = bg.rgba
    if (alpha === 0) return false
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    const avg = (r + g + b) / 3
    return spread <= 12 && avg >= 195 && avg <= 245
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 処置行 介護 (jihi_flg = 3) cho ngày test')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 【介護保険一部負担金】行 (KaigoHutanSet / linekbn 30)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Origin thật của API (bóc từ một request có sẵn của app). */
    let apiOrigin = ''
    /** Header auth bắt được — dùng lại để gọi thẳng BE bằng page.request. */
    let authHeaders: Record<string, string> = {}

    /** 利用者負担割合 áp dụng cho (PAT_NO, TRT_DT) — tính ở tầng DB, xem db.ts. */
    let careRate: number | null = null
    let careRateSource = ''
    /** Σ 点数×回数 của các dòng jihi_flg = 3 ĐÃ LƯU trong ngày. */
    let savedCareScore = 0
    /** Σ 点数×回数 của phần KHÔNG phải 介護 trong ngày (phần 日計 được phép cộng). */
    let savedNonCareScore = 0

    /** `careScore * 10 * rate / 100` — chia số nguyên như C# (frm203002.cs:5993). */
    const carePriceOf = (score: number) =>
        careRate === null ? null : Math.trunc((score * 10 * careRate) / 100)

    /**
     * Bảo đảm khối THÁNG HIỆN HÀNH (nơi 2 dòng seed nằm) đã mount.
     *
     * Lưới virtualize các tháng lịch sử (registration-table.tsx:206) nên chỉ dòng
     * trong khung nhìn mới có mặt trong DOM. Sau khi nạp, con trỏ tự nhảy xuống ô
     * 点 của 日計 cuối nên thường đã ở đáy — vẫn cuộn tường minh một nhịp cho chắc,
     * KHÔNG dựa vào tác dụng phụ của AutoSantei.
     */
    async function ensureBottomMounted() {
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
    }

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    ryoCells(page).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
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

    test.beforeAll(async ({ browser }) => {
        // Seed TRƯỚC khi mở trình duyệt: lưới đọc 1 lần lúc vào màn, seed sau thì
        // phải nạp lại mới thấy.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: Number(KAIGO_TRT_CD),
                trtSb: KAIGO_SB_DR,
                trtPt: KAIGO_PT_DR,
                trtCnt: 1,
                jihiFlg: JIHI_FLG_KAIGO,
                dspTrt: KAIGO_NM_DR,
            },
            {
                trtCd: Number(KAIGO_TRT_CD),
                trtSb: KAIGO_SB_DH,
                trtPt: KAIGO_PT_DH,
                trtCnt: 1,
                jihiFlg: JIHI_FLG_KAIGO,
                dspTrt: KAIGO_NM_DH,
            },
        ])

        const rate = await careInsRateFor(Number(PAT_NO), TRT_DT)
        careRate = rate.rate
        careRateSource = rate.source
        savedCareScore = await dayScoreByJihiFlg(Number(PAT_NO), TRT_DT, { eq: JIHI_FLG_KAIGO })
        savedNonCareScore = await dayScoreByJihiFlg(Number(PAT_NO), TRT_DT, { not: JIHI_FLG_KAIGO })
        console.log(
            `介護 của ngày ${TRT_DT}: careScore = ${savedCareScore}点, rate = ${careRate}% ` +
                `(${careRateSource}) ⇒ carePrice kỳ vọng = ${carePriceOf(savedCareScore)}円; ` +
                `phần không-介護 = ${savedNonCareScore}点`,
        )

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Bóc origin + header auth từ chính request của app: accessToken nằm trong
        // RAM (zustand không persist) nên không có đường nào lấy ra ngoài ngoài cách
        // này (GUIDELINE 10.2).
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (!h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(
                    ([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept',
                ),
            )
        })

        // AutoSantei bung 「…を算定しますか？」 vào thời điểm không đoán được và nuốt
        // mọi click (GUIDELINE Rule 14). Bấm No — Yes lại kéo theo カルテ記載選択.
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

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await page?.close()
        const n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        console.log(`dọn 処置行 seed: xoá ${n} dòng`)
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Mốc: dữ liệu 介護 đã lưu phải lên được lưới thì các assert parity mới có nghĩa.
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-1 (mốc) — 2 dòng 599 (jihi_flg = 3) đã lưu hiện đúng trên lưới tháng hiện hành', async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)
        const dr = rows.find((r) => r.text.includes(KAIGO_KEY_DR))
        const dh = rows.find((r) => r.text.includes(KAIGO_KEY_DH))

        expect(
            dr,
            `không thấy dòng 「${KAIGO_NM_DR}」 trên lưới — seed hỏng hoặc màn hình đang mở tháng khác ` +
                `(TEST_TRT_DT = ${TRT_DT}). ${rows.length} dòng đang mount, 15 dòng CUỐI (nơi dòng seed ` +
                `phải nằm): ${rows.map((r) => r.text).slice(-15).join(' / ')}`,
        ).toBeDefined()
        expect(dh, `không thấy dòng 「${KAIGO_NM_DH}」 trên lưới`).toBeDefined()

        // 点 (RegiCol.ten = 3) phải đúng điểm đã seed — chứng minh lưới đọc đúng dòng.
        for (const [row, pt] of [
            [dr!, KAIGO_PT_DR],
            [dh!, KAIGO_PT_DH],
        ] as const) {
            const ten = page.locator(`[data-grid-cell="${row.key}|3"]`)
            expect(Number(txt(await ten.innerText()).replace(/,/g, '')), `点 của 「${row.text}」`).toBe(
                pt,
            )
        }

        expect(
            savedCareScore,
            'DB phải có đúng 517 + 362 điểm 介護 trong ngày (seed vừa ghi)',
        ).toBe(KAIGO_PT_DR + KAIGO_PT_DH)
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // WinForm parity — mỗi điểm thiếu là MỘT testcase, chạy nối tiếp trên cùng
    // phiên đăng nhập. Serial: test đỏ thì test sau bị skip → sửa gap đầu tiên
    // rồi chạy lại cả file, gap kế tiếp lộ ra.
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-2 — nạp tháng phải chèn dòng 【介護保険一部負担金】 (modSave.cs:2747-2790)', async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)
        const hits = rows.filter((r) => r.text.includes(KAIGO_LABEL))
        console.log(
            `dòng mang nhãn 「${KAIGO_LABEL}」: ${hits.length} — ${hits.map((h) => h.text).join(' | ') || '(không có)'}`,
        )

        expect(
            hits.length,
            `Ngày ${TRT_DT} có ${savedCareScore}点 介護 đã lưu (jihi_flg = 3) nhưng lưới KHÔNG chèn dòng ` +
                `【${KAIGO_LABEL}　　n 円】. WinForm dựng lại dòng này từ jihi_flg mỗi lần nạp tháng ` +
                `(modSave.cs:2747-2790) — nó là dòng hiển thị, không lưu DB (modSave.cs:237 chỉ ghi ` +
                `linekbn == "2").`,
        ).toBe(1)
        await step()
    })

    test('TC-3 — số tiền dòng tổng = careScore × 10 × rate ÷ 100 (frm203002.cs:5993/6014)', async () => {
        const expectedPrice = carePriceOf(savedCareScore)
        test.skip(
            expectedPrice === null,
            `không chốt được 利用者負担割合 (${careRateSource}) nên không có số kỳ vọng để so. ` +
                'Đặt TEST_PAT_NO sang bệnh nhân có bản 介護保険 rõ ràng để phủ nhánh này.',
        )

        await ensureBottomMounted()
        const rows = await gridRows(page)
        const pattern = kaigoRowPattern(expectedPrice!)

        expect(
            rows.filter((r) => pattern.test(r.text)).length,
            `Không có dòng nào khớp ${pattern}. Kỳ vọng theo WinForm: careScore ${savedCareScore}点 × 10 × ` +
                `${careRate}% = ${expectedPrice}円 (rate: ${careRateSource}); chuỗi gốc là ` +
                `"     【${KAIGO_LABEL}　　${expectedPrice} 円】" (5 space + 2 space toàn giác). ` +
                'TC-2 cũng đỏ ⇒ cùng một nguyên nhân: chưa port dòng này.',
        ).toBe(1)
        await step()
    })

    test('TC-4 — dòng tổng nằm NGAY SAU dòng 介護 cuối cùng của ngày (frm203002.cs:5995-6010)', async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)
        const lastKaigoIdx = Math.max(
            rows.findIndex((r) => r.text.includes(KAIGO_KEY_DR)),
            rows.findIndex((r) => r.text.includes(KAIGO_KEY_DH)),
        )
        const totalIdx = rows.findIndex((r) => r.text.includes(KAIGO_LABEL))

        expect(
            totalIdx,
            `dòng 【${KAIGO_LABEL}】 phải nằm ngay dưới dòng 介護 cuối cùng (index ${lastKaigoIdx}). ` +
                'KaigoHutanSet xoá dòng cũ rồi chèn lại tại intKaigoMaxRow + 1 ⇒ vị trí là bất biến, ' +
                'không phải "ở đâu đó trong ngày". (-1 = chưa có dòng nào, xem TC-2.)',
        ).toBe(lastKaigoIdx + 1)
        await step()
    })

    test('TC-5 — dòng 処置 599 phải được tô xám 0xE0E0E0 (frm203002.cs:5684-5688)', async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)
        const kaigoRow = rows.find((r) => r.text.includes(KAIGO_KEY_DR))
        expect(kaigoRow, 'không thấy dòng 599-0 để kiểm màu — xem TC-1').toBeDefined()

        const kaigoBg = await resolvedBg(page, kaigoRow!.key, 2)
        // Dòng bảo hiểm thường bất kỳ, để đối chiếu "khác nền".
        const ref = rows.find(
            (r) =>
                r.text !== '' &&
                !r.text.includes(KAIGO_KEY_DR) &&
                !r.text.includes(KAIGO_KEY_DH) &&
                !r.text.includes(KAIGO_LABEL),
        )
        const refBg = ref ? await resolvedBg(page, ref.key, 2) : null
        console.log(
            `nền ô 療法 của dòng 介護 = ${kaigoBg.raw} → sRGB ${JSON.stringify(kaigoBg.rgba)}` +
                (refBg
                    ? ` / dòng thường 「${ref!.text}」 = ${refBg.raw}`
                    : ' (không có dòng thường để đối chiếu)'),
        )

        // Hai vế của cùng một yêu cầu "phải nhìn ra được là dòng 介護" → dùng soft
        // để một lần chạy biết cả hai, thay vì sửa xong vế này mới lòi vế kia.
        expect
            .soft(
                isGrayish(kaigoBg),
                `dòng 599 (jihi_flg = ${JIHI_FLG_KAIGO}) phải có nền xám như WinForm (BackColor ` +
                    `0xE0E0E0 = rgb(224,224,224); bản port カルテ2号 dùng bg-gray-200 — cct2-table.tsx:303). ` +
                    `Đang là ${kaigoBg.raw} = sRGB ${JSON.stringify(kaigoBg.rgba)}.`,
            )
            .toBe(true)
        if (refBg !== null) {
            expect.soft(kaigoBg.raw, 'dòng 介護 phải KHÁC nền dòng bảo hiểm thường').not.toBe(refBg.raw)
        }
        await step()
    })

    test('TC-6 — 日計 KHÔNG được cộng điểm 介護 (modAcc.cs:132-212)', async () => {
        await ensureBottomMounted()
        const bands = await page
            .getByText(/【日計\s*[\d,]+\s*点】/)
            .allInnerTexts()
            .catch(() => [] as string[])
        const values = bands
            .map((t) => t.replace(/\s+/g, '').match(/【日計([\d,]+)点】/)?.[1])
            .filter((v): v is string => v !== undefined)
            .map((v) => Number(v.replace(/,/g, '')))
        const forbidden = savedNonCareScore + savedCareScore
        console.log(
            `các 日計 đang hiện: ${values.join(', ') || '(không đọc được)'} — cấm xuất hiện ${forbidden}`,
        )

        expect(
            values.includes(forbidden),
            `Có 日計 = ${forbidden}点 = phần bảo hiểm (${savedNonCareScore}) + phần 介護 (${savedCareScore}). ` +
                'WinForm chỉ cộng insPayDatas vào 日計/月計, điểm 介護 nằm ngoài và chỉ xuất hiện ở dòng ' +
                '【介護保険一部負担金】.',
        ).toBe(false)
        await step()
    })

    test(`TC-7 — BE ${DAILY_SUMMARY_PATH} phải trả careScore/carePrice (BuiPriceService.cs:428-444 đang là stub)`, async () => {
        test.skip(
            apiOrigin === '' || authHeaders['authorization'] === undefined,
            'chưa bắt được request nào của app để lấy origin + token API',
        )

        const url = `${apiOrigin}${DAILY_SUMMARY_PATH}?patNo=${PAT_NO}&trtDt=${TRT_DT}`
        const res = await page.request.get(url, { headers: authHeaders })
        expect(res.status(), `GET ${DAILY_SUMMARY_PATH}`).toBe(200)

        const json = (await res.json().catch(() => ({}))) as {
            data?: { careScore?: number | string; carePrice?: number | string }
        }
        const careScore = Number(json.data?.careScore ?? 0)
        const carePrice = Number(json.data?.carePrice ?? 0)
        const expectedPrice = carePriceOf(savedCareScore)
        console.log(`daily-summary trả careScore = ${careScore}, carePrice = ${carePrice}`)

        // Hai con số của CÙNG một lượt gọi → soft để thấy cả hai trong một lần chạy.
        expect
            .soft(
                careScore,
                'careScore phải bằng Σ điểm 介護 của ngày (Calc_DayPoint_Kaigo — modAcc.cs:302-342). ' +
                    'CalculateCareInfoAsync đang là TODO stub và luôn SetCareData(0,0,0,0,…).',
            )
            .toBe(savedCareScore)
        if (expectedPrice !== null) {
            expect
                .soft(
                    carePrice,
                    `carePrice phải = ${expectedPrice}円 — chính con số dialog 入金指定 in ở dòng 「介護保険」 ` +
                        '(payment-designation-dialog.tsx:324) và cộng vào 本日請求額.',
                )
                .toBe(expectedPrice)
        }
        await step()
    })

    test(`TC-8 — dòng tổng read-only ở cột 療法・処置 (linekbn ${LINEKBN_KAIGO} — frm203002.cs:3458-3468)`, async () => {
        await ensureBottomMounted()
        const rows = await gridRows(page)
        const total = rows.find((r) => r.text.includes(KAIGO_LABEL))
        // Không có dòng tổng thì đây KHÔNG phải chỗ báo lỗi — TC-2 đã báo rồi.
        test.skip(total === undefined, 'chưa có dòng 【介護保険一部負担金】 nào để kiểm read-only (xem TC-2)')

        const cell = page.locator(`[data-grid-cell="${total!.key}|2"]`)
        await cell.dblclick()
        expect(
            await cell.locator('input').count(),
            'double-click vào ô 療法・処置 của dòng 【介護保険一部負担金】 KHÔNG được mở editor — ' +
                `grdRegi_CellBeginEdit huỷ edit với mọi linekbn ∈ {10..15, ${LINEKBN_KAIGO}}.`,
        ).toBe(0)
        await page.keyboard.press('Escape').catch(() => {})
        await step()
    })

    test('TC-9 — nhập tay 599-0 → KaigoHutanSet tính lại NGAY số tiền (frm203002.cs:5785/5935)', async () => {
        // TESTCASE NÀY LÀM BẨN LƯỚI (thêm dòng chưa lưu) nên PHẢI nằm cuối file.
        // Không bấm F9 登録 ⇒ vẫn không ghi DB.
        await ensureBottomMounted()
        await closeDialogs(page)

        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')
        await step()

        await footerTen.click()
        await footerTen.fill(KAIGO_TRT_CD)
        await footerTen.press('Enter')
        // Handler xoá input trước khi tra cứu → value === '' là tín hiệu CÓ THẬT
        // rằng Enter đã được xử lý (Rule 7: không sleep).
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        await expect(
            trtPicker,
            `mã ${KAIGO_TRT_CD} không mở được 処置選択 — master tháng này không có?`,
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === KAIGO_SB_DR)
        expect(idx, `処置選択 không có 枝番 ${KAIGO_SB_DR}`).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })

        // Mốc CÓ THẬT: dòng vừa chốt đã vào lưới (đừng mốc theo số dòng — lưới
        // virtualize các tháng lịch sử).
        await expect(
            ryoCells(page).filter({ hasText: KAIGO_KEY_DR }).last(),
            `確定 mà lưới không có thêm dòng 「${KAIGO_NM_DR}」`,
        ).toBeVisible({ timeout: 20_000 })
        await closeDialogs(page)
        await step()

        const newScore = savedCareScore + KAIGO_PT_DR
        const newPrice = carePriceOf(newScore)
        test.skip(newPrice === null, `không chốt được 利用者負担割合 (${careRateSource})`)

        const rows = await gridRows(page)
        const pattern = kaigoRowPattern(newPrice!)
        console.log(
            `sau khi nhập tay 599-${KAIGO_SB_DR}: careScore kỳ vọng = ${newScore}点 ⇒ ${newPrice}円; ` +
                `dòng mang nhãn: ${rows.filter((r) => r.text.includes(KAIGO_LABEL)).map((r) => r.text).join(' | ') || '(không có)'}`,
        )

        expect(
            rows.filter((r) => pattern.test(r.text)).length,
            `Chốt thêm một 処置 599 phải làm dòng 【${KAIGO_LABEL}】 được XOÁ rồi CHÈN LẠI với ${newPrice}円 ` +
                '(KaigoHutanSet chạy ngay trong nhánh nhập tay, frm203002.cs:5785-5788) — không được để số ' +
                'cũ, cũng không được đẻ thêm dòng thứ hai.',
        ).toBe(1)
        await step()
    })

    test('TC-10 — 599 kéo theo 摘要コメント 「居宅療養管理指導費算定年月日 <和暦>」 (CmtAuto.cs:674/1287)', async () => {
        // NỐI TIẾP TC-9: dòng 599-0 vừa chốt ở đó chính là thứ kích hoạt cặp
        // 摘要コメント này, nên KHÔNG nhập lại 処置 — chỉ CHỐT NỐT 回数.
        //
        // BẪY ĐÃ VẤP (bản đầu của testcase này đỏ oan): F9 確定 ở 処置選択 mới chỉ đặt
        // dòng vào trạng thái CHỜ NHẬP 回数 (ô 回 của dòng 日計 hiện input "1"), CHƯA
        // phải là chốt 処置. WinForm gọi `Chk_CmtAuto` — tức toàn bộ cascade 摘要コメント
        // — từ case 4, nhánh Enter của ô 回数 (frm203002.cs:5758-5776), CÙNG CHỖ với
        // `KaigoHutanSet` (:5785). Dừng ở 確定 rồi soi lưới thì đúng là chưa có comment
        // nào, kể cả 「居宅療養管理指導費」 (pack_type 1) vốn đã chạy được — nghĩa là
        // testcase thiếu bước, không phải app thiếu chức năng.
        await ensureBottomMounted()
        await closeDialogs(page)

        // Enter vào ĐÚNG ô app đang focus: sau 確定 con trỏ nằm ở ô 回 CỦA CHÍNH DÒNG
        // vừa chốt, đang ở chế độ nhập với sẵn "1" (effect "focus its 回 cell IN EDIT
        // MODE" trong treatment-entry-detail). Ô đó là input do renderEditableCell dựng
        // nên KHÔNG mang data-grid-cell — nhắm vào ô 回 của dòng 日計
        // (`data-footer-cell$=":footer-kai"`) là nhắm nhầm input khác và cascade
        // 摘要コメント không chạy.
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', {
            timeout: 20_000,
        })
        await page.keyboard.press('Enter')
        await step()
        // SingleChk / カルテ記載選択 có thể bung ra ngay sau khi chốt — dọn trước khi soi.
        await closeDialogs(page)

        const expectedDateText = `${KAIGO_CMT_DATE_NM} ${warekiDate(TRT_DT)}`
        // Lưới chèn comment sau khi BE trả về → chờ bằng mốc CÓ THẬT thay vì đọc ngay.
        await expect(
            ryoCells(page).filter({ hasText: KAIGO_CMT_DATE_NM }).last(),
            `chốt 599-${KAIGO_SB_DR} phải sinh dòng 「${expectedDateText}」 — pack C001-3-2 ` +
                '(pack_type 50 / condition 算定日 → com 850100317). WinForm dựng nó ngay trong ' +
                'prgCmtAuto với strDt = 算定日 = chính 処置日 (CmtAuto.cs:1287-1289).',
        ).toBeVisible({ timeout: 30_000 })

        const rows = await gridRows(page)
        const dateRows = rows.filter((r) => r.text.includes(KAIGO_CMT_DATE_NM))
        const plainRows = rows.filter(
            (r) => r.text.includes(KAIGO_CMT_NM) && !r.text.includes(KAIGO_CMT_DATE_NM),
        )
        console.log(
            `摘要コメント của 599: ${[...plainRows, ...dateRows].map((r) => r.text).join(' | ') || '(không có)'}`,
        )

        // Hai vế của cùng một cascade → soft để một lần chạy thấy đủ.
        expect
            .soft(
                plainRows.length,
                `thiếu dòng 「${KAIGO_CMT_NM}」 (pack C001-3-1, pack_type 1)`,
            )
            .toBeGreaterThanOrEqual(1)
        expect
            .soft(
                dateRows.map((r) => txt(r.text)).some((t) => t.includes(txt(expectedDateText))),
                `dòng ngày phải đúng 和暦 của 処置日: 「${expectedDateText}」. Đang có: ` +
                    `${dateRows.map((r) => r.text).join(' | ') || '(không có)'}. setPacData case 50 nối ` +
                    'com_nm + " " + gggyy年MM月dd日 (CmtAuto.cs:3684-3695) — sai ngày nghĩa là lấy nhầm ' +
                    'nguồn (前回 visit thay vì 算定日).',
            )
            .toBe(true)
        await step()
    })
})
