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

/** Rows appended since `since`, newest last. */
export async function auditRowsSince(since: Date, eventType: string): Promise<AuditRow[]> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT id, event_type, actor_id, meta_json, ip_address, created_at
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
            ipAddress: (x['ip_address'] as string | null) ?? null,
            createdAt: x['created_at'] as Date,
        }))
    })
}

/** Short, readable rendering for assertion messages. */
export function describeRow(r: AuditRow): string {
    return (
        `id=${r.id} event=${r.eventType} actor=${r.actorId ?? 'NULL'} ` +
        `ip=${r.ipAddress ?? 'NULL'} meta=${JSON.stringify(r.meta)}`
    )
}

// ─── actions (bên trong meta_json) ───────────────────────────────────────────
//
// Không còn cột before_json / after_json. Thao tác đã làm gì với DB nằm trong
// mảng `actions` của chính meta_json, mỗi phần tử tự đủ để khôi phục một dòng.

/** Loại thao tác. `softdelete` là UPDATE đóng dấu deleted_at — dòng vẫn còn. */
export type AuditActionType = 'insert' | 'update' | 'softdelete' | 'delete'

export interface AuditAction {
    type: AuditActionType
    /** Tên bảng vật lý, không phải tên entity C#. */
    table: string
    /** Cột khoá → giá trị, để viết mệnh đề WHERE. */
    key: Record<string, unknown>
    /** Vắng mặt với `insert` — không có trạng thái trước. */
    old?: Record<string, unknown>
    /** Vắng mặt với `delete` — không còn gì sau đó. */
    new?: Record<string, unknown>
}

/** Mọi action của một dòng nhật ký, theo đúng thứ tự đã ghi. */
export function actionsOf(r: AuditRow): AuditAction[] {
    const a = r.meta['actions']
    return Array.isArray(a) ? (a as AuditAction[]) : []
}

/**
 * Số action thao tác thực sự đã làm — đếm TRƯỚC khi bị cắt bớt.
 *
 * Khác với `actionsOf(r).length` khi `actionsTruncated` là true. Dùng cái này
 * khi muốn khẳng định "thao tác đụng đúng N dòng".
 */
export function actionsTotal(r: AuditRow): number {
    return Number(r.meta['actionsTotal'] ?? 0)
}

/** true = nhật ký không đủ để khôi phục; thao tác quá lớn nên bị cắt. */
export function actionsTruncated(r: AuditRow): boolean {
    return Boolean(r.meta['actionsTruncated'])
}

/** Các action đụng vào một bảng. */
export function actionsOn(r: AuditRow, table: string): AuditAction[] {
    return actionsOf(r).filter((a) => a.table === table)
}

/**
 * Giá trị một cột ở phía `new` của action đầu tiên trên bảng đó.
 * Trả về undefined khi không có action nào, hoặc action đó không có phía `new`.
 */
export function newValue(r: AuditRow, table: string, column: string): unknown {
    return actionsOn(r, table)[0]?.new?.[column]
}

/** Như `newValue`, nhưng đọc phía `old`. */
export function oldValue(r: AuditRow, table: string, column: string): unknown {
    return actionsOn(r, table)[0]?.old?.[column]
}
