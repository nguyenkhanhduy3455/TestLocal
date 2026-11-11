/**
 * DB seed for the Rule 24 specs whose lists are EMPTY on a fresh tenant: 受付一覧
 * (`wait`), 未精算患者一覧 (`unpaid`), カルテ待ち (`ncult`) and 地方公費 (`mst_pmh_local_pubexp`).
 * Everything is keyed on a test-only patient number / public-expense number, and
 * `cleanListChromeData` removes it again — including the `<table>_deleted` archive
 * copies the DELETE triggers leave behind.
 */
import {
    SEED_PAT_NO_BASE,
    deleteTestPatient,
    deleteWaitRows,
    ensureWaitRow,
    seedTestPatient,
    withDb,
} from './db'

/**
 * Mỗi spec gọi helper này truyền số bệnh nhân RIÊNG (990880, 990881, …): chạy song
 * song mà dùng chung một số thì spec này `clean` xoá dữ liệu spec kia đang đọc.
 */
export const CHROME_PAT_NO_BASE = SEED_PAT_NO_BASE + 880

/** 8 chars max (`public_expense_number`), outside the real 負担者番号 range. */
const pubexpNo = (patNo: number): string => `99${patNo}`

export async function seedListChromeData(patNo: number): Promise<void> {
    await cleanListChromeData(patNo)
    await seedTestPatient({
        patNo,
        patNm: 'E2E一覧クロム',
        patKn: 'いーつーいーいちらんくろむ',
    })
    await ensureWaitRow(patNo, null)
    await withDb(async (c) => {
        await c.query(
            `INSERT INTO unpaid (trt_dt, trt_cnt, pat_no, km_cd, acc_tm, pat_br, claim_amt, score)
             VALUES (CURRENT_DATE, 1, $1, 1, NOW(), 1, 1000, 100)`,
            [patNo],
        )
        await c.query(`INSERT INTO ncult (pat_no, pat_br, trt_date) VALUES ($1, 1, CURRENT_DATE)`, [
            patNo,
        ])
        await c.query(
            `INSERT INTO mst_pmh_local_pubexp
                 (public_expense_number, project_division_code, project_name_full, project_name_short,
                  prefecture_code, municipality_code, valid_from)
             VALUES ($1, '0001', 'E2E一覧クロム事業', 'E2E事業', '13', '131016', CURRENT_DATE)`,
            [pubexpNo(patNo)],
        )
    })
}

export async function cleanListChromeData(patNo: number): Promise<void> {
    await withDb(async (c) => {
        const waitIds = (
            await c.query<{ id: string }>(`SELECT id FROM wait WHERE pat_no = $1`, [patNo])
        ).rows.map((r) => String(r.id))
        await deleteWaitRows(waitIds)
        for (const t of ['unpaid', 'ncult', 'wait']) {
            await c.query(`DELETE FROM ${t} WHERE pat_no = $1`, [patNo])
            await c.query(`DELETE FROM ${t}_deleted WHERE pat_no = $1`, [patNo])
        }
        await c.query(`DELETE FROM mst_pmh_local_pubexp WHERE public_expense_number = $1`, [
            pubexpNo(patNo),
        ])
        await c.query(`DELETE FROM mst_pmh_local_pubexp_deleted WHERE public_expense_number = $1`, [
            pubexpNo(patNo),
        ])
    })
    await deleteTestPatient(patNo)
}
