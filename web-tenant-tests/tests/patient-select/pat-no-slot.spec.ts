/**
 * 患者登録 (đăng ký mới) — giữ chỗ 患者番号 qua bảng `pat_no_slot`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CƠ CHẾ ĐANG ĐO
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Mở màn đăng ký mới ⇒ `POST /tenant/patients/pat-no-reservations` lấy số
 *    `locked = false` nhỏ nhất rồi khoá lại (còn < 50 số trống thì nạp cho đủ 100).
 *  - Màn còn mở ⇒ mỗi 1 phút `PUT …/pat-no-reservations/{patNo}` gia hạn khoá,
 *    tối đa 10 lần.
 *  - Khoá quá 2 phút không gia hạn = hết hạn; job 5 phút/lần nhả nó về trống.
 *    F9 với số không còn do màn giữ ⇒ BE khoá số trống nhỏ nhất cho màn:
 *      · số đó KHÁC số cũ (đã bị màn khác lấy) ⇒ KHÔNG lưu, màn báo
 *        「患者番号 X は使用できなくなりました。新しい患者番号は Y です。…」 và đổi
 *        sang Y; F9 lần nữa thì lưu dưới Y (TC-4).
 *      · số đó TRÙNG số cũ (job đã nhả, chưa ai lấy) ⇒ lưu luôn, không báo (TC-5).
 *  - Lưu thành công ⇒ dòng của số đó bị xoá khỏi `pat_no_slot`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU — số THẬT, tự dọn
 * ═══════════════════════════════════════════════════════════════════════════
 * Số do BE cấp (MAX(person.pat_no)+1 trở lên), KHÔNG chọn được dải 990000+ như
 * các spec khác. Bệnh nhân spec tạo ra được xoá ở mọi bảng có cột `pat_no` (kể
 * cả `<bảng>_deleted`) và dòng audit_log của nó — `purgeCreatedPatient` chỉ xoá
 * bệnh nhân có `person.created_at` sau lúc spec bắt đầu, để không bao giờ đụng
 * bệnh nhân thật.
 *
 * Testcase NỐI TIẾP (`mode: 'serial'`), page dùng chung từ `authedPage`.
 */
import { type Page, type Response } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'

/** User giả cầm khoá ở TC-4 — không trùng ai thật; khoá tự hết hạn sau 2 phút. */
const ANOTHER_USER = '00000000-0000-0000-0000-00000000e2e4'
/** `PAT_NO_KEEP_INTERVAL_MS` (FE) + biên cho timer. */
const KEEP_WAIT_MS = 75_000
const DIALOG_TIMEOUT = 30_000
const OPEN_ATTEMPTS = 3

const NAME = 'ヨヤク　テスト'
const KANA = 'ﾖﾔｸ ﾃｽﾄ'

const RESERVE_PATH = '/tenant/patients/pat-no-reservations'

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec soi và sửa trực tiếp bảng pat_no_slot')

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('患者登録 — giữ chỗ 患者番号 (pat_no_slot)', () => {
    let page: Page
    const startedAt = new Date()
    /** Số mà spec đã ĐĂNG KÝ thành bệnh nhân — dọn ở afterAll. */
    const created: number[] = []

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        for (const patNo of created) await purgeCreatedPatient(patNo).catch((e) => console.log(e))
        await releaseSharedPage(page)
    })

    // ── DB ──────────────────────────────────────────────────────────────────

    interface SlotRow {
        locked: boolean
        locked_at: Date | null
        locked_by: string | null
    }

    async function slot(patNo: number): Promise<SlotRow | undefined> {
        return withDb(async (c) => {
            const r = await c.query<SlotRow>(
                'SELECT locked, locked_at, locked_by FROM pat_no_slot WHERE pat_no = $1',
                [patNo],
            )
            return r.rows[0]
        })
    }

    async function personExists(patNo: number): Promise<boolean> {
        return withDb(async (c) => {
            const r = await c.query('SELECT 1 FROM person WHERE pat_no = $1', [patNo])
            return (r.rowCount ?? 0) > 0
        })
    }

    /**
     * Số của màn hết hạn, job đã nhả, rồi một màn KHÁC lấy mất — khoá còn hạn của
     * người khác. Không giả lập bằng cách đẩy `locked_at` lùi: job chạy mỗi 5 phút
     * có thể nhả nó ngay trước F9 và spec đo nhầm sang nhánh của TC-5.
     */
    async function takenByAnotherScreen(patNo: number): Promise<void> {
        await withDb(async (c) => {
            await c.query(
                `UPDATE pat_no_slot SET locked = true, locked_at = now(), locked_by = $2
                  WHERE pat_no = $1`,
                [patNo, ANOTHER_USER],
            )
        })
    }

    /** Số của màn hết hạn và job đã nhả — đúng câu UPDATE của PatNoSlotReleaseJob. */
    async function releasedByJob(patNo: number): Promise<void> {
        await withDb(async (c) => {
            await c.query(
                `UPDATE pat_no_slot SET locked = false, locked_at = NULL, locked_by = NULL
                  WHERE pat_no = $1`,
                [patNo],
            )
        })
    }

    /** Xoá bệnh nhân DO SPEC TẠO ở mọi bảng có `pat_no`, kể cả archive + audit_log. */
    async function purgeCreatedPatient(patNo: number): Promise<void> {
        await withDb(async (c) => {
            const mine = await c.query(
                'SELECT 1 FROM person WHERE pat_no = $1 AND created_at >= $2',
                [patNo, startedAt],
            )
            if ((mine.rowCount ?? 0) === 0) {
                throw new Error(
                    `purgeCreatedPatient: ${patNo} không phải bệnh nhân spec tạo — không xoá`,
                )
            }
            const tables = await c.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.columns
                  WHERE table_schema = current_schema() AND column_name = 'pat_no'
                    AND table_name NOT LIKE '%\\_deleted'`,
            )
            for (const { table_name } of tables.rows) {
                await c.query(`DELETE FROM ${table_name} WHERE pat_no::text = $1`, [String(patNo)])
            }
            // DELETE ở trên đẩy dòng sang `<bảng>_deleted` qua trigger archive — dọn nốt.
            const archives = await c.query<{ table_name: string }>(
                `SELECT table_name FROM information_schema.columns
                  WHERE table_schema = current_schema() AND column_name = 'pat_no'
                    AND table_name LIKE '%\\_deleted'`,
            )
            for (const { table_name } of archives.rows) {
                await c.query(`DELETE FROM ${table_name} WHERE pat_no::text = $1`, [String(patNo)])
            }
            await c.query(
                `DELETE FROM audit_log
                  WHERE created_at >= $1 AND (meta_json->>'patNo')::int = $2`,
                [startedAt, patNo],
            )
        })
    }

    // ── Màn hình ────────────────────────────────────────────────────────────

    const isReserve = (r: Response) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith(RESERVE_PATH)

    const isKeep = (patNo: number) => (r: Response) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname.endsWith(`${RESERVE_PATH}/${patNo}`)

    const isRegister = (r: Response) =>
        r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/tenant/patients')

    /** Số đang hiện ở 「≪患者番号：N≫」 đầu màn. */
    async function shownPatNo(): Promise<number> {
        const text = await page
            .locator('main')
            .getByText(/≪患者番号[:：]\s*\d+≫/)
            .first()
            .innerText()
        return Number(text.match(/(\d+)/)![1])
    }

    /**
     * Mở màn đăng ký mới, dọn 2 hộp mở đầu (オンライン資格確認 → F10, rồi
     * 「新規登録ウィザードを表示しますか？」 → いいえ). Trả số vừa giữ chỗ.
     */
    async function openNewRegistration(): Promise<number> {
        // Retry như `openPatientRegistration`: dev server nhả hụt module thì trang
        // trắng, React không mount ⇒ không có POST nào; chỉ `goto` lại mới cứu.
        let res: Response | undefined
        for (let attempt = 1; attempt <= OPEN_ATTEMPTS && !res; attempt++) {
            const reserved = page.waitForResponse(isReserve, {
                timeout: DIALOG_TIMEOUT,
            })
            await page.goto('/patients/registration', {
                waitUntil: 'domcontentloaded',
            })
            res = await reserved.catch(() => undefined)
            if (!res)
                console.log(
                    `openNewRegistration: lần ${attempt}/${OPEN_ATTEMPTS} không thấy POST giữ chỗ — nạp lại`,
                )
        }
        if (!res) throw new Error('Mở màn đăng ký mới mà không có POST pat-no-reservations nào')
        expect(res.status(), 'POST pat-no-reservations phải trả 200').toBe(200)
        const patNo = Number((await res.json()).data.patNo)

        await expect(page.getByRole('dialog')).toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        await page.keyboard.press('F10')
        const ask = page.getByRole('alertdialog').filter({ hasText: '新規登録ウィザード' })
        await ask.getByRole('button', { name: 'いいえ' }).click()
        await expect(page.getByRole('alertdialog')).toBeHidden()
        await expect.poll(shownPatNo, { message: 'đầu màn phải hiện số vừa giữ chỗ' }).toBe(patNo)
        return patNo
    }

    /** Gõ tay ngày 和暦 theo niên hiệu mặc định của ô (有効日 = 令和, 生年月日 = 昭和). */
    async function typeDate(field: string, y: string, m: string, d: string): Promise<void> {
        const group = page.locator(`[data-field="${field}"]:visible`).first().getByRole('group', {
            name: '和暦日付',
        })
        for (const [name, value] of [
            ['和暦年', y],
            ['月', m],
            ['日', d],
        ] as const) {
            const cell = group.getByRole('textbox', { name })
            await cell.click()
            await cell.pressSequentially(value)
            await expect(cell).toHaveValue(value)
        }
    }

    async function fillMinimum(): Promise<void> {
        await typeDate('br', '8', '10', '1')
        await page.locator('[data-field="patNm"] input').fill(NAME)
        await page.locator('[data-field="patKn"] input').fill(KANA)
        await typeDate('birth', '55', '1', '1')
    }

    /**
     * F9 rồi đồng ý mọi confirm (診療開始日 = hôm nay, 登録してよろしいですか？)
     * cho tới request lưu. Trả response POST /tenant/patients.
     */
    async function f9Register(): Promise<Response> {
        const saved = page.waitForResponse(isRegister, { timeout: 60_000 })
        await page.keyboard.press('F9')
        let settled = false
        void saved.then(() => (settled = true))
        while (!settled) {
            const dlg = topDialog(page)
            if (!(await dlg.isVisible({ timeout: 1_000 }).catch(() => false))) continue
            const text = (await dlg.innerText()).replace(/\s+/g, ' ')
            // Thông báo số hết hạn là thứ testcase đo — để nguyên cho nó.
            if (text.includes('使用できなくなりました')) break
            const yes = dlg.getByRole('button', { name: /^(はい|OK)$/ }).first()
            if (!(await yes.isVisible().catch(() => false))) {
                throw new Error(`F9 dừng ở hộp thoại không có はい/OK: 「${text}」`)
            }
            console.log(`F9 → đồng ý 「${text.slice(0, 80)}」`)
            await yes.click()
            await expect(dlg)
                .toBeHidden({ timeout: DIALOG_TIMEOUT })
                .catch(() => undefined)
        }
        return saved
    }

    // ── Testcase ────────────────────────────────────────────────────────────

    test('TC-1 — mở màn đăng ký mới thì giữ chỗ số trống nhỏ nhất', async () => {
        const freeNos = async () =>
            withDb(async (c) => {
                const r = await c.query<{ pat_no: number }>(
                    'SELECT pat_no FROM pat_no_slot WHERE NOT locked ORDER BY pat_no',
                )
                return r.rows.map((x) => Number(x.pat_no))
            })
        const freeBefore = await freeNos()

        const patNo = await openNewRegistration()

        const row = await slot(patNo)
        expect(row?.locked, `pat_no_slot ${patNo} phải bị khoá`).toBe(true)
        expect(row?.locked_by, 'locked_by phải là user đang mở màn').not.toBeNull()
        // DB dùng chung với phiên e2e khác cùng user: màn khác có thể lấy mất số nhỏ nhất
        // giữa lúc đọc và lúc giữ chỗ. Nên chỉ đòi: mọi số trống nhỏ hơn patNo lúc trước
        // giờ đều đã bị khoá — tức là patNo là số trống nhỏ nhất CÒN LẠI lúc giữ chỗ.
        if (freeBefore.length > 0) {
            expect(patNo, 'không được nhỏ hơn số trống nhỏ nhất lúc trước').toBeGreaterThanOrEqual(
                freeBefore[0]!,
            )
            const freeNow = new Set(await freeNos())
            const skipped = freeBefore.filter((n) => n < patNo && freeNow.has(n))
            expect(skipped, 'không được bỏ qua số trống nhỏ hơn').toEqual([])
        }
        const free = await withDb(async (c) => {
            const r = await c.query<{ n: number }>(
                'SELECT count(*)::int AS n FROM pat_no_slot WHERE NOT locked',
            )
            return r.rows[0]?.n ?? 0
        })
        expect(
            free,
            'sau khi lấy, số trống phải ≥ 49 (nạp tới 100 khi < 50)',
        ).toBeGreaterThanOrEqual(49)
    })

    test('TC-2 — màn còn mở thì mỗi phút gia hạn khoá', async () => {
        const patNo = await shownPatNo()
        const before = await slot(patNo)

        const keep = await page.waitForResponse(isKeep(patNo), {
            timeout: KEEP_WAIT_MS,
        })

        expect(keep.status(), 'PUT gia hạn phải trả 204').toBe(204)
        const after = await slot(patNo)
        expect(after!.locked_at!.getTime(), 'locked_at phải được đẩy lên').toBeGreaterThan(
            before!.locked_at!.getTime(),
        )
    })

    test('TC-3 — mở màn lần nữa thì nhận số KHÁC, số cũ vẫn bị khoá', async () => {
        const first = await shownPatNo()

        const second = await openNewRegistration()

        expect(second).not.toBe(first)
        expect((await slot(first))?.locked, `số cũ ${first} chưa hết hạn nên vẫn khoá`).toBe(true)
    })

    test('TC-4 — F9 khi số đã bị màn khác lấy: không lưu, đổi sang số mới; F9 lại thì lưu và xoá slot', async () => {
        const expired = await openNewRegistration()
        await fillMinimum()
        await takenByAnotherScreen(expired)

        const refused = await f9Register()
        const body = (await refused.json()).data
        expect(refused.status(), 'số bị lấy mất ⇒ 200 (không phải 201 Created)').toBe(200)
        expect(body.patNoChanged).toBe(true)
        const renewed = Number(body.patNo)
        expect(renewed).not.toBe(expired)

        const alert = topDialog(page)
        await expect(alert).toContainText(`患者番号 ${expired} は使用できなくなりました`, {
            timeout: DIALOG_TIMEOUT,
        })
        await expect(alert).toContainText(`新しい患者番号は ${renewed} です`)
        await alert.getByRole('button', { name: 'OK' }).click()
        await expect(alert).toBeHidden()

        expect(await personExists(expired), `không được tạo bệnh nhân ${expired}`).toBe(false)
        expect(await personExists(renewed), `chưa được tạo bệnh nhân ${renewed}`).toBe(false)
        await expect.poll(shownPatNo, { message: 'đầu màn phải đổi sang số mới' }).toBe(renewed)
        expect((await slot(renewed))?.locked, `số mới ${renewed} phải bị khoá cho màn này`).toBe(
            true,
        )

        const saved = await f9Register()
        expect(saved.status(), 'F9 lần 2 dưới số mới phải lưu được (201)').toBe(201)
        created.push(renewed)
        expect((await saved.json()).data.patNoChanged).toBe(false)
        expect(await personExists(renewed), `bệnh nhân ${renewed} phải được tạo`).toBe(true)
        expect(await slot(renewed), `slot ${renewed} phải bị xoá sau khi lưu`).toBeUndefined()
    })

    test('TC-5 — F9 khi job đã nhả số và chưa ai lấy: lưu luôn dưới số đó, không thông báo', async () => {
        const patNo = await openNewRegistration()
        await fillMinimum()
        await releasedByJob(patNo)

        const saved = await f9Register()

        expect(saved.status(), 'số mới trùng số cũ ⇒ lưu luôn (201)').toBe(201)
        created.push(patNo)
        const body = (await saved.json()).data
        expect(body.patNoChanged).toBe(false)
        expect(Number(body.patNo)).toBe(patNo)
        await expect(
            page.getByRole('alertdialog').filter({ hasText: '使用できなくなりました' }),
            'không được báo số hết hạn khi số vẫn là số cũ',
        ).toHaveCount(0)
        expect(await personExists(patNo), `bệnh nhân ${patNo} phải được tạo`).toBe(true)
        expect(await slot(patNo), `slot ${patNo} phải bị xoá sau khi lưu`).toBeUndefined()
    })
})
