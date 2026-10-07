/**
 * 紹介状 (frm203053, Shift+F3) — F2 保存 / F3 削除 KHÔNG hỏi và KHÔNG báo gì.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SPEC NÀY TỪNG ĐO ĐIỀU NGƯỢC LẠI
 * ═══════════════════════════════════════════════════════════════════════════
 * Bản đầu assert `Q00002 → I00001` khi lưu và `Q00003 → I00003` khi xoá. Bốn hộp
 * thoại đó là do bản port TỰ THÊM 「for safety」, WinForm không có cái nào: cả
 * frm203053 chỉ có 11 lời gọi `MsgDialog` (E00001 ×2, Q00019, E00026, E00022 ×7)
 * và không cái nào nằm trên đường lưu/xoá. Đã gỡ ở commit `24f6210fa`.
 *
 * Vì vậy spec giờ đo hai thứ khó hơn: **không có gì hiện ra**, và **việc vẫn
 * xảy ra thật**. Chỉ assert "không có dialog" là chưa đủ — một nút chết cũng
 * thoả điều kiện đó. Nên mỗi testcase soi thẳng `shoukai_tmp` trong Postgres.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — lấy từ source
 * ═══════════════════════════════════════════════════════════════════════════
 *  - frm203053.cs:150-160 (btnF2_Click) — `comboBox2.Text` rỗng thì E00001, quá
 *    byte-cap thì E00022, ngược lại `insertTemplatedata` NGAY, không hỏi.
 *  - frm203053.cs:172-180 (btnF3_Click) — rỗng thì E00001, ngược lại
 *    `deleteTemplatedata` NGAY. Phản hồi duy nhất là combo rỗng đi.
 *  - referral-letter-dialog.tsx — mở bằng Shift+F3 (ON_LAYER F3 = 「紹介状」,
 *    treatment-entry-detail.tsx:2411). Sau khi lưu, `setTemplateId(String(newRow.id))`
 *    nên F3 xoá được ngay; sau khi xoá, `setTemplateId('')`.
 *  - 発行済呼出し là `Combobox creatable`: gõ tên mới rồi BLUR mới chốt value
 *    (`finalizeInput → tryCreate`, shared/ui/combobox.tsx:187-196).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU
 * ═══════════════════════════════════════════════════════════════════════════
 * Spec tự tạo template rồi tự xoá — đó chính là nội dung được đo. Có GHI DB nên
 * cần `TEST_ALLOW_SAVE=1`, và cần `TEST_DB=1` để soi `shoukai_tmp`.
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): TC-2 xoá đúng dòng TC-1 vừa
 * tạo. Một TC đỏ ⇒ TC sau bị skip. Page lấy từ `authedPage` ⇒ không có trace.
 */
import { type Page } from '@playwright/test'

import { dbEnabled, withDb } from '../_shared/db'
import { openTreatmentEntry } from '../_shared/entry'
import { allowSave, patNo, trtDt } from '../_shared/env'
import { captureMsg, expectSeverity } from '../_shared/msgtbl'
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
skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: không còn hộp thoại nào để đọc, bằng chứng duy nhất rằng ' +
        'lưu/xoá có chạy là dòng trong shoukai_tmp',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('紹介状 — F2 保存 / F3 削除 im lặng, đúng frm203053', () => {
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

    /** Số dòng `shoukai_tmp` mang đúng tên template của lượt chạy này. */
    async function countTemplate(): Promise<number> {
        return withDb(async (c) => {
            const r = await c.query('SELECT 1 FROM shoukai_tmp WHERE template_nm = $1', [
                TEMPLATE_NM,
            ])
            return r.rows.length
        })
    }

    /**
     * Không hộp thoại nào được bung ra.
     *
     * Chờ một nhịp ngắn rồi mới soi: nếu assert ngay lập tức thì một hộp hiện
     * chậm 200ms vẫn lọt. `toBeHidden` của Playwright tự retry nên nó chỉ chứng
     * minh "cuối cùng thì ẩn", không chứng minh "chưa từng hiện" — vì vậy dùng
     * `count()` sau khi trạng thái đã ổn định (DB đã đổi).
     */
    async function expectNoDialog(what: string): Promise<void> {
        const n = await page.getByRole('alertdialog').count()
        expect(n, `${what}: WinForm không bung hộp thoại nào, web lại có ${n} cái`).toBe(0)
    }

    // ── TC-1 ────────────────────────────────────────────────────────────────

    test('TC-1 — F2 保存 ghi thẳng, không hỏi Q00002 và không báo I00001', async () => {
        await page.keyboard.press('Shift+F3')
        await step()
        await expect(
            referralDialog(),
            'Shift+F3 không mở được 紹介状 — phím có thể bị dialog khác nuốt (Rule 14)',
        ).toBeVisible({ timeout: DIALOG_TIMEOUT })

        const combo = templateCombo()
        await expect(combo, 'danh sách template chưa nạp xong (placeholder còn 読込中…)').toBeVisible({
            timeout: DIALOG_TIMEOUT,
        })
        await combo.fill(TEMPLATE_NM)
        await step()
        // Combobox creatable chỉ chốt value lúc blur; chưa blur thì F2 chỉ ra E00001.
        await atenaInput().click()
        await step()

        expect(await countTemplate(), 'dòng đã tồn tại trước khi bấm F2?').toBe(0)

        await dialogFKey('F2 保存').click()
        await step()

        // Bằng chứng việc lưu CÓ chạy: dòng xuất hiện trong DB. Không có hộp
        // thoại nào để chờ nên phải chờ ở đây.
        await expect
            .poll(countTemplate, {
                timeout: DIALOG_TIMEOUT,
                message:
                    'F2 保存 không tạo được dòng shoukai_tmp nào — nút chết, hay byte-cap ' +
                    'chặn (E00022), hay combo chưa chốt value?',
            })
            .toBe(1)

        await expectNoDialog('F2 保存')
    })

    // ── TC-2 ────────────────────────────────────────────────────────────────

    test('TC-2 — F3 削除 xoá thẳng, không hỏi Q00003 và không báo I00003', async () => {
        // Sau TC-1 combo đang trỏ vào id vừa tạo (`setTemplateId(String(newRow.id))`).
        await dialogFKey('F3 削除').click()
        await step()

        await expect
            .poll(countTemplate, {
                timeout: DIALOG_TIMEOUT,
                message: 'F3 削除 không xoá được dòng shoukai_tmp',
            })
            .toBe(0)

        await expectNoDialog('F3 削除')

        // Phản hồi duy nhất của WinForm: combo rỗng đi (`setTemplateId('')`).
        await expect(
            templateCombo(),
            'xoá xong mà 発行済呼出し vẫn giữ lựa chọn cũ ⇒ F3 lần nữa có thể xoá nhầm dòng khác',
        ).toHaveValue('')
    })

    // ── TC-3 ────────────────────────────────────────────────────────────────

    test('TC-3 — F3 với 発行済呼出し rỗng vẫn báo E00001 (đây là hộp duy nhất còn lại)', async () => {
        await dialogFKey('F3 削除').click()
        await step()

        const text = await nextDialogText('alert — E00001 発行済呼出し')
        expect(
            text,
            'combo rỗng thì frm203053.cs:177 vẫn ShowErrorMsg("E00001", "発行済呼出し")',
        ).toContain('発行済呼出しが入力されていません。')
        // frm203053.cs:157/177 `ShowErrorMsg` ⇒ ✕ đỏ.
        await expectSeverity(page, 'error', 'E00001: legacy dùng ShowErrorMsg')
        await closeInfoDialog('E00001')

        await dialogFKey('F10 戻る').click()
        await expect(referralDialog(), 'F10 戻る không đóng được 紹介状').toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    })
})
