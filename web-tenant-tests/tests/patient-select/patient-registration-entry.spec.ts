import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient } from '../_shared/db'
import { openPatientRegistration } from '../_shared/entry'
import { patNo } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 1: luồng VÀO màn và trạng thái nút / F-key theo mode.
 *
 * Màn có hai mode, quyết định bởi query `patientNo` (routes/_authenticated/patients/registration.tsx):
 * không có ⇒ 新規 (WinForm `InpKbn.Insert`), có ⇒ 編集 (`InpKbn.Update`).
 *
 * Những nhóm khác của màn này có spec riêng, KHÔNG lặp ở đây:
 *  - chuỗi validate F9          → msgtbl-register-f9-parity / msgtbl-date-insurer-parity
 *  - validate bước 3 của wizard → msgtbl-register-wizard-parity
 *  - giữ chỗ 患者番号           → pat-no-slot
 *  - audit log khi F9           → patient-registration-audit-log
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs, `frm201001_Shown`)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :140  lblPatNo = 「≪患者番号：<patNo>≫」.
 *  - :144  OQSInfo.Licensure == false ⇒ F2 資格確認 disabled.
 *  - :164-178  Insert ⇒ btnAdd (追加) disabled; F5 / F6 / Shift+F1 / Shift+F2 disabled.
 *      KHÔNG khoá Shift+F6/F7/F8/F9.
 *  - :186  Licensure ⇒ mở オンライン資格確認 (ID201041) TRƯỚC; thoát không có dữ liệu
 *      ⇒ rơi xuống quyết định PatWizard (C5).
 *  - :900-933 `callProj` (Shift+F6 カルテ / F7 処置 / F8 口腔 / F9 会計) chạy `F9Proc()`
 *      TRƯỚC — tức chuỗi validate y như F9 登録 — rồi mới chuyển màn. Ở Insert nó
 *      lưu bệnh nhân mới rồi đổi sang Update.
 *  - :2131 F9Proc trên form trống dừng ở E00001「氏名（漢字）」.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web (features/patients/components/)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - patient-detail-form.tsx:407  `runPatWizardDecision`: C5=0 (mặc định) ⇒ confirm
 *      「新規登録ウィザードを表示しますか？」; はい ⇒ wizard, いいえ ⇒ focus 氏名(漢字).
 *  - :1632  「≪患者番号：N≫」, :1636 nhãn 「新規登録」 chỉ ở 新規.
 *  - :1647  追加 disabled khi 新規; :1656 削除 disabled khi 新規.
 *  - :312   nhãn tab 枝番: 新 ⇒ `NEW<patBr>`; đã lưu ⇒ `<patBr>:<和暦 br_dt>～`
 *      (WinForm frm201001.cs:2903 dùng 「：」 toàn góc + đệm 0 — đo ở branch-tabs TC-9).
 *  - :1538  `patientNo` không tồn tại ⇒ `NotFoundPage` 「ページが見つかりません」.
 *  - patient-side-panel.tsx:887  F2 disabled = `!oqsLicensure`.
 *  - :890/:895  F5 主訴 / F6 会計情報 disabled khi 新規.
 *  - :912/:917  Shift+F1 診療開始日 / Shift+F2 変更 disabled khi 新規.
 *  - :924/:930/:936  Shift+F6 カルテ / F7 処置 / F8 口腔 disabled khi 新規;
 *      :942 Shift+F9 会計 bật nhưng `handleShiftF9Accounting` (detail-form:1399)
 *      `return` ngay khi 新規 ⇒ ⚠️ LỆCH WinForm `callProj` — TC-9 đo chỗ này.
 *  - shared/components/fkey/fkey-bar.tsx:228  mỗi phím là `<button data-fkey="Fn">`;
 *      :253 nút bật lớp Shift mang `aria-pressed`, chữ ON/OFF.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Nhóm 新規 KHÔNG ghi gì: mọi TC dừng trước Q00001. Số 患者番号 màn giữ chỗ tự nhả
 * sau 2 phút (job pat-no-slot-release).
 * Nhóm 編集 cần TEST_DB=1: tự seed bệnh nhân 990890 (br_dt = 生年月日 = 1980-01-01)
 * ở beforeAll, xoá ở afterAll. Chỉ mở màn, không F9.
 *
 * Testcase NỐI TIẾP (`mode: 'serial'`), page dùng chung từ `authedPage` ⇒ không có
 * trace/video tự động.
 */

const DIALOG_TIMEOUT = 30_000
const OPEN_ATTEMPTS = 3

/** Bệnh nhân của riêng spec này (nhóm 編集). */
const EDIT_PAT_NO = patNo(String(SEED_PAT_NO_BASE + 890))
/** Không có trong dải seed nào — dùng cho 404. */
const MISSING_PAT_NO = String(SEED_PAT_NO_BASE + 8999)

const WIZARD_ASK = '新規登録ウィザードを表示しますか？'

/** Tiêu đề DraggableDialog bị giãn chữ (Rule 13.1). */
function spaced(label: string): RegExp {
    return new RegExp([...label].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'))
}

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

test.describe('患者登録 (frm201001) — luồng vào màn + F-key theo mode', () => {
    let page: Page
    let step: () => Promise<void>
    /** oqs.licensure của tenant, suy từ việc màn オンライン資格確認 có bật hay không. */
    let licensure = false

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        if (dbEnabled) await seedTestPatient({ patNo: Number(EDIT_PAT_NO) })
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        if (dbEnabled) await deleteTestPatient(Number(EDIT_PAT_NO))
        await releaseSharedPage(page)
    })

    const main = () => page.locator('main')
    const fkey = (k: string): Locator => main().locator(`[data-fkey="${k}"]`)
    const shiftToggle = (): Locator => main().locator('button[aria-pressed]')
    const verification = () =>
        page.getByRole('dialog').filter({ hasText: spaced('オンライン資格確認') })
    const wizardAsk = () => page.getByRole('alertdialog').filter({ hasText: WIZARD_ASK })
    const nameInput = () => main().locator('[data-field="patNm"] input').first()
    /**
     * 追加 / 削除 của header (枝番). Khu 公費 bên phải cũng có nút cùng tên; header
     * đứng trước trong DOM (detail-form:1641) nên lấy cái đầu.
     */
    const headerButton = (name: '追加' | '削除'): Locator =>
        main().getByRole('button', { name, exact: true }).first()
    /** Tab 枝番 — 《公費情報》 cũng có tablist riêng (cũng 「NEW1」), đứng sau trong DOM. */
    const branchTabs = (): Locator => main().getByRole('tablist').first().getByRole('tab')

    /** Bật/tắt lớp Shift bằng nút ON/OFF (không giữ phím Shift — nhãn đổi theo). */
    async function setShift(on: boolean): Promise<void> {
        const t = shiftToggle()
        if ((await t.getAttribute('aria-pressed')) !== String(on)) await t.click()
        await expect(t).toHaveAttribute('aria-pressed', String(on))
        await step()
    }

    /**
     * goto màn 新規, retry khi Vite dev server nhả hụt module (trang trắng). Trả về
     * khi hộp mở đầu đầu tiên (オンライン資格確認 hoặc confirm wizard) đã hiện.
     */
    async function gotoNewRegistration(): Promise<void> {
        for (let attempt = 1; attempt <= OPEN_ATTEMPTS; attempt++) {
            await page.goto('/patients/registration', { waitUntil: 'domcontentloaded' })
            const opened = await verification()
                .or(wizardAsk())
                .first()
                .waitFor({ timeout: DIALOG_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (opened) return
            console.log(`gotoNewRegistration: lần ${attempt}/${OPEN_ATTEMPTS} không thấy hộp mở đầu — nạp lại`)
        }
        throw new Error('Mở /patients/registration mà không thấy オンライン資格確認 lẫn confirm wizard')
    }

    /** Đi qua hai hộp mở đầu bằng いいえ ⇒ form 新規 trống. */
    async function openNewRegistrationForm(): Promise<void> {
        await gotoNewRegistration()
        if (await verification().isVisible()) {
            await verification().locator('[data-fkey="F10"]').click()
            await step()
        }
        await wizardAsk().getByRole('button', { name: /^(いいえ|No)$/ }).click()
        await expect(page.getByRole('alertdialog')).toBeHidden()
        await expect(nameInput()).toBeVisible()
        await step()
    }

    // ── 新規 ────────────────────────────────────────────────────────────────

    test('TC-1 — 新規: オンライン資格確認 (nếu licensure) → F10 → confirm wizard', async () => {
        await gotoNewRegistration()
        licensure = await verification().isVisible()
        console.log(`oqs.licensure = ${licensure} (suy từ màn オンライン資格確認)`)

        if (licensure) {
            // frm201001.cs:186 — màn xác nhận mở TRƯỚC, confirm wizard chưa được hiện.
            await expect(wizardAsk()).toBeHidden()
            await step()
            await verification().locator('[data-fkey="F10"]').click()
            await step()
            await expect(verification()).toBeHidden()
        }

        // C5=0 (mặc định) ⇒ hỏi. Tenant đổi pat.patWizard sang 1/2 thì TC này đỏ ở đây.
        await expect(wizardAsk(), 'pat.patWizard=0 phải hỏi mở wizard').toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        await step()
    })

    test('TC-2 — 新規: いいえ ⇒ đóng hỏi, không wizard, focus 氏名(漢字)', async () => {
        await wizardAsk().getByRole('button', { name: /^(いいえ|No)$/ }).click()
        await step()
        await expect(page.getByRole('alertdialog')).toBeHidden()
        await expect(page.getByRole('dialog').filter({ hasText: spaced('患者登録（1）') })).toBeHidden()
        await expect(nameInput()).toBeFocused()
    })

    test('TC-3 — 新規: đầu màn có 患者番号 + 「新規登録」, 追加/削除 khoá, tab NEW1', async () => {
        await expect(main().getByText(/^≪患者番号：\d+≫$/)).toBeVisible()
        await expect(main().getByText('新規登録', { exact: true })).toBeVisible()
        await expect(headerButton('追加')).toBeDisabled()
        await expect(headerButton('削除')).toBeDisabled()
        await expect(branchTabs()).toHaveText(['NEW1'])
        await step()
    })

    test('TC-4 — 新規: F-key khoá đúng F5/F6/Shift+F1/Shift+F2, F2 theo licensure', async () => {
        await setShift(false)
        // frm201001.cs:175-176
        for (const k of ['F5', 'F6']) await expect(fkey(k), `${k} phải khoá khi 新規`).toBeDisabled()
        for (const k of ['F1', 'F3', 'F4', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'])
            await expect(fkey(k), `${k} phải bật khi 新規`).toBeEnabled()
        // frm201001.cs:144
        if (licensure) await expect(fkey('F2')).toBeEnabled()
        else await expect(fkey('F2')).toBeDisabled()
        await step()

        await setShift(true)
        await expect(fkey('F1')).toContainText('診療開始日')
        // frm201001.cs:177-178
        for (const k of ['F1', 'F2']) await expect(fkey(k), `Shift+${k} phải khoá khi 新規`).toBeDisabled()
        await step()
        await setShift(false)
    })

    test('TC-5 — 新規: はい ⇒ mở wizard bước 1, form chính bị khoá phía sau', async () => {
        await gotoNewRegistration()
        if (await verification().isVisible()) {
            await verification().locator('[data-fkey="F10"]').click()
            await step()
        }
        await wizardAsk().getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await step()
        const step1 = page.getByRole('dialog').filter({ hasText: spaced('患者登録（1）') })
        await expect(step1).toBeVisible({ timeout: DIALOG_TIMEOUT })

        // Đóng wizard (F10 戻る) ⇒ bỏ draft, quay về form trống, focus 氏名(漢字).
        await step1.locator('[data-fkey="F10"]').click()
        await step()
        await expect(step1).toBeHidden()
        await expect(nameInput()).toBeFocused()
        await expect(nameInput()).toHaveValue('')
    })

    // ── 編集 ────────────────────────────────────────────────────────────────

    test.describe('編集 (patientNo có trong URL)', () => {
        test.beforeEach(() => {
            skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân 編集')
        })

        test('TC-6 — 編集: không hộp mở đầu, đầu màn đúng số, không 「新規登録」, tab theo br_dt', async () => {
            await openPatientRegistration(page, EDIT_PAT_NO)
            await expect(main().getByText(`≪患者番号：${EDIT_PAT_NO}≫`)).toBeVisible()
            await expect(nameInput()).toHaveValue('E2Eテスト患者')
            await step()
            await expect(verification()).toBeHidden()
            await expect(wizardAsk()).toBeHidden()
            await expect(main().getByText('新規登録', { exact: true })).toBeHidden()
            // Chỉ khoá CẤU TRÚC 「<patBr><:|：><和暦 br_dt>～」 ở đây. Định dạng đúng từng
            // chữ của WinForm (「1：昭和55年01月01日～」) do patient-registration-branch-tabs
            // TC-9 đo — web đang lệch, để đây đỏ theo thì nhóm này mất tác dụng chặn hồi quy.
            await expect(branchTabs()).toHaveText([/^1[:：]昭和55年0?1月0?1日～$/])
            await expect(headerButton('追加')).toBeEnabled()
            await expect(headerButton('削除')).toBeEnabled()
        })

        test('TC-7 — 編集: F5/F6 và Shift+F1/F2/F6〜F9 đều bật', async () => {
            await setShift(false)
            for (const k of ['F5', 'F6']) await expect(fkey(k), `${k} phải bật khi 編集`).toBeEnabled()
            await setShift(true)
            for (const k of ['F1', 'F2', 'F6', 'F7', 'F8', 'F9'])
                await expect(fkey(k), `Shift+${k} phải bật khi 編集`).toBeEnabled()
            await step()
            await setShift(false)
        })

        test('TC-8 — 編集: patientNo không tồn tại ⇒ trang 404', async () => {
            // Cùng dạng JSON-quote với openPatientRegistration — để 404 là vì KHÔNG
            // có bệnh nhân, không phải vì URL sai dạng.
            await page.goto(`/patients/registration?patientNo=%22${MISSING_PAT_NO}%22`, {
                waitUntil: 'domcontentloaded',
            })
            await expect(page.getByText('ページが見つかりません')).toBeVisible({ timeout: DIALOG_TIMEOUT })
            await expect(page.locator('[data-fkey="F9"]')).toHaveCount(0)
            await step()
        })
    })

    test('TC-9 (parity) — 新規: Shift+F6〜F9 vẫn bật, Shift+F9 chạy chuỗi F9 như WinForm callProj', async () => {
        // ĐẶT CUỐI FILE: đang lệch WinForm nên dự kiến ĐỎ, mà serial thì TC đỏ làm
        // skip mọi TC sau nó.
        await openNewRegistrationForm()
        // WinForm không khoá SF6〜SF9 ở Insert (frm201001.cs:175-178), và callProj
        // gọi F9Proc trước (:903) ⇒ form trống phải ra ĐÚNG hộp của F9 登録.
        await fkey('F9').click()
        const f9Msg = page.getByRole('alertdialog')
        await expect(f9Msg, 'F9 trên form trống phải ra hộp lỗi').toBeVisible({ timeout: DIALOG_TIMEOUT })
        const f9Text = (await f9Msg.innerText()).replace(/\s+/g, ' ').trim()
        console.log(`F9 trên form trống: 「${f9Text}」`)
        expect(f9Text).toContain('氏名（漢字）')
        await step()
        await f9Msg.getByRole('button').first().click()
        await expect(page.getByRole('alertdialog')).toBeHidden()

        await setShift(true)
        for (const k of ['F6', 'F7', 'F8', 'F9'])
            expect.soft(await fkey(k).isEnabled(), `Shift+${k} phải bật khi 新規 (WinForm không khoá)`).toBe(true)

        await fkey('F9').click()
        await step()
        await expect(
            page.getByRole('alertdialog'),
            'Shift+F9 会計 ở 新規 phải chạy F9Proc (callProj) ⇒ cùng hộp lỗi với F9',
        ).toContainText('氏名（漢字）', { timeout: 10_000 })
        await page.getByRole('alertdialog').getByRole('button').first().click()
        await setShift(false)
    })
})
