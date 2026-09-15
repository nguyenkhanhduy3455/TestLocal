/**
 * MSGTBL parity — 紹介状 (frm203053, Shift+F3): xoá xong phải báo **I00003**,
 * không phải I00002.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO CÓ SPEC NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 * Bản port gọi `ja.I00002()` sau khi xoá template thành công. Legacy KHÔNG dùng
 * I00002 cho nhánh xoá:
 *
 *   - I00002 chỉ ra ở nhánh CẬP NHẬT — frm503004.cs:405-410 `if (updFlg) msgId = "I00002";`
 *   - Nhánh XOÁ dùng I00003 — frm902003.cs:1020, frm303001.cs:1349, frm201001.cs:1824
 *
 * Sai mã kiểu này không có gì đỏ: cả hai đều là hộp info, đều đóng được, API vẫn
 * 2xx, template vẫn bị xoá thật. Chỉ chữ hiện ra là sai. Sửa ở commit 1e5afabb7.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source
 * ═══════════════════════════════════════════════════════════════════════════
 *  - shared/locales/ja-msgtbl.ts
 *      · I00001 「登録が完了しました。」
 *      · I00003 「削除が完了しました。」  ← chuỗi spec này ghim
 *      · Q00002 「更新してよろしいですか？」 / Q00003 「削除してよろしいですか？」
 *      · I00002 「更新が完了しました。」 — KHÔNG được xuất hiện ở luồng xoá
 *  - features/treatments/components/referral-letter-dialog.tsx
 *      · Dialog mở bằng Shift+F3 (ON_LAYER F3 = 「紹介状」 —
 *        treatment-entry-detail.tsx:2411 `setReferralLetterOpen(true)`).
 *      · F2 保存 (:267-300): E00001 nếu 発行済呼出し trống → byte-cap →
 *        confirm Q00002 → POST → `setTemplateId(String(newRow.id))` → alert I00001.
 *        ⇒ Sau khi lưu, combobox TỰ trỏ vào id vừa tạo, nên F3 xoá được ngay.
 *      · F3 削除 (:315-334): E00001 nếu trống → `parseTemplateId` (id phải là số
 *        dương, nên tên vừa gõ mà chưa lưu thì im lặng) → confirm Q00003 →
 *        DELETE → alert I00003 severity 'info'.
 *      · 発行済呼出し là `Combobox creatable`: gõ tên mới rồi BLUR thì
 *        `finalizeInput → tryCreate → onValueChange(text)` (shared/ui/combobox.tsx:187-196).
 *        ⇒ phải blur, gõ xong để nguyên đó là chưa có value.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Spec TỰ TẠO template rồi TỰ XOÁ chính nó — đó là nội dung được đo, nên không
 * mượn dữ liệu có sẵn (xoá nhầm template thật là mất luôn). Vì có GHI DB nên
 * phải bật `TEST_ALLOW_SAVE=1`.
 *
 * `afterAll` dọn thêm bằng SQL khi có TEST_DB=1, phòng khi test đứt giữa chừng
 * (đã lưu nhưng chưa kịp xoá) — bảng `shoukai_tmp` không có cột soft-delete.
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): TC-2 xoá đúng dòng mà TC-1
 * vừa tạo. Chạy lẻ TC-2 sẽ fail. Một TC đỏ ⇒ TC sau bị skip.
 */
import { type Page } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { openTreatmentEntry } from '../_shared/entry'
import { allowSave, patNo, trtDt } from '../_shared/env'
import { captureMsg } from '../_shared/msgtbl'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/** Bệnh nhân/ngày chuẩn của nhóm dialogs-management — lưới chắc chắn có dữ liệu. */
const PAT_NO = patNo('12138')
const TRT_DT = trtDt('2025-12-24')

/** Tên template do spec tạo. Có timestamp để chạy lại nhiều lần không đụng nhau. */
const TEMPLATE_PREFIX = 'E2E-msgtbl-'
const TEMPLATE_NM = `${TEMPLATE_PREFIX}${Date.now()}`

// ── Chuỗi phải hiện, NGUYÊN VĂN ─────────────────────────────────────────────
const Q00002 = '更新してよろしいですか？'
const Q00003 = '削除してよろしいですか？'
const I00001 = '登録が完了しました。'
const I00003 = '削除が完了しました。'

/** Chuỗi của bản CŨ — thấy lại nghĩa là bản sửa chưa tới được browser. */
const I00002_STALE = '削除しました。'
/** I00002 bản mới — đúng chữ nhưng SAI CHỖ nếu bung ra ở luồng xoá. */
const I00002_UPDATE = '更新が完了しました。'

const DIALOG_TIMEOUT = 30_000

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(
    !allowSave,
    'Cần TEST_ALLOW_SAVE=1: spec GHI DB thật (tạo 1 dòng shoukai_tmp rồi tự xoá)',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('MSGTBL parity — 紹介状 xoá template báo I00003', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        // Confirm 算定 bung ra khi lưới nạp xong và NUỐT phím — Shift+F3 sẽ rơi
        // vào hư không nếu không dọn (Rule 14).
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
    })

    test.afterAll(async () => {
        // Dọn phòng hờ: test đứt sau khi lưu mà chưa xoá thì dòng rác vẫn nằm lại.
        if (dbEnabled) {
            await withDb(async (c) => {
                await c.query('DELETE FROM shoukai_tmp WHERE template_nm LIKE $1', [
                    `${TEMPLATE_PREFIX}%`,
                ])
            }).catch(() => undefined)
        }
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ── Điều khiển dialog ───────────────────────────────────────────────────

    /**
     * Bó theo TEXT TRONG THÂN, không theo title: title bị giãn chữ thành
     * 「紹 介 状」 nên `getByRole('dialog', { name: '紹介状' })` không khớp (Rule 13.1).
     */
    function referralDialog() {
        return page.getByRole('dialog').filter({ hasText: '発行済呼出し' })
    }

    /**
     * Ô 発行済呼出し.
     *
     * FieldRow của dialog này render nhãn bằng `<div>`, KHÔNG phải `<label>`
     * (a11y tree: `generic: 発行済呼出し` → `textbox "-- 呼出 --"`), nên không bám
     * nhãn được. Placeholder là thứ duy nhất chỉ nó có — 担当医 ngay bên trên cũng
     * là Combobox nhưng placeholder 「-- 選択 --」.
     *
     * FACT referral-letter-dialog.tsx:569 — placeholder đổi thành 「読込中…」 khi
     * danh sách template chưa về, nên phải CHỜ nó chứ không bấm ngay.
     */
    function templateCombo() {
        return referralDialog().getByPlaceholder('-- 呼出 --')
    }

    /**
     * Ô 宛名 — textbox ĐẦU TIÊN trong thân dialog (a11y tree: nó cũng là ô được
     * focus sẵn khi mở). Chỉ dùng để CLICK cho combobox mất focus: Combobox
     * creatable chỉ chốt value ở `finalizeInput`, tức lúc blur.
     */
    function atenaInput() {
        return referralDialog().getByRole('textbox').first()
    }

    /**
     * Nút F-key của CHÍNH dialog — màn 診療入力 dưới nền cũng có thanh F-key trùng
     * tên (Rule 10.3). Tên nút do FKeyBar ghép là `F<n> <label>`.
     */
    function dialogFKey(name: string) {
        return referralDialog().getByRole('button', { name }).first()
    }

    function topDialog() {
        return page.getByRole('alertdialog').first()
    }

    async function nextDialogText(what: string): Promise<string> {
        const dlg = topDialog()
        await expect(dlg, `không thấy hộp thoại nào cho ${what}`).toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
        console.log(`[${what}] 「${text}」`)
        // Spec này có helper RIÊNG (hộp thoại của 紹介状 nằm trong DraggableDialog nên
        // phải tự lấy gốc), nên phải gọi captureMsg tay — bản dùng chung ở
        // _shared/msgtbl.ts đã gọi sẵn bên trong nextDialogText.
        await captureMsg(dlg, what, text)
        return text
    }

    /** Nhãn nút KHÔNG chắc tiếng Nhật — call-site đang truyền Yes/No (Rule 13.2). */
    async function clickDialog(kind: 'accept' | 'decline'): Promise<void> {
        const name = kind === 'accept' ? /^(はい|Yes|OK)$/ : /^(いいえ|No|キャンセル|Cancel)$/
        await topDialog().getByRole('button', { name }).first().click()
        await step()
    }

    async function closeInfoDialog(what: string): Promise<void> {
        await clickDialog('accept')
        await expect(topDialog(), `đóng ${what} rồi mà hộp thoại vẫn còn`).toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    }

    // ── TC-1 ────────────────────────────────────────────────────────────────

    test('TC-1 — Shift+F3 mở 紹介状, F2 lưu template mới báo Q00002 → I00001', async () => {
        await page.keyboard.press('Shift+F3')
        await step()
        await expect(
            referralDialog(),
            'Shift+F3 không mở được 紹介状 — phím có thể bị dialog khác nuốt (Rule 14)',
        ).toBeVisible({ timeout: DIALOG_TIMEOUT })

        // Gõ tên mới vào 発行済呼出し rồi BLUR: combobox creatable chỉ chốt value ở
        // `finalizeInput`, gõ xong để nguyên là templateId vẫn rỗng → F2 chỉ ra E00001.
        const combo = templateCombo()
        await expect(combo, 'danh sách template chưa nạp xong (placeholder còn 読込中…)').toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        await combo.fill(TEMPLATE_NM)
        await step()
        await atenaInput().click()
        await step()

        await dialogFKey('F2 保存').click()
        await step()

        const confirm = await nextDialogText('confirm — Q00002 保存')
        expect(
            confirm,
            'F2 保存 phải hỏi Q00002 trước khi ghi (đúng thứ tự WinForm: hỏi rồi mới làm)',
        ).toContain(Q00002)
        await clickDialog('accept')

        const done = await nextDialogText('info — I00001 保存完了')
        expect(done, 'lưu xong phải báo I00001').toContain(I00001)
        await closeInfoDialog('I00001')
    })

    // ── TC-2 — testcase chính ───────────────────────────────────────────────

    test('TC-2 — F3 xoá template vừa tạo báo Q00003 → I00003 (KHÔNG phải I00002)', async () => {
        // Sau TC-1, combobox đang trỏ vào id vừa tạo (`setTemplateId(String(newRow.id))`),
        // nên F3 đi thẳng vào nhánh xoá thật chứ không rơi vào `parseTemplateId === null`.
        await dialogFKey('F3 削除').click()
        await step()

        const confirm = await nextDialogText('confirm — Q00003 削除')
        expect(confirm, 'F3 削除 phải hỏi Q00003 trước khi xoá').toContain(Q00003)
        await clickDialog('accept')

        const done = await nextDialogText('info — I00003 削除完了')

        expect(
            done,
            'xoá xong vẫn hiện chuỗi CŨ 「削除しました。」 — bản sửa msgtbl chưa tới được ' +
                'browser (Vite chưa reload? nhánh đang chạy chưa có commit 1e5afabb7?)',
        ).not.toContain(I00002_STALE)
        expect(
            done,
            'xoá xong mà hiện I00002「更新が完了しました。」 — call-site vẫn gọi nhầm ' +
                'ja.I00002(); legacy dùng I00002 CHỈ cho nhánh cập nhật (frm503004.cs:405-410)',
        ).not.toContain(I00002_UPDATE)
        expect(done, 'xoá xong phải báo I00003 nguyên văn theo MSGTBL').toContain(I00003)

        await closeInfoDialog('I00003')
    })

    // ── TC-3 ────────────────────────────────────────────────────────────────

    test('TC-3 — sau khi xoá, 発行済呼出し rỗng lại nên F3 ra E00001 chứ không xoá tiếp', async () => {
        // `setTemplateId('')` chạy ngay sau khi xoá ⇒ bấm F3 lần nữa KHÔNG được
        // đụng vào dòng nào khác, chỉ báo thiếu input.
        await dialogFKey('F3 削除').click()
        await step()

        const text = await nextDialogText('alert — E00001 発行済呼出し')
        expect(
            text,
            'xoá xong mà combobox không được dọn ⇒ F3 lần hai có thể xoá nhầm dòng khác',
        ).toContain('発行済呼出しが入力されていません。')
        await closeInfoDialog('E00001')

        await dialogFKey('F10 戻る').click()
        await expect(referralDialog(), 'F10 戻る không đóng được 紹介状').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })
})
