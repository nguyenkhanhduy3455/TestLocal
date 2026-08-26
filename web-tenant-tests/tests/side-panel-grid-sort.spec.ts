import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * SidePanel — 見出しクリックの並べ替え trên 4 tab của 診療入力 `/treatments/{patNo}`
 * (病検 / ガイド / パック / 個別, frm203002 《VB6》frmInpMain 07「タブ系」).
 *
 * Xuất phát từ báo lỗi của khách: bấm tên cột trên dòng tiêu đề của 4 tab thì
 * PHẢI sắp xếp lưới đó theo cột vừa bấm, nhưng bản WinForm lại rơi vào trạng
 * thái CHỌN dòng hiện tại.
 *
 * ─── Nguồn WinForm (src/OCHACOM/INP) ────────────────────────────────────────
 *  - frm203002.Designer.cs:1158-1206 — CHỈ lưới đăng ký (RegiDay/RegiBui/RegiRyo/
 *    RegiTen/RegiKai) mới `SortMode = NotSortable`. 4 lưới tab để nguyên mặc
 *    định của DataGridView (`Automatic`) ⇒ bấm tiêu đề LÀ sắp xếp — đó là spec.
 *  - frm203002.Designer.cs:1400/1610/1729/1970 — cả 4 lưới nối event `Click`
 *    (bắn cả khi bấm HEADER, không hit-test) thẳng vào handler chọn dòng
 *    (`grdByou_DoubleClick` :6218, `hfgGuid1_Click` :6571, `grdPack_Click` :6828,
 *    `hfgKobetu_Click` :6928) ⇒ đúng lỗi khách mô tả. Web KHÔNG được lặp lại.
 *  - frm203002.cs:1983 `GuidNum = intRow + 1`, :2031 `PackNum = intRow + 1`,
 *    modByoken.cs:270/525 `hfgByoken[0, intR].Value = intR` — cột № là **DỮ
 *    LIỆU** ghi vào dòng lúc nạp, cột được bind vào nó (Designer:1614
 *    `GuidNum.DataPropertyName`). ⇒ Sort theo 名称 thì SỐ ĐI THEO DÒNG, cột №
 *    KHÔNG đánh lại 1..N.
 *  - frm203002.cs:2240 `hfgGuid1_RowEnter` — ô 選択№ = `e.RowIndex + 1` (VỊ TRÍ),
 *    và :6749-6757 Enter nhảy tới dòng `số − 1` (cũng vị trí). Sau khi sort,
 *    cột № và ô 選択№ CỐ Ý lệch nhau — WinForm cũng vậy.
 *
 * ─── Port web (apps/web-tenant/src/features/treatments/components) ──────────
 *  - treatment-side-panel.tsx
 *      · `SortHeaderCell` (:211) — `role="button"`, `aria-sort`, glyph ▲/▼ trong
 *        `span[data-testid="sort-<id>"]`, `whitespace-nowrap`. Bấm CHỈ sort,
 *        không chọn/không apply dòng.
 *      · `useRowNo` (:256) — № in ra là vị trí trong danh sách CHƯA sort (parity
 *        GuidNum/PackNum), và cũng là khoá sort của cột №.
 *      · `useClientSort(..., dispNoField: COL_NO)` — rule 6b: № tăng dần là
 *        no-op (đã là thứ tự BE), giảm dần mới đảo.
 *      · `useHighlightFollowsSort` (:269) — sort xong dòng đang sáng vẫn là dòng
 *        cũ (DataGridView mang CurrentRow theo row object).
 *      · Header 病検 `grid-cols-[44px_270px_1fr]` (:1002), ガイド `[40px_1fr]`
 *        (:1089), パック `[35px_1fr]` (:1135), 個別
 *        `[200px_48px_66px_48px_60px_48px]` (KOBE_GRID_CLASS :53).
 *      · Dòng đang sáng: nền `bg-[#ffffc0]`. Ô 選択№: `input[data-side-anchor]`.
 *
 * ─── LUẬT RIÊNG CỦA BỘ TEST NÀY ─────────────────────────────────────────────
 * Thêm icon sort mà làm tiêu đề cột **rớt xuống 2 dòng** thì coi như FAIL
 * (yêu cầu của developer). Đo bằng số line-box thật của Range trong ô tiêu đề,
 * ở CẢ trạng thái chưa sort lẫn khi đang mang glyph ▲/▼ — vì header 病検 bị ghim
 * `h-5`, chữ tràn dòng sẽ bị cắt chứ không đội chiều cao lên, nên đo height là
 * không phát hiện được.
 *
 * CHẠY TUẦN TỰ, login MỘT lần ở beforeAll (app rate-limit login). Thứ tự
 * testcase CÓ ý nghĩa: mỗi nhóm TC mở tab của nó rồi để nguyên cho TC kế tiếp.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/** Mặc định không ghim ngày → app lấy hôm nay (tháng hiện hành). */
const TRT_DT = process.env.TEST_TRT_DT ?? ''

/** Số dòng tối thiểu để một phép sort có ý nghĩa (Rule 10.6 — không hardcode). */
const MIN_ROWS = 2

/** Escape ký tự regex trong nhãn cột ('No.' có dấu chấm, '50/100' có dấu gạch). */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

type TabName = '病検' | 'ガイド' | 'パック' | '個別'

interface TabCfg {
  tab: TabName
  /** CSS chọn DÒNG DỮ LIỆU (header dùng chung grid-cols nên phải kèm cursor-pointer). */
  rowSel: string
  /** Nhãn mọi cột tiêu đề của tab, đúng thứ tự trái → phải. */
  headers: string[]
  /** Lưới ảo hoá (chỉ 個別) → KHÔNG so đa tập, chỉ kiểm bất biến trên dòng đang render. */
  virtual?: boolean
}

const TABS: Record<TabName, TabCfg> = {
  病検: {
    tab: '病検',
    rowSel: 'div[class*="grid-cols-[44px_270px_1fr]"][class*="cursor-pointer"]',
    headers: ['No', '部位', '病名'],
  },
  ガイド: {
    tab: 'ガイド',
    rowSel: 'div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]',
    headers: ['No.', '名称'],
  },
  パック: {
    tab: 'パック',
    rowSel: 'div[class*="grid-cols-[42px_1fr]"][class*="cursor-pointer"]',
    headers: ['No.', '名称'],
  },
  個別: {
    tab: '個別',
    rowSel:
      'div[class*="grid-cols-[200px_48px_66px_48px_60px_48px]"][class*="cursor-pointer"]',
    headers: ['処置名称', '一般', '50/100', '訪問', 'コード', '枝番'],
    virtual: true,
  },
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('SidePanel — 見出しクリックの並べ替え (frm203002 4タブ)', () => {
  let page: Page
  let step: () => Promise<void>

  // ── locator helpers ────────────────────────────────────────────────────────

  /** Ô tiêu đề sortable. Rule 10.5 — tên có thể kèm glyph ▲/▼. */
  const headerCell = (label: string) =>
    page.getByRole('button', { name: new RegExp(`^${esc(label)}\\s*[▲▼]?$`) })

  const rowsOf = (cfg: TabCfg) => page.locator(cfg.rowSel)

  /** Nút tab (không nhầm với ô tiêu đề vì tên khác hẳn). */
  const tabButton = (tab: TabName) => page.getByRole('button', { name: tab, exact: true })

  /** Ô 選択№ của tab đang mở — mỗi lúc chỉ có ĐÚNG MỘT input mang data-side-anchor. */
  const noInput = () => page.locator('input[data-side-anchor]')

  /**
   * Số DÒNG CHỮ thật trong một ô tiêu đề.
   *
   * Đếm line-box qua `Range.getClientRects()` rồi gom theo toạ độ `top` với sai
   * số 0.6·font-size: glyph ▲ nằm trong `<span>` riêng nên có rect riêng, lệch
   * vài px so với chữ nhưng vẫn CÙNG một dòng.
   */
  async function lineCount(cell: Locator): Promise<number> {
    return cell.evaluate((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      const fs = parseFloat(getComputedStyle(el).fontSize) || 12
      const tops = Array.from(range.getClientRects())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => r.top)
        .sort((a, b) => a - b)
      let lines = 0
      let last = Number.NEGATIVE_INFINITY
      for (const t of tops) {
        if (t - last > fs * 0.6) {
          lines++
          last = t
        }
      }
      return Math.max(lines, 1)
    })
  }

  /**
   * Số px nội dung tràn ra NGOÀI vùng nội dung của ô, tính cả hai phía.
   *
   * KHÔNG dùng `scrollWidth - clientWidth`: cột căn phải (`text-right`) khi
   * thiếu chỗ thì tràn sang TRÁI, và scrollWidth không hề tăng — đo kiểu đó
   * báo 0px trong khi trên màn hình icon/nhãn đã đè sang cột bên cạnh.
   * Đo bằng rect thật của nội dung so với padding box của ô.
   */
  async function overflowPx(cell: Locator): Promise<number> {
    return cell.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      const innerLeft = box.left + parseFloat(cs.paddingLeft || '0')
      const innerRight = box.right - parseFloat(cs.paddingRight || '0')
      const range = document.createRange()
      range.selectNodeContents(el)
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
      if (rects.length === 0) return 0
      const left = Math.min(...rects.map((r) => r.left))
      const right = Math.max(...rects.map((r) => r.right))
      return Math.max(0, innerLeft - left, right - innerRight)
    })
  }

  /**
   * LUẬT FAIL của bộ test: không ô tiêu đề nào được rớt xuống 2 dòng.
   * Kiểm toàn bộ header của tab, ở đúng trạng thái hiện tại (có/không glyph).
   */
  async function expectHeadersSingleLine(cfg: TabCfg, when: string) {
    for (const label of cfg.headers) {
      const cell = headerCell(label)
      await expect(cell, `${cfg.tab}: không thấy tiêu đề 「${label}」`).toBeVisible()
      const lines = await lineCount(cell)
      expect(
        lines,
        `${cfg.tab} / 「${label}」 ${when}: tiêu đề rớt ${lines} dòng — icon sort làm vỡ header`,
      ).toBe(1)
      const over = await overflowPx(cell)
      expect(
        over,
        `${cfg.tab} / 「${label}」 ${when}: nhãn/icon tràn ${Math.ceil(over)}px ra ngoài ô — ` +
          `đè sang cột bên cạnh. Nới track của cột này trong treatment-side-panel.tsx.`,
      ).toBeLessThanOrEqual(1)
    }
  }

  /** Đọc (№, chữ ở cột `textIdx`) của mọi dòng đang render. */
  async function readRows(cfg: TabCfg, textIdx: number) {
    return rowsOf(cfg).evaluateAll(
      (els, ti) =>
        els.map((el) => {
          const cells = Array.from(el.children) as HTMLElement[]
          return {
            no: (cells[0]?.innerText ?? '').trim(),
            text: (cells[ti]?.innerText ?? '').trim(),
          }
        }),
      textIdx,
    )
  }

  /** Không được có dialog/alert nào bung ra vì một cú bấm tiêu đề. */
  async function expectNoDialogOpened(cfg: TabCfg) {
    await expect(
      page.getByRole('dialog'),
      `${cfg.tab}: bấm tiêu đề lại MỞ DIALOG — đúng lỗi Click-header-chọn-dòng của WinForm`,
    ).toHaveCount(0)
    await expect(
      page.getByRole('alertdialog'),
      `${cfg.tab}: bấm tiêu đề lại bung alert`,
    ).toHaveCount(0)
  }

  /** Mở một tab và trả về số dòng đang render (0 = rỗng). */
  async function openTab(cfg: TabCfg): Promise<number> {
    await tabButton(cfg.tab).click()
    await expect(headerCell(cfg.headers[0] ?? '')).toBeVisible({ timeout: 60000 })
    await step()
    const rows = rowsOf(cfg)
    // Rule 10.8 — count() không auto-wait, phải chờ dòng đầu hiện đã.
    await expect(rows.first().or(page.getByText(/未登録|該当なし/))).toBeVisible({
      timeout: 60000,
    })
    return rows.count()
  }

  /** Bấm một tiêu đề rồi chờ aria-sort đổi sang trạng thái mong muốn. */
  async function clickHeader(label: string, expected: 'ascending' | 'descending') {
    const cell = headerCell(label)
    await cell.click()
    await expect(cell, `「${label}」: aria-sort không chuyển sang ${expected}`).toHaveAttribute(
      'aria-sort',
      expected,
    )
    await step()
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // Popup 「〜を算定しますか？」 của AutoSantei nổi đè và nuốt click — dọn tự động
    // (Rule 14). Chọn No để không kéo theo dialog カルテ記載選択 (Rule 14.1).
    await page.addLocatorHandler(
      page.getByText(/を算定しますか？/).first(),
      async () => {
        await page
          .getByRole('button', { name: /^(No|いいえ)$/ })
          .first()
          .click()
      },
      { times: 30 },
    )

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(page).toHaveURL(/\/$/)

    const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ══ 病検 ═══════════════════════════════════════════════════════════════════

  test('TC-1 病検 — 3 cột đều sortable, mở tab là CHƯA sort (rule 1)', async () => {
    const cfg = TABS.病検
    const n = await openTab(cfg)
    if (n < MIN_ROWS) {
      console.log(`TC-1 病検: chỉ ${n} dòng (<${MIN_ROWS}) → BỎ QUA nhóm 病検. Đổi TEST_PAT_NO.`)
      test.skip()
    }
    for (const label of cfg.headers) {
      await expect(
        headerCell(label),
        `病検 / 「${label}」: mở tab đã có glyph sort → reset không chạy`,
      ).toHaveAttribute('aria-sort', 'none')
    }
    await expectHeadersSingleLine(cfg, 'chưa sort')
    console.log(`TC-1 病検: ${n} dòng`)
  })

  test('TC-2 病検 — sort 病名: không mất dòng, № đi theo dòng, không mở dialog', async () => {
    const cfg = TABS.病検
    const before = await readRows(cfg, 2)
    test.skip(before.length < MIN_ROWS, '病検 không đủ dòng')

    await clickHeader('病名', 'ascending')
    const asc = await readRows(cfg, 2)

    expect(asc.length, '病検: sort xong SỐ DÒNG thay đổi').toBe(before.length)
    expect(
      [...asc.map((r) => r.text)].sort(),
      '病検: sort làm mất/nhân bản dòng (đa tập 病名 đổi)',
    ).toEqual([...before.map((r) => r.text)].sort())

    // Parity № là DỮ LIỆU: cặp (№ → 病名) phải giữ nguyên sau khi sort.
    const nameByNo = new Map(before.map((r) => [r.no, r.text]))
    for (const r of asc) {
      expect(
        r.text,
        `病検: № ${r.no} sau sort mang 病名 khác — cột № đang bị đánh lại 1..N ` +
          `thay vì đi theo dòng (WinForm modByoken.cs:270 ghi № vào chính dòng)`,
      ).toBe(nameByNo.get(r.no))
    }

    await expectNoDialogOpened(cfg)
    await expect(headerCell('病名'), '病検: click header lại nhảy sang tab khác').toBeVisible()
    await expectHeadersSingleLine(cfg, 'đang sort 病名 ▲')
    console.log(`TC-2 病検 asc 病名: [${asc.slice(0, 6).map((r) => `${r.no}:${r.text}`).join(' | ')}]`)
  })

  test('TC-3 病検 — bấm lại 病名: đảo chiều, không quay về "chưa sort" (rule 3)', async () => {
    const cfg = TABS.病検
    const asc = (await readRows(cfg, 2)).map((r) => r.text)
    test.skip(asc.length < MIN_ROWS, '病検 không đủ dòng')

    await clickHeader('病名', 'descending')
    const desc = (await readRows(cfg, 2)).map((r) => r.text)

    // So bằng RANK để không phán xét collation và không vỡ vì các dòng trùng giá
    // trị (sort ổn định ⇒ desc không phải bản đảo nguyên văn của asc).
    const rank = new Map<string, number>()
    asc.forEach((t, i) => {
      if (!rank.has(t)) rank.set(t, i)
    })
    const ranks = desc.map((t) => rank.get(t) ?? -1)
    expect(ranks, '病検: desc chứa giá trị không có trong asc').not.toContain(-1)
    expect(
      ranks,
      '病検: bấm lần 2 không cho thứ tự giảm dần theo đúng comparator của lần 1',
    ).toEqual([...ranks].sort((a, b) => b - a))
    await expectHeadersSingleLine(cfg, 'đang sort 病名 ▼')
  })

  test('TC-4 病検 — cột No: tăng dần là no-op (rule 6b), giảm dần thì đảo', async () => {
    const cfg = TABS.病検
    // Trả về thứ tự BE trước đã: bấm No ▲ chính là phép "no-op" cần kiểm.
    await clickHeader('No', 'ascending')
    const asc = await readRows(cfg, 2)
    test.skip(asc.length < MIN_ROWS, '病検 không đủ dòng')

    expect(
      asc.map((r) => Number(r.no)),
      '病検: No ▲ phải trả về đúng thứ tự BE 1,2,3… (rule 6b)',
    ).toEqual(asc.map((_, i) => i + 1))

    await clickHeader('No', 'descending')
    const desc = await readRows(cfg, 2)
    expect(
      desc.map((r) => r.no),
      '病検: No ▼ phải là bản đảo nguyên văn của thứ tự BE',
    ).toEqual([...asc.map((r) => r.no)].reverse())
    await expectHeadersSingleLine(cfg, 'đang sort No ▼')
  })

  test('TC-5 病検 — sort xong con trỏ vẫn ở đúng dòng cũ, ô 選択№ bám theo', async () => {
    const cfg = TABS.病検
    const rows = rowsOf(cfg)
    const n = await rows.count()
    test.skip(n < MIN_ROWS, '病検 không đủ dòng')

    // Về thứ tự BE rồi chọn dòng 2 bằng ↑/↓ trên ô № (KHÔNG click dòng: click dòng
    // ở tab 病検 là "áp dụng" → nhảy sang tab ガイド).
    await clickHeader('No', 'ascending')
    await noInput().click()
    await page.keyboard.press('ArrowDown')
    await step()

    const highlighted = async () =>
      rows.evaluateAll((els) => {
        const i = els.findIndex((e) => e.className.includes('bg-[#ffffc0]'))
        const el = els[i]
        if (i < 0 || !el) return null
        return { idx: i, text: (el.children[2] as HTMLElement).innerText.trim() }
      })

    const before = await highlighted()
    expect(before, '病検: không có dòng nào đang sáng').not.toBeNull()

    await clickHeader('病名', 'ascending')
    const after = await highlighted()

    expect(after?.text, '病検: sort xong con trỏ nhảy sang dòng KHÁC').toBe(before?.text)
    await expect(
      noInput(),
      '病検: ô 選択№ không bám theo vị trí mới của dòng đang sáng',
    ).toHaveValue(String((after?.idx ?? -1) + 1))
    await expectNoDialogOpened(cfg)
  })

  // ══ ガイド ═════════════════════════════════════════════════════════════════

  test('TC-6 ガイド — sort 名称 + № đi theo dòng + không mở dialog chọn ガイド', async () => {
    const cfg = TABS.ガイド
    await openTab(cfg)
    // Rule 10.7 — phải bấm 全て表示 thì list ガイド mới có data.
    await page.getByRole('button', { name: '全て表示', exact: true }).click()
    await step()
    const rows = rowsOf(cfg)
    await expect(rows.first().or(page.getByText('未登録'))).toBeVisible({ timeout: 60000 })
    const before = await readRows(cfg, 1)
    if (before.length < MIN_ROWS) {
      console.log(`TC-6 ガイド: chỉ ${before.length} dòng → BỎ QUA nhóm ガイド.`)
      test.skip()
    }

    for (const label of cfg.headers) {
      await expect(headerCell(label), `ガイド / 「${label}」: mở tab đã có glyph`).toHaveAttribute(
        'aria-sort',
        'none',
      )
    }
    await expectHeadersSingleLine(cfg, 'chưa sort')

    await clickHeader('名称', 'ascending')
    const asc = await readRows(cfg, 1)

    expect([...asc.map((r) => r.text)].sort(), 'ガイド: sort làm mất/nhân bản dòng').toEqual(
      [...before.map((r) => r.text)].sort(),
    )
    const nameByNo = new Map(before.map((r) => [r.no, r.text]))
    for (const r of asc) {
      expect(
        r.text,
        `ガイド: № ${r.no} sau sort mang 名称 khác — cột № đang đánh lại 1..N thay vì ` +
          `đi theo dòng (WinForm frm203002.cs:1983 GuidNum là dữ liệu của dòng)`,
      ).toBe(nameByNo.get(r.no))
    }
    await expectNoDialogOpened(cfg)
    await expectHeadersSingleLine(cfg, 'đang sort 名称 ▲')
    console.log(`TC-6 ガイド asc: [${asc.slice(0, 6).map((r) => `${r.no}:${r.text}`).join(' | ')}]`)
  })

  // ══ パック ═════════════════════════════════════════════════════════════════

  test('TC-7 パック — sort 名称 + № đi theo dòng + không mở パック処置選択', async () => {
    const cfg = TABS.パック
    const n = await openTab(cfg)
    if (n < MIN_ROWS) {
      console.log(`TC-7 パック: chỉ ${n} dòng → BỎ QUA nhóm パック.`)
      test.skip()
    }
    for (const label of cfg.headers) {
      await expect(headerCell(label), `パック / 「${label}」: mở tab đã có glyph`).toHaveAttribute(
        'aria-sort',
        'none',
      )
    }
    await expectHeadersSingleLine(cfg, 'chưa sort')

    const before = await readRows(cfg, 1)
    await clickHeader('名称', 'ascending')
    const asc = await readRows(cfg, 1)

    expect([...asc.map((r) => r.text)].sort(), 'パック: sort làm mất/nhân bản dòng').toEqual(
      [...before.map((r) => r.text)].sort(),
    )
    const nameByNo = new Map(before.map((r) => [r.no, r.text]))
    for (const r of asc) {
      expect(
        r.text,
        `パック: № ${r.no} sau sort mang 名称 khác — cột № phải đi theo dòng ` +
          `(WinForm frm203002.cs:2031 PackNum là dữ liệu của dòng)`,
      ).toBe(nameByNo.get(r.no))
    }
    await expectNoDialogOpened(cfg)
    await expectHeadersSingleLine(cfg, 'đang sort 名称 ▲')

    await clickHeader('No.', 'ascending')
    expect(
      (await readRows(cfg, 1)).map((r) => Number(r.no)),
      'パック: No. ▲ phải trả về thứ tự BE 1,2,3… (rule 6b)',
    ).toEqual(before.map((_, i) => i + 1))
    await expectHeadersSingleLine(cfg, 'đang sort No. ▲')
  })

  // ══ 個別 ═══════════════════════════════════════════════════════════════════

  test('TC-8 個別 — sort cột số (コード) tăng/giảm đúng, header 6 cột không vỡ', async () => {
    const cfg = TABS.個別
    const n = await openTab(cfg)
    if (n < MIN_ROWS) {
      console.log(`TC-8 個別: chỉ ${n} dòng → BỎ QUA nhóm 個別.`)
      test.skip()
    }
    for (const label of cfg.headers) {
      await expect(headerCell(label), `個別 / 「${label}」: mở tab đã có glyph`).toHaveAttribute(
        'aria-sort',
        'none',
      )
    }
    // Header chật nhất toàn màn (6 cột trong 450px) — đây là chỗ dễ vỡ nhất.
    await expectHeadersSingleLine(cfg, 'chưa sort')

    /** Cột コード = ô thứ 5 (index 4) của dòng. Lưới ảo hoá → chỉ đọc dòng đang render. */
    const codes = async () =>
      rowsOf(cfg).evaluateAll((els) =>
        els.map((el) => Number((el.children[4] as HTMLElement).innerText.trim())),
      )

    await clickHeader('コード', 'ascending')
    const asc = await codes()
    expect(asc.length, '個別: sort xong không còn dòng nào render').toBeGreaterThan(0)
    expect(asc, '個別: コード ▲ không tăng dần').toEqual([...asc].sort((a, b) => a - b))
    await expectHeadersSingleLine(cfg, 'đang sort コード ▲')
    await expectNoDialogOpened(cfg)

    await clickHeader('コード', 'descending')
    const desc = await codes()
    expect(desc, '個別: コード ▼ không giảm dần').toEqual([...desc].sort((a, b) => b - a))
    expect(Number(desc[0]), '個別: ▼ mà đỉnh bảng không lớn hơn đỉnh của ▲').toBeGreaterThan(
      Number(asc[0]),
    )
    await expectHeadersSingleLine(cfg, 'đang sort コード ▼')

    // 処置名称 là giá trị tính ra (cct_nm ↔ trt_nm) — chỉ kiểm nó SORT ĐƯỢC và
    // không phá header, không phán xét collation.
    await clickHeader('処置名称', 'ascending')
    await expectHeadersSingleLine(cfg, 'đang sort 処置名称 ▲')
    await expectNoDialogOpened(cfg)
    console.log(`TC-8 個別: コード ▲ top=[${asc.slice(0, 5).join(', ')}] ▼ top=[${desc.slice(0, 5).join(', ')}]`)
  })
})
