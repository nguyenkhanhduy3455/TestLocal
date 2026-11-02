import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { openPatientRegistration } from '../_shared/entry'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 8: hộp con ở 編集 — F5 主訴, F6 会計情報, Shift+F1 診療開始日,
 * Shift+F2 変更, Shift+F3 スキャナ取込, Shift+F4 福祉医療, F2 資格確認.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Khung chung (OchaFramework Forms/BaseDialog.cs:314-325, BaseDialog2.cs:190-201): ESC và End
 *      = F9 nếu F9 bật; F10 = Close.
 *  - F5 主訴 PAT/Forms/frm201004.cs: nhãn 主訴１…７ (Designer), F9 ghi `cboPatCcN.Text` — CHỮ,
 *      không phải CD_VAL — vào PERSON.pat_cc1..7 (:203-217, Person.cs:481-512).
 *  - F6 会計情報 frm201005.cs: 11 ô CustomTextBoxNum MaxLength 10, chỉ nhận số (Designer :92-297);
 *      F9 UPDATE PERSON_EXP (PersonExp.cs:193-232).
 *  - Shift+F1 frm201011.cs: lưới 枝番/診療年月/初回日/最終日/診療開始日, năm 2 chữ số
 *      (Trntrn.cs:892-940 `RIGHT('00'+y,2)年`); F9 → 日付入力 frm902004; F1 保存 hỏi Q00002
 *      「更新してよろしいですか？」, OK thì UPDATE TRNTRN + LUÔN tính lại INSURANCE med_st_dt/med_ed_dt
 *      cho mọi 枝番, kể cả khi không sửa dòng nào (:270-336, Insurance.cs:872-895).
 *  - Shift+F2 frm201013.cs: F9 sai ngày ⇒ E00002("日付") 「日付が間違っています。」 (:93-98);
 *      không ghi DB, chỉ đổ về các tab (frm201001.cs:341-385).
 *  - Shift+F3 frm201012.cs: nhãn trang 「0 / 0」 khi rỗng (Designer :389, :269-281); F8 LUÔN hỏi
 *      Q00006 「選択されている画像を削除します。よろしいですか？」 kể cả khi không tick ô nào (:170-190).
 *  - Shift+F4 INI/Forms/frm506006.cs: danh sách LOCALFLG `order by insurer_no, exp_st_dt` (LocalFlg.cs:74-195).
 *  - F2 資格確認 frm201041.cs: 記号 = ins_mk đã lưu (:159-188); F10 trả ComParam null ⇒ frm201001
 *      không làm gì (frm201001.cs:405).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1 + TEST_ALLOW_SAVE=1 — F5/F6/Shift+F1 ghi thật; afterAll xoá sạch)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990910: med_ins_inf 保険者番号 03010204 (pat_utl: 記号 ứng viên 稚内, てしお), 記号 lưu = てしお.
 *    trn_trn 2026-09-10 và 2026-10-01 (再診), med_st_dt 2026-09-10, bt_dt = năm/tháng của trt_dt.
 *
 * Hai khối: 「hành vi」 SERIAL; 「parity」 KHÔNG serial, mỗi test tự dựng lại phần nó cần.
 */

const PAT = SEED_PAT_NO_BASE + 910
const DIALOG_TIMEOUT = 30_000
const allowSave = process.env.TEST_ALLOW_SAVE === '1'

test.describe.configure({ retries: 0, timeout: 180_000 })

async function seedTrn(): Promise<void> {
    await seedTreatmentRows(PAT, '2026-09-10', [{ trtCd: 110, trtPt: 59, dspTrt: '再診' }])
    await seedTreatmentRows(PAT, '2026-10-01', [{ trtCd: 110, trtPt: 59, dspTrt: '再診' }])
    await withDb(async (c) => {
        await c.query(
            `UPDATE trn_trn SET med_st_dt = DATE '2026-09-10', del_flg = 0,
                    bt_dt_1 = EXTRACT(YEAR FROM trt_dt), bt_dt_2 = EXTRACT(MONTH FROM trt_dt)
              WHERE pat_no = $1`,
            [PAT],
        )
        await c.query(`UPDATE insurance SET med_st_dt = DATE '2026-09-10', med_ed_dt = NULL WHERE pat_no = $1`, [PAT])
    })
}

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: PAT, patNm: 'イーツーイー　ナイブ', patKn: 'いーつーいー　ないぶ' })
    await withDb(async (c) => {
        await c.query('DELETE FROM med_ins_inf WHERE pat_no = $1', [PAT])
        await c.query(
            `INSERT INTO med_ins_inf (pat_no, medinsinf_no, fm_type, ben_rate, ins_no, ins_mk, ins_seq)
             VALUES ($1, 1, 1, 70, '03010204', 'てしお', '123')`,
            [PAT],
        )
        await c.query(
            `UPDATE insurance SET br_dt = DATE '2000-01-01', medinsinf_no = 1, bur_rate = 30, acc_rate = 30 WHERE pat_no = $1`,
            [PAT],
        )
    })
    await seedTrn()
})

test.afterAll(async () => {
    if (!dbEnabled) return
    await withDb(async (c) => {
        await c.query('DELETE FROM med_ins_inf WHERE pat_no = $1', [PAT])
        await c.query('DELETE FROM med_ins_inf_deleted WHERE pat_no = $1', [PAT])
    })
    await deleteTestPatient(PAT)
})

async function one<T>(sql: string): Promise<T | undefined> {
    return withDb(async (c) => (await c.query(sql, [PAT])).rows[0] as T | undefined)
}

const isoDate = (d: Date | null | undefined) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const main = () => page().locator('main')
    /** Hộp con: native `<dialog open>` hoặc `[role=dialog]`, lọc theo tiêu đề (có/không khoảng trắng). */
    const dlg = (title: string): Locator =>
        page()
            .locator('dialog[open], [role="dialog"]:visible')
            .filter({ hasText: new RegExp(title.split('').join('\\s*')) })
            .last()
    const dkey = (d: Locator, k: string) => d.locator(`[data-fkey="${k}"]:visible`).first()
    const alert = () => page().getByRole('alertdialog').first()
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

    async function setShift(on: boolean): Promise<void> {
        const t = main().locator('button[aria-pressed]:visible').first()
        if ((await t.getAttribute('aria-pressed')) !== String(on)) await t.click()
        await expect(t).toHaveAttribute('aria-pressed', String(on))
    }

    async function open(key: string, shift: boolean, title: string): Promise<Locator> {
        await setShift(shift)
        await main().locator(`[data-fkey="${key}"]:visible`).first().click()
        const d = dlg(title)
        await expect(d).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await setShift(false).catch(() => undefined)
        return d
    }

    /** Shift+F3 スキャナ取込; đóng hộp E00024 thư mục ảnh (patPath không có trên máy chạy — xem P-13). */
    async function openScanner(): Promise<Locator> {
        const d = await open('F3', true, 'スキャナ取込')
        const folderMissing = alert().filter({ hasText: /患者画像フォルダ/ })
        if (await folderMissing.waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)) {
            await folderMissing.getByRole('button').first().click()
            await expect(folderMissing).toBeHidden()
        }
        return d
    }

    /** Đóng hộp bằng F10; trả câu hỏi nếu có hộp xác nhận bật lên (rồi trả lời いいえ). */
    async function closeF10(d: Locator): Promise<string | null> {
        await dkey(d, 'F10').click()
        const shown = await alert()
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false)
        if (!shown) {
            await expect(d).toBeHidden()
            return null
        }
        const text = flat(await alert().innerText())
        await alert().getByRole('button', { name: /^(いいえ|キャンセル)$/ }).first().click()
        await expect(page().getByRole('alertdialog')).toHaveCount(0)
        return text
    }
    return { main, dlg, dkey, alert, flat, setShift, open, openScanner, closeF10 }
}

test.describe('患者登録 (frm201001) — hộp con ở 編集: hành vi', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { main, dkey, alert, flat, open, closeF10 } = helpers(() => page)

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

    test('TC-1 — F5 主訴: 7 ô, chữ tự do → F9 ghi person.pat_cc_2, mở lại còn chữ', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1 (F9 ghi PERSON)')
        await openPatientRegistration(page, String(PAT))
        const d = await open('F5', false, '主訴登録')
        await step()
        await expect(d.locator('input')).toHaveCount(7)
        await d.locator('input').nth(1).fill('E2E主訴テスト')
        await d.locator('input').nth(1).press('Tab')
        await dkey(d, 'F9').click()
        await expect(d).toBeHidden({ timeout: DIALOG_TIMEOUT })
        await expect.poll(async () => (await one<{ v: string }>('SELECT pat_cc_2 AS v FROM person WHERE pat_no = $1'))?.v).toBe('E2E主訴テスト')
        const again = await open('F5', false, '主訴登録')
        await expect(again.locator('input').nth(1)).toHaveValue('E2E主訴テスト')
        expect(await closeF10(again)).toBeNull()
    })

    test('TC-2 — F6 会計情報: 11 nhãn đúng thứ tự WinForm; F9 ghi person_exp.ins_total', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1 (F9 ghi PERSON_EXP)')
        const d = await open('F6', false, '会計情報編集')
        await step()
        const labels = [
            '保険診療累計', '自由診療累計', '自由診療消費税累計', '物品販売累計', '物品販売消費税累計',
            '未収金残保険', '未収金残自費', '未収金残自費消費税', '未収金残物品', '未収金残物品消費税', '預かり金残',
        ]
        const text = flat(await d.innerText())
        let at = -1
        for (const l of labels) {
            const i = text.indexOf(l, at + 1)
            expect(i, `nhãn 「${l}」 sai thứ tự (frm201005.Designer :92-297)`).toBeGreaterThan(at)
            at = i
        }
        await expect(d.locator('input')).toHaveCount(11)
        await d.locator('input').first().fill('1234')
        await dkey(d, 'F9').click()
        await expect(d).toBeHidden({ timeout: DIALOG_TIMEOUT })
        await expect.poll(async () => (await one<{ v: number }>('SELECT ins_total AS v FROM person_exp WHERE pat_no = $1'))?.v).toBe(1234)
    })

    test('TC-3 — Shift+F1 診療開始日: sửa dòng 10月 → F1 保存 → Q00002 OK ⇒ trn_trn + insurance cập nhật', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1 (F1 ghi TRNTRN/INSURANCE)')
        await openPatientRegistration(page, String(PAT))
        const d = await open('F1', true, '診療開始日設定')
        await step()
        await expect(d.getByText('イーツーイー　ナイブ')).toBeVisible()
        // ORDER BY PAT_BR DESC, KEY_BT_DT DESC (Trntrn.cs:892-940) ⇒ 10月 trước 09月.
        const months = flat(await d.innerText()).match(/令和\d+年\d+月(?!\d)/g) ?? []
        expect(months.slice(0, 2)).toEqual([expect.stringMatching(/10月$/), expect.stringMatching(/09月$/)])
        await d.getByText(/令和\d+年10月$/).first().click()
        await dkey(d, 'F9').click()
        const picker = page.getByRole('dialog').filter({ hasText: '日付入力' }).last()
        await expect(picker).toBeVisible()
        const day = picker.locator('input').nth(2)
        await day.fill('15')
        await day.press('Tab')
        await dkey(picker, 'F9').click()
        await expect(picker).toBeHidden()
        await dkey(d, 'F1').click()
        await expect(alert()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        expect(flat(await alert().innerText())).toContain('更新してよろしいですか？')
        await alert().getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        await expect(d).toBeHidden({ timeout: DIALOG_TIMEOUT })
        const trn = await one<{ d: Date }>(`SELECT med_st_dt AS d FROM trn_trn WHERE pat_no = $1 AND trt_dt = DATE '2026-10-01'`)
        expect(isoDate(trn?.d)).toBe('2026-09-15')
        const ins = await one<{ st: Date; ed: Date }>('SELECT med_st_dt AS st, med_ed_dt AS ed FROM insurance WHERE pat_no = $1')
        expect([isoDate(ins?.st), isoDate(ins?.ed)]).toEqual(['2026-09-15', '2026-10-01'])
        await seedTrn()
    })

    test('TC-4 — Shift+F2 変更: đổi 性別 → 確定 ⇒ form hiện 女性, DB chưa đổi (lưu ở F9 chính)', async () => {
        await openPatientRegistration(page, String(PAT))
        const d = await open('F2', true, '変更')
        await step()
        const sexSel = d.getByRole('combobox').last()
        await expect(sexSel, '性別 điền sẵn từ tab đang chọn (frm201001.cs:341-358)').toHaveText('男性')
        await sexSel.click()
        await page.getByRole('option', { name: '女性' }).click()
        await dkey(d, 'F9').click()
        await expect(d).toBeHidden()
        await expect(main().getByRole('combobox').filter({ hasText: /^女/ }).first()).toBeVisible()
        const sex = await one<{ v: number }>('SELECT sex_1 AS v FROM insurance WHERE pat_no = $1')
        expect(sex?.v, 'Shift+F2 không được ghi DB (frm201013 F9 chỉ trả ComParam)').toBe(1)
    })

    test('TC-5 — Shift+F4 福祉医療: mở 福祉医療設定 có lưới; F10 đóng', async () => {
        await openPatientRegistration(page, String(PAT))
        const d = await open('F4', true, '福祉医療設定')
        await step()
        for (const h of ['福祉医療', '有効開始日', '有効終了日', '会計', '負担率', '上限金額', '名称']) {
            await expect(d.getByText(h, { exact: true }).first()).toBeVisible()
        }
        await dkey(d, 'F10').click()
        await expect(d).toBeHidden()
    })

    test('TC-6 — F2 資格確認: điền sẵn 保険者番号/番号 của 枝番 đang chọn, 資格確認日 = hôm nay', async () => {
        const d = await open('F2', false, 'オンライン資格確認')
        await step()
        await expect(d.locator('input').nth(0)).toHaveValue('03010204')
        await expect(d.locator('input').nth(2)).toHaveValue('123')
        await expect(d.getByText(/≪患者番号.990910≫/)).toBeVisible()
        await closeF10(d)
    })
})

test.describe('患者登録 (frm201001) — hộp con ở 編集: parity', () => {
    let page: Page
    const { dlg, dkey, alert, flat, open, openScanner, closeF10 } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.beforeEach(async () => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
        await openPatientRegistration(page, String(PAT))
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('P-1 (parity) — F5 主訴: chọn mục từ danh sách thì lưu CHỮ (frm201004.cs:203-217), không lưu mã', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1')
        const opt = await one<{ t: string }>('SELECT any_val1 AS t FROM mst_code WHERE cd_type = 16 AND cd_val = 1 AND $1 > 0')
        const d = await open('F5', false, '主訴登録')
        await d.getByRole('button', { name: '主訴１-list', exact: true }).click()
        await page.getByRole('option', { name: opt!.t, exact: true }).click()
        await dkey(d, 'F9').click()
        await expect(d).toBeHidden({ timeout: DIALOG_TIMEOUT })
        const saved = await one<{ v: string }>('SELECT pat_cc_1 AS v FROM person WHERE pat_no = $1')
        expect(saved?.v).toBe(opt!.t)
    })

    test('P-2 (parity) — F5 主訴: nhãn 主訴１…７ chữ số toàn角 (frm201004.Designer :58-211)', async () => {
        const d = await open('F5', false, '主訴登録')
        const text = flat(await d.innerText())
        await closeF10(d)
        for (const n of '１２３４５６７') expect(text).toContain(`主訴${n}`)
    })

    test('P-3 (parity) — F5 主訴: ESC = F9 登録 — lưu rồi đóng (BaseDialog.cs:320-325)', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1')
        const d = await open('F5', false, '主訴登録')
        await d.locator('input').nth(2).fill('ESC主訴')
        await d.locator('input').nth(2).press('Tab')
        await page.keyboard.press('Escape')
        const closed = await d.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true).catch(() => false)
        if (!closed) await closeF10(d)
        expect(closed, 'ESC không đóng hộp').toBe(true)
        expect((await one<{ v: string }>('SELECT pat_cc_3 AS v FROM person WHERE pat_no = $1'))?.v).toBe('ESC主訴')
    })

    test('P-4 (parity) — F6 会計情報: ô nhận tối đa 10 chữ số (CustomTextBoxNum MaxLength 10)', async () => {
        const d = await open('F6', false, '会計情報編集')
        const box = d.locator('input').nth(1)
        await box.click()
        await box.press('ControlOrMeta+a')
        await page.keyboard.type('123456789012')
        const v = await box.inputValue()
        await closeF10(d)
        expect(v).toBe('1234567890')
    })

    test('P-5 (parity) — Shift+F1: năm 2 chữ số 「令和08年10月01日」 (Trntrn.cs:892-940)', async () => {
        const d = await open('F1', true, '診療開始日設定')
        const text = flat(await d.innerText())
        await closeF10(d)
        expect(text).toContain('令和08年10月01日')
    })

    test('P-6 (parity) — Shift+F1: F1 保存 KHÔNG sửa gì vẫn tính lại insurance.med_ed_dt (frm201011.cs:270-336)', async () => {
        skipWithReason(!allowSave, 'Cần TEST_ALLOW_SAVE=1')
        await seedTrn()
        const d = await open('F1', true, '診療開始日設定')
        await dkey(d, 'F1').click()
        await expect(alert()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await alert().getByRole('button', { name: /^(OK|はい)$/ }).first().click()
        await expect(d).toBeHidden({ timeout: DIALOG_TIMEOUT })
        const ins = await one<{ ed: Date | null }>('SELECT med_ed_dt AS ed FROM insurance WHERE pat_no = $1')
        expect(isoDate(ins?.ed), 'med_ed_dt = MAX(trt_dt)').toBe('2026-10-01')
    })

    test('P-7 (parity) — Shift+F2: ngày sai ⇒ E00002 「日付が間違っています。」 (frm201013.cs:93-98)', async () => {
        const d = await open('F2', true, '変更')
        const day = d.locator('input').nth(2)
        await day.fill('32')
        await day.press('Tab')
        await dkey(d, 'F9').click()
        await expect(alert()).toBeVisible({ timeout: DIALOG_TIMEOUT })
        const text = flat(await alert().innerText())
        await alert().getByRole('button').first().click()
        await closeF10(dlg('変更'))
        expect(text).toContain('日付が間違っています。')
        expect(text).not.toContain('生年月日')
    })

    test('P-8 (parity) — Shift+F3 スキャナ取込 rỗng: nhãn trang 「0 / 0」 (frm201012.Designer :389)', async () => {
        const d = await openScanner()
        await page.waitForTimeout(1_500)
        const text = flat(await d.innerText())
        await closeF10(d)
        expect(text).toMatch(/(^|[^\d])0 \/ 0/)
    })

    test('P-9 (parity) — Shift+F3: F8 削除 khi chưa tick vẫn hỏi Q00006 (frm201012.cs:170-190)', async () => {
        const d = await openScanner()
        await dkey(d, 'F8').click()
        const shown = await alert().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false)
        const text = shown ? flat(await alert().innerText()) : null
        if (shown) await alert().getByRole('button', { name: /^(いいえ|キャンセル|No)$/ }).first().click()
        await closeF10(d)
        expect(text).toContain('選択されている画像を削除します。よろしいですか？')
    })

    test('P-10 (parity) — Shift+F4 福祉医療: lưới mặc định insurer_no TĂNG dần (LocalFlg.cs:74-195)', async () => {
        const d = await open('F4', true, '福祉医療設定')
        await expect(d.getByText('R23/04/01').first().or(d.getByText(/^[RHS]\d\d\/\d\d\/\d\d$/).first())).toBeVisible()
        const cells = flat(await d.innerText()).split(' 名称 ')[1]?.split(' ') ?? []
        const first = cells.find((c) => /^\d+$/.test(c)) ?? ''
        await dkey(d, 'F10').click()
        const min = await one<{ v: string }>(
            `SELECT min(insurer_no) AS v FROM local_flg WHERE insurer_no NOT LIKE '27%' AND $1 > 0`,
        )
        expect(first).toBe(min?.v)
    })

    test('P-11 (parity) — F2 資格確認: 記号 giữ ins_mk đã lưu 「てしお」 (frm201041.cs:159-188)', async () => {
        const d = await open('F2', false, 'オンライン資格確認')
        await page.waitForTimeout(1_500)
        const mk = await d.locator('input').nth(1).inputValue()
        await closeF10(d)
        expect(mk).toBe('てしお')
    })

    test('P-12 (parity) — F2 資格確認: F10 ở 編集 đóng êm, không hỏi gì (frm201001.cs:405)', async () => {
        const d = await open('F2', false, 'オンライン資格確認')
        const asked = await closeF10(d)
        expect(asked, 'đóng 資格確認 lại bật câu hỏi').toBeNull()
    })

    test('P-13 (parity) — Shift+F3: thư mục ảnh bệnh nhân không có ⇒ E00024 (frm201012.cs:513-518, đo FlaUI D5)', async () => {
        // Cả hai bên cùng cấu hình patPath = Z:\DAT\img\患者 — không tồn tại trên máy chạy.
        const d = await open('F3', true, 'スキャナ取込')
        const shown = await alert().waitFor({ timeout: 8_000 }).then(() => true).catch(() => false)
        const text = shown ? flat(await alert().innerText()) : null
        if (shown) await alert().getByRole('button').first().click()
        await closeF10(d)
        expect(text).toMatch(/患者画像フォルダ（.*）がありません。/)
    })

    test('P-14 (parity) — F2 資格確認: 開示 khi chưa lưu cờ = 「未同意」 (frm201041.cs:159-188, đo FlaUI D7)', async () => {
        const d = await open('F2', false, 'オンライン資格確認')
        const text = flat(await d.innerText())
        await closeF10(d)
        expect(text).toMatch(/開示\*? 未同意/)
    })
})
