/**
 * カルテ記載選択 — F6 từ màn 診療入力 (WinForm frm203011 → frm203012 gType.Cult).
 *
 * Dialog vừa được port lại theo WinForm: bỏ hẳn lưới checkbox cũ, thay bằng
 * "lưới + ô テキスト" giống frm203012. Spec này chốt các hành vi MỚI đó.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - components/treatment-entry-detail.tsx:1685
 *      · F6 (layer OFF) → `guardCurrentMonth(() => setSummaryEntryType('karte'))`.
 *        ⇒ dòng đang focus phải thuộc THÁNG HIỆN TẠI, nếu không F6 bị chặn.
 *        TRT_DT mặc định = hôm nay nên mặc định là chạy được.
 *  - components/summary-column-entry-dialog.tsx (nhánh type === 'karte' = frm203011)
 *      · Lưới 28 nút group, nhãn = `{cmtGrp} {grpNm}` → "1 再来理由".
 *      · Footer: F1 基本検査 / F2 精密検査 / F3 PCR / F6 コメント / F10 戻る.
 *      · F6 コメント → `openAllComments()`: gọi GET /tenant/mst-cmt2/comments —
 *        BE đọc thẳng toàn bộ master KHÔNG join group (grpNo=0 của WinForm), nên
 *        comment có cmt_grp=0 / trỏ group đã xoá mềm vẫn hiện. caption 「カルテ記載」.
 *      · Click group → mở KarteCommentSelectDialog, caption = nhãn nút group.
 *      · confirmKarte đóng CẢ HAI dialog; onClose của con chỉ đóng con.
 *  - components/karte-comment-select-dialog.tsx (= frm203012 Cult)
 *      · Tab 「カルテコメント一覧」, 4 cột id: dispNo / cmtCd / cmtSb / cmtNm.
 *      · 選択番号 = `rankByCode` = ROW_NUMBER() OVER(ORDER BY cmt_cd, cmt_sb) —
 *        KHÔNG phải vị trí dòng (list sort theo use_cnt desc).
 *      · Enter trên LƯỚI / double-click = chèn cmtNm + '\n' vào ô text (defData);
 *        click đơn CHỈ highlight.
 *      · Enter trong Ô TEXT = btnDummy_Click (frm203012.cs:353): còn `*` → nhảy
 *        về cụm ĐẦU TIÊN (quét từ index 0), hết `*` → chèn xuống dòng tại caret.
 *        KHÔNG bao giờ 確定 — nhánh Enter của txtValue_KeyDown là code chết vì
 *        txtValue có AcceptsReturn = false + AcceptButton = btnDummy.
 *      · Sau mỗi lần chèn, cụm `*` đầu tiên của CẢ ô text được bôi đen (getAsta).
 *      · Ô text = primitive Textarea → là `textbox` DUY NHẤT trong dialog.
 *      · F9 確定 / End / ESC → confirm; F10 戻る → chỉ đóng con.
 *      · 確定 gọi POST /tenant/mst-cmt2/use-count khi có ≥1 dòng ⇒ GHI DB.
 *  - lib/treatment-entry-shared.ts
 *      · karteLineToPick: trtNm = REGIRYO_PADLEFT ('  ', 2 space) + text, 点0 / 回1.
 *  - components/tooth-selection-dialog.tsx:576-590 (部位選択, frm902003 PatMsg)
 *      · F9 Br例 / **F10 反転** / F11 全消去 / **F12 戻る** / End = 確定.
 *        ⇒ đóng nó phải bằng F12; F10 chỉ đảo vùng chọn, ESC thì 確定 luôn.
 *  - shared/components/virtual-list-table: testid `header-<id>` / `cell-<id>` /
 *    `row-<rowKey>`; header sortable có `role="button"`.
 *
 * ─── CẤU TRÚC (Rule 19) ──────────────────────────────────────────────────────
 * `serial` + MỘT page dựng ở `beforeAll` (login 1 lần — Rule 10.1). Mỗi TC tự gọi
 * `openGroupList()` nên chạy lẻ một TC vẫn được, nhưng thứ tự vẫn có ý nghĩa:
 * TC nào đỏ thì các TC sau bị SKIP (đặc tính của `serial`). Page tự tạo nên
 * KHÔNG có trace/video tự động của fixture.
 *
 * ─── BẪY ĐÃ LƯỜNG TRƯỚC ──────────────────────────────────────────────────────
 *  1. Dialog cha và dialog con có TITLE GIỐNG HỆT NHAU (「カ ル テ 記 載 選 択」,
 *     đúng WinForm — cả hai form đều tên đó). ⇒ TUYỆT ĐỐI không phân biệt bằng
 *     title (Rule 13.1). Cha nhận diện bằng nút PCR, con bằng tab
 *     「カルテコメント一覧」 + caption group.
 *  2. `CmtAutoPickerDialog` (frm203012 gType.Auto) CŨNG có tab
 *     「カルテコメント一覧」, cùng tên カルテ記載選択, cùng footer F1/F9/F10 và cùng
 *     4 cột — KHÔNG phân biệt được bằng cấu trúc. ⇒ mọi assert con đều kèm
 *     caption group.
 *     Bấm **No** ở confirm 「〜を算定しますか？」 KHÔNG thoát được nó: đo thực tế
 *     (BN 11, hôm nay) là No cho 「歯科初診料」 xong thì 処置 kế 「歯科疾患管理料」
 *     tự 算定 KHÔNG hỏi (POST /tenant/treatment/autosantei2) rồi bung picker đó
 *     ra sau ~1s. `installSanteiNo` vì vậy chỉ giải quyết được nửa việc; nửa còn
 *     lại là `clearOverlays` phải chờ hết nhịp cuối của chuỗi (xem chú thích ở đó).
 *  3. Lưới ẢO HOÁ: `[data-testid^="row-"]` chỉ có các dòng ĐANG trong khung nhìn.
 *     ⇒ không so sánh nguyên mảng trước/sau sort; chỉ assert quan hệ bất biến
 *     trên phần nhìn thấy (xem TC-3 / TC-4).
 *  4. 確定 GHI DB (use_cnt) ⇒ nằm sau cờ `TEST_ALLOW_DB_WRITE=1` (Rule 18.1).
 *     Mặc định spec chỉ chạy tới các hành vi KHÔNG ghi. Riêng "ESC = 確定" vẫn
 *     chạy mặc định vì test với ô text RỖNG → `lines.length === 0` → app KHÔNG
 *     gọi API (karte-comment-select-dialog.tsx handleConfirm), vẫn chứng minh
 *     được ESC là confirm chứ không phải huỷ.
 *
 * ─── ENV ─────────────────────────────────────────────────────────────────────
 *   TEST_PAT_NO (11) · TEST_TRT_DT (hôm nay) · TEST_KARTE_GRP (1 — số thứ tự nút
 *   group sẽ mở; đổi nếu group 1 của tenant không có ≥2 dòng) ·
 *   TEST_ALLOW_DB_WRITE (1 = bật nhóm TC 確定).
 *   CHƯA CHẮC: nhãn nút group phụ thuộc master của tenant — spec KHÔNG hardcode
 *   「1 再来理由」, nó đọc nhãn thật của nút rồi đối chiếu với caption.
 */
import { expect, test, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
/** Nút group thứ mấy (1-based) sẽ được mở ở các TC. */
const GRP_INDEX = Number(process.env.TEST_KARTE_GRP ?? '1')
/** Rule 18.1 — 確定 bump use_cnt của mst_cmt2, mặc định KHÔNG chạy. */
const ALLOW_DB_WRITE = process.env.TEST_ALLOW_DB_WRITE === '1'

/** REGIRYO_PADLEFT — CommonInp.cs:35, 2 dấu cách đầu cột 療法・処置. */
const REGIRYO_PADLEFT = '  '
/** Cột grid 診療入力 — RegiCol: 療法・処置=2, 点=3, 回=4. */
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const tenCell = (page: Page) => page.locator('[data-grid-cell$="|3"]')

/**
 * CSS selector, KHÔNG `getByRole('dialog')`: Radix AlertDialog gọi `hideOthers`
 * khi mount → gắn `aria-hidden` lên portal của dialog khác, làm locator theo role
 * "tắt" dù dialog vẫn hiện (bẫy đã ghi ở summary-comment-selection-enter.spec.ts).
 */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
const realAlert = (page: Page) => page.locator('[role="alertdialog"]')

/** frm203011 — lưới nút group. Nhận diện bằng nút PCR (không dialog nào khác có). */
const groupGrid = (page: Page) =>
  anyDialog(page).filter({ has: page.getByRole('button', { name: /PCR/ }) })

/** frm203012 Cult — lưới comment + ô text. */
const cmtList = (page: Page) => anyDialog(page).filter({ hasText: 'カルテコメント一覧' })

const cells = (page: Page, colId: string) =>
  cmtList(page).locator(`[data-testid="cell-${colId}"]`)
const rows = (page: Page) => cmtList(page).locator('[data-testid^="row-"]')
const header = (page: Page, colId: string) =>
  cmtList(page).locator(`[data-testid="header-${colId}"]`)
/** Ô テキスト (txtValue) — textbox DUY NHẤT trong dialog con. */
const textBox = (page: Page) => cmtList(page).getByRole('textbox')
/** Nút trong dialog con — bó vào dialog vì màn nền cũng có 戻る (Rule 10.3). */
const cmtBtn = (page: Page, name: RegExp) => cmtList(page).getByRole('button', { name })

/** Đặt caret trong ô テキスト (không có API Playwright nào cho selection). */
const setCaret = (page: Page, pos: number) =>
  textBox(page).evaluate((el, p) => (el as HTMLTextAreaElement).setSelectionRange(p, p), pos)

/** Vùng đang bôi đen trong ô テキスト. */
const readSel = (page: Page) =>
  textBox(page).evaluate((el) => {
    const ta = el as HTMLTextAreaElement
    return { start: ta.selectionStart, end: ta.selectionEnd }
  })

const SANTEI_CONFIRM = /を算定しますか？/

/**
 * Trả lời **No** cho 「〜を算定しますか？」 (Rule 14 + 14.1).
 *
 * Bấm Yes sẽ chạy AutoSantei rồi mở `CmtAutoPickerDialog` — dialog CÙNG TÊN
 * カルテ記載選択 và cùng tab 「カルテコメント一覧」 với dialog đang test ⇒ mọi
 * assert phía sau đo nhầm dialog. Đây là lý do BẮT BUỘC chọn No, không phải chỉ
 * để dọn màn hình.
 */
const installSanteiNo = async (page: Page) => {
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
}

/** Bấm OK/Yes tới khi hết alert お茶コン. */
const drainAlerts = async (page: Page) => {
  for (let i = 0; i < 10; i++) {
    if ((await realAlert(page).count()) === 0) return
    const btn = realAlert(page).locator('button', { hasText: /^(OK|Yes)$/ })
    if ((await btn.count()) === 0) return
    await btn.first().click()
    await page.waitForTimeout(400)
  }
}

/**
 * Dọn mọi overlay để màn 診療入力 nhận được F6.
 *
 * Alert trước, dialog sau (thứ tự này đã từng làm spec khác fail oan). Confirm
 * 算定 KHÔNG bấm ở đây — `installSanteiNo` độc quyền, bấm chồng sẽ tranh chấp và
 * timeout 15s.
 */
const clearOverlays = async (page: Page) => {
  for (let i = 0; i < 12; i++) {
    await drainAlerts(page)
    const santei = anyDialog(page).filter({ hasText: SANTEI_CONFIRM })
    if (await santei.count()) {
      // `installSanteiNo` mới là chỗ bấm No. Nó là locator handler nên chỉ chạy
      // khi Playwright thực hiện action/assert auto-retry — vòng `waitForTimeout`
      // trần KHÔNG kích hoạt nó, confirm nằm lì tới tận testcase sau. Assert
      // auto-retry dưới đây chính là cú hích đó.
      await expect(santei).toHaveCount(0, { timeout: 10000 }).catch(() => {})
      continue
    }
    if ((await anyDialog(page).count()) === 0) {
      // Chuỗi AutoSantei CÒN nhịp sau: trả lời No cho 「歯科初診料を算定しますか？」
      // xong thì 処置 kế (歯科疾患管理料) tự 算定 KHÔNG hỏi và bung
      // CmtAutoPickerDialog — cùng tên カルテ記載選択, cùng tab 「カルテコメント一覧」.
      // Nó tới trễ ~1s, nên "0 dialog" ngay lúc này chưa có nghĩa là màn đã sạch:
      // để mặc thì nó nổi ĐÈ lên lưới group ở testcase sau và nuốt mọi click.
      await page.waitForTimeout(1500)
      if ((await anyDialog(page).count()) === 0) return
      continue
    }
    await page.keyboard.press('F10')
    await page.waitForTimeout(600)
  }
}

/** Chờ lưới 診療入力 đứng yên (AutoSantei chèn dòng → React remount, cướp focus). */
const waitGridSettled = async (page: Page) => {
  await page
    .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 4000 })
    .catch(() => {})
  await page.waitForTimeout(800)
}

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('カルテ記載選択 — F6 (frm203011 → frm203012 Cult)', () => {
  let page: Page
  let step: () => Promise<void>
  /** Nhãn thật của nút group đang mở — đối chiếu với caption của dialog con. */
  let grpLabel = ''

  /** F6 từ màn 診療入力 → lưới nút group (frm203011). */
  const openGroupGrid = async () => {
    await clearOverlays(page)
    await expect(anyDialog(page), 'còn overlay đè lên màn 診療入力').toHaveCount(0, {
      timeout: 15000,
    })
    await page.keyboard.press('F6')
    await expect(
      groupGrid(page),
      'F6 không mở được カルテ記載選択 — kiểm dòng focus có thuộc tháng hiện tại không ' +
        '(guardCurrentMonth, treatment-entry-detail.tsx:1685)',
    ).toBeVisible({ timeout: 20000 })
    await step()
  }

  /** Mở lưới comment của group thứ `GRP_INDEX` (frm203012 Cult). */
  const openGroupList = async () => {
    // `grpLabel` rỗng = lưới comment đang mở KHÔNG phải cái do ta bấm ra, mà là
    // CmtAutoPickerDialog của AutoSantei (xem clearOverlays). Trả về sớm ở đó thì
    // TC-2 đi so caption với chuỗi rỗng → strict-mode violation, đỏ oan.
    if (grpLabel !== '' && (await cmtList(page).count()) > 0) return
    if ((await groupGrid(page).count()) === 0) await openGroupGrid()

    // Nút group nhận diện bằng NHÃN: `{cmtGrp} {grpNm}` → bắt đầu bằng chữ số
    // ("1 再来理由"). Không lọc bằng `filter({ hasNot })` với locator dựng từ
    // `page.*`: locator trong has/hasNot phải TƯƠNG ĐỐI (Rule 12.2) — bản đầu
    // làm vậy nên bộ lọc vô hiệu và `.nth(0)` rơi vào nút X của header, click
    // xong ĐÓNG luôn dialog (a11y snapshot lúc fail: không còn dialog nào).
    const groupBtns = groupGrid(page).getByRole('button', { name: /^\d+\s*\S/ })
    await expect(
      groupBtns.first(),
      'lưới group không có nút nào dạng "<số> <tên>" — master mst_cmt2_grp rỗng?',
    ).toBeVisible({ timeout: 15000 })
    const btn = groupBtns.nth(GRP_INDEX - 1)
    await expect(btn, `không thấy nút group thứ ${GRP_INDEX}`).toBeVisible({ timeout: 15000 })
    grpLabel = (await btn.innerText()).trim().replace(/\s+/g, ' ')
    await btn.click()

    await expect(cmtList(page), 'click nút group không mở được lưới comment').toBeVisible({
      timeout: 15000,
    })
    await step()
  }

  /** Đóng lưới comment bằng F10 戻る (KHÔNG dùng ESC — ESC là 確定, Rule 10.4). */
  const closeCmtList = async () => {
    if ((await cmtList(page).count()) === 0) return
    await cmtBtn(page, /戻る/).click()
    await expect(cmtList(page)).toHaveCount(0, { timeout: 10000 })
  }

  /** Đóng hết về màn 診療入力. */
  const closeAll = async () => {
    await closeCmtList()
    if ((await groupGrid(page).count()) > 0) {
      await groupGrid(page).getByRole('button', { name: /戻る/ }).click()
      await expect(groupGrid(page)).toHaveCount(0, { timeout: 10000 })
    }
  }

  test.beforeAll(async ({ browser }) => {
    // browser.newPage() KHÔNG kế thừa `use` của config → truyền tay.
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    await installSanteiNo(page)

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(
      page,
      'login không vào được — nhiều lần chạy liên tiếp thì đang dính rate-limit, ' +
        'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
    ).toHaveURL(/\/$/)

    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
    await expect(tenCell(page).last()).toBeVisible({ timeout: 60000 })
    await waitGridSettled(page)
    await clearOverlays(page)
    await step()
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ── frm203011 — lưới nút group ────────────────────────────────────────────
  test('TC-1 F6 mở lưới group với đủ 5 nút footer', async () => {
    await openGroupGrid()

    for (const label of ['基本検査', '精密検査', 'PCR', 'コメント', '戻る']) {
      await expect(
        groupGrid(page).getByRole('button', { name: new RegExp(label) }).first(),
        `thiếu nút footer ${label}`,
      ).toBeVisible()
    }
    // Nút group = nhãn "<số> <tên>" (28 group theo master chuẩn).
    const groupBtns = groupGrid(page).getByRole('button', { name: /^\d+\s*\S/ })
    await expect(groupBtns.first()).toBeVisible({ timeout: 15000 })
    expect(
      await groupBtns.count(),
      'lưới group không có nút group nào (master mst_cmt2_grp rỗng?)',
    ).toBeGreaterThan(0)
    await step()
  })

  test('TC-2 click group mở lưới comment, caption = nhãn nút, ô text rỗng', async () => {
    await openGroupList()

    await expect(
      cmtList(page).getByText(grpLabel, { exact: true }),
      `caption của lưới comment không khớp nhãn nút group "${grpLabel}"`,
    ).toBeVisible({ timeout: 10000 })

    for (const label of ['選択番号', 'コード', '枝番', 'カルテコメント']) {
      await expect(
        cmtList(page).getByText(label, { exact: true }).first(),
        `thiếu cột ${label}`,
      ).toBeVisible()
    }
    // Ô テキスト tồn tại và bắt đầu RỖNG (initProc dựng dialog mới mỗi lần mở).
    await expect(textBox(page), 'không thấy ô テキスト (txtValue)').toBeVisible()
    await expect(textBox(page)).toHaveValue('')
    // Footer con: F1 部位 / F9 確定 / F10 戻る.
    for (const label of ['部位', '確定', '戻る']) {
      await expect(cmtBtn(page, new RegExp(label)), `thiếu nút ${label}`).toBeVisible()
    }
    await step()
  })

  // ── 選択番号 = rank theo (cmt_cd, cmt_sb) ──────────────────────────────────
  test('TC-3 選択番号 là thứ hạng theo (コード, 枝番), không phải vị trí dòng', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    // ⚠ Lưới ảo hoá → chỉ đọc được dòng trong khung nhìn. Vì vậy KHÔNG assert
    // "選択番号 == rank tính trên các dòng đọc được" (rank tính trên CẢ list).
    // Thay vào đó assert quan hệ BẤT BIẾN, đúng với mọi tập con: sắp các dòng
    // nhìn thấy theo (コード, 枝番) thì 選択番号 phải tăng dần.
    const dispNos = (await cells(page, 'dispNo').allTextContents()).map((s) => Number(s.trim()))
    const cds = (await cells(page, 'cmtCd').allTextContents()).map((s) => Number(s.trim()))
    const sbs = (await cells(page, 'cmtSb').allTextContents()).map((s) => Number(s.trim()))
    expect(dispNos.length, 'group đang mở không có dòng nào').toBeGreaterThan(0)

    // Gộp 3 cột thành 1 mảng bản ghi rồi mới sắp — tránh index chéo giữa 3 mảng
    // (tsconfig bật noUncheckedIndexedAccess nên `cds[a]` là number | undefined).
    const seen = dispNos.map((dispNo, i) => ({ dispNo, cd: cds[i] ?? 0, sb: sbs[i] ?? 0 }))
    const ranked = [...seen].sort((a, b) => a.cd - b.cd || a.sb - b.sb).map((r) => r.dispNo)
    expect(
      ranked,
      '選択番号 không tăng theo (コード, 枝番) — đang hiển thị vị trí dòng thay vì ' +
        'ROW_NUMBER() OVER(ORDER BY cmt_cd, cmt_sb)',
    ).toEqual([...ranked].sort((a, b) => a - b))

    // Kiểm tra ngược: nếu list ĐANG không sort theo mã (đúng bản chất use_cnt
    // desc) thì 選択番号 phải KHÁC 1,2,3,… — đây mới là điều bản checkbox cũ sai.
    const displayedIsCodeOrder = ranked.every((v, i) => v === dispNos[i])
    if (displayedIsCodeOrder) {
      console.log(
        'TC-3: group này tình cờ đang hiển thị đúng thứ tự mã → không phân biệt được ' +
          'rank với vị trí dòng. Đổi TEST_KARTE_GRP để kiểm chặt hơn.',
      )
    } else {
      expect(
        dispNos,
        '選択番号 đang là 1,2,3… theo vị trí dòng (hành vi cũ), không phải rank theo mã',
      ).not.toEqual(dispNos.map((_, i) => i + 1))
    }
    await step()
  })

  test('TC-4 sort 選択番号 theo rule 6b: lần 1 giữ nguyên, lần 2 đảo', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const firstName = async () => (await cells(page, 'cmtNm').first().innerText()).trim()
    const before = await firstName()
    const nRows = await rows(page).count()

    // Lần 1 = Asc — CỐ Ý no-op (sort theo index BE sẽ xáo đúng những dòng vừa bấm).
    await header(page, 'dispNo').click()
    await step()
    expect(await firstName(), 'click 選択番号 lần 1 (asc) phải là no-op').toBe(before)

    // Lần 2 = Desc — đảo thứ tự BE. Lưới ảo hoá nên KHÔNG so nguyên mảng; chỉ cần
    // dòng đầu đổi là đủ chứng minh đã đảo.
    await header(page, 'dispNo').click()
    await step()
    if (nRows < 2) {
      console.log(`TC-4: group chỉ có ${nRows} dòng nhìn thấy → BỎ QUA phần assert desc`)
      return
    }
    expect(await firstName(), 'click 選択番号 lần 2 (desc) phải đảo thứ tự').not.toBe(before)

    // Trả lưới về trạng thái ban đầu cho các TC sau.
    await closeCmtList()
  })

  // ── defData — chèn comment vào ô テキスト ──────────────────────────────────
  test('TC-5 click đơn chỉ highlight, double-click mới chèn vào ô テキスト', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const target = cells(page, 'cmtNm').first()
    const name = (await target.innerText()).trim()

    await target.click()
    await step()
    await expect(textBox(page), 'click đơn KHÔNG được chèn (WinForm dgvView chỉ di con trỏ)').toHaveValue('')

    await target.dblclick()
    await step()
    await expect(
      textBox(page),
      'double-click phải chèn cmtNm + xuống dòng (defData)',
    ).toHaveValue(`${name}\n`)

    await closeCmtList()
  })

  test('TC-6 Enter trên lưới chèn dòng đang chọn rồi nhảy dòng kế', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const names = (await cells(page, 'cmtNm').allTextContents()).map((s) => s.trim())
    if (names.length < 2) {
      console.log(`TC-6: chỉ thấy ${names.length} dòng → BỎ QUA (cần ≥2 để kiểm con trỏ nhảy)`)
      await closeCmtList()
      return
    }

    // Focus phải nằm ở LƯỚI (app tự focus gridRef khi mở). Không click vào row để
    // lấy focus: click đổi dòng đang chọn → đo nhầm.
    await page.keyboard.press('Enter')
    await step()
    await expect(textBox(page), 'Enter trên lưới phải chèn dòng đầu').toHaveValue(`${names[0]}\n`)

    await page.keyboard.press('Enter')
    await step()
    await expect(
      textBox(page),
      'Enter lần 2 phải chèn dòng KẾ TIẾP (con trỏ tự tiến)',
    ).toHaveValue(`${names[0]}\n${names[1]}\n`)

    await closeCmtList()
  })

  test('TC-6b click dòng rồi Enter: vẫn phải tự nhảy dòng kế', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const names = (await cells(page, 'cmtNm').allTextContents()).map((s) => s.trim())
    if (names.length < 2) {
      console.log(`TC-6b: chỉ thấy ${names.length} dòng → BỎ QUA (cần ≥2 để kiểm con trỏ nhảy)`)
      await closeCmtList()
      return
    }

    // TC-6 cố tình KHÔNG click (focus nằm ở khung lưới, do app tự focus khi mở),
    // nên nó chỉ đo được nhánh listener Enter mức window của dialog. Click vào
    // dòng lại đẩy DOM focus vào chính `div` của row (VirtualListTable cho row
    // tabIndex), từ đó Enter do onKeyDown của row xử lý và nó preventDefault →
    // listener window bị `isWindowKeyBlocked` chặn. Đây chính là nhánh từng bị
    // sót: comment vẫn được chèn nhưng con trỏ đứng yên nên Enter lần 2 lặp lại
    // đúng dòng cũ. WinForm dgvView_KeyDown không set e.Handled nên DataGridView
    // vẫn tự hạ con trỏ 1 dòng ⇒ hai nhánh phải cho cùng kết quả.
    await cells(page, 'cmtNm').first().click()
    await expect(textBox(page), 'click đơn KHÔNG được chèn').toHaveValue('')

    await page.keyboard.press('Enter')
    await step()
    await expect(textBox(page), 'Enter sau khi click phải chèn dòng đang chọn').toHaveValue(
      `${names[0]}\n`,
    )

    await page.keyboard.press('Enter')
    await step()
    await expect(
      textBox(page),
      'Enter lần 2 phải chèn dòng KẾ TIẾP — nếu ra 2 dòng giống nhau tức là con trỏ không tiến',
    ).toHaveValue(`${names[0]}\n${names[1]}\n`)

    await closeCmtList()
  })

  test('TC-7 chèn comment có `*` thì cụm `*` được bôi đen sẵn (getAsta)', async () => {
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const names = (await cells(page, 'cmtNm').allTextContents()).map((s) => s.trim())
    const idx = names.findIndex((n) => n.includes('*'))
    if (idx < 0) {
      console.log(
        `TC-7: group "${grpLabel}" không có comment nào chứa "*" → BỎ QUA. ` +
          'Đổi TEST_KARTE_GRP sang group có mẫu điền tay (vd 開口障害(*横指)).',
      )
      await closeCmtList()
      return
    }

    await cells(page, 'cmtNm').nth(idx).dblclick()
    await step()

    const name = names[idx] ?? ''
    const start = name.indexOf('*')
    const len = (name.slice(start).match(/^\*+/)?.[0] ?? '').length
    expect(await readSel(page), `cụm "*" trong "${name}" phải được select sẵn để gõ đè`).toEqual({
      start,
      end: start + len,
    })

    await closeCmtList()
  })

  // ── F6 コメント — danh sách phẳng toàn bộ master (grpNo = 0) ────────────────
  test('TC-8 F6 コメント mở danh sách phẳng với caption 「カルテ記載」', async () => {
    await closeCmtList()
    if ((await groupGrid(page).count()) === 0) await openGroupGrid()

    await groupGrid(page).getByRole('button', { name: /コメント/ }).click()
    await expect(
      cmtList(page),
      'nút F6 コメント không mở được lưới comment (trước đây là nút chết)',
    ).toBeVisible({ timeout: 15000 })
    await expect(
      cmtList(page).getByText('カルテ記載', { exact: true }),
      'caption phải là 「カルテ記載」 (grpNo = 0), không phải tên group',
    ).toBeVisible({ timeout: 10000 })
    await expect(rows(page).first(), 'danh sách phẳng không có dòng nào').toBeVisible({
      timeout: 20000,
    })
    await step()

    await closeCmtList()
  })

  // ── 戻る vs 確定 ──────────────────────────────────────────────────────────
  test('TC-9 F10 戻る chỉ đóng lưới comment, lưới group vẫn mở', async () => {
    await openGroupList()

    await cmtBtn(page, /戻る/).click()
    await expect(cmtList(page), 'F10 戻る phải đóng lưới comment').toHaveCount(0, { timeout: 10000 })
    await expect(
      groupGrid(page),
      '戻る của lưới comment KHÔNG được đóng luôn lưới group (frm203012 → frm203011)',
    ).toBeVisible()
    await step()
  })

  test('TC-10 ESC là 確定 (đóng cả hai dialog), không phải huỷ', async () => {
    await openGroupList()

    // Ô text để RỖNG: handleConfirm vẫn chạy nhưng lines = [] nên app KHÔNG gọi
    // /use-count ⇒ không ghi DB, mà vẫn phân biệt được 確定 với 戻る: chỉ 確定 mới
    // đóng LUÔN lưới group (confirmKarte → onOpenChange(false)).
    await expect(textBox(page)).toHaveValue('')
    await page.keyboard.press('Escape')
    await step()

    await expect(cmtList(page), 'ESC không đóng lưới comment').toHaveCount(0, { timeout: 10000 })
    await expect(
      groupGrid(page),
      'ESC chỉ đóng lưới comment ⇒ đang là HUỶ. Đúng WinForm thì ESC = btnF9_Click ' +
        '(確定) nên lưới group phải đóng theo (formBase_KeyDown, frm203012.cs:167-172)',
    ).toHaveCount(0, { timeout: 10000 })
  })

  // ── 確定 thật — GHI DB (use_cnt), Rule 18.1 ───────────────────────────────
  test('TC-11 F9 確定 đẩy dòng vào lưới 診療入力 với 2 space + 点0/回1', async () => {
    if (!ALLOW_DB_WRITE) {
      console.log('TC-11: BỎ QUA — 確定 bump use_cnt (ghi DB). Bật bằng TEST_ALLOW_DB_WRITE=1.')
      test.skip(true, 'cần TEST_ALLOW_DB_WRITE=1')
      return
    }
    await openGroupList()
    await expect(rows(page).first()).toBeVisible({ timeout: 20000 })

    const name = (await cells(page, 'cmtNm').first().innerText()).trim()
    await cells(page, 'cmtNm').first().dblclick()
    await step()
    await cmtBtn(page, /確定/).click()

    // 確定 đóng CẢ HAI dialog rồi chèn dòng vào lưới nền.
    await expect(cmtList(page)).toHaveCount(0, { timeout: 10000 })
    await expect(groupGrid(page)).toHaveCount(0, { timeout: 10000 })
    await step()

    // `*` chưa điền được thay bằng space khi 確定 (btnF9_Click).
    const expected = REGIRYO_PADLEFT + name.replaceAll('*', ' ')
    await expect(
      ryoCell(page).filter({ hasText: name.replaceAll('*', ' ').slice(0, 6) }).first(),
      'không thấy dòng カルテコメント vừa 確定 trong lưới 診療入力',
    ).toBeVisible({ timeout: 15000 })
    const texts = await ryoCell(page).allTextContents()
    expect(
      texts.some((t) => t === expected),
      `dòng phải bắt đầu bằng 2 space (REGIRYO_PADLEFT). Đang có: ${JSON.stringify(
        texts.filter((t) => t.includes(name.slice(0, 4))),
      )}`,
    ).toBe(true)

    // KHÔNG F9 登録 → trn_trn vẫn sạch; chỉ use_cnt của mst_cmt2 bị +1.
  })

  test('TC-12 dòng gõ tay được 確定 dưới mã 手入力 7999', async () => {
    if (!ALLOW_DB_WRITE) {
      console.log('TC-12: BỎ QUA — 確定 gọi /use-count (ghi DB). Bật bằng TEST_ALLOW_DB_WRITE=1.')
      test.skip(true, 'cần TEST_ALLOW_DB_WRITE=1')
      return
    }
    await openGroupList()

    const typed = `テスト手入力${Date.now() % 100000}`
    await textBox(page).click()
    await textBox(page).fill(typed)
    await step()

    // 確定 phải bấm F9 — Enter trong ô text CHỈ xuống dòng (xem TC-14).
    await cmtBtn(page, /確定/).click()
    await expect(cmtList(page)).toHaveCount(0, { timeout: 10000 })
    await step()

    await expect(
      ryoCell(page).filter({ hasText: typed }).first(),
      'dòng gõ tay không vào được lưới 診療入力',
    ).toBeVisible({ timeout: 15000 })
  })

  // ── F1 部位 ───────────────────────────────────────────────────────────────
  test('TC-13 F1 部位 mở 部位選択 chồng lên lưới comment', async () => {
    await closeAll()
    await openGroupList()

    const before = await anyDialog(page).count()
    await cmtBtn(page, /部位/).click()
    await expect(
      anyDialog(page),
      'F1 部位 không mở được 部位選択 (frm902003 PatMsg)',
    ).toHaveCount(before + 1, { timeout: 15000 })
    await step()

    // Đóng 部位選択 bằng **F12** — ở màn này F10 là 反転 (đảo chọn cả hàm), F12 mới
    // là 戻る (tooth-selection-dialog.tsx:587/589). Và KHÔNG dùng ESC: ESC map vào
    // End = 確定 (:590) nên sẽ chèn 部位 vào ô text thật.
    await page.keyboard.press('F12')
    await expect(anyDialog(page)).toHaveCount(before, { timeout: 10000 })
    await closeAll()
  })

  // ── Enter trong ô テキスト = btnDummy_Click, KHÔNG phải 確定 ────────────────
  test('TC-14 Enter trong ô text chèn xuống dòng, không 確定', async () => {
    await openGroupList()

    // txtValue là Multiline nhưng AcceptsReturn = false (mặc định) và
    // AcceptButton = btnDummy (frm203012.cs:399) ⇒ Enter chạy btnDummy_Click.
    // Nhánh Enter của txtValue_KeyDown (gọi fixProc) là CODE CHẾT, không port.
    await textBox(page).click()
    await textBox(page).fill('ああ')
    await setCaret(page, 1)
    await page.keyboard.press('Enter')
    await step()

    await expect(
      textBox(page),
      'Enter trong ô text phải chèn xuống dòng tại caret, KHÔNG được 確定',
    ).toHaveValue('あ\nあ')
    await expect(cmtList(page), 'Enter trong ô text không được đóng dialog').toBeVisible()

    await closeCmtList()
  })

  test('TC-15 Enter nhảy về cụm `*` ĐẦU TIÊN, quét từ đầu chuỗi (getAsta)', async () => {
    await openGroupList()

    // WinForm getAsta(txtValue.Text, 0) — quét từ index 0 chứ không từ caret,
    // nên nó quay lại ô `*` mà người dùng đã bỏ qua. Đặt caret SAU cụm đầu để
    // phân biệt hai cách quét.
    await textBox(page).click()
    await textBox(page).fill('発赤(*)腫脹(**)')
    await textBox(page).evaluate((el) => {
      const ta = el as HTMLTextAreaElement
      ta.setSelectionRange(8, 8)
    })
    await page.keyboard.press('Enter')
    await step()

    const sel = await textBox(page).evaluate((el) => {
      const ta = el as HTMLTextAreaElement
      return { start: ta.selectionStart, end: ta.selectionEnd }
    })
    expect(sel, 'phải bôi đen cụm `*` đầu tiên (index 3), không phải cụm sau caret').toEqual({
      start: 3,
      end: 4,
    })

    await closeCmtList()
  })

})
