/**
 * trouble-2 / TC-7 — 患者検索一覧 (`/patients-list`) KHÔNG được đổi.
 *
 * Đây là grid DUY NHẤT thật sự server-windowed (mục 2.A): dùng
 * `useWindowedPatientList` → `count` / `getRow` / `onRangeChange`, và `getRow`
 * ĐƯỢC PHÉP trả `undefined` → VirtualListTable render skeleton row.
 *
 * Facade `ClientListTable` chỉ là lớp bọc thêm cho 16 grid client-side; nó KHÔNG
 * được nuốt đường server-window này. Test là bằng chứng đường đó còn sống:
 *   - onRangeChange vẫn được gọi khi cuộn (window mới được fetch)
 *   - skeleton row VẪN xuất hiện trong lúc fetch — ở đây skeleton là ĐÚNG,
 *     ngược hẳn với virtual-list-grids.spec.ts nơi skeleton là LỖI.
 *
 * Lưu ý khi đọc kết quả: skeleton chỉ kịp hiện khi cửa sổ chưa fetch xong. Mạng
 * local nhanh có thể resolve trước khi Playwright chụp được → test KHÔNG fail
 * cứng ở điểm đó mà log lại, vì "không bắt được skeleton" không chứng minh được
 * là đường windowed đã chết. Bằng chứng cứng nằm ở việc danh sách dài hơn 1 cửa
 * sổ vẫn cuộn tới cuối và resolve đủ dữ liệu.
 */
import { expect, test, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const scroller = (page: Page) => page.getByTestId('virtual-scroll-container')
const rows = (page: Page) => page.locator('[data-testid^="row-"]')
const skeletons = (page: Page) => page.locator('[data-testid^="skeleton-"]')

test('trouble-2 TC-7 — 患者検索一覧 giữ nguyên đường server-window', async ({ page }) => {
  test.setTimeout(300_000)
  const step = makeStep(page)

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(page).toHaveURL(/\/$/)

  // Route ĐÚNG là /patients (routes/_authenticated/patients/index.tsx →
  // PatientListPage → PatientSearchList → PatientListTable).
  // KHÔNG phải /patients-list — route đó là 患者一覧表 và đang
  // 「この機能は開発中です」, không hề render VirtualListTable.
  await page.goto('/patients', { waitUntil: 'domcontentloaded' })

  // Đếm request cửa sổ. PHẢI gắn listener TRƯỚC khi bấm 検索: chính lần fetch đầu
  // tiên mới là bằng chứng đường server-window còn sống. Gắn sau khi list đã
  // render là bỏ lỡ nó (lỗi ở bản trước → windowFetches = 0 dù app chạy đúng).
  const windowUrls: string[] = []
  page.on('request', (r) => {
    if (/\/tenant\/patients(\?|$)/.test(r.url())) windowUrls.push(r.url())
  })

  // Danh sách RỖNG cho tới khi bấm 検索 (patient-search-list.tsx: "Gate: only
  // fetch once a 検索 has run"). Nút nằm trong block ≪患者検索条件≫.
  const searchBtn = page.getByRole('button', { name: '検索', exact: true })
  await expect(searchBtn, 'không thấy nút 検索 trên /patients').toBeVisible({ timeout: 30000 })
  await searchBtn.click()
  await step()

  await expect(scroller(page), 'không mở được 患者検索一覧 sau khi bấm 検索').toBeVisible({
    timeout: 30000,
  })
  await expect(rows(page).first(), '検索 không ra kết quả nào — cần dữ liệu để test cuộn').toBeVisible(
    { timeout: 30000 },
  )

  // Bằng chứng #1: 検索 phải đi qua HTTP, không phải lọc trên mảng client sẵn có.
  expect(
    windowUrls.length,
    'bấm 検索 mà KHÔNG có request /tenant/patients nào → ' +
      'đường server-window đã bị thay bằng mảng client (facade nuốt mất 2.A)',
  ).toBeGreaterThan(0)
  const fetchesAfterSearch = windowUrls.length

  const firstBefore = (await rows(page).first().getAttribute('data-testid')) ?? ''

  // Cuộn mạnh xuống cuối để ép fetch cửa sổ mới.
  let sawSkeleton = false
  for (let i = 0; i < 6; i++) {
    await scroller(page).evaluate((el) => {
      el.scrollTop = el.scrollTop + el.clientHeight * 4
    })
    if (await skeletons(page).count()) sawSkeleton = true
    await page.waitForTimeout(150)
  }
  await step()

  const scrolled = await scroller(page).evaluate((el) => el.scrollTop)
  expect(scrolled, 'grid không cuộn được — danh sách quá ngắn để kiểm chứng windowed').toBeGreaterThan(
    0,
  )

  // Sau khi cuộn, các dòng trong tầm nhìn phải RESOLVE hết (skeleton chỉ tạm thời).
  await expect(skeletons(page), 'cuộn xong mà skeleton không resolve → window fetch hỏng').toHaveCount(
    0,
    { timeout: 30000 },
  )
  await expect(rows(page).first()).toBeVisible()

  // Dòng đầu trong khung nhìn phải ĐỔI so với lúc chưa cuộn → đúng là virtual list.
  const firstAfter = (await rows(page).first().getAttribute('data-testid')) ?? ''
  expect(firstAfter, 'cuộn xuống mà dòng đầu không đổi → không phải virtual list').not.toBe(
    firstBefore,
  )

  const scrollFetches = windowUrls.length - fetchesAfterSearch
  const pages = [...new Set(windowUrls.map((u) => u.match(/[?&]page=(\d+)/)?.[1] ?? '—'))]

  // Log TRƯỚC assert: assert fail thì console.log phía sau không bao giờ chạy,
  // mất sạch dữ liệu để chẩn đoán (đã dính ở bản trước).
  console.log(
    `TC-7: ${fetchesAfterSearch} fetch khi 検索 + ${scrollFetches} fetch khi cuộn; ` +
      `page params thấy được: [${pages.join(', ')}]; ` +
      `${await rows(page).count()} dòng trong khung nhìn; ` +
      `skeleton: ${sawSkeleton ? 'bắt được' : 'không (cache/mạng nhanh)'}`,
  )

  // Bằng chứng #2 — request phải MANG THAM SỐ PHÂN TRANG. Đó mới là chữ ký của
  // đường server-window: fetch theo cửa sổ chứ không tải hết một lượt.
  //
  // KHÔNG assert "cuộn phải sinh request mới": hook prefetch sẵn nhiều cửa sổ và
  // React Query cache lại, nên cuộn tới vùng đã fetch thì scrollFetches = 0 một
  // cách hoàn toàn hợp lệ. Bản trước bắt buộc điều đó nên fail oan.
  expect(
    windowUrls.some((u) => /[?&]page=/.test(u)),
    `request /tenant/patients không có tham số page → không còn fetch theo cửa sổ, ` +
      `nghi facade đã thay bằng tải-hết-một-lượt. URL mẫu: ${windowUrls[0] ?? '(không có)'}`,
  ).toBe(true)

  // Cuộn ngược lên đầu — không được vỡ (TC-2 áp cho grid windowed).
  await scroller(page).evaluate((el) => {
    el.scrollTop = 0
  })
  await step()
  await expect(skeletons(page), 'cuộn ngược lên đầu mà skeleton kẹt').toHaveCount(0, {
    timeout: 20000,
  })
})
