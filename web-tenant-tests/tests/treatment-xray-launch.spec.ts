/**
 * Ô dùng chung 画像 / レントゲン trên thanh công cụ màn 診療入力 (frm203002).
 *
 * Hai nửa của MỘT chỗ trống, loại trừ nhau theo 連携先 (PicLink):
 *   · レントゲン → khởi chạy 画像編集ソフト qua agent (phần lớn file này);
 *   · 画像(&P)   → mở hộp thoại 画像取込 (frm203024) — nhóm TC-GAZOU ở cuối bài.
 *
 * ── FACT từ WinForm (nguồn gốc chuẩn) ────────────────────────────────────────
 * `frm203002.cs:1070-1086` — `btnRoentgen_Click` switch theo `ModCommon.pInpOpt[28]`
 *   (= 連携先 レントゲンシステム, OchaXml.InpInfo.PicLink):
 *     · 5  NeoPremium      → KeyFunc(1011) → CoopRoentgen.AdrStart        (Neolink.dll)
 *     · 6  Trophy Windows  → KeyFunc(1012) → modPicture.pLinkTW
 *     · 12 NP2_NeoLink     → KeyFunc(1013) ─┐
 *     · 15 NEOPREMIUM_CSV  → KeyFunc(1013) ─┴→ CoopRoentgen.NeoPremiumStart
 *     · còn lại            → KHÔNG làm gì
 * `frm203002.cs:4905-4915` — nhánh 1013 đọc `MstConfig.img_edit_soft` rồi gọi
 *   `NeoPremiumStart(config.img_edit_soft, ModCommon.pstrPatId)`.
 * `CoopRoentgen.cs:3964-3985` — thân hàm đó CHỈ có:
 *     psInfo.FileName = exeName; psInfo.Arguments = "1 " + strPttID;
 *     psInfo.CreateNoWindow = true; psInfo.UseShellExecute = false; Process.Start(psInfo);
 *   Hỏng thì MsgBox 「レントゲンソフト（NeoPremium2）の起動が出来ませんでした。」+ ex.Message,
 *   tiêu đề 「レントゲンソフト連携」. KHÔNG chờ, KHÔNG nhận lại gì.
 * `frm203001.cs:998` — `pstrPatId = formParam.PatNo.ToString()`, tức 患者番号 TRẦN,
 *   KHÔNG pad 0 → TC-REQ-2.
 *
 * ── FACT từ WinForm — nửa 画像 ───────────────────────────────────────────────
 * `frm203002.Designer.cs:2366,2368` — `btnGazou.Text = "画像(&P)"`, `Visible = false`.
 *   Nhãn có `(&P)` nghĩa là nút CÓ access key Alt+P, y như &R/&H/&J/&K/&S.
 * `frm203002.cs:3103-3145` — `btnGazou.Visible = true` CHỈ khi `pInpOpt[28]` ∈ {1,3,4};
 *   5/6/12/15 dựng btnRoentgen thay vào chỗ đó, mã khác ẩn cả hai.
 * `frm203002.cs:1096-1102` — `btnGazou_Click` còn kiểm lại `btnGazou.Visible` rồi mới
 *   `formControl.showDialog(ID203024)`.
 * ⇒ WinForm phân giải access key trên control ĐANG HIỆN, nên Alt+P phải CHẾT khi
 *   レントゲン đang chiếm chỗ (TC-GAZOU-2) hoặc khi không có agent (TC-SHOW-3).
 *
 * ── Phía web ────────────────────────────────────────────────────────────────
 * `category-tabs.tsx` — 画像 và レントゲン DÙNG CHUNG một chỗ trên thanh công cụ,
 *   loại trừ nhau: PIC_LINK_MODES_SHOW_GAZOU {1,3,4} → 画像(&P);
 *   PIC_LINK_MODES_SHOW_ROENTGEN {5,6,12,15} → レントゲン; mã khác → ẩn CẢ HAI.
 *   Trong 4 mã hiện レントゲン chỉ PIC_LINK_MODES_LAUNCH_EXE {12,15} gọi agent;
 *   5 và 6 vẫn là 開発中 vì hai cơ chế đó chưa port.
 * `category-tabs.tsx` — bảng `actionsRef` gom access key và bắt theo `e.code`
 *   (macOS gõ Alt+P ra `π` chứ không ra `p`, đọc `e.key` là chết mnemonic).
 *   `KeyP` chỉ được ĐĂNG KÝ khi `showGazou` — đúng luật "control ẩn thì access key
 *   không tồn tại" ở trên. Trước bản vá `fix/inp-gazou-alt-p-mnemonic` thì bảng này
 *   chỉ có 5/6 phím (&R &H &J &K &S), nhãn vẫn in `(&P)` mà bấm không ăn.
 * `treatment-entry-detail.tsx:5776,6054` — `onImageClick` → `<ImageDialog>`.
 * `treatment-entry-detail.tsx handleRoentgen` → `lib/agent-xray.ts`
 *   → `POST /v1/xray/launch { patientId }` → 200 `{ reused }` là xong.
 * Agent `XrayEndpoints.cs` tự đọc `imgEditSoft` từ settings của MÁY nó và tự dựng
 *   `Arguments = "1 " + patientId`.
 *
 * ── Hai hành vi THÊM so với WinForm ─────────────────────────────────────────
 * `XrayLauncher.cs` — WinForm chỉ Process.Start, không kéo cửa sổ lên và không biết
 *   chương trình đã chạy hay chưa, nên thu nhỏ rồi bấm lại là ra cái thứ hai.
 *   Bản web: kéo cửa sổ lên trước trình duyệt (phá foreground lock bằng
 *   AttachThreadInput, đúng cách NativeDialogHost đã làm), và bấm lại khi CÙNG bệnh
 *   nhân thì dựng lại cửa sổ cũ thay vì mở tiến trình mới.
 *   Khoá theo CẢ bệnh nhân: đối số là cách duy nhất báo cho chương trình biết mở hồ
 *   sơ nào, nên đổi bệnh nhân bắt buộc phải gọi lại.
 *   Cả hai nằm TRỌN trong agent — spec này chỉ chốt được rằng SPA không tự chặn lần
 *   bấm thứ hai (TC-REUSE-1); phần cửa sổ phải kiểm bằng mắt, xem TC-REAL-1.
 *
 * ── Vì sao chặn GET /v1/config ──────────────────────────────────────────────
 * 連携先 nằm trong cấu hình agent của TỪNG MÁY. Muốn chạy đủ 4 nhánh switch thì
 * phải đổi 連携先 4 lần — sửa thật là ghi vào agent.db của máy đang chạy test rồi
 * đẩy lên cloud mirror, và bỏ dở giữa chừng thì máy đó nằm lại ở hãng thử.
 * Nên nhóm TC-SHOW/TC-REQ/TC-ERR chặn GET /v1/config và trả linkCode mong muốn:
 * chúng kiểm HỢP ĐỒNG CỦA SPA (nút nào hiện, gửi gì, báo lỗi ra sao), chạy được
 * trên mọi nền tảng và không đụng máy thật.
 * Bù lại, TC-REAL cuối bài KHÔNG chặn gì cả — cần Windows + cờ, xem tại chỗ.
 *
 * ⚠️ Spec này KHÔNG kiểm ảnh chụp có vào hồ sơ hay không. Đúng như WinForm, khởi
 * chạy xong là hết trách nhiệm: ảnh nằm trong kho riêng của phần mềm X-quang, và
 * chỉ vào カルテ qua thao tác 画像取込 (frm203024) — chuyện khác hẳn, spec khác.
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (Rule 10.1). Mỗi lần đổi linkCode phải reload vì `useTreatmentConfig`
 * cache query ['agent','config'] — helper `openWithPicLink()` lo việc đó.
 */
import { expect, test, type Page, type Route } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'
import { closeDialogs } from './virtual-grid'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Bệnh nhân mở màn 診療入力. Không cần 処置行 — thanh công cụ render độc lập. */
const PAT_NO = process.env.TEST_PAT_NO ?? '11'

const AGENT_CONFIG_URL = /\/v1\/config(\?|$)/
const XRAY_LAUNCH_URL = /\/v1\/xray\/launch(\?|$)/

/**
 * 連携先 レントゲンシステム (mst_cod cd_type 58) — chính là `pInpOpt[28]`.
 * Đặt tên theo hãng để đọc switch của WinForm không phải tra ngược.
 */
const PIC_LINK = {
    /** 連携しない — ẩn cả 画像 lẫn レントゲン. */
    none: 0,
    /** Hiện 画像(&P), KHÔNG hiện レントゲン. */
    gazou: 1,
    /** NeoPremium — hiện レントゲン nhưng đi AdrStart, chưa port. */
    neoPremium: 5,
    /** Trophy Windows — hiện レントゲン nhưng đi pLinkTW, chưa port. */
    trophy: 6,
    /** NP2_NeoLink — nhánh 1013, CÓ gọi agent. */
    np2NeoLink: 12,
    /** NEOPREMIUM_CSV — nhánh 1013, CÓ gọi agent. */
    neoPremiumCsv: 15,
} as const

/** Nhãn nút thật trong UI (category-tabs.tsx render `&amp;` → `&`). */
const BTN_ROENTGEN = 'レントゲン'
const BTN_GAZOU = '画像(&P)'

/** Mnemonic của btnGazou — web bắt theo `e.code` nên Playwright gửi 'Alt+p' là đúng. */
const ALT_GAZOU = 'Alt+p'

/**
 * Nhận diện hộp thoại 画像 bằng nhãn TRONG THÂN, không bằng tiêu đề: title là
 * 「画 像」 giãn chữ nên không match được (GUIDELINE Rule 13.1), và chuỗi 「画像」
 * còn nằm ở cả radio 取込対象 lẫn tab bar của chính hộp thoại đó.
 * `image-dialog.tsx` — 取込対象 là nhãn cố định của khối đầu tiên.
 */
const GAZOU_DIALOG_MARK = '取込対象'

/** Tiêu đề hộp thoại lỗi — `agent-xray.ts` XRAY_LAUNCH_DIALOG_TITLE. */
const DIALOG_TITLE = 'レントゲンソフト連携'
/** `notify-under-development.ts`. */
const UNDER_DEVELOPMENT = 'この機能は開発中です。'

/** Cho phép CHẠY THẬT chương trình ngoài ở TC-REAL. Mặc định tắt (Rule 18.1). */
const ALLOW_LAUNCH = process.env.TEST_ALLOW_LAUNCH === '1'

/**
 * Có agent trên máy chạy test hay không — agent là net48, chỉ Windows.
 * Ép tay: TEST_AGENT=1 / TEST_AGENT=0 (giống spec 診療入力設定).
 */
const AGENT_AVAILABLE =
    process.env.TEST_AGENT === '1'
        ? true
        : process.env.TEST_AGENT === '0'
          ? false
          : process.platform === 'win32'

interface XrayLaunchBody {
    patientId?: string
    /** KHÔNG được có gì khác — xem TC-REQ-3. */
    [key: string]: unknown
}

/**
 * Chờ sau khi gõ một phím LẼ RA không có tác dụng: không có gì để `expect` chờ đợi,
 * nên phải để trôi qua đủ lâu rồi mới khẳng định "không có gì mở ra".
 */
const KEY_SETTLE_MS = 1500

/** Chờ màn 診療入力 ở lần nạp ĐẦU (Vite dev server phải transform cả module graph). */
const SCREEN_LOAD_TIMEOUT_MS = 60_000
/** Các lần nạp lại — module graph đã ấm. */
const SCREEN_RELOAD_TIMEOUT_MS = 30_000

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 画像 / レントゲン ボタン（PicLink スロット）', () => {
    let page: Page
    let step: () => Promise<void>

    // ─── Trạng thái route stub, chia sẻ giữa các testcase ─────────────────────
    /** linkCode mà stub GET /v1/config sẽ trả về. */
    let picLink: number = PIC_LINK.np2NeoLink
    /** true = KHÔNG chặn gì (TC-REAL chạy thật với cấu hình thật của máy). */
    let passthrough = false
    /** Số lần POST /v1/xray/launch bị bắt — TC-VENDOR-* assert bằng 0. */
    let launchCalls = 0
    /** Body của lần gọi gần nhất. */
    let lastLaunch: XrayLaunchBody | null = null
    /** Agent stub sẽ trả gì: 200 · 400 chưa cấu hình · 500 khởi chạy hỏng. */
    let launchOutcome: 'ok' | 'notConfigured' | 'failed' = 'ok'
    /** Cờ `reused` trong body 200 — agent dựng lại cửa sổ cũ thay vì mở tiến trình mới. */
    let launchReused = false

    /** Thông báo lỗi agent trả về ở nhánh 'failed' — TC-ERR-2 soi nguyên văn. */
    const LAUNCH_ERROR_DETAIL = 'The system cannot find the file specified'

    /**
     * Mở lại màn 診療入力 với 連携先 = `code`.
     *
     * Phải reload chứ không chỉ đổi biến: `useTreatmentConfig` đọc query
     * ['agent','config'] đã cache, đổi stub mà không nạp lại thì nút vẫn theo mã cũ.
     */
    async function openWithPicLink(code: number, expectVisible: string | null) {
        picLink = code
        let lastErr: unknown
        for (let attempt = 1; attempt <= 3; attempt++) {
            await page.goto(`/treatments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            const timeout = attempt === 1 ? SCREEN_LOAD_TIMEOUT_MS : SCREEN_RELOAD_TIMEOUT_MS
            try {
                await closeDialogs(page)
                // Không có nút nào để chờ (TC-SHOW-3) thì chờ một nút LUÔN có trên
                // cùng thanh công cụ, để "ẩn" được kiểm sau khi thanh đã render thật.
                const anchor = expectVisible ?? 'レセプト'
                await expect(
                    page.getByRole('button', { name: anchor }),
                    `không thấy nút 「${anchor}」 với 連携先=${code}`,
                ).toBeVisible({ timeout })
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openWithPicLink(${code}): lần ${attempt}/3 không nạp được màn ` +
                        '(nhiều khả năng Vite dev server nhả hụt một module /src/*.ts) — nạp lại',
                )
            }
        }
        throw lastErr
    }

    /** Nút レントゲン trên thanh công cụ. */
    const roentgenBtn = () => page.getByRole('button', { name: BTN_ROENTGEN })

    /** Nút 画像(&P) — nửa còn lại của cùng một chỗ. */
    const gazouBtn = () => page.getByRole('button', { name: BTN_GAZOU })

    /** Hộp thoại 画像取込 (frm203024) — `DraggableDialog` nên là role=dialog. */
    const gazouDialog = () => page.getByRole('dialog').filter({ hasText: GAZOU_DIALOG_MARK })

    /** Hộp thoại cảnh báo, nhận diện bằng tiêu đề (overlay cũng là role=alertdialog). */
    const alertWithTitle = (title: string) =>
        page.getByRole('alertdialog').filter({ hasText: title })

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        // Lỗi JS chưa bắt làm React không mount → màn rỗng và test đỏ ở chỗ khó hiểu.
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // ─── Login ────────────────────────────────────────────────────────────
        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        // ─── Stub GET /v1/config — chỉ để lái 連携先 ─────────────────────────
        // Lấy bản THẬT rồi vá đúng một trường: giữ nguyên shape của agent, nên agent
        // đổi contract là spec đỏ chứ không xanh giả. Không lấy được (macOS, agent
        // tắt) thì dựng bản tối thiểu — màn này chỉ đọc `connectors`.
        await page.route(AGENT_CONFIG_URL, async (route: Route) => {
            if (passthrough || route.request().method() !== 'GET') return route.fallback()

            let body: Record<string, unknown>
            try {
                const real = await route.fetch()
                body = (await real.json()) as Record<string, unknown>
            } catch {
                body = {
                    connectors: [],
                    printMappings: [],
                    settings: {},
                    inpSettings: {},
                    configVersion: 1,
                }
            }

            const others = Array.isArray(body.connectors)
                ? (body.connectors as { category?: string }[]).filter((c) => c.category !== 'xray')
                : []
            body.connectors = [
                ...others,
                {
                    category: 'xray',
                    linkCode: picLink,
                    enabled: picLink !== PIC_LINK.none,
                    settings: {},
                },
            ]

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })

        // ─── Stub POST /v1/xray/launch ───────────────────────────────────────
        await page.route(XRAY_LAUNCH_URL, async (route: Route) => {
            if (passthrough || route.request().method() !== 'POST') return route.fallback()
            launchCalls++
            lastLaunch = route.request().postDataJSON() as XrayLaunchBody

            if (launchOutcome === 'ok') {
                // 200 + { reused } — agent tự quyết mở tiến trình mới hay dựng lại cửa sổ
                // đang thu nhỏ. SPA KHÔNG rẽ nhánh theo cờ này (xem TC-REUSE-1).
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ reused: launchReused }),
                })
            }
            if (launchOutcome === 'notConfigured') {
                return route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        code: 'image_editor_not_configured',
                        message: '画像編集ソフトが設定されていません。',
                    }),
                })
            }
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'launch_failed', message: LAUNCH_ERROR_DETAIL }),
            })
        })
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ═══ Hiện / ẩn nút theo 連携先 ═══════════════════════════════════════════

    test('TC-SHOW-1 — 連携先 12 (NP2_NeoLink): hiện レントゲン, KHÔNG hiện 画像', async () => {
        await openWithPicLink(PIC_LINK.np2NeoLink, BTN_ROENTGEN)
        await expect(
            gazouBtn(),
            'TC-SHOW-1 FAIL: 画像 và レントゲン dùng chung một chỗ, không được hiện cùng lúc',
        ).toHaveCount(0)
        await step()
    })

    test('TC-SHOW-2 — 連携先 1: hiện 画像(&P), KHÔNG hiện レントゲン', async () => {
        await openWithPicLink(PIC_LINK.gazou, BTN_GAZOU)
        await expect(
            roentgenBtn(),
            'TC-SHOW-2 FAIL: mã 1 phải ra 画像 chứ không phải レントゲン',
        ).toHaveCount(0)
        await step()
    })

    test('TC-SHOW-3 — 連携先 0 (連携しない): ẩn CẢ HAI nút, và Alt+P cũng câm', async () => {
        await openWithPicLink(PIC_LINK.none, null)
        await expect(roentgenBtn()).toHaveCount(0)
        await expect(gazouBtn()).toHaveCount(0)

        // Gộp vào đây thay vì một testcase riêng: cùng một lần nạp màn, và mệnh đề
        // "không có nút thì không có access key" chính là hệ quả của hai dòng trên.
        await page.keyboard.press(ALT_GAZOU)
        await page.waitForTimeout(KEY_SETTLE_MS)
        await expect(
            gazouDialog(),
            'TC-SHOW-3 FAIL: máy không có agent / 連携しない mà Alt+P vẫn mở được hộp thoại',
        ).toHaveCount(0)
        await step()
    })

    // ═══ Nội dung request ════════════════════════════════════════════════════

    test('TC-REQ-1 — 連携先 12: bấm レントゲン gọi POST /v1/xray/launch đúng 1 lần', async () => {
        await openWithPicLink(PIC_LINK.np2NeoLink, BTN_ROENTGEN)
        launchCalls = 0
        lastLaunch = null
        launchOutcome = 'ok'

        const req = page.waitForRequest(
            (r) => XRAY_LAUNCH_URL.test(r.url()) && r.method() === 'POST',
            { timeout: 30000 },
        )
        await roentgenBtn().click()
        await req

        expect(launchCalls, 'TC-REQ-1 FAIL: nút không gọi agent').toBe(1)
        await step()
    })

    test('TC-REQ-2 — patientId là 患者番号 TRẦN, không pad 0', async () => {
        expect(lastLaunch, 'TC-REQ-1 chưa bắt được request').not.toBeNull()
        // WinForm: pstrPatId = formParam.PatNo.ToString() (frm203001.cs:998).
        // Pad 0 sẽ làm phần mềm X-quang mở nhầm / không thấy hồ sơ.
        expect(lastLaunch!.patientId, `patientId phải bằng đúng 「${PAT_NO}」`).toBe(PAT_NO)
        await step()
    })

    test('TC-REQ-3 — body KHÔNG mang đường dẫn thực thi', async () => {
        expect(lastLaunch, 'TC-REQ-1 chưa bắt được request').not.toBeNull()
        // Ràng buộc AN TOÀN, không phải parity: đường dẫn 画像編集ソフト do agent tự
        // đọc từ settings của máy nó. Nếu để SPA gửi lên thì một trang bất kỳ có thể
        // bảo agent chạy file tùy ý trên máy phòng khám.
        expect(
            Object.keys(lastLaunch!).sort(),
            'TC-REQ-3 FAIL: body chỉ được có patientId',
        ).toEqual(['patientId'])
        await step()
    })

    test('TC-REQ-4 — 連携先 15 (NEOPREMIUM_CSV) cũng gọi agent như 12', async () => {
        await openWithPicLink(PIC_LINK.neoPremiumCsv, BTN_ROENTGEN)
        launchCalls = 0
        launchOutcome = 'ok'

        const req = page.waitForRequest(
            (r) => XRAY_LAUNCH_URL.test(r.url()) && r.method() === 'POST',
            { timeout: 30000 },
        )
        await roentgenBtn().click()
        await req

        expect(launchCalls, 'TC-REQ-4 FAIL: 12 và 15 cùng vào nhánh KeyFunc(1013)').toBe(1)
        await step()
    })

    // ═══ Hai hãng chưa port ══════════════════════════════════════════════════

    test('TC-VENDOR-1 — 連携先 5 (NeoPremium): hiện nút nhưng ra 開発中, KHÔNG gọi agent', async () => {
        await openWithPicLink(PIC_LINK.neoPremium, BTN_ROENTGEN)
        launchCalls = 0

        await roentgenBtn().click()
        // WinForm đi AdrStart (Neolink.dll) — cơ chế khác, cấu hình khác, chưa port.
        await expect(alertWithTitle('開発中')).toBeVisible({ timeout: 20000 })
        await expect(page.getByText(UNDER_DEVELOPMENT)).toBeVisible()
        expect(
            launchCalls,
            'TC-VENDOR-1 FAIL: mã 5 KHÔNG được gọi /v1/xray/launch — nó không dùng 画像編集ソフト',
        ).toBe(0)

        await closeDialogs(page)
        await step()
    })

    test('TC-VENDOR-2 — 連携先 6 (Trophy Windows): cũng 開発中, KHÔNG gọi agent', async () => {
        await openWithPicLink(PIC_LINK.trophy, BTN_ROENTGEN)
        launchCalls = 0

        await roentgenBtn().click()
        await expect(alertWithTitle('開発中')).toBeVisible({ timeout: 20000 })
        expect(launchCalls, 'TC-VENDOR-2 FAIL: mã 6 đi modPicture.pLinkTW, không phải EXE').toBe(0)

        await closeDialogs(page)
        await step()
    })

    // ═══ Đường lỗi ═══════════════════════════════════════════════════════════

    test('TC-OK-1 — agent trả 200: KHÔNG hiện hộp thoại nào', async () => {
        await openWithPicLink(PIC_LINK.np2NeoLink, BTN_ROENTGEN)
        launchOutcome = 'ok'
        launchReused = false

        const req = page.waitForRequest(
            (r) => XRAY_LAUNCH_URL.test(r.url()) && r.method() === 'POST',
            { timeout: 30000 },
        )
        await roentgenBtn().click()
        await req
        // Fire-and-forget như WinForm: chạy được thì im lặng, không toast không dialog.
        await page.waitForTimeout(1500)
        await expect(
            page.getByRole('alertdialog'),
            'TC-OK-1 FAIL: khởi chạy thành công mà vẫn báo gì đó',
        ).toHaveCount(0)
        await step()
    })

    test('TC-REUSE-1 — bấm lần hai VẪN gọi agent; SPA không tự chặn trùng', async () => {
        launchOutcome = 'ok'
        // Lần này agent báo nó chỉ dựng lại cửa sổ đang thu nhỏ chứ không mở tiến trình
        // mới. Việc quyết định trùng hay không là của agent — chỉ nó nhìn thấy cái gì
        // đang chạy, và trạng thái đó sống sót qua reload trang, thứ mà biến trong SPA
        // thì không. Nếu SPA tự chặn lần bấm thứ hai thì cửa sổ bị thu nhỏ sẽ không bao
        // giờ nổi lên lại.
        launchReused = true
        launchCalls = 0

        const req = page.waitForRequest(
            (r) => XRAY_LAUNCH_URL.test(r.url()) && r.method() === 'POST',
            { timeout: 30000 },
        )
        await roentgenBtn().click()
        await req

        expect(
            launchCalls,
            'TC-REUSE-1 FAIL: SPA nuốt lần bấm thứ hai — cửa sổ đã minimize sẽ không nổi lên',
        ).toBe(1)
        expect(lastLaunch!.patientId, 'lần bấm lại vẫn phải gửi đúng 患者番号').toBe(PAT_NO)
        // `reused` chỉ để ghi log / hỗ trợ khách hàng, không được đổi giao diện.
        await page.waitForTimeout(1500)
        await expect(
            page.getByRole('alertdialog'),
            'TC-REUSE-1 FAIL: reused=true mà lại bung hộp thoại',
        ).toHaveCount(0)
        await step()
    })

    test('TC-ERR-1 — chưa cấu hình 画像編集ソフト: báo ĐÚNG ô còn thiếu', async () => {
        launchOutcome = 'notConfigured'
        await roentgenBtn().click()

        const dialog = alertWithTitle(DIALOG_TITLE)
        await expect(dialog, `TC-ERR-1 FAIL: thiếu hộp thoại 「${DIALOG_TITLE}」`).toBeVisible({
            timeout: 20000,
        })
        // Nói rõ ô nào chứ không phải "khởi chạy thất bại" chung chung: đây là thứ
        // người dùng tự sửa được ở エージェント設定.
        await expect(dialog).toContainText('画像編集ソフトが設定されていません')
        await expect(dialog).toContainText('エージェント設定')

        await closeDialogs(page)
        await step()
    })

    test('TC-ERR-2 — khởi chạy hỏng: hiện KÈM nguyên văn lý do của agent', async () => {
        launchOutcome = 'failed'
        await roentgenBtn().click()

        const dialog = alertWithTitle(DIALOG_TITLE)
        await expect(dialog).toBeVisible({ timeout: 20000 })
        await expect(dialog).toContainText('レントゲンソフトの起動が出来ませんでした')
        // WinForm nối ex.Message dưới câu của nó (CoopRoentgen.cs:3981). Thiếu dòng
        // này thì người dùng chỉ biết "hỏng" mà không biết vì sao.
        await expect(
            dialog,
            'TC-ERR-2 FAIL: nuốt mất lý do agent trả về, đúng thứ WinForm luôn in ra',
        ).toContainText(LAUNCH_ERROR_DETAIL)

        await closeDialogs(page)
        await step()
    })

    // ═══ Nửa 画像 — nút và mnemonic Alt+P ════════════════════════════════════
    //
    // CHỈ giữ lại ở tầng browser những gì jsdom không chứng minh được: tiêu điểm
    // THẬT, và dây nối cấu hình agent → nút nào chiếm chỗ. Các mệnh đề thuần
    // listener (P trần không ăn, modal chặn phím, 全画面サブ画面 chặn phím, tập mã
    // {1,3,4} vs {5,6,12,15}) nằm ở
    //   apps/web-tenant/src/features/treatments/__tests__/category-tabs-gazou-access-key.test.tsx
    //   apps/web-tenant/src/features/treatments/lib/__tests__/pic-link-slot.test.ts
    // — mỗi lần nạp lại màn 診療入力 ở đây tốn tới 30s, không đáng để lặp lại chúng.
    //
    // ⚠️ Trước đây fkey-bar-common.spec.ts ghi 「KHÔNG có đường mở」 cho hộp thoại
    // 画像. Ghi chú đó đã lạc hậu: `CategoryTabs` tự đọc query ['agent','config'],
    // nên chỉ cần stub GET /v1/config trả linkCode 1 là nút hiện ra thật — đúng
    // những gì `openWithPicLink()` đang làm sẵn ở file này.

    test('TC-GAZOU-1 — 連携先 1: Alt+P và nút 画像(&P) cùng mở hộp thoại 画像取込', async () => {
        await openWithPicLink(PIC_LINK.gazou, BTN_GAZOU)

        // Gõ phím TRƯỚC khi click vào bất cứ đâu: ngay sau khi màn nạp xong, tiêu
        // điểm nằm ở ô <input> của 日計フッター. Access key của WinForm phân giải ở
        // TẦNG FORM nên vẫn phải ăn dù con trỏ đang trong ô nhập — chính là lý do
        // category-tabs truyền `allowAccessKeyInTextEntry: true` cho isWindowKeyBlocked,
        // và là thứ DUY NHẤT ở nhóm này mà unit test không kiểm được.
        await page.keyboard.press(ALT_GAZOU)
        await expect(
            gazouDialog(),
            'TC-GAZOU-1 FAIL: Alt+P không mở 画像取込. Nhãn nút in 「画像(&P)」 nên access ' +
                'key PHẢI có (frm203002.Designer.cs:2366) — kiểm `KeyP` trong actionsRef của ' +
                'category-tabs.tsx, và nhớ bắt theo e.code chứ không phải e.key.',
        ).toBeVisible({ timeout: 20000 })
        await closeDialogs(page)

        // Nút và mnemonic là HAI đường code riêng (onClick vs listener keydown trên
        // window) — kiểm cả hai trên CÙNG một lần nạp màn.
        await gazouBtn().click()
        await expect(
            gazouDialog(),
            'TC-GAZOU-1 FAIL: nút 画像 không mở hộp thoại — WinForm btnGazou_Click gọi ' +
                'formControl.showDialog(ID203024) (frm203002.cs:1096-1102)',
        ).toBeVisible({ timeout: 20000 })

        await closeDialogs(page)
        await step()
    })

    test('TC-GAZOU-2 — 連携先 12: Alt+P PHẢI câm (レントゲン đang chiếm chỗ)', async () => {
        await openWithPicLink(PIC_LINK.np2NeoLink, BTN_ROENTGEN)
        launchCalls = 0

        await page.keyboard.press(ALT_GAZOU)
        await page.waitForTimeout(KEY_SETTLE_MS)

        await expect(
            gazouDialog(),
            'TC-GAZOU-2 FAIL: Alt+P mở 画像取込 trong khi nút 画像 KHÔNG hiện. WinForm chỉ ' +
                'phân giải access key trên control đang hiện, và btnGazou_Click còn kiểm lại ' +
                'btnGazou.Visible (frm203002.cs:1098) — mnemonic phải gắn với showGazou.',
        ).toHaveCount(0)
        expect(
            launchCalls,
            'TC-GAZOU-2 FAIL: Alt+P chạy nhầm sang đường レントゲン — hai nửa dùng chung chỗ ' +
                'nhưng KHÔNG dùng chung phím; btnRoentgen vốn không có access key nào.',
        ).toBe(0)
        await step()
    })

    // ═══ Chạy THẬT ═══════════════════════════════════════════════════════════

    /**
     * Testcase DUY NHẤT không chặn request nào: dùng 連携先 và 画像編集ソフト THẬT
     * của máy đang chạy test, và agent sẽ THỰC SỰ khởi chạy chương trình đó.
     *
     * Vì thế cần cả Windows lẫn cờ. Chương trình bật lên sẽ nằm lại trên desktop —
     * người chạy tự đóng. Nên trỏ 画像編集ソフト vào thứ vô hại (notepad.exe) trước
     * khi bật cờ.
     */
    test('TC-REAL-1 — khởi chạy THẬT (chỉ khi TEST_ALLOW_LAUNCH=1)', async () => {
        test.skip(
            !AGENT_AVAILABLE,
            `cần agent (net48, chỉ Windows) — đang chạy trên ${process.platform}`,
        )
        skipWithReason(
            !ALLOW_LAUNCH,
            'sẽ CHẠY THẬT chương trình ngoài trên máy này — đặt TEST_ALLOW_LAUNCH=1 để chạy',
        )

        passthrough = true
        try {
            // Cấu hình thật quyết định nút nào hiện. Không hiện レントゲン nghĩa là máy
            // này đang đặt 連携先 khác 5/6/12/15 — nói thẳng thay vì đỏ ở chỗ khó hiểu.
            await page.goto(`/treatments/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            await closeDialogs(page)
            await expect(page.getByRole('button', { name: 'レセプト' })).toBeVisible({
                timeout: SCREEN_LOAD_TIMEOUT_MS,
            })

            if ((await roentgenBtn().count()) === 0) {
                console.log(
                    'SKIP — 連携先 của máy này không phải 5/6/12/15 nên không có nút レントゲン',
                )
                test.skip()
            }

            const res = page.waitForResponse(
                (r) => XRAY_LAUNCH_URL.test(r.url()) && r.request().method() === 'POST',
                { timeout: 60000 },
            )
            await roentgenBtn().click()
            const answer = await res
            const detail = answer.ok()
                ? ''
                : await answer.text().catch(() => '(không đọc được body)')
            expect(
                answer.status(),
                `agent TỪ CHỐI khởi chạy — ${answer.status()}: ${detail}`,
            ).toBeLessThan(300)
        } finally {
            passthrough = false
        }
        await step()
    })
})
