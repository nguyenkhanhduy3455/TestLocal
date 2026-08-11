/**
 * client sort — TOÀN BỘ testcase sort của web-tenant gộp vào MỘT file.
 *
 * Thay cho 5 spec cũ (đã xoá): cmt-auto-picker-sort / guide-selection-sort /
 * pack-selection-sort / client-sort-reset / dispno-rule6b.
 *
 * ═══ VÌ SAO PHẢI VIẾT LẠI ════════════════════════════════════════════════════
 * 3 spec dialog cũ (guide / pack / cmt) được viết từ SOURCE WINFORM chứ không
 * theo web thật, nên assert sai ở 3 chỗ:
 *
 *   1. Cột TEXT bị so bằng `new Intl.Collator('ja')`. Web KHÔNG dùng collator
 *      trần: `comparators.ts::compareTextJa` tách chuỗi thành RUN ký hiệu / RUN
 *      chữ, ký hiệu đi TRƯỚC chữ và có bảng trọng số Windows riêng
 *      (`( ) ,` trước `+`), chỉ RUN chữ mới đẩy cho ICU. Tên 処置 đầy `（）・＋`
 *      nên assert Intl fail oan (đúng cái bẫy đã ghi ở virtual-grid.ts).
 *   2. Cột コード bị mặc định là numeric. Đúng ở ガイド/パック (`'numeric'`)
 *      nhưng SAI ở 薬剤選択 và 区分 của 摘要記載事項一覧 — hai chỗ đó là
 *      `'word'` (bỏ ký tự không phải chữ/số rồi so bằng collator numeric).
 *   3. `expect(after).toEqual([...before].reverse())` — grid VIRTUALIZED, DOM
 *      chỉ có các dòng trong khung nhìn nên đảo chiều là đổi hẳn tập dòng hiển
 *      thị. Bất biến đúng là ĐƠN ĐIỆU trên khung nhìn, không phải bằng nhau.
 *   4. `.trim()` giá trị cell trước khi so. Khoảng trắng ĐẦU chuỗi là dữ liệu có
 *      nghĩa: space có trong bảng ký hiệu Windows (trọng số 0) và run ký hiệu
 *      đứng trước run chữ, nên "　月　日より６歳" xếp trước "■初診料" — trim vào là
 *      so nhầm chuỗi app chưa từng sort (xem colValues bên dưới).
 *
 * Bản này so thứ tự bằng CHÍNH comparator của app, và chạy nó TRONG TRÌNH DUYỆT
 * (`page.evaluate`) để dùng đúng ICU của Chromium — ICU của Node có thể khác.
 *
 * ═══ FACT LẤY TỪ SOURCE (Rule 21) ════════════════════════════════════════════
 *  - shared/components/virtual-list-table/virtual-list-table.tsx
 *      · header sortable = `role="button"` + `aria-sort` none|ascending|descending,
 *        glyph ▲/▼ nằm trong accessible name → khớp regex `^label\s*[▲▼]?$`.
 *      · cell test id = `cell-<columnId>`; `enableSortingRemoval: false` → vòng
 *        đời chỉ Asc ⇄ Desc, click mãi KHÔNG về none. Chỉ `reset()` mới về none.
 *      · `manualSorting: true` — bảng không tự sắp, `useClientSort` sắp sẵn.
 *      · KHÔNG có `resetScrollSeq` ở các dialog dưới đây → sort xong grid không
 *        tự cuộn về đầu (đừng assert scrollTop=0 như các list màn hình).
 *  - use-client-sort.ts
 *      · rule 6b: `dispNoField` → Asc là NO-OP (giữ thứ tự BE), Desc mới sắp.
 *      · `sortKeyOverrides` → cột sort theo field KHÁC field hiển thị.
 *  - comparators.ts: 'numeric' | 'word' | 'text' (bản port ở CMP bên dưới).
 *  - cnt-cell.tsx: ガイド/パック dùng chung 5 cột — trtCd/trtSb/score numeric,
 *      trtNm text, 回数 `enableSorting: false` (ô input) → KHÔNG có role=button.
 *  - cmt-auto-picker-dialog.tsx / summary-column-entry-dialog.tsx
 *      · cột 選択番号 id=`dispNo`, hiển thị `originalIndex + 1` ⇒ LUÔN liên tục
 *        1..n (comment cũ ghi "BE thưa 1,6,11" là nói về dữ liệu BE, không phải
 *        thứ đang hiển thị). Vì vậy Asc-no-op nhìn giống hệt "sort asc đúng";
 *        thứ phân biệt được là 選択番号 phải DÍNH THEO DÒNG khi sort cột khác.
 *      · reset() gọi lúc dialog đóng → mở lại sạch glyph, về thứ tự BE.
 *      · 摘要欄記載選択 có 2 TAB, mỗi tab một grid, KHÔNG hiện cùng lúc.
 *  - medicine-selection-dialog.tsx: parent truyền `key={open?'open':'closed'}`
 *      → remount, sạch state mà không cần reset().
 *
 * ⚠️ Cột HIỂN THỊ ≠ KHOÁ SORT — tuyệt đối không assert thứ tự theo text:
 *      受付患者一覧 氏名 → sort theo `knSort` (số 五十音順 của BE, không hiện ra)
 *      受付患者一覧 待ち時間 → hiện "1時間30分", sort theo số phút
 *      未精算患者一覧 氏名 → knSort; 生年月日 → patBirthDt (hiện dạng 和暦)
 *      未精算患者一覧 点数/請求金額/未収金 → hiện có dấu phẩy (toLocaleString)
 *        ⇒ phải bóc `[^\d.-]` trước khi so số.
 *
 * ═══ CÁCH CHẠY ═══════════════════════════════════════════════════════════════
 *   cd .../web-tenant-tests && npx playwright test tests/client-sort.spec.ts
 *
 * Serial + DÙNG CHUNG 1 page ⇒ chỉ 1 lần login cho cả file (Rule 10.1 / 19).
 * Đổi lại: thứ tự test có ý nghĩa, một test ĐỎ thì các test sau bị SKIP, và
 * chạy lẻ một test ở giữa vẫn được (mỗi test tự điều hướng lại từ đầu).
 *
 * Env: TEST_PAT_NO (mặc định 12138 — bệnh nhân có ガイド/パック),
 *      TEST_AUTO_PAT_NO (mặc định 11 — dùng cho カルテ記載選択 tự bật),
 *      TEST_TRT_DT (mặc định hôm nay), TEST_STEP_MS (nhịp xem --headed).
 *
 * ═══ TỐI ƯU TỐC ĐỘ — ĐỪNG THÊM LẠI MẤY CHỖ NÀY ══════════════════════════════
 * Suite từng mất ~52s/test dù thao tác chỉ vài giây. Toàn bộ phần dôi ra là CHỜ
 * MÙ, không phải app chậm:
 *   · `waitFor(30s).catch(()=>{})` chờ confirm 算定 — khi confirm KHÔNG bung (đã
 *     trả lời rồi / ngày đó không sinh) thì đó là 30 GIÂY CHẾT mỗi test. Đã bỏ:
 *     `addLocatorHandler` tự bấm No trước mỗi actionability check (Rule 14).
 *   · `waitFor(8s).catch(()=>{})` chờ dòng đầu của dialog khi dò ガイド/パック —
 *     mỗi mục rỗng tốn trọn 8s. Đã đổi thành chờ "có dòng HOẶC empty-state".
 *   · `goto` lại cùng một màn 診療入力 ở 5 test liên tiếp — mỗi lần Vite dev dựng
 *     lại module graph. Đã đổi thành: đang ở đúng màn thì dùng tiếp.
 *   · chờ trọn nhịp poll 30s của 受付患者一覧 — đã ép refetch bằng offline→online
 *     (`refetchOnReconnect: true`), cùng đường code, xong trong ~1s.
 *   · `waitForTimeout(1500)` sau mỗi lần đổi mode 未精算 — đã đổi sang mốc tất
 *     định (nhãn nút F1 lật theo mode).
 *   · `closeDialogs` dùng chung ngủ cứng 400/600ms mỗi vòng — bản trong file này
 *     chờ đúng lúc dialog biến mất.
 *   · `step()` 2 nhịp mỗi cột → còn 1. Chạy nền `step()` = 0; chỉ khi --headed
 *     mới có nhịp, tắt hẳn bằng TEST_STEP_MS=0.
 *   · `openEntryScreen` chờ confirm 15s MÙ rồi mới chờ grid 60s. Đã đảo thành
 *     MOUNT → GRID → CONFIRM: trang trắng lộ ra trong ~1s (xem dưới) thay vì đốt
 *     75s rồi mới đỏ, và confirm chỉ bung SAU khi grid nạp xong nên chờ nó sau
 *     cũng đúng thực tế hơn.
 *   · 病名選択: hai lần dò dialog trên nhánh BỎ QUA để 15s + 20s → còn 8s mỗi lần.
 *   · `closeAllDialogs` bắn F10 rồi chờ 3s ĐỦ 6 VÒNG kể cả khi chẳng đóng được
 *     gì → 18s chết, chiếm hơn NỬA thời gian cả suite (đo được sau test 病名選択).
 *     Nguyên nhân: giả định "F10 = 戻る cho mọi dialog" SAI —
 *     `disease-selection-dialog.tsx:432/438` map F10 = 検索, F12 = 戻る. Giờ:
 *     F10 → không giảm số dialog thì F12 → vẫn không thì reload (chốt chặn), và
 *     log tên dialog kẹt để lần sau sửa đúng chỗ thay vì tăng `max`.
 *     Riêng test 病名選択: 18.4s → 2.1s; cả file: ~1 phút (đỏ) → ~14s (xanh).
 * Nguyên tắc: mọi `waitFor(...).catch(() => {})` là một khoản chờ mù — chỉ dùng
 * khi THẬT SỰ không có mốc nào khác, và để timeout ngắn nhất có thể.
 *
 * ═══ VÌ SAO SUITE ĐỎ KHI CHẠY NỀN MÀ --headed LẠI XANH ═══════════════════════
 * KHÔNG phải lỗi app, cũng không phải do headless. Vite dev server thỉnh thoảng
 * trả `net::ERR_FAILED` cho MỘT module `/src/*.ts` (đo được:
 * `src/shared/components/fkey/index.ts`) → React không mount → `#root` rỗng →
 * ảnh chụp trắng tinh, mọi locator "element(s) not found".
 *
 * `--headed` ít dính hơn chỉ vì `step()` (mặc định 2s/nhịp) làm các lần điều
 * hướng thưa ra; chạy nền với TEST_STEP_MS=0 thì dồn dập nên trúng nhiều hơn.
 *
 * Cách chữa trong file này (`waitForApp`): nghe `requestfailed` để BIẾT NGAY app
 * sẽ không mount rồi `goto` lại, tối đa LOAD_ATTEMPTS lần. Muốn khỏi gặp hẳn thì
 * trỏ BASE_URL vào bản build: `npx vite preview`.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { cells, emptyState, expectNoSortGlyph, header, rows } from './virtual-grid'

const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/** カルテ記載選択 chỉ tự bật khi (bệnh nhân, ngày) CHƯA có 処置 nào được lưu. */
const AUTO_PAT_NO = process.env.TEST_AUTO_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Kiểu comparator của app — comparators.ts::ComparatorKind. */
type Kind = 'numeric' | 'word' | 'text'

interface OutOfOrder {
  i: number
  prev: string
  cur: string
}

/**
 * Bản PORT của apps/web-tenant/src/shared/components/virtual-list-table/comparators.ts.
 * Chạy trong TRÌNH DUYỆT (page.evaluate) nên dùng đúng ICU của Chromium — Node
 * có thể có bảng collation khác và sinh fail oan.
 *
 * Trả về cặp đầu tiên sai thứ tự, hoặc null nếu dãy đúng.
 *
 * ⚠️ Source đổi comparator thì SỬA Ở ĐÂY (không có cách import chéo repo).
 */
function findOutOfOrder(
  page: Page,
  values: string[],
  kind: Kind,
  desc: boolean,
): Promise<OutOfOrder | null> {
  return page.evaluate(
    ({ values, kind, desc }: { values: string[]; kind: Kind; desc: boolean }) => {
      // Thứ tự Windows cho khối dấu câu ASCII (index = trọng số) — chính nó đặt
      // `( ) ,` trước `+`.
      const WIN_SYMBOL_ORDER = " '-!\"#$%&()*,./:;?@[\\]^_`{|}~+<=>"
      const weight = new Map<string, number>()
      for (let i = 0; i < WIN_SYMBOL_ORDER.length; i++) {
        weight.set(WIN_SYMBOL_ORDER.charAt(i), i)
      }
      // Gập full-width về half-width: NLS coi hai dạng bằng nhau ở primary level.
      const fold = (code: number) =>
        code >= 0xff01 && code <= 0xff5e ? code - 0xfee0 : code === 0x3000 ? 0x20 : code
      const symbolWeight = (code: number): number | null => {
        const w = weight.get(String.fromCharCode(fold(code)))
        return w === undefined ? null : w
      }

      const ja = new Intl.Collator('ja')
      const jaNumeric = new Intl.Collator('ja', { numeric: true })

      const compareNumeric = (a: string, b: string) =>
        Number(a.replace(/[^\d.-]/g, '') || 0) - Number(b.replace(/[^\d.-]/g, '') || 0)

      // RUN ký hiệu đứng trước RUN chữ; RUN chữ so nguyên cụm bằng ICU.
      const compareTextJa = (sa: string, sb: string): number => {
        if (sa === sb) return 0
        let i = 0
        let j = 0
        while (i < sa.length && j < sb.length) {
          const wa = symbolWeight(sa.charCodeAt(i))
          const wb = symbolWeight(sb.charCodeAt(j))
          if ((wa === null) !== (wb === null)) return wa === null ? 1 : -1
          if (wa !== null && wb !== null) {
            if (wa !== wb) return wa - wb
            i++
            j++
            continue
          }
          let ei = i
          while (ei < sa.length && symbolWeight(sa.charCodeAt(ei)) === null) ei++
          let ej = j
          while (ej < sb.length && symbolWeight(sb.charCodeAt(ej)) === null) ej++
          const cmp = ja.compare(sa.slice(i, ei), sb.slice(j, ej))
          if (cmp !== 0) return cmp
          i = ei
          j = ej
        }
        return sa.length - i - (sb.length - j)
      }

      // Bỏ mọi ký tự không phải chữ (Anh/CJK) hoặc số rồi so; bằng nhau thì so
      // nguyên bản. Collator numeric để `1001-2` < `1001-10`.
      const NON_WORD = /[^a-zA-Z0-9぀-ゟ゠-ヿ一-龯]/g
      const compareWinFormWord = (sa: string, sb: string): number => {
        if (sa === sb) return 0
        const ca = sa.replace(NON_WORD, '')
        const cb = sb.replace(NON_WORD, '')
        if (ca !== cb) return jaNumeric.compare(ca, cb)
        return jaNumeric.compare(sa, sb)
      }

      const cmp =
        kind === 'numeric'
          ? compareNumeric
          : kind === 'word'
            ? compareWinFormWord
            : compareTextJa

      for (let i = 1; i < values.length; i++) {
        const prev = values[i - 1] ?? ''
        const cur = values[i] ?? ''
        if (cmp(prev, cur) * (desc ? -1 : 1) > 0) return { i, prev, cur }
      }
      return null
    },
    { values, kind, desc },
  )
}

test.describe.configure({ mode: 'serial' })

test.describe('client sort — dialog grid + list màn hình', () => {
  let page: Page
  let step: () => Promise<void>
  /** addLocatorHandler chỉ được cắm MỘT lần cho cả file (xem installSanteiNo). */
  let santeiHandlerOn = false
  /**
   * Vite dev vừa nhả hụt một module `/src/*.ts` (ERR_FAILED) ⇒ React sẽ KHÔNG
   * mount. Listener thường trực ở beforeAll ghi cờ; các hàm điều hướng reset nó
   * ngay trước mỗi `goto` rồi đọc trong `waitForApp`.
   */
  let moduleDied = false

  const dialog = () => page.getByRole('dialog')

  /**
   * Đọc text các cell của một cột — CHỈ những dòng đang render (virtualized).
   *
   * ⚠️ KHÔNG `.trim()`. App sort trên GIÁ TRỊ THÔ của field, mà khoảng trắng đầu
   * chuỗi là DỮ LIỆU CÓ NGHĨA với `compareTextJa`: space nằm trong bảng ký hiệu
   * Windows (trọng số 0) và RUN KÝ HIỆU luôn đứng trước RUN CHỮ. 摘要コメント kiểu
   * điền chỗ trống ("　月　日より６歳", " 日 切開") vì thế xếp trước "■初診料" —
   * đúng như web hiển thị. Bản trước trim nên so nhầm chuỗi app chưa từng sort và
   * báo oan "ASC sai thứ tự tại dòng 2".
   *
   * Cột số không ảnh hưởng: comparator numeric bóc `[^\d.-]` trước khi so.
   */
  const colValues = async (root: Page | Locator, colId: string) =>
    cells(root, colId).allTextContents()

  /**
   * Kiểm một cột sortable: click 1 → Asc, click 2 → Desc, mỗi lần assert thứ tự
   * theo ĐÚNG comparator app dùng cho cột đó.
   *
   * Assert ĐƠN ĐIỆU trên khung nhìn (không so bằng nhau với lần trước): khung
   * nhìn là một đoạn LIÊN TIẾP của danh sách đã sắp, nên đơn điệu là bất biến
   * đúng kể cả khi grid chỉ render 20/100 dòng.
   */
  const checkColumn = async (
    root: Page | Locator,
    opt: { name: string; label: string; colId: string; kind: Kind },
  ) => {
    const { name, label, colId, kind } = opt
    const h = header(root, label)
    await expect(h, `${name}: không thấy header sortable 「${label}」`).toHaveCount(1)

    await h.click()
    await expect(h, `${name}/${label}: click 1 phải là ascending`).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    const asc = await colValues(root, colId)
    const badAsc = await findOutOfOrder(page, asc, kind, false)
    expect(
      badAsc,
      `${name}/${label} (${kind}) ASC sai thứ tự tại dòng ${badAsc?.i}: ` +
        `"${badAsc?.prev}" đứng trước "${badAsc?.cur}". Khung nhìn: [${asc.slice(0, 10).join(' | ')}]`,
    ).toBeNull()

    await h.click()
    await expect(h, `${name}/${label}: click 2 phải là descending`).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    const desc = await colValues(root, colId)
    const badDesc = await findOutOfOrder(page, desc, kind, true)
    expect(
      badDesc,
      `${name}/${label} (${kind}) DESC sai thứ tự tại dòng ${badDesc?.i}: ` +
        `"${badDesc?.prev}" đứng trước "${badDesc?.cur}". Khung nhìn: [${desc.slice(0, 10).join(' | ')}]`,
    ).toBeNull()

    // Sort ĐƠN CỘT: trong CÙNG hàng header đó chỉ đúng 1 cột mang glyph.
    // Đếm theo `table-header-row` gần nhất chứ không theo cả root: một màn hình
    // (hoặc dialog 2 tab) có thể có nhiều grid, mỗi grid giữ sort riêng.
    const nonNone = await h.evaluate((el) => {
      const row = el.closest('[data-testid="table-header-row"]')
      if (!row) return -1
      return Array.from(row.querySelectorAll('[aria-sort]')).filter(
        (x) => x.getAttribute('aria-sort') !== 'none',
      ).length
    })
    expect(
      nonNone,
      `${name}/${label}: cùng lúc có ${nonNone} cột mang glyph — sort phải là ĐƠN CỘT`,
    ).toBe(1)

    console.log(`${name}/${label} (${kind}): asc [${asc.slice(0, 6).join(' | ')}] …`)
    // Cột mà mọi ô đều rỗng thì assert thứ tự luôn đúng — "pass" nhưng KHÔNG
    // kiểm được gì (thực tế: 処置名称 của 摘要記載事項一覧 rỗng toàn bộ). Nói ra để
    // không nhầm là đã có coverage (Rule 18: skip phải thấy được).
    if (asc.every((v) => v.trim() === '')) {
      console.log(`  ⚠️ ${name}/${label}: MỌI ô đều rỗng → assert thứ tự vô nghĩa, chưa kiểm được gì`)
    }
    // MỘT nhịp xem cho cả cột (trước đây 2 nhịp: sau asc và sau desc). Với 4 cột
    // × 5 dialog thì mỗi nhịp thừa là +2s (TEST_STEP_MS mặc định) — tắt hẳn bằng
    // TEST_STEP_MS=0 khi chỉ cần kết quả.
    await step()
  }

  /** Grid cần ≥2 dòng thì so thứ tự mới có nghĩa (Rule 10.6). */
  const enoughRows = async (root: Page | Locator, colId: string, name: string) => {
    const n = await cells(root, colId).count()
    if (n < 2) {
      console.log(`${name}: chỉ ${n} dòng → BỎ QUA phần assert thứ tự (đổi TEST_PAT_NO)`)
      return false
    }
    return true
  }

  /**
   * SanteiConfirm 「〜を算定しますか？」 bung ra khi grid nạp xong — thời điểm
   * không đoán được, và nó nuốt mọi click (Rule 14). Trả lời No để dọn màn
   * (Yes lại đẻ ra カルテ記載選択, Rule 14.1).
   *
   * CHỈ cắm SAU test カルテ記載選択 — test đó cần bấm Yes mới có dialog.
   */
  const installSanteiNo = async () => {
    if (santeiHandlerOn) return
    santeiHandlerOn = true
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
  }

  /**
   * Đóng mọi dialog đang mở — bản NHANH của `closeDialogs` dùng chung.
   *
   * Helper chung ngủ cứng 400/600ms mỗi vòng; ở đây chờ ĐÚNG lúc dialog biến mất
   * nên thường xong trong ~100ms.
   *
   * ⚠️ DỪNG KHI KHÔNG CÒN TIẾN TRIỂN. Bản trước cứ bắn F10 rồi
   * `waitFor(hidden, 3000).catch()` đủ `max` vòng: gặp dialog mà F10 KHÔNG đóng
   * được (đo được sau test 病名選択) là ăn trọn 6 × 3s = 18 GIÂY, chiếm hơn nửa
   * thời gian cả suite. Giờ đo bằng SỐ dialog: không giảm sau một lần F10 thì
   * dừng và dọn bằng `reload` (~1s, chắc chắn sạch) — nhưng chỉ MỘT lần, để
   * không rơi vào vòng lặp reload.
   */
  const closeAllDialogs = async (max = 6, allowReload = true) => {
    for (let i = 0; i < max; i++) {
      const ok = page.getByRole('button', { name: 'OK' })
      if (await ok.count()) {
        await ok.first().click()
        await ok
          .first()
          .waitFor({ state: 'hidden', timeout: 3000 })
          .catch(() => {})
        continue
      }
      const before = await dialog().count()
      if (!before) return

      // Phím đóng KHÔNG đồng nhất giữa các dialog:
      //   · phần lớn: F10 = 戻る
      //   · 病名選択 (disease-selection-dialog.tsx:432/438): F10 = 検索,
      //     F12 = 戻る (F11 = 戻る ở view drilldown サブコード)
      // KHÔNG Escape (ガイド処置選択 map Escape → F9 確定 = GHI DATA, Rule 10.4).
      // Bắn F10 trước, không giảm thì thử F12 — F12 chỉ tới FKeyBar của dialog
      // đang ở trên cùng (FKeyScope), không rơi xuống 12 メニュー của màn nền.
      const dropAfter = async (key: 'F10' | 'F12') => {
        await page.keyboard.press(key)
        return expect
          .poll(() => dialog().count(), { timeout: 2000, intervals: [100, 200, 300, 500] })
          .toBeLessThan(before)
          .then(() => true)
          .catch(() => false)
      }
      if (await dropAfter('F10')) continue
      if (await dropAfter('F12')) continue

      // Kẹt: nói RÕ dialog nào để lần sau sửa đúng chỗ thay vì tăng `max`.
      const stuck = (await dialog().first().innerText().catch(() => ''))
        .replace(/\s+/g, ' ')
        .slice(0, 60)
      if (!allowReload) {
        console.log(`closeAllDialogs: F10 không đóng được 「${stuck}」 → bỏ qua`)
        return
      }
      console.log(`closeAllDialogs: F10 không đóng được 「${stuck}」 → reload để dọn sạch`)
      moduleDied = false
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForApp(MOUNT_TIMEOUT)
      return
    }
  }

  /**
   * Chờ app MOUNT sau một lần `goto`, hoặc phát hiện SỚM là nó sẽ không bao giờ
   * mount. Trả 'mounted' | 'dead' | 'timeout'.
   *
   * ⚠️ NGUYÊN NHÂN CHÍNH LÀM SUITE ĐỎ KHI CHẠY NỀN (headless):
   * Vite dev server thỉnh thoảng trả `net::ERR_FAILED` cho MỘT module `/src/*.ts`
   * (đo được: `src/shared/components/fkey/index.ts`). Module đó hụt ⇒ React không
   * mount ⇒ `#root` RỖNG, ảnh chụp là trang trắng tinh, và mọi locator đều
   * "element(s) not found". Chờ bao lâu cũng vô ích — `goto` lại là hết.
   *
   * Chạy `--headed` ít dính hơn chỉ vì có `step()` xen giữa (mặc định 2s/nhịp)
   * nên các lần điều hướng thưa ra; chạy nền `TEST_STEP_MS=0` thì dồn dập hơn và
   * xác suất trúng cao hơn. Đây là flake của DEV SERVER, KHÔNG phải lỗi app —
   * chạy với BASE_URL trỏ vào bản build (`vite preview`) thì không gặp.
   *
   * Bắt bằng `requestfailed` thay vì ngồi chờ hết timeout: chỉ nhận ERR_FAILED
   * (ERR_ABORTED là chuyện thường khi điều hướng bỏ dở request cũ).
   */
  const waitForApp = async (ms: number): Promise<'mounted' | 'dead' | 'timeout'> => {
    // Module có thể chết NGAY trong lúc `goto` chưa trả về, tức trước khi
    // `waitForEvent` dưới đây kịp lắng nghe → cờ do listener thường trực ở
    // beforeAll ghi lại (reset ngay trước mỗi goto).
    if (moduleDied) return 'dead'
    const mounted = page
      .locator('#root > *')
      .first()
      .waitFor({ state: 'attached', timeout: ms })
      .then(() => 'mounted' as const)
      .catch(() => 'timeout' as const)
    const died = page
      .waitForEvent('requestfailed', {
        predicate: (r) =>
          r.failure()?.errorText === 'net::ERR_FAILED' && r.url().includes('/src/'),
        timeout: ms,
      })
      .then(() => 'dead' as const)
      .catch(() => 'timeout' as const)
    return Promise.race([mounted, died])
  }

  /**
   * Số lần thử nạp một màn. Cần >3: khi Vite đang RE-OPTIMIZE DEPS nó tự
   * full-reload và làm rớt hàng loạt module một lúc, nên hai lần đầu hỏng liên
   * tiếp là chuyện quan sát được.
   */
  const LOAD_ATTEMPTS = 4
  /** Mount xong là chuyện của ~1s; 20s đã quá rộng, hụt tức là trang trắng. */
  const MOUNT_TIMEOUT = 20_000
  /** Grid render sau khi mount — API chậm nhất cũng trong khoảng này. */
  const GRID_TIMEOUT = 30_000
  /**
   * Nghỉ giữa hai lần nạp khi lần trước chết vì module.
   *
   * KHÔNG phải chờ mù kiểu Rule 7: đây là BACKOFF có chủ đích. `goto` lại tức
   * thì trong lúc dev server đang re-optimize chỉ làm rớt tiếp — quan sát được ở
   * lần chạy có 12 module chết liên tiếp.
   */
  const RELOAD_BACKOFF_MS = 1000

  /**
   * Chờ một locator hiện, nhưng BỎ CUỘC NGAY nếu module chết giữa chừng.
   *
   * Trang có thể mount xong rồi mới chết (Vite re-optimize → full-reload nuốt
   * các module đang bay). Không có nhánh này thì lần thử cuối ngồi trọn
   * GRID_TIMEOUT rồi mới báo đỏ — đúng 30 giây vô ích đã đo được.
   */
  const waitVisibleOrDead = async (target: Locator, ms: number) => {
    if (moduleDied) return false
    const shown = target
      .waitFor({ state: 'visible', timeout: ms })
      .then(() => true)
      .catch(() => false)
    const died = page
      .waitForEvent('requestfailed', {
        predicate: (r) =>
          r.failure()?.errorText === 'net::ERR_FAILED' && r.url().includes('/src/'),
        timeout: ms,
      })
      .then(() => false)
      .catch(() => false)
    return Promise.race([shown, died])
  }

  /**
   * Vào màn 診療入力 và chờ grid 処置 render (cell 点 = cột index 3).
   *
   * TỐI ƯU 1 — ĐANG Ở ĐÚNG MÀN THÌ KHÔNG NẠP LẠI. File chạy serial trên cùng một
   * page, 5 test liên tiếp cùng dùng 患者 PAT_NO; mỗi `goto` là một lần Vite dev
   * dựng lại module graph (~10-20s). Vẫn chạy lẻ từng test được: chưa ở đúng màn
   * thì nó tự điều hướng. `isVisible()` ở đây là PHÉP DÒ TỨC THÌ có chủ đích
   * (không phải dùng nhầm nó để chờ như Rule 10.8 cảnh báo).
   *
   * TỐI ƯU 2 — nhánh 'No' KHÔNG chờ confirm nữa. Trước đây `waitFor(30s).catch()`
   * là 30 GIÂY CHẾT mỗi test khi confirm không bung (đã trả lời rồi, hoặc bệnh
   * nhân/ngày đó không sinh confirm). `addLocatorHandler` đã lo việc bấm No —
   * Playwright chạy handler trước MỖI actionability check, nên cứ đi tiếp.
   *
   * TỐI ƯU 3 — thứ tự chờ là MOUNT → GRID → CONFIRM, và trang trắng thì nạp lại
   * (xem waitForApp). Bản trước chờ confirm (15s mù) rồi mới chờ grid 60s, nên
   * một lần dev server nhả hụt module là mất 75s rồi ĐỎ; giờ phát hiện trong
   * ~1s và tự chữa. Chờ confirm SAU grid cũng đúng thực tế hơn: confirm chỉ bung
   * sau khi grid nạp xong.
   */
  const openEntryScreen = async (patNo: string, shoshin: 'Yes' | 'No') => {
    const gridCell = page.locator('[data-grid-cell$="|3"]').last()
    if (
      page.url().includes(`/treatments/${patNo}`) &&
      (await gridCell.isVisible().catch(() => false))
    ) {
      await closeAllDialogs()
      return
    }

    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
      moduleDied = false
      await page.goto(`/treatments/${patNo}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })

      const app = await waitForApp(MOUNT_TIMEOUT)
      if (app !== 'mounted') {
        console.log(
          `診療入力 ${patNo}: lần ${attempt}/${LOAD_ATTEMPTS} app không mount ` +
            `(${app === 'dead' ? 'Vite dev nhả hụt module /src/*.ts' : 'quá hạn'}) → nạp lại`,
        )
        await page.waitForTimeout(RELOAD_BACKOFF_MS)
        continue
      }

      if (!(await waitVisibleOrDead(gridCell, GRID_TIMEOUT))) {
        console.log(`診療入力 ${patNo}: lần ${attempt}/${LOAD_ATTEMPTS} grid không render → nạp lại`)
        await page.waitForTimeout(RELOAD_BACKOFF_MS)
        continue
      }

      if (shoshin === 'Yes') {
        // Chỉ test カルテ記載選択 cần bấm Yes (Yes → AutoSantei → queue 自動表示).
        // Confirm bung NGAY sau khi grid nạp xong; không bung trong 10s thì ngày
        // đó không sinh confirm — đi tiếp để nhánh skip ở test báo lý do tử tế.
        const yes = page.getByRole('button', { name: /^(Yes|はい)$/ })
        await yes
          .first()
          .waitFor({ state: 'visible', timeout: 10000 })
          .catch(() => {})
        if (await yes.count()) await yes.first().click()
      }
      return
    }

    throw new Error(
      `màn 診療入力 của 患者 ${patNo} không render grid sau ${LOAD_ATTEMPTS} lần nạp. ` +
        `Kiểm tra app còn sống không (curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — ` +
        '502 là dev server chết, KHÔNG phải lỗi test (GUIDELINE Rule 5).',
    )
  }

  /**
   * Vào một route rồi chờ grid. Trang trắng thì nạp lại (cùng cơ chế
   * MOUNT → GRID của openEntryScreen — xem waitForApp).
   *
   * Bản trước chờ mù 25s rồi mới reload; giờ phát hiện "app sẽ không mount" ngay
   * lúc module /src/*.ts chết, nên trường hợp xấu chỉ tốn ~1s thay vì 25s.
   */
  const gotoAndWaitGrid = async (url: string, what: string) => {
    // waitVisibleOrDead(), KHÔNG phải isVisible(): isVisible() kiểm tra TỨC THÌ,
    // truyền timeout vào nó gần như vô nghĩa (cùng họ bẫy count() ở Rule 10.8).
    const grid = page.getByTestId('virtual-scroll-container').first()

    for (let attempt = 1; attempt <= LOAD_ATTEMPTS; attempt++) {
      moduleDied = false
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      const app = await waitForApp(MOUNT_TIMEOUT)
      if (app !== 'mounted') {
        console.log(
          `${what}: lần ${attempt}/${LOAD_ATTEMPTS} app không mount ` +
            `(${app === 'dead' ? 'Vite dev nhả hụt module /src/*.ts' : 'quá hạn'}) → nạp lại`,
        )
        await page.waitForTimeout(RELOAD_BACKOFF_MS)
        continue
      }
      if (await waitVisibleOrDead(grid, GRID_TIMEOUT)) return
      console.log(`${what}: lần ${attempt}/${LOAD_ATTEMPTS} grid không render → nạp lại`)
      await page.waitForTimeout(RELOAD_BACKOFF_MS)
    }

    throw new Error(
      `${what}: ${url} không render grid sau ${LOAD_ATTEMPTS} lần nạp. Kiểm tra app còn sống không ` +
        `(curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — 502 là dev server chết, ` +
        `KHÔNG phải lỗi test (GUIDELINE Rule 5).`,
    )
  }

  test.beforeAll(async ({ browser }) => {
    // browser.newPage() KHÔNG kế thừa `use` của playwright.config.ts → truyền tay
    // baseURL + ignoreHTTPSErrors (cert tự ký) + locale (Rule 19).
    page = await browser.newPage({
      baseURL: BASE_URL,
      ignoreHTTPSErrors: true,
      locale: 'ja-JP',
      viewport: {
        width: Number(process.env.TEST_VIEWPORT_W ?? 1600),
        height: Number(process.env.TEST_VIEWPORT_H ?? 1000),
      },
    })
    step = makeStep(page)

    // App crash → trang trắng → mọi test chỉ báo "element(s) not found". Log lỗi
    // JS ra để phân biệt "selector sai" với "app chết".
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // Cắm SỚM (trước mọi goto) để không bỏ sót module chết ngay lúc điều hướng.
    // Chỉ ERR_FAILED mới tính: ERR_ABORTED là chuyện thường khi rời trang giữa
    // chừng, đếm cả nó vào sẽ nạp lại oan.
    page.on('requestfailed', (r) => {
      if (r.failure()?.errorText === 'net::ERR_FAILED' && r.url().includes('/src/')) {
        moduleDied = true
        console.log(`Vite dev nhả hụt module: ${r.url().replace(BASE_URL, '/')}`)
      }
    })

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(
      page,
      'login không vào được — nếu chạy lại nhiều lần thì đang dính rate-limit, ' +
        'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
    ).toHaveURL(/\/$/)
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. カルテ記載選択 (frm203012 自動表示) — 4 cột + rule 6b cột 選択番号
  //    PHẢI chạy ĐẦU TIÊN: cần bấm Yes ở confirm 歯科初診料 để AutoSantei chạy
  //    và sinh queue 自動表示. Các test sau cắm handler tự bấm No.
  // ═══════════════════════════════════════════════════════════════════════════
  test('カルテ記載選択 — sort 4 cột + 選択番号 dính theo dòng (rule 6b)', async () => {
    test.setTimeout(180_000)
    await openEntryScreen(AUTO_PAT_NO, 'Yes')

    // Dialog bật vài giây sau khi trả lời confirm; 15s là rộng rãi. Đừng để 25s
    // "cho chắc" — ngày bẩn thì đó là 25 giây chết trước một cái skip chắc chắn.
    const picker = page.getByText('カルテ記載選択')
    await picker
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {})

    if (!(await picker.count())) {
      // Phân biệt DỮ LIỆU BẨN với APP HỎNG: dòng 処置 tháng hiện tại đều có cell
      // 点 (RegiCol.ten = 3) mang số. Có số ⇒ ngày đã có 処置 ⇒ AutoSantei không
      // chạy ⇒ dialog không bao giờ bật. Đó không phải bug → SKIP, đừng đánh đỏ
      // và đừng chặn các test còn lại của file.
      const dayHasData = await page
        .locator('[data-grid-cell$="|3"]')
        .filter({ hasText: /\d/ })
        .count()
      test.skip(
        dayHasData > 0,
        `(患者 ${AUTO_PAT_NO}, ngày ${TRT_DT}) đã có ${dayHasData} dòng 処置 → AutoSantei ` +
          `không chạy → カルテ記載選択 không tự bật. Chạy lại với ` +
          `TEST_AUTO_PAT_NO=<bệnh nhân khác> hoặc TEST_TRT_DT=<ngày trong THÁNG hiện tại chưa nhập gì>.`,
      )
      await expect(
        picker,
        `ngày ${TRT_DT} sạch mà カルテ記載選択 vẫn không bật → nghi app/BE`,
      ).toBeVisible({ timeout: 10000 })
    }

    const d = dialog().filter({ hasText: 'カルテ記載選択' })
    await expect(cells(d, 'cmtNm').first()).toBeVisible({ timeout: 20000 })
    await step()

    // Mở lần đầu = chưa sort (WinForm rule 3).
    await expectNoSortGlyph(d, 'カルテ記載選択 (lần mở đầu)')

    if (await enoughRows(d, 'cmtNm', 'カルテ記載選択')) {
      // Bản đồ カルテコメント → 選択番号 ở thứ tự BE, để kiểm rule 6b bên dưới.
      const beNo = await colValues(d, 'dispNo')
      const beNm = await colValues(d, 'cmtNm')
      const noOf = new Map<string, string>()
      beNm.forEach((nm, i) => noOf.set(nm, beNo[i] ?? ''))

      await checkColumn(d, { name: 'カルテ記載選択', label: 'コード', colId: 'cmtCd', kind: 'numeric' })
      await checkColumn(d, { name: 'カルテ記載選択', label: '枝番', colId: 'cmtSb', kind: 'numeric' })
      await checkColumn(d, {
        name: 'カルテ記載選択',
        label: 'カルテコメント',
        colId: 'cmtNm',
        kind: 'text',
      })

      // ── rule 6b — phần THẬT SỰ kiểm được ────────────────────────────────
      // 選択番号 hiển thị `originalIndex + 1` nên LUÔN liên tục 1..n ⇒ "Asc là
      // no-op" nhìn y hệt "asc sort đúng", không phân biệt được. Cái phân biệt
      // được là: sort cột KHÁC thì 選択番号 phải ĐI THEO DÒNG (nếu factory đánh
      // số theo vị trí hiển thị thì nó sẽ thành 1,2,3… sau mỗi lần sort).
      const afterNo = await colValues(d, 'dispNo')
      const afterNm = await colValues(d, 'cmtNm')
      const drift: string[] = []
      let overlap = 0
      afterNm.forEach((nm, i) => {
        const want = noOf.get(nm)
        if (want === undefined) return // dòng này không có trong khung nhìn đầu
        overlap++
        if ((afterNo[i] ?? '') !== want) drift.push(`"${nm}": ${want} → ${afterNo[i]}`)
      })
      expect(
        drift,
        `選択番号 KHÔNG dính theo dòng sau khi sort cột khác — nghi đang đánh số theo ` +
          `vị trí hiển thị. Lệch: ${drift.join('; ')}`,
      ).toEqual([])
      console.log(`カルテ記載選択: 選択番号 dính đúng theo dòng trên ${overlap} dòng đối chiếu được`)

      // Asc = no-op → khung nhìn về đúng thứ tự BE ban đầu (đang ở đầu list,
      // chưa cuộn bao giờ, nên khung nhìn = n dòng đầu).
      const dispHeader = header(d, '選択番号')
      await dispHeader.click()
      await expect(dispHeader).toHaveAttribute('aria-sort', 'ascending')
      await step()
      expect(
        await colValues(d, 'dispNo'),
        'rule 6b: Asc của 選択番号 phải là NO-OP (giữ nguyên thứ tự BE)',
      ).toEqual(beNo)

      // Desc = đảo theo originalIndex. KHÔNG so với reverse(beNo): grid
      // virtualized, sau Desc khung nhìn là ĐUÔI danh sách. Bất biến đúng:
      // giảm nghiêm ngặt và bắt đầu từ giá trị ≥ max của khung nhìn ban đầu.
      await dispHeader.click()
      await expect(dispHeader).toHaveAttribute('aria-sort', 'descending')
      await step()
      const descNo = (await colValues(d, 'dispNo')).map(Number)
      expect(
        descNo.every((n, i) => i === 0 || n < (descNo[i - 1] ?? Infinity)),
        `rule 6b: Desc của 選択番号 phải giảm nghiêm ngặt, đang là [${descNo.join(', ')}]`,
      ).toBe(true)
      expect(
        descNo[0] ?? 0,
        'rule 6b: Desc phải bắt đầu từ ĐUÔI danh sách BE (số lớn nhất)',
      ).toBeGreaterThanOrEqual(Math.max(...beNo.map(Number)))

      // Click 3 quay lại Asc, KHÔNG về "chưa sort" — enableSortingRemoval=false.
      await dispHeader.click()
      await expect(
        dispHeader,
        'click 3 phải quay lại ascending (virtual-list-table đặt enableSortingRemoval=false)',
      ).toHaveAttribute('aria-sort', 'ascending')
      expect(await colValues(d, 'dispNo'), 'click 3 (Asc no-op) phải về thứ tự BE').toEqual(beNo)
    }

    // Đóng bằng F10 (= 戻る, không ghi gì). KHÔNG dùng nút 戻る của màn nền
    // (Rule 10.3) — dialog này cũng không map Escape.
    await closeAllDialogs()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ガイド処置選択 (frm203017)
  // ═══════════════════════════════════════════════════════════════════════════
  test('ガイド処置選択 — sort 4 cột, 回数 không sort được', async () => {
    test.setTimeout(180_000)
    await installSanteiNo()
    await openEntryScreen(PAT_NO, 'No')
    await closeAllDialogs()

    await page.getByRole('button', { name: 'ガイド', exact: true }).click()
    // Không bấm 全て表示 thì list ガイド rỗng (Rule 10.7).
    await page.getByRole('button', { name: '全て表示' }).click()

    const guideRows = page.locator('div[class*="grid-cols-[40px_1fr]"]')
    await expect(guideRows.nth(2)).toBeVisible({ timeout: 30000 })
    await step()

    // Tự dò ガイド đầu tiên có ≥2 dòng — nhiều ガイド chỉ 1 dòng hoặc 該当なし
    // (Rule 10.6). Row single-click là mở dialog (treatment-side-panel.tsx:848).
    const d = dialog().filter({ hasText: 'ガイド処置選択' })
    const total = Math.min(await guideRows.count(), 12)
    let opened = ''
    for (let i = 1; i < total; i++) {
      const label = (await guideRows.nth(i).innerText()).replace(/\n/g, ' ').trim()
      await guideRows.nth(i).click()
      await expect(d).toBeVisible({ timeout: 20000 })
      // Chờ CẢ HAI kết cục: có dòng, HOẶC empty-state 「該当なし」. Bản trước chỉ
      // chờ dòng đầu rồi `.catch()` nuốt timeout ⇒ mỗi ガイド rỗng là 8 GIÂY CHẾT.
      await expect(cells(d, 'trtNm').first().or(emptyState(d)).first()).toBeVisible({
        timeout: 10000,
      })
      if ((await cells(d, 'trtNm').count()) >= 2) {
        opened = label
        break
      }
      // F10 = 戻る. KHÔNG Escape: dialog này map Escape → F9 確定 (GHI DATA,
      // Rule 10.4). KHÔNG click nút 戻る của màn nền (Rule 10.3).
      await page.keyboard.press('F10')
      await expect(d).toBeHidden({ timeout: 10000 })
    }
    expect(opened, 'không tìm thấy ガイド nào có ≥2 dòng để test sort').not.toBe('')
    console.log(`Test sort trên ガイド: ${opened}`)
    await step()

    await expectNoSortGlyph(d, 'ガイド処置選択 (lần mở đầu)')
    await checkColumn(d, { name: 'ガイド処置選択', label: 'コード', colId: 'trtCd', kind: 'numeric' })
    await checkColumn(d, { name: 'ガイド処置選択', label: '枝番', colId: 'trtSb', kind: 'numeric' })
    await checkColumn(d, { name: 'ガイド処置選択', label: '点数', colId: 'score', kind: 'numeric' })
    await checkColumn(d, { name: 'ガイド処置選択', label: '処置名称', colId: 'trtNm', kind: 'text' })

    // 回数 là ô input → enableSorting:false → KHÔNG có role=button (WinForm
    // SortMode = NotSortable).
    await expect(
      header(d, '回数'),
      '回数 phải KHÔNG sort được (ô input, cnt-cell.tsx enableSorting:false)',
    ).toHaveCount(0)

    await page.keyboard.press('F10')
    await expect(d).toBeHidden({ timeout: 10000 })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. パック処置選択 (frm203014) — anh em sinh đôi của ガイド (chung cnt-cell)
  // ═══════════════════════════════════════════════════════════════════════════
  test('パック処置選択 — sort 4 cột, 回数 không sort được', async () => {
    test.setTimeout(180_000)
    await installSanteiNo()
    await openEntryScreen(PAT_NO, 'No')
    await closeAllDialogs()

    // Khác ガイド: KHÔNG cần 全て表示, list パック tự load.
    await page.getByRole('button', { name: 'パック', exact: true }).click()
    const packRows = page.locator('div[class*="grid-cols-[35px_1fr]"]')
    await expect(packRows.nth(2)).toBeVisible({ timeout: 30000 })
    await step()

    const d = dialog().filter({ hasText: 'パック処置選択' })
    // Click 1 パック ra 1 trong 2 kết quả — phải chờ CẢ HAI:
    //   a) picker mở, hoặc
    //   b) alert 「算定可能な処置はありません。」 (pack-selection-dialog.tsx:140)
    //      → パック này không tính được cho bệnh nhân/ngày hiện tại, bấm OK rồi thử tiếp.
    const noTrtAlert = page.getByText('算定可能な処置はありません')
    const total = Math.min(await packRows.count(), 16)
    let opened = ''
    for (let i = 1; i < total; i++) {
      const label = (await packRows.nth(i).innerText()).replace(/\n/g, ' ').trim()
      await packRows.nth(i).click()
      await expect(d.or(noTrtAlert).first()).toBeVisible({ timeout: 20000 })
      if (await noTrtAlert.count()) {
        await page.getByRole('button', { name: 'OK' }).click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
        continue
      }
      // Có dòng HOẶC empty-state — không chờ mù 8s cho パック rỗng (xem ガイド).
      await expect(cells(d, 'trtNm').first().or(emptyState(d)).first()).toBeVisible({
        timeout: 10000,
      })
      if ((await cells(d, 'trtNm').count()) >= 2) {
        opened = label
        break
      }
      await page.keyboard.press('F10')
      await expect(d).toBeHidden({ timeout: 10000 })
    }
    expect(opened, 'không tìm thấy パック nào có ≥2 dòng để test sort').not.toBe('')
    console.log(`Test sort trên パック: ${opened}`)
    await step()

    await expectNoSortGlyph(d, 'パック処置選択 (lần mở đầu)')
    await checkColumn(d, { name: 'パック処置選択', label: 'コード', colId: 'trtCd', kind: 'numeric' })
    await checkColumn(d, { name: 'パック処置選択', label: '枝番', colId: 'trtSb', kind: 'numeric' })
    await checkColumn(d, { name: 'パック処置選択', label: '点数', colId: 'score', kind: 'numeric' })
    await checkColumn(d, { name: 'パック処置選択', label: '処置名称', colId: 'trtNm', kind: 'text' })
    await expect(header(d, '回数'), '回数 phải KHÔNG sort được').toHaveCount(0)

    await page.keyboard.press('F10')
    await expect(d).toBeHidden({ timeout: 10000 })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. 摘要欄記載選択 (F7) — 2 TAB / 2 grid độc lập, cột 区分 sort kiểu 'word',
  //    và reset() khi đóng dialog.
  // ═══════════════════════════════════════════════════════════════════════════
  test('摘要欄記載選択 (F7) — 2 grid độc lập, 区分 word-sort, reset khi đóng/mở', async () => {
    test.setTimeout(240_000)
    await installSanteiNo()
    await openEntryScreen(PAT_NO, 'No')
    await closeAllDialogs()

    // Title là 「摘 要 欄 記 載 選 択」 — CHỮ GIÃN BẰNG SPACE THẬT trong source
    // (TITLE.summary), nên KHÔNG match bằng getByText('摘要欄記載選択') (Rule 13.1).
    // Nhận diện bằng tên tab nằm trong body.
    await page.keyboard.press('F7')
    const d = dialog().filter({ hasText: '摘要コメント一覧' })
    await expect(d, 'F7 không mở được 摘要欄記載選択').toBeVisible({ timeout: 20000 })
    await expect(cells(d, 'dispNo').first()).toBeVisible({ timeout: 15000 })
    await step()

    await expectNoSortGlyph(d, '摘要欄記載選択 (lần mở đầu)')
    const beNo = await colValues(d, 'dispNo')

    if (await enoughRows(d, 'dispNo', '摘要欄記載選択/コメント')) {
      await checkColumn(d, {
        name: '摘要欄記載選択/コメント',
        label: 'コード',
        colId: 'cmtCd',
        kind: 'numeric',
      })
      await checkColumn(d, {
        name: '摘要欄記載選択/コメント',
        label: '摘要コメント',
        colId: 'comment',
        kind: 'text',
      })
    }

    // ── Tab 摘要記載事項一覧: 区分 dùng comparator 'word' (packCd = 'M041-2'…)
    // Đây là chỗ spec cũ sai nặng nhất nếu đem numeric ra so.
    const entryTab = d.getByRole('button', { name: '摘要記載事項一覧' })
    await entryTab.click()
    await expect(cells(d, 'packNm').first()).toBeVisible({ timeout: 15000 })
    await step()

    // Grid パック KHÔNG có cột 選択番号 → rule 6b không được "lây" sang.
    await expect(
      header(d, '選択番号'),
      'grid 摘要記載事項一覧 KHÔNG được có cột 選択番号 (rule 6b chỉ dành cho grid コメント)',
    ).toHaveCount(0)

    if (await enoughRows(d, 'packCd', '摘要欄記載選択/記載事項')) {
      await checkColumn(d, {
        name: '摘要欄記載選択/記載事項',
        label: '区分',
        colId: 'packCd',
        kind: 'word',
      })
      await checkColumn(d, {
        name: '摘要欄記載選択/記載事項',
        label: '処置名称',
        colId: 'trtNm',
        kind: 'text',
      })
    }

    // ── 2 grid có state sort ĐỘC LẬP, và đổi tab KHÔNG reset (reset chỉ chạy
    //    lúc dialog đóng — summary-column-entry-dialog.tsx:389).
    await d.getByRole('button', { name: '摘要コメント一覧' }).click()
    await expect(cells(d, 'dispNo').first()).toBeVisible({ timeout: 15000 })
    const stillSorted = await header(d, '摘要コメント').getAttribute('aria-sort')
    expect(
      stillSorted,
      'đổi tab rồi quay lại: grid コメント phải GIỮ sort cũ (reset chỉ chạy khi đóng dialog)',
    ).toBe('descending')
    await step()

    // ── Đóng → mở lại: sạch glyph + về thứ tự BE (WinForm rule 3).
    await page.keyboard.press('F10')
    await expect(d).toBeHidden({ timeout: 10000 })
    await page.keyboard.press('F7')
    await expect(d).toBeVisible({ timeout: 20000 })
    await expect(cells(d, 'dispNo').first()).toBeVisible({ timeout: 15000 })
    await step()

    await expectNoSortGlyph(d, '摘要欄記載選択 (mở lại)')
    expect(
      await colValues(d, 'dispNo'),
      'mở lại 摘要欄記載選択 phải về thứ tự BE ban đầu (reset() lúc đóng)',
    ).toEqual(beNo)

    await closeAllDialogs()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. 薬剤選択 (Shift+F6) — コード là 'word' (KHÔNG phải numeric), sạch nhờ remount
  // ═══════════════════════════════════════════════════════════════════════════
  test('薬剤選択 (Shift+F6) — コード word-sort, sạch sort nhờ remount bằng key', async () => {
    test.setTimeout(180_000)
    await installSanteiNo()
    await openEntryScreen(PAT_NO, 'No')
    await closeAllDialogs()

    // Title 「薬 剤 選 択」 giãn bằng SPACE THẬT trong source → phải match bằng
    // regex có \s* (Rule 13.1), getByText('薬剤選択') sẽ trượt.
    await page.keyboard.press('Shift+F6')
    const d = dialog().filter({ hasText: /薬\s*剤\s*選\s*択/ })
    await expect(d, 'Shift+F6 không mở được 薬剤選択').toBeVisible({ timeout: 20000 })
    // Có dòng HOẶC empty-state 「該当なし」 — list 薬剤 rỗng thì biết ngay, không
    // đứng chờ mù 15s rồi mới log BỎ QUA.
    await expect(cells(d, 'trtNm').first().or(emptyState(d)).first()).toBeVisible({
      timeout: 15000,
    })

    if (!(await cells(d, 'trtNm').count())) {
      console.log('薬剤選択: list 薬剤 rỗng → BỎ QUA (không có gì để sort)')
      await closeAllDialogs()
      return
    }
    await step()

    await expectNoSortGlyph(d, '薬剤選択 (lần mở đầu)')
    const beOrder = await colValues(d, 'trtNm')

    if (await enoughRows(d, 'trtNm', '薬剤選択')) {
      // medicine-selection-dialog.tsx:83 — trtCd: 'word'. Mã thuốc có chữ + số
      // + gạch nối, so numeric là sai bản chất.
      await checkColumn(d, { name: '薬剤選択', label: 'コード', colId: 'trtCd', kind: 'word' })
      await checkColumn(d, { name: '薬剤選択', label: '番号', colId: 'rowNo', kind: 'numeric' })
      await checkColumn(d, { name: '薬剤選択', label: '点数', colId: 'score1', kind: 'numeric' })
      await checkColumn(d, { name: '薬剤選択', label: '名称', colId: 'trtNm', kind: 'text' })
    }

    // Dialog này KHÔNG gọi reset(): parent truyền key={open?'open':'closed'} nên
    // component remount, state tự mới. Test bắt được nếu refactor gỡ mất key đó.
    await closeAllDialogs()
    await page.keyboard.press('Shift+F6')
    await expect(d).toBeVisible({ timeout: 20000 })
    await expect(cells(d, 'trtNm').first()).toBeVisible({ timeout: 15000 })
    await step()

    await expectNoSortGlyph(d, '薬剤選択 (mở lại — remount bằng key)')
    expect(
      await colValues(d, 'trtNm'),
      'mở lại 薬剤選択 không về thứ tự BE → nghi key remount đã bị gỡ',
    ).toEqual(beOrder)

    await closeAllDialogs()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. 病名選択 — cột 選択番号 sort BÌNH THƯỜNG (đối chứng: rule 6b không lây)
  // ═══════════════════════════════════════════════════════════════════════════
  test('病名選択 — 選択番号 sort bình thường (dspCd là giá trị BE, không phải rule 6b)', async () => {
    test.setTimeout(180_000)
    await installSanteiNo()
    await openEntryScreen(PAT_NO, 'No')
    await closeAllDialogs()

    // Đường tới 病名選択 phụ thuộc dữ liệu (panel 病検 phải có dòng) → mọi nhánh
    // hụt đều LOG rõ rồi bỏ qua, không đánh đỏ (Rule 18).
    await page
      .getByRole('button', { name: '病検', exact: true })
      .click()
      .catch(() => {})
    const changeBtn = page.getByRole('button', { name: '変更', exact: true })
    if (!(await changeBtn.count())) {
      console.log('病名選択: không thấy nút 変更 → BỎ QUA')
      return
    }
    await changeBtn.click()
    const byoRows = page.locator('div[class*="grid-cols-[30px_270px_1fr]"]')
    if (!(await byoRows.nth(1).count())) {
      console.log('病名選択: panel 病検 chưa có dòng nào → BỎ QUA')
      return
    }
    await byoRows.nth(1).click()

    // Hai chỗ dưới là CHỜ MÙ trên nhánh bỏ qua (dialog không mở thì phải đợi hết
    // timeout mới biết). Dialog nào mở được thì mở trong ~1s, nên để 8s: đủ rộng
    // cho dev server ấm, mà nhánh hụt không còn ngốn 15s + 20s như trước.
    const SKIP_PROBE_TIMEOUT = 8000

    const toothTitle = page.getByText(/部\s*位\s*選\s*択/)
    await toothTitle.waitFor({ state: 'visible', timeout: SKIP_PROBE_TIMEOUT }).catch(() => {})
    if (!(await toothTitle.count())) {
      console.log('病名選択: không mở được 部位選択 → BỎ QUA')
      return
    }
    await page.keyboard.press('End')

    const d = dialog().filter({ hasText: /病\s*名\s*選\s*択/ })
    await d
      .first()
      .waitFor({ state: 'visible', timeout: SKIP_PROBE_TIMEOUT })
      .catch(() => {})
    if (!(await d.count())) {
      console.log('病名選択: không mở được dialog → BỎ QUA')
      await closeAllDialogs()
      return
    }
    await expect(cells(d, 'dspCd').first()).toBeVisible({ timeout: 15000 })
    await step()

    if (await enoughRows(d, 'dspCd', '病名選択')) {
      const before = await colValues(d, 'dspCd')
      // dspCd là giá trị THẬT của BE (không phải index suy ra) ⇒ dialog này
      // KHÔNG khai dispNoField ⇒ Asc phải sắp thật, không phải no-op.
      await checkColumn(d, { name: '病名選択', label: '選択番号', colId: 'dspCd', kind: 'numeric' })
      const after = await colValues(d, 'dspCd')
      console.log(
        `病名選択/選択番号: asc ${JSON.stringify(before) === JSON.stringify(after) ? 'KHÔNG đổi thứ tự (nghi bị áp nhầm rule 6b)' : 'ĐÃ đổi thứ tự (đúng)'}`,
      )
    }
    await closeAllDialogs()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. 受付患者一覧 + 当月来患集計 (F3) — list LUÔN MOUNT vs dialog
  // ═══════════════════════════════════════════════════════════════════════════
  test('受付患者一覧 — sort sống sót qua poll 30s; 当月来患集計 reset khi đóng/mở', async () => {
    test.setTimeout(240_000)
    await installSanteiNo()
    await gotoAndWaitGrid('/treatments', '受付患者一覧')
    await step()

    if ((await rows(page).count()) > 1) {
      // CHỈ assert 患者番号: cột hiển thị = khoá sort (numeric).
      // 氏名 sort theo `knSort` (số 五十音順 của BE, KHÔNG hiện ra) và 待ち時間
      // hiển thị "1時間30分" nhưng sort theo số phút → assert theo text là sai.
      await checkColumn(page, {
        name: '受付患者一覧',
        label: '患者番号',
        colId: 'patNo',
        kind: 'numeric',
      })

      // Rủi ro thật của list luôn mount: một lần refetch thay nguyên mảng `rows`
      // → nếu hook reset sort theo "rows đổi" thì user mất sort mỗi 30s
      // (wait-list-queries.ts refetchInterval: 30_000).
      //
      // KHÔNG ngồi chờ hết 30s: ÉP refetch ngay bằng một nhịp offline→online.
      // createQueryClient đặt `refetchOnReconnect: true` (và
      // `refetchOnWindowFocus: false`, nên trò dispatch focus vô dụng), nên
      // onlineManager bắn refetch tức thì — CÙNG một đường code với poll: query
      // trả mảng mới, `useClientSort` nhận `rows` mới. Vẫn chờ response thật để
      // chắc chắn có refetch, và timeout đủ rộng để nếu reconnect không kích
      // được thì nhịp poll 30s tự nhiên vẫn cứu.
      const refetched = page.waitForResponse(
        (r) => r.url().includes('/tenant/treatment/wait-list'),
        { timeout: 45000 },
      )
      await page.context().setOffline(true)
      await page.context().setOffline(false)
      await refetched
      const h = header(page, '患者番号')
      await expect(
        h,
        '受付患者一覧: sort BỊ MẤT sau khi poll 30s refetch — list luôn mount không được reset theo rows',
      ).toHaveAttribute('aria-sort', 'descending')
      const after = await colValues(page, 'patNo')
      const bad = await findOutOfOrder(page, after, 'numeric', true)
      expect(bad, `受付患者一覧: sau poll thứ tự hỏng tại dòng ${bad?.i}`).toBeNull()
      console.log('受付患者一覧: sort giữ nguyên qua một nhịp poll 30s')
    } else {
      console.log('受付患者一覧: <2 dòng → BỎ QUA phần sort')
    }
    await step()

    // 当月来患集計 (F3) — là dialog nên PHẢI reset khi đóng/mở (unvisited-total
    // -dialog.tsx gọi reset() ở nhánh open→false). Title 「来 患 集 計」 giãn bằng
    // space thật → match regex có \s* (Rule 13.1).
    await page.keyboard.press('F3')
    const d = dialog().filter({ hasText: /来\s*患\s*集\s*計/ })
    await d
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {})
    if (!(await d.count())) {
      console.log('F3 không mở được 当月来患集計 → BỎ QUA')
      return
    }
    await expect(cells(d, 'count').first()).toBeVisible({ timeout: 15000 })
    const beOrder = await colValues(d, 'count')
    await step()

    const h = header(d, '人数')
    if (!(await h.count())) {
      console.log('当月来患集計: không có header 人数 → BỎ QUA')
      await closeAllDialogs()
      return
    }
    await h.click()
    await expect(h).toHaveAttribute('aria-sort', 'ascending')
    await step()

    await closeAllDialogs()
    await page.keyboard.press('F3')
    await expect(d).toBeVisible({ timeout: 20000 })
    await expect(cells(d, 'count').first()).toBeVisible({ timeout: 15000 })
    await expectNoSortGlyph(d, '当月来患集計 (mở lại)')
    expect(await colValues(d, 'count'), '当月来患集計 mở lại phải về thứ tự BE').toEqual(beOrder)
    await closeAllDialogs()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. 未精算患者一覧 — số hiển thị CÓ DẤU PHẨY, và đổi mode
  // ═══════════════════════════════════════════════════════════════════════════
  test('未精算患者一覧 — sort 点数 (số có dấu phẩy) + đổi mode', async () => {
    test.setTimeout(180_000)
    await gotoAndWaitGrid('/counter-payments', '未精算患者一覧')
    await step()

    if ((await rows(page).count()) <= 1) {
      console.log('未精算患者一覧: <2 dòng → BỎ QUA')
      return
    }

    // 点数 hiển thị qua toLocaleString ("1,234") → comparator numeric của test
    // bóc `[^\d.-]` trước khi so, giống Number() ở app đọc thẳng field `score`.
    // KHÔNG assert 氏名 (knSort) và 生年月日 (patBirthDt, hiển thị 和暦).
    await checkColumn(page, { name: '未精算患者一覧', label: '点数', colId: 'points', kind: 'numeric' })

    // Đổi mode bằng F1 — nó TOGGLE (counter-payment-page.tsx: mode === 'search'
    // ? switchToUnpaidMode() : switchToSearchMode()). KHÔNG click nút 「検索」:
    // nút đó nằm trong ≪患者検索条件≫ và đang disabled ở mode 未精算 → click treo
    // đủ 15s rồi timeout (đã dính).
    //
    // Mốc chờ TẤT ĐỊNH thay cho sleep 1.5s (Rule 7): nhãn của chính nút F1 lật
    // theo mode — `mode === 'search' ? '未精算患者' : '患者検索'`
    // (counter-payment-page.tsx:278). Thấy nhãn mới là mode đã đổi xong.
    const fkey1 = (label: string) => page.getByRole('button', { name: label }).first()
    await page.keyboard.press('F1') // 未精算 → 検索
    await expect(fkey1('未精算患者'), 'F1 lần 1 không chuyển sang mode 検索').toBeVisible({
      timeout: 15000,
    })
    await page.keyboard.press('F1') // 検索 → 未精算
    await expect(fkey1('患者検索'), 'F1 lần 2 không quay lại mode 未精算').toBeVisible({
      timeout: 15000,
    })
    await step()

    // Code hiện tại chỉ bump `unpaidResetSeq` (cuộn về đầu), KHÔNG reset sort →
    // kỳ vọng glyph vẫn còn. Chưa đối chiếu được WinForm nên GHI NHẬN, không
    // assert đúng/sai (Rule 15: assert cái app cam kết, log cái chưa chắc).
    const after = await header(page, '点数').getAttribute('aria-sort')
    console.log(
      `未精算患者一覧 sau F1 x2 (đổi mode 2 lần): aria-sort="${after}" ` +
        `(code chỉ bump unpaidResetSeq = cuộn về đầu, không reset sort → kỳ vọng "descending"; ` +
        `cần đối chiếu WinForm xem có đúng không)`,
    )
  })
})
