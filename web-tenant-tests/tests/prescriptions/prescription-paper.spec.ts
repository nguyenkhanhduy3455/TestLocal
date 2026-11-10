/**
 * 処方箋 (paper, frm503002) — Shift+F5 from 診療入力, 用法登録 (frm503004) and
 * 処方箋パック登録 (frm503003).
 *
 * Runs on the paper screen, i.e. `inp.rxScreenUse` absent / false (the default).
 *
 * Data: one self-built patient (990000+) with a 再診 row (so AutoSantei stays quiet)
 * and two drug rows (trt_cd 600/601, trt_pt 0) on the test day. The 用法 / パック
 * tests write real `mst_med` / `syo_pac` rows, so they pick a code / pack number that
 * is FREE at the start and delete only what they created.
 *
 * Not covered here: F5 印刷. It goes through the print agent (`/v1/print` opens a
 * Windows dialog that hangs Playwright); the datasource is covered by the BE unit
 * tests.
 */
import { type Page } from '@playwright/test'

import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { ryoCells, openTreatmentEntry } from '../_shared/entry'
import { TODAY_ISO } from '../_shared/env'
import { clickDialog, topDialog } from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

const PAT_NO = SEED_PAT_NO_BASE + 210
const TRT_DT = TODAY_ISO
const DRUG_A = { trtCd: 600, trtSb: 0, name: 'E2E薬剤甲' }
const DRUG_B = { trtCd: 601, trtSb: 0, name: 'E2E薬剤乙' }
/** A code that is certainly not in the 処置マスタ at sub-code 99 (E00024 case). */
const MISSING = { cd: '698', sb: '99' }

const fkey = (page: Page, key: string) => page.locator(`[data-fkey="${key}"]`)

/** Alert text only; a click on OK closes it. */
async function expectAlert(page: Page, text: string) {
    await expect(topDialog(page)).toContainText(text)
    await clickDialog(page, 'accept')
    await expect(topDialog(page)).toBeHidden()
}

test.describe('処方箋 (paper)', () => {
    let page: Page
    /** 用法登録 target: a master drug that has no 用法 yet. */
    let medCd = 0
    let packNo = 0

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        await seedTestPatient({ patNo: PAT_NO })
        await withDb((c) =>
            c.query(
                `UPDATE person
                    SET att_dr = (SELECT att_dr FROM person WHERE att_dr > 0
                                  GROUP BY att_dr ORDER BY count(*) DESC LIMIT 1)
                  WHERE pat_no = $1`,
                [PAT_NO],
            ),
        )
        await seedTreatmentRows(PAT_NO, TRT_DT, [
            { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' },
            { trtCd: DRUG_A.trtCd, trtSb: DRUG_A.trtSb, trtPt: 0, dspTrt: DRUG_A.name },
            { trtCd: DRUG_B.trtCd, trtSb: DRUG_B.trtSb, trtPt: 0, dspTrt: DRUG_B.name },
        ])

        // Free 用法 target: an active drug (not "!"-suffixed) without a mst_med row.
        medCd = await withDb(async (c) => {
            const r = await c.query<{ trt_cd: number }>(
                `SELECT t.trt_cd FROM mst_trt t
                  WHERE t.version_id = (SELECT version_id FROM mst_trt_ver
                                         WHERE table_name LIKE 'MST_TRT%'
                                           AND start_date <= now() AND end_date >= now()
                                         ORDER BY start_date DESC LIMIT 1)
                    AND t.trt_cd BETWEEN 600 AND 699 AND t.trt_sb = 0 AND t.active_flg = 1
                    AND right(t.trt_nm, 1) <> '!'
                    AND NOT EXISTS (SELECT 1 FROM mst_med m WHERE m.trt_cd = t.trt_cd AND m.trt_sb = 0)
                  ORDER BY t.trt_cd DESC LIMIT 1`,
            )
            return r.rows[0]?.trt_cd ?? 0
        })
        packNo = await withDb(async (c) => {
            const r = await c.query<{ n: number }>(
                'SELECT greatest(coalesce(max(pac_no), 0) + 1, 900) AS n FROM syo_pac',
            )
            return Number(r.rows[0]?.n ?? 900)
        })
    })

    test.afterAll(async () => {
        await withDb(async (c) => {
            if (medCd > 0) {
                await c.query('DELETE FROM mst_med WHERE trt_cd = $1 AND trt_sb = 0 AND usage_nm LIKE $2', [
                    medCd,
                    'E2E%',
                ])
                await c.query('DELETE FROM mst_med_deleted WHERE trt_cd = $1 AND trt_sb = 0 AND usage_nm LIKE $2', [
                    medCd,
                    'E2E%',
                ])
            }
            await c.query('DELETE FROM syo_pac WHERE pac_no = $1', [packNo])
            await c.query('DELETE FROM syo_pac_deleted WHERE pac_no = $1', [packNo])
        }).catch(() => {})
        await dropTestPatient(PAT_NO).catch(() => {})
        await releaseSharedPage(page)
    })

    test('Shift+F5 trên 診療入力 mở 処方箋 với thuốc của đúng ngày đó', async () => {
        await openTreatmentEntry(page, String(PAT_NO), TRT_DT)

        // The cursor must sit on a row that carries a day.
        await ryoCells(page).first().click()
        await page.keyboard.press('Shift+F5')

        await expect(page).toHaveURL(new RegExp(`/prescriptions/${PAT_NO}\\?trtDt=${TRT_DT}`))
        const a = page.getByText(DRUG_A.name, { exact: false }).first()
        const b = page.getByText(DRUG_B.name, { exact: false }).first()
        await expect(a).toBeVisible()
        await expect(b).toBeVisible()
        // disp_no order is kept, and the 再診 row is not a drug.
        const [boxA, boxB] = [await a.boundingBox(), await b.boundingBox()]
        expect(boxA!.y).toBeLessThan(boxB!.y)
        await expect(page.getByText('歯科再診料')).toHaveCount(0)
    })

    test('mở 処方箋 không kèm trtDt thì lưới thuốc đã chọn để trống', async () => {
        await page.goto(`/prescriptions/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
        await expect(fkey(page, 'F6')).toBeVisible({ timeout: 60_000 })
        await expect(page.getByText(DRUG_A.name)).toHaveCount(0)
    })

    test.describe('用法登録 (F9)', () => {
        const dialog = () =>
            page.getByRole('dialog').filter({ has: page.getByLabel('枝番', { exact: true }) })

        test.beforeAll(async () => {
            test.skip(medCd === 0, 'Không có thuốc 600-699 nào chưa có 用法 để dùng làm đích')
        })

        test('mở dialog; mã ngoài 600-699 → E00055, mã không có trong master → E00024', async () => {
            await page.goto(`/prescriptions/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            await expect(fkey(page, 'F9')).toBeVisible({ timeout: 60_000 })
            await fkey(page, 'F9').click()
            await expect(dialog()).toBeVisible()

            await dialog().getByLabel('コード', { exact: true }).fill('700')
            await page.keyboard.press('Tab') // → sb gets "0"
            await page.keyboard.press('Tab') // leave sb → validate
            await expectAlert(page, '600～699')

            await dialog().getByLabel('コード', { exact: true }).fill(MISSING.cd)
            await page.keyboard.press('Tab')
            await dialog().getByLabel('枝番', { exact: true }).fill(MISSING.sb)
            await page.keyboard.press('Tab')
            await expectAlert(page, '処置マスタに入力されたコードがありません。')
        })

        test('thiếu コード / 用法 → E00001; đủ thì ghi mst_med rồi xoá form', async () => {
            const cd = dialog().getByLabel('コード', { exact: true })
            await cd.fill('')
            await dialog().locator('[data-fkey="F9"]').click()
            await expectAlert(page, 'コードが入力されていません。')

            await cd.fill(String(medCd))
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            // Name comes from the master and focus moves to 用法.
            await expect(dialog().getByLabel('名称', { exact: true })).not.toHaveValue('')
            await dialog().locator('[data-fkey="F9"]').click()
            await expectAlert(page, '用法が入力されていません。')

            await dialog().getByLabel('用法', { exact: true }).fill('E2E 用法 初回')
            await dialog().locator('[data-fkey="F9"]').click()
            await expect(cd).toHaveValue('')
            const rows = await withDb((c) =>
                c.query('SELECT usage_nm FROM mst_med WHERE trt_cd = $1 AND trt_sb = 0', [medCd]),
            )
            expect(rows.rows.map((r) => r.usage_nm)).toEqual(['E2E 用法 初回'])
        })

        test('ghi lại cùng mã thì cập nhật (không nhân đôi); F8 xoá sau khi xác nhận', async () => {
            const cd = dialog().getByLabel('コード', { exact: true })
            await cd.fill(String(medCd))
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            await dialog().getByLabel('用法', { exact: true }).fill('E2E 用法 更新')
            await dialog().locator('[data-fkey="F9"]').click()
            await expect(cd).toHaveValue('')
            const rows = await withDb((c) =>
                c.query('SELECT usage_nm FROM mst_med WHERE trt_cd = $1 AND trt_sb = 0', [medCd]),
            )
            expect(rows.rows.map((r) => r.usage_nm)).toEqual(['E2E 用法 更新'])

            // Delete: nothing selected → E00021; then load the row and delete it.
            await dialog().locator('[data-fkey="F8"]').click()
            await expectAlert(page, '削除データが選択されていません。')
            await cd.fill(String(medCd))
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            await dialog().locator('[data-fkey="F8"]').click()
            await expect(topDialog(page)).toContainText('削除してよろしいですか？')
            await clickDialog(page, 'accept')
            await expect
                .poll(async () =>
                    (await withDb((c) => c.query('SELECT 1 FROM mst_med WHERE trt_cd = $1 AND trt_sb = 0', [medCd])))
                        .rowCount,
                )
                .toBe(0)
            await dialog().locator('[data-fkey="F10"]').click()
            await expect(dialog()).toBeHidden()
        })
    })

    test.describe('処方箋パック登録 (F6)', () => {
        const dialog = () =>
            page.getByRole('dialog').filter({ has: page.getByLabel('パック名', { exact: true }) })

        test('検証: パック№ / パック名 / 明細 / 範囲外コード', async () => {
            await page.goto(`/prescriptions/${PAT_NO}`, { waitUntil: 'domcontentloaded' })
            await expect(fkey(page, 'F6')).toBeVisible({ timeout: 60_000 })
            await fkey(page, 'F6').click()
            await expect(dialog()).toBeVisible()

            await dialog().locator('[data-fkey="F9"]').click()
            await expectAlert(page, 'パック№が入力されていません。')

            await dialog().getByLabel('パック№', { exact: true }).fill(String(packNo))
            await dialog().locator('[data-fkey="F9"]').click()
            await expectAlert(page, 'パック名が入力されていません。')

            await dialog().getByLabel('パック名', { exact: true }).fill('E2Eパック')
            await dialog().locator('[data-fkey="F9"]').click()
            await expectAlert(page, '明細が入力されていません。')

            await dialog().getByLabel('コード1', { exact: true }).fill('700')
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            await expectAlert(page, '600～699')
        })

        test('登録 → syo_pac に 1 行; 同じ番号で開き直すと内容が読み込まれ、F8 で削除', async () => {
            const code1 = dialog().getByLabel('コード1', { exact: true })
            await code1.fill(String(DRUG_A.trtCd))
            await page.keyboard.press('Tab')
            await page.keyboard.press('Tab')
            await expect(dialog().getByLabel('薬剤名1', { exact: true })).not.toHaveValue('')

            await dialog().locator('[data-fkey="F9"]').click()
            await expect(topDialog(page)).toContainText('更新してよろしいですか？')
            await clickDialog(page, 'accept')
            await expect(topDialog(page)).toContainText('登録が完了しました。')
            await clickDialog(page, 'accept')
            await expect(dialog()).toBeHidden()

            const saved = await withDb((c) =>
                c.query('SELECT pac_nm, med_no_1, med_sb_1 FROM syo_pac WHERE pac_no = $1', [packNo]),
            )
            expect(saved.rows).toEqual([{ pac_nm: 'E2Eパック', med_no_1: DRUG_A.trtCd, med_sb_1: 0 }])

            // Re-open: the pack is loaded on leaving パック№, so a second save is an update (I00002).
            await fkey(page, 'F6').click()
            await dialog().getByLabel('パック№', { exact: true }).fill(String(packNo))
            await page.keyboard.press('Tab')
            await expect(dialog().getByLabel('パック名', { exact: true })).toHaveValue('E2Eパック')
            await expect(dialog().getByLabel('コード1', { exact: true })).toHaveValue(String(DRUG_A.trtCd))

            await dialog().locator('[data-fkey="F8"]').click()
            await expect(topDialog(page)).toContainText('削除してよろしいですか？')
            await clickDialog(page, 'accept')
            await expect(dialog()).toBeHidden()
            const gone = await withDb((c) => c.query('SELECT 1 FROM syo_pac WHERE pac_no = $1', [packNo]))
            expect(gone.rowCount).toBe(0)
        })
    })
})
