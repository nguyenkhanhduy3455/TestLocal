import { type Page } from '@playwright/test'

import { createDialogProbe, log } from '../_shared/dialog-probe'
import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

/**
 * PROBE (không assert) — nửa WEB của `fla-ui-tests/.../Tests/ToothInfo` (nhóm C):
 *   Ｐ → 歯周情報 (frm203032), Ｔ → 治療情報 (frm203031), 補管(&H) → 補綴管理 (frm203045),
 *   F6 → カルテ記載選択 → F3 → ＰＣＲ (frm203030).
 * KHÔNG ghi DB: các API ghi bị chặn (route abort) vì F9 / ESC / End của vài dialog là 登録.
 *
 *   npx playwright test tests/parity-tooth-info --retries=0 --workers=1
 */

const PAT_NO = SEED_PAT_NO_BASE + 730
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')
test.describe.configure({ mode: 'serial', timeout: 600_000 })

test.describe('PROBE nhóm C — dialog sơ đồ răng', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined
    let probe: ReturnType<typeof createDialogProbe>

    async function openEntry() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60_000 })
        const santei = page.getByText(/を算定しますか？/).first()
        for (let i = 0; i < 10; i++) {
            if (!(await probe.appeared(santei, 1_500))) break
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
        }
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
        probe = createDialogProbe(page)
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        // F9 / ESC / End của 補綴管理・PCR có thể GHI: chặn mọi request ghi tới các API đó.
        await page.route(/\/tenant\/(pat-?info|pcr-def)/, async (route) => {
            if (route.request().method() === 'GET') return route.continue()
            log(`=== KQ-WB9 === CHẶN ${route.request().method()} ${route.request().url()}`)
            return route.abort()
        })
        await openEntry()
    })

    test.afterAll(async () => {
        await page.unroute(/\/tenant\/(pat-?info|pcr-def)/).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await dropTestPatient(PAT_NO).catch(() => {})
    })

    test('PROBE 歯周情報 (frm203032)', async () => {
        await openEntry()
        const dlg = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F2\s*P履歴/ }) }).last()
        await probe.measure('歯周情報', async () => {
            if (!(await dlg.isVisible().catch(() => false))) await page.getByRole('button', { name: /^P$|^Ｐ$/ }).first().click()
            return (await probe.appeared(dlg, 30_000)) ? dlg : null
        }, 12)
    })

    test('PROBE 治療情報 (frm203031)', async () => {
        await openEntry()
        const dlg = page.getByRole('dialog').filter({ hasText: /治療情報|一初診内/ }).last()
        await probe.measure('治療情報', async () => {
            if (!(await dlg.isVisible().catch(() => false))) await page.getByRole('button', { name: /^T$|^Ｔ$/ }).first().click()
            return (await probe.appeared(dlg, 30_000)) ? dlg : null
        }, 12)
    })

    test('PROBE 補綴管理 (frm203045)', async () => {
        await openEntry()
        const dlg = page.getByRole('dialog').filter({ hasText: /補綴管理/ }).last()
        await probe.measure('補綴管理', async () => {
            if (!(await dlg.isVisible().catch(() => false))) await page.getByRole('button', { name: /補管/ }).last().click()
            return (await probe.appeared(dlg, 30_000)) ? dlg : null
        }, 20)
    })

    test('PROBE ＰＣＲ (frm203030)', async () => {
        await openEntry()
        const pcr = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /F1\s*デフォルト設定/ }) }).last()
        await probe.measure('PCR', async () => {
            if (!(await pcr.isVisible().catch(() => false))) {
                const karte = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /PCR/ }) }).last()
                if (!(await karte.isVisible().catch(() => false))) {
                    // F6 lấy 部位 của dòng ĐANG FOCUS: bấm vào dòng seed trước.
                    await page.getByText('歯科再診料').first().click()
                    await page.keyboard.press('F6')
                    await karte.waitFor({ state: 'visible', timeout: 30_000 })
                }
                await karte.getByRole('button', { name: /PCR/ }).first().click()
            }
            return (await probe.appeared(pcr, 30_000)) ? pcr : null
        }, 20, ['Escape', 'End', 'Enter', 'F8'])
    })

    test('PROBE 欠損確認 (frm203034) — 部位 chứa răng 欠損 + 病名 ダツリ', async () => {
        await withDb((c) => c.query('INSERT INTO siga (pat_no) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM siga WHERE pat_no = $1)', [PAT_NO]))
        await withDb((c) => c.query('UPDATE siga SET se_6 = 4 WHERE pat_no = $1', [PAT_NO]))
        try {
            await openEntry()
            // Ô 部位 của dòng 処置 hôm nay → 部位選択 → phím 3 (右上 3番 = se6) → End → 病名選択.
            const keys = await page
                .locator('[data-grid-cell$="|1"]')
                .evaluateAll((els) => els.map((e) => (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, '')))
            const key = keys.find((k) => k && !k.includes(':') && !/^\d+-\d+$/.test(k))
            await page.locator(`[data-grid-cell="${key}|1"]`).click()
            const tooth = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ }).last()
            log(`=== KQ-WB1 [欠損確認] === 部位選択: ${(await probe.appeared(tooth, 20_000)) ? 'MỞ' : 'KHÔNG mở'}`)
            await page.keyboard.press('3')
            await page.keyboard.press('End')
            const dis = page.getByRole('dialog').filter({ hasText: /病\s*名\s*選\s*択/ }).last()
            log(`=== KQ-WB1 [欠損確認] === 病名選択: ${(await probe.appeared(dis, 20_000)) ? 'MỞ' : 'KHÔNG mở'}`)
            await dis.getByRole('button', { name: /F4/ }).click().catch(() => {})
            await page.waitForTimeout(800)
            // F4 lọc về nhóm ダツリ: dòng 2 = 156 ｲﾝﾚｰﾀﾞﾂﾘC (dis_kbn 41) — gõ 選択番号 rồi Enter.
            const sel = dis.locator('input').last()
            await sel.fill('2')
            await sel.press('Enter')
            await page.waitForTimeout(500)
            log(`=== KQ-WB1 [欠損確認] === sau chọn 病名: ${JSON.stringify(await page.getByRole('dialog').allInnerTexts().then((a) => a.map((t) => t.replace(/\s+/g, ' ').slice(0, 70))))}`)
            await page.keyboard.press('End')
            const loss = page.getByRole('dialog').filter({ hasText: /欠\s*損\s*確\s*認/ }).last()
            await probe.measure('欠損確認', async () => ((await probe.appeared(loss, 20_000)) ? loss : null), 6, ['Enter', 'Escape'])
        } finally {
            await withDb((c) => c.query('DELETE FROM siga WHERE pat_no = $1', [PAT_NO]))
        }
    })
})
