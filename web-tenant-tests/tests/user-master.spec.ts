import { expect, test, type Locator, type Page } from '@playwright/test'

import { dbEnabled, withDb, DB_SCHEMA } from './db'
import {
    extractActivateLink,
    extractActivateToken,
    mailpitUp,
    purgeMailTo,
    waitForMailTo,
} from './mailpit'
import { makeStep, skipWithReason } from './step'
import { ADMIN_USER, JA } from './test-data'

/**
 * ユーザマスタ (frm501002 一覧 / frm501003 登録) + ログイン有効化.
 *
 * Màn hình mới, port từ WinForm sau khi bảng IINMST2 được gộp vào `app_user`.
 * Một dòng `app_user` giờ là MỘT NGƯỜI của phòng khám, có hay không có tài khoản
 * đăng nhập; `email` / `password_hash` để NULL cho tới khi quản trị viên bấm
 * ログイン有効化.
 *
 * FACT bám theo source (Rule 21):
 *  - apps/web-tenant/src/features/user-master/locales/ja.ts
 *      · list.heading = 'ユーザマスタ一覧' → title bar render '≪ユーザマスタ一覧≫'
 *      · cột: NO / 氏名 / 郵便番号 / 住所１ / 住所２ / TEL / メールアドレス /
 *        区分 / 認証状態 — 7 cột đầu là bộ của WinForm, 2 cột cuối là web thêm.
 *      · fnKeys: F1 新規 / F8 削除 / F9 登録 / F9 選択 / F10 戻る
 *      · loginStatus CHỈ có 2 giá trị: unverified 未認証 / verified 認証済,
 *        suy từ password_hash. Phân biệt 'đã mời mà chưa bấm link' với
 *        'chưa mời' nằm ở cột メールアドレス bên cạnh (có/không có địa chỉ).
 *      · form.userNoAuto = '空欄で自動採番' (placeholder ô NO ở chế độ 新規)
 *      · form.userNoImmutable = 'NO は登録後に変更できません'
 *      · activate.buttonNone/Pending/Active = ログイン有効化 / メール再送 / ログイン無効化
 *      · activate.dialogTitle = 'ログイン有効化'
 *      · activate.labelEmail = 'メールアドレス', labelRecipientName = 'お名前（任意）'
 *      · activate.labelIsAdmin = '管理者権限を付与する'
 *      · activate.hintNoPassword = 'パスワードは本人が招待メールのリンクから設定します。'
 *      · dialogs.deleteTitle = 'ユーザを削除しますか？'
 *  - components/user-master-form.tsx
 *      · Init focus port từ frm501003.cs:196-206 — 更新 → 氏名, 新規 → NO.
 *      · 区分 render bằng <Select> (WinForm cboUserKbn là ComboBox
 *        DropDownList), nhãn lấy từ mst_cod cd_type 30 — KHÔNG hardcode trong FE.
 *        makeCodMstCombo(30, COMBO_SPC_OFF) ⇒ KHÔNG có mục trắng dẫn đầu.
 *      · 郵便番号 / 住所１ dùng PostalCodeAutocomplete + AddressAutocomplete của
 *        feature patients (mst-post suggest), thay nút 〒⇔住所 của WinForm. Chọn
 *        một gợi ý điền CẢ HAI ô; 住所２ không tham gia — khớp WinForm
 *        setPostAdd(kbn, dt, txtUserPostCd, txtUserAdd1).
 *  - components/postal-suggest-dropdown.tsx: role="listbox" (aria-label
 *    '郵便番号候補') + role="option" cho từng dòng.
 *      · 新規 chọn sẵn ドクター (frm501003.cs:205 `cboUserKbn.SelectedValue = 0`).
 *      · Ô NO bị `disabled` ở chế độ 更新 (WinForm disable txtUserNo).
 *  - shared/ui/label.tsx: <Label required> nối thêm <span aria-hidden>*</span>.
 *    ⇒ TEXT của label là 'メールアドレス*' nên getByLabel(exact) TRƯỢT, trong khi
 *    accessible name của input vẫn sạch. Trong dialog phải dùng
 *    getByRole('textbox', { name }). Màn 登録 thì khác: input ở đó có aria-label
 *    nên getByLabel chạy bình thường.
 *      · メールアドレス là MỘT Ô CỦA FORM, nằm ngay trên 区分. Không còn nút
 *        ログイン有効化 hay hộp thoại riêng.
 *      · Điền email rồi F9 登録 ⇒ hiện confirm はい/いいえ; はい mới gửi mail.
 *      · 管理者権限 là checkbox nằm dưới 区分. Đây là nơi DUY NHẤT cấp quyền —
 *        màn /settings/users đã bị xoá hẳn. Chưa xác thực thì giá trị này áp dụng
 *        lúc phát thư mời; đã xác thực thì F9 登録 đổi role thật (admin ⇄ staff).
 *      · Đã đăng ký xong (loginStatus verified) ⇒ ô email bị disable.
 *        Người mới được mời (pending) vẫn sửa được để chữa địa chỉ gõ nhầm, và
 *        F9 lần nữa chính là gửi lại mail (BE thu hồi token cũ).
 *  - routes/_authenticated/settings/user-master/*
 *      · /settings/user-master (一覧), /new (新規), /$userNo (更新).
 *  - BE: GET /tenant/user-master mở cho mọi tenant user; POST/PATCH/DELETE và
 *    các route login đều RequireAuthorization(TenantAdmin).
 *  - BE UserMaster error codes → thông báo tiếng Nhật ở
 *    errors/user-master-error-registry.ts, vd USER_MASTER.REFERENCED_BY_HISTORY
 *    → 'このユーザは診療・会計・患者情報で使用されているため削除できません。…'
 *
 * CHẠY TUẦN TỰ (`describe.serial`) và dùng CHUNG một page: app giới hạn số lần
 * login (Rule 10.1) nên login làm đúng một lần ở beforeAll. Testcase nối tiếp
 * trạng thái, thứ tự CÓ Ý NGHĨA — chạy lẻ một testcase ở giữa bằng `-g` sẽ hỏng.
 * Luôn chạy cả file:
 *   npx playwright test tests/user-master.spec.ts
 *
 * MÔI TRƯỜNG (đã gặp thật): chạy suite nhiều lượt liên tiếp thì thỉnh thoảng một
 * testcase đỏ ở `gotoList` với lý do "không vào được 一覧". Đó là dev server
 * reload làm mất accessToken (chỉ nằm trong RAM — Rule 10.2), cộng thêm giới hạn
 * ~10 login/khung của app (Rule 10.1) khiến lần đăng nhập lại cũng hỏng.
 * `gotoList` đã tự đăng nhập lại tối đa 2 lượt và IN RA khi phải làm vậy. Thấy
 * dòng đó mà vẫn đỏ thì CHỜ VÀI PHÚT rồi chạy lại, đừng sửa code. Dấu hiệu nhận
 * biết: lượt hỏng chạy ~1.2 phút, còn lượt bình thường chỉ ~20 giây.
 *
 * KHÔNG dùng `--repeat-each` với file này (Rule 16 xin miễn trừ ở đây).
 * `--repeat-each` lặp TỪNG testcase tại chỗ, mà nhóm ghi là một chuỗi trạng thái:
 * lượt 2 của TC-INVITE-1 gặp dòng đã 有効化 nên nút không còn là ログイン有効化, lượt
 * 2 của TC-WRITE-2 thì không còn dòng để xoá. Muốn kiểm ổn định thì chạy TRỌN FILE
 * nhiều lượt (đã chạy 3 lượt liên tiếp, 20/20 pass mỗi lượt):
 *   for i in 1 2 3; do npx playwright test tests/user-master.spec.ts; done
 *
 * DỮ LIỆU (Rule 18): dataset demo import từ IINMST2 có sẵn ~20 người, NO 1..112,
 * kbn 0 (ドクター) và 1 (衛生士), KHÔNG ai có email. Spec đọc dòng thật chứ không
 * hardcode NO — trừ TEST_USER_MASTER_NO khi muốn ghim một dòng cụ thể.
 *
 * THỨ TỰ nhóm ghi có ý nghĩa và KHÔNG đảo được:
 *   TC-WRITE-1 tạo dòng → TC-INVITE-1 有効化 → TC-DB-1 (password_hash còn NULL)
 *   → TC-MAIL-1/2 kiểm thư → TC-MAIL-3 redeem (LÚC NÀY password_hash mới có)
 *   → TC-MAIL-4 → TC-WRITE-2 xoá dòng.
 * Đưa TC-DB-1 xuống sau TC-MAIL-3 là nó thấy password đã đặt và đỏ oan.
 *
 * GHI DB (Rule 18.1): 新規 / 更新 / 削除 và ログイン有効化 đều GHI. Mặc định spec
 * CHỈ ĐỌC + kiểm validate/huỷ; nhóm TC-WRITE-* chỉ chạy khi TEST_ALLOW_SAVE=1.
 * ログイン有効化 còn GỬI MAIL THẬT nên tách cờ riêng TEST_ALLOW_INVITE=1.
 * Nhóm TC-DB-* cần TEST_DB=1 để dọn dòng test — spec tự skip khi không bật.
 */

test.describe.configure({ mode: 'serial' })

const BASE_URL = process.env.BASE_URL ?? 'https://tenant1.ochacom.local/'

/** Rule 18.1 — mặc định không đụng DB. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/** Gửi mail thật → cờ riêng, chặt hơn ALLOW_SAVE. */
const ALLOW_INVITE = process.env.TEST_ALLOW_INVITE === '1'

/** NO dùng cho dòng tạo mới. Để cao cho khỏi đụng dải legacy (1..112). */
const NEW_USER_NO = Number(process.env.TEST_NEW_USER_NO ?? '9001')
const NEW_USER_NM = process.env.TEST_NEW_USER_NM ?? 'E2Eテスト職員'

/** Địa chỉ nhận thư mời — riêng cho test, để dọn hộp thư mà không đụng ai. */
const INVITE_EMAIL = process.env.TEST_INVITE_EMAIL ?? `e2e-${NEW_USER_NO}@example.com`

/** Mật khẩu người được mời tự đặt ở màn /activate-login. */
const INVITE_PASSWORD = process.env.TEST_INVITE_PASSWORD ?? 'E2e!Passw0rd#2026'

/** Tiền tố 郵便番号 dùng để bung gợi ý. Đổi nếu dataset không có mã nào khớp. */
const POSTAL_PREFIX = process.env.TEST_POSTAL_PREFIX ?? '100'

/** Ghim một dòng có sẵn để mở màn 更新; bỏ trống thì lấy dòng đầu của lưới. */
const PINNED_USER_NO = process.env.TEST_USER_MASTER_NO

const LIST_URL = '/settings/user-master'

/** Nhãn dòng 合計 của lưới — luôn render xong sau lưới, kể cả khi 0 dòng. */
const LIST_TOTAL_LABEL = '合　計'

/** Chuỗi UI thật — chép từ features/user-master/locales/ja.ts. */
const UM = {
    listHeading: '≪ユーザマスタ一覧≫',
    colUserNo: 'NO',
    colUserNm: '氏名',
    colUserPostCd: '郵便番号',
    colUserAdd1: '住所１',
    colUserAdd2: '住所２',
    colUserTel: 'TEL',
    colUserKbn: '区分',
    colEmail: 'メールアドレス',
    colLogin: '認証状態',
    noResults: '登録されているユーザがありません',
    userNoAuto: '空欄で自動採番',
    userNoImmutable: 'NO は登録後に変更できません',
    labelEmail: 'メールアドレス',
    emailLocked: '登録完了後はメールアドレスを変更できません',
    activateConfirmTitle: 'アカウントを有効化しますか？',
    labelIsAdmin: '管理者権限',
    loginUnverified: '未認証',
    loginVerified: '認証済',
    deleteTitle: 'ユーザを削除しますか？',
    referencedByHistory: 'このユーザは診療・会計・患者情報で使用されているため削除できません。',
    inviteInvalid: 'この招待リンクは無効か、有効期限が切れています。',
    fnNew: '新規',
    fnDelete: '削除',
    fnRegister: '登録',
    fnSelect: '選択',
    fnBack: '戻る',
} as const

/**
 * Chuỗi màn /activate-login — chép từ features/user-master/locales/ja.ts.
 *
 * Các ô nhập bám theo id (form đặt id = tên field) chứ không phải getByLabel:
 * màn này dùng <Label required>, mà primitive nối thêm '*' vào TEXT của label
 * nên getByLabel(exact) trượt; riêng ô mật khẩu là input[type=password] nên
 * cũng không có role textbox để bám.
 */
const ja_redeemHeading = 'パスワードの設定'
const ja_redeemSubmit = '設定する'

/** 氏名 người được mời tự sửa lúc redeem — phải GHI vào master. */
const REDEEMED_NM = process.env.TEST_REDEEMED_NM ?? 'E2E本人修正名'

/** Nhãn 区分 nằm ở mst_cod cd_type 30 — spec chỉ khẳng định 3 mã này tồn tại. */
const KBN_LABELS = ['ドクター', '衛生士', 'スタッフ'] as const

test.describe('ユーザマスタ (frm501002 / frm501003) + ログイン有効化', () => {
    let page: Page
    let step: () => Promise<void>

    /** NO của dòng dùng để mở màn 更新 — quyết định trong TC-LIST-1. */
    let targetUserNo: number

    /** Token của thư mời ĐẦU TIÊN — TC-MAIL-2 kiểm nó chết sau khi 再送. */
    let firstInviteToken: string | null = null

    // ── Locator helper ───────────────────────────────────────────────────────

    /**
     * Hộp confirm của appDialog (Rule 13 — role="alertdialog", KHÔNG phải
     * role="dialog"). Dùng cho cả xác nhận kích hoạt lẫn xác nhận xoá.
     */
    const confirmBox = (): Locator => page.getByRole('alertdialog')

    /** Nút F-key ở thanh dưới cùng. */
    const fkey = (n: number): Locator => page.locator(`[data-fkey="F${n}"]`)

    /**
     * Các dòng của lưới 一覧. Lưới dựng bằng div nên component gắn sẵn
     * `data-testid="user-master-row"` + `data-user-no` — bám vào đó thay vì
     * Tailwind class (Rule 3).
     */
    const listRows = (): Locator => page.getByTestId('user-master-row')

    /** Số dòng mang NO đó — tự vào 一覧 trước vì có testcase gọi lúc đang ở màn khác. */
    async function rowCount(userNo: number): Promise<number> {
        await gotoList()
        return rowOf(userNo).count()
    }

    /** Dòng của một NO cụ thể. */
    const rowOf = (userNo: number): Locator =>
        page.locator(`[data-testid="user-master-row"][data-user-no="${userNo}"]`)

    /** Đăng nhập admin trên `p`. Tách riêng vì cả beforeAll lẫn gotoList đều cần. */
    async function loginAsAdmin(p: Page): Promise<void> {
        await p.goto('/login', { waitUntil: 'domcontentloaded' })
        await p.getByLabel(JA.emailLabel).fill(ADMIN_USER.email)
        await p.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await p.getByRole('button', { name: JA.submit }).click()
        await expect(p).toHaveURL(/\/$/)
    }

    /**
     * Điều hướng về 一覧 và chờ lưới dựng xong.
     *
     * KHÔNG chờ response của API: React Query giữ cache 60s (staleTime), nên
     * quay lại màn này trong khoảng đó sẽ render thẳng từ cache mà không phát
     * request nào — waitForResponse khi ấy treo tới hết timeout rồi đỏ oan.
     * Dòng 合計 luôn render sau khi lưới xong, kể cả khi không có dòng nào, nên
     * đó mới là tín hiệu đúng.
     */
    async function gotoList(): Promise<void> {
        // Thử tối đa 2 lượt. Dev server của môi trường này thỉnh thoảng reload
        // giữa chừng, mà accessToken chỉ nằm trong RAM (Rule 10.2) nên session
        // bay theo và app đá về /login. Đó là môi trường chập chờn chứ không
        // phải lỗi của thứ đang test — đăng nhập lại rồi đi tiếp, và NÓI RA để
        // lần chạy này không bị hiểu nhầm là sạch tuyệt đối.
        const heading = page.getByText(UM.listHeading)
        const loginButton = page.getByRole('button', { name: JA.submit })

        for (let attempt = 1; attempt <= 2; attempt++) {
            await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' })

            // Phải CHỜ tới khi rõ là màn nào rồi mới quyết định: app chuyển hướng
            // về /login bất đồng bộ, đọc page.url() ngay sau goto() vẫn còn thấy
            // đường dẫn cũ và nhánh cứu này không bao giờ chạy.
            await expect(heading.or(loginButton).first()).toBeVisible({ timeout: 30000 })

            if (!(await loginButton.isVisible())) break

            console.log(`gotoList: bị đá về /login (session mất) — đăng nhập lại (lượt ${attempt})`)
            await loginAsAdmin(page)
        }

        await expect(
            heading,
            'không vào được 一覧 kể cả sau khi đăng nhập lại. Gần như chắc chắn là ' +
                'MÔI TRƯỜNG chứ không phải tính năng: dev server reload làm mất ' +
                'accessToken (chỉ nằm trong RAM), và nếu đã chạy suite nhiều lần liên ' +
                'tiếp thì lần đăng nhập lại còn bị app khoá (Rule 10.1 — ~10 login/khung). ' +
                'Chờ vài phút rồi chạy lại, ĐỪNG sửa code.',
        ).toBeVisible({ timeout: 30000 })
        await expect(page.getByText(LIST_TOTAL_LABEL)).toBeVisible({ timeout: 30000 })
        await step()
    }

    /**
     * Xoá sạch dòng test khỏi app_user. Dùng cả ở beforeAll (dọn tàn dư của lần
     * chạy trước bị fail giữa chừng — nếu không, TC-WRITE-1 tạo lại sẽ đụng
     * USER_NO_TAKEN và fail vì lý do chẳng liên quan gì tới cái đang test) lẫn ở
     * TC-DB-2 (dọn sau khi chạy xong).
     */
    async function purgeTestUser(): Promise<number> {
        return withDb(async (c) => {
            await c.query(
                `DELETE FROM ${DB_SCHEMA}.app_user_invite_token
                  WHERE user_id IN (SELECT id FROM ${DB_SCHEMA}.app_user WHERE user_no = $1)`,
                [NEW_USER_NO],
            )
            await c.query(
                `DELETE FROM ${DB_SCHEMA}.app_user_role
                  WHERE user_id IN (SELECT id FROM ${DB_SCHEMA}.app_user WHERE user_no = $1)`,
                [NEW_USER_NO],
            )
            const r = await c.query(`DELETE FROM ${DB_SCHEMA}.app_user WHERE user_no = $1`, [
                NEW_USER_NO,
            ])
            return r.rowCount ?? 0
        })
    }

    /**
     * Chạy `fn` trên một trang RIÊNG, đóng lại sau khi xong.
     *
     * Bắt buộc cho mọi thao tác của người được mời: điều hướng tới
     * /activate-login là một lần tải trang đầy đủ, mà accessToken của app chỉ
     * nằm trong RAM (GUIDELINE Rule 10.2) — làm trên `page` chính là thổi bay
     * session admin, và mọi testcase sau đó bị đá về /login.
     *
     * Cũng đúng với thực tế: người nhận thư là người khác, trên máy khác.
     */
    async function withInviteePage<T>(fn: (p: Page) => Promise<T>): Promise<T> {
        const ctx = await page.context().browser()!.newContext({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        try {
            return await fn(await ctx.newPage())
        } finally {
            await ctx.close()
        }
    }

    /**
     * Mở màn 更新 của `userNo` (hoặc dòng đầu) từ 一覧 bằng F9 選択.
     *
     * Chờ tới khi Ô 氏名 hiện ra chứ không chỉ chờ URL đổi: route render spinner
     * trong lúc gọi API, và bấm F9 ngay lúc đó thì `detail` còn null nên màn hình
     * chưa biết người này đã kích hoạt hay chưa — nhánh hỏi gửi mail bị bỏ qua và
     * test đỏ vì một lý do chẳng liên quan gì tới cái đang kiểm.
     */
    async function openDetail(userNo?: number): Promise<void> {
        await gotoList()
        const row = userNo === undefined ? listRows().first() : rowOf(userNo)
        await expect(row).toBeVisible({ timeout: 30000 })
        await row.click()
        await fkey(9).click()

        const expected =
            userNo === undefined
                ? new RegExp(`/settings/user-master/\\d+$`)
                : new RegExp(`/settings/user-master/${userNo}$`)
        await expect(page).toHaveURL(expected, { timeout: 30000 })
        await expect(
            page.getByLabel(UM.colUserNm, { exact: true }),
            'màn 更新 chưa nạp xong dữ liệu',
        ).toBeVisible({ timeout: 30000 })
        await step()
    }

    // ── Setup ────────────────────────────────────────────────────────────────

    test.beforeAll(async ({ browser }) => {
        // Page tự tạo (không dùng fixture) để cả file dùng chung MỘT lần login.
        // browser.newPage() không kế thừa `use` của config nên phải truyền tay
        // ignoreHTTPSErrors — miền *.ochacom.local dùng cert tự ký.
        page = await browser.newPage({
            baseURL: BASE_URL,
            ignoreHTTPSErrors: true,
            locale: 'ja-JP',
        })
        step = makeStep(page)

        await loginAsAdmin(page)

        // Dọn tàn dư trước khi bắt đầu: NO test là UNIQUE trong app_user, nên một
        // dòng sót lại từ lần chạy trước sẽ làm TC-WRITE-1 fail vì USER_NO_TAKEN.
        if (dbEnabled && ALLOW_SAVE) {
            const purged = await purgeTestUser()
            if (purged > 0) console.log(`dọn tàn dư NO=${NEW_USER_NO}: ${purged} dòng`)
        }
        if (ALLOW_INVITE) {
            const mails = await purgeMailTo(INVITE_EMAIL)
            if (mails > 0) console.log(`dọn hộp thư ${INVITE_EMAIL}: ${mails} mail`)
        }

        await gotoList()
    })

    test.afterAll(async () => {
        await page?.close()
    })

    // ── 一覧 (frm501002) ─────────────────────────────────────────────────────

    test('TC-LIST-1 — lưới hiện đủ 9 cột và có dòng nhân sự import từ IINMST2', async () => {
        // 7 cột đầu là bộ cột của WinForm; ログイン là cột web thêm vào.
        for (const label of [
            UM.colUserNo,
            UM.colUserNm,
            UM.colUserPostCd,
            UM.colUserAdd1,
            UM.colUserAdd2,
            UM.colUserTel,
            UM.colEmail,
            UM.colUserKbn,
            UM.colLogin,
        ]) {
            await expect(
                page.getByText(label, { exact: true }).first(),
                `thiếu cột ${label} — bộ cột lệch frm501002`,
            ).toBeVisible({ timeout: 30000 })
        }

        // Rule 10.8 — chờ dòng đầu hiện rồi mới count().
        const rows = listRows()
        const empty = page.getByText(UM.noResults)
        const hasRows = await rows
            .first()
            .isVisible()
            .catch(() => false)

        skipWithReason(
            !hasRows && (await empty.isVisible().catch(() => false)),
            'ユーザマスタ rỗng — dataset chưa import IINMST2, không có gì để test',
        )

        await expect(rows.first()).toBeVisible({ timeout: 30000 })
        const n = await rows.count()
        expect(n, 'lưới không có dòng nào').toBeGreaterThan(0)

        // Chọn dòng để các testcase sau mở màn 更新.
        if (PINNED_USER_NO !== undefined) {
            targetUserNo = Number(PINNED_USER_NO)
        } else {
            targetUserNo = Number(await rows.first().getAttribute('data-user-no'))
        }
        expect(Number.isFinite(targetUserNo), 'không đọc được NO của dòng đầu').toBeTruthy()
        console.log(`ユーザマスタ: ${n} dòng, dùng NO=${targetUserNo} cho màn 更新`)
        await step()
    })

    test('TC-LIST-2 — F-key đúng bộ của frm501002: F1 新規 / F9 選択 / F10 戻る', async () => {
        await expect(fkey(1), 'thiếu F1 新規').toContainText(UM.fnNew)
        await expect(fkey(9), 'thiếu F9 選択').toContainText(UM.fnSelect)
        await expect(fkey(10), 'thiếu F10 戻る').toContainText(UM.fnBack)

        // WinForm frm501002 KHÔNG bật F8 ở màn 一覧 (削除 nằm trong màn 登録).
        await expect(fkey(8), 'F8 xuất hiện ở 一覧 — WinForm chỉ bật F8 ở màn 登録')
            .toHaveCount(0)
        await step()
    })

    test('TC-LIST-3 — ↑/↓ đổi dòng đang chọn', async () => {
        const rows = listRows()
        await expect(rows.nth(1)).toBeVisible({ timeout: 30000 })

        await rows.first().click()
        await step()
        await page.keyboard.press('ArrowDown')
        await step()

        const selected = page.locator('[data-testid="user-master-row"][data-selected]')
        await expect(selected, 'ArrowDown không đổi dòng đang chọn').toHaveCount(1)
        await expect(
            selected,
            'ArrowDown không nhảy xuống dòng thứ hai',
        ).toHaveAttribute('data-user-no', await rows.nth(1).getAttribute('data-user-no') ?? '')
        await step()
    })

    // ── 登録 (frm501003) — chế độ 更新 ────────────────────────────────────────

    test('TC-EDIT-1 — F9 選択 mở màn 更新, NO khoá và focus nằm ở 氏名', async () => {
        await openDetail()

        // FACT frm501003.cs:250 — txtUserNo.Enabled = false ở chế độ Update.
        const noInput = page.getByLabel(UM.colUserNo, { exact: true })
        await expect(noInput, 'ô NO phải bị khoá ở chế độ 更新').toBeDisabled()
        await expect(page.getByText(UM.userNoImmutable)).toBeVisible()

        // FACT frm501003.cs:198 — Update → txtUserNm.Focus().
        // autoFocus chỉ chạy sau khi React mount xong route → cho retry, đừng
        // dùng timeout mặc định 5s (focus assert vốn hay flaky).
        await expect(
            page.getByLabel(UM.colUserNm, { exact: true }),
            'focus khởi tạo phải ở 氏名 (frm501003 dspData)',
        ).toBeFocused({ timeout: 15000 })
        await step()
    })

    test('TC-EDIT-2 — F-key màn 更新: F8 削除 / F9 登録 / F10 戻る', async () => {
        await expect(fkey(8), 'thiếu F8 削除 ở màn 更新').toContainText(UM.fnDelete)
        await expect(fkey(9), 'thiếu F9 登録').toContainText(UM.fnRegister)
        await expect(fkey(10), 'thiếu F10 戻る').toContainText(UM.fnBack)
        await step()
    })

    test('TC-EDIT-3 — 区分 là select box, nhãn lấy từ mst_cod cd_type 30', async () => {
        // WinForm cboUserKbn là ComboBox DropDownList nạp bằng
        // makeCodMstCombo(30, COMBO_SPC_OFF) ⇒ dropdown, KHÔNG có dòng trắng.
        const kbn = page.getByRole('combobox', { name: UM.colUserKbn })
        await expect(kbn, '区分 không phải select box').toBeVisible({ timeout: 30000 })

        await kbn.click()
        const options = page.getByRole('option')
        await expect(options.first()).toBeVisible({ timeout: 15000 })

        for (const label of KBN_LABELS) {
            await expect(
                page.getByRole('option', { name: label }),
                `thiếu lựa chọn 区分 ${label} — mst_cod cd_type 30 chưa nạp?`,
            ).toBeVisible()
        }
        // COMBO_SPC_OFF: đúng 3 mục, không có mục trắng dẫn đầu.
        await expect(options, '区分 có mục trắng — WinForm dùng COMBO_SPC_OFF').toHaveCount(
            KBN_LABELS.length,
        )

        await page.keyboard.press('Escape')
        await expect(options.first()).toBeHidden({ timeout: 15000 })
        await step()
    })

    test('TC-POST-1 — 郵便番号 gợi ý và chọn một dòng thì điền cả 住所１', async () => {
        // Dùng chung bộ autocomplete của màn 患者登録 (mst-post suggest), thay cho
        // nút 〒⇔住所 một-chiều của WinForm.
        const postCd = page.getByLabel(UM.colUserPostCd, { exact: true })
        const add1 = page.getByLabel(UM.colUserAdd1, { exact: true })
        const originalPostCd = await postCd.inputValue()
        const originalAdd1 = await add1.inputValue()

        // Gõ từng ký tự thay vì fill(): dropdown đóng theo onBlur, mà fill() có
        // nhịp blur/refocus riêng nên hay đóng ngay sau khi vừa mở.
        await postCd.click()
        await postCd.pressSequentially(POSTAL_PREFIX, { delay: 60 })
        await step()

        // Rule 10.8 — isVisible() KHÔNG auto-wait, gọi ngay khi dropdown chưa kịp
        // render sẽ trả false và test skip oan. waitFor() mới chờ.
        const listbox = page.getByRole('listbox', { name: '郵便番号候補' })
        const shown = await listbox
            .waitFor({ state: 'visible', timeout: 15000 })
            .then(() => true)
            .catch(() => false)
        skipWithReason(
            !shown,
            `mst_post không có mã nào bắt đầu bằng ${POSTAL_PREFIX} — đổi TEST_POSTAL_PREFIX`,
        )

        const firstOption = listbox.getByRole('option').first()
        await expect(firstOption).toBeVisible({ timeout: 15000 })
        const pickedAddress = (await firstOption.innerText()).split('\n').pop()?.trim() ?? ''
        await firstOption.click()
        await step()

        await expect(postCd, '郵便番号 không được điền sau khi chọn gợi ý').not.toHaveValue('')
        await expect(add1, '住所１ không được điền — autocomplete phải điền cả cặp').toHaveValue(
            pickedAddress,
        )

        // Trả lại giá trị cũ để testcase sau không thấy màn hình bẩn.
        await postCd.fill(originalPostCd)
        await add1.fill(originalAdd1)
        await step()
    })

    test('TC-EDIT-4 — 氏名 rỗng thì F9 登録 báo lỗi, không rời màn', async () => {
        const nameInput = page.getByLabel(UM.colUserNm, { exact: true })
        const before = await nameInput.inputValue()

        await nameInput.fill('')
        await step()
        await fkey(9).click()
        await step()

        // WinForm E00001 「〜が入力されていません」 → FE dựng lỗi field qua zod.
        await expect(page.getByText('必須項目です')).toBeVisible({ timeout: 15000 })
        await expect(page, 'màn 更新 tự rời dù validate fail').toHaveURL(
            new RegExp(`/settings/user-master/\\d+$`),
        )

        // Trả lại giá trị cũ để không để màn hình ở trạng thái bẩn.
        await nameInput.fill(before)
        await step()
    })

    test('TC-EDIT-5 — F10 戻る quay lại 一覧 và KHÔNG lưu thay đổi đang gõ dở', async () => {
        const nameInput = page.getByLabel(UM.colUserNm, { exact: true })
        const original = await nameInput.inputValue()

        await nameInput.fill(`${original}-nháp`)
        await step()
        await fkey(10).click()
        await expect(page).toHaveURL(/\/settings\/user-master$/, { timeout: 30000 })
        await step()

        // Rule 23.4 — WinForm dispose form khi 戻る, mở lại phải là bản mới.
        await openDetail()

        await expect(
            page.getByLabel(UM.colUserNm, { exact: true }),
            'giá trị gõ dở sống sót qua lần mở lại — WinForm dựng form mới mỗi lần',
        ).not.toHaveValue(`${original}-nháp`)
        await step()
    })

    // ── ログイン有効化 qua ô メールアドレス + confirm khi F9 ─────────────────

    test('TC-ACT-1 — ô メールアドレス nằm ngay trên 区分 và sửa được khi chưa kích hoạt', async () => {
        // Không còn nút/hộp thoại ログイン有効化 riêng: cấp login là một thuộc tính
        // của người này nên nó là một ô của chính form.
        await expect(
            page.getByRole('button', { name: /ログイン有効化|メール再送|ログイン無効化/ }),
            'nút ログイン有効化 vẫn còn — lẽ ra đã bỏ',
        ).toHaveCount(0)

        const email = page.getByLabel(UM.labelEmail, { exact: true })
        await expect(email, 'thiếu ô メールアドレス trên màn 登録').toBeVisible({ timeout: 30000 })
        await expect(email, 'người chưa kích hoạt mà ô email đã bị khoá').toBeEnabled()

        // Thứ tự DOM: メールアドレス phải đứng TRƯỚC 区分.
        const order = await page.evaluate(() => {
            const mail = document.getElementById('email')
            const kbn = document.getElementById('userKbn')
            if (!mail || !kbn) return 'missing'
            return mail.compareDocumentPosition(kbn) & Node.DOCUMENT_POSITION_FOLLOWING
                ? 'before'
                : 'after'
        })
        expect(order, 'メールアドレス không nằm trên 区分').toBe('before')
        await step()
    })

    test('TC-ACT-2 — email sai định dạng thì F9 báo lỗi, không gọi API kích hoạt', async () => {
        let called = false
        const watch = (r: { url: () => string }) => {
            if (/activate-login$/.test(new URL(r.url()).pathname)) called = true
        }
        page.on('request', watch)

        await page.getByLabel(UM.labelEmail, { exact: true }).fill('khong-phai-email')
        await step()
        await fkey(9).click()
        await step()

        await expect(page.getByText('メール形式が正しくありません')).toBeVisible({ timeout: 15000 })
        page.off('request', watch)
        expect(called, 'FE gọi activate-login dù email sai định dạng').toBeFalsy()
        // Hộp thoại nói "gửi mail tới <địa chỉ>" — hiện nó với chuỗi không phải
        // email là hỏi một câu vô nghĩa.
        await expect(
            confirmBox(),
            'vẫn hỏi xác nhận gửi mail dù email sai định dạng',
        ).toHaveCount(0)

        await page.getByLabel(UM.labelEmail, { exact: true }).fill('')
        await step()
    })

    test('TC-ACT-3 — bỏ trống email thì F9 lưu thẳng, KHÔNG hỏi kích hoạt', async () => {
        await openDetail()

        const email = page.getByLabel(UM.labelEmail, { exact: true })
        skipWithReason(
            (await email.inputValue()) !== '',
            'dòng đầu đã có email — không kiểm được nhánh "không hỏi"',
        )

        let asked = false
        const watch = () => {
            asked = true
        }
        page.on('dialog', watch)
        await fkey(9).click()
        // Lưu xong thì về 一覧; nếu có confirm thì màn hình đã đứng lại chờ.
        await expect(page, 'F9 không lưu được khi email trống').toHaveURL(
            /\/settings\/user-master$/,
            { timeout: 30000 },
        )
        page.off('dialog', watch)
        expect(asked, 'hỏi kích hoạt dù email để trống').toBeFalsy()
        await expect(confirmBox()).toHaveCount(0)
        await step()
    })

    test('TC-ROLE-1 — có checkbox 管理者権限 trên màn 登録', async () => {
        // TC-ACT-3 kết thúc ở 一覧, nên phải mở lại màn 登録 trước.
        await openDetail()

        const adminBox = page.getByRole('checkbox', { name: UM.labelIsAdmin })
        await expect(adminBox, 'thiếu checkbox 管理者権限 trên màn 登録').toBeVisible({
            timeout: 30000,
        })

        // Đây là nơi duy nhất cấp quyền, nên nó phải sửa được kể cả khi người đó
        // đã xác thực — không còn màn nào khác làm việc này.
        await expect(adminBox).toBeEnabled()
        await step()
    })

    test('TC-ROLE-2 — mục ユーザ管理 đã biến mất khỏi sidebar', async () => {
        // Chỉ kiểm lối vào. KHÔNG điều hướng thẳng tới /settings/users: route đã bị
        // xoá nên router không khớp được, app trắng màn và các testcase sau chết
        // theo — mà cái đó là kiểm router chứ không phải kiểm tính năng này.
        await expect(
            page.getByRole('link', { name: 'ユーザ管理' }),
            'mục ユーザ管理 vẫn còn trong sidebar',
        ).toHaveCount(0)

        // ユーザマスタ thì phải còn, nếu không là xoá nhầm cả hai.
        await expect(page.getByRole('link', { name: 'ユーザマスタ' })).toHaveCount(1)
        await step()
    })

    // ── 新規 (frm501003 Insert) ──────────────────────────────────────────────

    test('TC-NEW-1 — F1 mở màn 新規: NO nhập được, placeholder tự động, focus ở NO', async () => {
        await gotoList()
        await fkey(1).click()
        await expect(page).toHaveURL(/\/settings\/user-master\/new$/, { timeout: 30000 })
        await step()

        const noInput = page.getByLabel(UM.colUserNo, { exact: true })
        await expect(noInput, 'ô NO bị khoá ở chế độ 新規').toBeEnabled()
        await expect(noInput).toHaveAttribute('placeholder', UM.userNoAuto)

        // FACT frm501003.cs:205 — Insert → txtUserNo.Focus().
        await expect(
            noInput,
            'focus khởi tạo phải ở NO (frm501003 nhánh Insert)',
        ).toBeFocused({ timeout: 15000 })

        // FACT frm501003.cs:205 — cboUserKbn.SelectedValue = 0 (ドクター).
        await expect(
            page.getByRole('combobox', { name: UM.colUserKbn }),
            '新規 phải chọn sẵn ドクター như WinForm',
        ).toContainText(KBN_LABELS[0])

        // WinForm ẩn F8 ở chế độ Insert (btnChgEnable(btnF8, false)).
        await expect(fkey(8), 'F8 削除 hiện ở màn 新規 — WinForm ẩn nó ở nhánh Insert')
            .toHaveCount(0)
        await step()
    })

    test('TC-NEW-2 — NO = 0 bị chặn ngay ở FE (WinForm E00025)', async () => {
        await page.getByLabel(UM.colUserNo, { exact: true }).fill('0')
        await page.getByLabel(UM.colUserNm, { exact: true }).fill(NEW_USER_NM)
        await step()
        await fkey(9).click()
        await step()

        await expect(page.getByText('NO は 1 以上で入力してください')).toBeVisible({
            timeout: 15000,
        })
        await expect(page, 'màn 新規 tự rời dù NO = 0').toHaveURL(
            /\/settings\/user-master\/new$/,
        )
        await step()
    })

    test('TC-WRITE-1 — 新規 lưu được, dòng mới hiện ở 一覧 với 認証状態 = 未認証', async () => {
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — bỏ qua thao tác GHI DB (Rule 18.1)')

        // Tự dọn ngay trước khi tạo, không dựa vào beforeAll: NEW_USER_NO là hằng
        // số nên chạy `--repeat-each` (Rule 16) sẽ lặp lại chính testcase này và
        // lần thứ hai đụng USER_NO_TAKEN. Dọn ở đây làm mỗi lần lặp tự đứng được.
        if (dbEnabled) await purgeTestUser()

        await gotoList()
        await fkey(1).click()
        await expect(page).toHaveURL(/\/settings\/user-master\/new$/, { timeout: 30000 })

        await page.getByLabel(UM.colUserNo, { exact: true }).fill(String(NEW_USER_NO))
        await page.getByLabel(UM.colUserNm, { exact: true }).fill(NEW_USER_NM)
        await step()
        await fkey(9).click()

        await expect(page).toHaveURL(/\/settings\/user-master$/, { timeout: 30000 })
        await step()

        const row = rowOf(NEW_USER_NO)
        await expect(row, 'dòng vừa tạo không thấy ở 一覧').toHaveCount(1, { timeout: 30000 })
        await expect(row).toContainText(NEW_USER_NM)
        // Người mới chưa có tài khoản ⇒ trạng thái ログイン phải là 未設定.
        await expect(row, 'người mới tạo đã xác thực — lẽ ra phải là 未認証').toContainText(
            UM.loginUnverified,
        )
        await step()
    })

    // ── ログイン有効化 ghi thật (mail) ────────────────────────────────────────

    test('TC-INVITE-1 — điền email rồi F9 hiện confirm; bấm はい thì gửi mail', async () => {
        skipWithReason(
            !ALLOW_INVITE,
            'TEST_ALLOW_INVITE != 1 — bỏ qua vì thao tác này GỬI MAIL THẬT',
        )
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — cần dòng test do TC-WRITE-1 tạo')

        skipWithReason(
            (await rowCount(NEW_USER_NO)) === 0,
            `không còn dòng ${NEW_USER_NM} — TC-WRITE-1 chưa tạo được; chạy lại cả file`,
        )
        await openDetail(NEW_USER_NO)

        await page.getByLabel(UM.labelEmail, { exact: true }).fill(INVITE_EMAIL)
        await step()
        await fkey(9).click()

        // Q: 「このユーザはまだログインを有効化していません。… 送信しますか？」
        const confirm = confirmBox()
        await expect(confirm, 'F9 không hỏi xác nhận kích hoạt').toBeVisible({ timeout: 15000 })
        await expect(confirm).toContainText(UM.activateConfirmTitle)
        await expect(confirm).toContainText(INVITE_EMAIL)
        await step()

        await confirm.getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await expect(page, 'kích hoạt xong không quay về 一覧').toHaveURL(
            /\/settings\/user-master$/,
            { timeout: 30000 },
        )
        await step()

        // Trạng thái ログイン của dòng chuyển sang 招待中.
        await expect(
            rowOf(NEW_USER_NO),
            'gửi mail xong vẫn phải là 未認証 — mới mời chứ người ta chưa đặt mật khẩu',
        ).toContainText(UM.loginUnverified, { timeout: 30000 })
        await step()
    })

    test('TC-INVITE-2 — bấm いいえ: KHÔNG gửi mail nhưng thông tin VẪN lưu', async () => {
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — cần dòng test do TC-WRITE-1 tạo')

        skipWithReason((await rowCount(NEW_USER_NO)) === 0, `không còn dòng NO=${NEW_USER_NO}`)
        await openDetail(NEW_USER_NO)

        // Sửa một trường bất kỳ để chứng minh phần lưu KHÔNG phụ thuộc câu trả lời.
        const marker = `TEL-${Date.now() % 100000}`
        await page.getByLabel(UM.colUserTel, { exact: true }).fill(marker)
        await step()

        let called = false
        const watch = (r: { url: () => string }) => {
            if (/activate-login$/.test(new URL(r.url()).pathname)) called = true
        }
        page.on('request', watch)

        await fkey(9).click()
        const confirm = confirmBox()
        await expect(confirm).toBeVisible({ timeout: 15000 })
        await confirm.getByRole('button', { name: /^(いいえ|No)$/ }).click()
        await step()

        page.off('request', watch)
        expect(called, 'bấm いいえ mà vẫn gọi activate-login').toBeFalsy()
        await expect(page, 'từ chối gửi mail thì vẫn phải lưu xong và về 一覧').toHaveURL(
            /\/settings\/user-master$/,
            { timeout: 30000 },
        )

        // Mấu chốt: F9 là để LƯU, hộp thoại chỉ hỏi thêm chuyện gửi mail. Nói
        // いいえ mà mất luôn phần vừa nhập thì người dùng không hiểu nổi.
        await openDetail(NEW_USER_NO)
        await expect(
            page.getByLabel(UM.colUserTel, { exact: true }),
            'bấm いいえ làm mất luôn thông tin vừa sửa',
        ).toHaveValue(marker, { timeout: 30000 })
        await step()
    })

    test('TC-DB-1 — 有効化 chỉ set email, password_hash vẫn NULL', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB != 1 — bỏ qua kiểm tra tầng DB')
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa có dòng nào được 有効化')

        const row = await withDb(async (c) => {
            const r = await c.query(
                `SELECT email, password_hash FROM ${DB_SCHEMA}.app_user
                  WHERE user_no = $1 AND deleted_at IS NULL`,
                [NEW_USER_NO],
            )
            return r.rows[0] as { email: string | null; password_hash: string | null } | undefined
        })

        skipWithReason(row === undefined, `app_user NO=${NEW_USER_NO} không tồn tại`)
        expect(row!.email, 'email chưa được set sau khi 有効化').toBeTruthy()
        // Cốt lõi của thiết kế: khoảng giữa 有効化 và nhận mail KHÔNG phải cửa vào.
        expect(
            row!.password_hash,
            'password_hash đã có giá trị dù người dùng chưa nhận mail',
        ).toBeNull()
    })

    test('TC-MAIL-1 — Mailpit nhận đúng thư mời: tiêu đề, xưng tên, link kích hoạt', async () => {
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa gửi mail nào')
        skipWithReason(!(await mailpitUp()), 'Mailpit không chạy — bật docker ochacom_mailpit')

        const mail = await waitForMailTo(INVITE_EMAIL)
        expect(mail, `không có thư mời nào tới ${INVITE_EMAIL}`).not.toBeNull()

        expect(mail!.To.map((t) => t.Address)).toContain(INVITE_EMAIL)
        // subject.sbn: 【OChacom】{{ clinic_name }} ログイン登録のご案内
        expect(mail!.Subject, 'tiêu đề không đúng mẫu user-master-invite').toContain(
            'ログイン登録のご案内',
        )

        // お名前 đã điền ⇒ mail phải xưng tên. Kiểm luôn KHÔNG có 「 様」 cụt đầu —
        // đó là lý do template tách hai bản có tên / không tên.
        expect(mail!.Text, 'mail không xưng tên dù đã điền お名前').toContain(
            `${NEW_USER_NM} 様`,
        )
        expect(mail!.Text, 'mail có 「 様」 cụt đầu — template ghép chuỗi rỗng').not.toMatch(
            /(^|\n)\s*様/,
        )

        // Quản trị viên không đặt mật khẩu ⇒ mail tuyệt đối không được chứa mật khẩu.
        expect(mail!.Text, 'mail có chứa mật khẩu — không được phép').not.toContain(
            INVITE_PASSWORD,
        )

        firstInviteToken = extractActivateToken(mail!)
        expect(firstInviteToken, 'mail không có link /activate-login?token=').toBeTruthy()
        expect(extractActivateLink(mail!)).toContain('/activate-login?token=')
    })

    test('TC-MAIL-2 — F9 lần nữa gửi thư mới và làm CHẾT link cũ', async () => {
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa gửi mail nào')
        skipWithReason(!(await mailpitUp()), 'Mailpit không chạy')
        skipWithReason(firstInviteToken === null, 'TC-MAIL-1 không lấy được token đầu tiên')

        // Không còn nút メール再送: người chưa redeem thì bấm F9 lần nữa chính là
        // gửi lại — BE thu hồi token cũ rồi phát token mới.
        await openDetail(NEW_USER_NO)
        await fkey(9).click()

        const confirm = confirmBox()
        await expect(confirm, 'người 招待中 mà F9 không hỏi gửi lại').toBeVisible({
            timeout: 15000,
        })
        await confirm.getByRole('button', { name: /^(はい|Yes)$/ }).click()
        await step()

        // Phân biệt thư mới bằng TOKEN, không bằng thời gian: mỗi lần gửi là một
        // token khác nên đây là dấu hiệu chắc chắn, không phụ thuộc đồng hồ.
        const mail = await waitForMailTo(INVITE_EMAIL, {
            accept: (m) => extractActivateToken(m) !== firstInviteToken,
        })
        expect(mail, 'không nhận được thư mời mới').not.toBeNull()

        const newToken = extractActivateToken(mail!)
        expect(newToken, 'thư mới không có token').toBeTruthy()
        expect(newToken, 'gửi lại phát đúng token cũ — không phải rotation').not.toBe(
            firstInviteToken,
        )

        // Link cũ phải chết, để một mail bị chuyển nhầm hoặc rò rỉ không dùng được.
        const deadToken = firstInviteToken
        await withInviteePage(async (invitee) => {
            await invitee.goto(`/activate-login?token=${deadToken}`, {
                waitUntil: 'domcontentloaded',
            })
            await invitee.locator('#password').fill(INVITE_PASSWORD)
            await invitee.locator('#passwordConfirm').fill(INVITE_PASSWORD)
            await invitee.getByRole('button', { name: ja_redeemSubmit }).click()
            await expect(
                invitee.getByText(UM.inviteInvalid),
                'link cũ vẫn dùng được sau khi gửi lại — token chưa bị revoke',
            ).toBeVisible({ timeout: 20000 })
        })
        await step()

        firstInviteToken = newToken
    })

    test('TC-MAIL-3 — mở link mới, tự đặt mật khẩu rồi đăng nhập được', async () => {
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa gửi mail nào')
        skipWithReason(firstInviteToken === null, 'không có token hợp lệ để redeem')

        const token = firstInviteToken
        await withInviteePage(async (invitee) => {
            await invitee.goto(`/activate-login?token=${token}`, {
                waitUntil: 'domcontentloaded',
            })
            await expect(invitee.getByText(ja_redeemHeading)).toBeVisible({ timeout: 30000 })

            // 氏名 sửa được ở đây — KHÁC hộp thoại của quản trị viên (chỉ dùng cho mail).
            await invitee.locator('#displayName').fill(REDEEMED_NM)
            await invitee.locator('#password').fill(INVITE_PASSWORD)
            await invitee.locator('#passwordConfirm').fill(INVITE_PASSWORD)
            await invitee.getByRole('button', { name: ja_redeemSubmit }).click()

            // Xong thì về màn đăng nhập — cố ý KHÔNG cấp session luôn, để mật khẩu
            // vừa đặt được dùng thật một lần trước khi người ta phụ thuộc vào nó.
            await expect(invitee, 'redeem xong không quay về /login').toHaveURL(/\/login/, {
                timeout: 30000,
            })

            // Đăng nhập thật bằng tài khoản vừa kích hoạt.
            await invitee.getByLabel(JA.emailLabel).fill(INVITE_EMAIL)
            await invitee.getByLabel(JA.passwordLabel, { exact: true }).fill(INVITE_PASSWORD)
            await invitee.getByRole('button', { name: JA.submit }).click()
            await expect(
                invitee,
                'không đăng nhập được bằng mật khẩu tự đặt — chuỗi mời chưa thông',
            ).toHaveURL(/\/$/, { timeout: 30000 })
        })
        await step()
    })

    test('TC-MAIL-4 — 氏名 sửa ở màn redeem GHI vào master', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB != 1 — bỏ qua kiểm tra tầng DB')
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa redeem lần nào')

        const row = await withDb(async (c) => {
            const r = await c.query(
                `SELECT display_name FROM ${DB_SCHEMA}.app_user
                  WHERE user_no = $1 AND deleted_at IS NULL`,
                [NEW_USER_NO],
            )
            return r.rows[0] as { display_name: string } | undefined
        })
        skipWithReason(row === undefined, `app_user NO=${NEW_USER_NO} không tồn tại`)

        // Khác hộp thoại của quản trị viên: tên gõ ở đó CHỈ vào nội dung mail, còn
        // tên người tự sửa lúc redeem thì mới ghi vào master.
        expect(row!.display_name, '氏名 sửa lúc redeem không được ghi vào master').toBe(
            REDEEMED_NM,
        )
    })

    test('TC-MAIL-5 — đăng ký xong thì ô メールアドレス bị khoá', async () => {
        skipWithReason(!ALLOW_INVITE, 'TEST_ALLOW_INVITE != 1 — chưa redeem lần nào')

        await gotoList()
        const row = rowOf(NEW_USER_NO)
        skipWithReason((await row.count()) === 0, `không còn dòng NO=${NEW_USER_NO}`)
        await expect(row, 'sau khi redeem, cột 認証状態 phải là 認証済').toContainText(
            UM.loginVerified,
            { timeout: 30000 },
        )

        await openDetail(NEW_USER_NO)

        // Đăng ký xong thì email là danh tính đăng nhập — đổi nó là đổi người.
        await expect(
            page.getByLabel(UM.labelEmail, { exact: true }),
            'đã kích hoạt xong mà ô email vẫn sửa được',
        ).toBeDisabled()
        await expect(page.getByText(UM.emailLocked)).toBeVisible()
        await step()
    })

    test('TC-WRITE-2 — 削除 dòng vừa tạo (chưa dính lịch sử nên xoá được)', async () => {
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — bỏ qua thao tác GHI DB (Rule 18.1)')

        // TC-INVITE-1 kết thúc ở màn chi tiết. Về 一覧 trước để testcase này không
        // phụ thuộc vào việc testcase ngay trước nó dừng ở đâu.
        await expect(await rowCount(NEW_USER_NO), 'không còn dòng test để xoá').toBe(1)
        await openDetail(NEW_USER_NO)

        await fkey(8).click()
        const confirm = confirmBox()
        await expect(confirm).toBeVisible({ timeout: 15000 })
        await expect(confirm).toContainText(UM.deleteTitle)
        await step()

        // Rule 13.2 — nhãn nút confirm có thể là Yes hoặc はい.
        await confirm.getByRole('button', { name: /^(Yes|はい|削除する)$/ }).click()
        await expect(page).toHaveURL(/\/settings\/user-master$/, { timeout: 30000 })
        await step()

        await expect(rowOf(NEW_USER_NO), 'dòng vừa xoá vẫn còn ở 一覧').toHaveCount(0, {
            timeout: 30000,
        })
        await step()
    })

    test('TC-WRITE-3 — 削除 người đang dính lịch sử bị BE từ chối', async () => {
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — bỏ qua thao tác GHI DB (Rule 18.1)')

        // Đây là điểm khác WinForm rõ nhất: bản cũ DELETE thẳng, không kiểm gì,
        // nên xoá một bác sĩ đã nghỉ là làm mồ côi toàn bộ trn_trn.dr_no trỏ tới.
        // Testcase này KHÔNG được xoá thật cái gì: nó cố tình chọn một người CHẮC
        // CHẮN đang dính lịch sử, nên kết quả đúng là "bị từ chối".
        let victimNo: number | undefined
        if (PINNED_USER_NO !== undefined) {
            victimNo = Number(PINNED_USER_NO)
        } else if (dbEnabled) {
            victimNo = await withDb(async (c) => {
                const r = await c.query(
                    `SELECT u.user_no
                       FROM ${DB_SCHEMA}.app_user u
                      WHERE u.deleted_at IS NULL
                        AND EXISTS (SELECT 1 FROM ${DB_SCHEMA}.trn_trn t
                                     WHERE t.dr_no = u.user_no AND t.deleted_at IS NULL)
                      ORDER BY u.user_no
                      LIMIT 1`,
                )
                return r.rows[0]?.user_no as number | undefined
            })
        }

        skipWithReason(
            victimNo === undefined,
            'không xác định được người CÓ lịch sử (cần TEST_DB=1 hoặc TEST_USER_MASTER_NO) — ' +
                'không thử xoá bừa để tránh xoá nhầm dữ liệu thật',
        )

        expect(await rowCount(victimNo!), `không thấy NO=${victimNo} ở 一覧`).toBe(1)
        await openDetail(victimNo!)

        await fkey(8).click()
        const confirm = confirmBox()
        await expect(confirm).toBeVisible({ timeout: 15000 })
        await expect(confirm).toContainText(UM.deleteTitle)
        // Rule 13.2 — nhãn nút confirm có thể là Yes hoặc はい.
        await confirm.getByRole('button', { name: /^(Yes|はい|削除する)$/ }).click()
        await step()

        // Toast báo lỗi chớp tắt nên KHÔNG assert theo nó (dễ flaky). Assert sự
        // thật bền vững: BE từ chối ⇒ vẫn đứng ở màn 更新 và người đó còn nguyên
        // trong 一覧.
        await expect(page, 'BE chặn xoá nhưng FE vẫn rời màn 更新').toHaveURL(
            new RegExp(`/settings/user-master/${victimNo}$`),
            { timeout: 15000 },
        )

        await gotoList()
        await expect(
            rowOf(victimNo!),
            `NO=${victimNo} biến mất khỏi 一覧 — WinForm xoá thẳng, bản web PHẢI chặn`,
        ).toHaveCount(1, { timeout: 30000 })
        await step()
    })

    test('TC-DB-2 — dọn dòng test khỏi app_user', async () => {
        skipWithReason(!dbEnabled, 'TEST_DB != 1 — không dọn được, xoá tay nếu cần')
        skipWithReason(!ALLOW_SAVE, 'TEST_ALLOW_SAVE != 1 — không có gì để dọn')

        const removed = await purgeTestUser()
        console.log(`dọn app_user NO=${NEW_USER_NO}: ${removed} dòng`)
    })
})
