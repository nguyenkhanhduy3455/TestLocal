/**
 * Tiền đề cho các spec cần カルテ記載選択 TỰ BẬT.
 *
 * Dialog này không có nút nào mở tay — nó chỉ hiện khi `AutoSantei` chạy, mà
 * AutoSantei CHỈ chạy khi (患者番号, ngày) đó **chưa có 処置 nào được lưu**.
 * Đã lưu rồi thì: không confirm 歯科初診料 → không sinh queue 自動表示 → không có
 * dialog, vĩnh viễn.
 *
 * Rắc rối: chính các spec trong repo này GHI dữ liệu thật vào bệnh nhân test
 * (summary-comment-selection-enter thêm 処置 153 mỗi lần chạy). Nên một ngày
 * đang sạch sẽ thành bẩn sau lần chạy đầu, và mọi lần sau đều fail.
 *
 * Hàm này biến cái chờ mù 45 giây + "element(s) not found" thành thông báo nói
 * rõ phải làm gì — vì lỗi nằm ở DỮ LIỆU, không ở app cũng không ở locator.
 */
import { expect, type Page } from '@playwright/test'

export async function expectAutoPickerOpened(page: Page, patNo: string, trtDt: string) {
  const picker = page.getByText('カルテ記載選択')

  // Chờ ngắn thôi: nếu queue 自動表示 có chạy thì dialog bật trong vài giây sau
  // khi confirm 初診料 được trả lời. Chờ 45s chỉ tổ kéo dài một thất bại chắc chắn.
  await picker.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  if (await picker.count()) return

  // Không có dialog → phân biệt "ngày đã bẩn" với "app hỏng thật".
  // Dòng 処置 của tháng hiện tại đều có cell 点 (RegiCol.ten = 3) mang số.
  const dayHasData = await page
    .locator('[data-grid-cell$="|3"]')
    .filter({ hasText: /\d/ })
    .count()

  expect(
    dayHasData,
    `カルテ記載選択 không tự bật vì (患者 ${patNo}, ngày ${trtDt}) ĐÃ CÓ ${dayHasData} dòng 処置 ` +
      `được lưu → AutoSantei không chạy → không sinh queue 自動表示.\n` +
      `Đây KHÔNG phải bug app. Cách chạy lại:\n` +
      `  TEST_TRT_DT=<ngày chưa nhập gì> npx playwright test <spec> --workers=1\n` +
      `hoặc TEST_PAT_NO=<bệnh nhân khác>. Ngày phải thuộc THÁNG hiện tại (dòng tháng ` +
      `khác là history, app khoá không cho nhập).`,
  ).toBe(0)

  // Ngày sạch mà dialog vẫn không bật → lúc này mới là chuyện của app.
  await expect(
    picker,
    `(患者 ${patNo}, ngày ${trtDt}) chưa có 処置 nào mà カルテ記載選択 vẫn không bật — ` +
      `nghi ngờ app/BE, không phải dữ liệu.`,
  ).toBeVisible({ timeout: 25000 })
}
