/**
 * trouble-1 / dialog #2 — カルテ記載選択 (CmtAutoPickerDialog, frm203012 gType.Auto)
 * Enter ở window level: TC-1 / TC-2 / TC-3 / TC-4.
 *
 * Đây là dialog DUY NHẤT có guard `[role="alertdialog"]` → TC-2 kỳ vọng PASS,
 * dùng làm mốc so sánh cho 10 dialog còn lại.
 * Nó THIẾU `e.defaultPrevented` → TC-3 nghi ngờ FAIL (append 2 dòng / nhảy 2 dòng).
 *
 * Guard hiện có (cmt-auto-picker-dialog.tsx):
 *   key==='Enter' → querySelector('[role="alertdialog"]') → document.activeElement
 *   là INPUT/TEXTAREA thì return. KHÔNG check defaultPrevented.
 *
 * Dialog TỰ BẬT khi mở 診療入力 của bệnh nhân có 処置 cần chọn カルテ記載.
 * Gộp 1 test = 1 login (app giới hạn 10 login / khung thời gian).
 *
 * TEST_PAT_NO / TEST_TRT_DT — đổi bệnh nhân / ngày.
 */
import { expect, test, type Page } from '@playwright/test'

import { expectAutoPickerOpened } from './auto-picker-precondition'
import { ADMIN_USER, JA } from './test-data'
import { makeStep } from './step'

const PAT_NO = process.env.TEST_PAT_NO ?? '10'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)

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
})
