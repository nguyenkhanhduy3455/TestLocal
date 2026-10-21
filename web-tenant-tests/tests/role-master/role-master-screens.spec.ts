import { type Page } from "@playwright/test";

import { captureFixedUi } from "../_shared/capture";
import { expect, releaseSharedPage, test } from "../_shared/session";

/**
 * ロールマスタ (web-only, admin): mọi màn — 一覧, 新規, 更新 — đều có dải 画面名
 * 「ロ ー ル マ ス タ」 như ユーザマスタ. Khung 一覧 chuẩn do Rule 24
 * (master-screens-chrome.spec.ts) kiểm; ở đây chỉ kiểm header + chụp lại.
 */
test.describe.configure({ mode: "serial", timeout: 120_000 });

const LIST_URL = "/settings/role-master";
const TITLE = "ロ ー ル マ ス タ";

test.describe("ロールマスタ — header trên 一覧 / 新規 / 更新", () => {
  let page: Page;

  test.beforeAll(async ({ authedPage }) => {
    page = authedPage;
  });

  test.afterAll(async () => {
    await releaseSharedPage(page);
  });

  const header = () => page.getByRole("heading", { name: TITLE, exact: true });

  test("TC-1 — 一覧 có header và 2 role hệ thống", async () => {
    await page.goto(LIST_URL, { waitUntil: "domcontentloaded" });
    await expect(header()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("管理者", { exact: true })).toBeVisible();
    await expect(page.getByText("ユーザ", { exact: true })).toBeVisible();
    await captureFixedUi(page, "role-master-list");
  });

  test("TC-2 — F1 新規 vẫn giữ header", async () => {
    await page.keyboard.press("F1");
    await expect(page).toHaveURL(/\/settings\/role-master\/new$/, {
      timeout: 30_000,
    });
    await expect(header()).toBeVisible();
    await expect(page.getByLabel("コード", { exact: true })).toBeVisible();
    await captureFixedUi(page, "role-master-new");
  });

  test("TC-2b — chọn/bỏ nhanh cột 利用 / 業務権限, có quyền nghiệp vụ thì luôn có 利用", async () => {
    // Đang ở màn 新規 (TC-2): chưa tick ô nào.
    const allUse = page.getByRole("checkbox", { name: "利用をすべて選択" });
    const allActions = page.getByRole("checkbox", {
      name: "業務権限をすべて選択",
    });
    const rows = page.locator('tbody [role="checkbox"]');
    const useBoxes = page.locator(
      'tbody [role="checkbox"][aria-label$=" 利用"]',
    );
    const checked = (l: typeof rows) =>
      l.and(page.locator('[data-state="checked"]'));
    const total = await rows.count();
    const useCount = await useBoxes.count();
    expect(useCount, "mỗi chức năng một ô 利用").toBeGreaterThan(10);

    // 利用 chỉ chọn cột 利用, chưa cấp quyền nghiệp vụ nào.
    await allUse.click();
    await expect(checked(useBoxes)).toHaveCount(useCount);
    await expect(checked(rows)).toHaveCount(useCount);
    await expect(allActions).toHaveAttribute("data-state", "unchecked");

    // Bỏ 利用 ⇒ trống hết.
    await allUse.click();
    await expect(checked(rows)).toHaveCount(0);

    // 業務権限 chọn mọi quyền nghiệp vụ — và 利用 của chúng đi kèm (thiếu 利用 thì vô nghĩa).
    // Chức năng chỉ có 利用 (vd 郵便番号) không có quyền nghiệp vụ nào nên không được kéo theo.
    const useOnly = await page
      .locator("tbody tr")
      .evaluateAll(
        (trs) =>
          trs.filter(
            (tr) => tr.querySelectorAll('[role="checkbox"]').length === 1,
          ).length,
      );
    expect(useOnly, "郵便番号 chỉ có 利用").toBeGreaterThan(0);
    await allActions.click();
    await expect(checked(rows)).toHaveCount(total - useOnly);
    await expect(allActions).toHaveAttribute("data-state", "checked");
    await expect(allUse).toHaveAttribute("data-state", "indeterminate");
    await captureFixedUi(page, "role-master-select-all");

    // Bỏ 業務権限 ⇒ chỉ còn 利用 của các chức năng vừa được kéo theo.
    await allActions.click();
    await expect(checked(rows)).toHaveCount(useCount - useOnly);

    // Đang một phần ⇒ bấm 利用 lần 1 chọn hết, lần 2 bỏ hết.
    await allUse.click();
    await expect(allUse).toHaveAttribute("data-state", "checked");
    await allUse.click();
    await expect(checked(rows)).toHaveCount(0);

    // Tick 1 quyền nghiệp vụ ⇒ 利用 của dòng đó tự tick, hai ô chọn tất cả một phần.
    await page.getByRole("checkbox", { name: "窓口精算 返金" }).click();
    await expect(
      page.getByRole("checkbox", { name: "窓口精算 利用" }),
    ).toHaveAttribute("data-state", "checked");
    await expect(allUse).toHaveAttribute("data-state", "indeterminate");
    await expect(allActions).toHaveAttribute("data-state", "indeterminate");
    await captureFixedUi(page.locator("table"), "role-master-function-matrix");

    // Bỏ 利用 của dòng ⇒ quyền nghiệp vụ của dòng cũng mất.
    await page.getByRole("checkbox", { name: "窓口精算 利用" }).click();
    await expect(checked(rows)).toHaveCount(0);
  });

  test("TC-2c — コード / ロール名 trùng thì BE từ chối, không lưu", async () => {
    // Đang ở màn 新規 (TC-2b không lưu gì).
    const code = page.getByLabel("コード", { exact: true });
    const name = page.getByLabel("ロール名", { exact: true });

    await code.fill("admin");
    await name.fill("E2E重複テスト");
    await page.keyboard.press("F9");
    await expect(
      page.getByText("このコードは既に使用されています。"),
    ).toBeVisible({ timeout: 15_000 });

    await code.fill("e2e-dup-check");
    await name.fill("管理者");
    await page.keyboard.press("F9");
    await expect(
      page.getByText("このロール名は既に使用されています。"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/settings\/role-master\/new$/);
    await captureFixedUi(page, "role-master-name-taken");
  });

  test("TC-3 — mở role hệ thống (更新) vẫn giữ header, không sửa được", async () => {
    await page.keyboard.press("F10");
    await expect(page).toHaveURL(/\/settings\/role-master$/, {
      timeout: 30_000,
    });
    await page.getByText("ユーザ", { exact: true }).dblclick();
    await expect(page).toHaveURL(/\/settings\/role-master\/[0-9a-f-]{36}$/, {
      timeout: 30_000,
    });
    await expect(header()).toBeVisible();
    await expect(page.getByLabel("ロール名", { exact: true })).toBeDisabled();
    await captureFixedUi(page, "role-master-edit-system");
  });
});
