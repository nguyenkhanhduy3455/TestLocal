import { type Page } from '@playwright/test'

import { countRealTreatmentRowsInMonth, dbEnabled } from '../_shared/db'
import { TODAY_ISO, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 自動算定２ — dòng 摘要 「有床義歯に係る口腔管理のみ」 phải nằm NGAY DƯỚI 歯科疾患管理料.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BUG (tester báo 2026-10-01, ảnh so WinForm ↔ web, 患者 1863 trên DB của tester)
 * ═════════════════════════════════════════════════════════════════════════════
 *     WinForm (ngày 1)                       web (SAI)
 *     ───────────────────────────────        ───────────────────────────────
 *     歯科再診料                       59     有床義歯に係る口腔管理のみ   0   ← lên ĐẦU ngày
 *     …加算 / 物価対応料 / ﾍﾞｰｽｱｯﾌﾟ          歯科再診料                  59
 *     歯科疾患管理料                   90     …
 *     有床義歯に係る口腔管理のみ        0     歯科疾患管理料              90
 *
 * WinForm: AutoSantei2 AddRow 歯管 (116/7) ở cuối ngày, con trỏ đứng trên dòng đó, rồi
 * Chk_CmtAuto → prgCmtAuto mở frm203018 (MODAL) → chkCmtAuto_Chk_SikanDay AddRow TẠI
 * CON TRỎ (modMain.cs:770, :2159) ⇒ comment luôn nằm ngay dưới 歯管.
 *
 * Web cũ: pack B000-4 có 2 dòng ⇒ đi nhánh `select` (frm203018); lúc 確定 dòng được
 * chèn theo Ô ĐANG FOCUS (`focusedAnchorOpts`, chèn TRÊN dòng focus) chứ không theo
 * vị trí 自動算定 ⇒ focus ở dòng đầu ngày là comment nhảy lên đầu. Bản sửa truyền
 * `cursor` = dòng 歯管 vừa chèn vào runCmtAutoCascade.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ĐIỀU KIỆN DỮ LIỆU
 * ═════════════════════════════════════════════════════════════════════════════
 *  - Bệnh nhân KHÔNG có 歯周病検査 mang 病名 Ｐ/単Ｇ ⇒ cổng 歯管-有床義歯 cho pack bung
 *    (CmtAuto.cs:189-219). Tenant demo: 100 (cùng mặc định TEST_PAT_NO_DENTURE của
 *    auto-santei.spec.ts).
 *  - THÁNG của 診療日 chưa có 処置 nào lưu — AutoSantei chỉ chạy khi ngày còn trống.
 *  - mst_trt_auto đăng ký 116/7 (TRTAUTO) — tenant demo có sẵn.
 *
 * Spec KHÔNG bấm F9 登録: mỗi lần mở màn là một lần xuất phát sạch.
 *
 *     TEST_DB=1 npx playwright test tests/auto-santei/auto-santei-denture-comment-order.spec.ts
 */

const PAT_NO = process.env.TEST_PAT_NO_DENTURE ?? '100'
const TRT_DT = trtDt(TODAY_ISO)

const SHIKAN_NM = '歯科疾患管理料'
const DENTURE_CMT = '有床義歯に係る口腔管理のみ'

/** RegiCol.ryo / ten — treatment-entry-shared.ts. */
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const tenCell = (page: Page) => page.locator('[data-grid-cell$="|3"]')
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** 初診/再診 — SanteiConfirmDialog, chỉ hiện khi BE thấy đủ điều kiện 初診. */
const santeiDialog = (page: Page) => anyDialog(page).filter({ hasText: /を算定しますか？/ })
/** frm203018 摘要選択（歯管-有床義歯…）. */
const dentureDialog = (page: Page) =>
    anyDialog(page).filter({ hasText: /摘要選択（/ }).filter({ hasText: DENTURE_CMT })

/**
 * Dòng 処置 của THÁNG đang nhập, theo thứ tự lưới. Dòng 履歴 mang khoá `<tháng>-<dòng>`,
 * dòng tháng hiện tại mang uuid — chỉ lấy loại sau (BẪY lưới render cả tháng cũ).
 */
const currentMonthRyo = async (page: Page): Promise<string[]> =>
    ryoCell(page).evaluateAll((els) =>
        els
            .filter((e) => /^[0-9a-f]{8}-/.test(e.getAttribute('data-grid-cell') ?? ''))
            .map((e) => (e.textContent ?? '').trim())
            .filter((t) => t !== ''),
    )

skipWithReason(!dbEnabled, 'Cần TEST_DB=1 để kiểm tháng của 診療日 còn trống (AutoSantei mới chạy)')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('自動算定２ — 摘要 「有床義歯に係る口腔管理のみ」 nằm dưới 歯科疾患管理料', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
    })

    test.afterAll(async () => {
        if (page && !page.isClosed()) await closeDialogs(page)
        await releaseSharedPage(page)
    })

    test('TC-1 chọn ở 摘要選択 → dòng comment ngay dưới 歯管 và là dòng cuối ngày', async () => {
        const saved = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        skipWithReason(
            saved > 0,
            `患者 ${PAT_NO} đã có ${saved} dòng trong tháng ${TRT_DT.slice(0, 7)} ⇒ AutoSantei không ` +
                'chạy. Đổi TEST_PAT_NO_DENTURE / TEST_TRT_DT.',
        )

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await tenCell(page).last().waitFor({ state: 'visible', timeout: 60_000 })

        // Bệnh nhân chưa từng khám ⇒ BE đề nghị 初診; trả lời No để ra bộ 再診 như ảnh tester.
        const askedSantei = await santeiDialog(page)
            .waitFor({ timeout: 10_000 })
            .then(() => true)
            .catch(() => false)
        if (askedSantei) {
            await santeiDialog(page).getByRole('button', { name: /^No$/ }).click()
        }

        await expect(
            dentureDialog(page),
            `患者 ${PAT_NO} không bung pack 歯管-有床義歯 — bệnh nhân phải KHÔNG có 歯周病検査 ` +
                'mang Ｐ/単Ｇ, và TRTAUTO phải đăng ký 116/7.',
        ).toBeVisible({ timeout: 30_000 })
        await step()

        // Dialog mở SAU khi 歯管 đã nằm cuối ngày, comment chưa có (WinForm cũng vậy).
        const before = await currentMonthRyo(page)
        expect(before.at(-1), `lưới trước 確定: ${JSON.stringify(before)}`).toBe(SHIKAN_NM)
        expect(before).not.toContain(DENTURE_CMT)

        await dentureDialog(page).getByText(DENTURE_CMT, { exact: true }).click()
        await dentureDialog(page).getByRole('button', { name: /確定/ }).click()
        await expect(dentureDialog(page)).toHaveCount(0, { timeout: 10_000 })
        await step()

        // カルテ記載選択 của 歯管 hiện tiếp theo (frm203012) — 戻る để không thêm dòng nào.
        const karte = anyDialog(page).filter({ hasText: 'カルテ記載選択' })
        if (await karte.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false)) {
            await karte.getByRole('button', { name: /戻る/ }).click()
            await expect(karte).toHaveCount(0, { timeout: 10_000 })
        }

        await expect
            .poll(async () => (await currentMonthRyo(page)).includes(DENTURE_CMT), { timeout: 10_000 })
            .toBe(true)
        const after = await currentMonthRyo(page)
        const shikanIdx = after.lastIndexOf(SHIKAN_NM)
        const cmtIdx = after.lastIndexOf(DENTURE_CMT)
        expect(shikanIdx, `lưới sau 確定: ${JSON.stringify(after)}`).toBeGreaterThan(0)
        expect(cmtIdx, `comment phải ngay dưới 歯管 — lưới: ${JSON.stringify(after)}`).toBe(
            shikanIdx + 1,
        )
        expect(cmtIdx, `comment phải là dòng cuối ngày — lưới: ${JSON.stringify(after)}`).toBe(
            after.length - 1,
        )
    })
})
