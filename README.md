# TestLocal — hệ thống test `web-tenant` + Local File Viewer

> **File này là cửa vào.** Đọc hết mục 0–2 là hiểu hệ thống có gì; mục 3–4 là cách dùng; mục 5–7 là cách viết testcase và xử lý khi fail.
> Viết cho cả người lẫn AI agent. Mọi đường dẫn trong file đều là đường dẫn thật trên máy này.

---

## 0. Đọc gì trước — bảng tra theo việc

| Bạn đang định làm gì | Đọc theo thứ tự |
|---|---|
| Hiểu tổng thể | File này, mục 1–2 |
| Viết một spec Playwright mới | Mục 5 → `web-tenant-tests/GUIDELINE.md` (Rule 1–11) → `web-tenant-tests/TEST-PLAYPWRIGHT-GUIDELINE.md` (Rule 12–22) |
| Mới học Playwright | `web-tenant-tests/tutorial.md` |
| Test đang fail | Mục 7 (triage) → `test-results/<tên-test>/error-context.md` |
| Cần seed/dọn dữ liệu ở tầng DB | Mục 3.5 → doc-comment đầu `web-tenant-tests/tests/db.ts` |
| Xem file log/CSV/JSON của kết quả chạy | Mục 4 (file-viewer) |
| Viết testcase từ tài liệu điều tra | `trouble-1.md` … `trouble-4.md` ở thư mục gốc |

**Ba luật không được phá** (chi tiết ở mục 6):

1. Không ghi bất kỳ file test nào vào source app — test chỉ nằm trong `web-tenant-tests/`.
2. UI app là **tiếng Nhật** — đọc source lấy chuỗi thật, không dịch, không đoán.
3. Giữ tổng số lần login mỗi lần chạy **< 10** — app rate-limit, vượt là fail hàng loạt.

---

## 1. Hệ thống gồm những gì

```
┌──────────────────────────────────────────────────────────────────────┐
│ ĐÍCH KIỂM THỬ (KHÔNG nằm trong repo này — chỉ ĐỌC, cấm GHI)          │
│                                                                      │
│  web-tenant (React + Vite, UI tiếng Nhật)                            │
│    /Users/thinhnn/Documents/GitHub/userapp/ochacom-saas/apps/web-tenant
│    chạy tại https://tenant1.ochacom.local/  (HTTPS cert tự ký)       │
│                                                                      │
│  WinForm gốc — NGUỒN CHÂN LÝ cho hành vi nghiệp vụ                   │
│    /Users/thinhnn/Documents/GitHub/userapp/src/OCHACOM  (INP/, CHK/…)│
│                                                                      │
│  Postgres  ochacom-dev, schema t_tenant1                             │
└──────────────────────────────────────────────────────────────────────┘
            ▲ đọc source lấy locator      ▲ seed/verify/dọn dữ liệu
            │                             │
┌───────────┴─────────────────────────────┴────────────────────────────┐
│ REPO NÀY — /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal    │
│                                                                      │
│  A. web-tenant-tests/   Playwright E2E — 22 spec, ~16k dòng          │
│  B. file-viewer/        Web app xem file local (log/CSV/JSON/text)   │
│  C. trouble-1..4.md     Tài liệu điều tra → đầu vào để viết testcase │
└──────────────────────────────────────────────────────────────────────┘
```

Hai thành phần **độc lập nhau**, không import lẫn nhau:

| | Là gì | Vai trò |
|---|---|---|
| **A. `web-tenant-tests/`** | Project Playwright riêng, chạy Chrome | Kiểm hành vi web-tenant có khớp WinForm không |
| **B. `file-viewer/`** | Server Node zero-dependency + SPA | Mở nhanh mọi file trên máy bằng trình duyệt: log của test, CSV/JSON dữ liệu, `error-context.md`, source app… |

Quan hệ thực tế: A sinh ra rất nhiều file kết quả (`test-results/`, `playwright-report/`, log, PDF), B là công cụ để **soi** những file đó (và bất kỳ file nào khác) mà không cần mở IDE.

---

## 2. Cây thư mục

```
TestLocal/
├── README.md                       # file này
├── trouble-1.md … trouble-4.md     # tài liệu điều tra từng vấn đề (chưa sửa code)
│
├── file-viewer/                    # ── B ──
│   ├── server.js                   # HTTP server thuần Node, bind 127.0.0.1
│   ├── package.json                # không dependency; scripts: start / dev
│   ├── README.md                   # chi tiết của riêng file-viewer
│   └── public/{index.html,styles.css,app.js}
│
└── web-tenant-tests/               # ── A ──
    ├── GUIDELINE.md                # Rule 1–11  — luật bắt buộc
    ├── TEST-PLAYPWRIGHT-GUIDELINE.md # Rule 12–22 — bẫy rút ra từ debug thật
    ├── tutorial.md                 # Playwright cơ bản cho người mới
    ├── playwright.config.ts        # baseURL, viewport, timeout, chỉ Chrome
    ├── .env / .env.example         # cấu hình chạy (.env KHÔNG commit)
    ├── package.json
    └── tests/
        ├── *.spec.ts               # 22 spec
        ├── test-data.ts            # tài khoản + chuỗi UI tiếng Nhật (JA)
        ├── step.ts                 # nhịp quan sát khi --headed
        ├── db.ts                   # truy cập Postgres trực tiếp (seed/verify/dọn)
        ├── virtual-grid.ts         # helper cho grid ảo hoá + closeDialogs
        ├── auto-picker-precondition.ts # tiền đề dialog カルテ記載選択
        └── pdf-content.ts          # bóc text từ PDF do print agent render
```

---

## 3. Phần A — `web-tenant-tests` (Playwright)

### 3.1 Tiền đề trước khi chạy

1. App phải sống: `curl -sk -o /dev/null -w "%{http_code}\n" https://tenant1.ochacom.local/login` → **200**. Ra **502** nghĩa là dev server sau nginx đã chết → khởi động lại app, **test không sai gì cả**.
2. Đã `npm install` trong `web-tenant-tests/`.
3. Có `.env` (copy từ `.env.example`) nếu cần DB / in thật / đổi viewport.
4. **Phải đứng đúng thư mục** `web-tenant-tests/` khi chạy — đứng ở thư mục cha sẽ mất `playwright.config.ts` → mất `baseURL`, mất `ignoreHTTPSErrors`, báo lỗi khó hiểu `No tests found`.

### 3.2 Lệnh

```bash
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests

npm test                                        # chạy toàn bộ (4 worker)
npx playwright test tests/kasan-buttons.spec.ts # một spec
npx playwright test -g "TC-3"                   # lọc theo tên testcase
npm run test:headed                             # xem bằng mắt (có nhịp step)
npm run test:ui                                 # Test Explorer, tick từng test
npm run report                                  # mở báo cáo HTML lần chạy trước
npm run typecheck                               # tsc --noEmit
npm run codegen                                 # ghi lại thao tác thành code
npx playwright test tests/<spec> --repeat-each=3 --retries=0   # soi flaky
```

### 3.3 `playwright.config.ts` — những giá trị cần biết

| Mục | Giá trị | Vì sao |
|---|---|---|
| `baseURL` | `BASE_URL` ?? `https://tenant1.ochacom.local/` | |
| `ignoreHTTPSErrors` | `true` | cert tự ký, thiếu là mọi navigation fail |
| `viewport` | 1600×1000 (`TEST_VIEWPORT_W/H`) | mặc định 1280×720 **thấp hơn** dialog lớn (vd 1120×840) → test đo width/height sai. Đây là vùng render, không phải cửa sổ thật |
| `timeout` / `navigationTimeout` / `actionTimeout` | 120s / 90s / 15s | Vite **dev** server transform nguội có thể vượt 60s cho một navigation |
| `workers` | 4 (local), 1 (CI) | |
| `retries` | 1 (local), 2 (CI) | |
| `trace` / `screenshot` / `video` | on-first-retry / only-on-failure / retain-on-failure | |
| `locale` | `ja-JP` | |
| projects | chỉ `chromium` | |

`dotenv` được nạp **theo `__dirname`**, không theo `process.cwd()` — nên `.env` vẫn ăn kể cả khi lỡ chạy từ thư mục khác.

### 3.4 Biến môi trường

| Biến | Mặc định | Tác dụng |
|---|---|---|
| `BASE_URL` | `https://tenant1.ochacom.local/` | URL app |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | có sẵn trong `tests/test-data.ts` | tài khoản login |
| `TEST_VIEWPORT_W` / `TEST_VIEWPORT_H` | 1600 / 1000 | vùng render |
| `TEST_STEP_MS` | 2000 khi `--headed`, 0 khi chạy nền | nhịp quan sát mỗi thao tác |
| `TEST_DB` | — | `=1` bật các testcase can thiệp DB; không đặt → **tự skip**, không mở kết nối nào |
| `TEST_DB_URL` *hoặc* `TEST_DB_HOST/PORT/NAME/USER/PASSWORD` | localhost:5432 ochacom-dev | trỏ DB khi test chạy khác máy với Postgres |
| `TEST_DB_SCHEMA` | `t_tenant1` | schema tenant |
| `TEST_PAT_NO` / `TEST_TRT_DT` | tuỳ spec | bệnh nhân / ngày điều trị dùng để test |
| `TEST_ALLOW_SAVE` | — | `=1` mới cho phép GHI THẬT qua UI (F8 登録). Mặc định chỉ chạy tới confirm rồi bấm No |
| `TEST_ALLOW_PRINT` / `TEST_AGENT_BASE_URL` | — | `=1` in thật qua print agent; mặc định stub chặn request nhưng vẫn assert đủ datasource |
| `TEST_PDF_TEXT` | `strict` | `loose` = chữ Hán không tìm thấy trong PDF chỉ cảnh báo |

### 3.5 Helper dùng chung trong `tests/`

| Module | Export chính | Dùng khi |
|---|---|---|
| `test-data.ts` | `ADMIN_USER`, `JA` | Mọi spec. Chuỗi tiếng Nhật dùng chung để ở `JA`, **không rải khắp file** |
| `step.ts` | `makeStep(page)`, `stepMs()`, `DEFAULT_STEP_MS` | Mọi spec mới (Rule 11). `await step()` sau mỗi thao tác đáng nhìn, và **trước + sau mỗi Enter được assert** |
| `db.ts` | `dbEnabled`, `withDb`, `seedTreatmentRows`, `deleteTreatmentRows`, `seedMstTrtRows`, `countGisiKanri`, `latestChiryoKanriR2`, `readSiga`/`writeSigaTeeth`/`restoreSiga`, … | Seed dữ liệu test, verify ở tầng DB, dọn record mà UI không có nút xoá. Dòng seed nằm ở vùng `disp_no >= SEED_DISP_BASE (9000)` để không đụng data thật |
| `virtual-grid.ts` | `scroller/rows/cells/header/skeletons/emptyState`, `expectClientGrid`, `expectSortBehaviour`, `expectWinFormOrder`, `expectNoSortGlyph`, `closeDialogs` | Grid ảo hoá. **Mọi locator nhận `root`, không bao giờ dùng thẳng `page`** — grid màn nền vẫn nằm trong DOM khi dialog mở |
| `auto-picker-precondition.ts` | `expectAutoPickerOpened` | Spec cần dialog `カルテ記載選択` tự bật — biến "chờ mù 45s rồi not found" thành thông báo nói rõ ngày đã có dữ liệu |
| `pdf-content.ts` | bóc text PDF + `FOLD_RADICALS` | Chỉ khi `TEST_ALLOW_PRINT=1` |

### 3.6 Khi fail, Playwright ghi gì

`test-results/<tên-test>/`:

| File | Đọc để biết |
|---|---|
| `error-context.md` | **DOM snapshot dạng a11y tree** — role và tên thật của mọi phần tử. Đây là file cứu mạng, đọc trước khi đoán |
| `test-failed-1.png` | popup nào đang che màn hình |
| `video.webm` | diễn biến |

`playwright-report/index.html` → `npm run report`.

---

## 4. Phần B — `file-viewer`

Web app chạy local: nhập đường dẫn một thư mục trên PC/macOS → xem danh sách file → xem nội dung file ngay trên trình duyệt. **Zero dependency**, không cần `npm install`.

```bash
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/file-viewer
node server.js          # → http://127.0.0.1:5173      (PORT=8080 để đổi cổng)
```

### Chức năng

| Nhóm | Chi tiết |
|---|---|
| Duyệt | Nhập path tuyệt đối (hỗ trợ `~`, tự bỏ dấu nháy và `\ ` khi copy từ Finder). Breadcrumb, nút Lên/Home/Reload, ô lọc tên, toggle file ẩn. Gõ nhầm path **file** → mở folder cha và chọn sẵn file đó. Nhớ path lần cuối |
| Xem text | `.txt .csv .log .md .xml .yml .sql .js .ts` và mọi đuôi lạ → kiểu **Notepad++**: gutter số dòng dính bên trái, monospace, không tự xuống dòng (có toggle) |
| Xem JSON | Tự beautify indent 2 + tô màu key/string/number/bool/null; tab `Đẹp`/`Thô`. JSON hỏng → báo lỗi parse rồi hiển thị nội dung gốc |
| Khác | Ảnh xem trực tiếp; file nhị phân → hex dump (kèm nút xem-dạng-text) |
| Công cụ | `Ctrl/Cmd+F` tìm trong file, Copy, Tải về, chọn bảng mã |
| Bảng mã | `Tự động` = UTF-8 → fallback **Shift_JIS** (hợp với file tiếng Nhật của dự án này), hoặc chọn tay UTF-8 / Shift_JIS / EUC-JP / Windows-1252 |

### API (đều là `GET`)

| Endpoint | Trả về |
|---|---|
| `/api/home` | home dir, cwd, platform |
| `/api/list?path=` | entry trong thư mục (folder trước, sort tự nhiên) |
| `/api/file?path=&encoding=&full=1&force=1` | nội dung đã decode + metadata |
| `/api/raw?path=` | stream nguyên bản (ảnh) |
| `/api/download?path=` | tải file |

### Giới hạn cố ý

| | |
|---|---|
| Đọc mặc định | 2 MB đầu file (có nút *Tải thêm*) |
| Đọc tối đa | 8 MB |
| Hiển thị | 100.000 dòng |
| Highlight tìm kiếm | 5.000 kết quả |

### Bảo mật

App **cố ý** đọc mọi path người dùng nhập — đó là tính năng. Vì vậy server chỉ bind `127.0.0.1` và chỉ nhận `GET`. **Không** đổi `HOST`, không đặt sau reverse proxy public.

### Dùng nó trong quy trình test

- Mở `web-tenant-tests/test-results/<tên-test>/error-context.md` để đọc a11y tree.
- Soi CSV/JSON dữ liệu master, file log dài (2 MB đầu load ngay, gutter số dòng để đối chiếu với stack trace).
- Đọc source app / WinForm (`/Users/thinhnn/Documents/GitHub/userapp/src/OCHACOM/INP/Forms/…`) mà không cần mở IDE.

---

## 5. Cách viết một testcase mới

### 5.1 Quy trình

1. **Xác định nguồn chân lý.** Hành vi đúng là hành vi của **WinForm** (`userapp/src/OCHACOM`), không phải của code web. Tìm form/hàm tương ứng (`frm203002.cs`, `CommonChk.cs`…) và ghi lại số dòng.
2. **Đọc source web** để lấy locator và chuỗi thật: `apps/web-tenant/src/features/<feature>/` + `locales/ja.ts`. **Đọc thì tốt và nên làm — chỉ cấm GHI.**
3. **Chốt dữ liệu test.** Bệnh nhân/ngày nào có sẵn dữ liệu? Nếu không chắc chắn → tự seed bằng `db.ts` trong `beforeAll` và dọn ở `afterAll`. Mặc định phải trỏ vào chỗ **CÓ** dữ liệu, nếu không nhánh test sẽ bị bỏ qua mà nhìn như đang pass.
4. **Viết doc-comment FACT ở đầu file** (mục 5.4).
5. **Viết spec** theo khung 5.2, mọi assert bám WinForm.
6. **Chừa env override** cho mọi thứ chưa chắc: `TEST_PAT_NO`, `TEST_TRT_DT`, `TEST_ALLOW_SAVE`…
7. **Giao ngay** (Rule 6). Không tự chạy dò vòng vo với spec đơn giản. *Ngoại lệ đã được ghi nhận:* dialog lồng sâu / SVG / có popup xen ngang thì locator không suy ra chắc chắn từ source được — chạy thử là hợp lý, xem ghi chú cuối `TEST-PLAYPWRIGHT-GUIDELINE.md`.

### 5.2 Khung spec chuẩn — login MỘT lần, nhiều testcase

Đây là khuôn mẫu 16/22 spec đang dùng. Nó dung hoà "mỗi test độc lập" (Rule 8) với "< 10 login" (Rule 10.1).

```ts
import { expect, test, type Page } from '@playwright/test'

import { dbEnabled, deleteTreatmentRows, seedTreatmentRows } from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

/**
 * <画面名> — <mô tả> (WinForm `<HàmGốc>`).
 *
 * CHẠY SERIAL, login MỘT lần ở beforeAll. Thứ tự testcase CÓ ý nghĩa
 * (TC-4 đọc kết quả của TC-3) → chạy lẻ một testcase ở giữa sẽ hỏng.
 *
 * ─── Nguồn WinForm ──────────────────────────────────────────────────────
 *  - INP/Forms/frm203002.cs:3944 — …
 * ─── Port web đang có ───────────────────────────────────────────────────
 *  - treatment-entry-detail.tsx:2423 — …
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '11'
const TRT_DT = process.env.TEST_TRT_DT ?? '2009-05-20'

test.beforeAll(async () => {
  if (dbEnabled) await seedTreatmentRows(Number(PAT_NO), TRT_DT, SEED_ROWS)
})
test.afterAll(async () => {
  if (dbEnabled) await deleteTreatmentRows(Number(PAT_NO), TRT_DT)
})

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('<画面名> — <mô tả>', () => {
  let page: Page
  let step: () => Promise<void>

  test.beforeAll(async ({ browser }) => {
    // ⚠️ browser.newPage() KHÔNG kế thừa `use` của playwright.config.ts
    //    → phải truyền tay ignoreHTTPSErrors (cert tự ký) + baseURL.
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    step = makeStep(page)
    page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
    await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: JA.submit }).click()
    await expect(page).toHaveURL(/\/$/)

    // Popup xen ngang: cắm handler MỘT lần ở đây, đừng chờ thủ công (Rule 14).
    await page.addLocatorHandler(
      page.getByText(/を算定しますか？/).first(),
      async () => { await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click() },
      { times: 20 },
    )

    // … đi tới màn hình cần test
  })

  test.afterAll(async () => { await page?.close() })

  test('TC-1 — mở dialog', async () => {
    const dialog = page.getByRole('dialog').filter({ hasText: '【歯・歯肉の状態】' })
    await expect(dialog).toBeVisible()
    await step()
  })

  test('TC-2 — …', async () => { /* … */ })
})
```

Phải ghi rõ trong doc-comment khi dùng khung này: testcase **nối tiếp trạng thái**; `serial` nghĩa là một test đỏ thì các test sau bị **skip**; page tự tạo nên **không có trace/video tự động** (cần thì `context.tracing.start(...)`).

### 5.3 Quy ước

| Hạng mục | Quy ước |
|---|---|
| Tên file | `<tính-năng>.spec.ts`, đặt trong `tests/` |
| Tên `describe` | `<画面名 tiếng Nhật> — <mô tả ngắn>` kèm mã WinForm, vd `診療入力 — 加算ボタン 時間外(&J)` |
| Tên testcase | Bắt đầu bằng mã `TC-n` / `TC-A1` / `TC-B2` (nhóm theo mục kiểm) → lọc được bằng `-g "TC-3"` |
| Hằng số | Đặt **đúng tên hằng của source**, kèm chú thích file gốc: `const TOOTH_COUNT = 32  // utils/tooth-chart.ts` |
| Chuỗi tiếng Nhật dùng chung | Để trong `JA` của `test-data.ts` |
| Skip | Phải `console.log` lý do rõ ràng — "không chạy" khác hẳn "chạy và pass" |
| Ghi DB | Nằm sau cờ env (`TEST_ALLOW_SAVE`, `dbEnabled`) |

### 5.4 Doc-comment FACT ở đầu spec (bắt buộc)

Liệt kê những **sự thật lấy từ source** mà test đang bám vào, kèm đường dẫn + số dòng:

```
 *  - components/oral-hygiene-instruction-dialog.tsx
 *      · プラークスコア input lọc `[^0-9.]` ngay khi gõ.
 *      · 指導時刻: giờ 24 mục, phút bước MINUTE_STEP=5 → 12 mục.
 *      · F9 印刷 là STUB → alert 「印刷は未実装です。」
 *  - locales/ja.ts: Q00002 「更新してよろしいですか？」
```

Lợi ích thật: khi source đổi, đọc doc-comment là biết ngay assert nào cần soát lại — không phải đọc lại toàn bộ test.

### 5.5 Checklist trước khi giao

- [ ] Không có file nào bị ghi vào source app.
- [ ] Locator theo `getByRole` / `getByLabel`, không CSS class (app dùng Tailwind).
- [ ] Mọi locator trong dialog đều **bó vào `page.getByRole('dialog')`**, không dùng thẳng `page`.
- [ ] Không có `waitForTimeout` nào ngoài `step()`.
- [ ] Có `await step()` trước + sau mỗi Enter được assert.
- [ ] Assert **có khả năng fail** — nếu test một bug đã biết mà PASS ngay, khả năng cao test hỏng chứ không phải app đúng.
- [ ] Nhánh bị skip đều có log.
- [ ] Thao tác ghi DB nằm sau cờ env.
- [ ] Doc-comment FACT đầy đủ.

---

## 6. Bảng tra luật (Rule 1–22)

Tóm tắt một dòng. Chi tiết + ví dụ code ở hai file guideline.

**`GUIDELINE.md` — luật bắt buộc**

| # | Luật |
|---|---|
| 1 | **Cấm ghi test vào source app.** Đọc thì được và nên. Component khó với tới bằng E2E cũng **không được** tự chuyển sang unit test trong app repo — hỏi trước |
| 2 | UI là **tiếng Nhật**: `メールアドレス` / `パスワード` / `ログイン` / `ダッシュボード`. Đọc `locales/ja.ts`, không dịch |
| 3 | Thứ tự locator: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText` > CSS (tránh). Strict violation thì thu hẹp bằng điều kiện thật, `.first()` là giải pháp cuối |
| 4 | Chạy test **phải đứng trong `web-tenant-tests/`** |
| 5 | App chết (502) thì đừng debug test — `curl` kiểm tra trước |
| 6 | **Viết nhanh, không tự chạy thử.** Fail thì viết lại — rẻ hơn tự dò. Chỗ chưa chắc → để env |
| 7 | **Không sleep.** `expect` tự retry. Ngoại lệ duy nhất: `step()` của Rule 11 |
| 8 | Mỗi test độc lập, tự login |
| 9 | Không commit mật khẩu thật. App khoá tài khoản khi sai nhiều lần |
| 10.1 | ⚠️ **Bẫy lớn nhất: < 10 login mỗi khung thời gian.** Chạy lẻ pass / chạy cả file fail hết = đúng triệu chứng. Limit cộng dồn, không reset. Đụng trần thì **chờ ~4 phút, đừng sửa code** |
| 10.2 | `storageState` **vô dụng** với app này: accessToken chỉ nằm trong RAM, nạp lại từ cookie `rt` thì vào được nhưng data bệnh nhân không load |
| 10.3 | Màn hình nền có nút trùng tên với dialog → luôn bó locator vào `role=dialog` |
| 10.4 | Trong `GuideSelectionDialog`, **Escape = 確定 (ghi data)**, không phải huỷ. Đóng bằng `F10` |
| 10.5 | Header sort mang glyph `▲/▼` → dùng regex `^label\s*[▲▼]?$` |
| 10.6 | Data thật không đảm bảo đủ dòng để test sort → tự dò dòng phù hợp (≥2), đừng hardcode |
| 10.7 | Phải bấm `全て表示` thì list ガイド mới có data |
| 10.8 | `count()` **không auto-wait** → `expect(...).toBeVisible()` trước rồi mới `count()` |
| 10.9 | Debug: đổi **một** thứ mỗi lần. Một lần chạy không chứng minh gì |
| 11 | Nhịp quan sát: `makeStep(page)` + `await step()`. 2000ms khi `--headed`, 0 khi chạy nền |

**`TEST-PLAYPWRIGHT-GUIDELINE.md` — bẫy rút ra từ debug thật**

| # | Bẫy |
|---|---|
| 12.1 | `filter({ has })` khớp **cả chính element** → `.last()` rơi trúng div tiêu đề rỗng. Dùng `getByText(x, {exact:true}).locator('..')` |
| 12.2 | Locator trong `has:` phải **tương đối** (`page.getByText`), không được xây từ `dialog` |
| 12.3 | Không đoán locator — viết spec probe in ứng viên ra rồi xoá |
| 12.4 | `svg.first()` trúng icon X của header. Tìm đặc điểm chỉ nó có: `svg:has(foreignObject)` |
| 12.5 | Radix roles: `input[list]` và `SelectTrigger` = **combobox**; Checkbox = `checkbox`; `input[type=number]` = `spinbutton` |
| 12.6 | Radix Select mở listbox qua **portal ở body** → tìm option ở cấp `page`, không phải trong dialog |
| 13 | `DraggableDialog` = role `dialog`; appDialog/AlertDialog = role `alertdialog`. Hai loại không lẫn nhau |
| 13.1 | **Đừng match dialog theo title** (bị giãn chữ `実 地 指 １`) — match theo text đặc trưng trong body |
| 13.2 | Nút confirm có thể là `Yes/No/Cancel` chứ không phải `はい/いいえ` → regex `/^(No|いいえ)$/` |
| 14 | Popup xen ngang (`〜を算定しますか？`) → `page.addLocatorHandler(...)`, đừng chờ thủ công |
| 14.1 | Chọn nhánh **không đẻ ra popup tiếp theo** (bấm `Yes` lại mở `カルテ記載選択`) |
| 14.2 | Dọn popup có thể làm **mất focus** của dialog đang test |
| 15 | Đừng biến race condition thành test đỏ: assert cái tất định hơn → log cảnh báo → `expect.soft`. **Assert chặt vào cái app cam kết, log vào cái phụ thuộc timing** |
| 16 | Chạy `--repeat-each=3 --retries=0` trước khi giao (với spec đã quyết định chạy thử) |
| 17 | Đọc `error-context.md` + screenshot, đừng đoán |
| 18 | Test phụ thuộc data: mặc định phải trỏ vào ngày/bệnh nhân **có** dữ liệu; luôn để env override; skip phải log |
| 18.1 | Thao tác ghi DB nằm sau cờ env (`TEST_ALLOW_SAVE=1`) |
| 19 | Chia nhỏ testcase mà vẫn chỉ login một lần → khung ở mục 5.2 |
| 20 | Widget dev (TanStack Devtools) chắn click **không phải lỗi app**. Đừng `force: true` — thao tác bằng phím |
| 21 | Ghim FACT vào source ở đầu spec + đặt hằng số theo tên hằng của source |
| 22 | Source đổi thì **đọc diff trước khi sửa test** (`git log/diff --stat`), diff cho biết assert nào hỏng và bổ sung được gì |

---

## 7. Triage khi test fail — theo thứ tự

1. **App còn sống không?** `curl -sk -o /dev/null -w "%{http_code}\n" https://tenant1.ochacom.local/login`. 502 → khởi động lại app, dừng ở đây.
2. **Có phải rate-limit login không?** Triệu chứng: `expect(page).toHaveURL(/\/$/)` fail, URL kẹt ở `/login`, chạy lẻ thì pass mà chạy cả file thì fail hết. → **Chờ ~4 phút**, đừng sửa code.
3. **Đọc dòng `Error:` ĐẦU TIÊN**, không đọc lướt cả trang.
4. **Mở `test-results/<tên-test>/error-context.md`** để lấy role/tên thật, và `test-failed-1.png` xem popup nào đang che.
5. **Lỗi "subtree intercepts pointer events"** → có thứ đang đè: popup xen ngang (Rule 14) hoặc badge devtools (Rule 20).
6. **Lỗi "element(s) not found" ở locator lồng nhau** → nghi Rule 12.1 / 12.2 trước tiên.
7. **Fail lúc được lúc không** → chạy `--repeat-each=3 --retries=0`; nếu là race condition thì xử theo Rule 15, đừng để suite đỏ ngẫu nhiên.
8. **Dialog `カルテ記載選択` không bật** → không phải bug app, ngày đó đã có 処置 được lưu. Đổi `TEST_TRT_DT` sang ngày sạch **thuộc tháng hiện tại**.
9. **`ECONNREFUSED 127.0.0.1:5432`** → chưa trỏ `TEST_DB_HOST`/`TEST_DB_URL` ra máy chạy Postgres.

Nguyên tắc xuyên suốt: **đổi một thứ mỗi lần, và một lần chạy không chứng minh được gì.**

---

## 8. Lệnh nhanh

```bash
# ── Test ──────────────────────────────────────────────────────────────────
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
curl -sk -o /dev/null -w "%{http_code}\n" https://tenant1.ochacom.local/login   # app sống?
npm test                                                # tất cả
npx playwright test tests/<spec>.spec.ts --workers=1     # một spec, tuần tự
TEST_STEP_MS=3000 npx playwright test tests/<spec> --headed   # xem chậm
npx playwright test tests/<spec> --repeat-each=3 --retries=0  # soi flaky
npm run report                                          # báo cáo HTML

# ── File viewer ───────────────────────────────────────────────────────────
cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/file-viewer
node server.js            # http://127.0.0.1:5173
PORT=8080 node server.js  # đổi cổng
```
