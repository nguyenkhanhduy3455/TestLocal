import { expect, test, type Locator, type Page } from '@playwright/test'

import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * 連携先 dùng CHUNG giữa hai màn hình: đổi ở đâu thì bên kia thấy ngay.
 *
 *   診療入力設定 (F11, frm203003)   ←→   エージェント設定 › 機器連携 (frm506008)
 *      cboPicLink                          ô レントゲンシステム連携
 *      cboMedicalSupportLink                ô 診療支援システム連携
 *
 * ─── Vì sao hai màn phải khớp nhau ──────────────────────────────────────────
 * Legacy chỉ có MỘT chỗ lưu: `InpInfo.PicLink` / `InpInfo.MedicalSupportLink`
 * (CoopRoentgen.cs). Hai màn của legacy đọc/ghi cùng giá trị đó, nên chúng không
 * thể lệch nhau. Bản web giữ nguyên bất biến ấy bằng cách KHÔNG lưu hai lần:
 * giá trị nằm ở `connector_config.linkCode` của ô xray / medical-support, còn
 * màn 診療入力設定 chỉ đọc và ghi lại chính hàng đó.
 *
 * Lưu hai nơi là cách chắc chắn nhất để một ngày nào đó màn này nói máy trạm
 * chạy Hercules2007 còn màn kia nói NeoPremium — và không ai biết thiết bị nào
 * thật sự đang được ghi.
 *
 * ─── Port web đang có ───────────────────────────────────────────────────────
 *  - features/treatments/lib/treatment-config.ts
 *      · :163-178 treatmentConfigOf → picLink / medicalSupportLink ĐỌC từ
 *        `connectors.find(c => c.category === 'xray' | 'medical-support').linkCode`,
 *        KHÔNG đọc từ `settings`.
 *      · :205-214 toAgentConnectors → GHI ngược đúng hàng đó; ô chưa có hàng thì
 *        thêm mới `enabled:false`, phần còn lại pass-through nguyên xi.
 *  - features/treatments/queries/agent-treatment-config-queries.ts:29 và
 *    features/agent-settings/hooks/use-agent-config-draft.ts:44 — CÙNG gọi
 *    `agentConfigQueryOptions()`, tức cùng cache key `['agent','config']`
 *    (shared/queries/agent.ts:27). Một cache, không thể có nửa cũ nửa mới.
 *  - features/agent-linkage/queries.ts:74-80 — mọi lần lưu (từ MÀN NÀO cũng vậy,
 *    vì cả hai dùng chung `useSaveAgentConfig`) đều invalidate cache đó.
 *
 * ─── Điều hướng TRONG APP, không `page.goto` ────────────────────────────────
 * Suite này đi lại giữa hai màn bằng sidebar chứ không nạp lại trang. Có lý do:
 * nạp lại là vứt cache đi rồi hỏi server từ đầu, lúc đó testcase sẽ xanh kể cả
 * khi hai màn KHÔNG hề dùng chung cache — tức là không còn kiểm được cái nó
 * định kiểm. (Và theo Rule 10.2 thì reload còn làm mất phiên đăng nhập.)
 *
 * ─── SPEC NÀY GHI THẬT ──────────────────────────────────────────────────────
 * Phải lưu thật mới kiểm được lan truyền: chặn request thì lần đọc sau vẫn ra
 * giá trị cũ và testcase vô nghĩa. Nó đổi `connector_config.linkCode` của ô
 * xray + medical-support trên MÁY ĐANG CHẠY, rồi TC-RESTORE-1 trả lại như cũ.
 * Nếu một testcase ở giữa đỏ thì `serial` bỏ qua phần còn lại và cấu hình bị
 * để lại ở hãng thử — mở 機器連携 chọn lại tay, giá trị gốc được in ra ở
 * TC-READ-1. Tắt hẳn bằng `TEST_ALLOW_SAVE=0`.
 *
 * CHẠY TUẦN TỰ, login MỘT lần, thứ tự CÓ ý nghĩa:
 *   npx playwright test tests/agent-linkage-treatment-sync.spec.ts
 */

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Cả hai màn đều đọc `/v1/config`; không có agent thì không màn nào render. */
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

const MST_COD_58_URL = /\/tenant\/mst-cod\?[^ ]*cdTypes=58/
const AGENT_CONFIG_URL = /\/v1\/config(\?|$)/

/** Nhãn của mục "không dùng thiết bị nào" (connector-rows.ts:18). */
const NO_CONNECTOR_LABEL = '連携しない'

interface MstCodRow {
    cdVal: number | string
    anyVal1?: string | null
}
interface AgentConnector {
    category: string
    linkCode: number
    enabled: boolean
    settings: Record<string, unknown>
}
interface AgentConfigBody {
    connectors: AgentConnector[]
    configVersion: number
}

test.describe.configure({ mode: 'serial' })

test.describe('連携先 — 診療入力設定(F11) ↔ 機器連携 đồng bộ hai chiều', () => {
    test.skip(!AGENT_AVAILABLE, AGENT_SKIP_REASON)
    skipWithReason(
        !ALLOW_SAVE,
        'spec này ghi thật cấu hình máy trạm — bỏ TEST_ALLOW_SAVE=0 để chạy',
    )

    let page: Page
    let step: () => Promise<void>

    // ── Màn 機器連携 ─────────────────────────────────────────────────────────
    /** Combo 連携先 của một ô, id ổn định (connector-config-form.tsx:346). */
    let linkageSelectOf: (category: string) => Locator
    /** Ô ディレクトリパス của một ô — dùng để chứng minh F11 không xoá mất. */
    let linkagePathOf: (category: string) => Locator
    let linkageSave: Locator

    // ── Dialog F11 ───────────────────────────────────────────────────────────
    let f11Dialog: Locator
    /** Combo trong F11 — CodMstSelect không có id, phải bám theo nhãn của LabeledRow. */
    let f11SelectOf: (label: string) => Locator

    /** Danh mục hãng, để đổi giữa linkCode và nhãn hiển thị. */
    let picLinkRows: MstCodRow[] = []
    /** Bản `/v1/config` mới nhất đọc được, do handler route ở beforeAll điền. */
    let latestConfig: AgentConfigBody | null = null
    /** Cấu hình lúc bắt đầu — mốc để khôi phục ở TC-RESTORE-1. */
    let original: { xray: number; medsup: number } | null = null
    /** Hãng dùng để thử, chọn sao cho KHÁC hãng đang cài. */
    let probe: { code: number; label: string } | null = null

    /**
     * ディレクトリパス của 4 ô, chụp trong TC-READ-1 lúc CÒN đứng ở màn 機器連携.
     *
     * Không đọc ở đầu TC-SYNC-1 được: TC-READ-1 kết thúc bằng openF11() nên trang
     * đã sang /treatments, và các input này không còn trên DOM.
     */
    const pathsBefore: Record<string, string> = {}

    function labelOf(code: number): string {
        if (code === 0) return NO_CONNECTOR_LABEL
        const row = picLinkRows.find((r) => Number(r.cdVal) === code)
        return row?.anyVal1?.trim() ? row.anyVal1 : String(code)
    }

    /**
     * Bấm một mục sidebar, mở nhóm cha TRƯỚC nếu nó đang đóng.
     *
     * Không bấm nhóm cha vô điều kiện: suite đi lại giữa hai màn nhiều lần, và từ
     * lần thứ hai nhóm đã mở sẵn — bấm nữa là ĐÓNG nó lại, link biến mất và click
     * treo tới hết timeout.
     */
    async function sidebarGo(group: string, item: string) {
        const link = page.getByRole('link', { name: item })
        if (!(await link.isVisible().catch(() => false))) {
            await page.getByRole('button', { name: group }).click()
        }
        await link.click()
    }

    /** Vào màn 機器連携 bằng sidebar (KHÔNG reload — xem chú thích đầu file). */
    async function gotoLinkageTab() {
        await sidebarGo('その他業務', 'エージェント設定')
        await expect(page.getByRole('heading', { name: 'エージェント設定', level: 1 })).toBeVisible({
            timeout: 60000,
        })
        await page.getByRole('tab', { name: '機器連携' }).click()
        await expect(page.getByRole('tab', { name: '機器連携' })).toHaveAttribute(
            'data-state',
            'active',
        )
        // Card レントゲン đã dựng xong thì combo mới đọc được.
        await expect(linkageSelectOf('xray')).toBeVisible({ timeout: 30000 })
    }

    /** Vào /treatments rồi mở dialog F11 設定 (KHÔNG reload). */
    async function openF11() {
        await sidebarGo('日常業務', '診療入力')
        await expect(page.locator('[data-fkey="F11"]')).toBeVisible({ timeout: 60000 })
        await page.keyboard.press('F11')
        await expect(f11Dialog).toBeVisible({ timeout: 30000 })
        // Agent đang chạy nên lời mời khởi động không được bung ra; nếu có thì dọn.
        const offline = page.getByRole('dialog').filter({ hasText: 'エージェントが起動していません' })
        if (await offline.isVisible({ timeout: 2000 }).catch(() => false)) {
            await offline.getByRole('button', { name: 'キャンセル' }).click()
        }
    }

    async function closeF11() {
        await f11Dialog.getByRole('button', { name: 'F10 戻る' }).click()
        await expect(f11Dialog).toBeHidden({ timeout: 10000 })
    }

    /** Chọn một mục trong Radix Select — listbox nằm ở PORTAL cấp body (Rule 12.6). */
    async function pickOption(trigger: Locator, label: string) {
        await trigger.click()
        const listbox = page.getByRole('listbox')
        await expect(listbox).toBeVisible({ timeout: 10000 })
        await listbox.getByRole('option', { name: label, exact: true }).click()
        await expect(listbox).toBeHidden({ timeout: 10000 })
    }

    /** Lưu ở màn 機器連携 và chờ cấu hình mới thật sự nằm trong cache. */
    async function saveLinkage() {
        await expect(linkageSave, 'không có gì thay đổi thì 保存 vẫn tắt').toBeEnabled()
        await linkageSave.click()
        await expect(page.getByText('エージェント設定を保存しました。')).toBeVisible({
            timeout: 60000,
        })
        await expect(linkageSave, 'lưu xong thì form phải sạch trở lại').toBeDisabled({
            timeout: 30000,
        })
    }

    /**
     * Lưu ở dialog F11, và CHỨNG MINH nửa agent thật sự được nhận.
     *
     * Soi thẳng mã trạng thái của PUT /v1/config thay vì chỉ chờ toast
     * 「登録しました。」: nếu agent từ chối, dialog ở lại và toast không bao giờ hiện
     * (sau bản sửa "không nuốt lỗi"), nên chỉ chờ toast là nhận một timeout 60s
     * chẳng nói gì về nguyên nhân. Ở đây in nguyên văn body lỗi của agent.
     */
    async function saveF11() {
        const putRes = page
            .waitForResponse(
                (r) => AGENT_CONFIG_URL.test(r.url()) && r.request().method() === 'PUT',
                { timeout: 60000 },
            )
            .catch(() => null)

        await f11Dialog.getByRole('button', { name: 'F9 登録' }).click()

        const res = await putRes
        expect(
            res,
            'F9 登録 không gửi PUT /v1/config nào — nửa máy trạm đã bị bỏ qua ' +
                '(agentConfig chưa nạp được?)',
        ).not.toBeNull()
        const detail = res!.ok() ? '' : await res!.text().catch(() => '(không đọc được body)')
        expect(
            res!.status(),
            `agent TỪ CHỐI cấu hình do F11 gửi lên — ${res!.status()}: ${detail}`,
        ).toBeLessThan(300)

        await expect(page.getByText('登録しました。')).toBeVisible({ timeout: 60000 })
        await expect(f11Dialog).toBeHidden({ timeout: 30000 })
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)
        page.on('pageerror', (e) => console.log(`pageerror: ${e.message}`))

        // Chụp body NGAY LÚC request chạy qua thay vì `waitForResponse().json()`.
        // Hai lý do: `fetchAllMstCods` gộp mọi cdType vào MỘT request chứa
        // `cdTypes=58` nên nó bay ngay ở trang dashboard sau login (đọc muộn sẽ
        // nhận `Network.getResponseBody: No resource…` sau lần điều hướng kế
        // tiếp), và react-query có thể phục vụ từ cache khiến không có request
        // nào để mà chờ. Chụp tại chỗ thì cả hai đều không thành vấn đề.
        await page.route(MST_COD_58_URL, async (route) => {
            const res = await route.fetch()
            const body = (await res.json().catch(() => null)) as {
                data?: Record<string, MstCodRow[]>
            } | null
            const rows = body?.data?.['58']
            if (rows?.length) picLinkRows = rows
            await route.fulfill({ response: res })
        })
        await page.route(AGENT_CONFIG_URL, async (route) => {
            if (route.request().method() !== 'GET') return route.fallback()
            const res = await route.fetch()
            const body = (await res.json().catch(() => null)) as AgentConfigBody | null
            if (body?.connectors) latestConfig = body
            await route.fulfill({ response: res })
        })

        await page.goto('/login', { waitUntil: 'domcontentloaded' })
        await page.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await page.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await page.getByRole('button', { name: JA.submit }).click()
        await expect(page).toHaveURL(/\/$/)

        linkageSelectOf = (c: string) => page.locator(`#connector-category-${c}`)
        linkagePathOf = (c: string) => page.locator(`#connector-field-${c}-path`)
        linkageSave = page.getByRole('button', { name: '保存', exact: true })
        f11Dialog = page.getByRole('dialog').filter({ hasText: '診 療 入 力 設 定' })
        f11SelectOf = (label: string) =>
            f11Dialog.getByText(label, { exact: true }).locator('..').getByRole('combobox')
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── Đọc: hai màn nói cùng một giá trị ────────────────────────────────────

    test('TC-READ-1 — F11 hiển thị đúng hãng mà 機器連携 đang lưu', async () => {
        await gotoLinkageTab()

        await expect
            .poll(() => picLinkRows.length, {
                message: 'mst_cod cdType 58 rỗng',
                timeout: 30000,
            })
            .toBeGreaterThan(0)
        await expect
            .poll(() => latestConfig?.connectors?.length ?? -1, {
                message: 'chưa bắt được GET /v1/config',
                timeout: 30000,
            })
            .toBeGreaterThanOrEqual(0)

        const codeOf = (c: string) =>
            latestConfig!.connectors.find((x) => x.category === c)?.linkCode ?? 0
        original = { xray: codeOf('xray'), medsup: codeOf('medical-support') }
        console.log(
            `連携先 ban đầu — xray=${original.xray} (${labelOf(original.xray)}), ` +
                `medical-support=${original.medsup} (${labelOf(original.medsup)})`,
        )

        // Chụp NGAY BÂY GIỜ, lúc còn ở màn 機器連携 — TC-SYNC-1 cần chúng để chứng
        // minh F11 không xoá mất, nhưng lúc đó trang đã sang /treatments.
        for (const c of ['xray', 'medical-support', 'appointment', 'settlement']) {
            pathsBefore[c] = await linkagePathOf(c).inputValue()
        }
        console.log(`ディレクトリパス ban đầu: ${JSON.stringify(pathsBefore)}`)

        // Hãng thử phải KHÁC hãng đang cài ở CẢ HAI ô, nếu không "đã đổi" và
        // "chưa đổi" trông giống hệt nhau và testcase mất khả năng đỏ.
        const candidate = picLinkRows.find(
            (r) =>
                r.anyVal1?.trim() &&
                Number(r.cdVal) !== original!.xray &&
                Number(r.cdVal) !== original!.medsup &&
                Number(r.cdVal) !== 0,
        )
        expect(candidate, 'không tìm được hãng nào khác để thử').toBeTruthy()
        probe = { code: Number(candidate!.cdVal), label: candidate!.anyVal1! }
        console.log(`hãng dùng để thử: ${probe.label} (${probe.code})`)

        // Màn 機器連携 hiện đúng những gì server trả về…
        await expect(linkageSelectOf('xray')).toContainText(labelOf(original.xray))
        await expect(linkageSelectOf('medical-support')).toContainText(labelOf(original.medsup))

        // …và F11 phải nói y hệt, vì nó đọc CÙNG hàng connector đó.
        //
        // Chỉ đối chiếu ô ĐANG CÓ thiết bị. Ô mang linkCode 0 bị bỏ qua ở đây và
        // dồn hết vào TC-GAP-1 ở cuối file: F11 không diễn đạt được trạng thái
        // "không có thiết bị", nên assert nó tại đây là một defect ĐÃ BIẾT chặn
        // luôn 4 testcase đồng bộ phía sau ở mọi lần chạy.
        await openF11()
        for (const [label, code] of [
            ['レントゲンシステム連携', original.xray],
            ['診療支援システム連携', original.medsup],
        ] as const) {
            if (code === 0) {
                console.log(`bỏ qua ${label} ở TC-READ-1 (linkCode 0) — xem TC-GAP-1`)
                continue
            }
            await expect(f11SelectOf(label), `F11 phải hiện đúng hãng của ô ${label}`).toContainText(
                labelOf(code),
            )
        }
        await closeF11()
        await step()
    })

    // ── Chiều 1: đổi ở F11 → 機器連携 thấy ───────────────────────────────────

    test('TC-SYNC-1 — đổi レントゲン ở F11 rồi 登録 → 機器連携 hiện hãng mới', async () => {
        expect(probe, 'TC-READ-1 chưa chốt được hãng thử').not.toBeNull()

        expect(
            Object.keys(pathsBefore).length,
            'TC-READ-1 chưa chụp được ディレクトリパス của 4 ô',
        ).toBe(4)

        await openF11()
        await pickOption(f11SelectOf('レントゲンシステム連携'), probe!.label)
        await saveF11()

        await gotoLinkageTab()
        await expect(
            linkageSelectOf('xray'),
            'đổi 連携先 ở F11 mà màn 機器連携 không theo → hai màn đã lệch nhau',
        ).toContainText(probe!.label)

        // Ô 診療支援 không bị đụng tới.
        await expect(linkageSelectOf('medical-support')).toContainText(labelOf(original!.medsup))

        // Và F11 KHÔNG được làm mất cấu hình của ô nào — nó gửi lại cả tài liệu.
        for (const c of ['xray', 'medical-support', 'appointment', 'settlement']) {
            expect(
                await linkagePathOf(c).inputValue(),
                `ディレクトリパス của ô ${c} bị F11 xoá mất`,
            ).toBe(pathsBefore[c])
        }
        await step()
    })

    // ── Chiều 2: đổi ở 機器連携 → F11 thấy ───────────────────────────────────

    test('TC-SYNC-2 — đổi 診療支援 ở 機器連携 rồi 保存 → F11 hiện hãng mới', async () => {
        expect(probe, 'TC-READ-1 chưa chốt được hãng thử').not.toBeNull()

        await pickOption(linkageSelectOf('medical-support'), probe!.label)
        await saveLinkage()

        await openF11()
        await expect(
            f11SelectOf('診療支援システム連携'),
            'đổi 連携先 ở 機器連携 mà F11 không theo → hai màn đã lệch nhau',
        ).toContainText(probe!.label)
        // Ô レントゲン giữ nguyên giá trị TC-SYNC-1 vừa đặt.
        await expect(f11SelectOf('レントゲンシステム連携')).toContainText(probe!.label)
        await closeF11()
        await step()
    })

    // ── Trả lại như cũ ───────────────────────────────────────────────────────

    test('TC-RESTORE-1 — trả 連携先 của cả hai ô về giá trị ban đầu', async () => {
        expect(original, 'TC-READ-1 chưa ghi nhận giá trị ban đầu').not.toBeNull()

        // TC-SYNC-2 kết thúc ở /treatments (nó mở F11 để đối chiếu), nên phải quay
        // lại màn 機器連携 trước khi chạm vào combo của nó.
        await gotoLinkageTab()
        await pickOption(linkageSelectOf('xray'), labelOf(original!.xray))
        await pickOption(linkageSelectOf('medical-support'), labelOf(original!.medsup))
        await saveLinkage()

        await expect(linkageSelectOf('xray')).toContainText(labelOf(original!.xray))
        await expect(linkageSelectOf('medical-support')).toContainText(labelOf(original!.medsup))

        // Chốt lần cuối bằng chính màn kia, để "đã khôi phục" không chỉ đúng ở một phía.
        await openF11()
        await expect(f11SelectOf('レントゲンシステム連携')).toContainText(labelOf(original!.xray))
        await expect(f11SelectOf('診療支援システム連携')).toContainText(labelOf(original!.medsup))
        await closeF11()
        await step()
    })

    // ── Khoảng trống đã biết, đặt CUỐI file ─────────────────────────────────
    //
    // Đặt ở đây có chủ đích: nó đang ĐỎ vì một defect của app, và `serial` bỏ qua
    // mọi testcase phía sau một testcase đỏ. Nằm cuối thì nó không chặn phần đồng
    // bộ ở trên, vốn mới là thứ suite này sinh ra để kiểm.

    test('TC-GAP-1 — F11 phải hiển thị và chọn được 連携しない như màn 機器連携', async () => {
        expect(original, 'TC-READ-1 chưa ghi nhận giá trị ban đầu').not.toBeNull()

        // Defect: combo 連携先 của F11 chỉ đổ từ mst_cod 58 (cd_val 1..25), KHÔNG tự
        // chèn mục 「連携しない」 như connector-config-form.tsx:366 làm. Trong khi đó
        // agent lưu linkCode = 0 cho "không dùng thiết bị" (NO_CONNECTOR).
        // Hệ quả:
        //   · ĐỌC — linkCode 0 không khớp option nào → Radix rơi về placeholder →
        //     ô レントゲン (không khai placeholder) hiện RỖNG, trông như lỗi tải.
        //   · GHI — chọn được hãng nhưng KHÔNG bỏ chọn được; muốn về "không dùng
        //     thiết bị" phải sang màn 機器連携. Một chiều.
        // Legacy không vướng vì "không liên kết" của nó là mst_cod cd_val 9 = 'Non',
        // một dòng master thật; mô hình agent-next dùng 0, và 0 không có trong master.
        await openF11()

        await expect(
            f11SelectOf('診療支援システム連携'),
            'ô không có thiết bị phải hiện 連携しない, không được để trống',
        ).toContainText(NO_CONNECTOR_LABEL)

        // Và phải bỏ chọn được từ chính F11.
        await pickOption(f11SelectOf('レントゲンシステム連携'), NO_CONNECTOR_LABEL)
        await saveF11()

        await gotoLinkageTab()
        await expect(linkageSelectOf('xray')).toContainText(NO_CONNECTOR_LABEL)
        await step()
    })
})
