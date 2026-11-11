import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { allowSave, patNo } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 2: rời màn khi chưa lưu (`ExitWithoutSaving`)
 * qua F10 戻る / F11 患者選択 / F12 メニュー.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :698 F10 / :723 F11 / :751 F12 đều gọi `ExitWithoutSaving()` TRƯỚC khi chuyển
 *      màn. F12 chỉ mở MENU sau khi hàm này trả true.
 *  - :1002 `ExitWithoutSaving`: `chkChangeData == false` (= CÓ đổi) ⇒
 *      ShowYesNoCancelMsg「患者データは変更されています。保存しますか？」, Button2
 *      (いいえ) là nút mặc định.
 *        · キャンセル ⇒ ở lại.
 *        · いいえ     ⇒ rời màn, không lưu.
 *        · はい       ⇒ chkInputDataMed + chkInputDataMain rồi `updateProc` THẲNG —
 *          KHÔNG hỏi thêm câu 「患者データは、変更されています。保存しますか？」 của F9Proc.
 *  - :1377 `chkChangeData`: `_pData == null` (新患) ⇒ return false ⇒ màn 新規 LUÔN
 *      bị coi là có đổi, kể cả chưa gõ gì.
 *  - :259 `otherInfo.setDefaultData` (担当医/衛生士/リコール mặc định, UserControls/
 *      OtherInfo.cs:204) CHỈ ở nhánh Insert — bệnh nhân 編集 trống 担当医 vẫn trống.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web (features/patients/components/patient-detail-form.tsx)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :1368 `isFormDirty`: so snapshot với baseline; baseline null ⇒ lấy snapshot
 *      hiện tại làm baseline ⇒ form 新規 chưa gõ gì = KHÔNG dirty.
 *  - :1382 `handleExit`: dirty ⇒ `yesNoCancel(ja.unsavedChangesConfirm('患者データ'),
 *      { defaultButtonIndex: DEFAULT_BUTTON_2 })`; yes ⇒ `onComplete(proceed)`.
 *  - :1186 `onComplete` ở 編集 luôn hỏi
 *      「患者データは、変更されて(い)ます/いません。保存しますか？」 ⇒ はい ở hộp rời màn
 *      dẫn tới câu hỏi THỨ HAI.
 *  - :1792-1793 F10 / F11 = `handleExit(onBack)` ⇒ /patients (「患 者 登 録　（患者選択）」).
 *  - :1794 F12 = `setMenuOpen(true)` — mở MainMenuDialog NGAY; `handleExit` chỉ chạy
 *      khi chọn một mục trong menu (:1908).
 *  - :968-976 baseline chụp bằng timer 250ms sau khi `detail` đổi; patient-side-panel
 *      .tsx:547-562 điền 担当医/衛生士/リコール mặc định từ patConfig (nạp bất đồng bộ)
 *      vào CẢ bệnh nhân 編集 khi ô trống ⇒ patConfig về sau baseline là form "đã sửa"
 *      dù người dùng chưa chạm gì (TC-9).
 *  - shared/ui/confirm-dialog-view.tsx:15 nút: はい / いいえ / キャンセル.
 *  - locales/ja.ts `unsavedChangesConfirm` = `${subject}は変更されています。保存しますか？`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Cần TEST_DB=1: seed bệnh nhân 990891 (tên có dấu cách, br_dt 2000-01-01 để chuỗi
 * validate F9 đi qua — như patient-registration-audit-log; 担当医/衛生士 = 1/100 như
 * bệnh nhân thật) và 990892 (担当医/衛生士 TRỐNG, cho TC-9), xoá ở afterAll.
 * Trường được sửa là 電話番号 (`insurance.tel_1`, seed để NULL).
 * TC-5 GHI THẬT qua UI ⇒ cần thêm TEST_ALLOW_SAVE=1.
 *
 * Hai khối:
 *  - 「編集」 SERIAL, nối tiếp trạng thái. TC-6 (parity) đặt CUỐI khối vì đỏ thì
 *    skip mọi TC sau nó.
 *  - 「parity」 TC-7 + TC-8, KHÔNG serial: mỗi TC tự mở màn, đỏ cái nào không kéo
 *    cái khác. TC đỏ làm
 *    Playwright dựng worker mới ⇒ mỗi lượt chạy tốn HAI lần login (Rule 10.1).
 */

const DIALOG_TIMEOUT = 30_000

const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 891))
/** Bệnh nhân 担当医/衛生士 TRỐNG — chỉ cho TC-9. */
const BLANK_DR_PAT_NO = String(SEED_PAT_NO_BASE + 892)
/**
 * Giá trị 担当医/衛生士 phổ biến nhất trong dev DB (13109/16326 bệnh nhân, đo
 * 2026-10-26). Bệnh nhân seed để trống thì web tự điền mặc định patConfig vào (xem
 * TC-9) và form thành "đã sửa" — TC-1 sẽ đo nhầm sang chuyện đó.
 */
const ATT_DR = 1
const ATT_ST = 100
const NEW_PHONE = '090-0000-0891'

/** ja.unsavedChangesConfirm('患者データ') — frm201001.cs:1012. */
const EXIT_PROMPT = '患者データは変更されています。保存しますか？'
/** Câu hỏi của F9Proc ở 編集 (frm201001.cs:974) — có dấu phẩy sau 「は」. */
const F9_UPDATE_PROMPT = /患者データは、変更されて(い|いま)す/

// Seed DB ở beforeAll/afterAll cấp file. Config để fullyParallel + 4 worker ⇒ không ghim
// thì mỗi describe sang một worker, seed/xoá cùng bệnh nhân đụng nhau giữa các worker.
// 'default' = một worker, đúng thứ tự, nhưng test đỏ không kéo test sau skip theo.
test.describe.configure({ mode: 'default', retries: 0, timeout: 180_000 })

test.beforeAll(async () => {
    if (!dbEnabled) return
    for (const n of [PAT_NO, BLANK_DR_PAT_NO]) {
        await seedTestPatient({
            patNo: Number(n),
            patNm: 'イーツーイー　患者',
            patKn: 'いーつーいー　かんじゃ',
        })
        await withDb((c) =>
            c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = $1`, [Number(n)]),
        )
    }
    await withDb((c) =>
        c.query('UPDATE person SET att_dr = $2, att_st = $3 WHERE pat_no = $1', [
            Number(PAT_NO),
            ATT_DR,
            ATT_ST,
        ]),
    )
})

test.afterAll(async () => {
    if (!dbEnabled) return
    for (const n of [PAT_NO, BLANK_DR_PAT_NO]) await deleteTestPatient(Number(n))
})

/** tel_1 của mọi dòng insurance còn sống của bệnh nhân. */
async function phonesInDb(): Promise<(string | null)[]> {
    return withDb(async (c) => {
        const r = await c.query<{ tel_1: string | null }>(
            'SELECT tel_1 FROM insurance WHERE pat_no = $1 ORDER BY pat_br',
            [Number(PAT_NO)],
        )
        return r.rows.map((x) => x.tel_1)
    })
}

/** Dùng chung cho hai khối — mỗi khối tự gắn page của nó. */
function helpers(getPage: () => Page) {
    const page = () => getPage()
    const fkey = (k: string): Locator => page().locator('main').locator(`[data-fkey="${k}"]`)
    const prompt = (): Locator => page().getByRole('alertdialog').filter({ hasText: EXIT_PROMPT })
    const phone = (): Locator => patientFieldInput(page(), '電話番号')
    const atPatientList = () =>
        expect(page().getByRole('heading', { name: /患\s*者\s*選\s*択/ })).toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })

    async function openDirty(): Promise<void> {
        await openPatientRegistration(page(), PAT_NO)
        await phone().fill(NEW_PHONE)
        await expect(phone()).toHaveValue(NEW_PHONE)
    }
    return { fkey, prompt, phone, atPatientList, openDirty }
}

test.describe('患者登録 (frm201001) — rời màn khi chưa lưu: 編集', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { fkey, prompt, phone, atPatientList, openDirty } = helpers(() => page)
    /** Mọi hộp hiện ra sau はい ở TC-5 — TC-6 đọc lại. */
    let dialogsAfterYes: string[] | undefined

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân 編集')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-1 — chưa sửa gì: F10 rời màn ngay, không hỏi', async () => {
        await openPatientRegistration(page, PAT_NO)
        await step()
        await fkey('F10').click()
        await atPatientList()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await step()
    })

    test('TC-2 — đã sửa: F10 hỏi 「患者データは変更されています。保存しますか？」, mặc định いいえ', async () => {
        await openDirty()
        await step()
        await fkey('F10').click()
        await expect(prompt()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        // Lọc theo nhãn: khung hộp thoại còn một nút ✕ không tên.
        await expect(
            prompt().getByRole('button', { name: /^(はい|いいえ|キャンセル)$/ }),
        ).toHaveText(['はい', 'いいえ', 'キャンセル'])
        // MessageBoxDefaultButton.Button2 (frm201001.cs:1012)
        await expect(prompt().getByRole('button', { name: 'いいえ', exact: true })).toBeFocused()
        await step()
    })

    test('TC-3 — キャンセル: ở lại màn, giữ chữ vừa gõ', async () => {
        await prompt().getByRole('button', { name: 'キャンセル', exact: true }).click()
        await step()
        await expect(prompt()).toBeHidden()
        await expect(page).toHaveURL(/\/patients\/registration/)
        await expect(phone()).toHaveValue(NEW_PHONE)
    })

    test('TC-4 — F11 → いいえ: sang 患者選択, DB không đổi', async () => {
        await fkey('F11').click()
        await expect(prompt()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await prompt().getByRole('button', { name: 'いいえ', exact: true }).click()
        await atPatientList()
        await step()
        expect(await phonesInDb()).not.toContain(NEW_PHONE)
    })

    test('TC-5 — F10 → はい: lưu rồi rời màn (TEST_ALLOW_SAVE)', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: はい ghi thật bệnh nhân seed')
        await openDirty()
        await fkey('F10').click()
        await expect(prompt()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await prompt().getByRole('button', { name: 'はい', exact: true }).click()
        await step()

        // Đi tiếp mọi confirm (はい/OK) cho tới khi hết hộp, ghi lại để TC-6 đo.
        const seen: string[] = []
        for (let i = 0; i < 6; i++) {
            const dlg = page.getByRole('alertdialog').first()
            const shown = await dlg
                .waitFor({ timeout: 3_000 })
                .then(() => true)
                .catch(() => false)
            if (!shown) break
            seen.push(((await dlg.innerText()) || '').replace(/\s+/g, ' ').trim())
            const ok = dlg.getByRole('button', { name: /^(はい|OK)$/ }).first()
            if (!(await ok.isVisible())) break
            await ok.click()
            await step()
        }
        dialogsAfterYes = seen
        console.log(`Hộp sau はい: ${seen.map((s) => `「${s}」`).join(' → ') || '(không có)'}`)

        await atPatientList()
        await expect.poll(phonesInDb, { message: 'はい phải lưu 電話番号 mới' }).toContain(NEW_PHONE)
    })

    test('TC-6 (parity) — はい ở hộp rời màn lưu THẲNG, không hỏi lại câu của F9', async () => {
        skipWithReason(dialogsAfterYes === undefined, 'TC-5 không chạy ⇒ không có gì để đo')
        // frm201001.cs:1022-1046 — はい ⇒ validate ⇒ updateProc, không ShowYesNoCancelMsg nào nữa.
        expect(
            dialogsAfterYes!.filter((t) => F9_UPDATE_PROMPT.test(t)),
            'web hỏi thêm 「患者データは、変更されています。保存しますか？」 sau khi đã chọn はい',
        ).toEqual([])
    })
})

test.describe('患者登録 (frm201001) — rời màn khi chưa lưu: parity', () => {
    let page: Page
    let step: () => Promise<void>
    const { fkey, prompt, openDirty } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-7 (parity) — 新規 chưa gõ gì: F10 vẫn hỏi lưu (chkChangeData coi 新患 là đã đổi)', async () => {
        // Web CHẬP CHỜN ở đây (đo 2026-10-26: 2 hỏi / 1 không hỏi trong 3 lượt):
        // isFormDirty lấy baseline lười, nên kết quả tuỳ default nạp xong trước hay sau.
        const verification = page.getByRole('dialog').filter({ hasText: /オ\s*ン\s*ラ\s*イ\s*ン/ })
        const wizardAsk = page.getByRole('alertdialog').filter({ hasText: '新規登録ウィザードを表示しますか？' })
        // Retry khi Vite dev server nhả hụt module (trang trắng) — như gotoNewRegistration của nhóm 1.
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto('/patients/registration', { waitUntil: 'domcontentloaded' })
            const opened = await verification
                .or(wizardAsk)
                .first()
                .waitFor({ timeout: DIALOG_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (opened) break
            if (attempt === 3) throw new Error('Mở /patients/registration mà không thấy hộp mở đầu nào')
        }
        if (await verification.isVisible()) {
            await verification.locator('[data-fkey="F10"]').click()
            await step()
        }
        await wizardAsk.getByRole('button', { name: 'いいえ', exact: true }).click()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await step()

        await fkey('F10').click()
        await step()
        await expect(prompt(), 'WinForm: 新患 luôn hỏi 「患者データは変更されています。保存しますか？」').toBeVisible({
            timeout: 10_000,
        })
        await prompt().getByRole('button', { name: 'いいえ', exact: true }).click()
    })

    // BỎ QUA — web CỐ Ý lệch WinForm (xác nhận 2026-11-03): F12 mở thẳng MainMenuDialog, hỏi lưu
    // chỉ SAU khi chọn mục (patient-detail-form.tsx onSelect → handleExit). WinForm hỏi TRƯỚC rồi mới
    // mở MENU (frm201001.cs:751). Lưu ý: source app tự ghi KNOWN ISSUE 「編集 after a change → F12
    // メニュー: no prompt is shown and the edits are lost」 — TC này chỉ đo thứ tự, không đo chuyện đó.
    test.skip('TC-8 (parity) — F12 khi đã sửa: hỏi lưu TRƯỚC, chưa mở menu', async () => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân 編集')
        await openDirty()
        await fkey('F12').click()
        await step()
        // MainMenuDialog — main-menu-dialog.tsx:185 phụ đề 「メインメニュー」.
        const menu = page.getByRole('dialog').filter({ hasText: 'メインメニュー' })
        // frm201001.cs:751 — ExitWithoutSaving trước showForm(MENU).
        const shown = await prompt()
            .or(menu)
            .first()
            .waitFor({ timeout: DIALOG_TIMEOUT })
            .then(() => true)
            .catch(() => false)
        expect(shown, 'F12 không mở gì cả').toBe(true)
        const promptFirst = await prompt().isVisible()
        // Dọn để không rò sang TC sau.
        if (promptFirst) await prompt().getByRole('button', { name: 'キャンセル', exact: true }).click()
        else await page.keyboard.press('Escape')
        expect(promptFirst, 'F12 mở menu trước khi hỏi lưu — WinForm hỏi trước').toBe(true)
    })

    test('TC-9 (parity) — 編集 bệnh nhân trống 担当医: KHÔNG tự điền mặc định, F10 không hỏi', async () => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân 編集')
        await openPatientRegistration(page, BLANK_DR_PAT_NO)
        // Đợi mọi query (detail, patConfig) về hết — sau mốc này không còn gì tự đổi form.
        await page.waitForLoadState('networkidle')
        const attDr = page
            .locator('div')
            .filter({ has: page.locator('label').filter({ hasText: /^担当医$/ }) })
            .last()
            .getByRole('combobox')
            .first()
        const shown = (await attDr.innerText()).trim()
        console.log(`担当医 của bệnh nhân trống sau khi nạp: 「${shown}」`)
        await step()
        // OtherInfo.setDefaultData chỉ chạy ở Insert (frm201001.cs:259). 「院」 là
        // def_att_dr của tenant test (thấy trên ảnh 2026-10-26).
        expect.soft(shown, 'web điền 担当医 mặc định vào bệnh nhân 編集').not.toBe('院')

        await fkey('F10').click()
        await step()
        const asked = await prompt()
            .waitFor({ timeout: 5_000 })
            .then(() => true)
            .catch(() => false)
        if (asked) await prompt().getByRole('button', { name: 'いいえ', exact: true }).click()
        expect(asked, 'chưa sửa gì mà web vẫn hỏi lưu (mặc định tự điền bị tính là thay đổi)').toBe(false)
    })
})
