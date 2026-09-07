/**
 * Popup xen ngang của 診療入力 — cắm `addLocatorHandler` một lần, thay 51 bản chép.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BA POPUP, VÀ VÌ SAO PHẢI DỌN TỰ ĐỘNG (GUIDELINE Rule 14)
 * ═══════════════════════════════════════════════════════════════════════════
 * Cả ba đều là hành vi ĐÚNG của app (WinForm cũng bung MsgBox tương ứng). Chúng
 * đến KHÔNG theo lịch của test — sau khi lưới nạp xong, sau khi một 処置 được
 * chèn, sau một lần lưu — nên không chờ tay được, và vì là modal có overlay nên
 * chúng NUỐT mọi click lên lưới. Đó là lý do dùng `addLocatorHandler` chứ không
 * phải `waitFor` (Rule 14).
 *
 *  1. `SanteiConfirmDialog` 「〜を算定しますか？」 — bấm **No**.
 *     KHÔNG bấm Yes: Yes kéo theo カルテ記載選択 mở chồng lên (Rule 14.1).
 *     Đếm thật: 44 spec chép nguyên `getByText(/を算定しますか？/)`, 6 spec khai lại
 *     thành `const SANTEI_CONFIRM`.
 *
 *  2. `カルテ記載選択` — đóng bằng nút **F10 戻る** của chính dialog.
 *     KHÔNG bấm Escape: trong dialog này Escape = 確定 (commit), không phải huỷ
 *     (Rule 10.4). Dialog không tự tắt và che kín lưới ⇒ mọi phép đo sau đó vô
 *     nghĩa. Đã vấp thật 2026-08-25: một spec đọc "dòng cuối" ra 処置行 ngẫu nhiên
 *     vì lưới bị che.
 *
 *  3. `[role="alertdialog"]` alert お茶コン (算定チェック / SingleChk …) — bấm **OK**
 *     và LOG nội dung ra stdout. Đã vấp thật 2026-09-03: alert 「…当日算定不可です。」
 *     đến trễ rồi nằm lại, testcase sau click bị overlay chặn đủ 15s.
 *     Alert có thể XẾP HÀNG nhiều cái, mà `addLocatorHandler` đòi locator phải
 *     biến mất khi handler thoát ⇒ vòng lặp dọn hết trong MỘT lần vào handler.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ KHÔNG CÓ BỘ MẶC ĐỊNH DÙNG CHO MỌI SPEC — PHẢI KHAI TỪNG CÁI
 * ═══════════════════════════════════════════════════════════════════════════
 * Đếm thật trong repo trước khi gom: 38 spec chỉ cắm #1, 6 spec cắm #1+#2, đúng
 * 1 spec cắm cả ba, và 18 spec KHÔNG cắm cái nào. Khác biệt đó CÓ LÝ DO —
 * `karte-selection-dialog.spec.ts` cố tình bỏ #2 vì nó ĐANG ĐO chính カルテ記載選択;
 * bật #2 ở đó là tự tay đóng mất thứ cần đo. Vì vậy hàm này KHÔNG có bộ mặc định
 * "bật hết": mỗi spec khai đúng cái nó cần.
 *
 * ⚠️ PHẢI GỌI DISPOSER TRẢ VỀ. Với page dùng chung theo worker
 * (`_shared/session.ts`), handler do file A cắm sẽ SỐNG TIẾP sang file B trên
 * cùng worker — và nếu B đang đo popup mà A dọn tự động thì B đỏ theo thứ tự
 * chạy, một kiểu lỗi gần như không truy được. Nên:
 *
 *     let dispose: () => Promise<void>
 *     test.beforeAll(async ({ authedPage }) => {
 *         dispose = await installOverlayHandlers(page, { santei: true })
 *     })
 *     test.afterAll(async () => {
 *         await dispose?.()
 *         await releaseSharedPage(page)
 *     })
 */
import type { Locator, Page } from '@playwright/test'

/** 「〜を算定しますか？」 — SanteiConfirmDialog. */
export const SANTEI_CONFIRM = /を算定しますか？/

/** Nút phủ định. Nhãn theo ngôn ngữ hệ điều hành nên phải nhận cả hai (Rule 13.2). */
export const NO_BUTTON = /^(No|いいえ)$/

export interface OverlayOptions {
    /** Dọn 「〜を算定しますか？」 bằng No. Mặc định TẮT. */
    santei?: boolean
    /** Dọn カルテ記載選択 bằng F10 戻る. Mặc định TẮT. */
    kartePicker?: boolean
    /** Dọn alert お茶コン bằng OK (kèm log). Mặc định TẮT. */
    alerts?: boolean
    /**
     * Số lần tối đa mỗi handler được kích hoạt.
     *
     * Các spec đang dùng 20–60 tuỳ file. Mặc định ở đây cao hơn (200) vì page
     * lấy từ `session.ts` sống suốt một worker và phục vụ NHIỀU spec, không chỉ
     * một. Với page tự tạo trong `beforeAll` thì 30 là đủ.
     */
    times?: number
}

/**
 * Cắm các handler được yêu cầu và trả về hàm GỠ chúng.
 *
 * Gọi TRƯỚC khi điều hướng vào màn hình — popup #1 bung ngay lúc lưới nạp xong,
 * cắm sau là trễ.
 */
export async function installOverlayHandlers(
    page: Page,
    opts: OverlayOptions = {},
): Promise<() => Promise<void>> {
    const { santei = false, kartePicker = false, alerts = false, times = 200 } = opts
    const installed: Array<Locator> = []

    if (santei) {
        const loc = page.getByText(SANTEI_CONFIRM).first()
        installed.push(loc)
        await page.addLocatorHandler(
            loc,
            async () => {
                await page.getByRole('button', { name: NO_BUTTON }).first().click()
            },
            { times },
        )
    }

    if (kartePicker) {
        const loc = page.getByText('カルテ記載選択').first()
        installed.push(loc)
        await page.addLocatorHandler(
            loc,
            async () => {
                const back = page.getByRole('button', { name: /戻る/ }).last()
                if (await back.count()) await back.click()
            },
            { times },
        )
    }

    if (alerts) {
        const loc = page.locator('[role="alertdialog"]')
        installed.push(loc)
        await page.addLocatorHandler(
            loc,
            async () => {
                // Dọn CẢ HÀNG trong một lần vào: addLocatorHandler đòi locator
                // phải biến mất khi handler thoát, mà alert có thể xếp chồng.
                for (let i = 0; i < 8; i++) {
                    const box = page.locator('[role="alertdialog"]').first()
                    if (!(await box.count())) return
                    const txt = (await box.innerText().catch(() => ''))
                        .replace(/\s+/g, ' ')
                        .slice(0, 120)
                    const ok = box.getByRole('button', { name: 'OK' })
                    if (!(await ok.count())) return
                    // LOG chứ không nuốt im: alert là triệu chứng, giấu đi thì
                    // sau này không ai truy được vì sao lưới lệch.
                    console.log(`alert お茶コン tự bung → bấm OK: ${txt}`)
                    await ok
                        .first()
                        .click({ timeout: 3000 })
                        .catch(() => {})
                    await page.waitForTimeout(300)
                }
            },
            { times },
        )
    }

    /**
     * Gỡ đúng những handler hàm này đã cắm — KHÔNG đụng handler của spec khác.
     * Không ném lỗi: gọi từ `afterAll`, mà `afterAll` đỏ sẽ che mất lỗi thật.
     */
    return async () => {
        for (const loc of installed) {
            await page.removeLocatorHandler(loc).catch(() => {})
        }
    }
}

/**
 * `closeDialogs` vẫn nằm ở `virtual-grid.ts` (18 spec đang import từ đó).
 * Re-export để spec mới chỉ cần nhớ MỘT chỗ cho mọi việc dọn overlay.
 */
export { closeDialogs } from './virtual-grid'
