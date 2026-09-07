/**
 * Đường vào hai màn hình mà gần như mọi spec đều phải đi qua — thay 15 bản
 * `openTreatmentScreen()` viết tay và ~45 lần lặp đoạn goto + chờ lưới.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO URL TRẦN, KHÔNG CÓ `inpKbn`
 * ═══════════════════════════════════════════════════════════════════════════
 * Đo thật 2026-08-25, cùng bệnh nhân 10 / ngày 2026-08-03:
 *   · `/treatments/10?trtDt=2026-08-03`              → 合計 409 点, 実日数 2日
 *     — ĐÚNG bằng WinForm và bằng DB;
 *   · thêm `&inpKbn=update`                          → lưới RỖNG (0 点 / 0日).
 * Tức đường vào đúng là URL trần, giống hệt cái người dùng gõ trên trình duyệt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHẢI NẠP LẠI TỚI 3 LẦN
 * ═══════════════════════════════════════════════════════════════════════════
 * Vite **dev** server thỉnh thoảng nhả hụt một module `/src/*.ts`; khi đó React
 * không mount và lưới rỗng vĩnh viễn — chờ thêm bao lâu cũng vô ích, chỉ `goto`
 * lại mới cứu được. 13 spec đã tự mọc ra vòng retry này; gom về đây.
 * Đây KHÔNG phải `sleep` trá hình (Rule 7): mỗi vòng vẫn là `expect` auto-wait,
 * retry chỉ xử lý một chế độ hỏng đã xác định của dev server.
 */
import { expect, type Browser, type Page } from '@playwright/test'

import {
    BASE_URL,
    GRID_LOAD_ATTEMPTS,
    GRID_LOAD_TIMEOUT,
    GRID_RELOAD_TIMEOUT,
} from './env'
import { closeDialogs } from './virtual-grid'

/** Ô 療法・処置 của mọi dòng lưới — `RegiCol.ryo = 2` (frm203002.cs:158-169). */
export const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

/**
 * Page tự tạo cho khối `describe.serial` (Rule 19).
 *
 * ⚠️ `browser.newPage()` KHÔNG kế thừa `use` của `playwright.config.ts` — phải
 * truyền tay `ignoreHTTPSErrors` (cert tự ký `*.ochacom.local`) và `locale`.
 * 26 spec đang gọi `browser.newPage()` trần: chúng chạy được là nhờ `baseURL`
 * mặc định trùng, nhưng mất `locale: 'ja-JP'`.
 *
 * `pageerror` được log ra vì lỗi JS chưa bắt làm React không mount → lưới rỗng
 * và test đỏ ở một chỗ hoàn toàn không liên quan.
 */
export async function newTestPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage({
        baseURL: BASE_URL,
        ignoreHTTPSErrors: true,
        locale: 'ja-JP',
    })
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))
    return page
}

/**
 * Mở 診療入力 của một bệnh nhân / một ngày, chờ lưới có dữ liệu, rồi dọn dialog.
 *
 * Dùng cả cho lần vào đầu tiên lẫn mỗi lần cần "về trạng thái sạch" — nó luôn
 * `goto` mới nên xoá sạch state của testcase trước, điều bắt buộc khi page dùng
 * chung theo worker (`session.ts`).
 */
export async function openTreatmentEntry(
    page: Page,
    patNo: string,
    trtDt: string,
): Promise<void> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
        await page.goto(`/treatments/${patNo}?trtDt=${trtDt}`, {
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
            console.log(
                `openTreatmentEntry: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới ` +
                    '(nhiều khả năng Vite dev server nhả hụt một module /src/*.ts) — nạp lại',
            )
        }
    }
    throw lastErr
}

/**
 * Mở màn danh sách 受付患者一覧 (`/treatments`) và chờ nó nhận được phím.
 *
 * Mốc "sẵn sàng" là một nút trên thanh F-key — thanh này dựng SAU khi danh sách
 * nạp xong, nên nó thấy được nghĩa là màn hình đã ăn phím. Spec truyền vào phím
 * mà chính nó sắp bấm (F3 当月来患 / F4 当日来患 / F7 会計作成 / F8 閲覧 / F11 設定),
 * như vậy assert chờ đúng thứ sắp dùng chứ không chờ một mốc chung chung.
 */
export async function openTreatmentList(page: Page, readyFKey = 'F4'): Promise<void> {
    await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
    await expect(
        page.locator(`[data-fkey="${readyFKey}"]`),
        `Màn 受付患者一覧 chưa dựng xong thanh F-key (không thấy ${readyFKey})`,
    ).toBeVisible({ timeout: GRID_LOAD_TIMEOUT })
}
