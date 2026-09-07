/**
 * Login — thay khối 4 dòng đang được chép nguyên văn ở 68/70 spec.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * KHỐI ĐANG BỊ CHÉP (giống nhau tuyệt đối, chỉ khác câu thông báo lỗi)
 * ═══════════════════════════════════════════════════════════════════════════
 *     await page.goto('/login', { waitUntil: 'domcontentloaded' })
 *     await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
 *     await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
 *     await page.getByRole('button', { name: JA.submit }).click()
 *     await expect(page).toHaveURL(/\/$/)
 *
 * `{ exact: true }` cho ô パスワード là BẮT BUỘC, không phải trang trí: màn login
 * còn có 「パスワードをお忘れですか」 nên `getByLabel('パスワード')` trần khớp 2 phần
 * tử → strict mode violation (GUIDELINE Rule 10.3).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ MỖI LẦN GỌI HÀM NÀY LÀ MỘT LẦN LOGIN — NGÂN SÁCH LÀ 10 (Rule 10.1)
 * ═══════════════════════════════════════════════════════════════════════════
 * App đặt `Login PermitLimit = 10` login / khung thời gian, và limit CỘNG DỒN
 * chứ không reset mỗi lần chạy. Hiện suite có 71 chỗ gọi login ⇒ KHÔNG chạy nổi
 * cả suite một lượt. Muốn chạy được thì spec phải lấy page qua
 * `_shared/session.ts` (fixture worker-scope, login 1 lần / worker) chứ không
 * gọi thẳng `login()` trong `beforeAll` của từng file.
 *
 * `storageState` KHÔNG thay được hàm này: accessToken chỉ nằm trong RAM
 * (zustand không persist), nạp lại từ cookie `rt` thì vào được app nhưng data
 * bệnh nhân không load — đã thử và ghi lại ở GUIDELINE Rule 10.2.
 */
import { expect, type Page } from '@playwright/test'

import { ADMIN_USER, JA } from './test-data'

/**
 * Câu nhắc rate-limit. Bám vào assert cuối cùng của login vì đó là chỗ triệu
 * chứng hiện ra: URL đứng nguyên ở `/login`, không có lỗi nào khác.
 */
export const RATE_LIMIT_HINT =
    'login không vào được — chạy nhiều lần liên tiếp thì đang dính rate-limit, ' +
    'chờ ~4 phút chứ đừng sửa test (Rule 9 / 10.1)'

/**
 * Đăng nhập bằng tài khoản admin rồi chờ về dashboard.
 *
 * Kết thúc khi URL rơi về gốc (`/`) — đúng assert mà 68 spec đang dùng. KHÔNG
 * chờ thêm gì ở đây: mỗi màn hình có mốc "sẵn sàng" riêng (lưới, thanh F-key,
 * heading…) và việc chờ mốc đó là của `entry.ts` hoặc của chính spec.
 */
export async function login(page: Page): Promise<void> {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(page, RATE_LIMIT_HINT).toHaveURL(/\/$/)
}
