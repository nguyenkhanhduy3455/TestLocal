/**
 * SidePanel — ô 選択№ + Enter: PARITY CHUNG cho CẢ 4 TAB (病検/ガイド/パック/個別).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO LÀ FILE RIÊNG
 * ═══════════════════════════════════════════════════════════════════════════
 * Tách ra từ `guide-sidepanel-handler.spec.ts`. File đó 2.140 dòng / 77 testcase
 * và chứa HAI chủ đề không liên quan — hành vi của riêng tab ガイド, và parity ô
 * 選択№ dùng chung cho cả 4 tab — mỗi chủ đề một `describe` với `beforeAll` và
 * một lượt login riêng. Gộp chung chỉ làm mỗi lần mở file phải cuộn qua chủ đề
 * không liên quan, và `mode: 'serial'` khiến một testcase ガイド đỏ sẽ SKIP luôn
 * toàn bộ nhóm parity này.
 *
 * Nội dung testcase giữ NGUYÊN VĂN, không sửa một assert nào. Chú thích WinForm
 * của nhóm nằm ngay dưới đây, đúng như lúc còn chung file.
 */
import { type Locator, type Page } from '@playwright/test'

import { patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/** Bệnh nhân test — xem `guide-sidepanel-handler.spec.ts` để biết vì sao 12138. */
const PAT_NO = patNo('12138')

/** 診療日. '' = để app tự chọn, giống khi người dùng bấm vào từ danh sách. */
const TRT_DT = trtDt('')

/** Số dòng tối đa quét khi dò một dòng hợp lệ trong lưới. */
const SCAN_LIMIT = 8

test.describe.configure({ mode: 'serial' })

// ═════════════════════════════════════════════════════════════════════════════
// SidePanel — ô 選択№ + Enter: PARITY CHUNG cho CẢ 4 TAB (病検/ガイド/パック/個別)
//
// Tab ガイド đã được port đúng `txtGuid1Sel_KeyDown` (frm203002.cs:6728). Ba tab
// còn lại dùng chung một handler viết tay KHÁC WinForm. Nhóm testcase dưới đây
// chốt SPEC THEO WINFORM cho cả 4 tab — nhiều testcase sẽ ĐỎ cho tới khi web
// được sửa, đó là chủ đích (spec-first), KHÔNG phải test viết sai.
//
// ─── Bảng quyết định lấy thẳng từ WinForm ────────────────────────────────────
// Gọi N = số dòng đang hiển thị của tab.
//
//  ┌──────────────┬──────────────────────┬──────────────────────────────────────┐
//  │ Ô № nhập     │ ガイド/パック/個別    │ 病検                                 │
//  ├──────────────┼──────────────────────┼──────────────────────────────────────┤
//  │ 1..N (hợp lệ)│ nhảy dòng + CHỐT dòng│ nhảy dòng + CHỐT dòng                │
//  │ ngoài phạm vi│ KHÔNG nhảy dòng      │ KHÔNG nhảy, KHÔNG chốt               │
//  │ (0 / 999)    │ nhưng VẪN CHỐT dòng  │ (guard `Val(txt) < grdByou.Rows.Count│
//  │              │ đang sáng            │  && Val(txt) != 0`, :6451/:6453)     │
//  │ RỖNG         │ KHÔNG làm gì         │ KHÔNG làm gì                         │
//  │              │ (int.TryParse fail)  │ (`Val("") == 0` → guard chặn)        │
//  └──────────────┴──────────────────────┴──────────────────────────────────────┘
//
// Cột giữa PHẢN TRỰC GIÁC nhưng đúng bản gốc: lời gọi `grd*_KeyDown(Return)` nằm
// NGOÀI khối `if (0 <= intRow && intRow < Rows.Count)`:
//   · ガイド : frm203002.cs:6759  grdGuid_KeyDown(txtGuid1Sel, Return)
//   · パック : frm203002.cs:6889  grdPack_KeyDown(txtPackSentakuNo, Return)
//   · 個別  : frm203002.cs:6970  grdKobe_KeyDown(txtKobetuSel, Return)
// còn 病検 đi đường khác hẳn (txtByokenSel_KeyPress, :6430) và CÓ guard chặn.
//
// KHÔNG off-by-one: `intRow--` (guide :6753, pack :6883). Ở 病検/個別 dòng
// `//intRow--` bị COMMENT nhưng lưới legacy có 1 dòng dummy ẩn ở index 0 nên
// hai cách vẫn TƯƠNG ĐƯƠNG 1-based. Web dùng mảng 0-based + `Number(no) - 1` là
// chuẩn — các testcase 「№ 1 → dòng thứ nhất」 dưới đây là chốt chặn để không ai
// "sửa ngược" thành 0-based khi đọc nhầm dòng comment đó.
//
// ─── Web port đang lệch ở đâu (apps/web-tenant/.../treatment-side-panel.tsx) ──
//  · 病検 :1061-1070 — `byouNo.trim() ? Number(byouNo) - 1 : (selectedByouIdx ?? -1)`
//      → ô RỖNG lại chốt dòng đang sáng (WinForm không làm gì); và KHÔNG hề
//        setSelectedByouIdx nên № hợp lệ cũng không dời dòng sáng.
//  · ガイド :1135-1162 — ĐÃ ĐÚNG (bản port verbatim).
//  · パック :1181-1196 / 個別 :1260-1281 — `if (item)` bọc CẢ setSelectedIdx lẫn
//        onPick → № ngoài phạm vi không chốt gì (WinForm vẫn chốt dòng đang sáng),
//        còn № rỗng lại chốt dòng đang sáng (WinForm không làm gì).
//
// ─── Chạy ────────────────────────────────────────────────────────────────────
// File chạy `mode: 'serial'` (khai ở đầu file): testcase ĐỎ ĐẦU TIÊN sẽ SKIP mọi
// testcase sau nó. Mỗi testcase dưới đây TỰ DỰNG trạng thái bằng openTab() nên
// chạy lẻ được — sửa xong điểm nào thì grep chạy riêng điểm đó:
//   npx playwright test tests/side-panel/guide-sidepanel-handler.spec.ts -g "パック: № ngoài phạm vi"
//
// Khối này LOGIN RIÊNG (beforeAll của nó) → cả file tốn 2 lượt login, vẫn dưới
// ngưỡng 10 của GUIDELINE 10.1.
//
// GHI DỮ LIỆU: các testcase 病検 (chèn 部位病名行) và 個別 (append 処置) chỉ đổi
// state React của lưới đăng ký, KHÔNG gọi API lưu (F12/登録 không bao giờ được
// bấm ở đây) → không đụng DB. Lưới bẩn dần trong phiên là chấp nhận được vì mọi
// assert đều đo DELTA số ô lưới, không đo giá trị tuyệt đối. KHÔNG nạp lại trang
// giữa suite để dọn — `page.goto` giữa phiên làm SPA không boot lại được (xem
// chú thích 「WinForm parity 1」 phía trên).
// ═════════════════════════════════════════════════════════════════════════════

/** Dòng tab 病検 — header cũng dùng grid-cols-[44px_270px_1fr] nên phải kèm cursor-pointer. */
const BYOU_ROW_SEL = 'div[class*="grid-cols-[44px_270px_1fr]"][class*="cursor-pointer"]'
/** Dòng tab ガイド (treatment-side-panel.tsx:857). */
const GUID_ROW_SEL = 'div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]'
/** Dòng tab パック (treatment-side-panel.tsx:902). */
const PACK_ROW_SEL = 'div[class*="grid-cols-[42px_1fr]"][class*="cursor-pointer"]'
/**
 * Dòng tab 個別 — list ẢO (react-virtual), chỉ cửa sổ đang nhìn có mặt trong DOM.
 * `data-index` (treatment-side-panel.tsx:950) là CHỈ SỐ THẬT trong mst_trt, nên
 * mọi phép đo dòng của tab này phải đọc data-index chứ không đếm thứ tự DOM.
 */
const KOBE_ROW_SEL = 'div[data-index]'

type SideTab = '病検' | 'ガイド' | 'パック' | '個別'

test.describe('SidePanel — 選択№ + Enter parity 4 tab (病検/ガイド/パック/個別)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Khung side panel (w-[450px]) — mọi locator lưới đều bám vào đây. */
    let sidePanel: Locator
    /** 4 nút tab — nút đang mở mang class `bg-accent` (treatment-side-panel.tsx:758). */
    let tabBtns: Locator
    /** Ô 選択№ của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
    let noInput: Locator

    let byouRows: Locator
    let guidRows: Locator
    let packRows: Locator
    let kobeRows: Locator

    /** Dialog ガイド処置選択 (frm203017) / パック処置選択 (frm203014). */
    let guidePicker: Locator
    let packPicker: Locator
    /** カルテ記載選択 do AutoSantei bung ra — xem chú thích ở khối trên. */
    let karteCmtDialog: Locator
    /** Alert khi list 処置 của dialog rỗng (frm203017.cs:1015 / frm203014.cs:124). */
    let guideNoTrtAlert: Locator
    let packNoTrtAlert: Locator

    /** Ô của lưới đăng ký (registration-table.tsx:244) — mốc đo 「đã chốt 処置 chưa」. */
    let gridCells: Locator

    /** Tên tab đang mở. */
    async function activeTab(): Promise<string> {
        return tabBtns.evaluateAll(
            (els) => els.find((e) => e.className.includes('bg-accent'))?.textContent?.trim() ?? '',
        )
    }

    /** Index dòng đang sáng (#ffffc0) của một list KHÔNG ảo; -1 nếu không có dòng nào. */
    async function highlightedIdx(rowsLoc: Locator): Promise<number> {
        return rowsLoc.evaluateAll((els) =>
            els.findIndex((e) => e.className.includes('bg-[#ffffc0]')),
        )
    }

    /**
     * Index THẬT của dòng 個別 đang sáng. KHÔNG dùng highlightedIdx() được: list ảo
     * nên thứ tự DOM ≠ thứ tự dữ liệu — phải đọc data-index.
     */
    async function kobeHighlightedIdx(): Promise<number> {
        const hit = sidePanel.locator(`${KOBE_ROW_SEL}[class*="bg-[#ffffc0]"]`)
        if ((await hit.count()) === 0) return -1
        return Number(await hit.first().getAttribute('data-index'))
    }

    /** Đóng sạch dialog/alert đang mở: OK trước (alert), rồi F10 (picker). */
    async function closeAnyDialogs(max = 6) {
        for (let i = 0; i < max; i++) {
            const ok = page.getByRole('button', { name: 'OK' })
            if (await ok.count()) {
                await ok.first().click()
                await expect(ok.first())
                    .toBeHidden({ timeout: 10000 })
                    .catch(() => {})
                continue
            }
            const dlg = page.getByRole('dialog')
            if ((await dlg.count()) === 0) return
            await page.keyboard.press('F10')
            await expect(dlg.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }
    }

    /**
     * Mở một tab và chờ list của nó sẵn sàng, sau khi đã dọn mọi dialog còn sót.
     * Tab ガイド đi bằng PHÍM F4 — đó là đường đi WinForm (KeyFunc(F4),
     * frm203002.cs:4698) và cũng là điều kiện để list có data (GUIDELINE 10.7).
     */
    async function openTab(tab: SideTab) {
        await closeAnyDialogs()
        if ((await activeTab()) !== tab) {
            if (tab === 'ガイド') await page.keyboard.press('F4')
            else await sidePanel.getByRole('button', { name: tab, exact: true }).click()
        }
        await expect.poll(() => activeTab(), { timeout: 15000 }).toBe(tab)

        const ready =
            tab === '病検'
                ? byouRows.first().or(sidePanel.getByText('未登録'))
                : tab === 'ガイド'
                  ? guidRows.first().or(sidePanel.getByText('未登録'))
                  : tab === 'パック'
                    ? packRows.first().or(sidePanel.getByText('未登録'))
                    : kobeRows.first().or(sidePanel.getByText('該当なし'))
        await expect(ready).toBeVisible({ timeout: 30000 })
        // Ô № của tab vừa mở — mọi thao tác bàn phím bên dưới bám vào nó, và
        // effect :691 chỉ focus nó khi tab đã dựng xong.
        await expect(noInput).toHaveCount(1)
    }

    /**
     * Mốc 「app đã xử lý xong cú Enter」 cho các assert VẮNG MẶT (GUIDELINE Rule 7:
     * không sleep). Bấm ↓ một nhịp: nếu cú Enter trước đó KHÔNG dời dòng sáng và
     * KHÔNG kéo focus ra khỏi side panel thì ô № phải thành (beforeIdx + 1) + 1.
     * Bấm ↑ trả dòng sáng về chỗ cũ.
     *
     * `total` bỏ trống cho list dài (個別) — chỉ cần biết ↓ không bị clamp.
     */
    async function arrowDownAnchor(beforeIdx: number, total = Number.POSITIVE_INFINITY) {
        const from = Math.max(beforeIdx, 0)
        const after = Math.min(from + 1, total - 1)
        await page.keyboard.press('ArrowDown')
        await expect(
            noInput,
            'ô № không nhích theo ↓ → cú Enter trước đó đã dời dòng sáng hoặc đã kéo focus ' +
                'ra khỏi side panel (tức là NÓ ĐÃ CHỐT một dòng)',
        ).toHaveValue(String(after + 1))
        if (after > from) await page.keyboard.press('ArrowUp')
    }

    /**
     * Bắt lỗi 「dialog NHÁY một nhịp rồi tự đóng」.
     * `expect(...).toBeHidden()` KHÔNG bắt được: lúc assert chạy thì dialog đã tắt.
     * Nên cắm MutationObserver TRƯỚC thao tác, đếm số lần một node chứa `marker`
     * được CHÈN vào DOM. WinForm đóng form TRƯỚC khi vẽ (frm203017.cs:1001,
     * frm203014.cs:122) ⇒ với list 処置 rỗng, số lần phải là 0.
     */
    async function armFlashWatch(marker: string) {
        await page.evaluate((m) => {
            const w = window as unknown as { __flashN?: number; __flashObs?: MutationObserver }
            w.__flashObs?.disconnect()
            w.__flashN = 0
            const obs = new MutationObserver((muts) => {
                for (const mu of muts) {
                    for (const n of Array.from(mu.addedNodes)) {
                        if (n.nodeType !== 1) continue
                        if (((n as Element).textContent ?? '').includes(m)) {
                            w.__flashN = (w.__flashN ?? 0) + 1
                        }
                    }
                }
            })
            obs.observe(document.body, { childList: true, subtree: true })
            w.__flashObs = obs
        }, marker)
    }

    /** Số lần `marker` xuất hiện kể từ armFlashWatch(); đồng thời gỡ observer. */
    async function readFlashWatch(): Promise<number> {
        return page.evaluate(() => {
            const w = window as unknown as { __flashN?: number; __flashObs?: MutationObserver }
            w.__flashObs?.disconnect()
            return w.__flashN ?? 0
        })
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung theo
     *  worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        // Page chia sẻ theo worker (`_shared/session.ts`): đăng nhập một lượt cho cả
        // worker thay vì mỗi file một lần — app chặn ở 10 login/khung thời gian
        // (Rule 10.1). `afterAll` gọi `releaseSharedPage`, KHÔNG `page.close()`.
        page = authedPage
        // Popup 算定 nổi đè và nuốt click, thời điểm bung không đoán được nên để
        // Playwright tự dọn (Rule 14).
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await expect(page, 'goto màn 診療入力 mà bị đá về trang khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        tabBtns = sidePanel.getByRole('button', { name: /^(病検|ガイド|パック|個別)$/ })
        noInput = page.locator('input[data-side-anchor]')

        byouRows = sidePanel.locator(BYOU_ROW_SEL)
        guidRows = sidePanel.locator(GUID_ROW_SEL)
        packRows = sidePanel.locator(PACK_ROW_SEL)
        kobeRows = sidePanel.locator(KOBE_ROW_SEL)

        guidePicker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        packPicker = page.getByRole('dialog').filter({ hasText: 'パック番号' })
        guideNoTrtAlert = page.getByText('算定できる処置がありません')
        packNoTrtAlert = page.getByText('算定可能な処置はありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })

        gridCells = page.locator('[data-grid-cell]')

        // Nhịp cuối của chuỗi AutoSantei — xem drainAutoSantei của khối trên.
        // Khối này cũng phải dọn, nếu không dialog nằm lại và cướp focus / nuốt
        // phím giữa suite (đã vấp: TC 「病検: № ngoài phạm vi」 đỏ vì nó).
        await page.addLocatorHandler(
            karteCmtDialog,
            async () => {
                await karteCmtDialog
                    .getByRole('button', { name: 'F10 戻る' })
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {})
            },
            { times: 30 },
        )
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
            await page.waitForTimeout(700)
        }
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab 病検 — txtByokenSel_KeyPress (frm203002.cs:6430)
    // Đây là tab DUY NHẤT có guard phạm vi, nên nó là tab duy nhất KHÔNG chốt gì
    // khi № sai. Click 1 dòng ở tab này áp 部位病名 rồi NHẢY sang tab ガイド
    // (handleByouPick → jumpToGuideTab, treatment-entry-detail.tsx:2278), nên
    // 「đã chốt hay chưa」 đo bằng chính cú nhảy tab đó.
    // ─────────────────────────────────────────────────────────────────────────

    test('病検: cột No. đánh số 1..N (1-based), khớp số gõ vào ô 選択№', async () => {
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        for (let i = 0; i < Math.min(n, SCAN_LIMIT); i++) {
            await expect(
                byouRows.nth(i).locator('div').first(),
                `dòng ${i} sai số thứ tự — cột No. phải là index + 1`,
            ).toHaveText(String(i + 1))
        }
        await step()
    })

    test('病検: № hợp lệ + Enter → áp 部位病名 (nhảy sang tab ガイド)', async () => {
        // txtByokenSel_KeyPress (frm203002.cs:6451-6474): Val != 0 và
        // Val < grdByou.Rows.Count ⇒ pByoken_Let_Data(№) + pByoken_Dis_Move_Cell.
        // Web: handleByouPick chèn 部位病名行 rồi jumpToGuideTab (:2278) — cú nhảy
        // tab đó là tín hiệu 「đã chốt」 duy nhất quan sát được từ ngoài.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        const target = Math.min(2, n) // № 1-based
        await noInput.click()
        await noInput.fill(String(target))
        await step()
        await noInput.press('Enter')

        await expect
            .poll(() => activeTab(), { timeout: 20000 })
            .toBe('ガイド')
        await step()

        // Quay lại 病検 để soi dòng sáng: WinForm pByoken_Let_Data đặt CurrentCell
        // về đúng dòng đã nhập. Web (:1061-1070) KHÔNG hề setSelectedByouIdx.
        await openTab('病検')
        if ((await byouRows.count()) !== n) {
            // Áp 部位病名 xong list 病検 đổi độ dài → prevByouLen guard (:579) reset
            // dòng sáng về 0. Không đủ dữ kiện để phán, log rồi bỏ qua phần này.
            console.log(
                `BỎ QUA phần dòng sáng: list 病検 đổi ${n} → ${await byouRows.count()} dòng sau khi áp`,
            )
            return
        }
        expect(
            await highlightedIdx(byouRows),
            'WinForm pByoken_Let_Data đặt CurrentCell về dòng của №; web không dời dòng sáng',
        ).toBe(target - 1)
        await expect(noInput).toHaveValue(String(target))
        await step()
    })

    test('病検: № ngoài phạm vi (999) + Enter → KHÔNG chốt gì, dòng sáng giữ nguyên', async () => {
        // KHÁC 3 tab kia: txtByokenSel_KeyPress CÓ guard
        //   frm203002.cs:6453  if (Conversion.Val(txtByokenSel.Text) < grdByou.Rows.Count)
        // nên № ngoài phạm vi bị chặn TRƯỚC pByoken_Let_Data ⇒ không áp gì cả.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('999')
        await step()
        await noInput.press('Enter')

        // Mốc đồng bộ: ↓ vẫn ăn ⇒ focus còn ở side panel ⇒ Enter đã không chốt gì.
        await arrowDownAnchor(before, n)
        expect(await activeTab(), '№ ngoài phạm vi mà vẫn nhảy sang tab ガイド → đã áp 部位病名').toBe(
            '病検',
        )
        expect(await highlightedIdx(byouRows), '№ ngoài phạm vi không được dời dòng sáng').toBe(
            before,
        )
        expect(
            await gridCells.count(),
            'guard frm203002.cs:6453 chặn № ngoài phạm vi → lưới đăng ký không được đổi',
        ).toBe(beforeCells)
        await step()
    })

    test('病検: № = 0 + Enter → KHÔNG chốt gì (guard Val(txt) != 0)', async () => {
        // frm203002.cs:6451  if (Conversion.Val(txtByokenSel.Text) != 0)
        // № 0 rơi thẳng ra ngoài, không chạm pByoken_Let_Data.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('0')
        await step()
        await noInput.press('Enter')

        await arrowDownAnchor(before, n)
        expect(await activeTab(), '№ 0 mà vẫn nhảy sang tab ガイド → đã áp 部位病名').toBe('病検')
        expect(await highlightedIdx(byouRows), '№ 0 không được dời dòng sáng').toBe(before)
        expect(await gridCells.count(), '№ 0 mà lưới đăng ký vẫn đổi').toBe(beforeCells)
        await step()
    })

    test('病検: ô № RỖNG + Enter → KHÔNG chốt gì (Val("") == 0 nên guard chặn)', async () => {
        // PHẢN TRỰC GIÁC — đọc kỹ: Conversion.Val("") trả 0, nên guard
        // frm203002.cs:6451 `Val(txt) != 0` chặn luôn. WinForm KHÔNG rơi về dòng
        // đang sáng. Web (:1066) lại `byouNo.trim() ? … : (selectedByouIdx ?? -1)`
        // → ô rỗng chốt dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n === 0, '病検 của bệnh nhân test không có dòng nào (未登録)')

        await noInput.click()
        const before = await highlightedIdx(byouRows)
        const beforeCells = await gridCells.count()

        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        await arrowDownAnchor(before, n)
        expect(
            await activeTab(),
            'WinForm: `Val("") == 0` → guard :6451 chặn, KHÔNG áp 部位病名 và KHÔNG nhảy tab ガイド',
        ).toBe('病検')
        expect(await highlightedIdx(byouRows), 'ô № rỗng không được dời dòng sáng').toBe(before)
        expect(await gridCells.count(), 'ô № rỗng mà lưới đăng ký vẫn đổi').toBe(beforeCells)
        await step()
    })

    test('病検: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        // Không kiểm nhánh CLICK ở tab này: click 1 dòng 病検 áp luôn 部位病名 rồi
        // nhảy sang tab ガイド (:811-815) nên ô № của 病検 không còn để mà soi.
        await openTab('病検')
        const n = await byouRows.count()
        test.skip(n < 2, '病検 cần ≥ 2 dòng để kiểm đồng bộ ↑/↓')

        await noInput.click()
        const start = await highlightedIdx(byouRows)
        await page.keyboard.press('ArrowDown')
        const down = Math.min(Math.max(start, 0) + 1, n - 1)
        expect(await highlightedIdx(byouRows), '↓ không xuống dòng').toBe(down)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        const up = Math.max(down - 1, 0)
        expect(await highlightedIdx(byouRows), '↑ không lên dòng').toBe(up)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(up + 1))
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab ガイド — chỉ bổ sung chốt chặn 1-based.
    // Ba hành vi còn lại của tab này ĐÃ có testcase riêng ở khối trên:
    //   · № hợp lệ  → 「Enter trên ô No. có số → nhảy đúng dòng đó rồi mở dialog…」
    //   · № sai     → 「WinForm parity 3: Enter với No. ngoài phạm vi → vẫn mở dialog…」
    //   · № rỗng    → 「WinForm parity 4: Enter với ô No. RỖNG → không mở gì…」
    //   · ↑/↓ đồng bộ → 「↑/↓ đổi dòng sáng và kéo theo ô No., có clamp ở hai đầu」
    // Không viết lại ở đây để khỏi trùng lặp.
    // ─────────────────────────────────────────────────────────────────────────

    test('ガイド: № 1 → dòng thứ nhất, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // `intRow--` (frm203002.cs:6753) + cột GuidNum = intRow + 1 (:1981) ⇒ số
        // hiển thị và số gõ vào là CÙNG một hệ 1-based. Web dùng Number(no) - 1
        // trên mảng 0-based là tương đương. Chốt chặn để không ai đọc nhầm dòng
        // `//intRow--` của tab 病検/個別 rồi "sửa ngược" cả 4 tab thành 0-based.
        await openTab('ガイド')
        const n = await guidRows.count()
        test.skip(n < 2, 'tab ガイド cần ≥ 2 dòng để kiểm off-by-one')

        for (const no of [1, 2]) {
            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')

            // Chốt một dòng ガイド ra 1 trong 2 kết quả: dialog có 処置, hoặc alert
            // 「算定できる処置がありません。」 (dialog tự đóng). Chờ CẢ HAI.
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            expect(
                await highlightedIdx(guidRows),
                `№ ${no} phải trúng dòng thứ ${no} (index ${no - 1}) — sai là đã thành 0-based`,
            ).toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab パック — txtPackSentakuNo_KeyDown (frm203002.cs:6858)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Chốt kết quả một cú pick パック: dialog パック処置選択, HOẶC alert
     * 「算定可能な処置はありません。」 (frm203014.cs:122-126 đóng form rồi báo).
     */
    async function waitPackPick(): Promise<'picker' | 'alert'> {
        await expect(packPicker.or(packNoTrtAlert).first()).toBeVisible({ timeout: 30000 })
        return (await packNoTrtAlert.count()) > 0 ? 'alert' : 'picker'
    }

    test('パック: № hợp lệ + Enter → dời dòng sáng tới dòng đó VÀ chốt dòng đó', async () => {
        // frm203002.cs:6879-6889: intRow-- → CurrentCell = dòng đó → grdPack_KeyDown(Return).
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        const target = Math.min(3, n) // № 1-based
        const nm = (await packRows.nth(target - 1).locator('div').nth(1).innerText()).trim()

        await noInput.click()
        await noInput.fill(String(target))
        await step()
        await noInput.press('Enter')

        const result = await waitPackPick()
        expect(await highlightedIdx(packRows), 'Enter № phải dời dòng sáng tới dòng của №').toBe(
            target - 1,
        )
        if (result === 'picker' && nm) {
            await expect(
                packPicker.getByText(nm, { exact: true }).first(),
                'dialog phải là của ĐÚNG dòng vừa nhảy tới',
            ).toBeVisible()
        }
        console.log(`パック Enter № ${target} 「${nm}」 → ${result}`)
        await step()
        await closeAnyDialogs()
    })

    test('パック: № ngoài phạm vi (9999) + Enter → KHÔNG dời dòng sáng NHƯNG VẪN chốt dòng đang sáng', async () => {
        // PHẢN TRỰC GIÁC — nguồn: frm203002.cs:6880-6889
        //   if (int.TryParse(txtPackSentakuNo.Text, out intRow)) {
        //       intRow--;
        //       if (0 <= intRow && intRow < grdPack.Rows.Count) { CurrentCell = …; }
        //       grdPack_KeyDown(txtPackSentakuNo, Return);      ← NGOÀI khối if ⇒ LUÔN chạy
        //   }
        // ⇒ № sai chỉ bỏ qua bước NHẢY DÒNG, cú chốt vẫn nổ cho dòng đang sáng.
        // Web (:1188-1194) bọc cả hai trong `if (item)` nên không làm gì cả ⇒ ĐỎ.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        // Dựng dòng sáng ở một dòng ≠ 0 để phân biệt với "rơi về dòng đầu".
        await noInput.click()
        if (n >= 2) await page.keyboard.press('ArrowDown')
        const before = await highlightedIdx(packRows)
        const nm = (await packRows.nth(Math.max(before, 0)).locator('div').nth(1).innerText()).trim()

        await noInput.fill('9999')
        await step()
        await noInput.press('Enter')

        try {
            await expect(
                packPicker.or(packNoTrtAlert).first(),
                'WinForm: grdPack_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi ' +
                    '(frm203002.cs:6889) → № sai vẫn phải chốt dòng đang sáng. Web đang ' +
                    'return sớm khi list[idx] undefined (treatment-side-panel.tsx:1188).',
            ).toBeVisible({ timeout: 15000 })
            // CurrentCell không đổi → phải là dialog của ĐÚNG dòng đang sáng trước đó.
            expect(await highlightedIdx(packRows), '№ ngoài phạm vi không được dời dòng sáng').toBe(
                before,
            )
            if ((await packPicker.count()) > 0 && nm) {
                await expect(packPicker.getByText(nm, { exact: true }).first()).toBeVisible()
            }
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック: ô № RỖNG + Enter → KHÔNG chốt gì (int.TryParse("") thất bại)', async () => {
        // frm203002.cs:6880 — TOÀN BỘ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ không nhảy dòng, không chốt. Web (:1187) lại
        // `packNo.trim() ? Number(packNo) - 1 : (selectedPackIdx ?? -1)` nên rơi về
        // dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n === 0, 'tenant không có パック nào trong pac_mst')

        await noInput.click()
        const before = await highlightedIdx(packRows)
        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        try {
            // Soi dialog TRƯỚC: nếu Enter đã mở dialog thì ↑/↓ không còn tác dụng lên
            // side panel nữa, mốc đồng bộ bên dưới sẽ hỏng theo và che mất nguyên nhân.
            await expect(
                packPicker,
                'WinForm: nhánh Enter nằm trong if(int.TryParse) → ô № rỗng KHÔNG mở パック処置選択',
            ).toBeHidden({ timeout: 10000 })
            await expect(
                packNoTrtAlert,
                'ô № rỗng mà vẫn bung alert 算定可能な処置はありません → đã lỡ chốt một dòng',
            ).toHaveCount(0)
            await arrowDownAnchor(before, n)
            expect(await highlightedIdx(packRows), 'ô № rỗng không được dời dòng sáng').toBe(before)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック: № 1 → dòng thứ nhất, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // Cột PackNum = rowIndex + 1 (frm203002.cs:2033) + `intRow--` (:6883) ⇒ 1-based.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để kiểm off-by-one')

        for (const no of [1, 2]) {
            await expect(
                packRows.nth(no - 1).locator('div').first(),
                `cột No. của dòng ${no - 1} phải hiển thị ${no}`,
            ).toHaveText(String(no))

            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')
            await waitPackPick()
            expect(
                await highlightedIdx(packRows),
                `№ ${no} phải trúng dòng thứ ${no} (index ${no - 1}) — sai là đã thành 0-based`,
            ).toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    test('パック: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        // grdPack_RowEnter (frm203002.cs:2228) `txtPackSentakuNo.Text = rowIndex + 1`.
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để kiểm đồng bộ ↑/↓')

        await noInput.click()
        const start = await highlightedIdx(packRows)
        await page.keyboard.press('ArrowDown')
        const down = Math.min(Math.max(start, 0) + 1, n - 1)
        expect(await highlightedIdx(packRows), '↓ không xuống dòng').toBe(down)
        await expect(noInput).toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        const up = Math.max(down - 1, 0)
        expect(await highlightedIdx(packRows), '↑ không lên dòng').toBe(up)
        await expect(noInput).toHaveValue(String(up + 1))
        await step()
    })

    test('パック: click 1 dòng → ô № đồng bộ index + 1', async () => {
        await openTab('パック')
        const n = await packRows.count()
        test.skip(n < 2, 'tab パック cần ≥ 2 dòng để phân biệt với dòng mặc định')

        const target = 1 // dòng thứ 2
        await packRows.nth(target).click()
        expect(await highlightedIdx(packRows), 'click không chuyển dòng sáng').toBe(target)
        await expect(noInput, 'grdPack_RowEnter: ô № phải bám dòng sáng').toHaveValue(
            String(target + 1),
        )
        await step()
        await closeAnyDialogs()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Tab 個別 — txtKobetuSel_KeyDown (frm203002.cs:6939)
    // Chốt một dòng 個別 KHÔNG mở dialog mà APPEND thẳng 処置 vào lưới đăng ký
    // (onKobetuPick → handleKobetuPicks, treatment-entry-detail.tsx:4471), nên
    // 「đã chốt hay chưa」 đo bằng số ô [data-grid-cell] của lưới.
    // Một vài mã 処置 đặc biệt lại mở dialog nhập liệu trước khi chèn
    // (openSpecialPickDialog :4475) — coi cả hai đều là 「đã chốt」.
    // ─────────────────────────────────────────────────────────────────────────

    /** Cú chốt 個別 có xảy ra không: lưới thêm ô, HOẶC dialog nhập liệu đặc biệt bung ra. */
    async function kobePickHappened(beforeCells: number, timeout = 15000): Promise<boolean> {
        try {
            await expect
                .poll(
                    async () =>
                        (await gridCells.count()) > beforeCells ||
                        (await page.getByRole('dialog').count()) > 0,
                    { timeout },
                )
                .toBe(true)
            return true
        } catch {
            return false
        }
    }

    test('個別: № hợp lệ + Enter → dời dòng sáng tới dòng đó VÀ append 処置 vào lưới', async () => {
        // frm203002.cs:6960-6970: CurrentCell = dòng của № → grdKobe_KeyDown(Return)
        // → modKobetu.pKobetu_Let_Trt_Data (chèn 処置 vào grdRegi).
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        const beforeCells = await gridCells.count()
        await noInput.click()
        await noInput.fill('2')
        await step()
        await noInput.press('Enter')

        expect(
            await kobePickHappened(beforeCells),
            'Enter № hợp lệ phải append 処置 vào lưới đăng ký',
        ).toBe(true)
        expect(await kobeHighlightedIdx(), 'Enter № phải dời dòng sáng tới dòng của №').toBe(1)
        await step()
        await closeAnyDialogs()
    })

    test('個別: № ngoài phạm vi (999999) + Enter → KHÔNG dời dòng sáng NHƯNG VẪN append dòng đang sáng', async () => {
        // PHẢN TRỰC GIÁC — nguồn: frm203002.cs:6961-6970
        //   if (int.TryParse(txtKobetuSel.Text, out intRow)) {
        //       //intRow--;
        //       if (0 <= intRow && intRow < hfgKobetu.Rows.Count) { CurrentCell = …; }
        //       grdKobe_KeyDown(txtKobetuSel, Return);          ← NGOÀI khối if ⇒ LUÔN chạy
        //   }
        // ⇒ № sai chỉ bỏ qua bước NHẢY DÒNG, 処置 của dòng đang sáng vẫn được append.
        // Web (:1267-1279) bọc cả hai trong `if (item)` nên không làm gì cả ⇒ ĐỎ.
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        await page.keyboard.press('ArrowDown') // dòng sáng ≠ 0 để phân biệt
        const before = await kobeHighlightedIdx()
        const beforeCells = await gridCells.count()

        await noInput.fill('999999')
        await step()
        await noInput.press('Enter')

        try {
            expect(
                await kobePickHappened(beforeCells),
                'WinForm: grdKobe_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi ' +
                    '(frm203002.cs:6970) → № sai vẫn phải append 処置 của dòng đang sáng. ' +
                    'Web đang return sớm khi list[idx] undefined (treatment-side-panel.tsx:1267).',
            ).toBe(true)
            expect(await kobeHighlightedIdx(), '№ ngoài phạm vi không được dời dòng sáng').toBe(
                before,
            )
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('個別: ô № RỖNG + Enter → KHÔNG append gì (int.TryParse("") thất bại)', async () => {
        // frm203002.cs:6961 — toàn bộ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ không nhảy dòng, không append. Web (:1266) lại
        // `kobeNo.trim() ? Number(kobeNo) - 1 : (selectedKobeIdx ?? -1)` nên rơi về
        // dòng đang sáng ⇒ testcase này ĐỎ cho tới khi sửa.
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        const before = await kobeHighlightedIdx()
        const beforeCells = await gridCells.count()

        await noInput.fill('')
        await step()
        await noInput.press('Enter')

        try {
            // Mốc đồng bộ trước: ↓ vẫn ăn ⇒ focus còn ở side panel ⇒ Enter chưa append
            // (append xong focus bị kéo sang ô 回 của lưới — setPendingFocusPickId :4486).
            await arrowDownAnchor(before)
            expect(
                await gridCells.count(),
                'WinForm: ô № rỗng không qua nổi int.TryParse → lưới đăng ký KHÔNG được đổi',
            ).toBe(beforeCells)
            await expect(
                page.getByRole('dialog'),
                'ô № rỗng mà vẫn bung dialog nhập liệu → đã lỡ chốt một 処置',
            ).toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('個別: № 1 → dòng đầu tiên, № 2 → dòng thứ hai (không off-by-one)', async () => {
        // Ở tab này WinForm để `//intRow--` DẠNG COMMENT, nhưng hfgKobetu có 1 dòng
        // dummy ẩn ở index 0 nên `Rows[№]` vẫn là "dòng dữ liệu thứ №" — TƯƠNG ĐƯƠNG
        // 1-based. Web dùng mảng 0-based + Number(no) - 1 là chuẩn. Đừng "sửa ngược".
        await openTab('個別')
        test.skip((await kobeRows.count()) < 2, 'tab 個別 chưa nạp được mst_trt')

        for (const no of [1, 2]) {
            await openTab('個別')
            await noInput.click()
            await noInput.fill(String(no))
            await step()
            await noInput.press('Enter')
            await expect
                .poll(() => kobeHighlightedIdx(), { timeout: 15000 })
                .toBe(no - 1)
            await step()
            await closeAnyDialogs()
        }
    })

    test('個別: ↑/↓ → ô № luôn bằng (index dòng sáng + 1)', async () => {
        await openTab('個別')
        test.skip((await kobeRows.count()) < 3, 'tab 個別 chưa nạp được mst_trt')

        await noInput.click()
        const start = await kobeHighlightedIdx()
        await page.keyboard.press('ArrowDown')
        const down = Math.max(start, 0) + 1
        expect(await kobeHighlightedIdx(), '↓ không xuống dòng').toBe(down)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down + 1))

        await page.keyboard.press('ArrowUp')
        expect(await kobeHighlightedIdx(), '↑ không lên dòng').toBe(down - 1)
        await expect(noInput, 'ô № phải bám dòng sáng (index + 1)').toHaveValue(String(down))
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Dialog 処置選択 với list RỖNG — logic dùng chung useEmptyPickerClose
    // (cnt-cell.tsx:86-104). WinForm đóng form TRƯỚC rồi mới báo lỗi
    // (frm203017.cs:1001-1017 / frm203014.cs:122-126), nên dialog KHÔNG được
    // "nháy" một nhịp rồi tắt, và alert chỉ được bung ĐÚNG MỘT LẦN (ref
    // `notified` chặn cú double-invoke của StrictMode).
    // Cả hai picker phải có guard render `if (items.length === 0) return null`
    // (pack-selection-dialog.tsx:203, guide-selection-dialog.tsx:431) — thiếu nó
    // là dialog bung ra trong lúc query còn chạy rồi mới tự đóng.
    // ─────────────────────────────────────────────────────────────────────────

    test('ガイド rỗng 処置: dialog KHÔNG nháy, alert 「算定できる処置がありません。」 bung ĐÚNG 1 lần', async () => {
        await openTab('ガイド')
        const n = Math.min(await guidRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab ガイド không có dòng nào để dò')

        // Dò dòng ガイド đầu tiên cho list 処置 rỗng. KHÔNG bịa data: tenant nào mọi
        // ガイド đều có 処置 thì testcase tự skip.
        let emptyIdx = -1
        for (let i = 0; i < n; i++) {
            await armFlashWatch('ガイド番号')
            await guidRows.nth(i).click()
            // Mốc phải là DÒNG 処置 trong dialog, KHÔNG phải bản thân dialog: dialog
            // rỗng đóng ngay nên chờ `picker` sẽ lọt nhánh rỗng (xem chú thích đầu file).
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await guideNoTrtAlert.count()) > 0) {
                emptyIdx = i
                break
            }
            await readFlashWatch()
            await closeAnyDialogs()
        }
        test.skip(
            emptyIdx < 0,
            `mọi ガイド trong ${n} dòng đầu đều có 処置 tính được → không có nhánh rỗng để so`,
        )

        const flashes = await readFlashWatch()
        console.log(`ガイド dòng ${emptyIdx + 1}: list 処置 rỗng, dialog xuất hiện ${flashes} lần`)
        try {
            expect(
                flashes,
                'guide-selection-dialog.tsx phải có guard `if (items.length === 0) return null` ' +
                    '(:431, giống pack-selection-dialog.tsx:203) — thiếu nó dialog bung ra trong ' +
                    'lúc query chạy rồi mới tự đóng, tức NHÁY một nhịp. WinForm frm203017.cs:1001 ' +
                    'đóng form TRƯỚC khi vẽ.',
            ).toBe(0)
            await expect(guidePicker, 'alert đã bung mà dialog vẫn còn mở').toBeHidden()
            await expect(guideNoTrtAlert, 'alert 「算定できる処置がありません。」 phải bung ĐÚNG 1 lần').toHaveCount(1)

            // Đóng alert rồi kiểm KHÔNG có alert thứ hai (ref `notified` của
            // useEmptyPickerClose chặn cú double-invoke của StrictMode).
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(guideNoTrtAlert).toBeHidden({ timeout: 10000 })
            // Mốc đồng bộ: side panel nhận lại phím ⇒ app đã xử lý xong, không còn
            // alert nào đang xếp hàng.
            await noInput.click()
            await page.keyboard.press('ArrowDown')
            await expect(guideNoTrtAlert, 'alert bung LẦN THỨ HAI → useEmptyPickerClose chạy 2 lần').toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('ガイド có 処置: dialog Ở LẠI, KHÔNG tự đóng và KHÔNG alert', async () => {
        await openTab('ガイド')
        const n = Math.min(await guidRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab ガイド không có dòng nào để dò')

        let openedIdx = -1
        for (let i = 0; i < n; i++) {
            await guidRows.nth(i).click()
            await expect(
                guidePicker.getByTestId('cell-trtNm').first().or(guideNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await guideNoTrtAlert.count()) === 0) {
                openedIdx = i
                break
            }
            await closeAnyDialogs()
        }
        test.skip(openedIdx < 0, `không ガイド nào trong ${n} dòng đầu có 処置 tính được`)

        try {
            await expect(guidePicker, 'list 処置 CÓ dòng mà dialog vẫn tự đóng').toBeVisible()
            await expect(
                guideNoTrtAlert,
                'list 処置 CÓ dòng mà vẫn bung 「算定できる処置がありません。」',
            ).toHaveCount(0)
            expect(
                await guidePicker.getByTestId('cell-trtNm').count(),
                'dialog mở mà không có dòng 処置 nào',
            ).toBeGreaterThan(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック rỗng 処置: dialog KHÔNG nháy, alert 「算定可能な処置はありません。」 bung ĐÚNG 1 lần', async () => {
        await openTab('パック')
        const n = Math.min(await packRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab パック không có dòng nào để dò')

        let emptyIdx = -1
        for (let i = 0; i < n; i++) {
            await armFlashWatch('パック番号')
            await packRows.nth(i).click()
            await expect(
                packPicker.getByTestId('cell-trtNm').first().or(packNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await packNoTrtAlert.count()) > 0) {
                emptyIdx = i
                break
            }
            await readFlashWatch()
            await closeAnyDialogs()
        }
        test.skip(
            emptyIdx < 0,
            `mọi パック trong ${n} dòng đầu đều có 処置 tính được → không có nhánh rỗng để so`,
        )

        const flashes = await readFlashWatch()
        console.log(`パック dòng ${emptyIdx + 1}: list 処置 rỗng, dialog xuất hiện ${flashes} lần`)
        try {
            expect(
                flashes,
                'pack-selection-dialog.tsx:203 `if (items.length === 0) return null` phải chặn ' +
                    'dialog vẽ ra khi list rỗng — WinForm frm203014.cs:122 Close() TRƯỚC MsgBox.',
            ).toBe(0)
            await expect(packPicker, 'alert đã bung mà dialog vẫn còn mở').toBeHidden()
            await expect(packNoTrtAlert, 'alert 「算定可能な処置はありません。」 phải bung ĐÚNG 1 lần').toHaveCount(1)

            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(packNoTrtAlert).toBeHidden({ timeout: 10000 })
            await noInput.click()
            await page.keyboard.press('ArrowDown')
            await expect(packNoTrtAlert, 'alert bung LẦN THỨ HAI → useEmptyPickerClose chạy 2 lần').toHaveCount(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })

    test('パック có 処置: dialog Ở LẠI, KHÔNG tự đóng và KHÔNG alert', async () => {
        await openTab('パック')
        const n = Math.min(await packRows.count(), SCAN_LIMIT)
        test.skip(n === 0, 'tab パック không có dòng nào để dò')

        let openedIdx = -1
        for (let i = 0; i < n; i++) {
            await packRows.nth(i).click()
            await expect(
                packPicker.getByTestId('cell-trtNm').first().or(packNoTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if ((await packNoTrtAlert.count()) === 0) {
                openedIdx = i
                break
            }
            await closeAnyDialogs()
        }
        test.skip(openedIdx < 0, `không パック nào trong ${n} dòng đầu có 処置 tính được`)

        try {
            await expect(packPicker, 'list 処置 CÓ dòng mà dialog vẫn tự đóng').toBeVisible()
            await expect(
                packNoTrtAlert,
                'list 処置 CÓ dòng mà vẫn bung 「算定可能な処置はありません。」',
            ).toHaveCount(0)
            expect(
                await packPicker.getByTestId('cell-trtNm').count(),
                'dialog mở mà không có dòng 処置 nào',
            ).toBeGreaterThan(0)
        } finally {
            await closeAnyDialogs()
        }
        await step()
    })
})
