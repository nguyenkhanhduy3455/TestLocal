import { type Locator, type Page } from '@playwright/test'

import { patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import { makeStep } from '../_shared/step'

/**
 * SidePanel — tab ガイド (frm203002 《VB6》frmInpMain 07-A「ガイドタブ系」) trên màn
 * 診療入力 `/treatments/{patNo}`.
 *
 * ĐẶC TÍNH KIỂM THỬ: các assert dưới đây bám THEO WINFORM (src/OCHACOM/INP), không
 * bám theo code web. Chỗ nào web lệch WinForm thì tách ra thành testcase riêng tên
 * 「WinForm parity N」 ở cuối file — đỏ ở đó nghĩa là web lệch bản gốc, KHÔNG phải
 * test viết sai.
 *
 * 5 điểm lệch parity 1..5 ĐÃ ĐƯỢC SỬA ở web (commit d9f7dfce
 * 「ガイドタブが WinForm と乖離する5点を修正」) và cả 5 hiện XANH. Giữ lại làm
 * regression guard. Mỗi testcase parity TỰ DỰNG trạng thái nên chạy lẻ được:
 *   npx playwright test tests/side-panel/guide-sidepanel-handler.spec.ts -g "WinForm parity 4"
 * Chạy nguyên file thì testcase đỏ ĐẦU TIÊN sẽ SKIP mọi testcase sau nó (serial).
 *
 * BẪY ĐÃ VẤP, đừng lặp lại: sau khi sửa điểm 5, ガイド không có 処置 làm dialog TỰ
 * ĐÓNG kèm alert E00024. Vì vậy mọi chỗ chốt một dòng ガイド phải mốc vào
 * `waitPickResult()` (dòng 処置 HOẶC alert) chứ KHÔNG phải sự xuất hiện của
 * `picker` — picker vẫn bung ra trong lúc query chạy rồi mới tắt, nên chờ nó sẽ
 * lọt nhánh rỗng và bỏ quên alert, và overlay của alert đó chặn click của
 * testcase kế tiếp (đã từng làm testcase F10 timeout 30s).
 *
 * BẪY THỨ HAI, cùng họ: MỌI modal đang mở đều làm F-key của màn nền CHẾT — không
 * phải "không có tác dụng gì" mà là bị FKeyScopeProvider nuốt hẳn (nhánh
 * `top && !topOwnsKeys` ⇒ preventDefault). AutoSantei tự bung 「カルテ記載選択」
 * (frm203011) lúc vào màn 診療入力, không đoán được lúc nào; để nó đó rồi bấm
 * Shift+F4 thì lưới ガイド đứng im ở list cũ (thường là list 全て表示 vừa nạp) và
 * testcase 「Shift+F4 → dải 1000-1999」 đỏ y như thể BE lọc sai. Vì vậy
 * dismissKarteCmtIfOpen() được gọi ở gotoTreatments + enterGuideRegular và cắm
 * thêm locator handler; dismissPicker() cũng gõ lại F10 sau khi dọn.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - frm203002.cs:1974 getGuidNyuryokuInfo — nạp hfgGuid1 từ
 *    ImpMstTrt.getInpGuidNyuryokuData; `GuidNum = intRow + 1`, `GuidSyo = GUID_NM`
 *    → cột 「No.」 của web CHÍNH LÀ số thứ tự hiển thị, KHÔNG phải guid_cd.
 *    Đồng thời `cmdGuidPrv.Visible = false` + `cmdGuidReset.Visible = false`.
 *  - frm203002.cs:239 GuidCol — lưới ガイド chỉ 2 cột hiển thị: 0:№ / 1:処置名称.
 *  - frm203002.cs:2238 hfgGuid1_RowEnter — `txtGuid1Sel.Text = rowIndex + 1`
 *    → ô 選択No. luôn bám dòng đang sáng.
 *  - frm203002.cs:6515 hfgGuid1_CellDoubleClick — lấy GUID_CD + GuidSyo của dòng,
 *    snapshot getFocusDt/getFocusBui/getFocusDis vào frm203017.ParamData rồi mở
 *    ガイド処置選択. ComParam == null (F10/戻る) → `txtGuid1Sel.Focus()` rồi return;
 *    có data (F9 確定) → frmGuid2_Let_Data → `txtGuid1Sel.Text = ""` → `grdRegi.Focus()`.
 *  - frm203002.cs:6570 hfgGuid1_Click — CLICK ĐƠN trên lưới ガイド đã tương đương
 *    Enter (gọi grdGuid_KeyDown(Return) → CellDoubleClick). Vậy single-click của
 *    web ở tab này ĐÚNG WinForm (khác tab パック, nơi WinForm đòi double-click).
 *  - frm203002.cs:6584 grdGuid_KeyDown — Enter trên lưới = double-click.
 *  - frm203002.cs:6726 txtGuid1Sel_KeyDown — ↑/↓/PageUp/PageDown cuộn dòng chọn;
 *    Enter: TryParse ô No. → nhảy tới dòng (số − 1) NẾU trong phạm vi, rồi
 *    grdGuid_KeyDown(Return) được gọi NGOÀI nhánh kiểm tra phạm vi (xem parity).
 *  - frm203002.cs:6604 cmdGuidAll_Click 「全て表示」 → getGuidNyuryokuInfo2(true, false, true).
 *  - frm203002.cs:6617 cmdGuidPrv_Click 「前回」   → getGuidNyuryokuInfo2(false, true, false).
 *  - frm203002.cs:6631 cmdGuidReset_Click 「リセット」 → Q00100
 *    「該当部位の治療進行状態をリセットします。」 → StepReset() (GHI trt_state) →
 *    getGuidNyuryokuInfo2(false, false, false).
 *  - frm203002.cs:1990 getGuidNyuryokuInfo2 — bolStepPass=true → ẩn 前回/リセット;
 *    bolStepPass=false → HIỆN 前回/リセット. dt rỗng → MsgBox E00024
 *    「該当ガイドがありません。」 và KHÔNG gán DataSource (lưới giữ nguyên list cũ).
 *  - modGuid1.cs:37 pSet_Guid1 — dải guid_cd theo chế độ:
 *      · bolStepPass (F4 / 全て表示): `GUID_CD < 1000 or GUID_CD >= 2000`
 *      · STEP (Shift+F4):            `GUID_CD between 1000 and 1999` + PAC_STEPxx
 *      · 前回 (SelPrv):               `GUID_CD = intTrtS[0]` (mã trt_state, KHÔNG
 *        chắc nằm trong dải 1000-1999 → đừng assert dải cho nhánh này)
 *      · rỗng → fallback `GUID_CD between 1000 and 1999`.
 *    `GuidNum = cnt + 1` (đánh lại số sau khi lọc trùng GUID_CD).
 *  - frm203017.cs:432 initProc — `txtGuidNo.Text = param.guidCd`,
 *    `txtGuidNm.Text = param.guidNm`; nhãn lblName = 「ガイド番号」; cột lưới:
 *    ｺｰﾄﾞ / 枝番 / 処置名称 / 点数 / 回数. Escape ⇒ btnF9_Click (確定!) —
 *    frm203017.cs:180 — nên ĐÓNG DIALOG BẰNG F10, TUYỆT ĐỐI KHÔNG Escape.
 *  - frm203017.cs:1001 — lưới rỗng: guide_chk_flg=0 → Q00100
 *    「算定できる処置がありません。…」; =1 → E00024; cả hai nhánh đều `this.Close()`.
 *
 * ─── Web port (apps/web-tenant/src/features/treatments) ───────────────────────
 *  - components/treatment-side-panel.tsx: tab ガイド header 2 cột 「No.」/「名称」
 *    (grid-cols-[46px_1fr], sticky); dòng sáng nền `bg-[#ffffc0]`; guard
 *    prevGuidLen (:574) auto sáng dòng đầu khi list đổi; guard prevSelGuid (:600)
 *    đồng bộ ô No. = idx + 1; ô No. mang `data-side-anchor`, lọc ký tự bằng
 *    sanitizeDigits; effect :682 focus ô No. khi vào tab; effect :716 ←/→ đổi tab
 *    và ↑/↓ đổi dòng khi focus nằm trong side panel (có clamp 2 đầu);
 *    useEmptyGuideAlert (:102) bung alert 「該当ガイドがありません。」 cho STEP/前回.
 *  - components/guide-selection-dialog.tsx: header 「ガイド番号」 + guid_cd + guid_nm;
 *    F9 確定 (disabled khi mọi 回数 = 0) / F10 戻る; list rỗng → tự đóng + alert
 *    「算定できる処置がありません。」 (đã port nhánh E00024 của frm203017).
 *  - components/treatment-entry-detail.tsx: F4 → guidSubMode 'regular' + nhảy tab
 *    ガイド; Shift+F4 → 'step'; onOpenChange (:4959) đóng kiểu huỷ →
 *    refocusSidePanel() (con trỏ về ô No.), đóng kiểu 確定 → nhường focus cho lưới.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login trong một khung thời gian, nên login + mở màn 診療入力 làm đúng một lần ở
 * beforeAll. Thứ tự testcase có ý nghĩa (tab ガイド phải được mở trước, chế độ
 * regular phải chạy trước STEP/前回) — chạy lẻ một testcase ở giữa sẽ hỏng.
 *
 * Các testcase GHI dữ liệu (リセット thật → UPDATE trt_state; F9 確定 → đẩy 処置 vào
 * lưới) mặc định bị bỏ qua. Muốn chạy:
 *   TEST_ALLOW_COMMIT=1 npx playwright test tests/side-panel/guide-sidepanel-handler.spec.ts
 */

const PAT_NO = patNo('12138')
/**
 * Mặc định KHÔNG truyền trtDt → app lấy ngày hôm nay, đúng tháng hiện hành (WinForm
 * chặn thao tác trên tháng khác). Muốn ghim ngày: TEST_TRT_DT=YYYY-MM-DD.
 */
const TRT_DT = trtDt('')
/** Bật các nhánh GHI (リセット thật, F9 確定). Mặc định tắt. */
const ALLOW_COMMIT = process.env.TEST_ALLOW_COMMIT === '1'

/** Số dòng ガイド tối đa sẽ dò khi cần mở thử nhiều dòng. */
const SCAN_LIMIT = 8

/** Dải guid_cd dành riêng cho ガイド STEP (modGuid1.cs:98/107/135). */
const STEP_CD_MIN = 1000
const STEP_CD_MAX = 1999

/**
 * Hạn chờ cho các `waitForResponse` mang tính "mốc đồng bộ", luôn kèm `.catch(() => null)`.
 * Chúng có thể KHÔNG BAO GIỜ nổ: TanStack Query cache list ガイド với staleTime 5 phút,
 * nên lần bấm thứ hai vào cùng một chế độ không phát request nào. Để 30s thì mỗi cú
 * bấm đã cache phải ngồi chờ đủ 30s vô ích (từng làm một testcase parity mất 35s).
 * Sau mốc này luôn còn assert trên DOM nên chờ hụt cũng không làm test sai.
 */
const OPTIONAL_RESP_TIMEOUT = 10_000

test.describe.configure({ mode: 'serial' })

test.describe('SidePanel — tab ガイド (frm203002 ガイドタブ系)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Dialog ガイド処置選択 (frm203017) — nhận diện bằng nhãn 「ガイド番号」 trong body. */
    let picker: Locator
    /** Alert E00024 「該当ガイドがありません。」 (getGuidNyuryokuInfo2, frm203002.cs:2011). */
    let noGuidAlert: Locator
    /** Alert E00024 「算定できる処置がありません。」 (frm203017 getViewData, :1015). */
    let noTrtAlert: Locator
    /**
     * Dialog カルテ記載選択 (frm203011) — AutoSantei tự bung khi vào màn 診療入力
     * (歯科疾患管理料 được 自動算定 rồi kéo theo nó), thời điểm không đoán được.
     *
     * PHẢI ĐÓNG TRƯỚC KHI GÕ PHÍM. Nó là modal, mà FKeyScopeProvider nuốt SẠCH
     * F-key của màn nền khi có modal đang mở (fkey-scope-provider.tsx: nhánh
     * `top && !topOwnsKeys` ⇒ preventDefault, không dispatch cho ai). Bỏ mặc thì
     * F4 / Shift+F4 / F5 im lặng không chạy: lưới ガイド giữ nguyên list cũ và
     * testcase đỏ trông y như bug app (đã vấp: Shift+F4 không đổi sang STEP nên
     * assert dải 1000-1999 đọc phải guid_cd của list 全て表示).
     */
    let karteCmtDialog: Locator
    /** Khung side panel (w-[450px]) — mọi locator lưới đều bám vào đây. */
    let sidePanel: Locator
    /**
     * Dòng của tab ガイド. Header cũng dùng grid-cols-[46px_1fr] nên phải kèm
     * `cursor-pointer` (chỉ dòng dữ liệu mới có) để loại header ra.
     */
    let rows: Locator
    /** Ô 選択No. của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
    let noInput: Locator
    /** Nút 「前回」 / 「全て表示」 / 「リセット」 ở chân tab ガイド. */
    let prvBtn: Locator
    let allBtn: Locator
    let resetBtn: Locator

    /** Số thứ tự (cột No.) của dòng i — cell đầu tiên trong dòng. */
    const rowNo = (i: number) => rows.nth(i).locator('div').first()
    /** Tên ガイド (cột 名称) của dòng i. */
    const rowNm = (i: number) => rows.nth(i).locator('div').nth(1)

    /** Index của dòng đang sáng (nền #ffffc0); -1 nếu không có dòng nào. */
    async function highlightedIdx(): Promise<number> {
        return rows.evaluateAll((els) => els.findIndex((e) => e.className.includes('bg-[#ffffc0]')))
    }


    /**
     * Đóng dialog bằng PHÍM F10.
     * KHÔNG click nút 「F10 戻る」: màn nền cũng có nút F10 戻る nằm dưới modal.
     * TUYỆT ĐỐI KHÔNG Escape: frm203017.cs:180 map Escape ⇒ btnF9_Click (確定),
     * web bê nguyên (guide-selection-dialog.tsx:372) → Escape là XÁC NHẬN, không phải huỷ.
     */
    async function dismissPicker() {
        await page.keyboard.press('F10')
        const closed = await picker
            .waitFor({ state: 'hidden', timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        if (!closed) {
            // Cú F10 vừa rồi bị nuốt vì một modal khác (カルテ記載選択) chen lên
            // TRÊN picker — xem chú thích của karteCmtDialog. Dọn nó rồi gõ LẠI
            // đúng phím F10, không click nút, để vẫn đang kiểm đường đi bàn phím.
            await dismissKarteCmtIfOpen()
            // Chỉ gõ lại khi picker VẪN còn: F10 của màn nền là 戻る — nó rời hẳn
            // màn 診療入力 và làm hỏng mọi testcase sau.
            if ((await picker.count()) > 0) await page.keyboard.press('F10')
        }
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /** ガイド番号 đang hiển thị trên header dialog = frm203017 txtGuidNo = guid_cd. */
    async function pickerGuidCd(): Promise<number> {
        const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
        return Number(raw.trim())
    }

    /**
     * Chờ kết quả THẬT của một cú chốt ガイド.
     *
     * KHÔNG được mốc vào `picker` không thôi: dialog bung ra ngay khi query còn
     * đang chạy, rồi mới tự đóng nếu ガイド không có 処置 nào tính được
     * (frm203017.cs:1001-1024). Chờ `picker` sẽ luôn khớp cái cửa sổ loading đó và
     * bỏ lọt nhánh rỗng — tệ hơn là để lại alert E00024 chưa đóng, overlay của nó
     * chặn mọi click của testcase sau. Mốc đúng là DÒNG 処置 hoặc chính cái alert.
     */
    async function waitPickResult(): Promise<'rows' | 'empty'> {
        await expect(picker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
            timeout: 30000,
        })
        return (await noTrtAlert.count()) > 0 ? 'empty' : 'rows'
    }

    /** Đóng カルテ記載選択 nếu nó đang mở; true = có đóng. */
    async function dismissKarteCmtIfOpen(): Promise<boolean> {
        if ((await karteCmtDialog.count()) === 0) return false
        // Chỗ BẤM 「F10 戻る」 là locator handler ở beforeAll, không phải ở đây. Hàm
        // này chỉ ASSERT auto-retry để ÉP Playwright chạy handler đó. Tự click sẽ
        // tranh chấp: handler chen vào trước mỗi action, đóng dialog xong thì cú
        // click gốc không còn nút để bấm → timeout 15s (đã vấp ở tab パック).
        await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
        return true
    }

    /** Đóng alert 「算定できる処置がありません。」 đang bung. */
    async function dismissNoTrtAlert() {
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
    }

    /**
     * Chốt dòng đầu tiên MỞ ĐƯỢC picker (bỏ qua các ガイド rỗng 処置 — chúng tự đóng
     * kèm E00024) và trả về index dòng đó. Dùng cho các testcase chỉ cần "một
     * picker đang mở" chứ không quan tâm là ガイド nào.
     */
    async function openPickableRow(): Promise<number> {
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'rows') return i
            await dismissNoTrtAlert()
        }
        throw new Error(`không ガイド nào trong ${total} dòng đầu mở được ガイド処置選択`)
    }

    /** Đóng dialog nếu nó đang mở (dọn dẹp đầu/cuối các testcase parity). */
    async function dismissPickerIfOpen() {
        if (await picker.count()) await dismissPicker().catch(() => {})
    }

    /**
     * Mở (hoặc nạp lại) màn 診療入力 của bệnh nhân test.
     *
     * Nạp lại trang là cách DUY NHẤT xoá cache TanStack Query (list ガイド có
     * staleTime 5 phút) và reset ref `hasAlerted` của useEmptyGuideAlert. Testcase
     * nào cần cú bấm của mình thực sự gọi BE / thực sự bung alert thì phải gọi hàm
     * này trước, nếu không nó chỉ đọc cache và không kết luận được gì.
     */
    async function gotoTreatments() {
        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        // Nếu phiên đăng nhập rụng thì app đá về /login và 「合計:」 KHÔNG BAO GIỜ hiện
        // → chờ đủ 60s rồi mới báo "element(s) not found", che mất nguyên nhân thật.
        // Soi URL trước để lỗi nói thẳng ra là mất session.
        await expect(page, 'goto màn 診療入力 mà bị đá về trang khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
        await drainAutoSantei()
    }

    /**
     * Chờ chuỗi AutoSantei chạy hết rồi dọn sạch.
     *
     * Confirm 「〜を算定しますか？」 do locator handler ở beforeAll bấm No — mà handler
     * CHỈ chạy khi Playwright có action / assert auto-retry, nên phải assert (không
     * phải waitForTimeout trần) mới ép nó chạy. Trả lời No xong thì 処置 kế tự 算定
     * KHÔNG hỏi rồi bung カルテ記載選択 sau ~1s, nên còn phải chờ thêm một nhịp nữa
     * mới dám nói màn đã sạch.
     */
    async function drainAutoSantei() {
        // AutoSantei chạy SAU khi lưới dựng xong, và với bệnh nhân test thì nó
        // KHÔNG hỏi gì: 算定 thẳng 歯科疾患管理料 (POST /tenant/treatment/autosantei2)
        // rồi bung カルテ記載選択 ở khoảng t+2s và để NGUYÊN đó. Bệnh nhân khác thì
        // có thêm confirm 「〜を算定しますか？」 phía trước.
        //
        // Cả hai dialog đều do locator handler ở beforeAll bấm — mà handler CHỈ chạy
        // khi Playwright có action / assert auto-retry. Vòng dưới đây vừa là cú hích
        // đó, vừa là bằng chứng màn đã sạch LIÊN TỤC vài nhịp (đoán bằng một
        // `waitForTimeout` đơn lẻ thì trượt: dialog tới trễ ~2s, dọn hụt là nó nằm
        // lại tới giữa suite rồi nuốt F-key / cướp focus).
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
            await page.waitForTimeout(700)
        }
    }

    /** Envelope `{ data: [...] }` của BE có phải list rỗng không. */
    async function isEmptyListResponse(resp: { json: () => Promise<unknown> }): Promise<boolean> {
        try {
            const body = (await resp.json()) as { data?: unknown }
            return Array.isArray(body.data) && body.data.length === 0
        } catch {
            return false
        }
    }

    /**
     * Đưa màn hình về trạng thái chuẩn của nhóm parity: tab ガイド, chế độ regular
     * (F4 → getGuidNyuryokuInfo), list đã nạp, không còn dialog/alert nào che.
     *
     * Mỗi testcase parity gọi hàm này ở đầu để TỰ DỰNG trạng thái của mình. Nhờ vậy
     * chạy lẻ được sau khi sửa bug:
     *   npx playwright test tests/side-panel/guide-sidepanel-handler.spec.ts -g "Enter với ô No. RỖNG"
     * (file chạy `mode: 'serial'` nên một testcase đỏ sẽ SKIP mọi testcase sau nó —
     * sửa xong điểm nào thì grep chạy riêng điểm đó, hoặc chạy lại cả file.)
     */
    async function enterGuideRegular() {
        await dismissPickerIfOpen()
        await dismissNoGuidAlert(1000)
        await dismissKarteCmtIfOpen()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && !r.url().includes('/tenant/guids/step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('F4')
        await resp
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
    }

    /**
     * Đóng alert E00024 nếu nó bung ra; trả về true khi có alert.
     *
     * PHẢI CHỜ chứ không soi `count()` ngay: alert do useEmptyGuideAlert bắn ở
     * effect SAU khi query resolve, nên ngay lúc response về nó chưa có trong DOM.
     * Soi ngay sẽ cho false rồi cú click kế tiếp đâm vào overlay `z-[200]` của alert.
     */
    async function dismissNoGuidAlert(waitMs = 5000): Promise<boolean> {
        const appeared = await noGuidAlert
            .waitFor({ state: 'visible', timeout: waitMs })
            .then(() => true)
            .catch(() => false)
        if (!appeared) return false
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noGuidAlert).toBeHidden({ timeout: 10000 })
        return true
    }

    /** Gỡ handler 算定確認 của RIÊNG file này ở `afterAll` (xem `_shared/overlays.ts`). */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        // Page chia sẻ theo worker (`_shared/session.ts`): đăng nhập một lượt cho cả
        // worker thay vì mỗi file một lần — app chặn ở 10 login/khung thời gian
        // (Rule 10.1). `afterAll` gọi `releaseSharedPage`, KHÔNG `page.close()`.
        page = authedPage
        step = makeStep(page)

        // SanteiConfirmDialog 「<trt_nm>を算定しますか？」 do AutoSantei bung ra: nổi ĐÈ
        // lên mọi thứ và nuốt click, thời điểm xuất hiện không đoán được. Bấm 「No」
        // chứ KHÔNG 「Yes」 — 「Yes」 算定 xong lại kéo theo カルテ記載選択, đổi popup này
        // lấy popup khác (Rule 14.1).
        disposeOverlays = await installOverlayHandlers(page, { santei: true })

        // Gán locator TRƯỚC gotoTreatments: chính gotoTreatments đã cần
        // karteCmtDialog để dọn popup của AutoSantei.
        picker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        noGuidAlert = page.getByText('該当ガイドがありません')
        noTrtAlert = page.getByText('算定できる処置がありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        rows = sidePanel.locator('div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]')
        noInput = page.locator('input[data-side-anchor]')
        prvBtn = sidePanel.getByRole('button', { name: '前回', exact: true })
        allBtn = sidePanel.getByRole('button', { name: '全て表示', exact: true })
        resetBtn = sidePanel.getByRole('button', { name: 'リセット', exact: true })

        // Nó có thể bung LẠI giữa chừng (mỗi lần AutoSantei chạy) → để Playwright
        // tự dọn trước mỗi thao tác. Đây là chỗ DUY NHẤT bấm 「F10 戻る」 của dialog
        // này (xem dismissKarteCmtIfOpen), giống handler của 「…を算定しますか？」.
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

        await gotoTreatments()
    })

    test.afterAll(async () => {
        // Gỡ CẢ HAI handler: page dùng chung theo worker, handler còn sót sẽ tự
        // đóng カルテ記載選択 của spec chạy sau — mà `dialogs-selection/` có mấy spec
        // ĐANG ĐO chính dialog đó.
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('F4 mở tab ガイド — header No./名称 + danh sách pac_nam nạp xong', async () => {
        // frm203002.cs:4195/4698 KeyFunc(F4), nhánh non-STEP: nhảy sang tab ガイド rồi
        // getGuidNyuryokuInfo. Bấm PHÍM F4 chứ không click tab — đây mới là đường đi
        // WinForm, và nó kiểm luôn dây F-key của màn nền.
        await page.keyboard.press('F4')

        // Header sticky 2 cột — GuidCol chỉ có 0:№ và 1:処置名称 (frm203002.cs:239).
        // Bám vào DÒNG header (phần tử grid-cols-[46px_1fr] đầu tiên, không có
        // cursor-pointer) chứ không getByText('No.'): nhãn 「No.」 còn xuất hiện lần
        // nữa ở cụm 選択 dưới chân tab ガイド.
        const header = sidePanel.locator('div[class*="grid-cols-[46px_1fr]"]').first()
        await expect(header).toBeVisible({ timeout: 30000 })
        await expect(header.locator('div').first(), 'cột 0 phải là 「No.」').toHaveText('No.')
        await expect(header.locator('div').nth(1), 'cột 1 phải là 「名称」').toHaveText('名称')

        // 「読込中…」 → có dòng. Tenant KHÔNG có ガイド nào thì cả file vô nghĩa
        // (mọi testcase sau đều thao tác trên dòng), nên fail thẳng ở đây.
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        await expect(page.getByText('未登録')).toHaveCount(0)
        const n = await rows.count()
        expect(
            n,
            'tenant không có ガイド nào (pac_nam trống, hoặc không ガイド nào có dòng pag_trt)',
        ).toBeGreaterThan(0)
        console.log(`tab ガイド: ${n} dòng`)
        await step()
    })

    test('cột No. = số thứ tự 1..N (GuidNum = index + 1), KHÔNG phải guid_cd', async () => {
        // getGuidNyuryokuInfo (frm203002.cs:1981) gán GuidNum = intRow + 1;
        // pSet_Guid1 (modGuid1.cs:154) gán GuidNum = cnt + 1 sau khi lọc trùng
        // GUID_CD. GUID_CD nằm ở cột ẩn và KHÔNG hiển thị trên lưới.
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await expect(rowNo(i), `dòng ${i} sai số thứ tự`).toHaveText(String(i + 1))
        }
        await step()
    })

    test('vừa vào tab: dòng đầu sáng, ô No. = "1" và ô No. được focus', async () => {
        // DataGridView mặc định đặt CurrentCell về dòng 0 khi gán DataSource →
        // hfgGuid1_RowEnter bắn ngay `txtGuid1Sel.Text = 0 + 1`.
        expect(await highlightedIdx(), 'dòng đầu phải sáng khi list vừa nạp').toBe(0)
        await expect(noInput).toHaveValue('1')

        // Ghi chú lệch nhỏ: SSTab1_Selected (frm203002.cs:2226) focus LƯỚI
        // (hfgGuid1.Select()), web focus Ô No. Cả hai đều cho ↑/↓ + Enter chạy nên
        // không đánh đỏ. Chỉ log khi ô No. mất focus, vì nó đua với handler đóng
        // popup 算定 (popup đó kéo focus về nút của nó).
        const focused = await noInput
            .evaluate((el) => el === document.activeElement)
            .catch(() => false)
        if (!focused) {
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                if (!el) return 'null'
                const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
                return `${el.tagName.toLowerCase()}[role=${el.getAttribute('role') ?? '-'}] "${label.slice(0, 30)}"`
            })
            console.log(`CẢNH BÁO: ô 選択No. không được focus khi vào tab ガイド; đang focus: ${desc}`)
        }
        await step()
    })

    test('click 1 dòng → sáng dòng đó, ô No. đồng bộ, mở ガイド処置選択', async () => {
        // hfgGuid1_Click (frm203002.cs:6570): CLICK ĐƠN ⇒ grdGuid_KeyDown(Return)
        // ⇒ hfgGuid1_CellDoubleClick. Vậy single-click ở tab ガイド là ĐÚNG WinForm.
        // Dùng dòng thứ 2 để phân biệt với dòng mặc định.
        const target = Math.min(1, (await rows.count()) - 1)
        const nm = (await rowNm(target).innerText()).trim()
        await rows.nth(target).click()

        expect(await highlightedIdx(), 'click không chuyển dòng sáng').toBe(target)
        await expect(noInput, 'hfgGuid1_RowEnter: ô No. phải bám dòng sáng').toHaveValue(
            String(target + 1),
        )

        await waitPickResult()
        // frm203017 _title = 「ガイド処置選択」, lblName = 「ガイド番号」.
        await expect(picker.getByText('ガイド処置選択').first()).toBeVisible()
        await expect(picker.getByText('ガイド番号')).toBeVisible()
        // txtGuidNm = param.guidNm = GuidSyo của dòng đã chốt.
        // `.first()`: guid_nm có thể trùng tên một 処置 trong lưới của dialog.
        if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        console.log(`click dòng ${target + 1} 「${nm}」 → ガイド番号 ${await pickerGuidCd()}`)
        await step()
        await dismissPicker()
    })

    test('dialog hiển thị đủ 5 cột ｺｰﾄﾞ/枝番/処置名称/点数/回数 (frm203017 _viewItem)', async () => {
        await rows.first().click()
        await waitPickResult()

        // frm203017.cs:95-103 _viewItem — 4 cột đầu Visible=true, 回数 là cột
        // editable cũng hiển thị; 4 cột sau (jihi_flg/men/unit/acc_unit) width 0 → ẩn.
        for (const h of ['コード', '枝番', '処置名称', '点数', '回数']) {
            await expect(
                picker.getByText(h, { exact: true }).first(),
                `dialog thiếu cột ${h}`,
            ).toBeVisible()
        }
        await step()
        await dismissPicker()
    })

    test('chế độ regular (F4): guid_cd của mọi dòng nằm NGOÀI dải STEP 1000-1999', async () => {
        // modGuid1.cs:44 — bolStepPass ⇒ `(PCNA.GUID_CD < 1000 or PCNA.GUID_CD >= 2000)`.
        // Assert này bắt lỗi filter của BE: nếu một ガイド STEP lọt vào list F4 thì
        // F4 và Shift+F4 đang trả về cùng một tập.
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await rows.nth(i).click()
            // ガイド rỗng 処置 tự đóng kèm E00024 → không có header để đọc guid_cd.
            // Phải dọn alert rồi đi tiếp, nếu bỏ mặc thì overlay của nó chặn click
            // của testcase sau (đã từng làm testcase F10 phía dưới timeout 30s).
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            const cd = await pickerGuidCd()
            expect(
                cd >= STEP_CD_MIN && cd <= STEP_CD_MAX,
                `dòng ${i + 1}: guid_cd ${cd} thuộc dải STEP 1000-1999 mà vẫn nằm trong list F4 ` +
                    `(modGuid1.cs:44 chỉ cho GUID_CD < 1000 hoặc >= 2000)`,
            ).toBe(false)
            await dismissPicker()
        }
        await step()
    })

    test('đóng dialog kiểu huỷ (F10) → con trỏ quay lại ô 選択No.', async () => {
        // frm203002.cs:6559-6563 — ComParam == null (F10/戻る) thì txtGuid1Sel.Focus()
        // rồi return (KHÔNG chạy tiếp frmGuid2_Let_Data).
        // Cần một picker ĐANG MỞ nên phải bỏ qua các ガイド rỗng — dòng đang sáng lúc
        // này là dòng cuối mà testcase trước quét tới, có thể chính là dòng rỗng.
        await openPickableRow()
        await dismissPicker()

        await expect
            .poll(() => noInput.evaluate((el) => el === document.activeElement), { timeout: 15000 })
            .toBe(true)
        await step()
    })

    test('↑/↓ đổi dòng sáng và kéo theo ô No., có clamp ở hai đầu', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6728-6742): ↑ ⇒ hfgGuid1.ScrollRowUp(),
        // ↓ ⇒ ScrollRowDown() — dừng ở hai đầu lưới, KHÔNG nhảy vòng.
        // Web nghe keydown ở window nhưng chỉ chạy khi focus nằm TRONG side panel.
        await noInput.click()
        const total = await rows.count()

        const start = await highlightedIdx()
        await page.keyboard.press('ArrowDown')
        const expectedDown = Math.min(start + 1, total - 1)
        expect(await highlightedIdx(), '↓ không xuống dòng').toBe(expectedDown)
        await expect(noInput).toHaveValue(String(expectedDown + 1))

        await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx(), '↑ không lên dòng').toBe(Math.max(expectedDown - 1, 0))

        // Clamp đầu list: ↑ quá số dòng vẫn dừng ở dòng 1 (không âm, không nhảy vòng).
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx(), '↑ vượt đầu list phải clamp về dòng 1').toBe(0)
        await expect(noInput).toHaveValue('1')

        // Clamp cuối list.
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowDown')
        expect(await highlightedIdx(), '↓ vượt cuối list phải clamp ở dòng cuối').toBe(total - 1)
        await expect(noInput).toHaveValue(String(total))

        // Trả về dòng 1 cho các testcase sau.
        for (let i = 0; i < total + 2; i++) await page.keyboard.press('ArrowUp')
        expect(await highlightedIdx()).toBe(0)
        await step()
    })

    test('ô 選択No. chỉ nhận chữ số', async () => {
        // txtGuid1Sel là ô số (nhánh Enter chạy int.TryParse); web lọc ngay lúc gõ
        // bằng sanitizeDigits = raw.replace(/\D/g,'') nên chữ/dấu bị nuốt tại chỗ.
        await noInput.fill('')
        await noInput.pressSequentially('a1b-2.c')
        await expect(noInput).toHaveValue('12')

        // Gõ No. KHÔNG được đổi dòng sáng — WinForm chỉ đổi CurrentCell ở nhánh Enter.
        expect(await highlightedIdx(), 'gõ No. không được tự nhảy dòng sáng').toBe(0)
        await step()
    })

    test('Enter trên ô No. có số → nhảy đúng dòng đó rồi mở dialog của dòng đó', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6747-6752): intRow--, nếu
        // 0 <= intRow < Rows.Count thì hfgGuid1.CurrentCell = dòng đó, sau đó
        // grdGuid_KeyDown(Return) mở frm203017 cho CHÍNH dòng vừa nhảy tới.
        const total = await rows.count()
        const target = Math.min(3, total) // No. 1-based
        const nm = (await rowNm(target - 1).innerText()).trim()

        await noInput.fill(String(target))
        await noInput.press('Enter')

        expect(await highlightedIdx(), 'Enter phải nhảy tới dòng của No.').toBe(target - 1)
        await waitPickResult()
        // Dialog phải là của ĐÚNG dòng vừa nhảy tới, không phải dòng đang sáng cũ.
        if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        console.log(`Enter No. ${target} → 「${nm}」`)
        await step()
        await dismissPicker()
    })

    test('click lại chính dòng đang sáng → mở lại đúng dialog đó (idempotent)', async () => {
        // hfgGuid1_Click gọi lại CellDoubleClick trên cùng CurrentCell → cùng một
        // frm203017 với cùng ParamData; không cộng dồn gì (khác tab 個別).
        // Dòng phải là dòng MỞ ĐƯỢC picker thì mới so được ガイド番号 hai lần.
        const idx = await openPickableRow()
        const first = await pickerGuidCd()
        await dismissPicker()

        await rows.nth(idx).click()
        await waitPickResult()
        expect(await pickerGuidCd(), 'click lại cùng dòng phải cho cùng ガイド番号').toBe(first)
        expect(await highlightedIdx()).toBe(idx)
        await step()
        await dismissPicker()
    })

    test('←/→ đổi tab khi side panel giữ focus, quay lại ガイド giữ nguyên trạng thái', async () => {
        await noInput.click()
        const before = await rows.count()
        const beforeNo = await noInput.inputValue()

        // → sang tab パック (SIDE_TABS = 病検/ガイド/パック/個別 → ガイド đứng thứ 2).
        await page.keyboard.press('ArrowRight')
        await expect(
            sidePanel.locator('div[class*="grid-cols-[42px_1fr]"]').first(),
        ).toBeVisible({ timeout: 30000 })
        await expect(rows, 'rời tab ガイド mà list ガイド vẫn còn').toHaveCount(0)

        // ← quay lại. SidePanel không unmount → số dòng và ô No. giữ nguyên.
        await page.keyboard.press('ArrowLeft')
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        expect(await rows.count()).toBe(before)
        await expect(noInput, 'ô No. không được reset khi quay lại tab').toHaveValue(beforeNo)
        await step()
    })

    test('「全て表示」 (cmdGuidAll) → list là SUPERSET của list F4, vẫn dải regular', async () => {
        // cmdGuidAll_Click → getGuidNyuryokuInfo2(con, bolStepPass:true, SelPrv:false,
        // AllGuid:true) → cùng dải guid_cd với F4 nhưng BỎ điều kiện dis_cd
        // (getInpGuidNyuryokuData nhánh AllGuid) và bỏ luôn PacnamChk
        // (modGuid1.cs:152 `pass || bolStepPass`) → không bao giờ ít dòng hơn F4.
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && r.url().includes('allGuid=true'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await allBtn.click()
        await resp
        await expect(allBtn, '全て表示 không bật trạng thái ON').toHaveClass(/bg-primary/)

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        expect(
            after,
            `全て表示 (${after} dòng) phải ⊇ list F4 (${before} dòng) — nó chỉ BỎ BỚT điều kiện lọc`,
        ).toBeGreaterThanOrEqual(before)

        // Vẫn là dải regular: bolStepPass=true nên guid_cd không được rơi vào 1000-1999.
        await rows.first().click()
        await waitPickResult()
        const cd = await pickerGuidCd()
        expect(
            cd >= STEP_CD_MIN && cd <= STEP_CD_MAX,
            `全て表示 trả guid_cd ${cd} thuộc dải STEP — modGuid1.cs:44 vẫn giữ dải regular`,
        ).toBe(false)
        await dismissPicker()
        console.log(`全て表示: ${before} → ${after} dòng`)
        await step()
    })

    test('Shift+F4 (STEP) → guid_cd trong dải 1000-1999, hoặc alert 該当ガイドがありません', async () => {
        // frm203002.cs:4698-4714 nhánh STEP → getGuidNyuryokuInfo2(bolStepPass:false)
        // → modGuid1.pSet_Guid1: `GUID_CD between 1000 and 1999` + PAC_STEPxx =
        // intTrtS[0]; rỗng → fallback VẪN `between 1000 and 1999`; rỗng nốt → E00024
        // 「該当ガイドがありません。」 và lưới GIỮ NGUYÊN list cũ (không gán DataSource).
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('Shift+F4')
        await resp

        if (await dismissNoGuidAlert()) {
            expect(
                await rows.count(),
                'E00024: WinForm KHÔNG gán DataSource khi rỗng → lưới phải giữ nguyên list cũ',
            ).toBe(before)
            console.log('Shift+F4 → 該当ガイドがありません (không có STEP ガイド khớp trt_state)')
            await step()
            return
        }

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const n = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < n; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            const cd = await pickerGuidCd()
            expect(
                cd,
                `STEP dòng ${i + 1}: guid_cd ${cd} ngoài dải 1000-1999 (modGuid1.cs:98/135)`,
            ).toBeGreaterThanOrEqual(STEP_CD_MIN)
            expect(cd, `STEP dòng ${i + 1}: guid_cd ${cd} ngoài dải 1000-1999`).toBeLessThanOrEqual(
                STEP_CD_MAX,
            )
            await dismissPicker()
        }
        console.log(`Shift+F4 → ${await rows.count()} dòng STEP`)
        await step()
    })

    test('「前回」 (cmdGuidPrv) → bật chế độ prv, list rỗng thì báo E00024', async () => {
        // cmdGuidPrv_Click → getGuidNyuryokuInfo2(con, false, true, false) →
        // modGuid1.cs:105-108 `GUID_CD = intTrtS[0]` (mã trt_state — KHÔNG assert
        // dải 1000-1999 ở nhánh này). intTrtS[0] = 0 → rỗng → fallback → E00024.
        //
        // Đây là cú bấm 前回 ĐẦU TIÊN của phiên nên chắc chắn gọi BE và chắc chắn
        // bung alert nếu rỗng → assert luôn bất biến 「rỗng thì lưới giữ nguyên」 ở
        // đây. 「WinForm parity 1」 kiểm cùng bất biến nhưng cô lập (chạy lẻ).
        const before = await rows.count()
        const resp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=prv'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await prvBtn.click()
        await resp
        // Dọn alert TRƯỚC mọi assert bằng getByRole: AlertDialog của Radix gắn
        // `aria-hidden` lên toàn bộ nền khi mở, nên locator theo role không nhìn
        // thấy nút 前回 nữa (báo "element(s) not found" chứ không phải sai class).
        const alerted = await dismissNoGuidAlert()
        await expect(prvBtn, '前回 không bật trạng thái ON').toHaveClass(/bg-primary/)

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        if (alerted) {
            // getGuidNyuryokuInfo2 (frm203002.cs:2014) chỉ gán DataSource ở nhánh CÓ
            // dòng; nhánh rỗng chỉ bung E00024 và để nguyên lưới.
            expect(
                after,
                `E00024 mà list đổi ${before} → ${after} dòng. WinForm không gán DataSource ` +
                    `khi rỗng nên lưới phải giữ nguyên ${before} dòng.`,
            ).toBe(before)
        }
        console.log(
            alerted
                ? `前回 → 該当ガイドがありません (trt_state chưa có tiến trình cho 部位 này); list ${before} → ${after} dòng`
                : `前回 → ${after} dòng`,
        )
        await step()
    })

    test('「リセット」 → hỏi Q00100 該当部位の治療進行状態…; chọn No → không ghi gì', async () => {
        // cmdGuidReset_Click (frm203002.cs:6631): Q00100 TRƯỚC, chọn OK mới chạy
        // StepReset() (UPDATE trt_state). Nhánh Cancel không ghi gì → chạy được mặc
        // định. Nhánh OK là GHI THẬT nên nằm ở testcase riêng, mặc định skip.
        const before = await rows.count()
        await resetBtn.click()

        const confirm = page.getByText('該当部位の治療進行状態をリセットします')
        const appeared = await confirm
            .waitFor({ state: 'visible', timeout: 8000 })
            .then(() => true)
            .catch(() => false)

        if (!appeared) {
            // Web chặn sớm khi 部位病名行 đang focus không có 病名 (disCd0 <= 0) —
            // WinForm hỏi Q00100 vô điều kiện. Không đủ dữ kiện để phân biệt
            // "thiếu 病名" với "nút hỏng" nên log thay vì đánh đỏ.
            console.log(
                'CẢNH BÁO WinForm parity: リセット không bung Q00100. WinForm cmdGuidReset_Click ' +
                    'hỏi vô điều kiện; web return sớm khi 部位病名行 đang focus không có 病名 ' +
                    '(handleGuidReset: disCd0 <= 0). Chọn một 部位病名行 rồi chạy lại để kiểm nhánh này.',
            )
            await step()
            return
        }

        await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
        await expect(confirm).toBeHidden({ timeout: 10000 })
        expect(await rows.count(), 'huỷ Q00100 mà list vẫn đổi → đã lỡ chạy StepReset').toBe(before)
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // WinForm parity — 5 điểm web ĐANG LỆCH bản gốc, mỗi điểm là MỘT testcase
    // assert thẳng theo WinForm nên nó ĐỎ cho tới khi web được sửa.
    //
    // Mỗi testcase TỰ DỰNG trạng thái (enterGuideRegular) → sửa xong điểm nào thì
    // chạy riêng điểm đó, không cần chạy lại cả file:
    //   npx playwright test tests/side-panel/guide-sidepanel-handler.spec.ts -g "<tên testcase>"
    // Lưu ý file chạy `mode: 'serial'`: chạy nguyên file thì testcase đỏ đầu tiên
    // sẽ SKIP mọi testcase sau nó, nên mỗi lần chạy full chỉ thấy điểm lệch đầu.
    // ─────────────────────────────────────────────────────────────────────────

    test('WinForm parity 1: 前回 rỗng (E00024) → lưới phải GIỮ NGUYÊN list cũ', async () => {
        // getGuidNyuryokuInfo2 (frm203002.cs:2005-2016):
        //   if (dt.Rows.Count == 0) { MsgDialog.ShowErrorMsg("E00024", "該当ガイド"); }
        //   else                    { hfgGuid1.DataSource = dt; }        ← CHỈ nhánh else
        // Rỗng ⇒ KHÔNG gán DataSource ⇒ lưới giữ nguyên list đang hiển thị.
        //
        // CHẠY LẺ mới kết luận được, chạy nguyên file thì testcase này TỰ SKIP:
        // 「前回」 phía trên đã gọi BE mode=prv rồi, cú bấm ở đây chỉ đọc cache
        // (staleTime 5 phút) nên không có response để soi → không biết BE trả rỗng
        // hay không → skip thay vì đoán mò. Bất biến vẫn được phủ trong lần chạy
        // full bởi testcase 「Shift+F4」 và 「前回」 (cả hai assert list giữ nguyên ở
        // nhánh E00024) — đây chỉ là bản kiểm riêng, cô lập.
        //
        // KHÔNG nạp lại trang để ép fetch mới: `page.goto` giữa suite làm SPA không
        // boot lại được (màn hình trắng, 「合計:」 không bao giờ render) — app giới hạn
        // số lần login trong một khung thời gian, xem chú thích đầu file.
        await enterGuideRegular()

        // Dựng một list RỘNG bằng 全て表示 để chênh lệch nhìn thấy được (27 → 334 dòng
        // trên tenant test). Nếu 前回 giữ đúng như WinForm thì con số này không đổi.
        const allResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids') && r.url().includes('allGuid=true'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await allBtn.click()
        await allResp
        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const before = await rows.count()

        // Vào chế độ STEP bằng Shift+F4 — nút 前回 CHỈ hiện ở nhánh bolStepPass=false
        // (xem 「WinForm parity 2」). Cú Shift+F4 này cũng rỗng trên tenant test, nên
        // nó đã là một phép thử của chính bất biến đang xét: list phải vẫn là `before`.
        const stepResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=step'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await page.keyboard.press('Shift+F4')
        await stepResp
        await dismissNoGuidAlert()
        await expect(prvBtn, 'Shift+F4 phải làm nút 前回 hiện ra (chế độ STEP)').toBeVisible({
            timeout: 15000,
        })

        const prvResp = page
            .waitForResponse(
                (r) => r.url().includes('/tenant/guids/step') && r.url().includes('mode=prv'),
                { timeout: OPTIONAL_RESP_TIMEOUT },
            )
            .catch(() => null)
        await prvBtn.click()
        const prvBody = await prvResp
        // Kết luận "BE trả rỗng" từ CHÍNH RESPONSE, không dựa vào alert: alert chỉ
        // bung một lần cho mỗi lượt fetch nên không phải tín hiệu tin cậy.
        const beReturnedEmpty = prvBody ? await isEmptyListResponse(prvBody) : false
        // Dọn alert TRƯỚC khi đếm: overlay của Radix AlertDialog che side panel.
        await dismissNoGuidAlert()
        test.skip(
            !beReturnedEmpty,
            '前回 lần này BE trả có dòng nên không chạm nhánh E00024 — không có gì để so',
        )

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const after = await rows.count()
        expect(
            after,
            `E00024 mà list đổi ${before} → ${after} dòng. WinForm chỉ gán DataSource ở nhánh ` +
                `CÓ dòng (frm203002.cs:2014) nên lưới phải giữ nguyên ${before} dòng.`,
        ).toBe(before)
        await step()
    })

    test('WinForm parity 2: 「前回」/「リセット」 phải ẩn ở chế độ regular (F4)', async () => {
        // getGuidNyuryokuInfo (frm203002.cs:1985-1986) — mở tab / F4 luôn đặt
        // `cmdGuidPrv.Visible = false` và `cmdGuidReset.Visible = false`.
        // getGuidNyuryokuInfo2(bolStepPass:true) (:1994-1998, tức 全て表示) cũng ẩn.
        // Chỉ nhánh bolStepPass=false (Shift+F4 / 前回 / リセット) mới HIỆN 2 nút này.
        // Web dựng cả 2 nút cố định trong footer tab ガイド.
        await enterGuideRegular()

        await expect(
            prvBtn,
            'getGuidNyuryokuInfo đặt cmdGuidPrv.Visible = false → nút 前回 phải ẩn ở chế độ regular',
        ).toBeHidden({ timeout: 5000 })
        await expect(
            resetBtn,
            'getGuidNyuryokuInfo đặt cmdGuidReset.Visible = false → nút リセット phải ẩn ở chế độ regular',
        ).toBeHidden({ timeout: 5000 })
        await step()
    })

    test('WinForm parity 3: Enter với No. ngoài phạm vi → vẫn mở dialog của dòng đang sáng', async () => {
        // txtGuid1Sel_KeyDown (frm203002.cs:6745-6754):
        //   if (int.TryParse(...)) {
        //       intRow--;
        //       if (0 <= intRow && intRow < Rows.Count) { CurrentCell = ...; }  ← chỉ NHẢY DÒNG
        //       grdGuid_KeyDown(txtGuid1Sel, Return);                           ← NGOÀI if ⇒ LUÔN chạy
        //   }
        // Nghĩa là số ngoài phạm vi KHÔNG dời CurrentCell nhưng VẪN mở ガイド処置選択
        // cho dòng đang sáng. Web return sớm khi list[idx] undefined.
        await enterGuideRegular()
        await noInput.click()
        const before = Math.max(await highlightedIdx(), 0)
        const nm = (await rowNm(before).innerText()).trim()

        await noInput.fill('9999')
        await noInput.press('Enter')

        try {
            await expect(
                picker,
                'WinForm: grdGuid_KeyDown(Return) nằm NGOÀI nhánh kiểm tra phạm vi (frm203002.cs:6753) ' +
                    '→ No. sai vẫn phải mở ガイド処置選択 cho dòng đang sáng. Web đang return sớm khi ' +
                    'list[idx] undefined (treatment-side-panel.tsx:1126).',
            ).toBeVisible({ timeout: 10000 })
            // CurrentCell không đổi → dialog phải là của ĐÚNG dòng đang sáng trước đó.
            expect(await highlightedIdx(), 'No. ngoài phạm vi không được dời dòng sáng').toBe(before)
            if (nm) await expect(picker.getByText(nm, { exact: true }).first()).toBeVisible()
        } finally {
            // Dọn dialog dù assert đỏ hay xanh — testcase sau chạy trên màn sạch.
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity 4: Enter với ô No. RỖNG → không mở gì (int.TryParse thất bại)', async () => {
        // frm203002.cs:6746 — toàn bộ nhánh Enter nằm trong `if (int.TryParse(...))`.
        // Ô rỗng ⇒ TryParse false ⇒ KHÔNG đổi CurrentCell, KHÔNG mở dialog.
        // Web dùng `guidNo.trim() ? Number(guidNo) - 1 : (selectedGuidIdx ?? -1)`
        // nên ô rỗng lại chốt dòng đang sáng.
        await enterGuideRegular()
        await noInput.click()
        const before = await highlightedIdx()
        await noInput.fill('')
        await noInput.press('Enter')

        try {
            // Soi dialog TRƯỚC: nếu Enter đã mở dialog thì ↑/↓ không còn tác dụng lên
            // side panel nữa, mốc đồng bộ bên dưới sẽ hỏng theo và che mất nguyên nhân.
            await expect(
                picker,
                'WinForm: nhánh Enter của txtGuid1Sel nằm trong if(int.TryParse) → ô No. rỗng thì ' +
                    'KHÔNG mở ガイド処置選択. Web đang rơi về selectedGuidIdx (treatment-side-panel.tsx:1125).',
            ).toBeHidden({ timeout: 10000 })

            // Assert VẮNG MẶT — mốc vào một tín hiệu CÓ THẬT xảy ra SAU cú Enter (↓ một
            // dòng) thay vì soi ngay (Rule 7: không sleep).
            const afterDown = Math.min(before + 1, (await rows.count()) - 1)
            await page.keyboard.press('ArrowDown')
            await expect(noInput).toHaveValue(String(afterDown + 1))
            await page.keyboard.press('ArrowUp') // trả dòng sáng về chỗ cũ
        } finally {
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity 5: ガイド không có 処置 tính được → dialog phải TỰ ĐÓNG', async () => {
        // frm203017.cs:1001-1017 — dspDt.Rows.Count == 0:
        //   guide_chk_flg == 0 → Q00100「算定できる処置がありません。…」, chọn Cancel ⇒ Close()
        //   guide_chk_flg == 1 → E00024「算定できる処置がありません。」 ⇒ Close()
        // Cả hai nhánh đều ĐÓNG form. Web giữ dialog mở và chỉ hiện 「該当なし」.
        await enterGuideRegular()

        // Dò dòng đầu tiên cho lưới rỗng (trên tenant test là dòng 8). Mỗi cú chốt
        // ra 1 trong 2 kết quả nên phải chờ CẢ HAI — dialog rỗng KHÔNG còn ở lại để
        // waitPicker() bắt được nữa, nó đóng ngay theo đúng frm203017:
        //   a) picker mở (ガイド có 処置 tính được), hoặc
        //   b) alert 「算定できる処置がありません。」 (ガイド rỗng → form tự đóng).
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        let emptyIdx = -1
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            // Mốc phải là DÒNG 処置 trong picker, KHÔNG phải bản thân picker: picker
            // bung ra ngay lúc query còn đang chạy rồi mới tự đóng khi biết là rỗng,
            // nên chờ `picker.or(alert)` sẽ luôn khớp picker trước và bỏ sót nhánh rỗng.
            await expect(
                picker.getByTestId('cell-trtNm').first().or(noTrtAlert),
            ).toBeVisible({ timeout: 30000 })
            if (await noTrtAlert.count()) {
                emptyIdx = i
                break
            }
            await dismissPicker()
        }
        test.skip(
            emptyIdx < 0,
            `mọi ガイド trong ${total} dòng đầu đều có 処置 tính được → không có gì để so`,
        )

        console.log(`dòng ${emptyIdx + 1}: ガイド không có 処置 tính được`)
        try {
            // Thứ tự của WinForm: form đóng TRƯỚC rồi mới báo lỗi → picker không được
            // "nháy" một cái rồi tắt, tại thời điểm alert bung nó phải đã biến mất.
            await expect(
                picker,
                'frm203017 rỗng ⇒ MsgBox + this.Close(): alert đã bung mà picker vẫn còn mở',
            ).toBeHidden({ timeout: 10000 })
        } finally {
            await page.getByRole('button', { name: 'OK' }).first().click()
            await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
            await dismissPickerIfOpen()
        }
        await step()
    })

    test('WinForm parity: F9 確定 đẩy 処置 vào lưới VÀ xoá ô 選択No. (mặc định BỎ QUA)', async () => {
        test.skip(!ALLOW_COMMIT, 'làm bẩn lưới đang mở — đặt TEST_ALLOW_COMMIT=1 để chạy')

        // frm203002.cs:6565-6572, nhánh có data:
        //   frmGuid2_Let_Data(con, param);   → đẩy 処置 vào grdRegi
        //   txtGuid1Sel.Focus();
        //   txtGuid1Sel.Text = "";           ← XOÁ ô 選択No.
        //   grdRegi.Focus();
        // Web không reset guidNo sau 確定 (treatment-entry-detail.tsx:4959 chỉ bỏ
        // phần refocus, không xoá giá trị).
        await openPickableRow()

        // Nút F9 確定 disabled khi mọi 回数 = 0 (hasAnyCnt). Double-click 1 dòng để
        // chạy vòng 回数 (dgvView_CellClick: cnt = (cnt + 1) % (maxCnt + 1)).
        const f9 = picker.getByRole('button', { name: /F9\s*確定/ })
        if (await f9.isDisabled()) {
            await picker.getByTestId('cell-trtNm').first().dblclick()
        }
        await expect(f9).toBeEnabled({ timeout: 10000 })

        // Mỗi 処置 chốt thêm ít nhất 1 dòng vào lưới → số ô [data-grid-cell] phải tăng.
        const cells = page.locator('[data-grid-cell]')
        const beforeCells = await cells.count()
        await f9.click()
        await expect(picker).toBeHidden({ timeout: 20000 })
        await expect.poll(() => cells.count(), { timeout: 30000 }).toBeGreaterThan(beforeCells)

        // Chk_CmtAuto có thể kéo theo カルテ記載選択 (CmtAutoPickerDialog) — F10 để bỏ
        // qua; dòng 処置 đã được chèn TRƯỚC đó.
        const dialogs = page.getByRole('dialog')
        for (let i = 0; i < 3 && (await dialogs.count()) > 0; i++) {
            await page.keyboard.press('F10')
            // Không assert cứng: có thể là dialog dây chuyền (batch kế tiếp mở ngay),
            // vòng lặp sẽ dọn tiếp — đây chỉ là dọn dẹp sau khi đã assert xong.
            await expect(dialogs.first())
                .toBeHidden({ timeout: 10000 })
                .catch(() => {})
        }

        await expect(
            noInput,
            'WinForm frm203002.cs:6570 `txtGuid1Sel.Text = ""` → 確定 xong phải XOÁ ô 選択No.',
        ).toHaveValue('')
        await step()
    })

    test('リセット thật (StepReset → UPDATE trt_state) (mặc định BỎ QUA)', async () => {
        test.skip(
            !ALLOW_COMMIT,
            'GHI trt_state của bệnh nhân test — đặt TEST_ALLOW_COMMIT=1 để chạy',
        )

        // cmdGuidReset_Click: Q00100 OK → StepReset() (UPDATE trt_state) →
        // getGuidNyuryokuInfo2(con, false, false, false) → nạp lại list STEP.
        // Sau reset intTrtS[0] = 0 nên list rỗng → E00024 là kết quả HỢP LỆ.
        await resetBtn.click()
        const confirm = page.getByText('該当部位の治療進行状態をリセットします')
        await expect(confirm).toBeVisible({ timeout: 10000 })
        await page.getByRole('button', { name: /^(Yes|はい)$/ }).first().click()
        await expect(confirm).toBeHidden({ timeout: 10000 })

        // Kết quả: hoặc list STEP mới, hoặc E00024 (list cũ giữ nguyên).
        await expect(noGuidAlert.or(rows.first())).toBeVisible({ timeout: 30000 })
        await dismissNoGuidAlert()
        await step()
    })

})
