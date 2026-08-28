import {
    expect,
    test,
    type Locator,
    type Page,
    type Request,
    type Response,
    type Route,
} from '@playwright/test'

import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 診療入力設定「ガイドモード」 (pInpOpt[39]) đảo hai nhánh F4 / Shift+F4 của tab ガイド.
 *
 * ĐÂY LÀ REGRESSION GUARD cho bug đã sửa ở commit 83276e739
 * 「診療入力のガイドモードでF4／Shift+F4の分岐を切り替える」: web trước đó HARD-CODE
 * một chiều (F4 = 通常, Shift+F4 = STEP) và KHÔNG hề đọc setting, nên phòng khám
 * đặt ガイドモード=2 thì hai phím chạy ngược so với WinForm.
 *
 * Khác với guide-sidepanel-handler.spec.ts (soi NỘI DUNG list ガイド ở chế độ mặc
 * định), spec này chỉ soi ĐÚNG MỘT thứ: cú bấm nào rơi vào nhánh nào, theo từng
 * giá trị ガイドモード.
 *
 * ─── Nguồn WinForm (userapp/src/OCHACOM) ─────────────────────────────────────
 *  - frm203002.cs:775-801 btnF4_Click — CHÍNH LÀ bảng dưới đây:
 *      · pInpOpt[39] == 2 → F4 = KeyFunc(F4, 1) STEP, Shift+F4 = KeyFunc(F4) 通常
 *      · ngược lại        → F4 = KeyFunc(F4) 通常,    Shift+F4 = KeyFunc(F4, 1) STEP
 *  - frm203002.cs:4698-4708 KeyFunc(F4) nhánh KHÔNG Shift →
 *    getGuidNyuryokuInfo2(bolStepPass: **true**) = 通常.
 *  - frm203002.cs:4195-4203 KeyFunc(F4, 1) nhánh Shift →
 *    getGuidNyuryokuInfo2(bolStepPass: **false**) = STEP.
 *  - frm203002.cs:1991-2005 getGuidNyuryokuInfo2 — bolStepPass=true thì ẩn
 *    cmdGuidPrv/cmdGuidReset, false thì HIỆN. Đó là dấu hiệu phân biệt hai nhánh
 *    mà spec này bám vào (không phụ thuộc dữ liệu ガイド của tenant).
 *  - modCommon.cs:607-609 — pInpOpt[39] = XmlControl.OchaXml.InpInfo.GuidMode.
 *  - frm203003.cs:159/196-198 — combo cboGuidMode nạp từ mst_cod cd_type 67;
 *    giá trị <= 0 (máy chưa từng lưu) rơi về mục đầu tiên ⇒ xử như 通常.
 *
 * ─── Nguồn web (apps/web-tenant/src/features/treatments) ─────────────────────
 *  - lib/treatment-config.ts: `GUID_MODE = { Normal: 1, StepFirst: 2 }`.
 *  - lib/treatment-entry-shared.ts: `guideSubModeOf(guidMode, layer)` — bảng
 *    quyết định, port thẳng btnF4_Click.
 *  - queries/inp-device-settings-queries.ts: `useInpDeviceSettings()` đọc
 *    GET /tenant/settings/inp (nhánh `device`), CHUNG query key với dialog
 *    診療入力設定. Màn 診療入力 gọi hook này ⇒ phải có request đó khi mở màn (TC-READ-1;
 *    trước khi sửa bug thì KHÔNG có request nào cả).
 *  - components/treatment-entry-detail.tsx: F4 → `openGuideTab('base')`,
 *    Shift+F4 → `openGuideTab('shift')` → setGuidSubMode(guideSubModeOf(...)).
 *  - components/treatment-side-panel.tsx:
 *      · `activeTab === 'ガイド'` mới render footer có nút 「全て表示」 → dùng làm mốc
 *        "tab ガイド đã mở".
 *      · `(stepMode || prvMode)` mới render 「前回」/「リセット」 (:1348) → dấu hiệu
 *        DOM của chế độ STEP.
 *      · stepGuidsQuery `enabled: activeTab === 'ガイド' && stepMode` → CHỈ chế độ
 *        STEP mới bắn GET /tenant/guids/step. regularGuidsQuery thì bật ở MỌI chế
 *        độ (:436-438) nên KHÔNG dùng /tenant/guids để phân biệt được.
 *
 * ─── Cách ép ガイドモード ──────────────────────────────────────────────────────
 * KHÔNG ghi DB (GUIDELINE Rule 18.1): spec chặn GET /tenant/settings/inp rồi vá
 * `data.device.guidMode` trong response thật (route.fetch → fulfill). Vá response
 * thay vì bấm qua dialog 診療入力設定 vì: (1) không đụng device_config của phòng
 * khám nên chạy hằng ngày được, (2) hai mục của mst_cod 67 trong seed TRÙNG NHÃN
 * 「ガイド」 nên chọn theo tên là mù mờ, (3) đúng cái cần kiểm là FE có ĐỌC và ÁP
 * setting hay không.
 *
 * MỖI testcase RELOAD lại màn: đó là cách duy nhất xoá cache TanStack Query (list
 * ガイド staleTime 5 phút, settings staleTime 0 nhưng vẫn cache trong phiên) và
 * reset ref `hasAlerted` của useEmptyGuideAlert.
 *
 * CHẠY TUẦN TỰ (`describe.serial`), dùng chung MỘT page vì app giới hạn số lần
 * login (Rule 10.1). Mỗi testcase tự dựng trạng thái bằng gotoTreatments() nên
 * thứ tự không quan trọng, nhưng vẫn phải chạy CẢ FILE:
 *   npx playwright test tests/guide-mode-f4-swap.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/** Ghim ngày điều trị nếu cần: TEST_TRT_DT=YYYY-MM-DD. Mặc định = hôm nay. */
const TRT_DT = process.env.TEST_TRT_DT ?? ''

/** GET/PUT 診療入力設定 — 5 field phòng khám + 25 field máy trạm trong 1 request. */
const SETTINGS_INP_URL = /\/tenant\/settings\/inp(\?|$)/
/** List ガイド 通常 (bolStepPass=true). Bật ở MỌI chế độ nên không phân biệt được. */
const GUIDS_REGULAR_URL = /\/tenant\/guids(\?|$)/
/**
 * List ガイド STEP — CHỈ bắn khi guidSubMode === 'step'.
 * Kèm `mode=step` để không lẫn với cú 「前回」 (`mode=prv`, cùng endpoint).
 */
const GUIDS_STEP_URL = /\/tenant\/guids\/step\?.*\bmode=step\b/

/** lib/treatment-config.ts `GUID_MODE` — cd_val của mst_cod cd_type 67. */
const GUID_MODE = { Normal: 1, StepFirst: 2 } as const

/** Thân GET /tenant/settings/inp, chỉ khai phần spec đụng tới. */
interface InpScreenGetBody {
    data?: { clinic?: Record<string, number>; device?: Record<string, number> }
}

test.describe.configure({ mode: 'serial' })

test.describe('ガイドモード — F4 / Shift+F4 đảo nhánh (frm203002 btnF4_Click)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Khung side panel (w-[450px]). */
    let sidePanel: Locator
    /** 「全て表示」 — chỉ render khi activeTab === 'ガイド' ⇒ mốc "tab ガイド đã mở". */
    let allBtn: Locator
    /** 「前回」 — chỉ render khi stepMode || prvMode ⇒ dấu hiệu nhánh STEP. */
    let prvBtn: Locator
    /** Alert E00024 「該当ガイドがありません。」 — STEP rỗng thì bung, phải dọn. */
    let noGuidAlert: Locator

    /**
     * Ép `device.guidMode` của response 診療入力設定 về `mode`.
     *
     * Vá response THẬT (route.fetch) chứ không dựng body giả: 24 field còn lại phải
     * giữ nguyên giá trị của máy, nếu không là đang test một màn hình khác.
     * Gỡ handler cũ trước để hai testcase liền nhau không chồng route lên nhau.
     */
    async function forceGuidMode(mode: number) {
        await page.unroute(SETTINGS_INP_URL).catch(() => {})
        await page.route(SETTINGS_INP_URL, async (route: Route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const response = await route.fetch()
            const body = (await response.json()) as InpScreenGetBody
            if (!body.data?.device) {
                // Không có nhánh `device` thì trả nguyên response — testcase sẽ đỏ ở
                // assert phía dưới với thông báo đọc được, thay vì ném lỗi ở đây.
                return route.fulfill({ response })
            }
            body.data.device.guidMode = mode
            await route.fulfill({ response, json: body })
        })
    }

    /**
     * Mở (nạp lại) màn 診療入力 của bệnh nhân test và CHỜ ガイドモード về tới nơi.
     * Trả về response của GET /tenant/settings/inp (null nếu không thấy).
     *
     * Phải chờ response đó rồi mới được bấm F4: useInpDeviceSettings chỉ đọc setting
     * SAU khi useDeviceId resolve (một cú hỏi agent), nên trên máy không có agent nó
     * về chậm hơn 「合計:」 một nhịp. Bấm sớm thì FE còn đang cầm INP_DEVICE_DEFAULT
     * (guidMode 0 = 通常) và mọi testcase ガイドモード=2 đỏ oan.
     *
     * Soi URL trước khi chờ 「合計:」: mất session thì app đá về /login và 「合計:」
     * không bao giờ hiện, chờ đủ 60s rồi báo "not found" che mất nguyên nhân thật.
     */
    async function gotoTreatments(): Promise<Response | null> {
        const settingsRes = page
            .waitForResponse(
                (r) => SETTINGS_INP_URL.test(r.url()) && r.request().method() === 'GET',
                { timeout: 60000 },
            )
            .catch(() => null)
        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await expect(page, 'goto màn 診療入力 mà bị đá đi chỗ khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
        return settingsRes
    }

    /**
     * Đóng alert E00024 nếu nó bung; trả về true khi có.
     *
     * BẮT BUỘC gọi TRƯỚC mọi assert lên nút của side panel: alert là Radix dialog,
     * nó gắn aria-hidden lên phần cây còn lại, mà `getByRole` bỏ qua nhánh
     * aria-hidden ⇒ nút 「前回」 vẫn nằm đó nhưng locator KHÔNG thấy. Chính chỗ này
     * làm testcase Shift+F4 đỏ oan ở lần chạy đầu.
     */
    async function dismissNoGuidAlert(waitMs = 3000): Promise<boolean> {
        const appeared = await noGuidAlert
            .waitFor({ state: 'visible', timeout: waitMs })
            .then(() => true)
            .catch(() => false)
        if (!appeared) return false
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noGuidAlert).toBeHidden({ timeout: 10000 })
        return true
    }

    /**
     * Bấm một phím ガイド trên màn vừa nạp lại; trả về "cú bấm này có gọi
     * /tenant/guids/step hay không" và để màn hình ở trạng thái sạch để testcase
     * assert tiếp lên DOM.
     *
     * Ghi nhận REQUEST (không phải response): stepGuidsQuery và regularGuidsQuery
     * mount trong CÙNG một lần render, nên hai request bay ra cùng một tick. Chờ
     * RESPONSE của cái regular (luôn có ở mọi nhánh) là mốc đủ chắc để kết luận cái
     * step "có hay không", mà không phải ngồi hết timeout ở nhánh 通常.
     */
    async function probeGuideKey(key: 'F4' | 'Shift+F4'): Promise<boolean> {
        await gotoTreatments()

        const seen: string[] = []
        const onRequest = (r: Request) => {
            const url = r.url()
            if (GUIDS_STEP_URL.test(url) || GUIDS_REGULAR_URL.test(url)) seen.push(url)
        }
        page.on('request', onRequest)

        let stepRequested: boolean
        try {
            const regularDone = page
                .waitForResponse((r) => GUIDS_REGULAR_URL.test(r.url()), { timeout: 60000 })
                .catch(() => null)
            const stepDone = page
                .waitForResponse((r) => GUIDS_STEP_URL.test(r.url()), { timeout: 30000 })
                .catch(() => null)

            await page.keyboard.press(key)
            await regularDone
            stepRequested = seen.some((u) => GUIDS_STEP_URL.test(u))
            // Chỉ chờ response STEP khi request THẬT SỰ đã bay — nhánh 通常 không có
            // nó, chờ vô ích mất nguyên timeout. Chờ xong mới chắc alert E00024 (nếu
            // list STEP rỗng) đã kịp bung để dọn ngay bên dưới.
            if (stepRequested) await stepDone
        } finally {
            page.off('request', onRequest)
        }

        await dismissNoGuidAlert()
        await expect(allBtn, `bấm ${key} mà tab ガイド không mở`).toBeVisible({ timeout: 30000 })
        await step()
        return stepRequested
    }

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        // AutoSantei có thể bung SanteiConfirmDialog đè lên mọi thứ và nuốt phím.
        // Bấm 「No」 chứ không 「Yes」: Yes 算定 xong lại kéo theo カルテ記載選択.
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

        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        allBtn = sidePanel.getByRole('button', { name: '全て表示', exact: true })
        prvBtn = sidePanel.getByRole('button', { name: '前回', exact: true })
        noGuidAlert = page.getByText('該当ガイドがありません')
    })

    test.afterAll(async () => {
        await page?.unroute(SETTINGS_INP_URL).catch(() => {})
        await page?.close()
    })

    test('TC-READ-1 — màn 診療入力 ĐỌC 診療入力設定 của máy (nguồn của ガイドモード)', async () => {
        // Chốt chính của bug cũ: trước khi sửa, màn này không đọc setting ở đâu cả nên
        // ガイドモード không thể có tác dụng. Request phải bay ngay lúc mở màn, do
        // useInpDeviceSettings chạy vô điều kiện trong TreatmentEntryDetail.
        const res = await gotoTreatments()
        expect(res, 'mở màn 診療入力 mà KHÔNG có GET /tenant/settings/inp').not.toBeNull()
        expect(res!.ok(), 'GET /tenant/settings/inp phải trả 2xx').toBeTruthy()

        const body = (await res!.json()) as InpScreenGetBody
        expect(
            body.data?.device,
            'response thiếu nhánh `device` — hook đọc guidMode từ đúng nhánh này',
        ).toBeTruthy()
        expect(
            Object.keys(body.data!.device!),
            'nhánh `device` phải có key guidMode (cd_val mst_cod 67)',
        ).toContain('guidMode')
        await step()
    })

    // ── ガイドモード = 1 (mặc định): F4 = 通常, Shift+F4 = STEP ──────────────────

    test('TC-MODE1-F4 — ガイドモード=1: F4 vào nhánh 通常 (前回/リセット ẩn)', async () => {
        await forceGuidMode(GUID_MODE.Normal)
        const stepRequested = await probeGuideKey('F4')

        await expect(
            prvBtn,
            'F4 ở ガイドモード=1 phải là nhánh 通常 — getGuidNyuryokuInfo2(bolStepPass:true) ' +
                'đặt cmdGuidPrv.Visible = false (frm203002.cs:1994-2003)',
        ).toBeHidden()
        expect(
            stepRequested,
            'nhánh 通常 KHÔNG được gọi /tenant/guids/step (stepGuidsQuery gate bằng stepMode)',
        ).toBe(false)
    })

    test('TC-MODE1-SHIFT-F4 — ガイドモード=1: Shift+F4 vào nhánh STEP (前回/リセット hiện)', async () => {
        await forceGuidMode(GUID_MODE.Normal)
        const stepRequested = await probeGuideKey('Shift+F4')

        await expect(
            prvBtn,
            'Shift+F4 ở ガイドモード=1 phải là nhánh STEP — bolStepPass=false thì HIỆN ' +
                'cmdGuidPrv/cmdGuidReset (frm203002.cs:1996-2003)',
        ).toBeVisible({ timeout: 15000 })
        expect(
            stepRequested,
            'nhánh STEP phải gọi /tenant/guids/step (modGuid1.pSet_Guid1 bolStepPass=false)',
        ).toBe(true)
    })

    // ── ガイドモード = 2: ĐẢO hai nhánh (đây là phần bug cũ làm sai) ─────────────

    test('TC-MODE2-F4 — ガイドモード=2: F4 vào nhánh STEP (đảo so với mặc định)', async () => {
        await forceGuidMode(GUID_MODE.StepFirst)
        const stepRequested = await probeGuideKey('F4')

        await expect(
            prvBtn,
            'ガイドモード=2 thì F4 = KeyFunc(F4, 1) = STEP (frm203002.cs:778-786). ' +
                'Đỏ ở đây = web lại hard-code một chiều như trước commit 83276e739',
        ).toBeVisible({ timeout: 15000 })
        expect(
            stepRequested,
            'ガイドモード=2 + F4 phải gọi /tenant/guids/step',
        ).toBe(true)
    })

    test('TC-MODE2-SHIFT-F4 — ガイドモード=2: Shift+F4 vào nhánh 通常', async () => {
        await forceGuidMode(GUID_MODE.StepFirst)
        const stepRequested = await probeGuideKey('Shift+F4')

        await expect(
            prvBtn,
            'ガイドモード=2 thì Shift+F4 = KeyFunc(F4) = 通常, nên 前回/リセット phải ẩn ' +
                '(frm203002.cs:787-790)',
        ).toBeHidden()
        expect(
            stepRequested,
            'ガイドモード=2 + Shift+F4 là nhánh 通常, KHÔNG gọi /tenant/guids/step',
        ).toBe(false)
    })
})
