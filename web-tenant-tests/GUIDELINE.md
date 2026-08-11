# GUIDELINE — web-tenant-tests

Quy tắc bắt buộc cho mọi người (và mọi AI) viết test trong project này.

---

## Rule 1 — TUYỆT ĐỐI không viết test vào source app

**Cấm ghi bất kỳ file nào vào:**

```
/Users/thinhnn/Documents/GitHub/userapp/ochacom-saas/apps/web-tenant
```

Bao gồm cả `src/**/__tests__/`. Mọi test đều nằm trong `web-tenant-tests`, và phải viết bằng **Playwright** — không dùng vitest / React Testing Library, kể cả khi source app đã có sẵn test cùng loại.

**Được phép:** *đọc* source app để lấy locator chính xác (label, text, cấu trúc). Đọc thì tốt và nên làm.
**Không được phép:** *ghi* vào source app.

**Lý do:** project test được tách riêng có chủ đích. "Viết vào app cho nhanh/dễ hơn" không phải lý do để phá vỡ quyết định đó.

**Khi gặp component khó với tới bằng E2E** (ví dụ dialog nằm sau login → chọn bệnh nhân → màn hình điều trị → side panel → double-click), **không được tự ý** chuyển sang viết unit test trong app repo. Hoặc viết bằng Playwright, hoặc báo chi phí và hỏi trước.

> Rule này sinh ra từ một lỗi thật: đã có lần test sort của `guide-selection-dialog` bị viết thành vitest đặt trong `apps/web-tenant/src/features/treatments/__tests__/`. Sai — dù test chạy pass.

---

## Rule 2 — UI của app là tiếng Nhật

Đây là lỗi sai phổ biến nhất. Đừng viết locator theo tiếng Việt trong mô tả yêu cầu.

| Ý nghĩa | Chuỗi thật trong UI |
|---|---|
| Email | `メールアドレス` |
| Mật khẩu | `パスワード` |
| Nút đăng nhập | `ログイン` |
| Dashboard | `ダッシュボード` |

Nguồn chuỗi: `apps/web-tenant/src/features/auth/locales/ja.ts` và các file `locales/ja.ts` của từng feature.

**Luôn mở source app đọc chuỗi thật trước khi viết locator.** Không đoán, không dịch.

Chuỗi dùng chung để trong `tests/test-data.ts` (object `JA`), không rải tiếng Nhật khắp các file test.

---

## Rule 3 — Locator ưu tiên theo thứ tự

```ts
page.getByRole('button', { name: 'ログイン' })   // 1. tốt nhất
page.getByLabel('メールアドレス')                 // 2.
page.getByPlaceholder('メールアドレスを入力')     // 3.
page.getByText('ダッシュボード')                  // 4.
page.locator('.btn-primary')                     // 5. TRÁNH — vỡ khi đổi Tailwind class
```

App dùng Tailwind nên class thay đổi liên tục → CSS selector là nợ kỹ thuật.

Khi locator khớp nhiều phần tử (strict mode violation), thu hẹp bằng điều kiện thật, đừng vội `.first()`:

```ts
page.getByRole('heading', { name: 'ダッシュボード', level: 1 })  // ✅ cụ thể
page.getByLabel('パスワード', { exact: true })                   // ✅
page.getByRole('button').first()                                 // ⚠️ giải pháp cuối
```

---

## Rule 4 — Chạy test phải đứng đúng thư mục

```bash
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
npm test
```

Chạy từ thư mục cha (`TestLocal`) sẽ lỗi khó hiểu `test.describe() ... No tests found`, vì Playwright không thấy `playwright.config.ts` → mất `baseURL`, mất `ignoreHTTPSErrors`.

---

## Rule 5 — App chết thì đừng debug test

Trước khi ngồi sửa test fail, kiểm tra app còn sống không:

```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://tenant1.ochacom.local/login
```

- `200` → app ổn, lỗi ở test.
- `502` → dev server sau nginx đã chết. Khởi động lại app. **Test không sai gì cả.**

Dev server của project này chết khá thường xuyên. Triệu chứng: mọi test fail cùng lúc, timeout ở `page.goto` hoặc "không tìm thấy ô email".

---

## Rule 6 — Viết nhanh, KHÔNG tự chạy thử

**Ưu tiên cao nhất là tốc độ giao test.** Chủ repo sẽ tự chạy.

- **Không** chạy thử test rồi sửa vòng vo. Không probe, không screenshot dò đường.
- **Không** hỏi lại lòng vòng. Đọc source lấy locator → viết → giao ngay.
- Fail thì chủ repo báo và yêu cầu viết lại. Đó là quy trình mong muốn — **một lần viết lại rẻ hơn nhiều lần tự dò.**
- Chỗ nào chưa chắc thì để **biến env** cho dễ chỉnh (`TEST_PAT_NO`, `TEST_GUIDE_NM`…), và nói gọn 1 dòng là chưa chắc — không viết dài.

Đánh đổi đã được chấp nhận có ý thức: test giao ra **có thể fail lần đầu**. Không sao. Đừng vì "muốn chắc ăn" mà quay lại chạy thử — làm vậy là vi phạm rule này.

> Vẫn giữ: khi ĐANG debug một lỗi thật thì đọc **dòng `Error:` đầu tiên**, đừng đoán nguyên nhân.

---

## Rule 7 — Không dùng sleep

```ts
await page.waitForTimeout(3000)   // ❌
await expect(x).toBeVisible()     // ✅ tự động chờ + retry
```

`expect` của Playwright tự retry cho tới khi đúng. `waitForTimeout` vừa chậm vừa vẫn flaky.

Ngoại lệ DUY NHẤT: nhịp nghỉ để quan sát khi chạy `--headed` — xem Rule 11. Nó không chờ app sẵn sàng và bằng 0 khi chạy nền.

---

## Rule 8 — Mỗi test độc lập

Mỗi test chạy trong trình duyệt sạch, không dính session của test khác. Test nào cần trang nội bộ thì phải tự login trong test đó (hoặc dùng `storageState` khi số test tăng lên).

Không viết test A phụ thuộc test B chạy trước.

---

## Rule 9 — Không commit mật khẩu thật

`tests/test-data.ts` đang để mặc định tài khoản admin cho tiện chạy local, nhưng override được:

```bash
TEST_ADMIN_EMAIL=x@y.com TEST_ADMIN_PASSWORD=secret npm test
```

Nếu push repo này lên GitHub → **bỏ giá trị mặc định đi**. Mật khẩu commit một lần là nằm vĩnh viễn trong git history.

Lưu ý: app có khoá tài khoản khi sai mật khẩu nhiều lần (`試行回数が上限に達しました`).

**Rate-limit khi debug:** login nhiều lần liên tiếp (khoảng 20 lần khi debug) sẽ bị app chặn tạm — biểu hiện là `toHaveURL` fail, URL kẹt ở `/login`, dù `curl` API vẫn trả 200. **Chờ ~4 phút là chạy lại được. Đừng sửa code.** Xem thêm Rule 10.1.

---

## Rule 10 — Những cái bẫy đã gặp THẬT

Tất cả đều từ debug thật khi viết `guide-selection-sort.spec.ts`. Đọc trước khi viết test mới sẽ tiết kiệm hàng giờ.

### 10.1 — Nhiều test = nhiều lần login = app chặn ⚠️ BẪY LỚN NHẤT

Mỗi test Playwright chạy trong **browser context riêng, KHÔNG chia sẻ session** → mỗi test là thêm 1 lần login. App giới hạn **`Login PermitLimit = 10` login / khung thời gian** (cấu hình phía BE).

Dấu hiệu nhận biết: chạy 1 test lẻ thì **pass**, chạy cả file thì **fail hết**. Lỗi hiện ra là `expect(page).toHaveURL(/\/$/)` fail, URL đứng nguyên ở `/login`.

**Số liệu đo thật (2026-07-17, sau khi BE nới limit lên 10):**

| Số login | Kết quả |
|---|---|
| 3 (suite hiện tại) | pass, lặp lại thoải mái |
| 8 song song | pass hết |
| 24 (3 lượt × 8, liên tiếp) | 8 → 5 → 4 pass — rớt khi vượt 10 |

→ **Giữ tổng số login mỗi lần chạy < 10.** Tách nhiều test được, miễn đừng vượt ngưỡng.

→ **Với flow sâu cần login (dialog lồng nhiều bước): vẫn nên gộp mọi assert vào MỘT test.** Không chỉ vì rate-limit — mà vì login + đi tới dialog tốn nhiều bước, mở 1 lần rồi kiểm hết là nhanh nhất.

⚠️ **Limit cộng dồn theo khung thời gian, KHÔNG reset mỗi lần chạy.** Lúc debug hay chạy đi chạy lại → rất dễ đụng trần. Nếu đang debug mà `toHaveURL` fail ở login: **chờ vài phút, đừng sửa code**.

### 10.2 — `storageState` KHÔNG dùng được cho app này

Cách chuẩn của Playwright (login 1 lần → lưu session → tái dùng) **không chạy ở đây**: `accessToken` chỉ nằm trong RAM (zustand không persist), chỉ có cookie `rt`. Nạp lại từ `rt` thì app vẫn vào được nhưng **data bệnh nhân không load** → list rỗng, `患者番号: —`.

→ Đừng phí thời gian thử lại. Login thẳng trong test.

### 10.3 — Màn hình chính có nút TRÙNG TÊN với dialog → strict mode violation

`点数`, `回数`, `F10 戻る`… tồn tại ở cả màn hình chính lẫn dialog. Tệ nhất: `getByRole('button', { name: /戻る/ }).first()` bắt trúng nút của **màn hình chính đang nằm dưới modal** → click treo đủ 15s rồi timeout.

→ Luôn bó locator vào trong dialog:

```ts
const dialog = (page: Page) => page.getByRole('dialog')   // DraggableDialog có role="dialog"
const header = (page: Page, label: string) =>
  dialog(page).getByRole('button', { name: new RegExp(`^${label}\\s*[▲▼]?$`) })
```

### 10.4 — Escape trong dialog này là 確定 (commit), KHÔNG phải huỷ

`GuideSelectionDialog` map `Escape` → `handleConfirm` (F9). Dùng Escape để đóng = **vô tình ghi data**.

→ Đóng bằng `await page.keyboard.press('F10')`. Luôn đọc source xem phím tắt map gì trước khi dùng.

### 10.5 — Header sort có kèm glyph ▲/▼

Accessible name là `"コード ▲"` chứ không phải `"コード"` → khớp `exact` sẽ trượt khi đang sort.

→ Dùng regex: `new RegExp(`^${label}\\s*[▲▼]?$`)`.

### 10.6 — Data thật không đảm bảo đủ dòng để test sort

Nhiều ガイド chỉ có **1 dòng**, có cái **0 dòng** (`該当なし`). Sort 1 dòng thì assert luôn pass — vô nghĩa.

→ Test tự dò tìm dòng data phù hợp (≥2 dòng), đừng hardcode. Và đừng bắt buộc mọi dialog phải có dòng.

### 10.7 — Phải bấm `全て表示` thì list ガイド mới có data

Vào tab ガイド không thôi thì list rỗng.

### 10.8 — Đừng đọc `count()` ngay lập tức

`count()` là **ảnh chụp tức thời, KHÔNG auto-wait**. List load chậm → `count()` trả 0 hoặc 1 → kết luận nhầm "selector sai" (tôi đã dính 2 lần).

```ts
const n = await rows.count()                              // ❌ list chưa load
await expect(rows.nth(2)).toBeVisible({ timeout: 30000 }) // ✅ chờ trước
const n = await rows.count()
```

Chỉ `expect()` và các action mới auto-wait.

### 10.9 — Cách debug: đổi MỘT thứ mỗi lần

Tôi từng kết luận "storageState gây spinner" từ **một** lần chạy — sai, đó là dev server chập chờn. Test ở đây flaky do môi trường, nên **một lần chạy không chứng minh được gì**.

→ Đọc dòng `Error:` đầu tiên. Nghi ngờ gì thì chạy lại vài lần trước khi kết luận. Đổi nhiều thứ cùng lúc là mất dấu nguyên nhân.

---

## Rule 11 — Nhịp quan sát: chờ 1 giây/thao tác khi chạy `--headed`, 0 giây khi chạy nền

**Bắt buộc với MỌI spec mới.** Chạy `--headed` mà không có nhịp nghỉ thì thao tác nhảy quá nhanh, không nhìn kịp bước nào hỏng. Nhưng chạy nền thì mỗi giây đó là lãng phí.

Dùng helper chung `tests/step.ts` — đừng chép lại logic vào từng spec:

```ts
import { makeStep } from './step'

test('...', async ({ page }) => {
  const step = makeStep(page)
  ...
  await step()
```

Rồi rải `await step()` sau mỗi thao tác đáng nhìn: chuyển mode, click cell, gõ mã, mở dialog, và **trước + sau mỗi phím Enter được assert**. Cặp trước/sau Enter là chỗ quan trọng nhất — nó cho thấy đúng khoảnh khắc dialog biến mất hay không.

### Chỉnh tốc độ

| Cách | Lệnh / chỗ sửa | Phạm vi |
|---|---|---|
| Tạm thời, 1 lần chạy | `TEST_STEP_MS=3000 npx playwright test <spec> --headed` | chỉ lần đó |
| Tắt hẳn dù đang headed | `TEST_STEP_MS=0 npx playwright test <spec> --headed` | chỉ lần đó |
| Đổi mặc định lâu dài | sửa `DEFAULT_STEP_MS` trong `tests/step.ts` | mọi spec |

Thứ tự ưu tiên: `TEST_STEP_MS` > `DEFAULT_STEP_MS` (chỉ áp dụng khi headed) > `0`.

Cơ chế: `--headed` và `--ui` đều làm Playwright đặt `project.use.headless === false`, nên một biểu thức phục vụ được cả hai; chạy nền `headless` là `true` → `0` → `waitForTimeout(0)` gần như miễn phí. `TEST_STEP_MS` sai định dạng thì ném lỗi ngay chứ không âm thầm về 0 — để không tưởng nhầm là đã bật chậm mà thực ra không.

**Không mâu thuẫn với Rule 7.** Rule 7 cấm dùng `waitForTimeout` để *chờ app sẵn sàng* (phải dùng `expect` auto-wait). `step()` không chờ app — nó chỉ giãn nhịp cho mắt người, và bằng 0 khi không ai ngồi xem. Vẫn tuyệt đối không được thay `expect(...).toBeVisible()` bằng `step()`.

---

## Cấu trúc thư mục

```
web-tenant-tests/
├── GUIDELINE.md          # file này — rule bắt buộc
├── tutorial.md           # hướng dẫn Playwright cơ bản
├── package.json
├── playwright.config.ts  # baseURL, ignoreHTTPSErrors, chỉ Chrome
├── tsconfig.json
└── tests/
    ├── test-data.ts      # tài khoản + chuỗi UI tiếng Nhật (JA)
    └── login.spec.ts     # login thành công / thất bại
```

Test mới đặt trong `tests/`, đặt tên `<tính-năng>.spec.ts`.
