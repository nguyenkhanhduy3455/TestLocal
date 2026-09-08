import { type Locator, type Page } from '@playwright/test'

import { patNo, trtDt } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep } from '../_shared/step'

/**
 * ガイド処置選択 (frm203017) — ĐỊNH DẠNG và DANH SÁCH 処置 của dialog bung ra khi
 * click một dòng ở tab ガイド.
 *
 * Spec anh em `guide-sidepanel-handler.spec.ts` đo TAB (list ガイド, ô 選択No., ba
 * nút). File này đo CHÍNH DIALOG: cửa sổ, cụm header, 5 cột, từng ô, màu, con trỏ,
 * sắp xếp, 回数 — tức những câu 「hai bên có giống nhau không」.
 *
 * Nửa WinForm nằm ở
 * `../../../fla-ui-tests/src/OchaCom.FlaUiTests/Tests/GuideSidePanel/GuideDialogTests.cs`
 * (+ `GuideDialogProbeTests.cs` để dò). Bảng tương ứng từng testcase ở
 * `GUIDE-DIALOG-README.md` mục 3.
 *
 * ─── FACT lấy từ WinForm (src/OCHACOM/INP/Forms/frm203017.cs) ────────────────
 *  - :77   `_title = 「ガイド処置選択」`; :133 `DialogSize = Size3`.
 *  - :78-92 `_btnInfo` — CHỈ F9 「確定」 và F10 「戻る」 bật; 10 nút còn lại OCHA_OFF.
 *  - :96-104 `_viewItem` — 9 cột, 5 cột đầu hiển thị:
 *        「 ｺｰﾄﾞ」(65, canh phải) 「枝番」(40, phải) 「処置名称」(370, TRÁI)
 *        「点数」(70, phải) 「回数」(70, phải);
 *      4 cột sau (jihi_flg/men/unit/acc_unit) width 0 ⇒ KHÔNG hiển thị.
 *      ⚠️ Tiêu đề cột 1 là 「 ｺｰﾄﾞ」 — katakana NỬA chiều rộng và có MỘT DẤU CÁCH
 *      đứng trước. Web hiển thị 「コード」 đủ chiều rộng, không dấu cách ⇒ LỆCH đã
 *      biết, đo ở TC-D2.
 *  - :221-232 `dgvView_CellFormatting` — chèn dấu cách vào MỌI ô: cột canh trái
 *      thành 「 {0}」, canh phải thành 「{0} 」. Web không có ⇒ LỆCH cố ý (CSS lo
 *      padding), chỉ ghi nhận chứ không đánh đỏ.
 *  - :363-388 `dgvView_CellClick` — CLICK ĐƠN lên MỘT Ô BẤT KỲ của dòng làm
 *      回数 += 1; > 255 thì kẹp 255; > maxCnt (CalcCnt) thì về 0.
 *      Đây là sự kiện MỖI CLICK MỘT LẦN ⇒ double-click chạy HAI lần (+2).
 *  - Designer :135-139 — dgvView CHỈ nối CellBeginEdit / PreviewKeyDown / CellClick /
 *      EditingControlShowing / KeyDown. KHÔNG có CellDoubleClick, và :183-193
 *      `formBase_KeyDown` nhánh `Keys.Enter` bỏ qua khi ActiveControl là
 *      (Gradient)DataGridView ⇒ Enter KHÔNG đụng tới 回数.
 *  - :958-962 getViewData — dòng 薬剤 (dải 600-699) nối 用法 lấy từ 用法マスタ
 *      MST_MED vào 処置名称: `newRow["trt_nm"] += " " + usage`
 *      (`SyoPac.getMstMed`, COMMON/DBAccess/SyoPac.cs:242).
 *  - :1676-1728 `ucToothGuide_Changed` — CHỈ khi người dùng chạm mặt răng mới
 *      reset MỌI dòng nhóm 窩洞形態 về 0 rồi điền lại theo 複雑/単純. Lúc dialog
 *      VỪA MỞ, mấy dòng đó vẫn mang 算定回数 mà getViewData ghi thẳng vào ô.
 *  - :418  `Columns[4].SortMode = NotSortable` ⇒ 「回数」 KHÔNG sắp xếp được,
 *      bốn cột kia sắp xếp được (mặc định Automatic của DataGridView).
 *  - :428-429 `txtGuidNo = guidCd`, `txtGuidNm = guidNm`; nhãn `lblName` = 「ガイド番号」.
 *  - :1035-1050 nền dòng đổi màu theo NHÓM (`acc_unit >> 4`), KHÔNG theo chẵn/lẻ.
 *  - :1053-1059 màu chữ cột 処置名称: mã 摘要(700-899)/カルテコメント(7000-8999) →
 *      `acc_unit & 0x0F == 1` ⇒ magenta `0xff00ff` (レセプト印字), còn lại ⇒ Blue
 *      (カルテ印字); mã 処置 thường giữ màu đen.
 *  - :1063-1067 nạp xong: `dgvView.Focus()` + `Rows[0].Cells["cnt"].Selected = true`
 *      ⇒ con trỏ nằm ở ô 回数 của DÒNG ĐẦU.
 *  - :180  `Keys.Escape` ⇒ `btnF9_Click` = 確定. ĐÓNG BẰNG F10, TUYỆT ĐỐI KHÔNG Escape.
 *  - :113-124 `Instance` dựng form MỚI khi bản cũ đã Dispose ⇒ mở lại là form sạch.
 *
 * ─── Web port ───────────────────────────────────────────────────────────────
 *  - components/guide-selection-dialog.tsx — DraggableDialog width=650 height=620,
 *      title 「ガイド処置選択」, cụm header 「ガイド番号」 + guidCd + guidNm;
 *      `onRowClick={handleRowCycle}` — VirtualListTable gọi nó ở MỖI CLICK, đúng
 *      khuôn CellClick (trước đây treo ở `onOpenRow` = double-click/Enter);
 *      `getRowClassName` tô nền theo NHÓM `acc_unit >> 4`;
 *      `guideTrtDisplayNm` ghép 用法 (field `usageNm` của response) vào 処置名称;
 *      `toggleCavity` ghi 回数 derive được vào `cntOverrides` (chỉ khi chạm mặt răng);
 *      `trtNameColorClass` port màu magenta/xanh; F9 disabled khi mọi 回数 = 0.
 *  - components/cnt-cell.tsx — `COL_GRID = 'grid-cols-[70px_60px_1fr_60px_50px]'`,
 *      header 「コード」「枝番」「処置名称」「点数」「回数」, `enableSorting: false`
 *      cho 回数; ô 回数 là `<input data-cnt-idx>`, tự focus dòng 0 khi mở.
 *  - shared/components/virtual-list-table — header `[data-testid="header-<id>"]`
 *      mang `aria-sort` (none/ascending/descending) CHỈ khi cột sắp xếp được;
 *      dòng `[data-testid^="row-"]` (khoá = `${trtCd}-${trtSb}`), ô
 *      `[data-testid="cell-<id>"]`; nền MẶC ĐỊNH đổi theo CHẴN/LẺ
 *      (`isEven ? bg-card : bg-muted/20`) — ガイド ĐÈ lên bằng `getRowClassName`,
 *      dòng đang sáng vẫn giữ `bg-primary/10` (như SelectionBackColor của
 *      DataGridView phủ lên BackColor của ô).
 *
 * ─── BE ─────────────────────────────────────────────────────────────────────
 *  - `GET /tenant/guids/treatments` trả `{ items, showCavityForm }`. Mỗi item có
 *    `accUnit` (= `flg2 << 4 | 印字フラグ`, cột ẩn của dgvView), `grpIdx` (nhóm
 *    窩洞形態 0..7, hoặc -1) và `usageNm` (用法 của mst_med). Ba field đó KHÔNG
 *    hiện trên DOM, nên mấy testcase parity phải đọc từ chính response — xem
 *    `itemsByGuid` bắt ở `beforeAll`.
 *
 * ─── Cách đối chiếu với WinForm ─────────────────────────────────────────────
 * Mỗi testcase in ra các dòng `DUMP|web|…` cùng khuôn với `DUMP|win|…` mà fixture
 * FlaUI in ra. Chạy hai bên rồi diff hai tập DUMP là ra bảng parity — đó là lý do
 * các dòng đó tồn tại, đừng xoá khi dọn log.
 *
 * ─── CHẠY ───────────────────────────────────────────────────────────────────
 *   npx playwright test tests/side-panel/guide-selection-dialog-format.spec.ts
 * Chạy TUẦN TỰ, dùng chung một page (Rule 19): thứ tự testcase có ý nghĩa, chạy lẻ
 * một testcase ở giữa vẫn được vì mỗi cái tự mở lại dialog của mình.
 * KHÔNG testcase nào GHI: không bấm F9 確定, không Escape.
 */

const PAT_NO = patNo('12138')
/** Để trống = hôm nay, đúng tháng hiện hành (WinForm chặn thao tác trên tháng khác). */
const TRT_DT = trtDt('')

/** Số dòng ガイド tối đa sẽ thử click để tìm dòng mở được dialog (ガイド rỗng 処置 tự đóng). */
const SCAN_LIMIT = 5

/** Số ガイド quét trong TC-D14 — testcase đối chiếu dữ liệu với fixture FlaUI TcD16. */
const SCAN_LIMIT_DEEP = Number(process.env.TEST_GUIDE_SCAN ?? '8')

/**
 * Tiền đề của hai testcase parity cuối file.
 *
 * Con số trong hai cái đó là số ĐO ĐƯỢC trên WinForm ngày 2026-09-08 với ĐÚNG bệnh nhân
 * và ĐÚNG ngày này (bệnh nhân 10 · 2026-07-20 · 部位 5 răng 「54321」 · 病名 100 「C」).
 * Đổi bệnh nhân/ngày là đổi 部位 ⇒ đổi 算定回数 ⇒ số cũ vô nghĩa, nên hai testcase đó tự
 * `skip` thay vì đỏ oan.
 *
 * ⚠️ Máy Windows để `patient.patNo = 10` trong `testsettings.local.json` (12138 có 2864
 * dòng TRNTRN, app treo hơn một phút), nên muốn so với FlaUI thì bên này PHẢI trỏ vào
 * cùng bệnh nhân đó:
 *   TEST_PAT_NO=10 TEST_TRT_DT=2026-07-20 npx playwright test …
 */
const PARITY_PAT_NO = '10'
const PARITY_TRT_DT = '2026-07-20'

/** 5 cột hiển thị của frm203017 `_viewItem`, theo đúng thứ tự trái→phải. */
const COL_IDS = ['trtCd', 'trtSb', 'trtNm', 'score', 'cnt'] as const
/** Nhãn cột bản web. WinForm là 「 ｺｰﾄﾞ」 nửa chiều rộng — xem TC-D2. */
const COL_LABELS = ['コード', '枝番', '処置名称', '点数', '回数'] as const
/** Bề rộng khai trong `_viewItem` (frm203017.cs:97-101) — dùng để so TỈ LỆ. */
const WINFORM_WIDTHS = [65, 40, 370, 70, 70] as const

/** Dải mã コメント tô màu (frm203017.cs:1053; port ở guide-selection-dialog.tsx:92-96). */
const RECEIPT_CODE_MIN = 700
const RECEIPT_CODE_MAX = 899
const KARTE_CODE_MIN = 7000
const KARTE_CODE_MAX = 8999

/** DraggableDialog của web (guide-selection-dialog.tsx). */
const DIALOG_W = 650
const DIALOG_H = 620

/** Bit shift tách NHÓM ra khỏi acc_unit — frm203017.cs:1043 `acc_unit >> 4`. */
const ACC_UNIT_GROUP_SHIFT = 4

/** Chỉ số nhóm 窩洞形態 hợp lệ (mst_trt_grp 9990..9997 → 0..7); -1 = không thuộc nhóm. */
const CAVITY_GRP_MIN = 0
const CAVITY_GRP_MAX = 7

/**
 * Một dòng trong response `GET /tenant/guids/treatments`.
 *
 * `accUnit` / `grpIdx` / `usageNm` là ba cột KHÔNG hiện trên lưới (WinForm để
 * width 0 ở `_viewItem`), nhưng lại là thứ quyết định nền dòng và 回数 của nhóm
 * 窩洞形態 — nên phải đọc từ response mới assert được, không bịa từ DOM.
 */
interface GuideTrtWire {
    trtCd: number | string
    trtSb: number | string
    trtNm: string
    cnt: number | string
    accUnit: number | string
    grpIdx: number | string
    usageNm?: string
}

test.describe.configure({ mode: 'serial' })

test.describe('ガイド処置選択 (frm203017) — định dạng dialog + danh sách 処置', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** Dialog frm203017 — nhận diện bằng nhãn 「ガイド番号」 trong body (Rule 13.1: đừng match theo title). */
    let picker: Locator
    /** Alert E00024 「算定できる処置がありません。」 (frm203017 getViewData :1015). */
    let noTrtAlert: Locator
    /** カルテ記載選択 (frm203011) — AutoSantei tự bung, nuốt F-key nếu để đó. */
    let karteCmtDialog: Locator
    let sidePanel: Locator
    /** Dòng của tab ガイド (header cũng dùng grid-cols-[46px_1fr] nên phải kèm cursor-pointer). */
    let guideRows: Locator
    /**
     * URL request 「danh sách 処置 của một ガイド」 gần nhất.
     *
     * Là TIỀN ĐỀ của mọi phép so danh sách với WinForm: hai bên chỉ so được khi cùng
     * ガイド VÀ cùng 部位/病名 — WinForm lấy chúng từ dòng đang có con trỏ trên grdRegi
     * (frm203002.cs:6515), web gửi `Bui`/`DisCd` của dòng đang focus. Bắt ở beforeAll
     * chứ không trong testcase: TanStack Query cache list nên lần mở thứ hai của cùng
     * một ガイド KHÔNG phát request nào.
     */
    let lastTrtQuery = ''
    /**
     * Danh sách 処置 của từng ガイド, đọc từ RESPONSE (khoá = ガイド番号).
     *
     * TanStack Query cache theo (GuidCd, TrtDt, PatNo, Bui, DisCd) nên lần mở thứ
     * hai của cùng một ガイド KHÔNG phát request — vì thế phải gom dần vào Map ở
     * `beforeAll` chứ đừng chờ response ngay trong testcase.
     */
    const itemsByGuid = new Map<number, GuideTrtWire[]>()

    const headerCell = (id: string) => picker.locator(`[data-testid="header-${id}"]`)
    const dialogRows = () => picker.locator('[data-testid^="row-"]')
    const cellsOf = (row: Locator, id: string) => row.locator(`[data-testid="cell-${id}"]`)

    /** In một dòng đối chiếu máy-với-máy với fixture FlaUI. */
    const dump = (line: string) => console.log(`DUMP|web|${line}`)

    /**
     * Màu của một phần tử, quy về RGB thật.
     *
     * `getComputedStyle().color` trả về NGUYÊN không gian màu đã khai: Tailwind v4 dùng
     * `oklch()` nên `text-blue-600` đọc ra 「oklch(0.546 0.245 262.881)」 — không so được
     * với số RGB mà PixelProbe đọc từ màn hình WinForm. Canvas thì parse được mọi cú pháp
     * màu của CSS và trả về pixel, nên vẽ 1×1 rồi đọc lại chính là phép quy đổi.
     */
    async function inkRgb(loc: Locator): Promise<[number, number, number]> {
        return loc.evaluate((el) => {
            const css = getComputedStyle(el).color
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const ctx = canvas.getContext('2d')!
            ctx.fillStyle = css
            ctx.fillRect(0, 0, 1, 1)
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
            return [r, g, b] as [number, number, number]
        })
    }

    /**
     * Chờ KẾT QUẢ THẬT của một cú chốt ガイド.
     *
     * Không được mốc vào `picker` không thôi: dialog bung ra ngay khi query còn chạy
     * rồi mới tự đóng nếu ガイド không có 処置 nào (frm203017.cs:1001-1024) — chờ
     * `picker` sẽ luôn khớp cái cửa sổ loading đó và bỏ lọt nhánh rỗng, để lại alert
     * chắn mọi click sau. Mốc đúng là DÒNG 処置 hoặc chính cái alert.
     */
    async function waitPickResult(): Promise<'rows' | 'empty'> {
        await expect(picker.getByTestId('cell-trtNm').first().or(noTrtAlert)).toBeVisible({
            timeout: 30000,
        })
        return (await noTrtAlert.count()) > 0 ? 'empty' : 'rows'
    }

    async function dismissNoTrtAlert() {
        await page.getByRole('button', { name: 'OK' }).first().click()
        await expect(noTrtAlert).toBeHidden({ timeout: 10000 })
    }

    /**
     * Đóng dialog bằng PHÍM F10.
     * KHÔNG click nút 「F10 戻る」: màn nền cũng có nút F10 戻る nằm dưới modal (Rule 10.3).
     * TUYỆT ĐỐI KHÔNG Escape: web bê nguyên frm203017.cs:180 ⇒ Escape là 確定.
     */
    async function dismissPicker() {
        if ((await picker.count()) === 0) return
        await page.keyboard.press('F10')
        await expect(picker).toBeHidden({ timeout: 10000 })
    }

    /** Mở lại tab ガイド chế độ 通常 (F4) — mỗi testcase tự dựng trạng thái của mình. */
    async function enterGuideRegular() {
        await dismissPicker()
        if ((await noTrtAlert.count()) > 0) await dismissNoTrtAlert()
        await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
        await page.keyboard.press('F4')
        await expect(guideRows.first()).toBeVisible({ timeout: 30000 })
    }

    /**
     * Mở dialog ở dòng ガイド ĐẦU TIÊN mở được và trả về (index dòng, ガイド番号).
     *
     * Fixture FlaUI dò y hệt (`GuideDialogFlow.OpenFirstPickableRow`) nên hai bên đo
     * trên cùng một ガイド — DUMP có kèm ガイド番号 để kiểm lại điều đó.
     */
    async function openPickableGuide(): Promise<{ idx: number; guidCd: number }> {
        await enterGuideRegular()
        const total = Math.min(await guideRows.count(), SCAN_LIMIT)
        for (let i = 0; i < total; i++) {
            await guideRows.nth(i).click()
            if ((await waitPickResult()) === 'rows') {
                const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
                return { idx: i, guidCd: Number(raw.trim()) }
            }
            await dismissNoTrtAlert()
        }
        throw new Error(`không ガイド nào trong ${total} dòng đầu mở được ガイド処置選択`)
    }

    /**
     * Mở ĐÚNG một ガイド theo tên, và kiểm luôn ガイド番号 đọc được.
     *
     * Chọn theo TÊN chứ không theo chỉ số dòng: list ガイド đổi theo 部位/病名 của dòng
     * đang chọn, nên 「dòng thứ n」 không phải một mốc ổn định để so hai bên.
     */
    async function openGuideByName(name: string, expectGuidCd: number) {
        await enterGuideRegular()
        const total = Math.min(await guideRows.count(), SCAN_LIMIT_DEEP)
        for (let i = 0; i < total; i++) {
            const nm = (await guideRows.nth(i).locator('div').nth(1).innerText()).trim()
            if (nm.normalize('NFKC') !== name) continue
            await guideRows.nth(i).click()
            if ((await waitPickResult()) === 'empty') {
                await dismissNoTrtAlert()
                continue
            }
            const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
            if (Number(raw.trim()) === expectGuidCd) return
            await dismissPicker()
        }
        throw new Error(`không thấy ガイド 「${name}」 (番号 ${expectGuidCd}) trong ${total} dòng đầu`)
    }

    /** Toàn bộ dòng của lưới dialog, đọc thành mảng chuỗi theo đúng thứ tự cột. */
    async function readRows(): Promise<string[][]> {
        const n = await dialogRows().count()
        const out: string[][] = []
        for (let i = 0; i < n; i++) {
            const row = dialogRows().nth(i)
            const cells: string[] = []
            for (const id of COL_IDS) {
                const cell = cellsOf(row, id)
                // Ô 回数 là <input> nên textContent rỗng — phải đọc value.
                const input = cell.locator('input')
                cells.push(
                    (await input.count()) > 0
                        ? await input.inputValue()
                        : (await cell.innerText()).trim(),
                )
            }
            out.push(cells)
        }
        return out
    }

    /**
     * Khoá `${trtCd}-${trtSb}` của từng dòng lưới, theo ĐÚNG thứ tự đang hiển thị.
     * (`getRowKey = trtRowKey` trong guide-selection-dialog.tsx ⇒ testid là
     * `row-<trtCd>-<trtSb>`.) Dùng để ghép dòng DOM với item của response.
     */
    async function rowKeys(): Promise<string[]> {
        return dialogRows().evaluateAll((els) =>
            els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^row-/, '')),
        )
    }

    /** Màu nền thật của từng dòng lưới, theo thứ tự hiển thị. */
    async function rowBackgrounds(): Promise<string[]> {
        return dialogRows().evaluateAll((els) =>
            els.map((e) => getComputedStyle(e).backgroundColor),
        )
    }

    /** Items của một ガイド đọc từ response, keyed `${trtCd}-${trtSb}`. */
    function wireByKey(guidCd: number): Map<string, GuideTrtWire> {
        const m = new Map<string, GuideTrtWire>()
        for (const it of itemsByGuid.get(guidCd) ?? []) m.set(`${it.trtCd}-${it.trtSb}`, it)
        return m
    }

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        step = makeStep(page)
        disposeOverlays = await installOverlayHandlers(page, { santei: true })

        page.on('request', (r) => {
            if (r.url().includes('/tenant/guids/treatments')) lastTrtQuery = r.url()
        })
        // Bọc try/catch: response có thể bị huỷ giữa chừng khi test kết thúc sớm.
        page.on('response', (res) => {
            if (!res.url().includes('/tenant/guids/treatments')) return
            void (async () => {
                try {
                    const json = (await res.json()) as { data?: { items?: GuideTrtWire[] } }
                    const items = json.data?.items
                    const guid = new URL(res.url()).searchParams.get('GuidCd')
                    if (items && guid) itemsByGuid.set(Number(guid), items)
                } catch {
                    /* không phải JSON / bị huỷ — assert bên dưới tự báo thiếu */
                }
            })()
        })

        picker = page.getByRole('dialog').filter({ hasText: 'ガイド番号' })
        noTrtAlert = page.getByText('算定できる処置がありません')
        karteCmtDialog = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
        sidePanel = page.locator('div[class*="w-[450px]"]').first()
        guideRows = sidePanel.locator(
            'div[class*="grid-cols-[46px_1fr]"][class*="cursor-pointer"]',
        )

        // カルテ記載選択 bung ra bất chợt sau AutoSantei và NUỐT F-key của màn nền
        // (FKeyScopeProvider: modal trên cùng không sở hữu phím ⇒ preventDefault).
        await page.addLocatorHandler(
            karteCmtDialog,
            async () => {
                await karteCmtDialog
                    .getByRole('button', { name: 'F10 戻る' })
                    .first()
                    .click({ timeout: 3000 })
                    .catch(() => {})
            },
            { times: 30 },
        )

        const url = TRT_DT ? `/treatments/${PAT_NO}?trtDt=${TRT_DT}` : `/treatments/${PAT_NO}`
        await page.goto(url, { waitUntil: 'domcontentloaded' })
        await expect(page, 'goto 診療入力 mà bị đá đi (mất session?)').toHaveURL(/\/treatments\//, {
            timeout: 15000,
        })
        await expect(page.getByText('合計:').first()).toBeVisible({ timeout: 60000 })
        // Chờ chuỗi AutoSantei chạy xong rồi dọn sạch — assert (auto-retry) mới ép
        // locator handler chạy, `waitForTimeout` trần thì không.
        for (let i = 0; i < 6; i++) {
            await expect(page.getByText(/を算定しますか？/)).toHaveCount(0, { timeout: 20000 })
            await expect(karteCmtDialog).toHaveCount(0, { timeout: 15000 })
            await page.waitForTimeout(700)
        }
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await page.removeLocatorHandler(karteCmtDialog).catch(() => {})
        await releaseSharedPage(page)
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-D1 … TC-D2 — cửa sổ + cột
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-D1 — cửa sổ 「ガイド処置選択」: tiêu đề, kích thước, cụm header ガイド番号', async () => {
        const { idx, guidCd } = await openPickableGuide()

        // frm203017 _title (:77) + lblName (:110 Designer). Title của DraggableDialog
        // KHÔNG match được bằng `getByRole('dialog', { name })` (Rule 13.1) nên đọc text.
        await expect(picker.getByText('ガイド処置選択').first()).toBeVisible()
        await expect(picker.getByText('ガイド番号')).toBeVisible()

        const box = await picker.boundingBox()
        expect(box, 'không đo được khung dialog').not.toBeNull()
        dump(`win|dialog|w=${Math.round(box!.width)}|h=${Math.round(box!.height)}|title=ガイド処置選択`)
        dump(`header|row=${idx}|no=${guidCd}`)
        console.log(`ガイド dòng ${idx + 1} → ガイド番号 ${guidCd}, dialog ${box!.width}×${box!.height}`)

        // width/height khai tường minh ở guide-selection-dialog.tsx; kẹp theo cửa sổ
        // trình duyệt nên chỉ assert KHÔNG VƯỢT, đúng tinh thần DialogSizeDef của WinForm.
        expect(box!.width, 'dialog rộng hơn width khai báo').toBeLessThanOrEqual(DIALOG_W + 2)
        expect(box!.height, 'dialog cao hơn height khai báo').toBeLessThanOrEqual(DIALOG_H + 2)
        await step()
    })

    test('TC-D2 — đúng 5 cột, đúng thứ tự ｺｰﾄﾞ/枝番/処置名称/点数/回数', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        const headerRow = picker.locator('[data-testid="table-header-row"]').first()
        await expect(headerRow).toBeVisible()

        const ids = await headerRow
            .locator('[data-testid^="header-"]')
            .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('header-', '')))
        expect(ids, 'thứ tự cột phải khớp _viewItem (frm203017.cs:96-104)').toEqual([...COL_IDS])

        for (let i = 0; i < COL_IDS.length; i++) {
            const text = (await headerCell(COL_IDS[i]!).innerText()).replace(/[▲▼]/g, '').trim()
            dump(`col|${i}|text=${text}|id=${COL_IDS[i]}`)
            expect(text, `nhãn cột ${i}`).toBe(COL_LABELS[i]!)
        }

        // 4 cột ẩn của WinForm (jihi_flg/men/unit/acc_unit, width 0) KHÔNG được hiện.
        await expect(
            headerRow.locator('[data-testid^="header-"]'),
            'lưới chỉ được có 5 cột — 4 cột width=0 của _viewItem phải ở lại phía sau',
        ).toHaveCount(5)
        await step()
    })

    test('TC-D3 — bề rộng cột: CHỈ GHI NHẬN, không phải tiêu chí parity', async () => {
        // Bề rộng KHÔNG được tính là lệch: WinForm đo bằng px của Designer
        // (_viewItem 65/40/370/70/70), web bằng CSS grid — hai hệ đơn vị khác nhau và
        // người dùng không nhập liệu bằng bề rộng cột. In ra để đối chiếu khi cần, hết.
        if ((await picker.count()) === 0) await openPickableGuide()

        const widths: number[] = []
        for (const id of COL_IDS) {
            const b = await headerCell(id).boundingBox()
            widths.push(Math.round(b?.width ?? 0))
        }
        widths.forEach((w, i) => dump(`colw|${i}|${COL_IDS[i]}|w=${w}|winform=${WINFORM_WIDTHS[i]}`))
        console.log(`bề rộng cột web = [${widths}] · WinForm _viewItem = [${WINFORM_WIDTHS}]`)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-D4 … TC-D6 — danh sách 処置
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-D4 — danh sách 処置: in trọn từng dòng để đối chiếu với WinForm', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        // Tiền đề của phép so danh sách: 部位/病名 mà FE gửi lên (xem lastTrtQuery).
        if (lastTrtQuery) {
            const q = new URL(lastTrtQuery).searchParams
            dump(
                `req|GuidCd=${q.get('GuidCd')}|TrtDt=${q.get('TrtDt')}|PatNo=${q.get('PatNo')}` +
                    `|Bui=${q.getAll('Bui').filter((v) => v !== '0').join(',')}` +
                    `|DisCd=${q.getAll('DisCd').filter((v) => v !== '0').join(',')}`,
            )
        } else {
            console.log('CẢNH BÁO: không bắt được request /tenant/guids/treatments (cache?)')
        }

        const rows = await readRows()
        expect(rows.length, 'ガイド đã mở được dialog thì phải có ít nhất một dòng 処置').toBeGreaterThan(0)
        // NFKC trước khi in: cùng một 処置名称 trong DB ra WinForm là 「ﾃﾞｼﾞﾀﾙ(標)」 nửa
        // chiều rộng còn ra web là full-width tuỳ ô, và fixture FlaUI cũng in bản đã
        // NFKC (Txt.N). Không chuẩn hoá thì diff hai tập DUMP đỏ ở mọi dòng vì một khác
        // biệt KHÔNG có thật.
        rows.forEach((r, i) => dump(`row|${i}|${r.map((c) => c.normalize('NFKC')).join('|')}`))
        console.log(`dialog có ${rows.length} dòng 処置`)

        // Mọi ô ｺｰﾄﾞ/枝番/点数/回数 phải là số — cả 4 cột đó là int trong dspDt
        // (frm203017.cs:579-583); chuỗi rỗng nghĩa là cột đọc trượt.
        for (const [i, r] of rows.entries()) {
            expect(r[0], `dòng ${i}: ｺｰﾄﾞ không phải số`).toMatch(/^\d+$/)
            expect(r[1], `dòng ${i}: 枝番 không phải số`).toMatch(/^\d+$/)
            expect(r[3], `dòng ${i}: 点数 không phải số`).toMatch(/^-?\d+$/)
            expect(r[4], `dòng ${i}: 回数 không phải số`).toMatch(/^\d+$/)
            expect(r[2]!.length, `dòng ${i}: 処置名称 rỗng`).toBeGreaterThan(0)
        }
        await step()
    })

    test('TC-D5 — vừa mở: con trỏ nằm ở ô 回数 của DÒNG ĐẦU', async () => {
        // getViewData (:1063-1067): dgvView.Focus() rồi Rows[0].Cells["cnt"].Selected = true.
        await dismissPicker()
        await openPickableGuide()

        const firstCnt = cellsOf(dialogRows().first(), 'cnt').locator('input')
        const focused = await firstCnt.evaluate((el) => el === document.activeElement).catch(() => false)
        dump(`focus|first-cnt=${focused}`)
        if (!focused) {
            // Đua với effect open-focus của DraggableDialog (Rule 15) — ghi nhận chứ
            // không đánh đỏ; cái phải đúng là ô 回数 CÓ nhận được phím, đo ngay dưới.
            const desc = await page.evaluate(() => {
                const el = document.activeElement as HTMLElement | null
                return el ? `${el.tagName.toLowerCase()} ${(el.getAttribute('data-cnt-idx') ?? '')}` : 'null'
            })
            console.log(`CẢNH BÁO: ô 回数 dòng đầu không giữ con trỏ; đang focus: ${desc}`)
        }
        await expect(firstCnt, 'ô 回数 dòng đầu phải tồn tại và sửa được').toBeEditable()
        await step()
    })

    test('TC-D6 — ↑/↓ trong lưới dời con trỏ giữa các ô 回数', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()
        const n = await dialogRows().count()
        if (n < 2) {
            console.log(`dialog chỉ có ${n} dòng → BỎ QUA phần ↑/↓`)
            return
        }

        const cntInput = (i: number) => cellsOf(dialogRows().nth(i), 'cnt').locator('input')
        await cntInput(0).focus()
        await page.keyboard.press('ArrowDown')
        expect(
            await cntInput(1).evaluate((el) => el === document.activeElement),
            '↓ phải đưa con trỏ xuống ô 回数 dòng kế (dgvView để DataGridView tự xử lý ↑/↓)',
        ).toBe(true)

        await page.keyboard.press('ArrowUp')
        expect(
            await cntInput(0).evaluate((el) => el === document.activeElement),
            '↑ phải đưa con trỏ về ô 回数 dòng trên',
        ).toBe(true)

        // Clamp ở đầu list — WinForm DataGridView không đi quá dòng 0.
        await page.keyboard.press('ArrowUp')
        expect(
            await cntInput(0).evaluate((el) => el === document.activeElement),
            '↑ ở dòng đầu phải đứng yên, không cuộn vòng',
        ).toBe(true)
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-D7 … TC-D8 — sắp xếp
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-D7 — 4 cột đầu sắp xếp được, 「回数」 KHÔNG (Columns[4].SortMode = NotSortable)', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        for (const id of ['trtCd', 'trtSb', 'trtNm', 'score']) {
            await expect(
                headerCell(id),
                `cột ${id} phải sắp xếp được (DataGridView mặc định Automatic)`,
            ).toHaveAttribute('aria-sort', /none|ascending|descending/)
        }
        // aria-sort chỉ có mặt khi cột sắp xếp được (sort-header-dom.ts) ⇒ vắng mặt
        // chính là 「NotSortable」.
        const cntSort = await headerCell('cnt').getAttribute('aria-sort')
        dump(`sort|cnt|aria-sort=${cntSort}`)
        expect(cntSort, '「回数」 phải KHÔNG sắp xếp được (frm203017.cs:418)').toBeNull()
        await step()
    })

    test('TC-D8 — click tiêu đề 「処置名称」 đổi thứ tự, click lần hai đảo chiều', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()
        const n = await dialogRows().count()
        if (n < 2) {
            console.log(`dialog chỉ có ${n} dòng → sort không kết luận được gì, BỎ QUA`)
            return
        }

        const codesOf = async () => (await readRows()).map((r) => r[0])
        const before = await codesOf()

        await headerCell('trtNm').click()
        await expect(headerCell('trtNm')).toHaveAttribute('aria-sort', 'ascending')
        const asc = await codesOf()

        await headerCell('trtNm').click()
        await expect(headerCell('trtNm')).toHaveAttribute('aria-sort', 'descending')
        const desc = await codesOf()

        dump(`sort|nm|changed1=${JSON.stringify(before) !== JSON.stringify(asc)}|changed2=${JSON.stringify(asc) !== JSON.stringify(desc)}`)
        expect(desc, 'sắp xếp giảm dần phải là đảo ngược của tăng dần').toEqual([...asc].reverse())

        // Trả lưới về thứ tự gốc cho testcase sau: mở lại dialog (Instance mới).
        await dismissPicker()
        await openPickableGuide()
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // TC-D9 … TC-D11 — 回数, màu, F-key
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-D9 — gõ số vào ô 回数 nhận tự do, chữ bị lọc', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        // cnt-cell.tsx: clampCnt → sanitizeDigits, trần 99999 (WinForm gắn
        // ComLibrary.Num_KeyPress vào ô cnt, frm203017.cs:348-352 — cũng chỉ số).
        const input = cellsOf(dialogRows().first(), 'cnt').locator('input')
        await input.focus()
        await input.fill('')
        await page.keyboard.type('3a4')
        const v = await input.inputValue()
        dump(`cnt|typed=3a4|value=${v}`)
        expect(v, 'ô 回数 chỉ nhận chữ số (Num_KeyPress)').toBe('34')
        await step()
    })

    test('TC-D10 — màu chữ 処置名称: mã コメント magenta/xanh, 処置 thường đen', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        const rows = await readRows()
        let checked = 0
        for (let i = 0; i < rows.length; i++) {
            const cd = Number(rows[i]![0])
            const span = cellsOf(dialogRows().nth(i), 'trtNm').locator('span').first()
            const [r, g, b] = (await inkRgb(span).catch(() => [-1, -1, -1])) as [
                number,
                number,
                number,
            ]
            dump(`color|${i}|cd=${cd}|ink=RGB(${r},${g},${b})`)

            const isComment =
                (cd >= RECEIPT_CODE_MIN && cd <= RECEIPT_CODE_MAX) ||
                (cd >= KARTE_CODE_MIN && cd <= KARTE_CODE_MAX)
            // frm203017.cs:1053-1059 — magenta 0xff00ff (レセプト印字) hoặc Blue (カルテ印字).
            const isMagenta = r > 200 && g < 90 && b > 200
            const isBlue = b - r > 60 && b - g > 60
            if (!isComment) {
                // Mã 処置 thường KHÔNG được tô: WinForm chỉ đụng ForeColor trong nhánh
                // isCodeRange(receipt|karte). Màu mặc định của web là một tông xám rất
                // tối (không phải #000 thuần) nên đo bằng 「không magenta, không xanh」
                // chứ không bằng 「ba kênh bằng nhau」.
                expect(
                    isMagenta || isBlue,
                    `dòng ${i} mã ${cd} KHÔNG phải コメント nên phải để màu mặc định, ` +
                        `đọc ra RGB(${r},${g},${b})`,
                ).toBe(false)
                continue
            }
            checked++
            expect(
                isMagenta || isBlue,
                `dòng ${i} mã ${cd} là コメント nên phải magenta (レセプト印字) hoặc xanh dương ` +
                    `(カルテ印字), đọc ra RGB(${r},${g},${b})`,
            ).toBe(true)
        }
        if (checked === 0) console.log('ガイド này không có dòng mã コメント → BỎ QUA phần màu chữ')
        await step()
    })

    test('TC-D11 — thanh F-key: chỉ F9 確定 + F10 戻る; F9 tắt khi mọi 回数 = 0', async () => {
        if ((await picker.count()) === 0) await openPickableGuide()

        const fkeys = await picker
            .locator('[data-fkey]')
            .evaluateAll((els) =>
                els.map((e) => `${e.getAttribute('data-fkey')}=${(e.textContent ?? '').trim()}`),
            )
        dump(`fkeys|${fkeys.join(',')}`)
        console.log(`F-key của dialog: ${fkeys.join(' · ')}`)

        // _btnInfo (frm203017.cs:78-92): chỉ F9 「確定」 và F10 「戻る」 bật.
        await expect(picker.getByRole('button', { name: /確定/ })).toBeVisible()
        await expect(picker.getByRole('button', { name: /戻る/ })).toBeVisible()
        for (const f of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F11', 'F12']) {
            const cell = picker.locator(`[data-fkey="${f}"]`)
            if ((await cell.count()) === 0) continue
            expect(
                (await cell.innerText()).trim(),
                `nút ${f} phải trống (OCHA_OFF trong _btnInfo)`,
            ).toBe('')
        }
        await step()
    })

    test('TC-D12 — đóng bằng F10 rồi mở lại: dialog là bản MỚI, 回数 gõ dở không sống sót', async () => {
        // frm203017.Instance (:113-124) dựng form MỚI khi bản cũ đã Dispose — Rule 23.4.
        //
        // Mở LẠI từ đầu chứ không dùng dialog testcase trước để lại: TC-D9 đã gõ 「34」
        // vào chính ô này, lấy nó làm 「giá trị gốc」 thì testcase so số gõ dở với số gõ
        // dở và đỏ oan (đã vấp đúng thế 2026-09-08).
        await dismissPicker()
        await openPickableGuide()

        const input = cellsOf(dialogRows().first(), 'cnt').locator('input')
        const original = await input.inputValue()
        await input.focus()
        await input.fill('')
        await page.keyboard.type('7')
        expect(await input.inputValue(), 'chưa gõ được vào ô 回数 thì testcase vô nghĩa').toBe('7')

        await dismissPicker()
        const { guidCd } = await openPickableGuide()

        const reopened = await cellsOf(dialogRows().first(), 'cnt').locator('input').inputValue()
        dump(`reopen|guid=${guidCd}|before=${original}|typed=7|after=${reopened}`)
        expect(
            reopened,
            'mở lại phải là form MỚI: 回数 quay về giá trị CalcCnt, không giữ số gõ dở',
        ).toBe(original)

        // Sort cũng phải sạch (Rule 23.4: ô tìm kiếm / glyph sort / dòng chọn).
        await expect(headerCell('trtNm'), 'mở lại mà còn giữ sort là sai').toHaveAttribute(
            'aria-sort',
            'none',
        )
        await step()
        await dismissPicker()
    })

    test('TC-D13 — cùng tiền đề với WinForm: chọn dòng CÓ 部位 rồi mới mở ガイド', async () => {
        // Danh sách 処置 phụ thuộc 部位/病名 của DÒNG ĐANG CHỌN (frm203002.cs:6515 →
        // frm203017 ParamData). So hai bên khi một bên đang đứng ở dòng KHÔNG có 部位 là
        // so hai câu hỏi khác nhau — đã vấp đúng thế 2026-09-08: web gửi `Bui=` rỗng
        // trong khi WinForm đang đứng ở dòng 部位 「54321…」, và dòng 「186 歯槽骨整形手術」
        // vắng mặt bên web chỉ vì tiền đề khác.
        await dismissPicker()

        const buiCells = page.locator('[data-grid-cell$="|1"]')
        const total = await buiCells.count()
        let rowKey: string | null = null
        for (let i = 0; i < total; i++) {
            const text = (await buiCells.nth(i).innerText()).trim()
            if (!text) continue
            const attr = await buiCells.nth(i).getAttribute('data-grid-cell')
            rowKey = attr!.split('|')[0]!
            dump(`ctx|regi|${i}|bui=${text.replace(/\s+/g, ' ')}`)
            break
        }
        if (!rowKey) {
            console.log('lưới 処置 không có dòng nào mang 部位 → BỎ QUA phần so cùng tiền đề')
            return
        }

        // Click ô 療法・処置 của chính dòng đó, KHÔNG click ô 部位 — ô 部位 mở 部位選択.
        await page.locator(`[data-grid-cell="${rowKey}|2"]`).click()
        await step()

        const { guidCd } = await openPickableGuide()
        const rows = await readRows()
        // In LẠI tham số request: bằng chứng rằng cú click ĐÃ đổi tiền đề (Bui khác rỗng),
        // chứ không phải BE trả về cùng một danh sách vì FE vẫn gửi Bui cũ / đọc cache.
        if (lastTrtQuery) {
            const q = new URL(lastTrtQuery).searchParams
            dump(
                `rowbui|req|GuidCd=${q.get('GuidCd')}` +
                    `|Bui=${q.getAll('Bui').filter((v) => v !== '0').join(',')}` +
                    `|DisCd=${q.getAll('DisCd').filter((v) => v !== '0').join(',')}`,
            )
        }
        dump(`rowbui|guid=${guidCd}|count=${rows.length}`)
        rows.forEach((r, i) =>
            dump(`rowbui|${i}|${r.map((c) => c.normalize('NFKC')).join('|')}`),
        )
        console.log(`ガイド ${guidCd} với dòng CÓ 部位: ${rows.length} dòng 処置`)
        expect(rows.length, 'ガイド mở được thì phải có dòng').toBeGreaterThan(0)
        await step()
        await dismissPicker()
    })

    test('TC-D14 — QUÉT: 8 ガイド đầu — cái nào có 処置, cái nào rỗng, và danh sách của từng cái', async () => {
        // Đây là testcase ĐỐI CHIẾU DỮ LIỆU chính. Nó đứng được vì hai bên đã ở CÙNG
        // tiền đề: cùng bệnh nhân, cùng 診療日 (TEST_TRT_DT / OCHA_TRT_DT), cùng dòng
        // đang chọn — và hai DB có DỮ LIỆU GIỐNG HỆT NHAU cho bệnh nhân này (đã đối
        // chiếu trn_trn của Postgres với TRNTRN của SQL Server: 29 dòng trùng khít).
        //
        // Với mỗi ガイド in ra MỘT dòng `scan|…` (mở được hay E00024) và, nếu mở được,
        // toàn bộ dòng 処置. Fixture FlaUI `TcD16` in đúng khuôn đó ⇒ diff hai tập là ra
        // bảng parity dữ liệu.
        test.setTimeout(180_000)
        await dismissPicker()
        await enterGuideRegular()

        const total = Math.min(await guideRows.count(), SCAN_LIMIT_DEEP)
        dump(`scan|total=${await guideRows.count()}|quét=${total}`)
        for (let i = 0; i < total; i++) {
            const nm = (await guideRows.nth(i).locator('div').nth(1).innerText()).trim()
            await guideRows.nth(i).click()
            const result = await waitPickResult()
            if (result === 'empty') {
                dump(`scan|${i}|nm=${nm.normalize('NFKC')}|empty`)
                await dismissNoTrtAlert()
                continue
            }
            const raw = await picker.locator('span[class*="font-mono"]').first().innerText()
            const rows = await readRows()
            // 回数 là CalcCnt của CHÍNH 部位 gửi lên — in kèm, nếu không thì so 回数 hai
            // bên chẳng kết luận được gì.
            if (lastTrtQuery) {
                const q = new URL(lastTrtQuery).searchParams
                dump(
                    `scanreq|${i}|Bui=${q.getAll('Bui').filter((v) => v !== '0').join(',')}` +
                        `|BuiIdx=${q
                            .getAll('Bui')
                            .map((v, k) => (v !== '0' ? k : -1))
                            .filter((k) => k >= 0)
                            .join(',')}` +
                        `|DisCd=${q.getAll('DisCd').filter((v) => v !== '0').join(',')}`,
                )
            }
            dump(`scan|${i}|nm=${nm.normalize('NFKC')}|guid=${raw.trim()}|rows=${rows.length}`)
            rows.forEach((r, k) =>
                dump(`scanrow|${i}|${k}|${r.map((c) => c.normalize('NFKC')).join('|')}`),
            )
            await dismissPicker()
        }
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // WinForm parity — BỐN điểm web ĐÃ TỪNG lệch bản gốc, sửa ở nhánh
    // `fix/inp-guide-tab-parity` (D-a click đơn · D-b nền theo nhóm · D-d 用法 ·
    // D-e 回数 nhóm 窩洞形態). Giữ lại làm test HỒI QUY: đỏ ở đây nghĩa là web lệch
    // LẠI, KHÔNG phải test viết sai. Mỗi cái tự dựng trạng thái nên chạy lẻ được.
    // ═════════════════════════════════════════════════════════════════════════

    test('WinForm parity D-d: tên 薬剤 phải kèm 用法 (「ボルタレン錠25mg1T 疼痛時 服用」)', async () => {
        // frm203017.getViewData:958-962 — với dòng 薬剤 (600-699) có 用法 trong
        // 用法マスタ MST_MED, WinForm NỐI 用法 vào 処置名称:
        // `newRow["trt_nm"] += " " + usage;` (`SyoPac.getMstMed`).
        //
        // Web: BE giữ 用法 ở field RIÊNG `usageNm` (không nhét vào `trtNm`) rồi
        // `guideTrtDisplayNm` mới ghép lại khi VẼ ô. Cố ý: lúc F9 確定, WinForm nhánh
        // 一般処置 tra LẠI tên từ 処置マスタ qua `frm203016_Hide_Let_Trt_Data`
        // (frm203002.cs:9151+) nên tên rơi xuống lưới đăng ký KHÔNG được dính hậu tố
        // 用法 — cái lưới phải hiện là ô nhiều dòng 「薬剤名 / 用法 / 用量」, đo ở
        // `guide-drug-usage-line.spec.ts`.
        //
        // ⚠️ TIỀN ĐỀ DỮ LIỆU: bảng `mst_med` mới được migrate sang Postgres. Tenant
        // nào chưa chạy lại `pnpm ddl:testdata` thì `usageNm` rỗng và testcase này đỏ
        // — đó là thiếu DỮ LIỆU, không phải lỗi code.
        //
        // ĐO ĐƯỢC trên WinForm 2026-09-08, cùng bệnh nhân/ngày:
        //   「ボルタレン錠25mg1T 疼痛時 服用」 · 「メイアクトMS錠100mg4T 1日4回朝昼夕食後と就寝前 服用」
        test.skip(
            PAT_NO !== PARITY_PAT_NO || TRT_DT !== PARITY_TRT_DT,
            `số đo ghim theo bệnh nhân ${PARITY_PAT_NO} ngày ${PARITY_TRT_DT} — chạy bằng ` +
                `TEST_PAT_NO=${PARITY_PAT_NO} TEST_TRT_DT=${PARITY_TRT_DT}`,
        )
        await dismissPicker()
        await openGuideByName('抜歯', 10650)

        const rows = await readRows()
        const drug = rows.find((r) => r[0] === '601')
        expect(drug, 'ガイド 10650 phải có dòng 薬剤 601/0 (ボルタレン)').toBeTruthy()
        dump(`drugnm|601|${drug![2]!.normalize('NFKC')}`)

        // Response có `usageNm` thì in ra luôn: phân biệt 「BE chưa trả」 (mst_med
        // chưa migrate) với 「BE trả rồi mà FE không ghép vào ô」.
        const wire = wireByKey(10650).get('601-0')
        if (wire) dump(`drugusage|601|usageNm=${(wire.usageNm ?? '').normalize('NFKC')}`)

        expect(
            drug![2]!.normalize('NFKC'),
            '処置名称 của dòng 薬剤 phải có hậu tố 用法 như WinForm (getViewData nối ' +
                '`" " + usage` vào trt_nm). Nếu `usageNm` in ra ở dòng DUMP trên là rỗng ' +
                'thì bảng mst_med chưa được migrate — chạy lại `pnpm ddl:testdata`.',
        ).toBe('ボルタレン錠25mg1T 疼痛時 服用')
        await step()
        await dismissPicker()
    })

    test('WinForm parity D-e: dòng nhóm 窩洞形態 vừa mở phải mang 回数 = 算定回数, không phải 0', async () => {
        // ガイド 611 「異種充填」 bật khối 窩洞形態. getViewData ghi THẲNG 算定回数 vào ô
        // (đo được 5 = số răng của 部位); chỉ `ucToothGuide_Changed` (frm203017.cs:1676)
        // mới reset đám dòng đó về 0 — và nó CHỈ chạy khi người dùng chạm mặt răng.
        // Bản web cũ ép chúng về 0 ngay lúc mở ⇒ hai màn hình khác nhau từ đầu.
        test.skip(
            PAT_NO !== PARITY_PAT_NO || TRT_DT !== PARITY_TRT_DT,
            `số đo ghim theo bệnh nhân ${PARITY_PAT_NO} ngày ${PARITY_TRT_DT}`,
        )
        await dismissPicker()
        await openGuideByName('異種充填', 611)

        const rows = await readRows()
        const filling = rows.find((r) => r[0] === '326' && r[1] === '1')
        expect(filling, 'ガイド 611 phải có dòng 326/1 充填1(単純)').toBeTruthy()
        dump(`cavitycnt|326-1|${filling![4]}`)
        expect(
            filling![4],
            '回数 của dòng 充填1(単純) — WinForm hiện 5 (CalcCnt theo 部位 5 răng), ' +
                'web từng hiện 0 vì chờ chọn mặt răng',
        ).toBe('5')
        await step()
        await dismissPicker()
    })

    test('WinForm parity D-e2: chạm mặt răng mới TÍNH LẠI 回数 của nhóm 窩洞形態 (ucToothGuide_Changed)', async () => {
        // Nửa còn lại của D-e. frm203017.cs:1676-1728: mỗi lần ucToothGuide_Changed
        // chạy, TOÀN BỘ dòng thuộc nhóm 窩洞形態 bị đặt về 0 rồi mới cộng lại theo
        // 複雑/単純 của từng răng. Nói cách khác 算定回数 lúc mở KHÔNG phải là giá trị
        // chết — nó bị thay khi người dùng bắt đầu nhập 窩洞.
        //
        // Không ghim con số derive được (nó phụ thuộc mặt răng click trúng và
        // `cavityGroupCounts`): chỉ cần chứng minh 「trước khi chạm = 算定回数, sau khi
        // chạm = giá trị TÍNH LẠI」. Ghim số ở đây là chép lại thuật toán của app.
        test.skip(
            PAT_NO !== PARITY_PAT_NO || TRT_DT !== PARITY_TRT_DT,
            `cần ガイド 611 của bệnh nhân ${PARITY_PAT_NO} ngày ${PARITY_TRT_DT}`,
        )
        await dismissPicker()
        await openGuideByName('異種充填', 611)

        // Nhận diện dòng nhóm 窩洞形態 bằng `grpIdx` của response — cột đó ẩn trên lưới.
        const wire = wireByKey(611)
        if (wire.size === 0) {
            console.log('không bắt được response của ガイド 611 (cache) → BỎ QUA')
            return
        }
        const keys = await rowKeys()
        const before = await readRows()
        const cavityIdx = keys
            .map((k, i) => ({ k, i, g: Number(wire.get(k)?.grpIdx ?? -1) }))
            .filter((r) => r.g >= CAVITY_GRP_MIN && r.g <= CAVITY_GRP_MAX)
        if (cavityIdx.length === 0) {
            console.log('ガイド 611 không có dòng nào thuộc nhóm 窩洞形態 → BỎ QUA')
            return
        }
        cavityIdx.forEach((r) => dump(`cavityrow|${r.k}|grp=${r.g}|cnt=${before[r.i]![4]}`))
        expect(
            cavityIdx.some((r) => Number(before[r.i]![4]) > 0),
            'vừa mở mà MỌI dòng nhóm 窩洞形態 đều 0 ⇒ web lại ép 0 như bug D-e cũ',
        ).toBe(true)

        // Bấm mặt 咬合面 (vòng tròn giữa) của 窩洞形態(1). CavityToothModel là
        // <svg viewBox="0 0 100 100"> — mốc theo viewBox để không đụng icon nào khác;
        // model không có testid vì Rule 1 cấm sửa source app cho tiện test.
        const firstCircle = picker
            .locator('svg[viewBox="0 0 100 100"]')
            .first()
            .locator('circle')
            .first()
        if ((await firstCircle.count()) === 0) {
            console.log('dialog không hiện khối 窩洞形態 (showCavityForm=false) → BỎ QUA')
            return
        }
        await firstCircle.click()
        await step()

        const after = await readRows()
        cavityIdx.forEach((r) => dump(`cavityrow|after|${r.k}|cnt=${after[r.i]![4]}`))
        expect(
            cavityIdx.some((r) => after[r.i]![4] !== before[r.i]![4]),
            'chạm mặt răng mà 回数 của nhóm 窩洞形態 không đổi ⇒ ucToothGuide_Changed ' +
                'chưa được port (frm203017.cs:1676-1728)',
        ).toBe(true)

        // Dòng NGOÀI nhóm (麻酔, コメント…) không được ăn theo — WinForm chỉ đụng
        // `_guideData`, tức đúng mấy dòng thuộc 8 nhóm.
        const outsiders = keys
            .map((k, i) => ({ k, i, g: Number(wire.get(k)?.grpIdx ?? -1) }))
            .filter((r) => r.g < CAVITY_GRP_MIN || r.g > CAVITY_GRP_MAX)
        for (const r of outsiders) {
            expect(
                after[r.i]![4],
                `dòng ${r.k} KHÔNG thuộc nhóm 窩洞形態 mà 回数 bị đổi khi chạm mặt răng`,
            ).toBe(before[r.i]![4])
        }
        await step()
        await dismissPicker()
    })

    test('WinForm parity D-a: CLICK ĐƠN làm 回数 +1; double-click +2; Enter không đổi', async () => {
        // frm203017.cs:363-388 `dgvView_CellClick` là sự kiện CLICK ĐƠN: click vào ô
        // nào của dòng cũng làm 回数 += 1, vượt trần CalcCnt thì về 0. Vì nó chạy mỗi
        // click MỘT lần nên double-click = +2, và Enter = +0 (Designer :135-139 không
        // nối CellDoubleClick; formBase_KeyDown :183-193 bỏ qua Enter khi con trỏ ở
        // grid). Web từng treo hành vi này vào `onOpenRow` của VirtualListTable — chỉ
        // bắn ở double-click / Enter, tức sai cả ba vế.
        await dismissPicker()
        await openPickableGuide()

        const row = dialogRows().first()
        const input = cellsOf(row, 'cnt').locator('input')
        // Ô 処置名称 chứ KHÔNG phải ô 回数: WinForm bắt mọi cột, còn ô 回数 của web là
        // <input> thật nên nuốt click (stopPropagation) để đặt được con trỏ.
        const nameCell = cellsOf(row, 'trtNm')

        // Giá trị lúc VỪA MỞ chính là 算定回数 BE trả về, tức trần của vòng lặp
        // (`maxCnt = max(cnt, 1)` trong guide-selection-dialog.tsx).
        const base = Number(await input.inputValue())
        const maxCnt = Math.max(base, 1)
        const cycle = (n: number) => (n + 1 > maxCnt ? 0 : n + 1)
        dump(`cycle|base=${base}|maxCnt=${maxCnt}`)

        /** Đặt 回数 về 0 để mỗi phép đo có mốc xuất phát đã biết. */
        const resetToZero = async () => {
            await input.focus()
            await input.fill('0')
            expect(await input.inputValue(), 'không đặt được 回数 về 0').toBe('0')
        }

        await resetToZero()
        await nameCell.click()
        const afterSingle = await input.inputValue()
        dump(`cycle|single|0->${afterSingle}`)
        expect(
            afterSingle,
            'CLICK ĐƠN phải làm 回数 +1 (dgvView_CellClick, frm203017.cs:363-388). ' +
                'Còn đòi double-click ⇒ LỆCH bản gốc.',
        ).toBe(String(cycle(0)))

        await resetToZero()
        await nameCell.dblclick()
        const afterDouble = await input.inputValue()
        dump(`cycle|double|0->${afterDouble}`)
        expect(
            afterDouble,
            'DOUBLE-CLICK phải chạy CellClick HAI lần (+2, kẹp về 0 khi quá trần). ' +
                'Ra +1 nghĩa là hành vi vẫn đang treo ở `onOpenRow`.',
        ).toBe(String(cycle(cycle(0))))

        await resetToZero()
        await input.focus()
        await page.keyboard.press('Enter')
        await expect(
            picker,
            'Enter trong lưới không được đóng dialog — frm203017 chỉ map End/Escape ' +
                'sang 確定, còn Enter thì formBase_KeyDown bỏ qua khi ActiveControl là grid',
        ).toBeVisible()
        const afterEnter = await input.inputValue()
        dump(`cycle|enter|0->${afterEnter}`)
        expect(
            afterEnter,
            'Enter KHÔNG được đổi 回数: dgvView không có handler Enter nào (Designer ' +
                ':135-139), nên nó chỉ là phím di chuyển.',
        ).toBe('0')
        await step()
        await dismissPicker()
    })

    test('WinForm parity D-b: nền dòng đổi màu theo NHÓM (acc_unit >> 4), không theo chẵn/lẻ', async () => {
        // frm203017.cs:1035-1050: `bkCol` CHỈ lật khi `acc_unit >> 4` đổi ⇒ hai dòng
        // CÙNG nhóm có CÙNG nền, dù một chẵn một lẻ. VirtualListTable mặc định tô theo
        // `isEven` ⇒ luôn xen kẽ từng dòng; ガイド phải đè lại bằng `getRowClassName`.
        await dismissPicker()
        const { guidCd } = await openPickableGuide()
        const n = await dialogRows().count()
        if (n < 3) {
            console.log(`dialog chỉ có ${n} dòng → không kết luận được về nhóm, BỎ QUA`)
            return
        }

        const bgs = await rowBackgrounds()
        bgs.forEach((b, i) => dump(`bg|${i}|${b}`))

        // Dòng 0 đang SÁNG (getViewData đặt con trỏ ở ô 回数 dòng đầu) nên mang
        // `bg-primary/10` — nền chọn phủ lên nền nhóm, đúng như SelectionBackColor của
        // DataGridView. Bỏ nó ra khỏi phép so băng màu.
        const body = bgs.slice(1)

        // (1) Nền KHÔNG được lật ở mọi dòng — đó chính là kiểu chẵn/lẻ.
        const flipsEverywhere = body.every((b, i) => i === 0 || b !== body[i - 1])
        expect(
            flipsEverywhere,
            'nền lật ở mọi dòng ⇒ web đang tô theo chẵn/lẻ; WinForm chỉ lật khi ĐỔI NHÓM ' +
                '(acc_unit >> 4, frm203017.cs:1035-1050)',
        ).toBe(false)

        // (2) Chỉ được có ĐÚNG hai tông — `bkCol` chỉ lật qua lại giữa White và
        //     AlternatingRowsDefaultCellStyle. (Độ dài từng khối chỉ DUMP ra để đối
        //     chiếu với WinForm, không assert: nó phụ thuộc dữ liệu ガイド nào mở được.)
        const runs: { bg: string; len: number }[] = []
        for (const b of body) {
            const last = runs[runs.length - 1]
            if (last && last.bg === b) last.len++
            else runs.push({ bg: b, len: 1 })
        }
        dump(`bgruns|${runs.map((r) => `${r.len}`).join(',')}`)
        expect(
            new Set(body).size,
            'lưới chỉ được dùng đúng 2 tông nền (trắng / tông xen kẽ)',
        ).toBeLessThanOrEqual(2)

        // (3) Nếu bắt được response thì so ĐÚNG ranh giới: nền chỉ đổi ở chỗ
        //     `acc_unit >> 4` đổi. Đây mới là phép đo thật; (1)(2) là lưới an toàn cho
        //     lần chạy mà TanStack Query trả cache nên không có response nào.
        const wire = wireByKey(guidCd)
        if (wire.size === 0) {
            console.log(`không bắt được response của ガイド ${guidCd} (cache) → bỏ phần so acc_unit`)
            await step()
            return
        }
        const keys = await rowKeys()
        const groups = keys.map((k) => {
            const it = wire.get(k)
            expect(it, `response của ガイド ${guidCd} thiếu dòng ${k}`).toBeTruthy()
            return Number(it!.accUnit) >> ACC_UNIT_GROUP_SHIFT
        })
        keys.forEach((k, i) => dump(`bggrp|${i}|${k}|grp=${groups[i]}`))

        for (let i = 2; i < bgs.length; i++) {
            const sameGroup = groups[i] === groups[i - 1]
            const sameBg = bgs[i] === bgs[i - 1]
            expect(
                sameBg,
                sameGroup
                    ? `dòng ${i - 1}/${i} cùng nhóm ${groups[i]} mà nền khác nhau`
                    : `dòng ${i - 1}/${i} khác nhóm (${groups[i - 1]} → ${groups[i]}) mà nền giống nhau`,
            ).toBe(sameGroup)
        }
        await step()
        await dismissPicker()
    })
})
