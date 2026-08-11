# TEST-PLAYPWRIGHT-GUIDELINE — kinh nghiệm viết testcase Playwright

Phần nối tiếp của [`GUIDELINE.md`](./GUIDELINE.md) (Rule 1–11). File này là **bài học rút ra từ debug thật**, chủ yếu khi viết `oral-hygiene-instruction-dialog.spec.ts` (dialog 実地指１・訪衛指) và `treatment-f11-fkey-button-show-modal.spec.ts`.

Mỗi mục dưới đây đều là **một lần fail thật**, không phải lý thuyết. Đánh số tiếp Rule 12 để dùng chung hệ với `GUIDELINE.md`.

---

## Rule 12 — Locator: những cái bẫy của chính Playwright

### 12.1 — `filter({ has })` khớp CẢ CHÍNH element, không chỉ hậu duệ ⚠️

Muốn lấy "khối chứa tiêu đề 【歯・歯肉の状態】" nên viết:

```ts
dialog.locator('div').filter({ has: page.getByText('【歯・歯肉の状態】') }).last()   // ❌
```

`.last()` **rơi trúng đúng cái div tiêu đề rỗng ruột** (nó tự khớp chính nó), nên `.getByRole('checkbox')` trả về 0 phần tử. Mất 2 vòng debug.

Cách chắc ăn — lấy **cha** của phần tử mang text:

```ts
const boxOf = (text: string) => dialog.getByText(text, { exact: true }).locator('..')   // ✅
const stateBox = boxOf('【歯・歯肉の状態】')
```

### 12.2 — Locator trong `has:` phải TƯƠNG ĐỐI, không được xây từ `dialog`

```ts
dialog.locator('div').filter({ has: dialog.getByText('X') })   // ❌ không bao giờ khớp
dialog.locator('div').filter({ has: page.getByText('X') })     // ✅
```

Playwright áp **nguyên chuỗi selector** của locator con vào từng ứng viên. Truyền `dialog.getByText(...)` nghĩa là "tìm một `role=dialog` **bên trong** cái div này" — vô nghĩa. Lỗi hiện ra chỉ là "element(s) not found", rất khó đoán.

### 12.3 — Không đoán locator, hãy DÒ bằng một spec tạm

Thay vì sửa mò 3–4 vòng, viết một spec probe in thẳng ứng viên ra rồi xoá:

```ts
const cands = dialog.locator('div').filter({ has: page.getByText('【歯・歯肉の状態】') })
console.log('candidates:', await cands.count())
for (let i = 0; i < await cands.count(); i++) {
  console.log(i, (await cands.nth(i).evaluate(e => e.outerHTML)).slice(0, 160).replace(/\s+/g, ' '))
}
console.log('textboxes:', await dialog.getByRole('textbox').count())
```

Chính cái này chỉ ra 12.1 trong **một** lần chạy.

### 12.4 — `svg` đầu tiên trong dialog là icon, không phải chart

`dialog.locator('svg').first()` bắt trúng **icon X của header** (lucide, `viewBox="0 0 24 24"`). Bó theo đặc điểm cấu trúc riêng của chart:

```ts
const chartSvg = dialog.locator('svg:has(foreignObject)')   // ✅ chỉ chart mới có ô 本
```

Nguyên tắc chung: khi nhiều phần tử cùng tag, tìm **đặc điểm chỉ nó có**, đừng dùng `.first()`.

### 12.5 — Radix: `<input list="...">` có role **combobox**, không phải textbox

Ảnh hưởng trực tiếp mọi phép `nth()` / `count()`:

| Phần tử | Role thật |
|---|---|
| `Input` thường | `textbox` |
| `Input` có `list="..."` (datalist) | `combobox` |
| `SelectTrigger` của Radix | `combobox` |
| `Checkbox` của Radix (`<button>`) | `checkbox` |
| `input[type=number]` | `spinbutton` |

→ Đọc **DOM snapshot trong `error-context.md`** để biết role thật, đừng suy đoán.

### 12.6 — Radix Select mở listbox qua PORTAL ở `body`

Option **không nằm trong dialog** → luôn tìm ở cấp `page`:

```ts
await trigger.click()
await page.getByRole('option', { name: '09' }).first().click()   // ✅ page, không phải dialog
await expect(page.getByRole('listbox')).toBeHidden()
```

---

## Rule 13 — Phân biệt các loại dialog của app này

| Thành phần | Role | Nút |
|---|---|---|
| `DraggableDialog` (màn nghiệp vụ, SanteiConfirm…) | `dialog` | tuỳ màn (`F10 戻る`, `Yes/No/Cancel`) |
| `alertDialog` / `confirmDialog` (appDialog, Radix AlertDialog) | `alertdialog` | `OK` / `Yes` / `No` |

Hai loại **không lẫn nhau** → dùng đúng role là tách được ngay:

```ts
const dialog = page.getByRole('dialog').filter({ hasText: '【歯・歯肉の状態】' })
const alert  = page.getByRole('alertdialog')
```

### 13.1 — Đừng match dialog theo TITLE

Title bị giãn chữ: `実 地 指 １ ・ 訪 衛 指`, `チ ェ ッ ク 項 目 設 定`. Match theo **text đặc trưng trong body**:

```ts
page.getByRole('dialog').filter({ hasText: '【歯・歯肉の状態】' })   // ✅
page.getByRole('dialog', { name: '実地指１・訪衛指' })              // ❌ không khớp
```

### 13.2 — Nhãn nút confirm KHÔNG chắc là tiếng Nhật

`confirm-dialog-view.tsx` mặc định `はい/いいえ/キャンセル`, nhưng call-site thực tế đang truyền **`Yes/No/Cancel`**. Test cứng `'いいえ'` là timeout 15s.

```ts
confirm.getByRole('button', { name: /^(No|いいえ)$/ })   // ✅ chịu được cả hai
```

---

## Rule 14 — Popup xen ngang: dùng `addLocatorHandler`, đừng chờ thủ công

`SanteiConfirmDialog` (「〜を算定しますか？」) bung ra **khi grid nạp xong** — thời điểm không đoán được. Nó nổi ĐÈ lên dialog đang test và nuốt mọi cú click:

```
<div class="...react-draggable">…</div> subtree intercepts pointer events
```

Chờ một lần ở đầu test rồi đi tiếp là **bập bênh** — đã thử 5s, rồi 15s, vẫn lọt.

```ts
await page.addLocatorHandler(
  page.getByText(/を算定しますか？/).first(),
  async () => { await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click() },
  { times: 20 },
)
```

Playwright tự chạy handler **trước mỗi actionability check**, xong mới làm tiếp thao tác gốc.

### 14.1 — Chọn nhánh KHÔNG đẻ ra popup tiếp theo

Ban đầu handler bấm `Yes` → 算定 xong lại mở dialog `カルテ記載選択` → **đổi popup này lấy popup khác**, vẫn chặn click. Bấm `No` mới thực sự dọn màn hình.

→ Đọc source xem mỗi nhánh dẫn tới đâu trước khi chọn.

### 14.2 — Dọn popup có thể làm MẤT focus của dialog đang test

Handler đóng popup → focus trả về màn nền (`input` của grid). Đây chính là nguyên nhân một assert focus fail 2/3 lần. Xem Rule 15.

---

## Rule 15 — Đừng biến race condition thành test đỏ

`実地指１` được `chkJichi.Focus()` khi mở dialog, nhưng effect này **đua** với effect open-focus của `DraggableDialog`/react-rnd. Chạy đơn thì đúng, chạy 3 worker thì hỏng 2/3.

Ba lựa chọn, xếp theo độ ưu tiên:

1. **Assert cái tất định hơn** — ví dụ "focus nằm trong dialog" thay vì "focus đúng ô X". (Ở ca này vẫn hỏng vì Rule 14.2 → xuống 2.)
2. **Log cảnh báo, không assert** — vẫn thấy được khi lệch, mà suite không đỏ vì một cuộc đua:

```ts
const focused = await jichi.evaluate((el) => el === document.activeElement).catch(() => false)
if (!focused) console.log(`CẢNH BÁO: 実地指１ không được focus; đang focus: ${desc}`)
```

3. `expect.soft(...)` — vẫn đánh đỏ test ở cuối, chỉ hợp khi muốn **ghi nhận lệch mà không chặn** các assert phía sau.

Nguyên tắc: **assert chặt vào cái app cam kết, log vào cái phụ thuộc timing.** Một test đỏ ngẫu nhiên làm hỏng niềm tin vào cả suite.

---

## Rule 16 — Chạy `--repeat-each=3` trước khi giao

Chạy 1 lần pass **không chứng minh gì** (đúng tinh thần Rule 10.9):

```bash
npx playwright test tests/<spec>.spec.ts --repeat-each=3 --retries=0
```

Đúng lệnh này đã lộ ra assert focus flaky, thứ mà 3 lần chạy đơn liên tiếp đều pass.

---

## Rule 17 — Đọc `error-context.md`, đừng đoán

Mỗi lần fail Playwright ghi vào `test-results/<tên-test>/`:

| File | Dùng để |
|---|---|
| `error-context.md` | **DOM snapshot dạng a11y tree** — biết role/tên thật của mọi phần tử |
| `test-failed-1.png` | thấy ngay popup nào đang che |
| `video.webm` | xem lại diễn biến |

Screenshot chỉ ra ngay `カルテ記載選択` đang chắn màn hình; a11y tree chỉ ra ngay nút là `Yes/No` chứ không phải `はい/いいえ`. Đoán mò 3 vòng không bằng mở 2 file này.

---

## Rule 18 — Test phụ thuộc DATA: chọn mặc định TRỎ VÀO ngày/bệnh nhân có dữ liệu

Ban đầu `TRT_DT` mặc định là hôm nay → không có 部位 → nhánh test click 歯面 **luôn bị bỏ qua**, log "BỎ QUA" mà nhìn như đang pass.

```ts
// Ngày mà bệnh nhân demo CÓ 部位 ở dòng focus → chart mới có răng present để bấm.
const TRT_DT = process.env.TEST_TRT_DT ?? '2009-03-18'
```

Kèm hai quy tắc:

- **Luôn để env override** (`TEST_PAT_NO`, `TEST_TRT_DT`, `TEST_ALLOW_SAVE`).
- **Skip phải có log rõ ràng.** "Không chạy" khác hẳn "chạy và pass":

```ts
if (total === 0) {
  console.log('歯面 chart: 0 răng present → BỎ QUA phần click')
  return
}
```

### 18.1 — Thao tác GHI DB phải nằm sau cờ env

```ts
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'
// mặc định: chỉ chạy tới confirm rồi bấm No — không đụng DB
```

---

## Rule 19 — Chia nhỏ testcase mà vẫn chỉ login MỘT lần

Rule 8 nói mỗi test độc lập, Rule 10.1 nói `< 10` login. Với một dialog sâu cần ~20 testcase thì hai điều đó xung khắc. Cách dung hoà:

```ts
test.describe.configure({ mode: 'serial' })

test.describe('指導文書 — 実地指１・訪衛指 dialog', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    // ⚠️ browser.newPage() KHÔNG kế thừa `use` của playwright.config.ts
    //    → phải truyền tay ignoreHTTPSErrors (cert tự ký) + baseURL.
    page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
    // login + đi tới màn hình + cắm addLocatorHandler ở ĐÂY, một lần duy nhất
  })

  test.afterAll(async () => { await page?.close() })

  test('mở dialog…', async () => { /* … */ })
  test('4 checkbox…', async () => { /* … */ })
})
```

Đổi lại — **phải ghi rõ trong doc-comment đầu file**:

- Testcase **nối tiếp trạng thái**, thứ tự có ý nghĩa → chạy lẻ một test ở giữa sẽ fail.
- `serial`: một test đỏ thì các test sau bị **skip**.
- Page tự tạo nên **không có trace/video/screenshot tự động** của fixture. Cần thì bật tay `context.tracing.start(...)`.

Test Explorer vẫn hiện đủ từng testcase để tick/chạy riêng — đúng mục tiêu.

---

## Rule 20 — Widget dev có thể chắn click, đó KHÔNG phải lỗi app

Badge nổi **TanStack Devtools** ngồi góc dưới-phải, ở viewport nhỏ nó đè lên nút `F10 戻る`:

```
<img alt="TanStack Devtools" …/> from <div>…</div> subtree intercepts pointer events
```

Đừng `force: true` (che mất lỗi thật). Assert **cái mình thực sự muốn kiểm** rồi thao tác bằng đường khác:

```ts
const fb = await f10.boundingBox()
expect(fb!.y + fb!.height, 'nút F10 thò khỏi mép dưới').toBeLessThanOrEqual(SMALL.height)
await page.keyboard.press('F10')   // đóng bằng phím, tránh badge
```

---

## Rule 21 — Ghim FACT vào source ở đầu spec

Mở đầu mỗi spec bằng doc-comment liệt kê **những sự thật lấy từ source** mà test đang bám vào:

```
 *  - components/oral-hygiene-instruction-dialog.tsx
 *      · プラークスコア input lọc `[^0-9.]` ngay khi gõ.
 *      · 指導時刻: giờ 24 mục, phút bước MINUTE_STEP=5 → 12 mục.
 *      · F9 印刷 là STUB → alert 「印刷は未実装です。」
 *  - locales/ja.ts: Q00002 「更新してよろしいですか？」
```

Lợi ích thật: khi source đổi (commit đổi chart sang cung hình trứng, đổi size dialog), **đọc doc-comment là biết ngay assert nào cần soát lại** — không phải đọc lại toàn bộ test.

Đi kèm: **đặt hằng số theo đúng tên hằng của source**, không rải số ma:

```ts
const TOOTH_COUNT = 32        // utils/tooth-chart.ts
const VIEWPORT_MARGIN = 8     // draggable-dialog.tsx
const SURF_ON = '#ef4444'     // ToothGlyph
```

---

## Rule 22 — Source đổi thì ĐỌC DIFF trước khi sửa test

Khi được báo "tôi đã cải thiện code, kiểm tra lại test":

```bash
git log --oneline <base>..HEAD
git diff --stat <base>..HEAD
git diff <base>..HEAD -- <file cần quan tâm>
```

Diff cho biết chính xác **assert nào hỏng và bổ sung được gì**. Ví dụ ở lần đổi tooth-chart:

| Thay đổi trong source | Testcase phát sinh |
|---|---|
| `width={1120} height={720}` + kẹp theo window | dialog vừa cửa sổ, body không cuộn lúc mở |
| SVG bỏ `width/height`, thêm `viewBox`+`w-full` | viewBox đúng, không có width cứng, tỉ lệ đúng |
| `getToothSize` / `getToothVariant` | đếm `circle[r=11/12/15]`, răng 1–3 KHÔNG có vòng trong |
| marker vẽ đè wedge, `pointerEvents:none` | marker phải click-through, wedge vẫn bấm được |

Kiểm tra ngược lại cũng quan trọng: locator cũ `svg g[transform^="translate("] > path` vẫn đúng vì marker mới nằm trong `<g>` lồng, **không phải** con trực tiếp — xác nhận rồi mới yên tâm.

---

## Ghi chú về Rule 6 (`Viết nhanh, KHÔNG tự chạy thử`)

Lần viết spec này **có chạy thử**, và mỗi lỗi dưới đây đều **không thể phát hiện bằng đọc source**:

| # | Lỗi | Chỉ lộ ra khi chạy |
|---|---|---|
| 1 | `filter({has}).last()` trúng div tiêu đề | ✔ |
| 2 | nút confirm là `Yes/No` chứ không phải `はい/いいえ` | ✔ |
| 3 | popup 算定 đến chậm, đè lên dialog | ✔ |
| 4 | bấm `Yes` lại mở tiếp `カルテ記載選択` | ✔ |
| 5 | `svg.first()` trúng icon X của header | ✔ |
| 6 | assert focus flaky 2/3 lần | ✔ |

→ Chủ repo cân nhắc: **giữ Rule 6 cho spec đơn giản** (form, list, sort), nhưng **cho phép chạy thử với dialog lồng sâu / SVG / có popup xen ngang** — nơi locator không thể suy ra chắc chắn từ source. Nếu vẫn muốn giữ Rule 6 tuyệt đối thì bỏ qua ghi chú này, chỉ cần biết cái giá phải trả là spec giao ra gần như chắc chắn fail lần đầu ở các ca kiểu này.
