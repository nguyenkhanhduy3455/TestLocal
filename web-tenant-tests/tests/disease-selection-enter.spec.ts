/**
 * trouble-1 / dialog #6 — 病名選択 (DiseaseSelectionDialog, frm902007)
 * Enter ở window level: TC-1 / TC-1b (ô 選択番号) / TC-2 / TC-3 / TC-4.
 *
 * Dialog NẶNG NHẤT của TC-2: nó CHỦ ĐỘNG mở alertDialog khi 病名 không hợp lệ,
 * mà handler lại không check `[role="alertdialog"]` ⇒ rất dễ tái hiện bug.
 * Cũng thiếu `e.defaultPrevented` ⇒ TC-3 nghi ngờ FAIL.
 *
 * Guard hiện có (disease-selection-dialog.tsx):
 *   activeElement là INPUT/TEXTAREA và KHÁC ô 選択番号 → return  (TC-1 PASS)
 *   Enter trong ô 選択番号 → return, để onKeyDown riêng xử lý  (TC-1b — ĐÚNG, cố ý)
 *   KHÔNG check defaultPrevented, KHÔNG check alertdialog.
 *
 * Title render là '病 名 選 択' (tracking-[0.3em]) → match bằng regex nới khoảng trắng.
 * 3 ô input đều KHÔNG có label/testid → bắt bằng placeholder, riêng 選択番号
 * bắt bằng input[inputmode="numeric"] trong dialog.
 *
 * Đường đi: /treatments/<patNo> → tab 病検 → cell 病名 → 病名選択.
 */
import { expect, test, type Page } from '@playwright/test'

import { ADMIN_USER, JA } from './test-data'
import { makeStep } from './step'

const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)

const dialog = (page: Page) => page.getByRole('dialog')
const header = (page: Page, label: string) =>
  dialog(page).getByRole('button', { name: new RegExp(`^${label}\\s*[▲▼]?$`) })
const cells = (page: Page, colId: string) => dialog(page).getByTestId(`cell-${colId}`)
/** '病 名 選 択' — chữ cách nhau bởi tracking CSS nhưng text node có space thật. */
const title = (page: Page) => page.getByText(/病\s*名\s*選\s*択/)

const searchInput = (page: Page) => dialog(page).getByPlaceholder('検索 (病名 / カナ)')
const createInput = (page: Page) => dialog(page).getByPlaceholder('病名作成 (手入力)')
const dspCdInput = (page: Page) => dialog(page).locator('input[inputmode="numeric"]').first()

test('病名選択 — Enter window-level (TC-1/1b/2/3/4)', async ({ page }) => {
  // 120s mặc định không đủ: điều hướng (login → dọn dialog → panel 病検 → 部位選択
  // → 病名選択) đã tốn nhiều, cộng thêm nhịp step() khi chạy --headed.
  test.setTimeout(300_000)

  // Rule 11 — nhịp quan sát: --headed/--ui → chậm lại, chạy nền → 0s (tests/step.ts).
  const step = makeStep(page)

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

  const shoshinConfirm = page.getByRole('button', { name: 'Yes' })
  await shoshinConfirm.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (await shoshinConfirm.count()) await shoshinConfirm.click()

  // Dọn dialog tự bật (カルテ記載選択 / 摘要コメント選択 — queue 自動表示).
  // PHẢI chờ nó HIỆN trước rồi mới đóng: AutoSantei chạy async, kiểm tra count()
  // ngay sau nút Yes luôn ra 0 → thoát sớm → dialog bật sau đó chặn hết thao tác.
  await page
    .getByRole('dialog')
    .first()
    .waitFor({ state: 'visible', timeout: 45000 })
    .catch(() => {})
  for (let i = 0; i < 15 && (await page.getByRole('dialog').count()); i++) {
    await page.keyboard.press('F10')
    await page.waitForTimeout(800)
  }
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 15000 })

  // --- Mở 病名選択: KHÔNG có đường trực tiếp. Chuỗi duy nhất là
  //     部位選択 → 確定 → 病名選択 (treatment-entry-detail handleToothConfirm:860-865).
  //
  //     KHÔNG dùng cell 部位 của grid chính: grid mở ra ở mục history (H18年10月…),
  //     mọi dòng đó bị isHistoryRowKey chặn nên click vô hiệu.
  //     Dùng panel 病検 bên phải: nút 変更 bật 変更 mode → click 1 dòng 病検 →
  //     handleByouChange (:1050) → setToothDialogOpen(true).
  const toothTitle = page.getByText(/部\s*位\s*選\s*択/)
  await page.getByRole('button', { name: '病検', exact: true }).click().catch(() => {})
  await page.getByRole('button', { name: '変更', exact: true }).click()

  // Dòng panel 病検 dùng cùng class với header (grid-cols-[44px_270px_1fr]) →
  // index 0 là header No./部位/病名, dòng dữ liệu bắt đầu từ 1.
  const byoRows = page.locator('div[class*="grid-cols-[44px_270px_1fr]"]')
  await expect(byoRows.nth(1), 'panel 病検 chưa có dòng nào — đổi TEST_PAT_NO').toBeVisible({
    timeout: 20000,
  })
  await byoRows.nth(1).click()

  await expect(
    toothTitle,
    'không mở được 部位選択 từ panel 病検 — kiểm tra nút 変更 / dòng 病検',
  ).toBeVisible({ timeout: 20000 })

  // 確定 của 部位選択 là phím End (tooth-selection-dialog: End → onConfirm(bui)),
  // KHÔNG phải F9 (F9 = Br例). onConfirm chạy kể cả khi bui rỗng → 病名選択 mở.
  await page.keyboard.press('End')

  // .first(): title() có thể khớp >1 element → toBeVisible() không .first() sẽ
  // ném "strict mode violation" thay vì báo đúng vấn đề.
  await expect(title(page).first(), 'không mở được 病名選択 — kiểm tra lại tab 病検').toBeVisible({
    timeout: 30000,
  })
  await expect(cells(page, 'disNm').first()).toBeVisible({ timeout: 20000 })
  expect(await cells(page, 'disNm').count()).toBeGreaterThan(1)

  // ───────────────────────────────────────────────────────────────────────
  // TC-1 — Enter khi con trỏ ở ô 検索 (INPUT thường)
  // Kỳ vọng PASS: dialog KHÔNG 確定, KHÔNG đóng.
  // ───────────────────────────────────────────────────────────────────────
  // Ảnh chụp trạng thái dialog — dùng chung cho mọi TC. So sánh nguyên cụm thay vì
  // chỉ đếm title: bug có thể biểu hiện là drilldown sang tầng 詳細 (cột 枝番 xuất
  // hiện) hoặc đổi dòng đầu, chứ không nhất thiết là đóng dialog.
  const snapshotBefore = async () => ({
    // Dùng BOOLEAN "dialog đang mở", KHÔNG dùng count() của text-locator.
    // title() là regex text lỏng (/病\s*名\s*選\s*択/) — bất kỳ element nào tình cờ
    // khớp cũng làm count nhảy 1→2 và snapshot lệch, dù dialog không hề 確定.
    // Đã dính đúng bẫy này ở TC-1b: dialog vẫn mở nguyên mà test báo FAIL.
    open: await title(page).first().isVisible(),
    sub: await cells(page, 'disSb').count(),
    firstRow: (
      await cells(page, 'disNm')
        .first()
        .innerText()
        .catch(() => '')
    ).trim(),
  })

  await searchInput(page).click()
  await searchInput(page).fill('あ')
  const beforeTc1 = await snapshotBefore()
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  await step()
  expect
    .soft(await snapshotBefore(), 'TC-1 FAIL: Enter trong ô 検索 vẫn kích hoạt grid')
    .toEqual(beforeTc1)
  await searchInput(page).fill('')
  await page.waitForTimeout(800)

  // ───────────────────────────────────────────────────────────────────────
  // TC-1b — Enter trong ô 病名作成 (INPUT thường, KHÁC 選択番号)
  // Kỳ vọng: window handler đứng ngoài; chỉ handleCreateDis của ô đó chạy.
  // ───────────────────────────────────────────────────────────────────────
  if (await createInput(page).count()) {
    await createInput(page).click()
    await createInput(page).fill('テスト病名')
    const beforeTc1b = await snapshotBefore()
    await step()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    await step()
    expect
      .soft(await snapshotBefore(), 'TC-1b FAIL: Enter trong ô 病名作成 kích hoạt grid 確定')
      .toEqual(beforeTc1b)
    await createInput(page).fill('')
  }

  // ───────────────────────────────────────────────────────────────────────
  // TC-2 — Enter khi có alertDialog đè lên trên  ← BUG CHÍNH
  // #6 không check [role="alertdialog"] ⇒ NGHI NGỜ FAIL.
  // Ép alert bằng ô 選択番号 với số ngoài danh sách (mirror frm902007 txtNo).
  // Nếu app không ra alert thì inject node giả — guard chỉ đọc querySelector.
  // ───────────────────────────────────────────────────────────────────────
  await page.evaluate(() => {
    const n = document.createElement('div')
    n.id = 'tc2-fake-alert'
    n.setAttribute('role', 'alertdialog')
    document.body.appendChild(n)
  })

  // Focus PHẢI ra khỏi ô 選択番号: đó là chỗ #6 CỐ Ý bỏ qua Enter (`if (inDspCd) return`).
  // Nếu để focus kẹt trong ô này thì dialog không đóng vì lý do KHÁC → TC-2 pass giả.
  await dialog(page).locator('[data-testid^="row-"]').first().click()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? '')
  expect(activeTag, 'TC-2 setup hỏng: focus vẫn ở INPUT → sẽ pass giả').not.toBe('INPUT')

  const beforeTc2 = await snapshotBefore()
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await step()
  const afterTc2 = await snapshotBefore()
  await page.evaluate(() => document.getElementById('tc2-fake-alert')?.remove())
  expect
    .soft(
      afterTc2,
      'TC-2 FAIL: alertdialog đang mở mà 病名選択 phía dưới vẫn nhận Enter → 確定 / drilldown / đóng',
    )
    .toEqual(beforeTc2)

  // Dọn alert thật (nếu có) để chạy tiếp.
  const okBtn = page.getByRole('button', { name: 'OK' })
  if (await okBtn.count()) {
    await okBtn.click()
    await page.waitForTimeout(500)
  }

  // ───────────────────────────────────────────────────────────────────────
  // TC-3 — Enter khi một ROW của grid đang được focus
  // Row handler preventDefault + handleParentDblClick; window handler thiếu
  // defaultPrevented ⇒ NGHI NGỜ FAIL: 確定 2 lần / drilldown nhảy 2 tầng.
  // Kỳ vọng: chỉ đi ĐÚNG 1 bước (không nhảy thẳng qua tầng sub-code rồi đóng).
  // ───────────────────────────────────────────────────────────────────────
  // KHÔNG suy đoán "đi 1 bước hay 2 bước" qua UI — với dialog 2 tầng thì kết quả
  // nào cũng mơ hồ. Dùng probe xác định, mô phỏng đúng thứ tự sự kiện thật:
  //   VirtualListTable.handleRowKeyDown chạy TRƯỚC (React, trên row) và
  //   preventDefault() → khi event bay lên window, e.defaultPrevented đã = true.
  // Listener CAPTURE trên window luôn chạy trước listener BUBBLE của dialog, nên
  // gắn preventDefault ở capture là tái hiện chính xác tình huống đó — không phụ
  // thuộc vào việc row có focus được hay không (row là tabIndex={-1}).
  await page.evaluate(() => {
    const w = window as unknown as { __tc3?: (e: KeyboardEvent) => void }
    w.__tc3 = (e: KeyboardEvent) => {
      if (e.key === 'Enter') e.preventDefault()
    }
    window.addEventListener('keydown', w.__tc3, true)
  })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

  const beforeTc3 = await snapshotBefore()
  await step()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1000)
  await step()
  const afterTc3 = await snapshotBefore()
  await page.evaluate(() => {
    const w = window as unknown as { __tc3?: (e: KeyboardEvent) => void }
    if (w.__tc3) window.removeEventListener('keydown', w.__tc3, true)
  })
  expect
    .soft(
      afterTc3,
      'TC-3 FAIL: Enter đã bị preventDefault mà handler window vẫn chạy → thiếu guard e.defaultPrevented ⇒ 確定 2 lần',
    )
    .toEqual(beforeTc3)

  // ───────────────────────────────────────────────────────────────────────
  // TC-4 — Enter sau khi đã sort cột
  // Kỳ vọng: commit dòng đang highlight theo thứ tự HIỂN THỊ.
  // ───────────────────────────────────────────────────────────────────────
  await expect(
    title(page).first(),
    'TC-4 không chạy được: dialog đã đóng/đổi tầng ở bước trước — xem lỗi TC-2/TC-3 phía trên',
  ).toBeVisible()
  {
    await expect(header(page, '病名')).toBeVisible({ timeout: 10000 })
    await header(page, '病名').click()
    await header(page, '病名').click()
    await expect(header(page, '病名')).toHaveAttribute('aria-sort', 'descending')

    const displayedFirst = (await cells(page, 'disNm').first().innerText()).trim()
    await dialog(page).locator('[data-testid^="row-"]').first().click()
    await step()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    await step()

    expect(
      await page.locator('body').innerText(),
      'TC-4 FAIL: commit nhầm dòng — tra theo mảng gốc thay vì mảng đã sort',
    ).toContain(displayedFirst)
  }
})
