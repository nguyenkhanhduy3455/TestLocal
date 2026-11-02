import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { allowSave } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 5: F9 登録 đi tới cuối (hộp xác nhận lưu + chuyển màn).
 *
 * Chuỗi VALIDATE của F9 đã có spec riêng (msgtbl-register-f9-parity,
 * msgtbl-date-insurer-parity); lưu dưới số giữ chỗ ở pat-no-slot; audit ở
 * patient-registration-audit-log. Ở đây chỉ đo phần SAU validate.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :938 `F9Proc`: chkInputDataMed → chkInputDataMain → rồi
 *      · Insert ⇒ ShowOKCancelMsg Q00001 「登録してよろしいですか？」 (catalog:1610);
 *        OK ⇒ insertProc.
 *      · Update ⇒ ShowYesNoCancelMsg「患者データは、変更されて(いません|います)。保存しますか？」
 *        (catalog:1611, nút mặc định Button1 = はい): はい ⇒ updateProc; いいえ ⇒
 *        sts=true (rời màn, KHÔNG lưu); キャンセル ⇒ ở lại.
 *  - :540 `btnF9_Click`: F9Proc true ⇒ về màn trước (CommonHistory) và đóng.
 *  - :2508 Q00200 一般 (6〜69 tuổi) 負担割合 ≠ 30: ShowOKCancelMsg (nút OK / Cancel,
 *      catalog:1651), số đổi sang TOÀN GÓC bằng `StrConv(…, VbStrConv.Wide)` ⇒
 *      「負担割合に ０ が入力されています。続行してよろしいですか？」.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web
 * ═══════════════════════════════════════════════════════════════════════════
 *  - patient-detail-form.tsx:1186 Update ⇒ `yesNoCancel("患者データは、変更されて${dirty?
 *      'います':'いません'}。保存しますか？")` (không đặt nút mặc định); 'no' ⇒ finishSave
 *      (rời màn); :1197 Insert ⇒ `okCancel(Q00001)`.
 *  - :1253 tạo xong ⇒ toast 「登録しました。」 + finishSave ⇒ onBack (/patients).
 *  - lib/wizard-validation.ts:1018 Q00200 一般 = `ja.Q00200_BurRateGeneral(String(burRate))`
 *      — số ASCII; đi qua `runConfirmSteps(…, confirmDialog)` ⇒ nút はい/いいえ
 *      (đo ở exit-guard 2026-10-26: 「負担割合に 0 が… はい いいえ」) ⇒ TC-6 đo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990898: bệnh nhân 編集 (tên có dấu cách, br_dt 2000-01-01, 担当医/衛生士 1/100,
 *    負担割合 để trống ⇒ F9 luôn qua Q00200 一般 — chính là cái TC-6 đo).
 *  - TC-3 (sửa + lưu) và TC-5 (新規 lưu) GHI THẬT ⇒ cần TEST_ALLOW_SAVE=1. Bệnh nhân
 *    TC-5 tạo ra mang số THẬT do BE cấp; afterAll xoá nó ở mọi bảng có pat_no — chỉ
 *    khi `person.created_at` sau lúc spec bắt đầu (như pat-no-slot).
 *
 * Hai khối: 「cơ bản」 SERIAL; 「parity」 KHÔNG serial.
 */

const DIALOG_TIMEOUT = 30_000

const PAT_NO = String(SEED_PAT_NO_BASE + 898)
const NEW_PHONE = '090-0000-0898'
const NEW_NAME = 'イーツーイー　新規'
const NEW_KANA = 'いーつーいー　しんき'

const Q00001 = '登録してよろしいですか？'
const UNCHANGED = '患者データは、変更されていません。保存しますか？'
const CHANGED = '患者データは、変更されています。保存しますか？'
/** frm201001.cs:2508 — 負担割合 0 đổi toàn góc thành 「０」. */
const Q00200_BUR_GENERAL_WINFORM = '負担割合に ０ が入力されています。続行してよろしいですか？'

test.describe.configure({ retries: 0, timeout: 180_000 })

const startedAt = new Date()
/** Số bệnh nhân TC-5 đã tạo — afterAll xoá. */
const created: number[] = []

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: Number(PAT_NO), patNm: 'イーツーイー　保存', patKn: 'いーつーいー　ほぞん' })
    await withDb(async (c) => {
        await c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = $1`, [Number(PAT_NO)])
        await c.query('UPDATE person SET att_dr = 1, att_st = 100 WHERE pat_no = $1', [Number(PAT_NO)])
    })
})

test.afterAll(async () => {
    if (!dbEnabled) return
    await deleteTestPatient(Number(PAT_NO))
    for (const n of created) await purgeCreatedPatient(n).catch((e) => console.log(e))
})

/** Xoá bệnh nhân DO SPEC TẠO ở mọi bảng có `pat_no`, kể cả archive + audit_log. */
async function purgeCreatedPatient(patNo: number): Promise<void> {
    await withDb(async (c) => {
        const mine = await c.query('SELECT 1 FROM person WHERE pat_no = $1 AND created_at >= $2', [
            patNo,
            startedAt,
        ])
        if ((mine.rowCount ?? 0) === 0) throw new Error(`purgeCreatedPatient: ${patNo} không do spec tạo — không xoá`)
        const tables = await c.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND column_name = 'pat_no'
              ORDER BY table_name LIKE '%\\_deleted'`,
        )
        for (const { table_name } of tables.rows) {
            await c.query(`DELETE FROM ${table_name} WHERE pat_no::text = $1`, [String(patNo)])
        }
        await c.query(`DELETE FROM audit_log WHERE created_at >= $1 AND (meta_json->>'patNo') = $2`, [
            startedAt,
            String(patNo),
        ])
    })
}

async function phoneInDb(): Promise<string | null> {
    return withDb(async (c) => {
        const r = await c.query<{ tel_1: string | null }>(
            'SELECT tel_1 FROM insurance WHERE pat_no = $1 ORDER BY pat_br DESC LIMIT 1',
            [Number(PAT_NO)],
        )
        return r.rows[0]?.tel_1 ?? null
    })
}

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const fkey = (k: string): Locator => page().locator('main').locator(`[data-fkey="${k}"]`)
    const top = (): Locator => page().getByRole('alertdialog').first()
    const alert = (text: string): Locator => page().getByRole('alertdialog').filter({ hasText: text })
    const button = (dlg: Locator, name: string): Locator => dlg.getByRole('button', { name, exact: true })
    const atPatientList = () =>
        expect(page().getByRole('heading', { name: /患\s*者\s*選\s*択/ })).toBeVisible({ timeout: DIALOG_TIMEOUT })

    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

    /**
     * F9 rồi đồng ý (はい/OK) mọi hộp xác nhận của chuỗi validate cho tới khi gặp hộp
     * chứa `target`. Trả mọi hộp đã đi qua (để in khi đỏ / để TC parity đọc).
     * Gặp hộp chỉ có OK mà không phải target = lỗi validate ⇒ ném kèm danh sách.
     */
    async function f9Until(target: string): Promise<string[]> {
        const seen: string[] = []
        await fkey('F9').click()
        for (let i = 0; i < 10; i++) {
            await expect(top(), `F9: chờ hộp kế tiếp (đã qua: ${seen.join(' → ')})`).toBeVisible({
                timeout: DIALOG_TIMEOUT,
            })
            const text = flat(await top().innerText())
            if (text.includes(target)) return seen
            seen.push(text)
            const labels = (await top().getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
            if (labels.length <= 1) throw new Error(`F9 dừng ở lỗi validate 「${text}」 trước khi tới 「${target}」`)
            await top().getByRole('button', { name: /^(はい|OK)$/ }).first().click()
            // Chờ ĐÚNG hộp vừa bấm biến mất — bỏ tiêu đề 「お茶コン」 chung của mọi hộp.
            await expect(alert(text.replace(/^お茶コン\s*/, '').slice(0, 20))).toHaveCount(0)
        }
        throw new Error(`F9 đi qua 10 hộp mà chưa thấy 「${target}」: ${seen.join(' → ')}`)
    }
    return { fkey, top, alert, button, atPatientList, flat, f9Until }
}

test.describe('患者登録 (frm201001) — F9 登録: cơ bản', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { alert, button, atPatientList, f9Until } = helpers(() => page)

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

    test('TC-1 — 編集 chưa sửa: F9 hỏi 「…変更されていません。保存しますか？」, mặc định はい; キャンセル ở lại', async () => {
        await openPatientRegistration(page, PAT_NO)
        await step()
        await f9Until(UNCHANGED)
        const dlg = alert(UNCHANGED)
        await expect(dlg.getByRole('button', { name: /^(はい|いいえ|キャンセル)$/ })).toHaveText([
            'はい',
            'いいえ',
            'キャンセル',
        ])
        // catalog:1611 — ShowYesNoCancelMsg không khai nút mặc định ⇒ Button1.
        await expect(button(dlg, 'はい')).toBeFocused()
        await step()
        await button(dlg, 'キャンセル').click()
        await expect(dlg).toBeHidden()
        await expect(page).toHaveURL(/\/patients\/registration/)
    })

    test('TC-2 — 編集 chưa sửa: いいえ ⇒ rời về 患者選択, không lưu', async () => {
        await f9Until(UNCHANGED)
        await button(alert(UNCHANGED), 'いいえ').click()
        await step()
        await atPatientList()
        expect(await phoneInDb()).toBeNull()
    })

    test('TC-3 — 編集 đã sửa: hỏi 「…変更されています。…」, はい ⇒ lưu, về 患者選択 (TEST_ALLOW_SAVE)', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: はい ghi thật bệnh nhân seed')
        await openPatientRegistration(page, PAT_NO)
        await patientFieldInput(page, '電話番号').fill(NEW_PHONE)
        await step()
        await f9Until(CHANGED)
        await button(alert(CHANGED), 'はい').click()
        await step()
        await atPatientList()
        await expect.poll(phoneInDb).toBe(NEW_PHONE)
    })

    test('TC-4 — 新規: F9 tới Q00001 (OK/キャンセル); キャンセル ⇒ ở lại, không tạo', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: TC-5 nối tiếp sẽ ghi thật')
        const verification = page.getByRole('dialog').filter({ hasText: /オ\s*ン\s*ラ\s*イ\s*ン/ })
        const wizardAsk = alert('新規登録ウィザードを表示しますか？')
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
        if (await verification.isVisible()) await verification.locator('[data-fkey="F10"]').click()
        await button(wizardAsk, 'いいえ').click()

        const main = page.locator('main')
        await main.locator('[data-field="patNm"] input').first().fill(NEW_NAME)
        await main.locator('[data-field="patKn"] input').first().fill(NEW_KANA)
        const birth = main.locator('[data-field="birth"]')
        // Mặc định 元号 của 生年月日 là 昭和 (patConfig, thấy trên ảnh 2026-10-26).
        await expect(birth.getByRole('combobox', { name: '元号' })).toHaveText('昭和')
        await birth.getByRole('textbox', { name: '和暦年' }).fill('55')
        await birth.getByRole('textbox', { name: '月' }).fill('1')
        await birth.getByRole('textbox', { name: '日' }).fill('1')
        await step()

        const seen = await f9Until(Q00001)
        console.log(`新規 F9 trước Q00001: ${seen.map((s) => `「${s}」`).join(' → ') || '(không có)'}`)
        await expect(alert(Q00001).getByRole('button', { name: /^(OK|キャンセル)$/ })).toHaveText(['OK', 'キャンセル'])
        await button(alert(Q00001), 'キャンセル').click()
        await step()
        await expect(page).toHaveURL(/\/patients\/registration/)
        const shown = (await main.getByText(/^≪患者番号：\d+≫$/).innerText()).match(/\d+/)![0]
        const exists = await withDb((c) => c.query('SELECT 1 FROM person WHERE pat_no = $1', [Number(shown)]))
        expect(exists.rowCount, 'キャンセル mà vẫn tạo bệnh nhân').toBe(0)
    })

    test('TC-5 — 新規: Q00001 → OK ⇒ tạo bệnh nhân, về 患者選択', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1')
        const created201 = page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/tenant/patients'),
            { timeout: DIALOG_TIMEOUT },
        )
        await f9Until(Q00001)
        await button(alert(Q00001), 'OK').click()
        const res = await created201
        expect(res.status()).toBeLessThan(300)
        const patNo = Number((await res.json()).data.patNo)
        created.push(patNo)
        await step()
        await atPatientList()
        const row = await withDb((c) =>
            c.query<{ pat_nm: string }>('SELECT pat_nm FROM insurance WHERE pat_no = $1', [patNo]),
        )
        expect(row.rows.map((r) => r.pat_nm)).toEqual([NEW_NAME])
    })
})

test.describe('患者登録 (frm201001) — F9 登録: parity', () => {
    let page: Page
    const { top, flat } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-6 (parity) — Q00200 負担割合: số toàn góc 「０」, nút OK / キャンセル', async () => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
        await openPatientRegistration(page, PAT_NO)
        await page.locator('main').locator('[data-fkey="F9"]').click()
        // Bệnh nhân seed: 6〜69 tuổi, 社保, 負担割合 trống ⇒ hộp đầu tiên là Q00200 一般.
        await expect(top()).toContainText('負担割合に', { timeout: DIALOG_TIMEOUT })
        const text = flat(await top().innerText())
        const labels = (await top().getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
        console.log(`Q00200: 「${text}」 nút=${labels.join('/')}`)
        await top().getByRole('button', { name: /^(キャンセル|いいえ)$/ }).first().click()
        expect.soft(labels, 'catalog:1651 — ShowOKCancelMsg').toEqual(['OK', 'キャンセル'])
        expect(text, 'frm201001.cs:2508 — StrConv Wide').toContain(Q00200_BUR_GENERAL_WINFORM)
    })
})
