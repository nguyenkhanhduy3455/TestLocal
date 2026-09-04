import { expect, test, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    seedTreatmentRows,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — cổng vào của Ｐ変更: `MonthP` gom được gì, và im lặng khi không gom được.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), và ở đây còn bám theo
 * SỐ ĐO trên chính WinForm — xem `fla-ui-tests/Tests/SigaToothStatus/README.md` mục 7.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ FILE NÀY (2026-09-04)
 * ═════════════════════════════════════════════════════════════════════════════
 * `p-mode-kesson-siga.spec.ts` đo phần SAU của Ｐ変更 (Q00100 → はい → 欠損). Nó luôn
 * seed `disSb: [0]` và luôn có sẵn một dòng Ｐ, nên KHÔNG bao giờ chạm tới cái CỔNG
 * quyết định 「MonthP có gom được dòng nào không」. Hai testcase dưới đây khoá đúng
 * cái cổng đó.
 *
 * Nhánh `fix/inp-byoken-p-winform-parity` (`4a934a58b`, merge vào demo1) sửa hai thứ
 * cùng lúc — TC-P1 xác nhận vế thứ nhất, TC-P2 kiểm vế thứ hai.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM — ĐỌC KỸ ĐIỀU KIỆN CỦA MonthP
 * ═════════════════════════════════════════════════════════════════════════════
 * frm203002.cs:7358 (`MonthP`):
 *
 *     if (hFG1[51, i] == "1") {                       // là 部位病名行
 *         if (hFG1[40, i] == "103" && hFG1[41, i] == "0") { … gom … }
 *
 * Cột 40 và 41 là GÌ — `CommonInp.getGridBuiDisInf` (CommonInp.cs:594-604) nói thẳng:
 *
 *     for (i = 0; i < dis_cd.Length; i++) {           // dis_cd.Length = 10
 *         dis_cd[i] = hFG1[i + 40, …];                // ⇒ cột 40..49 = dis_cd1..10
 *         dis_sb[i] = hFG1[i + 55, …];                // ⇒ cột 55..64 = dis_sb1..10
 *     }
 *
 * Xác nhận lần hai bằng doc-comment của `ByokenChg` (frm203002.cs:6259): hFG1[8..49]
 * được `MonthP` chép sang grdByou[3..44], mà grdByou 「35～44:DIS_CD1～10」.
 *
 * Xác nhận lần ba ở chiều GHI — `CommonInp.setGridBuiDisInf` (CommonInp.cs:574-586):
 *
 *     hFG1[i + 40, …] = dis_cd[i];
 *     hFG1[i + 55, …] = dis_sb[i];
 *
 * ⇒ `hFG1[41] == "0"` nghĩa là **`dis_cd2 == 0`**, tức 「dòng này chỉ có ĐÚNG MỘT 病名」.
 *   **KHÔNG phải** `dis_sb == 0`. 枝番 của 病名 nằm ở cột 55, `MonthP` không hề đọc.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SỐ ĐO TRÊN WINFORM THẬT (2026-09-03, bệnh nhân 10, 診療月 2026-08)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · Ｐ変更 khi tháng KHÔNG có Ｐ/Ｇ → 部位選択 KHÔNG mở, và KHÔNG hộp thoại nào bung.
 *    (`fla-ui-tests` probe Tc2, dòng `=== KQ-13a ===`.)
 *  · Dựng một 部位病名行 mang 病名 Ｐ chọn qua danh sách 病名サブコード — dòng đầu của
 *    danh sách đó là **枝番 1** (đo được: `1 | 100 | 1 | C₁ · 2 | 100 | 2 | C₂ …`), nên
 *    dòng dựng ra là `dis_cd1 = 103, dis_sb1 = 1` — rồi bấm Ｐ変更:
 *    **部位選択 MỞ RA, seed đúng tập [ô 10]** (`=== KQ-13c ===`).
 *    ⇒ Số đo này ỦNG HỘ kết luận nhưng CHƯA khép kín: danh sách 病名サブコード của Ｃ bắt
 *    đầu ở 枝番 1 (đo được), nhưng danh sách của Ｐ thì chưa đọc tận mắt. Vế đứng vững
 *    là BA chỗ trong source ở trên. Muốn khép kín thì dựng một dòng Ｐ₂ trên WinForm rồi
 *    bấm Ｐ変更 — mất khoảng hai phút, xem `fla-ui-tests` probe Tc2.
 *
 * ⚠️ Ｐ₁/Ｐ₂/Ｐ₃ KHÔNG phải ca biên: `mst_dis` có `103/0 Ｐ`, `103/1 Ｐ`, `103/2 Ｐ`… —
 *    đó là cách ghi 歯周炎 theo mức độ, tức phần lớn hồ sơ thật.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19) — LUÔN chạy CẢ FILE
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 npx playwright test tests/byoken-p-change-parity.spec.ts
 *   TEST_DB=1 npx playwright test tests/byoken-p-change-parity.spec.ts --headed
 *
 * KHÔNG bấm F9 nên KHÔNG cần TEST_ALLOW_SAVE: cả hai TC chỉ mở/không mở một hộp thoại.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — spec chỉ seed 部位病名行 rồi xoá, không đụng 歯式. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** 歯周炎 Ｐ — mã mà `MonthP` ưu tiên gom (frm203002.cs:7358). */
const P_DIS_CD = 103

/**
 * 枝番 của 病名 đem thử. **1, KHÔNG phải 0** — đó chính là điều đang kiểm.
 * WinForm đo được là VẪN gom; nếu bản web bỏ qua thì đây là điểm lệch.
 */
const P_DIS_SB = 1

const SEED_DIS_TEXT = 'Ｐ変更ゲート検証'
const SEED_NM = 'Ｐ変更ゲートテスト行'

/** Ô 10 (0-based) = 左上3 — cùng ô mà bản đo WinForm dùng. */
const P_BUI_SLOT = 10
const P_BUI_VAL = 1

const GRID_LOAD_TIMEOUT = 60_000
/** Chờ 部位選択 — ngắn có chủ ý ở TC-P1: ở đó nó KHÔNG được mở. */
const DIALOG_WAIT = 8_000

const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

if (!dbEnabled) {
    console.log(
        '\n⚠️  byoken-p-change-parity.spec.ts BỎ QUA — thiếu TEST_DB=1 (cần seed 部位病名行).\n' +
            '   Chạy bằng: TEST_DB=1 npx playwright test tests/byoken-p-change-parity.spec.ts\n',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 部位病名行 mang 病名 Ｐ')

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('診療入力 — cổng vào của Ｐ変更 (MonthP)', () => {
    let page: Page
    let step: () => Promise<void>

    async function openTreatmentScreen() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(
            ryoCells(page).first(),
            'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
        ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await closeDialogs(page)
    }

    /** Chuyển sang tab 病検 rồi bấm Ｐ変更. */
    async function pressPChange() {
        await closeDialogs(page)
        await page
            .getByRole('button', { name: '病検', exact: true })
            .click()
            .catch(() => {})
        await page.getByRole('button', { name: 'Ｐ変更', exact: true }).click()
    }

    /** Seed ĐÚNG một 部位病名行 mang 病名 Ｐ, chỉ khác nhau ở 枝番. */
    async function seedPRow(disSb: number) {
        await cleanupSeed()
        const pBui = Array.from({ length: 32 }, (_, i) => (i === P_BUI_SLOT ? P_BUI_VAL : 0))
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: SEED_NM,
                bui: pBui,
                dspBui: '左上3',
                // ĐÚNG MỘT 病名 (dis_cd_2 = 0) — điều kiện THẬT của MonthP.
                disCd: [P_DIS_CD],
                disSb: [disSb],
                dspDis: SEED_DIS_TEXT,
            },
        ])
        await openTreatmentScreen()

        const seeded = page.getByText(SEED_DIS_TEXT, { exact: false })
        await expect(
            seeded.first(),
            `không thấy 部位病名行 「${SEED_DIS_TEXT}」 (枝番 ${disSb}) trên lưới — seed hỏng hoặc ` +
                `màn hình đang mở tháng khác (TEST_TRT_DT = ${TRT_DT}).`,
        ).toBeVisible({ timeout: 20_000 })
    }

    async function cleanupSeed() {
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, 0, [SEED_NM]).catch(() => 0)
        await deleteTreatmentRowsByBui(Number(PAT_NO), TRT_DT, P_BUI_SLOT + 1, P_BUI_VAL).catch(
            () => 0,
        )
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // AutoSantei bung 「…を算定しますか？」 vào lúc không đoán được (Rule 14).
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
    })

    test.afterAll(async () => {
        await cleanupSeed()
        await page?.close()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-P1 — không gom được gì thì IM LẶNG
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-P1 — tháng KHÔNG có Ｐ/Ｇ: Ｐ変更 im lặng, KHÔNG alert và KHÔNG mở 部位選択', async () => {
        await cleanupSeed()
        await openTreatmentScreen()

        await pressPChange()
        await step()

        // ── Vế 1: KHÔNG có thông báo nào ─────────────────────────────────────
        // WinForm: cả khối cmdByokenP_Click nằm trong một `if`, không có `else`
        // (frm203002.cs:6362-6384) ⇒ không gom được thì nó thoát, không nói gì.
        // Đo thật trên WinForm 2026-09-03: 「mở 部位選択? False · hộp thoại gặp: []」.
        const alert = page.getByText('当月にＰ／Ｇの病名がありません。')
        await expect(
            alert,
            'WinForm KHÔNG có câu 「当月にＰ／Ｇの病名がありません。」 — cmdByokenP_Click chỉ có `if`, ' +
                'không `else` (frm203002.cs:6362-6384), và đo thật trên máy Windows cũng cho thấy ' +
                'KHÔNG hộp thoại nào bung. Bản web bung alert là THÊM một thông báo không có ở bản gốc.',
        ).toHaveCount(0)
        await step()

        // ── Vế 2: KHÔNG mở 部位選択 ──────────────────────────────────────────
        const toothDialog = page.getByText(/部\s*位\s*選\s*択/)
        await expect(
            toothDialog,
            'Không gom được Ｐ/Ｇ nào thì `grdByou[35]` guard trượt và Ｐ変更 không mở 部位選択.',
        ).toHaveCount(0, { timeout: DIALOG_WAIT })
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-P2a (ĐỐI CHỨNG) — cùng dòng đó nhưng 枝番 0
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-P2a (đối chứng) — 部位病名行 mang Ｐ(103) 枝番 0: Ｐ変更 mở 部位選択', async () => {
        await seedPRow(0)
        await step()

        await pressPChange()

        await expect(
            page.getByText(/部\s*位\s*選\s*択/).first(),
            'Đây là ĐỐI CHỨNG của TC-P2: cùng một dòng seed, chỉ khác 枝番. Đỏ ở ĐÂY nghĩa là ' +
                'harness hỏng (seed không thành 部位病名行, hoặc nút Ｐ変更 không bấm được) — và khi ' +
                'đó kết quả của TC-P2 KHÔNG nói lên điều gì về 枝番 cả.',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        await closeDialogs(page)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-P2 — 病名 Ｐ có 枝番 KHÁC 0 vẫn phải gom được
    // ═════════════════════════════════════════════════════════════════════════

    test(`TC-P2 — 部位病名行 mang Ｐ(103) 枝番 ${P_DIS_SB}: Ｐ変更 VẪN phải mở 部位選択`, async () => {
        await seedPRow(P_DIS_SB)
        await step()

        await pressPChange()

        const toothDialog = page.getByText(/部\s*位\s*選\s*択/)
        await expect(
            toothDialog.first(),
            `Ｐ変更 PHẢI mở 部位選択 cho một 部位病名行 mang dis_cd_1 = ${P_DIS_CD} và ` +
                `dis_sb_1 = ${P_DIS_SB}.\n` +
                'Điều kiện THẬT của MonthP là `hFG1[40] == "103" && hFG1[41] == "0"`, mà cột 40..49 ' +
                'là dis_cd1..10 còn dis_sb1..10 nằm ở cột 55..64 (CommonInp.cs:594-604; xác nhận ' +
                'lần hai bằng doc-comment ByokenChg frm203002.cs:6259). Nghĩa là nó đòi ' +
                '「dis_cd_2 = 0」 — CHỈ CÓ MỘT 病名 — chứ KHÔNG đòi 枝番 = 0.\n' +
                'Đo thật trên WinForm 2026-09-03: một dòng Ｐ chọn qua danh sách 病名サブコード ' +
                '(枝番 1) VẪN được gom, 部位選択 mở ra seed đúng tập [ô 10].\n' +
                '⇒ Không mở nghĩa là bản web đang lọc theo 枝番, và mọi bệnh nhân chỉ có Ｐ₁/Ｐ₂ ' +
                'sẽ thấy nút Ｐ変更 chết lặng.',
        ).toBeVisible({ timeout: 20_000 })
        await step()
    })
})
