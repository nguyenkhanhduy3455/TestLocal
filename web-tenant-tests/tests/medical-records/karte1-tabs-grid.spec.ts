import { type Locator, type Page } from '@playwright/test'

import { dbEnabled, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS, GRID_LOAD_TIMEOUT, GRID_RELOAD_TIMEOUT } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import {
    createTestPatient,
    dropTestPatient,
    seedInsuranceBranches,
    TEST_PAT_NO_BASE,
} from '../_shared/test-patient'

/**
 * カルテ（１号用紙）印刷 — 枝番タブ + 部位/病名グリッド + 頁送り + F キー — nhóm 2/6 của medical-records.
 *
 * Route `/medical-records/print?patNo=&form=1`, WinForm `frm205002` + `CustomChart`.
 *
 * ─── FACT bám vào source (đổi source thì soát lại assert tương ứng) ───────────────
 *  - components/chart-form1-page.tsx + lib/branch-tab-label.ts
 *      · Tab 枝番 = `"{patBr} ： {wareki rút gọn, vd 平18年05月01日} ～"`, xếp patBr GIẢM dần (mới nhất đứng đầu);
 *        tab mặc định = 枝番 mới nhất. Mỗi 枝番 giữ riêng trang đang xem.
 *      · Lần nạp đầu nhảy tới TRANG DỮ LIỆU CUỐI. Số hàng/trang L = `cct_rpt_info.f1_line_1`
 *        (cấu hình mẫu in); lưới luôn đệm đủ L hàng. Nhãn trang `<< Page N >>`.
 *      · Checkbox hàng `行 N を選択`; mặc định tích khi hàng có 病名/部位 và chưa 印刷済 (fin ≠ 1).
 *        Cột 印刷済 hiện 「済」 khi fin = 1.
 *  - components/fkey-bar.tsx (`data-fkey="Fn"`): F2 前頁 (khoá ở trang 1), F3 次頁 (khoá ở trang cuối),
 *    F4 新規頁 (chỉ bật ở trang cuối có dữ liệu; bấm → trang cuối + 1, F4/F3 khoá), F5 クリア (bật khi có hàng
 *    chọn — nạp xong hàng đầu trang cuối được chọn sẵn; chỉ xoá cục bộ), F1 → form=2, F11 → print-patient-select (cả hai lưu trước).
 *      · F6-F9 (in) KHÔNG bấm: cần agent in + quyền Print.
 *  - Backend `GetCctaListHandler`: dòng `ccta` chỉ được giữ nếu có `trn_trn` cùng ngày (`trt_dt = st_dt`)
 *    mang `med_st_dt` — nếu không MedStDt = null và MỌI dòng bị cắt. Vì vậy spec seed thêm 1 dòng 処置
 *    ở ngày D rồi gán `med_st_dt`.
 *
 * ─── Dữ liệu (TEST_DB=1) ─────────────────────────────────────────────────────────
 *  Bệnh nhân test, 2 枝番: 1 (ít dòng, 1 trang) và 2 (nhiều dòng, nhiều trang). Dòng `ccta` seed thẳng,
 *  toàn bộ fin=1 (đã in) cùng ngày D. afterAll xoá hẳn bệnh nhân + `ccta`.
 *
 * ─── Không phủ (nhóm 3) ──────────────────────────────────────────────────────────
 *  Cột No / 病名 / 部位 / 開始 / 終了 mở dialog chọn — không bấm ở đây.
 *
 * ─── Cấu trúc ────────────────────────────────────────────────────────────────────
 *  Testcase NỐI TIẾP trạng thái (serial, một page dùng chung theo worker): chạy lẻ một test ở giữa có
 *  thể fail. Chạy cả file:
 *
 *      npx playwright test tests/medical-records/karte1-tabs-grid.spec.ts
 */

test.skip(!dbEnabled, 'Cần TEST_DB=1 — spec dựng bệnh nhân test qua Postgres')
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const COVER_FROM = new Date().toISOString().slice(0, 10)
const DATA_DATE = '2024-04-10' // ngày D của mọi dòng ccta + dòng 処置 neo MedStDt
const BR_OLD = { patBr: 1, brDt: '2004-06-01', label: /^1\s*：\s*平16年06月01日\s*～$/ }
const BR_NEW = { patBr: 2, brDt: '2006-05-01', label: /^2\s*：\s*平18年05月01日\s*～$/ }
const OLD_ROWS = 3
const NEW_ROWS = 30 // > 2 trang với L ≤ 13 (f1_line_1 mẫu = 12/13)
const FIN_PRINTED = 1
const DIS_PREFIX = '試験病名'
const MAX_LINE_COUNT = 13

let patNo = 0
/** Số hàng/trang L — đo từ UI ở test đầu tiên. */
let lineCount = 0

async function seedCctaRows(branch: number, count: number): Promise<void> {
    await withDb(async (client) => {
        for (let seq = 1; seq <= count; seq++) {
            await client.query(
                `INSERT INTO ccta (pat_no, pat_br, seq, dis, st_dt, fin) VALUES ($1, $2, $3, $4, $5, $6)`,
                [patNo, branch, seq, `${DIS_PREFIX}${branch}-${seq}`, DATA_DATE, FIN_PRINTED],
            )
        }
    })
}

async function dropCcta(): Promise<void> {
    await withDb(async (client) => {
        await client.query('DELETE FROM ccta WHERE pat_no = $1', [patNo])
        await client.query('DELETE FROM ccta_deleted WHERE pat_no = $1', [patNo])
    })
}

/** Nạp lại tới GRID_LOAD_ATTEMPTS lần — Vite dev server thỉnh thoảng nhả hụt một module. */
async function openKarte1(page: Page): Promise<void> {
    const rows = page.getByRole('checkbox', { name: /^行 \d+ を選択$/ })
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/medical-records/print?patNo=${patNo}&form=1`, {
            waitUntil: 'domcontentloaded',
        })
        try {
            await expect(rows.first()).toBeVisible({
                timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
            })
            return
        } catch (err) {
            lastErr = err
        }
    }
    throw new Error('Lưới カルテ１号 không hiện sau nhiều lần nạp lại', { cause: lastErr })
}

const rowBoxes = (page: Page) => page.getByRole('checkbox', { name: /^行 \d+ を選択$/ })
const fkey = (page: Page, key: string): Locator => page.locator(`[data-fkey="${key}"]`)
const pageLabel = (page: Page) => page.getByText(/<< Page \d+ >>/)
const branchTab = (page: Page, label: RegExp) => page.getByRole('tab', { name: label })

/** Số trang dữ liệu của một 枝番 = ceil(số dòng / L). */
const pagesOf = (rows: number) => Math.ceil(rows / lineCount)

test.describe('カルテ１号 枝番タブ・グリッド・頁送り', () => {
    let page: Page

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        const created = await createTestPatient(COVER_FROM)
        patNo = created.patNo
        console.log(`bệnh nhân test ${patNo} (clone từ ${created.templatePatNo})`)

        // seedInsuranceBranches chỉ nhân bản 1 dòng — bệnh nhân mẫu có thể có nhiều 枝番 → trùng ux_insurance.
        await withDb(async (client) => {
            await client.query(
                `DELETE FROM insurance WHERE pat_no = $1
                    AND pat_br <> (SELECT min(pat_br) FROM insurance WHERE pat_no = $1)`,
                [patNo],
            )
            await client.query('DELETE FROM insurance_deleted WHERE pat_no = $1', [patNo])
        })
        await seedInsuranceBranches(patNo, [
            {
                patBr: BR_OLD.patBr,
                brDt: BR_OLD.brDt,
                medStDt: BR_OLD.brDt,
                medEdDt: '2006-04-30',
                disFlg: 0,
                oldFlg: 0,
            },
            {
                patBr: BR_NEW.patBr,
                brDt: BR_NEW.brDt,
                medStDt: BR_NEW.brDt,
                medEdDt: '9999-12-31',
                disFlg: 0,
                oldFlg: 0,
            },
        ])
        await seedCctaRows(BR_OLD.patBr, OLD_ROWS)
        await seedCctaRows(BR_NEW.patBr, NEW_ROWS)

        // Neo MedStDt: handler cắt mọi dòng nếu không có trn_trn cùng ngày mang med_st_dt.
        await seedTreatmentRows(patNo, DATA_DATE, [{ trtCd: 1, dspTrt: '試験処置' }])
        await withDb((client) =>
            client.query(
                'UPDATE trn_trn SET med_st_dt = trt_dt WHERE pat_no = $1 AND trt_dt = $2',
                [patNo, DATA_DATE],
            ),
        )
        await openKarte1(page)
    })

    test.afterAll(async () => {
        if (patNo >= TEST_PAT_NO_BASE) {
            await dropCcta()
            await dropTestPatient(patNo)
        }
        await releaseSharedPage(page)
    })

    test('枝番タブ: 新しい枝番が先頭、ラベルは「番号 ： 和暦 ～」', async () => {
        const step = makeStep(page)
        const newTab = branchTab(page, BR_NEW.label)
        const oldTab = branchTab(page, BR_OLD.label)
        await expect(newTab).toBeVisible()
        await expect(oldTab).toBeVisible()
        await step('Hai tab 枝番 đúng định dạng')

        const newBox = await newTab.boundingBox()
        const oldBox = await oldTab.boundingBox()
        expect(newBox!.x, '枝番 mới nhất đứng trước (bên trái)').toBeLessThan(oldBox!.x)

        // Mặc định mở 枝番 mới nhất → số dòng khớp dữ liệu của 枝番 2.
        await expect(page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-${NEW_ROWS}`)).toBeVisible()
    })

    test('初期表示: 最終データ頁を開き、1頁は L 行ちょうど', async () => {
        const step = makeStep(page)
        lineCount = await rowBoxes(page).count()
        expect(lineCount, 'L = số hàng/trang đo từ UI').toBeGreaterThan(0)
        expect(lineCount).toBeLessThanOrEqual(MAX_LINE_COUNT)
        await step(`Số hàng/trang L = ${lineCount}`)

        const lastPage = pagesOf(NEW_ROWS)
        expect(lastPage, 'dữ liệu phải trải nhiều trang').toBeGreaterThan(1)
        await expect(pageLabel(page)).toHaveText(`<< Page ${lastPage} >>`)

        // Dòng cuối của 枝番 2 nằm ở trang cuối; dòng đầu thì không.
        await expect(page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-${NEW_ROWS}`)).toBeVisible()
        await expect(page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-1`, { exact: true })).toHaveCount(0)
    })

    test('グリッド: 印刷済「済」、既定は未チェック、全選択で切替', async () => {
        const step = makeStep(page)
        const boxes = rowBoxes(page)

        // Mọi dòng seed đều fin=1 → cột 印刷済 hiện 済 và mặc định KHÔNG tích.
        const lastPageRows = NEW_ROWS - (pagesOf(NEW_ROWS) - 1) * lineCount
        await expect(page.getByText('済', { exact: true })).toHaveCount(lastPageRows)
        for (let i = 0; i < lineCount; i++) await expect(boxes.nth(i)).not.toBeChecked()
        await step('Dòng đã in: 済, không tích sẵn')

        await page.getByRole('checkbox', { name: '全選択' }).check()
        for (let i = 0; i < lastPageRows; i++) await expect(boxes.nth(i)).toBeChecked()
        await step('全選択 tích các dòng có dữ liệu')

        await page.getByRole('checkbox', { name: '全選択' }).uncheck()
        for (let i = 0; i < lineCount; i++) await expect(boxes.nth(i)).not.toBeChecked()
    })

    test('F キー: ラベルと有効/無効 (最終頁)', async () => {
        const step = makeStep(page)
        const labels: Record<string, string> = {
            F1: '２号用紙',
            F2: '前頁',
            F3: '次頁',
            F4: '新規頁',
            F5: 'クリア',
            F6: '全文',
            F7: '病名',
            F8: '頭書き',
            F9: '終了',
            F10: '戻る',
            F11: '患者選択',
            F12: 'メニュー',
        }
        for (const [key, text] of Object.entries(labels)) {
            await expect(fkey(page, key)).toContainText(text)
        }
        await step('Nhãn F1..F12')

        await expect(fkey(page, 'F2'), 'có trang trước').toBeEnabled()
        await expect(fkey(page, 'F3'), 'đang ở trang cuối').toBeDisabled()
        await expect(fkey(page, 'F4'), 'trang cuối có dữ liệu → tạo trang mới được').toBeEnabled()
        await expect(fkey(page, 'F5'), 'hàng đầu trang cuối được chọn sẵn khi nạp').toBeEnabled()
    })

    test('頁送り: F2 前頁 / F3 次頁 で頁が変わり、境界で無効化', async () => {
        const step = makeStep(page)
        const lastPage = pagesOf(NEW_ROWS)

        for (let p = lastPage - 1; p >= 1; p--) {
            await fkey(page, 'F2').click()
            await expect(pageLabel(page)).toHaveText(`<< Page ${p} >>`)
        }
        await expect(fkey(page, 'F2'), 'trang 1').toBeDisabled()
        await expect(fkey(page, 'F3')).toBeEnabled()
        await expect(page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-1`, { exact: true })).toBeVisible()
        await step('Về trang 1: F2 khoá')

        for (let p = 2; p <= lastPage; p++) {
            await fkey(page, 'F3').click()
            await expect(pageLabel(page)).toHaveText(`<< Page ${p} >>`)
        }
        await expect(fkey(page, 'F3'), 'trang cuối').toBeDisabled()
        await step('Tới trang cuối: F3 khoá')
    })

    test('枝番切替: 枝番ごとに頁を保持する', async () => {
        const step = makeStep(page)
        const lastPage = pagesOf(NEW_ROWS)
        await expect(pageLabel(page)).toHaveText(`<< Page ${lastPage} >>`)

        await branchTab(page, BR_OLD.label).click()
        await expect(page.getByText(`${DIS_PREFIX}${BR_OLD.patBr}-${OLD_ROWS}`)).toBeVisible()
        await expect(pageLabel(page)).toHaveText('<< Page 1 >>')
        await expect(fkey(page, 'F2'), '枝番 1 chỉ có 1 trang').toBeDisabled()
        await expect(fkey(page, 'F3')).toBeDisabled()
        await step('枝番 1: 3 dòng, Page 1')

        await branchTab(page, BR_NEW.label).click()
        await expect(pageLabel(page)).toHaveText(`<< Page ${lastPage} >>`)
        await expect(page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-${NEW_ROWS}`)).toBeVisible()
        await step('Quay lại 枝番 2: giữ trang cuối')
    })

    test('F5 クリア: 初期選択行(最終頁の先頭)の内容を消し、次の行へ移る (保存しない)', async () => {
        const step = makeStep(page)
        // Khi nạp, hàng đầu của trang cuối được chọn sẵn (không bấm No/病名/部位/日付 — chúng mở dialog).
        const firstSeq = (pagesOf(NEW_ROWS) - 1) * lineCount + 1
        const first = page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-${firstSeq}`, { exact: true })
        const second = page.getByText(`${DIS_PREFIX}${BR_NEW.patBr}-${firstSeq + 1}`, { exact: true })
        await expect(first).toBeVisible()
        await expect(fkey(page, 'F5')).toBeEnabled()

        await fkey(page, 'F5').click()
        await expect(first, 'hàng đang chọn bị xoá nội dung').toHaveCount(0)
        await expect(second, 'hàng kế tiếp còn nguyên').toBeVisible()
        await expect(fkey(page, 'F5'), 'con trỏ chuyển sang hàng kế').toBeEnabled()
        await step('F5 xoá hàng đang chọn, giữ hàng kế')
    })

    test('F4 新規頁: 最終頁で押すと次の空白頁へ、F3/F4 は無効', async () => {
        const step = makeStep(page)
        // Cần hàng có dữ liệu ở trang cuối: nạp lại để bỏ thay đổi cục bộ của F5 (chưa lưu).
        await openKarte1(page)
        const lastPage = pagesOf(NEW_ROWS)
        await expect(pageLabel(page)).toHaveText(`<< Page ${lastPage} >>`)
        await expect(fkey(page, 'F4')).toBeEnabled()

        await fkey(page, 'F4').click()
        await expect(pageLabel(page)).toHaveText(`<< Page ${lastPage + 1} >>`)
        await expect(page.getByText('済', { exact: true })).toHaveCount(0)
        await expect(fkey(page, 'F3')).toBeDisabled()
        await expect(fkey(page, 'F4'), 'trang trống / đã thêm trang').toBeDisabled()
        await expect(fkey(page, 'F2')).toBeEnabled()
        await step('Trang mới trống, F3/F4 khoá')
    })

    test('F11 患者選択: 患者選択画面へ遷移', async () => {
        const step = makeStep(page)
        await openKarte1(page)
        await fkey(page, 'F11').click()
        await expect(page).toHaveURL(/\/medical-records\/print-patient-select/)
        await step('F11 → print-patient-select')
    })

    test('F1 ２号用紙: form=2 へ遷移', async () => {
        const step = makeStep(page)
        await openKarte1(page)
        await fkey(page, 'F1').click()
        await expect(page).toHaveURL(/\/medical-records\/print\?.*form=2/)
        await step('F1 → form=2')
    })
})
