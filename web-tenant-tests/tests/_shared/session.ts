/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIXTURE `authedPage` — MỘT LẦN LOGIN CHO CẢ MỘT WORKER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * VẤN ĐỀ NÓ GIẢI QUYẾT
 * ────────────────────
 * App đặt `Login PermitLimit = 10` login / khung thời gian, và limit CỘNG DỒN
 * theo thời gian chứ không reset mỗi lần chạy (GUIDELINE Rule 10.1). Hiện suite
 * có **71 chỗ gọi login trên 68/70 spec** — mỗi file tự `browser.newPage()` rồi
 * tự đăng nhập trong `beforeAll`. Hệ quả: **chạy cả suite một lượt là bất khả
 * thi**, chỉ chạy được từng file lẻ.
 *
 * `storageState` — cách chuẩn của Playwright — KHÔNG dùng được ở app này:
 * accessToken chỉ nằm trong RAM (zustand không persist), nạp lại từ cookie `rt`
 * thì vào được app nhưng data bệnh nhân không load (Rule 10.2). Đã thử, đừng
 * thử lại.
 *
 * Còn lại đúng một đường: **dùng chung một `Page` đã đăng nhập trong suốt vòng
 * đời của worker process**. Playwright chạy nhiều file tuần tự trên cùng một
 * worker, nên fixture worker-scope được khởi tạo MỘT lần rồi tái dùng.
 *
 *     71 login  →  bằng số worker (`workers: 4` ở local, 1 ở CI)
 *
 * CÁCH DÙNG
 * ─────────
 *     import { expect, test } from './_shared/session'      // KHÔNG import từ
 *                                                           // '@playwright/test'
 *     import { openTreatmentEntry } from './_shared/entry'
 *
 *     test.describe.configure({ mode: 'serial', timeout: 300_000 })
 *
 *     test.describe('診療入力 — …', () => {
 *         let page: Page
 *
 *         test.beforeAll(async ({ authedPage }) => {
 *             page = authedPage                              // KHÔNG tự login
 *             await openTreatmentEntry(page, PAT_NO, TRT_DT) // goto mới = state sạch
 *         })
 *
 *         test.afterAll(async () => {
 *             await releaseSharedPage(page)                  // KHÔNG page.close()
 *         })
 *     })
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ NĂM CÁI BẪY — ĐỌC TRƯỚC KHI CHUYỂN MỘT SPEC SANG FIXTURE NÀY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **TUYỆT ĐỐI KHÔNG `page.close()` trong `afterAll`.** Page thuộc về worker,
 *    không thuộc về file. Đóng nó thì mọi file chạy sau trên cùng worker sẽ nổ
 *    ở dòng đầu tiên với "Target page … has been closed". Dùng
 *    `releaseSharedPage()` bên dưới.
 *
 * 2. **`addLocatorHandler` RÒ SANG FILE SAU.** Handler dọn popup do file A cắm
 *    vẫn sống khi file B chạy trên cùng worker. Nếu B đang ĐO chính popup đó
 *    (`karte-selection-dialog`, `cmt-auto-picker-*` đo カルテ記載選択) thì B đỏ hay
 *    xanh tuỳ thứ tự chạy. Luôn gọi disposer mà `installOverlayHandlers` trả về.
 *
 * 3. **`page.route(...)` RÒ SANG FILE SAU.** Spec nào stub route (kasan-buttons,
 *    auto-santei-*, p0-save-side-effects…) mà không gỡ thì file kế tiếp trên
 *    cùng worker vẫn ăn stub đó — và triệu chứng sẽ hiện ra ở một spec hoàn toàn
 *    không liên quan, cực khó truy. `releaseSharedPage()` gọi `unrouteAll()`.
 *
 * 4. **State màn hình rò sang file sau.** Không có `newPage()` nữa thì dialog
 *    còn mở, con trỏ lưới, tab side-panel… đều còn nguyên. Mọi spec PHẢI mở màn
 *    hình bằng `openTreatmentEntry()` / `openTreatmentList()` trong `beforeAll`
 *    — hai hàm đó luôn `goto` mới nên đó chính là chỗ reset.
 *
 * 5. **`retries` sinh worker mới ⇒ login thêm.** `playwright.config.ts` đặt
 *    `retries: 1` ở local. Một file đỏ → worker bị thay → thêm một login. Khi
 *    đang dò rate-limit thì chạy `--retries=0`.
 *
 * Spec KHÔNG hợp với fixture này (cứ giữ `newTestPage()` + `login()` riêng):
 *   · spec cần trạng thái đăng nhập KHÁC admin — `user-master/user-master.spec.ts` login 3
 *     lần bằng 3 tài khoản, đó là nội dung được đo chứ không phải chi phí;
 *   · spec đo chính màn `/login` hoặc `/activate-login`;
 *   · spec đổi `viewport` / `locale` riêng.
 */
import { test as base, type Page } from '@playwright/test'

import { login } from './auth'
import { newTestPage } from './entry'

interface SharedWorkerFixtures {
    /**
     * Page đã đăng nhập, dùng chung cho mọi spec chạy trên worker này. Lấy được
     * ở `beforeAll` vì fixture là worker-scope (fixture test-scope thì KHÔNG
     * dùng được trong `beforeAll`).
     *
     * Fixture CỐ Ý không cắm sẵn overlay handler nào: mỗi spec có bộ riêng và
     * spec đang ĐO một popup thì không được dọn popup đó (xem `overlays.ts`).
     */
    authedPage: Page
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- không thêm fixture test-scope nào
export const test = base.extend<{}, SharedWorkerFixtures>({
    authedPage: [
        async ({ browser }, use) => {
            const page = await newTestPage(browser)
            await login(page)
            await use(page)
            await page.close()
        },
        { scope: 'worker' },
    ],
})

export { expect } from '@playwright/test'

/**
 * Gọi trong `afterAll` của spec dùng `authedPage` — thay cho `page.close()`.
 *
 * Gỡ mọi route stub và đóng dialog còn sót, để file chạy kế tiếp trên cùng
 * worker nhận được một page trung tính. Không ném lỗi: `afterAll` đỏ sẽ che mất
 * lỗi thật của testcase.
 */
export async function releaseSharedPage(page: Page | undefined): Promise<void> {
    if (!page || page.isClosed()) return
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
}
