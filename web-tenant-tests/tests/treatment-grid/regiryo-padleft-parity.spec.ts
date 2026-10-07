import { type Page } from '@playwright/test'

import { openTreatmentEntry, ryoCells } from '../_shared/entry'
import { TODAY_ISO, patNo, trtDt } from '../_shared/env'
import { closeDialogs, installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * 診療入力 — left indent of the 療法・処置 column (`grdRegi` col 2 /
 * `CommonInp.REGIRYO_PADLEFT`) on `/treatments/{patNo}`.
 *
 * WHAT THIS PINS
 * ──────────────
 * WinForm indents EVERY row of col 2 by REGIRYO_PADLEFT (two half-width spaces),
 * written into the CELL TEXT on the way in and stripped again before `dsp_trt` is
 * saved. The web port only ever added those two spaces to COMMENT rows, so a
 * カルテコメント / 摘要コメント sat two columns to the RIGHT of the 処置 rows it
 * belongs to. Reported symptom: after a ガイド pick the CMTAUTO rows
 * 「OA（ｺｰﾊﾟﾛﾝ）浸麻（歯科用ｵｰﾗ注Ct1.8ml）」 hanging off 抜歯手術(前歯)/(臼歯) were
 * indented while the ガイド's own identical comment row and all 処置 rows were flush.
 *
 * The indent now lives in CSS (`padding-left`) instead of in the string, so this
 * spec measures the CELL, not the text: every row must render its 療法・処置 text at
 * the same left offset, and no row may carry leading spaces in `textContent`.
 *
 * ─── Source FACTs the asserts bind to (read 2026-09-21) ───────────────────────
 *  - WinForm: `CommonInp.REGIRYO_PADLEFT` = "  " (2 half-width), applied at
 *    frm203016.cs:1423/1507, modSave.cs:2641/4972, modHfg2.cs:517,
 *    InpDBAccess.cs:33; stripped before save at modSave.cs:256-270.
 *  - WinForm exceptions — the only three rows that do NOT get REGIRYO_PADLEFT:
 *      · 部位病名行: `hFG1[2] = dsp_dis` raw, flush left (modSave.cs:2583/4938,
 *        modHfg2.cs:484). This is the ONE row the operator sees at column 0.
 *      · 【介護保険一部負担金】: five half-width spaces baked into the literal
 *        (frm203002.cs:6003/6014, modSave.cs:2507) — text, not padding.
 *      · IS 笑気・酸素 (trt_cd 50 / 750): three spaces in the literal
 *        (frm203016.cs:842/868/895).
 *  - Web port: `lib/treatment-entry-shared.ts`
 *      · `REGIRYO_INDENT = '2ch'`, `REGIRYO_INDENT_IS_GAS = '3ch'`,
 *        `IS_OXYGEN_TRT_CD = 50`, `IS_GAS_NOTE_TRT_CD = 750`;
 *      · `ryoCellStyle(item)` → `{ paddingLeft?, whiteSpace? }`: no paddingLeft for
 *        `isBuiLine` and for the 【介護保険一部負担金】 total row, `3ch` for the two
 *        gas codes, `2ch` for everything else; `pre-wrap` on comment rows and on the
 *        total row so their baked-in spaces survive;
 *      · `BUI_LINE_DASH = '－'` (U+FF0D) — `historyMetricValue` writes it into 点/回
 *        of a 部位病名行 and ONLY there (the 介護 total row gets '' instead), which is
 *        what lets this spec recognise a 部位病名行 straight from the DOM;
 *      · `historyRowClasses` paints a カルテコメント `text-blue-600` and a 摘要コメント
 *        `text-[#ff00ff]` — the DOM signal used here to find comment rows.
 *  - Render sites carrying `style={ryoCellStyle(item)}`: both blocks of
 *    `components/registration-table.tsx` (current month + history months) and
 *    `components/history-panel.tsx`. The 履歴 panel is OUT OF SCOPE here: it has no
 *    `data-grid-cell` attribute (history-panel.tsx:11) so it cannot be addressed.
 *  - `RegiCol` (treatment-entry-shared.ts:174, WinForm frm203002.cs:158-169):
 *    0:日 1:部位 2:療法・処置 3:点 4:回 → cells are `data-grid-cell="<rowKey>|<col>"`.
 *
 * ─── How the measurement works ────────────────────────────────────────────────
 * `2ch` is the advance of "0" in the cell's own font (`--font-base`, MS Gothic on
 * the clinic PCs), i.e. exactly one half-width column — so the expected pixel value
 * is measured IN THE PAGE with a hidden `width: Nch` probe injected into the very
 * cell being asserted. No hard-coded pixel count, nothing to re-tune when the font
 * changes. The user-visible quantity is `rect.left + padding-left` ("where the text
 * starts"), and that is what the equality asserts compare.
 *
 * ─── TRAPS (do not remove) ────────────────────────────────────────────────────
 *  1. THE GRID RENDERS THE WHOLE MONTH. Rows from earlier days are on screen too,
 *     so TC-3/TC-4 snapshot the rowKeys BEFORE entering a 処置 and assert only on
 *     keys that appeared afterwards.
 *  2. A cell in EDIT MODE drops the inline style on purpose (registration-table.tsx
 *     passes `undefined` while `editingCell` matches) — never measure a cell whose
 *     row is being edited.
 *  3. `santeiAnswer: 'cancel'`, not the default 'no': 「いいえ」 applies the 再診 pick
 *     and adds rows of its own, which would pollute the "new rowKeys" set
 *     (see _shared/overlays.ts).
 *  4. Comment rows are recognised by COLOUR CLASS, not by text — the wording comes
 *     from master and differs per tenant.
 *
 * ─── Running (GUIDELINE Rule 19) ──────────────────────────────────────────────
 * `describe.serial` + ONE shared `authedPage`: the whole file logs in once. The
 * testcases CHAIN STATE (TC-3 dirties the grid, TC-4 reads what TC-3 produced), so
 * ALWAYS run the whole file — never `-g` a single testcase.
 *
 *   npx playwright test tests/treatment-grid/regiryo-padleft-parity.spec.ts
 *
 * Nothing here presses F9 登録, so the DB stays untouched.
 */

const PAT_NO = patNo('12138')
/** Today = the current month, the only month whose rows can still be typed into. */
const TRT_DT = trtDt(TODAY_ISO)

/**
 * 処置コード typed into the 点 cell (コードモード) to grow a 処置 row PLUS its
 * 摘要コメント tail in one go.
 *
 * 599-0 歯科医師居宅療養管理指導Ⅰ is the cheapest such code on the dev master: it
 * drags in the `mst_cmt_pack` pair 「居宅療養管理指導費」 / 「居宅療養管理指導費算定年月日
 * <和暦>」 straight onto the grid, with no extra selection dialog to confirm
 * (proven by treatment-grid/kaigo-hutan-row.spec.ts TC-9/TC-10). Another tenant's
 * master may need a different code — hence the env overrides.
 */
const TRT_CD = process.env.TEST_TRT_CD ?? '599'
/** 枝番 to pick in 処置選択 for {@link TRT_CD}. */
const TRT_SB = process.env.TEST_TRT_SB ?? '0'

/** WinForm REGIRYO_PADLEFT = 2 half-width columns (REGIRYO_INDENT = '2ch'). */
const PAD_COLS = 2
/** IS 笑気・酸素 rows indent by 3 (REGIRYO_INDENT_IS_GAS = '3ch'). */
const PAD_COLS_IS_GAS = 3
/** Sub-pixel tolerance for every pixel comparison. */
const PX_TOLERANCE = 1

/** `BUI_LINE_DASH` — 全角ハイフン U+FF0D in 点/回 of a 部位病名行. */
const BUI_LINE_DASH = '－'
/** Label of the 【介護保険一部負担金】 total row (frm203002.cs:6014). */
const KAIGO_LABEL = '介護保険一部負担金'
/**
 * Leading text of an IS 笑気・酸素 row — WinForm literals `"   N2O "` / `"   O2 "` /
 * `"   ＝…"` minus their three spaces, which are CSS now (frm203016.cs:842/868/895).
 */
const IS_GAS_TEXT = /^(N2O|O2|＝|=)/

/** Colour classes `historyRowClasses` puts on a comment row's 療法・処置 cell. */
const COMMENT_CLASSES = ['text-blue-600', 'text-[#ff00ff]']

/** One 療法・処置 cell as the browser actually renders it. */
interface RyoCell {
    /** rowKey — the part of `data-grid-cell` before `|2`. */
    key: string
    /** Raw `textContent`, NOT trimmed: the leading-space assert needs it verbatim. */
    text: string
    /** Resolved `padding-left` in px. */
    padLeft: number
    /** Resolved `white-space`. */
    whiteSpace: string
    /** Left edge of the CELL (all rows of one block share it — it is a grid column). */
    cellLeft: number
    /** 部位病名行 — its 点 cell holds {@link BUI_LINE_DASH} and no other row's does. */
    isBuiLine: boolean
    /** The 【介護保険一部負担金】 total row. */
    isKaigoTotal: boolean
    /** カルテコメント / 摘要コメント, detected by colour class. */
    isComment: boolean
}

/** Where the text of a row visually starts = cell edge + indent. */
const textLeft = (c: RyoCell) => c.cellLeft + c.padLeft

/** A short, printable form of a cell for assert messages. */
const describeCell = (c: RyoCell) =>
    `「${c.text.replace(/\s+/g, ' ').trim().slice(0, 24)}」(pad ${c.padLeft.toFixed(1)}px)`

/**
 * Read every 療法・処置 cell currently mounted, in display order.
 *
 * Done in ONE `page.evaluate` so the geometry of all rows comes from a single
 * layout pass — measuring cell by cell lets a re-render move the grid between two
 * reads and produces offsets that never existed together on screen.
 */
async function readRyoCells(page: Page): Promise<RyoCell[]> {
    return page.evaluate(
        ({ dash, kaigoLabel, commentClasses }) =>
            Array.from(document.querySelectorAll('[data-grid-cell$="|2"]')).map((node) => {
                const el = node as HTMLElement
                const cs = getComputedStyle(el)
                // 点 cell of the SAME row — sibling inside the row div (the JSX
                // fragment around 療法/点/回 creates no DOM node of its own).
                const ten = el.parentElement?.querySelector('[data-grid-cell$="|3"]')
                const text = el.textContent ?? ''
                const cls = el.className
                return {
                    key: (el.getAttribute('data-grid-cell') ?? '').replace(/\|2$/, ''),
                    text,
                    padLeft: Number.parseFloat(cs.paddingLeft) || 0,
                    whiteSpace: cs.whiteSpace,
                    cellLeft: el.getBoundingClientRect().left,
                    isBuiLine: (ten?.textContent ?? '').trim() === dash,
                    isKaigoTotal: text.includes(kaigoLabel),
                    isComment: commentClasses.some((c) => cls.includes(c)),
                }
            }),
        { dash: BUI_LINE_DASH, kaigoLabel: KAIGO_LABEL, commentClasses: COMMENT_CLASSES },
    )
}

/**
 * `N ch` resolved to px INSIDE the given cell, so the expected indent is computed
 * with the cell's own inherited font instead of a hard-coded number.
 */
async function chPx(page: Page, key: string, cols: number): Promise<number> {
    return page.locator(`[data-grid-cell="${key}|2"]`).evaluate((node, n) => {
        const probe = document.createElement('span')
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        probe.style.width = `${n}ch`
        node.appendChild(probe)
        const w = probe.getBoundingClientRect().width
        probe.remove()
        return w
    }, cols)
}

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — 療法・処置 column indent (REGIRYO_PADLEFT / ryoCellStyle)', () => {
    let page: Page
    let step: () => Promise<void>
    let disposeOverlays: (() => Promise<void>) | undefined

    /** rowKeys present BEFORE TC-3 types a 処置 — trap 1 (the grid shows the whole month). */
    let keysBefore = new Set<string>()
    /** Cells that appeared because of TC-3, shared with TC-4. */
    let newCells: RyoCell[] = []

    test.beforeAll(async ({ authedPage }) => {
        page = authedPage
        // Install BEFORE navigating: 「〜を算定しますか？」 fires the moment the grid
        // finishes loading. 'cancel' instead of 'no' — trap 3.
        disposeOverlays = await installOverlayHandlers(page, {
            santei: true,
            santeiAnswer: 'cancel',
            alerts: true,
            kartePicker: true,
        })
        step = makeStep(page)
        await openTreatmentEntry(page, PAT_NO, TRT_DT)
    })

    test.afterAll(async () => {
        await disposeOverlays?.()
        await releaseSharedPage(page)
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Rows already on the grid (read back from trn_trn) — no mutation.
    // ─────────────────────────────────────────────────────────────────────────

    test('TC-1 — every 療法・処置 cell indents by exactly 2 half-width columns (部位病名行 / 介護 total aside)', async () => {
        await closeDialogs(page)
        const cells = await readRyoCells(page)
        expect(cells.length, 'no 療法・処置 cell mounted — the grid did not load').toBeGreaterThan(0)

        const bui = cells.filter((c) => c.isBuiLine)
        const kaigo = cells.filter((c) => !c.isBuiLine && c.isKaigoTotal)
        const ordinary = cells.filter((c) => !c.isBuiLine && !c.isKaigoTotal)
        expect(ordinary.length, 'no ordinary 処置/コメント row to measure').toBeGreaterThan(0)

        const gas = ordinary.filter((c) => IS_GAS_TEXT.test(c.text.trim()))
        const plain = ordinary.filter((c) => !IS_GAS_TEXT.test(c.text.trim()))
        console.log(
            `療法・処置 cells: ${cells.length} total — ${plain.length} ordinary, ` +
                `${gas.length} IS 笑気・酸素, ${bui.length} 部位病名行, ${kaigo.length} 介護 total; ` +
                `comment rows: ${cells.filter((c) => c.isComment).length}`,
        )

        // Expected indent measured in the page, in the first cell's own font.
        const first = plain[0] ?? ordinary[0]!
        const expectedPad = await chPx(page, first.key, PAD_COLS)
        console.log(`REGIRYO_PADLEFT = ${PAD_COLS}ch resolves to ${expectedPad.toFixed(1)}px here`)

        for (const c of plain) {
            expect(
                Math.abs(c.padLeft - expectedPad),
                `row ${describeCell(c)} must indent by REGIRYO_PADLEFT = ${PAD_COLS} half-width ` +
                    `columns (${expectedPad.toFixed(1)}px). WinForm writes the pad into col 2 of EVERY ` +
                    'row; the web keeps it in CSS (ryoCellStyle → REGIRYO_INDENT). A 処置 row at 0px ' +
                    'means the indent was dropped; a comment row at 2× means the two spaces are still ' +
                    'baked into the string on top of the CSS.',
            ).toBeLessThanOrEqual(PX_TOLERANCE)
        }

        // The bug was visible precisely as "comment rows sit right of the 処置 rows",
        // so assert the two kinds against each other explicitly.
        const comments = plain.filter((c) => c.isComment)
        const treatments = plain.filter((c) => !c.isComment)
        if (comments.length > 0 && treatments.length > 0) {
            expect(
                Math.abs(comments[0]!.padLeft - treatments[0]!.padLeft),
                `comment row ${describeCell(comments[0]!)} and 処置 row ${describeCell(treatments[0]!)} ` +
                    'must share one indent — the reported bug was comment rows hanging two columns right.',
            ).toBeLessThanOrEqual(PX_TOLERANCE)
        } else {
            console.log('SKIP (partial) — this month has no comment/処置 pair on screen; TC-3/TC-4 build one')
        }

        // IS 笑気・酸素 rows are the documented 3-column exception.
        for (const c of gas) {
            const expectedGas = await chPx(page, c.key, PAD_COLS_IS_GAS)
            expect(
                Math.abs(c.padLeft - expectedGas),
                `IS 笑気・酸素 row ${describeCell(c)} indents by ${PAD_COLS_IS_GAS} columns, not ` +
                    `${PAD_COLS} (WinForm literals "   N2O " / "   O2 " — frm203016.cs:842/868/895).`,
            ).toBeLessThanOrEqual(PX_TOLERANCE)
        }
        await step()
    })

    test('TC-2 — 部位病名行 sits LEFT of the 処置 rows under it (dsp_dis is written flush, no pad)', async () => {
        const cells = await readRyoCells(page)
        // Take a 部位病名行 that is immediately followed by an ordinary row: adjacent
        // rows are in the same block, so their cell edges are the same grid column and
        // `textLeft` is directly comparable.
        const idx = cells.findIndex(
            (c, i) =>
                c.isBuiLine &&
                cells[i + 1] !== undefined &&
                !cells[i + 1]!.isBuiLine &&
                !cells[i + 1]!.isKaigoTotal,
        )
        skipWithReason(
            idx < 0,
            'this month shows no 部位病名行 followed by a 処置 row (a 病名 has to be registered ' +
                `for ${PAT_NO}; set TEST_PAT_NO / TEST_TRT_DT to a day that has one)`,
        )

        const bui = cells[idx]!
        const trt = cells[idx + 1]!
        console.log(
            `部位病名行 ${describeCell(bui)} at x=${textLeft(bui).toFixed(1)} vs 処置行 ` +
                `${describeCell(trt)} at x=${textLeft(trt).toFixed(1)}`,
        )

        const expectedPad = await chPx(page, trt.key, PAD_COLS)
        expect(
            textLeft(trt) - textLeft(bui),
            `the 病名 of a 部位病名行 must start ${PAD_COLS} half-width columns LEFT of the 処置 rows ` +
                'below it — WinForm assigns `hFG1[2] = dsp_dis` raw, with no REGIRYO_PADLEFT ' +
                '(modSave.cs:2583/4938). It is the only row at column 0.',
        ).toBeGreaterThan(expectedPad - PX_TOLERANCE)

        expect(
            bui.padLeft,
            `部位病名行 ${describeCell(bui)} must carry NO CSS indent (ryoCellStyle returns no ` +
                'paddingLeft for isBuiLine); anything beyond the cell\'s own px-1 gutter is the pad ' +
                'leaking back in.',
        ).toBeLessThan(expectedPad)
        await step()
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Rows created through the UI — the path the bug was reported on.
    // TC-3 dirties the grid, so it and TC-4 stay LAST.
    // ─────────────────────────────────────────────────────────────────────────

    test(`TC-3 — a freshly entered ${TRT_CD}-${TRT_SB} and its comment tail all start at the same x`, async () => {
        await closeDialogs(page)
        keysBefore = new Set((await readRyoCells(page)).map((c) => c.key))
        console.log(`${keysBefore.size} rows on the grid before entering ${TRT_CD}-${TRT_SB}`)

        // コードモード — in 点数モード the digits would be read as 点数 and the app
        // answers 「該当処置はありません。」 instead of opening 処置選択.
        const modeBtn = page.locator('button[title*="入力モード切替"]').first()
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'could not switch the grid to コードモード').toHaveText('コード')
        await step()

        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.click()
        await footerTen.fill(TRT_CD)
        await footerTen.press('Enter')
        // The handler clears the input before it queries — an empty value is the REAL
        // signal that Enter was processed (Rule 7: no sleeping).
        await expect(footerTen, 'Enter was not processed (the 点 cell was never cleared)').toHaveValue(
            '',
        )

        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })
        await expect(
            trtPicker,
            `code ${TRT_CD} did not open 処置選択 — this tenant's master may not have it; ` +
                'set TEST_TRT_CD / TEST_TRT_SB to a code whose commit pulls in 摘要コメント rows.',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const pickIdx = sbTexts.findIndex((t) => t.trim() === TRT_SB)
        expect(
            pickIdx,
            `処置選択 has no 枝番 ${TRT_SB} for ${TRT_CD} (saw: ${sbTexts.join(', ')})`,
        ).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(pickIdx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // F9 確定 only parks the row waiting for its 回数. WinForm runs the whole
        // 摘要コメント cascade (`Chk_CmtAuto`) from the Enter branch of the 回 cell
        // (frm203002.cs:5758-5776), so without this Enter there is no comment row at
        // all — and the testcase would look like a missing feature.
        const editing = page.locator('input:focus')
        await expect(editing, 'after 確定 the 回 cell should be in edit mode holding "1"').toHaveValue(
            '1',
            { timeout: 20_000 },
        )
        await page.keyboard.press('Enter')
        await step()
        await closeDialogs(page)

        // Wait on a REAL landmark (the row count growing) instead of reading straight
        // away — the comment rows land only after the BE answers.
        await expect
            .poll(
                async () =>
                    (await readRyoCells(page)).filter((c) => !keysBefore.has(c.key)).length,
                {
                    timeout: 30_000,
                    intervals: [500, 1000, 2000],
                    message: `entering ${TRT_CD}-${TRT_SB} put no new row on the grid`,
                },
            )
            .toBeGreaterThan(0)

        newCells = (await readRyoCells(page)).filter((c) => !keysBefore.has(c.key))
        console.log(
            `new rows: ${newCells.map((c) => `${describeCell(c)}${c.isComment ? ' [comment]' : ''}`).join(' | ')}`,
        )

        // Trap 1: assert ONLY on the new keys. The 部位病名行 the entry may have grown
        // (AutoBui) is the documented column-0 row, and IS 笑気・酸素 rows are the
        // documented 3-column row, so both are excluded here — TC-2 and TC-1 cover them.
        const aligned = newCells.filter(
            (c) => !c.isBuiLine && !c.isKaigoTotal && !IS_GAS_TEXT.test(c.text.trim()),
        )
        expect(
            aligned.length,
            'every new row is a 部位病名行 / 介護 total / IS 笑気・酸素 — nothing left to align',
        ).toBeGreaterThan(0)

        const expectedPad = await chPx(page, aligned[0]!.key, PAD_COLS)
        const base = textLeft(aligned[0]!)
        for (const c of aligned) {
            expect(
                Math.abs(textLeft(c) - base),
                `new row ${describeCell(c)} starts at x=${textLeft(c).toFixed(1)} while ` +
                    `${describeCell(aligned[0]!)} starts at x=${base.toFixed(1)}. Everything entered on ` +
                    'one day must line up: WinForm pads every row of col 2 identically, so a comment ' +
                    'row two columns right of its 処置 row is the bug this spec guards.',
            ).toBeLessThanOrEqual(PX_TOLERANCE)
            expect(
                Math.abs(c.padLeft - expectedPad),
                `new row ${describeCell(c)} must indent by ${PAD_COLS} columns (${expectedPad.toFixed(1)}px)`,
            ).toBeLessThanOrEqual(PX_TOLERANCE)
        }
        await step()
    })

    test('TC-4 — the new comment row carries NO leading spaces in its text (dsp_trt stays clean)', async () => {
        expect(newCells.length, 'TC-3 produced no new row to inspect').toBeGreaterThan(0)

        const comments = newCells.filter((c) => c.isComment)
        skipWithReason(
            comments.length === 0,
            `committing ${TRT_CD}-${TRT_SB} produced no comment row on this master, so the ` +
                'comment-vs-処置 offset could not be measured from a fresh entry (TC-1 still checked ' +
                'the rows loaded from trn_trn). Set TEST_TRT_CD / TEST_TRT_SB to a code with a ' +
                '摘要コメント pack.',
        )

        for (const c of newCells) {
            // The 【介護保険一部負担金】 total row is the ONE row whose leading spaces are
            // real text (five of them, frm203002.cs:6014) — everything else must be bare.
            if (c.isKaigoTotal) {
                expect(
                    c.whiteSpace,
                    'the 【介護保険一部負担金】 row keeps five literal spaces, so its cell needs ' +
                        '`white-space: pre-wrap` or they collapse and the label loses its offset.',
                ).toBe('pre-wrap')
                continue
            }
            expect(
                c.text,
                `row ${describeCell(c)} starts with whitespace. The indent is CSS now, so the ` +
                    'row name — and therefore the dsp_trt that F9 登録 ships — must be free of it; WinForm ' +
                    'strips REGIRYO_PADLEFT before saving (modSave.cs:256-270).',
            ).not.toMatch(/^[\s　]/)
        }

        // The exact symptom that was reported: the CMTAUTO comment vs the 処置 row it
        // belongs to, both just created, must start at the same x.
        const trt = newCells.find(
            (c) =>
                !c.isComment &&
                !c.isBuiLine &&
                !c.isKaigoTotal &&
                !IS_GAS_TEXT.test(c.text.trim()) &&
                c.text.trim() !== '',
        )
        if (trt !== undefined) {
            for (const c of comments) {
                expect(
                    Math.abs(textLeft(c) - textLeft(trt)),
                    `comment ${describeCell(c)} is offset from its own 処置 row ${describeCell(trt)} ` +
                        `(x=${textLeft(c).toFixed(1)} vs ${textLeft(trt).toFixed(1)}). This is the ` +
                        'reported defect: the port added REGIRYO_PADLEFT to comment rows only.',
                ).toBeLessThanOrEqual(PX_TOLERANCE)
            }
        }
        await step()
    })
})
