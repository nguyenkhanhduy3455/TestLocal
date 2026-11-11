import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { openPatientRegistration } from '../_shared/entry'
import { allowSave } from '../_shared/env'
import { expectSeverity } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 4: F8 削除 (xoá CẢ bệnh nhân).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :611 `btnF8_Click`: `chkDelete()` TRƯỚC, rồi ShowOKCancelMsg Q00003
 *      「削除してよろしいですか？」 (tools/winform-dialog-catalog.tsv:1604); OK ⇒
 *      `deleteProc` ⇒ về màn trước (`CommonHistory`) và đóng.
 *  - :1722 / :2084 `chkDelete`: có trn_trn / unpaid / acc_dat của bệnh nhân ⇒
 *      ShowErrorMsg E00004 「関連データが存在する為、削除できません。」 (✕ đỏ — catalog:1616),
 *      KHÔNG hỏi Q00003.
 *  - :1741 `deleteProc`: DELETE mọi bảng có pat_no (PERSON, INSURANCE, SIGA, KON…).
 *  - Insert: `_patNo` là số mới, chưa có dữ liệu ⇒ chkDelete qua ⇒ Q00003 ⇒ OK là đóng màn.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web
 * ═══════════════════════════════════════════════════════════════════════════
 *  - patient-detail-form.tsx:1289 `handleDelete`:
 *      · 新規 ⇒ `okCancel(Q00003)`; OK ⇒ onBack (/patients).
 *      · 編集 ⇒ GET /patients/{patNo}/deletable; chặn ⇒ `alertDialog(message)` KHÔNG
 *        truyền severity (⇒ TC-7 đo icon); qua ⇒ Q00003 ⇒ DELETE ⇒ toast + onBack.
 *  - api PatientDeleteGuard.cs:15 `CheckWholePatientAsync`: trn_trn / unpaid / acc_dat
 *      ⇒ 「関連データが存在する為、削除できません。」.
 *  - patient-side-panel.tsx:901 F8 cần quyền Patients.Delete (admin có).
 *  - shared/locales/ja-msgtbl.ts:174 Q00003 = 「削除してよろしいですか？」.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990895: có MỘT dòng trn_trn.  - 990896: có MỘT dòng unpaid.
 *  - 990897: sạch — TC-6 xoá thật qua UI (cần TEST_ALLOW_SAVE=1).
 *  afterAll xoá cả ba ở MỌI bảng có pat_no, kể cả `<bảng>_deleted` (trigger archive
 *  của DELETE web) và audit_log — chỉ trong dải seed 990000+.
 * Nhánh 新規 không ghi gì: số 患者番号 giữ chỗ tự nhả sau 2 phút.
 *
 * Hai khối: 「cơ bản」 SERIAL; 「parity」 KHÔNG serial (đỏ cái nào không kéo cái khác).
 */

const DIALOG_TIMEOUT = 30_000

const WITH_TRN = String(SEED_PAT_NO_BASE + 895)
const WITH_UNPAID = String(SEED_PAT_NO_BASE + 896)
const CLEAN = String(SEED_PAT_NO_BASE + 897)
const SEEDED = [WITH_TRN, WITH_UNPAID, CLEAN]

const Q00003 = '削除してよろしいですか？'
const E00004 = '関連データが存在する為、削除できません。'

// Seed DB ở beforeAll/afterAll cấp file. Config để fullyParallel + 4 worker ⇒ không ghim
// thì mỗi describe sang một worker, seed/xoá cùng bệnh nhân đụng nhau giữa các worker.
// 'default' = một worker, đúng thứ tự, nhưng test đỏ không kéo test sau skip theo.
test.describe.configure({ mode: 'default', retries: 0, timeout: 180_000 })

/** Xoá bệnh nhân seed ở MỌI bảng có pat_no (kể cả archive) + audit_log của nó. */
async function purgeSeedPatient(patNo: number): Promise<void> {
    if (patNo < SEED_PAT_NO_BASE) throw new Error(`purgeSeedPatient: ${patNo} ngoài dải seed`)
    await withDb(async (c) => {
        const tables = await c.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND column_name = 'pat_no'
              ORDER BY table_name LIKE '%\\_deleted'`,
        )
        for (const { table_name } of tables.rows) {
            await c.query(`DELETE FROM ${table_name} WHERE pat_no::text = $1`, [String(patNo)])
        }
        await c.query(`DELETE FROM audit_log WHERE (meta_json->>'patNo') = $1`, [String(patNo)]).catch(() => undefined)
    })
}

async function rowCounts(patNo: string): Promise<Record<string, number>> {
    return withDb(async (c) => {
        const out: Record<string, number> = {}
        for (const t of ['person', 'insurance', 'siga', 'kon']) {
            const r = await c.query(`SELECT count(*)::int AS n FROM ${t} WHERE pat_no = $1`, [Number(patNo)])
            out[t] = r.rows[0].n as number
        }
        return out
    })
}

test.beforeAll(async () => {
    if (!dbEnabled) return
    for (const n of SEEDED) {
        await purgeSeedPatient(Number(n))
        await seedTestPatient({ patNo: Number(n), patNm: 'イーツーイー　削除', patKn: 'いーつーいー　さくじょ' })
    }
    await seedTreatmentRows(Number(WITH_TRN), '2005-06-01', [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40 }])
    // Câu INSERT tối thiểu như list-chrome-seed.ts.
    await withDb((c) =>
        c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, acc_tm, pat_br, claim_amt, score)
             VALUES (CURRENT_DATE, 1, $1, 1, NOW(), 1, 1000, 100)`,
            [Number(WITH_UNPAID)],
        ),
    )
})

test.afterAll(async () => {
    if (!dbEnabled) return
    for (const n of SEEDED) await purgeSeedPatient(Number(n))
})

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const fkey = (k: string): Locator => page().locator('main').locator(`[data-fkey="${k}"]`)
    const alert = (text: string): Locator => page().getByRole('alertdialog').filter({ hasText: text })
    const button = (dlg: Locator, name: string): Locator => dlg.getByRole('button', { name, exact: true })
    const atPatientList = () =>
        expect(page().getByRole('heading', { name: /患\s*者\s*選\s*択/ })).toBeVisible({ timeout: DIALOG_TIMEOUT })
    const nameInput = () => page().locator('main [data-field="patNm"] input').first()

    /** Mở 新規, đi qua オンライン資格確認 + confirm wizard (いいえ). Trả số đang hiện. */
    async function openNewForm(): Promise<string> {
        const verification = page().getByRole('dialog').filter({ hasText: /オ\s*ン\s*ラ\s*イ\s*ン/ })
        const wizardAsk = alert('新規登録ウィザードを表示しますか？')
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page().goto('/patients/registration', { waitUntil: 'domcontentloaded' })
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
        await expect(page().getByRole('alertdialog')).toHaveCount(0)
        const text = await page().locator('main').getByText(/^≪患者番号：\d+≫$/).innerText()
        return text.match(/\d+/)![0]
    }
    return { fkey, alert, button, atPatientList, nameInput, openNewForm }
}

test.describe('患者登録 (frm201001) — F8 削除: cơ bản', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { fkey, alert, button, atPatientList, nameInput, openNewForm } = helpers(() => page)
    let newPatNo = ''

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-1 — 新規: F8 hỏi Q00003 (OK/キャンセル); キャンセル ở lại màn', async () => {
        newPatNo = await openNewForm()
        await step()
        await fkey('F8').click()
        await expect(alert(Q00003)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await expect(alert(Q00003).getByRole('button', { name: /^(OK|キャンセル)$/ })).toHaveText(['OK', 'キャンセル'])
        await step()
        await button(alert(Q00003), 'キャンセル').click()
        await expect(alert(Q00003)).toBeHidden()
        await expect(nameInput()).toBeVisible()
    })

    test('TC-2 — 新規: F8 → OK rời về 患者選択, không tạo bệnh nhân', async () => {
        await fkey('F8').click()
        await button(alert(Q00003), 'OK').click()
        await step()
        await atPatientList()
        if (dbEnabled) expect((await rowCounts(newPatNo)).person, `không được có person ${newPatNo}`).toBe(0)
    })

    test.describe('編集', () => {
        test.beforeEach(() => {
            skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
        })

        for (const [tc, patNo, what] of [
            ['TC-3', WITH_TRN, 'có 処置 (trn_trn)'],
            ['TC-4', WITH_UNPAID, 'có 未精算 (unpaid)'],
        ] as const) {
            test(`${tc} — ${what}: E00004, không hỏi Q00003, DB nguyên`, async () => {
                await openPatientRegistration(page, patNo)
                await step()
                await fkey('F8').click()
                await expect(alert(E00004)).toBeVisible({ timeout: DIALOG_TIMEOUT })
                await step()
                await button(alert(E00004), 'OK').click()
                await expect(alert(Q00003)).toHaveCount(0)
                await expect(page).toHaveURL(/\/patients\/registration/)
                expect((await rowCounts(patNo)).person).toBe(1)
            })
        }

        test('TC-5 — bệnh nhân sạch: Q00003 → キャンセル ở lại, DB nguyên', async () => {
            await openPatientRegistration(page, CLEAN)
            await fkey('F8').click()
            await expect(alert(Q00003)).toBeVisible({ timeout: DIALOG_TIMEOUT })
            await step()
            await button(alert(Q00003), 'キャンセル').click()
            await expect(page).toHaveURL(/\/patients\/registration/)
            expect((await rowCounts(CLEAN)).person).toBe(1)
        })

        test('TC-6 — bệnh nhân sạch: Q00003 → OK xoá hết, về 患者選択 (TEST_ALLOW_SAVE)', async () => {
            skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: OK xoá thật bệnh nhân seed')
            await fkey('F8').click()
            await button(alert(Q00003), 'OK').click()
            await step()
            await atPatientList()
            await expect
                .poll(() => rowCounts(CLEAN), { message: 'deleteProc phải xoá mọi bảng của bệnh nhân' })
                .toEqual({ person: 0, insurance: 0, siga: 0, kon: 0 })
        })
    })
})

test.describe('患者登録 (frm201001) — F8 削除: parity', () => {
    let page: Page
    const { fkey, alert, button } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-7 (parity) — E00004 hiện icon ✕ đỏ (ShowErrorMsg)', async () => {
        await openPatientRegistration(page, WITH_TRN)
        await fkey('F8').click()
        await expect(alert(E00004)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        try {
            await expectSeverity(page, 'error', 'frm201001.cs:1731 ShowErrorMsg("E00004")')
        } finally {
            await button(alert(E00004), 'OK').click()
        }
    })
})
