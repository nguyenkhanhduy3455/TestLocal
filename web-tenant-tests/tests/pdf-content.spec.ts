import { expect, test } from '@playwright/test'

import { foldForCompare, readPdf } from './pdf-content'

/**
 * Self-test cho `pdf-content.ts` — bộ máy mà TC-IN-5 của spec 実地指１・訪衛指
 * dùng để soi PDF thật do print agent render.
 *
 * Vì sao cần: TC-IN-5 chỉ chạy khi TEST_ALLOW_PRINT=1, tức chỉ trên máy Windows
 * có agent. Nếu helper hỏng (bảng fold thiếu chữ, API pdf-parse đổi, không bóc
 * được ảnh) thì phải tới lúc đó mới lộ. Test này dựng một PDF THẬT bằng chính
 * Chromium của Playwright rồi bắt helper bóc lại, nên nó gác được helper trên
 * mọi máy, kể cả macOS không có agent.
 *
 * KHÔNG đụng tới app: không login, không gọi API — chạy độc lập vài giây.
 *
 * page.pdf() chỉ hoạt động ở chế độ headless, nên test tự skip khi chạy
 * --headed/--ui.
 */

/** Cùng tỉ lệ với chart 歯式 (viewBox 392×460) mà TC-IN-5 kiểm trên PDF thật. */
const IMG_W = 392
const IMG_H = 460

/**
 * Chuỗi tiêu biểu cho các giá trị TC-IN-5 phải tìm thấy trên giấy: chữ Hán
 * (kể cả 歯 — chữ duy nhất mà NFKC không gỡ nổi biến thể bộ thủ), katakana,
 * dấu hai chấm toàn giác, số thập phân, và tiền tố TEL.
 */
const SAMPLES = [
    '実地指導文書',
    '歯科医院', // 歯 → ⻭ U+2EED khi bóc ra: phải nhờ FOLD_RADICALS
    'ブラッシング指導',
    '令和 8 年 1 月 5 日',
    '09：30',
    '32.5',
    'TEL.03-1234-5678',
] as const

test('pdf-content — bóc đúng text tiếng Nhật và ảnh nhúng từ PDF thật', async ({
    browser,
}, testInfo) => {
    test.skip(
        testInfo.project.use.headless === false,
        'page.pdf() chỉ chạy được ở headless — bỏ qua khi --headed/--ui',
    )

    const page = await browser.newPage()
    try {
        // Ảnh dựng bằng canvas ngay trong trang để có PNG thật đúng 392×460,
        // thay vì nhúng một chuỗi base64 chép cứng.
        const imgSrc = await page.evaluate(
            ({ w, h }) => {
                const canvas = document.createElement('canvas')
                canvas.width = w
                canvas.height = h
                const ctx = canvas.getContext('2d')!
                ctx.fillStyle = '#ffffff'
                ctx.fillRect(0, 0, w, h)
                ctx.fillStyle = '#ff0000'
                ctx.fillRect(20, 20, 120, 160)
                return canvas.toDataURL('image/png')
            },
            { w: IMG_W, h: IMG_H },
        )

        await page.setContent(`
      <div style="font-family:'Hiragino Kaku Gothic ProN','Yu Gothic','Meiryo',sans-serif">
        ${SAMPLES.map((s) => `<p>${s}</p>`).join('')}
        <img src="${imgSrc}" style="width:196px;height:230px">
      </div>`)
        const pdf = await page.pdf({ format: 'A4' })

        const parsed = await readPdf(Buffer.from(pdf))

        expect(parsed.pageCount, 'PDF mẫu chỉ có 1 trang').toBe(1)

        // Đúng phép so mà TC-IN-5 dùng: fold cả hai vế rồi kiểm chứa.
        const missing = SAMPLES.filter((s) => !parsed.folded.includes(foldForCompare(s)))
        expect(
            missing,
            'helper bóc/chuẩn hoá sai — nhiều khả năng thiếu chữ trong FOLD_RADICALS ' +
                `(pdf-content.ts). Text bóc được: ${JSON.stringify(parsed.text.slice(0, 300))}`,
        ).toEqual([])

        // Ảnh: TC-IN-5 nhận diện 歯式イメージ qua tỉ lệ, nên tỉ lệ phải sống sót
        // qua khâu nhúng của bộ ghi PDF dù bị co giãn.
        expect(parsed.images.length, 'không bóc được ảnh nhúng nào').toBeGreaterThan(0)
        if (!parsed.imagesFromRawScan) {
            const biggest = parsed.images[0]!
            expect(
                biggest.width / biggest.height,
                `ảnh nhúng sai tỉ lệ: ${biggest.width}×${biggest.height}`,
            ).toBeCloseTo(IMG_W / IMG_H, 1)
        }
    } finally {
        await page.close()
    }
})
