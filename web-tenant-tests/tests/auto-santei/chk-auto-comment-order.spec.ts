import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteChkAutoCompanionRows,
    SEED_PAT_NO_BASE,
    deleteTestPatient,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    findChkAutoSlots,
    findCmtAutos,
    findMstTrt,
    findTreInpFlg,
    seedTestPatient,
    seedTreatmentRows,
    writeKonTeeth,
    writeSigaTeeth,
    type ChkAutoSlot,
    type CmtAutoRow,
    type MstTrtRow,
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
 * 診療入力 — THỨ TỰ của cái đuôi sau một cú chốt 処置, và cái ĐUÔI CỦA ĐUÔI.
 *
 * `chk-auto-after-commit.spec.ts` đã đo "dòng đi kèm CÓ xuất hiện không". Spec này
 * đo thứ hai: chúng xuất hiện Ở ĐÂU, và slot của `chk_auto` có kéo theo
 * カルテコメント của CHÍNH NÓ không.
 *
 * ĐẶC TÍNH KIỂM THỬ: assert bám THEO WINFORM (src/OCHACOM/INP), không bám code web.
 * Kỳ vọng TÍNH LẠI từ master (`chk_auto`, `cmt_auto`+`mst_cmt2`, `mst_trt`) —
 * không hardcode 「264/3」「ルーティングセメント」, tenant khác có master khác.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BỐN LỖI SPEC NÀY KHOÁ (điều tra 2026-09-14)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * (A) `runChkAuto` chỉ chạy NỬA `Chk_CmtAuto`
 *     modMain.cs:1033 gọi `Chk_CmtAuto(cd[i], sb[i], …)` cho từng slot — mà hàm đó
 *     có HAI nửa: `prgCmtAuto` (摘要コメントパック, modMain.cs:770) và bảng `CMTAUTO`
 *     → frm203012 (カルテコメント, :779). Web chỉ chạy nửa đầu ⇒ カルテコメント của
 *     slot biến mất hoàn toàn.
 *
 * (B) Dòng `chk_auto` chèn TRÊN カルテコメント `disp_no > 0` của 処置 gốc
 *     `frmCmt3_Set_Data2` kết thúc bằng `CurrentCell = [X, intTempRow + 1]`
 *     (frm203002.cs:10164) ⇒ con trỏ tụt xuống DƯỚI comment vừa chèn, nên
 *     `Chk_ChkAuto` chạy sau đó `AddRow()` ở phía dưới nữa. Web neo cả hai vào
 *     CÙNG dòng 処置 nên dòng chk_auto chèn sau lại nằm TRÊN.
 *     ⚠️ Lúc lưu, `disp_no` = thứ tự hiển thị ⇒ sai chỗ là sai dữ liệu lưu.
 *
 * (C) Không interleave theo từng slot
 *     WinForm: AddRow slot i → Chk_CmtAuto cho slot i → mới sang slot i+1. Web
 *     đẩy hết slot xuống rồi mới chạy cascade ⇒ comment của slot 1 rơi xuống dưới
 *     slot cuối.
 *
 * (D) Nhánh tự-áp-dụng bỏ `frmCmt3_PrmChk`
 *     frm203002.cs:10051: comment nào còn `*` thì frm203048 (パラメータ) phải bung
 *     cho người nhập, TRƯỚC khi `frmCmt3_Set_Data2` ghi xuống lưới. Web ghi thẳng
 *     cả dấu sao vào `dsp_trt`. Trên master dev có 23 cặp (処置コード, 枝番)
 *     tự-áp-dụng mà text chứa `*` (170/171/172 リーマー、122 `*根****mm`、313 …).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * HAI KỊCH BẢN, CHỌN THEO MASTER CHỨ KHÔNG THEO Ý MUỐN
 * ═════════════════════════════════════════════════════════════════════════════
 * Phase 1 — 処置 mà CHÍNH NÓ có カルテコメント `disp_no > 0` tự áp dụng, VÀ có
 *   `chk_auto` trỏ tới một slot mà slot đó LẠI có カルテコメント của riêng nó.
 *   Master dev: `204/0` → slot `264/3`.
 *
 *       WinForm                                     web (trước khi sửa)
 *       ──────────────────────────────────────      ─────────────────────────
 *       204/0 (処置)                                204/0 (処置)
 *       0.3mm結紮線＋ｽｰﾊﾟｰﾎﾞﾝﾄﾞ   ← disp_no 2       264/3            ← (B) sai chỗ
 *       264/3 (slot chk_auto)                       0.3mm結紮線＋…
 *       ルーティングセメント        ← (A)(C)          (KHÔNG CÓ)       ← (A) mất hẳn
 *
 * Phase 2 — 処置 có カルテコメント tự áp dụng mà text còn `*`, để đo (D), cộng thêm
 *   một lần nữa cho (B). Master dev: `170/0` — 4 dòng `cmt_auto` (disp_no -2/-1/3/4,
 *   hai dòng chứa `*`) + `chk_auto` → `310/2`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY (kế thừa từ chk-auto-after-commit.spec.ts, đừng gỡ)
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. LƯỚI CHỨA CẢ THÁNG. Bệnh nhân test có sẵn dòng TRÙNG TÊN ở ngày khác. Mọi
 *    assert phải neo vào LẦN XUẤT HIỆN GẦN dòng 処置 vừa chốt, không `find` toàn lưới.
 * 2. Text hiển thị của `cmt_auto` lấy từ `mst_cmt2.cmt_nm`, KHÔNG phải
 *    `cmt_auto.cmt_nm` (bản chép mồi đã trôi). `findCmtAutos` đã JOIN đúng.
 * 3. `closeDialogs` bấm F10 lên MỌI dialog ⇒ nó sẽ HUỶ frm203048 và spec đỏ oan.
 *    Phase 2 tự xử lý dialog パラメータ, không gọi `closeDialogs` khi nó đang mở.
 * 4. NFKC + gộp khoảng trắng cho CẢ HAI vế mọi phép so chuỗi.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 TEST_ALLOW_SAVE=1 \
 *       npx playwright test tests/auto-santei/chk-auto-comment-order.spec.ts
 *
 * Spec KHÔNG bấm F9 登録. Cần `TEST_ALLOW_SAVE=1` vì có ghi nóng bảng `siga`.
 */

/**
 * Bệnh nhân test — spec TỰ DỰNG, không mượn bệnh nhân của dev DB.
 *
 * Bản đầu dùng bệnh nhân 10: phải chụp `siga` rồi trả lại ở `afterAll`, và Phase 2
 * dựa vào việc bệnh nhân đó tình cờ có 右上3 một chân (`kon.ekon_6 = 1`). Cả hai
 * đều là phụ thuộc vào dữ liệu người khác có thể đổi, và `afterAll` chỉ dọn ĐÚNG
 * NGÀY test nên một lần chạy bị ngắt để lại rác ở ngày khác cùng tháng (lưới
 * 診療入力 render CẢ THÁNG ⇒ lần sau đỏ oan).
 *
 * Giờ spec ghi thẳng `kon.ekon_*` và `deleteTestPatient` xoá sạch bệnh nhân ở
 * `afterAll` — không còn cửa nào cho rác, cũng không cần snapshot/restore.
 */
const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 53))
const TRT_DT = trtDt(TODAY_ISO)

/** Phase 1 — 処置 có cmt_auto của mình VÀ chk_auto trỏ tới slot cũng có cmt_auto. */
const P1_CD = Number(process.env.TEST_P1_CD ?? 204)
const P1_SB = Number(process.env.TEST_P1_SB ?? 0)

/** Phase 2 — 処置 có cmt_auto tự áp dụng mà text còn `*`. */
const P2_CD = Number(process.env.TEST_P2_CD ?? 170)
const P2_SB = Number(process.env.TEST_P2_SB ?? 0)

/** 病名 seed cho 部位病名行: `dis_cd` 100 =「Ｃ」, `dis_sb` 2 =「Ｃ₂」. */
const DIS_CD_C = 100
const DIS_SB_C2 = 2

/**
 * Ô 部位 seed, THEO TỪNG PHASE (bố cục 32 ô, `tooth-bui.ts:25`: 0-7 右上 8→1).
 *
 * ⚠️ 回数 phụ thuộc răng. `CalcCnt.getCalcCnt` (CommonChk gọi qua modMain.cs:650)
 * đọc `unit` của 処置 rồi đếm trên 部位 — mà `170/0 抜髄(1根)` có `unit = 61`
 * (１根管), tức chỉ đếm răng có ĐÚNG 1 chân (`func3xCnt`). Bệnh nhân 10 có
 * 右上6 = 3 chân (`kon.ekon_3 = 3`) ⇒ 回数 = 0 ⇒ WinForm tính 234 × 0 = 0 点 VÀ
 * bỏ luôn `Chk_ChkAuto` (frm203002.cs:5740 chặn ở 回数 ≥ 1). Đặt Phase 2 lên
 * 右上6 thì mọi assert về chk_auto trở thành vô nghĩa, và app còn bung cảnh báo
 * 「算定可能な部位がありません」 mỗi lượt chạy.
 *
 * Nên Phase 2 dùng 右上3 (index 5, răng nanh — `kon.ekon_6 = 1`, một chân) để
 * 抜髄(1根) thật sự tính được. Phase 1 (`204/0`, `unit = 3` 顎単位) không phụ thuộc
 * số chân nên giữ 右上6.
 *
 * Trường hợp 回数 = 0 được chốt riêng ở
 * `treatment-grid/treatment-calc-cnt-parity.spec.ts`.
 */
const P1_BUI_SLOT = 2
const P2_BUI_SLOT = 5
const BUI_VAL = 1

/**
 * `siga.se_*` của một 永久歯 — **0 = 生活歯**, 1..3 = 失活歯/分割歯, 4 = 欠損歯
 * (`CommonChk.chkSiga`, CommonChk.cs:518-540; bản port BE
 * `Ochacom.Domain/Services/Treatments/ToothConditionChecker.cs` ghi cùng miền giá trị,
 * `SigaToothCondition.PermVital = 0`).
 *
 * ⚠️ 0 CŨNG là DEFAULT của cột và là trạng thái thật của bệnh nhân test trong DB dev
 * (`se_1..se_32` đều 0), nên đây mới là trạng thái xuất phát "răng còn sống" đúng
 * nghĩa. Trước đây spec đặt 1 kèm chú 「1 = 生活歯」 — sai: 1 là 失活歯, tức đúng cái
 * trạng thái mà 抜髄 (170/176) TẠO RA sau khi chốt, nên Phase 2 đang 抜髄 một chiếc
 * răng đã chết sẵn. Bộ FlaUI dùng 0 theo nguồn chân lý WinForm; giữ hai vế bằng nhau.
 *
 * Với 170/0 và 204/0 thì `mst_trt.seikatu = sikkatu = 0` nên `chkSiga` không chặn theo
 * `se` ở cả hai giá trị — đổi 1 → 0 là trung tính về hành vi, chỉ để trạng thái xuất
 * phát đúng nghĩa và khớp FlaUI.
 */
const SE_VITAL = 0

const FOLLOWUP_TIMEOUT = 30_000
const ALLOW_SAVE = allowSave

/**
 * Giá trị điền thay cho mỗi cụm `*` trong frm203048. Ký tự thường, không dấu sao,
 * để assert "lưới không còn `*`" là assert thật.
 */
const PARAM_FILL = '9'

/**
 * Trần số lần frm203048 chờ trong một cú chốt. Một 処置 có tối đa vài dòng
 * `cmt_auto`; đặt trần để phase KHÔNG có `*` thoát sau đúng một nhịp chờ.
 */
const MAX_PARAM_DIALOGS = 8

/** NFKC + gộp khoảng trắng — áp cho CẢ hai vế mọi phép so chuỗi (BẪY 4). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Mảng 32 ô 部位 với đúng ô `slot` mang `val`. */
const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

/**
 * Text sau khi frm203048 được điền: mỗi CỤM `*` liền nhau là MỘT tham số
 * (`getAsta` gom run cùng ký tự, frm203048.cs:159-246), đổi thành `PARAM_FILL`.
 */
const filledText = (s: string) => s.replace(/\*+/g, PARAM_FILL)

const hasParam = (s: string) => s.includes('*')

// Rule 5.3 — skip cấp file phải nói rõ vì sao.
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (seed 部位病名行 + đọc master để tự tính kỳ vọng)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (chốt 処置 ghi nóng bảng siga)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  auto-santei/chk-auto-comment-order.spec.ts BỎ QUA TOÀN BỘ — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/auto-santei/chk-auto-comment-order.spec.ts\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed 部位病名行 và đọc chk_auto/cmt_auto')
test.skip(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: chốt 処置 ghi nóng bảng siga')

test.describe.configure({ mode: 'serial', timeout: 420_000 })

test.describe('診療入力 — thứ tự 自動算定 ↔ カルテコメント (Chk_ChkAuto × Chk_CmtAuto)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let treInpFlg = 0
    /** Dialog frm203048 パラメータ — Phase 2 tự điền, KHÔNG để closeDialogs đụng. */
    let paramDialog: Locator

    const displayName = (m: MstTrtRow) => (treInpFlg === 1 ? m.cctNm : m.trtNm)

    /** Ô 療法・処置 của lưới đăng ký (RegiCol.ryo = 2). */
    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')

    async function ryoTexts(): Promise<string[]> {
        return ryoCells().evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    }

    /** Chỉ số lần xuất hiện CUỐI của `needle` (BẪY 1). */
    const lastIdxOf = (cells: readonly string[], needle: string) => {
        for (let i = cells.length - 1; i >= 0; i--) {
            if ((cells[i] ?? '').includes(needle)) return i
        }
        return -1
    }

    /** Chỉ số bản GẦN `anchor` nhất — bản đã lưu ở ngày khác nằm xa hơn (BẪY 1). */
    const nearestIdxOf = (cells: readonly string[], needle: string, anchor: number) => {
        let idx = -1
        for (let i = 0; i < cells.length; i++) {
            if (!(cells[i] ?? '').includes(needle)) continue
            if (idx < 0 || Math.abs(i - anchor) < Math.abs(idx - anchor)) idx = i
        }
        return idx
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

    /** Chờ chuỗi AutoSantei lúc mở màn chạy hết rồi dọn (không `waitForTimeout` trần). */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await page.waitForTimeout(700)
        }
    }

    async function purgeTestRows(cd: number, sb: number): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, cd).catch(() => 0)
        n += await deleteChkAutoCompanionRows(Number(PAT_NO), TRT_DT, cd, sb).catch(() => 0)
        return n
    }

    /**
     * ⚠️ Thứ tự BẮT BUỘC: dựng bệnh nhân + ghi `siga`/`kon` TRƯỚC khi mở màn — FE
     * chốt ảnh chụp 歯式 ở lần fetch đầu sau khi mount.
     *
     * `seedTestPatient` xoá sạch rồi dựng lại nên cũng là bước dọn rác của lần chạy
     * trước (kể cả lần bị ngắt, kể cả dòng ở ngày khác).
     */
    async function resetPhase(cd: number, sb: number, buiSlot: number) {
        await seedTestPatient({ patNo: Number(PAT_NO) })
        // Phase 2 chốt 170/0 抜髄(1根) — `unit 61` chỉ đếm răng ĐÚNG 1 chân
        // (`CalcCntService.Func3xCnt`). Gán thẳng thay vì trông chờ dữ liệu có sẵn:
        // nếu ô này nhiều chân thì 回数 = 0, Chk_ChkAuto không chạy và mọi assert về
        // thứ tự chk_auto mất nghĩa.
        await writeKonTeeth(Number(PAT_NO), { ekon: { [P2_BUI_SLOT + 1]: 1 } })
        await writeSigaTeeth(Number(PAT_NO), { se: { [buiSlot + 1]: SE_VITAL } })
        await purgeTestRows(cd, sb)
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: '',
                bui: buiAt(buiSlot, BUI_VAL),
                dspBui: buiSlot === P1_BUI_SLOT ? '右上6' : '右上3',
                disCd: [DIS_CD_C],
                disSb: [DIS_SB_C2],
                dspDis: 'Ｃ',
            },
        ])
        await openTreatmentScreen()
    }

    /** Chốt 処置 qua コードモード → 処置選択 → F9 確定 → Enter ở ô 回. */
    async function commitTrigger(cd: number, sb: number) {
        await closeDialogs(page)
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        const seededRow = ryoCells().filter({ hasText: 'Ｃ' }).first()
        await expect(seededRow, 'không thấy 部位病名行 vừa seed').toBeVisible({ timeout: 30_000 })
        await seededRow.click()

        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
        await step()

        await footerTen.click()
        await footerTen.fill(String(cd))
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        await expect(
            trtPicker,
            `mã ${cd} không mở được 処置選択 — master tháng này có mã đó không?`,
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === sb)
        expect(
            idx,
            `処置選択 không có 枝番 ${sb} của mã ${cd} — đổi TEST_TRT_DT về tháng master ` +
                'còn hiệu lực rồi chạy lại',
        ).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // Sau 確定 con trỏ nằm ở ô 回 CỦA CHÍNH DÒNG vừa chốt, đang ở chế độ nhập với
        // 回数 do CalcCnt tính (modMain.cs:650 → frm203016.cs:1531 ghi NGUYÊN VĂN).
        // Cả hai phase đều chọn 部位 hợp với `unit` của 処置 nên ra 1; trường hợp 0
        // (unit không hợp răng) nằm ở treatment-grid/treatment-calc-cnt-parity.spec.ts.
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', {
            timeout: 20_000,
        })
        await page.keyboard.press('Enter')
        await step()
    }

    /** Ô nhập của frm203048. Query lại mỗi vòng: dialog remount theo từng comment. */
    const paramInput = () => paramDialog.locator('input').first()

    /**
     * Điền hết frm203048 đang xếp hàng. Mỗi lần: `fill` chuỗi đã thay dấu sao rồi
     * F9 確定 — `btnF9_Click` quét từ index 0 nên chỉ đóng khi KHÔNG còn `*`
     * (frm203048.cs:159-166), tức là bài test cũng đang kiểm luôn điều đó.
     *
     * ⚠️ KHÔNG assert `paramDialog` biến mất. `frmCmt3_PrmChk` chạy cho TỪNG comment
     * còn `*` (frm203002.cs:10038), nên dialog của comment kế bung NGAY sau khi cái
     * trước đóng — locator dùng chung vẫn "visible" liên tục. Đã vấp thật:
     * `toBeHidden` đỏ oan trong khi app làm đúng. Mốc CÓ THẬT là ô nhập đổi giá trị
     * (comment khác) hoặc dialog biến mất hẳn.
     *
     * ⚠️ Điền NGUYÊN VĂN giá trị đọc ra, không `norm()` trước khi gõ: NFKC đổi
     * 「（」 thành 「(」 nên sẽ ghi xuống lưới một chuỗi mà người dùng không bao giờ gõ.
     * `norm` chỉ dùng lúc SO SÁNH.
     *
     * Trả về danh sách text đã xác nhận, theo thứ tự dialog bung ra.
     */
    async function fillPendingParamDialogs(maxDialogs: number): Promise<string[]> {
        const confirmed: string[] = []
        for (let i = 0; i < maxDialogs; i++) {
            const appeared = await paramInput()
                .waitFor({ state: 'visible', timeout: i === 0 ? 20_000 : 8_000 })
                .then(() => true)
                .catch(() => false)
            if (!appeared) break

            const raw = await paramInput().inputValue()
            if (!hasParam(raw)) {
                throw new Error(
                    `frm203048 bung với 「${raw}」 — chuỗi này không còn \`*\`, đáng lẽ ` +
                        'frmCmt3_PrmChk không được gọi cho nó (frm203002.cs:10051).',
                )
            }
            const out = filledText(raw)
            await paramInput().fill(out)
            await paramDialog.getByRole('button', { name: /F9\s*確定/ }).click()

            await expect
                .poll(
                    async () => {
                        if (!(await paramDialog.isVisible().catch(() => false))) return '<đóng>'
                        return paramInput()
                            .inputValue()
                            .catch(() => '<đang remount>')
                    },
                    {
                        timeout: 10_000,
                        message:
                            `F9 với 「${out}」 mà frm203048 vẫn giữ nguyên chuỗi đó — ` +
                            'btnF9_Click chỉ đóng khi quét từ index 0 không còn cụm `*` ' +
                            '(frm203048.cs:159-166).',
                    },
                )
                .not.toBe(out)

            confirmed.push(out)
            await step()
        }
        return confirmed
    }

    /**
     * Chốt một phase ĐÚNG MỘT LẦN rồi ghi nhớ, để các TC sau dùng lại cùng một lưới
     * mà KHÔNG phụ thuộc vào việc TC trước có chạy hay bị skip.
     *
     * `skipWithReason` trong TC đầu không dựng lưới, nên nếu TC sau cứ giả định nó
     * đã chạy thì sẽ đỏ vì timeout chứ không skip — một kiểu đỏ oan rất khó đọc.
     */
    const committed = new Map<string, string[]>()
    async function ensureCommitted(cd: number, sb: number, buiSlot: number): Promise<string[]> {
        const key = `${cd}/${sb}`
        const done = committed.get(key)
        if (done) return done
        await resetPhase(cd, sb, buiSlot)
        await commitTrigger(cd, sb)
        // Điền hết frm203048 đang xếp hàng (phase không có `*` thì trả mảng rỗng
        // sau một nhịp chờ ngắn — `fillPendingParamDialogs` tự thoát khi không thấy).
        const confirmed = await fillPendingParamDialogs(MAX_PARAM_DIALOGS)
        committed.set(key, confirmed)
        return confirmed
    }

    /** Chờ lưới đứng yên với đủ các dòng mong đợi, neo theo dòng 処置 vừa chốt. */
    async function waitForRowsAround(triggerNm: string, needles: readonly string[]) {
        let last: string[] = []
        await expect
            .poll(
                async () => {
                    last = (await ryoTexts()).map(norm)
                    const at = lastIdxOf(last, norm(triggerNm))
                    if (at < 0) return [...needles]
                    return needles.filter((n) => nearestIdxOf(last, n, at) < 0)
                },
                {
                    timeout: FOLLOWUP_TIMEOUT,
                    intervals: Array.from({ length: 30 }, () => 1000),
                    message:
                        'Sau 回 Enter lưới còn thiếu dòng đi kèm — xem chuỗi ' +
                        'runCmtAutoCascade → runKarteCmtAuto → runChkAuto (mỗi slot một vòng) ' +
                        'trong treatment-entry-detail.tsx.',
                },
            )
            .toEqual([])
        return last
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        // KHÔNG bật kartePicker: Phase 1/2 dùng master tự-áp-dụng, không có
        // カルテ記載選択; nếu nó bung thì đó là tín hiệu master đã đổi, để nó đỏ.
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })
        paramDialog = page.getByRole('dialog').filter({ hasText: 'パ ラ メ ー タ' })

        treInpFlg = await findTreInpFlg()
    })

    test.afterAll(async () => {
        // Xoá HẲN bệnh nhân: person + insurance + siga + kon + TOÀN BỘ trn_trn.
        await deleteTestPatient(Number(PAT_NO)).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 1 — (A) slot kéo カルテコメント của nó, (B) thứ tự so với comment gốc
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-1 slot của chk_auto phải kéo theo カルテコメント của CHÍNH NÓ (Chk_CmtAuto nửa CMTAUTO)', async () => {
        const triggerMst = (await findMstTrt(TRT_DT, P1_CD)).find((r) => r.trtSb === P1_SB)
        skipWithReason(!triggerMst, `master tháng test không có 処置 ${P1_CD}/${P1_SB}`)
        const triggerNm = displayName(triggerMst!)

        const slots: ChkAutoSlot[] = await findChkAutoSlots(P1_CD, P1_SB)
        skipWithReason(
            slots.length === 0,
            `処置 ${P1_CD}/${P1_SB} không có dòng chk_auto — đặt TEST_P1_CD/SB sang mã khác`,
        )

        // Slot nào có カルテコメント TỰ ÁP DỤNG của riêng nó? Đó mới là thứ (A) làm mất.
        const slotCmts = await Promise.all(slots.map((s) => findCmtAutos(s.trtCd, s.trtSb)))
        const autoApplied = (rows: CmtAutoRow[]) =>
            rows.length > 0 && !(rows.length > 1 && rows.some((c) => c.noChk === 0))
        const target = slots
            .map((s, i) => ({ slot: s, cmts: slotCmts[i] ?? [] }))
            .find((x) => autoApplied(x.cmts) && x.cmts.some((c) => c.dispNo > 0))
        skipWithReason(
            !target,
            `không slot nào của ${P1_CD}/${P1_SB} có カルテコメント tự áp dụng disp_no > 0 — ` +
                'không đo được nửa CMTAUTO, đặt TEST_P1_CD/SB sang mã khác',
        )

        const slotMst = (await findMstTrt(TRT_DT, target!.slot.trtCd)).find(
            (r) => r.trtSb === target!.slot.trtSb,
        )
        skipWithReason(
            !slotMst,
            `slot ${target!.slot.trtCd}/${target!.slot.trtSb} không có mst_trt hiệu lực — ` +
                'WinForm cũng bỏ qua slot này',
        )
        const slotNm = displayName(slotMst!)
        const slotCmtNms = target!.cmts.filter((c) => c.dispNo > 0).map((c) => norm(c.cmtNm))

        await ensureCommitted(P1_CD, P1_SB, P1_BUI_SLOT)

        const cells = await waitForRowsAround(triggerNm, [norm(slotNm), ...slotCmtNms])

        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        const slotIdx = nearestIdxOf(cells, norm(slotNm), trtIdx)
        for (const cmtNm of slotCmtNms) {
            const cmtIdx = nearestIdxOf(cells, cmtNm, slotIdx)
            expect(
                cmtIdx,
                `カルテコメント 「${cmtNm}」 của slot 「${slotNm}」 phải nằm DƯỚI chính slot đó ` +
                    '(modMain.cs:1033 gọi Chk_CmtAuto cho slot vừa AddRow, rồi ' +
                    'frmCmt3_Set_Data2 chèn disp_no > 0 ngay dưới con trỏ).\n' +
                    `  lưới: ${JSON.stringify(cells.filter(Boolean))}`,
            ).toBeGreaterThan(slotIdx)
        }
    })

    test('TC-2 dòng chk_auto phải nằm DƯỚI カルテコメント disp_no > 0 của 処置 gốc', async () => {
        // Dùng lại đúng lưới TC-1 vừa dựng — cùng một cú Enter.
        const triggerMst = (await findMstTrt(TRT_DT, P1_CD)).find((r) => r.trtSb === P1_SB)
        skipWithReason(!triggerMst, `master tháng test không có 処置 ${P1_CD}/${P1_SB}`)
        const triggerNm = displayName(triggerMst!)

        const ownCmts = await findCmtAutos(P1_CD, P1_SB)
        const needsPick = ownCmts.length > 1 && ownCmts.some((c) => c.noChk === 0)
        skipWithReason(
            needsPick,
            `カルテコメント của ${P1_CD}/${P1_SB} cần người chọn ⇒ đi đường カルテ記載選択, ` +
                'không phải nhánh tự áp dụng',
        )
        const belowCmts = ownCmts.filter((c) => c.dispNo > 0).map((c) => norm(c.cmtNm))
        skipWithReason(
            belowCmts.length === 0,
            `処置 ${P1_CD}/${P1_SB} không có カルテコメント disp_no > 0 — không có gì để so thứ tự`,
        )

        const slots = await findChkAutoSlots(P1_CD, P1_SB)
        const slotMsts = await Promise.all(slots.map((s) => findMstTrt(TRT_DT, s.trtCd)))
        const slotNms = slots
            .map((s, i) => (slotMsts[i] ?? []).find((r) => r.trtSb === s.trtSb))
            .filter((m): m is MstTrtRow => m !== undefined)
            .map((m) => norm(displayName(m)))
        skipWithReason(slotNms.length === 0, 'không slot chk_auto nào có mst_trt hiệu lực')

        await ensureCommitted(P1_CD, P1_SB, P1_BUI_SLOT)
        const cells = await waitForRowsAround(triggerNm, [...belowCmts, ...slotNms])
        const trtIdx = lastIdxOf(cells, norm(triggerNm))

        // Mốc: カルテコメント disp_no > 0 CUỐI CÙNG của 処置 gốc.
        const lastOwnCmtIdx = Math.max(
            ...belowCmts.map((n) => nearestIdxOf(cells, n, trtIdx)),
        )
        expect(lastOwnCmtIdx, 'không thấy カルテコメント disp_no > 0 của 処置 gốc').toBeGreaterThan(
            trtIdx,
        )

        for (const slotNm of slotNms) {
            const slotIdx = nearestIdxOf(cells, slotNm, trtIdx)
            expect(
                slotIdx,
                `dòng 自動算定 「${slotNm}」 phải nằm DƯỚI カルテコメント disp_no > 0 của ` +
                    `「${triggerNm}」.\n` +
                    '  WinForm: frmCmt3_Set_Data2 kết thúc bằng CurrentCell = [X, intTempRow + 1]\n' +
                    '  (frm203002.cs:10164) ⇒ con trỏ đã tụt xuống dưới comment; Chk_ChkAuto\n' +
                    '  AddRow() từ đó (modMain.cs:958).\n' +
                    '  ⚠️ Lúc lưu, disp_no = thứ tự hiển thị ⇒ sai chỗ là sai dữ liệu lưu.\n' +
                    `  lưới: ${JSON.stringify(cells.filter(Boolean))}`,
            ).toBeGreaterThan(lastOwnCmtIdx)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Phase 2 — (D) frm203048 cho `*`, và (B) một lần nữa trên master khác
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-3 カルテコメント còn `*` phải bung frm203048 trước khi ghi xuống lưới', async () => {
        const triggerMst = (await findMstTrt(TRT_DT, P2_CD)).find((r) => r.trtSb === P2_SB)
        skipWithReason(!triggerMst, `master tháng test không có 処置 ${P2_CD}/${P2_SB}`)
        const triggerNm = displayName(triggerMst!)

        const cmts = await findCmtAutos(P2_CD, P2_SB)
        const needsPick = cmts.length > 1 && cmts.some((c) => c.noChk === 0)
        skipWithReason(
            needsPick,
            `カルテコメント của ${P2_CD}/${P2_SB} cần người chọn — TC này đo nhánh tự áp dụng`,
        )
        const withParam = cmts.filter((c) => hasParam(c.cmtNm))
        skipWithReason(
            withParam.length === 0,
            `không dòng cmt_auto nào của ${P2_CD}/${P2_SB} còn \`*\` — đặt TEST_P2_CD/SB ` +
                'sang mã khác (master dev: 170/171/172/122/313 …)',
        )

        // Mỗi comment có `*` là một lần frm203048 (frmCmt3_PrmChk chạy cho TỪNG
        // outData, frm203002.cs:10038).
        const confirmed = await ensureCommitted(P2_CD, P2_SB, P2_BUI_SLOT)
        expect(
            confirmed.length,
            `phải bung ${withParam.length} lần frm203048 (mỗi カルテコメント còn \`*\` một lần, ` +
                'frm203002.cs:10051) nhưng chỉ thấy ' +
                `${confirmed.length}. Comment có \`*\`: ` +
                JSON.stringify(withParam.map((c) => c.cmtNm)),
        ).toBe(withParam.length)

        const expectedTexts = cmts.filter((c) => c.dispNo !== 0).map((c) => norm(filledText(c.cmtNm)))
        const cells = await waitForRowsAround(triggerNm, expectedTexts)

        // Không còn dấu sao nào lọt xuống lưới quanh dòng vừa chốt.
        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        const window = cells.slice(
            Math.max(0, trtIdx - cmts.length - 1),
            trtIdx + cmts.length + 2,
        )
        expect(
            window.filter((c) => c.includes('*')),
            'lưới còn dòng chứa `*` quanh 処置 vừa chốt — frmCmt3_PrmChk phải thay hết ' +
                'tham số TRƯỚC khi frmCmt3_Set_Data2 ghi (frm203002.cs:10038-10040)',
        ).toEqual([])
    })

    test('TC-4 disp_no vẫn quyết định TRÊN/DƯỚI sau khi đã điền tham số', async () => {
        const triggerMst = (await findMstTrt(TRT_DT, P2_CD)).find((r) => r.trtSb === P2_SB)
        skipWithReason(!triggerMst, `master tháng test không có 処置 ${P2_CD}/${P2_SB}`)
        const triggerNm = displayName(triggerMst!)

        const cmts = await findCmtAutos(P2_CD, P2_SB)
        skipWithReason(
            cmts.length > 1 && cmts.some((c) => c.noChk === 0),
            'batch cần người chọn — không đi nhánh tự áp dụng',
        )
        const placed = cmts.filter((c) => c.dispNo !== 0)
        skipWithReason(placed.length === 0, 'không có dòng cmt_auto nào sinh dòng riêng')

        // Lưới của TC-3, cùng một cú Enter.
        await ensureCommitted(P2_CD, P2_SB, P2_BUI_SLOT)
        const cells = (await ryoTexts()).map(norm)
        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        expect(trtIdx, `không thấy dòng 処置 「${triggerNm}」`).toBeGreaterThanOrEqual(0)

        for (const c of placed) {
            const needle = norm(filledText(c.cmtNm))
            const idx = nearestIdxOf(cells, needle, trtIdx)
            expect(idx, `không thấy comment 「${needle}」`).toBeGreaterThanOrEqual(0)
            if (c.dispNo < 0) {
                expect(
                    idx,
                    `disp_no = ${c.dispNo} (< 0) ⇒ 「${needle}」 phải nằm TRÊN 「${triggerNm}」 ` +
                        '(frm203002.cs:10086)',
                ).toBeLessThan(trtIdx)
            } else {
                expect(
                    idx,
                    `disp_no = ${c.dispNo} (> 0) ⇒ 「${needle}」 phải nằm DƯỚI 「${triggerNm}」 ` +
                        '(frm203002.cs:10108)',
                ).toBeGreaterThan(trtIdx)
            }
        }
    })

    test('TC-5 dòng chk_auto của Phase 2 cũng nằm dưới cụm カルテコメント disp_no > 0', async () => {
        const triggerMst = (await findMstTrt(TRT_DT, P2_CD)).find((r) => r.trtSb === P2_SB)
        skipWithReason(!triggerMst, `master tháng test không có 処置 ${P2_CD}/${P2_SB}`)
        const triggerNm = displayName(triggerMst!)

        const cmts = await findCmtAutos(P2_CD, P2_SB)
        skipWithReason(
            cmts.length > 1 && cmts.some((c) => c.noChk === 0),
            'batch cần người chọn — không đi nhánh tự áp dụng',
        )
        const below = cmts.filter((c) => c.dispNo > 0).map((c) => norm(filledText(c.cmtNm)))
        skipWithReason(below.length === 0, `${P2_CD}/${P2_SB} không có comment disp_no > 0`)

        const slots = await findChkAutoSlots(P2_CD, P2_SB)
        const slotMsts = await Promise.all(slots.map((s) => findMstTrt(TRT_DT, s.trtCd)))
        const slotNms = slots
            .map((s, i) => (slotMsts[i] ?? []).find((r) => r.trtSb === s.trtSb))
            .filter((m): m is MstTrtRow => m !== undefined)
            .map((m) => norm(displayName(m)))
        skipWithReason(slotNms.length === 0, `${P2_CD}/${P2_SB} không có slot chk_auto khả dụng`)

        await ensureCommitted(P2_CD, P2_SB, P2_BUI_SLOT)
        const cells = await waitForRowsAround(triggerNm, [...below, ...slotNms])
        const trtIdx = lastIdxOf(cells, norm(triggerNm))
        const lastCmtIdx = Math.max(...below.map((n) => nearestIdxOf(cells, n, trtIdx)))

        for (const slotNm of slotNms) {
            expect(
                nearestIdxOf(cells, slotNm, trtIdx),
                `「${slotNm}」 (自動算定) phải nằm DƯỚI カルテコメント cuối của ` +
                    `「${triggerNm}」 — frm203002.cs:10164 rồi modMain.cs:958.\n` +
                    `  lưới: ${JSON.stringify(cells.filter(Boolean))}`,
            ).toBeGreaterThan(lastCmtIdx)
        }
    })
})
