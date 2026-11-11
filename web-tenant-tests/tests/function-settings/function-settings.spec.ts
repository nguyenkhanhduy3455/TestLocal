import { type Page } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { expect, releaseSharedPage, test } from '../_shared/session'

/**
 * 機能設定 (frm506008) — các tab đã port: 患者登録 / 窓口精算１ / 窓口精算２ / 診療入力 / 診療チェック / レセプト / 予約.
 *
 * Màn hình đọc/ghi 5 namespace của `tenant_config`: pat, yoyaku, acc, inp-legacy, rcp. Spec đối chiếu UI với
 * DB thật rồi ghi một vòng (đổi 2 giá trị vô hại → F9 → đọc DB → đổi lại → F9 → đọc DB), nên sau khi chạy
 * xong DB trở lại như cũ. Nếu bị ngắt giữa chừng, afterAll khôi phục bằng SQL (lúc đó Redis còn cache cũ
 * tới ~1h: xoá key `tenant:*:cache:config:*` hoặc restart API).
 *
 * Điều spec chốt (parity WinForm `frm506008.setConfigData`):
 *   - F9 ghi cả 4 namespace rồi QUAY LẠI 初期設定;
 *   - 領収書タイプ giữ chữ số hàng chục (trạng thái nút in biên lai) sau khi lưu;
 *   - yoyaku.timeVal vẫn = 2 (hằng số WinForm, đo bằng FlaUI);
 *   - 消費税率 là ô disabled;
 *   - 税区分 khác dòng đầu mà 消費税処理 ở dòng đầu ⇒ E00002 「消費税処理の選択」, không ghi.
 *
 * Cần TEST_DB=1 (đọc DB). Không đụng /v1/print.
 */
const NAMESPACES = ['pat', 'yoyaku', 'acc', 'inp-legacy', 'rcp'] as const
type Ns = (typeof NAMESPACES)[number]
type Row = Record<string, unknown>

const FAX_MARKER = 'E2E-FAX-0000'
/** 月次診療年月変更日 tạm dùng trong vòng ghi (0-99). */
const UPD_DAY_MARKER = '17'

async function readConfig(): Promise<Record<Ns, Row>> {
    return withDb(async (c) => {
        const r = await c.query<{ namespace: Ns; value: Row }>(
            `SELECT namespace, value FROM tenant_config WHERE namespace = ANY($1)`,
            [NAMESPACES],
        )
        return Object.fromEntries(r.rows.map((x) => [x.namespace, x.value])) as Record<Ns, Row>
    })
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('機能設定', () => {
    test.skip(!dbEnabled, 'cần TEST_DB=1 để đối chiếu UI với tenant_config')

    let page: Page
    let original: Record<Ns, Row>
    /** true từ lúc TC-save ghi đến lúc TC-restore trả lại: chỉ khi đó afterAll mới phải khôi phục bằng SQL. */
    let dirty = false

    const tab = (name: string) => page.getByRole('tab', { name })
    const check = (name: string) => page.getByRole('checkbox', { name })
    const checked = async (name: string) => (await check(name).getAttribute('aria-checked')) === 'true'

    /**
     * Mở màn hình bằng điều hướng TRONG app (không `goto`): mỗi lần tải lại trang Vite dev kéo ~1500 module,
     * chạy dồn vài lần là bị chặn và trang trắng. Cũng nhờ vậy mới lộ lỗi mở lại màn hình sau khi lưu
     * (xem TC-save).
     */
    async function openScreen() {
        const url = page.url()
        if (url.includes('/settings/function')) {
            await page.locator('[data-fkey="F10"]').click()
            await expect(page).toHaveURL(/\/settings\/general/, { timeout: 20_000 })
        } else if (!url.includes('/settings/general')) {
            await page.goto('/settings/general', { waitUntil: 'domcontentloaded' })
        }
        const entry = page.getByRole('button', { name: '機能設定' }).first()
        await expect(entry).toBeVisible({ timeout: 60_000 })
        await entry.click()
        await expect(page).toHaveURL(/\/settings\/function/, { timeout: 20_000 })
        await expect(tab('患者登録')).toBeVisible({ timeout: 30_000 })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        original = await readConfig()
    })

    test.afterAll(async () => {
        // Khôi phục bằng SQL nếu một test giữa chừng bị đỏ sau khi đã ghi.
        const now = dirty ? await readConfig().catch(() => null) : null
        if (now) {
            for (const ns of NAMESPACES) {
                if (JSON.stringify(now[ns]) === JSON.stringify(original[ns])) continue
                await withDb((c) =>
                    c.query(`UPDATE tenant_config SET value = $2 WHERE namespace = $1`, [ns, original[ns]]),
                )
            }
        }
        await releaseSharedPage(page)
    })

    test('TC-open — 初期設定 → 機能設定 mở màn, có đủ 6 tab', async () => {
        await openScreen()
        for (const name of ['患者登録', '窓口精算１', '窓口精算２', '診療入力', '診療チェック', 'レセプト', '予約']) {
            await expect(tab(name)).toBeVisible()
        }
        await page.locator('[data-fkey="F10"]').click()
        await expect(page, 'F10 戻る về 初期設定 không ghi').toHaveURL(/\/settings\/general/, { timeout: 20_000 })
    })

    test('TC-load — giá trị trên 予約 / 診療入力 / 診療チェック / 窓口精算１ khớp tenant_config', async () => {
        await openScreen()

        await tab('予約').click()
        await expect(check('予約機能を使用する')).toHaveAttribute(
            'aria-checked',
            String(original.yoyaku.appoFlg === 1),
        )
        await expect(page.getByRole('radio', { name: String(original.yoyaku.chair) }).first()).toBeChecked()

        await tab('診療入力').click()
        expect(await checked('面を入力する')).toBe(original['inp-legacy'].menuInputFlg === 1)
        expect(await checked('病検の検索期間6ヶ月')).toBe(original['inp-legacy'].byokenMode === 1)

        await tab('診療チェック').click()
        expect(await checked('ガイド表示時チェックをスキップする')).toBe(original['inp-legacy'].guideChkFlg === 1)

        await tab('レセプト').click()
        expect(await checked('患者情報を摘要欄に印字する')).toBe(original.rcp.patPrnFlg === 1)
        await expect(page.getByRole('textbox', { name: '月次診療年月変更日' })).toHaveValue(
            original.rcp.medymUpdDt ? String(original.rcp.medymUpdDt) : '',
        )

        await tab('窓口精算１').click()
        expect(await checked('窓口精算機能を使用する')).toBe(original.acc.accFlg === 1)
        await expect(page.getByRole('textbox', { name: '消費税率 (百分率)' }), '標準税率 là ô disabled').toBeDisabled()
    })

    test('TC-save — F9 ghi acc + inp-legacy, quay lại 初期設定, giữ hằng số WinForm', async () => {
        await openScreen()

        await tab('診療入力').click()
        await check('病検の検索期間6ヶ月').click()
        await tab('窓口精算２').click()
        await page.getByRole('textbox', { name: 'FAX番号' }).fill(FAX_MARKER)
        await tab('レセプト').click()
        await page.getByRole('textbox', { name: '月次診療年月変更日' }).fill(UPD_DAY_MARKER)

        dirty = true
        await page.locator('[data-fkey="F9"]').click()
        await expect(page, 'F9 xong phải quay lại 初期設定').toHaveURL(/\/settings\/general/, { timeout: 30_000 })

        const after = await readConfig()
        expect(after['inp-legacy'].byokenMode).toBe(original['inp-legacy'].byokenMode === 1 ? 0 : 1)
        expect(after.acc.prtTel2).toBe(FAX_MARKER)
        expect(after.acc.receType, '領収書タイプ: chữ số hàng chục (trạng thái nút in) phải được giữ').toBe(
            original.acc.receType,
        )
        expect(after.yoyaku.timeVal, 'yoyaku.timeVal = 2 là hằng số WinForm').toBe(2)
        expect(after.pat, '患者登録 không đổi (patWizard được giữ)').toEqual(original.pat)
        expect(after.rcp.medymUpdDt).toBe(Number(UPD_DAY_MARKER))
        // WinForm sửa đúng hàng đã nạp: các khoảng hiệu lực theo mẫu (hotetuStDt, …) không được đổi.
        for (const k of Object.keys(original.rcp).filter((k) => /(St|Ed)Dt$/.test(k))) {
            expect(after.rcp[k], `rcp.${k} phải được giữ nguyên`).toBe(original.rcp[k])
        }

        // Mở lại NGAY trong cùng phiên (không tải lại trang): form phải hiện giá trị vừa lưu, không phải bản cache cũ.
        await openScreen()
        await tab('窓口精算２').click()
        await expect(page.getByRole('textbox', { name: 'FAX番号' })).toHaveValue(FAX_MARKER)
        await tab('レセプト').click()
        await expect(page.getByRole('textbox', { name: '月次診療年月変更日' })).toHaveValue(UPD_DAY_MARKER)
        await tab('診療入力').click()
        expect(await checked('病検の検索期間6ヶ月')).toBe(after['inp-legacy'].byokenMode === 1)
    })

    test('TC-restore — đổi lại và F9 ⇒ DB về đúng giá trị ban đầu', async () => {
        await openScreen()

        await tab('診療入力').click()
        await check('病検の検索期間6ヶ月').click()
        await tab('窓口精算２').click()
        await page.getByRole('textbox', { name: 'FAX番号' }).fill(String(original.acc.prtTel2 ?? ''))
        await tab('レセプト').click()
        await page
            .getByRole('textbox', { name: '月次診療年月変更日' })
            .fill(original.rcp.medymUpdDt ? String(original.rcp.medymUpdDt) : '')

        await page.locator('[data-fkey="F9"]').click()
        await expect(page).toHaveURL(/\/settings\/general/, { timeout: 30_000 })

        const after = await readConfig()
        expect(after['inp-legacy'].byokenMode).toBe(original['inp-legacy'].byokenMode)
        expect(after.acc.prtTel2 ?? null).toBe(original.acc.prtTel2 ?? null)
        expect(after.rcp.medymUpdDt).toBe(original.rcp.medymUpdDt)
        dirty = false
    })

    test('TC-E00002 — 税区分 khác dòng đầu + 消費税処理 ở dòng đầu ⇒ E00002, không ghi', async () => {
        // Lần lưu trước đã chuẩn hoá hàng acc (thêm medicalCreditKbn, prtTel3 rỗng → null) nên so với
        // snapshot NGAY TRƯỚC test này, không phải bản gốc.
        const before = await readConfig()
        await openScreen()
        await tab('窓口精算１').click()

        // 自費: chọn 消費税処理 = dòng đầu của combo, 税区分 = dòng thứ hai trở đi.
        const jTax = page.getByRole('combobox', { name: '自費税区分' })
        const jCalc = page.getByRole('combobox', { name: '自費消費税処理' })
        await jCalc.click()
        await page.getByRole('option').first().click()
        await jTax.click()
        await page.getByRole('option').nth(1).click()

        await page.locator('[data-fkey="F9"]').click()
        await expect(page.getByRole('alertdialog')).toContainText('消費税処理の選択')
        await page.getByRole('alertdialog').getByRole('button').first().click()
        await expect(page, 'E00002 thì ở lại màn hình').toHaveURL(/\/settings\/function/)

        expect(await readConfig(), 'E00002 không được ghi gì').toEqual(before)
        await page.locator('[data-fkey="F10"]').click()
        await expect(page).toHaveURL(/\/settings\/general/, { timeout: 20_000 })
    })
})
