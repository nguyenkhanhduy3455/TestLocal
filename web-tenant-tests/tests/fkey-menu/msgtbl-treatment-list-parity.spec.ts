/**
 * MSGTBL parity — hai chuỗi xác nhận của màn 受付患者一覧 (`/treatments`):
 * Q00049 (F7 会計作成) và Q00039 (F1 印刷 trong 来患集計).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CẢ HAI CHUỖI ĐỀU CHƯA ĐƯỢC VERIFY — và đây là hai ca audit nói NẶNG NHẤT
 * ═══════════════════════════════════════════════════════════════════════════
 * Theo bản audit 2026-09-11, hai mã này không chỉ khác chữ mà MẤT THÔNG TIN:
 *
 *  - Q00049: DB có câu 「既に入力済の会計データは全て上書きされます」 (dữ liệu kế
 *    toán đã nhập sẽ bị GHI ĐÈ toàn bộ) mà bản web cắt mất. Có một bằng chứng
 *    gián tiếp khá mạnh: legacy truyền `MessageBoxDefaultButton.Button2`
 *    (frm203001.cs:430) — tức mặc định con trỏ nằm ở CANCEL. Chỉ hộp thoại nguy
 *    hiểm mới làm vậy, khớp với việc câu gốc có cảnh báo ghi đè.
 *  - Q00039: DB có tiền tố 「{0}プリンタに」 (ở máy in ~) và NHẬN 1 THAM SỐ, trong
 *    khi hàm FE nhận 0 tham số. Mọi call-site legacy đều truyền tham số thật:
 *    `" "` (frm203046.cs:156), `string.Empty` (CommonNikei.cs:272/329/343/359),
 *    `wkMsg` (frm305004.cs:462/541).
 *
 * Spec assert chuỗi app ĐANG render (lưới chặn hồi quy) và `expectMsg` in ra
 * chuỗi audit nói là đúng. **Xanh KHÔNG có nghĩa là chữ đúng.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHỒNG LẤN CÓ CHỦ Ý với spec sẵn có
 * ═══════════════════════════════════════════════════════════════════════════
 * Hai chuỗi này ĐÃ được chạm tới ở nơi khác, nhưng chỉ một phần:
 *   · `patient-select/patient-select-f7-f2-end.spec.ts:449`
 *       `toContain('会計データを一括作成します')` — thiếu câu cảnh báo ghi đè và
 *       không kiểm tham số 和暦.
 *   · `patient-select/monthly-visit-summary-dialog.spec.ts:877`
 *       `toContainText('プリンタに用紙をセットしてください')` — thiếu tham số `{0}`.
 * Hai spec đó đo LUỒNG (F7 tạo 会計, F1 in) và chỉ dùng chuỗi làm mốc nhận dạng.
 * Spec này đo CHÍNH CHUỖI: so nguyên văn theo mã, chặn danh sách `REGRESSED`, và
 * in cảnh báo `UNVERIFIED`. Giữ cả hai là cố ý — xoá spec này thì mất lưới chặn,
 * xoá bên kia thì mất phần đo luồng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source
 * ═══════════════════════════════════════════════════════════════════════════
 *  - treatment-entry-page.tsx:500 — F3「当月来患」 mở `MonthlyVisitSummaryDialog`.
 *      · :356 — có đặt 医院パスワード thì F3 chèn `ClinicPasswordDialog` trước.
 *        Trên môi trường test hiện tại chưa đặt nên F3 mở thẳng; spec vẫn xử lý
 *        trường hợp có gate bằng cách BỎ QUA kèm log, thay vì đỏ oan.
 *  - treatment-entry-page.tsx:434-452 — F7 会計作成: `trtDt` rỗng thì
 *    E00002「診療日」; ngược lại hỏi `confirmDialog.okCancel(Q00049(period))`.
 *      · `period` là ngày 和暦 (vd 「令和08年09月15日」), rút còn 年月 khi
 *        `inp_config.acc_make` = 月単位. Phụ thuộc cấu hình + ngày chạy nên spec
 *        assert phần BẤT BIẾN của câu (`MSG.Q00049('')`) rồi kiểm riêng phần
 *        tham số bằng regex 和暦.
 *  - monthly-visit-summary-dialog.tsx:326 — F1「印刷」 →
 *    `confirmDialog(ja.Q00039())` rồi mới dựng datasource.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHÔNG GHI DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Cả hai testcase đều TỪ CHỐI hộp thoại. Đồng ý Q00049 là chạy
 * `modBulkAcc.calcAcc` — ghi hàng loạt dòng 会計 cho cả kỳ; đồng ý Q00039 là đẩy
 * lệnh in thật sang agent. Không cần `TEST_ALLOW_SAVE`, và cũng ĐỪNG sửa spec
 * này thành bấm đồng ý.
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`). Page lấy từ `authedPage`
 * ⇒ không có trace/video tự động.
 */
import { type Page } from '@playwright/test'

import { openTreatmentList } from '../_shared/entry'
import { INP_FLAG, routeInpDeviceSettings } from '../_shared/inp-device-settings'
import {
    MSG,
    clickDialog,
    expectMsg,
    expectSeverity,
    nextDialogText,
    topDialog,
} from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

const DIALOG_TIMEOUT = 30_000

/**
 * Regex khớp một tiêu đề bị GIÃN CHỮ.
 *
 * `DraggableDialog` render title kiểu 「来 患 集 計」 / 「医 院 パ ス ワ ー ド」, nên
 * `hasText: '来患集計'` KHÔNG BAO GIỜ khớp (GUIDELINE Rule 13.1). Đã vấp thật:
 * dialog mở ra bình thường mà locator báo "không mở được".
 */
function spaced(label: string): RegExp {
    return new RegExp([...label].join('\\s*'))
}

/** 和暦 — 「令和08年09月15日」 hoặc 「令和08年09月」 khi acc_make = 月単位. */
/** Tham số `{0}` của Q00039 ở màn này — legacy truyền đúng 1 dấu cách. */
const PRINTER_NAME_BLANK = ' '

const WAREKI_RE = /[一-龥]{2}\d{2}年\d{2}月(\d{2}日)?/

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('MSGTBL parity — 受付患者一覧 (Q00049 F7 会計作成 / Q00039 F1 印刷)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        // F7 会計作成 ẩn khi 一括会計ボタンを表示する = 9 (mặc định của máy chưa có
        // device_config, frm203001.cs:572-575) — ép = 1 để Q00049 còn đường mở.
        await routeInpDeviceSettings(page, { showBulkAccButton: INP_FLAG.On })
        // Chờ đúng phím sắp bấm chứ không chờ một mốc chung chung.
        await openTreatmentList(page, 'F7')
    })

    test.afterAll(async () => {
        await releaseSharedPage(page)
    })

    /** Nút F-key của thanh dưới màn danh sách — accessible name là `F<n> <nhãn>`. */
    function listFKey(name: RegExp) {
        return page.getByRole('button', { name }).first()
    }

    /** Từ chối hộp thoại rồi chờ nó đóng — KHÔNG được đồng ý (xem doc đầu file). */
    async function decline(what: string): Promise<void> {
        await clickDialog(page, 'decline')
        await step()
        await expect(topDialog(page), `từ chối ${what} rồi mà hộp thoại vẫn còn`).toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    }

    // ── Q00049 ──────────────────────────────────────────────────────────────

    test('Q00049 — F7 会計作成 hỏi trước khi tạo dữ liệu kế toán cả kỳ', async () => {
        await listFKey(/F7\s*会計作成/).click()
        await step()

        const text = await nextDialogText(page, 'confirm — Q00049 会計作成', DIALOG_TIMEOUT)

        // Phần bất biến của câu: `MSG.Q00049('')` bỏ tham số, còn lại đúng phần
        // chữ mà MSGTBL sở hữu.
        expectMsg(
            text,
            'Q00049',
            MSG.Q00049(''),
            'F7 会計作成 phải hỏi Q00049 TRƯỚC khi ghi (WinForm hỏi rồi mới làm)',
        )
        // Phần tham số do chỗ gọi truyền: ngày 和暦 của 診療日 đang chọn.
        expect(
            text,
            'tham số của Q00049 phải là ngày 和暦 (`CustomDate.getWareki`), ' +
                'không được rỗng — rỗng nghĩa là eras chưa nạp hoặc trtDt mất',
        ).toMatch(WAREKI_RE)

        // frm203001.cs:430 `ShowOKCancelMsg(..., Button2)` ⇒ ？ hỏi, mặc định Cancel.
        await expectSeverity(page, 'confirm', 'Q00049: legacy dùng ShowOKCancelMsg')
        await decline('Q00049')
    })

    // ── Q00039 ──────────────────────────────────────────────────────────────

    test('Q00039 — F1 印刷 trong 来患集計 hỏi việc nạp giấy', async () => {
        await listFKey(/F3\s*当月来患/).click()
        await step()

        // Có đặt 医院パスワード thì F3 chèn ClinicPasswordDialog trước (:356).
        // Môi trường test hiện chưa đặt; nếu đặt thì BỎ QUA có log, đừng đỏ oan.
        const gate = page.getByRole('dialog').filter({ hasText: spaced('医院パスワード') })
        if (await gate.isVisible().catch(() => false)) {
            console.log('医院パスワード đang bật → BỎ QUA Q00039 (spec không giữ mật khẩu)')
            test.skip()
            return
        }

        const summary = page.getByRole('dialog').filter({ hasText: spaced('来患集計') })
        await expect(summary, 'F3 không mở được 来患集計').toBeVisible({ timeout: DIALOG_TIMEOUT })

        // Bó vào dialog: màn nền cũng có thanh F-key với F1 (Rule 10.3).
        await summary.getByRole('button', { name: 'F1 印刷' }).first().click()
        await step()

        const text = await nextDialogText(page, 'confirm — Q00039 用紙セット', DIALOG_TIMEOUT)
        expectMsg(
            text,
            'Q00039',
            // frm203046.cs:156 truyền `" "` — row là `{0}プリンタに…` nên tham số
            // KHÔNG được bỏ, bỏ là mất luôn cụm 「プリンタに」.
            MSG.Q00039(PRINTER_NAME_BLANK),
            'F1 印刷 phải hỏi Q00039 TRƯỚC khi dựng datasource / gửi sang agent',
        )

        // frm203046.cs:156 `ShowOKCancelMsg("Q00039", " ")` ⇒ ？ hỏi.
        await expectSeverity(page, 'confirm', 'Q00039: legacy dùng ShowOKCancelMsg')
        await decline('Q00039')

        await summary.getByRole('button', { name: 'F10 戻る' }).first().click()
        await expect(summary, 'F10 戻る không đóng được 来患集計').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })
})
