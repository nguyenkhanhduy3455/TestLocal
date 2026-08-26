import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, findPatientWithTrnThisMonth, listDoctors } from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 処置入力 — vùng 「Ｄｒ」/「衛」 trên header (frm203002).
 *
 * WinForm đặt BA control ở cùng một chỗ, mỗi cái trả lời một câu hỏi khác nhau:
 *
 * | control | trả lời | mặc định |
 * |---|---|---|
 * | `lblDrLabel` (CustomLabel 「Ｄｒ」) | click = **一括変更** cả ngày (`:8099-8126`) | luôn hiện |
 * | `lbDr` (TextBox) | 担当医 **của dòng con trỏ đang đứng** (`hFG1[69]`, Chg_DrName) | luôn hiện |
 * | `cboDr` (ComboBox) | 担当医 sẽ đóng dấu cho **dòng thêm mới** (`pintDrNo`) | `Visible = false`, click `lbDr` mới hiện |
 *
 * Web trước đây chỉ có MỘT `<Select>` hiện `activeDrNo`, tức chỉ có cột thứ ba.
 * Spec này khoá lại cả ba, vì chúng rất dễ bị gộp lại thành một khi refactor.
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - lib/chg-dr-name.ts: giá trị của dòng → rỗng thì mới lấy combo. Dòng có 点/回
 *    là dấu gạch (部位病名行 / 保険切替行 / 介護一部負担金) trả `null` = GIỮ NGUYÊN
 *    nhãn cũ — `return` sớm của WinForm là no-op trên TextBox, không phải xoá.
 *  - lib/bulk-staff-change.ts: 一括変更 gom theo Ô 日 (pendingDay thắng day), và
 *    ghi đè MỌI dòng cùng ngày kể cả 部位病名行.
 *  - components/patient-info-header.tsx: `StaffField` — caption và ô giá trị là
 *    HAI `<button>` riêng; combo chỉ mount khi `picking`.
 *  - Văn bản xác nhận 一括変更 là `Interaction.MsgBox` viết thẳng trong source
 *    (KHÔNG qua MSGTBL) nên khớp từng chữ: 「{N}日診療分の担当ドクターを\n{氏名}
 *    に変更します。\n\nよろしいですか？」, title 「ドクター変更」.
 *
 * KHÔNG GHI DB: spec không bấm F9 登録. 一括変更 chỉ sửa lưới trong bộ nhớ; rời màn
 * hình là mất. Vì vậy không cần TEST_ALLOW_SAVE.
 *
 * CHẠY TUẦN TỰ, dùng chung một page (Rule 10.1 / Rule 19), testcase nối tiếp
 * trạng thái (đang đứng ở màn chi tiết, con trỏ ở dòng nào, combo đang mở hay
 * đóng) nên chạy lẻ bằng `-g` sẽ hỏng:
 *   npx playwright test tests/treatment-header-staff.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

const MST_IIN_URL = /\/tenant\/mst-iin-2(\?|$)/

/** Chỉ số cột lưới — `RegiCol` (frm203002.cs:158-169). */
const COL_DAY = 0
const COL_RYO = 2

/** rowKey của dòng THÁNG CŨ là `${recordIndex}-${itemIndex}`; dòng tháng hiện hành là uuid. */
const HISTORY_KEY_RE = /^\d+-\d+$/

const GRID_LOAD_TIMEOUT = 60_000

test.describe.configure({ mode: 'serial' })

test.describe('処置入力 — 「Ｄｒ」ラベル / コンボ / 一括変更', () => {
    let page: Page
    let step: () => Promise<void>

    /** Bệnh nhân có 処置 mang dr_no > 0 trong tháng hiện tại. */
    let trnPatient: { patNo: number; trnDrNos: number[]; attDr: number | null } = {
        patNo: 0,
        trnDrNos: [],
        attDr: null,
    }
    /** Ｄｒ．chọn ở 患者選択 — CỐ Ý khác mọi dr_no của tháng và khác att_dr. */
    let pickedDoctor: { userNo: number; userNm: string } | null = null
    /** Tên của Ｄｒ．đang nằm trên các dòng TRN — cái mà NHÃN phải hiện. */
    let rowDoctorNm = ''
    /** Mọi payload GET /tenant/mst-iin-2 bắt được — nguồn của TC-MST-1. */
    const mstIinPayloads: Record<string, unknown>[][] = []

    // ── Locator ──────────────────────────────────────────────────────────────

    /**
     * Hàng 「Ｄｒ」 trên header màn chi tiết: caption + ô giá trị là HAI button
     * anh em trong cùng một div (patient-info-header.tsx `StaffField`).
     *
     * Nhãn ở màn chi tiết là `Dr:` — màn 患者選択 dùng `Dr.:`, khác nhau đúng một
     * dấu chấm, nên `exact` là bắt buộc.
     */
    function drCaption(): Locator {
        return page.getByRole('button', { name: 'Dr:', exact: true })
    }

    /** Ô giá trị (lbDr) — button thứ hai của hàng, tên có thể RỖNG nên phải theo vị trí. */
    function drValue(): Locator {
        return drCaption().locator('..').getByRole('button').nth(1)
    }

    /**
     * Combo (cboDr) — chỉ tồn tại sau khi click ô giá trị. Màn chi tiết không có
     * combobox nào khác lúc bình thường, nên TC-LBL-2 khẳng định luôn count = 0
     * trước khi click.
     */
    function drCombo(): Locator {
        return page.getByRole('combobox').first()
    }

    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    const cell = (key: string, col: number) => page.locator(`[data-grid-cell="${key}|${col}"]`)

    /** rowKey + số ngày của mọi dòng THÁNG HIỆN HÀNH đang hiển thị. */
    async function currentMonthRows(): Promise<{ key: string; day: string }[]> {
        const keys = await page.locator(`[data-grid-cell$="|${COL_RYO}"]`).evaluateAll((els) =>
            els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')),
        )
        const out: { key: string; day: string }[] = []
        for (const key of keys) {
            if (HISTORY_KEY_RE.test(key)) continue
            out.push({ key, day: (await cell(key, COL_DAY).innerText()).trim() })
        }
        return out
    }

    test.beforeAll(async ({ browser }) => {
        test.skip(!dbEnabled, 'cần TEST_DB=1 để dò 担当医 của các dòng TRN')

        const found = await findPatientWithTrnThisMonth()
        skipWithReason(
            found === null,
            'không có bệnh nhân nào có 処置 mang dr_no > 0 trong tháng hiện tại — ' +
                'nhãn 「Ｄｒ」 không có gì để hiện',
        )
        trnPatient = found!

        const doctors = await listDoctors()
        const taken = new Set<number>([...trnPatient.trnDrNos, trnPatient.attDr ?? -1])
        pickedDoctor = doctors.find((d) => d.userNo > 0 && !taken.has(d.userNo)) ?? null
        skipWithReason(
            pickedDoctor === null,
            `mọi Ｄｒ．đều đã có mặt trong TRN/att_dr của 患者${trnPatient.patNo} — ` +
                'không tách được nhãn (dòng) với combo (sắp tới)',
        )
        rowDoctorNm = doctors.find((d) => d.userNo === trnPatient.trnDrNos[0])?.userNm ?? ''
        skipWithReason(rowDoctorNm === '', 'dr_no của dòng TRN không có trong 医院マスタ')

        console.log(
            `患者${trnPatient.patNo}: TRN dr_no=[${trnPatient.trnDrNos.join(',')}]「${rowDoctorNm}」, ` +
                `combo chọn ${pickedDoctor!.userNo}「${pickedDoctor!.userNm}」`,
        )

        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
        page.on('response', (res) => {
            if (!MST_IIN_URL.test(res.url()) || res.request().method() !== 'GET') return
            void res
                .json()
                .then((body) => {
                    const data = (body as { data?: Record<string, unknown>[] }).data
                    if (Array.isArray(data)) mstIinPayloads.push(data)
                })
                .catch(() => undefined)
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        // Đi qua 患者選択 chứ không goto thẳng: chỉ đường đó mới đặt được combo Ｄｒ．
        // khác với dr_no của các dòng TRN, tức mới tách được nhãn với combo.
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F7"]')).toBeVisible({ timeout: 60000 })

        await page.getByText('Dr.:', { exact: true }).locator('..').getByRole('combobox').click()
        await page.getByRole('option', { name: pickedDoctor!.userNm, exact: true }).click()

        const patNoBox = page
            .getByText('患者番号', { exact: true })
            .first()
            .locator('..')
            .getByRole('combobox')
        await patNoBox.fill(String(trnPatient.patNo))
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog')).toHaveCount(0)
        await page.keyboard.press('End')

        await expect(page).toHaveURL(new RegExp(`/treatments/${trnPatient.patNo}\\?`), {
            timeout: 30000,
        })
        await expect(page.locator(`[data-grid-cell$="|${COL_RYO}"]`).first()).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── /tenant/mst-iin-2 không được trả dòng sentinel ───────────────────────

    test('TC-MST-1 — dropdown 担当医 KHÔNG chứa user_no = 0 (未選択 sentinel)', async () => {
        await expect
            .poll(() => mstIinPayloads.length, {
                message: 'không bắt được GET /tenant/mst-iin-2 nào',
                timeout: 30000,
            })
            .toBeGreaterThan(0)

        const sentinel = mstIinPayloads
            .flat()
            .filter((r) => Number(r['userNo']) === 0)
            .map((r) => String(r['userNm']))
        expect(
            sentinel,
            `dropdown đang trả dòng user_no = 0 (${sentinel.join(', ')}) — đó là sentinel ` +
                '「chưa chọn Ｄｒ．」 của trn_trn.dr_no, chọn được là ghi thẳng giá trị vô nghĩa',
        ).toHaveLength(0)
        console.log(`đã soi ${mstIinPayloads.flat().length} dòng 医院マスタ, không có user_no = 0`)
        await step()
    })

    test('TC-MST-2 — gọi KHÔNG kèm userKbn cũng không được trả user_no = 0', async () => {
        // TC-MST-1 một mình là chưa đủ: FE luôn gửi userKbn=0/1, mà chủ tenant có
        // user_kbn = Staff(2) nên không lọt vào hai nhánh đó dù BE có chặn hay
        // không. Nhánh THẬT SỰ lộ là lời gọi không kèm 区分 — chỉ có ở tầng BE.
        //
        // Không tự dựng request được: accessToken chỉ nằm trong RAM (Rule 10.2).
        // Cách duy nhất là chặn request CỦA CHÍNH APP rồi bỏ query đi, để nó mang
        // theo header thật.
        const unfiltered: Record<string, unknown>[] = []
        await page.route(MST_IIN_URL, async (route) => {
            try {
                const stripped = route.request().url().split('?')[0]!
                const res = await route.fetch({ url: stripped })
                const body = (await res.json()) as { data?: Record<string, unknown>[] }
                if (Array.isArray(body.data)) unfiltered.push(...body.data)
                await route.fulfill({ response: res })
            } catch {
                // Một request bay tới sau khi testcase đã kết thúc (hoặc lúc
                // teardown) sẽ ném "Request context disposed" và làm log rối
                // thêm một lỗi giả bên cạnh lỗi thật. Trả nó về mạng là xong.
                await route.continue().catch(() => undefined)
            }
        })

        try {
            // Một lần reload để react-query nạp lại 医院マスタ qua route ở trên.
            await page.reload({ waitUntil: 'domcontentloaded' })
            await expect
                .poll(() => unfiltered.length, {
                    message: 'không bắt được lời gọi 医院マスタ nào sau khi reload',
                    timeout: 30000,
                })
                .toBeGreaterThan(0)
        } finally {
            await page.unroute(MST_IIN_URL)
        }

        const sentinel = unfiltered
            .filter((r) => Number(r['userNo']) === 0)
            .map((r) => `${String(r['userNm'])}(kbn=${String(r['userKbn'])})`)
        expect(
            sentinel,
            `feed không lọc 区分 vẫn trả user_no = 0 (${sentinel.join(', ')}) — ` +
                'GetMstIin2Handler chưa loại dòng sentinel',
        ).toHaveLength(0)
        console.log(`feed không lọc 区分: ${unfiltered.length} dòng, không có user_no = 0`)

        // Reload đưa màn hình về trạng thái mới: các TC sau cần lưới đã dựng lại.
        await expect(page.locator(`[data-grid-cell$="|${COL_RYO}"]`).first()).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
        await step()
    })

    // ── Chg_DrName: nhãn theo DÒNG, combo theo NGƯỜI SẮP TỚI ─────────────────

    test('TC-LBL-1 — nhãn 「Ｄｒ」 hiện 担当医 của DÒNG, không phải Ｄｒ．vừa chọn', async () => {
        // Con trỏ dừng ở dòng CUỐI sau khi nạp lưới (modSave.GetTrnRs → Calc_MDPoint
        // → Chg_DrName), nên nhãn phải là dr_no của dòng đó.
        await expect(
            drValue(),
            `nhãn đang hiện Ｄｒ．của combo thay vì dr_no=${trnPatient.trnDrNos.join('/')} của dòng — ` +
                'Chg_DrName chưa được port?',
        ).toHaveText(rowDoctorNm, { timeout: 30000 })
        await expect(
            drValue(),
            'nhãn trùng với Ｄｒ．vừa chọn ⇒ hai control đang bị gộp làm một',
        ).not.toHaveText(pickedDoctor!.userNm)
        console.log(`nhãn 「Ｄｒ」 = 「${rowDoctorNm}」 (dòng), combo = 「${pickedDoctor!.userNm}」`)
        await step()
    })

    test('TC-LBL-2 — click nhãn mới hiện combo, và combo giữ Ｄｒ．vừa chọn', async () => {
        // cboDr.Visible = false cho tới khi lbDr_Click (frm203002.cs:8082).
        await expect(
            page.getByRole('combobox'),
            'combo Ｄｒ．hiện sẵn — WinForm để Visible = false',
        ).toHaveCount(0)

        await drValue().click()
        const combo = drCombo()
        await expect(combo, 'click ô giá trị mà combo không hiện ra').toBeVisible({
            timeout: 15000,
        })
        await expect(
            combo,
            'combo phải giữ Ｄｒ．「sắp đóng dấu」 = giá trị chọn ở 患者選択',
        ).toContainText(pickedDoctor!.userNm)

        // cboDr_Leave đưa Visible về false.
        await page.keyboard.press('Escape')
        await page.locator('body').click({ position: { x: 5, y: 5 } })
        await expect(page.getByRole('combobox'), 'combo không tự ẩn sau khi rời').toHaveCount(0)
        await step()
    })

    // ── 入力済みの一括変更 ───────────────────────────────────────────────────

    test('TC-BULK-1 — click caption 「Ｄｒ」 hỏi đúng văn bản, bấm No thì không đổi gì', async () => {
        const rows = await currentMonthRows()
        skipWithReason(rows.length === 0, 'lưới không có dòng nào của tháng hiện hành')
        const focusedDay = rows[rows.length - 1]!.day

        await drCaption().click()
        await expect(appDialog(), 'click caption mà không hỏi gì — 一括変更 chưa port?').toBeVisible({
            timeout: 15000,
        })
        // Văn bản viết thẳng trong source nên khớp từng chữ, kể cả 「日診療分の」.
        await expect(appDialog()).toContainText(`${focusedDay}日診療分の担当ドクターを`)
        await expect(appDialog()).toContainText(pickedDoctor!.userNm)
        await expect(appDialog()).toContainText('に変更します。')
        await expect(appDialog()).toContainText('よろしいですか？')

        await appDialog()
            .getByRole('button', { name: /^(No|いいえ)$/ })
            .click()
        await expect(appDialog()).toHaveCount(0)

        await expect(drValue(), 'bấm No mà lưới vẫn bị ghi đè').toHaveText(rowDoctorNm)
        await step()
    })

    test('TC-BULK-2 — bấm Yes: MỌI dòng cùng ngày đổi sang Ｄｒ．của combo', async () => {
        const rows = await currentMonthRows()
        const focusedDay = rows[rows.length - 1]!.day
        const sameDay = rows.filter((r) => r.day === focusedDay)
        const otherDay = rows.find((r) => r.day !== focusedDay)

        await drCaption().click()
        await expect(appDialog()).toBeVisible({ timeout: 15000 })
        await appDialog()
            .getByRole('button', { name: /^(Yes|はい)$/ })
            .click()
        await expect(appDialog()).toHaveCount(0)

        // Dòng đang đứng đã mang Ｄｒ．mới ⇒ nhãn (đọc chính dòng đó) phải đổi theo.
        await expect(
            drValue(),
            'nhãn không đổi sau khi đồng ý — lưới chưa được ghi đè',
        ).toHaveText(pickedDoctor!.userNm, { timeout: 15000 })

        // Sang một dòng KHÁC cùng ngày: cũng phải là Ｄｒ．mới.
        skipWithReason(
            sameDay.length < 2,
            `ngày ${focusedDay} chỉ có 1 dòng — không kiểm được vế 「mọi dòng cùng ngày」`,
        )
        const another = sameDay.find((r) => r.key !== rows[rows.length - 1]!.key)!
        await cell(another.key, COL_RYO).click()
        await expect(
            drValue(),
            `dòng khác của ngày ${focusedDay} chưa được ghi đè — vòng lặp đang bỏ sót dòng`,
        ).toHaveText(pickedDoctor!.userNm, { timeout: 15000 })

        // Ngày khác PHẢI giữ nguyên — 一括変更 chỉ đụng đúng một ngày.
        if (otherDay) {
            await cell(otherDay.key, COL_RYO).click()
            await expect(
                drValue(),
                `ngày ${otherDay.day} bị ghi đè lây — điều kiện so ô 日 đang sai`,
            ).toHaveText(rowDoctorNm, { timeout: 15000 })
            console.log(`ngày ${focusedDay} → 「${pickedDoctor!.userNm}」, ngày ${otherDay.day} giữ nguyên`)
        } else {
            console.log(`lưới chỉ có ngày ${focusedDay} → chưa kiểm được vế 「không lây sang ngày khác」`)
        }
        await step()
        // KHÔNG bấm F9: thay đổi chỉ nằm trong lưới, rời màn hình là mất.
    })
})
