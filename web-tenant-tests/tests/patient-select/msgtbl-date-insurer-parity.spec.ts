/**
 * MSGTBL parity — 患者登録 (màn đăng ký/sửa bệnh nhân): 3 chuỗi vừa được sửa lại
 * theo legacy phải hiện ĐÚNG NGUYÊN VĂN.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ SPEC NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * `ja-msgtbl.ts` là bản chép tay của bảng MSGTBL (SQL Server, không nằm trong
 * repo). Ba chuỗi dưới đây từng bị chép SAI và không testcase nào bắt được —
 * `pnpm test:tenant` xanh, e2e xanh, chỉ người dùng cuối mới thấy lệch.
 *
 * Chúng được sửa ở commit 1e5afabb7 dựa trên chính comment mà legacy bỏ lại
 * trong source C#. Spec này ghim lại kết quả, theo Rule 23.3 (so NGUYÊN VĂN
 * theo mã, không so "có chữ X là được").
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source, đừng sửa assert mà không đọc lại mấy chỗ này
 * ═══════════════════════════════════════════════════════════════════════════
 *  - shared/locales/ja-msgtbl.ts
 *      · Q00009(field) → `{field}が入力されていません。今日の日付にしてよろしいですか？`
 *        (legacy frm201001.cs:2348 — comment `//{0}が入力されていません。今日の日付に…`)
 *      · Q00010(field) → `{field}が入力されていません。診療開始日の日付にしてよろしいですか？`
 *        (legacy frm201001.cs:2338)
 *      · E00002(field) → `{field}が間違っています。`
 *  - features/patients/lib/wizard-validation.ts (`validateRegisterMain`)
 *      · 診療開始日 trống                     → confirm Q00009('診療開始日')
 *      · 患者情報有効日 trống + CÓ 診療開始日 → confirm Q00010('患者情報有効日')
 *      · 患者情報有効日 trống + KHÔNG có 診療開始日 → confirm Q00009('患者情報有効日')
 *        ⇒ hai nhánh này loại trừ nhau, nên phải dựng 2 trạng thái DB khác nhau.
 *  - features/patients/components/patient-detail-form.tsx:888-891
 *      · `for (const step of result.confirms) if (!(await confirmDialog(...))) return false`
 *        ⇒ confirm hiện TUẦN TỰ, bấm từ chối một cái là DỪNG luôn, KHÔNG lưu.
 *        Nhờ vậy spec chạy được mà không cần TEST_ALLOW_SAVE.
 *  - features/patients/components/insurance-section.tsx:215
 *      · 保険者番号 nhập đủ 4/6/8 số nhưng master không có → `alertDialog(ja.E00002('保険者番号'))`.
 *        Trước đây chỗ này gọi E00020「保険者番号の桁数が間違っています。」 — SAI mã:
 *        legacy chỉ phát E00002 (frm201021.cs:155), còn E00020 bị comment out (:366).
 *  - features/patients/hooks/use-insurer-number-lookup.ts
 *      · Chỉ gọi lookup khi độ dài ∈ {4,6,8}; KHÔNG kiểm check-digit ở FE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU — spec TỰ DỰNG bệnh nhân rồi tự xoá
 * ═══════════════════════════════════════════════════════════════════════════
 * Cần bệnh nhân có `insurance.med_st_dt` / `br_dt` để TRỐNG — không mượn người
 * thật được. `seedTestPatient` đặt sẵn med_st_dt=1900-01-01, br_dt=ngày sinh,
 * nên spec UPDATE thẳng về NULL (cả hai cột đều nullable — apps/ddl/sql/
 * snapshot/schema.sql:3198-3199).
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): mỗi TC tự đặt lại DB rồi
 * mở lại màn hình, nhưng chạy lẻ một TC ở giữa vẫn hỏng vì thiếu bước seed ở
 * `beforeAll`. Một TC đỏ ⇒ các TC sau bị skip. Page lấy từ `authedPage` nên
 * KHÔNG có trace/video tự động.
 */
import { type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    withDb,
} from '../_shared/db'
import { patNo } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * Bệnh nhân riêng của spec này, CHIA THEO WORKER.
 *
 * Hai lý do không dùng một số cố định:
 *  1. Offset đang có người dùng: 5,6,7,17,31,32,33,34,41,42,51,52,53,731
 *     (`grep -rn "SEED_PAT_NO_BASE +" tests/`). Riêng 34 bị treatment-grid-basic
 *     và counter-payment-audit-log dùng — chạy 4 worker là đụng nhau.
 *  2. `seedTestPatient` XOÁ rồi tạo lại, nên hai bản sao chạy song song
 *     (`--repeat-each`, Rule 16) sẽ giật bệnh nhân khỏi tay nhau: bản này đang mở
 *     màn hình thì bản kia xoá mất → "màn 患者登録 không mở được".
 *
 * 61 + workerIndex ⇒ 990061-990064 với 4 worker, chưa ai đụng tới.
 * `TEST_PAT_NO` vẫn override được, nhưng khi đó ĐỪNG chạy nhiều worker.
 */
const PAT_NO_OFFSET = 61
let PAT_NO = ''
let SELF_SEEDED = false

/**
 * 保険者番号 8 số KHÔNG có trong master → ép nhánh not-found.
 * Nếu môi trường của bạn tình cờ CÓ số này thì lookup thành công, không alert
 * nào hiện và TC-3 timeout — khi đó đặt lại: `TEST_UNKNOWN_INS_NO=<số khác>`.
 */
const UNKNOWN_INS_NO = process.env.TEST_UNKNOWN_INS_NO ?? '99999999'

/** Giá trị gõ vào 電話番号 chỉ để đánh dấu form đã sửa — xem `makeFormDirty`. */
const DIRTY_PHONE = '090-0000-0001'

// ── Chuỗi phải hiện, NGUYÊN VĂN ─────────────────────────────────────────────
const Q00009_MED_START = '診療開始日が入力されていません。今日の日付にしてよろしいですか？'
const Q00009_BR_DT = '患者情報有効日が入力されていません。今日の日付にしてよろしいですか？'
const Q00010_BR_DT = '患者情報有効日が入力されていません。診療開始日の日付にしてよろしいですか？'
const E00002_INS_NO = '保険者番号が間違っています。'

/** Chuỗi của bản CŨ — nếu còn thấy nghĩa là bản sửa chưa tới được browser. */
const STALE = [
    '本日の日付を採用してよろしいですか？',
    '診療開始日を採用してよろしいですか？',
    '保険者番号の桁数が間違っています。',
]

const SCREEN_LOAD_TIMEOUT = 60_000
const DIALOG_TIMEOUT = 30_000

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: spec phải đặt insurance.med_st_dt / br_dt về NULL, ' +
        'không có màn hình nào xoá trống được hai ô đó một cách chắc chắn',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('MSGTBL parity — 患者登録 (Q00009 / Q00010 / E00002 保険者番号)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }, testInfo) => {
        page = authedPage
        step = makeStep(page)

        PAT_NO = patNo(String(SEED_PAT_NO_BASE + PAT_NO_OFFSET + testInfo.workerIndex))
        SELF_SEEDED = Number(PAT_NO) >= SEED_PAT_NO_BASE
        console.log(`worker #${testInfo.workerIndex} dùng bệnh nhân ${PAT_NO}`)

        if (!SELF_SEEDED) {
            throw new Error(
                `TEST_PAT_NO=${PAT_NO} nằm ngoài dải seed (>= ${SEED_PAT_NO_BASE}). ` +
                    'Spec này XOÁ TRỐNG ngày của bệnh nhân nên chỉ chạy trên bệnh nhân seed.',
            )
        }

        // 氏名 PHẢI có dấu cách ngăn họ/tên, nếu không chuỗi F9 dừng sớm ở
        // E00010 và không bao giờ tới mấy confirm ngày (wizard-validation.ts).
        await seedTestPatient({
            patNo: Number(PAT_NO),
            patNm: 'イーツーイー　患者',
            patKn: 'いーつーいー　かんじゃ',
        })
    })

    test.afterAll(async () => {
        // Rời màn hình TRƯỚC khi nhả page: màn 患者登録 đang "dirty" (TC-3 gõ số
        // vào ô 保険者番号) và mọi spec chạy sau dùng CHUNG page này — Rule 19.1.
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await deleteTestPatient(Number(PAT_NO))
        await releaseSharedPage(page)
    })

    // ── Điều khiển màn hình ─────────────────────────────────────────────────

    /**
     * Ô theo nhãn của `FieldRow` (`<div><label>X</label><input/></div>`) — không
     * có testid/aria-label nên phải bám nhãn.
     *
     * `.last()` chứ KHÔNG `.first()`: bộ lọc khớp MỌI div tổ tiên chứa nhãn đó,
     * kể cả div bọc cả trang, và Playwright trả theo thứ tự DOM ⇒ `.first()` ra
     * div ngoài cùng và `input` đầu tiên của nó là một ô hoàn toàn khác.
     */
    function fieldInput(label: string) {
        return page
            .locator('div')
            .filter({ has: page.locator('label').filter({ hasText: new RegExp(`^${label}\\s*\\*?$`) }) })
            .last()
            .locator('input')
            .first()
    }

    /** Đặt thẳng 2 cột ngày; `null` = để trống để ép confirm bung ra. */
    async function setDates(medStDt: string | null, brDt: string | null): Promise<void> {
        await withDb(async (c) => {
            await c.query(
                `UPDATE insurance
                    SET med_st_dt = $2::date, br_dt = $3::date
                  WHERE pat_no = $1`,
                [Number(PAT_NO), medStDt, brDt],
            )
        })
    }

    /**
     * `patientNo` đi qua router dạng JSON-serialise ⇒ trên URL là `%22990034%22`
     * chứ không phải `990034`. Truyền dạng trần thì `validateSearch` (z.string())
     * nhận về number, ném SearchParamError và ra trang 404.
     */
    async function openDetail(): Promise<void> {
        await page.goto(`/patients/registration?patientNo=%22${PAT_NO}%22`, {
            waitUntil: 'domcontentloaded',
        })
        await expect(
            fieldInput('保険者番号'),
            'màn 患者登録 không mở ở chế độ sửa — kiểm tra route và bệnh nhân seed',
        ).toBeVisible({ timeout: SCREEN_LOAD_TIMEOUT })
        await step()
    }

    /**
     * Làm form "bẩn" trước khi bấm F9.
     *
     * FACT patient-detail-form.tsx:853-860 — ở chế độ sửa mà `!isFormDirty()` thì
     * F9 BỎ QUA TOÀN BỘ chuỗi validate, chỉ hỏi
     * 「患者データは、変更されていません。保存しますか？」 rồi kết thúc. Không sửa gì
     * thì Q00009 / Q00010 KHÔNG BAO GIỜ bung ra.
     *
     * Chọn 電話番号 vì nó không dính tới ngày tháng lẫn 負担割合 — thứ spec đang đo
     * không bị ô này làm lệch.
     */
    async function makeFormDirty(): Promise<void> {
        const tel = fieldInput('電話番号')
        await tel.fill(DIRTY_PHONE)
        await tel.blur()
        await step()
    }

    /** Hộp thoại đang nổi trên cùng. `alertDialog`/`confirmDialog` = role alertdialog (Rule 13). */
    function topDialog() {
        return page.getByRole('alertdialog').first()
    }

    /**
     * Chờ hộp thoại kế tiếp rồi trả về text đã chuẩn hoá khoảng trắng.
     * Text bao gồm cả nhãn nút, nên so bằng `toContain` với nguyên câu thông báo.
     */
    async function nextDialogText(what: string): Promise<string> {
        const dlg = topDialog()
        await expect(dlg, `không thấy hộp thoại nào cho ${what}`).toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
        console.log(`[${what}] 「${text}」`)
        return text
    }

    /**
     * Nhãn nút KHÔNG chắc là tiếng Nhật — `confirm-dialog-view.tsx` mặc định
     * はい/いいえ nhưng call-site đang truyền Yes/No (Rule 13.2).
     */
    async function clickDialog(kind: 'accept' | 'decline'): Promise<void> {
        const name =
            kind === 'accept' ? /^(はい|Yes|OK)$/ : /^(いいえ|No|キャンセル|Cancel)$/
        await topDialog().getByRole('button', { name }).first().click()
        await step()
    }

    /**
     * F9 登録, rồi NUỐT cái cổng chặn đứng trước chuỗi validate.
     *
     * FACT patient-detail-form.tsx:1534 — F9 của `FunctionKeys` KHÔNG gọi thẳng
     * `onComplete` mà đi qua `handleExit(onComplete)`. Form đang bẩn ⇒ nó hỏi
     * `confirmDialog.yesNoCancel`「患者データは変更されています。保存しますか？」
     * (:1171); chọn はい mới chạy `onComplete()` → mới tới Q00009/Q00010.
     *
     * Đây KHÔNG phải chuỗi MSGTBL (không có mã, là literal của bản port) nên spec
     * chỉ đi xuyên qua, không assert nội dung.
     */
    const SAVE_GATES = ['患者データは変更されています', '患者データは、変更されていません']

    async function pressF9(): Promise<void> {
        await page.keyboard.press('F9')
        await step()

        const dlg = topDialog()
        if (await dlg.isVisible().catch(() => false)) {
            const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
            if (SAVE_GATES.some((g) => text.includes(g))) {
                console.log(`[cổng F9] 「${text.trim()}」 → はい`)
                await clickDialog('accept')
            }
        }
    }

    /** Không chuỗi cũ nào được phép còn sót trong hộp thoại. */
    function expectNotStale(text: string): void {
        for (const old of STALE) {
            expect(
                text,
                `hộp thoại vẫn mang chuỗi CŨ 「${old}」 — bản sửa msgtbl chưa tới được ` +
                    'browser (Vite chưa reload? hay nhánh đang chạy chưa merge commit 1e5afabb7?)',
            ).not.toContain(old)
        }
    }

    // ── TC-1 ────────────────────────────────────────────────────────────────

    test('TC-1 — 2 ngày trống: F9 hỏi Q00009「診療開始日」 rồi Q00009「患者情報有効日」', async () => {
        // Cả 診療開始日 lẫn 患者情報有効日 trống ⇒ validateRegisterMain đẩy ra
        // ĐÚNG 2 confirm, và cái thứ hai rơi vào nhánh Q00009 (vì không có 診療開始日
        // để mà采用) chứ KHÔNG phải Q00010.
        await setDates(null, null)
        await openDetail()
        await makeFormDirty()
        await pressF9()

        const first = await nextDialogText('confirm #1 — Q00009 診療開始日')
        expectNotStale(first)
        expect(
            first,
            'confirm đầu tiên của F9 phải là Q00009 cho 診療開始日, nguyên văn theo MSGTBL',
        ).toContain(Q00009_MED_START)

        // Đồng ý cái đầu để đi tiếp tới cái thứ hai (onAccept chỉ điền ngày vào
        // state trong RAM, chưa có request nào bay đi).
        await clickDialog('accept')

        const second = await nextDialogText('confirm #2 — Q00009 患者情報有効日')
        expectNotStale(second)
        expect(
            second,
            'không có 診療開始日 thì confirm thứ hai phải là Q00009, KHÔNG phải Q00010',
        ).toContain(Q00009_BR_DT)

        // Từ chối ⇒ consumeValidation trả false ⇒ F9 dừng, KHÔNG ghi DB.
        await clickDialog('decline')
        await expect(topDialog(), 'từ chối rồi mà hộp thoại vẫn còn').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })

    // ── TC-2 ────────────────────────────────────────────────────────────────

    test('TC-2 — có 診療開始日, trống 患者情報有効日: F9 hỏi Q00010', async () => {
        // CÓ 診療開始日 ⇒ nhánh đổi hẳn sang Q00010「…診療開始日の日付にしてよろしいですか？」.
        await setDates('2000-01-01', null)
        await openDetail()
        await makeFormDirty()
        await pressF9()

        const text = await nextDialogText('confirm — Q00010 患者情報有効日')
        expectNotStale(text)
        expect(
            text,
            'có 診療開始日 thì confirm phải là Q00010, nguyên văn theo MSGTBL',
        ).toContain(Q00010_BR_DT)

        await clickDialog('decline')
        await expect(topDialog(), 'từ chối rồi mà hộp thoại vẫn còn').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })

    // ── TC-3 ────────────────────────────────────────────────────────────────

    test('TC-3 — 保険者番号 không có trong master: blur báo E00002, KHÔNG phải E00020', async () => {
        // Trả ngày về giá trị hợp lệ để màn hình không bung confirm ngày chen ngang.
        await setDates('2000-01-01', '2000-01-01')
        await openDetail()

        const insNo = fieldInput('保険者番号')
        await insNo.fill(UNKNOWN_INS_NO)
        await step()
        // Lookup chạy ở onBlur (use-insurer-number-lookup), không phải onChange.
        await insNo.blur()
        await step()

        const text = await nextDialogText('alert — E00002 保険者番号')
        expectNotStale(text)
        expect(
            text,
            `master không có 保険者番号=${UNKNOWN_INS_NO} thì phải báo E00002「${E00002_INS_NO}」. ` +
                'Nếu KHÔNG có hộp thoại nào: nhiều khả năng số này CÓ thật trong master ' +
                '⇒ chạy lại với TEST_UNKNOWN_INS_NO=<số khác>.',
        ).toContain(E00002_INS_NO)

        await clickDialog('accept')
        await expect(topDialog(), 'bấm OK rồi mà hộp thoại vẫn còn').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })
})
