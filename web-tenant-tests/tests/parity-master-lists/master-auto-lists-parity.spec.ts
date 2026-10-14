import { type Locator, type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

/**
 * Parity WinForm ↔ web, nhóm A: ba màn 一覧 master (必要病名 frm203036 / 自動算定 frm203038 /
 * 処置自動入力 frm203040), ba dialog 登録 (frm203037 / 203039 / 203041) và 日付変更 (frm203051).
 *
 * Mỗi giá trị kỳ vọng là kết quả ĐO trên WinForm thật (FlaUI, `Tests/MasterAutoLists`):
 *   - 一覧: focus lúc mở ở lưới; Tab xoay vòng trong màn (không thoát ra 診療入力);
 *     検索 ra 0 dòng và F9 trên lưới rỗng đều báo E00003; ESC / End không làm gì.
 *   - 登録: focus vào ô nhập đầu và BÔI ĐEN nội dung; ESC và End = F9 (hỏi Q00002);
 *     mọi hộp xác nhận là OK / キャンセル.
 *   - 日付変更: chuột phải ô 日 hiện menu một mục trước; ô giữ focus + bôi đen; E00001 /
 *     E00002 (không kẹp số); ESC và End = 確定 (Q00100 はい/いいえ); Enter chuyển focus sang F9.
 *
 * KHÔNG ghi DB: mọi F9 / Esc / End / F8 dừng ở hộp xác nhận rồi huỷ. Bệnh nhân test tự dựng
 * (dải 990000+) chỉ dùng cho 日付変更, xoá hẳn ở afterAll.
 */

const PAT_NO = SEED_PAT_NO_BASE + 710
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const GRID_LOAD_TIMEOUT = 60_000
/** Mã 処置 không có trong master đang áp dụng — để 検索 ra 0 dòng. */
const ABSENT_TRT_CD = '106'
const E00003 = '該当データがありません。'
const MENU_OPTIONS = '9 オプション'

type Stop = 'grid' | 'cd' | 'nm' | 'search' | 'F1' | 'F9' | 'F10'

interface ListDef {
    tag: string
    menuLabel: string
    heading: RegExp
    registerTitle: RegExp
    /** Thứ tự Tab trên WinForm, bắt đầu từ lưới (focus lúc mở). */
    tabOrder: Stop[]
    hasF1Csv: boolean
    /** Ô bôi đen khi mở dialog 登録 (nhãn aria + giá trị); null = ô đầu trống nên không có gì để bôi. */
    registerFocus: { label: string; selected: string | null }
}

const LISTS: ListDef[] = [
    {
        tag: '必要病名',
        menuLabel: '3 必要病名登録',
        heading: /必\s*要\s*病\s*名\s*一\s*覧/,
        registerTitle: /必\s*要\s*病\s*名\s*登\s*録/,
        tabOrder: ['grid', 'F1', 'F9', 'F10', 'cd', 'nm'],
        hasF1Csv: true,
        registerFocus: { label: '病名コード 1', selected: null },
    },
    {
        tag: '自動算定',
        menuLabel: '4 自動算定登録',
        heading: /自\s*動\s*算\s*定\s*一\s*覧/,
        registerTitle: /自\s*動\s*算\s*定\s*登\s*録/,
        tabOrder: ['grid', 'cd', 'nm', 'search', 'F9', 'F10'],
        hasF1Csv: false,
        registerFocus: { label: '算定処置コード 1', selected: '108' },
    },
    {
        tag: '処置自動入力',
        menuLabel: '5 処置自動入力登録',
        heading: /処\s*置\s*自\s*動\s*入\s*力\s*一\s*覧/,
        registerTitle: /処\s*置\s*自\s*動\s*入\s*力\s*登\s*録/,
        tabOrder: ['grid', 'cd', 'nm', 'search', 'F1', 'F9', 'F10'],
        hasF1Csv: false,
        registerFocus: { label: '順序', selected: '0' },
    },
]

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test cho 日付変更')

test.describe.configure({ mode: 'serial', timeout: 600_000 })

test.describe('Parity nhóm A — 一覧 master × 3, 登録 × 3, 日付変更', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined

    const rowMenu = () => page.getByRole('menu').filter({ hasText: '1 メニュー' })
    const listScreen = (title: RegExp) =>
        page.locator('div.fixed.inset-y-0.z-50').filter({ has: page.getByRole('heading', { name: title }) })
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
        const karte = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        for (let i = 0; i < 5; i++) {
            if (!(await appeared(karte.first(), 1_500))) break
            await karte.first().getByRole('button', { name: /F10\s*戻る/ }).first().click().catch(() => {})
        }
    }

    async function openEntry() {
        // The entry screen occasionally renders blank on a cold navigation inside a long chain: retry once.
        for (let attempt = 0; ; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY}`, { waitUntil: 'domcontentloaded' })
            const loaded = await page
                .getByText('合計:')
                .first()
                .waitFor({ state: 'visible', timeout: GRID_LOAD_TIMEOUT })
                .then(() => true, () => false)
            if (loaded) break
            if (attempt >= 1) throw new Error('診療入力 grid did not load')
        }
        await drain()
    }

    async function openList(def: ListDef): Promise<Locator> {
        const list = listScreen(def.heading)
        await drain()
        const f11 = page.locator('[data-fkey="F11"]')
        await expect(f11).toBeVisible({ timeout: 30_000 })
        for (let i = 0; i < 3; i++) {
            await f11.click()
            if (await rowMenu().isVisible({ timeout: 8_000 }).catch(() => false)) break
        }
        await rowMenu().getByRole('button', { name: MENU_OPTIONS }).hover()
        const sub = page.locator('[data-sub="options"] [data-submenu]')
        await expect(sub).toBeVisible({ timeout: 10_000 })
        await sub.getByRole('button', { name: def.menuLabel, exact: true }).click()
        await expect(list, `màn ${def.tag} không mở`).toBeVisible({ timeout: 30_000 })
        await expect(list.locator('[data-testid^="row-"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        return list
    }

    /** Đọc hộp thoại hiện tại: chữ + nhãn nút; bấm `click` (nút thật, theo tên) để đóng. */
    async function takeBox(click: RegExp): Promise<{ text: string; buttons: string[] }> {
        await expect(box()).toBeVisible({ timeout: 10_000 })
        const text = (await box().innerText()).replace(/\s+/g, ' ')
        const buttons = (await box().getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean)
        await box().getByRole('button', { name: click }).first().click()
        await expect(box()).toBeHidden({ timeout: 10_000 })
        return { text, buttons }
    }

    /** Điểm dừng Tab hiện tại, cùng tên với `Stop`. */
    async function stop(list: Locator): Promise<Stop | string> {
        const handle = await list.elementHandle()
        return page.evaluate((root) => {
            const a = document.activeElement as HTMLElement | null
            if (!a || !root) return '(none)'
            if (!root.contains(a)) return '(outside)'
            const fk = a.closest('[data-fkey]')?.getAttribute('data-fkey')
            if (fk) return fk
            const inputs = Array.from(root.querySelectorAll('input'))
            if (a === inputs[0]) return 'cd'
            if (a === inputs[1]) return 'nm'
            if (a.tagName === 'BUTTON' && (a.textContent ?? '').trim() === '検索') return 'search'
            return 'grid'
        }, handle)
    }

    async function selectedText(): Promise<string> {
        return page.evaluate(() => {
            const a = document.activeElement as HTMLInputElement | null
            if (!a || typeof a.selectionStart !== 'number') return ''
            return (a.value ?? '').slice(a.selectionStart ?? 0, a.selectionEnd ?? 0)
        })
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
        // Hai dòng cùng ngày hôm nay: có dòng để 日付変更.
        await seedTreatmentRows(PAT_NO, TODAY, [
            { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' },
            { trtCd: 108, trtSb: 9, trtPt: 2, trtCnt: 1, dspTrt: '外安全１(再診)' },
        ])
        page = authedPage
        // An unaccepted beforeunload dialog makes page.goto hang silently.
        page.on('dialog', (d) => void d.accept().catch(() => {}))
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        await openEntry()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await dropTestPatient(PAT_NO).catch(() => {})
    })

    for (const def of LISTS) {
        test.describe(def.tag, () => {
            test(`TC-${def.tag}-TAB — focus lúc mở ở lưới, Tab xoay vòng đúng thứ tự WinForm và không thoát màn`, async () => {
                const list = await openList(def)
                await expect.poll(() => stop(list), { message: 'focus lúc mở phải ở lưới' }).toBe('grid')
                const seen: string[] = ['grid']
                for (let i = 1; i < def.tabOrder.length; i++) {
                    await page.keyboard.press('Tab')
                    seen.push(await stop(list))
                }
                expect(seen).toEqual(def.tabOrder)
                // Vòng thứ hai quay về lưới thay vì rơi ra nút "Dr:" của 診療入力 phía sau.
                await page.keyboard.press('Tab')
                expect(await stop(list)).toBe('grid')
                // Shift+Tab đi ngược: từ lưới tới điểm dừng cuối.
                await page.keyboard.press('Shift+Tab')
                expect(await stop(list)).toBe(def.tabOrder[def.tabOrder.length - 1])
            })

            test(`TC-${def.tag}-EMPTY — 検索 ra 0 dòng và F9 trên lưới rỗng đều báo E00003 (OK)`, async () => {
                const list = listScreen(def.heading)
                await list.locator('input').first().fill(ABSENT_TRT_CD)
                await list.getByRole('button', { name: '検索', exact: true }).click()
                const search = await takeBox(/^OK$/)
                expect(search.text).toContain(E00003)
                await expect(list.getByText(/該当件数/).first()).toContainText('0')
                await list.getByRole('button', { name: /F9\s*選択/ }).click()
                const f9 = await takeBox(/^OK$/)
                expect(f9.text).toContain(E00003)
            })

            test(`TC-${def.tag}-KEYS — ESC / End trên 一覧 không làm gì`, async () => {
                const list = listScreen(def.heading)
                await list.locator('input').first().fill('')
                await list.getByRole('button', { name: '検索', exact: true }).click()
                await expect(list.locator('[data-testid^="row-"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
                for (const key of ['Escape', 'End']) {
                    await list.locator('[data-testid^="row-"]').first().click()
                    await page.keyboard.press(key)
                    await page.waitForTimeout(800)
                    await expect(list).toBeVisible()
                    await expect(box()).toBeHidden()
                    await expect(page.getByRole('dialog').filter({ hasText: def.registerTitle })).toBeHidden()
                }
            })

            if (def.hasF1Csv) {
                test(`TC-${def.tag}-CSV — F1 出力 hỏi Q00047 với OK / キャンセル`, async () => {
                    const list = listScreen(def.heading)
                    await list.getByRole('button', { name: /F1\s*出力/ }).click()
                    const q = await takeBox(/^キャンセル$/)
                    expect(q.text).toContain('CSV出力してよろしいですか？')
                    expect(q.buttons).toEqual(['OK', 'キャンセル'])
                })
            }

            test(`TC-${def.tag}-REG — 登録: focus + bôi đen ô đầu; F9 / ESC / End = 更新 (OK/キャンセル); F8 = 削除`, async () => {
                const list = listScreen(def.heading)
                // 100-0 初診 (có 算定処置 108-7 ở 自動算定): lưới ảo có thể đang cuộn nên lọc cho chắc.
                await list.locator('input').first().fill('100')
                await list.getByRole('button', { name: '検索', exact: true }).click()
                await expect(list.locator('[data-testid^="row-100-"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
                await list.locator('[data-testid^="row-100-"]').first().click()
                await list.getByRole('button', { name: /F9\s*選択/ }).click()
                const register = page.getByRole('dialog').filter({ hasText: def.registerTitle })
                await expect(register).toBeVisible({ timeout: 30_000 })

                // Dữ liệu tải bất đồng bộ nên focus có thể đến sau một nhịp.
                await expect
                    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''), { timeout: 10_000 })
                    .toBe(def.registerFocus.label)
                if (def.registerFocus.selected !== null) {
                    await expect.poll(selectedText, { timeout: 5_000 }).toBe(def.registerFocus.selected)
                }

                for (const key of ['F9', 'Escape', 'End']) {
                    await page.keyboard.press(key)
                    const q = await takeBox(/^キャンセル$/)
                    expect(q.text, `${key}`).toContain('更新してよろしいですか？')
                    expect(q.buttons, `${key}`).toEqual(['OK', 'キャンセル'])
                    await expect(register).toBeVisible()
                }
                // 処置自動入力: F8 tắt khi thêm mới (không có dòng đã đăng ký) — chỉ kiểm hai màn còn lại.
                if (def.tag !== '処置自動入力') {
                    await page.keyboard.press('F8')
                    const q = await takeBox(/^キャンセル$/)
                    expect(q.text).toContain('削除してよろしいですか？')
                    expect(q.buttons).toEqual(['OK', 'キャンセル'])
                }
                await register.getByRole('button', { name: /F10\s*戻る/ }).click()
                await expect(register).toBeHidden({ timeout: 10_000 })
                await list.getByRole('button', { name: /F10\s*戻る/ }).click()
                await expect(list).toBeHidden({ timeout: 15_000 })
                // Mỗi màn bắt đầu từ một trang 診療入力 mới (F11 sau khi đóng 一覧 không ổn định).
                await openEntry()
            })
        })
    }

    test.describe('日付変更', () => {
        let dlg: Locator
        let input: Locator
        let dayCell: Locator

        const confirm = () => dlg.getByRole('button', { name: /F9\s*確定/ })

        test('TC-DATECHG-OPEN — chuột phải ô 日 hiện menu 日付変更; dialog: nhãn WinForm, ô giữ ngày gốc, focus + bôi đen', async () => {
            await openEntry()
            const keys = await page.locator('[data-grid-cell$="|0"]').evaluateAll((els) =>
                els.map((e) => ({ key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|\d+$/, ''), text: (e.textContent ?? '').trim() })),
            )
            const cur = keys.find((k) => !/^\d+-\d+$/.test(k.key) && !k.key.includes(':') && k.text !== '')
            expect(cur, 'cần một dòng tháng hiện tại có 日').toBeTruthy()
            dayCell = page.locator(`[data-grid-cell="${cur!.key}|0"]`)
            await dayCell.click()
            await dayCell.click({ button: 'right' })

            const menu = page.getByRole('menu').first()
            await expect(menu).toBeVisible({ timeout: 5_000 })
            await expect(menu.getByRole('button')).toHaveText(['日付変更'])
            // Dialog CHƯA mở cho tới khi chọn mục menu.
            dlg = page.getByRole('dialog').filter({ hasText: '日付変更' })
            await expect(dlg).toBeHidden()
            await menu.getByRole('button', { name: '日付変更' }).click()
            await expect(dlg).toBeVisible({ timeout: 8_000 })

            input = dlg.locator('input').first()
            await expect(dlg).toContainText(`${cur!.text} 日の処置データの日付を一括変更します。`)
            await expect(dlg).toContainText('新しい日付:')
            await expect(dlg.getByRole('button', { name: /F9\s*確定/ })).toBeVisible()
            await expect(dlg.getByRole('button', { name: /F10\s*戻る/ })).toBeVisible()
            await expect(input).toHaveValue(cur!.text) // cải tiến có chủ ý: điền sẵn ngày gốc
            await expect(input).toBeFocused()
            expect(await selectedText()).toBe(cur!.text)
            await expect(input).toHaveAttribute('maxlength', '2')
        })

        test('TC-DATECHG-VALID — trống → E00001; ngày không tồn tại (0, 99) → E00002 và không bị kẹp số', async () => {
            await input.fill('')
            await confirm().click()
            expect((await takeBox(/^OK$/)).text).toContain('新しい日付が入力されていません。')
            for (const bad of ['0', '99']) {
                await input.fill(bad)
                await expect(input).toHaveValue(bad)
                await confirm().click()
                expect((await takeBox(/^OK$/)).text, bad).toContain('新しい日付が間違っています。')
            }
            await expect(dlg).toBeVisible()
        })

        test('TC-DATECHG-KEYS — F9 / ESC / End = 確定 (Q00100 はい/いいえ, dialog không đóng); Enter chuyển focus sang F9', async () => {
            const orig = (await dayCell.innerText()).trim()
            for (const key of ['F9', 'Escape', 'End']) {
                await input.fill('27')
                await input.focus()
                await page.keyboard.press(key)
                const q = await takeBox(/^いいえ$/)
                expect(q.text, key).toContain(`${orig}日の処置データを 27日に一括変更します。よろしいですか？`)
                expect(q.buttons, key).toEqual(['はい', 'いいえ'])
                await expect(dlg, key).toBeVisible()
            }
            await input.fill('12345')
            await expect(input).toHaveValue('12')
            await input.press('Enter')
            await expect(box()).toBeHidden()
            await expect(dlg.getByRole('button', { name: /F9\s*確定/ })).toBeFocused()
            await dlg.getByRole('button', { name: /F10\s*戻る/ }).click()
            await expect(dlg).toBeHidden({ timeout: 10_000 })
        })
    })
})
