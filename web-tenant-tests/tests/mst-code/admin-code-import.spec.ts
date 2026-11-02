import { type BrowserContext, type Locator, type Page, expect, test } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled } from '../_shared/db'
import { skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

import { ADMIN_BASE_URL, type AdminApi, OWN_CODE, openAdminApi } from './_mst-code-admin'

/**
 * web-admin コードマスタ → ≪CSV入出力≫ 取込 — bước 確認 (kiểm tra file) của việc nhập CSV mã dùng chung.
 * Nhánh feature/mst-cod-shared-override (merge dev ccf611752).
 *
 * FACT bám theo source (Rule 21):
 *  - web-admin features/master-imports/components/master-import-panel.tsx: khối 「最終取込」 + nút 取込 / 復元;
 *    lỗi đọc trạng thái ⇒ chữ đỏ 「取込状況を取得できませんでした。」 (GET /admin/master-imports/codes/latest).
 *  - components/import-dialog.tsx: 「コードマスタの取込」, input#master-import-files (sr-only, accept .csv),
 *    nút 確認 → job kiểm tra; lỗi ⇒ 「確認に失敗しました。ファイルを選び直してください。」 + từng dòng lỗi;
 *    file không thêm/sửa gì ⇒ 「追加・更新するコードがないため、取り込みません。」 và nút 取込 mờ.
 *  - api Application/MasterImports/Codes/MstCodeImportPlanner.cs — câu lỗi (mỗi dòng 「行番号 n: …」):
 *      header sai ⇒ 「ヘッダーが不正です。1行目は「cd_type,…,end_date,hidden」にしてください。」 (8 cột, BE 7564a9ebc
 *        thêm cột hidden 0/1)
 *      cd_val trong dải mã riêng cố định ⇒ 「cd_val n はテナント独自コードの範囲（30000～32767）です。」
 *      trùng khoá ⇒ 「同じ cd_type, cd_val の行がファイル内で重複しています。」
 *      hidden ≠ 0/1 ⇒ 「hidden が0または1ではありません。」; ẩn mã của nhóm hide_allowed = false ⇒
 *        「cd_type n のコードは非表示にできません。」 (MstCodeImportPlanner.cs:109-113)
 *  - MasterImportFileLoader.cs: file không đọc được bằng Shift_JIS ⇒ (báo ngay khi chuẩn bị, chữ đỏ
 *    dưới ô file, không có dòng 「確認に失敗しました」)
 *      「ファイルがShift_JISではありません。CSV（コンマ区切り）で保存してください。」
 *
 * KHÔNG NHẬP THẬT: mọi ca dừng ở kết quả 確認 rồi キャンセル (job kiểm tra không đổi mã dùng chung).
 * Dải mã riêng giờ cố định 30000～32767 cho mọi nhóm (MstCodeOverridePolicy.OwnCodeMin/Max) — không phải dựng.
 *
 * MÔI TRƯỜNG: cần EF migration platform 20261016183209_AddMasterImportTenantCheck (cột
 * master_import_job.created_keys). Thiếu nó thì mọi API master-import trả 500 và TC-01 đỏ — lỗi môi
 * trường, không phải lỗi spec.
 *
 * Cần TEST_ALLOW_SAVE=1 và TEST_DB=1. Login: 1 UI admin + 1 admin API (lấy bản CSV出力).
 *   npx playwright test tests/mst-code/admin-code-import.spec.ts
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec gửi file nhập mã dùng chung')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id')

const CD_TYPE = 30
const OWN_CD = OWN_CODE.min + 950
const HEADER = 'cd_type,cd_val,any_val1,any_val2,sort_order,start_date,end_date,hidden'

/** Nội dung ASCII thì Shift_JIS và UTF-8 trùng byte — đủ cho các ca lỗi cấu trúc. */
const ascii = (lines: string[]) => Buffer.from(lines.join('\r\n') + '\r\n', 'ascii')

test.describe('web-admin コードマスタ 取込 — bước 確認', () => {
    let context: BrowserContext
    let page: Page
    let admin: AdminApi
    /** File CSV nhóm 30 đúng như server xuất (Shift_JIS) — dùng cho ca "không có gì để nhập". */
    let exported: Buffer

    const dialog = (): Locator => page.getByRole('dialog').filter({ hasText: 'コードマスタの取込' })

    async function openImport(): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(`/masters/mst-code?cdType=${CD_TYPE}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByTestId('data-row').first()).toBeVisible({ timeout: 30_000 })
                break
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
        await page.getByRole('region', { name: 'CSV入出力' }).getByRole('button', { name: '取込', exact: true }).click()
        await expect(dialog()).toBeVisible()
    }

    /** Chọn file rồi 確認; trả khối thông báo của dialog sau khi job kiểm tra xong. */
    async function check(name: string, buffer: Buffer): Promise<Locator> {
        await openImport()
        await dialog().locator('#master-import-files').setInputFiles({ name, mimeType: 'text/csv', buffer })
        await expect(dialog()).toContainText(name)
        await dialog().getByRole('button', { name: '確認', exact: true }).click()
        // Kiểm tra xong: lỗi ⇒ 確認 bật lại; ready ⇒ 確認 biến mất, hiện ファイルを選び直す.
        const checkAgain = dialog().getByRole('button', { name: '確認', exact: true })
        const repick = dialog().getByRole('button', { name: 'ファイルを選び直す', exact: true })
        await expect
            .poll(
                // 確認 có thể biến mất giữa isVisible và isEnabled ⇒ isEnabled chờ ngắn, mất thì coi là chưa.
                async () => (await repick.isVisible()) || (await checkAgain.isEnabled({ timeout: 500 }).catch(() => false)),
                { timeout: 60_000 },
            )
            .toBe(true)
        return dialog()
    }

    async function cancel(): Promise<void> {
        await dialog().getByRole('button', { name: 'キャンセル', exact: true }).click()
        await expect(dialog()).toBeHidden()
    }

    test.beforeAll(async ({ browser }) => {
        admin = await openAdminApi()
        const res = await admin.ctx.get(`api/admin/mst-code/export?cdType=${CD_TYPE}`)
        expect(res.status(), 'GET /admin/mst-code/export').toBe(200)
        exported = await res.body()

        context = await browser.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
        page = await context.newPage()
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
        await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: 'ログイン' }).click()
        await expect(page, 'login admin UI (rate-limit?)').not.toHaveURL(/\/login/, { timeout: 30_000 })
    })

    test.afterAll(async () => {
        await admin?.dispose()
        await context?.close()
    })

    test('TC-01 — khối 最終取込 đọc được trạng thái (không có chữ đỏ 「取込状況を取得できませんでした。」)', async () => {
        await openImport()
        await cancel()
        const panel = page.getByRole('region', { name: 'CSV入出力' })
        await expect(panel.getByText('最終取込')).toBeVisible()
        await expect(
            panel.getByText('取込状況を取得できませんでした。'),
            'GET /admin/master-imports/codes/latest lỗi — demo1 đã chạy EF migration AddMasterImportTenantCheck chưa?',
        ).toHaveCount(0)
    })

    test('TC-02 — file UTF-8 có chữ Nhật ⇒ 「ファイルがShift_JISではありません。」', async () => {
        const d = await check('utf8.csv', Buffer.from(`${HEADER}\r\n30,1,衛生士,衛生士,0,1900-01-01,9999-12-31,0\r\n`, 'utf8'))
        // Báo ngay ở bước chuẩn bị (upload slot), không qua job kiểm tra ⇒ không có 「確認に失敗しました」.
        await expect(d).toContainText('ファイルがShift_JISではありません。CSV（コンマ区切り）で保存してください。')
        await captureFixedUi(d, 'mst-code-import-not-sjis')
        await cancel()
    })

    test('TC-03 — header sai ⇒ 「ヘッダーが不正です。」 kèm header đúng', async () => {
        const d = await check('bad-header.csv', ascii(['type,val,name1,name2,order,start,end', '30,1,a,a,0,1900-01-01,9999-12-31,0']))
        await expect(d).toContainText(`ヘッダーが不正です。1行目は「${HEADER}」にしてください。`)
        await cancel()
    })

    test('TC-04 — dòng nằm trong dải mã riêng của tenant ⇒ 「cd_val 30950 はテナント独自コードの範囲（30000～32767）です。」', async () => {
        const d = await check('in-tenant-range.csv', ascii([HEADER, `30,${OWN_CD},x,x,0,1900-01-01,9999-12-31,0`]))
        await expect(d).toContainText(`行番号 2: cd_val ${OWN_CD} はテナント独自コードの範囲（${OWN_CODE.min}～${OWN_CODE.max}）です。`)
        await cancel()
    })

    test('TC-05 — trùng khoá trong file ⇒ 「同じ cd_type, cd_val の行がファイル内で重複しています。」', async () => {
        const d = await check(
            'duplicate.csv',
            ascii([HEADER, '30,800,x,x,0,1900-01-01,9999-12-31,0', '30,800,y,y,0,1900-01-01,9999-12-31,0']),
        )
        await expect(d).toContainText('同じ cd_type, cd_val の行がファイル内で重複しています。')
        await cancel()
    })

    test('TC-05b — cột hidden: không phải 0/1, hoặc ẩn mã của nhóm không cho ẩn (30) ⇒ báo theo dòng', async () => {
        const d = await check(
            'hidden-column.csv',
            ascii([HEADER, '30,1,a,a,0,1900-01-01,9999-12-31,2', '30,2,a,a,0,1900-01-01,9999-12-31,1']),
        )
        await expect(d).toContainText('行番号 2: hidden が0または1ではありません。')
        await expect(d).toContainText('行番号 3: cd_type 30 のコードは非表示にできません。')
        await cancel()
    })

    test('TC-06 — file y hệt bản xuất ⇒ 「追加・更新するコードがないため、取り込みません。」, 取込 mờ', async () => {
        const d = await check('unchanged.csv', exported)
        await expect(d).toContainText('追加・更新するコードがないため、取り込みません。')
        await expect(d.getByRole('button', { name: '取込', exact: true })).toBeDisabled()
        await captureFixedUi(d, 'mst-code-import-nothing')
        await cancel()
    })
})
