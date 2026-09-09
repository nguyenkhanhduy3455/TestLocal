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
 * 診療入力 — 薬剤コード (600–699) KHÔNG có dòng 処置変換テーブル (`mst_drug_rx`) phải
 * rơi xuống **path B** của `EditControl.editDrugName`: ô 療法・処置 = 処置名称 của
 * `mst_trt` + dòng 用法 của `mst_med`. KHÔNG được chặn bằng alert.
 *
 * ĐẶC TÍNH KIỂM THỬ: kỳ vọng bám WinForm (src/OCHACOM), và được dựng TỪ CHÍNH DỮ
 * LIỆU SPEC SEED — không đọc lại hàm nào của app, cũng không phụ thuộc master của
 * tenant. Path B là nhánh mà master dev KHÔNG tài nào chạm tới (xem 「VÌ SAO PHẢI
 * SEED」 bên dưới), nên seed là cách duy nhất kiểm được nó bằng E2E.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * FACT — nguồn WinForm
 * ═════════════════════════════════════════════════════════════════════════════
 *  - COMMON/Lib/EditControl.cs:1031 `editDrugName` có HAI nhánh:
 *      · path A (:1046) `mst_drug_rx` có `dg_nm[0]` → 薬剤名 + 用法 + 用量.
 *      · path B (:1136-1149) — nhánh `else`, khi KHÔNG có dòng nào:
 *            tbl_name  = TrtSel.getTrtSel(con, trt_dt)            ← bản master THEO NGÀY
 *            mstTrtData= MstTrt.getMstTrtDataYaku(con, tbl, cd, sb)
 *            if (mstTrtData != null) combineDrugNms.Add(trt_nm)   ← DÒNG 1
 *            if (blUsage) { usage = SyoPac.getMstMed(con, cd, sb);
 *                           if (usage != "") combineDrugNms.Add(usage) }  ← DÒNG 2
 *      · 用量 「n日分」/「n回分」 nằm TRONG path A (:1119-1135) vì `med_kbn` là cột của
 *        `mst_drug_rx` — path B KHÔNG BAO GIỜ có hậu tố đó. Đây là assert (3).
 *  - COMMON/DBAccess/MstTrt.cs:933 `getMstTrtDataYaku` — lọc `right(trt_nm,1) <> '!'`
 *    và `active_flg = 1`. Dòng seed phải thoả cả hai (clone từ 602-0 nên thoả sẵn).
 *  - COMMON/DBAccess/SyoPac.cs:242 `getMstMed` — `SELECT * FROM MST_MED WHERE
 *    trt_cd = @cd AND trt_sb = @sb`, lấy cột `usage`; không có dòng → chuỗi rỗng.
 *  - INP/Lib/modSave.cs:2219 `getDrugName` gọi editDrugName với `blUsage = true`
 *    ⇒ đường 処置選択 của 診療入力 LUÔN lấy cả dòng 用法.
 *  - INP/Forms/frm203016.cs:1489/1493/1499 — `grdRegi[2] = combineDrugNmsStr`, tức
 *    ô 療法・処置 là ô NHIỀU DÒNG. Đây là assert (2).
 *
 * ─── Web port ───────────────────────────────────────────────────────────────
 *  - `treatment-entry-detail.tsx` `placePick` → `commitDrugPick` (600–699) gọi
 *    `GET /tenant/treatment/drug-rx` rồi `lines.join('\n')`.
 *  - `ResolveDrugHandler` — `joined == null` HOẶC `lines` rỗng thì gọi path B
 *    (`IYakuSelectQueries.GetYakuTrtRowsAsync` + `IMstMedQueries.GetUsagesAsync`). `found = false` giờ
 *    CHỈ còn nghĩa 「không có dòng 処置マスタ hợp lệ」.
 *  - Trước bản vá này FE bung alert 「この薬剤コードは現在未対応です。」 và KHÔNG chèn
 *    dòng — đó chính là hồi quy mà assert (0) canh.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI SEED (đo trên master dev 2026-09-09)
 * ═════════════════════════════════════════════════════════════════════════════
 * Cả 63 mã 600–699 đang active đều CÓ dòng `mst_drug_rx` ⇒ luôn đi path A. Hai
 * dòng `mst_med` mồ côi (620-0, 647-1) thì lại KHÔNG có dòng `mst_trt` nào, nên
 * `GetTrtmasCod` chặn ngay từ bước tra mã (「該当処置はありません。」) — không tới
 * được editDrugName. Nói cách khác: **không seed thì path B là code chết trên dev.**
 *
 * Spec seed 2 mã trong khoảng trống của master (không đụng dòng thật):
 *
 *   | mã       | mst_trt                    | mst_med | kỳ vọng                    |
 *   |----------|----------------------------|---------|----------------------------|
 *   | 698-0    | clone 602-0, đổi tên       | CÓ      | 2 dòng: 名称 + 用法        |
 *   | 699-0    | clone 602-0, đổi tên       | KHÔNG   | 1 dòng: 名称               |
 *
 * Clone từ **602-0** vì nó là 薬剤 có `f2 = 0` (数量変更可 TẮT): `f2 = 1` sẽ bắt mở
 * 薬剤使用量選択 (frm203016.cs:1428) — dialog đó đọc thành phần từ `mst_drug_rx`, thứ
 * path B theo định nghĩa là không có. Nếu master của tenant khác không có 602-0
 * thì đổi bằng TEST_CLONE_TRT_CD / TEST_CLONE_TRT_SB.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ BẪY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. So chuỗi phải NFKC CẢ HAI VẾ — DOM có thể mang 半角 còn master mang 全角.
 * 2. Mã seed phải là mã CÒN TRỐNG trong khoảng 600–699 của bản master đang áp
 *    dụng, nếu không `enterTen` sẽ mở 処置選択 (≥2 枝番) thay vì commit thẳng.
 *    Đổi bằng TEST_PATHB_TRT_CD / TEST_PATHB_NO_MED_TRT_CD.
 * 3. Commit một dòng 処置 kéo theo SingleChk / カルテ記載選択 đi qua BE nên đến TRỄ —
 *    phải `closeStrayDialogs(waitMs > 0)` chứ đếm một phát ngay sau Enter là thấy
 *    "sạch" rồi overlay nuốt click của testcase kế.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 npx playwright test tests/treatment-grid/drug-path-b-mst-med.spec.ts
 *
 * Spec CÓ ghi DB: 2 dòng `mst_trt` + 1 dòng `mst_med`, xoá HẲN theo id ở afterAll.
 * KHÔNG bấm F9 登録 nên `trn_trn` thật không bị đụng; dòng 処置 chèn vào lưới chỉ
 * sống trong RAM và được `deleteTreatmentRows` dọn cho chắc.
 *
 * Mặc định: 患者 10 (bệnh nhân parity, ít dòng TRNTRN), 診療日 = hôm nay (WinForm
 * chặn thao tác sang tháng khác). Đổi bằng TEST_PAT_NO / TEST_TRT_DT.
 */

const PAT_NO = patNo('10')
const TRT_DT = trtDt(TODAY_ISO)

/** Dòng 薬剤 dùng làm nguồn clone — f2 = 0 (xem 「VÌ SAO PHẢI SEED」). */
const CLONE_TRT_CD = Number(process.env.TEST_CLONE_TRT_CD ?? 602)
const CLONE_TRT_SB = Number(process.env.TEST_CLONE_TRT_SB ?? 0)

/** Mã seed CÓ dòng 用法 trong mst_med → path B đủ 2 dòng. */
const PATH_B_CD = Number(process.env.TEST_PATHB_TRT_CD ?? 698)
/** Mã seed KHÔNG có dòng 用法 → path B chỉ còn dòng 処置名称. */
const NO_MED_CD = Number(process.env.TEST_PATHB_NO_MED_TRT_CD ?? 699)
const SEED_TRT_SB = 0

/**
 * Tên + 用法 seed. Cố ý ĐỘC NHẤT và KHÔNG chứa 「日分」/「回分」 để assert (3) —
 * "path B không gắn hậu tố 用量" — không bị chính dữ liệu seed làm nhiễu.
 */
const PATH_B_NM = 'ﾃｽﾄ院内調剤薬PB'
const PATH_B_USAGE = 'ﾃｽﾄ用法　毎食後　服用'
const NO_MED_NM = 'ﾃｽﾄ院内調剤薬NM'

/** Alert cũ của FE khi không dựng được ô 薬剤 — path B chạy đúng thì KHÔNG hiện. */
const UNSUPPORTED_MSG = 'この薬剤コードは現在未対応です。'
/** 0 kết quả của GetTrtmasCod (modMain.cs:280) — mã seed hụt thì hiện cái này. */
const NO_TRT_MSG = '該当処置はありません。'

/** NFKC + gộp khoảng trắng — dùng cho CẢ hai vế mọi phép so chuỗi (BẪY 1). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: path B không tồn tại trong master dev, spec phải seed mst_trt + mst_med',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 薬剤 path B (mst_trt 名称 + mst_med 用法)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** id các dòng master đã seed — dọn theo id, KHÔNG theo (trt_cd, trt_sb). */
    /** Dòng `mst_drug_rx` của mã nguồn clone — dựng kỳ vọng cho testcase ĐỐI CHỨNG path A. */
    let cloneRx: DrugRxRow | undefined

    let seededTrtIds: string[] = []
    let seededMedIds: string[] = []

    /** Nút đổi 入力モード (点数 ↔ コード) — nhãn đổi theo mode nên bám `title`. */
    let modeBtn: Locator
    /** Ô 点 của dòng 日計 đang hoạt động. */
    let footerTen: Locator
    /** Dialog 処置選択 (frm203016). */
    let picker: Locator
    /** Dialog カルテ記載選択 do AutoSantei tự bung khi vào màn. */
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

    /** Dọn dialog dây chuyền sau khi commit 処置 (BẪY 3). */
    async function closeStrayDialogs(waitMs = 0, rounds = 4) {
        const any = page.getByRole('dialog').or(page.getByRole('alertdialog'))
        for (let i = 0; i < rounds; i++) {
            const present =
                waitMs > 0
                    ? await any
                          .first()
                          .waitFor({ state: 'visible', timeout: i === 0 ? waitMs : 1500 })
                          .then(() => true)
                          .catch(() => false)
                    : (await any.count()) > 0
            if (!present) break
            const ok = page.getByRole('button', { name: 'OK' })
            if ((await ok.count()) > 0) await ok.first().click()
            else await page.keyboard.press('F10')
            await expect(any.first())
                .toBeHidden({ timeout: 10_000 })
                .catch(() => {})
        }
        await expect(
            page.locator('div.fixed.inset-0[data-state="open"]'),
            'overlay của dialog vẫn còn, mọi click lên lưới sẽ bị nuốt',
        ).toHaveCount(0, { timeout: 10_000 })
    }

    /**
     * Gõ một mã vào ô 点 của 日計 rồi Enter. Handler XOÁ input trước khi gọi
     * `onCodeEntry`, nên `value === ''` là tín hiệu CÓ THẬT cho biết Enter đã chạy.
     */
    async function enterTen(value: string) {
        await footerTen.click()
        await footerTen.fill(value)
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
    }

    /**
     * Gõ mã seed rồi trả về ô 療法・処置 của dòng vừa rơi xuống (khớp theo 処置名称).
     *
     * Kèm hai chốt chặn phân biệt "bug" với "spec sai": alert 「該当処置はありません。」
     * là seed hụt/mã đã có thật, còn 処置選択 mở ra là mã seed trùng 枝番 khác (BẪY 2).
     */
    async function commitSeededCode(code: number, nm: string): Promise<string> {
        await enterTen(String(code))

        const unsupported = page.getByText(UNSUPPORTED_MSG)
        const noTrt = page.getByText(NO_TRT_MSG)
        const landed = ryoCells(page).filter({ hasText: nm })

        // (0) Ba kết cục loại trừ nhau — chờ CÁI NÀO ĐẾN TRƯỚC rồi mới phán xét,
        //     để thông báo lỗi nói đúng chuyện đã xảy ra thay vì chỉ "timeout".
        await expect(landed.first().or(unsupported).or(noTrt)).toBeVisible({ timeout: 30_000 })

        expect(
            await unsupported.count(),
            `Mã ${code} bung alert 「${UNSUPPORTED_MSG}」 — path B (mst_trt 名称 + mst_med 用法) ` +
                'KHÔNG chạy. WinForm editDrugName:1136-1149 luôn dựng được ô cho mã có dòng 処置マスタ.',
        ).toBe(0)
        expect(
            await noTrt.count(),
            `Mã ${code} không tra được trong 処置マスタ — dòng seed chưa vào bản master của ngày ` +
                `${TRT_DT}? (clone nguồn ${CLONE_TRT_CD}-${CLONE_TRT_SB} có tồn tại không?)`,
        ).toBe(0)
        await expect(
            picker,
            `Mã ${code} mở 処置選択 ⇒ mã này ĐÃ CÓ trong master, seed đang trùng. ` +
                'Đặt TEST_PATHB_TRT_CD / TEST_PATHB_NO_MED_TRT_CD sang mã còn trống.',
        ).toBeHidden()

        const cells = await ryoTexts()
        const cell = cells.find((c) => norm(c).includes(norm(nm)))
        expect(cell, `không thấy dòng 「${nm}」 trên lưới sau khi gõ mã ${code}`).toBeDefined()

        await closeStrayDialogs(6000)
        return cell as string
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: false })

        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        picker = page.getByRole('dialog').filter({ hasText: '処置選択' })
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

        // Seed master TRƯỚC khi mở màn — mã phải tra được ngay lần gõ đầu.
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

        // Dòng nguồn clone VẪN còn mst_drug_rx ⇒ dựng được kỳ vọng path A cho testcase
        // ĐỐI CHỨNG ở cuối file.
        cloneRx = (await findDrugRx(CLONE_TRT_CD, CLONE_TRT_SB, TRT_DT)) ?? undefined

        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
        await drainAutoSantei()

        // コードモード — gõ MÃ vào ô 点 (frm203002 lớp ON: F10 → setInpMode('code')).
        // Dùng NÚT chứ không Shift+F10: đó là phím menu ngữ cảnh của hệ điều hành.
        await expect(modeBtn).toBeVisible({ timeout: 30_000 })
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
    })

    test.afterAll(async () => {
        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        await deleteMstMedRows(seededMedIds).catch(() => 0)
        await deleteMstTrtRows(seededTrtIds).catch(() => 0)
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('mã 薬剤 không có mst_drug_rx → ô 療法・処置 = 処置名称 + dòng 用法 của mst_med', async () => {
        expect(
            seededTrtIds.length,
            `seedMstTrtRows không tạo được dòng nào — bản master của ngày ${TRT_DT} không có ` +
                `dòng nguồn ${CLONE_TRT_CD}-${CLONE_TRT_SB}? Đặt TEST_CLONE_TRT_CD/SB.`,
        ).toBe(2)
        expect(seededMedIds.length, 'seedMstMedRows không tạo được dòng 用法').toBe(1)

        const cell = await commitSeededCode(PATH_B_CD, PATH_B_NM)
        await step()

        const flat = norm(cell)

        // (1) Dòng 用法 — editDrugName:1145-1148 `combineDrugNms.Add(getMstMed(...))`.
        expect(
            flat,
            `Dòng 薬剤 ${PATH_B_CD} thiếu dòng 用法 của mst_med.\n` +
                `  lưới in ra : ${JSON.stringify(cell)}\n` +
                `  WinForm    : 「${PATH_B_NM}」 + xuống dòng + 「${PATH_B_USAGE}」`,
        ).toContain(norm(PATH_B_USAGE))

        // (2) Ô phải NHIỀU DÒNG — combineDrugNms nối bằng '\n' (frm203016.cs:1489).
        expect(
            cell.includes('\n'),
            `Ô 療法・処置 của ${PATH_B_CD} chỉ có MỘT dòng: ${JSON.stringify(cell)}`,
        ).toBe(true)

        // (3) Thứ tự: 処置名称 TRƯỚC, 用法 SAU (editDrugName:1139 rồi :1145).
        const lines = cell.split('\n').map(norm).filter((l) => l !== '')
        expect(lines[0], `dòng đầu phải là 処置名称: ${JSON.stringify(lines)}`).toContain(
            norm(PATH_B_NM),
        )
        expect(lines[1], `dòng thứ hai phải là 用法: ${JSON.stringify(lines)}`).toContain(
            norm(PATH_B_USAGE),
        )

        // (4) KHÔNG có hậu tố 用量 — 「n日分」/「n回分」 dựng từ `med_kbn`, cột chỉ có ở
        //     mst_drug_rx, tức thứ path B theo định nghĩa là không có
        //     (editDrugName:1119-1135 nằm trong nhánh A).
        expect(
            flat,
            `Path B gắn hậu tố 用量 — WinForm chỉ gắn trong nhánh mst_drug_rx: ${JSON.stringify(cell)}`,
        ).not.toMatch(/\d+\s*(日分|回分)/)
    })

    test('mã 薬剤 không có mst_drug_rx lẫn mst_med → chỉ còn dòng 処置名称', async () => {
        // getMstMed trả chuỗi rỗng ⇒ `if (usage != string.Empty)` không thêm dòng
        // (editDrugName:1146). Vẫn phải chèn được dòng, KHÔNG alert.
        const cell = await commitSeededCode(NO_MED_CD, NO_MED_NM)
        await step()

        const lines = cell.split('\n').map(norm).filter((l) => l !== '')
        expect(lines, `mã không có 用法 phải ra ĐÚNG một dòng: ${JSON.stringify(cell)}`).toHaveLength(
            1,
        )
        expect(lines[0]).toContain(norm(NO_MED_NM))
        expect(
            norm(cell),
            'dòng 用法 của mã KHÁC bị lọt sang — GetUsagesAsync đang không lọc theo (trt_cd, trt_sb)?',
        ).not.toContain(norm(PATH_B_USAGE))
    })

    /**
     * ĐỐI CHỨNG của chính phép seed. Bổ sung 2026-09-09 cho khớp vế WinForm
     * (`DrugPathBProbeTests.Tc3_ProbeCloneSourceIsPathA`).
     *
     * Không có testcase này thì hai testcase trên chưa loại được khả năng 「mã 薬剤 nào
     * gõ vào cũng ra một-hai dòng như vậy」: mã seed là mã DUY NHẤT được đo, nên mọi
     * quan sát về nó đều có thể là hành vi chung chứ không phải hành vi của path B.
     *
     * Dòng NGUỒN CLONE vẫn còn `mst_drug_rx` ⇒ nó đi path A ⇒ ô 療法・処置 phải khác
     * hẳn: tên dựng từ `mst_drug` (KHÔNG phải `mst_trt.trt_nm`), và **có** hậu tố 用量
     * — đúng cái path B không bao giờ có.
     *
     * Số đo WinForm cùng mã, cùng ngày (Tc3, 2026-09-09):
     *     path A (600)  「ﾎﾞﾙﾀﾚﾝ錠25mg 2T」 ⏎ 「疼痛時　服用  2回分」
     *     path B (698)  「ﾃｽﾄ院内調剤薬PB」 ⏎ 「ﾃｽﾄ用法　毎食後　服用」
     */
    test('ĐỐI CHỨNG — mã CÒN mst_drug_rx đi path A: tên từ mst_drug và CÓ hậu tố 用量', async () => {
        skipWithReason(
            !cloneRx,
            `không đọc được mst_drug_rx của ${CLONE_TRT_CD}-${CLONE_TRT_SB} — không dựng ` +
                'được kỳ vọng path A',
        )

        // ⚠️ KHÔNG dùng `commitSeededCode` ở đây: nó dò dòng bằng `hasText: nm`, tức so
        //    chuỗi THÔ. Với mã seed thì được (tên nửa-chiều-rộng ở cả hai nơi), nhưng
        //    tên path A đến từ `mst_drug` ở dạng 全角 (「ボルタレン錠２５ｍｇ」) trong khi
        //    lưới in 半角 (「ボルタレン錠25mg 2T」) — BẪY 4, dò kiểu đó trượt sạch.
        //    Lấy PHẦN CHÊNH của lưới thay vì dò theo tên.
        const before = new Set(await ryoTexts())
        await enterTen(String(CLONE_TRT_CD))

        const unsupported = page.getByText(UNSUPPORTED_MSG)
        const noTrt = page.getByText(NO_TRT_MSG)
        let cell = ''
        await expect
            .poll(
                async () => {
                    if ((await unsupported.count()) || (await noTrt.count())) return 'BLOCKED'
                    cell = (await ryoTexts()).find((c) => !before.has(c) && norm(c) !== '') ?? ''
                    return cell
                },
                {
                    timeout: 30_000,
                    message: `mã ${CLONE_TRT_CD} không rơi xuống lưới (path A đối chứng)`,
                },
            )
            .not.toBe('')
        expect(cell, `mã ${CLONE_TRT_CD} bị chặn bởi alert thay vì rơi xuống lưới`).not.toBe('BLOCKED')
        await step()

        const flat = norm(cell)

        // (1) Tên đến từ mst_drug, KHÔNG phải mst_trt.trt_nm. Hai chuỗi này khác nhau
        //     thật: master ghi 「ﾎﾞﾙﾀﾚﾝ錠25mg２T」 còn mst_drug ghi 「ボルタレン錠２５ｍｇ」.
        expect(
            flat,
            `path A phải dựng tên từ mst_drug 「${cloneRx!.dgNm}」: ${JSON.stringify(cell)}`,
        ).toContain(norm(cloneRx!.dgNm))

        // (2) CÓ hậu tố 用量 — đây là chỗ path A và path B tách hẳn nhau
        //     (editDrugName:1119-1135 nằm TRONG nhánh A).
        expect(
            flat,
            'path A phải gắn hậu tố 用量 「n日分」/「n回分」 — không có nghĩa là nhánh A đang ' +
                `không chạy, và khi đó hai testcase path B ở trên chẳng chứng minh gì: ${JSON.stringify(cell)}`,
        ).toMatch(/\d+\s*(日分|回分)/)

        // (3) Và KHÔNG mang chuỗi của path B — nếu lẫn thì phép seed đã rò sang mã khác.
        expect(flat, 'ô của path A lại mang 用法 seed của path B').not.toContain(norm(PATH_B_USAGE))
    })
})
