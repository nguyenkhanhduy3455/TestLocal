import { expect, test, type Page } from '@playwright/test'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteTreatmentRows,
    deleteTreatmentRowsByTrtCd,
    seedTreatmentRows,
    withDb,
} from './db'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * 診療入力 F9 登録 — lô 5: LetHokan + Let_BNOW (修復物データ作成 & 未装着一覧).
 *
 * Đây là phần DUY NHẤT của lô 5 chưa được integration test che, vì muốn test ở tầng
 * đó phải seed `mst_trt` — bảng có **74 cột NOT NULL**. Ở đây chạy trên tenant thật
 * nên master đã có sẵn, đổi lại phải chấp nhận phụ thuộc dữ liệu tenant (xem §ENV).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẢN ĐỒ TC
 * ═════════════════════════════════════════════════════════════════════════════
 *  TC-L0  mốc     master của tháng test có đủ 3 mã đem thử (nếu ĐỎ ⇒ đổi tenant/ngày)
 *  TC-L1  LetHokan   trt_cd 213 → pat_info.hokan_n = 診療日
 *  TC-L2  Let_BNOW   res_kind → bnow.re_n, và 装着日 → pat_info.hokan_n
 *  TC-L3  🐛 ISSUE-2a  bui index 13 và 19 (răng sữa) cùng đổ vào slot 42 → mất 1 răng
 *  TC-L4  🐛 ISSUE-2c  bệnh nhân không có dòng `bnow` → mất sạch 修復物, KHÔNG báo lỗi
 *
 * ⚠️ TC-L3 và TC-L4 khoá **đúng hành vi SAI**. Quyết định dự án 2026-08-10 là port
 * nguyên parity WinForm, không sửa. Nếu chúng chuyển đỏ vì ai đó "sửa cho đúng" thì
 * đó là đổi phạm vi — đọc `userapp/inp-parity-bugs-reproduction.md` trước khi đụng
 * vào assert.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (src/OCHACOM)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · modSave.cs:2124 `LetHokan` — trt_cd 213 / trt_sb 0-3, ghi 補綴日 vào
 *    pat_info.hokan_1..32 cho mọi ô 部位 khác 0. Không có bảng lịch sử, mỗi lần lưu
 *    đè lại cả 32 cột. Thiếu dòng pat_info thì TẠO (PatInfo.insertPatInfo).
 *  · modSave.cs:1512 `Let_BNOW` — join 当月 処置行 × 処置マスタ của tháng, lọc
 *    `res_kind <> 0 OR misochaku <> 0 OR trt_cd = 999`, gom vào 3 mảng 52 slot rồi
 *    ghi bnow / pat_info.hokan_* / misou.
 *      slot 0..31  → 永久歯 → bnow.re_1..re_32
 *      slot 32..51 → 乳歯   → bnow.rn_1..rn_20
 *    Map ô 部位 → slot: 永久歯 giữ nguyên index; 乳歯 dùng `i+29` (i∈3..13) và
 *    `i+23` (i∈19..28).
 *  · ISSUE-2a: hai dải 乳歯 trên đè nhau tại slot 42 (13+29 == 19+23 == 42) → cột
 *    `bnow.rn_11`. Hai răng khác nhau tranh một ô, dòng sau thắng.
 *  · ISSUE-2c: khi không có dòng `bnow`, WinForm chỉ `tblBNOW.Rows.Add()` vào
 *    DataTable trong bộ nhớ rồi UPDATE — trúng 0 dòng, không exception, không cảnh
 *    báo. pat_info và misou thì CÓ fallback insert. Ba bảng ba kiểu là do WinForm.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU MASTER (tenant1, version_id 58, hiệu lực từ 2026-06-01)
 * ═════════════════════════════════════════════════════════════════════════════
 *   251 / 0  ｲﾝﾚｰ(パ･前小･単)  res_kind 11
 *   251 / 2  3/4冠(パ･前)      res_kind 12   ← khác 11 để phân biệt ai thắng ở TC-L3
 *   213 / 0  補管(冠)
 * res_kind 11 và 12 đều rơi vào nhánh "その他の修復物" (không phải ダミー 31-33,
 * không phải Br 34-44) nên nhận MỌI giá trị 部位 — đúng thứ cần cho TC-L3.
 * Đổi tenant thì tra lại bằng:
 *   select trt_cd, trt_sb, trt_nm, res_kind from mst_trt
 *    where version_id = <ver> and res_kind <> 0;
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY
 * ═════════════════════════════════════════════════════════════════════════════
 *   cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/p0-oral-chart-let-bnow.spec.ts
 *
 * ENV: TEST_PAT_NO (mặc định 12138) · TEST_TRT_DT (mặc định hôm nay) ·
 *      TEST_ALLOW_SAVE=1 và TEST_DB=1 đều BẮT BUỘC.
 *
 * ⚠️ RỦI RO: mỗi F9 ghi lại CẢ THÁNG của bệnh nhân. TC-L4 còn XOÁ dòng `bnow`
 *    (khôi phục ở afterAll, và snapshot in ra stdout ở beforeAll để cứu tay).
 *    Trỏ TEST_PAT_NO vào bệnh nhân test, đừng dùng dữ liệu thật.
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'

const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

// ─── 処置 đem thử ─────────────────────────────────────────────────────────────
const RES_TRT_CD = 251
const RES_SB_A = 0
const RES_SB_B = 2
/** res_kind kỳ vọng của 251/0 và 251/2 — TC-L0 xác minh lại với DB. */
const RES_KIND_A = 11
const RES_KIND_B = 12
const HOKAN_TRT_CD = 213
const HOKAN_SB = 0

/** Ô 部位 dùng cho răng vĩnh viễn (map 1:1 sang slot cùng index). */
const PERM_CELL = 0
/** Giá trị 部位 răng vĩnh viễn (1..9). */
const PERM_BUI = 1

/**
 * Hai ô 部位 răng sữa cùng đổ vào slot 42 — trái tim của ISSUE-2a.
 *   13 + 29 = 42   và   19 + 23 = 42
 * slot 42 nằm ở nửa 乳歯 (32..51) ⇒ cột bnow.rn_(42 - 32 + 1) = rn_11.
 */
const MILK_CELL_A = 13
const MILK_CELL_B = 19
const MILK_BUI = 11
const COLLIDING_RN_COL = 11

const NM = {
    resA: 'ｲﾝﾚｰ-P0テスト',
    resB: '3/4冠-P0テスト',
    hokan: '補管-P0テスト',
} as const

const ALL_TEST_TRT_CDS = [RES_TRT_CD, HOKAN_TRT_CD] as const

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3
const SAVE_TIMEOUT = 60_000

const SHOT_DIR = 'capture-results/p0-oral-chart'

const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

/** 32 ô 部位, đặt `value` vào đúng `index`. */
function buiAt(index: number, value: number): number[] {
    const bui = Array.from({ length: 32 }, () => 0)
    bui[index] = value
    return bui
}

// ═════════════════════════════════════════════════════════════════════════════
// Truy vấn DB riêng của spec (db.ts chưa có helper cho bnow / pat_info / misou)
// ═════════════════════════════════════════════════════════════════════════════

/** `version_id` của master 処置 có hiệu lực tại `onDate` — cùng cách BE resolve. */
async function trtVersionIdFor(onDate: string): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query<{ version_id: number }>(
            `SELECT version_id FROM mst_trt_ver
              WHERE start_date <= $1::date AND end_date >= $1::date AND deleted_at IS NULL
              LIMIT 1`,
            [onDate],
        )
        return r.rows[0]?.version_id ?? null
    })
}

async function resKindOf(versionId: number, trtCd: number, trtSb: number): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query<{ res_kind: number }>(
            `SELECT res_kind FROM mst_trt
              WHERE version_id = $1 AND trt_cd = $2 AND trt_sb = $3 AND deleted_at IS NULL`,
            [versionId, trtCd, trtSb],
        )
        return r.rows[0]?.res_kind ?? null
    })
}

async function masterExists(versionId: number, trtCd: number, trtSb: number): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM mst_trt
              WHERE version_id = $1 AND trt_cd = $2 AND trt_sb = $3 AND deleted_at IS NULL`,
            [versionId, trtCd, trtSb],
        )
        return (r.rows[0]?.n ?? 0) > 0
    })
}

/** Một cột `re_n` / `rn_n` của `bnow`; null khi bệnh nhân chưa có dòng nào. */
async function bnowCell(patNo: number, col: string): Promise<number | null> {
    if (!/^(re|rn)_\d{1,2}$/.test(col)) throw new Error(`bnowCell: cột không hợp lệ "${col}"`)
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT ${col} AS v FROM bnow WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo],
        )
        return r.rows.length === 0 ? null : Number(r.rows[0]?.['v'] ?? 0)
    })
}

async function countBnow(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM bnow WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        return r.rows[0]?.n ?? 0
    })
}

/** Toàn bộ re_1..32 + rn_1..20, để snapshot/khôi phục. */
async function readBnow(patNo: number): Promise<Record<string, number> | null> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            'SELECT * FROM bnow WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        const row = r.rows[0]
        if (!row) return null
        const out: Record<string, number> = {}
        for (let i = 1; i <= 32; i++) out[`re_${i}`] = Number(row[`re_${i}`] ?? 0)
        for (let i = 1; i <= 20; i++) out[`rn_${i}`] = Number(row[`rn_${i}`] ?? 0)
        return out
    })
}

/**
 * Đưa mọi ô `re_*` / `rn_*` về 0 (tạo dòng nếu chưa có).
 *
 * BẮT BUỘC gọi trước mỗi TC soi `bnow`. `afterAll` chỉ chạy MỘT lần ở cuối file, mà
 * `Let_BNOW` **không bao giờ ghi số 0** (đúng parity: chỉ đè ô có giá trị mới) nên
 * kết quả của TC trước nằm lại nguyên trong bảng và TC sau đọc phải rác của nó.
 * Đã vấp thật: TC-L3 từng đỏ vì đọc được `re_1 = 11` do TC-L2 để lại.
 */
async function zeroBnow(patNo: number): Promise<void> {
    const setList = [
        ...Array.from({ length: 32 }, (_, i) => `re_${i + 1} = 0`),
        ...Array.from({ length: 20 }, (_, i) => `rn_${i + 1} = 0`),
    ].join(', ')
    await withDb(async (c) => {
        const exists = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM bnow WHERE pat_no = $1',
            [patNo],
        )
        if ((exists.rows[0]?.n ?? 0) === 0) {
            await c.query('INSERT INTO bnow (pat_no) VALUES ($1)', [patNo])
        }
        await c.query(`UPDATE bnow SET ${setList} WHERE pat_no = $1`, [patNo])
    })
}

async function deleteBnow(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM bnow WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

async function restoreBnow(patNo: number, snap: Record<string, number>): Promise<void> {
    const cols = Object.keys(snap)
    const setList = cols.map((k, i) => `${k} = $${i + 2}`).join(', ')
    await withDb(async (c) => {
        const exists = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM bnow WHERE pat_no = $1',
            [patNo],
        )
        if ((exists.rows[0]?.n ?? 0) === 0) {
            await c.query('INSERT INTO bnow (pat_no) VALUES ($1)', [patNo])
        }
        await c.query(`UPDATE bnow SET ${setList} WHERE pat_no = $1`, [
            patNo,
            ...cols.map((k) => snap[k]),
        ])
    })
}

/** Một cột `hokan_n` của `pat_info` (kiểu date), trả 'YYYY-MM-DD' hoặc null. */
async function hokanCell(patNo: number, n: number): Promise<string | null> {
    if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error(`hokanCell: hokan_${n} ngoài 1..32`)
    return withDb(async (c) => {
        const r = await c.query<{ v: string | null }>(
            `SELECT to_char(hokan_${n}, 'YYYY-MM-DD') AS v
               FROM pat_info WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo],
        )
        return r.rows.length === 0 ? null : (r.rows[0]?.v ?? null)
    })
}

async function clearHokan(patNo: number): Promise<void> {
    const setList = Array.from({ length: 32 }, (_, i) => `hokan_${i + 1} = NULL`).join(', ')
    await withDb(async (c) => {
        await c.query(`UPDATE pat_info SET ${setList} WHERE pat_no = $1`, [patNo])
    })
}

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(!dbEnabled, 'Cần TEST_DB=1: mọi assert của spec này soi thẳng Postgres')
skipWithReason(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: spec bấm F9 登録 nên GHI DB thật')

test.describe.configure({ mode: 'default', retries: 0, timeout: 300_000 })

test.describe('診療入力 F9 登録 — LetHokan / Let_BNOW (口腔内チャート)', () => {
    let page: Page
    let step: () => Promise<void>

    let versionId = 0
    /** Nguyên trạng `bnow` — TC-L4 xoá dòng này, afterAll trả lại. */
    let bnowBefore: Record<string, number> | null = null

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
                console.log(`openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} hỏng — nạp lại`)
            }
        }
        throw lastErr
    }

    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        for (const trtCd of ALL_TEST_TRT_CDS) {
            n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, trtCd).catch(() => 0)
        }
        return n
    }

    async function resetMonthTo(rows: Parameters<typeof seedTreatmentRows>[2]) {
        await purgeTestRows()
        await clearHokan(Number(PAT_NO))
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, rows)
        await openTreatmentScreen()
        await step()
    }

    async function pressF9AndSave(): Promise<void> {
        const pending = page.waitForResponse(
            (r) => r.url().includes('/tenant/treatment/bulk-save') && r.request().method() === 'POST',
            { timeout: SAVE_TIMEOUT },
        )
        await page.keyboard.press('F9')
        await step()
        await page.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click()
        await step()

        const resp = await pending
        if (resp.status() >= 300) {
            console.log(`bulk-save ${resp.status()} body: ${await resp.text().catch(() => '(unreadable)')}`)
        }
        expect(resp.status(), 'POST bulk-save không trả 2xx').toBeLessThan(300)
    }

    /** Ảnh chứng minh — lưu vào capture-results/ để đối chiếu với WinForm. */
    async function shot(name: string) {
        await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false })
    }

    test.beforeAll(async ({ browser }) => {
        const firstOfMonth = `${TRT_DT.slice(0, 8)}01`
        versionId = (await trtVersionIdFor(firstOfMonth)) ?? 0
        bnowBefore = await readBnow(Number(PAT_NO))
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)

        console.log(`master 処置 version_id có hiệu lực tại ${firstOfMonth}: ${versionId}`)
        if (bnowBefore) {
            const nonZero = Object.entries(bnowBefore).filter(([, v]) => v !== 0)
            console.log(
                `bnow nguyên trạng của ${PAT_NO} (LƯU LẠI phòng khi test bị kill): ` +
                    (nonZero.length === 0 ? '(toàn 0)' : JSON.stringify(Object.fromEntries(nonZero))),
            )
        } else {
            console.log(`⚠️ bệnh nhân ${PAT_NO} vốn KHÔNG có dòng bnow`)
        }
        if (realRows > 0) {
            console.log(
                `⚠️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT — mỗi F9 ghi lại toàn bộ.`,
            )
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 60 },
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
        const n = await purgeTestRows()
        await clearHokan(Number(PAT_NO))
        if (bnowBefore) await restoreBnow(Number(PAT_NO), bnowBefore)
        console.log(`dọn: xoá ${n} 処置行 test, hokan_* về NULL, bnow về nguyên trạng`)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-L0 (mốc) — master tháng test có đủ mã đem thử', async () => {
        expect(versionId, `không tìm được mst_trt_ver cho ${TRT_DT.slice(0, 7)}`).toBeGreaterThan(0)

        expect
            .soft(await resKindOf(versionId, RES_TRT_CD, RES_SB_A), `${RES_TRT_CD}/${RES_SB_A} res_kind`)
            .toBe(RES_KIND_A)
        expect
            .soft(await resKindOf(versionId, RES_TRT_CD, RES_SB_B), `${RES_TRT_CD}/${RES_SB_B} res_kind`)
            .toBe(RES_KIND_B)
        expect
            .soft(await masterExists(versionId, HOKAN_TRT_CD, HOKAN_SB), `${HOKAN_TRT_CD}/${HOKAN_SB}`)
            .toBe(true)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-L1 — LetHokan: trt_cd 213 ghi 補綴日 vào pat_info.hokan_n', async () => {
        await resetMonthTo([
            {
                trtCd: HOKAN_TRT_CD,
                trtSb: HOKAN_SB,
                trtCnt: 1,
                trtPt: 100,
                dspTrt: NM.hokan,
                bui: buiAt(PERM_CELL, PERM_BUI),
                dspBui: '右上1',
            },
        ])
        await pressF9AndSave()
        await shot('tc-l1-after-save')

        expect
            .soft(
                await hokanCell(Number(PAT_NO), PERM_CELL + 1),
                `ô 部位 index ${PERM_CELL} → hokan_${PERM_CELL + 1} phải = ${TRT_DT} ` +
                    '(modSave.cs:2124 LetHokan)',
            )
            .toBe(TRT_DT)

        expect
            .soft(await hokanCell(Number(PAT_NO), 20), 'ô không nhập gì thì hokan phải để NULL')
            .toBeNull()
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-L2 — Let_BNOW: res_kind ghi vào bnow.re_n và 装着日 vào pat_info', async () => {
        await zeroBnow(Number(PAT_NO))
        await resetMonthTo([
            {
                trtCd: RES_TRT_CD,
                trtSb: RES_SB_A,
                trtCnt: 1,
                trtPt: 583,
                dspTrt: NM.resA,
                bui: buiAt(PERM_CELL, PERM_BUI),
                dspBui: '右上1',
            },
        ])
        await pressF9AndSave()
        await shot('tc-l2-after-save')

        expect
            .soft(
                await bnowCell(Number(PAT_NO), `re_${PERM_CELL + 1}`),
                `修復物 ${RES_TRT_CD}/${RES_SB_A} (res_kind ${RES_KIND_A}) phải vào ` +
                    `bnow.re_${PERM_CELL + 1} (modSave.cs:1512 Let_BNOW)`,
            )
            .toBe(RES_KIND_A)

        expect
            .soft(
                await hokanCell(Number(PAT_NO), PERM_CELL + 1),
                'Let_BNOW cũng ghi 装着日 vào pat_info.hokan_n cho slot có 修復物',
            )
            .toBe(TRT_DT)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test(`TC-L3 — 🐛 ISSUE-2a: ô 部位 ${MILK_CELL_A} và ${MILK_CELL_B} cùng đổ vào slot 42`, async () => {
        // 13 + 29 = 42 và 19 + 23 = 42. Hai răng sữa khác nhau tranh cùng cột
        // bnow.rn_11 → dòng sau thắng, răng còn lại mất 修復物.
        // 🐛 Bug của WinForm, port nguyên theo quyết định 2026-08-10. KHÔNG sửa assert.
        await zeroBnow(Number(PAT_NO))
        await resetMonthTo([
            {
                trtCd: RES_TRT_CD,
                trtSb: RES_SB_A,
                trtCnt: 1,
                trtPt: 583,
                dspTrt: NM.resA,
                bui: buiAt(MILK_CELL_A, MILK_BUI),
                dspBui: '乳歯A',
            },
            {
                trtCd: RES_TRT_CD,
                trtSb: RES_SB_B,
                trtCnt: 1,
                trtPt: 1333,
                dspTrt: NM.resB,
                bui: buiAt(MILK_CELL_B, MILK_BUI),
                dspBui: '乳歯B',
            },
        ])
        await pressF9AndSave()
        await shot('tc-l3-collision-after-save')

        expect
            .soft(
                await bnowCell(Number(PAT_NO), `rn_${COLLIDING_RN_COL}`),
                `slot 42 → rn_${COLLIDING_RN_COL}: dòng SAU (res_kind ${RES_KIND_B}) thắng`,
            )
            .toBe(RES_KIND_B)

        // Không ô 乳歯 nào giữ res_kind của dòng trước — đó chính là dữ liệu bị mất.
        // Chỉ soi nửa 乳歯 (rn_*): răng bị mất là răng sữa, và nửa 永久歯 có thể mang
        // dữ liệu thật của bệnh nhân không liên quan tới TC này.
        const all = await readBnow(Number(PAT_NO))
        const holdingA = Object.entries(all ?? {}).filter(
            ([col, v]) => col.startsWith('rn_') && v === RES_KIND_A,
        )
        expect
            .soft(
                holdingA,
                `🐛 parity: res_kind ${RES_KIND_A} của răng ở ô ${MILK_CELL_A} bị ghi đè, ` +
                    'không còn ô nào giữ nó. Nếu vế này ĐỎ nghĩa là ai đó đã SỬA bug — ' +
                    'đọc userapp/inp-parity-bugs-reproduction.md trước khi đổi assert.',
            )
            .toHaveLength(0)
    })

    // ─────────────────────────────────────────────────────────────────────────
    test('TC-L4 — 🐛 ISSUE-2c: không có dòng bnow → mất sạch 修復物, KHÔNG báo lỗi', async () => {
        await deleteBnow(Number(PAT_NO))
        expect(await countBnow(Number(PAT_NO)), 'tiền đề: bệnh nhân phải KHÔNG có dòng bnow').toBe(0)

        await resetMonthTo([
            {
                trtCd: RES_TRT_CD,
                trtSb: RES_SB_A,
                trtCnt: 1,
                trtPt: 583,
                dspTrt: NM.resA,
                bui: buiAt(PERM_CELL, PERM_BUI),
                dspBui: '右上1',
            },
        ])

        // Lưu vẫn 2xx — đó chính là chỗ nguy hiểm: người dùng thấy thành công.
        await pressF9AndSave()
        await shot('tc-l4-silent-loss-after-save')

        expect
            .soft(
                await countBnow(Number(PAT_NO)),
                '🐛 parity: WinForm chỉ Rows.Add() vào DataTable rồi UPDATE trúng 0 dòng ⇒ ' +
                    'không tạo dòng bnow, 修復物 mất trắng, không exception. Nếu vế này ĐỎ ' +
                    '(đã có dòng) nghĩa là ai đó thêm INSERT fallback — đổi phạm vi, đọc ' +
                    'userapp/inp-parity-bugs-reproduction.md.',
            )
            .toBe(0)

        // Đối chứng cho thấy mất dữ liệu là THẬT: 処置行 lưu được bình thường.
        expect
            .soft(
                await hokanCell(Number(PAT_NO), PERM_CELL + 1),
                'pat_info CÓ fallback insert nên 装着日 vẫn ghi được — chỉ bnow là mất',
            )
            .toBe(TRT_DT)
    })
})
