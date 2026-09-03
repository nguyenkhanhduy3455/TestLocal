import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — 点数 phải là kết quả `getTensu`, KHÔNG phải `mst_trt.score1` thô, trên
 * MỌI đường nhập, và getTensu phải nhìn thấy các dòng CÙNG NGÀY.
 *
 * Spec này phủ đúng phần mà `kobetu-sidepanel-score.spec.ts` ghi trong header là
 * NGOÀI phạm vi của nó: 「全身麻酔 / 歯科診療特別対応加算 cùng ngày chưa được gửi lên
 * (null/false) … và đường chọn qua 処置選択 vẫn là score1」. Ba câu đó nay đã lỗi
 * thời — commit `feat(api,web-tenant): 診療入力の点数を実機の getTensu と同じ結果に
 * する` đã làm cả ba. File này là test CHỐNG TÁI PHÁT cho chúng.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (`src/OCHACOM`), không bám theo
 * code web. Test đỏ = bản port lệch, KHÔNG phải test viết sai.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *
 *  ・INP/Lib/CommonChk.cs:83-214 `getTensu(処置日, score1, score2, score3, acc_unit, f1)`
 *      Chọn cột điểm theo BỆNH NHÂN + NGÀY + CÁC DÒNG CÙNG NGÀY:
 *        - mặc định score1;
 *        - acc_unit 9..12, NGOẠI TRÚ, (乳幼児 hoặc dis_flg == 1):
 *              :132  `chkGeneralAnesthesia(...)` — CÓ 全身麻酔 cùng ngày thì
 *                    KHÔNG nâng lên score2, giữ nguyên score1;
 *              :135  không có thì score2.
 *        - dis_flg == 3 (:100-111) phân giải theo dòng 歯科診療特別対応加算 cùng ngày:
 *              không có dòng nào  → disFlg = 0 (加算なし)
 *              có, freewd == "1"  → disFlg = 1 (歯科診療困難者加算)
 *              có, freewd khác    → disFlg = 2
 *
 *  ・INP/Lib/CommonChk.cs:1190-1204 — danh sách 静脈麻酔・全身麻酔:
 *      202/6, 202/7, 203/0..6, 203/8..11. (203/7 KHÔNG có trong danh sách — WinForm
 *      nhảy 6 → 8.)
 *
 *  ・INP/Lib/modMain.cs:337 / :391 (`GetTrtmas`, 点数モード) và :659 (`GetTrtmasCod`,
 *    コードモード) — getTensu chạy khi DỰNG DANH SÁCH ứng viên, kết quả ghi vào
 *    `tblTrtSel` cột c04 TRƯỚC khi mở 処置選択. ⇒ số hiện trong picker LÀ số tính
 *    tiền, và dòng commit thẳng (1 kết quả) cũng lấy số đó.
 *
 *  ・INP/Lib/modKobetu.cs:255-265 — 個別 pick cũng qua getTensu (đã có
 *    `kobetu-sidepanel-score.spec.ts` TC-2 phủ, KHÔNG lặp lại ở đây).
 *
 *  ・INP/Lib/modSave.cs:3388-3424 — 自動算定 KHÔNG dùng getTensu. Nhánh riêng:
 *        乳幼児 (modPat.NyuYoujiChk) HOẶC dis_flg == 1  → score2   (:3389)
 *        ngược lại old_flg == 1 (27老人)                → score3   (:3398)
 *        ngược lại                                      → score1   (:3419)
 *      `intSins` = ins.dis_flg (:3041), `intRoujin` = ins.old_flg (:3039).
 *      ⚠️ `intSins == 1` là so BẰNG: bệnh nhân dis_flg 3 KHÔNG lấy score2 ở đây,
 *         khác chỗ chọn 特１/特２ cách đó 2 dòng vốn dùng `>= 1` (:3083).
 *
 *  ・INP/Lib/modSave.cs:3450-3457 — với dis_flg == 3, dòng 105 hỏi
 *      「著しく歯科診療が困難な患者に対する加算を算定しますか？」; はい ghi
 *      `hFG1[72] = "1"` (= trn_trn.freewd) — chính giá trị getTensu đọc lại ở :109.
 *
 * ─── Web port ─────────────────────────────────────────────────────────────────
 *  - `POST /tenant/treatment/resolve-trt-score` nay là GIẢI CẢ DANH SÁCH, nhận thêm
 *    `sameDayRows` (mọi dòng của 処置日, theo thứ tự lưới) và `isHouseVisit`.
 *  - `Ochacom.Domain/Services/Treatments/SameDayScoreContext.cs` quét NGƯỢC từ dòng
 *    cuối (CommonChk.cs:693) ⇒ dòng 加算 CUỐI của ngày thắng.
 *  - `GetAutoSanteiHandler.BuildAutoSanteiScoreSelector` giữ nhánh 3 chiều ở trên.
 *
 * ─── BẪY (đã dính khi viết file này) ─────────────────────────────────────────
 *  1. Ô 点 mặc định ở 点数モード (frm203002.cs:3024 `flgInpMode = ePoint`). Gõ một
 *     MÃ 処置 vào đó KHÔNG phải tra theo mã — nó tra theo ĐIỂM. Muốn đi đường
 *     コードモード phải bấm nút nhãn 入力モード (lbInpMode_Click, frm203002.cs:7126)
 *     cho tới khi nhãn hiện 「コード」. Vòng đầu viết file này quên bước đó và
 *     testcase đỏ oan.
 *  2. Master hiện tại KHÔNG có 処置コード nào vừa `acc_unit` 9..12, `f1 = 0`,
 *     `score1 ≠ score2` mà lại chỉ có ĐÚNG 1 枝番 (ít nhất là 2) ⇒ コードモード luôn
 *     mở 処置選択, không có đường "1 kết quả commit thẳng" để đo. Vì vậy mọi
 *     testcase ở đây đi qua picker rồi F9 確定.
 *  3. Cột 点数 của picker đọc bằng `getByTestId('cell-score1')` — colId vẫn tên
 *     `score1` dù giá trị nay là kết quả getTensu (đúng như WinForm ghi getTensu
 *     vào c04 của tblTrtSel). Đừng đổi tên colId chỉ vì ý nghĩa đổi.
 *
 * ─── Cố ý KHÔNG test ở đây ───────────────────────────────────────────────────
 *  ・自動算定 の点数選択 (modSave.cs:3388-3424: 乳幼児/dis_flg 1 → score2,
 *    old_flg 1 → score3, còn lại score1). ĐÃ ĐO trên dữ liệu hiện tại: MỌI mã mà
 *    自動算定 sinh ra (100 初診, 104 乳, 105 特, 108 外安全/外感染/歯物価/明細) đều có
 *    `score1 == score2 == score3` trong master đang áp dụng ⇒ ba nhánh cho CÙNG một
 *    con số, e2e không phân biệt được. Viết testcase ở đây chỉ tạo ra một test
 *    vĩnh viễn skip. Nhánh này được khoá bằng UNIT TEST của BE:
 *      `apps/api/tests/Ochacom.Application.UnitTests/Treatments/Handlers/
 *       GetAutoSanteiScoreBranchTests.cs` (6 ca, gồm cả thứ tự nhánh 乳幼児 > 27老人
 *       và việc dis_flg 3 KHÔNG lấy score2 vì :3389 so BẰNG với 1).
 *    Cùng lý do `auto-santei-cases.spec.ts:20-24` đã tuyên bố 乳幼児 là phần của
 *    unit test BE chứ không phải e2e.
 *  ・Đường 個別 tab → getTensu: đã có `kobetu-sidepanel-score.spec.ts` TC-2.
 *
 * ─── Điều kiện chạy ───────────────────────────────────────────────────────────
 *  - `TEST_DB=1` (bắt buộc): spec đọc master + seed 処置行 vùng `disp_no >= 9000`.
 *  - KHÔNG cần `TEST_ALLOW_SAVE`: không có testcase nào bấm F9 登録. Mọi thứ đo ở
 *    trạng thái lưới TRƯỚC khi lưu — đúng chỗ WinForm quyết định điểm.
 *  - `TEST_ALLOW_DIS_FLG_PATCH=1` (tuỳ chọn): mở nhóm dis_flg 3. Dữ liệu hiện tại
 *    KHÔNG có bệnh nhân nào dis_flg = 3 (chỉ 0/1/2), nên nhánh 特別対応加算 chỉ chạy
 *    được nếu cho phép vá tạm `insurance.dis_flg` rồi trả lại nguyên trạng.
 */

// serial + timeout rộng: cả nhóm dùng CHUNG một page và một lần login (Rule 19), và
// mỗi testcase phải điều hướng lại để lưới đọc lại 処置日 vừa seed.
test.describe.configure({ mode: 'serial', timeout: 300_000 })

/** Cột lưới đăng ký (RegiCol, treatment-entry-shared.ts:63): 2 = 療法・処置, 3 = 点. */
const REGI_COL_RYO = 2
const REGI_COL_TEN = 3

/** 全身麻酔 dùng để dựng ngữ cảnh cùng ngày — đầu danh sách CommonChk.cs:1193. */
const ZENSIN_MASUI_TRT_CD = 203
const ZENSIN_MASUI_TRT_SB = 0

/** 203/7 CỐ Ý không có trong danh sách (WinForm nhảy 6 → 8, CommonChk.cs:1198-1200). */
const NOT_MASUI_TRT_SB = 7

/** 歯科診療特別対応加算１(初診) — CommonChk.cs:1225. */
const HIGH_NEEDS_TRT_CD = 105
const HIGH_NEEDS_TRT_SB = 0

/** freewd 「1」 = 歯科診療困難者加算 (CommonChk.cs:109). */
const FREEWD_DIFFICULT = '1'

/** dis_flg: 1 = 歯科診療困難者, 3 = 歯科診療特別対応 (nhánh phụ thuộc 加算 cùng ngày). */
const DIS_FLG_HANDICAPPED = 1
const DIS_FLG_HIGH_NEEDS = 3

/** old_flg 1 = 27老人 → nhánh score3 của 自動算定 (modSave.cs:3398). */
const OLD_FLG_ELDERLY = 1

/**
 * Mỗi testcase ở đây điều hướng lại `/treatments/{patNo}` để nạp lại 処置日 sau khi
 * seed. Trên Vite dev, một lần điều hướng nguội có thể vượt 60s (xem chú thích
 * `timeout` trong playwright.config.ts) — đã dính đỏ oan một lượt vì đặt 60s.
 */
const GRID_LOAD_TIMEOUT = 90_000

/**
 * Cột của 処置選択 (frm203016) trong lưới ảo — `data-testid="cell-<colId>"`.
 * `score1` là TÊN CỘT, không phải ý nghĩa: giá trị trong đó là kết quả getTensu
 * (WinForm ghi getTensu vào tblTrtSel cột c04, modMain.cs:659).
 */
const PICKER_COL_SCORE = 'cell-score1'
const PICKER_COL_TRT_SB = 'cell-trtSb'

/** Tên 処置 render kèm khoảng trắng đầu → luôn so sánh sau NFKC + trim. */
const txt = (s: string) => s.normalize('NFKC').trim()

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

const ALLOW_DIS_FLG_PATCH = process.env.TEST_ALLOW_DIS_FLG_PATCH === '1'

interface MstTrtCandidate {
    trtCd: number
    trtSb: number
    trtNm: string
    cctNm: string
    score1: number
    score2: number
    score3: number
    f1: number
    accUnit: number
}

/**
 * Một dòng master mà getTensu ĐỔI được câu trả lời: `acc_unit` 9..12 (nhánh có
 * kiểm 全身麻酔), `f1 = 0`, và score1 ≠ score2 để phân biệt được "đã qua getTensu"
 * với "lấy thẳng 一般". Loại các mã đặc biệt vì chúng mở dialog riêng trước khi
 * ghi dòng (frm203016.defData), không đo được điểm ở lưới.
 */
async function findScoreCandidate(): Promise<MstTrtCandidate | null> {
    return withDb(async (c) => {
        const r = await c.query(
            `WITH active_ver AS (
                 SELECT version_id
                   FROM view_mst_trt_ver_active
                  WHERE $1::date BETWEEN start_date AND end_date
                  ORDER BY end_date DESC
                  LIMIT 1
             )
             SELECT m.trt_cd, m.trt_sb, m.trt_nm, m.cct_nm,
                    m.score1, m.score2, m.score3, m.f1, m.acc_unit
               FROM view_mst_trt_active m
               INNER JOIN active_ver av ON m.version_id = av.version_id
              WHERE m.f1 = 0
                AND m.acc_unit BETWEEN 9 AND 12
                AND m.score1 > 0 AND m.score2 > 0
                AND m.score1 <> m.score2
                AND right(m.trt_nm, 1) <> '!'
                AND m.trt_cd NOT IN (17, 50, 179, 185, 202, 203, 333, 549, 999)
                AND m.trt_cd NOT BETWEEN 600 AND 699
                AND m.trt_cd NOT BETWEEN 700 AND 899
              ORDER BY m.trt_cd, m.trt_sb
              LIMIT 1`,
            [TRT_DT],
        )
        const row = r.rows[0]
        if (!row) return null
        return {
            trtCd: Number(row.trt_cd),
            trtSb: Number(row.trt_sb),
            trtNm: row.trt_nm,
            cctNm: row.cct_nm,
            score1: Number(row.score1),
            score2: Number(row.score2),
            score3: Number(row.score3),
            f1: Number(row.f1),
            accUnit: Number(row.acc_unit),
        }
    })
}

/** Bệnh nhân 乳幼児 (dưới 6 tuổi tại TRT_DT) và KHÔNG mang dis_flg/old_flg gây nhiễu. */
async function findInfantPatient(): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query(
            `SELECT p.pat_no
               FROM view_person_active p
              WHERE p.pat_birth_dt > $1::date - INTERVAL '6 years'
                AND COALESCE((SELECT i.dis_flg FROM view_insurance_active i
                               WHERE i.pat_no = p.pat_no ORDER BY i.pat_br DESC LIMIT 1), 0) = 0
              ORDER BY p.pat_no
              LIMIT 1`,
            [TRT_DT],
        )
        return r.rows[0] ? Number(r.rows[0].pat_no) : null
    })
}

/** Bệnh nhân có `insurance.old_flg = 1` (27老人) — nhánh score3 của 自動算定. */
async function findElderlyPatient(): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query(
            `SELECT i.pat_no
               FROM view_insurance_active i
               JOIN view_person_active p ON p.pat_no = i.pat_no
              WHERE i.old_flg = $1
                AND p.pat_birth_dt <= $2::date - INTERVAL '6 years'
              ORDER BY i.pat_no
              LIMIT 1`,
            [OLD_FLG_ELDERLY, TRT_DT],
        )
        return r.rows[0] ? Number(r.rows[0].pat_no) : null
    })
}

/** dis_flg / old_flg / tuổi của bệnh nhân — 3 tham số rẽ nhánh. */
async function patientContext(
    patNo: number,
): Promise<{ age: number; disFlg: number; oldFlg: number } | null> {
    return withDb(async (c) => {
        const r = await c.query(
            `SELECT p.pat_birth_dt AS birth,
                    COALESCE((SELECT i.dis_flg FROM view_insurance_active i
                               WHERE i.pat_no = p.pat_no ORDER BY i.pat_br DESC LIMIT 1), 0) AS dis_flg,
                    COALESCE((SELECT i.old_flg FROM view_insurance_active i
                               WHERE i.pat_no = p.pat_no ORDER BY i.pat_br DESC LIMIT 1), 0) AS old_flg
               FROM view_person_active p
              WHERE p.pat_no = $1
              LIMIT 1`,
            [patNo],
        )
        const row = r.rows[0]
        if (!row?.birth) return null
        const birth = new Date(row.birth)
        const on = new Date(`${TRT_DT}T00:00:00`)
        let age = on.getFullYear() - birth.getFullYear()
        const beforeBirthday =
            on.getMonth() < birth.getMonth() ||
            (on.getMonth() === birth.getMonth() && on.getDate() < birth.getDate())
        if (beforeBirthday) age--
        return { age, disFlg: Number(row.dis_flg), oldFlg: Number(row.old_flg) }
    })
}

if (!dbEnabled) {
    console.log('SKIP — cần TEST_DB=1: spec đọc mst_trt và seed 処置行 để dựng ngữ cảnh cùng ngày')
}

test.describe('診療入力 — 点数 = getTensu trên mọi đường nhập + ngữ cảnh cùng ngày', () => {
    test.skip(!dbEnabled, 'cần TEST_DB=1')

    let page: Page
    let step: () => Promise<void>
    let footerTen: Locator
    let picker: Locator
    let ryoCells: Locator

    let cand: MstTrtCandidate | null = null
    let infantPatNo: number | null = null
    let infantCtx: { age: number; disFlg: number; oldFlg: number } | null = null

    /** Ô 療法・処置 của MỌI dòng lưới đăng ký, kèm rowKey. */
    async function regiRows(): Promise<{ key: string; text: string }[]> {
        const raw = await page
            .locator(`[data-grid-cell$="|${REGI_COL_RYO}"]`)
            .evaluateAll((els) =>
                els.map((e) => ({
                    key: (e.getAttribute('data-grid-cell') ?? '').split('|')[0] ?? '',
                    text: e.textContent ?? '',
                })),
            )
        return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
    }

    /**
     * Mở màn 診療入力 của `patNo` và chờ lưới sẵn sàng.
     *
     * Nạp lại tối đa 3 lần khi ra TRANG TRẮNG. Đo 2026-09-03: `goto` xong app không
     * render gì, `合計:` không bao giờ xuất hiện dù chờ 90s, và KHÔNG có `pageerror`;
     * probe cho thấy dev server trả `net::ERR_FAILED` cho hàng loạt module ES (vd
     * /src/features/treatments/api/kihon-def-api.ts) nên route component không nạp xong.
     * Nhiễu hạ tầng (Vite phục vụ vài trăm module qua nginx/HTTPS), không phải app chết —
     * nhưng có log mỗi lần retry để không giấu triệu chứng. Gặp liên tục thì restart
     * `pnpm dev` ở root ochacom-saas.
     */
    async function openTreatments(patNo: number) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto(`/treatments/${patNo}`, { waitUntil: 'domcontentloaded' })
            const ok = await page
                .getByText('合計:')
                .first()
                .waitFor({
                    state: 'visible',
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_LOAD_TIMEOUT / 3,
                })
                .then(() => true)
                .catch(() => false)
            if (ok) break
            if (attempt === 3) {
                await expect(
                    page.getByText('合計:').first(),
                    'màn 診療入力 ra trang trắng cả 3 lần nạp — xem chú thích ở openTreatments',
                ).toBeVisible({ timeout: 5_000 })
            }
            console.log(`openTreatments: màn 診療入力 ra trang trắng (lần ${attempt}/3) — nạp lại`)
        }
        footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await expect(footerTen, 'không thấy ô 点 của dòng 日計').toBeVisible({
            timeout: 30_000,
        })
    }

    /** Đóng mọi dialog dây chuyền (SingleChk W00100, カルテ記載選択, …). */
    async function closeStrayDialogs(waitMs = 0, rounds = 4) {
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
                .toBeHidden({ timeout: 10_000 })
                .catch(() => {})
        }
        await expect(
            page.locator('div.fixed.inset-0[data-state="open"]'),
            'overlay của dialog vẫn còn, mọi click lên lưới sẽ bị nuốt',
        ).toHaveCount(0, { timeout: 10_000 })
    }

    /** Gõ vào ô 点 của 日計 rồi Enter. Ô bị xoá = tín hiệu Enter đã được xử lý. */
    async function enterTen(value: string) {
        await footerTen.click()
        await footerTen.fill(value)
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
    }

    /**
     * Ép ô 点 về コードモード. Nhãn nút đổi theo mode nên KHÔNG match theo tên được —
     * bám `title` cố định (lbInpMode_Click, frm203002.cs:7126). BẪY 1 của file này.
     */
    async function ensureCodeMode() {
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        await expect(modeBtn, 'không thấy nút đổi 入力モード').toBeVisible({ timeout: 20_000 })
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
    }

    /**
     * コードモード: gõ `trtCd` → 処置選択 mở → chọn 枝番 `trtSb` → F9 確定.
     * Trả điểm ở cột 点 của dòng vừa được thêm.
     */
    async function commitViaPicker(trtCd: number, trtSb: number): Promise<number | null> {
        const before = await regiRows()
        await ensureCodeMode()
        await enterTen(String(trtCd))
        await expect(picker, `コード ${trtCd} không mở được 処置選択`).toBeVisible({
            timeout: 20_000,
        })

        const rowIdx = (await picker.getByTestId(PICKER_COL_TRT_SB).allTextContents()).findIndex(
            (s) => txt(s) === String(trtSb),
        )
        expect(rowIdx, `picker của コード ${trtCd} không có 枝番 ${trtSb}`).toBeGreaterThanOrEqual(0)
        await picker.getByTestId(PICKER_COL_TRT_SB).nth(rowIdx).click()
        // Nút F9 phải lấy TRONG dialog: màn nền cũng có thanh F-key nên
        // `page.getByRole('button', { name: /F9/ })` bắt trúng nút bị overlay chắn.
        await picker.locator('[data-fkey="F9"]').first().click()
        await expect(picker).toBeHidden({ timeout: 15_000 })
        await closeStrayDialogs(4000)

        const added = (await regiRows()).filter(
            (r) => !before.some((b) => b.key === r.key) && r.text !== '',
        )
        if (added.length === 0) return null
        const cell = await page
            .locator(`[data-grid-cell="${added[added.length - 1]!.key}|${REGI_COL_TEN}"]`)
            .textContent()
        return Number(txt(cell ?? ''))
    }

    /**
     * Điểm ở cột 点 của dòng vừa được thêm mang tên `c`. Trả `null` khi không có
     * dòng nào được thêm (để testcase báo lỗi có ngữ cảnh thay vì đỏ khô khan).
     */
    async function addedRowScore(
        before: { key: string; text: string }[],
        c: MstTrtCandidate,
    ): Promise<number | null> {
        const wanted = [txt(c.trtNm), txt(c.cctNm)].filter((s) => s !== '')
        const hit = (rows: { key: string; text: string }[]) =>
            rows.filter((r) => wanted.some((w) => r.text.includes(w)))
        await expect
            .poll(async () => hit(await regiRows()).length, {
                message: `nhập 処置 「${c.trtNm}」 mà lưới không thêm dòng nào`,
                timeout: 15_000,
            })
            .toBeGreaterThan(hit(before).length)
        const added = hit(await regiRows()).pop()
        if (!added) return null
        const cell = await page
            .locator(`[data-grid-cell="${added.key}|${REGI_COL_TEN}"]`)
            .textContent()
        return Number(txt(cell ?? ''))
    }

    test.beforeAll(async ({ browser }) => {
        cand = await findScoreCandidate()
        infantPatNo = await findInfantPatient()
        infantCtx = infantPatNo === null ? null : await patientContext(infantPatNo)
        console.log(
            `ứng viên: ${cand ? `${cand.trtCd}-${cand.trtSb} 「${cand.trtNm}」 ` +
                `score1=${cand.score1} score2=${cand.score2} score3=${cand.score3} ` +
                `acc_unit=${cand.accUnit} f1=${cand.f1}` : '(không tìm được)'}`,
        )
        console.log(
            `bệnh nhân 乳幼児: ${infantPatNo ?? '(không có)'} ` +
                `${infantCtx ? `tuổi ${infantCtx.age}, dis_flg ${infantCtx.disFlg}, old_flg ${infantCtx.oldFlg}` : ''}`,
        )

        page = await browser.newPage()
        step = makeStep(page)

        // 初診/再診 của 自動算定 hỏi 「…を算定しますか？」 ngay khi mở màn — bấm No để
        // không kéo theo dây chuyền dialog khác. Riêng nhóm 自動算定 tự xử lý.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 30 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        ryoCells = page.locator(`[data-grid-cell$="|${REGI_COL_RYO}"]`)
    })

    test.afterAll(async () => {
        if (dbEnabled && infantPatNo !== null) {
            await deleteTreatmentRows(infantPatNo, TRT_DT).catch(() => 0)
        }
        await page?.close()
    })

    // ══════════════ Nhóm A — ngữ cảnh cùng ngày: 全身麻酔 ══════════════

    test('TC-1 (mốc) — 乳幼児 + acc_unit 9..12 ngoại trú, KHÔNG có 全身麻酔 → score2', async () => {
        skipWithReason(cand === null, 'không có 処置 nào score1 ≠ score2 trong master đang áp dụng')
        skipWithReason(infantPatNo === null, 'không có bệnh nhân 乳幼児 (dưới 6 tuổi) trong dữ liệu')
        const c = cand!

        // Dọn sạch vùng seed để chắc chắn ngày KHÔNG có 全身麻酔.
        await deleteTreatmentRows(infantPatNo!, TRT_DT)
        await openTreatments(infantPatNo!)
        await closeStrayDialogs(3000)

        const got = await commitViaPicker(c.trtCd, c.trtSb)
        await step()

        expect(
            got,
            `乳幼児 (tuổi ${infantCtx?.age}) + acc_unit ${c.accUnit} + ngoại trú và KHÔNG có ` +
                `全身麻酔 cùng ngày ⇒ getTensu lấy score2 = ${c.score2} (CommonChk.cs:130-137). ` +
                `Nhận ${got}. Ra ${c.score1} nghĩa là điểm lấy thẳng 一般, chưa qua getTensu.`,
        ).toBe(c.score2)
    })

    test('TC-2 — 🎯 CÓ 全身麻酔 (203/0) cùng ngày → KHÔNG nâng 50/100, giữ score1', async () => {
        skipWithReason(cand === null, 'không có 処置 nào score1 ≠ score2')
        skipWithReason(infantPatNo === null, 'không có bệnh nhân 乳幼児')
        const c = cand!

        // Dựng đúng tiền đề: một dòng 全身麻酔 đã có trên NGÀY đó.
        await seedTreatmentRows(infantPatNo!, TRT_DT, [
            {
                trtCd: ZENSIN_MASUI_TRT_CD,
                trtSb: ZENSIN_MASUI_TRT_SB,
                trtCnt: 1,
                trtPt: 0,
                dspTrt: '全身麻酔(テスト)',
            },
        ])
        await openTreatments(infantPatNo!)
        await closeStrayDialogs(3000)

        await expect(
            page.getByText('全身麻酔(テスト)').first(),
            'dòng 全身麻酔 seed không lên lưới ⇒ testcase mất tiền đề',
        ).toBeVisible({ timeout: 20_000 })

        const got = await commitViaPicker(c.trtCd, c.trtSb)
        await step()

        expect(
            got,
            `全身麻酔 (${ZENSIN_MASUI_TRT_CD}/${ZENSIN_MASUI_TRT_SB}) đã tính trong ngày ⇒ ` +
                `WinForm KHÔNG đặt 50/100加算, điểm phải là score1 = ${c.score1} ` +
                `(CommonChk.cs:132-136 「chkGeneralAnesthesia … if (trtData == null)」). ` +
                `Nhận ${got}. Ra ${c.score2} nghĩa là sameDayRows không tới BE, hoặc ` +
                'SameDayScoreContext.HasGeneralAnesthesia không nhận ra mã này.',
        ).toBe(c.score1)
    })

    test('TC-3 — 203/7 KHÔNG nằm trong danh sách 全身麻酔 → vẫn score2', async () => {
        skipWithReason(cand === null, 'không có 処置 nào score1 ≠ score2')
        skipWithReason(infantPatNo === null, 'không có bệnh nhân 乳幼児')
        const c = cand!

        // Cùng 処置コード nhưng 枝番 7 — WinForm nhảy 6 → 8 nên 7 KHÔNG phải 全身麻酔.
        await seedTreatmentRows(infantPatNo!, TRT_DT, [
            {
                trtCd: ZENSIN_MASUI_TRT_CD,
                trtSb: NOT_MASUI_TRT_SB,
                trtCnt: 1,
                trtPt: 0,
                dspTrt: '非全身麻酔(テスト)',
            },
        ])
        await openTreatments(infantPatNo!)
        await closeStrayDialogs(3000)

        const got = await commitViaPicker(c.trtCd, c.trtSb)
        await step()

        expect(
            got,
            `203/${NOT_MASUI_TRT_SB} CỐ Ý không có trong danh sách (CommonChk.cs:1198-1200 ` +
                'nhảy 6 → 8) ⇒ 50/100加算 vẫn phải được đặt, điểm = score2 = ' +
                `${c.score2}. Nhận ${got}. Ra ${c.score1} nghĩa là danh sách mã bị nới rộng ` +
                'thành cả dải 203/0..11.',
        ).toBe(c.score2)
    })

    // ══════════════ Nhóm B — 処置選択 hiển thị điểm đã qua getTensu ══════════════

    test('TC-4 — 🎯 処置選択 (frm203016) hiện điểm getTensu, KHÔNG phải score1', async () => {
        skipWithReason(infantPatNo === null, 'không có bệnh nhân 乳幼児')

        /**
         * Đo bằng 点数モード: gõ một 点数 khớp NHIỀU 処置 qua vế `score1 = x`
         * (GetWhereKobeNyuryokuInfo / GetTrtmas). Mọi dòng trả về do đó có CÙNG
         * score1 — nên nếu picker in ra score1 thô thì cả cột phải giống hệt nhau.
         * Dòng nào có `acc_unit` 9..12 và `score2 ≠ score1` sẽ phải in ra score2
         * (bệnh nhân là 乳幼児, ngoại trú, không có 全身麻酔) ⇒ cột KHÔNG đồng nhất.
         * Đó là phép thử sạch nhất cho "picker in ra c04, không phải score1".
         */
        const probe = await withDb(async (c) => {
            const r = await c.query(
                `WITH active_ver AS (
                     SELECT version_id FROM view_mst_trt_ver_active
                      WHERE $1::date BETWEEN start_date AND end_date
                      ORDER BY end_date DESC LIMIT 1
                 ), m AS (
                     SELECT x.trt_cd, x.trt_sb, x.score1, x.score2, x.acc_unit, x.f1
                       FROM view_mst_trt_active x
                       INNER JOIN active_ver av ON x.version_id = av.version_id
                 )
                 SELECT score1,
                        json_agg(json_build_object(
                            'trtCd', trt_cd, 'trtSb', trt_sb, 'score1', score1,
                            'score2', score2, 'accUnit', acc_unit, 'f1', f1)
                            ORDER BY trt_cd, trt_sb) AS rows
                   FROM m
                  GROUP BY score1
                 HAVING count(*) BETWEEN 2 AND 12
                    AND bool_or(acc_unit BETWEEN 9 AND 12 AND f1 = 0 AND score2 <> score1)
                  ORDER BY score1
                  LIMIT 1`,
                [TRT_DT],
            )
            return r.rows[0] as { score1: number; rows: MstTrtCandidate[] } | undefined
        })
        skipWithReason(
            probe === undefined,
            'không có 点数 nào vừa khớp 2..12 処置 vừa có ít nhất một dòng score2 ≠ score1',
        )

        const searched = Number(probe!.score1)
        const variants = probe!.rows.map((x) => ({
            trtCd: Number(x.trtCd),
            trtSb: Number(x.trtSb),
            score1: Number(x.score1),
            score2: Number(x.score2),
            accUnit: Number(x.accUnit),
            f1: Number(x.f1),
        }))
        console.log(`点数モード: gõ ${searched} → ${variants.length} 処置; ` +
            variants.map((v) => `${v.trtCd}-${v.trtSb}(s1=${v.score1} s2=${v.score2} au=${v.accUnit})`).join(' '))

        await deleteTreatmentRows(infantPatNo!, TRT_DT)
        await openTreatments(infantPatNo!)
        await closeStrayDialogs(3000)

        // Về 点数モード (mặc định, nhưng testcase trước đã bật コード).
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        if ((await modeBtn.innerText()).trim() !== '点数') await modeBtn.click()
        await expect(modeBtn).toHaveText('点数')

        await enterTen(String(searched))
        await expect(picker, `点数 ${searched} không mở được 処置選択`).toBeVisible({
            timeout: 20_000,
        })

        const shown = (await picker.getByTestId(PICKER_COL_SCORE).allTextContents()).map((s) =>
            Number(txt(s)),
        )
        console.log(`picker cột 点数: ${JSON.stringify(shown)} (đã gõ ${searched})`)

        // 乳幼児 + ngoại trú + không có 全身麻酔 ⇒ acc_unit 9..12 lấy score2 (CommonChk.cs:130-137);
        // acc_unit 5/6 cũng lấy score2 (:115-121); còn lại giữ score1 (:113).
        const expected = variants.map((v) =>
            (v.accUnit >= 9 && v.accUnit <= 12) || v.accUnit === 5 || v.accUnit === 6
                ? v.score2
                : v.score1,
        )

        // KHÔNG so số dòng với master: 点数モード còn loại các 処置 đòi 病名
        // (`excludeDiseaseRequired`, port của CommonChk.chkDis cho dòng 日計 rỗng —
        // modMain.cs:174 GetTrtmas), nên picker thường ít dòng hơn master trả về.
        // Cái cần khoá là GIÁ TRỊ của cột, không phải số lượng dòng.
        expect(shown.length, 'picker không có dòng nào').toBeGreaterThan(0)

        const allowed = new Set(expected)
        expect(
            shown.filter((s) => !allowed.has(s)),
            `mọi số trong cột 点数 phải là một kết quả getTensu hợp lệ của nhóm score1 = ` +
                `${searched} (kỳ vọng thuộc ${JSON.stringify([...allowed].sort((a, b) => a - b))}), ` +
                `nhận ${JSON.stringify(shown)}.`,
        ).toEqual([])

        expect(
            shown.some((s) => s !== searched),
            `Mọi dòng khớp truy vấn đều có score1 = ${searched}. Nếu picker in ra score1 thô thì ` +
                `cột 点数 phải TOÀN ${searched} — nhận ${JSON.stringify(shown)}. Có ít nhất một ` +
                'dòng khác đi mới chứng minh picker in kết quả getTensu, đúng như WinForm ghi ' +
                'getTensu vào tblTrtSel cột c04 TRƯỚC khi mở frm203016 (modMain.cs:659).',
        ).toBe(true)

        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10_000 })
        await step()
    })

    // ══════════════ Nhóm D — dis_flg 3 + 歯科診療特別対応加算 (cần cờ riêng) ══════════════

    test('TC-5 — dis_flg 3: freewd 「1」 của dòng 105 cùng ngày → 困難者加算 (score2)', async () => {
        skipWithReason(
            !ALLOW_DIS_FLG_PATCH,
            'cần TEST_ALLOW_DIS_FLG_PATCH=1 — dữ liệu KHÔNG có bệnh nhân dis_flg = 3 ' +
                '(chỉ 0/1/2), nên nhánh này phải vá tạm insurance.dis_flg rồi trả lại',
        )
        skipWithReason(cand === null, 'không có 処置 nào score1 ≠ score2')
        skipWithReason(infantPatNo === null, 'không có bệnh nhân để mượn')
        const c = cand!

        /**
         * Mượn một bệnh nhân KHÔNG phải 乳幼児 (để nhánh 乳幼児 không thắng trước dis_flg).
         *
         * BẪY: một bệnh nhân có NHIỀU 枝番 và BE đọc `dis_flg` của 枝番 hiệu lực tại
         * 診療日 (`PatientDetailResult.DisFlgOn`). Vòng đầu spec này chỉ vá 枝番 đầu tiên
         * mà `ORDER BY pat_no LIMIT 1` trả về — không có tiebreak nên Postgres trả 枝番
         * bất kỳ, và khi nó KHÔNG phải cái BE đọc thì testcase đỏ oan (đã dính thật:
         * bệnh nhân 1 có 5 枝番, vá trúng 枝番 2 hiệu lực năm 2020). Vì vậy: vá TOÀN BỘ
         * 枝番 của bệnh nhân đó, và khôi phục lại từng cái theo snapshot.
         */
        const adult = await withDb(async (cl) => {
            const r = await cl.query(
                `SELECT i.pat_no
                   FROM view_insurance_active i
                   JOIN view_person_active p ON p.pat_no = i.pat_no
                  WHERE i.old_flg <> $1
                    AND p.pat_birth_dt <= $2::date - INTERVAL '6 years'
                  GROUP BY i.pat_no
                 HAVING bool_and(i.dis_flg = 0)
                  ORDER BY i.pat_no
                  LIMIT 1`,
                [OLD_FLG_ELDERLY, TRT_DT],
            )
            if (!r.rows[0]) return null
            const patNo = Number(r.rows[0].pat_no)
            const b = await cl.query(
                `SELECT pat_br, dis_flg FROM insurance
                  WHERE pat_no = $1 AND deleted_at IS NULL ORDER BY pat_br`,
                [patNo],
            )
            return {
                patNo,
                branches: b.rows.map((x) => ({
                    patBr: Number(x.pat_br),
                    disFlg: Number(x.dis_flg),
                })),
            }
        })
        skipWithReason(adult === null, 'không tìm được bệnh nhân người lớn dis_flg 0 để mượn')
        console.log(
            `mượn bệnh nhân ${adult?.patNo}, vá dis_flg=3 cho ${adult?.branches.length} 枝番: ` +
                JSON.stringify(adult?.branches),
        )

        try {
            await withDb(async (cl) => {
                await cl.query(
                    `UPDATE insurance SET dis_flg = $1 WHERE pat_no = $2 AND deleted_at IS NULL`,
                    [DIS_FLG_HIGH_NEEDS, adult!.patNo],
                )
            })
            await seedTreatmentRows(adult!.patNo, TRT_DT, [
                {
                    trtCd: HIGH_NEEDS_TRT_CD,
                    trtSb: HIGH_NEEDS_TRT_SB,
                    trtCnt: 1,
                    trtPt: 0,
                    dspTrt: '特別対応加算(テスト)',
                    freewd: FREEWD_DIFFICULT,
                },
            ])

            await openTreatments(adult!.patNo)
            await closeStrayDialogs(3000)

            const got = await commitViaPicker(c.trtCd, c.trtSb)
            await step()

            expect(
                got,
                `dis_flg 3 + dòng 歯科診療特別対応加算 (105/0) cùng ngày có freewd 「1」 ⇒ ` +
                    `disFlg phân giải thành 1 (歯科診療困難者加算) ⇒ score2 = ${c.score2} ` +
                    `(CommonChk.cs:108-110 rồi :130). Nhận ${got}.`,
            ).toBe(c.score2)
        } finally {
            await withDb(async (cl) => {
                for (const b of adult!.branches) {
                    await cl.query(
                        `UPDATE insurance SET dis_flg = $1 WHERE pat_no = $2 AND pat_br = $3`,
                        [b.disFlg, adult!.patNo, b.patBr],
                    )
                }
            }).catch(() => {})
            await deleteTreatmentRows(adult!.patNo, TRT_DT).catch(() => 0)
        }
    })
})
