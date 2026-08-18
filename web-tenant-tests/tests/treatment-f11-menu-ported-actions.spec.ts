import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 menu 「選択」 (RowContextMenu) — CÁC MỤC VỪA ĐƯỢC PORT, màn
 * `/treatments/{patNo}`. Menu này gắn vào chuột phải trên lưới `grdRegi` VÀ vào
 * phím F11 (frm203002.cs:375 `grdRegi.ContextMenuStrip = contextMenuStripSentaku`).
 *
 * File này KHÁC `treatment-f11-fkey-button-show-modal.spec.ts`: file kia lo việc
 * menu có hiện ra và có bị cắt khỏi viewport không; file này lo việc BẤM VÀO thì
 * chạy đúng cái gì. Đừng nhét testcase bố cục vào đây.
 *
 * ─── Nguồn WinForm (src/OCHACOM/INP/Forms/frm203002) ─────────────────────────
 *  - IDM_CULT_Click (:7780)      「4 カルテ」→ frm205003 カルテ(2用紙)印刷, truyền
 *                                 pat_no + st_dt = ed_dt = 処置日 (:7799-7804).
 *  - IDM_Pat_Click (:7809)       「5 患者登録」→ frm201001 CHI TIẾT của bệnh nhân
 *                                 ĐANG MỞ, `InpKbn = Update`. KHÔNG phải màn
 *                                 danh sách — đó là việc của mục 8.
 *  - IDM_PatInfo_Click (:7840)   「8 患者登録（患者選択）」→ frm201008, màn danh sách.
 *  - IDM_AccDataOnly_Click (:7750) 「3 会計データ作成」= 会計前チェック + LetAccData2
 *                                 rồi Ở LẠI màn hình. Chỉ IDM_Acc_Click (:7695)
 *                                 mới đi tiếp sang frm204002 窓口精算.
 *  - Set_Tenki (:7152-7198)      「7 転帰」 chạy `update PERSON set pat_outcome`
 *                                 NGAY LÚC BẤM, không đợi F9.
 *    Get_Tenki (:7204-7232)      lúc vào màn thì tick lại theo pat_outcome.
 *  - IDM_InpOpt_Click (:7962)    「9-2 処置入力設定」→ frm203003.
 *  - IDM_TRTSUM_ADD              「9-7 合計点数入力登録」 có `Visible = false` trong
 *                                 Designer và thân handler RỖNG ⇒ không được hiện.
 *  - Cả 4/5/6/8 đều bọc trong `ModSave.ExitWithoutSaving(DialogResult.Yes)`
 *    (:7783, 7813, 7827, 7843) ⇒ lưới còn sửa dở thì phải hỏi trước khi rời màn.
 *
 * ─── Web port (apps/web-tenant/src/features/treatments) ──────────────────────
 *  - components/row-context-menu.tsx: `role="menu"` (KHÔNG phải dialog), đặt
 *    `fixed` và tự lật lên / kẹp vào viewport bằng useLayoutEffect.
 *      · Submenu = `div[data-submenu]` nằm trong `[data-sub="<key>"]`, để
 *        `visibility: hidden` cho tới khi đo xong ⇒ luôn chờ `toBeVisible()`.
 *      · Submenu mở bằng HOVER (`onMouseEnter`); click là TOGGLE ⇒ tuyệt đối
 *        không dblclick.
 *      · Mục 転帰 đang chọn được đánh dấu bằng icon `<Check>` của lucide, tức MỘT
 *        thẻ `<svg>` bên trong `<button>` — các mục khác không có svg nào. Đó là
 *        cách duy nhất đọc được "đang tick ở đâu" (không có aria-checked).
 *  - lib/treatment-entry-shared.ts `F11_MENU_ITEMS`: nhãn mang sẵn số phím tắt
 *    của WinForm ('1 メニュー', '9 オプション', '2 処置入力設定'…). Khoá submenu 転帰
 *    do `tenkiKeyOf` sinh ra: `tenki-0`..`tenki-4` = đúng mã lưu xuống
 *    `person.pat_outcome`.
 *  - components/treatment-entry-detail.tsx:
 *      · `handleF11Action` là nơi duy nhất phân phối; 4/5/6/8 đi qua
 *        `leaveWithGate()` → `menuGate()` (bản port của ExitWithoutSaving).
 *      · `applyTenki()` set state rồi bắn `PUT /tenant/patients/{patNo}/outcome`;
 *        lỗi thì HOÀN dấu tick về chỗ cũ + toast đỏ.
 *      · `runAccountingDataOnly()` = `runPreAccountingCheck` + `runLetAccData2`,
 *        và KHÔNG gọi `goToCounterPayment()`.
 *
 * ─── Đang CỐ Ý để nguyên, đừng viết testcase đè lên ──────────────────────────
 *  - 「9-8 チェックルール登録」: module CHKRULE (frm601001 + 6 cặp màn con) ĐÃ được
 *    port — nó KHÔNG còn bung toast 開発中 nữa. Ở đây chỉ kiểm đường dẫn menu →
 *    hub, đúng như mục 9-2. Nội dung hub, 6 màn 一覧 và các dialog 登録 thuộc
 *    `check-rule-registration.spec.ts` — đừng chép sang đây.
 *  - 「9-2 処置入力設定」: ở đây CHỈ kiểm phần điều hướng menu → dialog. Nội dung 32
 *    field, chia kho tenant_setting / agent, và F9 登録 thuộc
 *    `treatment-entry-setting-dialog.spec.ts` — đừng chép sang đây.
 *    ⚠️ Chú thích TODO trong `handleF11Action` (treatment-entry-detail.tsx) nói
 *    "nguồn agent chưa merge" là viết theo nhánh `dev`; trên `demo1` dialog ĐÃ có
 *    dây agent đầy đủ (AgentOfflineDialog + PUT /v1/config). Chú thích đó cần bỏ
 *    khi nhánh agent về tới `dev`.
 *
 * ─── Ghi DB ──────────────────────────────────────────────────────────────────
 *  Spec KHÔNG bấm F9 登録 ⇒ không đụng vào lưới 処置.
 *  Thứ duy nhất ghi thật là `person.pat_outcome` ở TC-TENKI-3, và chỉ chạy khi
 *  TEST_DB=1 (cần DB để vừa xác nhận vừa TRẢ LẠI giá trị cũ). `afterAll` khôi
 *  phục lần nữa cho chắc, phòng khi testcase đỏ giữa chừng.
 *  TC-TENKI-2 và TC-ACC-1 CHẶN request bằng `page.route` nên chạy hằng ngày được.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. `SanteiConfirmDialog` 「〜を算定しますか？」 bung ra sau khi lưới nạp xong và đè
 *     lên mọi click ⇒ `addLocatorHandler` bấm No (GUIDELINE Rule 14/14.1). Nó bung
 *     lại sau MỖI lần quay về màn 診療入力, nên `times` phải rộng tay.
 *  1b. Trên máy KHÔNG có agent, mở 処置入力設定 sẽ bung tiếp AgentOfflineDialog
 *     「エージェントが起動していません」 — cũng `role="dialog"`, nổi ĐÈ lên và nuốt cả
 *     click của handler ở (1). Phải dọn bằng `dismissAgentOffline()` chứ không
 *     thể bỏ qua.
 *  2. Các testcase điều hướng làm page RỜI KHỎI `/treatments/{patNo}` ⇒ mọi
 *     testcase sau phải gọi `backToEntry()`. Đừng giả định page còn ở màn cũ.
 *  3. `guardCurrentMonth` chặn thao tác khi ô đang focus thuộc tháng cũ. Spec
 *     dùng ngày HÔM NAY và không click vào dòng lịch sử, nên nhánh
 *     「当月以外の操作はできません」 không chạy tới.
 *  4. Menu tự đóng TRƯỚC khi chạy leaf (`runLeaf`/`runSub` gọi `onClose()` đầu
 *     tiên) ⇒ chờ `rowMenu` biến mất là mốc đáng tin, không phải chờ URL đổi.
 *  5. Menu KHÔNG đóng chắc chắn bằng phím Escape (nó chỉ nghe qua `onKeyDown`
 *     của chính mình, mà mở submenu bằng hover thì con trỏ bàn phím không chắc
 *     theo vào) ⇒ dùng `closeMenu()`, bấm ra ngoài lớp phủ. Đã đo được.
 *  6. Bệnh nhân test hiện có ~1600 lỗi 処置データチェック, nên 「3 会計データ作成」
 *     LUÔN dừng ở hộp 「このまま続けますか?」 trước khi tới LetAccData2. TC-ACC-1
 *     bấm OK để chuỗi chạy tiếp — xem chú thích tại chỗ.
 *  7. `locator.isVisible({ timeout })` KHÔNG chờ — nó soi DOM ngay lúc gọi, tham
 *     số `timeout` chỉ bó thao tác nội bộ. Hộp nào cần một vòng gọi API mới bung
 *     ra thì phải dùng `appeared()` (bọc `waitFor`), nếu không cả nhánh xử lý bị
 *     bỏ qua trong im lặng. Đã mất một lượt chạy vì chỗ này.
 *  8. `page.addLocatorHandler` CHỈ chạy khi Playwright đang thực hiện một ACTION.
 *     Đoạn nào chỉ `waitForResponse` / `keyboard.press` thì handler không được gọi
 *     ⇒ phải xử lý hộp thoại tường minh (xem TC-ACC-1 và `openMenu`).
 *  9. Màn 診療入力 của bệnh nhân test bị coi là "đã sửa" NGAY SAU KHI NẠP, chưa
 *     cần gõ gì ⇒ mọi mục có chốt lưu (4/5/6/8) đều bung hộp 「処置データは変更
 *     されています」. Các TC-NAV-* vì thế gọi `leaveDiscardingEdits()` (bấm No).
 *     KHÔNG bao giờ bấm Yes — Yes ghi cả tháng 処置 xuống DB.
 * 10. TanStack Router bọc nháy cho search param là CHUỖI TRÔNG NHƯ SỐ
 *     (`?patientNo="12138"`), còn `st_dt=2026-08-04` thì ghi thô. Đọc bằng
 *     `searchString()` chứ đừng so thẳng `searchParams.get()`.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 npx playwright test tests/treatment-f11-menu-ported-actions.spec.ts --retries=0
 *
 * `--retries=0` vì retry là chạy lại CẢ khối serial ⇒ thêm một lần login, tốn
 * quota (Rule 10.1). Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19): khối
 * serial dùng chung một page và thứ tự CÓ Ý NGHĨA.
 *
 * Kỳ vọng: tất cả XANH. TC-TENKI-3 tự skip khi không có TEST_DB.
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

// ── URL các endpoint màn này đụng tới ────────────────────────────────────────
/** 転帰 — Set_Tenki. `{patNo}` nằm trên path nên khớp bằng regex. */
const OUTCOME_PUT_URL = /\/tenant\/patients\/\d+\/outcome(\?|$)/
/** LetAccData2 — bước ĐỌC (会計データ đã có của ngày). Nhánh nào cũng đi qua. */
const ACC_PRECHECK_URL = /\/tenant\/treatment\/accounting\/precheck/
/** LetAccData2 — bước GHI của 未精算データ作成. */
const INSERT_UNPAID_URL = /\/tenant\/treatment\/accounting\/insert-unpaid(\?|$)/

// ── Nhãn lấy nguyên văn từ F11_MENU_ITEMS ────────────────────────────────────
const MENU_KARTE = '4 カルテ'
const MENU_PAT_REGISTER = '5 患者登録'
const MENU_PAT_SELECT = '8 患者登録(患者選択)'
const MENU_ACC_DATA_ONLY = '3 会計データ作成'
const MENU_OPTIONS = '9 オプション'
const MENU_TENKI = '7 転帰'

/** Submenu 9 オプション sau khi bỏ 9-7 — 8 mục, đúng thứ tự Designer. */
const OPTION_LABELS = [
    '1 チェック項目設定',
    '2 処置入力設定',
    '3 必要病名登録',
    '4 自動算定登録',
    '5 処置自動入力登録',
    '6 コメント自動入力登録',
    '8 チェックルール登録',
    'Step',
] as const

/** Nhãn đã bị gỡ khỏi menu — IDM_TRTSUM_ADD.Visible = false. */
const REMOVED_OPTION_LABEL = '7 合計点数入力登録'

/** 転帰 — nhãn submenu ↔ mã ghi xuống `person.pat_outcome` (eTenki 0..4). */
const TENKI_ENTRIES = [
    { code: 0, label: '0 なし' },
    { code: 1, label: '1 治癒' },
    { code: 2, label: '2 死亡' },
    { code: 3, label: '3 中止' },
    { code: 4, label: '4 継続' },
] as const

interface OutcomePutBody {
    outcome: number
}

/**
 * Đọc một search param do TanStack Router ghi ra, đã bóc nháy.
 *
 * Router mặc định `JSON.stringify` giá trị, nên một CHUỖI TRÔNG NHƯ SỐ bị ghi
 * kèm nháy: `?patientNo="12138"` — nếu không thì lượt đọc ngược sẽ ra number và
 * `z.string()` của patientNoSearchSchema đá nó ra 404. Chuỗi không phải JSON hợp
 * lệ (vd `st_dt=2026-08-04`) thì ghi thô. Đây là quy ước CHUNG của app (mọi
 * call-site `/patients/registration` đều vậy — patient-list-page.tsx:141), nên
 * test phải bóc nháy chứ đừng so thô rồi tưởng màn hình ghi sai.
 */
function searchString(url: string, key: string): string | null {
    const raw = new URL(url).searchParams.get(key)
    if (raw === null) return null
    try {
        const parsed: unknown = JSON.parse(raw)
        return typeof parsed === 'string' ? parsed : raw
    } catch {
        return raw
    }
}

/**
 * `true` nếu locator HIỆN RA trong `timeout`.
 *
 * KHÔNG dùng `locator.isVisible({ timeout })` cho việc này: `isVisible()` soi DOM
 * ngay tại thời điểm gọi và trả về ngay, `timeout` chỉ bó thao tác nội bộ chứ
 * KHÔNG chờ phần tử xuất hiện. Đã đo được: hộp 「このまま続けますか?」 cần một vòng
 * gọi API mới bung ra, `isVisible` trả false tức thì và cả nhánh xử lý bị bỏ qua.
 */
async function appeared(locator: Locator, timeout: number): Promise<boolean> {
    return locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)
}

/**
 * Đọc `person.pat_outcome` thẳng từ DB.
 *
 * NULL là giá trị hợp lệ chứ không phải lỗi đọc: bệnh nhân chưa từng bị menu
 * 転帰 đụng vào thì cột này rỗng, và `Get_Tenki` coi nó như 0 (なし). Trả về 0 cho
 * cả hai trường hợp để so trực tiếp với mã trên menu.
 */
async function readPatOutcome(): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ pat_outcome: number | null }>(
            `SELECT pat_outcome FROM view_person_active WHERE pat_no = $1 LIMIT 1`,
            [Number(PAT_NO)],
        )
        return Number(r.rows[0]?.pat_outcome ?? 0)
    })
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 menu 選択 — các mục vừa port (frm203002 contextMenuStripSentaku)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu gốc. Lọc theo '1 メニュー' để không dính submenu (cũng nằm trong role=menu). */
    let rowMenu: Locator

    /** Giá trị 転帰 lúc bắt đầu, để TC-TENKI-3 và afterAll trả lại. */
    let outcomeBefore: number | null = null

    /** Submenu đang mở của một mục cha (`options` / `tenki`). */
    const submenuOf = (key: string) => page.locator(`[data-sub="${key}"] [data-submenu]`)

    /** Về lại màn 診療入力 của bệnh nhân test và chờ lưới dựng xong. */
    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        // Header 患者情報 render 「合計:」 = màn detail đã sẵn sàng nhận F11.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * Đóng AgentOfflineDialog 「エージェントが起動していません」 nếu nó bung ra.
     *
     * Đây KHÔNG phải testcase — spec này không nói gì về vòng đời agent. Nó là
     * lưới an toàn cho máy KHÔNG có agent (macOS/Linux): dialog đó nổi đè lên mọi
     * thứ và nuốt sạch click, đúng kiểu hỏng dây chuyền mà
     * `treatment-entry-setting-dialog.spec.ts` đã gặp.
     */
    async function dismissAgentOffline() {
        const offline = page
            .getByRole('dialog')
            .filter({ hasText: 'エージェントが起動していません' })
        if (!(await appeared(offline, 5_000))) return
        await offline.getByRole('button', { name: 'キャンセル' }).click()
        await expect(offline).toBeHidden({ timeout: 10_000 })
    }

    /**
     * Bấm No cho MỌI hộp 「〜を算定しますか？」 đang mở, cho tới khi hết.
     *
     * `addLocatorHandler` ở beforeAll chỉ chạy khi Playwright đang thực hiện một
     * ACTION; nó không giúp gì cho một phím bấm thô như `keyboard.press`. AutoSantei
     * bung LIÊN TIẾP nhiều hộp (mỗi 処置 ứng viên một hộp) nên phải vét bằng vòng lặp
     * có giới hạn, không phải một lần `if`.
     */
    async function drainSanteiDialogs() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            // Chờ ngắn: hộp đầu tiên có thể chưa kịp bung sau khi lưới nạp xong,
            // nhưng vét quá lâu thì màn hình sạch cũng phải đứng chờ.
            if (!(await appeared(santei, 2_000))) return
            await page
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    /**
     * Bấm F11 mở menu. FKeyScopeProvider preventDefault F1–F12 nên không bung
     * fullscreen của trình duyệt.
     *
     * Vét hộp 算定 TRƯỚC rồi mới bấm: ĐÃ ĐO ĐƯỢC là bấm F11 lúc hộp còn mở thì phím
     * bị hộp nuốt và menu không bao giờ hiện, testcase đỏ ở chỗ chẳng liên quan.
     * Thử lại có giới hạn vì AutoSantei có thể bung thêm hộp ngay giữa hai thao tác.
     */
    async function openMenu() {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await drainSanteiDialogs()
            await page.keyboard.press('F11')
            if (await rowMenu.isVisible({ timeout: 10_000 }).catch(() => false)) return
        }
        await expect(rowMenu, 'bấm F11 3 lần mà menu 選択 vẫn không mở').toBeVisible({
            timeout: 10_000,
        })
    }

    /** Mở submenu của một mục cha bằng hover (click sẽ TOGGLE). */
    async function openSubmenu(parentLabel: string, key: string): Promise<Locator> {
        await rowMenu.getByRole('button', { name: parentLabel }).hover()
        const sub = submenuOf(key)
        await expect(sub, `submenu 「${parentLabel}」 không mở ra`).toBeVisible({ timeout: 10_000 })
        return sub
    }

    /**
     * Đóng menu mà KHÔNG chạy mục nào.
     *
     * Bấm ra ngoài, tức lớp phủ `fixed inset-0 z-40` mang `onClick={onClose}` của
     * RowContextMenu. KHÔNG dùng phím Escape: menu chỉ nghe Escape qua `onKeyDown`
     * của chính nó, nên phím chỉ ăn khi con trỏ bàn phím còn nằm trong menu —
     * ĐÃ ĐO ĐƯỢC là không phải lúc nào cũng vậy (mở submenu bằng hover thì focus
     * không chắc theo vào), và khi đó testcase treo ở `toBeHidden`.
     *
     * `position` tính từ góc trên-trái của lớp phủ = góc trên-trái viewport. Menu
     * neo vào nút F11 ở chân màn hình nên (5,5) chắc chắn trống; nếu có ngày nó
     * che tới đó thì Playwright báo "element intercepts pointer events" chứ không
     * lặng lẽ xanh.
     */
    async function closeMenu() {
        await page
            .locator('div[class*="inset-0"][class*="z-40"]')
            .last()
            .click({ position: { x: 5, y: 5 } })
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })
    }

    /**
     * Trả lời hộp chốt lưu 「処置データは変更されています。保存しますか？」 nếu nó bung
     * ra: LUÔN chọn **No** — bỏ phần sửa dở rồi đi tiếp.
     *
     * TUYỆT ĐỐI KHÔNG bấm Yes: Yes chạy saveMutation, mà bulk-save xoá mềm toàn bộ
     * 処置行 của THÁNG rồi chèn lại. Spec này không được phép ghi vào lưới (xem mục
     * "Ghi DB" ở đầu file).
     *
     * ĐO ĐƯỢC: màn 診療入力 của bệnh nhân test bị coi là "đã sửa" NGAY SAU KHI NẠP,
     * chưa cần gõ gì — nên nhánh này gần như luôn chạy với mọi mục 4/5/6/8. `if`
     * giữ lại để spec vẫn đúng trên hồ sơ không bị bẩn sẵn.
     */
    async function leaveDiscardingEdits() {
        const gate = page.getByText('処置データは変更されています。保存しますか？')
        if (!(await appeared(gate, 10_000))) return
        await page.getByRole('button', { name: 'No', exact: true }).click()
        await expect(gate).toBeHidden({ timeout: 10_000 })
    }

    /** Bấm một mục ở cấp 1 và chờ menu đóng (runLeaf gọi onClose trước khi chạy). */
    async function clickTopItem(label: string) {
        await rowMenu.getByRole('button', { name: label }).click()
        await expect(rowMenu, `bấm 「${label}」 mà menu không đóng`).toBeHidden({ timeout: 10_000 })
    }

    /**
     * Mã 転帰 đang được tick trên submenu.
     *
     * Dấu tick là icon `<Check>` của lucide ⇒ `<svg>` duy nhất trong `<button>`
     * của mục đang chọn. Trả -1 khi không mục nào có, để thông báo lỗi nói được
     * "không tick ở đâu cả" thay vì im lặng trả 0 (0 là một mã thật).
     */
    async function checkedTenkiCode(sub: Locator): Promise<number> {
        for (const { code, label } of TENKI_ENTRIES) {
            const svgs = await sub.getByRole('button', { name: label }).locator('svg').count()
            if (svgs > 0) return code
        }
        return -1
    }

    test.beforeAll(async ({ browser }) => {
        if (dbEnabled) outcomeBefore = await readPatOutcome()

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
        await backToEntry()
    })

    test.afterAll(async () => {
        await page?.close()
        // Lưới an toàn: TC-TENKI-3 tự trả lại rồi, nhưng nếu nó đỏ giữa chừng thì
        // bệnh nhân test nằm lại ở 転帰 khác — chữa ngay tại đây, không đợi người.
        if (dbEnabled && outcomeBefore !== null) {
            const now = await readPatOutcome().catch(() => outcomeBefore)
            if (now !== outcomeBefore) {
                await withDb((c) =>
                    c.query(`UPDATE person SET pat_outcome = $1 WHERE pat_no = $2`, [
                        outcomeBefore,
                        Number(PAT_NO),
                    ]),
                ).catch((e: unknown) => console.log(`afterAll: không trả lại được 転帰 — ${String(e)}`))
                console.log(`afterAll: đã trả 転帰 về ${outcomeBefore}`)
            }
        }
    })

    // ── Cấu trúc menu ────────────────────────────────────────────────────────

    test('TC-MENU-1 — submenu 9 オプション có đúng 8 mục, KHÔNG còn 7 合計点数入力登録', async () => {
        await openMenu()
        const sub = await openSubmenu(MENU_OPTIONS, 'options')

        for (const label of OPTION_LABELS) {
            await expect(sub.getByRole('button', { name: label }), `thiếu 「${label}」`).toBeVisible()
        }
        // IDM_TRTSUM_ADD.Visible = false + handler rỗng ⇒ để lại trên menu là mời
        // người dùng bấm vào một nút không làm gì.
        await expect(
            sub.getByRole('button', { name: REMOVED_OPTION_LABEL }),
            `「${REMOVED_OPTION_LABEL}」 vẫn còn — WinForm ẩn nó ở Designer`,
        ).toHaveCount(0)
        await expect(sub.getByRole('button')).toHaveCount(OPTION_LABELS.length)

        await closeMenu()
        await step()
    })

    test('TC-MENU-2 — 9-2 処置入力設定 mở dialog 診療入力設定, không còn toast 開発中', async () => {
        await openMenu()
        const sub = await openSubmenu(MENU_OPTIONS, 'options')
        await sub.getByRole('button', { name: '2 処置入力設定' }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })

        // Tiêu đề viết giãn chữ, có DẤU CÁCH THẬT trong source
        // (treatment-entry-setting-dialog.tsx:149) ⇒ match được nguyên văn.
        const dialog = page.getByRole('dialog').filter({ hasText: '診 療 入 力 設 定' })
        await expect(
            dialog,
            'menu 9-2 phải mở frm203003 chứ không phải bung toast 開発中',
        ).toBeVisible({ timeout: 30_000 })
        // Nếu vẫn còn dây cũ thì đây là thứ hiện ra thay cho dialog.
        await expect(page.getByText('開発中')).toHaveCount(0)

        // Máy không có agent thì 診療入力設定 bung tiếp AgentOfflineDialog và nó nổi
        // ĐÈ lên, nuốt mọi click sau đó. Dọn trước khi bấm 戻る. Việc dialog đó có
        // đúng hay không thuộc treatment-entry-setting-dialog.spec.ts, không phải
        // đây — ở đây chỉ cần đường dẫn từ menu tới dialog là thông.
        await dismissAgentOffline()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await step()
    })

    test('TC-MENU-3 — 9-8 チェックルール登録 mở hub CHKRULE, không còn toast 開発中', async () => {
        await openMenu()
        const sub = await openSubmenu(MENU_OPTIONS, 'options')
        await sub.getByRole('button', { name: '8 チェックルール登録' }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })

        // Hub là TAKEOVER toàn màn (không phải DraggableDialog) nhưng vẫn mang
        // role="dialog" — check-rule-menu-screen.tsx đặt thế để window-key-guard
        // biết 診療入力 bên dưới phải đứng im. Tiêu đề giãn chữ, dấu cách THẬT.
        const hub = page.getByRole('dialog').filter({ hasText: 'チ ェ ッ ク ル ー ル 登 録' })
        await expect(hub, 'menu 9-8 phải mở frm601001 chứ không bung toast 開発中').toBeVisible({
            timeout: 30_000,
        })
        await expect(page.getByText('開発中')).toHaveCount(0)

        // Trả màn hình về 診療入力 cho các testcase sau — hub che hết lưới nên F11
        // của testcase kế tiếp sẽ không tới được menu nếu để nguyên.
        await hub.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })
        await step()
    })

    // ── 7 転帰 ───────────────────────────────────────────────────────────────

    test('TC-TENKI-1 — dấu tick 転帰 seed từ person.pat_outcome (Get_Tenki)', async () => {
        skipWithReason(
            !dbEnabled,
            'cần TEST_DB=1 để biết pat_outcome thật — không có DB thì testcase chỉ so 0 với 0',
        )

        await openMenu()
        const sub = await openSubmenu(MENU_TENKI, 'tenki')
        const checked = await checkedTenkiCode(sub)

        expect(checked, 'không mục 転帰 nào được tick — Get_Tenki không chạy').toBeGreaterThanOrEqual(
            0,
        )
        expect(
            checked,
            `DB đang là pat_outcome = ${outcomeBefore} nhưng menu tick mã ${checked} ` +
                '— dấu tick không đọc từ patientDetail mà vẫn là state mặc định',
        ).toBe(outcomeBefore)

        await closeMenu()
        await step()
    })

    test('TC-TENKI-2 — chọn một mục 転帰 bắn PUT .../outcome đúng mã (Set_Tenki)', async () => {
        // Chọn mã KHÁC mã đang tick, nếu không "đã gửi" và "chưa gửi" trông giống
        // hệt nhau. Không có DB thì cứ lấy 治癒(1) và né sang 継続(4) nếu trùng.
        await openMenu()
        const sub = await openSubmenu(MENU_TENKI, 'tenki')
        const current = await checkedTenkiCode(sub)
        const target = TENKI_ENTRIES.find((t) => t.code !== current && t.code !== 0)!

        let sent: OutcomePutBody | null = null
        let sentUrl = ''
        // CHẶN request → KHÔNG ghi DB, chạy hằng ngày được. 204 đúng như endpoint
        // thật (MapPut … .Produces(Status204NoContent)).
        await page.route(OUTCOME_PUT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            sent = req.postDataJSON() as OutcomePutBody
            sentUrl = req.url()
            await route.fulfill({ status: 204, body: '' })
        })

        try {
            await sub.getByRole('button', { name: target.label }).click()
            await expect(rowMenu).toBeHidden({ timeout: 10_000 })
            await expect
                .poll(() => sent, {
                    message: `bấm 「${target.label}」 mà không có PUT nào — 転帰 vẫn chỉ là state trên máy`,
                    timeout: 30_000,
                })
                .not.toBeNull()
        } finally {
            await page.unroute(OUTCOME_PUT_URL)
        }

        expect(sent!.outcome, `「${target.label}」 phải gửi mã ${target.code}`).toBe(target.code)
        // Set_Tenki khoá theo MỖI pat_no (câu UPDATE không có 枝番) — path phải mang
        // đúng số đó. So bằng `endsWith` vì tiền tố do VITE_API_BASE_URL quyết định.
        expect(
            new URL(sentUrl).pathname.endsWith(`/tenant/patients/${PAT_NO}/outcome`),
            `PUT sai địa chỉ: ${sentUrl}`,
        ).toBe(true)

        // Request bị chặn nên chưa có gì xuống DB; dấu tick phải theo mã vừa chọn.
        await openMenu()
        const sub2 = await openSubmenu(MENU_TENKI, 'tenki')
        await expect
            .poll(() => checkedTenkiCode(sub2), {
                message: 'chọn xong mà dấu tick không nhảy sang mục vừa bấm',
                timeout: 10_000,
            })
            .toBe(target.code)
        await closeMenu()
        await step()
    })

    test('TC-TENKI-3 — ghi THẬT person.pat_outcome rồi trả lại giá trị cũ', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để xác nhận cột pat_outcome và trả lại giá trị cũ')

        // Màn vừa reload ở TC-TENKI-2 nên state đã theo DB trở lại.
        await backToEntry()
        const target = TENKI_ENTRIES.find((t) => t.code !== outcomeBefore && t.code !== 0)!

        await openMenu()
        const sub = await openSubmenu(MENU_TENKI, 'tenki')
        await sub.getByRole('button', { name: target.label }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })

        await expect
            .poll(readPatOutcome, {
                message:
                    `bấm 「${target.label}」 nhưng person.pat_outcome không đổi — ` +
                    'Set_Tenki phải commit ngay lúc bấm, không đợi F9',
                timeout: 30_000,
            })
            .toBe(target.code)

        // Vào lại màn: Get_Tenki phải tick đúng cái vừa ghi (đây mới là vòng khép kín).
        await backToEntry()
        await openMenu()
        const sub2 = await openSubmenu(MENU_TENKI, 'tenki')
        await expect
            .poll(() => checkedTenkiCode(sub2), { timeout: 15_000 })
            .toBe(target.code)

        // Trả lại ngay trong testcase, qua chính menu — nếu đường ghi hỏng thì
        // testcase này đỏ chứ không để lại rác cho lần chạy sau.
        const backLabel = TENKI_ENTRIES.find((t) => t.code === outcomeBefore)!.label
        await sub2.getByRole('button', { name: backLabel }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })
        await expect.poll(readPatOutcome, { timeout: 30_000 }).toBe(outcomeBefore)
        await step()
    })

    // ── 3 会計データ作成 ─────────────────────────────────────────────────────

    test('TC-ACC-1 — 3 会計データ作成 chạy LetAccData2 nhưng Ở LẠI màn 診療入力', async () => {
        await backToEntry()

        let insertUnpaidCalled = false
        // CHẶN bước GHI: LetAccData2 tạo 未精算データ thật. Trả về đúng envelope
        // để FE đi hết chuỗi như thường.
        await page.route(INSERT_UNPAID_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'POST') return route.fallback()
            insertUnpaidCalled = true
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: { inserted: 0 } }),
            })
        })

        // Hai cổng dưới đây CỐ Ý xử lý tường minh, KHÔNG dùng `addLocatorHandler`:
        // handler chỉ chạy khi Playwright đang thực hiện một ACTION (click/fill…),
        // mà đoạn này chỉ `waitForResponse` — đã đo được là handler không bao giờ
        // được gọi và testcase treo tới hết timeout với thông báo sai chỗ.

        // Bước ĐỌC precheck luôn chạy trong mọi nhánh của LetAccData2 ⇒ dùng nó làm
        // mốc "chuỗi đã chạy xong phần của nó", thay cho một waitForTimeout mù.
        const precheck = page
            .waitForResponse((r) => ACC_PRECHECK_URL.test(r.url()), { timeout: 60_000 })
            .catch(() => null)

        try {
            await openMenu()
            await clickTopItem(MENU_ACC_DATA_ONLY)

            // Cổng 1 — 会計前チェック. Khi 会計前チェック有り (inpConfig.accChk = 1) và
            // TrnChk có lỗi thì bung 「処置データチェックでエラーがありました。このまま
            // 続けますか?」 (OK / Cancel, mặc định Cancel — frm203002.cs:7754-7768).
            // Bấm OK để chuỗi ĐI TIẾP vào LetAccData2: bấm Cancel thì testcase vẫn
            // "không rời màn hình", nhưng là vì chuỗi chưa chạy — chứng minh nhầm
            // thứ. Bệnh nhân test hiện có ~1600 lỗi check nên nhánh này gần như
            // luôn chạy; `if` là để spec vẫn đúng trên hồ sơ sạch.
            const checkGate = page.getByText('このまま続けますか?')
            // Đua hai khả năng thay vì chờ cứng: hồ sơ có lỗi thì hộp bung ra,
            // hồ sơ sạch thì precheck bay thẳng — cách này không tốn giây chết ở
            // trường hợp sau.
            await Promise.race([
                checkGate.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => null),
                precheck,
            ])
            if (await checkGate.isVisible().catch(() => false)) {
                await page.getByRole('button', { name: 'OK', exact: true }).first().click()
                await expect(checkGate).toBeHidden({ timeout: 10_000 })
            }

            const res = await precheck
            expect(
                res,
                '「3 会計データ作成」 không gọi precheck — LetAccData2 chưa chạy thì testcase ' +
                    'không chứng minh được điều gì về việc "ở lại màn hình"',
            ).not.toBeNull()

            // Cổng 2 — bệnh nhân đã có 会計 của ngày thì LetAccData2 hỏi
            // 「…作成してよろしいですか？」/「…作成しますか？」 (modAcc.cs:560, 579, 722).
            // Bấm No: nhánh nào cũng kết thúc mà KHÔNG điều hướng — đúng thứ cần đo
            // — và không tạo thêm dữ liệu. Nhãn mặc định của confirmDialog 2 nút là
            // Yes/No (confirm-dialog-view.tsx:19).
            const createGate = page.getByText(/作成し(ますか|てよろしいですか)？/)
            if (await appeared(createGate, 10_000)) {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
                await expect(createGate).toBeHidden({ timeout: 10_000 })
            }
        } finally {
            await page.unroute(INSERT_UNPAID_URL)
        }

        // IDM_AccDataOnly_Click KHÔNG có `formControl.showForm(ID204002)`.
        await expect(
            page,
            '3 会計データ作成 nhảy sang 窓口精算 — đó là việc của 2 会計 (IDM_Acc_Click)',
        ).not.toHaveURL(/\/counter-payments/)
        await expect(page).toHaveURL(new RegExp(`/treatments/${PAT_NO}`))
        console.log(`insert-unpaid ${insertUnpaidCalled ? 'ĐÃ' : 'CHƯA'} được gọi (tuỳ nhánh 既存会計)`)
        await step()
    })

    // ── Điều hướng: 4 / 5 / 8 ────────────────────────────────────────────────

    test('TC-NAV-1 — 4 カルテ sang /medical-records/print form=2, st_dt = ed_dt = 処置日', async () => {
        await backToEntry()
        await openMenu()
        await clickTopItem(MENU_KARTE)
        await leaveDiscardingEdits()

        await expect(page, '「4 カルテ」 không mở màn in カルテ').toHaveURL(
            /\/medical-records\/print/,
            { timeout: 30_000 },
        )
        const url = page.url()
        expect(searchString(url, 'patNo'), 'thiếu 患者番号 ⇒ màn in không biết in cho ai').toBe(
            PAT_NO,
        )
        // frm205003 = カルテ(2用紙)印刷 ⇒ ChartForm2Page, không phải form 1.
        expect(searchString(url, 'form'), 'phải là カルテ2用紙 (form=2)').toBe('2')
        expect(searchString(url, 'st_dt'), 'st_dt phải là 処置日').toBe(TRT_DT)
        expect(
            searchString(url, 'ed_dt'),
            'ed_dt phải bằng st_dt (IDM_CULT_Click:7801-7802)',
        ).toBe(TRT_DT)
        await step()
    })

    test('TC-NAV-2 — 5 患者登録 sang màn CHI TIẾT của chính bệnh nhân đang mở', async () => {
        await backToEntry()
        await openMenu()
        await clickTopItem(MENU_PAT_REGISTER)
        await leaveDiscardingEdits()

        // Đây là chỗ từng sai: trước kia mục 5 đi tới /patients (danh sách), tức là
        // làm đúng việc của mục 8. IDM_Pat_Click mở frm201001 với InpKbn = Update.
        await expect(
            page,
            '「5 患者登録」 phải mở frm201001 (chi tiết), không phải frm201008 (danh sách)',
        ).toHaveURL(/\/patients\/registration/, { timeout: 30_000 })
        expect(
            searchString(page.url(), 'patientNo'),
            'mở đúng màn nhưng sai bệnh nhân — 5 患者登録 phải mang theo 患者番号 đang mở',
        ).toBe(PAT_NO)
        await step()
    })

    test('TC-NAV-3 — 8 患者登録（患者選択）sang màn DANH SÁCH bệnh nhân', async () => {
        await backToEntry()
        await openMenu()
        await clickTopItem(MENU_PAT_SELECT)
        await leaveDiscardingEdits()

        // frm201008 → PatientListPage. `\/patients\/?$` để không dính
        // /patients/registration của TC-NAV-2.
        await expect(page, '「8 患者登録（患者選択）」 phải mở frm201008').toHaveURL(
            /\/patients\/?(\?|$)/,
            { timeout: 30_000 },
        )
        await step()
    })

    // ── Chốt lưu dữ liệu (ModSave.ExitWithoutSaving) ─────────────────────────

    test('TC-GATE-1 — lưới còn sửa dở thì 8 患者登録（患者選択）phải hỏi trước khi rời màn', async () => {
        await backToEntry()

        // Thêm một dòng cho phần "sửa dở" trở nên CÓ CHỦ Ý.
        //
        // Đây là bước BEST-EFFORT, không phải điều kiện của testcase: theo bẫy (9)
        // màn hình đã bị coi là sửa dở ngay sau khi nạp, nên hộp chốt lưu bung ra
        // dù có thêm dòng hay không. Trước đây chỗ này `skip` khi 行追加 bị disabled
        // (`canEditRow` cần một ô đang focus, mà cú click không phải lúc nào cũng
        // rơi vào ô sửa được) — hoá ra là tự bỏ chạy một testcase vẫn chạy đúng.
        const editableCells = page.locator('[data-grid-cell]:not([data-footer-cell])')
        await expect(editableCells.first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await editableCells.last().click()

        await openMenu()
        const addRow = rowMenu.getByRole('button', { name: '行追加' })
        if (await addRow.isEnabled()) {
            await addRow.click()
            await expect(rowMenu).toBeHidden({ timeout: 10_000 })
        } else {
            console.log('行追加 đang disabled — dựa vào phần sửa dở sẵn có của màn hình')
            await closeMenu()
        }

        // Giờ mới thử rời màn. `menuGate` phải chặn lại bằng hộp 3 nút của
        // ModSave.ExitWithoutSaving. KHÔNG gọi `leaveDiscardingEdits()` ở đây —
        // chính cái hộp đó là thứ testcase này đang đo.
        await openMenu()
        await clickTopItem(MENU_PAT_SELECT)

        const confirm = page.getByText('処置データは変更されています。保存しますか？')
        await expect(
            confirm,
            'rời màn khi lưới còn sửa dở mà không hỏi — dữ liệu bị vứt im lặng',
        ).toBeVisible({ timeout: 30_000 })

        // Cancel → ở lại, KHÔNG lưu, KHÔNG đi đâu.
        await page.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(confirm).toBeHidden({ timeout: 10_000 })
        await expect(page, 'bấm Cancel mà vẫn rời màn').toHaveURL(
            new RegExp(`/treatments/${PAT_NO}`),
        )
        await step()
    })
})
