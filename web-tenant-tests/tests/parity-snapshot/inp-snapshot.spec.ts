import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import {
    dumpSnapshot,
    ensureMode,
    f11Menu,
    openInp,
    openPanelTab,
    readDialogs,
    readPanel,
    kobeSearchByCode,
    openHistoryMenu,
    readHistory,
    selectNo,
    typeIntoFooterTen,
    PAT_NO,
} from './_snapshot'

/**
 * Parity 診療入力 — vế web. Mỗi test `case:<tên>` là MỘT kịch bản, cùng tên với method
 * trong `fla-ui-tests/.../Tests/ParitySnapshot/InpSnapshotTests.cs`. CHỈ thao tác trên bộ
 * nhớ, không bấm F9 ⇒ không ghi DB. Mỗi test tự mở màn lại nên chạy lẻ bằng `-g` được.
 *
 *   npx playwright test tests/parity-snapshot/inp-snapshot.spec.ts -g "case:open$"
 */
test.describe('parity 診療入力', () => {
    test.beforeEach(async ({ authedPage }) => {
        test.setTimeout(180_000)
        await installOverlayHandlers(authedPage, { santei: true })
    })
    test.afterEach(async ({ authedPage }) => {
        await releaseSharedPage(authedPage)
    })

    test('case:open', async ({ authedPage: page }) => {
        await openInp(page)
        await dumpSnapshot(page, 'open')
    })

    // ── A1 panel phải: chọn tab, đọc danh sách ─────────────────────────────
    for (const [name, tab] of [
        ['panel-byou', '病検'],
        ['panel-guide', 'ガイド'],
        ['panel-pack', 'パック'],
        ['panel-kobe', '個別'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            await openPanelTab(page, tab)
            await dumpSnapshot(page, name, { panel: await readPanel(page) })
        })
    }

    // ── A2 nhập lưới ─────────────────────────────────────────────────────────

    test('case:code-entry-picker', async ({ authedPage: page }) => {
        await openInp(page)
        await ensureMode(page, 'コード')
        await typeIntoFooterTen(page, '110')
        const picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        await expect(picker.locator('[data-testid^="cell-"]').first()).toBeVisible({ timeout: 20_000 })
        await dumpSnapshot(page, 'code-entry-picker', { dialogs: await readDialogs(page) })
    })

    test('case:code-entry-commit', async ({ authedPage: page }) => {
        await openInp(page)
        await ensureMode(page, 'コード')
        await typeIntoFooterTen(page, '110')
        const picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        const sb = picker.getByTestId('cell-trtSb')
        await expect(sb.first()).toBeVisible({ timeout: 20_000 })
        const idx = (await sb.allTextContents()).findIndex((t) => Number(t.trim()) === 0)
        await picker.getByTestId('cell-trtNm').nth(idx).click()
        await picker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(picker).toBeHidden({ timeout: 15_000 })
        await expect(page.locator('input:focus')).toHaveValue('1', { timeout: 15_000 })
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle')
        await dumpSnapshot(page, 'code-entry-commit', { dialogs: await readDialogs(page) })
    })

    test('case:point-entry-picker', async ({ authedPage: page }) => {
        await openInp(page)
        await ensureMode(page, '点数')
        await typeIntoFooterTen(page, '59')
        const picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        await expect(picker.locator('[data-testid^="cell-"]').first()).toBeVisible({ timeout: 20_000 })
        await dumpSnapshot(page, 'point-entry-picker', { dialogs: await readDialogs(page) })
    })

    test('case:kobe-select', async ({ authedPage: page }) => {
        await openInp(page)
        await openPanelTab(page, '個別')
        await kobeSearchByCode(page, 110)
        await selectNo(page, 1)
        await dumpSnapshot(page, 'kobe-select', { dialogs: await readDialogs(page) })
    })

    for (const [name, tab] of [
        ['pack-select', 'パック'],
        ['guide-select', 'ガイド'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            await openPanelTab(page, tab)
            await selectNo(page, 1)
            // Hộp thoại có thể là bảng (nạp sau khi mở — đợi ô đầu tiên) hoặc hộp thông báo
            // (「算定可能な処置はありません。」) — đợi một trong hai.
            await expect(
                page.getByRole('dialog').locator('[data-testid^="cell-"]').first().or(page.getByRole('alertdialog')),
            ).toBeVisible({ timeout: 20_000 })
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    test('case:kobe-commit', async ({ authedPage: page }) => {
        await openInp(page)
        await openPanelTab(page, '個別')
        await kobeSearchByCode(page, 110)
        await selectNo(page, 1)
        await expect(page.locator('input:focus')).toHaveValue('1', { timeout: 15_000 })
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle')
        await dumpSnapshot(page, 'kobe-commit', { dialogs: await readDialogs(page) })
    })

    test('case:bui-dialog', async ({ authedPage: page }) => {
        await openInp(page)
        const bui = page.locator('[data-grid-cell$=":footer-bui|1"]').last()
        await bui.scrollIntoViewIfNeeded()
        await bui.click()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 })
        await dumpSnapshot(page, 'bui-dialog', { dialogs: await readDialogs(page) })
    })

    // ── A3 thao tác dòng ─────────────────────────────────────────────────────
    // Ô 療法・処置 (cột 2) của dòng CUỐI có chữ đó — như `KeyOnRow` vế WinForm. Dòng 日計 không
    // phải ô lưới thường: bấm vào ô 点 của nó (ô vàng) rồi mới bấm phím.
    for (const [name, ryo, key] of [
        ['row-insert', '歯科疾患管理料', 'Insert'],
        ['row-delete-trt', '歯科疾患管理料', 'Delete'],
        ['row-delete-bui', 'ＭＴ（Ｂｒ）', 'Delete'],
        ['row-delete-nikkei', '日計', 'Delete'],
        ['row-insert-nikkei', '日計', 'Insert'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            const target =
                ryo === '日計'
                    ? page.locator('input[data-footer-cell$=":footer-ten"]').last()
                    : page.locator('[data-grid-cell$="|2"]').filter({ hasText: ryo }).last()
            await target.scrollIntoViewIfNeeded()
            await target.click()
            await page.keyboard.press(key)
            await page.waitForLoadState('networkidle')
            await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 6_000 }).catch(() => {})
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    // ── A4 phím F (lớp thường) ───────────────────────────────────────────────
    // Như `FKey` vế WinForm: con trỏ ở ô 療法・処置 của 歯科疾患管理料 rồi bấm phím.
    for (const key of ['F1', 'F2', 'F4', 'F5', 'F6', 'F7', 'F12'] as const) {
        test(`case:fkey-${key.toLowerCase()}`, async ({ authedPage: page }) => {
            await openInp(page)
            const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
            await cell.scrollIntoViewIfNeeded()
            await cell.click()
            await page.keyboard.press(key)
            await page.waitForLoadState('networkidle')
            await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 6_000 }).catch(() => {})
            await dumpSnapshot(page, `fkey-${key.toLowerCase()}`, {
                panel: await readPanel(page),
                dialogs: await readDialogs(page),
            })
        })
    }

    test('case:fkey-f3', async ({ authedPage: page }) => {
        await openInp(page)
        const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
        await cell.scrollIntoViewIfNeeded()
        await cell.click()
        await page.keyboard.press('F3')
        // Kết quả là panel lỗi HOẶC hộp I00100 「エラーはありません。」.
        await expect(
            page.getByRole('region', { name: '処置データチェック エラー一覧' }).or(page.getByRole('alertdialog')),
        ).toBeVisible({ timeout: 30_000 })
        const check = await page.evaluate(() => {
            const region = document.querySelector('[aria-label="処置データチェック エラー一覧"]')
            const count = (document.body.innerText.match(/エラー\s*(\d+)件/) ?? [])[1] ?? ''
            const lines = region
                ? Array.from(region.children)
                      .map((r) => (r.lastElementChild as HTMLElement | null)?.innerText.trim() ?? '')
                      .filter((t) => t !== '' && !t.includes('以上'))
                : []
            return { count, lines }
        })
        await dumpSnapshot(page, 'fkey-f3', { check, dialogs: await readDialogs(page) })
    })

    // ── A5 lớp Shift (chỉ các phím ở lại màn này) ─────────────────────────────
    for (const key of ['F2', 'F4', 'F6', 'F9', 'F10', 'F3', 'F5', 'F7', 'F11'] as const) {
        const name = `shift-${key.toLowerCase()}`
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
            await cell.scrollIntoViewIfNeeded()
            await cell.click()
            await page.keyboard.press(`Shift+${key}`)
            await page.waitForLoadState('networkidle')
            await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 6_000 }).catch(() => {})
            const inpMode = (await page.locator('button[title^="点数/コード 入力モード切替"]').innerText()).trim()
            await dumpSnapshot(page, name, { inpMode, panel: await readPanel(page), dialogs: await readDialogs(page) })
        })
    }

    // ── A6 nút dưới lưới ─────────────────────────────────────────────────────
    for (const [name, label] of [
        ['btn-jikangai', '時間外(&J)'],
        ['btn-kyuujitu', '休日(&K)'],
        ['btn-sinya', '深夜(&S)'],
        ['btn-sikan', '歯管'],
        ['btn-sidou', '指導文書'],
        ['btn-hokan', '補管・義歯'],
        ['btn-receipt', 'レセプト'],
        ['btn-hotetu', '補管(&H)'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
            await cell.scrollIntoViewIfNeeded()
            await cell.click()
            await page.getByRole('button', { name: label, exact: true }).click()
            // Hộp thoại (歯科疾患管理…) mở SAU khi tải dữ liệu — networkidle chưa đủ. Không mở
            // thì thôi (時間外/休日/深夜 chỉ chèn dòng).
            await page
                .getByRole('dialog')
                .first()
                .waitFor({ timeout: 10_000 })
                .catch(() => {})
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    // ── A6 履歴 ───────────────────────────────────────────────────────────────
    for (const [name, item] of [
        ['hist-last', '前回来院月'],
        ['hist3-month', '過去３ヶ月'],
        ['hist-all', 'すべて表示'],
        ['hist6-month', '過去６ヶ月'],
        ['hist1-year', '過去１年'],
        ['hist-select', '日付を指定'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            await openHistoryMenu(page, '履歴を表示', item)
            await dumpSnapshot(page, name, { history: await readHistory(page), dialogs: await readDialogs(page) })
        })
    }

    // ── A7 menu F11 (mở màn / hộp thoại, KHÔNG lưu) ──────────────────────────
    for (const [name, path] of [
        ['f11-karte', ['4 カルテ']],
        ['f11-pat', ['5 患者登録']],
        ['f11-exa', ['6 口腔内情報']],
        ['f11-pat-info', ['8 患者登録(患者選択)']],
        ['f11-opt-chk-prm', ['9 オプション', '1 チェック項目設定']],
        ['f11-opt-inp-opt', ['9 オプション', '2 処置入力設定']],
        ['f11-opt-restrict-dis', ['9 オプション', '3 必要病名登録']],
        ['f11-opt-chk-auto', ['9 オプション', '4 自動算定登録']],
        ['f11-opt-auto', ['9 オプション', '5 処置自動入力登録']],
        ['f11-opt-auto-cmt', ['9 オプション', '6 コメント自動入力登録']],
        ['f11-opt-chk-rule', ['9 オプション', '8 チェックルール登録']],
        ['f11-opt-step', ['9 オプション', 'Step']],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            await f11Menu(page, ...path)
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    // ── A1/A6 bổ sung: ガイド 全て表示, nút M / P / I / T ─────────────────────
    test('case:guide-all', async ({ authedPage: page }) => {
        await openInp(page)
        await openPanelTab(page, 'ガイド')
        await page.getByRole('button', { name: '全て表示', exact: true }).click()
        await page.waitForLoadState('networkidle')
        await dumpSnapshot(page, 'guide-all', { panel: await readPanel(page), dialogs: await readDialogs(page) })
    })

    for (const [name, label] of [
        ['img-m', 'M'],
        ['img-p', 'P'],
        ['img-i', 'I'],
        ['img-t', 'T'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            await page.getByRole('button', { name: label, exact: true }).click()
            await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 8_000 }).catch(() => {})
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    // ── A2 sửa ô của dòng có sẵn ─────────────────────────────────────────────
    // Như `EditCell` vế WinForm: ô <col> của dòng CUỐI có chữ đó → nhập → Enter. Cột: 0 日 / 3 点 / 4 回.
    for (const [name, ryo, col, typed] of [
        ['edit-kai', '歯科疾患管理料', 4, '2'],
        ['edit-ten', '歯科疾患管理料', 3, '100'],
        ['edit-day', '歯科再診料', 0, '27'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            const ryoCell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: ryo }).last()
            await ryoCell.scrollIntoViewIfNeeded()
            const rowKey = ((await ryoCell.getAttribute('data-grid-cell')) ?? '').replace(/\|2$/, '')
            const cell = page.locator(`[data-grid-cell="${rowKey}|${col}"]`)
            await cell.dblclick()
            const input = page.locator('input:focus')
            await input.fill(typed)
            await input.press('Enter')
            await page.waitForLoadState('networkidle')
            await page.getByRole('dialog').or(page.getByRole('alertdialog')).first().waitFor({ timeout: 3_000 }).catch(() => {})
            await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
        })
    }

    // ── A3 menu chuột phải: コピー / 貼り付け ─────────────────────────────────
    // Chuột phải vào dòng ⇒ chụp các mục menu (chữ bỏ số mnemonic + bấm được không) — không bấm.
    for (const [name, ryo] of [
        ['row-menu-trt', '歯科疾患管理料'],
        ['row-menu-bui', 'ＭＴ（Ｂｒ）'],
        ['row-menu-nikkei', '日計'],
    ] as const) {
        test(`case:${name}`, async ({ authedPage: page }) => {
            await openInp(page)
            const target =
                ryo === '日計'
                    ? page.getByText(/^【負担金.*【日計.*】$/).last()
                    : page.locator('[data-grid-cell$="|2"]').filter({ hasText: ryo }).last()
            await target.scrollIntoViewIfNeeded()
            await target.click()
            await target.click({ button: 'right' })
            const menu = page.getByRole('menu').last()
            // Dòng 日計 có thể KHÔNG bung menu — khi đó ghi danh sách rỗng để so với WinForm.
            const shown = await menu.waitFor({ timeout: 5_000 }).then(() => true, () => false)
            const items = shown
                ? await menu.evaluate((m) =>
                      Array.from(m.querySelectorAll('button')).map((b) => ({
                          text: b.innerText.trim(),
                          enabled: !(b as HTMLButtonElement).disabled,
                      })),
                  )
                : []
            await dumpSnapshot(page, name, { menu: items })
        })
    }

    test('case:hist-hide', async ({ authedPage: page }) => {
        await openInp(page)
        await openHistoryMenu(page, '履歴を表示', '前回来院月')
        await openHistoryMenu(page, '履歴を隠す')
        await dumpSnapshot(page, 'hist-hide', { history: await readHistory(page), dialogs: await readDialogs(page) })
    })

    test('case:fkey-f10', async ({ authedPage: page }) => {
        await openInp(page)
        const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科疾患管理料' }).last()
        await cell.click()
        await page.keyboard.press('F10')
        await page.waitForURL((u) => !u.pathname.includes('/3948'), { timeout: 15_000 }).catch(() => {})
        await page.waitForLoadState('networkidle')
        await dumpSnapshot(page, 'fkey-f10', { dialogs: await readDialogs(page) })
    })

    // ── A2 部位選択 → 病名選択 ────────────────────────────────────────────────
    for (const name of ['bui-to-disease', 'bui-commit'] as const)
    test(`case:${name}`, async ({ authedPage: page }) => {
        await openInp(page)
        const bui = page.locator('[data-grid-cell$=":footer-bui|1"]').last()
        await bui.scrollIntoViewIfNeeded()
        await bui.click()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 15_000 })
        // Như vế WinForm: Delete (xoá hết) → → (vùng 左上) → 1 → End (確定).
        for (const k of ['Delete', 'ArrowRight', 'Digit1', 'End']) {
            await page.keyboard.press(k)
            await page.waitForTimeout(150)
        }
        await page.waitForLoadState('networkidle')
        await page.getByRole('dialog').first().waitFor({ timeout: 8_000 }).catch(() => {})
        if (name === 'bui-commit') {
            // 病名選択: 選択番号 1 (Ｃ) → Enter ⇒ danh sách 枝番 → 1 → Enter ⇒ chèn 部位病名行.
            // Gõ thẳng như WinForm — ô 選択番号 phải tự bôi đen (P-015).
            for (let i = 0; i < 2; i++) {
                await page.keyboard.type('1')
                await page.keyboard.press('Enter')
                await page.waitForTimeout(800)
            }
            // 病名 ghép dần ở ô trên cùng; End = 登録 mới chốt (như WinForm).
            await page.keyboard.press('End')
            await page.waitForLoadState('networkidle')
            await page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => {})
        }
        await dumpSnapshot(page, name, { dialogs: await readDialogs(page) })
    })

    // ── B: thao tác GHI DB — CHỈ chạy trên bệnh nhân nhân bản (tools/parity-snapshot/clone-patient.sh) ──

    /** Nhập 110-0 歯科再診料 vào dòng 日計 (giống case:code-entry-commit). */
    async function enterCode110(page: import('@playwright/test').Page) {
        await ensureMode(page, 'コード')
        await typeIntoFooterTen(page, '110')
        const picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        const sb = picker.getByTestId('cell-trtSb')
        await expect(sb.first()).toBeVisible({ timeout: 20_000 })
        const idx = (await sb.allTextContents()).findIndex((t) => Number(t.trim()) === 0)
        await picker.getByTestId('cell-trtNm').nth(idx).click()
        await picker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(picker).toBeHidden({ timeout: 15_000 })
        await expect(page.locator('input:focus')).toHaveValue('1', { timeout: 15_000 })
        await page.keyboard.press('Enter')
        await page.waitForLoadState('networkidle')
        // 「１日２度来院」 tới sau một chuỗi request vài giây — lưu trước đó là lưu thiếu dòng.
        await page.getByText(/[1１]日[2２]度来院/).first().waitFor({ timeout: 10_000 }).catch(() => {})
    }

    /** F9 登録 → はい → rời màn → mở lại → chụp lưới SAU khi nạp lại từ DB. */
    async function saveAndReopen(page: import('@playwright/test').Page, name: string) {
        // Cùng luật fla-ui: cảnh báo chỉ có OK chặn F9 ⇒ bấm OK và ghi lại chữ.
        const preSaveAlerts: string[] = []
        for (let i = 0; i < 5; i++) {
            const alert = page.getByRole('alertdialog').filter({ has: page.getByRole('button', { name: 'OK', exact: true }) })
            if (!(await alert.first().isVisible().catch(() => false))) break
            const raw = await alert.first().innerText().catch(() => '')
            preSaveAlerts.push(
                raw.split('\n').map((l) => l.trim()).filter((l) => l && l !== 'お茶コン' && l !== 'OK').join(''),
            )
            await alert.first().getByRole('button', { name: 'OK', exact: true }).click()
            await page.waitForTimeout(800)
        }
        await page.keyboard.press('F9')
        const box = page.locator('[role="dialog"],[role="alertdialog"]').filter({ hasText: '保存しますか' })
        await expect(box).toBeVisible({ timeout: 15_000 })
        const saveQuestion = (await box.getByText(/保存しますか/).first().innerText()).trim()
        await box.getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await expect(page).not.toHaveURL(/\/treatments\/\d+/, { timeout: 30_000 })
        await openInp(page)
        await dumpSnapshot(page, name, { saveQuestion, preSaveAlerts })
    }

    test.describe('B ghi DB', () => {
        test.skip(Number(PAT_NO) < 990000, 'Phase B ghi DB — chỉ chạy với bệnh nhân nhân bản (>= 990000)')

        test('case:save-no-change', async ({ authedPage: page }) => {
            await openInp(page)
            await saveAndReopen(page, 'save-no-change')
        })

        test('case:save-code-entry', async ({ authedPage: page }) => {
            await openInp(page)
            await enterCode110(page)
            await saveAndReopen(page, 'save-code-entry')
        })

        test('case:save-date-change', async ({ authedPage: page }) => {
            await openInp(page)
            const ryoCell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科再診料' }).last()
            await ryoCell.scrollIntoViewIfNeeded()
            const rowKey = ((await ryoCell.getAttribute('data-grid-cell')) ?? '').replace(/\|2$/, '')
            const dayCell = page.locator(`[data-grid-cell="${rowKey}|0"]`)
            await dayCell.click()
            await dayCell.click({ button: 'right' })
            // WinForm bung menu 「日付変更」 trước; web có thể mở thẳng hộp — bấm mục menu nếu có.
            const item = page.getByRole('menuitem', { name: '日付変更' }).or(page.getByRole('button', { name: '日付変更', exact: true }))
            if (await item.first().isVisible().catch(() => false)) await item.first().click()
            const dlg = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '日付変更' }) })
            await expect(dlg).toBeVisible({ timeout: 10_000 })
            await dlg.locator('#date-change-day').fill('27')
            await dlg.getByRole('button', { name: /F9\s*確定/ }).click()
            const q = page.locator('[role="dialog"],[role="alertdialog"]').filter({ hasText: '一括変更' })
            await q.getByRole('button', { name: /^(はい|Yes)$/ }).click()
            await page.waitForLoadState('networkidle')
            await saveAndReopen(page, 'save-date-change')
        })

        test('case:save-tenki', async ({ authedPage: page }) => {
            await openInp(page)
            await f11Menu(page, '7 転帰', '1 治癒')
            await dumpSnapshot(page, 'save-tenki', { dialogs: await readDialogs(page) })
        })

        test('case:save-acc-data', async ({ authedPage: page }) => {
            await openInp(page)
            // Dòng 処置 CUỐI của lưới (ngày test = ngày điều trị cuối tháng) — cùng luật fla-ui.
            const cell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: /\S/ }).last()
            await cell.scrollIntoViewIfNeeded()
            await cell.click()
            await page.keyboard.press('F11')
            await page.getByRole('button', { name: '3 会計データ作成', exact: true }).last().click()
            // Cùng luật với fla-ui UnpaidCreationFlow.RuleFor — cụ thể trước, chung sau.
            const accTrail: { text: string; answered: string }[] = []
            for (let i = 0; i < 8; i++) {
                const box = page.locator('[role="dialog"],[role="alertdialog"]').last()
                const shown = await box.waitFor({ timeout: i === 0 ? 30_000 : 6_000 }).then(() => true, () => false)
                if (!shown) break
                const text = (await box.innerText()).replace(/\s+/g, '')
                const click = async (re: RegExp) => {
                    const b = box.getByRole('button', { name: re }).first()
                    await b.click()
                    return (await b.innerText().catch(() => '')).replace(/\s+/g, '')
                }
                let answered: string
                if (/計上しますか/.test(text)) { answered = await click(/^(いいえ|No|キャンセル|Cancel)$/); accTrail.push({ text, answered }); break }
                else if (/入金指定額/.test(text)) answered = await click(/指定なし|登録|OK/)
                else if (/未清算データ|未精算データ/.test(text)) answered = await click(/^(はい|Yes)$/)
                else if (/保存しますか/.test(text)) answered = await click(/^(いいえ|No)$/)
                else if (/本日でありません|続けますか/.test(text)) answered = await click(/^(OK|はい|Yes)$/)
                else answered = await click(/^(いいえ|No|キャンセル|Cancel|OK)$/)
                accTrail.push({ text, answered })
                await page.waitForTimeout(800)
            }
            await page.waitForLoadState('networkidle')
            await dumpSnapshot(page, 'save-acc-data', { accTrail })
        })

        test('case:save-edit-day', async ({ authedPage: page }) => {
            await openInp(page)
            const ryoCell = page.locator('[data-grid-cell$="|2"]').filter({ hasText: '歯科再診料' }).last()
            await ryoCell.scrollIntoViewIfNeeded()
            const rowKey = ((await ryoCell.getAttribute('data-grid-cell')) ?? '').replace(/\|2$/, '')
            await page.locator(`[data-grid-cell="${rowKey}|0"]`).dblclick()
            const input = page.locator('input:focus')
            await input.fill('27')
            await input.press('Enter')
            await page.waitForLoadState('networkidle')
            await saveAndReopen(page, 'save-edit-day')
        })
    })
})
