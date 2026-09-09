import { type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
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
 * 薬剤使用量選択 (DrugQtySelectionDialog, WinForm frm203020).
 *
 * Chọn một 薬剤コード (600–699) mà master ghi 数量変更可 (`mst_trt.f2 = 1`) thì
 * dialog này phải bung ra TRƯỚC khi dòng rơi xuống lưới đăng ký. 確定 trả về 点数
 * tính từ 薬価 và chuỗi `freewd` ghi lại 使用量; 戻る thì dòng giữ nguyên 点数 mặc
 * định của master.
 *
 * ═══ NGUỒN WinForm (src/OCHACOM) ═══
 * ・frm203016.cs:1403 frmTrtSel_Let_Trt_Data — MỌI cú chốt 処置 đều xoá ô 72
 *   (`grdRegi[72, intMRow].Value = ""`) trước khi rẽ nhánh. Nên dòng 薬剤 không đi
 *   qua dialog thì `freewd` RỖNG.
 * ・frm203016.cs:1428-1455 — nhánh 薬剤: `if (trtData.F2 == 1)` → showDialog(ID203020);
 *   ComParam khác null thì `selRec.intPoint = data.score` và `grdRegi[72] = data.freeWd`.
 *   Bấm 戻る ⇒ ComParam vẫn null ⇒ KHÔNG ghi đè gì.
 * ・frm203020.cs:435 getViewData — mỗi slot `dg_cd` khác rỗng thành một dòng, lấy
 *   `dg_nm / cost / cnt / unit_nm / cost_type` từ `mst_drug_rx` ⨝ `mst_drug`.
 * ・frm203020.cs:402 setTable — 薬価計: `cost_type == '3'` thì LẤY NGUYÊN chuỗi 薬価
 *   (không nhân 使用量), còn lại là `薬価 × 使用量`.
 * ・frm203020.cs:486 getPoint — 0円→0点; <15円→1点; ≥15円 thì cứ 10円 thêm 1点
 *   (làm tròn LÊN). `F3 == 2` (院外処方) → 0点.
 * ・frm203020.cs:318 dgvSelect_CellClick — click vào BẤT KỲ ô nào của dòng thì
 *   使用量 +1 (trần 255); dòng `cost_type == '3'` không nhúc nhích.
 * ・frm203020.cs:268 dgvSelect_CellValidating — sửa 使用量 của dòng `cost_type '3'`
 *   bị `CancelEdit`; để trống cũng bị huỷ (ô giữ giá trị cũ).
 * ・frm203020.cs:150-160 formBase_KeyDown — Escape VÀ End đều nhảy vào btnF9_Click,
 *   tức là 確定 chứ KHÔNG phải huỷ. (Rule 10.4 — cùng họ với frm203017.)
 *
 * ═══ PORT WEB ═══
 * ・components/drug-qty-selection-dialog.tsx — toàn bộ số liệu do BE trả
 *   (POST /tenant/treatment/drug-qty); FE chỉ gửi vector 使用量 mỗi lần chốt ô /
 *   click dòng rồi vẽ lại. Công thức 15円/10円 KHÔNG có bản sao ở FE.
 * ・components/treatment-entry-detail.tsx `commitDrugPick` — sau khi
 *   GET /tenant/treatment/drug-rx trả `qtyChangeable`, chờ dialog rồi mới đặt
 *   `trtPt` / `freewd` và dựng lại tên thuốc với `freeWd`.
 *
 * ═══ NỬA WINFORM CỦA CHÍNH ĐIỂM PARITY NÀY ═══
 * `fla-ui-tests/src/OchaCom.FlaUiTests/Tests/DrugAmountSelect/` (commit b16bc17) đã
 * thông luồng + probe màn WinForm, và §4 của README ở đó để trống ô Playwright với
 * ghi chú 「viết sau, khi bên web có màn hình để so」. File này lấp đúng ba ô đó:
 *
 *     WinForm                      | file này
 *     ---------------------------- | -----------------------------------------
 *     Tc1_ProbeOpenAndShape        | 「bung ra với đúng thành phần…」
 *     Tc2_ProbeChangeAmount        | 「click vào dòng làm 使用量 +1…」 + 「Escape là 確定…」
 *     Tc3_ProbeReopenAndControl    | 「mã đối chứng…」 + 「F10 戻る…」
 *
 * Vì thế mã mặc định ở đây CỐ Ý trùng mã của luồng WinForm (605/0) — hai vế phải đo
 * đúng một thứ thì mới đối chiếu được. Số đo WinForm ghi trong README đó:
 * ｵｾﾞｯｸｽ150ｍｇ３T, 薬価 28.60/錠 → 使用量 3 (mặc định) = 9点 · 4 = 11点 · 10 = 29点.
 * Mã đối chứng 606/0 giữ `F2 = 0` để chứng minh cánh cửa `f2` thật sự là cánh cửa.
 *
 * ═══ ĐẶC TÍNH KIỂM THỬ ═══
 * Kỳ vọng được TÍNH LẠI trong chính spec này từ master (`mst_trt` + `mst_drug_rx`
 * + `mst_drug`) theo đúng mô tả WinForm ở trên — KHÔNG hardcode số của một mã cụ
 * thể (đổi master là vỡ) và KHÔNG import hàm nào của app,
 * vì cái đang đo chính là hàm đó. Chuỗi 薬価計/薬価合計 so bằng SỐ (sai số 0.01)
 * chứ không so từng ký tự: WinForm dựng chuỗi bằng `float.ToString()` (single
 * precision) và việc dựng lại đúng từng chữ số trong JS không nói thêm điều gì —
 * phần đó đã có unit test của BE (DrugQtyCalculatorTests) lo.
 *
 * ═══ ⚠️ BẪY KHI CHẠY ═══
 * 1. Dev KHÔNG có 処置 nào mang `f2 = 1` (đã soi: 63 mã 600–699 đều f2=0). Spec vì
 *    thế phải TỰ BẬT cờ trong `beforeAll` và TRẢ LẠI ở `afterAll`. Đây là spec
 *    DUY NHẤT ghi vào `mst_trt`; nếu nó chết giữa chừng thì chạy lại là cờ được
 *    trả về đúng (giá trị cũ đã đọc trước khi sửa). Bị Ctrl+C giữa chừng thì cờ
 *    còn bật — dọn tay:
 *      UPDATE t_tenant1.mst_trt SET f2 = 0 WHERE trt_cd = 690 AND trt_sb = 0;
 *    (0 là giá trị gốc của toàn bộ 63 mã 600–699 trong master dev.)
 * 2. TUYỆT ĐỐI KHÔNG Escape để đóng dialog này: Escape là 確定 (BẪY của cả họ
 *    dialog port từ BaseDialog). Muốn huỷ thì bấm F10.
 * 3. Sau khi dòng 薬剤 rơi xuống lưới, FE bật SingleChk → có thể bung W00100. Phải
 *    dọn trước khi gõ mã kế tiếp, nếu không modal nuốt click vào ô 点 của 日計.
 * 4. Tên thuốc trên lưới đã qua ZenToHan (半角) còn master là 全角 ⇒ KHÔNG dò dòng
 *    theo tên. Spec chụp tập rowKey TRƯỚC và SAU cú chốt rồi lấy phần chênh.
 * 5. Dòng KHÔNG rơi xuống ngay lúc hộp thoại đóng: `commitDrugPick` còn resolve lại
 *    tên thuốc kèm `freeWd` (một round-trip nữa) rồi mới đặt. Phải poll —
 *    `waitForAddedRow`. Đọc một phát là đỏ oan: lần chạy đầu đã vấp đúng vậy, ảnh
 *    chụp lúc fail cho thấy dòng 「…4T」 11点 nằm sẵn trên lưới.
 *
 * ═══ CHẠY ═══
 *     TEST_DB=1 npx playwright test tests/dialogs-selection/drug-qty-selection-dialog.spec.ts
 *
 * Spec KHÔNG bấm F9 登録 nên `trn_trn` không bị đụng; chỉ `mst_trt.f2` bị mượn tạm.
 * Đổi mã đem đo bằng TEST_DRUG_TRT_CD / TEST_DRUG_TRT_SB.
 */

const PAT_NO = patNo('12138')
const TRT_DT = trtDt(TODAY_ISO)

/**
 * 薬剤コード đem đo — mặc định 605/0 「ｵｾﾞｯｸｽ150ｍｇ３T」, ĐÚNG mã của luồng WinForm
 * (xem mục 「NỬA WINFORM」) để hai vế đối chiếu được với nhau.
 *
 * Muốn đo nhánh 薬価固定 (`cost_type '3'`) thì chạy lại với TEST_DRUG_TRT_CD=690
 * 「OA(1~2歯) &ｽｷｬﾝﾄﾞﾈｽﾄｶｰﾄﾘｯｼﾞ3%」 — mã 600–699 duy nhất của master dev có 2 thành
 * phần, gồm một dòng 薬価固定 và một dòng nhân theo 使用量.
 */
const TRT_CD = Number(process.env.TEST_DRUG_TRT_CD ?? 605)
const TRT_SB = Number(process.env.TEST_DRUG_TRT_SB ?? 0)

/**
 * Mã đối chứng — 薬剤 bình thường, `f2` KHÔNG bị đụng tới. Nếu dialog vẫn bung ra
 * cho mã này thì cổng `mst_trt.f2` của bản web đang hỏng (mở cho mọi 薬剤), và
 * testcase 「bung ra…」 ở trên sẽ xanh mà chẳng chứng minh được gì.
 */
const CONTROL_TRT_CD = Number(process.env.TEST_DRUG_CONTROL_TRT_CD ?? 606)
const CONTROL_TRT_SB = Number(process.env.TEST_DRUG_CONTROL_TRT_SB ?? 0)

/** `cost_type` khoá 薬価計 vào 薬価 (frm203020.setTable). */
const FIXED_COST_TYPE = '3'

/** `mst_trt.f3` — 2 là 院外処方, nhánh 0点 của getPoint. */
const OUT_OF_HOSPITAL = 2

/** Sai số chấp nhận khi so tiền (BE dựng chuỗi bằng float single precision). */
const YEN_EPS = 0.01

interface DrugSlot {
    dgNm: string
    dgCost: number
    medCnt: string
    unitNm: string
    costType: string
}

interface DrugMaster {
    slots: DrugSlot[]
    /** `mst_trt.score1` — 点数 mặc định khi KHÔNG qua dialog. */
    score1: number
    /** `mst_trt.f3`. */
    f3: number
    /** Giá trị `f2` gốc, để trả lại ở afterAll. */
    prevF2: number
    /** `f2` của mã đối chứng — phải là 0, nếu không thì đối chứng vô nghĩa. */
    controlF2: number
    /** `score1` của mã đối chứng — 点 mà dòng của nó phải mang. */
    controlScore1: number
}

/** 薬価計 một dòng — frm203020.setTable. */
function rowCost(slot: DrugSlot, medCnt: string): number {
    if (slot.costType === FIXED_COST_TYPE) return slot.dgCost
    return slot.dgCost * (Number.parseFloat(medCnt) || 0)
}

/** 点数 từ 薬価合計 — frm203020.getPoint. */
function pointOf(costSum: number, f3: number): number {
    if (f3 === OUT_OF_HOSPITAL) return 0
    if (costSum === 0) return 0
    if (costSum < 15) return 1
    return Math.ceil((costSum - 15) / 10) + 1
}

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: spec phải bật tạm mst_trt.f2 và tự tính kỳ vọng 薬価/点数 từ master',
)

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 薬剤使用量選択 (数量変更可 の薬剤)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let master: DrugMaster
    /** Index dòng ĐẦU TIÊN nhân theo 使用量 (không phải 薬価固定). */
    let scalableIdx = -1

    /** Dialog 薬剤使用量選択 — nhận diện bằng chính tiêu đề. */
    let dialog: Locator
    /** Ô 点 của dòng 日計 dưới cùng (input thật). */
    let footerTen: Locator
    /** Nút nhãn 入力モード ở header (lbInpMode). */
    let modeBtn: Locator
    /** 「カルテ記載選択」 do AutoSantei tự bung khi vào màn. */
    let karteCmtDialog: Locator

    /** Toàn bộ ô 療法・処置 kèm rowKey — dùng để tìm dòng MỚI rơi xuống (BẪY 4). */
    async function ryoRows(): Promise<{ key: string; text: string }[]> {
        return page.locator('[data-grid-cell$="|2"]').evaluateAll((els) =>
            els.map((e) => ({
                key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
                text: e.textContent ?? '',
            })),
        )
    }

    /**
     * Chờ ĐÚNG dòng vừa được chốt rơi xuống lưới, trả về rowKey của nó.
     *
     * KHÔNG được đọc lưới một phát ngay sau khi dialog đóng: `commitDrugPick` còn
     * phải resolve lại tên thuốc kèm `freeWd` (một round-trip nữa) rồi mới đặt
     * dòng. Đọc ngay thì thấy lưới CŨ và test đỏ với thông báo 「không thấy dòng」
     * trong khi app hoàn toàn đúng — đã vấp thật ở lần chạy đầu: ảnh chụp lúc fail
     * cho thấy dòng 「…4T」 11点 nằm sẵn trên lưới.
     */
    async function waitForAddedRow(before: ReadonlySet<string>): Promise<string> {
        let key = ''
        await expect
            .poll(
                async () => {
                    key = (await ryoRows()).find((r) => !before.has(r.key))?.key ?? ''
                    return key
                },
                {
                    timeout: 30_000,
                    message: 'không thấy dòng 薬剤 mới trên lưới sau khi chốt',
                },
            )
            .not.toBe('')
        return key
    }

    /** 点数 của dòng theo rowKey (cột 3). */
    async function pointOfRow(key: string): Promise<number> {
        const raw = await page.locator(`[data-grid-cell="${key}|3"]`).innerText()
        return Number(raw.trim())
    }

    /** Số ở một ô của dialog (bỏ khoảng trắng đệm mà CellFormatting thêm vào). */
    async function num(loc: Locator): Promise<number> {
        return Number((await loc.innerText()).trim())
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
                await drainAutoSantei()
                return
            } catch (e) {
                lastErr = e
                console.log(`openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} hỏng`)
            }
        }
        throw lastErr
    }

    /** Chờ AutoSantei chạy hết (locator handler chỉ chạy khi có assert auto-retry). */
    async function drainAutoSantei() {
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20_000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15_000 })
            await page.waitForTimeout(700)
        }
    }

    /** Dọn dialog dây chuyền sau khi dòng rơi xuống lưới (BẪY 3). */
    async function drainAfterCommit() {
        for (let i = 0; i < 4; i++) {
            const ok = page.getByRole('alertdialog').getByRole('button', { name: 'OK' })
            if (await ok.count()) {
                await ok
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {})
            }
            await page.waitForTimeout(400)
        }
    }

    /**
     * Gõ 薬剤コード vào ô 点 của 日計 rồi Enter — ở コードモード thì đây là một lần
     * tra 処置 (modMain.GetTrtmasCod). Mã chỉ có 1 枝番 nên chốt thẳng, không qua
     * 処置選択; đường đi tới thẳng `commitDrugPick`.
     */
    async function enterDrugCode(code: number = TRT_CD) {
        await footerTen.click()
        await footerTen.fill(String(code))
        await footerTen.press('Enter')
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
    }

    /** Mở dialog và chờ nó vẽ xong dòng đầu. */
    async function openDialog() {
        await enterDrugCode()
        await expect(dialog, '薬剤使用量選択 không bung ra — mst_trt.f2 chưa bật?').toBeVisible({
            timeout: 30_000,
        })
        await expect(dialog.getByTestId('drug-qty-row').first()).toBeVisible({ timeout: 30_000 })
    }

    /** Đóng bằng F10 戻る (BẪY 2 — Escape là 確定). */
    async function dismissDialog() {
        await dialog.getByRole('button', { name: /F10\s*戻る/ }).click()
        await expect(dialog).toBeHidden({ timeout: 15_000 })
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)

        master = await withDb(async (c) => {
            const empty = {
                slots: [],
                score1: 0,
                f3: 0,
                prevF2: 0,
                controlF2: 0,
                controlScore1: 0,
            }
            const ver = await c.query<{ version_id: string }>(
                `SELECT version_id FROM view_mst_trt_ver_active
                  WHERE $1::date BETWEEN start_date AND end_date
                  ORDER BY end_date DESC LIMIT 1`,
                [TRT_DT],
            )
            const versionId = ver.rows[0]?.version_id
            if (!versionId) return empty

            const trt = await c.query<{ f2: number; f3: number; score1: number }>(
                `SELECT f2::int AS f2, f3::int AS f3, score1::int AS score1
                   FROM view_mst_trt_active
                  WHERE version_id = $1 AND trt_cd = $2 AND trt_sb = $3 LIMIT 1`,
                [versionId, TRT_CD, TRT_SB],
            )
            if (!trt.rows[0]) return empty

            const control = await c.query<{ f2: number; score1: number }>(
                `SELECT f2::int AS f2, score1::int AS score1
                   FROM view_mst_trt_active
                  WHERE version_id = $1 AND trt_cd = $2 AND trt_sb = $3 LIMIT 1`,
                [versionId, CONTROL_TRT_CD, CONTROL_TRT_SB],
            )

            // 10 slot của 処置変換テーブル → mỗi slot khác rỗng là một dòng dialog.
            const slotCols = Array.from({ length: 10 }, (_, i) => i + 1)
                .map(
                    (n) => `SELECT ${n} AS ord, d.dg_cd${n} AS dg_cd, d.cnt${n} AS cnt
                              FROM view_mst_drug_rx_active d
                             WHERE d.trt_cd = $1 AND d.trt_sb = $2
                               AND $3::date BETWEEN d.app_st_dt AND d.app_ed_dt`,
                )
                .join(' UNION ALL ')
            const slots = await c.query<{
                dg_nm: string
                cost: string
                cnt: string
                unit_nm: string
                cost_type: string
            }>(
                `WITH s AS (${slotCols})
                 SELECT COALESCE(m.dg_nm, '')     AS dg_nm,
                        COALESCE(m.cost, 0)::text AS cost,
                        COALESCE(s.cnt, '')       AS cnt,
                        COALESCE(m.unit_nm, '')   AS unit_nm,
                        COALESCE(m.cost_type, '') AS cost_type
                   FROM s
                   LEFT JOIN view_mst_drug_active m
                          ON m.dg_cd = s.dg_cd
                         AND $3::date BETWEEN m.app_st_dt AND m.app_ed_dt
                  WHERE s.dg_cd IS NOT NULL AND s.dg_cd <> ''
                  ORDER BY s.ord`,
                [TRT_CD, TRT_SB, TRT_DT],
            )

            // BẪY 1 — dev không có mã nào 数量変更可, phải mượn cờ.
            await c.query(
                `UPDATE mst_trt SET f2 = 1
                  WHERE version_id = $1 AND trt_cd = $2 AND trt_sb = $3`,
                [versionId, TRT_CD, TRT_SB],
            )

            return {
                slots: slots.rows.map((r) => ({
                    dgNm: r.dg_nm,
                    dgCost: Number(r.cost),
                    medCnt: r.cnt,
                    unitNm: r.unit_nm,
                    costType: r.cost_type,
                })),
                score1: trt.rows[0].score1,
                f3: trt.rows[0].f3,
                prevF2: trt.rows[0].f2,
                controlF2: control.rows[0]?.f2 ?? -1,
                controlScore1: control.rows[0]?.score1 ?? 0,
            }
        })

        scalableIdx = master.slots.findIndex((s) => s.costType !== FIXED_COST_TYPE)

        disposeOverlays = await installOverlayHandlers(page, { santei: true, alerts: true })

        dialog = page.getByRole('dialog').filter({ hasText: '薬剤使用量選択' })
        footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
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

        await openTreatmentScreen()

        // Ô 点 tra theo MÃ chứ không theo 点数 → phải ở コードモード.
        await expect(footerTen).toBeVisible({ timeout: 30_000 })
        await modeBtn.click()
        await expect(modeBtn).toHaveText('コード')
    })

    test.afterAll(async () => {
        // Trả cờ f2 về nguyên trạng dù test đỏ hay xanh (BẪY 1).
        if (master && dbEnabled) {
            await withDb(async (c) => {
                await c.query(
                    `UPDATE mst_trt t SET f2 = $1
                       FROM view_mst_trt_ver_active v
                      WHERE t.version_id = v.version_id
                        AND $2::date BETWEEN v.start_date AND v.end_date
                        AND t.trt_cd = $3 AND t.trt_sb = $4`,
                    [master.prevF2, TRT_DT, TRT_CD, TRT_SB],
                )
            }).catch(() => undefined)
        }
        await disposeOverlays?.()
        await page?.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    test('bung ra với đúng thành phần của 処置変換テーブル và tổng khớp master', async () => {
        skipWithReason(
            master.slots.length === 0,
            `処置 ${TRT_CD}-${TRT_SB} không có thành phần 薬剤 nào trong master ngày ${TRT_DT} — ` +
                'đặt TEST_DRUG_TRT_CD sang mã khác',
        )

        await openDialog()
        await step()

        const rows = dialog.getByTestId('drug-qty-row')
        await expect(rows, 'số dòng khác số slot dg_cd của mst_drug_rx').toHaveCount(
            master.slots.length,
        )

        let expectedSum = 0
        for (const [i, slot] of master.slots.entries()) {
            const row = rows.nth(i)
            expect(
                (await row.getByTestId('drug-qty-dg-nm').innerText()).normalize('NFKC').trim(),
                `dòng ${i}: 薬剤名称 không phải tên của master`,
            ).toBe(slot.dgNm.normalize('NFKC').trim())
            expect(await row.getByTestId('drug-qty-med-cnt').innerText(), `dòng ${i}: 使用量`).toBe(
                slot.medCnt,
            )
            expect(await row.getByTestId('drug-qty-unit-nm').innerText(), `dòng ${i}: 単位`).toBe(
                slot.unitNm,
            )

            const cost = rowCost(slot, slot.medCnt)
            expectedSum += cost
            expect(
                await num(row.getByTestId('drug-qty-cost')),
                `dòng ${i}: 薬価計 (cost_type ${slot.costType})`,
            ).toBeCloseTo(cost, 2)
        }

        expect(await num(dialog.getByTestId('drug-qty-cost-sum')), '薬価合計').toBeCloseTo(
            expectedSum,
            2,
        )

        const point = pointOf(expectedSum, master.f3)
        expect(await num(dialog.getByTestId('drug-qty-point')), '点数').toBe(point)

        // Kiểm tréo mạnh nhất có được: với 使用量 mặc định, 点数 tính từ 薬価 phải
        // TRÙNG `mst_trt.score1` — chính con số master tự ghi cho 処置 này.
        expect(
            point,
            `点数 tính từ 薬価 (${expectedSum}円) ra ${point} nhưng mst_trt.score1 = ` +
                `${master.score1} — công thức 15円/10円 của getPoint đang sai`,
        ).toBe(master.score1)

        await dismissDialog()
        await step()
    })

    test('click vào dòng làm 使用量 +1 và tổng/点数 tính lại (CellClick)', async () => {
        skipWithReason(scalableIdx < 0, 'không có dòng nào nhân theo 使用量 để click')

        await openDialog()
        const row = dialog.getByTestId('drug-qty-row').nth(scalableIdx)
        // `!` an toàn: skipWithReason ở trên đã chặn scalableIdx < 0.
        const slot = master.slots[scalableIdx]!

        // Click vào ô 薬剤名称 — CellClick không nhìn cột, ô nào cũng +1.
        await row.getByTestId('drug-qty-dg-nm').click()

        const bumped = String((Number.parseFloat(slot.medCnt) || 0) + 1)
        await expect(row.getByTestId('drug-qty-med-cnt'), '使用量 không tăng').toHaveText(bumped)

        const sum = master.slots.reduce(
            (acc, s, i) => acc + rowCost(s, i === scalableIdx ? bumped : s.medCnt),
            0,
        )
        expect(await num(row.getByTestId('drug-qty-cost')), '薬価計 dòng vừa click').toBeCloseTo(
            rowCost(slot, bumped),
            2,
        )
        expect(await num(dialog.getByTestId('drug-qty-cost-sum')), '薬価合計').toBeCloseTo(sum, 2)
        expect(await num(dialog.getByTestId('drug-qty-point')), '点数').toBe(
            pointOf(sum, master.f3),
        )

        await dismissDialog()
        await step()
    })

    test('dòng 薬価固定 (cost_type 3) không đổi khi click', async () => {
        const fixedIdx = master.slots.findIndex((s) => s.costType === FIXED_COST_TYPE)
        skipWithReason(
            fixedIdx < 0,
            `処置 ${TRT_CD}-${TRT_SB} không có thành phần cost_type '3'. Nhánh 薬価固定 ` +
                'đo bằng: TEST_DB=1 TEST_DRUG_TRT_CD=690 npx playwright test ' +
                'tests/dialogs-selection/drug-qty-selection-dialog.spec.ts',
        )

        await openDialog()
        const row = dialog.getByTestId('drug-qty-row').nth(fixedIdx)
        const slot = master.slots[fixedIdx]!

        await row.getByTestId('drug-qty-dg-nm').click()

        await expect(row.getByTestId('drug-qty-med-cnt'), '使用量 của dòng 薬価固定 bị đổi').toHaveText(
            slot.medCnt,
        )
        expect(await num(row.getByTestId('drug-qty-cost')), '薬価計 dòng 薬価固定').toBeCloseTo(
            slot.dgCost,
            2,
        )

        await dismissDialog()
        await step()
    })

    test('Escape là 確定 — dòng nhận 点数 vừa tính, KHÔNG phải mst_trt.score1', async () => {
        skipWithReason(scalableIdx < 0, 'không có dòng nào nhân theo 使用量 để đổi 点数')

        await openDialog()
        await dialog.getByTestId('drug-qty-row').nth(scalableIdx).getByTestId('drug-qty-dg-nm').click()

        const bumped = String((Number.parseFloat(master.slots[scalableIdx]!.medCnt) || 0) + 1)
        const sum = master.slots.reduce(
            (acc, s, i) => acc + rowCost(s, i === scalableIdx ? bumped : s.medCnt),
            0,
        )
        const expected = pointOf(sum, master.f3)
        expect(
            expected,
            'sau khi +1 mà 点数 vẫn bằng score1 thì testcase này không chứng minh được gì — ' +
                'đổi TEST_DRUG_TRT_CD sang mã có 薬価 lớn hơn',
        ).not.toBe(master.score1)

        const before = new Set((await ryoRows()).map((r) => r.key))

        // BẪY 2 — Escape ở dialog này là btnF9_Click.
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden({ timeout: 15_000 })

        const added = await waitForAddedRow(before)
        expect(await pointOfRow(added), '点 của dòng 薬剤 sau 確定').toBe(expected)

        await drainAfterCommit()
        await step()
    })

    test('mã đối chứng (f2 = 0) KHÔNG mở dialog — cổng f2 đúng là cổng', async () => {
        skipWithReason(
            master.controlF2 !== 0,
            `mã đối chứng ${CONTROL_TRT_CD}-${CONTROL_TRT_SB} có f2 = ${master.controlF2} ` +
                '(cần 0) — đặt TEST_DRUG_CONTROL_TRT_CD sang 薬剤 khác',
        )

        const before = new Set((await ryoRows()).map((r) => r.key))
        await enterDrugCode(CONTROL_TRT_CD)

        // Dòng phải rơi thẳng xuống lưới, KHÔNG qua hộp thoại nào.
        const added = await waitForAddedRow(before)
        await expect(dialog, '薬剤使用量選択 bung ra cho mã f2 = 0 — cổng f2 hỏng').toBeHidden()
        expect(await pointOfRow(added), '点 của mã đối chứng phải là score1').toBe(
            master.controlScore1,
        )

        await drainAfterCommit()
        await step()
    })

    test('F10 戻る giữ nguyên 点数 mặc định của master (ComParam null)', async () => {
        await openDialog()
        if (scalableIdx >= 0) {
            // Bấm +1 rồi bỏ đi: 戻る phải VỨT thay đổi này.
            await dialog
                .getByTestId('drug-qty-row')
                .nth(scalableIdx)
                .getByTestId('drug-qty-dg-nm')
                .click()
        }

        const before = new Set((await ryoRows()).map((r) => r.key))
        await dismissDialog()

        const added = await waitForAddedRow(before)
        expect(await pointOfRow(added), '点 phải là mst_trt.score1').toBe(master.score1)

        await drainAfterCommit()
        await step()
    })
})
