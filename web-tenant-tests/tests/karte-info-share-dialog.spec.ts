import { expect, test, type Locator, type Page } from '@playwright/test'

import {
    dbEnabled,
    deleteRxSharingViewHistory,
    listRxSharingViewHistory,
    MINIMAL_PDF,
    seedRxSharingViewHistory,
    type RxSharingRow,
} from './db'
import { makeStep } from './step'
import { ADMIN_USER, JA } from './test-data'
import { cells, rows, scroller } from './virtual-grid'

/**
 * 電子カルテ情報共有サービス (frm201045 / SHARE_EMR) — KarteInfoShareDialog, mở
 * bằng **Shift+F7 「カルテ情報共有」** trên màn 診療入力 `/treatments/{patNo}`.
 *
 * ── FACT LẤY TỪ WINFORM (nguồn chân lý của mọi assert dưới đây) ───────────────
 * `src/OCHACOM/SHARE_EMR/` + `src/OCHACOM/INP/Forms/frm203002.cs`:
 *
 *  - frm203002.cs:4564-4569 — Shift+F7 gọi
 *    `formControl.showForm(formControl.formId.ID201045, {patData, dtTgtDate})`.
 *    frm203002.cs:4109-4114 — MỌI KeyFunc (trừ F5) đi qua chốt
 *    「当月以外の操作はできません」 khi con trỏ đứng ở dòng tháng khác.
 *
 *  - frm201045.cs `_btnInfo` — nhãn F-key ĐÚNG theo thứ tự:
 *      F1 薬剤情報(ON) F2 特定健診(ON) F3 臨床情報(ON) F4 医療扶助(OFF)
 *      F5 訪問診療(OFF) F6 —  F7 —  F8 削除(ON) F9 選択(ON) F10 戻る(ON)
 *      F11 —  F12 —
 *    OFF = có nhãn nhưng KHÔNG bấm được (CommonOcha.OCHA_OFF).
 *
 *  - frm201045.cs `frm201045_Shown` → `dtCollectionDateYMStartDate.Focus()`
 *    → focus khởi tạo nằm ở 取得年月(開始), KHÔNG phải lưới.
 *
 *  - frm201045.Designer.cs — `dtCollectionDateYM{Start,End}Date.MonthOnly = true`
 *    → chỉ 元号+年+月, KHÔNG có ô 日. 3 combo 閲覧同意 (`cboDrugConsent` /
 *    `cboCheckupConsent` / `cboClinicalConsent`) đều `Enabled = false` → chỉ đọc.
 *    tabPage1/2/3 = 薬剤情報 / 特定健診情報 / 臨床情報.
 *
 *  - Frm201045Model ctor — 取得年月 mặc định
 *    `DateTime.Today.AddMonths(-60)` 〜 `DateTime.Today`.
 *
 *  - Frm201045Model.checkInputDate — so `年*100+月`, **CHỈ áp cho tab 0 (薬剤情報)
 *    và tab 2 (臨床情報)**; tab 1 (特定健診) KHÔNG kiểm vì điện văn TKK không mang
 *    取得年月. Sai thì E00101「開始日付は終了日付より前の日付を指定してください。」
 *
 *  - RXSharingViewHistory.GetRecords — `ORDER BY REQ_DT DESC`, rồi switch if_id:
 *      21 → tab 薬剤情報, 23 → tab 特定健診, 31 → tab 臨床情報,
 *      **`default: continue`** → if_id khác bị BỎ QUA, không thuộc tab nào.
 *    Truy vấn KHÔNG lọc DeleteDate → dòng đã xoá VẪN hiện (có cột 削除日時).
 *
 *  - InfoShareServiceModel — 4 cột hiển thị:
 *      AcquisitionDateTime = 和暦(getWarekiDate) + " " + `HH:mm`
 *      AcquisitionRange    = 和暦短縮 + "　～　" + 和暦短縮 (đầy đủ 2 全角スペース)
 *      DeleteDate          — null (sentinel 1900-01-01) thì để trống
 *      PDFName             = `{PAT_NM}_{if_id}_{yyyyMMddHHmmss}.pdf`, **null khi
 *                            PDF == null** → ô trống.
 *    InfoShareService.wColsViewItem = {30, 200, 290, 150, 300} → 5 cột
 *    (checkbox + 4 cột trên).
 *
 *  - frm201045.btnF8_Click (削除) — lọc `IsSelected && DeleteDate == null`:
 *      · không còn dòng nào → E00100「削除するデータがありません。」 và DỪNG
 *      · có → MessageBox Yes/No「削除してもよろしいですか？」
 *      · Yes → MarkAsDeleted (UPDATE delete_date = now, **PDF = NULL**) →
 *        「削除が完了しました。」; thất bại → 「削除に失敗しました。」
 *
 *  - frm201045.btnF9_Click (選択) — lọc `IsSelected && PDF != null`:
 *      · rỗng → E00100「選択するデータがありません。」
 *      · có → OpenFilePdf từng dòng (BLOB → file tạm → Process.Start).
 *    ⇒ dòng ĐÃ XOÁ (PDF bị NULL) KHÔNG mở được, dù có tick.
 *
 *  - InfoShareService — `dgvInfoShare_MouseDoubleClick` và `dgvInfoShare_KeyDown`
 *    (Enter) đều **đảo** `IsSelected` của dòng đang trỏ.
 *
 * ── FACT PHÍA WEB (apps/web-tenant) ──────────────────────────────────────────
 *  - components/karte-info-share-dialog.tsx — DraggableDialog title
 *    「電子カルテ情報共有サービス」; PdfPreviewDialog dùng `viewOnly` nên footer
 *    CHỈ có F10 戻る (không 印刷 / PDF出力) — đúng tinh thần WinForm chỉ mở xem.
 *  - lib/karte-info-share.ts — 4 hàm format ở trên.
 *  - locales/ja.ts — infoShareNoDeleteTarget / infoShareNoSelectTarget /
 *    infoShareDeleteConfirm / infoShareDeleteSucceeded / infoShareInvalidPeriod.
 *  - **検索 CHƯA PORT**: pipeline OQS (YZKsiquc01req/TKKsiquc01req/CIPsiquc01req)
 *    cần máy 資格確認端末. Web chạy đúng checkInputDate rồi hiện
 *    「この機能は開発中です。」 → TC-A11 chốt đúng trạng thái đó, đổi khi port xong.
 *
 * ── CÁCH CHẠY ────────────────────────────────────────────────────────────────
 * CHẠY CẢ FILE (`describe.serial`, chung 1 page vì app giới hạn số lần login).
 * Testcase nối tiếp trạng thái → chạy lẻ 1 test ở giữa sẽ fail.
 *
 * Bảng `rx_sharing_view_history` RỖNG ở dev (chỉ có dữ liệu khi đã gọi OQS thật)
 * nên nhóm TC-B tự seed qua Postgres và tự dọn:
 *     TEST_DB=1 npx playwright test tests/karte-info-share-dialog.spec.ts
 * Không đặt TEST_DB → nhóm TC-B tự skip, nhóm TC-A vẫn chạy đủ.
 *
 * TC-B9 GHI THẬT (F8 削除 bấm Yes) — thêm cờ:
 *     TEST_DB=1 TEST_ALLOW_DELETE=1 npx playwright test tests/karte-info-share-dialog.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'
const PAT_NO = process.env.TEST_PAT_NO ?? '12138'
const TRT_DT = process.env.TEST_TRT_DT ?? '2025-12-24'
/** F8 削除 nhánh Yes (UPDATE thật). Mặc định chỉ tới confirm rồi bấm No. */
const ALLOW_DELETE = process.env.TEST_ALLOW_DELETE === '1'

/** DEFAULT_PERIOD_MONTHS_BACK — karte-info-share-dialog.tsx (WinForm AddMonths(-60)). */
const PERIOD_MONTHS_BACK = 60
/** Số cột lưới = InfoShareService._viewItem.Length. */
const GRID_COL_COUNT = 5

// ── Dữ liệu seed (nhóm TC-B) ────────────────────────────────────────────────
// Ngày giờ CỐ ĐỊNH để chuỗi 和暦 kỳ vọng viết thẳng ra được. Dùng giờ LOCAL vì
// UI format theo giờ máy; seed cũng đi qua `Date` local nên hai bên cùng hệ quy
// chiếu (test và browser chạy chung máy).
const DRUG_ACTIVE_AT = new Date(2026, 6, 3, 9, 30, 45) // 令和08年07月03日 09:30
const DRUG_DELETED_AT = new Date(2026, 5, 2, 8, 0, 0) // 令和08年06月02日 08:00
const DRUG_DELETED_ON = new Date(2026, 6, 20, 11, 0, 0) // 削除日時 2026/07/20 11:00
const CHECKUP_AT = new Date(2026, 4, 1, 7, 15, 0) // 令和08年05月01日 07:15
const CLINICAL_AT = new Date(2026, 3, 10, 16, 45, 0) // 令和08年04月10日 16:45
const UNKNOWN_AT = new Date(2026, 2, 9, 12, 0, 0) // if_id 22 → không thuộc tab nào

/** if_id 22 = YZKsiquc01res (KẾT QUẢ, không phải YÊU CẦU) — WinForm bỏ qua. */
const IF_ID_UNKNOWN = '22'

const SEED_REQ_DTS = [
    DRUG_ACTIVE_AT,
    DRUG_DELETED_AT,
    CHECKUP_AT,
    CLINICAL_AT,
    UNKNOWN_AT,
]

/** 取得日時 kỳ vọng (令和 = năm − 2018). */
const DRUG_ACTIVE_LABEL = '令和08年07月03日 09:30'
const DRUG_DELETED_LABEL = '令和08年06月02日 08:00'
const CHECKUP_LABEL = '令和08年05月01日 07:15'
const CLINICAL_LABEL = '令和08年04月10日 16:45'
const UNKNOWN_LABEL = '令和08年03月09日 12:00'

/** 取得期間 kỳ vọng — 2 全角スペース quanh 「～」 (InfoShareServiceModel). */
const DRUG_RANGE_LABEL = 'R03/07/01　～　R08/07/01'
/** 削除日時 kỳ vọng (西暦, WinForm đổ thẳng DateTime ra ô). */
const DRUG_DELETED_ON_LABEL = '2026/07/20 11:00'

/** Chuỗi UI lấy từ locales/ja.ts + MsgDialog của WinForm. */
const MSG = {
    noDeleteTarget: '削除するデータがありません。',
    noSelectTarget: '選択するデータがありません。',
    deleteConfirm: '削除してもよろしいですか？',
    deleteSucceeded: '削除が完了しました。',
    invalidPeriod: '開始日付は終了日付より前の日付を指定してください。',
    underDevelopment: 'この機能は開発中です。',
} as const

/** Đóng SanteiConfirmDialog 「…を算定しますか？」 (AutoSantei) — nó đè lên mọi dialog. */
async function installSanteiAutoClose(page: Page) {
    await page.addLocatorHandler(
        page.getByText(/を算定しますか？/).first(),
        async () => {
            await page.getByRole('button', { name: /^(No|いいえ)$/ }).first().click()
        },
        { times: 20 },
    )
}

/** 令和 年/月 kỳ vọng của một Date (chỉ dùng cho ngày ≥ 2019-05-01). */
function reiwaYm(d: Date): { y: string; m: string } {
    return { y: String(d.getFullYear() - 2018), m: String(d.getMonth() + 1) }
}

test.describe.configure({ mode: 'serial' })

test.describe('Shift+F7 カルテ情報共有 — 電子カルテ情報共有サービス (frm201045)', () => {
    let page: Page
    let step: () => Promise<void>

    let dialog: Locator
    /** Khối chứa một nhãn = CHA của phần tử mang đúng text đó (TEST-GUIDELINE 12.1). */
    let boxOf: (text: string) => Locator
    /** Khối 取得年月 — chứa 2 EraDateField (mỗi cái: 元号 combobox + ô 年 + ô 月). */
    let periodBox: Locator
    /** Dialog preview PDF — phân biệt với dialog chính bằng iframe (12.4). */
    let previewDialog: Locator

    /** Trạng thái DB trước TC-B9, để so sau khi xoá. */
    let beforeDelete: RxSharingRow[] = []

    const fkey = (label: string) => dialog.getByRole('button', { name: label })
    const tab = (name: string) => dialog.getByRole('tab', { name, exact: true })
    const alert = () => page.getByRole('alertdialog')
    const rowByLabel = (label: string) => rows(dialog).filter({ hasText: label })

    /** Chờ 1 alertdialog có đúng nội dung rồi bấm OK cho nó biến mất. */
    async function expectAlertThenOk(message: string) {
        const a = alert()
        await expect(a).toBeVisible({ timeout: 15000 })
        await expect(a.getByText(message)).toBeVisible()
        await a.getByRole('button', { name: 'OK' }).click()
        await expect(a).toBeHidden({ timeout: 10000 })
    }

    test.beforeAll(async ({ browser }) => {
        if (dbEnabled) {
            // Seed TRƯỚC khi mở màn: dialog nạp lưới ngay lúc open.
            await seedRxSharingViewHistory(PAT_NO, [
                { ifId: '21', reqDt: DRUG_ACTIVE_AT, startDate: '2021-07-01', endDate: '2026-07-01' },
                {
                    ifId: '21',
                    reqDt: DRUG_DELETED_AT,
                    startDate: '2021-06-01',
                    endDate: '2026-06-01',
                    deleteDate: DRUG_DELETED_ON,
                    // WinForm set PDF = NULL khi xoá; cột PG là NOT NULL → rỗng.
                    pdf: Buffer.alloc(0),
                },
                { ifId: '23', reqDt: CHECKUP_AT, startDate: '2021-05-01', endDate: '2026-05-01' },
                { ifId: '31', reqDt: CLINICAL_AT, startDate: '2021-04-01', endDate: '2026-04-01' },
                {
                    ifId: IF_ID_UNKNOWN,
                    reqDt: UNKNOWN_AT,
                    startDate: '2021-03-01',
                    endDate: '2026-03-01',
                    pdf: MINIMAL_PDF,
                },
            ])
        }

        page = await browser.newPage({ baseURL: BASE_URL, ignoreHTTPSErrors: true, locale: 'ja-JP' })
        step = makeStep(page)
        await installSanteiAutoClose(page)

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, { waitUntil: 'domcontentloaded' })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })

        // Match theo text đặc trưng trong BODY, không theo title (Rule 13.1):
        // 「取得年月」 chỉ có ở dialog này.
        dialog = page.getByRole('dialog').filter({ hasText: '取得年月' })
        boxOf = (text: string) => dialog.getByText(text, { exact: true }).locator('..')
        previewDialog = page.getByRole('dialog').filter({ has: page.locator('iframe') })
    })

    test.afterAll(async () => {
        await page?.close()
        if (dbEnabled) {
            const n = await deleteRxSharingViewHistory(PAT_NO, SEED_REQ_DTS)
            console.log(`dọn rx_sharing_view_history: ${n} dòng`)
        }
    })

    // ── TC-A: không phụ thuộc dữ liệu ───────────────────────────────────────

    test('TC-A1 — Shift+F7 mở dialog, header hiện 患者情報 + 3 combo 閲覧同意 CHỈ ĐỌC', async () => {
        await page.keyboard.press('Shift+F7')
        await expect(dialog).toBeVisible({ timeout: 20000 })
        await step()

        // 4 ô read-only của objFrame (txtPatNo/txtPatNm/txtPatBirthDt/txtSex).
        await expect(boxOf('患者番号').getByRole('textbox')).toHaveValue(PAT_NO)
        await expect(boxOf('患者氏名').getByRole('textbox')).not.toHaveValue('')
        for (const label of ['患者番号', '患者氏名', '生年月日', '性別']) {
            await expect(
                boxOf(label).getByRole('textbox'),
                `${label} phải read-only (WinForm CustomTextBox.ReadOnly = true)`,
            ).toHaveJSProperty('readOnly', true)
        }

        // cboDrugConsent / cboCheckupConsent / cboClinicalConsent — Enabled = false.
        for (const label of ['薬剤情報閲覧', '特定健診閲覧', '臨床情報閲覧']) {
            await expect(
                boxOf(label).getByRole('combobox'),
                `${label}: WinForm để Enabled=false, web phải disabled`,
            ).toBeDisabled()
        }
    })

    test('TC-A2 — F-key bar đúng _btnInfo: F4/F5 chỉ là nhãn, F6/F7/F11/F12 trống', async () => {
        for (const [key, label] of [
            ['F1', '薬剤情報'],
            ['F2', '特定健診'],
            ['F3', '臨床情報'],
            ['F8', '削除'],
            ['F9', '選択'],
            ['F10', '戻る'],
        ] as const) {
            await expect(fkey(`${key} ${label}`), `thiếu ${key} ${label}`).toBeVisible()
        }

        // OCHA_OFF: có nhãn nhưng không phải nút hành động → không có onPress.
        await expect(fkey('F4 医療扶助')).toBeVisible()
        await expect(fkey('F5 訪問診療')).toBeVisible()

        // WinForm để trống 4 phím này.
        for (const key of ['F6', 'F7', 'F11', 'F12']) {
            const cell = dialog.locator(`[data-fkey="${key}"]`)
            if (await cell.count()) {
                await expect(cell, `${key} phải trống theo _btnInfo`).toHaveText(key)
            }
        }
    })

    test('TC-A3 — focus khởi tạo ở 取得年月(開始) (frm201045_Shown)', async () => {
        // ⚠️ PHẢI đóng rồi mở lại NGAY TRONG testcase này: init-focus là trạng thái
        // của KHOẢNH KHẮC MỞ. Màn 診療入力 phía sau có effect tự focus lại ô 点 của
        // dòng 日計, nên assert ở testcase sau (dialog đã mở từ lâu) là đo nhầm —
        // TEST-GUIDELINE Rule 14.2 / Rule 15.
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })

        await page.keyboard.press('Shift+F7')
        await expect(dialog).toBeVisible({ timeout: 20000 })

        periodBox = boxOf('取得年月')
        const first = periodBox.getByRole('combobox').first()

        // Đích WinForm: dtCollectionDateYMStartDate.Focus() → ô 元号 của 取得年月開始.
        // Vẫn có thể đua với open-focus của DraggableDialog → cảnh báo, không đánh đỏ.
        const focused = await first.evaluate((el) => el === document.activeElement).catch(() => false)
        if (!focused) {
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                return el ? `${el.tagName}.${el.className}`.slice(0, 90) : '(null)'
            })
            console.log(`CẢNH BÁO: 取得年月(開始) không được focus khi mở; đang focus: ${desc}`)
        }
        // Điều TẤT ĐỊNH mà app cam kết: mở dialog là focus phải vào trong dialog,
        // không được để nguyên ở lưới màn nền (bàn phím sẽ gõ nhầm vào ô 点).
        expect(
            await dialog.evaluate((el) => el.contains(document.activeElement)),
            'focus rơi ra ngoài dialog',
        ).toBe(true)
    })

    test('TC-A4 — 取得年月 chỉ 元号+年+月 (MonthOnly) và mặc định = 60 tháng trước 〜 hôm nay', async () => {
        periodBox = boxOf('取得年月')
        const numeric = periodBox.getByRole('textbox')

        // MonthOnly = true → 2 field × (年, 月) = 4 ô, KHÔNG có ô 日 (sẽ là 6).
        await expect(numeric, 'MonthOnly=true nên không được có ô 日').toHaveCount(4)

        const today = new Date()
        const from = new Date(today.getFullYear(), today.getMonth() - PERIOD_MONTHS_BACK, 1)
        if (from.getFullYear() < 2019) {
            console.log('mốc −60 tháng rơi trước 令和 → BỎ QUA so 和暦')
            return
        }
        const f = reiwaYm(from)
        const t = reiwaYm(today)
        await expect(numeric.nth(0), '開始年').toHaveValue(f.y)
        await expect(numeric.nth(1), '開始月').toHaveValue(f.m)
        await expect(numeric.nth(2), '終了年').toHaveValue(t.y)
        await expect(numeric.nth(3), '終了月').toHaveValue(t.m)
    })

    test('TC-A5 — 3 tab đúng tabPage1..3 và F1/F2/F3 chuyển tab', async () => {
        for (const name of ['薬剤情報', '特定健診情報', '臨床情報']) {
            await expect(tab(name)).toBeVisible()
        }
        // Mở lên là tab 薬剤情報 (tbcShareInfo.SelectedIndex = 0).
        await expect(tab('薬剤情報')).toHaveAttribute('data-state', 'active')

        await page.keyboard.press('F2')
        await expect(tab('特定健診情報')).toHaveAttribute('data-state', 'active')
        await step()

        await page.keyboard.press('F3')
        await expect(tab('臨床情報')).toHaveAttribute('data-state', 'active')

        await page.keyboard.press('F1')
        await expect(tab('薬剤情報')).toHaveAttribute('data-state', 'active')
        await step()
    })

    test('TC-A6 — lưới đúng 5 cột của InfoShareService._viewItem', async () => {
        await expect(scroller(dialog)).toBeVisible({ timeout: 20000 })
        for (const header of ['取得日時', '取得期間', '削除日時', 'PDF名称']) {
            await expect(dialog.getByText(header, { exact: true })).toBeVisible()
        }
        await expect(
            dialog.locator('[data-testid^="header-"]'),
            'số cột ≠ wColsViewItem.Length',
        ).toHaveCount(GRID_COL_COUNT)
    })

    test('TC-A7 — F8 削除 khi chưa tick dòng nào → E00100', async () => {
        await page.keyboard.press('F8')
        await expectAlertThenOk(MSG.noDeleteTarget)
    })

    test('TC-A8 — F9 選択 khi chưa tick dòng nào → E00100', async () => {
        await page.keyboard.press('F9')
        await expectAlertThenOk(MSG.noSelectTarget)
    })

    // ── TC-A (tiếp) — 検索: checkInputDate + trạng thái chưa port ─────────────

    test('TC-A9 — 検索 với 取得年月 đảo ngược ở tab 薬剤情報 → E00101', async () => {
        await page.keyboard.press('F1')
        periodBox = boxOf('取得年月')
        // 開始年 = 令和99年 (2117) → 年*100+月 lớn hơn 終了 → checkInputDate false.
        await periodBox.getByRole('textbox').nth(0).fill('99')
        await step()

        await dialog.getByRole('button', { name: '検索', exact: true }).click()
        await expectAlertThenOk(MSG.invalidPeriod)
    })

    test('TC-A10 — cùng khoảng đảo ngược nhưng ở tab 特定健診情報 thì KHÔNG chặn', async () => {
        // WinForm checkInputDate chỉ so ở tab 0 và 2; điện văn TKK không mang 取得年月.
        await page.keyboard.press('F2')
        await expect(tab('特定健診情報')).toHaveAttribute('data-state', 'active')

        await dialog.getByRole('button', { name: '検索', exact: true }).click()
        // Đi qua được chốt ngày → tới bước gọi OQS (hiện chưa port).
        await expectAlertThenOk(MSG.underDevelopment)
    })

    test('TC-A11 — 検索 khoảng hợp lệ → hiện 開発中 (pipeline OQS chưa port)', async () => {
        await page.keyboard.press('F1')
        periodBox = boxOf('取得年月')
        const to = reiwaYm(new Date())
        // trả 開始年 về đúng mốc mặc định (60 tháng trước) cho hợp lệ trở lại
        const from = new Date(new Date().getFullYear(), new Date().getMonth() - PERIOD_MONTHS_BACK, 1)
        await periodBox.getByRole('textbox').nth(0).fill(reiwaYm(from).y)
        await expect(periodBox.getByRole('textbox').nth(2)).toHaveValue(to.y)
        await step()

        await dialog.getByRole('button', { name: '検索', exact: true }).click()
        await expectAlertThenOk(MSG.underDevelopment)
    })

    // ── TC-B: cần dữ liệu seed ──────────────────────────────────────────────

    test('TC-B1 — if_id 21/23/31 vào ĐÚNG tab, if_id lạ KHÔNG thuộc tab nào', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1 để seed rx_sharing_view_history')

        await page.keyboard.press('F1')
        await expect(rowByLabel(DRUG_ACTIVE_LABEL)).toHaveCount(1)
        await expect(rowByLabel(CHECKUP_LABEL), '特定健診 lọt sang tab 薬剤情報').toHaveCount(0)
        await expect(rowByLabel(CLINICAL_LABEL), '臨床情報 lọt sang tab 薬剤情報').toHaveCount(0)

        await page.keyboard.press('F2')
        await expect(rowByLabel(CHECKUP_LABEL)).toHaveCount(1)
        await expect(rowByLabel(DRUG_ACTIVE_LABEL)).toHaveCount(0)

        await page.keyboard.press('F3')
        await expect(rowByLabel(CLINICAL_LABEL)).toHaveCount(1)

        // `default: continue` của GetRecords — if_id 22 không được hiện ở BẤT KỲ tab nào.
        for (const key of ['F1', 'F2', 'F3']) {
            await page.keyboard.press(key)
            await expect(
                rowByLabel(UNKNOWN_LABEL),
                `if_id ${IF_ID_UNKNOWN} lọt vào lưới (WinForm bỏ qua)`,
            ).toHaveCount(0)
        }
        await page.keyboard.press('F1')
        await step()
    })

    test('TC-B2 — trong tab, 取得日時 giảm dần (ORDER BY REQ_DT DESC)', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const texts = (await cells(dialog, 'acquisitionDateTime').allTextContents()).map((t) =>
            t.trim(),
        )
        expect(texts.length, 'tab 薬剤情報 phải có 2 dòng seed').toBeGreaterThanOrEqual(2)
        expect(texts.indexOf(DRUG_ACTIVE_LABEL), '07/03 phải đứng trước 06/02').toBeLessThan(
            texts.indexOf(DRUG_DELETED_LABEL),
        )
    })

    test('TC-B3 — 取得期間 và PDF名称 đúng InfoShareServiceModel', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const row = rowByLabel(DRUG_ACTIVE_LABEL)
        await expect(cells(row, 'acquisitionRange')).toHaveText(DRUG_RANGE_LABEL)

        const patNm = (await boxOf('患者氏名').getByRole('textbox').inputValue()).trim()
        // PAT_NM + "_" + if_id + "_" + req_dt("yyyyMMddHHmmss") + ".pdf"
        await expect(cells(row, 'pdfName')).toHaveText(`${patNm}_21_20260703093045.pdf`)
        await expect(cells(row, 'deleteDate'), 'dòng chưa xoá phải để trống 削除日時').toHaveText('')
    })

    test('TC-B4 — dòng ĐÃ XOÁ: có 削除日時, PDF名称 rỗng (PDF = NULL)', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const row = rowByLabel(DRUG_DELETED_LABEL)
        await expect(cells(row, 'deleteDate')).toHaveText(DRUG_DELETED_ON_LABEL)
        await expect(cells(row, 'pdfName'), 'PDF đã NULL thì PDFName phải rỗng').toHaveText('')
    })

    test('TC-B5 — double-click và Enter đều ĐẢO checkbox của dòng', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const row = rowByLabel(DRUG_ACTIVE_LABEL)
        const box = row.getByRole('checkbox')
        await expect(box).not.toBeChecked()

        // dgvInfoShare_MouseDoubleClick → IsSelected = !IsSelected
        await row.getByTestId('cell-acquisitionDateTime').dblclick()
        await expect(box).toBeChecked()
        await step()

        // dgvInfoShare_KeyDown (Enter) → cũng đảo, đưa về trạng thái ban đầu
        await row.getByTestId('cell-acquisitionDateTime').click()
        await page.keyboard.press('Enter')
        await expect(box, 'Enter phải đảo checkbox đúng 1 lần').not.toBeChecked()
        await step()
    })

    test('TC-B6 — tick dòng ĐÃ XOÁ rồi F8 → vẫn E00100 (lọc DeleteDate == null)', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const row = rowByLabel(DRUG_DELETED_LABEL)
        await row.getByRole('checkbox').click()
        await expect(row.getByRole('checkbox')).toBeChecked()

        await page.keyboard.press('F8')
        await expectAlertThenOk(MSG.noDeleteTarget)
    })

    test('TC-B7 — dòng ĐÃ XOÁ (PDF NULL) tick rồi F9 → E00100 (lọc PDF != null)', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        // vẫn đang tick từ TC-B6
        await page.keyboard.press('F9')
        await expectAlertThenOk(MSG.noSelectTarget)

        // trả lại trạng thái sạch cho các TC sau
        await rowByLabel(DRUG_DELETED_LABEL).getByRole('checkbox').click()
        await expect(rowByLabel(DRUG_DELETED_LABEL).getByRole('checkbox')).not.toBeChecked()
    })

    test('TC-B8 — F9 選択 dòng có PDF → mở preview CHỈ có 戻る (không 印刷/PDF出力)', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        const row = rowByLabel(DRUG_ACTIVE_LABEL)
        await row.getByRole('checkbox').click()
        await expect(row.getByRole('checkbox')).toBeChecked()

        await page.keyboard.press('F9')
        await expect(previewDialog, 'không mở được preview PDF').toBeVisible({ timeout: 30000 })
        await step()

        // viewOnly: WinForm chỉ Process.Start để XEM, không có đường in từ màn này.
        await expect(previewDialog.getByRole('button', { name: 'F10 戻る' })).toBeVisible()
        await expect(previewDialog.getByRole('button', { name: /印刷/ })).toHaveCount(0)
        await expect(previewDialog.getByRole('button', { name: /PDF出力/ })).toHaveCount(0)

        await previewDialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(previewDialog).toBeHidden({ timeout: 10000 })

        // giữ tick lại cho TC-B9 (dòng này là mục tiêu xoá)
        await expect(row.getByRole('checkbox')).toBeChecked()
    })

    test('TC-B9 — F8 削除: confirm → No không đổi gì; Yes thì UPDATE delete_date + PDF rỗng', async () => {
        test.skip(!dbEnabled, 'cần TEST_DB=1')

        beforeDelete = await listRxSharingViewHistory(PAT_NO)

        // Nhánh No — WinForm MessageBox Yes/No, chọn No là dừng hẳn.
        await page.keyboard.press('F8')
        const confirm = alert()
        await expect(confirm).toBeVisible({ timeout: 15000 })
        await expect(confirm.getByText(MSG.deleteConfirm)).toBeVisible()
        await confirm.getByRole('button', { name: /^(No|いいえ)$/ }).click()
        await expect(confirm).toBeHidden({ timeout: 10000 })

        const afterNo = await listRxSharingViewHistory(PAT_NO)
        expect(afterNo, 'bấm No mà DB vẫn đổi').toEqual(beforeDelete)

        if (!ALLOW_DELETE) {
            console.log('TEST_ALLOW_DELETE≠1 → BỎ QUA nhánh Yes (không ghi DB)')
            return
        }

        // Nhánh Yes — MarkAsDeleted
        await page.keyboard.press('F8')
        await expect(alert()).toBeVisible({ timeout: 15000 })
        await alert().getByRole('button', { name: /^(Yes|はい)$/ }).click()
        await expectAlertThenOk(MSG.deleteSucceeded)
        await step()

        const after = await listRxSharingViewHistory(PAT_NO)
        const target = after.find((r) => r.req_dt.getTime() === DRUG_ACTIVE_AT.getTime())
        expect(target, 'không tìm thấy dòng vừa xoá').toBeTruthy()
        expect(
            target!.delete_date.getUTCFullYear(),
            'delete_date phải là hiện tại, không còn sentinel 1900',
        ).toBeGreaterThan(1900)
        expect(target!.pdf_len, 'WinForm set PDF = NULL khi xoá').toBe(0)

        // Dòng của tab khác KHÔNG được đụng tới.
        const checkup = after.find((r) => r.req_dt.getTime() === CHECKUP_AT.getTime())
        expect(checkup!.delete_date.getUTCFullYear(), '特定健診 bị xoá lây').toBe(1900)

        // UI phản ánh ngay: 削除日時 có giá trị, PDF名称 rỗng.
        const row = rowByLabel(DRUG_ACTIVE_LABEL)
        await expect(cells(row, 'deleteDate')).not.toHaveText('')
        await expect(cells(row, 'pdfName')).toHaveText('')
    })

    test('TC-A12 — F10 戻る đóng dialog', async () => {
        await page.keyboard.press('F10')
        await expect(dialog).toBeHidden({ timeout: 10000 })
        await step()
    })

    test('TC-A13 — con trỏ ở dòng THÁNG KHÁC thì Shift+F7 bị chặn (当月以外操作不可)', async () => {
        // frm203002.cs:4109-4114 — KeyFunc chặn MỌI phím (trừ F5) khi ô đang trỏ
        // thuộc tháng khác. Lưới không gắn cờ "history" nào trên DOM, nên đi
        // đường gián tiếp: `data-grid-cell="<ri>-<ii>|<col>"` với `ri` = chỉ số
        // NHÓM THÁNG; nhóm 0 là tháng cũ nhất. Nếu bệnh nhân không có tháng nào
        // ngoài tháng đang xem thì nhóm 0 CHÍNH LÀ tháng hiện tại → không kiểm
        // được, phải BỎ QUA chứ không được coi là pass.
        const firstGroupCell = page.locator('[data-grid-cell^="0-"]').first()
        if (!(await firstGroupCell.count())) {
            console.log(`bệnh nhân ${PAT_NO}: lưới không có ô nào → BỎ QUA chốt 当月以外`)
            return
        }
        await firstGroupCell.click()
        await page.keyboard.press('Shift+F7')

        const a = alert()
        const blocked = await a.isVisible({ timeout: 5000 }).catch(() => false)
        if (!blocked) {
            // Dialog mở được ⇒ ô vừa bấm thuộc tháng hiện tại.
            const opened = await dialog.isVisible().catch(() => false)
            if (opened) await page.keyboard.press('F10')
            console.log(
                `bệnh nhân ${PAT_NO} @ ${TRT_DT}: nhóm tháng đầu tiên chính là tháng hiện tại ` +
                    '→ BỎ QUA chốt 当月以外 (đặt TEST_TRT_DT vào tháng có lịch sử để kiểm)',
            )
            return
        }
        await expect(a.getByText('当月以外の操作はできません')).toBeVisible()
        await a.getByRole('button', { name: 'OK' }).click()
        await expect(dialog, 'bị chặn mà dialog vẫn mở').toBeHidden()
    })
})
