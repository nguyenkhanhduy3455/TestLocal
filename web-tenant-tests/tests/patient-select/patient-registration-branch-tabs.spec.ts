import { type Locator, type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 患者登録 (frm201001) — nhóm 3: tab 枝番 (追加 / 削除 / chuyển tab).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm (PAT/Forms/frm201001.cs)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - :768 `btnAdd_Click`: khoá 追加 NGAY; chèn tab `NEW<max+1>` vào ĐẦU (:2888);
 *      hỏi ShowYesNoMsg「<tab đang chọn>の保険情報、及び公費情報をコピーしますか？」.
 *        · はい  ⇒ giữ nguyên 保険/公費 của tab nguồn.
 *        · いいえ ⇒ ins_kbn=6 (自費), combi_kbn=1, medins mới (trống)…
 *      Cả hai: br_dt (患者情報有効日) + conf_dt1..6 xoá trống. Chọn tab mới.
 *      追加 chỉ bật lại ở `tabMain_tabPages_init` (:2924) — tức nạp lại màn.
 *  - :833 `btnDel_Click`:
 *        · TabCount <= 1 ⇒ ShowWarningMsg W00001
 *          「患者情報を全て削除する場合は、F8削除ボタンを使用して下さい。」 (⚠ vàng —
 *          tools/winform-dialog-catalog.tsv:1607).
 *        · có trn_trn của 枝番 đó ⇒ E00004「選択されている患者情報の処置データが存在する為、
 *          ⏎削除できません。」 (catalog:1608).
 *        · còn lại ⇒ Q00006「選択されている患者情報を削除します。よろしいですか？」 OK ⇒
 *          bỏ tab khỏi màn (CHƯA ghi DB — F9 mới ghi).
 *      Điều kiện W00001 là số TAB trên màn, không phải số dòng DB: có NEW2 chưa lưu
 *      thì vẫn xoá được tab đã lưu duy nhất.
 *  - :2903 nhãn tab đã lưu = `pat_br + "：" + getWareki(br_dt) + "～"`;
 *      `EraTbl.getWrekiKnji` (Lib/EraTbl.cs:119) = 元号 + năm/tháng/ngày ĐỆM 2 SỐ
 *      ⇒ 「1：平成12年01月01日～」 (dấu hai chấm TOÀN GÓC).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — web
 * ═══════════════════════════════════════════════════════════════════════════
 *  - patient-detail-form.tsx:593 `handleDuplicate` — cùng hai nhánh はい/いいえ;
 *      :1647 追加 disabled khi `addUsed || branches.some(isNew)`.
 *  - `branchTabLabel` = `${patBr}：${formatIsoJapaneseEraDate(br_dt)}～` ⇒ 「1：平成12年01月01日～」,
 *      khớp WinForm — TC-9/TC-10 đo.
 *  - :1332 `handleRemoveActiveBranch`: 1 tab ⇒ alert 「これ以上削除できません。」 (KHÁC
 *      W00001 — TC-11 đo); tab đã lưu ⇒ GET /patients/{patNo}/deletable?patBr=.
 *  - api PatientDeleteGuard.cs:27 `CheckBranchAsync`: số dòng insurance TRONG DB <= 1
 *      ⇒ 「これ以上削除できません。」 — đếm DB, không đếm tab ⇒ TC-12 đo.
 *      có trn_trn của 枝番 ⇒ 「選択されている患者情報の処置データが存在する為、削除できません。」.
 *  - shared/locales/ja-msgtbl.ts:190 Q00006 = 「選択されている{0}を削除します。よろしいですか？」.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU (cần TEST_DB=1) — KHÔNG F9, không ghi gì qua UI
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 990893: một 枝番, br_dt 2000-01-01 (= 平成12年1月1日), 保険種別 社保 (ins_kbn=1).
 *  - 990894: hai 枝番 — pat_br 1 (br_dt 2000-01-01, có MỘT dòng trn_trn) và
 *    pat_br 2 (br_dt 2010-01-01 = 平成22年1月1日, không 処置).
 *  Xoá cả hai ở afterAll (deleteTestPatient dọn cả trn_trn).
 *
 * Hai khối: 「cơ bản」 SERIAL, nối tiếp; 「parity」 KHÔNG serial — mỗi TC tự mở màn,
 * đỏ cái nào không kéo cái khác (đổi lại mỗi TC đỏ = thêm một lần login).
 */

const DIALOG_TIMEOUT = 30_000

const ONE_BR = String(SEED_PAT_NO_BASE + 893)
const TWO_BR = String(SEED_PAT_NO_BASE + 894)
/** 担当医/衛生士 như bệnh nhân thật — xem patient-registration-exit-guard TC-9. */
const ATT_DR = 1
const ATT_ST = 100

/** Nhãn tab đã lưu = WinForm (frm201001.cs:2903 + getWrekiKnji); web khớp từ patient-detail-form `branchTabLabel`. */
const TAB1 = '1：平成12年01月01日～'
const TAB2 = '2：平成22年01月01日～'

const Q00006 = '選択されている患者情報を削除します。よろしいですか？'
const W00001 = '患者情報を全て削除する場合は、F8削除ボタンを使用して下さい。'
const E00004_TRN = '選択されている患者情報の処置データが存在する為、削除できません。'

const copyAsk = (label: string) => `${label}の保険情報、及び公費情報をコピーしますか？`

// Seed DB ở beforeAll/afterAll cấp file. Config để fullyParallel + 4 worker ⇒ không ghim
// thì mỗi describe sang một worker, seed/xoá cùng bệnh nhân đụng nhau giữa các worker.
// 'default' = một worker, đúng thứ tự, nhưng test đỏ không kéo test sau skip theo.
test.describe.configure({ mode: 'default', retries: 0, timeout: 180_000 })

test.beforeAll(async () => {
    if (!dbEnabled) return
    for (const n of [ONE_BR, TWO_BR]) {
        await seedTestPatient({ patNo: Number(n), patNm: 'イーツーイー　患者', patKn: 'いーつーいー　かんじゃ' })
    }
    await withDb(async (c) => {
        await c.query(
            `UPDATE insurance SET br_dt = DATE '2000-01-01' WHERE pat_no = ANY($1::int[])`,
            [[Number(ONE_BR), Number(TWO_BR)]],
        )
        await c.query('UPDATE person SET att_dr = $2, att_st = $3 WHERE pat_no = ANY($1::int[])', [
            [Number(ONE_BR), Number(TWO_BR)],
            ATT_DR,
            ATT_ST,
        ])
        // 枝番 2 = bản sao 枝番 1, chỉ đổi pat_br + br_dt. Cột đọc từ schema (bỏ id).
        const cols = await c.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = current_schema() AND table_name = 'insurance'
                AND column_name NOT IN ('id', 'pat_br', 'br_dt')
              ORDER BY ordinal_position`,
        )
        const list = cols.rows.map((r) => r.column_name).join(', ')
        await c.query(
            `INSERT INTO insurance (pat_br, br_dt, ${list})
             SELECT 2, DATE '2010-01-01', ${list} FROM insurance WHERE pat_no = $1 AND pat_br = 1`,
            [Number(TWO_BR)],
        )
    })
    // trn_trn trên 枝番 1 (seedTreatmentRows rơi về SEED_FALLBACK_PAT_BR = 1).
    await seedTreatmentRows(Number(TWO_BR), '2005-06-01', [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40 }])
})

test.afterAll(async () => {
    if (!dbEnabled) return
    for (const n of [ONE_BR, TWO_BR]) await deleteTestPatient(Number(n))
})

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const main = () => page().locator('main')
    /** Tab 枝番 — tablist đầu; 《公費情報》 có tablist riêng đứng sau. */
    const tabs = (): Locator => main().getByRole('tablist').first().getByRole('tab')
    /** 追加/削除 của header; khu 公費 cũng có nút cùng tên, header đứng trước. */
    const headerButton = (name: '追加' | '削除'): Locator =>
        main().getByRole('button', { name, exact: true }).first()
    const alert = (text: string): Locator => page().getByRole('alertdialog').filter({ hasText: text })
    const button = (dlg: Locator, name: string): Locator =>
        dlg.getByRole('button', { name, exact: true })
    /** Hàng FieldRow theo nhãn (`.last()` — xem patientFieldInput). */
    const row = (label: string): Locator =>
        page()
            .locator('div')
            .filter({ has: page().locator('label').filter({ hasText: new RegExp(`^${label}\\s*\\*?$`) }) })
            .last()
    /**
     * Ô năm của 患者情報有効日. Hàng này dùng `<span>` chứ không `<label>` và mang
     * `data-field="br"` (patient-basic-section.tsx:125); ô năm có tên a11y 「和暦年」.
     */
    const brYear = (): Locator =>
        main().locator('[data-field="br"]').getByRole('textbox', { name: '和暦年' })
    const insKbn = (): Locator => row('保険種別').getByRole('combobox').first()

    /** Đọc text hộp đang nổi trên cùng, gộp khoảng trắng. */
    async function topText(): Promise<string> {
        const dlg = page().getByRole('alertdialog').first()
        await expect(dlg).toBeVisible({ timeout: DIALOG_TIMEOUT })
        return ((await dlg.innerText()) || '').replace(/\s+/g, ' ').trim()
    }
    return { main, tabs, headerButton, alert, button, row, brYear, insKbn, topText }
}

test.describe('患者登録 (frm201001) — tab 枝番: cơ bản', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    const { tabs, headerButton, alert, button, brYear, insKbn } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân nhiều 枝番')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-1 — 追加 hỏi chép 保険/公費 của tab đang chọn', async () => {
        await openPatientRegistration(page, ONE_BR)
        await expect(tabs()).toHaveText([TAB1])
        await expect(insKbn()).toHaveText('社保')
        await step()
        await headerButton('追加').click()
        await expect(alert(copyAsk(TAB1))).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await expect(alert(copyAsk(TAB1)).getByRole('button', { name: /^(はい|いいえ)$/ })).toHaveText([
            'はい',
            'いいえ',
        ])
        await step()
    })

    test('TC-2 — いいえ: NEW2 ở đầu và được chọn, 自費, 患者情報有効日 trống, 追加 khoá', async () => {
        await button(alert(copyAsk(TAB1)), 'いいえ').click()
        await step()
        await expect(tabs()).toHaveText(['NEW2', TAB1])
        await expect(tabs().first()).toHaveAttribute('aria-selected', 'true')
        await expect(insKbn(), 'いいえ ⇒ ins_kbn=6').toHaveText('自費')
        await expect(brYear(), 'br_dt xoá trống ở cả hai nhánh').toHaveValue('')
        await expect(headerButton('追加')).toBeDisabled()
    })

    test('TC-3 — chuyển tab: mỗi 枝番 giữ dữ liệu riêng', async () => {
        await tabs().nth(1).click()
        await step()
        await expect(insKbn()).toHaveText('社保')
        await expect(brYear()).toHaveValue('12')
        await tabs().first().click()
        await step()
        await expect(insKbn()).toHaveText('自費')
        await expect(brYear()).toHaveValue('')
    })

    test('TC-4 — 削除 tab NEW2 → Q00006 キャンセル: tab còn nguyên', async () => {
        await headerButton('削除').click()
        await expect(alert(Q00006)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await step()
        await button(alert(Q00006), 'キャンセル').click()
        await expect(tabs()).toHaveText(['NEW2', TAB1])
    })

    test('TC-5 — 削除 tab NEW2 → OK: chỉ còn tab 1, 追加 VẪN khoá tới khi nạp lại', async () => {
        await headerButton('削除').click()
        await button(alert(Q00006), 'OK').click()
        await step()
        await expect(tabs()).toHaveText([TAB1])
        await expect(tabs().first()).toHaveAttribute('aria-selected', 'true')
        // frm201001.cs:771 khoá, chỉ :2924 (nạp lại màn) mới bật.
        await expect(headerButton('追加')).toBeDisabled()
    })

    test('TC-6 — nạp lại: 追加 bật lại; はい chép 保険種別, vẫn xoá 患者情報有効日', async () => {
        await openPatientRegistration(page, ONE_BR)
        await expect(headerButton('追加')).toBeEnabled()
        await headerButton('追加').click()
        await button(alert(copyAsk(TAB1)), 'はい').click()
        await step()
        await expect(tabs()).toHaveText(['NEW2', TAB1])
        await expect(insKbn(), 'はい ⇒ giữ 保険種別 của tab nguồn').toHaveText('社保')
        await expect(brYear()).toHaveValue('')
    })

    test('TC-7 — 枝番 có 処置: 削除 bị chặn E00004, không hỏi Q00006', async () => {
        await openPatientRegistration(page, TWO_BR)
        await expect(tabs()).toHaveText([TAB2, TAB1])
        await tabs().nth(1).click()
        await step()
        await headerButton('削除').click()
        const msg = alert('処置データが存在する為')
        await expect(msg).toBeVisible({ timeout: DIALOG_TIMEOUT })
        // WinForm xuống dòng sau 「為、」 — so trên bản đã gộp khoảng trắng.
        expect(((await msg.innerText()) || '').replace(/\s+/g, '')).toContain(E00004_TRN)
        await step()
        await msg.getByRole('button', { name: 'OK', exact: true }).click()
        await expect(alert(Q00006)).toHaveCount(0)
        await expect(tabs()).toHaveText([TAB2, TAB1])
    })

    test('TC-8 — 枝番 đã lưu, không 処置: Q00006 → OK bỏ tab khỏi màn, DB chưa đổi', async () => {
        await tabs().first().click()
        await step()
        await headerButton('削除').click()
        await expect(alert(Q00006)).toBeVisible({ timeout: DIALOG_TIMEOUT })
        await button(alert(Q00006), 'OK').click()
        await step()
        await expect(tabs()).toHaveText([TAB1])
        const n = await withDb(async (c) => {
            const r = await c.query('SELECT count(*)::int AS n FROM insurance WHERE pat_no = $1', [Number(TWO_BR)])
            return r.rows[0].n as number
        })
        expect(n, 'xoá tab chỉ là trên màn — F9 mới ghi DB').toBe(2)
    })
})

test.describe('患者登録 (frm201001) — tab 枝番: parity', () => {
    let page: Page
    let step: () => Promise<void>
    const { tabs, headerButton, alert, button, topText } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.beforeEach(() => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân nhiều 枝番')
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('TC-9 (parity) — nhãn tab đã lưu: 「1：平成12年01月01日～」 (dấu ： toàn góc, đệm 0)', async () => {
        await openPatientRegistration(page, ONE_BR)
        await step()
        await expect(tabs()).toHaveText([TAB1])
    })

    test('TC-10 (parity) — hộp hỏi chép dùng đúng nhãn tab WinForm', async () => {
        await openPatientRegistration(page, ONE_BR)
        await headerButton('追加').click()
        const text = await topText()
        console.log(`Hộp 追加: 「${text}」`)
        await page.getByRole('alertdialog').first().getByRole('button', { name: 'いいえ', exact: true }).click()
        await step()
        expect(text).toContain(copyAsk(TAB1))
    })

    test('TC-11 (parity) — chỉ còn 1 tab: 削除 báo W00001 (⚠), không phải 「これ以上削除できません。」', async () => {
        await openPatientRegistration(page, ONE_BR)
        await headerButton('削除').click()
        const text = await topText()
        console.log(`Hộp 削除 (1 tab): 「${text}」`)
        await page.getByRole('alertdialog').first().getByRole('button', { name: 'OK', exact: true }).click()
        await step()
        expect(text).toContain(W00001)
    })

    test('TC-12 (parity) — có NEW2 chưa lưu: tab đã lưu duy nhất vẫn xoá được (W00001 đếm TAB)', async () => {
        await openPatientRegistration(page, ONE_BR)
        await headerButton('追加').click()
        await button(alert(copyAsk(TAB1)), 'いいえ').click()
        await expect(tabs()).toHaveCount(2)
        await tabs().nth(1).click()
        await step()
        await headerButton('削除').click()
        const text = await topText()
        console.log(`Hộp 削除 (tab đã lưu, có NEW2): 「${text}」`)
        const dlg = page.getByRole('alertdialog').first()
        // Q00006 có OK + キャンセル ⇒ last() = キャンセル; alert chỉ có OK.
        await dlg.getByRole('button', { name: /^(キャンセル|OK)$/ }).last().click()
        await step()
        // frm201001.cs:835 TabCount = 2 ⇒ không W00001; không trn_trn ⇒ Q00006.
        expect(text).toContain(Q00006)
    })
})
