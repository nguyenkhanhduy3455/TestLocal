import { type Locator, type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from '../_shared/session'

import { SEED_PAT_NO_BASE, dbEnabled, deleteTestPatient, seedTestPatient, withDb } from '../_shared/db'
import { TODAY_ISO } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { makeStep } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * Ô 検索 theo tên phải khớp KHÔNG phân biệt hoa/thường, độ rộng (全角/半角) và
 * hiragana/katakana — như WinForm, vì WinForm chạy `LIKE` trên SQL Server collation
 * `Japanese_CI_AS` (đo 2026-10-05 trên SIM2000: database + cột TRT_NM/CCT_NM đều
 * Japanese_CI_AS). Postgres `LIKE` so từng code point nên bản port thô sót dòng.
 *
 * Bug gốc (2026-10-05): tab 個別, 名称 = 「CT」 — WinForm ra 38 dòng (MST_TRT269),
 * web chỉ 4 dòng (đúng 4 dòng chứa chữ 「CT」 ASCII).
 *
 * ─── Nguồn WinForm ↔ query web đã sửa (dùng JapaneseTextMatch) ───────────────
 *  - 個別:      frm203002.GetWhereKobeNyuryokuInfo + modKobetu.GetTrt
 *               ↔ MstTrtQueries.BuildWhere (GET /tenant/mst-trt?name=)
 *  - 病名選択:  MstDis.cs:277 `dis_nm like OR cct_nm like`
 *               ↔ MstDisQueries.ListParentsAsync (GET /tenant/mst-dis?q=)
 *  - 物販:      MstGoods.cs:144 ↔ GoodsQueries.GetGoodsListAsync (GET /tenant/goods?goodsNm=)
 *  - 地方公費:  PmhMstLocalPubexp.cs:352
 *               ↔ LocalPubexpSettingsQueries (GET /tenant/local-pubexp-settings?projectNameKeyword=)
 *  - 患者検索:  PatInfoList.cs:117 (prefix / token sau dấu cách)
 *               ↔ PatientsQueries (GET /tenant/patients?patKn=). Chữ gõ vào đã được
 *               ListPatientsHandler đổi sang 半角カナ; lệch còn lại là pat_kn lưu 全角 /
 *               ひらがな (dev DB có 6/21.778 dòng như vậy).
 *
 * ─── Dữ liệu ──────────────────────────────────────────────────────────────────
 *  Đọc master/bệnh nhân THẬT của dev DB (chỉ đọc). Mốc kỳ vọng là các dòng mà
 *  bản thô bỏ sót — đo trên SQL Server/Postgres ngày 2026-10-05. Bệnh nhân seed
 *  (SEED_PAT_NO_BASE + 82) để mở màn 診療入力 cho tab 個別 và làm ca 患者検索 (pat_kn
 *  ひらがな); xoá ở afterAll.
 *
 *   npx playwright test tests/cross-cutting/japanese-fold-search.spec.ts
 */

const PAT_NO = SEED_PAT_NO_BASE + 82

/**
 * Dòng 地方公費 seed (hiragana) cho ca 「ヒトリ」: master dev có thể trống bảng này nên
 * spec tự dựng đúng dòng nó cần, xoá ở afterAll (kể cả bản archive `_deleted`).
 */
const LOCAL_PUBEXP_NAME = 'ひとり親家庭等医療費助成(E2E)'
let localPubexpId: string | null = null

/** (trt_cd, trt_sb) mà 「CT」 bản thô bỏ sót — toàn 全角 hoặc chữ thường. */
const KOBE_CT_MISSED: { key: string; nm: string }[] = [
    { key: '139-0', nm: 'ＣＴ電' },
    { key: '183-0', nm: 'ＧＥｃｔ' },
    { key: '219-8', nm: 'ＣＴＧ' },
    { key: '310-1', nm: 'OA+ｵｰﾗ注歯科用Ct 1.0mL 1mL' },
    { key: '334-4', nm: 'ＩＣＴ加算' },
]
/** Số dòng bản thô trả về cho 「CT」 — list sau khi sửa phải nhiều hơn hẳn. */
const KOBE_CT_RAW_COUNT = 4

const GRID_LOAD_TIMEOUT = 60_000

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân mở màn 診療入力')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('検索 theo tên — khớp như Japanese_CI_AS (JapaneseTextMatch)', () => {
    let page: Page
    let step: () => Promise<void>
    let sidePanel: Locator
    let disposeOverlays: (() => Promise<void>) | undefined
    let apiOrigin = ''
    let authHeaders: Record<string, string> = {}

    async function apiGet(path: string): Promise<unknown> {
        expect(apiOrigin, 'chưa bắt được request nào của app để lấy origin + token').not.toBe('')
        const res = await page.request.get(`${apiOrigin}${path}`, { headers: authHeaders })
        expect(res.ok(), `${path} → ${res.status()}: ${await res.text()}`).toBe(true)
        return (await res.json()).data
    }

    test.beforeAll(async ({ authedPage }) => {
        await seedTestPatient({ patNo: PAT_NO })
        localPubexpId = await withDb(async (c) => {
            const r = await c.query<{ id: string }>(
                `INSERT INTO mst_pmh_local_pubexp (project_name_full, project_name_short)
                 VALUES ($1, $1) RETURNING id`,
                [LOCAL_PUBEXP_NAME],
            )
            return r.rows[0]!.id
        })
        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            const h = req.headers()
            if (i < 0 || !h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept'),
            )
        })

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TODAY_ISO}`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('[data-grid-cell$="|2"]').first()).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
        await closeDialogs(page)
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
        await deleteTestPatient(PAT_NO).catch(() => {})
        if (localPubexpId !== null) {
            const id = localPubexpId
            await withDb(async (c) => {
                await c.query('DELETE FROM mst_pmh_local_pubexp WHERE id = $1', [id])
                await c.query('DELETE FROM mst_pmh_local_pubexp_deleted WHERE id = $1', [id])
            }).catch(() => {})
        }
    })

    test('TC-1 — tab 個別, 名称 「CT」 ra cả dòng 全角/chữ thường (GetWhereKobeNyuryokuInfo)', async () => {
        await sidePanel.getByRole('button', { name: '個別', exact: true }).click()
        const nameInput = sidePanel.locator('span', { hasText: /^名称$/ }).locator('xpath=following-sibling::input[1]')
        await nameInput.fill('CT')
        const resp = page.waitForResponse((r) => r.url().includes('/tenant/mst-trt') && r.url().includes('name=CT'))
        await sidePanel.getByRole('button', { name: '検索' }).click()
        await resp

        const rows = sidePanel.locator('div[data-index]')
        await expect(rows.first()).toBeVisible({ timeout: 15_000 })
        const shown = await rows.count()

        // List ảo chỉ render dòng trong khung nhìn ⇒ so bộ đầy đủ qua chính endpoint đó.
        const data = (await apiGet('/tenant/mst-trt?name=CT&page=1&pageSize=500')) as {
            items: { trtCd: number | string; trtSb: number | string }[]
        }
        const keys = new Set(data.items.map((r) => `${Number(r.trtCd)}-${Number(r.trtSb)}`))
        console.log(`個別 「CT」: list hiện ${shown} dòng, API ${keys.size} dòng`)

        expect.soft(shown, `list 個別 vẫn chỉ ${KOBE_CT_RAW_COUNT} dòng như bản thô`).toBeGreaterThan(KOBE_CT_RAW_COUNT)
        for (const m of KOBE_CT_MISSED) {
            expect.soft(keys.has(m.key), `thiếu ${m.key} 「${m.nm}」`).toBe(true)
        }
        await step()
    })

    test('TC-2 — API: 病名 / 物販 / 地方公費 / 患者 cũng khớp như Japanese_CI_AS', async () => {
        await test.step('病名選択 q=「c」 ra 「Ｃ」(100) và 「Ｃｅ」(119) (MstDis.cs:277)', async () => {
            const dis = (await apiGet('/tenant/mst-dis?q=c')) as { disCd: number | string }[]
            const cds = dis.map((d) => Number(d.disCd))
            console.log(`病名 「c」: ${cds.length} dòng`)
            expect.soft(cds, '病名 「Ｃ」 (100)').toContain(100)
            expect.soft(cds, '病名 「Ｃｅ」 (119)').toContain(119)
        })

        await test.step('物販 goodsNm=「ml」 ra 「ハビットプロ　380ｍｌ」(800) (MstGoods.cs:144)', async () => {
            const goods = (await apiGet('/tenant/goods?goodsNm=ml&page=1&pageSize=200')) as {
                items: { goodsCd: number | string }[]
            }
            const cds = goods.items.map((g) => Number(g.goodsCd))
            console.log(`物販 「ml」: ${cds.length} dòng`)
            expect.soft(cds, '物販 800 「ハビットプロ　380ｍｌ」').toContain(800)
        })

        await test.step('地方公費 「ヒトリ」 ra các dòng 「ひとり親…」 (PmhMstLocalPubexp.cs:352)', async () => {
            const lp = (await apiGet(
                `/tenant/local-pubexp-settings?projectNameKeyword=${encodeURIComponent('ヒトリ')}&page=1&pageSize=50`,
            )) as { items: unknown[] }
            console.log(`地方公費 「ヒトリ」: ${lp.items.length} dòng`)
            expect.soft(lp.items.length, 'katakana 「ヒトリ」 phải khớp hiragana 「ひとり親」').toBeGreaterThan(0)
        })

        await test.step('患者 — pat_kn lưu dạng KHÔNG phải 半角 vẫn tìm được (PatInfoList.cs:117)', async () => {
            // ListPatientsHandler đã đổi chữ gõ vào sang 半角カナ, nên bệnh nhân lưu 半角
            // vốn tìm được. Chỗ còn lệch là pat_kn lưu dạng khác (nhập tay 全角 / ひらがな):
            // bệnh nhân seed lưu 「いーつーいーてすとかんじゃ」 (ひらがな, mặc định của
            // seedTestPatient) — WinForm vẫn tìm ra nhờ collation.
            const pats = (await apiGet(
                `/tenant/patients?patKn=${encodeURIComponent('いーつーいーてすと')}&page=1&pageSize=200`,
            )) as { items: { patNo: number | string }[] }
            const nos = pats.items.map((x) => Number(x.patNo))
            console.log(`患者 「いーつーいーてすと」: ${nos.length} dòng`)
            expect.soft(nos, `bệnh nhân ${PAT_NO} (pat_kn ひらがな) phải ra`).toContain(PAT_NO)
        })
        await step()
    })
})
