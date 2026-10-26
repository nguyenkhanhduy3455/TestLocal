import { type Page, expect } from "@playwright/test";

/**
 * Ô ロール của màn ユーザマスタ 登録: mỗi role một dòng dropdown 「ロール N」 kèm nút
 * 「ロール N 削除」, nút 「追加」 thêm dòng mới. Trên màn 更新, xoá một role đang giữ hỏi
 * lại bằng hộp cảnh báo — helper bấm 「はい」.
 */
export const roleSelects = (page: Page) =>
  page.getByRole("combobox", { name: /^ロール \d+$/ });
export const roleRemoveButtons = (page: Page) =>
  page.getByRole("button", { name: /^ロール \d+ 削除$/ });
export const roleAddButton = (page: Page) =>
  page.getByRole("button", { name: "追加", exact: true });

/** Tên role đang chọn ở từng dòng, theo thứ tự dòng. */
export async function roleValues(page: Page): Promise<string[]> {
  return (await roleSelects(page).allInnerTexts()).map((t) => t.trim());
}

async function pick(page: Page, row: number, name: string): Promise<void> {
  await roleSelects(page).nth(row).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(roleSelects(page).nth(row)).toHaveText(name);
}

/** Đặt đúng tập role `names` (dòng 1 = names[0], …), xoá các dòng thừa. */
export async function setRoles(page: Page, names: string[]): Promise<void> {
  await pick(page, 0, names[0]!);
  while ((await roleSelects(page).count()) > 1) {
    await roleRemoveButtons(page).last().click();
    const confirm = page.getByRole("alertdialog");
    if (await confirm.isVisible().catch(() => false))
      await confirm.getByRole("button", { name: "はい" }).click();
    await expect(confirm).toHaveCount(0);
  }
  for (const name of names.slice(1)) {
    await roleAddButton(page).click();
    await pick(page, (await roleSelects(page).count()) - 1, name);
  }
  expect(await roleValues(page)).toEqual(names);
}

/**
 * F9 trên màn 更新 mà tập role đã đổi ⇒ hộp xác nhận 「ロールが変更されています…」
 * (mặc định いいえ, người đó phải đăng nhập lại) — bấm 「はい」 để lưu thật.
 */
export async function confirmRoleChange(page: Page): Promise<void> {
  const confirm = page
    .getByRole("alertdialog")
    .filter({ hasText: "ロールが変更されています" });
  await expect(confirm, "đổi role phải hỏi xác nhận").toBeVisible({
    timeout: 15_000,
  });
  await confirm.getByRole("button", { name: "はい" }).click();
  await expect(confirm).toHaveCount(0);
}
