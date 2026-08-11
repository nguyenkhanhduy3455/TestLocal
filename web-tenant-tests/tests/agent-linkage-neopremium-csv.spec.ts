import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    assertViewerUp,
    compareDirs,
    compareFiles,
    describeDiff,
    describeDirDiff,
    listDeviceFilesIfExists,
    readDeviceFile,
    type ViewerEntry,
} from './file-viewer'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 機器連携 — NeoPremiumCSV (linkCode 15): đặt đường dẫn cho CẢ BỐN ô ở
 * `?tab=linkage`, bấm 一括作成 lần lượt từng ô, XONG HẾT rồi mới so NGUYÊN CÂY
 * THƯ MỤC với bản WinForm xuất ra.
 *
 * Cây golden (`<root>\05\win`) có dạng:
 *
 *   medsup\  20260731_172811.csv        ← NeoPremiumCSV
 *   pay\     NGYOUMU.001 + EGYOUMU.001  ← Teraoka (ô cố định)
 *   seat\    DentMapPlus.CSV            ← DentMapPlus (ô cố định)
 *   xray\    20260731_172809.csv        ← NeoPremiumCSV
 *
 * ─── VÌ SAO SO THEO VỊ TRÍ, KHÔNG THEO TÊN ─────────────────────────────────
 * NeoPremiumCSV đặt tên file theo ĐỒNG HỒ: `ResolveFileName` →
 * `VendorFields.TimestampFileName(".csv")` = `yyyyMMdd_HHmmss.csv` từ
 * `DateTime.Now` (NeoPremiumCsvConnector.cs:18-21, VendorFields.cs:181-184), bám
 * theo editData_NeoPremiumCSV (CoopRoentgen.cs:1189) vốn đặt tên theo đồng hồ chứ
 * không theo 患者番号. Đường bulk kế thừa nguyên (`ResolveBulkFileName` gọi lại
 * `ResolveFileName`, FileDropConnectorBase.cs:170-173).
 *
 * Nên bản web KHÔNG BAO GIỜ trùng tên với golden dù nội dung y hệt, và so cây
 * theo tên sẽ ra "chỉ bên trái" + "chỉ bên phải" cho hai ô đó. Vì thế
 * `compareDirs(..., { ignoreNames: true })`: trong TỪNG thư mục, sắp file theo tên
 * rồi ghép theo VỊ TRÍ. Hai ô cố định (seat/pay) tên trùng nhau nên vẫn được ghép
 * đúng cặp, không bị ảnh hưởng.
 *
 * ─── THƯ MỤC ĐÍCH PHẢI SẠCH ────────────────────────────────────────────────
 * So nguyên cây chỉ có nghĩa khi `<root>\05\web` chỉ chứa thứ lượt chạy này sinh
 * ra — file sót của lần trước sẽ thành "chỉ có ở web" và làm kết luận vô nghĩa.
 * `file-viewer` cố ý chỉ nhận GET nên test KHÔNG tự xoá được; TC-SETUP-2 kiểm và
 * nói thẳng phải xoá thư mục nào.
 *
 * ─── SPEC NÀY GHI THẬT ─────────────────────────────────────────────────────
 * Đổi cấu hình 機器連携 của MÁY ĐANG CHẠY (bật cả 4 ô) và ghi file vào
 * `<root>\05\web`. Tắt bằng `TEST_ALLOW_SAVE=0`.
 *
 * CHẠY TUẦN TỰ, login MỘT lần, thứ tự CÓ ý nghĩa:
 *   npx playwright test tests/agent-linkage-neopremium-csv.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

const AGENT_SKIP_REASON =
    `cần agent đang chạy (net48, chỉ Windows) — đang chạy trên ${process.platform}. ` +
    'Đặt TEST_AGENT=1 nếu agent chạy ở máy khác.'

const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE !== '0'

/** Một lượt bulk đẩy cả phòng khám qua cloud rồi xuống đĩa — rất lâu. */
const BULK_TIMEOUT_MS = Number(process.env.TEST_BULK_TIMEOUT_MS ?? 15 * 60_000)

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
 * Số hãng nằm ở hằng `DEVICE_NO` của TỪNG spec. KHÔNG dùng chung một biến môi
 * trường cho cả đường dẫn — đặt nó là đổi luôn thư mục của mọi spec, và spec này
 * sẽ lặng lẽ so với golden của hãng khác.
 */
const LINKAGE_TEST_ROOT = process.env.TEST_LINKAGE_ROOT ?? 'C:\\test'

/** NeoPremiumCSV — dòng 5 trong combo 連携先. */
const DEVICE_NO = '05'

const WIN_ROOT = `${LINKAGE_TEST_ROOT}\\${DEVICE_NO}\\win`
const WEB_ROOT = `${LINKAGE_TEST_ROOT}\\${DEVICE_NO}\\web`

const NEO_LABEL = 'NeoPremiumCSV'
const NEO_LINK_CODE = 15
/** Ô cố định không mang mã hãng — legacy lái thẳng DentMapPlus / Teraoka. */
const NO_LEGACY_CODE = 0

/** `yyyyMMdd_HHmmss.csv` — VendorFields.TimestampFileName. */
const TIMESTAMP_CSV = /^\d{8}_\d{6}\.csv$/i

interface Slot {
    /** Mã category của web — cũng là hậu tố id của combo và ô nhập đường dẫn. */
    category: 'xray' | 'medical-support' | 'appointment' | 'settlement'
    /** Tên thư mục con. KHÔNG trùng mã category nên phải ánh xạ tay. */
    dir: string
    /** Nhãn ô, dùng cho card (`≪…≫`) và cho overlay (`…の一括作成中`). */
    label: string
    /** Hãng phải chọn trong combo 連携先; null = ô cố định, không có combo. */
    vendor: string | null
    linkCode: number
    /**
     * Số file connector ghi ra mỗi lượt. Teraoka có thêm cờ `EGYOUMU.001` rỗng
     * (TeraokaConnector.cs:53-67) nên là 2.
     */
    fileCount: number
    /** Tên file cố định, hoặc null khi tên do đồng hồ đặt. */
    fixedName: string | null
}

const SLOTS: readonly Slot[] = [
    {
        category: 'xray',
        dir: 'xray',
        label: 'レントゲンシステム連携',
        vendor: NEO_LABEL,
        linkCode: NEO_LINK_CODE,
        fileCount: 1,
        fixedName: null,
    },
    {
        category: 'medical-support',
        dir: 'medsup',
        label: '診療支援システム連携',
        vendor: NEO_LABEL,
        linkCode: NEO_LINK_CODE,
        fileCount: 1,
        fixedName: null,
    },
    {
        category: 'appointment',
        dir: 'seat',
        label: '予約システム連携',
        vendor: null,
        linkCode: NO_LEGACY_CODE,
        fileCount: 1,
        fixedName: 'DentMapPlus.CSV',
    },
    {
        category: 'settlement',
        dir: 'pay',
        label: '清算機システム連携',
        vendor: null,
        linkCode: NO_LEGACY_CODE,
        fileCount: 2,
        fixedName: 'NGYOUMU.001',
    },
]

const winDir = (slot: Slot) => `${WIN_ROOT}\\${slot.dir}`
const webDir = (slot: Slot) => `${WEB_ROOT}\\${slot.dir}`

test.describe.configure({ mode: 'serial' })

test.describe('機器連携 NeoPremiumCSV — 四つの一括作成とフォルダ全体の比較', () => {
    test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
    skipWithReason(
        !ALLOW_SAVE,
        'spec này ghi thật (cấu hình máy trạm + file thiết bị) — bỏ TEST_ALLOW_SAVE=0 để chạy',
    )

    let page: Page
    let step: () => Promise<void>

    let saveButton: Locator
    let busyHeading: Locator

    /** Số 件 mỗi ô báo về, để đối chiếu chéo giữa bốn ô. */
    const written = new Map<string, number>()

    function card(slot: Slot): Locator {
        return page.getByText(`≪${slot.label}≫`, { exact: true }).locator('..').locator('..')
    }

    /** Hộp thoại nhận diện bằng chính NÚT của nó — overlay cũng là role=alertdialog. */
    function dialogWithButton(name: string): Locator {
        return page.getByRole('alertdialog').filter({ has: page.getByRole('button', { name }) })
    }

    /**
     * Bấm 一括作成 của MỘT ô và lái tới khi xong, trả về số 件.
     *
     * Overlay được HẠ TRƯỚC khi mọi hộp thoại mở (connector-config-form.tsx:230),
     * nên chờ nó tắt rồi mới tìm hộp thoại là an toàn.
     *
     * Câu hỏi 上書き ở đây được TRẢ LỜI ĐỒNG Ý chứ không phải né: hai ô cố định
     * dùng tên file cố định nên từ lượt chạy thứ hai chắc chắn đụng file cũ, mà
     * testcase này quan tâm tới NỘI DUNG CUỐI CÙNG của cây thư mục chứ không tới
     * câu hỏi. Nhánh hỏi/không hỏi đã có spec Hercules2007 giữ.
     */
    async function runBulkExport(slot: Slot): Promise<number> {
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
            // Playwright không huỷ được vế thua; poll từng cái.
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
            const n = /（\s*(\d+)\s*件）/.exec(text)?.[1]
            expect(n, `${slot.label}: không đọc được số 件 từ 「${text}」`).toBeTruthy()
            console.log(`${slot.label} 一括作成 xong: ${text.replace(/\s+/g, ' ')}`)
            return Number(n)
        }
    }

    /** Tên file trong một thư mục đích, hoặc [] nếu thư mục chưa tồn tại. */
    async function namesIn(dir: string): Promise<string[]> {
        return (await listDeviceFilesIfExists(dir)).map((f: ViewerEntry) => f.name)
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

    test('TC-SETUP-1 — cây golden có đủ bốn thư mục và đúng số file mỗi ô', async () => {
        for (const slot of SLOTS) {
            const files = await listDeviceFilesIfExists(winDir(slot))
            expect(
                files.map((f) => f.name),
                `${slot.dir}: golden phải có ${slot.fileCount} file — đặt bản WinForm xuất ra vào ` +
                    `${winDir(slot)}, hoặc trỏ TEST_LINKAGE_ROOT sang chỗ khác`,
            ).toHaveLength(slot.fileCount)

            if (slot.fixedName) {
                expect(
                    files.map((f) => f.name.toLowerCase()),
                    `${slot.dir}: thiếu ${slot.fixedName}`,
                ).toContain(slot.fixedName.toLowerCase())
            } else {
                expect(
                    files[0]!.name,
                    `${slot.dir}: tên file golden phải do đồng hồ đặt (yyyyMMdd_HHmmss.csv)`,
                ).toMatch(TIMESTAMP_CSV)
            }

            // Không bị cắt thì kết luận so cây mới đáng tin.
            for (const f of files) {
                const meta = await readDeviceFile(f.path)
                expect(meta.truncated, `${slot.dir}/${f.name}: golden bị cắt, không so đủ`).toBe(
                    false,
                )
            }
            console.log(`golden ${slot.dir}: ${files.map((f) => f.name).join(', ')}`)
        }
        await step()
    })

    test('TC-SETUP-2 — thư mục đích phải sạch trước khi chạy', async () => {
        // So NGUYÊN CÂY chỉ có nghĩa khi web chỉ chứa thứ lượt này sinh ra. file-viewer
        // cố ý chỉ nhận GET nên test không tự xoá được — nó chỉ báo chính xác phải xoá
        // gì. Chưa có thư mục cũng là sạch: connector tự tạo lúc ghi.
        const leftovers: string[] = []
        for (const slot of SLOTS) {
            for (const name of await namesIn(webDir(slot))) leftovers.push(`${slot.dir}\\${name}`)
        }
        expect(
            leftovers.join('\n'),
            `thư mục đích còn ${leftovers.length} file của lần chạy trước — xoá trắng ` +
                `${WEB_ROOT} rồi chạy lại, nếu không phần dư sẽ hiện thành "chỉ có ở web"`,
        ).toBe('')
        await step()
    })

    test('TC-SETUP-3 — đặt đường dẫn cho cả bốn ô, hai ô chọn hãng đều NeoPremiumCSV', async () => {
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
                await page.getByRole('option', { name: slot.vendor, exact: true }).click()
            }
            await page.locator(`#connector-field-${slot.category}-path`).fill(webDir(slot))
        }

        // Lưu CHỈ KHI có thay đổi — máy đã cấu hình đúng sẵn thì 保存 tắt và bấm vào
        // là chờ hết timeout trên một nút không bao giờ bật.
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
                connectors: { category: string; linkCode: number; enabled: boolean }[]
            }
            for (const slot of SLOTS) {
                const row = sent.connectors.find((c) => c.category === slot.category)
                expect(row, `${slot.label}: thiếu khỏi payload`).toBeTruthy()
                expect(row!.linkCode, `${slot.label}: sai mã hãng`).toBe(slot.linkCode)
                expect(row!.enabled, `${slot.label}: có đường dẫn thì phải bật`).toBe(true)
            }
        } else {
            console.log('cấu hình máy đã đúng sẵn — không có gì để lưu')
        }

        // Trạng thái cuối phải như nhau ở cả hai nhánh, và đây là TIỀN ĐỀ của
        // 一括作成: nút chỉ bật khi ô đang bật VÀ form đã sạch.
        for (const slot of SLOTS) {
            await expect(page.locator(`#connector-field-${slot.category}-path`)).toHaveValue(
                webDir(slot),
            )
            if (slot.vendor) {
                await expect(page.locator(`#connector-category-${slot.category}`)).toContainText(
                    slot.vendor,
                )
            }
        }
        await expect(saveButton, 'lưu xong thì form phải sạch').toBeDisabled()
        await step()
    })

    // ── Xuất ra cả bốn thư mục ───────────────────────────────────────────────

    test('TC-BULK-1 — cả bốn nút 一括作成 đều sẵn sàng', async () => {
        for (const slot of SLOTS) {
            await expect(
                card(slot).getByText('登録済みの全患者を書き出します。'),
                `${slot.label}: chưa ở trạng thái sẵn sàng`,
            ).toBeVisible()
            await expect(card(slot).getByRole('button', { name: /^一括作成/ })).toBeEnabled()
        }
        await step()
    })

    test('TC-BULK-2 — chạy lần lượt cả bốn ô, mỗi ô ghi đúng số file của nó', async () => {
        test.setTimeout(BULK_TIMEOUT_MS * SLOTS.length)

        for (const slot of SLOTS) {
            written.set(slot.category, await runBulkExport(slot))

            const names = await namesIn(webDir(slot))
            expect(
                names,
                `${slot.dir}: một lượt 一括作成 phải sinh đúng ${slot.fileCount} file`,
            ).toHaveLength(slot.fileCount)
            if (slot.fixedName) {
                expect(names.map((n) => n.toLowerCase())).toContain(slot.fixedName.toLowerCase())
            } else {
                expect(
                    names[0]!,
                    `${slot.dir}: tên file phải do đồng hồ đặt (VendorFields.TimestampFileName)`,
                ).toMatch(TIMESTAMP_CSV)
            }
        }

        // Bốn ô cùng đọc một bảng bệnh nhân nên số 件 phải như nhau; lệch là một ô đã
        // đọc thiếu, mà so cây thì chỉ nói được "file khác nhau".
        const counts = SLOTS.map((s) => `${s.dir}=${written.get(s.category)}`)
        expect(
            new Set(SLOTS.map((s) => written.get(s.category))).size,
            `bốn ô báo số 件 khác nhau (${counts.join(', ')})`,
        ).toBe(1)
        await step()
    })

    // ── So nguyên cây, sau khi đã xuất xong cả bốn ───────────────────────────

    test('TC-COMPARE-1 — cả cây thư mục khớp bản WinForm, so một phát', async () => {
        test.setTimeout(BULK_TIMEOUT_MS)

        // GHÉP THEO VỊ TRÍ, không theo tên — xem chú thích đầu spec. Hai ô cố định
        // vẫn ghép đúng cặp vì tên chúng trùng nhau ở cả hai bên.
        const diff = await compareDirs(WIN_ROOT, WEB_ROOT, { ignoreNames: true })

        // Phải chắc đã duyệt hết cây: file-viewer dừng ở 5000 mục và vẫn trả verdict
        // cho phần duyệt được.
        expect(
            diff.truncated,
            `cây thư mục quá lớn nên chỉ so được phần đầu (WinForm ${diff.left.fileCount} file, ` +
                `web ${diff.right.fileCount} file) — kết luận bên dưới sẽ không đáng tin`,
        ).toBe(false)
        expect(diff.ignoreNames, 'server phải chạy ở chế độ ghép theo vị trí').toBe(true)

        console.log(
            `so ${diff.left.fileCount} file WinForm vs ${diff.right.fileCount} file web: ` +
                `${diff.stats.same} giống, ${diff.stats.different} khác, ` +
                `${diff.stats.leftOnly} chỉ WinForm, ${diff.stats.rightOnly} chỉ web`,
        )

        // Đủ file của cả bốn ô. Không có hai dòng này thì một ô im lặng không ghi gì
        // vẫn cho `identical = true` nếu golden của ô đó cũng trống.
        const expectedFiles = SLOTS.reduce((n, s) => n + s.fileCount, 0)
        expect(diff.left.fileCount, 'cây golden thiếu file — kiểm lại TEST_LINKAGE_ROOT').toBe(
            expectedFiles,
        )
        expect(diff.right.fileCount, 'cây web thiếu file — một ô nào đó không ghi được').toBe(
            expectedFiles,
        )

        // So cây chỉ trả lời "khác byte". Với mỗi file lệch, mở luôn diff mức DÒNG:
        // không có bước này thì thông báo dừng ở "KHÁC (1791436 byte vs 1791436 byte)"
        // và người đọc phải tự đi so tay hai file 1.7MB.
        const details: string[] = []
        for (const entry of diff.entries.filter((e) => e.status === 'different')) {
            const fd = await compareFiles(entry.left!.path, entry.right!.path, 'shift_jis')
            details.push(
                `─── ${entry.rel}\n` +
                    `    bảng mã ${fd.left.encoding} vs ${fd.right.encoding}, ` +
                    `xuống dòng ${fd.left.eol} vs ${fd.right.eol}, ` +
                    `${fd.left.lineCount} vs ${fd.right.lineCount} dòng, ` +
                    `${fd.stats.change} dòng khác / ${fd.stats.left} chỉ WinForm / ` +
                    `${fd.stats.right} chỉ web (thuật toán ${fd.algorithm})\n` +
                    describeDiff(fd).split('\n').slice(0, 10).join('\n'),
            )
        }

        expect(
            diff.identical,
            `cây thư mục web KHÁC bản WinForm ` +
                `(${diff.stats.different} file khác, ${diff.stats.leftOnly} chỉ có ở WinForm, ` +
                `${diff.stats.rightOnly} chỉ có ở web):\n${describeDirDiff(diff)}\n\n` +
                `Chi tiết từng file lệch (tối đa 10 dòng mỗi file):\n${details.join('\n')}`,
        ).toBe(true)
        await step()
    })
})

/**
 * Đường LƯU MỘT BỆNH NHÂN cho NeoPremiumCSV — TẠM GÁC, cùng lý do với spec
 * Hercules2007: nó ghi thật vào bảng bệnh nhân nên cần chốt phạm vi trước.
 *
 * Riêng hãng này còn một điểm đáng kiểm khi bật: `ResolveFileName` đặt tên theo
 * `DateTime.Now` đến GIÂY, nên hai lần lưu trong cùng một giây ghi đè lẫn nhau —
 * legacy cũng vậy (NeoPremiumCsvConnector.cs:14-17 nói rõ là tái hiện chứ không
 * "sửa" thành tên theo 患者番号).
 */
test.describe.skip('機器連携 NeoPremiumCSV — 患者保存 (tạm gác)', () => {
    test('TC-PAT-1 — sẽ viết sau khi chốt phạm vi ghi dữ liệu bệnh nhân', () => {})
})
