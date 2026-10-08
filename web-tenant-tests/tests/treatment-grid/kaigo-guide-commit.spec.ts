import { type Locator, type Page } from '@playwright/test'

import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import {
    SEED_PAT_NO_BASE,
    careInsRateFor,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    seedTreatmentRows,
    withDb,
} from '../_shared/db'
import { makeStep } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — xử lý 介護 khi F9 確定 một ガイド (frmGuid2_Let_Data) trên lưới
 * `/treatments/{patNo}`.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web. Spec anh em `kaigo-hutan-row.spec.ts` phủ nhánh GÕ TAY 599 +
 * KaigoHutanSet; spec này phủ nhánh ガイド, vốn có luật RIÊNG và khác hẳn.
 *
 * ─── Nguồn WinForm ────────────────────────────────────────────────────────────
 *  - INP/Forms/frm203002.cs:9134-9141 — `guidCd == "9908"` ⇒ `bFlgKaigo = true`
 *    NGAY TỪ ĐẦU; ガイド khác bắt đầu với `false`.
 *  - INP/Lib/modMain.cs:773-776 `Chk_CmtAuto(…, ref bFlgKaigo)` — gọi SAU khi pick
 *    đã được tô màu/cộng điểm (:9491). Pick 599 với 枝番 0/1/>=10 bật cờ lên và
 *    không bao giờ tắt ⇒ CHÍNH dòng 599 KHÔNG nằm trong chế độ 介護, các pick SAU
 *    nó mới nằm trong.
 *  - frm203002.cs:9183-9190 (カルテコメント) / :9227-9234 (摘要コメント, trt_cd
 *    700-899 hoặc 6) — `hFG1[70] = bFlgKaigo ? "3" : "0"`.
 *    INP/Forms/frm203017.cs:1399-1403 — dialog ガイド cũng ép `jihiFlg = "3"` cho
 *    comment khi ô ガイド番号 là 9908.
 *  - 処置 thường (nhánh else, :9240-9447) đi qua `frm203016_Hide_Let_Trt_Data`
 *    → `setPacData` chép `jihi_flg` của dialog (= mst_trt.own_kbn) — KHÔNG có lệnh
 *    tô NỀN xám nào trên đường này (khác hẳn nhánh gõ tay :5680-5683).
 *  - frm203002.cs:9482-9488 — trong chế độ 介護: tô **ForeColor** 0xE0E0E0 cho
 *    cột 1..5 của dòng vừa chèn (CHỮ xám, KHÔNG phải nền) và
 *    `careScore += score * cnt`.
 *  - frm203002.cs:9502-9537 — sau vòng lặp: `if (bFlgKaigo & careScore != 0)`
 *    AddRow tại con trỏ, text `"     【介護保険一部負担金　　" + carePrice + " 円】"`,
 *    `carePrice = careScore * 10 * careRate / 100` (chia nguyên), careRate =
 *    `getCareInsRate` hoặc fallback `acc_rate == 0 ? 0 : 10`; tô **BackColor**
 *    0xE0E0E0 cho cột 1..5. KHÔNG xoá dòng 【介護保険一部負担金】 cũ của ngày
 *    (khác KaigoHutanSet) ⇒ ngày có thể mang HAI dòng.
 *
 * ─── Dữ liệu tự dựng (có can thiệp DB, cần TEST_DB=1) ─────────────────────────
 *  · Bệnh nhân seed `SEED_PAT_NO_BASE + 55` (accRate 30, không có 介護保険 ⇒
 *    careRate = fallback 10%), xoá hẳn ở afterAll.
 *  · Tenant KHÔNG có ガイド 9908 nào ⇒ seed tạm vào `pac_nam` + `pag_trt`:
 *      9908 「E2E介護ガイド」   : 599-0 → 118-0 → 摘要 704-0 → カルテ 7472-0
 *      9909 「E2E介護途中ガイド」: 摘要 704-0 → 599-0 → カルテ 7472-0 → 118-0
 *    `flg2` = 1..4 (mỗi dòng một nhóm ⇒ không bị dedup FLG2, và giữ đúng thứ tự
 *    ORDER BY flg2), `flg4 = 1` (回数 mặc định = 1, không phụ thuộc 歯式/部位).
 *    KHÔNG cần `pac_tbl`: bệnh nhân seed không có 病名 nên list ガイド chỉ loại
 *    ガイド có pac_tbl dis_cd <> 9999 — ガイド không có dòng pac_tbl nào vẫn hiện.
 *    afterAll xoá ĐÚNG hai guid_cd đó (pac_nam + pag_trt); beforeAll xoá trước khi
 *    chèn (idempotent) và TỪ CHỐI nếu guid_cd đang là master thật (tên khác).
 *    Dọn tay nếu lần chạy bị kill:
 *      DELETE FROM t_tenant1.pac_nam WHERE guid_cd IN (9908, 9909);
 *      DELETE FROM t_tenant1.pag_trt WHERE guid_cd IN (9908, 9909);
 *  · Một dòng 再診 110-0 (59点, 保険) seed sẵn vào ngày test — xem bẫy 7.
 *  · Điểm: 599-0 = 517点, 118-0 口画像 = 50点 (mst_trt.score1 bản hiện hành).
 *    ⇒ 9908: careScore = 517 + 50 = 567 ⇒ 567円 ở 10%.
 *    ⇒ 9909: careScore = chỉ phần SAU 599 = 0 (カルテ) + 50 = 50 ⇒ 50円.
 *
 * ─── BẪY ĐÃ VẤP / cần biết ────────────────────────────────────────────────────
 *  1. Lưới render CẢ THÁNG và giữ dòng của testcase trước ⇒ chụp rowKey TRƯỚC khi
 *     確定, chỉ soi các khoá MỚI.
 *  2. 599 kéo theo cascade 摘要コメント (居宅療養管理指導費…) chen giữa các pick —
 *     KHÔNG mốc theo "dòng kế tiếp", mốc theo text của từng pick.
 *  3. NFKC ăn 「Ⅰ」 và full-width (`１日２度来院` → `1日2度来院`) — mọi mốc text
 *     đã chọn đoạn không bị biến dạng (xem `key` của từng `PICK_*`).
 *  4. Tailwind v4 trả màu **oklch** ⇒ quy đổi qua canvas 1×1 (như spec anh em).
 *  5. mst_trt.own_kbn của 599-0 = 3 ⇒ dòng 599 vào lưới qua ガイド MANG sẵn
 *     jihi_flg 3 (setPacData chép nguyên), nhưng WinForm KHÔNG tô nền cho nó.
 *     Assert "599 không nền xám" là đo đúng chỗ đó.
 *  6. TUYỆT ĐỐI KHÔNG bấm F9 登録 (lưu) — dòng 【介護保険一部負担金】 là dòng hiển
 *     thị; cái cần đo chỉ nằm trên lưới. (Web vẫn có thể ghi `pag_trt.flg1`/
 *     `pac_nam.use_cnt` khi 確定 — chúng nằm trên chính dòng seed, bị xoá ở afterAll.)
 *  7. Bệnh nhân mới tinh ⇒ tháng trống ⇒ AutoSantei chạy lúc mở màn, bung
 *     「〜を算定しますか？」 rồi カルテ記載選択 (歯科疾患管理料) đè LÊN dialog ガイド,
 *     F10 của handler không gỡ được ⇒ 確定 bị chặn 15s. Đã vấp thật lần chạy đầu.
 *     Seed sẵn MỘT dòng 再診 110-0 trong ngày để tháng không trống.
 *
 * ─── TC-7: điểm parity nền của 599 trên đường ガイド ─────────────────────────────
 * Dòng 599-0 do ガイド thường chèn mang jihi_flg 3 (own_kbn = 3) nhưng WinForm KHÔNG
 * tô nền xám cho nó (setPacData chỉ chép cờ, không có BackColor). Bản web trước
 * commit b43a0d0b6 tô nền theo cờ đó — TC-7 chốt lại điểm này. Để ở CUỐI file để
 * nếu hồi quy thì không kéo TC-6 bị skip.
 *
 * ─── Cách chạy ────────────────────────────────────────────────────────────────
 * `describe.serial` + MỘT page chung từ `beforeAll` (login một lần). Các testcase
 * NỐI TIẾP TRẠNG THÁI (TC-4..6 cần dòng 【介護】 của TC-1..3 còn nằm trên lưới) ⇒
 * LUÔN chạy CẢ FILE, không `-g`:
 *   npx playwright test tests/treatment-grid/kaigo-guide-commit.spec.ts
 */

const PAT_NO = patNo(String(SEED_PAT_NO_BASE + 55))

/** Ngày test = HÔM NAY: chỉ tháng hiện hành mới nhập được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** ガイド番号 介護 — WinForm hard-code chuỗi "9908" (frm203002.cs:9134, frm203017.cs:1400). */
const KAIGO_GUID_CD = 9908
/** ガイド thường, số trống trong tenant — chỉ vào chế độ 介護 SAU pick 599. */
const PLAIN_GUID_CD = 9909
const KAIGO_GUID_NM = 'E2E介護ガイド'
const PLAIN_GUID_NM = 'E2E介護途中ガイド'
const SEEDED_GUID_CDS = [KAIGO_GUID_CD, PLAIN_GUID_CD] as const

interface GuidePick {
    trtCd: number
    trtSb: number
    /** 点数 × 1 (flg4 = 1 ⇒ 回数 1). Comment = 0. */
    pt: number
    /** Mốc dò trên lưới — đã NFKC-an-toàn. */
    key: string
}

/** 599-0 歯科医師居宅療養管理指導Ⅰ (own_kbn 3, 517点). Cắt 「Ⅰ」 — bẫy NFKC. */
const PICK_599: GuidePick = { trtCd: 599, trtSb: 0, pt: 517, key: '歯科医師居宅療養管理指導' }
/**
 * 118-0 口画像 50点 — 処置 thường, không mở dialog, không CMTAUTO. Dialog hiện trt_nm
 * 「歯周病患者画像活用指導料(口腔内画像)」 còn lưới có thể hiện cct_nm 「口画像」 ⇒ mốc chung 「画像」.
 */
const PICK_TRT: GuidePick = { trtCd: 118, trtSb: 0, pt: 50, key: '画像' }
/** 摘要コメント 704-0 「１日２度来院」 (mst_cmt, dải 700-899). */
const PICK_TEKIYO: GuidePick = { trtCd: 704, trtSb: 0, pt: 0, key: '度来院' }
/** カルテコメント 7472-0 「根管洗浄（ＮＣ＋）」 (mst_cmt2, dải 7000-8999). */
const PICK_KARTE: GuidePick = { trtCd: 7472, trtSb: 0, pt: 0, key: '根管洗浄' }

const KAIGO_GUIDE_PICKS = [PICK_599, PICK_TRT, PICK_TEKIYO, PICK_KARTE] as const
const PLAIN_GUIDE_PICKS = [PICK_TEKIYO, PICK_599, PICK_KARTE, PICK_TRT] as const

/** Dòng 処置 seed sẵn trong ngày — 110-0 再診 59点 (保険, jihi_flg 0). */
const SEED_BASE_ROW = { trtCd: 110, trtSb: 0, pt: 59, nm: '再診' } as const

/** Nhãn cố định của dòng tổng (frm203002.cs:9529). */
const KAIGO_LABEL = '介護保険一部負担金'

/** RegiCol (lib/treatment-entry-shared.ts) — 部位 / 療法・処置 / 点 / 回. */
const COL_BUI = 1
const COL_RYO = 2
const COL_TEN = 3
const COL_KAI = 4

const GRID_LOAD_TIMEOUT = 60_000

/** REGIRYO_PADLEFT + full-width ⇒ luôn so sau NFKC/trim. */
const txt = (s: string) => s.normalize('NFKC').trim()

// ─── Seed ガイド tạm (chỉ của spec này, nên để trong file thay vì _shared/db.ts) ──

async function deleteSeededGuides(): Promise<void> {
    await withDb(async (c) => {
        await c.query('DELETE FROM pag_trt WHERE guid_cd = ANY($1::int[])', [[...SEEDED_GUID_CDS]])
        await c.query('DELETE FROM pac_nam WHERE guid_cd = ANY($1::int[])', [[...SEEDED_GUID_CDS]])
    })
}

async function seedGuide(guidCd: number, guidNm: string, picks: readonly GuidePick[]): Promise<void> {
    await withDb(async (c) => {
        const clash = await c.query<{ guid_nm: string | null }>(
            'SELECT guid_nm FROM pac_nam WHERE guid_cd = $1 LIMIT 1',
            [guidCd],
        )
        const existing = clash.rows[0]
        if (existing && (existing.guid_nm ?? '') !== guidNm) {
            throw new Error(
                `seedGuide: guid_cd ${guidCd} đã là master thật 「${existing.guid_nm}」 — từ chối ghi đè.`,
            )
        }
        await c.query('DELETE FROM pag_trt WHERE guid_cd = $1', [guidCd])
        await c.query('DELETE FROM pac_nam WHERE guid_cd = $1', [guidCd])
        await c.query('INSERT INTO pac_nam (guid_cd, guid_nm) VALUES ($1, $2)', [guidCd, guidNm])
        for (const [i, p] of picks.entries()) {
            // Hình dạng dòng chép từ ガイド thật (vd 212): flg1 = đếm học, flg2 = nhóm,
            // flg4 = chế độ 回数 mặc định, còn lại 0.
            await c.query(
                `INSERT INTO pag_trt (guid_cd, trt_cd, trt_sb, flg1, flg2, flg3, flg4, flg5, flg6,
                                      flg7, flg8, flg9, flg10, flg11, flg12, flg13, flg14, flg15)
                 VALUES ($1, $2, $3, 0, $4, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)`,
                [guidCd, p.trtCd, p.trtSb, i + 1],
            )
        }
    })
}

// ─── Đọc lưới ────────────────────────────────────────────────────────────────

const ryoCells = (page: Page) => page.locator(`[data-grid-cell$="|${COL_RYO}"]`)

interface GridRow {
    key: string
    text: string
}

async function gridRows(page: Page): Promise<GridRow[]> {
    const raw = await ryoCells(page).evaluateAll((els) =>
        els.map((e) => ({
            key: (e.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
            text: e.textContent ?? '',
        })),
    )
    return raw.map((r) => ({ key: r.key, text: txt(r.text) }))
}

/** Màu chữ + màu nền THỰC TẾ của một ô, đã quy về sRGB. */
interface CellColors {
    fgRaw: string
    fg: [number, number, number, number] | null
    bgRaw: string
    bg: [number, number, number, number] | null
    text: string
}

/**
 * Màu chữ lấy ở phần tử TRỰC TIẾP chứa text node đầu tiên (class màu có thể đặt ở
 * ô hoặc ở span con). Màu nền leo tối đa 3 cấp cha. oklch → sRGB qua canvas 1×1
 * (bẫy 4).
 */
async function cellColors(page: Page, key: string, col: number): Promise<CellColors> {
    return page.locator(`[data-grid-cell="${key}|${col}"]`).evaluate((el) => {
        const toRgba = (color: string): [number, number, number, number] | null => {
            const canvas = document.createElement('canvas')
            canvas.width = 1
            canvas.height = 1
            const ctx = canvas.getContext('2d')
            if (!ctx) return null
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = '#000000'
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            const d = ctx.getImageData(0, 0, 1, 1).data
            return [d[0]!, d[1]!, d[2]!, d[3]! / 255]
        }
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) =>
                (n.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
        })
        const textNode = walker.nextNode()
        const fgEl = (textNode?.parentElement ?? el) as HTMLElement
        const fgRaw = getComputedStyle(fgEl).color

        let bgRaw = 'rgba(0, 0, 0, 0)'
        let n: HTMLElement | null = el as HTMLElement
        for (let i = 0; i < 3 && n; i++, n = n.parentElement) {
            const c = getComputedStyle(n).backgroundColor
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                bgRaw = c
                break
            }
        }
        return {
            fgRaw,
            fg: toRgba(fgRaw),
            bgRaw,
            bg: bgRaw === 'rgba(0, 0, 0, 0)' ? [0, 0, 0, 0] : toRgba(bgRaw),
            text: (el.textContent ?? '').trim(),
        }
    })
}

/** Nền xám đặc (0xE0E0E0 / bg-gray-200 = #e5e7eb). */
function isGreyBg(rgba: CellColors['bg']): boolean {
    if (!rgba) return false
    const [r, g, b, a] = rgba
    if (a === 0) return false
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    const avg = (r + g + b) / 3
    return spread <= 12 && avg >= 195 && avg <= 245
}

/** CHỮ xám nhạt 0xE0E0E0 = rgb(224,224,224) — dung sai nhỏ cho làm tròn. */
function isGreyFore(rgba: CellColors['fg']): boolean {
    if (!rgba) return false
    const [r, g, b] = rgba
    return [r, g, b].every((v) => Math.abs(v - 224) <= 8)
}

function kaigoRowPattern(yen: number): RegExp {
    const forms = new Set([String(yen), yen.toLocaleString('en-US')])
    return new RegExp(`${KAIGO_LABEL}[\\s\\u3000]*(?:${[...forms].join('|')})[\\s\\u3000]*円`)
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed ガイド 9908/9909 và bệnh nhân test')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — ガイド確定の介護処理 (frmGuid2_Let_Data)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    let careRate: number | null = null
    let careRateSource = ''
    const carePriceOf = (score: number) =>
        careRate === null ? null : Math.trunc((score * 10 * careRate) / 100)

    /** Dòng MỚI (theo thứ tự hiển thị) mà lượt 確定 gần nhất đẩy vào lưới. */
    let kaigoNewRows: GridRow[] = []
    let plainNewRows: GridRow[] = []
    /** Khoá của dòng 【介護】 do ガイド 9908 sinh ra — TC-6 kiểm nó còn nguyên. */
    let kaigoTotalKey = ''

    let sidePanel: Locator
    let guidePicker: Locator

    async function openTreatmentScreen() {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page, 'goto 診療入力 bị đá đi (mất session?)').toHaveURL(/\/treatments\//, {
            timeout: 15_000,
        })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await expect(
            page.locator('input[data-footer-cell$=":footer-ten"]').last(),
            'không thấy ô 点 của dòng 日計',
        ).toBeVisible({ timeout: 30_000 })
        await closeDialogs(page)
    }

    /**
     * F4 → tab ガイド → bấm ガイド `guidNm` → dialog ガイド処置選択 → kiểm 回数 → F9 確定.
     * Trả về các dòng MỚI của lưới (so khoá trước/sau — bẫy 1).
     */
    async function commitGuide(guidNm: string, picks: readonly GuidePick[]): Promise<GridRow[]> {
        await closeDialogs(page)
        const before = new Set((await gridRows(page)).map((r) => r.key))

        await page.keyboard.press('F4')
        const guideRow = sidePanel
            .locator('div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]')
            .filter({ hasText: guidNm })
        await expect(guideRow, `tab ガイド không có 「${guidNm}」 — seed hỏng?`).toHaveCount(1, {
            timeout: 30_000,
        })
        await guideRow.scrollIntoViewIfNeeded()
        await guideRow.click()
        await expect(guidePicker.getByTestId('cell-trtNm').first()).toBeVisible({ timeout: 30_000 })
        await step()

        // Dialog phải liệt kê đủ 4 pick với 回数 = 1, đúng thứ tự flg2.
        const names = (await guidePicker.getByTestId('cell-trtNm').allInnerTexts()).map(txt)
        const cnts = await Promise.all(
            (await guidePicker.getByTestId('cell-cnt').locator('input').all()).map((i) => i.inputValue()),
        )
        console.log(`ガイド 「${guidNm}」: ${names.map((n, i) => `${n}×${cnts[i]}`).join(' / ')}`)
        expect(
            picks.map((p) => names.findIndex((n) => n.includes(p.key))),
            `dialog ガイド処置選択 phải có đủ ${picks.length} pick theo thứ tự flg2: ${names.join(' / ')}`,
        ).toEqual(picks.map((_, i) => i))
        expect(cnts.map((c) => Number(c.trim() || '0'))).toEqual(picks.map(() => 1))

        await guidePicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(guidePicker).toBeHidden({ timeout: 15_000 })

        // Mốc CÓ THẬT: pick CUỐI đã vào lưới ⇒ vòng lặp đã chạy hết.
        const last = picks[picks.length - 1]!
        await expect
            .poll(
                async () =>
                    (await gridRows(page)).filter((r) => !before.has(r.key) && r.text.includes(last.key))
                        .length,
                { message: `確定 mà lưới không có pick cuối 「${last.key}」`, timeout: 30_000 },
            )
            .toBeGreaterThan(0)
        await closeDialogs(page)
        await step()

        const added = (await gridRows(page)).filter((r) => !before.has(r.key))
        console.log(`dòng mới sau 確定 「${guidNm}」: ${added.map((r) => r.text).join(' | ')}`)
        return added
    }

    /** Dòng mới đầu tiên mang text của pick. */
    function rowOf(rows: GridRow[], p: GuidePick): GridRow {
        const r = rows.find((x) => x.text.includes(p.key))
        expect(r, `không thấy dòng 「${p.key}」 trong các dòng mới: ${rows.map((x) => x.text).join(' | ')}`)
            .toBeDefined()
        return r!
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: Number(PAT_NO), accRate: 30 })
        // Một dòng 再診 đã lưu ⇒ tháng KHÔNG trống ⇒ AutoSantei không chạy lúc mở màn
        // (bẫy 7). Dòng bảo hiểm thường, không đụng gì tới 介護.
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            { trtCd: SEED_BASE_ROW.trtCd, trtSb: SEED_BASE_ROW.trtSb, trtPt: SEED_BASE_ROW.pt, trtCnt: 1, dspTrt: SEED_BASE_ROW.nm },
        ])
        await deleteSeededGuides()
        await seedGuide(KAIGO_GUID_CD, KAIGO_GUID_NM, KAIGO_GUIDE_PICKS)
        await seedGuide(PLAIN_GUID_CD, PLAIN_GUID_NM, PLAIN_GUIDE_PICKS)

        const rate = await careInsRateFor(Number(PAT_NO), TRT_DT)
        careRate = rate.rate
        careRateSource = rate.source
        console.log(`careRate cho ${PAT_NO} ngày ${TRT_DT} = ${careRate}% (${careRateSource})`)

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, {
            santei: true,
            kartePicker: true,
            alerts: true,
        })
        step = makeStep(page)
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        guidePicker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })

        await openTreatmentScreen()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await deleteSeededGuides().catch(() => {})
        await deleteTestPatient(Number(PAT_NO)).catch(() => {})
    })

    // ─── ガイド 9908: chế độ 介護 từ pick đầu tiên ────────────────────────────────

    test('TC-1 — ガイド 9908 確定: 4 pick vào lưới đúng thứ tự (frm203002.cs:9152-9491)', async () => {
        kaigoNewRows = await commitGuide(KAIGO_GUID_NM, KAIGO_GUIDE_PICKS)
        const idx = KAIGO_GUIDE_PICKS.map((p) => kaigoNewRows.indexOf(rowOf(kaigoNewRows, p)))
        expect(
            idx.every((v, i) => i === 0 || v > idx[i - 1]!),
            `pick phải vào lưới theo thứ tự ガイド: ${idx.join(', ')}`,
        ).toBe(true)

        // 点 của 2 処置 đúng master ⇒ đúng dòng.
        for (const p of [PICK_599, PICK_TRT]) {
            const ten = page.locator(`[data-grid-cell="${rowOf(kaigoNewRows, p).key}|${COL_TEN}"]`)
            expect(Number(txt(await ten.innerText()).replace(/,/g, '')), `点 của ${p.key}`).toBe(p.pt)
        }
    })

    test('TC-2 — ガイド 9908: MỌI pick có CHỮ xám 0xE0E0E0, KHÔNG nền xám (frm203002.cs:9482-9487)', async () => {
        for (const p of KAIGO_GUIDE_PICKS) {
            const r = rowOf(kaigoNewRows, p)
            for (const col of [COL_BUI, COL_RYO, COL_TEN, COL_KAI]) {
                const c = await cellColors(page, r.key, col)
                const where = `「${p.key}」 cột ${col} (text "${c.text}")`
                // Ô rỗng không có text node ⇒ màu chữ không nhìn thấy, chỉ kiểm ô có chữ.
                if (c.text !== '') {
                    expect
                        .soft(
                            isGreyFore(c.fg),
                            `${where}: ガイド 9908 ⇒ bFlgKaigo từ đầu ⇒ ForeColor 0xE0E0E0 cho cột 1..5. ` +
                                `Đang là ${c.fgRaw} = ${JSON.stringify(c.fg)}`,
                        )
                        .toBe(true)
                }
                expect
                    .soft(
                        isGreyBg(c.bg),
                        `${where}: đường ガイド chỉ đổi màu CHỮ, KHÔNG tô nền (kể cả comment jihi_flg 3 ` +
                            `và 599 own_kbn 3). Đang là ${c.bgRaw}`,
                    )
                    .toBe(false)
            }
        }
        await step()
    })

    test('TC-3 — ガイド 9908: ĐÚNG MỘT dòng 【介護保険一部負担金 567 円】 nền xám NGAY SAU pick cuối (frm203002.cs:9502-9537)', async () => {
        const score = KAIGO_GUIDE_PICKS.reduce((s, p) => s + p.pt, 0)
        const price = carePriceOf(score)
        test.skip(price === null, `không chốt được careRate (${careRateSource})`)

        const totals = kaigoNewRows.filter((r) => r.text.includes(KAIGO_LABEL))
        expect(
            totals.length,
            `9908 có careScore ${score}点 ≠ 0 ⇒ WinForm AddRow ĐÚNG MỘT dòng tổng. Dòng mới: ` +
                kaigoNewRows.map((r) => r.text).join(' | '),
        ).toBe(1)
        const total = totals[0]!
        kaigoTotalKey = total.key

        expect(
            total.text,
            `careScore ${score}点 × 10 × ${careRate}% ÷ 100 = ${price}円 (rate: ${careRateSource})`,
        ).toMatch(kaigoRowPattern(price!))

        const lastPick = rowOf(kaigoNewRows, KAIGO_GUIDE_PICKS[KAIGO_GUIDE_PICKS.length - 1]!)
        expect(
            kaigoNewRows.indexOf(total),
            'dòng tổng AddRow tại con trỏ = NGAY SAU pick cuối của ガイド',
        ).toBe(kaigoNewRows.indexOf(lastPick) + 1)

        const c = await cellColors(page, total.key, COL_RYO)
        expect(isGreyBg(c.bg), `dòng tổng tô BackColor 0xE0E0E0 (:9532-9535). Đang là ${c.bgRaw}`).toBe(true)
        await step()
    })

    // ─── ガイド thường: chế độ 介護 chỉ bật SAU pick 599 ───────────────────────────

    test('TC-4 — ガイド thường 確定: 摘要 → 599 → カルテ → 処置 vào lưới đúng thứ tự', async () => {
        plainNewRows = await commitGuide(PLAIN_GUID_NM, PLAIN_GUIDE_PICKS)
        const idx = PLAIN_GUIDE_PICKS.map((p) => plainNewRows.indexOf(rowOf(plainNewRows, p)))
        expect(
            idx.every((v, i) => i === 0 || v > idx[i - 1]!),
            `pick phải vào lưới theo thứ tự ガイド: ${idx.join(', ')}`,
        ).toBe(true)
    })

    test('TC-5 — ガイド thường: pick TRƯỚC và CHÍNH 599 giữ màu chữ thường, pick SAU 599 chữ xám (modMain.cs:773-776)', async () => {
        const expectations: [GuidePick, boolean, string][] = [
            [PICK_TEKIYO, false, 'trước 599 ⇒ bFlgKaigo = false ⇒ jihi 0, màu 摘要 thường'],
            [PICK_599, false, 'Chk_CmtAuto bật cờ SAU khi dòng 599 đã tô màu ⇒ 599 KHÔNG xám'],
            [PICK_KARTE, true, 'sau 599 ⇒ bFlgKaigo ⇒ ForeColor 0xE0E0E0'],
            [PICK_TRT, true, 'sau 599 ⇒ bFlgKaigo ⇒ ForeColor 0xE0E0E0'],
        ]
        for (const [p, grey, why] of expectations) {
            const c = await cellColors(page, rowOf(plainNewRows, p).key, COL_RYO)
            expect
                .soft(isGreyFore(c.fg), `「${p.key}」: ${why}. Màu chữ đang là ${c.fgRaw}`)
                .toBe(grey)
            // Nền của 599 tách riêng ra TC-7 để hồi quy ở đó không làm skip TC-6.
            if (p === PICK_599) continue
            expect
                .soft(
                    isGreyBg(c.bg),
                    `「${p.key}」: đường ガイド KHÔNG tô nền xám (chỉ đổi ForeColor). Đang là ${c.bgRaw}`,
                )
                .toBe(false)
        }
        await step()
    })

    test('TC-6 — ガイド thường: thêm dòng 【介護 50 円】 (chỉ điểm SAU 599) ngay sau pick cuối, dòng của 9908 GIỮ NGUYÊN', async () => {
        // careScore chỉ cộng pick trong chế độ 介護 = sau 599: カルテ (0) + 処置.
        const score = PICK_KARTE.pt + PICK_TRT.pt
        const price = carePriceOf(score)
        test.skip(price === null, `không chốt được careRate (${careRateSource})`)

        const totals = plainNewRows.filter((r) => r.text.includes(KAIGO_LABEL))
        expect(
            totals.length,
            `careScore ${score}点 ≠ 0 ⇒ ĐÚNG MỘT dòng tổng mới. Dòng mới: ${plainNewRows.map((r) => r.text).join(' | ')}`,
        ).toBe(1)
        const total = totals[0]!
        expect(
            total.text,
            `careScore = CHỈ phần sau 599 = ${score}点 (599 không nằm trong chế độ) ⇒ ${price}円`,
        ).toMatch(kaigoRowPattern(price!))

        const lastPick = rowOf(plainNewRows, PLAIN_GUIDE_PICKS[PLAIN_GUIDE_PICKS.length - 1]!)
        expect(plainNewRows.indexOf(total), 'dòng tổng NGAY SAU pick cuối của ガイド').toBe(
            plainNewRows.indexOf(lastPick) + 1,
        )
        const c = await cellColors(page, total.key, COL_RYO)
        expect(isGreyBg(c.bg), `dòng tổng nền xám. Đang là ${c.bgRaw}`).toBe(true)

        // frmGuid2_Let_Data KHÔNG xoá dòng 【介護】 cũ (khác KaigoHutanSet) ⇒ ngày có 2 dòng,
        // dòng của 9908 vẫn đúng số tiền cũ (text ghi MỘT lần, không tính lại).
        const all = (await gridRows(page)).filter((r) => r.text.includes(KAIGO_LABEL))
        console.log(`dòng 【${KAIGO_LABEL}】 trong ngày: ${all.map((r) => r.text).join(' | ')}`)
        expect(all.length, 'dòng 【介護】 của 9908 không được bị xoá').toBe(2)
        const old = all.find((r) => r.key === kaigoTotalKey)
        expect(old, 'dòng 【介護】 của 9908 phải còn nguyên khoá').toBeDefined()
        const oldPrice = carePriceOf(KAIGO_GUIDE_PICKS.reduce((s, p) => s + p.pt, 0))!
        expect(old!.text, 'số tiền dòng 9908 bị ĐÓNG BĂNG, không tính lại').toMatch(
            kaigoRowPattern(oldPrice),
        )
        await step()
    })

    test('TC-7 — ガイド thường: dòng 599-0 (own_kbn 3) KHÔNG được tô NỀN xám (frm203016 setPacData, không có BackColor)', async () => {
        // Để CUỐI file: nếu điểm này hồi quy thì serial không kéo TC-6 bị skip.
        //
        // WinForm: 599 đi qua nhánh 一般処置 (frm203002.cs:9240-9447) →
        // frm203016_Hide_Let_Trt_Data → setPacData chép `jihi_flg` = own_kbn = 3 vào
        // cột 70, KHÔNG có lệnh BackColor nào; lệnh tô nền 0xE0E0E0 của 599 chỉ nằm ở
        // nhánh GÕ TAY (:5680-5683). Chỉ khi nạp lại tháng (modSave.cs:2723-2733)
        // dòng jihi 3 mới được tô nền. Với ガイド 9908 thì 599 nằm trong chế độ 介護
        // nên chỉ có chữ xám (TC-2 đã phủ); ở ガイド thường 599 phải trông như dòng
        // bảo hiểm thường.
        const c = await cellColors(page, rowOf(plainNewRows, PICK_599).key, COL_RYO)
        expect(
            isGreyBg(c.bg),
            `dòng 599-0 do ガイド thường chèn đang có nền ${c.bgRaw} (xám). WinForm không tô nền ` +
                'trên đường ガイド dù jihi_flg = 3 (own_kbn).',
        ).toBe(false)
        await step()
    })
})
