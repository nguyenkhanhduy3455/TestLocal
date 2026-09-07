/**
 * カルテ記載選択 — bản 自動表示 (CmtAutoPickerDialog, WinForm frm203012 gType.Auto).
 *
 * MỘT DIALOG = MỘT FILE. Trước đây dialog này bị chẻ làm hai spec: một lo phím
 * Enter ở window level, một lo 4 hành vi frm203012 mới port. Cùng dialog, cùng
 * `cmt-auto-picker-dialog.tsx`, cùng bệnh nhân 10, cùng một tiền đề khó dựng
 * (`expectAutoPickerOpened`) — sửa dialog này lẽ ra chỉ nên mở một file.
 *
 * Bản gType.Cult (F6, mở từ frm203011) là dialog KHÁC, ở
 * `dialogs-selection/karte-selection-dialog.spec.ts`.
 *
 * Hai khối dưới đây giữ NGUYÊN VĂN nội dung hai file cũ, mỗi khối một bộ locator
 * riêng — hai bên bắt dialog theo hai cách khác nhau, đó là chủ ý (xem chú thích
 * trong từng khối) chứ không phải trùng lặp.
 *
 * ⚠️ TIỀN ĐỀ CHUNG: dialog chỉ TỰ BẬT khi (患者, ngày) CHƯA có 処置 nào được lưu —
 * `AutoSantei` không chạy thì không sinh queue 自動表示. Cách chạy lại khi ngày đã
 * "bẩn" ghi ở `_shared/auto-picker-precondition.ts`.
 */

import { expect, test, type Page } from '@playwright/test'
import { expectAutoPickerOpened } from '../_shared/auto-picker-precondition'
import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { makeStep } from '../_shared/step'
import { ADMIN_USER, JA } from '../_shared/test-data'

// ═══ nguyên văn từ cmt-auto-picker-enter.spec.ts (đã gộp vào file này) ═════════════════════════════════════
test.describe('Enter ở window level', () => {

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

const dialog = (page: Page) => page.getByRole('dialog')
const header = (page: Page, label: string) =>
  dialog(page).getByRole('button', { name: new RegExp(`^${label}\\s*[▲▼]?$`) })
const cells = (page: Page, colId: string) => dialog(page).getByTestId(`cell-${colId}`)
/** Textarea 記載内容 — không label/placeholder/testid → bắt bằng tag trong dialog. */
const textarea = (page: Page) => dialog(page).locator('textarea')

/** Số dòng thực sự có chữ trong textarea (append mỗi Enter thêm 1 dòng). */
const lineCount = async (page: Page) =>
  (await textarea(page).inputValue()).split('\n').filter((l) => l.trim() !== '').length

test('カルテ記載選択 — Enter window-level (TC-1/2/3/4)', async ({ page }) => {
  test.setTimeout(300_000)

  // Rule 11 — nhịp quan sát: --headed/--ui → chậm lại, chạy nền → 0s (tests/step.ts).
  const step = makeStep(page)

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

  // Confirm 「歯科初診料を算定しますか？」 phải bấm Yes thì AutoSantei mới chạy →
  // mới sinh queue 自動表示 → mới có カルテ記載選択.
  const shoshinConfirm = page.getByRole('button', { name: 'Yes' })
  await shoshinConfirm.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { })
  if (await shoshinConfirm.count()) await shoshinConfirm.click()

  await expectAutoPickerOpened(page, PAT_NO, TRT_DT)
  await expect(cells(page, 'cmtNm').first()).toBeVisible({ timeout: 20000 })
  expect(
    await cells(page, 'cmtNm').count(),
    'dialog < 2 dòng → không test được Enter/sort, đổi TEST_PAT_NO',
  ).toBeGreaterThan(1)

  // ───────────────────────────────────────────────────────────────────────
  // TC-1 — Enter khi con trỏ đang ở textarea 記載内容
  // Kỳ vọng: KHÔNG append comment; Enter chỉ xuống dòng trong textarea.
  // (#2 có guard activeElement → INPUT/TEXTAREA ⇒ kỳ vọng PASS)
  // ───────────────────────────────────────────────────────────────────────
  await textarea(page).click()
  await textarea(page).fill('')
  await textarea(page).type('あ')
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await step()
  const afterTypeEnter = await textarea(page).inputValue()
  expect(
    afterTypeEnter,
    'TC-1 FAIL: Enter trong textarea vẫn append comment của grid',
  ).toBe('あ\n')

  await textarea(page).fill('')

  // ───────────────────────────────────────────────────────────────────────
  // TC-2 — Enter khi có alertDialog đè lên trên
  // Ép hiện alertdialog bằng cách inject (app chỉ mở alert theo E-code, không
  // deterministic). Guard chỉ đọc querySelector('[role="alertdialog"]') nên
  // node giả cũng đủ để verify đúng nhánh guard đó.
  // Kỳ vọng: textarea KHÔNG bị append thêm dòng nào.
  // ───────────────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const n = document.createElement('div')
    n.id = 'tc2-fake-alert'
    n.setAttribute('role', 'alertdialog')
    document.body.appendChild(n)
  })

  // Focus PHẢI ra khỏi textarea: #2 CŨNG bỏ qua Enter khi activeElement là
  // TEXTAREA/INPUT (guard riêng của TC-1). Để focus kẹt trong textarea thì
  // TC-2 sẽ pass vì guard SAI → pass giả, không chứng minh được guard alertdialog.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? '')
  expect(activeTag, 'TC-2 setup hỏng: focus vẫn ở TEXTAREA/INPUT → sẽ pass giả').not.toMatch(
    /^(TEXTAREA|INPUT)$/,
  )

  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  await step()
  expect(
    await lineCount(page),
    'TC-2 FAIL: alertdialog đang mở mà picker phía dưới vẫn nhận Enter',
  ).toBe(0)
  await page.evaluate(() => document.getElementById('tc2-fake-alert')?.remove())

  // ───────────────────────────────────────────────────────────────────────
  // TC-3 — Enter khi một ROW của grid đang được focus
  // VirtualListTable.handleRowKeyDown đã preventDefault + onOpenRow.
  // #2 KHÔNG check e.defaultPrevented → handler window chạy tiếp ⇒ 2 lần.
  // Kỳ vọng ĐÚNG: đúng 1 dòng được append. NGHI NGỜ FAIL: ra 2 dòng.
  // ───────────────────────────────────────────────────────────────────────
  await textarea(page).fill('')
  // Focus row THẬT (không probe giả) để đo đúng số dòng được append: đây là
  // kịch bản 1 Enter → row handler + window handler cùng chạy ⇒ 2 dòng.
  const firstRow = dialog(page).locator('[data-testid^="row-"]').first()
  await firstRow.evaluate((el: HTMLElement) => el.focus())
  const focusedRow = await page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') ?? '',
  )
  expect(focusedRow, 'TC-3 setup hỏng: row không nhận được focus → không đo được').toMatch(/^row-/)

  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await step()
  expect
    .soft(
      await lineCount(page),
      'TC-3 FAIL: thiếu guard e.defaultPrevented → Enter chạy 2 lần (row handler + window handler)',
    )
    .toBe(1)

  // ───────────────────────────────────────────────────────────────────────
  // TC-4 — Enter sau khi đã sort cột
  // Sort カルテコメント desc → dòng hiển thị #0 phải là dòng được commit,
  // không phải phần tử index 0 của mảng gốc.
  // ───────────────────────────────────────────────────────────────────────
  await textarea(page).fill('')
  await header(page, 'カルテコメント').click()
  await header(page, 'カルテコメント').click()
  await expect(header(page, 'カルテコメント')).toHaveAttribute('aria-sort', 'descending')

  const displayedFirst = (await cells(page, 'cmtNm').first().innerText()).trim()
  // Chọn dòng đầu theo thứ tự HIỂN THỊ rồi Enter (click row = onSelectIndex).
  await dialog(page).locator('[data-testid^="row-"]').first().click()
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await step()
  expect(
    (await textarea(page).inputValue()).trim(),
    'TC-4 FAIL: commit nhầm dòng — tra theo mảng gốc thay vì mảng đã sort',
  ).toContain(displayedFirst)

  // ───────────────────────────────────────────────────────────────────────
  // TC-5 — con trỏ phải TIẾN sau mỗi Enter, kể cả khi row đang giữ focus
  //
  // Click vào row đẩy DOM focus vào chính div của row (VirtualListTable gán
  // tabIndex cho row), nên Enter do onKeyDown của row xử lý và nó
  // preventDefault ⇒ listener window của dialog bị isWindowKeyBlocked chặn.
  // Trước đây phần "nhảy dòng kế" CHỈ nằm ở listener window, nên sau khi click
  // thì Enter lần 2 lặp lại đúng dòng cũ. WinForm dgvView_KeyDown không set
  // e.Handled nên DataGridView vẫn tự hạ con trỏ 1 dòng.
  // ───────────────────────────────────────────────────────────────────────
  await textarea(page).fill('')
  const displayed = (await cells(page, 'cmtNm').allTextContents()).map((t) => t.trim())
  expect(displayed.length, 'TC-5 cần ≥2 dòng hiển thị').toBeGreaterThan(1)

  await dialog(page).locator('[data-testid^="row-"]').first().click()
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  await step()
  expect(
    await textarea(page).inputValue(),
    'TC-5 FAIL: con trỏ không tiến sau Enter → hai lần Enter chèn cùng một dòng',
  ).toBe(`${displayed[0]}\n${displayed[1]}\n`)
})

})

// ═══ nguyên văn từ cmt-auto-picker-parity.spec.ts (đã gộp vào file này) ════════════════════════════════════
test.describe('F1 部位 / getAsta / btnDummy / End・ESC 確定', () => {

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/**
 * CSS chứ không `getByRole('dialog')`: Radix AlertDialog gọi `hideOthers` khi
 * mount → gắn `aria-hidden` lên portal của dialog khác, làm locator theo role
 * "tắt" dù dialog vẫn hiện (bẫy đã ghi ở dialogs-selection/summary-comment-selection-enter.spec.ts).
 */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** frm203012 gType.Auto — nhận diện bằng tab, KHÔNG bằng title (Rule 13.1). */
const picker = (page: Page) => anyDialog(page).filter({ hasText: 'カルテコメント一覧' })
/** frm902003 PatMsg — nhận diện bằng nút 全顎, không dialog nào khác có. */
const buiDialog = (page: Page) =>
  anyDialog(page).filter({ has: page.getByRole('button', { name: /全顎/ }) })

const cells = (page: Page, colId: string) => picker(page).locator(`[data-testid="cell-${colId}"]`)
const rows = (page: Page) => picker(page).locator('[data-testid^="row-"]')
/** Ô テキスト (txtValue) — textbox DUY NHẤT trong dialog. */
const textBox = (page: Page) => picker(page).getByRole('textbox')
/** Nút trong picker — bó vào dialog vì màn nền cũng có 戻る (Rule 10.3). */
const pickerBtn = (page: Page, name: RegExp) => picker(page).getByRole('button', { name })
/**
 * Wrapper `tabIndex={0}` bọc lưới — control mà `initProc` focus. Loại
 * `[data-index]` vì dòng của lưới cũng có tabindex.
 */
const gridContainer = (page: Page) =>
  picker(page).locator('[tabindex="0"]:not([data-index])').first()

/** Ô răng đang bật trong 部位選択 — `title="Type: N"` (tooth-selection-dialog:265). */
const activeTeeth = (page: Page) => buiDialog(page).locator('button[title^="Type:"]')
/** Cột 療法・処置 của lưới 診療入力 — RegiCol.ryo = 2. */
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')

/** Đặt caret trong ô テキスト (Playwright không có API cho selection). */
const setCaret = (page: Page, pos: number) =>
  textBox(page).evaluate((el, p) => (el as HTMLTextAreaElement).setSelectionRange(p, p), pos)

/** Vùng đang bôi đen trong ô テキスト. */
const readSel = (page: Page) =>
  textBox(page).evaluate((el) => {
    const ta = el as HTMLTextAreaElement
    return { start: ta.selectionStart, end: ta.selectionEnd }
  })

test('カルテ記載選択 自動表示 — F1 部位 / getAsta / btnDummy / End・ESC 確定', async ({ page }) => {
  test.setTimeout(300_000)

  // Rule 11 — nhịp quan sát: --headed/--ui → chậm lại, chạy nền → 0s.
  const step = makeStep(page)

  // 省略表示 do BE dựng (GET /tenant/bui/omit-disp). Log lại để khi TC-3 đỏ thì
  // phân biệt ngay "app không gọi API" / "API trả rỗng" / "app không chèn".
  page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
  page.on('response', (res) => {
    if (res.url().includes('/tenant/bui/omit-disp')) {
      void res
        .text()
        .then((b) => console.log(`omit-disp ${res.status()}: ${b.slice(0, 200)}`))
        .catch(() => {})
    }
  })

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(
    page,
    'login không vào được — chạy liên tiếp nhiều lần thì đang dính rate-limit, ' +
      'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
  ).toHaveURL(/\/$/)

  await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

  // Phải bấm Yes cho 「歯科初診料を算定しますか？」 thì AutoSantei mới chạy → mới
  // sinh hàng đợi 自動表示 → mới có カルテ記載選択. (Ngược hẳn với
  // dialogs-selection/karte-selection-dialog.spec.ts: ở đó phải bấm No để KHỎI bung dialog này.)
  const shoshinConfirm = page.getByRole('button', { name: 'Yes' })
  await shoshinConfirm.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (await shoshinConfirm.count()) await shoshinConfirm.click()

  await expectAutoPickerOpened(page, PAT_NO, TRT_DT)
  await expect(rows(page).first()).toBeVisible({ timeout: 20000 })
  await step()

  // ───────────────────────────────────────────────────────────────────────
  // TC-0 — initProc đặt focus vào LƯỚI (this.ActiveControl = dgvView)
  // Phải đo NGAY khi dialog vừa bung, trước mọi click của các TC dưới.
  // ───────────────────────────────────────────────────────────────────────
  await expect
    .poll(
      () =>
        gridContainer(page).evaluate((el) => el === document.activeElement),
      {
        message:
          'initProc phải focus lưới khi có dòng (frm203012.cs:431-437) — không thì ' +
          'người nhập phải click chuột mới ↑/↓ được',
        timeout: 10000,
      },
    )
    .toBe(true)

  // ───────────────────────────────────────────────────────────────────────
  // TC-1 — defData chèn `cmt_nm` + XUỐNG DÒNG tại caret
  // Trước khi port lại, web nối `'\n' + cmtNm` vào CUỐI ô text, nên caret sau
  // mỗi lần chèn nằm ở cuối DÒNG vừa chèn chứ không phải đầu dòng mới. Hệ quả
  // là F1 部位 (TC-3) dán 部位 vào đuôi dòng trước, và khi 確定 thì dòng dính đó
  // ghép sai cặp với cmt_cd. Vì vậy phải chốt cả dấu '\n' ở cuối.
  // ───────────────────────────────────────────────────────────────────────
  const firstName = (await cells(page, 'cmtNm').first().innerText()).trim()
  await cells(page, 'cmtNm').first().dblclick()
  await step()
  await expect(
    textBox(page),
    'defData phải chèn cmt_nm KÈM xuống dòng ở cuối (frm203012.cs:614-624)',
  ).toHaveValue(`${firstName}\n`)

  // ───────────────────────────────────────────────────────────────────────
  // TC-2 — getAsta: cụm `*` của comment vừa chèn được bôi đen sẵn
  // Phụ thuộc DATA (Rule 18): master CMTAUTO của 処置 này có thể không có mẫu
  // điền tay nào → log BỎ QUA chứ không assert bừa.
  // ───────────────────────────────────────────────────────────────────────
  await textBox(page).fill('')
  const names = (await cells(page, 'cmtNm').allTextContents()).map((s) => s.trim())
  const astaIdx = names.findIndex((n) => n.includes('*'))
  if (astaIdx < 0) {
    console.log(
      `TC-2: không comment nào của 処置 này chứa "*" (đang có: ${JSON.stringify(names)}) ` +
        '→ BỎ QUA phần getAsta-khi-chèn. Đổi TEST_PAT_NO/TEST_TRT_DT sang 処置 có ' +
        'mẫu điền tay (vd 開口障害(*横指)). TC-4 vẫn kiểm getAsta bằng chuỗi tự gõ.',
    )
  } else {
    await cells(page, 'cmtNm').nth(astaIdx).dblclick()
    await step()
    const name = names[astaIdx] ?? ''
    const start = name.indexOf('*')
    const len = (name.slice(start).match(/^\*+/)?.[0] ?? '').length
    // `stage()` của usePendingSelection chỉ áp selection ở effect SAU khi React
    // commit giá trị mới ⇒ đọc một phát là bắt trúng selection cũ (Rule 10.8).
    await expect
      .poll(() => readSel(page), {
        message: `cụm "*" trong "${name}" phải được bôi đen sẵn để gõ đè (getAsta)`,
        timeout: 10000,
      })
      .toEqual({ start, end: start + len })
  }

  // ───────────────────────────────────────────────────────────────────────
  // TC-3 — F1 部位 mở 部位選択 và chèn 省略表示 TẠI CARET, không kèm xuống dòng
  // Trước khi port, nút F1 hiện ra nhưng KHÔNG có handler — bấm không xảy ra gì.
  // ───────────────────────────────────────────────────────────────────────
  await textBox(page).fill('あい')
  await setCaret(page, 1)
  await step()
  await pickerBtn(page, /部位/).click()
  await expect(
    buiDialog(page),
    'F1 部位 không mở được 部位選択 (frm902003 PatMsg) — nút vẫn là placeholder không handler?',
  ).toBeVisible({ timeout: 15000 })
  await step()

  // Chọn răng bằng phím số (KHÔNG dùng preset 全顎 — nó lọc theo SIGA, xem FACT).
  await page.keyboard.press('1')
  await expect(
    activeTeeth(page),
    'phím "1" phải bật một ô răng (cycleTooth, không qua SIGA) — chưa chọn được gì ' +
      'thì End sẽ trả bui rỗng và không có gì để chèn',
  ).not.toHaveCount(0, { timeout: 10000 })
  await step()

  // End = 確定. KHÔNG dùng ESC ở đây: ESC map vào End nên cũng là 確定, còn F10
  // là 反転 chứ không phải 戻る (tooth-selection-dialog).
  await page.keyboard.press('End')
  await expect(buiDialog(page), 'End trong 部位選択 phải 確定 và đóng nó').toHaveCount(0, {
    timeout: 15000,
  })
  await step()

  // ⚠️ `handleBuiConfirm` đóng 部位選択 TRƯỚC rồi mới `await` GET
  // /tenant/bui/omit-disp (~40-60ms) mới chèn ⇒ lúc dialog vừa biến mất ô text
  // VẪN CHƯA đổi. Đọc `inputValue()` ngay tại đây là đo trúng trạng thái chưa
  // chèn (đã fail thật 2 lần vì lý do này — Rule 10.8). Phải chờ bằng expect
  // auto-retry chứ không phải waitForTimeout (Rule 7).
  await expect(
    textBox(page),
    'F1 部位 không chèn gì vào ô text sau khi 部位選択 確定 — kiểm log "omit-disp" ' +
      'ở trên: 200 mà dsp rỗng là do SIGA lọc hết răng, không có log là app không gọi BE',
  ).not.toHaveValue('あい', { timeout: 15000 })

  const afterBui = await textBox(page).inputValue()
  // 省略表示 là ký tự EUDC (Private Use Area U+E000..U+F8FF) — in thẳng ra terminal
  // là VÔ HÌNH, nên phải escape thì thông báo lỗi mới đọc được.
  const esc = afterBui.replace(/[\uE000-\uF8FF]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)
  expect(afterBui.length, `F1 部位 không chèn gì vào ô text (đang là "${esc}")`).toBeGreaterThan(2)
  expect(
    afterBui,
    `btnF1_Click phải chèn 部位 vào GIỮA caret: "あ" + 部位 + "い". Đang là "${esc}"`,
  ).toMatch(/^あ[\uE000-\uF8FF]+い$/)
  expect(
    afterBui.includes('\n'),
    `btnF1_Click chèn \`strBui1\` trần, KHÔNG kèm xuống dòng như defData. Đang là "${esc}"`,
  ).toBe(false)

  // ───────────────────────────────────────────────────────────────────────
  // TC-4 — Enter trong ô テキスト = btnDummy_Click
  //   (a) còn `*` → nhảy về cụm ĐẦU TIÊN (quét từ index 0, KHÔNG từ caret)
  //   (b) hết `*` → chèn xuống dòng tại caret
  // Cả hai nhánh đều KHÔNG BAO GIỜ 確定 (nhánh Enter của txtValue_KeyDown là
  // code chết vì txtValue có AcceptsReturn=false + AcceptButton=btnDummy).
  // ───────────────────────────────────────────────────────────────────────
  await textBox(page).click()
  await textBox(page).fill('発赤(*)腫脹(**)')
  // Caret đặt SAU cụm `*` đầu tiên để phân biệt "quét từ 0" với "quét từ caret".
  await setCaret(page, 8)
  await step()
  await page.keyboard.press('Enter')
  await step()
  expect(
    await readSel(page),
    'Enter phải bôi đen cụm `*` ĐẦU TIÊN (index 3), không phải cụm nằm sau caret',
  ).toEqual({ start: 3, end: 4 })
  await expect(picker(page), 'Enter trong ô text không được đóng dialog').toBeVisible()

  await textBox(page).fill('ああ')
  await setCaret(page, 1)
  await step()
  await page.keyboard.press('Enter')
  await step()
  await expect(
    textBox(page),
    'hết `*` thì Enter chèn xuống dòng tại caret, KHÔNG được 確定',
  ).toHaveValue('あ\nあ')
  await expect(picker(page), 'Enter trong ô text không được đóng dialog').toBeVisible()

  // ───────────────────────────────────────────────────────────────────────
  // TC-5 — ESC là 確定 (btnF9_Click), KHÔNG phải huỷ  ⚠️ LÀM CUỐI CÙNG
  //
  // Ở dialog này 確定 và 戻る đều đóng dialog, nên "đã đóng" KHÔNG phân biệt được
  // hai nhánh. Bằng chứng duy nhất: dòng trong ô text phải rơi vào lưới 診療入力
  // (手入力 → cmt_cd 7999). Chuỗi cố tình có `*` để kiểm luôn nhánh
  // `Replace("*", " ")` của btnF9_Click.
  // ───────────────────────────────────────────────────────────────────────
  const TYPED = `テストESC*行${Date.now() % 100000}`
  const EXPECTED = TYPED.replace('*', ' ')
  await textBox(page).click()
  await textBox(page).fill(TYPED)
  await step()
  await page.keyboard.press('Escape')
  await step()

  await expect(
    ryoCell(page).filter({ hasText: EXPECTED }).first(),
    'ESC phải chạy btnF9_Click (確定) → dòng gõ tay vào lưới 診療入力. Không thấy dòng ' +
      'nào ⇒ ESC vẫn đang là HUỶ (escape-close của DraggableDialog chưa bị bind End chặn), ' +
      'hoặc `*` chưa được thay bằng dấu cách.',
  ).toBeVisible({ timeout: 20000 })

  const texts = (await ryoCell(page).allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())
  expect(
    texts.some((t) => t.includes(EXPECTED)),
    `dòng 確定 phải là "${EXPECTED}" (dấu * → dấu cách). Đang có: ${JSON.stringify(
      texts.filter((t) => t.includes('テストESC')),
    )}`,
  ).toBe(true)
})

})
