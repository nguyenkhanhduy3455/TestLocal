/**
 * Rule 24 (TEST-PLAYPWRIGHT-GUIDELINE.md) — five mandatory testcases for every
 * list screen: header, side/bottom insets, hint, footer 合　計, 選択中 status.
 * The standard is `/patients` (PROJECT_GUIDELINE_ver18.md §3.35).
 *
 * `describeListChrome(defs)` registers, per screen, one serial describe that
 * opens the screen once in `beforeAll` (one shared page, Rule 19) and runs the
 * five testcases. A screen only supplies how to open itself and what is special
 * about it.
 *
 * Numbers are measured on `/patients` (1600x1000 viewport, 2026-10-14):
 *   h1 16px / letter-spacing 6.4px · panel inset 4px each side · FKeyBar inset
 *   8px each side · 6px between the panel bottom and the FKeyBar.
 * Compared with bounding boxes at ±1.5px, never with class names.
 */
import { type Locator, type Page } from '@playwright/test'

import { expect, releaseSharedPage, test } from './session'

const PANEL_INSET = 4
const FKEY_INSET = 8
const PANEL_TO_FKEY_GAP = 6
/** /patients: the FKeyBar is the last child, so it touches the bottom of the screen root. */
const FKEY_TO_BOTTOM = 0
const TOLERANCE = 1.5

const HINT = 'ダブルクリックで選択'
const TOTAL_LABEL = '合　計'

export type ListChromeDef = {
    /** Screen name for the describe title. */
    name: string
    /** Navigate to the screen and wait until its list footer is on screen. */
    open: (page: Page) => Promise<void>
    /** Screen root. Default: first `.animate-fade-in`; takeover overlays pass their dialog. */
    root?: (page: Page) => Locator
    /** false: view-only list without a double-click hint (24.3 asserts it is absent). Default true. */
    hint?: boolean
    /** Count unit in the footer. Default 件. */
    unit?: '件' | '人'
    /** Footer may show the idle placeholder 「－」 until a search runs (patient lists). */
    allowIdleCount?: boolean
    /**
     * Footer text before a row is picked. A string = that prompt; null = nothing by design
     * (/treatments); 'auto-selected' = the screen selects row 0 itself, so the test picks row 1.
     */
    prompt: string | null | 'auto-selected'
    /** Row to click for 24.5. Default: first `[data-testid^="row-"]` in the root. */
    pickRow?: (page: Page, root: Locator) => Locator
    /**
     * 'inherit': the picked row may not print its own code (cells blanked by IsTheSameCellValue when
     * equal to the row above), so the code is looked for on the picked row or any row above. Default 'direct'.
     */
    codeInRow?: 'direct' | 'inherit'
    /**
     * Status text expected after the pick when it is not `選択中: <code>` — the checkbox wait lists
     * (未精算, カルテ待ち) show `N件選択中 | タイマー停止中` once a row is ticked.
     */
    statusPattern?: RegExp
    /**
     * Pin which FKeyBar edges must sit at the 8px inset. Default: at least one edge does (the
     * slot layout varies per screen, so an empty first/last slot leaves that edge unmeasurable).
     */
    fkeyEdges?: ('left' | 'right')[]
    /** true: no row can be picked in this view (e.g. empty live list), so 24.5 is not registered. */
    skipStatus?: boolean
    /** Optional step run before the 24.5 pick (e.g. press 検索 on patient lists). */
    beforePick?: (page: Page, root: Locator) => Promise<void>
}

const defaultRoot = (page: Page) => page.locator('.animate-fade-in').first()

const fkeyButtons = (root: Locator) => root.getByRole('button', { name: /^F\d+/ })

async function boxOf(locator: Locator) {
    const box = await locator.boundingBox()
    expect(box, 'element has no bounding box').not.toBeNull()
    return box!
}

const HEADER_HEIGHT = 56
const HEADER_TO_FIRST_BOX_GAP = 4

/**
 * Header band height, and the gap + left inset of the FIRST bordered box under it (the search card,
 * or the list panel itself when the screen has no search card) — the same on every list screen.
 */
export async function expectHeaderSpacing(root: Locator) {
    await expect(async () => {
        const m = await root.evaluate((el) => {
            const band = el.querySelector('.medical-gradient')?.parentElement
            if (!band) return null
            const bordered = (e: Element) => {
                const s = getComputedStyle(e)
                return parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderLeftWidth) > 0
            }
            const first = (e: Element | null, depth = 0): Element | null => {
                if (!e || depth > 6) return null
                if (bordered(e)) return e
                for (const c of Array.from(e.children)) {
                    const f = first(c, depth + 1)
                    if (f) return f
                }
                return null
            }
            const r = el.getBoundingClientRect()
            const b = band.getBoundingClientRect()
            const box = first(band.nextElementSibling)?.getBoundingClientRect()
            return {
                height: b.height,
                gap: box ? box.top - b.bottom : null,
                left: box ? box.left - r.left : null,
            }
        })
        expect(m, 'header band').not.toBeNull()
        expect(Math.abs(m!.height - HEADER_HEIGHT), 'header band height').toBeLessThanOrEqual(
            TOLERANCE,
        )
        expect(m!.gap, 'first search box exists').not.toBeNull()
        expect(
            Math.abs(m!.gap! - HEADER_TO_FIRST_BOX_GAP),
            'gap header → first search box',
        ).toBeLessThanOrEqual(TOLERANCE)
        expect(
            Math.abs(m!.left! - PANEL_INSET),
            'left inset of first search box',
        ).toBeLessThanOrEqual(TOLERANCE)
    }).toPass({ timeout: 5_000 })
}

export async function expectHeader(root: Locator) {
    const h1 = root.getByRole('heading', { level: 1 }).first()
    await expect(h1).toBeVisible()
    await expect(h1, 'h1 must be text-base').toHaveCSS('font-size', '16px')
    await expect(h1, 'h1 must be tracking-[0.4em]').toHaveCSS('letter-spacing', '6.4px')
    await expect(root.locator('.medical-gradient').first(), 'gradient band').toBeVisible()
}

/** Layout settles for a moment after the list mounts (fonts, footer text), so re-measure until it holds. */
export async function expectInsets(root: Locator, fkeyEdges?: ('left' | 'right')[]) {
    await expect(() => measureInsets(root, fkeyEdges)).toPass({ timeout: 5_000 })
}

async function measureInsets(root: Locator, fkeyEdges?: ('left' | 'right')[]) {
    const rootBox = await boxOf(root)
    const panel = await boxOf(root.getByText(TOTAL_LABEL, { exact: true }).locator('xpath=../..'))
    expect(panel.x - rootBox.x, 'panel left inset').toBeCloseTo(PANEL_INSET, 0)
    expect(
        Math.abs(rootBox.x + rootBox.width - (panel.x + panel.width) - PANEL_INSET),
        'panel right inset',
    ).toBeLessThanOrEqual(TOLERANCE)

    const buttons = fkeyButtons(root)
    const count = await buttons.count()
    expect(count, 'FKeyBar buttons').toBeGreaterThan(0)
    let left = Infinity
    let right = -Infinity
    let top = Infinity
    let bottom = -Infinity
    for (let i = 0; i < count; i++) {
        const b = await buttons.nth(i).boundingBox()
        if (!b) continue
        left = Math.min(left, b.x)
        right = Math.max(right, b.x + b.width)
        top = Math.min(top, b.y)
        bottom = Math.max(bottom, b.y + b.height)
    }
    const leftOk = Math.abs(left - rootBox.x - FKEY_INSET) <= TOLERANCE
    const rightOk = Math.abs(rootBox.x + rootBox.width - right - FKEY_INSET) <= TOLERANCE
    if (fkeyEdges) {
        // Explicit: every listed edge must sit at the inset.
        if (fkeyEdges.includes('left')) expect(leftOk, 'FKeyBar left inset').toBe(true)
        if (fkeyEdges.includes('right')) expect(rightOk, 'FKeyBar right inset').toBe(true)
    } else {
        // Default: the bar's slots vary per screen (F1.. on the left, F9/F10 on the right),
        // so at least one outermost key must touch the 8px inset.
        expect(leftOk || rightOk, 'FKeyBar must sit at the 8px inset on one edge').toBe(true)
    }
    expect(
        Math.abs(rootBox.y + rootBox.height - bottom - FKEY_TO_BOTTOM),
        'gap between FKeyBar and the bottom of the screen',
    ).toBeLessThanOrEqual(TOLERANCE)
    expect(
        Math.abs(top - (panel.y + panel.height) - PANEL_TO_FKEY_GAP),
        'gap between panel and FKeyBar',
    ).toBeLessThanOrEqual(TOLERANCE)
}

export async function expectHint(root: Locator, expected: boolean) {
    await expect(root.getByText(HINT), 'double-click hint').toHaveCount(expected ? 1 : 0)
}

export async function expectFooter(
    page: Page,
    root: Locator,
    unit: '件' | '人',
    allowIdle: boolean,
) {
    const label = root.getByText(TOTAL_LABEL, { exact: true })
    await expect(label).toBeVisible()
    const footer = label.locator('xpath=..')
    const countPattern = new RegExp(
        `^(?:[\\d,]+\\s?${unit}(?:（登録：[\\d,]+${unit}）)?${allowIdle ? '|－' : ''})$`,
    )
    await expect(footer.getByText(countPattern).first(), 'footer count').toBeVisible()
    await expect(page.getByText('該当件数'), '該当件数 must be gone').toHaveCount(0)
}

export async function expectSelectionStatus(
    page: Page,
    root: Locator,
    def: Pick<ListChromeDef, 'prompt' | 'pickRow' | 'beforePick' | 'codeInRow' | 'statusPattern'>,
) {
    const footer = root.getByText(TOTAL_LABEL, { exact: true }).locator('xpath=../..')
    const status = footer.getByText(def.statusPattern ?? /^選択中: .+/)
    if (def.prompt === null) {
        await expect(status, 'no 選択中 before picking').toHaveCount(0)
    } else if (def.prompt !== 'auto-selected') {
        await expect(footer.getByText(def.prompt), 'prompt before picking').toBeVisible()
    }
    await def.beforePick?.(page, root)
    const rows = root.locator('[data-testid^="row-"]')
    const row = def.pickRow
        ? def.pickRow(page, root)
        : def.prompt === 'auto-selected'
          ? rows.nth(1)
          : rows.first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.click()
    await expect(status, '選択中 after picking').toBeVisible()
    if (def.statusPattern) return
    const picked = (await status.innerText()).replace(/^選択中:\s*/, '').trim()
    const code = picked.split(/\s+/)[0]!
    if (def.codeInRow === 'inherit') {
        // The code sits on the nearest row above that prints it (blanked when equal to the row above).
        const rows = root.locator('[data-testid^="row-"]')
        const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
        const texts = await rows.allInnerTexts()
        const at = ids.indexOf(await row.getAttribute('data-testid'))
        expect(at, 'picked row is rendered').toBeGreaterThanOrEqual(0)
        const seen = texts.slice(0, at + 1).map((t) => t.replace(/\n/g, '-'))
        expect(
            seen.some((t) => t.includes(code)),
            `選択中 code ${code} must appear on the picked row or a row above it`,
        ).toBe(true)
        return
    }
    expect(await row.innerText(), '選択中 must start with the picked row code').toContain(code)
}

/**
 * goto + wait for the list footer. The Vite dev server sometimes drops a module and the page
 * stays blank (see entry.ts), so reload up to 3 times; each attempt is still an auto-waiting expect.
 */
export async function gotoListScreen(page: Page, path: string) {
    for (let attempt = 1; ; attempt++) {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        try {
            await expect(page.getByText(TOTAL_LABEL, { exact: true })).toBeVisible({
                timeout: 30_000,
            })
            return
        } catch (error) {
            if (attempt === 3) throw error
        }
    }
}

export type ListChromeSuite = {
    /** Runs once before the first screen (install handlers, seed data). */
    setup?: (page: Page) => Promise<void>
    /** Runs once after the last screen (dispose handlers, drop seed data). */
    teardown?: (page: Page) => Promise<void>
}

export function describeListChrome(defs: ListChromeDef[], suite: ListChromeSuite = {}) {
    if (suite.setup || suite.teardown) {
        test.describe('Rule 24 suite', () => {
            test.beforeAll(async ({ authedPage }) => {
                await suite.setup?.(authedPage)
            })
            test.afterAll(async ({ authedPage }) => {
                await suite.teardown?.(authedPage)
            })
            registerScreens(defs)
        })
        return
    }
    registerScreens(defs)
}

function registerScreens(defs: ListChromeDef[]) {
    test.describe.configure({ mode: 'serial', timeout: 300_000 })
    for (const def of defs) {
        test.describe(`Rule 24 — ${def.name}`, () => {
            let page: Page
            const root = () => (def.root ?? defaultRoot)(page)

            test.beforeAll(async ({ authedPage }) => {
                page = authedPage
                await def.open(page)
            })
            test.afterAll(async () => {
                await releaseSharedPage(page)
            })

            test('24.1 header is the standard gradient band, text-base', async () => {
                await expectHeader(root())
                await expectHeaderSpacing(root())
            })
            test('24.2 panel / FKeyBar insets match /patients', async () => {
                await expectInsets(root(), def.fkeyEdges)
            })
            test(`24.3 hint ${HINT} ${def.hint === false ? 'absent' : 'present once'}`, async () => {
                await expectHint(root(), def.hint !== false)
            })
            test('24.4 footer 合　計 with count, no 該当件数', async () => {
                await expectFooter(page, root(), def.unit ?? '件', def.allowIdleCount ?? false)
            })
            if (!def.skipStatus) {
                test('24.5 選択中 status follows the picked row', async () => {
                    await expectSelectionStatus(page, root(), def)
                })
            }
        })
    }
}
