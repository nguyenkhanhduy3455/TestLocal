import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 7: lớp Shift ở 編集 — Shift+F6 カルテ / F7 処置 / F8 口腔 /
 * F9 会計. (Lớp Shift ở 新規 đã đo ở patient-registration-entry TC-9.)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :616 SF8, :629 SF6 (ID205002), :577 SF7 (ID203002), :546 SF9 (ID204002) đều gọi
 *      :900 `callProj` ⇒ `F9Proc()` TRƯỚC (:903): validate (Q00200 負担割合…) rồi
 *      ShowYesNoCancelMsg「患者データは、変更されて(いません|います)。保存しますか？」 —
 *      kể cả khi KHÔNG sửa gì. はい ⇒ lưu rồi đi; いいえ ⇒ đi, không lưu; キャンセル ⇒ ở lại.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web (features/patients/components/patient-detail-form.tsx)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :1451 SF7 `handleShiftF7Treatment` ⇒ `onComplete(…)` — cùng chuỗi F9 ⇒ khớp WinForm.
 *  - :1428 SF6 / :1459 SF8 / :1400 SF9: `isFormDirty()` false ⇒ đi THẲNG (không validate,
 *      không hỏi) ⇒ TC-5/TC-6 đo; true ⇒ `yesNoCancel(ja.unsavedChangesConfirm('患者データ'))`
 *      = 「患者データは変更されています。保存しますか？」 (KHÔNG có 「、」, KHÔNG validate trước)
 *      ⇒ TC-7 đo.
 *  - Đích: SF6 ⇒ /medical-records/print (「カルテ（１号用紙）印刷」 chart-form1-page.tsx:974);
 *      SF8 ⇒ /oral-examinations/<patNo> (「口 腔 内 情 報」 oral-info-screen.tsx:1109);
 *      SF9 ⇒ overlay 「窓 口 精 算」 (counter-payment-detail.tsx:1838);
 *      SF7 ⇒ TreatmentEntryDetail ngay trong component (form bị display:none).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1) — KHÔNG lưu (mọi nhánh chọn いいえ / キャンセル)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990901: bệnh nhân 編集 (br_dt 2000-01-01, 担当医/衛生士 1/100). 負担割合 trống ⇒
 *    F9Proc luôn qua Q00200 一般 trước câu hỏi lưu.
 *
 * Hai khối: 「cơ bản」 SERIAL; 「parity」 KHÔNG serial.
 */

const DIALOG_TIMEOUT = 30_000

const PAT_NO = String(SEED_PAT_NO_BASE + 901)
const TYPED_TEL = '090-2222-0901'

const UNCHANGED = '患者データは、変更されていません。保存しますか？'
/** F9Proc (frm201001.cs:974) — có 「、」. */
const CHANGED_F9PROC = '患者データは、変更されています。保存しますか？'
/** Mọi câu hỏi lưu khi rời màn, có hoặc không có 「、」. */
const ANY_SAVE_PROMPT = /患者データは、?変更されて(い|いま)す/

// Seed DB ở beforeAll/afterAll cấp file. Config để fullyParallel + 4 worker ⇒ không ghim
// thì mỗi describe sang một worker, seed/xoá cùng bệnh nhân đụng nhau giữa các worker.
// 'default' = một worker, đúng thứ tự, nhưng test đỏ không kéo test sau skip theo.
test.describe.configure({ mode: 'default', retries: 0, timeout: 180_000 })

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: Number(PAT_NO), patNm: 'イーツーイー　シフト', patKn: 'いーつーいー　しふと' })
    await withDb(async (c) => {
        await c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = $1`, [Number(PAT_NO)])
        await c.query('UPDATE person SET att_dr = 1, att_st = 100 WHERE pat_no = $1', [Number(PAT_NO)])
    })
})

test.afterAll(async () => {
    if (dbEnabled) await deleteTestPatient(Number(PAT_NO))
})

async function phoneInDb(): Promise<string | null> {
    return withDb(async (c) => {
        const r = await c.query<{ tel_1: string | null }>('SELECT tel_1 FROM insurance WHERE pat_no = $1', [
            Number(PAT_NO),
        ])
        return r.rows[0]?.tel_1 ?? null
    })
}

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const main = () => page().locator('main')
    const fkey = (k: string): Locator => main().locator(`[data-fkey="${k}"]:visible`).first()
    const top = (): Locator => page().getByRole('alertdialog').first()
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
    const nameInput = (): Locator => main().locator('[data-field="patNm"] input').first()

    async function setShift(on: boolean): Promise<void> {
        const t = main().locator('button[aria-pressed]:visible').first()
        if ((await t.getAttribute('aria-pressed')) !== String(on)) await t.click()
        await expect(t).toHaveAttribute('aria-pressed', String(on))
    }

    /** Shift+Fn bằng nút ON/OFF. */
    async function pressShift(k: string): Promise<void> {
        await setShift(true)
        await fkey(k).click()
    }

    /**
     * Đồng ý (はい/OK) mọi hộp validate cho tới hộp khớp `target`. Trả `null` nếu
     * KHÔNG có hộp nào hiện trong `quietMs` (= màn đã đi thẳng, không hỏi).
     */
    async function untilPrompt(target: RegExp, quietMs = 5_000): Promise<string | null> {
        for (let i = 0; i < 8; i++) {
            const shown = await top()
                .waitFor({ timeout: i === 0 ? quietMs : DIALOG_TIMEOUT })
                .then(() => true)
                .catch(() => false)
            if (!shown) return null
            const text = flat(await top().innerText())
            if (target.test(text)) return text
            const labels = (await top().getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
            if (labels.length <= 1) throw new Error(`dừng ở lỗi validate 「${text}」`)
            await top().getByRole('button', { name: /^(はい|OK)$/ }).first().click()
            await expect(page().getByRole('alertdialog').filter({ hasText: text.replace(/^お茶コン\s*/, '').slice(0, 20) })).toHaveCount(0)
        }
        throw new Error('quá 8 hộp mà chưa tới câu hỏi lưu')
    }
    return { main, fkey, top, flat, nameInput, setShift, pressShift, untilPrompt }
}

test.describe('患者登録 (frm201001) — lớp Shift ở 編集: cơ bản', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { fkey, top, nameInput, setShift, pressShift, untilPrompt } = helpers(() => page)

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

    test('TC-1 — Shift+F7 処置 (chưa sửa): chạy chuỗi F9, hỏi 「…変更されていません。…」; キャンセル ở lại', async () => {
        await openPatientRegistration(page, PAT_NO)
        await step()
        await pressShift('F7')
        const text = await untilPrompt(/変更されていません/)
        expect(text, 'callProj ⇒ F9Proc luôn hỏi').toContain(UNCHANGED)
        await step()
        await top().getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        await expect(nameInput()).toBeVisible()
        await setShift(false)
    })

    test('TC-2 — Shift+F7 → いいえ: sang 処置入力, không lưu', async () => {
        await pressShift('F7')
        await untilPrompt(/変更されていません/)
        await top().getByRole('button', { name: 'いいえ', exact: true }).click()
        await step()
        await expect(nameInput(), 'form 患者登録 phải nhường chỗ cho 処置入力').toBeHidden({ timeout: DIALOG_TIMEOUT })
        expect(await phoneInDb()).toBeNull()
    })

    test('TC-3 — Shift+F6 カルテ (đã sửa): hỏi lưu; キャンセル ở lại, chữ còn nguyên', async () => {
        await openPatientRegistration(page, PAT_NO)
        await patientFieldInput(page, '電話番号').fill(TYPED_TEL)
        await step()
        await pressShift('F6')
        const text = await untilPrompt(ANY_SAVE_PROMPT)
        expect(text, 'đã sửa mà Shift+F6 không hỏi lưu').not.toBeNull()
        await top().getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(page).toHaveURL(/\/patients\/registration/)
        await expect(patientFieldInput(page, '電話番号')).toHaveValue(TYPED_TEL)
        await setShift(false)
    })

    test('TC-4 — Shift+F8 口腔 (đã sửa) → いいえ: sang 口腔内情報, không lưu', async () => {
        await pressShift('F8')
        await untilPrompt(ANY_SAVE_PROMPT)
        await top().getByRole('button', { name: 'いいえ', exact: true }).click()
        await step()
        await expect(page).toHaveURL(new RegExp(`/oral-examinations/${PAT_NO}`), { timeout: DIALOG_TIMEOUT })
        await expect(page.getByRole('heading', { name: /口\s*腔\s*内\s*情\s*報/ })).toBeVisible({ timeout: DIALOG_TIMEOUT })
        expect(await phoneInDb()).toBeNull()
        await expect(fkey('F9')).toBeVisible()
    })
})

test.describe('患者登録 (frm201001) — lớp Shift ở 編集: parity', () => {
    let page: Page
    let step: () => Promise<void>
    const { top, pressShift, untilPrompt } = helpers(() => page)

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

    for (const [tc, key, dest] of [
        ['TC-5', 'F6', 'カルテ'],
        ['TC-6', 'F9', '会計'],
    ] as const) {
        test(`${tc} (parity) — Shift+${key} ${dest} (chưa sửa): vẫn chạy F9Proc, hỏi 「…変更されていません。…」`, async () => {
            await openPatientRegistration(page, PAT_NO)
            await pressShift(key)
            const text = await untilPrompt(/変更されていません/)
            await step()
            if (text) await top().getByRole('button', { name: 'キャンセル', exact: true }).click()
            expect(text, `Shift+${key} đi thẳng sang ${dest}, không qua F9Proc (frm201001.cs:903)`).toContain(UNCHANGED)
        })
    }

    test('TC-7 (parity) — Shift+F6 (đã sửa): validate TRƯỚC rồi hỏi bằng câu của F9Proc 「患者データは、変更されています。…」', async () => {
        await openPatientRegistration(page, PAT_NO)
        await page.locator('main [data-field]').first().waitFor()
        await patientFieldInput(page, '電話番号').fill(TYPED_TEL)
        await pressShift('F6')
        // Hộp ĐẦU TIÊN: WinForm là Q00200 負担割合 (validate), web là câu hỏi lưu.
        await expect(top()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        const first = (await top().innerText()).replace(/\s+/g, ' ')
        const text = await untilPrompt(ANY_SAVE_PROMPT)
        console.log(`Shift+F6 đã sửa: hộp đầu 「${first}」; câu hỏi lưu 「${text}」`)
        if (text) await top().getByRole('button', { name: 'キャンセル', exact: true }).click()
        expect.soft(first, 'chưa validate (Q00200) mà đã hỏi lưu').toContain('負担割合に')
        expect(text).toContain(CHANGED_F9PROC)
    })
})
