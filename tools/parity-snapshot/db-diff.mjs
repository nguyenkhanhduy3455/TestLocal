#!/usr/bin/env node
// Phase B — so DỮ LIỆU ĐÃ LƯU của một bệnh nhân giữa SQL Server (WinForm) và Postgres (web).
//
//   node tools/parity-snapshot/db-diff.mjs 993948 [--save <tên>]
//
// Quét MỌI bảng có PAT_NO ở hai DB, ghép bảng theo tên bỏ 「_」 + chữ thường (MEDINSINF ↔
// med_ins_inf, ACCDAT ↔ acc_dat) và so CỘT CHUNG theo cùng quy tắc. Cột kỹ thuật chỉ một bên
// có (id, created_at, deleted_at…) tự rơi ra; cột sinh tự động (SEQ identity / sequence) bỏ hẳn.
// Postgres: dòng xoá mềm (deleted_at IS NOT NULL) không tính — WinForm xoá cứng.
// So như ĐA TẬP dòng (thứ tự không tính), in dòng chỉ-win / chỉ-web.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PAT = Number(process.argv[2])
if (!(PAT >= 990000)) { console.error('usage: db-diff.mjs <patNo >= 990000> [--save name]'); process.exit(2) }
const saveIdx = process.argv.indexOf('--save')
const SAVE = saveIdx > 0 ? process.argv[saveIdx + 1] : null

/** Cột không đem so: sinh tự động hoặc dấu thời gian ghi. */
const IGNORE = new Set(['seq', 'id', 'createdat', 'updatedat', 'deletedat', 'upddate', 'updtime', 'insdate', 'regdt', 'upddt', 'createdt', 'createddt', 'updateddt'])

const ms = (sql) =>
    execFileSync('docker', ['exec', '-i', 'ochacom_sql2022', 'bash', '-lc',
        '$(ls -d /opt/mssql-tools*/bin|head -1)/sqlcmd -S localhost -U sa -P tmdu -C -d SIM2000 -b -y 0 -Q "$0"', sql],
    { encoding: 'utf8', maxBuffer: 1 << 28 })
const pg = (sql) =>
    execFileSync('docker', ['exec', '-i', 'ochacom_postgres', 'psql', '-U', 'ochacom', '-d', 'ochacom-dev', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8', maxBuffer: 1 << 28 })

/** Cột FOR JSON qua sqlcmd -y 0: không header, có thể bẻ dòng ⇒ ghép lại; NULL ⇒ rỗng. */
const msJson = (sql) => {
    const body = ms(`SET NOCOUNT ON; ${sql}`).split(/\r?\n/).join('').trim()
    return body.startsWith('[') ? JSON.parse(body) : []
}
const key = (s) => s.toLowerCase().replace(/_/g, '')

const msTables = msJson(`SELECT (SELECT t.name AS n FROM sys.tables t JOIN sys.columns c ON c.object_id=t.object_id
    WHERE c.name='PAT_NO' AND TYPE_NAME(c.system_type_id) IN ('int','smallint','bigint','numeric','decimal') FOR JSON PATH) AS j`).map((r) => r.n)
const pgTables = pg(`SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.table_schema='t_tenant1' AND c.column_name='pat_no' AND t.table_type='BASE TABLE' AND c.data_type IN ('integer','bigint','smallint','numeric')`)
    .trim().split('\n').filter(Boolean)

const norm = (v) => {
    if (v === null || v === undefined) return ''
    if (typeof v === 'number') return String(v)
    if (typeof v === 'boolean') return v ? '1' : '0'
    let s = String(v).trim()
    // 「2014/11/10 0:00:00」 (cột chuỗi giữ ngày kiểu WinForm) ⇒ dạng ISO.
    s = s.replace(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?: (\d{1,2}):(\d{2}):(\d{2}))?$/, (_, y, mo, d, h, mi, se) =>
        `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}` + (h ? `T${h.padStart(2, '0')}:${mi}:${se}` : ''))
    // Ngày / giờ: chuẩn về YYYY-MM-DD (giờ của cột date bên SQL Server luôn 00:00).
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00:?00)?)?$/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    // Mốc thời gian: SQL Server lưu giờ địa phương KHÔNG offset (JST), Postgres timestamptz có
    // offset ⇒ quy cả hai về UTC tới giây.
    const t = s.match(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/)
    if (t) {
        const iso = s.replace(' ', 'T') + (t[2] ? '' : '+09:00')
        const ms = Date.parse(iso)
        if (!Number.isNaN(ms)) return new Date(Math.floor(ms / 1000) * 1000).toISOString()
    }
    if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '')
    return s.normalize('NFKC')
}

const rowsMs = (t) => msJson(`SELECT (SELECT * FROM [${t}] WHERE PAT_NO=${PAT} FOR JSON PATH, INCLUDE_NULL_VALUES) AS j`)
const rowsPg = (t) => {
    const hasDel = pg(`SELECT 1 FROM information_schema.columns WHERE table_schema='t_tenant1' AND table_name='${t}' AND column_name='deleted_at'`).trim()
    const out = pg(`SELECT coalesce(json_agg(x), '[]') FROM t_tenant1.${t} x WHERE pat_no=${PAT}${hasDel ? ' AND deleted_at IS NULL' : ''}`).trim()
    return JSON.parse(out || '[]')
}

const byKey = new Map()
for (const t of msTables) byKey.set(key(t), { ms: t })
for (const t of pgTables) byKey.set(key(t), { ...(byKey.get(key(t)) ?? {}), pg: t })

let diffs = 0
const saved = {}
for (const [k, { ms: tm, pg: tp }] of [...byKey].sort()) {
    const a = tm ? rowsMs(tm) : []
    const b = tp ? rowsPg(tp) : []
    if (!a.length && !b.length) continue
    const colsA = new Map(Object.keys(a[0] ?? {}).map((c) => [key(c), c]))
    const colsB = new Map(Object.keys(b[0] ?? {}).map((c) => [key(c), c]))
    // Bảng chỉ có ở một DB: in số dòng, không so cột.
    if (!tm || !tp) {
        console.log(`■ ${tm ?? tp}: chỉ có ở ${tm ? 'SQL Server' : 'Postgres'} — ${a.length || b.length} dòng`)
        continue
    }
    if (!a.length || !b.length) {
        diffs += a.length + b.length
        console.log(`≠ ${tm} ↔ ${tp}: win ${a.length} dòng, web ${b.length} dòng`)
        continue
    }
    const common = [...colsA.keys()].filter((c) => colsB.has(c) && !IGNORE.has(c)).sort()
    const proj = (r, cols) => common.map((c) => `${c}=${norm(r[cols.get(c)])}`).join(' | ')
    const A = a.map((r) => proj(r, colsA)).sort()
    const B = b.map((r) => proj(r, colsB)).sort()
    saved[k] = { win: A, web: B }
    const onlyA = [...A], onlyB = []
    for (const r of B) { const i = onlyA.indexOf(r); if (i >= 0) onlyA.splice(i, 1); else onlyB.push(r) }
    if (!onlyA.length && !onlyB.length) { console.log(`= ${tm} ↔ ${tp}: ${A.length} dòng khớp`); continue }
    diffs += onlyA.length + onlyB.length
    console.log(`≠ ${tm} ↔ ${tp}: win ${A.length} dòng, web ${B.length} dòng`)
    // Cột lệch: so từng cặp dòng chỉ-win/chỉ-web cùng vị trí để in gọn phần khác.
    const split = (s) => Object.fromEntries(s.split(' | ').map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]))
    for (let i = 0; i < Math.max(onlyA.length, onlyB.length); i++) {
        const x = onlyA[i] ? split(onlyA[i]) : null, y = onlyB[i] ? split(onlyB[i]) : null
        if (x && y) {
            const d = common.filter((c) => x[c] !== y[c]).map((c) => `${c}: win「${x[c]}」 web「${y[c]}」`)
            console.log(`    ~ ${d.join(', ')}`)
        } else if (x) console.log(`    - chỉ win: ${onlyA[i].slice(0, 400)}`)
        else console.log(`    + chỉ web: ${onlyB[i].slice(0, 400)}`)
    }
}
if (SAVE) {
    const out = join(dirname(fileURLToPath(import.meta.url)), '../../capture-results/parity-snapshot', `db-${SAVE}-${PAT}.json`)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(saved, null, 1))
}
console.log(diffs ? `\n✘ ${diffs} dòng lệch` : '\n✔ DỮ LIỆU KHỚP')
process.exit(diffs ? 1 : 0)
