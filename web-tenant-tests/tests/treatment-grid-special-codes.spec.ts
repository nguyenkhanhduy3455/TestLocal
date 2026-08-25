import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — MÃ ĐẶC BIỆT của コードモード và NỘI DUNG danh sách 処置選択.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEC NÀY LÀ GÌ
 * ═══════════════════════════════════════════════════════════════════════════
 * Nửa web của cặp parity thứ tư. Nửa kia là
 * `fla-ui-tests/.../Tests/TreatmentGrid/TreatmentGridSpecialCodeTests.cs`, cùng số
 * hiệu TC-S1…TC-S5.
 *
 * Điểm khác các spec trước: nó KHÔNG chỉ hỏi "dialog có mở không" mà so TỪNG DÒNG
 * trong 処置選択 — コード / 枝番 / 名称. Mở được dialog thì bên nào cũng làm được;
 * DANH SÁCH bên trong mới là thứ người dùng chọn.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐÁP ÁN — ĐO THẬT TRÊN WINFORM 2026-08-25 (bệnh nhân 10, ngày 2026-08-03)
 * ═══════════════════════════════════════════════════════════════════════════
 *   TC-S1  101      → KasanCode() rồi VỀ NGAY — KHÔNG mở picker, không thêm dòng
 *   TC-S2  50 (IS)  → picker RIÊNG đúng 2 dòng:
 *                       50-0 N2O使用リッター数 (0点) / 50-1 O2使用リッター数 (0点)
 *                     kèm ô nhập 「リッター数」 NGAY TRONG dialog
 *   TC-S3  333      → picker ≥5 dòng, TẤT CẢ mã 333: 歯科訪問診療1 (1100) … 5 (95)
 *   TC-S4  202      → picker ≥5 dòng, TẤT CẢ mã 202: 笑気吸入鎮静法(IS) 70 …
 *   TC-S5  599      → picker ≥5 dòng, TẤT CẢ mã 599: 歯科医師居宅療養管理指導I 517 …
 *
 * Khẳng định chung cho S3/S4/S5: `GetTrtmasCod` query
 * `where t.trt_cd = <mã> order by t.trt_sb` ⇒ MỌI dòng phải cùng コード và mỗi dòng
 * một 枝番 khác nhau. Lọt mã khác = truy vấn sai.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CỐ Ý KHÔNG TEST: mã 999
 * ═══════════════════════════════════════════════════════════════════════════
 * Trên WinForm, gõ 999 (未装着) làm app ném `Index was outside the bounds of the
 * array.` và bung hộp thoại .NET 「Unhandled exception…」. Đó là LỖI của WinForm,
 * không phải hành vi để port — bản web KHÔNG được bắt chước, nên ở đây không có
 * testcase nào cho nó. Chi tiết ở `TreatmentGridSpecialCodeTests.TcS6` (chỉ ghi
 * nhận, không assert).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY / cần biết
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. `PAT_NO`/`TRT_DT` PHẢI khớp `patient` bên `testsettings.local.json` (FlaUI).
 *  2. Nhập mã vào ô 点 CỦA MỘT DÒNG 処置 và gõ bằng BÀN PHÍM — đúng đường mà bên
 *     WinForm đo. KHÔNG dùng ô 点 của dòng footer 日計 và KHÔNG dùng `fill()`:
 *     `fill()` gán thẳng giá trị, không sinh sự kiện phím, nên bộ lọc ký tự
 *     (grdRegi_TextBox_KeyPress) không bao giờ chạy — đó là một đường KHÁC, và
 *     `point-code-mode-code-enter-value.spec.ts` đã phủ đường đó rồi.
 *  3. Mọi testcase ĐÓNG picker bằng 戻る (không F9 確定) nên không dòng nào vào lưới.
 *     Không bấm F9 登録 ⇒ KHÔNG ghi DB.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *   npx playwright test tests/treatment-grid-special-codes.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** PHẢI khớp `patient.patNo` bên testsettings.local.json (FlaUI). */
const PAT_NO = process.env.TEST_PAT_NO ?? '10'
/** PHẢI khớp `patient.trtDate` bên testsettings.local.json (FlaUI). */
const TRT_DT = process.env.TEST_TRT_DT ?? '2026-08-03'

const COL_RYO = 2
const COL_TEN = 3

const GRID_LOAD_TIMEOUT = 60_000

const txt = (s: string) => s.normalize('NFKC').trim()

const HISTORY_KEY_RE = /^\d+-\d+$/

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — mã đặc biệt コードモード + nội dung 処置選択 (parity với WinForm)', () => {
    let page: Page
    let step: () => Promise<void>
    let picker: Locator
    let modeBtn: Locator

    const ryoCells = () => page.locator(`[data-grid-cell$="|${COL_RYO}"]`)

    async function currentMonthRows(): Promise<{ key: string; ryo: string; ten: string }[]> {
        const raw = await ryoCells().evaluateAll(
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
        return raw
            .map((r) => ({ key: r.key, ryo: txt(r.ryo), ten: txt(r.ten) }))
            .filter((r) => !HISTORY_KEY_RE.test(r.key))
    }

    /** Dòng 処置 gõ được vào ô 点 (không phải 部位行 「－」, không phải 日計). */
    async function targetRow(): Promise<string> {
        const rows = await currentMonthRows()
        const row = rows.find(
            (r) => r.ten !== '-' && r.ten !== '－' && !r.ryo.includes('日計') && r.ryo.length > 0,
        )
        expect(row, 'lưới không có 処置行 nào để gõ vào ô 点').toBeDefined()
        return row!.key
    }

    async function ensureCodeMode() {
        for (let i = 0; i < 3; i++) {
            if ((await modeBtn.innerText()).includes('コード')) return
            await modeBtn.click()
            await page.waitForTimeout(400)
        }
        expect(await modeBtn.innerText(), 'không chuyển được sang コードモード').toContain('コード')
    }

    /**
     * Gõ một mã vào ô 点 CỦA MỘT DÒNG bằng BÀN PHÍM rồi Enter — đúng đường mà bên
     * WinForm đo (xem BẪY 2).
     */
    async function enterCodeIntoRowTen(code: string) {
        await closeDialogs(page)
        await ensureCodeMode()
        const key = await targetRow()
        const cell = page.locator(`[data-grid-cell="${key}|${COL_TEN}"]`)

        await cell.click()
        await page.waitForTimeout(250)
        await page.keyboard.press('Enter')
        await page.waitForTimeout(350)

        const editor = cell.locator('input')
        if (await editor.count()) await editor.fill('')
        await page.keyboard.type(code)
        await page.waitForTimeout(250)
        await page.keyboard.press('Enter')
        await step()
    }

    /**
     * Đọc từng dòng của 処置選択: コード / 枝番 / 名称.
     *
     * Hai đường vì bản web dùng HAI component khác nhau:
     *   · 処置選択 thường  → lưới có `data-testid="cell-trtCd|trtSb|trtNm"`;
     *   · `is-input-dialog.tsx` (mã 50, 202-5, …) → div trần KHÔNG có testid nào,
     *     và chỉ render MỘT dòng vì nó nhận trtCd/trtSb/trtNm là prop đơn lẻ
     *     (`:33-34`, `:159-160`) chứ không nhận danh sách.
     * Không dò được testid thì đọc text để vẫn so được nội dung.
     */
    async function readPicker(): Promise<{ code: string; sub: string; name: string }[]> {
        const codes = await picker.getByTestId('cell-trtCd').allTextContents()
        if (codes.length > 0) {
            const subs = await picker.getByTestId('cell-trtSb').allTextContents()
            const names = await picker.getByTestId('cell-trtNm').allTextContents()
            return codes.map((c, i) => ({
                code: txt(c),
                sub: txt(subs[i] ?? ''),
                name: txt(names[i] ?? ''),
            }))
        }

        // Đường 2: đọc text. Mỗi dòng dữ liệu bắt đầu bằng số (コード), rồi 枝番, rồi tên.
        const raw = await picker.innerText()
        return raw
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => /^\d+\s/.test(l) || /^\d+$/.test(l))
            .map((l) => {
                const m = l.match(/^(\d+)\s+(\d+)\s*(.*)$/)
                return m
                    ? { code: m[1]!, sub: m[2]!, name: txt(m[3] ?? '') }
                    : { code: l, sub: '', name: '' }
            })
    }

    async function closePicker() {
        if (await picker.count()) {
            await page.keyboard.press('F10')
            await expect(picker).toBeHidden({ timeout: 10_000 })
        }
        await closeDialogs(page)
    }

    /** Mã mở picker, và MỌI dòng phải mang đúng mã đó. */
    async function assertPickerListsOnly(code: string, mustContainName: string, minRows: number) {
        await enterCodeIntoRowTen(code)

        await expect(
            picker,
            `mã ${code} phải mở 処置選択 (GetTrtmasCod query trt_cd = ${code})`,
        ).toBeVisible({ timeout: 20_000 })

        const rows = await readPicker()
        console.log(
            `TC-S/${code}: ${rows.length} dòng — ` +
                rows
                    .slice(0, 6)
                    .map((r) => `${r.code}-${r.sub} 「${r.name}」`)
                    .join(' / '),
        )

        expect(
            rows.length,
            `picker của mã ${code} phải có ít nhất ${minRows} dòng, đang có ${rows.length}`,
        ).toBeGreaterThanOrEqual(minRows)

        // GetTrtmasCod query `where t.trt_cd = <mã> order by t.trt_sb` ⇒ MỌI dòng cùng
        // コード, chỉ khác 枝番. Lọt mã khác nghĩa là truy vấn sai.
        const wrong = [...new Set(rows.map((r) => r.code).filter((c) => c !== code))]
        expect(
            wrong,
            `picker của mã ${code} lọt mã khác: ${wrong.join(', ')} — GetTrtmasCod chỉ query ` +
                '`trt_cd = <mã>` nên mọi dòng phải cùng コード',
        ).toEqual([])

        expect(
            rows.some((r) => r.name.includes(mustContainName)),
            `picker của mã ${code} phải có dòng tên chứa 「${mustContainName}」. Đang có: ` +
                rows
                    .slice(0, 5)
                    .map((r) => r.name)
                    .join(' / '),
        ).toBe(true)

        expect(
            new Set(rows.map((r) => r.sub)).size,
            'mỗi dòng phải một 枝番 khác nhau (order by trt_sb)',
        ).toBe(rows.length)

        await closePicker()
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

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(ryoCells().first(), 'Lưới 診療入力 không nạp được').toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
        await closeDialogs(page)

        picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        await expect(modeBtn, 'không thấy nút đổi 入力モード').toBeVisible({ timeout: 20_000 })
    })

    test.afterAll(async () => {
        // Không bấm F9 登録, picker luôn đóng bằng 戻る ⇒ không có gì để dọn.
        await page?.close()
    })

    test('TC-S1 — mã 101 (加算) KHÔNG mở picker: KasanCode xử lý rồi về ngay', async () => {
        const before = (await currentMonthRows()).length
        await enterCodeIntoRowTen('101')
        await page.waitForTimeout(1500)

        // modMain.cs GetTrtmasCod: `if (trt_cd == 101 || 102 || 103) { KasanCode(...); return; }`
        // — nhánh này KHÔNG bao giờ tới câu query nên KHÔNG có 処置選択.
        await expect(
            picker,
            'mã 101 đi nhánh KasanCode rồi về NGAY — không được mở 処置選択',
        ).toBeHidden()

        console.log(`TC-S1: số dòng ${before} → ${(await currentMonthRows()).length}`)
        await closeDialogs(page)
    })

    test('TC-S2 — [LỆCH] mã 50 (IS): picker phải liệt kê ĐỦ 2 dòng 50-0 N2O / 50-1 O2', async () => {
        // LỆCH ĐÃ ĐO 2026-08-25, cùng bệnh nhân 10 / ngày 2026-08-03 (có ảnh cả hai bên):
        //   WinForm : 処置選択 liệt kê ĐỦ 2 dòng —
        //               50-0 N2O使用リッター数 (0点) / 50-1 O2使用リッター数 (0点)
        //             kèm ô nhập リッター数 bên dưới.
        //   Bản web : chỉ MỘT dòng 「50 | 0 |」 và cột 名称 TRỐNG.
        //
        // Nguyên nhân nằm ở component: web dùng `is-input-dialog.tsx`, nhận
        // trtCd/trtSb/trtNm là PROP ĐƠN LẺ (:33-34) và render đúng một dòng (:159-160)
        // — nó không có khái niệm "danh sách". Ô nhập リッター数 thì ĐÃ CÓ và đúng
        // (「N2O、O2使用リッター数を入力してください。」), chỉ thiếu phần danh sách.
        //
        // Hệ quả: người dùng KHÔNG chọn được giữa N2O và O2 từ danh sách như WinForm.
        //
        // Giữ dưới test.fail() theo quy ước repo — sửa xong thì test này
        // "unexpectedly passed" và phải bỏ cờ đi.
        test.fail()
        await enterCodeIntoRowTen('50')

        await expect(picker, 'mã 50 phải mở picker IS').toBeVisible({ timeout: 20_000 })
        const rows = await readPicker()
        console.log(
            `TC-S2: ${rows.length} dòng — ` +
                rows.map((r) => `${r.code}-${r.sub} 「${r.name}」`).join(' / '),
        )

        expect(rows.length, `mã 50 phải ra ĐÚNG 2 dòng (N2O và O2), đang có ${rows.length}`).toBe(2)
        expect(
            rows.some((r) => r.name.includes('N2O')),
            'thiếu dòng N2O使用リッター数',
        ).toBe(true)
        expect(
            rows.some((r) => r.name.includes('O2使用')),
            'thiếu dòng O2使用リッター数',
        ).toBe(true)

        // Điểm KHÁC của nhánh 50 so với picker thường: nó có Ô NHẬP リッター数 ngay trong
        // dialog (giống mã 17 có ô 自費金額). Đây là chỗ bản web dễ bỏ sót — chính spec
        // point-code đã ghi 「commitPick chưa route mã cần form nhập của frm203016」.
        await expect(
            picker.getByText(/リッター数/).first(),
            'picker mã 50 phải có ô nhập 「リッター数」 kèm câu hướng dẫn ngay trong dialog ' +
                '(WinForm: 「N2O、O2使用リッター数を入力してください。」)',
        ).toBeVisible()

        await closePicker()
    })

    test('TC-S3 — mã 333 (訪問診療): picker chỉ chứa mã 333, có 歯科訪問診療1', async () => {
        await assertPickerListsOnly('333', '歯科訪問診療1', 5)
    })

    test('TC-S4 — mã 202 (麻酔): picker chỉ chứa mã 202, có 笑気吸入鎮静法', async () => {
        await assertPickerListsOnly('202', '笑気吸入鎮静法', 5)
    })

    test('TC-S5 — mã 599 (介護): picker chỉ chứa mã 599, có 居宅療養管理指導', async () => {
        await assertPickerListsOnly('599', '居宅療養管理指導', 5)
    })

    test('TC-S6 — mã 17 (自費): picker liệt kê 17-0/17-1 VÀ có ô nhập 自費金額', async () => {
        // ĐÁP ÁN ĐO TRÊN WINFORM 2026-08-25 (fla-ui-tests TC-P5, có ảnh):
        //   処置選択 hiện ĐÚNG hai dòng 17-0 自費(税なし) / 17-1 自費(税あり), VÀ ngay trong
        //   chính dialog đó có ô nhập 「自費金額」 kèm câu 「自費金額を入力してください。」
        //   (nút F9 確定 / F10 戻る).
        //
        // Mã 17 đặc biệt ở chỗ nó LUÔN mở picker kể cả khi master chỉ có 1 dòng —
        // modMain.cs: `if (intRowCnt == 1 && trt_cd != 17)` mới tự commit.
        //
        // Đây từng là lệch: bản web mở đúng picker với đúng hai dòng nhưng KHÔNG có ô
        // nhập 自費金額 (spec point-code tự ghi 「commitPick chưa route mã cần form nhập
        // của frm203016 — 17 自費金額 / 179-5 残根数 / 202・203 IS」).
        await enterCodeIntoRowTen('17')

        await expect(picker, 'mã 17 phải LUÔN mở 処置選択').toBeVisible({ timeout: 20_000 })

        const rows = await readPicker()
        console.log(
            `TC-S6: ${rows.length} dòng — ` +
                rows.map((r) => `${r.code}-${r.sub} 「${r.name}」`).join(' / '),
        )

        expect(
            rows.length,
            `mã 17 phải liệt kê ĐÚNG 2 dòng (自費 税なし / 税あり), đang có ${rows.length}`,
        ).toBe(2)
        expect(
            rows.every((r) => r.code === '17'),
            `mọi dòng phải mang mã 17. Đang có: ${rows.map((r) => r.code).join(', ')}`,
        ).toBe(true)
        expect(
            rows.some((r) => r.name.includes('自費')),
            `picker mã 17 phải có dòng tên chứa 「自費」. Đang có: ${rows.map((r) => r.name).join(' / ')}`,
        ).toBe(true)

        // Phần từng thiếu: ô nhập 自費金額 ngay trong dialog.
        await expect(
            picker.getByText(/自費金額/).first(),
            'picker mã 17 phải có ô nhập 「自費金額」 ngay trong dialog ' +
                '(WinForm: 「自費金額を入力してください。」 + F9 確定 / F10 戻る)',
        ).toBeVisible()

        await closePicker()
    })
})
