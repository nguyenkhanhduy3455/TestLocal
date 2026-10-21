import { type APIRequestContext, type Page } from "@playwright/test";

import { captureFixedUi } from "../_shared/capture";
import { DB_SCHEMA, dbEnabled, withDb } from "../_shared/db";
import { newTestPage } from "../_shared/entry";
import { BASE_URL } from "../_shared/env";
import { gotoListScreen } from "../_shared/list-screen-chrome";
import { expect, releaseSharedPage, test } from "../_shared/session";
import { ADMIN_USER, JA } from "../_shared/test-data";
import {
  API,
  adminToken,
  assignRole,
  bearer,
  createRole,
  deleteRole,
  loginApi,
  newApi,
  purge,
  type RoleInfo,
  roleCodesOf,
  roleIdOf,
  seedUser,
  setRolePermissions,
} from "./_role-api";
import {
  roleAddButton,
  roleRemoveButtons,
  roleSelects,
  roleValues,
  setRoles,
} from "./_role-ui";

/**
 * Quyền THAY ĐỔI trong lúc người dùng đang đăng nhập, và tự đổi quyền của chính mình.
 *
 * Người tham gia (seed DB, mật khẩu = mật khẩu owner):
 *   · M (9905) — giữ role tuỳ chỉnh 「E2E途中変更」 (物品マスタ 利用 + 登録・削除).
 *   · A (9906) — admin thứ hai (không phải owner).
 *   · owner — tài khoản admin của authedPage.
 *
 *   TC-1 admin gỡ 登録・削除 khỏi role của M khi M đang mở 物品マスタ: BE chặn NGAY; màn hình
 *        còn quyền cũ nên F9 vẫn bấm được — bấm thì báo 「この操作を行う権限がありません」
 *        (không kèm lỗi chung chung) và F9 tự khoá vì quyền được nạp lại.
 *   TC-2 admin đổi role của M sang 「ユーザ」 ⇒ phiên của M kết thúc ngay (token cũ 401,
 *        refresh 401, app đá về /login).
 *   TC-3 admin xoá role M đang giữ ⇒ phiên của M kết thúc ngay; đăng nhập lại là 「ユーザ」.
 *   TC-4 owner hạ A từ 管理者 xuống 「ユーザ」 ⇒ phiên của A kết thúc ngay.
 *   TC-5 owner tự hạ quyền mình: ô ロール bị khoá, API trả OWNER_PROTECTED.
 *   TC-6 A tự hạ mình xuống 「ユーザ」 ở ユーザマスタ ⇒ lưu xong bị đá về /login; đăng nhập
 *        lại thì chỉ xem được ロールマスタ (利用): API ghi 403, F1 新規 bị khoá.
 *
 * Đổi role tăng token_version và thu hồi mọi refresh token của người đó (giống đổi mật
 * khẩu) — role nằm trong access token nên không làm vậy thì người bị hạ giữ quyền cũ
 * tới khi token hết hạn.
 *
 * LOGIN: M 1 lần UI + 2 lần API, A 3 lần UI (mỗi lần bị hạ là mất phiên). Token lấy từ
 * response login của chính trang đó (refresh giới hạn 30 / phút / IP).
 *
 * Chạy: npx playwright test tests/role-master/role-permission-live.spec.ts --workers=1
 */
test.describe.configure({ mode: "serial", timeout: 180_000 });

const M = {
  userNo: 9905,
  email: "e2e-perm-live@example.test",
  name: "E2E途中変更",
};
const A = {
  userNo: 9906,
  email: "e2e-perm-admin2@example.test",
  name: "E2E第二管理者",
};
const ROLE_CODE = "e2e-perm-live";
const ROLE_NAME = "E2E途中変更ロール";
const GOODS = ["master-goods.use", "master-goods.register"];
const EDIT_DENIED = "この操作を行う権限がありません。";

interface Person {
  page: Page;
  token: string;
}

test.describe("Quyền đổi trong lúc đang đăng nhập", () => {
  test.skip(!dbEnabled, "cần TEST_DB=1 để seed user test");

  let owner: Page;
  let api: APIRequestContext;
  let adminTok: string;
  let role: RoleInfo;
  let m: Person;
  let a: Person;

  const loginButton = (page: Page) =>
    page.getByRole("button", { name: JA.submit });

  /** Login UI trên `page`, trả access token lấy từ response login (token app đang dùng). */
  async function logIn(page: Page, email: string): Promise<string> {
    if (!(await loginButton(page).isVisible()))
      await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByLabel(JA.emailLabel).fill(email);
    await page
      .getByLabel(JA.passwordLabel, { exact: true })
      .fill(ADMIN_USER.password);
    const login = page.waitForResponse((r) =>
      r.url().endsWith("/tenant/auth/login"),
    );
    await loginButton(page).click();
    const res = await login;
    const body = await res.json();
    // Bị đá ra giữa chừng thì app quay lại đúng trang cũ, không phải "/".
    await expect(
      page,
      `${email} không đăng nhập được (rate-limit?)`,
    ).not.toHaveURL(/\/login/, {
      timeout: 30_000,
    });
    expect(res.status(), `${email} login`).toBe(200);
    return (body.data ?? body).accessToken;
  }

  async function signIn(email: string): Promise<Person> {
    const page = await newTestPage(owner.context().browser()!);
    return { page, token: await logIn(page, email) };
  }

  /** Refresh bằng cookie của trang — như app tự làm khi access token hết hạn. Trả status. */
  async function refresh(p: Person): Promise<number> {
    const res = await p.page
      .context()
      .request.post(`${BASE_URL}${API}/tenant/auth/refresh`);
    if (res.status() === 200)
      p.token = ((await res.json()).data ?? {}).accessToken;
    return res.status();
  }

  /**
   * Phiên đã kết thúc: đi tiếp sang một màn khác (trong SPA, như người dùng) ⇒ request
   * kế tiếp 401, refresh cũng 401 ⇒ app tự về /login. Không dùng goto: app có thể đang
   * tự chuyển về /login cùng lúc và hai lần điều hướng giẫm lên nhau.
   */
  async function expectSignedOut(page: Page, path: string): Promise<void> {
    if (await loginButton(page).isVisible()) return;
    await spaNavigate(page, path);
    try {
      await expect(loginButton(page)).toBeVisible({ timeout: 10_000 });
    } catch {
      // A screen the role may not open shows 403 without asking the API, so nothing has
      // touched the revoked session yet: reload — the app's own refresh on boot is refused.
      await page.reload({ waitUntil: "commit" }).catch(() => {});
      await expect(loginButton(page)).toBeVisible({ timeout: 30_000 });
    }
  }

  /** Ghi 物品マスタ với body hỏng: 400 = qua được bước quyền (không ghi gì), 403 = bị chặn. */
  async function goodsWrite(token: string): Promise<number> {
    const res = await api.post(`${API}/tenant/goods/master`, {
      headers: { ...bearer(token), "Content-Type": "application/json" },
      data: "{",
    });
    return res.status();
  }

  /** Đọc ロールマスタ — roles.use (role ユーザ cũng có). */
  async function adminRead(token: string): Promise<number> {
    return (
      await api.get(`${API}/tenant/roles`, { headers: bearer(token) })
    ).status();
  }

  /** Ghi ロールマスタ với body hỏng: 400 = có roles.manage, 403 = bị chặn. */
  async function roleWrite(token: string): Promise<number> {
    return (
      await api.post(`${API}/tenant/roles`, {
        headers: { ...bearer(token), "Content-Type": "application/json" },
        data: "{",
      })
    ).status();
  }

  /** Điều hướng trong SPA (TanStack Router nghe popstate) — không nạp lại trang. */
  async function spaNavigate(page: Page, path: string): Promise<void> {
    await page.evaluate((to) => {
      window.history.pushState({}, "", to);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    }, path);
  }

  async function openGoodsRegister(page: Page) {
    await gotoListScreen(page, "/masters/goods");
    await page.keyboard.press("F1");
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "物品マスタ登録" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    return dialog.locator('[data-fkey="F9"]');
  }

  /** Một 物品 hợp lệ (mã chắc chắn không có) — để F9 thực sự gửi request ghi. */
  async function fillGoods(page: Page): Promise<void> {
    const dialog = page
      .getByRole("dialog")
      .filter({ hasText: "物品マスタ登録" });
    await page.locator("#goods-goodsCd").fill("999");
    await dialog.getByLabel("物品サブコード", { exact: true }).fill("255");
    const appSt = dialog
      .locator("div.flex.items-center.gap-4")
      .filter({ hasText: "適用開始日" });
    await appSt.getByRole("combobox").click();
    await page.getByRole("option", { name: "令和", exact: true }).click();
    const boxes = appSt.getByRole("textbox");
    await boxes.nth(0).fill("6");
    await boxes.nth(1).fill("4");
    await boxes.nth(2).fill("1");
    await page.locator("#goods-goodsNm").fill("E2E権限確認");
    await page.locator("#goods-supplierNm").fill("E2E");
    await page.locator("#goods-purchasePrice").fill("100");
    await page.locator("#goods-salesPrice").fill("200");
  }

  test.beforeAll(async ({ authedPage }) => {
    owner = authedPage;
    api = await newApi();
    await purge([M, A], [ROLE_CODE]);
    adminTok = await adminToken(owner);
    role = await createRole(api, adminTok, ROLE_CODE, ROLE_NAME, GOODS);
    await seedUser(M, ROLE_CODE);
    await seedUser(A, "admin");
  });

  test.afterAll(async () => {
    await m?.page.close();
    await a?.page.close();
    await api?.dispose();
    await releaseSharedPage(owner);
    if (dbEnabled) await purge([M, A], [ROLE_CODE]);
  });

  test("TC-1 — gỡ 登録・削除 khi M đang mở 物品マスタ: BE chặn ngay, F9 báo không có quyền và tự khoá", async () => {
    m = await signIn(M.email);
    const f9 = await openGoodsRegister(m.page);
    await expect(f9).toBeEnabled();
    expect(await goodsWrite(m.token), "trước khi gỡ: được ghi").toBe(400);

    await setRolePermissions(api, adminTok, role, ["master-goods.use"]);
    expect(await goodsWrite(m.token), "token đang dùng phải bị chặn ngay").toBe(
      403,
    );

    // Màn hình vẫn mang quyền cũ (F9 còn sáng). Bấm F9: phải nói rõ là không có quyền,
    // không kèm thông báo lỗi chung chung (E99999 / 保存に失敗), rồi F9 tự khoá.
    await fillGoods(m.page);
    await f9.click();
    await expect(m.page.getByText(EDIT_DENIED)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      m.page.getByRole("alertdialog"),
      "không được hiện hộp lỗi chung chung",
    ).toHaveCount(0);
    await expect(
      f9,
      "quyền được nạp lại ⇒ F9 khoá mà không cần nạp lại trang",
    ).toBeDisabled({
      timeout: 15_000,
    });
    await captureFixedUi(m.page, "role-permission-live-denied-notice");

    await setRolePermissions(api, adminTok, role, GOODS);
    expect(await goodsWrite(m.token), "trả lại 登録・削除: ghi được ngay").toBe(
      400,
    );
    await expect(await openGoodsRegister(m.page)).toBeEnabled();
  });

  test("TC-2 — đổi role của M sang 「ユーザ」: phiên của M kết thúc ngay", async () => {
    const res = await assignRole(api, adminTok, M.userNo, [
      await roleIdOf("user"),
    ]);
    expect(res.status()).toBeLessThan(300);
    expect(await roleCodesOf(M.userNo)).toEqual(["user"]);

    expect(await goodsWrite(m.token), "token đang dùng bị từ chối ngay").toBe(
      401,
    );
    expect(await refresh(m), "refresh token cũ bị thu hồi").toBe(401);
    await expectSignedOut(m.page, "/settings/role-master");
  });

  test("TC-3 — xoá role M đang giữ: phiên của M kết thúc ngay, đăng nhập lại là 「ユーザ」", async () => {
    expect(
      (await assignRole(api, adminTok, M.userNo, [role.id])).status(),
    ).toBeLessThan(300);
    const session = await loginApi(M.email);
    try {
      expect(
        await goodsWrite(session.token),
        "đăng nhập lại với role tuỳ chỉnh",
      ).toBe(400);

      await deleteRole(api, adminTok, role);
      expect(await roleCodesOf(M.userNo)).toEqual(["user"]);
      expect(
        await goodsWrite(session.token),
        "token đang dùng bị từ chối ngay",
      ).toBe(401);
      const refreshed = await session.ctx.post(`${API}/tenant/auth/refresh`);
      expect(refreshed.status(), "refresh token cũ bị thu hồi").toBe(401);
    } finally {
      await session.dispose();
    }

    const again = await loginApi(M.email);
    try {
      expect(
        again.permissions.length,
        "đăng nhập lại có đủ quyền 利用 của 「ユーザ」",
      ).toBeGreaterThan(0);
      expect(again.permissions.every((p) => p.endsWith(".use"))).toBe(true);
      expect(await goodsWrite(again.token)).toBe(403);
    } finally {
      await again.dispose();
    }
  });

  test("TC-4 — hạ admin A xuống 「ユーザ」: phiên của A kết thúc ngay", async () => {
    a = await signIn(A.email);
    expect(await adminRead(a.token), "A đang là admin").toBe(200);

    expect(
      (
        await assignRole(api, adminTok, A.userNo, [await roleIdOf("user")])
      ).status(),
    ).toBeLessThan(300);
    expect(await adminRead(a.token), "token đang dùng bị từ chối ngay").toBe(
      401,
    );
    expect(await refresh(a), "refresh token cũ bị thu hồi").toBe(401);
    await expectSignedOut(a.page, "/settings/role-master");

    // Trả A về admin cho TC-6 (A không còn phiên nào để thu hồi).
    expect(
      (
        await assignRole(api, adminTok, A.userNo, [await roleIdOf("admin")])
      ).status(),
    ).toBeLessThan(300);
  });

  test("TC-5 — owner không tự hạ quyền được", async () => {
    const ownerNo = await withDb(async (c) => {
      const { rows } = await c.query<{ user_no: number }>(
        `SELECT user_no FROM ${DB_SCHEMA}.app_user WHERE is_owner`,
      );
      return rows[0]!.user_no;
    });
    for (let attempt = 1; ; attempt++) {
      await owner.goto(`/settings/user-master/${ownerNo}`, {
        waitUntil: "domcontentloaded",
      });
      try {
        await expect(roleSelects(owner).first()).toBeVisible({
          timeout: 30_000,
        });
        break;
      } catch (error) {
        if (attempt === 3) throw error;
      }
    }
    expect(await roleValues(owner)).toEqual(["管理者"]);
    for (const el of [
      ...(await roleSelects(owner).all()),
      ...(await roleRemoveButtons(owner).all()),
      roleAddButton(owner),
    ])
      await expect(el, "ô ロール của owner phải bị khoá").toBeDisabled();

    const res = await assignRole(api, adminTok, ownerNo, [
      await roleIdOf("user"),
    ]);
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe("USER_MASTER.OWNER_PROTECTED");
    expect(await roleCodesOf(ownerNo)).toEqual(["admin"]);
  });

  test("TC-6 — admin A tự hạ mình xuống 「ユーザ」: lưu xong bị đá về /login", async () => {
    const page = a.page;
    a.token = await logIn(page, A.email);
    expect(await adminRead(a.token)).toBe(200);

    await spaNavigate(page, `/settings/user-master/${A.userNo}`);
    await expect(roleSelects(page).first()).toHaveText("管理者", {
      timeout: 30_000,
    });
    // Đổi dòng 1 sang ユーザ (chọn trong dropdown, không qua nút 削除 nên không hỏi lại).
    await setRoles(page, ["ユーザ"]);
    await page.locator('[data-fkey="F9"]').click();

    // Lưu được (request đi bằng token trước khi bị thu hồi), rồi request kế tiếp 401 →
    // refresh 401 → app về /login.
    await expect(
      loginButton(page),
      "tự hạ quyền phải kết thúc phiên",
    ).toBeVisible({ timeout: 30_000 });
    expect(await roleCodesOf(A.userNo)).toEqual(["user"]);
    expect(await adminRead(a.token)).toBe(401);

    // Đăng nhập lại: chỉ còn quyền của 「ユーザ」 — xem được ロールマスタ (利用) nhưng
    // không tạo / sửa / xoá được.
    a.token = await logIn(page, A.email);
    expect(await adminRead(a.token), "ユーザ có 利用 của ロールマスタ").toBe(
      200,
    );
    expect(await roleWrite(a.token), "ユーザ không có roles.manage").toBe(403);
    await spaNavigate(page, "/settings/role-master");
    await expect(
      page.locator('[data-fkey="F1"]'),
      "F1 新規 phải khoá",
    ).toBeDisabled({
      timeout: 30_000,
    });
  });
});
