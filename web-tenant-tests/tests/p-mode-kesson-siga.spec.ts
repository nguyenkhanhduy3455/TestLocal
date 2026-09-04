import { expect, test, type Page, type Request } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteSigaRow,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    ensureSigaRow,
    readSiga,
    restoreSiga,
    seedTreatmentRows,
    writeSigaTeeth,
    type SigaSnapshot,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 — Ｐ変更 đánh dấu 欠損歯 (WinForm `Chk_PModeKesson`).
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⛔ ĐỌC TRƯỚC: SPEC NÀY KHOÁ MỘT HÀNH VI PHÁ DỮ LIỆU, VÀ NÓ ĐƯỢC PORT CÓ CHỦ Ý
 * ═════════════════════════════════════════════════════════════════════════════
 * `Chk_PModeKesson` KHÔNG đánh dấu 「những răng bị bỏ khỏi Ｐ」. Nó đánh dấu
 * **PHẦN BÙ** của tập Ｐ mới: MỌI ô 部位 mang giá trị 0 (trừ 4 răng khôn) đều bị ghi
 * `se = 4` (欠損歯) — kể cả răng lành chưa bao giờ dính tới Ｐ.
 *
 *   Bệnh nhân 歯周炎 ở 4 răng → bấm Ｐ変更 → はい ⇒ **28 răng còn lại thành "răng mất"**.
 *   Không hỏi lại, không log: `catch { trn.Rollback(); }` (frm203002.cs:7489).
 *
 * Đây là bug CỦA WINFORM, được port nguyên theo quyết định 2026-08-25 (「port nguyên
 * hành vi WinForm, note rõ rủi ro, KHÔNG tự ý cải tiến」). Hồ sơ báo khách:
 * `userapp/inp-p0-open-issues.md` **ISSUE-14** (có 3 phương án A/B/C).
 *
 * ⛔ TC-3 XANH nghĩa là bản port ĐÚNG. Nếu một ngày khách chốt phương án B (chỉ đánh
 *    dấu răng bị bỏ khỏi Ｐ) thì TC-3 PHẢI được viết lại — đừng "sửa" nó trước khi có
 *    quyết định, và đừng đọc nó như một lời khen dành cho hành vi này.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (src/OCHACOM)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · frm203002.cs:6368 `cmdByokenP_Click` — nút Ｐ変更: `MonthP()` gom 部位 của MỌI
 *    部位病名行 trong tháng có 病名 đầu = Ｐ(103), nếu không có thì Ｇ(104), thành MỘT
 *    tập; rồi chạy đúng luồng sửa 部位/病名 ở chế độ P-mode.
 *  · frm203002.cs:7237-7250 `ChkBuiDisChg` — sau khi người dùng sửa xong, hỏi Q00100
 *    「変更を適用しますか？」. Trả lời はい ⇒ chạy `ChgBuiDis()` → `ChgBuiForP(con)` →
 *    **`Chk_PModeKesson(con)`**, ĐÚNG THỨ TỰ ĐÓ. Trả lời いいえ ⇒ `BY_Undo()`.
 *  · frm203002.cs:7446-7495 `Chk_PModeKesson`:
 *        updFlg = false
 *        for i in 0..31:
 *            pSiga_old[i+1] = siga[i+1]                        // ← xem "CHƯA PORT"
 *            if grdByou[i+3] == "0" && siga[i+1] != 4:
 *                if i ∉ {0,15,16,31}: updFlg = true; break
 *        if updFlg:
 *            for i in 0..31:
 *                if i ∉ {0,15,16,31} && grdByou[i+3] == "0": siga[i+1] = 4
 *            update Siga …  (transaction RIÊNG, commit ngay)
 *    Ba chi tiết trông như sơ suất nhưng là CÓ THẬT, phải giữ:
 *      a) 4 răng khôn (ô 0/15/16/31) bị bỏ qua ở CẢ HAI vòng (:7460 và :7472);
 *      b) 乳歯 KHÔNG bao giờ bị đụng — `setSigaData`/`getSigaData` của frm203002 chỉ
 *         map `1..32 → se1..se32`, không có nhánh `sn` nào (:7495-7570);
 *      c) so sánh với CHUỖI `"0"`, nên KHÔNG bóc mốc 100 và KHÔNG tách 永久歯/乳歯:
 *         ô mang `111` hay mã răng sữa `12` chỉ là "khác 0" và được để yên.
 *  · So sánh nội bộ WinForm: hàm 欠損 KIA — `ModMain.ChkKesson` (modMain.cs:2842) —
 *    CÓ hộp thoại xác nhận (frm203034 欠損指定) và CÓ cổng option `pInpOpt[27]`.
 *    `Chk_PModeKesson` không có gì cả. Đó là lý do tin rằng đây là bug chứ không
 *    phải thiết kế.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN PORT (nhánh fix/inp-siga-delextrec-pmode-kesson, 2026-09-03)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · FE `treatment-entry-detail.tsx` — nhánh `if (ctx.pMode)` của `commitByokenChange`:
 *    `applyPModeSubtraction` (= ChgBuiForP) rồi `POST /tenant/siga/p-mode-missing`.
 *  · BE `MarkPModeMissingTeethHandler` → `PModeMissingToothCalculator.Apply`.
 *  · Lỗi ghi bị NUỐT im lặng ở FE (không toast) — parity với `catch { Rollback(); }`.
 *  · Endpoint này CỐ Ý không bật `pSiga_chg`, nên 「いいえ」 lúc thoát KHÔNG hoàn tác
 *    (TC-6). Cùng cơ chế với `DelExtRec` — xem ISSUE-15.
 *
 * ── CHƯA PORT (đừng tưởng là thiếu sót của spec) ─────────────────────────────
 *  Vòng lặp dò `updFlg` của WinForm VỪA dò VỪA chụp lại `pSiga_old`, và có `break`
 *  giữa chừng (:7457-7464) ⇒ `pSiga_old` chỉ được làm mới TỚI ĐÚNG chỉ số vừa break.
 *  Nếu sau đó F9 chạy `Restore_Siga` thì được một hàng siga LAI (nửa đầu theo trạng
 *  thái lúc bấm Ｐ変更, nửa sau theo lúc mở màn). Bản port chưa tái hiện; đang chờ
 *  quyết định (inp-c1-c2-c7-plan.md §KQ, mục "Còn lại"). Spec này vì thế KHÔNG bấm F9.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU TỰ DỰNG (CÓ GHI DB — cần TEST_DB=1 và TEST_ALLOW_SAVE=1)
 * ═════════════════════════════════════════════════════════════════════════════
 * `beforeAll`:
 *   1. chụp nguyên trạng `siga` (trả lại ở afterAll, có in ra stdout để cứu tay);
 *   2. ép TOÀN BỘ `se_1..se_32` về 生活歯 = 0 → mọi ô thành 4 sau đó đều là do
 *      chính testcase gây ra, không lẫn dữ liệu cũ;
 *   3. seed MỘT 部位病名行 mang 病名 Ｐ(103) + 部位 đúng MỘT răng (ô 10 = 左上3), để
 *      `aggregatePGTeeth` gom được và nút Ｐ変更 có việc để làm.
 *
 * ⚠️ Spec KHÔNG bấm F9 nên KHÔNG ghi `trn_trn`, nhưng vẫn cần TEST_ALLOW_SAVE=1:
 *    `Chk_PModeKesson` tự nó là một lệnh GHI DB THẬT vào bảng `siga` (Rule 18.1).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY CẦN BIẾT
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. Kỳ vọng của TC-3/4/5 được suy RA TỪ CHÍNH BODY của request
 *     `POST /tenant/siga/p-mode-missing` (bắt bằng `page.on('request')`), KHÔNG
 *     hard-code theo phím F nào được bấm. Các phím F2..F7 của 部位選択 phụ thuộc
 *     `activeRow` (hàm nội bộ của dialog) nên hard-code là giòn; đọc body thì đúng
 *     dù dialog chọn ra tập nào.
 *  2. Vẫn phải giữ ÍT NHẤT một răng trong tập Ｐ mới thì mới phân biệt được
 *     「phần bù」 với 「toàn bộ hàm」. Vì thế TC-2 bấm F11 全消去 rồi F3 3≁3 (nhóm răng
 *     cửa) — không phải chỉ 全消去.
 *  3. Q00100 chỉ bung khi 部位 hoặc 病名 THỰC SỰ đổi so với ảnh chụp
 *     (`commitByokenChange` guard `dsp === ctx.oldPart && dspDis === ctx.oldName`).
 *     Không đổi gì mà bấm 確定 thì không có gì xảy ra và TC đỏ oan.
 *  4. 確定 của CẢ HAI dialog 部位選択 / 病名選択 là phím **End** (F9 của 部位選択 là
 *     「Br例」, không phải 確定).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19) — LUÔN chạy CẢ FILE, không bao giờ `-g` một testcase lẻ
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p-mode-kesson-siga.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p-mode-kesson-siga.spec.ts --headed
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân test — spec GHI bảng `siga` của họ, đừng trỏ vào dữ liệu thật. */
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

/** Ngày test = HÔM NAY: chỉ dòng của tháng đang mở mới thao tác tay được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** GUIDELINE Rule 18.1 — mọi thao tác ghi DB phải nằm sau cờ env. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/** 歯周炎 (Ｐ) — `PERIODONTITIS_DIS_CD`, cũng là mã WinForm MonthP ưu tiên. */
const P_DIS_CD = 103
/**
 * `dsp_dis` của dòng seed — CŨNG là thứ dùng để locate dòng trên lưới.
 *
 * Hai bẫy đã vấp khi chọn cách locate, đừng lặp lại:
 *  · KHÔNG locate bằng `dsp_trt`: dòng seed là 病名-only (trt_cd 0 / 点 0 / 回 0) và
 *    mapper CỐ Ý không sinh dòng 療法・処置 cho loại đó (treatment-table-mapper.ts —
 *    `isDiseaseOnlyRow`) ⇒ `dsp_trt` KHÔNG BAO GIỜ hiện lên lưới.
 *  · KHÔNG locate bằng `dsp_bui`: ô 部位 của lưới KHÔNG in `dsp_bui` mà in chuỗi app
 *    tự dựng lại từ vector `bui` (dạng 「3   (1)」).
 * Chỗ DUY NHẤT chuỗi seed hiện ra nguyên vẹn là ô 療法・処置 của 部位病名行, và mapper
 * đổ `dsp_dis` vào đó (treatment-table-mapper.ts — 「dsp_dis is the disease
 * abbreviation … col 2 of the bui grid row」).
 */
const SEED_DIS_TEXT = 'ＰＭ検証Ｐ'
/** `dsp_trt` của dòng seed — chỉ để dọn dữ liệu, không hiện trên lưới. */
const SEED_NM = 'Ｐ変更テスト行'

/**
 * 部位 của dòng Ｐ seed: ĐÚNG một răng, ô 10 (0-based) = 左上3 → cột `se_11`.
 * Cố ý chỉ một răng: 31 ô còn lại vì thế CHƯA BAO GIỜ nằm trong Ｐ, nên bất kỳ ô nào
 * trong số đó bị đánh 欠損 đều là bằng chứng trực tiếp của luật "phần bù" (ISSUE-14).
 */
const P_BUI_SLOT = 10
const P_BUI_VAL = 1

/** 4 ô 智歯 WinForm luôn bỏ qua (frm203002.cs:7460/:7472) — 0-based. */
const WISDOM_SLOTS = [0, 15, 16, 31] as const

// ─── Miền giá trị 自歯状況 (CommonChk.cs:497-580) ─────────────────────────────
/** 永久歯 生活歯 — cũng là DEFAULT của cột `se_*`. */
const SE_VITAL = 0
/** 永久歯 欠損歯 — giá trị Chk_PModeKesson ghi. */
const SE_MISSING = 4

/** Endpoint `Chk_PModeKesson` (`TenantSigaEndpoints.cs`). */
const P_MODE_PATH = '/tenant/siga/p-mode-missing'

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|N` của data-grid-cell). */
    key: string
    /** Ô 部位 (RegiCol.bui = 1). */
    bui: string
    /** Ô 療法・処置 (RegiCol.ryo = 2) — với 部位病名行 thì đây là `dsp_dis`. */
    ryo: string
}

/**
 * Mọi dòng lưới, GOM THEO rowKey.
 *
 * BẪY ĐÃ VẤP: đọc `|1` và `|2` thành HAI danh sách rồi zip theo chỉ số là SAI —
 * không phải dòng nào cũng render đủ cả hai ô, nên hai danh sách lệch nhau và
 * 部位 của dòng này bị ghép với 療法 của dòng khác.
 */
async function gridRows(page: Page): Promise<GridRow[]> {
    const raw = await page.locator('[data-grid-cell]').evaluateAll((els) => {
        const byKey = new Map<string, { bui: string; ryo: string }>()
        for (const e of els) {
            const attr = e.getAttribute('data-grid-cell') ?? ''
            const i = attr.lastIndexOf('|')
            if (i < 0) continue
            const key = attr.slice(0, i)
            const col = attr.slice(i + 1)
            if (col !== '1' && col !== '2') continue
            const cur = byKey.get(key) ?? { bui: '', ryo: '' }
            if (col === '1') cur.bui = e.textContent ?? ''
            else cur.ryo = e.textContent ?? ''
            byKey.set(key, cur)
        }
        return [...byKey].map(([key, v]) => ({ key, ...v }))
    })
    return raw.map((r) => ({ key: r.key, bui: txt(r.bui), ryo: txt(r.ryo) }))
}

// GUIDELINE Rule 18 — "Skip phải có log rõ ràng".
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (để seed dòng Ｐ + đọc/khôi phục bảng siga)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (Chk_PModeKesson GHI thẳng bảng siga)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  p-mode-kesson-siga.spec.ts BỎ QUA TOÀN BỘ 6 testcase — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p-mode-kesson-siga.spec.ts\n' +
            '   (spec KHÔNG bấm F9 nên không đụng trn_trn, nhưng CÓ ghi bảng siga)\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed dòng Ｐ + đọc/khôi phục bảng siga')
test.skip(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: Chk_PModeKesson ghi thẳng bảng siga')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — Ｐ変更 → 欠損自動マーキング (Chk_PModeKesson / siga)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Nguyên trạng `siga` trước khi test đụng vào — trả lại ở afterAll. */
    let sigaBefore: SigaSnapshot | null = null
    /** true khi dòng siga do CHÍNH test tạo ⇒ afterAll xoá hẳn thay vì restore. */
    let sigaRowCreated = false

    /** 部位 32 ô mà FE thực sự gửi lên trong request Chk_PModeKesson. */
    let sentBui: number[] | null = null
    /** Số lần endpoint được gọi — Ｐ変更 chỉ được bắn ĐÚNG một lần cho một lượt はい. */
    let pModeCalls = 0

    const seOf = (snap: SigaSnapshot, col: number) => snap.se[col - 1]

    async function mustReadSiga(): Promise<SigaSnapshot> {
        const s = await readSiga(Number(PAT_NO))
        expect(s, `bệnh nhân ${PAT_NO} không còn dòng siga nào để đọc`).not.toBeNull()
        return s!
    }

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    ryoCells(page).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới — nạp lại`,
                )
            }
        }
        throw lastErr
    }

    test.beforeAll(async ({ browser }) => {
        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
        console.log(
            `siga trước test: se = [${sigaBefore?.se.join(',') ?? '?'}]` +
                (sigaRowCreated ? ' (dòng siga do test vừa tạo)' : ''),
        )
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        if (realRows > 0) {
            console.log(
                `ℹ️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT. Spec này KHÔNG bấm F9 nên ` +
                    'không ghi lại chúng, nhưng nếu trong đó có 部位病名行 mang Ｐ/Ｇ thì tập Ｐ gom ' +
                    'được sẽ rộng hơn dòng seed — đọc log 「bui FE gửi lên」 của TC-3 trước khi kết luận.',
            )
        }

        // Trạng thái xuất phát: TOÀN BỘ 永久歯 đều 生活歯 ⇒ mọi ô = 4 sau này đều do
        // chính testcase gây ra.
        const allVital: Record<number, number> = {}
        for (let col = 1; col <= 32; col++) allVital[col] = SE_VITAL
        await writeSigaTeeth(Number(PAT_NO), { se: allVital })

        // 部位病名行 Ｐ: trt_cd 0 + 部位 + 病名 — đúng hình dạng mapper cần để dựng
        // `diseases[0].disCd = 103` (treatment-grid-rows.decodeDiseases).
        const pBui = Array.from({ length: 32 }, (_, i) => (i === P_BUI_SLOT ? P_BUI_VAL : 0))
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: SEED_NM,
                bui: pBui,
                dspBui: '左上3',
                disCd: [P_DIS_CD],
                disSb: [0],
                dspDis: SEED_DIS_TEXT,
            },
        ])

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // BẪY 1 — kỳ vọng suy ra từ chính request, nên phải bắt body của nó.
        page.on('request', (req: Request) => {
            if (!req.url().includes(P_MODE_PATH) || req.method() !== 'POST') return
            pModeCalls++
            try {
                const body = req.postDataJSON() as { bui?: (number | string)[] }
                sentBui = (body.bui ?? []).map(Number)
            } catch {
                sentBui = null
            }
        })

        // AutoSantei bung 「…を算定しますか？」 vào thời điểm không đoán được và nuốt
        // mọi click (Rule 14). Bấm No — Yes lại kéo theo カルテ記載選択.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page
                    .getByRole('button', { name: /^(No|いいえ)$/ })
                    .first()
                    .click()
            },
            { times: 30 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await page?.close()
        const n =
            (await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)) +
            (await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, 0, [SEED_NM]).catch(
                () => 0,
            )) +
            (await deleteTreatmentRowsByBui(
                Number(PAT_NO),
                TRT_DT,
                P_BUI_SLOT + 1,
                P_BUI_VAL,
            ).catch(() => 0))
        if (sigaRowCreated) {
            const k = await deleteSigaRow(Number(PAT_NO)).catch(() => 0)
            console.log(`dọn: xoá ${n} dòng seed, xoá ${k} dòng siga do test tạo`)
        } else if (sigaBefore) {
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
            console.log(`dọn: xoá ${n} dòng seed, trả siga về nguyên trạng`)
        }
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Mốc: không gom được tập Ｐ thì Ｐ変更 chỉ bung 「当月にＰ／Ｇの病名がありません。」
    // và mọi assert parity phía sau vô nghĩa.
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-1 (mốc) — 部位病名行 Ｐ đã seed hiện trên lưới tháng hiện hành', async () => {
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})

        const rows = await gridRows(page)
        console.log(
            `lưới: ${rows.length} dòng mount, 10 dòng CUỐI (部位 | 療法): ` +
                rows
                    .map((r) => `${r.bui || '·'} | ${r.ryo}`)
                    .slice(-10)
                    .join('  /  '),
        )
        const seeded = rows.find((r) => r.ryo === txt(SEED_DIS_TEXT))
        expect(
            seeded,
            `không thấy 部位病名行 có 病名 「${SEED_DIS_TEXT}」 ở ô 療法 — seed hỏng hoặc màn hình ` +
                `đang mở tháng khác (TEST_TRT_DT = ${TRT_DT}).`,
        ).toBeDefined()
        // Ô 部位 phải có nội dung: mapper chỉ dựng 部位病名行 khi bui khác 0, và chính
        // điều kiện đó mới làm `isBuiLineRow` (→ aggregatePGTeeth) nhận ra dòng này.
        expect(
            seeded!.bui,
            'ô 部位 rỗng ⇒ mapper không dựng được 部位病名行 ⇒ Ｐ変更 sẽ không gom được gì',
        ).not.toBe('')
        console.log(`dòng seed: 部位 「${seeded!.bui}」 | 病名 「${seeded!.ryo}」`)
        await step()
    })

    test('TC-2 (mốc) — Ｐ変更 mở 部位選択, sửa tập Ｐ rồi 確定 qua 病名選択', async () => {
        await closeDialogs(page)

        // Panel bên phải: chuyển sang tab 病検 rồi bấm Ｐ変更 (frm203002 cmdByokenP_Click).
        await page
            .getByRole('button', { name: '病検', exact: true })
            .click()
            .catch(() => {})
        await page.getByRole('button', { name: 'Ｐ変更', exact: true }).click()

        // Không gom được Ｐ/Ｇ nào thì app bung alert thay vì mở dialog — bắt sớm để
        // báo đúng nguyên nhân thay vì để timeout ở dòng dưới.
        const noPG = page.getByText('当月にＰ／Ｇの病名がありません。')
        if (await noPG.count()) {
            expect(
                false,
                'Ｐ変更 báo 「当月にＰ／Ｇの病名がありません。」 ⇒ aggregatePGTeeth không gom được dòng ' +
                    `seed. Kiểm tra dis_cd_1 = ${P_DIS_CD} và bui của dòng có 病名 「${SEED_DIS_TEXT}」 ` +
                    '(mapper chỉ coi là 部位病名行 khi có 部位 khác 0 và dsp_dis khác rỗng).',
            ).toBe(true)
        }

        const toothTitle = page.getByText(/部\s*位\s*選\s*択/)
        await expect(
            toothTitle.first(),
            'bấm Ｐ変更 mà 部位選択 không mở — kiểm tra nút / tab 病検',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        // Tập Ｐ CŨ mà 部位選択 được seed = `agg.union` của MonthP. Đếm ô đang sáng để
        // chắc chắn nó đúng bằng dòng seed — nếu tháng test có sẵn 部位病名行 Ｐ/Ｇ thật
        // thì tập này rộng hơn và vế 「răng chưa bao giờ trong Ｐ」 của TC-3 mất nghĩa.
        const toothDialog = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ })
        const activeBefore = await toothDialog.locator('button[title^="Type:"]').count()
        console.log(`部位選択 mở ra với ${activeBefore} răng đang sáng (= tập Ｐ cũ)`)
        expect(
            activeBefore,
            'Tập Ｐ mà MonthP gom được phải đúng 1 răng (dòng seed). Nhiều hơn ⇒ tháng test có ' +
                '部位病名行 Ｐ/Ｇ THẬT; chọn TEST_PAT_NO/TEST_TRT_DT vào tháng trống rồi chạy lại, ' +
                'nếu không vế 「răng chưa bao giờ nằm trong Ｐ」 của TC-3 không còn chứng minh được gì.',
        ).toBe(1)
        await step()

        // BẪY 2/3: phải đổi tập Ｐ thì Q00100 mới bung. F11 全消去 rồi F3 3≁3 để tập
        // MỚI vẫn còn răng — nhờ vậy TC-3 phân biệt được "phần bù" với "cả hàm".
        await page.keyboard.press('F11')
        await page.keyboard.press('F3')
        await step()

        // BẪY 4: 確定 của 部位選択 là End (F9 = 「Br例」).
        await page.keyboard.press('End')

        const disTitle = page.getByText(/病\s*名\s*選\s*択/)
        await expect(
            disTitle.first(),
            '部位選択 確定 xong phải mở 病名選択 (handleToothConfirm → setDiseaseDialogOpen)',
        ).toBeVisible({ timeout: 30_000 })
        await step()

        // 病名選択 mở sẵn với 病名 cũ (ctx.diseases). End = 登録.
        await page.keyboard.press('End')
        await step()
    })

    test('TC-3 — Q00100 → はい: 欠損 được ghi cho PHẦN BÙ của tập Ｐ mới (WinForm parity bug)', async () => {
        // ⛔ ĐỌC KHỐI ĐẦU FILE. TC này XANH = port đúng; nó KHOÁ một hành vi phá dữ
        //    liệu đang chờ khách quyết (ISSUE-14).
        const gate = page.getByText('変更を適用しますか？')
        await expect(
            gate,
            'Sửa 部位 xong phải bung Q00100 「変更を適用しますか？」 (ChkBuiDisChg, frm203002.cs:7241). ' +
                'Không bung ⇒ 部位 chưa thực sự đổi so với ảnh chụp (guard dsp === oldPart trong ' +
                'commitByokenChange) — F11/F3 ở TC-2 không ăn.',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const done = page
            .waitForResponse(
                (r) => r.url().includes(P_MODE_PATH) && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            .catch(() => null)

        // ⚠️ Q00100 dựng bằng `confirmDialog` → Radix **AlertDialog** ⇒ role
        // `alertdialog`, KHÔNG phải `dialog` (cùng bẫy đã ghi ở p0-save-side-effects.spec.ts).
        // Bó vào getByRole('dialog') là timeout 15s rồi đỏ như thể app hỏng.
        const gateDialog = page.getByRole('alertdialog').filter({ hasText: '変更を適用しますか？' })
        await gateDialog.getByRole('button', { name: /^(Yes|はい)$/ }).click()

        const res = await done
        expect(
            res,
            `Trả lời はい ở Q00100 phải chạy ChgBuiForP RỒI Chk_PModeKesson, đúng thứ tự đó ` +
                `(frm203002.cs:7247-7248) ⇒ phải có POST ${P_MODE_PATH}. Không có request nào nghĩa ` +
                'là 欠損 auto-marking vẫn đang bị hoãn.',
        ).not.toBeNull()
        expect(res!.status(), `POST ${P_MODE_PATH} phải thành công`).toBeLessThan(400)
        expect(pModeCalls, 'một lượt はい chỉ được bắn đúng MỘT request').toBe(1)

        expect(
            sentBui,
            'không đọc được body của request — mọi kỳ vọng dưới đây suy ra từ nó (BẪY 1)',
        ).not.toBeNull()
        console.log(`bui FE gửi lên: [${sentBui!.join(',')}]`)

        const s = await mustReadSiga()
        console.log(`siga sau Ｐ変更: se = [${s.se.join(',')}]`)

        // Kỳ vọng suy TRỰC TIẾP từ luật ở :7472-7476, dùng chính tập Ｐ mới FE đã gửi.
        const wrong: string[] = []
        for (let i = 0; i < 32; i++) {
            const col = i + 1
            const actual = seOf(s, col)
            if (WISDOM_SLOTS.includes(i as (typeof WISDOM_SLOTS)[number])) continue
            const expected = (sentBui![i] ?? 0) === 0 ? SE_MISSING : SE_VITAL
            if (actual !== expected) wrong.push(`se_${col}: ${actual} (phải ${expected})`)
        }
        expect(
            wrong,
            'Luật (frm203002.cs:7472-7476): với MỌI ô ngoài 4 răng khôn, ô 部位 của tập Ｐ MỚI ' +
                `bằng 0 ⇒ se = ${SE_MISSING} (欠損歯); khác 0 ⇒ để nguyên. Không phải "răng bị bỏ ` +
                'khỏi Ｐ" mà là PHẦN BÙ — xem ISSUE-14.',
        ).toEqual([])

        // Vế headline: có răng CHƯA BAO GIỜ nằm trong Ｐ mà vẫn bị đánh 欠損.
        const markedNeverInP = s.se
            .map((v, i) => ({ slot: i, v }))
            .filter(
                (x) =>
                    x.v === SE_MISSING &&
                    x.slot !== P_BUI_SLOT &&
                    !WISDOM_SLOTS.includes(x.slot as (typeof WISDOM_SLOTS)[number]),
            )
        console.log(
            `số răng CHƯA BAO GIỜ trong Ｐ mà bị đánh 欠損: ${markedNeverInP.length} ` +
                `(ô: ${markedNeverInP.map((x) => x.slot).join(',') || '(không có)'})`,
        )
        expect(
            markedNeverInP.length,
            'Dòng Ｐ seed chỉ có ĐÚNG một răng (ô ' +
                `${P_BUI_SLOT}), nên mọi ô khác chưa bao giờ nằm trong Ｐ. WinForm vẫn đánh 欠損 cho ` +
                'chúng — đó chính là ISSUE-14. Bằng 0 nghĩa là bản port đã đổi sang luật "hiệu" ' +
                '(phương án B); nếu khách đã chốt B thì viết lại TC này, đừng chỉ nới assert.',
        ).toBeGreaterThan(0)
        await step()
    })

    test('TC-4 (đối chứng) — 4 răng khôn KHÔNG bao giờ bị đánh dấu', async () => {
        // frm203002.cs:7460 + :7472 — cả vòng dò lẫn vòng ghi đều bỏ qua i ∈ {0,15,16,31}.
        const s = await mustReadSiga()
        const touched = WISDOM_SLOTS.filter((slot) => seOf(s, slot + 1) !== SE_VITAL).map(
            (slot) => `se_${slot + 1} = ${seOf(s, slot + 1)}`,
        )
        expect(
            touched,
            'Bốn ô 智歯 (0/15/16/31 → se_1/se_16/se_17/se_32) bị loại ở CẢ HAI vòng của ' +
                'Chk_PModeKesson. Có ô nào đổi ⇒ hằng số MouthConstants.WisdomToothSlots không ' +
                'được áp dụng ở một trong hai vòng.',
        ).toEqual([])
        await step()
    })

    test('TC-5 (đối chứng) — 乳歯 (sn_*) KHÔNG bị đụng', async () => {
        // setSigaData/getSigaData của frm203002 chỉ map 1..32 → se1..se32, không có
        // nhánh sn nào (:7495-7570) ⇒ 乳歯 nằm ngoài phạm vi theo cấu trúc.
        expect(sigaBefore, 'không chụp được nguyên trạng siga ở beforeAll').not.toBeNull()
        const s = await mustReadSiga()
        const snDrift = s.sn
            .map((v, i) => ({ col: i + 1, before: sigaBefore!.sn[i], after: v }))
            .filter((d) => d.before !== d.after)
        expect(
            snDrift.map((d) => `sn_${d.col}: ${d.before}→${d.after}`),
            'Chk_PModeKesson không có nhánh 乳歯. Có cột sn_* đổi ⇒ bản port đã tự ý mở rộng ' +
                'sang răng sữa — răng sữa sẽ biến mất khỏi 部位選択 mà WinForm không hề làm thế.',
        ).toEqual([])
        await step()
    })

    test('TC-6 — 「いいえ」 lúc thoát KHÔNG hoàn tác dấu 欠損 vừa ghi', async () => {
        // Chk_PModeKesson chạy trong transaction RIÊNG và commit ngay, KHÔNG bật
        // pSiga_chg (frm203002.cs:7480-7491) ⇒ Restore_SK bỏ qua nó (modSave.cs:4684).
        // Cùng bản chất với DelExtRec — xem ISSUE-15.
        const before = await mustReadSiga()

        await closeDialogs(page)
        await page.getByRole('button', { name: /F10\s*戻る/ }).click()

        const gate = page.getByText('処置データは変更されています。保存しますか？')
        const asked = await gate
            .waitFor({ state: 'visible', timeout: 20_000 })
            .then(() => true)
            .catch(() => false)
        console.log(`F10 戻る sau Ｐ変更 → dirty gate bung? ${asked}`)
        if (asked) {
            // Khoanh trong chính hộp thoại: tiêu đề cột 「No」 của tab 病検 cũng là
            // role="button" nên .first() có thể rơi vào đó và chỉ sort side panel.
            const gateDialog = page.getByRole('dialog').filter({ hasText: '保存しますか？' })
            await gateDialog.getByRole('button', { name: 'No', exact: true }).click()
            await expect(gate, 'bấm No mà hộp thoại không đóng').toBeHidden({ timeout: 15_000 })
        }
        await step()

        const after = await mustReadSiga()
        expect(
            after.se
                .map((v, i) => ({ col: i + 1, b: before.se[i], a: v }))
                .filter((d) => d.b !== d.a)
                .map((d) => `se_${d.col}: ${d.b}→${d.a}`),
            'Chk_PModeKesson commit ngay trong transaction riêng và KHÔNG bật pSiga_chg, nên ' +
                '「いいえ」 không có gì để lùi — dấu 欠損 phải ở lại y nguyên. Có cột quay về ' +
                `${SE_VITAL} nghĩa là endpoint p-mode-missing đang arm cờ nhầm; khi đó một thao tác ` +
                'Ｐ変更 rồi huỷ sẽ khôi phục cả những 欠損 mà người dùng thật sự muốn giữ.',
        ).toEqual([])
        await step()
    })
})
