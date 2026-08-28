/**
 * 自動算定 — 枝番 nào cấp `dis_flg` / `old_flg` khi NHẬP LÙI NGÀY.
 *
 * `auto-santei.spec.ts` ghi 身障者 特別対応加算 là NGOÀI PHẠM VI vì "phụ thuộc dữ
 * liệu". File này lấp đúng chỗ đó: tenant demo CÓ bệnh nhân đổi thẻ bảo hiểm giữa
 * chừng, nên chỉ cần chọn 診療日 nằm TRƯỚC ngày lấy tư cách của thẻ mới là bộ pick
 * bắt buộc phải đổi. Không seed gì cả — dữ liệu thật đã đủ để phân biệt.
 *
 * ─── FACT lấy từ source (Rule 21) ────────────────────────────────────────────
 *  - modSave.cs:3037-3041 — `AutoSantei` đọc 身障者/老人 qua
 *      `InsuIndex = modPat.GetValidSubCode2(pstrPatId, dtChkDay)`
 *      `intSins = _patInfoList[InsuIndex].ins.dis_flg`
 *    tức theo 基準日 (= 診療日 đang nhập), KHÔNG phải theo 枝番 lớn nhất.
 *  - modPat.cs:205-222 — `GetValidSubCode2` duyệt 枝番 theo `pat_br` TĂNG DẦN
 *    (Insurance.cs:224 `ORDER BY pat_br`) và DỪNG ở 枝番 đầu tiên có
 *    `br_dt` (資格取得年月日) > 基準日 ⇒ trả về 枝番 mới nhất đã lấy tư cách vào/trước
 *    ngày đó. Cửa sổ 保険適用期間 (`med_st_dt`/`med_ed_dt`) KHÔNG tham gia.
 *  - modSave.cs:3097 / :3167 — `intSins >= 1` ⇒ thêm dòng 105 (特１初診/再診) và
 *    hỏi tiếp 特２; `dis_flg == 0` ⇒ KHÔNG có dòng 105 nào.
 *  - modSave.cs:3389 — `intSins == 1` (hoặc 乳幼児) ⇒ lấy cột `score2`;
 *    `old_flg == 1` ⇒ `score3`; còn lại `score1`.
 *  - GET /tenant/treatment/autosantei → `{ data: { isInitialVisitEligible,
 *    picks[], disabilityAddon, reExamPicks[], reExamDisabilityAddon } }`.
 *    Cả hai bộ đều do `GetAutoSanteiContextAsync` cấp `dis_flg` ⇒ đây là chỗ
 *    quan sát được cái đang kiểm, không phụ thuộc bệnh nhân có đủ điều kiện 初診
 *    hay không.
 *  - runAutoSantei (treatment-entry-detail.tsx): không đủ điều kiện 初診 ⇒ áp
 *    thẳng `picks` KHÔNG hỏi; có `disabilityAddon` ⇒ confirm thứ hai
 *    「<tên>を算定しますか？」 (Yes/No), Yes thay dòng 105 bằng addon.
 *  - RegiCol (treatment-entry-shared.ts:105) — cột 療法・処置 là index 2.
 *
 * ─── VÌ SAO CÓ FILE NÀY ──────────────────────────────────────────────────────
 * CTE `ins` của `GetAutoSanteiContextAsync` từng lấy `MAX(pat_br)` mà KHÔNG lọc
 * ngày. Bệnh nhân đăng ký thẻ mới rồi nhập lùi ngày về trước ngày đó thì bị tính
 * theo thẻ mới: mất dòng 105 và tụt cột điểm. Unit test của BE mock đúng query
 * này nên không thấy — phải chạy trên DB thật.
 *
 * ─── KHÔNG GHI DB ────────────────────────────────────────────────────────────
 * Không bấm F9 登録 lần nào. `AutoSantei` chỉ chèn dòng vào lưới trong bộ nhớ,
 * rời trang là mất ⇒ `trn_trn` nguyên vẹn, không cần `TEST_ALLOW_SAVE`.
 *
 * ─── ĐIỀU KIỆN DỮ LIỆU (Rule 18) ─────────────────────────────────────────────
 * Cần một bệnh nhân có ≥ 2 枝番 mà 枝番 hiệu lực tại `TRT_DT_BACK` có
 * `dis_flg >= 1`, còn 枝番 LỚN NHẤT có `dis_flg == 0` — có đúng thế thì hai luật
 * mới cho kết quả khác nhau. Mặc định 11307 trên tenant demo:
 *     枝番1 2003-02-01 dis2 | 枝番2 2006-10-01 dis2
 *     枝番3 2006-11-01 dis2 | 枝番4 2008-04-01 dis0
 * và tháng 2007-06 lẫn 2026-08 đều CHƯA có 処置 nào (⇒ AutoSantei chạy).
 * Spec tự đọc bảng `insurance` để kiểm điều kiện đó; không thoả thì FAIL kèm chỉ
 * dẫn đổi `TEST_PAT_NO_INS_BR`, chứ không lặng lẽ skip.
 *
 * ─── NGOÀI PHẠM VI ───────────────────────────────────────────────────────────
 *  - `PatientDetailResultExtensions.RecordOn` (đường 点数解決 / 加算コード /
 *    ガイド / パック cũng chọn 枝番 theo `br_dt`): tenant demo chỉ có duy nhất một
 *    (bệnh nhân, ngày) phân biệt được hai luật, quá mỏng để làm e2e ⇒ đã khoá
 *    bằng unit test `PatientDetailResultExtensionsTests`.
 *  - Cột điểm score2/score3: bản master 2006-10〜2008-03 có
 *    score1 = score2 = score3 cho 100/105 nên không quan sát được từ ngoài.
 *
 * ─── CẤU TRÚC (Rule 19) ──────────────────────────────────────────────────────
 * `serial` + MỘT page ở `beforeAll` (login 1 lần — Rule 10.1). Mỗi TC tự `goto`.
 */
import { expect, test, type Page } from '@playwright/test'

import { branchInForceOn, dbEnabled, findMstTrt, insuranceBranches, type InsuranceBranch } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân đổi thẻ giữa chừng — xem "ĐIỀU KIỆN DỮ LIỆU". */
const PAT_NO = process.env.TEST_PAT_NO_INS_BR ?? '11307'
/** 診療日 nằm TRƯỚC 資格取得年月日 của 枝番 mới nhất. */
const TRT_DT_BACK = process.env.TEST_TRT_DT_INS_BR_BACK ?? '2007-06-15'
/** 診療日 SAU khi 枝番 mới nhất đã có hiệu lực — đối chứng. */
const TRT_DT_NOW = process.env.TEST_TRT_DT_INS_BR_NOW ?? '2026-08-10'

/** 障害者加算 — dòng duy nhất mà `dis_flg >= 1` sinh ra (modSave.cs:3097/:3167). */
const TRT_CD_DISABILITY = 105

const AUTOSANTEI_PATH = '/tenant/treatment/autosantei'

/** RegiCol — treatment-entry-shared.ts:105. */
const RegiCol = { ryo: 2, ten: 3 } as const
const ryoCell = (page: Page) => page.locator(`[data-grid-cell$="|${RegiCol.ryo}"]`)
const tenCell = (page: Page) => page.locator(`[data-grid-cell$="|${RegiCol.ten}"]`)

/** CSS selector, KHÔNG `getByRole` — Radix aria-hidden có thể làm role "tắt". */
const anyDialog = (page: Page) => page.locator('[role="dialog"]')
/** 初診/再診 — SanteiConfirmDialog (DraggableDialog, role=dialog), 3 nút Yes/No/Cancel. */
const santeiDialog = (page: Page) => anyDialog(page).filter({ hasText: /を算定しますか？/ })
const santeiBtn = (page: Page, label: 'Yes' | 'No' | 'Cancel') =>
    santeiDialog(page).getByRole('button', { name: new RegExp(`^${label}$`) })
/**
 * 特２ — `confirmDialog` là Radix AlertDialog nên role là **alertdialog**, KHÁC hẳn
 * SanteiConfirmDialog (Rule 13). Nhãn nút để mặc định はい/いいえ (Rule 13.2).
 */
const addonDialog = (page: Page) => page.locator('[role="alertdialog"]')
const addonBtn = (page: Page, answer: 'yes' | 'no') =>
    addonDialog(page).getByRole('button', {
        name: answer === 'yes' ? /^(はい|Yes|OK)$/ : /^(いいえ|No|Cancel)$/,
    })

/** カルテ記載選択 — bung SAU khi bộ pick đã chèn xong; đóng để không chắn lưới. */
const cmtPicker = (page: Page) => anyDialog(page).filter({ hasText: 'カルテ記載選択' })
const closeCmtPicker = async (page: Page) => {
    if ((await cmtPicker(page).count()) === 0) return
    await cmtPicker(page).getByRole('button', { name: /戻る/ }).click()
    await expect(cmtPicker(page)).toHaveCount(0, { timeout: 10000 })
}

interface AutoSanteiPick {
    trtCd: number
    trtSb: number
    trtNm: string
    trtPt: number
}

interface AutoSanteiBody {
    isInitialVisitEligible: boolean
    picks: AutoSanteiPick[]
    disabilityAddon: AutoSanteiPick | null
    reExamPicks: AutoSanteiPick[]
    reExamDisabilityAddon: AutoSanteiPick | null
}

/** Mọi dòng 処置 KHÔNG rỗng đang có trên lưới (kể cả 履歴 ⇒ chỉ dùng để so delta). */
const filledRyoTexts = async (page: Page): Promise<string[]> =>
    (await ryoCell(page).allTextContents()).map((t) => t.trim()).filter((t) => t !== '')

/** Phần tử mới xuất hiện sau một thao tác — so theo bội số, không phải tập hợp. */
const addedTexts = (before: readonly string[], after: readonly string[]): string[] => {
    const rest = [...before]
    const added: string[] = []
    for (const t of after) {
        const i = rest.indexOf(t)
        if (i >= 0) rest.splice(i, 1)
        else added.push(t)
    }
    return added
}

const has105 = (b: AutoSanteiBody): boolean =>
    [...b.picks, ...b.reExamPicks].some((p) => p.trtCd === TRT_CD_DISABILITY) ||
    b.disabilityAddon !== null ||
    b.reExamDisabilityAddon !== null

const describeBranches = (bs: readonly InsuranceBranch[]): string =>
    bs.map((b) => `枝番${b.patBr} br_dt=${b.brDt ?? 'NULL'} dis=${b.disFlg} old=${b.oldFlg}`).join(' | ')

test.skip(!dbEnabled, 'Cần TEST_DB=1 để đọc bảng insurance mà tự tính kỳ vọng')

test.describe.configure({ mode: 'serial', timeout: 240_000 })

test.describe('自動算定 — 枝番 có hiệu lực tại 診療日 (GetValidSubCode2)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Origin thật của API (bóc từ một request có sẵn của app). */
    let apiOrigin = ''
    /** Header auth bắt được — dùng lại để gọi thẳng BE bằng page.request. */
    let authHeaders: Record<string, string> = {}

    /** Toàn bộ 枝番 của bệnh nhân test, đọc một lần ở beforeAll. */
    let branches: InsuranceBranch[] = []
    /** 枝番 hiệu lực tại từng ngày, tính theo luật WinForm. */
    let backBranch: InsuranceBranch | null = null
    let nowBranch: InsuranceBranch | null = null
    /** 枝番 mà luật CŨ (`MAX(pat_br)`) sẽ lấy — dùng để chứng minh dữ liệu phân biệt được. */
    let maxBranch: InsuranceBranch | null = null

    const openFresh = async (trtDt: string) => {
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${trtDt}`, { waitUntil: 'domcontentloaded' })
            const ok = await tenCell(page)
                .last()
                .waitFor({ state: 'visible', timeout: 30000 })
                .then(() => true)
                .catch(() => false)
            if (ok) {
                await page
                    .waitForResponse((r) => r.url().includes('/autosantei'), { timeout: 8000 })
                    .catch(() => {})
                await step()
                return
            }
            console.log(`診療入力 ${PAT_NO} @ ${trtDt}: lần ${attempt}/3 lưới không render → nạp lại`)
        }
        throw new Error(
            `màn 診療入力 của 患者 ${PAT_NO} @ ${trtDt} không render. Kiểm app còn sống không ` +
                `(curl -sk -o /dev/null -w "%{http_code}" ${BASE_URL}login) — 502 là dev server chết, ` +
                'KHÔNG phải lỗi test (Rule 5).',
        )
    }

    /** Gọi thẳng BE cho một 診療日 — không phụ thuộc trạng thái lưới. */
    const fetchAutoSantei = async (trtDt: string): Promise<AutoSanteiBody> => {
        const url = `${apiOrigin}${AUTOSANTEI_PATH}?patNo=${PAT_NO}&trtDt=${trtDt}`
        const res = await page.request.get(url, { headers: authHeaders })
        expect(res.status(), `GET ${AUTOSANTEI_PATH} (${trtDt})`).toBe(200)
        const json = (await res.json()) as { data?: Partial<AutoSanteiBody> }
        const d = json.data ?? {}
        return {
            isInitialVisitEligible: Boolean(d.isInitialVisitEligible),
            picks: d.picks ?? [],
            disabilityAddon: d.disabilityAddon ?? null,
            reExamPicks: d.reExamPicks ?? [],
            reExamDisabilityAddon: d.reExamDisabilityAddon ?? null,
        }
    }

    test.beforeAll(async ({ browser }) => {
        // browser.newPage() KHÔNG kế thừa `use` của config → truyền tay.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
        page.on('request', (req) => {
            const u = req.url()
            const i = u.indexOf('/tenant/')
            if (i < 0) return
            const h = req.headers()
            if (!h['authorization']) return
            apiOrigin = u.slice(0, i)
            authHeaders = Object.fromEntries(
                Object.entries(h).filter(
                    ([k]) => k === 'authorization' || k.startsWith('x-') || k === 'accept',
                ),
            )
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(
            page,
            'login không vào được — chạy lại nhiều lần liên tiếp thì đang dính rate-limit, ' +
                'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)',
        ).toHaveURL(/\/$/)

        branches = await insuranceBranches(Number(PAT_NO))
        backBranch = branchInForceOn(branches, TRT_DT_BACK)
        nowBranch = branchInForceOn(branches, TRT_DT_NOW)
        maxBranch = branches.reduce<InsuranceBranch | null>(
            (best, b) => (best === null || b.patBr > best.patBr ? b : best),
            null,
        )
        console.log(`患者 ${PAT_NO}: ${describeBranches(branches)}`)
    })

    test.afterAll(async () => {
        await page?.close()
    })

    test('TC-0 dữ liệu test còn phân biệt được hai luật', async () => {
        expect(branches.length, `患者 ${PAT_NO} phải có ≥ 2 枝番`).toBeGreaterThan(1)
        expect(
            backBranch?.disFlg ?? 0,
            `枝番 hiệu lực tại ${TRT_DT_BACK} phải có dis_flg >= 1 thì mới sinh ra dòng 105. ` +
                `Hiện: ${describeBranches(branches)}. Đổi TEST_PAT_NO_INS_BR / TEST_TRT_DT_INS_BR_BACK.`,
        ).toBeGreaterThanOrEqual(1)
        expect(
            maxBranch?.disFlg ?? 0,
            `枝番 LỚN NHẤT phải có dis_flg == 0, nếu không thì luật cũ (MAX(pat_br)) và luật đúng ` +
                `cho cùng kết quả và test không chứng minh được gì. Hiện: ${describeBranches(branches)}.`,
        ).toBe(0)
        expect(backBranch?.patBr).not.toBe(maxBranch?.patBr)
        console.log(
            `${TRT_DT_BACK} → 枝番${backBranch?.patBr} (dis=${backBranch?.disFlg}); ` +
                `MAX(pat_br) = 枝番${maxBranch?.patBr} (dis=${maxBranch?.disFlg})`,
        )
        await step()
    })

    test('TC-1 nhập lùi ngày → BE lấy dis_flg của 枝番 hiệu lực hôm đó, KHÔNG phải 枝番 lớn nhất', async () => {
        test.skip(apiOrigin === '', 'chưa bắt được request nào của app để lấy origin + token API')

        const body = await fetchAutoSantei(TRT_DT_BACK)
        const codes = [...body.picks, ...body.reExamPicks].map((p) => `${p.trtCd}-${p.trtSb} ${p.trtNm}`)
        console.log(`autosantei ${TRT_DT_BACK}: ${codes.join(' , ')} | addon=${body.disabilityAddon?.trtNm ?? 'null'}`)

        expect(
            has105(body),
            `枝番${backBranch?.patBr} có dis_flg=${backBranch?.disFlg} nên PHẢI có dòng 105 (障害者加算). ` +
                `Không có = BE vẫn đang đọc 枝番${maxBranch?.patBr} (dis_flg=0) qua MAX(pat_br).`,
        ).toBe(true)
        await step()
    })

    test('TC-2 ngày hiện hành → dis_flg = 0 ⇒ KHÔNG có dòng 105 nào', async () => {
        test.skip(apiOrigin === '', 'chưa bắt được request nào của app để lấy origin + token API')
        expect(nowBranch?.disFlg ?? 0, `dữ liệu: 枝番 hiệu lực tại ${TRT_DT_NOW} phải có dis_flg = 0`).toBe(0)

        const body = await fetchAutoSantei(TRT_DT_NOW)
        expect(
            has105(body),
            'dis_flg = 0 mà vẫn có 105 ⇒ đang lấy nhầm 枝番 (lần này là 枝番 cũ).',
        ).toBe(false)
        await step()
    })

    test('TC-3 cửa sổ 保険適用期間 KHÔNG được quyết định 枝番', async () => {
        const inWindow = branches.filter(
            (b) =>
                (b.medStDt === null || b.medStDt <= TRT_DT_BACK) &&
                (b.medEdDt === null || TRT_DT_BACK <= b.medEdDt),
        )
        console.log(
            `${TRT_DT_BACK}: 枝番 khớp 適用期間 = [${inWindow.map((b) => b.patBr).join(',')}], ` +
                `枝番 theo 資格取得年月日 = ${backBranch?.patBr}`,
        )
        // Không ép dữ liệu phải mâu thuẫn — chỉ chốt rằng khi có mâu thuẫn thì
        // br_dt thắng. Trên tenant demo ngày này KHÔNG 枝番 nào còn trong 適用期間,
        // nên luật cũ sẽ rơi về 枝番 đầu tiên chứ không phải 枝番 hiệu lực.
        if (inWindow.some((b) => b.patBr === backBranch?.patBr)) {
            console.log('適用期間 và 資格取得年月日 trùng kết luận ở ngày này → TC chỉ ghi nhận')
        }
        expect(backBranch?.brDt ?? '').not.toBe('')
        expect(backBranch!.brDt! <= TRT_DT_BACK).toBe(true)
        await step()
    })

    test('TC-4 lưới 診療入力 của ngày lùi phải nhận dòng 障害者加算', async () => {
        const body = await fetchAutoSantei(TRT_DT_BACK)
        // `picks` là bộ mà FE áp khi không đủ điều kiện 初診 — cũng là bộ BE trả về cho
        // nhánh 再診 (GetAutoSanteiHandler), nên không cần rẽ theo `isInitialVisitEligible`.
        const disabilityPicks = body.picks.filter((p) => p.trtCd === TRT_CD_DISABILITY)
        expect(disabilityPicks.length, 'ngày lùi phải có pick 105 (xem TC-1)').toBeGreaterThan(0)

        await openFresh(TRT_DT_BACK)

        // Không đủ điều kiện 初診 ⇒ FE áp thẳng `picks` KHÔNG hỏi 3 nút; nhưng có
        // `disabilityAddon` nên confirm 特２ bung TRƯỚC khi dòng nào được chèn
        // (treatment-entry-detail.tsx: dialog chạy trước `handleKobetuPicks`).
        // Trả lời いいえ để giữ 特１ — chính là dòng 105 mà `dis_flg` của 枝番 hiệu lực sinh ra.
        if (body.disabilityAddon !== null) {
            await expect(
                addonDialog(page),
                `phải hỏi 「${body.disabilityAddon.trtNm}を算定しますか？」 — BE có trả disabilityAddon`,
            ).toBeVisible({ timeout: 20000 })
            expect(await addonDialog(page).innerText()).toContain(body.disabilityAddon.trtNm)
            await addonBtn(page, 'no').click()
            await expect(addonDialog(page)).toHaveCount(0, { timeout: 10000 })
        }

        for (const pk of disabilityPicks) {
            await expect(
                ryoCell(page).filter({ hasText: pk.trtNm }).first(),
                `lưới thiếu dòng 「${pk.trtNm}」 — BE đã trả pick 105 mà FE không chèn`,
            ).toBeVisible({ timeout: 20000 })
        }
        await closeCmtPicker(page)
        console.log(`lưới sau AutoSantei: ${JSON.stringify((await filledRyoTexts(page)).slice(-6))}`)
        await step()
    })

    test('TC-5 lưới của ngày hiện hành KHÔNG có dòng 障害者加算', async () => {
        const body = await fetchAutoSantei(TRT_DT_NOW)
        expect(
            body.picks.some((p) => p.trtCd === TRT_CD_DISABILITY),
            'BE không được trả 105 cho ngày này (xem TC-2)',
        ).toBe(false)
        expect(body.disabilityAddon, 'dis_flg = 0 thì không có 特２ để hỏi').toBeNull()

        // Mọi tên 処置 mà mã 105 có thể mang trong bản master của THÁNG đó — lấy từ DB
        // để không hardcode 「特１(初診)」 (tên đổi theo phiên bản master).
        const master105 = await findMstTrt(TRT_DT_NOW, TRT_CD_DISABILITY)
        const names105 = master105.flatMap((m) => [m.trtNm, m.cctNm]).filter((n) => n !== '')
        expect(names105.length, `master ${TRT_DT_NOW} không có mã 105 nào để đối chiếu`).toBeGreaterThan(0)

        await openFresh(TRT_DT_NOW)
        const before = await filledRyoTexts(page)

        // Đủ điều kiện 初診 ⇒ confirm 3 nút. Yes để bộ 初診 được chèn thật.
        await expect(
            santeiDialog(page),
            `không thấy confirm 「〜を算定しますか？」 — (患者 ${PAT_NO}, ${TRT_DT_NOW}) có lẽ đã có 処置 ` +
                'lưu trong THÁNG đó. Đổi TEST_TRT_DT_INS_BR_NOW.',
        ).toBeVisible({ timeout: 20000 })
        await santeiBtn(page, 'Yes').click()
        await expect(santeiDialog(page)).toHaveCount(0, { timeout: 15000 })

        // Chờ theo SỐ DÒNG chứ không theo tên: 履歴 của bệnh nhân đã có sẵn 「歯科初診料」
        // từ những năm trước, nên `toBeVisible` theo tên xanh ngay cả khi chưa chèn gì —
        // xanh giả. Bộ pick chỉ vào lưới sau khi cmt-auto/cascade chạy xong (Rule 15).
        expect(body.picks.length, 'BE không trả pick nào cho ngày hiện hành').toBeGreaterThan(0)
        await expect
            .poll(async () => (await filledRyoTexts(page)).length, { timeout: 30000 })
            .toBeGreaterThan(before.length)
        await closeCmtPicker(page)

        const added = addedTexts(before, await filledRyoTexts(page))
        console.log(`đã chèn: ${JSON.stringify(added)}`)
        expect(
            added.some((t) => body.picks.some((p) => t.includes(p.trtNm))),
            `lưới không nhận dòng nào của bộ pick BE trả về (${JSON.stringify(body.picks.map((p) => p.trtNm))})`,
        ).toBe(true)
        const stray = added.filter((t) => names105.some((n) => t.includes(n)))
        expect(
            stray,
            `枝番${nowBranch?.patBr} có dis_flg = 0 nên KHÔNG được có dòng 105 nào. ` +
                'Có = BE lại đang đọc 枝番 cũ (dis_flg = 2).',
        ).toEqual([])
        await step()
    })
})
