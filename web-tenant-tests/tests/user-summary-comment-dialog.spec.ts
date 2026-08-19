/**
 * ユーザー摘要コメント選択 (frm203019) + 摘要２検索 (frm902012 mst_cmt2) — parity của
 * chuỗi F7 → 摘要記載事項一覧 → pack_type 90.
 *
 * Đường đi (đúng đường user tái hiện được): 診療入力 → F7 「摘要欄記載選択」 →
 * tab 「摘要記載事項一覧」 → dòng A000-1 (初診理由, pack_type 90 = direct) → Enter
 * ⇒ frm203019 bung ra trên nền F7. Trong frm203019, F2 「摘要2選択」 mở frm902012.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 * frm203012 (nền F7, gType.Tekiyo)
 *  - :405            lblName = 「摘要コメント」 — chuỗi CỐ ĐỊNH cho gType này.
 *  - :235-245        đổi tab → focus lưới của tab đó (dgvView / dgvViewPack).
 *  - Designer:223    txtValuePack.Enabled = false ⇒ ô 摘要記載事項 chỉ để hiển thị.
 *
 * frm203019
 *  - :48             _title = 「ユーザー摘要コメント選択」.
 *  - :50-63          F1 部位 / F2 摘要2選択 / F9 確定 / F10 戻る.
 *  - :396 / :435     customLabel1 = remarks NGUYÊN VĂN; customLabel3 = 「処置名称 」+
 *                    mst_trt.cct_nm của 処置 đang có con trỏ ở lưới 診療入力.
 *  - :444-446        RowCount == 0 → txtChiryo.Focus() (pack A000-1 mặc định rỗng).
 *  - :521-530 (chkInputData) + :165  E00001「摘要コメントが入力されていません。」 —
 *                    追加 chỉ đọc txtChiryo, có dòng đang chọn cũng KHÔNG thay thế.
 *  - :248-277        追加 append rồi clearData; lưới rỗng nhận dòng đầu ⇒ dòng đó
 *                    thành CurrentCell và FullRowSelect chọn luôn.
 *  - :282-309        削除: Q00006「選択されている行（…）を削除します。よろしいですか？」;
 *                    xoá dòng cuối → con trỏ về dòng đầu.
 *  - :321-349        ↑ kéo con trỏ theo (:332); ↓ KHÔNG (btnDown không set CurrentCell).
 *  - :508-513        clearData kết thúc bằng txtChiryo.Focus() ⇒ sau 追加/削除/クリア
 *                    con trỏ luôn về ô nhập.
 *  - :230-243        戻る khi có sửa → Q00004「登録せずに終了します。よろしいですか？」.
 *  - BaseDialog.cs:314-326  End và ESC đều là btnF9_Click ⇒ 確定, không phải huỷ.
 *
 * frm902012 (mst_cmt2) + MstCmt2.cs:452-483
 *  - ORDER BY cmt_cd, cmt_sb ⇒ 7000-0, 7000-1, 7000-2 … (KHÔNG phải 使用回数 順).
 *  - Lọc chỉ chạy khi bấm 検索 (frm901002.cs:55-58); 0 dòng → E00003
 *    「該当するデータがありません。」; có dòng → dgvView.Focus() (frm902012.cs:228-236).
 *  - Designer:38     txtCmtNm.MaxLength = 40.
 *  - :159-166        F9 選択 khi lưới rỗng → E00007「選択するデータがありません。」.
 *
 * ─── KHÔNG GHI DB ───────────────────────────────────────────────────────────
 * `entryProc` (ghi mst_cmt_pack_users) chỉ chạy khi F9 確定 trong frm203019 LÚC
 * danh sách đã sửa. Spec này: mọi 追加/削除 đều đóng lại bằng 戻る, và TC dùng
 * End/ESC 確定 chỉ gõ chữ vào ô (typing KHÔNG set _updFlg) ⇒ không có INSERT/DELETE
 * nào. Kết quả 確定 cũng chỉ nằm trong ô 摘要記載事項 của F7 tới khi bấm F9 của F7 —
 * spec không bấm.
 *
 * ─── CẤU TRÚC (Rule 19 / Rule 23) ───────────────────────────────────────────
 * `serial` + MỘT page dựng ở beforeAll (1 login). Mỗi TC tự gọi `openUserDialog()`
 * nên chạy lẻ được. Rule 23 đủ 4 mục: 23.1 init focus (TC-B1/TC-C5), 23.2 không
 * scrollbar dọc thừa (TC-B2), 23.3 văn bản thông báo theo mã (TC-B3/B5/B7/TC-C3),
 * 23.4 đóng-mở lại reset (TC-B8).
 *
 * ─── ENV ────────────────────────────────────────────────────────────────────
 *   TEST_PAT_NO (10 — bệnh nhân KHÔNG làm AutoSantei bung カルテ記載選択 chồng lên) ·
 *   TEST_TRT_DT (hôm nay) · TEST_USER_CMT_PACK (A000-1).
 */
import { expect, test, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '10'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
/** 記載事項 mở frm203019 trực tiếp (pack_type 90). */
const PACK_CD = process.env.TEST_USER_CMT_PACK ?? 'A000-1'

const SANTEI_CONFIRM = /を算定しますか？/

/** CSS chứ không getByRole: Radix alert gắn aria-hidden lên portal khác (Rule 12). */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
const realAlert = (page: Page) => page.locator('[role="alertdialog"]')
/** F7 — nhận diện bằng tên tab, KHÔNG bằng title (title giãn space, Rule 13.1). */
const summaryDialog = (page: Page) => anyDialog(page).filter({ hasText: '摘要コメント一覧' })
/** frm203019 — tiêu đề 「ユーザー摘要コメント選択」. */
const userDialog = (page: Page) =>
  anyDialog(page).filter({ hasText: 'ユーザー摘要コメント選択' })
/** frm902012 — tiêu đề 「摘要２検索」 (giãn space). */
const cmt2Dialog = (page: Page) => anyDialog(page).filter({ hasText: /摘\s*要\s*２\s*検\s*索/ })

const userInput = (page: Page) => userDialog(page).locator('input')
const userRows = (page: Page) => userDialog(page).locator('[data-testid^="user-cmt-row-"]')
const userBtn = (page: Page, name: string | RegExp) =>
  userDialog(page).getByRole('button', { name })
/** Ô 摘要記載事項 của F7 (txtValuePack). */
const packBox = (page: Page) => summaryDialog(page).locator('textarea').last()

const alertText = async (page: Page) => (await realAlert(page).innerText()).replace(/\s+/g, ' ')
const clickAlert = async (page: Page, name: RegExp) =>
  realAlert(page).getByRole('button', { name }).first().click()
/**
 * Q00004 / Q00006 là `ShowOKCancelMsg` ⇒ hộp thoại có cặp OK / キャンセル
 * (`confirmDialog.okCancel`, shared/ui/confirm-dialog.ts:44-49). Alert 1 nút thì
 * chỉ có OK. Regex nới thêm はい/いいえ để không đỏ oan nếu nhãn được đổi.
 */
const OK_BTN = /^(OK|はい)$/
const CANCEL_BTN = /^(キャンセル|Cancel|いいえ|No)$/

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('ユーザー摘要コメント選択 + 摘要２検索 (frm203019 / frm902012)', () => {
  let page: Page
  let step: () => Promise<void>
  /** 処置名 của dòng đang có con trỏ — dùng đối chiếu 見出し 処置名称. */
  let focusedTrtNm = ''

  /** Dọn overlay để màn 診療入力 nhận được F7. */
  const clearOverlays = async () => {
    for (let i = 0; i < 10; i++) {
      if ((await realAlert(page).count()) > 0) {
        await clickAlert(page, OK_BTN).catch(() => {})
        await page.waitForTimeout(300)
        continue
      }
      if ((await anyDialog(page).count()) === 0) return
      if ((await anyDialog(page).filter({ hasText: SANTEI_CONFIRM }).count()) > 0) {
        await page.waitForTimeout(400)
        continue
      }
      await page.keyboard.press('F10')
      await page.waitForTimeout(500)
    }
  }

  /** F7 → tab 摘要記載事項一覧. Trả về khi lưới pack đã hiện. */
  const openSummaryEntryTab = async () => {
    if ((await summaryDialog(page).count()) === 0) {
      await clearOverlays()
      await page.keyboard.press('F7')
      await expect(summaryDialog(page), 'F7 không mở được 摘要欄記載選択').toBeVisible({
        timeout: 20000,
      })
    }
    const tab = summaryDialog(page).getByRole('button', { name: '摘要記載事項一覧' })
    if ((await summaryDialog(page).getByTestId('cell-packNm').count()) === 0) await tab.click()
    await expect(summaryDialog(page).getByTestId('cell-packNm').first()).toBeVisible({
      timeout: 15000,
    })
    await step()
  }

  /** Mở frm203019 qua dòng PACK_CD (pack_type 90 → direct). */
  const openUserDialog = async () => {
    if ((await userDialog(page).count()) > 0) return
    await openSummaryEntryTab()

    const codes = (await summaryDialog(page).getByTestId('cell-packCd').allTextContents()).map(
      (c) => c.trim(),
    )
    const idx = codes.indexOf(PACK_CD)
    expect(
      idx,
      `master không có 記載事項 「${PACK_CD}」 trong khung nhìn — đổi TEST_USER_CMT_PACK`,
    ).toBeGreaterThanOrEqual(0)

    await summaryDialog(page).locator('[data-testid^="row-"]').nth(idx).click()
    await page.keyboard.press('Enter')
    await expect(userDialog(page), `chọn ${PACK_CD} không mở được frm203019`).toBeVisible({
      timeout: 20000,
    })
    await step()
  }

  /** Đóng frm203019 bằng 戻る; trả lời Q00004 nếu có sửa. */
  const closeUserDialog = async () => {
    if ((await userDialog(page).count()) === 0) return
    await userBtn(page, /戻る/).click()
    if ((await realAlert(page).count()) > 0) await clickAlert(page, OK_BTN)
    await expect(userDialog(page)).toHaveCount(0, { timeout: 10000 })
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // Confirm 算定 phải trả lời No: Yes chạy AutoSantei rồi bung カルテ記載選択 cùng
    // tên tab, mọi assert sau đó đo nhầm dialog (Rule 14.1).
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
    await clearOverlays()
    await step()
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ── A. nền F7 (frm203012 gType.Tekiyo) ───────────────────────────────────
  test('TC-A1 見出し của F7 là 「摘要コメント」 (lblName, :405)', async () => {
    await openSummaryEntryTab()
    expect(
      (await summaryDialog(page).getByTestId('lbl-name').innerText()).trim(),
      'gType.Tekiyo dùng chuỗi cố định 摘要コメント, không phải 摘要記載事項',
    ).toBe('摘要コメント')
  })

  test('TC-A2 đổi tab thì focus vào lưới của tab đó, không phải nút tab (:235-245)', async () => {
    await openSummaryEntryTab()

    /** Lưới nào đang giữ focus — nhận diện bằng header của chính lưới đó. */
    const focusedGrid = () =>
      page.evaluate(() => {
        const el = document.activeElement
        if (!(el instanceof HTMLElement) || el.getAttribute('tabindex') !== '0') {
          return `<${el?.tagName ?? '?'}>`
        }
        if (el.querySelector('[data-testid="header-packCd"]')) return 'pack'
        if (el.querySelector('[data-testid="header-dispNo"]')) return 'comment'
        return `<${el.tagName}>`
      })

    // `tabControl1_SelectedIndexChanged` chỉ bắn khi index ĐỔI, nên phải sang tab
    // kia trước — click lại đúng tab đang mở thì React bail-out, không có effect
    // nào chạy và focus nằm trên nút (WinForm cũng không gọi .Focus() ở nhánh đó).
    await summaryDialog(page).getByRole('button', { name: '摘要コメント一覧' }).click()
    await expect(summaryDialog(page).getByTestId('cell-dispNo').first()).toBeVisible({
      timeout: 15000,
    })
    expect(await focusedGrid(), 'đổi sang tab 摘要コメント一覧 phải focus lưới コメント').toBe(
      'comment',
    )
    await step()

    await summaryDialog(page).getByRole('button', { name: '摘要記載事項一覧' }).click()
    await expect(summaryDialog(page).getByTestId('cell-packCd').first()).toBeVisible({
      timeout: 15000,
    })
    expect(
      await focusedGrid(),
      'focus phải ở lưới 摘要記載事項一覧 — nếu còn trên nút tab thì Enter vừa chọn dòng ' +
        'vừa kích lại tab, làm highlight nhảy về dòng đầu',
    ).toBe('pack')
  })

  test('TC-A3 ô 摘要記載事項 là disabled (txtValuePack.Enabled = false)', async () => {
    await openSummaryEntryTab()
    expect(
      await packBox(page).evaluate((el) => (el as HTMLTextAreaElement).disabled),
      'Enabled = false ⇒ xám, không Tab tới được, không gõ tay',
    ).toBe(true)
  })

  // ── B. frm203019 ─────────────────────────────────────────────────────────
  test('TC-B1 (23.1) mở lên: lưới rỗng → focus ô 摘要コメント; caption + ガイダンス đúng', async () => {
    await openUserDialog()

    const banner = (
      await userDialog(page)
        .getByText(/^処置名称\s/)
        .first()
        .innerText()
    ).trim()
    focusedTrtNm = banner.replace(/^処置名称\s*/, '').trim()
    expect(focusedTrtNm, '見出し 処置名称 trống — customLabel3 phải là 処置名 của dòng đang chọn').not.toBe('')

    // ガイダンス: initProc ghi remarks thẳng vào customLabel1 → không thêm nhãn.
    expect(await userDialog(page).getByText('摘要ガイダンス:').count()).toBe(0)

    // RowCount == 0 → txtChiryo.Focus()
    if ((await userRows(page).count()) === 0) {
      await expect(userInput(page), 'lưới rỗng thì con trỏ phải ở ô 摘要コメント (:444-446)').toBeFocused()
    }
  })

  test('TC-B2 (23.2) thân dialog không có scrollbar dọc thừa', async () => {
    await openUserDialog()
    const { scrollH, clientH } = await userDialog(page).evaluate((el) => ({
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }))
    expect(scrollH, 'thân frm203019 bị cuộn dọc dù viewport còn chỗ').toBeLessThanOrEqual(
      clientH + 1,
    )
  })

  test('TC-B3 (23.3) 追加 với ô trống → E00001, và KHÔNG thêm dòng nào', async () => {
    await openUserDialog()
    const before = await userRows(page).count()
    await userBtn(page, /^追加$/).click()
    await expect(realAlert(page)).toBeVisible({ timeout: 10000 })
    expect(
      await alertText(page),
      'chkInputData chỉ đọc txtChiryo ⇒ E00001「摘要コメントが入力されていません。」',
    ).toContain('摘要コメントが入力されていません。')
    await clickAlert(page, OK_BTN)
    await expect(realAlert(page)).toHaveCount(0, { timeout: 10000 })
    expect(await userRows(page).count()).toBe(before)
  })

  test('TC-B4 追加 dòng đầu → dòng đó được selected + con trỏ về ô nhập', async () => {
    await openUserDialog()
    expect(
      await userRows(page).count(),
      `pack ${PACK_CD} phải rỗng để đo nhánh "dòng đầu" — đổi TEST_USER_CMT_PACK`,
    ).toBe(0)

    await userInput(page).click()
    await page.keyboard.type('E2Eテスト摘要')
    await userBtn(page, /^追加$/).click()
    await expect(userRows(page)).toHaveCount(1, { timeout: 10000 })
    await step()

    expect(
      await userRows(page).first().getAttribute('class'),
      'lưới rỗng nhận dòng đầu ⇒ dòng đó thành CurrentCell và FullRowSelect chọn luôn',
    ).toContain('bg-blue-500')
    await expect(userInput(page), 'clearData kết thúc bằng txtChiryo.Focus() (:508-513)').toBeFocused()
    expect(await userInput(page).inputValue()).toBe('')

    await closeUserDialog()
  })

  test('TC-B5 (23.3) 削除 hỏi Q00006 nguyên văn; Cancel không xoá, OK xoá + focus về ô nhập', async () => {
    await openUserDialog()
    await userInput(page).click()
    await page.keyboard.type('E2E削除対象')
    await userBtn(page, /^追加$/).click()
    await expect(userRows(page)).toHaveCount(1, { timeout: 10000 })

    await userBtn(page, /^削除$/).click()
    await expect(realAlert(page)).toBeVisible({ timeout: 10000 })
    expect(await alertText(page), 'Q00006 (:295)').toContain(
      '選択されている行（E2E削除対象）を削除します。よろしいですか？',
    )
    await clickAlert(page, CANCEL_BTN)
    await expect(userRows(page), 'Cancel mà vẫn xoá').toHaveCount(1, { timeout: 10000 })

    await userBtn(page, /^削除$/).click()
    await expect(realAlert(page)).toBeVisible({ timeout: 10000 })
    await clickAlert(page, OK_BTN)
    await expect(userRows(page)).toHaveCount(0, { timeout: 10000 })
    await expect(userInput(page), '削除 cũng kết thúc bằng clearData (:308)').toBeFocused()

    await closeUserDialog()
  })

  test('TC-B6 ↓ không kéo con trỏ theo, ↑ thì có (:321-349)', async () => {
    await openUserDialog()
    for (const t of ['E2E-1', 'E2E-2']) {
      await userInput(page).click()
      await page.keyboard.type(t)
      await userBtn(page, /^追加$/).click()
    }
    await expect(userRows(page)).toHaveCount(2, { timeout: 10000 })
    const order = async () => (await userRows(page).allInnerTexts()).map((t) => t.trim())
    expect(await order()).toEqual(['E2E-1', 'E2E-2'])

    await userRows(page).first().click()
    await userBtn(page, /下へ/).click()
    expect(await order()).toEqual(['E2E-2', 'E2E-1'])
    // btnDown KHÔNG set CurrentCell ⇒ con trỏ vẫn ở index 0 (giờ là E2E-2) nên
    // lần ↓ thứ hai đảo lại đúng thứ tự ban đầu.
    await userBtn(page, /下へ/).click()
    expect(
      await order(),
      '↓ lần 2 phải đảo lại — nếu ra ["E2E-1","E2E-2"] khác thì con trỏ đã đi theo dòng',
    ).toEqual(['E2E-1', 'E2E-2'])

    // ↑ thì con trỏ đi theo dòng (:332): đứng ở dòng 2 rồi ↑ hai lần vẫn là cùng dòng.
    await userRows(page).nth(1).click()
    await userBtn(page, /上へ/).click()
    expect(await order()).toEqual(['E2E-2', 'E2E-1'])

    await closeUserDialog()
  })

  test('TC-B7 (23.3) 戻る khi có sửa hỏi Q00004; Cancel thì vẫn mở', async () => {
    await openUserDialog()
    await userInput(page).click()
    await page.keyboard.type('E2E戻る確認')
    await userBtn(page, /^追加$/).click()
    await expect(userRows(page)).toHaveCount(1, { timeout: 10000 })

    await userBtn(page, /戻る/).click()
    await expect(realAlert(page)).toBeVisible({ timeout: 10000 })
    expect(await alertText(page), 'Q00004 (:234)').toContain(
      '登録せずに終了します。よろしいですか？',
    )
    await clickAlert(page, CANCEL_BTN)
    await expect(userDialog(page), 'Cancel mà dialog vẫn đóng').toHaveCount(1)

    await closeUserDialog()
  })

  test('TC-B8 (23.4) đóng rồi mở lại: sửa dở KHÔNG sống sót', async () => {
    await openUserDialog()
    await userInput(page).click()
    await page.keyboard.type('E2E消えるはず')
    await userBtn(page, /^追加$/).click()
    await expect(userRows(page)).toHaveCount(1, { timeout: 10000 })
    await closeUserDialog()

    await openUserDialog()
    expect(
      await userRows(page).count(),
      'WinForm dựng form mới mỗi lần mở (Dispose) ⇒ 追加 chưa 確定 phải mất',
    ).toBe(0)
    expect(await userInput(page).inputValue()).toBe('')
  })

  test('TC-B9 ESC là 確定: chữ trong ô đổ vào 摘要記載事項 của F7', async () => {
    await openUserDialog()
    const before = await packBox(page).evaluate((el) => (el as HTMLTextAreaElement).value)

    // Chỉ GÕ (không 追加) ⇒ _updFlg = false ⇒ 確定 không ghi DB, chỉ trả text.
    await userInput(page).click()
    await page.keyboard.type('E2E-ESC確定')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await step()

    await expect(userDialog(page), 'ESC bị hiểu là huỷ (BaseDialog.cs:320-326)').toHaveCount(0, {
      timeout: 10000,
    })
    const after = await packBox(page).evaluate((el) => (el as HTMLTextAreaElement).value)
    expect(after.replace(before, ''), '確定 phải đổ chữ vào ô 摘要記載事項').toContain('E2E-ESC確定')
  })

  // ── C. 摘要２検索 (frm902012) ─────────────────────────────────────────────
  test('TC-C1 F2 mở 摘要２検索, danh sách theo thứ tự (cmt_cd, cmt_sb)', async () => {
    await openUserDialog()
    await userBtn(page, /摘要2選択/).click()
    await expect(cmt2Dialog(page), 'F2 không mở được 摘要２検索').toBeVisible({ timeout: 20000 })
    await expect(cmt2Dialog(page).getByTestId('cell-dspCmtCd').first()).toBeVisible({
      timeout: 15000,
    })
    await step()

    const codes = (await cmt2Dialog(page).getByTestId('cell-dspCmtCd').allTextContents()).map(
      (c) => c.trim(),
    )
    expect(codes.length, 'không đọc được dòng nào').toBeGreaterThan(1)
    const key = (c: string) => {
      const [cd, sb] = c.split('-')
      return Number(cd) * 100000 + Number(sb)
    }
    const sorted = [...codes].sort((a, b) => key(a) - key(b))
    expect(
      codes,
      `MstCmt2.cs:466 ORDER BY cmt_cd, cmt_sb — thấy: ${codes.slice(0, 8).join(', ')}`,
    ).toEqual(sorted)
  })

  test('TC-C5 (23.1) 摘要２検索 mở lên focus vào lưới (getViewData → dgvView.Focus())', async () => {
    const isGrid = await page.evaluate(
      () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.getAttribute('tabindex') === '0' &&
        document.activeElement.querySelector('[data-testid="header-dspCmtCd"]') !== null,
    )
    expect(isGrid, 'frm902012 getViewData kết thúc bằng dgvView.Focus() (:235)').toBe(true)
  })

  test('TC-C2 gõ vào 名称 KHÔNG lọc; chỉ 検索 mới lọc (frm901002.cs:55-58)', async () => {
    const all = await cmt2Dialog(page).getByTestId('cell-dspCmtCd').count()
    const box = cmt2Dialog(page).getByLabel('名称')
    expect(await box.getAttribute('maxlength'), 'txtCmtNm.MaxLength = 40').toBe('40')

    await box.fill('終了')
    await page.waitForTimeout(500)
    expect(
      await cmt2Dialog(page).getByTestId('cell-dspCmtCd').count(),
      'gõ vào 名称 mà danh sách đã đổi ⇒ đang lọc sống, WinForm chỉ lọc khi bấm 検索',
    ).toBe(all)

    await cmt2Dialog(page).getByRole('button', { name: '検索' }).click()
    await page.waitForTimeout(500)
    await step()
    const names = (await cmt2Dialog(page).getByTestId('cell-cmtNm').allTextContents()).map((t) =>
      t.trim(),
    )
    expect(names.length, '検索 「終了」 không ra dòng nào').toBeGreaterThan(0)
    expect(names.every((n) => n.includes('終了'))).toBe(true)
  })

  test('TC-C3 (23.3) 検索 không ra dòng nào → E00003', async () => {
    // `fill` chứ không Ctrl+A: trên macOS Ctrl+A là "về đầu dòng", không phải
    // select-all — bản trước gõ NỐI vào chuỗi cũ và làm TC sau đo sai.
    const box = cmt2Dialog(page).getByLabel('名称')
    await box.fill('zzz該当なし')
    await cmt2Dialog(page).getByRole('button', { name: '検索' }).click()
    await expect(realAlert(page)).toBeVisible({ timeout: 10000 })
    expect(await alertText(page), 'E00003 (frm902012.cs:229-232)').toContain(
      '該当するデータがありません。',
    )
    await clickAlert(page, OK_BTN)
    await expect(realAlert(page)).toHaveCount(0, { timeout: 10000 })
  })

  test('TC-C4 End là 選択: tên comment đổ vào ô 摘要コメント của frm203019', async () => {
    // Về lại danh sách đầy đủ rồi chọn dòng đầu bằng End.
    if ((await realAlert(page).count()) > 0) await clickAlert(page, OK_BTN)
    const box = cmt2Dialog(page).getByLabel('名称')
    await box.fill('')
    await cmt2Dialog(page).getByRole('button', { name: '検索' }).click()
    await expect(cmt2Dialog(page).getByTestId('cell-cmtNm').first()).toBeVisible({
      timeout: 15000,
    })
    const first = (await cmt2Dialog(page).getByTestId('cell-cmtNm').first().innerText()).trim()

    await cmt2Dialog(page).locator('[data-testid^="row-"]').first().click()
    await page.keyboard.press('End')
    await page.waitForTimeout(600)
    await step()

    await expect(cmt2Dialog(page), 'End không 選択 (dialog còn mở)').toHaveCount(0, {
      timeout: 10000,
    })
    expect(
      await userInput(page).inputValue(),
      'frm203019.btnF2 gán pData.cmtNm vào txtChiryo (:150-155)',
    ).toBe(first)

    await closeUserDialog()
  })
})
