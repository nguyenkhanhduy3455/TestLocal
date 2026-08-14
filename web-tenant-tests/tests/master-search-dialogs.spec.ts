import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { cells, emptyState, rows as gridRows, scroller } from './virtual-grid'

/**
 * 処置検索 (frm902011) và 病名検索 (frm902010) — HAI popup tra master vừa được
 * port, cùng đường vào: CLICK VÀO CON SỐ DÒNG trong hai dialog 登録.
 *
 *   A. 処置検索  ← 自動算定登録   (frm203039) ← F11 → 9 オプション → 4 自動算定登録
 *   B. 病名検索  ← 必要病名登録   (frm203037) ← F11 → 9 オプション → 3 必要病名登録
 *
 * Gộp một file vì cả hai xuất phát từ MỘT màn `/treatments/{patNo}` — tách hai
 * file là hai lần login cho cùng một hành trình (Rule 10.1). Cả file chạy
 * `serial` trên MỘT page tạo ở `beforeAll` (Rule 19).
 *
 * File này KHÁC `inp-p1-ported-dialogs.spec.ts` (チェック項目設定 / Brサンプル) và
 * `step-edit-dialog.spec.ts` (Ｓｔｅｐ編集). Ở đây chỉ có hai popup tra master và
 * chỗ chúng ĐỔ DỮ LIỆU RA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A. 処置検索 — nguồn WinForm (INP/Forms/frm902011.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - postInit (:201-204)         gọi thẳng `getViewData()` ⇒ mở form ra là ĐÃ CÓ
 *                                toàn bộ danh sách, ô lọc còn trống.
 *  - btnSearch_Click (:211-228)  chạy LẠI cùng hàm đó với điều kiện mới.
 *  - getViewData (:219-223)      0 dòng → E00003 (lỗi).
 *  - btnF9_Click (:164-174)      lưới rỗng → **E00007**, không phải E00003.
 *  - defData (:254-255)          đọc CẢ `trtNm` (tên ngắn) lẫn `cctNm` (tên dài).
 *  - frm203039.lblCd_Click (:167) chọn xong gán `pData.trtNm` — TÊN NGẮN.
 *  - MstTrt.getMstTrtDataList (MstTrt.cs:1920-2003), cdKbn.mstCmtInclude:
 *      · 処置マスタ version hiện hành, `active_flg = 1`, UNION 摘要マスタ đang
 *        trong cửa sổ hiệu lực (dòng 摘要 lấy `cmt_nm` cho cả hai tên, 点数 = 0).
 *      · Bộ lọc tên chạy trên **cct_nm**, KHÔNG phải trt_nm (:1978).
 *      · 点数 khớp CHÍNH XÁC, không phải khoảng (:1985).
 *
 *  Web port — components/treatment-search-dialog.tsx:
 *      · `DraggableDialog` ⇒ role="dialog"; tiêu đề có DẤU CÁCH THẬT: '処 置 検 索'.
 *      · Lưới là `VirtualListTable` ⇒ dùng helper `virtual-grid.ts`
 *        (`cell-dspCd` / `cell-cctNm` / `cell-score1`).
 *      · Cột 処置名 hiển thị `cctNm`, nhưng chọn dòng thì điền `trtNm`.
 *        **Đây là assert quan trọng nhất của cả file** (TC-TRT-PICK-1): điền
 *        nhầm tên dài thì lần mở lại 自動算定登録 tên sẽ tự đổi, vì đường tra tên
 *        lúc rời ô đọc `trt_nm`.
 *      · Mở lại = dựng mới: xoá ô lọc, con trỏ về dòng 0, và nạp lại danh sách
 *        đầy đủ (không phải lưới trống).
 *      · F9 選択 với lưới rỗng → `alertDialog(ja.E00007())`.
 *  api/master-search-api.ts: `score1 = 0` là điều kiện lọc HỢP LỆ (mọi dòng 摘要
 *      đều 0 điểm) nên nó KHÔNG được rơi như giá trị falsy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * B. 病名検索 — nguồn WinForm (INP/Forms/frm902010.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - postInit (:201-204)         cũng tự nạp ngay khi mở; :212-227 là lượt tìm lại.
 *  - btnF9_Click (:165-175)      lưới rỗng → E00007.
 *  - frm203037.lblDisCd_Click (:151-153) gọi với `cdKbn.all`, `sbKbn.zero`.
 *  - MstDis.getMstDisList (MstDis.cs:349-410):
 *      · `cdKbn.all` ⇒ nhánh 病名マスタ **KHÔNG** lọc `dis_cd >= 100`; kết quả
 *        UNION thêm `mst_cod` cd_type 34 = 病名グループ (Ｃ群 / Ｐ群 / Ｐｕ群…),
 *        toàn mã dưới 100. Đây là nửa dữ liệu mà một bản port cẩu thả hay bỏ mất
 *        vì tưởng là rác ⇒ TC-DIS-SEARCH-1 khoá đúng chỗ đó.
 *      · `sbKbn.zero` ⇒ 病名コード hiển thị chỉ có mã, KHÔNG kèm 枝番.
 *
 *  Web port — components/disease-search-dialog.tsx + required-disease-name-register-dialog.tsx:
 *      · Tiêu đề '病 名 検 索'. Lưới 2 cột `cell-disCd` / `cell-disNm`.
 *      · 20 slot chia HAI CỘT 10 dòng; slot 11 là dòng đầu cột PHẢI. Chia cột là
 *        chỗ dễ lệch index nhất ⇒ TC-DIS-SLOT-11 mở từ đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ghi DB
 * ═══════════════════════════════════════════════════════════════════════════
 *  KHÔNG có. Spec chọn dòng để ĐIỀN vào ô rồi đóng hai dialog 登録 bằng F10 戻る
 *  — chưa bao giờ bấm F9 登録. Vì thế không cần `TEST_ALLOW_SAVE` và cũng không
 *  cần `TEST_DB`. Nếu sau này thêm testcase bấm F9 登録 thì phải đặt nó sau cờ
 *  env (Rule 18.1) và tự trả lại giá trị cũ của `chk_auto` / `inp_chk_10`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `getByRole(..., { name })` khớp CHUỖI CON ⇒ `'病名検索 1'` trúng luôn
 *     11..19 (11 phần tử) và Playwright ném strict mode violation. Mọi locator
 *     theo aria-label ở đây đều `exact: true`. Đã có tiền lệ ở
 *     step-edit-dialog (「STEP 1-1」).
 *  2. `F10 戻る` có mặt ở CẢ popup lẫn dialog 登録 ⇒ luôn scope theo dialog, đừng
 *     `page.getByRole('button', { name: 'F10 戻る' })`. Ngược lại `F9` thì tách
 *     được vì nhãn khác nhau: popup là 「F9 選択」, 登録 là 「F9 登録」.
 *  3. Khi popup mở, thanh F-key của dialog 登録 bên dưới bị
 *     `pointer-events-none` (fkey-bar.tsx:222 — modal-dialog guard) ⇒ bấm
 *     「F9 登録」 lúc đó là click vào khoảng không, timeout 15s. Phải đóng popup
 *     trước.
 *  4. `DraggableDialog` render qua `createPortal` ⇒ popup và dialog 登録 là hai
 *     phần tử ANH EM trong `body`, không lồng nhau. Nhờ vậy
 *     `getByRole('dialog').filter({ hasText: '処 置 検 索' })` chỉ trúng popup.
 *     Nếu ngày nào đó bỏ portal thì locator này sẽ trúng 2 phần tử — triệu chứng
 *     là strict mode violation chứ không phải "không tìm thấy".
 *  5. `SanteiConfirmDialog` 「〜を算定しますか？」 nổi đè và NUỐT cả phím F11 ⇒ vét
 *     bằng `drainBlockingDialogs()` trước mỗi lần mở menu. `addLocatorHandler`
 *     chỉ chạy khi Playwright đang làm một ACTION, không đỡ cho `keyboard.press`.
 *  6. 一覧 mở ra là nạp TOÀN BỘ 処置 của version hôm nay (~1.7k dòng). Luôn lọc
 *     処置コード trước khi chọn dòng, đừng cuộn tìm.
 *  8. Khi `alertDialog` (Radix AlertDialog) mở, nó gắn `aria-hidden` lên phần
 *     còn lại của trang ⇒ MỌI `getByRole('dialog')` ngừng khớp, kể cả popup đang
 *     nằm ngay dưới. Triệu chứng là "element(s) not found" ở một locator vốn
 *     chạy tốt, và ảnh chụp thì thấy popup vẫn hiện rành rành. Thứ tự bắt buộc:
 *     đọc + đóng hộp thoại TRƯỚC, rồi mới soi lưới. Đã mất một lượt chạy vì chỗ
 *     này (2026-08-12).
 *  7. `staleTime: 5 phút` ⇒ tìm lại CÙNG điều kiện trong 5 phút KHÔNG phát sinh
 *     request nào, react-query trả thẳng từ cache. `waitForResponse` ở những
 *     lượt đó treo hết timeout rồi đỏ ở chỗ chẳng liên quan (đã dính lần chạy
 *     đầu). Vì thế chỉ lượt tìm ĐẦU TIÊN của mỗi điều kiện mới dùng `searchIn`;
 *     các lượt sau dùng `runSearch`, chờ theo LƯỚI.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Cách chạy
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/master-search-dialogs.spec.ts --retries=0
 *
 * `--retries=0` vì retry chạy lại CẢ khối serial ⇒ thêm một lần login (Rule 10.1).
 * Chạy CẢ FILE, không `-g` một testcase lẻ: khối serial dùng chung một page và
 * thứ tự CÓ Ý NGHĨA (TC-TRT-PICK-1 để lại giá trị cho TC-TRT-SLOT-3 đối chiếu).
 * Muốn kiểm độ ổn định thì lặp CẢ FILE, đừng dùng `--repeat-each` (nó lặp từng
 * testcase, phá đúng cái mà `serial` xây):
 *
 *   for i in 1 2 3; do npx playwright test tests/master-search-dialogs.spec.ts --retries=0; done
 *
 * Đã chạy 3 lượt như trên (2026-08-12): 16/16 xanh cả ba, ~14s mỗi lượt.
 *
 * ⚠️ Lần viết đầu file này khoá NHẦM hành vi: tôi tưởng hai form không tự nạp lúc
 * mở, viết 2 testcase khẳng định 「lưới trống, không gọi API」 và chúng XANH — vì
 * bản port lúc đó cũng sai y hệt. Ảnh chụp WinForm thật mới lộ ra. Bài học: một
 * testcase chỉ đáng tin bằng cái FACT nó bám vào; fact phải lấy từ source hoặc
 * máy thật, không phải từ trí nhớ.
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

// ── Endpoint hai popup này gọi ───────────────────────────────────────────────
const TRT_SEARCH_URL = /\/tenant\/master-search\/treatments(\?|$)/
const DIS_SEARCH_URL = /\/tenant\/master-search\/diseases(\?|$)/

// ── Nhãn menu, lấy nguyên văn từ F11_MENU_ITEMS (treatment-entry-shared.ts) ───
const MENU_OPTIONS = '9 オプション'
const MENU_REQUIRED_DISEASE = '3 必要病名登録'
const MENU_AUTO_CALCULATION = '4 自動算定登録'

/**
 * 処置 dùng để mở hai dialog 登録. 100 = 初診, có mặt ở MỌI version 処置マスタ nên
 * an toàn hơn bất kỳ mã nào khác; đổi qua env nếu máy khác dữ liệu.
 */
const PROBE_TRT_CD = process.env.TEST_PROBE_TRT_CD ?? '100'

/** Từ khoá tìm 処置 — 「初診」 chắc chắn có trong 処置マスタ mọi version. */
const TRT_SEARCH_WORD = process.env.TEST_TRT_WORD ?? '初診'
/** Từ khoá tìm 病名 — 「群」 là hậu tố của mọi 病名グループ (mst_cod 34). */
const DIS_SEARCH_WORD = process.env.TEST_DIS_WORD ?? '群'

/** InpChk10Slots.Count / ChkAutoSlots.Count — số slot của hai dialog 登録. */
const CHK_AUTO_SLOT_COUNT = 5
const INP_CHK_10_SLOT_COUNT = 20
/** required-disease-name-register-dialog.tsx ROWS_PER_COLUMN. */
const DIS_ROWS_PER_COLUMN = 10

/** ja.E00003 — 「該当するデータがありません。」 (getViewData, kết quả 0 dòng). */
const E00003 = '該当するデータがありません。'
/** ja.E00007 — 「選択するデータがありません。」 (btnF9_Click, lưới rỗng). */
const E00007 = '選択するデータがありません。'
/** Từ khoá chắc chắn KHÔNG khớp gì, để ép nhánh 0 dòng. */
const NO_MATCH_WORD = process.env.TEST_NO_MATCH_WORD ?? 'ZZZNOTEXIST'

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

test.describe('master search — 処置検索 (frm902011) / 病名検索 (frm902010)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu 選択 của F11. Lọc theo '1 メニュー' để không dính submenu. */
    let rowMenu: Locator
    /** Màn 一覧 chiếm toàn màn hình (không phải dialog). */
    let autoCalcList: Locator
    let requiredDiseaseList: Locator
    /** Hai dialog 登録. */
    let autoCalcRegister: Locator
    let requiredDiseaseRegister: Locator
    /** Hai popup tra master. */
    let trtSearch: Locator
    let disSearch: Locator

    /** Mọi request tới hai endpoint tra master, để đếm "có bay hay không". */
    const searchRequests: string[] = []

    /** Kết quả 処置検索 bắt được ở TC-TRT-SEARCH-1, dùng lại cho các TC sau. */
    let trtRows: TrtSearchRowWire[] = []
    /** Dòng có `trtNm !== cctNm` — dòng DUY NHẤT chứng minh được điền tên nào. */
    let twoNameRow: TrtSearchRowWire | null = null
    /** Giá trị đã điền vào slot 1 ở TC-TRT-PICK-1. */
    let slot1Code: string | null = null

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
     * Lọc bằng `page.getByRole(...)` chứ không phải locator dựng từ chính khối đó
     * (Rule 12.2): Playwright áp NGUYÊN chuỗi selector của locator con vào từng
     * ứng viên, nên truyền locator con dựng từ cha là không bao giờ khớp.
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
     * Hai loại và cả hai đều phải dọn: `SanteiConfirmDialog` 「〜を算定しますか？」
     * (bấm **No** — Yes lại đẻ ra hộp khác) và `CmtAutoPickerDialog`
     * 「カルテ記載選択」 (đóng bằng F10 戻る = huỷ, không ghi gì).
     *
     * Bỏ sót một cái là hỏng dây chuyền với triệu chứng KHÔNG giống nguyên nhân:
     * `fkey-scope-provider` có modal-dialog guard — còn một `[role=dialog]` mở mà
     * scope topmost không nằm trong nó thì mọi F-key bị nuốt, F11 im lặng không
     * làm gì, và nút 「F11 選択」 thì `pointer-events-none` nên click cũng chết.
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
     * này và ổn định hơn nhãn 「F11 選択」 — nhãn đổi theo màn, thuộc tính thì không.
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

    /** F11 → hover 「9 オプション」 → click một mục con. Submenu mở bằng HOVER. */
    async function openFromOptions(itemLabel: string, target: Locator) {
        if (await target.isVisible().catch(() => false)) return
        await openMenu()
        await rowMenu.getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub, 'submenu 9 オプション không mở ra').toBeVisible({ timeout: 10_000 })
        await sub.getByRole('button', { name: itemLabel, exact: true }).click()
        await expect(target, `bấm 「${itemLabel}」 mà màn 一覧 không mở`).toBeVisible({
            timeout: 30_000,
        })
    }

    /**
     * Trên màn 一覧: lọc theo 処置コード rồi chọn dòng đầu và bấm F9 選択.
     *
     * Lọc TRƯỚC là bắt buộc — 一覧 nạp toàn bộ 処置 của version hôm nay (~1.7k
     * dòng), cuộn tìm vừa chậm vừa phụ thuộc thứ tự server trả.
     */
    async function pickTreatmentAndOpenRegister(list: Locator, register: Locator) {
        // `textbox`, KHÔNG phải `spinbutton`: ô lọc 処置コード của cả hai màn 一覧 đã
        // đổi sang `type="text"` + `inputMode="numeric"` — HTML bỏ qua `maxLength`
        // trên `type="number"` nên không chặn được quá 4 chữ số. Spec này viết
        // trước lần sửa đó và locator cũ mục ruỗng từ lúc ấy (2026-08-13).
        // `.first()` là 処置コード vì nó đứng trước 処置名 trong DOM.
        const cdInput = list.getByRole('textbox').first()
        await cdInput.fill(PROBE_TRT_CD)
        await list.getByRole('button', { name: '検索', exact: true }).click()

        // `gridRows` = `[data-testid^="row-"]`, hợp đồng mà VirtualListTable công bố.
        //
        // Bản đầu dùng `button[aria-pressed]` và VẪN XANH — nhưng là ăn may:
        // VirtualListTable dựng hàng bằng `<div data-testid="row-…">` và KHÔNG hề
        // có `aria-pressed`; thứ khớp được là nút trên thanh F-key của chính màn
        // 一覧. Tức là "chọn dòng đầu" thực ra đang bấm một phím chức năng, rồi
        // dòng ngay sau đó bấm F9 選択 nên màn 登録 vẫn mở ra và testcase vẫn qua.
        // Sai mà xanh là dạng nguy hiểm nhất, nên ghi lại đây (2026-08-13).
        await expect(
            gridRows(list).first(),
            `lọc 処置コード ${PROBE_TRT_CD} mà 一覧 không còn dòng nào`,
        ).toBeVisible({ timeout: 30_000 })
        await gridRows(list).first().click()

        await list.getByRole('button', { name: 'F9 選択' }).click()
        await expect(register, 'F9 選択 mà dialog 登録 không mở').toBeVisible({ timeout: 30_000 })
    }

    /** Đóng một dialog / màn 一覧 bằng F10 戻る của CHÍNH nó (bẫy 2). */
    async function closeWithF10(target: Locator) {
        if (await target.isHidden().catch(() => false)) return
        await target.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(target).toBeHidden({ timeout: 10_000 })
    }

    /** Đóng hộp `alertDialog` đang mở và trả về nội dung của nó. */
    async function readAndDismissAlert(): Promise<string> {
        // alertDialog ⇒ role="alertdialog" (Rule 13), tách hẳn khỏi role="dialog".
        const alert = page.getByRole('alertdialog')
        await expect(alert, 'không có hộp cảnh báo nào bung ra').toBeVisible({ timeout: 15_000 })
        const text = (await alert.innerText()).trim()
        await alert.getByRole('button', { name: /^(OK|はい)$/ }).click()
        await expect(alert).toBeHidden({ timeout: 10_000 })
        return text
    }

    /**
     * Gõ điều kiện rồi bấm 検索, chờ LƯỚI đổi nội dung.
     *
     * Chờ theo lưới chứ không theo response là bắt buộc: `staleTime: 5 phút`
     * (queries/master-search-queries.ts) nên tìm lại CÙNG điều kiện trong 5 phút
     * KHÔNG phát sinh request nào — react-query trả thẳng từ cache.
     * `waitForResponse` ở những lượt đó treo hết 60s rồi đỏ ở chỗ chẳng liên quan
     * (đã dính đúng lần chạy đầu, 2026-08-12).
     *
     * Mốc "đổi nội dung" là danh sách ô của `colId`. Không dùng số dòng: hai kết
     * quả khác nhau vẫn có thể cùng số dòng hiển thị vì lưới virtualized.
     */
    async function runSearch(popup: Locator, colId: string, fill: () => Promise<void>) {
        const before = (await cells(popup, colId).allTextContents()).join('|')
        await fill()
        await popup.getByRole('button', { name: '検索', exact: true }).click()
        await expect
            .poll(async () => (await cells(popup, colId).allTextContents()).join('|'), {
                timeout: 30_000,
                message: 'bấm 検索 mà lưới không đổi nội dung',
            })
            .not.toBe(before)
        await gridSettled(popup)
    }

    /**
     * Như {@link runSearch} nhưng CÓ đọc response — chỉ dùng cho lượt tìm ĐẦU
     * TIÊN của mỗi điều kiện, lúc chắc chắn có request bay ra.
     *
     * Bắt response TRƯỚC khi click: popup nhỏ, dữ liệu master về rất nhanh, đăng
     * ký sau cái click là thua cuộc đua.
     */
    async function searchIn<T>(
        popup: Locator,
        url: RegExp,
        colId: string,
        fill: () => Promise<void>,
    ): Promise<{ rows: T[]; query: URLSearchParams }> {
        const pending = page.waitForResponse(
            (res) => url.test(res.url()) && res.request().method() === 'GET',
            { timeout: 60_000 },
        )
        await runSearch(popup, colId, fill)

        const res = await pending
        const body = (await res.json()) as { data?: T[] }
        return {
            rows: body.data ?? [],
            query: new URL(res.url()).searchParams,
        }
    }

    /** Chờ lưới của popup nạp xong: có dòng, hoặc hiện empty-state. */
    async function gridSettled(popup: Locator) {
        await expect(gridRows(popup).first().or(emptyState(popup))).toBeVisible({ timeout: 30_000 })
    }

    /** Click dòng có `cell-<colId>` bằng đúng `value`. Trả `false` nếu không có. */
    async function clickRowByCell(popup: Locator, colId: string, value: string): Promise<boolean> {
        const texts = (await cells(popup, colId).allTextContents()).map((t) => t.trim())
        const idx = texts.indexOf(value)
        if (idx < 0) return false
        await gridRows(popup).nth(idx).click()
        return true
    }

    // ── Ô của hai dialog 登録 (aria-label, luôn `exact: true` — bẫy 1) ────────
    const chkAutoLink = (slot: number) =>
        autoCalcRegister.getByRole('button', { name: `処置検索 ${slot}`, exact: true })
    // `textbox`, not `spinbutton`: the code boxes are `type="text"` +
    // `inputMode="numeric"` because HTML ignores `maxLength` on a number input and
    // WinForm caps every one of these at 3 characters (MaxLength = 3).
    const chkAutoCd = (slot: number) =>
        autoCalcRegister.getByRole('textbox', { name: `算定処置コード ${slot}`, exact: true })
    const chkAutoSb = (slot: number) =>
        autoCalcRegister.getByRole('textbox', { name: `枝番 ${slot}`, exact: true })

    const disLink = (slot: number) =>
        requiredDiseaseRegister.getByRole('button', { name: `病名検索 ${slot}`, exact: true })
    const disCd = (slot: number) =>
        requiredDiseaseRegister.getByRole('textbox', { name: `病名コード ${slot}`, exact: true })

    /**
     * 算定処置名 / 病名 là ô CHỈ ĐỌC (`<div>`, không phải input) nên không có
     * aria-label. Lấy theo cấu trúc: nó là ô CUỐI của hàng chứa ô コード.
     *
     * `locator('..')` = cha của input → hàng; `> div:last-child` = ô tên. Bám cấu
     * trúc là bất đắc dĩ; nếu hàng đổi layout thì sửa đúng một chỗ này.
     */
    const rowNameOf = (codeInput: Locator) => codeInput.locator('..').locator('> div:last-child')

    // ── Vòng đời ─────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
        page.on('request', (req) => {
            const url = req.url()
            if (TRT_SEARCH_URL.test(url) || DIS_SEARCH_URL.test(url)) searchRequests.push(url)
        })

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
        autoCalcList = listScreenWith(/自\s*動\s*算\s*定\s*一\s*覧/)
        requiredDiseaseList = listScreenWith(/必\s*要\s*病\s*名\s*一\s*覧/)
        autoCalcRegister = page.getByRole('dialog').filter({ hasText: '自 動 算 定 登 録' })
        requiredDiseaseRegister = page.getByRole('dialog').filter({ hasText: '必 要 病 名 登 録' })
        // Portal ⇒ popup là ANH EM của dialog 登録, không lồng (bẫy 4).
        trtSearch = page.getByRole('dialog').filter({ hasText: '処 置 検 索' })
        disSearch = page.getByRole('dialog').filter({ hasText: '病 名 検 索' })

        await backToEntry()
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // A. 処置検索 (frm902011) — mở từ 自動算定登録
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-TRT-ENTRY-1 — 自動算定登録 có đúng 5 link mở 処置検索', async () => {
        await openFromOptions(MENU_AUTO_CALCULATION, autoCalcList)
        await pickTreatmentAndOpenRegister(autoCalcList, autoCalcRegister)

        // Con số dòng phải là NÚT bấm được, không phải chữ trang trí — đây là
        // đường DUY NHẤT mở màn tra mã (frm203039 vẽ nó gạch chân + con trỏ tay).
        await expect(
            autoCalcRegister.getByRole('button', { name: /^処置検索 \d+$/ }),
            `phải có đúng ${CHK_AUTO_SLOT_COUNT} link 処置検索`,
        ).toHaveCount(CHK_AUTO_SLOT_COUNT)
        await step()
    })

    test('TC-TRT-OPEN-1 — mở popup là ĐÃ CÓ danh sách đầy đủ, ô lọc còn trống', async () => {
        const before = searchRequests.length
        await chkAutoLink(1).click()
        await expect(trtSearch, 'click con số dòng mà 処置検索 không mở').toBeVisible({
            timeout: 20_000,
        })

        // `postInit` gọi thẳng `getViewData()` (:201-204) với hai ô lọc còn trống.
        // Đo trên WinForm thật 2026-08-12: mở 処置検索 ra là lưới đã đầy
        // (100-0 歯科初診料 272 / 100-1 / 101-0 …). Bản port đầu của tôi để lưới
        // trống kèm chữ 「検索条件を入力してください。」 — sai, đó là màn khác.
        await expect(scroller(trtSearch), 'lưới của popup chưa dựng').toBeVisible({
            timeout: 20_000,
        })
        await gridSettled(trtSearch)
        const shown = await gridRows(trtSearch).count()
        expect(shown, 'mở popup mà lưới trống ⇒ không tự nạp như WinForm').toBeGreaterThan(0)
        expect(
            searchRequests.length - before,
            'mở popup mà không gọi /master-search/treatments',
        ).toBeGreaterThan(0)

        // Ô lọc phải trống — danh sách đầy đủ là kết quả của điều kiện RỖNG.
        await expect(trtSearch.getByRole('textbox').first()).toHaveValue('')
        await expect(trtSearch.getByRole('spinbutton').first()).toHaveValue('')
        console.log(`処置検索 mở ra: ${shown} dòng đang render`)
        await step()
    })

    test('TC-TRT-EMPTY-1 — tìm không ra → E00003, rồi F9 選択 → E00007', async () => {
        // Hai mã KHÁC nhau và ra từ hai chỗ khác nhau: E00003 là của `getViewData`
        // (:219-223) khi kết quả 0 dòng, E00007 là của `btnF9_Click` (:164-174)
        // khi bấm chọn mà không có gì để chọn. Gộp làm một là đổi thông điệp.
        // KHÔNG dùng `runSearch` ở đây: nó chờ lưới, mà lưới lúc này không nhìn
        // thấy được (bẫy 8 — alertDialog che cả cây a11y). Đọc hộp thoại trước.
        await trtSearch.getByRole('textbox').first().fill(NO_MATCH_WORD)
        await trtSearch.getByRole('button', { name: '検索', exact: true }).click()
        expect(await readAndDismissAlert(), 'tìm 0 dòng phải báo E00003').toContain(E00003)

        await expect(gridRows(trtSearch)).toHaveCount(0)
        await expect(emptyState(trtSearch), 'lưới rỗng mà không hiện emptyText').toBeVisible()

        await trtSearch.getByRole('button', { name: 'F9 選択' }).click()
        expect(await readAndDismissAlert(), 'F9 với lưới rỗng phải báo E00007').toContain(E00007)

        // Báo xong popup phải CÒN mở — người dùng nhập lại điều kiện, không bị
        // đẩy về dialog 登録.
        await expect(trtSearch, 'báo lỗi xong popup bị đóng mất').toBeVisible()
        await step()
    })

    test('TC-TRT-SEARCH-1 — lọc 処置名 chạy trên cột ĐANG HIỂN THỊ (cct_nm)', async () => {
        const { rows, query } = await searchIn<TrtSearchRowWire>(
            trtSearch,
            TRT_SEARCH_URL,
            'dspCd',
            async () => {
                await trtSearch.getByRole('textbox').first().fill(TRT_SEARCH_WORD)
            },
        )
        expect(query.get('nm'), 'điều kiện 処置名 không lên query string').toBe(TRT_SEARCH_WORD)
        skipWithReason(
            rows.length === 0,
            `処置マスタ của máy này không có 処置名 nào chứa 「${TRT_SEARCH_WORD}」 — đổi TEST_TRT_WORD`,
        )

        trtRows = rows

        // Mọi dòng trả về phải chứa từ khoá Ở CỘT ĐANG HIỂN THỊ. WinForm lọc trên
        // `cct_nm` (MstTrt.cs:1978) trong khi lưới để cột `trt_nm` rộng 0 — lọc
        // nhầm sang trt_nm thì kết quả trông "không liên quan" với người dùng.
        for (const r of rows) {
            expect(r.cctNm, `dòng ${r.dspCd} không chứa 「${TRT_SEARCH_WORD}」 ở 処置名`).toContain(
                TRT_SEARCH_WORD,
            )
        }

        await gridSettled(trtSearch)
        const shown = (await cells(trtSearch, 'cctNm').allTextContents()).map((t) => t.trim())
        expect(shown.length, 'API có dòng mà lưới không render dòng nào').toBeGreaterThan(0)
        expect(
            shown[0],
            'cột 処置名 phải hiển thị cct_nm (tên DÀI), không phải trt_nm',
        ).toBe(rows[0]!.cctNm)

        console.log(`処置検索 「${TRT_SEARCH_WORD}」 → ${rows.length} dòng`)
        await step()
    })

    test('TC-TRT-SEARCH-2 — 点数 khớp CHÍNH XÁC, không phải khoảng', async () => {
        const score = trtRows[0]?.score1
        skipWithReason(score === undefined, 'TC-TRT-SEARCH-1 không có dòng nào để lấy 点数')

        const { rows, query } = await searchIn<TrtSearchRowWire>(
            trtSearch,
            TRT_SEARCH_URL,
            'dspCd',
            async () => {
                await trtSearch.getByRole('spinbutton').first().fill(String(score))
            },
        )
        expect(query.get('score1'), '点数 không lên query string').toBe(String(score))
        // `score1 = 0` là điều kiện HỢP LỆ (mọi dòng 摘要マスタ đều 0 điểm). Nếu
        // tầng transport viết `if (params.score1)` thì tham số rơi mất và lượt
        // tìm này trả về nguyên tập của TC trước — assert dưới bắt đúng ca đó.
        expect(rows.length, 'lọc 点数 mà số dòng không đổi ⇒ tham số bị rơi').toBeLessThanOrEqual(
            trtRows.length,
        )
        for (const r of rows) {
            expect(r.score1, `dòng ${r.dspCd} có 点数 ${r.score1}, không phải ${score}`).toBe(score)
        }

        console.log(`処置検索 「${TRT_SEARCH_WORD}」 + 点数 ${score} → ${rows.length} dòng`)
        await step()
    })

    test('TC-TRT-PICK-1 — chọn dòng điền TÊN NGẮN (trt_nm), không phải tên đang hiển thị', async () => {
        // Tìm lại bằng từ khoá ban đầu để chắc chắn dòng có mặt (TC trước đã siết
        // thêm 点数). Điều kiện này đã tìm ở TC-TRT-SEARCH-1 nên react-query trả
        // từ cache — KHÔNG có request, phải chờ theo lưới (xem runSearch).
        await runSearch(trtSearch, 'dspCd', async () => {
            await trtSearch.getByRole('spinbutton').first().fill('')
            await trtSearch.getByRole('textbox').first().fill(TRT_SEARCH_WORD)
        })

        // Chọn dòng thử trong số các dòng ĐANG RENDER, không phải trong toàn bộ
        // payload: lưới là VirtualListTable nên dòng ngoài khung nhìn không có
        // trong DOM và không click được. Bỏ qua chi tiết này là test đỏ ngẫu
        // nhiên theo chiều cao cửa sổ.
        const visibleCodes = new Set(
            (await cells(trtSearch, 'dspCd').allTextContents()).map((t) => t.trim()),
        )
        twoNameRow = trtRows.find((r) => r.trtNm !== r.cctNm && visibleCodes.has(r.dspCd)) ?? null
        skipWithReason(
            twoNameRow === null,
            `không có dòng nào hiển thị có trt_nm ≠ cct_nm trong kết quả 「${TRT_SEARCH_WORD}」 ` +
                '— không chứng minh được đang điền tên nào, đổi TEST_TRT_WORD',
        )
        const row = twoNameRow!

        expect(
            await clickRowByCell(trtSearch, 'dspCd', row.dspCd),
            `không thấy dòng ${row.dspCd} trong lưới`,
        ).toBe(true)
        await trtSearch.getByRole('button', { name: 'F9 選択' }).click()
        await expect(trtSearch, 'F9 選択 xong popup phải đóng').toBeHidden({ timeout: 15_000 })

        await expect(chkAutoCd(1)).toHaveValue(String(row.trtCd))
        await expect(chkAutoSb(1)).toHaveValue(String(row.trtSb))

        // ĐÂY là assert quan trọng nhất của cả file. Lưới hiển thị `cctNm`
        // (歯科初診料) nhưng `lblCd_Click` gán `pData.trtNm` (初診). Điền tên dài thì
        // lần mở lại dialog tên sẽ tự đổi, vì đường tra tên lúc rời ô đọc trt_nm.
        const name = rowNameOf(chkAutoCd(1))
        await expect(name, '算定処置名 phải là trt_nm (tên NGẮN)').toHaveText(row.trtNm)
        await expect(name, '算定処置名 đang là cct_nm (tên DÀI) — sai cột').not.toHaveText(row.cctNm)

        slot1Code = String(row.trtCd)
        console.log(`処置検索 chọn ${row.dspCd}: điền 「${row.trtNm}」, lưới hiện 「${row.cctNm}」`)
        await step()
    })

    test('TC-TRT-REOPEN-1 — mở lại popup là dựng mới: xoá điều kiện và kết quả', async () => {
        await chkAutoLink(1).click()
        await expect(trtSearch).toBeVisible({ timeout: 20_000 })

        // frm902011 được `showDialog` mới mỗi lần ⇒ không có trạng thái nào sống
        // sót. Giữ lại kết quả cũ là bẫy người dùng: họ tưởng đang nhìn kết quả
        // của điều kiện mới.
        await expect(trtSearch.getByRole('textbox').first(), 'ô 処置名 còn giá trị cũ').toHaveValue(
            '',
        )
        await expect(trtSearch.getByRole('spinbutton').first(), 'ô 点数 còn giá trị cũ').toHaveValue(
            '',
        )
        // …và lưới trở lại DANH SÁCH ĐẦY ĐỦ, không phải kết quả lọc của lần trước
        // (mỗi lần mở là một `showDialog` mới → `postInit` → `getViewData` không
        // điều kiện).
        await gridSettled(trtSearch)
        const reopened = (await cells(trtSearch, 'dspCd').allTextContents()).map((t) => t.trim())
        expect(reopened.length, 'mở lại mà lưới trống').toBeGreaterThan(0)
        // Phải có ít nhất một mã KHÔNG nằm trong kết quả đã lọc lần trước — đó là
        // bằng chứng lưới đã nạp lại toàn bộ chứ không giữ tập cũ.
        const filtered = new Set(trtRows.map((r) => r.dspCd))
        expect(
            reopened.filter((c) => !filtered.has(c)),
            `mở lại mà mọi dòng vẫn thuộc kết quả 「${TRT_SEARCH_WORD}」 ⇒ chưa nạp lại`,
        ).not.toEqual([])
        await step()
    })

    test('TC-TRT-ESC-1 — ESC đóng popup mà KHÔNG đóng 自動算定登録 bên dưới', async () => {
        await page.keyboard.press('Escape')

        // Bất biến bắt buộc: 自動算定登録 đặt `closeOnEscape={false}` (đo trên
        // frm203039 ngày 2026-08-11: ESC không làm gì) nên dù ESC đi đâu thì
        // những gì vừa gõ cũng KHÔNG được mất.
        await expect(
            autoCalcRegister,
            'ESC làm đóng luôn 自動算定登録 ⇒ mất trắng dữ liệu đang nhập',
        ).toBeVisible()
        await expect(chkAutoCd(1), 'ESC làm mất giá trị slot 1').toHaveValue(slot1Code ?? '')

        // Còn việc ESC có đóng POPUP hay không thì WinForm chưa đo (frm902011 kế
        // thừa BaseDialog nằm trong OchaFramework.dll, không có source trong
        // repo). Chỉ ghi nhận, không đánh đỏ — Rule 15.
        if (await trtSearch.isVisible().catch(() => false)) {
            console.log('ESC: popup 処置検索 KHÔNG đóng (đang đóng bằng F10 戻る)')
            await closeWithF10(trtSearch)
        } else {
            console.log('ESC: popup 処置検索 đóng, 自動算定登録 giữ nguyên — đúng như thiết kế web')
        }
        await step()
    })

    test('TC-TRT-SLOT-3 — mở từ link 3 thì điền vào slot 3, slot 1 giữ nguyên', async () => {
        skipWithReason(twoNameRow === null, 'TC-TRT-PICK-1 đã skip')
        const row = twoNameRow!

        await chkAutoLink(3).click()
        await expect(trtSearch).toBeVisible({ timeout: 20_000 })
        await runSearch(trtSearch, 'dspCd', async () => {
            await trtSearch.getByRole('textbox').first().fill(TRT_SEARCH_WORD)
        })

        expect(await clickRowByCell(trtSearch, 'dspCd', row.dspCd)).toBe(true)
        // Enter = F9 選択 (`useWindowedEnterKey`) — đường bàn phím của WinForm.
        await page.keyboard.press('Enter')
        await expect(trtSearch, 'Enter không chọn được dòng').toBeHidden({ timeout: 15_000 })

        await expect(chkAutoCd(3), 'kết quả không rơi vào slot đã click').toHaveValue(
            String(row.trtCd),
        )
        // Popup không được biết gì về các slot khác: mở từ link nào thì chỉ slot
        // đó đổi.
        await expect(chkAutoCd(1), 'chọn cho slot 3 mà slot 1 bị ghi đè').toHaveValue(
            slot1Code ?? '',
        )
        await step()
    })

    test('TC-TRT-CLOSE-1 — F10 戻る đóng 自動算定登録 mà KHÔNG lưu', async () => {
        // Cả file không bấm 「F9 登録」 lần nào ⇒ chk_auto không bị đụng tới. F10
        // của dialog 登録, không phải của popup (bẫy 2 — hai nhãn trùng nhau).
        await closeWithF10(autoCalcRegister)
        await closeWithF10(autoCalcList)
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // B. 病名検索 (frm902010) — mở từ 必要病名登録
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-DIS-ENTRY-1 — 必要病名登録 có đúng 20 link mở 病名検索', async () => {
        await openFromOptions(MENU_REQUIRED_DISEASE, requiredDiseaseList)
        await pickTreatmentAndOpenRegister(requiredDiseaseList, requiredDiseaseRegister)

        await expect(
            requiredDiseaseRegister.getByRole('button', { name: /^病名検索 \d+$/ }),
            `phải có đúng ${INP_CHK_10_SLOT_COUNT} link 病名検索`,
        ).toHaveCount(INP_CHK_10_SLOT_COUNT)
        await step()
    })

    test('TC-DIS-OPEN-1 — mở popup là ĐÃ CÓ danh sách đầy đủ', async () => {
        const before = searchRequests.length
        await disLink(1).click()
        await expect(disSearch, 'click con số dòng mà 病名検索 không mở').toBeVisible({
            timeout: 20_000,
        })

        await expect(scroller(disSearch)).toBeVisible({ timeout: 20_000 })
        await gridSettled(disSearch)
        expect(
            await gridRows(disSearch).count(),
            'mở popup mà lưới trống ⇒ không tự nạp như WinForm',
        ).toBeGreaterThan(0)
        expect(
            searchRequests.length - before,
            'mở popup mà không gọi /master-search/diseases',
        ).toBeGreaterThan(0)
        await expect(disSearch.getByRole('textbox').first()).toHaveValue('')
        await step()
    })

    test('TC-DIS-SEARCH-1 — kết quả GỒM CẢ mã dưới 100 (病名グループ, mst_cod 34)', async () => {
        const { rows, query } = await searchIn<DisSearchRowWire>(
            disSearch,
            DIS_SEARCH_URL,
            'disCd',
            async () => {
                await disSearch.getByRole('textbox').first().fill(DIS_SEARCH_WORD)
            },
        )
        expect(query.get('nm')).toBe(DIS_SEARCH_WORD)
        skipWithReason(
            rows.length === 0,
            `không có 病名 nào chứa 「${DIS_SEARCH_WORD}」 — đổi TEST_DIS_WORD`,
        )

        // frm203037 gọi với `cdKbn.all` nên nhánh 病名マスタ KHÔNG lọc dis_cd >= 100
        // và kết quả UNION thêm mst_cod cd_type 34. Bỏ nhóm mã dưới 100 đi cho
        // "sạch" là mất đúng nửa dữ liệu mà màn này cần (325/505 dòng dữ liệu
        // migrate dùng một 病名グループ).
        const groups = rows.filter((r) => r.disCd < 100)
        expect(
            groups.length,
            `「${DIS_SEARCH_WORD}」 phải khớp vài 病名グループ (mã < 100); đang có ` +
                `${rows.map((r) => r.disCd).join(', ')}`,
        ).toBeGreaterThan(0)

        // `sbKbn.zero` ⇒ 病名コード chỉ có mã, KHÔNG kèm 枝番 (khác 処置検索).
        for (const r of rows) {
            expect(r.dspCd, `病名コード ${r.dspCd} có kèm 枝番 — sbKbn.zero bị bỏ qua`).toBe(
                String(r.disCd),
            )
        }

        await gridSettled(disSearch)
        expect((await cells(disSearch, 'disCd').allTextContents()).length).toBeGreaterThan(0)
        console.log(
            `病名検索 「${DIS_SEARCH_WORD}」 → ${rows.length} dòng, ${groups.length} nhóm mã < 100`,
        )
        await step()
    })

    test('TC-DIS-PICK-1 — chọn dòng điền cả 病名コード lẫn 病名 vào slot 1', async () => {
        const codes = (await cells(disSearch, 'disCd').allTextContents()).map((t) => t.trim())
        const names = (await cells(disSearch, 'disNm').allTextContents()).map((t) => t.trim())
        skipWithReason(codes.length === 0, 'TC-DIS-SEARCH-1 không có dòng nào')

        await gridRows(disSearch).first().click()
        await disSearch.getByRole('button', { name: 'F9 選択' }).click()
        await expect(disSearch, 'F9 選択 xong popup phải đóng').toBeHidden({ timeout: 15_000 })

        await expect(disCd(1)).toHaveValue(codes[0]!)
        // 病名 là ô CHỈ ĐỌC — không điền cả tên thì người dùng phải rời ô để BE
        // tra lại, thêm một vòng API cho dữ liệu vừa cầm trên tay.
        await expect(rowNameOf(disCd(1)), '病名 không được điền cùng lúc với mã').toHaveText(
            names[0]!,
        )
        console.log(`病名検索 chọn ${codes[0]} 「${names[0]}」`)
        await step()
    })

    test('TC-DIS-SLOT-11 — link ở CỘT PHẢI điền đúng slot 11, không lệch index', async () => {
        const slot1Before = await disCd(1).inputValue()

        // Slot 11 là dòng ĐẦU của cột phải. 20 slot chia hai cột 10 dòng bằng
        // `slice`, nên nếu index bị tính theo vị trí trong cột thay vì slot thật
        // thì chỗ này rơi vào slot 1 — chỉ cột phải mới lộ ra lỗi đó.
        await disLink(DIS_ROWS_PER_COLUMN + 1).click()
        await expect(disSearch).toBeVisible({ timeout: 20_000 })
        await runSearch(disSearch, 'disCd', async () => {
            await disSearch.getByRole('textbox').first().fill(DIS_SEARCH_WORD)
        })

        const codes = (await cells(disSearch, 'disCd').allTextContents()).map((t) => t.trim())
        skipWithReason(codes.length === 0, 'không có dòng nào để chọn')

        await gridRows(disSearch).first().click()
        await page.keyboard.press('Enter')
        await expect(disSearch).toBeHidden({ timeout: 15_000 })

        await expect(disCd(DIS_ROWS_PER_COLUMN + 1), 'kết quả không rơi vào slot 11').toHaveValue(
            codes[0]!,
        )
        await expect(disCd(1), 'chọn cho slot 11 mà slot 1 bị ghi đè').toHaveValue(slot1Before)
        await step()
    })

    test('TC-DIS-CLOSE-1 — F10 戻る đóng 必要病名登録 mà KHÔNG lưu', async () => {
        await closeWithF10(requiredDiseaseRegister)
        await closeWithF10(requiredDiseaseList)
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await step()
    })
})
