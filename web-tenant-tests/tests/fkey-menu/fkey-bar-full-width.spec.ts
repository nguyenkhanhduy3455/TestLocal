/**
 * F-key bar có nút ON/OFF (lưới 12 ô cố định) — các nút phải GIÃN lấp kín ô của mình.
 *
 * Lỗi cũ: `.fkey-btn` bị chặn `max-width: 120px`, nút dừng ở 120px và các ô TRỐNG
 * (vd F1/F8/F11 của 診療入力) hút hết phần dư → khoảng hở ~200px giữa các nhóm nút.
 * Sửa ở `fkey-bar.tsx`: nhánh lưới gắn `max-w-none` cho nút.
 *
 * Viewport 1920 — ở 1600 (mặc định) ô chỉ ~104px, chưa chạm trần 120px nên không
 * tái hiện được lỗi.
 *
 * Cách đo (không phụ thuộc màn nào có phím nào): mọi nút cùng một độ rộng `w`, và
 * hai nút liên tiếp cách nhau đúng `(số ô trống giữa chúng) × (w + gap) + gap`.
 */
import { type Locator, type Page } from '@playwright/test'

import { captureFixedUi } from '../_shared/capture'
import { SEED_PAT_NO_BASE, dbEnabled, seedTestPatient, seedTreatmentRows, withDb } from '../_shared/db'
import { openPatientRegistration, openTreatmentEntry } from '../_shared/entry'
import { TODAY_ISO } from '../_shared/env'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { dropTestPatient } from '../_shared/test-patient'

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed bệnh nhân test')
test.describe.configure({ mode: 'serial' })

const PAT_NO = SEED_PAT_NO_BASE + 460
/** `gap-1` của FKeyBar. */
const GAP = 4
const TOLERANCE = 3

let page: Page

test.beforeAll(async ({ authedPage }) => {
    page = authedPage
    await seedTestPatient({ patNo: PAT_NO })
    // 患者選択 báo 「ドクターを特定出来ません」 nếu person không có 担当医.
    await withDb((c) =>
        c.query(
            `UPDATE person
                SET att_dr = (SELECT att_dr FROM person WHERE att_dr > 0
                              GROUP BY att_dr ORDER BY count(*) DESC LIMIT 1)
              WHERE pat_no = $1`,
            [PAT_NO],
        ),
    )
    // Có sẵn một dòng 処置 để FE bỏ qua AutoSantei.
    await seedTreatmentRows(PAT_NO, TODAY_ISO, [
        { trtCd: 110, trtSb: 0, trtPt: 59, trtCnt: 1, dspTrt: '歯科再診料' },
    ])
    await page.setViewportSize({ width: 1920, height: 1080 })
})

test.afterAll(async () => {
    await page?.setViewportSize({ width: 1600, height: 900 }).catch(() => {})
    await releaseSharedPage(page)
    await dropTestPatient(PAT_NO).catch(() => {})
})

/** Thanh F-key chứa nút ON/OFF. */
const shiftBar = (p: Page): Locator =>
    p.locator('button[aria-pressed]').filter({ hasText: /^(ON|OFF)$/ }).first().locator('..')

async function expectKeysFillSlots(bar: Locator): Promise<void> {
    const keys = bar.locator(':scope > button[data-fkey]')
    await expect(keys.first()).toBeVisible()
    const boxes = await keys.evaluateAll((els) =>
        els.map((el) => {
            const r = el.getBoundingClientRect()
            return { n: Number(el.getAttribute('data-fkey')!.slice(1)), left: r.left, right: r.right, w: r.width }
        }),
    )
    const w = boxes[0].w
    expect(w, 'nút phải giãn quá trần 120px cũ ở viewport 1920').toBeGreaterThan(120)
    for (const b of boxes) {
        expect(Math.abs(b.w - w), `F${b.n} lệch độ rộng so với F${boxes[0].n}`).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1]
        const cur = boxes[i]
        const expected = (cur.n - prev.n - 1) * (w + GAP) + GAP
        expect(
            Math.abs(cur.left - prev.right - expected),
            `khoảng cách F${prev.n}→F${cur.n} = ${Math.round(cur.left - prev.right)}px, mong đợi ${Math.round(expected)}px`,
        ).toBeLessThanOrEqual(TOLERANCE)
    }
}

test('診療入力 — nút F-key lấp kín lưới 12 ô', async () => {
    await openTreatmentEntry(page, String(PAT_NO), TODAY_ISO)
    const bar = shiftBar(page)
    await expectKeysFillSlots(bar)
    await captureFixedUi(page, 'fkey-bar-full-width-treatment-entry')
})

test('患者登録 — nút F-key lấp kín lưới 12 ô', async () => {
    await openPatientRegistration(page, String(PAT_NO))
    const bar = shiftBar(page)
    await expectKeysFillSlots(bar)
    await captureFixedUi(page, 'fkey-bar-full-width-patient-registration')
})
