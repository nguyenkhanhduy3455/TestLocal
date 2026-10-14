/**
 * Rule 24 — 診療入力 full-screen takeover lists (F11 → 9 オプション …). FACT:
 * the takeover is `div.fixed.inset-y-0.z-50` (or a role="dialog" for the
 * チェックルール hub children), opened from the entry screen of an existing
 * patient (read-only: nothing is saved). Rows come from the shared master data.
 */
import { type Locator, type Page } from '@playwright/test'

import { patNo } from '../_shared/env'
import { describeListChrome, type ListChromeDef } from '../_shared/list-screen-chrome'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect } from '../_shared/session'

const PAT_NO = patNo('12138')
const TRT_DT = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()
const GRID_LOAD_TIMEOUT = 60_000
const MENU_OPTIONS = '9 オプション'
const MENU_CHK_RULE = '8 チェックルール登録'
const HUB_TITLE = 'チ ェ ッ ク ル ー ル 登 録'

const rowMenu = (page: Page) => page.getByRole('menu').filter({ hasText: '1 メニュー' })

const appeared = (locator: Locator, timeout: number) =>
    locator
        .waitFor({ state: 'visible', timeout })
        .then(() => true)
        .catch(() => false)

/** Say No to every 「〜を算定しますか？」 and close every カルテ記載選択 picker queued after entry. */
async function drainPopups(page: Page) {
    const santei = page.getByText(/を算定しますか？/).first()
    for (let i = 0; i < 20; i++) {
        if (!(await appeared(santei, 2_000))) break
        await page
            .getByRole('button', { name: /^(No|いいえ)$/ })
            .first()
            .click()
            .catch(() => {})
    }
    const picker = page.getByRole('dialog').filter({ hasText: 'カルテ記載選択' })
    for (let i = 0; i < 20; i++) {
        if (!(await appeared(picker, 2_000))) break
        await picker
            .getByRole('button', { name: 'F10 戻る' })
            .click()
            .catch(() => {})
    }
}

async function openEntry(page: Page) {
    for (let attempt = 1; ; attempt++) {
        await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
            waitUntil: 'domcontentloaded',
        })
        const loaded = await appeared(page.getByText('合計:').first(), GRID_LOAD_TIMEOUT)
        if (loaded) break
        if (attempt >= 2) throw new Error('診療入力 grid did not load')
    }
    await drainPopups(page)
}

async function openOptionsSubmenu(page: Page) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        await drainPopups(page)
        await page.keyboard.press('F11')
        if (
            await rowMenu(page)
                .isVisible({ timeout: 10_000 })
                .catch(() => false)
        )
            break
    }
    await expect(rowMenu(page), 'F11 menu did not open').toBeVisible()
    await rowMenu(page).getByRole('button', { name: MENU_OPTIONS }).hover()
    const sub = page.locator('[data-sub="options"] [data-submenu]')
    await expect(sub).toBeVisible({ timeout: 10_000 })
    return sub
}

const heading = (page: Page, title: string) =>
    page
        .locator('div.fixed.inset-y-0.z-50')
        .filter({ has: page.getByRole('heading', { name: title }) })

/** Screens opened straight from the 9 オプション submenu. */
const fromMenu = (name: string, menuLabel: RegExp | string, title: string): ListChromeDef => ({
    name,
    prompt: 'auto-selected',
    root: (page) => heading(page, title),
    open: async (page) => {
        await openEntry(page)
        const sub = await openOptionsSubmenu(page)
        await sub.getByRole('button', { name: menuLabel }).click()
        const screen = heading(page, title)
        await expect(screen, `${name} did not open`).toBeVisible({
            timeout: 30_000,
        })
        await expect(screen.getByText('合　計', { exact: true })).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
    },
})

/** Screens opened from the チェックルール登録 hub (role="dialog" children). */
const fromHub = (name: string, button: string, title: string): ListChromeDef => ({
    name,
    prompt: 'auto-selected',
    root: (page) => page.getByRole('dialog').filter({ hasText: title }),
    open: async (page) => {
        await openEntry(page)
        const sub = await openOptionsSubmenu(page)
        await sub.getByRole('button', { name: MENU_CHK_RULE }).click()
        const hub = page.getByRole('dialog').filter({ hasText: HUB_TITLE })
        await expect(hub).toBeVisible({ timeout: 30_000 })
        await hub.getByRole('button', { name: button, exact: true }).click()
        await expect(hub).toBeHidden({ timeout: 10_000 })
        const screen = page.getByRole('dialog').filter({ hasText: title })
        await expect(screen, `${name} did not open`).toBeVisible({
            timeout: 30_000,
        })
        await expect(screen.getByText('合　計', { exact: true })).toBeVisible({
            timeout: GRID_LOAD_TIMEOUT,
        })
    },
})

let disposeOverlays: (() => Promise<void>) | undefined

describeListChrome(
    [
        fromMenu('必要病名一覧', '3 必要病名登録', '必 要 病 名 一 覧'),
        fromMenu('自動算定一覧', '4 自動算定登録', '自 動 算 定 一 覧'),
        fromMenu('処置自動入力一覧', '5 処置自動入力登録', '処 置 自 動 入 力 一 覧'),
        {
            ...fromMenu(
                'コメント自動入力(カルテ自動算定)一覧',
                /コメント自動入力登録/,
                'カ ル テ 自 動 算 定 一 覧',
            ),
            // FACT: grouped 処置コード / 処置名 cells are blank when equal to the row above.
            codeInRow: 'inherit',
        },
        fromHub(
            '歯数・ブロックチェック一覧',
            '歯数・ブロックチェック登録',
            '歯 数 ・ ブ ロ ッ ク チ ェ ッ ク 一 覧',
        ),
        fromHub('期間・回数制限一覧', '期間・回数制限登録', '期 間 ・ 回 数 制 限 一 覧'),
        fromHub('組み合わせ算定不可一覧', '組み合わせ算定不可', '組 み 合 わ せ 算 定 不 可 一 覧'),
        fromHub('必要処置・摘要一覧', '必要処置・摘要登録', '必 要 処 置 ・ 摘 要 一 覧'),
        fromHub('算定可能処置一覧', '算定可能処置登録', '算 定 可 能 処 置 一 覧'),
        fromHub('処置グループ一覧', '処置グループ登録', '処 置 グ ル ー プ 一 覧'),
    ],
    {
        setup: async (page) => {
            disposeOverlays = await installOverlayHandlers(page, { santei: true })
        },
        teardown: async () => {
            await disposeOverlays?.()
        },
    },
)
