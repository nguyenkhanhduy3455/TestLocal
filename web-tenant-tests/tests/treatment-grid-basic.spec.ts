import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — LƯỚI 処置: BẢY THAO TÁC CƠ BẢN (`/treatments/{patNo}`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEC NÀY LÀ GÌ — VÀ KHÔNG PHẢI LÀ GÌ
 * ═══════════════════════════════════════════════════════════════════════════
 * Đây là NỬA WEB của một cặp đo parity. Nửa kia là
 * `fla-ui-tests/src/OchaCom.FlaUiTests/Tests/TreatmentGrid/TreatmentGridBasicTests.cs`,
 * chạy trên CHÍNH WinForm — tức là đo cái "đáp án" mà bản web phải khớp. Hai file
 * cùng số hiệu TC-1…TC-7, cùng thứ tự, cùng nguồn WinForm. Chạy hai bên rồi so
 * từng cặp là ra ngay chỗ lệch.
 *
 * Bảy thao tác CƠ BẢN nhất: nhìn cột, chèn 処置 từ panel 個別, Enter, Tab, gõ số
 * vào ô 点, Insert 行追加, Delete 行削除. Cố ý KHÔNG có gì nâng cao.
 *
 * ⚠️ KHÔNG trùng với `treatment-table-handler.spec.ts`. File đó đo MENU CHUỘT PHẢI
 * và các luật xoá theo cụm (dòng 介護, linekbn 30, phím ＋/－ của panel チェック) và
 * phải SEED DB. File này đo BÀN PHÍM trần trên lưới, KHÔNG seed gì, KHÔNG cần
 * TEST_DB. Chỗ gần nhau là 行追加/行削除 — bên kia bấm bằng menu, bên này bằng phím
 * Insert/Delete, và WinForm cho hai đường đó đi vào CÙNG `AddRow()`/`DeleteRow()`
 * (frm203002.cs:3570-3583 và :7868-7883), nên phủ cả hai là có chủ ý.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM — mọi assert dưới đây dẫn về đây
 * ═══════════════════════════════════════════════════════════════════════════
 *  · `frm203002.cs:158-187` — `RegiCol`: 0 日, 1 部位, 2 療法・処置, 3 点, 4 回; từ 5
 *    trở đi là cột ẩn (6 `trt_cd`, 7 `trt_sb`, 51 `linekbn`, 54 `点×回`, 78 `trt_dt`).
 *    Bản web dùng ĐÚNG bộ chỉ số này (`treatment-entry-shared.ts:140-151`) và phơi
 *    ra DOM thành `data-grid-cell="<rowKey>|<col>"` — nhờ vậy hai bên so được theo cột.
 *  · `frm203002.Designer.cs:1148-1206` — HeaderText 5 cột: 日 / 部位 / 療法・処置 /
 *    点 / 回. `RegiBui.ReadOnly = true` (:1170) ⇒ cột 部位 không sửa trực tiếp.
 *  · `frm203002.Designer.cs:1088-1121` — `AllowUserToAddRows = false` (:1088),
 *    `MultiSelect = false` + `SelectionMode = CellSelect` (:1114/:1119),
 *    `RegularOperationEnterKeyDisable = true` (:1116), `StandardTab = true` (:1121).
 *  · `frm203002.cs:3043-3044` + `:3063-3066` — lúc dựng lưới app thêm HAI dòng rỗng
 *    rồi GIẤU dòng 0 đi (di sản VB6: dòng đầu là dòng tiêu đề). Dòng rỗng còn lại
 *    nằm ở CUỐI và là chỗ gõ 処置 tiếp ⇒ "dòng cuối trống" là BẤT BIẾN, không phải rác.
 *    `Move_Cell(Down)` ở dòng cuối còn nối thêm một dòng nữa (`:5856-5870`).
 *  · `frm203002.cs:3545-3595` — `grdRegi_KeyDown`, trái tim của spec này:
 *      Enter trên cột 部位  → mở 部位＆病名 (bỏ qua nếu linekbn = 99);
 *      Enter trên cột khác → `e.Handled = true` + `BeginEdit(true)` ⇒ MỞ EDITOR
 *                            TẠI CHỖ, KHÔNG nhảy xuống dòng dưới;
 *      Tab                 → `e.Handled = true` ⇒ NUỐT, con trỏ đứng yên;
 *      Insert              → `AddRow()`;
 *      Delete              → `DeleteRow(con)`;
 *      ← trên cột 点       → mở 部位＆病名 (không đo ở đây, xem mục "để sau").
 *  · `frm203002.cs:3601-3639` — `grdRegi_TextBox_KeyPress`: cột 3 và 4 CHỈ nhận
 *    '0'..'9' + BackSpace + Ctrl+C; Ctrl+V bị chặn; chặn sạch khi linekbn = 99
 *    hoặc ô 点 đang là 「－」.
 *  · `frm203002.cs:3699-3805` — `AddRow(intRowPos)`: từ chối khi linekbn = 99
 *    (:3714), còn lại chèn MỘT `DataRow` tại dòng con trỏ và đẩy dòng cũ xuống.
 *  · `frm203002.cs:3814-4000` — `DeleteRow(con)`: từ chối khi ô 日 rỗng (:3840),
 *    linekbn = 99 (:3841), hoặc con trỏ đứng trên 日計行 (:3843-3846); chỉ 部位病名行
 *    (linekbn = "1") mới hỏi 「同一部位の処置を全て削除します」 rồi xoá cả cụm
 *    (:3856-3857). Xoá xong gọi `modAcc.Calc_MDPoint` và ghi lại `lbAllPoint` /
 *    `lbDays` (:3959-3965).
 *  · `frm203002.cs:6902-6925` — chèn xong một 処置 từ tab 個別 thì app đặt
 *    `grdRegi.CurrentCell = grdRegi[4, y]` (CỘT 回) rồi `BeginEdit` ⇒ con trỏ nằm
 *    ĐÚNG trên dòng vừa thêm. TC-2 đo chính điều đó.
 *  · `modAcc.cs:107-121` — `Calc_MDPoint` định dạng
 *    `lngMonthPoint.ToString("#,###") + "　点"` — dấu phẩy ngăn nghìn VÀ khoảng
 *    trắng ĐỦ CHIỀU RỘNG trước chữ 点. Đó là lý do `readTotal()` bên dưới gom chữ số
 *    thay vì `parseInt` thẳng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NGUỒN BẢN WEB (để biết assert đang chỉ vào đâu khi đỏ)
 * ═══════════════════════════════════════════════════════════════════════════
 *  · `registration-table.tsx:322-328` — nhãn 5 cột; `:78` `cellBg` = ô vàng
 *    (`bg-[#ffffc0]`, hằng số ở `treatment-entry-shared.ts:387`).
 *  · `treatment-entry-detail.tsx:4866-4879` — phím Insert (kèm `Help` cho macOS)
 *    → `handleAddRow` (`:2700`); Delete → `handleDeleteRow` (`:2735`).
 *  · `treatment-entry-detail.tsx:4919-4977` — mũi tên dời ô vàng;
 *    `:4983-4996` — Enter trên ô 部位 mở 部位選択;
 *    `:5000-5045` — gõ một ký tự in được / Enter thì mở editor với ký tự đó.
 *  · `patient-info-header.tsx:94-97` — 「合計: N 点」 (KHÔNG nằm trong lưới).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG SEED, KHÔNG GHI DB
 * ═══════════════════════════════════════════════════════════════════════════
 * Spec này KHÔNG bấm F9 登録 và KHÔNG seed `trn_trn` ⇒ không cần `TEST_DB=1`,
 * không có `afterAll` dọn dẹp. Dòng 処置 mà TC-2 chèn chỉ sống trong `currentRows`
 * của React; đóng trang là hết.
 *
 * Đổi lại, spec KHÔNG tự dựng được dữ liệu: nó cần ngày test có ÍT NHẤT một chỗ
 * để chèn — điều luôn đúng vì lưới luôn có dòng trống ở cuối (TC-1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY / cần biết
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. KHÔNG mốc theo SỐ THỨ TỰ dòng: lưới virtualize các tháng lịch sử
 *     (`registration-table.tsx:206-211`) nên chỉ dòng trong khung nhìn mới có mặt
 *     trong DOM. Luôn mốc theo `rowKey` hoặc theo TEXT.
 *  2. Dòng THÁNG CŨ mang `rowKey` dạng `${recordIndex}-${itemIndex}` còn dòng tháng
 *     hiện hành mang uuid — đó chính là phép phân biệt của `isHistoryRowKey`, thứ
 *     chặn mọi 行追加/行削除 (bản web) và là cột `linekbn = 99` (WinForm). Mọi phép
 *     đếm phải lọc qua `currentMonthRows`.
 *  3. `SanteiConfirmDialog` 「〜を算定しますか？」 bung ra lúc lưới nạp xong và đè lên
 *     mọi click ⇒ `addLocatorHandler` bấm No (GUIDELINE Rule 14/14.1; bấm Yes lại
 *     kéo theo カルテ記載選択).
 *  4. Tên 処置 render kèm space đầu (`REGIRYO_PADLEFT`) ⇒ luôn so sau `trim()`+NFKC.
 *  5. GUIDELINE Rule 3 ưu tiên `getByRole`, nhưng lưới này dựng bằng `div` và KHÔNG
 *     có `role`/`aria`/`data-testid` nào — `data-grid-cell` là mốc ỔN ĐỊNH DUY NHẤT,
 *     và nó là hợp đồng có chủ ý (chỉ số cột = `RegiCol` bên WinForm). Đây là ngoại
 *     lệ có lý do, giống các spec lưới khác trong repo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐỂ SAU (cố ý KHÔNG có ở đây)
 * ═══════════════════════════════════════════════════════════════════════════
 * Enter trên cột 部位 và ← trên cột 点 đều MỞ HỘP THOẠI 部位選択
 * (`frm203002.cs:3551-3558` / `:3583-3593`; web `treatment-entry-detail.tsx:4886-4900`
 * / `:4983-4996`) — chuỗi dialog riêng, tiền đề riêng, xếp vào đợt "nâng cao".
 * コピー / 貼り付け (`frm203002.cs:7856-7883` → `modTrtCopy`) cũng vậy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (GUIDELINE Rule 19)
 * ═══════════════════════════════════════════════════════════════════════════
 * `describe.serial` + MỘT page chung tạo ở `beforeAll` ⇒ cả file login MỘT lần.
 *   · LUÔN chạy CẢ FILE, KHÔNG BAO GIỜ `-g` một testcase lẻ: TC-2 chèn dòng mà
 *     TC-3…TC-6 dùng làm chỗ đứng, TC-7 xoá chính dòng đó.
 *   · serial ⇒ một test đỏ thì các test SAU bị SKIP.
 *   · page tự tạo nên KHÔNG có trace/video/screenshot tự động của fixture.
 *
 *   npx playwright test tests/treatment-grid-basic.spec.ts
 *   npx playwright test tests/treatment-grid-basic.spec.ts --repeat-each=3 --retries=0
 *
 * Spec không seed nên chạy song song với chính nó vô hại (khác
 * `treatment-table-handler.spec.ts`, file đó bắt buộc `--workers=1` khi lặp).
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/**
 * Bệnh nhân test — PHẢI khớp `patient.patNo` trong
 * `fla-ui-tests/src/OchaCom.FlaUiTests/testsettings.local.json`.
 *
 * 10 chứ KHÔNG phải 12138 như các spec khác: đây là spec PARITY, hai bên bắt buộc đo
 * CÙNG một bệnh nhân và CÙNG một ngày thì mới so được. Bệnh nhân 10 được chọn vì chỉ
 * có 8 dòng TRNTRN trong toàn bộ lịch sử (12138 có 2.864 ⇒ WinForm treo hơn một phút).
 */
const PAT_NO = process.env.TEST_PAT_NO ?? '10'

/**
 * Ngày test — PHẢI khớp `patient.trtDate` bên `testsettings.local.json` (FlaUI).
 *
 * KHÔNG dùng "hôm nay": hôm nay thường CHƯA có 処置 nào được lưu, khi đó cả hai bên mở
 * ra lưới rỗng và không có gì để so. Ngày này phải là ngày CÓ dữ liệu thật và phải
 * thuộc tháng đang mở (dòng tháng cũ mang `linekbn = 99` / `isHistoryRowKey`, mọi thao
 * tác đều bị từ chối).
 *
 * Đổi ngày thì PHẢI đổi cả hai bên cùng lúc.
 */
const TRT_DT = process.env.TEST_TRT_DT ?? '2026-08-03'

/**
 * 処置 dùng để tạo MỘT dòng đơn giản, KHÔNG phải chọn 部位.
 *
 * 110 = 再診 — cùng con số mà bên FlaUI dùng (`parity.simpleTrtCd` trong
 * `fla-ui-tests/.../testsettings.json`). Hai bên phải chèn CÙNG một 処置 thì mới so
 * được số điểm.
 */
const SIMPLE_TRT_CD = process.env.TEST_TRT_CD ?? '110'

/** Chỉ số cột — `RegiCol` (frm203002.cs:158-169) = `RegiCol` bản web (treatment-entry-shared.ts:140-151). */
const COL_DAY = 0
const COL_BUI = 1
const COL_RYO = 2
const COL_TEN = 3
const COL_KAI = 4

/** Nhãn 5 cột, đúng thứ tự — Designer.cs:1155/1167/1179/1191/1204. */
const HEADERS = ['日', '部位', '療法・処置', '点', '回'] as const

/** Ô vàng = ô đang giữ con trỏ (`focusedCell`) — treatment-entry-shared.ts:387. */
const FOCUS_CLASS = 'bg-[#ffffc0]'

/** Lưới nạp lần đầu qua Vite dev server lạnh có thể rất chậm. */
const GRID_LOAD_TIMEOUT = 60_000

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator(`[data-grid-cell$="|${COL_RYO}"]`)

interface GridRow {
    /** rowKey (phần trước `|2` của data-grid-cell). */
    key: string
    ryo: string
    ten: string
    kai: string
}

/**
 * rowKey của dòng THÁNG CŨ — `${recordIndex}-${itemIndex}`. Dòng tháng hiện hành
 * mang uuid. Chính là phép phân biệt của `isHistoryRowKey`, tương ứng `linekbn = 99`
 * bên WinForm.
 */
const HISTORY_KEY_RE = /^\d+-\d+$/

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — lưới 処置: bảy thao tác cơ bản (parity với WinForm grdRegi)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dòng 処置 mà TC-2 chèn — mốc cho TC-3…TC-7. */
    let addedKey: string | null = null
    let addedRyo = ''

    /** Ô giữ con trỏ ngay sau khi TC-2 chèn 処置 — TC-8 so nó với WinForm. */
    let focusedAfterInsert: string | null = null

    /**
     * rowKey của dòng TC-2 chèn, giữ RIÊNG cho TC-8.
     *
     * Không dùng chung `addedKey`: TC-7 xoá dòng đó xong gán `addedKey = null` để các TC
     * sau không thao tác lên dòng đã biến mất — nhưng TC-8 chỉ ĐỌC LẠI giá trị đã đo ở
     * TC-2, không cần dòng còn tồn tại. Dùng chung thì TC-8 bị skip oan (đã vấp thật
     * 2026-08-25: cả file "7 passed" mà TC-8 không hề chạy).
     */
    let insertedKeyForTc8: string | null = null

    /**
     * Đọc CẢ lưới trong một lượt `evaluateAll`: rowKey + 療法・処置 + 点 + 回.
     * Một lượt round-trip thay vì ba, và quan trọng hơn là ba ô luôn thuộc CÙNG một
     * lần chụp — đọc rời từng cột thì lưới có thể đã kịp render lại ở giữa.
     */
    async function gridRows(): Promise<GridRow[]> {
        const raw = await ryoCells(page).evaluateAll(
            (els, cols) =>
                els.map((e) => {
                    const key = (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')
                    const cellText = (c: number) =>
                        document.querySelector(`[data-grid-cell="${CSS.escape(key)}|${c}"]`)
                            ?.textContent ?? ''
                    return {
                        key,
                        ryo: e.textContent ?? '',
                        ten: cellText(cols.ten),
                        kai: cellText(cols.kai),
                    }
                }),
            { ten: COL_TEN, kai: COL_KAI },
        )
        return raw.map((r) => ({ key: r.key, ryo: txt(r.ryo), ten: txt(r.ten), kai: txt(r.kai) }))
    }

    /** CHỈ dòng của tháng hiện hành (BẪY 2). */
    async function currentMonthRows(): Promise<GridRow[]> {
        return (await gridRows()).filter((r) => !HISTORY_KEY_RE.test(r.key))
    }

    /** Ô (dòng, cột) — chỉ số cột là `RegiCol`, giữ ở một chỗ duy nhất. */
    const cell = (key: string, col: number) => page.locator(`[data-grid-cell="${key}|${col}"]`)

    // ── Panel 個別 ──────────────────────────────────────────────────────────
    // Toàn bộ locator dưới đây chép từ tests/kobetu-sidepanel-score.spec.ts (spec đo
    // riêng panel này, đã chạy thật). KHÔNG phát minh lại: tab 個別 là <button> chứ
    // không phải role="tab", và ba ô 検索 là ANH EM RUỘT của <span> nhãn — nhãn 「ｺｰﾄﾞ」
    // là NỬA chiều rộng, khác hẳn 「コード」 đủ chiều rộng ở chỗ khác.

    /** Khung side panel bên phải (treatment-side-panel.tsx). */
    let sidePanel: Locator

    /** Dòng của list 個別 — list ẢO, `data-index` là chỉ số thật trong mst_trt. */
    const kobeRows = () => sidePanel.locator('div[data-index]')

    const kobeCodeInput = () =>
        sidePanel.locator('span', { hasText: /^ｺｰﾄﾞ$/ }).locator('xpath=following-sibling::input[1]')

    const kobeSearchButton = () => sidePanel.getByRole('button', { name: '検索' })

    /** Mở tab 個別 và chờ list dựng xong (hoặc báo 該当なし). */
    async function openKobetuTab() {
        await sidePanel.getByRole('button', { name: '個別', exact: true }).click()
        await expect(
            kobeRows().first().or(sidePanel.getByText('該当なし')),
            'tab 個別 không nạp được mst_trt',
        ).toBeVisible({ timeout: 30_000 })
        await step()
    }

    /** Đặt con trỏ (focusedCell) vào một ô. */
    async function focusCell(key: string, col: number) {
        await cell(key, col).click()
        await step()
    }

    /**
     * `data-grid-cell` của ô ĐANG VÀNG. Đây là bản sao của `hFG1.CurrentCellAddress`
     * bên WinForm — TC-3 và TC-4 chứng minh "con trỏ đứng yên" bằng đúng chuỗi này.
     */
    async function focusedCellId(): Promise<string | null> {
        // `CSS.escape` phải chạy TRONG TRANG: nó là API của trình duyệt, ở Node không
        // có (`ReferenceError: CSS is not defined`). Tên lớp `bg-[#ffffc0]` có `[`, `]`
        // và `#` nên bắt buộc phải escape mới nhét vào selector được.
        return page.evaluate((cls) => {
            const el = document.querySelector(`[data-grid-cell].${CSS.escape(cls)}`)
            return el?.getAttribute('data-grid-cell') ?? null
        }, FOCUS_CLASS)
    }

    /**
     * 合計点数 của tháng, đọc thành SỐ.
     *
     * Gom chữ số thay vì `parseInt`: WinForm in ra `"12,345　点"` (dấu phẩy ngăn nghìn
     * + khoảng trắng ĐỦ CHIỀU RỘNG, modAcc.cs:107-121) và bản web dùng
     * `toLocaleString()` nên cũng có dấu phẩy. `null` = không đọc được.
     */
    async function readTotal(): Promise<number | null> {
        // `合計:` là TEXT NODE TRẦN trong div hàng (patient-info-header.tsx:94) — không
        // có element riêng bọc nó, nên `getByText('合計:', {exact:true})` KHÔNG match gì.
        // Regex non-exact thì Playwright trả element SÂU NHẤT khớp, trúng đúng div hàng.
        // (Cùng cách đọc với `headerTotal` trong tests/kasan-buttons.spec.ts:163-169 —
        // giữ giống nhau để hai spec không bao giờ đọc ra hai con số khác nhau.)
        const box = page.getByText(/合計:\s*[\d,]+\s*点/).first()
        const raw = await box.innerText().catch(() => null)
        if (raw === null) return null
        const m = raw.replace(/\s+/g, ' ').match(/合計:\s*([\d,]+)\s*点/)
        return m ? Number(m[1]!.replace(/,/g, '')) : null
    }

    async function openTreatmentScreen() {
        // KHÔNG truyền inpKbn. Đo thật 2026-08-25, cùng bệnh nhân 10 / ngày 2026-08-03:
        //   (không có inpKbn) → 合計 409 点, 実日数 2日 — ĐÚNG bằng WinForm và bằng DB;
        //   inpKbn=update     → lưới RỖNG (0 点 / 0日).
        // Tức đường vào đúng là URL trần, giống hệt cái người dùng mở trên trình duyệt.
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(
            ryoCells(page).first(),
            'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await closeDialogs(page)
    }

    /** Dòng TC-2 đã chèn; chưa có thì skip KÈM LÝ DO chứ không đỏ oan (Rule 5.3). */
    function requireAddedRow(): string {
        if (addedKey === null) {
            const reason =
                'TC-2 chưa chèn được dòng 処置 nào nên testcase này không có chỗ đứng. ' +
                'Chạy CẢ FILE thay vì -g một testcase lẻ.'
            console.log(`SKIP — ${reason}`)
            test.skip(true, reason)
        }
        return addedKey!
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // SanteiConfirmDialog đến CHẬM và đè lên mọi click (Rule 14). Bấm No —
        // Yes lại kéo theo カルテ記載選択 (Rule 14.1).
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

        // カルテ記載選択 — dialog ĐI KÈM sau 算定 (GUIDELINE Rule 14.1). Nó KHÔNG tự tắt và
        // che kín lưới, nên mọi phép đo sau đó đều vô nghĩa. Đã vấp thật 2026-08-25:
        // TC-1 đọc "dòng cuối" ra một 処置行 ngẫu nhiên vì lưới bị che.
        // Đóng bằng nút F10 戻る của chính dialog (Escape trong dialog này = CHỐT, Rule 10.4).
        await page.addLocatorHandler(
            page.getByText('カルテ記載選択').first(),
            async () => {
                const back = page.getByRole('button', { name: /戻る/ }).last()
                if (await back.count()) await back.click()
            },
            { times: 30 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        // Không seed gì, không bấm F9 ⇒ không có gì để dọn. Đóng page là xong.
        await page?.close()
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-1 — cấu trúc lưới
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-1 — lưới có đúng 5 cột 日/部位/療法・処置/点/回 và dòng cuối luôn TRỐNG (Designer.cs:1148-1206)', async () => {
        // Nhãn cột là div thường (registration-table.tsx:322-328), không có role nào.
        for (const [i, label] of HEADERS.entries()) {
            await expect(
                page.getByText(label, { exact: true }).first(),
                `thiếu nhãn cột 「${label}」 (cột ${i} của RegiCol, Designer.cs:1148-1206). ` +
                    'Lệch thứ tự/nhãn cột tức là bản web đang đánh số cột khác — mọi phép so ' +
                    'theo data-grid-cell|n giữa hai bên sẽ vô nghĩa.',
            ).toBeVisible()
        }

        // Mọi chỉ số cột của RegiCol phải TỒN TẠI trong DOM. Đây là hợp đồng thật sự
        // giữa hai bên: bên FlaUI đọc ô theo chỉ số cột của DataGridView, bên này đọc
        // theo `|n` — hai chỉ số phải là MỘT.
        for (const col of [COL_DAY, COL_BUI, COL_RYO, COL_TEN, COL_KAI]) {
            await expect(
                page.locator(`[data-grid-cell$="|${col}"]`).first(),
                `không có ô nào mang data-grid-cell|${col} — RegiCol bên WinForm có đủ 5 cột 0..4`,
            ).toBeAttached()
        }

        // ── Lưới phải kết thúc bằng 日計, không phải một 処置行 trần ──────────────
        //
        // ĐO THẬT trên WinForm 2026-08-25: dòng cuối là 日計行 —
        //     [15] 14 | | [負担金 0円]  [日計 70点] | |
        // tức 日計 nằm trong CỘT 2 (療法・処置) của một dòng lưới thật
        // (modAcc.DispDayPoint, modAcc.cs:132).
        //
        // ⚠️ LỆCH DOM ĐÃ ĐO (2026-08-25, probe DOM bản web): bản web KHÔNG đặt 日計 vào
        // cột 2. Dòng footer chỉ có `data-grid-cell` cho cột 0/1/3/4 — THIẾU HẲN `|2` —
        // còn chuỗi 「【負担金 0円】【日計 162点】」 nằm trong một <div> chỉ có class, không
        // mang thuộc tính ô nào. Nội dung thì ĐÚNG và ĐỦ.
        //
        // Nên assert theo thứ TƯƠNG ĐƯƠNG chứ không theo vị trí ô: ngày cuối phải có
        // dòng footer, và chuỗi 日計 phải hiện. Ghi lại chênh lệch DOM ở đây để người
        // sau không tưởng là 日計 chưa được port.
        const rows = await currentMonthRows()
        expect(rows.length, 'lưới tháng hiện hành phải có ít nhất một dòng').toBeGreaterThan(0)

        const lastKey = rows[rows.length - 1]!.key
        await expect(
            page.locator(`[data-footer-cell^="${lastKey}:footer-"]`).first(),
            `sau 処置行 CUỐI phải là dòng 日計 của ngày đó (modAcc.DispDayPoint, modAcc.cs:132). ` +
                `Không thấy footer nào gắn với dòng 「${rows[rows.length - 1]!.ryo}」 ⇒ lưới đang ` +
                'kết thúc bằng một 処置行 trần, khác WinForm.',
        ).toBeAttached()

        await expect(
            page.getByText(/【日計\s*[\d,]+\s*点】/).last(),
            'phải hiện chuỗi 【日計 N点】 của ngày cuối',
        ).toBeVisible()

        console.log(`TC-1: ${rows.length} dòng tháng hiện hành, 合計 = ${await readTotal()}`)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-2 — chèn một 処置 từ panel 個別
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-2 — chọn 処置 ở panel 個別 thêm ĐÚNG 1 dòng, con trỏ nhảy sang cột 回 (frm203002.cs:6902-6925)', async () => {
        const before = await currentMonthRows()
        const totalBefore = await readTotal()
        console.log(`TC-2: trước khi chèn ${before.length} dòng, 合計 = ${totalBefore}`)

        // Panel 個別: gõ 処置コード vào ô 検索 rồi chọn dòng kết quả. Bên WinForm một cú
        // click là đủ (hfgKobetu_Click tự gọi tiếp Enter → CellDoubleClick,
        // frm203002.cs:6928); bên web đi theo đúng thao tác của bản web.
        //
        // Locator của panel lấy nguyên từ tests/kobetu-sidepanel-score.spec.ts — spec
        // đó đo RIÊNG panel này và đã chạy thật, nên không phát minh lại: tab 個別 là
        // <button> (KHÔNG phải role="tab"), và ô ｺｰﾄﾞ là ANH EM RUỘT của <span>「ｺｰﾄﾞ」.
        await openKobetuTab()
        await kobeCodeInput().fill(SIMPLE_TRT_CD)
        await kobeSearchButton().click()
        await step()

        await expect
            .poll(() => kobeRows().count(), {
                message:
                    `panel 個別 không tìm ra 処置コード ${SIMPLE_TRT_CD} — đổi bằng TEST_TRT_CD nếu ` +
                    'master của máy này không có mã đó',
                timeout: 20_000,
            })
            .toBeGreaterThan(0)

        // Dòng đầu tiên khớp mã: mỗi 枝番 là một dòng, và TC này không kén 枝番 nào.
        await kobeRows().first().click()
        await step()

        // Dò dòng mới bằng cách SO HAI LƯỢT CHỤP chứ không dò theo tên: tên hiện trên
        // lưới là cct_nm hay trt_nm tuỳ ModCommon.pCultTrt, có thể khác tên trên panel.
        await expect
            .poll(async () => (await currentMonthRows()).length, {
                message:
                    `chọn 処置 ${SIMPLE_TRT_CD} ở panel 個別 mà lưới không thêm dòng nào ` +
                    '(pKobetu_Let_Trt_Data, modKobetu.cs:255-265)',
                timeout: 15_000,
            })
            .toBe(before.length + 1)

        const after = await currentMonthRows()
        const beforeKeys = new Set(before.map((r) => r.key))
        const added = after.find((r) => !beforeKeys.has(r.key)) ?? after.find((r, i) => r.ryo !== before[i]?.ryo)
        expect(
            added,
            'lưới báo có thêm dòng nhưng hai lượt chụp không khác nhau ở đâu cả',
        ).toBeDefined()
        addedKey = added!.key
        insertedKeyForTc8 = added!.key
        addedRyo = added!.ryo
        console.log(`TC-2: dòng vừa thêm key=${addedKey} 「${addedRyo}」 点=${added!.ten} 回=${added!.kai}`)

        expect(added!.ryo, 'dòng vừa thêm không có 療法・処置 nào').not.toBe('')

        // Vị trí con trỏ sau khi chèn: CHỈ GHI LẠI ở đây. Phép so với WinForm nằm ở
        // TC-8 cuối file (test.fail) vì bản web đang LỆCH — xem giải thích ở đó.
        focusedAfterInsert = await focusedCellId()
        console.log(`TC-2: ô đang giữ con trỏ sau khi chèn = ${focusedAfterInsert}`)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-3 — Enter mở editor TẠI CHỖ
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-3 — Enter trên ô ≠ 部位 mở editor tại chỗ, KHÔNG nhảy xuống dòng dưới (frm203002.cs:3549-3564)', async () => {
        const key = requireAddedRow()

        await focusCell(key, COL_KAI)
        const before = await focusedCellId()
        expect(before, 'click vào ô 回 mà ô đó không thành ô vàng').toBe(`${key}|${COL_KAI}`)

        await page.keyboard.press('Enter')
        await step()

        // Ngay sau khi TC-2 chèn dòng, app còn đang dọn nốt (đóng dialog 算定 / カルテ記載
        // 選択, dời con trỏ về footer). Cú Enter đầu có thể rơi vào lúc đó. Probe
        // 2026-08-25 đã chứng minh Enter MỞ ĐƯỢC editor trên dòng ổn định, nên thử lại
        // một nhịp trước khi kết luận là bản web thiếu tính năng.
        if ((await cell(key, COL_KAI).locator('input').count()) === 0) {
            await focusCell(key, COL_RYO)
            await focusCell(key, COL_KAI)
            await page.keyboard.press('Enter')
            await step()
        }

        // DataGridView mặc định: Enter = chốt ô rồi NHẢY XUỐNG dòng dưới. frm203002 tắt
        // hẳn hành vi đó (RegularOperationEnterKeyDisable = true, Designer.cs:1116) và
        // grdRegi_KeyDown thay bằng BeginEdit(true) — Enter là "mở ô để sửa", không phải
        // "đi tiếp". Port thiếu chỗ này thì con trỏ trôi mất một dòng mỗi lần gõ Enter.
        await expect(
            cell(key, COL_KAI).locator('input'),
            'Enter trên ô ≠ 部位 phải MỞ EDITOR tại chính ô đó ' +
                '(e.Handled = true; grdRegi.BeginEdit(true) — frm203002.cs:3560-3564)',
        ).toHaveCount(1)

        expect(
            await focusedCellId(),
            'Enter KHÔNG được dời con trỏ sang dòng dưới — hành vi mặc định của DataGridView ' +
                'đã bị chặn (RegularOperationEnterKeyDisable = true, Designer.cs:1116)',
        ).toBe(before)

        // Dọn editor bằng CLICK SANG Ô KHÁC, TUYỆT ĐỐI không dùng Escape.
        //
        // ĐO THẬT trên WinForm 2026-08-25 (probe P2): ESC KHÔNG huỷ editor mà là 戻る —
        // GradientDataGridView.ProcessDialogKey trả false khi
        // RegularOperationEnterKeyDisable = true (GradientDataGridView.cs:645-668) nên ESC
        // rơi xuống form, bung 「処置データは、変更されています。保存しますか？」 rồi ĐÓNG màn hình.
        //
        // ⚠️ Đây là chỗ NGHI LỆCH: bản web cho Escape huỷ editor
        // (registration-table.tsx:126-157). Chưa đo nên chưa chốt — spec này cố ý KHÔNG
        // dùng Escape để phép đo của TC-3 không phụ thuộc vào chỗ còn tranh cãi đó.
        await focusCell(key, COL_RYO)
        await expect(cell(key, COL_KAI).locator('input')).toHaveCount(0)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-4 — Tab bị nuốt
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-4 — [LỆCH] Tab phải RỜI khỏi lưới sang control kế tiếp (StandardTab = true, Designer.cs:1121)', async () => {
        // LỆCH ĐÃ ĐO 2026-08-25, cùng bệnh nhân 10 / ngày 2026-08-03 / cùng dữ liệu (409 点):
        //   WinForm : 「点 Row 16」 --Tab--> 「患者情報」   (con trỏ RỜI khỏi lưới)
        //   Bản web : 「<row>|3」    --Tab--> 「<row>|3」    (ô vàng ĐỨNG YÊN, Tab bị nuốt)
        //
        // WinForm không tự viết hành vi này: grdRegi khai StandardTab = true
        // (Designer.cs:1121) nên Tab đi theo thứ tự tab của FORM, và WinForms xử Tab qua
        // ProcessDialogKey TRƯỚC KeyDown — `e.Handled = true` ở grdRegi_KeyDown
        // (frm203002.cs:3566-3569) chỉ chặn phần dời-ô mà StandardTab vốn đã tắt.
        //
        // Giữ dưới test.fail() theo quy ước repo: lệch đã biết vẫn chạy để canh, nhưng
        // không chặn các testcase sau. Sửa xong thì test này "unexpectedly passed" và
        // phải bỏ test.fail() đi.
        test.fail()
        const key = requireAddedRow()

        await focusCell(key, COL_TEN)
        const before = await focusedCellId()
        expect(before, 'click vào ô 点 mà ô đó không thành ô vàng').toBe(`${key}|${COL_TEN}`)

        await page.keyboard.press('Tab')
        await step()

        const after = await focusedCellId()
        console.log(`TC-4: focusedCell ${before} --Tab--> ${after}`)

        // ĐO THẬT trên WinForm 2026-08-25 (probe P3): 「点 Row 16」 --Tab--> 「患者情報」.
        //
        // Bản đầu assert NGƯỢC LẠI — "Tab bị nuốt, con trỏ đứng yên" — suy từ
        // grdRegi_KeyDown đặt e.Handled = true cho Tab (frm203002.cs:3566-3569). Suy vậy
        // SAI: Tab là phím điều hướng hộp thoại, WinForms xử qua ProcessDialogKey TRƯỚC
        // KeyDown, và grdRegi khai StandardTab = true (Designer.cs:1121) = "Tab sang
        // CONTROL kế tiếp thay vì sang ô kế tiếp". e.Handled ở KeyDown chỉ chặn được phần
        // dời-ô mà StandardTab vốn đã tắt.
        expect(
            after,
            'Tab phải RỜI ô vàng khỏi ô hiện tại (StandardTab = true, Designer.cs:1121). ' +
                `Ô vàng vẫn ở 「${after}」 nghĩa là bản web đang NUỐT Tab, khác WinForm.`,
        ).not.toBe(before)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-5 — ô 点 chỉ ăn chữ số
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-5 — [LỆCH] ô 点 chỉ nhận 0-9, chữ cái phải bị chặn (grdRegi_TextBox_KeyPress, frm203002.cs:3601-3639)', async () => {
        // LỆCH ĐÃ ĐO 2026-08-25, cùng bệnh nhân / ngày / dữ liệu:
        //   WinForm : gõ 「9a8」 → editor ra 「98」   (chữ 「a」 bị nuốt)
        //   Bản web : gõ 「9a8」 → editor ra 「9a8」  (nhận tất cả)
        //
        // WinForm lọc ở tầng PHÍM: grdRegi_TextBox_KeyPress (frm203002.cs:3601-3639) chỉ
        // cho '0'..'9' + BackSpace + Ctrl+C đi qua trên cột 3/4, chặn cả Ctrl+V. Bản web
        // dùng <input> thường nên mọi ký tự đều lọt vào ô điểm.
        //
        // Giữ dưới test.fail() theo quy ước repo — xem ghi chú ở TC-4.
        test.fail()
        const key = requireAddedRow()
        const original = (await currentMonthRows()).find((r) => r.key === key)?.ten ?? ''

        await focusCell(key, COL_TEN)
        await page.keyboard.press('Enter')
        const editor = cell(key, COL_TEN).locator('input')
        await expect(
            editor,
            'không mở được editor trên ô 点 — xem kết quả TC-3 trước, đó là chỗ chốt việc ' +
                'Enter có mở editor hay không',
        ).toHaveCount(1)

        // grdRegi_TextBox_KeyPress (frm203002.cs:3601-3639) chỉ cho '0'..'9' và BackSpace
        // đi qua trên cột 3/4; mọi ký tự khác bị e.Handled = true nuốt mất. Gõ xen kẽ chữ
        // và số: cái ra được phải là ĐÚNG phần số.
        await editor.fill('')
        await page.keyboard.type('9a8')
        await step()

        const typed = (await editor.inputValue()) ?? ''
        console.log(`TC-5: gõ 「9a8」 vào ô 点 → editor đang là 「${typed}」`)
        expect(
            typed,
            `ô 点 chỉ được nhận chữ số (grdRegi_TextBox_KeyPress, frm203002.cs:3601-3639) — ` +
                `chữ 「a」 phải bị nuốt, nhưng editor đang là 「${typed}」. Dùng <input> thường mà ` +
                'không lọc phím thì mọi ký tự đều lọt.',
        ).toBe('98')

        // Rời ô bằng CLICK (không Escape — xem TC-3). ĐO THẬT trên WinForm (probe P4):
        // rời ô KHÔNG chốt giá trị gõ dở, ô 点 quay về giá trị cũ (59 → gõ 98 → vẫn 59).
        await focusCell(key, COL_RYO)
        await expect(editor).toHaveCount(0)
        expect(
            (await currentMonthRows()).find((r) => r.key === key)?.ten,
            'rời ô phải HUỶ giá trị gõ dở và trả ô 点 về giá trị cũ (WinForm: 59 → gõ 98 → vẫn 59)',
        ).toBe(original)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-6 — Insert = 行追加
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-6 — Insert chèn ĐÚNG 1 dòng tại con trỏ (frm203002.cs:3570-3572 → AddRow :3699)', async () => {
        const key = requireAddedRow()

        await focusCell(key, COL_RYO)
        const before = (await currentMonthRows()).length
        console.log(`TC-6: số dòng trước khi gõ Insert = ${before}`)

        await page.keyboard.press('Insert')

        await expect
            .poll(async () => (await currentMonthRows()).length, {
                message:
                    'Insert phải chèn ĐÚNG 1 dòng trống tại vị trí con trỏ ' +
                    '(grdRegi_KeyDown :3570-3572 → AddRow :3699-3805). Không đổi tức là phím ' +
                    'Insert chưa được nối vào 行追加; nhiều hơn 1 tức là đang chèn kèm cả 部位行.',
                timeout: 10_000,
            })
            .toBe(before + 1)

        // Dọn lại để TC-7 xuất phát từ đúng lưới của TC-2 — dòng trống vừa chèn đang là
        // dòng focus nên Delete rơi đúng vào nó.
        await page.keyboard.press('Delete')
        await expect
            .poll(async () => (await currentMonthRows()).length, {
                message: 'Delete phải trả lưới về số dòng trước khi Insert',
                timeout: 10_000,
            })
            .toBe(before)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-7 — Delete = 行削除 + 合計 tính lại
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-7 — Delete xoá dòng đang đứng và tính lại 合計 (frm203002.cs:3574-3583 → DeleteRow :3814, :3959-3965)', async () => {
        const key = requireAddedRow()

        const rowBefore = (await currentMonthRows()).find((r) => r.key === key)
        expect(rowBefore, `không còn thấy dòng 「${addedRyo}」 trên lưới`).toBeDefined()
        const countBefore = (await currentMonthRows()).length
        const totalBefore = await readTotal()
        console.log(
            `TC-7: trước khi xoá ${countBefore} dòng, 合計 = ${totalBefore}, ` +
                `dòng sắp xoá 点=${rowBefore!.ten} 回=${rowBefore!.kai}`,
        )

        await focusCell(key, COL_RYO)
        await page.keyboard.press('Delete')

        // 処置 đem test KHÔNG phải 部位病名行 (linekbn = "1") nên KHÔNG được hỏi
        // 「同一部位の処置を全て削除します」 — đó là đường DUY NHẤT xoá theo cụm
        // (frm203002.cs:3853-3862).
        await expect(
            page.getByText('同一部位の処置を全て削除します'),
            'xoá một 処置行 thường không được hỏi confirm xoá theo cụm ' +
                '(chỉ 部位病名行 mới hỏi, frm203002.cs:3856-3857)',
        ).toHaveCount(0)

        await expect
            .poll(async () => (await currentMonthRows()).some((r) => r.key === key), {
                message:
                    `Delete phải xoá dòng ĐANG ĐỨNG 「${addedRyo}」 ` +
                    '(grdRegi_KeyDown :3574-3583 → DeleteRow :3814). Dòng vẫn còn tức là phím ' +
                    'Delete chưa được nối vào 行削除, hoặc DeleteRow đã từ chối ở một trong ba ' +
                    'cổng đầu (ô 日 rỗng :3840 / linekbn 99 :3841 / 日計行 :3843).',
                timeout: 10_000,
            })
            .toBe(false)

        const totalAfter = await readTotal()
        console.log(`TC-7: sau khi xoá ${(await currentMonthRows()).length} dòng, 合計 = ${totalAfter}`)

        // Xoá xong DeleteRow gọi modAcc.Calc_MDPoint rồi ghi lại lbAllPoint
        // (frm203002.cs:3959-3965). Chỉ chốt CHIỀU chứ không chốt con số: 合計 của tháng
        // còn cộng cả 加算 mà app tự tính, nên một con số tuyệt đối ở đây sẽ đỏ oan trên
        // máy có dữ liệu khác.
        const ten = Number(rowBefore!.ten)
        if (totalBefore !== null && totalAfter !== null && Number.isFinite(ten) && ten > 0) {
            expect(
                totalAfter,
                `xoá một dòng có 点=${rowBefore!.ten} thì 合計点数 phải GIẢM ` +
                    `(modAcc.Calc_MDPoint → lbAllPoint, frm203002.cs:3959-3965), đang là ` +
                    `${totalBefore} → ${totalAfter}. Không đổi tức là chỉ bỏ dòng khỏi lưới mà ` +
                    'quên tính lại tổng.',
            ).toBeLessThan(totalBefore)
        } else {
            console.log(
                `TC-7: bỏ qua vế 合計 — không đọc được số (trước=${totalBefore} sau=${totalAfter}) ` +
                    `hoặc dòng test có 点=${rowBefore!.ten}`,
            )
        }

        addedKey = null
    })
    /**
     * ─── TC-8: LỆCH ĐÃ ĐO, giữ dưới test.fail ────────────────────────────────
     * Đặt CUỐI file và mang `test.fail()` theo đúng quy ước repo: lệch đã biết thì
     * vẫn chạy để canh, nhưng không chặn các testcase khác. Ngày nó được sửa, test
     * này chuyển sang "unexpectedly passed" và phải bỏ `test.fail()` đi.
     */
    test('TC-8 — [LỆCH] chèn xong con trỏ phải đậu ở ô 回 của DÒNG MỚI (frm203002.cs:6920-6925)', async () => {
        // test.fail() phải nằm TRONG thân testcase. Gọi ở cấp describe thì Playwright áp
        // cho MỌI test trong file — đã vấp thật 2026-08-25: TC-1 báo
        // 「Expected to fail, but passed」 và cả file dừng.
        test.fail()
        const key = insertedKeyForTc8
        test.skip(key === null, 'TC-2 chưa chèn được dòng nào')

        // ĐO THẬT 2026-08-25, cùng bệnh nhân (10) cùng ngày (2026-08-03):
        //   WinForm : mở editor ngay ở ô 回 của dòng vừa thêm
        //             (grdRegi.CurrentCell = grdRegi[4, y] rồi BeginEdit).
        //   Bản web : con trỏ nhảy sang 「<rowKey>:footer-ten|3」 — ô 点 của dòng FOOTER,
        //             không phải ô 回 của dòng mới.
        //
        // Hệ quả cho người dùng: ở WinForm gõ tiếp là ra SỐ LẦN của 処置 vừa chọn; ở bản
        // web gõ tiếp rơi vào ô điểm của dòng tổng ngày.
        console.log(`TC-8: focusedCell sau khi chèn = ${focusedAfterInsert} (mong đợi ${key}|${COL_KAI})`)
        expect(
            focusedAfterInsert,
            'chèn xong con trỏ phải nằm ở CỘT 回 của DÒNG MỚI (grdRegi[4, y], ' +
                'frm203002.cs:6920-6925) — đây là chỗ quyết định "gõ tiếp là ra số lần".',
        ).toBe(`${key}|${COL_KAI}`)
    })

})
