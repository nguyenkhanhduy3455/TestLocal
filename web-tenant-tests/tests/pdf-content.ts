/**
 * Bóc nội dung một file PDF để assert — dùng cho các test in báo cáo THẬT qua
 * print agent (xem oral-hygiene-instruction-dialog.spec.ts, cờ TEST_ALLOW_PRINT).
 *
 * Vì sao phải có module này: đám test datasource chỉ chứng minh FE gửi ĐÚNG dữ
 * liệu cho máy in. Từ datasource tới tờ giấy còn một chặng nữa nằm ngoài
 * web-tenant (agent + template Crystal .rpt) — muốn biết chặng đó đúng thì phải
 * mở chính file PDF agent trả về ra soi.
 *
 * ── Cạm bẫy khi so chuỗi tiếng Nhật trong PDF ────────────────────────────────
 * Text bóc từ PDF đi qua bảng ToUnicode của font đã subset, nên KHÔNG bao giờ
 * khớp byte-với-byte với chuỗi gốc:
 *
 *   1. Toàn giác ↔ nửa giác: "09：30" có thể ra "09:30". → chuẩn hoá NFKC.
 *   2. Chữ Hán bị map sang khối "bộ thủ" (radical) trông y hệt nhưng khác code
 *      point: 文 U+6587 → ⽂ U+2F42 (Kangxi Radicals) hoặc 歯 U+6B6F → ⻭ U+2ED3
 *      (CJK Radicals Supplement). NFKC gỡ được nhóm Kangxi, KHÔNG gỡ được nhóm
 *      Supplement — nên phải tự fold bằng bảng FOLD_RADICALS bên dưới.
 *   3. Xuống dòng / khoảng trắng chèn tuỳ ý giữa các text item. → bỏ hết
 *      whitespace ở CẢ hai vế trước khi so.
 *
 * Lỗi (2) là do bộ ghi PDF của từng engine, không phải do dữ liệu sai. Nếu
 * template Crystal trên máy Windows sinh ra biến thể ngoài bảng dưới đây thì
 * đặt TEST_PDF_TEXT=loose để hạ các assert chữ Hán xuống mức cảnh báo, rồi mở
 * file PDF đính kèm trong báo cáo Playwright ra xem bằng mắt.
 */
import { PDFParse } from 'pdf-parse'

/**
 * Bộ thủ khối CJK Radicals Supplement (U+2E80–U+2EF3) → chữ Hán tương ứng.
 * NFKC KHÔNG đụng tới khối này (khác khối Kangxi U+2F00–U+2FD5, vốn có sẵn
 * compatibility decomposition) nên phải fold tay.
 *
 * Bảng này ĐO ĐƯỢC chứ không đoán: dựng PDF chứa 49 chữ Hán của 実地指導文書 +
 * 医院マスタ rồi đối chiếu từng ký tự với chuỗi gốc — chỉ đúng một chữ rơi vào
 * khối Supplement, số còn lại NFKC lo hết.
 *
 * Muốn bổ sung khi gặp chữ khác trên máy Windows: lấy chuỗi bóc từ PDF, so từng
 * ký tự với giá trị mong đợi, chữ nào lệch mà `NFKC` không gỡ được thì thêm cặp
 * `[ký tự bóc ra]: [chữ đúng]` vào đây.
 */
const FOLD_RADICALS: Record<string, string> = {
    '⻭': '歯', // ⻭ CJK RADICAL SIMPLIFIED TOOTH → 歯 U+6B6F
}

/**
 * Đưa chuỗi về dạng so sánh được: fold bộ thủ → NFKC (toàn giác/nửa giác, khối
 * Kangxi) → bỏ sạch whitespace. Áp cho CẢ chuỗi bóc từ PDF lẫn chuỗi mong đợi.
 */
export function foldForCompare(s: string): string {
    let out = ''
    for (const ch of s) out += FOLD_RADICALS[ch] ?? ch
    return out.normalize('NFKC').replace(/\s+/g, '')
}

/** Ảnh nhúng trong PDF — chỉ giữ phần test cần. */
export interface PdfImage {
    width: number
    height: number
}

export interface PdfContent {
    /** Số trang. */
    pageCount: number
    /** Toàn bộ text, nguyên trạng (đã đính kèm vào report để soi khi fail). */
    text: string
    /** Text đã fold, dùng cho mọi phép so khớp. */
    folded: string
    /** Ảnh nhúng, sắp giảm dần theo diện tích. Rỗng nếu không bóc được. */
    images: PdfImage[]
    /**
     * true khi bóc ảnh bằng pdf-parse thất bại (thiếu canvas native trên máy đó)
     * và phải suy ra sự tồn tại của ảnh bằng cách quét thô byte PDF.
     */
    imagesFromRawScan: boolean
}

/**
 * Đọc PDF thành dạng assert được. Không ném lỗi khi bóc ảnh hỏng — quay về quét
 * thô `/Subtype /Image` để ít nhất còn biết PDF CÓ ảnh hay không.
 */
export async function readPdf(buffer: Buffer): Promise<PdfContent> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    try {
        const text = await parser.getText()
        const raw = text.text ?? ''

        let images: PdfImage[] = []
        let imagesFromRawScan = false
        try {
            // imageThreshold mặc định bỏ qua ảnh nhỏ; đặt 0 để đếm hết.
            const result = await parser.getImage({ imageBuffer: false, imageThreshold: 0 })
            images = result.pages
                .flatMap((p) => p.images ?? [])
                .map((i) => ({ width: i.width, height: i.height }))
                .sort((a, b) => b.width * b.height - a.width * a.height)
        } catch {
            imagesFromRawScan = true
            if (/\/Subtype\s*\/Image/.test(buffer.toString('latin1'))) {
                images = [{ width: 0, height: 0 }] // chỉ biết "có ảnh", không rõ cỡ
            }
        }

        return {
            pageCount: text.pages?.length ?? 0,
            text: raw,
            folded: foldForCompare(raw),
            images,
            imagesFromRawScan,
        }
    } finally {
        await parser.destroy()
    }
}
