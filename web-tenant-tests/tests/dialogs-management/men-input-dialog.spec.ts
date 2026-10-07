import { type Locator, type Page, type Response } from '@playwright/test'

import { patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import { dbEnabled, seedTreatmentRows, withDb } from '../_shared/db'
import { makeStep, skipWithReason } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — 面入力 (frm203035).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEC NÀY LÀ GÌ
 * ═══════════════════════════════════════════════════════════════════════════
 * Hộp thoại 面入力 mở NGAY SAU khi một 処置 đã đáp xuống lưới, không phải trước
 * như 自費金額 / 残根数 / IS. Điều kiện mở (frm203016.cs:1565-1585):
 *
 *     mst_trt.men == 1   VÀ   診療入力設定「面入力する」(inp_config.meninput_flg) == 1
 *
 * Người dùng chọn các MẶT của răng rồi F9 確定; mỗi lần 確定 nối thêm một token
 * `<歯 + 面文字>` vào CẢ 療法・処置 (cột 2 → `dsp_trt`) LẪN `trn_trn.freewd`
 * (cột 72). Đây chính là chỗ trước đây bỏ trống: freewd luôn rỗng vì không có
 * producer nào ghi nó.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source, đọc trước khi sửa test (GUIDELINE Rule 21)
 * ═══════════════════════════════════════════════════════════════════════════
 * WinForm — `userapp/src/OCHACOM/INP/Forms/frm203035.cs`:
 *   · `frm203035_Load` (:118-131)   — cất `col72` vào `prvStrBuffFreeWord` rồi XOÁ `col72`.
 *   · `frm203035_Activated` (:136)  — `_buiCnt == 0` ⇒ đóng NGAY (dòng không có 部位
 *                                     thì hộp thoại không bao giờ hiện).
 *   · `chkBui` (:288-368)           — lấy ô BUI khác 0 ĐẦU TIÊN; bảng nhãn 5 mặt theo
 *                                     vị trí răng. Slot 2 = 右上6 ⇒ 上B / 左D / 中央O /
 *                                     右M / 下P.
 *   · `makeMenStr` (:491-516)       — thứ tự phát chữ M→O→I→D→B→P→L, bọc `<歯 + 面>`;
 *                                     KHÔNG chọn mặt nào ⇒ chuỗi RỖNG (không có `<>`).
 *   · `fixProc` (:427-485)          — số lần 面入力 cho MỖI răng = `算定回数 ÷ 部位数`
 *                                     (CHIA NGUYÊN). Hết răng ⇒ đóng + commit.
 *   · `btnF10_Click` (:158-164)     — 戻り trả LẠI `col72` cũ nhưng KHÔNG trả `col2`.
 *   · `formBase_KeyDown` (:196-229) — 8/4/5/6/2 (cả numpad) bật/tắt 上/左/中央/右/下.
 *   · KHÔNG có `.Focus()` nào trong `initProc` ⇒ WinForm không set focus, con trỏ
 *     theo TabIndex (tthSn TabIndex 0). Không có MsgBox nào trong cả form.
 *   · `BaseDialog2.cs:190-201`      — `End` VÀ `Escape` đều chạy `btnF9_Click` (確定).
 *   · `frm203002.cs:5595-5604`      — ĐUÔI của case 3 (Enter ô 点 tra ra 処置). 面入力 là
 *                                     showDialog MODAL nằm TRONG frm203016 nên đuôi này
 *                                     chạy SAU khi hộp thoại đóng: `Move_Cell(Right);
 *                                     grdRegi.Focus(); grdRegi.BeginEdit(true)` ⇒ ô 回 phải
 *                                     ở 編集モード. KHÔNG có `new SingleChk` ở đây.
 *
 * Web — `apps/web-tenant/src/features/treatments/`:
 *   · `components/men-input-dialog.tsx` — title 「面入力」, `KEY_TO_SURFACE` 8/4/5/6/2,
 *     slot `End` ẩn trong `fKeys` (⇒ ESC = 確定, KHÔNG phải huỷ).
 *   · `components/cavity-tooth-model.tsx` — mặt ĐANG CHỌN tô `#d4d4d4`, chưa chọn `#ffffff`.
 *   · `lib/men-input.ts` — `menSurfaceToken` / `applyMenInputConfirm`.
 *   · `lib/cavity-form.ts` — `cavityLabels` (bảng nhãn) + `circleSurfaceString` (thứ tự chữ).
 *   · `components/treatment-entry-detail.tsx` — `armMenInputIfNeeded` gọi ở CẢ 4 đường
 *     ghi dòng (sửa tại chỗ / thêm mới / 薬剤 / tab 個別); `closeMenInput` ghi 2 cột về
 *     dòng RỒI dựng lại focus + 編集モード cho ô 回 (hộp thoại mở đã cướp focus của
 *     editor, onBlur của nó huỷ edit — `registration-table.tsx:131-142`).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU — đo thật trên t_tenant1 (bản master đang áp dụng)
 * ═══════════════════════════════════════════════════════════════════════════
 *   · 26 dòng master có `men = 1`, KHÔNG dòng nào `men = 2`.
 *   · Mã 326 chứa CẢ HAI phía trong CÙNG một picker — cặp A/B lý tưởng:
 *         326-3  光ＣＲ充(複雑)      men = 1  → PHẢI mở 面入力
 *         326-1  充填１(単純)        men = 0  → KHÔNG được mở
 *   · `tenant_config."inp-legacy".menuInputFlg = 1` sẵn trong seed ⇒ cổng đã MỞ,
 *     spec không cần đụng cấu hình. Nếu tenant khác tắt cờ này thì TC-M2 sẽ đỏ với
 *     thông báo chỉ đúng chỗ.
 *   · Glyph răng (`lblBui`) là ký tự GAIJI vùng PUA của `cnv_tooth_text`
 *     (tooth_kbn = 0). KHÔNG assert theo mặt chữ — chỉ khớp `<?OD>` bằng regex.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BẪY / cần biết
 * ═══════════════════════════════════════════════════════════════════════════
 *  1. 面入力 CHỈ mở khi dòng có 部位. Spec tự seed MỘT 処置行 mang `bui[2] = 1`
 *     (右上6) rồi GÕ ĐÈ chính dòng đó — đường `placePick` sửa-tại-chỗ, xác định
 *     nhất vì dòng nằm ngay dưới 部位病名行 của chính nó. Không mở được hộp thoại
 *     ⇒ hoặc 部位 không thừa kế, hoặc cờ `meninput_flg` tắt.
 *  2. ESC = 確定 (Rule 10.4). Đóng hộp thoại phải bằng F10, và TC-M6 dùng chính
 *     ESC để CHỨNG MINH nó commit chứ không huỷ.
 *  3. Testcase NỐI TIẾP TRẠNG THÁI (`mode: 'serial'`, một `page` chung từ
 *     `beforeAll`) — chạy lẻ một test ở giữa sẽ đỏ giả. Chạy CẢ FILE.
 *     Một test đỏ ⇒ các test sau bị skip. Page tự tạo nên KHÔNG có
 *     trace/video/screenshot tự động của fixture.
 *  4. 処置選択 (frm203016) 確定 KHÔNG chạy 診療チェック. `new SingleChk` chỉ có 5 chỗ,
 *     đều ở frm203002 (:5667 Enter ô 回, :8807 処置セット, :9056 パック, :9537 ガイド,
 *     :9998 薬剤選択). Vì thế TC-M4 khoá bằng "KHÔNG có request" chứ không phải "có".
 *     Điều tra đầy đủ: `userapp/parity-notes-singlechk-call-sites.md`.
 *  5. Mặc định KHÔNG bấm F9 登録 ⇒ không ghi DB. Chỉ TC-M8 ghi, và nó nằm sau
 *     `TEST_ALLOW_SAVE=1` (Rule 18.1) vì bulk-save ghi lại TOÀN BỘ 処置行 của tháng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═══════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 npx playwright test tests/dialogs-management/men-input-dialog.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/dialogs-management/men-input-dialog.spec.ts   # kèm TC-M8
 */

/** Bệnh nhân + ngày để seed. Đổi được khi tháng đó đang có dữ liệu thật không muốn đụng. */
const PAT_NO = patNo('10')
const TRT_DT = trtDt('2026-08-03')

/** Rule 18.1 — F9 登録 ghi DB thật nên phải sau cờ. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/** 処置コード dùng cho cả hai phía A/B (xem khối DỮ LIỆU). */
const TRT_CD = Number(process.env.TEST_MEN_TRT_CD ?? 326)
/** 枝番 có `men = 1` — PHẢI mở 面入力. */
const SB_MEN = Number(process.env.TEST_MEN_TRT_SB ?? 3)
/** 枝番 có `men = 0` — KHÔNG được mở (đối chứng âm). */
const SB_NO_MEN = Number(process.env.TEST_NO_MEN_TRT_SB ?? 1)

/**
 * Ô 部位 seed: index 2 của vector 32 ô = 右上6 (bố cục `tooth-bui.ts`: 0-7 右上 8→1).
 * Giá trị 1 = 永久歯. Chọn 右上6 vì `cavityLabels(2)` cho 中央 = O và 左 = D — hai
 * mặt spec sẽ bấm, và cả hai đều khác nhau nên token `OD` không nhập nhằng.
 */
const BUI_SLOT = 2
/** Nhãn mặt của slot 2 (`cavityLabels(2)`, frm203035.chkBui nhánh `idx <= 4`). */
const FACE_CENTER = 'O'
const FACE_LEFT = 'D'
/** Token sau khi bấm 中央(5) + 左(4): thứ tự phát là M→O→I→D→… ⇒ 「OD」. */
const EXPECT_SURFACES = `${FACE_CENTER}${FACE_LEFT}`

/** Tên seed — đủ lạ để `findRow` không đụng dòng thật nào. */
const SEED_NAME = 'E2E面入力ベース'

/** Cột lưới (`RegiCol`): 2 = 療法・処置, 3 = 点, 4 = 回. */
const COL_RYO = 2
const COL_TEN = 3
const COL_KAI = 4

/** Mặt ĐANG CHỌN của CavityToothModel (`cavity-tooth-model.tsx` FILL_ON). */
const FILL_ON = '#d4d4d4'

/** Endpoint F9 登録 (`TenantTreatmentEndpoints.cs`). */
const BULK_SAVE_PATH = '/tenant/treatment/bulk-save'

const GRID_LOAD_TIMEOUT = 60_000
const EPS = 1

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

// GUIDELINE Rule 18 — skip phải in lý do, "không chạy" khác hẳn "chạy và pass".
if (!dbEnabled) {
    console.log(
        '\n⚠️  dialogs-management/men-input-dialog.spec.ts BỎ QUA TOÀN BỘ — thiếu TEST_DB=1 ' +
            '(spec seed một 処置行 mang 部位 để 面入力 có cái để mở).\n' +
            '   Chạy bằng: TEST_DB=1 npx playwright test tests/dialogs-management/men-input-dialog.spec.ts\n',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 処置行 mang 部位 (面入力 đóng ngay khi không có 部位)')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 面入力 (frm203035)', () => {
    let page: Page
    let step: () => Promise<void>
    let picker: Locator
    let menDialog: Locator
    let modeBtn: Locator

    const ryoCells = () => page.locator(`[data-grid-cell$="|${COL_RYO}"]`)

    /** Mọi dòng lưới hiện có: rowKey + text cột 療法・処置. */
    async function gridRows(): Promise<{ key: string; text: string }[]> {
        const raw = await ryoCells().evaluateAll(
            (els, col) =>
                els.map((e) => ({
                    key: (e.getAttribute('data-grid-cell') ?? '').replace(
                        new RegExp(`\\|${col}$`),
                        '',
                    ),
                    text: e.textContent ?? '',
                })),
            COL_RYO,
        )
        return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
    }

    /** rowKey của dòng chứa `keyword` — KHÔNG mốc theo số thứ tự (lưới virtualize). */
    async function rowKeyOf(keyword: string): Promise<string> {
        const rows = await gridRows()
        const hit = rows.find((r) => r.text.includes(txt(keyword)))
        expect(
            hit,
            `không thấy dòng 「${keyword}」 trên lưới. Đang có: ${rows.map((r) => r.text).join(' / ')}`,
        ).toBeDefined()
        return hit!.key
    }

    /** Text cột 療法・処置 của một rowKey. */
    async function ryoTextOf(key: string): Promise<string> {
        return txt(
            (await page.locator(`[data-grid-cell="${key}|${COL_RYO}"]`).textContent()) ?? '',
        )
    }

    /**
     * `data-grid-cell` của ô lưới ĐANG GIỮ FOCUS (null nếu focus không nằm trong lưới).
     *
     * Dùng thay cho việc dò dòng theo tên 処置 khi cần mốc "dòng vừa thao tác": lưới
     * 診療入力 render CẢ THÁNG nên các lần chạy trước để lại nhiều dòng trùng tên,
     * `rowKeyOf` rất dễ bắt nhầm dòng cũ.
     */
    const focusedGridCellKey = () =>
        page.evaluate(() => {
            const cell = (document.activeElement as HTMLElement | null)?.closest('[data-grid-cell]')
            return cell?.getAttribute('data-grid-cell') ?? null
        })

    async function ensureCodeMode() {
        for (let i = 0; i < 3; i++) {
            if ((await modeBtn.innerText()).includes('コード')) return
            await modeBtn.click()
            await page.waitForTimeout(400)
        }
        expect(await modeBtn.innerText(), 'không chuyển được sang コードモード').toContain('コード')
    }

    /**
     * Gõ `TRT_CD` vào ô 点 CỦA DÒNG seed rồi Enter → mở 処置選択, chọn `trtSb`, F9 確定.
     *
     * Gõ bằng BÀN PHÍM (không `fill()`) để đi đúng đường có bộ lọc ký tự
     * `grdRegi_TextBox_KeyPress`, giống `treatment-grid/treatment-grid-special-codes.spec.ts`.
     */
    async function pickVariant(trtSb: number) {
        await closeDialogs(page)
        // Cảnh báo 診療チェック của lần chọn TRƯỚC (nếu test trước chưa nuốt) vẫn giăng
        // overlay z-[200] chặn mọi click lên lưới — dọn trước khi thao tác.
        await drainAlerts()
        await ensureCodeMode()

        const key = await rowKeyOf(currentRowName)
        const cell = page.locator(`[data-grid-cell="${key}|${COL_TEN}"]`)
        await cell.click()
        await page.keyboard.press('Enter')

        const editor = cell.locator('input')
        await expect(editor, 'ô 点 không vào chế độ nhập').toBeVisible({ timeout: 10_000 })
        await editor.fill('')
        await page.keyboard.type(String(TRT_CD))
        await page.keyboard.press('Enter')

        await expect(picker, `mã ${TRT_CD} phải mở 処置選択`).toBeVisible({ timeout: 20_000 })

        // getRowKey của VirtualListTable = `${trtCd}-${trtSb}` (treatment-selection-dialog.tsx:252).
        const row = picker.getByTestId(`row-${TRT_CD}-${trtSb}`)
        await expect(
            row,
            `picker mã ${TRT_CD} thiếu dòng 枝番 ${trtSb} — master của tenant này khác dữ liệu spec ` +
                'ghi ở khối DỮ LIỆU, đổi TEST_MEN_TRT_SB / TEST_NO_MEN_TRT_SB',
        ).toBeVisible({ timeout: 20_000 })
        await row.click()
        await page.keyboard.press('F9')
        await expect(picker, 'F9 確定 phải đóng 処置選択').toBeHidden({ timeout: 20_000 })
        await step()
    }

    /** Số mặt đang được tô chọn trên tooth model. */
    const selectedFaceCount = () => menDialog.locator(`[fill="${FILL_ON}"]`).count()

    /**
     * Nuốt các cảnh báo 診療チェック (W00100, `alertDialog` OK-only) và trả text đã đọc.
     *
     * Đường 処置選択 KHÔNG chạy SingleChk (xem mốc đo ở TC-M4), nên bình thường chẳng
     * có cảnh báo nào để nuốt — hàm này là lớp phòng xa cho cảnh báo đến từ luồng khác
     * (vd một cú Enter ô 回 còn sót của spec chạy trước) vì overlay z-[200] của nó
     * chặn mọi click lên lưới. Dòng seed mang 部位 右上6 nhưng KHÔNG có 病名, nên nếu có
     * SingleChk chạy thì nó kêu 「…算定可能な部位がありません。」 — đó là dữ liệu test,
     * KHÔNG phải lỗi.
     */
    async function drainAlerts(): Promise<string[]> {
        const seen: string[] = []
        for (let i = 0; i < 6; i++) {
            if (!(await page.getByRole('alertdialog').count())) break
            const alert = page.getByRole('alertdialog').first()
            seen.push(txt((await alert.textContent()) ?? ''))
            await alert.getByRole('button', { name: 'OK' }).click()
            await expect(alert).toBeHidden({ timeout: 10_000 })
        }
        return seen
    }

    /**
     * Tên 処置 của dòng đang thao tác — đổi sau mỗi lần gõ đè, dùng để tìm lại rowKey.
     * (rowKey của lưới là vị trí `${ri}-${ii}`, KHÔNG phải id dòng, nên bám theo TEXT.)
     */
    let currentRowName = SEED_NAME

    /** Dựng lại trạng thái xuất phát: đúng MỘT dòng seed mang 部位, tên `SEED_NAME`. */
    async function reseed() {
        const bui = Array.from({ length: 32 }, (_, i) => (i === BUI_SLOT ? 1 : 0))
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            { trtCd: 184, trtSb: 0, trtCnt: 1, trtPt: 630, dspTrt: SEED_NAME, bui, dspBui: '6' },
        ])
        currentRowName = SEED_NAME
    }

    async function openTreatmentScreen() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(ryoCells().first(), 'Lưới 診療入力 không nạp được').toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
        await closeDialogs(page)
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung
     *  theo worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        await reseed()

        // Page chia sẻ theo worker (`_shared/session.ts`): đăng nhập một lượt cho cả
        // worker thay vì mỗi file một lần — app chặn ở 10 login/khung thời gian
        // (Rule 10.1). `afterAll` gọi `releaseSharedPage`, KHÔNG `page.close()`.
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true, kartePicker: true })
        step = makeStep(page)

        await openTreatmentScreen()

        picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        menDialog = page.getByRole('dialog').filter({ hasText: '面入力' })
        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        await expect(modeBtn, 'không thấy nút đổi 入力モード').toBeVisible({ timeout: 20_000 })
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        // Dọn vùng seed (disp_no >= 9000) — truyền mảng rỗng là DELETE rồi không chèn.
        if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), TRT_DT, [])
    })

    // ── TC-M1 ────────────────────────────────────────────────────────────────
    test('TC-M1 — dòng seed mang 部位 hiện đúng trên lưới (điều kiện mở 面入力)', async () => {
        const rows = await gridRows()
        console.log(`TC-M1: lưới có ${rows.length} dòng — ${rows.map((r) => r.text).join(' / ')}`)

        expect(
            rows.some((r) => r.text.includes(txt(SEED_NAME))),
            `không thấy dòng seed 「${SEED_NAME}」. Seed hỏng hoặc màn hình đang ở tháng khác — ` +
                `kiểm TEST_PAT_NO=${PAT_NO} / TEST_TRT_DT=${TRT_DT}`,
        ).toBe(true)
        await step()
    })

    // ── TC-M2 ────────────────────────────────────────────────────────────────
    test(`TC-M2 — chọn ${TRT_CD}-${SB_MEN} (men=1) MỞ 面入力, hiện glyph 歯 + tên 処置`, async () => {
        await pickVariant(SB_MEN)

        await expect(
            menDialog,
            `${TRT_CD}-${SB_MEN} có mst_trt.men = 1 nên PHẢI mở 面入力 ngay sau khi dòng đáp xuống ` +
                '(frm203016.cs:1565). Không mở ⇒ (a) dòng không thừa kế 部位 từ 部位病名行, hoặc ' +
                '(b) tenant_config."inp-legacy".menuInputFlg đang khác 1.',
        ).toBeVisible({ timeout: 20_000 })

        // lblBui — glyph răng (gaiji PUA), chỉ kiểm KHÁC RỖNG. lblTrt — tên 処置 đang chạy.
        //
        // `textContent()` chứ KHÔNG phải `innerText()`: nhãn 5 mặt và gợi ý phím là
        // `<text>` bên trong SVG (`cavity-tooth-model.tsx`), mà `innerText` của Chromium
        // bỏ qua nội dung SVG — dùng nhầm là mọi assert nhãn đỏ oan.
        const body = (await menDialog.textContent()) ?? ''
        console.log(`TC-M2: nội dung 面入力 = ${JSON.stringify(body)}`)
        expect(body, '面入力 phải hiển thị tên 処置 (lblTrt = cột 2 của dòng)').toContain('充')

        // FACT: cavityLabels(2) — slot 右上6 ⇒ 上B / 左D / 中央O / 右M / 下P.
        for (const face of ['B', FACE_LEFT, FACE_CENTER, 'M', 'P']) {
            expect(body, `thiếu nhãn mặt 「${face}」 của 右上6 (cavityLabels(${BUI_SLOT}))`).toContain(
                face,
            )
        }
        // Nhãn phím 8/4/5/6/2 (lblNumTop..lblNumBottom).
        for (const hint of ['(8)', '(4)', '(5)', '(6)', '(2)']) {
            expect(body, `thiếu gợi ý phím 「${hint}」 (frm203035.Designer lblNum*)`).toContain(hint)
        }
        await step()
    })

    // ── TC-M3 (Rule 23.1 + 23.2) ─────────────────────────────────────────────
    test('TC-M3 — init focus nằm TRONG hộp thoại, và thân hộp thoại không cuộn', async () => {
        // Rule 23.1 — FACT: frm203035.initProc KHÔNG gọi `.Focus()` nào, con trỏ theo
        // TabIndex (tthSn = 0). Bản web không có ô nhập nào, DraggableDialog kéo focus
        // vào thân hộp thoại ⇒ assert "focus nằm trong dialog", KHÔNG bịa ra một ô.
        const focusInside = await menDialog.evaluate(
            (el) => el.contains(document.activeElement) || el === document.activeElement,
        )
        expect(
            focusInside,
            'focus phải nằm TRONG 面入力 — nếu nó còn ở lưới thì phím 8/4/5/6/2 sẽ bị màn hình ' +
                '診療入力 nuốt mất',
        ).toBe(true)
        expect(
            await menDialog.locator('input:focus, textarea:focus').count(),
            'frm203035 không có ô nhập nào — focus không được rơi vào input',
        ).toBe(0)

        // Rule 23.2 — thân là div flex-1 overflow-auto (tabindex=-1) của DraggableDialog.
        const body = menDialog.locator('div[tabindex="-1"].overflow-auto').first()
        const scroll = await body.evaluate((el) => ({
            sw: el.scrollWidth,
            cw: el.clientWidth,
            sh: el.scrollHeight,
            ch: el.clientHeight,
        }))
        expect(scroll.sw, 'thân 面入力 bị cuộn NGANG khi vừa mở').toBeLessThanOrEqual(scroll.cw + EPS)
        expect(scroll.sh, 'thân 面入力 bị cuộn DỌC khi vừa mở').toBeLessThanOrEqual(scroll.ch + EPS)
        await step()
    })

    // ── TC-M4 ────────────────────────────────────────────────────────────────
    test(`TC-M4 — phím 5/4 bật 中央+左, F9 確定 nối 「<歯${EXPECT_SURFACES}>」 vào 療法・処置`, async () => {
        expect(await selectedFaceCount(), 'mới mở đã có mặt được chọn sẵn').toBe(0)

        // Rule 23.3 + THỨ TỰ MODAL. FACT: frm203035 tự nó KHÔNG có MsgBox nào, và nó là
        // `showDialog` MODAL bên trong frm203016 nên không gì được chồng lên nó: alert
        // (overlay z-[200] của alert-dialog-primitive) cướp cả phím lẫn click của 面入力.
        expect(
            await page.getByRole('alertdialog').count(),
            'có alert chồng lên 面入力. Đường 処置選択 lẽ ra KHÔNG chạy 診療チェック (xem mốc ' +
                'đo bên dưới); còn cảnh báo của luồng khác thì cổng giữ trong ' +
                'treatment-entry-detail (menInputTargetRef) phải chặn tới khi 面入力 đóng.',
        ).toBe(0)

        // formBase_KeyDown: 5 = 中央, 4 = 左 (frm203035.cs:205-219).
        await page.keyboard.press('5')
        await page.keyboard.press('4')
        expect(
            await selectedFaceCount(),
            'bấm 5 và 4 phải tô 2 mặt (中央 + 左) — phím không tới được dialog?',
        ).toBe(2)
        await step()

        // ── MỐC ĐO THỨ TỰ: KHÔNG được có SingleChk ở đây ────────────────────
        // ⚠️ Bản trước chờ `waitForResponse(check-single)` ngay sau khi 面入力 đóng.
        // Sai từ gốc: quét cả `userapp/src/OCHACOM/` thì `new SingleChk` chỉ có ĐÚNG 5
        // chỗ, tất cả trong frm203002 — :5667 (Enter ô 回), :8807 (処置セット),
        // :9056 (パック), :9537 (ガイド), :9998 (薬剤選択). 処置選択 (frm203016) 確定
        // KHÔNG nằm trong đó: case 3 kết thúc ở `Move_Cell(Right); grdRegi.Focus();
        // grdRegi.BeginEdit(true)` (frm203002.cs:5599-5603), không modal nào chen vào.
        // 診療チェック của dòng này thuộc về cú Enter ở ô 回 NGAY SAU đó.
        // Chi tiết điều tra: `userapp/parity-notes-singlechk-call-sites.md`.
        //
        // Vẫn KHÔNG dùng alert làm mốc (alert chỉ là HỆ QUẢ khi `res.errors` không rỗng,
        // phụ thuộc master + 「チェック項目設定」 của tenant) — đếm thẳng REQUEST.
        const checkCalls: string[] = []
        const onCheckCall = (r: Response) => {
            if (/\/tenant\/treatment\/check-single/.test(r.url())) checkCalls.push(r.url())
        }
        page.on('response', onCheckCall)

        // 回数 = 1, 部位数 = 1 ⇒ `算定回数 ÷ 部位数` = 1 ⇒ MỘT lần 確定 là xong cả hộp thoại.
        await menDialog.locator('[data-fkey="F9"]').click()
        await expect(menDialog, 'răng cuối cùng 確定 xong thì 面入力 phải đóng').toBeHidden({
            timeout: 20_000,
        })

        // Chờ một nhịp đủ cho một lượt lỡ bắn kịp về BE rồi mới khẳng định "không có".
        // KHÔNG dùng waitForResponse: nó chỉ biết chờ tới khi CÓ, nên với kỳ vọng 0 thì
        // chỉ treo tới timeout.
        await page.waitForTimeout(3_000)
        page.off('response', onCheckCall)
        console.log(`TC-M4: số lượt check-single sau 確定 = ${checkCalls.length}`)
        expect(
            checkCalls,
            '処置選択 確定 (kể cả khi có 面入力 chen vào) KHÔNG được chạy SingleChk — ' +
                'frm203016 không phải 1 trong 5 call site. Có request ⇒ app arm lại 診療チェック ' +
                'ở đường pick, cảnh báo W00100 (overlay z-[200]) sẽ đè lên ô 回 vừa mở.',
        ).toEqual([])
        expect(
            await page.getByRole('alertdialog').count(),
            'không chạy SingleChk thì cũng không được có cảnh báo W00100 nào bung ra',
        ).toBe(0)
        await step()

        // ── 編集モード phải quay về ô 回 (frm203002.cs:5599-5603) ─────────────────
        // 面入力 là showDialog MODAL bên trong frm203016, nên WinForm chỉ tới
        // `Move_Cell(Right); grdRegi.Focus(); grdRegi.BeginEdit(true)` SAU khi nó đóng —
        // 編集モード nằm SAU hộp thoại, không phải trước. Web arm ô 回 trước rồi mới mở
        // 面入力; hộp thoại cướp focus, onBlur của editor huỷ edit
        // (registration-table.tsx:131-142) ⇒ closeMenInput phải dựng lại.
        // Hỏng chỗ này KHÔNG chỉ là lệch con trỏ: 診療チェック treo ở cú Enter ô 回
        // (frm203002.cs:5667), nên không còn ô nào ở 編集モード thì dòng vừa 面入力 sẽ
        // KHÔNG BAO GIỜ được 診療チェック.
        await expect
            .poll(focusedGridCellKey, {
                timeout: 10_000,
                message:
                    'đóng 面入力 xong mà không ô lưới nào giữ focus — thiếu bước dựng lại ' +
                    'focus + 編集モード cho ô 回 trong closeMenInput (frm203002.cs:5602-5603)',
            })
            .not.toBeNull()
        const focusedKey = (await focusedGridCellKey()) ?? ''
        console.log(`TC-M4: ô giữ focus sau khi 面入力 đóng = ${JSON.stringify(focusedKey)}`)
        expect(focusedKey, '編集モード phải ở ô 回, không phải cột khác').toMatch(
            new RegExp(`\\|${COL_KAI}$`),
        )
        expect(focusedKey, '編集モード rơi xuống ô 回 của 日計 footer chứ không phải dòng 処置').not.toContain(
            ':footer',
        )
        const kaiEditor = page.locator(`[data-grid-cell="${focusedKey}"] input`)
        await expect(kaiEditor, 'ô 回 phải đang mở input (編集モード)').toBeFocused()

        // Mốc dòng lấy TỪ ô đang giữ focus, KHÔNG dò theo tên 処置: lưới render cả tháng
        // nên các lần chạy trước để lại nhiều dòng 「…<OD>」 trùng tên, dò tên bắt nhầm
        // dòng cũ là pass oan.
        currentRowName = '充'
        const key = focusedKey.replace(new RegExp(`\\|${COL_KAI}$`), '')
        const after = await ryoTextOf(key)
        console.log(`TC-M4: 療法・処置 của dòng đang ở 編集モード = ${JSON.stringify(after)}`)

        // Glyph 歯 là gaiji PUA (có thể là surrogate pair) ⇒ khớp bằng regex, không so mặt chữ.
        expect(
            after,
            `療法・処置 phải được nối token 「<歯${EXPECT_SURFACES}>」 (makeMenStr, frm203035.cs:510). ` +
                `Đang là: ${JSON.stringify(after)}`,
        ).toMatch(new RegExp(`<[\\s\\S]{1,2}${EXPECT_SURFACES}>`))

        // Thoát 編集モード bằng ESC (huỷ, KHÔNG commit) để TC-M5 xuất phát từ lưới tĩnh —
        // Enter ở đây sẽ kéo cả dây 診療チェック → 摘要コメント → カルテ記載選択 → 自動算定.
        await page.keyboard.press('Escape')
        await expect(kaiEditor, 'ESC trong ô 回 phải đóng editor').toBeHidden({ timeout: 10_000 })
        await step()
    })

    // ── TC-M5 (Rule 23.4) ────────────────────────────────────────────────────
    test('TC-M5 — mở lại: lựa chọn mặt reset sạch (WinForm dựng form mới mỗi ShowDialog)', async () => {
        await pickVariant(SB_MEN)
        await expect(menDialog).toBeVisible({ timeout: 20_000 })

        expect(
            await selectedFaceCount(),
            'mở lại mà mặt vẫn còn tô = state React sống sót — WinForm `Instance` Dispose rồi ' +
                'dựng form MỚI nên lựa chọn cũ phải mất (Rule 23.4)',
        ).toBe(0)
        await step()
    })

    // ── TC-M6 ────────────────────────────────────────────────────────────────
    test('TC-M6 — ESC là 確定 chứ KHÔNG phải huỷ (BaseDialog2 Escape → btnF9_Click)', async () => {
        const before = await ryoTextOf(await rowKeyOf(currentRowName))

        await page.keyboard.press('5')
        await page.keyboard.press('Escape')
        await expect(menDialog, 'ESC phải đóng 面入力 (qua 確定)').toBeHidden({ timeout: 20_000 })

        const after = await ryoTextOf(await rowKeyOf(currentRowName))
        console.log(`TC-M6: trước = ${JSON.stringify(before)} → sau = ${JSON.stringify(after)}`)
        expect(
            after.length,
            'ESC map sang btnF9_Click (BaseDialog2.cs:196-201) nên PHẢI commit thêm một token ' +
                `<歯${FACE_CENTER}>, không được huỷ suông`,
        ).toBeGreaterThan(before.length)
        expect(after, `ESC 確定 với mặt 中央 phải sinh token <歯${FACE_CENTER}>`).toMatch(
            new RegExp(`<[\\s\\S]{1,2}${FACE_CENTER}>`),
        )

        // ESC 確定 đi hệt đường F9: đóng 面入力 → closeMenInput → ô 回 về 編集モード.
        await expect
            .poll(focusedGridCellKey, {
                timeout: 10_000,
                message: 'ESC 確定 cũng phải trả focus + 編集モード về ô 回 (như TC-M4)',
            })
            .toMatch(new RegExp(`\\|${COL_KAI}$`))
        // Thoát editor để TC-M7 xuất phát từ lưới tĩnh (xem ghi chú cuối TC-M4).
        await page.keyboard.press('Escape')

        // Phòng xa: cảnh báo của luồng khác (nếu có) giăng overlay z-[200] chặn click
        // của TC-M7. Đường 処置選択 không chạy SingleChk nên thường rỗng — xem TC-M4.
        await drainAlerts()
        await step()
    })

    // ── TC-M7 ────────────────────────────────────────────────────────────────
    test(`TC-M7 — đối chứng âm: ${TRT_CD}-${SB_NO_MEN} (men=0) KHÔNG mở 面入力`, async () => {
        await pickVariant(SB_NO_MEN)

        // Chờ một nhịp render rồi mới khẳng định "không mở": `toBeHidden` auto-wait
        // cho tới khi ẩn, nên nó KHÔNG bắt được trường hợp mở muộn — dùng dòng lưới
        // đã cập nhật làm mốc thật (Rule 7), rồi mới kiểm.
        await expect(ryoCells().filter({ hasText: '充填' }).first()).toBeVisible({
            timeout: 20_000,
        })
        expect(
            await menDialog.count(),
            `${TRT_CD}-${SB_NO_MEN} có mst_trt.men = 0 nên frm203016.cs:1567 KHÔNG được mở 面入力. ` +
                'Mở ra = cổng `men` bị bỏ qua, mọi 処置 sẽ hỏi mặt răng.',
        ).toBe(0)
        await step()
    })

    // ── TC-M8 (Rule 18.1 — GHI DB) ───────────────────────────────────────────
    test('TC-M8 — F9 登録 rồi: trn_trn.freewd mang token 面 (chỗ trước đây luôn rỗng)', async () => {
        skipWithReason(
            !ALLOW_SAVE,
            'TC-M8 cần TEST_ALLOW_SAVE=1 — nó bấm F9 登録, mà bulk-save ghi lại TOÀN BỘ 処置行 ' +
                `của tháng ${TRT_DT}`,
        )
        if (!ALLOW_SAVE) return

        // Dựng lại từ đầu để dòng đem đi lưu có đúng MỘT token, dễ đối chiếu.
        await reseed()
        await openTreatmentScreen()
        await pickVariant(SB_MEN)
        await expect(menDialog).toBeVisible({ timeout: 20_000 })
        await page.keyboard.press('5')
        await page.keyboard.press('4')
        await menDialog.locator('[data-fkey="F9"]').click()
        await expect(menDialog).toBeHidden({ timeout: 20_000 })

        await closeDialogs(page)
        const done = page.waitForResponse(
            (r) => r.url().includes(BULK_SAVE_PATH) && r.request().method() === 'POST',
            { timeout: 60_000 },
        )
        await page.getByRole('button', { name: /F9\s*登録/ }).click()
        const confirmYes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        if (await confirmYes.count()) await confirmYes.first().click()
        const res = await done
        expect(res.status(), `POST ${BULK_SAVE_PATH} phải thành công`).toBeLessThan(400)

        const saved = await withDb(async (c) => {
            const r = await c.query<{ dsp_trt: string | null; freewd: string | null }>(
                `SELECT dsp_trt, freewd
                   FROM trn_trn
                  WHERE pat_no = $1 AND trt_dt = $2 AND trt_cd = $3 AND trt_sb = $4
                    AND deleted_at IS NULL
                  ORDER BY disp_no`,
                [Number(PAT_NO), TRT_DT, TRT_CD, SB_MEN],
            )
            return r.rows
        })
        console.log(`TC-M8: trn_trn = ${JSON.stringify(saved)}`)

        expect(
            saved.length,
            `không thấy dòng ${TRT_CD}-${SB_MEN} đã lưu — F9 登録 chưa ghi được, chưa kiểm được freewd`,
        ).toBeGreaterThan(0)

        const re = new RegExp(`<[\\s\\S]{1,2}${EXPECT_SURFACES}>`)
        expect(
            saved.some((r) => re.test(r.freewd ?? '')),
            `trn_trn.freewd phải mang token 「<歯${EXPECT_SURFACES}>」 (frm203035.fixProc ghi CẢ cột 2 ` +
                'lẫn cột 72). Rỗng = đúng cái bug ban đầu: 面入力 không có producer nào ghi freewd. ' +
                `Đang có: ${JSON.stringify(saved.map((r) => r.freewd))}`,
        ).toBe(true)
        expect(
            saved.some((r) => re.test(r.dsp_trt ?? '')),
            `trn_trn.dsp_trt cũng phải mang token — fixProc ghi cả hai cột. Đang có: ` +
                JSON.stringify(saved.map((r) => r.dsp_trt)),
        ).toBe(true)
        await step()
    })
})
