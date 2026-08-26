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
 * ─── NĂM ĐIỂM LỆCH đã tìm ra khi đọc source WinForm ─────────────────────────
 * Bốn cái đầu chốt được từ source; cái thứ năm phải chạy probe trên máy Windows.
 * Mỗi cái có một testcase ĐÓNG ĐINH hành vi hiện tại của bản web, kèm ghi chú
 * WinForm làm gì khác — để hôm nào sửa cho khớp thì biết chính xác phải sửa gì.
 *
 * 1. **`DispEiseisi` bind nhầm trường.** WinForm đọc
 *    `XmlControl.OchaXml.InpInfo.DispEiseisi` trong `C:\NEW_SIM2000\Ocha.xml`
 *    (XmlControl.cs:80). Bản web đọc `inp_config.eiseiji_flg` từ DB — mà cột đó
 *    bên WinForm là một tuỳ chọn 算定 khác hẳn, 「衛生実地指導を算定しない」
 *    (InpConfig.cs:28, dùng ở frm506008.cs:819). `frm203001` KHÔNG đọc cột đó lần nào.
 *
 * 2. **`DispEiseisi` có BA trạng thái, bản web chỉ biết hai.** Màn 処置入力設定 ghi
 *    `1` khi tick và **`9`** khi bỏ tick (frm203003.cs:264). Mà `:542` chỉ ẩn hàng khi
 *    `== 0`, còn `:721` chỉ bắt buộc khi `== 1`:
 *      · `1` → hiện + bắt buộc
 *      · `9` → **hiện + KHÔNG bắt buộc**   ← cấu hình thật khi người dùng bỏ tick
 *      · `0` → ẩn + không bắt buộc
 *    `EiseijiFlg` của web (`api/inp-config-api.ts:34`) chỉ có `{Hidden:0, Shown:1}` và
 *    suy `hygienistRequired = showHygienist`, tức **hiện ⇒ bắt buộc**. Ở đúng cấu hình
 *    phổ biến nhất (đã bỏ tick ⇒ 9) web CHẶN E00027「衛生士」 còn WinForm CHO QUA.
 *
 * 3. **Nhánh 受付 đọc SỰ TỒN TẠI CỦA CỘT, không phải giá trị.**
 *      `if (dt.Columns.Contains("user_no")) UserNo = dt.Rows[i]["user_no"] else person.dr`
 *    (frm203001.cs:696-701). Lưới 受付患者一覧 LUÔN có cột đó (PatInfoList.cs:177), nên
 *    dòng mang `user_no = 0` ⇒ WinForm lấy `0` rồi **chặn E00027**, KHÔNG rơi về
 *    `att_dr`. Nhánh `else` chỉ dành cho các view khác (本日来院 / 検索一覧).
 *    Bản web viết `toUserNo(waitRowUserNo) || toUserNo(patientAttDr)` ⇒ rơi về `att_dr`
 *    và MỞ ĐƯỢC màn. TC-DR-4B đóng đinh chỗ này.
 *
 * 4. **Double-click trên lưới là no-op bên WinForm.** `dgvView_CellDoubleClick` có câu
 *    `defData` BỊ COMMENT (frm203001.cs:303-309). Cửa vào thật của nhánh `selRow` là
 *    **Enter** trên lưới (`:287-296`). Bản web mở màn bằng `dblclick()`. TC-ROW-1.
 *
 * 5. **Ｄｒ．nào thắng trên header 処置入力 — PHẢI ĐO.** Ba đoạn WinForm cùng tranh
 *    nhau ghi: `Let_Data_frmPatId` (`:1054`, chạy vô điều kiện vì `DrId_fixed` không
 *    được gán `true` ở đâu cả), `cboDr.SelectedValue = formParam.UserNo`
 *    (frm203002.cs:425 → `:8095`), và `Chg_DrName` (modMain.cs:2125, lấy `dr_no` CỦA
 *    DÒNG khi ngày đó đã có 処置). TC-SEED-1 đóng đinh phía web; `KQ-6` của probe
 *    WinForm trả lời phía kia.
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

/** `EiseijiFlg.Hidden` — 0 = ẩn hàng 衛生士. */
const EISEIJI_HIDDEN = 0

const INP_CONFIG_URL = /\/tenant\/inp-config(\?|$)/

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

    let eiseijiFlg: number | null = null

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
            if (!INP_CONFIG_URL.test(res.url())) return
            void res
                .json()
                .then((body) => {
                    const data = (body as { data?: { eiseijiFlg?: number } }).data
                    if (data) eiseijiFlg = Number(data.eiseijiFlg)
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

    test('TC-MSG-1 — nguyên văn E00027: bản web ĐOÁN SAI (đã đo MSGTBL trên máy thật)', async () => {
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
        console.log(
            `=== PARITY E00027 (WinForm) === 「${WINFORM_E00027('ドクター')}」\n` +
                '    ★ LỆCH: đã ĐỌC MSGTBL trên máy Windows thật 2026-08-26 (probe KQ-2) — ' +
                'E00027 = 「{0}を特定出来ません。{0}を選択して下さい。」. Bản web dùng ' +
                '「{field}が選択されていません。」, tức SAI cả cách diễn đạt lẫn số lần nhắc {field}. ' +
                'locales/ja.ts:63 tự khai là 未確認 — giờ đã xác nhận, sửa được rồi.',
        )

        // Đóng đinh câu HIỆN TẠI của web để lần sửa locales/ja.ts làm testcase này đỏ
        // và người sửa biết phải cập nhật cả hai đầu.
        await expect(
            appDialog(),
            'web không còn dùng khuôn 「…が選択されていません。」 — nếu vừa sửa theo MSGTBL thì ' +
                'cập nhật luôn assert này sang WINFORM_E00027',
        ).toContainText('選択されていません')
        expect(
            wording.replace(/\s+/g, ''),
            'web đã khớp WinForm — xoá điểm lệch #6 khỏi header spec và khỏi README của luồng FlaUI',
        ).not.toContain(WINFORM_E00027('ドクター').replace(/\s+/g, ''))
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
        // WinForm: `cboPatNo.Focus()` (frm203001.cs:673). Web: `patientNoInputRef.focus()`.
        await expect(patNoInput(), 'sau E00005 focus phải quay về ô 患者番号 như WinForm').toBeFocused()
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
        // WinForm: `cboUserNm.Focus()` (frm203001.cs:708).
        await expect(
            staffSelect('Dr.'),
            'sau E00027「ドクター」 focus phải quay về combo Dr. như WinForm',
        ).toBeFocused()
        await step()
    })

    // ── TC-ST-1 ─────────────────────────────────────────────────────────────

    test('TC-ST-1 — thiếu 衛生士: web chặn theo eiseiji_flg — LỆCH với DispEiseisi của Ocha.xml', async () => {
        await expect
            .poll(() => eiseijiFlg, { message: 'không bắt được GET /tenant/inp-config', timeout: 30000 })
            .not.toBeNull()

        console.log(
            `=== PARITY 衛生士 === web đọc inp_config.eiseiji_flg = ${eiseijiFlg}. ` +
                'WinForm KHÔNG đọc cột này — nó đọc Ocha.xml InpInfo.DispEiseisi (XmlControl.cs:80), ' +
                'và eiseiji_flg bên WinForm là tuỳ chọn 算定「衛生実地指導を算定しない」 (InpConfig.cs:28). ' +
                'Đối chiếu với dòng `KQ-1b` / `KQ-ST-1b` của confirm-patient-KQ.txt.',
        )

        skipWithReason(
            eiseijiFlg === EISEIJI_HIDDEN,
            `eiseiji_flg=${eiseijiFlg} (ẩn hàng 衛生士) → không dựng được nhánh chặn`,
        )
        skipWithReason(
            patWithoutSt === null,
            'dataset không có bệnh nhân nào CÓ 担当医 mà THIẾU 衛生士 (att_st=100 là 無所属, vẫn tính là có)',
        )

        await clearPatNo()
        await clearDoctor()
        await typePatNo(String(patWithoutSt))
        await page.keyboard.press('End')

        await expect(appDialog(), 'thiếu 衛生士 mà không chặn').toBeVisible({ timeout: 15000 })
        await expect(
            appDialog(),
            'chặn nhầm ở 担当医 — bệnh nhân này CÓ att_dr nên lẽ ra qua được bước Dr.',
        ).toContainText('衛生士')
        await dismissDialog()

        await expect(page).toHaveURL(/\/treatments\/?(\?|$)/)
        // WinForm: `cboStaffNm.Focus()` (frm203001.cs:724).
        await expect(
            staffSelect('衛生士'),
            'sau E00027「衛生士」 focus phải quay về combo 衛生士 như WinForm',
        ).toBeFocused()

        console.log(
            `    ★ LỆCH: web CHẶN vì eiseiji_flg=${eiseijiFlg} ≠ 0. WinForm chỉ chặn khi ` +
                'DispEiseisi == 1; bỏ tick 「衛生士を入力する」 ghi 9 (frm203003.cs:264) ⇒ hàng vẫn HIỆN ' +
                '(:542 chỉ ẩn khi == 0) mà KHÔNG bắt buộc (:721). Cấu hình đó web sẽ chặn, WinForm cho qua.',
        )
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
