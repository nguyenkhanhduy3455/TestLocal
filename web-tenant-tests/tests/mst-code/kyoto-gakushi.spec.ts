import { type Locator, type Page, type Route } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { MSG } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 京都市学歯 (mst_code 72) khi lưu 患者登録 — commit ace3d9d53 + 0252cc41b (nhánh
 * feature/mst-cod-shared-override, merge dev ccf611752).
 *
 * FACT bám theo source (Rule 21):
 *  - api Application/Patients/Handlers/InsuranceCodeCheck.cs
 *      · Chỉ clinic Kyoto (mst_iin_1.pref_cd = 26) kiểm; nơi khác mọi nhánh lưu gakushi = 0 dù request
 *        gửi gì (InsInfo.cs:183-190).
 *      · Ở Kyoto: mã phải còn được combo đưa ra (pickable, bỏ qua kỳ hiệu lực — on: null, :106), HOẶC đúng
 *        là giá trị nhánh đó đang lưu.
 *      · Từ chối ⇒ 422, field gakushi, MST_CODE.NOT_OFFERED.
 *  - Nhóm 72 KHÔNG cho ẩn (master.mst_code_type.hide_allowed = false, BE 7564a9ebc; 8fe3aab77 chặn cả admin)
 *    và kiểm không theo kỳ ⇒ không còn cách nào làm 1/2 "thôi được đưa ra". Ca từ chối được dựng bằng cách
 *    đổi `gakushi` trong request F9 thành mã KHÔNG có trong nhóm (9) — vẫn đi đúng nhánh NOT_OFFERED.
 *    (Ca cũ "mã bị ẩn sau khi đã lưu vẫn giữ được" không còn dựng được nên đã bỏ.)
 *  - web-tenant patients/components/insurance-section.tsx: ô 京都市学歯 chỉ render khi isKyotoClinic
 *    (mst-iin1, đọc thẳng DB — không cache); Select dưới <label>京都市学歯</label>, có mục trắng đầu.
 *  - patient-detail-form.tsx:1246 — lỗi NOT_OFFERED của gakushi ⇒ alert E00002 「京都市学歯が間違っています。」.
 *  - mst_code 72: 0 対象外 / 1 対象 / 2 対象外混在.
 *
 * DỮ LIỆU: tenant demo là 東京 (pref_cd 13). Spec đổi tạm mst_iin_1.pref_cd = 26 và TRẢ LẠI giá trị cũ ở
 * afterAll; bệnh nhân 990742 tự seed (xoá hẳn ở afterAll).
 * Trong lúc chạy, MỌI màn của tenant thấy clinic là Kyoto — đừng chạy song song spec khác.
 *
 * ⚠ E5 ĐỎ có chủ đích cho tới khi FE nạp `gakushi` vào form (xem ghi chú ngay trên E5).
 *
 * Cần TEST_ALLOW_SAVE=1, TEST_DB=1. Login: authedPage.
 *   npx playwright test tests/mst-code/kyoto-gakushi.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 240_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec đổi pref_cd của clinic và lưu bệnh nhân')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1')

const PAT = SEED_PAT_NO_BASE + 742
const TARGET = 1
/** Mã không có trong nhóm 72 (0 対象外 / 1 対象 / 2 対象外混在). */
const NOT_A_CODE = 9
const KYOTO = 26

test.describe('京都市学歯 — kiểm mã khi lưu 患者登録', () => {
    let page: Page
    let step: () => Promise<void>
    let originalPref: number | null = null

    const gakushiBox = (): Locator =>
        page
            .locator('div')
            .filter({ has: page.locator('label').filter({ hasText: /^京都市学歯$/ }) })
            .last()
            .getByRole('combobox')
    const alert = (): Locator => page.locator('[role="alertdialog"]').first()

    const setPref = (pref: number | null) =>
        withDb((c) => c.query('UPDATE mst_iin_1 SET pref_cd = $1 WHERE key_id = 1', [pref]))
    const gakushi = () =>
        withDb(async (c) =>
            (await c.query<{ gakushi: number }>('SELECT gakushi FROM insurance WHERE pat_no = $1 AND pat_br = 1', [PAT])).rows[0]?.gakushi,
        )

    async function openRegistration(ready: () => Locator): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/patients/registration?patientNo=%22${PAT}%22`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(ready()).toBeVisible({ timeout: 60_000 })
                await step()
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    /** F9 登録: đóng các hộp hỏi trước khi gửi, trả HTTP status của PUT /tenant/patients. */
    async function pressF9(): Promise<number> {
        const pending = page.waitForResponse(
            (r) => r.url().includes('/tenant/patients') && ['PUT', 'POST'].includes(r.request().method()),
            { timeout: 60_000 },
        )
        pending.catch(() => undefined)
        await page.locator('[data-fkey="F9"]').first().click()
        for (let i = 0; i < 6; i++) {
            if (!(await alert().isVisible({ timeout: 2_000 }).catch(() => false))) break
            await alert().getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click({ timeout: 5_000 }).catch(() => {})
        }
        const res = await pending.catch(() => null)
        if (!res) throw new Error('F9 không gửi PUT /tenant/patients')
        return res.status()
    }

    async function pick(name: string): Promise<void> {
        await gakushiBox().click()
        await page.getByRole('option', { name, exact: true }).click()
        await expect(gakushiBox()).toContainText(name)
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        originalPref = await withDb(async (c) =>
            (await c.query<{ pref_cd: number | null }>('SELECT pref_cd FROM mst_iin_1 WHERE key_id = 1')).rows[0]?.pref_cd ?? null,
        )
        // 氏名 có khoảng trắng họ/tên, br_dt >= 生年月日: điều kiện để chuỗi F9 đi tới request lưu.
        await seedTestPatient({ patNo: PAT, patNm: 'キョウト　学歯', patKn: 'きょうと　がくし' })
        await withDb((c) => c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01', gakushi = 0 WHERE pat_no = $1`, [PAT]))
        await setPref(KYOTO)
    })

    test.afterAll(async () => {
        await setPref(originalPref).catch((e) => console.log(`TRẢ pref_cd lỗi: ${e}`))
        await deleteTestPatient(PAT).catch(() => {})
        await releaseSharedPage(page)
    })

    test('E1 — clinic Kyoto: 患者登録 có ô 京都市学歯 với 対象外 / 対象 / 対象外混在', async () => {
        await openRegistration(gakushiBox)
        await gakushiBox().click()
        const options = (await page.getByRole('option').allInnerTexts()).map((t) => t.trim()).filter((t) => t !== '')
        expect(options).toEqual(['対象外', '対象', '対象外混在'])
        await page.getByRole('option', { name: '対象外', exact: true }).click()
        await captureFixedUi(page, 'mst-code-kyoto-gakushi-field')
    })

    test('E2 — request F9 mang mã không có trong nhóm 72 ⇒ 422 + E00002 「京都市学歯が間違っています。」, không lưu', async () => {
        await pick('対象')
        // Đổi mọi `gakushi` trong body PUT/POST /tenant/patients thành mã lạ (combo không thể đưa ra mã này).
        const swap = (v: unknown): unknown =>
            Array.isArray(v)
                ? v.map(swap)
                : v && typeof v === 'object'
                  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'gakushi' ? NOT_A_CODE : swap(x)]))
                  : v
        let swapped = 0
        const inject = async (route: Route) => {
            const req = route.request()
            if (!['PUT', 'POST'].includes(req.method())) return route.fallback()
            const body = req.postDataJSON() as unknown
            const json = JSON.stringify(swap(body))
            if (json !== JSON.stringify(body)) swapped++
            await route.fallback({ postData: json })
        }
        await page.route('**/tenant/patients**', inject)
        const pending = page.waitForResponse(
            (r) => r.url().includes('/tenant/patients') && ['PUT', 'POST'].includes(r.request().method()),
            { timeout: 60_000 },
        )
        await page.locator('[data-fkey="F9"]').first().click()
        // Các hộp hỏi trước khi gửi (nếu có) — dừng ở hộp lỗi E00002.
        let res = null
        for (let i = 0; i < 6 && res === null; i++) {
            const hit = await Promise.race([
                pending.then((r) => ({ kind: 'res' as const, r })),
                alert().waitFor({ state: 'visible', timeout: 10_000 }).then(() => ({ kind: 'dlg' as const })),
            ]).catch(() => null)
            if (hit?.kind === 'res') res = hit.r
            else if (hit?.kind === 'dlg') await alert().getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click()
        }
        await page.unroute('**/tenant/patients**', inject)
        expect(res, 'F9 không gửi request lưu').not.toBeNull()
        expect(swapped, 'body F9 không có trường gakushi để đổi').toBeGreaterThan(0)
        expect(res!.status(), 'BE từ chối mã không được đưa ra').toBe(422)
        await expect(alert()).toBeVisible({ timeout: 15_000 })
        await expect(alert()).toContainText(MSG.E00002('京都市学歯'))
        await captureFixedUi(page, 'mst-code-kyoto-gakushi-not-offered-e00002')
        await alert().getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click()
        expect(await gakushi(), 'không lưu').toBe(0)
    })

    test('E3 — chọn 「対象」 rồi F9 ⇒ lưu gakushi = 1', async () => {
        await openRegistration(gakushiBox)
        await pick('対象')
        expect(await pressF9()).toBeLessThan(300)
        expect(await gakushi()).toBe(TARGET)
    })

    test('E4 — clinic ngoài Kyoto: không có ô 京都市学歯, F9 ⇒ gakushi lưu về 0', async () => {
        await setPref(originalPref)
        await withDb((c) => c.query('UPDATE insurance SET gakushi = 1 WHERE pat_no = $1', [PAT]))
        await openRegistration(() => page.locator('[data-fkey="F9"]').first())
        await expect(page.locator('label').filter({ hasText: /^京都市学歯$/ })).toHaveCount(0)
        expect(await pressF9()).toBeLessThan(300)
        expect(await gakushi(), 'ngoài Kyoto server luôn lưu 0').toBe(0)
    })

    // ── Ca dưới đây ĐỎ trên demo1 2026-10-21 — lỗi app, để cuối file để serial không bỏ ca khác ──
    //
    // parse-pat-info-detail.ts (toPersonInsSlice) KHÔNG map `gakushi` của PatientDetailResponse vào form:
    // ô 京都市学歯 luôn mở ra trống (types.ts mặc định '') và mỗi lần F9 gửi 0 ⇒ clinic Kyoto mất 京都市学歯
    // của bệnh nhân ở MỌI lần lưu lại. Assert dưới đây là hành vi đúng; xanh lại khi FE map trường này.

    test('E5 — [lỗi app] mở lại bệnh nhân đang lưu 対象 ⇒ ô 京都市学歯 hiện 「対象」', async () => {
        await setPref(KYOTO)
        await withDb((c) => c.query('UPDATE insurance SET gakushi = 1 WHERE pat_no = $1', [PAT]))
        await openRegistration(gakushiBox)
        await captureFixedUi(page, 'mst-code-kyoto-gakushi-reopen')
        await expect(gakushiBox(), 'FE không nạp gakushi từ chi tiết bệnh nhân').toContainText('対象')
    })
})
