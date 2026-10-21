import { type APIRequestContext, type Page } from "@playwright/test";

import { dbEnabled } from "../_shared/db";
import { expect, releaseSharedPage, test } from "../_shared/session";
import {
  API,
  adminToken,
  bearer,
  createRole,
  loginApi,
  newApi,
  permissionCatalog,
  purge,
  type CatalogFunction,
  type RoleInfo,
  seedUser,
  type Session,
  setRolePermissions,
} from "./_role-api";
import { ADMIN, WRITE_ENDPOINTS, type WriteRule } from "./permission-contract";

/**
 * Quét quyền của MỌI endpoint ghi của API tenant (208 endpoint, bảng ở permission-contract.ts).
 *
 * Một user test giữ role tuỳ chỉnh 「E2E権限API」; giữa các vòng admin đổi quyền của role
 * qua API — BE áp dụng ngay, không cần login lại (1 login cho cả file).
 *
 *   TC-1 bảng phủ đúng /openapi/tenant.json: không thiếu, không thừa endpoint ghi nào.
 *   TC-2 role rỗng và role 「mọi 利用 (.use)」: mọi endpoint có quyền / ADMIN → 403.
 *   TC-3 mỗi quyền nghiệp vụ một vòng, role chỉ có quyền đó (BE tự thêm .use của chức năng):
 *        · endpoint của quyền đó → KHÔNG bị chặn (400 do body hỏng, handler không chạy);
 *        · endpoint của quyền khác và endpoint ADMIN → 403.
 *   TC-4 role có MỌI quyền: mọi endpoint có quyền đều qua, endpoint ADMIN (nếu còn) vẫn 403.
 *
 * AN TOÀN DỮ LIỆU:
 *   · body luôn là JSON hỏng `{` ⇒ endpoint được phép trả 400 ngay ở bước bind, không ghi gì.
 *   · endpoint KHÔNG có body JSON (DELETE, learning-reset, upload multipart…) chỉ được gọi
 *     ở vòng mong đợi 403 — vòng "được phép" bỏ qua, vì gọi là handler chạy thật (vd xoá
 *     bệnh nhân). Phía "được phép" của chúng được bảo vệ gián tiếp: gán nhầm màn thì vòng
 *     của màn khác sẽ thấy nó không bị chặn.
 *   · tham số đường dẫn là giá trị không tồn tại (32767, guid 0…1, 2000-01-01).
 *   · endpoint OPEN.* không bao giờ được gọi.
 *
 * Chạy: npx playwright test tests/role-master/role-permission-api.spec.ts --workers=1
 */
test.describe.configure({ mode: "serial", timeout: 300_000 });

const USER = {
  userNo: 9903,
  email: "e2e-perm-api@example.test",
  name: "E2E権限API",
};
const ROLE_CODE = "e2e-perm-api";

type OpenApiParam = {
  name: string;
  in: string;
  required?: boolean;
  /** `type` có thể là mảng, vd int route: ["integer", "string"]. */
  schema?: { type?: string | string[]; format?: string };
};
type Endpoint = {
  key: string;
  method: string;
  url: string;
  /** 'json' / 'form' (multipart — routing trả 415 nếu sai Content-Type) / null = không có body. */
  body: "json" | "form" | null;
  rule: WriteRule;
};

const DENIED = new Set([401, 403]);

/** Giá trị chắc chắn không trùng dữ liệu thật nhưng vẫn khớp ràng buộc route. */
function sample(p: OpenApiParam): string {
  const { type, format } = p.schema ?? {};
  const types = Array.isArray(type) ? type : [type];
  if (format === "uuid") return "00000000-0000-0000-0000-000000000001";
  if (format === "date" || /dt$/i.test(p.name)) return "2000-01-01";
  if (types.includes("integer") || types.includes("number")) return "32767";
  return "e2e-none";
}

test.describe("Quyền của mọi endpoint ghi (API tenant)", () => {
  test.skip(!dbEnabled, "cần TEST_DB=1 để seed user test");

  let admin: Page;
  let api: APIRequestContext;
  let member: Session;
  let role: RoleInfo;
  let endpoints: Endpoint[] = [];
  let openapiWrites: string[] = [];
  const rateLimited = new Set<string>();

  // Token admin lấy 1 lần cho cả file: /tenant/auth/refresh giới hạn 30 lượt / cửa sổ theo IP.
  let adminTok: string;
  async function asAdmin<T>(fn: (token: string) => Promise<T>): Promise<T> {
    adminTok ??= await adminToken(admin);
    return fn(adminTok);
  }

  async function grant(permissions: string[]): Promise<void> {
    await asAdmin((t) => setRolePermissions(api, t, role, permissions));
  }

  async function call(e: Endpoint): Promise<number> {
    const contentType =
      e.body === "form"
        ? "multipart/form-data; boundary=e2e"
        : "application/json";
    const res = await api.fetch(`${API}${e.url}`, {
      method: e.method,
      headers: { ...bearer(member.token), "Content-Type": contentType },
      data:
        e.body === "json" ? "{" : e.body === "form" ? "--e2e--\r\n" : undefined,
    });
    return res.status();
  }

  /** Gọi các endpoint, trả danh sách lệch so với mong đợi (rỗng = đạt). */
  async function sweep(
    expectAllowed: (e: Endpoint) => boolean | "skip",
  ): Promise<string[]> {
    const wrong: string[] = [];
    for (const e of endpoints) {
      if (typeof e.rule === "string" && e.rule.startsWith("open:")) continue;
      const allowed = expectAllowed(e);
      if (allowed === "skip") continue;
      // Được phép mà không có body JSON hỏng để chặn ⇒ handler sẽ chạy thật: không gọi.
      if (allowed && e.body !== "json") continue;
      const status = await call(e);
      // Rate limit (vd linkage/export-ticket) chạy TRƯỚC bước kiểm quyền và đếm cả lượt
      // bị 403 ⇒ sau vài vòng chỉ còn 429: không kết luận được, ghi lại rồi bỏ qua.
      // Các endpoint này đã được kiểm dứt khoát ở TC-2 khi hạn mức còn.
      if (status === 429) {
        rateLimited.add(e.key);
        continue;
      }
      const denied = DENIED.has(status);
      if (allowed && (denied || status === 404 || status === 405))
        wrong.push(`${e.key} → ${status} (phải qua)`);
      if (!allowed && !denied) wrong.push(`${e.key} → ${status} (phải 403)`);
    }
    return wrong;
  }

  test.beforeAll(async ({ authedPage }) => {
    admin = authedPage;
    api = await newApi();
    await purge([USER], [ROLE_CODE]);
    role = await asAdmin((t) =>
      createRole(api, t, ROLE_CODE, "E2E権限API", []),
    );
    await seedUser(USER, ROLE_CODE);
    member = await loginApi(USER.email);

    const spec = await (await api.get(`${API}/openapi/tenant.json`)).json();
    type Op = {
      parameters?: OpenApiParam[];
      requestBody?: { content?: Record<string, unknown> };
    };
    for (const [path, item] of Object.entries<
      Record<string, Op> & { parameters?: OpenApiParam[] }
    >(spec.paths)) {
      const { parameters: shared = [], ...ops } = item;
      for (const [m, op] of Object.entries(ops)) {
        const method = m.toUpperCase();
        if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) continue;
        const key = `${method} ${path}`;
        openapiWrites.push(key);
        const rule = WRITE_ENDPOINTS[key];
        if (!rule) continue;
        let url = path;
        for (const p of [...shared, ...(op.parameters ?? [])]) {
          if (p.in === "path")
            url = url.replace(`{${p.name}}`, encodeURIComponent(sample(p)));
        }
        expect(url, `${key}: còn tham số đường dẫn chưa thay`).not.toContain(
          "{",
        );
        const content = Object.keys(op.requestBody?.content ?? {});
        const body =
          content.length === 0
            ? null
            : content.some((c) => c.includes("json"))
              ? "json"
              : "form";
        endpoints.push({ key, method, url, body, rule });
      }
    }
  });

  test.afterAll(async () => {
    if (rateLimited.size)
      console.log(`429 (bỏ qua): ${[...rateLimited].join(", ")}`);
    await member?.dispose();
    await api?.dispose();
    await releaseSharedPage(admin);
    if (dbEnabled) await purge([USER], [ROLE_CODE]);
  });

  test("TC-1 — bảng hợp đồng phủ đúng mọi endpoint ghi của OpenAPI", async () => {
    const table = Object.keys(WRITE_ENDPOINTS);
    expect(
      openapiWrites.filter((k) => !table.includes(k)),
      "endpoint ghi MỚI chưa phân loại quyền trong permission-contract.ts",
    ).toEqual([]);
    expect(
      table.filter((k) => !openapiWrites.includes(k)),
      "dòng trong bảng không còn endpoint tương ứng",
    ).toEqual([]);
    console.log(
      `endpoint ghi: ${table.length} — có quyền ${endpoints.filter((e) => Array.isArray(e.rule)).length}, ` +
        `ADMIN ${endpoints.filter((e) => e.rule === ADMIN).length}, ` +
        `mở ${endpoints.filter((e) => typeof e.rule === "string" && e.rule.startsWith("open:")).length}`,
    );
  });

  const allCodes = (catalog: CatalogFunction[]) =>
    catalog.flatMap((f) => f.permissions.map((p) => p.code));
  const actionCodes = (catalog: CatalogFunction[]) =>
    catalog.flatMap((f) =>
      f.permissions.filter((p) => p.action !== "use").map((p) => p.code),
    );

  test("TC-2 — role rỗng / role chỉ 利用: mọi endpoint ghi có quyền đều 403", async () => {
    await grant([]);
    expect(await sweep(() => false), "role rỗng").toEqual([]);
    expect([...rateLimited], "TC-2 phải kiểm dứt khoát mọi endpoint").toEqual(
      [],
    );

    const catalog = await asAdmin((t) => permissionCatalog(api, t));
    await grant(
      catalog.map((f) => f.permissions.find((p) => p.action === "use")!.code),
    );
    expect(await sweep(() => false), "role mọi 利用").toEqual([]);
  });

  test("TC-3 — mỗi quyền nghiệp vụ mở đúng endpoint của nó, không hơn", async () => {
    const catalog = await asAdmin((t) => permissionCatalog(api, t));
    const codes = actionCodes(catalog);
    // Mọi mã trong bảng hợp đồng phải là quyền nghiệp vụ có thật trong danh mục DB.
    const contractCodes = new Set(
      endpoints.flatMap((e) => (Array.isArray(e.rule) ? e.rule : [])),
    );
    expect(
      [...contractCodes].filter((c) => !codes.includes(c)),
      "mã không có trong danh mục",
    ).toEqual([]);
    const wrong: string[] = [];
    let checkedAllowed = 0;
    for (const code of codes) {
      await grant([code]);
      const owns = (e: Endpoint) =>
        Array.isArray(e.rule) && e.rule.includes(code);
      checkedAllowed += endpoints.filter(
        (e) => owns(e) && e.body === "json",
      ).length;
      wrong.push(...(await sweep(owns)).map((w) => `[${code}] ${w}`));
    }
    console.log(
      `${codes.length} vòng; ${checkedAllowed} lượt kiểm phía được phép (endpoint body JSON); ` +
        `${endpoints.filter((e) => Array.isArray(e.rule) && e.body !== "json").length} endpoint ` +
        "không body JSON chỉ kiểm phía bị chặn",
    );
    expect(wrong).toEqual([]);
  });

  test("TC-4 — role có mọi quyền: endpoint có quyền đều qua, endpoint ADMIN vẫn 403", async () => {
    const catalog = await asAdmin((t) => permissionCatalog(api, t));
    await grant(allCodes(catalog));
    expect(await sweep((e) => (e.rule === ADMIN ? false : "skip"))).toEqual([]);
    expect(await sweep((e) => (Array.isArray(e.rule) ? true : "skip"))).toEqual(
      [],
    );
  });
});
