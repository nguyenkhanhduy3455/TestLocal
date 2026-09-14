import { type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    findMstTrt,
    findPacsWithTrtSlot,
    findTreInpFlg,
    type MstTrtRow,
} from '../_shared/db'
import { patNo, trtDt, trtDtPre } from '../_shared/env'
import { openTreatmentEntry } from '../_shared/entry'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'
import { rows as gridRows } from '../_shared/virtual-grid'

/**
 * パック処置選択 (frm203014) — CỔNG 改定 của phép thay 歯管 trong 初診月.
 *
 * Bug thật: mở パック 「P　初診（精密）」 ở 診療年月 08年09月, WinForm in 135-3 パ電 /
 * 116-7 歯管 90点 / 108-2 歯清, web mất hẳn dòng 歯管 — BE thay slot 116-7 → 116-6 mà
 * không kiểm kỳ 改定, trong khi 116-6 đã bị bỏ khỏi mst_trt từ 令和8年6月.
 *
 * ─── FACT lấy từ WinForm (Rule 21) ───────────────────────────────────────────
 *  - frm203014.cs:441 — phép thay nằm TRONG `DateHelper.IsDateTimeBetween(
 *    new DateTime(2020,4,1), ComConst.MedicalFeeRevision_202606.AddDays(-1), targetDt)`.
 *  - frm203014.cs:443-451 — trong khung đó, slot (116,7) + 初診日 (ModSave.
 *    GetMedtreatStart_FirstVisit) cùng năm+tháng với 診療日 ⇒ `dis_sb = 6`.
 *    Không lấy được 初診日 (`syosinDt == ""`) ⇒ KHÔNG thay.
 *  - ComConst.cs:28 — `MedicalFeeRevision_202606 = 2026/06/01`.
 *  - frm203017.cs:731 (ガイド) có khối y hệt nhưng bản web CHƯA port
 *    (GuideTrtResolver.cs) ⇒ file này KHÔNG đo tab ガイド.
 *
 * ─── FACT lấy từ source web ──────────────────────────────────────────────────
 *  - `ListPacTrtsHandler` quyết định cờ thay slot; `PacTrtsQueries` áp nó bằng
 *    `CASE WHEN` TRƯỚC khi JOIN mst_trt. Gate: `MedicalFeeRevisions.R02_04 …
 *    R08_06`.
 *  - `treatment-entry-detail.tsx` (useMemo `firstVisitDt`) — FE tự suy 初診日 của
 *    tháng đang xem TỪ LƯỚI SỐNG (kể cả dòng 自動算定 chưa lưu) rồi gửi qua query
 *    `FirstVisitDt`. Không nhìn thấy trên UI ⇒ spec đọc query đó làm TIỀN ĐỀ.
 *  - `pac-trts-api.ts` — `GET /tenant/pacs/treatments`, trả `{ data: [...] }` với
 *    `trtCd/trtSb/trtNm/score/cnt/jihiFlg`; `FirstVisitDt` chỉ gửi khi có giá trị.
 *  - `pack-selection-dialog.tsx` + `cnt-cell.tsx` — mỗi dòng lưới có
 *    `data-testid="row-<trtCd>-<trtSb>"`, ô là `cell-trtCd/trtSb/trtNm/score/cnt`;
 *    header có nhãn 「パック番号」 + `pac_cd` trong `<span class*="font-mono">`.
 *  - `PacTrtResolver` — cột 処置名称 lấy `cct_nm` khi `tre_inp_flg == 1`, ngược lại
 *    `trt_nm` (frm203014.cs:538-541). Dev DB đang bật cờ ⇒ dialog in
 *    「歯科疾患管理料」 chứ không phải 「歯管」; spec đọc cờ qua `findTreInpFlg()`.
 *  - 116-7 không có dòng inp_chk_10 / inp_chk_4, và `unit = 2` (口腔) nên `chkSiga`
 *    cho qua kể cả khi dòng focus không có 部位 ⇒ dialog vẫn phải in 歯管 dù lưới
 *    của ngày đó trống. Nhờ vậy spec không cần seed 部位/病名.
 *
 * ─── Kỳ vọng được GHIM theo ngày, KHÔNG suy lại luật ────────────────────────
 * Mỗi testcase tự nói slot nào phải ra (`KANRI_SB_NORMAL` / `KANRI_SB_FIRST_VISIT`)
 * cho ngày mà nó ghim. Nếu spec tự tính lại biểu thức của `ListPacTrtsHandler` thì
 * cả hai phía đổi sai giống nhau vẫn xanh. `FirstVisitDt` trong query chỉ dùng để
 * KHẲNG ĐỊNH TIỀN ĐỀ (đúng là 初診月), không dùng làm input của kỳ vọng. Còn 点数 và
 * 処置名称 thì tra `mst_trt` của đúng ngày đó — hardcode 90点 là xanh giả ở tháng khác.
 *
 * ─── Cách chạy ───────────────────────────────────────────────────────────────
 *   TEST_DB=1 npx playwright test tests/side-panel/pack-kanri-first-visit-revision-gate.spec.ts
 * Chạy CẢ FILE (`describe.serial` + page dùng chung theo worker, Rule 19); một test
 * đỏ thì các test sau bị skip. Page không do fixture `page` sinh ra nên KHÔNG có
 * trace/video tự động. Spec chỉ SELECT, không ghi DB.
 *
 * Rule 23: hộp thoại này CHƯA có đủ 4 testcase bắt buộc. `pack-sidepanel-handler.spec.ts`
 * chỉ phủ 23.3 (thông báo 「算定可能な処置はありません。」); còn thiếu 23.1 (con trỏ lúc
 * mở), 23.2 (thanh cuộn dọc thừa), 23.4 (đóng-mở lại reset ô 回数) — nợ, không thuộc
 * phạm vi file này (file này chỉ đo NỘI DUNG danh sách theo kỳ 改定).
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
 * 患者番号 mặc định = 5 (Rule 18): bệnh nhân của lần tái hiện bug, và có
 * 歯科初診料 (100-0) THẬT ở cả hai tháng mà spec ghim bên dưới.
 */
const PAT_NO = patNo('5')

/**
 * 診療日 SAU 改定 令和8年6月 — mặc định 2026-07-01 (env `TEST_TRT_DT`).
 *
 * Rule 18: KHÔNG dùng hôm nay. Tiền đề của bug là 初診月 + sau 改定, mà 初診日 do FE
 * suy từ lưới; bệnh nhân 5 có 歯科初診料 vào 2026-07-01 nên chỉ tháng 2026-07 mới
 * dựng được nhánh đó. Lấy hôm nay (2026-09) thì FE gửi `FirstVisitDt=2026-07-01`
 * ⇒ khác tháng ⇒ test rơi về nhánh 「không phải 初診月」 và XANH cả khi chưa vá.
 */
const TRT_DT_POST = trtDt('2026-07-01')

/**
 * 診療日 TRONG khung thay thế — mặc định 2025-12-23 (env `TEST_TRT_DT_PRE`), ngày
 * bệnh nhân 5 có 歯科初診料 THẬT, nên tiền đề 初診月 dựng được mà không phải ghi gì.
 */
const TRT_DT_PRE = trtDtPre('2025-12-23')

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
    /** Query params của request — nguồn của `TrtDt` / `FirstVisitDt`. */
    query: URLSearchParams
    items: PacTrtWire[]
}

// Rule 18 — skip phải nói rõ lý do.
test.skip(
    !dbEnabled,
    'Cần TEST_DB=1: spec tra pac_mst (パック nào chứa slot 116-7) và mst_trt của ' +
        'bản master từng ngày để TỰ TÍNH 点数/名称 kỳ vọng thay vì hardcode 90点/803.',
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

    /** パック trong pac_mst có slot (116, 7) — tra một lần ở beforeAll. */
    let pacsWithKanri: Awaited<ReturnType<typeof findPacsWithTrtSlot>> = []
    /** 枝番 của mã 116 trong bản master của từng 診療日 đã ghim. */
    let masterPost: MstTrtRow[] = []
    let masterPre: MstTrtRow[] = []
    /** `inp_config.tre_inp_flg` — quyết định cột 処置名称 lấy `cct_nm` hay `trt_nm`. */
    let treInpFlg = 0

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
     *
     * Có nhánh gõ LẠI F10: カルテ記載選択 chen lên trên picker sẽ nuốt cú F10 đầu
     * (đã vấp ở tab パック — xem `pack-sidepanel-handler.spec.ts`). Chỉ gõ lại khi
     * picker VẪN còn, vì F10 của màn nền là 戻る ⇒ gõ nhầm là rời hẳn 診療入力.
     */
    async function dismissPicker() {
        if ((await picker.count()) === 0) return
        await page.keyboard.press('F10')
        const closed = await picker
            .waitFor({ state: 'hidden', timeout: 5000 })
            .then(() => true)
            .catch(() => false)
        if (!closed) {
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
            if ((await picker.count()) > 0) await page.keyboard.press('F10')
        }
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
     * Mở パック đầu tiên (trong `pacsWithKanri`) mà tab パック có hiện, rồi trả về
     * query + danh sách của nó.
     *
     * Chọn THEO TÊN chứ không theo chỉ số: cột 「No.」 là số thứ tự hiển thị
     * (frm203002.cs:2033), không phải `pac_cd`, nên chỉ số dòng không phải mốc ổn định.
     *
     * Response được arm bằng `waitForResponse` TRƯỚC cú click thay vì cắm
     * `page.on(...)`: `authedPage` sống suốt worker nên listener không gỡ sẽ parse
     * mọi response của các spec chạy sau (Rule 19.1).
     */
    async function openPackWithKanri(): Promise<PickCapture> {
        await enterPackTab()
        const names = await packRows.evaluateAll((els) =>
            els.map((e) => ((e.children[1] as HTMLElement | undefined)?.innerText ?? '').trim()),
        )
        for (const pac of pacsWithKanri) {
            const idx = names.findIndex(
                (n) => n.normalize('NFKC') === pac.pacNm.normalize('NFKC'),
            )
            if (idx < 0) continue

            // .catch(null): nhánh 'empty' continue mà không await promise này.
            const resP = page
                .waitForResponse((r) => r.url().includes('/tenant/pacs/treatments'), {
                    timeout: 30000,
                })
                .catch(() => null)
            await packRows.nth(idx).click()
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            // Cụm header 「パック番号」 phải đúng パック vừa click — chốt lại là đã mở
            // đúng thứ mình tra từ DB, không phải một パック trùng tên.
            const shown = Number(
                (await picker.locator('span[class*="font-mono"]').first().innerText()).trim(),
            )
            expect(shown, `dialog mở sai パック (click 「${pac.pacNm}」)`).toBe(pac.pacCd)

            const res = await resP
            expect(res, 'không bắt được response GET /tenant/pacs/treatments').toBeTruthy()
            const json = (await res!.json()) as { data?: PacTrtWire[] }
            return { query: new URL(res!.request().url()).searchParams, items: json.data ?? [] }
        }
        throw new Error(
            `không パック nào chứa slot ${KANRI_TRT_CD}-${KANRI_SB_NORMAL} mở được trong ` +
                `${names.length} dòng của tab パック (pac_mst có: ` +
                `${pacsWithKanri.map((p) => `${p.pacCd}/${p.pacNm}`).join(', ')})`,
        )
    }

    /** In cả danh sách ra log để đối chiếu tay với WinForm. */
    function dumpItems(label: string, cap: PickCapture) {
        console.log(
            `${label}: TrtDt=${cap.query.get('TrtDt')} ` +
                `FirstVisitDt=${cap.query.get('FirstVisitDt') ?? '(không gửi)'}`,
        )
        for (const it of cap.items) {
            console.log(
                `${label}|${it.trtCd}-${it.trtSb}|${it.trtNm}|点数=${it.score}|回数=${it.cnt}`,
            )
        }
    }

    /**
     * TIỀN ĐỀ: FE có báo 「tháng đang xem LÀ 初診月」 hay không (đọc từ query nó gửi).
     *
     * Cả hai testcase đều PHẢI ở nhánh 初診月; nhánh còn lại không kích hoạt phép
     * thay nên xanh cả khi chưa vá.
     */
    function isFirstVisitMonth(cap: PickCapture): boolean {
        const fv = cap.query.get('FirstVisitDt')
        return fv !== null && fv.slice(0, 7) === (cap.query.get('TrtDt') ?? '').slice(0, 7)
    }

    /** Thông báo chỉ đúng env cần đổi khi tiền đề 初診月 không dựng được. */
    function firstVisitMonthHint(cap: PickCapture): string {
        return (
            `chưa đo được tiền đề của bug: ${cap.query.get('TrtDt')} KHÔNG phải 初診月 của ` +
            `bệnh nhân ${PAT_NO} (FE gửi FirstVisitDt=` +
            `${cap.query.get('FirstVisitDt') ?? '(không gửi)'}). Chọn 診療日 nằm trong tháng ` +
            'bệnh nhân có 歯科初診料 (100-0) — xem doc-comment của TRT_DT_POST / TRT_DT_PRE.'
        )
    }

    /**
     * Dialog phải in ĐÚNG slot 116-`expectSb` và KHÔNG có slot còn lại. 点数 và
     * 処置名称 đối chiếu `mst_trt` của chính ngày đó (không hardcode).
     *
     * `expectSb` do TESTCASE truyền vào theo ngày nó ghim — cố ý không suy lại từ
     * `FirstVisitDt`, xem doc đầu file.
     */
    async function expectKanriSlot(cap: PickCapture, master: MstTrtRow[], expectSb: number) {
        const otherSb = expectSb === KANRI_SB_NORMAL ? KANRI_SB_FIRST_VISIT : KANRI_SB_NORMAL
        const expectKey = `${KANRI_TRT_CD}-${expectSb}`
        const otherKey = `${KANRI_TRT_CD}-${otherSb}`
        const keys = await gridRows(picker).evaluateAll((els) =>
            els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^row-/, '')),
        )
        const inMaster = master.find((m) => m.trtSb === expectSb)

        if (!inMaster) {
            // Mã kỳ vọng KHÔNG có trong bản master của ngày đó → WinForm cũng bỏ dòng
            // (getMstTrtDataPac trả 0 dòng). Đây chính là chỗ bug cũ rơi vào, nên vẫn
            // phải assert là KHÔNG có gì chứ đừng skip.
            console.log(`${expectKey} không có trong bản master → dialog phải KHÔNG có dòng 歯管`)
            expect(keys).not.toContain(expectKey)
            expect(keys).not.toContain(otherKey)
            return
        }

        const wire = cap.items.find(
            (it) => Number(it.trtCd) === KANRI_TRT_CD && Number(it.trtSb) === expectSb,
        )
        expect(
            wire,
            `response thiếu ${expectKey}; có: ` +
                cap.items.map((i) => `${i.trtCd}-${i.trtSb}`).join(', '),
        ).toBeTruthy()
        expect(keys, `lưới dialog thiếu dòng ${expectKey}`).toContain(expectKey)
        expect(keys, `lưới dialog không được có ${otherKey}`).not.toContain(otherKey)

        // Tên phải khớp master của ĐÚNG bản đó — 「歯科疾患管理料」 vs
        // 「歯科疾患管理料(初診月)」 là cách duy nhất nhìn từ UI biết BE lấy đúng bản
        // master hay không. Cột nào (cct_nm / trt_nm) do tre_inp_flg quyết định.
        const shownNm = (await cellOf(expectKey, 'trtNm').innerText()).trim()
        expect(
            shownNm.normalize('NFKC'),
            `処置名称 của ${expectKey} lệch master (tre_inp_flg=${treInpFlg})`,
        ).toBe((treInpFlg === 1 ? inMaster.cctNm : inMaster.trtNm).normalize('NFKC'))

        // 点数 trên lưới phải đúng bằng con số BE trả về, và phải > 0 (bản master
        // sai/thiếu sẽ ra 0). KHÔNG assert bằng score1: getTensu còn chọn
        // score2/score3 theo tuổi / 障害者区分 / 訪問診療.
        const shownPt = (await cellOf(expectKey, 'score').innerText()).trim()
        expect(shownPt, `点数 trên lưới lệch response của ${expectKey}`).toBe(String(wire!.score))
        expect(Number(wire!.score), `点数 của ${expectKey} không được bằng 0`).toBeGreaterThan(0)
        console.log(
            `${expectKey} ${shownNm}: 点数=${shownPt} (mst_trt.score1=${inMaster.score1})`,
        )
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        // Cắm handler TRƯỚC khi điều hướng: popup 算定 bung ngay lúc lưới nạp xong.
        disposeOverlays = await installOverlayHandlers(page, { santei: true, kartePicker: true })

        picker = page.getByRole('dialog').filter({ hasText: 'パック番号' })
        noTrtAlert = page.getByText('算定可能な処置はありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        packRows = page.locator('div[class*="grid-cols-[42px_1fr]"][class*="cursor-pointer"]')

        treInpFlg = await findTreInpFlg()
        pacsWithKanri = await findPacsWithTrtSlot(KANRI_TRT_CD, KANRI_SB_NORMAL)
        masterPost = await findMstTrt(TRT_DT_POST, KANRI_TRT_CD)
        masterPre = await findMstTrt(TRT_DT_PRE, KANRI_TRT_CD)

        // Tiền đề, in ra để đối chiếu tay với WinForm khi một testcase đỏ.
        for (const p of pacsWithKanri) {
            console.log(`pac_mst: ${p.pacCd} 「${p.pacNm}」 slot ${p.slotIdx} = 116-7`)
        }
        console.log(
            `tre_inp_flg=${treInpFlg} ⇒ cột 処置名称 lấy ${treInpFlg === 1 ? 'cct_nm' : 'trt_nm'}`,
        )
        for (const [d, rows] of [
            [TRT_DT_POST, masterPost],
            [TRT_DT_PRE, masterPre],
        ] as const) {
            console.log(
                `mst_trt@${d}: ` +
                    rows
                        .map((r) => `${r.trtCd}-${r.trtSb} 「${r.trtNm}」/「${r.cctNm}」 ${r.score1}点`)
                        .join(' / '),
            )
        }

        // Rule 19.1: luôn mở lại màn hình trong beforeAll — page dùng chung theo
        // worker nên state của spec chạy trước còn nguyên trên đó.
        await openTreatmentEntry(page, PAT_NO, TRT_DT_POST)
    })

    test.beforeEach(() => {
        skipWithReason(
            pacsWithKanri.length === 0,
            `pac_mst của tenant không có パック nào chứa slot ${KANRI_TRT_CD}-` +
                `${KANRI_SB_NORMAL} → không dựng được tiền đề`,
        )
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-K1 — 診療日 SAU 改定 令和8年6月: KHÔNG được thay, 歯管 phải còn trong dialog
    //         (đây chính là bug đã tái hiện được)
    // ═════════════════════════════════════════════════════════════════════════
    test('TC-K1 — sau 改定 令和8年6月: 初診月 cũng KHÔNG thay 116-7 → dialog vẫn có 歯管', async () => {
        skipWithReason(
            TRT_DT_POST < REV_R08_06,
            `TEST_TRT_DT=${TRT_DT_POST} nằm TRƯỚC ${REV_R08_06} → không đo được nhánh sau 改定`,
        )
        const cap = await openPackWithKanri()
        dumpItems('POST', cap)

        expect(isFirstVisitMonth(cap), firstVisitMonthHint(cap)).toBe(true)
        await expectKanriSlot(cap, masterPost, KANRI_SB_NORMAL)

        await dismissPicker()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-K2 — 診療日 TRONG khung 令和2年4月〜令和8年5月: 初診月 thì PHẢI thay sang 116-6
    // ═════════════════════════════════════════════════════════════════════════
    test('TC-K2 — trong khung 改定 2020/04〜2026/05: 初診月 thay 116-7 → 116-6 歯管(初診月)', async () => {
        skipWithReason(
            !(TRT_DT_PRE >= REV_R02_04 && TRT_DT_PRE < REV_R08_06),
            `TEST_TRT_DT_PRE=${TRT_DT_PRE} nằm ngoài khung ${REV_R02_04}…${REV_R08_06} ` +
                '→ không đo được nhánh thay thế',
        )
        await openTreatmentEntry(page, PAT_NO, TRT_DT_PRE)

        const cap = await openPackWithKanri()
        dumpItems('PRE', cap)

        expect(isFirstVisitMonth(cap), firstVisitMonthHint(cap)).toBe(true)
        await expectKanriSlot(cap, masterPre, KANRI_SB_FIRST_VISIT)

        await dismissPicker()
        await step()
    })
})
