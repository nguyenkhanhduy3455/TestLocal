/**
 * Helper cho các spec mã (mst_code): gọi admin API để dựng/dọn trạng thái mà spec cần.
 *
 * VÌ SAO QUA API MÀ KHÔNG `UPDATE` DB THẲNG
 * ──────────────────────────────────────────
 * Mã của tenant được cache trong Redis theo "generation" (MstCodeCache.cs): mỗi lần ghi qua API
 * đổi generation, nên lần đọc sau thấy giá trị mới. Sửa `master.mst_code_type` hay
 * `<schema>.mst_code_override` bằng SQL thì API vẫn trả bản cache cũ tới 1 giờ. Mọi thao tác ghi
 * ở đây đi qua endpoint admin:
 *   PUT    /admin/mst-code/types/{cdType}                                — tên + quyền bật cho tenant (enabled)
 *   GET    /admin/tenants/{id}/mst-code/types/{cdType}/codes             — mã của một tenant
 *   PUT    /admin/tenants/{id}/mst-code/types/{cdType}/codes/{v}         — ghi đè (null = kế thừa)
 *   POST   /admin/tenants/{id}/mst-code/types/{cdType}/codes             — thêm mã riêng
 *   POST   /admin/tenants/{id}/mst-code/types/{cdType}/codes/{v}/hide    — ẩn
 *   DELETE /admin/tenants/{id}/mst-code/types/{cdType}/codes/{v}         — bỏ override / xoá mã riêng
 *   PUT    /admin/mst-code/types/{cdType}/codes/{v}                      — sửa mã dùng chung (như màn admin)
 *
 * QUYỀN (BE 7564a9ebc, 2026-10-27): mỗi nhóm có trần `allowed` (seed.sql, không đổi được) và phần admin bật
 * cho tenant `enabled` ⊆ allowed — rename / reorder / hide / add. Admin ghi THAY tenant (các endpoint
 * /admin/tenants/{id}/…) dùng trần `allowed`, không phải `enabled` (MstCodeOverridePolicy.PermissionsFor);
 * ngày của mã chung là của admin, tenant không ghi đè được. Mã riêng của tenant: dải cố định
 * OWN_CODE (30000～32767) cho mọi nhóm.
 *
 * MỘT LOGIN admin API cho mỗi spec gọi `openAdminApi()` (Rule 10.1) — tính vào ngân sách 10.
 */
import { type APIRequestContext, type APIResponse, expect, request } from '@playwright/test'

import { withDb } from '../_shared/db'
import { BASE_URL } from '../_shared/env'
import { ADMIN_USER } from '../_shared/test-data'

export const ADMIN_BASE_URL = process.env.TEST_ADMIN_BASE_URL ?? 'https://admin.ochacom.local/'

/** Slug tenant đang test = nhãn đầu của host BASE_URL (tenant1.ochacom.local → tenant1). */
export const TENANT_SLUG = process.env.TEST_TENANT_SLUG ?? new URL(BASE_URL).hostname.split('.')[0]!

/** Dải mã riêng của tenant — MstCodeOverridePolicy.OwnCodeMin/Max, giống nhau ở mọi nhóm. */
export const OWN_CODE = { min: 30000, max: 32767 } as const

export interface Permissions {
    rename: boolean
    reorder: boolean
    hide: boolean
    add: boolean
}

export const NO_PERMISSIONS: Permissions = { rename: false, reorder: false, hide: false, add: false }

export interface CodeType {
    cdType: number
    name: string | null
    /** Trần của nhóm (seed.sql) — chỉ đọc. */
    allowed: Permissions
    /** Phần admin bật cho tenant; PUT chỉ nhận trong trần. */
    enabled: Permissions
}

export interface TenantCode {
    cdVal: number
    anyVal1: string | null
    status: 'shared' | 'overridden' | 'custom' | 'hidden'
    shared: unknown | null
}

async function data<T>(res: APIResponse, what: string): Promise<T> {
    expect(res.status(), `${what}: ${await res.text().catch(() => '')}`).toBeLessThan(300)
    if (res.status() === 204) return undefined as T
    const text = await res.text()
    if (text === '') return undefined as T
    const body = JSON.parse(text) as { data?: T }
    return (body.data ?? body) as T
}

/** Năm trường của một mã; null ở bản ghi đè = kế thừa giá trị chung. */
export interface CodeFields {
    anyVal1: string | null
    anyVal2: string | null
    sortOrder: number | null
    startDate: string | null
    endDate: string | null
}

export const INHERIT_ALL: CodeFields = {
    anyVal1: null,
    anyVal2: null,
    sortOrder: null,
    startDate: null,
    endDate: null,
}

export interface AdminApi {
    ctx: APIRequestContext
    tenantId: string
    getType(cdType: number): Promise<CodeType>
    setType(t: CodeType): Promise<void>
    /** Bật đúng các quyền trong `enabled` cho tenant (quyền không nêu = tắt), giữ tên nhóm. */
    enable(cdType: number, enabled: Partial<Permissions>): Promise<void>
    tenantCodes(cdType: number): Promise<TenantCode[]>
    save(cdType: number, cdVal: number, fields: CodeFields): Promise<void>
    add(cdType: number, cdVal: number, fields: CodeFields): Promise<void>
    hide(cdType: number, cdVal: number): Promise<void>
    /** Sửa mã DÙNG CHUNG (master.mst_code) — mọi trường bắt buộc, như nút 保存 của màn admin. */
    saveShared(cdType: number, cdVal: number, fields: CodeFields): Promise<void>
    /** Bỏ override của mã dùng chung, hoặc xoá mã riêng — đưa mã về như chưa từng sửa. */
    reset(cdType: number, cdVal: number): Promise<void>
    /** Mọi mã tenant đã đụng tới trong nhóm (≠ 共通) về lại trạng thái ban đầu. */
    resetGroup(cdType: number): Promise<void>
    /** Cùng phiên login, thao tác trên tenant khác (theo slug) — không tốn thêm lượt login. */
    forTenant(slug: string): Promise<AdminApi>
    dispose(): Promise<void>
}

async function tenantIdOf(slug: string): Promise<string> {
    return withDb(async (c) => {
        const r = await c.query<{ id: string }>('SELECT id FROM platform.tenants WHERE slug = $1', [slug])
        expect(r.rows.length, `không thấy tenant ${slug} trong platform.tenants`).toBe(1)
        return r.rows[0]!.id
    })
}

/** Login admin API (1 login) rồi trả bộ lệnh dựng/dọn. */
export async function openAdminApi(): Promise<AdminApi> {
    const anon = await request.newContext({ baseURL: ADMIN_BASE_URL, ignoreHTTPSErrors: true })
    const login = await data<{ accessToken: string }>(
        await anon.post('api/admin/auth/login', {
            data: { email: ADMIN_USER.email, password: ADMIN_USER.password },
        }),
        'login admin API (rate-limit? chờ ~4 phút — Rule 10.1)',
    )
    await anon.dispose()
    const ctx = await request.newContext({
        baseURL: ADMIN_BASE_URL,
        ignoreHTTPSErrors: true,
        extraHTTPHeaders: { authorization: `Bearer ${login.accessToken}` },
    })

    return buildApi(ctx, await tenantIdOf(TENANT_SLUG))
}

function buildApi(ctx: APIRequestContext, tenantId: string): AdminApi {
    const tenantPath = (cdType: number) => `api/admin/tenants/${tenantId}/mst-code/types/${cdType}/codes`

    const api: AdminApi = {
        ctx,
        tenantId,
        async getType(cdType) {
            const types = await data<CodeType[]>(await ctx.get('api/admin/mst-code/types'), 'GET types')
            const t = types.find((x) => x.cdType === cdType)
            expect(t, `nhóm ${cdType} không có trong master.mst_code_type`).toBeTruthy()
            return { cdType, name: t!.name, allowed: { ...t!.allowed }, enabled: { ...t!.enabled } }
        },
        async setType(t) {
            await data(
                await ctx.put(`api/admin/mst-code/types/${t.cdType}`, { data: { name: t.name, enabled: t.enabled } }),
                `PUT type ${t.cdType} → ${JSON.stringify(t.enabled)}`,
            )
        },
        async enable(cdType, enabled) {
            const t = await api.getType(cdType)
            await api.setType({ ...t, enabled: { ...NO_PERMISSIONS, ...enabled } })
        },
        async tenantCodes(cdType) {
            const body = await data<{ items: TenantCode[] }>(await ctx.get(tenantPath(cdType)), `GET codes ${cdType}`)
            return body.items
        },
        async save(cdType, cdVal, fields) {
            await data(await ctx.put(`${tenantPath(cdType)}/${cdVal}`, { data: fields }), `save ${cdType}-${cdVal}`)
        },
        async add(cdType, cdVal, fields) {
            await data(await ctx.post(tenantPath(cdType), { data: { cdVal, ...fields } }), `add ${cdType}-${cdVal}`)
        },
        async hide(cdType, cdVal) {
            await data(await ctx.post(`${tenantPath(cdType)}/${cdVal}/hide`), `hide ${cdType}-${cdVal}`)
        },
        async saveShared(cdType, cdVal, fields) {
            await data(
                await ctx.put(`api/admin/mst-code/types/${cdType}/codes/${cdVal}`, { data: fields }),
                `save shared ${cdType}-${cdVal}`,
            )
        },
        async reset(cdType, cdVal) {
            await data(await ctx.delete(`${tenantPath(cdType)}/${cdVal}`), `reset ${cdType}-${cdVal}`)
        },
        async resetGroup(cdType) {
            for (const c of await api.tenantCodes(cdType)) {
                if (c.status !== 'shared') await api.reset(cdType, c.cdVal)
            }
        },
        async forTenant(slug) {
            return { ...buildApi(ctx, await tenantIdOf(slug)), dispose: async () => {} }
        },
        async dispose() {
            await ctx.dispose()
        },
    }
    return api
}
