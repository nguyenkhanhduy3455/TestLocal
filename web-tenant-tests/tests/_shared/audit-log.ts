/**
 * Reading `t_<slug>.audit_log` from a spec.
 *
 * There is no API and no screen for the tenant audit trail — the 監査ログ page in
 * web-admin reads `platform.audit_logs`, which holds admin events only. So every
 * spec that checks whether an operation was audited has to look at Postgres
 * directly, and they all need the same three things: which columns the table
 * actually has, a database-side clock, and "rows appended since".
 *
 * Promoted here once a second spec needed it (patient registration and counter
 * payment joined 診療入力), per the repo's promote-on-second-use rule.
 */
import { DB_SCHEMA, withDb } from './db'

export interface AuditRow {
    id: string
    eventType: string
    actorId: string | null
    meta: Record<string, unknown>
    /** undefined = the column is not in this schema at all. */
    beforeJson: unknown
    afterJson: unknown
    ipAddress: string | null
    createdAt: Date
}

/** Column names actually present on `t_<slug>.audit_log`. */
export async function auditColumns(): Promise<string[]> {
    return withDb(async (c) => {
        const r = await c.query<{ column_name: string }>(
            `SELECT column_name
               FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'audit_log'
              ORDER BY ordinal_position`,
            [DB_SCHEMA],
        )
        return r.rows.map((x) => x.column_name)
    })
}

/**
 * True when the schema carries the recovery snapshot columns.
 *
 * They are added to `CREATE TABLE` in `apps/ddl/scripts/migrate/schema-ddl.mjs`,
 * which only runs at provision time — a schema created before that change does
 * NOT pick them up, so every spec has to cope with both shapes rather than
 * exploding on `column does not exist`.
 */
export function hasSnapshotColumns(columns: readonly string[]): boolean {
    return columns.includes('before_json') && columns.includes('after_json')
}

/** Message for the assertion that pins the columns' presence. */
export const MISSING_SNAPSHOT_COLUMNS_HINT =
    `${DB_SCHEMA}.audit_log thiếu before_json/after_json. Hai cột này được thêm vào ` +
    'CREATE TABLE trong apps/ddl/scripts/migrate/schema-ddl.mjs, mà lệnh đó chỉ chạy ' +
    'lúc provision ⇒ schema cũ KHÔNG tự có. Chạy lại pipeline DDL cho tenant này.'

/**
 * "now" read from the DATABASE, not from the test machine.
 *
 * The two can sit on different hosts (see `db.ts` — TEST_DB_HOST exists exactly
 * for that), and a few seconds of clock skew either way would make the "rows
 * written since" window drop the row we just caused, or pick up rows we did not.
 */
export async function dbNow(): Promise<Date> {
    return withDb(async (c) => {
        const r = await c.query<{ t: Date }>('SELECT now() AS t')
        return r.rows[0]!.t
    })
}

/**
 * Rows appended since `since`, newest last. `withSnapshots` selects the two
 * snapshot columns only when the schema has them, so a stale schema still reads.
 */
export async function auditRowsSince(
    since: Date,
    eventType: string,
    withSnapshots: boolean,
): Promise<AuditRow[]> {
    const snapshotCols = withSnapshots ? ', before_json, after_json' : ''
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT id, event_type, actor_id, meta_json, ip_address, created_at${snapshotCols}
               FROM audit_log
              WHERE created_at >= $1 AND event_type = $2
              ORDER BY created_at, id`,
            [since, eventType],
        )
        return r.rows.map((x) => ({
            id: String(x['id']),
            eventType: String(x['event_type']),
            actorId: (x['actor_id'] as string | null) ?? null,
            // jsonb comes back already parsed by `pg`.
            meta: (x['meta_json'] as Record<string, unknown> | null) ?? {},
            beforeJson: withSnapshots ? (x['before_json'] ?? null) : undefined,
            afterJson: withSnapshots ? (x['after_json'] ?? null) : undefined,
            ipAddress: (x['ip_address'] as string | null) ?? null,
            createdAt: x['created_at'] as Date,
        }))
    })
}

/** Short, readable rendering for assertion messages. */
export function describeRow(r: AuditRow): string {
    return (
        `id=${r.id} event=${r.eventType} actor=${r.actorId ?? 'NULL'} ` +
        `ip=${r.ipAddress ?? 'NULL'} meta=${JSON.stringify(r.meta)} ` +
        `before=${JSON.stringify(r.beforeJson ?? null)} after=${JSON.stringify(r.afterJson ?? null)}`
    )
}

// ─── Snapshot shape (written by TenantChangeRecordingInterceptor) ────────────

/** One row inside a `before_json` / `after_json` capture. */
export interface SnapshotRow {
    table: string
    /** insert | update | delete — the intent, before soft-delete rewriting. */
    op: string
    /** Column name → value. Column names, not CLR property names. */
    values: Record<string, unknown>
}

interface SnapshotCapture {
    totalRows: number
    truncated: boolean
    rows: SnapshotRow[]
}

/**
 * Reads the recorder's capture shape. Returns null when the side is absent,
 * which is a real state and not a failure: an insert has no before, a delete has
 * no after.
 */
export function readCapture(side: unknown): SnapshotCapture | null {
    if (side === null || side === undefined) return null
    const c = side as Partial<SnapshotCapture>
    if (!Array.isArray(c.rows)) return null
    return {
        totalRows: Number(c.totalRows ?? c.rows.length),
        truncated: Boolean(c.truncated),
        rows: c.rows as SnapshotRow[],
    }
}

/** Every captured row for one table, in capture order. */
export function rowsForTable(side: unknown, table: string): SnapshotRow[] {
    return readCapture(side)?.rows.filter((r) => r.table === table) ?? []
}

/** One column's value off the first captured row of `table`, or undefined. */
export function capturedValue(side: unknown, table: string, column: string): unknown {
    return rowsForTable(side, table)[0]?.values[column]
}
