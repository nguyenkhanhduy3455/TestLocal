import { type Page } from '@playwright/test'

import {
    type AgentConnector,
    type AgentSession,
    WIN_LINKAGE_ROOT,
    openAgentSession,
    winListDeviceFiles,
    winPrepareDeviceDir,
    winReadShiftJis,
    winRemoveDeviceDir,
} from '../_shared/agent-linkage'
import { AGENT_AVAILABLE, AGENT_SKIP_REASON } from '../_shared/agent-print'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { allowSave } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'

/**
 * 機器連携 — lưu bệnh nhân (患者登録 F9) ⇒ agent ghi file thiết bị.
 *   - Kintone (linkCode 25, category medical-support): `upload.csv`, 65 cột, dòng tiêu đề
 *     thêm `*` đầu khi 編集 (Update), không có `*` khi 新規 (Add).
 *   - 達人プラス (linkCode 24, category xray): `{patNo}.csv`, 27 cột.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — agent (apps/agent/src/Ochacom.Agent/Linkage/Connectors)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - KintoneConnector.cs: ResolveFileName = "upload.csv"; Format: header 65 cột, `*` + header
 *    khi `ChangeMode.Update`; values[0]=PatNo, [1..2]=họ/tên, [12]=PatTel1, [22]=初回来院日.
 *    AfterSuccessfulWrite chạy `ex.bat` cùng thư mục ⇒ spec tạo `ex.bat` rỗng.
 *  - TatsujinPlusCsvConnector.cs: `{patNo}.csv`, 27 token; [0]=patNo, [1]="1", [2]=patNo, [23]=TEL.
 *  - FileDropConnectorBase.ExistingFileGuard: file đã có và Overwrite=false ⇒ `file_exists` ⇒
 *    FE hỏi 上書き (agent-linkage.ts existingFileMessage).
 *  - File ghi bằng Shift_JIS.
 * FACT — web: person-mutations.ts `sendLinkageChange` chạy SAU khi lưu xong, mỗi category một lượt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ĐIỀU KIỆN & DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 *  - TEST_DB=1, TEST_ALLOW_SAVE=1, TEST_AGENT=1 (agent ochacom-win qua tunnel, xem agent-linkage.ts).
 *  - Spec ĐỔI cấu hình connector của agent dev (xray + medical-support) sang thư mục tạm dưới
 *    TEST_AGENT_LINKAGE_DIR, và afterAll đặt lại đúng danh sách connector ban đầu.
 *  - 990777: bệnh nhân 編集. TC-2 tạo bệnh nhân mới (số do BE cấp), afterAll xoá.
 *  - TC-1 → TC-2 nối tiếp: TC-2 gặp upload.csv do TC-1 để lại ⇒ đi qua hộp 上書き.
 */

const DIALOG_TIMEOUT = 30_000
const FILE_TIMEOUT = 30_000

const PAT_NO = SEED_PAT_NO_BASE + 777
const SEED_NAME = 'イーツーイー　連携'
const SEED_KANA = 'いーつーいー　れんけい'
const UPDATE_PHONE = '090-7770-0777'
const NEW_NAME = 'イーツーイー　新規連携'
const NEW_KANA = 'いーつーいー　しんきれんけい'
const NEW_PHONE = '090-7770-0778'

const KINTONE_LINK_CODE = 25
const TATSUJIN_LINK_CODE = 24
const KINTONE_COLUMNS = 65
const TATSUJIN_COLUMNS = 27
const Q00001 = '登録してよろしいですか？'
const CHANGED = '患者データは、変更されています。保存しますか？'

const runId = Date.now().toString(36)
const KINTONE_DIR = `${WIN_LINKAGE_ROOT}\\kintone-${runId}`
const TATSUJIN_DIR = `${WIN_LINKAGE_ROOT}\\tatsujin-${runId}`

const startedAt = new Date()
const created: number[] = []
let agent: AgentSession | undefined
let originalConnectors: AgentConnector[] | undefined

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

test.beforeAll(async ({ authedPage }) => {
    if (!dbEnabled || !allowSave || !AGENT_AVAILABLE) return
    await seedTestPatient({ patNo: PAT_NO, patNm: SEED_NAME, patKn: SEED_KANA })
    await withDb(async (c) => {
        await c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = $1`, [PAT_NO])
        await c.query('UPDATE person SET att_dr = 1, att_st = 100 WHERE pat_no = $1', [PAT_NO])
    })
    winPrepareDeviceDir(KINTONE_DIR)
    winPrepareDeviceDir(TATSUJIN_DIR)
    agent = await openAgentSession(authedPage)
    originalConnectors = (await agent.getConfig()).connectors
    await agent.replaceConnectors(
        ['xray', 'medical-support'],
        [
            { category: 'xray', linkCode: TATSUJIN_LINK_CODE, enabled: true, settings: { path: TATSUJIN_DIR } },
            { category: 'medical-support', linkCode: KINTONE_LINK_CODE, enabled: true, settings: { path: KINTONE_DIR } },
        ],
    )
})

test.afterAll(async ({ authedPage }) => {
    // Đặt lại cấu hình agent TRƯỚC mọi việc khác — đây là phần dùng chung với người khác.
    if (agent && originalConnectors) await agent.putConnectors(originalConnectors)
    if (!dbEnabled) return
    winRemoveDeviceDir(KINTONE_DIR)
    winRemoveDeviceDir(TATSUJIN_DIR)
    await deleteTestPatient(PAT_NO)
    for (const n of created) await purgeCreatedPatient(n).catch((e) => console.log(e))
    await authedPage.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
    await releaseSharedPage(authedPage)
})

async function purgeCreatedPatient(patNo: number): Promise<void> {
    await withDb(async (c) => {
        const mine = await c.query('SELECT 1 FROM person WHERE pat_no = $1 AND created_at >= $2', [patNo, startedAt])
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

/** Chờ file xuất hiện trên máy agent rồi đọc (agent ghi sau khi FE lưu xong). */
async function waitForFile(path: string): Promise<string> {
    let text: string | null = null
    await expect
        .poll(
            () => {
                text = winReadShiftJis(path)
                return text !== null
            },
            { message: `agent không ghi ${path}`, timeout: FILE_TIMEOUT, intervals: [1000] },
        )
        .toBe(true)
    return text!
}

function csvRows(text: string): string[][] {
    return text
        .split('\r\n')
        .filter((l) => l !== '')
        .map((l) => l.split(','))
}

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const alert = (text: string) => page().getByRole('alertdialog').filter({ hasText: text })
    const top = () => page().getByRole('alertdialog').first()
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

    /** F9, bấm はい/OK qua mọi hộp xác nhận tới khi gặp hộp chứa `target`. */
    async function f9Until(target: string): Promise<void> {
        await page().locator('main').locator('[data-fkey="F9"]').click()
        for (let i = 0; i < 10; i++) {
            await expect(top()).toBeVisible({ timeout: DIALOG_TIMEOUT })
            const text = flat(await top().innerText())
            if (text.includes(target)) return
            const labels = (await top().getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
            if (labels.length <= 1) throw new Error(`F9 dừng ở lỗi validate 「${text}」 trước 「${target}」`)
            await top().getByRole('button', { name: /^(はい|OK)$/ }).first().click()
            await expect(alert(text.replace(/^お茶コン\s*/, '').slice(0, 20))).toHaveCount(0)
        }
        throw new Error(`F9 qua 10 hộp mà chưa thấy 「${target}」`)
    }

    /** Hộp 上書き của file đã tồn tại (nếu có) — bấm はい. Trả true nếu đã gặp. */
    async function acceptOverwriteIfAsked(): Promise<boolean> {
        const button = page().getByRole('button', { name: '上書きする', exact: true })
        const shown = await button.waitFor({ timeout: 45_000 }).then(() => true).catch(() => false)
        if (!shown) return false
        await button.click()
        await expect(button).toHaveCount(0)
        return true
    }
    return { alert, f9Until, acceptOverwriteIfAsked }
}

test.describe('機器連携 — 患者登録 F9 ⇒ upload.csv (Kintone) / {patNo}.csv (達人プラス)', () => {
    let page: Page
    const { alert, f9Until, acceptOverwriteIfAsked } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1: spec lưu bệnh nhân thật')
        skipWithReason(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
    })

    test('TC-1 — 編集 + F9 はい: Kintone upload.csv có `*` + 65 cột; 達人プラス {patNo}.csv 27 cột', async () => {
        await openPatientRegistration(page, String(PAT_NO))
        await patientFieldInput(page, '電話番号').fill(UPDATE_PHONE)
        await f9Until(CHANGED)
        await alert(CHANGED).getByRole('button', { name: 'はい', exact: true }).click()

        const kintone = await waitForFile(`${KINTONE_DIR}\\upload.csv`)
        const [header, row] = csvRows(kintone)
        expect(header[0], 'Update ⇒ header thêm * đầu').toBe('*Pt_num')
        expect(header).toHaveLength(KINTONE_COLUMNS)
        expect(row).toHaveLength(KINTONE_COLUMNS)
        expect(row.slice(0, 3)).toEqual([String(PAT_NO), 'イーツーイー', '連携'])
        expect(row[12], 'yoyaku_tel = PatTel1').toBe(UPDATE_PHONE)

        const tatsujin = await waitForFile(`${TATSUJIN_DIR}\\${PAT_NO}.csv`)
        const [t] = csvRows(tatsujin)
        expect(t).toHaveLength(TATSUJIN_COLUMNS)
        expect([t[0], t[1], t[2]]).toEqual([String(PAT_NO), '1', String(PAT_NO)])
        expect(t[23], 'TEL = PatTel1').toBe(UPDATE_PHONE)
        expect(winListDeviceFiles(KINTONE_DIR).sort()).toEqual(['ex.bat', 'upload.csv'])
    })

    test('TC-2 — 新規 + F9 OK: file đã có ⇒ hộp 上書き; upload.csv KHÔNG có `*`, đúng số bệnh nhân mới', async () => {
        const verification = page.getByRole('dialog').filter({ hasText: /オ\s*ン\s*ラ\s*イ\s*ン/ })
        const wizardAsk = alert('新規登録ウィザードを表示しますか？')
        await page.goto('/patients/registration', { waitUntil: 'domcontentloaded' })
        await verification.or(wizardAsk).first().waitFor({ timeout: DIALOG_TIMEOUT })
        if (await verification.isVisible()) await verification.locator('[data-fkey="F10"]').click()
        await wizardAsk.getByRole('button', { name: 'いいえ', exact: true }).click()

        const main = page.locator('main')
        await main.locator('[data-field="patNm"] input').first().fill(NEW_NAME)
        await main.locator('[data-field="patKn"] input').first().fill(NEW_KANA)
        const birth = main.locator('[data-field="birth"]')
        await birth.getByRole('textbox', { name: '和暦年' }).fill('55')
        await birth.getByRole('textbox', { name: '月' }).fill('1')
        await birth.getByRole('textbox', { name: '日' }).fill('1')
        await patientFieldInput(page, '電話番号').fill(NEW_PHONE)

        const createdRes = page.waitForResponse(
            (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/tenant/patients'),
            { timeout: DIALOG_TIMEOUT },
        )
        await f9Until(Q00001)
        await alert(Q00001).getByRole('button', { name: 'OK', exact: true }).click()
        const newPatNo = Number((await (await createdRes).json()).data.patNo)
        created.push(newPatNo)

        expect(await acceptOverwriteIfAsked(), 'upload.csv do TC-1 để lại ⇒ phải hỏi 上書き').toBe(true)

        await expect
            .poll(() => winReadShiftJis(`${KINTONE_DIR}\\upload.csv`)?.split('\r\n')[1]?.split(',')[0], {
                message: 'upload.csv chưa được ghi đè bằng bệnh nhân mới',
                timeout: FILE_TIMEOUT,
                intervals: [1000],
            })
            .toBe(String(newPatNo))
        const [header, row] = csvRows(winReadShiftJis(`${KINTONE_DIR}\\upload.csv`)!)
        expect(header[0], 'Add ⇒ không có * đầu header').toBe('Pt_num')
        expect(header).toHaveLength(KINTONE_COLUMNS)
        expect(row).toHaveLength(KINTONE_COLUMNS)
        expect(row[12]).toBe(NEW_PHONE)

        const [t] = csvRows(await waitForFile(`${TATSUJIN_DIR}\\${newPatNo}.csv`))
        expect(t).toHaveLength(TATSUJIN_COLUMNS)
        expect(t[0]).toBe(String(newPatNo))
    })
})
