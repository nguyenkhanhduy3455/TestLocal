/**
 * Ép giá trị ［F8］キー会計機能設定 (`accButton`, mst_cod cd_type 200) mà màn 診療入力
 * đọc được — KHÔNG ghi DB.
 *
 * ─── Vì sao cần ──────────────────────────────────────────────────────────────
 * frm203002 rẽ nhánh F8 theo `XmlControl.OchaXml.InpInfo.AccButton`
 * (frm203002.cs:4772-4782, nhãn ở :518-531):
 *   · `== 0` → 「会計データ作成」 (IDM_AccDataOnly_Click: không cổng lưu, KHÔNG sang 窓口精算)
 *   · khác 0 → 「会計」         (IDM_Acc_Click: cổng lưu + sang 窓口精算)
 * Ocha.xml mẫu không có khoá AccButton ⇒ int mặc định 0 ⇒ máy chưa từng lưu setting
 * chạy 「会計データ作成」. Web giữ đúng mặc định đó (device_config trống ⇒ 0).
 *
 * Hệ quả cho e2e: máy test KHÔNG có dòng device_config ⇒ F8 = 会計データ作成. Spec
 * nào bấm F8 mà chờ chuỗi 「会計」 (sang /counter-payments, hộp 処置データ変更) phải
 * ép `accButton = 1` bằng helper này, nếu không sẽ đỏ oan.
 *
 * ─── Cách làm ────────────────────────────────────────────────────────────────
 * Chặn `GET /tenant/settings/inp`, cho request đi thật rồi vá `data.device.accButton`
 * trước khi trả về FE. PUT (F9 登録 của dialog 診療入力設定) đi thẳng, không vá.
 * Query FE có staleTime 0 và key theo deviceId ⇒ mỗi lần `page.goto` màn 診療入力 là
 * đọc lại, nên đổi giá trị bằng `set()` rồi goto lại là ăn.
 *
 * ⚠️ PHẢI gọi `dispose()` ở afterAll: page dùng chung theo worker, route không gỡ
 * sẽ rò sang spec chạy sau (cùng lý do với installOverlayHandlers).
 */
import type { Page, Route } from '@playwright/test'

/** cd_val của mst_cod cd_type 200 (seed 0.0.2: 0 = 会計データ作成, 1 = 会計). */
export const ACC_BUTTON = { AccDataOnly: 0, Acc: 1 } as const

const SETTINGS_INP_URL = /\/tenant\/settings\/inp(\?|$)/

export interface AccButtonRoute {
    /** Đổi giá trị cho các lần đọc SAU (goto lại màn hình để FE đọc lại). */
    set(value: number): void
    /** Gỡ route — gọi ở afterAll. */
    dispose(): Promise<void>
}

export async function routeAccButton(page: Page, initial: number): Promise<AccButtonRoute> {
    let value = initial
    const handler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        const json = (await res.json()) as { data?: { device?: Record<string, unknown> } }
        if (json.data?.device) json.data.device.accButton = value
        await route.fulfill({ response: res, json })
    }
    await page.route(SETTINGS_INP_URL, handler)
    return {
        set: (v) => {
            value = v
        },
        dispose: () => page.unroute(SETTINGS_INP_URL, handler),
    }
}
