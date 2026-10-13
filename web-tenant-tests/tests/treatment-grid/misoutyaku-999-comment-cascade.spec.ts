import { type Locator, type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    writeSigaTeeth,
} from '../_shared/db'
import {
    GRID_LOAD_ATTEMPTS,
    GRID_LOAD_TIMEOUT,
    GRID_RELOAD_TIMEOUT,
    TODAY_ISO,
    allowSave,
    patNo,
    trtDt,
} from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — コードモード 999 (未装着) và chuỗi 摘要コメント pack M-1 → M-2 → M-3.
 *
 * ĐẶC TÍNH KIỂM THỬ: assert bám THEO WINFORM (`CmtAuto.prgCmtAuto`, `cmtMiraiinSetDate`,
 * `MstCmtPack.getMstCmtPackData`). Test đỏ = bản port lệch.
 *
 * Chuỗi WinForm đo được (999 gõ ở ô 点, rồi Enter ở ô 回 — Chk_CmtAuto chạy ở đuôi 回):
 *   1. ユーザー摘要コメント選択 (M-1 装着物の種類): ＦＭＣ未装着 / 義歯未装着, DÒNG ĐẦU đã selected
 *   2. パラメータ (M-2 装着予定年月日): ô 和暦 mặc định NGÀY HỆ THỐNG (frm203048
 *      `dtUpdate.setDate(DateTime.Today)`), hướng dẫn 「未来院請求-装着予定年月日を入力してください。」
 *   3. ユーザー摘要コメント選択 (M-3 装着できなくなった理由): 「未」, dòng đầu đã selected,
 *      hướng dẫn 「…理由を入力してください。」 — KHÔNG có 「；」 ở cuối com_nm
 *      (MstCmtPack.cs:172-173 TrimEnd('；'))
 *   Lưới: 未装着 → ＦＭＣ未装着 → 未来院請求 装着予定年月日 令和XX年XX月XX日 → 未
 *
 * M-2 chọn文言 theo dòng 処置 đứng NGAY TRÊN 999: 有床義歯 (274 / 282, 枝番 0-4) ⇒
 * 「装着（又は試適）予定年月日」, còn lại 「装着予定年月日」 (cmtMiraiinSetDate :3141-3143).
 *
 * Bệnh nhân TỰ DỰNG (990000+), xoá ở afterAll. KHÔNG bấm F9 登録 ⇒ không ghi trn_trn.
 *
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/treatment-grid/misoutyaku-999-comment-cascade.spec.ts
 *
 * Lưu ý: `treatment-grid-special-codes.spec.ts` cố ý không test 999 vì WinForm văng
 * `Index was outside the bounds` khi KHÔNG có 印象 trên lưới. Spec này luôn seed 印象
 * (240-0) nên đi đúng đường WinForm chạy được.
 */
const PAT_NO_PLAIN = patNo(String(SEED_PAT_NO_BASE + 800))
const PAT_NO_DENTURE = String(SEED_PAT_NO_BASE + 801)
const TRT_DT = trtDt(TODAY_ISO)

const SLOT = 5
const BUI_VAL = 1
const DIS_CD_C = 100
const DIS_SB_C2 = 2

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()
const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

/** 令和YY年MM月DD日 của NGÀY HỆ THỐNG — mặc định của ô 和暦 trong frm203048. */
function todayEraText(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `令和${pad(d.getFullYear() - 2018)}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`
}

if (!dbEnabled || !allowSave) {
    console.log(
        '\n⚠️  misoutyaku-999-comment-cascade.spec.ts BỎ QUA — cần TEST_DB=1 TEST_ALLOW_SAVE=1\n',
    )
}
test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: 999 ghi nóng bảng siga / chuyển 転帰')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 999 未装着: chuỗi 摘要コメント M-1 → M-2 → M-3', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined

    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')
    const ryoTexts = async () =>
        (await ryoCells().evaluateAll((els) => els.map((e) => e.textContent ?? ''))).map(norm)
    const dialog = (title: RegExp | string) => page.getByRole('dialog').filter({ hasText: title })

    async function openTreatmentScreen(patNoStr: string) {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${patNoStr}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(page.getByText('合計:').first()).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                for (let i = 0; i < 6; i++) {
                    await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, {
                        timeout: 20_000,
                    })
                    await page.waitForTimeout(700)
                }
                await closeDialogs(page)
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    /** 部位病名行 (răng slot 5) → 印象 240-0 → (tuỳ chọn) 装着 row ngay trên 999. */
    async function seedAndOpen(patNoStr: string, above: { cd: number; sb: number; nm: string }[]) {
        await seedTestPatient({ patNo: Number(patNoStr) })
        await writeSigaTeeth(Number(patNoStr), { se: { [SLOT + 1]: 0 } })
        const base = {
            bui: buiAt(SLOT, BUI_VAL),
            dspBui: `slot${SLOT}`,
            disCd: [DIS_CD_C],
            disSb: [DIS_SB_C2],
            dspDis: 'Ｃ',
        }
        await seedTreatmentRows(Number(patNoStr), TRT_DT, [
            { trtCd: 0, trtSb: 0, trtPt: 0, trtCnt: 0, dspTrt: '', ...base },
            { trtCd: 240, trtSb: 0, trtPt: 32, trtCnt: 1, dspTrt: '単純印象', ...base },
            ...above.map((a) => ({
                trtCd: a.cd,
                trtSb: a.sb,
                trtPt: 100,
                trtCnt: 1,
                dspTrt: a.nm,
                ...base,
            })),
        ])
        await openTreatmentScreen(patNoStr)
    }

    /** Gõ 999 ở ô 点 (コードモード) rồi Enter ở ô 回 để chạy Chk_CmtAuto. */
    async function enter999AndCountEnter() {
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await footerTen.click()
        await footerTen.fill('999')
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý').toHaveValue('')
        // Dòng 未装着 vào lưới, ô 回 mở ra và nhận focus; Enter ở đó mới chạy Chk_CmtAuto.
        await expect
            .poll(async () => (await ryoTexts()).some((t) => t.includes('未装着')), {
                timeout: 20_000,
                message: 'dòng 未装着 chưa vào lưới',
            })
            .toBe(true)
        const kaiEditor = page.locator('[data-grid-cell$="|4"] input:not([data-footer-cell])')
        await expect(kaiEditor).toHaveCount(1, { timeout: 20_000 })
        await expect
            .poll(() => kaiEditor.evaluate((el) => el === document.activeElement), {
                timeout: 10_000,
            })
            .toBe(true)
        await page.keyboard.press('Enter')
    }

    /**
     * 確定 bằng NÚT F9 của dialog, không bằng phím: một alert お茶コン (vd W00100 của
     * SingleChk) có thể bung giữa chừng và nuốt phím F9; click đi qua locator handler của
     * `installOverlayHandlers` nên luôn tới được nút.
     */
    async function confirmDialog(dlg: Locator) {
        // Lặp lại cho tới khi dialog đóng: nếu alert chen vào ngay lúc bấm thì lần bấm đầu
        // có thể không tới được nút.
        await expect(async () => {
            if (await dlg.isVisible()) await dlg.locator('[data-fkey="F9"]').click()
            await expect(dlg).toBeHidden({ timeout: 3_000 })
        }).toPass({ timeout: 25_000 })
    }

    async function expectFirstRowSelected(dlg: Locator) {
        await expect(
            dlg.getByTestId('user-cmt-row-0'),
            'dòng đầu phải được selected ngay khi dialog hiện (DataGridView bind → row 0)',
        ).toHaveClass(/bg-blue-500/)
        await expect(dlg.getByTestId('user-cmt-row-1')).not.toHaveClass(/bg-blue-500/)
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })
    })

    test.afterAll(async () => {
        await deleteTestPatient(Number(PAT_NO_PLAIN)).catch(() => {})
        await deleteTestPatient(Number(PAT_NO_DENTURE)).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    test('TC-1 chuỗi M-1 → M-2 → M-3, dòng đầu selected, ngày mặc định = hôm nay, không còn 「；」', async () => {
        await seedAndOpen(PAT_NO_PLAIN, [])
        await enter999AndCountEnter()

        // M-1 装着物の種類
        const m1 = dialog('ユーザー摘要コメント選択')
        await expect(m1, 'M-1 không hiện').toBeVisible({ timeout: 20_000 })
        await expect(m1).toContainText('処置名称 未装着')
        await expect(m1.getByTestId('user-cmt-row-0')).toContainText('ＦＭＣ未装着')
        await expect(m1.getByTestId('user-cmt-row-1')).toContainText('義歯未装着')
        await expectFirstRowSelected(m1)
        await expect(m1).toContainText(
            '「歯冠修復及び欠損補綴」欄の記載から装着物の種類が特定できない場合、入力してください。',
        )
        await confirmDialog(m1)

        // M-2 装着予定年月日 — thiếu màn này là lỗi cũ
        const m2 = dialog('パラメータ')
        await expect(m2, 'thiếu màn xác nhận 装着予定年月日 (pack M-2)').toBeVisible({
            timeout: 20_000,
        })
        await expect(m2).toContainText('未来院請求-装着予定年月日を入力してください。')
        await confirmDialog(m2)

        // M-3 装着できなくなった理由
        const m3 = dialog('ユーザー摘要コメント選択')
        await expect(m3.getByTestId('user-cmt-row-0')).toContainText('未', { timeout: 20_000 })
        await expect(m3.getByTestId('user-cmt-row-1')).toHaveCount(0)
        await expect(m3.getByTestId('user-cmt-row-0')).toHaveClass(/bg-blue-500/)
        const guide = norm(await m3.innerText())
        expect(guide, 'hướng dẫn M-3').toContain('未来院請求 装着できなくなった理由を入力してください。')
        expect(guide, 'com_nm phải được TrimEnd(「；」) như MstCmtPack.cs:172').not.toContain('；')
        await confirmDialog(m3)

        await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 })
        const cells = await ryoTexts()
        const at = cells.lastIndexOf('未装着')
        expect(at, 'không thấy dòng 未装着').toBeGreaterThanOrEqual(0)
        expect(cells.slice(at, at + 4)).toEqual([
            '未装着',
            norm('ＦＭＣ未装着'),
            `未来院請求 装着予定年月日 ${todayEraText()}`,
            '未',
        ])
    })

    test('TC-2 dòng 装着 ngay trên 999 là 有床義歯 (274-0) ⇒ 「装着（又は試適）予定年月日」', async () => {
        await seedAndOpen(PAT_NO_DENTURE, [{ cd: 274, sb: 0, nm: '有床義歯(1~4)' }])
        await enter999AndCountEnter()

        const m1 = dialog('ユーザー摘要コメント選択')
        await expect(m1).toBeVisible({ timeout: 20_000 })
        await confirmDialog(m1)
        const m2 = dialog('パラメータ')
        await expect(m2).toBeVisible({ timeout: 20_000 })
        await confirmDialog(m2)
        const m3 = dialog('ユーザー摘要コメント選択')
        await expect(m3.getByTestId('user-cmt-row-0')).toContainText('未', { timeout: 20_000 })
        await confirmDialog(m3)
        await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 20_000 })

        const cells = await ryoTexts()
        expect(
            cells.some((c) => c === norm(`未来院請求 装着（又は試適）予定年月日 ${todayEraText()}`)),
            `thiếu dòng 装着（又は試適）予定年月日; lưới: ${JSON.stringify(cells.filter(Boolean))}`,
        ).toBe(true)
    })
})
