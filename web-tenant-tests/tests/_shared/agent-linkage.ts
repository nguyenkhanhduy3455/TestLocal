/**
 * Hạ tầng cho spec 機器連携 (agent ghi file thiết bị sau khi lưu bệnh nhân).
 *
 * Agent chạy trên máy Windows (ochacom-win), còn Playwright chạy trên Mac, nên mọi thứ
 * chạm đĩa của agent (tạo thư mục thiết bị, ex.bat, đọc file agent ghi ra) đi qua ssh.
 * Đọc file KHÔNG dùng file-viewer: nó bind 127.0.0.1 của máy chạy nó, muốn đọc đĩa
 * Windows phải bật thêm một server + tunnel; ssh + base64 thì giải mã Shift_JIS ngay
 * trong Node (agent ghi file thiết bị bằng Shift_JIS — ShiftJisAppend.ShiftJis).
 *
 * Cấu hình agent đi đúng đường của màn 機器連携: PUT {agent}/v1/config kèm syncTicket
 * do cloud cấp. Token + device id lấy từ chính phiên đã đăng nhập của `authedPage`.
 *
 *   TEST_AGENT_SSH_HOST=ochacom-win      # host ssh của máy chạy agent
 *   TEST_AGENT_LINKAGE_DIR=C:\TCG\e2e-linkage   # gốc thư mục thiết bị tạm; mọi lệnh xoá bị chặn trong gốc này
 */
import { execFileSync } from 'node:child_process'

import type { Page } from '@playwright/test'

import { AGENT_BASE_URL } from './agent-print'
import { BASE_URL } from './env'

export const WIN_HOST = process.env.TEST_AGENT_SSH_HOST ?? 'ochacom-win'
export const WIN_LINKAGE_ROOT = process.env.TEST_AGENT_LINKAGE_DIR ?? 'C:\\TCG\\e2e-linkage'

function ssh(script: string): string {
    return execFileSync('ssh', ['-o', 'BatchMode=yes', WIN_HOST, script], {
        encoding: 'utf8',
        timeout: 30_000,
    })
}

function requireInRoot(dir: string): void {
    const root = WIN_LINKAGE_ROOT.replace(/[\\/]+$/, '').toLowerCase() + '\\'
    if (!dir.toLowerCase().startsWith(root) || dir.includes('..') || dir.includes("'")) {
        throw new Error(`${dir} nằm ngoài ${WIN_LINKAGE_ROOT} — không đụng vào.`)
    }
}

/** Tạo thư mục thiết bị trên máy agent, kèm `ex.bat` rỗng (Kintone chạy file này sau khi ghi). */
export function winPrepareDeviceDir(dir: string): void {
    requireInRoot(dir)
    ssh(
        `New-Item -ItemType Directory -Force -Path '${dir}' | Out-Null; ` +
            `Set-Content -Path '${dir}\\ex.bat' -Value '@echo off' -Encoding ASCII`,
    )
}

export function winRemoveDeviceDir(dir: string): void {
    requireInRoot(dir)
    ssh(`Remove-Item -Recurse -Force -Path '${dir}' -ErrorAction SilentlyContinue`)
}

/** Tên file (không tính file tạm `.xxx.tmp`) trong thư mục thiết bị. */
export function winListDeviceFiles(dir: string): string[] {
    requireInRoot(dir)
    const out = ssh(
        `Get-ChildItem -Force -Path '${dir}' -File | Where-Object { -not $_.Name.StartsWith('.') } | ForEach-Object { $_.Name }`,
    )
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
}

/** Đọc file Shift_JIS trên máy agent; null nếu chưa có. */
export function winReadShiftJis(path: string): string | null {
    requireInRoot(path)
    const b64 = ssh(
        `if (Test-Path -LiteralPath '${path}') { [Convert]::ToBase64String([IO.File]::ReadAllBytes('${path}')) }`,
    ).trim()
    if (!b64) return null
    return new TextDecoder('shift_jis').decode(Buffer.from(b64, 'base64'))
}

// ── Agent HTTP ──────────────────────────────────────────────────────────────

export interface AgentConnector {
    category: string
    linkCode: number
    enabled: boolean
    settings: Record<string, string | number | boolean>
    [k: string]: unknown
}

interface AgentConfig {
    connectors: AgentConnector[]
    printMappings: unknown[]
    settings: Record<string, unknown>
    configVersion: number
}

export interface AgentSession {
    getConfig(): Promise<AgentConfig>
    /** Thay các connector của `categories` bằng `next`, giữ nguyên phần còn lại của config. */
    replaceConnectors(categories: string[], next: AgentConnector[]): Promise<void>
    /** Đặt lại đúng danh sách connector đã đọc lúc đầu. */
    putConnectors(connectors: AgentConnector[]): Promise<void>
}

/**
 * Lấy bearer của phiên `authedPage` từ một request app tự gọi — accessToken chỉ nằm trong RAM
 * (xem auth.ts) nên không có chỗ nào khác để đọc.
 */
async function captureBearer(page: Page): Promise<string> {
    const seen = page.waitForRequest(
        async (r) => /\/api\/tenant\//.test(r.url()) && Boolean((await r.allHeaders())['authorization']),
        { timeout: 60_000 },
    )
    await page.goto('/treatments', { waitUntil: 'domcontentloaded' })
    return (await (await seen).allHeaders())['authorization']
}

export async function openAgentSession(page: Page): Promise<AgentSession> {
    const bearer = await captureBearer(page)
    const origin = new URL(BASE_URL).origin
    const agentHeaders = { Authorization: bearer, Origin: origin, 'Content-Type': 'application/json' }

    const call = async <T>(method: string, url: string, headers: Record<string, string>, data?: unknown): Promise<T> => {
        const res = await page.request.fetch(url, { method, headers, data })
        const text = await res.text()
        if (!res.ok()) throw new Error(`${method} ${url} → ${res.status()}: ${text.slice(0, 300)}`)
        return (text ? JSON.parse(text) : undefined) as T
    }

    const deviceId = await page.evaluate(() => {
        const raw = localStorage.getItem('ochacom.device-id')
        if (!raw) return null
        try {
            return String(JSON.parse(raw))
        } catch {
            return raw
        }
    })

    const mintTicket = async (): Promise<string> => {
        const info = await call<{ agentId: string }>('GET', `${AGENT_BASE_URL}/v1/agent`, agentHeaders)
        const res = await call<{ data?: { token: string }; token?: string }>(
            'POST',
            `${BASE_URL.replace(/\/$/, '')}/api/tenant/agent-config/sync-ticket`,
            { ...agentHeaders, ...(deviceId ? { 'X-Ochacom-Device-Id': deviceId } : {}) },
            { agentId: info.agentId },
        )
        return (res.data?.token ?? res.token)!
    }

    const getConfig = () => call<AgentConfig>('GET', `${AGENT_BASE_URL}/v1/config`, agentHeaders)

    const putConnectors = async (connectors: AgentConnector[]) => {
        const cfg = await getConfig()
        await call('PUT', `${AGENT_BASE_URL}/v1/config`, agentHeaders, {
            connectors,
            printMappings: cfg.printMappings,
            settings: cfg.settings,
            syncTicket: await mintTicket(),
            expectedConfigVersion: cfg.configVersion,
        })
    }

    return {
        getConfig,
        putConnectors,
        async replaceConnectors(categories, next) {
            const cfg = await getConfig()
            await putConnectors([...cfg.connectors.filter((c) => !categories.includes(c.category)), ...next])
        },
    }
}
