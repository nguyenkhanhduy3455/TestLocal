/**
 * MSGTBL — chuỗi thông báo có mã, và cách assert chúng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO GOM VÀO MỘT CHỖ
 * ═══════════════════════════════════════════════════════════════════════════
 * WinForm tra `MsgDialog.Show*Msg(code, param)` qua MỘT bảng runtime
 * (`SELECT MSG FROM MSGTBL WHERE ID=@id`), nên một mã có ĐÚNG MỘT câu chữ cho
 * toàn app — không mã nào thuộc về riêng màn nào. Bản web chép tay bảng đó vào
 * `apps/web-tenant/src/shared/locales/ja-msgtbl.ts`.
 *
 * Bảng MSGTBL thật (SQL Server, máy SIM2000) KHÔNG có trong repo nào, nên phần
 * lớn chuỗi dưới đây là chép tay — và đã từng chép sai. File này là chỗ duy nhất
 * các spec lấy chuỗi, để khi có dump thì sửa một chỗ chứ không đi lùng khắp
 * tests/.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HAI BẢNG — đọc kỹ trước khi sửa
 * ═══════════════════════════════════════════════════════════════════════════
 * `MSG` = chuỗi app ĐANG render. Spec assert cái này, nên nó là lưới chặn hồi
 * quy: ai sửa `ja-msgtbl.ts` mà không sửa ở đây là test đỏ.
 *
 * `DB_REPORTED` = chuỗi mà hai nguồn ĐỘC LẬP cùng khai là row MSGTBL thật, ở
 * những mã lệch với `MSG`.
 *
 * ⚠️ ĐÂY LÀ THAM KHẢO, CHƯA PHẢI CHỐT CUỐI. Hai nguồn:
 *   1. audit `audit-260911-1248-msgtbl-db-parity.html` — dựa trên
 *      `legacy/DB/MSGTBL.sql`, file nay không còn trên máy nào;
 *   2. bộ `fla-ui-tests/.../Tests/MsgTblParity` — hỏi thẳng SQL Server SIM2000.
 *      Bộ này ĐANG VIẾT DỞ, còn đang chạy thử, nên kết quả của nó cũng là tham
 *      khảo chứ chưa phải oracle chính thức.
 *
 * Hai nguồn khớp nhau ở cả 16 mã ⇒ khả năng cao là lệch thật, nhưng ĐỪNG sửa
 * `ja-msgtbl.ts` chỉ dựa vào bảng này. Chốt xong nguồn nào thì sửa `MSG` theo
 * nguồn đó, xoá mã khỏi `DB_REPORTED`, rồi chạy lại spec `*msgtbl*`.
 *
 * Spec ở đây vẫn assert theo `MSG` — nó đo "app có đổi chuỗi sau lưng không",
 * KHÔNG đo "chuỗi có đúng DB không". Cảnh báo in ra chỉ để không ai tưởng
 * "test xanh = chuỗi đúng".
 *
 * Mã KHÔNG nằm trong `DB_REPORTED` thì hoặc vốn đã khớp, hoặc đã được sửa ở
 * commit 1e5afabb7 (E00013, E00021, Q00009, Q00010, I00002→I00003, gỡ E00020) —
 * sáu mã đó chốt được nhờ legacy để lại template nguyên văn trong comment C#.
 */
import { expect } from '@playwright/test'
import { type Locator, type Page } from '@playwright/test'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * Chuỗi app phải render, theo đúng mã.
 *
 * Nguồn: apps/web-tenant/src/shared/locales/ja-msgtbl.ts. Tham số giữ nguyên
 * chữ ký của hàm bên đó để chỗ gọi đọc ra ngay là mã này nhận mấy tham số.
 */
export const MSG = {
    /** ✔ chốt — frm203002.cs:2201 `//E00001：{0}が入力されていません。` */
    E00001: (field: string) => `${field}が入力されていません。`,
    /** ✔ chốt — frm203002.cs:2202 `//E00002：{0}が間違っています。` */
    E00002: (field: string) => `${field}が間違っています。`,
    E00003: () => '該当するデータがありません。',
    E00007: () => '選択するデータがありません。',
    E00010: () => '氏名は姓名を空白で区切って入力してください。',
    E00012: () => '氏名（漢字）の桁数が長すぎます。',
    /** ✔ chốt — frm201001.cs:2375 `//初回来院日より古い日付が診療開始日に入力されています。` */
    E00013: () => '初回来院日より古い日付が診療開始日に入力されています。',
    E00016: () => '16歳未満は社保・本人で登録できません。',
    E00017: () => '16歳未満は退職者保険・本人で登録できません。',
    E00018: () => '保険情報が紐付いていません。保険証情報を入力してください。',
    E00019: () => '公費情報が紐付いていません。公費情報を入力してください。',
    /** ✔ chốt — frm203002.cs:2203 `//E00021：{0}が選択されていません。` */
    E00021: (field: string) => `${field}が選択されていません。`,
    E00022: (field: string) => `${field}の桁数が長すぎます。`,
    E00052: () => '退職者保険では高齢者区分を指定できません。',
    Q00002: () => '更新してよろしいですか？',
    Q00003: () => '削除してよろしいですか？',
    Q00004: (what: string) => `${what}終了します。よろしいですか？`,
    /** ✔ chốt — frm201001.cs:2348 `//{0}が入力されていません。今日の日付にしてよろしいですか？` */
    Q00009: (field: string) => `${field}が入力されていません。今日の日付にしてよろしいですか？`,
    /** ✔ chốt — frm201001.cs:2338 */
    Q00010: (field: string) => `${field}が入力されていません。診療開始日の日付にしてよろしいですか？`,
    Q00012: (n: number) => `${n}歳以上で、保険証番号が入力されていません。生保後期高齢者ですか？`,
    Q00013: (n: number) => `${n}歳以上で、高齢者の指定がされていません。高齢者ですか？`,
    Q00014: () => '有効期限が過ぎています。このまま登録してよろしいですか？',
    Q00039: () => '用紙をセットして下さい。',
    Q00049: (period: string) => `${period}の会計データを作成します。よろしいですか？`,
    I00001: () => '登録が完了しました。',
    I00003: () => '削除が完了しました。',
} as const

export type MsgCode = keyof typeof MSG

/**
 * 16 mã mà cả audit lẫn bộ FlaUI đều khai là lệch với row MSGTBL.
 * Value = chuỗi DB **theo hai nguồn đó** — tham khảo, chưa phải chốt cuối
 * (bộ FlaUI còn đang viết dở). Xem README của `Tests/MsgTblParity`.
 *
 * Nặng nhất là Q00012 / Q00013 / Q00049: DB còn có phần hướng dẫn nút hoặc cảnh
 * báo ghi đè mà bản web đã cắt mất — không chỉ khác chữ, mà mất luôn thông tin
 * người dùng cần để bấm đúng nút. Q00012 còn sai TÊN TRƯỜNG (DB 保険者番号 = mã
 * cơ quan bảo hiểm, web 保険証番号 = số thẻ).
 */
export const DB_REPORTED: Partial<Record<MsgCode, string>> = {
    E00003: '該当データがありません。',
    E00007: 'データが選択されていません。',
    E00010: '苗字と名前の間に空白が必要です。',
    E00012: '氏名（漢字）の文字数が越えています。全角で20文字、半角で40文字までです。',
    E00016: '年齢が１６歳未満で社保の本人になっています。',
    E00017: '年齢が１６歳未満で退職者の本人になっています。',
    E00018: '保険種別が「社保、国保、社・退、国・退、後期高齢者」の場合、保険情報を選択してください。',
    E00019: '保険種別が「公・単」の場合、公費情報を選択してください。',
    E00022: '{0}の文字数が越えています。',
    E00052: '高齢者の設定に誤りがあります。',
    Q00004: '{0}終了してよろしいですか？',
    Q00012:
        '{0}歳以上で、保険者番号が入力されていません。生保後期高齢者ですか？' +
        '「はい」を押すと生保後期高齢者、「いいえ」を押すと後期高齢者、「キャンセル」で保留します。',
    Q00013:
        '{0}歳以上で、高齢者の指定がされていません。高齢者ですか？' +
        '「はい」を押すと高齢者、「いいえ」で保留します。',
    Q00014: '有効期限が切れています。このままでよろしいですか？',
    Q00039: '{0}プリンタに用紙をセットしてください。',
    Q00049:
        '{0}の会計データを一括作成します。既に入力済の会計データは全て上書きされます。' +
        '実行してよろしいですか？',
}

/**
 * Chuỗi của bản CŨ (trước commit 1e5afabb7) cho những mã ĐÃ sửa.
 * Thấy lại bất kỳ chuỗi nào ở đây nghĩa là bản sửa chưa tới được browser —
 * nhánh đang chạy chưa merge, hoặc Vite còn phục vụ bundle cũ.
 */
export const REGRESSED = [
    '本日の日付を採用してよろしいですか？', // Q00009 cũ
    '診療開始日を採用してよろしいですか？', // Q00010 cũ
    '保険者番号の桁数が間違っています。', // E00020 cũ (mã không tồn tại)
    '初回来院日は診療開始日以前の日付を入力してください。', // E00013 cũ
    'を選択してください。', // E00021 cũ
    '削除しました。', // I00002 cũ dùng nhầm cho nhánh xoá
]

// ═════════════════════════════════════════════════════════════════════════════
// Đọc / bấm hộp thoại
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Hộp thoại đang nổi trên cùng.
 *
 * `alertDialog` / `confirmDialog` (appDialog, Radix AlertDialog) mang role
 * `alertdialog`, KHÁC hẳn `DraggableDialog` của màn nghiệp vụ (role `dialog`) —
 * nhờ vậy tách được ngay mà không cần lọc theo text (GUIDELINE Rule 13).
 */
export function topDialog(page: Page): Locator {
    return page.getByRole('alertdialog').first()
}

/** Chờ hộp thoại kế tiếp rồi trả text đã gộp khoảng trắng (có kèm cả nhãn nút). */
export async function nextDialogText(
    page: Page,
    what: string,
    timeout = 30_000,
): Promise<string> {
    const dlg = topDialog(page)
    await expect(dlg, `không thấy hộp thoại nào cho ${what}`).toBeVisible({ timeout })
    const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim()
    console.log(`[${what}] 「${text}」`)
    await captureMsg(dlg, what, text)
    return text
}

// ═════════════════════════════════════════════════════════════════════════════
// Bằng chứng bằng ẢNH
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Thư mục gom ảnh hai vế. Vế WinForm ghi vào `win/` theo ĐÚNG quy ước tên file
 * dưới đây (`Infrastructure/MsgEvidence.cs`), nên `collect-msgtbl-evidence.sh`
 * ghép được thành một bảng đối chiếu.
 *
 * Đổi chỗ bằng `MSGTBL_EVIDENCE_DIR`.
 */
export const EVIDENCE_DIR =
    process.env.MSGTBL_EVIDENCE_DIR ??
    path.resolve(__dirname, '../../../msgtbl-evidence/web')

/** Tên file an toàn: CHỈ ASCII, để scp / zip / đính mail không thành mojibake. */
function slug(s: string): string {
    return s
        .replace(/[EQI]\d{5}/g, '')
        .replace(/[^a-zA-Z0-9 _.-]/g, '')
        .trim()
        .replace(/[\s_.]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60)
}

/**
 * Chụp RIÊNG hộp thoại (không phải cả trang) để người duyệt báo cáo xác nhận bằng mắt.
 *
 * Vì sao không dùng ảnh mặc định của Playwright: `screenshot: 'only-on-failure'` chỉ
 * có khi ĐỎ, chụp cả viewport, và tên file theo tên test chứ không theo MÃ — ba thứ
 * đều sai với việc đang cần. Ở đây chụp mọi lượt (kể cả xanh), cắt đúng hộp thoại, đặt
 * tên theo mã.
 *
 * `what` phải CHỨA mã (các spec đang truyền 'confirm — Q00049 会計作成'), vì mã là thứ
 * ghép cặp được hai vế win/web.
 *
 * KHÔNG BAO GIỜ NÉM: hỏng chỗ chụp ảnh mà làm đỏ testcase đang đo chuyện khác là đổi
 * một câu trả lời lấy một câu hỏi mới. Bằng chứng bằng CHỮ (assert + manifest) không
 * phụ thuộc vào ảnh.
 */
export async function captureMsg(dialog: Locator, what: string, text: string): Promise<void> {
    try {
        const code = what.match(/[EQI]\d{5}/)?.[0] ?? '_'
        const label = slug(what)
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true })

        const file = label.length > 0 ? `${code}__${label}.png` : `${code}.png`
        await dialog.screenshot({ path: path.join(EVIDENCE_DIR, file) })

        // TSV chứ không JSON: câu tiếng Nhật có đủ loại dấu ngoặc, còn TAB thì không
        // bao giờ xuất hiện trong thân hộp thoại.
        const manifest = path.join(EVIDENCE_DIR, 'manifest.tsv')
        if (!existsSync(manifest)) {
            appendFileSync(manifest, 'code\tside\traw\tfile\twhat\tcaptured_at\n', 'utf8')
        }
        appendFileSync(
            manifest,
            [code, 'web', text.replace(/\t/g, ' '), file, what, new Date().toISOString()].join('\t') +
                '\n',
            'utf8',
        )
    } catch {
        /* ảnh là việc phụ — xem doc-comment */
    }
}

/**
 * Bấm nút đồng ý / từ chối.
 *
 * Nhãn KHÔNG chắc là tiếng Nhật: `confirm-dialog-view.tsx` mặc định
 * はい/いいえ/キャンセル nhưng chỗ gọi thực tế đang truyền Yes/No/Cancel
 * (GUIDELINE Rule 13.2) — nên khớp cả hai.
 */
export async function clickDialog(page: Page, kind: 'accept' | 'decline'): Promise<void> {
    const name = kind === 'accept' ? /^(はい|Yes|OK)$/ : /^(いいえ|No|キャンセル|Cancel)$/
    await topDialog(page).getByRole('button', { name }).first().click()
}

/** Đóng hộp thoại bằng nút đồng ý rồi chờ nó biến mất. */
export async function closeDialog(page: Page, what: string, timeout = 30_000): Promise<void> {
    await clickDialog(page, 'accept')
    await expect(topDialog(page), `đóng ${what} rồi mà hộp thoại vẫn còn`).toBeHidden({ timeout })
}

// ═════════════════════════════════════════════════════════════════════════════
// Assert
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Assert hộp thoại mang ĐÚNG NGUYÊN VĂN chuỗi của mã (GUIDELINE Rule 23.3:
 * so theo mã, không so "có chữ 失敗 là được").
 *
 * Kèm hai lớp nữa:
 *  - chặn mọi chuỗi trong `REGRESSED` — bắt ca "bundle cũ / nhánh chưa merge",
 *    kiểu lỗi mà assert thường chỉ báo là "không khớp" rất khó đoán;
 *  - in cảnh báo nếu mã nằm trong `DB_REPORTED`, kèm chuỗi DB hai nguồn khai. Test vẫn
 *    XANH — nó đang đo "app có đổi chuỗi sau lưng không", không đo "chuỗi có
 *    đúng DB không" (việc đó là của bộ FlaUI). Nhưng không được im lặng.
 */
export function expectMsg(text: string, code: MsgCode, expected: string, why: string): void {
    for (const old of REGRESSED) {
        // Chuỗi cũ của CHÍNH mã đang assert mới đáng chặn; chuỗi cũ của mã khác
        // có thể trùng đoạn với chuỗi mới hợp lệ (vd 「を選択してください。」).
        if (expected.includes(old)) continue
        expect(
            text,
            `[${code}] hộp thoại còn mang chuỗi CŨ 「${old}」 — bản sửa msgtbl chưa tới ` +
                'được browser (nhánh đang chạy chưa merge? Vite còn giữ bundle cũ?)',
        ).not.toContain(old)
    }

    expect(text, `[${code}] ${why}`).toContain(expected)

    const db = DB_REPORTED[code]
    if (db !== undefined) {
        console.log(
            `  ⚠️  ${code} nghi lệch MSGTBL. App: 「${expected}」 | ` +
                `DB (theo audit + bộ FlaUI, CHƯA chốt): 「${db}」`,
        )
    }
}
