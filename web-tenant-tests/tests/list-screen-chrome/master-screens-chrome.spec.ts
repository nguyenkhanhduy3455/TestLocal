/**
 * Rule 24 — master list screens (web-tenant). FACT: the standard is /patients
 * (PROJECT_GUIDELINE_ver18.md §3.35); these screens open with row 0 already
 * selected, so 24.5 picks the second row.
 */
import { expect, type Page } from '@playwright/test'

import { openPatientRegistration } from '../_shared/entry'
import { CHROME_PAT_NO_BASE, cleanListChromeData, seedListChromeData } from '../_shared/list-chrome-seed'
import {
    describeListChrome,
    gotoListScreen,
    type ListChromeDef,
} from '../_shared/list-screen-chrome'

const CHROME_PAT_NO = CHROME_PAT_NO_BASE + 1

const openRoute = (path: string) => async (page: Page) => {
    await gotoListScreen(page, path)
    await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible({
        timeout: 60_000,
    })
}

const master = (name: string, path: string): ListChromeDef => ({
    name,
    open: openRoute(path),
    prompt: 'auto-selected',
})

describeListChrome(
    [
        master('傷病名マスタ /masters/dis', '/masters/dis'),
        master('薬剤マスタ /masters/drugs', '/masters/drugs'),
        master('物品マスタ /masters/goods', '/masters/goods'),
        master('指導マスタ /masters/guide', '/masters/guide'),
        master('コメントマスタ /masters/cmt', '/masters/cmt'),
        master('摘要コメントマスタ /masters/cmt2', '/masters/cmt2'),
        {
            ...master('パックマスタ /masters/pack', '/masters/pack'),
            // FACT: IsTheSameCellValue blanks the 区分/枝番 cells of a row that repeats the one above,
            // so only a row that starts a new pack shows its own code.
            codeInRow: 'inherit',
        },
        master('装着料マスタ /masters/set', '/masters/set'),
        master('処置マスタ /masters/trt', '/masters/trt'),
        master('ユーザマスタ /settings/user-master', '/settings/user-master'),
        {
            ...master('コード設定 /masters/code', '/masters/code'),
            // FACT (mst-code-settings-screen.tsx): opens on the first group, locked by default ⇒ no
            // ダブルクリックで選択 hint; the footer reads 「選択中: <cdType>-<cdVal> <名称1>」, so the row
            // (which prints only cdVal) never carries the status code verbatim.
            hint: false,
            statusPattern: /^選択中: \d+-\d+/,
        },
        master('ロールマスタ /settings/role-master', '/settings/role-master'),
        {
            ...master('郵便番号 /masters/postal', '/masters/postal'),
            prompt: 'auto-selected',
        },
        {
            // FACT: no route of its own since 96e592cdc (2026-10-28) — 保険者選択 is a sub-screen of
            // 患者登録, opened by F3 「保険者」 (patient-side-panel.tsx F3, patient-detail-form.tsx
            // `subScreen === 'benefit-provider'`). Opened on the patient this file seeds.
            // No .animate-fade-in wrapper; the screen root is the h-full column holding the h1.
            ...master('給付先選択 (患者登録 F3)', ''),
            open: async (page) => {
                await openPatientRegistration(page, String(CHROME_PAT_NO))
                await page.locator('[data-fkey="F3"]:visible', { hasText: '保険者' }).first().click()
                await expect(page.getByRole('heading', { name: '保 険 者 選 択' })).toBeVisible({
                    timeout: 30_000,
                })
                await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible({
                    timeout: 60_000,
                })
            },
            root: (page) =>
                page
                    .locator('div.flex.flex-col.h-full')
                    .filter({ has: page.getByRole('heading', { name: '保 険 者 選 択' }) })
                    .last(),
        },
        {
            // FACT: the list only mounts once 検索 has run (`applied` gate); no row is selected until
            // one is clicked. The single row is seeded (list-chrome-seed.ts).
            ...master('地方公費 /settings/local-pubexp', '/settings/local-pubexp'),
            prompt: 'auto-selected',
            // Only the seeded row exists, so pick row 0 (already selected) again.
            pickRow: (_page, root) => root.locator('[data-testid^="row-"]').first(),
            open: async (page) => {
                await page.goto('/settings/local-pubexp', {
                    waitUntil: 'domcontentloaded',
                })
                await page.getByRole('button', { name: '検索', exact: true }).click()
                await expect(page.locator('[data-testid^="row-"]').first()).toBeVisible({
                    timeout: 60_000,
                })
            },
        },
    ],
    {
        setup: () => seedListChromeData(CHROME_PAT_NO),
        teardown: () => cleanListChromeData(CHROME_PAT_NO),
    },
)
