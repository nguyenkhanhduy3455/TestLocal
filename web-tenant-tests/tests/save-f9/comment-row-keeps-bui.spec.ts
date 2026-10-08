import { type Page } from '@playwright/test'

import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { allowSave, TODAY_ISO, trtDt } from '../_shared/env'

/**
 * F9 登録 — dòng 摘要コメント GIỮ 部位/病名 của nhóm (P-018 trong tools/parity-snapshot/FINDINGS.md).
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  `frmInpMain.AddRow` LUÔN gọi `ModMain.AutoBui` (frm203002.cs:3805/3811): chép cột 部位/病名
 *  (8..49) của dòng kề sang dòng mới — kể cả dòng 摘要コメント / 加算 / IS. Dữ liệu thật (TRNTRN
 *  toàn bảng): không có dòng 6/26/700-899 nào đứng sau dòng CÓ 部位 mà bị lưu mất 部位.
 *  Khi nạp lại tháng, 部位/病名 nằm sẵn trong cột ⇒ F9 ghi lại y nguyên.
 *
 * ─── Bug web trước khi sửa ───────────────────────────────────────────────────
 *  `buildSaveRowsIndexed` bỏ 部位/病名 của mọi mã 6/26/700-899 (`isBuiLessByDesign`) ⇒ chỉ cần
 *  mở tháng rồi F9 KHÔNG sửa gì, các dòng コメント cũ đang đúng mất sạch 部位/病名. Màn hình sau
 *  khi nạp lại vẫn y hệt nên không ai thấy.
 *
 * ─── Dữ liệu (TEST_DB=1, TEST_ALLOW_SAVE=1) ──────────────────────────────────
 *  Bệnh nhân seed riêng (SEED_PAT_NO_BASE + 84), ngày 15 tháng trước (tránh 自動算定 của hôm
 *  nay): 再診 (không 部位) → 316-0 補綴前処置 + hai dòng 6-0 コメント, cùng 部位 7654321|1234567 /
 *  病名 393 — đúng hình dạng của bệnh nhân thật 9 tháng 2026-07 đã tái hiện bug. afterAll xoá hẳn.
 *
 *   npx playwright test tests/save-f9/comment-row-keeps-bui.spec.ts
 */

const PAT_NO = SEED_PAT_NO_BASE + 84
const [Y, M] = trtDt(TODAY_ISO).split('-').map(Number) as [number, number]
const TRT_DT = M === 1 ? `${Y - 1}-12-15` : `${Y}-${String(M - 1).padStart(2, '0')}-15`

/** 7654321|1234567 — bui_2..bui_8 (trên phải) và bui_9..bui_15 (trên trái) = 1. */
const BUI = Array.from({ length: 32 }, (_, k) => (k >= 1 && k <= 14 ? 1 : 0))
const DIS_CD = 393
const DSP_BUI = '7654321|1234567'
const DSP_DIS = 'MT'
const COMMENT_CD = 6
const group = { bui: BUI, disCd: [DIS_CD], dspBui: DSP_BUI, dspDis: DSP_DIS }

const GRID_LOAD_TIMEOUT = 60_000

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân')
test.skip(!allowSave, 'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 (ghi DB của bệnh nhân seed)')

test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.describe('F9 登録 — dòng 摘要コメント giữ 部位/病名 (ModMain.AutoBui)', () => {
    let page: Page
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Dòng 処置 còn sống của ngày test, theo trt_cd. */
    async function savedRows(trtCd: number) {
        return withDb(async (c) => {
            const r = await c.query<{ dis_cd_1: number; dsp_bui: string; dsp_dis: string; bui_2: number; bui_15: number }>(
                `SELECT dis_cd_1, dsp_bui, dsp_dis, bui_2, bui_15
                   FROM trn_trn
                  WHERE pat_no = $1 AND trt_dt = $2 AND trt_cd = $3
                  ORDER BY disp_no`,
                [PAT_NO, TRT_DT, trtCd],
            )
            return r.rows
        })
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: PAT_NO, accRate: 30 })
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: 110, trtSb: 0, trtPt: 59, dspTrt: '歯科再診料' },
            { trtCd: 316, trtSb: 0, trtPt: 50, dspTrt: '補綴前処置', ...group },
            { trtCd: COMMENT_CD, trtSb: 0, trtPt: 0, dspTrt: 'リカントゥアリング', ...group },
            { trtCd: COMMENT_CD, trtSb: 0, trtPt: 0, dspTrt: '補綴前処置前回算定年月日', ...group },
        ])
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await deleteTestPatient(PAT_NO).catch(() => {})
    })

    test('TC-0 (mốc) — seed: hai dòng コメント mang 部位/病名 của nhóm', async () => {
        const rows = await savedRows(COMMENT_CD)
        expect(rows).toHaveLength(2)
        for (const r of rows) expect(Number(r.dis_cd_1)).toBe(DIS_CD)
    })

    test('TC-1 — F9 KHÔNG sửa gì: dòng コメント vẫn giữ 部位/病名 sau khi lưu', async () => {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-grid-cell$="|2"]').filter({ hasText: '補綴前処置' }).first()).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })

        await page.keyboard.press('F9')
        const box = page.locator('[role="dialog"],[role="alertdialog"]').filter({ hasText: '保存しますか' })
        await expect(box).toBeVisible({ timeout: 15_000 })
        await box.getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await expect(page).not.toHaveURL(/\/treatments\/\d+/, { timeout: 30_000 })

        const comments = await savedRows(COMMENT_CD)
        expect(comments, 'F9 phải ghi lại đủ hai dòng コメント').toHaveLength(2)
        for (const r of comments) {
            expect(Number(r.dis_cd_1), 'dis_cd_1 của dòng コメント (bug cũ: 0)').toBe(DIS_CD)
            expect(r.dsp_dis.trim(), 'dsp_dis của dòng コメント (bug cũ: rỗng)').toBe(DSP_DIS)
            expect(r.dsp_bui.trim(), 'dsp_bui của dòng コメント (bug cũ: rỗng)').not.toBe('')
            expect([Number(r.bui_2), Number(r.bui_15)], 'bui của dòng コメント (bug cũ: toàn 0)').toEqual([1, 1])
        }
        // Đối chứng: dòng 処置 cùng nhóm cũng giữ — hai bên phải như nhau.
        const [trt] = await savedRows(316)
        expect(Number(trt!.dis_cd_1)).toBe(DIS_CD)
    })
})
