import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled } from '../_shared/db'
import { MSG } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

import { type AdminApi, type CodeType, INHERIT_ALL, OWN_CODE, openAdminApi } from './_mst-code-admin'

/**
 * コード設定 (/masters/code) — F5 元に戻す theo từng loại dòng, 「共通コードあり」, kiểm tra nhập ở client và độ
 * dài 256 của 名称. Bổ sung cho tenant-code-settings.spec.ts. Commit 6510314fd, 172ce4df6, d38460b95, 5d1875266;
 * quyền theo loại từ BE 7564a9ebc (2026-10-27).
 *
 * FACT bám theo source (Rule 21) — apps/web-tenant/src/features/mst-code-settings/:
 *  - lib/mst-code-fkeys.ts — F5 元に戻す LUÔN có: bật trên dòng 変更済み hoặc 非表示, kể cả khi quyền đã bị tắt
 *    (tenant không sửa được nữa nhưng vẫn trả về chung được).
 *  - mst-code-settings-screen.tsx: F5 hỏi locales ja.confirmReset (một câu cho mọi dòng).
 *  - components/mst-code-edit-dialog.tsx: dòng ghi đè đủ 名称1/名称2/順 (isFullOverride — ngày là của admin) hiện
 *    「共通コードあり（元に戻すと共通コードになります）」; 名称1/名称2 maxLength 256, 順 maxLength 5; ô 名称 tìm kiếm 256.
 *  - schemas/mst-code-form.ts (F9 登録, trước Q00002): 順 trống ⇒ E00001 「順が入力されていません。」; không phải số ⇒
 *    「順は数値で入力して下さい。」; số âm ⇒ E00002 「順が間違っています。」; ngày < 1900-01-01 (chỉ mã riêng mới có ngày)
 *    ⇒ E00002 「開始日が間違っています。」. Alert xong focus về ô lỗi.
 *
 * DỮ LIỆU: nhóm 30 ユーザ区分 (0 ドクター / 1 衛生士 / 2 スタッフ; trần 名称・順) và nhóm 9 職業 (trần đủ bốn — cho ca
 * ẩn và mã riêng có ngày). Override dựng qua admin API. afterAll xoá mọi override hai nhóm và trả quyền gốc.
 *
 * Cần TEST_ALLOW_SAVE=1, TEST_DB=1. Serial, chung page (Rule 19) — chạy cả file:
 *   TEST_ALLOW_SAVE=1 TEST_DB=1 npx playwright test tests/mst-code/tenant-code-settings-reset.spec.ts
 * Login: 1 (authedPage) + 1 (admin API).
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

skipWithReason(process.env.TEST_ALLOW_SAVE !== '1', 'Cần TEST_ALLOW_SAVE=1: spec đổi quyền nhóm mã và ghi override')
skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để tra tenant id')

const CD_TYPE = 30
const JOB = 9
const CUSTOM_CD = OWN_CODE.min + 951
const NAME_MAX_LENGTH = 256

const T = {
    heading: 'コ ー ド 設 定',
    editTitle: 'コード編集',
    confirmReset:
        '共通マスタの内容に戻します。過去の記録も含め、このコードを使っているすべての記録が共通の名称で表示されます。よろしいですか？',
    lockedNotice: 'このグループはシステムで管理されています',
    fullOverrideHint: '共通コードあり（元に戻すと共通コードになります）',
    notNumber: '順は数値で入力して下さい。',
    statusOverridden: '変更済み',
    statusShared: '共通',
}

/** Đủ các trường tenant ghi đè được trên mã chung; ngày là của admin (null = giữ nguyên). */
const FULL = { ...INHERIT_ALL, anyVal1: 'E2E全項目', anyVal2: 'E2E全項目', sortOrder: 0 }

test.describe('コード設定 — F5 元に戻す, 共通コードあり, kiểm tra nhập', () => {
    let page: Page
    let step: () => Promise<void>
    let admin: AdminApi
    const originals = new Map<number, CodeType>()
    let current = CD_TYPE

    const root = () => page.locator('.animate-fade-in').first()
    const fkey = (n: number): Locator => root().locator(`[data-fkey="F${n}"]`)
    const row = (cdVal: number): Locator => root().locator(`[data-testid="row-${cdVal}"]`)
    const editDialog = (): Locator => page.getByRole('dialog').filter({ hasText: T.editTitle })
    const alert = (): Locator => page.getByRole('alertdialog').first()

    async function openGroup(cdType = CD_TYPE): Promise<void> {
        current = cdType
        for (let attempt = 1; ; attempt++) {
            await page.goto('/masters/code', { waitUntil: 'domcontentloaded' })
            try {
                await expect(page.getByRole('heading', { name: T.heading })).toBeVisible({ timeout: 30_000 })
                break
            } catch (e) {
                if (attempt === 3) throw e
            }
        }
        await page.getByLabel('グループ').selectOption(String(cdType))
        await expect(row(cdType === JOB ? 1 : 0)).toBeVisible({ timeout: 30_000 })
        await step()
    }

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

    async function openEdit(cdVal: number): Promise<Locator> {
        await pick(cdVal)
        await fkey(9).click()
        await expect(editDialog()).toBeVisible()
        return editDialog()
    }

    async function closeEdit(): Promise<void> {
        await editDialog().locator('[data-fkey="F10"]').click()
        await expect(editDialog()).toBeHidden()
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        admin = await openAdminApi()
        for (const g of [CD_TYPE, JOB]) {
            originals.set(g, await admin.getType(g))
            await admin.resetGroup(g)
        }
    })

    test.afterAll(async () => {
        if (admin) {
            for (const g of [CD_TYPE, JOB]) {
                await admin.resetGroup(g).catch((e) => console.log(`DỌN override nhóm ${g} lỗi: ${e}`))
                const o = originals.get(g)
                if (o) await admin.setType(o).catch((e) => console.log(`TRẢ quyền nhóm ${g} lỗi: ${e}`))
            }
            await admin.dispose()
        }
        await releaseSharedPage(page)
    })

    // ── nhóm 30 ───────────────────────────────────────────────────────────────

    test('TC-01 — quyền đã tắt: dòng 変更済み vẫn 元に戻す được (F5 bật, về 共通); dòng chưa đổi thì F5 mờ', async () => {
        await admin.save(CD_TYPE, 1, { ...INHERIT_ALL, anyVal1: 'E2E旧上書き' })
        await admin.enable(CD_TYPE, {})
        await openGroup()
        await expect(root().getByText(T.lockedNotice)).toBeVisible()
        await expect(fkey(9), 'không bật quyền ⇒ không sửa được').toHaveCount(0)
        await expect(row(1)).toContainText(T.statusOverridden)

        await pick(2)
        await expect(fkey(5), 'dòng chưa đổi gì ⇒ không có gì để 元に戻す').toBeDisabled()
        await pick(1)
        await expect(fkey(5)).toBeEnabled()
        await fkey(5).click()
        await answer(T.confirmReset, 'OK')
        await expect(row(1)).toContainText(T.statusShared)
        await admin.enable(CD_TYPE, { rename: true, reorder: true })
        await openGroup()
    })

    test('TC-02 — 順: trống ⇒ E00001, chữ ⇒ 「順は数値で入力して下さい。」, số âm ⇒ E00002; focus về ô 順', async () => {
        const d = await openEdit(0)
        await d.getByRole('checkbox', { name: '順 上書き' }).click()
        const order = d.locator('#mst-code-sortOrder')
        await expect(order).toHaveAttribute('maxlength', '5')

        for (const [typed, message] of [
            ['', MSG.E00001('順')],
            ['ab', T.notNumber],
            ['-1', MSG.E00002('順')],
        ] as const) {
            await order.fill(typed)
            await d.locator('[data-fkey="F9"]').click()
            await answer(message, 'OK')
            await expect(order).toBeFocused()
            await expect(d, 'lỗi client không được đóng dialog').toBeVisible()
        }
        await closeEdit()
        await expect(row(0)).toContainText(T.statusShared)
    })

    test('TC-03 — 名称 dài tối đa 256 (ô tìm kiếm + dialog); lưu 256 ký tự thì server nhận đủ', async () => {
        const search = root().getByLabel('名称', { exact: true })
        await expect(search).toHaveAttribute('maxlength', String(NAME_MAX_LENGTH))
        await search.fill('')

        const d = await openEdit(0)
        await d.getByRole('checkbox', { name: '名称1 上書き' }).click()
        const name1 = d.locator('#mst-code-anyVal1')
        await expect(name1).toHaveAttribute('maxlength', String(NAME_MAX_LENGTH))
        await name1.pressSequentially('あ'.repeat(NAME_MAX_LENGTH + 4))
        await expect(name1).toHaveValue('あ'.repeat(NAME_MAX_LENGTH))
        await d.locator('[data-fkey="F9"]').click()
        await answer(MSG.Q00002(), 'OK')
        await expect(d).toBeHidden()
        await expect(row(0)).toContainText(T.statusOverridden)
        const saved = (await admin.tenantCodes(CD_TYPE)).find((c) => c.cdVal === 0)
        expect(saved?.anyVal1?.length, 'server cắt/không nhận tên 256 ký tự').toBe(NAME_MAX_LENGTH)

        await pick(0)
        await fkey(5).click()
        await answer(T.confirmReset, 'OK')
        await expect(row(0)).toContainText(T.statusShared)
    })

    test('TC-04 — mã riêng: 開始日 trước 1900-01-01 ⇒ E00002 「開始日が間違っています。」, focus về 開始日', async () => {
        await admin.enable(JOB, { rename: true, reorder: true, hide: true, add: true })
        await admin.add(JOB, CUSTOM_CD, { anyVal1: 'E2E日付', anyVal2: 'E2E日付', sortOrder: 0, startDate: '1900-01-01', endDate: '9999-12-31' })
        await openGroup(JOB)
        const d = await openEdit(CUSTOM_CD)
        const start = d.getByRole('group', { name: '開始日', exact: true })
        await start.getByRole('combobox', { name: '元号' }).click()
        await page.getByRole('option', { name: '明治', exact: true }).click()
        const cells = start.getByRole('textbox')
        await cells.nth(0).fill('32')
        await cells.nth(1).fill('12')
        await cells.nth(2).fill('31')
        await cells.nth(2).press('Tab')
        await d.locator('[data-fkey="F9"]').click()
        await answer(MSG.E00002('開始日'), 'OK')
        await expect(start.locator(':focus'), 'focus phải về ô 開始日').toHaveCount(1)
        await closeEdit()
        await admin.reset(JOB, CUSTOM_CD)
    })

    test('TC-05 — ghi đè đủ 名称1/名称2/順: dialog hiện 「共通コードあり」, ghi đè một phần thì không; F5 hỏi rồi về 共通', async () => {
        await admin.save(CD_TYPE, 1, FULL)
        await admin.save(CD_TYPE, 2, { ...INHERIT_ALL, anyVal1: 'E2E一部' })
        await openGroup()

        let d = await openEdit(1)
        await expect(d).toContainText(T.fullOverrideHint)
        await captureFixedUi(d, 'mst-code-tenant-full-override')
        await closeEdit()
        d = await openEdit(2)
        await expect(d, 'ghi đè một phần thì không có 共通コードあり').not.toContainText(T.fullOverrideHint)
        await closeEdit()

        await pick(1)
        await fkey(5).click()
        await answer(T.confirmReset, 'キャンセル')
        await expect(row(1)).toContainText(T.statusOverridden)
        await fkey(5).click()
        await answer(T.confirmReset, 'OK')
        await expect(row(1)).toContainText(T.statusShared)
        await expect(row(1)).not.toContainText(FULL.anyVal1)
        await admin.reset(CD_TYPE, 2)
    })

    test('TC-06 — dòng 非表示 (nhóm 9): F5 元に戻す bật, hỏi rồi hiện lại mã (về 共通, F3 thành 非表示)', async () => {
        await openGroup(JOB)
        await pick(2)
        await fkey(3).click()
        await expect(row(2)).toContainText(/非表示（令和\d{2}年\d{2}月\d{2}日〜）/)
        await expect(fkey(5)).toContainText('元に戻す')
        await expect(fkey(5)).toBeEnabled()
        await fkey(5).click()
        await answer(T.confirmReset, 'OK')
        await expect(row(2)).toContainText(T.statusShared)
        await expect(fkey(3)).toContainText('非表示')
        const code2 = (await admin.tenantCodes(JOB)).find((c) => c.cdVal === 2)
        expect(code2?.status).toBe('shared')
    })
})
