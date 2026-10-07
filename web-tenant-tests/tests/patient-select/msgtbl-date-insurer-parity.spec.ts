/**
 * MSGTBL parity — 患者登録: 3 chuỗi đã được sửa lại theo legacy phải hiện ĐÚNG
 * NGUYÊN VĂN.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ SPEC NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * `ja-msgtbl.ts` là bản chép tay của bảng MSGTBL (SQL Server, không nằm trong
 * repo). Ba chuỗi dưới đây từng bị chép SAI và không testcase nào bắt được —
 * `pnpm test:tenant` xanh, e2e xanh, chỉ người dùng cuối mới thấy lệch.
 *
 * Khác với các mã trong `msgtbl-register-f9-parity.spec.ts`, ba mã ở đây ĐÃ
 * ĐƯỢC CHỐT: legacy để lại nguyên văn template trong comment C#, nên assert ở
 * đây là assert vào chuỗi đúng thật, không phải chỉ chặn hồi quy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Q00009 ← frm201001.cs:2348 `//{0}が入力されていません。今日の日付にしてよろしいですか？`
 *  - Q00010 ← frm201001.cs:2338 `//{0}が入力されていません。診療開始日の日付にしてよろしいですか？`
 *  - E00002 ← frm201021.cs:155 `ShowErrorMsg("E00002", "保険者番号")` — 保険者番号 đúng
 *    số chữ số nhưng master không có. Chỗ này TRƯỚC ĐÂY gọi E00020, sai mã:
 *    legacy không bao giờ phát E00020 (call-site duy nhất :366 đã comment out),
 *    và chuỗi cũ 「保険者番号の桁数が間違っています。」 thật ra là kết quả render của
 *    `E00002("保険者番号の桁数")` ở :146 — tức thông báo của nhánh SAI SỐ CHỮ SỐ bị
 *    đem sang dùng cho nhánh KHÔNG TÌM THẤY.
 *  - features/patients/lib/wizard-validation.ts (`validateRegisterMain`)
 *      · 診療開始日 trống                     → confirm Q00009('診療開始日')
 *      · 患者情報有効日 trống + CÓ 診療開始日 → confirm Q00010('患者情報有効日')
 *      · 患者情報有効日 trống + KHÔNG 診療開始日 → confirm Q00009('患者情報有効日')
 *        ⇒ hai nhánh sau loại trừ nhau, phải dựng 2 trạng thái DB khác nhau.
 *  - features/patients/components/patient-detail-form.tsx:888-891
 *      · confirm hiện TUẦN TỰ, từ chối một cái là DỪNG, KHÔNG lưu ⇒ spec chạy
 *        được mà không cần TEST_ALLOW_SAVE.
 *  - features/patients/hooks/use-insurer-number-lookup.ts
 *      · lookup chạy ở onBlur, chỉ khi độ dài ∈ {4,6,8}; FE KHÔNG kiểm check-digit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU — spec TỰ DỰNG bệnh nhân rồi tự xoá
 * ═══════════════════════════════════════════════════════════════════════════
 * Cần `insurance.med_st_dt` / `br_dt` để TRỐNG — không mượn người thật được.
 * `seedTestPatient` đặt sẵn med_st_dt=1900-01-01, br_dt=ngày sinh, nên spec
 * UPDATE thẳng về NULL (cả hai cột đều nullable — apps/ddl/sql/snapshot/
 * schema.sql:3198-3199).
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): mỗi TC tự đặt lại DB rồi mở
 * lại màn hình, nhưng chạy lẻ một TC ở giữa vẫn hỏng vì thiếu bước seed ở
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
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { patNo } from '../_shared/env'
import {
    MSG,
    clickDialog,
    closeDialog,
    expectMsg,
    expectSeverity,
    nextDialogText,
    topDialog,
} from '../_shared/msgtbl'
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
 *     (`--repeat-each`, Rule 16) sẽ giật bệnh nhân khỏi tay nhau.
 *
 * 61 + workerIndex ⇒ 990061-990064 với 4 worker, chưa ai đụng tới.
 * `TEST_PAT_NO` vẫn override được, nhưng khi đó ĐỪNG chạy nhiều worker.
 */
const PAT_NO_OFFSET = 61
let PAT_NO = ''

/**
 * 保険者番号 8 số KHÔNG có trong master → ép nhánh not-found.
 * Nếu môi trường của bạn tình cờ CÓ số này thì lookup thành công, không alert
 * nào hiện và TC-3 timeout — khi đó đặt lại `TEST_UNKNOWN_INS_NO=<số khác>`.
 */
const UNKNOWN_INS_NO = process.env.TEST_UNKNOWN_INS_NO ?? '99999999'

/** Giá trị gõ vào 電話番号 chỉ để đánh dấu form đã sửa — xem `makeFormDirty`. */
const DIRTY_PHONE = '090-0000-0001'

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
        console.log(`worker #${testInfo.workerIndex} dùng bệnh nhân ${PAT_NO}`)
        if (Number(PAT_NO) < SEED_PAT_NO_BASE) {
            throw new Error(
                `TEST_PAT_NO=${PAT_NO} nằm ngoài dải seed (>= ${SEED_PAT_NO_BASE}). ` +
                    'Spec này XOÁ TRỐNG ngày của bệnh nhân nên chỉ chạy trên bệnh nhân seed.',
            )
        }

        // 氏名 PHẢI có dấu cách ngăn họ/tên, nếu không chuỗi F9 dừng sớm ở E00010
        // và không bao giờ tới mấy confirm ngày (wizard-validation.ts).
        await seedTestPatient({
            patNo: Number(PAT_NO),
            patNm: 'イーツーイー　患者',
            patKn: 'いーつーいー　かんじゃ',
        })
    })

    test.afterAll(async () => {
        // Rời màn hình TRƯỚC khi nhả page: màn 患者登録 đang "dirty" (TC-3 gõ số vào
        // ô 保険者番号) và mọi spec chạy sau dùng CHUNG page này — Rule 19.1.
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await deleteTestPatient(Number(PAT_NO))
        await releaseSharedPage(page)
    })

    // ── Điều khiển màn hình ─────────────────────────────────────────────────

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

    async function openDetail(): Promise<void> {
        await openPatientRegistration(page, PAT_NO)
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
        const tel = patientFieldInput(page, '電話番号')
        await tel.fill(DIRTY_PHONE)
        await tel.blur()
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

        const dlg = topDialog(page)
        if (await dlg.isVisible().catch(() => false)) {
            const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
            if (SAVE_GATES.some((g) => text.includes(g))) {
                console.log(`[cổng F9] 「${text.trim()}」 → はい`)
                await clickDialog(page, 'accept')
                await step()
            }
        }
    }

    /** Từ chối confirm ⇒ `consumeValidation` trả false ⇒ F9 dừng, KHÔNG ghi DB. */
    async function decline(what: string): Promise<void> {
        await clickDialog(page, 'decline')
        await step()
        await expect(topDialog(page), `từ chối ${what} rồi mà hộp thoại vẫn còn`).toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    }

    // ── TC-1 ────────────────────────────────────────────────────────────────

    test('TC-1 — 2 ngày trống: F9 hỏi Q00009「診療開始日」 rồi Q00009「患者情報有効日」', async () => {
        // Cả 診療開始日 lẫn 患者情報有効日 trống ⇒ validateRegisterMain đẩy ra ĐÚNG 2
        // confirm, và cái thứ hai rơi vào nhánh Q00009 (vì không có 診療開始日 để mà
        // 採用) chứ KHÔNG phải Q00010.
        await setDates(null, null)
        await openDetail()
        await makeFormDirty()
        await pressF9()

        const first = await nextDialogText(page, 'confirm #1 — Q00009 診療開始日', DIALOG_TIMEOUT)
        expectMsg(
            first,
            'Q00009',
            MSG.Q00009('診療開始日'),
            'confirm đầu tiên của F9 phải là Q00009 cho 診療開始日',
        )
        // frm201001.cs:2349 `ShowOKCancelMsg` ⇒ MessageBoxIcon.Question, KHÔNG phải ✕ đỏ.
        await expectSeverity(page, 'confirm', 'Q00009: legacy dùng ShowOKCancelMsg')

        // Đồng ý cái đầu để đi tiếp tới cái thứ hai (onAccept chỉ điền ngày vào
        // state trong RAM, chưa có request nào bay đi).
        await clickDialog(page, 'accept')
        await step()

        const second = await nextDialogText(page, 'confirm #2 — Q00009 患者情報有効日', DIALOG_TIMEOUT)
        expectMsg(
            second,
            'Q00009',
            MSG.Q00009('患者情報有効日'),
            'không có 診療開始日 thì confirm thứ hai phải là Q00009, KHÔNG phải Q00010',
        )
        await expectSeverity(page, 'confirm', 'Q00009: legacy dùng ShowOKCancelMsg')

        await decline('Q00009 #2')
    })

    // ── TC-2 ────────────────────────────────────────────────────────────────

    test('TC-2 — có 診療開始日, trống 患者情報有効日: F9 hỏi Q00010', async () => {
        // CÓ 診療開始日 ⇒ nhánh đổi hẳn sang Q00010「…診療開始日の日付にしてよろしいですか？」.
        await setDates('2000-01-01', null)
        await openDetail()
        await makeFormDirty()
        await pressF9()

        const text = await nextDialogText(page, 'confirm — Q00010 患者情報有効日', DIALOG_TIMEOUT)
        expectMsg(
            text,
            'Q00010',
            MSG.Q00010('患者情報有効日'),
            'có 診療開始日 thì confirm phải là Q00010',
        )
        // frm201001.cs:2339 `ShowOKCancelMsg`.
        await expectSeverity(page, 'confirm', 'Q00010: legacy dùng ShowOKCancelMsg')

        await decline('Q00010')
    })

    // ── TC-3 ────────────────────────────────────────────────────────────────

    test('TC-3 — 保険者番号 không có trong master: blur báo E00002, KHÔNG phải E00020', async () => {
        // Trả ngày về giá trị hợp lệ để màn hình không bung confirm ngày chen ngang.
        await setDates('2000-01-01', '2000-01-01')
        await openDetail()

        const insNo = patientFieldInput(page, '保険者番号')
        await insNo.fill(UNKNOWN_INS_NO)
        await step()
        // Lookup chạy ở onBlur (use-insurer-number-lookup), không phải onChange.
        await insNo.blur()
        await step()

        const text = await nextDialogText(page, 'alert — E00002 保険者番号', DIALOG_TIMEOUT)
        expectMsg(
            text,
            'E00002',
            MSG.E00002('保険者番号'),
            `master không có 保険者番号=${UNKNOWN_INS_NO} thì phải báo E00002. ` +
                'Nếu KHÔNG có hộp thoại nào: nhiều khả năng số này CÓ thật trong master ' +
                '⇒ chạy lại với TEST_UNKNOWN_INS_NO=<số khác>.',
        )

        // frm201021.cs:155 `ShowErrorMsg("E00002", "保険者番号")` ⇒ ✕ đỏ.
        await expectSeverity(page, 'error', 'E00002: legacy dùng ShowErrorMsg')
        await closeDialog(page, 'E00002', DIALOG_TIMEOUT)
    })
})
