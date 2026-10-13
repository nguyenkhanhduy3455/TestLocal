import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

/**
 * Parity WinForm ↔ web, nhóm C: 歯周情報 (frm203032), 治療情報 (frm203031), 補綴管理 (frm203045),
 * PCR (frm203030) và 欠損確認 (frm203034).
 *
 * Mọi giá trị kỳ vọng là kết quả ĐO trên WinForm thật (FlaUI, `Tests/ToothInfo`):
 *   - 歯周情報 / 治療情報: ESC và End KHÔNG làm gì; Tab xoay vòng trong dialog (F1→F2→F10;
 *     一初診内 ↔ F10); focus lúc mở ở F1 / 一初診内.
 *   - 補綴管理: 32 ô ngày là TEXT BOX (chỉ nhận số và 「/」), Enter và click mở bộ chọn ngày,
 *     rời ô với ngày sai → E00002「日付」; Tab theo TabIndex (11..18, 48..41, 21..28, 38..31);
 *     ESC và End = F9 登録 (ghi, không hỏi lại).
 *   - PCR: F1 hỏi Q00002 với OK / キャンセル; ESC và End = F9 確定 (đóng).
 *   - 欠損確認: focus 「はい」; Tab xoay はい ↔ いいえ; ESC = はい.
 *
 * KHÔNG ghi DB: API ghi 補綴管理 bị chặn (route abort), F1 của PCR luôn キャンセル. Bệnh nhân
 * test tự dựng (dải 990000+) xoá ở afterAll, cả dòng `siga` tạm cho 欠損確認.
 */

const PAT_NO = SEED_PAT_NO_BASE + 731
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const PATINFO_WRITE = /\/tenant\/patinfo\/prosthetic/

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')
test.describe.configure({ mode: 'serial', timeout: 600_000 })

test.describe('Parity nhóm C — dialog sơ đồ răng', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined
    const box = () => page.getByRole('alertdialog')

    async function appeared(l: Locator, timeout: number): Promise<boolean> {
        return l
            .waitFor({ state: 'visible', timeout })
            .then(() => true)
            .catch(() => false)
    }

    async function openEntry() {
        if (page.url().includes(`/treatments/${PAT_NO}`) && (await appeared(page.getByText('合計:').first(), 1_500))) return
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60_000 })
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 10; i++) {
            if (!(await appeared(santei, 1_500))) break
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
        }
    }

    /** Điểm dừng Tab hiện tại: F-key hoặc `kind:nhãn`. */
    async function stop(): Promise<string> {
        return page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null
            if (!a || a === document.body) return '(body)'
            const fk = a.closest('[data-fkey]')?.getAttribute('data-fkey')
            if (fk) return fk
            const role = a.getAttribute('role')
            const label = (a.getAttribute('aria-label') ?? (a.textContent || a.closest('label')?.textContent) ?? '').trim().replace(/\s+/g, ' ')
            return `${role ?? a.tagName.toLowerCase()}:${label}`
        })
    }

    async function tabStops(n: number): Promise<string[]> {
        const seen: string[] = []
        for (let i = 0; i < n; i++) {
            await page.keyboard.press('Tab')
            seen.push(await stop())
        }
        return seen
    }

    async function takeBox(click: RegExp): Promise<{ text: string; buttons: string[] }> {
        await expect(box()).toBeVisible({ timeout: 10_000 })
        const text = (await box().innerText()).replace(/\s+/g, ' ')
        const buttons = (await box().getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
        await box().getByRole('button', { name: click }).first().click()
        await expect(box()).toBeHidden({ timeout: 10_000 })
        return { text, buttons }
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
        await page.unroute(PATINFO_WRITE).catch(() => {})
        await withDb((c) => c.query('DELETE FROM siga WHERE pat_no = $1', [PAT_NO])).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await dropTestPatient(PAT_NO).catch(() => {})
    })

    // ── 歯周情報 ─────────────────────────────────────────────────────────────
    test('TC-歯周情報 — focus F1; Tab F2→F10→F1 trong dialog; ESC / End không đóng; Enter trên F1 đổi 詳細 ↔ 非表示', async () => {
        await openEntry()
        await page.getByRole('button', { name: /^P$|^Ｐ$/ }).first().click()
        const dlg = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F2\s*P履歴/ }) }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await expect.poll(stop, { timeout: 5_000 }).toBe('F1')
        expect(await tabStops(4)).toEqual(['F2', 'F10', 'F1', 'F2'])
        await page.keyboard.press('Shift+Tab')
        for (const key of ['Escape', 'End']) {
            await page.keyboard.press(key)
            await page.waitForTimeout(600)
            await expect(dlg, `${key} không được đóng 歯周情報`).toBeVisible()
        }
        await dlg.locator('[data-fkey="F1"]').focus()
        await expect(dlg.locator('[data-fkey="F1"]')).toContainText('詳細')
        await page.keyboard.press('Enter')
        await expect(dlg.locator('[data-fkey="F1"]')).toContainText('非表示')
        await expect.poll(stop, { message: 'focus phải ở lại F1 sau khi bật chi tiết' }).toBe('F1')
        await page.locator('[data-fkey="F10"]').last().click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    // ── 治療情報 ─────────────────────────────────────────────────────────────
    test('TC-治療情報 — focus 一初診内; Tab ↔ F10 (không có 閉じる); ESC / End không đóng; Enter trên checkbox sang F10', async () => {
        await openEntry()
        await page.getByRole('button', { name: /^T$|^Ｔ$/ }).first().click()
        const dlg = page.getByRole('dialog').filter({ hasText: /治療情報/ }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await expect.poll(stop, { timeout: 5_000 }).toBe('checkbox:一初診内')
        expect(await tabStops(4)).toEqual(['F10', 'checkbox:一初診内', 'F10', 'checkbox:一初診内'])
        for (const key of ['Escape', 'End']) {
            await page.keyboard.press(key)
            await page.waitForTimeout(600)
            await expect(dlg, `${key} không được đóng 治療情報`).toBeVisible()
        }
        await page.keyboard.press('Enter')
        expect(await stop()).toBe('F10')
        await dlg.locator('[data-fkey="F10"]').click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    // ── 補綴管理 ─────────────────────────────────────────────────────────────
    test('TC-補綴管理 — ô ngày là text box: chỉ số và 「/」, Tab theo TabIndex, ngày sai → E00002, Enter mở bộ chọn ngày', async () => {
        await openEntry()
        await page.getByRole('button', { name: /補管/ }).last().click()
        const dlg = page.getByRole('dialog').filter({ hasText: /補綴管理/ }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(800)

        // Focus lúc mở = txtDt11 (歯 1 của nhóm đầu); Tab: 2..8, rồi 8..1, rồi 1..8 …
        await expect.poll(stop, { timeout: 5_000 }).toBe('input:1')
        const order = await tabStops(23)
        expect(order.map((s) => s.replace('input:', ''))).toEqual([
            ...['2', '3', '4', '5', '6', '7', '8'],
            ...['8', '7', '6', '5', '4', '3', '2', '1'],
            ...['1', '2', '3', '4', '5', '6', '7', '8'],
        ].slice(0, 23))

        // Ô trống: ký tự lạ bị bỏ, chỉ còn số và 「/」.
        // Sau 23 lần Tab con trỏ đang ở ô thứ 24 trong thứ tự Tab (data-tab-order = 23).
        const cell = dlg.locator('[data-tab-order="23"]')
        await expect(cell).toBeFocused()
        await cell.fill('')
        await page.keyboard.type('ab1/2c3-4')
        await expect(cell).toHaveValue('1/234')
        // Rời ô với ngày sai → E00002「日付が間違っています。」 rồi focus quay lại ô đó.
        await page.keyboard.press('Tab')
        const e = await takeBox(/^OK$/)
        expect(e.text).toContain('日付が間違っています。')
        await expect(cell).toBeFocused()
        // Sau khi báo lỗi, Enter đầu tiên KHÔNG mở picker (_chkFlg); sửa ngày rồi Enter mở 日付入力.
        await cell.fill('20260115')
        await page.keyboard.press('Tab')
        await expect(cell).toHaveValue('2026/01/15')
        await cell.focus()
        const picker = page.getByRole('dialog').filter({ hasNotText: /補綴管理/ }).filter({ has: page.getByRole('button', { name: /F9\s*確定/ }) }).last()
        await page.keyboard.press('Enter') // _chkFlg: Enter đầu tiên sau lỗi bị nuốt
        await page.waitForTimeout(500)
        await expect(picker).toBeHidden()
        await page.keyboard.press('Enter')
        await expect(picker).toBeVisible({ timeout: 10_000 })
        await picker.getByRole('button', { name: /F10/ }).click() // 戻る: đóng picker, không đổi ô
        await expect(picker).toBeHidden({ timeout: 10_000 })
        await cell.fill('')
        await page.locator('[data-fkey="F10"]').last().click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    test('TC-補綴管理-KEYS — ESC và End = F9 登録 (gửi PUT patinfo/prosthetic, không hỏi xác nhận)', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60_000 })
        await page.route(PATINFO_WRITE, (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()))
        await page.getByRole('button', { name: /補管/ }).last().click()
        const dlg = page.getByRole('dialog').filter({ hasText: /補綴管理/ }).last()
        await expect(dlg).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(800)
        for (const key of ['Escape', 'End']) {
            const sent = page.waitForRequest((r) => PATINFO_WRITE.test(r.url()) && r.method() === 'PUT', { timeout: 10_000 })
            await page.keyboard.press(key)
            await sent
            const err = await takeBox(/^OK$/) // abort ⇒ 「登録に失敗しました」
            expect(err.text, key).toContain('登録に失敗しました')
            await expect(dlg, key).toBeVisible()
        }
        await page.unroute(PATINFO_WRITE)
        await page.locator('[data-fkey="F10"]').last().click()
        await expect(dlg).toBeHidden({ timeout: 10_000 })
    })

    // ── PCR ──────────────────────────────────────────────────────────────────
    async function openPcr(): Promise<Locator> {
        await openEntry()
        const pcr = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F1\s*デフォルト設定/ }) }).last()
        const karte = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /PCR/ }) }).last()
        if (!(await karte.isVisible().catch(() => false))) {
            await page.getByText('歯科再診料').first().click()
            await page.keyboard.press('F6')
            await karte.waitFor({ state: 'visible', timeout: 30_000 })
        }
        await karte.getByRole('button', { name: /PCR/ }).first().click()
        await expect(pcr).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(800)
        return pcr
    }

    test('TC-PCR-F1 — F1 デフォルト設定 hỏi Q00002 với OK / キャンセル (huỷ, không ghi)', async () => {
        const pcr = await openPcr()
        await page.keyboard.press('F1')
        const q = await takeBox(/^キャンセル$/)
        expect(q.text).toContain('更新してよろしいですか？')
        expect(q.buttons).toEqual(['OK', 'キャンセル'])
        await expect(pcr).toBeVisible()
        await page.keyboard.press('F10')
        await expect(pcr).toBeHidden({ timeout: 10_000 })
    })

    for (const key of ['Escape', 'End']) {
        test(`TC-PCR-${key} — ${key} = F9 確定 (đóng PCR)`, async () => {
            const pcr = await openPcr()
            await page.keyboard.press(key)
            await expect(pcr, `${key} phải chạy 確定 và đóng PCR`).toBeHidden({ timeout: 10_000 })
            // WinForm: 確定 đóng cả カルテ記載選択 phía sau.
            await expect(page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F3\s*PCR/ }) })).toBeHidden({ timeout: 10_000 })
        })
    }

    // ── 欠損確認 ─────────────────────────────────────────────────────────────
    test('TC-欠損確認 — focus はい; Tab はい ↔ いいえ; ESC = はい (đóng)', async () => {
        await withDb((c) => c.query('INSERT INTO siga (pat_no) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM siga WHERE pat_no = $1)', [PAT_NO]))
        await withDb((c) => c.query('UPDATE siga SET se_6 = 4 WHERE pat_no = $1', [PAT_NO]))
        await page.reload({ waitUntil: 'domcontentloaded' })
        await openEntry()
        // 部位選択 → 右上 3番 (se6 = 欠損) → End → 病名選択 (F4 ダツリ) → 2 = 156 → End.
        const keys = await page
            .locator('[data-grid-cell$="|1"]')
            .evaluateAll((els) => els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')))
        const key = keys.find((k) => k && !k.includes(':') && !/^\d+-\d+$/.test(k))
        await page.locator(`[data-grid-cell="${key}|1"]`).click()
        const tooth = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ }).last()
        await expect(tooth).toBeVisible({ timeout: 20_000 })
        await page.keyboard.press('3')
        await page.keyboard.press('End')
        const dis = page.getByRole('dialog').filter({ hasText: /病\s*名\s*選\s*択/ }).last()
        await expect(dis).toBeVisible({ timeout: 20_000 })
        await dis.getByRole('button', { name: /F4/ }).click()
        await expect(dis.getByText('ｲﾝﾚｰﾀﾞﾂﾘC').first()).toBeVisible({ timeout: 10_000 })
        const sel = dis.locator('input').last()
        await sel.fill('2')
        await sel.press('Enter')
        await page.waitForTimeout(500)
        await page.keyboard.press('End')

        const loss = page.getByRole('dialog').filter({ hasText: /欠\s*損\s*確\s*認/ }).last()
        await expect(loss).toBeVisible({ timeout: 20_000 })
        await expect.poll(stop, { timeout: 5_000 }).toBe('F9')
        expect(await tabStops(3)).toEqual(['F10', 'F9', 'F10'])
        await page.keyboard.press('Escape')
        await expect(loss, 'ESC = F9 はい: phải đóng dialog').toBeHidden({ timeout: 10_000 })
        await withDb((c) => c.query('DELETE FROM siga WHERE pat_no = $1', [PAT_NO]))
    })
})
