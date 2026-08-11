/**
 * Helper dùng chung cho mọi spec trouble-2 (regression facade `ClientListTable`).
 *
 * Mọi locator nhận `root` — KHÔNG bao giờ dùng thẳng `page`. Khi một dialog grid
 * mở, grid của màn hình nền vẫn nằm trong DOM → nhiều `virtual-scroll-container`
 * cùng lúc → Playwright ném "strict mode violation" (GUIDELINE Rule 10).
 */
import { expect, type Locator, type Page } from '@playwright/test'

export type Root = Page | Locator

export const scroller = (root: Root) => root.getByTestId('virtual-scroll-container')
export const rows = (root: Root) => root.locator('[data-testid^="row-"]')
export const skeletons = (root: Root) => root.locator('[data-testid^="skeleton-"]')
export const emptyState = (root: Root) => root.getByTestId('empty-state')
export const cells = (root: Root, colId: string) => root.getByTestId(`cell-${colId}`)
export const header = (root: Root, label: string) =>
  root.getByRole('button', { name: new RegExp(`^${label}\\s*[▲▼]?$`) })

/**
 * TC-1 + TC-5 cho một grid client-side.
 *
 * Điểm mấu chốt của trouble-2: các grid ở mục 2.B là MẢNG CLIENT, `getRow` luôn
 * resolve ngay ⇒ **không được có dòng skeleton nào**. Facade tính `count` sai
 * hoặc trả `undefined` sẽ lòi skeleton ra — đó là chuông báo vỡ.
 *
 * @returns số dòng (0 = đã đi nhánh empty TC-5)
 */
export async function expectClientGrid(root: Root, name: string, colId: string) {
  await expect(scroller(root), `${name}: grid không render`).toBeVisible({ timeout: 30000 })
  await expect(rows(root).first().or(emptyState(root))).toBeVisible({ timeout: 30000 })

  const rowCount = await rows(root).count()
  if (rowCount === 0) {
    await expect(emptyState(root), `${name}: list rỗng mà không hiện emptyText`).toBeVisible()
    await expect(skeletons(root), `${name}: list rỗng mà vẫn render skeleton`).toHaveCount(0)
    console.log(`${name}: 0 dòng → nhánh empty (TC-5). TC-1/TC-3 CHƯA được kiểm.`)
    return 0
  }

  await expect(
    skeletons(root),
    `${name}: có skeleton row — grid client-side lẽ ra resolve ngay, nghi count/getRow sai`,
  ).toHaveCount(0)

  expect(await cells(root, colId).count(), `${name}: số cell ${colId} ≠ số dòng`).toBe(rowCount)

  const first = (await cells(root, colId).first().innerText()).trim()
  expect(first, `${name}: dòng đầu rỗng`).not.toBe('')

  console.log(`${name}: ${rowCount} dòng, dòng đầu ${colId}="${first}"`)
  return rowCount
}

/**
 * TC-3 — sort một cột rồi kiểm hành vi của GRID (không phán xét quy tắc sắp xếp).
 *
 * Với cột SỐ (`numeric=true`) thì thứ tự tăng dần là bất biến rõ ràng, assert được.
 *
 * Với cột TEXT thì KHÔNG assert collation. Comparator của app (useClientSort) xử
 * lý ký tự đặc biệt (，＋→) khác `Intl.Collator('ja')`, và đó không phải lỗi —
 * bản trước áp Intl vào nên fail oan ở 病名選択. Quan trọng hơn: trouble-2 là
 * REGRESSION BASELINE cho refactor facade, việc của nó là chốt hành vi hiện tại
 * chứ không phải định nghĩa thứ tự nào mới đúng.
 *
 * Thay vào đó assert những bất biến mà facade THẬT SỰ có thể phá:
 *   - sort không được làm mất / nhân bản dòng (đa tập giá trị giữ nguyên)
 *   - sort phải đổi trạng thái aria-sort
 *   - sort xong grid cuộn về đầu (resetScrollSeq)
 *   - sort xong không được sinh skeleton (mảng client luôn resolve ngay)
 * và LOG thứ tự để đối chiếu bằng mắt trước/sau refactor.
 */
export async function expectSortBehaviour(
  root: Root,
  name: string,
  headerLabel: string,
  colId: string,
  numeric = false,
) {
  const h = header(root, headerLabel)
  if (!(await h.count())) {
    console.log(`${name}: không có header "${headerLabel}" → BỎ QUA TC-3`)
    return
  }

  await h.click()
  await expect(h, `${name}: click header không chuyển sang ascending`).toHaveAttribute(
    'aria-sort',
    'ascending',
  )

  const after = (await cells(root, colId).allTextContents()).map((t) => t.trim())

  if (numeric) {
    const nums = after.map((t) => Number(t.replace(/[^\d.-]/g, '')))
    expect(nums, `${name}: sort asc ${headerLabel} không tăng dần`).toEqual(
      [...nums].sort((a, b) => a - b),
    )
  } else {
    // KHÔNG so đa tập trước/sau: grid là VIRTUALIZED, chỉ các dòng trong khung
    // nhìn có mặt trong DOM. Sort xong tập dòng hiển thị đổi hẳn (dòng cuối bảng
    // biến mất, dòng đầu xuất hiện) → so tập luôn fail oan. Bản trước dính đúng
    // bẫy này ở 病名選択.
    //
    // Cũng KHÔNG assert collation: quy tắc sắp xếp của app phải khớp WinForm,
    // không khớp Intl.Collator('ja'). Spec nào cần kiểm thứ tự thì tự đối chiếu
    // với bảng WinForm của nó (xem expectWinFormOrder).
    console.log(`${name}: thứ tự asc theo ${headerLabel} = [${after.slice(0, 8).join(', ')}...]`)
  }

  // Sort xong phải cuộn về đầu (prop resetScrollSeq) và không sinh skeleton.
  expect(
    await scroller(root).evaluate((el) => el.scrollTop),
    `${name}: sort xong grid không cuộn về đầu (resetScrollSeq)`,
  ).toBe(0)
  await expect(skeletons(root), `${name}: sort xong xuất hiện skeleton`).toHaveCount(0)
}

/**
 * Đối chiếu thứ tự hiển thị với bảng WinForm — tiêu chí thật sự của app
 * ("giống WinForm là được"), thay cho mọi giả định collation.
 *
 * Chuẩn hoá NFKC trước khi so: web render full-width (`Ｃ`, `＋`, `，`) và
 * half-width katakana (`ﾀﾞﾂﾘ`), WinForm chụp ra half-width ASCII (`C`, `+`, `,`)
 * và full-width katakana (`ダツリ`). NFKC quy cả hai về một dạng nên khác biệt
 * hiển thị không làm test đỏ oan.
 *
 * So theo PREFIX: grid virtualized chỉ render các dòng trong khung nhìn.
 */
export async function expectWinFormOrder(
  root: Root,
  name: string,
  colId: string,
  winFormOrder: readonly string[],
) {
  const norm = (s: string) => s.normalize('NFKC').trim()
  const actual = (await cells(root, colId).allTextContents()).map(norm)
  const n = Math.min(actual.length, winFormOrder.length)

  expect(n, `${name}: không có dòng nào để đối chiếu WinForm`).toBeGreaterThan(0)
  expect(
    actual.slice(0, n),
    `${name}: thứ tự KHÁC WinForm (frm902007). Đây là parity bắt buộc, không phải collation.`,
  ).toEqual(winFormOrder.slice(0, n).map(norm))

  console.log(`${name}: khớp WinForm ${n}/${winFormOrder.length} dòng đầu`)
}

/**
 * WinForm rule 3 — "init = no sort": mở dialog là phải ở thứ tự BE, KHÔNG cột nào
 * mang glyph ▲/▼. Kiểm bằng aria-sort của mọi header sortable.
 */
export async function expectNoSortGlyph(root: Root, name: string) {
  const sortable = root.locator('[aria-sort]')
  const states = await sortable.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-sort') ?? ''),
  )
  expect(
    states.filter((s) => s !== 'none'),
    `${name}: mở lại vẫn còn glyph sort (aria-sort=${states.join('/')}) → reset không chạy`,
  ).toEqual([])
}

/** Đóng mọi dialog đang mở bằng F10 cho tới khi sạch (F10 = 戻る trong dialog). */
export async function closeDialogs(page: Page, max = 8) {
  for (let i = 0; i < max; i++) {
    const ok = page.getByRole('button', { name: 'OK' })
    if (await ok.count()) {
      await ok.first().click()
      await page.waitForTimeout(400)
      continue
    }
    if (!(await page.getByRole('dialog').count())) return
    await page.keyboard.press('F10')
    await page.waitForTimeout(600)
  }
}
