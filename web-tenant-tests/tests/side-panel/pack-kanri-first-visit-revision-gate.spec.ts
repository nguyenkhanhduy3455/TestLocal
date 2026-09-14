import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    findMstTrt,
    findPacsWithTrtSlot,
    findTreInpFlg,
    type MstTrtRow,
} from '../_shared/db'
import { patNo, trtDt } from '../_shared/env'
import { openTreatmentEntry } from '../_shared/entry'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * パック処置選択 (frm203014) — CỔNG 改定 của phép thay 歯管 trong 初診月.
 *
 * Sinh ra từ bug thật: mở パック 「P　初診（精密）」 ở 診療年月 08年09月 (令和8年9月),
 * WinForm in ba dòng 135-3 パ電 402点 / 116-7 歯管 90点 / 108-2 歯清 72点, còn web chỉ
 * in HAI dòng — mất hẳn 歯管. Nguyên nhân: BE đổi slot 116-7 → 116-6 mà KHÔNG kiểm
 * kỳ 改定, trong khi 116-6 đã bị bỏ khỏi mst_trt từ 令和8年6月 ⇒ LEFT JOIN không khớp
 * ⇒ resolver bỏ dòng.
 *
 * ─── FACT lấy từ WinForm (Rule 21) ───────────────────────────────────────────
 *  - frm203014.cs:441 getViewData — phép thay nằm TRONG
 *      `DateHelper.IsDateTimeBetween(new DateTime(2020,4,1),
 *         ComConst.MedicalFeeRevision_202606.AddDays(-1), targetDt)`
 *    ⇒ chỉ áp dụng cho 診療日 thuộc 2020/04/01 … 2026/05/31.
 *  - frm203014.cs:443-451 — trong khung đó, nếu slot là (116, 7) và 初診日 của
 *    「1初診」 (ModSave.GetMedtreatStart_FirstVisit) CÙNG NĂM+THÁNG với 診療日 thì
 *    `dis_sb = 6` (歯管(初診月)). Không lấy được 初診日 (`syosinDt == ""`) → KHÔNG thay.
 *  - ComConst.cs:28 — `MedicalFeeRevision_202606 = 2026/06/01`.
 *  - frm203014.cs:441 của frm203017 (ガイド) có khối y hệt — bản web CHƯA port
 *    (GuideTrtResolver.cs:29 ghi là "remaining cut") nên file này KHÔNG đo tab ガイド.
 *
 * ─── FACT lấy từ source web ──────────────────────────────────────────────────
 *  - apps/api/.../Pacs/Handlers/ListPacTrtsHandler.cs — `firstVisitMonth` =
 *    `TrtDt >= MedicalFeeRevisions.R02_04 && TrtDt < MedicalFeeRevisions.R08_06`
 *    && 初診日 cùng năm+tháng. Cờ này đi vào SQL và quyết định thay hay không.
 *  - apps/api/.../Infrastructure/Pacs/Queries/PacTrtsQueries.cs — SQL
 *    `CASE WHEN @firstVisitMonth AND dis_cd = 116 AND dis_sb = 7 THEN 6 ELSE dis_sb END`.
 *  - components/treatment-entry-detail.tsx:2904 `firstVisitDt` — FE tự suy 初診日 của
 *    tháng đang xem TỪ LƯỚI SỐNG (kể cả dòng 自動算定 chưa lưu) rồi gửi lên BE qua
 *    query `FirstVisitDt`. Vì vậy spec ĐỌC CHÍNH query đó làm tiền đề, không đoán.
 *  - api/pac-trts-api.ts — `GET /tenant/pacs/treatments?PacCd&TrtDt&PatNo&FirstVisitDt&Bui&DisCd`,
 *    trả `{ data: PacTrtItemResponse[] }` với `trtCd/trtSb/trtNm/score/cnt/jihiFlg`.
 *  - PacTrtResolver.cs — cột 処置名称 là `cct_nm` (カルテ名称) khi
 *    `inp_config.tre_inp_flg == 1`, ngược lại là `trt_nm` (frm203014.cs:538-541).
 *    Dev DB đang bật cờ này ⇒ dialog in 「歯科疾患管理料」 chứ không phải 「歯管」;
 *    spec đọc cờ qua `findTreInpFlg()` rồi mới chọn cột để so.
 *  - components/pack-selection-dialog.tsx + cnt-cell.tsx — lưới dialog dùng
 *    `getRowKey = trtRowKey` ⇒ mỗi dòng có `data-testid="row-<trtCd>-<trtSb>"`,
 *    ô là `cell-trtCd / cell-trtSb / cell-trtNm / cell-score / cell-cnt`;
 *    cụm header có nhãn 「パック番号」 + `pac_cd` trong `<span class*="font-mono">`.
 *  - 116-7 KHÔNG có dòng inp_chk_10 (必要病名) lẫn inp_chk_4 (歯数ブロック), và
 *    `mst_trt.unit = 2` (口腔) nên `chkSiga` cho qua kể cả khi dòng focus KHÔNG có
 *    部位 (MstTrtUnit.BillableWithoutBui = [0,2,3,9]) ⇒ dialog vẫn phải in 歯管 dù
 *    lưới của ngày đó trống. Nhờ vậy spec không cần seed 部位/病名.
 *
 * ─── Vì sao spec này KHÔNG hardcode 「90点」/「803」 ──────────────────────────
 * 点数 và cả sự tồn tại của 116-6/116-7 đổi theo BẢN master (mst_trt_ver), còn
 * パック nào chứa slot 116-7 thì tuỳ tenant. Cả hai đều được TRA TỪ DB rồi mới suy
 * kỳ vọng (Rule 15) — hardcode là xanh giả ở tenant/tháng khác.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 npx playwright test tests/side-panel/pack-kanri-first-visit-revision-gate.spec.ts
 *
 * Chạy CẢ FILE, đừng `-g` một testcase: `describe.serial` + page dùng chung theo
 * worker, mỗi testcase nối tiếp trạng thái của testcase trước (Rule 19).
 * Spec KHÔNG ghi gì xuống DB (chỉ SELECT) nên không cần TEST_ALLOW_SAVE.
 *
 * Bốn testcase bắt buộc cho hộp thoại (Rule 23 — focus khi mở, thanh cuộn, thông
 * báo, mở lại reset) đã nằm ở `pack-sidepanel-handler.spec.ts`; file này CHỈ đo
 * NỘI DUNG danh sách theo kỳ 改定.
 */

// ─── Hằng số theo đúng tên hằng của source (Rule 21) ─────────────────────────

/** 歯管 — 歯科疾患管理料. `frm203014.cs:443`. */
const KANRI_TRT_CD = 116
/** 枝番 thường (歯管). */
const KANRI_SB_NORMAL = 7
/** 枝番 của 歯管(初診月) — mã bị bỏ khỏi master từ 令和8年6月. */
const KANRI_SB_FIRST_VISIT = 6
/** Cận DƯỚI của khung thay thế — `new DateTime(2020, 4, 1)` (frm203014.cs:441). */
const REV_R02_04 = '2020-04-01'
/** Cận TRÊN (không bao gồm) — `ComConst.MedicalFeeRevision_202606` (ComConst.cs:28). */
const REV_R08_06 = '2026-06-01'

/**
 * 患者番号 mặc định = 5 (Rule 18): đây là bệnh nhân của lần tái hiện bug, và
 * 自動算定 của ngày mới tự thêm 歯科初診料 CHƯA LƯU vào lưới — đúng tiền đề 初診月.
 */
const PAT_NO = patNo('5')

/**
 * 診療日 SAU 改定 令和8年6月 — mặc định 2026-07-01 (env `TEST_TRT_DT`).
 *
 * Rule 18: KHÔNG dùng hôm nay. Tiền đề của bug là 初診月 + sau 改定, mà 初診日 do FE
 * suy từ lưới; bệnh nhân 5 có 歯科初診料 (100-0) THẬT vào 2026-07-01 nên chỉ tháng
 * 2026-07 mới dựng được đúng nhánh đó. Lấy hôm nay (2026-09) thì FE gửi
 * `FirstVisitDt=2026-07-01` ⇒ khác tháng ⇒ test đi nhánh 「không phải 初診月」 và
 * XANH cả khi chưa vá — đúng loại xanh giả TC-K2 phải chặn.
 */
const TRT_DT_POST = trtDt('2026-07-01')

/**
 * 診療日 TRONG khung thay thế — mặc định 2025-12-23, ngày bệnh nhân 5 có
 * 歯科初診料 (100-0) THẬT trong dev DB, nên tiền đề 初診月 dựng được mà không phải
 * ghi gì. Đổi bằng env `TEST_TRT_DT_PRE`.
 */
const TRT_DT_PRE = process.env.TEST_TRT_DT_PRE ?? '2025-12-23'

/** Số dòng パック tối đa sẽ dò khi tìm パック chứa slot 116-7. */
const SCAN_LIMIT = 12

/** Một dòng 処置 đọc từ response `GET /tenant/pacs/treatments`. */
interface PacTrtWire {
    trtCd: number | string
    trtSb: number | string
    trtNm: string
    score: number | string
    cnt: number | string
}

/** Những gì một lần mở dialog để lại: query FE đã gửi + danh sách BE trả về. */
interface PickCapture {
    /** Query string của request cuối cùng — nguồn của `TrtDt` / `FirstVisitDt`. */
    url: string
    items: PacTrtWire[]
}

// Rule 18 — skip phải nói rõ lý do.
test.skip(
    !dbEnabled,
    'Cần TEST_DB=1: spec tra pac_mst (パック nào chứa slot 116-7) và mst_trt của ' +
        'bản master từng ngày để TỰ TÍNH kỳ vọng thay vì hardcode 90点/803.',
)

test.describe.configure({ mode: 'serial' })

test.describe('パック処置選択 — cổng 改定 của 歯管 初診月 (frm203014.getViewData:441)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Dialog frm203014 — nhận diện bằng nhãn 「パック番号」 (Rule 13.1). */
    let picker: Locator
    /** Alert của nhánh rỗng (frm203014.cs:122-126). */
    let noTrtAlert: Locator
    /** カルテ記載選択 — 自動算定 tự bung, nuốt F-key nếu để đó (Rule 14). */
    let karteCmtDialog: Locator
    /** Dòng của tab パック — header cũng dùng grid-cols-[42px_1fr] nên phải kèm cursor-pointer. */
    let packRows: Locator

    /** Request/response gần nhất của `GET /tenant/pacs/treatments`. */
    let lastUrl = ''
    let lastItems: PacTrtWire[] = []

    /** パック trong pac_mst có slot (116, 7) — tra một lần ở beforeAll. */
    let pacsWithKanri: Awaited<ReturnType<typeof findPacsWithTrtSlot>> = []
    /** Các 枝番 của mã 116 trong bản master của từng 診療日. */
    const masterByDate = new Map<string, MstTrtRow[]>()
    /** `inp_config.tre_inp_flg` — quyết định cột 処置名称 lấy `cct_nm` hay `trt_nm`. */
    let treInpFlg = 0

    /** Tên 処置 mà dialog PHẢI in cho một dòng master (frm203014.cs:538-541). */
    const expectedNm = (m: MstTrtRow) => (treInpFlg === 1 ? m.cctNm : m.trtNm)

    const dialogRows = () => picker.locator('[data-testid^="row-"]')
    const cellOf = (rowKey: string, id: string) =>
        picker.locator(`[data-testid="row-${rowKey}"] [data-testid="cell-${id}"]`)

    /**
     * Chờ KẾT QUẢ THẬT của một cú chốt パック.
     *
     * Không mốc vào `picker` không thôi: dialog bung ra ngay khi query còn chạy rồi
     * mới tự đóng nếu パック không có 処置 nào (frm203014.cs:122-126) — chờ `picker`
     * sẽ khớp luôn cửa sổ loading và bỏ lọt nhánh rỗng.
     */
    async function waitPickResult(): Promise<'rows' | 'empty'> {
        await expect(picker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
            timeout: 30000,
        })
        return (await noTrtAlert.count()) > 0 ? 'empty' : 'rows'
    }

    async function dismissNoTrtAlert() {
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
    }

    /**
     * Đóng dialog bằng PHÍM F10 — KHÔNG click nút 「F10 戻る」 (màn nền cũng có một
     * nút y hệt nằm dưới modal, Rule 10.3) và TUYỆT ĐỐI KHÔNG Escape.
     */
    async function dismissPicker() {
        if ((await picker.count()) === 0) return
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /** Mở tab パック và chờ list pac_mst nạp xong. */
    async function enterPackTab() {
        await dismissPicker()
        if ((await noTrtAlert.count()) > 0) await dismissNoTrtAlert()
        await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
        await page.getByRole('button', { name: 'パック', exact: true }).click()
        await expect(packRows.first()).toBeVisible({ timeout: 30000 })
    }

    /**
     * Mở パック ĐẦU TIÊN (trong `pacsWithKanri`) mà tab パック có hiện, rồi trả về
     * query + danh sách của nó.
     *
     * Chọn THEO TÊN chứ không theo chỉ số: cột 「No.」 là số thứ tự hiển thị
     * (frm203002.cs:2033), không phải `pac_cd`, nên chỉ số dòng không phải mốc ổn định.
     */
    async function openPackWithKanri(): Promise<PickCapture & { pacCd: number; pacNm: string }> {
        await enterPackTab()
        const total = Math.min(await packRows.count(), SCAN_LIMIT)
        const names: string[] = []
        for (let i = 0; i < total; i++) {
            names.push((await packRows.nth(i).locator('div').nth(1).innerText()).trim())
        }
        for (const pac of pacsWithKanri) {
            const idx = names.findIndex(
                (n) => n.normalize('NFKC') === pac.pacNm.normalize('NFKC'),
            )
            if (idx < 0) continue

            lastUrl = ''
            lastItems = []
            await packRows.nth(idx).click()
            if ((await waitPickResult()) === 'empty') {
                // パック này rỗng ở ngày đang xem — thử パック kế tiếp.
                await dismissNoTrtAlert()
                continue
            }
            // Cụm header 「パック番号」 phải đúng パック vừa click — chốt lại là đã mở
            // đúng thứ mình tra từ DB, không phải một パック trùng tên.
            const shown = Number(
                (await picker.locator('span[class*="font-mono"]').first().innerText()).trim(),
            )
            expect(shown, `dialog mở sai パック (click 「${pac.pacNm}」)`).toBe(pac.pacCd)
            // Response về SAU khi dòng đầu render xong ở phần lớn lần chạy, nhưng
            // không phải mọi lần → chờ hẳn tới khi listener gom được.
            await expect
                .poll(() => lastItems.length, {
                    message: 'không bắt được response GET /tenant/pacs/treatments',
                    timeout: 15000,
                })
                .toBeGreaterThan(0)
            return { url: lastUrl, items: lastItems, pacCd: pac.pacCd, pacNm: pac.pacNm }
        }
        throw new Error(
            `không パック nào chứa slot ${KANRI_TRT_CD}-${KANRI_SB_NORMAL} mở được ở ` +
                `${total} dòng đầu của tab パック (pac_mst có: ` +
                `${pacsWithKanri.map((p) => `${p.pacCd}/${p.pacNm}`).join(', ')})`,
        )
    }

    /** `${trtCd}-${trtSb}` của từng dòng lưới dialog, theo đúng thứ tự hiển thị. */
    async function rowKeys(): Promise<string[]> {
        return dialogRows().evaluateAll((els) =>
            els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^row-/, '')),
        )
    }

    /** In cả danh sách ra log để đối chiếu tay với WinForm. */
    function dumpItems(label: string, cap: PickCapture) {
        const q = new URL(cap.url).searchParams
        console.log(
            `${label}: TrtDt=${q.get('TrtDt')} FirstVisitDt=${q.get('FirstVisitDt') ?? '(không gửi)'}`,
        )
        for (const it of cap.items) {
            console.log(
                `${label}|${it.trtCd}-${it.trtSb}|${it.trtNm}|点数=${it.score}|回数=${it.cnt}`,
            )
        }
    }

    /**
     * FE có thật sự báo 「tháng đang xem LÀ 初診月」 hay không, đọc từ query nó gửi.
     *
     * Hai testcase chính đều PHẢI ở nhánh `first-visit-month`: nhánh còn lại
     * (không phải 初診月) không kích hoạt phép thay nên xanh cả khi chưa vá.
     */
    function assertedBranch(cap: PickCapture, expectDt: string): string {
        const fv = new URL(cap.url).searchParams.get('FirstVisitDt')
        if (fv === null) return 'no-first-visit'
        return fv.slice(0, 7) === expectDt.slice(0, 7) ? 'first-visit-month' : 'other-month'
    }

    /** Thông báo chỉ đúng env cần đổi khi tiền đề 初診月 không dựng được. */
    function bugPreconditionHint(cap: PickCapture, expectDt: string): string {
        const fv = new URL(cap.url).searchParams.get('FirstVisitDt') ?? '(không gửi)'
        return (
            `chưa đo được tiền đề của bug: ${expectDt} KHÔNG phải 初診月 của bệnh nhân ` +
            `${PAT_NO} (FE gửi FirstVisitDt=${fv}). Chọn 診療日 nằm trong tháng bệnh nhân ` +
            'có 歯科初診料 (100-0) — xem doc-comment của TRT_DT_POST / TRT_DT_PRE.'
        )
    }

    /**
     * Suy kỳ vọng từ CHÍNH query FE đã gửi + bản master của ngày đó, rồi assert.
     *
     * Trả về mô tả nhánh đã đi để testcase log lại — ba nhánh của
     * `frm203014.getViewData:441-451` đều hợp lệ tuỳ dữ liệu, nên testcase không
     * được coi "không phải 初診月" là lỗi; nó chỉ là một nhánh khác và vẫn assert.
     */
    async function expectKanriBranch(cap: PickCapture, master: MstTrtRow[]): Promise<string> {
        const q = new URL(cap.url).searchParams
        const trtDtSent = q.get('TrtDt') ?? ''
        const firstVisitSent = q.get('FirstVisitDt')
        expect(trtDtSent, 'FE không gửi TrtDt — query đổi contract?').toMatch(/^\d{4}-\d{2}-\d{2}/)

        // So chuỗi ISO là đủ để so ngày (cùng định dạng, cùng độ dài).
        const inWindow = trtDtSent >= REV_R02_04 && trtDtSent < REV_R08_06
        const sameMonth =
            firstVisitSent !== null && firstVisitSent.slice(0, 7) === trtDtSent.slice(0, 7)
        const rewrite = sameMonth && inWindow

        const expectSb = rewrite ? KANRI_SB_FIRST_VISIT : KANRI_SB_NORMAL
        const otherSb = rewrite ? KANRI_SB_NORMAL : KANRI_SB_FIRST_VISIT
        const expectKey = `${KANRI_TRT_CD}-${expectSb}`
        const otherKey = `${KANRI_TRT_CD}-${otherSb}`
        const branch =
            `初診月=${sameMonth ? 'có' : 'không'} / trong khung 改定=${inWindow ? 'có' : 'không'}` +
            ` ⇒ ${rewrite ? `thay sang ${expectKey}` : `giữ ${expectKey}`}`

        const wire = cap.items.find(
            (it) => Number(it.trtCd) === KANRI_TRT_CD && Number(it.trtSb) === expectSb,
        )
        const keys = await rowKeys()
        const inMaster = master.find((m) => m.trtSb === expectSb)

        if (!inMaster) {
            // Mã kỳ vọng KHÔNG có trong bản master của ngày đó → WinForm cũng bỏ dòng
            // (getMstTrtDataPac trả 0 dòng). Đây chính là chỗ bug cũ rơi vào, nên vẫn
            // phải assert là KHÔNG có gì chứ đừng skip.
            console.log(
                `${expectKey} không tồn tại trong bản master của ${trtDtSent} → dialog phải KHÔNG có dòng 歯管`,
            )
            expect(keys).not.toContain(expectKey)
            expect(keys).not.toContain(otherKey)
            return branch
        }

        expect(
            wire,
            `response thiếu ${expectKey} (${branch}); có: ` +
                cap.items.map((i) => `${i.trtCd}-${i.trtSb}`).join(', '),
        ).toBeTruthy()
        expect(keys, `lưới dialog thiếu dòng ${expectKey} (${branch})`).toContain(expectKey)
        expect(keys, `lưới dialog không được có ${otherKey} (${branch})`).not.toContain(otherKey)

        // Tên phải khớp master của ĐÚNG bản đó — 「歯科疾患管理料」 vs
        // 「歯科疾患管理料(初診月)」 là cách duy nhất nhìn từ UI biết BE lấy đúng bản
        // master hay không. Cột nào (cct_nm / trt_nm) do tre_inp_flg quyết định.
        const shownNm = (await cellOf(expectKey, 'trtNm').innerText()).trim()
        expect(
            shownNm.normalize('NFKC'),
            `処置名称 của ${expectKey} lệch master (tre_inp_flg=${treInpFlg})`,
        ).toBe(expectedNm(inMaster).normalize('NFKC'))

        // 点数 trên lưới phải đúng bằng con số BE trả về; và phải > 0 (bản master
        // sai/thiếu sẽ ra 0). KHÔNG assert bằng score1: getTensu còn chọn
        // score2/score3 theo tuổi / 障害者区分 / 訪問診療.
        const shownPt = (await cellOf(expectKey, 'score').innerText()).trim()
        expect(shownPt, `点数 trên lưới lệch response của ${expectKey}`).toBe(String(wire!.score))
        expect(Number(wire!.score), `点数 của ${expectKey} không được bằng 0`).toBeGreaterThan(0)
        console.log(
            `${expectKey} ${shownNm}: 点数=${shownPt} (mst_trt.score1=${inMaster.score1}) — ${branch}`,
        )
        return branch
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        // Cắm handler TRƯỚC khi điều hướng: popup 算定 bung ngay lúc lưới nạp xong.
        disposeOverlays = await installOverlayHandlers(page, { santei: true, kartePicker: true })

        page.on('request', (r) => {
            if (r.url().includes('/tenant/pacs/treatments')) lastUrl = r.url()
        })
        // Bọc try/catch: response có thể bị huỷ giữa chừng khi test kết thúc sớm.
        page.on('response', (res) => {
            if (!res.url().includes('/tenant/pacs/treatments')) return
            void (async () => {
                try {
                    const json = (await res.json()) as { data?: PacTrtWire[] }
                    if (json.data) lastItems = json.data
                } catch {
                    /* không phải JSON / bị huỷ — assert bên dưới tự báo thiếu */
                }
            })()
        })

        picker = page.getByRole('dialog').filter({ hasText: 'パック番号' })
        noTrtAlert = page.getByText('算定可能な処置はありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        packRows = page.locator(
            'div[class*="grid-cols-[42px_1fr]"][class*="cursor-pointer"]',
        )

        treInpFlg = await findTreInpFlg()
        pacsWithKanri = await findPacsWithTrtSlot(KANRI_TRT_CD, KANRI_SB_NORMAL)
        for (const d of [TRT_DT_POST, TRT_DT_PRE]) {
            masterByDate.set(d, await findMstTrt(d, KANRI_TRT_CD))
        }
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-K1 — tiền đề: pac_mst có slot 116-7, và mst_trt của từng ngày có gì
    // ═════════════════════════════════════════════════════════════════════════
    test('TC-K1 — tiền đề: パック chứa slot 116-7 + 枝番 của mã 116 ở từng bản master', async () => {
        for (const p of pacsWithKanri) {
            console.log(`pac_mst: ${p.pacCd} 「${p.pacNm}」 slot ${p.slotIdx} = 116-7`)
        }
        // Tenant không có パック nào chứa 116-7 thì cả file vô nghĩa — skip CÓ LÝ DO
        // thay vì để hai testcase sau đỏ ở chỗ không liên quan.
        skipWithReason(
            pacsWithKanri.length === 0,
            `pac_mst của tenant không có パック nào chứa slot ${KANRI_TRT_CD}-${KANRI_SB_NORMAL} ` +
                '→ không dựng được tiền đề',
        )

        console.log(
            `tre_inp_flg=${treInpFlg} ⇒ cột 処置名称 lấy ${treInpFlg === 1 ? 'cct_nm' : 'trt_nm'}`,
        )
        for (const [d, rows] of masterByDate) {
            const has7 = rows.some((r) => r.trtSb === KANRI_SB_NORMAL)
            const has6 = rows.some((r) => r.trtSb === KANRI_SB_FIRST_VISIT)
            console.log(
                `mst_trt@${d}: ` +
                    rows
                        .map(
                            (r) =>
                                `${r.trtCd}-${r.trtSb} trt_nm=「${r.trtNm}」 cct_nm=「${r.cctNm}」 ${r.score1}点`,
                        )
                        .join(' / ') +
                    ` (có 116-7=${has7}, có 116-6=${has6})`,
            )
        }

        // 診療日 sau 改定 令和8年6月 PHẢI còn 116-7 — nếu bản master đó cũng bỏ luôn
        // 116-7 thì cặp so sánh của file này không còn ý nghĩa.
        const post = masterByDate.get(TRT_DT_POST) ?? []
        skipWithReason(
            TRT_DT_POST >= REV_R08_06 && !post.some((r) => r.trtSb === KANRI_SB_NORMAL),
            `bản master của ${TRT_DT_POST} không có ${KANRI_TRT_CD}-${KANRI_SB_NORMAL} → ` +
                'không đo được nhánh sau 改定',
        )
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-K2 — 診療日 SAU 改定 令和8年6月: KHÔNG được thay, 歯管 phải còn trong dialog
    //          (đây chính là bug đã tái hiện được)
    // ═════════════════════════════════════════════════════════════════════════
    test('TC-K2 — sau 改定 令和8年6月: 初診月 cũng KHÔNG thay 116-7 → dialog vẫn có 歯管', async () => {
        skipWithReason(
            pacsWithKanri.length === 0,
            'không có パック chứa slot 116-7 (xem TC-K1)',
        )
        await openTreatmentEntry(page, PAT_NO, TRT_DT_POST)

        const cap = await openPackWithKanri()
        dumpItems('POST', cap)

        const branch = await expectKanriBranch(cap, masterByDate.get(TRT_DT_POST) ?? [])
        // Sau 改定 thì dù có 初診月 cũng KHÔNG bao giờ được đi nhánh thay thế.
        expect(branch, 'sau 改定 令和8年6月 mà vẫn thay sang 116-6').toContain('giữ 116-7')
        // CHẶN XANH GIẢ: nhánh 「không phải 初診月」 xanh cả khi chưa vá, nên phải
        // khẳng định là đã đo ĐÚNG tiền đề của bug (初診月 + sau 改定).
        expect(assertedBranch(cap, TRT_DT_POST), bugPreconditionHint(cap, TRT_DT_POST)).toBe(
            'first-visit-month',
        )
        await dismissPicker()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-K3 — 診療日 TRONG khung 令和2年4月〜令和8年5月: 初診月 thì PHẢI thay sang 116-6
    // ═════════════════════════════════════════════════════════════════════════
    test('TC-K3 — trong khung 改定 2020/04〜2026/05: 初診月 thay 116-7 → 116-6 歯管(初診月)', async () => {
        skipWithReason(
            pacsWithKanri.length === 0,
            'không có パック chứa slot 116-7 (xem TC-K1)',
        )
        skipWithReason(
            !(TRT_DT_PRE >= REV_R02_04 && TRT_DT_PRE < REV_R08_06),
            `TEST_TRT_DT_PRE=${TRT_DT_PRE} nằm ngoài khung ${REV_R02_04}…${REV_R08_06} ` +
                '→ không đo được nhánh thay thế',
        )
        await openTreatmentEntry(page, PAT_NO, TRT_DT_PRE)

        const cap = await openPackWithKanri()
        dumpItems('PRE', cap)

        const branch = await expectKanriBranch(cap, masterByDate.get(TRT_DT_PRE) ?? [])
        expect(branch, 'trong khung 改定 + 初診月 mà KHÔNG thay sang 116-6').toContain(
            'thay sang 116-6',
        )
        expect(assertedBranch(cap, TRT_DT_PRE), bugPreconditionHint(cap, TRT_DT_PRE)).toBe(
            'first-visit-month',
        )
        await dismissPicker()
        await step()
    })
})
