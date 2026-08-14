import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import {
    dbEnabled,
    deleteStepGuides,
    readTrtStateRow,
    seedStepGuides,
    withDb,
    writeTrtStateCells,
} from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力 — Ｓｔｅｐ編集 (frm203050), mở bằng F11 → 「9 オプション」 → 「Step」.
 *
 * Tách khỏi `inp-p1-ported-dialogs.spec.ts` (2026-08-14): file kia gom ba dialog
 * vừa port cho đỡ tốn lượt login, nhưng riêng Ｓｔｅｐ編集 còn cả một nhóm
 * testcase LIÊN THÔNG với tab ガイド (nhóm B bên dưới) nên để chung thì file kia
 * phình ra và mỗi lần sửa STEP lại phải chạy lại cả チェック項目設定 + Ｂｒサンプル.
 * `treatment-entry-setting-dialog.spec.ts` cũng đã tách theo kiểu này.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Dialog này để làm gì
 * ═══════════════════════════════════════════════════════════════════════════
 * Nó là chỗ DUY NHẤT khai tay bảng `trt_state` — 「răng này, nhóm bệnh này, đang
 * ở bước điều trị nào」. Lưới 15 種別 × 32 部位:
 *   - 種別 = nhóm 病名 (`bui_idx` 1..6 có nghĩa, 7..15 để trống nhưng vẫn lưu),
 *   - 32 ô  = 32 răng (`pos_idx` 1..32, hàm trên 1-16 / hàm dưới 17-32),
 *   - giá trị = mã bước hiện tại (`intTrtS[0]` của `modGuid1.pSet_Guid1`).
 *
 * Giá trị đó được TIÊU THỤ ở đúng một chỗ — tab ガイド của side panel:
 *   Shift+F4 (STEP)  lọc `pac_nam.pac_step_01..15 = intTrtS[0]` (modGuid1.cs:109-126)
 *   「前回」 (Prv)     lọc `pac_nam.guid_cd      = intTrtS[0]` (modGuid1.cs:105-108)
 *   「リセット」        ghi 0 vào đúng các ô 部位 của 部位病名行 đang focus
 * Nhóm B bên dưới là phần khoá mắt xích đó; trước 2026-08-14 KHÔNG spec nào phủ
 * (「Shift+F4」 của `guide-sidepanel-handler.spec.ts` chỉ assert guid_cd rơi trong
 * dải 1000-1999, không đụng tới giá trị trt_state).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A. Nguồn WinForm (INP/Forms/frm203050.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - initProc (:195-214)   nạp CẢ 15 種別 một lần (`TrtState.getTrtState`), rồi
 *                          `dspData(1)` + `_bkIdx = 1` + `_epp[0].Focus()`.
 *  - _stsBui (:31)         `new int[15 * 32]` — buffer phẳng 15 種別 × 32 部位.
 *  - dspData (:244-250)    đổi 種別 chỉ ĐỔ LẠI 32 ô trên màn, KHÔNG nạp lại DB.
 *  - cboKind_SelectedValueChanged (:130-142)
 *                          đổi 種別 = `saveData(_bkIdx)` TRƯỚC; sai giá trị thì
 *                          KHÔNG đổi (dspData không chạy) ⇒ combo đứng yên.
 *  - saveData (:255-271)   ô > 30000 → E00100 「STEPの値が正しくありません。」+
 *                          「30000以下の値を入力して下さい。」 rồi focus lại ô đó.
 *  - txtEpp_KeyDown (:149-170)
 *                          ↑/↓ nhảy giữa hàm trên/dưới CÙNG CỘT (±16);
 *                          →/← đi hết 32 ô và VÒNG LẠI (31→0, 0→31).
 *  - btnF9_Click (:119-123) → updateProc (:276-321) ghi CẢ 15 hàng trong 1
 *                          transaction; hỏng thì E00026 và KHÔNG đóng màn.
 *  - cboKind               `makeCodMstCombo(con, cboKind, 70, COMBO_SPC_OFF)`
 *                          ⇒ 15 mục lấy từ mst_cod cd_type 70.
 *
 *  Web port — components/step-edit-dialog.tsx:
 *      · `DraggableDialog` ⇒ role="dialog"; tiêu đề có DẤU CÁCH THẬT trong
 *        source: 'S t e p 編 集'.
 *      · 32 ô là `<Input type="number">` ⇒ role **spinbutton**, KHÔNG phải
 *        textbox (Rule 12.5). Mỗi ô mang `aria-label="STEP {種別}-{部位}"`
 *        (1-based cả hai) — cách duy nhất trỏ đúng một ô.
 *      · Buffer là `draft ?? loadedGrid`: chưa sửa gì thì màn hình đọc THẲNG dữ
 *        liệu server. Reset (draft = null, 種別 về mục đầu) chạy khi `open` đổi
 *        HOẶC `loadedGrid` đổi identity, bằng adjust-during-render.
 *      · F9 lỗi → `ja.E00026('更新')` = 「更新に失敗しました。」 và GIỮ dialog.
 *  queries/trt-state-queries.ts: `enabled: open && patNo > 0`,
 *      `staleTime: Infinity`, `refetchOnWindowFocus: false`.
 *      ⚠️ HỆ QUẢ CHO TEST: GET chỉ bay ở lần mở ĐẦU TIÊN. Mở lại lần 2 KHÔNG có
 *      request ⇒ đừng `waitForResponse` ở các testcase sau, sẽ treo hết timeout
 *      rồi đỏ ở chỗ chẳng liên quan. Chỉ sau khi F9 lưu THÀNH CÔNG (mutation
 *      invalidate `trtStateKeys` + `guidsKeys.all`) thì lần mở kế mới nạp lại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * B. Mắt xích trt_state → tab ガイド (GuidQueries.ListStepAsync)
 * ═══════════════════════════════════════════════════════════════════════════
 * BE (`apps/api/src/Ochacom.Infrastructure/Guids/Queries/GuidQueries.cs`):
 *   ResolveCurrentTreatmentCodeAsync (:165-200)
 *        dis_cd[0] → bui_idx (MouthConstants.MapDisCdToBuiIdx) → duyệt 32 ô
 *        `bui[i] != 0` và lấy `grid[buiIdx-1, i]` KHÁC 0 CUỐI CÙNG (last-wins).
 *   BuildStepPredicate (:259-278)
 *        Step + intTrtS ≠ 0 → OR của `pac_step_01..15 = intTrtS`
 *        Step + intTrtS = 0 → `TRUE` (chỉ còn ràng buộc dải 1000-1999)
 *        Prv                → `guid_cd = intTrtS`
 *   fallback (:139-160, port modGuid1.cs:134-138)
 *        lượt 1 ra 0 dòng → BỎ bộ lọc STEP, query lại cả dải → người dùng vẫn
 *        thấy toàn bộ ガイド STEP thay vì màn hình trắng.
 *
 * ⚠️ Vì sao phải SEED ガイド: master thật của tenant chỉ có MỘT ガイド hiện được
 * trong dải 1000-1999. Cộng với nhánh fallback ở trên, mọi giá trị trt_state đều
 * cho ra cùng một danh sách ⇒ nhìn từ UI không phân biệt được gì. Nhóm B vì thế
 * seed hai ガイド (`seedStepGuides`, tests/db.ts) với `pac_step_01` khác nhau và
 * `pac_tbl.dis_cd = 9999` (universal) để không phụ thuộc 病名 của hồ sơ test.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Ghi DB
 * ═══════════════════════════════════════════════════════════════════════════
 *  Mặc định KHÔNG ghi gì: TC-STEP-SAVE-1 chặn PUT bằng `page.route` để soi
 *  payload. Mọi thứ ghi thật (TC-STEP-SAVE-2 + CẢ nhóm B) nằm sau
 *  TEST_ALLOW_SAVE=1 (Rule 18.1).
 *  Nhóm B ghi hai thứ và tự trả lại ở `afterAll` (chạy cả khi test đỏ):
 *    · trt_state của bệnh nhân test → `writeTrtStateCells` trả đúng các ô đã sửa
 *    · pac_nam/pag_trt/pac_tbl guid_cd 1900-1999 → `deleteStepGuides` xoá hẳn
 *  Spec KHÔNG bao giờ bấm F9 登録 của màn 診療入力 ⇒ 部位病名行 mà nhóm B áp vào
 *  lưới chỉ nằm trong bộ nhớ, không rơi xuống `trn_trn`.
 *
 *  Lưu ý về "nguyên trạng": `trt_state` là bảng chuẩn hoá, ô = 0 thì bình
 *  thường KHÔNG có dòng. Sau khi chạy, các ô nhóm B đụng tới sẽ CÒN LẠI dòng
 *  mang `value = 0`. Đó KHÔNG phải rác: chính BE cũng để lại như vậy
 *  (`TrtStateCommands.ResetBuiSlotsAsync` chèn dòng value=0, `SaveGridAsync`
 *  cập nhật về 0 chứ không xoá), nên trạng thái này giống hệt sau một cú
 *  リセット của người dùng thật. `GetAsync` mặc định ô thiếu là 0 ⇒ không có
 *  khác biệt hành vi nào.
 *
 *  ⚠️ `seedStepGuides` sửa MASTER (dùng chung cả tenant). Với TEST_ALLOW_SAVE=1
 *  thì đừng chạy song song file này với `guide-sidepanel-handler.spec.ts` —
 *  config để `fullyParallel: true, workers: 4`, hai ガイド seed sẽ lọt vào danh
 *  sách STEP mà file kia đang đếm. Chạy riêng:
 *      TEST_ALLOW_SAVE=1 npx playwright test tests/step-edit-dialog.spec.ts --workers=1
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `SanteiConfirmDialog` 「〜を算定しますか？」 bung sau khi lưới nạp xong, nổi
 *     ĐÈ và nuốt cả phím F11 ⇒ vét bằng `drainBlockingDialogs()` TRƯỚC mỗi lần
 *     bấm F11. `addLocatorHandler` chỉ chạy khi Playwright đang làm một ACTION,
 *     không giúp gì cho `keyboard.press`.
 *  2. Ô STEP là `type="number"`: ↑/↓ mặc định tăng/giảm giá trị. Component
 *     `preventDefault` để biến chúng thành điều hướng ⇒ TC-STEP-NAV-1 soi CẢ
 *     focus mới LẪN giá trị ô cũ không đổi.
 *  3. `fill('')` trên input number cho `value = ''`, component quy về 0. Muốn
 *     kiểm "xoá trắng → ghi 0" thì đọc payload PUT, đừng đọc lại ô.
 *  4. `locator.isVisible({ timeout })` KHÔNG chờ — nó soi DOM ngay lúc gọi. Hộp
 *     nào cần một vòng gọi API mới bung ra thì phải dùng `appeared()`.
 *  5. Dialog dùng chung role="dialog" với AgentOfflineDialog và SanteiConfirm
 *     ⇒ luôn lọc bằng `hasText` của tiêu đề, đừng `.first()`.
 *  6. Nhóm B: sau khi F9 lưu, mutation invalidate `guidsKeys.all` nên list ガイド
 *     TỰ nạp lại ngay — đừng `waitForResponse` sau cú Shift+F4 kế tiếp (có thể
 *     không có request nào nữa). Assert thẳng trên DOM và để `expect` tự retry.
 *  7. Radix AlertDialog gắn `aria-hidden` lên toàn bộ nền khi mở ⇒ mọi locator
 *     theo role đều "không tìm thấy". Dọn alert TRƯỚC khi assert bằng getByRole.
 *  8. `locator.count()` KHÔNG auto-wait. Đổi tab side panel xong đếm ngay là ra
 *     0 dù bệnh nhân có đủ dữ liệu ⇒ `openSideTab` chờ dòng đầu HOẶC 「未登録」.
 *  9. Nút xác nhận của `confirmDialog` (kind='confirm') mặc định là **Yes/No**,
 *     KHÔNG phải はい/いいえ — nhãn tiếng Nhật là của kind='confirm3'.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TESTCASE ĐANG ĐỎ CÓ CHỦ Ý
 * ═══════════════════════════════════════════════════════════════════════════
 *  TC-STEP-LINK-7 assert thẳng theo WinForm và ĐỎ cho tới khi web được sửa:
 *  「リセット」 ghi trt_state nhưng KHÔNG invalidate cache lưới STEP, nên mở lại
 *  Ｓｔｅｐ編集 vẫn thấy số cũ — và F9 ở đó sẽ ghi đè ngược, huỷ luôn cú リセット.
 *  Chi tiết + chỗ sửa nằm trong comment của chính testcase đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Cách chạy
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/step-edit-dialog.spec.ts --retries=0
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/step-edit-dialog.spec.ts --retries=0 --workers=1
 *
 * `--retries=0` vì retry chạy lại CẢ khối serial ⇒ thêm một lần login, tốn quota
 * (Rule 10.1). Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19): khối serial
 * dùng chung một page và thứ tự CÓ Ý NGHĨA.
 *
 * ⚠️ KHÔNG dùng `--repeat-each` với file này (ngoại lệ của Rule 16).
 * `--repeat-each=N` lặp TỪNG TESTCASE N lần liên tiếp, không lặp cả file — nó
 * phá đúng cái mà `serial` xây: TC-STEP-VALID-2 lượt 1 kết thúc bằng việc trả ô
 * về giá trị HỢP LỆ, nên lượt 2 của chính nó chạy với ô sạch, F9 gửi PUT thật và
 * `expect(putSeen).toBe(false)` đỏ. Muốn kiểm độ ổn định thì lặp CẢ FILE:
 *
 *   for i in 1 2 3; do npx playwright test tests/step-edit-dialog.spec.ts --retries=0; done
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

/** Cho phép GHI THẬT trt_state + seed ガイド master. Mặc định tắt (Rule 18.1). */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

const GRID_LOAD_TIMEOUT = 60_000

// ── URL các endpoint màn này đụng tới ────────────────────────────────────────
const TRT_STATE_GET_URL = /\/tenant\/guids\/trt-state\?/
const TRT_STATE_PUT_URL = /\/tenant\/guids\/\d+\/trt-state(\?|$)/

// ── Nhãn menu, lấy nguyên văn từ F11_MENU_ITEMS ──────────────────────────────
const MENU_OPTIONS = '9 オプション'
const MENU_STEP = 'Step'

/** MouthConstants.StepBuiRowCount — số 種別. */
const STEP_ROW_COUNT = 15
/** MouthConstants.AdultBuiCount — số 部位. */
const BUI_COLUMN_COUNT = 32
/** step-edit-dialog.tsx HALF_ARCH — ranh giới hàm trên / hàm dưới. */
const HALF_ARCH = BUI_COLUMN_COUNT / 2
/** MouthConstants.StepValueMax. */
const STEP_VALUE_MAX = 30_000
/** Ô dùng để gõ thử — 種別 1, 部位 1. Không đụng ô nào khác. */
const PROBE_ROW = 1
const PROBE_COL = 1
/** Giá trị thử: hợp lệ, khác 0. */
const PROBE_VALUE = 7
/** 種別 thứ hai dùng để kiểm buffer (index 1 trong danh sách). */
const OTHER_KIND_INDEX = 1

// ── Nhóm B — ガイド seed + hằng số của mắt xích ──────────────────────────────
/**
 * guid_cd của hai ガイド seed. Phải nằm trong dải [1900, 1999] mà
 * `seedStepGuides` cho phép, và phải TRỐNG ở tenant đang test (hàm seed tự ném
 * lỗi nếu bị master thật chiếm).
 */
const SEED_GUID_A = Number(process.env.TEST_STEP_GUID_BASE ?? 1901)
const SEED_GUID_B = SEED_GUID_A + 1
const SEED_NM_A = 'E2E STEP A'
const SEED_NM_B = 'E2E STEP B'
/**
 * Mã bước dẫn TỚI mỗi ガイド (ghi vào `pac_step_01`). Gõ số này vào Ｓｔｅｐ編集
 * là ép Shift+F4 chỉ còn đúng ガイド tương ứng.
 * Chọn số ≤ StepValueMax và không đụng dải guid_cd để khỏi lẫn với nhánh 前回.
 */
const STEP_FROM_A = 29_001
const STEP_FROM_B = 29_002
/** Mã KHÔNG khớp `pac_step` của ガイド nào — dùng để bắn vào nhánh fallback. */
const STEP_FROM_NONE = 29_999

/**
 * dis_cd → bui_idx, chép từ `MouthConstants.MapDisCdToBuiIdx`
 * (apps/api/src/Ochacom.Domain/Constants/MouthConstants.cs:51-60).
 * Đây là bản sao có chủ ý: nó khoá luôn hợp đồng 「種別 nào ăn 病名 nào」, nên
 * BE đổi bảng ánh xạ mà quên báo thì nhóm B đỏ.
 */
const DIS_CD_TO_BUI_IDX: Readonly<Record<number, number>> = {
    100: 1,
    390: 1,
    101: 2,
    102: 3,
    162: 3,
    167: 3,
    392: 3,
    103: 4,
    116: 5,
    321: 5,
    322: 5,
    326: 5,
    329: 5,
    342: 5,
    363: 5,
    382: 5,
    383: 5,
    393: 5,
    394: 5,
    133: 6,
    169: 6,
    181: 6,
    302: 6,
    369: 6,
    377: 6,
}

/** Số dòng 病検 tối đa sẽ thử khi đi tìm một 部位病名 dùng được. */
const BYOU_SCAN_LIMIT = 6

/** Dòng tab 病検 / ガイド (treatment-side-panel.tsx). */
const BYOU_ROW_SEL = 'div[class*="grid-cols-[30px_270px_1fr]"][class*="cursor-pointer"]'
const GUID_ROW_SEL = 'div[class*="grid-cols-[40px_1fr]"][class*="cursor-pointer"]'

interface SaveGridBody {
    rows: number[][]
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — Ｓｔｅｐ編集 (frm203050)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu 選択 của F11. Lọc theo '1 メニュー' để không dính submenu. */
    let rowMenu: Locator
    /** Tiêu đề có dấu cách thật nên match nguyên văn. */
    let stepDialog: Locator

    // ── Locator của side panel (nhóm B) ──────────────────────────────────────
    let sidePanel: Locator
    let tabBtns: Locator
    let byouRows: Locator
    let guidRows: Locator
    let noInput: Locator
    let prvBtn: Locator
    let resetBtn: Locator
    let noGuidAlert: Locator

    /** Lưới STEP bắt được ở lần mở ĐẦU TIÊN (staleTime Infinity — xem đầu file). */
    let loadedGrid: number[][] | null = null
    /** Giá trị gốc ô STEP thử, để trả lại. */
    let stepProbeBefore: number | null = null

    // ── Trạng thái nhóm B, chốt ở TC-STEP-LINK-0 ─────────────────────────────
    /** 種別 mà 部位病名行 đang focus trỏ tới (= bui_idx). `null` = chưa dựng được. */
    let linkBuiIdx: number | null = null
    /** Các cột 部位 (1-based) mà 部位病名行 đó đã chọn. */
    let linkCols: number[] = []
    /** Giá trị gốc của đúng các ô sẽ bị sửa, để trả lại ở afterAll. */
    let linkCellsBefore: Array<{ posIdx: number; value: number }> = []
    /** Ảnh chụp CẢ 32 ô của 種別 đó — để chứng minh リセット không đụng ô ngoài phạm vi. */
    let linkRowBefore: number[] = []
    /** Đã seed ガイド chưa — quyết định có phải dọn ở afterAll không. */
    let seeded = false

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
     * màn hình đã nạp đủ. Phím chỉ tới được FKeyScopeProvider khi tiêu điểm bàn
     * phím nằm trong phạm vi nó nghe; sau `page.goto` thì không có gì được focus
     * nên phím rơi vào khoảng không.
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

    /**
     * Ô STEP theo (種別, 部位) 1-based — khớp `aria-label` của component.
     *
     * `exact: true` là BẮT BUỘC: mặc định `name` khớp CHUỖI CON, nên
     * 「STEP 1-1」 trúng luôn 1-10…1-19 (11 phần tử) và Playwright ném strict
     * mode violation. Đã vấp một lượt chạy vì chỗ này.
     */
    const stepCell = (row: number, col: number) =>
        stepDialog.getByRole('spinbutton', { name: `STEP ${row}-${col}`, exact: true })
    const stepKindSelect = () => stepDialog.getByRole('combobox')

    /**
     * Chọn 種別 theo SỐ đầu nhãn thay vì theo vị trí trong list.
     * Nhãn mst_cod 70 là '{số}-{tên}' (' 1-Ｃ関連' … '15-'), component trim đệm.
     * Bám theo số là bám theo `cd_val` — cũng là `bui_idx` mà BE dùng — nên
     * master đảo thứ tự cũng không trỏ nhầm hàng.
     */
    async function pickKind(buiIdx: number) {
        const combo = stepKindSelect()
        if ((await combo.innerText()).trim().startsWith(`${buiIdx}-`)) return
        await combo.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        await listbox
            .getByRole('option')
            .filter({ hasText: new RegExp(`^\\s*${buiIdx}-`) })
            .first()
            .click()
        await expect(listbox).toBeHidden({ timeout: 10_000 })
        await expect(combo, `không chọn được 種別 ${buiIdx}`).toContainText(`${buiIdx}-`)
    }

    /** Đọc một ô trt_state thẳng từ DB. Không có dòng = 0 (BE mặc định vậy). */
    async function readTrtStateCell(buiIdx: number, posIdx: number): Promise<number> {
        return withDb(async (c) => {
            const r = await c.query<{ value: number | null }>(
                `SELECT value FROM view_trt_state_active
                  WHERE pat_no = $1 AND bui_idx = $2 AND pos_idx = $3 LIMIT 1`,
                [Number(PAT_NO), buiIdx, posIdx],
            )
            return Number(r.rows[0]?.value ?? 0)
        })
    }

    // ── Helper nhóm B ────────────────────────────────────────────────────────

    /** Nhãn tab side panel đang mở (nút mang class `bg-accent`). */
    async function activeTab(): Promise<string> {
        return tabBtns.evaluateAll(
            (els) => els.find((e) => e.className.includes('bg-accent'))?.textContent?.trim() ?? '',
        )
    }

    /**
     * Mở một tab của side panel, chờ nó active VÀ chờ list nạp xong.
     *
     * Cái vế thứ hai là bắt buộc: `locator.count()` KHÔNG auto-wait (Rule 7) —
     * nó đếm DOM ngay lúc gọi. Đếm ngay sau khi đổi tab thì list chưa về và
     * `count() === 0`, testcase skip với lý do 「rỗng」 trong khi bệnh nhân có
     * đủ dữ liệu. ĐÃ ĐO ĐƯỢC (2026-08-14): nhóm B skip toàn bộ vì chỗ này, dù
     * `trn_trn` của bệnh nhân test có 1874 dòng đủ điều kiện 病検.
     * Mốc đúng: dòng đầu HOẶC nhãn 「未登録」 (treatment-side-panel.tsx:793).
     */
    async function openSideTab(tab: '病検' | 'ガイド') {
        if ((await activeTab()) !== tab) {
            await sidePanel.getByRole('button', { name: tab, exact: true }).click()
            await expect.poll(() => activeTab(), { timeout: 15_000 }).toBe(tab)
        }
        const rowsOf = tab === '病検' ? byouRows : guidRows
        await expect(
            rowsOf.first().or(sidePanel.getByText('未登録')),
            `tab ${tab} không nạp xong (không có dòng nào lẫn nhãn 未登録)`,
        ).toBeVisible({ timeout: 30_000 })
    }

    /**
     * Đóng alert E00024 「該当ガイドがありません。」 nếu nó bung; trả true khi có.
     *
     * PHẢI CHỜ chứ không soi `count()` ngay: alert do `useEmptyGuideAlert` bắn ở
     * effect SAU khi query resolve, nên ngay lúc response về nó chưa có trong DOM.
     */
    async function dismissNoGuidAlert(waitMs = 3_000): Promise<boolean> {
        if (!(await appeared(noGuidAlert, waitMs))) return false
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noGuidAlert).toBeHidden({ timeout: 10_000 })
        return true
    }

    /**
     * Đưa tiêu điểm bàn phím về trong phạm vi FKeyScopeProvider.
     *
     * Cùng lý do với `openMenu`: sau khi một dialog đóng, focus có thể rơi ra
     * ngoài và `keyboard.press('Shift+F4')` sẽ im lặng không làm gì. Ô 選択№ của
     * side panel là chỗ click an toàn nhất — nó là input, click không chốt gì
     * (khác click vào một dòng ガイド: cú đó mở luôn ガイド処置選択).
     */
    async function focusScreen() {
        await drainBlockingDialogs()
        if ((await noInput.count()) > 0) await noInput.first().click()
    }

    /** Shift+F4 → chế độ STEP. Mốc 「đã vào STEP」 = nút 前回 hiện ra. */
    async function shiftF4() {
        await focusScreen()
        await page.keyboard.press('Shift+F4')
        await dismissNoGuidAlert()
        await expect(prvBtn, 'Shift+F4 không vào được chế độ STEP').toBeVisible({
            timeout: 30_000,
        })
    }

    /** Dòng ガイド mang đúng tên đó. `toHaveCount(0/1)` tự retry theo refetch. */
    const guideRowByName = (nm: string) => guidRows.filter({ hasText: nm })

    /**
     * Gõ `value` vào các ô `cols` của 種別 `kind` rồi F9 確定 (GHI THẬT).
     * Trả về khi PUT đã 2xx và dialog đã đóng.
     */
    async function setStepCells(kind: number, cols: readonly number[], value: number) {
        await openFromOptions(MENU_STEP, stepDialog)
        await pickKind(kind)
        for (const col of cols) await stepCell(kind, col).fill(String(value))

        const putRes = page.waitForResponse(
            (res) => TRT_STATE_PUT_URL.test(res.url()) && res.request().method() === 'PUT',
            { timeout: 60_000 },
        )
        await stepDialog.getByRole('button', { name: 'F9 確定' }).click()
        expect((await putRes).status(), 'PUT trt-state phải 2xx').toBeLessThan(300)
        await expect(stepDialog).toBeHidden({ timeout: 30_000 })
    }

    /** Điều kiện chung của cả nhóm B — thiếu cái nào thì skip KÈM lý do. */
    function requireLinkContext() {
        skipWithReason(
            !dbEnabled,
            'nhóm B cần đọc/seed DB — đặt TEST_DB=1 (và TEST_DB_HOST nếu DB ở máy khác)',
        )
        skipWithReason(
            !ALLOW_SAVE,
            'nhóm B ghi thật trt_state + seed ガイド master — đặt TEST_ALLOW_SAVE=1 để chạy',
        )
        skipWithReason(!seeded, 'seedStepGuides không tạo được ガイド nào (xem log của beforeAll)')
    }

    /** Như trên, cộng thêm ràng buộc TC-STEP-LINK-0 đã dựng được bối cảnh. */
    function requireLinkTarget() {
        requireLinkContext()
        skipWithReason(
            linkBuiIdx === null,
            'TC-STEP-LINK-0 không dựng được 部位病名 dùng được (xem log của nó)',
        )
    }

    // ── Vòng đời ─────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Seed TRƯỚC khi vào màn: list ガイド nạp lần đầu ngay lúc mở tab, seed sau
        // thì phải nạp lại mới thấy.
        if (dbEnabled && ALLOW_SAVE) {
            // Seed hỏng thì CHỈ nhóm B mất — nhóm A không đụng ガイド nào. Nuốt lỗi
            // ở đây để không kéo cả file đỏ theo, lý do in ra stdout.
            try {
                const n = await seedStepGuides([
                    { guidCd: SEED_GUID_A, guidNm: SEED_NM_A, stepFrom: STEP_FROM_A },
                    { guidCd: SEED_GUID_B, guidNm: SEED_NM_B, stepFrom: STEP_FROM_B },
                ])
                seeded = n > 0
                console.log(`seedStepGuides: ${n} ガイド (${SEED_GUID_A}, ${SEED_GUID_B})`)
            } catch (e) {
                console.log(`seedStepGuides THẤT BẠI — nhóm B sẽ skip: ${(e as Error).message}`)
            }
        }

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
        stepDialog = page.getByRole('dialog').filter({ hasText: 'S t e p 編 集' })

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        tabBtns = sidePanel.getByRole('button', { name: /^(病検|ガイド|パック|個別)$/ })
        byouRows = sidePanel.locator(BYOU_ROW_SEL)
        guidRows = sidePanel.locator(GUID_ROW_SEL)
        noInput = page.locator('input[data-side-anchor]')
        prvBtn = sidePanel.getByRole('button', { name: '前回', exact: true })
        resetBtn = sidePanel.getByRole('button', { name: 'リセット', exact: true })
        noGuidAlert = page.getByText('該当ガイドがありません')

        await backToEntry()
    })

    test.afterAll(async () => {
        // Trả nguyên trạng CHẮC CHẮN chạy kể cả khi test đỏ giữa chừng — đây là
        // lý do dọn ở afterAll chứ không ở một testcase cuối (serial: testcase
        // sau một cú đỏ sẽ bị SKIP, dọn dẹp cũng skip theo).
        if (ALLOW_SAVE && dbEnabled) {
            if (linkBuiIdx !== null && linkCellsBefore.length > 0) {
                await writeTrtStateCells(Number(PAT_NO), linkBuiIdx, linkCellsBefore).catch((e) =>
                    console.log(`afterAll: trả trt_state thất bại — ${(e as Error).message}`),
                )
            }
            if (stepProbeBefore !== null) {
                const now = await readTrtStateCell(PROBE_ROW, PROBE_COL).catch(() => null)
                if (now !== null && now !== stepProbeBefore) {
                    console.log(
                        `afterAll: trt_state(${PROBE_ROW},${PROBE_COL}) = ${now}, ` +
                            `gốc là ${stepProbeBefore} — KHÔI PHỤC THỦ CÔNG.`,
                    )
                }
            }
            if (seeded) {
                const n = await deleteStepGuides([SEED_GUID_A, SEED_GUID_B]).catch(() => -1)
                console.log(`deleteStepGuides: xoá ${n} dòng`)
            }
        }
        await page?.close()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // A. Nội dung dialog (frm203050)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-STEP-OPEN-1 — mở dialog và nạp CẢ 15×32 ô của bệnh nhân', async () => {
        // Query gate bằng `enabled: open` ⇒ request CHỈ bay khi dialog mở. Bắt
        // response TRƯỚC rồi mới mở. Đây là lần mở ĐẦU TIÊN nên chắc chắn có
        // request (staleTime Infinity — các lần sau thì không, xem đầu file).
        const gridRes = page.waitForResponse(
            (res) => TRT_STATE_GET_URL.test(res.url()) && res.request().method() === 'GET',
            { timeout: 60_000 },
        )

        await openFromOptions(MENU_STEP, stepDialog)

        const res = await gridRes
        expect(
            new URL(res.url()).searchParams.get('patNo'),
            'phải hỏi đúng bệnh nhân đang mở',
        ).toBe(PAT_NO)

        const body = (await res.json()) as { data?: { rows?: number[][] } }
        loadedGrid = (body.data?.rows ?? []).map((r) => r.map(Number))
        expect(loadedGrid, `phải trả đủ ${STEP_ROW_COUNT} 種別`).toHaveLength(STEP_ROW_COUNT)
        for (const [i, row] of loadedGrid.entries()) {
            expect(row, `種別 ${i + 1} phải đủ ${BUI_COLUMN_COUNT} 部位`).toHaveLength(
                BUI_COLUMN_COUNT,
            )
        }
        await step()
    })

    test('TC-STEP-OPEN-2 — combo 種別 lấy đủ 15 mục của mst_cod 70', async () => {
        const options = await optionsOf(stepKindSelect())
        expect(
            options,
            'combo 種別 phải đổ từ mst_cod cd_type 70 — hardcode 15 nhãn là sai',
        ).toHaveLength(STEP_ROW_COUNT)

        // Nhãn mst_cod 70 là '{số}-{tên}' (' 1-Ｃ関連' … '15-'); component trim
        // khoảng trắng đệm. Soi theo TẬP HỢP số đầu dòng: phải đủ 1..15, không
        // trùng, không thiếu.
        const numbers = options.map((o) => Number(o.split('-')[0])).sort((a, b) => a - b)
        expect(
            numbers,
            `nhãn 種別 phải là 1..15, đang có: ${options.join(' / ')}`,
        ).toEqual(Array.from({ length: STEP_ROW_COUNT }, (_, i) => i + 1))

        // …và phải HIỆN theo đúng thứ tự 1..15.
        //
        // Đây là chỗ đã bắt được một lỗi thật (2026-08-11): combo mở ra với
        // 「12-」 đứng đầu. `GetMstCodHandler` chỉ `.OrderBy(c => c.SortOrder)`,
        // mà cd_type 70 — như hầu hết cd_type — có sort_order = 0 trên MỌI dòng,
        // nên Postgres tự do trả 12, 3, 7… WinForm cũng chỉ `ORDER BY SORT_ORDER`
        // (CodMst.cs:41) nhưng clustered PK (CD_TYPE, CD_VAL) của SQL Server phá
        // hoà bằng cd_val. Đã sửa hai lớp: `.ThenBy(c => c.CdVal)` ở BE, và
        // component tự `.sort(cdVal)` để không phụ thuộc thứ tự server trả.
        expect(
            numbers,
            `種別 phải hiện theo thứ tự 1..15, đang là: ${options.join(' / ')}`,
        ).toEqual(options.map((o) => Number(o.split('-')[0])))

        // Trigger phải mang 種別 1 (WinForm `dspData(1); _bkIdx = 1`).
        await expect(stepKindSelect(), 'mở màn phải đứng ở 種別 1').toContainText(options[0] ?? '')
        await step()
    })

    test('TC-STEP-GRID-1 — đúng 32 ô nhập', async () => {
        await expect(stepDialog.getByRole('spinbutton')).toHaveCount(BUI_COLUMN_COUNT)
        for (const col of [1, HALF_ARCH, HALF_ARCH + 1, BUI_COLUMN_COUNT]) {
            await expect(stepCell(PROBE_ROW, col), `thiếu ô 部位 ${col}`).toBeVisible()
        }
        await step()
    })

    test('TC-STEP-LOAD-1 — 32 ô khớp payload của 種別 đang chọn', async () => {
        expect(loadedGrid, 'TC-STEP-OPEN-1 chưa bắt được response').not.toBeNull()
        const row = loadedGrid![PROBE_ROW - 1]!
        // Soi cả 32 ô: chỗ duy nhất chứng minh thứ tự 部位 không bị lệch.
        for (let col = 1; col <= BUI_COLUMN_COUNT; col++) {
            await expect(
                stepCell(PROBE_ROW, col),
                `種別 ${PROBE_ROW} / 部位 ${col} lệch so với payload`,
            ).toHaveValue(String(row[col - 1]!))
        }
        await step()
    })

    test('TC-STEP-BUFFER-1 — đổi 種別 rồi quay lại: số vừa gõ VẪN CÒN', async () => {
        // Đây là lý do BE trả cả 15 hàng trong một lần: WinForm giữ nguyên
        // `_stsBui` khi đổi 種別 (dspData chỉ đổ lại màn hình). Nếu port đi theo
        // hướng "mỗi 種別 một request" thì testcase này đỏ.
        expect(loadedGrid, 'TC-STEP-OPEN-1 chưa bắt được response').not.toBeNull()
        stepProbeBefore = loadedGrid![PROBE_ROW - 1]![PROBE_COL - 1]!

        await stepCell(PROBE_ROW, PROBE_COL).fill(String(PROBE_VALUE))
        await expect(stepCell(PROBE_ROW, PROBE_COL)).toHaveValue(String(PROBE_VALUE))

        // Sang 種別 khác — màn hình phải đổ giá trị của 種別 MỚI.
        await pickOption(stepKindSelect(), OTHER_KIND_INDEX)
        await expect(
            stepCell(OTHER_KIND_INDEX + 1, PROBE_COL),
            'đổi 種別 mà ô vẫn mang số của 種別 cũ — dspData không chạy',
        ).toHaveValue(String(loadedGrid![OTHER_KIND_INDEX]![PROBE_COL - 1]!))
        await step()

        // Quay lại 種別 đầu: số vừa gõ phải còn nguyên trong buffer.
        await pickOption(stepKindSelect(), 0)
        await expect(
            stepCell(PROBE_ROW, PROBE_COL),
            'quay lại 種別 cũ mà mất số đã gõ — buffer 15 種別 không được giữ',
        ).toHaveValue(String(PROBE_VALUE))
        await step()
    })

    test('TC-STEP-NAV-1 — ↑/↓ nhảy giữa hai hàm CÙNG CỘT, không tăng/giảm giá trị', async () => {
        // Ô là <input type="number">: mặc định ↑/↓ đổi giá trị. Component
        // preventDefault để biến chúng thành điều hướng ⇒ soi CẢ hai vế.
        const upper = stepCell(PROBE_ROW, PROBE_COL)
        const lower = stepCell(PROBE_ROW, PROBE_COL + HALF_ARCH)
        const upperBefore = await upper.inputValue()

        await upper.focus()
        await page.keyboard.press('ArrowDown')
        await expect(lower, '↓ phải nhảy xuống hàm dưới CÙNG CỘT').toBeFocused()
        await expect(upper, '↓ không được tăng/giảm giá trị ô cũ').toHaveValue(upperBefore)

        await page.keyboard.press('ArrowUp')
        await expect(upper, '↑ phải quay lại hàm trên CÙNG CỘT').toBeFocused()
        await step()
    })

    test('TC-STEP-NAV-2 — →/← đi hết 32 ô và VÒNG LẠI ở hai đầu', async () => {
        await stepCell(PROBE_ROW, BUI_COLUMN_COUNT).focus()
        await page.keyboard.press('ArrowRight')
        await expect(
            stepCell(PROBE_ROW, 1),
            '→ ở ô CUỐI phải vòng về ô ĐẦU (frm203050.cs:162)',
        ).toBeFocused()

        await page.keyboard.press('ArrowLeft')
        await expect(
            stepCell(PROBE_ROW, BUI_COLUMN_COUNT),
            '← ở ô ĐẦU phải vòng về ô CUỐI (frm203050.cs:166)',
        ).toBeFocused()
        await step()
    })

    test('TC-STEP-VALID-1 — quá 30000 thì KHÔNG cho đổi 種別', async () => {
        await stepCell(PROBE_ROW, PROBE_COL).fill(String(STEP_VALUE_MAX + 1))

        const kindBefore = (await stepKindSelect().innerText()).trim()
        await stepKindSelect().click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        await listbox.getByRole('option').nth(OTHER_KIND_INDEX).click()
        await expect(listbox).toBeHidden({ timeout: 10_000 })

        const alertText = await readAndDismissAlert()
        expect(alertText, 'thiếu câu đầu của E00100').toContain('STEPの値が正しくありません。')
        expect(alertText, 'thiếu ngưỡng trong thông báo').toContain(
            `${STEP_VALUE_MAX}以下の値を入力して下さい。`,
        )

        await expect(
            stepKindSelect(),
            'giá trị sai mà vẫn đổi được 種別 — WinForm chặn ở cboKind_SelectedValueChanged',
        ).toContainText(kindBefore)
        await expect(
            stepCell(PROBE_ROW, PROBE_COL),
            'phải focus lại đúng ô sai (frm203050.cs:262)',
        ).toBeFocused()
        await step()
    })

    test('TC-STEP-VALID-2 — quá 30000 thì F9 KHÔNG gửi PUT và KHÔNG đóng dialog', async () => {
        // Ô vẫn đang mang giá trị sai từ TC-STEP-VALID-1.
        let putSeen = false
        await page.route(TRT_STATE_PUT_URL, async (route: Route) => {
            putSeen = true
            await route.abort()
        })

        try {
            await stepDialog.getByRole('button', { name: 'F9 確定' }).click()
            await readAndDismissAlert()
        } finally {
            await page.unroute(TRT_STATE_PUT_URL)
        }

        expect(putSeen, 'giá trị sai mà vẫn bắn PUT — validate chạy SAU khi gửi').toBe(false)
        await expect(stepDialog, 'lưu hỏng mà đóng dialog thì mất hết chỉnh sửa').toBeVisible()

        // Trả ô về giá trị hợp lệ cho các testcase sau.
        await stepCell(PROBE_ROW, PROBE_COL).fill(String(PROBE_VALUE))
        await step()
    })

    test('TC-STEP-SAVE-1 — F9 gửi ĐỦ 15×32 ô, ô để trống gửi 0', async () => {
        // Ô để trống PHẢI đi lên thành 0: BE suy ra "người dùng xoá" từ số 0 trong
        // payload; bỏ ô đó khỏi body thì giá trị cũ nằm lại trong DB.
        const blankCol = PROBE_COL + 1
        await stepCell(PROBE_ROW, blankCol).fill('')

        let sent: SaveGridBody | null = null
        // CHẶN request ⇒ KHÔNG ghi DB, chạy hằng ngày được.
        await page.route(TRT_STATE_PUT_URL, async (route: Route) => {
            const req = route.request()
            if (req.method() !== 'PUT') return route.fallback()
            sent = req.postDataJSON() as SaveGridBody
            await route.fulfill({
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, data: true }),
            })
        })

        try {
            await stepDialog.getByRole('button', { name: 'F9 確定' }).click()
            await expect(stepDialog, 'lưu xong thì dialog phải đóng').toBeHidden({ timeout: 30_000 })
        } finally {
            await page.unroute(TRT_STATE_PUT_URL)
        }

        expect(sent, 'không bắt được PUT /tenant/guids/{patNo}/trt-state').not.toBeNull()
        expect(sent!.rows, `phải gửi đủ ${STEP_ROW_COUNT} 種別`).toHaveLength(STEP_ROW_COUNT)
        for (const [i, row] of sent!.rows.entries()) {
            expect(row, `種別 ${i + 1} phải đủ ${BUI_COLUMN_COUNT} 部位`).toHaveLength(
                BUI_COLUMN_COUNT,
            )
        }
        const sentRow = sent!.rows[PROBE_ROW - 1]!
        expect(sentRow[PROBE_COL - 1], 'số vừa gõ không tới được payload').toBe(PROBE_VALUE)
        expect(
            sentRow[blankCol - 1],
            'ô để trống phải gửi 0 — bỏ qua thì BE giữ nguyên giá trị cũ',
        ).toBe(0)
        await step()
    })

    test('TC-STEP-SAVE-2 — ghi THẬT trt_state rồi mở lại vẫn còn (TEST_ALLOW_SAVE=1)', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'ghi thật trt_state của bệnh nhân test — đặt TEST_ALLOW_SAVE=1 để chạy',
        )
        expect(stepProbeBefore, 'TC-STEP-BUFFER-1 chưa chốt được giá trị gốc').not.toBeNull()

        await openFromOptions(MENU_STEP, stepDialog)
        await stepCell(PROBE_ROW, PROBE_COL).fill(String(PROBE_VALUE))

        const putRes = page.waitForResponse(
            (res) => TRT_STATE_PUT_URL.test(res.url()) && res.request().method() === 'PUT',
            { timeout: 60_000 },
        )
        await stepDialog.getByRole('button', { name: 'F9 確定' }).click()
        expect((await putRes).status(), 'PUT trt-state phải 2xx').toBeLessThan(300)
        await expect(stepDialog).toBeHidden({ timeout: 30_000 })

        if (dbEnabled) {
            expect(
                await readTrtStateCell(PROBE_ROW, PROBE_COL),
                'PUT trả 2xx nhưng DB không đổi — write không tới bảng',
            ).toBe(PROBE_VALUE)
        }

        // Mở lại: mutation đã invalidate nên lần này CÓ request mới.
        await openFromOptions(MENU_STEP, stepDialog)
        await expect(
            stepCell(PROBE_ROW, PROBE_COL),
            'lưu xong mở lại phải thấy giá trị vừa ghi',
        ).toHaveValue(String(PROBE_VALUE))
        await step()

        // Trả lại giá trị gốc.
        await stepCell(PROBE_ROW, PROBE_COL).fill(String(stepProbeBefore))
        await stepDialog.getByRole('button', { name: 'F9 確定' }).click()
        await expect(stepDialog).toBeHidden({ timeout: 30_000 })
        if (dbEnabled) {
            expect(
                await readTrtStateCell(PROBE_ROW, PROBE_COL),
                'khôi phục giá trị gốc thất bại',
            ).toBe(stepProbeBefore!)
        }
        await step()
    })

    test('TC-STEP-CLOSE-1 — F10 戻る không lưu, mở lại bỏ hết chỉnh sửa dở', async () => {
        await openFromOptions(MENU_STEP, stepDialog)
        const seeded0 = await stepCell(PROBE_ROW, PROBE_COL).inputValue()

        await stepCell(PROBE_ROW, PROBE_COL).fill(String(Number(seeded0) + 1))
        let putSeen = false
        await page.route(TRT_STATE_PUT_URL, async (route: Route) => {
            putSeen = true
            await route.abort()
        })
        try {
            await closeWithF10(stepDialog)
        } finally {
            await page.unroute(TRT_STATE_PUT_URL)
        }
        expect(putSeen, 'F10 戻る mà vẫn ghi — 戻る không được lưu gì').toBe(false)

        await openFromOptions(MENU_STEP, stepDialog)
        await expect(
            stepCell(PROBE_ROW, PROBE_COL),
            'mở lại phải seed lại từ dữ liệu server, không giữ chỉnh sửa dở',
        ).toHaveValue(seeded0)
        await closeWithF10(stepDialog)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // B. Mắt xích trt_state → tab ガイド
    //
    // Trước nhóm này KHÔNG spec nào chứng minh được số gõ trong Ｓｔｅｐ編集 có
    // tác dụng gì: `guide-sidepanel-handler.spec.ts` chỉ assert guid_cd rơi
    // trong dải 1000-1999, còn nhóm A ở trên dừng ở PUT/DB.
    //
    // Cả nhóm chạy trên MỘT bối cảnh do TC-STEP-LINK-0 dựng: một 部位病名行 có
    // 病名 ánh xạ được sang 種別 và có ít nhất một răng được chọn. Bối cảnh đó
    // đọc ra từ CHÍNH request `/tenant/guids/step` mà app bắn đi, nên spec không
    // phải đoán hồ sơ test có dữ liệu gì.
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-STEP-LINK-0 — dựng bối cảnh: áp 部位病名 rồi đọc (種別, cột 部位) từ chính request Shift+F4', async () => {
        requireLinkContext()

        // Trang mới = xoá sạch cache TanStack (list ガイド staleTime 5 phút) nên
        // hai ガイド vừa seed chắc chắn được nạp lại từ BE.
        await backToEntry()
        await openSideTab('病検')
        const total = await byouRows.count()
        skipWithReason(total === 0, '病検 của bệnh nhân test rỗng — không áp được 部位病名 nào')

        // Click một dòng 病検 = áp 部位病名 rồi TỰ nhảy sang tab ガイド
        // (handleByouPick → jumpToGuideTab, treatment-entry-detail.tsx:2278).
        // Dò lần lượt vì không phải dòng nào cũng dùng được: 病名 phải ánh xạ
        // được sang bui_idx (MapDisCdToBuiIdx) và phải có ít nhất một răng.
        const tried: string[] = []
        for (let i = 0; i < Math.min(total, BYOU_SCAN_LIMIT); i++) {
            await openSideTab('病検')
            await byouRows.nth(i).click()
            await expect.poll(() => activeTab(), { timeout: 20_000 }).toBe('ガイド')

            // `.catch(() => null)` chứ không để ném: hai dòng 病検 cho ra CÙNG
            // (bui, disCd) thì `guidsKeys.stepList` trùng khoá và TanStack đọc
            // cache — không có request nào để soi. Đó là dữ liệu không dùng
            // được cho vòng dò, không phải app hỏng, nên bỏ qua dòng đó.
            const req = page
                .waitForRequest(
                    (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=step'),
                    { timeout: 15_000 },
                )
                .catch(() => null)
            await focusScreen()
            await page.keyboard.press('Shift+F4')
            const hit = await req
            await dismissNoGuidAlert(1_000)
            if (!hit) {
                tried.push(`#${i + 1}: không có request (trùng khoá cache với dòng trước)`)
                continue
            }

            const url = new URL(hit.url())
            const bui = url.searchParams.getAll('bui').map(Number)
            const disCd = url.searchParams.getAll('disCd').map(Number)
            expect(
                bui,
                'FE phải gửi ĐỦ 32 ô 部位 (padBui) — BE validate độ dài mảng',
            ).toHaveLength(BUI_COLUMN_COUNT)

            const buiIdx = DIS_CD_TO_BUI_IDX[disCd[0] ?? 0]
            const cols = bui.map((v, k) => (v !== 0 ? k + 1 : 0)).filter((c) => c > 0)
            if (buiIdx === undefined || cols.length === 0) {
                tried.push(
                    `#${i + 1}: disCd=[${disCd.join(',')}] (${
                        buiIdx === undefined ? 'không ánh xạ được sang 種別' : 'ánh xạ OK'
                    }), số răng đã chọn = ${cols.length}`,
                )
                continue
            }

            linkBuiIdx = buiIdx
            linkCols = cols
            break
        }

        if (linkBuiIdx === null) {
            console.log(
                `SKIP nhóm B — không dòng 病検 nào trong ${Math.min(total, BYOU_SCAN_LIMIT)} dòng ` +
                    `đầu cho ra (病名 ánh xạ được + có răng): ${tried.join(' | ')}`,
            )
        }
        skipWithReason(linkBuiIdx === null, 'không dựng được 部位病名 dùng được cho nhóm B')

        // Chốt giá trị gốc của ĐÚNG các ô sắp bị sửa để afterAll trả lại.
        linkRowBefore = await readTrtStateRow(Number(PAT_NO), linkBuiIdx!)
        linkCellsBefore = linkCols.map((c) => ({ posIdx: c, value: linkRowBefore[c - 1]! }))
        console.log(
            `nhóm B: 種別 ${linkBuiIdx} / 部位 [${linkCols.join(',')}] ` +
                `(giá trị gốc [${linkCellsBefore.map((c) => c.value).join(',')}])`,
        )
        await step()
    })

    test('TC-STEP-LINK-1 — gõ mã bước của ガイド A → Shift+F4 CHỈ còn ガイド A', async () => {
        requireLinkTarget()
        // ResolveCurrentTreatmentCodeAsync lấy ô KHÁC 0 CUỐI CÙNG trong các răng
        // đã chọn (last-wins) ⇒ ghi cùng một giá trị cho MỌI răng của 部位病名行
        // thì ô nào thắng cũng ra đúng số đó.
        await setStepCells(linkBuiIdx!, linkCols, STEP_FROM_A)
        await shiftF4()

        await expect(
            guideRowByName(SEED_NM_A),
            `pac_step_01 của ${SEED_GUID_A} = ${STEP_FROM_A} mà Shift+F4 không hiện nó — ` +
                'bộ lọc pac_step_xx = intTrtS[0] (modGuid1.cs:109-126) không chạy',
        ).toHaveCount(1)
        await expect(
            guideRowByName(SEED_NM_B),
            `ガイド B (pac_step_01 = ${STEP_FROM_B}) KHÔNG được lọt vào — lọt nghĩa là ` +
                'bộ lọc STEP bị bỏ qua hoặc fallback nổ sai lúc',
        ).toHaveCount(0)
        await step()
    })

    test('TC-STEP-LINK-2 — đổi sang mã bước của ガイド B → danh sách đổi theo', async () => {
        requireLinkTarget()
        // Cùng bối cảnh, chỉ đổi CON SỐ trong ô ⇒ danh sách phải lật hẳn sang
        // ガイド kia. Đây là bằng chứng trực tiếp 「ô trong Ｓｔｅｐ編集 lái danh
        // sách Shift+F4」, không phải trùng hợp.
        await setStepCells(linkBuiIdx!, linkCols, STEP_FROM_B)
        await shiftF4()

        await expect(guideRowByName(SEED_NM_B), 'đổi mã bước mà list không đổi theo').toHaveCount(1)
        await expect(
            guideRowByName(SEED_NM_A),
            'ガイド của mã bước CŨ vẫn còn — list đang đọc cache thay vì nạp lại sau khi lưu',
        ).toHaveCount(0)
        await step()
    })

    test('TC-STEP-LINK-3 — ô = 0 → KHÔNG lọc, cả hai ガイド cùng hiện', async () => {
        requireLinkTarget()
        // BuildStepPredicate: Step + intTrtS = 0 → `TRUE`, chỉ còn ràng buộc dải
        // 1000-1999 (GuidQueries.cs:266-269). Bệnh nhân chưa có tiến trình nào
        // thì phải thấy TOÀN BỘ ガイド STEP chứ không phải màn hình trắng.
        await setStepCells(linkBuiIdx!, linkCols, 0)
        await shiftF4()

        await expect(guideRowByName(SEED_NM_A), 'ô = 0 mà vẫn lọc mất ガイド A').toHaveCount(1)
        await expect(guideRowByName(SEED_NM_B), 'ô = 0 mà vẫn lọc mất ガイド B').toHaveCount(1)
        await step()
    })

    test('TC-STEP-LINK-4 — mã không khớp bước nào → fallback trả lại cả dải, KHÔNG rỗng', async () => {
        requireLinkTarget()
        // GuidQueries.cs:139-160 (port modGuid1.cs:134-138): lượt 1 ra 0 dòng thì
        // BỎ bộ lọc STEP và query lại. Khác TC-STEP-LINK-3 ở chỗ nó đi qua nhánh
        // KHÁC của BE — gỡ fallback đi thì testcase này rỗng + E00024, còn
        // TC-STEP-LINK-3 vẫn xanh. Nên hai cái không trùng nhau.
        await setStepCells(linkBuiIdx!, linkCols, STEP_FROM_NONE)
        await shiftF4()

        expect(
            await noGuidAlert.count(),
            `mã ${STEP_FROM_NONE} không khớp pac_step nào mà list rỗng (E00024) — ` +
                'nhánh fallback của ListStepAsync đã mất',
        ).toBe(0)
        await expect(guideRowByName(SEED_NM_A), 'fallback phải trả lại cả dải STEP').toHaveCount(1)
        await expect(guideRowByName(SEED_NM_B), 'fallback phải trả lại cả dải STEP').toHaveCount(1)
        await step()
    })

    test('TC-STEP-LINK-5 — 「前回」 lọc theo guid_cd chứ KHÔNG theo pac_step', async () => {
        requireLinkTarget()
        // modGuid1.cs:105-108 `GUID_CD = intTrtS[0]` — nhánh Prv so giá trị ô với
        // CHÍNH guid_cd, khác hẳn nhánh Step (so với pac_step_xx). Gõ guid_cd của
        // ガイド A vào ô rồi bấm 前回 thì phải ra đúng nó.
        await setStepCells(linkBuiIdx!, linkCols, SEED_GUID_A)
        await shiftF4()
        await prvBtn.click()
        await dismissNoGuidAlert()

        await expect(
            guideRowByName(SEED_NM_A),
            `前回 với ô = ${SEED_GUID_A} phải ra đúng ガイド đó (guid_cd = intTrtS[0])`,
        ).toHaveCount(1)
        await expect(
            guideRowByName(SEED_NM_B),
            '前回 lọc guid_cd nên ガイド khác KHÔNG được lọt vào',
        ).toHaveCount(0)
        await step()

        // Đổi sang guid_cd của ガイド B: danh sách phải lật theo.
        await setStepCells(linkBuiIdx!, linkCols, SEED_GUID_B)
        await shiftF4()
        await prvBtn.click()
        await dismissNoGuidAlert()

        await expect(guideRowByName(SEED_NM_B), '前回 không đổi theo giá trị ô').toHaveCount(1)
        await expect(guideRowByName(SEED_NM_A), '前回 giữ lại ガイド của giá trị cũ').toHaveCount(0)
        await step()
    })

    test('TC-STEP-LINK-6 — 「リセット」 ghi 0 vào đúng các ô 部位 của 部位病名行 đó', async () => {
        requireLinkTarget()
        // cmdGuidReset_Click (frm203002.cs:6638-6650) → StepReset → setResetData
        // (:6686-6729): CHỈ các ô có `bui[i] != 0` của 部位病名行 đang focus bị về
        // 0, các 部位 khác và các 種別 khác không đụng tới. Đây là chiều NGƯỢC của
        // mắt xích — ghi trt_state từ tab ガイド, đọc lại bằng Ｓｔｅｐ編集.
        await setStepCells(linkBuiIdx!, linkCols, STEP_FROM_A)
        await shiftF4()

        await resetBtn.click()
        const confirm = page.getByText('該当部位の治療進行状態をリセットします')
        skipWithReason(
            !(await appeared(confirm, 8_000)),
            'リセット không bung Q00100 — 部位病名行 đang focus không có 病名 (handleGuidReset: disCd0 <= 0)',
        )
        // `confirmDialog` kind='confirm' để nhãn MẶC ĐỊNH là 'Yes'/'No'
        // (confirm-dialog-view.tsx:18-19) — KHÔNG phải 'はい'/'いいえ' (nhãn đó là
        // của kind='confirm3'). Nhận cả hai để khỏi vỡ nếu sau này đổi nhãn.
        await page
            .getByRole('button', { name: /^(Yes|はい|OK)$/ })
            .first()
            .click()
        await expect(confirm).toBeHidden({ timeout: 10_000 })

        // Đọc lại bằng DB: đây là chỗ duy nhất phân biệt được 「đã ghi 0」 với
        // 「chỉ làm mới danh sách trên màn」. `poll` vì POST /reset là async so với
        // cú click.
        const expected = Array.from({ length: BUI_COLUMN_COUNT }, (_, i) =>
            linkCols.includes(i + 1) ? 0 : linkRowBefore[i]!,
        )
        await expect
            .poll(async () => (await readTrtStateRow(Number(PAT_NO), linkBuiIdx!)).join(','), {
                timeout: 20_000,
                message:
                    'リセット phải ghi 0 vào ĐÚNG các 部位 của 部位病名行 đang focus ' +
                    `(cột [${linkCols.join(',')}]) và KHÔNG đụng 部位 nào khác của 種別 ${linkBuiIdx}`,
            })
            .toBe(expected.join(','))

        await step()
    })

    test('TC-STEP-LINK-7 — リセット xong mở lại Ｓｔｅｐ編集 phải thấy 0 (ĐANG ĐỎ — lỗi thật)', async () => {
        requireLinkTarget()
        // ═══ LỖI THẬT CỦA APP, testcase này ĐỎ cho tới khi web được sửa ═══
        //
        // Đo được 2026-08-14: TC-STEP-LINK-6 xác nhận DB đã về 0, nhưng mở lại
        // Ｓｔｅｐ編集 ngay sau đó vẫn hiện số CŨ (29001).
        //
        // Nguyên nhân — hai đường ghi trt_state invalidate KHÔNG đối xứng:
        //   queries/trt-state-mutations.ts  useSaveTrtStateGrid (F9 của dialog)
        //       invalidate `trtStateKeys.grid(patNo)` + `guidsKeys.all`   ✅
        //   queries/guids-mutations.ts      useResetGuideTrts  (nút リセット)
        //       invalidate `guidsKeys.all` THÔI                            ❌
        // Mà `trtStateGridQueryOptions` để `staleTime: Infinity` nên cache
        // không bao giờ tự hết hạn ⇒ dialog đọc lại dữ liệu trước khi リセット.
        //
        // Hậu quả KHÔNG chỉ là hiển thị sai: F9 của Ｓｔｅｐ編集 ghi CẢ lưới
        // 15×32 (frm203050 updateProc), nên người dùng リセット rồi mở dialog
        // bấm F9 là GHI ĐÈ số cũ trở lại — cú リセット bị huỷ âm thầm.
        //
        // WinForm không có lỗi này vì frm203050 nạp DB ở mỗi lần Shown
        // (initProc → TrtState.getTrtState), không có cache nào cả.
        //
        // Sửa: thêm `qc.invalidateQueries({ queryKey: trtStateKeys.all })` vào
        // `useResetGuideTrts.onSuccess` (guids-mutations.ts:35).
        await openFromOptions(MENU_STEP, stepDialog)
        await pickKind(linkBuiIdx!)
        for (const col of linkCols) {
            await expect(
                stepCell(linkBuiIdx!, col),
                `リセット xong mà Ｓｔｅｐ編集 vẫn hiện số cũ ở 部位 ${col} — ` +
                    'useResetGuideTrts không invalidate trtStateKeys',
            ).toHaveValue('0')
        }
        await closeWithF10(stepDialog)
        await step()
    })
})
