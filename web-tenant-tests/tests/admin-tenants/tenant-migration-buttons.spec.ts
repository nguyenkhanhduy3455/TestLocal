import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
    type APIRequestContext,
    type Browser,
    type BrowserContext,
    type Locator,
    type Page,
    expect,
    request,
    test,
} from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled, withDb } from '../_shared/db'
import { makeStep, skipWithReason } from '../_shared/step'
import { ADMIN_USER } from '../_shared/test-data'

/**
 * web-admin /tenants — 4 nút migration: 更新 / 復元 (trên từng dòng tenant) và
 * 次の段階を実行 / 残りをすべて実行 (khung ≪マイグレーション≫). CHẠY THẬT: job
 * migration thật trên Hangfire, backup S3 thật, đổi schema thật của các tenant.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ GHI THẬT — CHỈ CHẠY KHI TEST_ALLOW_MIGRATE=1 VÀ TEST_DB=1 (Rule 18.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Spec TỰ CHUẨN BỊ, không phụ thuộc nhánh nào trên demo1:
 *   1. beforeAll ghi 2 folder migration probe vào worktree demo1
 *      (TEST_DEMO1_DIR, mặc định …/userapp/ochacom-saas) với id = giờ chạy (UTC)
 *      ⇒ luôn là 2 migration mới nhất của build; rồi restart demo1
 *      (TEST_DEMO1_RESTART, mặc định …/userapp/restart-demo1-dev.sh) để API nạp chúng.
 *   2. afterAll gỡ sạch: bảng probe + journal của MỌI schema tenant, trạng thái
 *      tenant đang trỏ tới probe, rollout nhắm tới probe (không gỡ ⇒ BUILD_MISMATCH),
 *      backup S3 của probe, xoá 2 folder rồi restart lại. Lần chạy trước bị ngắt giữa chừng ⇒ beforeAll
 *      gỡ phần sót trước khi tạo mới.
 *  - S3 = RustFS local (bucket backup migration). Spec gọi S3 bằng `curl --aws-sigv4`
 *    (path-style): TEST_S3_URL / TEST_S3_BUCKET / TEST_S3_PREFIX / TEST_S3_ACCESS_KEY / TEST_S3_SECRET_KEY,
 *    mặc định như appsettings.Development.json, secret đọc từ <demo1>/apps/api/.env.
 *    Dùng để làm hỏng backup THẬT (TC-4/5) và dọn backup probe.
 *  - Rollout nhiều đợt như thật: beforeAll tạo 6 tenant tạm e2e-roll-01…06 qua
 *    POST /api/admin/tenants (provisioning thật, 1 login API), TRƯỚC khi ghi probe ⇒ chúng
 *    chờ probe như mọi tenant. Spec tính trước từng lần rollout theo RolloutPlanner
 *    (8 tenant ⇒ đợt [5] [1] [còn lại]) và đối chiếu 成功 / スキップ / 全 + badge từng dòng.
 *    afterAll xoá hẳn các tenant tạm (DROP SCHEMA + xoá dòng platform.tenants, cascade).
 *  - Rollout và 更新 áp MỌI migration còn thiếu của build cho tới bản đích,
 *    kể cả migration chưa commit đang nằm trong demo1 — dọn chúng trước khi chạy.
 *  - Probe High có RequiresMaintenance ⇒ tenant ĐÓNG (503) vài giây lúc 更新 / 復元.
 *    Restart demo1 2 lần ⇒ mọi người dùng demo1 bị ngắt. Chạy RIÊNG file này:
 *      TEST_DB=1 TEST_ALLOW_MIGRATE=1 npx playwright test tests/admin-tenants/tenant-migration-buttons.spec.ts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MIGRATION PROBE (sinh trong beforeAll, bảng theo shape chuẩn §3.16)
 * ═══════════════════════════════════════════════════════════════════════════
 *  - <id>-e2e-probe-create  Low : CREATE TABLE e2e_probe (id uuid, probe_no, label,
 *    val, 4 cột audit) + enable_archive + 2 dòng val = 1, 2.
 *  - <id+1>-e2e-probe-scale High: UPDATE … SET val = val * 10,
 *    BackupTables = [e2e_probe], RequiresMaintenance.
 *  ⇒ chỉ Low: val = [1, 2]; áp đủ: val = [10, 20]; 復元 về trước High: val = [1, 2].
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACTS GHIM TỪ SOURCE (Rule 21) — ochacom-saas demo1, web-admin + API
 * ═══════════════════════════════════════════════════════════════════════════
 *  - Chuỗi UI: features/tenants/migrations/locales/ja.ts.
 *  - Danh sách là virtual list (WindowedListTable): mỗi dòng tenant có role=row.
 *  - FKeyBar: F1 新規テナント作成 / F2 次の段階を実行 / F3 残りをすべて実行 / F4 更新 / F5 復元 /
 *    F9 選択 (F4/F5/F9 tác động lên dòng đang chọn). Rollout chỉ chạy qua F2/F3; 更新/復元 vừa có
 *    nút trên dòng vừa có F4/F5 (spec dùng cả hai).
 *  - Badge: 最新 / 更新あり / 復元済み / 実行中 / 失敗 / 未記録. Tenant vừa 復元 (BE: status
 *    held) hiện 復元済み + ID sau 復元; rollout BỎ QUA nó tới khi bấm 更新 riêng, và hộp xác
 *    nhận rollout liệt kê các tenant đó ("…はロールアウトの対象外です…「更新」を押してください").
 *    Tenant mở mà có error = lần 復元 gần nhất thất bại ⇒ "前回の復元に失敗しました"
 *    (RolloutExecutor.RestoreTenantAsync ghi error khi trả trạng thái cũ).
 *  - 更新: Dialog có dropdown 更新先のマイグレーション = migration CHƯA áp
 *    (GET /admin/tenant-migrations/{id}/targets), mặc định bản mới nhất.
 *  - 復元: Dialog chỉ HIỂN THỊ 復元後のマイグレーション (testid restore-restores-to) =
 *    migration áp ngay trước bản High sẽ bị gỡ (theo applied_at). Không phải High ⇒ "復元できる…ありません";
 *    High nhưng không có backup chụp TRƯỚC applied_at (BackupManifest.ReadAsync) ⇒
 *    "…実行前のバックアップがないため…"; cả hai: 復元する mờ, không có ô gõ slug.
 *  - Key backup (BackupManifest.cs), sau tiền tố MigrationBackupOptions.Prefix (migration-backups/):
 *    <migrationId>/<schema>/<run>/manifest.json và
 *    <run>/<table>.bin. Kiểm tra trước khi nhận 復元 chỉ đọc manifest; job đọc .bin.
 *  - Danh sách migration tự tải lại mỗi 5s ⇒ chờ bằng expect auto-retry, không reload.
 *  - Không có InternalSlugs ⇒ mọi tenant chung 1 đợt ⇒ 次の段階を実行 kết thúc
 *    ở 完了 (không phải 一時停止). Spec nhận cả hai.
 *
 * TƯƠNG THÍCH API ↔ SCHEMA (feat/migration-api-compat)
 *  - Probe High khai `[assembly: ApiRequiresTenantMigration("<High>")]` ⇒ build mới CẦN probe High:
 *    tenant nào chưa có nó (chưa 更新, hoặc vừa 復元 về trước nó) bị middleware trả 503
 *    TENANT_MIGRATING (không phục vụ) và dòng tenant hiện badge "API非互換" (title = lý do).
 *    Khung ≪概要≫ hiện "API必須マイグレーション <High>" + "APIと非互換で利用停止中のテナント N件".
 *  - Hộp thoại 更新: chọn đích dừng trước bản cần ⇒ cảnh báo (testid update-leaves-incompatible).
 *    Hộp thoại 復元: 復元 xong sẽ thiếu bản cần ⇒ cảnh báo (testid restore-api-incompatible-after).
 *  - Chiều ngược (DB cao hơn API): dòng journal của build mới hơn có breaks_api_below lớn hơn
 *    bản build này cần ⇒ cũng 503 + API非互換. Spec giả bằng 1 dòng journal FUTURE (TC-7b).
 *  - Middleware cache tenant ĐƯỢC phục vụ 60s (Redis) ⇒ chờ 503/401 bằng poll ≤ 90s.
 *  - tenant2 và tenant tạm cũng bị chặn tới khi rollout áp probe High cho chúng.
 *
 * 1 LOGIN (Rule 10.1) — page riêng, KHÔNG dùng authedPage (Rule 19.2): cần phiên
 * super-admin ở admin.ochacom.local. `serial`: các testcase nối trạng thái.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'
const ALLOW_MIGRATE = process.env.TEST_ALLOW_MIGRATE === '1'
const DEMO1_DIR =
    process.env.TEST_DEMO1_DIR ?? '/Users/thinhnn/Documents/GitHub/userapp/ochacom-saas'
const DEMO1_RESTART =
    process.env.TEST_DEMO1_RESTART ?? '/Users/thinhnn/Documents/GitHub/userapp/restart-demo1-dev.sh'
const MIGRATIONS_DIR = join(DEMO1_DIR, 'apps/api/src/Ochacom.Migrations/Tenant')

const PROBE_TABLE = 'e2e_probe'
const PROBE_LOW_NAME = 'e2e-probe-create'
const PROBE_HIGH_NAME = 'e2e-probe-scale'
const VALS_APPLIED = [10, 20]
const VALS_LOW_ONLY = [1, 2]

const TENANT = { slug: 'tenant1', schema: 't_tenant1' }
/** Tenant API of TENANT: an anonymous call answers 401 when served, 503 when refused. */
const TENANT_API_BASE = process.env.TEST_TENANT_API_BASE_URL ?? 'https://tenant1.ochacom.local/'
/** Middleware caches a served tenant for 60s: a refusal shows up within that. */
const SERVED_TIMEOUT = 90_000
/** Journal row of a "newer build" migration that breaks this build (removed by the cleanup). */
const FUTURE = {
    id: '29991231000000',
    name: 'e2e-compat-future',
    breaksApiBelow: '29991230000000',
}

/**
 * Extra tenants created (real provisioning) before the probes, so a rollout has several waves
 * like production: with tenant1 / tenant2 that makes 8 → waves [5] [1] [rest] (RolloutPlanner).
 */
const EXTRA_TENANTS = Array.from(
    { length: 6 },
    (_, i) => `e2e-roll-${String(i + 1).padStart(2, '0')}`,
)
/** Provisioning one tenant (schema + baseline data) on a dev machine. */
const PROVISION_TIMEOUT = 300_000

/** RolloutOptions defaults (demo1 has no MigrationRollout override). */
const PLAN = { secondWaveSize: 5, thirdWaveShare: 0.1 }

const schemaOf = (slug: string) => `t_${slug.replace(/-/g, '_')}`

/** Một job migration (gồm drain 3s + backup S3) — rộng tay cho dev server. */
const JOB_TIMEOUT = 120_000
/** Restart demo1 = build API + sinh lại spec OpenAPI + 3 Vite. */
const RESTART_TIMEOUT = 300_000

/** Secret of the migration backup store, as demo1's API reads it from its .env. */
function demo1BackupSecret(): string {
    const env = join(DEMO1_DIR, 'apps/api/.env')
    if (!existsSync(env)) return ''
    const line = readFileSync(env, 'utf8')
        .split('\n')
        .find((l) => l.startsWith('MigrationBackup__S3__SecretKey='))
    return line?.slice(line.indexOf('=') + 1).trim() ?? ''
}

const S3 = {
    url: (process.env.TEST_S3_URL ?? 'http://localhost:9000').replace(/\/$/, ''),
    bucket: process.env.TEST_S3_BUCKET ?? 'ochacom-migration-backups',
    accessKey: process.env.TEST_S3_ACCESS_KEY ?? 'ochacom',
    secretKey: process.env.TEST_S3_SECRET_KEY ?? demo1BackupSecret(),
    /** MigrationBackupOptions.Prefix: every backup key starts with it. */
    prefix: (process.env.TEST_S3_PREFIX ?? 'migration-backups').replace(/\/$/, ''),
}

const JA = {
    upToDate: '最新',
    outdated: '更新あり',
    heldBadge: '保留（復元済み）',
    restored: '復元済み',
    restoredSkipped:
        /はロールアウトの対象外です。最新にするには、各テナントの「更新」を押してください。/,
    restoreFailed: '前回の復元に失敗しました',
    errorGeneric: 'マイグレーションでエラーが発生しました。',
    update: '更新',
    updateConfirm: /^F9.*更新する/,
    updateTarget: '更新先のマイグレーション',
    restore: '復元',
    restoreConfirm: /^F9.*復元する/,
    restoreTypeSlug: /確認のため/,
    restoreNone: /復元できるマイグレーションはありません/,
    restoreNoBackup: /実行前のバックアップがないため/,
    queued: 'ジョブを登録しました。進行状況は一覧に反映されます。',
    latest: (id: string) => `最新マイグレーション ${id}`,
    section: '≪マイグレーション≫',
    next: '次の段階を実行',
    all: '残りをすべて実行',
    run: '実行する',
    cancel: /^F10.*キャンセル/,
    completed: '完了',
    paused: '一時停止',
    upToDateHint: '最新のマイグレーションまで適用済みです',
    apiIncompatible: 'API非互換',
    required: (id: string) => `API必須マイグレーション ${id}`,
    incompatibleCount: /^APIと非互換で利用停止中のテナント \d+件$/,
} as const

// ---------------------------------------------------------------------------
// Probe migrations: written into demo1, loaded by a restart, removed afterwards
// ---------------------------------------------------------------------------

/** 14-digit migration id (UTC, as `pnpm ddl:new` makes it) of `date`. */
function migrationId(date: Date): string {
    return date.toISOString().replace(/\D/g, '').slice(0, 14)
}

const now = new Date()
const PROBE_LOW = migrationId(now)
const PROBE_HIGH = migrationId(new Date(now.getTime() + 1000))

function probeFolders(): string[] {
    if (!existsSync(MIGRATIONS_DIR)) return []
    return readdirSync(MIGRATIONS_DIR).filter(
        (f) => f.endsWith(`-${PROBE_LOW_NAME}`) || f.endsWith(`-${PROBE_HIGH_NAME}`),
    )
}

function migrationClass(
    id: string,
    name: string,
    className: string,
    attributes: string,
): string {
    return `using Ochacom.Migrations.Framework;

namespace Ochacom.Migrations.Tenant._${id}_${name.replace(/-/g, '_')};

// E2E probe written by TestLocal tenant-migration-buttons.spec.ts; removed when the spec ends.
[Migration("${id}", "${name}", ${attributes})]
public sealed class ${className} : TenantMigration
{
    public override Task Up(MigrationContext context) => context.ExecuteSqlFileAsync("up.sql");

    public override Task Down(MigrationContext context) => context.ExecuteSqlFileAsync("down.sql");
}
`
}

function writeMigration(id: string, name: string, files: Record<string, string>): void {
    const dir = join(MIGRATIONS_DIR, `${id}-${name}`)
    mkdirSync(dir, { recursive: true })
    for (const [file, content] of Object.entries(files)) writeFileSync(join(dir, file), content)
}

function writeProbeMigrations(): void {
    writeMigration(PROBE_LOW, PROBE_LOW_NAME, {
        'E2eProbeCreate.cs': migrationClass(
            PROBE_LOW,
            PROBE_LOW_NAME,
            'E2eProbeCreate',
            'Impact = MigrationImpact.Low',
        ),
        'up.sql': `CREATE TABLE ${PROBE_TABLE} (
    id uuid DEFAULT uuidv7() NOT NULL,
    probe_no smallint NOT NULL,
    label character varying(20) COLLATE pg_catalog."ja-JP-x-icu",
    val integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT ${PROBE_TABLE}_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ux_${PROBE_TABLE} ON ${PROBE_TABLE} USING btree (probe_no);

SELECT enable_archive('${PROBE_TABLE}');

INSERT INTO ${PROBE_TABLE} (probe_no, label, val) VALUES (1, 'a', 1), (2, 'b', 2);
`,
        'down.sql': `DROP TABLE ${PROBE_TABLE}_deleted;
DROP TABLE ${PROBE_TABLE};
`,
    })
    writeMigration(PROBE_HIGH, PROBE_HIGH_NAME, {
        'E2eProbeScale.cs': migrationClass(
            PROBE_HIGH,
            PROBE_HIGH_NAME,
            'E2eProbeScale',
            `Impact = MigrationImpact.High, BackupTables = ["${PROBE_TABLE}"], RequiresMaintenance = true`,
        ),
        'up.sql': `UPDATE ${PROBE_TABLE} SET val = val * 10, updated_at = now();
`,
        'down.sql': `UPDATE ${PROBE_TABLE} SET val = val / 10, updated_at = now();
`,
    })
}

/**
 * Removes every trace of probe migrations (this run's or a crashed earlier run's) from
 * the database and the backup store, so the build without them still matches every tenant.
 */
async function removeProbesFromDb(): Promise<void> {
    await withDb(async (c) => {
        const schemas = await c.query<{ nspname: string }>(
            "SELECT nspname FROM pg_namespace WHERE nspname LIKE 't\\_%'",
        )
        const ids: string[] = []
        for (const { nspname } of schemas.rows) {
            const journal = await c.query<{ id: string }>(
                `SELECT id FROM "${nspname}".schema_migrations WHERE name IN ($1, $2, $3)`,
                [PROBE_LOW_NAME, PROBE_HIGH_NAME, FUTURE.name],
            )
            ids.push(...journal.rows.map((r) => r.id))
            await c.query('BEGIN')
            await c.query(`DROP TABLE IF EXISTS "${nspname}".${PROBE_TABLE}_deleted`)
            await c.query(`DROP TABLE IF EXISTS "${nspname}".${PROBE_TABLE}`)
            await c.query(
                `DELETE FROM "${nspname}".schema_migrations WHERE name IN ($1, $2, $3)`,
                [PROBE_LOW_NAME, PROBE_HIGH_NAME, FUTURE.name],
            )
            await c.query('COMMIT')
        }
        const probeIds = [...new Set([...ids, PROBE_LOW, PROBE_HIGH])]
        removeProbeBackups(probeIds)
        // A tenant left pointing at a probe goes back to its newest remaining migration.
        const states = await c.query<{ tenant_id: string; slug: string }>(
            `SELECT s.tenant_id, t.slug FROM platform.tenant_migration_state s
             JOIN platform.tenants t ON t.id = s.tenant_id
             WHERE s.last_migration_id = ANY($1) OR s.error LIKE ANY($2)`,
            [probeIds, probeIds.map((id) => `%${id}%`)],
        )
        for (const { tenant_id, slug } of states.rows) {
            const schema = `t_${slug.replace(/-/g, '_')}`
            const latest = await c.query<{ id: string | null }>(
                `SELECT max(id) AS id FROM "${schema}".schema_migrations`,
            )
            await c.query(
                `UPDATE platform.tenant_migration_state
                 SET status = 'ready', maintenance = false, error = NULL, last_migration_id = $2,
                     updated_at = now()
                 WHERE tenant_id = $1`,
                [tenant_id, latest.rows[0]?.id ?? null],
            )
        }
        // The build check refuses every action while the last rollout targets an unknown migration.
        await c.query(
            'DELETE FROM platform.migration_rollout WHERE target_migration_id = ANY($1)',
            [probeIds],
        )
    })
}

function removeProbeFolders(): void {
    for (const f of probeFolders())
        rmSync(join(MIGRATIONS_DIR, f), { recursive: true, force: true })
    restoreApiRequirements()
}

// The assembly declares ApiRequiresTenantMigration exactly once (ApiRequirements.cs), so the
// probe cannot add a second one: it rewrites that one and marks it, and the cleanup restores it.
const API_REQUIREMENTS_FILE = join(MIGRATIONS_DIR, '..', 'ApiRequirements.cs')
const API_REQUIREMENTS_MARK = '// E2E probe'

/** The build's code "needs" probe High: tenants without it are not served. */
function requireProbeHigh(): void {
    const src = readFileSync(API_REQUIREMENTS_FILE, 'utf8')
    const next = src.replace(
        /\[assembly: ApiRequiresTenantMigration\("\d+"\)\]/,
        `[assembly: ApiRequiresTenantMigration("${PROBE_HIGH}")] ${API_REQUIREMENTS_MARK}`,
    )
    if (next === src) throw new Error('ApiRequirements.cs: không tìm thấy ApiRequiresTenantMigration')
    writeFileSync(API_REQUIREMENTS_FILE, next)
}

function restoreApiRequirements(): void {
    if (!readFileSync(API_REQUIREMENTS_FILE, 'utf8').includes(API_REQUIREMENTS_MARK)) return
    execFileSync('git', ['checkout', '--', 'apps/api/src/Ochacom.Migrations/ApiRequirements.cs'], {
        cwd: DEMO1_DIR,
    })
}

/** One signed S3 request (path-style, SigV4) through curl; returns the body. */
function s3(method: 'GET' | 'DELETE', path: string): string {
    return execFileSync(
        'curl',
        [
            '-sS',
            '--fail-with-body',
            '-X',
            method,
            '--aws-sigv4',
            'aws:amz:us-east-1:s3',
            '--user',
            `${S3.accessKey}:${S3.secretKey}`,
            `${S3.url}/${S3.bucket}/${path}`,
        ],
        { encoding: 'utf8', timeout: 30_000 },
    )
}

/** Every full key under `<S3.prefix>/<prefix>` (one ListObjectsV2 page is plenty for probe backups). */
function s3Keys(prefix: string): string[] {
    const xml = s3('GET', `?list-type=2&prefix=${encodeURIComponent(`${S3.prefix}/${prefix}`)}`)
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]!)
}

function s3Delete(keys: string[]): void {
    for (const key of keys) s3('DELETE', key.split('/').map(encodeURIComponent).join('/'))
}

/** Backups of every probe migration in every schema (`<id>/<schema>/…`). */
function removeProbeBackups(ids: string[]): void {
    for (const id of ids) s3Delete(s3Keys(`${id}/`))
}

/**
 * Creates the extra tenants through the admin API (one API login; the UI logs in separately)
 * and waits until each provisioning job has succeeded.
 */
async function createExtraTenants(api: APIRequestContext): Promise<void> {
    const login = await api.post('api/admin/auth/login', {
        data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
    })
    expect(login.ok(), `login API admin: ${login.status()}`).toBeTruthy()
    const token = ((await login.json()) as { data: { session: { accessToken: string } } }).data.session
        .accessToken
    for (const slug of EXTRA_TENANTS) {
        const res = await api.post('api/admin/tenants', {
            headers: { authorization: `Bearer ${token}` },
            data: { slug, name: `E2E rollout ${slug}`, ownerEmail: `${slug}@example.com` },
        })
        expect(res.status(), `tạo tenant ${slug}: ${await res.text()}`).toBe(201)
    }
    // Wait for the provisioning JOB, not only the tenant status: the tenant is ready_for_setup
    // before the last step (setup invitation) ends, and a job still running when demo1
    // restarts is run again by Hangfire on the new build — which would apply the probes.
    await expect
        .poll(
            () =>
                withDb(async (c) => {
                    const r = await c.query<{ state: string }>(
                        `SELECT j.state FROM platform.provisioning_jobs j
                         JOIN platform.tenants t ON t.id = j.tenant_id WHERE t.slug = ANY($1)`,
                        [EXTRA_TENANTS],
                    )
                    return r.rows.map((x) => x.state).sort()
                }),
            {
                timeout: PROVISION_TIMEOUT,
                intervals: [3_000],
                message: 'job provisioning của tenant tạm chưa xong (succeeded)',
            },
        )
        .toEqual(EXTRA_TENANTS.map(() => 'succeeded'))
}

/** Hard-deletes the extra tenants: schema, then the tenant row (its platform rows cascade). */
async function removeExtraTenants(): Promise<void> {
    await withDb(async (c) => {
        for (const slug of EXTRA_TENANTS) {
            await c.query(`DROP SCHEMA IF EXISTS "${schemaOf(slug)}" CASCADE`)
        }
        await c.query('DELETE FROM platform.tenants WHERE slug = ANY($1)', [EXTRA_TENANTS])
    })
}

/** Restarts demo1 and waits until web-admin answers again. */
async function restartDemo1(api: APIRequestContext): Promise<void> {
    execFileSync('bash', [DEMO1_RESTART], {
        stdio: 'inherit',
        timeout: RESTART_TIMEOUT,
    })
    await expect
        .poll(async () => (await api.get('/login').catch(() => null))?.status() ?? 0, {
            timeout: RESTART_TIMEOUT,
            intervals: [3_000],
            message: 'web-admin không lên lại sau restart demo1 — xem userapp/demo1-dev.log',
        })
        .toBe(200)
}

// ---------------------------------------------------------------------------

async function probeVals(schema: string): Promise<number[] | null> {
    return withDb(async (c) => {
        const exists = await c.query<{ ok: boolean }>('SELECT to_regclass($1) IS NOT NULL AS ok', [
            `${schema}.${PROBE_TABLE}`,
        ])
        if (!exists.rows[0]?.ok) return null
        const r = await c.query<{ val: number }>(
            `SELECT val FROM "${schema}".${PROBE_TABLE} ORDER BY probe_no`,
        )
        return r.rows.map((x) => x.val)
    })
}

async function newAdminPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({
        baseURL: ADMIN_BASE_URL,
        ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    await page.goto('/login?from=%2Ftenants', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('メールアドレス').fill(ADMIN_USER.email)
    await page.getByLabel('パスワード', { exact: true }).fill(ADMIN_USER.password)
    await page.getByRole('button', { name: 'ログイン' }).click()
    await expect(
        page,
        'login admin không vào /tenants — rate-limit (Rule 10.1) hoặc sai tài khoản super-admin',
    ).toHaveURL(/\/tenants/)
    return { context, page }
}

test.describe('web-admin /tenants — 更新 / 復元 / 次の段階を実行 / 残りをすべて実行 (chạy thật)', () => {
    let api: APIRequestContext | undefined
    let tenantApi: APIRequestContext | undefined
    let context: BrowserContext | undefined
    let page: Page
    let skipReason = ''
    let probesWritten = false

    const row = (slug: string): Locator =>
        page.getByRole('row').filter({ has: page.getByText(slug, { exact: true }) })
    const badge = (slug: string, text: string): Locator =>
        row(slug).getByText(text, { exact: true })
    /** Cột migration tải riêng (GET /admin/tenant-migrations) — chờ nó trước khi đọc badge (Rule 10.8). */
    const migrationLoaded = (slug: string) =>
        expect(row(slug).getByText(/^(最新|更新あり|復元済み|失敗|未記録|実行中)$/)).toBeVisible()
    const updateButton = (slug: string): Locator =>
        row(slug).getByRole('button', { name: JA.update, exact: true })
    const restoreButton = (slug: string): Locator =>
        row(slug).getByRole('button', { name: JA.restore, exact: true })
    /**
     * The "job queued" toast is shown. Matches ANY visible copy: an earlier toast may still be
     * leaving the DOM (hidden), so `.first()` could pick that one instead of the new toast.
     */
    async function expectQueued(): Promise<void> {
        const toasts = page.getByText(JA.queued)
        await expect
            .poll(
                async () => {
                    for (const t of await toasts.all()) if (await t.isVisible()) return true
                    return false
                },
                { message: 'toast ジョブを登録しました' },
            )
            .toBe(true)
    }

    /** A key of the FKeyBar ("F4" + label); its name starts with the F-number. */
    const fkey = (n: number): Locator =>
        page.getByRole('button', { name: new RegExp(`^F${n}(?!\\d)`) })
    /** Picks the tenant's row (click), as F4 / F5 / F9 act on the picked row. */
    const pick = (slug: string) => row(slug).getByText(slug, { exact: true }).first().click()
    const section = (): Locator =>
        page.locator('div.mb-1').filter({ has: page.getByText(JA.section, { exact: true }) })
    const rolloutStatus = (): Locator =>
        section().locator('dt', { hasText: '状態' }).locator('xpath=following-sibling::dd[1]')

    /** Whether the tenant API serves TENANT (401 anonymous) or refuses it (503 TENANT_MIGRATING). */
    async function expectServed(served: boolean, message: string): Promise<void> {
        await expect
            .poll(
                async () => {
                    const res = await tenantApi!.get('api/tenant/auth/me')
                    if (res.status() !== 503) return String(res.status())
                    return (await res.text()).includes('TENANT_MIGRATING') ? '503 TENANT_MIGRATING' : '503'
                },
                { timeout: SERVED_TIMEOUT, intervals: [3_000], message },
            )
            .toBe(served ? '401' : '503 TENANT_MIGRATING')
    }

    const apiBadge = (slug: string): Locator => row(slug).getByTestId('migration-api-incompatible')

    /** 更新 tới `target` (chọn trong dropdown); mô tả phải ghi "… から <target> まで". */
    async function update(
        slug: string,
        target: string,
        via: 'row' | 'fkey' = 'row',
    ): Promise<void> {
        if (via === 'fkey') {
            await pick(slug)
            await fkey(4).click()
        } else {
            await updateButton(slug).click()
        }
        const dialog = page.getByRole('dialog')
        const picker = dialog.getByLabel(JA.updateTarget)
        await expect(picker, 'dropdown liệt kê migration chưa áp').toBeEnabled()
        await expect(picker, 'mặc định chọn bản mới nhất chưa áp').toHaveValue(PROBE_HIGH)
        await picker.selectOption(target)
        await expect(dialog, 'mô tả ghi "từ X tới bản chọn"').toContainText(`から ${target} まで`)
        // The build needs probe High: stopping before it keeps the tenant refused, said up front.
        await expect(
            dialog.getByTestId('update-leaves-incompatible'),
            'dừng trước probe High (bản build cần) ⇒ cảnh báo vẫn bị chặn',
        ).toHaveCount(target === PROBE_HIGH ? 0 : 1)
        await dialog.getByRole('button', { name: JA.updateConfirm }).click()
        await expectQueued()
        await expect(dialog).toBeHidden()
    }

    /**
     * Mở 復元: hộp thoại chỉ hiện 復元後のマイグレーション = ID tenant quay về sau 復元
     * (migration áp ngay trước); null = không 復元 được ⇒ không có dòng đó.
     */
    async function openRestore(
        slug: string,
        restoresTo: string | null,
        via: 'row' | 'fkey' = 'row',
    ): Promise<Locator> {
        if (via === 'fkey') {
            await pick(slug)
            await fkey(5).click()
        } else {
            await restoreButton(slug).click()
        }
        const dialog = page.getByRole('dialog')
        // null: expectRestoreRefused kiểm (sau khi thông báo hiện) là không có dòng đó.
        if (restoresTo !== null) {
            await expect(dialog.getByTestId('restore-restores-to')).toHaveText(restoresTo)
        }
        return dialog
    }

    /** Hộp thoại 復元 không cho chạy: chỉ có thông báo, không có ô gõ slug, 復元する mờ. */
    async function expectRestoreRefused(dialog: Locator, message: RegExp): Promise<void> {
        await expect(dialog.getByText(message)).toBeVisible()
        await expect(dialog.getByTestId('restore-restores-to')).toHaveCount(0)
        await expect(dialog.getByLabel(JA.restoreTypeSlug)).toHaveCount(0)
        await expect(dialog.getByRole('button', { name: JA.restoreConfirm })).toBeDisabled()
        await dialog.getByRole('button', { name: JA.cancel }).click()
        await expect(dialog).toBeHidden()
    }

    /**
     * id của rollout gần nhất, đọc từ lần tự tải lại kế tiếp của màn (≤ 5s). Không đọc
     * dòng 実行者: thời điểm hiện theo PHÚT, hai rollout trong cùng phút trông y hệt nhau.
     */
    async function nextRolloutId(): Promise<string | null> {
        const res = await page.waitForResponse(
            (r) => r.request().method() === 'GET' && /\/admin\/tenant-migrations$/.test(r.url()),
        )
        const body = (await res.json()) as {
            data?: { latestRollout?: { id?: string } }
        }
        return body.data?.latestRollout?.id ?? null
    }

    /** Tenants restored from a backup (BE status held): a rollout leaves them out. */
    async function restoredSlugs(): Promise<string[]> {
        return withDb(async (c) => {
            const r = await c.query<{ slug: string }>(
                `SELECT t.slug FROM platform.tenant_migration_state s
                 JOIN platform.tenants t ON t.id = s.tenant_id WHERE s.status = 'held'`,
            )
            return r.rows.map((x) => x.slug)
        })
    }

    async function startRollout(label: string): Promise<void> {
        const before = await nextRolloutId()
        const restored = await restoredSlugs()
        const button = fkey(label === JA.next ? 2 : 3)
        await expect(button, 'không có rollout nào đang chạy ⇒ nút phải bật').toBeEnabled()
        await button.click()
        const dialog = page.getByRole('dialog')
        if (restored.length > 0) {
            // The confirmation names every restored tenant and says to update them one by one.
            await expect(dialog.getByText(JA.restoredSkipped)).toBeVisible()
            for (const slug of restored) await expect(dialog).toContainText(slug)
        } else {
            await expect(dialog.getByText(JA.restoredSkipped)).toHaveCount(0)
        }
        await dialog.getByRole('button', { name: new RegExp(`^F9.*${JA.run}`) }).click()
        await expectQueued()
        await expect
            .poll(nextRolloutId, {
                timeout: JOB_TIMEOUT,
                message: 'phải có rollout MỚI',
            })
            .not.toBe(before)
    }

    test.beforeAll(async ({ browser }) => {
        test.setTimeout(RESTART_TIMEOUT * 2 + PROVISION_TIMEOUT)
        if (!ALLOW_MIGRATE) {
            skipReason =
                'TEST_ALLOW_MIGRATE=1 chưa bật — spec ghi migration probe vào demo1 và áp THẬT (Rule 18.1)'
            return
        }
        if (!dbEnabled) {
            skipReason =
                'TEST_DB=1 chưa bật — cần DB để soi bảng probe, giả trạng thái và dọn probe'
            return
        }
        if (!existsSync(MIGRATIONS_DIR) || !existsSync(DEMO1_RESTART)) {
            skipReason = `không thấy ${MIGRATIONS_DIR} hoặc ${DEMO1_RESTART} — đặt TEST_DEMO1_DIR / TEST_DEMO1_RESTART`
            return
        }
        try {
            s3Keys('none/')
        } catch (e) {
            skipReason = `không gọi được S3 (${S3.url}/${S3.bucket}) — đặt TEST_S3_*: ${String(e).slice(0, 200)}`
            return
        }
        api = await request.newContext({
            baseURL: ADMIN_BASE_URL,
            ignoreHTTPSErrors: true,
        })
        tenantApi = await request.newContext({
            baseURL: TENANT_API_BASE,
            ignoreHTTPSErrors: true,
        })
        // A crashed earlier run may have left probes behind: clear them before adding new ones.
        await removeProbesFromDb()
        await removeExtraTenants()
        removeProbeFolders()
        // Before the probes exist: the new tenants are provisioned without them, so they wait
        // for them like every other tenant.
        await createExtraTenants(api)
        writeProbeMigrations()
        requireProbeHigh()
        probesWritten = true
        await restartDemo1(api)
        ;({ context, page } = await newAdminPage(browser))
    })

    test.afterAll(async () => {
        test.setTimeout(RESTART_TIMEOUT * 2)
        await context?.close()
        if (probesWritten && api) {
            await removeExtraTenants()
            await removeProbesFromDb()
            removeProbeFolders()
            await restartDemo1(api)
        }
        await api?.dispose()
        await tenantApi?.dispose()
    })

    test('TC-0 — build đã nạp 2 migration probe, probe High là migration mới nhất', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await expect(page.getByText(/^最新マイグレーション /)).toHaveText(JA.latest(PROBE_HIGH))
        await migrationLoaded(TENANT.slug)
        // Còn migration chưa áp: 更新あり, hoặc 復元済み nếu vừa được 復元 (test tay) — 更新 bật.
        await expect(
            row(TENANT.slug).getByText(new RegExp(`^(${JA.outdated}|${JA.restored})$`)),
            'probe chưa áp ⇒ 更新あり / 復元済み',
        ).toBeVisible()
        await expect(updateButton(TENANT.slug)).toBeEnabled()
        expect(await probeVals(TENANT.schema), 'chưa có bảng probe').toBeNull()

        // The build needs probe High, which no tenant has yet: every tenant is refused.
        await expect(page.getByText(/^API必須マイグレーション /)).toHaveText(JA.required(PROBE_HIGH))
        await expect(page.getByText(JA.incompatibleCount)).toBeVisible()
        await expect(apiBadge(TENANT.slug)).toHaveText(JA.apiIncompatible)
        await expect(apiBadge(TENANT.slug)).toHaveAttribute(
            'title',
            new RegExp(`Missing .*${PROBE_HIGH}`),
        )
        await expectServed(false, 'thiếu probe High mà build cần ⇒ tenant API trả 503')
        await captureFixedUi(page, 'admin-tenants-api-incompatible')
    })

    test('TC-1 — 更新 chỉ tới probe Low (chọn trong dropdown): High chưa áp', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const step = makeStep(page)
        await update(TENANT.slug, PROBE_LOW)
        await step()
        await expect(row(TENANT.slug), 'job 更新 xong ⇒ dừng ở probe Low').toContainText(
            PROBE_LOW,
            {
                timeout: JOB_TIMEOUT,
            },
        )
        await expect(badge(TENANT.slug, JA.outdated), 'còn probe High ⇒ 更新あり').toBeVisible()
        expect(await probeVals(TENANT.schema), 'chỉ Low: chưa nhân 10').toEqual(VALS_LOW_ONLY)
        await expect(apiBadge(TENANT.slug), 'vẫn thiếu probe High ⇒ vẫn API非互換').toBeVisible()
        await expectServed(false, 'chỉ tới Low ⇒ tenant vẫn bị chặn')
        await captureFixedUi(page, 'admin-tenants-update-to-low')
    })

    test('TC-2 — 復元 khi migration áp gần nhất là Low: chỉ báo không có gì để 復元', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const dialog = await openRestore(TENANT.slug, null)
        await expectRestoreRefused(dialog, JA.restoreNone)
        expect(await probeVals(TENANT.schema), 'không có gì bị đụng').toEqual(VALS_LOW_ONLY)
    })

    test('TC-3 — 更新 lên probe High (mặc định bản mới nhất): runner backup rồi áp High', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await update(TENANT.slug, PROBE_HIGH, 'fkey')
        await expect(badge(TENANT.slug, JA.upToDate)).toBeVisible({
            timeout: JOB_TIMEOUT,
        })
        await expect(row(TENANT.slug)).toContainText(PROBE_HIGH)
        await expect(updateButton(TENANT.slug)).toBeDisabled()
        await expect(updateButton(TENANT.slug)).toHaveAttribute('title', JA.upToDateHint)
        expect(await probeVals(TENANT.schema), 'Low tạo bảng + High nhân 10').toEqual(VALS_APPLIED)
        await expect(apiBadge(TENANT.slug), 'đủ bản build cần ⇒ hết API非互換').toHaveCount(0)
        await expectServed(true, 'đã có probe High ⇒ tenant API phục vụ lại (401 khi chưa login)')
    })

    /** Backup objects of probe High for the tenant: run manifests and table data. */
    const highBackup = () => {
        const keys = s3Keys(`${PROBE_HIGH}/${TENANT.schema}/`)
        return {
            data: keys.filter((k) => k.endsWith('.bin')),
            manifests: keys.filter((k) => k.endsWith('/manifest.json')),
        }
    }

    /** Lùi probe High bằng DB (journal + dữ liệu) để 更新 / rollout áp lại nó. */
    async function revertHigh(): Promise<void> {
        const reverted = await withDb(async (c) => {
            await c.query('BEGIN')
            await c.query(`UPDATE "${TENANT.schema}".${PROBE_TABLE} SET val = val / 10`)
            await c.query(`DELETE FROM "${TENANT.schema}".schema_migrations WHERE id = $1`, [
                PROBE_HIGH,
            ])
            const r = await c.query(
                `UPDATE platform.tenant_migration_state s
                 SET status = 'ready', error = NULL, last_migration_id = $2, updated_at = now()
                 FROM platform.tenants t WHERE t.id = s.tenant_id AND t.slug = $1`,
                [TENANT.slug, PROBE_LOW],
            )
            await c.query('COMMIT')
            return r.rowCount
        })
        expect(reverted, 'lùi probe High').toBe(1)
        await expect(badge(TENANT.slug, JA.outdated)).toBeVisible({
            timeout: 15_000,
        })
        expect(await probeVals(TENANT.schema)).toEqual(VALS_LOW_ONLY)
    }

    test('TC-4 — dữ liệu backup trên S3 đã mất: job 復元 lỗi THẬT, tenant mở lại kèm "前回の復元に失敗しました"', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const backup = highBackup()
        expect(backup.manifests.length, 'TC-3 phải để lại backup trên S3').toBeGreaterThan(0)
        expect(backup.data.length).toBeGreaterThan(0)
        // Giữ manifest (kiểm tra trước khi nhận 復元 qua), xoá dữ liệu bảng (job đọc thì lỗi).
        s3Delete(backup.data)

        const dialog = await openRestore(TENANT.slug, PROBE_LOW)
        await dialog.getByLabel(JA.restoreTypeSlug).fill(TENANT.slug)
        await dialog.getByRole('button', { name: JA.restoreConfirm }).click()
        await expectQueued()
        await expect(dialog).toBeHidden()

        await expect(
            badge(TENANT.slug, JA.restoreFailed),
            'job lỗi ⇒ báo trên dòng tenant',
        ).toBeVisible({
            timeout: JOB_TIMEOUT,
        })
        await expect(
            row(TENANT.slug).getByTitle(new RegExp(`^Restore of ${PROBE_HIGH} failed`)),
        ).toBeVisible()
        await expect(badge(TENANT.slug, JA.upToDate), 'không đổi gì ⇒ vẫn 最新').toBeVisible()
        expect(await probeVals(TENANT.schema), 'schema không bị đụng').toEqual(VALS_APPLIED)
        await captureFixedUi(page, 'admin-tenants-restore-failed')
    })

    test('TC-5 — High không còn backup nào trên S3: hộp thoại 復元 báo không có backup, không cho chạy', async () => {
        skipWithReason(skipReason !== '', skipReason)
        s3Delete(highBackup().manifests)
        const dialog = await openRestore(TENANT.slug, null)
        await expectRestoreRefused(dialog, JA.restoreNoBackup)
        expect(await probeVals(TENANT.schema), 'không có gì bị đụng').toEqual(VALS_APPLIED)
    })

    test('TC-6 — 更新 áp lại probe High (backup mới) rồi 復元 THẬT: dữ liệu quay lại, hiện 更新あり', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await revertHigh()
        await update(TENANT.slug, PROBE_HIGH)
        await expect(badge(TENANT.slug, JA.upToDate)).toBeVisible({
            timeout: JOB_TIMEOUT,
        })
        expect(await probeVals(TENANT.schema)).toEqual(VALS_APPLIED)
        expect(
            highBackup().data.length,
            'runner chụp backup mới trước khi áp High',
        ).toBeGreaterThan(0)

        const dialog = await openRestore(TENANT.slug, PROBE_LOW, 'fkey')
        const submit = dialog.getByRole('button', { name: JA.restoreConfirm })
        await expect(submit, 'chưa gõ slug thì chưa được 復元').toBeDisabled()
        await expect(
            dialog.getByTestId('restore-api-incompatible-after'),
            '復元 về trước probe High (bản build cần) ⇒ báo trước tenant sẽ bị chặn',
        ).toBeVisible()
        await captureFixedUi(page, 'admin-tenant-restore-slug-input')
        await dialog.getByLabel(JA.restoreTypeSlug).fill(TENANT.slug)
        await submit.click()
        await expectQueued()
        await expect(dialog).toBeHidden()
        // Sau 復元: hiện như thường — 更新あり + ID migration hiện tại (probe Low), không badge 保留.
        await expect(row(TENANT.slug), 'job 復元 xong ⇒ lùi về probe Low').toContainText(
            PROBE_LOW,
            {
                timeout: JOB_TIMEOUT,
            },
        )
        await expect(badge(TENANT.slug, JA.restored), 'vừa 復元 ⇒ 復元済み').toBeVisible()
        await expect(badge(TENANT.slug, JA.heldBadge), 'không còn badge 保留 cũ').toHaveCount(0)
        await expect(updateButton(TENANT.slug), 'chưa ở bản mới nhất ⇒ 更新 bật').toBeEnabled()
        await expect(
            badge(TENANT.slug, JA.errorGeneric),
            'không báo lỗi sau 復元 thành công',
        ).toHaveCount(0)
        expect(await probeVals(TENANT.schema), 'bảng probe chép lại từ backup').toEqual(
            VALS_LOW_ONLY,
        )
        await expect(apiBadge(TENANT.slug), '復元 xong thiếu probe High ⇒ API非互換').toBeVisible()
        await expectServed(false, 'vừa 復元 về trước bản build cần ⇒ tenant API trả 503')
        await captureFixedUi(page, 'admin-tenants-after-restore')
    })

    test('TC-7 — 更新 tenant đang 保留: áp lại probe High thật, gỡ 保留', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await update(TENANT.slug, PROBE_HIGH)
        await expect(badge(TENANT.slug, JA.upToDate)).toBeVisible({
            timeout: JOB_TIMEOUT,
        })
        expect(await probeVals(TENANT.schema)).toEqual(VALS_APPLIED)
        await expect(apiBadge(TENANT.slug)).toHaveCount(0)
        await expectServed(true, '更新 lại probe High ⇒ tenant API phục vụ lại')
    })

    test('TC-7b — DB cao hơn API: journal có migration của build mới hơn phá build này ⇒ chặn; gỡ ⇒ mở lại', async () => {
        skipWithReason(skipReason !== '', skipReason)
        // As if a newer build ran a migration that drops what this build reads, then this
        // (older) build was deployed back: the runner of that build recorded breaks_api_below.
        await withDb((c) =>
            c.query(
                `INSERT INTO "${TENANT.schema}".schema_migrations
                     (id, name, checksum, duration_ms, app_version, breaks_api_below)
                 VALUES ($1, $2, 'e2e', 0, 'e2e-newer-build', $3)`,
                [FUTURE.id, FUTURE.name, FUTURE.breaksApiBelow],
            ),
        )
        await expect(apiBadge(TENANT.slug), 'migration lạ phá build này ⇒ API非互換').toBeVisible({
            timeout: 15_000,
        })
        await expect(apiBadge(TENANT.slug)).toHaveAttribute(
            'title',
            new RegExp(`${FUTURE.id} \\(needs an API build requiring ${FUTURE.breaksApiBelow}`),
        )
        await expectServed(false, 'DB có migration phá build này ⇒ tenant API trả 503')

        await withDb((c) =>
            c.query(`DELETE FROM "${TENANT.schema}".schema_migrations WHERE id = $1`, [FUTURE.id]),
        )
        await expect(apiBadge(TENANT.slug), 'gỡ migration lạ ⇒ hết API非互換').toHaveCount(0, {
            timeout: 15_000,
        })
        await expectServed(true, 'gỡ migration lạ ⇒ tenant API phục vụ lại')
    })

    /** Provisioned tenants as a rollout lists them, split into waves like RolloutPlanner.Plan. */
    async function plannedWaves(): Promise<string[][]> {
        const slugs = await withDb(async (c) => {
            const r = await c.query<{ slug: string }>(
                `SELECT slug FROM platform.tenants
                 WHERE deleted_at IS NULL AND status IN ('ready_for_setup', 'active', 'suspended', 'archived')`,
            )
            return r.rows.map((x) => x.slug).sort()
        })
        const second = slugs.slice(0, PLAN.secondWaveSize)
        const rest = slugs.slice(second.length)
        const thirdSize =
            rest.length === 0 ? 0 : Math.max(1, Math.ceil(slugs.length * PLAN.thirdWaveShare))
        return [second, rest.slice(0, thirdSize), rest.slice(thirdSize)].filter((w) => w.length > 0)
    }

    /** Tenants a rollout would migrate now: probe High not applied and not held (restored). */
    async function needsWork(slug: string): Promise<boolean> {
        return withDb(async (c) => {
            const applied = await c.query(
                `SELECT 1 FROM "${schemaOf(slug)}".schema_migrations WHERE id = $1`,
                [PROBE_HIGH],
            )
            const held = await c.query(
                `SELECT 1 FROM platform.tenant_migration_state s JOIN platform.tenants t ON t.id = s.tenant_id
                 WHERE t.slug = $1 AND s.status = 'held'`,
                [slug],
            )
            return applied.rowCount === 0 && held.rowCount === 0
        })
    }

    type Expected = {
        status: string
        ok: number
        skipped: number
        total: number
        migrated: string[]
        untouched: string[]
    }

    /**
     * What the next rollout should do (RolloutExecutor.RunWavesAsync): waves in order, a tenant
     * with nothing to do is skipped, and "next wave only" pauses after the first wave with work
     * unless it is the last one.
     */
    async function expectedRollout(nextWaveOnly: boolean): Promise<Expected> {
        const waves = await plannedWaves()
        const e: Expected = {
            status: JA.completed,
            ok: 0,
            skipped: 0,
            total: waves.flat().length,
            migrated: [],
            untouched: [],
        }
        for (let i = 0; i < waves.length; i++) {
            const work: string[] = []
            for (const slug of waves[i]!) if (await needsWork(slug)) work.push(slug)
            e.ok += work.length
            e.skipped += waves[i]!.length - work.length
            e.migrated.push(...work)
            if (nextWaveOnly && work.length > 0 && i < waves.length - 1) {
                e.status = JA.paused
                for (const later of waves.slice(i + 1).flat())
                    if (await needsWork(later)) e.untouched.push(later)
                break
            }
        }
        return e
    }

    async function runRollout(label: string, nextWaveOnly: boolean): Promise<Expected> {
        const e = await expectedRollout(nextWaveOnly)
        await startRollout(label)
        await expect(rolloutStatus()).toHaveText(e.status, { timeout: JOB_TIMEOUT })
        await expect(section(), 'đếm 成功 / 失敗 / スキップ / 全 như RolloutPlanner').toContainText(
            `成功 ${e.ok} ／ 失敗 0 ／ スキップ（適用済み・復元済み） ${e.skipped} ／ 全 ${e.total}`,
        )
        for (const slug of e.migrated)
            await expect(badge(slug, JA.upToDate), `${slug} vừa được rollout`).toBeVisible({
                timeout: 15_000,
            })
        for (const slug of e.untouched)
            await expect(badge(slug, JA.outdated), `${slug} thuộc đợt sau, chưa chạy`).toBeVisible()
        return e
    }

    test('TC-8 — có ≥ 3 đợt; 復元 tenant1 để rollout phải BỎ QUA nó (BE: held)', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const waves = await plannedWaves()
        expect(
            waves.length,
            `cần ≥ 3 đợt (tenant: ${waves.flat().join(', ')})`,
        ).toBeGreaterThanOrEqual(3)
        for (const slug of EXTRA_TENANTS) await expect(badge(slug, JA.outdated)).toBeVisible()

        const dialog = await openRestore(TENANT.slug, PROBE_LOW)
        await dialog.getByLabel(JA.restoreTypeSlug).fill(TENANT.slug)
        await dialog.getByRole('button', { name: JA.restoreConfirm }).click()
        await expectQueued()
        await expect(row(TENANT.slug)).toContainText(PROBE_LOW, { timeout: JOB_TIMEOUT })
        await expect(badge(TENANT.slug, JA.restored)).toBeVisible()
        await expect(apiBadge(TENANT.slug), 'vừa 復元 ⇒ API非互換').toBeVisible()
        expect(await needsWork(TENANT.slug), 'tenant1 vừa 復元 ⇒ held, rollout bỏ qua').toBe(false)
    })

    test('TC-9 — 次の段階を実行 (lần 1): chỉ chạy đợt đầu có việc rồi 一時停止', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const e = await runRollout(JA.next, true)
        expect(e.status, 'còn đợt sau có việc ⇒ phải dừng').toBe(JA.paused)
        expect(e.migrated.length).toBeGreaterThan(0)
        await captureFixedUi(page, 'admin-tenants-rollout-wave-1')
    })

    test('TC-10 — 次の段階を実行 (lần 2): bỏ qua đợt đã xong, chạy đợt kế tiếp', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const e = await runRollout(JA.next, true)
        expect(e.migrated.length).toBeGreaterThan(0)
    })

    test('TC-11 — 残りをすべて実行: chạy hết các đợt còn lại; tenant vừa 復元 bị bỏ qua', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const e = await runRollout(JA.all, false)
        expect(e.status).toBe(JA.completed)
        expect(e.migrated, 'held ⇒ không rollout').not.toContain(TENANT.slug)
        await expect(badge(TENANT.slug, JA.restored), 'vẫn 復元済み, chờ 更新 riêng').toBeVisible()
        expect(await probeVals(TENANT.schema), 'tenant1 giữ nguyên dữ liệu sau 復元').toEqual(
            VALS_LOW_ONLY,
        )
    })

    test('TC-12 — 更新 tenant vừa 復元: áp lại probe High, hết held', async () => {
        skipWithReason(skipReason !== '', skipReason)
        await update(TENANT.slug, PROBE_HIGH)
        await expect(badge(TENANT.slug, JA.upToDate)).toBeVisible({ timeout: JOB_TIMEOUT })
        expect(await probeVals(TENANT.schema)).toEqual(VALS_APPLIED)
        await expect(apiBadge(TENANT.slug)).toHaveCount(0)
        await expectServed(true, 'tenant1 đủ bản build cần ⇒ phục vụ lại')
    })

    test('TC-13 — 残りをすべて実行 khi mọi tenant đã 最新: chỉ bỏ qua, 完了', async () => {
        skipWithReason(skipReason !== '', skipReason)
        const e = await runRollout(JA.all, false)
        expect(e.ok).toBe(0)
        await expect(page.getByRole('row').getByText(JA.outdated, { exact: true })).toHaveCount(0)
        // Every tenant has probe High now: none is refused any more.
        await expect(page.getByTestId('migration-api-incompatible')).toHaveCount(0)
        await expect(page.getByText(JA.incompatibleCount)).toHaveCount(0)
        for (const slug of [TENANT.slug, ...EXTRA_TENANTS])
            expect(await probeVals(schemaOf(slug)), `${slug} đã áp probe High`).toEqual(
                VALS_APPLIED,
            )
        await captureFixedUi(page, 'admin-tenants-after-rollout')
    })
})
