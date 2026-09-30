import { type Locator, type Page, type Request, type Route } from '@playwright/test'

import { patNo } from '../_shared/env'
import { dbEnabled, withDb } from '../_shared/db'
import { INP_FLAG, routeInpDeviceSettings } from '../_shared/inp-device-settings'
import { clickDialog, MSG, topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * 診療入力（患者選択）— frm203001: 5 điểm lệch parity vừa sửa
 * (nhánh `fix/inp-kaigo-futan-guide-9908`):
 *
 *   1. Nhãn 「当月来患：NNN」 — `lbRaikan.Text = Get_Raikan(con, _dtTrtDt.SelDate)`
 *      (frm203001.cs:519-525, :1087). `Get_Raikan` = COUNT(DISTINCT pat_no) của
 *      trn_status trong 診療月, `jihi_flg <> 2 AND miraiin_kbn = 0`
 *      (modCommon.cs:753). API: GET /tenant/treatment/monthly-visit-count?trtDt=
 *      (FE luôn gửi ngày 1 của tháng).
 *   2. F7 会計作成 ẩn khi `ShowBulkAccButton == "9"` (frm203001.cs:572-575). Web đọc
 *      `device.showBulkAccButton` của GET /tenant/settings/inp, ẩn cả khi chưa đọc xong.
 *   3. 受付患者一覧 làm mới 10 giây (`_timer.Interval = 10000`, :194), CHỈ ở view 受付
 *      (`chgViewType` tắt timer :826, `timerTick` chỉ đọc khi tiêu đề là 受付 :974),
 *      và giữ dòng chọn THEO 患者番号 (:850-881) chứ không theo vị trí. Cách so của
 *      WinForm là `"<chọn>,".Contains("<dòng>,")`, MultiSelect=false ⇒ dòng khớp
 *      CUỐI thắng — port nguyên cả cái quirk chuỗi con (chọn 12 thì 2 ở dưới cũng khớp).
 *   4. E00002 khi ngày trong 検索条件 sai — `getPatInf` (frm901001.cs:335-346): 生年月日
 *      trước, 最終診療日 sau; y/m/d trống hết = không điều kiện; thiếu phần / ngày không
 *      tồn tại / ngoài 元号 = E00002 rồi focus về ô ngày đó, KHÔNG tìm.
 *   5. 枝番 lúc chọn bệnh nhân — cuối `Let_Data_frmPatId` (:1021-1044):
 *      a) `pat_br_chk == 1` ⇒ `Upd_TrnSubcode(tháng của 処置日)`:
 *         · tháng không có dòng trn_trn ⇒ bỏ qua;
 *         · có ngày không tìm được 保険 ⇒ lỗi 「処置日（MM/dd）に該当する患者情報が
 *           登録されていません。…」 (title 診療入力枝番確認) và DỪNG;
 *         · có ngày lệch 枝番 ⇒ hỏi Yes/No (liệt kê tối đa 10 ngày). No ⇒ đi tiếp
 *           KHÔNG ghi; Yes ⇒ POST /tenant/treatment/branch-sync rồi đi tiếp;
 *         · không lệch ⇒ vẫn POST branch-sync (WinForm vẫn chạy Upd_TrnStatus).
 *      b) `GetValidSubCode == -1` (枝番 đầu tiên lấy tư cách SAU 処置日) ⇒ lỗi cùng câu,
 *         title エラー, và DỪNG — trước đây web chỉ chặn lúc F9 lưu.
 *
 * KHÔNG GHI DB: nhóm 5 chặn GET /tenant/inp-config (vá patBrChk), GET branch-check
 * và POST branch-sync bằng route (branch-sync bị fulfill giả, không tới BE). Nhóm 3
 * vá response wait-list. Nhóm 1 chỉ ĐỌC; so với DB khi TEST_DB=1.
 *
 * ĐIỀU HƯỚNG: chỉ HAI lần `page.goto` (lần 1: F7 ẩn + pat_br_chk 0; lần 2: F7 hiện +
 * pat_br_chk 1). `inp-config` bị cache 10 phút nên đổi pat_br_chk bắt buộc tải lại;
 * còn lại đi bằng link sidebar (spec F7/F2/End ghi nhận reload liên tục làm app ra
 * trang trắng). Thứ tự testcase vì thế CÓ Ý NGHĨA.
 *
 * CHẠY TUẦN TỰ, CHUNG một page (Rule 10.1). Luôn chạy cả file:
 *   npx playwright test tests/patient-select/patient-select-raikan-wait-branch.spec.ts
 *
 * 患者番号 mặc định 12138 (bệnh nhân demo các spec patient-select khác dùng, có 担当医
 * nên 患者確定 không vấp E00027). Đổi bằng TEST_PAT_NO.
 */

const PAT_NO = patNo('12138')

const MONTHLY_COUNT_URL = /\/tenant\/treatment\/monthly-visit-count\?/
const WAIT_LIST_URL = /\/tenant\/treatment\/wait-list(\?|$)/
const INP_CONFIG_URL = /\/tenant\/inp-config(\?|$)/
const BRANCH_CHECK_URL = /\/tenant\/treatment\/branch-check\?/
const BRANCH_SYNC_URL = /\/tenant\/treatment\/branch-sync(\?|$)/
const PATIENT_DETAIL_URL = new RegExp(`/tenant/patients/${PAT_NO}(\\?|$)`)

/** Nhịp poll của 受付患者一覧 (frm203001.cs:194). */
const WAIT_POLL_MS = 10_000

/** Câu lỗi chung của `Let_Data_frmPatId` :1039 và `Upd_TrnSubcode` :116. */
const notRegisteredMsg = (mmdd: string) =>
    `処置日（${mmdd}）に該当する患者情報が登録されていません。 患者情報の患者有効開始日等を確認してください。`

const isoOf = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const TODAY = isoOf(new Date())
const mmddOf = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}`
const firstOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

/** Gộp khoảng trắng để so text của appDialog (innerText có xuống dòng). */
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** `Get_Raikan` đọc thẳng DB — kỳ vọng độc lập với API. */
async function raikanFromDb(iso: string): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: string }>(
            `SELECT COUNT(DISTINCT pat_no) AS n FROM trn_status
              WHERE sinryo_ym = $1 AND jihi_flg <> 2 AND miraiin_kbn = 0`,
            [iso.slice(0, 4) + iso.slice(5, 7)],
        )
        return Number(r.rows[0]?.n ?? 0)
    })
}

/** Một dòng 受付 giả — đủ field cho bảng, không cần tồn tại trong DB. */
function waitRow(patNoValue: number, name: string) {
    return {
        patNo: patNoValue,
        patNm: name,
        knSort: patNoValue,
        resStDt: null,
        rdate: new Date().toISOString(),
        wait: 0,
        tplan: '',
        userNm: '',
        userNo: 0,
        chair: -1,
    }
}

function waitEnvelope(items: ReturnType<typeof waitRow>[]) {
    return {
        success: true,
        data: {
            items,
            page: 1,
            pageSize: 300,
            totalCount: items.length,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
        },
    }
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力（患者選択）— 当月来患 / F7 / 受付一覧 poll / E00002 検索条件 / 枝番', () => {
    let page: Page
    let step: () => Promise<void>

    /** Trạng thái các route — đổi giữa testcase, route đọc lại mỗi request. */
    let showBulkAccButton: number = INP_FLAG.Off
    let patBrChk = 0
    let branchCheck: Record<string, unknown> = { hasRows: false, missingDate: null, mismatches: [] }
    let patchBrDt: string | null = null
    const checks: Request[] = []
    const syncs: Request[] = []
    let deviceRoute: Awaited<ReturnType<typeof routeInpDeviceSettings>>

    // ── Locator ──────────────────────────────────────────────────────────────

    const raikanLabel = (): Locator => page.getByText(/^当月来患：\d*$/)
    const trtDtRow = (): Locator => page.getByText('診療日', { exact: true }).locator('..')
    const statusBar = (): Locator => page.getByText(/^(選択中: .*|患者を選択してください)$/)

    /** Hàng EraDateField của 検索条件 — nhãn trong panel đứng trước header lưới. */
    const condDateRow = (label: string): Locator =>
        page.getByText(label, { exact: true }).first().locator('..')

    function patNoInput(): Locator {
        return page.getByText('患者番号', { exact: true }).first().locator('..').getByRole('combobox')
    }

    // ── Thao tác ─────────────────────────────────────────────────────────────

    /** Tải lại hẳn màn (xoá cache react-query) — CHỈ dùng 2 lần, xem đầu file. */
    async function reloadList(): Promise<void> {
        deviceRoute.set({ showBulkAccButton })
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F5"]')).toBeVisible({ timeout: 60_000 })
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30_000 })
    }

    /** Về lại danh sách bằng link sidebar (client-side, giữ token + cache). */
    async function backToList(): Promise<void> {
        const link = page.getByRole('link', { name: '診療入力', exact: true })
        await expect(link).toBeVisible({ timeout: 30_000 })
        await link.click()
        await expect(page.getByText('診 療 入 力')).toBeVisible({ timeout: 60_000 })
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30_000 })
    }

    async function typePatNo(value: string): Promise<void> {
        await patNoInput().fill(value)
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    /** Gõ 患者番号 rồi F9 — nhánh `typedPatNo` của 患者確定. */
    async function confirmTyped(): Promise<void> {
        await typePatNo(PAT_NO)
        await page.keyboard.press('F9')
        await step()
    }

    async function expectOnDetail(): Promise<void> {
        await expect(page, 'phải sang màn 診療入力 chi tiết').toHaveURL(
            new RegExp(`/treatments/${PAT_NO}(\\?|$)`),
            { timeout: 60_000 },
        )
    }

    async function expectStillOnList(): Promise<void> {
        await expect(page).toHaveURL(/\/treatments(\?|$)/)
        await expect(page.getByText('診 療 入 力')).toBeVisible()
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        deviceRoute = await routeInpDeviceSettings(page, { showBulkAccButton })
        await page.route(INP_CONFIG_URL, async (route: Route) => {
            const res = await route.fetch()
            const json = (await res.json()) as { data?: Record<string, unknown> }
            if (json.data) json.data.patBrChk = patBrChk
            await route.fulfill({ response: res, json })
        })
        await page.route(BRANCH_CHECK_URL, async (route: Route) => {
            checks.push(route.request())
            await route.fulfill({ json: { success: true, data: branchCheck } })
        })
        // Fulfill GIẢ — không bao giờ tới BE, nên spec không ghi trn_trn / trn_status.
        await page.route(BRANCH_SYNC_URL, async (route: Route) => {
            syncs.push(route.request())
            await route.fulfill({ json: { success: true, data: { updatedDates: 0 } } })
        })
        await page.route(PATIENT_DETAIL_URL, async (route: Route) => {
            if (patchBrDt === null) return route.fallback()
            const res = await route.fetch()
            const json = (await res.json()) as {
                data?: { records?: { ins: { brDt: string | null } }[] }
            }
            for (const rec of json.data?.records ?? []) rec.ins.brDt = patchBrDt
            await route.fulfill({ response: res, json })
        })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    /** Đặt body branch-check cho lần 患者確定 kế tiếp và xoá log request cũ. */
    function nextBranchCheck(body: Record<string, unknown>): void {
        branchCheck = body
        checks.length = 0
        syncs.length = 0
    }

    // ════════════════════ Lần tải 1: F7 ẩn, pat_br_chk = 0 ════════════════════

    test('TC-RAIKAN-1 — vào màn hiện 「当月来患：N」 của tháng hôm nay, N = API = DB', async () => {
        const resP = page.waitForResponse(
            (r) => MONTHLY_COUNT_URL.test(r.url()) && r.request().method() === 'GET',
            { timeout: 60_000 },
        )
        await reloadList()
        const res = await resP
        expect(new URL(res.url()).searchParams.get('trtDt'), 'FE gửi ngày 1 của tháng').toBe(
            firstOfMonth(TODAY),
        )
        const count = Number(((await res.json()) as { data: { count: number } }).data.count)
        await expect(raikanLabel(), 'nhãn 当月来患 phải hiện số của API').toHaveText(`当月来患：${count}`)
        if (dbEnabled) {
            expect(count, 'API ≠ Get_Raikan tính thẳng từ trn_status').toBe(await raikanFromDb(TODAY))
        } else {
            console.log('TEST_DB chưa bật — bỏ vế so DB của 当月来患')
        }
        console.log(`当月来患 ${TODAY.slice(0, 7)} = ${count}`)
        await step()
    })

    test('TC-F7-1 — showBulkAccButton = 9 ⇒ không có F7, bấm F7 không hỏi Q00049', async () => {
        await expect(page.locator('[data-fkey="F7"]'), 'F7 phải bị ẩn').toHaveCount(0)
        await page.keyboard.press('F7')
        await page.waitForTimeout(1_500)
        await expect(topDialog(page), 'F7 ẩn mà vẫn chạy 会計作成').toBeHidden()
    })

    test('TC-WAIT-1 — ở view 受付: wait-list được đọc lại mỗi ~10 giây', async () => {
        test.setTimeout(120_000)
        const times: number[] = []
        const onReq = (r: Request) => {
            if (WAIT_LIST_URL.test(r.url()) && r.method() === 'GET') times.push(Date.now())
        }
        page.on('request', onReq)
        await page.waitForTimeout(WAIT_POLL_MS * 2 + 3_000)
        page.off('request', onReq)
        expect(times.length, `23 giây mà chỉ ${times.length} lần đọc`).toBeGreaterThanOrEqual(2)
        const gaps = times.slice(1).map((t, i) => t - times[i]!)
        console.log(`khoảng cách poll (ms): ${gaps.join(', ')}`)
        for (const g of gaps) {
            expect(g, 'nhịp poll phải ~10 giây (không còn 30 giây)').toBeGreaterThan(WAIT_POLL_MS - 2_000)
            expect(g).toBeLessThan(WAIT_POLL_MS + 5_000)
        }
    })

    test('TC-WAIT-2 — sang view 当日来患 (F4) thì NGỪNG poll; F5 về lại thì đọc ngay', async () => {
        test.setTimeout(120_000)
        await page.keyboard.press('F4')
        await expect(page.getByText('≪当日来患一覧≫')).toBeVisible({ timeout: 30_000 })
        let count = 0
        const onReq = (r: Request) => {
            if (WAIT_LIST_URL.test(r.url())) count++
        }
        page.on('request', onReq)
        await page.waitForTimeout(WAIT_POLL_MS + 5_000)
        page.off('request', onReq)
        expect(count, 'view 当日来患 mà wait-list vẫn bị đọc').toBe(0)

        const back = page.waitForRequest(WAIT_LIST_URL, { timeout: 15_000 })
        await page.keyboard.press('F5')
        await back
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible()
    })

    test('TC-WAIT-3 — người mới chen lên đầu ⇒ dòng chọn vẫn là bệnh nhân cũ (theo 患者番号)', async () => {
        test.setTimeout(120_000)
        let items = [waitRow(990_101, 'テスト　Ａ'), waitRow(990_102, 'テスト　Ｂ')]
        await page.route(WAIT_LIST_URL, (route) => route.fulfill({ json: waitEnvelope(items) }))
        await page.keyboard.press('F5')
        await expect(page.getByTestId('row-990102')).toBeVisible({ timeout: 15_000 })

        await page.getByTestId('row-990102').click()
        await expect(statusBar()).toHaveText('選択中: テスト　Ｂ')
        await step()

        // Người C chen lên đầu: B trượt từ vị trí 2 xuống 3. Giữ theo index thì dòng
        // chọn sẽ thành A — đúng lỗi trỏ nhầm người.
        items = [waitRow(990_100, 'テスト　Ｃ'), ...items]
        await page.waitForResponse(WAIT_LIST_URL, { timeout: WAIT_POLL_MS + 5_000 })
        await expect(page.getByTestId('row-990100')).toBeVisible()
        await expect(statusBar(), 'sau poll dòng chọn phải vẫn là B').toHaveText('選択中: テスト　Ｂ')

        // B rời danh sách ⇒ không còn dòng chọn (F9 rơi về dòng đầu như trước).
        items = items.filter((r) => r.patNo !== 990_102)
        await page.waitForResponse(WAIT_LIST_URL, { timeout: WAIT_POLL_MS + 5_000 })
        await expect(page.getByTestId('row-990102')).toHaveCount(0)
        await expect(statusBar()).toHaveText('患者を選択してください')
        await page.unroute(WAIT_LIST_URL)
    })

    test('TC-WAIT-4 — quirk WinForm: chọn 12, thêm 2 ở dưới ⇒ sau poll chọn nhảy sang 2', async () => {
        test.setTimeout(120_000)
        let items = [waitRow(12, 'クセ　十二'), waitRow(5, 'クセ　五')]
        await page.route(WAIT_LIST_URL, (route) => route.fulfill({ json: waitEnvelope(items) }))
        await page.keyboard.press('F5')
        await page.getByTestId('row-12').click()
        await expect(statusBar()).toHaveText('選択中: クセ　十二')

        // `"12,".Contains("2,")` = true, MultiSelect=false ⇒ dòng khớp CUỐI thắng.
        items = [...items, waitRow(2, 'クセ　二')]
        await page.waitForResponse(WAIT_LIST_URL, { timeout: WAIT_POLL_MS + 5_000 })
        await expect(page.getByTestId('row-2')).toBeVisible()
        await expect(statusBar(), 'port nguyên quirk chuỗi con của getWaitViewData').toHaveText(
            '選択中: クセ　二',
        )
        await page.unroute(WAIT_LIST_URL)
        await page.keyboard.press('F5')
    })

    test('TC-SEARCH-1 — 生年月日 gõ dở ⇒ E00002「生年月日」, focus về ô ngày, KHÔNG tìm', async () => {
        await page.keyboard.press('F1')
        let searched = 0
        const onReq = (r: Request) => {
            if (/\/tenant\/patients\?/.test(r.url())) searched++
        }
        page.on('request', onReq)
        const birth = condDateRow('生年月日')
        await birth.getByRole('textbox').nth(0).fill('10')
        await page.getByRole('button', { name: /検索/ }).click()
        const dlg = topDialog(page)
        await expect(dlg).toBeVisible({ timeout: 15_000 })
        expect(squash(await dlg.innerText())).toContain(MSG.E00002('生年月日'))
        await clickDialog(page, 'accept')
        await expect(dlg).toBeHidden()
        await expect(birth.getByRole('combobox'), 'focus phải về 元号 của 生年月日').toBeFocused()
        await page.waitForTimeout(1_000)
        page.off('request', onReq)
        expect(searched, 'E00002 mà vẫn gọi tìm kiếm').toBe(0)
    })

    test('TC-SEARCH-2 — 最終診療日 2月30日 ⇒ E00002「最終診療日」 (không lăn sang tháng 3)', async () => {
        const birth = condDateRow('生年月日')
        for (const i of [0, 1, 2]) await birth.getByRole('textbox').nth(i).fill('')
        const last = condDateRow('最終診療日')
        await last.getByRole('combobox').click()
        await page.getByRole('option', { name: '令和', exact: true }).click()
        const boxes = last.getByRole('textbox')
        await boxes.nth(0).fill('6')
        await boxes.nth(1).fill('2')
        await boxes.nth(2).fill('30')
        await page.getByRole('button', { name: /検索/ }).click()
        const dlg = topDialog(page)
        await expect(dlg).toBeVisible({ timeout: 15_000 })
        expect(squash(await dlg.innerText())).toContain(MSG.E00002('最終診療日'))
        await clickDialog(page, 'accept')
        await expect(last.getByRole('combobox')).toBeFocused()
    })

    test('TC-SEARCH-3 — sửa thành ngày thật ⇒ tìm bình thường, không E00002', async () => {
        const boxes = condDateRow('最終診療日').getByRole('textbox')
        await boxes.nth(2).fill('28')
        const res = page.waitForResponse((r) => /\/tenant\/patients\?/.test(r.url()), { timeout: 30_000 })
        await page.getByRole('button', { name: /検索/ }).click()
        await res
        const dlg = topDialog(page)
        if (await dlg.isVisible().catch(() => false)) {
            // E00003 (không có kết quả) là hợp lệ — chỉ cấm E00002.
            expect(squash(await dlg.innerText())).not.toContain('が間違っています。')
            await clickDialog(page, 'accept')
        }
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible()
    })

    test('TC-BR-7 — 枝番 đầu tiên lấy tư cách SAU 処置日 ⇒ lỗi エラー, ở lại màn (không đợi tới F9 lưu)', async () => {
        patchBrDt = '2099-01-01'
        nextBranchCheck({ hasRows: false, missingDate: null, mismatches: [] })
        await confirmTyped()
        const dlg = topDialog(page)
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        const text = squash(await dlg.innerText())
        expect(text).toContain('エラー')
        expect(text).toContain(notRegisteredMsg(mmddOf(TODAY)))
        await clickDialog(page, 'accept')
        await expectStillOnList()
        expect(checks.length, 'pat_br_chk = 0 mà vẫn gọi branch-check').toBe(0)
        patchBrDt = null
        // 患者詳細 có staleTime 10 giây — chờ bản đã vá hết hạn, không thì TC sau
        // đọc lại chính bản brDt = 2099 từ cache.
        await page.waitForTimeout(11_000)
    })

    test('TC-BR-1 — pat_br_chk = 0 ⇒ không gọi branch-check, mở màn bình thường', async () => {
        nextBranchCheck({ hasRows: true, missingDate: null, mismatches: [] })
        await confirmTyped()
        await expectOnDetail()
        expect(checks.length, 'pat_br_chk = 0 mà vẫn kiểm').toBe(0)
        expect(syncs.length).toBe(0)
    })

    // ════════════════════ Lần tải 2: F7 hiện, pat_br_chk = 1 ════════════════════

    test('TC-F7-2 — showBulkAccButton = 1 ⇒ F7 会計作成 hiện lại', async () => {
        showBulkAccButton = INP_FLAG.On
        patBrChk = 1
        await reloadList()
        await expect(page.locator('[data-fkey="F7"]')).toContainText('会計作成')
    })

    test('TC-BR-2 — tháng không có dòng trn_trn ⇒ không hỏi, không sync', async () => {
        nextBranchCheck({ hasRows: false, missingDate: null, mismatches: [] })
        await confirmTyped()
        await expectOnDetail()
        expect(checks.length).toBe(1)
        const q = new URL(checks[0]!.url()).searchParams
        expect(q.get('patNo')).toBe(PAT_NO)
        expect(q.get('trtDt')).toBe(TODAY)
        expect(syncs.length, 'Upd_TrnSubcode return sớm khi rsTrn rỗng').toBe(0)
        await backToList()
    })

    test('TC-BR-3 — có ngày không có 保険 ⇒ lỗi 診療入力枝番確認, ở lại màn, không sync', async () => {
        const missing = `${TODAY.slice(0, 7)}-03`
        nextBranchCheck({ hasRows: true, missingDate: missing, mismatches: [] })
        await confirmTyped()
        const dlg = topDialog(page)
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        const text = squash(await dlg.innerText())
        expect(text).toContain('診療入力枝番確認')
        expect(text).toContain(notRegisteredMsg(mmddOf(missing)))
        await clickDialog(page, 'accept')
        await expectStillOnList()
        expect(syncs.length).toBe(0)
    })

    const mismatches = Array.from({ length: 11 }, (_, i) => ({
        trtDt: `${TODAY.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`,
        oldPatBr: 1,
        newPatBr: 2,
    }))

    test('TC-BR-4 — lệch 枝番 ⇒ hỏi (tối đa 10 dòng); No ⇒ vẫn mở màn, KHÔNG sync', async () => {
        nextBranchCheck({ hasRows: true, missingDate: null, mismatches })
        await confirmTyped()
        const dlg = topDialog(page)
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        const text = squash(await dlg.innerText())
        expect(text).toContain('診療入力枝番確認')
        expect(text).toContain('患者登録上の有効開始日の登録情報と 診療入力上の枝番情報に矛盾があります。')
        for (const m of mismatches.slice(0, 10)) {
            expect(text).toContain(`${mmddOf(m.trtDt)}の患者登録上の枝番は2です。（1で入力されています）`)
        }
        expect(text, 'WinForm dừng liệt kê ở 10 dòng').not.toContain(
            `${mmddOf(mismatches[10]!.trtDt)}の患者登録上`,
        )
        expect(text).toContain('診療入力の枝番を患者登録上の枝番に変更しますか？')
        await clickDialog(page, 'decline')
        await expectOnDetail()
        expect(syncs.length, 'No thì Upd_TrnSubcode return true, không ghi gì').toBe(0)
        await backToList()
    })

    test('TC-BR-5 — lệch 枝番, Yes ⇒ POST branch-sync {patNo, trtDt} rồi mở màn', async () => {
        nextBranchCheck({ hasRows: true, missingDate: null, mismatches })
        await confirmTyped()
        await expect(topDialog(page)).toBeVisible({ timeout: 30_000 })
        await clickDialog(page, 'accept')
        await expectOnDetail()
        expect(syncs.length).toBe(1)
        expect(syncs[0]!.postDataJSON()).toMatchObject({ patNo: Number(PAT_NO), trtDt: TODAY })
        await backToList()
    })

    test('TC-BR-6 — không lệch ⇒ không hỏi nhưng VẪN sync (Upd_TrnStatus)', async () => {
        nextBranchCheck({ hasRows: true, missingDate: null, mismatches: [] })
        await confirmTyped()
        await expectOnDetail()
        expect(syncs.length).toBe(1)
        await backToList()
    })

    test('TC-RAIKAN-2 — đổi 診療日 sang tháng trước ⇒ nhãn đổi theo; ngày gõ dở giữ số cũ', async () => {
        const d = new Date()
        // Tháng 1 → lùi tháng phải đổi cả năm/元号, bỏ qua cho gọn.
        test.skip(d.getMonth() === 0, 'tháng 1 — bỏ qua')
        const prev = isoOf(new Date(d.getFullYear(), d.getMonth() - 1, 1))
        const boxes = trtDtRow().getByRole('textbox')
        const resP = page.waitForResponse(
            (r) =>
                MONTHLY_COUNT_URL.test(r.url()) &&
                new URL(r.url()).searchParams.get('trtDt') === firstOfMonth(prev),
            { timeout: 30_000 },
        )
        // 日 = 1 trước: ngày hôm nay có thể không tồn tại ở tháng trước (31 → 30 ngày).
        await boxes.nth(2).fill('1')
        await boxes.nth(1).fill(String(d.getMonth()))
        await page.keyboard.press('Tab')
        const count = Number(((await (await resP).json()) as { data: { count: number } }).data.count)
        await expect(raikanLabel()).toHaveText(`当月来患：${count}`)
        if (dbEnabled) expect(count).toBe(await raikanFromDb(prev))
        await step()

        // `SelDate` chỉ đổi khi ngày hợp lệ ⇒ xoá 日 thì nhãn giữ nguyên số cũ.
        await boxes.nth(2).fill('')
        await page.keyboard.press('Tab')
        await expect(raikanLabel()).toHaveText(`当月来患：${count}`)
    })
})
