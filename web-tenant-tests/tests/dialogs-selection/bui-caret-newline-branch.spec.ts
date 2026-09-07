/**
 * #3b — Caret sau khi chèn 部位 ở nhánh "nhảy qua newline" (frm203012 btnF1_Click).
 *
 * Spec này KHÔNG chốt hành vi đúng. Nó dựng đúng một kịch bản mà **web và WinForm
 * ra kết quả khác nhau**, rồi in cả hai giá trị ra để đối chiếu tay với WinForm.
 * Assert đang theo hành vi WEB HIỆN TẠI (xanh trên bản dev hôm nay); nếu sau này
 * quyết định port bug của WinForm thì spec này đỏ và phải đổi hằng số ở
 * `EXPECT_MODE`.
 *
 * ═══ FACT LẤY TỪ SOURCE (Rule 21) ════════════════════════════════════════════
 *  - INP/Forms/frm203012.cs:196-213 `btnF1_Click` — chèn 省略表示 vào txtValue:
 *
 *        int idx = txtValue.SelectionStart;
 *        if (idx == txtValue.Text.Length - 2 && msg.Substring(idx, 2) == NewLine)
 *            msg = msg.Substring(0, idx + 2) + strBui1 + msg.Substring(idx + 2);  // +2
 *        else
 *            msg = msg.Substring(0, idx) + strBui1 + msg.Substring(idx);
 *        txtValue.Text = msg;
 *        txtValue.Focus();
 *        txtValue.SelectionStart = idx + strBui1.Length;   // ← THIẾU +2
 *
 *    Nhánh trên dịch điểm chèn đi 2 ký tự (CRLF) nhưng dòng tính caret dùng
 *    CHUNG cho cả hai nhánh và không cộng bù. ⇒ ở nhánh newline, caret của
 *    WinForm **lùi đúng 2 ký tự** so với cuối chuỗi 部位 vừa chèn, tức nằm GIỮA
 *    cụm glyph. Nhánh `else` (thường gặp) thì công thức đó lại đúng.
 *  - btnF1_Click kết thúc bằng `txtValue.Focus()` ⇒ con trỏ THẬT nằm ở đó: gõ
 *    tiếp hoặc bấm F1 部位 lần nữa sẽ chèn vào giữa chuỗi cũ.
 *  - web-tenant `lib/karte-cmt-text.ts` `insertAtCaret` — bản port. Web là LF nên
 *    điều kiện là `idx === text.length - 1 && text[idx] === '\n'`, và
 *    `pos = at + insert.length` ⇒ caret luôn ở CUỐI chuỗi vừa chèn.
 *  - `lib/use-karte-text-area.ts` `insertBui` — dùng chung cho cả 3 gType của
 *    frm203012 (カルテ記載選択 Cult / 同 Auto / 摘要欄記載選択 Tekiyo), nên bug này
 *    nếu port thì cả 3 màn cùng đổi.
 *  - `components/tooth-selection-dialog.tsx:576-591` — 部位選択 (frm902003 PatMsg):
 *      F3 `3≁3` / F7 全顎 / F10 反転 / F11 全消去 / F12 戻る / End 確定.
 *      ⇒ đóng phải bằng **F12**; ESC map vào End = 確定.
 *
 * ═══ KỊCH BẢN (khớp 1-1 với các bước làm tay trên WinForm) ═══════════════════
 *   1. 診療入力 → F6 コメント → bấm 1 nút group → hiện カルテ記載選択.
 *   2. Ô text = `ABC` + xuống dòng, caret đặt NGAY TRƯỚC dấu xuống dòng
 *      (trên WinForm: gõ `ABC`, Enter, rồi bấm ← đúng 1 lần).
 *      ⚠️ Caret ở dòng trống bên dưới = nhánh `else` = KHÔNG tái hiện được.
 *   3. F1 部位 → 全消去 → chọn preset → 確定.   (đến đây TEXT hai bên GIỐNG NHAU,
 *      chỉ caret khác — xem TC-2)
 *   4. Bộc lộ khác biệt bằng 1 trong 2 cách:
 *        A. gõ 1 ký tự `X`            (TC-3)
 *        B. F1 部位 lần thứ hai       (TC-4)
 *
 * ═══ CẤU TRÚC (Rule 19) ══════════════════════════════════════════════════════
 * `serial` + page dùng chung theo worker (`_shared/session.ts`). `ensurePresets()`
 * đo 省略表示 của 2 preset MỘT lần rồi cache, nên mỗi TC vẫn tự dựng lại được
 * trạng thái. Vẫn nên **chạy cả file**, không chạy lẻ 1 TC.
 *
 * ⚠️ Chạy ở chế độ `winform`: TC-2 đỏ TRƯỚC, và `serial` làm TC-3/TC-4/TC-5 bị
 * SKIP — đó là đặc tính của serial, không phải TC sau hỏng. Muốn xem riêng phần
 * TEXT (TC-3/TC-4) đỏ thì tạm `test.skip` TC-2. Ở chế độ `web` (mặc định) cả 5
 * TC cùng chạy, và TC-3/TC-4 có sẵn assert `winform !== web` để chứng minh hai
 * công thức thật sự ra hai chuỗi khác nhau.
 *
 * ═══ ĐÃ CHẠY THẬT (2026-09-07, BN 11 / hôm nay) ══════════════════════════════
 *   · `web`     → 5 TC xanh.
 *   · `winform` → TC-2 đỏ đúng chỗ cần: Expected 8 / Received 10.
 *   · 省略表示 đo được: 「3≁3」 = 6 ký tự EUDC, 「全顎」 = 15 ký tự EUDC.
 *     TC-3 in ra rõ hai kỳ vọng:
 *       WEB     "ABC\n\ue0a9\ue0af\ue0b2\ue0af\ue0a9\ue0a3X"   ← X ở cuối
 *       WinForm "ABC\n\ue0a9\ue0af\ue0b2\ue0afX\ue0a9\ue0a3"   ← X sau ký tự thứ 4
 *
 * ═══ BẪY ĐÃ LƯỜNG TRƯỚC ══════════════════════════════════════════════════════
 *  1. Dialog cha (frm203011 lưới group) và con (frm203012) TRÙNG TITLE
 *     「カ ル テ 記 載 選 択」. Không phân biệt bằng title — cha nhận diện bằng nút
 *     PCR, con bằng tab 「カルテコメント一覧」.
 *  2. `CmtAutoPickerDialog` (gType.Auto) cũng cùng tên, cùng tab đó. Vì vậy
 *     `installOverlayHandlers({ santei: true })` phải trả lời **No** cho
 *     「〜を算定しますか？」 — bấm Yes là nó bung ra và mọi assert đo nhầm dialog.
 *  3. 部位選択 KHÔNG unmount khi đóng (`open={toothSelectionOpen}` giữ nguyên cây),
 *     nên **lựa chọn răng của lần trước còn nguyên**. ⇒ bắt buộc bấm 全消去 trước
 *     mỗi preset, nếu không lần 2 sẽ ra chuỗi cộng dồn của cả hai preset.
 *  4. TUYỆT ĐỐI không bấm **F9 確定** của カルテ記載選択 trong file này: nó ghi DB
 *     (`use_cnt` của mst_cmt2). Đóng bằng F10 戻る. Spec này vì vậy KHÔNG cần
 *     `TEST_ALLOW_DB_WRITE`.
 *  5. 省略表示 do BE tính (`GET /tenant/bui/omit-disp`) nên giá trị phụ thuộc
 *     master 歯式文字変換 của tenant. Spec KHÔNG hardcode glyph: nó đo chuỗi thật
 *     rồi dựng kỳ vọng bằng công thức. Hai công thức chỉ có nghĩa khi chuỗi dài
 *     ≥ 2 ký tự — có assert precondition riêng.
 *  6. Không dùng `page.keyboard.press('F11')` cho 全消去: F11 là fullscreen của
 *     trình duyệt. Bấm THẲNG vào nút trên thanh F-key của dialog.
 *
 * ═══ ENV ═════════════════════════════════════════════════════════════════════
 *   TEST_PAT_NO (11) · TEST_TRT_DT (hôm nay) ·
 *   TEST_KARTE_GRP (1 — nút group thứ mấy sẽ mở) ·
 *   TEST_BUI_PRESET_1 (3≁3) · TEST_BUI_PRESET_2 (全顎) — nhãn nút preset trên
 *     thanh F-key của 部位選択. Đổi nếu 歯牙情報 của bệnh nhân làm preset mặc định
 *     ra chuỗi rỗng hoặc hai preset ra cùng một chuỗi.
 */
import { type Locator, type Page } from '@playwright/test'

import { GRID_LOAD_TIMEOUT, TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

const PAT_NO = patNo('11')
const TRT_DT = trtDt(TODAY_ISO)
const GRP_INDEX = Number(process.env.TEST_KARTE_GRP ?? '1')
const PRESET_1 = process.env.TEST_BUI_PRESET_1 ?? '3≁3'
const PRESET_2 = process.env.TEST_BUI_PRESET_2 ?? '全顎'

/**
 * Đang assert theo phía nào.
 *   'web'     — hành vi web hiện tại (mặc định; spec XANH trên bản dev hôm nay).
 *   'winform' — hành vi WinForm. Đổi sang đây SAU KHI quyết định port bug;
 *               trước đó để 'winform' thì spec đỏ, và chính cái đỏ đó là "bản
 *               chụp" của khác biệt.
 * Bật nhanh không cần sửa file: `TEST_3B_EXPECT=winform npx playwright test …`
 */
const EXPECT_MODE: 'web' | 'winform' =
  process.env.TEST_3B_EXPECT === 'winform' ? 'winform' : 'web'

/** Nội dung mồi trong ô text. `\n` được thêm ở `armTriggerState`. */
const BASE = 'ABC'
const ARMED = `${BASE}\n`

/**
 * CSS selector chứ KHÔNG `getByRole('dialog')`: Radix AlertDialog gọi
 * `hideOthers` khi mount → gắn `aria-hidden` lên portal của dialog khác.
 */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** frm203011 — lưới nút group. Nhận diện bằng nút PCR. */
const groupGrid = (page: Page) => anyDialog(page).filter({ hasText: 'PCR' })
/** frm203012 Cult — lưới comment + ô テキスト. */
const cmtList = (page: Page) => anyDialog(page).filter({ hasText: 'カルテコメント一覧' })
/** frm902003 PatMsg — 部位選択. Nhận diện bằng nhãn F11 全消去. */
const toothDlg = (page: Page) => anyDialog(page).filter({ hasText: '全消去' })
/** Ô テキスト (txtValue) — textbox DUY NHẤT trong dialog con. */
const textBox = (page: Page) => cmtList(page).getByRole('textbox')
const cmtBtn = (page: Page, name: RegExp) => cmtList(page).getByRole('button', { name })

/** Đặt caret trong ô テキスト (Playwright không có API cho selection). */
const setCaret = (page: Page, pos: number) =>
  textBox(page).evaluate((el, p) => {
    const ta = el as HTMLTextAreaElement
    ta.focus()
    ta.setSelectionRange(p, p)
  }, pos)

const readSel = (page: Page) =>
  textBox(page).evaluate((el) => {
    const ta = el as HTMLTextAreaElement
    return { start: ta.selectionStart, end: ta.selectionEnd }
  })

/** Ô 療法・処置 của lưới 診療入力 — `RegiCol.ryo = 2`. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')
/** Alert お茶コン (E-code) — hẹp hơn `[role="dialog"]`. */
const realAlert = (page: Page) => page.locator('[role="alertdialog"]')

const SANTEI_CONFIRM = /を算定しますか？/
const santeiDlg = (page: Page) => anyDialog(page).filter({ hasText: SANTEI_CONFIRM })

/**
 * Hiện chuỗi ra dạng đọc được.
 *
 * 省略表示 dùng ký tự EUDC (vùng private-use U+E000…U+F8FF): in thẳng ra terminal
 * thì KHÔNG thấy gì, và hai chuỗi khác nhau trông y hệt nhau — bản đầu của spec
 * này in ra `"ABC\nX"` cho cả kỳ vọng WEB lẫn WinForm, vô dụng đúng ở chỗ cần
 * dùng nhất. Escape mọi ký tự ngoài ASCII in được thành `\uXXXX` để đối chiếu
 * với WinForm theo MÃ, không theo hình.
 */
const vis = (s: string) =>
  JSON.stringify(s).replace(
    /[^\x20-\x7e]/g,
    (c) => `\\u${c.codePointAt(0)!.toString(16).padStart(4, '0')}`,
  )

/** Vị trí (1-based) của từng ký tự trong cụm 部位, để mô tả "chèn vào giữa". */
const describeSplit = (bui: string) =>
  `cụm 部位 dài ${bui.length} ký tự — WEB chèn sau ký tự thứ ${bui.length}, ` +
  `WinForm chèn sau ký tự thứ ${bui.length - 2}`

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('#3b 部位 caret — nhánh nhảy-qua-newline (frm203012 btnF1_Click)', () => {
  let page: Page
  let step: () => Promise<void>
  /** Locator của handler 算定 — phải gỡ ở afterAll vì page dùng chung theo worker. */
  let santeiLoc: Locator

  // ── dọn overlay ───────────────────────────────────────────────────────────

  /**
   * Trả lời **No** cho 「〜を算定しますか？」.
   *
   * Nút No phải lấy TRONG dialog đang hỏi. Bản dùng
   * `page.getByRole('button', { name: /^(No|いいえ)$/ }).first()` (helper chung
   * `installOverlayHandlers`) KHÔNG dọn được ở màn này: handler chạy xong mà
   * dialog vẫn còn, Playwright kẹt ở "waiting for … to be hidden" cho tới hết
   * timeout của `beforeAll`. Đã đo: bản có scope dưới đây dọn xong trong 1 vòng.
   */
  const installSanteiNo = async () => {
    santeiLoc = page.getByText(SANTEI_CONFIRM).first()
    await page.addLocatorHandler(
      santeiLoc,
      async () => {
        await santeiDlg(page)
          .getByRole('button', { name: /^(No|いいえ)$/ })
          .first()
          .click({ timeout: 3000 })
          .catch(() => {})
      },
      { times: 30 },
    )
  }

  /** Bấm OK tới khi hết alert お茶コン. */
  const drainAlerts = async () => {
    for (let i = 0; i < 10; i++) {
      if ((await realAlert(page).count()) === 0) return
      const ok = realAlert(page).getByRole('button', { name: /^OK$/ })
      if ((await ok.count()) === 0) return
      await ok
        .first()
        .click()
        .catch(() => {})
      await page.waitForTimeout(300)
    }
  }

  /**
   * Dọn sạch overlay để màn 診療入力 nhận được F6.
   *
   * Sau khi trả lời No cho 「歯科初診料…」, chuỗi AutoSantei còn một nhịp nữa:
   * 処置 kế (歯科疾患管理料) tự 算定 KHÔNG hỏi rồi bung `CmtAutoPickerDialog` —
   * dialog CÙNG TÊN カルテ記載選択, CÙNG tab 「カルテコメント一覧」 với dialog spec
   * này đo. Nó tới trễ ~1s nên "0 dialog" ngay lúc này chưa có nghĩa là sạch.
   * (Đã đo: probe thấy đúng dialog đó còn lại sau khi bấm No.)
   */
  const clearOverlays = async () => {
    for (let i = 0; i < 12; i++) {
      await drainAlerts()
      if (await santeiDlg(page).count()) {
        // `installSanteiNo` là locator handler: nó CHỈ chạy khi Playwright đang
        // thực hiện một action / assert auto-retry. `waitForTimeout` trần không
        // kích hoạt nó — assert dưới đây mới là cú hích.
        await expect(santeiDlg(page))
          .toHaveCount(0, { timeout: 10000 })
          .catch(() => {})
        continue
      }
      if ((await anyDialog(page).count()) === 0) {
        await page.waitForTimeout(1500)
        if ((await anyDialog(page).count()) === 0) return
        continue
      }
      await page.keyboard.press('F10')
      await page.waitForTimeout(600)
    }
  }

  /** 省略表示 thật của 2 preset, đo một lần rồi cache. */
  let BUI_1 = ''
  let BUI_2 = ''

  // ── điều hướng ────────────────────────────────────────────────────────────

  /** F6 từ màn 診療入力 → lưới nút group (frm203011). */
  const openGroupGrid = async () => {
    if (await groupGrid(page).count()) return
    await clearOverlays()
    await expect(anyDialog(page), 'còn overlay đè lên màn 診療入力').toHaveCount(0, {
      timeout: 15000,
    })
    await page.keyboard.press('F6')
    await expect(
      groupGrid(page),
      'F6 không mở được カルテ記載選択 — dòng đang focus phải thuộc THÁNG HIỆN TẠI ' +
        '(guardCurrentMonth, treatment-entry-detail.tsx)',
    ).toBeVisible({ timeout: 20000 })
  }

  /** Mở lưới comment của group thứ `GRP_INDEX` (frm203012 Cult). */
  const openCmtList = async () => {
    if (await cmtList(page).count()) return
    await openGroupGrid()
    // Nút group = nhãn `{cmtGrp} {grpNm}` → bắt đầu bằng chữ số ("1 再来理由").
    const groupBtns = groupGrid(page).getByRole('button', { name: /^\d+\s*\S/ })
    await expect(
      groupBtns.first(),
      'lưới group không có nút nào dạng "<số> <tên>" — master mst_cmt2_grp rỗng?',
    ).toBeVisible({ timeout: 15000 })
    await groupBtns.nth(GRP_INDEX - 1).click()
    await expect(cmtList(page), 'click nút group không mở được lưới comment').toBeVisible({
      timeout: 15000,
    })
  }

  /** Đóng về màn 診療入力. F10 戻る, KHÔNG dùng ESC (ESC = 確定 → ghi DB). */
  const closeAll = async () => {
    if (await cmtList(page).count()) {
      await cmtBtn(page, /戻る/).click()
      await expect(cmtList(page)).toHaveCount(0, { timeout: 10000 })
    }
    if (await groupGrid(page).count()) {
      await groupGrid(page)
        .getByRole('button', { name: /戻る/ })
        .click()
      await expect(groupGrid(page)).toHaveCount(0, { timeout: 10000 })
    }
  }

  // ── thao tác 部位選択 ──────────────────────────────────────────────────────

  /**
   * F1 部位 → 全消去 → preset → End 確定. Trả về giá trị ô text sau khi chèn.
   *
   * `全消去` là bắt buộc: 部位選択 không unmount khi đóng nên lần mở sau vẫn giữ
   * nguyên lựa chọn cũ (bẫy 3).
   */
  const pickBui = async (presetLabel: string): Promise<string> => {
    const before = await textBox(page).inputValue()

    await cmtBtn(page, /部位/).click()
    await expect(toothDlg(page), 'F1 部位 không mở được 部位選択').toBeVisible({ timeout: 15000 })

    await toothDlg(page)
      .getByRole('button', { name: /全消去/ })
      .click()
    const preset = toothDlg(page).getByRole('button', { name: presetLabel, exact: false })
    await expect(
      preset.first(),
      `không thấy nút preset 「${presetLabel}」 trên thanh F-key của 部位選択 — ` +
        'đổi TEST_BUI_PRESET_1 / TEST_BUI_PRESET_2',
    ).toBeVisible({ timeout: 10000 })
    await preset.first().click()

    // End = 確定 (tooth-selection-dialog.tsx:590). Bấm nút, không bấm phím ESC.
    await toothDlg(page)
      .getByRole('button', { name: /確定/ })
      .click()
    await expect(toothDlg(page), '確定 không đóng được 部位選択').toHaveCount(0, { timeout: 10000 })

    // 省略表示 do BE trả (GET /tenant/bui/omit-disp) nên phải chờ ô text đổi.
    await expect(
      textBox(page),
      `preset 「${presetLabel}」 không chèn được gì vào ô text — nhiều khả năng ` +
        '歯牙情報 của bệnh nhân loại hết răng của preset này (dsp rỗng ⇒ app không chèn)',
    ).not.toHaveValue(before, { timeout: 15000 })
    await step()

    return textBox(page).inputValue()
  }

  /**
   * Ô text về đúng trạng thái kích hoạt: `"ABC\n"` với caret NGAY TRƯỚC `\n`.
   *
   * Trên WinForm làm tay là: gõ `ABC` → Enter (btnDummy_Click chèn xuống dòng) →
   * bấm ← đúng 1 lần. Ở đây đặt thẳng caret cho hết dao động.
   */
  const armTriggerState = async () => {
    await textBox(page).click()
    await textBox(page).fill(ARMED)
    await setCaret(page, BASE.length)
    expect(
      await readSel(page),
      'không đặt được caret ngay TRƯỚC dấu xuống dòng cuối — thiếu điều kiện ' +
        '`idx === text.length - 1 && text[idx] === "\\n"` thì nhánh lỗi không chạy',
    ).toEqual({ start: BASE.length, end: BASE.length })
  }

  /** Đo 省略表示 của 2 preset trong ô text RỖNG (không dính nhánh newline). */
  const ensurePresets = async () => {
    if (BUI_1 !== '' && BUI_2 !== '') return
    await openCmtList()

    await textBox(page).click()
    await textBox(page).fill('')
    BUI_1 = await pickBui(PRESET_1)

    await textBox(page).click()
    await textBox(page).fill('')
    BUI_2 = await pickBui(PRESET_2)

    await textBox(page).click()
    await textBox(page).fill('')

    console.log(`[#3b] 省略表示 preset1 「${PRESET_1}」 = ${vis(BUI_1)} (${BUI_1.length} ký tự)`)
    console.log(`[#3b] 省略表示 preset2 「${PRESET_2}」 = ${vis(BUI_2)} (${BUI_2.length} ký tự)`)

    expect(
      BUI_1.length,
      `省略表示 của 「${PRESET_1}」 phải dài ≥ 2 ký tự thì công thức caret của WinForm ` +
        '(lùi đúng 2) mới xác định được. Đổi TEST_BUI_PRESET_1 sang preset rộng hơn.',
    ).toBeGreaterThanOrEqual(2)
    expect(
      BUI_2,
      'hai preset ra cùng một 省略表示 ⇒ TC-4 mất khả năng phân biệt. Đổi TEST_BUI_PRESET_2.',
    ).not.toBe(BUI_1)
  }

  // ── setup ─────────────────────────────────────────────────────────────────

  test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    step = makeStep(page)
    // Cắm TRƯỚC khi điều hướng: confirm 算定 bung ngay lúc lưới nạp xong.
    await installSanteiNo()

    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
    await expect(
      ryoCells(page).first(),
      'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
    ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
    // AutoSantei chèn dòng → React remount → cướp focus. Chờ nó xong hẳn.
    await page
      .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 4000 })
      .catch(() => {})
    await page.waitForTimeout(800)
    await clearOverlays()
  })

  test.afterAll(async () => {
    await closeAll().catch(() => {})
    // Page dùng chung theo worker: handler không gỡ sẽ rò sang spec sau — và
    // spec sau có thể đang ĐO chính cái popup này (`_shared/session.ts`, bẫy 2).
    if (santeiLoc) await page.removeLocatorHandler(santeiLoc).catch(() => {})
    await releaseSharedPage(page)
  })

  // ── TC ────────────────────────────────────────────────────────────────────

  test('TC-1 dựng được trạng thái kích hoạt (caret ngay trước `\\n` cuối)', async () => {
    await openCmtList()
    await armTriggerState()
    await step()

    // Chốt luôn điều kiện của nhánh, để khi TC sau đỏ thì biết ngay là do hành vi
    // chèn chứ không phải do không dựng được trạng thái.
    const value = await textBox(page).inputValue()
    expect(value).toBe(ARMED)
    expect(value.length - 1, 'caret phải bằng `text.length - 1`').toBe(BASE.length)
    expect(value[BASE.length], 'ký tự tại caret phải là xuống dòng').toBe('\n')
  })

  test('TC-2 sau khi chèn 部位: TEXT giống nhau, CARET lệch 2 ký tự', async () => {
    await ensurePresets()
    await openCmtList()
    await armTriggerState()

    const after = await pickBui(PRESET_1)
    const sel = await readSel(page)

    // Cả hai phía cùng chèn SAU dấu xuống dòng ⇒ text y hệt nhau. Đây là lý do
    // chỉ nhìn ô text sau bước này thì KHÔNG phát hiện được lỗi.
    expect(after, 'text sau lần chèn đầu phải giống nhau ở cả hai phía').toBe(`${ARMED}${BUI_1}`)

    const caretWeb = ARMED.length + BUI_1.length
    const caretWinForm = caretWeb - 2
    console.log(
      `[#3b] TC-2 text=${vis(after)} · caret WEB=${caretWeb} · caret WinForm(kỳ vọng)=${caretWinForm}` +
        ` · caret ĐO ĐƯỢC=${sel.start}`,
    )

    expect(
      sel.start,
      `WEB đặt caret ở CUỐI chuỗi 部位 (${caretWeb}); WinForm đặt ở ${caretWinForm} ` +
        `— tức giữa cụm glyph ${vis(BUI_1)}, vì btnF1_Click quên cộng 2 ký tự CRLF ` +
        '(frm203012.cs:207-209).',
    ).toBe(EXPECT_MODE === 'web' ? caretWeb : caretWinForm)
    expect(sel.end, 'SelectionLength = 0 ⇒ không bôi đen').toBe(sel.start)
  })

  test('TC-3 Cách A — gõ 1 ký tự sau khi chèn 部位', async () => {
    await ensurePresets()
    await openCmtList()
    await armTriggerState()
    await pickBui(PRESET_1)

    // btnF1_Click kết thúc bằng txtValue.Focus() ⇒ ký tự gõ tiếp đi thẳng vào ô
    // text, tại đúng chỗ caret đang đứng. Không click, không bấm mũi tên.
    await page.keyboard.type('X')
    await step()

    const web = `${ARMED}${BUI_1}X`
    const winform = `${ARMED}${BUI_1.slice(0, -2)}X${BUI_1.slice(-2)}`
    console.log(`[#3b] TC-3 ${describeSplit(BUI_1)}`)
    console.log(`[#3b] TC-3 WEB     kỳ vọng=${vis(web)}`)
    console.log(`[#3b] TC-3 WinForm kỳ vọng=${vis(winform)}`)
    // Chốt rằng hai công thức RA HAI CHUỖI KHÁC NHAU — nếu không thì assert bên
    // dưới xanh ở cả hai phía và testcase mất hoàn toàn khả năng phân biệt.
    expect(winform, 'hai kỳ vọng trùng nhau ⇒ TC không phân biệt được').not.toBe(web)

    await expect(
      textBox(page),
      `WEB: X ở CUỐI ${vis(web)}. WinForm: X CHEN VÀO GIỮA chuỗi 部位 ${vis(winform)}.`,
    ).toHaveValue(EXPECT_MODE === 'web' ? web : winform)
  })

  test('TC-4 Cách B — bấm F1 部位 lần thứ hai', async () => {
    await ensurePresets()
    await openCmtList()
    await armTriggerState()
    await pickBui(PRESET_1)

    // Lần chèn thứ hai xuất phát từ caret mà lần đầu để lại ⇒ đây là chỗ khác
    // biệt caret biến thành khác biệt TEXT.
    await pickBui(PRESET_2)

    const web = `${ARMED}${BUI_1}${BUI_2}`
    // WinForm: caret nằm cách cuối chuỗi 1 đúng 2 ký tự, và tại đó `Substring(idx, 2)`
    // KHÔNG phải CRLF nữa ⇒ rơi vào nhánh `else`, chèn thẳng vào giữa chuỗi 1.
    const winform = `${ARMED}${BUI_1.slice(0, -2)}${BUI_2}${BUI_1.slice(-2)}`
    console.log(`[#3b] TC-4 ${describeSplit(BUI_1)}`)
    console.log(`[#3b] TC-4 WEB     kỳ vọng=${vis(web)}`)
    console.log(`[#3b] TC-4 WinForm kỳ vọng=${vis(winform)}`)
    expect(winform, 'hai kỳ vọng trùng nhau ⇒ TC không phân biệt được').not.toBe(web)

    await expect(
      textBox(page),
      `WEB nối đuôi: ${vis(web)}. WinForm chèn chuỗi 2 vào GIỮA chuỗi 1: ${vis(winform)} ` +
        `— 2 ký tự cuối ${vis(BUI_1.slice(-2))} của lần chèn đầu bị đẩy ra sau.`,
    ).toHaveValue(EXPECT_MODE === 'web' ? web : winform)
  })

  test('TC-5 đối chứng — chèn 部位 khi caret ở DÒNG TRỐNG thì hai phía giống nhau', async () => {
    await ensurePresets()
    await openCmtList()

    // Cùng ô text `"ABC\n"`, nhưng caret ở CUỐI (dòng trống) ⇒ nhánh `else`, nơi
    // công thức caret của WinForm là đúng. Đây là mốc để khẳng định TC-2..TC-4
    // đỏ/xanh là do NHÁNH, không phải do cách chèn nói chung.
    await textBox(page).click()
    await textBox(page).fill(ARMED)
    await setCaret(page, ARMED.length)

    await pickBui(PRESET_1)
    await page.keyboard.type('X')
    await step()

    await expect(
      textBox(page),
      'ở nhánh else cả web lẫn WinForm đều đặt caret ngay sau chuỗi 部位',
    ).toHaveValue(`${ARMED}${BUI_1}X`)

    await closeAll()
  })
})
