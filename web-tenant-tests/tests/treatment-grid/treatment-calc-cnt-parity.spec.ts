import { type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteChkAutoCompanionRows,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    ensureSigaRow,
    findChkAutoSlots,
    findMstTrt,
    findTreInpFlg,
    readKon,
    readSiga,
    restoreSiga,
    seedTreatmentRows,
    writeSigaTeeth,
    type SigaSnapshot,
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

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/** 処置 có `unit` phụ thuộc số chân răng — 170/0 抜髄(1根), `unit = 61` (１根管). */
const TRIGGER_CD = Number(process.env.TEST_CNT_CD ?? 170)
const TRIGGER_SB = Number(process.env.TEST_CNT_SB ?? 0)

/** Số chân mà `unit = 61` đòi. */
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

    let sigaBefore: SigaSnapshot | null = null
    let sigaRowCreated = false

    let triggerNm = ''
    /** 処置名 của các slot `chk_auto` mà 170/0 kéo theo (nếu master có). */
    let slotNms: string[] = []

    /** Index 0-7 (hàm trên bên phải) của một răng nhiều chân / đúng 1 chân. */
    let multiRootSlot = -1
    let singleRootSlot = -1

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

    async function purgeTestRows(): Promise<void> {
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, TRIGGER_CD).catch(() => 0)
        await deleteChkAutoCompanionRows(
            Number(PAT_NO),
            TRT_DT,
            TRIGGER_CD,
            TRIGGER_SB,
        ).catch(() => 0)
    }

    /** ⚠️ Ghi `siga` TRƯỚC khi mở màn — FE chốt ảnh chụp 歯式 ở lần fetch đầu. */
    async function resetOnTooth(slot: number) {
        await writeSigaTeeth(Number(PAT_NO), { se: { [slot + 1]: SE_VITAL } })
        await purgeTestRows()
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

    /** Chốt 処置 qua コードモード → 処置選択 → F9 確定. KHÔNG Enter ô 回. */
    async function commitTrigger(): Promise<string> {
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
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toBeVisible({
            timeout: 20_000,
        })
        return (await editing.inputValue()).trim()
    }

    /** Chờ lưới đứng yên sau khi Enter ô 回 (chuỗi cascade chạy xong). */
    async function settleAfterKaiEnter() {
        await page.keyboard.press('Enter')
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

        // Chọn răng từ DB, không hardcode (BẪY 1). Chỉ dùng hàm trên bên phải
        // (index 0-7) để `dsp_bui` seed nằm gọn một nhóm.
        const kon = await readKon(Number(PAT_NO))
        for (let i = 0; i <= 7; i++) {
            const roots = kon?.ekon[i] ?? 0
            if (roots > REQUIRED_ROOTS && multiRootSlot < 0) multiRootSlot = i
            if (roots === REQUIRED_ROOTS && singleRootSlot < 0) singleRootSlot = i
        }
        console.log(
            `master: ${TRIGGER_CD}/${TRIGGER_SB} 「${triggerNm}」, chk_auto slot ` +
                `${JSON.stringify(slotNms)}; răng nhiều chân=index ${multiRootSlot}, ` +
                `răng 1 chân=index ${singleRootSlot}`,
        )

        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
    })

    test.afterAll(async () => {
        await purgeTestRows().catch(() => {})
        if (sigaBefore && !sigaRowCreated) {
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
        }
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    test('TC-1 unit không hợp với răng ⇒ 回数 = 0 (không phải 1)', async () => {
        skipWithReason(triggerNm === '', `master tháng test không có 処置 ${TRIGGER_CD}/${TRIGGER_SB}`)
        skipWithReason(
            multiRootSlot < 0,
            `bệnh nhân ${PAT_NO} không có răng nào > ${REQUIRED_ROOTS} chân ở hàm trên phải — ` +
                'đổi TEST_PAT_NO',
        )

        await resetOnTooth(multiRootSlot)
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
        skipWithReason(triggerNm === '' || multiRootSlot < 0, 'TC-1 không dựng được lưới')

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
        skipWithReason(triggerNm === '' || multiRootSlot < 0, 'TC-1 không dựng được lưới')
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
        skipWithReason(
            singleRootSlot < 0,
            `bệnh nhân ${PAT_NO} không có răng ${REQUIRED_ROOTS} chân ở hàm trên phải`,
        )

        await resetOnTooth(singleRootSlot)
        const kai = await commitTrigger()
        expect(
            kai,
            'răng 1 chân khớp unit 61 ⇒ func3xCnt đếm được 1. Nếu chỗ này cũng ra 0 thì ' +
                'TC-1 đang xanh vì lý do khác (vd 部位 seed không tới được BE), không phải ' +
                'vì app đúng.',
        ).toBe('1')

        await settleAfterKaiEnter()

        skipWithReason(slotNms.length === 0, 'không có slot chk_auto để đối chứng')
        const cells = (await ryoTexts()).map(norm)
        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        expect(trtIdx, `không thấy dòng 「${triggerNm}」`).toBeGreaterThanOrEqual(0)
        const below = cells.slice(trtIdx + 1)
        for (const slotNm of slotNms) {
            expect(
                below.findIndex((c) => c.includes(slotNm)),
                `回数 ≥ 1 thì Chk_ChkAuto phải chạy và chèn 「${slotNm}」 dưới ` +
                    `「${triggerNm}」 (modMain.cs:958).\n  lưới dưới: ${JSON.stringify(below.filter(Boolean))}`,
            ).toBeGreaterThanOrEqual(0)
        }
    })
})
