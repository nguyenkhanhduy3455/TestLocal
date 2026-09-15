/**
 * Tiền đề cho các spec cần カルテ記載選択 TỰ BẬT.
 *
 * Dialog này không có nút nào mở tay — nó chỉ hiện khi `AutoSantei` chạy, và có
 * HAI cửa chứ không phải một:
 *
 *   1. `runAutoSantei` (treatment-entry-detail.tsx) bỏ qua NGÀY đã có 処置 đã lưu
 *      (`dayHasRows`) — WinForm AutoSantei trả -2.
 *   2. Queue 自動表示 sinh ra từ 歯科疾患管理料 (116/7), là khoản **月一回**. Chỉ cần
 *      MỘT ngày khác trong THÁNG đã tính nó là ngày test không còn gì để hỏi:
 *      AutoSantei vẫn chạy, vẫn chèn bộ 再診, nhưng không có batch nào cần chọn.
 *
 * Cửa 2 là cửa hay bị bỏ sót — đo ngày 2026-09-14: 患者 10 sạch ở ngày 14 nhưng có
 * 15 dòng ở ngày 11, nên ngày 14 chỉ sinh 5 dòng 再診 và dialog không bao giờ bật.
 *
 * Cách duy nhất bền: spec TỰ DỰNG bệnh nhân riêng bằng `seedTestPatient` trong
 * dải `SEED_PAT_NO_BASE` rồi `deleteTestPatient` ở `afterAll` — xem
 * `dialogs-selection/cmt-auto-picker-dialog.spec.ts`. Mượn bệnh nhân có sẵn thì
 * chỉ cần một spec khác (hoặc chính lần chạy trước) ghi vào tháng đó là đỏ.
 *
 * Hàm này biến cái chờ mù 45 giây + "element(s) not found" thành thông báo nói rõ
 * phải làm gì.
 */
import { expect, type Page } from '@playwright/test'

export async function expectAutoPickerOpened(page: Page, patNo: string, trtDt: string) {
  const picker = page.getByText('カルテ記載選択')

  // Chờ ngắn thôi: nếu queue 自動表示 có chạy thì dialog bật trong vài giây sau
  // khi confirm 初診料 được trả lời. Chờ 45s chỉ tổ kéo dài một thất bại chắc chắn.
  await picker.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {})
  if (await picker.count()) return

  // Lưới 診療入力 render CẢ THÁNG, nên con số này là của THÁNG chứ không của ngày —
  // đúng phạm vi của cửa 2. Dòng 処置 đều có cell 点 (RegiCol.ten = 3) mang số.
  const monthHasData = await page
    .locator('[data-grid-cell$="|3"]')
    .filter({ hasText: /\d/ })
    .count()

  // MỘT assertion duy nhất, thông báo nêu cả hai khả năng — đừng khẳng định là lỗi
  // dữ liệu chỉ vì lưới có dòng: với bệnh nhân seed sạch thì chính AutoSantei vừa
  // chèn mấy dòng đó, và lúc ấy dialog không bật MỚI là lỗi app.
  await expect(
    picker,
    `カルテ記載選択 không tự bật cho (患者 ${patNo}, ngày ${trtDt}).\n` +
      `Lưới THÁNG này đang có ${monthHasData} ô 点 mang số. Hai khả năng:\n` +
      `  (a) DỮ LIỆU — bệnh nhân này đã có 処置 ở ngày khác trong tháng ⇒ 歯科疾患管理料\n` +
      `      (116/7, 月一回) đã tính rồi ⇒ AutoSantei chỉ ra bộ 再診 trần, không có gì\n` +
      `      để hỏi. Sửa: cho spec tự dựng bệnh nhân (seedTestPatient trong dải\n` +
      `      SEED_PAT_NO_BASE) + deleteTestPatient ở afterAll; chạy tay thì\n` +
      `      TEST_PAT_NO=<bệnh nhân chưa khám tháng này>.\n` +
      `  (b) APP — nếu bệnh nhân đúng là mới dựng (tháng chưa có gì trước khi mở màn)\n` +
      `      thì tiền đề đủ, lỗi nằm ở AutoSantei / queue 自動表示 / CmtAutoPickerDialog.\n` +
      `Phân biệt: xem 「歯科初診料を算定しますか？」 có hiện không. Không hiện ⇒ (a).`,
  ).toBeVisible({ timeout: 25000 })
}
