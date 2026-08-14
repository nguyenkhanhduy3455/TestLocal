import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — HAI dialog vừa được port khỏi trạng thái shell / sample data:
 *
 *   A. チェック項目設定   (frm203044) — F11 → 「9 オプション」 → 「1 チェック項目設定」
 *   B. Ｂｒサンプル       (frm203049) — 部位選択 → F9 「Br例」
 *
 * Gộp một file vì cả hai đều xuất phát từ MỘT màn `/treatments/{patNo}`: app chặn
 * ~10 login mỗi khung giờ (Rule 10.1), tách hai file là hai lần login cho cùng một
 * hành trình. Cả file chạy `serial` trên MỘT page tạo ở `beforeAll`.
 *
 * ⚠️ Ｓｔｅｐ編集 (frm203050) TỪNG là nhóm A của file này; đã tách sang
 * `step-edit-dialog.spec.ts` (2026-08-14) vì nó có thêm cả một nhóm testcase
 * liên thông với tab ガイド (trt_state → Shift+F4 / 前回 / リセット) và cần seed
 * ガイド master mới chạy được. Đừng thêm testcase STEP vào đây nữa.
 *
 * File này KHÁC `treatment-f11-menu-ported-actions.spec.ts`: file kia lo menu có
 * đúng 8 mục và bấm vào thì điều hướng tới đâu; file này lo NỘI DUNG bên trong
 * dialog. Đừng nhét testcase menu vào đây.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A. チェック項目設定 — nguồn WinForm (INP/Forms/frm203044.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - _param (:25)          `new ComboBox[19]` — 19 mục, param_20 KHÔNG dùng.
 *  - setItemData (:134-158) mục 7 → mst_cod 63; mục 17/18 → 64; còn lại → 62.
 *  - dspData (:163-201)    chk_prm rỗng → mặc định 「する」, RIÊNG 14/15/16 là
 *                          「しない」 (cd_val 9).
 *  - chkInputData (:207-220) combo chưa chọn → E00021「チェック項目」.
 *  - updateProc (:226-256) `deleteChkPrm` + `insertChkPrm` trong 1 transaction.
 *
 *  Web port — components/check-item-setting-dialog.tsx:
 *      · `DraggableDialog`; tiêu đề 'チ ェ ッ ク 項 目 設 定'.
 *      · 19 hàng KHÔNG khai trong FE: `GET /tenant/chk-prm` trả kèm `label` và
 *        `cdType` từng hàng (§3.30). Vì thế mọi assert nhãn dưới đây thực chất
 *        đang khoá **hợp đồng của BE** (Domain/Constants/CheckItemSettings.cs),
 *        không phải khoá một mảng hằng trong component.
 *      · Cột trái = mục 1-10, cột phải = 11-19 (LEFT_COLUMN_LAST_ITEM).
 *      · Combo là Radix Select ⇒ role="combobox", listbox mở qua PORTAL ở body
 *        (Rule 12.6) nên phải tìm từ `page`.
 *  queries/chk-prm-queries.ts: `enabled: open`, `staleTime: 5 phút` ⇒ mở lại
 *      trong 5 phút KHÔNG có request mới (trừ sau khi lưu → invalidate).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * B. Ｂｒサンプル — nguồn WinForm (INP/Forms/frm203049.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - getViewData (:219-264) chỉ ô mang 1 / 4 / 6 mới tính là "đã chọn";
 *                          WHERE ghép `bui{n} = <giá trị>` cho từng ô đã chọn,
 *                          cộng `cnt = <số ô đã chọn>`.
 *  - :234-238              trên + dưới cùng lúc → 「上下顎同時の処理はできません。」
 *  - :257-261              không có dòng nào → 「Brに使用できません。」
 *  - errorProc (:290-294)  cả hai nhánh đều TẮT F9 ⇒ chỉ còn đường 戻る.
 *  - defData (:300-311)    F9/Enter/double-click ghi ĐÈ `frm902003Param.bui`
 *                          bằng bui[32] của mẫu rồi đóng.
 *
 *  Web port — components/br-sample-dialog.tsx:
 *      · Radix `<Dialog>` ⇒ role="dialog"; tiêu đề 'B r サ ン プ ル'.
 *      · Hai nhánh lỗi về từ BE dưới dạng validation error gắn field `bui`
 *        (BR_SAMPLE.MIXED_JAW / BR_SAMPLE.NO_MATCH); `parseApiError` khi CÓ
 *        field error sẽ để `topMessage = null` và nhét câu tiếng Nhật vào
 *        `fieldErrors.bui` — component đọc đúng chỗ đó.
 *      · Có lỗi ⇒ **nút F9 không được render** (không phải disabled) — assert
 *        bằng `toHaveCount(0)`.
 *      · Cột 部位 là 歯式 HAI DÒNG (`formatBuiToGridDisp`, hàm trên \n hàm dưới)
 *        render trong `whitespace-pre` — thay cho đường kẻ ngang mà WinForm vẽ
 *        tay bằng `DrawGridCrossLine`.
 *
 *  Đường tới 部位選択 (chép từ virtual-list-grids.spec.ts:797 — đã chạy được):
 *      panel 病検 → nút 変更 → click 1 dòng 病検 → 部位選択 mở.
 *      Ở đó `variant` mặc định là 'inp' nên F9 「Br例」 CÓ hiện (patMsg thì không).
 *
 *  Chọn răng bằng BÀN PHÍM, không click ô (ô răng là `<button>` RỖNG, không có
 *  accessible name ⇒ không có locator ổn định):
 *      Delete       → xoá sạch 32 ô (clearBuiData)
 *      ArrowRight   → chuyển vùng RU → LU (QUAD_MOVE)
 *      '5' / '6'    → cycle răng 5 và 6 của vùng đang chọn; `nextPermVal(0) = 1`
 *                     nên một lần bấm cho đúng giá trị 1 = "có chọn".
 *      LU răng 5/6  → bui index 12/13 ⇒ vị trí 13/14 (1-based) — trong dữ liệu
 *                     demo có mẫu cnt=2 khớp (vd br_id 582: 12=2 13=1 14=1 15=2).
 *      Mẫu chỉ ràng buộc ĐÚNG các vị trí đã chọn nên các vị trí khác tự do.
 *  Nếu dữ liệu br_sample của máy khác đi thì nhánh dương tính tự SKIP kèm lý do
 *  (Rule 18) chứ không đỏ oan — đổi TEST_BR_TEETH để chỉ hai răng khác.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ghi DB
 * ═══════════════════════════════════════════════════════════════════════════
 *  Mặc định KHÔNG ghi gì: TC-CHK-SAVE-1 chặn PUT bằng `page.route` để soi
 *  payload. Testcase ghi thật duy nhất (TC-CHK-SAVE-2, chk_prm) nằm sau
 *  TEST_ALLOW_SAVE=1 (Rule 18.1) và tự trả lại giá trị cũ; `afterAll` in cảnh
 *  báo nếu nó đỏ giữa chừng và giá trị còn lệch.
 *  Spec KHÔNG bao giờ bấm F9 登録 của màn 診療入力 ⇒ không đụng lưới 処置.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `SanteiConfirmDialog` 「〜を算定しますか？」 bung sau khi lưới nạp xong, nổi
 *     ĐÈ và nuốt cả phím F11 ⇒ vét bằng `drainBlockingDialogs()` TRƯỚC mỗi lần
 *     bấm F11. `addLocatorHandler` chỉ chạy khi Playwright đang làm một ACTION,
 *     không giúp gì cho `keyboard.press`.
 *  2. `locator.isVisible({ timeout })` KHÔNG chờ — nó soi DOM ngay lúc gọi. Hộp
 *     nào cần một vòng gọi API mới bung ra thì phải dùng `appeared()`.
 *  3. Hai dialog dùng chung role="dialog" với AgentOfflineDialog và SanteiConfirm
 *     ⇒ luôn lọc bằng `hasText` của tiêu đề, đừng `.first()`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Cách chạy
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/inp-p1-ported-dialogs.spec.ts --retries=0
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/inp-p1-ported-dialogs.spec.ts --retries=0
 *
 * `--retries=0` vì retry chạy lại CẢ khối serial ⇒ thêm một lần login, tốn quota
 * (Rule 10.1). Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19): khối serial
 * dùng chung một page và thứ tự CÓ Ý NGHĨA.
 *
 * ⚠️ KHÔNG dùng `--repeat-each` với file này (ngoại lệ của Rule 16).
 * `--repeat-each=N` lặp TỪNG TESTCASE N lần liên tiếp, không lặp cả file — nó
 * phá đúng cái mà `serial` xây: mỗi testcase ở đây kết thúc bằng việc dọn trạng
 * thái cho testcase SAU, nên lượt 2 của chính nó chạy trên một trạng thái khác
 * hẳn và đỏ. Triệu chứng trông hệt như flaky của app nhưng không phải. Muốn kiểm
 * độ ổn định thì lặp CẢ FILE:
 *
 *   for i in 1 2 3; do npx playwright test tests/inp-p1-ported-dialogs.spec.ts --retries=0; done
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

/** Cho phép GHI THẬT chk_prm. Mặc định tắt (Rule 18.1). */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

const GRID_LOAD_TIMEOUT = 60_000

// ── URL các endpoint hai màn này đụng tới ────────────────────────────────────
const CHK_PRM_URL = /\/tenant\/chk-prm(\?|$)/
const BR_SAMPLES_URL = /\/tenant\/br-samples\?/

// ── Nhãn menu, lấy nguyên văn từ F11_MENU_ITEMS ──────────────────────────────
const MENU_OPTIONS = '9 オプション'
const MENU_CHECK_ITEM = '1 チェック項目設定'

/** MouthConstants.AdultBuiCount — số 部位 của một vector 歯式. */
const BUI_COLUMN_COUNT = 32
/** Ranh giới hàm trên / hàm dưới trong vector 32 ô. */
const HALF_ARCH = BUI_COLUMN_COUNT / 2

// ── A. チェック項目設定 ──────────────────────────────────────────────────────
/** CheckItemSettings.ItemCount. */
const CHK_ITEM_COUNT = 19
/** check-item-setting-dialog.tsx LEFT_COLUMN_LAST_ITEM. */
const LEFT_COLUMN_LAST_ITEM = 10

/**
 * 19 nhãn + cd_type, chép từ BE `Domain/Constants/CheckItemSettings.cs`.
 *
 * Đây là hợp đồng BE↔FE (§3.30): FE không khai lại bảng này, nó đọc từ
 * `GET /tenant/chk-prm`. Testcase vì thế là chỗ DUY NHẤT khoá được nội dung.
 */
const CHK_ITEMS = [
    { no: 1, label: '歯種チェック１', cdType: 62 },
    { no: 2, label: '歯種チェック２', cdType: 62 },
    { no: 3, label: '歯数・ブロック数チェック', cdType: 62 },
    { no: 4, label: '病名チェック', cdType: 62 },
    { no: 5, label: '部位・病名繰越し', cdType: 62 },
    { no: 6, label: '歯周基本指導の算定漏れ', cdType: 62 },
    { no: 7, label: '歯科疾患管理料の算定漏れ', cdType: 63 },
    { no: 8, label: 'Ｐ基処の算定漏れ', cdType: 62 },
    { no: 9, label: '調Ａの算定漏れ', cdType: 62 },
    { no: 10, label: '調Ｂの算定漏れ', cdType: 62 },
    { no: 11, label: '調Ｃの算定漏れ', cdType: 62 },
    { no: 12, label: 'ＤⅠの算定漏れ', cdType: 62 },
    { no: 13, label: 'ＤⅡの算定漏れ', cdType: 62 },
    { no: 14, label: '調剤料と薬剤の算定漏れ', cdType: 62 },
    { no: 15, label: '調剤料と処方の算定漏れ', cdType: 62 },
    { no: 16, label: '処方と薬剤の算定漏れ', cdType: 62 },
    { no: 17, label: 'Ｐ部位分割', cdType: 64 },
    { no: 18, label: 'Ｇ部位分割', cdType: 64 },
    { no: 19, label: '歯清の算定漏れ', cdType: 62 },
] as const

/** cd_val của mst_cod 63 「２回目以降」 — chỉ mục 7 nhận được giá trị này. */
const CHK_VAL_SECOND_ONWARDS = 2
/** Mục dùng để đổi thử (mục duy nhất có cd_type 63). */
const CHK_PROBE_NO = 7

// ── B. Ｂｒサンプル ──────────────────────────────────────────────────────────
/**
 * Hai răng của vùng LU (hàm trên bên trái) sẽ được chọn để tìm mẫu Br.
 * LU răng N nằm ở bui index `8 + (N-1)` ⇒ vị trí 1-based `9 + (N-1)`.
 * Mặc định 5/6 ⇒ vị trí 13/14; đổi khi dữ liệu br_sample của máy khác đi.
 */
const BR_TEETH = (process.env.TEST_BR_TEETH ?? '5,6').split(',').map((s) => s.trim())
/** ListBrSamplesHandler.BridgeBuiValues — chỉ 3 giá trị này tính là "đã chọn". */
const BRIDGE_BUI_VALUES = [1, 4, 6]

interface SaveChkPrmBody {
    values: number[]
}
interface ChkPrmItem {
    no: number
    label: string
    cdType: number
    value: number
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 2 dialog vừa port (チェック項目設定 / Brサンプル)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu 選択 của F11. Lọc theo '1 メニュー' để không dính submenu. */
    let rowMenu: Locator
    /** A. チェック項目設定. */
    let chkDialog: Locator
    /** B. Ｂｒサンプル. */
    let brDialog: Locator
    /** 部位選択 (frm902003) — dialog cha của Ｂｒサンプル. */
    let toothDialog: Locator

    /** Payload chk_prm bắt được lúc mở lần đầu. */
    let loadedChkItems: ChkPrmItem[] | null = null
    /** Giá trị gốc của mục 7, để trả lại. */
    let chkProbeBefore: number | null = null

    // ── Helper dùng chung ────────────────────────────────────────────────────

    /**
     * `true` nếu locator HIỆN RA trong `timeout`.
     *
     * KHÔNG dùng `locator.isVisible({ timeout })`: nó soi DOM ngay lúc gọi và
     * trả về liền, `timeout` chỉ bó thao tác nội bộ chứ không chờ phần tử xuất
     * hiện (bẫy đã đo được ở treatment-f11-menu-ported-actions).
     */
    async function appeared(locator: Locator, timeout: number): Promise<boolean> {
        return locator
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    /** Về lại màn 診療入力 của bệnh nhân test và chờ lưới dựng xong. */
    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        // Header 患者情報 render 「合計:」 = màn detail đã sẵn sàng nhận F11.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * Dọn mọi hộp tự bung ra sau khi lưới nạp xong, cho tới khi màn hình sạch.
     *
     * HAI loại, và cả hai đều PHẢI dọn:
     *  a. `SanteiConfirmDialog` 「〜を算定しますか？」 — bấm **No** (Rule 14.1: Yes
     *     lại đẻ ra hộp khác).
     *  b. `CmtAutoPickerDialog` 「カルテ記載選択」 — `Chk_CmtAuto` mở nó khi
     *     カルテコメント của 処置 cần người chọn (≥2 dòng no_chk=0). Nó KHÔNG đi
     *     kèm hộp 算定 nào nên `addLocatorHandler` không bắt được.
     *
     * ĐÃ ĐO ĐƯỢC (2026-08-11): bỏ sót (b) là hỏng dây chuyền, và triệu chứng
     * KHÔNG hề giống nguyên nhân — `fkey-scope-provider` có "modal-dialog guard"
     * (fkey-scope-provider.tsx:76-85): hễ còn một `[role=dialog]` mở mà scope
     * topmost không nằm trong nó thì mọi F-key bị `preventDefault` và NUỐT. Kết
     * quả: F11 im lặng không làm gì, còn nút 「F11 選択」 thì `pointer-events-none`
     * (fkey-bar.tsx:222) nên click cũng bị chính thanh F-key chặn lại. Cả hai
     * đường vào menu đều chết vì một dialog nằm ở chỗ khác.
     *
     * Đóng 「カルテ記載選択」 bằng F10 戻る = `onOpenChange(false)` — huỷ, KHÔNG
     * ghi gì (F9 確定 mới là đường ghi comment vào lưới).
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
     * Mở menu 選択 — BẤM NÚT F11 trên footer, không dùng `keyboard.press('F11')`.
     *
     * ĐÃ ĐO ĐƯỢC (2026-08-11): trên màn `/treatments/{patNo}` vừa `goto` xong,
     * `keyboard.press('F11')` KHÔNG mở được menu — bấm 3 lần vẫn không có
     * `role="menu"` nào, trong khi a11y tree cho thấy nút 「F11 選択」 vẫn ở đó và
     * màn hình đã nạp đủ (患者番号: 12138 / 合計: 162 点). Phím chỉ tới được
     * FKeyScopeProvider khi tiêu điểm bàn phím nằm trong phạm vi nó nghe; sau
     * `page.goto` thì không có gì được focus nên phím rơi vào khoảng không.
     *
     * `data-fkey` được FKeyBar gắn đúng cho mục đích này (fkey-bar.tsx:203) và
     * ổn định hơn nhãn 「F11 選択」 — nhãn đổi theo màn, thuộc tính thì không.
     *
     * Vét hộp 算定 TRƯỚC: nó nổi đè và nuốt cả click lẫn phím.
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

    /** F11 → hover 「9 オプション」 → click một mục con. Submenu mở bằng HOVER, click là toggle. */
    async function openFromOptions(itemLabel: string, target: Locator) {
        if (await target.isVisible().catch(() => false)) return
        await openMenu()
        await rowMenu.getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub, 'submenu 9 オプション không mở ra').toBeVisible({ timeout: 10_000 })
        await sub.getByRole('button', { name: itemLabel, exact: true }).click()
        await expect(target, `bấm 「${itemLabel}」 mà dialog không mở`).toBeVisible({
            timeout: 30_000,
        })
    }

    /** Đóng một dialog bằng F10 戻る (không lưu gì). */
    async function closeWithF10(target: Locator) {
        if (await target.isHidden().catch(() => false)) return
        await target.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(target).toBeHidden({ timeout: 10_000 })
    }

    /** Mở combo Radix, trả nhãn mọi mục, rồi đóng mà KHÔNG chọn gì. */
    async function optionsOf(combo: Locator): Promise<string[]> {
        await combo.click()
        // Radix render listbox qua PORTAL ở body ⇒ tìm từ `page` (Rule 12.6).
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        const labels = (await listbox.getByRole('option').allInnerTexts()).map((t) => t.trim())
        await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 10_000 })
        return labels
    }

    /**
     * Chọn mục có nhãn CHỨA `text`. Dùng cho combo mst_cod: thứ tự các mục do
     * server quyết định nên chọn theo vị trí là đặt cược vào thứ tự đó.
     */
    async function pickOptionByText(combo: Locator, text: string): Promise<void> {
        await combo.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        await listbox.getByRole('option').filter({ hasText: text }).first().click()
        await expect(listbox).toBeHidden({ timeout: 10_000 })
        await expect(combo).toContainText(text)
    }

    /** Chọn mục thứ `index` của một combo Radix, trả về nhãn đã chọn. */
    async function pickOption(combo: Locator, index: number): Promise<string> {
        await combo.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        const opt = listbox.getByRole('option').nth(index)
        const label = (await opt.innerText()).trim()
        await opt.click()
        await expect(listbox).toBeHidden({ timeout: 10_000 })
        await expect(combo).toContainText(label)
        return label
    }

    // ── A. チェック項目設定 ─────────────────────────────────────────────────
    /** Hàng của một mục = CHA của phần tử mang đúng nhãn đó (Rule 12.1). */
    const chkRowOf = (label: string) => chkDialog.getByText(label, { exact: true }).locator('..')
    const chkComboOf = (label: string) => chkRowOf(label).getByRole('combobox')

    /** Đọc `chk_prm.param_{no}` thẳng từ DB. Chưa lưu bao giờ → null. */
    async function readChkPrmParam(no: number): Promise<number | null> {
        return withDb(async (c) => {
            const r = await c.query<{ v: number | null }>(
                `SELECT param_${no} AS v FROM view_chk_prm_active ORDER BY updated_at DESC LIMIT 1`,
            )
            const v = r.rows[0]?.v
            return v === undefined || v === null ? null : Number(v)
        })
    }

    // ── B. Ｂｒサンプル ──────────────────────────────────────────────────────

    /**
     * Mở 部位選択 qua panel 病検 → 変更 → click dòng đầu.
     *
     * Không có đường trực tiếp nào ngắn hơn; route này đã chạy được ở
     * virtual-list-grids.spec.ts:797. Trả về `false` khi panel 病検 rỗng — hồ sơ
     * test không có 病名 nào thì cả nhóm C tự skip kèm lý do (Rule 18).
     */
    async function openToothDialog(): Promise<boolean> {
        if (await toothDialog.isVisible().catch(() => false)) return true
        await drainBlockingDialogs()
        await page
            .getByRole('button', { name: '病検', exact: true })
            .click()
            .catch(() => {})
        const changeBtn = page.getByRole('button', { name: '変更', exact: true })
        if (!(await appeared(changeBtn, 15_000))) return false
        await changeBtn.click()

        const byoRows = page.locator('div[class*="grid-cols-[30px_270px_1fr]"]')
        if (!(await appeared(byoRows.nth(1), 20_000))) return false
        await byoRows.nth(1).click()
        return appeared(toothDialog, 20_000)
    }

    /**
     * Xoá sạch rồi chọn đúng hai răng của vùng LU bằng bàn phím.
     *
     * Delete → clearBuiData; ArrowRight → RU→LU; phím số cycle răng đó, và
     * `nextPermVal(0) = 1` nên một lần bấm cho giá trị 1 = "có chọn".
     */
    async function selectUpperLeftTeeth(teeth: readonly string[]) {
        await page.keyboard.press('Delete')
        await page.keyboard.press('ArrowRight')
        for (const t of teeth) await page.keyboard.press(t)
    }

    /** Mở Ｂｒサンプル từ 部位選択 (F9 「Br例」), chờ dialog dựng xong. */
    async function openBrSample() {
        await toothDialog.getByRole('button', { name: 'F9 Br例' }).click()
        await expect(brDialog, 'F9 Br例 mà dialog Ｂｒサンプル không mở').toBeVisible({
            timeout: 30_000,
        })
    }

    /** Đóng Ｂｒサンプル (F10 戻る) — không đụng tới 部位選択 bên dưới. */
    async function closeBrSample() {
        await brDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(brDialog).toBeHidden({ timeout: 10_000 })
    }

    // ── Vòng đời ─────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // AutoSantei bung 「〜を算定しますか？」 sau MỖI lần vào lại màn 診療入力.
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
        chkDialog = page.getByRole('dialog').filter({ hasText: 'チ ェ ッ ク 項 目 設 定' })
        brDialog = page.getByRole('dialog').filter({ hasText: 'B r サ ン プ ル' })
        toothDialog = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ })

        await backToEntry()
    })

    test.afterAll(async () => {
        // Lưới an toàn: testcase ghi thật đỏ giữa chừng thì giá trị nằm lại ở bản thử.
        if (ALLOW_SAVE && dbEnabled) {
            if (chkProbeBefore !== null) {
                const now = await readChkPrmParam(CHK_PROBE_NO).catch(() => null)
                if (now !== null && now !== chkProbeBefore) {
                    console.log(
                        `afterAll: chk_prm.param_${CHK_PROBE_NO} = ${now}, ` +
                            `gốc là ${chkProbeBefore} — KHÔI PHỤC THỦ CÔNG.`,
                    )
                }
            }
        }
        await page?.close()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // A. チェック項目設定 (frm203044)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-CHK-OPEN-1 — mở dialog và nạp 19 mục từ GET /tenant/chk-prm', async () => {
        const res = page.waitForResponse(
            (r) => CHK_PRM_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: 60_000 },
        )
        await openFromOptions(MENU_CHECK_ITEM, chkDialog)

        const body = (await (await res).json()) as {
            data?: { isConfigured?: boolean; items?: ChkPrmItem[] }
        }
        loadedChkItems = (body.data?.items ?? []).map((i) => ({
            no: Number(i.no),
            label: i.label,
            cdType: Number(i.cdType),
            value: Number(i.value),
        }))
        expect(loadedChkItems, `phải trả đủ ${CHK_ITEM_COUNT} mục`).toHaveLength(CHK_ITEM_COUNT)
        console.log(
            `chk_prm isConfigured=${String(body.data?.isConfigured)} — ` +
                `false nghĩa là đang hiện GIÁ TRỊ MẶC ĐỊNH của WinForm, chưa từng lưu.`,
        )
        await step()
    })

    test('TC-CHK-ROWS-1 — đủ 19 nhãn + 19 combo, đúng nguyên văn WinForm', async () => {
        // Nhãn do BE gửi xuống (§3.30) ⇒ đây là chỗ DUY NHẤT khoá được nội dung
        // của CheckItemSettings.cs. Sai một chữ là màn hình nói sai với người dùng.
        for (const { label } of CHK_ITEMS) {
            await expect(chkDialog.getByText(label, { exact: true }), `thiếu mục 「${label}」`)
                .toBeVisible()
        }
        await expect(
            chkDialog.getByRole('combobox'),
            'phải đúng 19 combo — param_20 không có ô trên màn (frm203044._param = 19)',
        ).toHaveCount(CHK_ITEM_COUNT)
        await step()
    })

    test('TC-CHK-ROWS-2 — cột trái mục 1-10, cột phải mục 11-19', async () => {
        // Bố cục Designer: đọc theo TOẠ ĐỘ chứ không theo thứ tự DOM, vì grid
        // 2 cột render hai <div> riêng.
        const leftLast = await chkRowOf(CHK_ITEMS[LEFT_COLUMN_LAST_ITEM - 1]!.label).boundingBox()
        const rightFirst = await chkRowOf(CHK_ITEMS[LEFT_COLUMN_LAST_ITEM]!.label).boundingBox()
        expect(leftLast, `không tìm thấy mục ${LEFT_COLUMN_LAST_ITEM}`).not.toBeNull()
        expect(rightFirst, `không tìm thấy mục ${LEFT_COLUMN_LAST_ITEM + 1}`).not.toBeNull()
        if (!leftLast || !rightFirst) return
        expect(
            rightFirst.x,
            `mục ${LEFT_COLUMN_LAST_ITEM + 1} phải nằm ở CỘT PHẢI của mục ${LEFT_COLUMN_LAST_ITEM}`,
        ).toBeGreaterThan(leftLast.x)
        await step()
    })

    test('TC-CHK-COMBO-1 — mỗi mục đổ đúng cd_type của nó (62 / 63 / 64)', async () => {
        // frm203044.setItemData: mục 7 → 63 (3 mục), 17/18 → 64 (3 mục), còn lại
        // → 62 (2 mục). Số lượng option là dấu hiệu quan sát được của cd_type.
        const probes = [
            { no: 1, expected: 2 },
            { no: 7, expected: 3 },
            { no: 17, expected: 3 },
            { no: 18, expected: 3 },
            { no: 19, expected: 2 },
        ]
        for (const { no, expected } of probes) {
            const item = CHK_ITEMS[no - 1]!
            const opts = await optionsOf(chkComboOf(item.label))
            expect(
                opts.length,
                `mục ${no}「${item.label}」 phải đổ từ mst_cod ${item.cdType} (${expected} mục), ` +
                    `đang có ${opts.length}: ${opts.join(' / ')}`,
            ).toBe(expected)
        }
        await step()
    })

    test('TC-CHK-LOAD-1 — 19 combo mang đúng giá trị payload', async () => {
        expect(loadedChkItems, 'TC-CHK-OPEN-1 chưa bắt được response').not.toBeNull()
        // Không tra ngược cd_val → nhãn (phải đọc mst_cod); chốt "combo không rỗng"
        // cho cả 19 mục, và giá trị chính xác được kiểm ở chiều GHI (TC-CHK-SAVE-*).
        for (const { label } of CHK_ITEMS) {
            await expect(
                chkComboOf(label),
                `combo 「${label}」 rỗng — giá trị từ chk_prm không tới được màn hình`,
            ).not.toBeEmpty()
        }
        await step()
    })

    test('TC-CHK-SAVE-1 — F9 gửi ĐÚNG 19 giá trị theo THỨ TỰ mục', async () => {
        expect(loadedChkItems, 'TC-CHK-OPEN-1 chưa bắt được response').not.toBeNull()
        chkProbeBefore = loadedChkItems!.find((i) => i.no === CHK_PROBE_NO)?.value ?? null

        // Đổi mục 7 sang 「２回目以降」 (cd_val 2) — giá trị mà KHÔNG mục nào khác
        // nhận được, nên nếu payload lệch vị trí là lộ ra ngay.
        const secondOnwards = CHK_ITEMS[CHK_PROBE_NO - 1]!
        const opts = await optionsOf(chkComboOf(secondOnwards.label))
        expect(
            opts.some((o) => o.includes('２回目以降')),
            `mst_cod 63 phải có mục 「２回目以降」, đang có: ${opts.join(' / ')}`,
        ).toBe(true)
        await pickOptionByText(chkComboOf(secondOnwards.label), '２回目以降')

        let sent: SaveChkPrmBody | null = null
        // CHẶN request ⇒ KHÔNG ghi DB.
        await page.route(CHK_PRM_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            sent = req.postDataJSON() as SaveChkPrmBody
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: true }),
            })
        })

        try {
            await chkDialog.getByRole('button', { name: 'F9 登録' }).click()
            await expect(chkDialog, 'lưu xong thì dialog phải đóng').toBeHidden({ timeout: 30_000 })
        } finally {
            await page.unroute(CHK_PRM_URL)
        }

        expect(sent, 'không bắt được PUT /tenant/chk-prm').not.toBeNull()
        expect(sent!.values, `phải gửi đúng ${CHK_ITEM_COUNT} giá trị`).toHaveLength(CHK_ITEM_COUNT)
        expect(
            sent!.values[CHK_PROBE_NO - 1],
            `param_${CHK_PROBE_NO} phải mang cd_val 2 — payload là MẢNG THEO VỊ TRÍ, ` +
                'lệch một ô là ghi nhầm mục',
        ).toBe(CHK_VAL_SECOND_ONWARDS)
        // Chỉ mục 7/17/18 mới nhận được 2; các mục cd_type 62 chỉ có 1 hoặc 9.
        for (const item of CHK_ITEMS) {
            if (item.cdType !== 62) continue
            expect(
                [1, 9],
                `mục ${item.no}「${item.label}」 là cd_type 62 nên chỉ được 1 hoặc 9`,
            ).toContain(sent!.values[item.no - 1])
        }
        await step()
    })

    test('TC-CHK-SAVE-2 — ghi THẬT chk_prm rồi mở lại vẫn còn (TEST_ALLOW_SAVE=1)', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'ghi thật chk_prm — cấu hình TOÀN PHÒNG KHÁM, đổi cả luật check. ' +
                'Đặt TEST_ALLOW_SAVE=1 để chạy',
        )
        expect(chkProbeBefore, 'TC-CHK-SAVE-1 chưa chốt được giá trị gốc').not.toBeNull()

        await openFromOptions(MENU_CHECK_ITEM, chkDialog)
        const probeLabel = CHK_ITEMS[CHK_PROBE_NO - 1]!.label
        await pickOptionByText(chkComboOf(probeLabel), '２回目以降')

        const putRes = page.waitForResponse(
            (r) => CHK_PRM_URL.test(r.url()) && r.request().method() === 'PUT',
            { timeout: 60_000 },
        )
        await chkDialog.getByRole('button', { name: 'F9 登録' }).click()
        expect((await putRes).status(), 'PUT chk-prm phải 2xx').toBeLessThan(300)
        await expect(chkDialog).toBeHidden({ timeout: 30_000 })

        if (dbEnabled) {
            expect(
                await readChkPrmParam(CHK_PROBE_NO),
                'PUT trả 2xx nhưng chk_prm không đổi — delete+insert không tới DB',
            ).toBe(CHK_VAL_SECOND_ONWARDS)
            // updateProc là delete + insert ⇒ phải còn ĐÚNG MỘT dòng active, nếu
            // không thì mỗi lần lưu là thêm một cấu hình và luật check thành ngẫu nhiên.
            const activeRows = await withDb(async (c) => {
                const r = await c.query<{ n: string }>(
                    `SELECT count(*)::text AS n FROM view_chk_prm_active`,
                )
                return Number(r.rows[0]?.n ?? 0)
            })
            expect(activeRows, 'chk_prm phải còn đúng 1 dòng active sau khi lưu').toBe(1)
        }

        await openFromOptions(MENU_CHECK_ITEM, chkDialog)
        await expect(
            chkComboOf(probeLabel),
            'lưu xong mở lại phải thấy 「２回目以降」',
        ).toContainText('２回目以降')
        await step()

        // Trả lại giá trị gốc — mst_cod 63: 1 = する, 2 = ２回目以降, 9 = しない.
        const backLabel =
            chkProbeBefore === CHK_VAL_SECOND_ONWARDS
                ? '２回目以降'
                : chkProbeBefore === 9
                  ? 'しない'
                  : 'する'
        await pickOptionByText(chkComboOf(probeLabel), backLabel)
        await chkDialog.getByRole('button', { name: 'F9 登録' }).click()
        await expect(chkDialog).toBeHidden({ timeout: 30_000 })
        await step()
    })

    test('TC-CHK-CLOSE-1 — F10 戻る không lưu, mở lại bỏ chỉnh sửa dở', async () => {
        await openFromOptions(MENU_CHECK_ITEM, chkDialog)
        const probeLabel = CHK_ITEMS[0]!.label
        const seeded = (await chkComboOf(probeLabel).innerText()).trim()

        const opts = await optionsOf(chkComboOf(probeLabel))
        const otherIdx = opts.findIndex((o) => o !== seeded)
        expect(otherIdx, `combo 「${probeLabel}」 chỉ có 1 mục — không đổi thử được`)
            .toBeGreaterThanOrEqual(0)
        await pickOption(chkComboOf(probeLabel), otherIdx)

        let putSeen = false
        await page.route(CHK_PRM_URL, async (route: Route) => {
            if (route.request().method() !== 'PUT') return route.fallback()
            putSeen = true
            await route.abort()
        })
        try {
            await closeWithF10(chkDialog)
        } finally {
            await page.unroute(CHK_PRM_URL)
        }
        expect(putSeen, 'F10 戻る mà vẫn ghi').toBe(false)

        await openFromOptions(MENU_CHECK_ITEM, chkDialog)
        await expect(
            chkComboOf(probeLabel),
            'mở lại phải lấy lại giá trị đã lưu, không giữ chỉnh sửa dở',
        ).toContainText(seeded)
        await closeWithF10(chkDialog)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // B. Ｂｒサンプル (frm203049)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-BR-OPEN-1 — 部位選択 → F9 Br例 mở dialog, gửi ĐỦ 32 ô lên BE', async () => {
        await backToEntry()
        const opened = await openToothDialog()
        skipWithReason(
            !opened,
            'không mở được 部位選択 (panel 病検 rỗng) — đổi TEST_PAT_NO sang hồ sơ có 病名',
        )

        await selectUpperLeftTeeth(BR_TEETH)
        await step()

        const req = page.waitForRequest((r) => BR_SAMPLES_URL.test(r.url()), { timeout: 60_000 })
        await openBrSample()

        const params = new URL((await req).url()).searchParams.getAll('bui')
        expect(
            params,
            'phải gửi ĐỦ 32 ô — BE validator chặn mọi độ dài khác, và vị trí là ' +
                'thứ quyết định mẫu nào khớp',
        ).toHaveLength(BUI_COLUMN_COUNT)

        const selected = params
            .map((v, i) => ({ pos: i + 1, val: Number(v) }))
            .filter((c) => BRIDGE_BUI_VALUES.includes(c.val))
        console.log(
            `Br例 gửi lên: ${selected.map((c) => `${c.pos}=${c.val}`).join(' ')} (cnt=${selected.length})`,
        )
        expect(
            selected.length,
            `bấm ${BR_TEETH.join('/')} mà không ô nào mang 1/4/6 — phím số không tới được lưới`,
        ).toBe(BR_TEETH.length)
        // Tất cả phải thuộc HÀM TRÊN (vị trí 1..16), nếu không thì ArrowRight đã
        // nhảy sai vùng và testcase kế sẽ đỏ vì lý do khác hẳn.
        expect(
            selected.every((c) => c.pos <= HALF_ARCH),
            'răng đã chọn không nằm hết ở hàm trên — kiểm lại QUAD_MOVE / TEST_BR_TEETH',
        ).toBe(true)
        await step()
    })

    test('TC-BR-LIST-1 — có mẫu khớp thì hiện lưới 番号 + 部位 hai dòng', async () => {
        // Nhánh phụ thuộc DỮ LIỆU: máy nào br_sample khác đi thì SKIP kèm lý do,
        // không đỏ oan (Rule 18).
        const errorShown = await appeared(brDialog.getByText('Brに使用できません。'), 5_000)
        skipWithReason(
            errorShown,
            `br_sample không có mẫu nào khớp 2 răng ${BR_TEETH.join('/')} của hàm trên — ` +
                'đổi TEST_BR_TEETH sang cặp răng có mẫu',
        )

        await expect(brDialog.getByText('番号', { exact: true })).toBeVisible()
        await expect(brDialog.getByText('部位', { exact: true })).toBeVisible()

        const rows = brDialog.locator('button[aria-pressed]')
        await expect(rows.first(), 'không có dòng mẫu nào dựng ra').toBeVisible({ timeout: 20_000 })
        // Rule 10.8 — chờ xong mới đếm.
        const n = await rows.count()
        expect(n, 'lưới rỗng mà không báo lỗi gì').toBeGreaterThan(0)
        console.log(`Ｂｒサンプル: ${n} mẫu khớp`)

        // Cột 部位 là 歯式 HAI DÒNG (hàm trên \n hàm dưới) — bản web thay cho đường
        // kẻ ngang WinForm vẽ tay trong DrawGridCrossLine.
        const firstPart = await rows.first().innerText()
        expect(
            firstPart.split('\n').length,
            `cột 部位 phải là 歯式 2 dòng, đang là: ${JSON.stringify(firstPart)}`,
        ).toBeGreaterThanOrEqual(2)

        await expect(
            brDialog.getByRole('button', { name: 'F9 確定' }),
            'có mẫu mà không cho 確定',
        ).toBeVisible()
        await step()
    })

    test('TC-BR-CONFIRM-1 — F9 確定 ghi ĐÈ lựa chọn của 部位選択 rồi đóng', async () => {
        const rows = brDialog.locator('button[aria-pressed]')
        skipWithReason(
            !(await appeared(rows.first(), 5_000)),
            'TC-BR-LIST-1 đã skip — không có mẫu để chọn',
        )

        await rows.first().click()
        await brDialog.getByRole('button', { name: 'F9 確定' }).click()
        await expect(brDialog, 'F9 確定 mà dialog không đóng').toBeHidden({ timeout: 15_000 })
        await expect(toothDialog, '部位選択 bên dưới phải còn mở').toBeVisible()
        await step()

        // defData GHI ĐÈ toàn bộ bui[32] — chứng minh bằng cách mở lại Br例 và soi
        // request mới: lựa chọn phải KHÁC lúc đầu (mẫu Br có cả răng trụ giá trị 2).
        const req = page.waitForRequest((r) => BR_SAMPLES_URL.test(r.url()), { timeout: 60_000 })
        await openBrSample()
        const after = (await req).url()
        const afterSel = new URL(after).searchParams
            .getAll('bui')
            .map((v, i) => ({ pos: i + 1, val: Number(v) }))
            .filter((c) => c.val !== 0)
        console.log(
            `sau khi áp mẫu, 部位選択 đang giữ: ${afterSel.map((c) => `${c.pos}=${c.val}`).join(' ')}`,
        )
        expect(
            afterSel.length,
            'áp mẫu Br xong mà lựa chọn không đổi gì — onConfirm không tới được 部位選択',
        ).toBeGreaterThan(BR_TEETH.length)
        await closeBrSample()
        await step()
    })

    test('TC-BR-ERR-1 — chọn CẢ hai hàm thì báo 上下顎同時 và KHÔNG cho 確定', async () => {
        // F7 全顎 chọn toàn bộ 32 răng ⇒ chắc chắn dính cả hai hàm, không phụ thuộc
        // dữ liệu như nhánh dương tính ở trên.
        await toothDialog.getByRole('button', { name: 'F7 全顎' }).click()
        await step()
        await openBrSample()

        await expect(
            brDialog.getByText('上下顎同時の処理はできません。'),
            'chọn cả hai hàm mà không báo gì — BE trả BR_SAMPLE.MIXED_JAW, ' +
                'FE phải đọc từ fieldErrors.bui (parseApiError để topMessage = null)',
        ).toBeVisible({ timeout: 30_000 })
        await expect(
            brDialog.getByRole('button', { name: 'F9 確定' }),
            'errorProc TẮT F9 — còn nút là mời người dùng áp một mẫu không tồn tại',
        ).toHaveCount(0)
        await expect(brDialog.getByRole('button', { name: 'F10 戻る' })).toBeVisible()
        await closeBrSample()
        await step()
    })

    test('TC-BR-ERR-2 — không có mẫu khớp thì báo Brに使用できません', async () => {
        // Cầu răng nối răng cửa giữa (1) với răng khôn (8) là vô lý về nha khoa,
        // nên br_sample không có mẫu nào cho cặp này — đã kiểm trên dữ liệu demo:
        // `bui_9 = 1 AND bui_16 = 1 AND cnt = 2` trả 0 dòng.
        //
        // Lần đầu viết testcase này chọn MỘT răng cửa và phải SKIP vì hoá ra có
        // mẫu cnt=1 khớp; cặp 1+8 mới thực sự dựng được nhánh 該当なし. Máy nào
        // br_sample khác đi thì đổi TEST_BR_NO_MATCH_TEETH.
        const noMatchTeeth = (process.env.TEST_BR_NO_MATCH_TEETH ?? '1,8')
            .split(',')
            .map((s) => s.trim())
        await selectUpperLeftTeeth(noMatchTeeth)
        await step()
        await openBrSample()

        const noMatch = brDialog.getByText('Brに使用できません。')
        const shown = await appeared(noMatch, 30_000)
        skipWithReason(
            !shown,
            `br_sample của máy này CÓ mẫu khớp cặp răng ${noMatchTeeth.join('+')} hàm trên — ` +
                'đổi TEST_BR_NO_MATCH_TEETH sang cặp không có mẫu',
        )
        await expect(
            brDialog.getByRole('button', { name: 'F9 確定' }),
            'errorProc TẮT F9 ở cả nhánh 該当なし',
        ).toHaveCount(0)
        await closeBrSample()
        await step()

        // Dọn: đóng 部位選択 bằng F12 戻る (F9 ở đó là Br例, End là 確定 — bấm nhầm
        // là đi tiếp sang 病名選択 và ghi vào lưới).
        await toothDialog.getByRole('button', { name: 'F12 戻る' }).click()
        await expect(toothDialog).toBeHidden({ timeout: 15_000 })
        await step()
    })
})
