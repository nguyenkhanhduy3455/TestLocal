/**
 * Ép giá trị các cờ 診療入力設定 THEO MÁY (`device_config."inp"`) mà FE đọc được —
 * KHÔNG ghi DB. Cùng cơ chế với `acc-button.ts`, nhưng vá được field bất kỳ.
 *
 * ─── Vì sao cần ──────────────────────────────────────────────────────────────
 * Máy chạy test thường KHÔNG có dòng device_config ⇒ BE trả mặc định legacy, mà
 * nhiều cờ mặc định là 9 (OFF). Ví dụ `showBulkAccButton` = 9 ⇒ màn 患者選択 ẩn
 * F7 会計作成 (`if (ShowBulkAccButton == "9") btnChgVisible(btnF7, false)`,
 * frm203001.cs:572-575). Spec nào bấm F7 phải ép cờ này = 1.
 *
 * ─── Cách làm ────────────────────────────────────────────────────────────────
 * Chặn `GET /tenant/settings/inp`, cho request đi thật rồi vá `data.device.*`.
 * PUT đi thẳng. Query FE key theo deviceId, staleTime 0 ⇒ goto lại màn là đọc lại.
 *
 * `releaseSharedPage()` đã `unrouteAll()`, nhưng vẫn nên `dispose()` nếu spec
 * muốn trả lại giá trị thật giữa chừng.
 */
import type { Page, Route } from '@playwright/test'

/** Quy ước bật/tắt của mọi cờ 診療入力設定 (legacy ghi 1/9 chứ không phải 1/0). */
export const INP_FLAG = { On: 1, Off: 9 } as const

const SETTINGS_INP_URL = /\/tenant\/settings\/inp(\?|$)/

export interface InpDeviceSettingsRoute {
    /** Đổi các field cho các lần đọc SAU (goto lại màn để FE đọc lại). */
    set(patch: Record<string, number>): void
    /** Gỡ route. */
    dispose(): Promise<void>
}

export async function routeInpDeviceSettings(
    page: Page,
    initial: Record<string, number>,
): Promise<InpDeviceSettingsRoute> {
    let patch = { ...initial }
    const handler = async (route: Route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        const res = await route.fetch()
        const json = (await res.json()) as { data?: { device?: Record<string, unknown> } }
        if (json.data?.device) Object.assign(json.data.device, patch)
        await route.fulfill({ response: res, json })
    }
    await page.route(SETTINGS_INP_URL, handler)
    return {
        set: (next) => {
            patch = { ...next }
        },
        dispose: () => page.unroute(SETTINGS_INP_URL, handler),
    }
}
