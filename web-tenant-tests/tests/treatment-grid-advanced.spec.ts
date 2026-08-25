import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — LƯỚI 処置: LUẬT NÂNG CAO (`/treatments/{patNo}`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEC NÀY LÀ GÌ
 * ═══════════════════════════════════════════════════════════════════════════
 * Nửa web của cặp parity thứ hai. Nửa kia là
 * `fla-ui-tests/.../Tests/TreatmentGrid/TreatmentGridAdvancedTests.cs`, cùng số hiệu
 * TC-A1…TC-A5.
 *
 * Bộ CƠ BẢN (`treatment-grid-basic.spec.ts`) đã khớp parity hoàn toàn — 7/7 bên
 * WinForm, 8/8 bên web. Bộ này đi tiếp vào những luật mà đọc source KHÔNG kết luận
 * chắc được, vì chúng rẽ theo `linekbn` của dòng đang đứng — cột ẨN, giao diện không
 * hiện ra.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÁP ÁN — ĐO THẬT TRÊN WINFORM 2026-08-25
 * ═══════════════════════════════════════════════════════════════════════════
 * Bệnh nhân 10, ngày 2026-08-03, 合計 409 点, lưới 16 dòng. Mọi con số dưới đây lấy
 * từ máy thật (probe `Probe_AdvancedGridRules`), KHÔNG suy từ source:
 *
 *   A1  Delete trên 日計行       → TỪ CHỐI, im lặng     (16 dòng → 16, 409 → 409)
 *   A2  Delete trên 部位病名行   → hỏi 「同一部位の処置を全て削除します。よろしいですか?」
 *                                 trả lời 「いいえ」 thì huỷ sạch (16 → 16, 409 → 409)
 *   A3  Insert trên 日計行       → CHÈN ĐƯỢC            (16 dòng → 17)
 *   A4  → từ ô 日                → sang ô 部位 (MỘT ô)
 *   A5  Enter trên ô 部位        → mở 部位選択
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐIỂM ĐÁNG CANH NHẤT: A1 và A3 BẤT ĐỐI XỨNG
 * ═══════════════════════════════════════════════════════════════════════════
 * Cùng một dòng 日計: Delete bị chặn, Insert lại chạy. Không phải lỗi — hai hàm kiểm
 * hai thứ khác nhau:
 *   · `DeleteRow` (frm203002.cs:3843-3846) từ chối khi con trỏ đứng ĐÚNG trên 日計行
 *     của ngày đó (`ModCommon.pNikkei[day] == CurrentCellAddress.Y`);
 *   · `AddRow` (:3714) CHỈ từ chối `linekbn == "99"` (dòng tháng cũ), không xét 日計行
 *     — nó chèn dòng mới TẠI vị trí con trỏ, đẩy 日計行 xuống, rồi dời chỉ số `pNikkei`
 *     theo (:3737-3745).
 *
 * Bản web rất dễ "chuẩn hoá" hai đường này về một luật (kiểu: dòng 日計 thì cấm cả
 * thêm lẫn xoá). Làm vậy là LỆCH, và TC-A3 sinh ra để canh đúng chỗ đó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG SEED, KHÔNG GHI DB
 * ═══════════════════════════════════════════════════════════════════════════
 * Không bấm F9 登録, không seed `trn_trn` ⇒ không cần `TEST_DB=1`. TC-A2 trả lời
 * 「いいえ」 nên không xoá gì; TC-A3 chèn một dòng trống rồi dọn lại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY / cần biết
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `PAT_NO` và `TRT_DT` PHẢI khớp `patient` bên `testsettings.local.json` (FlaUI).
 *     Hai bên đo hai bệnh nhân/ngày khác nhau thì mọi phép so đều vô nghĩa — đã vấp
 *     thật và mất nhiều vòng chạy.
 *  2. Dòng 部位病名行 nhận ra qua ô 点 là dấu gạch ngang. WinForm ghi 「－」 (U+FF0D,
 *     ĐỦ chiều rộng) nhưng sau NFKC nó thành 「-」 — so với 「－」 là KHÔNG BAO GIỜ khớp.
 *     (Probe bên FlaUI đã vấp đúng chỗ này.)
 *  3. Dòng 日計 bên web nằm ở FOOTER và KHÔNG có ô `data-grid-cell|2` — đây là chênh
 *     lệch DOM đã ghi nhận ở `treatment-grid-basic.spec.ts` TC-1. Vì thế TC-A1/TC-A3
 *     mốc vào `data-footer-cell`, không mốc vào `|2`.
 *  4. `SanteiConfirmDialog` 「〜を算定しますか？」 và 「カルテ記載選択」 bung ra lúc lưới nạp
 *     xong và che mọi thứ ⇒ `addLocatorHandler` (GUIDELINE Rule 14/14.1).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/treatment-grid-advanced.spec.ts
 *
 * `describe.serial` + MỘT page ở `beforeAll` ⇒ cả file login MỘT lần (GUIDELINE
 * Rule 19). Chạy CẢ FILE, đừng `-g` một testcase lẻ.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** PHẢI khớp `patient.patNo` bên testsettings.local.json (FlaUI). Xem BẪY 1. */
const PAT_NO = process.env.TEST_PAT_NO ?? '10'

/** PHẢI khớp `patient.trtDate` bên testsettings.local.json (FlaUI). Xem BẪY 1. */
const TRT_DT = process.env.TEST_TRT_DT ?? '2026-08-03'

/** Chỉ số cột — `RegiCol` (frm203002.cs:158-169) = `RegiCol` bản web. */
const COL_DAY = 0
const COL_BUI = 1
const COL_RYO = 2
const COL_TEN = 3

/** Ô vàng = ô đang giữ con trỏ (`focusedCell`) — treatment-entry-shared.ts:387. */
const FOCUS_CLASS = 'bg-[#ffffc0]'

const GRID_LOAD_TIMEOUT = 60_000

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

const ryoCells = (page: Page) => page.locator(`[data-grid-cell$="|${COL_RYO}"]`)

interface GridRow {
    key: string
    ryo: string
    ten: string
}

/** rowKey dòng THÁNG CŨ — `${recordIndex}-${itemIndex}`; tháng hiện hành mang uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — lưới 処置: luật nâng cao (parity với WinForm grdRegi)', () => {
    let page: Page
    let step: () => Promise<void>

    async function gridRows(): Promise<GridRow[]> {
        const raw = await ryoCells(page).evaluateAll(
            (els, col) =>
                els.map((e) => {
                    const key = (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')
                    const ten =
                        document.querySelector(`[data-grid-cell="${CSS.escape(key)}|${col}"]`)
                            ?.textContent ?? ''
                    return { key, ryo: e.textContent ?? '', ten }
                }),
            COL_TEN,
        )
        return raw.map((r) => ({ key: r.key, ryo: txt(r.ryo), ten: txt(r.ten) }))
    }

    async function currentMonthRows(): Promise<GridRow[]> {
        return (await gridRows()).filter((r) => !HISTORY_KEY_RE.test(r.key))
    }

    const cell = (key: string, col: number) => page.locator(`[data-grid-cell="${key}|${col}"]`)

    async function focusCell(key: string, col: number) {
        await cell(key, col).click()
        await step()
    }

    async function focusedCellId(): Promise<string | null> {
        return page.evaluate((cls) => {
            const el = document.querySelector(`[data-grid-cell].${CSS.escape(cls)}`)
            return el?.getAttribute('data-grid-cell') ?? null
        }, FOCUS_CLASS)
    }

    /**
     * 合計点数 ở header — mốc DUY NHẤT không phụ thuộc vị trí cuộn.
     * Cùng cách đọc với `headerTotal` trong tests/kasan-buttons.spec.ts:163-169.
     */
    async function readTotal(): Promise<number | null> {
        const raw = await page
            .getByText(/合計:\s*[\d,]+\s*点/)
            .first()
            .innerText()
            .catch(() => null)
        if (raw === null) return null
        const m = raw.replace(/\s+/g, ' ').match(/合計:\s*([\d,]+)\s*点/)
        return m ? Number(m[1]!.replace(/,/g, '')) : null
    }

    /** Số dòng 処置 của tháng hiện hành (không tính footer 日計 — nó không có ô `|2`). */
    async function rowCount(): Promise<number> {
        return (await currentMonthRows()).length
    }

    /**
     * Dòng 部位病名行 — ô 点 là dấu gạch ngang. Xem BẪY 2: sau NFKC 「－」 thành 「-」.
     */
    function isBuiRow(r: GridRow): boolean {
        return r.ten === '-' || r.ten === '－'
    }

    /** Ô footer 日計 của ngày cuối — dòng 日計 bên web nằm ở footer (BẪY 3). */
    const footerDayCell = () => page.locator('[data-footer-cell$=":footer-day"]').last()

    async function openTreatmentScreen() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(
            ryoCells(page).first(),
            'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await closeDialogs(page)
    }

    test.beforeAll(async ({ browser }) => {
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
            { times: 30 },
        )
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

        await openTreatmentScreen()
        console.log(`beforeAll: bệnh nhân ${PAT_NO}, ngày ${TRT_DT}, 合計 = ${await readTotal()}`)
    })

    test.afterAll(async () => {
        // Không seed, không bấm F9 ⇒ không có gì để dọn.
        await page?.close()
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A1 — Delete bị TỪ CHỐI trên 日計行
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-A1 — Delete trên 日計行 bị TỪ CHỐI, im lặng (frm203002.cs:3843-3846)', async () => {
        const footer = footerDayCell()
        await expect(footer, 'không thấy dòng footer 日計 nào').toBeAttached()

        const rowsBefore = await rowCount()
        const totalBefore = await readTotal()
        console.log(`TC-A1: trước — ${rowsBefore} dòng, 合計 = ${totalBefore}`)

        await footer.click()
        await step()
        await page.keyboard.press('Delete')
        await step()

        const rowsAfter = await rowCount()
        const totalAfter = await readTotal()
        console.log(`TC-A1: sau — ${rowsAfter} dòng, 合計 = ${totalAfter}`)

        // WinForm: DeleteRow trả về NGAY khi con trỏ đứng đúng trên 日計行 của ngày đó
        // (ModCommon.pNikkei[day] == CurrentCellAddress.Y). Không hộp thoại, không thông
        // báo — im lặng tuyệt đối. Đo thật: 16 dòng → 16, 409 → 409.
        expect(rowsAfter, `Delete trên 日計行 không được xoá dòng nào: ${rowsBefore} → ${rowsAfter}`).toBe(
            rowsBefore,
        )
        expect(totalAfter, `…và 合計点数 phải y nguyên: ${totalBefore} → ${totalAfter}`).toBe(totalBefore)

        // Im lặng: không được bung hộp thoại nào. Bản web dễ "cải tiến" bằng một cảnh báo
        // — đó là THÊM tính năng, không phải giữ nguyên hành vi.
        await expect(
            page.getByRole('dialog'),
            'DeleteRow từ chối IM LẶNG — không được bung hộp thoại nào',
        ).toHaveCount(0)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A2 — Delete trên 部位病名行 hỏi xoá CẢ CỤM
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-A2 — Delete trên 部位病名行 hỏi 「同一部位の処置を全て削除します」 (frm203002.cs:3853-3862)', async () => {
        const bui = (await currentMonthRows()).find(isBuiRow)
        test.skip(
            bui === undefined,
            `ngày ${TRT_DT} của bệnh nhân ${PAT_NO} không có 部位病名行 (ô 点 = 「－」) ⇒ không đo được`,
        )
        console.log(`TC-A2: dòng 部位 đem test — key=${bui!.key} 「${bui!.ryo}」 点=${bui!.ten}`)

        const rowsBefore = await rowCount()
        const totalBefore = await readTotal()

        await focusCell(bui!.key, COL_RYO)
        await page.keyboard.press('Delete')
        await step()

        // Đây là đường DUY NHẤT xoá theo cụm trong cả màn hình: chỉ khi linekbn == "1"
        // thì DeleteRow mới hỏi rồi bật flgBui, và vòng xoá mới chạy quá một dòng.
        const confirm = page.getByText(/同一部位の処置を全て削除します/)
        await expect(
            confirm,
            'Delete trên 部位病名行 phải hỏi 「同一部位の処置を全て削除します。よろしいですか?」 ' +
                '(frm203002.cs:3853-3862) — đây là đường DUY NHẤT xoá theo cụm',
        ).toBeVisible({ timeout: 10_000 })

        const text = txt((await confirm.first().innerText()) ?? '')
        console.log(`TC-A2: hộp thoại 「${text.replace(/\s+/g, ' ')}」`)
        expect(text, 'phải là câu HỎI xác nhận, không phải cảnh báo suông').toContain('よろしいですか')

        // Trả lời いいえ ⇒ HUỶ SẠCH. Cố ý KHÔNG chọn はい: xoá cả cụm 部位 sẽ phá lưới cho
        // các TC sau mà không đo thêm được gì.
        await page
            .getByRole('button', { name: /^(No|いいえ)$/ })
            .first()
            .click()
        await expect(confirm).toBeHidden({ timeout: 10_000 })
        await step()

        const rowsAfter = await rowCount()
        const totalAfter = await readTotal()
        console.log(`TC-A2: sau 「いいえ」 — ${rowsBefore} → ${rowsAfter} dòng, ${totalBefore} → ${totalAfter}`)

        expect(rowsAfter, `trả lời 「いいえ」 phải HUỶ SẠCH: ${rowsBefore} → ${rowsAfter} dòng`).toBe(
            rowsBefore,
        )
        expect(totalAfter, `…và 合計点数 y nguyên: ${totalBefore} → ${totalAfter}`).toBe(totalBefore)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A3 — Insert LẠI CHÈN ĐƯỢC trên 日計行
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-A3 — Insert trên 日計行 CHÈN ĐƯỢC (AddRow chỉ chặn linekbn 99, frm203002.cs:3714)', async () => {
        const rowsBefore = await rowCount()
        console.log(`TC-A3: trước — ${rowsBefore} dòng`)

        await footerDayCell().click()
        await step()
        await page.keyboard.press('Insert')

        // ĐÂY LÀ CHỖ BẤT ĐỐI XỨNG — TC-A1 vừa chứng minh Delete bị chặn trên ĐÚNG dòng
        // này, còn Insert thì không. Xem doc-comment đầu file.
        await expect
            .poll(rowCount, {
                message:
                    'Insert trên 日計行 phải CHÈN ĐƯỢC (AddRow chỉ chặn linekbn 99, ' +
                    'frm203002.cs:3714). Không đổi nghĩa là bản web đã gộp luật của DeleteRow ' +
                    'và AddRow làm một — hai hàm kiểm hai thứ khác nhau.',
                timeout: 10_000,
            })
            .toBe(rowsBefore + 1)

        // Dọn: Delete ngay trên dòng trống vừa chèn (con trỏ đang ở đó).
        await page.keyboard.press('Delete')
        await expect
            .poll(rowCount, { message: 'Delete phải trả lưới về số dòng ban đầu', timeout: 10_000 })
            .toBe(rowsBefore)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A4 — mũi tên → đi MỘT ô
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-A4 — → từ ô 日 sang ô 部位 (một ô), KHÔNG nhảy thẳng sang 点', async () => {
        const row = (await currentMonthRows()).find((r) => !isBuiRow(r) && r.ryo.length > 0)
        expect(row, 'không tìm được 処置行 nào').toBeDefined()

        await focusCell(row!.key, COL_DAY)
        const before = await focusedCellId()
        expect(before, 'click vào ô 日 mà ô đó không thành ô vàng').toBe(`${row!.key}|${COL_DAY}`)

        await page.keyboard.press('ArrowRight')
        await step()

        const after = await focusedCellId()
        console.log(`TC-A4: ${before} --→--> ${after}`)

        // ĐO THẬT trên WinForm 2026-08-25: 「日 Row 2」 → 「部位 Row 2」, đi ĐÚNG MỘT Ô.
        //
        // Đừng nhầm với Move_Cell(eMovePoint.Right) ở frm203002.cs:5877, chỗ có
        // `case 0: X + 3` (từ 日 nhảy thẳng sang 点). Nhánh đó là đường LẬP TRÌNH — app gọi
        // sau khi chốt xong một ô — chứ không phải hành vi của phím mũi tên.
        expect(
            after,
            '→ từ ô 日 phải sang ô 部位 (đi MỘT ô). Ra cột 点 nghĩa là bản web đem nhánh ' +
                'Move_Cell(Right) (frm203002.cs:5877, `case 0: X + 3`) gán nhầm cho phím mũi tên — ' +
                'nhánh đó là đường lập trình sau khi chốt ô, không phải phím.',
        ).toBe(`${row!.key}|${COL_BUI}`)
    })

    // ═══════════════════════════════════════════════════════════════════════
    // TC-A5 — Enter trên ô 部位 mở 部位選択.  ĐẶT CUỐI CÙNG.
    // ═══════════════════════════════════════════════════════════════════════

    test('TC-A5 — Enter trên ô 部位 mở 部位選択 (frm203002.cs:3551-3558)', async () => {
        const row = (await currentMonthRows()).find((r) => r.ryo.length > 0)
        expect(row, 'không tìm được dòng nào có 療法・処置').toBeDefined()

        await focusCell(row!.key, COL_BUI)
        await page.keyboard.press('Enter')
        await step()

        // 部位選択 là bảng chọn răng — chữ đặc trưng 「歯番クリック」 (đo thật trên WinForm).
        await expect(
            page.getByText(/歯番クリック/).first(),
            'Enter trên ô 部位 phải mở bảng chọn 部位 (frm203002.cs:3551-3558 → ' +
                'OpenDialogBuiAndByou). Không thấy chữ 「歯番クリック」 nào.',
        ).toBeVisible({ timeout: 10_000 })

        // ĐẶT CUỐI FILE có chủ ý: bên WinForm hộp thoại này KHÔNG đóng được bằng
        // いいえ/No/OK/F10/ESC (probe 2026-08-25 thử cả năm đều trượt), nên testcase bên đó
        // cũng xếp cuối và để nguyên. Giữ hai bên cùng thứ tự cho dễ đối chiếu.
        await closeDialogs(page)
    })
})
