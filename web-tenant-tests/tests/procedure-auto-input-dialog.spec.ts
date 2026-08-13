import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { cells, emptyState, rows as gridRows } from './virtual-grid'

/**
 * 処置自動入力一覧 (frm203040) và 処置自動入力登録 (frm203041) — màn 一覧 + dialog
 * 登録 vừa được port.
 *
 *   F11 → 9 オプション → 5 処置自動入力登録  →  一覧  →  F1 追加 / F9 選択  →  登録
 *
 * `mst_trt_auto` trả lời câu "nhập 処置 này thì thêm luôn những 処置 nào", tức là
 * nguồn của 自動算定２ lúc 診療入力. Một 処置 có thể đăng ký NHIỀU lần, phân biệt
 * bằng 順序 — đây là điểm khác căn bản so với 必要病名 / 自動算定 (mỗi 処置 một dòng).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Nguồn WinForm
 * ═══════════════════════════════════════════════════════════════════════════
 * frm203040.cs (一覧)
 *  - getViewData (:247-271)      mở ra là nạp ngay; 0 dòng → E00003.
 *  - _viewItem (:48-79)          BA MƯƠI cột: 10 cột của bản đăng ký + 5 cặp
 *                                (病名コードN, 病名N) + 5 cặp (処置コードN, 処置名N).
 *  - MstTrt.getMstTrtDataTrtAuto (MstTrt.cs:2055-2183):
 *      · LEFT JOIN ⇒ 処置 CHƯA đăng ký vẫn hiện, mọi ô sau 処置名 để trống. Đó là
 *        cách duy nhất để chọn được một 処置 chưa cấu hình.
 *      · `WHERE trt.trt_cd >= 100` (:2183) — **ngược với 必要病名一覧** vốn dùng
 *        `WHERE 0 = 0`. Copy nhầm một trong hai là sai ngay ⇒ TC-LIST-2 khoá.
 *      · 算定時期 / 老人 / 一般 / ６末 bind `codmst.any_val1`, tức NHÃN chứ không
 *        phải mã số.
 *  - defData (:287-349)          F9 選択: 順序 rỗng → Insert, có 順序 → Update.
 *                                F1 追加: luôn Insert; 順序 = max+1 trong CÙNG 処置,
 *                                và = 0 nếu 処置 đó chưa có bản nào. Số đó lấy từ
 *                                LƯỚI, không phải từ DB (:327-338).
 *
 * frm203041.cs (登録)
 *  - dspData (:365-433)          Insert: focus 順序, TẮT F8 削除 (:378, :426).
 *                                Update: nạp bản ghi rồi `txtSeq.Enabled = false`
 *                                (:420) — 順序 là một phần của khoá.
 *  - chgLimitCntEnable (:301-312) 制限回数 chỉ bật khi 算定時期 = 日一回 (mã 4);
 *                                các giá trị khác lưu 0 (:687-695).
 *  - lblDisCd_Click (:150-171)   mở 病名検索 với `cdKbn.hundredOrAbove` (:155).
 *  - lblTrtCd_Click (:212-233)   mở 処置検索 với `cdKbn.mstTrtOnly` (:217).
 *  - txtDisCd_Leave (:178-205)   < 100 → xoá trắng cặp ô, KHÔNG báo lỗi; tra
 *                                không ra cũng xoá trắng.
 *  - txtTrtCd/SbLeave (:240-286) xử theo CẶP: thiếu một nửa thì xoá cả ba ô.
 *  - chkInputData (:518-612)     年齢制限 下限 > 上限 → E00002; 処置コード thiếu
 *                                枝番 → E00001「処置サブコード」 và ngược lại.
 *  - :614-631                    順序 còn sửa được (= Insert) và đã tồn tại →
 *                                Q00005; còn lại → Q00002.
 *  - Designer MaxLength          順序 8 / 制限回数 2 / 年齢制限 3 / mọi ô mã 3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Hai scope của popup tra master — điểm dễ port sai nhất
 * ═══════════════════════════════════════════════════════════════════════════
 * 処置検索 / 病名検索 là màn DÙNG CHUNG, mỗi form gọi kèm một `cdKbn` khác nhau.
 * Bản port ban đầu hardcode scope rộng nhất, nên dialog này chào mời cả những
 * dòng mà chính nó sẽ từ chối lúc lưu. Đo trên máy thật (2026-08-13):
 *
 *   処置検索  scope=0 mstCmtInclude → 1.764 dòng, 100 dòng mã 700..899 (摘要マスタ)
 *             scope=1 mstTrtOnly   → 1.664 dòng,   0 dòng mã 700..899
 *   病名検索  scope=0 all          →   397 dòng, mã nhỏ nhất 1   (37 dòng < 100)
 *             scope=1 hundredOrAbove →  360 dòng, mã nhỏ nhất 100 (0 dòng < 100)
 *
 * Khác biệt nằm ở DỮ LIỆU trả về nên khoá được bằng response, không phải bằng
 * cách đếm dòng trong lưới ảo hoá ⇒ TC-TRT-SCOPE-1 / TC-DIS-SCOPE-1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ghi DB
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG có, và đó là chủ ý. Mọi testcase liên quan tới F9 登録 đều dừng lại ở HỘP
 * XÁC NHẬN rồi bấm **No** — `handleRegister` chỉ gọi mutation SAU khi confirm trả
 * true, nên huỷ ở đó là không có request nào bay ra. Nhờ vậy khoá được cả nhánh
 * Q00002 lẫn Q00005 mà không cần `TEST_ALLOW_SAVE` / `TEST_DB` và không phải dọn
 * `mst_trt_auto`. F8 削除 KHÔNG được đụng tới vì nó xoá thật.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `getByRole(..., { name })` khớp CHUỖI CON: `'病名コード 1'` trúng luôn ô của
 *     các slot khác nếu có 2 chữ số. Ở đây chỉ 5 slot nên chưa gặp, nhưng mọi
 *     locator theo aria-label vẫn `exact: true` cho đồng nhất với các spec khác.
 *  2. `F10 戻る` có ở CẢ popup, dialog 登録 lẫn màn 一覧 ⇒ luôn scope theo phần tử.
 *     `F9` thì tách được vì nhãn khác nhau: 一覧「F9 選択」, 登録「F9 登録」,
 *     popup「F9 選択」 (nhưng popup luôn được scope riêng).
 *  3. Khi `alertDialog` / `confirmDialog` (Radix AlertDialog) mở, nó gắn
 *     `aria-hidden` lên phần còn lại của trang ⇒ MỌI `getByRole('dialog')` ngừng
 *     khớp. Phải ĐỌC + ĐÓNG hộp trước rồi mới soi lại dialog 登録.
 *  4. Ô mã là `type="text"` + `inputMode="numeric"` (HTML bỏ qua `maxLength` trên
 *     `type="number"`) ⇒ dùng `getByRole('textbox')`, KHÔNG phải `spinbutton`.
 *     Riêng ô lọc 処置コード trên màn 一覧 vẫn là `type="number"` ⇒ `spinbutton`.
 *  5. Ba combo 老人 / 一般 / ６末 dùng ký tự ６ TOÀN PHẦN. Gõ nhầm nửa phần là
 *     "không tìm thấy" mà nhìn mắt thường không ra.
 *  6. 一覧 nạp ~1.664 dòng × 30 cột. Luôn lọc 処置コード trước khi chọn dòng.
 *  8. `staleTime: 5 phút` (queries/master-search-queries.ts) ⇒ mở LẠI cùng một
 *     popup với cùng điều kiện trong 5 phút KHÔNG phát sinh request nào,
 *     react-query trả thẳng từ cache. `waitForResponse` ở lượt thứ hai treo hết
 *     60s rồi đỏ ở chỗ chẳng liên quan (đã dính đúng lần chạy đầu, 2026-08-13).
 *     Vì thế chỉ TC-*-SCOPE-1 — lượt mở ĐẦU TIÊN — mới đọc response; nó cất luôn
 *     dữ liệu lại cho TC-*-PICK-1 dùng, còn PICK thì mở popup và chỉ chờ LƯỚI.
 *  7. Dữ liệu đăng ký trên máy dev rất ít (3 bản). Spec KHÔNG hardcode mã nào —
 *     nó đọc response của 一覧 rồi tự chọn một 処置 đã đăng ký và một 処置 chưa,
 *     và `skipWithReason` nếu máy không có. Bài học từ `master-search-dialogs`:
 *     testcase chỉ đáng tin bằng cái fact nó bám vào.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Cách chạy
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/procedure-auto-input-dialog.spec.ts --retries=0
 *
 * `--retries=0` vì retry chạy lại CẢ khối serial ⇒ thêm một lần login. Chạy CẢ
 * FILE, đừng `-g` một testcase lẻ: khối serial dùng chung một page và thứ tự CÓ
 * Ý NGHĨA (TC-LIST-1 lấy dữ liệu cho gần như mọi testcase sau).
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

const GRID_LOAD_TIMEOUT = 60_000

// ── Endpoint của màn này ─────────────────────────────────────────────────────
const MASTERS_URL = /\/tenant\/trt-autos\/masters(\?|$)/
const TRT_SEARCH_URL = /\/tenant\/master-search\/treatments(\?|$)/
const DIS_SEARCH_URL = /\/tenant\/master-search\/diseases(\?|$)/

/** Nhãn menu, nguyên văn từ F11_MENU_ITEMS (lib/treatment-entry-shared.ts:613). */
const MENU_OPTIONS = '9 オプション'
const MENU_PROCEDURE_AUTO_INPUT = '5 処置自動入力登録'

/** TrtAutoSlots — 5 必要病名 + 5 必要処置. */
const SLOT_COUNT = 5

/** TrtCodeRange.CodeType.Treat — sàn 処置コード của 一覧 (MstTrt.cs:2183). */
const TRT_CODE_FLOOR = 100
/** TrtCodeRange.CodeType.Receipt — dải 摘要マスタ, thứ scope mstTrtOnly phải loại. */
const RECEIPT_CODE_MIN = 700
const RECEIPT_CODE_MAX = 899

/** TrtAutoCodes.JikiOnceADay — 算定時期 duy nhất bật 制限回数. */
const JIKI_ONCE_A_DAY_LABEL = '日一回'

/** ja.E00001 — 「{0}が入力されていません。」 */
const E00001 = (field: string) => `${field}が入力されていません。`
/** ja.E00002 — 「{0}が間違っています。」 */
const E00002 = (field: string) => `${field}が間違っています。`
/** ja.Q00002 — confirm chung khi lưu. */
const Q00002 = '更新してよろしいですか？'
/** ja.Q00005 — 順序 đã tồn tại (MSGTBL lấy từ SIM2000, 2026-08-13). */
const Q00005 = (field: string) => `${field}は既に登録されています。更新してよろしいですか？`

/** Mã 病名 chắc chắn dưới sàn 100 ⇒ blur phải xoá trắng. */
const BELOW_FLOOR_CODE = '99'
/** Mã chắc chắn KHÔNG có trong master ⇒ blur phải xoá trắng. */
const UNKNOWN_CODE = '997'

/** Một dòng của `GET /tenant/trt-autos/masters`. */
interface TrtAutoMasterRowWire {
    trtCd: number
    trtSb: number
    trtNm: string
    seq?: number | null
    jiki?: number | null
    jikiLabel?: string | null
    limitCnt?: number | null
    oldSt?: number | null
    oldEd?: number | null
    diseases: { slot: number; disCd?: number | null; disNm?: string | null }[]
    treatments: { slot: number; trtCd?: number | null; trtSb?: number | null; trtNm?: string | null }[]
}

/** Một dòng của `GET /tenant/master-search/treatments`. */
interface TrtSearchRowWire {
    dspCd: string
    trtCd: number
    trtSb: number
    trtNm: string
    cctNm: string
    score1: number
}

/** Một dòng của `GET /tenant/master-search/diseases`. */
interface DisSearchRowWire {
    dspCd: string
    disCd: number
    disSb: number
    disNm: string
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('処置自動入力 — 一覧 (frm203040) / 登録 (frm203041)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu 選択 của F11. Lọc theo '1 メニュー' để không dính submenu. */
    let rowMenu: Locator
    /** Màn 一覧 chiếm toàn màn hình (không phải dialog). */
    let list: Locator
    /** Dialog 登録. */
    let register: Locator
    /** Hai popup tra master, mở từ dialog 登録. */
    let trtSearch: Locator
    let disSearch: Locator

    /** Toàn bộ dòng 一覧, bắt ở TC-LIST-1 và dùng lại cho mọi testcase sau. */
    let masterRows: TrtAutoMasterRowWire[] = []
    /** Một 処置 ĐÃ đăng ký (seq khác null) — nguồn cho nhánh Update. */
    let registered: TrtAutoMasterRowWire | null = null
    /** Một 処置 CHƯA đăng ký (seq null) — nguồn cho nhánh Insert. */
    let unregistered: TrtAutoMasterRowWire | null = null

    /**
     * Kết quả hai popup, bắt ở TC-*-SCOPE-1 và dùng lại ở TC-*-PICK-1.
     *
     * Cất lại chứ không đọc lần nữa vì lượt mở thứ hai KHÔNG phát sinh request
     * (bẫy 8). Với 処置 thì đây còn là nguồn DUY NHẤT biết tên NGẮN: lưới hiển thị
     * `cctNm` (tên dài) trong khi ô nhận `trtNm` (tên ngắn).
     */
    let disSearchRows: DisSearchRowWire[] = []
    let trtSearchRows: TrtSearchRowWire[] = []

    // ── Helper dùng chung ────────────────────────────────────────────────────

    /**
     * `true` nếu locator HIỆN RA trong `timeout`.
     *
     * KHÔNG dùng `locator.isVisible({ timeout })`: nó soi DOM ngay lúc gọi và trả
     * về liền, `timeout` chỉ bó thao tác nội bộ chứ không chờ phần tử xuất hiện.
     */
    async function appeared(locator: Locator, timeout: number): Promise<boolean> {
        return locator
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    /**
     * Màn 一覧 = khối `fixed inset-y-0 right-0 z-50` chứa tiêu đề tương ứng.
     *
     * Lọc bằng `page.getByRole(...)` chứ không phải locator dựng từ chính khối đó:
     * Playwright áp NGUYÊN chuỗi selector của locator con vào từng ứng viên, nên
     * truyền locator con dựng từ cha là không bao giờ khớp.
     */
    const listScreenWith = (title: RegExp) =>
        page
            .locator('div.fixed.inset-y-0.z-50')
            .filter({ has: page.getByRole('heading', { name: title }) })

    /** Về lại màn 診療入力 của bệnh nhân test và chờ lưới dựng xong. */
    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * Dọn mọi hộp tự bung ra sau khi lưới nạp xong, cho tới khi màn hình sạch.
     *
     * `SanteiConfirmDialog` 「〜を算定しますか？」 (bấm **No** — Yes lại đẻ ra hộp
     * khác) và `CmtAutoPickerDialog` 「カルテ記載選択」 (đóng bằng F10 戻る = huỷ).
     * Bỏ sót một cái là hỏng dây chuyền với triệu chứng KHÔNG giống nguyên nhân:
     * còn một `[role=dialog]` mở mà scope topmost không nằm trong nó thì mọi
     * F-key bị nuốt, F11 im lặng không làm gì.
     */
    async function drainBlockingDialogs() {
        const santei = page.getByText(/を算定しますか？/).first()
        const cmtPicker = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })

        for (let i = 0; i < 20; i++) {
            if (await appeared(santei, 2_000)) {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
                    .catch(() => {})
                continue
            }
            if (await cmtPicker.isVisible().catch(() => false)) {
                await cmtPicker
                    .getByRole('button', { name: 'F10 戻る' })
                    .click()
                    .catch(() => {})
                await cmtPicker.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
                continue
            }
            return
        }
    }

    /**
     * Mở menu 選択 — BẤM NÚT F11 trên footer, không `keyboard.press('F11')`.
     *
     * Sau `page.goto` không có gì được focus nên phím rơi vào khoảng không, không
     * tới được FKeyScopeProvider. `data-fkey` được FKeyBar gắn đúng cho mục đích
     * này và ổn định hơn nhãn 「F11 選択」.
     */
    async function openMenu() {
        const f11 = page.locator('[data-fkey="F11"]')
        for (let attempt = 1; attempt <= 3; attempt++) {
            await drainBlockingDialogs()
            await expect(f11, 'footer F-key chưa dựng xong').toBeVisible({ timeout: 30_000 })
            await f11.click()
            if (await rowMenu.isVisible({ timeout: 10_000 }).catch(() => false)) return
        }
        await expect(rowMenu, 'bấm nút F11 3 lần mà menu 選択 vẫn không mở').toBeVisible({
            timeout: 10_000,
        })
    }

    /** F11 → hover 「9 オプション」 → click 「5 処置自動入力登録」. Submenu mở bằng HOVER. */
    async function openList() {
        if (await list.isVisible().catch(() => false)) return
        await openMenu()
        await rowMenu.getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub, 'submenu 9 オプション không mở ra').toBeVisible({ timeout: 10_000 })
        await sub.getByRole('button', { name: MENU_PROCEDURE_AUTO_INPUT, exact: true }).click()
        await expect(list, 'màn 処置自動入力一覧 không mở').toBeVisible({ timeout: 30_000 })
        await expect(gridRows(list).first().or(emptyState(list))).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
    }

    /**
     * Lọc 一覧 theo 処置コード rồi chọn dòng thứ `rowIndex`.
     *
     * Lọc TRƯỚC là bắt buộc — 一覧 nạp toàn bộ 処置 của version hôm nay (~1.664
     * dòng), cuộn tìm vừa chậm vừa phụ thuộc thứ tự server trả.
     *
     * Ô lọc là `spinbutton` (`type="number"`), khác với ô mã trong dialog 登録 —
     * xem bẫy 4.
     */
    async function filterAndSelect(trtCd: number, rowIndex = 0) {
        const cdInput = list.getByRole('spinbutton').first()
        await cdInput.fill(String(trtCd))
        await list.getByRole('button', { name: '検索', exact: true }).click()

        // `gridRows` = `[data-testid^="row-"]`. VirtualListTable dựng hàng bằng
        // `<div data-testid="row-…">`, KHÔNG phải `<button aria-pressed>` — bám
        // theo testid là hợp đồng duy nhất mà component công bố.
        await expect(
            gridRows(list).nth(rowIndex),
            `lọc 処置コード ${trtCd} mà 一覧 không có dòng thứ ${rowIndex}`,
        ).toBeVisible({ timeout: 30_000 })
        await gridRows(list).nth(rowIndex).click()
    }

    /** Mở dialog 登録 bằng F9 選択 (nhánh Update / Insert tuỳ dòng đang chọn). */
    async function openRegisterWithF9() {
        await list.getByRole('button', { name: 'F9 選択' }).click()
        await expect(register, 'F9 選択 mà dialog 登録 không mở').toBeVisible({ timeout: 30_000 })
    }

    /** Mở dialog 登録 bằng F1 追加 (luôn là nhánh Insert). */
    async function openRegisterWithF1() {
        await list.getByRole('button', { name: 'F1 追加' }).click()
        await expect(register, 'F1 追加 mà dialog 登録 không mở').toBeVisible({ timeout: 30_000 })
    }

    /** Đóng một dialog / màn 一覧 bằng F10 戻る của CHÍNH nó (bẫy 2). */
    async function closeWithF10(target: Locator) {
        if (await target.isHidden().catch(() => false)) return
        await target.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(target).toBeHidden({ timeout: 10_000 })
    }

    /** Đóng hộp `alertDialog` đang mở và trả về nội dung của nó. */
    async function readAndDismissAlert(): Promise<string> {
        // alertDialog ⇒ role="alertdialog", tách hẳn khỏi role="dialog".
        const alert = page.getByRole('alertdialog')
        await expect(alert, 'không có hộp cảnh báo nào bung ra').toBeVisible({ timeout: 15_000 })
        const text = (await alert.innerText()).trim()
        await alert.getByRole('button', { name: /^(OK|はい)$/ }).click()
        await expect(alert).toBeHidden({ timeout: 10_000 })
        return text
    }

    /**
     * Bấm F9 登録, đọc hộp xác nhận rồi bấm **No**.
     *
     * Huỷ ở đây là KHÔNG ghi gì: `handleRegister` chỉ gọi mutation sau khi confirm
     * trả true. Nhờ vậy khoá được văn bản Q00002 / Q00005 mà không đụng DB.
     */
    async function pressRegisterAndCancel(): Promise<string> {
        await register.getByRole('button', { name: 'F9 登録' }).click()
        const confirm = page.getByRole('alertdialog')
        await expect(confirm, 'F9 登録 mà không có hộp xác nhận nào').toBeVisible({
            timeout: 15_000,
        })
        const text = (await confirm.innerText()).trim()
        await confirm.getByRole('button', { name: /^(No|いいえ)$/ }).click()
        await expect(confirm).toBeHidden({ timeout: 10_000 })
        return text
    }

    /**
     * Bấm F9 登録 và kỳ vọng một hộp LỖI (chưa tới bước xác nhận).
     *
     * Phân biệt với {@link pressRegisterAndCancel} bằng chính nút: hộp lỗi có
     * OK, hộp xác nhận có Yes/No.
     */
    async function pressRegisterExpectingError(): Promise<string> {
        await register.getByRole('button', { name: 'F9 登録' }).click()
        return readAndDismissAlert()
    }

    /** Chờ lưới của popup nạp xong: có dòng, hoặc hiện empty-state. */
    async function gridSettled(root: Locator) {
        await expect(gridRows(root).first().or(emptyState(root))).toBeVisible({ timeout: 30_000 })
    }

    /**
     * Mở popup tra master từ con số dòng và chỉ chờ LƯỚI.
     *
     * Dùng cho mọi lượt mở SAU lượt đầu: cùng điều kiện thì react-query phục vụ
     * từ cache, không có response nào để chờ (bẫy 8).
     */
    async function openPopup(link: Locator, popup: Locator) {
        await link.click()
        await expect(popup, 'bấm số dòng mà popup tra master không mở').toBeVisible({
            timeout: 30_000,
        })
        await gridSettled(popup)
    }

    /**
     * Mở popup tra master từ con số dòng, ĐỒNG THỜI bắt response đầu tiên.
     *
     * CHỈ dùng cho lượt mở ĐẦU TIÊN của mỗi popup trong cả file — xem bẫy 8.
     *
     * Bắt response TRƯỚC khi click: popup nhỏ, dữ liệu master về rất nhanh, đăng
     * ký sau cái click là thua cuộc đua.
     */
    async function openSearchPopup<T>(
        link: Locator,
        popup: Locator,
        url: RegExp,
    ): Promise<{ rows: T[]; query: URLSearchParams }> {
        const pending = page.waitForResponse(
            (res) => url.test(res.url()) && res.request().method() === 'GET',
            { timeout: 60_000 },
        )
        await link.click()
        await expect(popup, 'bấm số dòng mà popup tra master không mở').toBeVisible({
            timeout: 30_000,
        })
        await gridSettled(popup)

        const res = await pending
        const body = (await res.json()) as { data?: T[] }
        return { rows: body.data ?? [], query: new URL(res.url()).searchParams }
    }

    // ── Ô của dialog 登録 (aria-label, luôn `exact: true` — bẫy 1) ───────────
    const seqInput = () => register.getByRole('textbox', { name: '順序', exact: true })
    const limitCntInput = () => register.getByRole('textbox', { name: '制限回数', exact: true })
    const oldStInput = () => register.getByRole('textbox', { name: '年齢制限 下限', exact: true })
    const oldEdInput = () => register.getByRole('textbox', { name: '年齢制限 上限', exact: true })
    const jikiCombo = () => register.getByRole('combobox', { name: '算定時期', exact: true })
    // ６ TOÀN PHẦN — xem bẫy 5.
    const attrCombo = (label: '老人' | '一般' | '６末') =>
        register.getByRole('combobox', { name: label, exact: true })

    const disLink = (slot: number) =>
        register.getByRole('button', { name: `病名検索 ${slot}`, exact: true })
    const disCdInput = (slot: number) =>
        register.getByRole('textbox', { name: `病名コード ${slot}`, exact: true })

    const trtLink = (slot: number) =>
        register.getByRole('button', { name: `処置検索 ${slot}`, exact: true })
    const trtCdInput = (slot: number) =>
        register.getByRole('textbox', { name: `処置コード ${slot}`, exact: true })
    const trtSbInput = (slot: number) =>
        register.getByRole('textbox', { name: `処置サブコード ${slot}`, exact: true })

    /**
     * 病名 / 処置名 là ô CHỈ ĐỌC (`<div>`, không phải input) nên không có
     * aria-label. Lấy theo cấu trúc: nó là ô CUỐI của hàng chứa ô mã.
     *
     * `locator('..')` = cha của input → hàng; `> div:last-child` = ô tên. Bám cấu
     * trúc là bất đắc dĩ; nếu hàng đổi layout thì sửa đúng một chỗ này.
     */
    const rowNameOf = (codeInput: Locator) => codeInput.locator('..').locator('> div:last-child')

    /** Gõ giá trị rồi rời ô để kích hoạt `onBlur` (đường tra tên). */
    async function fillAndBlur(input: Locator, value: string) {
        await input.fill(value)
        await input.blur()
    }

    // ── Vòng đời ─────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 50 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        rowMenu = page.getByRole('menu').filter({ hasText: '1 メニュー' })
        list = listScreenWith(/処\s*置\s*自\s*動\s*入\s*力\s*一\s*覧/)
        register = page.getByRole('dialog').filter({ hasText: '処 置 自 動 入 力 登 録' })
        // Portal ⇒ popup là ANH EM của dialog 登録, không lồng nhau.
        trtSearch = page.getByRole('dialog').filter({ hasText: '処 置 検 索' })
        disSearch = page.getByRole('dialog').filter({ hasText: '病 名 検 索' })

        await backToEntry()
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // A. 一覧 (frm203040)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-LIST-1 — mở 一覧 là nạp ngay, và 処置 chưa đăng ký vẫn có mặt', async () => {
        // getViewData chạy trong postInit ⇒ mở ra đã có danh sách, ô lọc còn trống.
        const pending = page.waitForResponse(
            (res) => MASTERS_URL.test(res.url()) && res.request().method() === 'GET',
            { timeout: 60_000 },
        )
        await openList()
        const body = (await (await pending).json()) as { data?: TrtAutoMasterRowWire[] }
        masterRows = body.data ?? []

        expect(masterRows.length, '一覧 mở ra mà không có dòng nào').toBeGreaterThan(0)

        // LEFT JOIN (MstTrt.cs:2138) ⇒ phải có CẢ hai loại. Nếu chỉ còn dòng đã
        // đăng ký thì bản port đã đổi LEFT thành INNER, và không ai cấu hình được
        // một 処置 mới nữa.
        const withSeq = masterRows.filter((r) => r.seq !== null && r.seq !== undefined)
        const withoutSeq = masterRows.filter((r) => r.seq === null || r.seq === undefined)
        expect(withoutSeq.length, 'không còn 処置 nào chưa đăng ký — LEFT JOIN bị mất?').toBeGreaterThan(0)

        registered = withSeq[0] ?? null
        unregistered = withoutSeq[0] ?? null

        console.log(
            `一覧: ${masterRows.length} dòng — đã đăng ký ${withSeq.length}, chưa ${withoutSeq.length}`,
        )
        if (registered) {
            console.log(`  mẫu đã đăng ký:  ${registered.trtCd}-${registered.trtSb} 順序=${registered.seq}`)
        }
        console.log(`  mẫu chưa đăng ký: ${unregistered!.trtCd}-${unregistered!.trtSb}`)
        await step()
    })

    test('TC-LIST-2 — sàn 処置コード là 100, KHÔNG phải toàn bộ 処置マスタ', async () => {
        // `WHERE trt.trt_cd >= 100` (MstTrt.cs:2183). 必要病名一覧 dùng `WHERE 0 = 0`
        // nên có cả 17-0 / 17-1; copy nhầm giữa hai màn là lỗi đã từng xảy ra thật.
        // Ở đây mã dưới 100 phải TUYỆT ĐỐI không xuất hiện — 登録 cũng từ chối chúng.
        const below = masterRows.filter((r) => r.trtCd < TRT_CODE_FLOOR)
        expect(
            below.map((r) => `${r.trtCd}-${r.trtSb}`),
            `一覧 lọt mã dưới ${TRT_CODE_FLOOR}`,
        ).toEqual([])
        expect(Math.min(...masterRows.map((r) => r.trtCd))).toBeGreaterThanOrEqual(TRT_CODE_FLOOR)
    })

    test('TC-LIST-3 — lưới có đủ 30 cột, gồm 5 cặp 病名 và 5 cặp 処置', async () => {
        // _viewItem (frm203040.cs:48-79). Bản Figma chỉ vẽ 10 cột đầu; thiếu 20 cột
        // sau thì màn hình trông vẫn "chạy" nên phải khoá bằng số cụ thể.
        // Header là `<div role="button" aria-sort>` chứ không phải phần tử
        // `<button>`, nên `button[aria-sort]` không khớp gì. `data-testid` là thứ
        // ổn định nhất: `header-<columnId>`.
        const headers = list.locator('[data-testid^="header-"]')
        await expect(headers, 'số cột header không đúng 30').toHaveCount(10 + SLOT_COUNT * 4)

        for (const label of ['処置コード', '処置名', '順序', '算定時期', '制限回数', '老人', '一般', '６末']) {
            await expect(
                headers.filter({ hasText: label }).first(),
                `thiếu cột 「${label}」`,
            ).toBeVisible()
        }
        for (let i = 1; i <= SLOT_COUNT; i++) {
            await expect(headers.filter({ hasText: `病名コード${i}` }).first()).toBeVisible()
            await expect(headers.filter({ hasText: `処置名${i}` }).first()).toBeVisible()
        }
    })

    test('TC-LIST-4 — 算定時期 / 老人 in NHÃN của mst_cod, không phải mã số', async () => {
        skipWithReason(registered === null, 'máy này chưa có bản 処置自動入力 nào để đối chiếu')
        if (!registered) return

        // Lưới bind `cd1.any_val1` (MstTrt.cs:2065) ⇒ 「初診月一回」, không phải 「1」.
        expect(registered.jikiLabel, '算定時期 không có nhãn').toBeTruthy()
        expect(registered.jikiLabel, '算定時期 đang trả mã số thay vì nhãn').not.toMatch(/^\d+$/)

        await filterAndSelect(registered.trtCd)
        await expect(cells(list, 'jiki').first()).toHaveText(registered.jikiLabel!.trim())
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // B. Hai nhánh mở dialog 登録 (frm203040.defData)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-OPEN-UPDATE-1 — F9 選択 trên dòng ĐÃ đăng ký: 順序 khoá, F8 削除 bật', async () => {
        skipWithReason(registered === null, 'máy này chưa có bản 処置自動入力 nào')
        if (!registered) return

        await filterAndSelect(registered.trtCd)
        await openRegisterWithF9()

        // txtSeq.Enabled = false (frm203041.cs:420) — 順序 là một phần của khoá,
        // sửa được thì F9 sẽ ghi sang bản khác chứ không phải sửa bản này.
        await expect(seqInput(), '順序 phải bị khoá ở nhánh Update').toBeDisabled()
        await expect(seqInput()).toHaveValue(String(registered.seq))

        // Ngược lại F8 削除 PHẢI bật — đây là bản ghi có thật để xoá.
        await expect(
            register.locator('[data-fkey="F8"]'),
            'F8 削除 phải bật khi sửa bản đã có',
        ).toBeEnabled()

        // Dữ liệu của bản ghi phải được nạp lên, không phải form trống.
        await expect(oldEdInput()).toHaveValue(String(registered.oldEd ?? 0))
        await step()
        await closeWithF10(register)
    })

    test('TC-OPEN-INSERT-1 — F9 選択 trên dòng CHƯA đăng ký: 順序 sửa được, F8 削除 tắt', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // defData (:308-311): 順序 rỗng ⇒ InpKbn.Insert, và paramData.seq giữ mặc
        // định 0 — WinForm hiện đúng số 0 chứ không bỏ trống.
        await expect(seqInput(), '順序 phải sửa được ở nhánh Insert').toBeEnabled()
        await expect(seqInput()).toHaveValue('0')

        // btnChgEnable(btnF8, false) (:378, :426) — chưa có gì để xoá.
        await expect(
            register.locator('[data-fkey="F8"]'),
            'F8 削除 phải tắt khi đang thêm mới',
        ).toBeDisabled()

        // Mọi slot phải trống — dspData chỉ nạp dữ liệu ở nhánh Update.
        for (let slot = 1; slot <= SLOT_COUNT; slot++) {
            await expect(disCdInput(slot)).toHaveValue('')
            await expect(trtCdInput(slot)).toHaveValue('')
            await expect(trtSbInput(slot)).toHaveValue('')
        }
        // Giá trị mặc định của dspData (:371-373).
        await expect(limitCntInput()).toHaveValue('0')
        await expect(oldStInput()).toHaveValue('0')
        await expect(oldEdInput()).toHaveValue('0')
        await step()
        await closeWithF10(register)
    })

    test('TC-OPEN-F1-1 — F1 追加 trên 処置 ĐÃ đăng ký đề xuất 順序 = max + 1', async () => {
        skipWithReason(registered === null, 'máy này chưa có bản 処置自動入力 nào')
        if (!registered) return

        // defData không có tham số (:318-341): luôn Insert, và 順序 = max các 順序
        // của CÙNG 処置 rồi +1. WinForm tính từ LƯỚI, nên spec cũng tính từ dữ liệu
        // 一覧 chứ không hỏi DB.
        const seqs = masterRows
            .filter(
                (r) =>
                    r.trtCd === registered!.trtCd &&
                    r.trtSb === registered!.trtSb &&
                    r.seq !== null &&
                    r.seq !== undefined,
            )
            .map((r) => r.seq as number)
        const expected = Math.max(...seqs) + 1

        await filterAndSelect(registered.trtCd)
        await openRegisterWithF1()

        await expect(seqInput(), 'F1 追加 luôn là Insert nên 順序 phải sửa được').toBeEnabled()
        await expect(seqInput(), `順序 đề xuất phải là max(${seqs.join(',')}) + 1`).toHaveValue(
            String(expected),
        )
        await expect(register.locator('[data-fkey="F8"]')).toBeDisabled()
        await step()
        await closeWithF10(register)
    })

    test('TC-OPEN-F1-2 — F1 追加 trên 処置 CHƯA đăng ký đề xuất 順序 = 0', async () => {
        // Nhánh else của defData không gán gì, paramData.seq ở nguyên mặc định 0
        // (:318-341). Trả về 1 ở đây là "hợp lý hơn" nhưng KHÁC bản gốc.
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF1()

        await expect(seqInput()).toHaveValue('0')
        await expect(seqInput()).toBeEnabled()
        await step()
        await closeWithF10(register)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // C. Các ô của dialog 登録
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-FIELD-1 — 制限回数 chỉ bật khi 算定時期 = 日一回', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // chgLimitCntEnable (frm203041.cs:301-312). Mặc định combo dừng ở mục đầu
        // (初診月一回) nên ô phải TẮT.
        await expect(limitCntInput(), '算定時期 chưa phải 日一回 mà 制限回数 đã bật').toBeDisabled()

        await jikiCombo().click()
        await page.getByRole('option', { name: JIKI_ONCE_A_DAY_LABEL, exact: true }).click()
        await expect(limitCntInput(), 'chọn 日一回 rồi mà 制限回数 vẫn khoá').toBeEnabled()

        // Đổi ngược lại thì khoá lại — không phải "bật một lần rồi thôi".
        await jikiCombo().click()
        await page.getByRole('option').first().click()
        await expect(limitCntInput()).toBeDisabled()
        await step()
        await closeWithF10(register)
    })

    test('TC-FIELD-2 — maxLength đúng như Designer', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // frm203041.Designer.cs. Đây là lý do các ô là type="text" chứ không phải
        // type="number": HTML bỏ qua maxLength trên number input (bẫy 4).
        await expect(seqInput()).toHaveAttribute('maxlength', '8')
        await expect(limitCntInput()).toHaveAttribute('maxlength', '2')
        await expect(oldStInput()).toHaveAttribute('maxlength', '3')
        await expect(oldEdInput()).toHaveAttribute('maxlength', '3')
        for (let slot = 1; slot <= SLOT_COUNT; slot++) {
            await expect(disCdInput(slot)).toHaveAttribute('maxlength', '3')
            await expect(trtCdInput(slot)).toHaveAttribute('maxlength', '3')
            await expect(trtSbInput(slot)).toHaveAttribute('maxlength', '3')
        }

        // Và giới hạn phải có TÁC DỤNG THẬT, không chỉ là thuộc tính trang trí.
        await disCdInput(1).fill('99999')
        await expect(disCdInput(1), 'gõ 5 chữ số mà ô nhận quá 3').toHaveValue('999')
        await step()
        await closeWithF10(register)
    })

    test('TC-FIELD-3 — có đúng 5 slot 必要病名 và 5 slot 必要処置, mỗi slot một link tra mã', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // Con số dòng phải là NÚT bấm được, không phải chữ trang trí — đây là
        // đường DUY NHẤT mở màn tra mã (frm203041 vẽ nó gạch chân + con trỏ tay).
        await expect(register.getByRole('button', { name: /^病名検索 \d+$/ })).toHaveCount(SLOT_COUNT)
        await expect(register.getByRole('button', { name: /^処置検索 \d+$/ })).toHaveCount(SLOT_COUNT)
        // 必要処置 có thêm ô 枝番 mà 必要病名 không có.
        await expect(register.getByRole('textbox', { name: /^処置サブコード \d+$/ })).toHaveCount(
            SLOT_COUNT,
        )
        await step()
        await closeWithF10(register)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // D. Hai popup tra master — SCOPE hẹp hơn các màn 登録 khác
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-DIS-SCOPE-1 — 病名検索 mở từ đây KHÔNG chào 病名グループ (< 100)', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        const { rows, query } = await openSearchPopup<DisSearchRowWire>(
            disLink(1),
            disSearch,
            DIS_SEARCH_URL,
        )

        // cdKbn.hundredOrAbove (frm203041.cs:155). 必要病名登録 gọi cùng màn này với
        // cdKbn.all và NHẬN được 病名グループ; ở đây thì không, vì chkInputData
        // (:565-570) từ chối mã dưới 100 — chào mời rồi từ chối là bẫy người dùng.
        expect(query.get('scope'), 'không gửi scope hoặc gửi sai scope').toBe('1')
        expect(rows.length, '病名検索 không trả dòng nào').toBeGreaterThan(0)

        const below = rows.filter((r) => r.disCd < TRT_CODE_FLOOR)
        expect(
            below.map((r) => `${r.disCd} ${r.disNm}`),
            '病名検索 vẫn lọt 病名グループ dưới 100',
        ).toEqual([])

        disSearchRows = rows
        console.log(`病名検索 scope=1: ${rows.length} dòng, mã nhỏ nhất ${Math.min(...rows.map((r) => r.disCd))}`)
        await step()
        await closeWithF10(disSearch)
        await closeWithF10(register)
    })

    test('TC-TRT-SCOPE-1 — 処置検索 mở từ đây KHÔNG chào dòng 摘要マスタ', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        const { rows, query } = await openSearchPopup<TrtSearchRowWire>(
            trtLink(1),
            trtSearch,
            TRT_SEARCH_URL,
        )

        // cdKbn.mstTrtOnly (frm203041.cs:217). 自動算定登録 gọi cùng màn này với
        // mstCmtInclude. 必要処置 được đối chiếu với 処置 thật lúc 自動入力 chạy, nên
        // một dòng 摘要 có chọn cũng không bao giờ khớp.
        expect(query.get('scope'), 'không gửi scope hoặc gửi sai scope').toBe('1')
        expect(rows.length, '処置検索 không trả dòng nào').toBeGreaterThan(0)

        const receipt = rows.filter(
            (r) => r.trtCd >= RECEIPT_CODE_MIN && r.trtCd <= RECEIPT_CODE_MAX,
        )
        expect(
            receipt.map((r) => r.dspCd),
            `処置検索 vẫn lọt dòng 摘要マスタ (${RECEIPT_CODE_MIN}..${RECEIPT_CODE_MAX})`,
        ).toEqual([])

        trtSearchRows = rows
        console.log(`処置検索 scope=1: ${rows.length} dòng, 0 dòng trong dải 摘要`)
        await step()
        await closeWithF10(trtSearch)
        await closeWithF10(register)
    })

    test('TC-DIS-PICK-1 — chọn dòng ở 病名検索 điền cả 病名コード lẫn 病名', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // Dữ liệu lấy từ TC-DIS-SCOPE-1: mở lại cùng điều kiện thì không có
        // request nào (bẫy 8). Thứ tự lưới vẫn là thứ tự server trả — chưa ai bấm
        // sort — nên dòng đầu lưới chính là `disSearchRows[0]`.
        await openPopup(disLink(2), disSearch)
        const first = disSearchRows[0]
        skipWithReason(first === undefined, 'TC-DIS-SCOPE-1 chưa chạy nên không có dữ liệu 病名検索')
        if (!first) return

        await gridRows(disSearch).first().click()
        await disSearch.getByRole('button', { name: 'F9 選択' }).click()
        await expect(disSearch).toBeHidden({ timeout: 10_000 })

        // lblDisCd_Click (:167-169) gán CẢ hai ô. Điền mỗi mã rồi để tên trống là
        // lỗi hay gặp, và nhìn màn hình vẫn tưởng đã xong.
        await expect(disCdInput(2)).toHaveValue(String(first.disCd))
        await expect(rowNameOf(disCdInput(2))).toHaveText(first.disNm.trim())
        await step()
        await closeWithF10(register)
    })

    test('TC-TRT-PICK-1 — chọn dòng ở 処置検索 điền đủ 処置コード / 枝番 / 処置名', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        await openPopup(trtLink(2), trtSearch)
        const first = trtSearchRows[0]
        skipWithReason(first === undefined, 'TC-TRT-SCOPE-1 chưa chạy nên không có dữ liệu 処置検索')
        if (!first) return

        await gridRows(trtSearch).first().click()
        await trtSearch.getByRole('button', { name: 'F9 選択' }).click()
        await expect(trtSearch).toBeHidden({ timeout: 10_000 })

        // lblTrtCd_Click (:229-231) gán BA ô. Lưới hiển thị `cctNm` (tên dài) nhưng
        // ô nhận `trtNm` (tên ngắn) — điền nhầm tên dài thì lần mở lại nó tự đổi,
        // vì đường tra tên lúc rời ô đọc `trt_nm`.
        await expect(trtCdInput(2)).toHaveValue(String(first.trtCd))
        await expect(trtSbInput(2)).toHaveValue(String(first.trtSb))
        await expect(rowNameOf(trtCdInput(2))).toHaveText(first.trtNm.trim())
        await step()
        await closeWithF10(register)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // E. Hành vi khi rời ô (txtDisCd_Leave / txtTrtCd_Leave / txtTrtSb_Leave)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-BLUR-DIS-1 — 病名コード dưới 100 bị xoá trắng, IM LẶNG', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // txtDisCd_Leave (:181-185): dưới 100 thì xoá cả mã lẫn tên, KHÔNG báo lỗi.
        // Đây là chỗ khác 必要病名登録, nơi mã dưới 100 là 病名グループ hợp lệ.
        await fillAndBlur(disCdInput(1), BELOW_FLOOR_CODE)
        await expect(disCdInput(1), `mã ${BELOW_FLOOR_CODE} lẽ ra bị xoá`).toHaveValue('')
        await expect(rowNameOf(disCdInput(1))).toHaveText('')
        await expect(page.getByRole('alertdialog'), 'không được báo lỗi ở đây').toBeHidden()
        await step()
        await closeWithF10(register)
    })

    test('TC-BLUR-DIS-2 — 病名コード không tra ra cũng bị xoá trắng', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // txtDisCd_Leave (:198-202): getDisNm thất bại ⇒ xoá cả hai ô.
        await fillAndBlur(disCdInput(1), UNKNOWN_CODE)
        await expect(disCdInput(1)).toHaveValue('')
        await expect(rowNameOf(disCdInput(1))).toHaveText('')
        await expect(page.getByRole('alertdialog')).toBeHidden()
        await step()
        await closeWithF10(register)
    })

    test('TC-BLUR-TRT-1 — 処置コード chưa có 枝番 thì để yên, chưa xoá', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // Cặp (コード, 枝番) được xét CÙNG NHAU. Xoá ngay lúc rời ô 処置コード sẽ dọn
        // mất dòng người dùng mới gõ được một nửa; việc từ chối cặp thiếu là của
        // F9 (E00001「処置サブコード」), không phải của blur.
        await fillAndBlur(trtCdInput(1), '264')
        await expect(trtCdInput(1), 'gõ xong 処置コード đã bị xoá mất').toHaveValue('264')
        await expect(trtSbInput(1)).toHaveValue('')
        await step()
        await closeWithF10(register)
    })

    test('TC-BLUR-TRT-2 — cặp 処置コード / 枝番 không tra ra thì xoá cả ba ô', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // txtTrtSb_Leave (:268-277): getTrtNm thất bại ⇒ xoá コード, 枝番 và 処置名.
        await trtCdInput(1).fill(UNKNOWN_CODE)
        await fillAndBlur(trtSbInput(1), '9')
        await expect(trtCdInput(1)).toHaveValue('')
        await expect(trtSbInput(1)).toHaveValue('')
        await expect(rowNameOf(trtCdInput(1))).toHaveText('')
        await step()
        await closeWithF10(register)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // F. F9 登録 — kiểm tra đầu vào rồi HUỶ ở hộp xác nhận (không ghi DB)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-VAL-1 — 年齢制限 下限 > 上限 → E00002', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // chkInputData (:553-558). 0/0 là 制限なし và hợp lệ, nên phải kiểm bằng
        // một cặp thực sự ngược nhau.
        await oldStInput().fill('80')
        await oldEdInput().fill('6')
        expect(await pressRegisterExpectingError()).toContain(E00002('年齢制限'))
        await step()
        await closeWithF10(register)
    })

    test('TC-BLUR-TRT-3 — 枝番 đứng một mình bị xoá ngay khi rời ô', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // txtTrtSb_Leave (:256-286) chỉ tra tên khi CẢ HAI ô có giá trị; nhánh
        // `else` xoá cả ba. Nên 枝番 đứng một mình không sống nổi tới lúc bấm F9.
        //
        // Hệ quả: E00001「処置コード」 trong chkInputData (:590-595) KHÔNG với tới
        // được từ giao diện — blur đã dọn trước. Nó vẫn phải nằm trong validator
        // phía BE vì đó là hợp đồng của API, nơi không có ô nào để rời.
        //
        // ⚠️ Bản đầu của spec khoá nhầm chỗ này: đọc chkInputData rồi kết luận
        // "phải ra E00001「処置コード」", trong khi hàm chạy TRƯỚC nó đã xoá mất dữ
        // liệu. Cùng một bài học với `master-search-dialogs`: một testcase chỉ
        // đáng tin bằng cái fact nó bám vào, và fact phải là HÀNH VI chứ không
        // phải một hàm đọc rời.
        await fillAndBlur(trtSbInput(1), '3')
        await expect(trtSbInput(1), '枝番 đứng một mình lẽ ra bị xoá').toHaveValue('')
        await expect(trtCdInput(1)).toHaveValue('')
        await expect(rowNameOf(trtCdInput(1))).toHaveText('')
        await expect(page.getByRole('alertdialog'), 'không được báo lỗi ở đây').toBeHidden()
        await step()
        await closeWithF10(register)
    })

    test('TC-VAL-3 — có 処置コード mà thiếu 枝番 → E00001「処置サブコード」', async () => {
        await filterAndSelect(unregistered!.trtCd)
        await openRegisterWithF9()

        // chkInputData (:596-601) — nửa còn lại của cặp, thông báo khác TC-VAL-2.
        await trtCdInput(1).fill('264')
        expect(await pressRegisterExpectingError()).toContain(E00001('処置サブコード'))
        await step()
        await closeWithF10(register)
    })

    test('TC-CONFIRM-1 — 順序 chưa tồn tại → Q00002 (rồi huỷ, không ghi)', async () => {
        skipWithReason(registered === null, 'máy này chưa có bản 処置自動入力 nào')
        if (!registered) return

        // F1 追加 đề xuất max+1, tức một 順序 CHƯA có ⇒ nhánh Q00002 (:625).
        await filterAndSelect(registered.trtCd)
        await openRegisterWithF1()

        const text = await pressRegisterAndCancel()
        expect(text, 'phải là confirm thường, không phải cảnh báo ghi đè').toContain(Q00002)
        expect(text).not.toContain('既に登録されています')

        // Huỷ ⇒ dialog vẫn mở, chưa ghi gì.
        await expect(register, 'bấm No mà dialog vẫn đóng — có thể đã ghi').toBeVisible()
        await step()
        await closeWithF10(register)
    })

    test('TC-CONFIRM-2 — 順序 đã tồn tại → Q00005 kèm số 順序 (rồi huỷ, không ghi)', async () => {
        skipWithReason(registered === null, 'máy này chưa có bản 処置自動入力 nào')
        if (!registered) return

        // chkInputData (:614-631): chỉ hỏi Q00005 khi 順序 CÒN SỬA ĐƯỢC, tức nhánh
        // Insert. Nên phải vào bằng F1 追加 rồi gõ đè về một 順序 đã có — mở bằng
        // F9 選択 thì ô 順序 bị khoá và không dựng được tình huống này.
        await filterAndSelect(registered.trtCd)
        await openRegisterWithF1()

        await seqInput().fill(String(registered.seq))
        const text = await pressRegisterAndCancel()

        // Đối số là 「順序:<n>」 (:621) — nêu đích danh cái sắp bị đè, không phải
        // một câu chung chung.
        expect(text).toContain(Q00005(`順序:${registered.seq}`))
        await expect(register).toBeVisible()
        await step()
        await closeWithF10(register)
        await closeWithF10(list)
    })
})
