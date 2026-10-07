#!/usr/bin/env node
/**
 * So 2 snapshot màn 診療入力 (WinForm ↔ web), cùng schema:
 *   { source, patNo, trtDt, header: {patNo, ym, total, days}, fkeys: {F1..}, rows: [[日,部位,療法・処置,点,回], ...] }
 *
 *   node tools/parity-snapshot/diff.mjs capture-results/parity-snapshot/winform-3948-2026-06-28.json \
 *                                       capture-results/parity-snapshot/web-3948-2026-06-28.json
 *
 * Chuẩn hoá cả 2 vế giống nhau (xem `displayRows`): NFKC rồi bỏ MỌI khoảng trắng —
 * padding đầu ô (REGIRYO_PADLEFT) và xuống dòng trong ô 部位 không phải khác biệt nghiệp vụ.
 * Dấu phẩy, ngoặc 【】 vs [] … thì GIỮ: đó là khác biệt người dùng nhìn thấy.
 *
 * Dòng lưới được dóng bằng LCS nên một dòng thừa/thiếu không kéo lệch cả phần sau.
 * Exit code 1 khi có khác biệt.
 */
import fs from 'node:fs'

const [, , winPath, webPath] = process.argv
if (!winPath || !webPath) {
    console.error('usage: diff.mjs <winform.json> <web.json>')
    process.exit(2)
}
const win = JSON.parse(fs.readFileSync(winPath, 'utf8'))
const web = JSON.parse(fs.readFileSync(webPath, 'utf8'))

// UIA trả ô trống của grdRegi là chuỗi 「(null)」.
const norm = (s) => {
    const v = String(s ?? '').normalize('NFKC').replace(/\s+/g, '')
    return v === '(null)' ? '' : v
}
const digits = (s) => norm(s).replace(/[^\d]/g, '')

/**
 * Khác biệt CÓ CHỦ Ý (user xác nhận) — đưa cả hai vế về cùng một dạng trước khi so, để
 * báo cáo chỉ còn lệch parity thật. Thêm luật mới ở đây, kèm ngày + ai xác nhận.
 *  · 2026-10-05 — dòng 日計: WinForm 「[負担金 53030円]  [日計 17675点]」, web
 *    「【負担金 53,030円】 【日計 17,675点】」 (ngoặc 【】 + dấu phẩy) là thiết kế của web.
 */
const INTENTIONAL = [
    (v) => v.replace(/[[【]負担金([\d,]+)円[\]】][[【]日計([\d,]+)点[\]】]/, (_, y, p) =>
        `[負担金${y.replace(/,/g, '')}円][日計${p.replace(/,/g, '')}点]`),
]
const accept = (v) => INTENTIONAL.reduce((acc, f) => f(acc), v)

/**
 * Đưa một lưới về dạng "người dùng nhìn thấy":
 *  · 日: grdRegi giữ số ngày ở MỌI dòng của ngày đó nhưng chỉ vẽ ở dòng đầu; web chỉ
 *    render dòng đầu ⇒ xoá số ngày lặp lại liền kề ở cả hai vế.
 *  · 部位: UIA của WinForm trả kèm vạch 「|」 của sơ đồ răng ⇒ bỏ 「|」.
 *  · 日 + 部位 so CHUNG một ô: dòng 「◯月 合計」 trải qua 2 cột, WinForm đặt chữ ở cột 部位
 *    còn web (col-span-2) đặt ở cột 日.
 */
const displayRows = (rows) => {
    let prevDay = null
    return rows.map((r) => {
        const [day, bui, ...rest] = r.map(norm)
        const shownDay = day !== '' && day === prevDay ? '' : day
        // Dòng không có 日 (tiêu đề tháng, 合計) cắt mạch — ngày 28 tháng 6 không phải
        // "lặp lại" ngày 28 tháng 4.
        prevDay = day === '' ? null : day
        return [shownDay + bui.replace(/[|｜]/g, ''), ...rest.map(accept)].join(' | ')
    })
}

let diffs = 0
const out = []
const note = (line) => out.push(line)

// Màn chính bị che bởi màn khác (歯管 → 歯科疾患管理…) ⇒ WinForm không đọc được header/lưới/phím F;
// web vẫn vẽ lưới phía sau hộp thoại. Chỉ so các cửa sổ/hộp thoại (extra).
const mainHidden = win.extra?.mainHidden === true || web.extra?.mainHidden === true
if (mainHidden) {
    note('⚙ màn chính bị che — bỏ qua header / phím F / lưới, chỉ so cửa sổ đang mở')
    for (const side of [win, web]) {
        side.header = {}
        side.fkeys = {}
        side.rows = []
        if (side.extra) {
            delete side.extra.mainHidden
            delete side.extra.panel // panel / 入力モード thuộc màn chính đang bị che
            delete side.extra.inpMode
        }
    }
}

// ── header ────────────────────────────────────────────────────────────────
note('■ header')
for (const [k, cmp] of [
    ['patNo', digits],
    ['ym', norm],
    ['total', digits],
    ['days', digits],
]) {
    const a = win.header?.[k]
    const b = web.header?.[k]
    const same = cmp(a) === cmp(b)
    if (!same) diffs++
    note(`  ${same ? '=' : '≠'} ${k.padEnd(6)} win「${a}」 web「${b}」`)
}

// ── F keys ────────────────────────────────────────────────────────────────
/**
 * Phím mà nhãn đi theo CẤU HÌNH TỪNG MÁY chứ không theo code — in ra nhưng không tính là
 * lệch parity. F8: ［F8］キー会計機能設定 = Ocha.xml <AccButton> (WinForm) vs
 * device_config inp.accButton (web), xem frm203002.cs:518-531.
 */
const CONFIG_DEPENDENT = new Set(['F8'])
note('■ phím F')
// WinForm đổi thanh phím sang lớp Shift khi nhấn Shift và chỉ đổi lại ở key-up; nếu Shift+F…
// bung hộp thoại thì key-up rơi vào hộp thoại ⇒ btnF1..12 rỗng hết. Trạng thái tạm, không so.
const winShiftStuck = Object.values(win.fkeys ?? {}).every((v) => norm(v) === '')
if (winShiftStuck) note('  ⚙ WinForm đang hiện lớp Shift (hộp thoại nuốt key-up) — bỏ qua so phím F')
const keys = winShiftStuck ? [] : [...new Set([...Object.keys(win.fkeys ?? {}), ...Object.keys(web.fkeys ?? {})])].sort(
    (x, y) => Number(x.slice(1)) - Number(y.slice(1)),
)
for (const k of keys) {
    const a = win.fkeys?.[k]
    const b = web.fkeys?.[k]
    const same = norm(a) === norm(b)
    const cfg = !same && CONFIG_DEPENDENT.has(k)
    if (!same && !cfg) diffs++
    note(`  ${same ? '=' : cfg ? '⚙' : '≠'} ${k.padEnd(4)} win「${norm(a)}」 web「${norm(b)}」${cfg ? ' (cấu hình máy, không tính)' : ''}`)
}

// ── rows (LCS) ────────────────────────────────────────────────────────────
const A = displayRows(win.rows)
const B = displayRows(web.rows)
const L = Array.from({ length: A.length + 1 }, () => new Int32Array(B.length + 1))
for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
        L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])

const ops = []
let i = 0
let j = 0
while (i < A.length || j < B.length) {
    if (i < A.length && j < B.length && A[i] === B[j]) ops.push(['=', A[i++], B[j++]])
    else if (j < B.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) ops.push(['+', null, B[j++]])
    else ops.push(['-', A[i++], null])
}
// Ghép một '-' liền ngay một '+' thành '~' (cùng dòng, nội dung khác) cho dễ đọc.
const merged = []
for (let k = 0; k < ops.length; k++) {
    const [op, a] = ops[k]
    const next = ops[k + 1]
    if (op === '-' && next?.[0] === '+') {
        merged.push(['~', a, next[2]])
        k++
    } else if (op === '+' && next?.[0] === '-') {
        merged.push(['~', next[1], ops[k][2]])
        k++
    } else merged.push(ops[k])
}

note(`■ lưới (win ${A.length} dòng, web ${B.length} dòng)`)
const count = { '=': 0, '~': 0, '-': 0, '+': 0 }
for (const [op, a, b] of merged) {
    count[op]++
    if (op === '=') continue
    diffs++
    if (op === '~') note(`  ~ win: ${a}\n    web: ${b}`)
    else if (op === '-') note(`  - chỉ win: ${a}`)
    else note(`  + chỉ web: ${b}`)
}
note(`  khớp ${count['=']} · khác ${count['~']} · chỉ win ${count['-']} · chỉ web ${count['+']}`)

// ── extra (dữ liệu riêng của kịch bản) ─────────────────────────────────────
// So theo khoá; giá trị chuẩn hoá đệ quy (chuỗi qua norm + INTENTIONAL).
const deep = (v) =>
    Array.isArray(v) ? v.map(deep)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, deep(v[k])]))
    : typeof v === 'string' ? accept(norm(v).replace(/[|｜]/g, '')) // 「|」: sơ đồ răng qua UIA
    : v
// Lưới 履歴 cùng dạng lưới chính ⇒ chuẩn hoá như lưới chính (日 lặp, 「|」, 日+部位 gộp).
for (const side of [win, web]) {
    if (Array.isArray(side.extra?.history)) side.extra.history = displayRows(side.extra.history)
}
// 「System」 = menu hệ thống của cửa sổ (thanh tiêu đề) mà bộ đọc UIA của WinForm vớ phải — không
// thuộc menu chuột phải.
if (Array.isArray(win.extra?.menu)) win.extra.menu = win.extra.menu.filter((m) => m.text !== 'System')

// Hộp thoại / màn mà MỘT bên không đọc được lưới (màn riêng chỉ lấy tiêu đề, bảng không phải
// VirtualListTable…) ⇒ chỉ so tiêu đề + chữ của cặp đó, không tính lệch lưới do bộ đọc.
if (Array.isArray(win.extra?.dialogs) && Array.isArray(web.extra?.dialogs)) {
    win.extra.dialogs.forEach((a, i) => {
        const b = web.extra.dialogs[i]
        if (!b) return
        // Bộ đọc WinForm bỏ hẳn khoá `text` khi hộp không có chữ, bộ đọc web ghi "" — cùng nghĩa.
        for (const d of [a, b]) d.text ??= ''
        const empty = (d) => (d.headers ?? []).length === 0 && (d.rows ?? []).length === 0
        if (empty(a) || empty(b)) for (const d of [a, b]) Object.assign(d, { headers: [], rows: [] })
    })
}
const extraKeys = [...new Set([...Object.keys(win.extra ?? {}), ...Object.keys(web.extra ?? {})])].sort()
if (extraKeys.length) note('■ extra')
for (const k of extraKeys) {
    const a = JSON.stringify(deep(win.extra?.[k]))
    const b = JSON.stringify(deep(web.extra?.[k]))
    const same = a === b
    if (!same) diffs++
    note(`  ${same ? '=' : '≠'} ${k}${same ? '' : `\n    win: ${a}\n    web: ${b}`}`)
}

console.log(`So ${win.source} ↔ ${web.source} — bệnh nhân ${win.patNo}, ${win.trtDt}`)
console.log(out.join('\n'))
console.log(diffs === 0 ? '\n✔ KHỚP HOÀN TOÀN' : `\n✘ ${diffs} khác biệt`)
process.exit(diffs === 0 ? 0 : 1)
