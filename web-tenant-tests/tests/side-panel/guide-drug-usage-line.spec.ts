import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteTreatmentRows,
    findGuideDrugSlots,
    seedTreatmentRows,
    type GuideDrugSlot,
} from '../_shared/db'
import {
    GRID_LOAD_ATTEMPTS,
    GRID_LOAD_TIMEOUT,
    GRID_RELOAD_TIMEOUT,
    TODAY_ISO,
    patNo,
    trtDt,
} from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 診療入力 — chốt một ガイド có 薬剤 (600–699) thì ô 療法・処置 phải là ô NHIỀU DÒNG
 * 「薬剤名 + 用法」, KHÔNG phải `mst_trt.trt_nm` trần.
 *
 * ĐẶC TÍNH KIỂM THỬ: assert bám THEO WINFORM (src/OCHACOM/INP), không bám theo code
 * web. Kỳ vọng được TÍNH LẠI trong chính spec này từ master (`pag_trt` +
 * `mst_drug_rx` + `mst_drug`), không copy từ hàm nào của app — vì cái đang thiếu
 * CHÍNH LÀ hàm đó.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BUG ĐANG KHOÁ Ở ĐÂY (báo cáo 2026-09-08, ảnh so WinForm ↔ web)
 * ═════════════════════════════════════════════════════════════════════════════
 * Thao tác: tạo một 部位病名行 (部位 一 răng, 病名 Ｃ) → tab ガイド → chọn 「抜歯」 →
 * F9 確定 qua các dialog. Lưới hai bên khác nhau ĐÚNG ở hai dòng 薬剤:
 *
 *     WinForm                          web (SAI)
 *     ─────────────────────────────    ─────────────────────
 *     ﾎﾞﾙﾀﾚﾝ錠25mg 1T                  ﾎﾞﾙﾀﾚﾝ錠25ｍｇ１T
 *     疼痛時　服用  2回分                (KHÔNG CÓ DÒNG NÀY)
 *
 *     ﾒｲｱｸﾄMS錠100mg 4T                ﾒｲｱｸﾄMS錠100ｍｇ４T
 *     １日４回朝昼夕食後と就寝前　服用  2日分   (KHÔNG CÓ DÒNG NÀY)
 *
 * Chuỗi web in ra CHÍNH LÀ `mst_trt.trt_nm` (còn nguyên 全角 「ｍｇ」「１」) ⇒ đường
 * ガイド確定 của web KHÔNG hề đi qua bước dựng combineDrugNms.
 *
 * ─── Nguồn WinForm ──────────────────────────────────────────────────────────
 *  - frm203002.cs:9151 frmGuid2_Let_Data — vòng lặp per-pick sau F9 確定 của
 *    frm203017. Nhánh 一般処置 KHÔNG tự ghi `hFG1[2]`; nó dựng `tblTrtSel` rồi gọi
 *    `frm203016.Instance.frm203016_Hide_Let_Trt_Data(0)` (frm203002.cs:9445-9457)
 *    — tức đi CHUNG đường chốt của 処置選択.
 *  - frm203016.cs:1409 frmTrtSel_Let_Trt_Data — `if (isCodeRange(drug, cod) ||
 *    intJihi == 3)`: với 薬剤 thì gọi
 *    `ModSave.getDrugName(con, cod, no, selRec.intCnt, …)` (frm203016.cs:1463) rồi
 *    `grdRegi[2, intMRow].Value = drugInfStr.combineDrugNmsStr` (:1489/1493/1499).
 *    ⇒ 回数 truyền vào là 回数 CỦA CHÍNH DÒNG (ガイド trả về), KHÔNG phải
 *    `mst_trt.g_cnt`. Đây là chỗ quyết định con số trong 「n回分」/「n日分」.
 *  - modSave.cs:2219 getDrugName → COMMON/Lib/EditControl.cs:1031 editDrugName —
 *    nhánh A (`mst_drug_rx` có `dg_nm[0]`) dựng combineDrugNms:
 *      · mỗi thành phần: `ZenToHan(dg_nm)` + đệm khoảng trắng + `cnt` + đơn vị
 *        viết tắt (`editDrugUnitToShortUnit`: 錠→T, カートリッジ→Ct, …)
 *      · rồi dòng 用法 = `usage_nm + ' ' + usage_suppl_inf` (EditControl.cs:1113)
 *      · rồi 用量 nối vào DÒNG CUỐI: `' ' + trt_cnt + ('日分' med_kbn 21 /
 *        '回分' med_kbn 22)` (EditControl.cs:1119-1135).
 *  - frm203017.cs:617 getViewData — 回数 mặc định của một slot ガイド theo FLG4:
 *    0/1 → 1, 2 → `flg6`, 9 → 0. Với 薬剤 dùng FLG4=2 thì 回数 KHÔNG đi qua
 *    chk4/chkSiga, nên slot luôn hiện ra với đúng `flg6` — không phụ thuộc 歯式.
 *
 * ─── Web port (apps/web-tenant/src/features/treatments) ─────────────────────
 *  - components/treatment-entry-detail.tsx `placePick` (:4698) CÓ nhánh
 *    `isDrugCode(pick.trtCd) → commitDrugPick` — gọi
 *    `GET /tenant/treatment/drug-rx` rồi ghép `lines.join('\n')`. Nhánh này CHỈ
 *    được nối vào đường 処置選択 (gõ mã ở ô 点).
 *  - `GuideSelectionDialog.onConfirm` (:6675) lại đẩy thẳng
 *    `dialogTrtToPick(pk) → handleKobetuPicks(...)`, KHÔNG rẽ qua
 *    `commitDrugPick` ⇒ dòng 薬剤 rơi xuống lưới với `trtNm` trần. Đó là bug.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ BẪY KHI CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. Sau F9 確定, FE chạy vòng per-pick: chèn dòng → `runCmtAutoCascade` → CHỜ
 *    dialog 摘要コメント đóng mới sang pick kế (`waitForCascadeDrain`). Hai slot 薬剤
 *    nằm gần CUỐI ガイド 抜歯, nên bỏ mặc một dialog cascade đang mở là vòng lặp
 *    ĐỨNG và hai dòng cần đo KHÔNG BAO GIỜ xuất hiện — test đỏ như thể bug khác.
 *    `drainCascade()` bên dưới vì vậy phải bấm 確定/戻る cho tới khi sạch.
 * 2. TUYỆT ĐỐI KHÔNG Escape trong ガイド処置選択: frm203017.cs:180 map Escape ⇒
 *    btnF9_Click (確定), web bê nguyên (Rule 10.4). Đóng bằng F10.
 * 3. So chuỗi phải NFKC CẢ HAI VẾ: DOM mang 半角 「ﾎﾞﾙﾀﾚﾝ」 còn master mang 全角
 *    「ボルタレン」, `hasText` chỉ chuẩn hoá khoảng trắng nên không khớp gì cả.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 npx playwright test tests/side-panel/guide-drug-usage-line.spec.ts
 *
 * Spec CÓ ghi DB: seed một 部位病名行 vào vùng `disp_no >= 9000` của (患者, 診療日)
 * rồi xoá ở `afterAll` — vùng đó dành riêng cho test (`db.ts` SEED_DISP_BASE).
 * Spec KHÔNG bấm F9 登録, nên `trn_trn` thật không bị đụng.
 *
 * Mặc định: 患者 10 (bệnh nhân parity, ít dòng TRNTRN), 診療日 = hôm nay (WinForm
 * chặn thao tác sang tháng khác), ガイド 10650 「抜歯」 — ガイド duy nhất trong master
 * dev mang slot 薬剤 601/602 kèm 用法. Đổi bằng TEST_PAT_NO / TEST_TRT_DT /
 * TEST_GUID_CD.
 */

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/** ガイド番号 đem đo — 10650 「抜歯」 của master dev (xem doc đầu file). */
const GUID_CD = Number(process.env.TEST_GUID_CD ?? 10650)

/**
 * 病名 của 部位病名行 seed: `dis_cd` 100 = 「Ｃ」, `dis_sb` 1 = 「Ｃ₁」.
 *
 * KHÔNG tuỳ tiện: list ガイド lọc theo 病名 của dòng đang sáng —
 * `MasterGuideQueries.cs:90` `GUID_CD IN (SELECT GUID_CD FROM view_pac_tbl_active
 * WHERE DIS_CD = ANY(@disCodes) OR DIS_CD = 9999)`. `pac_tbl` nối 100 → 10650,
 * nên thiếu 病名 này là 「抜歯」 không hiện trong tab ガイド.
 */
const DIS_CD_C = 100
const DIS_SB_C1 = 1

/**
 * Ô 部位 seed: index 2 = 右上6 (bố cục 32 ô, `tooth-bui.ts:25`: 0-7 右上 8→1).
 * Giá trị 1 = 永久歯 có đánh dấu. Hai slot 薬剤 dùng FLG4=2 nên KHÔNG bị chk4 /
 * chkSiga chi phối; 部位 ở đây chỉ để dòng seed thành 部位病名行 hợp lệ và để
 * `focusedRowParts.bui` có gì đó gửi lên, đúng như thao tác người dùng báo lỗi.
 */
const BUI_SLOT = 2
const BUI_VAL = 1

/** Số dòng ガイド tối đa sẽ mở thử để tìm đúng `GUID_CD`. */
const SCAN_LIMIT = 8

/** Số vòng tối đa dọn dialog cascade sau F9 確定. */
const CASCADE_DRAIN_ROUNDS = 12

/** NFKC + gộp khoảng trắng — dùng cho CẢ hai vế mọi phép so chuỗi (BẪY 3). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Mảng 32 ô 部位 với đúng ô `slot` mang `val`. */
const buiAt = (slot: number, val: number) =>
    Array.from({ length: 32 }, (_, i) => (i === slot ? val : 0))

/**
 * 回数 mặc định của một slot ガイド theo FLG4 — viết lại TỪ frm203017.cs:617,
 * KHÔNG import từ app.
 */
function slotCnt(s: GuideDrugSlot): number {
    switch (s.flg4) {
        case 2:
            return s.flg6
        case 9:
            return 0
        default:
            return 1
    }
}

/** Hậu tố 用量 của dòng cuối — EditControl.cs:1119-1128. */
function doseUnit(medKbn: string): string {
    if (medKbn === '21') return '日分'
    if (medKbn === '22') return '回分'
    return ''
}

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: spec seed 部位病名行 và đọc master để tự tính kỳ vọng 用法',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — ガイド確定 dựng ô 薬剤 nhiều dòng (薬剤名 + 用法)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Dialog ガイド処置選択 (frm203017) — nhận diện bằng nhãn 「ガイド番号」. */
    let picker: Locator
    /** Alert 「算定できる処置がありません。」 (frm203017 getViewData, :1015). */
    let noTrtAlert: Locator
    /** Dialog カルテ記載選択 (frm203011) do AutoSantei tự bung khi vào màn. */
    let karteCmtDialog: Locator
    /** Khung side panel (w-[450px]). */
    let sidePanel: Locator
    /** Dòng của tab ガイド (header cùng grid-cols nên phải kèm cursor-pointer). */
    let rows: Locator

    /** Các slot 薬剤 CÓ 用法 của ガイド đang đo — đọc từ master ở beforeAll. */
    let drugSlots: GuideDrugSlot[] = []

    /** Ô 療法・処置 của lưới đăng ký (RegiCol.ryo = 2). */
    const ryoCells = () => page.locator('[data-grid-cell$="|2"]')

    /** Toàn bộ text ô 療法・処置, GIỮ NGUYÊN xuống dòng (ô 薬剤 là ô nhiều dòng). */
    async function ryoTexts(): Promise<string[]> {
        return ryoCells().evaluateAll((els) => els.map((e) => e.textContent ?? ''))
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
                return
            } catch (e) {
                lastErr = e
                console.log(`openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} hỏng — nạp lại`)
            }
        }
        throw lastErr
    }

    /**
     * Chờ chuỗi AutoSantei chạy hết rồi dọn sạch. Confirm 「〜を算定しますか？」 và
     * カルテ記載選択 do locator handler bấm — mà handler CHỈ chạy khi có action /
     * assert auto-retry, nên phải assert (không `waitForTimeout` trần) mới ép nó chạy.
     */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15_000 })
            await page.waitForTimeout(700)
        }
    }

    /** ガイド番号 trên header dialog = frm203017 txtGuidNo = `guid_cd`. */
    async function pickerGuidCd(): Promise<number> {
        const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
        return Number(raw.trim())
    }

    /**
     * Chờ kết quả THẬT của một cú mở ガイド: dòng 処置 HOẶC alert 「算定できる処置が
     * ありません。」. KHÔNG mốc vào riêng `picker` — nó bung ra trong lúc query còn
     * chạy rồi mới tự đóng ở nhánh rỗng (frm203017.cs:1001-1024).
     */
    async function waitPickResult(): Promise<'rows' | 'empty'> {
        await expect(picker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
            timeout: 30_000,
        })
        return (await noTrtAlert.count()) > 0 ? 'empty' : 'rows'
    }

    /** Đóng alert 「算定できる処置がありません。」 đang bung. */
    async function dismissNoTrtAlert() {
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10_000 })
    }

    /**
     * Đóng ガイド処置選択 bằng PHÍM F10 (BẪY 2 — Escape ở dialog này là 確定).
     * KHÔNG click nút 「F10 戻る」: màn nền cũng có nút cùng tên nằm dưới modal.
     */
    async function dismissPicker() {
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10_000 })
    }

    /**
     * Mở đúng ガイド `GUID_CD`: lần lượt click từng dòng, đọc ガイド番号 trên header,
     * dừng ở dòng khớp. List chỉ hiện 「No.」 + 「名称」 (frm203002.cs:239 GuidCol) nên
     * KHÔNG có cách nào biết `guid_cd` mà không mở dialog.
     */
    async function openGuide(): Promise<void> {
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        expect(total, 'tab ガイド không có dòng nào — 病名 seed chưa lọt bộ lọc pac_tbl?').toBeGreaterThan(0)
        for (let i = 0; i < total; i++) {
            await rows.nth(i).click()
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            if ((await pickerGuidCd()) === GUID_CD) return
            await dismissPicker()
        }
        throw new Error(
            `không thấy ガイド ${GUID_CD} trong ${total} dòng đầu của tab ガイド — ` +
                'đặt TEST_GUID_CD cho đúng master của tenant đang test',
        )
    }

    /**
     * Dọn chuỗi dialog 摘要コメント mà `runCmtAutoCascade` bung ra sau F9 確定 (BẪY 1).
     *
     * Ưu tiên 「F9 確定」 — đó đúng là phím người dùng bấm khi báo lỗi, và là nhánh
     * giữ lại dòng 摘要 giống WinForm. Dialog nào không có 確定 (hoặc đang disabled)
     * thì đóng bằng F10 戻る; cả hai nhánh đều làm `cascadeSteps` ngắn đi một bước
     * nên vòng per-pick chạy tiếp.
     */
    async function drainCascade() {
        for (let i = 0; i < CASCADE_DRAIN_ROUNDS; i++) {
            const dialog = page.getByRole('dialog').first()
            if ((await dialog.count()) === 0) return
            const ok = page.getByRole('button', { name: 'OK' })
            if (await ok.count()) {
                await ok.first().click()
                await page.waitForTimeout(400)
                continue
            }
            const confirm = dialog.getByRole('button', { name: /F9\s*確定/ })
            if ((await confirm.count()) > 0 && (await confirm.first().isEnabled())) {
                await confirm.first().click()
            } else {
                await page.keyboard.press('F10')
            }
            await page.waitForTimeout(600)
        }
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        // Bấm 「No」 cho 「〜を算定しますか？」 (Yes chỉ đổi popup này lấy popup khác,
        // Rule 14.1) và OK cho alert お茶コン xen ngang.
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })

        picker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        noTrtAlert = page.getByText('算定できる処置がありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        rows = sidePanel.locator('div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]')

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

        drugSlots = (await findGuideDrugSlots(TRT_DT, GUID_CD)).filter((s) => s.usageNm !== '')

        // ⚠️ Seed TRƯỚC khi mở màn: list ガイド được lọc theo 病名 của dòng đang sáng,
        // mà dòng đó phải có sẵn lúc lưới dựng.
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
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
                disSb: [DIS_SB_C1],
                dspDis: 'Ｃ',
            },
        ])

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('WinForm parity — ô 療法・処置 của dòng 薬剤 do ガイド chốt phải có dòng 用法', async () => {
        skipWithReason(
            drugSlots.length === 0,
            `ガイド ${GUID_CD} không có slot 薬剤 nào mang 用法 trong master của ngày ${TRT_DT} — ` +
                'không có gì để đo, đặt TEST_GUID_CD sang ガイド khác',
        )

        // Con trỏ phải nằm trên 部位病名行 vừa seed: `focusedRowParts.bui` và
        // `guidDisCdContext` đọc từ dòng đang sáng (frm203002.cs:6515
        // hfgGuid1_CellDoubleClick chụp getFocusBui/getFocusDis).
        const seededRow = ryoCells().filter({ hasText: 'Ｃ' }).first()
        await expect(seededRow, 'không thấy 部位病名行 vừa seed trên lưới').toBeVisible({
            timeout: 30_000,
        })
        await seededRow.click()
        await step()

        // F4 → tab ガイド, chế độ regular (frm203002.cs:6604 getGuidNyuryokuInfo).
        await page.keyboard.press('F4')
        await expect(rows.first(), 'F4 không mở được tab ガイド').toBeVisible({ timeout: 30_000 })
        await step()

        await openGuide()
        await step()

        // F9 確定 của frm203017 (btnF9_Click) → frmGuid2_Let_Data.
        await picker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(picker).toBeHidden({ timeout: 30_000 })
        await drainCascade()
        await step()

        const cells = await ryoTexts()

        for (const slot of drugSlots) {
            const cnt = slotCnt(slot)
            const unit = doseUnit(slot.medKbn)
            // Dòng 薬剤 nhận diện bằng TÊN THUỐC của master (`mst_drug.dg_nm`), sau
            // NFKC thì khớp cả bản 半角 của WinForm lẫn bản 全角 của `mst_trt.trt_nm`
            // — nghĩa là locator này TÌM ĐƯỢC dòng ở CẢ HAI trạng thái đúng/sai, rồi
            // mới phán xét nội dung. Bắt theo chuỗi đúng thì test đỏ với thông báo
            // 「không thấy dòng」, che mất bug thật.
            const needle = norm(slot.dgNm)
            const cell = cells.find((c) => norm(c).includes(needle))
            expect(
                cell,
                `ガイド ${GUID_CD} chốt xong mà lưới không có dòng nào chứa 薬剤 ` +
                    `「${slot.dgNm}」 (${slot.trtCd}/${slot.trtSb}). Có thể vòng per-pick bị ` +
                    'một dialog cascade chặn — xem drainCascade().',
            ).toBeDefined()

            const flat = norm(cell!)

            // (1) Dòng 用法 — EditControl.cs:1113 `usage_nm + ' ' + usage_suppl_inf`.
            expect(
                flat,
                `Dòng 薬剤 ${slot.trtCd}/${slot.trtSb} thiếu dòng 用法.\n` +
                    `  lưới in ra : ${JSON.stringify(cell)}\n` +
                    `  WinForm    : 「${slot.dgNm}…」 + xuống dòng + 「${slot.usageNm}${slot.usageSupplInf} ${cnt}${unit}」\n` +
                    `  mst_trt.trt_nm = 「${slot.trtNm}」 — trùng chuỗi trên lưới nghĩa là ` +
                    'ガイド確定 đang bỏ qua ModSave.getDrugName (frm203016.cs:1463).',
            ).toContain(norm(slot.usageNm))

            // (2) Ô phải là ô NHIỀU DÒNG — combineDrugNms nối bằng '\n'.
            expect(
                cell!.includes('\n'),
                `Dòng 薬剤 ${slot.trtCd}/${slot.trtSb} chỉ có MỘT dòng: ${JSON.stringify(cell)}`,
            ).toBe(true)

            // (3) 用量 nối vào dòng cuối với 回数 CỦA DÒNG (frm203016.cs:1463 truyền
            //     selRec.intCnt), KHÔNG phải mst_trt.g_cnt.
            if (unit !== '') {
                expect(
                    flat,
                    `Dòng 薬剤 ${slot.trtCd}/${slot.trtSb} sai 用量: chờ 「${cnt}${unit}」 ` +
                        `(pag_trt FLG4=${slot.flg4}/FLG6=${slot.flg6}), lưới in ${JSON.stringify(cell)}`,
                ).toContain(`${cnt}${unit}`)
            }
        }
    })
})
