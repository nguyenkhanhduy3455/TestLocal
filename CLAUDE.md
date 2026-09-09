# Hướng dẫn cho AI agent làm việc trong repo này

**Đọc [`README.md`](./README.md) trước mọi việc.** Nó mô tả toàn bộ hệ thống: project Playwright `web-tenant-tests/`, web app `file-viewer/`, cách chạy, và cách viết testcase.

Ba luật không được phá (chi tiết ở `web-tenant-tests/GUIDELINE.md`):

1. **Cấm ghi bất kỳ file test nào vào source app** (`/Users/thinhnn/Documents/GitHub/userapp/ochacom-saas/apps/web-tenant`). Đọc source thì được và nên làm. Mọi test nằm trong `web-tenant-tests/`, viết bằng Playwright — không vitest, không React Testing Library.
2. **UI app là tiếng Nhật.** Đọc `locales/ja.ts` lấy chuỗi thật, không dịch, không đoán.
3. **< 10 lần login mỗi lần chạy** — app rate-limit, limit cộng dồn theo thời gian. Lấy page qua fixture `authedPage` của `tests/_shared/session.ts` (login một lần cho cả worker), đừng tự `goto('/login')` trong `beforeAll` (khung mẫu ở README mục 5.2).

Trước khi viết spec mới: đọc `web-tenant-tests/GUIDELINE.md` (Rule 1–11) và `web-tenant-tests/TEST-PLAYPWRIGHT-GUIDELINE.md` (Rule 12–23). Bảng tra tóm tắt ở README mục 6.

Spec nằm trong `web-tenant-tests/tests/<nhóm>/` — 13 nhóm theo màn hình/component
(`treatment-grid/`, `side-panel/`, `siga-tooth-status/`, `dialogs-management/`…),
helper dùng chung ở `tests/_shared/`. Spec mới import `test`/`expect` từ
`_shared/session` để dùng fixture `authedPage` (login một lần cho cả worker) —
KHÔNG tự `goto('/login')` trừ khi có lý do ghi rõ trong doc-comment.

Trước khi viết test UI cho app WinForm (`fla-ui-tests/`): đọc
[`fla-ui-tests/FLA-UI-GUIDELINE.md`](./fla-ui-tests/FLA-UI-GUIDELINE.md) — toàn bộ luật
F1–F25 của bên WinForm gom về một chỗ (`PROBE-GUIDELINE.md` giữ nguyên phần vì-sao và
khuôn mẫu probe). Ba luật bao trùm:

1. **F1 — chụp màn hình → đọc ảnh → rồi mới viết assert.** KHÔNG viết assert theo phỏng
   đoán rồi chạy cả fixture để xem nó đỏ ở đâu. Ảnh chụp lúc lỗi đã có sẵn trong
   `artifacts/screenshots/` — mở ra xem trước khi chạy lại.
2. **F2 — timeout NGẮN.** Hết giờ thì **chụp ảnh → phân tích → rồi mới chạy lại**; đừng
   ngồi đợi hết trần 15 phút, và đừng chạy lại y nguyên để "xem có chập chờn không".
3. **F3 — assert bám WinForm** và dẫn được `file:dòng`.

Trước khi debug một test fail: chạy triage ở README mục 7 — kiểm app sống (502?), kiểm rate-limit, đọc dòng `Error:` đầu tiên, mở `test-results/<tên-test>/error-context.md`.
