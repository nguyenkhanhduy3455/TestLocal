import { expect, test, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — THAO TÁC TRÊN LƯỚI 処置 (`/treatments/{patNo}`).
 *
 * Spec gom các thao tác trực tiếp trên bảng 処置: đặt con trỏ (focusedCell), menu
 * chuột phải 行追加 / 行削除, phím Insert / Delete, quy tắc dòng nào xoá được /
 * xoá kéo theo cái gì, và phím ＋ / － cuộn panel 処置データチェック (TC-8..TC-11).
 * Mọi assert bám THEO WINFORM (`userapp/src/OCHACOM`), không bám theo code web.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - INP/Forms/frm203002.Designer.cs:2932-2937 — `IDM_TrtDelete` 「行削除」 và
 *    `IDM_TrtInsert` 「行追加」 nằm cuối `contextMenuStripSentaku` (menu chuột phải
 *    của lưới). `IDM_TrtDelete_Click` (frm203002.cs:7874-7883) gọi thẳng
 *    `DeleteRow(con)`; phím Delete đi đúng đường đó (grdRegi_KeyDown:3574-3583).
 *  - INP/Forms/frm203002.cs:3812-4064 — **DeleteRow()**:
 *      · :3840-3848 chỉ TỪ CHỐI hai loại dòng — `linekbn == "99"` (履歴/tháng cũ)
 *        và dòng 日計 (`ModCommon.pNikkei[day]`). MỌI dòng khác xoá được, kể cả
 *        `linekbn` 10..15 (負担金) và **30** (【介護保険一部負担金】);
 *      · :3853-3863 CHỈ khi con trỏ đứng trên 部位病名行 (`linekbn == "1"`) mới hỏi
 *        「同一部位の処置を全て削除します。よろしいですか？」 rồi bật `flgBui` — đó là
 *        đường DUY NHẤT xoá theo cụm;
 *      · :3891-3955 vòng xoá: `flgBui == false` ⇒ xoá ĐÚNG MỘT dòng.
 *  - INP/Forms/frm203002.cs:5935-6025 — **KaigoHutanSet** dựng dòng
 *    【介護保険一部負担金】 (`hFG1[51] = "30"`, :6015). Nó được gọi từ **ĐÚNG MỘT**
 *    chỗ: :5787 `if (bolKaigoFlg) KaigoHutanSet(con);` — nhánh chốt 回数 của một
 *    dòng 介護. `DeleteRow` KHÔNG BAO GIỜ gọi nó ⇒ xoá dòng 599 thì dòng tổng
 *    ĐỨNG NGUYÊN.
 *  - INP/Lib/modSave.cs:2456-2500 / 2747-2790 — lúc nạp tháng, dòng tổng được DỰNG
 *    LẠI từ `jihi_flg = 3`; modSave.cs:237 chỉ ghi dòng `linekbn == "2"` ⇒ dòng
 *    tổng KHÔNG bao giờ vào trn_trn.
 *  - INP/Forms/frm203002.cs:3289-3295 + 4815-4833 — phím ＋ / － của panel
 *    処置データチェック. `frm203002_KeyDown` đẩy `Keys.Add` / `Keys.Subtract` sang
 *    `KeyFunc`, và KeyFunc CHỈ làm gì đó khi panel đang mở:
 *        if (PnlChek.Visible) { grdChek.Focus(); SendKeys {PGDN}/{PGUP}; hFG1.Focus(); }
 *    ⇒ ba tính chất phải khớp: (a) cuộn ĐÚNG MỘT TRANG, (b) con trỏ quay về lưới
 *    処置 chứ không ở lại panel, (c) panel đóng thì phím trả về hành vi thường của
 *    lưới. `CanKeyFunc` (:5134-5135) cho Add/Subtract đi qua vô điều kiện.
 *    Panel bật/tắt bằng F3 (`KeyFunc` case F3, :4679-4696 → `TrnChk`).
 *  - INP/Forms/frm203002.cs:3645-3690 — `grdRegi_MouseUp`: chuột phải chỉ BẬT/TẮT
 *    hiển thị mục menu, đọc `hFG1.CurrentCellAddress`. DataGridView KHÔNG dời
 *    CurrentCell khi chuột phải ⇒ 行削除 tác động lên Ô ĐANG VÀNG, không phải dòng
 *    vừa bấm chuột phải. Web khớp: `handleRowContextMenu`
 *    (treatment-entry-detail.tsx) không đụng `focusedCell`.
 *
 * ─── Bug đã khắc phục mà spec này canh (TC-4, TC-5) ───────────────────────────
 * commit `c0fa166e` fix(web-tenant) + `4025264a` refactor. Trước đó web DẪN XUẤT
 * dòng 【介護保険一部負担金】 lại ở mỗi lần render (`buildDisplayMonth`), nó KHÔNG
 * nằm trong `currentRows`, nên:
 *   · 行削除 trên chính dòng đó = vô hiệu (`findIndex` trả -1 → thoát im lặng);
 *   · xoá dòng 599 làm ngày hết dòng 介護 ⇒ dòng tổng biến mất theo = "xoá cả cụm".
 * Bản sửa biến nó thành dòng thật (`applyKaigoHutanSet` / `seedKaigoHutanRows`
 * trong `lib/treatment-grid-rows.ts`), chỉ SỐ TIỀN mới tính lại lúc render.
 *
 * ─── Bug đã khắc phục mà spec này canh (TC-8..TC-11) ──────────────────────────
 * commit `9ace5375` fix(web-tenant). Panel 処置データチェック IN sẵn dòng hướng dẫn
 * 「＋、－ キーで表示切替。もう一度F3キーを押すと戻ります。」 (đúng nhãn
 * `customLabel29` của frm203002.Designer.cs:2674) nhưng KHÔNG hề có handler cho hai
 * phím đó. Hậu quả kép:
 *   · TC-9 đỏ — chiều cao mặc định ~3 dòng, lỗi nhiều hơn thì phần còn lại nằm
 *     khuất mà bàn phím không kéo xuống được (chỉ còn chuột);
 *   · TC-10 đỏ — ＋ không "rơi vào hư không" mà bị handler gõ-để-sửa của lưới nuốt
 *     ⇒ mở editor ô đang vàng với giá trị seed '+'. Người dùng làm đúng hướng dẫn
 *     trên màn hình thì lại bắt đầu SỬA dữ liệu ở chỗ họ chỉ định ĐỌC.
 * Bản sửa bắt phím ở CAPTURE phase (thắng handler gõ-để-sửa) và chỉ đăng ký khi
 * panel mở — TC-11 canh đúng vế "chỉ khi mở" đó.
 *
 * ─── Dữ liệu tự dựng (cần TEST_DB=1) ──────────────────────────────────────────
 * `beforeAll` seed vào `trn_trn` của (TEST_PAT_NO, TEST_TRT_DT), vùng
 * `disp_no >= 9000`, `afterAll` xoá đúng vùng đó:
 *      1  歯科初診料                    272点 ×1  jihi_flg = 0   ← dòng 保険 thường
 *      599-0 歯科医師居宅療養管理指導Ⅰ  517点 ×1  jihi_flg = 3   ← dòng 介護 (xám)
 * `jihi_flg = 3` là trạng thái `SetKaigoFlg` (modSave.cs:684-737) LUÔN ghi cho mã
 * 599 枝番 0/1/>=10 ⇒ đây đúng là "dữ liệu đã lưu của một ngày có 介護".
 * 517/272 lấy từ master đang áp dụng (`mst_trt.score1`).
 *
 * ─── BẪY / cần biết ───────────────────────────────────────────────────────────
 *  1. KHÔNG mốc theo SỐ THỨ TỰ dòng: lưới virtualize các tháng lịch sử
 *     (registration-table.tsx). Luôn mốc theo TEXT của ô 療法・処置.
 *  2. NFKC ăn 「Ⅰ」 (U+2160 → `I`) y như nó biến `１` → `1`. Hằng số dò tìm CỐ Ý
 *     cắt bỏ đuôi Ⅰ — xem `KAIGO_KEY`. (Bẫy này đã làm đỏ oan
 *     `kaigo-hutan-row.spec.ts` một lần.)
 *  3. Dòng 【介護保険一部負担金】 có `emptyMetrics` ⇒ ô 点/回 rỗng và không sửa được,
 *     nhưng ô 療法・処置 VẪN có `data-grid-cell` nên click đặt được focusedCell —
 *     đó là điều kiện cần để 行削除 tác động lên nó.
 *  4. Spec này TUYỆT ĐỐI KHÔNG bấm F9 登録 ⇒ không ghi DB. Dữ liệu duy nhất chạm
 *     DB là 2 dòng seed, dọn ở `afterAll`. Vì vậy không cần `TEST_ALLOW_SAVE`.
 *  5. `SanteiConfirmDialog` 「〜を算定しますか？」 bung ra lúc lưới nạp xong, đè lên
 *     mọi click → `addLocatorHandler` bấm No (GUIDELINE Rule 14/14.1; bấm Yes lại
 *     kéo theo カルテ記載選択).
 *  6. TC-8..TC-11 CHẶN `POST /tenant/treatment/check` và trả danh sách lỗi giả.
 *     Đối tượng kiểm ở đây là PHÍM của panel, không phải luật チェック (luật có spec
 *     riêng: single-check-w00100.spec.ts). Panel chỉ mở khi `hasErrors` = true, và
 *     phải cuộn được thì mới đo được ⇒ cần một số dòng lỗi ĐỦ NHIỀU và ỔN ĐỊNH,
 *     thứ dữ liệu thật của ngày test không hứa được. Nội dung message cố ý ghi rõ
 *     là dữ liệu dựng (`【E2E】`) để không ai nhầm với message thật.
 *  7. Bấm F3 bằng NÚT `[data-fkey="F3"]` chứ không bằng `keyboard.press('F3')`:
 *     click có auto-wait của Playwright nên `addLocatorHandler` kịp dẹp
 *     SanteiConfirmDialog nếu nó đang che; phím thì bay thẳng vào dialog.
 *
 * ─── Cách chạy (GUIDELINE Rule 19) ────────────────────────────────────────────
 * `describe.serial` + MỘT page chung tạo ở `beforeAll` ⇒ cả file login MỘT lần.
 *   · LUÔN chạy CẢ FILE, KHÔNG BAO GIỜ `-g` một testcase lẻ: các TC nối tiếp
 *     trạng thái lưới (TC-4 xoá dòng 599 rồi TC-5 mới xoá dòng tổng).
 *   · serial ⇒ một test đỏ thì các test SAU bị SKIP.
 *   · page tự tạo nên KHÔNG có trace/video/screenshot tự động của fixture.
 *
 * ⚠️ SPEC NÀY SEED DB DÙNG CHUNG (pat_no, trt_dt) ⇒ KHÔNG chạy song song với chính
 * nó. `playwright.config.ts` để `workers: 4` + `fullyParallel`, nên `--repeat-each`
 * mà không ghim worker sẽ cho 3 `beforeAll` seed ĐỒNG THỜI vào cùng một ngày ⇒ lưới
 * có 3 bộ dòng chồng nhau và mọi assert đếm dòng đỏ oan (đã vấp thật: 合計 816点 =
 * 272×3). Chạy lặp thì PHẢI kèm `--workers=1`:
 *
 *   TEST_DB=1 npx playwright test tests/treatment-table-handler.spec.ts
 *   TEST_DB=1 npx playwright test tests/treatment-table-handler.spec.ts \
 *     --repeat-each=3 --retries=0 --workers=1
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — 12138 không có bản 介護保険 nào ⇒ rate đi nhánh fallback. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/**
 * Ngày test = HÔM NAY (yyyy-MM-dd). BẮT BUỘC thuộc tháng hiện hành: chỉ dòng của
 * tháng đang mở mới thao tác được (`isHistoryRowKey` chặn mọi 行追加/行削除 trên
 * dòng tháng cũ).
 */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** 介護 対象 処置コード — WinForm hard-code 599 ở 5 chỗ, không có hằng số nào. */
const KAIGO_TRT_CD = 599
/** 枝番 0 = 歯科医師居宅療養管理指導Ⅰ — chắc chắn là 介護 (modSave.cs:706). */
const KAIGO_SB = 0
/** 点数 của 599-0 trong master đang áp dụng (mst_trt.score1). */
const KAIGO_PT = 517
const KAIGO_NM = '歯科医師居宅療養管理指導Ⅰ'

/** 歯科初診料 — dòng 保険 thường, dùng làm "hàng xóm" phải còn nguyên sau mỗi lần xoá. */
const INS_TRT_CD = 1
const INS_PT = 272
const INS_NM = '歯科初診料'

/** `TRNTRN.JIHI_FLG`: 3 ⇒ 介護, 0 ⇒ 保険. */
const JIHI_FLG_KAIGO = 3
const JIHI_FLG_HOKEN = 0

/**
 * Mốc TÌM KIẾM trên lưới — CỐ Ý cắt đuôi 「Ⅰ」 (BẪY 2): `txt()` chuẩn hoá NFKC,
 * biến U+2160 thành chữ `I` thường, nên hằng số còn giữ Ⅰ sẽ không bao giờ khớp.
 */
const KAIGO_KEY = '歯科医師居宅療養管理指導'
/** Nhãn cố định của dòng tổng (frm203002.cs:6014). */
const KAIGO_LABEL = '介護保険一部負担金'

/**
 * 処置データチェック (一括) — `POST /tenant/treatment/check`, đường mà F3 gọi
 * (frm203002 `TrnChk`). RegExp chứ không phải glob: `**​/tenant/treatment/check`
 * dễ kéo theo cả `/check-single` khi ai đó sửa lại pattern.
 */
const CHECK_URL = /\/tenant\/treatment\/check(\?|$)/

/**
 * Số dòng lỗi dựng sẵn. Khung mặc định của panel ~3 dòng (79px, 1 dòng ≈ 26px) nên
 * 12 dòng chắc chắn tràn ⇒ có cái để cuộn. Không mốc vào con số này trong assert.
 */
const STUB_ERROR_ROWS = 12

/** Một mẩu của dòng hướng dẫn in trên panel (customLabel29, Designer.cs:2674). */
const SCROLL_HINT = 'キーで表示切替'

/** Nhãn của vùng cuộn chứa danh sách lỗi (`role="region"` trên chính khung cuộn). */
const CHECK_LIST_LABEL = '処置データチェック エラー一覧'

/** Lưới nạp lần đầu qua Vite dev server lạnh có thể rất chậm. */
const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|2` của data-grid-cell). */
    key: string
    text: string
}

async function gridRows(page: Page): Promise<GridRow[]> {
    const raw = await ryoCells(page).evaluateAll((els) =>
        els.map((e) => ({
            key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
            text: e.textContent ?? '',
        })),
    )
    return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
}

function findRow(rows: readonly GridRow[], ...keys: readonly string[]): GridRow | undefined {
    return rows.find((r) => keys.every((k) => r.text.includes(txt(k))))
}

/**
 * Chỉ số dòng CUỐI CÙNG chứa `key` (-1 nếu không có). Viết tay thay cho
 * `Array.findLastIndex` vì `tsconfig.json` của repo test còn dưới ES2023 — và
 * tsconfig là hạ tầng dùng chung, không sửa vì một spec.
 */
function lastIndexOfRow(rows: readonly GridRow[], key: string): number {
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.text.includes(txt(key))) return i
    }
    return -1
}

/**
 * rowKey của dòng THÁNG CŨ — `${recordIndex}-${itemIndex}`. Dòng tháng hiện hành
 * mang id ổn định (uuid). Chính là phép phân biệt của `isHistoryRowKey`
 * (treatment-entry-detail.tsx), thứ chặn mọi 行追加 / 行削除 trên dòng lịch sử.
 */
const HISTORY_KEY_RE = /^\d+-\d+$/

/**
 * CHỈ dòng của tháng hiện hành.
 *
 * BẪY ĐÃ VẤP (lần chạy đầu): `歯科初診料` có mặt ở CẢ block tháng cũ (R08年07月)
 * lẫn tháng test, mà lưới in tháng cũ TRƯỚC ⇒ `findRow` khớp trúng dòng LỊCH SỬ.
 * Click chuột phải lên nó thì `handleRowContextMenu` return sớm, menu không bao
 * giờ mở, và TC-2 đỏ như thể app thiếu menu. Mọi phép dò/đếm phải lọc qua đây.
 */
async function currentMonthRows(page: Page): Promise<GridRow[]> {
    return (await gridRows(page)).filter((r) => !HISTORY_KEY_RE.test(r.key))
}

// GUIDELINE Rule 18 — skip cấp file phải NÓI LÝ DO ra stdout, nếu không người chạy
// thấy chữ "skipped" trơ trọi và tưởng spec đã chạy xong.
if (!dbEnabled) {
    console.log(
        'SKIP tests/treatment-table-handler.spec.ts — thiếu TEST_DB=1 ' +
            '(cần seed 処置行 介護 jihi_flg = 3 cho ngày test).\n' +
            `  TEST_DB=1 npx playwright test tests/treatment-table-handler.spec.ts`,
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 処置行 (jihi_flg = 3) cho ngày test')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — thao tác trên lưới 処置 (行追加 / 行削除 / focusedCell)', () => {
    let page: Page
    let step: () => Promise<void>

    /**
     * Bảo đảm khối THÁNG HIỆN HÀNH (nơi dòng seed nằm) đã mount. Lưới virtualize
     * các tháng lịch sử nên chỉ dòng trong khung nhìn mới có mặt trong DOM.
     */
    async function ensureBottomMounted() {
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
    }

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    ryoCells(page).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
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

    /** Dòng phải CÓ trên lưới, trả về `GridRow` (key dùng để dựng locator ô). */
    async function mustFindRow(...keys: readonly string[]): Promise<GridRow> {
        await ensureBottomMounted()
        const row = findRow(await currentMonthRows(page), ...keys)
        expect(
            row,
            `không thấy dòng 「${keys.join(' + ')}」 trên lưới — seed hỏng hoặc màn hình đang ` +
                `mở tháng khác (TEST_TRT_DT = ${TRT_DT})`,
        ).toBeDefined()
        return row!
    }

    /**
     * Ô 療法・処置 của MỘT dòng cụ thể (`ryoCells` ở trên là của mọi dòng). Chỉ số
     * cột `|2` = RegiCol.ryo — giữ ở đúng một chỗ để đổi thứ tự cột không phải đi
     * lùng chuỗi literal rải khắp file.
     */
    const ryoCell = (row: GridRow) => page.locator(`[data-grid-cell="${row.key}|2"]`)

    /** Đặt con trỏ (focusedCell) vào ô 療法・処置 của một dòng. */
    async function focusRyoCell(row: GridRow) {
        await ryoCell(row).click()
        await step()
    }

    /** Menu chuột phải của lưới (row-context-menu.tsx: `role="menu"`). */
    const rowMenu = () => page.getByRole('menu')

    /**
     * Mở menu chuột phải TRÊN Ô ĐANG FOCUS. WinForm không dời CurrentCell khi bấm
     * chuột phải (frm203002.cs:3645-3690 đọc `hFG1.CurrentCellAddress`), nên phải
     * click trái đặt con trỏ TRƯỚC — đúng thao tác người dùng thật.
     */
    async function openRowMenuOn(row: GridRow) {
        await focusRyoCell(row)
        await ryoCell(row).click({ button: 'right' })
        await expect(rowMenu(), 'menu chuột phải của lưới không mở').toBeVisible()
        await step()
    }

    /** Nút F3 「チェック」 của FKeyBar — lọc theo nhãn để chắc chắn là lớp OFF. */
    const f3Button = () => page.locator('button[data-fkey="F3"]', { hasText: 'チェック' })

    /** Vùng CUỘN của panel 処置データチェック — mốc theo `role="region"` + nhãn của nó. */
    const checkList = () => page.getByRole('region', { name: CHECK_LIST_LABEL })

    /** scrollTop / chiều cao khung / chiều cao nội dung của vùng cuộn, đọc một lượt. */
    async function checkListMetrics(): Promise<{ top: number; view: number; content: number }> {
        return checkList().evaluate((el) => ({
            top: el.scrollTop,
            view: el.clientHeight,
            content: el.scrollHeight,
        }))
    }

    /**
     * scrollTop hiện tại. Cuộn chạy đồng bộ ngay trong lượt xử lý phím, nên mọi
     * assert đều bọc bằng `expect.poll` trên hàm này: chỉ chờ khi giá trị còn SAI,
     * chứ không chờ nó "đứng yên" (đứng yên là trạng thái mặc định trước khi phím
     * kịp tới ⇒ chờ kiểu đó vừa tốn một nhịp poll vừa che mất lỗi thật).
     */
    const scrollTop = () => checkList().evaluate((el) => el.scrollTop)

    /** Số dòng trên lưới có text chứa `key`. */
    async function rowCount(key: string): Promise<number> {
        await ensureBottomMounted()
        return (await currentMonthRows(page)).filter((r) => r.text.includes(txt(key))).length
    }

    test.beforeAll(async ({ browser }) => {
        // Seed TRƯỚC khi mở trình duyệt: lưới đọc MỘT lần lúc vào màn.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: INS_TRT_CD,
                trtSb: 0,
                trtPt: INS_PT,
                trtCnt: 1,
                jihiFlg: JIHI_FLG_HOKEN,
                dspTrt: INS_NM,
            },
            {
                trtCd: KAIGO_TRT_CD,
                trtSb: KAIGO_SB,
                trtPt: KAIGO_PT,
                trtCnt: 1,
                jihiFlg: JIHI_FLG_KAIGO,
                dspTrt: KAIGO_NM,
            },
        ])

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // SanteiConfirmDialog đến CHẬM và đè lên mọi click (Rule 14). Bấm No —
        // Yes lại kéo theo カルテ記載選択 (Rule 14.1).
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 30 },
        )

        // 処置データチェック (一括) — trả danh sách lỗi dựng sẵn cho TC-8..TC-11 (BẪY 6).
        // Cài từ beforeAll: không testcase nào khác bấm F3/F8 nên route này không
        // che khuất đường thật của ai cả.
        await page.route(CHECK_URL, async (route: Route) => {
            const errors = Array.from({ length: STUB_ERROR_ROWS }, (_, i) => ({
                info: `【E2E】チェックメッセージ ${i + 1} 行目`,
            }))
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, data: { hasErrors: true, errors } }),
            })
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await page?.close()
        // Spec KHÔNG bấm F9 nên dòng seed giữ nguyên disp_no >= 9000 → một đường dọn
        // là đủ (khác tooth-extraction, nơi F9 chèn lại với disp_no từ 1).
        const n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        console.log(`afterAll: đã xoá ${n} dòng seed của (${PAT_NO}, ${TRT_DT})`)
    })

    test('TC-1 — lưới nạp đủ dòng seed và dòng 【介護保険一部負担金】 được dựng lại', async () => {
        // modSave.cs:2456-2500: dòng tổng KHÔNG nằm trong trn_trn, nó được dựng lại
        // từ jihi_flg = 3 mỗi lần nạp tháng. Seed chỉ có 2 dòng ⇒ dòng thứ 3 xuất
        // hiện được nghĩa là đường dựng lại (seedKaigoHutanRows) chạy.
        await mustFindRow(INS_NM)
        await mustFindRow(KAIGO_KEY)
        await mustFindRow(KAIGO_LABEL)

        // frm203002.cs:5953-6010 — dòng tổng chèn tại `intKaigoMaxRow + 1`, tức NGAY
        // SAU dòng 介護 **CUỐI CÙNG** của ngày ⇒ phải dò bằng findLastIndex.
        // (Bản đầu dùng findIndex: trùng kết quả khi ngày chỉ có MỘT dòng 介護, nhưng
        // sai hẳn khi có nhiều — `--repeat-each` đã lộ ra đúng chỗ này.)
        const rows = await currentMonthRows(page)
        const iKaigo = lastIndexOfRow(rows, KAIGO_KEY)
        const iTotal = lastIndexOfRow(rows, KAIGO_LABEL)
        expect(
            iTotal,
            `dòng 【${KAIGO_LABEL}】 phải nằm ngay sau dòng 介護 CUỐI của ngày (intKaigoMaxRow + 1)`,
        ).toBe(iKaigo + 1)
    })

    test('TC-2 — menu chuột phải mở ra với 行追加 / 行削除', async () => {
        // frm203002.Designer.cs:2932-2937 — hai mục cuối của contextMenuStripSentaku.
        const row = await mustFindRow(INS_NM)
        await openRowMenuOn(row)

        await expect(rowMenu().getByRole('button', { name: '行追加' })).toBeVisible()
        await expect(rowMenu().getByRole('button', { name: '行削除' })).toBeVisible()

        await page.keyboard.press('Escape')
        await expect(rowMenu()).toBeHidden()
    })

    test('TC-3 — 行追加 chèn MỘT dòng trống ngay trên dòng đang focus', async () => {
        // frm203002.cs:3700-3806 AddRow() — chèn tại vị trí con trỏ, đẩy dòng hiện
        // tại xuống. Đếm theo TỔNG số dòng, không mốc theo chỉ số (BẪY 1).
        const before = (await currentMonthRows(page)).length
        const row = await mustFindRow(INS_NM)
        await openRowMenuOn(row)
        await rowMenu().getByRole('button', { name: '行追加' }).click()

        await expect
            .poll(async () => (await currentMonthRows(page)).length, {
                message: '行追加 phải làm lưới nhiều hơn đúng 1 dòng',
                timeout: 10_000,
            })
            .toBe(before + 1)

        // Dọn lại bằng Delete để các TC sau xuất phát từ lưới sạch — dòng trống vừa
        // chèn đang là dòng focus nên Delete rơi đúng vào nó.
        await page.keyboard.press('Delete')
        await expect
            .poll(async () => (await currentMonthRows(page)).length, {
                message: 'Delete phải trả lưới về số dòng ban đầu',
                timeout: 10_000,
            })
            .toBe(before)
    })

    /**
     * ─── TC-4 / TC-5: bug 「xoá cả cụm」 đã khắc phục ─────────────────────────
     * Đây là 2 testcase canh đúng lỗi vừa sửa (commit c0fa166e). Trước bản sửa:
     *   · TC-4 đỏ — xoá 599 làm dòng tổng biến mất theo;
     *   · TC-5 đỏ — 行削除 trên dòng tổng không có tác dụng gì.
     */
    test('TC-4 — xoá dòng 599 KHÔNG kéo theo 【介護保険一部負担金】 (DeleteRow không gọi KaigoHutanSet)', async () => {
        const kaigoRow = await mustFindRow(KAIGO_KEY)
        await openRowMenuOn(kaigoRow)
        await rowMenu().getByRole('button', { name: '行削除' }).click()

        // 599 không phải 部位病名行 ⇒ KHÔNG có confirm 「同一部位の処置を全て削除します」
        // (frm203002.cs:3853-3863 chỉ hỏi khi linekbn == "1").
        await expect(
            page.getByText('同一部位の処置を全て削除します'),
            'xoá một 処置行 thường không được hỏi confirm xoá theo cụm',
        ).toHaveCount(0)

        await expect
            .poll(() => rowCount(KAIGO_KEY), {
                message: '行削除 phải xoá đúng dòng 599 đang focus',
                timeout: 10_000,
            })
            .toBe(0)

        // ĐIỂM MẤU CHỐT — frm203002.cs:5787 là chỗ DUY NHẤT gọi KaigoHutanSet, và
        // DeleteRow không gọi nó ⇒ dòng tổng phải ĐỨNG NGUYÊN.
        expect(
            await rowCount(KAIGO_LABEL),
            `xoá dòng 599 mà 【${KAIGO_LABEL}】 cũng biến mất ⇒ web đang xoá theo CỤM. ` +
                'WinForm để lại dòng tổng (DeleteRow không gọi KaigoHutanSet).',
        ).toBe(1)

        // Hàng xóm 保険 không được đụng tới.
        expect(await rowCount(INS_NM), 'dòng 歯科初診料 không liên quan mà bị xoá lây').toBe(1)
    })

    test('TC-5 — 行削除 xoá được RIÊNG dòng 【介護保険一部負担金】 (linekbn 30 không bị chặn)', async () => {
        // frm203002.cs:3843-3848 chỉ từ chối linekbn 99 và dòng 日計; linekbn 30
        // xoá bình thường như mọi dòng khác.
        const totalRow = await mustFindRow(KAIGO_LABEL)
        await openRowMenuOn(totalRow)
        await rowMenu().getByRole('button', { name: '行削除' }).click()

        await expect
            .poll(() => rowCount(KAIGO_LABEL), {
                message:
                    `行削除 trên dòng 【${KAIGO_LABEL}】 không có tác dụng. WinForm cho xoá ` +
                    'riêng lẻ dòng này (chỉ linekbn 99 / 日計行 mới bị từ chối).',
                timeout: 10_000,
            })
            .toBe(0)

        expect(await rowCount(INS_NM), 'xoá dòng tổng làm mất luôn dòng 歯科初診料').toBe(1)
    })

    test('TC-6 — dòng đã xoá KHÔNG mọc lại khi nạp lại màn hình đã có 介護 trở lại', async () => {
        // Xoá ở TC-4/TC-5 mới chỉ nằm trong `currentRows` (chưa F9) ⇒ nạp lại là
        // đọc lại từ trn_trn: 2 dòng seed còn nguyên và dòng tổng được dựng lại
        // (modSave.cs:2456-2500). Đây là mốc chứng minh spec KHÔNG ghi DB.
        await openTreatmentScreen()

        expect(await rowCount(KAIGO_KEY), 'dòng 599 seed phải còn trong DB (spec không bấm F9)').toBe(
            1,
        )
        expect(await rowCount(INS_NM), 'dòng 歯科初診料 seed phải còn trong DB').toBe(1)
        expect(
            await rowCount(KAIGO_LABEL),
            `nạp lại tháng phải dựng lại 【${KAIGO_LABEL}】 từ jihi_flg = 3`,
        ).toBe(1)
    })

    test('TC-7 — 行削除 tác động lên Ô ĐANG VÀNG, không phải dòng vừa bấm chuột phải', async () => {
        // WinForm: DataGridView KHÔNG dời CurrentCell khi bấm chuột phải;
        // grdRegi_MouseUp (frm203002.cs:3645-3690) chỉ bật/tắt mục menu rồi
        // DeleteRow đọc `hFG1.CurrentCellAddress`. Web khớp: handleRowContextMenu
        // không đụng focusedCell.
        const insRow = await mustFindRow(INS_NM)
        const totalRow = await mustFindRow(KAIGO_LABEL)

        // Con trỏ đặt ở dòng 歯科初診料 …
        await focusRyoCell(insRow)
        // … nhưng bấm chuột phải ở dòng tổng, KHÔNG click trái trước.
        await ryoCell(totalRow).click({ button: 'right' })
        await expect(rowMenu()).toBeVisible()
        await rowMenu().getByRole('button', { name: '行削除' }).click()

        await expect
            .poll(() => rowCount(INS_NM), {
                message:
                    '行削除 phải xoá dòng ĐANG FOCUS (歯科初診料), không phải dòng vừa bấm chuột phải',
                timeout: 10_000,
            })
            .toBe(0)
        expect(
            await rowCount(KAIGO_LABEL),
            'dòng vừa bấm chuột phải KHÔNG được xoá — chuột phải không dời con trỏ',
        ).toBe(1)
    })

    /**
     * ─── TC-8..TC-11: phím ＋ / － của panel 処置データチェック ────────────────
     * Bug commit `9ace5375`: panel in hướng dẫn 「＋、－ キーで表示切替」 mà không có
     * handler nào (xem đầu file). Cả 4 TC dùng CHUNG một lần mở panel, chạy nối
     * tiếp — TC-8 mở, TC-9/TC-10 thao tác, TC-11 đóng.
     */
    test('TC-8 — F3 mở panel 処置データチェック, danh sách lỗi dài hơn khung nhìn', async () => {
        // Nạp lại màn để xuất phát từ lưới sạch (TC-4/5/7 đã xoá dòng trong bộ nhớ,
        // chưa F9 nên DB còn nguyên — chính là điều TC-6 vừa chứng minh).
        await openTreatmentScreen()

        await f3Button().click()
        await step()

        // Panel hiện + đúng dòng hướng dẫn của WinForm (customLabel29).
        await expect(
            page.getByText(SCROLL_HINT),
            'F3 phải mở panel 処置データチェック kèm dòng hướng dẫn ＋/－',
        ).toBeVisible()

        const m = await checkListMetrics()
        expect(
            m.content,
            'tiền đề của TC-9: danh sách lỗi phải CAO HƠN khung nhìn thì mới có gì để cuộn',
        ).toBeGreaterThan(m.view)
        expect(m.top, 'panel vừa mở phải đứng ở đầu danh sách').toBe(0)
    })

    test('TC-9 — ＋ cuộn xuống một trang, － cuộn ngược lại (SendKeys {PGDN}/{PGUP})', async () => {
        const before = await checkListMetrics()
        expect(before.top, 'TC-9 phải xuất phát từ đầu danh sách').toBe(0)

        // frm203002.cs:4815-4823 — Keys.Add ⇒ {PGDN} trên grdChek.
        await page.keyboard.press('NumpadAdd')
        await expect
            .poll(scrollTop, {
                message:
                    'nhấn ＋ mà danh sách không nhúc nhích ⇒ phím chưa được port ' +
                    '(frm203002_KeyDown:3289 → KeyFunc:4815)',
                timeout: 10_000,
            })
            .toBeGreaterThan(0)
        const afterPlus = await scrollTop()

        // "Một trang" của DataGridView = một khung nhìn, chừa lại một dòng chồng lấp.
        // Không chốt con số tuyệt đối (phụ thuộc chiều cao 1 dòng), chỉ chốt ĐỘ LỚN.
        expect(afterPlus, 'một lần ＋ không được nhảy quá một khung nhìn').toBeLessThanOrEqual(
            before.view,
        )
        expect(
            afterPlus,
            'một lần ＋ phải cuộn cỡ một trang, không phải vài pixel',
        ).toBeGreaterThan(before.view / 2)

        // frm203002.cs:4825-4833 — Keys.Subtract ⇒ {PGUP}.
        await page.keyboard.press('NumpadSubtract')
        await expect
            .poll(scrollTop, { message: '－ phải kéo danh sách trở lại đầu', timeout: 10_000 })
            .toBe(0)

        // Đã ở đỉnh mà nhấn tiếp thì đứng yên (WinForm: {PGUP} ở dòng đầu không làm gì).
        await page.keyboard.press('NumpadSubtract')
        await step()
        expect(await scrollTop(), '－ ở đầu danh sách không được cuộn quá đỉnh').toBe(0)
    })

    test('TC-10 — ＋ khi panel đang mở KHÔNG được mở editor ô (con trỏ ở lại lưới)', async () => {
        // KeyFunc trả focus về hFG1 và KHÔNG hề bắt đầu sửa ô nào. Web trước bản sửa
        // để handler gõ-để-sửa nuốt mất '+' ⇒ ô đang vàng mở editor với seed '+'.
        const row = await mustFindRow(KAIGO_KEY)
        const cell = ryoCell(row)
        const textBefore = txt((await cell.textContent()) ?? '')
        await focusRyoCell(row)

        await page.keyboard.press('NumpadAdd')
        await step()

        await expect(
            cell.locator('input'),
            'nhấn ＋ lúc panel mở mà ô 療法・処置 vào chế độ sửa ⇒ phím bị handler ' +
                'gõ-để-sửa nuốt (phải chặn ở capture phase)',
        ).toHaveCount(0)
        expect(txt((await cell.textContent()) ?? ''), 'nội dung ô 療法・処置 bị đổi').toBe(textBefore)

        // Và phím vẫn làm đúng việc của nó: cuộn panel.
        await expect
            .poll(scrollTop, {
                message: '＋ phải cuộn panel dù con trỏ đang đặt ở một ô của lưới',
                timeout: 10_000,
            })
            .toBeGreaterThan(0)
    })

    test('TC-11 — F3 lần 2 đóng panel, ＋ trở lại là phím thường của lưới', async () => {
        // KeyFunc chỉ chạy `if (PnlChek.Visible == true)`; panel đóng ⇒ phím rơi
        // xuống lưới đúng như mọi ký tự khác (DataGridView mở editor với ký tự vừa gõ).
        await f3Button().click()
        await expect(
            page.getByText(SCROLL_HINT),
            'F3 lần 2 phải đóng panel 処置データチェック',
        ).toBeHidden()

        const row = await mustFindRow(KAIGO_KEY)
        const cell = ryoCell(row)
        const textBefore = txt((await cell.textContent()) ?? '')
        await focusRyoCell(row)

        await page.keyboard.press('NumpadAdd')
        await expect(
            cell.locator('input'),
            'panel đã đóng ⇒ ＋ phải trả về cho lưới; nếu vẫn bị chặn nghĩa là handler ' +
                'capture còn sống sau khi panel tắt',
        ).toHaveCount(1)

        // Escape huỷ editor — ô phải nguyên vẹn (spec KHÔNG được làm bẩn lưới/DB).
        await page.keyboard.press('Escape')
        await expect(cell.locator('input')).toHaveCount(0)
        expect(txt((await cell.textContent()) ?? ''), 'Escape phải huỷ editor, giữ nguyên ô').toBe(
            textBefore,
        )
    })
})
