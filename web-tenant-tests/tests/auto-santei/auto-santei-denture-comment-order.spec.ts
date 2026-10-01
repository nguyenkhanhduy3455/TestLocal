import { type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
} from '../_shared/db'
import { TODAY_ISO, allowSave, trtDt } from '../_shared/env'
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
 * DỮ LIỆU — spec TỰ DỰNG, không mượn bệnh nhân có sẵn
 * ═════════════════════════════════════════════════════════════════════════════
 *  - Bệnh nhân riêng `SEED_PAT_NO_BASE + 771` (seedTestPatient): không có 歯周病検査
 *    nào ⇒ cổng 歯管-有床義歯 (CmtAuto.cs:189-219) cho pack bung.
 *  - Một dòng 歯科初診料 (100/0) ngày 15 THÁNG TRƯỚC ⇒ 診療日 là 再診 cùng đợt, không
 *    có hỏi 初診 — đúng bộ dòng trong ảnh tester. Tháng của 診療日 để trống nên
 *    AutoSantei chạy.
 *  - Master dùng của tenant: mst_trt_auto đăng ký 116/7, pack B000-4 (2 dòng).
 *
 * Spec KHÔNG bấm F9 登録; `afterAll` xoá hẳn bệnh nhân (deleteTestPatient). Cần
 * TEST_ALLOW_SAVE=1 vì có ghi DB (person/insurance/trn_trn của bệnh nhân test).
 *
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/auto-santei/auto-santei-denture-comment-order.spec.ts
 */

const PAT_NO = SEED_PAT_NO_BASE + 771
const TRT_DT = trtDt(TODAY_ISO)

/** Ngày 15 tháng trước 診療日 — chỗ đặt 初診 để 診療日 thành 再診. */
const prevMonthIso = (iso: string): string => {
    const [y, m] = iso.split('-').map(Number)
    const d = new Date(Date.UTC(y!, m! - 2, 15))
    return d.toISOString().slice(0, 10)
}
const INITIAL_VISIT_DT = prevMonthIso(TRT_DT)
const TRT_CD_SHOSHIN = 100

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

skipWithReason(
    !dbEnabled || !allowSave,
    'Cần TEST_DB=1 TEST_ALLOW_SAVE=1 — spec tự dựng bệnh nhân + 初診 tháng trước rồi xoá',
)

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('自動算定２ — 摘要 「有床義歯に係る口腔管理のみ」 nằm dưới 歯科疾患管理料', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        await seedTestPatient({ patNo: PAT_NO })
        await seedTreatmentRows(PAT_NO, INITIAL_VISIT_DT, [
            { trtCd: TRT_CD_SHOSHIN, trtSb: 0, trtPt: 267, dspTrt: '歯科初診料' },
        ])
    })

    test.afterAll(async () => {
        if (page && !page.isClosed()) await closeDialogs(page)
        await releaseSharedPage(page)
        await deleteTestPatient(PAT_NO)
    })

    test('TC-1 chọn ở 摘要選択 → dòng comment ngay dưới 歯管 và là dòng cuối ngày', async () => {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await tenCell(page).last().waitFor({ state: 'visible', timeout: 60_000 })

        await expect(
            dentureDialog(page),
            'pack 歯管-有床義歯 không bung — tenant phải đăng ký 116/7 trong TRTAUTO và có pack B000-4.',
        ).toBeVisible({ timeout: 30_000 })
        // 初診 đã nằm ở tháng trước ⇒ 再診, không có hỏi 初診.
        await expect(santeiDialog(page)).toHaveCount(0)
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
