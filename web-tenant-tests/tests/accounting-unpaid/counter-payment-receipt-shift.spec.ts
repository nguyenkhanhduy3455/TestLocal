/**
 * 窓口精算 (frm204002) — G9: hành vi bên trong của F1 領収書発行 (領収書印刷 = frm204004 gType.Print),
 * Shift+F5 患者登録, Shift+F6 カルテ, 申し送り, 保険証確認.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — WinForm
 * ═══════════════════════════════════════════════════════════════════════════
 *  - 申し送り (frm204002.cs:255-295, PatMsg.cs:43-65): PATMSG có update_dt = 診療日 của dòng 未精算 cuối;
 *      msg1..msg10 khác "" đều vào ListBox (`setItem` :829-835) — chuỗi toàn dấu cách vẫn là một dòng.
 *  - 保険証確認 (getPatInfo :670-760): conf_dt trống ⇒ đo được 「保険証確認 」 (FlaUI G9a); có ⇒ 「保険証確認 」 + EraTbl.getWrekiKnji
 *      = ERA_TBL.ERA_NAME (「令和」) + yy年MM月dd日 (EraTbl.cs:119-131).
 *  - F1 ⇒ frm204004 Print (frm204004.cs:80-98, 264-277, 402-406): phím F1 領収書印刷 / F2 精算済ﾖﾘ /
 *      F3 診療内容ﾖﾘ / F5 明細書印刷 / F10 戻る; 精算日 từ–đến và 領収書発行日 = hôm nay; lưới = ACCDAT hôm nay.
 *      F3 (:1217-1340) dựng lại từ 処置: 精算日/連番 trống. 精算日 sai ⇒ E00002 「精算日が間違っています。」
 *      (:437-473). 合計金額 = 保険+自費+自費税+物品+物品税 (calcTotal :1377-1387). F10 không hỏi.
 *  - Shift+F5 (:985-991) / Shift+F6 (:1009-1015) ⇒ `callProj`: KHÔNG hỏi gì, ẨN 窓口精算 (Hide) rồi mở màn
 *      mới — quay về thì instance cũ hiện lại, dữ liệu đang gõ còn nguyên (suy từ Hide/Show, xác nhận bằng FlaUI).
 *  - Trong 患者登録 mở từ 精算: F11 患者選択 (frm201001.cs:714-728) đi tới 患者選択 frm201008, KHÔNG về 精算.
 *
 * Dữ liệu: 990920 (med_ins_inf fm_type 1, 30%), trn_trn hôm nay 209/40, unpaid 保険 300点/900円 (D1 50, D9 250)
 * + 自費 5000/税500, acc_dat hôm nay 保険 900, pat_msg update_dt hôm nay 「申送り一」「申送り二」「 」.
 * Không bấm F9 窓口精算; F1 in đi qua stub agent (không in thật). afterAll xoá sạch.
 */
import { type Locator, type Page } from '@playwright/test'

import { routeAgentPrint, type AgentPrintStub } from '../_shared/agent-print'
import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { GRID_LOAD_ATTEMPTS } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

const PAT_NO = SEED_PAT_NO_BASE + 920
const TODAY = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
// Ô ngày 和暦 của 領収書印刷 (令和 năm / tháng / ngày, không đệm 0) — 令和 1 = 2019.
const TODAY_BOXES: [string, string, string] = [String(Number(TODAY.slice(0, 4)) - 2018), String(Number(TODAY.slice(5, 7))), String(Number(TODAY.slice(8, 10)))]
const SCREEN_LOAD_TIMEOUT = 60_000
const TABLES = ['unpaid', 'unpaid_deleted', 'acc_dat', 'acc_dat_deleted', 'pat_msg', 'pat_msg_deleted', 'med_ins_inf', 'med_ins_inf_deleted']

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: spec tự seed bệnh nhân + unpaid + acc_dat riêng')
test.describe.configure({ retries: 0, timeout: 180_000 })

test.beforeAll(async () => {
    if (!dbEnabled) return
    await seedTestPatient({ patNo: PAT_NO, patNm: 'セイサン　ナイブ', patKn: 'せいさん　ないぶ' })
    await seedTreatmentRows(PAT_NO, TODAY, [{ trtCd: 209, trtSb: 0, trtCnt: 1, trtPt: 40, dspTrt: '処置-G9' }])
    await withDb(async (c) => {
        for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [PAT_NO])
        await c.query('INSERT INTO med_ins_inf (pat_no, medinsinf_no, fm_type, ben_rate) VALUES ($1, 1, 1, 70)', [PAT_NO])
        await c.query('UPDATE insurance SET medinsinf_no = 1, bur_rate = 30, acc_rate = 30 WHERE pat_no = $1', [PAT_NO])
        const unpaid = `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax, rece_amt, rece_kbn,
                                            sflg, att_dr, acc_tm, pat_br, lflg, score_d_1, score_d_9)
                        VALUES ($1::date, 1, $2, $3, $4, $5, 0, $6, -1, 1, 1, 1, now(), 1, 0, $7, $8)`
        await c.query(unpaid, [TODAY, PAT_NO, 40, 300, 900, 0, 50, 250])
        await c.query(unpaid, [TODAY, PAT_NO, 50, 0, 5000, 500, 0, 0])
        await c.query(
            `INSERT INTO pat_msg (pat_no, msg_1, msg_2, msg_3, update_dt, created_at, updated_at)
             VALUES ($1, '申送り一', '申送り二', ' ', $2::date, now(), now())`,
            [PAT_NO, TODAY],
        )
        await c.query(
            `INSERT INTO acc_dat (acc_dt, acc_cnt, trt_dt, trt_cnt, pat_no, km_cd, score, claim_amt, discount, tax,
                                  accr_amt, accr_tax, appr_amt, appr_tax, rece_amt, rece_tax, rece_kbn, pflg, sflg,
                                  gds_cd, gds_cnt, att_dr, acc_tm, meds, tflg,
                                  score_d_1, score_d_2, score_d_3, score_d_4, score_d_5, score_d_6, score_d_7,
                                  score_d_8, score_d_9, score_d_10, score_d_11, score_d_12, score_d_13, score_d_14,
                                  pat_br, lflg, gds_sb, created_at, updated_at)
             VALUES ($1::date, 1, $1::date, 1, $2, 40, 300, 900, 0, 0, 0, 0, 0, 0, 900, 0, 1, 0, 2,
                     0, 0, 1, now(), 0, 0, 50, 0, 0, 0, 0, 0, 0, 0, 250, 0, 0, 0, 0, 0, 1, 0, 0, now(), now())`,
            [TODAY, PAT_NO],
        )
    })
})

test.afterAll(async () => {
    if (!dbEnabled) return
    await withDb(async (c) => {
        for (const t of TABLES) await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [PAT_NO])
    })
    await deleteTestPatient(PAT_NO)
})

function helpers(getPage: () => Page) {
    const page = () => getPage()
    const fkey = (k: string): Locator => page().locator(`[data-fkey="${k}"]:visible`).last()
    const alert = (): Locator => page().getByRole('alertdialog').last()
    const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
    const block = (header: string): Locator =>
        page().getByText(header, { exact: true }).first().locator('xpath=ancestor::div[.//input][1]').locator('input')
    const claimTotal = (): Locator => block('請求金額').nth(0)
    const rece = (): Locator => block('本日入金').nth(0)
    const insConf = (): Locator => page().locator('input[placeholder="保険証確認"]')
    const receipt = (): Locator =>
        page().locator('dialog[open], [role="dialog"]').filter({ hasText: /領\s*収\s*書\s*印\s*刷/ }).last()
    /** Ô tiền trong khung 領収書印刷金額, theo nhãn. */
    const amount = (label: string): Locator =>
        receipt().getByText(label, { exact: true }).last().locator('xpath=following::input[1]')
    const num = async (box: Locator) => Number((await box.inputValue()).replace(/,/g, '') || '0')

    async function setShift(on: boolean): Promise<void> {
        const t = page().locator('main button[aria-pressed]:visible').first()
        if ((await t.getAttribute('aria-pressed')) !== String(on)) await t.click()
        await expect(t).toHaveAttribute('aria-pressed', String(on))
    }

    async function openDetail(): Promise<void> {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page().goto(`/counter-payments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            try {
                await expect(page().getByText('入金日').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
                await expect.poll(() => num(claimTotal()), { message: 'chờ unpaid nạp xong' }).toBe(6400)
                // Nạp xong 200ms sau màn mới focus ô đầu (自費/本日入金); gõ trước đó thì phím rơi vào ô đó.
                await expect
                    .poll(() => page().evaluate(() => document.activeElement?.tagName), { message: 'chờ focus ban đầu' })
                    .toBe('INPUT')
                return
            } catch (e) {
                lastErr = e
            }
        }
        throw lastErr
    }

    /** Dòng hiển thị của khối 申し送り (các ô chữ ngay dưới tiêu đề, trước 領収書印刷). */
    async function handover(): Promise<string[]> {
        const text = await page().locator('main').innerText()
        const after = text.split('申し送り')[1] ?? ''
        const lines = after.split('\n').map((l) => l.replace(/ /g, ' '))
        const end = lines.findIndex((l) => l.trim() === '領収書印刷')
        return lines.slice(1, end < 0 ? undefined : end)
    }
    return { fkey, alert, flat, claimTotal, rece, insConf, receipt, amount, num, setShift, openDetail, handover }
}

test.describe('窓口精算 G9 — 領収書印刷, Shift+F5/F6, 申し送り: hành vi', () => {
    test.describe.configure({ mode: 'serial' })

    let page: Page
    let step: () => Promise<void>
    let stub: AgentPrintStub
    const { fkey, alert, flat, claimTotal, receipt, amount, num, setShift, openDetail, handover } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        stub = await routeAgentPrint(page, 'direct')
    })

    test.afterAll(async () => {
        await stub.dispose()
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    test('S-1 — 申し送り: msg_1, msg_2 hiện đúng thứ tự (PATMSG update_dt = 診療日)', async () => {
        await openDetail()
        await step()
        const lines = (await handover()).filter((l) => l.trim() !== '')
        expect(lines.slice(0, 2)).toEqual(['申送り一', '申送り二'])
    })

    test('S-2 — F1 領収書発行: mở 領収書印刷, phím, ngày = hôm nay, lưới ACCDAT hôm nay, 保険金額 900', async () => {
        await fkey('F1').click()
        await expect(receipt()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await step()
        for (const [k, label] of [['F1', '領収書印刷'], ['F2', '精算済ﾖﾘ'], ['F3', '診療内容ﾖﾘ'], ['F10', '戻る']] as const) {
            await expect(receipt().locator(`[data-fkey="${k}"]`)).toContainText(label)
        }
        await expect(receipt()).toContainText(/該当件数:\s*1\s*件/, { timeout: SCREEN_LOAD_TIMEOUT })
        const text = flat(await receipt().innerText())
        expect(text).toContain('990920')
        expect(text).toContain('セイサン ナイブ')
        // 精算日 từ / đến + 領収書発行日 = hôm nay.
        const dateBoxes = await receipt().locator('input[maxlength="2"]').evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value))
        expect(dateBoxes).toEqual([...TODAY_BOXES, ...TODAY_BOXES, ...TODAY_BOXES])
        await expect.poll(() => num(amount('保険金額'))).toBe(900)
        expect(await num(amount('自費金額'))).toBe(0)
        expect(await num(amount('合計金額'))).toBe(900)
        expect(await num(amount('介護保険'))).toBe(0)
    })

    test('S-3 — F3 診療内容ﾖﾘ: dựng lại từ 処置 (精算日/連番 trống, 保険 = 40点×10×30% = 120); F2 trả về 900', async () => {
        await receipt().locator('[data-fkey="F3"]').click()
        await expect.poll(() => num(amount('保険金額'))).toBe(120)
        const row = flat(await receipt().innerText()).split('物品消費税 ')[1] ?? ''
        expect(row, 'dòng đầu lưới: 精算日 trống ⇒ bắt đầu bằng 診療日').toMatch(new RegExp(`^令0?${TODAY_BOXES[0]}年0?${TODAY_BOXES[1]}月0?${TODAY_BOXES[2]}日 120 `))
        await receipt().locator('[data-fkey="F2"]').click()
        await expect.poll(() => num(amount('保険金額'))).toBe(900)
    })

    test('S-4 — 合計金額 = 保険 + 自費 + 自費税 + 物品 + 物品税 sau khi sửa ô (calcTotal :1377-1387)', async () => {
        await amount('自費金額').fill('100')
        await amount('自費金額').press('Tab')
        await amount('物品金額').fill('30')
        await amount('物品金額').press('Tab')
        await expect.poll(() => num(amount('合計金額'))).toBe(1030)
        await receipt().locator('[data-fkey="F2"]').click()
        await expect.poll(() => num(amount('合計金額'))).toBe(900)
    })

    test('S-5 — F1 領収書印刷: gửi đúng một lệnh in với số tiền trên màn (stub agent, không in thật)', async () => {
        stub.reset()
        await receipt().locator('[data-fkey="F1"]').click()
        const job = await stub.waitForStart()
        const body = job.request.body as Record<string, unknown>
        expect(job.request.path).toMatch(new RegExp(`/tenant/report/${PAT_NO}/receipt`))
        if (job.request.path.includes('receipt-qr-input-datasource')) {
            expect(body).toMatchObject({ accDt: TODAY, hoken: 900, jihi: 0, buppin: 0, kaigo: 0, trtDtSt: TODAY, trtDtEnd: TODAY })
            expect((body.unitScores as number[])[0]).toBe(50)
            expect((body.unitScores as number[])[8]).toBe(250)
        }
        await expect(receipt(), 'in xong vẫn ở 領収書印刷').toBeVisible()
    })

    test('S-6 — 精算日 sai ⇒ F2 báo E00002 「精算日が間違っています。」 (frm204004.cs:437-473)', async () => {
        const fromDay = receipt().locator('input[maxlength="2"]').nth(2)
        await fromDay.fill('32')
        await fromDay.press('Tab')
        await receipt().locator('[data-fkey="F2"]').click()
        await expect(alert()).toBeVisible()
        expect(flat(await alert().innerText())).toContain('精算日が間違っています。')
        await alert().getByRole('button').first().click()
        await fromDay.fill(TODAY_BOXES[2])
        await fromDay.press('Tab')
    })

    test('S-7 — F10 戻る: không hỏi, về 窓口精算 với dữ liệu cũ', async () => {
        await receipt().locator('[data-fkey="F10"]').click()
        await expect(receipt()).toBeHidden()
        await expect(page.getByRole('alertdialog')).toHaveCount(0)
        expect(await num(claimTotal())).toBe(6400)
    })

    test('S-8 — Shift+F5 患者登録: mở 患者登録 của bệnh nhân này; F10 (chưa sửa) về 窓口精算', async () => {
        await setShift(true)
        await fkey('F5').click()
        await expect(page.getByText('≪患者番号：990920≫')).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await step()
        await page.locator('[data-fkey="F10"]:visible').last().click()
        await expect(page.getByText('≪患者番号：990920≫')).toBeHidden({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.getByText('入金日').first()).toBeVisible()
        expect(await num(claimTotal())).toBe(6400)
    })

    test('S-9 — Shift+F6 カルテ: sang カルテ印刷 của bệnh nhân; F10 về 窓口精算 của đúng bệnh nhân', async () => {
        await setShift(true)
        await fkey('F6').click()
        await expect(page).toHaveURL(new RegExp(`/medical-records/print\\?patNo=${PAT_NO}`), { timeout: SCREEN_LOAD_TIMEOUT })
        await step()
        await page.locator('[data-fkey="F10"]:visible').last().click()
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`), { timeout: SCREEN_LOAD_TIMEOUT })
        await expect.poll(() => num(claimTotal())).toBe(6400)
    })
})

test.describe('窓口精算 G9 — parity', () => {
    let page: Page
    const { fkey, insConf, rece, num, setShift, openDetail, handover } = helpers(() => page)

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
    })

    test.afterAll(async () => {
        await withDb((c) => c.query('UPDATE insurance SET conf_dt_1 = NULL WHERE pat_no = $1', [PAT_NO]))
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await releaseSharedPage(page)
    })

    // Đọc getPatInfo (:670-760) tưởng là 「保険証未確認」, nhưng ĐO WinForm (FlaUI G9a, 2026-10-27, CONF_DT1..6 NULL)
    // ra 「保険証確認 」 — khớp web. Đáp án theo số đo.
    test('Q-1 (parity) — 保険証確認 khi chưa có ngày xác nhận: 「保険証確認 」 (đo FlaUI G9a)', async () => {
        await withDb((c) => c.query('UPDATE insurance SET conf_dt_1 = NULL WHERE pat_no = $1', [PAT_NO]))
        await openDetail()
        await expect(insConf()).toHaveValue('保険証確認 ')
    })

    test('Q-2 (parity) — 保険証確認 có ngày: niên hiệu đầy đủ ERA_TBL.ERA_NAME 「令和」 (EraTbl.cs:119-131)', async () => {
        await withDb((c) => c.query(`UPDATE insurance SET conf_dt_1 = DATE '2026-10-01' WHERE pat_no = $1`, [PAT_NO]))
        await openDetail()
        await expect(insConf()).toHaveValue('保険証確認 令和08年10月01日')
    })

    test('Q-3 (parity) — 申し送り: msg toàn dấu cách vẫn là MỘT dòng (setItem :829-835 chỉ bỏ "")', async () => {
        await openDetail()
        const lines = await handover()
        expect(lines.length, `dòng 申し送り: ${JSON.stringify(lines)}`).toBe(3)
    })

    test('Q-4 (parity) — Shift+F5 患者登録 → F11 患者選択: sang 患者選択, không về 窓口精算 (frm201001.cs:714-728)', async () => {
        await openDetail()
        await setShift(true)
        await fkey('F5').click()
        await expect(page.getByText('≪患者番号：990920≫')).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await page.locator('[data-fkey="F11"]:visible').last().click()
        await expect(page.getByText('≪患者番号：990920≫')).toBeHidden({ timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.getByText('入金日'), 'F11 lại về 窓口精算').toHaveCount(0, { timeout: 5_000 })
    })

    test('Q-5 (parity) — Shift+F6 カルテ → F10: 窓口精算 giữ số đang gõ (Hide/Show, :1118-1127)', async () => {
        await openDetail()
        // Gõ như operator (chọn hết rồi gõ): `fill` trên ô số controlled này bị nối sau số cũ (「6400500」).
        await rece().click()
        await rece().press('ControlOrMeta+a')
        await rece().pressSequentially('500')
        await rece().press('Tab')
        expect(await num(rece()), 'trước khi rời màn, 本日入金 phải là 500').toBe(500)
        await setShift(true)
        await fkey('F6').click()
        await expect(page).toHaveURL(/\/medical-records\/print/, { timeout: SCREEN_LOAD_TIMEOUT })
        await page.locator('[data-fkey="F10"]:visible').last().click()
        await expect(page).toHaveURL(new RegExp(`/counter-payments/${PAT_NO}`), { timeout: SCREEN_LOAD_TIMEOUT })
        await expect(page.getByText('入金日').first()).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await page.waitForTimeout(1_500)
        expect(await num(rece())).toBe(500)
    })
})
