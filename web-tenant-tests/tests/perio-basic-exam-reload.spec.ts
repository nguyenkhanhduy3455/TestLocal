import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    seedTreatmentRows,
    type SeedTrtRow,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 歯周基本検査 — 直近の基本検査表(7999/9)の再読込 (`frm203028.getEppMobility`).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo code web.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (Rule 21 — FACT)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · INP/Forms/frm203028.cs:345-357 — initProc gọi `getEppMobility(...)`. Trả TRUE
 *    thì nạp lưới TỪ BẢN GHI và **KHÔNG đọc KIHONDEF** nữa; trả FALSE mới rơi vào
 *    nhánh `else` đọc デフォルト theo 病名 (`KihonDef.getKihonDefData`).
 *  · :523-604 `getEppMobility` — HAI lượt quét, đúng thứ tự:
 *      1. 当月レコード検索 — duyệt NGƯỢC lưới 診療入力 (`frm203002.GrdRegiData`), chỉ
 *         nhìn dòng `BuiDispFlag == "2"` (dòng 処置; dòng 部位病名 bị bỏ). Gặp dòng
 *         `trt_cd 7999 / trt_sb 9` thì đặt `targetDate = trt_dt` và nhặt dòng chữ.
 *         Sau khi đã có `targetDate`, gặp dòng 処置 có ngày CŨ HƠN ⇒ `break`.
 *      2. 過去月検索 — CHỈ khi lượt 1 không thấy gì: quét ngược `ModSave.trtDataList`
 *         (dữ liệu ĐÃ LƯU, mọi tháng) với cùng điều kiện.
 *    ⇒ Bản ghi của THÁNG HIỆN TẠI luôn thắng bản ghi trong lịch sử.
 *  · :551-566 — phân dòng theo NHÃN: `dsp_trt.IndexOf("ＥＰＰ") >= 0` trước,
 *    `else if IndexOf("動揺度")`. Vì quét NGƯỢC mà `fixProc` ghi 上段 trước 下段, nên
 *    dòng gặp đầu tiên là 下段 → slot[1]; dòng sau là 上段 → slot[0].
 *  · :348-366 — tách bằng `Split('|')`: phần tử 0 là NHÃN, 1..16 là 16 ô.
 *      上段: `_txtEpp[i] = epp[i + 1]`         (i = 0..15)
 *      下段: `_txtEpp[i] = epp[31 - i + 1]`    (i = 31..16)  ← hàng dưới ĐẢO CHIỀU
 *  · :413-443 — SAU khi nạp, vòng 部位 mới quyết định ô: `bui[i] == 0` ⇒ khoá ／;
 *    răng CÓ trong 部位 mà giá trị nạp về là "/" ⇒ xoá thành rỗng.
 *  · :834-880 `fixProc` — 8 dòng ghi ra, theo thứ tự: 基本検査 / ---- / 動揺度上段 /
 *    ＥＰＰ上段 / **歯番** / ＥＰＰ下段 / 動揺度下段 / ----. Ô rỗng ghi ra một dấu cách.
 *  · :896-903 `patRight` — nhãn đệm phải cho đủ **11 byte shift_jis**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN PORT ĐANG KIỂM
 * ═════════════════════════════════════════════════════════════════════════════
 *  - lib/kihon-exam-record.ts
 *      · `findPriorKihonExam(currentMonthRows, savedRows)` — bản port 2 lượt quét.
 *      · `kihonScanRowsFromGrid` — lọc dòng 部位病名 (tương đương BuiDispFlag "2").
 *      · `buildKihonOutData` — bên GHI, dùng chung định dạng với bên ĐỌC.
 *  - components/treatment-entry-detail.tsx — tính `kihonPriorExam` từ HAI nguồn
 *    của WinForm: `currentRows` (= GrdRegiData, tháng hiện tại) và
 *    `treatmentsPage.items` (= ModSave.trtDataList, mọi tháng).
 *  - components/perio-basic-exam-dialog.tsx — `priorExam ?? preset` làm seed lưới.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI CHỤP "ẢNH NỀN" PRESET (TC-0)
 * ═════════════════════════════════════════════════════════════════════════════
 * Nhánh `else` nạp デフォルト theo 病名 từ bảng `kihon_def` — nội dung bảng đó phụ
 * thuộc phòng khám, spec KHÔNG được đoán là rỗng. TC-0 mở dialog khi chưa có bản ghi
 * nào để chụp lại chính preset đó, rồi các TC sau assert `not.toEqual(preset)`.
 * Nhờ vậy nếu `getEppMobility` chết hẳn (luôn trả null) thì test đỏ với thông báo
 * "lưới vẫn đang là preset" chứ không im lặng xanh.
 *
 * ⚠️ Spec KHÔNG bấm F1 デフォルト設定 (đó mới là chỗ GHI `kihon_def`) và KHÔNG bấm
 *    F9 登録 của màn 診療入力. Ghi DB duy nhất là các dòng seed, `afterAll` dọn lại.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU TỰ DỰNG (cần TEST_DB=1)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · TRT_DT  — 2 dòng 部位病名: một mang ĐỦ 32 răng, một chỉ mang 右上 8 răng.
 *    Dialog nhận `bui` của dòng ĐANG FOCUS, nên không seed thì mọi ô bị khoá ／ và
 *    spec xanh giả.
 *  · HIST_DT (mùng 10 tháng trước) — bản ghi 基本検査表 "cũ", để kiểm lượt quét 2.
 *  · Bản ghi 基本検査表 của tháng hiện tại được seed/xoá GIỮA các TC (mode serial).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY CẦN BIẾT
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. Ô lưới mang `data-perio-cell="<kind>-<index>"`, index là **số răng theo WinForm**
 *     `_txtEpp[i]`: 0-15 hàm trên (右上8→左上8), 16-31 hàm dưới nhưng ĐẢO (cột hiển
 *     thị p của hàng dưới là `_txt[31 - p]`). Đừng đếm theo thứ tự DOM.
 *  2. Ô bị khoá là `<input disabled value="/">` — `inputValue()` vẫn đọc được.
 *  3. TC-5 KHÔNG được `page.goto` giữa chừng: nó kiểm dòng CHƯA LƯU do F9 確定 chèn
 *     vào lưới, nạp lại trang là mất sạch.
 *  4. AutoSantei bung 「〜を算定しますか？」 lúc mở màn và nuốt phím —
 *     `installSanteiNo` + `clearOverlays` chép từ `perio-kensa-order.spec.ts`.
 *  5. Một `page.goto` đơn lẻ thỉnh thoảng về mà lưới không mount — `openTreatmentScreen`
 *     thử tối đa 3 lần, giống các spec siga.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19) — LUÔN chạy CẢ FILE, testcase nối tiếp trạng thái
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 npx playwright test tests/perio-basic-exam-reload.spec.ts
 *   TEST_DB=1 npx playwright test tests/perio-basic-exam-reload.spec.ts --headed
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)

/** Mùng 10 tháng trước TRT_DT — ngày cho bản ghi "quá khứ" (lượt quét 2). */
const HIST_DT = (() => {
    const [y, m] = TRT_DT.split('-').map(Number)
    const py = m === 1 ? y! - 1 : y!
    const pm = m === 1 ? 12 : m! - 1
    return `${py}-${String(pm).padStart(2, '0')}-10`
})()

/** `trn_trn.trt_cd` / `trt_sb` của bản ghi 基本検査表 (frm203028 fixProc:827-828). */
const KIHON_TRT_CD = 7999
const KIHON_TRT_SB = 9
const TOOTH_COUNT = 32
/** Số răng mỗi dòng bản ghi — 上段 rồi 下段. */
const TEETH_PER_LINE = 16
/** `patRight` đệm nhãn cho đủ 11 byte shift_jis (frm203028.cs:896). */
const LABEL_BYTE_WIDTH = 11
const SEP = '|'

/** Nhãn lấy từ Designer của frm203028 (lblEppUp / lblDouyoUp / **歯番**). */
const LABEL_EPP = 'ＥＰＰ(mm) '
const LABEL_DOUYOU = '動揺度'
const LABEL_TOOTH = '**歯番**'
const KIHON_HEADER = '基本検査'
const KIHON_DIVIDER = '-'.repeat(44)
/** Lề trái cột 療法・処置 mà `frmCmt2_Set_Data` gắn vào mọi dòng カルテ (CommonInp.REGIRYO_PADLEFT). */
const REGIRYO_PADLEFT = '  '

/** 歯周炎 — 部位病名行 chỉ cần một 病名 bất kỳ để mapper dựng được dòng. */
const SEED_DIS_CD = 103
/** `dsp_dis` của dòng 部位病名 ĐỦ 32 răng — cũng là chuỗi để locate. */
const SEED_DIS_FULL = '基検再読込全顎Ｐ'
/** `dsp_dis` của dòng 部位病名 CHỈ 右上 8 răng — dùng cho TC-4. */
const SEED_DIS_PART = '基検再読込右上Ｐ'
/** `dsp_trt` của hai dòng 部位病名 — chỉ dùng để dọn; dòng 病名-only không in nó ra. */
const SEED_NM_FULL = '基検再読込テスト行全顎'
const SEED_NM_PART = '基検再読込テスト行右上'

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
const realAlert = (page: Page) => page.locator('[role="alertdialog"]')

/** frm203011 — lưới nút group. Nhận diện bằng nút PCR (không dialog nào khác có). */
const groupGrid = (page: Page) =>
    anyDialog(page).filter({ has: page.getByRole('button', { name: /PCR/ }) })

const kihonDialog = (page: Page) => anyDialog(page).filter({ hasText: '歯 周 基 本 検 査' })

/** Ô lưới theo tên WinForm `_txtEpp[i]` / `_txtDouyo[i]` — xem BẪY 1. */
const cell = (dialog: Locator, kind: 'epp' | 'douyou', index: number) =>
    dialog.locator(`[data-perio-cell="${kind}-${index}"]`)

const SANTEI_CONFIRM = /を算定しますか？/

/** Trả lời **No** cho 「〜を算定しますか？」 (Rule 14) — chép từ perio-kensa-order.spec.ts. */
const installSanteiNo = async (page: Page) => {
    await page.addLocatorHandler(
        page.getByText(SANTEI_CONFIRM).first(),
        async () => {
            await anyDialog(page)
                .filter({ hasText: SANTEI_CONFIRM })
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click({ timeout: 3000 })
                .catch(() => {})
        },
        { times: 30 },
    )
}

const drainAlerts = async (page: Page) => {
    for (let i = 0; i < 10; i++) {
        if ((await realAlert(page).count()) === 0) return
        const btn = realAlert(page).locator('button', { hasText: /^(OK|Yes)$/ })
        if ((await btn.count()) === 0) return
        await btn.first().click()
        await page.waitForTimeout(400)
    }
}

const clearOverlays = async (page: Page) => {
    for (let i = 0; i < 12; i++) {
        await drainAlerts(page)
        const santei = anyDialog(page).filter({ hasText: SANTEI_CONFIRM })
        if (await santei.count()) {
            await expect(santei)
                .toHaveCount(0, { timeout: 10000 })
                .catch(() => {})
            continue
        }
        if ((await anyDialog(page).count()) === 0) {
            await page.waitForTimeout(1500)
            if ((await anyDialog(page).count()) === 0) return
            continue
        }
        await page.keyboard.press('F10')
        await page.waitForTimeout(600)
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Dựng lại ĐỊNH DẠNG bản ghi 基本検査表 độc lập với app (frm203028 fixProc)
// ═════════════════════════════════════════════════════════════════════════════

/** Độ dài shift_jis: chữ Nhật toàn角 = 2 byte, ASCII / kana bán角 = 1 byte. */
const sjisByteLength = (s: string): number => {
    let n = 0
    for (const ch of s) {
        const code = ch.codePointAt(0)!
        n += code <= 0x7f || (code >= 0xff61 && code <= 0xff9f) ? 1 : 2
    }
    return n
}

const padRightSjis = (s: string, width: number): string =>
    s + ' '.repeat(Math.max(0, width - sjisByteLength(s)))

/** Chỉ số `_txt` của 16 cột hàng trên / hàng dưới (hàng dưới ĐẢO — fixProc:865-878). */
const UPPER_COLS = Array.from({ length: TEETH_PER_LINE }, (_, p) => p)
const LOWER_COLS = Array.from({ length: TEETH_PER_LINE }, (_, p) => 31 - p)

/** Một dòng bản ghi: nhãn đệm 11 byte + 16 ô (ô rỗng ghi ra một dấu cách). */
const kihonLine = (label: string, indices: number[], arr: readonly string[]): string => {
    const cells = indices.map((i) => (arr[i]!.trim() === '' ? ' ' : arr[i]!))
    return `${padRightSjis(label, LABEL_BYTE_WIDTH)}${SEP}${cells.join(SEP)}${SEP}`
}

const TOOTH_NUMBER_LINE =
    `${padRightSjis(LABEL_TOOTH, LABEL_BYTE_WIDTH)}${SEP}` +
    `${['8', '7', '6', '5', '4', '3', '2', '1', '1', '2', '3', '4', '5', '6', '7', '8'].join(SEP)}${SEP}`

/** 8 dòng `fixProc` đẩy vào `outData`, đúng thứ tự tài liệu. */
const kihonOutData = (epp: readonly string[], douyou: readonly string[]): string[] => [
    KIHON_HEADER,
    KIHON_DIVIDER,
    kihonLine(LABEL_DOUYOU, UPPER_COLS, douyou),
    kihonLine(LABEL_EPP, UPPER_COLS, epp),
    TOOTH_NUMBER_LINE,
    kihonLine(LABEL_EPP, LOWER_COLS, epp),
    kihonLine(LABEL_DOUYOU, LOWER_COLS, douyou),
    KIHON_DIVIDER,
]

/** 8 dòng đó thành 8 `SeedTrtRow` — giống hệt dữ liệu app tự ghi (có lề trái). */
const kihonRecordRows = (epp: readonly string[], douyou: readonly string[]): SeedTrtRow[] =>
    kihonOutData(epp, douyou).map((line) => ({
        trtCd: KIHON_TRT_CD,
        trtSb: KIHON_TRT_SB,
        trtPt: 0,
        trtCnt: 1,
        dspTrt: REGIRYO_PADLEFT + line,
    }))

// ── giá trị mẫu ──────────────────────────────────────────────────────────────
// Giá trị PHỤ THUỘC VỊ TRÍ: chỉ cần sai một bước ánh xạ (đảo hàng dưới, lệch 1 vì
// cột nhãn, lẫn ＥＰＰ với 動揺度) là mảng đọc về khác ngay.
const eppPattern = (offset: number): string[] =>
    Array.from({ length: TOOTH_COUNT }, (_, i) => String(((i + offset) % 9) + 1))
/** 動揺度 chỉ 0..3 (chkInputData chặn > 3). */
const douyouPattern = (offset: number): string[] =>
    Array.from({ length: TOOTH_COUNT }, (_, i) => String((i + offset) % 4))

const OLD_EPP = eppPattern(0)
const OLD_DOUYOU = douyouPattern(0)
const NEW_EPP = eppPattern(4)
const NEW_DOUYOU = douyouPattern(2)

const blank32 = (): string[] => Array.from({ length: TOOTH_COUNT }, () => '')

/** 部位 ĐỦ 32 răng. */
const BUI_FULL = Array.from({ length: TOOTH_COUNT }, () => 1)
/** 部位 CHỈ 右上 8 răng: bui[0..7] — ánh xạ sang `_txt` 0..7 (i < 16 ⇒ bui[i]). */
const BUI_UPPER_RIGHT = Array.from({ length: TOOTH_COUNT }, (_, i) => (i < 8 ? 1 : 0))
/** `_txt` index có mặt khi 部位 là BUI_UPPER_RIGHT. */
const PRESENT_UPPER_RIGHT = new Set([0, 1, 2, 3, 4, 5, 6, 7])

const buiLineRow = (bui: readonly number[], dspDis: string, dspTrt: string): SeedTrtRow => ({
    trtCd: 0,
    trtSb: 0,
    trtPt: 0,
    trtCnt: 0,
    dspTrt,
    bui,
    dspBui: '全顎',
    disCd: [SEED_DIS_CD],
    disSb: [0],
    dspDis,
})

const BUI_ROWS: SeedTrtRow[] = [
    buiLineRow(BUI_FULL, SEED_DIS_FULL, SEED_NM_FULL),
    buiLineRow(BUI_UPPER_RIGHT, SEED_DIS_PART, SEED_NM_PART),
]

if (!dbEnabled) {
    console.log(
        '\n⚠️  perio-basic-exam-reload.spec.ts BỎ QUA TOÀN BỘ testcase — thiếu TEST_DB=1\n' +
            '   (cần seed 部位病名行 + bản ghi 基本検査表 7999/9; không seed thì lưới\n' +
            '    luôn rơi về preset và mọi assert vô nghĩa)\n' +
            '   Chạy bằng:  TEST_DB=1 npx playwright test tests/perio-basic-exam-reload.spec.ts\n',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 部位病名行 và bản ghi 基本検査表')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('歯周基本検査 — 基本検査表の再読込 (getEppMobility)', () => {
    let page: Page
    let step: () => Promise<void>

    /**
     * Lưới lúc CHƯA có bản ghi nào = デフォルト theo 病名. Chụp ở TC-0.
     *
     * Rỗng nghĩa là CHƯA chụp được (TC-0 hỏng, hoặc đang chạy `--repeat-each` mà
     * lượt trước đứt giữa chừng) — khi đó TC-1 bỏ qua phép so phụ trợ thay vì so
     * với giá trị rò rỉ của lượt trước. `beforeAll` xoá lại để không lượt nào
     * thừa hưởng ảnh nền của lượt khác.
     */
    let presetEpp: string[] = []
    let presetDouyou: string[] = []

    test.beforeAll(async ({ browser }) => {
        presetEpp = []
        presetDouyou = []

        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        console.log(
            `tháng ${TRT_DT} của BN ${PAT_NO} đang có ${realRows} 処置行 THẬT. ` +
                'Spec KHÔNG bấm F9 登録 nên không ghi lại chúng.',
        )
        console.log(`bản ghi "quá khứ" sẽ seed vào ${HIST_DT}`)

        // TC-0 là ảnh nền: bắt đầu từ trạng thái KHÔNG có bản ghi nào.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, BUI_ROWS)
        await deleteTreatmentRows(Number(PAT_NO), HIST_DT)

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        await installSanteiNo(page)

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(
            page,
            'login không vào được — chạy nhiều lần liên tiếp thì đang dính rate-limit, ' +
                'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
        ).toHaveURL(/\/$/)
    })

    test.afterAll(async () => {
        await page?.close()
        // Chỉ dọn vùng seed (disp_no >= 9000) + chữ ký dòng spec tự dựng. KHÔNG dọn
        // theo trt_cd 7999: mã đó là カルテコメント dùng chung, xoá theo mã sẽ cuốn
        // theo cả PCR / ghi chú THẬT của bệnh nhân trong đúng ngày đó.
        const n =
            (await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)) +
            (await deleteTreatmentRows(Number(PAT_NO), HIST_DT).catch(() => 0)) +
            (await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, 0, [
                SEED_NM_FULL,
                SEED_NM_PART,
            ]).catch(() => 0)) +
            (await deleteTreatmentRowsByBui(Number(PAT_NO), TRT_DT, 1, 1).catch(() => 0))
        console.log(`dọn: xoá ${n} dòng seed`)
    })

    /** Nạp màn 診療入力, thử lại nếu lưới không lên (BẪY 5). */
    const openTreatmentScreen = async () => {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(ryoCell(page).first(), 'lưới 診療入力 không nạp được').toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
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
     * Focus dòng 部位病名 mang `dspDis` rồi F6 → カルテ記載選択 → 基本検査.
     * KHÔNG nạp lại trang — TC-5 phụ thuộc vào việc giữ nguyên dòng chưa lưu (BẪY 3).
     */
    const openKihonOn = async (dspDis: string) => {
        const seeded = ryoCell(page).filter({ hasText: dspDis }).first()
        await expect(
            seeded,
            `không thấy 部位病名行 「${dspDis}」 — seed hỏng hoặc màn hình đang mở tháng ` +
                `khác (TEST_TRT_DT = ${TRT_DT})`,
        ).toBeVisible({ timeout: 30000 })
        await seeded.click()
        await step()

        await page.keyboard.press('F6')
        await expect(
            groupGrid(page),
            'F6 không mở được カルテ記載選択 — dòng focus có thuộc tháng hiện tại không?',
        ).toBeVisible({ timeout: 20000 })

        await groupGrid(page)
            .getByRole('button', { name: /基本検査/ })
            .click()
        await expect(kihonDialog(page), 'không mở được 歯周基本検査').toBeVisible({
            timeout: 20000,
        })
        await step()
        return kihonDialog(page)
    }

    /** Nạp lại màn hình (đọc lại dữ liệu vừa seed) rồi mở 基本検査 trên dòng chỉ định. */
    const reloadAndOpenKihon = async (dspDis: string) => {
        await openTreatmentScreen()
        await clearOverlays(page)
        return openKihonOn(dspDis)
    }

    /** Đọc cả 32 ô của một hàng đo. Ô bị khoá trả về "/" (BẪY 2). */
    const readRow = async (d: Locator, kind: 'epp' | 'douyou'): Promise<string[]> => {
        await expect(cell(d, kind, 0), `ô ${kind}-0 chưa render`).toBeVisible({ timeout: 20000 })
        const out: string[] = []
        for (let i = 0; i < TOOTH_COUNT; i++) out.push(await cell(d, kind, i).inputValue())
        return out
    }

    const closeKihon = async () => {
        await page.keyboard.press('F10')
        await expect(kihonDialog(page), 'F10 không đóng được 歯周基本検査').toHaveCount(0, {
            timeout: 10000,
        })
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TC-0 — ảnh nền: chưa có bản ghi nào ⇒ lưới là デフォルト theo 病名
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-0 (ảnh nền) — không có 基本検査表 nào ⇒ lưới nạp từ デフォルト (nhánh else của initProc)', async () => {
        const d = await reloadAndOpenKihon(SEED_DIS_FULL)

        presetEpp = await readRow(d, 'epp')
        presetDouyou = await readRow(d, 'douyou')
        console.log(`preset ＥＰＰ  = ${JSON.stringify(presetEpp)}`)
        console.log(`preset 動揺度 = ${JSON.stringify(presetDouyou)}`)

        // 部位 mang đủ 32 răng ⇒ vòng :413-443 không được khoá ô nào.
        expect(
            presetEpp.filter((v) => v === '/'),
            '部位 seed đủ 32 răng nên KHÔNG ô nào được khoá ／ — seed hỏng hoặc dialog ' +
                'không nhận được bui của dòng đang focus',
        ).toHaveLength(0)

        await closeKihon()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-1 — lượt quét 2: 過去月検索 (`ModSave.trtDataList`)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-1 — bản ghi ở THÁNG TRƯỚC vẫn nạp lại được (過去月検索, :571-602)', async () => {
        await seedTreatmentRows(Number(PAT_NO), HIST_DT, kihonRecordRows(OLD_EPP, OLD_DOUYOU))

        const d = await reloadAndOpenKihon(SEED_DIS_FULL)
        const epp = await readRow(d, 'epp')
        const douyou = await readRow(d, 'douyou')

        if (presetEpp.length === TOOTH_COUNT) {
            expect(
                [...OLD_EPP],
                'giá trị mẫu trùng luôn preset thì TC này không chứng minh được gì — đổi eppPattern',
            ).not.toEqual(presetEpp)
        }

        expect(
            epp,
            'lưới ＥＰＰ phải nạp từ bản ghi 基本検査表 của tháng trước. Nếu nó đang bằng ' +
                `preset ${JSON.stringify(presetEpp)} thì getEppMobility không chạy; nếu 16 ô ` +
                'dưới lệch thì sai chỗ đảo chiều hàng dưới (`epp[31 - i + 1]`, :361-364)',
        ).toEqual(OLD_EPP)
        expect(douyou, 'lưới 動揺度 phải nạp từ cùng bản ghi đó').toEqual(OLD_DOUYOU)

        await closeKihon()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-2 — lượt quét 1 thắng lượt quét 2
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-2 — có bản ghi THÁNG HIỆN TẠI thì nó thắng bản ghi quá khứ (当月検索 chạy trước)', async () => {
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            ...BUI_ROWS,
            ...kihonRecordRows(NEW_EPP, NEW_DOUYOU),
        ])

        const d = await reloadAndOpenKihon(SEED_DIS_FULL)
        const epp = await readRow(d, 'epp')
        const douyou = await readRow(d, 'douyou')

        expect(
            epp,
            'getEppMobility quét lưới tháng hiện tại TRƯỚC (:530-568) và chỉ khi trắng tay mới ' +
                `đụng tới dữ liệu đã lưu. Đọc về ${JSON.stringify(OLD_EPP)} nghĩa là hai lượt ` +
                'quét bị đảo thứ tự',
        ).toEqual(NEW_EPP)
        expect(douyou).toEqual(NEW_DOUYOU)

        await closeKihon()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-3 — ánh xạ hàng dưới (chỗ dễ sai nhất)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-3 — hàng dưới ĐẢO CHIỀU: ô duy nhất có giá trị phải về đúng răng 31, không phải 16', async () => {
        // Bản ghi chỉ đặt MỘT ô: `_txt` 31 (右下8). `fixProc` ghi hàng dưới theo thứ tự
        // 31→16 nên nó nằm ở cột 1 của dòng ＥＰＰ下段; đọc lại phải quay về đúng 31.
        const epp = blank32()
        epp[31] = '7'
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            ...BUI_ROWS,
            ...kihonRecordRows(epp, blank32()),
        ])

        const d = await reloadAndOpenKihon(SEED_DIS_FULL)

        await expect(
            cell(d, 'epp', 31),
            'ô cột 1 của ＥＰＰ下段 phải quay về `_txtEpp[31]` (`epp[31 - i + 1]`, i = 31 ⇒ epp[1])',
        ).toHaveValue('7')
        await expect(
            cell(d, 'epp', 16),
            'răng 16 (左下8) phải rỗng — nếu nó mang "7" thì hàng dưới bị đọc XUÔI thay vì ĐẢO',
        ).toHaveValue('')

        expect(await readRow(d, 'epp'), 'chỉ đúng một ô được có giá trị').toEqual(epp)

        await closeKihon()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-4 — 部位 quyết định SAU khi nạp (:413-443)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-4 — 部位 lọc sau khi nạp: răng ngoài 部位 bị khoá ／, "／" trong bản ghi thành rỗng', async () => {
        // Bản ghi có giá trị cho CẢ 32 răng, riêng `_txt` 3 để "/" (răng này CÓ trong
        // 部位 右上) — WinForm :421-424 phải xoá nó thành rỗng chứ không giữ ／.
        const epp = eppPattern(1)
        epp[3] = '/'
        const douyou = douyouPattern(3)
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            ...BUI_ROWS,
            ...kihonRecordRows(epp, douyou),
        ])

        // Lần này focus dòng 部位病名 CHỈ có 右上 8 răng.
        const d = await reloadAndOpenKihon(SEED_DIS_PART)
        const gotEpp = await readRow(d, 'epp')
        const gotDouyou = await readRow(d, 'douyou')

        const wantEpp = Array.from({ length: TOOTH_COUNT }, (_, i) =>
            PRESENT_UPPER_RIGHT.has(i) ? (epp[i] === '/' ? '' : epp[i]!) : '/',
        )
        const wantDouyou = Array.from({ length: TOOTH_COUNT }, (_, i) =>
            PRESENT_UPPER_RIGHT.has(i) ? douyou[i]! : '/',
        )

        expect(
            gotEpp,
            'vòng 部位 (:413-443) chạy SAU khi nạp bản ghi: răng có bui = 0 phải bị khoá ／ ' +
                'dù bản ghi có số, và răng CÓ trong 部位 mà bản ghi ghi "/" phải thành rỗng',
        ).toEqual(wantEpp)
        expect(gotDouyou).toEqual(wantDouyou)

        await expect(
            cell(d, 'epp', 3),
            '"/" của bản ghi trên một răng ĐANG CÓ trong 部位 phải bị xoá thành rỗng (:421-424)',
        ).toBeEnabled()
        await expect(
            cell(d, 'epp', 8),
            'răng ngoài 部位 phải bị vô hiệu hoá (:445-455 入力欄の非活性)',
        ).toBeDisabled()

        await closeKihon()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-5 — vòng ghi→đọc trong CÙNG PHIÊN, dòng CHƯA LƯU
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-5 — F9 確定 rồi mở lại: lưới nạp từ dòng vừa chèn (chưa lưu DB) chứ không phải preset', async () => {
        // Xoá bản ghi của tháng hiện tại, GIỮ bản ghi quá khứ: mở lại phải lấy dòng
        // vừa chèn trong phiên (lượt quét 1) chứ không rơi về bản ghi cũ (lượt 2).
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, BUI_ROWS)

        const d = await reloadAndOpenKihon(SEED_DIS_FULL)

        // Ba ô lệch nhau về vị trí — đủ để lộ mọi kiểu ánh xạ sai khi đọc lại.
        await cell(d, 'epp', 0).fill('9')
        await cell(d, 'epp', 31).fill('8')
        await cell(d, 'douyou', 15).fill('2')
        await step()

        const beforeEpp = await readRow(d, 'epp')
        const beforeDouyou = await readRow(d, 'douyou')

        await d
            .getByRole('button', { name: /確定/ })
            .click()
        await expect(
            kihonDialog(page),
            'F9 確定 phải đóng cả 歯周基本検査 lẫn カルテ記載選択 (frm203011 this.Close())',
        ).toHaveCount(0, { timeout: 20000 })
        await expect(groupGrid(page)).toHaveCount(0, { timeout: 20000 })
        await drainAlerts(page)
        await step()

        // KHÔNG page.goto ở đây — dòng vừa chèn chưa lưu DB (BẪY 3).
        const d2 = await openKihonOn(SEED_DIS_FULL)
        const afterEpp = await readRow(d2, 'epp')
        const afterDouyou = await readRow(d2, 'douyou')

        await expect(
            cell(d2, 'epp', 0),
            'ô vừa gõ phải quay về đúng răng 0 sau khi đọc lại bản ghi vừa chèn',
        ).toHaveValue('9')
        await expect(cell(d2, 'epp', 31), 'ô hàng dưới phải quay về đúng răng 31').toHaveValue('8')
        await expect(cell(d2, 'douyou', 15), '動揺度 phải quay về đúng răng 15').toHaveValue('2')

        expect(
            afterEpp,
            'mở lại phải dựng LẠI Y NGUYÊN lưới lúc bấm 確定 — lệch nghĩa là định dạng bên ' +
                'ghi (buildKihonOutData) và bên đọc (findPriorKihonExam) đã trôi khỏi nhau',
        ).toEqual(beforeEpp)
        expect(afterDouyou).toEqual(beforeDouyou)

        expect(
            afterEpp,
            'dòng của phiên (lượt quét 1) phải thắng bản ghi tháng trước (lượt quét 2)',
        ).not.toEqual(OLD_EPP)

        await closeKihon()
        await step()
    })
})
