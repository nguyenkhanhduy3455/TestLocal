import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'
import dotenv from 'dotenv'

// Nạp .env (nếu có) TRƯỚC khi đọc bất kỳ process.env nào bên dưới — mọi biến
// (BASE_URL, TEST_DB*, TEST_VIEWPORT*, TEST_ADMIN_*, …) khai một lần ở .env thay
// vì gõ trước mỗi lệnh. Config load trước khi Playwright nạp test files, nên
// tests/db.ts cũng thấy các biến này. `.env` KHÔNG commit (copy từ .env.example).
//
// NEO theo thư mục file config, KHÔNG theo process.cwd(): khi chạy Playwright từ
// thư mục cha (vd `TestLocal/`) thì cwd không phải nơi có .env, dotenv mặc định
// tìm nhầm và inject 0 biến. `__dirname` = thư mục config (Playwright chạy config
// dưới CommonJS, nên dùng __dirname thay cho import.meta để tránh lỗi transpile).
dotenv.config({ path: path.resolve(__dirname, '.env') })

/**
 * Playwright config for web-tenant.
 *
 * The app runs on a local self-signed HTTPS domain (*.ochacom.local), so
 * `ignoreHTTPSErrors` is required — without it every navigation fails the
 * certificate check.
 *
 * VIEWPORT — `devices['Desktop Chrome']` mặc định 1280×720, THẤP hơn chiều cao
 * các dialog lớn (vd 補管・義歯 khai 1120×840). DraggableDialog kẹp size theo
 * viewport nên trên 720px nó bị cắt và các testcase kiểm tra width/height /
 * "không cuộn khi mở" sẽ sai. Đây là VIEWPORT (vùng render Playwright dùng),
 * KHÔNG phải kích thước cửa sổ thật — cố định nó cho lớn thì mọi test kích thước
 * chạy deterministic bất kể màn hình, kể cả headless.
 *
 * Chỉnh nhanh cho một lần chạy:
 *   TEST_VIEWPORT_W=1920 TEST_VIEWPORT_H=1080 npx playwright test
 *
 * Muốn CỬA SỔ THẬT to hết cỡ khi xem `--headed`: cửa sổ khớp với viewport dưới
 * đây (args --window-size), nên nâng viewport lên là cửa sổ cũng to theo. KHÔNG
 * dùng `--start-maximized` + `viewport: null`: nó trả kích thước về màn hình
 * thật → mỗi máy một kết quả, làm hỏng chính các test đo width/height.
 */
const VIEWPORT = {
  width: Number(process.env.TEST_VIEWPORT_W ?? 1600),
  height: Number(process.env.TEST_VIEWPORT_H ?? 1000),
}
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 4,
  // Generous: against the Vite *dev* server a cold module-graph transform can
  // push a single navigation past 60s. Lower these if you point BASE_URL at a
  // production build (`vite preview`), where navigations settle in ~1s.
  timeout: 120_000,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: process.env.BASE_URL ?? 'https://tenant1.ochacom.local/',
    ignoreHTTPSErrors: true,
    navigationTimeout: 90_000,
    actionTimeout: 15_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ja-JP',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Vùng render (áp cả headless lẫn headed) — nguồn chân lý cho layout tests.
        viewport: VIEWPORT,
        // Khi --headed: cho cửa sổ trình duyệt thật khớp viewport (đỡ scrollbar
        // của chrome ngoài), đặt góc trên-trái để không lệch ra ngoài màn.
        launchOptions: {
          args: [`--window-size=${VIEWPORT.width},${VIEWPORT.height}`, '--window-position=0,0'],
        },
      },
    },
  ],
})
