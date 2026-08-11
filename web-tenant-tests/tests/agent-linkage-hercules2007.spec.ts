import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    assertViewerUp,
    compareDirs,
    compareFiles,
    describeDiff,
    describeDirDiff,
    deviceFileExists,
    deviceFileMtime,
    joinWindowsPath,
    listDeviceFilesIfExists,
    readDeviceFile,
    readDeviceFileLines,
} from './file-viewer'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 機器連携 — bật CẢ BỐN ô ở `?tab=linkage`, bấm 一括作成 lần lượt từng ô, rồi so
 * NGUYÊN CÂY thư mục web với cây WinForm bằng MỘT phép so.
 *
 *   ô レントゲン  (xray)            Hercules2007 → <root>\xray\LydiaKan.txt
 *   ô 診療支援    (medical-support) Hercules2007 → <root>\medsup\LydiaKan.txt
 *   ô 予約        (appointment)     DentMapPlus  → <root>\seat\DentMapPlus.CSV
 *   ô 清算機      (settlement)      Teraoka      → <root>\pay\NGYOUMU.001 + EGYOUMU.001
 *
 * Hai ô đầu CHỌN được hãng (mst_cod cdType 58) nên cả hai cùng đặt Hercules2007 —
 * cùng connector, cùng tên file, khác thư mục. Hai ô sau KHÔNG có combo 連携先:
 * hãng của chúng là cố định, bật/tắt hoàn toàn bằng ディレクトリパス
 * (connector-rows.ts:65-73, CoopRoentgen.cs:343-355).
 *
 * Đây là spec DUY NHẤT kiểm đường GHI FILE. Phần xem màn hình + bấm 保存 cho mọi
 * hãng nằm ở `agent-linkage-settings.spec.ts`.
 *
 * Vì sao so ở đường 一括作成 chứ không phải đường lưu một bệnh nhân: file golden là
 * output của createData_* — MỌI bệnh nhân trong một file. Đường per-patient thì
 * THAY THẾ / nối thêm đúng một bản ghi, nên chỉ đối chiếu được một người. Muốn dùng
 * hết giá trị của golden thì phải so ở đường bulk. Nhóm per-patient nằm ở cuối file,
 * đang tạm gác.
 *
 * ─── Đối chiếu golden ───────────────────────────────────────────────────────
 * `C:\test\01\win\{xray,medsup,seat,pay}` chứa file do WinForm gốc xuất ra; test
 * cấu hình agent ghi sang `C:\test\01\web\<tên tương ứng>` rồi so bằng
 * `/api/compare` của file-viewer.
 *
 * TC-COMPARE-1 so THƯ MỤC (đệ quy, theo BYTE) — đúng một lần gọi cho cả bốn ô, và
 * đó là kết luận chính. Nhưng byte-khác thì không nói được vì sao, nên hai ô
 * Hercules còn được so ở mức FILE (TC-COMPARE-2): `bytesEqual` / `textEqual` /
 * bảng mã / xuống dòng là bốn câu hỏi riêng — xem tests/file-viewer.ts.
 *
 * ⚠️ Giới hạn của so thư mục: `sameBytes` đối chiếu kích thước trước rồi so tối đa
 * 8MB đầu. Hai file cùng kích thước mà chỉ khác nhau sau mốc 8MB sẽ lọt. Hai ô
 * Hercules được TC-COMPARE-2 chốt riêng (có assert `truncated === false`); ô seat /
 * pay thì dựa vào kích thước + 8MB đầu.
 *
 * ─── Nguồn WinForm ──────────────────────────────────────────────────────────
 *  - COMMON/Lib/CoopRoentgen.cs
 *      · createData_Hercules2007 (:1206) — mọi bệnh nhân vào MỘT `LydiaKan.txt`,
 *        tên CỐ ĐỊNH; getAppPath (:3585-3597) + Process.Start (:1245-1251) khởi
 *        động phần mềm hãng sau khi ghi xong, thiếu là LỖI (:1248, :1303).
 *      · createData_DentMapPlus (:1813) — `DentMapPlus.CSV`, thư mục thiếu thì
 *        bulk TỰ TẠO (:1836-1840), khác đường per-patient (:1899-1908 báo lỗi).
 *      · createData_Teraoka (:1933) + makeFileTeraoka (:3172-3229) — `NGYOUMU.001`;
 *        cờ `EGYOUMU.001` bị XOÁ trước khi ghi và tạo lại sau (:2014-2025) để máy
 *        清算 không đọc phải file đang ghi dở.
 *      · ファイルチェック (:1909, :2008) — file đã có thì hỏi trước khi ghi.
 *  - Q00100 — 「<đường dẫn>が既に存在します。＋上書きしてよろしいですか？」
 *
 * ─── Port web đang có ───────────────────────────────────────────────────────
 *  - agent-next/.../Connectors/Hercules2007Connector.cs
 *      · :35  Capabilities = PerPatientSync | BulkExport
 *      · :36  Descriptors.File → SupportedCategories = **VendorAssignable**, tức
 *             MỘT connector phục vụ cả xray lẫn medical-support (Descriptors.cs:29)
 *      · :47  ResolveFileName → 'LydiaKan.txt' (cố định)
 *      · :48-60 Format → 12 trường nối bằng \r\n, kết thúc bằng \r\n
 *      · :62-86 AfterSuccessfulWrite → StexLink.exe; thiếu → 'viewer_not_found'
 *  - agent-next/.../Connectors/DentMapPlusConnector.cs:23-36 — LinkCode =
 *    NoLegacyCode (0), SupportedCategories = { Appointment }, file `DentMapPlus.CSV`
 *  - agent-next/.../Connectors/TeraokaConnector.cs:29-67 — SupportedCategories =
 *    { Settlement }, file `NGYOUMU.001`; BeforeBulkWrite xoá `EGYOUMU.001`,
 *    AfterBulkWrite tạo lại nó RỖNG (0 byte)
 *  - agent-next/.../Shared/FileDropConnectorBase.cs
 *      · :29-32 FormatPayload → **Shift_JIS**
 *      · :237-286 ExportBulkAsSingleFile — **bulk LUÔN thay thế file**, và mã lỗi
 *        khi file đã có là `"file_exists"` **cứng** (:253-254). Nên dù DentMapPlus
 *        và Teraoka để `ExistingFileCode = "file_exists_append"` cho đường
 *        per-patient, câu hỏi ở đường bulk vẫn là 上書き cho CẢ BỐN ô — TC-BULK-3.
 *      · :263 ghi ra `.<tên>.<guid>.tmp` rồi CommitTemp đổi tên đè lên đích
 *  - web-tenant/src/features/agent-linkage/lib/connector-rows.ts
 *      · :21  VENDOR_ASSIGNABLE_CATEGORIES = ['xray', 'medical-support']
 *      · :97-100 isActive — có ディレクトリパス là ô bật; rỗng là tắt
 *  - web-tenant/src/features/agent-linkage/components/connector-config-form.tsx
 *      · :345-346 id ô nhập: `connector-field-<category>-path` / combo:
 *        `connector-category-<category>` (chỉ hai ô chọn được hãng mới có combo)
 *      · :417-427 nút 一括作成 tắt khi `!isActive || bulkRunning || isDirty`
 *      · :466 overlay 「<nhãn ô>の一括作成中」
 *  - web-tenant/src/lib/agent-config.ts:48-53 — nhãn bốn ô
 *  - web-tenant/src/lib/agent-linkage.ts:244-258 — file_exists → confirm
 *    「…が既に存在します。\n上書きしてよろしいですか？」, nút 上書きする / キャンセル
 *
 * ─── SPEC NÀY GHI THẬT ──────────────────────────────────────────────────────
 * Không chặn request nào, vì chặn thì chẳng còn file nào để so. Nó thay đổi:
 *   1. cấu hình 機器連携 của MÁY ĐANG CHẠY — **cả bốn ô**, xem TC-SETUP-2;
 *   2. các file dưới `C:\test\01\web\{xray,medsup,seat,pay}`.
 * Tắt bằng `TEST_ALLOW_SAVE=0`.
 *
 * CHẠY TUẦN TỰ, login MỘT lần. Thứ tự testcase CÓ ý nghĩa (TC-COMPARE đọc file do
 * TC-BULK tạo ra) → luôn chạy cả file, đừng lọc bằng `-g`:
 *   npx playwright test tests/agent-linkage-hercules2007.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Agent là net48 + Windows-only; không có agent thì không có file nào được ghi. */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `cần agent đang chạy (net48, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

/** Cửa thoát cho người không muốn spec ghi gì — xem khối "SPEC NÀY GHI THẬT". */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE !== '0'

// ── Thư mục golden / đích ────────────────────────────────────────────────────
/**
 * Gốc thư mục đối chiếu, đánh số THEO THỨ TỰ TRONG COMBO 連携先 (1..25), không
 * phải theo linkCode của mst_cod.
 *
 *   01 Hercules2007   02 DentAView      03 NeoPremium     04 NeoPremium2
 *   05 NeoPremiumCSV  06 Naomi          07 Sirona         08 SironaSLIDA
 *   09 KRExrista      10 RayJapan       11 EzDentXML      12 Takara
 *   13 AadvaStation   14 ActionGate     15 GenorayJapan   16 Kintone
 *   17 歯撮くん        18 達人プラス      19 GazouKun       20 Morita
 *   21 Non            22「1」 23「4」 24「6」 25「10」
 *
 * Mỗi hãng một cặp `<root>\<NN>\win` (bản WinForm xuất ra) và `<root>\<NN>\web`
 * (bản agent ghi ra); bên trong là 4 thư mục ứng với 4 ô: xray / medsup / seat / pay.
 *
 * Số hãng nằm ở hằng `DEVICE_NO` của TỪNG spec. KHÔNG dùng chung một biến môi
 * trường cho cả đường dẫn — đặt nó là đổi luôn thư mục của mọi spec, và spec này
 * sẽ lặng lẽ so với golden của hãng khác.
 */
const LINKAGE_TEST_ROOT = process.env.TEST_LINKAGE_ROOT ?? 'C:\\test'

/** Hercules2007 — dòng 1 trong combo 連携先. */
const DEVICE_NO = '01'

const WIN_ROOT = `${LINKAGE_TEST_ROOT}\\${DEVICE_NO}\\win`
const WEB_ROOT = `${LINKAGE_TEST_ROOT}\\${DEVICE_NO}\\web`

/** Nhãn hãng trong combo 連携先 (mst_cod cdType 58, cd_val 2). */
const HERCULES_LABEL = 'Hercules2007'
const HERCULES_LINK_CODE = 2
/** FixedCategoryConstants.NoLegacyCode — hai ô cố định không mang mã hãng. */
const NO_LEGACY_CODE = 0

/** 12 trường của một bản ghi Hercules2007, theo đúng thứ tự `Format`. */
const FIELD_NAMES = [
    'patNo',
    '姓 (name1)',
    '名 (name2)',
    'カナ姓 (kana1)',
    'カナ名 (kana2)',
    'patSex (mã thô 1/2)',
    '住所1 (patAdd11)',
    '住所2 (patAdd12)',
    '電話 (patTel1)',
    '生年月日 (yyyyMMdd)',
    '郵便番号 (patPostCd)',
    '(trường rỗng cuối)',
] as const

interface Slot {
    /** Mã category của web — cũng là hậu tố id của combo và ô nhập đường dẫn. */
    category: 'xray' | 'medical-support' | 'appointment' | 'settlement'
    /** Tên thư mục con. KHÔNG trùng mã category nên phải ánh xạ tay. */
    dir: string
    /** Nhãn ô, dùng cho card (`≪…≫`) và cho overlay (`…の一括作成中`). */
    label: string
    /** Hãng phải chọn trong combo 連携先; null = ô cố định, không có combo. */
    vendor: string | null
    /** Mã hãng gửi lên khi lưu. */
    linkCode: number
    /** File dữ liệu connector ghi ra — cái được kiểm mtime và so ở mức trường. */
    dataFile: string
    /**
     * File phụ đi kèm. Chỉ Teraoka có: cờ `EGYOUMU.001` rỗng, bị XOÁ trước khi ghi
     * và tạo lại sau (TeraokaConnector.cs:53-67).
     */
    extraFiles: readonly string[]
}

/** Mọi file một ô phải để lại trong thư mục đích. */
const filesOf = (slot: Slot): readonly string[] => [slot.dataFile, ...slot.extraFiles]

const SLOTS: readonly Slot[] = [
    {
        category: 'xray',
        dir: 'xray',
        label: 'レントゲンシステム連携',
        vendor: HERCULES_LABEL,
        linkCode: HERCULES_LINK_CODE,
        dataFile: 'LydiaKan.txt',
        extraFiles: [],
    },
    {
        category: 'medical-support',
        dir: 'medsup',
        label: '診療支援システム連携',
        vendor: HERCULES_LABEL,
        linkCode: HERCULES_LINK_CODE,
        dataFile: 'LydiaKan.txt',
        extraFiles: [],
    },
    {
        category: 'appointment',
        dir: 'seat',
        label: '予約システム連携',
        vendor: null,
        linkCode: NO_LEGACY_CODE,
        dataFile: 'DentMapPlus.CSV',
        extraFiles: [],
    },
    {
        category: 'settlement',
        dir: 'pay',
        label: '清算機システム連携',
        vendor: null,
        linkCode: NO_LEGACY_CODE,
        dataFile: 'NGYOUMU.001',
        extraFiles: ['EGYOUMU.001'],
    },
]

/** Hai ô dùng Hercules2007 — cùng định dạng 12 dòng, so được ở mức trường. */
const HERCULES_SLOTS = SLOTS.filter((s) => s.vendor === HERCULES_LABEL)

const winDir = (slot: Slot) => `${WIN_ROOT}\\${slot.dir}`
const webDir = (slot: Slot) => `${WEB_ROOT}\\${slot.dir}`

/**
 * Trần thời gian cho một lượt 一括作成 và cho việc so file.
 *
 * Agent tự phân trang TOÀN BỘ bảng bệnh nhân từ cloud rồi stream xuống đĩa, nên
 * vài chục nghìn bản ghi vượt xa `timeout: 120_000` mặc định của config.
 */
const BULK_TIMEOUT_MS = Number(process.env.TEST_BULK_TIMEOUT_MS ?? 15 * 60_000)

test.describe.configure({ mode: 'serial' })

test.describe('機器連携 — 4 ô 一括作成 rồi so cả cây thư mục với WinForm', () => {
    test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
    skipWithReason(
        !ALLOW_SAVE,
        'spec này ghi thật (cấu hình máy trạm + file thiết bị của 4 ô) — bỏ TEST_ALLOW_SAVE=0 để chạy',
    )

    let page: Page
    let step: () => Promise<void>

    let saveButton: Locator
    /** Overlay chặn màn hình lúc chạy 一括作成 (busy-overlay-view.tsx:19-30). */
    let busyHeading: Locator

    /**
     * Bản ghi trong golden của từng ô Hercules, khoá theo 患者番号 (dòng đầu mỗi
     * khối 12 dòng). Dùng để chốt số 件 và để soi từng trường.
     */
    const goldenRecords = new Map<string, Map<string, string[]>>()
    /** Số bệnh nhân trong golden — mọi ô đều phải xuất đúng bấy nhiêu 件. */
    let goldenCount = 0
    /** mtime file dữ liệu của từng ô trước lượt chạy, để chứng minh nó bị ghi lại. */
    const mtimeBefore = new Map<string, number | null>()

    /** Card của một ô: `<span>≪…≫</span>` → div header → div card. */
    function card(slot: Slot): Locator {
        return page.getByText(`≪${slot.label}≫`, { exact: true }).locator('..').locator('..')
    }

    /** Hộp thoại nhận diện bằng chính NÚT của nó — overlay cũng là role=alertdialog. */
    function dialogWithButton(name: string): Locator {
        return page.getByRole('alertdialog').filter({ has: page.getByRole('button', { name }) })
    }

    /**
     * Bấm 一括作成 của MỘT ô và lái tới khi xong.
     *
     * Trả về số 件 mà hộp thoại kết quả báo. Với `captureOnly` thì dừng ở câu hỏi
     * 上書き: trả về nguyên văn câu đó rồi bấm キャンセル — dùng cho testcase chỉ
     * muốn kiểm câu hỏi chứ không muốn ghi lại file.
     *
     * Overlay được HẠ TRƯỚC khi mọi hộp thoại mở (connector-config-form.tsx:230),
     * khác đường lưu bệnh nhân vốn để overlay chồng lên dialog — nên ở đây chờ
     * overlay tắt rồi mới tìm hộp thoại là an toàn.
     */
    async function runBulkExport(
        slot: Slot,
        opts?: { captureOnly?: boolean },
    ): Promise<number | string | null> {
        const overwrite = dialogWithButton('上書きする')
        const retry = dialogWithButton('再試行')
        const done = page
            .getByRole('alertdialog')
            .filter({ hasText: '患者情報一括作成が完了しました。' })

        await card(slot).getByRole('button', { name: /^一括作成/ }).click()
        await expect(
            busyHeading,
            `${slot.label}: không thấy overlay 一括作成 — nút có chạy không?`,
        ).toBeVisible({ timeout: 60000 })
        // Overlay mang tên ô → chứng minh đã bấm ĐÚNG card, không phải card bên cạnh.
        await expect(busyHeading).toHaveText(`${slot.label}の一括作成中`)

        for (;;) {
            // Chờ MỘT trong ba kết cục. Không dùng Promise.race trên locator vì
            // Playwright không huỷ được vế thua; poll từng cái với timeout ngắn.
            await expect
                .poll(
                    async () =>
                        (await overwrite.isVisible().catch(() => false)) ||
                        (await retry.isVisible().catch(() => false)) ||
                        (await done.isVisible().catch(() => false)),
                    {
                        timeout: BULK_TIMEOUT_MS,
                        message: `${slot.label}: 一括作成 không trả về kết cục nào`,
                    },
                )
                .toBe(true)

            if (await overwrite.isVisible().catch(() => false)) {
                const text =
                    (await overwrite.locator('[id$="-description"], p').first().textContent()) ?? ''
                if (opts?.captureOnly) {
                    await overwrite.getByRole('button', { name: 'キャンセル' }).click()
                    await expect(overwrite).toBeHidden({ timeout: 30000 })
                    return text
                }
                await overwrite.getByRole('button', { name: '上書きする' }).click()
                await expect(overwrite).toBeHidden({ timeout: 30000 })
                continue
            }

            if (await retry.isVisible().catch(() => false)) {
                const text =
                    (await retry.locator('[id$="-description"], p').first().textContent()) ?? ''
                await retry.getByRole('button', { name: 'キャンセル' }).click()
                throw new Error(`${slot.label}: 一括作成 thất bại: ${text.replace(/\s+/g, ' ')}`)
            }

            const text = (await done.locator('[id$="-description"], p').first().textContent()) ?? ''
            await done.getByRole('button', { name: 'OK' }).click()
            await expect(done).toBeHidden({ timeout: 30000 })
            const written = /（\s*(\d+)\s*件）/.exec(text)?.[1]
            expect(written, `${slot.label}: không đọc được số 件 từ 「${text}」`).toBeTruthy()
            console.log(`${slot.label} 一括作成 xong: ${text.replace(/\s+/g, ' ')}`)
            return Number(written)
        }
    }

    /** Bóc golden của một ô Hercules thành map 患者番号 → 12 dòng. */
    function parseHerculesRecords(lines: string[]): Map<string, string[]> {
        const records = new Map<string, string[]>()
        for (let i = 0; i < lines.length; i += FIELD_NAMES.length) {
            const record = lines.slice(i, i + FIELD_NAMES.length)
            const key = (record[0] ?? '').trim()
            // Trùng 患者番号 thì bản sau thắng, đúng như thiết bị đọc file tuần tự.
            if (key) records.set(key, record)
        }
        return records
    }

    test.beforeAll(async ({ browser }) => {
        // Lỗi môi trường phải nổ ra ở đây, không giả dạng thành "file không tồn tại"
        // ở giữa suite.
        await assertViewerUp()

        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        saveButton = page.getByRole('button', { name: '保存', exact: true })
        busyHeading = page.locator('#busy-overlay-heading')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Chuẩn bị ─────────────────────────────────────────────────────────────

    test('TC-SETUP-1 — bốn thư mục golden của WinForm có mặt và đúng định dạng', async () => {
        for (const slot of SLOTS) {
            for (const name of filesOf(slot)) {
                expect(
                    await deviceFileExists(winDir(slot), name),
                    `thiếu file gốc ${joinWindowsPath(winDir(slot), name)} — đặt bản WinForm ` +
                        'xuất ra vào đó, hoặc trỏ TEST_LINKAGE_WIN_DIR sang chỗ khác',
                ).toBe(true)
            }
        }

        // Chỉ hai ô Hercules mới có cấu trúc bản ghi cố định để kiểm; seat/pay là
        // CSV một dòng mỗi người, số cột do vendor quyết định — so ở TC-COMPARE-1.
        for (const slot of HERCULES_SLOTS) {
            const filePath = joinWindowsPath(winDir(slot), slot.dataFile)
            const file = await readDeviceFile(filePath)
            expect(
                file.truncated,
                `golden ${filePath} bị cắt ở ${file.bytesRead} byte — không so được đầy đủ`,
            ).toBe(false)

            const lines = await readDeviceFileLines(filePath)
            expect(
                lines.length % FIELD_NAMES.length,
                `${filePath} có ${lines.length} dòng, không chia hết cho ${FIELD_NAMES.length} — ` +
                    'không phải định dạng Hercules2007 (Hercules2007Connector.cs:48-60)',
            ).toBe(0)

            const records = parseHerculesRecords(lines)
            expect(records.size, `golden ${filePath} không có bản ghi nào`).toBeGreaterThan(0)
            expect(
                (lines[0] ?? '').trim(),
                'dòng đầu mỗi bản ghi phải là 患者番号',
            ).toMatch(/^\d+$/)
            goldenRecords.set(slot.category, records)
            goldenCount = records.size
            console.log(
                `golden ${filePath}: ${records.size} bệnh nhân. Bản ghi đầu tiên —\n` +
                    lines
                        .slice(0, FIELD_NAMES.length)
                        .map((v, i) => `  ${FIELD_NAMES[i]} = ${JSON.stringify(v)}`)
                        .join('\n'),
            )
        }

        // Cùng một connector chạy trên cùng một danh sách bệnh nhân → hai golden
        // phải cùng số bản ghi. Lệch nghĩa là hai file được xuất ở hai thời điểm
        // khác nhau, và khi đó số 件 assert ở TC-BULK sẽ đúng với một bên, sai bên kia.
        const counts = HERCULES_SLOTS.map((s) => `${s.dir}=${goldenRecords.get(s.category)?.size}`)
        expect(
            new Set(HERCULES_SLOTS.map((s) => goldenRecords.get(s.category)?.size)).size,
            `hai golden Hercules lệch số bản ghi (${counts.join(', ')}) — xuất lại cùng một lúc`,
        ).toBe(1)
        await step()
    })

    test('TC-SETUP-2 — bật cả bốn ô, hai ô chọn được hãng đều đặt Hercules2007', async () => {
        await page.goto('/settings/agent?tab=linkage', { waitUntil: 'domcontentloaded' })
        await expect(page.getByRole('heading', { name: 'エージェント設定', level: 1 })).toBeVisible({
            timeout: 60000,
        })
        await expect(
            page.getByRole('heading', { name: 'エージェントが起動していません' }),
            'agent không chạy — không có gì ghi ra file cả',
        ).toHaveCount(0)

        for (const slot of SLOTS) {
            if (slot.vendor) {
                await page.locator(`#connector-category-${slot.category}`).click()
                // Radix Select bung listbox qua PORTAL ở body → tìm option ở cấp page.
                await page.getByRole('option', { name: slot.vendor, exact: true }).click()
            } else {
                // Ô cố định không có combo 連携先 — hãng của nó là duy nhất.
                await expect(
                    page.locator(`#connector-category-${slot.category}`),
                    `${slot.label} là ô cố định, lẽ ra không có combo 連携先`,
                ).toHaveCount(0)
            }
            await page.locator(`#connector-field-${slot.category}-path`).fill(webDir(slot))
        }
        await step()

        // Lưu CHỈ KHI thật sự có thay đổi. Máy đã được cấu hình đúng sẵn (chạy lại
        // spec, hoặc người dùng đặt tay để nút 一括作成 hiện lên) thì form sạch ngay
        // từ đầu và 保存 TẮT — bấm vào là chờ hết timeout trên một nút không bao giờ
        // bật, rồi đỏ với thông báo chẳng nói gì về nguyên nhân.
        if (await saveButton.isEnabled()) {
            const putBody = page.waitForRequest(
                (req) => /\/v1\/config(\?|$)/.test(req.url()) && req.method() === 'PUT',
                { timeout: 60000 },
            )
            await saveButton.click()
            await expect(page.getByText('エージェント設定を保存しました。')).toBeVisible({
                timeout: 60000,
            })

            const sent = (await putBody).postDataJSON() as {
                connectors: {
                    category: string
                    linkCode: number
                    enabled: boolean
                    settings: Record<string, unknown>
                }[]
            }
            for (const slot of SLOTS) {
                const sentSlot = sent.connectors.find((c) => c.category === slot.category)
                expect(sentSlot, `${slot.label} không được gửi lên`).toBeTruthy()
                expect(sentSlot!.linkCode, `${slot.label}: mã hãng gửi lên sai`).toBe(slot.linkCode)
                expect(sentSlot!.enabled, `${slot.label}: có đường dẫn thì ô phải bật`).toBe(true)
                expect(sentSlot!.settings.path, `${slot.label}: đường dẫn gửi lên sai`).toBe(
                    webDir(slot),
                )
            }
            expect(
                sent.connectors.filter((c) => c.enabled).map((c) => c.category).sort(),
                'phải bật đúng bốn ô, không thừa không thiếu',
            ).toEqual(SLOTS.map((s) => s.category).sort())
        } else {
            console.log('cấu hình máy đã đúng sẵn — không có gì để lưu')
        }

        // Đi nhánh nào thì trạng thái cuối cũng phải như nhau. Đây đồng thời là
        // TIỀN ĐỀ của 一括作成: nút đó chỉ bật khi ô đang bật VÀ form đã sạch.
        for (const slot of SLOTS) {
            if (slot.vendor) {
                await expect(page.locator(`#connector-category-${slot.category}`)).toContainText(
                    slot.vendor,
                )
            }
            await expect(page.locator(`#connector-field-${slot.category}-path`)).toHaveValue(
                webDir(slot),
            )
        }
        await expect(saveButton, 'lưu xong thì form phải sạch').toBeDisabled()
        await step()
    })

    // ── 一括作成: bấm lần lượt bốn ô ──────────────────────────────────────────

    test('TC-BULK-1 — cả bốn nút 一括作成 đều sẵn sàng', async () => {
        for (const slot of SLOTS) {
            const c = card(slot)
            await expect(
                c.getByText('登録済みの全患者を書き出します。'),
                `${slot.label}: TC-SETUP-2 vừa lưu xong nên ô phải ở trạng thái sẵn sàng`,
            ).toBeVisible()
            await expect(c.getByRole('button', { name: /^一括作成/ })).toBeEnabled()
        }
        await step()
    })

    // Bốn testcase riêng chứ không một vòng lặp trong MỘT test: mỗi lượt xuất kéo
    // dài hàng phút và có thể hỏng độc lập — tách ra thì báo cáo chỉ thẳng ô nào
    // hỏng, và `--headed` nhìn cũng rõ đang chạy ô nào.
    for (const slot of SLOTS) {
        test(`TC-BULK-2 ${slot.dir} — 一括作成 ô ${slot.label} ghi ra ${slot.dir}\\`, async () => {
            // Cả phòng khám đi qua cloud rồi xuống đĩa; 2 phút mặc định của config
            // là không đủ cho vài chục nghìn bệnh nhân.
            test.setTimeout(BULK_TIMEOUT_MS)
            mtimeBefore.set(slot.category, await deviceFileMtime(webDir(slot), slot.dataFile))

            // Cùng con số cho CẢ BỐN ô: ExportBulkAsSingleFile ghi mọi bệnh nhân
            // của cùng một CloudPatientReader, không ô nào lọc bớt
            // (FileDropConnectorBase.cs:264-271). Nên số bản ghi trong golden của ô
            // Hercules cũng là số 件 mà seat/pay phải báo.
            const written = (await runBulkExport(slot)) as number
            expect(
                written,
                `${slot.label}: số 件 báo về (${written}) phải bằng số bản ghi trong golden ` +
                    `(${goldenCount})`,
            ).toBe(goldenCount)

            for (const name of filesOf(slot)) {
                expect(
                    await deviceFileExists(webDir(slot), name),
                    `không thấy ${joinWindowsPath(webDir(slot), name)} — agent chưa ghi được ra thiết bị`,
                ).toBe(true)
            }

            const after = await deviceFileMtime(webDir(slot), slot.dataFile)
            expect(after, 'không đọc được mtime của file vừa ghi').not.toBeNull()
            const before = mtimeBefore.get(slot.category) ?? null
            if (before !== null) {
                expect(
                    after!,
                    `${slot.label}: file cũ không được ghi lại → lượt 一括作成 vừa rồi không tới đĩa`,
                ).toBeGreaterThan(before)
            }
            await step()
        })
    }

    // ── So với bản WinForm ───────────────────────────────────────────────────

    test('TC-COMPARE-1 — cả cây thư mục khớp bản WinForm, so một phát', async () => {
        test.setTimeout(BULK_TIMEOUT_MS)
        const diff = await compareDirs(WIN_ROOT, WEB_ROOT)

        // TRƯỚC TIÊN: phải chắc đã duyệt hết cây. file-viewer dừng ở 5000 mục và vẫn
        // trả verdict cho phần duyệt được — không kiểm cờ này là tự lừa mình.
        expect(
            diff.truncated,
            `cây thư mục quá lớn nên chỉ so được phần đầu (WinForm ${diff.left.fileCount} file, ` +
                `web ${diff.right.fileCount} file) — kết luận bên dưới sẽ không đáng tin`,
        ).toBe(false)

        console.log(
            `so ${diff.left.fileCount} file WinForm vs ${diff.right.fileCount} file web: ` +
                `${diff.stats.same} giống, ${diff.stats.different} khác, ` +
                `${diff.stats.leftOnly} chỉ WinForm, ${diff.stats.rightOnly} chỉ web`,
        )

        // Bốn ô phải có mặt đủ. Nếu một ô im lặng không ghi gì, `identical` vẫn có
        // thể đúng khi golden của ô đó cũng trống — assert số file chặn ca đó lại.
        expect(
            diff.left.fileCount,
            'cây golden không có file nào — kiểm lại TEST_LINKAGE_WIN_DIR',
        ).toBeGreaterThanOrEqual(SLOTS.reduce((n, s) => n + filesOf(s).length, 0))

        expect(
            diff.identical,
            `cây thư mục web KHÁC bản WinForm ` +
                `(${diff.stats.different} file khác, ${diff.stats.leftOnly} chỉ có ở WinForm, ` +
                `${diff.stats.rightOnly} chỉ có ở web):\n${describeDirDiff(diff)}`,
        ).toBe(true)
        await step()
    })

    // So ở mức FILE cho hai ô Hercules — dir compare chỉ trả lời "khác byte" chứ
    // không nói vì sao. Ở đây tách được ba nguyên nhân: nội dung, bảng mã, xuống dòng.
    for (const slot of HERCULES_SLOTS) {
        test(`TC-COMPARE-2 ${slot.dir} — nội dung, bảng mã và xuống dòng đều khớp`, async () => {
            test.setTimeout(BULK_TIMEOUT_MS)
            const goldenFile = joinWindowsPath(winDir(slot), slot.dataFile)
            const webFile = joinWindowsPath(webDir(slot), slot.dataFile)
            const diff = await compareFiles(goldenFile, webFile, 'shift_jis')

            expect(
                diff.left.truncated || diff.right.truncated,
                `file quá lớn nên chỉ so được phần đầu (WinForm ${diff.left.size} byte, ` +
                    `web ${diff.right.size} byte, trần 8MB) — kết luận bên dưới sẽ không đáng tin`,
            ).toBe(false)
            // LCS chỉ chạy khi mỗi bên <= 3000 dòng; file này thường dài hơn nên diff
            // rơi về so theo VỊ TRÍ. Verdict (bytesEqual/textEqual) KHÔNG bị ảnh hưởng
            // — chúng tính trên toàn bộ nội dung — chỉ phần LIỆT KÊ là kém thông minh hơn.
            console.log(
                `${slot.dir}: so ${diff.left.lineCount} dòng WinForm vs ${diff.right.lineCount} ` +
                    `dòng web (thuật toán: ${diff.algorithm})`,
            )

            // Chốt vào `textEqual` chứ không phải `bytesEqual`: khác bảng mã / khác
            // xuống dòng được kiểm riêng ngay dưới, để thông báo nói đúng chuyện gì sai.
            expect(
                diff.textEqual,
                `${slot.dir}: nội dung lệch so với bản WinForm (${diff.stats.change} dòng khác, ` +
                    `${diff.stats.left} chỉ có ở WinForm, ${diff.stats.right} chỉ có ở web). ` +
                    `20 dòng lệch đầu:\n${describeDiff(diff).split('\n').slice(0, 20).join('\n')}`,
            ).toBe(true)

            expect(
                diff.encodingDiffers,
                'agent phải ghi Shift_JIS như legacy (FileDropConnectorBase.cs:29-32) — ' +
                    `WinForm ${diff.left.encoding} vs web ${diff.right.encoding}`,
            ).toBe(false)
            expect(
                diff.eolDiffers,
                'xuống dòng phải là CRLF (Format nối bằng \\r\\n) — ' +
                    `WinForm ${diff.left.eol} vs web ${diff.right.eol}`,
            ).toBe(false)
            // Đủ ba điều trên thì hai file phải giống nhau từng byte.
            expect(
                diff.bytesEqual,
                'nội dung + bảng mã + xuống dòng đều khớp mà byte vẫn lệch',
            ).toBe(true)
            await step()
        })
    }

    /**
     * SPOT CHECK một bản ghi — cả cây đã do TC-COMPARE-1/2 chốt.
     *
     * Tồn tại vì thông báo lỗi: hai testcase trên đỏ thì chỉ nói "dòng N khác nhau",
     * còn ở đây gọi thẳng tên trường (姓 / カナ名 / 生年月日). Chúng KHÔNG thừa nhau —
     * một cái chứng minh, một cái chẩn đoán.
     */
    test('TC-COMPARE-3 — bản ghi đầu tiên đúng từng trường trong 12 dòng, ở cả hai ô Hercules', async () => {
        test.setTimeout(BULK_TIMEOUT_MS)
        for (const slot of HERCULES_SLOTS) {
            const webFile = joinWindowsPath(webDir(slot), slot.dataFile)
            const lines = await readDeviceFileLines(webFile)
            expect(
                lines.length % FIELD_NAMES.length,
                `${webFile} không chia hết thành bản ghi`,
            ).toBe(0)

            const record = lines.slice(0, FIELD_NAMES.length)
            const patNo = (record[0] ?? '').trim()
            const golden = goldenRecords.get(slot.category)!.get(patNo)
            expect(golden, `${slot.dir}: golden không có 患者番号 ${patNo}`).toBeTruthy()
            for (let i = 0; i < FIELD_NAMES.length; i++) {
                expect(
                    record[i],
                    `${slot.dir} — 患者番号 ${patNo}, trường ${i + 1} (${FIELD_NAMES[i]})`,
                ).toBe(golden![i])
            }
            // Trường cuối luôn rỗng: bản ghi đã đóng đúng cách.
            expect(record[11], `${slot.dir}: trường thứ 12 của Hercules2007 luôn rỗng`).toBe('')
        }
        await step()
    })

    test('TC-BULK-3 — chạy lại: cả bốn ô đều hỏi 上書き kèm đúng đường dẫn', async () => {
        // ExportBulkAsSingleFile LUÔN thay thế file và trả mã `"file_exists"` CỨNG
        // (FileDropConnectorBase.cs:253-254), nên câu hỏi là 上書き cho cả bốn ô —
        // kể cả DentMapPlus và Teraoka, vốn để `file_exists_append` cho đường
        // per-patient. Đây chính là chỗ dễ port nhầm thành 追記.
        test.setTimeout(BULK_TIMEOUT_MS)
        for (const slot of SLOTS) {
            const seen = (await runBulkExport(slot, { captureOnly: true })) as string | null
            expect(seen, `${slot.label}: lần chạy thứ hai mà không hỏi 上書き`).not.toBeNull()
            expect(seen!).toContain(joinWindowsPath(webDir(slot), slot.dataFile))
            expect(seen!).toContain('が既に存在します。')
            expect(
                seen!,
                `${slot.label}: đường bulk ghi trọn file → phải hỏi 上書き, KHÔNG phải 追記`,
            ).toContain('上書きしてよろしいですか？')
            await step()
        }
    })

    // ── Thư mục ──────────────────────────────────────────────────────────────

    test('TC-DIR-1 — bốn thư mục đích không có file lạ', async () => {
        // `CommitTemp` ghi ra `.<tên>.<guid>.tmp` rồi mới đổi tên đè lên đích, và
        // xoá `.bak` trong finally. Còn sót lại thứ gì là ghi dở dang.
        for (const slot of SLOTS) {
            // Thư mục đích CHƯA CHẮC tồn tại: connector tự tạo lúc ghi
            // (Directory.CreateDirectory trong ExportBulk). Ô nào không chạy được
            // thì thư mục của nó vẫn trống — đó là trạng thái hợp lệ, không phải lỗi.
            const files = await listDeviceFilesIfExists(webDir(slot))
            const expected = new Set(filesOf(slot).map((f) => f.toLowerCase()))
            const stray = files.filter((f) => !expected.has(f.name.toLowerCase()))
            expect(
                stray.map((f) => f.name),
                `${slot.dir}: còn file tạm / .bak trong thư mục thiết bị → một lần ghi chưa hoàn tất`,
            ).toEqual([])
        }
        await step()
    })
})

/**
 * Đường LƯU MỘT BỆNH NHÂN (/patients → F9 登録 → agent ghi thiết bị) — TẠM GÁC.
 *
 * Khác 一括作成 ở chỗ nó THAY THẾ / NỐI THÊM đúng một bản ghi (Hercules2007 thay cả
 * file bằng 12 dòng của một người; DentMapPlus và Teraoka nối thêm một dòng), nên
 * chỉ đối chiếu được MỘT bản ghi của golden chứ không so cả file — và nó ghi thật
 * vào bảng bệnh nhân, nên cần chốt phạm vi trước khi bật.
 *
 * Những gì sẽ viết ở đây: overlay 「レントゲンシステム連携に反映中」, hỏi 上書き / 追記
 * kèm đường dẫn, từ chối thì KHÔNG đụng file cũ, và thiếu StexLink.exe vẫn phải ghi
 * file (CoopRoentgen.cs:1248).
 */
test.describe.skip('機器連携 — 患者保存 (tạm gác)', () => {
    test('TC-PAT-1 — sẽ viết sau khi chốt phạm vi ghi dữ liệu bệnh nhân', () => {})
})
