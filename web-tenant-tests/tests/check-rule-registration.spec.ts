import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * チェックルール登録 — hub frm601001 và 6 cặp 一覧 / 登録 của module CHKRULE.
 * Vào bằng 診療入力 → F11 → 「9 オプション」 → 「8 チェックルール登録」.
 *
 * File này KHÁC `treatment-f11-menu-ported-actions.spec.ts`: file kia chỉ lo
 * đường dẫn từ menu tới hub (TC-MENU-3). Từ hub trở đi là việc của file này.
 * Đừng nhét testcase điều hướng menu vào đây.
 *
 * ─── Nguồn WinForm (src/OCHACOM/CHKRULE) ─────────────────────────────────────
 *  - frm601001            hub, 6 nút dọc, CHỈ F10 戻る sáng (mọi F-key khác
 *                         OCHA_OFF, frm601001.cs:36-49). Mở con bằng `showForm`
 *                         (điều hướng) chứ không phải `showDialog`.
 *  - frm601002/003        歯数・ブロックチェック   → inp_chk_4
 *  - frm601004/005        期間・回数制限           → inp_chk_5
 *  - frm601006/007        組み合わせ算定不可       → inp_chk_8
 *  - frm601008/009        必要処置・摘要           → inp_chk_9   (có サブコード)
 *  - frm601010/011        算定可能処置             → inp_chk_12  (có サブコード)
 *  - frm601012/013        処置グループ             → mst_trt_grp
 *  - F-key 一覧: F1 出力 / F9 選択 / F10 戻る. RIÊNG hai màn có サブコード thêm
 *    F8 追加 (vì inp_chk_9/12 khoá theo (trt_cd, trt_sb, trt_seq) nên một 処置
 *    mang được nhiều luật); 処置グループ dùng F8 新規 (bấm được cả khi lưới rỗng,
 *    `defData()` không tham số → grpCd -1).
 *  - F-key 登録: F8 削除 / F9 登録 / F10 戻る.
 *  - BaseDialog.cs:314-324 — `Keys.End` VÀ `Keys.Escape` đều chạy `btnF9_Click`
 *    khi F9 đang enabled. Không dialog nào trong CHKRULE override
 *    `formBase_KeyDown` ⇒ **ESC = 登録, KHÔNG phải huỷ**. Đây là cái bẫy lớn nhất
 *    của cả module (trùng ý GUIDELINE Rule 10.4).
 *
 * ─── Web port (apps/web-tenant/src/features/treatments/components) ───────────
 *  - check-rule-menu-screen.tsx
 *      · Hub là DraggableDialog thật (700x500, bám ClientSize 694x473 của
 *        frm601001.Designer.cs:175) — frm601001 vốn là BaseDialog. Trước đây
 *        port dựng nó thành takeover toàn màn; đã đổi. `closeOnEscape={false}`
 *        vì BaseDialog.cs:320 chỉ chuyển ESC sang btnF9_Click khi btnF9.Enabled,
 *        mà F9 của form này là OCHA_OFF ⇒ WinForm ESC không làm gì.
 *      · Init focus: frm601001 KHÔNG gọi `.Focus()`, con trỏ rơi vào TabIndex
 *        nhỏ nhất là btnInpChk4 (frm601001.Designer.cs:78) ⇒ port đặt autoFocus
 *        lên nút đầu.
 *      · Màn con vẫn là takeover toàn màn: frm601001 mở chúng bằng `showForm`
 *        (điều hướng) nên KHÔNG được xếp chồng dialog lên hub.
 *      · Hub và màn con mount LOẠI TRỪ nhau (`if (sub === …) return <…/>`), nên
 *        khi 一覧 đang mở thì tiêu đề hub KHÔNG còn trong DOM.
 *      · `MENU_ENTRIES` — 6 nhãn, đúng thứ tự Designer (y = 48…283).
 *  - chk-rule-slot-list-screen.tsx  → dùng chung cho 3 màn 20-slot; `spec.table`
 *    null = inp_chk_8 (không サブコード, không F8), 9 / 12 = hai màn còn lại.
 *  - chk-rule-slot-register-dialog.tsx → dùng chung cho 3 dialog 20-slot.
 *    `closeOnEscape={false}` + `End: { ...registerKey, hidden: true }`.
 *  - period-count-limit-* / tooth-block-check-* / treatment-group-* → 3 cặp còn lại.
 *  - Tiêu đề đều GIÃN CHỮ bằng dấu cách THẬT trong source ⇒ match nguyên văn:
 *      「チ ェ ッ ク ル ー ル 登 録」「期 間 ・ 回 数 制 限 一 覧」…
 *  - locales/ja.ts: Q00047 「CSV出力してよろしいですか？」, E00003
 *    「該当するデータがありません。」, Q00002 「更新してよろしいですか？」.
 *
 * ─── FACT cho Rule 23 (4 testcase bắt buộc của dialog) ───────────────────────
 *  23.1 Init focus — `grep "\.Focus()"` trên 6 dialog:
 *      · frm601013.initProc:240,247 — Insert → `txtGrpCd.Focus()`,
 *        Update → `txtTrtCd01.Focus()` (ô mã thành viên ĐẦU TIÊN).
 *      · frm601009/011.dspData:323 — Insert → `txtTrtSeq.Focus()`.
 *        Update KHÔNG set focus (chỉ khoá txtTrtSeq).
 *      · frm601003 / 601005 / 601007 — KHÔNG gọi `.Focus()` lúc init, NHƯNG
 *        WinForm vẫn đặt con trỏ: nó rơi vào control có TabIndex nhỏ nhất mà
 *        còn Enabled. Suy ra ô cụ thể, KHÔNG phải "không assert được":
 *          · frm601003 → `txtSMin` (TabIndex 2) = 支台歯有 下限. 処置コード /
 *            枝番 / 処置名 đều `Enabled = false` trong Designer (:305,:323,:344).
 *          · frm601005 → `txtDayLimit` (TabIndex 3) = ô số đầu tiên. `cboUnit`
 *            tuy TabIndex 2 nhưng frm601005.cs:166 vô hiệu hoá ngay sau khi nạp.
 *          · frm601007 → `txtTrtCd01` (TabIndex 2) = 対象処置コード dòng 1.
 *      · frm601009/011 nhánh Update cũng vậy: `dspData:328` đặt
 *        `txtTrtSeq.Enabled = false` ⇒ con trỏ rơi xuống `txtTrtCd01`.
 *        (Bản ghi chú đầu tiên của spec này kết luận "đi theo TabIndex nên
 *        không assert ô cụ thể" — SAI, và đã để lọt 4 nhánh thiếu focus.)
 *  23.2 Cuộn dọc — `draggable-dialog.tsx:209-219`: thân dialog `flex-1 min-h-0
 *      overflow-auto` ĐÃ tự cuộn. Comment ở đó nói *"Callers should NOT add
 *      their own overflow-y-auto wrapper"*, nhưng mọi dialog dạng lưới của app
 *      (kể cả `required-disease-name-register-dialog.tsx:203` có từ trước) đều
 *      bọc thêm `flex h-full` + `min-h-0 flex-1 overflow-auto`. Đó KHÔNG phải hai
 *      thanh cuộn: `h-full` ghim con đúng bằng chiều cao thân, nên thân không bao
 *      giờ tràn — chỉ lớp trong cuộn, và header lưới đứng yên (giống WinForm).
 *      Vì vậy testcase dưới đây kiểm ĐÚNG yêu cầu của Rule 23.2 — "mở lên không
 *      được có thanh cuộn nào" — chứ không đi đếm số lớp cuộn.
 *  23.3 Thông báo — locales/ja.ts: Q00047 / Q00002 / E00003 (xem hằng bên dưới).
 *  23.4 Reset — mọi form CHKRULE là singleton
 *      `if (_instance == null || _instance.IsDisposed) _instance = new frmXXX()`
 *      ⇒ đóng là Dispose, mở lại là form MỚI. Thêm nữa `frm601009.dspData` còn
 *      reset tường minh cả 20 dòng về "0"/""/SelectedIndex 0 TRƯỚC khi nạp.
 *
 * ─── Lịch sử: TC-FOCUS-* từng đỏ ─────────────────────────────────────────────
 *  Lúc viết spec, KHÔNG dialog CHKRULE nào của port gọi focus khi mở —
 *  DraggableDialog kéo focus vào THÂN dialog (`bodyRef`, tabIndex=-1) nên con
 *  trỏ nằm ở một `<div>`, người nhập gõ ngay là mất chữ. Port đã bổ sung effect
 *  focus theo đúng 3 nhánh WinForm ở trên; ba testcase này là thứ giữ cho nó
 *  không rơi lại.
 *
 * ─── KHÔNG kiểm ở đây ────────────────────────────────────────────────────────
 *  - F9 登録 / F8 削除 THẬT: cả 6 dialog đều delete-then-insert vào master dùng
 *    chung toàn phòng khám (inp_chk_4/5/8/9/12, mst_trt_grp). Sai một lần là
 *    hỏng dữ liệu chuẩn của mọi spec khác ⇒ spec này KHÔNG bấm 登録/削除, chỉ
 *    kiểm tới bước hộp xác nhận Q00002 rồi HUỶ. Muốn kiểm ghi thật thì phải có
 *    seed + restore riêng như `db.ts` làm cho 転帰 / siga.
 *  - F1 出力 CSV: mở hộp lưu file của HĐH, Playwright không bấm được (cùng lý do
 *    `/v1/print` bị cấm trong spec in ấn). Chỉ kiểm nút CÓ MẶT và hộp xác nhận
 *    Q00047 bung ra, rồi huỷ.
 *
 * ─── BẪY ─────────────────────────────────────────────────────────────────────
 *  1. `SanteiConfirmDialog` 「〜を算定しますか？」 bung sau khi lưới 診療入力 nạp xong
 *     và đè lên mọi click ⇒ `addLocatorHandler` bấm No (Rule 14/14.1). Nó bung
 *     LẠI sau mỗi lần quay về 診療入力 nên `times` phải rộng tay.
 *  1b. AutoSantei còn bung tiếp picker 「カルテ記載選択」 (chọn カルテコメント cho
 *     歯科疾患管理料). Nó cũng `role="dialog"`, nổi ĐÈ lên và NUỐT phím F11 ⇒
 *     phải vét bằng `drainKarteSelectionPickers()`. Chúng xếp HÀNG ĐỢI
 *     (cmtAutoBatches) nên đóng một cái là chưa đủ — đây là thứ làm cả 26
 *     testcase đỏ ở hai lần chạy đầu.
 *  2. `addLocatorHandler` CHỈ chạy khi Playwright đang thực hiện một ACTION —
 *     `keyboard.press` thô thì không. `openHub()` vì thế vét hộp tường minh
 *     trước khi bấm F11 (Rule 14, và đã đo được ở spec F11 menu).
 *  3. Ba màn 20-slot có 160-180 cột nên lưới CUỘN NGANG. Đừng assert cột cuối
 *     "visible" — dùng `toHaveCount` trên header hoặc cuộn tới. Testcase ở đây
 *     chỉ đụng vài cột đầu.
 *  4. Lưới 一覧 nạp TOÀN BỘ 処置マスタ (~1700 dòng) rồi mới render ⇒ timeout chờ
 *     phải rộng. Mốc đáng tin là ô 該当件数 có số > 0, không phải dòng đầu tiên.
 *  5. `VirtualListTable` chỉ render dòng trong viewport ⇒ `getByRole('row')`
 *     KHÔNG đếm được tổng số. Dùng ô 該当件数.
 *  6. Hub và 一覧 loại trừ nhau trong DOM (xem trên) ⇒ sau khi bấm một nút, chờ
 *     tiêu đề hub BIẾN MẤT là mốc chắc hơn chờ tiêu đề 一覧 hiện ra.
 *  7. Dialog 登録 là DraggableDialog thật (portal), KHÁC takeover của 一覧. Cả
 *     hai đều `role="dialog"` ⇒ luôn `filter({ hasText })` theo tiêu đề, đừng
 *     `getByRole('dialog')` trơ.
 *  8. ESC trong dialog CHKRULE là 登録 (xem FACT ở trên) ⇒ TUYỆT ĐỐI không dùng
 *     Escape để đóng. Luôn bấm 「F10 戻る」.
 * 8b. `alertDialog` / `confirmDialog` là MODAL: khi nó mở, toàn bộ nền bị ẩn
 *     khỏi accessibility tree ⇒ `getByRole('dialog')` KHÔNG thấy dialog đang
 *     đứng sau. Muốn kiểm dialog nền còn sống thì phải đóng hộp confirm trước.
 *     Nút của hộp là **Yes / No**, không phải はい/いいえ.
 * 8c. `getByLabel` khớp CHUỖI CON: 「処置コード 1」 trúng luôn 10..19 (11 phần tử).
 *     Ô nào đánh số theo slot thì bắt buộc `{ exact: true }`.
 *  9. Nhãn ô 検索 TRÙNG TÊN với header lưới (処置コード / 処置名 / グループコード) ⇒
 *     `getByText(exact)` dính strict mode violation (Rule 10.3). Dùng
 *     `searchLabel()` (lọc `<span>`) cho thanh 検索, và `getByTestId('header-*')`
 *     cho header lưới.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   npx playwright test tests/check-rule-registration.spec.ts --retries=0
 *
 * `--retries=0` vì retry chạy lại CẢ khối serial ⇒ thêm một lần login, tốn quota
 * (Rule 10.1). Chạy CẢ FILE, không `-g` một testcase lẻ (Rule 19): khối serial
 * dùng chung một page và thứ tự CÓ Ý NGHĨA (mỗi TC giả định đang đứng ở hub).
 *
 * Kỳ vọng: tất cả XANH. Không testcase nào cần TEST_DB.
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

// ── Nhãn menu, nguyên văn F11_MENU_ITEMS ─────────────────────────────────────
const MENU_OPTIONS = '9 オプション'
const MENU_CHK_RULE = '8 チェックルール登録'

/** Tiêu đề hub — giãn chữ bằng dấu cách THẬT (check-rule-menu-screen.tsx). */
const HUB_TITLE = 'チ ェ ッ ク ル ー ル 登 録'

/**
 * 6 nút của hub — nhãn + tiêu đề màn 一覧 nó mở + bộ F-key của màn đó.
 *
 * `MENU_ENTRIES` trong source theo đúng thứ tự Designer (y = 48, 95, 142, 189,
 * 236, 283 / TabIndex 1..6), nên mảng này cũng phải giữ nguyên thứ tự — TC-HUB-1
 * assert cả thứ tự.
 */
const PAIRS = [
    {
        button: '歯数・ブロックチェック登録',
        listTitle: '歯 数 ・ ブ ロ ッ ク チ ェ ッ ク 一 覧',
        dialogTitle: '歯 数 ・ ブ ロ ッ ク チ ェ ッ ク 登 録',
        fkeys: ['F1 出力', 'F9 選択', 'F10 戻る'],
        /** 処置コード / 処置名 — trừ 処置グループ dùng グループコード / 名称. */
        searchByTreatment: true,
    },
    {
        button: '期間・回数制限登録',
        listTitle: '期 間 ・ 回 数 制 限 一 覧',
        dialogTitle: '期 間 ・ 回 数 制 限 登 録',
        fkeys: ['F1 出力', 'F9 選択', 'F10 戻る'],
        searchByTreatment: true,
    },
    {
        button: '組み合わせ算定不可',
        listTitle: '組 み 合 わ せ 算 定 不 可 一 覧',
        dialogTitle: '組 み 合 わ せ 算 定 不 可',
        // inp_chk_8 khoá (trt_cd, trt_sb) nên KHÔNG có F8 追加.
        fkeys: ['F1 出力', 'F9 選択', 'F10 戻る'],
        searchByTreatment: true,
    },
    {
        button: '必要処置・摘要登録',
        listTitle: '必 要 処 置 ・ 摘 要 一 覧',
        dialogTitle: '必 要 ・ 算 定 可 能 処 置 登 録',
        // inp_chk_9 khoá thêm trt_seq ⇒ một 処置 mang nhiều luật ⇒ cần 追加.
        fkeys: ['F1 出力', 'F8 追加', 'F9 選択', 'F10 戻る'],
        searchByTreatment: true,
    },
    {
        button: '算定可能処置登録',
        listTitle: '算 定 可 能 処 置 一 覧',
        dialogTitle: '必 要 ・ 算 定 可 能 処 置 登 録',
        fkeys: ['F1 出力', 'F8 追加', 'F9 選択', 'F10 戻る'],
        searchByTreatment: true,
    },
    {
        button: '処置グループ登録',
        listTitle: '処 置 グ ル ー プ 一 覧',
        dialogTitle: '処 置 グ ル ー プ 登 録',
        // 新規 chứ không phải 追加 — nhóm mới không cần dòng nào dưới con trỏ.
        fkeys: ['F1 出力', 'F8 新規', 'F9 選択', 'F10 戻る'],
        searchByTreatment: false,
    },
] as const

/** Nhãn 6 nút, tách riêng cho TC-HUB-1. */
const HUB_BUTTONS = PAIRS.map((p) => p.button)

/** Q00047 — hộp xác nhận trước khi F1 出力 mở hộp lưu file (locales/ja.ts). */
const Q00047_CSV = 'CSV出力してよろしいですか？'

/** Q00002 — hộp xác nhận của F9 登録. */
const Q00002_SAVE = '更新してよろしいですか？'

/** E00003 — lưới rỗng mà bấm F1 出力 (locales/ja.ts). */
const E00003_NO_DATA = '該当するデータがありません。'

/**
 * Chuỗi 処置名 chắc chắn không khớp dòng nào — dùng để ép 検索 về 0 dòng.
 *
 * ĐÃ ĐO ĐƯỢC (lần chạy 6): mã '999' KHÔNG phải mã không tồn tại — master có
 * thật dòng `999-0 未装着`. Lọc theo mã vẫn "xanh" được là vì `該当件数` đọc
 * `rows`, mà `rows` rỗng trong lúc query đổi khoá đang chạy: assert `0 件` bắt
 * trúng nhịp loading rồi 1 dòng mới về sau đó. Lọc theo một cái tên vô nghĩa
 * mới cho trạng thái rỗng THẬT.
 */
const NO_MATCH_TRT_NM = 'ZZZZZZ'

/** Giá trị nháp của TC-RESET-* — đủ lạ để không trùng dữ liệu thật. */
const DRAFT_VALUE = '4321'

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('チェックルール登録 — hub frm601001 và 6 cặp 一覧/登録 (CHKRULE)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Menu gốc F11. Lọc theo '1 メニュー' để không dính submenu. */
    let rowMenu: Locator

    /** Hub. Lọc theo tiêu đề vì 一覧 cũng là role="dialog". */
    let hub: Locator

    /** Màn 一覧 / dialog 登録 theo tiêu đề — xem BẪY 7. */
    const byTitle = (title: string) => page.getByRole('dialog').filter({ hasText: title })

    /**
     * Dialog 登録 của một cặp.
     *
     * ĐÃ ĐO ĐƯỢC: 「組 み 合 わ せ 算 定 不 可」 là TIỀN TỐ của tiêu đề 一覧
     * 「組 み 合 わ せ 算 定 不 可 一 覧」, mà 一覧 (takeover) vẫn nằm trong DOM
     * khi dialog mở đè lên ⇒ `byTitle` trơ khớp 2 phần tử và vỡ strict mode.
     * Loại 一覧 ra bằng `hasNotText`.
     */
    const byDialog = (pair: (typeof PAIRS)[number]) =>
        byTitle(pair.dialogTitle).filter({ hasNotText: pair.listTitle })

    /** Về lại 診療入力 và chờ lưới dựng xong. */
    async function backToEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    }

    /**
     * `true` nếu locator HIỆN RA trong `timeout`.
     *
     * KHÔNG dùng `locator.isVisible({ timeout })`: nó soi DOM ngay lúc gọi và trả
     * về ngay, `timeout` chỉ bó thao tác nội bộ chứ KHÔNG chờ phần tử xuất hiện.
     */
    async function appeared(locator: Locator, timeout: number): Promise<boolean> {
        return locator
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    /** Bấm No cho MỌI hộp 「〜を算定しますか？」 đang mở (xem BẪY 1, 2). */
    async function drainSanteiDialogs() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(santei, 2_000))) return
            await page
                .getByRole('button', { name: /^(No|いいえ)$/ })
                .first()
                .click()
                .catch(() => {})
        }
    }

    /**
     * Vét HẾT picker 「カルテ記載選択」 đang xếp hàng.
     *
     * ĐÃ ĐO ĐƯỢC (lần chạy 1, 26/26 đỏ): AutoSantei tự tính 歯科疾患管理料 cho
     * ngày đang mở rồi bung picker chọn カルテコメント. Nó `role="dialog"`, nổi ĐÈ
     * toàn màn và NUỐT phím F11 — menu 選択 không bao giờ hiện, còn thông báo lỗi
     * thì trỏ vào chỗ chẳng liên quan.
     *
     * ĐÃ ĐO ĐƯỢC (lần chạy 2): đóng MỘT cái là không đủ. `treatment-entry-detail
     * .tsx:936-943` giữ `cmtAutoBatches` như một HÀNG ĐỢI — WinForm chạy
     * `modMain.Chk_CmtAuto` cho từng 処置, nên đóng batch N thì batch N+1 mở ngay.
     * Locator vẫn "visible", chỉ là một dialog khác. Phải vét bằng vòng lặp,
     * đúng kiểu `drainSanteiDialogs`.
     *
     * `addLocatorHandler` không cứu được: nó chỉ chạy khi Playwright đang thực
     * hiện một ACTION, mà `keyboard.press('F11')` thì không phải (BẪY 2).
     *
     * F10 戻る = huỷ, KHÔNG chọn comment nào ⇒ không đụng vào lưới 処置.
     * Xem thêm `auto-picker-precondition.ts` về điều kiện picker tự bật.
     */
    async function drainKarteSelectionPickers() {
        const picker = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 20; i++) {
            if (!(await appeared(picker, 2_000))) return
            await picker
                .getByRole('button', { name: 'F10 戻る' })
                .click()
                .catch(() => {})
        }
    }

    /**
     * Từ 診療入力 mở hub: F11 → 9 オプション → 8 チェックルール登録.
     *
     * Vét hộp 算定 TRƯỚC rồi mới bấm F11 — bấm lúc hộp còn mở thì phím bị hộp
     * nuốt và menu không bao giờ hiện (đã đo ở spec F11 menu).
     */
    async function openHub() {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await drainSanteiDialogs()
            await drainKarteSelectionPickers()
            await page.keyboard.press('F11')
            if (await rowMenu.isVisible({ timeout: 10_000 }).catch(() => false)) break
        }
        await expect(rowMenu, 'bấm F11 3 lần mà menu 選択 vẫn không mở').toBeVisible({
            timeout: 10_000,
        })

        // Submenu mở bằng HOVER — click là TOGGLE, tuyệt đối không dblclick.
        await rowMenu.getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub, 'submenu 9 オプション không mở ra').toBeVisible({ timeout: 10_000 })

        await sub.getByRole('button', { name: MENU_CHK_RULE }).click()
        await expect(rowMenu).toBeHidden({ timeout: 10_000 })
        await expect(hub, 'menu 9-8 không mở được hub frm601001').toBeVisible({ timeout: 30_000 })
    }

    /**
     * Từ hub mở một màn 一覧.
     *
     * Chờ tiêu đề HUB biến mất chứ không chờ tiêu đề 一覧 hiện ra: hub và màn con
     * mount loại trừ nhau, nên đó là mốc chắc hơn (BẪY 6).
     */
    async function openList(pair: (typeof PAIRS)[number]): Promise<Locator> {
        await hub.getByRole('button', { name: pair.button, exact: true }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })

        const list = byTitle(pair.listTitle)
        await expect(list, `nút 「${pair.button}」 không mở được 一覧`).toBeVisible({
            timeout: 30_000,
        })
        return list
    }

    /**
     * Nhãn của một ô TÌM KIẾM trên thanh 検索.
     *
     * ĐÃ ĐO ĐƯỢC (lần chạy 3): `getByText('処置コード', { exact: true })` dính
     * strict mode violation vì trúng CẢ header lưới — cột đầu cũng tên 処置コード
     * (`<div role="button" data-testid="header-dspCd">`). Đúng bẫy Rule 10.3.
     * Nhãn thanh 検索 là `<span>`, header là `<div>` ⇒ lọc theo thẻ là đủ tách.
     */
    const searchLabel = (list: Locator, text: string) =>
        list.locator('span').filter({ hasText: new RegExp(`^${text}$`) })

    /**
     * Bấm **No** trên hộp `confirmDialog` đang mở.
     *
     * ĐÃ ĐO ĐƯỢC (lần chạy 4, a11y snapshot): hộp là `alertdialog "お茶コン"` với
     * đúng hai nút **Yes / No** — KHÔNG phải はい/いいえ hay キャンセル. Trùng với
     * ghi chú Rule 6 của guideline ("nút confirm là Yes/No").
     */
    async function cancelConfirm() {
        await page.getByRole('button', { name: 'No', exact: true }).first().click()
    }

    /** Chờ lưới 一覧 nạp xong — mốc là 該当件数 có số > 0 (BẪY 4, 5). */
    async function waitRowsLoaded(list: Locator) {
        await expect(list.getByText(/該当件数:\s*[1-9]\d*\s*件/), '一覧 nạp 0 dòng').toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
    }

    /**
     * Ép 一覧 về trạng thái RỖNG THẬT rồi mới trả về.
     *
     * Chỉ chờ `該当件数: 0 件` là KHÔNG đủ: khi 検索 đổi khoá query, `data` là
     * undefined nên bộ đếm hiện 0 trong lúc lưới còn đang tải. `empty-state`
     * chỉ được VirtualListTable dựng khi đã tải xong mà đếm ra 0
     * (`isCountLoading` = false), nên đó mới là mốc chờ đúng.
     */
    async function searchNoMatch(list: Locator) {
        await list.getByRole('textbox').nth(1).fill(NO_MATCH_TRT_NM)
        await list.getByRole('button', { name: '検索', exact: true }).click()
        await expect(
            list.getByTestId('empty-state'),
            '検索 bằng tên vô nghĩa mà lưới vẫn còn dòng',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await expect(list.getByText(/該当件数:\s*0\s*件/)).toBeVisible()
    }

    /**
     * Trả về class của những vùng ĐANG THỰC SỰ tràn dọc bên trong `root`.
     *
     * Không quan tâm có bao nhiêu lớp `overflow-auto` lồng nhau — chỉ quan tâm
     * người dùng có nhìn thấy thanh cuộn hay không (Rule 23.2).
     */
    async function overflowingRegions(root: Locator): Promise<string[]> {
        return root.evaluate((el) => {
            const hits: string[] = []
            // `Array.from` chứ không `for…of` thẳng: tsconfig của repo không bật
            // downlevelIteration nên NodeListOf chưa có Symbol.iterator.
            for (const node of Array.from(el.querySelectorAll<HTMLElement>('*'))) {
                const oy = getComputedStyle(node).overflowY
                if (oy !== 'auto' && oy !== 'scroll') continue
                // +1: dung sai làm tròn sub-pixel.
                if (node.scrollHeight > node.clientHeight + 1) hits.push(node.className)
            }
            return hits
        })
    }

    /** 一覧 → hub. */
    async function backToHub(list: Locator) {
        await list.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(list).toBeHidden({ timeout: 10_000 })
        await expect(hub, 'bấm F10 ở 一覧 phải quay về hub').toBeVisible({ timeout: 10_000 })
    }

    test.beforeAll(async ({ browser }) => {
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
        hub = page.getByRole('dialog').filter({ hasText: HUB_TITLE })

        await backToEntry()
        await openHub()
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Hub frm601001 ────────────────────────────────────────────────────────

    test('TC-HUB-1 — hub có đúng 6 nút, đúng thứ tự Designer', async () => {
        for (const label of HUB_BUTTONS) {
            await expect(
                hub.getByRole('button', { name: label, exact: true }),
                `thiếu nút 「${label}」`,
            ).toBeVisible()
        }

        // Đọc theo thứ tự DOM để bắt được cả trường hợp đủ nút nhưng sai thứ tự —
        // MENU_ENTRIES bám đúng toạ độ y của Designer nên thứ tự là một FACT.
        const labels = await hub
            .locator('button')
            .filter({ hasText: /登録|不可/ })
            .allInnerTexts()
        expect(labels.map((t) => t.trim())).toEqual([...HUB_BUTTONS])

        await step()
    })

    test('TC-HUB-2 — hub CHỈ sáng F10 戻る, không có F-key nào khác', async () => {
        await expect(hub.getByRole('button', { name: 'F10 戻る' })).toBeVisible()

        // frm601001.cs:36-49 — 11 phím còn lại đều OCHA_OFF. Nếu port lỡ thêm
        // 出力/選択 vào hub thì đây là chỗ bắt được.
        for (const absent of ['F1 出力', 'F8 追加', 'F8 新規', 'F9 選択', 'F9 登録', 'F8 削除']) {
            await expect(
                hub.getByRole('button', { name: absent }),
                `hub không được có 「${absent}」`,
            ).toHaveCount(0)
        }
        await step()
    })

    test('TC-HUB-3 — không còn nút nào bung toast 開発中', async () => {
        // Trước khi port đủ 6 cặp, các nút chưa xong gọi notifyUnderDevelopment().
        // Cả 6 nút giờ đều có target ⇒ import đó đã bị gỡ khỏi component.
        for (const label of HUB_BUTTONS) {
            const list = await openList(PAIRS.find((p) => p.button === label)!)
            await expect(page.getByText('開発中'), `「${label}」 vẫn bung 開発中`).toHaveCount(0)
            await backToHub(list)
        }
        await step()
    })

    // ── 6 màn 一覧 ───────────────────────────────────────────────────────────

    for (const pair of PAIRS) {
        test(`TC-LIST-${pair.button} — 一覧 mở được, nạp dữ liệu, đúng bộ F-key`, async () => {
            const list = await openList(pair)
            await waitRowsLoaded(list)

            // Bộ F-key là điểm khác nhau THẬT giữa 6 màn (追加 / 新規 / không có),
            // và nó bám thẳng vào khoá của bảng — xem FACT ở đầu file.
            for (const key of pair.fkeys) {
                await expect(
                    list.getByRole('button', { name: key }),
                    `「${pair.listTitle}」 thiếu 「${key}」`,
                ).toBeVisible()
            }
            // Không được có phím của màn khác lẫn sang.
            for (const key of ['F1 出力', 'F8 追加', 'F8 新規', 'F9 選択', 'F10 戻る']) {
                if (pair.fkeys.includes(key as never)) continue
                await expect(
                    list.getByRole('button', { name: key }),
                    `「${pair.listTitle}」 không được có 「${key}」`,
                ).toHaveCount(0)
            }

            // Ô tìm kiếm: 5 màn theo 処置, riêng 処置グループ theo mã/tên nhóm.
            const searchLabels = pair.searchByTreatment
                ? ['処置コード', '処置名']
                : ['グループコード', '名称']
            for (const label of searchLabels) {
                await expect(
                    searchLabel(list, label),
                    `thiếu ô tìm kiếm 「${label}」`,
                ).toBeVisible()
            }

            await backToHub(list)
            await step()
        })
    }

    // ── 検索 ─────────────────────────────────────────────────────────────────

    test('TC-SEARCH-1 — 検索 chỉ chạy khi bấm nút, không lọc lúc đang gõ', async () => {
        const pair = PAIRS[1] // 期間・回数制限一覧 — bảng phẳng, nhẹ nhất
        const list = await openList(pair)
        await waitRowsLoaded(list)

        const before = await list.getByText(/該当件数:/).innerText()

        // Gõ mà CHƯA bấm 検索: getViewData chỉ chạy trong btnSearch_Click, nên số
        // dòng phải y nguyên. Đây là hành vi WinForm, không phải tối ưu của web.
        await list.getByRole('textbox').first().fill('100')
        await expect(list.getByText(/該当件数:/)).toHaveText(before)

        await list.getByRole('button', { name: '検索', exact: true }).click()
        await expect(list.getByText(/該当件数:/), '検索 không đổi số dòng').not.toHaveText(before, {
            timeout: GRID_LOAD_TIMEOUT,
        })

        await backToHub(list)
        await step()
    })

    // ── Dialog 登録 ──────────────────────────────────────────────────────────

    test('TC-REG-1 — F9 選択 mở dialog 登録 với đủ F8 削除 / F9 登録 / F10 戻る', async () => {
        const pair = PAIRS[1] // 期間・回数制限
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()

        const dialog = byDialog(pair)
        await expect(dialog, 'F9 選択 không mở được dialog 登録').toBeVisible({ timeout: 30_000 })
        for (const key of ['F8 削除', 'F9 登録', 'F10 戻る']) {
            await expect(dialog.getByRole('button', { name: key })).toBeVisible()
        }

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-REG-2 — ESC trong dialog 登録 là 登録 chứ KHÔNG phải huỷ', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // BaseDialog.cs:314-324 — Escape chạy btnF9_Click. Port giữ nguyên bằng
        // `closeOnEscape={false}` + phím giả `End`. Nếu ai đó "sửa" thành đóng
        // dialog thì testcase này đỏ, và đó chính là điều cần biết.
        await page.keyboard.press('Escape')

        const confirm = page.getByText(Q00002_SAVE)
        await expect(
            confirm,
            'ESC phải bung hộp xác nhận 登録 (Q00002), không được đóng dialog',
        ).toBeVisible({ timeout: 10_000 })

        // HUỶ — spec này không ghi vào master dùng chung (xem "KHÔNG kiểm ở đây").
        await cancelConfirm()
        await expect(confirm).toBeHidden({ timeout: 10_000 })

        // Kiểm dialog CÒN SỐNG sau khi huỷ — đây mới là bằng chứng ESC không phải
        // huỷ. KHÔNG kiểm được lúc hộp confirm còn mở: `alertDialog` là modal và
        // nó ẩn toàn bộ nền khỏi accessibility tree, nên `getByRole('dialog')`
        // không thấy gì (đã đo ở lần chạy 4 — snapshot chỉ còn alertdialog).
        await expect(dialog, 'ESC không được đóng dialog 登録').toBeVisible({ timeout: 10_000 })

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-REG-3 — 処置コード / 処置名 trên dialog là chỉ đọc', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601005: txtTrtCd / txtTrtSb / txtTrtNm đều Enabled = false, và cboUnit
        // được nạp rồi khoá lại. Port hiển thị chúng bằng <span>, nên số ô nhập
        // đúng bằng 9 ô giới hạn của LIMIT_ROWS (3 cặp + 3 đơn).
        const inputs = dialog.getByRole('textbox')
        await expect(inputs, 'dialog 期間・回数制限 phải có đúng 9 ô nhập').toHaveCount(9)

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    // ── F1 出力 ──────────────────────────────────────────────────────────────

    test('TC-CSV-1 — F1 出力 hỏi Q00047 trước khi mở hộp lưu file', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F1 出力' }).click()

        // Chỉ tới đây thôi: bấm OK sẽ mở hộp lưu file của HĐH, Playwright không
        // điều khiển được (cùng lý do spec in ấn không đụng /v1/print).
        const confirm = page.getByText(Q00047_CSV)
        await expect(confirm, 'F1 出力 phải hỏi Q00047 trước').toBeVisible({ timeout: 10_000 })

        await cancelConfirm()
        await expect(confirm).toBeHidden({ timeout: 10_000 })

        await backToHub(list)
        await step()
    })

    // ── 処置グループ ─────────────────────────────────────────────────────────

    test('TC-GRP-1 — F8 新規 mở dialog RỖNG, グループコード nhập được', async () => {
        const pair = PAIRS[5]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F8 新規' }).click()

        const dialog = byDialog(pair)
        await expect(dialog, 'F8 新規 không mở được dialog').toBeVisible({ timeout: 30_000 })

        // frm601013.initProc: chế độ Insert BỎ QUA dspData và để txtGrpCd nhập
        // được; chế độ Update thì khoá lại vì đó là khoá chính.
        const grpCd = dialog.getByLabel('グループコード')
        await expect(grpCd, 'F8 新規 phải cho nhập グループコード').toBeEnabled()
        await expect(grpCd).toHaveValue('')

        // 削除 vô nghĩa với nhóm chưa tồn tại.
        await expect(
            dialog.getByRole('button', { name: 'F8 削除' }),
            'F8 削除 phải bị khoá ở chế độ 新規',
        ).toBeDisabled()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-GRP-2 — F9 選択 khoá グループコード (khoá chính, chế độ Update)', async () => {
        const pair = PAIRS[5]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        await expect(
            dialog.getByLabel('グループコード'),
            'chế độ Update phải khoá グループコード',
        ).toBeDisabled()
        // Ngược lại với TC-GRP-1: nhóm có thật thì 削除 phải bấm được.
        await expect(dialog.getByRole('button', { name: 'F8 削除' })).toBeEnabled()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    // ── サブコード (inp_chk_9 / inp_chk_12) ──────────────────────────────────

    test('TC-SEQ-1 — F8 追加 mở dialog cho nhập サブコード, F8 削除 bị khoá', async () => {
        const pair = PAIRS[3] // 必要処置・摘要
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F8 追加' }).click()

        const dialog = byDialog(pair)
        await expect(dialog, 'F8 追加 không mở được dialog').toBeVisible({ timeout: 30_000 })

        // frm601009.dspData: Insert cho sửa txtTrtSeq và tắt F8; Update thì khoá
        // txtTrtSeq (nó là một phần khoá chính) và bật lại F8.
        await expect(
            dialog.getByLabel('サブコード'),
            'F8 追加 phải cho nhập サブコード',
        ).toBeEnabled()
        await expect(
            dialog.getByRole('button', { name: 'F8 削除' }),
            'F8 削除 phải bị khoá khi đang thêm サブコード mới',
        ).toBeDisabled()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-SEQ-2 — F9 選択 khoá サブコード và bật lại F8 削除', async () => {
        const pair = PAIRS[3]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        await expect(
            dialog.getByLabel('サブコード'),
            'chế độ Update phải khoá サブコード',
        ).toBeDisabled()
        await expect(dialog.getByRole('button', { name: 'F8 削除' })).toBeEnabled()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    // ── Rule 23.1 — init focus ───────────────────────────────────────────────

    test('TC-FOCUS-1 — 処置グループ F8 新規: con trỏ vào グループコード', async () => {
        const pair = PAIRS[5]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F8 新規' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601013.initProc:240 — nhánh Insert gọi txtGrpCd.Focus().
        await expect(
            dialog.getByLabel('グループコード'),
            'F8 新規 phải đặt con trỏ vào グループコード (frm601013.initProc:240)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-FOCUS-2 — 処置グループ F9 選択: con trỏ vào ô mã thành viên đầu tiên', async () => {
        const pair = PAIRS[5]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601013.initProc:247 — nhánh Update gọi txtTrtCd01.Focus(), KHÔNG phải
        // txtGrpCd (ô đó vừa bị khoá ngay dòng trên).
        await expect(
            dialog.getByLabel('処置コード 1', { exact: true }),
            'F9 選択 phải đặt con trỏ vào ô 処置コード dòng 1 (frm601013.initProc:247)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-FOCUS-3 — 必要処置 F8 追加: con trỏ vào サブコード', async () => {
        const pair = PAIRS[3]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F8 追加' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601009.dspData:323 — nhánh Insert gọi txtTrtSeq.Focus().
        await expect(
            dialog.getByLabel('サブコード'),
            'F8 追加 phải đặt con trỏ vào サブコード (frm601009.dspData:323)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    // ── Rule 23.2 — không có thanh cuộn dọc thừa ─────────────────────────────

    test('TC-FOCUS-4 — 歯数・ブロック F9 選択: con trỏ vào 支台歯有 下限', async () => {
        const pair = PAIRS[0]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601003 không gọi Focus(); TabIndex nhỏ nhất còn Enabled là txtSMin.
        await expect(
            dialog.getByLabel('支台歯有 下限', { exact: true }),
            'F9 選択 phải đặt con trỏ vào ô 支台歯有 下限 (txtSMin, TabIndex 2)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-FOCUS-5 — 期間・回数制限 F9 選択: con trỏ vào ô số đầu tiên', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // cboUnit là TabIndex 2 nhưng frm601005.cs:166 vô hiệu hoá nó ngay sau
        // khi nạp ⇒ con trỏ rơi xuống txtDayLimit (TabIndex 3).
        await expect(
            dialog.getByLabel('日数-回数 範囲', { exact: true }),
            'F9 選択 phải đặt con trỏ vào ô số đầu tiên (txtDayLimit, TabIndex 3)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-FOCUS-6 — 組み合わせ算定不可 F9 選択: con trỏ vào 対象処置コード 1', async () => {
        const pair = PAIRS[2]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // frm601007 không có サブコード nên txtTrtCd01 (TabIndex 2) là ô đầu tiên.
        // `exact` vì 「対象処置コード 1」 khớp chuỗi con với 10..19 (BẪY 8c).
        await expect(
            dialog.getByLabel('対象処置コード 1', { exact: true }),
            'F9 選択 phải đặt con trỏ vào 対象処置コード dòng 1 (txtTrtCd01)',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-FOCUS-7 — 必要処置 F9 選択: サブコード bị khoá nên con trỏ xuống 対象処置コード 1', async () => {
        const pair = PAIRS[3]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // Khác hẳn TC-FOCUS-3 (F8 追加 → サブコード): dspData:328 tắt txtTrtSeq ở
        // nhánh Update nên TabIndex nhỏ nhất còn Enabled là txtTrtCd01.
        await expect(
            dialog.getByLabel('対象処置コード 1', { exact: true }),
            'F9 選択 phải bỏ qua サブコード đã khoá và xuống 対象処置コード dòng 1',
        ).toBeFocused()

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-SCROLL-1 — dialog 登録 mở lên không được có thanh cuộn dọc', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        // Dialog này chỉ có 9 ô nhập trong 520px thì không được cuộn dòng nào;
        // còn thừa chỗ mà vẫn cuộn nghĩa là chiều cao dialog đặt hụt (Rule 23.2).
        const overflowing = await overflowingRegions(dialog)

        expect(
            overflowing,
            `dialog 期間・回数制限 chỉ có 9 ô nhập mà vẫn cuộn dọc — ` +
                `tăng height thay vì để thanh cuộn. Vùng đang cuộn: ` +
                `${JSON.stringify(overflowing)}`,
        ).toEqual([])

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    // ── Rule 23.3 — thông báo trùng WinForm ──────────────────────────────────

    test('TC-MSG-1 — F1 出力 trên lưới rỗng báo E00003, KHÔNG hỏi Q00047', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await searchNoMatch(list)

        await list.getByRole('button', { name: 'F1 出力' }).click()

        // frm601004.btnF1_Click: lưới rỗng ⇒ E00003 rồi RETURN — không đi tiếp tới
        // Q00047. Thứ tự này là một phần của FACT, không chỉ là "có báo lỗi".
        await expect(page.getByText(E00003_NO_DATA), 'lưới rỗng phải báo E00003').toBeVisible({
            timeout: 10_000,
        })
        await expect(
            page.getByText(Q00047_CSV),
            'đã báo E00003 thì KHÔNG được hỏi tiếp Q00047',
        ).toHaveCount(0)

        await page.getByRole('button', { name: /^(OK|はい|閉じる)$/ }).first().click()
        await expect(page.getByText(E00003_NO_DATA)).toBeHidden({ timeout: 10_000 })

        await backToHub(list)
        await step()
    })

    // ── Rule 23.4 — đóng rồi mở lại phải reset ───────────────────────────────

    test('TC-RESET-1 — dialog 登録 đóng rồi mở lại không giữ giá trị gõ dở', async () => {
        const pair = PAIRS[1]
        const list = await openList(pair)
        await waitRowsLoaded(list)

        await list.getByRole('button', { name: 'F9 選択' }).click()
        const dialog = byDialog(pair)
        await expect(dialog).toBeVisible({ timeout: 30_000 })

        const box = dialog.getByRole('textbox').first()
        const original = await box.inputValue()
        await box.fill(DRAFT_VALUE)
        await expect(box).toHaveValue(DRAFT_VALUE)

        // 戻る = huỷ. WinForm Dispose form ⇒ lần mở sau là form MỚI.
        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })

        await list.getByRole('button', { name: 'F9 選択' }).click()
        await expect(dialog).toBeVisible({ timeout: 30_000 })
        await expect(
            dialog.getByRole('textbox').first(),
            'mở lại mà còn giá trị gõ dở — WinForm dựng form mới nên phải mất',
        ).toHaveValue(original)

        await dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(dialog).toBeHidden({ timeout: 10_000 })
        await backToHub(list)
        await step()
    })

    test('TC-RESET-2 — 一覧 đóng rồi mở lại: 検索 trắng, đủ dòng, hết glyph sort', async () => {
        const pair = PAIRS[1]
        let list = await openList(pair)
        await waitRowsLoaded(list)

        const fullCount = await list.getByText(/該当件数:/).innerText()

        // Gõ + tìm + sort để bẩn hết mọi thứ có thể sống sót.
        await searchNoMatch(list)
        await list.getByTestId('header-trtNm').click()

        await backToHub(list)
        list = await openList(pair)
        await waitRowsLoaded(list)

        // frm601004 là singleton bị Dispose lúc 戻る ⇒ mở lại phải trắng tinh.
        await expect(
            list.getByRole('textbox').nth(1),
            'mở lại mà ô 検索 còn chữ — WinForm dựng form mới',
        ).toHaveValue('')
        await expect(list.getByText(/該当件数:/), 'mở lại phải nạp lại đủ dòng').toHaveText(
            fullCount,
        )
        // Đọc `aria-sort` chứ không đếm glyph ▲/▼ (Rule 10.5): thuộc tính là thứ
        // VirtualListTable đặt tường minh, glyph chỉ là hệ quả hiển thị.
        await expect(
            list.locator('[aria-sort="ascending"], [aria-sort="descending"]'),
            'mở lại mà còn cột đang sort — sort phải reset theo form mới',
        ).toHaveCount(0)

        await backToHub(list)
        await step()
    })

    // ── Thoát ────────────────────────────────────────────────────────────────

    // ── Rule 23 cho chính hub — frm601001 là BaseDialog nên port là hộp thoại ─

    test('TC-HUB-FOCUS-1 — mở hub: con trỏ nằm ở nút đầu 歯数・ブロックチェック登録', async () => {
        // Mở lại từ đầu vì các test trước đã kéo focus đi khắp nơi.
        await hub.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })
        await openHub()

        // frm601001 không gọi Focus() nên WinForm rơi vào TabIndex nhỏ nhất,
        // tức btnInpChk4 (frm601001.Designer.cs:78).
        await expect(
            hub.getByRole('button', { name: HUB_BUTTONS[0], exact: true }),
            'mở hub mà con trỏ không nằm ở nút đầu',
        ).toBeFocused()
        await step()
    })

    test('TC-HUB-SCROLL-1 — hub mở lên không được có thanh cuộn dọc', async () => {
        const overflowing = await overflowingRegions(hub)
        expect(
            overflowing,
            `hub chỉ có 6 nút mà vẫn cuộn dọc — tăng height thay vì để thanh cuộn. ` +
                `Vùng đang cuộn: ${JSON.stringify(overflowing)}`,
        ).toEqual([])
        await step()
    })

    test('TC-HUB-ESC-1 — ESC KHÔNG đóng hub', async () => {
        await page.keyboard.press('Escape')

        // BaseDialog.cs:320 chỉ chuyển ESC sang btnF9_Click khi btnF9.Enabled,
        // mà F9 của frm601001 là OCHA_OFF ⇒ bên WinForm ESC không làm gì cả.
        await expect(hub, 'ESC đóng mất hub — WinForm không có hành vi đó').toBeVisible()
        await step()
    })

    test('TC-HUB-RESET-1 — vào 一覧 rồi thoát hub, mở lại phải về đúng hub', async () => {
        const list = await openList(PAIRS[0])
        await waitRowsLoaded(list)
        await backToHub(list)

        await hub.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })
        await openHub()

        // Mở lại phải là hub chứ không phải 一覧 vừa xem, và con trỏ về nút đầu.
        await expect(
            byTitle(PAIRS[0].listTitle),
            'mở lại mà rơi thẳng vào 一覧 — hub phải reset về chính nó',
        ).toHaveCount(0)
        await expect(
            hub.getByRole('button', { name: HUB_BUTTONS[0], exact: true }),
        ).toBeFocused()
        await step()
    })

    test('TC-EXIT-1 — F10 ở hub trả về 診療入力', async () => {
        await hub.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await step()
    })
})
