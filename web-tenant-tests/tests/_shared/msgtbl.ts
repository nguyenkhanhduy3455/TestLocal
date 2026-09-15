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
 * BA BẢNG — đọc kỹ trước khi sửa
 * ═══════════════════════════════════════════════════════════════════════════
 * `MSG` = chuỗi app ĐANG render, và tính tới commit `ce245472d` thì cũng ĐÚNG
 * BẰNG row MSGTBL. Spec assert cái này ⇒ vừa là lưới chặn hồi quy (ai sửa
 * `ja-msgtbl.ts` mà quên sửa ở đây là đỏ), vừa là bản sao của DB.
 *
 * Nguồn của các giá trị: `SIM2000.MSGTBL` (140 row), đọc bằng bộ
 * `fla-ui-tests/.../Tests/MsgTblParity`; 7 mã còn được đối chiếu với hộp thoại
 * WinForm thật, ảnh hai vế ở `TestLocal/msgtbl-evidence/`.
 *
 * `DB_REPORTED` = mã còn lệch row, kèm chuỗi DB đúng. HIỆN TRỐNG. Thêm vào đây
 * khi phát hiện lệch mới mà app chưa kịp sửa: spec vẫn assert theo `MSG`, còn
 * dòng cảnh báo in ra nhắc rằng chữ đó chưa khớp DB.
 *
 * `REGRESSED` = chuỗi CŨ đã bị loại bỏ. `expectMsg` chặn hẳn chúng, nên nếu
 * nhánh đang chạy chưa merge bản sửa (hoặc Vite còn giữ bundle cũ) thì lỗi báo
 * đúng nguyên nhân, thay vì chỉ nói "không khớp".
 *
 * ⚠️ Severity thì KHÔNG nằm ở đây: WinForm chọn icon theo CHỖ GỌI chứ không theo
 * mã, nên nó được assert riêng bằng `expectSeverity` tại từng call-site.
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
    E00003: () => '該当データがありません。',
    E00007: () => 'データが選択されていません。',
    E00010: () => '苗字と名前の間に空白が必要です。',
    E00012: () => '氏名（漢字）の文字数が越えています。全角で20文字、半角で40文字までです。',
    /** ✔ chốt — frm201001.cs:2375 `//初回来院日より古い日付が診療開始日に入力されています。` */
    E00013: () => '初回来院日より古い日付が診療開始日に入力されています。',
    E00016: () => '年齢が１６歳未満で社保の本人になっています。',
    E00017: () => '年齢が１６歳未満で退職者の本人になっています。',
    E00018: () =>
        '保険種別が「社保、国保、社・退、国・退、後期高齢者」の場合、保険情報を選択してください。',
    E00019: () => '保険種別が「公・単」の場合、公費情報を選択してください。',
    /** ✔ chốt — frm203002.cs:2203 `//E00021：{0}が選択されていません。` */
    E00021: (field: string) => `${field}が選択されていません。`,
    E00022: (field: string) => `${field}の文字数が越えています。`,
    E00052: () => '高齢者の設定に誤りがあります。',
    Q00002: () => '更新してよろしいですか？',
    Q00003: () => '削除してよろしいですか？',
    Q00004: (what: string) => `${what}終了してよろしいですか？`,
    /** ✔ chốt — frm201001.cs:2348 `//{0}が入力されていません。今日の日付にしてよろしいですか？` */
    Q00009: (field: string) => `${field}が入力されていません。今日の日付にしてよろしいですか？`,
    /** ✔ chốt — frm201001.cs:2338 */
    Q00010: (field: string) => `${field}が入力されていません。診療開始日の日付にしてよろしいですか？`,
    Q00012: (n: number) =>
        `${n}歳以上で、保険者番号が入力されていません。生保後期高齢者ですか？` +
        '「はい」を押すと生保後期高齢者、「いいえ」を押すと後期高齢者、「キャンセル」で保留します。',
    Q00013: (n: number) =>
        `${n}歳以上で、高齢者の指定がされていません。高齢者ですか？` +
        '「はい」を押すと高齢者、「いいえ」で保留します。',
    Q00014: () => '有効期限が切れています。このままでよろしいですか？',
    Q00039: (printer: string) => `${printer}プリンタに用紙をセットしてください。`,
    Q00049: (period: string) =>
        `${period}の会計データを一括作成します。` +
        '既に入力済の会計データは全て上書きされます。実行してよろしいですか？',
    I00001: () => '登録が完了しました。',
    I00003: () => '削除が完了しました。',
} as const

export type MsgCode = keyof typeof MSG

/**
 * Mã mà `MSG` còn lệch row MSGTBL — hiện TRỐNG.
 *
 * 16 mã từng nằm đây đã được sửa trong app ở commit `ce245472d`; `MSG` bên trên
 * giờ chính là giá trị row. Khi phát hiện lệch mới thì thêm vào đây: spec vẫn
 * assert theo `MSG` (đo "app có đổi chữ sau lưng không"), còn dòng cảnh báo in
 * ra nhắc rằng chữ đó chưa khớp DB.
 */
export const DB_REPORTED: Partial<Record<MsgCode, string>> = {}

/**
 * Chuỗi của bản CŨ (trước commit 1e5afabb7) cho những mã ĐÃ sửa.
 * Thấy lại bất kỳ chuỗi nào ở đây nghĩa là bản sửa chưa tới được browser —
 * nhánh đang chạy chưa merge, hoặc Vite còn phục vụ bundle cũ.
 */
export const REGRESSED = [
    // Đã sửa ở 1e5afabb7
    '本日の日付を採用してよろしいですか？', // Q00009 cũ
    '診療開始日を採用してよろしいですか？', // Q00010 cũ
    '保険者番号の桁数が間違っています。', // E00020 cũ (mã không tồn tại)
    '初回来院日は診療開始日以前の日付を入力してください。', // E00013 cũ
    'を選択してください。', // E00021 cũ
    '削除しました。', // I00002 cũ dùng nhầm cho nhánh xoá
    // Đã sửa ở ce245472d — 16 mã lệch row MSGTBL
    '該当するデータがありません。', // E00003 cũ (thừa 「する」)
    '選択するデータがありません。', // E00007 cũ — thật ra là body của E00100@frm201045
    '氏名は姓名を空白で区切って入力してください。', // E00010 cũ
    '氏名（漢字）の桁数が長すぎます。', // E00012 cũ (mất phần giới hạn cụ thể)
    '16歳未満は社保・本人で登録できません。', // E00016 cũ
    '16歳未満は退職者保険・本人で登録できません。', // E00017 cũ
    '保険情報が紐付いていません。', // E00018 cũ
    '公費情報が紐付いていません。', // E00019 cũ
    'の桁数が長すぎます。', // E00022 cũ
    '退職者保険では高齢者区分を指定できません。', // E00052 cũ
    '終了します。よろしいですか？', // Q00004 cũ
    '保険証番号が入力されていません。', // Q00012 cũ — sai tên trường
    '有効期限が過ぎています。', // Q00014 cũ
    '用紙をセットして下さい。', // Q00039 cũ (mất 「プリンタに」 + mất tham số)
    'の会計データを作成します。よろしいですか？', // Q00049 cũ (mất cảnh báo ghi đè)
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

        // Nhãn nút VÀ nút mặc định — phần HÀNH VI, thứ mà so chuỗi không thấy được.
        //
        // WinForm ghi hai thứ này vào manifest của nó (MsgEvidence.cs), nên ghi y hệt ở
        // đây thì bảng đối chiếu so được: Q00049 chẳng hạn, WinForm để mặc định
        // 「Cancel」 (MessageBoxDefaultButton.Button2, frm203001.cs:430) — một cú Enter
        // vội trên hộp mặc định OK là ghi đè cả kỳ kế toán.
        const buttons = (await dialog.getByRole('button').allInnerTexts())
            .map((t) => t.replace(/\s+/g, ' ').trim())
            .filter((t) => t.length > 0)
        const defaultButton = await dialog
            .evaluate((el) => {
                const active = document.activeElement as HTMLElement | null
                if (!active || !el.contains(active)) return ''
                return (active.innerText || active.getAttribute('aria-label') || '').trim()
            })
            .catch(() => '')
        const label = slug(what)
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true })

        const file = label.length > 0 ? `${code}__${label}.png` : `${code}.png`
        await dialog.screenshot({ path: path.join(EVIDENCE_DIR, file) })

        // TSV chứ không JSON: câu tiếng Nhật có đủ loại dấu ngoặc, còn TAB thì không
        // bao giờ xuất hiện trong thân hộp thoại.
        const manifest = path.join(EVIDENCE_DIR, 'manifest.tsv')
        if (!existsSync(manifest)) {
            appendFileSync(
                manifest,
                'code\tside\traw\tbuttons\tdefault\tfile\twhat\tcaptured_at\n',
                'utf8',
            )
        }
        appendFileSync(
            manifest,
            [
                code,
                'web',
                text.replace(/\t/g, ' '),
                buttons.join('|'),
                defaultButton,
                file,
                what,
                new Date().toISOString(),
            ].join('\t') + '\n',
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

// ═════════════════════════════════════════════════════════════════════════════
// Icon / severity của hộp thoại
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Bốn "vẻ mặt" của hộp thoại, đọc ra từ vòng tròn icon.
 *
 * WinForm quyết màu ở CHỖ GỌI chứ không phải ở mã: `ShowErrorMsg` → ✕ đỏ,
 * `ShowWarningMsg` → ⚠ vàng, `ShowInfoMsg` → ℹ xanh, các `Show*CancelMsg` →
 * `MessageBoxIcon.Question`. Cùng một mã MSGTBL có thể đỏ ở màn này, vàng ở màn
 * khác — nên severity phải assert THEO TỪNG CHỖ GỌI.
 */
export type Severity = 'error' | 'warning' | 'info' | 'confirm'

/**
 * Map màu ← `SEVERITY_CONFIG` trong `shared/ui/dialog-shared.ts`.
 *
 * Bám class MÀU chứ không bám tên icon của lucide: lucide đổi slug giữa các bản
 * (bản 1.9 render `CircleHelp` thành `lucide-circle-question-mark`), còn hai
 * class Tailwind này do CHÍNH app khai trong `SEVERITY_CONFIG` nên đổi là phải
 * đổi có chủ ý. Đây là ngoại lệ có lý do với GUIDELINE Rule 3: class ở đây là
 * GIÁ TRỊ cần đo, không phải cách định vị phần tử.
 */
const SEVERITY_COLOR: Record<Severity, string> = {
    error: 'text-red-600',
    warning: 'text-amber-600',
    info: 'text-blue-600',
    confirm: 'text-blue-600',
}

/**
 * Đọc severity đang hiển thị.
 *
 * `info` và `confirm` dùng CHUNG màu xanh (chỉ khác glyph ℹ / ？), nên tách hai
 * cái đó bằng SỐ NÚT CÓ CHỮ: thông báo chỉ có 1 nút OK, còn hỏi thì từ 2 nút.
 *
 * ⚠️ Phải lọc nút rỗng. `dialog-shell.tsx:139-146` còn một nút ✕ đóng ở header,
 * không có text nên accessible name rỗng — đếm cả nó thì MỌI hộp info (OK + ✕)
 * thành 2 nút và bị đọc nhầm thành `confirm`. Đã vấp thật khi assert I00001.
 */
export async function readSeverity(page: Page): Promise<Severity | 'không đọc được'> {
    const dlg = topDialog(page)
    const circle = dlg.locator('div.rounded-full').first()
    const cls = (await circle.getAttribute('class').catch(() => null)) ?? ''
    if (cls.includes('text-red-600')) return 'error'
    if (cls.includes('text-amber-600')) return 'warning'
    if (cls.includes('text-blue-600')) {
        const labels = (await dlg.getByRole('button').allInnerTexts())
            .map((t) => t.trim())
            .filter(Boolean)
        return labels.length <= 1 ? 'info' : 'confirm'
    }
    return 'không đọc được'
}

/**
 * Assert hộp thoại đang hiện đúng "vẻ mặt" mà WinForm dùng ở CHỖ GỌI tương ứng.
 *
 * `why` phải dẫn ra được dòng legacy (vd `frm902011.cs:172 ShowWarningMsg`) —
 * severity không suy ra được từ mã, chỉ đọc được từ chỗ gọi.
 */
export async function expectSeverity(page: Page, expected: Severity, why: string): Promise<void> {
    const actual = await readSeverity(page)
    expect(
        actual,
        `icon hộp thoại sai: đang là 「${actual}」, WinForm là 「${expected}」 — ${why}`,
    ).toBe(expected)
}
