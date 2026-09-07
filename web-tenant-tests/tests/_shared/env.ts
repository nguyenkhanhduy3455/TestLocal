/**
 * Biến môi trường dùng chung — MỘT chỗ khai tên biến, thay cho 62 bản
 * `const BASE_URL = process.env.BASE_URL ?? '…'` rải khắp `tests/`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO `patNo()` / `trtDt()` LÀ HÀM CHỨ KHÔNG PHẢI HẰNG SỐ
 * ═══════════════════════════════════════════════════════════════════════════
 * Đếm thật trong repo: `TEST_PAT_NO` có BA giá trị mặc định khác nhau
 * (12138 × 38 spec, 11 × 8, 10 × 8) và `TEST_TRT_DT` có SÁU
 * (hôm nay × 13, '2025-12-24' × 5, '2026-08-03' × 4, '' × 5, …).
 *
 * Mấy con số đó KHÔNG tuỳ tiện: bệnh nhân 10 được các spec parity chọn vì chỉ
 * có 8 dòng TRNTRN (12138 có 2.864 ⇒ WinForm treo hơn một phút), và ngày
 * '2026-08-03' phải khớp `testsettings.local.json` bên `fla-ui-tests/`. Ép tất
 * cả về một mặc định là làm hỏng chính các cặp parity đó.
 *
 * Nên lớp này chỉ gom TÊN BIẾN, còn GIÁ TRỊ MẶC ĐỊNH vẫn thuộc về từng spec:
 *
 *     const PAT_NO = patNo('10')          // thay TEST_PAT_NO ?? '10'
 *     const TRT_DT = trtDt('2026-08-03')  // thay TEST_TRT_DT ?? '2026-08-03'
 *     const TRT_DT = trtDt(TODAY_ISO)     // thay TEST_TRT_DT ?? new Date()…
 *
 * Doc-comment của spec vẫn phải ghi rõ mặc định đó là gì và vì sao (Rule 18).
 */

/** Gốc app. Đồng nhất ở cả 62 spec đang khai tay — không có biến thể nào. */
export const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Hôm nay dạng `YYYY-MM-DD` — mặc định của 13 spec không ghim ngày cố định. */
export const TODAY_ISO = new Date().toISOString().slice(0, 10)

/** 患者番号 để test. `fallback` là mặc định RIÊNG của spec gọi nó (xem đầu file). */
export function patNo(fallback: string): string {
    return process.env.TEST_PAT_NO ?? fallback
}

/** 診療日 `YYYY-MM-DD`. `fallback` là mặc định RIÊNG của spec gọi nó. */
export function trtDt(fallback: string): string {
    return process.env.TEST_TRT_DT ?? fallback
}

/**
 * Cờ cho phép thao tác GHI THẬT xuống DB/BE (GUIDELINE Rule 18.1).
 *
 * 20 spec đang khai lại `process.env.TEST_ALLOW_SAVE === '1'`. Mặc định TẮT:
 * không đặt biến thì mọi testcase ghi phải `skipWithReason(...)`, không được
 * âm thầm bấm F9 登録 lên dữ liệu thật.
 */
export const allowSave = process.env.TEST_ALLOW_SAVE === '1'

/**
 * ─── Thời lượng chờ lưới 診療入力 ────────────────────────────────────────────
 * Rộng tay là CÓ CHỦ Ý: đây là Vite **dev** server, một lần transform module-graph
 * lạnh có thể đẩy một navigation qua 60s (xem doc `playwright.config.ts`). Trỏ
 * BASE_URL vào bản build (`vite preview`) thì hạ xuống được.
 *
 * 29 spec đang khai `GRID_LOAD_TIMEOUT = 60_000`, 12 spec khai
 * `GRID_RELOAD_TIMEOUT = 30_000`, 13 spec khai `GRID_LOAD_ATTEMPTS = 3`.
 */
export const GRID_LOAD_TIMEOUT = 60_000
export const GRID_RELOAD_TIMEOUT = 30_000
export const GRID_LOAD_ATTEMPTS = 3
