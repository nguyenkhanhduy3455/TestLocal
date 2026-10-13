import { DB_SCHEMA, withDb } from './db'

/**
 * Dựng một BỆNH NHÂN TEST MỚI HOÀN TOÀN rồi xoá sạch sau lượt chạy.
 *
 * Vế Postgres của `fla-ui-tests/src/OchaCom.FlaUiTests/Infrastructure/TestPatientDb.cs`.
 * Hai bên phải dùng CÙNG vùng số và CÙNG danh sách bảng, nếu không thì 「bệnh nhân
 * mới」 của hai vế không còn là cùng một trạng thái xuất phát.
 *
 * ─── VÌ SAO CÓ FILE NÀY ──────────────────────────────────────────────────────
 * Trước đây spec bám vào bệnh nhân CÓ SẴN (5, 10, 12138…) và chọn 診療日 theo dữ
 * liệu sẵn có của họ. Giá phải trả, đã vấp thật:
 *
 *  - Hai spec chạy cùng bệnh nhân thì dọn dẹp của spec này cuốn mất dữ liệu của
 *    spec kia — `deleteTreatmentRows` phải khoá thêm `trt_dt` chỉ vì bệnh nhân 10
 *    có một dòng 再初診 cố định ở ngày khác.
 *  - Kỳ vọng phụ thuộc lịch sử: 「月計 413」 đúng đến khi ai đó thêm một dòng 処置.
 *  - Ca biên không dựng được vì bệnh nhân thật không có trạng thái đó (răng 欠損
 *    toàn hàm, tháng trống, 初診月…).
 *
 * ─── CÁCH DỰNG: CLONE, KHÔNG PHẢI DỰNG TAY ───────────────────────────────────
 * Hồ sơ bệnh nhân trải trên 11 bảng, mỗi bảng vài chục cột, và app đọc những cột
 * mà không ai nhớ hết. Dựng tay từng cột là con đường chắc chắn dẫn tới 「mở màn
 * 診療入力 mà lưới không bao giờ hiện」.
 *
 * Vì thế: CLONE nguyên một bệnh nhân mẫu, chỉ đổi `pat_no` và những cột mà test
 * thật sự định nghĩa. Danh sách cột đọc từ `information_schema` tại runtime —
 * chép cứng là vỡ khi schema đổi (cùng lý do với `seedMstTrtRow` trong `db.ts`).
 *
 * ⚠️ Cột `id` (uuid, default `uuidv7()`) bị LOẠI khỏi INSERT để Postgres sinh mới;
 * chép nguyên id là đụng khoá chính.
 *
 * ─── VÙNG SỐ VÀ HÀNG RÀO ─────────────────────────────────────────────────────
 * `pat_no >= TEST_PAT_NO_BASE`. Dev DB có `max(pat_no) = 18282` (16331 bệnh nhân,
 * đo 2026-09-14 — TRÙNG bên SQL Server) nên vùng 990000+ nằm rất xa.
 *
 * Mọi lệnh xoá đều chặn ở vùng đó: `requireTestRange` ném ngay nếu bị gọi với số
 * ngoài vùng — không có đường nào để một lỗi đánh máy xoá mất bệnh nhân thật.
 */

/** Mốc dưới của vùng bệnh nhân test. Dưới mốc này là dữ liệu thật. */
export const TEST_PAT_NO_BASE = 990000

/**
 * Các bảng hợp thành một hồ sơ bệnh nhân, theo thứ tự clone. Thứ tự XOÁ là ngược lại.
 * Trùng `TestPatientDb.ProfileTables` bên FlaUI (tên snake_case của cùng bảng).
 */
export const PROFILE_TABLES = [
    'person',
    'person_exp',
    'insurance',
    'med_ins_inf',
    'bnow',
    'misou',
    'siga',
    'kon',
    'trn_status',
    'trt_state',
    'ncult',
] as const

/**
 * Bảng mang dữ liệu PHÁT SINH — KHÔNG clone (bệnh nhân mới phải có lịch sử TRỐNG),
 * nhưng PHẢI dọn vì một lượt chạy có thể sinh ra chúng.
 */
export const GENERATED_TABLES = [
    'trn_trn',
    'acc_dat',
    'acc_dat_bill',
    'unpaid',
    'chiryo_kanri',
    'chiryo_kanri_r2',
    'gisi_kanri',
    'sidou',
    'pat_msg',
    'p_condition',
    'sum_tsk',
    'pub_exp_inf',
    'pat_info',
    'personal_info',
    'user_patient_history',
] as const

function requireTestRange(patNo: number): void {
    if (patNo < TEST_PAT_NO_BASE) {
        throw new Error(
            `pat_no ${patNo} nằm NGOÀI vùng bệnh nhân test (>= ${TEST_PAT_NO_BASE}). ` +
                'Module này chỉ được phép đụng vào bệnh nhân do chính nó dựng ra — ' +
                'dữ liệu thật của phòng khám không bao giờ đi qua đây.',
        )
    }
}

/**
 * Cột được phép ghi của một bảng: bỏ cột sinh tự động (`id uuid default uuidv7()`
 * và mọi cột `GENERATED ALWAYS`).
 */
async function writableColumns(client: import('pg').Client, table: string): Promise<string[]> {
    const res = await client.query<{ column_name: string }>(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = $2
            AND is_generated <> 'ALWAYS'
            AND coalesce(column_default, '') NOT LIKE 'uuidv7%'
          ORDER BY ordinal_position`,
        [DB_SCHEMA, table],
    )
    return res.rows.map((r) => r.column_name)
}

/**
 * Bệnh nhân MẪU để clone: bệnh nhân thật có hồ sơ đầy đủ nhất.
 *
 * Chọn theo điểm chứ không hardcode một số — dev DB của tenant khác không chắc có
 * bệnh nhân 10.
 */
export async function findTemplatePatNo(): Promise<number | null> {
    return withDb(async (client) => {
        // EXISTS + LIMIT 1, KHÔNG tính điểm.
        //
        // ⚠️ Bản đầu xếp hạng bằng 11 subquery `count(*)` rồi ORDER BY — trên dev DB
        //    (16331 bệnh nhân) nó chạy quá 3 phút và bị cắt. Đo 2026-09-14. Câu hỏi
        //    thật sự chỉ là 「bệnh nhân nào có ĐỦ hồ sơ」, mà EXISTS dừng ngay ở dòng
        //    đầu khớp — không cần biết ai đầy đủ NHẤT.
        const exists = PROFILE_TABLES.filter((t) => t !== 'person')
            .map((t) => `EXISTS (SELECT 1 FROM ${t} x WHERE x.pat_no = p.pat_no)`)
            .join(' AND ')
        const res = await client.query<{ pat_no: number }>(
            `SELECT p.pat_no
               FROM person p
              WHERE p.pat_no < ${TEST_PAT_NO_BASE} AND ${exists}
              ORDER BY p.pat_no
              LIMIT 1`,
        )
        if (res.rows[0]) return res.rows[0].pat_no

        // Không ai có ĐỦ 11 bảng thì hạ yêu cầu xuống mức tối thiểu app cần để mở màn.
        const min = await client.query<{ pat_no: number }>(
            `SELECT p.pat_no
               FROM person p
              WHERE p.pat_no < ${TEST_PAT_NO_BASE}
                AND EXISTS (SELECT 1 FROM insurance i WHERE i.pat_no = p.pat_no)
              ORDER BY p.pat_no
              LIMIT 1`,
        )
        return min.rows[0]?.pat_no ?? null
    })
}

/**
 * Cấp một `pat_no` chưa ai dùng trong vùng test.
 *
 * Lấy `max + 1` của vùng test chứ không phải số cố định: hai lượt chạy chồng nhau
 * (hoặc một lượt bị Ctrl+C chưa kịp dọn) vẫn không đụng số của nhau.
 */
export async function nextTestPatNo(): Promise<number> {
    return withDb(async (client) => {
        const res = await client.query<{ next: string }>(
            `SELECT coalesce(max(pat_no), ${TEST_PAT_NO_BASE - 1}) + 1 AS next
               FROM person WHERE pat_no >= ${TEST_PAT_NO_BASE}`,
        )
        const next = Number(res.rows[0]?.next ?? TEST_PAT_NO_BASE)
        return next < TEST_PAT_NO_BASE ? TEST_PAT_NO_BASE : next
    })
}

export interface CreatedTestPatient {
    patNo: number
    templatePatNo: number
    /** Số dòng đã clone theo từng bảng — in ra log để biết hồ sơ dựng có đủ không. */
    rowsPerTable: Record<string, number>
}

/**
 * Dựng bệnh nhân mới bằng cách clone `templatePatNo`.
 *
 * Sau khi clone, bảo hiểm được kéo dài để chắc chắn bao `coverFrom`: `med_st_dt`
 * lùi về đầu tháng TRƯỚC đó và `med_ed_dt` đẩy tới `9999-12-31`. Không làm thế thì
 * bệnh nhân mới thừa hưởng đúng khoảng hiệu lực của người mẫu và màn 診療入力 từ
 * chối mở ở ngày test.
 *
 * @param coverFrom 診療日 mà bảo hiểm phải bao — dạng `YYYY-MM-DD`.
 */
export async function createTestPatient(
    coverFrom: string,
    opts: { patNo?: number; templatePatNo?: number } = {},
): Promise<CreatedTestPatient> {
    const templatePatNo = opts.templatePatNo ?? (await findTemplatePatNo())
    if (templatePatNo === null || templatePatNo === undefined) {
        throw new Error(
            'Không tìm được bệnh nhân MẪU để clone (person + insurance). ' +
                'DB rỗng, hay search_path trỏ sai schema?',
        )
    }

    const patNo = opts.patNo ?? (await nextTestPatNo())
    requireTestRange(patNo)

    // Dựng lại từ đầu cho chắc: lượt trước bị cắt giữa chừng có thể để sót.
    await dropTestPatient(patNo)

    const rowsPerTable: Record<string, number> = {}
    await withDb(async (client) => {
        for (const table of PROFILE_TABLES) {
            const cols = await writableColumns(client, table)
            if (cols.length === 0) continue

            const target = cols.map((c) => `"${c}"`).join(', ')
            const source = cols.map((c) => (c === 'pat_no' ? '$1' : `"${c}"`)).join(', ')
            const res = await client.query(
                `INSERT INTO ${table} (${target}) SELECT ${source} FROM ${table} WHERE pat_no = $2`,
                [patNo, templatePatNo],
            )
            rowsPerTable[table] = res.rowCount ?? 0
        }

        // Bảo hiểm phải bao ngày test, nếu không màn 診療入力 không mở được.
        const from = new Date(`${coverFrom}T00:00:00Z`)
        const st = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1))
        await client.query(
            `UPDATE insurance SET med_st_dt = $1, med_ed_dt = '9999-12-31' WHERE pat_no = $2`,
            [st.toISOString().slice(0, 10), patNo],
        )
    })

    return { patNo, templatePatNo, rowsPerTable }
}

/**
 * Xoá SẠCH một bệnh nhân test khỏi mọi bảng — cả hồ sơ lẫn dữ liệu phát sinh.
 *
 * Bảng không tồn tại thì bỏ qua chứ không làm hỏng cả lượt dọn: schema tenant khác
 * có thể thiếu vài bảng phụ.
 */
export async function dropTestPatient(patNo: number): Promise<Record<string, number>> {
    requireTestRange(patNo)

    const deleted: Record<string, number> = {}
    await withDb(async (client) => {
        const tables = [...GENERATED_TABLES, ...[...PROFILE_TABLES].reverse()]
        for (const table of tables) {
            try {
                const res = await client.query(`DELETE FROM ${table} WHERE pat_no = $1`, [patNo])
                if ((res.rowCount ?? 0) > 0) deleted[table] = res.rowCount ?? 0
                // Dòng vừa xoá đã được trigger archive sang `<bảng>_deleted` — dọn nốt.
                await client.query(`DELETE FROM ${table}_deleted WHERE pat_no = $1`, [patNo])
            } catch {
                // Bảng không có / không có cột pat_no ở tenant này — không phải lỗi.
                // ⚠️ Postgres huỷ cả transaction khi một câu lỗi, nhưng withDb chạy
                //    autocommit (không BEGIN) nên câu sau vẫn chạy được.
            }
        }
    })
    return deleted
}

export interface SeedInsuranceBranch {
    patBr: number
    /** 資格取得年月日 (`br_dt`) — thứ quyết định 枝番 nào có hiệu lực tại 診療日. */
    brDt: string
    medStDt: string
    medEdDt: string
    disFlg: number
    oldFlg: number
}

/**
 * Thay toàn bộ 枝番 (`insurance`) của một bệnh nhân test bằng danh sách cho trước.
 *
 * Mỗi 枝番 là bản sao của dòng bảo hiểm sẵn có, chỉ ghi đè các cột spec định nghĩa.
 * Dùng cho spec cần cấu trúc 枝番 đặc thù mà không muốn mượn bệnh nhân thật.
 */
export async function seedInsuranceBranches(
    patNo: number,
    branches: readonly SeedInsuranceBranch[],
): Promise<void> {
    requireTestRange(patNo)
    await withDb(async (client) => {
        const cols = await writableColumns(client, 'insurance')
        const sentinel = 9999
        const moved = await client.query(
            `UPDATE insurance SET pat_br = ${sentinel}
              WHERE pat_no = $1 AND pat_br = (SELECT min(pat_br) FROM insurance WHERE pat_no = $1)`,
            [patNo],
        )
        if ((moved.rowCount ?? 0) === 0) {
            throw new Error(`bệnh nhân test ${patNo} chưa có dòng insurance để nhân bản 枝番`)
        }
        const override: Record<string, string> = {
            pat_br: '$2::int',
            br_dt: '$3::date',
            med_st_dt: '$4::date',
            med_ed_dt: '$5::date',
            dis_flg: '$6::int',
            old_flg: '$7::int',
        }
        const target = cols.map((c) => `"${c}"`).join(', ')
        const source = cols.map((c) => override[c] ?? `"${c}"`).join(', ')
        for (const b of branches) {
            await client.query(
                `INSERT INTO insurance (${target})
                 SELECT ${source} FROM insurance WHERE pat_no = $1 AND pat_br = ${sentinel}`,
                [patNo, b.patBr, b.brDt, b.medStDt, b.medEdDt, b.disFlg, b.oldFlg],
            )
        }
        await client.query(`DELETE FROM insurance WHERE pat_no = $1 AND pat_br = ${sentinel}`, [patNo])
        await client.query(`DELETE FROM insurance_deleted WHERE pat_no = $1 AND pat_br = ${sentinel}`, [patNo])
    })
}

/**
 * Dọn MỌI bệnh nhân còn sót trong vùng test — lưới an toàn cho những lượt chạy bị
 * cắt trước khi kịp `dropTestPatient`.
 *
 * Gọi ở ĐẦU lượt chạy, không phải cuối: nếu một lượt khác đang chạy song song thì
 * dọn ở cuối sẽ giật mất bệnh nhân của nó.
 */
export async function dropLeftoverTestPatients(): Promise<number[]> {
    const ids = await withDb(async (client) => {
        const res = await client.query<{ pat_no: number }>(
            `SELECT pat_no FROM person WHERE pat_no >= ${TEST_PAT_NO_BASE} ORDER BY pat_no`,
        )
        return res.rows.map((r) => r.pat_no)
    })
    for (const id of ids) await dropTestPatient(id)
    return ids
}

/** Bệnh nhân test có tồn tại không — mốc để khẳng định `dropTestPatient` đã sạch. */
export async function testPatientExists(patNo: number): Promise<boolean> {
    return withDb(async (client) => {
        const res = await client.query(`SELECT 1 FROM person WHERE pat_no = $1 LIMIT 1`, [patNo])
        return (res.rowCount ?? 0) > 0
    })
}

/** Số bản ghi CÒN LẠI của bệnh nhân trên mọi bảng — dùng để kiểm đã dọn sạch. */
export async function describeRemaining(patNo: number): Promise<string> {
    const parts: string[] = []
    await withDb(async (client) => {
        for (const table of [...PROFILE_TABLES, ...GENERATED_TABLES]) {
            try {
                const res = await client.query<{ n: string }>(
                    `SELECT count(*) AS n FROM ${table} WHERE pat_no = $1`,
                    [patNo],
                )
                const n = Number(res.rows[0]?.n ?? 0)
                if (n > 0) parts.push(`${table}:${n}`)
            } catch {
                // bảng không có ở tenant này
            }
        }
    })
    return parts.length === 0 ? '(sạch)' : parts.join(' ')
}
