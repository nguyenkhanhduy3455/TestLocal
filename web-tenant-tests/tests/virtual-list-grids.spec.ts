/**
 * trouble-2 / mục 2.B — REGRESSION BASELINE cho facade `ClientListTable`.
 *
 * Gộp 3 spec cũ (virtual-list-client-grids / -dialog-grids / -entry-chain-grids)
 * vào MỘT file và CHIA NHỎ: mỗi `test()` chỉ kiểm một việc, thay cho 3 test khổng
 * lồ mỗi cái ôm 4-6 grid. Chốt hành vi HIỆN TẠI để sau refactor so lại phải y hệt.
 *
 * 14 grid được phủ:
 *   ── Mở thẳng bằng URL / 1 phím ─────────────────────────────────────────────
 *   #1  受付患者一覧        /treatments                      (chrome=panel)
 *   #16 当月来患集計        /treatments → F3                 (chrome=bare)
 *   #2  未精算患者一覧      /counter-payments                (isCountLoading ✓)
 *   #3  カルテ待ち患者一覧  /medical-records/patient-select  (isCountLoading ✓)
 *   ── Dialog mở bằng 1 phím / 1 cú click từ 診療入力 ─────────────────────────
 *   #4  摘要欄記載選択 — tab 摘要コメント一覧   F7
 *   #5  摘要欄記載選択 — tab 摘要記載事項一覧   F7 → đổi tab (grid THỨ HAI cùng dialog)
 *   #9  薬 剤 選 択                            Shift+F6
 *   #6  パック処置選択                          tab パック → row
 *   #7  ガイド処置選択                          tab ガイド → 全て表示 → row
 *   #15 歯周疾患治療履歴                        nút P → F2 P履歴  (rowHeight=44)
 *   ── Sau CHUỖI NHẬP 処置 (đắt nhất, và GHI DỮ LIỆU THẬT) ────────────────────
 *   #8  処置選択          Shift+F10 コードモード → gõ mã vào cell 点 → Enter
 *   #12 摘要コメント選択   từ #8 chọn 点数=PICK_SCORE → Enter tại cell 回
 *   #14 病名選択 (親)      panel 病検 → 変更 → row → 部位選択 → End
 *   #13 病名選択 (細分類)  từ #14 chọn 1 dòng có 細分類
 *
 * MỘT LOGIN CHO CẢ FILE — app chặn 10 login/khung giờ, mà chia nhỏ testcase thì
 * fixture `page` mặc định sẽ đăng nhập LẠI mỗi test. Nên cả file chạy
 * `mode: 'serial'` trên MỘT page tạo ở `beforeAll`: test sau nối tiếp trạng thái
 * test trước (dialog đang mở, dòng vừa chọn…), và một test đỏ khiến các test còn
 * lại tự skip — đúng ý, vì dialog không mở được thì mọi assert bên trong nó vô
 * nghĩa. Đánh đổi: page tự tạo KHÔNG nhận video/trace của fixture (ảnh chụp lúc
 * lỗi vẫn còn), nên các option thời gian chờ được chép tay lại từ config.
 *
 * "Không chạy" khác hẳn "chạy và pass": nhánh thiếu dữ liệu gọi `test.skip()` —
 * report hiện màu vàng đích danh, thay vì `console.log` chìm trong một test xanh.
 *
 * ĐIỂM MẤU CHỐT của cả trouble-2: mọi grid ở đây là MẢNG CLIENT, `getRow` luôn
 * resolve ngay ⇒ **không được có dòng skeleton nào**. Facade tính `count` sai
 * hoặc trả `undefined` sẽ lòi skeleton ra — đó là chuông báo vỡ.
 *
 * CẢNH BÁO DỮ LIỆU: nhóm #8/#12 GHI THẬT — mỗi lần chạy thêm 1 dòng 処置 TRT_CD
 * vào hồ sơ bệnh nhân cho ngày TRT_DT. Chạy nhiều lần thì hồ sơ phình ra và các
 * spec cần "ngày còn sạch" (cmt-auto-picker) hỏng theo → đổi TEST_TRT_DT mỗi đợt.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import {
  cells,
  closeDialogs,
  expectClientGrid,
  expectSortBehaviour,
  expectWinFormOrder,
  header,
  rows,
  scroller,
  skeletons,
} from './virtual-grid'

const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)
const TRT_CD = process.env.TEST_TRT_CD ?? '153'
const PICK_SCORE = process.env.TEST_PICK_SCORE ?? '48'

const TREATMENT_URL = `/treatments/${PAT_NO}?trtDt=${TRT_DT}`

/**
 * Thứ tự 病名 asc CỦA WINFORM (frm902007), chép từ ảnh chụp màn hình thật.
 * Đây là tiêu chí duy nhất đúng — "giống WinForm là được".
 *
 * KHÔNG dùng Intl.Collator('ja') để suy ra: nó xếp `，` và `＋` khác WinForm
 * (Intl: ，( ) → … ＋ / WinForm: ( ) , + →) và làm test đỏ oan.
 *
 * Viết ở dạng NFKC (ASCII nửa chiều + katakana đầy chiều) — helper chuẩn hoá cả
 * hai phía nên không cần khớp chính xác kiểu hiển thị của web.
 */
const WINFORM_DISEASE_ORDER = [
  '(',
  ')',
  ',',
  '+',
  '→',
  '→C',
  '→MT',
  '→MT(床裏装)',
  '→MT(追補)',
  '→Per',
  '→Pul',
  '3/4冠',
  '3/4冠ダツリ',
  '3/4冠ダツリC',
  '4/5冠',
  '4/5冠ダツリ',
  '4/5冠ダツリC',
  'AA',
  'Abr',
  'Ang',
  'Att',
  'Br',
  'Brダツリ',
] as const

test.describe.configure({ mode: 'serial' })

let page: Page
let step: () => Promise<void>
/** MỌI dialog đang mở — chỉ dùng để ĐẾM. */
let dialog: Locator
/**
 * Dialog FOREGROUND = cái CUỐI trong DOM: DraggableDialog portal vào `<body>`
 * theo thứ tự mở nên cái mở sau nằm sau (chính quy ước `FKeyScopeProvider` dùng
 * để quyết định dialog nào ăn phím F). Mọi assert bám vào nó, KHÔNG bám
 * `getByRole('dialog')` trần — chỉ cần một popup nữa bung ra là strict mode
 * violation ("resolved to 2 elements"), dù popup đó chẳng liên quan.
 */
let fgDialog: Locator

/**
 * Chờ có giới hạn cho MỘT dialog MỚI mở.
 *
 * Hỏi `dialog.count()` ngay sau keypress là hỏng: React còn đang fetch + render
 * nên gần như luôn = 0 → test tưởng "phím không mở được dialog" và bỏ qua oan.
 * Đếm theo SỐ dialog (không phải "có dialog nào không") để không nhận nhầm popup
 * đang mở sẵn là dialog mới.
 */
const openedNewDialog = (before: number, timeout = 20000) =>
  expect
    .poll(() => dialog.count(), { timeout })
    .toBeGreaterThan(before)
    .then(
      () => true,
      () => false,
    )

/** Confirm 「<trt_nm>を算定しますか？」 của AutoSantei. */
const santeiConfirm = () => dialog.filter({ hasText: /を算定しますか？/ })

/**
 * Bấm Cancel nếu confirm 算定 đang mở.
 *
 * Rule 14.1 — chọn nhánh KHÔNG đẻ ra popup tiếp theo. Theo source: `Cancel`
 * return ngay (không áp picks, không fan-out cmtAuto → không có カルテ記載選択) và
 * không thêm dòng nào vào grid nên không làm bẩn dữ liệu bệnh nhân test.
 * `Yes` / `No` đều đi tiếp vào nhánh áp picks.
 */
async function cancelSanteiConfirm() {
  const confirm = santeiConfirm()
  if (!(await confirm.count())) return false
  await confirm.getByRole('button', { name: /^(Cancel|キャンセル)$/ }).click()
  await expect(confirm).toBeHidden({ timeout: 10000 })
  return true
}

/**
 * GUIDELINE Rule 14 — lưới an toàn cho confirm 算定 bung ra giữa chừng: Playwright
 * tự chạy handler trước mỗi actionability/assert check rồi mới làm thao tác gốc.
 *
 * ĐÂY CHỈ LÀ LƯỚI, KHÔNG PHẢI HÀNG RÀO. `page.keyboard.press` KHÔNG có
 * actionability check nào để Playwright chen handler vào → confirm đang mở thì
 * phím F bay thẳng tới `FKeyScopeProvider`, và guard modal ở đó NUỐT phím
 * (fkey-scope-provider.tsx:58-67, vì scope topmost không nằm trong dialog
 * foreground). Phím mất im lặng và không có gì bắn lại. Hàng rào thật là
 * `settleAutoSantei()` bên dưới.
 */
async function installSanteiAutoCancel(p: Page) {
  await p.addLocatorHandler(
    p.getByRole('dialog').filter({ hasText: /を算定しますか？/ }).first(),
    async (confirm) => {
      await confirm.getByRole('button', { name: /^(Cancel|キャンセル)$/ }).click()
    },
    { times: 30 },
  )
}

test.beforeAll(async ({ browser }) => {
  // Page tự tạo KHÔNG đi qua fixture nên không thừa hưởng `use` của config →
  // chép tay baseURL / viewport (test đo kích thước dialog phụ thuộc nó) và hai
  // mốc thời gian: navigation 90s vì Vite dev server transform nguội rất lâu.
  const { baseURL, viewport, ignoreHTTPSErrors, locale, navigationTimeout, actionTimeout } =
    test.info().project.use
  page = await browser.newPage({ baseURL, viewport, ignoreHTTPSErrors, locale })
  page.setDefaultNavigationTimeout(navigationTimeout ?? 90_000)
  page.setDefaultTimeout(actionTimeout ?? 15_000)

  step = makeStep(page)
  dialog = page.getByRole('dialog')
  fgDialog = dialog.last()
  await installSanteiAutoCancel(page)

  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(page).toHaveURL(/\/$/)
})

test.afterAll(async () => {
  await page?.close()
})

/**
 * Vào màn 受付患者一覧 và chờ ỨNG DỤNG SẴN SÀNG NHẬN PHÍM.
 *
 * `waitUntil: 'domcontentloaded'` chỉ báo HTML đã parse xong — React/Vite lúc đó
 * còn đang nạp module, `FKeyScopeProvider` CHƯA gắn listener `keydown` lên
 * window. Bắn F3 ngay sau goto là phím rơi vào hư không, và KHÔNG có gì bắn lại:
 * test chờ hết 20s rồi báo "F3 không mở được dialog" — đổ oan cho app.
 * Mốc chờ = FKeyBar đã render, tức listener đã sống.
 */
async function gotoWaitList() {
  await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
  await expect(
    page.getByRole('button', { name: /F3\s*当月来患/ }),
    'FKeyBar của 受付患者一覧 không render — app chưa mount xong',
  ).toBeVisible({ timeout: 60000 })
}

/**
 * Chờ request `/autosantei` xuất hiện. Ngày ĐÃ CÓ 処置 thì effect return trước
 * khi gọi API (treatment-entry-detail.tsx:2517-2520) — quá mốc này coi như
 * AutoSantei không chạy, tức chắc chắn không có confirm.
 */
const AUTOSANTEI_REQUEST_TIMEOUT = 10000
/** Sau khi API trả về, confirm chỉ cách vài tick React — 5s là quá dư. */
const SANTEI_CONFIRM_TIMEOUT = 5000

/**
 * Vào màn 診療入力, chờ grid 処置 render (cell 点 = RegiCol.ten = 3) VÀ chờ
 * AutoSantei ngã ngũ.
 *
 * Vì sao phải chờ AutoSantei hẳn hoi thay vì phó mặc `addLocatorHandler`: mọi
 * testcase ở màn này mở dialog bằng PHÍM (F7 / Shift+F6 / Shift+F10), mà
 * `keyboard.press` không có actionability check nên handler không chen vào được.
 * Confirm 算定 mà đang mở thì `FKeyScopeProvider` NUỐT phím — lỗi câm: Shift+F10
 * không đổi sang コードモード, 153 bị tra như 点数 thay vì コード, app trả
 * 「該当処置はありません。」 và test đổ oan cho app.
 *
 * Mốc chờ là RESPONSE của `/autosantei`, không phải một con số giây tuỳ hứng —
 * confirm chỉ bung SAU khi API đó trả về. AutoSantei chạy đúng MỘT lần cho mỗi
 * lần nạp trang (`autoSanteiProcessedPatNoRef`), nên dọn xong một lần là cả màn
 * hình yên cho tất cả test phía sau.
 */
async function gotoTreatmentEntry() {
  // Đặt bẫy TRƯỚC khi điều hướng: request bắn ra ngay khi treatmentsPage về, có
  // thể xong trước cả lúc grid kịp render.
  const pendingAutoSantei = page
    .waitForRequest(/autosantei/, { timeout: AUTOSANTEI_REQUEST_TIMEOUT })
    .catch(() => null)

  await page.goto(TREATMENT_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-grid-cell$="|3"]').last()).toBeVisible({ timeout: 60000 })

  const req = await pendingAutoSantei
  if (req) {
    await req.response().catch(() => null)
    await santeiConfirm()
      .waitFor({ state: 'visible', timeout: SANTEI_CONFIRM_TIMEOUT })
      .catch(() => {}) // BE quyết 再診 → không eligible → không có confirm
    await cancelSanteiConfirm()
  }

  // Popup còn lại (queue 自動表示…) chỉ dọn NẾU đang có — không chờ mù.
  await closeDialogs(page)
}

/**
 * Bấm OK / Yes cho tới khi hàng đợi alert お茶コン rỗng.
 *
 * Chốt một dòng 処置 → `commitPick` → 行単位 診療チェック POST
 * `/tenant/treatment/check-single`; mỗi lỗi trả về thành một `alertDialog`
 * (vd 「07/28 153-1 除去(困難)を算定していますが、算定可能な部位がありません。」),
 * bung ra vài trăm ms SAU thao tác chốt. Không phải lỗi app — nhưng overlay
 * z-[200] của nó nuốt sạch click tiếp theo:
 *
 *   <div class="fixed inset-0 z-[200] bg-black/80"> intercepts pointer events
 *
 * KHÔNG dùng `closeDialogs` cho việc này: nhánh F10 của nó sẽ đóng luôn dialog
 * mà test đang muốn đo. Ở đây chỉ đụng vào `[role="alertdialog"]`.
 */
async function drainAlerts(max = 10) {
  for (let i = 0; i < max; i++) {
    const alert = page.getByRole('alertdialog')
    if (!(await alert.count())) return
    const btn = alert.locator('button', { hasText: /^(OK|Yes)$/ })
    if (!(await btn.count())) return // không nhận ra nút nào → đừng quay vòng vô ích
    await btn.first().click()
    await page.waitForTimeout(300)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// #1 受付患者一覧 — /treatments (chrome=panel, KHÔNG truyền isCountLoading)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('#1 受付患者一覧 — /treatments', () => {
  let rowCount = 0

  test.beforeAll(async () => {
    await gotoWaitList()
  })

  test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
    rowCount = await expectClientGrid(page, '受付患者一覧', 'patNo')
    await step()
  })

  test('TC-3 — sort 患者番号 asc → desc, cuộn về đầu, không sinh skeleton', async () => {
    test.skip(rowCount < 2, `chỉ ${rowCount} dòng → so thứ tự vô nghĩa (đổi TEST_PAT_NO)`)

    await header(page, '患者番号').click()
    await expect(header(page, '患者番号')).toHaveAttribute('aria-sort', 'ascending')
    const asc = (await cells(page, 'patNo').allTextContents()).map((t) => Number(t.trim()))
    expect(asc, '受付患者一覧: sort asc 患者番号 sai thứ tự').toEqual([...asc].sort((a, b) => a - b))
    await step()

    await header(page, '患者番号').click()
    await expect(header(page, '患者番号')).toHaveAttribute('aria-sort', 'descending')
    const desc = (await cells(page, 'patNo').allTextContents()).map((t) => Number(t.trim()))
    expect(desc, '受付患者一覧: sort desc 患者番号 sai thứ tự').toEqual(
      [...desc].sort((a, b) => b - a),
    )

    // Sort xong phải cuộn về đầu (prop resetScrollSeq) và không sinh skeleton.
    expect(
      await scroller(page).evaluate((el) => el.scrollTop),
      '受付患者一覧: sort xong grid không cuộn về đầu (resetScrollSeq)',
    ).toBe(0)
    await expect(skeletons(page), '受付患者一覧: sort xong xuất hiện skeleton').toHaveCount(0)
    await step()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// #16 当月来患集計 — /treatments → F3 (chrome=bare)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('#16 当月来患集計 — F3', () => {
  test.beforeAll(async () => {
    await gotoWaitList()
  })

  test.afterAll(async () => {
    await closeDialogs(page)
  })

  test('F3 mở được dialog', async () => {
    const before = await dialog.count()
    await page.keyboard.press('F3')
    expect(await openedNewDialog(before), '当月来患集計 không mở bằng F3').toBe(true)
    await step()
  })

  test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
    // Scope vào dialog: grid 受付患者一覧 phía dưới vẫn tồn tại trong DOM.
    // colId 「人数」 đổi `count` → `cnt` ở commit `refactor(web-tenant): 来患集計ダイアログの
    // 重複を共通ヘルパーへ集約し命名を統一` (7e97d38c8); FIGURE_COLUMNS[0] trong
    // monthly-visit-summary-dialog.tsx là nguồn chân lý.
    await expectClientGrid(fgDialog, '当月来患集計', 'cnt')
    await step()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// #2 未精算患者一覧 — /counter-payments (CÓ isCountLoading)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('#2 未精算患者一覧 — /counter-payments', () => {
  let rowCount = 0

  test.beforeAll(async () => {
    await page.goto('/counter-payments', { waitUntil: 'domcontentloaded' })
  })

  test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
    rowCount = await expectClientGrid(page, '未精算患者一覧', 'id')
    await step()
  })

  test('TC-3 — sort 点数 asc, không sinh skeleton', async () => {
    test.skip(rowCount < 2, `chỉ ${rowCount} dòng → so thứ tự vô nghĩa`)

    await header(page, '点数').click()
    await expect(header(page, '点数')).toHaveAttribute('aria-sort', 'ascending')
    const pts = (await cells(page, 'points').allTextContents()).map((t) =>
      Number(t.replace(/[^\d-]/g, '')),
    )
    expect(pts, '未精算患者一覧: sort asc 点数 sai thứ tự').toEqual([...pts].sort((a, b) => a - b))
    await expect(skeletons(page), '未精算患者一覧: sort xong xuất hiện skeleton').toHaveCount(0)
    await step()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// #3 カルテ待ち患者一覧 — /medical-records/patient-select (CÓ isCountLoading)
// ═══════════════════════════════════════════════════════════════════════════
test.describe('#3 カルテ待ち患者一覧 — /medical-records/patient-select', () => {
  let rowCount = 0

  test.beforeAll(async () => {
    await page.goto('/medical-records/patient-select', { waitUntil: 'domcontentloaded' })
  })

  test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
    rowCount = await expectClientGrid(page, 'カルテ待ち患者一覧', 'patNo')
    await step()
  })

  test('TC-5 — rỗng thì hiện đúng emptyText 印刷待ちの患者はいません', async () => {
    test.skip(rowCount > 0, `có ${rowCount} dòng → nhánh rỗng không chạy được`)

    await expect(
      page.getByText('印刷待ちの患者はいません'),
      'カルテ待ち患者一覧: rỗng nhưng sai emptyText',
    ).toBeVisible()
  })

  test('TC-3 — sort 患者番号 asc, không sinh skeleton', async () => {
    test.skip(rowCount === 0, 'list rỗng → không có gì để sort')

    await header(page, '患者番号').click()
    await expect(header(page, '患者番号')).toHaveAttribute('aria-sort', 'ascending')
    await expect(skeletons(page), 'カルテ待ち患者一覧: sort xong xuất hiện skeleton').toHaveCount(0)
    await step()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 診療入力 — 6 grid dialog mở được bằng MỘT phím hoặc một cú click
// ═══════════════════════════════════════════════════════════════════════════
test.describe('診療入力 — dialog mở bằng 1 phím / 1 click', () => {
  test.beforeAll(async () => {
    await gotoTreatmentEntry()
    await step()
  })

  // ─── #4 + #5 摘要欄記載選択 (F7 摘要) ──────────────────────────────────────
  test.describe('#4/#5 摘要欄記載選択 — F7', () => {
    let opened = false
    let hasEntryTab = false

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test('F7 mở được 摘要欄記載選択', async () => {
      const before = await dialog.count()
      await page.keyboard.press('F7')
      opened = await openedNewDialog(before)
      expect(opened, 'F7 không mở được 摘要欄記載選択').toBe(true)
      await step()
    })

    test('#4 TC-1 — tab mặc định 摘要コメント一覧 (activeTab=comment)', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectClientGrid(fgDialog, '摘要欄記載選択/コメント', 'comment')
      await step()
    })

    test('#4 TC-3 — sort コード (numeric)', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectSortBehaviour(fgDialog, '摘要欄記載選択/コメント', 'コード', 'cmtCd', true)
      await step()
    })

    test('#5 đổi sang tab 摘要記載事項一覧', async () => {
      test.skip(!opened, 'dialog không mở được')
      const entryTab = fgDialog.getByRole('button', { name: '摘要記載事項一覧' })
      hasEntryTab = (await entryTab.count()) > 0
      expect(hasEntryTab, '摘要欄記載選択: không thấy tab 摘要記載事項一覧').toBe(true)
      await entryTab.click()
      await step()
    })

    test('#5 TC-1 — grid THỨ HAI trong cùng dialog', async () => {
      // trouble-2 rủi ro #6: facade phải cho 2 instance độc lập trong 1 component.
      test.skip(!hasEntryTab, 'không vào được tab 摘要記載事項一覧')
      await expectClientGrid(fgDialog, '摘要欄記載選択/パック', 'packNm')
      await step()
    })
  })

  // ─── #9 薬 剤 選 択 (Shift+F6 — ON_LAYER F6 = 薬剤) ────────────────────────
  test.describe('#9 薬剤選択 — Shift+F6', () => {
    let opened = false
    let rowCount = 0

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test('Shift+F6 mở được 薬剤選択', async () => {
      const before = await dialog.count()
      await page.keyboard.press('Shift+F6')
      opened = await openedNewDialog(before)
      expect(opened, 'Shift+F6 không mở được 薬剤選択').toBe(true)
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      rowCount = await expectClientGrid(fgDialog, '薬剤選択', 'trtNm')
      await step()
    })

    test('TC-3 — sort コード (numeric)', async () => {
      test.skip(!opened || rowCount < 2, `chỉ ${rowCount} dòng → so thứ tự vô nghĩa`)
      await expectSortBehaviour(fgDialog, '薬剤選択', 'コード', 'trtCd', true)
      await step()
    })
  })

  // ─── #6 パック処置選択 (tab パック → click 1 パック có dòng) ────────────────
  test.describe('#6 パック処置選択 — tab パック', () => {
    let opened = false
    let rowCount = 0

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test('click 1 パック mở được picker', async () => {
      await page.getByRole('button', { name: 'パック', exact: true }).click()
      const packRows = page.locator('div[class*="grid-cols-[42px_1fr]"]')
      await expect(packRows.nth(2)).toBeVisible({ timeout: 30000 })
      const packTitle = page.getByText('パック処置選択')
      const noTrtAlert = page.getByText('算定可能な処置はありません')

      // パック không có 処置 nào算定được thì app bung alert thay vì picker — thử
      // lần lượt tối đa 12 パック đầu cho tới khi ra picker.
      const total = Math.min(await packRows.count(), 12)
      for (let i = 1; i < total && !opened; i++) {
        await packRows.nth(i).click()
        await expect(packTitle.or(noTrtAlert).first())
          .toBeVisible({ timeout: 20000 })
          .catch(() => {})
        if (await noTrtAlert.count()) {
          await page.getByRole('button', { name: 'OK' }).click()
          await page.waitForTimeout(500)
          continue
        }
        if (await packTitle.count()) opened = true
      }

      expect(opened, 'không パック nào mở được パック処置選択 — đổi TEST_PAT_NO').toBe(true)
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      rowCount = await expectClientGrid(fgDialog, 'パック処置選択', 'trtNm')
      await step()
    })

    test('TC-3 — sort コード (numeric)', async () => {
      test.skip(!opened || rowCount < 2, `chỉ ${rowCount} dòng → so thứ tự vô nghĩa`)
      await expectSortBehaviour(fgDialog, 'パック処置選択', 'コード', 'trtCd', true)
      await step()
    })
  })

  // ─── #7 ガイド処置選択 (tab ガイド → 全て表示 → click row) ──────────────────
  test.describe('#7 ガイド処置選択 — tab ガイド', () => {
    let opened = false
    let rowCount = 0

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test('click 1 ガイド mở được picker', async () => {
      await page.getByRole('button', { name: 'ガイド', exact: true }).click()
      const showAll = page.getByRole('button', { name: '全て表示' })
      if (await showAll.count()) {
        await showAll.click()
        await page.waitForTimeout(1000)
      }
      const guideRows = page.locator('div[class*="grid-cols-[40px_1fr]"]')
      const guideTitle = page.getByText('ガイド処置選択')

      const total = Math.min(await guideRows.count(), 12)
      for (let i = 1; i < total && !opened; i++) {
        await guideRows.nth(i).click()
        await guideTitle.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
        if (await guideTitle.count()) opened = true
      }

      expect(opened, 'không ガイド nào mở được ガイド処置選択 — đổi TEST_PAT_NO').toBe(true)
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      rowCount = await expectClientGrid(fgDialog, 'ガイド処置選択', 'trtNm')
      await step()
    })

    test('TC-3 — sort コード (numeric)', async () => {
      test.skip(!opened || rowCount < 2, `chỉ ${rowCount} dòng → so thứ tự vô nghĩa`)
      await expectSortBehaviour(fgDialog, 'ガイド処置選択', 'コード', 'trtCd', true)
      await step()
    })
  })

  // ─── #15 歯周疾患治療履歴 (nút P ở header → F2 P履歴) ───────────────────────
  test.describe('#15 歯周疾患治療履歴 — P → F2', () => {
    let opened = false

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test('P → F2 mở được 歯周疾患治療履歴', async () => {
      const pBtn = page.getByRole('button', { name: 'P', exact: true })
      expect(await pBtn.count(), 'không thấy nút P ở header').toBeGreaterThan(0)

      const before = await dialog.count()
      await pBtn.first().click()
      expect(await openedNewDialog(before), 'nút P không mở được 歯周情報').toBe(true)
      await step()

      await page.keyboard.press('F2')
      const hist = page.getByText('歯周疾患治療履歴')
      await hist.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
      opened = (await hist.count()) > 0
      expect(opened, 'F2 P履歴 không mở được 歯周疾患治療履歴').toBe(true)
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      // Có 2 dialog chồng nhau (歯周情報 + 履歴) → fgDialog đã là cái CUỐI CÙNG.
      test.skip(!opened, 'dialog không mở được')
      await expectClientGrid(fgDialog, '歯周疾患治療履歴', 'dspTrt')
      await step()
    })

    test('rowHeight=44 — dòng không bị bóp về mặc định', async () => {
      // trouble-2 rủi ro #5: cell 部位 vẽ tooth chart nên cần 44px; facade nuốt
      // mất prop này thì các dòng sẽ đè lên nhau.
      test.skip(!opened, 'dialog không mở được')
      const rowBox = await fgDialog.locator('[data-testid^="row-"]').first().boundingBox()
      test.skip(!rowBox, 'grid rỗng → không đo được chiều cao dòng')
      expect(
        rowBox!.height,
        `歯周疾患治療履歴: rowHeight bị bóp còn ${rowBox!.height}px (kỳ vọng ~44) → dòng sẽ đè nhau`,
      ).toBeGreaterThan(30)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 診療入力 — 4 grid nằm sau CHUỖI NHẬP 処置. Đường đi lấy từ trouble-1 (đã kiểm
// chứng chạy được), không dò lại từ đầu. Để CUỐI FILE vì nhóm này GHI DỮ LIỆU
// THẬT — chạy trước là làm bẩn tiền đề của các nhóm trên.
// ═══════════════════════════════════════════════════════════════════════════
test.describe('診療入力 — chuỗi nhập 処置 (GHI DỮ LIỆU THẬT)', () => {
  const trtPicker = () => page.getByText('処置選択', { exact: true })
  const disTitle = () => page.getByText(/病\s*名\s*選\s*択/)
  /** `exact` — nếu không sẽ match luôn 「ユーザー摘要コメント選択」 (frm203019). */
  const sumCmtTitle = () => page.getByText('摘要コメント選択', { exact: true })

  /** Chọn dòng 点数=PICK_SCORE trong 処置選択 đang mở rồi chốt bằng dblclick. */
  const pickScoreRow = async () => {
    // Sau TC-3 grid đã bị sort lại nên PHẢI đọc lại danh sách 点数 theo thứ tự
    // ĐANG HIỂN THỊ, không dùng index cũ.
    // ⚠️ Cột `score1` của picker nay in KẾT QUẢ getTensu chứ không phải score1 thô
    // (modMain.cs:659 ghi getTensu vào tblTrtSel c04). Với bệnh nhân test hiện tại
    // (người lớn, dis_flg 0, ngày không 訪問診療) getTensu == score1 nên PICK_SCORE
    // vẫn khớp. Đổi sang bệnh nhân 乳幼児/障害 thì phải đổi TEST_PICK_SCORE theo —
    // "không tìm thấy dòng" ở đây là DỮ LIỆU, không phải lỗi app.
    const scores = await cells(fgDialog, 'score1').allTextContents()
    const pickIdx = scores.findIndex((s) => s.trim() === PICK_SCORE)
    expect(
      pickIdx,
      `処置選択 không có dòng nào 点数=${PICK_SCORE} (thấy: ${scores.join(', ')})`,
    ).toBeGreaterThan(-1)
    await rows(fgDialog).nth(pickIdx).dblclick()
    await expect(trtPicker()).toBeHidden({ timeout: 15000 })
  }

  /**
   * Nhập MỘT dòng pack MỚI: gõ mã vào ô 点 → Enter → 処置選択 → chốt dòng
   * 点数=PICK_SCORE. Trả về khi picker đã đóng, tức con trỏ ĐANG ở ô 回.
   */
  const enterPackRow = async () => {
    await drainAlerts()
    await page.locator('[data-grid-cell$="|3"]').last().click()
    await page.keyboard.type(TRT_CD)
    await page.keyboard.press('Enter')
    await expect(trtPicker()).toBeVisible({ timeout: 20000 })
    await pickScoreRow()
  }

  test.beforeAll(async () => {
    await gotoTreatmentEntry()
    await step()
  })

  // ─── #8 処置選択 ──────────────────────────────────────────────────────────
  test.describe('#8 処置選択 — コードモード', () => {
    let opened = false

    test(`Shift+F10 コードモード → gõ ${TRT_CD} vào cell 点 → Enter mở picker`, async () => {
      // Shift+F10 = コードモード (F9 点数 / F10 コード nằm ở layer Shift của FKeyBar).
      // F10 TRẦN là 戻る — bấm nhầm là thoát màn hình.
      await page.keyboard.press('Shift+F10')

      // Chốt lại là mode ĐÃ đổi, trước khi gõ. Nút mode ở PatientInfoHeader là
      // bằng chứng nhìn thấy được; thiếu nó thì một phím F bị nuốt sẽ hoá thành
      // 「該当処置はありません。」 ở tận bước Enter và trông y như lỗi app.
      await expect(
        // Neo theo `title` (lbInpMode, patient-info-header.tsx:141), KHÔNG theo
        // tên "点数"/"コード" — grid còn cột header trùng chữ.
        page.locator('button[title^="点数/コード"]'),
        'Shift+F10 không chuyển được sang コードモード (phím F bị nuốt?)',
      ).toHaveText('コード', { timeout: 10000 })
      await step()
      await page.locator('[data-grid-cell$="|3"]').last().click()
      await page.keyboard.type(TRT_CD)
      await step()
      await page.keyboard.press('Enter')

      await expect(trtPicker(), `gõ ${TRT_CD} vào cell 点 không mở được 処置選択`).toBeVisible({
        timeout: 20000,
      })
      opened = true
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectClientGrid(fgDialog, '処置選択', 'trtNm')
      await step()
    })

    test('TC-3 — sort コード (numeric)', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectSortBehaviour(fgDialog, '処置選択', 'コード', 'trtCd', true)
      await step()
    })
  })

  // ─── #12 摘要コメント選択 ─────────────────────────────────────────────────
  test.describe('#12 摘要コメント選択 — Enter tại cell 回', () => {
    let opened = false

    test.afterAll(async () => {
      await closeDialogs(page)
    })

    test(`chọn dòng 点数=${PICK_SCORE} ở 処置選択 rồi Enter tại cell 回`, async () => {
      await pickScoreRow()
      await step()

      // KHÔNG click lại ô 回 trước khi Enter. Sau khi 処置選択 đóng, con trỏ ĐÃ
      // nằm trong ô 回 ở chế độ sửa (value 1), và cascade 摘要コメント選択 CHỈ chạy ở
      // lần commit ĐẦU của dòng vừa thêm — click lại đúng ô đó rồi Enter cũng
      // KHÔNG bao giờ mở lại được (đo trong summary-comment-selection-enter.spec.ts:288).
      // Cũng KHÔNG dọn alert trước Enter: mỗi thao tác chen vào là mất nhịp.
      //
      // Thử tối đa 2 lần — cú Enter phải rơi đúng lúc ô 回 còn đang sửa, mà alert
      // W00100 của lần commit có thể xen ngang và ăn mất Enter. Lần 2 nhập hẳn
      // một dòng pack MỚI thay vì bấm lại, vì dòng cũ đã hết cửa cascade.
      for (let attempt = 1; attempt <= 2 && !opened; attempt++) {
        if (attempt > 1) {
          console.log(`#12 chưa mở sau lần nhập ${attempt - 1}/2 → nhập lại dòng pack mới`)
          await enterPackRow()
        }
        await page.keyboard.press('Enter')
        opened = await sumCmtTitle()
          .waitFor({ state: 'visible', timeout: attempt === 1 ? 12000 : 30000 })
          .then(
            () => true,
            () => false,
          )
      }

      // Alert W00100 bung SAU khi #7 mở và ĐÈ lên nó — dọn ngay, nếu không mọi
      // thao tác phía sau (click header sort) đều đụng overlay của alert.
      await drainAlerts()
      expect(
        opened,
        `Enter tại cell 回 không mở 摘要コメント選択 — mã ${TRT_CD}/点数 ${PICK_SCORE} phải ` +
          `thuộc pack_type=1 có >1 candidate`,
      ).toBe(true)
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectClientGrid(fgDialog, '摘要コメント選択', 'dispText')
      await step()
    })

    test('TC-3 — sort 摘要欄記載内容 (text)', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectSortBehaviour(fgDialog, '摘要コメント選択', '摘要欄記載内容', 'dispText')
      await step()
    })
  })

  // ─── #14 病名選択 (grid 親) ───────────────────────────────────────────────
  test.describe('#14 病名選択 (親) — panel 病検', () => {
    let opened = false
    let parentRows = 0

    test('panel 病検 → 変更 → row → 部位選択 → End mở được 病名選択', async () => {
      // Không có đường trực tiếp: panel 病検 → nút 変更 → click 1 dòng 病検 →
      // 部位選択 mở → 確定 bằng phím End (F9 ở đó là Br例) → 病名選択.
      await page
        .getByRole('button', { name: '病検', exact: true })
        .click()
        .catch(() => {})
      const changeBtn = page.getByRole('button', { name: '変更', exact: true })
      expect(await changeBtn.count(), 'không thấy nút 変更 ở panel 病検').toBeGreaterThan(0)
      await changeBtn.click()

      const byoRows = page.locator('div[class*="grid-cols-[40px_270px_1fr]"]')
      await expect(byoRows.nth(1), 'panel 病検 chưa có dòng nào — đổi TEST_PAT_NO').toBeVisible({
        timeout: 20000,
      })
      await byoRows.nth(1).click()
      await step()

      const toothTitle = page.getByText(/部\s*位\s*選\s*択/)
      await expect(toothTitle, 'không mở được 部位選択 từ panel 病検').toBeVisible({
        timeout: 20000,
      })
      await page.keyboard.press('End')

      await expect(disTitle().first(), 'không mở được 病名選択').toBeVisible({ timeout: 25000 })
      opened = true
      await step()
    })

    test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
      test.skip(!opened, 'dialog không mở được')
      parentRows = await expectClientGrid(fgDialog, '病名選択/親', 'disNm')
      await step()
    })

    test('TC-3 — sort 病名 (text)', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectSortBehaviour(fgDialog, '病名選択/親', '病名', 'disNm')
      await step()
    })

    test('parity WinForm — sort 病名 asc ra ĐÚNG thứ tự frm902007', async () => {
      test.skip(!opened, 'dialog không mở được')
      await expectWinFormOrder(fgDialog, '病名選択/親', 'disNm', WINFORM_DISEASE_ORDER)
      await step()
    })

    // ─── #13 病名選択 (grid 細分類) ─────────────────────────────────────────
    test.describe('#13 病名選択 (細分類) — drilldown', () => {
      let drilled = false

      test.afterAll(async () => {
        await closeDialogs(page)
      })

      test('chọn 1 dòng cha có 細分類 để vào grid THỨ HAI', async () => {
        // Grid THỨ HAI trong cùng dialog (trouble-2 rủi ro #6). Nhận biết đã vào
        // được bằng việc cột 枝番 (disSb) xuất hiện.
        test.skip(!opened, 'dialog 病名選択 không mở được')

        const tryRows = Math.min(parentRows, 8)
        for (let i = 0; i < tryRows && !drilled; i++) {
          await rows(fgDialog).nth(i).dblclick()
          await page.waitForTimeout(800)
          if (await cells(fgDialog, 'disSb').count()) drilled = true
          else if (!(await disTitle().count())) break // dialog đã đóng vì commit thẳng
        }

        expect(drilled, 'không dòng 病名 nào có 細分類 — đổi TEST_PAT_NO').toBe(true)
        await step()
      })

      test('TC-1 — đủ dòng, dòng đầu có nội dung, KHÔNG skeleton', async () => {
        test.skip(!drilled, 'không vào được grid 細分類')
        await expectClientGrid(fgDialog, '病名選択/細分類', 'disNm')
        await step()
      })

      test('TC-3 — sort 枝番 (numeric)', async () => {
        test.skip(!drilled, 'không vào được grid 細分類')
        await expectSortBehaviour(fgDialog, '病名選択/細分類', '枝番', 'disSb', true)
        await step()
      })
    })
  })
})
