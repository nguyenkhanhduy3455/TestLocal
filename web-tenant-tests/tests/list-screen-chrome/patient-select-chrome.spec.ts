/**
 * Rule 24 — patient selection screens (PatientSearchList users). FACT: the
 * standard is /patients; every screen opens idle (search not run yet), so the
 * footer count is the placeholder 「－」 and 24.5 presses 検索 first.
 * 診療入力 (/treatments) deliberately has NO prompt text (only 選択中 once picked).
 */
import { expect, type Page } from '@playwright/test'

import { CHROME_PAT_NO, cleanListChromeData, seedListChromeData } from '../_shared/list-chrome-seed'
import {
    describeListChrome,
    gotoListScreen,
    type ListChromeDef,
} from '../_shared/list-screen-chrome'

const seededRow: ListChromeDef['pickRow'] = (_page, root) =>
    root
        .locator('[data-testid^="row-"]')
        .filter({ hasText: String(CHROME_PAT_NO) })
        .first()

const tickedRow: ListChromeDef['pickRow'] = (_page, root) =>
    root
        .locator('[data-testid^="row-"]')
        .filter({ hasText: String(CHROME_PAT_NO) })
        .first()
        .getByRole('checkbox')

const PROMPT = '患者を選択してください'

const open = (path: string) => (page: Page) => gotoListScreen(page, path)

const search: ListChromeDef['beforePick'] = async (page) => {
    await page.getByRole('button', { name: '検索', exact: true }).first().click()
}

const patientList = (
    name: string,
    path: string,
    extra: Partial<ListChromeDef> = {},
): ListChromeDef => ({
    name,
    open: open(path),
    prompt: PROMPT,
    unit: '人',
    allowIdleCount: true,
    beforePick: search,
    ...extra,
})

describeListChrome(
    [
        patientList('患者登録 /patients', '/patients'),
        patientList('口腔内情報 /oral-examinations', '/oral-examinations', {}),
        // FACT: opens on the live 未精算患者一覧 (auto-refresh status); the row is seeded.
        {
            name: '窓口精算 未精算患者一覧 /counter-payments',
            open: open('/counter-payments'),
            prompt: null,
            unit: '人',
            pickRow: tickedRow,
            statusPattern: /^1件選択中/,
        },
        patientList('窓口精算 患者検索 (F1) /counter-payments', '/counter-payments', {
            open: async (page) => {
                await gotoListScreen(page, '/counter-payments')
                await page.getByRole('button', { name: /F1\s*患者検索/ }).click()
                await expect(
                    page.getByRole('button', { name: '検索', exact: true }).first(),
                ).toBeEnabled()
            },
        }),
        // FACT: opens on the live カルテ待ち患者一覧 (checkbox list, auto-refresh status); the row is seeded.
        {
            name: 'カルテ印刷 待ち一覧 /medical-records/print-patient-select',
            open: open('/medical-records/print-patient-select'),
            prompt: null,
            unit: '人',
            // The real list is thousands of rows long (virtualised), so tick the first rendered one.
            pickRow: (_page, root) =>
                root.locator('[data-testid^="row-"]').first().getByRole('checkbox'),
            statusPattern: /^1件選択中/,
        },
        patientList(
            'カルテ印刷 患者検索 (F1) /medical-records/print-patient-select',
            '/medical-records/print-patient-select',
            {
                open: async (page) => {
                    await gotoListScreen(page, '/medical-records/print-patient-select')
                    await page.getByRole('button', { name: /F1\s*患者検索/ }).click()
                    await expect(
                        page.getByRole('button', { name: '検索', exact: true }).first(),
                    ).toBeEnabled()
                },
            },
        ),
        // FACT: opens on the 受付患者一覧 (the seeded 受付 row); 検索 stays disabled until F1 患者検索.
        {
            name: '診療入力 受付患者一覧 /treatments',
            open: open('/treatments'),
            prompt: null,
            unit: '人',
            pickRow: seededRow,
        },
        patientList('診療入力 患者検索 (F1) /treatments', '/treatments', {
            prompt: null,
            open: async (page) => {
                await gotoListScreen(page, '/treatments')
                await page.getByRole('button', { name: /F1\s*患者検索/ }).click()
                await expect(
                    page.getByRole('button', { name: '検索', exact: true }).first(),
                ).toBeEnabled()
            },
        }),
    ],
    {
        setup: seedListChromeData,
        teardown: cleanListChromeData,
    },
)
