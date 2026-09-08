import { type Page, type Request } from '@playwright/test'

import { patNo } from '../_shared/env'
import { installOverlayHandlers } from '../_shared/overlays'
import { expect, releaseSharedPage, test } from '../_shared/session'

import {
    countRealTreatmentRowsInMonth,
    dbEnabled,
    deleteSigaRow,
    deleteTreatmentRows,
    deleteTreatmentRowsByBui,
    deleteTreatmentRowsByDspTrt,
    deleteChkAutoCompanionRows,
    deleteTreatmentRowsByTrtCd,
    ensureSigaRow,
    findMstTrt,
    readSiga,
    restoreSiga,
    seedTreatmentRows,
    writeSigaTeeth,
    type SigaSnapshot,
} from '../_shared/db'
import { makeStep } from '../_shared/step'
import { closeDialogs } from '../_shared/virtual-grid'

/**
 * 診療入力 — hai lệch của đường GHI NÓNG 歯式 (`siga`) mà 「いいえ」 phải dọn.
 *
 * ĐẶC TÍNH KIỂM THỬ: mọi assert bám THEO WINFORM (src/OCHACOM), không bám theo
 * code web. Kỳ vọng của TC-4 được TÍNH LẠI trong chính spec này từ vòng lặp
 * `frm203002.cs:7455-7466`, không copy từ hàm nào của app.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * HAI THỨ ĐANG KHOÁ Ở ĐÂY
 * ═════════════════════════════════════════════════════════════════════════════
 * (A) `Chk_PModeKesson` LÀM MỚI `pSiga_old` — nhưng chỉ MỘT PHẦN ĐẦU.
 *
 *     Vòng dò `updFlg` của WinForm làm HAI việc trong CÙNG một vòng lặp có `break`:
 *
 *         for (int i = 0; i < 32; i++) {
 *             setSigaData(i + 1, getSigaData(i + 1, siga), ref ModCommon.pSiga_old);
 *             if (grdByou[i + 3].Value.ToString() == "0" && getSigaData(i + 1, siga) != 4)
 *                 if (i != 0 && i != 15 && i != 16 && i != 31) { updFlg = true; break; }
 *         }
 *
 *     ⇒ mốc `pSiga_old` (thứ mà 「いいえ」 ghi trả lại, `modSave.cs:4700`) được lấy lại
 *     từ DB **tới đúng chỉ số vừa break**, và KHÔNG động tới phần sau. Kết quả là một
 *     hàng `siga` LAI: nửa đầu theo trạng thái lúc bấm Ｐ変更, nửa sau theo lúc mở màn.
 *
 *     Nhìn thấy được bằng mắt: 抜歯 răng khôn 右上8 (ô 0) → Ｐ変更 → 「いいえ」.
 *     Ô 0 được làm mới ngay vòng ĐẦU TIÊN (trước khi vòng lặp kịp break, vì 4 răng khôn
 *     không được phép break) ⇒ `pSiga_old.se1` mang số 4 mà 抜歯 vừa ghi ⇒ `Restore_Siga`
 *     ghi lại đúng số 4 đó ⇒ **răng Ở LẠI 欠損**. Bản web cũ giữ nguyên ảnh chụp lúc mở
 *     màn nên trả răng về 健全 — mất dấu 抜歯 mà người dùng vừa nhập.
 *
 *     ⛔ ĐỪNG "sửa cho gọn" thành 「chụp lại cả 32 ô」. TC-4 khoá đúng chỗ đó: những ô
 *        NẰM SAU điểm break PHẢI quay về giá trị lúc mở màn.
 *
 * (B) `SigaChg` là lệnh GHI NÓNG bắn đi mà KHÔNG chờ (`void`), nên cờ `pSiga_chg` chỉ
 *     lên sau khi POST trở về. WinForm gọi đồng bộ nên không có cửa này; web thì có:
 *       · bấm 「いいえ」 trước khi POST về ⇒ cờ còn false ⇒ `Restore_SK` bị bỏ qua HẲN
 *         ⇒ răng vừa 抜歯 ở lại 欠損 vĩnh viễn, không còn đường lùi;
 *       · hoặc POST đáp SAU `Restore_SK` ⇒ ghi đè 欠損 lên trạng thái vừa khôi phục.
 *     TC-5 dựng đúng cửa đó bằng cách LÀM CHẬM request (`page.route`) rồi bấm F10 ngay.
 *
 * ── KHÔNG kiểm ở đây ─────────────────────────────────────────────────────────
 *  Race `read-then-INSERT` của hàng `siga` (hai request đồng thời cho bệnh nhân chưa
 *  có hàng ⇒ đụng `ux_siga_active` ⇒ 500 mà FE nuốt im lặng). Không dựng được ổn định
 *  qua trình duyệt; đã khoá bằng unit test có race THẬT ở
 *  `apps/api/tests/Ochacom.Application.UnitTests/Sigas/Handlers/EagerToothStatusHandlerTests.cs`
 *  (`Provisioning_When*`), dùng `SaveChangesInterceptor` chèn hàng đối thủ trên cùng
 *  connection.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NGUỒN WINFORM (src/OCHACOM)
 * ═════════════════════════════════════════════════════════════════════════════
 *  · `frm203016.cs:1030-1057` / `:1282` — `IregCodChk` → `SigaChg`: chốt 処置 là GHI
 *    `siga` NGAY (không đợi 登録) và BẬT `ModCommon.pSiga_chg`.
 *  · `frm203002.cs:7237-7250` — `ChkBuiDisChg`: Q00100 「変更を適用しますか？」, はい ⇒
 *    `ChgBuiForP(con)` rồi `Chk_PModeKesson(con)`, đúng thứ tự đó.
 *  · `frm203002.cs:7446-7495` — `Chk_PModeKesson`: xem khối (A) bên trên. 4 ô 智歯
 *    {0,15,16,31} bị loại ở CẢ HAI vòng; 乳歯 không bao giờ bị đụng vì `setSigaData`
 *    của frm203002 chỉ map `1..32 → se1..se32` (`:7495-7570`).
 *  · `modKonSiga.cs:77-84` — `pGet_SIGA`: ảnh chụp `pSiga_old` lấy lúc MỞ màn hình.
 *  · `modSave.cs:455-463` → `:4670` → `:4700` — `RestoreData` → `Restore_SK` →
 *    `Restore_Siga`: 「いいえ」 ghi trả 50 cột (SE1..SE32 + SN1..SN18) từ `pSiga_old`,
 *    và CHỈ chạy khi `pSiga_chg == true` (`:4684`).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU TỰ DỰNG (CÓ GHI DB — cần TEST_DB=1 và TEST_ALLOW_SAVE=1)
 * ═════════════════════════════════════════════════════════════════════════════
 *  `beforeAll` / trước mỗi phase:
 *    1. chụp nguyên trạng `siga` (in ra stdout để cứu tay, trả lại ở afterAll);
 *    2. ép TOÀN BỘ `se_1..se_32` về 生活歯 = 0 ⇒ mọi ô = 4 sau đó đều do chính test gây ra;
 *    3. seed MỘT 部位病名行 mang 病名 Ｐ(103) và 部位 gồm ĐÚNG 3 răng — ô 0 / 10 / 30.
 *       · ô 0 (右上8, 智歯) — ô LUÔN nằm trong phần đầu được làm mới ⇒ vế 「ở lại 欠損」;
 *       · ô 30 (左下7) — ô gần cuối hàm, gần như chắc chắn NẰM SAU điểm break ⇒ vế đối
 *         chứng 「phải quay về 健全」. Chính hai vế này phân biệt "làm mới phần đầu" với
 *         "chụp lại cả 32 ô";
 *       · ô 10 (左上3) — răng thường, để tập Ｐ không chỉ toàn 智歯.
 *
 * ⚠️ Spec KHÔNG bấm F9 nên KHÔNG ghi `trn_trn`, nhưng VẪN cần TEST_ALLOW_SAVE=1:
 *    `SigaChg` và `Chk_PModeKesson` tự chúng là lệnh GHI DB THẬT vào bảng `siga`
 *    (GUIDELINE Rule 18.1).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * BẪY CẦN BIẾT
 * ═════════════════════════════════════════════════════════════════════════════
 *  1. Kỳ vọng của TC-4 suy ra từ BA thứ ĐỌC ĐƯỢC, không hard-code: 歯式 lúc mở màn,
 *     歯式 ngay TRƯỚC Ｐ変更, và vector 部位 trong body `POST /tenant/siga/p-mode-missing`.
 *     Các phím F của 部位選択 phụ thuộc `activeRow` nên hard-code tập Ｐ mới là giòn.
 *  2. Q00100 chỉ bung khi 部位 hoặc 病名 THỰC SỰ đổi so với ảnh chụp — không đổi gì mà
 *     bấm 確定 thì TC đỏ oan (guard `dsp === ctx.oldPart` trong `commitByokenChange`).
 *  3. 確定 của CẢ HAI dialog 部位選択 / 病名選択 là phím **End** (F9 của 部位選択 là 「Br例」).
 *  4. Q00100 dựng bằng `confirmDialog` → Radix **AlertDialog** ⇒ role `alertdialog`,
 *     KHÔNG phải `dialog`. Bó vào `getByRole('dialog')` là timeout rồi đỏ như app hỏng.
 *  5. Hộp thoại dirty gate: phải khoanh nút 「No」 TRONG hộp thoại — tiêu đề cột 「No」
 *     của tab 病検 cũng là `role="button"` nên `.first()` rơi vào tiêu đề cột và chỉ
 *     sort side panel.
 *  6. TC-5 làm chậm request bằng `page.route`; PHẢI `page.unroute` sau đó, nếu không
 *     mọi 処置 nhập ở test sau đều lãnh thêm độ trễ và timeout lung tung.
 *  7. ĐÃ VẤP: chốt 処置 xong ĐỌC DB NGAY là đua với chính cái request mình đang kiểm —
 *     `SigaChg` bắn `void` nên lúc UI đã yên thì POST vẫn có thể còn bay, và TC-2 đỏ
 *     ngẫu nhiên (`se_1 = 0`) rồi xanh khi retry. `enterExtractionViaUi()` vì thế CHỜ
 *     response của `tooth-status-change` (mốc có thật, Rule 7 — không sleep). TC-5 là
 *     ngoại lệ DUY NHẤT được truyền `awaitEagerWrite: false`: nó cần request còn bay.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * CÁCH CHẠY (Rule 19) — LUÔN chạy CẢ FILE, không bao giờ `-g` một testcase lẻ
 * ═════════════════════════════════════════════════════════════════════════════
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-tooth-status/siga-eager-write-races.spec.ts
 *   TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-tooth-status/siga-eager-write-races.spec.ts --headed
 */

/** Bệnh nhân test — spec GHI bảng `siga` của họ, đừng trỏ vào dữ liệu thật. */
const PAT_NO = patNo('12138')

/** Ngày test = HÔM NAY: chỉ dòng của tháng đang mở mới thao tác tay được. */
const TRT_DT =
    process.env.TEST_TRT_DT ??
    (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

/** GUIDELINE Rule 18.1 — mọi thao tác ghi DB phải nằm sau cờ env. */
const ALLOW_SAVE = process.env.TEST_ALLOW_SAVE === '1'

/** 抜歯 — 処置 duy nhất spec này nhập tay; 枝番 1 để KHÔNG rơi vào 分割抜歯 (5). */
const EXT_TRT_CD = 179
const EXT_SB = 1

/** 歯周炎 (Ｐ) — `PERIODONTITIS_DIS_CD`, cũng là mã WinForm `MonthP` ưu tiên. */
const P_DIS_CD = 103

/**
 * `dsp_dis` của dòng seed — CŨNG là thứ dùng để locate dòng trên lưới.
 * Dòng 病名-only không sinh ô 療法・処置 riêng; chỗ DUY NHẤT chuỗi seed hiện nguyên vẹn
 * là ô 療法・処置 của chính 部位病名行, nơi mapper đổ `dsp_dis` vào.
 */
const SEED_DIS_TEXT = 'ＰＭ復元検証Ｐ'
/** `dsp_trt` của dòng seed — chỉ để dọn dữ liệu, không hiện trên lưới. */
const SEED_NM = 'Ｐ変更復元テスト行'

/**
 * 部位 của dòng Ｐ seed — xem khối "DỮ LIỆU TỰ DỰNG" ở đầu file.
 * `WATCH_SLOTS[0]` (ô 0) là vế 「ở lại 欠損」, `WATCH_SLOTS[2]` (ô 30) là vế đối chứng.
 */
const WATCH_SLOTS = [0, 10, 30] as const
const P_BUI_VAL = 1

/** 4 ô 智歯 WinForm luôn bỏ qua (frm203002.cs:7460/:7472) — 0-based. */
const WISDOM_SLOTS = [0, 15, 16, 31] as const

// ─── Miền giá trị 自歯状況 (CommonChk.cs:497-580) ─────────────────────────────
/** 永久歯 生活歯 — cũng là DEFAULT của cột `se_*`. */
const SE_VITAL = 0
/** 永久歯 欠損歯 — giá trị 抜歯 và Chk_PModeKesson cùng ghi. */
const SE_MISSING = 4

const P_MODE_PATH = '/tenant/siga/p-mode-missing'
/** `SigaChg` — ghi nóng lúc chốt 処置 (`TenantSigaEndpoints.cs`). */
const TOOTH_STATUS_PATH = '/tenant/siga/tooth-status-change'
/** `Restore_SK` — 「いいえ」 ở dirty gate. */
const RESTORE_PATH = '/tenant/siga/restore'

const GRID_LOAD_TIMEOUT = 60_000
const GRID_RELOAD_TIMEOUT = 30_000
const GRID_LOAD_ATTEMPTS = 3
/** Độ trễ ép vào `SigaChg` ở TC-5 — đủ dài để chắc chắn nó CÒN ĐANG BAY lúc bấm F10. */
const EAGER_WRITE_DELAY_MS = 6_000

/** REGIRYO_PADLEFT: tên 処置 render kèm space đầu → luôn so sánh sau trim/NFKC. */
const txt = (s: string) => s.normalize('NFKC').trim()

/** Ô 療法・処置 (RegiCol.ryo = 2) của MỌI dòng lưới, đúng thứ tự hiển thị. */
const ryoCells = (page: Page) => page.locator('[data-grid-cell$="|2"]')

interface GridRow {
    /** rowKey (phần trước `|N` của data-grid-cell). */
    key: string
    /** Ô 部位 (RegiCol.bui = 1). */
    bui: string
    /** Ô 療法・処置 (RegiCol.ryo = 2) — với 部位病名行 thì đây là `dsp_dis`. */
    ryo: string
}

/**
 * Mọi dòng lưới, GOM THEO rowKey.
 *
 * BẪY ĐÃ VẤP (2 lần, ở 2 spec): KHÔNG locate bằng `filter({ hasText })`. `hasText`
 * chỉ chuẩn hoá KHOẢNG TRẮNG, không đổi 全角→半角, nên `txt()` (NFKC) biến 「Ｐ」 của
 * chuỗi mong đợi thành 「P」 rồi không khớp gì với DOM. Phải NFKC CẢ HAI VẾ rồi so
 * bằng `===`, đúng như ở đây.
 *
 * BẪY ĐÃ VẤP: đọc `|1` và `|2` thành HAI danh sách rồi zip theo chỉ số là SAI —
 * không phải dòng nào cũng render đủ cả hai ô, nên hai danh sách lệch nhau và
 * 部位 của dòng này bị ghép với 療法 của dòng khác.
 */
async function gridRows(page: Page): Promise<GridRow[]> {
    const raw = await page.locator('[data-grid-cell]').evaluateAll((els) => {
        const byKey = new Map<string, { bui: string; ryo: string }>()
        for (const e of els) {
            const attr = e.getAttribute('data-grid-cell') ?? ''
            const i = attr.lastIndexOf('|')
            if (i < 0) continue
            const key = attr.slice(0, i)
            const col = attr.slice(i + 1)
            if (col !== '1' && col !== '2') continue
            const cur = byKey.get(key) ?? { bui: '', ryo: '' }
            if (col === '1') cur.bui = e.textContent ?? ''
            else cur.ryo = e.textContent ?? ''
            byKey.set(key, cur)
        }
        return [...byKey].map(([key, v]) => ({ key, ...v }))
    })
    return raw.map((r) => ({ key: r.key, bui: txt(r.bui), ryo: txt(r.ryo) }))
}

/** Mảng 32 ô 部位 với các ô chỉ định mang `val`. */
const buiAt = (slots: readonly number[], val: number) =>
    Array.from({ length: 32 }, (_, i) => (slots.includes(i) ? val : 0))

/**
 * Bao nhiêu ô ĐẦU của `pSiga_old.se` được `Chk_PModeKesson` lấy lại từ DB.
 *
 * Viết lại TỪ `frm203002.cs:7455-7466`, KHÔNG import từ app — spec phải kiểm được bản
 * port chứ không lặp lại nó. Ba điều kiện `continue` dưới đây chính là ba nhánh khiến
 * WinForm KHÔNG break: ô 部位 khác 0, ô đã là 欠損, và 4 ô 智歯.
 */
function pSigaOldPrefixLen(bui: readonly number[], se: readonly number[]): number {
    for (let i = 0; i < 32; i++) {
        if ((bui[i] ?? 0) !== 0) continue
        if ((se[i] ?? 0) === SE_MISSING) continue
        if (!WISDOM_SLOTS.includes(i as (typeof WISDOM_SLOTS)[number])) return i + 1
    }
    return 32
}

// Rule 5.3 — skip cấp file chỉ hiện chữ "skipped" trơ trọi, nhìn y như đã chạy xong.
if (!dbEnabled || !ALLOW_SAVE) {
    const missing = [
        !dbEnabled ? 'TEST_DB=1 (để seed dòng Ｐ + đọc/khôi phục bảng siga)' : null,
        !ALLOW_SAVE ? 'TEST_ALLOW_SAVE=1 (SigaChg và Chk_PModeKesson GHI thẳng bảng siga)' : null,
    ].filter(Boolean)
    console.log(
        `\n⚠️  siga-tooth-status/siga-eager-write-races.spec.ts BỎ QUA TOÀN BỘ testcase — thiếu: ${missing.join(' + ')}\n` +
            '   Chạy bằng:\n' +
            '     TEST_DB=1 TEST_ALLOW_SAVE=1 npx playwright test tests/siga-tooth-status/siga-eager-write-races.spec.ts\n' +
            '   (spec KHÔNG bấm F9 nên không đụng trn_trn, nhưng CÓ ghi bảng siga)\n',
    )
}

test.skip(!dbEnabled, 'Cần TEST_DB=1 để seed dòng Ｐ + đọc/khôi phục bảng siga')
test.skip(!ALLOW_SAVE, 'Cần TEST_ALLOW_SAVE=1: SigaChg/Chk_PModeKesson ghi thẳng bảng siga')

test.describe.configure({ mode: 'serial', timeout: 300_000 })

test.describe('診療入力 — ghi nóng 歯式 vs 「いいえ」 (pSiga_old / SigaChg)', () => {
    let page: Page
    let step: () => Promise<void>

    /** Nguyên trạng `siga` trước khi test đụng vào — trả lại ở afterAll. */
    let sigaBefore: SigaSnapshot | null = null
    /** true khi dòng siga do CHÍNH test tạo ⇒ afterAll xoá hẳn thay vì restore. */
    let sigaRowCreated = false

    /** 部位 32 ô FE gửi lên trong request `Chk_PModeKesson` (BẪY 1). */
    let sentPModeBui: number[] | null = null
    /** `snapshot.se` FE gửi lên trong request `Restore_SK` — mốc chính của TC-4. */
    let sentRestoreSe: number[] | null = null
    /** Số lần `Restore_SK` được gọi — reset ở đầu mỗi phase. */
    let restoreCalls = 0

    const seOf = (snap: SigaSnapshot, slot: number) => snap.se[slot]

    async function mustReadSiga(): Promise<SigaSnapshot> {
        const s = await readSiga(Number(PAT_NO))
        expect(s, `bệnh nhân ${PAT_NO} không còn dòng siga nào để đọc`).not.toBeNull()
        return s!
    }

    async function openTreatmentScreen() {
        let lastErr: unknown
        for (let attempt = 1; attempt <= GRID_LOAD_ATTEMPTS; attempt++) {
            await page.goto(`/treatments/${PAT_NO}?trtDt=${TRT_DT}`, {
                waitUntil: 'domcontentloaded',
            })
            try {
                await expect(
                    ryoCells(page).first(),
                    'Lưới 診療入力 không nạp được dữ liệu (không có ô 療法 nào)',
                ).toBeVisible({
                    timeout: attempt === 1 ? GRID_LOAD_TIMEOUT : GRID_RELOAD_TIMEOUT,
                })
                await closeDialogs(page)
                return
            } catch (e) {
                lastErr = e
                console.log(
                    `openTreatmentScreen: lần ${attempt}/${GRID_LOAD_ATTEMPTS} không nạp được lưới — nạp lại`,
                )
            }
        }
        throw lastErr
    }

    /** Xoá HẲN mọi dòng spec này từng tạo — gọi trước mỗi phase và ở afterAll. */
    async function purgeTestRows(): Promise<number> {
        let n = await deleteTreatmentRows(Number(PAT_NO), TRT_DT).catch(() => 0)
        n += await deleteTreatmentRowsByDspTrt(Number(PAT_NO), TRT_DT, 0, [SEED_NM]).catch(() => 0)
        for (const slot of WATCH_SLOTS) {
            n += await deleteTreatmentRowsByBui(
                Number(PAT_NO),
                TRT_DT,
                slot + 1,
                P_BUI_VAL,
            ).catch(() => 0)
        }
        // Lưới cuối cho dòng 抜歯 NHẬP QUA UI: nó mang `dsp_trt` của master nên hai
        // đường trên trượt, và nếu việc thừa kế 部位 hỏng thì đường theo ô 部位 cũng
        // trượt nốt (bui toàn 0).
        n += await deleteTreatmentRowsByTrtCd(Number(PAT_NO), TRT_DT, EXT_TRT_CD).catch(() => 0)
        // 2026-09-08: 自動算定 (chk_auto) và nhánh tự-áp-dụng của コメント自動入力
        // (cmt_auto) vừa được port, nên một cú chốt 処置 giờ để lại thêm 麻酔 +
        // カルテコメント. Chúng mang mã KHÁC nên mọi đường dọn theo tên/部位 ở trên
        // đều trượt.
        n += await deleteChkAutoCompanionRows(
            Number(PAT_NO),
            TRT_DT,
            EXT_TRT_CD,
            EXT_SB,
        ).catch(() => 0)
        return n
    }

    /**
     * Dựng lại trạng thái xuất phát của MỘT phase: 歯式 toàn 生活歯, đúng một 部位病名行
     * Ｐ, màn hình nạp lại.
     *
     * ⚠️ Thứ tự BẮT BUỘC: ghi `siga` TRƯỚC khi mở lại màn hình — FE chốt ảnh chụp
     * `pSiga_old` ở lần fetch `siga`/`kon` ĐẦU TIÊN sau mount. Đảo thứ tự thì ảnh chụp
     * mang giá trị cũ và mọi assert về 「いいえ」 vô nghĩa.
     */
    async function resetPhase() {
        const allVital: Record<number, number> = {}
        for (let col = 1; col <= 32; col++) allVital[col] = SE_VITAL
        await writeSigaTeeth(Number(PAT_NO), { se: allVital })

        await purgeTestRows()
        await seedTreatmentRows(Number(PAT_NO), TRT_DT, [
            {
                trtCd: 0,
                trtSb: 0,
                trtPt: 0,
                trtCnt: 0,
                dspTrt: SEED_NM,
                bui: buiAt(WATCH_SLOTS, P_BUI_VAL),
                dspBui: '右上8 左上3 左下7',
                disCd: [P_DIS_CD],
                disSb: [0],
                dspDis: SEED_DIS_TEXT,
            },
        ])

        sentPModeBui = null
        sentRestoreSe = null
        restoreCalls = 0
        await openTreatmentScreen()
    }

    /**
     * Nhập 抜歯 qua UI để `SigaChg` bắn thật — seed thẳng DB KHÔNG kích hoạt đường ghi
     * nóng, và chính đường đó mới là thứ bật `pSiga_chg`.
     *
     * 部位 mà dòng mới thừa kế là 部位病名行 đang chi phối nó (`governingBuiOf`, tương
     * đương `ModCommon.pbui`), tức dòng Ｐ vừa seed.
     */
    async function enterExtractionViaUi(opts: { awaitEagerWrite?: boolean } = {}) {
        // BẪY 7 — đăng ký NGAY đầu hàm, trước cú click sinh ra request.
        const eager =
            (opts.awaitEagerWrite ?? true)
                ? page
                      .waitForResponse(
                          (r) =>
                              r.url().includes(TOOTH_STATUS_PATH) &&
                              r.request().method() === 'POST',
                          { timeout: 30_000 },
                      )
                      .catch(() => null)
                : null

        await closeDialogs(page)
        const modeBtn = page.locator('button[title^="点数/コード 入力モード切替"]')
        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        const trtPicker = page.getByRole('dialog').filter({ hasText: '処置選択' })

        await footerTen.scrollIntoViewIfNeeded().catch(() => {})
        if ((await modeBtn.innerText()).trim() !== 'コード') await modeBtn.click()
        await expect(modeBtn, 'không chuyển được sang コードモード').toHaveText('コード')
        await step()

        await footerTen.click()
        await footerTen.fill(String(EXT_TRT_CD))
        await footerTen.press('Enter')
        // Handler xoá input trước khi tra cứu → value === '' là mốc CÓ THẬT rằng Enter
        // đã được xử lý (Rule 7: không sleep).
        await expect(footerTen, 'Enter chưa được xử lý (ô 点 chưa bị xoá)').toHaveValue('')
        await expect(
            trtPicker,
            `mã ${EXT_TRT_CD} không mở được 処置選択 — xem lại TC-1 (master tháng này có mã đó không)`,
        ).toBeVisible({ timeout: 20_000 })
        await step()

        const sbTexts = await trtPicker.getByTestId('cell-trtSb').allTextContents()
        const idx = sbTexts.findIndex((t) => Number(t.trim()) === EXT_SB)
        expect(
            idx,
            `処置選択 không có 枝番 ${EXT_SB} của mã ${EXT_TRT_CD} — đổi TEST_TRT_DT về tháng ` +
                'master còn hiệu lực rồi chạy lại',
        ).toBeGreaterThanOrEqual(0)
        await trtPicker.getByTestId('cell-trtNm').nth(idx).click()
        await trtPicker.getByRole('button', { name: /F9\s*確定/ }).click()
        await expect(trtPicker).toBeHidden({ timeout: 15_000 })
        await step()

        // Sau 確定 con trỏ nằm ở ô 回 CỦA CHÍNH DÒNG vừa chốt, đang ở chế độ nhập với
        // sẵn "1". KHÔNG Enter ở đây thì dòng chưa được chốt hẳn.
        const editing = page.locator('input:focus')
        await expect(editing, 'sau 確定 phải có ô 回 đang ở chế độ nhập').toHaveValue('1', {
            timeout: 20_000,
        })
        await page.keyboard.press('Enter')

        if (eager) {
            const res = await eager
            expect(
                res,
                `Chốt 処置 ${EXT_TRT_CD}/${EXT_SB} phải bắn POST ${TOOTH_STATUS_PATH} ` +
                    '(frm203016.IregCodChk → SigaChg). Không có request nào ⇒ cổng ' +
                    '`eagerToothStatusWrite` không nhận ra mã này, hoặc dòng mới không thừa kế ' +
                    'được 部位 (部位なし ⇒ WinForm cũng không ghi).',
            ).not.toBeNull()
            expect(res!.status(), `POST ${TOOTH_STATUS_PATH} phải thành công`).toBeLessThan(400)
        }
        await step()
    }

    /**
     * Bấm Ｐ変更 → sửa tập Ｐ → 確定 → はい ở Q00100. Trả về response của
     * `POST /tenant/siga/p-mode-missing` (null nếu không có request nào).
     */
    async function runPModeChange() {
        await closeDialogs(page)
        await page
            .getByRole('button', { name: '病検', exact: true })
            .click()
            .catch(() => {})
        await page.getByRole('button', { name: 'Ｐ変更', exact: true }).click()

        const noPG = page.getByText('当月にＰ／Ｇの病名がありません。')
        if (await noPG.count()) {
            expect(
                false,
                'Ｐ変更 báo 「当月にＰ／Ｇの病名がありません。」 ⇒ aggregatePGTeeth không gom được ' +
                    `dòng seed. Kiểm tra dis_cd_1 = ${P_DIS_CD} và 部位 của dòng 「${SEED_DIS_TEXT}」.`,
            ).toBe(true)
        }

        const toothDialog = page.getByRole('dialog').filter({ hasText: /部\s*位\s*選\s*択/ })
        await expect(
            toothDialog.first(),
            'bấm Ｐ変更 mà 部位選択 không mở — kiểm tra nút / tab 病検',
        ).toBeVisible({ timeout: 20_000 })
        const litBefore = await toothDialog.locator('button[title^="Type:"]').count()
        console.log(`部位選択 mở ra với ${litBefore} răng đang sáng (= tập Ｐ cũ, seed ${WATCH_SLOTS.length})`)
        await step()

        // BẪY 2: phải ĐỔI tập Ｐ thì Q00100 mới bung. F11 全消去 rồi F3 để tập MỚI vẫn
        // còn răng — nhờ vậy 「phần bù」 khác 「cả hàm」 và điểm break không rơi về 0.
        await page.keyboard.press('F11')
        await page.keyboard.press('F3')
        await step()

        // BẪY 3: 確定 của 部位選択 là End (F9 = 「Br例」).
        await page.keyboard.press('End')
        await expect(
            page.getByText(/病\s*名\s*選\s*択/).first(),
            '部位選択 確定 xong phải mở 病名選択 (handleToothConfirm → setDiseaseDialogOpen)',
        ).toBeVisible({ timeout: 30_000 })
        await step()
        await page.keyboard.press('End')

        // BẪY 4: Q00100 là AlertDialog, không phải dialog.
        const gate = page.getByText('変更を適用しますか？')
        await expect(
            gate,
            'Sửa 部位 xong phải bung Q00100 「変更を適用しますか？」 (ChkBuiDisChg, frm203002.cs:7241). ' +
                'Không bung ⇒ 部位 chưa thực sự đổi so với ảnh chụp — F11/F3 ở trên không ăn.',
        ).toBeVisible({ timeout: 20_000 })

        const done = page
            .waitForResponse(
                (r) => r.url().includes(P_MODE_PATH) && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            .catch(() => null)
        await page
            .getByRole('alertdialog')
            .filter({ hasText: '変更を適用しますか？' })
            .getByRole('button', { name: /^(Yes|はい)$/ })
            .click()
        await step()
        return await done
    }

    /**
     * Bấm F10 戻る rồi trả lời 「いいえ」. Chờ `POST /tenant/siga/restore` nếu nó bay ra.
     * Trả về HTTP status, hoặc null khi KHÔNG có request nào.
     */
    async function exitWithoutSaving(): Promise<number | null> {
        await closeDialogs(page)
        const restored = page
            .waitForResponse(
                (r) => r.url().includes(RESTORE_PATH) && r.request().method() === 'POST',
                // Dài hơn EAGER_WRITE_DELAY_MS: TC-5 CỐ Ý bắt 「いいえ」 phải đợi
                // request đang bay đáp xong rồi mới đọc cờ.
                { timeout: EAGER_WRITE_DELAY_MS + 25_000 },
            )
            .catch(() => null)

        await page.getByRole('button', { name: /F10\s*戻る/ }).click()

        const gate = page.getByText('処置データは変更されています。保存しますか？')
        await expect(
            gate,
            'Sửa lưới rồi bấm F10 戻る PHẢI bung 「処置データは変更されています。保存しますか？」 ' +
                '(modSave.ExitWithoutSaving:177). Không bung ⇒ hasUnsavedGridEdits() không nhận ra ' +
                'thao tác vừa rồi — đó là một gap KHÁC, ghi lại rồi báo riêng.',
        ).toBeVisible({ timeout: 20_000 })
        await step()

        // BẪY 5 — phải khoanh trong chính hộp thoại.
        await page
            .getByRole('dialog')
            .filter({ hasText: '保存しますか？' })
            .getByRole('button', { name: 'No', exact: true })
            .click()
        await expect(gate, 'bấm No mà hộp thoại không đóng').toBeHidden({ timeout: 15_000 })

        const res = await restored
        console.log(`「いいえ」 → POST ${RESTORE_PATH}: ${res ? res.status() : 'KHÔNG có request nào'}`)
        return res ? res.status() : null
    }

    /** Gỡ handler popup của RIÊNG file này ở `afterAll` — page dùng chung
     *  theo worker nên handler không gỡ sẽ rò sang spec chạy sau. */
    let disposeOverlays: (() => Promise<void>) | undefined

    test.beforeAll(async ({ authedPage }) => {
        sigaRowCreated = await ensureSigaRow(Number(PAT_NO))
        sigaBefore = await readSiga(Number(PAT_NO))
        console.log(
            `siga nguyên trạng của ${PAT_NO} (LƯU LẠI phòng khi test bị kill giữa chừng):\n` +
                `  se = [${sigaBefore?.se.join(',') ?? '?'}]\n` +
                `  sn = [${sigaBefore?.sn.join(',') ?? '?'}]` +
                (sigaRowCreated ? '\n  (dòng siga do test vừa tạo)' : ''),
        )
        const realRows = await countRealTreatmentRowsInMonth(Number(PAT_NO), TRT_DT)
        if (realRows > 0) {
            console.log(
                `ℹ️ tháng của ${TRT_DT} đang có ${realRows} 処置行 THẬT. Spec KHÔNG bấm F9 nên không ` +
                    'ghi lại chúng, nhưng nếu trong đó có 部位病名行 mang Ｐ/Ｇ thì tập Ｐ gom được sẽ ' +
                    'rộng hơn dòng seed — đọc log 「bui FE gửi lên」 của TC-3 trước khi kết luận.',
            )
        }

        page = authedPage
        disposeOverlays = await installOverlayHandlers(page, { santei: true })
        step = makeStep(page)

        // BẪY 1 — kỳ vọng suy ra từ chính request, nên phải bắt body của chúng.
        page.on('request', (req: Request) => {
            if (req.method() !== 'POST') return
            if (req.url().includes(P_MODE_PATH)) {
                try {
                    const body = req.postDataJSON() as { bui?: (number | string)[] }
                    sentPModeBui = (body.bui ?? []).map(Number)
                } catch {
                    sentPModeBui = null
                }
            } else if (req.url().includes(RESTORE_PATH)) {
                restoreCalls++
                try {
                    const body = req.postDataJSON() as {
                        snapshot?: { se?: (number | string)[] }
                    }
                    sentRestoreSe = (body.snapshot?.se ?? []).map(Number)
                } catch {
                    sentRestoreSe = null
                }
            }
        })

        await resetPhase()
    })

    test.afterAll(async () => {
        await page?.unroute(`**${TOOTH_STATUS_PATH}`).catch(() => {})
        await disposeOverlays?.()
        await releaseSharedPage(page)
        const n = await purgeTestRows()
        if (sigaRowCreated) {
            const k = await deleteSigaRow(Number(PAT_NO)).catch(() => 0)
            console.log(`dọn: xoá ${n} dòng seed, xoá ${k} dòng siga do test tạo`)
        } else if (sigaBefore) {
            await ensureSigaRow(Number(PAT_NO)).catch(() => false)
            await restoreSiga(Number(PAT_NO), sigaBefore).catch(() => {})
            console.log(`dọn: xoá ${n} dòng seed, trả siga về nguyên trạng`)
        }
    })

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 1 — (A) Ｐ変更 làm mới PHẦN ĐẦU của pSiga_old
    // ═════════════════════════════════════════════════════════════════════════

    /** 歯式 lúc MỞ MÀN (= ảnh chụp `pSiga_old` mà FE chốt) — toàn 生活歯. */
    let seAtOpen: number[] = []
    /** 歯式 ngay TRƯỚC Ｐ変更 (= thứ WinForm đọc trong Chk_PModeKesson). */
    let seBeforePMode: number[] = []

    test(`TC-1 (mốc) — master có ${EXT_TRT_CD}/${EXT_SB}, dòng Ｐ seed lên lưới, 歯式 xuất phát toàn 生活歯`, async () => {
        const mst = await findMstTrt(TRT_DT, EXT_TRT_CD)
        console.log(
            `mst_trt ${EXT_TRT_CD}: ` +
                (mst.map((r) => `${r.trtSb}=${r.trtNm}`).join(', ') || '(rỗng)'),
        )
        expect(
            mst.find((r) => r.trtSb === EXT_SB),
            `bản master hiệu lực cho ${TRT_DT} không có 枝番 ${EXT_SB} của mã ${EXT_TRT_CD} (抜歯). ` +
                'Không nhập được 抜歯 thì KHÔNG có ghi nóng nào để kiểm — đổi TEST_TRT_DT về tháng ' +
                'còn hiệu lực rồi chạy lại, ĐỪNG đọc spec này là "app thiếu chức năng".',
        ).toBeDefined()

        const footerTen = page.locator('input[data-footer-cell$=":footer-ten"]').last()
        await footerTen.scrollIntoViewIfNeeded().catch(() => {})

        const rows = await gridRows(page)
        console.log(
            `lưới: ${rows.length} dòng mount, 10 dòng CUỐI (部位 | 療法): ` +
                rows
                    .map((r) => `${r.bui || '·'} | ${r.ryo}`)
                    .slice(-10)
                    .join('  /  '),
        )
        const seeded = rows.find((r) => r.ryo === txt(SEED_DIS_TEXT))
        expect(
            seeded,
            `không thấy 部位病名行 có 病名 「${SEED_DIS_TEXT}」 ở ô 療法 — seed hỏng hoặc màn hình ` +
                `đang mở tháng khác (TEST_TRT_DT = ${TRT_DT}).`,
        ).toBeDefined()
        // Ô 部位 phải có nội dung: mapper chỉ dựng 部位病名行 khi bui khác 0, và chính
        // điều kiện đó mới làm `isBuiLineRow` (→ aggregatePGTeeth) nhận ra dòng này.
        expect(
            seeded!.bui,
            'ô 部位 rỗng ⇒ mapper không dựng được 部位病名行 ⇒ Ｐ変更 sẽ không gom được gì',
        ).not.toBe('')
        console.log(`dòng seed: 部位 「${seeded!.bui}」 | 病名 「${seeded!.ryo}」`)

        const s = await mustReadSiga()
        seAtOpen = [...s.se]
        console.log(`歯式 lúc mở màn: se = [${seAtOpen.join(',')}]`)
        expect(
            seAtOpen.filter((v) => v !== SE_VITAL),
            'resetPhase phải ép toàn bộ se_* về 生活歯 — còn ô khác 0 nghĩa là writeSigaTeeth ' +
                'không ăn, và mọi kết luận sau đó lẫn dữ liệu cũ',
        ).toEqual([])
        await step()
    })

    test('TC-2 (mốc) — nhập 抜歯 qua UI: SigaChg ghi 欠損 NGAY, chưa cần F9', async () => {
        // frm203016.IregCodChk → SigaChg (:1030/:1282): 歯式 lên đĩa trước 登録, và
        // CHÍNH lệnh này bật pSiga_chg — cái cờ mà cả TC-4 lẫn TC-5 dựa vào.
        await enterExtractionViaUi()

        const s = await mustReadSiga()
        seBeforePMode = [...s.se]
        console.log(
            `sau khi nhập 抜歯 (chưa F9): ` +
                WATCH_SLOTS.map((slot) => `se_${slot + 1} = ${seOf(s, slot)}`).join(', '),
        )
        const notMarked = WATCH_SLOTS.filter((slot) => seOf(s, slot) !== SE_MISSING)
        expect(
            notMarked.map((slot) => `se_${slot + 1} = ${seOf(s, slot)}`),
            `SigaChg phải ghi ${SE_MISSING} (欠損歯) cho MỌI răng trong 部位 mà dòng 抜歯 thừa kế ` +
                `từ 部位病名行 (ô ${WATCH_SLOTS.join('/')}). Còn ô nào là ${SE_VITAL} nghĩa là hoặc ` +
                'đường ghi nóng không chạy, hoặc dòng mới KHÔNG thừa kế được 部位 (governingBuiOf) — ' +
                'cả hai đều làm TC-4/TC-5 mất ý nghĩa, sửa harness trước.',
        ).toEqual([])
        await step()
    })

    test('TC-3 (mốc) — Ｐ変更 → はい chạy Chk_PModeKesson', async () => {
        const res = await runPModeChange()
        expect(
            res,
            `Trả lời はい ở Q00100 phải chạy ChgBuiForP RỒI Chk_PModeKesson (frm203002.cs:7247-7248) ` +
                `⇒ phải có POST ${P_MODE_PATH}.`,
        ).not.toBeNull()
        expect(res!.status(), `POST ${P_MODE_PATH} phải thành công`).toBeLessThan(400)
        expect(
            sentPModeBui,
            'không đọc được body của request — kỳ vọng của TC-4 suy ra từ nó (BẪY 1)',
        ).not.toBeNull()
        console.log(`bui FE gửi lên: [${sentPModeBui!.join(',')}]`)
        expect(
            sentPModeBui!.some((v) => v !== 0),
            'Tập Ｐ MỚI rỗng ⇒ điểm break rơi về ô đầu tiên không phải 智歯 và vế đối chứng của ' +
                'TC-4 mất nghĩa. F11 全消去 + F3 phải để lại ít nhất một răng.',
        ).toBe(true)
        await step()
    })

    test('TC-4 — 「いいえ」: ô ĐẦU giữ 欠損 theo pSiga_old vừa làm mới, ô SAU điểm break quay về lúc mở màn', async () => {
        // ⛔ Đây là testcase LÕI của (A). Kỳ vọng dựng lại từ frm203002.cs:7455-7466 +
        //    modSave.cs:4700, KHÔNG copy từ code web.
        expect(seAtOpen.length, 'TC-1 chưa chạy được').toBe(32)
        expect(seBeforePMode.length, 'TC-2 chưa chạy được').toBe(32)

        const prefix = pSigaOldPrefixLen(sentPModeBui!, seBeforePMode)
        const expectedSnapshot = Array.from({ length: 32 }, (_, i) =>
            i < prefix ? seBeforePMode[i]! : seAtOpen[i]!,
        )
        console.log(
            `điểm break của Chk_PModeKesson: ${prefix} ô đầu được làm mới\n` +
                `  pSiga_old kỳ vọng = [${expectedSnapshot.join(',')}]`,
        )
        expect(
            prefix,
            'Vòng lặp không thể break ở ô 0 (智歯 bị loại, frm203002.cs:7460) nên phần đầu luôn ' +
                'gồm ít nhất ô 0 — đây chính là ô mang dấu 抜歯 mà TC này đòi giữ lại.',
        ).toBeGreaterThanOrEqual(1)

        const status = await exitWithoutSaving()
        expect(
            status,
            `SigaChg ở TC-2 đã bật pSiga_chg ⇒ 「いいえ」 PHẢI gọi ${RESTORE_PATH} (RestoreData → ` +
                'Restore_SK, modSave.cs:455-463). Không có request nào ⇒ hoặc cờ không được bật, ' +
                'hoặc FE đọc cờ trước khi request ghi nóng kịp đáp (xem TC-5).',
        ).not.toBeNull()
        expect(status!, `POST ${RESTORE_PATH} phải thành công`).toBeLessThan(400)
        expect(restoreCalls, 'một lượt 「いいえ」 chỉ được gửi đúng MỘT request restore').toBe(1)

        // ── vế (a) — ảnh chụp FE gửi lên PHẢI là hàng "lai" ──────────────────
        expect(sentRestoreSe, 'không đọc được `snapshot.se` trong body request restore').not.toBeNull()
        console.log(`pSiga_old FE gửi lên  = [${sentRestoreSe!.join(',')}]`)
        expect(
            sentRestoreSe,
            'Chk_PModeKesson làm mới `pSiga_old` TỚI ĐÚNG ô vừa break (frm203002.cs:7457), phần ' +
                'sau giữ nguyên ảnh chụp lúc mở màn.\n' +
                `  · lệch ở ô < ${prefix} ⇒ phần đầu KHÔNG được làm mới ⇒ dấu 抜歯 sẽ bị 「いいえ」 xoá;\n` +
                `  · lệch ở ô >= ${prefix} ⇒ đã chụp lại QUÁ nhiều (chụp cả 32 ô) ⇒ 「いいえ」 giữ lại ` +
                'cả những 欠損 mà WinForm trả về 健全.',
        ).toEqual(expectedSnapshot)

        // ── vế (b) — DB sau khi restore phải khớp chính ảnh chụp đó ──────────
        const after = await mustReadSiga()
        console.log(`歯式 sau 「いいえ」 = [${after.se.join(',')}]`)
        expect(
            [...after.se],
            'Restore_Siga ghi trả 32 cột SE từ pSiga_old (modSave.cs:4700-4729) ⇒ DB phải bằng ' +
                'ĐÚNG ảnh chụp vừa gửi. Lệch nghĩa là BE không ghi hết cột, hoặc còn lệnh ghi nóng ' +
                'nào đó đáp SAU restore và ghi đè lên.',
        ).toEqual(expectedSnapshot)

        // ── vế (c) — phát biểu người đọc quan tâm, viết thẳng ra ─────────────
        expect(
            seOf(after, WATCH_SLOTS[0]),
            `右上8 (ô ${WATCH_SLOTS[0]}, se_${WATCH_SLOTS[0] + 1}) là 智歯 nên nằm trong phần đầu ` +
                'được làm mới ⇒ 抜歯 → Ｐ変更 → 「いいえ」 phải để răng Ở LẠI 欠損, y như WinForm. ' +
                `Ra ${SE_VITAL} nghĩa là bản port đang giữ nguyên ảnh chụp lúc mở màn và xoá mất ` +
                'dấu 抜歯 người dùng vừa nhập.',
        ).toBe(SE_MISSING)

        const tailSlot = WATCH_SLOTS[2]
        if (tailSlot >= prefix) {
            expect(
                seOf(after, tailSlot),
                `左下7 (ô ${tailSlot}) nằm SAU điểm break (${prefix}) nên KHÔNG được làm mới ⇒ ` +
                    `「いいえ」 phải trả nó về ${SE_VITAL} như lúc mở màn. Ra ${SE_MISSING} nghĩa là ` +
                    'bản port đã chụp lại cả 32 ô — "gọn" hơn WinForm nhưng khác kết quả.',
            ).toBe(SE_VITAL)
        } else {
            console.log(
                `⚠️ ô ${tailSlot} rơi VÀO phần đầu (break = ${prefix}) nên vế đối chứng ` +
                    '「ô sau điểm break phải quay về」 không được kiểm ở lần chạy này. Tập Ｐ mới do ' +
                    'F3 chọn ra rộng bất thường — xem log 「bui FE gửi lên」 của TC-3.',
            )
        }
        await step()
    })

    // ═════════════════════════════════════════════════════════════════════════
    // PHASE 2 — (B) 「いいえ」 phải đợi lệnh ghi nóng đang bay
    // ═════════════════════════════════════════════════════════════════════════

    test('TC-5 — 「いいえ」 bấm khi SigaChg CÒN ĐANG BAY vẫn phải lùi được 歯式', async () => {
        // WinForm gọi SigaChg đồng bộ: tới lúc End bấm được thì `update Siga` đã xong và
        // pSiga_chg đã lên. Web bắn `void` nên có một cửa sổ mà cờ chưa lên — bấm 「いいえ」
        // đúng lúc đó, bản cũ bỏ qua Restore_SK HẲN và răng ở lại 欠損 không đường lùi.
        await resetPhase()

        const s0 = await mustReadSiga()
        expect(
            [...s0.se],
            'resetPhase phải trả 歯式 về toàn 生活歯 trước khi phase 2 bắt đầu',
        ).toEqual(new Array(32).fill(SE_VITAL))

        // BẪY 6 — nhớ unroute (afterAll cũng gọi lần nữa cho chắc).
        await page.route(`**${TOOTH_STATUS_PATH}`, async (route) => {
            await new Promise((r) => setTimeout(r, EAGER_WRITE_DELAY_MS))
            await route.continue()
        })

        try {
            const eagerDone = page
                .waitForResponse(
                    (r) => r.url().includes(TOOTH_STATUS_PATH) && r.request().method() === 'POST',
                    { timeout: EAGER_WRITE_DELAY_MS + 30_000 },
                )
                .catch(() => null)

            // BẪY 7 — ngoại lệ DUY NHẤT: TC này CẦN request còn đang bay.
            await enterExtractionViaUi({ awaitEagerWrite: false })

            // Mốc CÓ THẬT rằng ta đang ở đúng cửa sổ cần thử: request đã bay đi nhưng
            // CHƯA đáp (Rule 7 — không đoán bằng sleep).
            expect(
                await Promise.race([
                    eagerDone.then(() => 'đã đáp' as const),
                    new Promise<'còn bay'>((r) => setTimeout(() => r('còn bay'), 300)),
                ]),
                `SigaChg đã đáp xong trước khi kịp bấm F10 ⇒ TC này không dựng được cửa sổ cần thử. ` +
                    `Tăng EAGER_WRITE_DELAY_MS (đang ${EAGER_WRITE_DELAY_MS}ms).`,
            ).toBe('còn bay')
            await step()

            const status = await exitWithoutSaving()
            expect(
                status,
                `「いいえ」 phải ĐỢI lệnh ghi nóng đang bay đáp xong rồi mới đọc pSiga_chg, nên vẫn ` +
                    `phải có POST ${RESTORE_PATH}. KHÔNG có request nào nghĩa là FE đọc cờ khi nó còn ` +
                    'false: răng vừa 抜歯 ở lại 欠損 vĩnh viễn trong khi 処置行 chưa hề được lưu.',
            ).not.toBeNull()
            expect(status!, `POST ${RESTORE_PATH} phải thành công`).toBeLessThan(400)

            const after = await mustReadSiga()
            console.log(`歯式 sau 「いいえ」 (phase 2) = [${after.se.join(',')}]`)
            expect(
                [...after.se],
                'Không có Ｐ変更 trong phase này ⇒ pSiga_old vẫn nguyên ảnh chụp lúc mở màn ⇒ ' +
                    'Restore_Siga phải trả TOÀN BỘ 歯式 về 生活歯. Còn ô nào là ' +
                    `${SE_MISSING} nghĩa là lệnh ghi nóng đã đáp SAU restore và ghi đè lên ` +
                    '(chiều ngược lại của cùng một cửa sổ).',
            ).toEqual(new Array(32).fill(SE_VITAL))
            await step()
        } finally {
            await page.unroute(`**${TOOTH_STATUS_PATH}`)
        }
    })
})
