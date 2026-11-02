import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient } from '../_shared/db'
import { MSG } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

import { type AdminApi, type CodeType, OWN_CODE, openAdminApi } from './_mst-code-admin'

/**
 * コード設定 (/masters/code) — màn tenant sửa mã dùng chung (master.mst_code) bằng bản ghi đè
 * (mst_code_override), thêm/ẩn mã riêng, và việc sửa đó lan xuống combo của màn khác.
 * Nhánh feature/mst-cod-shared-override (merge dev ccf611752); quyền theo từng loại thay cho 3 mức
 * tuỳ biến từ BE 7564a9ebc (2026-10-27).
 *
 * FACT bám theo source (Rule 21) — apps/web-tenant/src/features/mst-code-settings/:
 *  - routes/_authenticated/masters_.code.tsx: URL /masters/code, mở từ マスタ登録メニュー nút
 *    「コード設定」 (adminOnly). F10 戻る → /masters.
 *  - components/mst-code-settings-screen.tsx
 *      · heading 'コ ー ド 設 定'; <select> グループ (focus lúc mở); tab 全データ / 変更のみ.
 *      · Nhóm không bật quyền nào: dải 「このグループはシステムで管理されています」; còn lại
 *        「変更可: <名称・順・非表示・追加 đã bật>」 (+「 (独自コード 30000～32767)」 khi bật 追加).
 *      · Footer 「選択中: <cdType>-<cdVal> <名称1>」; ô bị ghi đè hiện 「<giá trị chung> → <giá trị tenant>」;
 *        dòng ẩn 「非表示（令和yy年mm月dd日〜）」 (formatWarekiFieldDate).
 *      · F5 元に戻す hỏi locales ja.confirmReset; F5 削除 (mã riêng) hỏi Q00003.
 *  - lib/mst-code-fkeys.ts — phím theo quyền đã bật (enabled) của nhóm:
 *      F1 追加 chỉ khi add; F3 非表示/表示 khi hide hoặc add; F5 LUÔN có (mờ khi dòng chưa đổi gì);
 *      F9 選択 khi rename/reorder/add; F6 基準日 + F10 戻る luôn có.
 *  - components/mst-code-edit-dialog.tsx (DraggableDialog 'コード編集' / '独自コード追加')
 *      · Mã chung: chỉ 名称1 / 名称2 (rename) và 順 (reorder), mỗi ô có 「<trường> 上書き」; NGÀY là của admin,
 *        không hiện. Mã riêng: đủ 5 trường, 開始日/終了日 là WarekiDateField.
 *      · 追加: focus ô コード, gợi ý 「独自コード 30000～32767」; mã ngoài dải ⇒ E00029 「入力範囲が間違っています。
 *        30000～32767で入力して下さい。」.
 *      · F9 登録: lỗi client trước (E00001 …), rồi Q00001 (thêm) / Q00002 (sửa); lỗi BE hiện chữ Nhật
 *        (locales errors: DUPLICATE ⇒ E00008, INVALID_PERIOD ⇒ E00023), dialog vẫn mở.
 *  - components/mst-code-as-of-dialog.tsx (F6): 「基準日で確認（cdType tên）」, 基準日 là WarekiDateField,
 *    chỉ liệt kê mã hiệu lực ngày đó.
 *
 * DỮ LIỆU:
 *   nhóm 30 ユーザ区分 (0 ドクター / 1 衛生士 / 2 スタッフ) — trần chỉ cho 名称/順 ⇒ ca 「không bật gì」 và
 *     「名称・順」, lan xuống combo 区分 của ユーザマスタ.
 *   nhóm 9 職業 (1 会社員 … 10 その他, không có mã 0) — trần cho cả bốn ⇒ ca 追加 / 非表示 / mã riêng 30950,
 *     lan xuống combo 職業 của 患者登録 (bệnh nhân seed 990743, xoá ở afterAll).
 *   afterAll trả quyền gốc hai nhóm + xoá mọi override của tenant trên hai nhóm (kể cả khi test giữa chừng đỏ).
 *   Bỏ hai ca cũ: TC-15 (user lưu 区分 đã ẩn — nhóm 30 không còn ẩn được) và phần 「combo không lọc kỳ」 của
 *   TC-17 (giờ combo dùng codesOn theo ngày, không còn là hành vi spec chốt).
 *
 * GHI: đổi master.mst_code_type (dùng chung MỌI tenant, chỉ trong lúc chạy) và mst_code_override của
 * tenant đang test ⇒ chỉ chạy khi TEST_ALLOW_SAVE=1. Cần TEST_DB=1 (tra tenant id, seed bệnh nhân).
 *
 * Chạy cả file (serial, chung page — Rule 19; KHÔNG chạy lẻ một test ở giữa):
 *   npx playwright test tests/mst-code/tenant-code-settings.spec.ts
 * Login: 1 (authedPage của worker) + 1 (admin API).
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec đổi quyền nhóm mã và ghi override')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id')

const KBN = 30
const KBN_LABEL = '30 ユーザ区分'
const JOB = 9
const JOB_LABEL = '9 職業'
const CUSTOM_CD = OWN_CODE.min + 950
const RANGE_TEXT = `${OWN_CODE.min}～${OWN_CODE.max}`
const RENAMED = 'E2E衛生士'
const CUSTOM_NAME = 'E2E独自職業'
const PAT = SEED_PAT_NO_BASE + 743

const T = {
    heading: 'コ ー ド 設 定',
    lockedNotice: 'このグループはシステムで管理されています',
    captionRename: '変更可: 名称・順',
    captionFull: `変更可: 名称・順・非表示・追加 (独自コード ${RANGE_TEXT})`,
    hint: 'ダブルクリックで選択',
    editTitle: 'コード編集',
    addTitle: '独自コード追加',
    confirmReset:
        '共通マスタの内容に戻します。過去の記録も含め、このコードを使っているすべての記録が共通の名称で表示されます。よろしいですか？',
    // E00029 / E00008 / E00023 — nguyên văn shared/locales/ja-msgtbl.ts (chưa có hàm trong _shared/msgtbl).
    outOfRange: `入力範囲が間違っています。${RANGE_TEXT}で入力して下さい。`,
    duplicate: 'コードは既に登録されています。',
    invalidPeriod: '有効終了日が有効開始日より過去日付です。',
    statusOverridden: '変更済み',
    statusCustom: '独自コード',
    statusShared: '共通',
    asOfTitle: '基準日で確認',
    hiddenSince: /非表示（令和\d{2}年\d{2}月\d{2}日〜）/,
    // Q00001 — nguyên văn shared/locales/ja-msgtbl.ts.
    q00001: '登録してよろしいですか？',
}

test.describe('コード設定 — quyền theo nhóm: 30 ユーザ区分 (名称・順) và 9 職業 (đủ bốn quyền)', () => {
    let page: Page
    let step: () => Promise<void>
    let admin: AdminApi
    const originals = new Map<number, CodeType>()

    const root = () => page.locator('.animate-fade-in').first()
    const fkey = (n: number): Locator => root().locator(`[data-fkey="F${n}"]`)
    const row = (cdVal: number): Locator => root().locator(`[data-testid="row-${cdVal}"]`)
    const editDialog = (): Locator =>
        page.getByRole('dialog').filter({ hasText: new RegExp(`${T.editTitle}|${T.addTitle}`) })
    const alert = (): Locator => page.getByRole('alertdialog').first()

    /** Vite dev thỉnh thoảng nạp hụt module, trang đứng trắng ⇒ nạp lại tối đa 3 lượt. */
    async function gotoUntil(path: string, ready: () => Locator): Promise<void> {
        for (let attempt = 1; ; attempt++) {
            await page.goto(path, { waitUntil: 'domcontentloaded' })
            try {
                await expect(ready()).toBeVisible({ timeout: 30_000 })
                return
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
    }

    let current = KBN

    /** goto mới (state sạch, đọc lại quyền nhóm) rồi chọn nhóm `cdType`. */
    async function openGroup(cdType: number): Promise<void> {
        current = cdType
        await gotoUntil('/masters/code', () => page.getByRole('heading', { name: T.heading }))
        await page.getByLabel('グループ').selectOption(String(cdType))
        await expect(row(cdType === JOB ? 1 : 0)).toBeVisible({ timeout: 30_000 })
        await step()
    }

    /** Đọc hộp xác nhận/thông báo trên cùng, bấm nút `button`, chờ nó đóng. */
    async function answer(expected: string, button: 'OK' | 'キャンセル'): Promise<void> {
        await expect(alert()).toBeVisible({ timeout: 15_000 })
        await expect(alert()).toContainText(expected)
        await alert().getByRole('button', { name: button, exact: true }).click()
        await expect(alert()).toBeHidden()
    }

    async function pick(cdVal: number): Promise<void> {
        await row(cdVal).click()
        await expect(root().getByText(new RegExp(`^選択中: ${current}-${cdVal}\\b`))).toBeVisible()
    }

    /** Gõ một ngày vào WarekiDateField (role=group theo nhãn): 元号 rồi năm/tháng/ngày hai chữ số. */
    async function fillWareki(scope: Locator, label: string, era: string, y: number, m: number, d: number): Promise<void> {
        const field = scope.getByRole('group', { name: label, exact: true })
        await field.getByRole('combobox', { name: '元号' }).click()
        await page.getByRole('option', { name: era, exact: true }).click()
        const two = (n: number) => String(n).padStart(2, '0')
        const cells = field.getByRole('textbox')
        await cells.nth(0).fill(two(y))
        await cells.nth(1).fill(two(m))
        await cells.nth(2).fill(two(d))
        await cells.nth(2).press('Tab')
    }

    /** Các mục của một combo (mở rồi đóng lại). */
    async function optionsOf(trigger: Locator): Promise<string[]> {
        await trigger.click()
        const options = page.getByRole('option')
        await expect(options.first()).toBeVisible()
        const texts = (await options.allInnerTexts()).map((t) => t.trim())
        // Ở 患者登録 Escape đưa màn về 患者選択 ⇒ bấm lại mục đang chọn; không có thì mới Escape.
        const selected = page.getByRole('option', { selected: true }).first()
        if (await selected.isVisible().catch(() => false)) await selected.click()
        else await page.keyboard.press('Escape')
        await expect(options.first()).toBeHidden()
        await step()
        return texts
    }

    /** Combo 区分 của ユーザマスタ 新規 (nhóm 30). */
    async function userKbnOptions(): Promise<string[]> {
        const trigger = page.getByRole('combobox', { name: '区分' })
        await gotoUntil('/settings/user-master/new', () => trigger)
        return optionsOf(trigger)
    }

    /** Combo 職業 của 患者登録 (nhóm 9) — Select không aria-label, dưới <label>職業</label>. */
    async function jobOptions(): Promise<string[]> {
        const trigger = () =>
            page
                .locator('div')
                .filter({ has: page.locator('label').filter({ hasText: /^職業\s*\*?$/ }) })
                .last()
                .getByRole('combobox')
        await gotoUntil(`/patients/registration?patientNo=%22${PAT}%22`, trigger)
        return optionsOf(trigger())
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        admin = await openAdminApi()
        for (const g of [KBN, JOB]) {
            originals.set(g, await admin.getType(g))
            // Lần chạy trước bị ngắt giữa chừng thì còn sót override: dọn trước cho chắc.
            await admin.resetGroup(g)
        }
        await admin.enable(KBN, {})
        await seedTestPatient({ patNo: PAT, patNm: 'コード　設定', patKn: 'こーど　せってい' })
    })

    test.afterAll(async () => {
        if (admin) {
            for (const g of [KBN, JOB]) {
                await admin.resetGroup(g).catch((e) => console.log(`DỌN override nhóm ${g} lỗi: ${e}`))
                const o = originals.get(g)
                if (o) await admin.setType(o).catch((e) => console.log(`TRẢ quyền nhóm ${g} lỗi: ${e}`))
            }
            await admin.dispose()
        }
        await deleteTestPatient(PAT).catch(() => {})
        await releaseSharedPage(page)
    })

    // ── Mở màn ────────────────────────────────────────────────────────────────

    test('TC-01 — マスタ登録メニュー có nút コード設定; mở ra /masters/code, focus ở グループ, F10 về /masters', async () => {
        const open = () => page.getByRole('button', { name: 'コード設定', exact: true })
        await gotoUntil('/masters', open)
        await open().click()
        await expect(page).toHaveURL(/\/masters\/code$/)
        await expect(page.getByRole('heading', { name: T.heading })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByLabel('グループ')).toBeFocused()
        await step()
        await fkey(10).click()
        await expect(page).toHaveURL(/\/masters$/)
    })

    // ── nhóm 30: không bật quyền nào ─────────────────────────────────────────

    test('TC-02 — không bật quyền nào: dải 「システムで管理」, không F1 / F3 / F9, F5 mờ, không có hint ダブルクリック', async () => {
        await openGroup(KBN)
        await expect(root().getByText(T.lockedNotice)).toBeVisible()
        for (const n of [1, 3, 9]) await expect(fkey(n), `F${n} không được render khi không bật quyền nào`).toHaveCount(0)
        await expect(fkey(5), 'dòng chưa đổi gì ⇒ không có gì để 元に戻す').toBeDisabled()
        await expect(fkey(6)).toBeEnabled()
        await expect(fkey(10)).toBeEnabled()
        await expect(root().getByText(T.hint)).toHaveCount(0)
        // Double-click cũng không mở được dialog.
        await row(1).dblclick()
        await expect(editDialog()).toHaveCount(0)
        await captureFixedUi(page, 'mst-code-tenant-locked')
    })

    // ── nhóm 30: 名称・順 ─────────────────────────────────────────────────────

    test('TC-03 — bật 名称・順: caption 「変更可: 名称・順」, phím F5 / F9 (không có F1 / F3), có hint', async () => {
        await admin.enable(KBN, { rename: true, reorder: true })
        await openGroup(KBN)
        await expect(root().getByText(T.captionRename, { exact: true })).toBeVisible()
        await expect(fkey(1)).toHaveCount(0)
        await expect(fkey(3)).toHaveCount(0)
        await expect(fkey(5)).toContainText('元に戻す')
        await expect(fkey(9)).toContainText('選択')
        await expect(root().getByText(T.hint)).toHaveCount(1)
        // Dòng 0 tự chọn; mã chưa đổi gì ⇒ F5 mờ.
        await expect(fkey(5)).toBeDisabled()
    })

    test('TC-04 — コード編集 mã chung: chỉ 名称1 / 名称2 / 順 (không có ngày), mỗi ô có 上書き, ô kế thừa bị khoá, không cuộn', async () => {
        await pick(1)
        await fkey(9).click()
        const dialog = editDialog()
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(KBN_LABEL)
        for (const f of ['名称1', '名称2', '順']) {
            await expect(dialog.getByRole('checkbox', { name: `${f} 上書き` })).not.toBeChecked()
        }
        await expect(dialog.getByRole('group', { name: '開始日' })).toHaveCount(0)
        await expect(dialog.getByRole('group', { name: '終了日' })).toHaveCount(0)
        // Kế thừa ⇒ ô hiện giá trị chung và bị khoá.
        await expect(dialog.locator('#mst-code-anyVal1')).toHaveValue('衛生士')
        await expect(dialog.locator('#mst-code-anyVal1')).toBeDisabled()
        await expect(dialog.locator('#mst-code-cd-val')).toHaveValue('1')
        // Rule 23.2: thân dialog không có thanh cuộn dọc.
        const body = dialog.locator('div.overflow-auto').first()
        const { scrollH, clientH } = await body.evaluate((el) => ({ scrollH: el.scrollHeight, clientH: el.clientHeight }))
        expect(scrollH, 'thân コード編集 bị cuộn dọc').toBeLessThanOrEqual(clientH + 1)
        await captureFixedUi(dialog, 'mst-code-tenant-edit-dialog')
    })

    test('TC-05 — Rule 23.4: gõ dở rồi F10 閉じる, mở lại thì giá trị nháp không còn', async () => {
        const dialog = editDialog()
        await dialog.getByRole('checkbox', { name: '名称1 上書き' }).click()
        await dialog.locator('#mst-code-anyVal1').fill('nháp-không-lưu')
        await dialog.locator('[data-fkey="F10"]').click()
        await expect(dialog).toBeHidden()
        await fkey(9).click()
        await expect(editDialog().locator('#mst-code-anyVal1')).toHaveValue('衛生士')
        await expect(editDialog().getByRole('checkbox', { name: '名称1 上書き' })).not.toBeChecked()
    })

    test('TC-06 — ghi đè 名称1: Q00002 → dòng 「変更済み」, ô hiện 「衛生士 → E2E衛生士」, tab 変更のみ = 1', async () => {
        const dialog = editDialog()
        await dialog.getByRole('checkbox', { name: '名称1 上書き' }).click()
        await expect(dialog.locator('#mst-code-anyVal1')).toBeEnabled()
        await dialog.locator('#mst-code-anyVal1').fill(RENAMED)
        await step()
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(MSG.Q00002(), 'OK')
        await expect(dialog).toBeHidden()

        await expect(row(1)).toContainText(T.statusOverridden)
        await expect(row(1)).toContainText('衛生士')
        await expect(row(1)).toContainText(RENAMED)
        await expect(root().getByRole('tab', { name: /^変更のみ/ })).toContainText('1')
        await root().getByRole('tab', { name: /^変更のみ/ }).click()
        await expect(root().locator('[data-testid^="row-"]')).toHaveCount(1)
        await root().getByRole('tab', { name: /^全データ/ }).click()
        await captureFixedUi(page, 'mst-code-tenant-overridden-row')
    })

    test('TC-07 — tên mới lan xuống combo 区分 của ユーザマスタ 新規', async () => {
        const options = await userKbnOptions()
        expect(options).toContain(RENAMED)
        expect(options).not.toContain('衛生士')
    })

    test('TC-08 — F5 元に戻す: hỏi 「共通マスタの内容に戻します…」, キャンセル giữ nguyên, OK về 「共通」', async () => {
        await openGroup(KBN)
        await pick(1)
        await expect(fkey(5)).toBeEnabled()
        await fkey(5).click()
        await answer(T.confirmReset, 'キャンセル')
        await expect(row(1)).toContainText(T.statusOverridden)
        await fkey(5).click()
        await answer(T.confirmReset, 'OK')
        await expect(row(1)).toContainText(T.statusShared)
        await expect(row(1)).not.toContainText(RENAMED)
    })

    // ── nhóm 9: đủ bốn quyền ──────────────────────────────────────────────────

    test('TC-09 — bật đủ bốn quyền (nhóm 9): caption kèm dải 30000～32767; F1 / F3 / F5 / F9', async () => {
        await admin.enable(JOB, { rename: true, reorder: true, hide: true, add: true })
        await openGroup(JOB)
        await expect(root().getByText(T.captionFull, { exact: true })).toBeVisible()
        await expect(fkey(1)).toBeEnabled()
        await pick(2)
        await expect(fkey(3)).toContainText('非表示')
        await expect(fkey(3)).toBeEnabled()
        await expect(fkey(9)).toBeEnabled()
    })

    test('TC-10 — F1 追加: focus ô コード, gợi ý dải; mã ngoài dải (E00029) và 名称1 trống bị chặn ở client', async () => {
        await fkey(1).click()
        const dialog = editDialog()
        await expect(dialog).toContainText(T.addTitle)
        await expect(dialog.locator('#mst-code-cd-val')).toBeFocused()
        await expect(dialog).toContainText(`独自コード ${RANGE_TEXT}`)
        // Mã riêng: không có checkbox 上書き (không có gì để kế thừa).
        await expect(dialog.getByRole('checkbox')).toHaveCount(0)

        for (const typed of ['5', String(OWN_CODE.min - 1), String(OWN_CODE.max + 1)]) {
            await dialog.locator('#mst-code-cd-val').fill(typed)
            await dialog.locator('[data-fkey="F9"]').click()
            await answer(T.outOfRange, 'OK')
            await expect(dialog.locator('#mst-code-cd-val')).toBeFocused()
        }

        await dialog.locator('#mst-code-cd-val').fill(String(CUSTOM_CD))
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(MSG.E00001('名称1'), 'OK')
        await expect(dialog.locator('#mst-code-anyVal1')).toBeFocused()
    })

    test('TC-11 — thêm mã riêng 30950: Q00001 → dòng 「独自コード」, F5 đổi thành 削除', async () => {
        const dialog = editDialog()
        await dialog.locator('#mst-code-anyVal1').fill(CUSTOM_NAME)
        await dialog.locator('#mst-code-anyVal2').fill(CUSTOM_NAME)
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(T.q00001, 'OK')
        await expect(dialog).toBeHidden()
        await expect(row(CUSTOM_CD)).toContainText(T.statusCustom)
        await pick(CUSTOM_CD)
        await expect(fkey(5)).toContainText('削除')
    })

    test('TC-12 — thêm trùng mã 30950: BE từ chối E00008 「コードは既に登録されています。」, dialog vẫn mở', async () => {
        await fkey(1).click()
        const dialog = editDialog()
        await dialog.locator('#mst-code-cd-val').fill(String(CUSTOM_CD))
        await dialog.locator('#mst-code-anyVal1').fill('trùng')
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(T.q00001, 'OK')
        await answer(T.duplicate, 'OK')
        await expect(dialog).toBeVisible()
        await dialog.locator('[data-fkey="F10"]').click()
        await expect(dialog).toBeHidden()
    })

    test('TC-13 — F3 ẩn mã 2 教師: dòng 「非表示（令和…〜）」, F3 thành 表示, F5 bật', async () => {
        await pick(2)
        await fkey(3).click()
        await expect(row(2)).toContainText(T.hiddenSince)
        await expect(fkey(3)).toContainText('表示')
        await expect(fkey(5), 'F5 元に戻す cũng hiện lại mã đã ẩn').toBeEnabled()
    })

    test('TC-14 — combo 職業 (患者登録): có mã riêng 30950, mất mã ẩn 教師', async () => {
        const options = await jobOptions()
        expect(options).toContain(CUSTOM_NAME)
        expect(options).not.toContain('教師')
    })

    test('TC-16 — F3 表示 trả mã 2 về 「共通」', async () => {
        await openGroup(JOB)
        await pick(2)
        await fkey(3).click()
        await expect(row(2)).toContainText(T.statusShared)
        await expect(fkey(3)).toContainText('非表示')
    })

    test('TC-17 — 終了日 mã riêng về quá khứ: F6 基準日 hôm nay không có mã đó, ngày cũ thì có', async () => {
        await pick(CUSTOM_CD)
        await fkey(9).click()
        const dialog = editDialog()
        await expect(dialog).toContainText(T.editTitle)
        await fillWareki(dialog, '終了日', '平成', 12, 1, 1)
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(MSG.Q00002(), 'OK')
        await expect(dialog).toBeHidden()
        await expect(row(CUSTOM_CD)).toContainText('平成12年01月01日')

        await fkey(6).click()
        const asOf = page.getByRole('dialog').filter({ hasText: T.asOfTitle })
        await expect(asOf).toContainText(`${T.asOfTitle}（${JOB_LABEL}）`)
        await expect(asOf.locator('li').filter({ hasText: CUSTOM_NAME })).toHaveCount(0)
        await expect(asOf.locator('li').filter({ hasText: '会社員' })).toHaveCount(1)
        await fillWareki(asOf, '基準日', '平成', 11, 12, 31)
        await expect(asOf.locator('li').filter({ hasText: CUSTOM_NAME })).toHaveCount(1)
        await asOf.locator('[data-fkey="F10"]').click()
        await expect(asOf).toBeHidden()
    })

    test('TC-18 — mã riêng: 開始日 sau 終了日 ⇒ BE từ chối E00023 「有効終了日が有効開始日より過去日付です。」, dialog vẫn mở', async () => {
        await openGroup(JOB)
        await pick(CUSTOM_CD)
        await fkey(9).click()
        const dialog = editDialog()
        await fillWareki(dialog, '開始日', '平成', 13, 1, 1)
        await dialog.locator('[data-fkey="F9"]').click()
        await answer(MSG.Q00002(), 'OK')
        await answer(T.invalidPeriod, 'OK')
        await expect(dialog).toBeVisible()
        await dialog.locator('[data-fkey="F10"]').click()
        await expect(dialog).toBeHidden()
    })

    test('TC-19 — F5 削除 mã riêng 30950: Q00003 → dòng biến mất', async () => {
        await pick(CUSTOM_CD)
        await fkey(5).click()
        await answer(MSG.Q00003(), 'OK')
        await expect(row(CUSTOM_CD)).toHaveCount(0)
    })
})
