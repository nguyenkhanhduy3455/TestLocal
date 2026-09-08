import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteChkAutoCompanionRows,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    ensureSigaRow,
    findChkAutoSlots,
    findCmtAutos,
    findMstTrt,
    readSiga,
    restoreSiga,
    seedTreatmentRows,
    writeSigaTeeth,
    type ChkAutoSlot,
    type CmtAutoRow,
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
 * 診療入力 — cái ĐUÔI của một cú chốt 処置: 回 セル Enter xong thì WinForm còn kéo
 * theo hai bảng nữa, và cả hai từng bị web bỏ rơi.
 *
 * ĐẶC TÍNH KIỂM THỬ: assert bám THEO WINFORM (src/OCHACOM/INP), không bám code web.
 * Kỳ vọng được TÍNH LẠI trong spec từ master (`chk_auto`, `cmt_auto`, `mst_trt`),
 * không hardcode 「310/2」「7321/1」 — tenant khác có master khác.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BUG ĐANG KHOÁ Ở ĐÂY (báo cáo 2026-09-08, ảnh so WinForm ↔ web)
 * ═════════════════════════════════════════════════════════════════════════════
 * Thao tác: 部位病名行 (răng 6 trên phải, 病名 Ｃ₂) → コードモード gõ `179` →
 * 処置選択 chọn 枝番 2 (抜歯手術(臼歯)) → F9 確定 → Enter ở ô 回.
 *
 *     WinForm                                        web (SAI)
 *     ─────────────────────────────────────────      ─────────────────────
 *     OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用ｵｰﾗ注Ct1.8ml）   0点    (KHÔNG CÓ)
 *     抜歯手術(臼歯)                         270点    抜歯手術(臼歯)  270点
 *     OA+ｵｰﾗ注歯科用ｶｰﾄﾘｯｼﾞ 料1.8mL           11点    (KHÔNG CÓ)
 *     【日計 443点】                                  【日計 432点】
 *
 * Hai dòng thiếu đến từ HAI cơ chế khác nhau — spec vì vậy có hai khối:
 *
 *  (A) `ModMain.Chk_ChkAuto` (modMain.cs:812) — bảng `chk_auto`, tối đa 5 mã đi kèm,
 *      chèn DƯỚI 処置. `chk_auto(179,2) → 310/2` chính là 11 điểm bị mất.
 *      Web ĐỌC `chk_auto` chỉ ở màn 自動算定マスタ (frm203038/39); lúc 診療入力 thì
 *      không có chỗ nào gọi — không ở ô 回 Enter, không ở AutoSantei/AutoSantei2.
 *
 *  (B) `ModMain.Chk_CmtAuto` (modMain.cs:738) nửa CMTAUTO — bảng `cmt_auto`. Web CÓ
 *      `runKarteCmtAuto` nhưng nó `return false` ở nhánh TỰ ÁP DỤNG, tức nuốt luôn
 *      dòng comment. WinForm thì vẫn ghi: `Chk_CmtAuto` mở frm203012 ở `gType.Auto`
 *      bất cứ khi nào CMTAUTO có dòng (modMain.cs:779-804); khi không cần hỏi
 *      (≤1 dòng, hoặc mọi dòng `no_chk ≠ 0` — frm203012.cs:536) nó trả `outData`
 *      ngay và `frmCmt3_Cmt3_SetData` ghi xuống lưới (frm203002.cs:10034).
 *
 * ─── Nguồn WinForm ──────────────────────────────────────────────────────────
 *  - frm203002.cs:5738-5752 — đuôi của nhánh 回 Enter (case 4). Thứ tự CỐ ĐỊNH:
 *        ModMain.Chk_CmtAuto(...)            ← chạy cả khi 回数 = 0
 *        if (trtCnt >= 1) {
 *            ModMain.Chk_ChkAuto_soutyaku(...)   装着料自動算定
 *            ModMain.Chk_ChkAuto(...)            自動算定      ← (A)
 *        }
 *    Không có cờ `pInpOpt` nào chặn hai cái sau.
 *  - modMain.cs:861-1035 Chk_ChkAuto — mỗi slot: 摘要コメント (700-899, `mst_cmt`)
 *    hoặc 一般処置 (`cd > 100`, qua 診療チェック → getTensu → CalcCnt), rồi chèn qua
 *    `frm203016_Hide_Let_Trt_Data`. `cd <= 100` không khớp nhánh nào và bị bỏ.
 *  - frm203002.cs:10085-10111 frmCmt3_Cmt3_SetData — `cmt_auto.disp_no` quyết định
 *    chỗ chèn: `< 0` con trỏ lùi một dòng ⇒ comment nằm TRÊN 処置; `= 0` nối vào
 *    cuối ô 療法 của 処置 (KHÔNG thêm dòng); `> 0` chèn DƯỚI.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ BẪY KHI CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. Chốt 抜歯 làm app GHI NÓNG 歯式 (`SigaChg` trong `IregCodChk`,
 *    frm203016.cs:1239) — răng thành 欠損 ngay, KHÔNG đợi F9 登録. Spec vì vậy nằm
 *    sau `TEST_ALLOW_SAVE=1`, chụp `siga` ở beforeAll và trả lại ở afterAll.
 * 2. Răng đem thử phải đang 現存: nếu `se` đã là 4 thì `ChkSiga` loại 抜歯 khỏi
 *    danh sách và cả spec vô nghĩa. `resetPhase()` ghi 生活歯 TRƯỚC khi mở màn —
 *    FE chốt ảnh chụp 歯式 ở lần fetch đầu sau mount, đảo thứ tự là hỏng.
 * 3. Các dòng đi kèm KHÔNG mang `dsp_trt` của 処置 gốc, nên mọi đường dọn theo tên
 *    đều trượt — dùng `deleteChkAutoCompanionRows()`.
 * 4. So chuỗi phải NFKC CẢ HAI VẾ: lưới in 半角 「ｵｰﾗ」 còn master giữ 全角.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/auto-santei/chk-auto-after-commit.spec.ts
 *
 * Spec KHÔNG bấm F9 登録 (không đụng `trn_trn` ngoài vùng seed `disp_no >= 9000`),
 * nhưng CÓ ghi bảng `siga` qua đường ghi nóng — đó là lý do cần cờ.
 *
 * Mặc định: 患者 10 (bệnh nhân parity, ít dòng TRNTRN), 診療日 = hôm nay (WinForm
 * chặn thao tác sang tháng khác), 処置 179/2 抜歯手術(臼歯). Đổi bằng TEST_PAT_NO /
 * TEST_TRT_DT / TEST_TRIGGER_CD / TEST_TRIGGER_SB.
 */

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/** 処置 đem chốt — mã có CẢ `chk_auto` lẫn `cmt_auto` trong master dev. */
const TRIGGER_CD = Number(process.env.TEST_TRIGGER_CD ?? 179)
const TRIGGER_SB = Number(process.env.TEST_TRIGGER_SB ?? 2)

/**
 * 病名 của 部位病名行 seed: `dis_cd` 100 = 「Ｃ」, `dis_sb` 2 = 「Ｃ₂」 — đúng ảnh
 * báo lỗi. `chk_auto` không lọc theo 病名, nhưng dòng 部位病名行 phải có 病名 thì
 * 処置 mới thừa kế được 部位, và 部位 mới là thứ quyết định 回数 của dòng đi kèm.
 */
const DIS_CD_C = 100
const DIS_SB_C2 = 2

/** Ô 部位 seed: index 2 = 右上6 (bố cục 32 ô, `tooth-bui.ts:25`: 0-7 右上 8→1). */
const BUI_SLOT = 2
const BUI_VAL = 1

/** `siga.se` — 1 = 生活歯 (răng còn sống), 4 = 欠損 (đã mất). */
const SE_VITAL = 1

/** Hạn chờ cho chuỗi chèn dòng sau 回 Enter (mỗi bảng một vòng request). */
const FOLLOWUP_TIMEOUT = 30_000

const ALLOW_SAVE = allowSave

/** NFKC + gộp khoảng trắng — áp cho CẢ hai vế mọi phép so chuỗi (BẪY 4). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Mảng 32 ô 部位 với đúng ô `slot` mang `val`. */
const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

// Rule 5.3 — skip cấp file phải nói rõ vì sao, nếu không nhìn y như đã chạy xong.
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (seed 部位病名行 + đọc master để tự tính kỳ vọng)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (chốt 抜歯 ghi nóng bảng siga)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  auto-santei/chk-auto-after-commit.spec.ts BỎ QUA TOÀN BỘ — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/auto-santei/chk-auto-after-commit.spec.ts\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 部位病名行 và đọc chk_auto/cmt_auto')
test.skip(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: chốt 抜歯 ghi nóng bảng siga')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — đuôi của một cú chốt 処置 (Chk_CmtAuto + Chk_ChkAuto)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Dialog カルテ記載選択 (frm203011/12) — AutoSantei tự bung khi vào màn. */
    let karteCmtDialog: Locator

    /** Nguyên trạng `siga` trước khi test đụng vào — trả lại ở afterAll. */
    let sigaBefore: SigaSnapshot | null = null
    let sigaRowCreated = false

    /** Master của 処置 đem chốt — đọc một lần ở beforeAll. */
    let triggerNm = ''
    let slots: ChkAutoSlot[] = []
    let cmts: CmtAutoRow[] = []
    /** 処置名 + 点数 của từng slot `chk_auto`, tra từ `mst_trt` của tháng test. */
    let slotMaster = new Map<string, { trtNm: string; score1: number }>()

    /** Ô 療法・処置 của lưới đăng ký (RegiCol.ryo = 2). */
    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')

    /** Text mọi ô 療法・処置 theo ĐÚNG thứ tự hiển thị. */
    async function ryoTexts(): Promise<string[]> {
        return ryoCells().evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    }

    /** Điểm của dòng có ô 療法 khớp `needle` (RegiCol.ten = 3). */
    async function tenOfRow(needle: string): Promise<string | null> {
        return page.evaluate((n) => {
            const norm2 = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()
            const cells = Array.from(document.querySelectorAll('[data-grid-cell$="|2"]'))
            for (const cell of cells) {
                if (!norm2(cell.textContent ?? '').includes(n)) continue
                const attr = cell.getAttribute('data-grid-cell') ?? ''
                const key = attr.slice(0, attr.lastIndexOf('|'))
                const ten = document.querySelector(`[data-grid-cell="${key}|3"]`)
                return ten?.textContent ?? ''
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
                await expect(
                    page.getByText('合計:').first(),
                    'Màn 診療入力 không dựng xong (không thấy 「合計:」) — mất session?',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await drainAutoSantei()
                await closeDialogs(page)
                return
            } catch (e) {
                lastErr = e
                console.log(`openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} hỏng — nạp lại`)
            }
        }
        throw lastErr
    }

    /**
     * Chờ chuỗi AutoSantei chạy hết rồi dọn. Handler CHỈ chạy khi Playwright có
     * action / assert auto-retry, nên phải assert (không `waitForTimeout` trần).
     */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15_000 })
            await page.waitForTimeout(700)
        }
    }

    /** Xoá HẲN mọi dòng spec này từng tạo — gọi trước mỗi phase và ở afterAll. */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, TRIGGER_CD).catch(() => 0)
        // BẪY 3 — các dòng đi kèm mang mã KHÁC, đường trên không tóm được.
        n += await deleteChkAutoCompanionRows(
            Number(PAT_NO),
            TRT_DT,
            TRIGGER_CD,
            TRIGGER_SB,
        ).catch(() => 0)
        return n
    }

    /**
     * Dựng trạng thái xuất phát: răng đem thử 生活歯, đúng một 部位病名行 Ｃ₂, màn
     * hình nạp lại.
     *
     * ⚠️ Thứ tự BẮT BUỘC: ghi `siga` TRƯỚC khi mở màn (BẪY 2).
     */
    async function resetPhase() {
        await writeSigaTeeth(Number(PAT_NO), { se: { [BUI_SLOT + 1]: SE_VITAL } })
        await purgeTestRows()
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: '',
                bui: buiAt(BUI_SLOT, BUI_VAL),
                dspBui: '右上6',
                disCd: [DIS_CD_C],
                disSb: [DIS_SB_C2],
                dspDis: 'Ｃ',
            },
        ])
        await openTreatmentScreen()
    }

    /**
     * Chốt 処置 `TRIGGER_CD/TRIGGER_SB` qua コードモード → 処置選択 → F9 確定 →
     * Enter ở ô 回. Đúng đường người dùng đi khi báo lỗi.
     */
    async function commitTrigger() {
        await closeDialogs(page)
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        // Con trỏ phải nằm trên 部位病名行 vừa seed thì dòng mới mới thừa kế 部位.
        const seededRow = ryoCells().filter({ hasText: 'Ｃ' }).first()
        await expect(seededRow, 'không thấy 部位病名行 vừa seed').toBeVisible({ timeout: 30_000 })
        await seededRow.click()

        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
        await step()

        await footerTen.click()
        await footerTen.fill(String(TRIGGER_CD))
        await footerTen.press('Enter')
        // Handler xoá input trước khi tra cứu → value === '' là mốc CÓ THẬT rằng
        // Enter đã được xử lý (Rule 7: không sleep).
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        await expect(
            trtPicker,
            `mã ${TRIGGER_CD} không mở được 処置選択 — master tháng này có mã đó không?`,
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === TRIGGER_SB)
        expect(
            idx,
            `処置選択 không có 枝番 ${TRIGGER_SB} của mã ${TRIGGER_CD} — đổi TEST_TRT_DT ` +
                'về tháng master còn hiệu lực rồi chạy lại',
        ).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // Sau 確定 con trỏ nằm ở ô 回 CỦA CHÍNH DÒNG vừa chốt, đang ở chế độ nhập
        // với sẵn "1". KHÔNG Enter ở đây thì đuôi Chk_CmtAuto/Chk_ChkAuto không chạy
        // (WinForm cũng vậy — cả hai nằm trong nhánh case 4).
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', {
            timeout: 20_000,
        })
        await page.keyboard.press('Enter')
        await step()
    }

    /**
     * Chờ lưới đứng yên với đủ các dòng đi kèm, vừa chờ vừa dọn dialog xen ngang.
     *
     * KHÔNG đọc lưới một phát ngay sau Enter (Rule 10.8): FE chèn 処置 trước, rồi
     * mới lần lượt `runCmtAutoCascade` → `runKarteCmtAuto` → `runChkAuto`, mỗi cái
     * một vòng request.
     */
    async function waitForFollowUpRows(needles: readonly string[]): Promise<string[]> {
        let last: string[] = []
        await expect
            .poll(
                async () => {
                    if ((await page.getByRole('dialog').count()) > 0) await closeDialogs(page, 2)
                    last = await ryoTexts()
                    return needles.filter((n) => !last.some((c) => norm(c).includes(n)))
                },
                {
                    timeout: FOLLOWUP_TIMEOUT,
                    intervals: Array.from({ length: 30 }, () => 1000),
                    message:
                        'Sau 回 Enter lưới vẫn thiếu dòng đi kèm — xem chuỗi ' +
                        'runCmtAutoCascade → runKarteCmtAuto → runChkAuto trong ' +
                        'treatment-entry-detail.tsx có chạy hết không.',
                },
            )
            .toEqual([])
        return last
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        // Bấm 「No」 cho 「〜を算定しますか？」 (Yes chỉ đổi popup này lấy popup khác,
        // Rule 14.1) và OK cho alert お茶コン xen ngang.
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        await page.addLocatorHandler(
            karteCmtDialog,
            async () => {
                await karteCmtDialog
                    .getByRole('button', { name: 'F10 戻る' })
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {})
            },
            { times: 30 },
        )

        // ── Master: kỳ vọng tính từ đây, không hardcode ──────────────────────
        const trigger = (await findMstTrt(TRT_DT, TRIGGER_CD)).find((r) => r.trtSb === TRIGGER_SB)
        triggerNm = trigger?.trtNm ?? ''
        slots = await findChkAutoSlots(TRIGGER_CD, TRIGGER_SB)
        cmts = await findCmtAutos(TRIGGER_CD, TRIGGER_SB)
        const masters = await Promise.all(slots.map((s) => findMstTrt(TRT_DT, s.trtCd)))
        slotMaster = new Map(
            slots.flatMap((s, i) => {
                const m = (masters[i] ?? []).find((r) => r.trtSb === s.trtSb)
                return m
                    ? ([[`${s.trtCd}/${s.trtSb}`, { trtNm: m.trtNm, score1: m.score1 }]] as const)
                    : []
            }),
        )
        console.log(
            `master: 処置 ${TRIGGER_CD}/${TRIGGER_SB} 「${triggerNm}」 — ` +
                `chk_auto ${slots.length} slot, cmt_auto ${cmts.length} dòng`,
        )

        // ── DB: chụp nguyên trạng siga rồi dựng trạng thái xuất phát ─────────
        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
        await resetPhase()
    })

    test.afterAll(async () => {
        await purgeTestRows().catch(() => 0)
        if (sigaBefore && !sigaRowCreated) {
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
        }
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('TC-1 自動算定 — chốt 処置 xong, chk_auto phải kéo các 処置 đi kèm xuống lưới', async () => {
        skipWithReason(
            slots.length === 0,
            `処置 ${TRIGGER_CD}/${TRIGGER_SB} không có dòng chk_auto trong master — ` +
                'không có gì để đo, đặt TEST_TRIGGER_CD/SB sang mã khác',
        )

        await commitTrigger()

        const expected = slots
            .map((s) => slotMaster.get(`${s.trtCd}/${s.trtSb}`))
            .filter((m): m is { trtNm: string; score1: number } => m !== undefined)
        skipWithReason(
            expected.length === 0,
            'các slot chk_auto không có dòng mst_trt hiệu lực trong tháng test — ' +
                'WinForm cũng bỏ qua chúng, không kết luận được gì',
        )

        const cells = await waitForFollowUpRows(expected.map((m) => norm(m.trtNm)))

        for (const m of expected) {
            const cell = cells.find((c) => norm(c).includes(norm(m.trtNm)))
            expect(
                cell,
                `chốt ${TRIGGER_CD}/${TRIGGER_SB} rồi mà lưới không có dòng 「${m.trtNm}」.\n` +
                    '  WinForm: frm203002.cs:5752 gọi ModMain.Chk_ChkAuto ngay sau 回 Enter\n' +
                    `  lưới đang có: ${JSON.stringify(cells.map(norm).filter(Boolean))}`,
            ).toBeDefined()

            // 点数 lấy từ master, không phải 0 — đây chính là 11点 bị mất trong báo cáo.
            const ten = await tenOfRow(norm(m.trtNm))
            expect(
                Number((ten ?? '').trim()),
                `dòng 「${m.trtNm}」 sai 点数 (mst_trt.score1 = ${m.score1}), lưới in 「${ten}」`,
            ).toBe(m.score1)
        }
    })

    test('TC-2 コメント自動入力 — cmt_auto tự áp dụng phải rơi xuống lưới, không bị nuốt', async () => {
        const autoApplied = cmts.filter((c) => c.dispNo !== 0)
        skipWithReason(
            autoApplied.length === 0,
            `処置 ${TRIGGER_CD}/${TRIGGER_SB} không có dòng cmt_auto sinh dòng riêng ` +
                '(disp_no ≠ 0) — không có gì để đo',
        )
        // Batch cần người chọn thì đường đi là カルテ記載選択, không phải nhánh này —
        // dialog đó đã có spec riêng (dialogs-selection/cmt-auto-picker-dialog.spec.ts).
        const needsPick = cmts.length >= 2 && cmts.some((c) => c.noChk === 0)
        skipWithReason(
            needsPick,
            'batch cmt_auto này cần người chọn (≥2 dòng và có no_chk = 0) ⇒ đi đường ' +
                'カルテ記載選択, đo ở dialogs-selection/cmt-auto-picker-dialog.spec.ts',
        )

        // TC-1 đã chốt 処置 rồi; lưới hiện tại là kết quả của cùng một cú Enter.
        const cells = await waitForFollowUpRows(autoApplied.map((c) => norm(c.cmtNm)))

        for (const c of autoApplied) {
            expect(
                cells.some((x) => norm(x).includes(norm(c.cmtNm))),
                `lưới thiếu カルテコメント 「${c.cmtNm}」 (${c.cmtCd}/${c.cmtSb}).\n` +
                    '  WinForm: Chk_CmtAuto mở frm203012 gType.Auto rồi frmCmt3_Cmt3_SetData\n' +
                    '  ghi thẳng khi không cần hỏi (frm203002.cs:10034).',
            ).toBe(true)
        }
    })

    test('TC-3 disp_no quyết định comment nằm TRÊN hay DƯỚI dòng 処置', async () => {
        const placed = cmts.filter((c) => c.dispNo !== 0)
        skipWithReason(placed.length === 0, 'không có dòng cmt_auto nào sinh dòng riêng')
        skipWithReason(
            cmts.length >= 2 && cmts.some((c) => c.noChk === 0),
            'batch cần người chọn — không đi nhánh tự áp dụng',
        )
        skipWithReason(triggerNm === '', `không tra được 処置名 của ${TRIGGER_CD}/${TRIGGER_SB}`)

        const cells = (await ryoTexts()).map(norm)
        const trtIdx = cells.findIndex((c) => c.includes(norm(triggerNm)))
        expect(trtIdx, `không thấy dòng 処置 「${triggerNm}」 trên lưới`).toBeGreaterThanOrEqual(0)

        for (const c of placed) {
            const idx = cells.findIndex((x) => x.includes(norm(c.cmtNm)))
            expect(idx, `không thấy comment 「${c.cmtNm}」`).toBeGreaterThanOrEqual(0)
            if (c.dispNo < 0) {
                expect(
                    idx,
                    `cmt_auto.disp_no = ${c.dispNo} (< 0) ⇒ 「${c.cmtNm}」 phải nằm TRÊN ` +
                        `「${triggerNm}」 (frm203002.cs:10086), nhưng đang ở dưới`,
                ).toBeLessThan(trtIdx)
            } else {
                expect(
                    idx,
                    `cmt_auto.disp_no = ${c.dispNo} (> 0) ⇒ 「${c.cmtNm}」 phải nằm DƯỚI ` +
                        `「${triggerNm}」 (frm203002.cs:10108), nhưng đang ở trên`,
                ).toBeGreaterThan(trtIdx)
            }
        }
    })

    test('TC-4 các dòng đi kèm nằm ĐÚNG cụm quanh 処置, không trôi xuống cuối ngày', async () => {
        skipWithReason(slots.length === 0, 'không có slot chk_auto để đo')
        skipWithReason(triggerNm === '', 'không tra được 処置名 của mã trigger')

        const cells = (await ryoTexts()).map(norm)
        const trtIdx = cells.findIndex((c) => c.includes(norm(triggerNm)))
        expect(trtIdx, `không thấy dòng 処置 「${triggerNm}」`).toBeGreaterThanOrEqual(0)

        // WinForm AddRow chèn NGAY tại con trỏ, mà con trỏ lúc này đứng ngay sau
        // dòng 処置 ⇒ các 処置 của chk_auto là những dòng LIỀN KỀ bên dưới, theo đúng
        // thứ tự slot (modMain.cs:861 vòng `for i < 5`).
        const below = cells.slice(trtIdx + 1)
        for (const s of slots) {
            const m = slotMaster.get(`${s.trtCd}/${s.trtSb}`)
            if (!m) continue
            const at = below.findIndex((c) => c.includes(norm(m.trtNm)))
            expect(
                at,
                `dòng 「${m.trtNm}」 phải nằm DƯỚI 「${triggerNm}」 (AddRow tại con trỏ, ` +
                    `modMain.cs:958). Lưới: ${JSON.stringify(cells.filter(Boolean))}`,
            ).toBeGreaterThanOrEqual(0)
        }
    })
})
