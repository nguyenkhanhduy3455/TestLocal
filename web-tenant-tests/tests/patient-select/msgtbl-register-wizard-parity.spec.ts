/**
 * MSGTBL parity — 4 mã chỉ phát ra từ dialog 受診者情報, tức bước 3 của
 * 新規登録ウィザード (`frm201023.chkInputDataMain`): E00052 / E00018 / E00019 / E00013.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI ĐI QUA WIZARD
 * ═══════════════════════════════════════════════════════════════════════════
 * Bốn mã này nằm trong `validateScreen3Main` — hàm CHỈ được gọi từ
 * `patient-registration-person-dialog.tsx:183`. Chuỗi F9 của màn 患者登録 thường
 * (`validateRegisterMain`) KHÔNG đi qua nhánh nào trong số này, nên
 * `msgtbl-register-f9-parity.spec.ts` không với tới được.
 *
 * E00013 là mã ĐÃ SỬA (commit 1e5afabb7, chuỗi lấy nguyên văn từ comment
 * frm201001.cs:2375) — đây là chỗ duy nhất chạm được nó trên UI.
 * Ba mã còn lại CHƯA verify: xem `_shared/msgtbl.ts`, `expectMsg` sẽ in cảnh báo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — điều kiện kích hoạt (wizard-validation.ts, `validateScreen3Main`)
 * ═══════════════════════════════════════════════════════════════════════════
 * Hàm GOM lỗi rồi trả `errors[0]`, nên thứ tự quyết định cái nào hiện ra:
 *   氏名(カナ) → 氏名(漢字) → 性別 → 生年月日 → 住所 → **E00052 → E00018 → E00019**
 *   → (confirm ngày) → **E00013** → E00016/E00017
 *
 *  - E00052 (:168) — 保険種別 ∈ {8 社・退, 9 国・退} VÀ 高齢者 ≥ 1.
 *  - E00018 (:173) — 保険種別 ∈ {1,2,8,9,10} VÀ `hasMedins` false.
 *      `hasMedins = medins.insNo.trim() !== ''` (person-dialog:186) ⇒ bỏ trống
 *      bước 1 là đủ. Phải chọn 社保 chứ không để 社・退, nếu không E00052 chặn trước.
 *  - E00019 (:177) — 保険種別 = 7 公・単 VÀ `hasPubexp` false ⇒ bỏ trống bước 2.
 *  - E00013 (:216) — 初回来院日 > 診療開始日. Phải giữ 保険種別 = 6 自費 (mặc định)
 *      để không dính E00018/E00019 đứng trước.
 *
 * Giá trị combo lấy từ `mst_cod` của chính tenant test:
 *   cd_type=1 (保険種別): 1 社保 | 6 自費 | 7 公・単 | 8 社・退 | 9 国・退 | 10 後期高齢者
 *   cd_type=4 (高齢者):   0 No | 1 27老人 | 3 生保後期高齢者 | 4 前期高齢者 | 5 後期高齢者
 *   cd_type=12 (性別):    1 男性 | 2 女性
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG ĐỤNG DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Wizard là "Kiểu A — atomic": draft chỉ sống trong RAM, không có gì tới form
 * cha cho tới khi xong bước 3 (`patient-registration-wizard.tsx:5-8`). Mọi
 * testcase đều DỪNG ở hộp thoại lỗi nên không bản ghi nào được tạo — spec này
 * không seed, không xoá, không cần TEST_DB / TEST_ALLOW_SAVE.
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): mỗi TC mở lại wizard từ
 * đầu nên chạy lẻ được, nhưng một TC đỏ ⇒ các TC sau bị skip. Page lấy từ
 * `authedPage` ⇒ không có trace/video tự động.
 */
import { type Locator, type Page } from '@playwright/test'

import {
    MSG,
    clickDialog,
    closeDialog,
    expectMsg,
    expectSeverity,
    nextDialogText,
    topDialog,
} from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

const DIALOG_TIMEOUT = 30_000

/** 保険種別 (mst_cod cd_type=1) — nhãn hiển thị, dùng để chọn trong Radix Select. */
const PAT_TYPE_SHAHO = '社保'
const PAT_TYPE_KOTAN = '公・単'
const PAT_TYPE_SHATAI = '社・退'
/** 高齢者 (cd_type=4) — bất kỳ giá trị ≥ 1 đều kích hoạt E00052; lấy 前期高齢者 = 4. */
const OLD_FLG_ZENKI = '前期高齢者'
/** 性別 (cd_type=12) — bắt buộc, nếu bỏ trống thì dừng sớm ở E00001「性別」. */
const SEX_MALE = '男性'

/**
 * Regex khớp tiêu đề bị GIÃN CHỮ — `DraggableDialog` render 「患 者 登 録 （ 3 ）」
 * nên `hasText: '患者登録（3）'` không bao giờ khớp (GUIDELINE Rule 13.1).
 */
function spaced(label: string): RegExp {
    return new RegExp([...label].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'))
}

/** Escape cho nhãn có ngoặc — `氏名(漢字)`, `(カナ)`. */
function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('MSGTBL parity — wizard 受診者情報 (E00052 / E00018 / E00019 / E00013)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.afterAll(async () => {
        // Rời màn hình trước khi nhả page: wizard đang mở dở sẽ rò sang spec sau
        // (Rule 19.1).
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    // ── Điều hướng ──────────────────────────────────────────────────────────

    /**
     * `true` nếu locator HIỆN RA trong `timeout`.
     *
     * KHÔNG dùng `locator.isVisible({ timeout })`: nó soi DOM NGAY lúc gọi và trả
     * về liền, `timeout` chỉ bó thao tác nội bộ chứ không chờ phần tử xuất hiện.
     * Đã vấp thật ở chính spec này — cả 4 testcase "BỎ QUA" vì hộp thoại chưa kịp
     * render tại đúng mili-giây gọi hàm.
     */
    async function appeared(locator: Locator, timeout = DIALOG_TIMEOUT): Promise<boolean> {
        return locator
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    const wizardStep = (n: number) =>
        page.getByRole('dialog').filter({ hasText: spaced(`患者登録（${n}）`) })

    /** Hàng `WizardFieldRow` theo nhãn. `required` gắn thêm `*` VÀO TRONG `<label>`. */
    function row(dlg: Locator, label: string): Locator {
        return dlg
            .locator('div')
            .filter({
                has: page
                    .locator('label')
                    .filter({ hasText: new RegExp(`^${escapeRe(label)}\\*?$`) }),
            })
            .last()
    }

    /**
     * Chọn một Radix Select trong hàng.
     *
     * Listbox mở qua PORTAL ở `body`, KHÔNG nằm trong dialog ⇒ phải tìm option ở
     * cấp `page` (Rule 12.6).
     */
    async function pickSelect(dlg: Locator, label: string, optionName: string): Promise<void> {
        await row(dlg, label).getByRole('combobox').first().click()
        const listbox = page.getByRole('listbox')
        await expect(listbox, `Select 「${label}」 không mở listbox`).toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        await listbox.getByRole('option', { name: optionName, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: DIALOG_TIMEOUT })
        await step()
    }

    /**
     * Điền một `EraDateField`: 1 combobox (元号) + 3 textbox (年/月/日) theo thứ tự
     * render. Không có aria-label nên phải bám hàng.
     *
     * 元号 lấy từ chính danh sách của app (mst-era) thay vì hardcode, rồi quy đổi
     * năm 西暦 sang năm 元号 bằng mốc bắt đầu tương ứng.
     */
    async function setEraDate(dlg: Locator, label: string, iso: string): Promise<void> {
        const parts = iso.split('-')
        const yyyy = Number(parts[0])
        const mm = Number(parts[1])
        const dd = Number(parts[2])
        const target = yyyy >= 2019 ? '令和' : yyyy >= 1989 ? '平成' : '昭和'
        const eraStart = target === '令和' ? 2018 : target === '平成' ? 1988 : 1925

        const r = row(dlg, label)
        await r.getByRole('combobox').first().click()
        const listbox = page.getByRole('listbox')
        await expect(listbox, `元号 của 「${label}」 không mở`).toBeVisible({ timeout: DIALOG_TIMEOUT })
        const names = (await listbox.getByRole('option').allInnerTexts())
            .map((t) => t.trim())
            .filter(Boolean)
        const picked = names.find((n) => n.startsWith(target))
        expect(picked, `mst-era không có 元号 ${target} (có: ${names.join('/')})`).toBeTruthy()
        await listbox.getByRole('option', { name: picked!, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: DIALOG_TIMEOUT })

        const boxes = r.getByRole('textbox')
        await boxes.nth(0).fill(String(yyyy - eraStart))
        await boxes.nth(1).fill(String(mm))
        await boxes.nth(2).fill(String(dd))
        await step()
    }

    /**
     * Mở wizard và đi tới bước 3, để trống bước 1 + 2.
     *
     * FACT patient-detail-form.tsx:337-355 — vào `/patients/registration` KHÔNG kèm
     * `patientNo` là chế độ đăng ký mới, và màn chào phụ thuộc tenant setting
     * `oqs.licensure`. Spec đi được CẢ HAI nhánh:
     *
     *  - licensure OFF → hiện thẳng AlertDialog 「新規登録ウィザードを表示しますか？」;
     *  - licensure ON  → hiện màn オンライン資格確認 trước. Đo thật trên môi trường
     *    test 2026-09-15: nhánh này mới là nhánh đang chạy. Lối sang wizard là
     *    **F10 戻る** trong chính màn đó — nó mở đúng AlertDialog trên, và "Yes"
     *    gọi `onShowPatientRegistration` (patient-detail-form.tsx:1623-1627 →
     *    `openWizard()`). Nói cách khác F10 ở đây KHÔNG phải "thoát".
     *
     * Bỏ trống bước 1 ⇒ `hasMedins` false (điều kiện của E00018);
     * bỏ trống bước 2 ⇒ `hasPubexp` false (điều kiện của E00019).
     */
    async function openPersonStep(): Promise<boolean> {
        await page.goto('/patients/registration', { waitUntil: 'domcontentloaded' })

        // licensure ON: qua màn オンライン資格確認 trước.
        const oqs = page.getByRole('dialog').filter({ hasText: spaced('オンライン資格確認') })
        if (await appeared(oqs)) {
            await oqs.getByRole('button', { name: /F10/ }).first().click()
            await step()
        }

        const greet = topDialog(page)
        if (!(await appeared(greet))) {
            console.log('Không có hộp thoại mời mở wizard → BỎ QUA')
            return false
        }
        const greetText = ((await greet.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
        if (!greetText.includes('新規登録ウィザード')) {
            console.log(`Hộp thoại chào là 「${greetText.trim()}」 → BỎ QUA, không phải wizard`)
            return false
        }
        await clickDialog(page, 'accept')
        await step()

        for (const n of [1, 2]) {
            const dlg = wizardStep(n)
            await expect(dlg, `wizard không mở được bước ${n}`).toBeVisible({
                timeout: DIALOG_TIMEOUT,
            })
            await dlg.getByRole('button', { name: 'F9 次へ' }).first().click()
            await step()
        }

        await expect(wizardStep(3), 'wizard không tới được bước 3').toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        return true
    }

    /** Điền 3 ô bắt buộc của bước 3 để chuỗi validate đi được tới nhánh đang đo. */
    async function fillRequired(dlg: Locator): Promise<void> {
        await row(dlg, '(カナ)').getByRole('textbox').first().fill('いーつーいー　かんじゃ')
        await step()
        await pickSelect(dlg, '性別', SEX_MALE)
        await setEraDate(dlg, '生年月日', '1980-01-01')
    }

    /** F9 次へ của bước 3 → đọc hộp thoại hiện ra. */
    async function pressNext(dlg: Locator, what: string): Promise<string> {
        await dlg.getByRole('button', { name: 'F9 次へ' }).first().click()
        await step()
        return nextDialogText(page, what, DIALOG_TIMEOUT)
    }

    /**
     * Cả 4 mã ở bước 3 đều đi qua `ShowErrorMsg` bên legacy (grep
     * `Show[A-Za-z]*Msg("E000xx"` chỉ ra đúng một biến thể cho mỗi mã), nên icon
     * phải là ✕ đỏ — không được rơi sang ⚠ vàng hay ℹ xanh.
     */
    async function expectErrorIcon(code: string): Promise<void> {
        await expectSeverity(page, 'error', `${code}: legacy dùng ShowErrorMsg`)
    }

    // ── E00052 ──────────────────────────────────────────────────────────────

    test('E00052 — 社・退 mà vẫn chỉ định 高齢者', async () => {
        test.skip(!(await openPersonStep()), 'không vào được wizard trên môi trường này')
        const dlg = wizardStep(3)
        await fillRequired(dlg)

        // 社・退 + 高齢者 ≥ 1 ⇒ E00052 chặn TRƯỚC E00018 (dù 保険情報 cũng đang trống).
        await pickSelect(dlg, '保険種別', PAT_TYPE_SHATAI)
        await pickSelect(dlg, '高齢者', OLD_FLG_ZENKI)

        const text = await pressNext(dlg, 'E00052')
        expectMsg(text, 'E00052', MSG.E00052(), '社・退 + 高齢者 phải dừng ở E00052')
        await expectErrorIcon('E00052')
        await closeDialog(page, 'E00052', DIALOG_TIMEOUT)
    })

    // ── E00018 ──────────────────────────────────────────────────────────────

    test('E00018 — 社保 mà chưa nhập 保険情報', async () => {
        test.skip(!(await openPersonStep()), 'không vào được wizard trên môi trường này')
        const dlg = wizardStep(3)
        await fillRequired(dlg)

        // 社保 (không phải 社・退) để KHÔNG dính E00052 đứng trước; bước 1 bỏ trống
        // nên hasMedins = false.
        await pickSelect(dlg, '保険種別', PAT_TYPE_SHAHO)

        const text = await pressNext(dlg, 'E00018')
        expectMsg(text, 'E00018', MSG.E00018(), '社保 mà không có 保険情報 phải dừng ở E00018')
        await expectErrorIcon('E00018')
        await closeDialog(page, 'E00018', DIALOG_TIMEOUT)
    })

    // ── E00019 ──────────────────────────────────────────────────────────────

    test('E00019 — 公・単 mà chưa nhập 公費情報', async () => {
        test.skip(!(await openPersonStep()), 'không vào được wizard trên môi trường này')
        const dlg = wizardStep(3)
        await fillRequired(dlg)

        // 公・単 KHÔNG nằm trong {1,2,8,9,10} nên bỏ qua E00018, rơi đúng vào E00019.
        await pickSelect(dlg, '保険種別', PAT_TYPE_KOTAN)

        const text = await pressNext(dlg, 'E00019')
        expectMsg(text, 'E00019', MSG.E00019(), '公・単 mà không có 公費情報 phải dừng ở E00019')
        await expectErrorIcon('E00019')
        await closeDialog(page, 'E00019', DIALOG_TIMEOUT)
    })

    // ── E00013 ──────────────────────────────────────────────────────────────

    test('E00013 — 初回来院日 muộn hơn 診療開始日', async () => {
        test.skip(!(await openPersonStep()), 'không vào được wizard trên môi trường này')
        const dlg = wizardStep(3)
        await fillRequired(dlg)

        // GIỮ NGUYÊN 保険種別 mặc định (6 自費): 自費 không nằm trong {1,2,8,9,10} và
        // cũng không phải 7, nên cả E00018 lẫn E00019 đều không chặn — E00013 mới
        // là lỗi đầu tiên.
        //
        // Nhãn trên UI là 「診療関始日」 (bản port gõ 関 thay vì 開) — bám đúng chuỗi
        // đang render, đừng "sửa" thành 診療開始日 nếu chưa sửa trong app.
        await setEraDate(dlg, '診療関始日', '2020-05-01')
        await setEraDate(dlg, '初回来院日', '2020-05-10')

        const text = await pressNext(dlg, 'E00013')
        expectMsg(
            text,
            'E00013',
            MSG.E00013(),
            '初回来院日 > 診療開始日 phải dừng ở E00013 — chuỗi này lấy nguyên văn từ ' +
                'comment legacy frm201001.cs:2375',
        )
        await expectErrorIcon('E00013')
        await closeDialog(page, 'E00013', DIALOG_TIMEOUT)
    })
})
