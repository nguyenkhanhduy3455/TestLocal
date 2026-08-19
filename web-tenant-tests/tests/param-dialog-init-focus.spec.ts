/**
 * パラメータ入力 (frm203048 / frmCmtPrm) — con trỏ ban đầu.
 *
 * Dialog bung ra từ 摘要欄記載選択 (F7) → tab 「摘要記載事項一覧」 → chọn một
 * 記載事項 mà mẫu câu còn chỗ trống `＊`. WinForm mở lên là bôi đen sẵn cụm `＊`
 * ĐẦU TIÊN để người nhập gõ đè thẳng vào; người nhập màn này gõ không nhìn màn
 * hình nên mất vệt bôi đen là gõ ra sau mẫu câu chứ không thay vào chỗ trống.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - frm203048.cs:113-121 (_Shown)  → getAsta(txtValue.Text, 0): focus txtValue
 *    và select cụm `*` đầu tiên.
 *  - frm203048.cs:159-246 (btnF9)   → còn `*` thì KHÔNG 確定, chỉ nhảy sang cụm kế.
 *  - frm203048.cs:46 (_title)         → tiêu đề là 「パラメータ」, KHÔNG có 入力.
 *  - frm203048.cs:186-197 (txtValue_KeyDown)
 *      · Enter quét `*` TỪ CARET (không phải từ 0) → nhảy sang cụm kế tiếp; hết cụm
 *        sau caret thì 確定 luôn.
 *  - BaseDialog.cs:314-326 (KeyPreview) → End và Escape đều chạy btnF9_Click, mà
 *    btnF9_Click chỉ 確定 KHI không còn `*` nào (quét từ 0, :159-166). Nghĩa là ESC
 *    không huỷ: còn `*` thì nó chỉ bôi đen lại cụm ĐẦU.
 *  - frm203048.Designer.cs:45 → customLabel1 mặc định
 *    「パラメータを入力してください」, initProc chỉ ghi đè khi pack CÓ remarks
 *    (:135-137). A000-5-2 có remarks nên nhánh mặc định để unit test lo.
 *  - components/comment-param-dialog.tsx
 *      · nextAsterisk() nhận CẢ `*` nửa thân (mẫu trong DB) và `＊` toàn thân
 *        (chuỗi do BE dựng cho pack_type 42/51/53).
 *      · Con trỏ được đặt HAI lần: ngay trong effect, rồi lặp lại sau 2 frame.
 *        Lần layout ĐẦU TIÊN của dialog (react-rnd đặt vị trí cửa sổ) làm trình
 *        duyệt xoá vệt bôi đen về 0/0 — focus còn, selection mất, không hàm JS
 *        nào đụng vào. TC-2 canh đúng chỗ này.
 *  - CascadeCmtAutoQueries.cs:437-451 (ResolveCommentText case 51)
 *      · A000-5-2 (com_cd_1 851100077 + com_cd_2) → 「診療の開始終了時間（特） ＊＊:＊＊～＊＊:＊＊」.
 *
 * ─── ENV ─────────────────────────────────────────────────────────────────────
 *   TEST_PAT_NO (10) · TEST_TRT_DT (hôm nay) · TEST_PARAM_PACK_CD (A000-5-2 —
 *   đổi nếu master của tenant không có 記載事項 này).
 *   KHÔNG ghi DB: spec đóng dialog bằng F10, không bao giờ 確定.
 */
import { expect, test, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '10'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
const PACK_CD = process.env.TEST_PARAM_PACK_CD ?? 'A000-5-2'

const SANTEI_CONFIRM = /を算定しますか？/

const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** 摘要欄記載選択 — nhận diện bằng tên tab, KHÔNG bằng title (title giãn space). */
const summaryDialog = (page: Page) => anyDialog(page).filter({ hasText: '摘要コメント一覧' })
/**
 * frm203048 — `_title = "パラメータ"` (frm203048.cs:46), render giãn space thành
 * 「パ ラ メ ー タ」. Regex chịu được cả space nên không phụ thuộc cách giãn.
 *
 * ⚠️ Bản trước lọc `hasText: 'パラメータ入力'` — đó là tiêu đề SAI của web, đã sửa ở
 * commit `61122398d` (Rule 22: source đổi thì locator đi theo).
 */
const paramDialog = (page: Page) => anyDialog(page).filter({ hasText: /パ\s*ラ\s*メ\s*ー\s*タ/ })
const paramInput = (page: Page) => paramDialog(page).locator('input')
/** Ô 摘要記載事項 của F7 (txtValuePack) — nơi 確定 của パラメータ đổ chữ vào. */
const packBox = (page: Page) => summaryDialog(page).locator('textarea').last()

/** [start, end] của cụm `*`/`＊` đầu tiên trong chuỗi — bản JS của getAsta. */
function firstRun(text: string): [number, number] | null {
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '*' || c === '＊') {
      let len = 1
      while (text[i + len] === c) len++
      return [i, i + len]
    }
  }
  return null
}

/** Vệt bôi đen hiện tại của ô パラメータ. */
const readSel = (page: Page) =>
  paramInput(page).evaluate((el) => {
    const i = el as HTMLInputElement
    return { start: i.selectionStart, end: i.selectionEnd, focused: document.activeElement === i }
  })

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('パラメータ入力 — 初期フォーカス (frm203048)', () => {
  let page: Page
  let step: () => Promise<void>

  /** F7 → tab 摘要記載事項一覧 → Enter trên dòng PACK_CD → パラメータ入力. */
  const openParamDialog = async () => {
    if ((await paramDialog(page).count()) > 0) return

    if ((await summaryDialog(page).count()) === 0) {
      for (let i = 0; i < 8 && (await anyDialog(page).count()) > 0; i++) {
        await page.keyboard.press('F10')
        await page.waitForTimeout(500)
      }
      await page.keyboard.press('F7')
      await expect(summaryDialog(page), 'F7 không mở được 摘要欄記載選択').toBeVisible({
        timeout: 20000,
      })
    }

    const d = summaryDialog(page)
    await d.getByRole('button', { name: '摘要記載事項一覧' }).click()
    await expect(d.getByTestId('cell-packNm').first()).toBeVisible({ timeout: 15000 })

    const codes = (await d.getByTestId('cell-packCd').allTextContents()).map((c) => c.trim())
    const idx = codes.indexOf(PACK_CD)
    expect(
      idx,
      `master của tenant không có 記載事項 「${PACK_CD}」 trong khung nhìn — đổi TEST_PARAM_PACK_CD`,
    ).toBeGreaterThanOrEqual(0)

    await d.locator('[data-testid^="row-"]').nth(idx).click()
    await page.keyboard.press('Enter')
    await expect(paramDialog(page), `chọn ${PACK_CD} không mở được パラメータ入力`).toBeVisible({
      timeout: 20000,
    })
    await step()
  }

  const closeParamDialog = async () => {
    if ((await paramDialog(page).count()) === 0) return
    await paramDialog(page).getByRole('button', { name: /戻る/ }).click()
    await expect(paramDialog(page)).toHaveCount(0, { timeout: 10000 })
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // Confirm 算定 phải trả lời No: bấm Yes sẽ chạy AutoSantei rồi bung
    // カルテ記載選択 chồng lên, mọi assert phía sau đo nhầm dialog (Rule 14.1).
    await page.addLocatorHandler(
      page.getByText(SANTEI_CONFIRM).first(),
      async () => {
        await anyDialog(page)
          .filter({ hasText: SANTEI_CONFIRM })
          .getByRole('button', { name: /^(No|いいえ)$/ })
          .first()
          .click({ timeout: 3000 })
          .catch(() => {})
      },
      { times: 30 },
    )

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(
      page,
      'login không vào được — chạy liên tiếp nhiều lần thì đang dính rate-limit, chờ ~4 phút (Rule 9)',
    ).toHaveURL(/\/$/)

    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-grid-cell$="|3"]').last()).toBeVisible({ timeout: 60000 })
    await page.waitForTimeout(2000)
    await step()
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test('TC-1 mở lên là focus ô パラメータ và bôi đen cụm `＊` đầu tiên', async () => {
    await openParamDialog()

    const value = await paramInput(page).inputValue()
    const run = firstRun(value)
    expect(run, `mẫu câu 「${value}」 không có chỗ trống ＊ — đổi TEST_PARAM_PACK_CD`).not.toBeNull()

    expect(
      await readSel(page),
      'frm203048_Shown: phải focus txtValue và select cụm ＊ đầu (getAsta)',
    ).toEqual({ start: run![0], end: run![1], focused: true })
  })

  test('TC-2 vệt bôi đen còn nguyên sau khi dialog đã layout xong', async () => {
    await openParamDialog()
    const value = await paramInput(page).inputValue()
    const run = firstRun(value)!

    // Lần layout đầu của dialog xoá selection mà không hàm JS nào đụng tới; nó
    // xảy ra ở frame ngay sau khi mount nên TC-1 (đọc sớm) vẫn có thể xanh giả.
    await page.waitForTimeout(1000)
    expect(
      await readSel(page),
      'selection bị mất sau lần layout đầu — người nhập sẽ gõ ra sau mẫu câu thay vì đè lên ＊',
    ).toEqual({ start: run[0], end: run[1], focused: true })
  })

  test('TC-3 gõ ngay là đè lên cụm `＊`, không chèn thêm', async () => {
    await openParamDialog()
    const value = await paramInput(page).inputValue()
    const run = firstRun(value)!

    await page.keyboard.type('08')
    await step()
    expect(
      await paramInput(page).inputValue(),
      'gõ đè phải thay đúng cụm ＊ đầu tiên (đây là lý do WinForm select sẵn)',
    ).toBe(`${value.slice(0, run[0])}08${value.slice(run[1])}`)

    await closeParamDialog()
  })

  test('TC-4 tiêu đề là 「パラメータ」, không phải 「パラメータ入力」', async () => {
    await openParamDialog()
    const heading = (await paramDialog(page).getByRole('heading').first().innerText())
      .replace(/\s/g, '')
      .trim()
    expect(heading, '_title = "パラメータ" (frm203048.cs:46)').toBe('パラメータ')
    await closeParamDialog()
  })

  test('TC-5 Enter nhảy sang cụm `＊` KẾ TIẾP tính từ caret', async () => {
    await openParamDialog()
    const value = await paramInput(page).inputValue()
    const run1 = firstRun(value)!

    // Gõ đè cụm 1 → caret nằm ngay sau chỗ vừa gõ; Enter phải tìm cụm KẾ TIẾP
    // (txtValue_KeyDown quét từ SelectionStart, không phải từ 0).
    await page.keyboard.type('08')
    const filled = await paramInput(page).inputValue()
    const caret = run1[0] + 2
    const nextRun = firstRun(filled.slice(caret))
    expect(nextRun, `mẫu câu 「${filled}」 phải còn ≥2 cụm ＊ để đo`).not.toBeNull()

    await page.keyboard.press('Enter')
    await step()
    expect(
      await readSel(page),
      'Enter phải bôi đen cụm ＊ kế tiếp sau caret (frm203048.cs:186-197)',
    ).toEqual({ start: caret + nextRun![0], end: caret + nextRun![1], focused: true })

    await closeParamDialog()
  })

  test('TC-6 ESC là 確定 (btnF9): còn `＊` thì không đóng, bôi đen lại cụm đầu', async () => {
    await openParamDialog()
    const value = await paramInput(page).inputValue()
    const run1 = firstRun(value)!

    // Đưa caret về cuối để chắc chắn không phải "vẫn đang chọn cụm 1".
    await paramInput(page).evaluate((el) => {
      const i = el as HTMLInputElement
      i.setSelectionRange(i.value.length, i.value.length)
    })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    await step()

    await expect(
      paramDialog(page),
      'ESC bị hiểu là huỷ — WinForm đưa ESC vào btnF9_Click, mà btnF9 không 確定 khi còn ＊',
    ).toHaveCount(1)
    expect(
      await readSel(page),
      'btnF9_Click quét từ index 0 nên phải bôi đen lại cụm ＊ ĐẦU',
    ).toEqual({ start: run1[0], end: run1[1], focused: true })

    await closeParamDialog()
  })

  test('TC-7 điền hết `＊` rồi End thì 確定 và chữ vào ô 摘要記載事項', async () => {
    await openParamDialog()
    const before = await packBox(page).evaluate((el) => (el as HTMLTextAreaElement).value)

    // Điền lần lượt từng cụm: gõ đè → Enter nhảy cụm kế (TC-5), tối đa 8 vòng.
    const FILL = ['08', '00', '17', '30', '00', '00', '00', '00']
    let text = await paramInput(page).inputValue()
    for (let i = 0; i < FILL.length && firstRun(text) !== null; i++) {
      await page.keyboard.type(FILL[i]!)
      text = await paramInput(page).inputValue()
      if (firstRun(text) === null) break
      await page.keyboard.press('Enter')
    }
    expect(firstRun(text), `còn ＊ chưa điền: 「${text}」`).toBeNull()
    const expected = text

    await page.keyboard.press('End')
    await page.waitForTimeout(800)
    await step()

    await expect(paramDialog(page), 'End không 確定 — dialog パラメータ còn mở').toHaveCount(0, {
      timeout: 10000,
    })
    const after = await packBox(page).evaluate((el) => (el as HTMLTextAreaElement).value)
    expect(
      after.replace(before, '').trim(),
      'chữ đã điền phải rơi vào ô 摘要記載事項 của F7 (sink summaryPack)',
    ).toContain(expected)
  })
})
