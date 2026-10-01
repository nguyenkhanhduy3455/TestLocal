/**
 * 自動算定 — các dialog của Chk_CmtAuto phải hiện LẦN LƯỢT, không chồng nhau.
 *
 * WinForm `Chk_CmtAuto` (modMain.cs:771-787): prgCmtAuto (摘要選択 frm203018, showDialog)
 * chạy TRƯỚC, đóng xong mới tới カルテ記載選択 (frm203012, showDialog). Hai dialog
 * này KHÔNG phải cha-con. Bug cũ: đường 自動算定２ đẩy frm203018 mà không chờ, rồi
 * xếp hàng frm203012 ⇒ hai dialog mở CÙNG LÚC (歯管 116/7 của tenant demo).
 *
 * Dữ liệu GIẢ: chặn /autosantei, /autosantei2, /cmt-autos, /cmt-autos/cascade —
 * cùng cách làm với nhóm F/G của auto-santei.spec.ts.
 */

import { type Page, type Route } from '@playwright/test'
import { BASE_URL, TODAY_ISO, trtDt } from '../_shared/env'
import { expect, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { ADMIN_USER, JA } from '../_shared/test-data'

const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = trtDt(TODAY_ISO)
const TAG = 'ZZSEQ'

/** RegiCol.ryo — treatment-entry-shared.ts. */
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** frm203012 カルテ記載選択. */
const karteDialog = (page: Page) => anyDialog(page).filter({ hasText: 'カルテ記載選択' })
/** frm203018 摘要選択（<pack>）. */
const summaryDialog = (page: Page) => anyDialog(page).filter({ hasText: /摘要選択（/ })
/** confirmDialog/alertDialog dùng chung (Radix AlertDialog). */
const alertBox = (page: Page) => page.locator('[role="alertdialog"]')

const TRT_CD_SAISHIN = 110
const TRT_CD_SHIKAN = 116
const TRT_SB_SHIKAN = 7

const pick = (trtCd: number, trtSb: number, label: string) => ({
  trtCd,
  trtSb,
  trtNm: `${TAG}${label}`,
  trtPt: 0,
  trtCnt: 1,
})
const auto2Pick = (trtCd: number, trtSb: number, label: string) => ({
  ...pick(trtCd, trtSb, label),
  jihiFlg: 0,
  bui: [],
  disCd: [],
  disSb: [],
  dspDis: '',
})
/** CMTAUTO ≥2 dòng no_chk=0 ⇒ frm203012 bung (frm203012.cs:536). */
const cmt = (cmtSb: number, label: string) => ({
  cmtCd: 7000,
  cmtSb,
  cmtNm: `${TAG}${label}`,
  dispNo: 1,
  noChk: 0,
})
/** Pack pack_type 1 với ≥2 ứng viên ⇒ frm203018 bung. */
const cascadePack = (packCd: string, labels: string[]) => ({
  packCd,
  packNm: `${TAG}${packCd}`,
  remarks: '',
  multiSelect: false,
  direct: false,
  candidates: labels.map((label, i) => ({
    seqNo: i + 1,
    dispText: `${TAG}${label}`,
    comCd: '820101879',
    comPattern: 20,
    cmtCd: null,
    cmtSb: null,
    fmtStr: '',
    exitFlg: false,
  })),
  packType: 1,
  commentText: null,
  condition: null,
  gateTrtCds: [],
})

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('自動算定 — 摘要選択 rồi mới カルテ記載選択 (không chồng dialog)', () => {
  let page: Page
  let step: () => Promise<void>

  const SHIKAN_KEY = `${TRT_CD_SHIKAN}-${TRT_SB_SHIKAN}`
  let cmtUser: Record<string, ReturnType<typeof cmt>[]> = {}
  let cmtHttpError: number | null = null

  const keyOf = (u: string) => {
    const q = new URL(u).searchParams
    return `${q.get('trtCd')}-${q.get('trtSb')}`
  }

  /** Mở màn 診療入力 (retry vì Vite dev hay nhả hụt module). */
  const arrange = async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
      const ok = await ryoCell(page)
        .last()
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => true)
        .catch(() => false)
      if (ok) {
        await step()
        return
      }
    }
    throw new Error(`màn 診療入力 không render — kiểm dev server (${BASE_URL}login)`)
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // 再診 thẳng (không đủ điều kiện 初診) ⇒ không có confirm 「〜を算定しますか？」.
    await page.route('**/tenant/treatment/autosantei**', async (route: Route) => {
      if (route.request().url().includes('autosantei2')) return route.fallback()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            isInitialVisitEligible: false,
            picks: [pick(TRT_CD_SAISHIN, 0, '再診料')],
            disabilityAddon: null,
            reExamPicks: [],
            reExamDisabilityAddon: null,
          },
        }),
      })
    })
    await page.route('**/tenant/treatment/autosantei2', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { picks: [auto2Pick(TRT_CD_SHIKAN, TRT_SB_SHIKAN, '歯管')] },
        }),
      })
    })
    await page.route('**/tenant/cmt-autos?**', async (route: Route) => {
      if (cmtHttpError !== null) {
        await route.fulfill({ status: cmtHttpError, contentType: 'application/json', body: '{}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: cmtUser[keyOf(route.request().url())] ?? [] }),
      })
    })
    await page.route('**/tenant/cmt-autos/programmatic**', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      })
    })
    // Cascade là POST, (trtCd, trtSb) nằm trong body.
    await page.route('**/tenant/cmt-autos/cascade**', async (route: Route) => {
      const body = (route.request().postDataJSON() ?? {}) as { trtCd?: number; trtSb?: number }
      const isShikan = body.trtCd === TRT_CD_SHIKAN && body.trtSb === TRT_SB_SHIKAN
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: isShikan ? [cascadePack('B000-4', ['packA', 'packB'])] : [],
        }),
      })
    })

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(page, 'login không vào được — có thể đang dính rate-limit').toHaveURL(/\/$/)
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test('TC-1 歯管: 摘要選択 hiện MỘT MÌNH, 確定 xong mới tới カルテ記載選択', async () => {
    cmtUser = { [SHIKAN_KEY]: [cmt(0, 'kA'), cmt(1, 'kB')] }
    cmtHttpError = null
    await arrange()

    await expect(summaryDialog(page)).toBeVisible({ timeout: 20000 })
    // Cho FE đủ thời gian xếp hàng frm203012 — bản lỗi mở nó ngay sau frm203018.
    await page.waitForTimeout(2000)
    await expect(
      karteDialog(page),
      'カルテ記載選択 không được mở khi 摘要選択 còn trên màn hình (WinForm showDialog lần lượt)',
    ).toHaveCount(0)

    await summaryDialog(page).getByRole('button', { name: /確定/ }).click()
    await expect(summaryDialog(page)).toHaveCount(0)
    await expect(karteDialog(page), 'đóng 摘要選択 xong phải tới カルテ記載選択').toBeVisible({
      timeout: 15000,
    })
    await expect(karteDialog(page)).toContainText(`${TAG}歯管`)
    await expect(summaryDialog(page)).toHaveCount(0)

    await karteDialog(page).getByRole('button', { name: /戻る/ }).click()
    await expect(karteDialog(page)).toHaveCount(0)
  })

  test('TC-2 lookup CMTAUTO lỗi: alert không đè lên 摘要選択', async () => {
    cmtUser = {}
    cmtHttpError = 500
    await arrange()

    await expect(summaryDialog(page)).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(2000)
    await expect(
      alertBox(page),
      'alert 「コメント自動入力」 phải chờ 摘要選択 đóng',
    ).toHaveCount(0)

    await summaryDialog(page).getByRole('button', { name: /確定/ }).click()
    await expect(alertBox(page)).toBeVisible({ timeout: 15000 })
    await expect(alertBox(page)).toContainText('コメント自動入力の取得に失敗しました')
    await expect(summaryDialog(page)).toHaveCount(0)
    await alertBox(page).getByRole('button').first().click()
    await expect(alertBox(page)).toHaveCount(0)
  })
})
