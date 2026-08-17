import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * チェック項目設定 mục 17 Ｐ部位分割 → dòng chia của panel 病検.
 *
 * Đây là mục DUY NHẤT của チェック項目設定 đổi được thứ nhìn thấy trên màn 診療入力:
 *  - 14 mục còn lại chỉ gate luật check ở BE (đã có unit test bên
 *    `CheckRulesChkPrmGateTests` / `CheckRulesOmissionPortTests`), không có biểu
 *    hiện nào trên UI ngoài nội dung lưới kết quả チェック.
 *  - Mục 18 Ｇ部位分割 thì legacy LƯU mà không đọc ở đâu cả (không tồn tại `SpritG`),
 *    nên không có gì để kiểm.
 *
 * ── Nguồn WinForm: `modByoken.SpritP` (INP/Lib/modByoken.cs:390-470) ─────────
 *  - :406   `bytChkPrm == 9` → return NGAY, không sinh dòng chia nào.
 *  - :410   vòng `for (i = 1; i <= 8)`, và HAI vùng đầu là 上顎 (bui 0-15) /
 *           下顎 (16-31), sáu vùng sau là vùng con.
 *  - :447   `bytChkPrm == 1 && (i == 1 || i == 2)` → `continue`, tức ６分割 bỏ
 *           đúng cặp cả-hàm ở đầu.
 *  - else   mọi giá trị khác (kể cả 0 của dữ liệu migrate) rơi vào ８分割.
 *  - Dòng 歯垢 GỐC (không chia) do NGƯỜI GỌI viết (:270-286), nên nó còn kể cả
 *    khi chọn 「しない」 — chỉ các dòng chia mới bị gate.
 *
 * ── Vì sao là file riêng, không nhét vào inp-p1-ported-dialogs.spec.ts ───────
 * Đã thử: nhóm này từng là mục C của file đó và FLAKY — sau 13 testcase serial
 * phía trước, `page.goto` đầu tiên của nhóm chết với
 * 「Target page, context or browser has been closed」 rồi pass khi Playwright
 * retry cả khối. Nhóm này ghi THẬT chk_prm rồi `goto` lại màn 3 lần, tức là một
 * hành trình riêng chứ không phải "nội dung một dialog", nên tách ra là đúng
 * chỗ — cùng lý do Ｓｔｅｐ編集 đã tách khỏi file đó (2026-08-14).
 *
 * Giá phải trả là 1 lượt login nữa (Rule 10.1, ~10 lượt/giờ). Chạy `--retries=0`
 * nếu đang sát hạn mức: retry chạy lại cả khối serial ⇒ thêm một lần login.
 *
 * ⚠️ GHI THẬT `chk_prm` (cấu hình TOÀN PHÒNG KHÁM). Cần `TEST_ALLOW_SAVE=1` và
 * `TEST_DB=1`; giá trị gốc mục 17 được đọc từ DB lúc đầu và trả lại ở `afterAll`
 * (không phải ở testcase cuối — serial sẽ SKIP nó nếu có cú đỏ ở giữa).
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

const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'
const GRID_LOAD_TIMEOUT = 60_000

const CHK_PRM_URL = /\/tenant\/chk-prm(\?|$)/
const DIAG_HISTORY_URL = /\/tenant\/patients\/\d+\/diagnosis-history(\?|$)/

const MENU_OPTIONS = '9 オプション'
const MENU_CHECK_ITEM = '1 チェック項目設定'

/** CheckItemSettings.ItemNo.PBuiSplit + nhãn nguyên văn của mục đó. */
const CHK_P_BUI_SPLIT_NO = 17
const CHK_P_BUI_SPLIT_LABEL = 'Ｐ部位分割'

/** cd_val của mst_cod 64. SpritP đọc THÔ giá trị này (`runtimeValue`, không phải `value`). */
const BUI_SPLIT_SIX = 1
const BUI_SPLIT_EIGHT = 2
const BUI_SPLIT_NONE = 9

/** MouthConstants.AdultBuiCount. */
const BUI_COLUMN_COUNT = 32

/**
 * 8 vùng của SpritP, ĐÚNG thứ tự vòng lặp `for (i = 1; i <= 8)` (modByoken.cs:410-444).
 * Chỉ số 0-based trên vector bui[32], hai đầu đều tính (inclusive).
 */
const P_SPLIT_REGIONS = [
    { name: '上顎', start: 0, end: 15 },
    { name: '下顎', start: 16, end: 31 },
    { name: '上顎右', start: 0, end: 4 },
    { name: '上顎中', start: 5, end: 10 },
    { name: '上顎左', start: 11, end: 15 },
    { name: '下右', start: 16, end: 20 },
    { name: '下中', start: 21, end: 26 },
    { name: '下左', start: 27, end: 31 },
] as const
/** Số vùng cả-hàm ở ĐẦU danh sách — đúng phần ６分割 bỏ đi. */
const P_SPLIT_WHOLE_JAW_COUNT = 2

/** 病名コード của 歯垢 (Ｐ) / 歯石 (Ｇ) — chỉ hai mã này mới sinh dòng chia. */
const PLAQUE_DIS_CDS = [103, 104]

/**
 * Dòng chia được tô `bg-[#ffe0c0]` ở ô № (treatment-side-panel.tsx:847) và màu
 * này KHÔNG dùng ở đâu khác trong app ⇒ đếm nó = đếm đúng số dòng chia.
 *
 * Dòng 当月 (#ff80ff) đè lên nó (WinForm modByoken.cs:488 vs 293), nên testcase
 * chỉ đúng khi bản ghi 歯垢 KHÔNG thuộc tháng hiện hành — TC-SPLIT-0 kiểm điều
 * này và skip kèm lý do nếu ngược lại.
 */
const SPLIT_ROW_CELL = '[class*="ffe0c0"]'

const BYOU_ROW_SEL = 'div[class*="grid-cols-[30px_270px_1fr]"][class*="cursor-pointer"]'

/** Một dòng của `GET /tenant/patients/{patNo}/diagnosis-history`. */
interface DiagnosisHistoryItem {
    disCd?: (number | string)[] | null
    bui?: (number | string)[] | null
    maxDate: string
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — mục 17 Ｐ部位分割 điều khiển dòng chia panel 病検', () => {
    let page: Page
    let step: () => Promise<void>
    let rowMenu: Locator
    let chkDialog: Locator
    let sidePanel: Locator

    /** bui[32] của bản ghi 歯垢 mới nhất — đọc từ CHÍNH payload panel dùng. */
    let plaqueBui: number[] | null = null
    /** Giá trị gốc mục 17, đọc từ DB, trả lại ở afterAll. */
    let splitBefore: number | null = null

    // ── Helper ───────────────────────────────────────────────────────────────

    async function appeared(locator: Locator, timeout: number): Promise<boolean> {
        return locator
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    /**
     * Vét hộp tự bung sau khi lưới nạp: 「〜を算定しますか？」 (bấm No — Yes lại đẻ
     * hộp khác) và 「カルテ記載選択」 (F10 戻る — huỷ, không ghi). Bỏ sót là mọi F-key
     * bị modal-dialog guard của fkey-scope-provider nuốt, F11 im lặng không mở.
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

    /** Về màn 診療入力 và chờ header 患者情報 dựng xong. Thử lại một lần nếu trượt. */
    async function backToEntry() {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                    waitUntil: 'domcontentloaded',
                })
                await expect(page.getByText('合計:').first()).toBeVisible({
                    timeout: GRID_LOAD_TIMEOUT,
                })
                return
            } catch (e) {
                if (attempt === 2) throw e
            }
        }
    }

    /** Mở menu 選択 bằng NÚT F11 — sau `goto` thì `keyboard.press` rơi vào khoảng không. */
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

    /** F11 → hover 「9 オプション」 → click mục con. Submenu mở bằng HOVER. */
    async function openChkDialog() {
        if (await chkDialog.isVisible().catch(() => false)) return
        await openMenu()
        await rowMenu.getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub, 'submenu 9 オプション không mở ra').toBeVisible({ timeout: 10_000 })
        await sub.getByRole('button', { name: MENU_CHECK_ITEM, exact: true }).click()
        await expect(chkDialog, 'không mở được チェック項目設定').toBeVisible({ timeout: 30_000 })
    }

    /** Hàng của một mục = CHA của phần tử mang đúng nhãn đó (Rule 12.1). */
    const splitCombo = () =>
        chkDialog.getByText(CHK_P_BUI_SPLIT_LABEL, { exact: true }).locator('..').getByRole('combobox')

    /** Chọn mục theo NHÃN (thứ tự do server quyết định). Listbox Radix mở qua PORTAL. */
    async function pickOptionByText(combo: Locator, text: string) {
        await combo.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10_000 })
        await listbox.getByRole('option').filter({ hasText: text }).first().click()
        await expect(listbox).toBeHidden({ timeout: 10_000 })
        await expect(combo).toContainText(text)
    }

    async function readChkPrmParam(no: number): Promise<number | null> {
        return withDb(async (c) => {
            const r = await c.query<{ v: number | null }>(
                `SELECT param_${no} AS v FROM view_chk_prm_active ORDER BY updated_at DESC LIMIT 1`,
            )
            const v = r.rows[0]?.v
            return v === undefined || v === null ? null : Number(v)
        })
    }

    /** Số vùng (tính từ `from`) có ít nhất một răng, trên `plaqueBui`. */
    function regionsWithTeeth(from: number): number {
        let n = 0
        for (let i = from; i < P_SPLIT_REGIONS.length; i++) {
            const { start, end } = P_SPLIT_REGIONS[i]!
            for (let j = start; j <= end; j++) {
                if (plaqueBui![j] !== 0) {
                    n++
                    break
                }
            }
        }
        return n
    }

    /** Mở panel 病検 và chờ lưới có dòng. */
    async function openByoukenPanel() {
        await drainBlockingDialogs()
        await page.getByRole('button', { name: '病検', exact: true }).click()
        await expect(sidePanel.locator(BYOU_ROW_SEL).first(), 'panel 病検 không có dòng').toBeVisible(
            { timeout: GRID_LOAD_TIMEOUT },
        )
    }

    /**
     * Đặt mục 17 = `optionText`, F9 ghi THẬT, nạp lại màn rồi đếm dòng chia.
     *
     * Phải nạp lại: `uniqueByouItems` là useMemo phụ thuộc giá trị mục 17, và
     * cache chk-prm chỉ bị invalidate sau khi lưu — nạp lại là cách chắc chắn
     * panel đọc đúng giá trị vừa ghi.
     */
    async function applySplitAndCount(optionText: string): Promise<number> {
        await openChkDialog()
        await pickOptionByText(splitCombo(), optionText)

        const putRes = page.waitForResponse(
            (r) => CHK_PRM_URL.test(r.url()) && r.request().method() === 'PUT',
            { timeout: 60_000 },
        )
        await chkDialog.getByRole('button', { name: 'F9 登録' }).click()
        expect((await putRes).status(), 'PUT chk-prm phải 2xx').toBeLessThan(300)
        await expect(chkDialog).toBeHidden({ timeout: 30_000 })

        await backToEntry()
        await openByoukenPanel()
        return page.locator(SPLIT_ROW_CELL).count()
    }

    // ── Setup ────────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo để cả file dùng chung MỘT lần login. `browser.newPage()`
        // không kế thừa `use` của config nên phải truyền tay ignoreHTTPSErrors.
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
        chkDialog = page.getByRole('dialog').filter({ hasText: 'チ ェ ッ ク 項 目 設 定' })
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
    })

    test.afterAll(async () => {
        // Trả nguyên trạng ở afterAll, KHÔNG ở testcase cuối: serial skip mọi
        // testcase sau một cú đỏ, dọn dẹp sẽ skip theo và cấu hình phòng khám
        // nằm lại ở giá trị thử.
        if (ALLOW_SAVE && dbEnabled && splitBefore !== null) {
            const now = await readChkPrmParam(CHK_P_BUI_SPLIT_NO).catch(() => null)
            if (now !== null && now !== splitBefore) {
                await withDb(async (c) => {
                    await c.query(
                        `UPDATE chk_prm SET param_${CHK_P_BUI_SPLIT_NO} = $1 WHERE deleted_at IS NULL`,
                        [splitBefore],
                    )
                }).catch((e) =>
                    console.log(
                        `afterAll: trả param_${CHK_P_BUI_SPLIT_NO} về ${splitBefore} THẤT BẠI ` +
                            `(đang là ${now}) — KHÔI PHỤC THỦ CÔNG: ${(e as Error).message}`,
                    ),
                )
            }
        }
        await page?.close()
    })

    // ── Testcase ─────────────────────────────────────────────────────────────

    test('TC-SPLIT-0 — chốt giá trị gốc mục 17 + bui[32] của bản ghi 歯垢 mới nhất', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'ghi thật chk_prm mục 17 (cấu hình toàn phòng khám). Đặt TEST_ALLOW_SAVE=1 để chạy',
        )
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đọc/khôi phục giá trị gốc mục 17')

        // Chưa lưu bao giờ → mục 17 mặc định ６分割 (dspData, frm203044.cs:186).
        splitBefore = (await readChkPrmParam(CHK_P_BUI_SPLIT_NO)) ?? BUI_SPLIT_SIX

        // Đọc CHÍNH payload panel dùng, không dựng lại từ trn_trn: BE gộp nhiều
        // dòng thành một aggregate nên tự query SQL là đoán sai vector bui.
        const res = page.waitForResponse((r) => DIAG_HISTORY_URL.test(r.url()), {
            timeout: GRID_LOAD_TIMEOUT,
        })
        await backToEntry()
        const body = (await (await res).json()) as { data?: DiagnosisHistoryItem[] }

        const plaque = (body.data ?? [])
            .filter((i) => PLAQUE_DIS_CDS.includes(Number(i.disCd?.[0] ?? 0)))
            .sort((a, b) => new Date(b.maxDate).getTime() - new Date(a.maxDate).getTime())[0]

        skipWithReason(
            !plaque,
            `hồ sơ ${PAT_NO} không có 病名 歯垢/歯石 (${PLAQUE_DIS_CDS.join('/')}) ⇒ SpritP không ` +
                'có gì để chia. Đổi TEST_PAT_NO sang hồ sơ có Ｐ',
        )

        // Dòng thuộc tháng hiện hành bị tô #ff80ff đè lên #ffe0c0 ⇒ đếm sai.
        const plaqueMonth = plaque!.maxDate.slice(0, 7)
        skipWithReason(
            plaqueMonth === TRT_DT.slice(0, 7),
            `bản ghi 歯垢 (${plaque!.maxDate}) thuộc CHÍNH tháng đang test ⇒ màu 当月 đè lên màu ` +
                'dòng chia, không đếm được. Đổi TEST_TRT_DT sang tháng khác',
        )

        plaqueBui = (plaque!.bui ?? []).map(Number)
        expect(plaqueBui, 'bui phải đủ 32 ô').toHaveLength(BUI_COLUMN_COUNT)

        const six = regionsWithTeeth(P_SPLIT_WHOLE_JAW_COUNT)
        skipWithReason(
            six === 0,
            'bản ghi 歯垢 mới nhất không có răng nào ⇒ mọi giá trị mục 17 đều ra 0 dòng chia, ' +
                'testcase không phân biệt được gì',
        )
        console.log(
            `歯垢 ${plaque!.maxDate}, mục 17 gốc = ${splitBefore}: ６分割 sẽ ra ${six} dòng, ` +
                `８分割 ra ${regionsWithTeeth(0)} dòng`,
        )
        await step()
    })

    test('TC-SPLIT-NONE — 「しない」 KHÔNG sinh dòng chia nào (modByoken.cs:406)', async () => {
        skipWithReason(!plaqueBui, 'TC-SPLIT-0 chưa lấy được bui')
        expect(
            await applySplitAndCount('しない'),
            'SpritP return TRƯỚC vòng chia ⇒ còn đúng dòng 歯垢 gốc (do người gọi viết), ' +
                'không dòng chia nào',
        ).toBe(0)
        await step()
    })

    test('TC-SPLIT-SIX — 「６分割」 bỏ đúng cặp 上顎/下顎 (modByoken.cs:447)', async () => {
        skipWithReason(!plaqueBui, 'TC-SPLIT-0 chưa lấy được bui')
        expect(
            await applySplitAndCount('６分割'),
            '６分割 chỉ lấy 6 vùng con — có 上顎/下顎 là `continue` ở :447 bị bỏ',
        ).toBe(regionsWithTeeth(P_SPLIT_WHOLE_JAW_COUNT))
        await step()
    })

    test('TC-SPLIT-EIGHT — 「８分割」 thêm 上顎/下顎 vào trước 6 vùng con', async () => {
        skipWithReason(!plaqueBui, 'TC-SPLIT-0 chưa lấy được bui')
        const eight = await applySplitAndCount('８分割')

        expect(eight, '８分割 = 6 vùng con + các vùng cả-hàm có răng').toBe(regionsWithTeeth(0))
        expect(
            eight,
            'dữ liệu này phải có ít nhất một hàm có răng, nếu không TC-SPLIT-EIGHT không khác ' +
                'TC-SPLIT-SIX và chẳng kiểm được gì',
        ).toBeGreaterThan(regionsWithTeeth(P_SPLIT_WHOLE_JAW_COUNT))
        await step()
    })

    test('TC-SPLIT-RUNTIME — panel đọc `runtimeValue`, không đọc `value`', async () => {
        skipWithReason(!plaqueBui, 'TC-SPLIT-0 chưa lấy được bui')

        // Ghi THÔ 0 vào param_17 — trạng thái của dữ liệu migrate. Hai cách đọc
        // của WinForm tách nhau ở đúng đây (CheckItemSettings.Unset):
        //   · dspData (frm203044.cs:174-181) ép 0 → する ⇒ combo hiện ６分割.
        //   · ModCommon.GetChkPrm (modCommon.cs:364-379) giữ 0 ⇒ SpritP rơi vào
        //     nhánh `else` = ８分割.
        // Nếu panel đọc `value` thay vì `runtimeValue` thì nó ra 6 dòng, sai.
        await withDb(async (c) => {
            await c.query(
                `UPDATE chk_prm SET param_${CHK_P_BUI_SPLIT_NO} = 0 WHERE deleted_at IS NULL`,
            )
        })
        expect(await readChkPrmParam(CHK_P_BUI_SPLIT_NO), 'chưa ghi được 0 vào param_17').toBe(0)

        await backToEntry()
        await openByoukenPanel()
        expect(
            await page.locator(SPLIT_ROW_CELL).count(),
            '0 thô phải ra ８分割 — panel đang đọc `value` (đã ép thành する) chứ không phải ' +
                '`runtimeValue`',
        ).toBe(regionsWithTeeth(0))

        // Và combo VẪN hiện ６分割 cho cùng dữ liệu đó — đúng dspData.
        await openChkDialog()
        await expect(
            splitCombo(),
            'dspData phải hiện 0 thành ６分割, dù engine đọc nó là ８分割',
        ).toContainText('６分割')
        await chkDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(chkDialog).toBeHidden({ timeout: 10_000 })
        await step()
    })
})
