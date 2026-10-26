/**
 * Helper cho các spec permission: gọi API tenant thẳng (không qua UI) để tạo role,
 * đổi quyền, gán role, và lấy access token của từng người.
 *
 * TOKEN ADMIN KHÔNG TỐN LOGIN: page admin (authedPage) đã có cookie refresh `rt`, gọi
 * POST /tenant/auth/refresh trên CHÍNH context đó là ra access token mới. Cookie được
 * xoay vòng trong cùng cookie jar nên page vẫn refresh tiếp được bình thường.
 *
 * TOKEN USER TEST tốn đúng 1 login (Rule 10.1): `loginApi` mở một APIRequestContext
 * riêng; context giữ cookie `rt` nên `refresh()` lấy được token mới mà không login lại
 * — dùng để mô phỏng "app tự refresh sau 15 phút".
 *
 * Đổi quyền của role (setRolePermissions) kết thúc phiên của mọi người giữ role đó, nên
 * spec đổi quyền nhiều vòng phải login lại mỗi vòng: `loginApi` chờ theo Retry-After khi
 * gặp 429 (login giới hạn 10 / phút / IP).
 */
import {
  type APIRequestContext,
  type APIResponse,
  type Page,
  expect,
  request,
} from "@playwright/test";

import { DB_SCHEMA, withDb } from "../_shared/db";
import { BASE_URL } from "../_shared/env";
import { ADMIN_USER } from "../_shared/test-data";

export const API = "api";

async function data<T>(res: APIResponse, what: string): Promise<T> {
  expect(
    res.status(),
    `${what}: ${await res.text().catch(() => "")}`,
  ).toBeLessThan(300);
  if (res.status() === 204) return undefined as T;
  const body = await res.json();
  return (body.data ?? body) as T;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Access token mới của admin, lấy từ cookie refresh của page admin. */
export async function adminToken(adminPage: Page): Promise<string> {
  const res = await adminPage
    .context()
    .request.post(`${BASE_URL}${API}/tenant/auth/refresh`);
  return (await data<{ accessToken: string }>(res, "refresh admin"))
    .accessToken;
}

export interface Session {
  ctx: APIRequestContext;
  token: string;
  permissions: string[];
  /** Refresh bằng cookie `rt` của context — như app làm khi access token hết hạn. */
  refresh(): Promise<string>;
  dispose(): Promise<void>;
}

/** Đăng nhập API (1 login) bằng mật khẩu của owner — user test có password_hash chép từ owner. */
export async function loginApi(email: string): Promise<Session> {
  const ctx = await request.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
  });
  let res: APIResponse;
  for (;;) {
    res = await ctx.post(`${API}/tenant/auth/login`, {
      data: { email, password: ADMIN_USER.password },
    });
    if (res.status() !== 429) break;
    const wait = Number(res.headers()["retry-after"] ?? 60);
    await new Promise((r) => setTimeout(r, (wait + 1) * 1000));
  }
  const body = await data<{
    accessToken: string;
    user: { permissions: string[] };
  }>(res, `login ${email} (rate-limit?)`);
  const session: Session = {
    ctx,
    token: body.accessToken,
    permissions: body.user.permissions,
    async refresh() {
      const r = await ctx.post(`${API}/tenant/auth/refresh`);
      const d = await data<{
        accessToken: string;
        user?: { permissions: string[] };
      }>(r, "refresh");
      session.token = d.accessToken;
      if (d.user) session.permissions = d.user.permissions;
      return d.accessToken;
    },
    dispose: () => ctx.dispose(),
  };
  return session;
}

export async function newApi(): Promise<APIRequestContext> {
  return request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
}

export interface RoleInfo {
  id: string;
  code: string;
  name: string;
}

export async function createRole(
  api: APIRequestContext,
  token: string,
  code: string,
  name: string,
  permissions: string[],
): Promise<RoleInfo> {
  const res = await api.post(`${API}/tenant/role-master`, {
    headers: bearer(token),
    data: { code, name, description: null, permissions },
  });
  return data<RoleInfo>(res, `tạo role ${code}`);
}

/**
 * Thay toàn bộ quyền của role — BE áp dụng ngay (cache quyền bị xoá khi ghi). Quyền thực
 * sự đổi thì mọi người giữ role bị kết thúc phiên (token cũ 401, refresh 401).
 */
export async function setRolePermissions(
  api: APIRequestContext,
  token: string,
  role: RoleInfo,
  permissions: string[],
): Promise<void> {
  // updatedAt is the concurrency token: send back what the role holds now.
  const { updatedAt } = await data<{ updatedAt: string }>(
    await api.get(`${API}/tenant/role-master/${role.id}`, {
      headers: bearer(token),
    }),
    `đọc role ${role.code}`,
  );
  const res = await api.put(`${API}/tenant/role-master/${role.id}`, {
    headers: bearer(token),
    data: { name: role.name, description: null, permissions, updatedAt },
  });
  await data(res, `đổi quyền role ${role.code}`);
}

export async function deleteRole(
  api: APIRequestContext,
  token: string,
  role: RoleInfo,
): Promise<void> {
  await data(
    await api.delete(`${API}/tenant/role-master/${role.id}`, {
      headers: bearer(token),
    }),
    "xoá role",
  );
}

export async function roleIdOf(code: string): Promise<string> {
  return withDb(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `SELECT id FROM ${DB_SCHEMA}.app_role WHERE code = $1`,
      [code],
    );
    return rows[0]!.id;
  });
}

/** Gán tập role qua API ユーザマスタ (PUT 更新, thay toàn bộ), giữ nguyên các trường khác. */
export async function assignRole(
  api: APIRequestContext,
  token: string,
  userNo: number,
  roleIds: readonly string[],
): Promise<APIResponse> {
  const detail = await data<{
    userNm: string;
    userPostCd: string | null;
    userAdd1: string | null;
    userAdd2: string | null;
    userTel: string | null;
    userKbn: number;
  }>(
    await api.get(`${API}/tenant/user-master/${userNo}`, {
      headers: bearer(token),
    }),
    "đọc user",
  );
  return api.put(`${API}/tenant/user-master/${userNo}`, {
    headers: bearer(token),
    data: {
      userNm: detail.userNm,
      userPostCd: detail.userPostCd,
      userAdd1: detail.userAdd1,
      userAdd2: detail.userAdd2,
      userTel: detail.userTel,
      userKbn: detail.userKbn,
      roleIds,
    },
  });
}

export interface TestUser {
  userNo: number;
  email: string;
  name: string;
}

/** Xoá user test và các role test (theo mã) — dùng cả trước lẫn sau mỗi lượt chạy. */
export async function purge(
  users: readonly TestUser[],
  roleCodes: readonly string[],
): Promise<void> {
  await withDb(async (c) => {
    const emails = users.map((u) => u.email);
    const nos = users.map((u) => u.userNo);
    const target = `(SELECT id FROM ${DB_SCHEMA}.app_user WHERE email = ANY($1) OR user_no = ANY($2))`;
    await c.query(
      `DELETE FROM ${DB_SCHEMA}.app_user_role WHERE user_id IN ${target}`,
      [emails, nos],
    );
    await c.query(
      `DELETE FROM ${DB_SCHEMA}.app_user WHERE email = ANY($1) OR user_no = ANY($2)`,
      [emails, nos],
    );
    const roles = `(SELECT id FROM ${DB_SCHEMA}.app_role WHERE code = ANY($1))`;
    await c.query(
      `DELETE FROM ${DB_SCHEMA}.app_user_role WHERE role_id IN ${roles}`,
      [roleCodes],
    );
    await c.query(`DELETE FROM ${DB_SCHEMA}.app_role WHERE code = ANY($1)`, [
      roleCodes,
    ]);
  });
}

/** User test đăng nhập được bằng mật khẩu owner, giữ role `roleCode`. */
export async function seedUser(
  user: TestUser,
  roleCode: string,
): Promise<void> {
  await withDb(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO ${DB_SCHEMA}.app_user (user_no, email, display_name, password_hash, user_kbn)
             SELECT $1, $2, $3, password_hash, 2 FROM ${DB_SCHEMA}.app_user WHERE is_owner
             RETURNING id`,
      [user.userNo, user.email, user.name],
    );
    await c.query(
      `INSERT INTO ${DB_SCHEMA}.app_user_role (user_id, role_id)
             SELECT $1, id FROM ${DB_SCHEMA}.app_role WHERE code = $2`,
      [rows[0]!.id, roleCode],
    );
  });
}

export async function roleCodesOf(userNo: number): Promise<string[]> {
  return withDb(async (c) => {
    const { rows } = await c.query<{ code: string }>(
      `SELECT r.code FROM ${DB_SCHEMA}.app_user_role ur
               JOIN ${DB_SCHEMA}.app_role r ON r.id = ur.role_id
               JOIN ${DB_SCHEMA}.app_user u ON u.id = ur.user_id
              WHERE u.user_no = $1 ORDER BY r.code`,
      [userNo],
    );
    return rows.map((r) => r.code);
  });
}

export interface CatalogFunction {
  code: string;
  name: string;
  group: string;
  /** `use` trước, sau đó các quyền nghiệp vụ. */
  permissions: { code: string; action: string; name: string }[];
}

/** Danh mục quyền (GET /tenant/role-master/permission-catalog — đọc từ DB). */
export async function permissionCatalog(
  api: APIRequestContext,
  token: string,
): Promise<CatalogFunction[]> {
  return data(
    await api.get(`${API}/tenant/role-master/permission-catalog`, {
      headers: bearer(token),
    }),
    "catalog quyền",
  );
}
