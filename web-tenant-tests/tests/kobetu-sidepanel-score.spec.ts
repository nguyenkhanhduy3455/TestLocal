import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows, withDb } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * SidePanel — tab 個別 (tab thứ 4), BA CỘT ĐIỂM 一般 / 50/100 / 訪問 và điểm được
 * đưa vào lưới đăng ký khi chọn một dòng. Màn `/treatments/{patNo}`.
 *
 * Đây là spec ĐẦU TIÊN của phần "điểm" ở tab 個別. Tab này đã có test ở
 * `guide-sidepanel-handler.spec.ts` (describe 「選択№ + Enter parity 4 tab」) nhưng
 * chỉ về ô 選択№ + Enter, không đụng tới cột điểm — nên phần dưới đây tách file
 * riêng, không nhét vào file kia.
 *
 * ─── Nguồn WinForm (src/OCHACOM) ──────────────────────────────────────────────
 *  - INP/Lib/modKobetu.cs:86-135 — lưới 個別 (`hfgKobetu`) được DỰNG LÚC CHẠY:
 *    `Columns.Clear()` + `ColumnCount = 30`, rồi đặt lại header/độ rộng/ẩn hiện.
 *    Sáu cột hiện: 2 処置名称, 3 一般, 4 50/100, 5 訪問, 12 ｺｰﾄﾞ, 13 枝番.
 *      ⚠️ Header 「老人」 chỉ có trong Designer (frm203002.Designer.cs:2008, cột
 *      `KobeRou`) — markup CHẾT, bị `Columns.Clear()` xoá trước khi form hiện.
 *      Header thật của cột giữa là 「50/100」.
 *  - INP/Lib/modKobetu.cs:203-207 — nguồn dữ liệu 3 cột đó:
 *        col3 = mst_trt.score1   (点数 cơ bản)
 *        col4 = mst_trt.score2   (乳幼児 / 歯科診療困難者 加算 50/100)
 *        col5 = mst_trt.score3   (歯科訪問診療 加算)
 *  - INP/Lib/modKobetu.cs:255-265 — pKobetu_Let_Trt_Data: chọn một dòng thì điểm
 *    ghi vào lưới đăng ký KHÔNG phải score1 mà là
 *        getTensu(処置日, score1, score2, score3, acc_unit, f1)
 *  - INP/Lib/CommonChk.cs:83-175 — getTensu chọn cột theo BỆNH NHÂN và NGÀY:
 *      · mặc định score1;
 *      · acc_unit 5/6 (画像診断・投薬) + 乳幼児 → score2;
 *      · acc_unit 9..12 (処置・手術・麻酔・歯冠修復), NGOẠI TRÚ, 乳幼児 hoặc
 *        身障(dis_flg 1), chưa tính 全身麻酔 → score2;
 *      · NGÀY 訪問診療 (`ModCommon.pHoumon[day]`):
 *            乳幼児 / 身障 → score2;
 *            f1 == 0  → score3   ← nhánh mà TC-2 dùng
 *            f1 == 11 + 特別対応加算 → score3;
 *            f1 == 10 + 特別対応加算 → quay lại score1.
 *
 * ─── Web port ─────────────────────────────────────────────────────────────────
 *  - Hai lỗi mà file này sinh ra để bắt ĐÃ ĐƯỢC SỬA ở commit `fix(api,web-tenant):
 *    個別タブの点数を getTensu と同じ結果にする`:
 *      · thân bảng render `score1/score3/f1` ⇒ nay là `score1/score2/score3`;
 *      · điểm vào lưới lấy thẳng `score1` ⇒ nay đi qua endpoint `resolve-trt-score`
 *        (BE `TreatmentScoreCalculator.GetTensu`, cùng đường ガイド/パック/薬剤/加算
 *        vẫn đi). `acc_unit` và thông tin bệnh nhân do BE tự đọc; FE chỉ gửi cờ
 *        pHoumon của ngày.
 *    ⇒ TC-1 và TC-2 giờ là test CHỐNG TÁI PHÁT, kỳ vọng XANH.
 *  - ĐÍNH CHÍNH 2026-08-25: ba mục từng ghi ở đây là "chưa nằm trong phạm vi" —
 *    全身麻酔 / 歯科診療特別対応加算 cùng ngày chưa gửi lên (null/false), và đường chọn
 *    qua 処置選択 vẫn là score1 — nay ĐÃ LÀM (commit `feat(api,web-tenant): 診療入力の
 *    点数を実機の getTensu と同じ結果にする`). Testcase cho chúng nằm ở
 *    `treatment-score-gettensu-parity.spec.ts`, ĐỪNG viết đè ở file này.
 *    Còn lại chưa làm: 算定回数 vẫn cố định 1.
 *
 * ─── Khối 検索 (TC-4..TC-8) ───────────────────────────────────────────────────
 *  - frm203002.cs:2177 btnKobeSearch_Click = HAI bước:
 *        1. InputCheckKobe (:2194) — ｺｰﾄﾞ và 点数 mỗi ô phải `int.TryParse`, sai thì
 *           `MsgDialog.ShowWarningMsg("E00002", <nhãn>)` + `.Focus()` về ô đó và
 *           HUỶ search. Thứ tự kiểm: ｺｰﾄﾞ TRƯỚC, 点数 SAU ⇒ sai cả hai thì ra
 *           thông báo của ｺｰﾄﾞ. Nhãn: 「個別入力のコード」/「個別入力の点数」.
 *        2. GetWhereKobeNyuryokuInfo (:2046) — dựng WHERE từ phần còn sống:
 *              ｺｰﾄﾞ  → `TRT_CD = '<x>'`
 *              名称  → `(TRT_NM LIKE '%x%' OR CCT_NM LIKE '%x%')`
 *              点数  → `(SCORE1 = 'x' OR SCORE2 = 'x' OR SCORE3 = 'x')`
 *  - frm203002.cs:2564/2576/2588 — Enter trong 3 ô KHÔNG search, chỉ đẩy focus
 *    ｺｰﾄﾞ → 名称 → 点数 → nút 検索. Nút là chặng CUỐI chứ không bị bỏ qua: đứng ở
 *    nút rồi Enter mới là cái chạy search.
 *  - modKobetu.cs:96-135 — header 6 cột hiện: 処置名称/一般/50/100/訪問/ｺｰﾄﾞ/枝番
 *    (`Columns[2,3,4,5,12,13].Visible = true`). Cột 4 header 「50/100」; 「老人」
 *    chỉ có trong Designer và đã bị `Columns.Clear()` xoá ⇒ KHÔNG được xuất hiện.
 *
 *  ⚠️ TC-8 và TC-9 dùng `test.fail()` — lệch WinForm ĐÃ ĐO ĐƯỢC, không phải test
 *     hỏng. `test.fail()` cho chúng CHẠY THẬT mà suite vẫn xanh và khối serial
 *     không bị dừng; hôm nào sửa xong, Playwright báo 「expected to fail, but
 *     passed」 để nhắc xoá annotation. (Nếu để đỏ trần thì serial bỏ qua mọi test
 *     phía sau — đó là lý do không dùng cách đó.)
 *
 *  TC-9 — con trỏ KHÔNG quay về ô hỏng sau E00002. Web có gọi `box.current?.focus()`
 *     nhưng `DialogShell` (shared/ui/dialog-shell.tsx:86-92) chỉ chặn
 *     `onOpenAutoFocus`, không chặn `onCloseAutoFocus` ⇒ Radix trả focus về nút
 *     検索 sau đó. Đo bằng `document.activeElement`: +0/+100/+300ms đều là nút 検索.
 *
 *  TC-8 — lệch ở vị từ 点数.
 *     WinForm ô 点数 của tab 個別 khớp `SCORE1 OR SCORE2 OR SCORE3` (:2078).
 *     Web dùng chung vị từ với picker 点数モード: `MstTrtQueries.cs:80-82`
 *         homeVisit ? (score1 = x OR (score3 = x AND f1 IN (0,11))) : score1 = x
 *     và tab 個別 KHÔNG gửi `homeVisit` (KobeSearchFilter chỉ có trtCd/name/score)
 *     ⇒ thực tế chỉ còn `score1 = x`. Vị từ hẹp kia sinh ra để chữa lỗi
 *     「400 点 data trên tìm kiếm 600」 của 点数モード (comment MstTrtQueries.cs:68-78)
 *     — đúng cho 点数モード, nhưng 個別 ở WinForm chưa bao giờ hẹp như vậy.
 *     Vì `mode: 'serial'` bỏ qua mọi test SAU test đỏ đầu tiên, TC-8 đặt CUỐI FILE.
 *
 *  Cố ý KHÔNG test (WinForm có, web chưa port — thêm vào là đỏ dây chuyền):
 *    · `hfgKobetu.Focus()` sau khi search xong (frm203002.cs:2191) — web để focus
 *      nguyên trên nút 検索.
 *
 * ─── Dữ liệu (cần TEST_DB=1) ─────────────────────────────────────────────────
 *  1. `beforeAll` seed MỘT dòng 歯科訪問診療 (trt_cd 333) vào (PAT_NO, TRT_DT) để
 *     ngày test trở thành 訪問診療日 — web suy ra cờ này ngay từ lưới
 *     (`isHoumonDay`, treatment-entry-detail.tsx:3648), không cần cấu hình gì thêm.
 *  2. 処置 đem test KHÔNG hard-code: `findScoreCandidate()` hỏi thẳng mst_trt của
 *     BẢN MASTER ĐANG ÁP DỤNG (cùng mệnh đề active_ver mà BE dùng —
 *     MstTrtQueries.cs:107-115) để lấy một dòng có score1/score2/score3 KHÁC NHAU
 *     ĐÔI MỘT, f1 = 0, acc_unit 9..12. Ba điểm khác nhau đôi một là điều kiện cần
 *     để phân biệt được cột nào đang lấy nhầm cột nào.
 *  3. Tuổi + dis_flg của bệnh nhân được ĐỌC TỪ DB chứ không giả định: nhánh
 *     getTensu rẽ theo hai giá trị đó. 乳幼児/身障 → kỳ vọng là score2; dis_flg 3
 *     (歯科診療特別対応) rẽ theo 加算 đã tính trong ngày nên testcase tự skip.
 *  4. Spec TUYỆT ĐỐI KHÔNG bấm F9 登録 ⇒ không ghi lưới xuống DB. Thứ duy nhất
 *     chạm DB là dòng 333 seed, dọn ở `afterAll`.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. Tab 個別 dùng list ẢO (react-virtual). Tìm theo ｺｰﾄﾞ để list còn vài dòng rồi
 *     mới đọc ô — đừng cuộn đi tìm trong 1.7k dòng.
 *  2. Ô ｺｰﾄﾞ CHỈ ăn SỐ NGUYÊN. Gõ "cd-sb" kiểu 「174-0」 thì WinForm bung E00002
 *     「個別入力のコードが間違っています。」 và HUỶ search (InputCheckKobe,
 *     frm203002.cs:2194 — `int.TryParse`). GetWhereKobeNyuryokuInfo (:2046) có
 *     comment nói tách 「101-2」 thành TRT_CD+TRT_SB, nhưng check chạy trước nên
 *     nhánh đó không bao giờ tới ⇒ chưa bao giờ dùng được. Web trước đây có tách,
 *     đã bỏ để khớp WinForm — giống hệt việc コードモード bỏ cú pháp "コード-枝番"
 *     hồi 2026-07-23 (xem point-code-mode-code-enter-value.spec.ts).
 *     ⇒ Ở đây tìm theo MỖI 処置コード, rồi lọc 枝番 bằng cách đọc ô trên dòng.
 *  3. Enter trong 3 ô tìm kiếm KHÔNG search — chỉ chuyển focus
 *     ｺｰﾄﾞ → 名称 → 点数 → nút 検索 (txtKobeSearch*_KeyDown, :2564/2576/2588).
 *     Muốn search thì bấm nút (hoặc Enter khi focus đã ở trên nút).
 *  4. Ô ｺｰﾄﾞ không còn `placeholder`. Nhãn bên cạnh là 「ｺｰﾄﾞ」 NỬA CHIỀU RỘNG,
 *     còn header cột của lưới là 「コード」 ĐỦ CHIỀU RỘNG — hai chuỗi khác nhau nên
 *     `getByText('ｺｰﾄﾞ', { exact: true })` không dính nhầm header. Đừng NFKC ở locator.
 *  5. Tên hiện trong lưới là cct_nm hay trt_nm tuỳ `inp_config.tre_inp_flg`
 *     (ModCommon.pCultTrt) ⇒ khi dò dòng vừa append phải chấp nhận CẢ HAI tên.
 *  6. `SanteiConfirmDialog` 「〜を算定しますか？」 bung ra sau khi lưới nạp xong và
 *     đè lên mọi click → `addLocatorHandler` bấm No (GUIDELINE Rule 14/14.1).
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 npx playwright test tests/kobetu-sidepanel-score.spec.ts --retries=0
 *
 * `--retries=0` vì `playwright.config.ts` để `retries: 1` ở local: một lần retry
 * là chạy lại CẢ khối serial ⇒ thêm một lần login + seed, tốn quota login
 * (Rule 10.1). Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19 — khối serial
 * dùng chung page).
 *
 * Kỳ vọng: TC-1..TC-7 XANH (đỏ là hồi quy thật, retry không cứu được);
 * TC-8, TC-9 chạy dưới `test.fail()` nên hiện ra là 「expected」 — cả file vẫn
 * xanh. Chúng nằm CUỐI và là hai lệch WinForm độc lập, xem mô tả bên trên.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** Ngày test = HÔM NAY — phải thuộc tháng hiện hành thì mới thao tác được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** 歯科訪問診療 — mã bật cờ pHoumon của ngày (code-mode-entry.ts `HomeVisit`). */
const HOUMON_TRT_CD = 333
const HOUMON_NM = '歯科訪問診療'
const HOUMON_PT = 1100

/** Cột lưới đăng ký (RegiCol, treatment-entry-shared.ts:63): 2 = 療法・処置, 3 = 点. */
const REGI_COL_RYO = 2
const REGI_COL_TEN = 3

/** Ranh giới 乳幼児 hiện hành (CommonChk.chkNyuyouji, mốc 2010/04 trở đi): dưới 6 tuổi. */
const NYUYOUJI_MAX_AGE = 5

/** dis_flg 1 = 歯科診療困難者 (getTensu nâng lên score2); 3 = 特別対応 (nhánh phụ thuộc 加算). */
const DIS_FLG_HANDICAPPED = 1
const DIS_FLG_HIGH_NEEDS = 3

const GRID_LOAD_TIMEOUT = 60_000

/**
 * 処置コード chắc chắn KHÔNG khớp dòng nào: `mst_trt.trt_cd` là SMALLINT, PG nới
 * kiểu cho phép so `int2 = int4` nên giá trị ngoài SMALLINT chỉ đơn giản là không
 * khớp (MstTrtQueries.cs:41-43). Vẫn qua được `int.TryParse` của InputCheckKobe
 * ⇒ đúng thứ cần: một lần search HỢP LỆ mà kết quả rỗng.
 */
const CODE_MATCHING_NOTHING = 999999

/** Nhãn E00002 mà InputCheckKobe truyền vào (frm203002.cs:2205 / :2215). */
const E00002_CODE = '個別入力のコードが間違っています。'
const E00002_TENS = '個別入力の点数が間違っています。'

/** Header 6 cột hiện của hfgKobetu — modKobetu.cs:96-108 + Columns[..].Visible. */
const KOBE_HEADERS = ['処置名称', '一般', '50/100', '訪問', 'コード', '枝番']

/** Tên 処置 render kèm khoảng trắng đầu → luôn so sánh sau NFKC + trim. */
const txt = (s: string) => s.normalize('NFKC').trim()

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
 * Một dòng mst_trt của BẢN ĐANG ÁP DỤNG đủ điều kiện phân biệt 3 cột điểm:
 *   · score1 / score2 / score3 khác nhau đôi một và đều > 0 — nếu hai cột trùng
 *     giá trị thì lấy nhầm cột vẫn "đúng" và testcase mất tác dụng;
 *   · f1 = 0 và acc_unit 9..12 — nhánh 訪問診療 của getTensu trả score3, không
 *     dính 特別対応加算 (f1 10/11) hay 訪問診療で算定不可 (f1 2);
 *   · loại các mã mà 個別 mở dialog nhập liệu trước khi chèn (specialPickDialog:
 *     17 自費, 179-5 分割抜歯, 50/202/203 IS) và dải 薬剤 600-699 (rẽ đường khác).
 * Mệnh đề active_ver copy nguyên từ BE (MstTrtQueries.cs:107-115) để danh sách
 * test đọc đúng bản master mà tab 個別 đang hiển thị.
 */
async function findScoreCandidate(): Promise<MstTrtCandidate | null> {
    return withDb(async (c) => {
        const r = await c.query<{
            trt_cd: number
            trt_sb: number
            trt_nm: string
            cct_nm: string
            score1: number
            score2: number
            score3: number
            f1: number
            acc_unit: number
        }>(
            `WITH active_ver AS (
                 SELECT version_id
                   FROM view_mst_trt_ver_active
                  WHERE CURRENT_DATE BETWEEN start_date AND end_date
                  ORDER BY end_date DESC
                  LIMIT 1
             )
             SELECT m.trt_cd, m.trt_sb, m.trt_nm, m.cct_nm,
                    m.score1, m.score2, m.score3, m.f1, m.acc_unit
               FROM view_mst_trt_active m
               INNER JOIN active_ver av ON m.version_id = av.version_id
              WHERE m.f1 = 0
                AND m.acc_unit BETWEEN 9 AND 12
                AND m.score1 > 0 AND m.score2 > 0 AND m.score3 > 0
                AND m.score1 <> m.score2
                AND m.score2 <> m.score3
                AND m.score1 <> m.score3
                AND right(m.trt_nm, 1) <> '!'
                AND m.trt_cd NOT IN (17, 50, 179, 202, 203, 333, 999)
                AND m.trt_cd NOT BETWEEN 600 AND 699
              ORDER BY m.trt_cd, m.trt_sb
              LIMIT 1`,
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

/**
 * Một dòng master mà `cct_nm` KHÔNG phải khúc con của `trt_nm` — dùng để chứng
 * minh vế `OR CCT_NM LIKE` của GetWhereKobeNyuryokuInfo (:2074) thật sự có tác
 * dụng. Nếu lấy đại một dòng rồi tìm theo `trt_nm` thì vế `cct_nm` có bị bỏ quên
 * cũng vẫn xanh — testcase mất tác dụng.
 *
 * `hit_cnt` = số dòng khớp chính chuỗi đó: list 個別 là list ẢO nên chỉ quét được
 * mấy dòng đang render; khớp quá nhiều thì bỏ qua thay vì đỏ oan (BẪY 1).
 * Loại `%`/`_` vì BE có escape LIKE (SqlLikeEscape) — không phải chỗ test ở đây.
 */
async function findCctNmOnlyCandidate(): Promise<{
    trtCd: number
    trtSb: number
    trtNm: string
    cctNm: string
} | null> {
    return withDb(async (c) => {
        const r = await c.query<{
            trt_cd: number
            trt_sb: number
            trt_nm: string
            cct_nm: string
        }>(
            `WITH active_ver AS (
                 SELECT version_id
                   FROM view_mst_trt_ver_active
                  WHERE CURRENT_DATE BETWEEN start_date AND end_date
                  ORDER BY end_date DESC
                  LIMIT 1
             ),
             m AS (
                 SELECT t.trt_cd, t.trt_sb, t.trt_nm, t.cct_nm
                   FROM view_mst_trt_active t
                   INNER JOIN active_ver av ON t.version_id = av.version_id
             )
             SELECT m.trt_cd, m.trt_sb, m.trt_nm, m.cct_nm
               FROM m
              WHERE m.cct_nm <> '' AND m.trt_nm <> ''
                AND char_length(m.cct_nm) BETWEEN 4 AND 24
                AND strpos(m.trt_nm, m.cct_nm) = 0
                AND strpos(m.cct_nm, '%') = 0
                AND strpos(m.cct_nm, '_') = 0
                AND right(m.trt_nm, 1) <> '!'
                AND (SELECT count(*) FROM m x
                      WHERE strpos(x.trt_nm, m.cct_nm) > 0
                         OR strpos(x.cct_nm, m.cct_nm) > 0) <= 8
              ORDER BY m.trt_cd, m.trt_sb
              LIMIT 1`,
        )
        const row = r.rows[0]
        if (!row) return null
        return {
            trtCd: Number(row.trt_cd),
            trtSb: Number(row.trt_sb),
            trtNm: row.trt_nm,
            cctNm: row.cct_nm,
        }
    })
}

/** Tuổi (tính tới TRT_DT) + dis_flg của bệnh nhân — hai tham số rẽ nhánh của getTensu. */
async function patientScoreContext(): Promise<{ age: number; disFlg: number } | null> {
    return withDb(async (c) => {
        const r = await c.query<{ birth: string | null; dis_flg: number }>(
            `SELECT p.pat_birth_dt AS birth,
                    COALESCE((SELECT i.dis_flg
                                FROM view_insurance_active i
                               WHERE i.pat_no = p.pat_no
                               ORDER BY i.pat_br DESC
                               LIMIT 1), 0) AS dis_flg
               FROM view_person_active p
              WHERE p.pat_no = $1
              LIMIT 1`,
            [Number(PAT_NO)],
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
        return { age, disFlg: Number(row.dis_flg) }
    })
}

if (!dbEnabled) {
    console.log(
        'SKIP tests/kobetu-sidepanel-score.spec.ts — thiếu TEST_DB=1 (cần đọc mst_trt ' +
            'của bản đang áp dụng + seed dòng 訪問診療 cho ngày test).\n' +
            '  TEST_DB=1 npx playwright test tests/kobetu-sidepanel-score.spec.ts',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để đọc mst_trt và seed dòng 訪問診療')

/**
 * `serial` — MỘT phiên login cho cả file, và đỏ thì dừng luôn.
 *
 * Cả describe là MỘT job: `beforeAll` (login + seed dòng 訪問診療) chạy đúng một
 * lần, `afterAll` dọn đúng một lần, mọi testcase dùng chung một page (Rule 10.1 —
 * app giới hạn số lần login). Đây cũng là lý do không có va chạm dữ liệu: chỉ một
 * luồng duy nhất đụng vào (pat_no, trt_dt).
 *
 * Hệ quả phải biết: serial BỎ QUA mọi testcase SAU testcase đỏ đầu tiên. TC-1 và
 * TC-2 đang đỏ có chủ ý và là hai lỗi độc lập, nên khi TC-1 còn đỏ thì TC-2 báo
 * `did not run` — sửa xong cột điểm (TC-1 xanh) mới thấy TC-2 đỏ. Đó là đánh đổi
 * đã chọn: một phiên login, fail thì dừng.
 *
 * (Từng thử `mode: 'default'` để cả hai cùng chạy: `fullyParallel` của
 * playwright.config biến MỖI testcase thành một job riêng ⇒ hook chạy lại cho
 * từng test = 2 lần login + 2 lượt seed/xoá, và phải ghim `--workers=1` mới khỏi
 * giẫm dữ liệu. Đắt hơn cái lợi.)
 */
test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('SidePanel 個別 — 3 cột điểm 一般/50・100/訪問 và điểm khi chọn (getTensu)', () => {
    let page: Page
    let step: () => Promise<void>
    let sidePanel: Locator
    let cand: MstTrtCandidate | null = null
    let patCtx: { age: number; disFlg: number } | null = null
    let cctCand: { trtCd: number; trtSb: number; trtNm: string; cctNm: string } | null = null

    /** Dòng tab 個別 — list ảo, `data-index` là chỉ số THẬT trong mst_trt. */
    const kobeRows = () => sidePanel.locator('div[data-index]')

    /** Sáu ô của một dòng 個別: 処置名称 / 一般 / 50・100 / 訪問 / ｺｰﾄﾞ / 枝番. */
    async function kobeRowCells(row: Locator): Promise<string[]> {
        return (await row.locator('> div').allTextContents()).map(txt)
    }

    /** Mở tab 個別 và chờ list dựng xong (hoặc báo 該当なし). */
    async function openKobetuTab() {
        const tab = sidePanel.getByRole('button', { name: '個別', exact: true })
        await tab.click()
        await expect(
            kobeRows().first().or(sidePanel.getByText('該当なし')),
            'tab 個別 không nạp được mst_trt',
        ).toBeVisible({ timeout: 30_000 })
    }

    /**
     * Ô ｺｰﾄﾞ của khối 検索 — nhãn 「ｺｰﾄﾞ」 (nửa chiều rộng) và `<input>` là ANH EM
     * ruột trong cùng một div, nên bắt bằng following-sibling. Không dùng
     * `getByPlaceholder` nữa: placeholder 「101-2」 đã bị gỡ vì gợi ý một cú pháp
     * mà WinForm không nhận (BẪY 2/4).
     */
    const kobeCodeInput = () =>
        sidePanel
            .locator('span', { hasText: /^ｺｰﾄﾞ$/ })
            .locator('xpath=following-sibling::input[1]')

    /**
     * Hai ô còn lại của khối 検索, cùng kiểu anh-em-ruột như ô ｺｰﾄﾞ. Nhãn 「名称」
     * và 「点数」 chỉ render khi `activeTab === '個別'` (treatment-side-panel.tsx),
     * nên không đụng nhau với footer của 3 tab kia.
     */
    const kobeNameInput = () =>
        sidePanel
            .locator('span', { hasText: /^名称$/ })
            .locator('xpath=following-sibling::input[1]')
    const kobeScoreInput = () =>
        sidePanel
            .locator('span', { hasText: /^点数$/ })
            .locator('xpath=following-sibling::input[1]')

    const kobeSearchButton = () => sidePanel.getByRole('button', { name: '検索' })

    /**
     * Trả 3 ô về rỗng. Cả file dùng CHUNG một page (serial), nên thứ TC trước gõ
     * vào ô vẫn còn đó — không dọn thì TC sau tìm nhầm điều kiện của TC trước.
     * Chỉ `fill('')`, KHÔNG bấm 検索: có testcase cần biết list đang là gì trước
     * khi mình đụng vào.
     */
    async function resetSearchBoxes() {
        await kobeCodeInput().fill('')
        await kobeNameInput().fill('')
        await kobeScoreInput().fill('')
    }

    /** Đóng hộp E00002 rồi chờ nó biến mất (dialog chặn mọi click sau đó). */
    async function dismissWarning(message: string) {
        const dialog = page.getByText(message)
        await expect(dialog).toBeVisible({ timeout: 10_000 })
        await page
            .getByRole('button', { name: /^(OK|はい)$/ })
            .first()
            .click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
    }

    /** Bộ ｺｰﾄﾞ đang hiển thị trên list (ô [4] của mỗi dòng đang render). */
    async function visibleCodes(): Promise<string[]> {
        const n = await kobeRows().count()
        const out: string[] = []
        for (let i = 0; i < n; i++) out.push((await kobeRowCells(kobeRows().nth(i)))[4] ?? '')
        return [...new Set(out)]
    }

    /**
     * Lọc list 個別 theo 処置コード rồi trả về dòng đúng 枝番.
     *
     * CHỈ gõ số 処置コード — gõ 「cd-sb」 là ăn E00002 và search bị huỷ (BẪY 2). Vì
     * thế kết quả có thể nhiều dòng (mỗi 枝番 một dòng); lọc tiếp ở client bằng ô
     * ｺｰﾄﾞ/枝番 trên từng dòng. Số 枝番 của một mã luôn nhỏ nên tất cả đều đã render,
     * không vướng list ảo (BẪY 1).
     */
    async function searchKobetu(trtCd: number, trtSb: number): Promise<Locator> {
        await kobeCodeInput().fill(String(trtCd))
        await sidePanel.getByRole('button', { name: '検索' }).click()
        await expect
            .poll(() => kobeRows().count(), {
                message: `tìm ｺｰﾄﾞ ${trtCd} không ra dòng nào`,
                timeout: 20_000,
            })
            .toBeGreaterThan(0)

        const n = await kobeRows().count()
        const seen: string[] = []
        for (let i = 0; i < n; i++) {
            const row = kobeRows().nth(i)
            const cells = await kobeRowCells(row)
            // [4] ｺｰﾄﾞ, [5] 枝番
            if (cells[4] === String(trtCd) && cells[5] === String(trtSb)) {
                await step()
                return row
            }
            seen.push(`${cells[4]}-${cells[5]}`)
        }
        throw new Error(
            `tìm ｺｰﾄﾞ ${trtCd} ra ${n} dòng nhưng không có 枝番 ${trtSb} ` +
                `(thấy: ${seen.join(', ')})`,
        )
    }

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

    test.beforeAll(async ({ browser }) => {
        cand = await findScoreCandidate()
        patCtx = await patientScoreContext()
        cctCand = await findCctNmOnlyCandidate()

        // Dòng 歯科訪問診療 → ngày test thành 訪問診療日 (pHoumon). Seed TRƯỚC khi mở
        // trình duyệt vì lưới chỉ đọc DB một lần lúc vào màn.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: HOUMON_TRT_CD,
                trtSb: 0,
                trtPt: HOUMON_PT,
                trtCnt: 1,
                jihiFlg: 0,
                dspTrt: HOUMON_NM,
            },
        ])

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

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

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        await openKobetuTab()
    })

    test.afterAll(async () => {
        await page?.close()
        const n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        console.log(`afterAll: đã xoá ${n} dòng seed của (${PAT_NO}, ${TRT_DT})`)
    })

    test('TC-1 — cột 「50/100」 = score2 và cột 「訪問」 = score3 (modKobetu.cs:203-207)', async () => {
        test.skip(
            cand === null,
            'master đang áp dụng không có 処置 nào score1/2/3 khác nhau đôi một (f1 0, acc_unit 9..12)',
        )
        const c = cand!

        const row = await searchKobetu(c.trtCd, c.trtSb)
        const cells = await kobeRowCells(row)

        // [0] 処置名称, [1] 一般, [2] 50/100, [3] 訪問, [4] ｺｰﾄﾞ, [5] 枝番
        expect(cells, 'một dòng 個別 phải có đúng 6 ô như hfgKobetu').toHaveLength(6)

        // Ba cột điểm dùng `expect.soft`: nếu hồi quy thì thường lệch cả cụm
        // (bind nhầm sang cột bên cạnh), assert cứng chỉ cho thấy cột đầu tiên.
        expect.soft(Number(cells[1]), 'cột 「一般」 phải là mst_trt.score1').toBe(c.score1)

        expect
            .soft(
                Number(cells[2]),
                `cột 「50/100」 phải là mst_trt.score2 (=${c.score2}), đang nhận ${cells[2]}. ` +
                    `Nếu ra ${c.score3} tức là đã bind lại score3 như trước khi sửa.`,
            )
            .toBe(c.score2)

        expect
            .soft(
                Number(cells[3]),
                `cột 「訪問」 phải là mst_trt.score3 (=${c.score3}), đang nhận ${cells[3]}. ` +
                    `Nếu ra ${c.f1} tức là đã bind lại f1 — f1 là cờ phân loại, KHÔNG phải điểm.`,
            )
            .toBe(c.score3)
    })

    test('TC-2 — ngày 訪問診療: chọn dòng 個別 phải ghi điểm getTensu (score3), không phải score1', async () => {
        test.skip(cand === null, 'không tìm được 処置 đủ điều kiện trong master đang áp dụng')
        test.skip(
            patCtx === null,
            `không đọc được ngày sinh / dis_flg của bệnh nhân ${PAT_NO} để suy ra nhánh getTensu`,
        )
        const c = cand!
        const { age, disFlg } = patCtx!
        test.skip(
            disFlg === DIS_FLG_HIGH_NEEDS,
            `bệnh nhân ${PAT_NO} có dis_flg 3 (歯科診療特別対応) — nhánh getTensu này còn ` +
                'phụ thuộc 加算 đã tính trong ngày, không chốt được kỳ vọng tĩnh',
        )

        // getTensu, nhánh 訪問診療 + acc_unit 9..12 + f1 = 0 (CommonChk.cs:126-145):
        //   乳幼児 hoặc 歯科診療困難者 → score2; còn lại → score3.
        const isNyuyouji = age <= NYUYOUJI_MAX_AGE
        const expected =
            isNyuyouji || disFlg === DIS_FLG_HANDICAPPED ? c.score2 : c.score3
        const branch =
            isNyuyouji || disFlg === DIS_FLG_HANDICAPPED
                ? '乳幼児/困難者 → score2'
                : 'ngoài hai nhóm trên → score3'

        // Ngày test đã là 訪問診療日 nhờ dòng 333 seed ở beforeAll.
        await expect(
            page.getByText(HOUMON_NM).first(),
            'dòng 歯科訪問診療 seed không lên lưới ⇒ ngày test KHÔNG phải 訪問診療日, ' +
                'testcase mất tiền đề',
        ).toBeVisible()

        await openKobetuTab()
        const row = await searchKobetu(c.trtCd, c.trtSb)

        const before = await regiRows()
        await row.click()
        await step()

        // Dòng vừa append — dò theo tên (cct_nm hay trt_nm tuỳ pCultTrt, BẪY 3).
        const wanted = [txt(c.trtNm), txt(c.cctNm)]
        await expect
            .poll(
                async () =>
                    (await regiRows()).filter((r) => wanted.some((w) => r.text.includes(w))).length,
                {
                    message: `chọn dòng 個別 「${c.trtNm}」 mà lưới đăng ký không thêm dòng nào`,
                    timeout: 15_000,
                },
            )
            .toBeGreaterThan(before.filter((r) => wanted.some((w) => r.text.includes(w))).length)

        const added = (await regiRows()).filter((r) => wanted.some((w) => r.text.includes(w))).pop()!
        const tenText = txt(
            (await page
                .locator(`[data-grid-cell="${added.key}|${REGI_COL_TEN}"]`)
                .textContent()) ?? '',
        )

        expect(
            Number(tenText),
            `点 của 処置 vừa chọn phải là ${expected} (${branch}; ` +
                `score1=${c.score1} score2=${c.score2} score3=${c.score3}, ` +
                `acc_unit=${c.accUnit} f1=${c.f1}, tuổi ${age}, dis_flg ${disFlg}). ` +
                `Đang nhận ${tenText}. Nếu ra ${c.score1} tức là đã quay về lấy ` +
                'thẳng 一般, bỏ qua resolve-trt-score → getTensu ' +
                '(modKobetu.cs:265 → CommonChk.cs:83).',
        ).toBe(expected)
    })

    test('TC-3 — ô ｺｰﾄﾞ chỉ ăn số nguyên: 「174-0」 ra E00002 và KHÔNG search', async () => {
        // InputCheckKobe (frm203002.cs:2194) chặn trước khi tới
        // GetWhereKobeNyuryokuInfo, nên cú pháp "cd-sb" mà comment ở :2054 mô tả
        // chưa bao giờ chạy được. Chốt lại để không ai "sửa" bằng cách mở lại nhánh
        // tách dấu gạch ngang — đó là thêm tính năng, không phải parity.
        await openKobetuTab()

        // Search hợp lệ trước để list ở trạng thái đã biết, rồi mới gõ mã hỏng:
        // khẳng định "không search" chỉ có nghĩa khi biết list TRƯỚC đó là gì.
        const c = cand
        if (c) await searchKobetu(c.trtCd, c.trtSb)
        const rowsBefore = await kobeRows().count()

        await kobeCodeInput().fill('174-0')
        await sidePanel.getByRole('button', { name: '検索' }).click()

        const dialog = page.getByText('個別入力のコードが間違っています。')
        await expect(
            dialog,
            'gõ 「174-0」 phải bung E00002 「個別入力のコードが間違っています。」 ' +
                '(int.TryParse thất bại vì dấu gạch ngang)',
        ).toBeVisible({ timeout: 10_000 })

        await page.getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })

        expect(
            await kobeRows().count(),
            'search bị huỷ thì list phải giữ nguyên — nếu đổi tức là mã hỏng vẫn ' +
                'được đem đi lọc (hoặc bị âm thầm bỏ qua rồi kéo về full master)',
        ).toBe(rowsBefore)

        // Trả ô về trạng thái sạch cho các lần chạy sau trong cùng page.
        await kobeCodeInput().fill('')
        await step()
    })

    test('TC-4 — Enter trong 3 ô chỉ đẩy focus ｺｰﾄﾞ→名称→点数→検索, KHÔNG search (frm203002.cs:2564/2576/2588)', async () => {
        test.skip(cand === null, 'không tìm được 処置 đủ điều kiện trong master đang áp dụng')
        const c = cand!

        await openKobetuTab()
        await resetSearchBoxes()

        // Mốc so sánh: search thật một mã có tồn tại ⇒ list CHỈ còn mã đó. "Không
        // search" chỉ chứng minh được khi biết chắc list TRƯỚC đó là gì.
        await searchKobetu(c.trtCd, c.trtSb)
        expect(
            await visibleCodes(),
            `sau khi bấm 検索 với ｺｰﾄﾞ ${c.trtCd}, list phải chỉ còn mã đó`,
        ).toEqual([String(c.trtCd)])

        // Gõ một mã KHÁC rồi Enter: nếu Enter mà search thì list sẽ rỗng (該当なし).
        await kobeCodeInput().fill(String(CODE_MATCHING_NOTHING))
        await kobeCodeInput().press('Enter')

        await expect(
            kobeNameInput(),
            'Enter ở ô ｺｰﾄﾞ phải đẩy focus sang ô 名称 (txtKobeSearchCode_KeyDown)',
        ).toBeFocused()
        expect(
            await visibleCodes(),
            `Enter ở ô ｺｰﾄﾞ KHÔNG được chạy search — list phải vẫn là ${c.trtCd}. ` +
                'Nếu thành 該当なし tức là Enter đã submit như web thường làm, ' +
                'trái với WinForm (ô chỉ chuyển focus).',
        ).toEqual([String(c.trtCd)])

        await kobeNameInput().press('Enter')
        await expect(
            kobeScoreInput(),
            'Enter ở ô 名称 phải đẩy focus sang ô 点数 (txtKobeSearchName_KeyDown)',
        ).toBeFocused()

        await kobeScoreInput().press('Enter')
        await expect(
            kobeSearchButton(),
            'Enter ở ô 点数 phải đẩy focus sang NÚT 検索 — nút là chặng cuối của ' +
                'chuỗi Enter, không phải chặng bị bỏ qua (txtKobeSearchTens_KeyDown)',
        ).toBeFocused()

        // Đứng ở nút rồi Enter MỚI là cái chạy search (btnKobeSearch_Click).
        await kobeSearchButton().press('Enter')
        await expect(
            sidePanel.getByText('該当なし'),
            `Enter khi focus đang ở nút 検索 phải chạy search: ｺｰﾄﾞ ${CODE_MATCHING_NOTHING} ` +
                'ngoài dải SMALLINT nên không khớp dòng nào ⇒ 該当なし',
        ).toBeVisible({ timeout: 20_000 })

        await resetSearchBoxes()
        await step()
    })

    test('TC-5 — 点数 sai kiểu ra E00002 của 点数; sai cả hai ô thì ｺｰﾄﾞ được báo trước (InputCheckKobe)', async () => {
        await openKobetuTab()
        await resetSearchBoxes()

        // (a) Chỉ 点数 hỏng → nhãn phải là 「個別入力の点数」, KHÔNG phải nhãn ｺｰﾄﾞ.
        await kobeScoreInput().fill('12a')
        await kobeSearchButton().click()
        await expect(
            page.getByText(E00002_TENS),
            'ô 点数 không `int.TryParse` được thì phải ra E00002 với nhãn 「個別入力の点数」 ' +
                '(frm203002.cs:2213)',
        ).toBeVisible({ timeout: 10_000 })
        await dismissWarning(E00002_TENS)

        // (con trỏ có quay về ô 点数 hay không: xem TC-9 — đang lệch WinForm)

        // (b) Hỏng CẢ HAI → InputCheckKobe kiểm ｺｰﾄﾞ trước và `return` ngay, nên
        // người dùng chỉ thấy thông báo của ｺｰﾄﾞ.
        await kobeCodeInput().fill('174-0')
        await kobeSearchButton().click()
        await expect(
            page.getByText(E00002_CODE),
            'sai cả ｺｰﾄﾞ lẫn 点数 thì phải ra thông báo của ｺｰﾄﾞ — InputCheckKobe ' +
                'kiểm ｺｰﾄﾞ trước rồi return, chưa chạm tới nhánh 点数',
        ).toBeVisible({ timeout: 10_000 })
        await expect(
            page.getByText(E00002_TENS),
            'không được hiện thông báo của 点数 cùng lúc — WinForm chỉ báo lỗi ĐẦU TIÊN',
        ).toBeHidden()
        await dismissWarning(E00002_CODE)

        await resetSearchBoxes()
        await step()
    })

    test('TC-6 — header 6 cột đúng thứ tự và KHÔNG có 「老人」 (modKobetu.cs:96-135)', async () => {
        await openKobetuTab()

        // `Columns.Clear()` lúc dựng lưới xoá sạch Designer rồi mới đặt lại header,
        // nên 「老人」 (frm203002.Designer.cs:2008, cột KobeRou) là markup CHẾT.
        // Cột giữa tên thật là 「50/100」.
        const headerRow = sidePanel.locator('div.grid.font-bold').first()
        const headers = (await headerRow.locator('> div').allTextContents()).map(txt)

        expect(
            headers,
            'header tab 個別 phải đúng 6 cột đang Visible của hfgKobetu ' +
                '(Columns[2,3,4,5,12,13])',
        ).toEqual(KOBE_HEADERS)

        await expect(
            sidePanel.getByText('老人', { exact: true }),
            '「老人」 chỉ tồn tại trong Designer và đã bị Columns.Clear() xoá trước khi ' +
                'form hiện — không được render. Thấy nó tức là port theo Designer ' +
                'thay vì theo modKobetu.',
        ).toHaveCount(0)
    })

    test('TC-7 — 名称 khớp CẢ trt_nm lẫn cct_nm (GetWhereKobeNyuryokuInfo :2074)', async () => {
        test.skip(
            cctCand === null,
            'master đang áp dụng không có dòng nào cct_nm không phải khúc con của trt_nm ' +
                '(và đủ hiếm để quét trên list ảo)',
        )
        const k = cctCand!

        await openKobetuTab()
        await resetSearchBoxes()

        // Tìm bằng CHÍNH cct_nm — chuỗi này không nằm trong trt_nm của dòng đó, nên
        // dòng chỉ lên được qua vế `OR CCT_NM LIKE`. Bỏ vế đó là testcase đỏ.
        await kobeNameInput().fill(k.cctNm)
        await kobeSearchButton().click()

        await expect
            .poll(() => kobeRows().count(), {
                message:
                    `tìm 名称 「${k.cctNm}」 không ra dòng nào. Chuỗi này chỉ có trong ` +
                    `cct_nm (trt_nm = 「${k.trtNm}」) ⇒ WHERE đang thiếu vế ` +
                    'OR CCT_NM LIKE, chỉ còn LIKE trên trt_nm.',
                timeout: 20_000,
            })
            .toBeGreaterThan(0)

        const n = await kobeRows().count()
        const seen: string[] = []
        let found = false
        for (let i = 0; i < n; i++) {
            const cells = await kobeRowCells(kobeRows().nth(i))
            if (cells[4] === String(k.trtCd) && cells[5] === String(k.trtSb)) {
                found = true
                break
            }
            seen.push(`${cells[4]}-${cells[5]}`)
        }
        expect(
            found,
            `tìm 名称 「${k.cctNm}」 phải ra dòng ${k.trtCd}-${k.trtSb} ` +
                `(thấy: ${seen.join(', ') || 'không dòng nào'})`,
        ).toBe(true)

        await resetSearchBoxes()
        await step()
    })

    /**
     * ⚠️ ĐỎ CÓ CHỦ Ý — đặt CUỐI FILE vì `mode: 'serial'` bỏ qua mọi test phía sau
     * test đỏ đầu tiên. Xem khối 「Khối 検索」 ở đầu file để biết chi tiết.
     *
     * WinForm (:2078):  SCORE1 = x OR SCORE2 = x OR SCORE3 = x
     * Web (MstTrtQueries.cs:80-82, tab 個別 không gửi homeVisit):  score1 = x
     *
     * Vị từ hẹp của web sinh ra để chữa lỗi 「400 点 data trên tìm kiếm 600」 của
     * picker 点数モード — đúng cho 点数モード, nhưng 個別 ở WinForm chưa bao giờ hẹp
     * như vậy. Chọn candidate có score1/2/3 KHÁC NHAU ĐÔI MỘT nên tìm theo score2
     * là phép thử sạch: khớp WinForm thì ra dòng, khớp web thì rỗng.
     */
    test('TC-8 [test.fail — lệch WinForm] 点数 phải khớp cả score2/score3, không chỉ score1', async () => {
        test.skip(cand === null, 'không tìm được 処置 đủ điều kiện trong master đang áp dụng')
        // `test.fail()`: ĐANG hỏng là ĐÚNG kỳ vọng ⇒ suite vẫn xanh và khối serial
        // KHÔNG dừng. Ngày nào BE tách vị từ 点数 của 個別 ra khỏi vị từ picker thì
        // Playwright báo 「expected to fail, but passed」 — lúc đó XOÁ dòng này.
        test.fail()
        const c = cand!

        await openKobetuTab()
        await resetSearchBoxes()

        await kobeScoreInput().fill(String(c.score2))
        await kobeSearchButton().click()

        await expect
            .poll(() => kobeRows().count(), {
                message:
                    `tìm 点数 = ${c.score2} (score2 của ${c.trtCd}-${c.trtSb}) không ra dòng nào`,
                timeout: 20_000,
            })
            .toBeGreaterThan(0)

        const n = await kobeRows().count()
        let found = false
        for (let i = 0; i < n; i++) {
            const cells = await kobeRowCells(kobeRows().nth(i))
            if (cells[4] === String(c.trtCd) && cells[5] === String(c.trtSb)) {
                found = true
                break
            }
        }

        expect(
            found,
            `WinForm: ô 点数 của tab 個別 khớp SCORE1 OR SCORE2 OR SCORE3 ` +
                `(frm203002.cs:2078), nên tìm ${c.score2} phải ra dòng ` +
                `${c.trtCd}-${c.trtSb} (score1=${c.score1} score2=${c.score2} ` +
                `score3=${c.score3}). Đang KHÔNG ra vì BE dùng vị từ của 点数モード ` +
                '`m.score1 = @score` (MstTrtQueries.cs:80-82) và tab 個別 không gửi ' +
                'homeVisit. Sửa ở BE: tách vị từ 点数 của 個別 khỏi vị từ picker.',
        ).toBe(true)

        await resetSearchBoxes()
        await step()
    })

    /**
     * ⚠️ test.fail — lệch WinForm ĐÃ ĐO ĐƯỢC, không phải test hỏng.
     *
     * WinForm InputCheckKobe (:2207/:2216) gọi `.Focus()` ngay trên ô hỏng để người
     * dùng sửa tại chỗ. Web CÓ viết đúng ý đó (treatment-side-panel.tsx —
     * `await alertDialog(...)` rồi `box.current?.focus()`), nhưng lời gọi đó bị NUỐT:
     * `DialogShell` (shared/ui/dialog-shell.tsx:86-92) chỉ chặn `onOpenAutoFocus`,
     * KHÔNG chặn `onCloseAutoFocus`, nên Radix trả focus về phần tử trước khi mở
     * dialog — tức là nút 検索 — SAU khi `.focus()` của ta đã chạy.
     *
     * Đo thực tế bằng `document.activeElement` sau khi đóng hộp thoại:
     *     +0ms / +100ms / +300ms → BUTTON 「検索」   (không bao giờ là ô 点数)
     *
     * Hai hướng sửa:
     *   1. Tại chỗ gọi — focus lại SAU khi Radix trả focus (rAF/setTimeout 0).
     *      Gọn, không đụng ai khác, nhưng là chạy đua với vòng đời của Radix.
     *   2. Tại DialogShell — `onCloseAutoFocus={(e) => e.preventDefault()}` để
     *      Radix thôi tự trả focus, ai mở thì người đó tự quyết. Đúng chỗ hơn,
     *      nhưng đổi hành vi focus của MỌI alertDialog/confirmDialog toàn app ⇒
     *      phải rà các luồng đang ngầm dựa vào việc focus được trả về.
     */
    test('TC-9 [test.fail — lệch WinForm] sau E00002 con trỏ phải quay về đúng ô hỏng', async () => {
        test.fail()

        await openKobetuTab()
        await resetSearchBoxes()

        await kobeScoreInput().fill('12a')
        await kobeSearchButton().click()
        await dismissWarning(E00002_TENS)

        await expect(
            kobeScoreInput(),
            'InputCheckKobe gọi txtKobeSearchTens.Focus() ⇒ con trỏ phải nằm trong ô ' +
                '点数 để sửa tại chỗ. Đang nằm ở nút 検索 vì Radix trả focus về ' +
                'trigger sau khi dialog đóng (DialogShell không chặn onCloseAutoFocus).',
        ).toBeFocused({ timeout: 10_000 })

        await resetSearchBoxes()
        await step()
    })
})
