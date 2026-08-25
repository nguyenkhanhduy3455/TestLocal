# Hướng dẫn cho AI agent làm việc trong repo này

**Đọc [`README.md`](./README.md) trước mọi việc.** Nó mô tả toàn bộ hệ thống: project Playwright `web-tenant-tests/`, web app `file-viewer/`, cách chạy, và cách viết testcase.

Ba luật không được phá (chi tiết ở `web-tenant-tests/GUIDELINE.md`):

1. **Cấm ghi bất kỳ file test nào vào source app** (`/Users/thinhnn/Documents/GitHub/userapp/ochacom-saas/apps/web-tenant`). Đọc source thì được và nên làm. Mọi test nằm trong `web-tenant-tests/`, viết bằng Playwright — không vitest, không React Testing Library.
2. **UI app là tiếng Nhật.** Đọc `locales/ja.ts` lấy chuỗi thật, không dịch, không đoán.
3. **< 10 lần login mỗi lần chạy** — app rate-limit. Flow sâu thì gộp assert vào một test, login một lần ở `beforeAll` (khung mẫu ở README mục 5.2).

Trước khi viết spec mới: đọc `web-tenant-tests/GUIDELINE.md` (Rule 1–11) và `web-tenant-tests/TEST-PLAYPWRIGHT-GUIDELINE.md` (Rule 12–22). Bảng tra tóm tắt cả 22 rule ở README mục 6.

Trước khi viết test UI cho app WinForm (`fla-ui-tests/`): đọc
[`fla-ui-tests/PROBE-GUIDELINE.md`](./fla-ui-tests/PROBE-GUIDELINE.md). Luật số một —
chưa biết app thật hành xử ra sao thì **chụp màn hình → đọc ảnh → rồi mới viết
assert**, KHÔNG viết assert theo phỏng đoán rồi chạy cả fixture để xem nó đỏ ở đâu.
Ảnh chụp lúc lỗi đã có sẵn trong `artifacts/screenshots/` — mở ra xem trước khi chạy lại.

Trước khi debug một test fail: chạy triage ở README mục 7 — kiểm app sống (502?), kiểm rate-limit, đọc dòng `Error:` đầu tiên, mở `test-results/<tên-test>/error-context.md`.
