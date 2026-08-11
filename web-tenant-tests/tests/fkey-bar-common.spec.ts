/**
 * F-key bar — kiểm HÌNH DẠNG nút F-key của các dialog màn 診療入力 (INP).
 *
 * ─── SPEC NÀY ĐƯỢC VIẾT ĐỂ ĐỎ ────────────────────────────────────────────────
 * Mục đích là NHÌN THẤY chỗ đang sai, không phải để xanh. Ở thời điểm viết, phần
 * lớn dialog INP tự dựng nút F-key bằng tay thay vì dùng component chung
 * `<FKeyBar>`, nên testcase 「TỔNG KẾT」 ở cuối file CHẮC CHẮN ĐỎ và liệt kê đầy
 * đủ từng dialog sai. Sửa xong dialog nào thì nó tự rời khỏi danh sách đỏ.
 *
 * ─── Chuẩn ĐÚNG ──────────────────────────────────────────────────────────────
 * `apps/web-tenant/src/shared/components/fkey/fkey-bar.tsx` (renderCell :186-203)
 * dựng mỗi phím thành `<button data-fkey="F9" class="fkey-btn">` chứa 2 span (số
 * F / nhãn). `.fkey-btn` (styles.css:173) là `flex-direction: column`,
 * `height: 2.5rem` → nút HAI DÒNG. Dialog mẫu đúng: 入金指定
 * (`payment-designation-dialog.tsx:400`).
 *
 * Dialog SAI tự viết `<Button>F9 確定</Button>` — `buttonVariants`
 * (shared/ui/button-variants.ts:9) là `inline-flex` hàng ngang → nút MỘT DÒNG.
 * Ví dụ điển hình: ガイド処置選択 (`guide-selection-dialog.tsx:427-440`).
 *
 * Ba mức kết luận (xem `fkey-audit.ts`):
 *   ✅ OK          nút có `data-fkey` → do FKeyBar dựng. Đây là đích.
 *   ⚠️  HAND_2LINE  code tay nhưng đã `flex-col` → NHÌN đúng, chưa dùng component chung.
 *   ❌ HAND_1LINE  code tay và nằm ngang → đúng lỗi hiển thị đang cần sửa.
 *
 * ─── Vì sao KHÔNG assert trong từng testcase dialog ──────────────────────────
 * File chạy `mode: 'serial'` (bắt buộc: app giới hạn ~10 login/khung thời gian —
 * GUIDELINE Rule 10.1 — nên cả file dùng CHUNG một page, login một lần). Trong
 * serial, một testcase đỏ sẽ SKIP toàn bộ testcase sau nó, tức chỉ nhìn thấy
 * dialog sai ĐẦU TIÊN — đúng thứ không muốn.
 *
 * Vì vậy mỗi testcase dialog chỉ MỞ → SOI → GHI vào `results` → ĐÓNG, và KHÔNG
 * BAO GIỜ ném lỗi (mở không được thì ghi 'UNREACHABLE' kèm lý do). Toàn bộ phán
 * quyết dồn vào testcase cuối 「TỔNG KẾT」: in bảng đầy đủ rồi `expect.soft` hai
 * lần (một cho nhóm ❌, một cho nhóm ⚠️) để cả hai cùng hiện trong báo cáo lỗi.
 *
 * Theo dõi lúc chạy: mỗi dialog in ngay một dòng ✅/⚠️/❌ ra stdout.
 *
 * ─── Nguồn thao tác mở dialog (đọc từ source app) ────────────────────────────
 * Màn 患者選択 `/treatments` (`treatment-entry-page.tsx`, FKeyBar :430):
 *   · F3  当月来患 → setUnvisitedTotalOpen  (:228)  → unvisited-total-dialog
 *   · F11 設定     → setTreatmentEntrySettingOpen (:269) → treatment-entry-setting-dialog
 *     (⚠️ F11 của màn DETAIL là menu 「選択」, không phải 設定 — hai màn khác nhau)
 *
 * Màn 診療入力 detail `/treatments/{patNo}` (`treatment-entry-detail.tsx`, FKeyBar :4752):
 *   · Nút 「M」/「P」/「I」/「T」 trên dải 患者情報 (`patient-info-header.tsx:152-183`)
 *       M → 申し送り事項 (:4566) · P → 歯周情報 (:4567) · I → 患者注意情報 (:4569)
 *       T → 治療情報 (:4568)
 *   · 申し送り事項 → F2 編集      → 申し送り事項登録 (`handover-dialog.tsx:221`)
 *   · 歯周情報     → F2 P履歴     → 歯周疾患治療履歴 (`periodontal-info-dialog.tsx:410`)
 *   · Nút 「歯管」 trên CategoryTabs (`category-tabs.tsx:115`) → 歯科疾患管理
 *   · F6 コメント → summary-column-entry mode 'karte'   (:1775)
 *   · F7 摘要     → summary-column-entry mode 'summary' (:1779) — footer KHÁC F6
 *   · Shift+F6 薬剤 (lớp ON) → 薬剤選択 (:1785)
 *   · F11 選択 → RowContextMenu (role=menu) → hover 「9 オプション」 →
 *       「1 チェック項目設定」 (:1318) · 「Step」 (:1333, mục cuối, KHÔNG có số dẫn)
 *   · F4 ガイド → side panel tab ガイド, chốt 1 dòng → ガイド処置選択 (frm203017)
 *   · F5 パック → side panel tab パック, chốt 1 dòng → パック処置選択 (frm203014)
 *
 * ─── Dialog CỐ TÌNH không kiểm ở đây ─────────────────────────────────────────
 * Ghi thẳng vào `results` là 'UNREACHABLE' kèm lý do (xem `SKIPPED` bên dưới) để
 * bảng tổng kết không im lặng bỏ sót. Lý do chung: mở chúng đòi GÕ MÃ 処置 vào
 * lưới hoặc chạy chuỗi 会計 — đều làm bẩn trạng thái màn hình của các testcase
 * sau, hoặc chạm nhánh ghi DB.
 *
 * ─── Bẫy đã biết, ĐỪNG lặp lại ───────────────────────────────────────────────
 *  · TUYỆT ĐỐI KHÔNG đóng dialog bằng Escape: frm203017 map Escape ⇒ btnF9_Click
 *    (確定) và web bê nguyên → Escape là GHI DATA (GUIDELINE Rule 10.4). Ở đây
 *    luôn đóng bằng nút × (`aria-label="閉じる"`, draggable-dialog.tsx:225) vì nó
 *    gọi `onClose` = nhánh 戻る, hoặc bằng phím F10.
 *  · Không click nút 「F10 戻る」: màn nền cũng có nút cùng tên nằm dưới modal
 *    (Rule 10.3) → click treo 15s rồi timeout.
 *  · SanteiConfirmDialog 「〜を算定しますか？」 bung ra không đoán trước được và nuốt
 *    mọi click → `addLocatorHandler` bấm 「No」 (Rule 14 + 14.1: bấm 「Yes」 lại kéo
 *    theo dialog カルテ記載選択, đổi popup này lấy popup khác).
 *  · Mọi locator nút F-key phải bó TRONG dialog đang mở, không bao giờ ở cấp page.
 *
 * ─── Ảnh chụp để soi bằng mắt ────────────────────────────────────────────────
 * Mỗi dialog mở được cho ra ĐÚNG MỘT ảnh toàn màn hình vào `fkey-shots/` (đổi
 * bằng env TEST_FKEY_SHOT_DIR), có KHOANH ĐỎ vùng F-key để nhận ra ngay. Tên file
 * mang sẵn kết luận — `07-sai-handover-dialog.png` — nên mở thư mục ra là thấy
 * cái nào hỏng. Kèm `index.html` gom tất cả, nhóm theo ✅/⚠️/❌, cộng ảnh của hai
 * màn hình làm mốc đối chiếu.
 *
 * Thư mục bị XOÁ và tạo lại ở `beforeAll`: trộn ảnh của hai lần chạy thì trang
 * index không còn tin được nữa. Nó nằm ngoài `test-results/` (Playwright tự dọn
 * thư mục đó) nên ảnh còn nguyên sau khi chạy xong.
 *
 * Chụp ảnh KHÔNG BAO GIỜ làm hỏng kết luận: lỗi chụp chỉ ghi vào `note` rồi đi
 * tiếp — ảnh là thứ soi thêm, không phải nguồn phán quyết.
 *
 * Chạy CẢ FILE (đừng `-g` chạy lẻ: các testcase nối tiếp trạng thái màn hình, và
 * 「TỔNG KẾT」 cần `results` do những testcase trước điền vào):
 *   cd /Users/thinhnn/Documents/GitHub/TestLocalApp/TestLocal/web-tenant-tests
 *   npx playwright test tests/fkey-bar-common.spec.ts --reporter=list
 *   open fkey-shots/index.html
 */
import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    auditFKeyButtons,
    captureShots,
    formatLine,
    formatReport,
    resetShotDir,
    worstVerdict,
    writeContactSheet,
    type FKeyAuditResult,
} from './fkey-audit'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
/** Để trống → app lấy ngày hôm nay (WinForm chặn thao tác trên tháng khác). */
const TRT_DT = process.env.TEST_TRT_DT ?? ''

/** Số dòng side panel tối đa sẽ dò khi tìm một dòng mở được picker. */
const SCAN_LIMIT = 8

/**
 * Thư mục chứa ảnh chụp từng dialog + `index.html` để soi bằng mắt.
 *
 * Nằm NGOÀI `test-results/` (Playwright tự xoá thư mục đó mỗi lần chạy) nên ảnh
 * còn nguyên sau khi chạy xong. Bị xoá và tạo lại ở `beforeAll` — trộn ảnh của
 * hai lần chạy thì bảng index.html không còn tin được.
 */
const SHOT_DIR = process.env.TEST_FKEY_SHOT_DIR ?? 'fkey-shots'

/**
 * Dialog cố tình KHÔNG kiểm bằng E2E ở file này — vẫn liệt kê để bảng tổng kết
 * phản ánh đúng phạm vi đã phủ. Kết luận tĩnh (đọc source) ghi trong `note`.
 */
const SKIPPED: ReadonlyArray<{ name: string; file: string; note: string }> = [
    {
        name: '入金指定 (F8 会計)',
        file: 'payment-designation-dialog.tsx',
        note:
            'nằm sâu trong chuỗi 会計 (insertMode=full + accConfig.receRcvFlg=1) và chạm nhánh ' +
            'ghi — đọc source thì nó ĐÃ dùng <FKeyBar> (:400), chính là dialog mẫu đúng',
    },
    {
        name: '処置選択 (nhiều 枝番)',
        file: 'treatment-selection-dialog.tsx',
        note: 'phải gõ mã 処置 fan-out ≥2 枝番 vào ô 点 của lưới — làm bẩn lưới của testcase sau',
    },
    {
        name: '処置選択 自費金額',
        file: 'self-pay-amount-dialog.tsx',
        note: 'cần gõ trt_cd 17 ở コードモード vào lưới',
    },
    {
        name: '処置選択 分割抜歯',
        file: 'split-extraction-dialog.tsx',
        note: 'cần chốt 処置 trt_cd 179 / trt_sb 5 từ picker hoặc tab 個別',
    },
    {
        name: '処置選択 IS 使用量',
        file: 'is-input-dialog.tsx',
        note: 'cần trt_cd 50/202/203 và cờ inpConfig.isAutoFlg = 1',
    },
    {
        name: '履歴情報',
        file: 'rireki-list-dialog.tsx',
        note: 'thuộc màn 口腔内情報 (F11 → 6 口腔内情報 → F5 履歴 → click răng), không thuộc 診療入力',
    },
    {
        name: '画像',
        file: 'image-dialog.tsx',
        note:
            'KHÔNG có đường mở: nút 画像 chỉ render khi picLinkMode ∈ {1,3,4} nhưng ' +
            'treatment-entry-detail.tsx không hề truyền prop picLinkMode cho <CategoryTabs>',
    },
]

/**
 * Kết quả soi của TỪNG dialog, do các testcase phía trên điền vào và 「TỔNG KẾT」
 * đọc ra. Biến module-level là cách duy nhất chia dữ liệu giữa các testcase
 * trong một describe `serial`.
 */
const results: FKeyAuditResult[] = []

test.describe.configure({ mode: 'serial' })

test.describe('F-key bar — dialog INP phải dùng <FKeyBar> chung', () => {
    let page: Page
    let step: () => Promise<void>
    /** Số thứ tự ảnh — cho tên file sắp đúng thứ tự các dialog được mở. */
    let shotSeq = 0

    /**
     * Dialog ĐANG Ở TRÊN CÙNG. Dùng `.last()` thay vì lọc theo text vì:
     *  - title bị giãn chữ (「診 療 入 力 設 定」) nên không match được (Rule 13.1);
     *  - mỗi testcase chỉ mở đúng một nhánh rồi `closeAllDialogs()` dọn sạch, nên
     *    dialog cuối cùng luôn là cái vừa mở — kể cả các ca lồng 2 tầng (M → F2).
     */
    const topDialog = () => page.getByRole('dialog').last()

    /**
     * Nút chữ đơn 「M」/「P」/「I」/「T」 trên dải 患者情報 (patient-info-header.tsx:152).
     * `exact` để không dính các nút có chữ M/P/I/T bên trong nhãn dài hơn.
     */
    const headerMark = (k: 'M' | 'P' | 'I' | 'T') =>
        page.getByRole('button', { name: k, exact: true }).first()

    /**
     * Đóng mọi dialog đang mở bằng nút × của chính nó.
     *
     * × gọi `onClose` — ở mọi dialog INP đây là nhánh 戻る/huỷ, KHÔNG phải 確定,
     * nên an toàn kể cả với frm203017 (nơi Escape lại là 確定). Lặp 3 vòng cho các
     * dialog lồng nhau (申し送り事項 → 申し送り事項登録, 歯周情報 → Ｐ履歴).
     */
    async function closeAllDialogs() {
        for (let i = 0; i < 3; i++) {
            const open = page.getByRole('dialog')
            if ((await open.count()) === 0) return
            const target = open.last()
            const x = target.getByRole('button', { name: '閉じる' })
            if (await x.count()) {
                await x.first().click({ timeout: 5000 }).catch(() => {})
            } else {
                // Dialog Radix không mang nút × có aria-label 閉じる → rơi về F10
                // (戻る ở tất cả dialog INP). Vẫn tuyệt đối không dùng Escape.
                await page.keyboard.press('F10').catch(() => {})
            }
            await target.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
        }
    }

    /**
     * Dọn AgentOfflineDialog 「エージェントが起動していません」 nếu nó bung ra.
     *
     * Nó CŨNG mang role="dialog" và nổi ĐÈ lên dialog vừa mở, nên `topDialog()`
     * sẽ bắt trúng nó — lần chạy đầu đã vì thế mà báo nhầm 診療入力設定 là "không
     * có nút F-key nào". Nó chỉ bung khi agent Windows không chạy; máy có agent
     * thì nhánh này không bao giờ chạy tới.
     */
    async function dismissAgentOffline() {
        const offline = page.getByRole('dialog').filter({ hasText: 'エージェントが起動していません' })
        if (!(await offline.isVisible({ timeout: 3000 }).catch(() => false))) return
        await offline.getByRole('button', { name: 'キャンセル' }).click().catch(() => {})
        await offline.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
    }

    /** Dọn alert/confirm (role=alertdialog) — overlay của nó chặn mọi click sau đó. */
    async function dismissAlerts() {
        for (let i = 0; i < 3; i++) {
            const alert = page.getByRole('alertdialog')
            if ((await alert.count()) === 0) return
            const btn = alert.last().getByRole('button', { name: /^(OK|No|いいえ|キャンセル)$/ })
            if ((await btn.count()) === 0) return
            await btn.first().click({ timeout: 5000 }).catch(() => {})
            await alert.last().waitFor({ state: 'hidden', timeout: 8000 }).catch(() => {})
        }
    }

    /**
     * Mở → soi → ghi → đóng MỘT dialog. KHÔNG BAO GIỜ ném lỗi.
     *
     * Nuốt lỗi là CỐ Ý: file chạy serial, một testcase đỏ sẽ skip toàn bộ phần còn
     * lại và ta mất luôn bảng tổng kết. Mở không được thì ghi 'UNREACHABLE' kèm
     * dòng `Error:` đầu tiên để còn biết vì sao.
     */
    async function audit(name: string, file: string, open: () => Promise<Locator>): Promise<void> {
        const r: FKeyAuditResult = { name, file, buttons: [], verdict: 'UNREACHABLE' }
        try {
            await dismissAlerts()
            await dismissAgentOffline()
            await closeAllDialogs()
            const dlg = await open()
            await expect(dlg).toBeVisible({ timeout: 20000 })
            r.buttons = await auditFKeyButtons(dlg)
            r.verdict = worstVerdict(r.buttons)
            // Chụp SAU khi đã có verdict: tên file mang luôn kết luận
            // (`03-sai-handover-dialog-dialog.png`) nên mở thư mục ra là thấy ngay
            // cái nào hỏng, không cần đối chiếu với log.
            await captureShots(page, dlg, r, SHOT_DIR, ++shotSeq)
            await step()
        } catch (e) {
            // Chỉ giữ dòng đầu của message: message của Playwright dài hàng chục
            // dòng (kèm call log) sẽ làm bảng tổng kết không đọc được.
            r.note = (String((e as Error).message).split('\n')[0] ?? '').slice(0, 140)
        } finally {
            await closeAllDialogs().catch(() => {})
            await dismissAlerts().catch(() => {})
        }
        results.push(r)
        console.log(formatLine(r))
    }

    /** Soi dải F-key của CHÍNH màn hình (không phải dialog) — dùng làm đối chứng. */
    async function auditScreenBar(label: string, source: string) {
        const bar = await auditFKeyButtons(page.locator('body'))
        expect(bar.length, `${label}: không tìm thấy nút F-key nào`).toBeGreaterThan(0)
        // Đây là mốc đối chứng: nếu chính dòng này đỏ thì `data-fkey` không còn là
        // dấu hiệu tin được nữa và MỌI kết luận phía dưới đều vô nghĩa.
        expect(
            bar.filter((b) => !b.fromFKeyBar).map((b) => b.text),
            `${label} dùng <FKeyBar> (${source}) nên MỌI nút F phải có data-fkey`,
        ).toEqual([])
        console.log(`đối chứng: ${label} — ${bar.length} nút F-key, tất cả từ FKeyBar`)

        // Chụp luôn làm ẢNH THAM CHIẾU: đây là dải F-key chuẩn của app, để đối
        // chiếu bằng mắt với ảnh của từng dialog trong cùng thư mục.
        const ref: FKeyAuditResult = { name: `${label} (dải F-key màn hình)`, file: source, buttons: bar, verdict: 'OK' }
        await captureShots(page, page.locator('body'), ref, SHOT_DIR, ++shotSeq)
        results.push(ref)
    }

    test.beforeAll(async ({ browser }) => {
        await resetShotDir(SHOT_DIR)

        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() KHÔNG kế thừa `use` của config → phải truyền tay
        // ignoreHTTPSErrors (miền *.ochacom.local dùng cert tự ký) + baseURL.
        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)

        // Rule 14 — SanteiConfirmDialog đến bất chợt và nuốt click. Bấm 「No」:
        // 「Yes」 算定 xong lại mở カルテ記載選択, đổi popup này lấy popup khác.
        await page.addLocatorHandler(
            page.getByText(/を算定しますか？/).first(),
            async () => {
                await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
            },
            { times: 40 },
        )

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ═══════════════════════════════════════════════════════════════════════
    // PHẦN 1 — màn 患者選択 `/treatments`.
    // Chạy TRƯỚC màn detail: quay ngược lại vừa tốn điều hướng vừa dễ vướng hộp
    // thoại 「処置データは変更されています」 khi lưới đã bị đụng vào.
    // ═══════════════════════════════════════════════════════════════════════

    test('đối chứng — dải F-key của màn 患者選択 do FKeyBar dựng', async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
        // Strip F-key dựng xong = màn danh sách sẵn sàng nhận phím.
        await expect(page.locator('[data-fkey="F11"]')).toBeVisible({ timeout: 60000 })
        await auditScreenBar('màn 患者選択', 'treatment-entry-page.tsx:430')
        await step()
    })

    test('F11 設定 → 診療入力設定 (frm203035)', async () => {
        await audit('診療入力設定 (F11 設定)', 'treatment-entry-setting-dialog.tsx', async () => {
            await page.keyboard.press('F11')
            await dismissAgentOffline()
            // Bó theo text trong BODY chứ không `.last()`: nếu AgentOfflineDialog
            // bung lại sau cú dọn thì `.last()` lại trúng nó. 「表示設定」 là tiêu đề
            // nhóm của tab đầu (treatment-entry-setting-dialog.tsx:165) — title thì
            // không dùng được vì bị giãn chữ 「診 療 入 力 設 定」 (Rule 13.1).
            return page.getByRole('dialog').filter({ hasText: '表示設定' })
        })
    })

    test('F3 当月来患 → 来患集計 (frm203046)', async () => {
        await audit('来患集計 (F3 当月来患)', 'unvisited-total-dialog.tsx', async () => {
            await page.keyboard.press('F3')
            return topDialog()
        })
    })

    // ═══════════════════════════════════════════════════════════════════════
    // PHẦN 2 — màn 診療入力 detail `/treatments/{patNo}`.
    // Thứ tự: các dialog CHỈ ĐỌC (M/P/I/T, 歯管) trước, rồi tới nhóm đụng vào
    // lưới / side panel (F6/F7, F4/F5) để hạn chế trạng thái rớt sang nhau.
    // ═══════════════════════════════════════════════════════════════════════

    test('đối chứng — dải F-key của màn 診療入力 detail do FKeyBar dựng', async () => {
        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        // Session rụng thì app đá về /login và 「合計:」 không bao giờ hiện → chờ đủ
        // 60s rồi mới báo "not found", che mất nguyên nhân thật. Soi URL trước.
        await expect(page, 'vào màn 診療入力 mà bị đá đi nơi khác (mất session?)').toHaveURL(
            /\/treatments\//,
            { timeout: 15000 },
        )
        // Header 患者情報 render 「合計:」 khi màn detail đã dựng xong.
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
        await auditScreenBar('màn 診療入力 detail', 'treatment-entry-detail.tsx:4752')
        await step()
    })

    test('nút 「M」 → 申し送り事項', async () => {
        await audit('申し送り事項 (nút M)', 'handover-dialog.tsx', async () => {
            await headerMark('M').click()
            return topDialog()
        })
    })

    test('nút 「M」 → F2 編集 → 申し送り事項登録', async () => {
        await audit('申し送り事項登録 (M → F2 編集)', 'handover-template-dialog.tsx', async () => {
            await headerMark('M').click()
            await expect(topDialog()).toBeVisible({ timeout: 20000 })
            // F2 do CHÍNH dialog 申し送り事項 đăng ký (handover-dialog.tsx:221) — nó là
            // scope topmost nên dải F-key của màn nền không cướp phím.
            await page.keyboard.press('F2')
            // 2 dialog cùng mở → `.last()` là cái con vừa bung.
            await expect(page.getByRole('dialog')).toHaveCount(2, { timeout: 20000 })
            return topDialog()
        })
    })

    test('nút 「P」 → 歯周情報', async () => {
        await audit('歯周情報 (nút P)', 'periodontal-info-dialog.tsx', async () => {
            await headerMark('P').click()
            return topDialog()
        })
    })

    test('nút 「P」 → F2 P履歴 → 歯周疾患治療履歴 (frm203033)', async () => {
        await audit('歯周疾患治療履歴 (P → F2)', 'periodontal-history-dialog.tsx', async () => {
            await headerMark('P').click()
            await expect(topDialog()).toBeVisible({ timeout: 20000 })
            await page.keyboard.press('F2')
            await expect(page.getByRole('dialog')).toHaveCount(2, { timeout: 20000 })
            return topDialog()
        })
    })

    test('nút 「I」 → 患者注意情報 (frm203047)', async () => {
        await audit('患者注意情報 (nút I)', 'patient-notice-dialog.tsx', async () => {
            await headerMark('I').click()
            return topDialog()
        })
    })

    test('nút 「T」 → 治療情報', async () => {
        await audit('治療情報 (nút T)', 'treatment-info-dialog.tsx', async () => {
            await headerMark('T').click()
            return topDialog()
        })
    })

    test('nút 「歯管」 → 歯科疾患管理 (đối chứng: dialog ĐÃ dùng FKeyBar)', async () => {
        await audit('歯科疾患管理 (nút 歯管)', 'dental-disease-management-dialog.tsx', async () => {
            await page.getByRole('button', { name: '歯管', exact: true }).click()
            return topDialog()
        })
    })

    test('F6 コメント → カルテ記載選択 (frm203012)', async () => {
        await audit('カルテ記載選択 (F6)', 'summary-column-entry-dialog.tsx [karte]', async () => {
            await page.keyboard.press('F6')
            return topDialog()
        })
    })

    test('F7 摘要 → 摘要欄記載選択 (frm203011) — footer khác F6', async () => {
        await audit('摘要欄記載選択 (F7)', 'summary-column-entry-dialog.tsx [summary]', async () => {
            await page.keyboard.press('F7')
            return topDialog()
        })
    })

    test('Shift+F6 薬剤 → 薬剤選択 (frm203013)', async () => {
        await audit('薬剤選択 (Shift+F6)', 'medicine-selection-dialog.tsx', async () => {
            // Lớp ON của FKeyBar: giữ Shift là đủ, không cần bật nút ON/OFF.
            await page.keyboard.press('Shift+F6')
            return topDialog()
        })
    })

    test('F11 選択 → 9 オプション → 1 チェック項目設定', async () => {
        await audit(
            'チェック項目設定 (F11 → 9 オプション)',
            'check-item-setting-dialog.tsx',
            async () => {
                await openOptionSubmenu()
                await clickMenuItem('1 チェック項目設定')
                return topDialog()
            },
        )
    })

    test('F11 選択 → 9 オプション → Step → Step編集', async () => {
        await audit('Step編集 (F11 → 9 オプション → Step)', 'step-edit-dialog.tsx', async () => {
            await openOptionSubmenu()
            // Mục cuối submenu, KHÔNG có số dẫn đầu nên phím tắt số không tới được.
            await clickMenuItem('Step')
            return topDialog()
        })
    })

    /** F11 → hover 「9 オプション」. Submenu mở bằng HOVER; click sẽ TOGGLE nên đừng click. */
    async function openOptionSubmenu() {
        await page.keyboard.press('F11')
        // RowContextMenu là role="menu", KHÔNG phải dialog.
        const menu = page.getByRole('menu').filter({ hasText: '1 メニュー' })
        await expect(menu).toBeVisible({ timeout: 15000 })
        await menu.getByRole('button', { name: '9 オプション' }).hover()
    }

    /** Click một mục submenu đã bung (`div[data-submenu]` chỉ visible sau khi đo xong). */
    async function clickMenuItem(label: string) {
        const item = page.getByRole('button', { name: label, exact: true })
        await item.waitFor({ state: 'visible', timeout: 10000 })
        await item.click()
    }

    test('F4 ガイド → chốt 1 dòng → ガイド処置選択 (frm203017)', async () => {
        await audit('ガイド処置選択 (F4 → ガイド)', 'guide-selection-dialog.tsx', async () => {
            await page.keyboard.press('F4')
            const rows = sidePanelRows(40)
            await expect(rows.first()).toBeVisible({ timeout: 30000 })
            // Tab ガイド: CLICK ĐƠN đã tương đương Enter (frm203002.cs:6570).
            return pickUntilOpens(rows, 'ガイド番号', '算定できる処置がありません', 'ガイド', false)
        })
    })

    test('F5 パック → chốt 1 dòng → パック処置選択 (frm203014)', async () => {
        await audit('パック処置選択 (F5 → パック)', 'pack-selection-dialog.tsx', async () => {
            await page.keyboard.press('F5')
            const rows = sidePanelRows(35)
            await expect(rows.first()).toBeVisible({ timeout: 30000 })
            // Tab パック đòi DOUBLE-click (khác tab ガイド) — frm203002 パックタブ系.
            return pickUntilOpens(rows, 'パック番号', '算定可能な処置はありません', 'パック', true)
        })
    })

    /**
     * Dòng dữ liệu của side panel. Tab ガイド dùng lưới `40px`, tab パック dùng `35px`
     * — chính con số này là dấu hiệu đã sang đúng tab. Kèm `cursor-pointer` để loại
     * dòng header (header dùng cùng grid-cols nhưng không có class đó).
     */
    function sidePanelRows(gridPx: 35 | 40): Locator {
        const sidePanel = page.locator('div[class*="w-[450px]"]').first()
        return sidePanel.locator(
            `div[class*="grid-cols-[${gridPx}px_1fr]"][class*="cursor-pointer"]`,
        )
    }

    /**
     * Chốt lần lượt từng dòng cho tới khi picker THỰC SỰ mở, rồi trả về locator của nó.
     *
     * Một ガイド/パック không có 処置 nào tính được sẽ làm dialog TỰ ĐÓNG kèm alert
     * (frm203017.cs:1001-1017) → phải dò tiếp. Và mốc chờ phải là DÒNG 処置 bên
     * trong picker, KHÔNG phải bản thân picker: picker vẫn bung ra trong lúc query
     * chạy rồi mới tắt, chờ nó sẽ luôn khớp cửa sổ loading và bỏ lọt nhánh rỗng —
     * tệ hơn là để lại alert chưa đóng, overlay của nó chặn click của testcase sau.
     */
    async function pickUntilOpens(
        rows: Locator,
        bodyMark: string,
        emptyAlert: string,
        tabName: string,
        useDoubleClick: boolean,
    ): Promise<Locator> {
        const picker = page.getByRole('dialog').filter({ hasText: bodyMark })
        const noTrt = page.getByText(emptyAlert)
        const total = Math.min(await rows.count(), SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            if (useDoubleClick) await rows.nth(i).dblclick()
            else await rows.nth(i).click()
            await expect(picker.getByTestId('cell-trtNm').first().or(noTrt)).toBeVisible({
                timeout: 30000,
            })
            if ((await noTrt.count()) === 0) return picker
            await dismissAlerts()
        }
        throw new Error(`${total} dòng ${tabName} đầu đều không mở được picker`)
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TỔNG KẾT — chỗ DUY NHẤT được phép đỏ.
    // ═══════════════════════════════════════════════════════════════════════

    test('TỔNG KẾT — mọi nút F-key của dialog INP phải do <FKeyBar> dựng', async () => {
        for (const s of SKIPPED) results.push({ ...s, buttons: [], verdict: 'UNREACHABLE' })
        console.log(formatReport(results))

        // Trang xem ảnh — in đường dẫn TUYỆT ĐỐI để mở thẳng từ terminal.
        const sheet = await writeContactSheet(SHOT_DIR, results)
        const abs = (await import('node:path')).resolve(sheet)
        console.log(`\nẢnh chụp từng dialog: ${(await import('node:path')).resolve(SHOT_DIR)}`)
        console.log(`Mở trang tổng hợp:    open "${abs}"\n`)

        const oneLine = results.filter((r) => r.verdict === 'HAND_1LINE')
        const handMade = results.filter((r) => r.verdict === 'HAND_2LINE')
        const unreachable = results.filter((r) => r.verdict === 'UNREACHABLE')

        // In riêng phần chưa kiểm được: nó KHÔNG đánh đỏ (có thể chỉ do dữ liệu
        // tenant), nhưng im lặng thì dễ tưởng nhầm là đã kiểm và đạt.
        for (const r of unreachable) {
            console.log(`CHƯA KIỂM ĐƯỢC — ${r.name} (${r.file}): ${r.note ?? 'không rõ'}`)
        }

        // Hai assert MỀM để cả hai nhóm cùng hiện trong báo cáo lỗi; dùng assert
        // cứng thì nhóm thứ hai không bao giờ được in ra.
        expect
            .soft(
                oneLine.map((r) => `${r.name} → ${r.file}`),
                'Các dialog dưới đây vẽ nút F-key NẰM NGANG một dòng (「F9 確定」). Chuẩn là ' +
                    '<FKeyBar>: nút hai dòng, số F trên nhãn dưới, như 入金指定 ' +
                    '(payment-designation-dialog.tsx:400). Cách sửa: bỏ khối <Button> tự viết ' +
                    'trong prop `footer`, thay bằng <FKeyBar base={fKeys} /> VÀ bỏ prop `fKeys` ' +
                    'của DraggableDialog — bar tự đăng ký scope (draggable-dialog.tsx:106-115, ' +
                    'ghi chú ở restorative-management-dialog.tsx:627-629).',
            )
            .toEqual([])

        expect
            .soft(
                handMade.map((r) => `${r.name} → ${r.file}`),
                'Các dialog dưới đây NHÌN đúng (nút hai dòng) nhưng vẫn tự dựng bằng <Button> + ' +
                    '<span>, không qua <FKeyBar>. Chuyển sang component chung KHÔNG đổi giao diện, ' +
                    'chỉ gom về một chỗ (và nhận isTopmost / disabled / lớp Shift miễn phí).',
            )
            .toEqual([])
    })
})
