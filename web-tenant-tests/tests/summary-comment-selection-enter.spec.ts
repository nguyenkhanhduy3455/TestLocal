/**
 * trouble-1 / dialog #7 — 摘要コメント選択 (SummaryCommentSelectionDialog, frm203018)
 * Enter ở window level: TC-2 / TC-3 / TC-4.
 *
 * ⚠ Bản đầu của file này viết theo giả định "handler #7 chỉ có
 *   `if (sortedCandidates.length === 0) return; if (e.key === 'Enter') …`,
 *   KHÔNG có defaultPrevented / INPUT-TEXTAREA / alertdialog" ⇒ dự đoán TC-2 và
 *   TC-3 FAIL. Giả định đó ĐÃ CŨ: dialog giờ đi qua hook dùng chung
 *   `useWindowedEnterKey` → `isWindowKeyBlocked`
 *   (web-tenant/src/shared/hooks/use-windowed-enter-key.ts,
 *    web-tenant/src/shared/utils/window-key-guard.ts), guard này chặn đủ cả ba:
 *   defaultPrevented, ô nhập text (INPUT/TEXTAREA/SELECT/contentEditable) và
 *   `[role="alertdialog"]`. TC-2/TC-3 vì vậy phải PASS — nếu chúng fail thì phải
 *   nghi ngờ CÁCH ĐO trước khi nghi ngờ sản phẩm.
 *
 * ⚠ HAI CÁI BẪY ĐO ĐẠC đã làm bản trước fail oan (không phải bug app):
 *
 *  1. Alert お茶コン thật đè lên #7. F9 確定 của 処置選択 xếp hàng cảnh báo 算定不可
 *     (「…算定可能な部位がありません。」) qua dialog-queue, và alert đó bung SAU khi
 *     #7 đã mở → nằm ĐÈ lên #7. `clearOverlays` cũ return ngay khi thấy #7
 *     (`if (await title(page).count()) return`) nên KHÔNG bao giờ dọn được alert
 *     xếp chồng đó. Enter của TC-2/TC-3 bị chính alert ăn (DialogShell.handleKeyDown
 *     → resolveActive + stopPropagation), không hề tới #7.
 *
 *  2. Locator theo ROLE bị aria-hidden làm "tắt". Radix AlertDialog gọi
 *     `hideOthers` (package aria-hidden) khi content MOUNT → mọi con của body có
 *     lúc đó (kể cả portal của #7) bị gắn `aria-hidden="true"`. Playwright bỏ qua
 *     phần tử ẩn khỏi a11y tree, nên `getByRole('dialog')` KHÔNG match #7 nữa →
 *     `cells('dispText').count()` = 0 dù list vẫn còn nguyên trên màn hình. Ngược
 *     lại `getByText` không lọc theo a11y nên vẫn thấy title = 1. Đúng cặp số
 *     `{title: 1, rows: 0}` của lần fail trước — không có 確定 nào xảy ra cả
 *     (frame video: #7 vẫn mở nguyên 19 dòng sau alert).
 *     ⇒ File này KHÔNG dùng `getByRole` cho dialog/cell: `[role="dialog"]` qua
 *       `page.locator` là CSS selector, miễn nhiễm aria-hidden.
 *
 *  3. `getByText('摘要コメント選択')` mặc định là so KHỚP CHUỖI CON → match luôn
 *     「ユーザー摘要コメント選択」 (frm203019, dialog #8 mà #7 cascade sang khi
 *     comPattern===30). Phải `{ exact: true }`, nếu không "#7 còn mở" là tín hiệu giả.
 *
 *  4. TC-4 cũ assert `page.locator('body').innerText()` chứa dòng đã chọn — mà
 *     dialog nằm TRONG body, nên câu assert luôn đúng miễn dialog còn mở (pass
 *     giả). Bản này đọc cột 療法・処置 của grid nền (`[data-grid-cell$="|2"]`).
 *
 *  5. Pack đi theo đường tất định dưới đây (153 / 点数 48 = 除去(困難), họ I019) là
 *     pack MULTI-SELECT: click một dòng chỉ di con trỏ, KHÔNG đổi ô tick, nên
 *     「Enter 確定 dòng đang hiển thị đầu」 là kỳ vọng của single-select, sai với
 *     pack này. TC-4 vì vậy phân nhánh theo mode (có checkbox hay không).
 *
 * ⚠ BỐN NGUYÊN NHÂN LÀM BẢN TRƯỚC FAIL — tất cả đều là LỖI ĐO, app không sai:
 *
 *  a) Confirm 「〜を算定しますか？」 (role="dialog", F10 KHÔNG đóng được) còn treo ⇒
 *     FKeyScope nuốt Shift+F10 ⇒ app vẫn ở 点数モード ⇒ gõ 153 bị hiểu là 点数 và
 *     app báo 「該当処置はありません。」. Nay: addLocatorHandler trả lời No + ASSERT
 *     chip mode = コード ngay sau Shift+F10.
 *
 *  b) TC-2/TC-3 pass VACUOUS: sau khi #7 mở, focus có lúc còn ở ô input 回 của
 *     grid nền ⇒ guard chặn Enter ⇒ hai TC xanh vì Enter chết từ đầu. Nay:
 *     `focusGridOfDialog` đưa focus về đúng `gridRef` mà app tự focus.
 *     KHÔNG click vào row để lấy focus: row có onKeyDown riêng gọi thẳng
 *     `onOpenRow` → 確定, không qua guard ⇒ đo nhầm handler.
 *
 *  c) TC-4 bấm Enter khi focus đang ở SORT HEADER ⇒ Enter đảo sort desc→asc chứ
 *     không 確定 (header tự preventDefault → guard chặn #7, đúng luật TC-3).
 *
 *  d) Cascade #7 chỉ bắn ở lần commit ĐẦU của dòng pack vừa thêm. "Mở lại" bằng
 *     cách click ô 回 rồi Enter KHÔNG bao giờ mở lại được (và `kaiCell.last()`
 *     còn trỏ nhầm vào ô 日計 footer). Nay mỗi TC gọi `enterPackRow()` để nhập
 *     một dòng pack MỚI — test không F9 登録 nên DB vẫn sạch (đã kiểm: 0 dòng).
 *
 * ⚠ CẤU TRÚC: MỖI TC LÀ MỘT `test()` RIÊNG (TC-0/TC-2/TC-3/TC-4), gom trong một
 *   `describe` chạy `serial` và DÙNG CHUNG một page dựng ở `beforeAll` — Rule 19.
 *   Không tách thành 4 file/4 fixture riêng vì mỗi cái sẽ là thêm một lần login,
 *   đụng trần rate-limit của app (Rule 10.1).
 *   `beforeAll` lo: login → vào 診療入力 → sang コードモード. Mỗi TC tự gọi
 *   `openDialog()` nên chạy lẻ một TC (`-g "TC-4"`) vẫn được: nó tự nhập một dòng
 *   pack mới để mở #7.
 *
 * Dialog không có ô nhập text nào → TC-1 không áp dụng (bỏ).
 *
 * Đường đi TẤT ĐỊNH (do user chỉ, đã xác nhận tái hiện được trên patNo=11):
 *   Shift+F10 (コードモード) → gõ 153 vào cell 点 → Enter → 処置選択 mở
 *   → chọn dòng có 点数 = 48 → 確定 → Enter tại cell 回 (=1) → 摘要コメント選択.
 *
 * KHÔNG dò mù qua tab パック: tab đó mở パック処置選択 (frm203014) — dialog khác hẳn.
 * 摘要コメント選択 chỉ bật khi pack có pack_type===1 VÀ candidates.length>1
 * (treatment-entry-detail.tsx:3118-3132), quá hẹp để brute-force.
 *
 * TEST_PAT_NO / TEST_TRT_DT — đổi bệnh nhân / ngày.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN_USER, JA } from './test-data'
import { makeStep } from './step'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
/** 処置コード gõ vào cell 点 ở コードモード. */
const TRT_CD = process.env.TEST_TRT_CD ?? '153'
/** 点数 của dòng cần chọn trong 処置選択 (phân biệt các 枝番 của cùng mã). */
const PICK_SCORE = process.env.TEST_PICK_SCORE ?? '48'

/** Cột grid 診療入力 — RegiCol (treatment-entry-shared.ts:62): 療法・処置=2, 点=3. */
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const tenCell = (page: Page) => page.locator('[data-grid-cell$="|3"]')

/**
 * MỌI locator dưới đây là CSS / text-exact — KHÔNG `getByRole` — để phép đo không
 * đổi kết quả khi một Radix modal khác gắn aria-hidden lên portal của #7 (xem bẫy
 * số 2 ở docblock).
 */
const dialogBox = (page: Page) => page.locator('[role="dialog"]')
const cells = (page: Page, colId: string) =>
  dialogBox(page).locator(`[data-testid="cell-${colId}"]`)
const rows = (page: Page) => dialogBox(page).locator('[data-testid^="row-"]')
const header = (page: Page, colId: string) =>
  dialogBox(page).locator(`[data-testid="header-${colId}"]`)
/**
 * Tiêu đề = `_title + "（" + pack_nm + "）"` (frm203018.cs:54 + :121), ví dụ
 * 「摘要選択（除去-困難）」. Regex neo đầu-cuối nên không thể match
 * 「ユーザー摘要コメント選択」 (frm203019) — cái bẫy substring của bản cũ.
 *
 * ⚠️ Bản trước dùng `getByText('摘要コメント選択', { exact: true })`: đó là tiêu đề
 * SAI của web (lệch parity), đã sửa ở commit `47ed1fecc` nên locator phải đi theo
 * (Rule 22).
 */
const title = (page: Page) => page.getByText(/^摘要選択（.+）$/)

/** Alert お茶コン THẬT (loại trừ div giả của TC-2). */
const realAlert = (page: Page) => page.locator('[role="alertdialog"]:not(#tc2-fake-alert)')

/**
 * SanteiConfirmDialog 「〜を算定しますか？」 — thủ phạm làm bản trước FAIL.
 *
 * Nó là `role="dialog"` (KHÔNG phải alertdialog) với 3 nút Yes/No/Cancel, nên:
 *   · `drainAlerts` (chỉ soi `[role="alertdialog"]`) KHÔNG thấy nó;
 *   · F10 KHÔNG đóng được nó (đo được: bắn 6 lần vẫn còn nguyên).
 * Và chừng nào nó còn mở thì FKeyScope nuốt sạch F-key của màn nền
 * (fkey-scope-provider.tsx:57-67 — dialog đang mở mà scope F-key không nằm
 * trong dialog foreground thì `preventDefault` rồi return) ⇒ `Shift+F10` KHÔNG
 * đổi sang コードモード, app vẫn ở 点数モード, và gõ 153 bị hiểu là 点数 153 →
 * 「該当処置はありません。」 chứ không mở 処置選択. Không phải bug app.
 *
 * Trả lời No (Rule 14.1 — Yes lại đẻ ra カルテ記載選択). Cắm bằng
 * addLocatorHandler để Playwright tự dọn trước MỖI actionability check, vì
 * confirm này bung ra sau khi grid nạp xong, thời điểm không đoán được (Rule 14).
 */
/**
 * カルテ記載選択 (CmtAutoPickerDialog, frm203012 gType.Auto) — popup XEN NGANG.
 *
 * `Chk_CmtAuto` của chính 処置 vừa nhập có thể bung dialog này ra, và nó nằm ĐÈ lên
 * 処置選択 / #7 (đo được: dblclick vào dòng 処置選択 bị `cell-cmtNm` của nó chặn
 * pointer event). `clearOverlays` chỉ chạy ở đầu mỗi TC nên không cứu được cái bung
 * ra giữa flow ⇒ dùng addLocatorHandler để Playwright tự dọn trước MỖI actionability
 * check (Rule 14). F10 = 戻る của dialog đó, không ghi gì.
 *
 * ⚠️ KHÔNG được dọn bằng `keyboard.press('F10')` (bản trước làm vậy và treo 15s).
 * Đo 2026-09-03: lúc dialog này mở, 算定チェック của chính dòng 153-1 bung THÊM một
 * alert お茶コン 「…を算定していますが、算定可能な部位…」 NẰM ĐÈ lên nó — tổng cộng 3
 * dialog. Khi đó:
 *   · F10 rơi vào alert foreground, không đóng được カルテ記載選択
 *     (fkey-scope-provider.tsx:57-67: scope không nằm trong dialog foreground thì
 *     phím bị `preventDefault` rồi nuốt);
 *   · và click nút 「F10 戻る」 của カルテ記載選択 cũng timeout vì overlay của alert
 *     chặn pointer event.
 * ⇒ Phải DỌN ALERT TRƯỚC rồi mới đóng dialog, và đóng bằng NÚT (lúc đó nó mới là
 * foreground). Không phải bug app: alert 算定チェック là cảnh báo thật của 処置 vừa nhập.
 */
const installKarteAutoPickerClose = async (page: Page) => {
  await page.addLocatorHandler(
    page.getByText('カルテ記載選択', { exact: true }).first(),
    async () => {
      // Dọn HẾT hàng đợi trong MỘT lần vào handler: `addLocatorHandler` đòi locator
      // phải biến mất khi handler xong, mà đóng cái này xong cái kế bung ra ngay
      // (mỗi 処置 do AutoSantei 算定 kéo theo một カルテ記載選択 riêng: 歯科疾患管理料 →
      // 歯科衛生実地指導料１ …). Đóng đúng một cái là Playwright thấy locator vẫn hiện
      // và quay vòng cho tới khi timeout — đúng triệu chứng của bản trước.
      for (let i = 0; i < 8; i++) {
        // Alert 算定チェック có thể xếp chồng bên trên — dọn trước, nếu không overlay
        // của nó nuốt cú click vào nút 「F10 戻る」. (`realAlert` đã loại alert giả TC-2.)
        await drainAlerts(page)
        const karte = dialogBox(page).filter({ hasText: 'カルテ記載選択' })
        if ((await karte.count()) === 0) return
        await karte
          .getByRole('button', { name: 'F10 戻る' })
          .first()
          .click({ timeout: 3000 })
          .catch(() => {})
        await page.waitForTimeout(300)
      }
    },
    { times: 30 },
  )
}

const SANTEI_CONFIRM = /を算定しますか？/
const installSanteiNo = async (page: Page) => {
  await page.addLocatorHandler(
    page.getByText(SANTEI_CONFIRM).first(),
    async () => {
      // Bó nút No vào ĐÚNG dialog confirm: `page.getByRole('button', {name:'No'})`
      // trần có thể trúng nút No của một dialog khác đang chồng lên.
      // `.catch()` vì confirm có thể bung LẠI khi đang ở dưới 処置選択 (AutoSantei
      // chạy lại sau khi grid đổi): lúc đó nút bị che, cứ để vòng sau dọn — ném
      // lỗi ở đây sẽ giết cả test vì handler chạy giữa một thao tác khác.
      await dialogBox(page)
        .filter({ hasText: SANTEI_CONFIRM })
        .getByRole('button', { name: /^(No|いいえ)$/ })
        .first()
        .click({ timeout: 3000 })
        .catch(() => {})
    },
    { times: 30 },
  )
}

/**
 * Bấm OK / Yes cho tới khi hàng đợi alert お茶コン rỗng.
 *
 * Tách riêng khỏi {@link clearOverlays} vì phải chạy được CẢ KHI #7 đang mở: alert
 * 算定不可 của F9 確定 bung sau lúc #7 mở nên nằm đè lên nó, và một alert sót lại là
 * mọi phép đo/kể cả Enter sau đó đều thuộc về alert chứ không phải #7.
 */
const drainAlerts = async (page: Page) => {
  for (let i = 0; i < 10; i++) {
    if ((await realAlert(page).count()) === 0) return
    const btn = realAlert(page).locator('button', { hasText: /^(OK|Yes)$/ })
    // Không nhận ra nút nào → thoát, đừng quay vòng vô ích (assert phía sau sẽ
    // báo rõ là còn alert).
    if ((await btn.count()) === 0) return
    await btn.first().click()
    await page.waitForTimeout(400)
  }
}

/**
 * Dọn sạch mọi popup còn treo (alert お茶コン / confirm / dialog khác) cho tới khi
 * không còn overlay nào.
 *
 * Thứ tự QUAN TRỌNG: alert trước, #7 sau. Bản cũ kiểm #7 trước rồi return nên
 * alert xếp chồng lên #7 không bao giờ được dọn — đúng nguyên nhân fail oan.
 * Không bao giờ F10 vào #7 — thấy nó (và đã sạch alert) là dừng ngay.
 */
/**
 * Chờ màn 診療入力 ĐỨNG YÊN trước khi gõ/bấm phím.
 *
 * AutoSantei bắn `/tenant/treatment/autosantei` rồi CHÈN dòng vào lưới; lúc đó
 * React remount ô đang sửa và cướp focus. Đo được 2 hệ quả:
 *   · gõ "153" vào ô 点 xong thì `input:focus` có value RỖNG (chữ bay mất);
 *   · focus vừa đặt vào dialog #7 bị kéo ngược ra một <button> của màn nền.
 * Cả hai đều là "màn hình chưa đứng yên", không phải selector sai.
 *
 * Chờ response autosantei cuối cùng (nếu có) rồi để lưới lắng thêm một nhịp ngắn.
 */
const waitGridSettled = async (page: Page) => {
  await page
    .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(800)
}

const clearOverlays = async (page: Page) => {
  for (let i = 0; i < 10; i++) {
    await drainAlerts(page)
    if (await title(page).count()) return
    if ((await dialogBox(page).count()) === 0) return
    // Confirm 算定 KHÔNG tự bấm ở đây: `installSanteiNo` (addLocatorHandler) đã
    // độc quyền việc đó. Bấm thêm một lần nữa ở đây là tranh chấp — handler dọn
    // trước, cú click sau không còn nút nào để bấm và timeout 15s (đã dính).
    // Chỉ cần bỏ qua vòng này để `count()` phía trên chờ handler làm xong.
    if (await dialogBox(page).filter({ hasText: SANTEI_CONFIRM }).count()) {
      await page.waitForTimeout(400)
      continue
    }
    await page.keyboard.press('F10')
    await page.waitForTimeout(600)
  }
}

/**
 * Serial + DÙNG CHUNG một page (Rule 19): login + vào 診療入力 + sang コードモード chỉ
 * làm MỘT lần ở beforeAll, nếu không mỗi testcase là thêm một lần login và đụng
 * trần rate-limit của app (Rule 10.1).
 *
 * Thứ tự CÓ ý nghĩa: TC-0 dựng đường đi và chốt là #7 mở được; TC-2/TC-3 để
 * nguyên #7 đang mở (nếu guard đúng thì Enter không đóng nó) nên chạy nối tiếp;
 * TC-4 是 cái duy nhất 確定 và đóng #7. Mỗi TC vẫn tự gọi `openDialog()` nên chạy
 * lẻ một TC ở giữa vẫn được — nó sẽ tự nhập một dòng pack mới.
 */
test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('摘要コメント選択 — Enter window-level (frm203018)', () => {
  let page: Page
  let step: () => Promise<void>

  /** Chip 点数/コード ở header (patient-info-header.tsx:148 hiển thị đúng inpMode). */
  const modeChip = () => page.locator('button[title*="入力モード切替"]')
  const trtPicker = () => page.getByText('処置選択', { exact: true })

  /**
   * Sang コードモード và CHỐT bằng chip mode thay vì bấm một phát rồi tin là xong —
   * bản trước fail ở bước sau dưới dạng 「該当処置はありません。」, mất công truy ngược.
   *
   * Vì sao phải LẶP: confirm 算定 có thể bung SAU khi grid render, mà
   * `addLocatorHandler` chỉ chạy trước các actionability check — `keyboard.press()`
   * KHÔNG phải một trong số đó nên nó không dọn kịp. Mỗi vòng: dọn overlay (bằng
   * một assertion, thứ kích được handler) → bắn Shift+F10 → soi chip.
   */
  const enterCodeMode = async () => {
    for (let i = 0; i < 5; i++) {
      await clearOverlays(page)
      await expect(dialogBox(page), 'còn overlay đè lên màn 診療入力').toHaveCount(0, {
        timeout: 15000,
      })
      // F9 点数 / F10 コード nằm ở layer Shift của FKeyBar → Shift+F10 (F10 trần = 戻る).
      await page.keyboard.press('Shift+F10')
      if ((await modeChip().innerText().catch(() => '')).trim() === 'コード') return
      await page.waitForTimeout(500)
    }
  }

  /**
   * rowKey của DÒNG NHẬP TRỐNG dưới đáy tháng hiện tại = dòng có ô 療法 rỗng cuối
   * cùng. Footer 日計 KHÔNG có ô `|2` nên không lọt vào đây.
   *
   * Vì sao không dùng `tenCell.last()`: ô `|3` cuối lưới CHÍNH LÀ ô 点 của footer
   * 日計; click vào đó có lúc không vào được chế độ sửa và chữ gõ ra bay mất
   * (đo được: `input:focus` có value rỗng ngay sau khi type).
   */
  const emptyEntryRowKey = async () =>
    ryoCell(page).evaluateAll((els) => {
      const empties = els.filter((e) => (e.textContent ?? '').trim() === '')
      const last = empties[empties.length - 1]
      return last?.getAttribute('data-grid-cell')?.replace(/\|2$/, '') ?? ''
    })

  /**
   * B2+B3 — nhập MỘT dòng pack mới: gõ 処置コード vào ô 点 → Enter → 処置選択 →
   * chọn dòng 点数 = PICK_SCORE → 確定.
   *
   * Sau khi hàm này trả về, con trỏ ĐANG ở ô 回 (chế độ sửa, value 1) và chỉ một
   * cú Enter NGAY LÚC ĐÓ mới bắn cascade 摘要コメント選択.
   *
   * ⚠️ Vì sao mỗi TC phải nhập LẠI pack thay vì "mở lại" #7: cascade chỉ chạy ở
   * lần commit ĐẦU của dòng vừa thêm. Đo được — click lại ô 回 của chính dòng
   * 除去(困難) rồi Enter KHÔNG mở lại #7 (dù con trỏ đúng ô).
   */
  const enterPackRow = async () => {
    await waitGridSettled(page)

    // Click → gõ → KIỂM giá trị đã vào ô mới Enter. Ô 点 chỉ thành <input> khi cell
    // vào chế độ sửa; AutoSantei chèn dòng làm lưới nhảy có thể làm click trượt.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const key = await emptyEntryRowKey()
      const cell = key ? page.locator(`[data-grid-cell="${key}|3"]`) : tenCell(page).last()
      await cell.click()
      await step()
      await page.keyboard.type(TRT_CD)
      const typed = await page.evaluate(() => {
        const el = document.activeElement
        return el instanceof HTMLInputElement ? el.value : ''
      })
      if (typed.includes(TRT_CD)) break
      console.log(
        `gõ mã lần ${attempt}/3: ô 点 chưa nhận giá trị ("${typed}", rowKey="${key}") → thử lại`,
      )
      await waitGridSettled(page)
    }
    await expect(
      page.locator('input:focus'),
      `không gõ được ${TRT_CD} vào ô 点 (cell không vào chế độ sửa)`,
    ).toHaveValue(new RegExp(TRT_CD), { timeout: 5000 })
    await step()
    await page.keyboard.press('Enter')

    await expect(trtPicker(), `gõ ${TRT_CD} vào cell 点 không mở được 処置選択`).toBeVisible({
      timeout: 20000,
    })
    await step()

    // B3: chọn dòng có 点数 = PICK_SCORE (cùng mã nhưng khác 枝番 → khác pack).
    await expect(cells(page, 'score1').first()).toBeVisible({ timeout: 15000 })
    const scores = await cells(page, 'score1').allTextContents()
    const pickIdx = scores.findIndex((s) => s.trim() === PICK_SCORE)
    expect(
      pickIdx,
      `処置選択 không có dòng nào 点数=${PICK_SCORE} (thấy: ${scores.join(', ')})`,
    ).toBeGreaterThan(-1)
    await rows(page).nth(pickIdx).dblclick()
    await expect(trtPicker()).toBeHidden({ timeout: 15000 })
    await step()
  }

  /**
   * Đưa focus về ĐÚNG nơi app tự focus khi mở #7: `gridRef` — cái `div[tabIndex=0]`
   * bọc VirtualListTable (summary-comment-selection-dialog.tsx:209-213).
   *
   * KHÔNG click một dòng để lấy focus: row mang `tabIndex={-1}` + `onKeyDown` riêng
   * (virtual-list-table.tsx:359-366) — Enter trên row gọi thẳng `onOpenRow` → 確定,
   * KHÔNG qua `useWindowedEnterKey` nên KHÔNG chịu guard ⇒ đo nhầm handler.
   */
  const focusGridOfDialog = async () => {
    await waitGridSettled(page)
    await expect
      .poll(
        async () => {
          // Alert 算定不可 của lần commit pack bung SAU khi #7 mở và CƯỚP focus
          // (đo được: activeElement là nút OK của alert — nó mang role="alertdialog"
          // nên không khớp closest('[role="dialog"]')). Phải dọn TRONG vòng poll:
          // dọn một lần trước vòng lặp là hụt, alert đến muộn hơn thế.
          await drainAlerts(page)
          await page.evaluate(() => {
            // Tìm #7 theo tiêu đề HIỆN TẠI 「摘要選択（…）」. Bản trước dò
            // '摘要コメント選択' — tiêu đề CŨ, đã đổi ở commit 47ed1fecc — nên `d7`
            // luôn undefined, `grid.focus()` KHÔNG BAO GIỜ chạy, focus ở nguyên
            // SORT HEADER vừa bấm và cú Enter của TC-4 đi vào onKeyDown của header
            // (đảo sort + preventDefault) chứ không 確定. Đây là lý do TC-4 đỏ, không
            // phải app sai.
            const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
            const d7 = dialogs.reverse().find((d) => /摘要選択（.+）/.test(d.textContent ?? ''))
            const grid = d7?.querySelector('div[tabindex="0"]')
            if (grid instanceof HTMLElement) grid.focus()
          })
          return page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null
            if (!el) return 'null'
            if (!el.closest('[role="dialog"]')) {
              const nhan = (
                el.getAttribute('data-testid') ??
                el.getAttribute('title') ??
                el.getAttribute('aria-label') ??
                el.textContent ??
                ''
              )
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 40)
              return `ngoài dialog (${el.tagName.toLowerCase()} 「${nhan}」)`
            }
            // Phải soi ĐÍCH DANH grid wrapper. Bản trước chỉ loại 「row-…」 rồi coi
            // mọi thứ khác là 'grid', nên khi focus kẹt ở 「header-dispText」 nó vẫn
            // báo 'grid' và giấu luôn lỗi ở trên.
            const id = el.getAttribute('data-testid') ?? ''
            if (id.startsWith('row-')) return 'row'
            if (id.startsWith('header-')) return `sort header (${id})`
            return el.matches('div[tabindex="0"]') ? 'grid' : `khác (${el.tagName.toLowerCase()} ${id})`
          })
        },
        {
          timeout: 8000,
          intervals: [200, 300, 500, 1000],
          message:
            'focus phải nằm trên grid wrapper của #7 (không phải row, không phải ô nhập ' +
            'của màn nền) — nếu không, Enter đi vào handler khác và phép đo vô nghĩa',
        },
      )
      .toBe('grid')
  }

  /** Mở #7 (nhập pack mới nếu nó chưa mở) và trả về khi đã sạch alert đè lên. */
  const openDialog = async () => {
    await clearOverlays(page)
    if (!(await title(page).count())) {
      // Thử tối đa 2 lần: cú Enter phải rơi đúng lúc ô 回 còn ở chế độ sửa, mà
      // AutoSantei chèn dòng/alert xen ngang có thể làm lệch nhịp đó.
      let opened = false
      for (let attempt = 1; attempt <= 2 && !opened; attempt++) {
        await enterPackRow()
        await page.keyboard.press('Enter')
        opened = await title(page)
          .waitFor({ state: 'visible', timeout: attempt === 1 ? 12000 : 30000 })
          .then(() => true)
          .catch(() => false)
        if (!opened) {
          console.log(`#7 chưa mở sau lần nhập ${attempt}/2 → dọn overlay rồi nhập lại`)
          await clearOverlays(page)
        }
      }
      expect(
        opened,
        `Enter tại cell 回 không mở được 摘要コメント選択 (mã ${TRT_CD} / 点数 ${PICK_SCORE})`,
      ).toBe(true)
    }
    await drainAlerts(page)
    await expect(cells(page, 'dispText').first()).toBeVisible({ timeout: 15000 })
    await focusGridOfDialog()
    expect(
      await realAlert(page).count(),
      'còn alert お茶コン đè lên 摘要コメント選択 → mọi phép đo phía sau vô nghĩa',
    ).toBe(0)
    await step()
  }

  /**
   * So NGUYÊN CỤM trạng thái, không chỉ đếm title: 確定 có thể chỉ làm đổi danh sách
   * (queue cascade nhảy bước) chứ chưa đóng hẳn dialog.
   */
  const snapshot = async () => ({
    title: await title(page).count(),
    rows: await cells(page, 'dispText').count(),
    firstRow: (
      await cells(page, 'dispText')
        .first()
        .innerText()
        .catch(() => '')
    ).trim(),
  })

  test.beforeAll(async ({ browser }) => {
    // browser.newPage() KHÔNG kế thừa `use` của playwright.config.ts → truyền tay
    // baseURL + ignoreHTTPSErrors (cert tự ký) + locale.
    page = await browser.newPage({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      locale: 'ja-JP',
    })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // Cắm TRƯỚC mọi điều hướng: confirm 算定 bung ngay sau khi grid nạp xong.
    await installSanteiNo(page)
    await installKarteAutoPickerClose(page)

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(
      page,
      'login không vào được — chạy lại nhiều lần liên tiếp thì đang dính rate-limit, ' +
        'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
    ).toHaveURL(/\/$/)

    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

    // Mốc chờ DUY NHẤT: grid 診療入力 đã render — KHÔNG chờ popup xuất hiện.
    // 「歯科初診料を算定しますか？」 bật ở MỌI lần chạy (test không bao giờ F9 登録 nên
    // chẳng có gì được lưu); `installSanteiNo` lo trả lời No, `clearOverlays` chốt chặn.
    await expect(tenCell(page).last()).toBeVisible({ timeout: 60000 })
    await clearOverlays(page)

    await enterCodeMode()
    await expect(
      modeChip(),
      'Shift+F10 không đổi sang コードモード — còn overlay (confirm 算定 / alert) đè lên màn ' +
        'nền nên FKeyScope nuốt F-key (fkey-scope-provider.tsx:57-67)',
    ).toHaveText('コード', { timeout: 10000 })
    await step()
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  test('TC-0 — đường コードモード mở được 摘要コメント選択 với ≥2 dòng', async () => {
    await openDialog()
    expect(
      await cells(page, 'dispText').count(),
      'cần ≥2 dòng ứng viên thì TC-4 (sort) mới có nghĩa — đổi TEST_TRT_CD / TEST_PICK_SCORE',
    ).toBeGreaterThan(1)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Kỳ vọng: guard `isWindowKeyBlocked` thấy `[role="alertdialog"]` → #7 KHÔNG
  // 確定, 摘要コメント選択 vẫn nguyên trạng.
  test('TC-2 — có alertdialog đè lên thì Enter KHÔNG 確定', async () => {
    await openDialog()

    await page.evaluate(() => {
      const n = document.createElement('div')
      n.id = 'tc2-fake-alert'
      n.setAttribute('role', 'alertdialog')
      document.body.appendChild(n)
    })
    const before = await snapshot()
    expect(before.title, 'TC-2 setup hỏng: dialog không mở → sẽ pass giả').toBe(1)
    await step()

    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const after = await snapshot()
    const strayAlert = await realAlert(page).count()
    await step()
    await page.evaluate(() => document.getElementById('tc2-fake-alert')?.remove())

    expect
      .soft(
        after,
        'TC-2 FAIL: alertdialog đang mở mà 摘要コメント選択 phía dưới vẫn nhận Enter → tự 確定/đóng',
      )
      .toEqual(before)
    // Chẩn đoán, không phải bug sản phẩm: nếu một alert THẬT bung đúng lúc này thì
    // chính nó ăn Enter, TC-2 pass mà chẳng kiểm được guard.
    expect
      .soft(
        strayAlert,
        'TC-2 không kết luận được: một alert お茶コン thật đã bung trong lúc quan sát → ' +
          'Enter bị alert ăn, chạy lại',
      )
      .toBe(0)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // VirtualListTable.handleRowKeyDown chạy trước và preventDefault() → khi event
  // lên tới window, e.defaultPrevented = true. Guard chặn cờ này ⇒ không 確定.
  //
  // Listener CAPTURE trên window luôn chạy trước listener BUBBLE của dialog nên
  // tái hiện chính xác thứ tự đó, và KHÔNG phụ thuộc việc row có focus được không.
  test('TC-3 — Enter đã bị preventDefault thì KHÔNG 確定', async () => {
    await openDialog()

    await page.evaluate(() => {
      const w = window as unknown as { __tc3?: (e: KeyboardEvent) => void }
      w.__tc3 = (e: KeyboardEvent) => {
        if (e.key === 'Enter') e.preventDefault()
      }
      window.addEventListener('keydown', w.__tc3, true)
    })
    const before = await snapshot()
    expect(before.title, 'TC-3 setup hỏng: dialog không mở → sẽ pass giả').toBe(1)
    await step()

    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    const after = await snapshot()
    const strayAlert = await realAlert(page).count()
    await step()
    await page.evaluate(() => {
      const w = window as unknown as { __tc3?: (e: KeyboardEvent) => void }
      if (w.__tc3) window.removeEventListener('keydown', w.__tc3, true)
    })

    expect
      .soft(
        after,
        'TC-3 FAIL: Enter đã bị preventDefault mà handler window vẫn 確定 → thiếu guard ' +
          'e.defaultPrevented',
      )
      .toEqual(before)
    expect
      .soft(
        strayAlert,
        'TC-3 không kết luận được: một alert お茶コン thật đã bung trong lúc quan sát → ' +
          'Enter bị alert ăn, chạy lại',
      )
      .toBe(0)
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Row key của #7 là `${seqNo}-${sortedIndex}` → key ĐỔI khi sort. Kiểm 確定 emit
  // ĐÚNG dòng đang chọn theo thứ tự HIỂN THỊ, không phải dòng cùng vị trí trong
  // mảng gốc. Hai mode, hai kỳ vọng (summary-comment-selection-dialog.tsx:216-233):
  //   • single-select: con trỏ CHÍNH LÀ selection → click dòng hiển thị đầu.
  //   • multiSelect (họ I019 除去(困難)): click chỉ di con trỏ, selection giữ theo
  //     ĐỊNH DANH dòng nên phải sống sót qua sort.
  test('TC-4 — sort xong Enter 確定 đúng dòng theo thứ tự hiển thị', async () => {
    await openDialog()

    const multiSelect = (await dialogBox(page).locator('[role="checkbox"]').count()) > 0

    // multiSelect: dòng đang tick (seed = candidates[0]) — đọc TRƯỚC khi sort vì
    // sau khi sort nó có thể ra ngoài vùng virtual window.
    const pickedBeforeSort = multiSelect
      ? (
          await rows(page)
            .filter({ has: page.locator('[role="checkbox"][aria-checked="true"]') })
            .locator('[data-testid="cell-dispText"]')
            .first()
            .innerText()
        ).trim()
      : ''
    if (multiSelect) {
      expect(
        pickedBeforeSort,
        'TC-4 setup hỏng: multiSelect mà không có dòng nào được tick',
      ).not.toBe('')
    }

    await header(page, 'dispText').click()
    await step()
    await header(page, 'dispText').click()
    await expect(header(page, 'dispText')).toHaveAttribute('aria-sort', 'descending')
    await step()

    const displayedFirst = (await cells(page, 'dispText').first().innerText()).trim()
    const expected = multiSelect ? pickedBeforeSort : displayedFirst
    const titleBefore = (await title(page).innerText()).trim()

    if (!multiSelect) {
      await rows(page).first().click()
      await step()
    }

    // Click header sort đã KÉO FOCUS sang chính cái header (`div[role=button]` có
    // onKeyDown riêng, virtual-list-table.tsx:432): đo được Enter lúc đó ĐẢO SORT
    // desc→asc chứ KHÔNG 確定 — header tự preventDefault nên guard chặn handler của
    // #7 (đúng luật TC-3, KHÔNG phải bug). Trả focus về grid wrapper trước khi Enter.
    await focusGridOfDialog()
    await step()

    // Alert お茶コン có thể bung ra SAU khi #7 mở (bẫy 1 ở docblock) và guard
    // `isWindowKeyBlocked` sẽ nuốt Enter ⇒ đo thành "không 確定" oan. Dọn và chốt
    // lại ngay trước cú Enter, không chỉ ở openDialog.
    await drainAlerts(page)
    expect(
      await realAlert(page).count(),
      'còn alert お茶コン đè lên #7 ngay trước Enter → phép đo vô nghĩa',
    ).toBe(0)

    await page.keyboard.press('Enter')
    await page.waitForTimeout(800)
    await step()
    // Cascade có thể nối tiếp sang frm203019 / pack kế tiếp — dọn hết rồi mới đọc.
    // KHÔNG đọc `body.innerText()`: dialog nằm trong body nên chữ của chính dialog
    // sẽ làm assert pass giả.
    // ⚠️ KHÔNG đo bằng "không còn dialog 摘要選択": 処置 153 kích BA pack
    // (mst_cmt_pack: I019-0 除去-簡単 / I019-1 除去-困難 / I019-2 除去-著しく困難) nên
    // 確定 xong là pack KẾ TIẾP mở ngay, và title của nó cũng khớp mọi locator dạng
    // 摘要選択（…）. Đo bằng THỨ ĐÁNG ĐO: dòng đã chọn có vào lưới 診療入力 hay không.
    //
    // ĐÃ TRUY XONG 2026-09-03 (trước đó TC này đỏ dài ngày, nghi app): KHÔNG phải
    // bug app. `focusGridOfDialog` dò dialog bằng tiêu đề CŨ 「摘要コメント選択」 nên
    // không tìm thấy #7 ⇒ `grid.focus()` không hề chạy ⇒ lúc bấm Enter focus vẫn
    // nằm ở SORT HEADER vừa click. Đo tận nơi: cú Enter có
    // `activeElement = DIV[header-dispText]` và `defaultPrevented = true` (header tự
    // preventDefault rồi đảo sort), nên guard `isWindowKeyBlocked` chặn handler của
    // #7 — đúng luật của TC-3. Sửa tiêu đề dò + siết lại phép kiểm focus là xanh.
    await clearOverlays(page)
    await expect
      .poll(async () => (await ryoCell(page).allInnerTexts()).join('\n'), {
        timeout: 15000,
        message:
          `TC-4 FAIL: commit nhầm dòng — tra theo mảng gốc thay vì mảng đã sort (mode=${
            multiSelect ? 'multiSelect' : 'single'
          }, chờ "${expected}", dòng hiển thị đầu sau sort desc = "${displayedFirst}", ` +
          `pack đang đo "${titleBefore}")`,
      })
      .toContain(expected)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Chrome + phím đóng — FACT bổ sung sau khi sửa parity (commit 47ed1fecc):
  //   · Title  = _title + "（" + pack_nm + "）"          (frm203018.cs:54 / :121)
  //   · 見出し  = "処置名称 " + mst_trt.cct_nm của 処置 KÍCH HOẠT pack (:219-223)
  //             → KHÔNG phải tên pack (chỗ web port sai trước đây)
  //   · lblRemarks.Text = _param.remarks nguyên văn (:201) → không nhãn <<備考>>
  //   · BaseDialog: End và Escape đều chạy btnF9_Click, mà ở form này btnF9_Click
  //     = defData (:135-138) ⇒ cả hai đều 確定, ESC KHÔNG bỏ pack
  //     (BaseDialog.cs:314-326)
  // ───────────────────────────────────────────────────────────────────────────
  test('TC-5 — tiêu đề mang tên pack, 見出し là 処置名称 <処置>, 備考 nguyên văn', async () => {
    await openDialog()

    const heading = (await title(page).innerText()).replace(/\s/g, '')
    expect(heading, 'tiêu đề phải là 摘要選択（<pack_nm>）').toMatch(/^摘要選択（.+）$/)
    const packNm = heading.replace(/^摘要選択（/, '').replace(/）$/, '')

    const banner = (
      await dialogBox(page)
        .getByText(/^処置名称\s/)
        .first()
        .innerText()
    ).trim()
    const trtNm = banner.replace(/^処置名称\s*/, '').trim()
    expect(trtNm, '見出し 処置名称 đang trống').not.toBe('')
    expect(trtNm, '見出し phải là 処置名 (mst_trt.cct_nm), KHÔNG phải tên pack').not.toBe(packNm)

    // 処置名 đó phải chính là dòng vừa nhập ở lưới 診療入力 (cột 療法・処置).
    const ryoTexts = (await ryoCell(page).allInnerTexts()).map((t) => t.trim())
    expect(
      ryoTexts.some((t) => t === trtNm),
      `処置名称 "${trtNm}" không khớp dòng nào ở cột 療法・処置 (${ryoTexts
        .filter(Boolean)
        .join(' / ')})`,
    ).toBe(true)

    expect(
      await dialogBox(page).getByText('<<備考>>').count(),
      'initProc ghi remarks thẳng vào lblRemarks → không được thêm nhãn <<備考>>',
    ).toBe(0)
  })

  test('TC-6 — End 確定 như F9', async () => {
    await openDialog()
    const expected = (await cells(page, 'dispText').first().innerText()).trim()
    const titleBefore = (await title(page).innerText()).trim()
    await focusGridOfDialog()
    await page.keyboard.press('End')
    await page.waitForTimeout(800)
    await step()

    // Xem ghi chú ở TC-4: queue còn pack khác nên "hết dialog" không đo được gì.
    await clearOverlays(page)
    await expect
      .poll(async () => (await ryoCell(page).allInnerTexts()).join('\n'), {
        timeout: 15000,
        message: `TC-6: End không 確定 — "${expected}" không vào lưới (pack "${titleBefore}")`,
      })
      .toContain(expected)
  })

  test('TC-7 — Escape 確定 chứ không bỏ pack', async () => {
    await openDialog()
    const expected = (await cells(page, 'dispText').first().innerText()).trim()
    const titleBefore = (await title(page).innerText()).trim()
    await focusGridOfDialog()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await step()

    await clearOverlays(page)
    await expect
      .poll(async () => (await ryoCell(page).allInnerTexts()).join('\n'), {
        timeout: 15000,
        message:
          `TC-7 FAIL: ESC bị hiểu là huỷ — "${expected}" không vào lưới ` +
          `(BaseDialog.cs:320-326, pack "${titleBefore}")`,
      })
      .toContain(expected)
  })
})
