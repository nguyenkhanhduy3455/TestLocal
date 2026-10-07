/**
 * MSGTBL parity — chuỗi F9 登録 của màn 患者登録 (`frm201001.F9Proc` +
 * `chkInputDataMain`): 7 mã còn lại của bản audit 2026-09-11.
 *
 * Bổ sung cho `msgtbl-date-insurer-parity.spec.ts` (Q00009 / Q00010 / E00002) —
 * cùng một màn, cùng một cơ chế F9, nhưng ở đây mỗi testcase dựng một trạng thái
 * DB riêng để ép đúng MỘT nhánh của chuỗi validate.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ CHUỖI Ở ĐÂY PHẦN LỚN CHƯA ĐƯỢC VERIFY
 * ═══════════════════════════════════════════════════════════════════════════
 * Bảng MSGTBL thật không có trong repo. 7 mã dưới đây đều nằm trong danh sách
 * `UNVERIFIED` của `_shared/msgtbl.ts`: spec assert chuỗi app ĐANG render (lưới
 * chặn hồi quy), và `expectMsg` in ra chuỗi mà audit nói mới là chuỗi DB. **Test
 * xanh KHÔNG có nghĩa là chữ đúng.** Xem doc-comment của `_shared/msgtbl.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHỒNG LẤN CÓ CHỦ Ý: E00022
 * ═══════════════════════════════════════════════════════════════════════════
 * `cross-cutting/report-text-length-guard.spec.ts:272` đã assert E00022 với tham
 * số của nó, nhưng ở một luồng khác (giới hạn byte của ô nhập trên báo cáo). Ở
 * đây là nhánh 記号 của `validateRegisterMed` — cùng mã, khác chỗ phát. Giữ cả
 * hai: mã này nhận tham số nên mỗi chỗ gọi là một khả năng chép sai riêng.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FACT — điều kiện kích hoạt, lấy từ wizard-validation.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * F9 chạy `validateRegisterMed` TRƯỚC, rồi `validateRegisterMain`
 * (patient-detail-form.tsx:952-953). Lỗi thì dừng ngay ở lỗi ĐẦU TIÊN; confirm
 * thì xếp hàng, người dùng từ chối cái nào là dừng cái đó.
 *
 *  - E00010 (:479) — 氏名（漢字） không có dấu cách ngăn họ/tên.
 *      `hasFamilyGivenSeparator` (:63) nhận cả '　' lẫn ' ', và phải nằm SAU ký tự
 *      đầu (`indexOf > 0`).
 *  - E00012 (:482) — `byteLength(patNm) > 100`. Toàn giác = 2 byte
 *      (char-width.ts:24) ⇒ 51 ký tự toàn giác = 102 byte. Cột
 *      `insurance.pat_nm` là varchar(100) KÝ TỰ nên 51 ký tự vẫn lọt.
 *      E00010 kiểm TRƯỚC ⇒ tên dài vẫn phải có dấu cách.
 *  - E00016 (:658) — `age2 < 16` + ins_kbn=1 (社保) + fm_type=1 (本人).
 *  - E00017 (:663) — như trên nhưng ins_kbn ∈ {8,9} (社退/国退).
 *      `age2` = tuổi tính tới 1/4 sắp tới (getAge2, :291).
 *  - Q00012 (:680) — `age >= 75`, ins_kbn ≠ 6 (自費), không phải 公・単+生保後期,
 *      và 保険者番号 KHÔNG phải 8 số bắt đầu "39".
 *  - Q00013 (:691) — `age3 >= 70` (tuổi tính tới ngày 1 của tháng, :300) và
 *      old_flg ∉ {1,3,4,5}.
 *  - Q00014 (:456) — thuộc `validateRegisterMed`: 有効期限 < hôm nay.
 *      Nhánh này chỉ chạy khi `isChkMed` (:306) true — tức phải có ít nhất một ô
 *      của 医療保険情報 khác rỗng. `fm_type` KHÔNG nằm trong danh sách của
 *      `isChkMed`, nên đặt riêng fm_type (cho E00016/E00017) vẫn giữ
 *      `validateRegisterMed` ở trạng thái no-op — đúng điều ta muốn.
 *      Khi đã bật isChkMed thì 資格取得日 thành bắt buộc (:425), nên test Q00014
 *      phải đặt cả ins_qual_dt.
 *
 * Thứ tự confirm trong `validateRegisterMain`: 診療開始日 → 患者情報有効日 →
 * nhóm tuổi. Vì vậy MỌI testcase đều điền sẵn `med_st_dt` + `br_dt`, nếu không
 * Q00009/Q00010 sẽ chen lên trước và che mất thứ đang đo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DỮ LIỆU — tự dựng, tự dọn
 * ═══════════════════════════════════════════════════════════════════════════
 * Mỗi TC gọi `resetPatient()`: xoá sạch rồi seed lại bệnh nhân với đúng ngày
 * sinh / tên / 保険種別 / 医療保険情報 mà nhánh đó cần.
 *
 * ⚠️ `deleteTestPatient` của `_shared/db` KHÔNG đụng tới `med_ins_inf`, nên spec
 * tự dọn bảng đó — cả trước mỗi lần seed lẫn ở `afterAll`.
 *
 * ⚠️ Testcase NỐI TIẾP trạng thái (`mode: 'serial'`): chạy lẻ một TC ở giữa vẫn
 * được vì mỗi TC tự dựng DB, nhưng thiếu `beforeAll` thì không có PAT_NO. Một TC
 * đỏ ⇒ các TC sau bị skip. Page lấy từ `authedPage` ⇒ không có trace/video.
 */
import { type Page } from '@playwright/test'

import {
    SEED_PAT_NO_BASE,
    dbEnabled,
    deleteTestPatient,
    seedTestPatient,
    withDb,
} from '../_shared/db'
import { openPatientRegistration, patientFieldInput } from '../_shared/entry'
import { patNo } from '../_shared/env'
import {
    MSG,
    closeDialog,
    expectMsg,
    expectSeverity,
    nextDialogText,
    topDialog,
} from '../_shared/msgtbl'
import { expect, releaseSharedPage, test } from '../_shared/session'
import { makeStep, skipWithReason } from '../_shared/step'

/**
 * Chia theo worker để `--repeat-each` (Rule 16) và suite 4 worker không giật
 * bệnh nhân của nhau. 71 + workerIndex ⇒ 990071-990074, chưa offset nào đụng
 * (`grep -rn "SEED_PAT_NO_BASE +" tests/`).
 */
const PAT_NO_OFFSET = 71
let PAT_NO = ''

/** Hằng số nghiệp vụ — tên theo đúng hằng trong wizard-validation.ts. */
const KOUKI_KOUREI = 75
const ZENKI_KOUREI = 70
const INS_KBN_SHAHO = 1
const INS_KBN_SHAHO_TAISHOKU = 8
const FM_TYPE_HONNIN = 1
const OLD_FLG_NONE = 0

/** 氏名（漢字） mặc định — CÓ dấu cách toàn giác nên qua được E00010. */
const NAME_OK = 'イーツーイー　患者'
const NAME_KN = 'いーつーいー　かんじゃ'
/** Không có dấu cách ⇒ E00010. */
const NAME_NO_SPACE = 'イーツーイー患者'
/** 25 + 1 + 25 = 51 ký tự toàn giác = 102 byte > 100 ⇒ E00012 (vẫn có dấu cách). */
const NAME_TOO_LONG = `${'あ'.repeat(25)}　${'い'.repeat(25)}`
/**
 * 記号 quá dài — 60 ký tự toàn giác = 120 byte > 80 ⇒ E00022「記号」.
 * Cột `med_ins_inf.ins_mk` là varchar(80) KÝ TỰ nên 60 ký tự vẫn lọt.
 */
const INS_MK_TOO_LONG = 'カ'.repeat(60)

const DIALOG_TIMEOUT = 30_000

/** Ngày ISO của mốc "n năm trước", lùi thêm 30 ngày cho khỏi sát ngày sinh nhật. */
function isoYearsAgo(years: number): string {
    const d = new Date()
    d.setFullYear(d.getFullYear() - years)
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
}

/** Ngày ISO của hôm qua — dùng cho 有効期限 đã quá hạn. */
function isoYesterday(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
}

// ═════════════════════════════════════════════════════════════════════════════

skipWithReason(
    !dbEnabled,
    'Cần TEST_DB=1: mỗi testcase dựng một trạng thái 保険 / 生年月日 riêng, ' +
        'không màn hình nào đặt được hết bằng thao tác tay trong thời gian hợp lý',
)

test.describe.configure({ mode: 'serial', retries: 0, timeout: 300_000 })

test.describe('MSGTBL parity — F9 登録 màn 患者登録 (7 mã còn lại của audit)', () => {
    let page: Page
    let step: () => Promise<void>

    test.beforeAll(async ({ authedPage }, testInfo) => {
        page = authedPage
        step = makeStep(page)
        PAT_NO = patNo(String(SEED_PAT_NO_BASE + PAT_NO_OFFSET + testInfo.workerIndex))
        if (Number(PAT_NO) < SEED_PAT_NO_BASE) {
            throw new Error(
                `TEST_PAT_NO=${PAT_NO} ngoài dải seed — spec này ghi đè 生年月日/保険 ` +
                    'nên chỉ chạy trên bệnh nhân seed.',
            )
        }
        console.log(`worker #${testInfo.workerIndex} dùng bệnh nhân ${PAT_NO}`)
    })

    test.afterAll(async () => {
        await page.goto('/treatments', { waitUntil: 'domcontentloaded' }).catch(() => undefined)
        await clearMedIns()
        await deleteTestPatient(Number(PAT_NO))
        await releaseSharedPage(page)
    })

    // ── Dựng dữ liệu ────────────────────────────────────────────────────────

    async function clearMedIns(): Promise<void> {
        await withDb(async (c) => {
            await c.query('DELETE FROM med_ins_inf WHERE pat_no = $1', [Number(PAT_NO)])
        }).catch(() => undefined)
    }

    interface PatientState {
        /** Mặc định 1980-01-01 (≈45 tuổi — không chạm nhánh tuổi nào). */
        birthDt?: string
        patNm?: string
        insKbn?: number
        oldFlg?: number
        /** Đặt `fm_type` ⇒ cần một dòng med_ins_inf. */
        fmType?: number
        /** Bật isChkMed ⇒ validateRegisterMed chạy thật. Phải kèm insQualDt. */
        insQualDt?: string
        insExpDt?: string
        /** 記号 — cũng bật isChkMed. Quá 80 byte ⇒ E00022. */
        insMk?: string
    }

    /**
     * Xoá sạch rồi dựng lại bệnh nhân đúng trạng thái cần.
     *
     * `med_st_dt` / `br_dt` LUÔN được điền (mặc định = ngày sinh + 1 ngày) để
     * Q00009/Q00010 không chen lên trước nhánh đang đo. Không dùng ngày cố định
     * vì `br_dt` phải >= 生年月日, mà ngày sinh thì mỗi testcase một khác.
     */
    async function resetPatient(s: PatientState = {}): Promise<void> {
        const birthDt = s.birthDt ?? '1980-01-01'
        await clearMedIns()
        await seedTestPatient({
            patNo: Number(PAT_NO),
            patNm: s.patNm ?? NAME_OK,
            patKn: NAME_KN,
            birthDt,
        })

        const afterBirth = new Date(birthDt)
        afterBirth.setDate(afterBirth.getDate() + 1)
        const activeDt = afterBirth.toISOString().slice(0, 10)
        const needMedIns =
            s.fmType !== undefined || s.insQualDt !== undefined || s.insMk !== undefined

        await withDb(async (c) => {
            await c.query(
                `UPDATE insurance
                    SET ins_kbn = $2, old_flg = $3,
                        med_st_dt = $4::date, br_dt = $4::date,
                        medinsinf_no = $5
                  WHERE pat_no = $1`,
                [
                    Number(PAT_NO),
                    s.insKbn ?? INS_KBN_SHAHO,
                    s.oldFlg ?? OLD_FLG_NONE,
                    activeDt,
                    needMedIns ? 1 : 0,
                ],
            )
            if (needMedIns) {
                await c.query(
                    `INSERT INTO med_ins_inf
                         (pat_no, medinsinf_no, fm_type, ins_qual_dt, ins_exp_dt, ins_mk)
                     VALUES ($1, 1, $2, $3::date, $4::date, $5)`,
                    [
                        Number(PAT_NO),
                        s.fmType ?? null,
                        s.insQualDt ?? null,
                        s.insExpDt ?? null,
                        s.insMk ?? null,
                    ],
                )
            }
        })
    }

    // ── Điều khiển màn hình ─────────────────────────────────────────────────

    async function openDetail(): Promise<void> {
        await openPatientRegistration(page, PAT_NO)
        await step()
    }

    /**
     * F9 登録 + nuốt cổng chặn.
     *
     * FACT patient-detail-form.tsx:853 — form chưa "bẩn" thì F9 BỎ QUA toàn bộ
     * chuỗi validate. FACT :1534 — F9 đi qua `handleExit`, form bẩn thì hỏi
     * 「患者データは変更されています。保存しますか？」 trước. Cả hai chuỗi này là
     * literal của bản port (không có mã MSGTBL) nên spec chỉ đi xuyên qua.
     */
    const SAVE_GATES = ['患者データは変更されています', '患者データは、変更されていません']

    async function dirtyThenF9(): Promise<void> {
        const tel = patientFieldInput(page, '電話番号')
        await tel.fill('090-0000-0002')
        await tel.blur()
        await step()

        await page.keyboard.press('F9')
        await step()

        const dlg = topDialog(page)
        if (await dlg.isVisible().catch(() => false)) {
            const text = ((await dlg.innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
            if (SAVE_GATES.some((g) => text.includes(g))) {
                await dlg.getByRole('button', { name: /^(はい|Yes|OK)$/ }).first().click()
                await step()
            }
        }
    }

    /** Dựng trạng thái → mở màn → F9 → trả text hộp thoại đầu tiên. */
    async function f9Message(state: PatientState, what: string): Promise<string> {
        await resetPatient(state)
        await openDetail()
        await dirtyThenF9()
        return nextDialogText(page, what, DIALOG_TIMEOUT)
    }

    /**
     * Đóng hộp thoại.
     *
     * Lỗi (`alertDialog`) chỉ có OK. Confirm có 2-3 nút — phải bấm TỪ CHỐI, vì
     * đồng ý là F9 đi tiếp và có thể GHI DB thật.
     */
    async function dismiss(kind: 'error' | 'confirm', what: string): Promise<void> {
        // Icon phải khớp CHỖ GỌI bên WinForm, không suy ra từ mã (xem
        // `_shared/msgtbl.ts`). Ở nhánh này legacy dùng `ShowErrorMsg` cho mọi mã
        // E00010/E00012/E00016/E00017/E00022, và `Show*CancelMsg`
        // (MessageBoxIcon.Question) cho Q00012/Q00013/Q00014.
        await expectSeverity(
            page,
            kind,
            `${what}: legacy dùng ${kind === 'error' ? 'ShowErrorMsg (✕ đỏ)' : 'Show*CancelMsg (？ hỏi)'}`,
        )
        if (kind === 'error') {
            await closeDialog(page, what, DIALOG_TIMEOUT)
            return
        }
        await topDialog(page)
            .getByRole('button', { name: /^(いいえ|No|キャンセル|Cancel)$/ })
            .first()
            .click()
        await expect(topDialog(page), `từ chối ${what} rồi mà hộp thoại vẫn còn`).toBeHidden({
            timeout: DIALOG_TIMEOUT,
        })
    }

    // ── E00010 / E00012 — 氏名（漢字） ───────────────────────────────────────

    test('E00010 — 氏名（漢字） không có dấu cách ngăn họ/tên', async () => {
        const text = await f9Message({ patNm: NAME_NO_SPACE }, 'E00010')
        expectMsg(text, 'E00010', MSG.E00010(), 'tên không có dấu cách phải dừng F9 ở E00010')
        await dismiss('error', 'E00010')
    })

    test('E00012 — 氏名（漢字） vượt 100 byte', async () => {
        // Có dấu cách nên qua được E00010, dài 102 byte nên rơi vào E00012.
        const text = await f9Message({ patNm: NAME_TOO_LONG }, 'E00012')
        expectMsg(text, 'E00012', MSG.E00012(), 'tên 102 byte phải dừng F9 ở E00012')
        await dismiss('error', 'E00012')
    })

    // ── E00016 / E00017 — dưới 16 tuổi + 本人 ───────────────────────────────

    test('E00016 — dưới 16 tuổi + 社保 + 本人', async () => {
        const text = await f9Message(
            { birthDt: isoYearsAgo(10), insKbn: INS_KBN_SHAHO, fmType: FM_TYPE_HONNIN },
            'E00016',
        )
        expectMsg(text, 'E00016', MSG.E00016(), '10 tuổi + 社保 + 本人 phải dừng ở E00016')
        await dismiss('error', 'E00016')
    })

    test('E00017 — dưới 16 tuổi + 社退 + 本人', async () => {
        const text = await f9Message(
            { birthDt: isoYearsAgo(10), insKbn: INS_KBN_SHAHO_TAISHOKU, fmType: FM_TYPE_HONNIN },
            'E00017',
        )
        expectMsg(text, 'E00017', MSG.E00017(), '10 tuổi + 社退 + 本人 phải dừng ở E00017')
        await dismiss('error', 'E00017')
    })

    // ── Q00012 / Q00013 — nhóm cao tuổi ─────────────────────────────────────

    test('Q00012 — từ 75 tuổi mà chưa có 保険者番号 hậu kỳ cao tuổi', async () => {
        const text = await f9Message({ birthDt: isoYearsAgo(80) }, 'Q00012')
        expectMsg(
            text,
            'Q00012',
            MSG.Q00012(KOUKI_KOUREI),
            '80 tuổi, không phải 生保後期高齢者, 保険者番号 không bắt đầu "39" ⇒ phải hỏi Q00012',
        )
        await dismiss('confirm', 'Q00012')
    })

    test('Q00013 — từ 70 tới dưới 75 tuổi mà chưa chỉ định 高齢者', async () => {
        const text = await f9Message(
            { birthDt: isoYearsAgo(72), oldFlg: OLD_FLG_NONE },
            'Q00013',
        )
        expectMsg(
            text,
            'Q00013',
            MSG.Q00013(ZENKI_KOUREI),
            '72 tuổi + old_flg=0 ⇒ phải hỏi Q00013, KHÔNG phải Q00012',
        )
        await dismiss('confirm', 'Q00013')
    })

    // ── E00022 — 記号 quá dài ───────────────────────────────────────────────

    test('E00022 — 記号 của 医療保険 vượt 80 byte', async () => {
        // FACT wizard-validation.ts:440 — `byteLength(medins.insMk) > 80` là check
        // E00022 ĐẦU TIÊN trong validateRegisterMed, nằm sau 資格取得日/有効期限.
        // Đây là mã NHẬN THAM SỐ: tên trường do chỗ gọi truyền vào, nên assert
        // luôn cả tham số 「記号」 chứ không chỉ phần đuôi câu.
        const text = await f9Message(
            { insQualDt: '2000-01-01', insMk: INS_MK_TOO_LONG },
            'E00022 記号',
        )
        expectMsg(text, 'E00022', MSG.E00022('記号'), '記号 120 byte phải dừng F9 ở E00022')
        await dismiss('error', 'E00022')
    })

    // ── Q00014 — 有効期限 quá hạn ───────────────────────────────────────────

    test('Q00014 — 有効期限 của 医療保険 đã quá hạn', async () => {
        // Ngày sinh 1980 ⇒ ~45 tuổi, không chạm nhánh tuổi nào, nên Q00014 của
        // validateRegisterMed (chạy TRƯỚC validateRegisterMain) là confirm đầu tiên.
        // Phải có 資格取得日, vì isChkMed bật lên là 資格取得日 thành bắt buộc.
        const text = await f9Message(
            { insQualDt: '2000-01-01', insExpDt: isoYesterday() },
            'Q00014',
        )
        expectMsg(text, 'Q00014', MSG.Q00014(), '有効期限 hôm qua ⇒ phải hỏi Q00014')
        await dismiss('confirm', 'Q00014')
    })
})
