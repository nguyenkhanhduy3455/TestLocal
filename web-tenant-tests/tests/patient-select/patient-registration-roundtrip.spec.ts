import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 6: F1 コピー và F3 保険者 / F4 事業所 / F7 介護保険
 * (rời sang màn khác rồi quay lại).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :302 F1 ⇒ dialog ID201009 (患者情報コピー); chọn ⇒ :1171 `copyProc` chép bệnh nhân
 *      nguồn vào tab đang chọn, XOÁ: 生年月日, 初回来院日, 担当医 (`dr = 0`), 衛生士
 *      (`staff = 0`), 紹介者, 主訴 1〜7, 氏名/カナ, 職業, 患者情報有効日, 診療開始/最終日…
 *      GIỮ: 性別, 住所, 電話, 保険/公費.
 *  - :515 F3 ⇒ 保険者一覧 (ID201007), :531 F4 ⇒ 事業所一覧 (ID201006), :575 F7 ⇒ 介護保険
 *      (src 2026-10-28: :587 `chkBirthdateInput` — tab 0 (枝番 mới nhất) chưa có 生年月日
 *      hợp lệ (`IsDate != True`, gõ dở cũng tính) ⇒ E00001「生年月日」, focus 生年月日, ở lại)
 *      (ID201031): cả ba `this.Hide()` rồi mở màn kia; quay về là `Show()` lại CHÍNH
 *      form đó ⇒ mọi chữ đang gõ, 患者番号, trạng thái "đã sửa" còn nguyên; không chạy
 *      lại `frm201001_Shown` (オンライン資格確認 / wizard không bật lại).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web
 * ═══════════════════════════════════════════════════════════════════════════
 *  - patient-detail-form.tsx:689 `handleCopy`: xoá 氏名/カナ/生年月日/患者情報有効日/
 *      職業/診療開始・最終日/conf_dt1; KHÔNG đụng `otherInfo` (担当医/衛生士/紹介者 giữ giá
 *      trị của form hiện tại) ⇒ TC-6 đo.
 *  - :1786 F4 ⇒ `setActiveScreen('business-location')` — màn con trong cùng component
 *      (form chỉ bị `display: none`).
 *  - :1511 F7 / :1521 F3 ⇒ `saveFormDraft()` rồi navigate sang route khác; quay về là
 *      MOUNT LẠI form và :940 khôi phục draft. Ở 新規 mount lại cũng chạy lại
 *      `usePatNoReservation` (:455) và hiệu ứng mở đầu (:438) ⇒ TC-7 đo.
 *  - patient-copy-dialog.tsx:203 tiêu đề 「患 者 情 報 コ ピ ー」; :313 F9 選択, F10 戻る.
 *  - benefit-provider-selection-screen.tsx:169 「保 険 者 選 択」 (F10 戻る :241);
 *    business-location-selection-dialog.tsx:219 「事 業 所 選 択」 (F10 :273);
 *    long-term-care-insurance-screen.tsx:1297 「介護保険登録（試用版）」 (F10 :1700 — chưa
 *    nhập gì thì quay về thẳng, :1101).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1) — KHÔNG F9, không ghi gì qua UI
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990899: bệnh nhân 編集 cho F3/F4/F7 (担当医/衛生士 1/100).
 *  - 990900: bệnh nhân NGUỒN cho F1 コピー — 電話番号 riêng để tìm đúng một người,
 *    担当医 = 16 (khác mặc định), 社保.
 *  Nhánh 新規: số 患者番号 giữ chỗ tự nhả sau 2 phút.
 *
 * Hai khối: 「cơ bản」 SERIAL; 「parity」 KHÔNG serial.
 */

const DIALOG_TIMEOUT = 30_000

const EDIT_PAT = String(SEED_PAT_NO_BASE + 899)
const COPY_SRC = String(SEED_PAT_NO_BASE + 900)
const SRC_TEL = '099-0000-0900'
const TYPED_TEL = '090-1111-0899'
const TYPED_NAME = 'ラウンド　トリップ'

test.describe.configure({ retries: 0, timeout: 180_000 })

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: Number(EDIT_PAT), patNm: 'イーツーイー　往復', patKn: 'いーつーいー　おうふく' })
    await seedTestPatient({ patNo: Number(COPY_SRC), patNm: 'イーツーイー　コピー元', patKn: 'いーつーいー　こぴーもと' })
    await withDb(async (c) => {
        await c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = ANY($1::int[])`, [
            [Number(EDIT_PAT), Number(COPY_SRC)],
        ])
        await c.query('UPDATE person SET att_dr = 1, att_st = 100 WHERE pat_no = $1', [Number(EDIT_PAT)])
        await c.query('UPDATE person SET att_dr = 16, att_st = 100, pat_tel_1 = $2 WHERE pat_no = $1', [
            Number(COPY_SRC),
            SRC_TEL,
        ])
        await c.query('UPDATE insurance SET tel_1 = $2 WHERE pat_no = $1', [Number(COPY_SRC), SRC_TEL])
    })
})

test.afterAll(async () => {
    if (!dbEnabled) return
    for (const n of [EDIT_PAT, COPY_SRC]) await deleteTestPatient(Number(n))
})

function helpers(getPage: () => Page) {
    const page = () => getPage()
    /** Phím F của thanh ĐANG HIỆN — F4 giữ form cũ trong DOM (display:none). */
    const fkey = (k: string): Locator => page().locator(`[data-fkey="${k}"]:visible`).first()
    const alert = (text: string): Locator => page().getByRole('alertdialog').filter({ hasText: text })
    const heading = (re: RegExp): Locator => page().getByRole('heading', { name: re })
    const phone = (): Locator => patientFieldInput(page(), '電話番号')
    const nameInput = (): Locator => page().locator('main [data-field="patNm"] input').first()
    const verification = (): Locator => page().getByRole('dialog').filter({ hasText: /オ\s*ン\s*ラ\s*イ\s*ン/ })
    const wizardAsk = (): Locator => alert('新規登録ウィザードを表示しますか？')
    const attDr = (): Locator =>
        page()
            .locator('div')
            .filter({ has: page().locator('label').filter({ hasText: /^担当医$/ }) })
            .last()
            .getByRole('combobox')
            .first()
    const birthCell = (name: '和暦年' | '月' | '日'): Locator =>
        page()
            .locator('main [data-field="birth"]:visible')
            .first()
            .getByRole('group', { name: '和暦日付' })
            .getByRole('textbox', { name })
    async function typeBirth(cells: [name: '和暦年' | '月' | '日', value: string][]): Promise<void> {
        for (const [name, value] of cells) {
            await birthCell(name).click()
            await birthCell(name).pressSequentially(value)
            await expect(birthCell(name)).toHaveValue(value)
        }
    }
    const insKbn = (): Locator =>
        page()
            .locator('div')
            .filter({ has: page().locator('label').filter({ hasText: /^保険種別\s*\*?$/ }) })
            .last()
            .getByRole('combobox')
            .first()

    async function shownPatNo(): Promise<string> {
        const t = await page().locator('main').getByText(/^≪患者番号：\d+≫$/).innerText()
        return t.match(/\d+/)![0]
    }

    /** Mở 新規 và đi qua hai hộp mở đầu bằng いいえ. */
    async function openNewForm(): Promise<void> {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page().goto('/patients/registration', { waitUntil: 'domcontentloaded' })
            const opened = await verification()
                .or(wizardAsk())
                .first()
                .waitFor({ timeout: DIALOG_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (opened) break
            if (attempt === 3) throw new Error('Mở /patients/registration mà không thấy hộp mở đầu nào')
        }
        if (await verification().isVisible()) await verification().locator('[data-fkey="F10"]').click()
        await wizardAsk().getByRole('button', { name: 'いいえ', exact: true }).click()
        await expect(page().getByRole('alertdialog')).toHaveCount(0)
    }

    /** F1 コピー: tìm theo 電話 của bệnh nhân nguồn, chọn, F9. */
    async function copyFromSource(): Promise<void> {
        await fkey('F1').click()
        const dlg = page().getByRole('dialog').filter({ hasText: /患\s*者\s*情\s*報\s*コ\s*ピ\s*ー/ })
        await expect(dlg).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await dlg
            .locator('div')
            .filter({ has: page().locator('label').filter({ hasText: /^電話／携帯$/ }) })
            .last()
            .locator('input')
            .first()
            .fill(SRC_TEL)
        await dlg.getByRole('button', { name: '検索' }).click()
        await expect(dlg.getByText('1件')).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await dlg.getByText(/コピー元/).first().click()
        await dlg.locator('[data-fkey="F9"]').click()
        await expect(dlg).toBeHidden({ timeout: DIALOG_TIMEOUT })
    }
    return {
        fkey,
        alert,
        heading,
        phone,
        nameInput,
        verification,
        wizardAsk,
        attDr,
        insKbn,
        birthCell,
        typeBirth,
        shownPatNo,
        openNewForm,
        copyFromSource,
    }
}

test.describe('患者登録 (frm201001) — rời màn rồi quay lại: cơ bản', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { fkey, alert, heading, phone, nameInput, insKbn, openNewForm, copyFromSource } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-1 — F4 事業所 → F10: về form, chữ đang gõ còn nguyên', async () => {
        await openPatientRegistration(page, EDIT_PAT)
        await phone().fill(TYPED_TEL)
        await step()
        await fkey('F4').click()
        await expect(heading(/事\s*業\s*所\s*選\s*択/)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await fkey('F10').click()
        await expect(phone()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await expect(phone()).toHaveValue(TYPED_TEL)
    })

    test('TC-2 — F3 保険者 → F10: về đúng bệnh nhân, chữ đang gõ còn nguyên', async () => {
        await fkey('F3').click()
        await expect(heading(/保\s*険\s*者\s*選\s*択/)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await fkey('F10').click()
        await expect(page.locator('main').getByText(`≪患者番号：${EDIT_PAT}≫`)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await expect(phone()).toHaveValue(TYPED_TEL)
    })

    test('TC-3 — F7 介護保険 → F10 (chưa nhập gì): về thẳng, chữ đang gõ còn nguyên', async () => {
        await fkey('F7').click()
        await expect(heading(/介護保険登録/)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await fkey('F10').click()
        await expect(page.locator('main').getByText(`≪患者番号：${EDIT_PAT}≫`)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await expect(phone()).toHaveValue(TYPED_TEL)
    })

    test('TC-4 — sau ba vòng, F10 vẫn hỏi lưu (trạng thái "đã sửa" không mất)', async () => {
        await fkey('F10').click()
        const ask = alert('患者データは変更されています。保存しますか？')
        await expect(ask).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await ask.getByRole('button', { name: 'いいえ', exact: true }).click()
        await expect(heading(/患\s*者\s*選\s*択/)).toBeVisible({ timeout: DIALOG_TIMEOUT })
    })

    test('TC-5 — 新規 F1 コピー: chép 保険種別 + 電話, xoá 氏名 / 生年月日', async () => {
        await openNewForm()
        await copyFromSource()
        await step()
        await expect(nameInput()).toHaveValue('')
        await expect(
            page.locator('main [data-field="birth"]').getByRole('textbox', { name: '和暦年' }),
        ).toHaveValue('')
        await expect(insKbn()).toHaveText('社保')
        await expect(phone()).toHaveValue(SRC_TEL)
    })
})

test.describe('患者登録 (frm201001) — rời màn rồi quay lại: parity', () => {
    let page: Page
    let step: () => Promise<void>
    const {
        fkey,
        alert,
        heading,
        nameInput,
        verification,
        wizardAsk,
        attDr,
        birthCell,
        typeBirth,
        shownPatNo,
        openNewForm,
        copyFromSource,
    } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-6 (parity) — F1 コピー không mang 担当医 của người nguồn', async () => {
        await openNewForm()
        const before = (await attDr().innerText()).trim()
        await copyFromSource()
        await step()
        const shown = (await attDr().innerText()).trim()
        console.log(`担当医 trước コピー: 「${before}」, sau: 「${shown}」`)
        // frm201001.cs:1188 copyData.person.dr = 0, nhưng FlaUI đo (PrC4, 2026-10-27): sau コピー
        // WinForm vẫn hiện mặc định 新規 「院」 (người nguồn mang 「副」) — giữ nguyên, không để trống.
        expect(shown, 'sau コピー giữ 担当医 mặc định của 新規').toBe(before)
    })

    test('TC-7 (parity) — 新規 F7 → F10: giữ 患者番号, không bật lại hộp mở đầu, giữ chữ đang gõ', async () => {
        await openNewForm()
        const before = await shownPatNo()
        await nameInput().fill(TYPED_NAME)
        // chkBirthdateInput (src 2026-10-28) chặn F7 khi chưa có 生年月日 — xem TC-8.
        await typeBirth([
            ['和暦年', '55'],
            ['月', '1'],
            ['日', '1'],
        ])
        await step()
        await fkey('F7').click()
        await expect(heading(/介護保険登録/)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await fkey('F10').click()
        await expect(nameInput().or(verification()).or(wizardAsk()).first()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        const reopened = (await verification().isVisible()) || (await wizardAsk().isVisible())
        // Dọn để đọc được form.
        if (await verification().isVisible()) await verification().locator('[data-fkey="F10"]').click()
        if (await wizardAsk().isVisible()) await wizardAsk().getByRole('button', { name: 'いいえ', exact: true }).click()
        const after = await shownPatNo()
        console.log(`患者番号 trước F7: ${before}, sau F10: ${after}; hộp mở đầu bật lại: ${reopened}`)
        expect.soft(reopened, 'quay về bật lại オンライン資格確認 / wizard').toBe(false)
        expect.soft(after, 'quay về đổi 患者番号').toBe(before)
        expect(await nameInput().inputValue(), 'quay về mất 氏名 đang gõ').toBe(TYPED_NAME)
    })

    /** F7 bị chặn: E00001「生年月日」, OK ⇒ ở lại 患者登録, focus nằm trong ô 生年月日. */
    async function expectBirthBlocked(): Promise<void> {
        await fkey('F7').click()
        const err = alert('生年月日が入力されていません。')
        await expect(err).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await err.getByRole('button', { name: 'OK' }).click()
        await expect(heading(/介護保険登録/)).toHaveCount(0)
        await expect(nameInput()).toHaveValue(TYPED_NAME)
        await expect(page.locator('main [data-field="birth"]:visible').first().locator(':focus')).toHaveCount(1)
    }

    test('TC-8 (parity) — 新規 生年月日 trống ⇒ F7 báo E00001, không sang 介護保険', async () => {
        await openNewForm()
        await nameInput().fill(TYPED_NAME)
        await expect(birthCell('和暦年')).toHaveValue('')
        await expectBirthBlocked()
    })

    test('TC-9 (parity) — 生年月日 gõ dở (chỉ năm) ⇒ F7 vẫn báo E00001', async () => {
        await openNewForm()
        await nameInput().fill(TYPED_NAME)
        await typeBirth([['和暦年', '55']])
        await expectBirthBlocked()
    })
})
