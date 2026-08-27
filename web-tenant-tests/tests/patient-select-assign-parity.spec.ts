import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteWaitRows,
    ensureWaitRow,
    findPatientForZeroWaitRow,
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
 * 診療入力（患者選択）— ĐỐI CHIẾU PARITY với WinForm, cùng số hiệu TC.
 *
 * ─── Quan hệ với hai file kia ────────────────────────────────────────────────
 * `patient-select-dr-staff-required.spec.ts` đo bản web theo **URL** (`drNo=` trên
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
 *   npx playwright test tests/patient-select-assign-parity.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

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
        await caption.locator('..').getByRole('button').nth(1).click()
        const combo = page.getByRole('combobox').first()
        await expect(combo, 'click ô giá trị mà combo Ｄｒ．không hiện ra').toBeVisible({
            timeout: 15000,
        })
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

    test.beforeAll(async ({ browser }) => {
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

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

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

        // Mốc parity: WinForm đọc cùng giá trị này ở NHÃN lbDr (frm203002.cs:427).
        await expect(
            await openDetailDrCombo(),
            `combo trống ⇒ header phải mang att_dr=${attDrOfPatWithDr}「${expectedNm}」`,
        ).toHaveText(expectedNm!, { timeout: 30000 })
        // Ô GIÁ TRỊ chỉ GHI LẠI, không assert: nó hiện 担当医 của DÒNG con trỏ đang
        // đứng (port của Chg_DrName) nên phụ thuộc dữ liệu 処置 sẵn có của ngày đó,
        // trong khi combo phía trên mới là thứ quyết định dr_no khi lưu.
        const drValueCell = (await detailDrValueCell().innerText()).trim()
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
