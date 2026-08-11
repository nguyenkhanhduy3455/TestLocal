/**
 * Đọc file trên đĩa của máy chạy test qua HTTP API của `file-viewer`
 * (TestLocal/file-viewer/server.js).
 *
 * Vì sao không dùng thẳng `node:fs`: file thiết bị do **agent** ghi, mà agent
 * chạy trên máy Windows của phòng khám — không nhất thiết là máy đang chạy
 * Playwright. `file-viewer` bind 127.0.0.1 nên cùng máy thì `fs` cũng được, còn
 * khác máy thì chỉ có đường HTTP. Một helper cho cả hai, đổi máy chỉ cần đổi
 * `TEST_FILE_VIEWER_URL`.
 *
 * Nó cũng giải quyết luôn phần mã hoá: file 機器連携 ghi bằng **Shift_JIS**
 * (FileDropConnectorBase.FormatPayload → ShiftJisAppend.ShiftJis), còn
 * `fs.readFileSync(..., 'utf8')` của Node không đọc được Shift_JIS. `file-viewer`
 * nhận `encoding=shift_jis` và trả về chuỗi đã decode.
 *
 * ── Cấu hình ────────────────────────────────────────────────────────────────
 *   TEST_FILE_VIEWER_URL=http://127.0.0.1:5173   # mặc định, khớp server.js
 *
 * Server luôn chạy sẵn (theo quy ước của repo này), nên helper KHÔNG có cờ bật
 * tắt kiểu `dbEnabled`. Không gọi được thì đó là lỗi môi trường thật và phải
 * nổ ra thành thông báo nói rõ nguyên nhân — xem `assertViewerUp`.
 *
 * API dùng tới (đều là GET, xem file-viewer/server.js):
 *   /api/list?path=<abs>
 *   /api/file?path=<abs>&encoding=<enc>&full=1
 */

/** Gốc của file-viewer. Đổi khi test chạy khác máy với agent. */
export const FILE_VIEWER_URL = (
    process.env.TEST_FILE_VIEWER_URL ?? 'http://127.0.0.1:5173'
).replace(/\/+$/, '')

/** Một entry trong thư mục (server.js: readEntries). */
export interface ViewerEntry {
    name: string
    path: string
    isDir: boolean
    isSymlink: boolean
    ext: string
    /** null với thư mục. */
    size: number | null
    /** epoch ms; null nếu stat lỗi. */
    mtime: number | null
    kind: string
    unreadable: boolean
}

/** Nội dung một file text (server.js: apiFile). */
export interface ViewerFile {
    path: string
    name: string
    ext: string
    kind: string
    size: number
    mtime: number
    /** Mã hoá thực tế đã dùng để decode, vd 'shift_jis' / 'utf-8'. */
    encoding: string
    /** File dài hơn giới hạn đọc → nội dung bị cắt. */
    truncated: boolean
    bytesRead: number
    content: string
}

/**
 * Mã hoá của file thiết bị. Mọi connector text trong agent-next đều ghi
 * Shift_JIS, nên đây là mặc định — KHÔNG dùng 'auto': tên tiếng Nhật ngắn có
 * thể tình cờ hợp lệ UTF-8 và server sẽ chọn nhầm nhánh đầu tiên.
 */
export type ViewerEncoding = 'shift_jis' | 'utf-8' | 'euc-jp' | 'windows-1252' | 'auto'

async function getJson<T>(pathname: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString()
    const url = `${FILE_VIEWER_URL}${pathname}?${qs}`
    let res: Response
    try {
        res = await fetch(url)
    } catch (cause) {
        throw new Error(
            `Không gọi được file-viewer tại ${FILE_VIEWER_URL}. ` +
                'Chạy `node server.js` trong TestLocal/file-viewer, hoặc trỏ ' +
                `TEST_FILE_VIEWER_URL sang máy đang chạy agent. (${String(cause)})`,
        )
    }
    const body = (await res.json()) as T & { error?: string }
    if (!res.ok) {
        throw new Error(`file-viewer ${res.status} cho ${url}: ${body.error ?? '(không có message)'}`)
    }
    return body
}

/**
 * Kiểm tra file-viewer sống, gọi một lần ở `beforeAll` để lỗi môi trường hiện ra
 * ngay thay vì giả dạng thành "file không tồn tại" ở giữa suite.
 */
export async function assertViewerUp(): Promise<void> {
    await getJson<{ home: string }>('/api/home', {})
}

/** Liệt kê thư mục. Ném lỗi nếu thư mục không tồn tại (404 từ server). */
export async function listDir(dir: string): Promise<ViewerEntry[]> {
    const body = await getJson<{ entries: ViewerEntry[] }>('/api/list', { path: dir })
    return body.entries
}

/**
 * Các entry là FILE THẬT của thư mục, bỏ file tạm của connector.
 *
 * `FileDropConnectorBase.Apply` ghi ra `.<tên>.<guid>.tmp` rồi mới `CommitTemp`
 * đổi tên đè lên đích, và có lúc để lại `<tên>.bak` giữa chừng. Một test đếm file
 * mà vớ phải chúng sẽ đỏ ngẫu nhiên tuỳ thời điểm chụp thư mục.
 */
export async function listDeviceFiles(dir: string): Promise<ViewerEntry[]> {
    const entries = await listDir(dir)
    return entries.filter((e) => !e.isDir && !e.name.startsWith('.') && !e.name.endsWith('.bak'))
}

/**
 * Như {@link listDeviceFiles} nhưng thư mục CHƯA TỒN TẠI thì trả mảng rỗng.
 *
 * Connector tạo thư mục đích lúc ghi (`Directory.CreateDirectory` trong
 * `FileDropConnectorBase.Apply` / `ExportBulk`), nên trước lượt chạy đầu tiên nó
 * hợp lệ khi chưa có. Dùng bản này cho mốc "trước khi chạy"; dùng
 * {@link listDeviceFiles} khi thư mục PHẢI có sẵn (vd thư mục golden) để 404 nổ ra
 * thành thông báo nói rõ thiếu gì.
 */
export async function listDeviceFilesIfExists(dir: string): Promise<ViewerEntry[]> {
    try {
        return await listDeviceFiles(dir)
    } catch (err) {
        if (String(err).includes('Không tìm thấy đường dẫn')) return []
        throw err
    }
}

/** Thư mục có file tên này không (so tên KHÔNG phân biệt hoa thường, như Windows). */
export async function deviceFileExists(dir: string, name: string): Promise<boolean> {
    const entries = await listDeviceFiles(dir).catch(() => [])
    return entries.some((e) => e.name.toLowerCase() === name.toLowerCase())
}

/** `mtime` (epoch ms) của một file, hoặc null nếu chưa có. Dùng để chốt "file bị ghi lại". */
export async function deviceFileMtime(dir: string, name: string): Promise<number | null> {
    const entries = await listDeviceFiles(dir).catch(() => [])
    const hit = entries.find((e) => e.name.toLowerCase() === name.toLowerCase())
    return hit?.mtime ?? null
}

/** Đọc nguyên file text. Mặc định Shift_JIS vì đó là thứ connector ghi ra. */
export async function readDeviceFile(
    filePath: string,
    encoding: ViewerEncoding = 'shift_jis',
): Promise<ViewerFile> {
    return getJson<ViewerFile>('/api/file', { path: filePath, encoding, full: '1' })
}

/**
 * Nội dung file tách thành từng dòng theo CRLF.
 *
 * Connector nối record bằng `\r\n` và LUÔN kết thúc bằng `\r\n`
 * (Hercules2007Connector.Format), nên phần tử rỗng cuối cùng do `split` sinh ra
 * bị bỏ đi — nếu không mọi assert số dòng đều lệch 1 và người đọc test sẽ tưởng
 * connector ghi thừa một dòng.
 */
export async function readDeviceFileLines(
    filePath: string,
    encoding: ViewerEncoding = 'shift_jis',
): Promise<string[]> {
    const file = await readDeviceFile(filePath, encoding)
    const lines = file.content.split('\r\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return lines
}

/** Nối đường dẫn theo kiểu Windows — agent chỉ chạy trên Windows. */
export function joinWindowsPath(dir: string, name: string): string {
    return `${dir.replace(/[\\/]+$/, '')}\\${name}`
}

// ── So sánh với file gốc do WinForm xuất ra ──────────────────────────────────
//
// `bytesEqual` và `textEqual` là HAI câu hỏi khác nhau và phải đọc riêng: file
// gốc WinForm là Shift_JIS, bản web sinh ra có thể là UTF-8. Khi đó
// bytesEqual=false / textEqual=true, và kết luận đúng là "nội dung khớp, khác
// bảng mã" — assert nhầm vào bytesEqual sẽ làm test đỏ vì một khác biệt vô hại.
// Muốn chốt cả bảng mã thì assert thêm `encodingDiffers === false`.

/** Một dòng trong diff file. */
export interface CompareOp {
    type: 'same' | 'change' | 'left' | 'right'
    leftNo: number | null
    rightNo: number | null
    left: string | null
    right: string | null
}

/** Một bên của phép so file. */
export interface CompareSide {
    path: string
    name: string
    size: number
    encoding: string
    eol: string
    lineCount: number
    /**
     * File lớn hơn giới hạn đọc của file-viewer (8MB) nên chỉ phần đầu được so.
     *
     * Phải assert `false` trước khi tin vào `bytesEqual`/`textEqual`: server vẫn
     * trả verdict cho phần đọc được, nên một file bị cắt có thể "khớp" mà thực ra
     * chưa so tới phần khác nhau.
     */
    truncated: boolean
}

export interface CompareFileResult {
    mode: 'file'
    /** Giống nhau từng byte. */
    bytesEqual: boolean
    /** Giống nhau sau khi decode — bỏ qua khác biệt bảng mã. */
    textEqual: boolean
    binary: boolean
    /** CRLF vs LF. */
    eolDiffers: boolean
    encodingDiffers: boolean
    left: CompareSide
    right: CompareSide
    algorithm: 'lcs' | 'positional' | 'binary'
    ops: CompareOp[]
    stats: { same: number; change: number; left: number; right: number }
}

export interface CompareDirEntry {
    rel: string
    status: 'same' | 'different' | 'left-only' | 'right-only' | 'unreadable'
    left: { path: string; size: number | null; mtime: number | null } | null
    right: { path: string; size: number | null; mtime: number | null } | null
}

export interface CompareDirResult {
    mode: 'dir'
    left: { path: string; fileCount: number }
    right: { path: string; fileCount: number }
    identical: boolean
    /** Đã ghép theo vị trí thay vì theo tên (xem tham số cùng tên của compareDirs). */
    ignoreNames: boolean
    truncated: boolean
    stats: { same: number; different: number; leftOnly: number; rightOnly: number; unreadable: number }
    entries: CompareDirEntry[]
}

/** So hai FILE. Ném lỗi nếu một trong hai không tồn tại. */
export async function compareFiles(
    left: string,
    right: string,
    encoding: ViewerEncoding = 'shift_jis',
): Promise<CompareFileResult> {
    return getJson<CompareFileResult>('/api/compare', { left, right, encoding })
}

/**
 * So hai THƯ MỤC (đệ quy). Kết quả so bằng BYTE, không phụ thuộc bảng mã —
 * muốn biết chênh lệch chỉ do bảng mã thì mở `compareFiles` cho từng cặp.
 *
 * `ignoreNames`: ghép file theo VỊ TRÍ trong từng thư mục (đã sắp theo tên) thay
 * vì theo tên. Bắt buộc với những hãng đặt tên file theo đồng hồ — ví dụ
 * NeoPremiumCSV ghi `yyyyMMdd_HHmmss.csv`, nên bản WinForm và bản web không bao
 * giờ trùng tên dù nội dung y hệt, và so theo tên sẽ ra "chỉ bên trái" + "chỉ bên
 * phải" cho MỌI file. Với hãng tên cố định thì để mặc định, vì lúc đó tên sai chỗ
 * cũng là một lỗi đáng bắt.
 */
export async function compareDirs(
    left: string,
    right: string,
    opts?: { ignoreNames?: boolean },
): Promise<CompareDirResult> {
    return getJson<CompareDirResult>('/api/compare', {
        left,
        right,
        ...(opts?.ignoreNames ? { ignoreNames: '1' } : {}),
    })
}

/**
 * Bảng các file KHÔNG khớp khi so hai thư mục — để thông báo assert chỉ thẳng
 * file nào lệch, thay vì chỉ nói "hai thư mục khác nhau".
 *
 * Bỏ `same` đi: một cây khớp hoàn toàn thì chẳng có gì để đọc, còn cây lệch thì
 * chỉ mấy dòng lệch mới đáng in.
 */
export function describeDirDiff(result: CompareDirResult): string {
    const label: Record<CompareDirEntry['status'], string> = {
        same: 'giống',
        different: 'KHÁC',
        'left-only': 'chỉ có ở WinForm',
        'right-only': 'chỉ có ở web',
        unreadable: 'không đọc được',
    }
    return result.entries
        .filter((e) => e.status !== 'same')
        .map(
            (e) =>
                `  ${e.rel}: ${label[e.status]}` +
                ` (WinForm ${e.left?.size ?? '-'} byte, web ${e.right?.size ?? '-'} byte)`,
        )
        .join('\n')
}

/** Các dòng khác nhau, để in vào thông báo assert cho người đọc thấy ngay chỗ lệch. */
export function describeDiff(result: CompareFileResult): string {
    return result.ops
        .filter((op) => op.type !== 'same')
        .map((op) => `  ${op.type} L${op.leftNo ?? '-'} ${JSON.stringify(op.left)}` +
            ` | R${op.rightNo ?? '-'} ${JSON.stringify(op.right)}`)
        .join('\n')
}
