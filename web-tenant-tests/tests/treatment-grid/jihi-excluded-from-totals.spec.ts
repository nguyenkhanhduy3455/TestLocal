import { type Page } from '@playwright/test'

import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import {
    SEED_PAT_NO_BASE,
    dayScoreByJihiFlg,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { TODAY_ISO, trtDt } from '../_shared/env'
import { makeStep } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — dòng 自費 (jihi_flg 1/2) phải nằm NGOÀI mọi con số bảo hiểm của màn
 * hình: 合計 / 実日数 ở header, 【負担金】【日計】 từng ngày, dòng 「◯月 合計」 của
 * tháng cũ.
 *
 * Bug gốc (2026-10-05): bệnh nhân 12138, cùng thao tác nhập 「矯正　処置料」 (456-5,
 * 4950点) — WinForm hiện 合計 1,125点 / 負担金 2,250円, web hiện 6,075点 / 12,150円.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - COMMON/Lib/buiPrice.cs:253-323 `getInsInfo2` — `switch (trtData.jihi_flg)`
 *    chỉ cộng `score` và chỉ bật `actual_days` (初再診) ở `case 0`; 1/2/3 rơi vào
 *    `default: break`. `insDays` (:698-702) chỉ đếm ngày có `actual_days`.
 *  - INP/Lib/modAcc.cs:107-121 `Calc_MDPoint` (合計 + 実日数 header) và :132-212
 *    `DispDayPoint` (【負担金】【日計】) chỉ đọc `insPayDatas` ⇒ ngày chỉ có 自費
 *    hiện 【負担金 0円】【日計 0点】 và không tính vào 実日数.
 *  - INP/Lib/modMain.cs:362 — lúc nhập, `jihi_flg = mst_trt.own_kbn`. 456-5 có
 *    own_kbn = 2 (内税, 4950点) từ mst_trt version 31; bản cũ (≤ 30) là 1 (4500点).
 *    Seed cả jihi_flg 1 lẫn 2 để phủ hai loại 自費.
 *
 * ─── Port web (đọc 2026-10-05, origin/dev e92e3651a) ──────────────────────────
 *  BE đã lọc đúng (BuiPriceService.cs:233, AccUnitCalculator.cs:53). Lỗi nằm ở FE,
 *  các vòng cộng chỉ loại 介護 (jihi_flg 3):
 *   · treatment-entry-detail.tsx:3152-3168 — 合計 header + dayTotal, mà dayTotal
 *     lại là `customInsScore` gửi BE ⇒ 負担金 HÔM NAY sai theo (BE tin số FE gửi).
 *   · treatment-entry-detail.tsx `totalDays` — đếm MỌI ngày có 処置.
 *   · registration-table.tsx:443 — 【日計】 của TỪNG ngày.
 *   · treatment-table-mapper.ts:157 — 「◯月 合計」 tháng cũ (+ 履歴 panel).
 *   · treatment-grid-rows.ts:566-572 — totalPoints.
 *  負担金 các ngày KHÁC hôm nay lấy từ BE (monthly-copayments, đọc trn_trn) nên
 *  kỳ vọng đúng sẵn — step (c) giữ để chặn hồi quy.
 *
 * ─── Dữ liệu (cần TEST_DB=1) ──────────────────────────────────────────────────
 *  Bệnh nhân seed riêng (SEED_PAT_NO_BASE + 81). 再診 = 110-0 59点 (jihi 0),
 *  矯正 = 456-5 4950点:
 *      DAY_A (hôm nay)       再診 + 矯正(jihi 1) + 矯正(jihi 2)
 *      DAY_B (cùng tháng)    再診 + 矯正(jihi 2)
 *      DAY_C (cùng tháng)    矯正(jihi 2)              ← ngày chỉ có 自費
 *      PREV  (ngày 15 tháng trước) 再診 + 矯正(jihi 2)
 *  WinForm: 合計 = 118点, 実日数 = 2日, 日計 A/B = 59, C = 0, tháng trước = 59点.
 *  `afterAll` xoá hẳn bệnh nhân. Không bấm F9.
 *
 * ─── Ghi chú ──────────────────────────────────────────────────────────────────
 *  · TC-2 gom mọi chỗ thành test.step + expect.soft: serial ⇒ test đỏ làm SKIP
 *    test sau, mà spec này cần thấy ĐỦ các chỗ lệch trong một lần chạy.
 *  · 負担金 không hard-code số tiền (tỷ lệ do BE suy ra): chỉ assert điều kiện cần
 *    負担金 ≤ 10円 × 点数 bảo hiểm.
 *  · Step (e) nhập tay 456-5 ⇒ làm bẩn lưới (không lưu) nên nằm CUỐI. Nó kiểm luôn
 *    đường nhập có mang jihi_flg = own_kbn hay không: khi các vòng cộng đã sửa,
 *    合計 vẫn đổi sau khi nhập nghĩa là dòng mới bị gán jihi_flg 0.
 *
 *   npx playwright test tests/treatment-grid/jihi-excluded-from-totals.spec.ts
 */

const PAT_NO = SEED_PAT_NO_BASE + 81
/** Hôm nay: lưới mở tháng hiện hành. */
const TRT_DT = trtDt(TODAY_ISO)

const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const [Y, M, D] = TRT_DT.split('-').map(Number) as [number, number, number]
/** Hai ngày khác hôm nay trong cùng tháng (1..3 luôn tồn tại). */
const [DAY_B, DAY_C] = [1, 2, 3].filter((d) => d !== D) as [number, number]
const PREV_DT = M === 1 ? iso(Y - 1, 12, 15) : iso(Y, M - 1, 15)

const INS_ROW = { trtCd: 110, trtSb: 0, trtPt: 59, nm: '再診' } as const
const JIHI_ROW = { trtCd: 456, trtSb: 5, trtPt: 4950, nm: '矯正　処置料' } as const
/** TRNTRN.JIHI_FLG: 0 = 保険, 1 = 自費(外税), 2 = 自費(内税), 3 = 介護. */
const JIHI_FLG_INS = 0
const JIHI_FLG_GAIZEI = 1
const JIHI_FLG_UCHIZEI = 2

const ins = { trtCd: INS_ROW.trtCd, trtSb: INS_ROW.trtSb, trtPt: INS_ROW.trtPt, trtCnt: 1, jihiFlg: JIHI_FLG_INS, dspTrt: INS_ROW.nm }
const jihi = (jihiFlg: number) => ({ trtCd: JIHI_ROW.trtCd, trtSb: JIHI_ROW.trtSb, trtPt: JIHI_ROW.trtPt, trtCnt: 1, jihiFlg, dspTrt: JIHI_ROW.nm })

/**
 * 当日来患 (GET /tenant/treatment/today) chỉ liệt kê bệnh nhân có `trn_status` của
 * tháng (INNER JOIN, TreatmentQueries.GetTodayTreatmentAsync) — dòng này do F9 登録
 * ghi ra, seed trn_trn thì không. `deleteTestPatient` không dọn bảng này nên spec tự
 * xoá. `pat_no >= SEED_PAT_NO_BASE` ⇒ không đụng bệnh nhân thật.
 */
async function setTrnStatus(present: boolean): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM trn_status WHERE pat_no = $1', [PAT_NO])
        if (!present) return
        const ym = TRT_DT.slice(0, 7).replace('-', '')
        await c.query(
            `INSERT INTO trn_status (pat_no, pat_sb, sinryo_ym, seikyu_ym, miraiin_kbn, jihi_flg)
             VALUES ($1, 1, $2, $2, 0, 0)`,
            [PAT_NO, ym],
        )
    })
}

/** 1点 = 10円 — mức trần của 負担金 cho mỗi điểm bảo hiểm. */
const YEN_PER_POINT = 10

const GRID_LOAD_TIMEOUT = 60_000

const txt = (s: string) => s.normalize('NFKC').replace(/\s+/g, '')
const num = (s: string) => Number(s.replace(/,/g, ''))

/** Một dòng 【負担金 N円】【日計 M点】 của lưới, theo thứ tự DOM (ngày tăng dần). */
interface DayBand {
    burden: number
    dayTotal: number
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân + 処置行 自費')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 自費 (jihi_flg 1/2) nằm ngoài 合計/実日数/日計/負担金 (buiPrice.getInsInfo2)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined
    /** Σ 点数×回数 bảo hiểm đã lưu, theo ngày — con số WinForm hiện. */
    const insScore: Record<string, number> = {}
    /** Origin + header auth bóc từ request của app — để gọi thẳng BE (GUIDELINE 10.2). */
    let apiOrigin = ''
    let authHeaders: Record<string, string> = {}
    /** Body POST của app, để soi jihiFlg của dòng vừa nhập tay ở step (e). */
    const postBodies: { url: string; body: string }[] = []

    const headerBox = (re: RegExp) => page.locator('div.bg-blue-50').filter({ hasText: re }).first()

    async function dayBands(): Promise<DayBand[]> {
        const texts = await page.getByText(/^【負担金\s*[\d,]+\s*円】\s*【日計\s*[\d,]+\s*点】$/).allInnerTexts()
        return texts.map((t) => {
            const s = txt(t)
            return {
                burden: num(s.match(/【負担金([\d,]+)円】/)?.[1] ?? 'NaN'),
                dayTotal: num(s.match(/【日計([\d,]+)点】/)?.[1] ?? 'NaN'),
            }
        })
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: PAT_NO, accRate: 30 })
        const seeds: [string, Parameters<typeof seedTreatmentRows>[2]][] = [
            [TRT_DT, [ins, jihi(JIHI_FLG_GAIZEI), jihi(JIHI_FLG_UCHIZEI)]],
            [iso(Y, M, DAY_B), [ins, jihi(JIHI_FLG_UCHIZEI)]],
            [iso(Y, M, DAY_C), [jihi(JIHI_FLG_UCHIZEI)]],
            [PREV_DT, [ins, jihi(JIHI_FLG_UCHIZEI)]],
        ]
        for (const [dt, rows] of seeds) {
            await seedTreatmentRows(PAT_NO, dt, rows)
            insScore[dt] = await dayScoreByJihiFlg(PAT_NO, dt, { eq: JIHI_FLG_INS })
        }
        await setTrnStatus(true)
        console.log(`seed: ${JSON.stringify(insScore)} (A=${TRT_DT}, B=${DAY_B}, C=${DAY_C}, PREV=${PREV_DT})`)

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (h['authorization']) {
                apiOrigin = u.slice(0, i)
                authHeaders = Object.fromEntries(
                    Object.entries(h).filter(([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept'),
                )
            }
            const body = req.postData()
            if (req.method() === 'POST' && body) postBodies.push({ url: u.slice(i), body })
        })

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-grid-cell$="|2"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await closeDialogs(page)
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await setTrnStatus(false).catch(() => {})
        await deleteTestPatient(PAT_NO).catch(() => {})
    })

    test('TC-1 (mốc) — dữ liệu seed đã lên lưới tháng hiện hành', async () => {
        const texts = (await page.locator('[data-grid-cell$="|2"]').allInnerTexts()).map(txt)
        // Tháng hiện hành: 2 再診 (A, B) + 4 矯正 (A×2, B, C). Tháng trước có thể bị
        // virtualize nên chỉ đòi "ít nhất".
        expect(texts.filter((t) => t.includes(txt(INS_ROW.nm))).length, `lưới: ${texts.join(' / ')}`).toBeGreaterThanOrEqual(2)
        expect(texts.filter((t) => t.includes(txt(JIHI_ROW.nm))).length, `lưới: ${texts.join(' / ')}`).toBeGreaterThanOrEqual(4)
        expect(insScore[TRT_DT], 'DB: 59点 bảo hiểm ngày A').toBe(INS_ROW.trtPt)
        expect(insScore[iso(Y, M, DAY_C)], 'DB: ngày C không có điểm bảo hiểm').toBe(0)
        await step()
    })

    test('TC-2 — mọi con số bảo hiểm trên màn hình loại 自費 ra (mỗi chỗ một step, soft)', async () => {
        await test.step('(a) header 合計 / 実日数 chỉ tính bảo hiểm (modAcc.Calc_MDPoint)', async () => {
            const expectedTotal = insScore[TRT_DT]! + insScore[iso(Y, M, DAY_B)]!
            const totalBox = headerBox(/^\s*[\d,]+\s*点\s*$/)
            const daysBox = headerBox(/^\s*\d+\s*日\s*$/)
            await expect(totalBox).toBeVisible()
            const total = num(txt(await totalBox.innerText()).replace('点', ''))
            const days = num(txt(await daysBox.innerText()).replace('日', ''))
            console.log(`header: 合計 = ${total}点, 実日数 = ${days}日 — kỳ vọng ${expectedTotal}点 / 2日`)

            expect.soft(total, `合計 cộng cả 自費 (4 dòng × ${JIHI_ROW.trtPt}点)`).toBe(expectedTotal)
            expect.soft(days, `実日数 đếm cả ngày ${DAY_C} (chỉ có 自費, không có 初再診)`).toBe(2)
            await step()
        })

        await test.step('(b) 【日計】 từng ngày chỉ tính bảo hiểm (modAcc.DispDayPoint)', async () => {
            const bands = await dayBands()
            const byDay = new Map<number, DayBand>()
            // Footer theo thứ tự ngày tăng dần; tháng hiện hành có đúng 3 ngày seed.
            const days = [D, DAY_B, DAY_C].sort((a, b) => a - b)
            console.log(`bands: ${JSON.stringify(bands)} ↔ ngày ${days.join(',')}`)
            expect.soft(bands, 'phải có đúng 3 dòng 【負担金】【日計】 (3 ngày của tháng hiện hành)').toHaveLength(3)
            days.forEach((d, i) => byDay.set(d, bands[i]!))

            expect.soft(byDay.get(D)?.dayTotal, `日計 ngày ${D} (hôm nay)`).toBe(insScore[TRT_DT])
            expect.soft(byDay.get(DAY_B)?.dayTotal, `日計 ngày ${DAY_B}`).toBe(insScore[iso(Y, M, DAY_B)])
            expect.soft(byDay.get(DAY_C)?.dayTotal, `日計 ngày ${DAY_C} (chỉ 自費 ⇒ WinForm 0点)`).toBe(0)
            await step()
        })

        await test.step('(c) 【負担金】 từng ngày không tính trên 自費', async () => {
            const bands = await dayBands()
            const days = [D, DAY_B, DAY_C].sort((a, b) => a - b)
            const byDay = new Map(days.map((d, i) => [d, bands[i]!] as const))
            const cap = (dt: string) => insScore[dt]! * YEN_PER_POINT

            // Hôm nay: số FE gửi BE (customInsScore) — chỗ bug lộ ra trên ảnh chụp.
            expect.soft(byDay.get(D)?.burden, `負担金 hôm nay > 10円 × ${insScore[TRT_DT]}点`).toBeLessThanOrEqual(cap(TRT_DT))
            // Ngày khác: BE tự tính từ trn_trn — chặn hồi quy.
            expect.soft(byDay.get(DAY_B)?.burden, `負担金 ngày ${DAY_B}`).toBeLessThanOrEqual(cap(iso(Y, M, DAY_B)))
            expect.soft(byDay.get(DAY_C)?.burden, `負担金 ngày ${DAY_C} (chỉ 自費)`).toBe(0)
            await step()
        })

        await test.step('(d) dòng 「◯月 合計」 tháng trước chỉ tính bảo hiểm', async () => {
            const summary = page.getByText(/^実日数:\s*\d+日\s*[\d,]+\s*点$/).first()
            await summary.scrollIntoViewIfNeeded()
            await expect(summary, 'không thấy dòng 合計 của tháng trước').toBeVisible()
            const s = txt(await summary.innerText())
            const [, days, points] = s.match(/^実日数:(\d+)日([\d,]+)点$/) ?? []
            console.log(`tháng trước: ${s} — kỳ vọng 1日 ${insScore[PREV_DT]}点`)

            expect.soft(num(points ?? 'NaN'), '合計 tháng trước cộng cả 自費').toBe(insScore[PREV_DT])
            expect.soft(num(days ?? 'NaN'), '実日数 tháng trước').toBe(1)
            await step()
        })

        await test.step('(f) panel 履歴 「1 前回来院月」 — dòng 「◯月 合計」 chỉ tính bảo hiểm', async () => {
            await page.getByRole('button', { name: '履歴(&R)' }).click()
            await page.getByRole('button', { name: '履歴を表示' }).click()
            await page.getByRole('button', { name: '1 前回来院月' }).click()
            const summaries = page.getByText(/^実日数:\s*\d+日\s*[\d,]+\s*点$/)
            // Lưới đã có 1 dòng 合計 tháng trước; panel 履歴 thêm 1 dòng nữa.
            await expect(summaries, 'panel 履歴 không hiện dòng 合計 tháng trước').toHaveCount(2, { timeout: 15_000 })
            const values = (await summaries.allInnerTexts()).map(txt)
            console.log(`履歴: ${values.join(' | ')} — kỳ vọng ${insScore[PREV_DT]}点`)
            for (const v of values) {
                const points = num(v.match(/日([\d,]+)点$/)?.[1] ?? 'NaN')
                expect.soft(points, `「${v}」 cộng cả 自費`).toBe(insScore[PREV_DT])
            }
            await step()
        })

        await test.step('(g) BE: 入金指定 (daily-summary) + 当日来患 (F4) chỉ tính bảo hiểm', async () => {
            expect(apiOrigin, 'chưa bắt được request nào của app để lấy origin + token').not.toBe('')
            // Không gửi `rows` ⇒ BE đọc trn_trn đã lưu. Gửi rows thì đi cùng BuiPriceService.
            const ds = await page.request.post(`${apiOrigin}/tenant/treatment/accounting/daily-summary`, {
                headers: authHeaders,
                data: { patNo: PAT_NO, trtDt: TRT_DT, raiinCnt: 1 },
            })
            expect(ds.ok(), `daily-summary ${ds.status()}: ${await ds.text()}`).toBe(true)
            const sum = (await ds.json()).data
            console.log(`daily-summary: insScore=${sum.insScore}, insPrice=${sum.insPrice}, jihiPrice=${sum.jihiPrice}`)
            expect.soft(Number(sum.insScore), '入金指定 保険点数').toBe(insScore[TRT_DT])
            expect.soft(Number(sum.insPrice), '入金指定 医療保険').toBeLessThanOrEqual(insScore[TRT_DT]! * YEN_PER_POINT)
            expect.soft(Number(sum.jihiPrice), '入金指定 自費 phải > 0 (2 dòng 矯正)').toBeGreaterThan(0)

            const tv = await page.request.get(
                `${apiOrigin}/tenant/treatment/today?trtDt=${TRT_DT}&page=1&pageSize=1000`,
                { headers: authHeaders },
            )
            expect(tv.ok(), `today ${tv.status()}: ${await tv.text()}`).toBe(true)
            const items: { patNo: number | string; insScore: number | string; insPrice: number | string }[] =
                (await tv.json()).data.items ?? []
            const me = items.find((r) => Number(r.patNo) === PAT_NO)
            console.log(`当日来患: ${JSON.stringify(me)}`)
            expect.soft(me, `当日来患 không có bệnh nhân ${PAT_NO}`).toBeDefined()
            expect.soft(Number(me?.insScore), '当日来患 保険点数').toBe(insScore[TRT_DT])
            expect.soft(Number(me?.insPrice), '当日来患 保険負担額').toBeLessThanOrEqual(insScore[TRT_DT]! * YEN_PER_POINT)
            await step()
        })

        await test.step('(e) nhập tay 456-5 — dòng mới mang jihiFlg ≠ 0 và không làm đổi 合計 bảo hiểm', async () => {
            // LÀM BẨN LƯỚI (dòng chưa lưu) ⇒ PHẢI nằm cuối. Không bấm F9 登録.
            const totalBox = headerBox(/^\s*[\d,]+\s*点\s*$/)
            const bodiesBefore = postBodies.length
            const before = num(txt(await totalBox.innerText()).replace('点', ''))

            const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
            const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
            const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

            await footerTen.scrollIntoViewIfNeeded()
            if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
            await expect(modeBtn).toHaveText('コード')

            await footerTen.click()
            await footerTen.fill(String(JIHI_ROW.trtCd))
            await footerTen.press('Enter')
            await expect(footerTen, 'Enter chưa được xử lý').toHaveValue('')
            await expect(trtPicker, `mã ${JIHI_ROW.trtCd} không mở 処置選択`).toBeVisible({ timeout: 20_000 })

            const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
            const idx = sbTexts.findIndex((t) => Number(t.trim()) === JIHI_ROW.trtSb)
            expect(idx, `処置選択 không có 枝番 ${JIHI_ROW.trtSb}`).toBeGreaterThanOrEqual(0)
            await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
            await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
            await expect(trtPicker).toBeHidden({ timeout: 15_000 })

            // 確定 chỉ đưa dòng vào trạng thái chờ 回数 — Enter ô 回 đang focus để chốt.
            const editing = page.locator('input:focus')
            await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', { timeout: 20_000 })
            await page.keyboard.press('Enter')
            await closeDialogs(page)

            const texts = (await page.locator('[data-grid-cell$="|2"]').allInnerTexts()).map(txt)
            expect(texts.filter((t) => t.includes(txt(JIHI_ROW.nm))).length, 'dòng 矯正 vừa nhập phải lên lưới').toBeGreaterThanOrEqual(5)

            // jihiFlg của các dòng 456-5 trong mọi body POST app gửi SAU khi nhập.
            // Seed có {1,2,2,2} ⇒ dòng mới là phần còn lại; chỉ cần không có 0.
            const seen = postBodies.slice(bodiesBefore).flatMap(({ url, body }) => {
                const flags: number[] = []
                JSON.parse(body, (_k, v) => {
                    if (v && typeof v === 'object' && Number(v.trtCd) === JIHI_ROW.trtCd && Number(v.trtSb) === JIHI_ROW.trtSb && 'jihiFlg' in v) {
                        flags.push(Number(v.jihiFlg))
                    }
                    return v
                })
                return flags.length ? [{ url, flags }] : []
            })
            console.log(`POST sau khi nhập tay mang 456-5: ${JSON.stringify(seen)}`)
            if (seen.length > 0) {
                expect.soft(seen.at(-1)!.flags, 'dòng 456-5 nhập tay phải mang jihiFlg = own_kbn (2), không phải 0').not.toContain(JIHI_FLG_INS)
            }

            const after = num(txt(await totalBox.innerText()).replace('点', ''))
            console.log(`合計 trước/sau khi nhập tay 456-5: ${before} → ${after}`)
            expect(after, `nhập thêm 1 dòng 自費 mà 合計 đổi ${before} → ${after}`).toBe(before)
            await step()
        })
    })
})
