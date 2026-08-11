# Playwright cơ bản — web-tenant

Tài liệu cho người mới bắt đầu, viết theo đúng project này.

> Quy tắc bắt buộc khi viết test xem ở **[GUIDELINE.md](./GUIDELINE.md)**. File này chỉ dạy dùng Playwright.

---

## 1. Playwright là gì?

Playwright mở một trình duyệt thật, tự động thao tác (gõ chữ, click, điều hướng) rồi kiểm tra kết quả — giống hệt việc bạn tự test tay, nhưng chạy bằng script và lặp lại được vô hạn.

Ba khái niệm cần nắm:

| Khái niệm | Là gì |
|---|---|
| **Test** | Một kịch bản, ví dụ "login thành công" |
| **Locator** | Cách tìm một phần tử trên trang (ô input, nút bấm) |
| **Assertion** | Câu khẳng định "cái này phải đúng", nếu sai → test fail |

---

## 2. Chạy test

Mọi lệnh chạy trong thư mục `web-tenant-tests`:

```bash
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
```

> **Lưu ý:** phải `cd` đúng thư mục này. Chạy từ thư mục cha, Playwright không thấy `playwright.config.ts` → mất `baseURL`, mất cấu hình bỏ qua lỗi SSL, và test sẽ fail rất khó hiểu.

| Lệnh | Dùng khi nào |
|---|---|
| `npm test` | Chạy tất cả, chạy ngầm không hiện trình duyệt (nhanh nhất) |
| `npm run test:headed` | Hiện trình duyệt để bạn nhìn thấy nó thao tác |
| `npm run test:ui` | **Chế độ tốt nhất khi mới học** — giao diện xem lại từng bước |
| `npm run report` | Mở báo cáo HTML sau khi chạy |
| `npm run codegen` | Playwright tự sinh code khi bạn click tay trên web |

**Điều kiện tiên quyết:** app `web-tenant` phải đang chạy tại `https://tenant1.ochacom.local/`. Test không tự khởi động app.

Chạy một test cụ thể theo tên:

```bash
npx playwright test -g "đăng nhập thành công"
```

---

## 3. Đọc kết quả

```
✓ 1 [chromium] › tests/login.spec.ts:10:7 › Login › đăng nhập thành công (3.2s)
  2 passed (3.2s)
```

`✓` là pass, `✘` là fail. Khi fail, Playwright in ra:
- **Locator** nó đang tìm
- **Expected / Received** — mong đợi gì, nhận được gì
- **Call log** — nó đã chờ ở đâu

Kèm theo screenshot + video trong `test-results/` (đã cấu hình chỉ lưu khi fail).

**Đọc kỹ dòng `Error:` đầu tiên trước khi sửa.** Đây là lỗi phổ biến nhất của người mới: đoán nguyên nhân thay vì đọc thông báo. Bản thân tôi lúc dựng project này cũng mất vài lượt vì đoán mò.

---

## 4. Cấu trúc một file test

```ts
import { expect, test } from '@playwright/test'

test.describe('Login', () => {          // nhóm các test liên quan
  test.beforeEach(async ({ page }) => { // chạy trước MỖI test
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
  })

  test('đăng nhập thành công vào dashboard', async ({ page }) => {
    // ... các bước
  })
})
```

- `page` là tab trình duyệt, Playwright tự đưa vào cho bạn.
- **`await` ở mọi thao tác.** Quên `await` là nguồn gốc của lỗi kỳ lạ nhất trong Playwright.
- Mỗi test chạy trong một trình duyệt sạch, không dính cookie/session của test khác. Nên test này không phụ thuộc test kia.
- `/login` là đường dẫn tương đối — nó được ghép với `baseURL` trong config.

---

## 5. Locator — tìm phần tử

Ưu tiên theo thứ tự này (trên xuống dưới là từ tốt đến kém):

```ts
page.getByRole('button', { name: 'ログイン' })  // theo vai trò + tên → tốt nhất
page.getByLabel('メールアドレス')                // ô input theo label
page.getByPlaceholder('メールアドレスを入力')    // theo placeholder
page.getByText('ダッシュボード')                 // theo chữ hiển thị
page.locator('.btn-primary')                    // theo CSS → tránh, dễ vỡ khi đổi Tailwind class
```

Lý do `getByRole` tốt nhất: nó dựa trên thứ người dùng (và trình đọc màn hình) thực sự thấy, nên không vỡ khi bạn đổi class CSS hay cấu trúc `div`.

### ⚠️ Giao diện app này là tiếng Nhật

Đây là điểm dễ vấp nhất. Không có nút "Đăng nhập" — chuỗi thật lấy từ `src/features/auth/locales/ja.ts`:

| Ý nghĩa | Chuỗi thật |
|---|---|
| Email | `メールアドレス` |
| Mật khẩu | `パスワード` |
| Nút đăng nhập | `ログイン` |
| Dashboard | `ダッシュボード` |

Các chuỗi này gom trong `tests/test-data.ts` (object `JA`) để không phải rải tiếng Nhật khắp file test.

### Lỗi strict mode

Playwright **cố tình fail** nếu một locator khớp nhiều hơn 1 phần tử:

```
strict mode violation: resolved to 2 elements
```

Đây là tính năng, không phải bug — nó ngăn test click nhầm chỗ. Cách xử lý:

```ts
page.getByRole('heading', { name: 'ダッシュボード', level: 1 })  // thêm điều kiện cho cụ thể
page.getByLabel('パスワード', { exact: true })                   // khớp chính xác, không khớp một phần
page.getByRole('button', { name: 'ログイン' }).first()           // lấy cái đầu → giải pháp cuối
```

Trong project này ta gặp thật: trang dashboard in chữ `ダッシュボード` ở cả `h1` lẫn `h2`, nên phải chốt `level: 1`.

---

## 6. Thao tác và assertion

```ts
await page.getByLabel('メールアドレス').fill('user@example.com')  // điền
await page.getByRole('button', { name: 'ログイン' }).click()      // click
await page.getByRole('checkbox').check()                          // tick
await page.getByRole('combobox').selectOption('value')            // chọn dropdown
```

Assertion — **luôn có `await expect`**:

```ts
await expect(page).toHaveURL(/\/$/)                    // URL khớp regex
await expect(page.getByRole('alert')).toBeVisible()    // phần tử hiện ra
await expect(locator).toBeHidden()                     // biến mất
await expect(locator).toHaveText('xin chào')           // đúng nội dung
await expect(locator).toBeEnabled()                    // bấm được
```

### Auto-waiting — đừng dùng sleep

`await expect(...).toBeVisible()` sẽ **tự động chờ và thử lại** cho tới khi đúng (mặc định 5 giây). Bạn không cần `waitForTimeout`.

```ts
await page.waitForTimeout(3000)   // ❌ đừng — chậm và vẫn flaky
await expect(x).toBeVisible()     // ✅ chờ đúng lúc cần, không thừa một ms
```

Đây là điều làm Playwright khác Selenium: bạn không phải tự quản lý việc chờ.

---

## 7. Debug khi test fail

**Cách tốt nhất — UI mode:**

```bash
npm run test:ui
```

Bấm vào từng bước, xem ảnh chụp trang tại đúng thời điểm đó, và dùng "Pick locator" để trỏ chuột vào phần tử → nó sinh sẵn code locator cho bạn.

**Chạy chậm để nhìn bằng mắt:**

```bash
npx playwright test --headed --debug
```

**Sinh code tự động:** `npm run codegen` mở trình duyệt, bạn click tay, Playwright viết code ra. Rất hợp để viết test mới nhanh, nhưng nhớ dọn lại locator cho gọn — codegen đôi khi chọn CSS selector xấu.

---

## 8. Viết thêm một test mới

Tạo `tests/patients.spec.ts`. Vì mỗi test bắt đầu với trình duyệt sạch, muốn test trang nội bộ thì phải login trước:

```ts
import { expect, test } from '@playwright/test'
import { ADMIN_USER, JA } from './test-data'

test('xem danh sách bệnh nhân', async ({ page }) => {
  // login
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
  await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
  await page.getByRole('button', { name: JA.submit }).click()
  await expect(page).toHaveURL(/\/$/)

  // sang trang cần test
  await page.goto('/patients-list', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
```

Route hợp lệ xem trong `apps/web-tenant/src/routes/_authenticated/`.

> Ví dụ trên **chưa chạy kiểm chứng được** vì app đang 502 lúc tôi viết tài liệu này. Phần login là y hệt `login.spec.ts` (đã pass thật), nhưng dòng assert `heading level 1` của trang `/patients-list` là suy đoán từ code — hãy chạy thử và chỉnh lại nếu cần.

> Khi số test tăng lên, việc login lặp đi lặp lại sẽ chậm. Lúc đó tìm hiểu **`storageState`** — login một lần, lưu session, tái dùng cho mọi test. Chưa cần vội.

---

## 9. Vài điều đã biết về môi trường này

- **Dev server hay chết / restart.** Đây là nguyên nhân số 1 khiến test fail một cách khó hiểu ở đây. App chạy sau nginx; khi dev server phía sau tắt, nginx trả **502 Bad Gateway** và mọi test fail cùng lúc — thường là timeout ở `page.goto` hoặc "không tìm thấy ô email".

  **Trước khi debug test, hãy kiểm tra app còn sống không:**
  ```bash
  curl -sk -o /dev/null -w "%{http_code}\n" https://tenant1.ochacom.local/login
  ```
  `200` là app ổn → lỗi nằm ở test. `502` là app chết → khởi động lại app, test không sai gì cả.

  Vì lý do này config để `navigationTimeout: 90s` và `retries: 1` cho đỡ nhiễu.
- **HTTPS tự ký:** `ignoreHTTPSErrors: true` trong config xử lý việc này. Thiếu nó thì mọi navigate đều fail.
- **Mật khẩu đang hardcode** trong `test-data.ts`. Override được bằng biến môi trường:
  ```bash
  TEST_ADMIN_EMAIL=x@y.com TEST_ADMIN_PASSWORD=secret npm test
  ```
  Nếu push repo này lên GitHub, hãy bỏ giá trị mặc định đi — mật khẩu thật sẽ nằm vĩnh viễn trong git history.
- **App có giới hạn số lần đăng nhập sai** (`試行回数が上限に達しました` = đã vượt số lần thử). Nếu chạy test sai-mật-khẩu quá nhiều lần liên tục, tài khoản có thể bị khóa tạm thời.

---

## 10. Tóm tắt

```bash
npm test              # chạy tất cả
npm run test:ui       # debug trực quan (dùng cái này khi mới học)
npm run report        # xem báo cáo lần chạy gần nhất
```

Ba quy tắc quan trọng nhất:
1. `await` mọi thứ.
2. Ưu tiên `getByRole` / `getByLabel`, tránh CSS selector.
3. Dùng `expect` để chờ, không dùng `waitForTimeout`.

Tài liệu chính thức: https://playwright.dev/docs/intro
