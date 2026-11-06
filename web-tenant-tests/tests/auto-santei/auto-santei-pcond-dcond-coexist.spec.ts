/**
 * 治療情報 (dcond / pInpOpt[51]) + 歯周情報 (pCond / pInpOpt[16]) tự mở cùng lúc với
 * hộp 初診 (AutoSantei) và カルテ記載選択 (Chk_CmtAuto) khi vào màn 診療入力.
 *
 * WinForm frm203002: Shown mở 治療情報 (showFormFromDLL ⇒ form.Show(), modeless,
 * TopMost) nếu pInpOpt[51]==1; Activated mở 歯周情報 (cũng Show(), TopMost) nếu
 * pInpOpt[16]==1 VÀ GetPlaqueTreatData có dữ liệu; sau đó phím Enter giả chạy
 * AutoSantei. Vậy ở legacy các form này nằm CÙNG LÚC với hộp 初診 / comment mà
 * không cản chúng. Spec này khoá hành vi tương đương trên web:
 *   · dcond ON ⇒ 治療情報 hiện; pCond ON + có 歯周病検査 ⇒ 歯周情報 hiện; pCond ON mà
 *     không có 検査 ⇒ không hiện; cả hai OFF ⇒ không hiện;
 *   · hộp 初診 nằm TRÊN CÙNG và nhận phím (Enter = Yes), không bị dialog tự mở cướp focus;
 *   · sau Yes, カルテ記載選択 vẫn bung ra, hai dialog thông tin không bị đóng.
 *
 * Dữ liệu GIẢ cho autosantei / cmt-autos (cùng cách với auto-santei-dialog-sequence).
 * Bệnh nhân TỰ DỰNG (990111 không lịch sử, 990112 có Ｐ混検 tháng trước), xoá ở afterAll.
 * Cần TEST_DB=1.
 */

import { type Page, type Route } from '@playwright/test'
import { dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows } from '../_shared/db'
import { BASE_URL, TODAY_ISO, trtDt } from '../_shared/env'
import { routeInpDeviceSettings, INP_FLAG, type InpDeviceSettingsRoute } from '../_shared/inp-device-settings'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')

const PAT_NO_PLAIN = '990111'
const PAT_NO_EXAM = '990112'
const TRT_DT = trtDt(TODAY_ISO)
/** Đầu tháng trước 診療日 — luôn nằm trong lịch sử, ngoài tháng đang nhập. */
const EXAM_DT = (() => {
  const d = new Date(`${TRT_DT}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1, 1)
  return d.toISOString().slice(0, 10)
})()
/** Ｐ混検 — mở đầu một nhóm 歯周病検査 (GetPlaqueTreatData). */
const TRT_CD_PLAQUE_EXAM = 120
const TAG = 'ZZCOEX'

const anyDialog = (page: Page) => page.locator('[role="dialog"]')
const tCondDialog = (page: Page) => anyDialog(page).filter({ hasText: '治療情報' })
const pCondDialog = (page: Page) => anyDialog(page).filter({ hasText: '歯周情報' })
const santeiDialog = (page: Page) => anyDialog(page).filter({ hasText: /を算定しますか？/ })
const karteDialog = (page: Page) => anyDialog(page).filter({ hasText: 'カルテ記載選択' })
/** Lưới rỗng không có ô 療法 (|2); ô 日 (|0) / 点 (|3) luôn có khi lưới đã nạp. */
const gridLoadedCell = (page: Page) => page.locator('[data-grid-cell$="|0"], [data-grid-cell$="|3"]')

const fakePick = (trtCd: number, label: string) => ({
  trtCd,
  trtSb: 0,
  trtNm: `${TAG}${label}`,
  trtPt: 0,
  trtCnt: 1,
})
/** CMTAUTO ≥2 dòng no_chk=0 ⇒ frm203012 bung (frm203012.cs:536). */
const cmt = (cmtSb: number) => ({
  cmtCd: 7000,
  cmtSb,
  cmtNm: `${TAG}k${cmtSb}`,
  dispNo: 1,
  noChk: 0,
})

/** Tâm của phần tử có nằm trong `dialog` không — true ⇔ dialog đó đang là lớp trên cùng tại đó. */
const isOnTop = (dialog: ReturnType<typeof santeiDialog>) =>
  dialog.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit !== null && el.contains(hit)
  })

// Không `serial`: mỗi test tự goto (state sạch), một test đỏ không được che các test sau.
test.describe.configure({ timeout: 180_000 })

test.describe('dcond / pCond: 治療情報・歯周情報 cùng hộp 初診 và カルテ記載選択', () => {
  let page: Page
  let step: () => Promise<void>
  let settings: InpDeviceSettingsRoute

  /** Mở 診療入力 KHÔNG đóng dialog nào (`openTreatmentEntry` sẽ dọn mất thứ đang đo). */
  const arrange = async (patNo: string, flags: { dcond: number; pCond: number }) => {
    settings.set(flags)
    // Vite dev hay nhả hụt một module động (màn 「エラーが発生しました」) — nạp lại tối đa 3 lần.
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`/treatments/${patNo}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
      const ok = await gridLoadedCell(page)
        .first()
        .waitFor({ state: 'visible', timeout: attempt === 1 ? 60_000 : 30_000 })
        .then(() => true)
        .catch(() => false)
      if (!ok) continue
      await step()
      const asked = await santeiDialog(page)
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false)
      if (asked) return
      console.log(`arrange: lần ${attempt}/3 không thấy hộp 初診 — nạp lại`)
    }
    await expect(santeiDialog(page), 'hộp 初診 phải hiện').toBeVisible({ timeout: 1000 })
  }

  test.beforeAll(async ({ authedPage }) => {
    await seedTestPatient({ patNo: Number(PAT_NO_PLAIN) })
    await seedTestPatient({ patNo: Number(PAT_NO_EXAM) })
    await seedTreatmentRows(Number(PAT_NO_EXAM), EXAM_DT, [
      { trtCd: TRT_CD_PLAQUE_EXAM, trtSb: 0, dspTrt: 'Ｐ混検' },
    ])

    page = authedPage
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
    settings = await routeInpDeviceSettings(page, { dcond: INP_FLAG.Off, pCond: INP_FLAG.Off })

    // 初診 đủ điều kiện ⇒ confirm 3 nút; Yes ⇒ picks[0], 100 = 初診料.
    await page.route('**/tenant/treatment/autosantei**', async (route: Route) => {
      if (route.request().url().includes('autosantei2')) return route.fallback()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            isInitialVisitEligible: true,
            picks: [fakePick(100, '初診料')],
            disabilityAddon: null,
            reExamPicks: [fakePick(110, '再診料')],
            reExamDisabilityAddon: null,
          },
        }),
      })
    })
    await page.route('**/tenant/treatment/autosantei2', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { picks: [] } }),
      })
    })
    await page.route('**/tenant/cmt-autos?**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [cmt(0), cmt(1)] }),
      })
    })
    await page.route('**/tenant/cmt-autos/programmatic**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })
    await page.route('**/tenant/cmt-autos/cascade**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })
  })

  test.afterAll(async () => {
    await settings?.dispose()
    await releaseSharedPage(page)
    await deleteTestPatient(Number(PAT_NO_PLAIN))
    await deleteTestPatient(Number(PAT_NO_EXAM))
  })

  test('TC-1 cả hai OFF: chỉ có hộp 初診, không có 治療情報 / 歯周情報', async () => {
    await arrange(PAT_NO_EXAM, { dcond: INP_FLAG.Off, pCond: INP_FLAG.Off })
    await page.waitForTimeout(1500)
    await expect(tCondDialog(page)).toHaveCount(0)
    await expect(pCondDialog(page)).toHaveCount(0)
  })

  test('TC-2 dcond ON: 治療情報 hiện cùng hộp 初診, hộp 初診 ở trên cùng', async () => {
    await arrange(PAT_NO_PLAIN, { dcond: INP_FLAG.On, pCond: INP_FLAG.Off })
    await expect(tCondDialog(page)).toBeVisible()
    await expect(pCondDialog(page)).toHaveCount(0)
    expect.soft(await isOnTop(santeiDialog(page)), 'hộp 初診 phải nằm trên 治療情報').toBe(true)
  })

  test('TC-3 pCond ON nhưng chưa có 歯周病検査: 歯周情報 KHÔNG mở', async () => {
    await arrange(PAT_NO_PLAIN, { dcond: INP_FLAG.Off, pCond: INP_FLAG.On })
    await page.waitForTimeout(1500)
    await expect(pCondDialog(page)).toHaveCount(0)
    await expect(tCondDialog(page)).toHaveCount(0)
  })

  test('TC-4 cả hai ON + có Ｐ混検: ba dialog cùng hiện; Enter = Yes; カルテ記載選択 bung, hai dialog kia còn', async () => {
    await arrange(PAT_NO_EXAM, { dcond: INP_FLAG.On, pCond: INP_FLAG.On })
    await expect(tCondDialog(page)).toBeVisible()
    await expect(pCondDialog(page)).toBeVisible()
    expect.soft(await isOnTop(santeiDialog(page)), 'hộp 初診 phải nằm trên cùng').toBe(true)

    // Phím phải tới hộp 初診 (nút Yes đang chọn) chứ không bị 治療情報 / 歯周情報 nuốt.
    const focusedAtOpen = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      return `${a?.tagName ?? '?'} 「${(a?.textContent ?? '').trim().slice(0, 20)}」 trong dialog 「${
        (a?.closest('[role="dialog"]')?.querySelector('h2')?.textContent ?? '(không)').trim()
      }」`
    })
    console.log(`focus khi hộp 初診 vừa hiện: ${focusedAtOpen}`)
    await expect
      .soft(santeiDialog(page).getByRole('button', { name: /^Yes$/ }), 'focus phải ở nút Yes của hộp 初診')
      .toBeFocused({ timeout: 2000 })
    await page.keyboard.press('Enter')
    await expect(santeiDialog(page), 'Enter phải chọn Yes và đóng hộp 初診').toHaveCount(0, { timeout: 5000 })

    await expect(karteDialog(page), 'sau Yes phải tới カルテ記載選択').toBeVisible({ timeout: 15_000 })
    await expect(karteDialog(page)).toContainText(`${TAG}初診料`)
    expect.soft(await isOnTop(karteDialog(page)), 'カルテ記載選択 phải nằm trên cùng').toBe(true)
    await expect(tCondDialog(page)).toBeVisible()
    await expect(pCondDialog(page)).toBeVisible()

    await karteDialog(page).getByRole('button', { name: /戻る/ }).click()
    await expect(karteDialog(page)).toHaveCount(0)
    await expect(tCondDialog(page)).toBeVisible()
    await expect(pCondDialog(page)).toBeVisible()
  })

  test('TC-5 chỉ pCond ON + có Ｐ混検: 歯周情報 mở cùng hộp 初診, hộp 初診 ở trên cùng', async () => {
    await arrange(PAT_NO_EXAM, { dcond: INP_FLAG.Off, pCond: INP_FLAG.On })
    await expect(pCondDialog(page)).toBeVisible()
    await expect(tCondDialog(page)).toHaveCount(0)
    expect.soft(await isOnTop(santeiDialog(page)), 'hộp 初診 phải nằm trên 歯周情報').toBe(true)
  })

  test('TC-6 cả hai ON: sau Yes, カルテ記載選択 nằm trên cùng và không bị hai dialog thông tin che', async () => {
    await arrange(PAT_NO_EXAM, { dcond: INP_FLAG.On, pCond: INP_FLAG.On })
    // Nút Yes bị 治療情報 / 歯周情報 che nên không click chuột thật được — dispatchEvent để đi tiếp
    // và đo tầng sau (TC-4 đã khoá riêng việc hộp 初診 bị che / không nhận Enter).
    await santeiDialog(page).getByRole('button', { name: /^Yes$/ }).dispatchEvent('click')
    await expect(karteDialog(page), 'sau Yes phải tới カルテ記載選択').toBeVisible({ timeout: 15_000 })
    const cover = await page.evaluate(() => {
      const box = (t: string) =>
        [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find((d) => d.textContent?.includes(t))
      const k = box('カルテ記載選択')
      if (!k) return 'karte-missing'
      const r = k.getBoundingClientRect()
      const covered: string[] = []
      for (const name of ['治療情報', '歯周情報']) {
        const d = box(name)
        if (!d) continue
        const q = d.getBoundingClientRect()
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left)
        const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)
        const above = !!(k.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)
        if (w > 0 && h > 0) {
          covered.push(`${name}: giao ${Math.round((100 * w * h) / (r.width * r.height))}% của カルテ記載選択, ${above ? 'nằm TRÊN' : 'nằm dưới'}`)
        }
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return `${covered.join('; ') || 'không giao'} | tâm カルテ記載選択 thuộc ${k.contains(hit) ? 'chính nó' : 'dialog khác'}`
    })
    console.log(`web カルテ記載選択: ${cover}`)
    expect.soft(await isOnTop(karteDialog(page)), 'カルテ記載選択 phải nằm trên cùng').toBe(true)
    await karteDialog(page).getByRole('button', { name: /戻る/ }).click()
  })
})
