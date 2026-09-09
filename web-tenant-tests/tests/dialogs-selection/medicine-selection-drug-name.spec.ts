import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteMstMedRows,
    deleteMstTrtRows,
    deleteTreatmentRows,
    findDrugRx,
    seedMstMedRows,
    seedMstTrtRows,
    type DrugRxRow,
} from '../_shared/db'
import { openTreatmentEntry, ryoCells } from '../_shared/entry'
import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 薬剤選択 (Shift+F6, frm203013) — 確定 xong thì ô 療法・処置 của dòng 薬剤 phải là
 * ô NHIỀU DÒNG do `EditControl.editDrugName` dựng, ở CẢ HAI nhánh:
 *
 *     path A (có mst_drug_rx) : 薬剤名 + 用法 + 用量
 *     path B (không có)       : 処置名称 (mst_trt) + 用法 (mst_med)
 *
 * ĐẶC TÍNH KIỂM THỬ: kỳ vọng bám WinForm (src/OCHACOM/INP), tính lại TỪ MASTER
 * (`findDrugRx`) hoặc từ chính dữ liệu spec seed — không đọc hàm nào của app.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * FACT — vì sao 薬剤選択 lại phải đi qua editDrugName
 * ═════════════════════════════════════════════════════════════════════════════
 *  - frm203013.cs:743/:858 `setData` — outList mà dialog trả về mang `trt_nm`, và
 *    khi `tre_inp_flg = 1` thì mang `cct_nm`. Đó mới là GIÁ TRỊ TRUNG GIAN.
 *  - frm203002.cs:8791 `frmMed_LetData` — mỗi dòng mới KHÔNG được form này tự ghi:
 *    nó dựng `tblTrtSel` rồi gọi `frm203016.Instance.frm203016_Hide_Let_Trt_Data(0)`,
 *    tức đi CHUNG đường chốt của 処置選択.
 *  - frm203016.cs:1409 `frmTrtSel_Let_Trt_Data` — với 薬剤 thì gọi
 *    `ModSave.getDrugName(...)` rồi `grdRegi[2] = combineDrugNmsStr`
 *    (:1489/:1493/:1499) ⇒ **giá trị đọng lại trên lưới là kết quả editDrugName**,
 *    KHÔNG phải `trt_nm` mà frm203013 đưa sang.
 *  - Hệ quả: `editDrugName` KHÔNG hề đọc `cct_nm` ở cả hai nhánh, nên dòng 薬剤
 *    luôn hiện `trt_nm` dù `tre_inp_flg = 1`. Dev đang để `tre_inp_flg` mặc định 0
 *    (tenant_config namespace `inp` không có khoá đó) nên spec KHÔNG đo được nhánh
 *    đó — chỉ ghi lại ở đây; phần đảm bảo nằm ở `ConfirmYakuHandlerTests`
 *    (`SelectedDrug_TreInpFlg1_StillUsesTrtName`).
 *  - COMMON/Lib/EditControl.cs:1136-1149 — path B: 処置名称 của
 *    `MstTrt.getMstTrtDataYaku` rồi 用法 của `SyoPac.getMstMed`; hậu tố 用量
 *    「n日分」/「n回分」 nằm TRONG nhánh A (:1119-1135) vì `med_kbn` là cột của
 *    `mst_drug_rx` ⇒ path B không bao giờ có hậu tố đó.
 *
 * ─── Web port ───────────────────────────────────────────────────────────────
 *  - `medicine-selection-dialog.tsx` — double-click một dòng ở lưới trái =
 *    `moveData` (`addItem`), 回数 nạp sẵn = `mst_trt.g_cnt`; F9 gọi
 *    POST `/tenant/treatment/yaku-confirm`.
 *  - `ConfirmYakuHandler` dựng tên cho từng dòng 薬剤 và FE lấy NGUYÊN chuỗi đó
 *    (`handleMedicineConfirm` → `handleKobetuPicks`, KHÔNG rẽ qua `commitDrugPick`)
 *    ⇒ đây là chỗ DUY NHẤT quyết định ô 療法・処置 của đường 薬剤選択.
 *  - Trước bản vá path B, nhánh 「không có mst_drug_rx」 rơi về `trt_nm` một dòng —
 *    đúng cái TC-2/TC-3 dưới đây canh.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI SEED
 * ═════════════════════════════════════════════════════════════════════════════
 * Master dev KHÔNG có mã 薬剤 nào đi path B: cả 63 mã 600–699 active đều có dòng
 * `mst_drug_rx`. Spec seed 2 mã vào khoảng trống của master:
 *
 *   | mã     | mst_trt              | mst_med | kỳ vọng             |
 *   |--------|----------------------|---------|---------------------|
 *   | 696-0  | clone 600-0, đổi tên | CÓ      | 2 dòng: 名称 + 用法 |
 *   | 697-0  | clone 600-0, đổi tên | KHÔNG   | 1 dòng: 名称        |
 *
 * Dải mã CỐ Ý khác spec `treatment-grid/drug-path-b-mst-med.spec.ts` (698/699):
 * hai spec seed cùng bảng master, trùng mã là chúng xoá dữ liệu của nhau khi
 * Playwright chạy song song 4 worker.
 *
 * Clone **600-0** vì hai lẽ: `f2 = 0` (không bật 薬剤使用量選択 — dialog đó đọc thành
 * phần từ `mst_drug_rx`, thứ path B không có) và `grp = 2` ⇒ mã seed nằm ở tab
 * 屯服 chỉ ~9 dòng, KHÔNG phải cuộn lưới ảo để với tới. 600-0 đồng thời là mã
 * đối chứng path A của TC-1. Đổi bằng TEST_CLONE_TRT_CD / TEST_CLONE_TRT_SB.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ BẪY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. TUYỆT ĐỐI KHÔNG Escape để đóng gì trên màn 診療入力: WinForm map Escape →
 *    End (登録/確定). Đóng dialog bằng F10.
 * 2. Sau F9 確定, FE chạy vòng per-item: chèn dòng → SingleChk (W00100, đi qua BE
 *    nên đến TRỄ) → 摘要コメント cascade, và cascade CHỜ dialog đóng mới sang item
 *    kế. Đọc lưới một phát ngay sau khi dialog đóng là thấy thiếu dòng — phải VỪA
 *    poll lưới VỪA dọn dialog.
 * 3. Các checkbox 加算 (処方料/調剤料…) do `chkMed` tự tick ⇒ 確定 có thể kéo theo
 *    dòng khác ngoài thuốc đã chọn. Spec chỉ assert trên ĐÚNG dòng của mình.
 * 4. So chuỗi phải NFKC CẢ HAI VẾ (DOM 半角 ↔ master 全角).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 npx playwright test tests/dialogs-selection/medicine-selection-drug-name.spec.ts
 *
 * Spec CÓ ghi DB: 2 dòng `mst_trt` + 1 dòng `mst_med`, xoá HẲN theo id ở afterAll.
 * KHÔNG bấm F9 登録 nên `trn_trn` thật không bị đụng.
 *
 * Mặc định: 患者 10 (ít dòng TRNTRN), 診療日 = hôm nay (WinForm chặn thao tác sang
 * tháng khác). Đổi bằng TEST_PAT_NO / TEST_TRT_DT.
 */

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/**
 * Dòng 薬剤 dùng làm nguồn clone VÀ làm đối chứng path A.
 *
 * 628-0 「カロナール錠200mg　１T」 — `grp = 2` (mã seed thừa hưởng ⇒ nằm ở tab 屯服 chỉ
 * ~9 dòng, không phải cuộn lưới ảo), `f2 = 0` (không bật 薬剤使用量選択), `med_kbn = 22`
 * (⇒ path A CÓ hậu tố 用量 「n回分」), và **`selected_treat_kb = 0`**.
 *
 * ⚠️ Điều kiện cuối cùng tốn một lượt chạy trên WinForm mới lộ ra. Bản đầu clone từ
 * 600-0 — cùng hình dạng, nhưng thành phần của nó (620007096 ボルタレン) mang
 * `selected_treat_kb = '1'`; với `f3 = 1` (院内処方) thì
 * `CmtAuto.IsDrug_lt_listed_product` (CmtAuto.cs:925-975) trả true và lượt 確定 bung
 * `frm203012` 「医療上の必要性を選択してください」 (長期収載品の選定療養). Trên WinForm dòng
 * KHÔNG rơi xuống lưới (đo 2026-09-09, `DrugPathBProbeTests` KQ-10). Đó là một tính năng
 * KHÁC, không thuộc path B — để nó trong spec này thì testcase đỏ vì lý do chẳng liên
 * quan, và hai vế parity không còn đo cùng một thứ.
 *
 * Trong dải 600–699 `grp = 2`: 600/601/624 dính cờ đó; 628/631/632/637/654/662 thì không.
 * Muốn ĐO chính cascade 選定療養 thì chạy lại với TEST_CLONE_TRT_CD=600 — nhưng nó xứng
 * đáng một spec riêng.
 */
const CLONE_TRT_CD = Number(process.env.TEST_CLONE_TRT_CD ?? 628)
const CLONE_TRT_SB = Number(process.env.TEST_CLONE_TRT_SB ?? 0)

/** Mã seed CÓ 用法 trong mst_med → path B đủ 2 dòng. */
const PATH_B_CD = Number(process.env.TEST_PATHB_TRT_CD ?? 696)
/** Mã seed KHÔNG có 用法 → path B chỉ còn dòng 処置名称. */
const NO_MED_CD = Number(process.env.TEST_PATHB_NO_MED_TRT_CD ?? 697)
const SEED_TRT_SB = 0

const PATH_B_NM = 'ﾃｽﾄ屯服院内薬PB'
const PATH_B_USAGE = 'ﾃｽﾄ用法　疼痛時　服用'
const NO_MED_NM = 'ﾃｽﾄ屯服院内薬NM'

/**
 * Nhãn tab của dialog theo `grp` — medicine-selection-dialog.tsx TAB_LABELS,
 * khớp frm203013 F1–F4. Index 0 内服(grp 1) / 1 屯服(2) / 2 外用(3) / 3 その他.
 */
const TAB_BY_GRP: Record<number, string> = { 1: '内服', 2: '屯服', 3: '外用' }

/** Hạn chờ cho cả chuỗi 「chèn dòng → SingleChk → cascade」 sau F9 確定 (BẪY 2). */
const CONFIRM_DRAIN_TIMEOUT = 120_000

/** NFKC + gộp khoảng trắng — dùng cho CẢ hai vế mọi phép so chuỗi (BẪY 4). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

/** Hậu tố 用量 của dòng cuối — EditControl.cs:1119-1128. */
const doseUnit = (medKbn: string) => (medKbn === '21' ? '日分' : medKbn === '22' ? '回分' : '')

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: path B không tồn tại trong master dev, spec phải seed mst_trt + mst_med',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('薬剤選択 (Shift+F6) — ô 療法・処置 của dòng 薬剤 sau 確定', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let seededTrtIds: string[] = []
    let seededMedIds: string[] = []

    /** Master của mã đối chứng path A — đọc ở beforeAll để tự tính kỳ vọng. */
    let control: DrugRxRow | null = null

    /** Dialog 薬剤選択. Title giãn bằng SPACE THẬT nên phải match bằng regex \s*. */
    let dialog: Locator
    let karteCmtDialog: Locator

    /**
     * Text ô 療法・処置, GIỮ NGUYÊN xuống dòng (ô 薬剤 là ô nhiều dòng) — `innerText`
     * của Playwright gộp xuống dòng nên phải đọc `textContent`.
     */
    async function ryoTexts(): Promise<string[]> {
        return ryoCells(page).evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    }

    /** Chờ chuỗi AutoSantei chạy hết rồi dọn sạch (handler chỉ chạy khi có assert). */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15_000 })
            await page.waitForTimeout(700)
        }
    }

    /** Đóng ĐÚNG MỘT dialog đang mở; true khi có đóng cái nào (BẪY 1: F10, không Escape). */
    async function drainOneDialog(): Promise<boolean> {
        const ok = page.getByRole('button', { name: 'OK' })
        if (await ok.count()) {
            await ok
                .first()
                .click({ timeout: 3000 })
                .catch(() => {})
            return true
        }
        if ((await page.getByRole('dialog').count()) === 0) return false
        await page.keyboard.press('F10')
        return true
    }

    /**
     * Mở 薬剤選択 rồi chuyển sang tab chứa `grp`. Lưới trái phải có dòng (hoặc
     * 該当なし) mới coi là dựng xong — Rule 10.8, `count()` không auto-wait.
     */
    async function openDialogAtTab(grp: number) {
        await page.keyboard.press('Shift+F6')
        await expect(dialog, 'Shift+F6 không mở được 薬剤選択').toBeVisible({ timeout: 30_000 })

        const label = TAB_BY_GRP[grp]
        expect(label, `grp ${grp} không thuộc tab nào của frm203013`).toBeDefined()
        await dialog.getByRole('button', { name: new RegExp(`^${label}\\(F\\d\\)$`) }).click()
        await expect(
            dialog.getByTestId('cell-trtNm').first().or(dialog.getByTestId('empty-state')),
        ).toBeVisible({ timeout: 30_000 })
    }

    /**
     * Chọn mã `trtCd` ở lưới trái (double-click = moveData), 確定, rồi trả về ô
     * 療法・処置 của dòng vừa rơi xuống.
     *
     * HAI needle khác nhau, KHÔNG gộp được — đúng bản chất của editDrugName:
     *  - `basketNm`   = `mst_trt.trt_nm`, thứ giỏ 選択薬剤 của dialog hiển thị.
     *  - `gridNeedle` = chuỗi nhận diện dòng trên LƯỚI. Path A in ra `mst_drug.dg_nm`
     *    (đã ZenToHan + đệm khoảng trắng) nên KHÁC hẳn `trt_nm`; path B mới in
     *    `trt_nm`. Lấy nhầm `trt_nm` cho path A là đỏ với thông báo 「không thấy
     *    dòng」 trong khi app hoàn toàn đúng — đã vấp thật ở lần chạy đầu.
     *
     * VỪA poll lưới VỪA dọn dialog (BẪY 2) — SingleChk/cascade đến trễ và chặn
     * vòng per-item, đọc một phát là thấy thiếu dòng rồi đỏ nhầm chỗ.
     */
    async function confirmDrug(
        trtCd: number,
        basketNm: string,
        gridNeedle: string = basketNm,
    ): Promise<string> {
        const row = dialog.locator(`[data-testid="row-${trtCd}-${SEED_TRT_SB}"]`)
        await expect(
            row,
            `không thấy mã ${trtCd} trong lưới 薬剤選択 — dòng seed có đúng grp/active_flg không?`,
        ).toBeVisible({ timeout: 30_000 })
        await row.dblclick()

        // Giỏ 選択薬剤 (bên phải) phải nhận dòng — 回数 nạp sẵn = mst_trt.g_cnt.
        // `s.Cnt == 0` là bị ConfirmYakuHandler bỏ qua, nên đây cũng là chốt chặn.
        await expect(
            dialog.getByText(basketNm, { exact: false }).last(),
            `double-click không đẩy được 「${basketNm}」 sang giỏ 選択薬剤`,
        ).toBeVisible({ timeout: 15_000 })
        await step()

        await dialog.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(dialog).toBeHidden({ timeout: 30_000 })

        let last: string[] = []
        await expect
            .poll(
                async () => {
                    await drainOneDialog()
                    last = await ryoTexts()
                    return last.some((c) => norm(c).includes(norm(gridNeedle)))
                },
                {
                    timeout: CONFIRM_DRAIN_TIMEOUT,
                    intervals: [1000],
                    message:
                        `Sau F9 確定 không thấy dòng 「${gridNeedle}」 trên lưới — vòng per-item của ` +
                        'handleMedicineConfirm có thể đang kẹt ở một dialog mà drainOneDialog() ' +
                        'không đóng được.',
                },
            )
            .toBe(true)

        const cell = last.find((c) => norm(c).includes(norm(gridNeedle)))
        return cell as string
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: false })

        dialog = page.getByRole('dialog').filter({ hasText: /薬\s*剤\s*選\s*択/ })
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

        control = await findDrugRx(CLONE_TRT_CD, CLONE_TRT_SB, TRT_DT)

        // Seed master TRƯỚC khi mở màn — dialog nạp list ngay lần mở đầu.
        seededTrtIds = await seedMstTrtRows(TRT_DT, [
            {
                trtCd: PATH_B_CD,
                trtSb: SEED_TRT_SB,
                trtNm: PATH_B_NM,
                fromTrtCd: CLONE_TRT_CD,
                fromTrtSb: CLONE_TRT_SB,
            },
            {
                trtCd: NO_MED_CD,
                trtSb: SEED_TRT_SB,
                trtNm: NO_MED_NM,
                fromTrtCd: CLONE_TRT_CD,
                fromTrtSb: CLONE_TRT_SB,
            },
        ])
        seededMedIds = await seedMstMedRows([
            { trtCd: PATH_B_CD, trtSb: SEED_TRT_SB, usageNm: PATH_B_USAGE },
        ])

        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
        await drainAutoSantei()
    })

    test.afterAll(async () => {
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await deleteMstMedRows(seededMedIds).catch(() => 0)
        await deleteMstTrtRows(seededTrtIds).catch(() => 0)
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('TC-1 path A — mã có mst_drug_rx: 薬剤名 + 用法 + 用量 (đối chứng)', async () => {
        skipWithReason(
            control === null,
            `mã đối chứng ${CLONE_TRT_CD}-${CLONE_TRT_SB} không có trong master của ngày ${TRT_DT} — ` +
                'đặt TEST_CLONE_TRT_CD/SB',
        )
        skipWithReason(
            !control!.hasDrugRx || control!.usageNm === '',
            `mã đối chứng ${CLONE_TRT_CD}-${CLONE_TRT_SB} không có dòng mst_drug_rx kèm 用法 — ` +
                'không đo được path A, đặt TEST_CLONE_TRT_CD/SB sang mã khác',
        )

        await openDialogAtTab(control!.grp)
        // Lưới in `dg_nm` chứ không phải `trt_nm` — xem doc của confirmDrug.
        const cell = await confirmDrug(CLONE_TRT_CD, control!.trtNm, control!.dgNm)
        await step()

        const flat = norm(cell)

        // 用法 — EditControl.cs:1113 `usage_nm + ' ' + usage_suppl_inf`.
        expect(
            flat,
            `path A thiếu dòng 用法.\n  lưới in ra: ${JSON.stringify(cell)}\n` +
                `  master    : 用法 「${control!.usageNm}」`,
        ).toContain(norm(control!.usageNm))

        // 薬剤名 lấy từ mst_drug (đã ZenToHan), KHÁC hẳn mst_trt.trt_nm.
        expect(flat, `path A thiếu tên thuốc 「${control!.dgNm}」`).toContain(norm(control!.dgNm))

        expect(cell.includes('\n'), `ô path A phải nhiều dòng: ${JSON.stringify(cell)}`).toBe(true)

        // 用量 nối vào dòng cuối với 回数 = g_cnt (moveData nạp sẵn `item.gCnt`).
        const unit = doseUnit(control!.medKbn)
        if (unit !== '') {
            expect(
                flat,
                `path A sai 用量: chờ 「${control!.gCnt}${unit}」 (med_kbn ${control!.medKbn}, ` +
                    `g_cnt ${control!.gCnt}), lưới in ${JSON.stringify(cell)}`,
            ).toContain(`${control!.gCnt}${unit}`)
        }
    })

    test('TC-2 path B — mã không có mst_drug_rx: 処置名称 + 用法 của mst_med', async () => {
        expect(
            seededTrtIds.length,
            `seedMstTrtRows không tạo được dòng nào — bản master của ngày ${TRT_DT} không có ` +
                `dòng nguồn ${CLONE_TRT_CD}-${CLONE_TRT_SB}?`,
        ).toBe(2)
        expect(seededMedIds.length, 'seedMstMedRows không tạo được dòng 用法').toBe(1)

        await openDialogAtTab(control?.grp ?? 2)
        const cell = await confirmDrug(PATH_B_CD, PATH_B_NM)
        await step()

        const lines = cell.split('\n').map(norm).filter((l) => l !== '')

        // (1) Đúng 2 dòng, đúng thứ tự: 処置名称 (editDrugName:1139) rồi 用法 (:1145).
        expect(
            lines,
            `path B phải ra ĐÚNG 2 dòng 「${PATH_B_NM}」 + 「${PATH_B_USAGE}」, ` +
                `lưới in ${JSON.stringify(cell)}. Một dòng = ConfirmYakuHandler đang ` +
                'dừng ở trt_nm trần, tức chưa đi nhánh else của editDrugName.',
        ).toHaveLength(2)
        expect(lines[0]).toContain(norm(PATH_B_NM))
        expect(lines[1]).toContain(norm(PATH_B_USAGE))

        // (2) KHÔNG có hậu tố 用量 — `med_kbn` chỉ có ở mst_drug_rx, và
        //     EditControl.cs:1119-1135 nằm TRONG nhánh A.
        expect(
            norm(cell),
            `path B gắn hậu tố 用量 — WinForm chỉ gắn ở nhánh mst_drug_rx: ${JSON.stringify(cell)}`,
        ).not.toMatch(/\d+\s*(日分|回分)/)
    })

    test('TC-3 path B — không có cả mst_med: chỉ còn dòng 処置名称', async () => {
        // getMstMed trả chuỗi rỗng ⇒ `if (usage != string.Empty)` không thêm dòng
        // (EditControl.cs:1146). Dòng vẫn phải rơi xuống lưới.
        await openDialogAtTab(control?.grp ?? 2)
        const cell = await confirmDrug(NO_MED_CD, NO_MED_NM)
        await step()

        const lines = cell.split('\n').map(norm).filter((l) => l !== '')
        expect(lines, `mã không có 用法 phải ra ĐÚNG một dòng: ${JSON.stringify(cell)}`).toHaveLength(
            1,
        )
        expect(lines[0]).toContain(norm(NO_MED_NM))
        expect(
            norm(cell),
            'dòng 用法 của mã KHÁC bị lọt sang — GetUsagesAsync không lọc đúng (trt_cd, trt_sb)?',
        ).not.toContain(norm(PATH_B_USAGE))
    })
})
