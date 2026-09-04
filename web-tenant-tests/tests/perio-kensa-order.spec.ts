import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    seedTreatmentRows,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 検査順 — 歯周基本検査 / 歯周精密検査 の走査方向 (WinForm `ModCommon.pInpOpt[36]`).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo code web.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM
 * ═════════════════════════════════════════════════════════════════════════════
 *  · INP/Lib/modCommon.cs:597 — `pInpOpt[36] = XmlControl.OchaXml.InpInfo.KensaOrder`.
 *    Là cd_val của `mst_cod` cd_type 68: **1 = 左上から, 2 = 右上から**. Giá trị 0
 *    (máy chưa từng cấu hình) KHÔNG phải cd_val, và WinForm chỉ kiểm `== 1`, nên 0
 *    chạy nhánh 右上 y như 2.
 *  · INP/Forms/frm203028.cs (基本検査) — 2 chỗ rẽ nhánh:
 *      :471-484  `tyToothInf[].next = i+1` / `.prev = i-1`, khép vòng 31↔0.
 *      :488-512  フォーカス設定 — 左上: quét 上顎 `15→0` TRƯỚC, chỉ khi 上顎 trống
 *                mới quét 下顎 `31→16`. 右上: quét thẳng `0→31`.
 *      :610-657  `getMoveIndex` — Enter đi 1 răng: 左上 dùng `.prev` và coi là hết
 *                vòng khi về `15`; 右上 dùng `.next` và hết vòng khi về `0`.
 *                Hết vòng ⇒ `idx + 100` = nhảy sang hàng đo kế tiếp.
 *  · INP/Forms/frm203029.cs (精密検査) — 5 chỗ, gồm cả thứ tự 3 điểm TRONG một răng:
 *      :100-136  フォーカス設定 (cùng luật quét như trên) rồi focus điểm 口蓋:
 *                4点法 → `t*3+1`; 6点法 → 右上 `t*3+0`, **左上 `t*3+2`**.
 *      :258-284  BOP Enter → khi hết vòng thì vào điểm 口蓋 nói trên.
 *      :479-505  頬側 Enter — 右上 `idx%3 != 2 → idx+1`; 左上 `idx%3 != 0 → idx-1`.
 *      :672-716  口蓋 Enter — 6点法 右上 `0→1→2→頬側 idx-2`;
 *                             6点法 左上 `2→1→0→頬側 idx+2`.
 *      :921-965  `getMoveIndex` — giống hệt frm203028.
 *  · ←/→ KHÔNG đổi theo 検査順: `getMoveIndexArrow` không có nhánh `pInpOpt[36]` nào.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN PORT
 * ═════════════════════════════════════════════════════════════════════════════
 * `lib/kensa-order.ts` (`startsFromUpperLeft` / `firstExamTooth` / `nextExamTooth`)
 * + `queries/inp-clinic-settings-queries.ts`. Giá trị là **clinic-wide**
 * (`tenant_config."inp"`, không phải per-máy) nên tới FE qua
 * `GET /tenant/settings/inp` → `clinic.kensaOrder`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO ĐÈ RESPONSE THAY VÌ ĐỔI SETTING THẬT
 * ═════════════════════════════════════════════════════════════════════════════
 * Spec `page.route` lên chính `GET /tenant/settings/inp`, lấy body THẬT của server
 * rồi chỉ sửa đúng `clinic.kensaOrder`. Lý do:
 *  1. Không ghi `tenant_config` của phòng khám — 検査順 là setting clinic-wide, đổi
 *     thật là đổi cho mọi máy, và nếu spec bị kill giữa chừng thì nó nằm lại.
 *  2. Vẫn kiểm đúng đường dây cần kiểm: FE phải ĐỌC `clinic.kensaOrder` từ CHÍNH
 *     endpoint đó thì việc đè mới có tác dụng. Phần BE ghi/đọc setting đã có
 *     `treatment-entry-setting-dialog.spec.ts` phủ.
 *  3. Chạy được CẢ HAI nhánh trong một lượt, không cần khôi phục gì.
 * `staleTime: 0` (shared/queries/tenant-settings.ts:62) nên mỗi lần `page.goto`
 * lại màn 診療入力 là fetch lại → đổi biến `kensaOrder` rồi nạp lại là đủ.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU TỰ DỰNG (cần TEST_DB=1)
 * ═════════════════════════════════════════════════════════════════════════════
 * Hai dialog nhận prop `bui` = 部位 của 部位病名行 chi phối dòng đang focus
 * (`treatment-entry-detail.tsx`, `bui={focusedRowBui}`). Ô nào có `bui` = 0 sẽ bị
 * khoá ／ và **bị loại khỏi điều hướng bàn phím** — nghĩa là nếu không seed 部位 thì
 * `exists` toàn false, con trỏ không đi đâu cả và spec xanh giả.
 * `beforeAll` vì thế seed một 部位病名行 mang **đủ 32 răng**, để mọi bước Enter đều
 * có đích và các assert dưới đây là số cụ thể chứ không phải "răng hiện có kế tiếp".
 *
 * ⚠️ Spec KHÔNG bấm F9 登録 của màn 診療入力 và KHÔNG bấm F1 デフォルト設定 của hai
 *    dialog (cái đó mới ghi `kihon_def` / `seimitu_def`). Ghi DB duy nhất là dòng seed,
 *    và `afterAll` dọn lại.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY CẦN BIẾT
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. Ô lưới của hai dialog là một bức tường `<input>` giống hệt nhau. Chúng mang
 *     `data-perio-cell="<kind>-<index>"` — index là thứ WinForm gọi: **số răng** cho
 *     `epp`/`douyou`/`bop`/`douyo`, **chỉ số điểm trong mảng 96** cho `hoho`/`kou`.
 *     Đừng quay lại đếm thứ tự DOM: layout đảo hàng dưới nên số thứ tự DOM KHÁC số răng.
 *  2. 4点法 / 6点法 (`inp_config.seimitu_mode`) ĐƯỢC ĐÈ giống 検査順, vì hai chế độ có
 *     luật khác nhau và spec phải chạy được cả hai bất kể phòng khám đang đặt gì.
 *     Bản đầu để nguyên setting thật ⇒ lượt chạy đầu rơi vào 4点法 và nhánh 6点法 —
 *     chính chỗ 3 điểm đảo chiều, phần sửa nhiều nhất — không hề được kiểm.
 *     `expectMode` khẳng định việc đè ĐÃ tới được dialog trước khi TC assert gì khác —
 *     nếu route hỏng, TC đỏ ngay thay vì âm thầm kiểm nhầm nhánh.
 *  3. AutoSantei bung 「〜を算定しますか？」 vào lúc không đoán được và nuốt mọi phím.
 *     `installSanteiNo` + `clearOverlays` chép nguyên từ `karte-selection-dialog.spec.ts`
 *     (đã chạy được) — bấm **No**, vì Yes kéo theo `CmtAutoPickerDialog` cùng tên.
 *  4. Focus init chạy trong `useEffect` sau khi query lắng. Luôn `expect(...).toBeFocused()`
 *     (auto-retry) chứ đừng đọc `document.activeElement` một phát.
 *  5. Một `page.goto` đơn lẻ thỉnh thoảng về mà lưới 診療入力 KHÔNG bao giờ mount, và
 *     chờ lâu hơn cũng vô ích — phải nạp lại. `openTreatmentScreen` thử tối đa 3 lần,
 *     giống 2 spec siga. Lần chạy đầu của spec này đỏ TC-8 đúng vì thiếu chỗ đó.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19) — LUÔN chạy CẢ FILE
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 npx playwright test tests/perio-kensa-order.spec.ts
 *   TEST_DB=1 npx playwright test tests/perio-kensa-order.spec.ts --headed
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? new Date().toISOString().slice(0, 10)

/** `mst_cod` cd_type 68 の cd_val. */
const KENSA_ORDER = { UpperLeftFirst: 1, UpperRightFirst: 2 } as const

/** 歯周炎 — 部位病名行 seed chỉ cần một 病名 bất kỳ để mapper dựng được dòng. */
const SEED_DIS_CD = 103
/** `dsp_dis` của dòng seed — cũng là chuỗi để locate (ô 部位 in chuỗi app tự dựng). */
const SEED_DIS_TEXT = '検査順検証Ｐ'
/** `dsp_trt` — chỉ dùng để dọn; dòng 病名-only không in nó ra lưới. */
const SEED_NM = '検査順テスト行'

const SETTINGS_INP_URL = '**/tenant/settings/inp'
const INP_CONFIG_URL = '**/tenant/inp-config'

/** `inp_config.seimitu_mode` — 1 = 4点法, khác = 6点法 (perio-precision-exam-dialog.tsx:87). */
const SEIMITU_MODE = { FourPoint: 1, SixPoint: 2 } as const

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
const realAlert = (page: Page) => page.locator('[role="alertdialog"]')

/** frm203011 — lưới nút group. Nhận diện bằng nút PCR (không dialog nào khác có). */
const groupGrid = (page: Page) =>
    anyDialog(page).filter({ has: page.getByRole('button', { name: /PCR/ }) })

const kihonDialog = (page: Page) => anyDialog(page).filter({ hasText: '歯 周 基 本 検 査' })
const seimituDialog = (page: Page) => anyDialog(page).filter({ hasText: '歯 周 精 密 検 査' })

/** Ô lưới theo tên WinForm — xem BẪY 1. */
const cell = (dialog: Locator, kind: string, index: number) =>
    dialog.locator(`[data-perio-cell="${kind}-${index}"]`)

const SANTEI_CONFIRM = /を算定しますか？/

/** Trả lời **No** cho 「〜を算定しますか？」 (Rule 14) — chép từ karte-selection-dialog.spec.ts. */
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

const drainAlerts = async (page: Page) => {
    for (let i = 0; i < 10; i++) {
        if ((await realAlert(page).count()) === 0) return
        const btn = realAlert(page).locator('button', { hasText: /^(OK|Yes)$/ })
        if ((await btn.count()) === 0) return
        await btn.first().click()
        await page.waitForTimeout(400)
    }
}

const clearOverlays = async (page: Page) => {
    for (let i = 0; i < 12; i++) {
        await drainAlerts(page)
        const santei = anyDialog(page).filter({ hasText: SANTEI_CONFIRM })
        if (await santei.count()) {
            await expect(santei)
                .toHaveCount(0, { timeout: 10000 })
                .catch(() => {})
            continue
        }
        if ((await anyDialog(page).count()) === 0) {
            await page.waitForTimeout(1500)
            if ((await anyDialog(page).count()) === 0) return
            continue
        }
        await page.keyboard.press('F10')
        await page.waitForTimeout(600)
    }
}

if (!dbEnabled) {
    console.log(
        '\n⚠️  perio-kensa-order.spec.ts BỎ QUA TOÀN BỘ testcase — thiếu TEST_DB=1\n' +
            '   (cần seed một 部位病名行 đủ 32 răng, nếu không mọi ô bị khoá ／ và\n' +
            '    điều hướng bàn phím không đi đâu cả ⇒ spec xanh giả)\n' +
            '   Chạy bằng:  TEST_DB=1 npx playwright test tests/perio-kensa-order.spec.ts\n',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 部位病名行 mang đủ 32 răng')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('歯周検査 — 検査順 (pInpOpt[36] / KensaOrder)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Giá trị đè vào `clinic.kensaOrder` của response THẬT. Đổi rồi nạp lại màn hình. */
    let kensaOrder: number = KENSA_ORDER.UpperRightFirst
    /** Tương tự cho `seimituMode` — xem BẪY 2. */
    let seimituMode: number = SEIMITU_MODE.SixPoint
    /** Key của nhánh `clinic` TRƯỚC khi bị vá — xem TC-READ. */
    let realClinicKeys: string[] = []

    test.beforeAll(async ({ browser }) => {
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        console.log(
            `tháng ${TRT_DT} của BN ${PAT_NO} đang có ${realRows} 処置行 THẬT. ` +
                'Spec KHÔNG bấm F9 登録 nên không ghi lại chúng.',
        )

        // 部位病名行 mang ĐỦ 32 răng ⇒ exists[] toàn true ⇒ mọi bước Enter có đích.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: SEED_NM,
                bui: new Array<number>(32).fill(1),
                dspBui: '全顎',
                disCd: [SEED_DIS_CD],
                disSb: [0],
                dspDis: SEED_DIS_TEXT,
            },
        ])

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Lấy body THẬT rồi chỉ sửa clinic.kensaOrder — xem khối 「VÌ SAO ĐÈ RESPONSE」.
        await page.route(SETTINGS_INP_URL, async (route: Route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const body = (await res.json()) as {
                data?: { clinic?: Record<string, unknown> }
            }
            realClinicKeys = Object.keys(body.data?.clinic ?? {})
            if (body.data?.clinic) body.data.clinic.kensaOrder = kensaOrder
            await route.fulfill({ response: res, json: body })
        })

        // 4点法/6点法 cũng phải đè, nếu không spec chỉ chạy được chế độ mà phòng khám
        // đang đặt — lần chạy đầu là 4点法, và nhánh 6点法 (chỗ 3 điểm đảo chiều, tức
        // phần sửa nhiều nhất) không hề được đụng tới. Xem BẪY 2.
        await page.route(INP_CONFIG_URL, async (route: Route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const body = (await res.json()) as { data?: Record<string, unknown> }
            if (body.data) body.data.seimituMode = seimituMode
            await route.fulfill({ response: res, json: body })
        })

        await installSanteiNo(page)

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(
            page,
            'login không vào được — chạy nhiều lần liên tiếp thì đang dính rate-limit, ' +
                'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
        ).toHaveURL(/\/$/)
    })

    test.afterAll(async () => {
        await page?.unroute(SETTINGS_INP_URL).catch(() => {})
        await page?.unroute(INP_CONFIG_URL).catch(() => {})
        await page?.close()
        const n =
            (await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)) +
            (await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, 0, [SEED_NM]).catch(
                () => 0,
            )) +
            (await deleteTreatmentRowsByBui(Number(PAT_NO), TRT_DT, 1, 1).catch(() => 0))
        console.log(`dọn: xoá ${n} dòng seed`)
    })

    /**
     * Nạp màn 診療入力, thử lại nếu lưới không lên (BẪY 5).
     *
     * Chép nguyên cách làm của `tooth-extraction-siga-restore.spec.ts` /
     * `p-mode-kesson-siga.spec.ts`: một `goto` đơn lẻ thỉnh thoảng về mà lưới không
     * bao giờ mount (chuỗi AutoSantei + nhiều query nặng chạy song song lúc mở màn),
     * và 60s chờ cũng không cứu được — chỉ nạp lại mới xong. Lần chạy đầu của spec
     * này đúng là dính: TC-5 flaky và TC-8 đỏ, cả hai đều tại đây chứ không phải tại
     * hành vi đang kiểm.
     */
    const openTreatmentScreen = async () => {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(ryoCell(page).first(), 'lưới 診療入力 không nạp được').toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới — nạp lại`,
                )
            }
        }
        throw lastErr
    }

    /**
     * Nạp lại màn 診療入力 với `kensaOrder` hiện tại, focus dòng seed rồi F6 →
     * カルテ記載選択. `staleTime: 0` nên lần nạp này fetch lại setting.
     */
    const openKarteGrid = async (order: number) => {
        kensaOrder = order
        await openTreatmentScreen()
        await clearOverlays(page)

        // F6 lấy 部位 của dòng ĐANG FOCUS (guardCurrentMonth + focusedRowBui) ⇒ phải
        // bấm vào dòng seed trước, nếu không `bui` là undefined và mọi ô bị khoá ／.
        const seeded = ryoCell(page).filter({ hasText: SEED_DIS_TEXT }).first()
        await expect(
            seeded,
            `không thấy 部位病名行 「${SEED_DIS_TEXT}」 — seed hỏng hoặc màn hình đang mở tháng ` +
                `khác (TEST_TRT_DT = ${TRT_DT})`,
        ).toBeVisible({ timeout: 30000 })
        await seeded.click()

        await page.keyboard.press('F6')
        await expect(
            groupGrid(page),
            'F6 không mở được カルテ記載選択 — dòng focus có thuộc tháng hiện tại không?',
        ).toBeVisible({ timeout: 20000 })
        await step()
    }

    const openKihon = async (order: number) => {
        await openKarteGrid(order)
        await groupGrid(page)
            .getByRole('button', { name: /基本検査/ })
            .click()
        await expect(kihonDialog(page), 'F1 không mở được 歯周基本検査').toBeVisible({
            timeout: 20000,
        })
        await step()
    }

    const openSeimitu = async (order: number, mode: number) => {
        seimituMode = mode
        await openKarteGrid(order)
        await groupGrid(page)
            .getByRole('button', { name: /精密検査/ })
            .click()
        await expect(seimituDialog(page), 'F2 không mở được 歯周精密検査').toBeVisible({
            timeout: 20000,
        })
        await step()
    }

    /** Bấm Enter rồi khẳng định ô nào đang focus. */
    const enterTo = async (
        dialog: Locator,
        kind: string,
        index: number,
        why: string,
    ) => {
        await page.keyboard.press('Enter')
        await expect(cell(dialog, kind, index), why).toBeFocused({ timeout: 10000 })
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 基本検査 (frm203028)
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-READ — BE vẫn trả `clinic.kensaOrder` thật (spec tự vá nên phải chốt riêng)', async () => {
        // Theo mẫu guide-mode-f4-swap.spec.ts TC-READ-1. Spec tự bơm key vào response,
        // nên nếu BE bỏ field khỏi nhánh `clinic` thì mọi TC khác vẫn xanh mà tính năng
        // đã chết. `realClinicKeys` là key ĐỌC ĐƯỢC trước khi vá.
        await openKarteGrid(KENSA_ORDER.UpperRightFirst)
        expect(
            realClinicKeys,
            'nhánh `clinic` của GET /tenant/settings/inp phải có key kensaOrder ' +
                '(cd_val mst_cod 68) — hook đọc 検査順 từ đúng chỗ này',
        ).toContain('kensaOrder')
        await step()
    })

    test('TC-1 (đối chứng) — 右上から: con trỏ vào 右上8 (răng 0) và Enter đi tới', async () => {
        await openKihon(KENSA_ORDER.UpperRightFirst)
        const d = kihonDialog(page)

        await expect(
            cell(d, 'epp', 0),
            'フォーカス設定 nhánh 右上 quét 0→31 (frm203028.cs:621-627) ⇒ phải là EPP của răng 0',
        ).toBeFocused({ timeout: 20000 })

        await enterTo(d, 'epp', 1, 'getMoveIndex 右上 dùng .next ⇒ 0 → 1')
        await enterTo(d, 'epp', 2, '0 → 1 → 2')
        await step()
    })

    test('TC-2 — 左上から: con trỏ vào 左上8 (răng 15) và Enter đi NGƯỢC lại', async () => {
        await openKihon(KENSA_ORDER.UpperLeftFirst)
        const d = kihonDialog(page)

        await expect(
            cell(d, 'epp', 15),
            'フォーカス設定 nhánh 左上 quét 上顎 15→0 TRƯỚC (frm203028.cs:491-496) ⇒ EPP răng 15. ' +
                'Ra răng 0 nghĩa là setting chưa tới được dialog; ra răng 31 nghĩa là ai đó ' +
                'cài "duyệt ngược 31→0" thay vì "上顎 trước".',
        ).toBeFocused({ timeout: 20000 })

        await enterTo(d, 'epp', 14, 'getMoveIndex 左上 dùng .prev ⇒ 15 → 14')
        await enterTo(d, 'epp', 13, '15 → 14 → 13')
        await step()
    })

    test('TC-4 — 左上から: về lại răng 15 thì chuyển sang hàng 動揺度 (idx + 100)', async () => {
        await openKihon(KENSA_ORDER.UpperLeftFirst)
        const d = kihonDialog(page)
        await expect(cell(d, 'epp', 15)).toBeFocused({ timeout: 20000 })

        // 15 → 14 … → 0 → 31 → 30 … → 16 → (15 = hết vòng) ⇒ 動揺度 răng 15.
        for (let t = 14; t >= 0; t--) await enterTo(d, 'epp', t, `EPP 上顎 đi ngược → răng ${t}`)
        // Bước 0 → 31 là chỗ .prev khép vòng (frm203028.cs:476-478): phải sang 下顎 và
        // VẪN ở hàng EPP. Bản port nào coi "chỉ số < 0" là hết vòng sẽ nhảy hàng ngay đây.
        for (let t = 31; t >= 16; t--) await enterTo(d, 'epp', t, `EPP 下顎 → răng ${t}`)
        await enterTo(
            d,
            'douyou',
            15,
            'về đúng răng 15 = 最初の部位 ⇒ getMoveIndex trả idx+100 ⇒ sang hàng 動揺度, ' +
                'và ô đầu của hàng mới cũng là răng 15 (frm203028.cs:632-639)',
        )
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // 精密検査 (frm203029) — thêm việc đảo thứ tự 3 điểm trong một răng
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Khẳng định việc đè `seimituMode` ĐÃ tới được dialog: 4点法 khoá 2 điểm 口蓋 ngoài
     * cùng, 6点法 mở cả 3. Auto-retry vì lưới dựng xong sau khi query lắng.
     */
    const expectMode = async (d: Locator, t: number, mode4: boolean) => {
        const side = cell(d, 'kou', t * 3)
        const why = `đè seimituMode không tới được dialog (chờ ${mode4 ? '4点法' : '6点法'})`
        if (mode4) await expect(side, why).toBeDisabled({ timeout: 20000 })
        else await expect(side, why).not.toBeDisabled({ timeout: 20000 })
    }

    test('TC-5 (đối chứng) — 右上から 6点法: vào răng 0, điểm 口蓋 ĐẦU (t*3)', async () => {
        await openSeimitu(KENSA_ORDER.UpperRightFirst, SEIMITU_MODE.SixPoint)
        const d = seimituDialog(page)
        await expectMode(d, 0, false)

        await expect(
            cell(d, 'kou', 0),
            'frm203029.cs:137-152 — 右上 6点法 vào điểm đầu của răng đầu tiên',
        ).toBeFocused({ timeout: 20000 })
        await step()
    })

    test('TC-6 — 左上から 6点法: vào răng 15, điểm 口蓋 CUỐI (t*3+2)', async () => {
        await openSeimitu(KENSA_ORDER.UpperLeftFirst, SEIMITU_MODE.SixPoint)
        const d = seimituDialog(page)
        await expectMode(d, 15, false)

        await expect(
            cell(d, 'kou', 15 * 3 + 2),
            'frm203029.cs:104-119 — 左上: quét 上顎 15→0 rồi vào điểm 口蓋 t*3+2 (:118), ' +
                'KHÔNG phải t*3. Đây là chỗ dễ port thiếu nhất: getMoveIndex có thể đã đúng ' +
                'mà điểm vào răng vẫn sai.',
        ).toBeFocused({ timeout: 20000 })
        await step()
    })

    test('TC-7 — 左上から 6点法: 3 điểm chạy ngược 2→1→0 rồi sang 頬側 idx+2', async () => {
        await openSeimitu(KENSA_ORDER.UpperLeftFirst, SEIMITU_MODE.SixPoint)
        const d = seimituDialog(page)
        await expectMode(d, 15, false)
        const base = 15 * 3

        await expect(cell(d, 'kou', base + 2)).toBeFocused({ timeout: 20000 })
        await enterTo(d, 'kou', base + 1, '6点法 左上: 口蓋 2 → 1 (frm203029.cs:684-687)')
        await enterTo(d, 'kou', base + 0, '口蓋 1 → 0')
        await enterTo(d, 'hoho', base + 2, '口蓋 0 → 頬側 idx+2 (frm203029.cs:690)')

        // 頬側 cũng chạy ngược: idx%3 != 0 → idx-1 (frm203029.cs:479-484).
        await enterTo(d, 'hoho', base + 1, '頬側 2 → 1')
        await enterTo(d, 'hoho', base + 0, '頬側 1 → 0')

        // Hết 3 điểm 頬側 ⇒ getMoveIndex sang răng kế (14), vào điểm 口蓋 của nó.
        await enterTo(
            d,
            'kou',
            14 * 3 + 2,
            '頬側 điểm cuối ⇒ getMoveIndex 左上 → răng 14, vào điểm 口蓋 t*3+2 ' +
                '(frm203029.cs:487-505)',
        )
        await step()
    })

    test('TC-7b — 左上から 4点法: chỉ có điểm giữa, giao sang 頬側 điểm CUỐI', async () => {
        // Vế đối xứng của TC-7. 4点法 khoá 2 điểm 口蓋 ngoài cùng, nên 口蓋 giao ngay
        // sang 頬側 — và giao ở điểm CUỐI (idx+1 khi bước là -1), frm203029.cs:676-683.
        // Thiếu TC này thì một bản port bỏ quên nhánh 4点法 vẫn xanh hết.
        await openSeimitu(KENSA_ORDER.UpperLeftFirst, SEIMITU_MODE.FourPoint)
        const d = seimituDialog(page)
        await expectMode(d, 15, true)
        const base = 15 * 3

        await expect(
            cell(d, 'kou', base + 1),
            '4点法 vào điểm giữa bất kể 検査順 — đó là điểm 口蓋 duy nhất mở',
        ).toBeFocused({ timeout: 20000 })
        await enterTo(d, 'hoho', base + 2, '4点法 左上: 口蓋 điểm giữa → 頬側 điểm cuối')
        await enterTo(d, 'hoho', base + 1, '頬側 2 → 1')
        await enterTo(d, 'hoho', base + 0, '頬側 1 → 0')
        await enterTo(d, 'kou', 14 * 3 + 1, '→ răng 14, lại là điểm giữa')
        await step()
    })

    test('TC-8 (đối chứng) — ←/→ KHÔNG đổi theo 検査順', async () => {
        // getMoveIndexArrow không có nhánh pInpOpt[36] nào (frm203029.cs:975+ /
        // frm203028.cs:660+). Nếu ai đó "thống nhất cho gọn" bằng cách đảo luôn mũi tên,
        // TC này đỏ.
        await openKihon(KENSA_ORDER.UpperLeftFirst)
        const d = kihonDialog(page)
        await expect(cell(d, 'epp', 15)).toBeFocused({ timeout: 20000 })

        // → tại răng 15 nhảy sang 31 (mép cung, frm203028 getMoveIndexArrow), y hệt
        // nhánh 右上 — hướng mũi tên là chuyện của layout, không phải của 検査順.
        await page.keyboard.press('ArrowRight')
        await expect(
            cell(d, 'epp', 31),
            '→ tại răng 15 phải sang 31 bất kể 検査順 (mép 15↔31 của getMoveIndexArrow)',
        ).toBeFocused({ timeout: 10000 })

        await page.keyboard.press('ArrowLeft')
        await expect(cell(d, 'epp', 15), '← quay lại 15').toBeFocused({ timeout: 10000 })
        await step()
    })
})
