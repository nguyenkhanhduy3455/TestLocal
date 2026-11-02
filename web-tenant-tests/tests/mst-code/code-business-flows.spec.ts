import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { BASE_URL, TODAY_ISO } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'
import { adminToken, bearer } from '../role-master/_role-api'

import { type AdminApi, type CodeType, INHERIT_ALL, OWN_CODE, openAdminApi } from './_mst-code-admin'

/**
 * Nghiệp vụ dùng mã đã được tenant tuỳ biến (ghi đè tên / mã riêng / ẩn) — các màn GHI rồi ĐỌC LẠI
 * bản ghi, không chỉ nhìn combo. Nhánh feature/mst-cod-shared-override (merge dev ccf611752).
 *
 * Dữ liệu tuỳ biến dựng qua admin API (admin làm thay tenant theo TRẦN của nhóm — BE 7564a9ebc; mã riêng
 * nằm trong dải cố định 30000～32767):
 *   30 ユーザ区分 : 1 衛生士 → 「E2E衛生士」 (trần chỉ cho 名称/順 — không còn mã riêng, không ẩn)
 *    9 職業       : 1 会社員 → 「E2E会社員」; mã riêng 30950 「E2E独自職業」 (bật add cho tenant: mã riêng chỉ
 *                   pickable khi nhóm còn bật add — MstCodeManageItemResponse.pickable)
 *    1 保険種別   : 1 社保 → 「E2E社保」
 *   17 入金区分   : 1 現金 → 「E2E現金」
 *   24 領収書タイプ: 7 A5サイズ(金額のみ) → 「E2E領収書A5」 (trần nhóm 24 không cho ẩn)
 *
 * FACT bám theo source (Rule 21):
 *  - ユーザマスタ (routes/_authenticated/settings/user-master/new.tsx, user-master-form.tsx): combo 区分
 *    (aria-label 区分) lấy mst_code 30; F9 登録 ⇒ về /settings/user-master. (Ca cũ "mã riêng của nhóm 30 combo
 *    đưa ra nhưng BE không lưu" đã bỏ: trần nhóm 30 không còn cho thêm mã riêng.)
 *  - 患者登録 (/patients/registration?patientNo="n"): 職業 trong insurance-section.tsx là Select không
 *    aria-label, dưới <label>職業</label>; giá trị lưu ở insurance.pat_op.
 *  - カルテ1号紙: POST /tenant/report/{patNo}/ccta-datasource (BuildCctaDatasourceHandler.cs) — một dòng
 *    CCTA1, ô 「職業」 = mst_code 9 any_val1 tra theo NGÀY tenant (GetAnyVal1MapAsync lọc kỳ hiệu lực,
 *    đọc thẳng view mst_code, không qua cache). Từ BE 7564a9ebc ẩn KHÔNG còn đóng kỳ (view chỉ đặt hidden_on /
 *    pickable — web-core offeredOn: 「Hiding leaves the period alone, so a stored code keeps its name」; commit:
 *    「記録に保存済みのコードは引き続き表示する」) ⇒ bản ghi đang lưu mã ẩn VẪN in tên. LỆCH WinForm
 *    CodMst.getCodMstData (lọc DEL_FLG = 0 ⇒ ô trống) — có chủ ý theo commit, cần người quyết nếu đòi parity.
 *  - 診療入力 header (patient-info-header.tsx): 「種別: <保険種別>・<続柄>・<単独/併用>」 (buildKubun1).
 *  - 会計 (/counter-payments/{patNo}, counter-payment-detail.tsx): 入金区分 (mst_code 17) tự chọn mã đầu
 *    tiên; 領収書タイプ (mst_code 24) — combo hiện tên tenant đã ghi đè.
 *
 * GHI (TEST_ALLOW_SAVE=1, TEST_DB=1): đổi quyền nhóm 9 (trả lại ở afterAll), override của
 * tenant (xoá hết ở afterAll), bệnh nhân 990740 / 990741 (xoá hẳn), user 「E2Eコード区分…」 (xoá hẳn).
 * Login: authedPage + 1 admin API.
 *   npx playwright test tests/mst-code/code-business-flows.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 240_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec ghi override, bệnh nhân, user')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân / dọn user')

const CUSTOM = OWN_CODE.min + 950
const PAT = SEED_PAT_NO_BASE + 740
const PAT_ACC = SEED_PAT_NO_BASE + 741
const USER_OK = 'E2Eコード区分　衛生士'

const N = {
    kbnRenamed: 'E2E衛生士',
    jobRenamed: 'E2E会社員',
    jobCustom: 'E2E独自職業',
    jobCustom2: 'E2E独自職業改',
    insKbnRenamed: 'E2E社保',
    receKbnRenamed: 'E2E現金',
    receType: 'A5サイズ(金額のみ)',
    receTypeRenamed: 'E2E領収書A5',
}

/** Các nhóm spec đụng tới — afterAll trả về nguyên trạng. */
const GROUPS = [1, 9, 17, 24, 30] as const

test.describe('Nghiệp vụ dùng mã đã tuỳ biến — ghi rồi đọc lại', () => {
    let page: Page
    let step: () => Promise<void>
    let admin: AdminApi
    const originals = new Map<number, CodeType>()

    const fkey = (n: number): Locator => page.locator(`[data-fkey="F${n}"]`).first()

    /** Ô điều khiển nằm cạnh <label>text</label> (FieldRow không gắn id / aria-label). */
    const fieldBox = (label: string): Locator =>
        page
            .locator('div')
            .filter({ has: page.locator('label').filter({ hasText: new RegExp(`^${label}\\s*\\*?$`) }) })
            .last()

    async function gotoUntil(path: string, ready: () => Locator): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(path, { waitUntil: 'domcontentloaded' })
            try {
                await expect(ready()).toBeVisible({ timeout: 60_000 })
                await step()
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    async function optionsOf(trigger: Locator): Promise<string[]> {
        await trigger.click()
        const options = page.getByRole('option')
        await expect(options.first()).toBeVisible()
        const texts = (await options.allInnerTexts()).map((t) => t.trim())
        // KHÔNG dùng Escape: ở 患者登録 Escape đưa màn về 患者選択. Bấm lại mục đang chọn (không đổi gì);
        // combo chưa có mục nào được chọn thì mới dùng Escape.
        const current = page.getByRole('option', { selected: true }).first()
        if (await current.isVisible().catch(() => false)) await current.click()
        else await page.keyboard.press('Escape')
        await expect(options.first()).toBeHidden()
        return texts
    }

    async function purgeUsers(): Promise<void> {
        await withDb(async (c) => {
            const target = `(SELECT id FROM app_user WHERE display_name = ANY($1))`
            const names = [USER_OK]
            await c.query(`DELETE FROM app_user_invite_token WHERE user_id IN ${target}`, [names])
            await c.query(`DELETE FROM app_user_role WHERE user_id IN ${target}`, [names])
            await c.query(`DELETE FROM app_user WHERE display_name = ANY($1)`, [names])
            await c.query(`DELETE FROM app_user_deleted WHERE display_name = ANY($1)`, [names]).catch(() => {})
        })
    }

    async function cleanAccounting(): Promise<void> {
        await withDb(async (c) => {
            for (const t of ['unpaid', 'unpaid_deleted', 'acc_dat']) await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [PAT_ACC])
        })
    }

    /** Datasource カルテ1号紙 của bệnh nhân PAT; trả ô 「職業」 của dòng CCTA1. */
    async function cctaJob(): Promise<string> {
        const token = await adminToken(page)
        const res = await page
            .context()
            .request.post(`${BASE_URL}api/tenant/report/${PAT}/ccta-datasource`, {
                headers: bearer(token),
                data: { patBr: 1, insKbn: 1 },
            })
        expect(res.status(), `ccta-datasource: ${await res.text()}`).toBeLessThan(300)
        const find = (v: unknown): Record<string, unknown> | null => {
            if (Array.isArray(v)) {
                for (const x of v) {
                    const hit = find(x)
                    if (hit) return hit
                }
            } else if (v && typeof v === 'object') {
                if ('職業' in v) return v as Record<string, unknown>
                for (const x of Object.values(v)) {
                    const hit = find(x)
                    if (hit) return hit
                }
            }
            return null
        }
        const row = find(await res.json())
        expect(row, 'không thấy dòng CCTA1 có cột 職業 trong response').not.toBeNull()
        return String(row!['職業'] ?? '')
    }

    async function patOp(): Promise<number | null> {
        return withDb(async (c) => {
            const r = await c.query<{ pat_op: number | null }>('SELECT pat_op FROM insurance WHERE pat_no = $1 AND pat_br = 1', [PAT])
            return r.rows[0]?.pat_op ?? null
        })
    }

    /** F9 登録 ở 患者登録: đóng mọi hộp xác nhận/thông báo, chờ PUT /tenant/patients. */
    async function savePatient(): Promise<number> {
        const pending = page.waitForResponse(
            (r) => r.url().includes('/tenant/patients') && ['PUT', 'POST'].includes(r.request().method()),
            { timeout: 60_000 },
        )
        pending.catch(() => undefined)
        await fkey(9).click()
        const seen: string[] = []
        for (let i = 0; i < 6; i++) {
            const dlg = page.locator('[role="alertdialog"]').first()
            if (!(await dlg.isVisible({ timeout: 2_000 }).catch(() => false))) break
            seen.push((await dlg.innerText()).replace(/\s+/g, ' '))
            // Lưu xong app tự về 患者選択 ⇒ hộp có thể biến mất trước khi kịp bấm.
            await dlg.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click({ timeout: 5_000 }).catch(() => {})
        }
        const res = await pending.catch(() => null)
        if (!res) throw new Error(`F9 không gửi PUT /tenant/patients. Hộp thoại: ${seen.join(' → ') || '(không)'}`)
        // Thông báo lưu xong (nếu có) hiện SAU response.
        const done = page.locator('[role="alertdialog"]').first()
        if (await done.isVisible({ timeout: 3_000 }).catch(() => false))
            await done.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click({ timeout: 5_000 }).catch(() => {})
        return res.status()
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        admin = await openAdminApi()
        for (const g of GROUPS) {
            originals.set(g, await admin.getType(g))
            await admin.resetGroup(g)
        }
        await admin.enable(9, { rename: true, add: true })
        const full = (name: string) => ({ anyVal1: name, anyVal2: name, sortOrder: 0, startDate: '1900-01-01', endDate: '9999-12-31' })
        await admin.save(30, 1, { ...INHERIT_ALL, anyVal1: N.kbnRenamed })
        await admin.save(9, 1, { ...INHERIT_ALL, anyVal1: N.jobRenamed })
        await admin.add(9, CUSTOM, full(N.jobCustom))
        await admin.save(1, 1, { ...INHERIT_ALL, anyVal1: N.insKbnRenamed })
        await admin.save(17, 1, { ...INHERIT_ALL, anyVal1: N.receKbnRenamed })
        await admin.save(24, 7, { ...INHERIT_ALL, anyVal1: N.receTypeRenamed })

        await purgeUsers()
        // 氏名 phải có khoảng trắng họ/tên và br_dt >= 生年月日, nếu không chuỗi F9 dừng ở validate
        // (xem patient-registration-audit-log.spec.ts).
        await seedTestPatient({ patNo: PAT, patNm: 'コード　業務', patKn: 'こーど　ぎょうむ' })
        await withDb((c) => c.query(`UPDATE insurance SET br_dt = DATE '2000-01-01', pat_op = 1 WHERE pat_no = $1`, [PAT]))
        await cleanAccounting()
        await seedTestPatient({ patNo: PAT_ACC, patNm: 'コード　会計', patKn: 'こーど　かいけい' })
        await seedTreatmentRows(PAT_ACC, TODAY_ISO, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-コード会計E2E' }])
        await withDb((c) =>
            c.query(
                `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt,
                                     rece_kbn, sflg, att_dr, acc_tm, pat_br, lflg)
                 VALUES ($1::date, 1, $2, 40, 40, 120, 0, 0, -1, 1, 1, 1, now(), 1, 0)`,
                [TODAY_ISO, PAT_ACC],
            ),
        )
    })

    test.afterAll(async () => {
        if (admin) {
            for (const g of GROUPS) {
                await admin.resetGroup(g).catch((e) => console.log(`DỌN override nhóm ${g} lỗi: ${e}`))
                const o = originals.get(g)
                if (o) await admin.setType(o).catch((e) => console.log(`TRẢ quyền nhóm ${g} lỗi: ${e}`))
            }
            await admin.dispose()
        }
        await purgeUsers().catch(() => {})
        await cleanAccounting().catch(() => {})
        await deleteTestPatient(PAT).catch(() => {})
        await deleteTestPatient(PAT_ACC).catch(() => {})
        await releaseSharedPage(page)
    })

    // ── ユーザマスタ (nhóm 30) ────────────────────────────────────────────────

    test('A1 — ユーザマスタ 新規: combo 区分 có tên đã ghi đè', async () => {
        const kbn = page.getByRole('combobox', { name: '区分' })
        await gotoUntil('/settings/user-master/new', () => kbn)
        const options = await optionsOf(kbn)
        expect(options).toEqual(expect.arrayContaining(['ドクター', N.kbnRenamed, 'スタッフ']))
        expect(options).not.toContain('衛生士')
    })

    test('A2 — tạo user với 区分 「E2E衛生士」 ⇒ lưu user_kbn = 1, danh sách hiện tên đã ghi đè', async () => {
        await page.getByLabel('氏名', { exact: true }).fill(USER_OK)
        await page.getByRole('combobox', { name: '区分' }).click()
        await page.getByRole('option', { name: N.kbnRenamed, exact: true }).click()
        await fkey(9).click()
        await expect(page).toHaveURL(/\/settings\/user-master$/, { timeout: 30_000 })
        const row = page.locator('[data-testid^="row-"]').filter({ hasText: USER_OK.replace('　', ' ') }).or(
            page.locator('[data-testid^="row-"]').filter({ hasText: USER_OK }),
        )
        await expect(row.first()).toBeVisible({ timeout: 30_000 })
        await expect(row.first()).toContainText(N.kbnRenamed)
        const kbn = await withDb(async (c) =>
            (await c.query<{ user_kbn: number }>('SELECT user_kbn FROM app_user WHERE display_name = $1', [USER_OK])).rows[0]?.user_kbn,
        )
        expect(kbn).toBe(1)
        await captureFixedUi(page, 'mst-code-business-user-master-list')
    })

    // ── 患者登録 + カルテ1号紙 (nhóm 9 職業) ──────────────────────────────────

    test('B1 — 患者登録: bệnh nhân lưu 職業 = 1 hiện 「E2E会社員」; combo có mã riêng, không còn 会社員', async () => {
        const job = () => fieldBox('職業').getByRole('combobox')
        await gotoUntil(`/patients/registration?patientNo=%22${PAT}%22`, job)
        await expect(job()).toContainText(N.jobRenamed)
        const options = await optionsOf(job())
        expect(options).toEqual(expect.arrayContaining([N.jobRenamed, N.jobCustom]))
        expect(options).not.toContain('会社員')
    })

    test('B2 — chọn mã riêng 「E2E独自職業」, F9 ⇒ insurance.pat_op = 30950; mở lại vẫn hiện tên đó', async () => {
        await fieldBox('職業').getByRole('combobox').click()
        await page.getByRole('option', { name: N.jobCustom, exact: true }).click()
        expect(await savePatient(), 'PUT /tenant/patients').toBeLessThan(300)
        expect(await patOp()).toBe(CUSTOM)

        const job = () => fieldBox('職業').getByRole('combobox')
        await gotoUntil(`/patients/registration?patientNo=%22${PAT}%22`, job)
        await expect(job()).toContainText(N.jobCustom)
        await captureFixedUi(page, 'mst-code-business-patient-job-custom')
    })

    test('C1 — カルテ1号紙 datasource: ô 職業 = 「E2E独自職業」', async () => {
        expect(await cctaJob()).toBe(N.jobCustom)
    })

    test('C2 — đổi tên mã riêng ở tenant ⇒ datasource đổi ngay (không cache)', async () => {
        await admin.save(9, CUSTOM, { anyVal1: N.jobCustom2, anyVal2: N.jobCustom2, sortOrder: 0, startDate: '1900-01-01', endDate: '9999-12-31' })
        expect(await cctaJob()).toBe(N.jobCustom2)
    })

    // ── Bản ghi cũ khi mã bị ẩn ──────────────────────────────────────────────

    test('D1 — ẩn mã 30950: カルテ1号紙 vẫn in tên đang lưu (ẩn không đóng kỳ — lệch getCodMstData có chủ ý)', async () => {
        await admin.hide(9, CUSTOM)
        expect(await cctaJob(), 'ẩn chỉ bỏ mã khỏi combo, bản ghi đang lưu giữ tên (BE 7564a9ebc)').toBe(N.jobCustom2)
    })

    test('D2 — ẩn mã 30950: bệnh nhân ĐANG LƯU mã đó vẫn thấy nó ở ô và trong combo 職業 (insurance-section codesOfferedWith)', async () => {
        // BE 7564a9ebc: 「主訴・職業の選択肢は非表示のコードを除き、記録に保存済みのコードは引き続き表示する」.
        // Mã ẩn rơi khỏi combo của bệnh nhân KHÔNG lưu nó — tenant-code-settings.spec.ts TC-14.
        const job = () => fieldBox('職業').getByRole('combobox')
        await gotoUntil(`/patients/registration?patientNo=%22${PAT}%22`, job)
        await expect(job()).toContainText(N.jobCustom2)
        const options = await optionsOf(job())
        expect(options, 'mã bản ghi đang lưu phải còn được đưa ra dù đã ẩn').toContain(N.jobCustom2)
        await captureFixedUi(page, 'mst-code-business-patient-job-hidden')
    })

    test('D3 — F9 không đụng 職業 trên bản ghi đang lưu mã ẩn ⇒ lưu được, pat_op giữ 30950 (MstCodeChoice: giá trị đang lưu luôn qua)', async () => {
        // Mở lại cho state sạch (D2 đã mở/đóng combo).
        await gotoUntil(`/patients/registration?patientNo=%22${PAT}%22`, () => fieldBox('職業').getByRole('combobox'))
        expect(await savePatient(), 'PUT /tenant/patients').toBeLessThan(300)
        expect(await patOp()).toBe(CUSTOM)
    })

    // ── 診療入力 header (nhóm 1 保険種別) ─────────────────────────────────────

    test('F1 — 診療入力: 「種別:」 ở header bắt đầu bằng tên 保険種別 đã ghi đè', async () => {
        // PAT_ACC chứ không phải PAT: F9 ở 患者登録 (B2/D3) ghi lại 保険 của PAT nên ins_kbn không còn là 1.
        const insKbn = await withDb(async (c) =>
            (await c.query<{ ins_kbn: number }>('SELECT ins_kbn FROM insurance WHERE pat_no = $1 AND pat_br = 1', [PAT_ACC])).rows[0]?.ins_kbn,
        )
        expect(insKbn, 'bệnh nhân seed phải có ins_kbn = 1 (社保)').toBe(1)
        const kubun = () => page.getByText('種別:', { exact: true }).locator('..')
        await gotoUntil(`/treatments/${PAT_ACC}?trtDt=${TODAY_ISO}`, kubun)
        await expect(kubun()).toContainText(`${N.insKbnRenamed}・`)
        await captureFixedUi(page, 'mst-code-business-treatment-header')
    })

    // ── 会計 (nhóm 17 入金区分, 24 領収書タイプ) ─────────────────────────────

    test('F2 — 会計: 入金区分 tự chọn 「E2E現金」; 領収書タイプ hiện tên đã ghi đè thay tên chung', async () => {
        await gotoUntil(`/counter-payments/${PAT_ACC}`, () => page.getByText('入金日').first())
        const receKbn = page.locator('div').filter({ has: page.getByText('入金区分', { exact: true }) }).last().getByRole('combobox')
        await expect(receKbn).toContainText(N.receKbnRenamed)
        const receType = page.locator('div').filter({ has: page.getByText('領収書タイプ', { exact: true }) }).last().getByRole('combobox')
        const options = await optionsOf(receType)
        expect(options).toContain(N.receTypeRenamed)
        expect(options).not.toContain(N.receType)
        await captureFixedUi(page, 'mst-code-business-counter-payment')
    })
})
