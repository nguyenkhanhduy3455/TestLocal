/**
 * fkey-audit — soi hình dạng nút F-key của MỘT dialog đang mở.
 *
 * Dùng chung cho `fkey-bar-common.spec.ts`. Tách ra file riêng để spec chỉ còn
 * phần điều hướng (mở dialog nào, bằng thao tác gì).
 *
 * ─── Chuẩn ĐÚNG là gì ────────────────────────────────────────────────────────
 * Component chung: `apps/web-tenant/src/shared/components/fkey/fkey-bar.tsx`.
 * `FKeyBar.renderCell` (fkey-bar.tsx:186-203) dựng mỗi phím thành:
 *
 *     <button data-fkey="F9" class="fkey-btn …">
 *       <span class="font-bold">F9</span>
 *       <span>登録</span>
 *     </button>
 *
 * Hai dấu vết KHÔNG THỂ giả:
 *  - thuộc tính `data-fkey` — CHỈ FKeyBar phát ra (fkey-bar.tsx:192; `findFKeyButton`
 *    trong fkey-anchor.ts đọc ngược lại chính nó). Spec khác trong repo này đã dùng
 *    nó làm mốc: `page.locator('[data-fkey="F11"]')`.
 *  - class `.fkey-btn` / `.fkey-btn-outline` (styles.css:173/213) — `flex-direction:
 *    column`, `height: 2.5rem`, `min-width: 80px` → nút HAI DÒNG: số F trên, nhãn dưới.
 *
 * ─── Ba trạng thái phân loại ─────────────────────────────────────────────────
 *  OK          nút có `data-fkey` → do FKeyBar dựng. Đây là đích.
 *  HAND_2LINE  code tay nhưng `flex-direction: column` (hoặc có `<br>`) → NHÌN giống
 *              ảnh mẫu, sửa sang FKeyBar sẽ không đổi giao diện.
 *  HAND_1LINE  code tay và nằm NGANG → đúng cái sai trong ảnh: 「F9 確定」 một dòng.
 *
 * ─── Vì sao nhận diện 1 dòng bằng computed style, không bằng toạ độ ──────────
 * Đo bounding box của hai span rồi so trục Y là cách trực quan nhưng bập bênh:
 * nút một dòng có span rỗng/ẩn, nút hai dòng có `line-height` sát nhau. Đọc thẳng
 * `getComputedStyle(btn).flexDirection` là tất định — `.fkey-btn` và các footer
 * code tay dùng `flex-col` đều cho `column`, còn `<Button>` mặc định của shadcn
 * (shared/ui/button.tsx) là `inline-flex` hàng ngang → `row`.
 */
import type { Locator } from '@playwright/test'

/** Nhãn nút F-key: 「F9 確定」 / 「F9確定」 / 「F10」 + nhãn ở span thứ hai. */
export const FKEY_TEXT = /^\s*F(\d{1,2})\b/

/** Chiều cao chuẩn của `.fkey-btn` (styles.css:174 — 2.5rem). */
export const FKEY_BTN_HEIGHT = 40

export type FKeyVerdict = 'OK' | 'HAND_2LINE' | 'HAND_1LINE'

export interface FKeyButtonInfo {
    /** Số phím đọc từ nhãn: 'F9', 'F10'… */
    key: string
    /** Toàn bộ text của nút, đã gộp khoảng trắng: 'F9 確定'. */
    text: string
    /** Có thuộc tính `data-fkey` → do FKeyBar dựng. */
    fromFKeyBar: boolean
    /** computed `flex-direction` của chính nút. */
    flexDirection: string
    /** Nút có chứa thẻ `<br>` (kiểu br-sample-dialog). */
    hasBr: boolean
    /** Chiều cao thực tế (px, làm tròn). */
    height: number
    /** class rút gọn — chỉ để in ra cho dễ soi khi đỏ. */
    className: string
    verdict: FKeyVerdict
}

export interface FKeyAuditResult {
    /** Tên dialog dùng trong báo cáo, ví dụ 'ガイド処置選択 (guide-selection-dialog)'. */
    name: string
    /** File source tương ứng — để biết sửa ở đâu. */
    file: string
    buttons: FKeyButtonInfo[]
    /** Kết luận xấu nhất của cả dialog. Không có nút F nào → 'NO_FKEY'. */
    verdict: FKeyVerdict | 'NO_FKEY' | 'UNREACHABLE'
    /** Lý do khi UNREACHABLE (không mở được dialog trên tenant test). */
    note?: string
    /** Tên file ảnh (tương đối trong thư mục chụp) — điền bởi `captureShots`. */
    shot?: string
}

/**
 * Soi mọi `<button>` trong `scope` có nhãn bắt đầu bằng F<số>.
 *
 * `scope` phải là dialog ĐANG MỞ, không phải `page` — màn nền cũng có dải F-key
 * riêng (GUIDELINE Rule 10.3: 「F10 戻る」 tồn tại ở cả hai nơi, bắt nhầm là treo
 * 15s rồi timeout).
 *
 * Lọc thêm `visible`: dialog nào ẩn/hiện nút theo tab (summary-column-entry có 3
 * footer, user-summary-comment ẩn F1 theo `showF1`) thì chỉ nút đang hiện mới tính.
 */
export async function auditFKeyButtons(scope: Locator): Promise<FKeyButtonInfo[]> {
    const raw = await scope.locator('button').evaluateAll((els) =>
        els.map((el) => {
            const cs = window.getComputedStyle(el)
            return {
                text: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
                fromFKeyBar: el.hasAttribute('data-fkey'),
                flexDirection: cs.flexDirection,
                hasBr: el.querySelector('br') !== null,
                height: Math.round(el.getBoundingClientRect().height),
                className: el.className,
                // `checkVisibility()` (Chromium 105+) bắt display:none /
                // visibility:hidden / content-visibility ở CẢ chuỗi cha.
                //
                // KHÔNG dùng `offsetParent === null` như phản xạ thông thường: theo
                // spec, offsetParent trả null cho MỌI phần tử nằm trong một cha
                // `position: fixed` — mà dialog Radix render qua portal đúng kiểu
                // đó → cả footer bị coi là ẩn và dialog báo nhầm "không có nút F".
                // Kèm height > 0 để loại ô trống vô hình của FKeyBar.
                visible: el.checkVisibility() && el.getBoundingClientRect().height > 0,
            }
        }),
    )

    const out: FKeyButtonInfo[] = []
    for (const b of raw) {
        if (!b.visible) continue
        const m = FKEY_TEXT.exec(b.text)
        if (!m) continue
        // Ô trống của FKeyBar là `<div>`, không phải button — nhưng nút chỉ có mỗi
        // 'F10' (không nhãn) vẫn tính, vì nó vẫn là một phím trên strip.
        out.push({
            key: `F${m[1]}`,
            text: b.text,
            fromFKeyBar: b.fromFKeyBar,
            flexDirection: b.flexDirection,
            hasBr: b.hasBr,
            height: b.height,
            className: b.className,
            verdict: classify(b),
        })
    }
    return out
}

function classify(b: { fromFKeyBar: boolean; flexDirection: string; hasBr: boolean }): FKeyVerdict {
    if (b.fromFKeyBar) return 'OK'
    if (b.flexDirection === 'column' || b.hasBr) return 'HAND_2LINE'
    return 'HAND_1LINE'
}

/** Kết luận của cả dialog = trạng thái XẤU NHẤT trong các nút của nó. */
export function worstVerdict(buttons: FKeyButtonInfo[]): FKeyVerdict | 'NO_FKEY' {
    if (buttons.length === 0) return 'NO_FKEY'
    if (buttons.some((b) => b.verdict === 'HAND_1LINE')) return 'HAND_1LINE'
    if (buttons.some((b) => b.verdict === 'HAND_2LINE')) return 'HAND_2LINE'
    return 'OK'
}

const MARK: Record<FKeyAuditResult['verdict'], string> = {
    OK: '✅ ĐÚNG   ',
    HAND_2LINE: '⚠️  TỰ DỰNG',
    HAND_1LINE: '❌ SAI     ',
    NO_FKEY: '·  (khôngF)',
    UNREACHABLE: '?  bỏ qua ',
}

/** Một dòng log gọn cho mỗi dialog, in ngay khi soi xong để theo dõi lúc chạy. */
export function formatLine(r: FKeyAuditResult): string {
    const keys = r.buttons.map((b) => `${b.key}${b.fromFKeyBar ? '' : '*'}`).join('/') || '—'
    const shape =
        r.buttons.length === 0
            ? ''
            : ` [${r.buttons.map((b) => (b.flexDirection === 'column' || b.hasBr ? '2dòng' : '1dòng')).join(',')} h=${r.buttons.map((b) => b.height).join(',')}]`
    return `${MARK[r.verdict]} ${r.name.padEnd(46)} ${keys}${shape}${r.note ? ` — ${r.note}` : ''}`
}

/** Bảng tổng kết in ở cuối, nhóm theo kết luận. */
export function formatReport(results: FKeyAuditResult[]): string {
    const lines: string[] = ['', '═'.repeat(100), 'TỔNG KẾT — hình dạng nút F-key theo từng dialog', '═'.repeat(100)]
    const order: FKeyAuditResult['verdict'][] = ['HAND_1LINE', 'HAND_2LINE', 'OK', 'NO_FKEY', 'UNREACHABLE']
    const title: Record<FKeyAuditResult['verdict'], string> = {
        HAND_1LINE: '❌ SAI — nút F-key nằm NGANG một dòng (đúng lỗi trong ảnh)',
        HAND_2LINE: '⚠️  TỰ DỰNG — nhìn đúng (2 dòng) nhưng KHÔNG qua <FKeyBar>',
        OK: '✅ ĐÚNG — do <FKeyBar> dựng (có data-fkey)',
        NO_FKEY: '·  Không có nút F-key nào hiển thị',
        UNREACHABLE: '?  Không mở được trên tenant test — chưa kết luận',
    }
    for (const v of order) {
        const group = results.filter((r) => r.verdict === v)
        if (group.length === 0) continue
        lines.push('', `${title[v]}  (${group.length})`)
        for (const r of group) lines.push(`   ${r.name.padEnd(46)} ${r.file}${r.note ? ` — ${r.note}` : ''}`)
    }
    lines.push('', '═'.repeat(100), '(dấu * sau tên phím = nút KHÔNG có data-fkey, tức không do FKeyBar dựng)', '')
    return lines.join('\n')
}

// ═══════════════════════════════════════════════════════════════════════════
// Chụp ảnh kết quả — để soi bằng MẮT sau khi spec chạy xong.
//
// Bảng chữ ở trên nói "nút này không có data-fkey"; ảnh nói "trông nó ra sao".
// Hai thứ bổ sung cho nhau: một dialog có thể ĐÚNG chuẩn mà vẫn xấu (nhãn tràn,
// nút đè lên nội dung, bar rớt xuống ngoài khung), và chỉ ảnh mới lộ ra.
//
// Mỗi dialog cho ra ĐÚNG MỘT ảnh toàn màn hình, khoanh đỏ vùng F-key:
//   <NN>-<verdict>-<file>.png
// Kèm `index.html` — trang xem tất cả, nhóm theo kết luận.
// ═══════════════════════════════════════════════════════════════════════════

/** Lề (px) chừa ra ngoài bao của các nút khi vẽ khung khoanh vùng. */
const FKEY_OUTLINE_PAD = 6

/**
 * Tên file an toàn: bỏ đuôi `.tsx`, đổi mọi ký tự ngoài [a-z0-9-_] thành `-`.
 *
 * Dùng TÊN FILE SOURCE (ASCII) chứ không dùng tên dialog tiếng Nhật: tên file
 * có dấu tiếng Nhật vẫn mở được trên macOS nhưng vỡ khi zip gửi đi hoặc mở trên
 * máy khác, mà mục đích của thư mục này chính là để gửi đi soi.
 */
function slug(file: string): string {
    return file
        .replace(/\.tsx.*$/, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
}

/** Nhãn ngắn, an toàn cho tên file, của mỗi kết luận. */
const VERDICT_SLUG: Record<FKeyAuditResult['verdict'], string> = {
    OK: 'ok',
    HAND_2LINE: 'tudung',
    HAND_1LINE: 'sai',
    NO_FKEY: 'khongF',
    UNREACHABLE: 'chuakiem',
}

/** Thuộc tính đánh dấu khung khoanh vùng, để gỡ đúng nó ra sau khi chụp. */
const OUTLINE_ATTR = 'data-fkey-outline'

/**
 * Chụp MỘT ảnh toàn màn hình của dialog đang mở, có khoanh đỏ vùng F-key.
 *
 * KHÔNG BAO GIỜ ném lỗi: ảnh là thứ để soi thêm, hỏng cái ảnh không được phép
 * làm hỏng kết luận đã đo được. Hỏng thì ghi chú vào `r.note` rồi đi tiếp.
 *
 * Khung được vẽ bằng cách CHÈN một div tạm vào trang rồi gỡ ra ngay sau khi
 * chụp — không xử lý ảnh sau. Vẽ hậu kỳ thì phải kéo thêm thư viện ảnh và tự
 * quy đổi toạ độ theo devicePixelRatio; chèn div thì trình duyệt lo hết, và
 * khung nằm đúng chỗ ở mọi tỉ lệ màn hình.
 *
 * Vùng khoanh là BAO CỦA CHÍNH CÁC NÚT, không phải phần tử footer: mỗi dialog
 * bọc footer một kiểu (có cái còn nhét thêm checkbox 一初診内 vào cùng hàng), nên
 * bao của các nút là thứ duy nhất định nghĩa được đồng nhất.
 */
export async function captureShots(
    page: import('@playwright/test').Page,
    dialog: Locator,
    r: FKeyAuditResult,
    dir: string,
    index: number,
): Promise<void> {
    const path = await import('node:path')
    const png = `${String(index).padStart(2, '0')}-${VERDICT_SLUG[r.verdict]}-${slug(r.file)}.png`
    try {
        // Chèn khung. `position: fixed` khớp với hệ toạ độ của
        // getBoundingClientRect (đều tính theo viewport), nên không phải bù scroll.
        await dialog.locator('button').evaluateAll(
            (els, pad) => {
                let x1 = Infinity,
                    y1 = Infinity,
                    x2 = -Infinity,
                    y2 = -Infinity
                for (const el of els) {
                    if (!(el instanceof HTMLElement) || !el.checkVisibility()) continue
                    const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
                    if (!/^\s*F\d{1,2}\b/.test(txt)) continue
                    const b = el.getBoundingClientRect()
                    if (b.height <= 0) continue
                    x1 = Math.min(x1, b.x)
                    y1 = Math.min(y1, b.y)
                    x2 = Math.max(x2, b.x + b.width)
                    y2 = Math.max(y2, b.y + b.height)
                }
                if (!Number.isFinite(x1)) return
                const box = document.createElement('div')
                box.setAttribute('data-fkey-outline', '')
                Object.assign(box.style, {
                    position: 'fixed',
                    left: `${x1 - pad}px`,
                    top: `${y1 - pad}px`,
                    width: `${x2 - x1 + pad * 2}px`,
                    height: `${y2 - y1 + pad * 2}px`,
                    border: '3px solid #ff0000',
                    borderRadius: '6px',
                    boxShadow: '0 0 0 2px rgba(255,255,255,.9)',
                    // Không chặn chuột và không tham gia layout — khung chỉ để nhìn,
                    // nó KHÔNG được làm xê dịch bất cứ thứ gì đang hiển thị.
                    pointerEvents: 'none',
                    zIndex: '2147483647',
                })
                document.body.appendChild(box)
            },
            FKEY_OUTLINE_PAD,
        )

        // Ảnh viewport (không `fullPage`): app là SPA một màn hình, dialog lại nổi
        // `fixed` nên fullPage cũng chỉ ra đúng chừng này mà tốn thời gian hơn.
        await page.screenshot({ path: path.join(dir, png) })
        r.shot = png
    } catch (e) {
        const first = String((e as Error).message).split('\n')[0] ?? ''
        r.note = `${r.note ? r.note + ' | ' : ''}chụp ảnh lỗi: ${first.slice(0, 80)}`
    } finally {
        // Gỡ khung dù chụp có lỗi hay không — bỏ sót thì ảnh của dialog kế tiếp
        // sẽ mang theo khung thừa của dialog trước.
        await page
            .evaluate((attr) => {
                document.querySelectorAll(`[${attr}]`).forEach((el) => el.remove())
            }, OUTLINE_ATTR)
            .catch(() => {})
    }
}

/** Dọn sạch (hoặc tạo mới) thư mục ảnh trước mỗi lần chạy. */
export async function resetShotDir(dir: string): Promise<void> {
    const fs = await import('node:fs/promises')
    // Xoá hẳn rồi tạo lại: giữ lại ảnh của lần chạy trước thì bảng index.html sẽ
    // trộn ảnh cũ với ảnh mới và không còn tin được nữa.
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true })
}

const HEAD_HTML = `<!doctype html>
<meta charset="utf-8">
<title>F-key bar — ảnh chụp dialog INP</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; margin: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #666; margin: 0 0 24px; }
  h2 { font-size: 16px; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 2px solid currentColor; }
  .sai { color: #c0392b; } .tudung { color: #b8860b; } .ok { color: #1e7e34; } .other { color: #666; }
  .card { border: 1px solid #ccc8; border-radius: 8px; padding: 12px; margin: 0 0 16px; }
  .card h3 { font-size: 14px; margin: 0 0 2px; }
  .card .meta { color: #666; font-size: 12px; margin: 0 0 10px; font-family: ui-monospace, monospace; }
  .card img { width: 100%; max-width: 1100px; border: 1px solid #ccc8; border-radius: 4px; display: block; }
  .none { color: #666; font-style: italic; }
</style>
`

/**
 * Trang xem tất cả ảnh, nhóm theo kết luận — mở `index.html` trong thư mục ảnh.
 *
 * Ảnh nhúng bằng đường dẫn tương đối (không phải data URI) để file HTML nhẹ và
 * cả thư mục zip gửi đi vẫn xem được.
 */
export async function writeContactSheet(dir: string, results: FKeyAuditResult[]): Promise<string> {
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    const order: Array<[FKeyAuditResult['verdict'], string, string]> = [
        ['HAND_1LINE', 'sai', '❌ SAI — nút F-key nằm ngang một dòng'],
        ['HAND_2LINE', 'tudung', '⚠️ TỰ DỰNG — hai dòng nhưng không qua &lt;FKeyBar&gt;'],
        ['OK', 'ok', '✅ ĐÚNG — do &lt;FKeyBar&gt; dựng'],
        ['NO_FKEY', 'other', '· Không có nút F-key nào hiển thị'],
        ['UNREACHABLE', 'other', '? Chưa kiểm được'],
    ]
    const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const parts = [
        HEAD_HTML,
        `<h1>F-key bar — ảnh chụp dialog 診療入力</h1>`,
        `<p class="sub">Chạy lúc ${new Date().toLocaleString('vi-VN')} · ${results.length} mục</p>`,
    ]
    for (const [verdict, cls, title] of order) {
        const group = results.filter((r) => r.verdict === verdict)
        if (group.length === 0) continue
        parts.push(`<h2 class="${cls}">${title} (${group.length})</h2>`)
        for (const r of group) {
            const keys = r.buttons.map((b) => `${b.key}${b.fromFKeyBar ? '' : '*'}`).join(' / ') || '—'
            const heights = r.buttons.map((b) => `${b.height}px`).join(', ')
            parts.push(
                `<div class="card"><h3>${esc(r.name)}</h3>`,
                `<p class="meta">${esc(r.file)} · ${esc(keys)}${heights ? ` · cao ${esc(heights)}` : ''}${r.note ? ` · ${esc(r.note)}` : ''}</p>`,
            )
            if (r.shot) {
                parts.push(`<a href="${r.shot}"><img src="${r.shot}" alt=""></a>`)
            } else {
                parts.push('<p class="none">không có ảnh</p>')
            }
            parts.push('</div>')
        }
    }
    const out = path.join(dir, 'index.html')
    await fs.writeFile(out, parts.join('\n'), 'utf-8')
    return out
}
