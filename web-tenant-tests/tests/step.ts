/**
 * Nhịp quan sát (GUIDELINE Rule 11) — giãn mỗi thao tác ra vài trăm ms khi chạy
 * `--headed` / `--ui` để mắt người theo kịp, và bằng 0 khi chạy nền.
 *
 * Chỉnh tốc độ theo 2 cách:
 *   1. Sửa DEFAULT_STEP_MS bên dưới — đổi cho MỌI spec, hợp khi muốn cố định.
 *   2. Env TEST_STEP_MS — chỉ cho lần chạy đó, ưu tiên cao hơn (1):
 *        TEST_STEP_MS=3000 npx playwright test <spec> --headed   # chậm, xem kỹ
 *        TEST_STEP_MS=0    npx playwright test <spec> --headed   # tắt hẳn
 *
 * KHÔNG dùng step() để chờ app sẵn sàng — đó là việc của `expect` auto-wait
 * (Rule 7). step() chỉ để nhìn, nên nó bằng 0 khi không có ai ngồi xem.
 */
import { test, type Page } from '@playwright/test'

/** Nhịp mặc định khi chạy --headed/--ui (ms). Tăng lên để quan sát chậm hơn. */
export const DEFAULT_STEP_MS = 2000

/** ms thực tế sẽ dùng: env TEST_STEP_MS > DEFAULT_STEP_MS (chỉ khi headed) > 0. */
export function stepMs(): number {
  const env = process.env.TEST_STEP_MS
  if (env !== undefined && env.trim() !== '') {
    const n = Number(env)
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`TEST_STEP_MS không hợp lệ: "${env}" (cần số >= 0)`)
    }
    return n
  }
  // --headed và --ui đều làm Playwright đặt headless = false → cùng một nhánh.
  return test.info().project.use.headless === false ? DEFAULT_STEP_MS : 0
}

/** Tạo hàm step() cho 1 test: `const step = makeStep(page)` rồi `await step()`. */
export function makeStep(page: Page): () => Promise<void> {
  const ms = stepMs()
  return () => page.waitForTimeout(ms)
}

/**
 * Skip KÈM lý do in ra stdout.
 *
 * Reporter `list` của Playwright chỉ in dấu `-` cho một testcase bị skip, nuốt
 * mất lý do — người đọc log thấy "không chạy" mà không biết vì sao, và dễ tưởng
 * là hỏng. GUIDELINE Rule 5.3 vì thế bắt mọi skip phải nói lý do; dùng hàm này
 * cho các skip PHỤ THUỘC TRẠNG THÁI MÁY (dữ liệu, cấu hình), nơi lý do không
 * đoán được từ tên testcase.
 */
export function skipWithReason(condition: boolean, reason: string): void {
    if (condition) console.log(`SKIP — ${reason}`)
    test.skip(condition, reason)
}
