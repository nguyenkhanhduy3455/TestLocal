/**
 * カルテ記載選択 (自動表示) — CmtAutoPickerDialog, WinForm frm203012 gType.Auto.
 *
 * Spec anh em của `cmt-auto-picker-enter.spec.ts` (chỉ lo phím Enter ở window).
 * File này chốt BỐN hành vi frm203012 mà bản 自動表示 vừa được port bổ sung —
 * trước đó chỉ có bản `gType.Cult` (karte-selection-dialog.spec.ts) là có.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - INP/Forms/frm203012.cs
 *      · initProc, nhánh `case gType.Auto` (:418): dòng
 *        `btnChgVisible(btnF1, false)` BỊ COMMENT OUT ⇒ F1 部位 vẫn BẬT ở
 *        自動表示, y hệt gType.Cult.
 *      · btnF1_Click (:188-215): mở frm902003 `InputType.PatMsg`, chèn
 *        `pData.strBui1` tại caret, KHÔNG kèm xuống dòng, kết bằng
 *        `txtValue.Focus()`.
 *      · defData (:614-624): chèn `cmt_nm` + xuống dòng tại caret, rồi
 *        `getAsta(wkMsg2, 0)` — quét CẢ ô text từ index 0 và bôi đen cụm `*`
 *        đầu tiên.
 *      · btnDummy_Click (:353) = Enter trong ô text (AcceptButton, :419): còn
 *        `*` → nhảy về cụm ĐẦU TIÊN; hết `*` → chèn xuống dòng tại caret.
 *        KHÔNG bao giờ 確定.
 *      · formBase_KeyDown (:167-172): `Keys.End` VÀ `Keys.Escape` đều gọi
 *        `btnF9_Click` ⇒ ESC là 確定, không phải huỷ.
 *      · btnF9_Click (:226) + fixProc (:1350-1364): `*` còn sót → dấu cách,
 *        trim từng dòng, bỏ dòng rỗng, cắt 300 byte; dòng vượt số pick →
 *        手入力 cmt_cd 7999.
 *  - components/cmt-auto-picker-dialog.tsx
 *      · Tab 「カルテコメント一覧」, 4 cột id: dispNo / cmtCd / cmtSb / cmtNm.
 *      · Ô テキスト = primitive Textarea → `textbox` DUY NHẤT trong dialog.
 *      · Footer: F1 部位 / F9 確定 / F10 戻る. `End` bind ẩn (hidden) — chính nó
 *        làm ESC-close của DraggableDialog đứng im (useEscapeClose).
 *      · onConfirm → karteCommentToPick → trtNm = cmtNm (KHÔNG có
 *        REGIRYO_PADLEFT như nhánh Cult), 点0 / 回1, chèn đáy ngày.
 *  - components/tooth-selection-dialog.tsx (部位選択, frm902003 PatMsg)
 *      · F7 全顎 / F10 反転 / F11 全消去 / F12 戻る / End = 確定. Đóng nó KHÔNG
 *        được dùng ESC (ESC → End → 確定 thật).
 *
 * ─── VÌ SAO GỘP MỌI ASSERT VÀO MỘT `test()` ─────────────────────────────────
 * Dialog này KHÔNG có nút nào mở tay: nó chỉ bung ra khi AutoSantei chạy, mà
 * AutoSantei chỉ chạy khi (患者, ngày) chưa có 処置 nào được lưu
 * (xem `auto-picker-precondition.ts`). 確定 một lần là hàng đợi 自動表示 đi tiếp
 * và không mở lại được nữa ⇒ mọi phép đo KHÔNG-確定 phải chạy trước, phép đo
 * 確定 (End/ESC) để CUỐI CÙNG. Cũng vì thế mà 1 test = 1 login (Rule 10.1).
 *
 * KHÔNG assert ở đây: cắt 300 byte của fixProc — mỗi lần mở chỉ 確定 được đúng
 * một lần, và một dòng dài 300+ byte hiển thị trong lưới 診療入力 phụ thuộc bề
 * rộng cột nên assert rất giòn.
 *
 * ─── GHI DB ─────────────────────────────────────────────────────────────────
 * 確定 KHÔNG gọi /use-count (fixProc chỉ chạy fixCmt2 cho gType.Cult) và cũng
 * KHÔNG lưu trn_trn — nó chỉ chèn dòng vào lưới 診療入力 trên RAM. Spec không
 * bấm F9 登録 nên không có gì xuống DB, vì vậy không cần cờ TEST_ALLOW_DB_WRITE.
 *
 * ─── ENV ────────────────────────────────────────────────────────────────────
 *   TEST_PAT_NO (10) · TEST_TRT_DT (hôm nay — phải là ngày CHƯA nhập 処置 nào).
 */
import { expect, test, type Page } from '@playwright/test'

import { expectAutoPickerOpened } from './auto-picker-precondition'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const PAT_NO = process.env.TEST_PAT_NO ?? '10'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)

/**
 * CSS chứ không `getByRole('dialog')`: Radix AlertDialog gọi `hideOthers` khi
 * mount → gắn `aria-hidden` lên portal của dialog khác, làm locator theo role
 * "tắt" dù dialog vẫn hiện (bẫy đã ghi ở summary-comment-selection-enter.spec.ts).
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
  // karte-selection-dialog.spec.ts: ở đó phải bấm No để KHỎI bung dialog này.)
  const shoshinConfirm = page.getByRole('button', { name: 'Yes' })
  await shoshinConfirm.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {})
  if (await shoshinConfirm.count()) await shoshinConfirm.click()

  await expectAutoPickerOpened(page, PAT_NO, TRT_DT)
  await expect(rows(page).first()).toBeVisible({ timeout: 20000 })
  await step()

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
    expect(
      await readSel(page),
      `cụm "*" trong "${name}" phải được bôi đen sẵn để gõ đè (getAsta)`,
    ).toEqual({ start, end: start + len })
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

  // F7 全顎 chọn toàn hàm rồi End = 確定. KHÔNG dùng ESC ở đây: ESC map vào End
  // nên cũng là 確定, còn F10 là 反転 chứ không phải 戻る (tooth-selection-dialog).
  await buiDialog(page).getByRole('button', { name: /全顎/ }).click()
  await step()
  await page.keyboard.press('End')
  await expect(buiDialog(page), 'End trong 部位選択 phải 確定 và đóng nó').toHaveCount(0, {
    timeout: 15000,
  })
  await step()

  const afterBui = await textBox(page).inputValue()
  expect(afterBui, 'btnF1_Click phải chèn 部位 vào GIỮA caret (sau "あ", trước "い")').toMatch(
    /^あ.+い$/,
  )
  expect(
    afterBui.includes('\n'),
    'btnF1_Click chèn `strBui1` trần, KHÔNG kèm xuống dòng như defData',
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
