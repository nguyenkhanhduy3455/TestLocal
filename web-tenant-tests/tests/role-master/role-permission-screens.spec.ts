import { type APIRequestContext, type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { dbEnabled } from '../_shared/db'
import { newTestPage } from '../_shared/entry'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { ADMIN_USER, JA } from '../_shared/test-data'
import {
    adminToken,
    createRole,
    newApi,
    purge,
    type RoleInfo,
    seedUser,
    setRolePermissions,
} from './_role-api'

/**
 * Quyền 閲覧 ở FE cho MỌI màn hình của catalog: route nào mở được, nút nào ở
 * マスタ登録メニュー bấm được.
 *
 * Một user test (1 login UI) giữ role 「E2E画面権限」; admin đổi quyền role qua API rồi
 * spec nạp lại trang MỘT lần — lúc khởi động app refresh token và nhận quyền mới — sau
 * đó đi qua các route bằng điều hướng trong SPA (không refresh thêm).
 *
 * NGÂN SÁCH REFRESH: /tenant/auth/refresh giới hạn 30 lượt / cửa sổ theo IP, nên KHÔNG
 * chạy 17 vòng (mỗi màn 1 vòng). Thay vào đó mỗi màn được đánh số 1..17 và chạy 5 vòng
 * theo bit: vòng k cấp `.view` cho các màn có bit k = 1. Mẫu mở/chặn của một route qua 5
 * vòng phải đúng bằng số của màn sở hữu nó ⇒ route gán nhầm màn (hoặc không gán) đều lộ.
 *
 *   TC-1 role rỗng: cả 18 route ra màn 403, mọi nút màn hình ở メニュー bị khoá.
 *   TC-2 5 vòng theo bit: mỗi route / mỗi nút メニュー mở đúng khi màn của nó được cấp.
 *   TC-3 role 「mọi quyền 閲覧」: cả 18 route mở được, mọi nút màn hình bấm được.
 *
 * Phím ghi (requiresEdit) KHÔNG quét ở đây — BE chặn mọi endpoint ghi và
 * role-permission-api.spec.ts kiểm cả 122 endpoint; role-permissions.spec.ts kiểm
 * phím khoá ở 物品マスタ.
 *
 * Chạy: npx playwright test tests/role-master/role-permission-screens.spec.ts --workers=1
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 })

const USER = { userNo: 9904, email: 'e2e-perm-ui@example.test', name: 'E2E画面権限' }
const ROLE_CODE = 'e2e-perm-ui'
const FORBIDDEN_TITLE = 'この画面を表示する権限がありません'

/** Route của từng màn (khớp ROUTE_SCREENS ở shared/permissions/permissions.ts). */
const SCREEN_ROUTES: Record<string, string[]> = {
    patients: ['/patients'],
    'oral-examinations': ['/oral-examinations'],
    treatments: ['/treatments'],
    'counter-payments': ['/counter-payments'],
    'medical-records': ['/medical-records'],
    'settings-general': ['/settings/general'],
    'agent-settings': ['/settings/agent', '/settings/printers', '/settings/linkage'],
    'master-dis': ['/masters/dis'],
    'master-trt': ['/masters/trt'],
    'master-drug': ['/masters/drugs'],
    'master-goods': ['/masters/goods'],
    'master-pack': ['/masters/pack'],
    'master-set': ['/masters/set'],
    'master-cmt': ['/masters/cmt'],
    'master-carryover': [], // không có route: overlay mở từ メニュー
    'master-cmt2': ['/masters/cmt2'],
    'master-guide': ['/masters/guide'],
}

/** Nút của マスタ登録メニュー mở từng màn マスタ. */
const MENU_BUTTONS: Record<string, string> = {
    'master-dis': '病名マスタ',
    'master-trt': '処置マスタ',
    'master-drug': '薬剤マスタ',
    'master-goods': '物品マスタ',
    'master-pack': '処置パックマスタ',
    'master-set': '装着料マスタ',
    'master-cmt': '摘要コード',
    'master-carryover': '繰越しマスタ',
    'master-cmt2': '摘要コード２',
    'master-guide': 'ガイド編集',
}

const SCREENS = Object.keys(SCREEN_ROUTES)
const ALL_ROUTES = SCREENS.flatMap((s) => SCREEN_ROUTES[s]!)

test.describe('Quyền 閲覧 ở FE — mọi màn hình của catalog', () => {
    test.skip(!dbEnabled, 'cần TEST_DB=1 để seed user test')

    let admin: Page
    let member: Page
    let api: APIRequestContext
    let role: RoleInfo
    let token: string

    /** Đổi quyền rồi nạp lại trang 1 lần để FE nhận quyền mới (1 lượt refresh). */
    async function grant(permissions: string[]): Promise<void> {
        await setRolePermissions(api, token, role, permissions)
        await open('/')
    }

    /** goto rồi chờ app nạp xong người dùng (tên ở sidebar); Vite dev hụt module thì nạp lại. */
    async function open(path: string, ready?: Locator): Promise<void> {
        const signedIn = member.getByText(USER.name, { exact: true })
        for (let attempt = 1; ; attempt++) {
            await member.goto(path, { waitUntil: 'domcontentloaded' })
            try {
                await expect(signedIn).toBeVisible({ timeout: 30_000 })
                if (ready) await expect(ready).toBeVisible({ timeout: 30_000 })
                return
            } catch (error) {
                if (attempt === 3) throw error
            }
        }
    }

    const forbidden = () => member.getByRole('heading', { name: FORBIDDEN_TITLE })

    /** Điều hướng trong SPA (TanStack Router nghe popstate) — không nạp lại, không refresh token. */
    async function navigate(path: string): Promise<void> {
        await member.evaluate((to) => {
            window.history.pushState({}, '', to)
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }))
        }, path)
        // Route có thể tự chuyển hướng (/medical-records → /medical-records/patient-select,
        // /settings/printers → /settings/agent?tab=printers) ⇒ chỉ chờ đã rời / về dashboard.
        await expect(member).toHaveURL((url) => (path === '/') === (url.pathname === '/'))
    }

    /**
     * Route có bị 403 không. Đi qua dashboard (không bao giờ 403) trước, để màn 403 của
     * route trước không bị đọc nhầm thành kết quả của route này. route.tsx quyết định 403
     * đồng bộ theo pathname + user, nên chờ ngắn là đủ.
     */
    async function isForbidden(path: string): Promise<boolean> {
        await navigate('/')
        await expect(forbidden()).toHaveCount(0)
        await navigate(path)
        return forbidden()
            .waitFor({ state: 'visible', timeout: 3_000 })
            .then(() => true)
            .catch(() => false)
    }

    async function expectRoute(path: string, allowed: boolean): Promise<string | null> {
        const blocked = await isForbidden(path)
        return blocked === !allowed ? null : `${path} ${allowed ? 'bị 403' : 'KHÔNG bị 403'}`
    }

    async function menuState(): Promise<Record<string, boolean>> {
        await navigate('/masters')
        await expect(member.getByRole('button', { name: 'ガイド編集', exact: true })).toBeVisible({
            timeout: 30_000,
        })
        const state: Record<string, boolean> = {}
        for (const [screen, label] of Object.entries(MENU_BUTTONS)) {
            state[screen] = await member.getByRole('button', { name: label, exact: true }).isEnabled()
        }
        return state
    }

    test.beforeAll(async ({ authedPage, browser }) => {
        admin = authedPage
        api = await newApi()
        await purge([USER], [ROLE_CODE])
        token = await adminToken(admin) // 1 lượt refresh cho cả file (token sống 15 phút)
        role = await createRole(api, token, ROLE_CODE, 'E2E画面権限', [])
        await seedUser(USER, ROLE_CODE)

        member = await newTestPage(browser)
        await member.goto('/login', { waitUntil: 'domcontentloaded' })
        await member.getByLabel(JA.emailLabel).fill(USER.email)
        await member.getByLabel(JA.passwordLabel, { exact: true }).fill(ADMIN_USER.password)
        await member.getByRole('button', { name: JA.submit }).click()
        await expect(member, 'user test không đăng nhập được (rate-limit?)').toHaveURL(/\/$/, {
            timeout: 30_000,
        })
    })

    test.afterAll(async () => {
        await member?.close()
        await api?.dispose()
        await releaseSharedPage(admin)
        if (dbEnabled) await purge([USER], [ROLE_CODE])
    })

    test('TC-1 — role rỗng: mọi route 403, mọi nút màn hình bị khoá', async () => {
        await grant([])
        const wrong: string[] = []
        for (const path of ALL_ROUTES) {
            const w = await expectRoute(path, false)
            if (w) wrong.push(w)
        }
        await captureFixedUi(member, 'role-permission-screens-forbidden')
        const menu = await menuState()
        wrong.push(...Object.entries(menu).filter(([, on]) => on).map(([s]) => `nút ${MENU_BUTTONS[s]} bấm được`))
        expect(wrong).toEqual([])
    })

    test('TC-2 — 5 vòng theo bit: route / nút メニュー mở đúng khi màn của nó được cấp', async () => {
        // Màn thứ i (0-based) mang số i+1: 1..17 vừa 5 bit, không màn nào là 0.
        const numberOf = (screen: string) => SCREENS.indexOf(screen) + 1
        const BITS = 5
        const wrong: string[] = []
        for (let bit = 0; bit < BITS; bit++) {
            const granted = SCREENS.filter((s) => (numberOf(s) >> bit) & 1)
            await grant(granted.map((s) => `${s}.view`))
            for (const screen of SCREENS) {
                const allowed = granted.includes(screen)
                for (const path of SCREEN_ROUTES[screen]!) {
                    const w = await expectRoute(path, allowed)
                    if (w) wrong.push(`[bit ${bit}] ${w}`)
                }
            }
            const menu = await menuState()
            for (const [s, on] of Object.entries(menu)) {
                if (on !== granted.includes(s)) wrong.push(`[bit ${bit}] nút ${MENU_BUTTONS[s]} ${on ? 'bấm được' : 'bị khoá'}`)
            }
        }
        expect(wrong).toEqual([])
    })

    test('TC-3 — mọi quyền 閲覧: mọi route mở được, mọi nút màn hình bấm được', async () => {
        await grant(SCREENS.map((s) => `${s}.view`))
        const wrong: string[] = []
        for (const path of ALL_ROUTES) {
            const w = await expectRoute(path, true)
            if (w) wrong.push(w)
        }
        const menu = await menuState()
        wrong.push(...Object.entries(menu).filter(([, on]) => !on).map(([s]) => `nút ${MENU_BUTTONS[s]} bị khoá`))
        // ユーザマスタ / ロールマスタ vẫn chỉ cho admin.
        for (const label of ['ユーザマスタ', 'ロールマスタ']) {
            if (await member.getByRole('button', { name: label, exact: true }).isEnabled()) wrong.push(`nút ${label} bấm được`)
        }
        await captureFixedUi(member, 'role-permission-screens-all-view-menu')
        expect(wrong).toEqual([])
    })
})
