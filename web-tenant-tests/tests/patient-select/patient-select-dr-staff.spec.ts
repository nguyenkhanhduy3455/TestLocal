/**
 * 診療入力（患者選択）— 患者確定 PHẢI chốt 担当医 / 衛生士 (port `frm203001.defData`,
 * frm203001.cs:677-726).
 *
 * MỘT CHỨC NĂNG = MỘT FILE. Hai spec cũ đo CÙNG một việc từ hai mốc khác nhau, và
 * chính doc của chúng đã nói vậy:
 *   · khối 1 đo theo **URL** (`drNo=` trên query string) — mốc đúng để kiểm chuỗi
 *     fallback của FE, nhưng WinForm không có URL nên không so được với bản gốc;
 *   · khối 2 đo đúng những mốc **WinForm cũng đo được** (nhãn Ｄｒ．/ 衛生士 trên
 *     header 処置入力, tức `lbDr` / `lbEiseisi`).
 *
 * Vì sao đáng gộp: `drNo`/`staffNo` mà màn này truyền đi bị đóng dấu lên MỌI dòng
 * lưu ở màn sau (`trn_trn.dr_no` / `staff_no`) — đụng vào `defData` là phải xét cả
 * hai mốc cùng lúc, tách file thì dễ sửa một nửa rồi quên nửa kia.
 *
 * Hai khối giữ NGUYÊN VĂN nội dung hai file cũ; mỗi khối có `beforeAll` riêng vì
 * tiền đề hai bên khác nhau — đó là chủ ý.
 */

import { type Locator, type Page } from '@playwright/test'
import { dbEnabled, deleteWaitRows, ensureWaitRow, findPatientWithTrnThisMonth, findPatientWithoutAttSt, findPatientsByAttDr, listDoctors, personAttending, findPatientForZeroWaitRow } from '../_shared/db'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'
import { rows, cells } from '../_shared/virtual-grid'

// ═══ nguyên văn từ patient-select-dr-staff-required.spec.ts (đã gộp vào file này) ══════════════════════════
test.describe('đo theo URL (chuỗi fallback FE)', () => {

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
 *  - locales/ja.ts: E00027「{field}を特定出来ません。{field}を選択して下さい。」 (một
 *    tham số, xuất hiện HAI lần trong câu — văn bản lấy từ MSGTBL thật, không phải
 *    bản phục dựng cũ 「が選択されていません。」), E00005「{field}が登録されていません。」.
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
 * `--repeat-each` PHẢI kèm `--workers=1`. Mặc định Playwright chạy 3 worker song
 * song, mà cả ba cùng thao tác trên đúng một dòng 受付 của cùng một bệnh nhân:
 * worker chạy xong trước sẽ XOÁ dòng đó trong afterAll trong khi worker khác vẫn
 * đang dùng, thành ra đỏ giả. `ensureWaitRow` chỉ chống được va chạm lúc TẠO,
 * không chống được teardown của worker khác.
 *
 * CHẠY TUẦN TỰ và dùng CHUNG một page (Rule 10.1 / Rule 19). Testcase nối tiếp
 * trạng thái (ô 患者番号, combo Dr., view đang đứng) nên chạy lẻ bằng `-g` sẽ
 * hỏng. Luôn chạy cả file:
 *   npx playwright test tests/patient-select/patient-select-dr-staff.spec.ts
 */

/** `inp_config.eiseiji_flg` — 0 = ẩn hàng 衛生士 (EiseijiFlg.Hidden). */
/**
 * `inp.dispEiseisi` — 「衛生士を入力する」, giá trị theo quy ước WinForm.
 *
 * KHÔNG phải `inp_config.eiseiji_flg` (cái đó là 「衛生実地指導を算定しない」, chỉ
 * dùng ở Check.cs:903). Một giá trị, HAI ngưỡng: `== 0` mới ẩn hàng
 * (frm203001.cs:542), `== 1` mới bắt buộc (frm203001.cs:721). Bỏ tick ⇒ 9 ⇒ hàng
 * vẫn hiện nhưng 患者確定 KHÔNG đòi 衛生士.
 */
const DISP_EISEISI_ON = 1
const DISP_EISEISI_KEY = 'inp.dispEiseisi'

const INP_CONFIG_URL = /\/tenant\/inp-config(\?|$)/
const TENANT_SETTINGS_URL = /\/tenant\/settings\?keys=/
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
    /** `inp.dispEiseisi` bắt được từ GET /tenant/settings?keys=… */
    let dispEiseisi: number | null = null
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
     * Combo Ｄｒ．trên HEADER màn 処置入力 — SAU khi click ô giá trị để nó hiện ra.
     *
     * Từ bản port Chg_DrName, header có hai control chồng chỗ như WinForm: ô giá
     * trị (lbDr) hiện 担当医 CỦA DÒNG con trỏ đang đứng, còn combo (cboDr) giữ
     * 担当医 cho dòng thêm mới và `Visible = false` cho tới khi ô giá trị được
     * click (frm203002.cs:8082). Testcase này hỏi về cái thứ hai, nên phải mở nó
     * ra trước — đọc nhãn sẽ ra người khác, và đó là ĐÚNG.
     *
     * Nhãn ở màn chi tiết là `Dr:`; màn 患者選択 là `Dr.:` — khác đúng một dấu
     * chấm nên `exact` là bắt buộc.
     */
    async function openDetailDrCombo(): Promise<Locator> {
        const caption = page.getByRole('button', { name: 'Dr:', exact: true })
        await expect(caption, 'không thấy hàng Ｄｒ．trên header màn chi tiết').toBeVisible({
            timeout: 30000,
        })
        await caption.locator('..').getByRole('button').nth(1).click()
        const combo = page.getByRole('combobox').first()
        await expect(combo, 'click ô giá trị mà combo Ｄｒ．không hiện ra').toBeVisible({
            timeout: 15000,
        })
        return combo
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

    test.beforeAll(async ({ authedPage }) => {
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

        page = authedPage
        step = makeStep(page)

        // Cắm listener TRƯỚC khi vào màn: react-query cache inp-config lâu nên
        // chỉ có đúng một request trong cả phiên.
        page.on('response', (res) => {
            if (res.request().method() !== 'GET') return
            if (TENANT_SETTINGS_URL.test(res.url())) {
                void res
                    .json()
                    .then((body) => {
                        const values = (body as { data?: { values?: Record<string, unknown> } }).data
                            ?.values
                        const raw = values?.[DISP_EISEISI_KEY]
                        if (raw !== undefined && raw !== null) dispEiseisi = Number(raw)
                    })
                    .catch(() => undefined)
            }
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

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F7"]')).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
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
            'nội dung khác locales/ja.ts E00027「{field}を特定出来ません。{field}を選択して下さい。」',
        ).toContainText('を特定出来ません。')
        await expect(appDialog()).toContainText('を選択して下さい。')
        await dismissDialog()

        await expect(page, 'đã sang màn chi tiết dù chưa chốt được 担当医').toHaveURL(
            /\/treatments\/?(\?|$)/,
        )
        await step()
    })

    // ── 衛生士 ───────────────────────────────────────────────────────────────

    test('TC-ST-1 — không có nguồn nào cho 衛生士: E00027「衛生士」 khi hàng 衛生士 đang hiện', async () => {
        await expect
            .poll(() => dispEiseisi, {
                message: 'không bắt được GET /tenant/settings?keys=inp.dispEiseisi',
                timeout: 30000,
            })
            .not.toBeNull()

        skipWithReason(
            dispEiseisi !== DISP_EISEISI_ON,
            `inp.dispEiseisi=${dispEiseisi} → 「衛生士を入力する」 đang tắt nên WinForm KHÔNG ` +
                'chặn ở 衛生士 (chỉ chặn khi == 1). Đặt nó = 1 rồi chạy lại mới kiểm được nhánh này',
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
        await expect(appDialog()).toContainText('を特定出来ません。')
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
        // cái sai nằm ở COMBO trên header màn chi tiết — nó từng được seed từ
        // dòng TRN đầu tiên của tháng thay vì từ giá trị màn 患者選択.
        const combo = await openDetailDrCombo()
        await expect(
            combo,
            `combo header lấy Ｄｒ．từ dòng TRN cũ (dr_no=[${trnPatient!.trnDrNos.join(',')}]) ` +
                `thay vì Ｄｒ．${seedProbeDoctor!.userNo} vừa chọn ở màn 患者選択`,
        ).toContainText(seedProbeDoctor!.userNm, { timeout: 30000 })

        // Nói thẳng ra tên của các Ｄｒ．trong TRN để log đọc được khi hỏng.
        for (const drNo of trnPatient!.trnDrNos) {
            const nm = doctorNameOf.get(drNo)
            if (!nm || nm === seedProbeDoctor!.userNm) continue
            await expect(combo, `combo đang hiện Ｄｒ．của TRN 「${nm}」`).not.toContainText(nm)
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

})

// ═══ nguyên văn từ patient-select-assign-parity.spec.ts (đã gộp vào file này) ══════════════════════════════
test.describe('đối chiếu parity WinForm ↔ web', () => {

/**
 * 診療入力（患者選択）— ĐỐI CHIẾU PARITY với WinForm, cùng số hiệu TC.
 *
 * ─── Quan hệ với hai file kia ────────────────────────────────────────────────
 * `patient-select/patient-select-dr-staff.spec.ts` đo bản web theo **URL** (`drNo=` trên
 * query string). Đó là mốc đúng cho việc kiểm chuỗi fallback của FE, nhưng WinForm
 * KHÔNG có URL — nên nó không so được với WinForm.
 *
 * File này đo **đúng những mốc mà WinForm cũng đo được**:
 *   · nhãn Ｄｒ．/ 衛生士 trên HEADER màn 処置入力  (WinForm: `lbDr` / `lbEiseisi`)
 *   · nguyên văn hộp thoại cảnh báo               (WinForm: bảng `MSGTBL`)
 *   · ô nào NHẬN LẠI FOCUS sau khi bị chặn        (WinForm: `cboUserNm.Focus()` …)
 *   · cử chỉ nào mở được màn chi tiết             (WinForm: Enter, KHÔNG phải dbl-click)
 *
 * Nửa WinForm: `../../fla-ui-tests/src/OchaCom.FlaUiTests/Tests/PatientSelectAssign/`
 * (chạy bằng `.\run-confirm-patient.ps1`). Bảng tương ứng TC ở README mục 3 của
 * thư mục đó.
 *
 * ─── TÌNH TRẠNG PARITY (cập nhật 2026-08-27) ────────────────────────────────
 *
 * ĐÃ SỬA ở `aff63dd9e` (fix(web-tenant): E00027 を実文言に直し…), TC ở đây nay
 * khoá lại để không tái phát:
 *
 * 1. **`E00027` sai văn bản.** Thật (đọc `MSGTBL` trên SQL Server của máy WinForm,
 *    probe `run-confirm-patient.ps1 -Diagnostics` dòng `KQ-2`, 2026-08-26):
 *    「{0}を特定出来ません。{0}を選択して下さい。」. Bản cũ dùng câu ĐOÁN
 *    「{field}が選択されていません。」 và `ja.ts:63` tự khai là 未確認. → TC-MSG-1.
 *
 * 2. **`DispEiseisi` bind nhầm trường.** WinForm đọc
 *    `XmlControl.OchaXml.InpInfo.DispEiseisi`; bản cũ đọc `inp_config.eiseiji_flg`
 *    — mà cột đó bên WinForm là 「衛生実地指導を算定しない」 (`InpConfig.cs:28`, chỉ
 *    dùng ở `Check.cs:901` / `frm506008`), `frm203001` KHÔNG đọc lần nào. Nay đọc
 *    `inp.dispEiseisi`. → TC-ST-1.
 *
 * 3. **`DispEiseisi` có BA trạng thái, bản cũ chỉ biết hai.** 処置入力設定 ghi `1 : 9`
 *    (frm203003.cs:264); `:542` chỉ ẩn hàng khi `== 0`, `:721` chỉ bắt buộc khi
 *    `== 1` ⇒ `9` = hiện mà KHÔNG bắt buộc. Bản cũ suy 「hiện ⇒ bắt buộc」 nên CHẶN
 *    ở đúng cấu hình phổ biến nhất (đã bỏ tick). → TC-ST-1.
 *
 * CÒN LỆCH — mới đọc source, CHƯA đo được (máy WinForm có bảng `wait` rỗng):
 *
 * 4. **Nhánh 受付 đọc SỰ TỒN TẠI CỦA CỘT, không phải giá trị.**
 *
 *    ⚠️ ĐỌC KỸ TRƯỚC KHI SO: `user_no = 0` mang HAI NGHĨA khác nhau.
 *      · WinForm — sentinel 未選択. `IINMST2` không có dòng `USER_NO = 0`, và
 *        `defData` kiểm `UserNo > 0` (frm203001.cs:705).
 *      · web sau khi gộp `app_user` — user THẬT, là **owner của tenant**:
 *        `t_tenant1.app_user` có `user_no=0, user_kbn=2, 「Son Tran」`.
 *    Nên 「dòng 受付 mang user_no = 0」 KHÔNG phải cùng một tình huống ở hai bên.
 *    Tình huống so được là 「受付 chưa gán Ｄｒ．」, bên WinForm là `NULL`.
 *    TC-DR-4B dưới đây vì thế chỉ đóng đinh HÀNH VI CỦA WEB, không kết luận parity.

 *      `if (dt.Columns.Contains("user_no")) UserNo = dt.Rows[i]["user_no"] else person.dr`
 *    (frm203001.cs:696-701). Lưới 受付患者一覧 LUÔN có cột đó (PatInfoList.cs:177),
 *    nên dòng mang `user_no = 0` ⇒ WinForm lấy `0` rồi **chặn E00027**, KHÔNG rơi về
 *    `att_dr`. Bản web viết `toUserNo(waitRowUserNo) || toUserNo(patientAttDr)` ⇒ rơi
 *    về `att_dr` và MỞ ĐƯỢC màn. → TC-DR-4B.
 *
 * 5. **Double-click trên lưới là no-op bên WinForm.** `dgvView_CellDoubleClick` có câu
 *    `defData` BỊ COMMENT (frm203001.cs:303-309). Cửa vào thật của nhánh `selRow` là
 *    **Enter** trên lưới (`:287-296`). Bản web mở màn bằng `dblclick()`. → TC-ROW-1.
 *
 * ─── DỮ LIỆU ────────────────────────────────────────────────────────────────
 * Mọi 患者番号 / user_no đều DÒ TỪ DB lúc chạy (Rule 18). Spec KHÔNG bấm 登録.
 * Nó chỉ INSERT dòng `wait` khi bệnh nhân chưa được tiếp nhận, rồi DELETE đúng dòng
 * đó ở `afterAll`; dòng có sẵn thì DÙNG LẠI và KHÔNG xoá. Không có TEST_DB thì cả
 * file tự skip.
 *
 * CHẠY TUẦN TỰ, dùng CHUNG một page (Rule 10.1 / Rule 19) — chạy lẻ bằng `-g` sẽ hỏng:
 *   npx playwright test tests/patient-select/patient-select-dr-staff.spec.ts
 */

/**
 * `inp.dispEiseisi` — 「衛生士を入力する」, BA trạng thái theo quy ước WinForm.
 *
 * `処置入力設定` ghi `1 : 9` (frm203003.cs:264); `frm203001` ẩn hàng 衛生士 khi
 * `== 0` (:542) và BẮT BUỘC 衛生士 khi `== 1` (:721) — hai ngưỡng khác nhau, nên
 * `9` = hàng vẫn HIỆN mà KHÔNG bắt buộc.
 */
const DISP_EISEISI = { Unset: 0, On: 1, Off: 9 } as const

/**
 * Setting mà 患者選択 thật sự đọc.
 *
 * KHÔNG phải `inp_config.eiseiji_flg` — cột đó bên WinForm là 「衛生実地指導を算定
 * しない」 (`InpConfig.cs:28`, dùng ở `Check.cs:901` / `frm506008`), và `frm203001`
 * không đọc nó lần nào. Bản web đã sửa đúng chỗ này ở `aff63dd9e`.
 */
const TENANT_SETTINGS_URL = /\/tenant\/settings(\?|$)/
const DISP_EISEISI_KEY = 'inp.dispEiseisi'

/**
 * Nguyên văn E00027 của WinForm — ĐỌC TỪ `MSGTBL` trên máy Windows thật
 * (probe `run-confirm-patient.ps1 -Diagnostics`, dòng `KQ-2`, 2026-08-26):
 *
 *     E00027 = 「{0}を特定出来ません。{0}を選択して下さい。」
 *
 * Khác hẳn câu bản web đang dùng (`locales/ja.ts:69` → 「{field}が選択されていません。」),
 * vốn là câu ĐOÁN và `ja.ts:63` đã tự khai là 未確認. Đây là điểm lệch #6.
 */
const WINFORM_E00027 = (field: string) => `${field}を特定出来ません。${field}を選択して下さい。`

test.describe.configure({ mode: 'serial' })

test.describe('患者確定 — đối chiếu parity WinForm ↔ web', () => {
    let page: Page
    let step: () => Promise<void>

    let dispEiseisi: number | null = null

    /**
     * Focus quan sát được sau mỗi hộp thoại chặn — TC-FOCUS-1 ở CUỐI file phán xử.
     *
     * Vì sao không assert ngay tại chỗ: file này `mode: 'serial'`, một fail (kể cả
     * `expect.soft`) là 8 testcase sau KHÔNG CHẠY. Đã vấp thật 2026-08-27. Ghi lại rồi
     * phán xử ở cuối thì vẫn đỏ đúng chỗ mà không mất phần đo còn lại.
     */
    const focusAfter: Record<string, string> = {}

    let patWithDr = 0
    let attDrOfPatWithDr = 0
    let attStOfPatWithDr: number | null = null
    let patWithoutDr: number | null = null
    let patWithoutSt: number | null = null
    let pickedDoctor: { userNo: number; userNm: string } | null = null
    let doctorNameOf = new Map<number, string>()

    /** Dòng 受付 mang `user_no` HỢP LỆ (khác att_dr) — TC-DR-4. */
    let waitUserNo: number | null = null
    /** Bệnh nhân có dòng 受付 mang `user_no = 0` — TC-DR-4B, điểm lệch #3. */
    let patWithZeroWaitRow: number | null = null
    let attDrOfZeroWaitPat = 0

    const seededWaitIds: string[] = []

    let trnPatient: { patNo: number; trnDrNos: number[]; attDr: number | null } | null = null
    let seedProbeDoctor: { userNo: number; userNm: string } | null = null

    // ── Locator ──────────────────────────────────────────────────────────────

    /** Ô 患者番号 của panel 患者選択 — role **combobox** (Popover lịch sử), Rule 12.5. */
    function patNoInput(): Locator {
        return page
            .getByText('患者番号', { exact: true })
            .first()
            .locator('..')
            .getByRole('combobox')
    }

    /** Combo trên màn 患者選択 — nhãn render là `{label}:` (staff-select.tsx). */
    function staffSelect(label: 'Dr.' | '衛生士'): Locator {
        return page.getByText(`${label}:`, { exact: true }).locator('..').getByRole('combobox')
    }

    /**
     * HEADER màn 処置入力 có HAI control chồng chỗ, đúng như WinForm — và chúng có
     * thể ra HAI NGƯỜI KHÁC NHAU, nên phải phân biệt rõ đang hỏi cái nào.
     *
     * | | WinForm | Web |
     * |---|---|---|
     * | 担当医 của DÒNG con trỏ đang đứng | nhãn `lbDr` | ô giá trị (button) |
     * | 担当医 cho DÒNG THÊM MỚI | combo `cboDr`, `Visible=false` tới khi click nhãn | combo, hiện sau khi click ô giá trị |
     *
     * `lbDr` do `Chg_DrName` ghi, lấy cột 69 CỦA DÒNG (modMain.cs:2125-2138).
     * `cboDr` mới là số đóng dấu xuống `TRNTRN.dr_no` khi 登録
     * (`cboDr_SelectedValueChanged` → `ModCommon.pintDrNo`, frm203002.cs:8095).
     *
     * Nhãn ở màn chi tiết là `Dr:`; màn 患者選択 là `Dr.:` — khác đúng một dấu chấm
     * nên `exact` là bắt buộc.
     */
    function detailDrValueCell(): Locator {
        return page
            .getByRole('button', { name: 'Dr:', exact: true })
            .locator('..')
            .getByRole('button')
            .nth(1)
    }

    /** Mở combo `cboDr` bằng cách click ô giá trị, rồi trả về chính combo đó. */
    async function openDetailDrCombo(): Promise<Locator> {
        const caption = page.getByRole('button', { name: 'Dr:', exact: true })
        await expect(caption, 'không thấy hàng Ｄｒ．trên header màn chi tiết').toBeVisible({
            timeout: 30000,
        })
        // In cấu trúc hàng Ｄｒ．TRƯỚC khi click — nếu click trượt thì log nói được
        // hàng đó thật ra có mấy nút và tên chúng là gì, thay vì chỉ 「không thấy combo」.
        const row = caption.locator('..')
        const buttons = await row.getByRole('button').all()
        const shape = await Promise.all(
            buttons.map(async (b, i) => `#${i}「${(await b.innerText()).trim()}」`),
        )
        console.log(`=== header hàng Ｄｒ．có ${buttons.length} nút: ${shape.join(' · ')}`)

        // THỬ LẠI có giới hạn: combo chỉ mount khi `picking` bật (StaffField), và nó tự
        // đóng lại ở `onBlur`. Một cú click rơi đúng lúc màn chi tiết còn đang render
        // thì không bật được gì — đo 2026-08-27: cùng một hàng 2 nút 「Dr:」/「院」 mà
        // lượt thì hiện combo, lượt thì không. Click một lần rồi assert là test chớp tắt.
        const combo = page.getByRole('combobox').first()
        for (let attempt = 1; attempt <= 3; attempt++) {
            await row.getByRole('button').nth(1).click()
            try {
                await expect(combo).toBeVisible({ timeout: 5000 })
                return combo
            } catch {
                if (attempt === 3) break
                console.log(`    combo Ｄｒ．chưa hiện sau lần click #${attempt}, thử lại`)
            }
        }

        await expect(
            combo,
            `click ô giá trị 3 lần mà combo Ｄｒ．không hiện ra. Hàng Ｄｒ．đang có ` +
                `${buttons.length} nút: ${shape.join(' · ')}`,
        ).toBeVisible({ timeout: 5000 })
        return combo
    }

    /** appDialog — PHẢI loại `aria-busy="true"` (busyOverlay cũng mang role này), Rule 13. */
    /**
     * Mô tả phần tử ĐANG giữ focus — để khi assert focus đỏ thì log nói được focus
     * đang ở đâu, thay vì chỉ 「không phải chỗ này」.
     */
    async function focusedDescription(): Promise<string> {
        return page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null
            if (!el) return '(null)'
            const label = el.getAttribute('aria-label') ?? ''
            const role = el.getAttribute('role') ?? ''
            const text = (el.textContent ?? '').trim().slice(0, 40)
            const value = (el as HTMLInputElement).value ?? ''
            // Nhãn của HÀNG chứa control — thứ duy nhất phân biệt được combo Dr. với
            // combo 衛生士, vì cả hai đều render ra <button role="combobox"> trống.
            const near = (el.closest('div')?.parentElement?.textContent ?? '').trim().slice(0, 30)
            return `<${el.tagName.toLowerCase()}${role ? ` role=${role}` : ''}` +
                `${label ? ` aria-label=${label}` : ''}${value ? ` value=${value}` : ''}>` +
                `${text ? ` 「${text}」` : ''}${near ? ` (trong: 「${near}」)` : ''}`
        })
    }

    /**
     * Hàng 診療日 — nhãn + `EraDateField` (元号 combobox, rồi 3 ô 年/月/日).
     *
     * Ô đầu của control là trigger 元号; đó cũng là chỗ `EraDateFieldHandle.focus()`
     * đặt con trỏ, tương ứng `_dtTrtDt.Focus()` bên WinForm (frm203001.cs:639).
     */
    function trtDtRow(): Locator {
        return page.getByText('診療日', { exact: true }).locator('..')
    }

    function appDialog(): Locator {
        return page.locator('[role="alertdialog"]:not([aria-busy="true"])')
    }

    // ── Thao tác ─────────────────────────────────────────────────────────────

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

    async function pickDoctor(userNm: string) {
        await staffSelect('Dr.').click()
        await page.getByRole('option', { name: userNm, exact: true }).click()
        await expect(staffSelect('Dr.')).toContainText(userNm)
        await step()
    }

    /** Dòng trống là `<SelectItem>` một dấu cách, đứng ĐẦU — chỉ trỏ được bằng `.first()`. */
    async function clearDoctor() {
        await staffSelect('Dr.').click()
        await page.getByRole('option').first().click()
        await step()
    }

    async function dismissDialog() {
        await appDialog().getByRole('button', { name: 'OK' }).click()
        await expect(appDialog()).toHaveCount(0)
    }

    /**
     * Về lại màn danh sách. Đi bằng LINK SIDEBAR, KHÔNG `page.goto`: accessToken chỉ
     * nằm trong RAM (Rule 10.2) nên mỗi lần tải lại trang là một vòng refresh.
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

    test.beforeAll(async ({ authedPage }) => {
        test.skip(!dbEnabled, 'cần TEST_DB=1 để dò 担当医/衛生士 và seed dòng 受付')

        const found = await findPatientsByAttDr()
        patWithoutDr = found.withoutDr
        patWithoutSt = await findPatientWithoutAttSt()
        expect(found.withDr, 'dataset không có bệnh nhân nào có 担当医').not.toBeNull()
        patWithDr = found.withDr!

        const att = await personAttending(patWithDr)
        expect(att?.attDr, `bệnh nhân ${patWithDr} không đọc được att_dr`).toBeTruthy()
        attDrOfPatWithDr = att!.attDr!
        attStOfPatWithDr = att!.attSt ?? null

        const allDoctors = await listDoctors()
        doctorNameOf = new Map(allDoctors.map((d) => [d.userNo, d.userNm]))

        trnPatient = await findPatientWithTrnThisMonth()
        if (trnPatient) {
            const taken = new Set<number>([...trnPatient.trnDrNos, trnPatient.attDr ?? -1])
            seedProbeDoctor = allDoctors.find((d) => d.userNo > 0 && !taken.has(d.userNo)) ?? null
        }

        const doctors = allDoctors.filter((d) => d.userNo !== attDrOfPatWithDr)
        expect(
            doctors.length,
            'cần ít nhất 2 Ｄｒ．khác nhau để phân biệt nguồn của 担当医',
        ).toBeGreaterThan(1)
        pickedDoctor = doctors[0]!

        const wait = await ensureWaitRow(patWithDr, doctors[1]!.userNo)
        waitUserNo = wait.userNo
        if (wait.created) seededWaitIds.push(wait.id)

        // Điểm lệch #3: dòng 受付 mang `user_no = 0`. Phải là bệnh nhân KHÁC (một
        // bệnh nhân chỉ có một dòng 受付 sống nhờ `ux_wait_active`) và phải CÓ att_dr
        // thì mới thấy được khác biệt — WinForm chặn, web rơi về att_dr rồi mở.
        const zeroCandidate = await findPatientForZeroWaitRow(patWithDr)
        if (zeroCandidate) {
            const zero = await ensureWaitRow(zeroCandidate.patNo, 0)
            if (zero.created) seededWaitIds.push(zero.id)
            // `findPatientForZeroWaitRow` đã loại bệnh nhân có dòng 受付 sẵn, nhưng một
            // worker song song vẫn có thể chen vào giữa — lúc đó `user_no` không còn là
            // 0 và nhánh này phải bỏ, chứ không được đo trên dữ liệu sai.
            if (Number(zero.userNo ?? -1) === 0) {
                patWithZeroWaitRow = zeroCandidate.patNo
                attDrOfZeroWaitPat = zeroCandidate.attDr
            }
        }

        console.log(
            `dữ liệu: patWithDr=${patWithDr} (att_dr=${attDrOfPatWithDr}, att_st=${attStOfPatWithDr}), ` +
                `patWithoutDr=${patWithoutDr ?? 'KHÔNG CÓ'}, patWithoutSt=${patWithoutSt ?? 'KHÔNG CÓ'}, ` +
                `combo Dr.=${pickedDoctor.userNo}「${pickedDoctor.userNm}」, wait.user_no=${waitUserNo ?? 'NULL'}, ` +
                `patWithZeroWaitRow=${patWithZeroWaitRow ?? 'KHÔNG DỰNG ĐƯỢC'}`,
        )

        page = authedPage
        step = makeStep(page)

        page.on('response', (res) => {
            if (res.request().method() !== 'GET') return
            if (!TENANT_SETTINGS_URL.test(res.url())) return
            void res
                .json()
                .then((body) => {
                    const values = (body as { data?: { values?: Record<string, unknown> } }).data?.values
                    const raw = values?.[DISP_EISEISI_KEY]
                    if (raw !== undefined && raw !== null) dispEiseisi = Number(raw)
                })
                .catch(() => undefined)
        })

        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-fkey="F7"]')).toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
        if (seededWaitIds.length > 0) {
            const n = await deleteWaitRows(seededWaitIds)
            console.log(`dọn ${n} dòng 受付 do test tạo`)
        }
    })

    // ── TC-MSG-1 ────────────────────────────────────────────────────────────

    test('TC-MSG-1 — E00027 phải KHỚP nguyên văn MSGTBL của WinForm', async () => {
        skipWithReason(
            patWithoutDr === null,
            'dataset không có bệnh nhân nào thiếu 担当医 — không bung được E00027',
        )

        // KHÔNG gọi clearDoctor() ở đây: đây là thao tác UI ĐẦU TIÊN của cả file, mà
        // StaffSelect còn `disabled` cho tới khi mst_iin về (`ready={doctors.length > 0}`)
        // — click vào trigger đang disabled thì treo. Combo lúc mới vào vốn đã trống.
        await expect(staffSelect('Dr.'), 'combo Dr. lúc mới vào phải đang trống').toHaveText(/^\s*$/)
        await typePatNo(String(patWithoutDr))
        await page.keyboard.press('End')

        await expect(appDialog()).toBeVisible({ timeout: 15000 })
        const wording = (await appDialog().innerText()).trim()
        console.log(`=== PARITY E00027 (web) === 「${wording.replace(/\s+/g, ' ')}」`)
        console.log(`=== PARITY E00027 (WinForm MSGTBL) === 「${WINFORM_E00027('ドクター')}」`)

        // Chuỗi thật đọc từ MSGTBL trên SQL Server của máy WinForm (probe
        // `run-confirm-patient.ps1 -Diagnostics`, dòng KQ-2, 2026-08-26).
        //
        // Trước `aff63dd9e` bản web dùng câu ĐOÁN 「{field}が選択されていません。」 —
        // `locales/ja.ts:63` đã tự khai là 未確認. Nay đã lấy đúng chuỗi thật, nên
        // testcase này khoá lại để không ai quay về câu đoán.
        expect(
            wording.replace(/\s+/g, ''),
            'E00027 của web KHÔNG khớp MSGTBL của WinForm nữa — xem locales/ja.ts:69',
        ).toContain(WINFORM_E00027('ドクター').replace(/\s+/g, ''))

        await expect(
            appDialog(),
            'web quay lại khuôn ĐOÁN 「…が選択されていません。」 — đó là chuỗi sai, ' +
                'chuỗi thật là 「…を特定出来ません。…を選択して下さい。」',
        ).not.toContainText('選択されていません')

        await dismissDialog()
        await step()
    })

    // ── TC-PAT-1 ────────────────────────────────────────────────────────────

    test('TC-PAT-1 — 患者番号 không tồn tại: E00005 + focus TRẢ VỀ ô 患者番号', async () => {
        await clearPatNo()
        await typePatNo('99999999')
        await page.keyboard.press('End')

        await expect(appDialog(), '患者番号 không có thật mà vẫn mở màn chi tiết').toBeVisible({
            timeout: 15000,
        })
        await expect(appDialog()).toContainText('患者情報')
        await expect(appDialog()).toContainText('登録されていません')
        await dismissDialog()

        await expect(page).toHaveURL(/\/treatments\/?(\?|$)/)

        // WinForm: `cboPatNo.Focus()` (frm203001.cs:673). Web: `patientNoInputRef.focus()`
        // ngay sau khi `await alertDialog(...)` resolve.
        //
        // SOFT: đây là điểm parity đang NGỜ, và nó không được phép cắt ngang lượt chạy
        // (file này `mode: 'serial'` nên một fail cứng là mất nốt 8 TC sau). Ghi lại
        // focus thật để đối chiếu với phía WinForm.
        focusAfter['E00005'] = await focusedDescription()
        focusAfter['E00005.onTarget'] = String(await patNoInput().evaluate((el) => el === document.activeElement))
        console.log(`=== PARITY focus sau E00005 (web) === ${focusAfter['E00005']}`)
        await step()
    })

    // ── TC-DR-1 ─────────────────────────────────────────────────────────────

    test('TC-DR-1 — combo trống: HEADER 処置入力 mang 担当医 của 患者マスタ', async () => {
        await clearPatNo()
        await clearDoctor()
        await typePatNo(String(patWithDr))
        await page.keyboard.press('End')

        await expect(page).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })

        const expectedNm = doctorNameOf.get(attDrOfPatWithDr)
        expect(expectedNm, `att_dr=${attDrOfPatWithDr} không có tên trong mst_iin`).toBeTruthy()

        // Đọc Ô GIÁ TRỊ TRƯỚC khi mở combo: `StaffField` THAY THẾ ô giá trị bằng combo
        // khi `picking` bật, nên đọc sau là locator không còn tồn tại — đo 2026-08-27,
        // `innerText` timeout 15s.
        //
        // Ô giá trị chỉ GHI LẠI, không assert: nó hiện 担当医 của DÒNG con trỏ đang đứng
        // (port của Chg_DrName) nên phụ thuộc dữ liệu 処置 sẵn có của ngày đó, còn combo
        // mới là thứ quyết định dr_no khi lưu.
        const drValueCell = (await detailDrValueCell().innerText()).trim()

        // Mốc parity: WinForm đọc cùng giá trị này ở combo cboDr (frm203002.cs:425).
        await expect(
            await openDetailDrCombo(),
            `combo trống ⇒ header phải mang att_dr=${attDrOfPatWithDr}「${expectedNm}」`,
        ).toHaveText(expectedNm!, { timeout: 30000 })
        console.log(
            `TC-DR-1: combo Dr = 「${expectedNm}」 (att_dr=${attDrOfPatWithDr}) · ` +
                `ô giá trị Dr = 「${drValueCell}」 (att_st=${attStOfPatWithDr ?? 'NULL'})` +
                '\n    → so với `KQ-5b` (nhãn lbDr) và `KQ-5d` (combo cboDr) của confirm-patient-KQ.txt',
        )
        await step()

        await backToList()
    })

    // ── TC-DR-2 ─────────────────────────────────────────────────────────────

    test('TC-DR-2 — combo CÓ CHỌN: HEADER mang Ｄｒ．vừa chọn, không phải 患者マスタ', async () => {
        await pickDoctor(pickedDoctor!.userNm)
        await typePatNo(String(patWithDr))
        await page.keyboard.press('End')

        await expect(page).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })

        const attNm = doctorNameOf.get(attDrOfPatWithDr)
        await expect(
            await openDetailDrCombo(),
            `chọn Ｄｒ．${pickedDoctor!.userNo} mà combo header vẫn hiện att_dr「${attNm}」 — ` +
                'combo 患者選択 phải thắng 患者マスタ (frm203001.cs:678)',
        ).toHaveText(pickedDoctor!.userNm, { timeout: 30000 })
        console.log(`TC-DR-2: header Dr = 「${pickedDoctor!.userNm}」 (att_dr là 「${attNm}」)`)
        await step()

        await backToList()
        await clearDoctor()
    })

    // ── TC-DR-3 ─────────────────────────────────────────────────────────────

    test('TC-DR-3 — thiếu 担当医: E00027「ドクター」 + focus TRẢ VỀ combo Dr.', async () => {
        skipWithReason(patWithoutDr === null, 'dataset không có bệnh nhân nào thiếu 担当医')

        await clearPatNo()
        await typePatNo(String(patWithoutDr))
        await page.keyboard.press('End')

        await expect(appDialog(), 'thiếu 担当医 mà vẫn mở được màn chi tiết').toBeVisible({
            timeout: 15000,
        })
        // LƯU Ý là 「ドクター」 chứ không phải 「Ｄｒ．」 — frm203001.cs:707.
        await expect(appDialog()).toContainText('ドクター')
        await dismissDialog()

        await expect(page).toHaveURL(/\/treatments\/?(\?|$)/)

        // WinForm: `cboUserNm.Focus()` (frm203001.cs:708). SOFT — xem ghi chú ở TC-PAT-1.
        focusAfter['E00027.dr'] = await focusedDescription()
        focusAfter['E00027.dr.onTarget'] = String(
            await staffSelect('Dr.').evaluate((el) => el === document.activeElement),
        )
        console.log(`=== PARITY focus sau E00027「ドクター」 (web) === ${focusAfter['E00027.dr']}`)
        await step()
    })

    // ── TC-ST-1 ─────────────────────────────────────────────────────────────

    test('TC-ST-1 — 衛生士: bắt buộc CHỈ KHI dispEiseisi === 1 (ba trạng thái, giống WinForm)', async () => {
        await expect
            .poll(() => dispEiseisi, {
                message: 'không bắt được GET /tenant/settings?keys=inp.dispEiseisi',
                timeout: 30000,
            })
            .not.toBeNull()

        console.log(
            `=== PARITY 衛生士 === web đọc inp.dispEiseisi = ${dispEiseisi} ` +
                `(${dispEiseisi === DISP_EISEISI.On ? 'On — hiện + BẮT BUỘC' : dispEiseisi === DISP_EISEISI.Off ? 'Off — hiện mà KHÔNG bắt buộc' : 'Unset — ẩn hàng'}). ` +
                'Đây đúng là setting WinForm đọc (XmlControl.OchaXml.InpInfo.DispEiseisi), ' +
                'KHÔNG phải inp_config.eiseiji_flg như bản trước aff63dd9e. ' +
                'Đối chiếu dòng `KQ-1b` của confirm-patient-KQ.txt.',
        )

        skipWithReason(
            patWithoutSt === null,
            'dataset không có bệnh nhân nào CÓ 担当医 mà THIẾU 衛生士 (att_st=100 là 無所属, vẫn tính là có)',
        )

        const rowShown = dispEiseisi !== DISP_EISEISI.Unset
        const mustBlock = dispEiseisi === DISP_EISEISI.On

        // Hàng 衛生士 hiện hay ẩn: `showHygienist = dispEiseisi !== 0`.
        await expect(
            staffSelect('衛生士'),
            `dispEiseisi=${dispEiseisi} ⇒ hàng 衛生士 phải ${rowShown ? 'HIỆN' : 'ẨN'}`,
        ).toHaveCount(rowShown ? 1 : 0)

        await clearPatNo()
        await clearDoctor()
        await typePatNo(String(patWithoutSt))
        await page.keyboard.press('End')

        if (mustBlock) {
            await expect(appDialog(), 'dispEiseisi=1 mà thiếu 衛生士 lại không chặn').toBeVisible({
                timeout: 15000,
            })
            await expect(
                appDialog(),
                'chặn nhầm ở 担当医 — bệnh nhân này CÓ att_dr nên lẽ ra qua được bước Dr.',
            ).toContainText('衛生士')
            await expect(appDialog()).toContainText(WINFORM_E00027('衛生士'))
            await dismissDialog()

            await expect(page).toHaveURL(/\/treatments\/?(\?|$)/)
            // WinForm: `cboStaffNm.Focus()` (frm203001.cs:724). SOFT — xem TC-PAT-1.
            focusAfter['E00027.staff'] = await focusedDescription()
            focusAfter['E00027.staff.onTarget'] = String(
                await staffSelect('衛生士').evaluate((el) => el === document.activeElement),
            )
            console.log(`=== PARITY focus sau E00027「衛生士」 (web) === ${focusAfter['E00027.staff']}`)
        } else {
            // ĐÂY là điểm lệch cũ, nay đã sửa: dispEiseisi = 9 nghĩa là hàng vẫn HIỆN
            // nhưng 患者確定 KHÔNG được chặn. Bản trước aff63dd9e suy 「hiện ⇒ bắt buộc」
            // nên chặn ở đúng cấu hình phổ biến nhất, còn WinForm thì cho qua (:721
            // chỉ kiểm `== 1`).
            await expect(
                page,
                `dispEiseisi=${dispEiseisi} (≠ 1) mà web VẪN chặn — WinForm chỉ chặn khi ` +
                    '== 1 (frm203001.cs:721). Đây đúng là điểm lệch mà aff63dd9e sửa.',
            ).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })
            console.log(
                `TC-ST-1: dispEiseisi=${dispEiseisi} ⇒ KHÔNG chặn dù thiếu 衛生士, hàng vẫn ` +
                    `${rowShown ? 'hiện' : 'ẩn'} — khớp WinForm.`,
            )
            await backToList()
        }
        await step()
    })

    // ── TC-ROW-1 ────────────────────────────────────────────────────────────

    test('TC-ROW-1 — double-click dòng 受付 MỞ được màn (WinForm: no-op, defData bị comment)', async () => {
        await clearPatNo()
        await clearDoctor()
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
        await expect(rows(page).first()).toBeVisible({ timeout: 30000 })

        const index = await rowIndexOfPatNo(patWithDr)
        expect(index, `không thấy dòng 受付 của bệnh nhân ${patWithDr}`).toBeGreaterThanOrEqual(0)

        await rows(page).nth(index).dblclick()

        await expect(
            page,
            'double-click không mở được màn chi tiết — hành vi web đã đổi',
        ).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })

        console.log(
            '    ★ LỆCH: bên WinForm dgvView_CellDoubleClick có câu defData BỊ COMMENT ' +
                '(frm203001.cs:303-309) ⇒ double-click KHÔNG mở màn. Cửa vào thật của nhánh selRow ' +
                'là Enter trên lưới (:287-296). Đối chiếu dòng `KQ-9b` của confirm-patient-KQ.txt.',
        )
        await step()

        await backToList()
    })

    // ── TC-DR-4 ─────────────────────────────────────────────────────────────

    test('TC-DR-4 — mở từ 受付一覧: `user_no` của DÒNG thắng 担当医 của 患者マスタ', async () => {
        skipWithReason(
            waitUserNo === null || waitUserNo === attDrOfPatWithDr,
            `dòng 受付 của bệnh nhân ${patWithDr} có user_no=${waitUserNo ?? 'NULL'} — ` +
                `trùng att_dr (${attDrOfPatWithDr}) hoặc rỗng nên không tách được hai nguồn`,
        )

        await clearPatNo()
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
        await expect(rows(page).first()).toBeVisible({ timeout: 30000 })

        const index = await rowIndexOfPatNo(patWithDr)
        expect(index, `không thấy dòng 受付 của bệnh nhân ${patWithDr}`).toBeGreaterThanOrEqual(0)
        await rows(page).nth(index).dblclick()

        const rowNm = doctorNameOf.get(waitUserNo!)
        expect(rowNm, `user_no=${waitUserNo} không có tên trong mst_iin`).toBeTruthy()

        await expect(
            await openDetailDrCombo(),
            `mở từ 受付一覧 mà combo header không mang user_no=${waitUserNo}「${rowNm}」 của dòng — ` +
                `đang lấy nhầm att_dr=${attDrOfPatWithDr}`,
        ).toHaveText(rowNm!, { timeout: 30000 })
        console.log(`TC-DR-4: header Dr = 「${rowNm}」 (wait.user_no=${waitUserNo})`)
        await step()

        await backToList()
    })

    // ── TC-DR-4B — điểm lệch #3 ─────────────────────────────────────────────

    test('TC-DR-4B — dòng 受付 có `user_no = 0`: web RƠI VỀ att_dr và MỞ màn (WinForm chặn E00027)', async () => {
        skipWithReason(
            patWithZeroWaitRow === null,
            'không dựng được dòng 受付 mang user_no = 0 (bệnh nhân đã có dòng 受付 thật, ' +
                'hoặc dataset không có bệnh nhân thứ hai có att_dr) — đây là nhánh dựng ĐIỂM LỆCH #3',
        )

        await clearPatNo()
        await clearDoctor()
        await expect(page.getByText('≪受付患者一覧≫')).toBeVisible({ timeout: 30000 })
        await expect(rows(page).first()).toBeVisible({ timeout: 30000 })

        const index = await rowIndexOfPatNo(patWithZeroWaitRow!)
        expect(
            index,
            `không thấy dòng 受付 của bệnh nhân ${patWithZeroWaitRow}`,
        ).toBeGreaterThanOrEqual(0)
        await rows(page).nth(index).dblclick()

        const attNm = doctorNameOf.get(attDrOfZeroWaitPat)
        expect(attNm, `att_dr=${attDrOfZeroWaitPat} không có tên trong mst_iin`).toBeTruthy()

        // Đóng đinh HÀNH VI HIỆN TẠI của web: `waitRowUserNo || patientAttDr` ⇒ 0 là falsy
        // ⇒ rơi về att_dr ⇒ mở được màn.
        await expect(
            page,
            'web không còn rơi về att_dr khi dòng 受付 mang user_no = 0 — hành vi đã đổi',
        ).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })
        await expect(await openDetailDrCombo()).toHaveText(attNm!, { timeout: 30000 })

        console.log(
            `    ★ LỆCH: web mở màn với att_dr=${attDrOfZeroWaitPat}「${attNm}」. WinForm ở nhánh ` +
                'selRow kiểm SỰ TỒN TẠI CỦA CỘT chứ không kiểm giá trị ' +
                '(`if (dt.Columns.Contains("user_no"))`, frm203001.cs:698) — lưới 受付患者一覧 LUÔN có ' +
                'cột đó (PatInfoList.cs:177), nên nó lấy luôn 0 rồi CHẶN E00027「ドクター」. ' +
                'Comment ở lib/staff-assignment.ts đọc nhánh else thành 「when that column is empty」, ' +
                'nhưng else chỉ chạy khi CỘT KHÔNG TỒN TẠI (các view 本日来院 / 検索一覧).',
        )
        await step()

        await backToList()
    })

    // ── TC-SEED-1 ───────────────────────────────────────────────────────────

    test('TC-SEED-1 — header giữ Ｄｒ．vừa chọn dù tháng đã có 処置 mang dr_no khác', async () => {
        skipWithReason(
            trnPatient === null,
            'không có bệnh nhân nào có 処置 mang dr_no > 0 trong tháng hiện tại',
        )
        skipWithReason(
            seedProbeDoctor === null,
            `mọi Ｄｒ．đều đã xuất hiện trong TRN/att_dr của 患者${trnPatient?.patNo}`,
        )

        await clearPatNo()
        await pickDoctor(seedProbeDoctor!.userNm)
        await typePatNo(String(trnPatient!.patNo))
        await page.keyboard.press('End')

        await expect(page).toHaveURL(/\/treatments\/\d+\?/, { timeout: 30000 })
        await expect(
            await openDetailDrCombo(),
            `combo header lấy Ｄｒ．từ dòng TRN cũ (dr_no=[${trnPatient!.trnDrNos.join(',')}]) ` +
                `thay vì Ｄｒ．${seedProbeDoctor!.userNo} vừa chọn`,
        ).toHaveText(seedProbeDoctor!.userNm, { timeout: 30000 })

        console.log(
            `TC-SEED-1: header giữ 「${seedProbeDoctor!.userNm}」 dù TRN tháng này có ` +
                `dr_no=[${trnPatient!.trnDrNos.join(',')}], att_dr=${trnPatient!.attDr ?? 'NULL'}. ` +
                '    → Bên WinForm ba đoạn cùng tranh nhau ghi lbDr (Let_Data_frmPatId frm203001.cs:1054 ' +
                'chạy VÔ ĐIỀU KIỆN vì DrId_fixed không bao giờ true; cboDr.SelectedValue frm203002.cs:425; ' +
                'Chg_DrName modMain.cs:2125 đọc dr_no CỦA DÒNG). Đáp án thật nằm ở dòng `KQ-6b` / ' +
                '`KQ-SEED-1c` của confirm-patient-KQ.txt.',
        )
        await step()

        await backToList()
        await clearDoctor()
    })

    // ── TC-DT-1 ─────────────────────────────────────────────────────────────

    test('TC-DT-1 — 診療日 sai: E00002 + focus TRẢ VỀ ô 診療日', async () => {
        await clearPatNo()
        await typePatNo(String(patWithDr))

        // Xoá ô 年 ⇒ `japaneseEraToDate` trả undefined ⇒ `trtDtIso = null`
        // ⇒ `openDetail` bung E00002 rồi return (frm203001.cs:636-639 bên WinForm).
        const yearBox = trtDtRow().getByRole('textbox').nth(0)
        const savedYear = await yearBox.inputValue()
        await yearBox.fill('')
        await page.keyboard.press('Tab')
        await step()

        await page.keyboard.press('End')

        await expect(
            appDialog(),
            'End với 診療日 rỗng mà không chặn — có phải vẫn âm thầm lấy hôm nay?',
        ).toBeVisible({ timeout: 15000 })
        await expect(appDialog()).toContainText('診療日')
        // Chuỗi thật là 「{field}が間違っています。」 (đã đo trên MSGTBL, KQ-2).
        await expect(appDialog()).toContainText('間違っています')
        await dismissDialog()

        await expect(page, 'đã điều hướng dù 診療日 không hợp lệ').toHaveURL(
            /\/treatments\/?(\?|$)/,
        )

        // WinForm: `_dtTrtDt.Focus()` (frm203001.cs:639) — CÓ, trái với ghi chú trong
        // f359a467a. Bản web đặt con trỏ lên trigger 元号, tức ô ĐẦU của control.
        focusAfter['E00002'] = await focusedDescription()
        focusAfter['E00002.onTarget'] = String(
            await trtDtRow()
                .getByRole('combobox')
                .first()
                .evaluate((el) => el === document.activeElement),
        )
        console.log(`=== PARITY focus sau E00002 (web) === ${focusAfter['E00002']}`)

        // Trả 年 về giá trị cũ cho các testcase sau.
        await yearBox.fill(savedYear)
        await page.keyboard.press('Tab')
        await expect(yearBox).toHaveValue(savedYear)
        await step()
    })

    // ── TC-FOCUS-1 — phán xử ở CUỐI ─────────────────────────────────────────

    test('TC-FOCUS-1 — sau khi bị chặn, focus phải quay về ĐÚNG ô như WinForm', async () => {
        skipWithReason(
            Object.keys(focusAfter).length === 0,
            'không testcase nào phía trên bung được hộp thoại chặn nên chưa có gì để phán xử',
        )

        for (const [key, value] of Object.entries(focusAfter)) {
            if (key.endsWith('.onTarget')) continue
            console.log(`=== PARITY focus === ${key} → ${value} (đúng ô: ${focusAfter[`${key}.onTarget`]})`)
        }

        // WinForm trả con trỏ về đúng ô vừa từ chối:
        //   E00005          → cboPatNo.Focus()    (frm203001.cs:673)
        //   E00027「ドクター」 → cboUserNm.Focus()   (:708)
        //   E00027「衛生士」  → cboStaffNm.Focus()  (:724)
        //   E00002          → _dtTrtDt.Focus()    (:639)
        //
        // ĐÃ ĐO trên WinForm thật 2026-08-27 (`run-confirm-patient.ps1 -Diagnostics`,
        // dòng KQ-7b): sau khi đóng E00005, focus nằm ở
        //     AutomationId=「1001」 · Edit
        // — `1001` là id Win32 quen thuộc của ô Edit BÊN TRONG một ComboBox, tức đúng
        // `cboPatNo`. Vậy WinForm THẬT SỰ trả con trỏ về ô 患者番号, người dùng gõ lại
        // được ngay.
        //
        // Bên web (đo cùng ngày): focus rơi vào `<button>「F1患者検索」` — nút F-key đầu
        // tiên của thanh dưới, tức thứ tự tab mặc định, KHÔNG phải ô vừa bị từ chối.
        // Nhiều khả năng do dialog của Radix restore focus SAU lệnh `.focus()` trong
        // `openDetail` (`onCloseAutoFocus`).
        const wrong = Object.entries(focusAfter)
            .filter(([k, v]) => k.endsWith('.onTarget') && v !== 'true')
            .map(([k]) => k.replace('.onTarget', ''))

        expect(
            wrong,
            'sau khi chặn, focus KHÔNG quay về ô vừa bị từ chối. Đang ở: ' +
                wrong.map((k) => `${k} → ${focusAfter[k]}`).join(' · ') +
                '. WinForm gọi Focus() ngay sau ShowWarningMsg (frm203001.cs:673/708/724) nên ' +
                'người dùng gõ lại được ngay; bên web phải click vào ô trước. Đối chiếu ' +
                'dòng KQ-7b / KQ-8c của confirm-patient-KQ.txt.',
        ).toEqual([])
    })

    // ── helper ───────────────────────────────────────────────────────────────

    async function rowIndexOfPatNo(patNo: number): Promise<number> {
        const patCells = cells(page, 'patNo')
        const total = await patCells.count()
        for (let i = 0; i < total; i++) {
            const raw = (await patCells.nth(i).innerText()).trim()
            if (Number(raw.replace(/[^\d]/g, '')) === patNo) return i
        }
        return -1
    }
})

})
