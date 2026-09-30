import { type Locator, type Page, type Route } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { openTreatmentEntry } from '../_shared/entry'
import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'
import { createTestPatient, dropTestPatient } from '../_shared/test-patient'

/**
 * F9 登録 — dòng 摘要コメント sinh ra từ コメントパック phải mang `freewd` đúng định
 * dạng WinForm (nhánh `fix/inp-kaigo-futan-guide-9908`).
 *
 * ─── FACT (WinForm, userapp/src/OCHACOM) ─────────────────────────────────────
 *  ・INP/Lib/CmtAuto.cs:3802 setOutData — `outData[72] = med_kbn + "," + data.freeWd`
 *    (cột 72 = trn_trn.freewd, med_kbn = mst_cmt_pack_def.med_kbn).
 *  ・CmtAuto.cs:3658 — dòng chọn ở frm203018: `data.freeWd = detail.com_cd + "," + pack_cd`.
 *  ・CmtAuto.cs:281-291 — ứng viên có コメントパターン 10 (`com_cd.Substring(1,2) == "10"`)
 *    mà pack có `com_cd[0]` thì THAY com_cd của ứng viên bằng com_cd[0] của pack.
 *  ・Người đọc lại: CommonChk.getTreatDataPackCd lấy `freewd.Split(',')[2]` làm
 *    pack_cd cho cổng once_day / once_month ⇒ thiếu freewd là cổng đó mù với dữ liệu
 *    đã lưu.
 *
 * ─── ĐƯỜNG ĐI TẤT ĐỊNH (như dialogs-selection/summary-comment-selection-enter) ─
 *   bệnh nhân 11, コードモード (Shift+F10) → gõ 153 vào ô 点 → 処置選択 → dòng 点数 48
 *   → Enter ở ô 回 → một hoặc nhiều 摘要選択（<pack_nm>） nối nhau.
 *   Pack NÀO mở ra phụ thuộc dữ liệu ngày chạy (đo 2026-09-30: 「暫間固定-方法」 bung
 *   trước chứ không phải 「除去-困難」 như ghi chú của spec summary-comment-selection),
 *   nên spec KHÔNG ghim pack: mỗi pack mở ra được 確定 dòng mặc định, ghi lại tên pack
 *   + chữ dòng đã vào lưới, rồi ở F9 đối chiếu freewd với master của CHÍNH pack đó
 *   (TEST_DB=1, Rule 15). Không bật DB thì chỉ kiểm định dạng.
 *
 * ─── KHÔNG GHI DB ────────────────────────────────────────────────────────────
 * POST /tenant/treatment/bulk-save bị CHẶN và trả phản hồi giả; thứ được kiểm là
 * body gửi lên. Không cần TEST_ALLOW_SAVE.
 *
 * CHẠY TUẦN TỰ, CHUNG page (Rule 10.1 / 19):
 *   npx playwright test tests/save-f9/save-cmt-pack-freewd.spec.ts
 */

/**
 * Bệnh nhân MẪU để clone. Không chạy thẳng trên bệnh nhân 11: phiên khác dùng nó cùng
 * ngày (đo 2026-09-30: lưới hôm nay đã có dòng 暫間固定 của người khác, cascade của
 * chúng bung trước và 153 rơi vào ô 日計). Clone giữ nguyên hồ sơ 保険/病名 nên đường
 * 153 → 除去 vẫn đi được, mà tháng này của bản clone thì trống.
 */
const TEMPLATE_PAT_NO = Number(patNo('11'))
const TRT_DT = trtDt(TODAY_ISO)
const TRT_CD = '153'
const PICK_SCORE = '48'
const ryoCell = (page: Page) => page.locator('[data-grid-cell$="|2"]')
const tenCell = (page: Page) => page.locator('[data-grid-cell$="|3"]')
const dialogBox = (page: Page) => page.locator('[role="dialog"]')
const dlgRows = (page: Page) => dialogBox(page).locator('[data-testid^="row-"]')
const packTitle = (page: Page) => page.getByText(/^摘要選択（.+）$/)
const realAlert = (page: Page) => page.locator('[role="alertdialog"]:not([aria-busy="true"])')
const SANTEI_CONFIRM = /を算定しますか？/

interface SaveRowBody {
    trtCd?: number | string
    trtSb?: number | string
    dspTrt?: string
    freewd?: string | null
}

interface PackMaster {
    packCd: string
    medKbn: number
    /** com_cd hợp lệ ở vị trí 2 của freewd: com_cd của ứng viên + com_cd_1 của pack (mẫu 10). */
    comCds: Set<string>
}

/** Mọi pack mang đúng tên này, hiệu lực ngày TRT_DT (tên có thể trùng giữa các pack_cd). */
async function packMastersByName(packNm: string): Promise<PackMaster[]> {
    return withDb(async (c) => {
        const defs = await c.query<{ pack_cd: string; med_kbn: number; com_cd_1: string | null }>(
            `SELECT pack_cd, med_kbn, com_cd_1 FROM mst_cmt_pack_def
              WHERE pack_nm = $1 AND deleted_at IS NULL
                AND $2::date BETWEEN app_st_dt AND app_ed_dt`,
            [packNm, TRT_DT],
        )
        const out: PackMaster[] = []
        for (const d of defs.rows) {
            const det = await c.query<{ com_cd: string | null }>(
                `SELECT com_cd FROM mst_cmt_pack_detail
                  WHERE pack_cd = $1 AND deleted_at IS NULL
                    AND $2::date BETWEEN app_st_dt AND app_ed_dt`,
                [d.pack_cd, TRT_DT],
            )
            const comCds = new Set(det.rows.map((r) => (r.com_cd ?? '').trim()).filter(Boolean))
            if ((d.com_cd_1 ?? '').trim()) comCds.add(d.com_cd_1!.trim())
            out.push({ packCd: d.pack_cd, medKbn: Number(d.med_kbn), comCds })
        }
        return out
    })
}

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('F9 登録 — freewd của dòng 摘要 từ コメントパック', () => {
    let page: Page
    let step: () => Promise<void>
    const saveBodies: { rows?: SaveRowBody[] }[] = []
    /** Mỗi pack đã 確定: tên pack (từ tiêu đề) + chữ dòng 摘要 vào lưới. */
    const committed: { packNm: string; text: string }[] = []
    let testPatNo: number | null = null

    const modeChip = () => page.locator('button[title*="入力モード切替"]')
    const trtPicker = () => page.getByText('処置選択', { exact: true })

    async function drainAlerts(): Promise<void> {
        for (let i = 0; i < 10; i++) {
            if ((await realAlert(page).count()) === 0) return
            const btn = realAlert(page).locator('button', { hasText: /^(OK|Yes)$/ })
            if ((await btn.count()) === 0) return
            await btn.first().click()
            await page.waitForTimeout(400)
        }
    }

    /**
     * Click khi không còn alert đè lên. Alert 算定チェック 「…算定可能な部位がありません。」
     * của chính 処置 vừa nhập bung ra TRỄ, có khi ngay sau một lần drainAlerts — nên
     * dọn-rồi-click trong vòng lặp thay vì dọn một lần.
     */
    async function clickWhenClear(target: Locator): Promise<void> {
        for (let i = 0; i < 10; i++) {
            await drainAlerts()
            const ok = await target
                .click({ timeout: 2000 })
                .then(() => true)
                .catch(() => false)
            if (ok) return
        }
        await target.click()
    }

    async function waitGridSettled(): Promise<void> {
        await page
            .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 4000 })
            .catch(() => {})
        await page.waitForTimeout(800)
    }

    async function clearOverlays(): Promise<void> {
        for (let i = 0; i < 10; i++) {
            await drainAlerts()
            if (await packTitle(page).count()) return
            if ((await dialogBox(page).count()) === 0) return
            if (await dialogBox(page).filter({ hasText: SANTEI_CONFIRM }).count()) {
                await page.waitForTimeout(400)
                continue
            }
            await page.keyboard.press('F10')
            await page.waitForTimeout(600)
        }
    }

    async function enterCodeMode(): Promise<void> {
        for (let i = 0; i < 5; i++) {
            await clearOverlays()
            await expect(dialogBox(page)).toHaveCount(0, { timeout: 15000 })
            await page.keyboard.press('Shift+F10')
            if ((await modeChip().innerText().catch(() => '')).trim() === 'コード') return
            await page.waitForTimeout(500)
        }
    }

    const emptyEntryRowKey = async () =>
        ryoCell(page).evaluateAll((els) => {
            const empties = els.filter((e) => (e.textContent ?? '').trim() === '')
            const last = empties[empties.length - 1]
            return last?.getAttribute('data-grid-cell')?.replace(/\|2$/, '') ?? ''
        })

    /** 153 → 処置選択 → dòng 点数 48; trả về khi con trỏ ở ô 回 (đang sửa). */
    async function enterPackRow(): Promise<void> {
        await waitGridSettled()
        for (let attempt = 1; attempt <= 3; attempt++) {
            const key = await emptyEntryRowKey()
            const cell = key ? page.locator(`[data-grid-cell="${key}|3"]`) : tenCell(page).last()
            await cell.click()
            await page.keyboard.type(TRT_CD)
            const typed = await page.evaluate(() => {
                const el = document.activeElement
                return el instanceof HTMLInputElement ? el.value : ''
            })
            if (typed.includes(TRT_CD)) break
            await waitGridSettled()
        }
        await expect(page.locator('input:focus')).toHaveValue(new RegExp(TRT_CD), { timeout: 5000 })
        await page.keyboard.press('Enter')
        await expect(trtPicker(), `gõ ${TRT_CD} không mở 処置選択`).toBeVisible({ timeout: 20000 })
        // Bó vào ĐÚNG dialog 処置選択: `[role=dialog]` trần gom row của mọi dialog đang
        // mở (đo được: nth(idx) trúng một row 2 cột của dialog khác).
        const picker = dialogBox(page).filter({ has: page.getByText('処置選択', { exact: true }) })
        const scoreCells = picker.locator('[data-testid="cell-score1"]')
        await expect(scoreCells.first()).toBeVisible({ timeout: 15000 })
        const scores = await scoreCells.allTextContents()
        const idx = scores.findIndex((s) => s.trim() === PICK_SCORE)
        expect(idx, `処置選択 không có dòng 点数=${PICK_SCORE}`).toBeGreaterThan(-1)
        await picker.locator('[data-testid^="row-"]').nth(idx).dblclick()
        await expect(trtPicker()).toBeHidden({ timeout: 15000 })
        await step()
    }

    /** Focus grid wrapper của #7 (không phải row / header) để Enter vào đúng handler. */
    async function focusPackGrid(): Promise<void> {
        await expect
            .poll(
                async () => {
                    await drainAlerts()
                    return page.evaluate(() => {
                        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
                        const d7 = dialogs.reverse().find((d) => /摘要選択（.+）/.test(d.textContent ?? ''))
                        const grid = d7?.querySelector('div[tabindex="0"]')
                        if (grid instanceof HTMLElement) grid.focus()
                        return document.activeElement === grid && grid !== null
                    })
                },
                { timeout: 8000, message: 'không đưa được focus vào lưới của 摘要選択' },
            )
            .toBe(true)
    }

    /** Một 摘要選択 đang mở: 確定 dòng mặc định và ghi lại (tên pack, chữ dòng). */
    async function confirmOpenPack(): Promise<void> {
        const packNm = (await packTitle(page).innerText())
            .replace(/\s/g, '')
            .replace(/^摘要選択（/, '')
            .replace(/）$/, '')
        const box = dialogBox(page).filter({ has: packTitle(page) }).last()
        const multi = (await box.locator('[role="checkbox"]').count()) > 0
        let text: string
        if (multi) {
            text = (
                await box
                    .locator('[data-testid^="row-"]')
                    .filter({ has: page.locator('[role="checkbox"][aria-checked="true"]') })
                    .locator('[data-testid="cell-dispText"]')
                    .first()
                    .innerText()
            ).trim()
        } else {
            await clickWhenClear(box.locator('[data-testid^="row-"]').first())
            text = (await box.locator('[data-testid="cell-dispText"]').first().innerText()).trim()
        }
        expect(text, `pack ${packNm}: không có dòng mặc định`).not.toBe('')
        // Nút 「F9 確定」 của CHÍNH dialog pack, không dùng Enter: khi カルテ記載選択 nằm
        // bên dưới, Enter ở window level không tới được handler của pack (đo 2026-09-30).
        await clickWhenClear(box.getByRole('button', { name: /F9\s*確定/ }).first())
        await step()
        committed.push({ packNm, text })
        console.log(`確定 pack 「${packNm}」 → 「${text}」`)
        await expect
            .poll(
                async () =>
                    (await packTitle(page).count()) === 0 ||
                    (await packTitle(page).innerText()) !== `摘要選択（${packNm}）`,
                { timeout: 10000 },
            )
            .toBe(true)
    }

    /**
     * Cho màn đứng yên, xử lý MỌI popup theo đúng thứ tự tầng (trên cùng trước):
     * alert → confirm 「算定しますか？」 (No — Rule 14.1) → 摘要選択 (確定 + ghi lại) →
     * カルテ記載選択 (F10 戻る). Không dùng addLocatorHandler: handler đóng カルテ記載選択
     * kẹt vĩnh viễn khi một 摘要選択 nằm ĐÈ lên nó (đo 2026-09-30).
     * Dừng khi liên tiếp 3 nhịp không còn gì.
     */
    async function settle(): Promise<void> {
        let quiet = 0
        for (let i = 0; i < 60 && quiet < 3; i++) {
            await page.waitForTimeout(700)
            if ((await realAlert(page).count()) > 0) {
                await drainAlerts()
                quiet = 0
                continue
            }
            const santei = dialogBox(page).filter({ hasText: SANTEI_CONFIRM })
            if (await santei.count()) {
                await santei.getByRole('button', { name: /^(No|いいえ)$/ }).first().click().catch(() => {})
                quiet = 0
                continue
            }
            if (await packTitle(page).count()) {
                await confirmOpenPack()
                quiet = 0
                continue
            }
            const karte = dialogBox(page).filter({ hasText: 'カルテ記載選択' })
            if (await karte.count()) {
                await karte.getByRole('button', { name: 'F10 戻る' }).first().click().catch(() => {})
                quiet = 0
                continue
            }
            quiet++
        }
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        // F9 登録 — CHẶN, không ghi DB.
        await page.route('**/tenant/treatment/bulk-save', async (route: Route) => {
            const body = route.request().postDataJSON() as { rows?: SaveRowBody[] }
            saveBodies.push(body)
            await route.fulfill({
                json: {
                    success: true,
                    data: { deletedCount: 0, insertedCount: (body.rows ?? []).length, monthUpdatedAt: null },
                },
            })
        })

        test.skip(!dbEnabled, 'cần TEST_DB=1 để dựng bệnh nhân test riêng')
        testPatNo = (await createTestPatient(TRT_DT, { templatePatNo: TEMPLATE_PAT_NO })).patNo
        console.log(`bệnh nhân test ${testPatNo} (clone của ${TEMPLATE_PAT_NO})`)

        await page.goto(`/treatments/${testPatNo}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(tenCell(page).last(), 'lưới 診療入力 không nạp').toBeVisible({ timeout: 60000 })
    })

    test.afterAll(async () => {
        if (testPatNo !== null) await dropTestPatient(testPatNo)
        await releaseSharedPage(page)
    })

    test('TC-1 — コメントパック bung ra (自動算定, hoặc 153 nếu không có) → 確定 ⇒ dòng 摘要 vào lưới', async () => {
        await settle()
        if (committed.length === 0) {
            // Không pack nào tự bung — đi đường 153 → 除去 như spec summary-comment-selection.
            await enterCodeMode()
            await expect(modeChip()).toHaveText('コード', { timeout: 10000 })
            await enterPackRow()
            await page.keyboard.press('Enter')
            await settle()
        }
        expect(committed.length, 'không có コメントパック nào để 確定').toBeGreaterThan(0)
        await expect(
            page.getByText('ユーザー摘要コメント選択', { exact: true }),
            'cascade rơi sang frm203019 — spec chưa xử lý nhánh nhập tay',
        ).toHaveCount(0)
        for (const c of committed) {
            await expect
                .poll(async () => (await ryoCell(page).allInnerTexts()).join('\n'), { timeout: 15000 })
                .toContain(c.text)
        }
    })

    test('TC-2 — F9 登録: mỗi dòng 摘要 mang freewd 「med_kbn,com_cd,pack_cd」 của đúng pack', async () => {
        await settle()
        await page.keyboard.press('F9')
        await expect
            .poll(
                async () => {
                    // はい của 「登録しますか？」 + mọi alert kiểm tra bung ra trước khi lưu.
                    const btn = page.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first()
                    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {})
                    return saveBodies.length
                },
                { timeout: 60000, message: 'F9 → はい mà không có POST bulk-save' },
            )
            .toBeGreaterThan(0)

        const rows = saveBodies[saveBodies.length - 1]!.rows ?? []
        const packCds: string[] = []
        for (const c of committed) {
            const hit = rows.filter((r) => (r.dspTrt ?? '').includes(c.text))
            expect(
                hit.length,
                `payload không có dòng 摘要 「${c.text}」 — dspTrt: ${JSON.stringify(rows.map((r) => r.dspTrt))}`,
            ).toBeGreaterThan(0)
            for (const r of hit) {
                const parts = String(r.freewd ?? '').split(',')
                expect(parts.length, `freewd 「${String(r.freewd)}」 của 「${c.text}」 sai định dạng`).toBeGreaterThanOrEqual(3)
                const [medKbn, comCd, packCd] = parts as [string, string, string]
                packCds.push(packCd)
                if (!dbEnabled) continue
                const masters = await packMastersByName(c.packNm)
                const m = masters.find((x) => x.packCd === packCd)
                expect(
                    m,
                    `freewd 「${String(r.freewd)}」: pack_cd ${packCd} không phải pack 「${c.packNm}」 (${masters.map((x) => x.packCd).join('/')})`,
                ).toBeDefined()
                expect(Number(medKbn), 'vị trí 1 = mst_cmt_pack_def.med_kbn').toBe(m!.medKbn)
                expect([...m!.comCds], 'vị trí 2 = com_cd của ứng viên / com_cd_1 của pack').toContain(comCd)
                console.log(`「${c.text}」 freewd=${String(r.freewd)} ✓ (${c.packNm})`)
            }
        }

        // Dòng 処置 153 không được mang freewd của pack.
        for (const r of rows.filter((x) => Number(x.trtCd) === Number(TRT_CD))) {
            for (const pc of packCds) {
                expect(r.freewd ?? '', 'freewd của pack không được lem sang dòng 処置').not.toContain(pc)
            }
        }
    })
})
