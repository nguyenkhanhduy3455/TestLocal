import { type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    findChkAutoSlots,
    findMstTrt,
    findTreInpFlg,
    seedTestPatient,
    seedTreatmentRows,
    writeKonTeeth,
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
import { makeStep, skipWithReason } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — 回数 phải là kết quả `CalcCnt.getCalcCnt`, KHÔNG phải hằng 1.
 *
 * ĐẶC TÍNH KIỂM THỬ: assert bám THEO WINFORM (`src/OCHACOM`), không bám code web.
 * Test đỏ = bản port lệch, KHÔNG phải test viết sai.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LỖI ĐANG KHOÁ Ở ĐÂY (điều tra 2026-09-14)
 * ═════════════════════════════════════════════════════════════════════════════
 * Web hardcode 回数 = 1 cho mọi 処置 chốt qua 処置選択 / コードモード / 個別:
 *
 *     treatment-entry-shared.ts  mstTrtToPick()   trtCnt: 1
 *       + ba lớp ép `trtCnt > 0 ? trtCnt : 1` ở hạ nguồn
 *
 * WinForm thì tính rồi ghi NGUYÊN VĂN:
 *
 *     modMain.cs:650   GetTrtmasCod   tblTrtSel c06 = CalcCnt.getCalcCnt(…unit, pbui…)
 *     modKobetu.cs:277 個別           intUnit      = CalcCnt.getCalcCnt(…)
 *     frm203016.cs:1531               grdRegi[4]   = selRec.intCnt      ← 0 cũng ghi 0
 *
 * Hệ quả khi lệch — đo được bằng tiền:
 *
 *     処置 170/0 抜髄(1根) có `unit = 61` (１根管) ⇒ `func3xCnt(bui, 1, kon)` chỉ đếm
 *     răng có ĐÚNG 1 chân. Đặt lên một răng 3 chân:
 *
 *       WinForm                                web (trước khi sửa)
 *       ───────────────────────────────        ──────────────────────────
 *       回数 0                                 回数 1
 *       234 × 0 = 0 点                         234 点
 *       không chạy Chk_ChkAuto                 chạy → thêm 麻酔 310/2 = 11 点
 *
 *     `Chk_ChkAuto` bị bỏ vì frm203002.cs:5740 chặn ở `if (trtCnt >= 1)`. Tổng cộng
 *     245 点 tính cho một ca mà WinForm từ chối ⇒ sai tiền thu VÀ sai レセプト.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ CẢ CA ĐỐI CHỨNG
 * ═════════════════════════════════════════════════════════════════════════════
 * Một spec chỉ đo 「回数 = 0」 sẽ vẫn XANH nếu app hỏng theo kiểu khác (vd không chèn
 * được dòng nào). TC-4 vì vậy chốt cùng 処置 đó trên răng 1 chân: phải ra 回数 = 1 VÀ
 * phải có dòng chk_auto. Hai vế cùng master, cùng bệnh nhân, chỉ khác cái răng.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. Số chân răng đọc từ DB (`kon.ekon_*`), KHÔNG hardcode — tenant khác dữ liệu khác.
 *    Spec tự tìm một răng 3 chân và một răng 1 chân trong CÙNG hàm trên (index 0-7).
 * 2. ⚠️ LƯỚI CHỨA CẢ THÁNG: dòng trùng tên ở ngày khác sẽ làm `find` toàn lưới xanh
 *    giả. Mọi assert neo vào dòng 処置 vừa chốt (`lastIndexOf`).
 * 3. Ô 回 sau 確定 là `<input>` đang focus, đọc bằng `inputValue()` chứ không phải
 *    `textContent` của cell.
 * 4. Cảnh báo 「算定可能な部位がありません」 (Chk5CmnRule trả -2) LÀ ĐÚNG ở TC-1..TC-3 —
 *    WinForm cũng cảnh báo. Handler `alerts` bấm OK; đừng coi đó là app sai.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/treatment-grid/treatment-calc-cnt-parity.spec.ts
 *
 * Spec KHÔNG bấm F9 登録; cần `TEST_ALLOW_SAVE=1` vì có ghi nóng bảng `siga`.
 */

/**
 * Bệnh nhân test — spec TỰ DỰNG, không mượn bệnh nhân của dev DB.
 *
 * Bản đầu dùng bệnh nhân 10 và phải: dò trong `kon` xem răng nào 3 chân / 1 chân,
 * chụp `siga` rồi trả lại ở `afterAll`, và skip nếu không tìm ra răng phù hợp.
 * Ba thứ đó đều là phụ thuộc vào dữ liệu người khác có thể đổi. Giờ spec ghi thẳng
 * `kon.ekon_*` nên số chân răng là HẰNG SỐ của bài test, và `deleteTestPatient` xoá
 * sạch bệnh nhân ở `afterAll` nên không để lại rác ở bất kỳ ngày nào.
 */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 52))
const TRT_DT = trtDt(TODAY_ISO)

/** Ô 部位 (0-based) spec tự gán số chân răng — 右上7 nhiều chân, 右上3 một chân. */
const MULTI_ROOT_SLOT = 1
const SINGLE_ROOT_SLOT = 5
/** Số chân ghi vào `kon.ekon_{slot+1}` cho hai ô trên. */
const MULTI_ROOT_COUNT = 3

/** 処置 có `unit` phụ thuộc số chân răng — 170/0 抜髄(1根), `unit = 61` (１根管). */
const TRIGGER_CD = Number(process.env.TEST_CNT_CD ?? 170)
const TRIGGER_SB = Number(process.env.TEST_CNT_SB ?? 0)

/** Số chân mà `unit = 61` (１根管) đòi — `func3xCnt(bui, 1, kon)`. */
const REQUIRED_ROOTS = 1

/** 病名 của 部位病名行 seed: `dis_cd` 100 =「Ｃ」, `dis_sb` 2 =「Ｃ₂」. */
const DIS_CD_C = 100
const DIS_SB_C2 = 2

/** `siga.se_*` của 永久歯 — **0 = 生活歯** (CommonChk.cs:518-540), cũng là DEFAULT cột. */
const SE_VITAL = 0

const BUI_VAL = 1
const ALLOW_SAVE = allowSave
const SETTLE_TIMEOUT = 30_000

const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (đọc kon/mst_trt để tự tính kỳ vọng + seed 部位病名行)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (chốt 処置 ghi nóng bảng siga)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  treatment-grid/treatment-calc-cnt-parity.spec.ts BỎ QUA TOÀN BỘ — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/treatment-grid/treatment-calc-cnt-parity.spec.ts\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để đọc kon/mst_trt và seed 部位病名行')
test.skip(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: chốt 処置 ghi nóng bảng siga')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 回数 phải theo CalcCnt, không phải hằng 1', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let triggerNm = ''
    /** 処置名 của các slot `chk_auto` mà 170/0 kéo theo (nếu master có). */
    let slotNms: string[] = []

    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')

    async function ryoTexts(): Promise<string[]> {
        return ryoCells().evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    }

    const lastIdxOf = (cells: readonly string[], needle: string) => {
        for (let i = cells.length - 1; i >= 0; i--) {
            if ((cells[i] ?? '').includes(needle)) return i
        }
        return -1
    }

    /** Ô 点 và ô 回 của dòng khớp `needle` (RegiCol ten = 3, kai = 4). */
    async function tenKaiOfRow(needle: string): Promise<{ ten: string; kai: string } | null> {
        return page.evaluate((n) => {
            const norm2 = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()
            const cells = Array.from(document.querySelectorAll('[data-grid-cell$="|2"]'))
            // Dòng vừa chốt là lần xuất hiện CUỐI (BẪY 2).
            for (let i = cells.length - 1; i >= 0; i--) {
                const cell = cells[i]
                if (!cell) continue
                if (!norm2(cell.textContent ?? '').includes(n)) continue
                const attr = cell.getAttribute('data-grid-cell') ?? ''
                const key = attr.slice(0, attr.lastIndexOf('|'))
                const read = (col: number) => {
                    const el = document.querySelector(`[data-grid-cell="${key}|${col}"]`)
                    if (!el) return ''
                    const input = el.querySelector('input')
                    return (input ? input.value : (el.textContent ?? '')).trim()
                }
                return { ten: read(3), kai: read(4) }
            }
            return null
        }, needle)
    }

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
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
                console.log(`openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} hỏng`)
            }
        }
        throw lastErr
    }

    /**
     * Dựng lại bệnh nhân từ 0 cho mỗi phase: xoá sạch (kể cả 処置行 của lần chạy
     * trước bị ngắt, ở BẤT KỲ ngày nào) rồi ghi `kon` với số chân răng CỐ ĐỊNH.
     *
     * `ekon_{slot+1}` là thứ `CalcCntService.Func3xCnt` đọc, nên gán ở đây tức là
     * bài test tự định nghĩa điều kiện của mình thay vì đi dò dữ liệu có sẵn.
     */
    async function resetPatient(): Promise<void> {
        await seedTestPatient({ patNo: Number(PAT_NO) })
        await writeKonTeeth(Number(PAT_NO), {
            ekon: {
                [MULTI_ROOT_SLOT + 1]: MULTI_ROOT_COUNT,
                [SINGLE_ROOT_SLOT + 1]: REQUIRED_ROOTS,
            },
        })
    }

    /** ⚠️ Ghi `siga` TRƯỚC khi mở màn — FE chốt ảnh chụp 歯式 ở lần fetch đầu. */
    async function resetOnTooth(slot: number) {
        await resetPatient()
        await writeSigaTeeth(Number(PAT_NO), { se: { [slot + 1]: SE_VITAL } })
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: '',
                bui: buiAt(slot, BUI_VAL),
                dspBui: `slot${slot}`,
                disCd: [DIS_CD_C],
                disSb: [DIS_SB_C2],
                dspDis: 'Ｃ',
            },
        ])
        await openTreatmentScreen()
    }

    /**
     * Dọn alert お茶コン đang mở và CHỜ nó tan hẳn.
     *
     * TC-1..TC-3 cố tình đặt 処置 lên răng sai số chân, nên SingleChk bung
     * 「算定可能な部位がありません」 — ĐÚNG, WinForm cũng cảnh báo. Nhưng alert đó
     * cướp focus và chặn click. `installOverlayHandlers({ alerts: true })` chỉ chạy
     * khi Playwright đang có action/assert, nên không đủ: phải chủ động dọn ở các
     * mốc giữa hai bước. Đã vấp: TC-2/TC-4 đỏ lần 1, xanh lần retry.
     */
    async function dismissAlerts(): Promise<void> {
        const alert = page.locator('[role="alertdialog"]')
        for (let i = 0; i < 5; i++) {
            if ((await alert.count()) === 0) break
            const ok = page.getByRole('button', { name: 'OK' })
            if ((await ok.count()) > 0) await ok.first().click().catch(() => {})
            else await page.keyboard.press('Enter').catch(() => {})
            await expect(alert).toHaveCount(0, { timeout: 5_000 }).catch(() => {})
        }
        await expect(alert, 'alert お茶コン không tắt — mọi click sau đó sẽ bị nuốt').toHaveCount(
            0,
            { timeout: 15_000 },
        )
    }

    /** Chốt 処置 qua コードモード → 処置選択 → F9 確定. KHÔNG Enter ô 回. */
    async function commitTrigger(): Promise<string> {
        await dismissAlerts()
        await closeDialogs(page)
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        const seededRow = ryoCells().filter({ hasText: 'Ｃ' }).first()
        await expect(seededRow, 'không thấy 部位病名行 vừa seed').toBeVisible({ timeout: 30_000 })
        await seededRow.click()

        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')

        await footerTen.click()
        await footerTen.fill(String(TRIGGER_CD))
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý').toHaveValue('')
        await expect(trtPicker, `mã ${TRIGGER_CD} không mở được 処置選択`).toBeVisible({
            timeout: 20_000,
        })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === TRIGGER_SB)
        expect(idx, `処置選択 không có 枝番 ${TRIGGER_SB} của mã ${TRIGGER_CD}`).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // Sau 確定 con trỏ nằm ở ô 回 của chính dòng vừa chốt, đang ở chế độ nhập —
        // giá trị trong đó CHÍNH LÀ số WinForm ghi vào grdRegi[4] (frm203016.cs:1531).
        //
        // ⚠️ ĐỪNG dùng `input:focus`: SingleChk có thể bung alert お茶コン
        // (「算定可能な部位がありません」 — đúng và WinForm cũng cảnh báo) và alert đó
        // cướp focus, nên `input:focus` trả về rỗng dù ô 回 vẫn đang mở. Đã vấp:
        // TC-1/TC-2 đỏ lần 1, xanh lần retry. Neo vào chính ô 回 của lưới
        // (`|4`, loại trừ ô của dòng 日計) và chờ alert tan trước.
        await dismissAlerts()
        const kaiEditor = page.locator('[data-grid-cell$="|4"] input:not([data-footer-cell])')
        await expect(kaiEditor, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toBeVisible({
            timeout: 20_000,
        })
        return (await kaiEditor.inputValue()).trim()
    }

    /** Chờ lưới đứng yên sau khi Enter ô 回 (chuỗi cascade chạy xong). */
    async function settleAfterKaiEnter() {
        await page.keyboard.press('Enter')
        // Enter ô 回 kích SingleChk ⇒ alert có thể bung ngay; dọn trước khi đo.
        await dismissAlerts()
        let stable = 0
        let prev = ''
        const deadline = Date.now() + SETTLE_TIMEOUT
        while (Date.now() < deadline && stable < 3) {
            if ((await page.getByRole('dialog').count()) > 0) await closeDialogs(page, 2)
            const now = JSON.stringify((await ryoTexts()).map(norm))
            stable = now === prev ? stable + 1 : 0
            prev = now
            await page.waitForTimeout(800)
        }
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })

        const treInpFlg = await findTreInpFlg()
        const mst = (await findMstTrt(TRT_DT, TRIGGER_CD)).find((r) => r.trtSb === TRIGGER_SB)
        triggerNm = mst ? (treInpFlg === 1 ? mst.cctNm : mst.trtNm) : ''

        const slots = await findChkAutoSlots(TRIGGER_CD, TRIGGER_SB)
        const slotMsts = await Promise.all(slots.map((s) => findMstTrt(TRT_DT, s.trtCd)))
        slotNms = slots
            .map((s, i) => (slotMsts[i] ?? []).find((r) => r.trtSb === s.trtSb))
            .filter((m): m is NonNullable<typeof m> => m !== undefined)
            .map((m) => norm(treInpFlg === 1 ? m.cctNm : m.trtNm))

        console.log(
            `master: ${TRIGGER_CD}/${TRIGGER_SB} 「${triggerNm}」, chk_auto slot ` +
                `${JSON.stringify(slotNms)}; răng nhiều chân = ô ${MULTI_ROOT_SLOT} ` +
                `(${MULTI_ROOT_COUNT} chân), răng 1 chân = ô ${SINGLE_ROOT_SLOT} — cả hai do ` +
                'spec tự ghi vào kon.',
        )
    })

    test.afterAll(async () => {
        // Xoá HẲN bệnh nhân: person + insurance + siga + kon + TOÀN BỘ trn_trn.
        await deleteTestPatient(Number(PAT_NO)).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    test('TC-1 unit không hợp với răng ⇒ 回数 = 0 (không phải 1)', async () => {
        skipWithReason(triggerNm === '', `master tháng test không có 処置 ${TRIGGER_CD}/${TRIGGER_SB}`)
        await resetOnTooth(MULTI_ROOT_SLOT)
        const kai = await commitTrigger()

        expect(
            kai,
            `処置 ${TRIGGER_CD}/${TRIGGER_SB} có unit = 61 (１根管) mà răng seed nhiều chân ⇒ ` +
                '`CalcCnt.func3xCnt` trả 0, và frm203016.cs:1531 ghi NGUYÊN VĂN số đó vào ' +
                'grdRegi[4]. Thấy 1 nghĩa là FE vẫn đang ép 0 → 1 ' +
                '(mstTrtToPick trtCnt: 1 / `trtCnt > 0 ? trtCnt : 1`).',
        ).toBe('0')
    })

    test('TC-2 回数 = 0 ⇒ dòng không sinh điểm', async () => {
        skipWithReason(triggerNm === '', 'TC-1 không dựng được lưới')

        await settleAfterKaiEnter()

        const row = await tenKaiOfRow(norm(triggerNm))
        expect(row, `không thấy dòng 「${triggerNm}」 trên lưới`).not.toBeNull()
        expect(
            row!.kai,
            'sau Enter ô 回 vẫn phải là 0 — WinForm không tự nâng lên 1',
        ).toBe('0')
        // 点数 cột 点 vẫn in điểm master; cái bằng 0 là 点数 × 回数 (WinForm grdRegi[54]).
        expect(
            Number(row!.ten) * Number(row!.kai),
            `点数 × 回数 phải = 0 (点=${row!.ten}, 回=${row!.kai}) — đây chính là số tiền ` +
                'mà bản chưa sửa tính thừa',
        ).toBe(0)
    })

    test('TC-3 回数 = 0 ⇒ KHÔNG chạy 自動算定 (frm203002.cs:5740 chặn ở 回数 ≥ 1)', async () => {
        skipWithReason(triggerNm === '', 'TC-1 không dựng được lưới')
        skipWithReason(
            slotNms.length === 0,
            `${TRIGGER_CD}/${TRIGGER_SB} không có slot chk_auto nào khả dụng — không đo được`,
        )

        const cells = (await ryoTexts()).map(norm)
        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        expect(trtIdx, `không thấy dòng 「${triggerNm}」`).toBeGreaterThanOrEqual(0)

        for (const slotNm of slotNms) {
            // Chỉ soi phần lưới TỪ dòng vừa chốt trở xuống: bản đã lưu ở ngày khác
            // nằm phía trên và không liên quan (BẪY 2).
            const below = cells.slice(trtIdx + 1)
            expect(
                below.findIndex((c) => c.includes(slotNm)),
                `回数 = 0 thì WinForm bỏ hẳn Chk_ChkAuto, nên KHÔNG được có dòng ` +
                    `「${slotNm}」 dưới 「${triggerNm}」.\n  lưới dưới: ${JSON.stringify(below.filter(Boolean))}`,
            ).toBe(-1)
        }
    })

    test('TC-4 ĐỐI CHỨNG — cùng 処置 trên răng 1 chân ⇒ 回数 = 1 và CÓ dòng 自動算定', async () => {
        skipWithReason(triggerNm === '', 'không tra được 処置名')
        await resetOnTooth(SINGLE_ROOT_SLOT)
        const kai = await commitTrigger()
        expect(
            kai,
            'răng 1 chân khớp unit 61 ⇒ func3xCnt đếm được 1. Nếu chỗ này cũng ra 0 thì ' +
                'TC-1 đang xanh vì lý do khác (vd 部位 seed không tới được BE), không phải ' +
                'vì app đúng.',
        ).toBe('1')

        await settleAfterKaiEnter()

        skipWithReason(slotNms.length === 0, 'không có slot chk_auto để đối chứng')

        // TC này khẳng định dòng CÓ MẶT, nên phải chờ theo điều kiện chứ không dựa vào
        // "lưới đứng yên": sau 回 Enter, runChkAuto còn một chuỗi request nối nhau
        // (cascade prefetch → cmt_auto → chk-auto), và giữa hai request lưới đứng yên
        // thật. Đã vấp: TC-4 đỏ lần 1, xanh lần retry, trong khi app làm đúng.
        let lastCells: string[] = []
        await expect
            .poll(
                async () => {
                    lastCells = (await ryoTexts()).map(norm)
                    const at = lastIdxOf(lastCells, norm(triggerNm))
                    if (at < 0) return [...slotNms]
                    const below = lastCells.slice(at + 1)
                    return slotNms.filter((n) => !below.some((c) => c.includes(n)))
                },
                {
                    timeout: SETTLE_TIMEOUT,
                    intervals: Array.from({ length: 30 }, () => 1000),
                    message:
                        `回数 ≥ 1 thì Chk_ChkAuto phải chạy và chèn dòng 自動算定 dưới ` +
                        `「${triggerNm}」 (modMain.cs:958).`,
                },
            )
            .toEqual([])
    })
})
