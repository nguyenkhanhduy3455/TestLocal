import { type Locator, type Page } from '@playwright/test'
import path from 'node:path'

import { dbEnabled, DB_SCHEMA, withDb } from '../_shared/db'
import { allowSave } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * PMHマスタファイル登録メニュー (frm501030) — 取込 CSV マスタ.
 *
 * Màn hình mới port từ WinForm. Hai ô nhập: chọn master, chọn file CSV, F9 登録.
 * Khác WinForm ở chỗ file KHÔNG đi qua API: browser PUT thẳng lên MinIO bằng
 * presigned URL, rồi API mới nạp ở background (Hangfire), nên F9 không block và
 * màn hình poll tiến độ.
 *
 * FACT bám theo source (Rule 21):
 *  - apps/web-tenant/src/features/pmh-masters/locales/ja.ts
 *      · heading = 'P M H マ ス タ フ ァ イ ル 登 録 メ ニ ュ ー' (CÓ khoảng trắng
 *        giữa từng ký tự — giống các màn khác của app, đừng viết liền)
 *      · masterLabel = 'PMHマスタ名', pathLabel = 'PMHマスタファイル登録パス'
 *      · selectMaster = 'マスタ名を選択してください。'
 *      · selectFile = 'CSVファイルを選択してください。'
 *      · confirmImport = 'マスタ「X」にCSVデータをインポートします。\n既存データは
 *        削除されます。\nよろしいですか？'  (Q00100 của WinForm)
 *      · imported / importedWithSkipped = 'n件のデータをインポートしました。
 *        （廃止データm件は除外）'  (I00100)
 *      · currentRows = '現在 n 件', expectedColumns = '列数 n'
 *  - components/pmh-master-import-screen.tsx
 *      · Select id='pmh-master' (role combobox), Input id='pmh-file' readOnly,
 *        nút 参照, và input[type=file] ẨN (class 'hidden') → setInputFiles bám
 *        thẳng vào input ẩn, KHÔNG qua filechooser.
 *      · FKeyBar chỉ có F9 登録 / F10 戻る. WinForm cũng đúng bộ đó.
 *  - routes/_authenticated/masters_.pmh-import.tsx → URL /masters/pmh-import
 *  - shared/components/sidebar.tsx → mục 'PMHマスタ' nhóm その他業務, requireAdmin
 *  - Endpoint (TenantAdmin):
 *      GET  /tenant/pmh-master
 *      POST /tenant/pmh-master/{seq}/upload-slot
 *      POST /tenant/pmh-master/{seq}/import
 *      GET  /tenant/pmh-master/import/{jobId}
 *
 * DỮ LIỆU (Rule 18): catalog `pmh_mst_name` có 7 dòng, seq 1..7. Spec đọc catalog
 * từ DB chứ không hardcode tên — trừ seq 2 (地単公費マスタ) là master DUY NHẤT có
 * dữ liệu thật để test nạp (24.458 dòng). File CSV lấy từ thư mục
 * TEST_PMH_CSV_DIR (mặc định ~/Documents/docs/csv_master):
 *      m_regional_publicly_funded_all_20260914.csv  94 cột → nạp OK 24.458/925
 *      R06_chitankouhi_240401.csv                   99 cột → lỗi lệch cột
 *      R06_kokkouhi_240401.csv                      56 cột → lỗi thiếu cột
 * Không có file thì các TC tương ứng tự skip chứ không đỏ.
 *
 * GHI DB (Rule 18.1): 登録 XOÁ SẠCH bảng master rồi nạp lại. Nhóm TC-IMPORT-*
 * chỉ chạy khi TEST_ALLOW_SAVE=1. Nạp lại đúng file đang có là idempotent (số
 * dòng về đúng như cũ), nhưng vẫn là ghi thật nên không bật mặc định.
 *
 * THỨ TỰ nhóm ghi có ý nghĩa:
 *   TC-IMPORT-1 (nạp OK, chốt số dòng) → TC-IMPORT-2 (file lỗi, số dòng KHÔNG đổi)
 * Đảo lại thì TC-IMPORT-2 không có mốc nào để so.
 *
 * KHÔNG dùng `--repeat-each` (Rule 16 xin miễn trừ): mỗi lượt 登録 là một job
 * nền, lượt 2 bấm khi lượt 1 chưa xong sẽ gặp 'このマスタは取込中です。'.
 */

test.describe.configure({ mode: 'serial' })

/** Rule 18.1 — 登録 xoá sạch bảng master rồi nạp lại. */
const ALLOW_SAVE = allowSave

/** Thư mục chứa CSV master do 支払基金 công bố. */
const CSV_DIR = process.env.TEST_PMH_CSV_DIR ?? path.join(process.env.HOME ?? '', 'Documents/docs/csv_master')

/** File đúng layout hiện tại của 地単公費 (94 cột). */
const CSV_LOCAL_OK = process.env.TEST_PMH_CSV_OK ?? 'm_regional_publicly_funded_all_20260914.csv'

/** Bản 令和6年 của cùng master — 99 cột, lệch bố cục. */
const CSV_LOCAL_R06 = process.env.TEST_PMH_CSV_R06 ?? 'R06_chitankouhi_240401.csv'

/** 国公費 bản cũ — 56 cột, thiếu so với catalog (70). */
const CSV_NATIONAL_R06 = process.env.TEST_PMH_CSV_KOK ?? 'R06_kokkouhi_240401.csv'

/** seq của 地単公費マスタ — master duy nhất có dữ liệu thật trong dataset demo. */
const LOCAL_SEQ = Number(process.env.TEST_PMH_LOCAL_SEQ ?? '2')

const SCREEN_URL = '/masters/pmh-import'

/**
 * 取込 chạy nền: Hangfire poll hàng đợi 15s/lần ở môi trường dev, cộng thời gian
 * COPY 24.458 dòng. Rộng tay để không đỏ oan vì đúng lúc rơi vào đầu chu kỳ poll.
 */
const IMPORT_TIMEOUT = 120_000

/** Chuỗi UI thật — chép từ features/pmh-masters/locales/ja.ts. */
const PM = {
    heading: 'P M H マ ス タ フ ァ イ ル 登 録 メ ニ ュ ー',
    masterLabel: 'PMHマスタ名',
    pathLabel: 'PMHマスタファイル登録パス',
    browse: '参照',
    selectMaster: 'マスタ名を選択してください。',
    selectFile: 'CSVファイルを選択してください。',
    confirmHead: 'にCSVデータをインポートします。',
    confirmWarn: '既存データは削除されます。',
    previousKept: '既存データはそのまま残っています。',
    fnRegister: '登録',
    fnBack: '戻る',
    sidebarItem: 'PMHマスタ',
} as const

interface CatalogRow {
    seq: number
    nameJp: string
    tableName: string
    columnCount: number
}

test.describe('PMHマスタファイル登録 (frm501030)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Catalog đọc từ DB ở beforeAll — spec không hardcode tên 7 master. */
    let catalog: CatalogRow[] = []

    // ── Locators ─────────────────────────────────────────────────────────────

    const fkey = (n: number): Locator => page.locator(`[data-fkey="F${n}"]`)
    const masterSelect = (): Locator => page.locator('#pmh-master')
    const pathInput = (): Locator => page.locator('#pmh-file')
    const fileInput = (): Locator => page.locator('input[type="file"]')

    // ── Helpers ──────────────────────────────────────────────────────────────

    async function gotoScreen(): Promise<void> {
        await page.goto(SCREEN_URL, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText(PM.heading), 'không vào được màn PMHマスタ').toBeVisible({
            timeout: 60_000,
        })
    }

    /** Mở dropdown rồi chọn master theo nhãn tiếng Nhật. */
    async function pickMaster(nameJp: string): Promise<void> {
        await masterSelect().click()
        await page.getByRole('option', { name: nameJp, exact: true }).click()
        await expect(masterSelect()).toContainText(nameJp)
    }

    /** Gắn file vào input ẩn. Không qua filechooser: input có class 'hidden'. */
    async function attachCsv(fileName: string): Promise<void> {
        await fileInput().setInputFiles(path.join(CSV_DIR, fileName))
        await expect(pathInput(), 'ô path không hiện tên file vừa chọn').toHaveValue(fileName)
    }

    function csvExists(fileName: string): boolean {
        try {
            // require ở đây thay vì import tĩnh: chỉ cần khi kiểm tra file.
            return require('node:fs').existsSync(path.join(CSV_DIR, fileName))
        } catch {
            return false
        }
    }

    /** Số dòng thật của một bảng master trong schema tenant. */
    async function countMasterRows(tableName: string): Promise<number> {
        return withDb(async (client) => {
            const r = await client.query(
                `SELECT count(*)::int AS n FROM ${DB_SCHEMA}.${tableName.toLowerCase()}`,
            )
            return r.rows[0].n as number
        })
    }

    /** Dòng job mới nhất của một master. */
    async function latestJob(seq: number) {
        return withDb(async (client) => {
            const r = await client.query(
                `SELECT status, progress, imported_count, skipped_count, error_message, file_name
                 FROM ${DB_SCHEMA}.import_job
                 WHERE kind = 'pmh' AND target = $1::text
                 ORDER BY created_at DESC LIMIT 1`,
                [seq],
            )
            return r.rows[0] ?? null
        })
    }

    // ── Setup ────────────────────────────────────────────────────────────────

    test.beforeAll(async ({ authedPage }) => {
        // Page dùng chung của worker (_shared/session.ts): một lần login cho cả
        // worker thay vì mỗi file một lần — app đặt PermitLimit 10 login và
        // limit cộng dồn, nên login riêng là thứ làm cả suite không chạy nổi.
        page = authedPage
        step = makeStep(page)

        if (dbEnabled) {
            catalog = await withDb(async (client) => {
                const r = await client.query(
                    `SELECT seq, name_jp, table_name, column_list
                     FROM ${DB_SCHEMA}.mst_pmh_name
                     ORDER BY seq`,
                )
                return r.rows.map((x) => ({
                    seq: x.seq as number,
                    nameJp: x.name_jp as string,
                    tableName: x.table_name as string,
                    columnCount: String(x.column_list ?? '')
                        .split(',')
                        .filter((c) => c.trim() !== '').length,
                }))
            })
            console.log(`catalog mst_pmh_name: ${catalog.length} master`)
        }

        await gotoScreen()
    })

    test.afterAll(async () => {
        // KHÔNG page.close(): page thuộc worker, đóng là mọi file chạy sau trên
        // cùng worker nổ ngay dòng đầu.
        page?.removeAllListeners('request')
        await releaseSharedPage(page)
    })

    // ── Điều hướng & bố cục ──────────────────────────────────────────────────

    test('TC-NAV-1 — sidebar その他業務 có mục PMHマスタ và dẫn tới /masters/pmh-import', async () => {
        await page.goto('/', { waitUntil: 'domcontentloaded' })

        const item = page.getByRole('link', { name: PM.sidebarItem })
        await expect(item, 'sidebar thiếu mục PMHマスタ — requireAdmin có chặn nhầm?').toBeVisible({
            timeout: 60_000,
        })

        await item.click()
        await expect(page).toHaveURL(/\/masters\/pmh-import$/)
        await expect(page.getByText(PM.heading)).toBeVisible()
        await step()
    })

    test('TC-UI-1 — đủ 2 ô nhập và F-key đúng bộ của frm501030: F9 登録 / F10 戻る', async () => {
        await expect(page.getByText(PM.masterLabel, { exact: true })).toBeVisible()
        await expect(page.getByText(PM.pathLabel, { exact: true })).toBeVisible()
        await expect(page.getByRole('button', { name: PM.browse })).toBeVisible()

        await expect(fkey(9), 'thiếu F9 登録').toContainText(PM.fnRegister)
        await expect(fkey(10), 'thiếu F10 戻る').toContainText(PM.fnBack)

        // WinForm frm501030 chỉ bật F9/F10, mọi phím khác đều OCHA_OFF.
        for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 11, 12]) {
            await expect(fkey(n), `F${n} không được bật ở frm501030`).toHaveCount(0)
        }
        await step()
    })

    test('TC-UI-2 — ô path là read-only (web không có OpenFileDialog)', async () => {
        // WinForm cho gõ tay đường dẫn (MaxLength=30). Trình duyệt không cho web
        // đọc đường dẫn thật nên ô này chỉ hiện TÊN file và khoá lại — lệch parity
        // có chủ ý, ghi ở doc-comment của màn hình.
        await expect(pathInput()).toHaveAttribute('readonly', '')
        await step()
    })

    test('TC-LIST-1 — combobox liệt kê đúng 7 master theo thứ tự catalog', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đối chiếu với mst_pmh_name')
        skipWithReason(catalog.length === 0, 'catalog mst_pmh_name rỗng — chưa migrate?')

        await masterSelect().click()
        const options = page.getByRole('option')
        await expect(options.first()).toBeVisible({ timeout: 30_000 })

        const labels = await options.allInnerTexts()
        expect(labels.map((s) => s.trim()), 'danh sách master lệch catalog').toEqual(
            catalog.map((c) => c.nameJp),
        )

        await page.keyboard.press('Escape')
        await step()
    })

    test('TC-LIST-2 — chọn master thì hiện số dòng hiện có và số cột kỳ vọng', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để biết số dòng thật')

        const local = catalog.find((c) => c.seq === LOCAL_SEQ)
        skipWithReason(local === undefined, `catalog không có seq=${LOCAL_SEQ}`)

        const rows = await countMasterRows(local!.tableName)

        await pickMaster(local!.nameJp)

        // Số dòng hiển thị có dấu phẩy nhóm nghìn (toLocaleString).
        await expect(page.getByText(`現在 ${rows.toLocaleString()} 件`)).toBeVisible({
            timeout: 30_000,
        })
        await expect(page.getByText(`列数 ${local!.columnCount}`)).toBeVisible()
        await step()
    })

    // ── Validate (không ghi gì) ──────────────────────────────────────────────

    test('TC-VAL-1 — chưa chọn master mà bấm F9 thì báo マスタ名を選択してください。', async () => {
        await gotoScreen()

        await fkey(9).click()
        await expect(page.getByText(PM.selectMaster)).toBeVisible({ timeout: 30_000 })

        // Đóng hộp thoại để TC sau bắt đầu từ trạng thái sạch.
        await page.getByRole('button', { name: /OK|はい|閉じる/ }).first().click()
        await step()
    })

    test('TC-VAL-2 — chọn master nhưng chưa chọn file thì báo CSVファイルを選択してください。', async () => {
        skipWithReason(catalog.length === 0, 'cần catalog để chọn master')

        await pickMaster(catalog[0]!.nameJp)
        await fkey(9).click()

        await expect(page.getByText(PM.selectFile)).toBeVisible({ timeout: 30_000 })
        await page.getByRole('button', { name: /OK|はい|閉じる/ }).first().click()
        await step()
    })

    test('TC-CONFIRM-1 — F9 hiện Q00100 nêu tên master; bấm いいえ thì KHÔNG gọi API', async () => {
        skipWithReason(!csvExists(CSV_LOCAL_OK), `không thấy ${CSV_LOCAL_OK} trong ${CSV_DIR}`)
        skipWithReason(catalog.length === 0, 'cần catalog để chọn master')

        const local = catalog.find((c) => c.seq === LOCAL_SEQ)!
        await gotoScreen()
        await pickMaster(local.nameJp)
        await attachCsv(CSV_LOCAL_OK)

        let slotCalled = false
        const watch = (url: string) => {
            if (/\/tenant\/pmh-master\/\d+\/upload-slot$/.test(new URL(url).pathname)) {
                slotCalled = true
            }
        }
        page.on('request', (r) => watch(r.url()))

        await fkey(9).click()

        // Q00100: nêu đích danh master và cảnh báo xoá dữ liệu cũ.
        await expect(page.getByText(new RegExp(local.nameJp))).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(PM.confirmWarn)).toBeVisible()

        await page.getByRole('button', { name: 'いいえ' }).click()

        // Huỷ ở hộp thoại thì không được xin slot — tức là chưa có gì lên storage.
        expect(slotCalled, 'bấm いいえ mà vẫn gọi upload-slot').toBeFalsy()
        page.removeAllListeners('request')
        await step()
    })

    // ── 取込 thật (Rule 18.1 — cần TEST_ALLOW_SAVE=1) ────────────────────────

    test('TC-IMPORT-1 — nạp file đúng layout: 24.458 dòng, loại 925 dòng 廃止', async () => {
        skipWithReason(!ALLOW_SAVE, '取込 xoá sạch bảng master — cần TEST_ALLOW_SAVE=1')
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đối chiếu số dòng')
        skipWithReason(!csvExists(CSV_LOCAL_OK), `không thấy ${CSV_LOCAL_OK} trong ${CSV_DIR}`)

        const local = catalog.find((c) => c.seq === LOCAL_SEQ)!

        await gotoScreen()
        await pickMaster(local.nameJp)
        await attachCsv(CSV_LOCAL_OK)

        // File PHẢI đi thẳng lên object storage, không qua API — đây là lý do
        // trần body 1MB của nginx dev không còn chặn file 10MB.
        const uploadUrls: string[] = []
        page.on('request', (r) => {
            if (r.method() === 'PUT') uploadUrls.push(r.url())
        })

        await fkey(9).click()
        await page.getByRole('button', { name: 'はい' }).click()

        await expect(
            page.getByText(/件のデータをインポートしました。/),
            '取込 không kết thúc — xem import_job.status / log Hangfire',
        ).toBeVisible({ timeout: IMPORT_TIMEOUT })

        const resultText = await page.getByText(/件のデータをインポートしました。/).innerText()
        console.log(`kết quả 取込: ${resultText}`)

        // Con số phải khớp DB, không chỉ khớp chữ trên màn hình.
        const job = await latestJob(local.seq)
        expect(job, 'không thấy dòng import_job (kind=pmh) nào').toBeTruthy()
        expect(job.status, `job không thành công: ${job.error_message ?? ''}`).toBe('succeeded')
        expect(job.file_name).toBe(CSV_LOCAL_OK)

        const rows = await countMasterRows(local.tableName)
        expect(rows, 'số dòng trong bảng lệch imported_count').toBe(job.imported_count)
        expect(job.skipped_count, '廃止 bị bỏ sót hoặc loại nhầm').toBeGreaterThan(0)
        expect(resultText).toContain(`廃止データ${job.skipped_count.toLocaleString()}件は除外`)

        expect(uploadUrls.length, 'không thấy PUT nào — file có đi thẳng lên storage không?')
            .toBeGreaterThan(0)
        expect(
            uploadUrls.some((u) => !new URL(u).pathname.startsWith('/api')),
            'file vẫn đi qua /api — presigned upload không hoạt động',
        ).toBeTruthy()

        page.removeAllListeners('request')
        await step()
    })

    test('TC-IMPORT-2 — file lệch số cột bị từ chối và master cũ NGUYÊN VẸN', async () => {
        skipWithReason(!ALLOW_SAVE, 'cần TEST_ALLOW_SAVE=1')
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để đối chiếu số dòng')
        skipWithReason(!csvExists(CSV_LOCAL_R06), `không thấy ${CSV_LOCAL_R06} trong ${CSV_DIR}`)

        const local = catalog.find((c) => c.seq === LOCAL_SEQ)!
        const before = await countMasterRows(local.tableName)

        await gotoScreen()
        await pickMaster(local.nameJp)
        await attachCsv(CSV_LOCAL_R06)

        await fkey(9).click()
        await page.getByRole('button', { name: 'はい' }).click()

        // Bản R06 có 99 trường / catalog chờ 94. WinForm chỉ chặn khi THIẾU cột
        // nên file này lọt qua rồi ghi lệch một cột từ giữa mà không báo gì;
        // bản web kiểm khớp CHÍNH XÁC nên dừng ngay dòng 1.
        await expect(page.getByText(/列数が一致しません/), 'không bắt được lệch số cột').toBeVisible({
            timeout: IMPORT_TIMEOUT,
        })
        await expect(page.getByText(new RegExp(`期待：${local.columnCount}`))).toBeVisible()
        await expect(page.getByText(PM.previousKept)).toBeVisible()

        // Điểm mấu chốt: TRUNCATE + COPY nằm trong MỘT transaction, lỗi ở dòng 1
        // nghĩa là chưa xoá gì. WinForm ở đây đã mất sạch master.
        const after = await countMasterRows(local.tableName)
        expect(after, 'master bị xoá dù 取込 thất bại — transaction không rollback?').toBe(before)

        const job = await latestJob(local.seq)
        expect(job.status).toBe('failed')
        expect(job.error_message).toContain('列数が一致しません')
        await step()
    })

    test('TC-IMPORT-3 — file thiếu cột (国公費 bản cũ) báo đúng số cột kỳ vọng', async () => {
        skipWithReason(!ALLOW_SAVE, 'cần TEST_ALLOW_SAVE=1')
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để biết số cột kỳ vọng')
        skipWithReason(!csvExists(CSV_NATIONAL_R06), `không thấy ${CSV_NATIONAL_R06} trong ${CSV_DIR}`)

        const national = catalog.find((c) => c.tableName === 'PMH_MST_NATIONAL_PUBEXP')
        skipWithReason(national === undefined, 'catalog không có 国公費マスタ')

        const before = await countMasterRows(national!.tableName)

        await gotoScreen()
        await pickMaster(national!.nameJp)
        await attachCsv(CSV_NATIONAL_R06)

        await fkey(9).click()
        await page.getByRole('button', { name: 'はい' }).click()

        await expect(page.getByText(/列数が一致しません/)).toBeVisible({ timeout: IMPORT_TIMEOUT })
        await expect(page.getByText(new RegExp(`期待：${national!.columnCount}`))).toBeVisible()

        const after = await countMasterRows(national!.tableName)
        expect(after, 'master 国公費 bị xoá dù 取込 thất bại').toBe(before)
        await step()
    })

    // ── Trạng thái sống ngoài trình duyệt ────────────────────────────────────

    test('TC-STATE-1 — kết quả lần nạp gần nhất vẫn hiện sau khi F5', async () => {
        skipWithReason(!dbEnabled, 'cần TEST_DB=1 để biết đã từng nạp hay chưa')

        const local = catalog.find((c) => c.seq === LOCAL_SEQ)!
        const job = await latestJob(local.seq)
        skipWithReason(job === null, 'chưa có lần 取込 nào — chạy TC-IMPORT-1 trước')

        // Trạng thái nằm ở DB chứ không ở browser: tải lại trang rồi chọn lại
        // master là phải thấy ngay kết quả lần trước, không cần nhớ jobId.
        await gotoScreen()
        await pickMaster(local.nameJp)

        const expected =
            job.status === 'succeeded'
                ? /件のデータをインポートしました。/
                : /取込に失敗しました/

        await expect(
            page.getByText(expected),
            'sau F5 không thấy kết quả lần trước — trạng thái có nằm ở DB không?',
        ).toBeVisible({ timeout: 30_000 })
        await step()
    })
})
