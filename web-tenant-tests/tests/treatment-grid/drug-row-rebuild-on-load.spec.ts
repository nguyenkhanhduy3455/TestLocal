import { type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteMstMedRows,
    deleteMstTrtRows,
    deleteTreatmentRows,
    findDrugRx,
    seedMstMedRows,
    seedMstTrtRows,
    seedTreatmentRows,
    type DrugRxRow,
} from '../_shared/db'
import { openTreatmentEntry, ryoCells } from '../_shared/entry'
import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 診療入力 — mở màn hình lên thì ô 療法・処置 của **dòng 薬剤 đã lưu** phải được
 * DỰNG LẠI TỪ MASTER, không phải in ra `trn_trn.dsp_trt` đang lưu.
 *
 * ĐẶC TÍNH KIỂM THỬ: kỳ vọng bám WinForm (src/OCHACOM/INP), tính từ master qua
 * `findDrugRx` hoặc từ chính dữ liệu spec seed — không đọc hàm nào của app.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * FACT — nguồn WinForm
 * ═════════════════════════════════════════════════════════════════════════════
 *  - INP/Lib/modSave.cs:2626-2638 `GetTrnRs` (lưới THÁNG HIỆN TẠI):
 *        if (isCodeRange(drug, trt_cd)) {
 *            drugInfStr = getDrugName(con, null, raiin_cnt, trt_cd, trt_sb,
 *                                     trt_cnt, trt_dt, dsp_trt, freewd, true);
 *            hFG1[2] = drugInfStr.combineDrugNmsStr;      ← KHÔNG dùng dsp_trt
 *            if (drugInfStr.drugRxData != null) hFG1[2].ReadOnly = true;
 *        } else hFG1[2] = REGIRYO_PADLEFT + dsp_trt;
 *  - modSave.cs:4960-4969 — lưới THÁNG QUÁ KHỨ làm y hệt, chỉ khác là khoá ô
 *    không điều kiện.
 *  - `dsp_trt` là "cái thấy lúc lưu". Master đổi hoặc `freewd` khác mặc định thì
 *    chuỗi đã lưu thành cũ ⇒ WinForm không tin nó, dựng lại mỗi lần đọc lưới.
 *  - COMMON/Lib/EditControl.cs:1050-1055 — `free_wd` tách theo ',' rồi ghi đè
 *    `cnt[i]` của master; thành phần có 使用量 "0" bị bỏ khỏi ô.
 *  - EditControl.cs:1136-1149 — không có dòng mst_drug_rx thì path B:
 *    処置名称 (getMstTrtDataYaku) + 用法 (getMstMed), không có hậu tố 用量.
 *
 * ─── Web port ───────────────────────────────────────────────────────────────
 *  - `GetPatientTreatmentsHandler` gọi `DrugRowNameResolver` sau khi đọc TRN và
 *    thay `DspTrt` của dòng 薬剤 bằng chuỗi dựng lại (3 round trip, batch theo
 *    (mã, 枝番, 処置日); 0 round trip nếu không có dòng thuốc nào).
 *  - Trước bản vá, `treatment-table-mapper.ts` gán thẳng `name: dspTrt` — không
 *    có nhánh nào cho mã 600–699. Đó là hồi quy mà TC-1/TC-3 canh.
 *
 * ⚠️ **Spec này CHỈ xanh khi API đang chạy đã có bản vá.** Nếu API còn là bản cũ
 * thì TC-1 đỏ ngay ở assert đầu (ô vẫn in nguyên chuỗi sentinel đã seed) — đó là
 * dấu hiệu "chưa restart API", không phải lỗi spec.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⚠️ BẪY
 * ═════════════════════════════════════════════════════════════════════════════
 * 1. Phải seed `dspTrt` thành chuỗi ĐỘC NHẤT (sentinel). Seed đúng chuỗi master
 *    thì hai vế trùng nhau và test xanh giả cả khi app không dựng lại gì.
 * 2. So chuỗi phải NFKC CẢ HAI VẾ (DOM 半角 ↔ master 全角).
 * 3. TUYỆT ĐỐI KHÔNG Escape trên màn 診療入力: WinForm map Escape → End (登録).
 * 4. Dải mã seed KHÁC hai spec path B (696–699), VÀ 診療日 khác hôm nay — xem chú
 *    thích của TRT_DT. Cả hai đều để chạy song song không đụng nhau.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *     TEST_DB=1 npx playwright test tests/treatment-grid/drug-row-rebuild-on-load.spec.ts
 *
 * Spec CÓ ghi DB: dòng `trn_trn` ở vùng `disp_no >= 9000` (vùng dành cho test),
 * 2 dòng `mst_trt` + 1 dòng `mst_med`; dọn hết ở afterAll. KHÔNG bấm F9 登録.
 *
 * Mặc định: 患者 10, 診療日 = một ngày KHÁC hôm nay trong tháng này (xem chú thích
 * của TRT_DT). Đổi bằng TEST_PAT_NO / TEST_TRT_DT.
 */

const PAT_NO = patNo('10')

/**
 * 診療日 — CỐ Ý khác hôm nay, dù vẫn trong THÁNG HIỆN TẠI (WinForm chặn thao tác
 * sang tháng khác).
 *
 * Ba spec drug còn lại (`side-panel/guide-drug-usage-line`,
 * `treatment-grid/drug-path-b-mst-med`, `dialogs-selection/medicine-selection-drug-name`)
 * đều dùng 患者 10 + hôm nay và đều gọi `deleteTreatmentRows(patNo, hôm nay)`.
 * Chúng chỉ XOÁ nên không phiền nhau; spec này là spec DUY NHẤT SEED dòng
 * `trn_trn`, nên dùng chung ngày là dòng seed bị xoá giữa chừng khi Playwright
 * chạy song song 4 worker.
 */
const OTHER_DAY = new Date().getDate() >= 15 ? '01' : '28'
const TRT_DT = trtDt(`${TODAY_ISO.slice(0, 8)}${OTHER_DAY}`)

/** Mã 薬剤 CÓ mst_drug_rx — dùng cho TC-1/TC-2 (path A dựng lại). */
const DRUG_CD = Number(process.env.TEST_LOAD_TRT_CD ?? 602)
const DRUG_SB = Number(process.env.TEST_LOAD_TRT_SB ?? 0)

/** Mã seed cho path B khi load (dải riêng, xem BẪY 4). */
const PATH_B_CD = Number(process.env.TEST_LOADPB_TRT_CD ?? 694)
const SEED_TRT_SB = 0
const PATH_B_NM = 'ﾃｽﾄ読込薬PB'
const PATH_B_USAGE = 'ﾃｽﾄ用法　就寝前　服用'

/**
 * Chuỗi rác cố tình ghi vào `dsp_trt` (BẪY 1). Không được xuất hiện trên lưới —
 * thấy nó nghĩa là app đang in giá trị đã lưu thay vì dựng lại.
 */
const STALE = 'ｽﾃｰﾙ保存文字列ZZZ'

/** 回数 của dòng seed — chọn số ít trùng để thông báo lỗi dễ đọc. */
const TRT_CNT = 7

/** NFKC + gộp khoảng trắng — dùng cho CẢ hai vế mọi phép so chuỗi (BẪY 2). */
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim()

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: spec seed dòng trn_trn có dsp_trt cũ + master cho path B',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — dòng 薬剤 đã lưu được dựng lại từ master khi LOAD', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let seededTrtIds: string[] = []
    let seededMedIds: string[] = []

    /** Master của mã path A — dựng kỳ vọng, KHÔNG hardcode chuỗi của tenant dev. */
    let master: DrugRxRow | null = null
    /** 使用量 seed vào freewd, cố ý KHÁC `master.cnt1`. */
    let freewd = ''

    let karteCmtDialog: ReturnType<Page['getByRole']>

    /** Text ô 療法・処置, GIỮ NGUYÊN xuống dòng (ô 薬剤 là ô nhiều dòng). */
    async function ryoTexts(): Promise<string[]> {
        return ryoCells(page).evaluateAll((els) => els.map((e) => e.textContent ?? ''))
    }

    /** Chờ chuỗi AutoSantei chạy hết rồi dọn sạch. */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15_000 })
            await page.waitForTimeout(700)
        }
    }

    /**
     * Ô 療法・処置 của dòng chứa `needle`. Dòng seed luôn có mặt trên lưới (nó là
     * dòng trn_trn thật), nên không thấy = app in ra chuỗi khác hẳn kỳ vọng.
     */
    async function cellContaining(needle: string, hint: string): Promise<string> {
        let cells: string[] = []
        await expect
            .poll(
                async () => {
                    cells = await ryoTexts()
                    return cells.some((c) => norm(c).includes(norm(needle)))
                },
                { timeout: 30_000, intervals: [500], message: hint },
            )
            .toBe(true)
        return cells.find((c) => norm(c).includes(norm(needle)))!
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: false })

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

        master = await findDrugRx(DRUG_CD, DRUG_SB, TRT_DT)
        // 使用量 seed phải KHÁC mặc định của master, nếu không TC-2 không phân biệt
        // được "có đọc freewd" với "chỉ dựng theo master".
        freewd = master && master.cnt1 === '1' ? '2' : '1'

        // path B: mã không có mst_drug_rx, clone từ chính mã path A để mọi cột khác
        // (f2 = 0, grp, đơn vị…) giống dữ liệu thật.
        seededTrtIds = await seedMstTrtRows(TRT_DT, [
            {
                trtCd: PATH_B_CD,
                trtSb: SEED_TRT_SB,
                trtNm: PATH_B_NM,
                fromTrtCd: DRUG_CD,
                fromTrtSb: DRUG_SB,
            },
        ])
        seededMedIds = await seedMstMedRows([
            { trtCd: PATH_B_CD, trtSb: SEED_TRT_SB, usageNm: PATH_B_USAGE },
        ])

        await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        // BA dòng đã lưu, cả ba mang `dsp_trt` rác (BẪY 1):
        //   1. path A, freewd rỗng      → ô = master nguyên bản
        //   2. path A, freewd khác mặc định → ô đổi theo freewd
        //   3. path B (không có mst_drug_rx) → 処置名称 + 用法
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            { trtCd: DRUG_CD, trtSb: DRUG_SB, trtCnt: TRT_CNT, dspTrt: `${STALE}1` },
            { trtCd: DRUG_CD, trtSb: DRUG_SB, trtCnt: TRT_CNT, dspTrt: `${STALE}2`, freewd },
            { trtCd: PATH_B_CD, trtSb: SEED_TRT_SB, trtCnt: TRT_CNT, dspTrt: `${STALE}3` },
        ])

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

    test('TC-1 — dsp_trt đã lưu KHÔNG được in ra; ô dựng lại từ master', async () => {
        skipWithReason(
            master === null || !master.hasDrugRx || master.usageNm === '' || master.dgNm === '',
            `mã ${DRUG_CD}-${DRUG_SB} không có mst_drug_rx kèm 用法/薬剤名 trong master của ` +
                `ngày ${TRT_DT} — đặt TEST_LOAD_TRT_CD/SB sang mã khác`,
        )

        const cell = await cellContaining(
            master!.dgNm,
            `Không thấy dòng nào mang tên thuốc 「${master!.dgNm}」 sau khi mở màn. ` +
                'Nếu lưới đang in 「' + STALE + '…」 thì app vẫn dùng dsp_trt đã lưu ' +
                '(modSave.cs:2626-2638 dựng lại) — hoặc API đang chạy là bản chưa vá.',
        )
        await step()

        // (1) Chuỗi rác đã lưu KHÔNG được lọt ra lưới — đây là cốt lõi của G3.
        const all = (await ryoTexts()).map(norm).join('\n')
        expect(
            all,
            `Lưới vẫn in chuỗi 「${STALE}」 đã lưu ở dsp_trt ⇒ đường LOAD chưa dựng lại ` +
                'dòng 薬剤 (treatment-table-mapper vẫn gán thẳng name: dspTrt).',
        ).not.toContain(norm(STALE))

        // (2) Ô là combineDrugNms: 薬剤名 (từ mst_drug) + dòng 用法 (từ mst_drug_rx).
        expect(cell.includes('\n'), `ô path A phải nhiều dòng: ${JSON.stringify(cell)}`).toBe(true)
        expect(norm(cell)).toContain(norm(master!.usageNm))

        // (3) 用量 nối vào dòng cuối với 回数 CỦA DÒNG (trn_trn.trt_cnt), không phải g_cnt.
        const unit = master!.medKbn === '21' ? '日分' : master!.medKbn === '22' ? '回分' : ''
        if (unit !== '') {
            expect(
                norm(cell),
                `用量 phải theo 回数 của dòng đã lưu (${TRT_CNT}), master med_kbn ${master!.medKbn}`,
            ).toContain(`${TRT_CNT}${unit}`)
        }
    })

    test('TC-2 — freewd của dòng đã lưu đổi 使用量 trong ô dựng lại', async () => {
        skipWithReason(
            master === null || !master.hasDrugRx || master.cnt1 === '',
            `mã ${DRUG_CD}-${DRUG_SB} không có cnt1 trong mst_drug_rx — không đo được freewd`,
        )

        // Hai dòng CÙNG mã, cùng ngày, cùng 回数 — chỉ khác freewd. Nếu app bỏ qua
        // freewd thì hai ô giống hệt nhau; đó chính là phép so ở đây (không phụ thuộc
        // bảng viết tắt đơn vị 錠→T… nên không phải chép logic app vào spec).
        const cells = (await ryoTexts()).filter((c) => norm(c).includes(norm(master!.dgNm)))
        expect(
            cells.length,
            'phải thấy ĐÚNG 2 dòng của mã path A (một có freewd, một không)',
        ).toBeGreaterThanOrEqual(2)

        const distinct = new Set(cells.map(norm))
        expect(
            distinct.size,
            `Hai dòng cùng mã chỉ khác freewd ("" vs "${freewd}", master cnt1=${master!.cnt1}) ` +
                `mà ô giống hệt nhau ⇒ freewd chưa được đưa vào lúc dựng lại ` +
                `(EditControl.cs:1050-1055). Nội dung: ${JSON.stringify([...distinct])}`,
        ).toBe(2)

        // Dòng có freewd phải mang đúng con số đó ở cuối dòng thành phần đầu
        // (「<薬剤名> <使用量><単位>」) — dạng 「2T」/「2Ct」, đơn vị 0-2 chữ ASCII.
        // ⚠️ TÁCH DÒNG TRƯỚC rồi mới norm: `norm()` gộp MỌI khoảng trắng kể cả '\n',
        // nên `norm(cell).split('\n')` luôn trả về đúng 1 phần tử là cả ô.
        const firstLines = cells.map((c) => norm(c.split('\n')[0] ?? ''))
        const withFreewd = firstLines.find((l) =>
            new RegExp(`\\s${freewd}[A-Za-z]{0,2}$`).test(l),
        )
        expect(
            withFreewd,
            `không dòng nào có 使用量 = ${freewd} ở dòng thành phần đầu ` +
                `(master cnt1 = ${master!.cnt1}). Các dòng đầu: ${JSON.stringify(firstLines)}`,
        ).toBeDefined()
        await step()
    })

    test('TC-3 — dòng đã lưu không có mst_drug_rx đi path B: 処置名称 + 用法', async () => {
        expect(
            seededTrtIds.length,
            `seedMstTrtRows không tạo được dòng — bản master của ngày ${TRT_DT} không có ` +
                `dòng nguồn ${DRUG_CD}-${DRUG_SB}?`,
        ).toBe(1)

        const cell = await cellContaining(
            PATH_B_NM,
            `Không thấy dòng path B 「${PATH_B_NM}」 — nếu lưới in 「${STALE}3」 thì ` +
                'đường LOAD chưa dựng lại; nếu không thấy gì thì dòng seed chưa vào lưới.',
        )
        await step()

        const lines = cell
            .split('\n')
            .map(norm)
            .filter((l) => l !== '')
        expect(
            lines,
            `path B khi load phải ra ĐÚNG 2 dòng 処置名称 + 用法: ${JSON.stringify(cell)}`,
        ).toHaveLength(2)
        expect(lines[0]).toContain(norm(PATH_B_NM))
        expect(lines[1]).toContain(norm(PATH_B_USAGE))

        // KHÔNG có hậu tố 用量 — med_kbn chỉ có ở mst_drug_rx (EditControl.cs:1119-1135
        // nằm trong nhánh A), nên dù dòng đã lưu mang 回数 7 cũng không được thấy 「7日分」.
        expect(
            norm(cell),
            `path B gắn hậu tố 用量: ${JSON.stringify(cell)}`,
        ).not.toMatch(/\d+\s*(日分|回分)/)
    })
})
