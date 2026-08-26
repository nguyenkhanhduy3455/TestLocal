/**
 * Truy cập Postgres TRỰC TIẾP cho các testcase cần seed/verify/dọn dữ liệu ở
 * tầng DB — dùng cho những gì UI không làm được (vd frm203023 KHÔNG có nút xoá,
 * nên phải DELETE thẳng bảng để dọn record test).
 *
 * `dbEnabled` = có `TEST_DB=1` HOẶC có `TEST_DB_URL` / `TEST_DB_HOST`. Không đặt
 * biến nào → `dbEnabled = false` → mọi testcase can thiệp DB tự `test.skip`,
 * KHÔNG mở kết nối nào. `pg` chỉ được `import` (resolve module), còn
 * `new Client()` chỉ chạy bên trong `withDb`, tức chỉ khi đã bật.
 *
 * ── Cấu hình ────────────────────────────────────────────────────────────────
 * Chạy Playwright trên MÁY KHÁC với máy chạy Postgres (rất hay gặp: app + DB ở
 * server, test chạy ở máy tester) thì phải trỏ DB ra ngoài localhost — nếu không
 * sẽ nhận `ECONNREFUSED 127.0.0.1:5432`.
 *
 * Cách 1 — theo mảnh (gọn nhất khi chỉ đổi IP):
 *   TEST_DB=1
 *   TEST_DB_HOST=192.168.1.50
 *   TEST_DB_PORT=5432            # optional, mặc định 5432
 *   TEST_DB_NAME=ochacom-dev     # optional
 *   TEST_DB_USER=ochacom         # optional
 *   TEST_DB_PASSWORD=ochacom_pass# optional
 *
 * Cách 2 — nguyên URL (ưu tiên hơn cách 1 nếu đặt cả hai):
 *   TEST_DB_URL=postgres://ochacom:ochacom_pass@192.168.1.50:5432/ochacom-dev
 *
 * Và schema của tenant đang test:
 *   TEST_DB_SCHEMA=t_tenant1
 *
 * Đặt trong `.env` của web-tenant-tests là được (runner đã nạp sẵn .env).
 *
 * Lưu ý phía server: Postgres phải cho kết nối từ ngoài — `listen_addresses`
 * mở, `pg_hba.conf` cho dải IP của máy test, và cổng 5432 không bị firewall
 * chặn. Nếu DB chạy trong Docker thì phải publish cổng ra host.
 *
 * Mặc định (không đặt gì) khớp docker-compose.infra.yml:
 * ochacom/ochacom_pass@localhost:5432/ochacom-dev + schema t_tenant1.
 */
import { Client } from 'pg'

const DB_HOST = process.env.TEST_DB_HOST
const DB_PORT = process.env.TEST_DB_PORT ?? '5432'
const DB_NAME = process.env.TEST_DB_NAME ?? 'ochacom-dev'
const DB_USER = process.env.TEST_DB_USER ?? 'ochacom'
const DB_PASSWORD = process.env.TEST_DB_PASSWORD ?? 'ochacom_pass'

/** Schema của tenant đang test — search_path được set cho mỗi kết nối. */
export const DB_SCHEMA = process.env.TEST_DB_SCHEMA ?? 't_tenant1'

/**
 * Các testcase can thiệp DB chỉ chạy khi cờ này bật. Production KHÔNG đặt biến
 * nào → false → skip.
 */
export const dbEnabled =
    process.env.TEST_DB === '1' || Boolean(process.env.TEST_DB_URL) || Boolean(DB_HOST)

/**
 * URL cuối cùng: TEST_DB_URL nguyên khối nếu có, không thì ghép từ các mảnh.
 * Mật khẩu được encode để ký tự đặc biệt (@ : / ?) không phá cú pháp URL.
 */
const CONNECTION_URL =
    process.env.TEST_DB_URL ??
    `postgres://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}` +
        `@${DB_HOST ?? 'localhost'}:${DB_PORT}/${DB_NAME}`

/** Mô tả đích đến, KHÔNG lộ mật khẩu — dùng trong thông báo lỗi. */
function describeTarget(): string {
    try {
        const u = new URL(CONNECTION_URL)
        return `${u.hostname}:${u.port || '5432'}${u.pathname}`
    } catch {
        return '(TEST_DB_URL không parse được)'
    }
}

/**
 * Mở một kết nối ngắn, set `search_path` về schema tenant, chạy `fn` rồi đóng.
 * Không dùng pool: các testcase DB thưa và chạy tuần tự, một client/thao tác là
 * đủ và tránh treo pool khi test kết thúc.
 *
 * Lỗi kết nối được bọc lại kèm hướng dẫn: `ECONNREFUSED` trần không nói được là
 * phải đặt biến nào, mà đây là chỗ vấp thường xuyên nhất khi test chạy khác máy
 * với DB.
 */
export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: CONNECTION_URL })
    try {
        await client.connect()
    } catch (err) {
        throw new Error(
            `Không kết nối được Postgres tại ${describeTarget()}.\n` +
                'Test đang chạy khác máy với DB? Đặt TEST_DB_HOST=<ip-server> ' +
                '(hoặc TEST_DB_URL đầy đủ) trong .env của web-tenant-tests.\n' +
                'Phía server nhớ mở listen_addresses + pg_hba.conf + firewall cổng 5432.\n' +
                `Nguyên nhân gốc: ${(err as Error).message}`,
            { cause: err },
        )
    }
    try {
        await client.query(`SET search_path TO "${DB_SCHEMA}", public;`)
        return await fn(client)
    } finally {
        await client.end()
    }
}

// ─── mst_trt (処置マスタ) — seed tạm cho testcase cần một mã KHÔNG có trong bản
//     master đang áp dụng ─────────────────────────────────────────────────────
//
// Vì sao cần: master 処置 chia theo BẢN (mst_trt_ver: MST_TRT264 hết hiệu lực
// 2026-05-31, MST_TRT266 hiệu lực từ 2026-06-01). 改定 令和8年6月 đã BỎ 医情
// (108-14/16) khỏi bản 266, nên ở tháng hiện hành không nhập được mã đó qua UI —
// mà đúng cái mã đó mới kiểm được cận trên 2026/5/31 của khối 医情
// (Check.cs:10980). Seed tạm một dòng vào bản đang áp dụng là cách duy nhất dựng
// được trạng thái đó từ e2e.
//
// Cách seed: CLONE một dòng có thật trong CÙNG BẢN rồi ghi đè trt_cd/trt_sb/tên.
// mst_trt có ~80 cột NOT NULL không default; liệt kê tay là chắc chắn vỡ khi
// schema đổi, nên danh sách cột được đọc từ information_schema tại runtime.
//
// LUÔN dọn bằng deleteMstTrtRows() trong afterAll — id được trả về từ INSERT nên
// chỉ xoá đúng dòng mình tạo, không đụng master thật.
//
// Nếu một lần chạy bị kill giữa chừng (Ctrl+C) thì dòng seed còn lại; KHÔNG viết
// hàm tự dọn theo (trt_cd, trt_sb) vì tenant khác có thể có mã đó thật. Dọn tay:
//   SELECT id, trt_cd, trt_sb, trt_nm, created_at FROM t_tenant1.mst_trt
//    WHERE trt_cd = 108 AND trt_sb IN (14, 16) ORDER BY created_at DESC;
//   -- đối chiếu created_at với lúc chạy test rồi DELETE theo id.

/** Cột không được chép khi clone (khoá + audit tự sinh). */
const MST_TRT_SKIP_COLS = ['id', 'created_at', 'updated_at']

export interface SeedMstTrtInput {
    /** Mã cần tạo. */
    trtCd: number
    trtSb: number
    /** Tên hiển thị (dsp_trt trên lưới + trong message W00100). */
    trtNm: string
    /** Dòng nguồn để clone — phải TỒN TẠI trong bản master đang áp dụng. */
    fromTrtCd: number
    fromTrtSb: number
}

/**
 * Seed các dòng 処置マスタ vào bản master đang áp dụng cho `onDate` (yyyy-mm-dd).
 * Trả về id các dòng đã tạo; rỗng khi không tìm được bản master hoặc dòng nguồn.
 */
export async function seedMstTrtRows(
    onDate: string,
    rows: readonly SeedMstTrtInput[],
): Promise<string[]> {
    return withDb(async (c) => {
        const ver = await c.query<{ version_id: string; version_code: string }>(
            `SELECT version_id, version_code
               FROM view_mst_trt_ver_active
              WHERE table_name LIKE 'MST_TRT%'
                AND start_date <= $1::timestamptz
                AND end_date   >= $1::timestamptz
              ORDER BY start_date DESC
              LIMIT 1`,
            [`${onDate}T00:00:00+09:00`],
        )
        const versionId = ver.rows[0]?.version_id
        if (!versionId) return []

        const cols = await c.query<{ column_name: string }>(
            `SELECT column_name
               FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'mst_trt'
              ORDER BY ordinal_position`,
            [DB_SCHEMA],
        )
        const names = cols.rows
            .map((r) => r.column_name)
            .filter((n) => !MST_TRT_SKIP_COLS.includes(n))
        if (names.length === 0) return []

        const ids: string[] = []
        for (const r of rows) {
            // Ghi đè 4 cột nhận dạng, các cột còn lại chép nguyên từ dòng nguồn.
            const select = names
                .map((n) => {
                    if (n === 'trt_cd') return '$2::int AS trt_cd'
                    if (n === 'trt_sb') return '$3::int AS trt_sb'
                    if (n === 'trt_nm') return '$4::text AS trt_nm'
                    if (n === 'cct_nm') return '$4::text AS cct_nm'
                    return `"${n}"`
                })
                .join(', ')
            const res = await c.query<{ id: string }>(
                `INSERT INTO mst_trt (${names.map((n) => `"${n}"`).join(', ')})
                 SELECT ${select}
                   FROM mst_trt
                  WHERE version_id = $1 AND trt_cd = $5 AND trt_sb = $6 AND deleted_at IS NULL
                  LIMIT 1
                 RETURNING id`,
                [versionId, r.trtCd, r.trtSb, r.trtNm, r.fromTrtCd, r.fromTrtSb],
            )
            if (res.rows[0]) ids.push(res.rows[0].id)
        }
        return ids
    })
}

/** Xoá HẲN các dòng mst_trt đã seed (theo id trả về từ seedMstTrtRows). */
export async function deleteMstTrtRows(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM mst_trt WHERE id = ANY($1::uuid[])', [ids])
        return r.rowCount ?? 0
    })
}

/** Số record 義歯管理 (chưa soft-delete) của một bệnh nhân. */
export async function countGisiKanri(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM gisi_kanri WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        return r.rows[0]?.n ?? 0
    })
}

/**
 * Xoá HẲN mọi record 義歯管理 của một bệnh nhân (dọn dữ liệu test). Hard delete
 * là cố ý: đây là dữ liệu do test tạo, không cần giữ lịch sử soft-delete. Trả về
 * số dòng đã xoá.
 */
export async function deleteGisiKanri(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM gisi_kanri WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

// ─── chiryo_kanri_r2 (歯科疾患管理 frm203021) ────────────────────────────────────
//
// Cùng mô hình với gisi_kanri ở trên: bảng có audit + soft-delete (deleted_at),
// đọc qua view_chiryo_kanri_r2_active. Khoá tự nhiên là (pat_no, print_dt) nên
// F8 登録 là upsert — chạy lại test chỉ đè lên chính dòng đó.

/** Một dòng 歯科疾患管理 ở mức cột mà test quan tâm. */
export interface ChiryoKanriR2Row {
    print_dt: string
    no: string | null
    tooth_cnt: number
    doc_type: number
    etc: string | null
    special_note: string | null
    /** se_1..se_32 — 永久歯, đã encode (present + 4 歯面) thành 1 số. */
    se: number[]
    /** sn_1..sn_20 — 乳歯. */
    sn: number[]
}

/** Số record 歯科疾患管理 (chưa soft-delete) của một bệnh nhân. */
export async function countChiryoKanriR2(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM chiryo_kanri_r2 WHERE pat_no = $1 AND deleted_at IS NULL',
            [patNo],
        )
        return r.rows[0]?.n ?? 0
    })
}

/**
 * Đọc record 歯科疾患管理 mới nhất (theo print_dt) của một bệnh nhân — dùng để
 * kiểm chính cái F8 vừa ghi, ở tầng DB chứ không qua UI.
 */
export async function latestChiryoKanriR2(patNo: number): Promise<ChiryoKanriR2Row | null> {
    const seCols = Array.from({ length: 32 }, (_, i) => `se_${i + 1}`).join(', ')
    const snCols = Array.from({ length: 20 }, (_, i) => `sn_${i + 1}`).join(', ')
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT print_dt, no, tooth_cnt, doc_type, etc, special_note, ${seCols}, ${snCols}
             FROM chiryo_kanri_r2
             WHERE pat_no = $1 AND deleted_at IS NULL
             ORDER BY print_dt DESC
             LIMIT 1`,
            [patNo],
        )
        const row = r.rows[0]
        if (!row) return null
        const printDt = row['print_dt']
        return {
            // pg trả DATE thành Date của JS — quy về ISO yyyy-MM-dd cho dễ so.
            print_dt:
                printDt instanceof Date
                    ? `${printDt.getFullYear()}-${String(printDt.getMonth() + 1).padStart(2, '0')}-${String(printDt.getDate()).padStart(2, '0')}`
                    : String(printDt),
            no: (row['no'] as string | null) ?? null,
            tooth_cnt: Number(row['tooth_cnt'] ?? 0),
            doc_type: Number(row['doc_type'] ?? 0),
            etc: (row['etc'] as string | null) ?? null,
            special_note: (row['special_note'] as string | null) ?? null,
            se: Array.from({ length: 32 }, (_, i) => Number(row[`se_${i + 1}`] ?? 0)),
            sn: Array.from({ length: 20 }, (_, i) => Number(row[`sn_${i + 1}`] ?? 0)),
        }
    })
}

/**
 * Xoá HẲN mọi record 歯科疾患管理 của một bệnh nhân (dọn dữ liệu test). Hard
 * delete là cố ý — dữ liệu do test tạo, không cần giữ lịch sử soft-delete.
 * frm203021 không có nút xoá nên UI không tự dọn được. Trả về số dòng đã xoá.
 */
export async function deleteChiryoKanriR2(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM chiryo_kanri_r2 WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

// ─── trn_trn 処置行 seed (cho các test cần lưới CÓ 処置 vào NGÀY xác định) ────────
//
// Một số test (vd 深夜(&S)) phải thao tác trên 処置行 CỦA NGÀY con trỏ. Trước đây
// chúng dựa vào việc bệnh nhân "tình cờ" có 処置 vào TEST_TRT_DT — dữ liệu thật
// không đảm bảo điều đó (bệnh nhân 11 chỉ có tới 2009-05), nên test đỏ oan.
//
// Giải pháp: test TỰ seed vài 処置行 vào một ngày mình sở hữu rồi dọn sau. Không
// tạo cả bệnh nhân (person/insurance) — chỉ dựa vào một bệnh nhân tham chiếu có
// sẵn (giống các helper gisi_kanri ở trên) và chèn 処置行 cho ngày đó.
//
// disp_no >= SEED_DISP_BASE là "vùng" của test: seed/cleanup chỉ đụng vùng này,
// không bao giờ chạm dữ liệu thật (disp_no thật nhỏ hơn nhiều).

/** Mốc disp_no dành riêng cho dữ liệu test — dọn theo mốc này để không đụng data thật. */
export const SEED_DISP_BASE = 9000

export interface SeedTrtRow {
    /** 処置コード (>0 để lưới coi là 処置行 / isTreatment). */
    trtCd: number
    trtSb?: number
    trtCnt?: number
    trtPt?: number
    /**
     * 自費フラグ — 0=保険 (mặc định), 1/2=自費, 3=介護.
     *
     * WinForm ModSave.SetKaigoFlg (modSave.cs:684-737) tự đóng dấu 3 cho mọi dòng
     * trt_cd 599 / trt_sb 0,1,>=10 NGAY TRƯỚC khi ghi, nên dữ liệu thật luôn mang
     * sẵn cờ này. Seed jihiFlg: 3 = dựng đúng trạng thái "dữ liệu đã lưu của một
     * ngày có 介護" mà màn hình phải đọc lại được (modSave.cs:2661/2723-2790).
     */
    jihiFlg?: number
    /**
     * 表示名 (cột `dsp_trt`) — CHÍNH là chuỗi lưới in ra ở cột 療法・処置
     * (treatment-table-mapper.ts:142/216 đọc thẳng `row.dspTrt`). Không truyền thì
     * cột NULL và dòng seed hiện ra KHÔNG CÓ TÊN → không locate được bằng text.
     */
    dspTrt?: string
    /**
     * 部位 32 ô (`bui_1..bui_32`) — mặc định toàn 0 (dòng không có 部位).
     *
     * Cần cho mọi testcase đụng 自歯状況変更: `ToothStatusChangeCalculator` phân
     * loại từng ô sau khi bóc tối đa hai mốc 100 — `1..9` = 永久歯 → `se_{i+1}`,
     * `11..19` = 乳歯 → `sn_{i-2}` (i<16) / `sn_{i-8}` (16≤i<29). Ô để 0 thì save
     * KHÔNG đụng gì tới `siga` và testcase im lặng pass sai.
     *
     * Bố cục 32 ô (tooth-bui.ts:25-34): 0-7 右上(8→1), 8-15 左上(1→8),
     * 16-23 右下(8→1), 24-31 左下(1→8). Truyền mảng ngắn thì phần thiếu = 0.
     */
    bui?: readonly number[]
    /**
     * Chuỗi 部位 hiển thị (`dsp_bui`) — lưới in thẳng cột 部位 từ cột này. Dữ liệu
     * thật chứa gaiji PUA (`formatBuiToDspBui`); seed để text thường là đủ để nhìn
     * và để locate, KHÔNG dùng nó vào bất kỳ assert parity nào.
     */
    dspBui?: string
    /**
     * `freewd` (WinForm cột lưới 72, modSave.cs:321) — cột nháp đa nghĩa.
     *
     * Cần cho ngữ cảnh cùng ngày của `getTensu`: với bệnh nhân `dis_flg = 3`, dòng
     * 歯科診療特別対応加算 (105/{0,1,2,3,6,7} hoặc 508/{0,1,6}) mang `freewd == "1"` thì
     * phân giải thành 歯科診療困難者加算1, khác 「1」 thì thành 加算2
     * (CommonChk.cs:109). KHÔNG truyền thì cột để '' — nghĩa là 加算2, đúng nhánh
     * người dùng bấm いいえ ở modSave.cs:3452.
     */
    freewd?: string
}

// trn_trn có nhiều cột NOT NULL không default (bui_1..32, dis_cd_1..10, dis_sb_1..10)
// nên INSERT phải liệt kê đủ — sinh danh sách + số 0 tự động cho gọn.
// bui_* TÁCH RIÊNG vì nay nhận giá trị từ tham số (xem SeedTrtRow.bui).
const BUI_COLS = Array.from({ length: 32 }, (_, i) => `bui_${i + 1}`)
const ZERO_COLS = [
    ...Array.from({ length: 10 }, (_, i) => `dis_cd_${i + 1}`),
    ...Array.from({ length: 10 }, (_, i) => `dis_sb_${i + 1}`),
]

/**
 * Seed các 処置行 test cho (patNo, trtDt) trong vùng disp_no >= SEED_DISP_BASE.
 * Idempotent: xoá vùng test của ngày đó trước khi chèn. (pat_br, insu_cd) được kế
 * thừa từ một dòng THẬT của bệnh nhân để hợp lệ hiển thị/khoá ngoại.
 */
export async function seedTreatmentRows(
    patNo: number,
    trtDt: string,
    rows: SeedTrtRow[],
): Promise<void> {
    const zeroList = ZERO_COLS.join(', ')
    const zeroVals = ZERO_COLS.map(() => '0').join(', ')
    const buiList = BUI_COLS.join(', ')
    // bui_1..bui_32 chiếm $10..$41 (9 tham số đầu đã dùng cho khoá + cột 処置).
    const buiVals = BUI_COLS.map((_, k) => `$${10 + k}::int`).join(', ')
    await withDb(async (c) => {
        await c.query(
            `DELETE FROM trn_trn WHERE pat_no = $1 AND trt_dt = $2 AND disp_no >= ${SEED_DISP_BASE}`,
            [patNo, trtDt],
        )
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i]!
            const bui = Array.from({ length: 32 }, (_, k) => r.bui?.[k] ?? 0)
            await c.query(
                `INSERT INTO trn_trn (
                     pat_no, pat_br, insu_cd, trt_dt, disp_no, ${zeroList}, ${buiList},
                     trt_cd, trt_sb, trt_cnt, trt_pt, isl, price, jihi_flg, dr_no, syosin_flg,
                     dsp_trt, dsp_bui, freewd
                 )
                 SELECT pat_no, pat_br, insu_cd, $2::date, $3, ${zeroVals}, ${buiVals},
                        $4, $5, $6, $7, 0, $7, $8, 1, 3,
                        $9::text, $42::text, $43::text
                 FROM trn_trn
                 WHERE pat_no = $1 AND disp_no < ${SEED_DISP_BASE}
                 ORDER BY trt_dt DESC
                 LIMIT 1`,
                [
                    patNo,
                    trtDt,
                    SEED_DISP_BASE + 1 + i,
                    r.trtCd,
                    r.trtSb ?? 0,
                    r.trtCnt ?? 1,
                    r.trtPt ?? 40,
                    r.jihiFlg ?? 0,
                    r.dspTrt ?? null,
                    ...bui,
                    // dsp_bui là NOT NULL DEFAULT '' — truyền null sẽ vỡ INSERT.
                    r.dspBui ?? '',
                    // freewd cũng NOT NULL DEFAULT '' (TrnTrnConfiguration.cs).
                    r.freewd ?? '',
                ],
            )
        }
    })
}

/** Một 処置行 ĐÃ LƯU, ở mức cột cần để chẩn đoán "payload có mang 部位 không". */
export interface SavedTrtRow {
    trtCd: number
    trtSb: number
    dspTrt: string | null
    dspBui: string | null
    /** bui_1..bui_32 (index 0 = bui_1). */
    bui: number[]
}

/**
 * Các 処置行 CÒN SỐNG của (patNo, trtDt, trtCd) — đọc lại CHÍNH thứ F9 vừa ghi.
 *
 * Vì sao cần: một dòng nhập qua UI KHÔNG tự có 部位 — nó THỪA KẾ từ 部位病名行 đứng
 * trên nó trong cùng ngày (`buildSaveRowsIndexed`, treatment-grid-rows.ts:502).
 * Nếu việc thừa kế đó hỏng thì payload đi lên với `bui` toàn 0 và BE đúng ra không
 * được đụng `siga` — lúc ấy testcase phải báo "harness hỏng", KHÔNG được báo "BE
 * thiếu chức năng". Hàm này cho testcase phân biệt được hai chuyện đó.
 */
export async function findTreatmentRows(
    patNo: number,
    trtDt: string,
    trtCd: number,
): Promise<SavedTrtRow[]> {
    const buiCols = Array.from({ length: 32 }, (_, i) => `bui_${i + 1}`)
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT trt_cd, trt_sb, dsp_trt, dsp_bui, ${buiCols.join(', ')}
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND trt_cd = $3 AND deleted_at IS NULL
              ORDER BY disp_no`,
            [patNo, trtDt, trtCd],
        )
        return r.rows.map((row) => ({
            trtCd: Number(row['trt_cd'] ?? 0),
            trtSb: Number(row['trt_sb'] ?? 0),
            dspTrt: (row['dsp_trt'] as string | null) ?? null,
            dspBui: (row['dsp_bui'] as string | null) ?? null,
            bui: buiCols.map((k) => Number(row[k] ?? 0)),
        }))
    })
}

/** Số 処置行 THẬT (ngoài vùng seed) của một tháng — `trtDt` là ngày bất kỳ trong tháng. */
export async function countRealTreatmentRowsInMonth(
    patNo: number,
    trtDt: string,
): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM trn_trn
              WHERE pat_no = $1
                AND date_trunc('month', trt_dt) = date_trunc('month', $2::date)
                AND disp_no < ${SEED_DISP_BASE}
                AND deleted_at IS NULL`,
            [patNo, trtDt],
        )
        return r.rows[0]?.n ?? 0
    })
}

// ─── siga (歯式 / 口腔内情報) ────────────────────────────────────────────────
//
// Bảng 1 dòng / bệnh nhân (`ux_siga_active` trên pat_no, lọc deleted_at IS NULL),
// đọc qua `view_siga_active`. Đây là nơi DUY NHẤT lưu 自歯状況, và đường ghi duy
// nhất của app là F9 登録 → `SaveTreatmentsHandler` → `ToothStatusChangeCalculator`
// (Revert các dòng bị xoá rồi Apply các dòng hiện tại). Không có endpoint ghi
// siga nào khác ⇒ muốn dựng/khôi phục trạng thái răng thì phải đi thẳng DB.
//
// MIỀN GIÁ TRỊ (ToothConditionChecker.cs:20-23 — khớp CommonChk.chkSiga:497-580):
//   se_1..se_32  永久歯 : 0=生活歯, 1/2/3=失活歯(2=半歯欠損), 4=欠損歯   (DEFAULT 0)
//   sn_1..sn_20  乳歯   : 5=生活歯, 6/7/8=失活歯(7=半歯欠損), 9=欠損歯   (DEFAULT 5)
// Lưu ý 生活歯 của 乳歯 là **5**, KHÔNG phải 0 — đây chính là chỗ bug đang bị soi.

/** Một dòng `siga`, tách sẵn thành 2 mảng theo thứ tự cột. */
export interface SigaSnapshot {
    /** se_1..se_32 (index 0 = se_1). */
    se: number[]
    /** sn_1..sn_20 (index 0 = sn_1). */
    sn: number[]
}

const SE_COLS = Array.from({ length: 32 }, (_, i) => `se_${i + 1}`)
const SN_COLS = Array.from({ length: 20 }, (_, i) => `sn_${i + 1}`)

/** Đọc 歯式 hiện tại; `null` khi bệnh nhân chưa có dòng siga nào. */
export async function readSiga(patNo: number): Promise<SigaSnapshot | null> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT ${SE_COLS.join(', ')}, ${SN_COLS.join(', ')}
               FROM siga
              WHERE pat_no = $1 AND deleted_at IS NULL
              LIMIT 1`,
            [patNo],
        )
        const row = r.rows[0]
        if (!row) return null
        return {
            se: SE_COLS.map((k) => Number(row[k] ?? 0)),
            sn: SN_COLS.map((k) => Number(row[k] ?? 0)),
        }
    })
}

/**
 * Bảo đảm bệnh nhân CÓ dòng siga (app tạo dòng này lúc 患者登録 —
 * `RegisterPatientHandler.cs:204` — nên dữ liệu cũ có thể thiếu).
 * Trả về `true` khi vừa TẠO mới ⇒ testcase nhớ xoá lại ở afterAll.
 */
export async function ensureSigaRow(patNo: number): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query(
            `INSERT INTO siga (pat_no)
             SELECT $1
              WHERE NOT EXISTS (
                    SELECT 1 FROM siga WHERE pat_no = $1 AND deleted_at IS NULL)`,
            [patNo],
        )
        return (r.rowCount ?? 0) > 0
    })
}

/** Xoá HẲN dòng siga của bệnh nhân — chỉ dùng để dọn dòng do test tự tạo. */
export async function deleteSigaRow(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM siga WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

/**
 * Ghi đè MỘT SỐ răng. Key là số cột 1-based (`{ se: { 11: 0 }, sn: { 4: 5 } }`
 * ⇒ `se_11 = 0, sn_4 = 5`). Chỉ nhận số nguyên để không ghép chuỗi vào SQL.
 */
export async function writeSigaTeeth(
    patNo: number,
    patch: { se?: Record<number, number>; sn?: Record<number, number> },
): Promise<void> {
    const sets: string[] = []
    const values: number[] = []
    for (const [prefix, cols, max] of [
        ['se', patch.se, 32],
        ['sn', patch.sn, 20],
    ] as const) {
        for (const [col, val] of Object.entries(cols ?? {})) {
            const n = Number(col)
            if (!Number.isInteger(n) || n < 1 || n > max) {
                throw new Error(`writeSigaTeeth: cột ${prefix}_${col} ngoài phạm vi 1..${max}`)
            }
            if (!Number.isInteger(val)) {
                throw new Error(`writeSigaTeeth: giá trị ${prefix}_${n} phải là số nguyên`)
            }
            values.push(val)
            sets.push(`${prefix}_${n} = $${values.length + 1}`)
        }
    }
    if (sets.length === 0) return
    await withDb(async (c) => {
        await c.query(
            `UPDATE siga SET ${sets.join(', ')} WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo, ...values],
        )
    })
}

/** Ghi lại TOÀN BỘ 52 cột từ một snapshot — dùng ở afterAll để trả nguyên trạng. */
export async function restoreSiga(patNo: number, snap: SigaSnapshot): Promise<void> {
    const sets = [
        ...SE_COLS.map((k, i) => `${k} = $${i + 2}`),
        ...SN_COLS.map((k, i) => `${k} = $${i + 34}`),
    ]
    await withDb(async (c) => {
        await c.query(
            `UPDATE siga SET ${sets.join(', ')} WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo, ...snap.se, ...snap.sn],
        )
    })
}

/**
 * Dọn 処置行 test theo `dsp_trt` — CẦN cho mọi spec có bấm F9 登録.
 *
 * `deleteTreatmentRows` dọn theo vùng `disp_no >= SEED_DISP_BASE`, nhưng ngay khi
 * spec bấm F9 một lần thì `bulk-save` xoá mềm dòng seed rồi CHÈN LẠI với `disp_no`
 * đánh số từ 1 (`SaveTreatmentsHandler.cs:175-196`) ⇒ bản mới rơi ra ngoài vùng
 * test và cleanup theo disp_no hụt, để lại dòng rác mang dáng dữ liệu thật.
 *
 * Vì thế dọn thêm theo (pat_no, trt_dt, trt_cd, dsp_trt) — hẹp đúng bằng chữ ký
 * dòng mà spec tự dựng. Xoá HẲN, kể cả bản đã soft-delete.
 */
export async function deleteTreatmentRowsByDspTrt(
    patNo: number,
    trtDt: string,
    trtCd: number,
    dspTrts: readonly string[],
): Promise<number> {
    if (dspTrts.length === 0) return 0
    return withDb(async (c) => {
        const r = await c.query(
            `DELETE FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND trt_cd = $3 AND dsp_trt = ANY($4::text[])`,
            [patNo, trtDt, trtCd, dspTrts],
        )
        return r.rowCount ?? 0
    })
}

/**
 * Dọn mọi dòng của (patNo, trtDt) mang ĐÚNG một ô 部位 — bắt cả những dòng do
 * CHÍNH APP đẻ ra quanh dòng seed.
 *
 * BẪY ĐÃ VẤP: xoá dòng 処置 rồi F9 vẫn còn sót lại **部位病名行** (`trt_cd = 0`,
 * `dsp_trt = ''`, `trt_pt = 0`) — mapper thăng dòng có 部位 lên làm header nhóm và
 * bản port LƯU nó xuống `trn_trn` (WinForm thì không: modSave.cs:237 chỉ ghi
 * `linekbn == "2"`). Dọn theo `dsp_trt` không tóm được nó vì tên rỗng.
 *
 * `buiCol` là số cột 1-based (`bui_11` ⇒ 11). Chỉ nhận số nguyên trong 1..32 để
 * không ghép chuỗi tuỳ ý vào SQL. Xoá HẲN, kể cả bản đã soft-delete.
 */
export async function deleteTreatmentRowsByBui(
    patNo: number,
    trtDt: string,
    buiCol: number,
    buiVal: number,
): Promise<number> {
    if (!Number.isInteger(buiCol) || buiCol < 1 || buiCol > 32) {
        throw new Error(`deleteTreatmentRowsByBui: bui_${buiCol} ngoài phạm vi 1..32`)
    }
    return withDb(async (c) => {
        const r = await c.query(
            `DELETE FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND bui_${buiCol} = $3`,
            [patNo, trtDt, buiVal],
        )
        return r.rowCount ?? 0
    })
}

/**
 * Dọn MỌI dòng của (patNo, trtDt) mang một 処置コード — kể cả bản đã soft-delete.
 *
 * Cần cho spec NHẬP 処置 QUA UI: dòng do app tạo mang `dsp_trt` của master (vd
 * 「ＷＺ(歯冠大)」) chứ không phải tên spec tự đặt, nên `deleteTreatmentRowsByDspTrt`
 * không tóm được; và nếu việc thừa kế 部位 hỏng thì `deleteTreatmentRowsByBui`
 * cũng trượt (bui toàn 0). Đây là lưới cuối để không bỏ sót rác.
 *
 * ⚠️ Xoá theo MÃ nên nó cũng cuốn theo dòng THẬT cùng mã trong ĐÚNG ngày đó. Chỉ
 * dùng với mã mà spec đang dựng, và chỉ ở ngày test — `countRealTreatmentRowsInMonth`
 * ở beforeAll đã cảnh báo trước nếu tháng đó có dữ liệu thật.
 */
export async function deleteTreatmentRowsByTrtCd(
    patNo: number,
    trtDt: string,
    trtCd: number,
): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query(
            'DELETE FROM trn_trn WHERE pat_no = $1 AND trt_dt = $2 AND trt_cd = $3',
            [patNo, trtDt, trtCd],
        )
        return r.rowCount ?? 0
    })
}

/** Dọn các 処置行 test đã seed cho (patNo, trtDt). Trả về số dòng đã xoá. */
export async function deleteTreatmentRows(patNo: number, trtDt: string): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query(
            `DELETE FROM trn_trn WHERE pat_no = $1 AND trt_dt = $2 AND disp_no >= ${SEED_DISP_BASE}`,
            [patNo, trtDt],
        )
        return r.rowCount ?? 0
    })
}

// ─── care_insurance (介護保険) — dựng lại CareIns.getCareInsRate ở tầng DB ──────
//
// Dùng cho spec 介護保険一部負担金行: số tiền dòng xám 【介護保険一部負担金 n円】 =
// careScore × 10 × careRate / 100, mà careRate lấy từ
// COMMON/DBAccess/CareInsurance.cs:227 getCareInsRate. Test phải tự tính kỳ vọng
// ở tầng DB — không thể hỏi app, vì đó chính là thứ đang thiếu.

/** Kết quả dò 利用者負担割合: `rate` = null nghĩa là KHÔNG kết luận được. */
export interface CareInsRate {
    /** % (10/20/30…), 0 hợp lệ, null = không xác định được → test bỏ qua assert số tiền. */
    rate: number | null
    /** Nguồn đã dùng — in ra log để người đọc biết con số kỳ vọng ở đâu ra. */
    source: string
}

/** So sánh ngày theo yyyy-mm-dd (WinForm so bằng chuỗi — CareInsurance.cs:236). */
function isoDay(v: unknown): string {
    if (v instanceof Date) {
        return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
    }
    return v == null ? '' : String(v).slice(0, 10)
}

/**
 * 利用者負担割合 áp dụng cho (patNo, onDate) — port của `CareIns.getCareInsRate`
 * (CareInsurance.cs:227-266) + `calcCareInsData` (:197-217):
 *
 *  1. Lấy bản 認定 CUỐI CÙNG có `care_st_dt <= onDate` (dừng ở bản đầu tiên trễ hơn).
 *  2. Bản đó có 公費 (`pubexp_def_no` khác rỗng) → dò `acc_rate_1/2` theo cửa sổ
 *     `acc_rate_st_dt_i … acc_rate_ed_dt_i`.
 *  3. Không ra → dò ngược từ bản mới nhất, `bur_rate_1/2` theo cửa sổ của nó.
 *  4. Vẫn không ra → fallback của MỌI call-site WinForm: `INSURE.acc_rate == 0 ? 0 : 10`.
 *     Ở đây không dựng lại `GetValidSubCode2` (chọn 枝番 hợp lệ theo ngày) nên chỉ
 *     kết luận khi TẤT CẢ 枝番 của bệnh nhân cùng phía: toàn 0 → 0, toàn khác 0 → 10.
 *     Lẫn lộn → trả null (không đoán).
 *
 * Lưu ý `care_ed_dt` KHÔNG được xét — đúng như bản gốc (認定 hết hạn vẫn ra rate).
 */
export async function careInsRateFor(patNo: number, onDate: string): Promise<CareInsRate> {
    return withDb(async (c) => {
        const d = onDate.slice(0, 10)
        const care = await c.query<Record<string, unknown>>(
            `SELECT care_no, care_st_dt, pubexp_def_no,
                    bur_rate_1, bur_rate_st_dt_1, bur_rate_ed_dt_1,
                    bur_rate_2, bur_rate_st_dt_2, bur_rate_ed_dt_2,
                    acc_rate_1, acc_rate_st_dt_1, acc_rate_ed_dt_1,
                    acc_rate_2, acc_rate_st_dt_2, acc_rate_ed_dt_2
               FROM care_insurance
              WHERE pat_no = $1 AND deleted_at IS NULL
              ORDER BY care_no`,
            [patNo],
        )

        // (1) bản 認定 hiệu lực — dừng ở bản đầu tiên có care_st_dt > onDate.
        let effective: Record<string, unknown> | null = null
        for (const row of care.rows) {
            const st = isoDay(row['care_st_dt'])
            if (st === '') continue
            if (st > d) break
            effective = row
        }

        const inWindow = (row: Record<string, unknown>, kind: 'bur' | 'acc', i: 1 | 2) => {
            const v = row[`${kind}_rate_${i}`]
            if (v == null || String(v).trim() === '') return null
            const st = isoDay(row[`${kind}_rate_st_dt_${i}`])
            const ed = isoDay(row[`${kind}_rate_ed_dt_${i}`])
            if (st === '' || ed === '') return null
            return st <= d && d <= ed ? Number(v) : null
        }

        // (2) 公費 → acc_rate.
        if (effective && String(effective['pubexp_def_no'] ?? '').trim() !== '') {
            for (const i of [1, 2] as const) {
                const r = inWindow(effective, 'acc', i)
                if (r != null) {
                    return { rate: r, source: `care_insurance.acc_rate_${i} (公費, care_no=${String(effective['care_no'])})` }
                }
            }
        }

        // (3) bur_rate, dò ngược từ bản mới nhất.
        for (let k = care.rows.length - 1; k >= 0; k--) {
            const row = care.rows[k]!
            for (const i of [1, 2] as const) {
                const r = inWindow(row, 'bur', i)
                if (r != null) {
                    return { rate: r, source: `care_insurance.bur_rate_${i} (care_no=${String(row['care_no'])})` }
                }
            }
        }

        // (4) fallback INSURE.acc_rate.
        const ins = await c.query<{ acc_rate: number }>(
            'SELECT DISTINCT acc_rate FROM insurance WHERE pat_no = $1',
            [patNo],
        )
        const rates = ins.rows.map((r) => Number(r.acc_rate))
        if (rates.length === 0) return { rate: null, source: 'không có dòng insurance nào' }
        if (rates.every((r) => r === 0)) return { rate: 0, source: 'fallback INSURE.acc_rate = 0' }
        if (rates.every((r) => r !== 0)) {
            return { rate: 10, source: `fallback INSURE.acc_rate != 0 → 10% (acc_rate: ${rates.join('/')})` }
        }
        return {
            rate: null,
            source: `INSURE.acc_rate lẫn 0 và khác 0 (${rates.join('/')}) — cần GetValidSubCode2 mới chốt được`,
        }
    })
}

/**
 * Tổng 点数 (Σ trt_pt × trt_cnt) đã LƯU của một ngày, lọc theo `jihi_flg`.
 *
 * `{ eq: 3 }` = phần 介護 — thứ PHẢI nằm NGOÀI 日計 và chỉ hiện ở dòng
 * 【介護保険一部負担金】; `{ not: 3 }` = phần còn lại, thứ 日計 được phép cộng
 * (modAcc.DispDayPoint chỉ cộng insPayDatas — modAcc.cs:132-212).
 */
export async function dayScoreByJihiFlg(
    patNo: number,
    trtDt: string,
    filter: { eq: number } | { not: number },
): Promise<number> {
    const [cond, value] = 'eq' in filter ? ['jihi_flg = $3', filter.eq] : ['jihi_flg <> $3', filter.not]
    return withDb(async (c) => {
        const r = await c.query<{ n: string | null }>(
            `SELECT COALESCE(SUM(trt_pt * trt_cnt), 0)::text AS n
               FROM trn_trn
              WHERE pat_no = $1 AND trt_dt = $2 AND ${cond} AND deleted_at IS NULL`,
            [patNo, trtDt, value],
        )
        return Number(r.rows[0]?.n ?? 0)
    })
}

// ─── rx_sharing_view_history (電子カルテ情報共有サービス frm201045) ──────────────
//
// Bảng legacy (SIM2025), KHÔNG có audit/soft-delete kiểu ITenantAudited: xoá mềm
// chính là cột `delete_date`, và cột này NẰM TRONG KHOÁ CHÍNH
// (pat_no, if_id, req_dt, delete_date). Sentinel "chưa xoá" = 1900-01-01.
//
// Bảng thường RỖNG ở môi trường dev (chỉ có dữ liệu khi đã gọi OQS thật), nên
// mọi testcase soi lưới/削除/PDF đều phải TỰ seed rồi tự dọn.
//
// `pat_no` là VARCHAR(20) (không phải int như hầu hết bảng khác) — truyền chuỗi.

/** Sentinel WinForm dùng cho "chưa xoá" (ComConst.DATETIME_MINVALUE_DB). */
export const RX_SHARING_DELETE_SENTINEL = '1900-01-01T00:00:00.000Z'

export interface RxSharingSeedRow {
    /** OQS_IF_ID: '21' 薬剤情報 / '23' 特定健診 / '31' 臨床情報 (khác = không thuộc tab nào). */
    ifId: string
    reqDt: Date
    /** 取得期間 開始 — WinForm InsertRecord ép về NGÀY ĐẦU THÁNG. */
    startDate: string
    endDate: string
    /** null = chưa xoá (ghi sentinel 1900-01-01). */
    deleteDate?: Date | null
    /** Nội dung PDF; rỗng = đã bị xoá (WinForm set PDF = NULL, cột PG là NOT NULL). */
    pdf?: Buffer
}

export interface RxSharingRow {
    if_id: string
    req_dt: Date
    start_date: Date
    end_date: Date
    delete_date: Date
    pdf_len: number
}

/** PDF tối thiểu để iframe preview có cái mà tải — nội dung KHÔNG được assert. */
export const MINIMAL_PDF = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
        'trailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1',
)

/**
 * Seed các dòng 閲覧履歴 cho một bệnh nhân. Idempotent theo (pat_no, if_id,
 * req_dt): xoá mọi biến thể delete_date của đúng các khoá sắp chèn rồi mới chèn,
 * nên chạy lại test sau khi F8 削除 đã đổi delete_date vẫn sạch.
 */
export async function seedRxSharingViewHistory(
    patNo: string,
    rows: RxSharingSeedRow[],
): Promise<void> {
    await withDb(async (c) => {
        for (const r of rows) {
            await c.query(
                'DELETE FROM rx_sharing_view_history WHERE pat_no = $1 AND if_id = $2 AND req_dt = $3',
                [patNo, r.ifId, r.reqDt],
            )
            await c.query(
                `INSERT INTO rx_sharing_view_history
                     (pat_no, if_id, req_dt, delete_date, start_date, end_date, pdf)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    patNo,
                    r.ifId,
                    r.reqDt,
                    r.deleteDate ?? RX_SHARING_DELETE_SENTINEL,
                    r.startDate,
                    r.endDate,
                    r.pdf ?? MINIMAL_PDF,
                ],
            )
        }
    })
}

/** Mọi dòng 閲覧履歴 của bệnh nhân, req_dt giảm dần (đúng thứ tự GetRecords). */
export async function listRxSharingViewHistory(patNo: string): Promise<RxSharingRow[]> {
    return withDb(async (c) => {
        const r = await c.query<RxSharingRow>(
            `SELECT if_id, req_dt, start_date, end_date, delete_date,
                    length(pdf)::int AS pdf_len
             FROM rx_sharing_view_history
             WHERE pat_no = $1
             ORDER BY req_dt DESC`,
            [patNo],
        )
        return r.rows
    })
}

/**
 * Dọn các dòng test theo ĐÚNG danh sách req_dt đã seed (mọi delete_date của
 * chúng). Không xoá theo pat_no để tránh chạm dữ liệu OQS thật nếu có.
 */
export async function deleteRxSharingViewHistory(
    patNo: string,
    reqDts: Date[],
): Promise<number> {
    if (reqDts.length === 0) return 0
    return withDb(async (c) => {
        const r = await c.query(
            'DELETE FROM rx_sharing_view_history WHERE pat_no = $1 AND req_dt = ANY($2::timestamptz[])',
            [patNo, reqDts],
        )
        return r.rowCount ?? 0
    })
}

// ─── kon (根数) ───────────────────────────────────────────────────────────────
//
// Anh em song sinh của `siga`: 1 dòng / bệnh nhân (`ux_kon_active` trên pat_no,
// lọc deleted_at IS NULL), `ekon_1..ekon_32` (永久歯) + `nkon_1..nkon_20` (乳歯),
// TẤT CẢ đều nullable smallint (schema.sql:3576 — KHÁC `siga` vốn NOT NULL có
// DEFAULT). "Chưa đặt" = NULL, và đó là lý do `readKon` giữ nguyên `null` thay vì
// quy về 0: 0 root ≠ chưa biết số root.
//
// Ai ghi cột này (WinForm):
//   · frm203016.cs:1144-1163 `SigaChg` case 122/3 — ＥＭＲ(４根) ⇒ `EKon{i+1} = 4`
//     ngay lúc CHỐT 処置 (input-time);
//   · modSave.cs:770-808 `SigaChg_Save` case 122/3 — ghi LẠI đúng thế ở F9;
//   · modSave.cs:906-972 case 179/5 分割抜歯 — `EKon{i+1} = 残根数` (hFG1[74]);
//   · modSave.cs:4714-4743 `Restore_Kon` — trả toàn bộ 52 cột về snapshot khi
//     người dùng chọn 「いいえ」 ở dirty gate.
// Bản port mới chỉ có nhánh 179/5 (`ToothStatusChangeCalculator.ApplyKon`).

/** Một dòng `kon`. `null` = cột đang NULL (chưa đặt), KHÁC hẳn 0. */
export interface KonSnapshot {
    /** ekon_1..ekon_32 (index 0 = ekon_1). */
    ekon: (number | null)[]
    /** nkon_1..nkon_20 (index 0 = nkon_1). */
    nkon: (number | null)[]
}

const EKON_COLS = Array.from({ length: 32 }, (_, i) => `ekon_${i + 1}`)
const NKON_COLS = Array.from({ length: 20 }, (_, i) => `nkon_${i + 1}`)

/** Đọc 根数 hiện tại; `null` khi bệnh nhân chưa có dòng kon nào. */
export async function readKon(patNo: number): Promise<KonSnapshot | null> {
    return withDb(async (c) => {
        const r = await c.query<Record<string, unknown>>(
            `SELECT ${EKON_COLS.join(', ')}, ${NKON_COLS.join(', ')}
               FROM kon
              WHERE pat_no = $1 AND deleted_at IS NULL
              LIMIT 1`,
            [patNo],
        )
        const row = r.rows[0]
        if (!row) return null
        const pick = (k: string) => (row[k] == null ? null : Number(row[k]))
        return { ekon: EKON_COLS.map(pick), nkon: NKON_COLS.map(pick) }
    })
}

/**
 * Bảo đảm bệnh nhân CÓ dòng kon. Trả `true` khi vừa TẠO mới ⇒ afterAll nhớ xoá.
 *
 * Lưu ý: KHÁC `siga`, `RegisterPatientHandler` KHÔNG tạo dòng `kon` lúc 患者登録
 * (grep `Kons.Add` = 0 hit) — nên với đa số bệnh nhân hàm này sẽ trả `true`.
 */
export async function ensureKonRow(patNo: number): Promise<boolean> {
    return withDb(async (c) => {
        const r = await c.query(
            `INSERT INTO kon (pat_no)
             SELECT $1
              WHERE NOT EXISTS (
                    SELECT 1 FROM kon WHERE pat_no = $1 AND deleted_at IS NULL)`,
            [patNo],
        )
        return (r.rowCount ?? 0) > 0
    })
}

/** Xoá HẲN dòng kon của bệnh nhân — chỉ dùng để dọn dòng do test tự tạo. */
export async function deleteKonRow(patNo: number): Promise<number> {
    return withDb(async (c) => {
        const r = await c.query('DELETE FROM kon WHERE pat_no = $1', [patNo])
        return r.rowCount ?? 0
    })
}

/**
 * Ghi đè MỘT SỐ cột 根数. Key là số cột 1-based
 * (`{ ekon: { 11: null } }` ⇒ `ekon_11 = NULL`). `null` là giá trị HỢP LỆ và
 * chính là cách dựng trạng thái xuất phát "chưa đặt 根数".
 */
export async function writeKonTeeth(
    patNo: number,
    patch: { ekon?: Record<number, number | null>; nkon?: Record<number, number | null> },
): Promise<void> {
    const sets: string[] = []
    const values: (number | null)[] = []
    for (const [prefix, cols, max] of [
        ['ekon', patch.ekon, 32],
        ['nkon', patch.nkon, 20],
    ] as const) {
        for (const [col, val] of Object.entries(cols ?? {})) {
            const n = Number(col)
            if (!Number.isInteger(n) || n < 1 || n > max) {
                throw new Error(`writeKonTeeth: cột ${prefix}_${col} ngoài phạm vi 1..${max}`)
            }
            if (val !== null && !Number.isInteger(val)) {
                throw new Error(`writeKonTeeth: giá trị ${prefix}_${n} phải là số nguyên hoặc null`)
            }
            values.push(val)
            sets.push(`${prefix}_${n} = $${values.length + 1}::smallint`)
        }
    }
    if (sets.length === 0) return
    await withDb(async (c) => {
        await c.query(
            `UPDATE kon SET ${sets.join(', ')} WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo, ...values],
        )
    })
}

/** Ghi lại TOÀN BỘ 52 cột từ một snapshot — dùng ở afterAll để trả nguyên trạng. */
export async function restoreKon(patNo: number, snap: KonSnapshot): Promise<void> {
    const sets = [
        ...EKON_COLS.map((k, i) => `${k} = $${i + 2}::smallint`),
        ...NKON_COLS.map((k, i) => `${k} = $${i + 34}::smallint`),
    ]
    await withDb(async (c) => {
        await c.query(
            `UPDATE kon SET ${sets.join(', ')} WHERE pat_no = $1 AND deleted_at IS NULL`,
            [patNo, ...snap.ekon, ...snap.nkon],
        )
    })
}

// ─── trt_state (tiến trình STEP của bệnh nhân) ───────────────────────────────
//
// Bảng CHUẨN HOÁ: mỗi ô một dòng `(pat_no, bui_idx, pos_idx, value)`, ô = 0 thì
// KHÔNG có dòng (SaveGridAsync bỏ qua ô 0, GetAsync mặc định ô thiếu là 0). Vì
// vậy đọc phải dựng lại vector 32 ô chứ không `SELECT *` rồi đếm.

/** MouthConstants.AdultBuiCount — số 部位 của một 種別. */
export const TRT_STATE_POS_COUNT = 32

/** Vector 32 ô của một 種別 (bui_idx 1..15); ô không có dòng = 0. */
export async function readTrtStateRow(patNo: number, buiIdx: number): Promise<number[]> {
    return withDb(async (c) => {
        const r = await c.query<{ pos_idx: number; value: number }>(
            `SELECT pos_idx, value
               FROM view_trt_state_active
              WHERE pat_no = $1 AND bui_idx = $2`,
            [patNo, buiIdx],
        )
        const row = Array<number>(TRT_STATE_POS_COUNT).fill(0)
        for (const x of r.rows) {
            const i = Number(x.pos_idx) - 1
            if (i >= 0 && i < TRT_STATE_POS_COUNT) row[i] = Number(x.value)
        }
        return row
    })
}

/**
 * Ghi giá trị cho MỘT SỐ ô của một 種別 — dùng ở `afterAll` để trả lại nguyên
 * trạng những ô mà spec đã sửa qua UI.
 *
 * Bắt chước `TrtStateCommands.SaveGridAsync`: ô đã có dòng thì UPDATE (kể cả về
 * 0 — BE cũng để lại dòng value=0 chứ không xoá), ô chưa có dòng và giá trị khác
 * 0 thì INSERT. KHÔNG xoá dòng nào, nên không làm mất `id`/`created_at` của dữ
 * liệu có sẵn.
 */
export async function writeTrtStateCells(
    patNo: number,
    buiIdx: number,
    cells: ReadonlyArray<{ posIdx: number; value: number }>,
): Promise<number> {
    if (cells.length === 0) return 0
    return withDb(async (c) => {
        let n = 0
        for (const cell of cells) {
            const upd = await c.query(
                `UPDATE trt_state SET value = $4, updated_at = now()
                  WHERE pat_no = $1 AND bui_idx = $2 AND pos_idx = $3 AND deleted_at IS NULL`,
                [patNo, buiIdx, cell.posIdx, cell.value],
            )
            if ((upd.rowCount ?? 0) > 0) {
                n += upd.rowCount ?? 0
                continue
            }
            if (cell.value === 0) continue
            const ins = await c.query(
                `INSERT INTO trt_state (pat_no, bui_idx, pos_idx, value) VALUES ($1, $2, $3, $4)`,
                [patNo, buiIdx, cell.posIdx, cell.value],
            )
            n += ins.rowCount ?? 0
        }
        return n
    })
}

// ─── ガイド STEP (pac_nam + pag_trt + pac_tbl) — seed tạm ─────────────────────
//
// Vì sao cần: mắt xích 「số gõ trong Ｓｔｅｐ編集 → danh sách Shift+F4」 chỉ quan
// sát được từ ngoài khi có ÍT NHẤT HAI ガイド STEP hiện được, với `pac_step` khác
// nhau. Master thật của tenant chỉ có một dòng trong dải STEP, lại thêm nhánh
// fallback (`GuidQueries.ListStepAsync` :139-160, port modGuid1.cs:134-138 — lọc
// ra rỗng thì BỎ lọc và trả cả dải) nên MỌI giá trị đều cho cùng một danh sách:
// không kết luận được gì. Seed hai ガイド là cách duy nhất dựng được trạng thái
// phân biệt được.
//
// Một ガイド STEP 「hiện được」 phải đủ BA bảng (ListStepAsync):
//   pac_nam   guid_cd ∈ [1000,1999] + pac_step_01 = mã bước dẫn TỚI nó
//   pag_trt   ≥ 1 dòng            → thoả `EXISTS view_pag_trt_active`
//   pac_tbl   1 dòng dis_cd       → thoả điều kiện phạm vi 病名
//
// dis_cd của pac_tbl để 9999 (`PacGuideCodeRange.UniversalDisCdWildcard`):
// `BuildDisPredicate` luôn nối 9999 vào danh sách 病名 nên ガイド seed hiện với
// MỌI 病名 — spec khỏi phụ thuộc hồ sơ test có đúng 病名 nào.
//
// LUÔN dọn bằng `deleteStepGuides()` ở afterAll. Nếu một lần chạy bị kill giữa
// chừng thì dòng seed còn lại; dọn tay:
//   DELETE FROM t_tenant1.pac_nam WHERE guid_cd BETWEEN 1900 AND 1999;
//   DELETE FROM t_tenant1.pag_trt WHERE guid_cd BETWEEN 1900 AND 1999;
//   DELETE FROM t_tenant1.pac_tbl WHERE guid_cd BETWEEN 1900 AND 1999;

/** Dải guid_cd dành riêng cho ガイド seed — nằm cuối dải STEP để né master thật. */
export const SEED_STEP_GUID_MIN = 1900
export const SEED_STEP_GUID_MAX = 1999

export interface SeedStepGuideInput {
    /** Phải nằm trong [SEED_STEP_GUID_MIN, SEED_STEP_GUID_MAX]. */
    guidCd: number
    /** 名称 hiện ở cột 名称 của tab ガイド (pac_nam.guid_nm, varchar 50). */
    guidNm: string
    /** Giá trị trt_state sẽ trỏ tới ガイド này — ghi vào `pac_step_01`. */
    stepFrom: number
}

/**
 * Seed các ガイド STEP tạm. Ném lỗi nếu guid_cd nằm ngoài dải seed, hoặc dải đó
 * đang bị master THẬT chiếm (tránh xoá nhầm dữ liệu của tenant).
 * Trả về số ガイド đã tạo.
 */
export async function seedStepGuides(rows: readonly SeedStepGuideInput[]): Promise<number> {
    if (rows.length === 0) return 0
    for (const r of rows) {
        if (r.guidCd < SEED_STEP_GUID_MIN || r.guidCd > SEED_STEP_GUID_MAX) {
            throw new Error(
                `seedStepGuides: guid_cd ${r.guidCd} ngoài dải seed ` +
                    `[${SEED_STEP_GUID_MIN}, ${SEED_STEP_GUID_MAX}] — từ chối để không đụng master thật.`,
            )
        }
    }
    return withDb(async (c) => {
        // Dòng pag_trt nguồn: chỉ cần TỒN TẠI để thoả EXISTS. Chép trt_cd/trt_sb
        // của một dòng có thật thay vì bịa số, để nếu ai đó mở thử
        // ガイド処置選択 thì nó vẫn tra được master chứ không nổ.
        const src = await c.query<{ trt_cd: number; trt_sb: number }>(
            `SELECT trt_cd, trt_sb FROM view_pag_trt_active
              WHERE trt_cd IS NOT NULL AND trt_sb IS NOT NULL
              ORDER BY pag_id LIMIT 1`,
        )
        const srcRow = src.rows[0]
        if (!srcRow) return 0

        let n = 0
        for (const r of rows) {
            const clash = await c.query<{ guid_nm: string | null }>(
                'SELECT guid_nm FROM pac_nam WHERE guid_cd = $1 AND deleted_at IS NULL LIMIT 1',
                [r.guidCd],
            )
            const existing = clash.rows[0]
            if (existing && (existing.guid_nm ?? '') !== r.guidNm) {
                throw new Error(
                    `seedStepGuides: guid_cd ${r.guidCd} đã có trong pac_nam với tên ` +
                        `「${existing.guid_nm}」 — dải seed đang bị master thật chiếm. ` +
                        'Đổi TEST_STEP_GUID_BASE sang dải trống rồi chạy lại.',
                )
            }

            // Dọn tàn dư của lần chạy trước (bị kill giữa chừng) rồi tạo mới.
            await c.query('DELETE FROM pac_nam WHERE guid_cd = $1', [r.guidCd])
            await c.query('DELETE FROM pag_trt WHERE guid_cd = $1', [r.guidCd])
            await c.query('DELETE FROM pac_tbl WHERE guid_cd = $1', [r.guidCd])

            await c.query(
                'INSERT INTO pac_nam (guid_cd, guid_nm, pac_step_01) VALUES ($1, $2, $3)',
                [r.guidCd, r.guidNm, r.stepFrom],
            )
            await c.query(
                'INSERT INTO pag_trt (guid_cd, trt_cd, trt_sb, flg1) VALUES ($1, $2, $3, 1)',
                [r.guidCd, srcRow.trt_cd, srcRow.trt_sb],
            )
            await c.query('INSERT INTO pac_tbl (dis_cd, dis_sb, guid_cd) VALUES (9999, 0, $1)', [
                r.guidCd,
            ])
            n++
        }
        return n
    })
}

/** Xoá HẲN các ガイド đã seed khỏi cả ba bảng. Bỏ qua guid_cd ngoài dải seed. */
export async function deleteStepGuides(guidCds: readonly number[]): Promise<number> {
    const safe = guidCds.filter((cd) => cd >= SEED_STEP_GUID_MIN && cd <= SEED_STEP_GUID_MAX)
    if (safe.length === 0) return 0
    return withDb(async (c) => {
        let n = 0
        for (const table of ['pac_nam', 'pag_trt', 'pac_tbl']) {
            const r = await c.query(`DELETE FROM ${table} WHERE guid_cd = ANY($1::int[])`, [safe])
            n += r.rowCount ?? 0
        }
        return n
    })
}

// ─── mst_trt lookup (đọc, KHÔNG seed) ────────────────────────────────────────
//
// Master 処置 chia theo BẢN hiệu lực theo ngày (`view_mst_trt_ver_active`), và
// 改定 có thể BỎ hẳn một mã. Spec nào bám vào một mã cụ thể (185 歯根嚢胞摘出手術,
// 122/3 ＥＭＲ(４根)…) phải TỰ hỏi master trước rồi mới kết luận — nếu không, mã bị
// gỡ khỏi bản đang áp dụng sẽ làm test đỏ với thông báo sai hoàn toàn ("app thiếu
// chức năng" trong khi thật ra "tháng này không có mã đó").

export interface MstTrtRow {
    trtCd: number
    trtSb: number
    /** 処置名称 (cột `trt_nm`) — chuỗi hiện ở lưới 処置選択. */
    trtNm: string
    /** レセ名称 (cột `cct_nm`) — chuỗi ghi xuống `dsp_trt` khi chốt. */
    cctNm: string
    /** 点数 一般 (cột `score1`). */
    score1: number
}

/**
 * Tra các 枝番 của một 処置コード trong bản master hiệu lực cho `onDate`
 * (yyyy-mm-dd). Mảng rỗng = mã đó KHÔNG tồn tại ở tháng đó.
 */
export async function findMstTrt(onDate: string, trtCd: number): Promise<MstTrtRow[]> {
    return withDb(async (c) => {
        const ver = await c.query<{ version_id: string }>(
            `SELECT version_id
               FROM view_mst_trt_ver_active
              WHERE table_name LIKE 'MST_TRT%'
                AND start_date <= $1::timestamptz
                AND end_date   >= $1::timestamptz
              ORDER BY start_date DESC
              LIMIT 1`,
            [`${onDate}T00:00:00+09:00`],
        )
        const versionId = ver.rows[0]?.version_id
        if (!versionId) return []

        const r = await c.query<Record<string, unknown>>(
            `SELECT trt_cd, trt_sb, trt_nm, cct_nm, score1
               FROM mst_trt
              WHERE version_id = $1 AND trt_cd = $2 AND deleted_at IS NULL
              ORDER BY trt_sb`,
            [versionId, trtCd],
        )
        return r.rows.map((row) => ({
            trtCd: Number(row['trt_cd'] ?? 0),
            trtSb: Number(row['trt_sb'] ?? 0),
            trtNm: String(row['trt_nm'] ?? '').trim(),
            cctNm: String(row['cct_nm'] ?? '').trim(),
            score1: Number(row['score1'] ?? 0),
        }))
    })
}

// ─── person (患者マスタ) — 担当医 / 衛生士 dùng làm fallback của 患者確定 ──────
//
// `frm203001.defData` lấy `person.dr` / `person.staff` khi combo Dr./衛生士 để
// trống. Spec cần biết TRƯỚC giá trị thật của bệnh nhân mới assert được URL
// `drNo=` — hardcode một số sẽ xanh giả ở dataset khác.
//
// BE map 0 → null khi trả ra API (PatInfoDataMapper.cs:42), nên ở đây 0 và null
// đều được coi là "chưa gán" và trả về `null`.

export interface PersonAttending {
    /** `person.att_dr` — 0 / null đều thành null. */
    attDr: number | null
    /** `person.att_st` — 0 / null đều thành null. Lưu ý 100 là 無所属「－」, KHÔNG phải chưa gán. */
    attSt: number | null
}

/** Đọc 担当医 / 衛生士 của một bệnh nhân. `null` = không có dòng person. */
export async function personAttending(patNo: number): Promise<PersonAttending | null> {
    return withDb(async (c) => {
        const r = await c.query<{ att_dr: number | null; att_st: number | null }>(
            `SELECT att_dr, att_st FROM view_person_active WHERE pat_no = $1 LIMIT 1`,
            [patNo],
        )
        const row = r.rows[0]
        if (!row) return null
        const norm = (v: number | null) => (v === null || Number(v) === 0 ? null : Number(v))
        return { attDr: norm(row.att_dr), attSt: norm(row.att_st) }
    })
}

/** Một 患者番号 CÓ 担当医 và một 患者番号 KHÔNG có — hai nhánh của E00027「ドクター」. */
export async function findPatientsByAttDr(): Promise<{ withDr: number | null; withoutDr: number | null }> {
    return withDb(async (c) => {
        const withDr = await c.query<{ pat_no: number }>(
            `SELECT pat_no FROM view_person_active WHERE COALESCE(att_dr, 0) > 0 ORDER BY pat_no LIMIT 1`,
        )
        const withoutDr = await c.query<{ pat_no: number }>(
            `SELECT pat_no FROM view_person_active WHERE COALESCE(att_dr, 0) = 0 ORDER BY pat_no LIMIT 1`,
        )
        return {
            withDr: withDr.rows[0] ? Number(withDr.rows[0].pat_no) : null,
            withoutDr: withoutDr.rows[0] ? Number(withoutDr.rows[0].pat_no) : null,
        }
    })
}

/**
 * Một bệnh nhân CÓ 担当医 và CHƯA có dòng 受付 nào còn sống — chỗ duy nhất seed
 * được một dòng mang `user_no = 0`.
 *
 * `ux_wait_active` là unique theo `pat_no` trên các dòng chưa xoá, nên bệnh nhân
 * đã được tiếp nhận (thật, hoặc do testcase khác seed) thì `ensureWaitRow` sẽ
 * DÙNG LẠI dòng có sẵn và trả về `user_no` của nó — không còn là 0 nữa. Vì thế
 * phải loại sẵn ở đây thay vì thử rồi hỏng.
 *
 * `exclude` là bệnh nhân đã dùng cho nhánh 「user_no hợp lệ」, phải khác.
 *
 * Vì sao cần: WinForm ở nhánh `selRow` kiểm SỰ TỒN TẠI CỦA CỘT `user_no` chứ
 * không kiểm giá trị (`dt.Columns.Contains("user_no")`, frm203001.cs:698), nên
 * dòng mang 0 làm nó chặn E00027; bản web thì `waitRowUserNo || patientAttDr`
 * nên rơi về 担当医 và mở được màn. Đó là một điểm lệch, và đây là dữ liệu dựng nó.
 */
export async function findPatientForZeroWaitRow(
    exclude: number,
): Promise<{ patNo: number; attDr: number } | null> {
    return withDb(async (c) => {
        const r = await c.query<{ pat_no: number; att_dr: number }>(
            `SELECT p.pat_no, p.att_dr
               FROM view_person_active p
              WHERE COALESCE(p.att_dr, 0) > 0
                AND p.pat_no <> $1
                AND NOT EXISTS (
                      SELECT 1 FROM wait w
                       WHERE w.pat_no = p.pat_no AND w.deleted_at IS NULL
                    )
              ORDER BY p.pat_no
              LIMIT 1`,
            [exclude],
        )
        const row = r.rows[0]
        return row ? { patNo: Number(row.pat_no), attDr: Number(row.att_dr) } : null
    })
}

// ─── wait (受付一覧) — seed một dòng tiếp nhận để kiểm nhánh `user_no` của dòng ─
//
// Nhánh này của `frm203001.defData` (:697-701) chỉ chạy khi mở bệnh nhân TỪ
// 受付患者一覧, mà bảng `wait` ở máy dev thường rỗng. Seed một dòng của chính
// test rồi xoá CỨNG trong afterAll — dòng do test tạo nên không đụng dữ liệu
// thật, và xoá cứng (không phải soft-delete) để 受付一覧 sạch đúng như trước.
//
// `rdate` để NOW(): cột này vừa là thứ tự sắp xếp vừa là gốc tính 待ち時間.

export interface EnsuredWaitRow {
    /** id của dòng 受付 đang đứng trên lưới. */
    id: string
    /** `user_no` THẬT của dòng đó — có thể khác giá trị xin seed (xem `created`). */
    userNo: number | null
    /** true = dòng do lần chạy này tạo ⇒ afterAll được phép xoá. */
    created: boolean
}

/**
 * Bảo đảm có một dòng 受付 cho bệnh nhân, KHÔNG đụng dòng của người khác.
 *
 * `ux_wait_active` là unique theo `pat_no` trên các dòng còn sống, nên INSERT
 * thẳng sẽ vỡ khi bệnh nhân đó đã được tiếp nhận thật, hoặc khi hai worker chạy
 * song song (`--repeat-each` mặc định 3 worker) cùng seed một bệnh nhân. Vì thế:
 * có sẵn thì DÙNG LẠI và trả về `user_no` thật của nó, chưa có thì INSERT.
 *
 * `created` quyết định quyền xoá: chỉ dòng do chính lần chạy này tạo mới được
 * `deleteWaitRows`, dòng có sẵn phải giữ nguyên.
 */
export async function ensureWaitRow(patNo: number, userNo: number | null): Promise<EnsuredWaitRow> {
    return withDb(async (c) => {
        const existing = async () =>
            (
                await c.query<{ id: string; user_no: number | null }>(
                    `SELECT id, user_no FROM wait WHERE pat_no = $1 AND deleted_at IS NULL LIMIT 1`,
                    [patNo],
                )
            ).rows[0]

        const before = await existing()
        if (before) {
            return { id: String(before.id), userNo: before.user_no === null ? null : Number(before.user_no), created: false }
        }
        try {
            const r = await c.query<{ id: string }>(
                `INSERT INTO wait (pat_no, user_no, rdate) VALUES ($1, $2, NOW()) RETURNING id`,
                [patNo, userNo],
            )
            return { id: String(r.rows[0]!.id), userNo, created: true }
        } catch {
            // Worker khác chèn xen vào giữa SELECT và INSERT — đọc lại dòng của họ.
            const after = await existing()
            if (!after) throw new Error(`không tạo được dòng 受付 cho bệnh nhân ${patNo}`)
            return { id: String(after.id), userNo: after.user_no === null ? null : Number(after.user_no), created: false }
        }
    })
}

/** Xoá cứng các dòng 受付 do test tạo. Trả về số dòng đã xoá. */
export async function deleteWaitRows(ids: readonly string[]): Promise<number> {
    if (ids.length === 0) return 0
    return withDb(async (c) => {
        const r = await c.query(`DELETE FROM wait WHERE id = ANY($1::uuid[])`, [ids])
        return r.rowCount ?? 0
    })
}

/**
 * Một 患者番号 CÓ 担当医 nhưng KHÔNG có 衛生士 — nhánh E00027「衛生士」.
 *
 * Phải có 担当医 thì mới tới được bước kiểm 衛生士: `resolveStaffAssignment`
 * chặn ở 担当医 trước. `null` = dataset không có bệnh nhân nào như vậy.
 * Lưu ý 100 là 無所属「－」 chứ KHÔNG phải chưa gán, nên chỉ 0/null mới tính.
 */
export async function findPatientWithoutAttSt(): Promise<number | null> {
    return withDb(async (c) => {
        const r = await c.query<{ pat_no: number }>(
            `SELECT pat_no
               FROM view_person_active
              WHERE COALESCE(att_dr, 0) > 0 AND COALESCE(att_st, 0) = 0
              ORDER BY pat_no
              LIMIT 1`,
        )
        return r.rows[0] ? Number(r.rows[0].pat_no) : null
    })
}

/** Danh sách Ｄｒ．(user_kbn=0) đúng như dropdown 担当医 nạp, theo user_no tăng dần. */
export async function listDoctors(): Promise<{ userNo: number; userNm: string }[]> {
    return withDb(async (c) => {
        const r = await c.query<{ user_no: number; user_nm: string }>(
            `SELECT user_no, user_nm
               FROM view_clinic_user_active
              WHERE user_kbn = 0
              ORDER BY user_no`,
        )
        return r.rows.map((x) => ({ userNo: Number(x.user_no), userNm: String(x.user_nm ?? '').trim() }))
    })
}

// ─── trn_trn — bệnh nhân CÓ 処置 trong THÁNG đang mở ──────────────────────────
//
// Cần cho nhánh "seed Ｄｒ．từ TRN cũ": bug chỉ lộ ra khi màn 処置入力 mở đúng
// vào tháng mà bệnh nhân đã có dòng mang `dr_no > 0`. Màn chi tiết lấy tháng từ
// `trtDt` trên URL, mà 患者選択 mặc định là HÔM NAY, nên tháng cần dò là tháng
// hiện tại.

export interface PatientWithTrnThisMonth {
    patNo: number
    /** Các `dr_no > 0` xuất hiện trong tháng — giá trị mà bản CŨ có thể seed nhầm. */
    trnDrNos: number[]
    /** `person.att_dr` (0/null → null). */
    attDr: number | null
}

/**
 * Bệnh nhân đầu tiên có 処置 mang `dr_no > 0` trong tháng hiện tại.
 * `null` = dataset không có ⇒ testcase tự skip vì không dựng được trạng thái.
 */
export async function findPatientWithTrnThisMonth(): Promise<PatientWithTrnThisMonth | null> {
    return withDb(async (c) => {
        const r = await c.query<{ pat_no: number; dr_nos: number[]; att_dr: number | null }>(
            `SELECT t.pat_no,
                    ARRAY_AGG(DISTINCT t.dr_no) FILTER (WHERE t.dr_no > 0) AS dr_nos,
                    MAX(p.att_dr)                                          AS att_dr
               FROM view_trn_trn_active t
               JOIN view_person_active p ON p.pat_no = t.pat_no
              WHERE t.trt_dt >= date_trunc('month', CURRENT_DATE)
                AND t.trt_dt <  date_trunc('month', CURRENT_DATE) + interval '1 month'
              GROUP BY t.pat_no
             HAVING COUNT(*) FILTER (WHERE t.dr_no > 0) > 0
              ORDER BY t.pat_no
              LIMIT 1`,
        )
        const row = r.rows[0]
        if (!row) return null
        return {
            patNo: Number(row.pat_no),
            trnDrNos: (row.dr_nos ?? []).map(Number),
            attDr: row.att_dr === null || Number(row.att_dr) === 0 ? null : Number(row.att_dr),
        }
    })
}
