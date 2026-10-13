import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

/**
 * Parity WinForm ↔ web, nhóm B: 歯管 (frm203021), 指導文書 (frm203022), 補管・義歯 (frm203023),
 * 申し送り (frm203025 / 203026), 歯周疾患治療履歴 (frm203033) và kintoneファイル取込 (frm203004).
 *
 * Mọi giá trị kỳ vọng là kết quả ĐO trên WinForm thật (FlaUI, `Tests/PatientGuidance`):
 *   - Form thường (BaseForm: 歯管 / 指導文書 / 補管義歯 / kintone / 歯周履歴): ESC và End KHÔNG làm
 *     gì (không đóng); Enter = Tab; Tab xoay vòng trong màn theo TabIndex, F-key là điểm dừng cuối.
 *   - Dialog (BaseDialog: 申し送り): ESC và End = F9 (登録) ⇒ báo E00001 khi để trống.
 *   - Hộp xác nhận là OK / キャンセル (ShowOKCancelMsg).
 *
 * KHÔNG ghi DB: mọi F8 / F9 / Esc / End dừng ở hộp xác nhận hoặc lỗi rồi huỷ. Bệnh nhân test tự
 * dựng (dải 990000+) xoá ở afterAll. Riêng kintone cần 医院マスタ = 34 / 1533508: spec đặt tạm
 * rồi TRẢ LẠI giá trị cũ ở afterAll.
 */

const PAT_NO = SEED_PAT_NO_BASE + 721
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const E00001_MSG = '申し送り事項が入力されていません。'

/** Lặp `kind` n lần — để viết chuỗi Tab dài cho gọn. */
const x = (kind: string, n: number): string[] => Array.from({ length: n }, () => kind)

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')

test.describe.configure({ mode: 'serial', timeout: 600_000 })

test.describe('Parity nhóm B — 歯管 / 指導文書 / 補管・義歯 / 申し送り / 歯周履歴', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined

    const box = () => page.getByRole('alertdialog')

    async function appeared(l: Locator, timeout: number): Promise<boolean> {
        return l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    async function drain() {
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(santei, 1_500))) break
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
        }
    }

    async function openEntry() {
        // Đã đứng trên 診療入力 của bệnh nhân này thì khỏi tải lại (tải lại giữa các ca hay treo).
        if (page.url().includes(`/treatments/${PAT_NO}`) && (await appeared(page.getByText('合計:').first(), 1_500))) {
            await drain()
            return
        }
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60_000 })
        await drain()
    }

    /** Loại điểm dừng Tab hiện tại: F8/F9/F10, checkbox, radio, combobox, textarea, input, grid. */
    async function kind(): Promise<string> {
        return page.evaluate(() => {
            const a = document.activeElement as HTMLInputElement | null
            if (!a || a === document.body) return '(body)'
            const fk = a.closest('[data-fkey]')?.getAttribute('data-fkey')
            if (fk) return fk
            const role = a.getAttribute('role')
            if (role === 'checkbox' || role === 'radio' || role === 'combobox') return role
            if (a.tagName === 'TEXTAREA') return 'textarea'
            if (a.tagName === 'INPUT') return 'input'
            return a.tagName === 'BUTTON' ? `button:${(a.textContent ?? '').trim().replace(/\s+/g, ' ')}` : 'grid'
        })
    }

    async function takeBox(click: RegExp): Promise<{ text: string; buttons: string[] }> {
        await expect(box()).toBeVisible({ timeout: 10_000 })
        const text = (await box().innerText()).replace(/\s+/g, ' ')
        const buttons = (await box().getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
        await box().getByRole('button', { name: click }).first().click()
        await expect(box()).toBeHidden({ timeout: 10_000 })
        return { text, buttons }
    }

    /** Bấm n lần Tab, trả về chuỗi loại điểm dừng (bắt đầu từ điểm dừng SAU focus lúc mở). */
    async function tabKinds(n: number): Promise<string[]> {
        const seen: string[] = []
        for (let i = 0; i < n; i++) {
            await page.keyboard.press('Tab')
            seen.push(await kind())
        }
        return seen
    }

    async function openByButton(name: string, heading: RegExp): Promise<Locator> {
        await openEntry()
        await page.getByRole('button', { name, exact: true }).first().click()
        const dlg = page.getByRole('dialog').filter({ hasText: heading }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_000)
        return dlg
    }

    async function closeByF10(dlg: Locator) {
        await page.getByRole('button', { name: /F10\s*戻る/ }).last().click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: PAT_NO })
        await withDb((c) =>
            c.query(
                `UPDATE person SET att_dr = (SELECT att_dr FROM person WHERE att_dr > 0
                                             GROUP BY att_dr ORDER BY count(*) DESC LIMIT 1)
                  WHERE pat_no = $1`,
                [PAT_NO],
            ),
        )
        await seedTreatmentRows(PAT_NO, TODAY, [{ trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' }])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        await openEntry()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await dropTestPatient(PAT_NO).catch(() => {})
    })

    // ── Phím chung của form BaseForm ─────────────────────────────────────────
    const FORMS = [
        { tag: '歯管', button: '歯管', heading: /歯科疾患管理に係わる管理計画書/ },
        { tag: '指導文書', button: '指導文書', heading: /実地指|訪衛指/ },
        { tag: '補管・義歯', button: '補管・義歯', heading: /クラウン・ブリッジ維持管理・義歯管理/ },
    ]
    for (const f of FORMS) {
        test(`TC-${f.tag}-KEYS — ESC / End không đóng form; F8 hỏi 「登録してよろしいですか？」 với OK/キャンセル`, async () => {
            const dlg = await openByButton(f.button, f.heading)
            for (const key of ['Escape', 'End']) {
                await dlg.click({ position: { x: 5, y: 5 } }).catch(() => {})
                await page.keyboard.press(key)
                await page.waitForTimeout(800)
                await expect(dlg, `${key} không được đóng ${f.tag}`).toBeVisible()
                await expect(box()).toBeHidden()
            }
            await page.keyboard.press('F8')
            const q = await takeBox(/^キャンセル$/)
            expect(q.text).toContain('登録してよろしいですか？')
            expect(q.buttons).toEqual(['OK', 'キャンセル'])
            await closeByF10(dlg)
        })
    }

    // ── 歯管 ─────────────────────────────────────────────────────────────────
    test('TC-歯管-TAB — focus lúc mở ở No.; Tab đúng thứ tự TabIndex WinForm và xoay vòng', async () => {
        const dlg = await openByButton('歯管', /歯科疾患管理に係わる管理計画書/)
        expect(await kind()).toBe('input')
        await expect(page.locator(':focus')).toHaveAttribute('maxlength', '5')
        const expected = [
            'combobox', ...x('input', 3), // 元号 + 年 月 日
            ...x('radio', 5), 'input', // 有無 ×3, プラーク, むし歯, その他
            ...x('checkbox', 13), // 口腔機能 7 + 小児 6
            'combobox', 'textarea', // 履歴, 特記事項
            ...x('checkbox', 5), 'input', // これまでの治療
            ...x('checkbox', 6), 'input', // 改善目標
            ...x('checkbox', 9), 'input', // 治療の予定
            'radio', ...x('checkbox', 6), 'input', // 服薬, 基礎疾患
            'input', ...x('checkbox', 2), 'input', 'input', // 薬剤名, 生活習慣, その他
            'radio', 'F8', 'F9', 'F10', // 文書書式, F-key
            'input', // quay lại No.
        ]
        expect(await tabKinds(expected.length)).toEqual(expected)
        await closeByF10(dlg)
    })

    test('TC-歯管-FIELD — 治療の予定 giới hạn 64 ký tự; Enter ở No. chuyển sang 元号', async () => {
        const dlg = await openByButton('歯管', /歯科疾患管理に係わる管理計画書/)
        const plan = dlg.getByText('【治療の予定】', { exact: true }).locator('..').locator('input').last()
        await expect(plan).toHaveAttribute('maxlength', '64')
        await page.keyboard.press('Enter')
        expect(await kind()).toBe('combobox')
        await closeByF10(dlg)
    })

    // ── 指導文書 ─────────────────────────────────────────────────────────────
    test('TC-指導文書-TAB — focus 実地指1; Tab: 訪衛指, No., 日付, 状態 ×4, スコア, 指導内容 ×6, 4 combo giờ, 履歴, F-key', async () => {
        const dlg = await openByButton('指導文書', /実地指|訪衛指/)
        expect(await kind()).toBe('checkbox')
        const expected = [
            'checkbox', 'input', 'combobox', ...x('input', 3), // 訪衛指, No., 元号, 年月日
            ...x('checkbox', 4), 'input', // 状態 ×4, プラークスコア
            ...x('combobox', 6), // 指導内容 ×6 (combo gõ tự do)
            ...x('combobox', 4), 'combobox', // giờ ×4, 履歴
            'F8', 'F9', 'F10', 'checkbox', // F-key rồi quay về 実地指1
        ]
        expect(await tabKinds(expected.length)).toEqual(expected)
        await closeByF10(dlg)
    })

    // ── 補管・義歯 ───────────────────────────────────────────────────────────
    test('TC-補管義歯-TAB — focus ô răng đầu; Tab qua 32 ô răng (digit label không phải điểm dừng) rồi 削除, 区分, 着脱, その他情報, 日付, 履歴, F-key', async () => {
        const dlg = await openByButton('補管・義歯', /クラウン・ブリッジ維持管理・義歯管理/)
        await expect(page.locator(':focus')).toHaveAttribute('data-tab-order', '0')
        const expected = [
            ...x('button:', 31), // 31 ô răng còn lại (ô đầu đã giữ focus)
            'button:下顎 削除', 'button:上顎 削除', // WinForm: 下顎削除 trước 上顎削除
            ...x('checkbox', 2), ...x('input', 2), ...x('combobox', 6), // 区分 ×2, 着脱 ×2, その他情報 ×6
            'combobox', ...x('input', 3), 'combobox', // 元号, 年月日, 履歴
            'F8', 'F9', 'F10', 'button:', // F-key rồi quay về ô răng đầu
        ]
        const seen = await tabKinds(expected.length)
        expect(seen.map((k) => (k.startsWith('button:') && !k.includes('削除') ? 'button:' : k))).toEqual(expected)
        await closeByF10(dlg)
    })

    // ── 申し送り (frm203025 / frm203026) ─────────────────────────────────────
    async function openHandover(): Promise<Locator> {
        await openEntry()
        await page.getByRole('button', { name: /^M$|^Ｍ$/ }).first().click()
        const dlg = page.getByRole('dialog').filter({ hasText: /申し送り事項/ }).filter({ hasNotText: /申し送り事項登録/ }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_000)
        return dlg
    }

    test('TC-申し送り-KEYS — focus lúc mở ở lưới; Tab: textarea, F1, F2, F9, F10; ESC / End = F9 ⇒ E00001', async () => {
        const dlg = await openHandover()
        expect(await kind()).toBe('grid')
        expect(await tabKinds(5)).toEqual(['textarea', 'F1', 'F2', 'F9', 'F10'])
        expect(await tabKinds(1)).toEqual(['grid'])
        await dlg.getByTestId('handover-textarea').click()
        for (const key of ['Escape', 'End', 'F9']) {
            await page.keyboard.press(key)
            const e = await takeBox(/^OK$/)
            expect(e.text, key).toContain(E00001_MSG)
            expect(e.buttons, key).toEqual(['OK'])
            await expect(dlg, `${key} không được đóng dialog`).toBeVisible()
        }
        await closeByF10(dlg)
    })

    test('TC-申し送り登録-KEYS — focus ô nhập; 削除/↑/↓ luôn bật; Tab: 追加, 削除, クリア, F9, F10, 一覧, ↑, ↓; ESC / End / F9 = E00001', async () => {
        const dlg = await openHandover()
        await dlg.getByRole('button', { name: /F2\s*編集/ }).click()
        const tpl = page.getByRole('dialog').filter({ hasText: /申し送り事項登録/ }).last()
        await expect(tpl).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_000)
        expect(await kind()).toBe('input')
        for (const name of ['削除', '↑', '↓']) await expect(tpl.getByRole('button', { name, exact: true })).toBeEnabled()
        const expected = ['button:追加', 'button:削除', 'button:クリア', 'F9', 'F10', 'grid', 'button:↑', 'button:↓', 'input']
        expect(await tabKinds(expected.length)).toEqual(expected)
        for (const key of ['Escape', 'End', 'F9']) {
            await tpl.click({ position: { x: 5, y: 5 } }).catch(() => {})
            await page.keyboard.press(key)
            const e = await takeBox(/^OK$/)
            expect(e.text, key).toContain(E00001_MSG)
            await expect(tpl, `${key} không được đóng dialog`).toBeVisible()
        }
        await page.getByRole('button', { name: /F10\s*戻る/ }).last().click()
        await expect(tpl).toBeHidden({ timeout: 10_000 })
        await closeByF10(dlg)
    })

    // ── 歯周疾患治療履歴 (frm203033) ─────────────────────────────────────────
    test('TC-歯周履歴-KEYS — focus 戻る; Tab xoay vòng lưới ↔ 戻る (không thoát ra 診療入力); ESC / End không đóng', async () => {
        await openEntry()
        await page.getByRole('button', { name: /^P$|^Ｐ$/ }).first().click()
        const info = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F2\s*P履歴/ }) }).last()
        await expect(info).toBeVisible({ timeout: 30_000 })
        await info.getByRole('button', { name: /F2\s*P履歴/ }).click()
        const hist = page.getByRole('dialog').filter({ hasText: '歯周疾患治療履歴' }).last()
        await expect(hist).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_000)
        expect(await kind()).toBe('F10')
        expect(await tabKinds(4)).toEqual(['grid', 'F10', 'grid', 'F10'])
        for (const key of ['Escape', 'End']) {
            await page.keyboard.press(key)
            await page.waitForTimeout(600)
            await expect(hist, `${key} không được đóng 歯周疾患治療履歴`).toBeVisible()
        }
        await page.getByRole('button', { name: /F10\s*戻る/ }).last().click()
        await expect(hist).toBeHidden({ timeout: 10_000 })
        await info.getByRole('button', { name: /F10\s*戻る/ }).click()
    })
})

test.describe('Parity nhóm B — kintoneファイル取込 (frm203004)', () => {
    let page: Page
    let original: { pref: number; inst: string } | null = null

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        // Nút F6 chỉ bật cho 医院 34 / 1533508 (frm203001.cs:577) — đặt tạm, afterAll trả lại.
        const row = await withDb(async (c) => (await c.query('SELECT pref_cd, inst_1_2 FROM mst_iin_1 LIMIT 1')).rows[0])
        original = { pref: row.pref_cd, inst: row.inst_1_2 }
        await withDb((c) => c.query("UPDATE mst_iin_1 SET pref_cd = 34, inst_1_2 = '1533508'"))
    })

    test.afterAll(async () => {
        if (original) {
            await withDb((c) =>
                c.query('UPDATE mst_iin_1 SET pref_cd = $1, inst_1_2 = $2', [original!.pref, original!.inst]),
            )
        }
        await releaseSharedPage(page)
    })

    test('TC-KINTONE-KEYS — F2 診療入力 / F3 患者登録; focus データ取込; Tab xoay vòng trong màn; ESC / End không đóng; F2 không chọn dòng ⇒ E00007', async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        const f6 = page.locator('[data-fkey="F6"]')
        await expect(f6).toBeVisible({ timeout: 60_000 })
        await f6.click()
        const screen = page.getByRole('dialog').filter({ hasText: 'ディレクトリパス' }).last()
        await expect(screen).toBeVisible({ timeout: 20_000 })
        await page.waitForTimeout(800)

        await expect(screen.locator('[data-fkey]')).toHaveText([/F2\s*診療入力/, /F3\s*患者登録/, /F10\s*戻る/, /F12\s*メニュー/])
        await expect(page.locator(':focus')).toHaveText('データ取込')
        const expected = ['button:クリア', 'grid', 'button:📁', 'input', 'F2', 'F3', 'F10', 'F12', 'button:データ取込']
        expect(await tabKinds(expected.length)).toEqual(expected)

        for (const key of ['Escape', 'End']) {
            await page.keyboard.press(key)
            await page.waitForTimeout(600)
            await expect(screen, `${key} không được đóng kintone`).toBeVisible()
        }
        await screen.getByRole('button', { name: /F2\s*診療入力/ }).click()
        await expect(box()).toBeVisible()
        expect((await box().innerText()).replace(/\s+/g, ' ')).toContain('データが選択されていません。')
        await box().getByRole('button', { name: /^OK$/ }).click()
        await screen.getByRole('button', { name: /F10\s*戻る/ }).click()
        await expect(screen).toBeHidden({ timeout: 10_000 })
    })

    const box = () => page.getByRole('alertdialog')
    async function kind(): Promise<string> {
        return page.evaluate(() => {
            const a = document.activeElement as HTMLInputElement | null
            if (!a || a === document.body) return '(body)'
            const fk = a.closest('[data-fkey]')?.getAttribute('data-fkey')
            if (fk) return fk
            if (a.tagName === 'INPUT') return 'input'
            return a.tagName === 'BUTTON' ? `button:${(a.textContent ?? '').trim()}` : 'grid'
        })
    }
    async function tabKinds(n: number): Promise<string[]> {
        const seen: string[] = []
        for (let i = 0; i < n; i++) {
            await page.keyboard.press('Tab')
            seen.push(await kind())
        }
        return seen
    }
})
