/**
 * ComboBox chung (`@ochacom/web-ui/combo-box`) — chụp lại từng ô "vừa gõ vừa chọn"
 * trên mọi màn đã chuyển sang control chung, để người review soi bằng mắt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HÀNH VI ĐƯỢC ĐO (combo-box.tsx)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - List KHÔNG lọc theo chữ gõ và KHÔNG có dòng 「新規作成」 — luôn đủ mọi mục.
 *  - Gõ chữ ⇒ list tự thả xuống, CHỌN mục đầu tiên có label CHỨA chữ đó (không
 *    phân biệt hoa thường) và cuộn nó vào tầm nhìn. Chữ gõ giữ nguyên trong ô.
 *  - F4 thả/thu list; ESC khi list mở chỉ thu list (dialog bên ngoài không đóng).
 *
 * Mỗi testcase: thả list bằng F4 để đọc các mục THẬT, lấy một đoạn ở GIỮA label
 * của mục cuối cùng (để chứng minh khớp "chứa" chứ không phải "bắt đầu bằng", và
 * để list phải cuộn), gõ đoạn đó, assert mục được chọn = mục đầu tiên chứa nó và
 * đang nằm trong viewport, rồi chụp. Xong trả lại chữ cũ cho ô — spec CHỈ ĐỌC,
 * không bấm lưu ở đâu cả.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Bệnh nhân seed 990601 (một dòng 再診料 hôm nay để lưới 診療入力 có ô 療法) và
 * 3 mẫu 紹介状 `E2E-combo-*` trong shoukai_tmp (id 990601..990603), xoá ở afterAll. Ô nào list rỗng (vd 指導内容 / その他情報 của bệnh nhân mới
 * chưa có lịch sử) thì chụp ở trạng thái gõ tự do và ghi log lý do.
 *
 * Ảnh: capture-results/ui-fixes/<ngày>/combo-<màn>-<ô>.png
 */
import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { openPatientRegistration } from '../_shared/entry'
import { GRID_LOAD_ATTEMPTS, GRID_LOAD_TIMEOUT, GRID_RELOAD_TIMEOUT, TODAY_ISO } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { skipWithReason } from '../_shared/step'

const PAT_NO = 990601
const OPEN_TIMEOUT = 30_000
/** 紹介状 templates seeded so 発行済呼出し has a real list; removed in afterAll. */
const TEMPLATE_PREFIX = 'E2E-combo-'
const TEMPLATES = ['歯科医院宛', '大学病院宛て', '口腔外科宛']

test.describe.configure({ mode: 'serial', retries: 0, timeout: 180_000 })

test.describe('ComboBox chung — gõ nhảy tới mục đầu tiên CHỨA chữ, có ảnh chụp', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân 990601')
        await seedTestPatient({ patNo: PAT_NO, patNm: 'コンボ　テスト', patKn: 'こんぼ　てすと' })
        await seedTreatmentRows(PAT_NO, TODAY_ISO, [
            { trtCd: 110, trtSb: 0, trtPt: 59, dspTrt: '歯科再診料' },
        ])
        await withDb(async (c) => {
            await c.query('DELETE FROM shoukai_tmp WHERE template_nm LIKE $1', [`${TEMPLATE_PREFIX}%`])
            for (const [i, nm] of TEMPLATES.entries()) {
                await c.query('INSERT INTO shoukai_tmp (id, template_nm) VALUES ($1, $2)', [
                    PAT_NO + i,
                    `${TEMPLATE_PREFIX}${nm}`,
                ])
            }
        })
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await page?.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
        if (!dbEnabled) return
        await withDb((c) =>
            c.query('DELETE FROM shoukai_tmp WHERE template_nm LIKE $1', [`${TEMPLATE_PREFIX}%`]),
        ).catch(() => undefined)
        await deleteTestPatient(PAT_NO).catch(() => undefined)
    })

    /**
     * `goto` rồi chờ mốc sẵn sàng; nạp lại khi Vite dev server nhả hụt module (trang
     * trắng) — cùng lý do retry với `openTreatmentEntry`, nhưng mốc do caller chọn
     * (lưới bệnh nhân seed không có ô |2 nếu chưa có dòng, màn master thì chờ ô combo).
     */
    async function gotoReady(url: string, ready: () => Locator) {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(url, { waitUntil: 'domcontentloaded' })
            try {
                await expect(ready()).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                return
            } catch (e) {
                lastErr = e
                console.log(`gotoReady ${url}: lần ${attempt}/${GRID_LOAD_ATTEMPTS} chưa sẵn sàng — nạp lại`)
            }
        }
        throw lastErr
    }

    /**
     * Thao tác chung cho một ô: đọc list thật → gõ một đoạn ở giữa label mục cuối →
     * assert nhảy đúng + trong viewport → chụp → trả chữ cũ.
     */
    async function jumpAndCapture(scope: Page | Locator, label: string, file: string) {
        const combo = scope.getByRole('combobox', { name: label, exact: true })
        await expect(combo, `không thấy ô ${label}`).toBeEnabled({ timeout: OPEN_TIMEOUT })
        const original = await combo.inputValue()
        const list = page.getByRole('listbox', { name: label, exact: true })

        await combo.click()
        await combo.press('F4')
        await expect(list, `F4 không thả list của ${label}`).toBeVisible()
        const labels = (await list.getByRole('option').allInnerTexts()).map((t) => t.trim())
        await combo.press('F4')
        await expect(list).toBeHidden()
        // List không bao giờ có dòng 「新規作成」.
        expect(labels.some((l) => l.startsWith('新規作成'))).toBe(false)

        const target = [...labels].reverse().find((l) => l !== '')
        if (target === undefined) {
            console.log(`${label}: list rỗng (chỉ có dòng trống) — chụp trạng thái gõ tự do`)
            await combo.fill('自由入力')
            await expect(combo).toHaveValue('自由入力')
            await captureFixedUi(page, file)
            await combo.press('Escape')
            await combo.fill(original)
            await combo.press('Escape')
            return
        }

        // Đoạn ở GIỮA label (bỏ ký tự đầu) ⇒ khớp "chứa", không khớp "bắt đầu bằng".
        const chars = [...target]
        const keyword = chars.length >= 3 ? chars.slice(1, -1).join('') : chars.slice(-1).join('')
        const expectedIdx = labels.findIndex((l) => l.toLowerCase().includes(keyword.toLowerCase()))
        console.log(`${label}: ${labels.length} mục, gõ 「${keyword}」 ⇒ chờ chọn 「${labels[expectedIdx]}」`)

        await combo.fill('')
        await combo.pressSequentially(keyword)
        await expect(list, `gõ chữ không tự thả list của ${label}`).toBeVisible()
        await expect(list.getByRole('option')).toHaveCount(labels.length)
        const selected = list.locator('[role="option"][aria-selected="true"]')
        await expect(selected).toHaveCount(1)
        await expect(selected).toHaveText(labels[expectedIdx]!)
        await expect(selected, `mục được chọn của ${label} không được cuộn vào tầm nhìn`).toBeInViewport()
        await expect(combo).toHaveValue(keyword)
        await captureFixedUi(page, file)

        // ESC khi list mở: chỉ thu list.
        await combo.press('Escape')
        await expect(list).toBeHidden()
        await combo.fill(original)
        await combo.press('Escape')
    }

    test('TC-1 受付患者一覧 (/treatments) — Dr.', async () => {
        await gotoReady('/treatments', () => page.getByRole('combobox', { name: 'Dr.', exact: true }))
        await jumpAndCapture(page, 'Dr.', 'combo-01-treatments-dr')
    })

    test('TC-2 診療入力 → Shift+F3 紹介状 — 担当医 / 発行済呼出し', async () => {
        await gotoReady(`/treatments/${PAT_NO}?trtDt=${TODAY_ISO}`, () =>
            page.locator('[data-grid-cell$="|2"]').first(),
        )
        await page.keyboard.press('Shift+F3')
        const dialog = page.getByRole('dialog').filter({ hasText: '発行済呼出し' })
        await expect(dialog).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(dialog, '担当医', 'combo-02-referral-tanto')
        await jumpAndCapture(dialog, '発行済呼出し', 'combo-03-referral-template')
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: OPEN_TIMEOUT })
    })

    test('TC-3 診療入力 → 指導文書 — 指導内容1', async () => {
        await page.getByRole('button', { name: '指導文書', exact: true }).click()
        const dialog = page.getByRole('dialog').filter({ hasText: '【指導内容】' })
        await expect(dialog).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(dialog, '指導内容1', 'combo-04-oral-hygiene-guide1')
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: OPEN_TIMEOUT })
    })

    test('TC-4 診療入力 → 補管・義歯 — その他情報1', async () => {
        await page.getByRole('button', { name: '補管・義歯', exact: true }).click()
        const dialog = page.getByRole('dialog').filter({ hasText: '【着脱方法】' })
        await expect(dialog).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(dialog, 'その他情報1', 'combo-05-prosthesis-other1')
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: OPEN_TIMEOUT })
    })

    test('TC-5 患者登録 — 記号, rồi F5 主訴登録 — 主訴１', async () => {
        await openPatientRegistration(page, String(PAT_NO))
        await jumpAndCapture(page.locator('main'), '記号', 'combo-06-patient-registration-kigo')

        await page.locator('main').locator('[data-fkey="F5"]:visible').first().click()
        const dialog = page
            .locator('dialog[open], [role="dialog"]:visible')
            .filter({ hasText: /主\s*訴\s*登\s*録/ })
            .last()
        await expect(dialog).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(dialog, '主訴１', 'combo-07-chief-complaint-1')
        await dialog.locator('[data-fkey="F10"]:visible').first().click()
        await expect(dialog).toBeHidden({ timeout: OPEN_TIMEOUT })
    })

    test('TC-6 初期設定 → 福祉医療設定 — 福祉医療 (lọc), F1 新規 — 福祉医療 / 上限回数', async () => {
        await gotoReady('/settings/general', () => page.getByRole('button', { name: '福祉医療設定' }).first())
        await page.getByRole('button', { name: '福祉医療設定' }).first().click()
        const screenDialog = page.getByRole('dialog').filter({ hasText: '前方一致' })
        await expect(screenDialog).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(screenDialog, '福祉医療', 'combo-08-welfare-filter')

        await screenDialog.getByRole('button', { name: /F1\s*新規/ }).click()
        const detail = page.getByRole('dialog').filter({ hasText: '上限回数' })
        await expect(detail).toBeVisible({ timeout: OPEN_TIMEOUT })
        await jumpAndCapture(detail, '福祉医療', 'combo-09-welfare-detail-insurer')
        // 上限回数 chỉ nhận chữ số (Num_KeyPress) nên không gõ được 「制限無し」: đo gõ số
        // tự do (không khớp mục nào ⇒ không chọn gì), rồi chọn 制限無し từ list.
        const cnt = detail.getByRole('combobox', { name: '上限回数', exact: true })
        const cntList = page.getByRole('listbox', { name: '上限回数', exact: true })
        await expect(cnt).toBeEnabled({ timeout: OPEN_TIMEOUT })
        await cnt.fill('')
        await cnt.pressSequentially('1a2')
        await expect(cnt).toHaveValue('12')
        await expect(cntList).toBeVisible()
        await expect(cntList.locator('[role="option"][aria-selected="true"]')).toHaveCount(0)
        await captureFixedUi(page, 'combo-10-welfare-detail-cnt-typed')
        await cntList.getByRole('option', { name: '制限無し' }).click()
        await expect(cnt).toHaveValue('制限無し')
        await expect(cntList).toBeHidden()
        await captureFixedUi(page, 'combo-10b-welfare-detail-cnt-picked')
    })

    test('TC-7 医薬品マスタ (/masters/drugs) — 適用日 / 表示可否', async () => {
        await gotoReady('/masters/drugs', () => page.getByRole('combobox', { name: '適用日', exact: true }))
        await jumpAndCapture(page, '適用日', 'combo-11-drug-master-appdt')
        await jumpAndCapture(page, '表示可否', 'combo-12-drug-master-active')
    })

    test('TC-8 病名マスタ (/masters/dis) — 適用日', async () => {
        await gotoReady('/masters/dis', () => page.getByRole('combobox', { name: '適用日', exact: true }))
        await jumpAndCapture(page, '適用日', 'combo-13-dis-master-appdt')
    })

    test('TC-9 処置マスタ (/masters/trt) — 適用日', async () => {
        await gotoReady('/masters/trt', () => page.getByRole('combobox', { name: '適用日', exact: true }))
        await jumpAndCapture(page, '適用日', 'combo-14-trt-master-appdt')
    })
})
