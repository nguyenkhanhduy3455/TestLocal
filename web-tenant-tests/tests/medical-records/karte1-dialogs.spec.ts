import { type Locator, type Page } from '@playwright/test'

import { dbEnabled, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, GRID_LOAD_TIMEOUT, GRID_RELOAD_TIMEOUT } from '../_shared/env'
import { closeDialog, MSG, topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { createTestPatient, dropTestPatient, TEST_PAT_NO_BASE } from '../_shared/test-patient'

/**
 * カルテ（１号用紙）印刷 — ダイアログ (病検選択 / 日付入力 / 部位選択 / 病名選択) — nhóm 3/6.
 *
 * Route `/medical-records/print?patNo=&form=1`.
 *
 * ─── FACT bám vào source (đổi source thì soát lại assert tương ứng) ───────────────
 *  - components/buidis-grid.tsx: ô No / 病名 / 部位 / 開始 / 終了 là ô focusable (`td[data-column-id]`),
 *    BẤM vào ô thì mở dialog; mỗi dialog thao tác trên hàng chứa ô đó.
 *  - components/disease-examination-selection-dialog.tsx (frm902006 病検選択, mở từ ô No):
 *      · Danh sách = `GET /tenant/ccta/{patNo}/byoken-candidates` — trn_trn có `dsp_dis` ≠ '' và
 *        `trt_dt >= insurance.med_st_dt` (KHÔNG phụ thuộc hàng đã có trên chart).
 *      · F9 選択 không tích dòng nào → E00007; F9 có tích → ghi lần lượt từ hàng đã bấm trở xuống
 *        (部位, 病名, 開始日; 終了日/転帰 giữ nguyên); F10 戻る đóng, không ghi.
 *  - components/date-picker-modal.tsx (frm902004, ô 開始/終了): tiêu đề 日付入力, F9 確定 ghi ngày,
 *    F10 戻る huỷ. Ô trống mở sẵn bằng NGÀY HÔM NAY.
 *  - Dialog 部位選択 (`ToothSelectionDialog`) / 病名選択 (`DiseaseSelectionDialog`) thuộc feature
 *    treatments — ở đây chỉ kiểm mở đúng ô và đóng bằng F12/F10 không ghi gì; nội dung chọn do spec
 *    của treatments phủ.
 *  - Mọi thay đổi chỉ nằm ở state cục bộ tới khi F1/F10/F11/F12 lưu — spec KHÔNG bấm các phím đó.
 *
 * ─── Dữ liệu (TEST_DB=1) ─────────────────────────────────────────────────────────
 *  Bệnh nhân test 1 枝番. `ccta`: 1 dòng đã in (fin=1) ở ngày D = hôm nay, neo MedStDt bằng một dòng
 *  処置 ở D (`med_st_dt = D`) ⇒ chart chỉ giữ dòng ≥ D. Hai dòng `trn_trn` có 病名 ở ngày E = đầu
 *  tháng TRƯỚC (= `insurance.med_st_dt`): dialog 病検 thấy chúng (E ≥ med_st_dt) còn lưới chart thì
 *  không (E < D) — nhờ vậy hàng 2, 3 của lưới còn trống để ghi vào. afterAll xoá hẳn bệnh nhân + ccta.
 *
 *  Chạy cả file:  npx playwright test tests/medical-records/karte1-dialogs.spec.ts
 */

test.skip(!dbEnabled, 'Cần TEST_DB=1 — spec dựng bệnh nhân test qua Postgres')
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const TODAY = new Date().toISOString().slice(0, 10)
const PREV_MONTH_START = (() => {
    const d = new Date(`${TODAY}T00:00:00Z`)
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10)
})()
const FIN_PRINTED = 1
const PRINTED_DIS = '試験済病名'
const CANDIDATES = ['試験病名A', '試験病名B']
/** Hàng trống đầu tiên của lưới (hàng 1 là dòng đã in). */
const FIRST_BLANK_SEQ = 2

let patNo = 0

async function openKarte1(page: Page): Promise<void> {
    const printed = page.getByText(PRINTED_DIS, { exact: true })
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/medical-records/print?patNo=${patNo}&form=1`, {
            waitUntil: 'domcontentloaded',
        })
        try {
            await expect(printed).toBeVisible({
                timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
            })
            return
        } catch (err) {
            lastErr = err
        }
    }
    throw new Error('Lưới カルテ１号 không hiện sau nhiều lần nạp lại', { cause: lastErr })
}

/** `<tr>` của hàng thứ n (1-based) theo checkbox `行 n を選択`. */
const gridRow = (page: Page, n: number): Locator =>
    page.getByRole('checkbox', { name: `行 ${n} を選択` }).locator('xpath=ancestor::tr')
const cellOf = (page: Page, n: number, col: 'no' | 'bui' | 'dis' | 'stDt' | 'edDt'): Locator =>
    gridRow(page, n).locator(`td[data-column-id="${col}"]`)
const fkey = (scope: Locator | Page, key: string): Locator => scope.locator(`[data-fkey="${key}"]`)

/** Dialog nghiệp vụ (DraggableDialog, role=dialog) đang mở. */
const bizDialog = (page: Page, title: RegExp | string) =>
    page.getByRole('dialog').filter({ hasText: title })

test.describe('カルテ１号 ダイアログ', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        const created = await createTestPatient(TODAY)
        patNo = created.patNo
        console.log(`bệnh nhân test ${patNo} (clone từ ${created.templatePatNo})`)

        // Chỉ 1 枝番 để dialog 病検 / lưới nói cùng một patBr.
        await withDb(async (client) => {
            await client.query(
                `DELETE FROM insurance WHERE pat_no = $1
                    AND pat_br <> (SELECT min(pat_br) FROM insurance WHERE pat_no = $1)`,
                [patNo],
            )
            await client.query('DELETE FROM insurance_deleted WHERE pat_no = $1', [patNo])
            const br = await client.query<{ pat_br: number }>(
                'SELECT pat_br FROM insurance WHERE pat_no = $1',
                [patNo],
            )
            await client.query(
                `INSERT INTO ccta (pat_no, pat_br, seq, dis, st_dt, fin) VALUES ($1, $2, 1, $3, $4, $5)`,
                [patNo, br.rows[0].pat_br, PRINTED_DIS, TODAY, FIN_PRINTED],
            )
        })

        // D: 処置 neo MedStDt cho dòng ccta. E: hai 病名 chỉ dialog 病検 thấy.
        await seedTreatmentRows(patNo, TODAY, [{ trtCd: 1, dspTrt: '試験処置' }])
        await withDb((client) =>
            client.query('UPDATE trn_trn SET med_st_dt = trt_dt WHERE pat_no = $1 AND trt_dt = $2', [
                patNo,
                TODAY,
            ]),
        )
        await seedTreatmentRows(
            patNo,
            PREV_MONTH_START,
            CANDIDATES.map((dis, i) => ({
                trtCd: 1,
                dspTrt: '試験処置',
                dspDis: dis,
                disCd: [5 + i],
                bui: [i + 1],
                dspBui: `部位${i + 1}`,
            })),
        )
        await openKarte1(page)
    })

    test.afterAll(async () => {
        if (patNo >= TEST_PAT_NO_BASE) {
            await withDb(async (client) => {
                await client.query('DELETE FROM ccta WHERE pat_no = $1', [patNo])
                await client.query('DELETE FROM ccta_deleted WHERE pat_no = $1', [patNo])
            })
            await dropTestPatient(patNo)
        }
        await releaseSharedPage(page)
    })

    test('前提: 候補の病名は lưới chưa có, hàng 2-3 còn trống', async () => {
        for (const dis of CANDIDATES) await expect(page.getByText(dis, { exact: true })).toHaveCount(0)
        await expect(cellOf(page, FIRST_BLANK_SEQ, 'dis')).toHaveText('')
    })

    test('病検選択: No セルで開き、候補2件と全選択を表示', async () => {
        const step = makeStep(page)
        await cellOf(page, FIRST_BLANK_SEQ, 'no').click()
        const dlg = bizDialog(page, '病検選択')
        await expect(dlg).toBeVisible()
        for (const dis of CANDIDATES) await expect(dlg.getByText(dis)).toBeVisible()
        await expect(dlg.getByRole('checkbox', { name: '全選択' })).toBeVisible()
        await expect(dlg.getByRole('checkbox', { name: /^行 \d+ を選択$/ })).toHaveCount(CANDIDATES.length)
        await step('病検選択 liệt kê 2 ứng viên')
    })

    test('病検選択: 未選択で F9 → E00007、ダイアログは開いたまま', async () => {
        const dlg = bizDialog(page, '病検選択')
        await fkey(dlg, 'F9').click()
        await expect(topDialog(page)).toContainText(MSG.E00007())
        await closeDialog(page, 'E00007')
        await expect(dlg).toBeVisible()
    })

    test('病検選択: F10 戻る は何も書き込まず閉じる', async () => {
        const dlg = bizDialog(page, '病検選択')
        await dlg.getByRole('checkbox', { name: '全選択' }).check()
        await fkey(dlg, 'F10').click()
        await expect(dlg).toBeHidden()
        await expect(cellOf(page, FIRST_BLANK_SEQ, 'dis')).toHaveText('')
    })

    test('病検選択: 全選択 + F9 で押下行から順に 病名 を書き込む', async () => {
        const step = makeStep(page)
        await cellOf(page, FIRST_BLANK_SEQ, 'no').click()
        const dlg = bizDialog(page, '病検選択')
        await expect(dlg).toBeVisible()
        await dlg.getByRole('checkbox', { name: '全選択' }).check()
        await fkey(dlg, 'F9').click()
        await expect(dlg).toBeHidden()

        for (const [i, dis] of CANDIDATES.entries()) {
            await expect(cellOf(page, FIRST_BLANK_SEQ + i, 'dis')).toContainText(dis)
        }
        // Dòng đã in (hàng 1) không bị đụng tới.
        await expect(cellOf(page, 1, 'dis')).toContainText(PRINTED_DIS)
        await step('2 ứng viên ghi vào hàng 2-3')
    })

    test('日付入力: 終了セル(空)で開き、F9 で今日の日付がセルに入る', async () => {
        const step = makeStep(page)
        const target = cellOf(page, FIRST_BLANK_SEQ + 2, 'edDt')
        await expect(target).toHaveText('')
        await target.click()
        const dlg = bizDialog(page, '日付入力').last() // shared Dialog lồng 2 phần tử role=dialog
        await expect(dlg).toBeVisible()
        await expect(dlg.getByText(/令和|平成|昭和/).first()).toBeVisible()
        await step('日付入力 mở sẵn ngày hôm nay')

        await fkey(dlg, 'F9').click()
        await expect(dlg).toBeHidden()
        await expect(target, 'ô trống nhận ngày hôm nay').not.toHaveText('')
    })

    test('日付入力: F10 戻る は日付を変えずに閉じる', async () => {
        const target = cellOf(page, FIRST_BLANK_SEQ + 1, 'edDt') // ô trống: huỷ thì vẫn trống
        const before = (await target.innerText()).trim()
        await target.click()
        const dlg = bizDialog(page, '日付入力').last() // shared Dialog lồng 2 phần tử role=dialog
        await expect(dlg).toBeVisible()
        await fkey(dlg, 'F10').click()
        await expect(dlg).toBeHidden()
        expect((await target.innerText()).trim()).toBe(before)
    })

    test('部位選択: 部位セルで開き、閉じても書き込まない', async () => {
        const target = cellOf(page, FIRST_BLANK_SEQ + 2, 'bui')
        const before = (await target.innerText()).trim()
        await target.click()
        const dlg = bizDialog(page, /部\s*位\s*選\s*択/)
        await expect(dlg).toBeVisible()
        await fkey(dlg, 'F12').click()
        await expect(dlg).toBeHidden()
        expect((await target.innerText()).trim()).toBe(before)
    })

    test('病名選択: 病名セルで開き、閉じても書き込まない', async () => {
        const target = cellOf(page, FIRST_BLANK_SEQ + 2, 'dis')
        const before = (await target.innerText()).trim()
        await target.click()
        const dlg = bizDialog(page, /病\s*名\s*選\s*択/)
        await expect(dlg).toBeVisible()
        await fkey(dlg, 'F12').click()
        await expect(dlg).toBeHidden()
        expect((await target.innerText()).trim()).toBe(before)
    })
})
