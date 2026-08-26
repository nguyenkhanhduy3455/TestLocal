import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteWaitRows,
    ensureWaitRow,
    findPatientWithTrnThisMonth,
    findPatientWithoutAttSt,
    findPatientsByAttDr,
    listDoctors,
    personAttending,
} from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { rows, cells } from './virtual-grid'

/**
 * 診療入力（患者選択）— 患者確定 PHẢI chốt được 担当医 / 衛生士 trước khi mở
 * 処置入力 (port `frm203001.defData`, frm203001.cs:677-726).
 *
 * Vì sao đây là bug DỮ LIỆU chứ không phải bug UI: `drNo` / `staffNo` mà màn này
 * truyền đi bị đóng dấu lên MỌI dòng lưu ở màn sau
 * (`treatment-grid-rows.ts:544-545` → `SaveTreatmentsHandler.cs:317-318` →
 * `trn_trn.dr_no` / `staff_no`). Trước bản vá, combo để trống là màn chi tiết mở
 * bình thường rồi ghi cả ngày điều trị với `dr_no = 0` — WinForm KHÔNG BAO GIỜ
 * ghi 0 từ luồng này vì nó chặn ngay ở 患者選択.
 *
 * Chuỗi fallback đang kiểm (`lib/staff-assignment.ts`):
 *
 *   担当医  : combo có chọn → `user_no` của dòng 受付患者一覧 → `person.att_dr`
 *             → vẫn ≤ 0 thì E00027「ドクター」 + ở lại 患者選択
 *   衛生士  : combo có chọn → `person.att_st`
 *             → vẫn ≤ 0 thì E00027「衛生士」 NHƯNG chỉ khi `inp_config.eiseiji_flg` bật
 *   患者    : không đọc được 患者情報 → E00005 + trả focus về ô 患者番号
 *
 * Các fact bám theo source (apps/web-tenant/src/features/treatments):
 *  - components/treatment-entry-page.tsx `openDetail`:
 *      · thứ tự CHẶN: 診療日 (E00002) → 患者情報 (E00005) → 担当医/衛生士 (E00027).
 *      · `drNo: String(assignment.drNo)` — LUÔN có mặt trên URL sau bản vá.
 *        Trước bản vá là `drNo: dr || undefined`, tức combo trống thì param BIẾN
 *        MẤT. Đó chính là dấu hiệu phân biệt hai bản, TC-DR-1 dựa vào nó.
 *      · `staffNo` vẫn bị bỏ khi = 0: 衛生士 chưa gán mà hàng 衛生士 đang ẩn thì
 *        không đóng dấu 0 đè lên mặc định của màn chi tiết.
 *  - lib/staff-assignment.ts: 0 là sentinel 未選択 nên `att_dr = 0` bị coi như
 *    chưa gán; nhưng `att_st = 100` (無所属「－」) LÀ giá trị thật, không chặn.
 *  - locales/ja.ts: E00027「{field}が選択されていません。」, E00005「{field}が登録されていません。」.
 *    Cả hai đi qua `alertDialog(..., { severity: 'warning' })` ⇒ role
 *    `alertdialog` một nút OK (GUIDELINE Rule 13).
 *  - BE: `WaitingPatientResponse.UserNo` là field MỚI của bản vá. TC-API-1 kiểm
 *    nó trước tiên — thiếu field này thì TC-DR-4 vô nghĩa (FE không có gì để đọc).
 *
 * DỮ LIỆU: mọi 患者番号 / user_no đều DÒ TỪ DB lúc chạy (Rule 18), không hardcode.
 * Dataset khác vẫn chạy được; thiếu nhánh nào thì `skipWithReason` nói rõ.
 *
 * GHI DB (Rule 18.1): spec KHÔNG bấm 登録 và không sửa dữ liệu có sẵn. Nó chỉ
 * INSERT một dòng `wait` khi bệnh nhân CHƯA được tiếp nhận (bảng 受付一覧 ở máy
 * dev thường rỗng nên nhánh "mở từ 受付一覧" không thể kiểm bằng cách nào khác),
 * rồi DELETE đúng dòng đó theo `id` trong afterAll. Bệnh nhân đã có dòng 受付
 * sẵn thì DÙNG LẠI và KHÔNG xoá — `ux_wait_active` là unique theo `pat_no` nên
 * đây cũng là thứ giữ cho `--repeat-each` (3 worker song song) không dẫm chân
 * nhau. Không có TEST_DB thì cả file tự skip.
 *
 * CHẠY TUẦN TỰ và dùng CHUNG một page (Rule 10.1 / Rule 19). Testcase nối tiếp
 * trạng thái (ô 患者番号, combo Dr., view đang đứng) nên chạy lẻ bằng `-g` sẽ
 * hỏng. Luôn chạy cả file:
 *   npx playwright test tests/patient-select-dr-staff-required.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** `inp_config.eiseiji_flg` — 0 = ẩn hàng 衛生士 (EiseijiFlg.Hidden). */
const EISEIJI_HIDDEN = 0

const INP_CONFIG_URL = /\/tenant\/inp-config(\?|$)/
const WAIT_LIST_URL = /\/tenant\/treatment\/wait-list(\?|$)/

/** 患者番号 chắc chắn KHÔNG tồn tại — nhánh E00005. Cột `pat_no` là int32. */
const MISSING_PAT_NO = process.env.TEST_MISSING_PAT_NO ?? '99999999'

interface InpConfig {
    eiseijiFlg: number
}

/**
 * URL màn 処置入力 kèm `drNo` mong đợi.
 *
 * TanStack Router serialise search param KIỂU CHUỖI bằng JSON nên trên URL là
 * `drNo=%2216%22` (có nháy kép). Đây là convention của cả app, chấp nhận cả hai
 * dạng để không vỡ nếu router đổi cấu hình.
 */
function detailUrlWithDr(patNo: number, drNo: number): RegExp {
    return new RegExp(`/treatments/${patNo}\\?.*drNo=(?:%22)?${drNo}(?:%22)?(&|$)`)
}

test.describe.configure({ mode: 'serial' })

test.describe('診療入力（患者選択）— 患者確定 phải chốt 担当医 / 衛生士', () => {
    let page: Page
    let step: () => Promise<void>

    let inpConfig: InpConfig | null = null
    /** Payload GET /tenant/treatment/wait-list bắt được — nguồn của TC-API-1. */
    let waitListItems: Record<string, unknown>[] | null = null

    // ── Dữ liệu dò từ DB trong beforeAll ─────────────────────────────────────
    /** Bệnh nhân CÓ `person.att_dr` — nhánh fallback 患者マスタ. */
    let patWithDr = 0
    let attDrOfPatWithDr = 0
    /** Bệnh nhân KHÔNG có `person.att_dr` — nhánh chặn E00027「ドクター」. */
    let patWithoutDr: number | null = null
    /** Bệnh nhân có 担当医 nhưng KHÔNG có 衛生士 — nhánh chặn E00027「衛生士」. */
    let patWithoutSt: number | null = null
    /** Ｄｒ．chọn tay ở combo, CỐ Ý khác `att_dr` của `patWithDr`. */
    let pickedDoctor: { userNo: number; userNm: string } | null = null
    /**
     * `wait.user_no` THẬT của dòng 受付 dùng cho TC-DR-4.
     *
     * Bình thường là giá trị test seed (cố ý khác `att_dr`), nhưng nếu bệnh nhân
     * đã có sẵn dòng 受付 thật thì lấy `user_no` của dòng đó — test đọc dữ liệu
     * chứ không áp đặt (Rule 18).
     */
    let waitUserNo: number | null = null
    /** id các dòng `wait` do test tạo — afterAll xoá đúng chừng này. */
    const seededWaitIds: string[] = []
    /** Bệnh nhân CÓ 処置 mang dr_no > 0 trong tháng hiện tại — dựng nhánh seed từ TRN. */
    let trnPatient: { patNo: number; trnDrNos: number[]; attDr: number | null } | null = null
    /** Ｄｒ．chọn tay cho TC-SEED-1: KHÁC mọi dr_no trong TRN và khác att_dr. */
    let seedProbeDoctor: { userNo: number; userNm: string } | null = null
    /** Tên hiển thị của các Ｄｒ．— để đối chiếu nhãn combo trên header màn chi tiết. */
    let doctorNameOf = new Map<number, string>()

    // ── Locator dùng lại ─────────────────────────────────────────────────────

    /**
     * Ô 患者番号 của panel 患者選択.
     *
     * `.first()` vì 患者検索条件 bên phải cũng có nhãn cùng tên (Rule 10.3), và
     * role là **combobox** chứ không phải textbox — input này là phần điều khiển
     * của Popover lịch sử bệnh nhân (Rule 12.5).
     */
    function patNoInput(): Locator {
        return page
            .getByText('患者番号', { exact: true })
            .first()
            .locator('..')
            .getByRole('combobox')
    }

    /**
     * Trigger của combo Dr. / 衛生士 (StaffSelect).
     *
     * Nhãn render là `{label}:` (staff-select.tsx) — dấu hai chấm là thứ tách nó
     * khỏi HEADER LƯỚI cùng tên `Dr.`. Bỏ dấu này ra là bám nhầm vào header.
     */
    function staffSelect(label: 'Dr.' | '衛生士'): Locator {
        return page.getByText(`${label}:`, { exact: true }).locator('..').getByRole('combobox')
    }

    /**
     * Combo Ｄｒ．trên HEADER màn 処置入力.
     *
     * Nhãn ở đây là `Dr` (patient-info-header.tsx) chứ không phải `Dr.` như màn
     * 患者選択 — hai màn dùng chung StaffSelect nhưng truyền label khác nhau.
     */
    function detailDrSelect(): Locator {
        return page.getByText('Dr:', { exact: true }).locator('..').getByRole('combobox')
    }

    /**
     * appDialog — PHẢI loại `aria-busy="true"`: busyOverlay cũng mang role
     * `alertdialog` và sẽ bị đọc nhầm thành hộp kết quả (Rule 13).
     */
    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    // ── Thao tác dùng lại ────────────────────────────────────────────────────

    /**
     * Gõ 患者番号 rồi RỜI ô: popover lịch sử của PatientNoInput mang role
     * `dialog`, mà FKeyScopeProvider nuốt mọi F-key khi còn dialog nổi ⇒ không
     * Tab ra thì End im lặng không chạy.
     */
    async function typePatNo(value: string) {
        await patNoInput().fill(value)
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog'), 'popover lịch sử 患者番号 chưa đóng').toHaveCount(0)
        await step()
    }

    async function clearPatNo() {
        await patNoInput().fill('')
        await page.keyboard.press('Tab')
        await expect(page.getByRole('dialog')).toHaveCount(0)
    }

    /** Chọn một Ｄｒ．trong combo theo tên hiển thị (`user_nm`). */
    async function pickDoctor(userNm: string) {
        await staffSelect('Dr.').click()
        await page.getByRole('option', { name: userNm, exact: true }).click()
        await expect(staffSelect('Dr.')).toContainText(userNm)
        await step()
    }

    /**
     * Trả combo Dr. về dòng TRỐNG.
     *
     * Dòng trống là `<SelectItem value={EMPTY_SELECT_VALUE}>` render đúng một
     * dấu cách và đứng ĐẦU danh sách (staff-select.tsx), nên `.first()` là cách
     * duy nhất trỏ tới nó — nó không có tên để `getByRole('option', {name})` bám.
     */
    async function clearDoctor() {
        await staffSelect('Dr.').click()
        await page.getByRole('option').first().click()
        await step()
    }

    /** Đóng hộp cảnh báo đang mở và khẳng định nó biến mất. */
    async function dismissDialog() {
        await appDialog().getByRole('button', { name: 'OK' }).click()
        await expect(appDialog()).toHaveCount(0)
    }

    /**
     * Về lại màn danh sách sau khi một testcase đã điều hướng sang 処置入力.
     *
     * Đi bằng LINK SIDEBAR, KHÔNG `page.goto`: accessToken chỉ nằm trong RAM
     * (Rule 10.2) nên mỗi lần tải lại trang là một vòng refresh, lặp vài lần là
     * app render trang trắng. F5 sau đó = `chgViewType(viewType.wait)` của
     * WinForm, đưa lưới về ≪受付患者一覧≫ mà mọi testcase sau đều giả định.
     *
     * Màn 処置入力 có thể còn hộp thoại nổi (算定確認 …) chặn click sidebar; đóng
     * hết bằng OK TRƯỚC KHI rời đi — lúc này mọi assert của testcase đã xong nên
     * không có nguy cơ nuốt mất hộp thoại đang cần kiểm.
     */
    async function backToList() {
        for (let i = 0; i < 5 && (await appDialog().count()) > 0; i++) {
            const ok = appDialog().getByRole('button', { name: 'OK' })
            if ((await ok.count()) === 0) break
            await ok.first().click()
        }
        const link = page.getByRole('link', { name: '診療入力', exact: true })
        await expect(link, 'không thấy link 診療入力 trên sidebar').toBeVisible({ timeout: 30000 })
        await link.click()
        await expect(page.getByText('診 療 入 力')).toBeVisible({ timeout: 60000 })
        await page.keyboard.press('F5')
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
    }

    test.beforeAll(async ({ browser }) => {
        test.skip(!dbEnabled, 'cần TEST_DB=1 để dò 担当医/衛生士 và seed dòng 受付')

        // ── Dò dữ liệu TRƯỚC khi mở trình duyệt: không có nhánh nào thì skip
        //    sớm, khỏi tốn một lần login (Rule 10.1).
        const found = await findPatientsByAttDr()
        patWithoutDr = found.withoutDr
        patWithoutSt = await findPatientWithoutAttSt()
        expect(found.withDr, 'dataset không có bệnh nhân nào có 担当医').not.toBeNull()
        patWithDr = found.withDr!
        const att = await personAttending(patWithDr)
        expect(att?.attDr, `bệnh nhân ${patWithDr} không đọc được att_dr`).toBeTruthy()
        attDrOfPatWithDr = att!.attDr!

        // Ｄｒ．chọn tay và `wait.user_no` phải KHÁC att_dr, nếu không thì assert
        // "combo/dòng thắng 患者マスタ" xanh cả khi fallback chạy sai thứ tự.
        const allDoctors = await listDoctors()
        doctorNameOf = new Map(allDoctors.map((d) => [d.userNo, d.userNm]))
        trnPatient = await findPatientWithTrnThisMonth()
        if (trnPatient) {
            // Phải khác MỌI dr_no của tháng và khác att_dr, nếu không thì không
            // phân biệt được "seed từ TRN" với "seed từ màn chọn".
            const taken = new Set<number>([...trnPatient.trnDrNos, trnPatient.attDr ?? -1])
            seedProbeDoctor = allDoctors.find((d) => d.userNo > 0 && !taken.has(d.userNo)) ?? null
        }
        const doctors = allDoctors.filter((d) => d.userNo !== attDrOfPatWithDr)
        expect(doctors.length, 'cần ít nhất 2 Ｄｒ．khác nhau để phân biệt nguồn của drNo').toBeGreaterThan(1)
        pickedDoctor = doctors[0]!

        // Dòng 受付 phải có TRƯỚC khi vào màn để lần fetch đầu tiên đã thấy nó,
        // khỏi phải chờ vòng poll 30s. Bệnh nhân đã có dòng 受付 sẵn (dữ liệu
        // thật, hoặc worker song song của `--repeat-each`) thì DÙNG LẠI dòng đó
        // và chỉ xoá dòng do chính mình tạo.
        const wait = await ensureWaitRow(patWithDr, doctors[1]!.userNo)
        waitUserNo = wait.userNo
        if (wait.created) seededWaitIds.push(wait.id)

        console.log(
            `dữ liệu: patWithDr=${patWithDr} (att_dr=${attDrOfPatWithDr}), ` +
                `patWithoutDr=${patWithoutDr ?? 'KHÔNG CÓ'}, patWithoutSt=${patWithoutSt ?? 'KHÔNG CÓ'}, ` +
                `combo Dr.=${pickedDoctor.userNo}「${pickedDoctor.userNm}」, ` +
                `wait.user_no=${waitUserNo ?? 'NULL'}${wait.created ? ' (test seed)' : ' (dòng có sẵn)'}`,
        )
        console.log(
            trnPatient
                ? `TRN tháng này: 患者${trnPatient.patNo} dr_no=[${trnPatient.trnDrNos.join(',')}] ` +
                      `att_dr=${trnPatient.attDr ?? 'NULL'} → Ｄｒ．dò=${seedProbeDoctor?.userNo ?? 'KHÔNG CÓ'}`
                : 'TRN tháng này: KHÔNG có bệnh nhân nào → TC-SEED-1 sẽ skip',
        )

        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Cắm listener TRƯỚC khi vào màn: react-query cache inp-config lâu nên
        // chỉ có đúng một request trong cả phiên.
        page.on('response', (res) => {
            if (res.request().method() !== 'GET') return
            if (INP_CONFIG_URL.test(res.url())) {
                void res
                    .json()
                    .then((body) => {
                        const data = (body as { data?: { eiseijiFlg?: number } }).data
                        if (data) inpConfig = { eiseijiFlg: Number(data.eiseijiFlg) }
                    })
                    .catch(() => undefined)
            }
            if (WAIT_LIST_URL.test(res.url())) {
                void res
                    .json()
                    .then((body) => {
                        const items = (body as { data?: { items?: Record<string, unknown>[] } }).data?.items
                        if (Array.isArray(items) && items.length > 0) waitListItems = items
                    })
                    .catch(() => undefined)
            }
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F7"]')).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await page?.close()
        if (seededWaitIds.length > 0) {
            const n = await deleteWaitRows(seededWaitIds)
            console.log(`dọn ${n} dòng 受付 do test tạo`)
        }
    })

    // ── BE — field user_no của 受付一覧 ──────────────────────────────────────

    test('TC-API-1 — GET wait-list trả field `userNo` (dòng 受付 mang theo 担当医)', async () => {
        await expect
            .poll(() => waitListItems, {
                message: 'không bắt được GET /tenant/treatment/wait-list có dòng nào',
                timeout: 30000,
            })
            .not.toBeNull()

        const seeded = waitListItems!.find((r) => Number(r['patNo']) === patWithDr)
        expect(seeded, `không thấy dòng 受付 vừa seed cho bệnh nhân ${patWithDr}`).toBeTruthy()

        // Trước bản vá, response chỉ có `userNm` (tên để hiển thị) — FE không có
        // cách nào biết số. Thiếu key này nghĩa là API đang chạy chưa có bản vá.
        expect(
            Object.prototype.hasOwnProperty.call(seeded!, 'userNo'),
            'wait-list KHÔNG có field userNo — API đang chạy có phải bản đã merge không?',
        ).toBe(true)
        const wire = seeded!['userNo']
        expect(
            wire === null || wire === undefined ? null : Number(wire),
            'userNo trả về khác giá trị trong bảng wait',
        ).toBe(waitUserNo)
        await step()
    })

    // ── 担当医 ───────────────────────────────────────────────────────────────

    test('TC-DR-1 — combo Dr. TRỐNG: 患者確定 lấy 担当医 của 患者マスタ, drNo có mặt trên URL', async () => {
        await typePatNo(String(patWithDr))
        await page.keyboard.press('End')

        // Bản CŨ: `drNo: dr || undefined` ⇒ combo trống thì param biến mất khỏi
        // URL và màn sau ghi dr_no = 0. Bản MỚI phải điền att_dr vào đây.
        await expect(
            page,
            `combo trống mà URL không mang drNo=${attDrOfPatWithDr} — fallback person.att_dr chưa chạy`,
        ).toHaveURL(detailUrlWithDr(patWithDr, attDrOfPatWithDr), { timeout: 30000 })
        console.log(`患者${patWithDr}: combo trống → drNo=${attDrOfPatWithDr} (att_dr)`)
        await step()

        await backToList()
    })

    test('TC-DR-2 — combo Dr. CÓ CHỌN: giá trị combo thắng 担当医 của 患者マスタ', async () => {
        await pickDoctor(pickedDoctor!.userNm)
        await typePatNo(String(patWithDr))
        await page.keyboard.press('End')

        await expect(
            page,
            `chọn Ｄｒ．${pickedDoctor!.userNo} mà URL vẫn mang att_dr=${attDrOfPatWithDr}`,
        ).toHaveURL(detailUrlWithDr(patWithDr, pickedDoctor!.userNo), { timeout: 30000 })
        console.log(`患者${patWithDr}: combo=${pickedDoctor!.userNo} → drNo=${pickedDoctor!.userNo}`)
        await step()

        await backToList()
        // Trả combo về trống cho các testcase sau (chúng đều kiểm nhánh fallback).
        await clearDoctor()
    })

    test('TC-DR-3 — không có nguồn nào cho 担当医: E00027「ドクター」, KHÔNG điều hướng', async () => {
        skipWithReason(
            patWithoutDr === null,
            'dataset không có bệnh nhân nào thiếu 担当医 — không dựng được nhánh chặn',
        )

        await typePatNo(String(patWithoutDr))
        await page.keyboard.press('End')

        await expect(
            appDialog(),
            'bệnh nhân không có 担当医 mà 患者確定 vẫn im lặng — đang ghi dr_no = 0 xuống trn_trn',
        ).toBeVisible({ timeout: 15000 })
        await expect(appDialog()).toContainText('ドクター')
        await expect(
            appDialog(),
            'nội dung khác locales/ja.ts E00027「{field}が選択されていません。」',
        ).toContainText('選択されていません')
        await dismissDialog()

        await expect(page, 'đã sang màn chi tiết dù chưa chốt được 担当医').toHaveURL(
            /\/treatments\/?(\?|$)/,
        )
        await step()
    })

    // ── 衛生士 ───────────────────────────────────────────────────────────────

    test('TC-ST-1 — không có nguồn nào cho 衛生士: E00027「衛生士」 khi hàng 衛生士 đang hiện', async () => {
        await expect
            .poll(() => inpConfig, { message: 'không bắt được GET /tenant/inp-config', timeout: 30000 })
            .not.toBeNull()

        skipWithReason(
            inpConfig!.eiseijiFlg === EISEIJI_HIDDEN,
            `eiseiji_flg=${inpConfig?.eiseijiFlg} (ẩn hàng 衛生士) → WinForm KHÔNG chặn ở 衛生士, ` +
                'đặt inp_config.eiseiji_flg ≠ 0 rồi chạy lại mới kiểm được nhánh này',
        )
        skipWithReason(
            patWithoutSt === null,
            'dataset không có bệnh nhân nào CÓ 担当医 mà THIẾU 衛生士 (lưu ý att_st=100 là 無所属, vẫn tính là có)',
        )

        await typePatNo(String(patWithoutSt))
        await page.keyboard.press('End')

        await expect(appDialog(), 'thiếu 衛生士 mà không chặn').toBeVisible({ timeout: 15000 })
        await expect(
            appDialog(),
            'chặn nhầm ở 担当医 — bệnh nhân này CÓ att_dr, lẽ ra phải qua được bước Dr.',
        ).toContainText('衛生士')
        await expect(appDialog()).toContainText('選択されていません')
        await dismissDialog()

        await expect(page, 'đã sang màn chi tiết dù chưa chốt được 衛生士').toHaveURL(
            /\/treatments\/?(\?|$)/,
        )
        await step()
    })

    // ── 患者情報 ─────────────────────────────────────────────────────────────

    test('TC-PAT-1 — 患者番号 không tồn tại: E00005「患者情報」, KHÔNG điều hướng', async () => {
        await typePatNo(MISSING_PAT_NO)
        await page.keyboard.press('End')

        await expect(appDialog(), '患者番号 không có thật mà vẫn mở màn chi tiết').toBeVisible({
            timeout: 15000,
        })
        await expect(appDialog()).toContainText('患者情報')
        await expect(
            appDialog(),
            'nội dung khác locales/ja.ts E00005「{field}が登録されていません。」',
        ).toContainText('登録されていません')
        await dismissDialog()

        await expect(page).toHaveURL(/\/treatments\/?(\?|$)/)
        await step()
    })

    // ── 受付患者一覧 ─────────────────────────────────────────────────────────

    test('TC-DR-4 — mở từ 受付患者一覧: `user_no` của DÒNG thắng 担当医 của 患者マスタ', async () => {
        // Dòng 受付 phải mang một 担当医 KHÁC att_dr, nếu không thì không phân
        // biệt được hai nguồn — assert sẽ xanh cả khi fallback chạy sai thứ tự.
        skipWithReason(
            waitUserNo === null || waitUserNo === attDrOfPatWithDr,
            `dòng 受付 của bệnh nhân ${patWithDr} có user_no=${waitUserNo ?? 'NULL'} — ` +
                `trùng att_dr (${attDrOfPatWithDr}) hoặc rỗng nên không tách được hai nguồn`,
        )

        // Ô 患者番号 phải trống: `confirmPatient` đọc ô TRƯỚC lưới, và nhánh
        // "dòng lưới" mới là nhánh mang `fromListRow`.
        await clearPatNo()
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
        await expect(rows(page).first()).toBeVisible({ timeout: 30000 })

        // Dòng của bệnh nhân đã seed — lưới có thể có dòng thật khác xen vào.
        const patCells = cells(page, 'patNo')
        const total = await patCells.count()
        let index = -1
        for (let i = 0; i < total; i++) {
            const raw = (await patCells.nth(i).innerText()).trim()
            if (Number(raw.replace(/[^\d]/g, '')) === patWithDr) {
                index = i
                break
            }
        }
        expect(index, `không thấy dòng 受付 của bệnh nhân ${patWithDr} trên lưới`).toBeGreaterThanOrEqual(0)

        await rows(page).nth(index).dblclick()

        await expect(
            page,
            `mở từ 受付一覧 mà drNo không phải user_no=${waitUserNo} của dòng — ` +
                `đang lấy nhầm att_dr=${attDrOfPatWithDr} của 患者マスタ`,
        ).toHaveURL(detailUrlWithDr(patWithDr, waitUserNo!), { timeout: 30000 })
        console.log(`受付一覧 → drNo=${waitUserNo} (wait.user_no), KHÔNG phải ${attDrOfPatWithDr}`)
        await step()

        await backToList()
    })

    // ── Seed Ｄｒ．ở HEADER màn 処置入力 ─────────────────────────────────────

    test('TC-SEED-1 — header 処置入力 giữ Ｄｒ．vừa chọn, KHÔNG lấy dr_no của dòng TRN cũ', async () => {
        skipWithReason(
            trnPatient === null,
            'không có bệnh nhân nào có 処置 mang dr_no > 0 trong tháng hiện tại — ' +
                'không dựng được trạng thái mà bug cũ lộ ra',
        )
        skipWithReason(
            seedProbeDoctor === null,
            `mọi Ｄｒ．đều đã xuất hiện trong TRN/att_dr của 患者${trnPatient?.patNo} — ` +
                'không còn giá trị nào để phân biệt hai nguồn seed',
        )

        // Bản CŨ: `pickFirstNonDefault(currentMonthMapper.items, 'drNo')` thắng
        // props, nên header hiện Ｄｒ．của lần khám trước dù người dùng vừa chọn
        // người khác — và mọi dòng thêm mới bị đóng dấu số đó khi F9 登録.
        await clearPatNo()
        await pickDoctor(seedProbeDoctor!.userNm)
        await typePatNo(String(trnPatient!.patNo))
        await page.keyboard.press('End')

        await expect(page).toHaveURL(detailUrlWithDr(trnPatient!.patNo, seedProbeDoctor!.userNo), {
            timeout: 30000,
        })

        // Đây mới là assert của #2: URL đúng từ trước bản vá (nó đọc combo),
        // cái sai nằm ở HEADER màn chi tiết.
        await expect(
            detailDrSelect(),
            `header lấy Ｄｒ．từ dòng TRN cũ (dr_no=[${trnPatient!.trnDrNos.join(',')}]) ` +
                `thay vì Ｄｒ．${seedProbeDoctor!.userNo} vừa chọn ở màn 患者選択`,
        ).toHaveText(seedProbeDoctor!.userNm, { timeout: 30000 })

        // Nói thẳng ra tên của các Ｄｒ．trong TRN để log đọc được khi hỏng.
        for (const drNo of trnPatient!.trnDrNos) {
            const nm = doctorNameOf.get(drNo)
            if (!nm || nm === seedProbeDoctor!.userNm) continue
            await expect(detailDrSelect(), `header đang hiện Ｄｒ．của TRN 「${nm}」`).not.toHaveText(nm)
        }
        console.log(
            `患者${trnPatient!.patNo} (TRN dr_no=[${trnPatient!.trnDrNos.join(',')}]) → ` +
                `header giữ 「${seedProbeDoctor!.userNm}」`,
        )
        await step()

        await backToList()
        await clearDoctor()
    })
})
