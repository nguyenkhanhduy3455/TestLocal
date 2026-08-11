/**
 * 加算ボタン 時間外(&J) · 休日(&K) · 深夜(&S) — màn 診療入力 (frm203002).
 *
 * File này GỘP `kasan-shinya-button.spec.ts` (cũ, chỉ 深夜) + phần 3 nút, vì cả 3
 * nút chạy CÙNG một đường code nên tách file chỉ tốn thêm 1 lần login (Rule 10.1).
 *
 * ── FACT từ WinForm (nguồn gốc chuẩn) ────────────────────────────────────────
 * `frm203002.cs:1104-1123` — btnJikangai/btnKyuujitu/btnSinya → KeyFunc(1001/1002/1003).
 * `frm203002.cs:4839-4870` — cả 3 chỉ set `ModCommon.KasanTyp` (eJikangai=2 /
 *   eKyujitu=3 / eSinya=4) rồi gọi CHUNG `ModMain.Kasan(con)`.
 * `modMain.cs:1228-1499` — thân `Kasan()`:
 *   · 1258 `dtTgtDate` = ngày của DÒNG CON TRỎ (`hFG1[0, CurrentCellAddress.Y]`),
 *     KHÔNG phải 処置日 của màn hình → TC-6.
 *   · 1266-1270 chỉ duyệt dòng CÙNG NGÀY con trỏ, day≠0, `hFG1[51]==2` (処置行).
 *   · 1272-1330 初診(100 / 107-0) → 加算 trt_sb 0 · 再診(110/111 / 107-1) → trt_sb 1;
 *     1284 từ 2006/01/04 + <6 tuổi → 乳児 (trt_sb 3 / 4) → TC-11a.
 *   · 1276 guard 二重算定 so với CẢ MẢNG {101,102,103,104} ⇒ khác loại cũng chặn → TC-11b.
 *   · 1414 dòng thường: chỉ `tm_flg==1 && score1!=0`; 1429 点 = Calc_Kasan2
 *     (時間外 4/10, 休日・深夜 8/10, trừ 装着料).
 *   · 1464-1466 加算行: 点 = số tính được, **回 luôn = 1**, 部位 KHÔNG ghi → TC-4c/TC-11a.
 *   · 1474-1489 sau vòng lặp: DispDayPoint + Calc_MDPoint → cập nhật 日計/月計
 *     (`lbAllPoint`/`lbDays`) → TC-5b.
 *   · 1491 con trỏ nhảy xuống DÒNG CUỐI lưới → TC-5.
 *
 * ── Sai khác WinForm ↔ Web đã biết (KHÔNG assert, ghi để khỏi quên) ──────────
 *  · `frm203002.cs:3167-3172`: `pInpOpt[53]==1` thì ẩn CẢ 3 nút. Web chưa port —
 *    không có đường bật option này từ E2E nên chỉ ghi chú tại đây.
 *  · Gating mnemonic khi có `[role=dialog]` (TC-2) là RÀNG BUỘC CỦA WEB, không có
 *    trong WinForm (WinForm modal tự nuốt phím). Vẫn giữ vì đó là hợp đồng của
 *    `category-tabs.tsx`, nhưng đừng nhầm là hành vi WinForm.
 *
 * ── Vì sao vừa stub vừa gọi thật ─────────────────────────────────────────────
 *  · 点数 do BE tính (§calc-in-be) ⇒ chạy thật không đoán trước được giá trị, assert
 *    nội dung dòng chèn sẽ thành "app trả gì cũng đúng".
 *    → Phần CHÈN LƯỚI kiểm bằng response stub cố định: biết trước neo là rowId nào.
 *  · Stub không chứng minh BE còn sống ⇒ cuối bài bấm THẬT (TC-11) và đối chiếu
 *    thẳng với luật WinForm: 回=1, trt_sb của 再診, guard 二重算定 khác loại.
 *
 * ⚠️ Hợp đồng neo là `afterRowId` (id dòng), KHÔNG phải `afterIndex`. Bản đầu của
 * spec cũ stub `afterIndex` nên app bỏ qua và test đỏ oan — app đúng, spec sai.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (Rule 10.1), nên login + mở màn + cài route stub làm đúng một lần ở
 * beforeAll. Thứ tự testcase CÓ ý nghĩa (TC-4/TC-5 đọc kết quả chèn của TC-3,
 * TC-6 đọc tập dòng của TC-3, TC-11b/c đọc lưới sau lần bấm thật của TC-11a) —
 * chạy lẻ một testcase ở giữa sẽ hỏng.
 *
 * TỰ SEED DỮ LIỆU: không dựa vào 処置 có sẵn của bệnh nhân. `beforeAll` seed 処置行
 * vào HAI ngày (TRT_DT và TRT_DT_2 — ngày thứ hai để kiểm luật "theo ngày con trỏ"),
 * `afterAll` dọn cả hai. Cần TEST_DB=1.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân tham chiếu — chỉ dùng để KẾ THỪA pat_br/insu_cd khi seed 処置行. */
const PAT_NO = process.env.TEST_PAT_NO ?? '11'

/** Ngày test tự sở hữu (seed vào, dọn ra) — cùng 処置月 mà màn render được. */
const TRT_DT = process.env.TEST_TRT_DT ?? '2009-05-20'
/** Ngày thứ hai CÙNG 処置月 — chỉ để kiểm luật "gom dòng theo NGÀY CON TRỎ". */
const TRT_DT_2 = process.env.TEST_TRT_DT_2 ?? '2009-05-21'

const KASAN_URL = '**/tenant/treatment/resolve-kasan'

/** WinForm `ModCommon.eKasan` (modCommon.cs:77) ⇄ FE `api/kasan-api.ts` KasanType. */
const KASAN_TYPE = { jikangai: 2, kyujitu: 3, sinya: 4 } as const
/** 加算コード tương ứng (modMain.cs:1286/1301/1315). */
const KASAN_CD = { jikangai: 101, kyujitu: 102, sinya: 103 } as const

type KasanKey = keyof typeof KASAN_TYPE
const KINDS = ['jikangai', 'kyujitu', 'sinya'] as const

/** Nhãn nút thật trong UI (category-tabs.tsx render `&amp;` → `&`). */
const BTN: Record<KasanKey, string> = {
  jikangai: '時間外(&J)',
  kyujitu: '休日(&K)',
  sinya: '深夜(&S)',
}

/** Mnemonic WinForm (access key của GradientButton) — web bắt theo `e.code`. */
const ALT_KEY: Record<KasanKey, string> = {
  jikangai: 'Alt+j',
  kyujitu: 'Alt+k',
  sinya: 'Alt+s',
}

/**
 * 点/回 của 2 dòng stub.
 *
 * B_CNT = 2 là CỐ Ý dù WinForm luôn ghi 回=1 (modMain.cs:1465): ở đây đang kiểm
 * FE có render đúng `cnt` BE trả về hay không (không được hardcode). Luật "回 luôn
 * = 1" là của BE và được đối chiếu ở TC-11a bằng response THẬT.
 */
const A_SCORE = 111
const B_SCORE = 222
const A_CNT = 1
const B_CNT = 2

/** 再診 — seed vào TRT_DT để TC-11a soi được trt_sb của 加算行 (modMain.cs:1328). */
const SAISIN_CD = 110
/** 初診 — seed vào TRT_DT_2 (ngày khác) cho TC-6. */
const SHOSIN_CD = 100

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim. */
const txt = (s: string) => s.normalize('NFKC').trim()

interface KasanReqRow {
  rowId: string
  trtCd: number
  trtSb: number
  cnt: number
  isTreatment: boolean
}
interface KasanReq {
  patNo: number
  trtDt: string
  kasanType: number
  rows: KasanReqRow[]
}
interface KasanRespRow {
  afterRowId?: string
  trtCd?: number
  trtSb?: number
  trtNm?: string
  score?: number
  cnt?: number
}

interface GridRow {
  key: string
  text: string
}

/** Ô 療法・処置 của MỌI dòng lưới, đúng thứ tự hiển thị (footer 日計 không có cột này). */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

/** [{rowKey, text}] của cả lưới theo thứ tự hiển thị. */
async function gridRows(page: Page): Promise<GridRow[]> {
  const raw = await ryoCells(page).evaluateAll((els) =>
    els.map((e) => ({
      key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
      text: (e.textContent ?? '').trim(),
    })),
  )
  return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
}

/**
 * 合計 ở header (WinForm `lbAllPoint`, modMain.cs:1488) — đọc số 点 hiện tại.
 *
 * `合計:` là TEXT NODE TRẦN trong div hàng (patient-info-header.tsx:94), không có
 * element riêng bọc nó ⇒ `getByText('合計:', {exact:true})` KHÔNG match gì cả
 * (element gần nhất là cả div hàng: "患者番号: … 合計: … 実日数: …").
 * Dùng regex non-exact: Playwright chỉ trả element SÂU NHẤT khớp — div `0 点` bên
 * trong không chứa `合計:` nên không nuốt match ⇒ trúng đúng div hàng, bỏ `..`.
 */
async function headerTotal(page: Page): Promise<number> {
  const box = page.getByText(/合計:\s*[\d,]+\s*点/).first()
  const t = (await box.innerText()).replace(/\s+/g, ' ')
  const m = t.match(/合計:\s*([\d,]+)\s*点/)
  if (!m) throw new Error(`Không đọc được 合計 ở header (text: "${t}")`)
  return Number(m[1]!.replace(/,/g, ''))
}

/** Chờ lưới ở lần nạp ĐẦU (cold: Vite dev server phải transform cả module graph). */
const GRID_LOAD_TIMEOUT_MS = 60_000
/** Chờ lưới ở các lần nạp lại (module graph đã ấm) — ngắn hơn để retry còn kịp. */
const GRID_RELOAD_TIMEOUT_MS = 30_000
/**
 * Số lần thử nạp màn 診療入力. >1 vì Vite dev server thỉnh thoảng trả ERR_FAILED
 * cho một module /src/*.ts khi hard-reload → React không mount, body rỗng.
 * Đây là flake của DEV SERVER, không phải lỗi app; goto lại là hết.
 */
const GRID_LOAD_ATTEMPTS = 3

/**
 * Mở (hoặc nạp lại) màn 診療入力 của (PAT_NO, TRT_DT) và chờ lưới CÓ DỮ LIỆU.
 *
 * Chờ ĐÚNG thứ: ô 療法 của lưới, KHÔNG phải ô 点 (`|3`) — footer 日計 cũng có ô `|3`
 * nên nó hiện lên khi lưới vẫn còn rỗng; bấm 加算 lúc đó thì `currentRows` rỗng,
 * `handleKasan` return sớm và KHÔNG gọi API (đã dính ở bản trước).
 */
async function openTreatmentScreen(page: Page) {
  let lastErr: unknown
  for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
    await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
    try {
      await expect(
        ryoCells(page).first(),
        'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
      ).toBeVisible({ timeout: attempt === 1 ? GRID_LOAD_TIMEOUT_MS : GRID_RELOAD_TIMEOUT_MS })
      await closeDialogs(page)
      return
    } catch (e) {
      lastErr = e
      console.log(
        `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới ` +
          '(nhiều khả năng Vite dev server nhả hụt một module /src/*.ts) — nạp lại',
      )
    }
  }
  throw lastErr
}

// Cần seed 処置行 ở tầng DB → chỉ chạy khi TEST_DB bật (local). Production không
// đặt TEST_DB nên skip, đúng triết lý của tests/db.ts.
test.skip(!dbEnabled, 'Cần TEST_DB=1 để tự seed 処置行 cho ngày test')

/** 処置行 seed vào TRT_DT — >=2 dòng để dòng neo đầu/cuối KHÁC nhau (lộ bug splice). */
const SEED_ROWS = [
  { trtCd: SAISIN_CD, trtSb: 0, trtCnt: 1, trtPt: 40 }, // 再診
  { trtCd: 270, trtSb: 0, trtCnt: 1, trtPt: 45 }, // 処置
  { trtCd: 264, trtSb: 2, trtCnt: 1, trtPt: 12 }, // 処置
]
/** 処置行 của NGÀY KHÁC — chỉ phục vụ TC-6 (luật "theo ngày con trỏ"). */
const SEED_ROWS_DAY2 = [
  { trtCd: SHOSIN_CD, trtSb: 0, trtCnt: 1, trtPt: 234 }, // 初診
  { trtCd: 270, trtSb: 0, trtCnt: 1, trtPt: 45 }, // 処置
]

test.beforeAll(async () => {
  await seedTreatmentRows(Number(PAT_NO), TRT_DT, SEED_ROWS)
  await seedTreatmentRows(Number(PAT_NO), TRT_DT_2, SEED_ROWS_DAY2)
})

test.afterAll(async () => {
  await deleteTreatmentRows(Number(PAT_NO), TRT_DT)
  await deleteTreatmentRows(Number(PAT_NO), TRT_DT_2)
})

// timeout nới rộng: openTreatmentScreen có thể phải nạp lại tới GRID_LOAD_ATTEMPTS
// lần (60s + 30s + 30s) khi dev server nhả hụt module, cộng thêm login ở beforeAll.
test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 加算ボタン 時間外(&J)/休日(&K)/深夜(&S)', () => {
  let page: Page
  let step: () => Promise<void>

  // ─── Trạng thái route stub, chia sẻ giữa các testcase ─────────────────────
  let calls = 0
  let lastReq: KasanReq | null = null
  let anchorA = ''
  let anchorB = ''
  /** 'anchors' = trả 2 加算行 neo đầu/cuối · 'empty' = trả [] · 'passthrough' = BE thật. */
  let stubMode: 'anchors' | 'empty' | 'passthrough' = 'anchors'
  /** Loại 加算 testcase hiện tại đang bấm — quyết định 加算コード/tên dòng stub. */
  let stubKind: KasanKey = 'sinya'

  const nameA = (k: KasanKey) => `ZZ加算テスト${KASAN_CD[k]}A`
  const nameB = (k: KasanKey) => `ZZ加算テスト${KASAN_CD[k]}B`

  // ─── Ảnh chụp lưới, truyền từ testcase này sang testcase sau ──────────────
  /** Lưới TRƯỚC lần bấm 深夜 đầu tiên (TC-3a chụp). */
  let before: GridRow[] = []
  /** Lưới SAU lần chèn stub (TC-3a chụp) — TC-4/TC-5 đọc lại. */
  let after: GridRow[] = []
  /** 合計 ở header TRƯỚC lần chèn (TC-3a chụp) — TC-5b so lại. */
  let totalBefore = 0
  /** Request của chính lần bấm chèn (TC-3a giữ lại; các TC sau ghi đè lastReq). */
  let insertReq: KasanReq | null = null
  /** Lưới sau lần bấm THẬT đầu tiên (TC-11a chụp) — TC-11b/c so lại. */
  let afterReal: string[] = []
  /**
   * rowId của một dòng thuộc TRT_DT (TC-11a chụp) — TC-11b/c click lại để KÉO CON
   * TRỎ VỀ ngày đó trước khi bấm tiếp.
   *
   * Vì sao cần: sau mỗi lần chèn, con trỏ nhảy xuống DÒNG CUỐI lưới
   * (modMain.cs:1491 — chính TC-5 chốt luật này), mà lưới web hiển thị CẢ 処置月
   * nên dòng cuối thuộc TRT_DT_2, không phải TRT_DT. Lần bấm sau đó do đó tính
   * 加算 cho ngày 21 (đúng luật "theo ngày con trỏ", modMain.cs:1258) và chèn
   * 休日加算(初診時) cho dòng 初診 của ngày 21 — KHÔNG phải 二重算定. Không neo lại
   * con trỏ thì TC-11b/c đang đo nhầm ngày.
   */
  let day1AnchorRowId = ''

  /** Kéo con trỏ về một dòng của TRT_DT (xem `day1AnchorRowId`). */
  async function anchorCursorToDay1() {
    expect(
      day1AnchorRowId,
      'TIỀN ĐỀ FAIL: TC-11a chưa chụp được rowId của dòng thuộc TRT_DT',
    ).not.toBe('')
    await page.locator(`[data-grid-cell="${day1AnchorRowId}|3"]`).click()
    await closeDialogs(page)
  }

  /** Bấm một nút 加算 và chờ đúng 1 request mới bắn ra. */
  async function clickKasan(kind: KasanKey) {
    stubKind = kind
    const callsBefore = calls
    await page.getByRole('button', { name: BTN[kind] }).click()
    await expect
      .poll(() => calls, {
        message: `Nút ${BTN[kind]} không bắn POST /tenant/treatment/resolve-kasan`,
        timeout: 20000,
      })
      .toBe(callsBefore + 1)
  }

  /** Bấm mnemonic Alt+? và chờ đúng 1 request mới bắn ra. */
  async function pressKasan(kind: KasanKey) {
    stubKind = kind
    const callsBefore = calls
    await page.keyboard.press(ALT_KEY[kind])
    await expect
      .poll(() => calls, {
        message: `${ALT_KEY[kind]} (mnemonic của ${BTN[kind]}) không bắn resolve-kasan`,
        timeout: 20000,
      })
      .toBe(callsBefore + 1)
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    // Lỗi JS chưa bắt làm React không mount → lưới rỗng và test đỏ ở chỗ khó hiểu.
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    // ─── Login + vào màn 診療入力 ──────────────────────────────────────────
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(page).toHaveURL(/\/$/)

    await openTreatmentScreen(page)

    // ─── Một route duy nhất, đổi hành vi qua `stubMode` ────────────────────
    // Cài SAU khi lưới đã nạp xong: từ đây mọi lần resolve-kasan đều do thao tác
    // của testcase gây ra, nên `calls` đếm được và TC-2 mới assert được == 0.
    await page.route(KASAN_URL, async (route: Route) => {
      calls++
      const body = route.request().postDataJSON() as KasanReq
      lastReq = body
      if (stubMode === 'passthrough') return route.fallback()

      const treat = body.rows.filter((r) => r.isTreatment)
      let rows: unknown[] = []
      if (stubMode === 'anchors' && treat.length > 0) {
        anchorA = treat[0]!.rowId
        anchorB = treat[treat.length - 1]!.rowId
        const cd = KASAN_CD[stubKind]
        const nA = nameA(stubKind)
        const nB = nameB(stubKind)
        rows = [
          { afterRowId: anchorA, trtCd: cd, trtSb: 1, trtNm: nA, score: A_SCORE, cnt: A_CNT },
          { afterRowId: anchorB, trtCd: cd, trtSb: 2, trtNm: nB, score: B_SCORE, cnt: B_CNT },
        ]
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rows } }),
      })
    })
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // ═══ TC-1 — đủ 3 nút, đúng nhãn ══════════════════════════════════════════
  // WinForm frm203002.Designer.cs:2306/2326/2346 — 3 GradientButton cạnh nhau.
  test('TC-1 — CategoryTabs có đủ 3 nút 時間外(&J) / 休日(&K) / 深夜(&S)', async () => {
    for (const k of KINDS) {
      await expect(
        page.getByRole('button', { name: BTN[k] }),
        `TC-1 FAIL: không thấy nút ${BTN[k]} ở CategoryTabs`,
      ).toBeVisible()
    }
    await step()
  })

  // ═══ TC-2 — mnemonic PHẢI đứng im khi có dialog đang mở ═══════════════════
  // Ràng buộc của WEB (không có trong WinForm): category-tabs.tsx chặn Alt+J/K/S
  // khi document có [role=dialog] vì tabs nằm DƯỚI modal.
  test('TC-2 — Alt+J/Alt+K/Alt+S không bắn resolve-kasan khi đang mở dialog', async () => {
    await page.keyboard.press('F7')
    await expect(
      page.getByRole('dialog'),
      'TC-2: F7 không mở được dialog để kiểm gating',
    ).toBeVisible({ timeout: 20000 })

    for (const k of KINDS) await page.keyboard.press(ALT_KEY[k])
    await page.waitForTimeout(1500)

    expect(
      calls,
      'TC-2 FAIL: mnemonic vẫn bắn resolve-kasan khi đang mở dialog — isWindowKeyBlocked ' +
        '({ blockUnderDialog: true }) không còn chặn',
    ).toBe(0)
    await closeDialogs(page)
    await step()
  })

  // ═══ TC-3a — bấm 深夜 → chèn được dòng, request mang đúng định danh ══════
  // Neo 2 dòng cách xa nhau (処置行 ĐẦU và CUỐI của ngày) để lộ bug splice: mỗi
  // insertion phải tự resolve lại vị trí neo theo id.
  test('TC-3a — bấm 深夜(&S) gọi resolve-kasan với kasanType=4, đúng bệnh nhân/ngày', async () => {
    stubMode = 'anchors'
    before = await gridRows(page)
    totalBefore = await headerTotal(page)
    await clickKasan('sinya')

    await expect(
      ryoCells(page).filter({ hasText: nameA('sinya') }),
      'TC-3 FAIL: bấm 深夜(&S) không chèn 加算行 mà BE trả về (kiểm applyKasanInsertions)',
    ).toHaveCount(1, { timeout: 20000 })

    insertReq = lastReq
    const req = insertReq!
    expect(
      req.kasanType,
      `TC-3 FAIL: 深夜 phải gửi kasanType = ${KASAN_TYPE.sinya} (eKasan.eSinya), ` +
        `nhận ${req.kasanType} — 2 là 時間外, 3 là 休日`,
    ).toBe(KASAN_TYPE.sinya)
    expect(String(req.patNo), 'TC-3 FAIL: patNo trong request khác bệnh nhân đang mở').toBe(PAT_NO)
    expect(
      String(req.trtDt).slice(0, 10),
      'TC-3 FAIL: trtDt phải là NGÀY CỦA CON TRỎ (modMain.cs:1258); mặc định = ngày đang nhập',
    ).toBe(TRT_DT)

    after = await gridRows(page)
    await step()
  })

  // ═══ TC-3b — tập dòng gửi đi phải đủ và neo được ═════════════════════════
  test('TC-3b — request gửi đủ dòng của ngày, rowId hợp lệ/duy nhất, đúng thứ tự lưới', async () => {
    const req = insertReq!
    expect(
      req.rows.some((r) => r.isTreatment),
      'TIỀN ĐỀ FAIL: ngày này không có 処置行 nào (chỉ 部位病名行/dòng trống) ⇒ BE không có gì ' +
        'để tính 加算. Chạy lại với TEST_TRT_DT / TEST_PAT_NO trỏ vào ngày CÓ 処置.',
    ).toBe(true)
    // 部位病名行 / dòng 行追加 trống PHẢI được GỬI (isTreatment=false) chứ không bị lọc:
    // guard 二重算定 của WinForm soi dòng NGAY SAU (`hFG1[6, i+1]`), thiếu dòng là guard sai.
    expect(
      req.rows.every((r) => typeof r.rowId === 'string' && r.rowId !== ''),
      'TC-3 FAIL: có dòng thiếu rowId — không có id thì BE không neo được afterRowId',
    ).toBe(true)
    expect(
      new Set(req.rows.map((r) => r.rowId)).size,
      'TC-3 FAIL: rowId bị trùng trong request — neo sẽ chèn nhầm dòng',
    ).toBe(req.rows.length)
    expect(
      req.rows.map((r) => r.rowId),
      'TC-3 FAIL: request gửi sai tập/thứ tự dòng so với lưới',
    ).toEqual(before.filter((r) => req.rows.some((x) => x.rowId === r.key)).map((r) => r.key))
    console.log(
      `TC-3: gửi ${req.rows.length} dòng, ${req.rows.filter((r) => r.isTreatment).length} là 処置行`,
    )
    await step()
  })

  // ═══ TC-4a — dòng 加算 nằm NGAY DƯỚI đúng dòng neo ═══════════════════════
  // WinForm AddRow(i+1) rồi ShowTrt vào chính dòng vừa thêm (modMain.cs:1278/1324).
  test('TC-4a — 加算行 nằm NGAY DƯỚI đúng dòng neo (afterRowId), đủ 2 dòng', async () => {
    expect(after.length, 'TC-4 FAIL: BE trả 2 加算行 nhưng lưới không tăng đúng 2 dòng').toBe(
      before.length + 2,
    )

    for (const [anchor, name, label] of [
      [anchorA, nameA('sinya'), '処置行 ĐẦU'],
      [anchorB, nameB('sinya'), '処置行 CUỐI'],
    ] as const) {
      const at = after.findIndex((r) => r.key === anchor)
      expect(at, `TC-4 FAIL: không còn thấy dòng neo (${label}) trong lưới`).toBeGreaterThan(-1)
      expect(
        after[at + 1]?.text,
        `TC-4 FAIL: 加算行 "${name}" phải nằm NGAY DƯỚI dòng neo ${label} (afterRowId=${anchor}), ` +
          `nhưng dòng ngay dưới đang là "${after[at + 1]?.text ?? '(hết lưới)'}"`,
      ).toBe(txt(name))
    }
    await step()
  })

  // ═══ TC-4b — splice không được đụng vào dòng cũ ══════════════════════════
  test('TC-4b — bỏ 2 dòng mới ra thì lưới giống HỆT trước (không xáo/mất/nhân bản)', async () => {
    expect(
      after
        .filter((r) => r.text !== txt(nameA('sinya')) && r.text !== txt(nameB('sinya')))
        .map((r) => r.text),
      'TC-4 FAIL: chèn 加算行 làm xáo/mất/nhân bản các dòng cũ',
    ).toEqual(before.map((r) => r.text))
    await step()
  })

  // ═══ TC-4c — nội dung dòng 加算 lấy từ response, 部位 để trống ════════════
  // WinForm ShowTrt KHÔNG ghi 部位 cho 加算行 (modMain.cs:1502-1566) → cột 部位 rỗng.
  // 点/回 ở đây lấy theo response (kể cả cnt=2) để chứng minh FE không hardcode;
  // luật WinForm "回 luôn = 1" được đối chiếu với BE THẬT ở TC-11a.
  test('TC-4c — 点/回 đúng giá trị BE trả, 部位 để TRỐNG (加算行 buiLess)', async () => {
    for (const [name, score, cnt] of [
      [nameA('sinya'), A_SCORE, A_CNT],
      [nameB('sinya'), B_SCORE, B_CNT],
    ] as const) {
      const key = after.find((r) => r.text === txt(name))!.key
      await expect(
        page.locator(`[data-grid-cell="${key}|3"]`),
        `TC-4 FAIL: 点 của "${name}" phải = score BE trả (${score})`,
      ).toHaveText(String(score))
      await expect(
        page.locator(`[data-grid-cell="${key}|4"]`),
        `TC-4 FAIL: 回 của "${name}" phải = cnt BE trả (${cnt})`,
      ).toHaveText(String(cnt))
      expect(
        txt(await page.locator(`[data-grid-cell="${key}|1"]`).innerText()),
        `TC-4 FAIL: 加算行 "${name}" không được mang 部位 (buiLess)`,
      ).toBe('')
    }
    await step()
  })

  // ═══ TC-5 — con trỏ nhảy xuống dòng CUỐI lưới (modMain.cs:1491) ══════════
  test('TC-5 — sau khi chèn, con trỏ nằm ở ô 点 của DÒNG CUỐI lưới', async () => {
    await expect(
      page.locator(`[data-grid-cell="${after[after.length - 1]!.key}|3"]`),
      'TC-5 FAIL: sau khi chèn, con trỏ (ô vàng) phải ở ô 点 của DÒNG CUỐI lưới',
    ).toHaveClass(/bg-\[#ffffc0\]/)
    await step()
  })

  // ═══ TC-5b — 日計/月計 phải tính lại sau khi chèn 加算行 ══════════════════
  // WinForm: sau vòng lặp gọi DispDayPoint + Calc_MDPoint rồi gán lại lbAllPoint /
  // lbDays (modMain.cs:1474-1489). Web tính 合計 từ currentRows nên phải tăng đúng
  // Σ(点 × 回) của các dòng vừa chèn — hụt tức là 加算 không vào tổng tiền.
  test('TC-5b — 合計 ở header tăng đúng Σ(点 × 回) của 加算行 vừa chèn', async () => {
    const delta = A_SCORE * A_CNT + B_SCORE * B_CNT
    await expect
      .poll(() => headerTotal(page), {
        message:
          `TC-5b FAIL: 合計 phải tăng ${delta} 点 sau khi chèn 加算行 ` +
          '(WinForm Calc_MDPoint → lbAllPoint, modMain.cs:1486-1489)',
        timeout: 15000,
      })
      .toBe(totalBefore + delta)
    await step()
  })

  // ═══ TC-6 — gom dòng theo NGÀY CỦA CON TRỎ, không phải 処置日 của màn ═════
  // WinForm modMain.cs:1258 lấy `dtTgtDate` từ dòng con trỏ, và 1268 chỉ duyệt các
  // dòng CÙNG NGÀY đó. Lưới web hiển thị cả 処置月 nên đây là luật dễ port hụt nhất:
  // nếu FE cứ gửi `trtDt` của URL thì đặt con trỏ sang ngày khác vẫn tính nhầm ngày.
  test('TC-6 — đặt con trỏ ở dòng NGÀY KHÁC thì request đổi ngày và chỉ gửi dòng ngày đó', async () => {
    await openTreatmentScreen(page)
    stubMode = 'empty'

    // rowId do `newRowId()` sinh lại MỖI LẦN nạp lưới ⇒ phải lấy tập dòng của
    // TRT_DT ngay trong testcase này, không dùng lại id chụp ở TC-3a.
    await clickKasan('sinya')
    expect(
      String(lastReq!.trtDt).slice(0, 10),
      'TIỀN ĐỀ FAIL: chưa đụng con trỏ mà trtDt đã khác ngày đang mở',
    ).toBe(TRT_DT)
    const day1RowIds = lastReq!.rows.map((r) => r.rowId)

    // Dòng đầu tiên KHÔNG thuộc TRT_DT, đứng SAU nhóm dòng của TRT_DT → dòng đầu
    // của ngày kế tiếp (TRT_DT_2 vừa seed).
    const rows = await gridRows(page)
    const lastDay1 = rows.map((r) => r.key).lastIndexOf(day1RowIds[day1RowIds.length - 1]!)
    expect(
      lastDay1,
      'TC-6 FAIL: không tìm lại được dòng của TRT_DT trong lưới (seed hỏng?)',
    ).toBeGreaterThan(-1)
    const target = rows[lastDay1 + 1]
    expect(
      target,
      `TIỀN ĐỀ FAIL: không có dòng nào sau ngày ${TRT_DT} — seed của ${TRT_DT_2} không lên lưới`,
    ).toBeTruthy()

    // Click ô 点 của dòng đó để đặt con trỏ (focusedCell) sang ngày khác.
    await page.locator(`[data-grid-cell="${target!.key}|3"]`).click()
    await closeDialogs(page)
    await clickKasan('sinya')

    const req = lastReq!
    expect(
      req.rows.some((r) => r.rowId === target!.key),
      'TC-6 FAIL: request không chứa chính dòng đang đặt con trỏ',
    ).toBe(true)
    expect(
      req.rows.filter((r) => day1RowIds.includes(r.rowId)).map((r) => r.rowId),
      `TC-6 FAIL: request vẫn kèm dòng của ngày ${TRT_DT} dù con trỏ đang ở ngày khác — ` +
        'WinForm chỉ duyệt dòng CÙNG NGÀY con trỏ (modMain.cs:1268)',
    ).toEqual([])
    expect(
      String(req.trtDt).slice(0, 10),
      `TC-6 FAIL: trtDt vẫn là ${TRT_DT} (ngày của URL) thay vì ngày của dòng con trỏ — ` +
        'WinForm lấy dtTgtDate từ hFG1[0, CurrentCellAddress.Y] (modMain.cs:1258)',
    ).not.toBe(TRT_DT)
    expect(
      String(req.trtDt).slice(0, 7),
      'TC-6 FAIL: trtDt nhảy sang 処置月 khác — lưới chỉ chứa dòng trong cùng tháng',
    ).toBe(TRT_DT.slice(0, 7))
    console.log(`TC-6: con trỏ ở dòng ngày khác → request trtDt = ${String(req.trtDt).slice(0, 10)}`)
    await step()
  })

  // ═══ TC-7 — Alt+S làm ĐÚNG việc của nút ══════════════════════════════════
  // Stub trả [] ⇒ lưới không được đổi, nhưng request vẫn phải bắn.
  test('TC-7 — Alt+S bắn resolve-kasan y như bấm nút; BE trả [] thì lưới không đổi', async () => {
    await openTreatmentScreen(page)
    stubMode = 'empty'
    const gridBeforeAlt = (await gridRows(page)).map((r) => r.text)

    await pressKasan('sinya')
    expect(
      lastReq!.kasanType,
      'TC-7 FAIL: Alt+S gửi sai kasanType — phải giống hệt khi bấm nút',
    ).toBe(KASAN_TYPE.sinya)
    expect(
      (await gridRows(page)).map((r) => r.text),
      'TC-7 FAIL: BE trả 0 加算行 mà lưới vẫn đổi — FE đang tự chế dòng',
    ).toEqual(gridBeforeAlt)
    await step()
  })

  // ═══ TC-8 — 3 NÚT gửi 3 kasanType KHÁC nhau ══════════════════════════════
  // Cả 3 nút dùng chung `handleKasan` (đúng như WinForm dùng chung ModMain.Kasan),
  // nên rủi ro thật là đấu nhầm KasanTyp: app vẫn chạy, vẫn chèn dòng, chỉ tính
  // sai tiền (時間外 4/10 vs 休日・深夜 8/10) mà không có gì đỏ lên.
  test('TC-8 — 3 nút gửi lần lượt kasanType 2/3/4, không nút nào dùng nhầm loại', async () => {
    stubMode = 'empty'
    const got: Record<KasanKey, number> = { jikangai: 0, kyujitu: 0, sinya: 0 }

    for (const k of KINDS) {
      await clickKasan(k)
      got[k] = lastReq!.kasanType
    }

    expect(
      got,
      'TC-8 FAIL: nút gửi sai kasanType — 時間外=2 (eJikangai) / 休日=3 (eKyujitu) / ' +
        `深夜=4 (eSinya). Nhận được: ${JSON.stringify(got)}`,
    ).toEqual({ jikangai: 2, kyujitu: 3, sinya: 4 })
    expect(
      new Set(Object.values(got)).size,
      'TC-8 FAIL: có 2 nút gửi CÙNG một kasanType — chắc chắn đấu dây nhầm',
    ).toBe(3)
    await step()
  })

  // ═══ TC-9 — 3 MNEMONIC gửi 3 kasanType KHÁC nhau ═════════════════════════
  // Nút và mnemonic là 2 đường dẫn riêng (onClick vs listener keydown) → kiểm cả hai.
  test('TC-9 — Alt+J/Alt+K/Alt+S gửi lần lượt kasanType 2/3/4', async () => {
    stubMode = 'empty'
    const got: Record<KasanKey, number> = { jikangai: 0, kyujitu: 0, sinya: 0 }

    for (const k of KINDS) {
      await pressKasan(k)
      got[k] = lastReq!.kasanType
    }

    expect(
      got,
      'TC-9 FAIL: mnemonic gửi sai kasanType — Alt+J phải là 2 (時間外), Alt+K là 3 (休日), ' +
        `Alt+S là 4 (深夜). Nhận được: ${JSON.stringify(got)}`,
    ).toEqual({ jikangai: 2, kyujitu: 3, sinya: 4 })
    await step()
  })

  // ═══ TC-10 — đường chèn của 時間外 cũng phải chạy (không chỉ 深夜) ════════
  test('TC-10 — bấm 時間外(&J) chèn 加算行 ngay dưới đúng dòng neo', async () => {
    await openTreatmentScreen(page)
    stubMode = 'anchors'
    const gridBefore = await gridRows(page)
    await clickKasan('jikangai')

    await expect(
      ryoCells(page).filter({ hasText: nameA('jikangai') }),
      'TC-10 FAIL: bấm 時間外(&J) không chèn 加算行 mà BE trả về',
    ).toHaveCount(1, { timeout: 20000 })

    const grid = await gridRows(page)
    expect(grid.length, 'TC-10 FAIL: lưới không tăng đúng 2 dòng').toBe(gridBefore.length + 2)
    const at = grid.findIndex((r) => r.key === anchorA)
    expect(
      grid[at + 1]?.text,
      `TC-10 FAIL: 加算行 "${nameA('jikangai')}" phải nằm NGAY DƯỚI dòng neo (afterRowId=${anchorA})`,
    ).toBe(txt(nameA('jikangai')))
    await step()
  })

  // ═══ TC-11a — gọi THẬT: hợp đồng BE + luật WinForm trên dữ liệu thật ═════
  // Chạy CUỐI để các TC trên không bị chặn khi BE lỗi.
  //
  // PHẢI nạp lại lưới trước: các TC stub đã chèn dòng giả mang trtCd 101/103
  // (= mã 加算 thật) NGAY DƯỚI dòng neo. Guard 二重算定 (modMain.cs:1276 →
  // KasanCalculator.cs:209-211/:225) thấy các dòng đó là suppress sạch → BE trả []
  // → assert bên dưới chạy trên mảng rỗng và luôn đúng (vacuously true), test mất
  // răng. Dòng stub chỉ nằm client-side (chưa từng ghi DB) nên goto lại là hết.
  test('TC-11a — gọi BE THẬT (深夜): 200, afterRowId, 回=1, 再診 → 加算 trt_sb 1/4', async () => {
    await openTreatmentScreen(page)
    stubMode = 'passthrough'

    const realResp = page.waitForResponse(
      (r) => r.url().includes('/tenant/treatment/resolve-kasan') && r.request().method() === 'POST',
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: BTN.sinya }).click()
    const res = await realResp
    expect(
      res.status(),
      'TC-11 FAIL: POST /tenant/treatment/resolve-kasan không trả 200 — hợp đồng BE hỏng',
    ).toBe(200)

    const body = (await res.json()) as { data?: { rows?: KasanRespRow[] } }
    expect(
      Array.isArray(body.data?.rows),
      'TC-11 FAIL: response không đúng shape { data: { rows: [...] } }',
    ).toBe(true)
    const rows = body.data!.rows!
    // Lưới vừa nạp lại nên KHÔNG còn 加算行 nào; ngày này CÓ 処置 (TC-3b đã chốt)
    // ⇒ BE phải trả ít nhất 1 dòng, nếu không các assert dưới thành vacuously true.
    expect(
      rows.length,
      'TC-11 FAIL: lưới sạch + ngày CÓ 処置 mà BE trả 0 加算行 ⇒ hoặc guard 二重算定 bắt nhầm, ' +
        'hoặc mst_trt của các 処置 seed không có 深夜加算 (tm_flg/score1).',
    ).toBeGreaterThan(0)
    expect(
      rows.every((r) => typeof r.afterRowId === 'string' && r.afterRowId !== ''),
      'TC-11 FAIL: BE trả 加算行 thiếu afterRowId ⇒ FE không neo được, dòng bị bỏ im lặng',
    ).toBe(true)
    // 加算コード phải đúng loại đã bấm (modMain.cs:1315 深夜 = 103).
    expect(
      rows.every((r) => r.trtCd === KASAN_CD.sinya),
      `TC-11 FAIL: bấm 深夜 mà BE trả 加算行 có trt_cd ≠ ${KASAN_CD.sinya} ` +
        `(nhận: ${[...new Set(rows.map((r) => r.trtCd))].join(', ')})`,
    ).toBe(true)
    // WinForm hFG1[4, i] = 1 (modMain.cs:1465) — 加算行 luôn 回 = 1, kể cả khi
    // 処置 gốc có 回数 > 1 (số lần đã nhân vào điểm trong Calc_Kasan2).
    expect(
      rows.every((r) => Number(r.cnt) === 1),
      `TC-11 FAIL: 加算行 phải có 回 = 1 (modMain.cs:1465), nhận: ` +
        `${[...new Set(rows.map((r) => r.cnt))].join(', ')}`,
    ).toBe(true)
    // 再診行 (trt_cd 110) phải sinh 加算 trt_sb = 1, hoặc 4 nếu bệnh nhân <6 tuổi
    // và ngày >= 2006/01/04 (乳児再診, modMain.cs:1342-1377). Không được ra 0/2/3.
    const saisinReq = lastReq!.rows.find((r) => r.trtCd === SAISIN_CD)
    if (saisinReq) {
      const kasan = rows.find((r) => r.afterRowId === saisinReq.rowId)
      expect(
        kasan,
        `TC-11 FAIL: dòng 再診 (trt_cd ${SAISIN_CD}) không được cấp 加算行 nào — WinForm luôn ` +
          'sinh 再診加算 cho dòng 再診 (modMain.cs:1328)',
      ).toBeTruthy()
      expect(
        [1, 4],
        `TC-11 FAIL: 加算 của dòng 再診 phải có trt_sb = 1 (thường) hoặc 4 (乳児), ` +
          `nhận ${kasan?.trtSb}. 0/3 là 初診, 2 là 処置 — phân nhánh 初診/再診 sai.`,
      ).toContain(Number(kasan!.trtSb))
    } else {
      console.log(`TC-11: không thấy dòng 再診 ${SAISIN_CD} trong request → BỎ QUA phần trt_sb`)
    }
    console.log(
      `TC-11: BE trả ${rows.length} 深夜加算行 thật [${rows.map((r) => r.trtNm).join(', ')}]`,
    )

    // Neo cho TC-11b/c: một dòng CHẮC CHẮN thuộc TRT_DT (request này chỉ gom dòng
    // của ngày con trỏ, mà lúc bấm con trỏ vẫn ở TRT_DT).
    day1AnchorRowId = saisinReq?.rowId ?? lastReq!.rows[0]?.rowId ?? ''

    await page.waitForTimeout(1500)
    afterReal = (await gridRows(page)).map((r) => r.text)
    await step()
  })

  // ═══ TC-11b — đã có 深夜加算 thì bấm 休日 KHÔNG thêm dòng ═════════════════
  // WinForm guard so với CẢ MẢNG {101,102,103,104} (modMain.cs:1276) ⇒ khác loại
  // cũng chặn: một dòng 処置 chỉ được một 加算.
  test('TC-11b — sau 深夜, bấm 休日(&K) không thêm dòng (二重算定 khác loại)', async () => {
    // Con trỏ đang ở dòng cuối lưới (= ngày TRT_DT_2) sau lần chèn của TC-11a →
    // kéo về TRT_DT, nếu không thì đang đo 加算 của NGÀY KHÁC (xem day1AnchorRowId).
    await anchorCursorToDay1()
    const realResp = page.waitForResponse(
      (r) => r.url().includes('/tenant/treatment/resolve-kasan') && r.request().method() === 'POST',
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: BTN.kyujitu }).click()
    const res = await realResp
    expect(res.status(), 'TC-11 FAIL: lần bấm 休日 không trả 200').toBe(200)
    await page.waitForTimeout(1500)

    expect(
      (await gridRows(page)).map((r) => r.text),
      'TC-11 FAIL: dòng đã có 深夜加算 mà bấm 休日 vẫn chèn thêm — guard 二重算定 phải chặn ' +
        'cả 加算 khác loại (mảng {101,102,103,104}, modMain.cs:1276).',
    ).toEqual(afterReal)
    await step()
  })

  // ═══ TC-11c — bấm lại lần 2 không nhân dòng ══════════════════════════════
  // WinForm cũng vậy — lần 2 chỉ thấy con trỏ nhảy xuống đáy.
  test('TC-11c — bấm 深夜(&S) lần 2 không thêm dòng nào (idempotent)', async () => {
    await anchorCursorToDay1()
    const realResp = page.waitForResponse(
      (r) => r.url().includes('/tenant/treatment/resolve-kasan') && r.request().method() === 'POST',
      { timeout: 30000 },
    )
    await page.getByRole('button', { name: BTN.sinya }).click()
    const res = await realResp
    expect(res.status(), 'TC-11 FAIL: lần bấm thứ 2 không trả 200').toBe(200)
    await page.waitForTimeout(1500)

    expect(
      (await gridRows(page)).map((r) => r.text),
      'TC-11 FAIL: bấm 深夜(&S) lần 2 vẫn thêm dòng — 加算 bị nhân bản. BE phải suppress ' +
        'những 処置 đã có 加算 (ModMain.Kasan), FE không được chèn trùng.',
    ).toEqual(afterReal)
    await step()
  })
})
